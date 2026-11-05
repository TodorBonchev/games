import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const port = 5357, base = process.env.GAMES_TEST_URL || `http://127.0.0.1:${port}`;
const server = process.env.GAMES_TEST_URL ? null : spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
const output = 'test-results/touch-movement', errors = [], results = [];
let browser;
const distance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const position = page => page.evaluate(() => [...window.__game.pos]);
async function waitGame(page, seconds) {
  const start = await page.evaluate(() => window.__game.time);
  await page.waitForFunction(({ start, seconds }) => window.__game.time >= start + seconds, { start, seconds }, { timeout: 60000 });
}
async function touchDriver(page) {
  const cdp = await page.context().newCDPSession(page), fingers = new Map();
  const point = (id, x, y) => ({ id, x, y, radiusX: 2, radiusY: 2, force: 1 });
  return {
    async down(id, x, y) { fingers.set(id, point(id, x, y)); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...fingers.values()] }); },
    async move(id, x, y) { fingers.set(id, point(id, x, y)); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [...fingers.values()] }); },
    // CDP expects ended identifiers here, not the fingers that remain down.
    async up(id) { const ended = fingers.get(id); fingers.delete(id); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [ended] }); },
    async cancel() { fingers.clear(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); },
  };
}
async function center(page, selector) {
  const box = await page.locator(selector).boundingBox(); assert.ok(box, `${selector} is visible`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, width: box.width };
}
async function resetPosition(page) {
  await page.evaluate(() => { window.__game.setPos(0, 0); window.__game.setView(0); });
  await waitGame(page, .05);
}
async function checkPhone(leftHanded) {
  const label = leftHanded ? 'left-handed' : 'right-handed';
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await context.addInitScript(leftHanded => {
    let seed = 4211; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    localStorage.setItem('szCombatPreferences:v1', JSON.stringify({ schema: 1, leftHanded }));
  }, leftHanded);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`${label}: ${error.stack || error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`${label}: ${message.text()}`); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(`${base}/soldier.html?debug=1&q=low&noscale=1`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
  await page.locator('#startBtn').tap(); await page.locator('#skipBtn').tap();
  await page.waitForFunction(() => window.__game.mode === 'play');
  // Fixtures isolate movement from combat; input, collisions and RAF are real.
  await page.evaluate(() => window.__game.clearWave());
  await page.locator('#recoveryHold').tap();
  await resetPosition(page);
  const touch = await touchDriver(page);
  const pad = await center(page, '#stick'), origin = { x: pad.x + (leftHanded ? -24 : 24), y: pad.y - 32 };
  const start = await position(page);
  await touch.down(1, origin.x, origin.y); await waitGame(page, 1.2);
  assert.ok(distance(start, await position(page)) < .025, 'off-center touchdown remains completely neutral');
  assert.equal(await page.locator('body').evaluate(node => node.classList.contains('sprinting')), false);
  const floating = await page.locator('#stick').boundingBox();
  assert.ok(floating.x >= 0 && floating.x + floating.width <= 390 && floating.y >= 0 && floating.y + floating.height <= 844);
  assert.ok(Math.abs(floating.y + floating.height / 2 - origin.y) < 1, 'pad visually follows the actual vertical touch origin');
  await touch.move(1, origin.x + 3, origin.y - 3); await waitGame(page, .2);
  assert.ok(distance(start, await position(page)) < .025, 'thumb jitter remains inside the deadzone');
  await touch.move(1, origin.x, origin.y - pad.width * .4 * .58); await waitGame(page, .5);
  const walked = distance(start, await position(page)); assert.ok(walked > 1 && walked < 2.1, `half analog speed moves ${walked.toFixed(2)}m`);
  assert.equal(await page.locator('body').evaluate(node => node.classList.contains('sprinting')), false);
  await page.screenshot({ path: `${output}/${label}-floating-walk.png` });
  await touch.up(1); const released = await position(page); await waitGame(page, .15);
  assert.ok(distance(released, await position(page)) < .025);
  assert.equal(await page.locator('#stick').evaluate(node => node.style.getPropertyValue('--stick-offset-x')), '');

  await resetPosition(page);
  const currentPad = await center(page, '#stick');
  await touch.down(1, currentPad.x, currentPad.y); await touch.move(1, currentPad.x, currentPad.y - currentPad.width * .4);
  await waitGame(page, .5); const sprinted = distance([0, 0, 0], await position(page));
  assert.ok(sprinted > walked * 2.3, 'full thumb travel produces a distinct sprint');
  const pause = await center(page, '#pauseBtn'); await touch.down(8, pause.x, pause.y); await touch.up(8);
  await page.waitForFunction(() => window.__game.paused);
  assert.equal(await page.locator('#stick').evaluate(node => node.classList.contains('active')), false);
  await touch.up(1); await page.locator('#resumeBtn').tap();
  const resumed = await position(page); await waitGame(page, .2); assert.ok(distance(resumed, await position(page)) < .025, 'pause never leaves the thumb latched');

  await resetPosition(page);
  await page.evaluate(() => {
    const game = window.__game; game.spawnNear(); const enemy = game.zombies.at(-1);
    enemy.position.set(0, game.player.position.y, 10);
    Object.assign(enemy.userData, { hp: 10000, speed: 0, attackCooldown: 9999, slamCooldown: 9999, spitCooldown: 9999 });
  });
  const fire = await center(page, '#fireBtn');
  await touch.down(1, currentPad.x, currentPad.y); await touch.move(1, currentPad.x, currentPad.y - currentPad.width * .4);
  await touch.down(2, fire.x, fire.y); await waitGame(page, 1.75);
  const stable = await page.evaluate(() => ({ pos: [...window.__game.pos], yaw: window.__game.yaw, shots: window.__game.combat.shots }));
  assert.ok(Math.abs(stable.yaw) > 2, `rear-target assist really rotated the camera ${stable.yaw}rad`);
  assert.ok(stable.pos[2] < -7 && Math.abs(stable.pos[0]) < .15, 'unchanged forward thumb keeps its world route throughout assisted turn');
  await page.screenshot({ path: `${output}/${label}-stable-assisted-steering.png` });
  // The long forward route approaches scenery. Isolate this steering check
  // back in the open without changing either held finger or camera heading.
  await page.evaluate(() => window.__game.setPos(0, 0));
  const drag = leftHanded ? 50 : -50;
  await touch.move(2, fire.x + drag, fire.y); const beforeLook = await position(page); await waitGame(page, .3);
  const afterLook = await position(page), intended = -drag * 2.4 / 390;
  const travelled = Math.atan2(-(afterLook[0] - beforeLook[0]), -(afterLook[2] - beforeLook[2]));
  assert.ok(Math.abs(travelled - intended) < .06, `manual Fire look steers the movement heading: ${travelled} vs ${intended}`);
  assert.equal(await page.evaluate(() => window.__game.firing), true);
  await touch.up(1); assert.equal(await page.evaluate(() => window.__game.firing), true, 'releasing move never releases Fire');
  await touch.up(2); assert.equal(await page.evaluate(() => window.__game.firing), false);
  await page.evaluate(() => window.__game.clearWave());

  if (!leftHanded) {
    await page.setViewportSize({ width: 844, height: 390 }); await waitGame(page, .1);
    await resetPosition(page); const landscape = await center(page, '#stick');
    const offset = { x: landscape.x + 24, y: landscape.y - 30 }, before = await position(page);
    await touch.down(1, offset.x, offset.y); await waitGame(page, .3);
    assert.ok(distance(before, await position(page)) < .025, 'landscape off-center contact is also neutral');
    await touch.move(1, offset.x, offset.y - landscape.width * .4); await waitGame(page, .2);
    await page.screenshot({ path: `${output}/landscape-floating-steering.png` });
    await page.setViewportSize({ width: 390, height: 844 }); await touch.cancel(); await waitGame(page, .1);
    const rotated = await position(page); await waitGame(page, .2);
    assert.ok(distance(rotated, await position(page)) < .025, 'rotation cancels the gesture and its heading');
    assert.equal(await page.locator('#stick').evaluate(node => node.classList.contains('active')), false);
  }
  results.push({ hand: label, walked: Number(walked.toFixed(2)), sprinted: Number(sprinted.toFixed(2)), assistedTurnDegrees: Number((stable.yaw * 180 / Math.PI).toFixed(1)) });
  await context.close();
}
try {
  if (server) await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('Server startup timeout')), 10000);
    server.stdout.once('data', () => { clearTimeout(timeout); resolve(); }); server.once('error', reject);
  });
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--enable-unsafe-swiftshader'] });
  await checkPhone(false); await checkPhone(true);
  assert.deepEqual(errors, [], 'no script, console, or asset errors');
  console.log(JSON.stringify({ passed: true, results, screenshots: output }, null, 2));
} finally { await browser?.close(); server?.kill(); }
