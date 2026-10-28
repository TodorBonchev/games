// Real-browser coverage for Lantern Vale. The route pilot flies using the
// same controls as the ship and never alters simulation state.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const port = 5195, baseURL = process.env.GAMES_TEST_URL || `http://127.0.0.1:${port}`;
const server = process.env.GAMES_TEST_URL ? null : spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
const errors = [], external = [], reports = [];
let browser;
function monitor(page, label = '') {
  page.on('pageerror', error => errors.push(`${label}${error.stack || error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`${label}${message.text()}`); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${label}${response.status()} ${response.url()}`); });
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(baseURL)) external.push(request.url()); });
}
async function ready(page) { await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 }); await page.evaluate(() => document.fonts.ready); }
async function touch(cdp, type, point) { await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [{ ...point, id: 1 }] : [] }); }
async function finishVillage(page) {
  const strategy = await readFile(new URL('./lantern-strategy.mjs', import.meta.url), 'utf8');
  const imports = [...strategy.matchAll(/import\s*\{([^}]+)\}\s*from\s*[^;]+;/g)].map(match => match[1]).join(',');
  const source = strategy.replace(/^import .*?;\s*/gm, '').replace(/^export /gm, '');
  return page.evaluate(async ({ source, imports }) => {
    const helpers = await import('./lantern-game.js');
    const api = window.__lantern;
    const finish = new Function('helpers', `const {${imports}} = helpers;\n${source}\nreturn finishVillage;`)(helpers);
    const advance = api.game.advance, flight = { lowest: Infinity, highest: -Infinity, furthest: 0, safe: true };
    api.game.advance = (...args) => {
      advance(...args);
      const p = api.game.state.player;
      flight.lowest = Math.min(flight.lowest, p.y); flight.highest = Math.max(flight.highest, p.y);
      flight.furthest = Math.max(flight.furthest, Math.hypot(p.x, p.z));
      flight.safe &&= helpers.isFlyable(api.world, p.x, p.y, p.z);
    };
    api.setRealtime(false); try { finish(api.game); } finally { api.game.advance = advance; } api.refresh();
    const s = api.game.state;
    return { mode: s.mode, lit: [...s.lit], secrets: [...s.secrets], collected: [...s.collected], stars: s.stars, ticks: s.ticks, flight };
  }, { source, imports });
}
async function touchLanternMission(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(), cdp = await context.newCDPSession(page); monitor(page, 'touch mission: ');
  try {
    await page.goto(`${baseURL}/lantern.html?debug=1`); await ready(page);
    await page.locator('[data-action=start]').tap(); await page.evaluate(() => __lantern.setRealtime(false));
    const rect = await page.locator('#gameStage').boundingBox();
    const anchor = { x: rect.x + rect.width * .32, y: rect.y + rect.height * .63 };
    const target = await page.evaluate(() => ({ x: -7.3, y: __lantern.game.targets.motes[0].y, z: 4.8 }));
    const sample = () => page.evaluate(() => ({ player: { ...__lantern.game.state.player }, collected: [...__lantern.game.state.collected], lit: [...__lantern.game.state.lit], charge: __lantern.game.state.charge }));
    await touch(cdp, 'touchStart', anchor);
    let state = await sample(), reached = false, steeringFrames = 0;
    // The phone always flies forward while held. This pilot therefore uses
    // real touch steering arcs, not the engine pilot's turn-in-place inputs.
    for (; steeringFrames < 160; steeringFrames++) {
      const p = state.player, desired = Math.atan2(target.x - p.x, target.z - p.z);
      const angle = Math.atan2(Math.sin(desired - p.heading), Math.cos(desired - p.heading));
      let turn = Math.max(-.9, Math.min(.9, -angle * 1.8));
      let lift = Math.max(-.6, Math.min(.6, (target.y - p.y) * 1.2));
      const length = Math.hypot(turn, lift); if (length > .95) { turn *= .95 / length; lift *= .95 / length; }
      await touch(cdp, 'touchMove', { x: anchor.x + turn * 46, y: anchor.y - lift * 46 });
      await page.evaluate(() => __lantern.advance(.1)); // Uses the actual held pointer's input.
      state = await sample();
      if (Math.hypot(target.x - state.player.x, target.y - state.player.y, target.z - state.player.z) < .35) { reached = true; break; }
    }
    await touch(cdp, 'touchEnd');
    assert.ok(reached, 'a held thumb can steer a flight arc into the firefly trail');
    for (let i = 0; i < 3; i++) await page.evaluate(() => __lantern.advance(1));
    state = await sample();
    assert.ok([0, 1, 2].every(id => state.collected.includes(id)), 'actual touch flight gathers the first three fireflies');
    assert.deepEqual(state.lit, [0], 'releasing the real thumb hovers and lights Hearth Square');
    assert.equal(state.player.speed, 0); assert.equal(state.player.verticalSpeed, 0); assert.equal(state.charge, 0);
    await page.screenshot({ path: 'test-results/lantern-flight/touch-lantern.png' });
    reports.push({ touchMission: { steeringFrames, lit: state.lit, collected: state.collected, player: state.player } });
  } finally { await context.close(); }
}
try {
  if (server) await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Lantern test server did not start')), 10000);
    server.stdout.once('data', () => { clearTimeout(timeout); resolve(); });
    server.once('error', error => { clearTimeout(timeout); reject(error); });
    server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Lantern test server exited (${code})`)); });
  });
  await mkdir('test-results/lantern', { recursive: true });
  await mkdir('test-results/lantern-flight', { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let page = await context.newPage(); monitor(page, 'desktop: ');
  await page.goto(`${baseURL}/lantern.html?debug=1`); await ready(page);
  await page.locator('[data-action=help]').click();
  assert.ok(await page.locator('[data-action=helpBack]').isVisible());
  await page.locator('[data-action=helpBack]').click();
  await page.locator('[data-action=start]').click();
  await page.evaluate(() => window.__lantern.setRealtime(false));
  await page.locator('#mapButton').click(); assert.ok(await page.locator('[data-action=mapBack]').isVisible());
  await page.locator('[data-action=mapBack]').click();
  await page.locator('[data-action=resume]').click();
  // Keyboard movement, unlike a synthetic state edit, must move the real character.
  const initial = await page.evaluate(() => ({ ...window.__lantern.game.state.player }));
  await page.keyboard.down('ArrowUp'); await page.evaluate(() => window.__lantern.advance(.5)); await page.keyboard.up('ArrowUp');
  const moved = await page.evaluate(() => ({ ...window.__lantern.game.state.player }));
  assert.ok(Math.hypot(moved.x - initial.x, moved.z - initial.z) > .2, 'keyboard moves the real player');
  await page.keyboard.down('KeyE'); await page.evaluate(() => window.__lantern.advance(.6)); await page.keyboard.up('KeyE');
  assert.ok(await page.evaluate(y => window.__lantern.game.state.player.y > y + .3, moved.y), 'keyboard climbs in three dimensions');
  await page.locator('#pauseButton').click();
  await page.waitForTimeout(100);
  const frozen = await page.evaluate(() => ({ snapshot: window.__lantern.game.snapshot(), renders: window.__lantern.renderCount }));
  await page.waitForTimeout(250);
  assert.deepEqual(await page.evaluate(() => ({ snapshot: window.__lantern.game.snapshot(), renders: window.__lantern.renderCount })), frozen, 'pause stops movement and rendering');
  await page.locator('[data-action=resume]').click();
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); delete document.hidden; });
  assert.equal(await page.evaluate(() => window.__lantern.game.state.mode), 'paused', 'backgrounding pauses the world');
  await page.locator('[data-action=resume]').click();
  const completion = await finishVillage(page); reports.push({ completion });
  assert.equal(completion.mode, 'won'); assert.equal(completion.lit.length, 5); assert.equal(completion.secrets.length, 5); assert.equal(completion.stars, 3);
  assert.ok(completion.ticks > 1000, 'the legal pilot flew around the island');
  assert.ok(completion.flight.lowest < -5 && completion.flight.highest > 10 && completion.flight.furthest > 20 && completion.flight.safe,
    'the legal flight discovers above, around and beneath the island without crossing solid ground');
  assert.ok(await page.locator('[data-action=explore]').isVisible());
  await page.evaluate(() => window.__lantern.save());
  const wonSave = await page.evaluate(() => localStorage.getItem('games:save:lantern'));
  const resources = await page.evaluate(() => {
    const { view, game } = window.__lantern;
    const crowded = structuredClone(game.state);
    crowded.effects = Array.from({ length: 50 }, (_, id) => ({ id, type: id % 2 ? 'light' : 'secret', x: Math.sin(id) * 4, y: 6.8, z: Math.cos(id) * 4, age: .2, duration: 1 }));
    view.render(crowded, 2); const memory = JSON.stringify(view.renderer.info.memory);
    for (let i = 0; i < 20; i++) view.render(crowded, 2 + i / 30);
    return { calls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles, stable: memory === JSON.stringify(view.renderer.info.memory) };
  });
  assert.ok(resources.calls <= 150 && resources.stable, `the full world reuses geometry (${resources.calls} calls)`); reports.push({ resources });
  const otherSaves = await page.evaluate(async () => {
    const { writeGameSave } = await import('./save-store.js?v7');
    for (const slug of ['soldier', 'garden', 'borrowed', 'moonbounce', 'popwake', 'pondpost', 'prism', 'ribbon', 'dewfall']) writeGameSave(slug, { sentinel: slug });
    return Object.fromEntries(['soldier', 'garden', 'borrowed', 'moonbounce', 'popwake', 'pondpost', 'prism', 'ribbon', 'dewfall'].map(slug => [slug, localStorage.getItem(`games:save:${slug}`)]));
  });
  await page.goto(`${baseURL}/`);
  assert.equal(await page.locator('.game-card').count(), 6);
  assert.equal(await page.locator('.lantern-card [data-play-label]').textContent(), 'CONTINUE RUN');
  await page.locator('.lantern-card').click(); await ready(page);
  assert.ok(await page.locator('[data-action=explore]').isVisible(), 'hub continues the completed valley');
  assert.deepEqual(await page.evaluate(() => Object.fromEntries(['soldier', 'garden', 'borrowed', 'moonbounce', 'popwake', 'pondpost', 'prism', 'ribbon', 'dewfall'].map(slug => [slug, localStorage.getItem(`games:save:${slug}`)]))), otherSaves, 'the valley did not overwrite other slots');
  await context.close();

  await touchLanternMission(browser);

  for (const scenario of ['intro', 'paused', 'won']) {
    const ctx = await browser.newContext(), p = await ctx.newPage(); monitor(p, `context ${scenario}: `);
    if (scenario === 'won') await p.addInitScript(raw => localStorage.setItem('games:save:lantern', raw), wonSave);
    await p.goto(`${baseURL}/lantern.html?debug=1${scenario === 'won' ? '&continue=1' : ''}`); await ready(p);
    if (scenario === 'paused') { await p.locator('[data-action=start]').click(); await p.locator('#pauseButton').click(); }
    const before = await p.evaluate(() => ({ mode: window.__lantern.game.state.mode, snapshot: window.__lantern.game.snapshot() }));
    await p.evaluate(() => { const extension = window.__lantern.view.renderer.getContext().getExtension('WEBGL_lose_context'); window.__restorePicture = () => extension.restoreContext(); extension.loseContext(); });
    await p.waitForFunction(() => document.getElementById('gamePanel').dataset.kind === 'restoring');
    assert.ok(await p.locator('[data-action=waiting]').isDisabled());
    await p.waitForTimeout(250); await p.evaluate(() => window.__restorePicture());
    await p.waitForFunction(() => document.getElementById('gamePanel').dataset.kind !== 'restoring');
    const action = scenario === 'intro' ? 'start' : scenario === 'paused' ? 'resume' : 'explore';
    assert.ok(await p.locator(`[data-action=${action}]`).isVisible(), `${scenario}: recovery restores the original panel`);
    assert.deepEqual(await p.evaluate(() => ({ mode: window.__lantern.game.state.mode, snapshot: window.__lantern.game.snapshot() })), before, `${scenario}: context recovery preserves progress`);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext(), p = await ctx.newPage(); monitor(p, 'cold shader context loss: ');
    await p.addInitScript(raw => {
      localStorage.setItem('games:save:lantern', raw);
      // Keep shader programs cold until the test deliberately requests a frame.
      window.requestAnimationFrame = () => 0;
    }, wonSave);
    await p.goto(`${baseURL}/lantern.html?debug=1&continue=1`);
    await p.waitForFunction(() => document.body.dataset.ready === 'true', null, { polling: 10, timeout: 60000 });
    await p.evaluate(() => {
      const extension = __lantern.view.renderer.getContext().getExtension('WEBGL_lose_context');
      window.__restoreColdPicture = () => extension.restoreContext();
      extension.loseContext();
      // The GL context is lost now, but its DOM event has not arrived yet.
      __lantern.view.render(__lantern.game.state, 1);
    });
    await p.waitForFunction(() => document.getElementById('gamePanel').dataset.kind === 'restoring', null, { polling: 10 });
    await p.waitForTimeout(250); await p.evaluate(() => window.__restoreColdPicture());
    await p.waitForFunction(() => document.getElementById('gamePanel').dataset.kind !== 'restoring', null, { polling: 10 });
    await p.evaluate(() => __lantern.view.render(__lantern.game.state, 2));
    assert.ok(await p.locator('[data-action=explore]').isVisible(), 'context loss before shader compilation safely restores the won screen');
    await ctx.close();
  }
  const phones = [
    { width: 320, height: 568, dpr: 2, insets: { top: 47, bottom: 34 } }, { width: 360, height: 640, dpr: 2 },
    { width: 390, height: 844, dpr: 3, insets: { top: 47, bottom: 34 } }, { width: 430, height: 932, dpr: 3 },
    { width: 568, height: 320, dpr: 2, insets: { left: 47, right: 47, bottom: 21 } },
    { width: 844, height: 390, dpr: 3, insets: { left: 47, right: 47, bottom: 21 } }, { width: 932, height: 430, dpr: 3 },
  ];
  for (const spec of phones) {
    const label = `${spec.width}x${spec.height}`, ctx = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, isMobile: true, hasTouch: true, deviceScaleFactor: spec.dpr });
    let p = await ctx.newPage(); monitor(p, `${label}: `); let cdp = await ctx.newCDPSession(p);
    if (spec.insets) await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: spec.insets });
    await p.goto(`${baseURL}/lantern.html?debug=1`); await ready(p);
    const start = await p.locator('[data-action=start]').boundingBox();
    assert.ok(start.y + start.height <= spec.height - (spec.insets?.bottom || 0), `${label}: start is above the bottom inset`);
    await p.locator('[data-action=start]').tap(); await p.waitForTimeout(350);
    await p.screenshot({ path: `test-results/lantern-flight/takeoff-${label}.png` });
    const controls = await p.locator('button,a').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length && !node.closest('[hidden]')).map(node => { const r = node.getBoundingClientRect(); return { name: node.id || node.textContent.trim(), x: r.x, y: r.y, w: r.width, h: r.height }; }));
    for (const r of controls) {
      assert.ok(r.w >= 43.5 && r.h >= 43.5, `${label}: ${r.name} has a 44px target (${r.w}×${r.h})`);
      assert.ok(r.x >= (spec.insets?.left || 0) - 1 && r.x + r.w <= spec.width - (spec.insets?.right || 0) + 1, `${label}: ${r.name} clears side insets`);
      assert.ok(r.y >= (spec.insets?.top || 0) - 1 && r.y + r.h <= spec.height - (spec.insets?.bottom || 0) + 1, `${label}: ${r.name} clears top and bottom insets`);
    }
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: no horizontal overflow`);
    const stage = await p.locator('#gameStage').boundingBox();
    const anchor = { x: stage.x + stage.width * .3, y: stage.y + stage.height * .58 }, pulled = { x: anchor.x + 40, y: anchor.y };
    const before = await p.evaluate(() => ({ ...window.__lantern.game.state.player }));
    await touch(cdp, 'touchStart', anchor); await p.waitForTimeout(80); await touch(cdp, 'touchMove', pulled); await p.waitForTimeout(600); await touch(cdp, 'touchEnd'); await p.waitForTimeout(350);
    const after = await p.evaluate(() => ({ ...window.__lantern.game.state.player }));
    assert.ok(Math.hypot(after.x - before.x, after.z - before.z) > .2, `${label}: a real finger steers the spacecraft`);
    assert.ok(Math.abs(Math.atan2(Math.sin(after.heading - before.heading), Math.cos(after.heading - before.heading))) > .1, `${label}: horizontal dragging turns the ship`);
    await p.evaluate(() => window.__lantern.setRealtime(false));
    await p.evaluate(() => window.__lantern.advance(.5));
    const released = await p.evaluate(() => ({ ...window.__lantern.game.state.player }));
    assert.ok(Math.hypot(released.x - after.x, released.z - after.z) < .12, `${label}: lifting stops the spacecraft`);
    await touch(cdp, 'touchStart', anchor); await touch(cdp, 'touchMove', pulled); await touch(cdp, 'touchCancel'); await p.waitForTimeout(350);
    const cancelBefore = await p.evaluate(() => ({ ...window.__lantern.game.state.player })); await p.evaluate(() => window.__lantern.advance(.5));
    const cancelAfter = await p.evaluate(() => ({ ...window.__lantern.game.state.player }));
    assert.ok(Math.hypot(cancelAfter.x - cancelBefore.x, cancelAfter.z - cancelBefore.z) < .01, `${label}: cancelled touch clears movement`);
    await touch(cdp, 'touchStart', anchor); await touch(cdp, 'touchMove', pulled);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: {} });
    await p.setViewportSize(spec.width < spec.height ? { width: 844, height: 390 } : { width: 390, height: 844 }); await p.waitForTimeout(150);
    await touch(cdp, 'touchEnd'); await p.waitForTimeout(350);
    const turnBefore = await p.evaluate(() => ({ ...window.__lantern.game.state.player })); await p.evaluate(() => window.__lantern.advance(.5));
    const turnAfter = await p.evaluate(() => ({ ...window.__lantern.game.state.player }));
    assert.ok(Math.hypot(turnAfter.x - turnBefore.x, turnAfter.z - turnBefore.z) < .01, `${label}: rotating clears movement`);
    await p.setViewportSize({ width: spec.width, height: spec.height }); if (spec.insets) await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: spec.insets });
    await p.waitForTimeout(100);
    if (spec.width === 390 || spec.width === 568) {
      const flightStage = await p.locator('#gameStage').boundingBox();
      const origin = { x: flightStage.x + flightStage.width * .3, y: flightStage.y + flightStage.height * .6, id: 1 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [origin] });
      await p.evaluate(() => __lantern.advance(.6));
      const cruising = await p.evaluate(() => ({ ...__lantern.game.state.player }));
      assert.ok(cruising.speed > 1, `${label}: holding without a drag flies forward`);
      const climbing = { ...origin, y: origin.y - 34 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [climbing] });
      await p.evaluate(() => __lantern.advance(.6));
      assert.ok(await p.evaluate(y => __lantern.game.state.player.y > y + .3, cruising.y), `${label}: dragging up climbs`);
      const boostRect = await p.locator('#boostButton').boundingBox();
      const boost = { x: boostRect.x + boostRect.width / 2, y: boostRect.y + boostRect.height / 2, id: 2 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [climbing, boost] });
      await p.evaluate(() => __lantern.advance(.7));
      const boosted = await p.evaluate(() => __lantern.game.state.player.speed);
      assert.ok(boosted > cruising.speed * 1.4, `${label}: second thumb boosts while the first steers`);
      // CDP touchEnd lists the fingers being released, rather than those remaining.
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [boost] });
      await p.evaluate(() => __lantern.advance(.6));
      const unboosted = await p.evaluate(() => __lantern.game.state.player.speed);
      assert.ok(unboosted > 1 && unboosted < boosted * .9, `${label}: releasing boost keeps the flight thumb active`);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [climbing, boost] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [climbing] });
      await p.evaluate(() => __lantern.advance(.6));
      const boostOnly = await p.evaluate(() => ({ speed: __lantern.game.state.player.speed, control: __lantern.control }));
      assert.ok(boostOnly.speed > cruising.speed * 1.4 && boostOnly.control.boost && boostOnly.control.lift === 0 && boostOnly.control.turn === 0,
        `${label}: releasing the flight thumb retains independent boost and clears steering`);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await p.evaluate(() => __lantern.advance(.8));
      assert.ok(await p.evaluate(() => Math.abs(__lantern.game.state.player.speed) < .03 && Math.abs(__lantern.game.state.player.verticalSpeed) < .03), `${label}: releasing both thumbs settles into a hover`);
    }
    const composition = await p.evaluate(() => {
      const { view, game } = __lantern, player = game.state.player;
      for (let i = 0; i < 40; i++) view.render(game.state, performance.now() / 1000 + i / 30);
      const point = view.project(player.x, player.z, player.y);
      const dx = view.camera.position.x - player.x, dz = view.camera.position.z - player.z;
      return { ship: !!view.ship?.visible, behind: dx * Math.sin(player.heading) + dz * Math.cos(player.heading),
        x: point.x / view.renderer.domElement.clientWidth, y: point.y / view.renderer.domElement.clientHeight, visible: point.visible };
    });
    assert.ok(composition.ship && composition.behind < -1 && composition.visible && composition.x > .25 && composition.x < .75 && composition.y > .4 && composition.y < .9,
      `${label}: the real ship stays visible from behind (${JSON.stringify(composition)})`);
    await p.screenshot({ path: `test-results/lantern-flight/playing-${label}.png` });
    await p.evaluate(() => window.__lantern.save()); const checkpoint = await p.evaluate(() => JSON.parse(localStorage.getItem('games:save:lantern')).data);
    const stats = await p.evaluate(() => { const renderer = window.__lantern.view.renderer; return { calls: renderer.info.render.calls, pixels: renderer.domElement.width * renderer.domElement.height, antialias: renderer.getContext().getContextAttributes().antialias }; });
    assert.ok(stats.calls <= 150 && stats.pixels <= 421000 && !stats.antialias, `${label}: renderer stays inside its phone budget`); reports.push({ phone: label, ...stats });
    await p.close(); p = await ctx.newPage(); monitor(p, `${label} reopened: `); cdp = await ctx.newCDPSession(p); if (spec.insets) await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: spec.insets });
    await p.goto(`${baseURL}/lantern.html?debug=1`); await ready(p); await p.evaluate(() => window.__lantern.setRealtime(false));
    await p.locator('[data-action=continue]').tap();
    const restored = await p.evaluate(() => window.__lantern.game.snapshot());
    assert.deepEqual(restored.player, checkpoint.player, `${label}: exact position resumes`); assert.deepEqual(restored.lit, checkpoint.lit); assert.deepEqual(restored.secrets, checkpoint.secrets);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext(), p = await ctx.newPage(); monitor(p, 'walking save migration: ');
    const old = { schema: 1, level: 1, mode: 'paused', resumeMode: 'playing', ticks: 500, distance: 25,
      player: { x: -8, z: 7.2, heading: 0, moving: false }, collected: [0, 1, 2], secrets: [0], lit: [0], charge: 0, stars: 0,
      channel: { beacon: null, progress: 0 } };
    await p.addInitScript(data => localStorage.setItem('games:save:lantern', JSON.stringify({ version: 1, savedAt: Date.now(), data })), old);
    await p.goto(`${baseURL}/lantern.html?debug=1`); await ready(p); await p.evaluate(() => __lantern.setRealtime(false));
    await p.locator('[data-action=continue]').click();
    const migrated = await p.evaluate(() => { __lantern.save(); return JSON.parse(localStorage.getItem('games:save:lantern')).data; });
    assert.equal(migrated.schema, 3); assert.deepEqual(migrated.lit, old.lit); assert.deepEqual(migrated.secrets, old.secrets); assert.deepEqual(migrated.collected, old.collected);
    assert.ok(Number.isFinite(migrated.player.y) && migrated.player.y > 1, 'an earlier walking save resumes safely in a spacecraft');
    await ctx.close();
  }
  for (const scenario of ['corrupt', 'blocked']) {
    const ctx = await browser.newContext(), p = await ctx.newPage(); monitor(p, `${scenario}: `);
    await p.addInitScript(scenario => {
      if (scenario === 'blocked') Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); };
      else localStorage.setItem('games:save:lantern', JSON.stringify({ version: 1, savedAt: Date.now(), data: { schema: 1, level: 1, mode: 'playing', player: null } }));
    }, scenario);
    await p.goto(`${baseURL}/lantern.html?debug=1&continue=1`); await ready(p);
    assert.equal(await p.locator('[data-action=continue]').count(), 0, `${scenario}: bad save is ignored`);
    await p.locator('[data-action=start]').click(); assert.equal(await p.evaluate(() => window.__lantern.game.state.mode), 'playing');
    if (scenario === 'blocked') assert.match(await p.locator('#saveStatus').textContent(), /UNAVAILABLE/);
    await ctx.close();
  }
  assert.deepEqual(external, [], 'no external requests'); assert.deepEqual(errors, [], 'no JavaScript errors or failed assets');
  await writeFile('test-results/lantern/results.json', JSON.stringify(reports, null, 2) + '\n'); console.log(JSON.stringify(reports, null, 2));
} finally { await browser?.close(); server?.kill('SIGTERM'); }
