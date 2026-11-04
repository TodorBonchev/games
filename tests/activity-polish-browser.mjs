// Exercise the actual zombie-world host, original engines and rendered scenes.
// Only the survivor's position is a fixture; every activity action below uses
// real keyboard, mouse or multi-touch input, with the production RAF untouched.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';

const port = 5331, base = process.env.GAMES_TEST_URL || `http://127.0.0.1:${port}`;
const output = 'test-results/activity-polish', errors = [];
const selected = process.argv.find(arg => arg.startsWith('--activity='))?.slice(11).split(',');
const specs = [{ name: 'desktop', width: 1280, height: 800, touch: false }, { name: 'phone', width: 390, height: 844, touch: true }]
  .filter(spec => !process.argv.includes('--phone-only') || spec.touch)
  .filter(spec => !process.argv.includes('--desktop-only') || !spec.touch);
let server, browser, currentPage;

const press = (locator, spec) => spec.touch ? locator.tap() : locator.click();
const action = (page, id) => page.locator(`#activityControls [data-action="${id}"]`);
const state = page => page.evaluate(() => structuredClone(__game.activities.host.controller.engine.state));
const paint = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function center(locator) { const r = await locator.boundingBox(); assert.ok(r, 'input target is visible'); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }
async function contacts(cdp, type, points = []) { await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((point, i) => ({ id: i + 1, ...point })) }); }
async function additionalTap(cdp, held, point) {
  await contacts(cdp, 'touchStart', [held, point]);
  // CDP ends the explicitly listed contact IDs; listing the remaining finger
  // instead would release steering and accidentally launch by lifting it.
  await contacts(cdp, 'touchEnd', [{ ...point, id: 2 }]);
}
async function tapWorld(page, spec, x, z) {
  const point = await page.evaluate(({ x, z }) => __game.activities.host.controller.project(x, z), { x, z });
  if (spec.touch) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
  await paint(page);
}
async function start(page, spec) {
  await page.goto(`${base}/soldier.html?debug=1&q=low`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && window.__game?.activities?.host, null, { timeout: 90000 });
  await press(page.locator('#startBtn'), spec);
  await page.waitForFunction(() => __game.mode === 'intro' || __game.mode === 'play');
  if (await page.evaluate(() => __game.mode === 'intro')) {
    if (spec.touch) await page.locator('#skipBtn').tap(); else await page.keyboard.press('Space');
  }
  await page.waitForFunction(() => __game.mode === 'play' && !__game.paused);
}
async function open(page, spec, id) {
  await page.evaluate(id => { const station = __game.activities.world.stations.find(station => station.id === id); __game.setPos(station.x, station.z); }, id);
  await page.waitForFunction(id => { const prompt = document.querySelector('#activityInteract'); return !prompt.hidden && prompt.textContent.includes(__game.activities.world.stations.find(station => station.id === id).title); }, id);
  if (spec.touch) await page.locator('#activityInteract').tap(); else await page.keyboard.press('KeyE');
  await page.waitForFunction(id => __game.activities.host.phase === 'brief' && __game.activities.host.current.id === id, id);
  await press(page.locator('#activityCard .primary'), spec);
  await page.waitForFunction(() => __game.activities.host.phase === 'playing', null, { timeout: 60000 });
  await paint(page);
  assert.equal(await page.locator('#activityStage canvas').count(), 1);
  assert.equal(await page.locator('iframe').count(), 0);
  return page.evaluate(() => ({ position: [...__game.pos], hp: __game.hp, score: __game.score, time: __game.time, wave: __game.wave }));
}
async function finish(page, spec, id, frozen) {
  assert.deepEqual(await page.evaluate(() => ({ position: [...__game.pos], hp: __game.hp, score: __game.score, time: __game.time, wave: __game.wave })), frozen, `${id}: live survival stays frozen`);
  const bounds = await page.locator('#activityShell button').evaluateAll(buttons => buttons.filter(button => button.getClientRects().length).map(button => { const r = button.getBoundingClientRect(); return { text: button.textContent, x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; }));
  for (const r of bounds) {
    assert.ok(r.x >= -1 && r.y >= -1 && r.right <= spec.width + 1 && r.bottom <= spec.height + 1, `${id}: visible control is onscreen ${JSON.stringify(r)}`);
    if (spec.touch) assert.ok(r.width >= 43 && r.height >= 43, `${id}: accessible touch target ${JSON.stringify(r)}`);
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${id}: no horizontal overflow`);
  await page.screenshot({ path: `${output}/${spec.name}-${id}.png`, fullPage: true });
  await press(page.locator('#activityLeave'), spec);
  await page.waitForFunction(() => !__game.activities.host.active);
  await paint(page);
  assert.equal(await page.evaluate(() => __game.paused), false, `${id}: returning does not click through to the zombie pause control`);
  assert.equal(await page.locator('#activityStage canvas').count(), 0, `${id}: renderer is removed on return`);
  console.log(`${spec.name}: ${id} polish controls and return passed.`);
}

async function jelly(page, spec) {
  const before = await state(page), undo = action(page, 'undo');
  assert.equal(await undo.isDisabled(), true, 'Undo starts unavailable with no history');
  await tapWorld(page, spec, -2.6, -2.4);
  assert.notEqual((await state(page)).mask, before.mask, 'a real lantern tap changes the constellation');
  const middle = await state(page);
  await tapWorld(page, spec, 2.6, -2.4);
  assert.equal((await state(page)).moves, 2, 'two deliberate moves create a two-step undo history');
  assert.equal(await undo.isEnabled(), true);
  assert.equal(await undo.getAttribute('aria-keyshortcuts'), 'Z');
  if (spec.touch) await undo.tap(); else await page.keyboard.press('KeyZ');
  await page.waitForFunction(mask => __game.activities.host.controller.engine.state.mask === mask, middle.mask);
  await paint(page);
  assert.equal((await state(page)).moves, 1, 'one activation undoes exactly one move, without a duplicate compatibility click');
  if (spec.touch) await undo.tap(); else await page.keyboard.press('KeyZ');
  await page.waitForFunction(mask => __game.activities.host.controller.engine.state.mask === mask, before.mask);
  assert.equal((await state(page)).moves, 0, 'Undo restores the move count and exact board');
  await paint(page); assert.equal(await undo.isDisabled(), true);
  await press(action(page, 'hint'), spec);
  await page.waitForFunction(() => __game.activities.host.controller.engine.state.hint >= 0);
  assert.equal((await state(page)).mask, before.mask, 'the visible hint does not play the puzzle for the player');
}
async function bellwood(page, spec) {
  await press(action(page, 'replay'), spec);
  await page.waitForFunction(() => __game.activities.host.controller.engine.state.phase === 'show');
  await paint(page);
  assert.equal(await action(page, 'replay').count(), 0, 'replay is absent while the song is already playing');
  await page.waitForFunction(() => __game.activities.host.controller.engine.state.phase === 'repeat');
  await tapWorld(page, spec, -3.4, 0);
  assert.equal((await state(page)).input, 1, 'first correct bell visibly advances the phrase');
  if (spec.touch) await action(page, 'replay').tap(); else await page.keyboard.press('KeyR');
  await page.waitForFunction(() => __game.activities.host.controller.engine.state.phase === 'show');
  const replay = await state(page);
  assert.equal(replay.input, 0); assert.equal(replay.mistakes, 0); assert.equal(replay.round, 0);
  await page.waitForFunction(() => __game.activities.host.controller.engine.state.phase === 'repeat');
  for (const x of [-3.4, 0, 3.4]) await tapWorld(page, spec, x, 0);
  assert.equal((await state(page)).round, 1, 'replayed phrase remains fully playable and advances normally');
}
async function garden(page, spec) {
  assert.equal(await action(page, 'bloom').getAttribute('aria-pressed'), 'true', 'initial seed selection is accessible');
  await press(action(page, 'pea'), spec); await paint(page);
  assert.equal(await action(page, 'pea').getAttribute('aria-pressed'), 'true');
  assert.equal(await action(page, 'bloom').getAttribute('aria-pressed'), 'false');
  const before = await state(page);
  if (!spec.touch) {
    const point = await page.evaluate(() => __game.activities.host.controller.project(1, 2));
    await page.mouse.move(point.x, point.y);
    await page.waitForFunction(() => document.querySelector('#activityHint').textContent === 'Plant Pea pod here · 100 sun');
    assert.equal((await state(page)).plants.length, 0, 'hover previews planting before any button is pressed');
  }
  await tapWorld(page, spec, 1, 2);
  await page.waitForFunction(() => __game.activities.host.controller.engine.state.plants.length === 1);
  const planted = await state(page);
  assert.equal(planted.sun, before.sun - 100, 'selected pea spends the advertised cost');
  assert.equal(planted.plants[0].type, 'pea');
  assert.match(await action(page, 'pea').textContent(), /\d(?:\.\d)?s/, 'seed recharge is readable beside its cost');
  assert.match(await action(page, 'pea').getAttribute('class') || '', /unavailable/, 'unaffordable or recharging seed is visibly unavailable');
  await press(action(page, 'shovel'), spec); await tapWorld(page, spec, 1, 2);
  await page.waitForFunction(() => __game.activities.host.controller.engine.state.plants.length === 0);
  assert.equal((await state(page)).sun, planted.sun + 50, 'shovel keeps the advertised half-cost refund');
  assert.equal(await action(page, 'shovel').getAttribute('aria-pressed'), 'true');
}
async function moonbounce(page, spec, cdp) {
  const launch = action(page, 'launch'), initial = await state(page);
  assert.ok(initial.orbits.length > 0, 'initial orbit can be launched');
  await launch.evaluate(button => { window.__polishLaunch = button; });
  const anchor = await center(page.locator('#activityStage'));
  if (spec.touch) { await contacts(cdp, 'touchStart', [anchor]); await contacts(cdp, 'touchMove', [{ x: anchor.x + 35, y: anchor.y }]); }
  else { await page.mouse.move(anchor.x, anchor.y); await page.mouse.down(); await page.mouse.move(anchor.x + 35, anchor.y); }
  const held = { x: anchor.x + 35, y: anchor.y };
  await page.waitForFunction(x => __game.activities.host.controller.engine.state.player.x > x + .2, initial.player.x);
  if (spec.touch) await additionalTap(cdp, held, await center(launch)); else await page.keyboard.press('KeyL');
  await page.waitForFunction(bursts => __game.activities.host.controller.engine.state.bursts > bursts, initial.bursts);
  await paint(page);
  assert.equal(await launch.evaluate(button => button === window.__polishLaunch), true, 'launch metadata updates preserve the actual action button');
  const fired = await state(page);
  assert.ok(fired.launched > initial.launched, 'explicit launch emits real moon projectiles');
  if (!fired.orbits.length) assert.equal(await launch.isDisabled(), true, 'empty orbit disables launch');
  await page.waitForFunction(x => __game.activities.host.controller.engine.state.player.x > x + .2, fired.player.x);
  if (spec.touch) await contacts(cdp, 'touchCancel'); else { await page.locator('#activityStage').dispatchEvent('pointercancel', { pointerId: 1 }); await page.mouse.up(); }
}
async function borrowed(page, spec, cdp) {
  const right = page.locator('#activityControls [data-direction="right"]'), dash = action(page, 'dash');
  await right.evaluate(button => { window.__polishDpad = button; });
  await dash.evaluate(button => { window.__polishDash = button; });
  const origin = (await state(page)).player.x, held = spec.touch ? await center(right) : null;
  if (spec.touch) await contacts(cdp, 'touchStart', [held]); else await page.keyboard.down('ArrowRight');
  await page.waitForFunction(x => __game.activities.host.controller.engine.state.player.x > x + .15, origin);
  if (spec.touch) await additionalTap(cdp, held, await center(dash)); else await page.keyboard.press('Shift');
  await page.waitForFunction(() => __game.activities.host.controller.engine.state.dashCooldown > 0);
  await paint(page);
  assert.equal(await dash.isDisabled(), true, 'dash cannot be triggered while recharging');
  assert.equal(await right.evaluate(button => button === window.__polishDpad), true, 'cooldown changes preserve the held D-pad node');
  assert.equal(await dash.evaluate(button => button === window.__polishDash), true, 'cooldown changes preserve the focused action node');
  await page.waitForFunction(() => __game.activities.host.controller.engine.state.dashTime === 0);
  const after = (await state(page)).player.x;
  await page.waitForFunction(x => __game.activities.host.controller.engine.state.player.x > x + .2, after);
  if (spec.touch) { assert.equal(await right.evaluate(button => button.classList.contains('held')), true); await contacts(cdp, 'touchEnd'); }
  else await page.keyboard.up('ArrowRight');
  await page.waitForFunction(() => __game.activities.host.controller.engine.state.dashCooldown === 0);
  await paint(page); assert.equal(await dash.isEnabled(), true, 'dash becomes available again without recreating controls');
}
async function dewfall(page, spec, cdp) {
  if (!spec.touch) {
    // Two physical sources can hold the same action. Releasing either source
    // must keep braking until the other source is released as well.
    const button = action(page, 'brake'), point = await center(button);
    await page.mouse.move(point.x, point.y); await page.mouse.down();
    await page.waitForFunction(() => __game.activities.host.controller.hud().hint.startsWith('Brake held'));
    await page.keyboard.down('KeyB'); await page.keyboard.up('KeyB'); await paint(page);
    assert.equal(await page.evaluate(() => __game.activities.host.controller.hud().hint.startsWith('Brake held')), true, 'releasing B preserves the mouse-held brake');
    assert.equal(await button.evaluate(node => node.classList.contains('held')), true, 'the remaining hold stays visibly active');
    await page.keyboard.down('KeyB'); await page.mouse.up(); await paint(page);
    assert.equal(await page.evaluate(() => __game.activities.host.controller.hud().hint.startsWith('Brake held')), true, 'releasing the mouse preserves the keyboard-held brake');
    await page.keyboard.up('KeyB'); await paint(page);
    assert.equal(await page.evaluate(() => __game.activities.host.controller.hud().hint.startsWith('Brake held')), false, 'releasing the last source ends braking');
  }
  const anchor = await center(page.locator('#activityStage')), held = { x: anchor.x + 32, y: anchor.y };
  if (spec.touch) { await contacts(cdp, 'touchStart', [anchor]); await contacts(cdp, 'touchMove', [held]); }
  else { await page.mouse.move(anchor.x, anchor.y); await page.mouse.down(); await page.mouse.move(held.x, held.y); }
  await page.waitForFunction(() => __game.activities.host.controller.engine.state.balls.some(ball => ball.vx > .7));
  const speed = Math.max(...(await state(page)).balls.map(ball => Math.abs(ball.vx))), brake = await center(action(page, 'brake'));
  if (spec.touch) await contacts(cdp, 'touchStart', [held, brake]); else await page.keyboard.down('KeyB');
  await page.waitForFunction(() => document.querySelector('#activityHint').textContent.startsWith('Brake held'));
  await page.waitForFunction(speed => __game.activities.host.controller.engine.state.balls.every(ball => Math.abs(ball.vx) < speed * .3), speed);
  // Pause while the brake is physically held. Resuming must release it without
  // requiring the old pointer/keyboard release event to arrive afterward.
  if (spec.touch) { const pause = await center(page.locator('#activityPause')); await contacts(cdp, 'touchStart', [held, brake, pause]); await contacts(cdp, 'touchEnd', [{ ...pause, id: 3 }]); }
  else await page.keyboard.press('Escape');
  await page.waitForFunction(() => __game.activities.host.phase === 'paused');
  const saved = await page.evaluate(() => __game.activities.host.controller.snapshot());
  await paint(page); assert.deepEqual(await page.evaluate(() => __game.activities.host.controller.snapshot()), saved, 'braked pause freezes the engine exactly');
  assert.equal(await page.evaluate(() => __game.activities.host.controller.hud().hint.startsWith('Brake held')), false, 'pause releases the held brake');
  if (spec.touch) await contacts(cdp, 'touchCancel'); else { await page.keyboard.up('KeyB'); await page.mouse.up(); }
  await press(page.getByRole('button', { name: 'Resume activity', exact: true }), spec);
  await page.waitForFunction(() => __game.activities.host.phase === 'playing');
  await paint(page); assert.doesNotMatch(await page.locator('#activityHint').textContent(), /^Brake held/);
}
async function nib(page, spec, cdp) {
  const route = page.locator('#activityRoute');
  assert.equal(await route.isVisible(), true);
  assert.equal(await route.getAttribute('role'), 'progressbar');
  assert.equal(await route.getAttribute('aria-valuemin'), '0');
  assert.equal(await route.getAttribute('aria-valuemax'), '100');
  assert.equal(await route.locator('i').count(), 3, 'all optional stars have positions on the route');
  assert.match(await route.getAttribute('aria-valuetext'), /World progress \d+%\. \d of 3 stars collected/);
  const start = Number(await route.getAttribute('aria-valuenow'));
  if (spec.touch) await contacts(cdp, 'touchStart', [await center(page.getByRole('button', { name: 'Move right', exact: true }))]);
  else await page.keyboard.down('ArrowRight');
  await page.waitForFunction(value => Number(document.querySelector('#activityRoute').getAttribute('aria-valuenow')) > value, start);
  if (spec.touch) await contacts(cdp, 'touchEnd'); else await page.keyboard.up('ArrowRight');
  const progress = Number(await route.getAttribute('aria-valuenow'));
  assert.ok(progress > start && progress <= 100, 'walking advances the accessible route meter');
  await press(page.locator('#activityPause'), spec);
  const paused = await route.getAttribute('aria-valuenow'); await paint(page);
  assert.equal(await route.getAttribute('aria-valuenow'), paused, 'route progress freezes with the activity');
  await press(page.getByRole('button', { name: 'Resume activity', exact: true }), spec);
}

const checks = { 'jelly-lanterns': jelly, 'bellwood-beats': bellwood, garden, moonbounce, borrowed, dewfall, upside: nib };
try {
  if (!process.env.GAMES_TEST_URL) {
    server = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('Test server did not start')), 10000); server.stdout.once('data', () => { clearTimeout(timer); resolve(); }); server.once('error', reject); server.once('exit', code => reject(Error(`Server exited ${code}`))); });
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  await mkdir(output, { recursive: true });
  for (const spec of specs) {
    const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, hasTouch: spec.touch, isMobile: spec.touch, deviceScaleFactor: 1 });
    const page = await context.newPage(), cdp = await context.newCDPSession(page); currentPage = page;
    page.on('pageerror', error => errors.push(`${spec.name}: ${error.stack || error.message}`));
    page.on('console', event => { if (event.type() === 'error') errors.push(`${spec.name}: ${event.text()}`); });
    page.on('response', response => { if (response.status() >= 400) errors.push(`${spec.name}: ${response.status()} ${response.url()}`); });
    page.setDefaultTimeout(15000);
    await start(page, spec);
    for (const [id, check] of Object.entries(checks)) {
      if (selected && !selected.includes(id)) continue;
      const frozen = await open(page, spec, id); await check(page, spec, cdp); await finish(page, spec, id, frozen);
    }
    await context.close();
  }
  assert.deepEqual(errors, [], 'no JavaScript, console or asset failures');
  console.log(`Integrated activity polish: ${selected?.length || Object.keys(checks).length} mechanics × ${specs.length} viewports passed.`);
} catch (error) {
  if (currentPage && !currentPage.isClosed()) {
    await currentPage.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
    console.error('Failure state:', await currentPage.evaluate(() => ({ activity: window.__game?.activities?.host.current?.id, phase: window.__game?.activities?.host.phase, hud: document.querySelector('.activity-live')?.textContent, actions: window.__game?.activities?.host.controller?.actions, engine: window.__game?.activities?.host.controller?.engine?.state })).catch(() => null));
  }
  console.error('Browser errors:', errors); throw error;
} finally { await browser?.close(); server?.kill(); }
