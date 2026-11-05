import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const port = 5341, base = process.env.GAMES_TEST_URL || `http://127.0.0.1:${port}`;
const server = process.env.GAMES_TEST_URL ? null : spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
const shots = 'test-results/survival-polish', errors = [], layoutIssues = [], results = [];
let browser;
const angle = value => Math.atan2(Math.sin(value), Math.cos(value));
const waitGame = async (page, seconds) => {
  const start = await page.evaluate(() => window.__game.time);
  await page.waitForFunction(({ start, seconds }) => window.__game.time >= start + seconds, { start, seconds }, { timeout: 60000 });
};
const monitor = (page, name) => {
  page.on('pageerror', error => errors.push(`${name}: ${error.stack || error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`${name}: ${message.text()}`); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
};
async function boot(context, name, phone = false) {
  // Repeatable scenery; rendering, movement, input, and the game RAF stay native.
  await context.addInitScript(() => { let seed = 4211; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296); });
  const page = await context.newPage(); monitor(page, name);
  await page.goto(`${base}/soldier.html?debug=1&q=low&noscale=1`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
  if (phone) await page.locator('#startBtn').tap(); else await page.locator('#startBtn').click();
  await page.waitForFunction(() => window.__game.mode === 'intro');
  if (phone) await page.locator('#skipBtn').tap(); else await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__game.mode === 'play' && !window.__game.paused);
  return page;
}
async function targetFixture(page, offsets) {
  await page.evaluate(offsets => {
    const game = window.__game; game.clearWave(); game.setPos(0, 0); game.setView(0); game.hp = 100;
    for (const [x, z] of offsets) {
      game.spawnNear(); const enemy = game.zombies.at(-1);
      enemy.position.set(x, game.player.position.y, z);
      Object.assign(enemy.userData, { hp: 1000, speed: 0, attackWind: 0, attackCooldown: 9999, slamWind: 0, slamCooldown: 9999, spitCooldown: 9999 });
    }
  }, offsets);
  await waitGame(page, .08);
}
async function assertLayout(page, selector, avoid = []) {
  const box = await page.locator(selector).boundingBox(); assert.ok(box, `${selector} has bounds`);
  const view = page.viewportSize();
  if (!(box.x >= -1 && box.y >= -1 && box.x + box.width <= view.width + 1 && box.y + box.height <= view.height + 1)) layoutIssues.push(`${view.width}×${view.height}: ${selector} exceeds viewport: ${JSON.stringify(box)}`);
  for (const other of avoid) {
    if (!await page.locator(other).isVisible()) continue;
    const b = await page.locator(other).boundingBox(); if (!b) continue;
    const apart = box.x + box.width <= b.x || b.x + b.width <= box.x || box.y + box.height <= b.y || b.y + b.height <= box.y;
    if (!apart) await page.screenshot({ path: `${shots}/layout-overlap.png` });
    if (!apart) layoutIssues.push(`${view.width}×${view.height}: ${selector} ${JSON.stringify(box)} overlaps ${other} ${JSON.stringify(b)}`);
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'no horizontal overflow');
}
const visibleSectors = page => page.locator('.combat-awareness-bearing:not([hidden])').evaluateAll(nodes => nodes.map(node => Number(node.dataset.sector)).sort((a, b) => a - b));

try {
  if (server) await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Survival browser server timeout')), 10000);
    server.stdout.once('data', () => { clearTimeout(timer); resolve(); });
    server.once('error', reject); server.once('exit', code => { clearTimeout(timer); reject(Error(`Server exited: ${code}`)); });
  });
  await mkdir(shots, { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--enable-unsafe-swiftshader'] });

  if (process.env.BROWSER_CASE !== 'phone') {
  const desktop = await browser.newContext({ viewport: { width: 960, height: 640 }, deviceScaleFactor: 1 });
  const page = await boot(desktop, 'desktop');
  await targetFixture(page, [[0, -8], [6, 0], [0, 7]]);
  await page.waitForFunction(() => document.querySelector('.combat-awareness').dataset.threatCount === '3');
  assert.deepEqual(await visibleSectors(page), [0, 2, 4]);
  await assertLayout(page, '.combat-awareness-ring');
  await page.screenshot({ path: `${shots}/desktop-threat-bearings.png` });
  await page.evaluate(() => window.__game.setView(Math.PI / 2)); await waitGame(page, .08);
  assert.deepEqual(await visibleSectors(page), [2, 4, 6], 'bearings follow the camera heading');
  await page.evaluate(() => {
    const g = window.__game; g.setView(0); const enemy = g.zombies[1];
    enemy.position.copy(g.player.position).x += 1.1;
    Object.assign(enemy.userData, { type: 'walker', attackWind: .08, attackCooldown: 0 });
  });
  await page.waitForFunction(() => window.__game.hp < 100);
  assert.equal(await page.locator('.combat-awareness-hit').evaluate(node => node.hidden), false, 'real melee damage produces a hit bearing');
  assert.ok(await page.locator('.combat-awareness-bearing.urgent:not([hidden])').count() > 0);
  await page.keyboard.press('KeyP'); await page.waitForFunction(() => window.__game.paused);
  assert.equal(await page.locator('.combat-awareness').evaluate(node => node.hidden), true, 'pause clears stale combat cues');
  await page.locator('#resumeBtn').click(); await page.waitForFunction(() => !window.__game.paused);

  await targetFixture(page, [[0, 5]]);
  assert.ok(await page.evaluate(() => !!document.pointerLockElement), 'desktop uses native pointer lock');
  const initialYaw = await page.evaluate(() => window.__game.yaw);
  await page.mouse.down(); await waitGame(page, .32);
  const earlyTurn = Math.abs(angle((await page.evaluate(() => window.__game.yaw)) - initialYaw));
  assert.ok(earlyTurn < 45 * Math.PI / 180, `rear acquisition is bounded: ${earlyTurn * 180 / Math.PI}°`);
  await page.mouse.up(); await waitGame(page, .08);
  await targetFixture(page, [[0, -10]]);
  await page.mouse.down(); await waitGame(page, .7);
  assert.ok(await page.evaluate(() => window.__game.combat.hits > 0), 'assisted shots hit the forward fixture');
  await page.screenshot({ path: `${shots}/desktop-before-manual-aim.png` });
  await page.mouse.move(480, 320, { steps: 12 });
  await page.mouse.move(940, 320, { steps: 12 });
  const manual = await page.evaluate(() => ({ yaw: window.__game.yaw, shots: window.__game.combat.shots }));
  await waitGame(page, 1.35);
  const afterManual = await page.evaluate(() => ({ yaw: window.__game.yaw, shots: window.__game.combat.shots }));
  assert.ok(Math.abs(angle(afterManual.yaw - manual.yaw)) < .015, 'native manual mouse look retains ownership after the grace period');
  assert.ok(afterManual.shots >= manual.shots + 10, 'manual fire keeps its normal cadence');
  await page.screenshot({ path: `${shots}/desktop-after-manual-aim.png` });
  await page.mouse.up();

  await page.evaluate(() => window.__game.clearWave());
  await page.locator('#recoveryPanel').waitFor({ state: 'visible' });
  await page.keyboard.press('KeyC'); await page.waitForFunction(() => window.__game.recoveryHeld);
  const countdown = await page.evaluate(() => window.__game.waveBreak);
  await page.evaluate(() => { const g = window.__game, p = g.field.position; g.setPos(p[0], p[2]); g.hp = 40; g.spawnDrop('medkit', 0); });
  await waitGame(page, 5.2);
  assert.equal(await page.evaluate(() => window.__game.field.captured), true, 'held recovery allows a full five-second capture');
  assert.equal(await page.evaluate(() => window.__game.hp), 70, 'supplies remain collectible while held');
  assert.equal(await page.evaluate(() => window.__game.waveBreak), countdown);
  await assertLayout(page, '#recoveryPanel');
  await page.screenshot({ path: `${shots}/desktop-held-recovery.png` });
  await page.keyboard.press('KeyP'); await page.waitForFunction(() => window.__game.paused);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('games:save:soldier')).data.recoveryHeld), true);
  await page.reload(); await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
  await page.locator('#continueBtn').click(); await page.waitForFunction(() => window.__game.mode === 'play' && !window.__game.paused);
  assert.equal(await page.evaluate(() => window.__game.recoveryHeld), true);
  await waitGame(page, 4.2); assert.equal(await page.evaluate(() => window.__game.mode), 'play', 'reload does not resume the automatic countdown');
  await page.keyboard.press('KeyN'); await page.waitForFunction(() => window.__game.mode === 'upgrade');
  await page.keyboard.press('KeyN');
  assert.equal(await page.locator('#upgradeChoices button:enabled').count(), 3);
  assert.equal(await page.evaluate(() => Object.values(window.__game.progression.ranks).reduce((a, b) => a + b, 0)), 0);
  await page.screenshot({ path: `${shots}/desktop-upgrade-choice.png` });
  await page.locator('#upgradeChoices button').first().click(); await page.waitForFunction(() => window.__game.mode === 'play' && window.__game.wave === 2);
  assert.equal(await page.evaluate(() => Object.values(window.__game.progression.ranks).reduce((a, b) => a + b, 0)), 1);
  results.push('desktop: bearings, real melee hit cue, bounded initial turn, manual pointer-lock aim, held capture/supplies, saved reload, C/N and one upgrade');
  await desktop.close();
  }

  if (process.env.BROWSER_CASE !== 'desktop') {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const mobile = await boot(phone, 'phone', true), cdp = await phone.newCDPSession(mobile);
  await targetFixture(mobile, [[0, -8], [6, 0], [0, 7]]);
  await mobile.waitForFunction(() => document.querySelector('.combat-awareness').dataset.threatCount === '3');
  await assertLayout(mobile, '.combat-awareness-ring', ['#stick', '#fireBtn', '#jumpBtn', '#orbBtn']);
  await mobile.screenshot({ path: `${shots}/phone-threat-bearings.png` });
  await mobile.evaluate(() => window.__game.clearWave()); await mobile.locator('#recoveryPanel').waitFor({ state: 'visible' });
  await assertLayout(mobile, '#recoveryPanel', ['#stick', '#fireBtn', '#jumpBtn', '#orbBtn']);
  await mobile.evaluate(() => {
    window.__touchTrace = [];
    for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'click']) document.addEventListener(type, e => window.__touchTrace.push({ type, target: e.target.id, pointerId: e.pointerId, pointerType: e.pointerType, x: e.clientX, y: e.clientY, changed: [...(e.changedTouches || [])].map(t => t.identifier) }), true);
  });
  const stick = await mobile.locator('#stick').boundingBox(), hold = await mobile.locator('#recoveryHold').boundingBox();
  const center = { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2, id: 1 }, moved = { ...center, y: center.y - stick.height * .3 };
  const holdPoint = { x: hold.x + hold.width / 2, y: hold.y + hold.height / 2, id: 2 };
  const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  await touch('touchStart', [center]); await touch('touchMove', [moved]);
  await waitGame(mobile, .2); const moving = await mobile.evaluate(() => window.__game.pos);
  // CDP touchEnd lists the fingers that end (not those left on the screen).
  await touch('touchStart', [moved, holdPoint]); await touch('touchEnd', [holdPoint]);
  await mobile.waitForFunction(() => window.__game.recoveryHeld, null, { timeout: 2500 });
  await waitGame(mobile, .3); const heldMove = await mobile.evaluate(() => window.__game.pos);
  assert.ok(Math.hypot(heldMove[0] - moving[0], heldMove[2] - moving[2]) > .4, 'second-finger Hold does not drop the movement thumb');
  await touch('touchEnd', []);
  await mobile.screenshot({ path: `${shots}/phone-held-recovery.png` });
  // A nearby outpost has its own interactive prompt; both recovery actions and
  // that prompt must stay usable across portrait and compact landscape layouts.
  const away = await mobile.evaluate(() => {
    const g = window.__game, field = g.field.position, stations = g.activities.world.stations;
    for (let i = 0; i < 64; i++) {
      const a = i * Math.PI / 32, x = field[0] + Math.cos(a) * 10, z = field[2] + Math.sin(a) * 10;
      if (stations.every(s => Math.hypot(s.x - x, s.z - z) > 6)) return [x, z];
    }
    throw Error('No reproducible field HUD fixture away from outposts');
  });
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 640, height: 360 }]) {
    await mobile.setViewportSize(viewport);
    await mobile.evaluate(([x, z]) => window.__game.setPos(x, z), away); await waitGame(mobile, .12);
    await mobile.locator('#activityInteract').waitFor({ state: 'hidden' });
    await mobile.locator('#fieldObjective').waitFor({ state: 'visible' });
    await mobile.screenshot({ path: `${shots}/phone-recovery-field-${viewport.width}x${viewport.height}.png` });
    await assertLayout(mobile, '#recoveryPanel', ['#stick', '#fireBtn', '#jumpBtn', '#orbBtn', '#fieldObjective']);
    await assertLayout(mobile, '#fieldObjective', ['#stick', '#fireBtn', '#jumpBtn', '#orbBtn', '#expeditionJournal', '#expeditionWaypoint']);
    await mobile.evaluate(() => { const g = window.__game, station = g.activities.world.stations.find(s => s.id === 'garden'); g.setPos(station.x, station.z); });
    await waitGame(mobile, .12);
    await mobile.locator('#activityInteract').waitFor({ state: 'visible' });
    await mobile.screenshot({ path: `${shots}/phone-recovery-outpost-${viewport.width}x${viewport.height}.png` });
    await assertLayout(mobile, '#recoveryPanel', ['#stick', '#fireBtn', '#jumpBtn', '#orbBtn', '#activityInteract']);
    await assertLayout(mobile, '#activityInteract', ['#stick', '#fireBtn', '#jumpBtn', '#orbBtn']);
    assert.equal(await mobile.evaluate(() => window.__game.recoveryHeld), true, 'rotation retains held recovery');
  }
  await mobile.setViewportSize({ width: 390, height: 844 }); await waitGame(mobile, .12);
  const ready = await mobile.locator('#recoveryReady').boundingBox(), readyPoint = { x: ready.x + ready.width / 2, y: ready.y + ready.height / 2, id: 3 };
  await touch('touchStart', [readyPoint]); await touch('touchMove', [{ ...readyPoint, y: readyPoint.y - 70 }]); await touch('touchEnd', []);
  await waitGame(mobile, .2); assert.equal(await mobile.evaluate(() => window.__game.mode), 'play', 'dragging away cancels Ready');
  await mobile.locator('#recoveryReady').tap(); await mobile.waitForFunction(() => window.__game.mode === 'upgrade');
  await mobile.waitForTimeout(350);
  assert.equal(await mobile.evaluate(() => window.__game.mode), 'upgrade', 'compatibility click does not select an underlying upgrade');
  assert.equal(await mobile.evaluate(() => Object.values(window.__game.progression.ranks).reduce((a, b) => a + b, 0)), 0);
  assert.equal(await mobile.locator('#upgradeChoices button:enabled').count(), 3);
  await mobile.screenshot({ path: `${shots}/phone-ready-upgrades.png` });
  await mobile.locator('#upgradeChoices button').first().tap(); await mobile.waitForFunction(() => window.__game.mode === 'play' && window.__game.wave === 2);
  assert.equal(await mobile.evaluate(() => Object.values(window.__game.progression.ranks).reduce((a, b) => a + b, 0)), 1);
  assert.equal(await mobile.evaluate(() => window.__game.recoveryHeld), false);
  results.push('phone: bounded HUD, native two-finger movement + Hold, drag cancellation, ordinary Ready without click-through, exactly one upgrade');
  await phone.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(layoutIssues, [], 'all recovery, outpost, and touch controls remain separate');
  console.log(`Survival polish browser passed:\n${results.join('\n')}\nScreenshots: ${shots}`);
} catch (error) {
  console.error('Browser errors:', errors);
  if (layoutIssues.length) console.error('Layout issues:', layoutIssues);
  const current = browser?.contexts().at(-1)?.pages().at(-1);
  if (current) {
    await current.screenshot({ path: `${shots}/failure.png` }).catch(() => {});
    console.error('Failure state:', await current.evaluate(() => { const g = window.__game; return g ? { mode: g.mode, paused: g.paused, wave: g.wave, remaining: g.waveBreak, held: g.recoveryHeld, position: g.pos, pointerLock: !!document.pointerLockElement } : null; }).catch(() => null));
    console.error('Touch trace:', await current.evaluate(() => window.__touchTrace || []).catch(() => []));
  }
  throw error;
} finally { await browser?.close(); server?.kill(); }
