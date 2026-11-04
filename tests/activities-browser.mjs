// Public browser contract: every former game is a native activity reached from
// the live zombie world. Teleporting to a station is the only gameplay fixture.
// Wins use real pointer input; simulation, health, scores and results are never set.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { ACTIVITIES } from '../activities/catalog.js';
import { arcadeGames } from '../arcade/catalog.js';

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const selected = option('activity'), group = option('group');
const legacyIds = ['moonbounce', 'popwake', 'pondpost', 'ribbon', 'dewfall'];
const selectedIds = selected ? selected.split(',') : group === 'legacy' ? legacyIds : group === 'arcade' ? arcadeGames.map(game => game.id) : ACTIVITIES.map(game => game.id);
for (const id of selectedIds) assert.ok(ACTIVITIES.some(activity => activity.id === id), `Unknown activity: ${id}`);
const specs = [{ name: 'desktop', width: 1280, height: 800, touch: false }, { name: 'phone', width: 390, height: 844, touch: true }]
  .filter(spec => !process.argv.includes('--phone-only') || spec.touch)
  .filter(spec => !process.argv.includes('--desktop-only') || !spec.touch);
const port = 5281, base = process.env.GAMES_TEST_URL || `http://127.0.0.1:${port}`;
const errors = [], output = 'test-results/activities';
let server, browser, currentPage;

function monitor(page, name) {
  page.on('pageerror', error => errors.push(`${name}: ${error.stack || error.message}`));
  page.on('console', event => { if (event.type() === 'error') errors.push(`${name}: ${event.text()}`); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${name}: ${response.status()} ${response.url()}`); });
}
async function installProbe(context) {
  // Record a newly created controller before its first simulation frame. This
  // observes exact reloads without pausing/rewinding the game to force equality.
  await context.addInitScript(() => {
    window.__activityProbe = { instances: [], returns: [] };
    const seen = new WeakSet(), request = window.requestAnimationFrame.bind(window);
    const readSurvival = () => {
      const g = window.__game;
      return g ? { position: [...g.pos], hp: g.hp, wave: g.wave, time: g.time, seconds: g.combat.seconds, score: g.score, armor: g.progression.shield } : null;
    };
    window.requestAnimationFrame = callback => request(time => {
      const host = window.__game?.activities?.host, controller = host?.controller;
      if (controller && !seen.has(controller) && host.phase === 'playing') {
        seen.add(controller);
        const record = { id: host.current.id, snapshot: controller.snapshot(), disposals: 0 };
        window.__activityProbe.instances.push(record);
        const dispose = controller.dispose.bind(controller);
        controller.dispose = (...args) => { record.disposals++; return dispose(...args); };
      }
      callback(time);
    });
    addEventListener('DOMContentLoaded', () => {
      let wasOpen = false;
      new MutationObserver(() => {
        const open = document.body.classList.contains('activity-open');
        if (wasOpen && !open) window.__activityProbe.returns.push(readSurvival());
        wasOpen = open;
      }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    });
  });
}
async function ready(page) {
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && window.__game?.activities?.host, null, { timeout: 90000 });
}
async function start(page, spec, path = 'soldier.html?debug=1&q=low') {
  await page.goto(`${base}/${path}`); await ready(page);
  if (await page.locator('#startBtn').isVisible()) {
    if (spec.touch) await page.locator('#startBtn').tap(); else await page.locator('#startBtn').click();
    await page.waitForFunction(() => __game.mode === 'intro' || __game.mode === 'play');
    if (await page.evaluate(() => __game.mode === 'intro')) {
      if (spec.touch) await page.locator('#skipBtn').tap(); else await page.keyboard.press('Space');
    }
  }
  await page.waitForFunction(() => __game.mode === 'play' && !__game.paused, null, { timeout: 60000 });
}
async function press(locator, spec) { if (spec.touch) await locator.tap(); else await locator.click(); }
async function goToStation(page, id) {
  await page.evaluate(id => { const station = __game.activities.world.stations.find(station => station.id === id); if (!station) throw Error(`No station for ${id}`); __game.setPos(station.x, station.z); }, id);
  await page.waitForFunction(id => !document.querySelector('#activityInteract').hidden && document.querySelector('#activityInteract').textContent.includes(__game.activities.world.stations.find(s => s.id === id)?.title || ''), id);
}
async function open(page, spec, id, { stage } = {}) {
  await goToStation(page, id);
  if (spec.touch) await page.locator('#activityInteract').tap(); else await page.keyboard.press('KeyE');
  await page.waitForFunction(id => __game.activities.host.phase === 'brief' && __game.activities.host.current?.id === id, id);
  assert.equal(await page.locator('iframe').count(), 0, `${id}: native activity, no iframe`);
  if (stage) await page.getByRole('combobox', { name: 'Activity stage' }).selectOption(String(stage));
  const before = await page.evaluate(() => __activityProbe.instances.length);
  await press(page.locator('#activityCard .primary'), spec);
  await page.waitForFunction(({ id, before }) => __game.activities.host.phase === 'playing' && __game.activities.host.current?.id === id && __activityProbe.instances.length > before, { id, before }, { timeout: 60000 });
  assert.equal(await page.locator('#activityStage canvas').count(), 1, `${id}: one activity renderer`);
  assert.ok(new URL(page.url()).pathname.endsWith('/soldier.html'), `${id}: remains in the zombie page`);
  return before;
}
async function survival(page) {
  return page.evaluate(() => ({ position: [...__game.pos], hp: __game.hp, wave: __game.wave, time: __game.time, seconds: __game.combat.seconds, score: __game.score, armor: __game.progression.shield }));
}
async function close(page, spec, expected, instance) {
  const before = await page.evaluate(() => __activityProbe.returns.length);
  await press(page.locator('#activityLeave'), spec);
  await page.waitForFunction(before => !__game.activities.host.active && __activityProbe.returns.length > before, before);
  assert.deepEqual(await page.evaluate(() => __activityProbe.returns.at(-1)), expected, 'return preserves the exact live survival state');
  assert.equal(await page.locator('#activityStage canvas').count(), 0, 'return removes the activity renderer');
  assert.equal(await page.evaluate(index => __activityProbe.instances[index].disposals, instance), 1, 'return disposes the controller once');
}
async function touch(cdp, type, point) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [{ ...point, id: 1 }] : [] });
}
async function input(page, spec, cdp, id) {
  if (id === 'upside') {
    const initial = await page.evaluate(() => ({ ...__game.activities.host.controller.engine.state.player }));
    if (spec.touch) {
      const box = await page.getByRole('button', { name: 'Move right', exact: true }).boundingBox();
      await touch(cdp, 'touchStart', { x: box.x + box.width / 2, y: box.y + box.height / 2 });
      await page.waitForFunction(x => __game.activities.host.controller.engine.state.player.x > x + .4, initial.x);
      await touch(cdp, 'touchEnd');
      const jump = await page.getByRole('button', { name: 'Jump', exact: true }).boundingBox();
      await touch(cdp, 'touchStart', { x: jump.x + jump.width / 2, y: jump.y + jump.height / 2 });
      await page.waitForFunction(y => __game.activities.host.controller.engine.state.player.y < y - .2, initial.y);
      await touch(cdp, 'touchEnd');
      await page.getByRole('button', { name: 'Flip', exact: true }).tap();
    } else {
      await page.keyboard.down('ArrowRight');
      await page.waitForFunction(x => __game.activities.host.controller.engine.state.player.x > x + .4, initial.x);
      await page.keyboard.up('ArrowRight'); await page.keyboard.down('Space');
      await page.waitForFunction(y => __game.activities.host.controller.engine.state.player.y < y - .2, initial.y);
      await page.keyboard.up('Space'); await page.keyboard.down('ArrowUp');
    }
    await page.waitForFunction(g => __game.activities.host.controller.engine.state.player.g === -g, initial.g);
    if (!spec.touch) await page.keyboard.up('ArrowUp');
    assert.ok(await page.evaluate(() => __game.activities.host.controller.engine.state.player.flips > 0), 'Nib runs, jumps, and flips through native controls');
    return;
  }
  const box = await page.locator('#activityStage').boundingBox();
  // Cancelled gestures still exercise the real input path without accidentally
  // solving a one-turn puzzle before the deliberate reward check below.
  const point = { x: box.x + box.width * .42, y: box.y + box.height * .44 };
  if (spec.touch) {
    await touch(cdp, 'touchStart', point); await touch(cdp, 'touchMove', { x: point.x + 12, y: point.y + 12 }); await touch(cdp, 'touchCancel');
  } else {
    await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x + 12, point.y + 12);
    await page.locator('#activityStage').dispatchEvent('pointercancel', { pointerId: 1, clientX: point.x + 12, clientY: point.y + 12 });
    await page.mouse.up();
  }
}
async function layout(page, spec, id) {
  const geometry = await page.evaluate(() => {
    const stage = document.querySelector('#activityStage').getBoundingClientRect();
    const buttons = [...document.querySelectorAll('#activityShell button')].filter(node => node.getClientRects().length).map(node => { const r = node.getBoundingClientRect(); return { name: node.textContent, x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; });
    return { width: stage.width, height: stage.height, overflow: document.documentElement.scrollWidth > innerWidth + 1, buttons };
  });
  assert.ok(geometry.width >= 280 && geometry.height >= 150, `${id}: playable scene ${JSON.stringify(geometry)}`);
  assert.equal(geometry.overflow, false, `${id}: no horizontal overflow`);
  for (const button of geometry.buttons) {
    assert.ok(button.x >= -1 && button.y >= -1 && button.right <= spec.width + 1 && button.bottom <= spec.height + 1, `${id}: controls stay onscreen ${JSON.stringify(button)}`);
    if (spec.touch) assert.ok(button.w >= 43 && button.h >= 43, `${id}: touch target ${JSON.stringify(button)}`);
  }
}
async function walkFromSpawn(page, spec, cdp) {
  const initial = await page.evaluate(() => ({ pos: [...__game.pos], target: __game.activities.progress.target }));
  if (spec.touch) {
    const stick = await page.locator('#stick').boundingBox(), center = { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 };
    await touch(cdp, 'touchStart', center);
    await touch(cdp, 'touchMove', { x: center.x, y: center.y - stick.height * .35 });
  } else await page.keyboard.down('KeyW');
  try {
    await page.waitForFunction(({ pos }) => !document.querySelector('#activityInteract').hidden && Math.hypot(__game.pos[0] - pos[0], __game.pos[2] - pos[2]) > .4, initial, { timeout: 15000 });
  } finally { if (spec.touch) await touch(cdp, 'touchEnd'); else await page.keyboard.up('KeyW'); }
  const reached = await page.evaluate(() => __game.activities.world.nearest(__game.player.position, 3.8)?.id);
  assert.equal(reached, initial.target, 'walking forward from deployment discovers the tracked outpost');
  await page.screenshot({ path: `${output}/${spec.name}-world.png`, fullPage: true });
  if (spec.touch) await page.locator('#activityInteract').tap(); else await page.keyboard.press('KeyE');
  await page.waitForFunction(id => __game.activities.host.phase === 'brief' && __game.activities.host.current?.id === id, reached);
  const frozen = await survival(page);
  await page.screenshot({ path: `${output}/${spec.name}-first-discovery.png`, fullPage: true });
  await press(page.locator('#activityLeave'), spec);
  await page.waitForFunction(() => !__game.activities.host.active);
  assert.deepEqual(await page.evaluate(() => __activityProbe.returns.at(-1)), frozen, 'first discovered outpost returns to the walked-to position');
  console.log(`${spec.name}: first outpost discovered by walking from deployment and interacting, with no teleport fixture.`);
}
async function mapCheck(page, spec) {
  if (spec.touch) await page.locator('#expeditionJournal').tap(); else await page.keyboard.press('Tab');
  await page.waitForFunction(() => __game.activities.host.phase === 'journal');
  assert.equal(await page.locator('.expedition-entry').count(), 30);
  const before = await survival(page), instanceCount = await page.evaluate(() => __activityProbe.instances.length);
  await page.screenshot({ path: `${output}/${spec.name}-map.png`, fullPage: true });
  await press(page.locator('.expedition-entry').filter({ has: page.locator('strong', { hasText: 'Upside Nib' }) }), spec);
  assert.equal(await page.evaluate(() => __game.activities.progress.target), 'upside');
  assert.equal(await page.evaluate(() => __game.activities.host.active), false, 'map selection sets a waypoint instead of launching');
  assert.equal(await page.evaluate(() => __activityProbe.instances.length), instanceCount);
  assert.deepEqual(await page.evaluate(() => __activityProbe.returns.at(-1)), before, 'choosing a waypoint preserves survival state');
  assert.equal(await page.evaluate(() => {
    const { host, world } = __game.activities, [x, , z] = __game.pos;
    const farthest = [...world.stations].sort((a, b) => Math.hypot(b.x - x, b.z - z) - Math.hypot(a.x - x, a.z - z))[0];
    return host.open(farthest.id);
  }), false, 'distant activities require walking to their station');
}
async function solvePrism(page, spec, cdp) {
  // Camera matrices become current at the first native render after an async
  // restart. Wait for paint before projecting a real screen-space tap.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const targets = await page.evaluate(() => { const engine = __game.activities.host.controller.engine; return engine.level.pieces.map((piece, index) => piece.solution !== undefined && piece.solution !== engine.state.orientations[index] ? index : null).filter(index => index !== null); });
  for (const index of targets) {
    const p = await page.evaluate(index => { const controller = __game.activities.host.controller, piece = controller.engine.level.pieces[index]; return controller.project(piece.x, piece.z); }, index);
    if (spec.touch) { await touch(cdp, 'touchStart', p); await touch(cdp, 'touchEnd'); } else await page.mouse.click(p.x, p.y);
  }
  await page.waitForFunction(() => __game.activities.host.phase === 'won');
}
async function rewardCheck(page, spec, cdp) {
  await open(page, spec, 'prism', { stage: 1 });
  const before = await survival(page), completedBefore = await page.evaluate(() => __game.activities.progress.completed.includes('prism'));
  assert.equal(completedBefore, false, 'Prism reward begins unearned');
  await solvePrism(page, spec, cdp);
  const won = await survival(page);
  assert.equal(won.score, before.score + 300, 'first real puzzle win grants score');
  assert.equal(won.hp, Math.min(100, before.hp + 20), 'first real puzzle win grants health');
  assert.equal(won.armor, Math.min(60, before.armor + 10), 'first real puzzle win grants armor');
  assert.deepEqual(won.position, before.position); assert.equal(won.time, before.time); assert.equal(won.wave, before.wave);
  await page.waitForTimeout(250); assert.deepEqual(await survival(page), won, 'completion screen never repeats its reward');
  await page.screenshot({ path: `${output}/${spec.name}-restored.png`, fullPage: true });
  await press(page.getByRole('button', { name: 'Replay stage', exact: true }), spec);
  await page.waitForFunction(() => __game.activities.host.phase === 'playing'); await solvePrism(page, spec, cdp);
  assert.deepEqual(await survival(page), won, 'replaying a restored outpost never farms rewards');
  assert.equal(await page.evaluate(() => __game.activities.progress.plays.prism), 2);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('games:zombie:expedition:v1')));
  assert.ok(stored.completed.includes('prism')); assert.equal(stored.plays.prism, 2);
  await press(page.locator('#activityLeave'), spec); await page.reload(); await ready(page);
  assert.equal(await page.evaluate(() => __game.activities.progress.completed.filter(id => id === 'prism').length), 1, 'earned restoration survives reload once');
  assert.equal(await page.evaluate(() => __game.activities.progress.plays.prism), 2);
}

async function upsidePreservationCheck(page, spec) {
  let instance = await open(page, spec, 'upside', { stage: 1 });
  const frozen = await survival(page);
  const state = () => page.evaluate(() => {
    const s = __game.activities.host.controller.engine.state;
    return { assist: s.assist, lives: s.lives, time: s.t, x: s.player.x, y: s.player.y, g: s.player.g, vx: s.player.vx };
  });
  const paint = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const pause = async () => { await page.locator('#activityPause').click(); await page.waitForFunction(() => __game.activities.host.phase === 'paused'); };
  const restart = async () => {
    const next = await page.evaluate(() => __activityProbe.instances.length);
    await page.getByRole('button', { name: 'Restart stage', exact: true }).click();
    await page.waitForFunction(next => __game.activities.host.phase === 'playing' && __activityProbe.instances.length > next, next);
    instance = next;
  };

  // All preference changes and retries use the real pause menu. They never
  // mutate engine state or fabricate a completed run/profile record.
  await pause(); const classic = await state(); assert.equal(classic.assist, false);
  await page.getByRole('button', { name: 'Retry checkpoint · uses one life', exact: true }).click();
  await page.waitForFunction(() => __game.activities.host.phase === 'playing');
  assert.equal((await state()).lives, classic.lives - 1, 'Classic checkpoint retry spends exactly one life and resumes');
  await pause();
  await page.getByRole('button', { name: 'Assist next restart: Off', exact: true }).click();
  assert.equal((await state()).assist, false, 'changing the preference preserves the current Classic run');
  await page.getByRole('button', { name: 'Always run: Off', exact: true }).click();
  const preferences = await page.evaluate(() => JSON.parse(localStorage.getItem('games:pref:upside:v3')));
  assert.equal(preferences.assist, true); assert.equal(preferences.autoRun, true);
  await restart(); assert.equal((await state()).assist, true, 'restarting applies Assist');
  await pause(); assert.ok(await page.getByRole('button', { name: 'Always run: On', exact: true }).isVisible(), 'Always run survives controller recreation');
  const assisted = await state();
  await page.getByRole('button', { name: 'Retry checkpoint · unlimited', exact: true }).click();
  await page.waitForFunction(() => __game.activities.host.phase === 'playing');
  assert.equal((await state()).lives, assisted.lives, 'Assist checkpoint retry preserves lives and resumes');
  await pause();
  await page.getByRole('button', { name: 'Assist next restart: On', exact: true }).click();
  await page.getByRole('button', { name: 'Always run: On', exact: true }).click();
  await restart(); assert.equal((await state()).assist, false);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('games:pref:upside:v3')).autoRun), false);

  // Mock only the browser hardware API. Every resulting move, jump, flip and
  // pause goes through the production gamepad sampler and host input path.
  await page.evaluate(() => {
    window.__activityTestPad = { id: 'Native activity verification pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.__activityTestPad] });
  });
  const pad = (axis = 0, buttons = []) => page.evaluate(({ axis, buttons }) => {
    const device = window.__activityTestPad; device.axes[0] = axis;
    device.buttons.forEach((button, index) => { button.pressed = button.touched = buttons.includes(index); button.value = button.pressed ? 1 : 0; });
  }, { axis, buttons });
  await paint(); const initial = await state();
  await pad(.85); await page.waitForFunction(x => __game.activities.host.controller.engine.state.player.x > x + .4, initial.x);
  await pad(0, [0]); await page.waitForFunction(y => __game.activities.host.controller.engine.state.player.y < y - .2, initial.y);
  await pad(); await paint(); await pad(0, [1]);
  await page.waitForFunction(g => __game.activities.host.controller.engine.state.player.g === -g, initial.g);
  await pad(); await paint();
  await pad(.85, [9]); await page.waitForFunction(() => __game.activities.host.phase === 'paused');
  await page.waitForTimeout(100); assert.equal(await page.evaluate(() => __game.activities.host.phase), 'paused', 'holding Start does not immediately resume');
  await pad(.85); await paint(); await pad(.85, [9]);
  await page.waitForFunction(() => __game.activities.host.phase === 'playing');
  await pad(.85);
  const resumed = await state();
  // A cleared input preserves legitimate airborne momentum. Allow natural
  // friction to stop that motion before checking the held-input guard.
  await page.waitForFunction(time => __game.activities.host.controller.engine.state.t > time + 1.25, resumed.time);
  assert.ok(Math.abs((await state()).vx) < .001, 'movement held through pause remains blocked after resume');
  const stopped = await state();
  await page.waitForFunction(time => __game.activities.host.controller.engine.state.t > time + .15, stopped.time);
  assert.ok(Math.abs((await state()).x - stopped.x) < .01, 'blocked controller cannot drift through the activity');
  await pad(); await paint(); await pad(.85);
  await page.waitForFunction(x => __game.activities.host.controller.engine.state.player.x > x + .4, stopped.x);
  await pad(); await page.evaluate(() => { window.__activityTestPad.connected = false; });
  assert.deepEqual(await survival(page), frozen, 'preferences and controller input leave the live survival state frozen');
  await close(page, spec, frozen, instance);
  console.log('desktop: Nib Classic/Assist retry costs, saved Always run/Assist preferences, gamepad movement/jump/flip, Start pause/resume and neutral-release guard passed.');
}

try {
  if (!process.env.GAMES_TEST_URL) {
    server = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('Test server did not start')), 10000); server.stdout.once('data', () => { clearTimeout(timer); resolve(); }); server.once('error', reject); server.once('exit', code => reject(Error(`Test server exited ${code}`))); });
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  await mkdir(output, { recursive: true });
  for (const spec of specs) {
    const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, hasTouch: spec.touch, isMobile: spec.touch, deviceScaleFactor: 1 });
    await installProbe(context);
    const page = await context.newPage(), cdp = await context.newCDPSession(page); currentPage = page; monitor(page, spec.name);
    await start(page, spec);
    await walkFromSpawn(page, spec, cdp);
    await mapCheck(page, spec);
    for (const id of selectedIds) {
      let instance = await open(page, spec, id); await layout(page, spec, id);
      const frozen = await survival(page);
      await input(page, spec, cdp, id); await page.waitForTimeout(160);
      assert.deepEqual(await survival(page), frozen, `${id}: survival position, health, armor, wave and clocks freeze`);
      assert.equal(await page.evaluate(() => __game.activities.host.phase), 'playing', `${id}: cancelled input leaves activity playable`);
      if (['upside', 'garden', 'lantern'].includes(id)) await page.screenshot({ path: `${output}/${spec.name}-${id}.png`, fullPage: true });
      await press(page.locator('#activityPause'), spec);
      const saved = await page.evaluate(() => __game.activities.host.controller.snapshot());
      await page.waitForTimeout(80); assert.deepEqual(await page.evaluate(() => __game.activities.host.controller.snapshot()), saved, `${id}: activity pause freezes its engine`);
      await close(page, spec, frozen, instance);
      await page.waitForFunction(time => __game.time > time, frozen.time, { timeout: 20000 });
      instance = await open(page, spec, id);
      assert.deepEqual(await page.evaluate(index => __activityProbe.instances[index].snapshot, instance), saved, `${id}: exact snapshot is restored before the first resumed frame`);
      const again = await survival(page);
      await press(page.locator('#activityPause'), spec);
      await press(page.getByRole('button', { name: 'Restart stage', exact: true }), spec);
      await page.waitForFunction(index => __game.activities.host.phase === 'playing' && __activityProbe.instances.length > index + 1, instance);
      assert.equal(await page.evaluate(index => __activityProbe.instances[index].disposals, instance), 1, `${id}: restart disposes the previous renderer`);
      assert.equal(await page.locator('#activityStage canvas').count(), 1);
      await close(page, spec, again, instance + 1);
      console.log(`${spec.name}: ${id} — world entry, real input, frozen survival, exact checkpoint, restart and return passed.`);
    }
    if (!spec.touch && selectedIds.includes('upside')) await upsidePreservationCheck(page, spec);
    // Every requested subset still verifies one genuine puzzle reward.
    await rewardCheck(page, spec, cdp);
    await context.close();
  }
  const redirectContext = await browser.newContext(); const redirect = await redirectContext.newPage(); monitor(redirect, 'legacy routes');
  for (const [path, id] of [['upside.html?level=3', 'upside'], ['arcade.html?game=lane-lark', 'lane-lark'], ['wonderwake.html?mission=dewfall', 'dewfall']]) {
    await redirect.goto(`${base}/${path}&debug=1&q=low`); await ready(redirect);
    const url = new URL(redirect.url()); assert.ok(url.pathname.endsWith('/soldier.html')); assert.equal(url.searchParams.get('activity'), id);
    assert.equal(await redirect.evaluate(() => __game.activities.progress.target), id, 'old bookmarks track their activity in the live world');
    assert.equal(await redirect.evaluate(() => __game.activities.host.active), false, 'bookmark tracks an outpost without launching outside the world');
    if (id === 'upside') assert.equal(url.searchParams.get('activityLevel'), '3');
  }
  await redirectContext.close();
  assert.deepEqual(errors, [], 'no JavaScript, console or asset errors');
  console.log(`Native activities browser: ${selectedIds.length} activities × ${specs.length} viewports, legal puzzle rewards, persistent progress and legacy redirects passed.`);
} catch (error) {
  if (currentPage && !currentPage.isClosed()) {
    await currentPage.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
    console.error('Browser state at failure:', await currentPage.evaluate(() => ({ mode: window.__game?.mode, paused: window.__game?.paused, activity: window.__game?.activities?.host.current?.id, phase: window.__game?.activities?.host.phase, card: document.querySelector('#activityCard')?.textContent, recentInstances: window.__activityProbe?.instances.slice(-5).map(({ id, disposals }) => ({ id, disposals })) })).catch(() => null));
  }
  console.error('Browser errors:', errors); throw error;
} finally { await browser?.close(); server?.kill(); }
