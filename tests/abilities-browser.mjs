// Real input and WebGL coverage for flight, spell controls, and sky wildlife.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const port = 5184;
const server = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
const errors = [];
let browser;
const horizontalDistance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
async function waitGame(page, seconds) {
  const time = await page.evaluate(() => window.__game.time);
  await page.waitForFunction(({ time, seconds }) => window.__game.time >= time + seconds, { time, seconds }, { timeout: 60000 });
}
async function state(page) {
  return page.evaluate(() => ({ position: window.__game.pos, jetpack: window.__game.jetpack, orb: window.__game.frozenOrb }));
}
async function center(page, selector, id) {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box, `${selector} is visible`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, id };
}
async function land(page) {
  await page.waitForFunction(() => !window.__game.jetpack.active && Math.abs(window.__game.jetpack.velocity) < .001, null, { timeout: 60000 });
}
async function checkFirstPerson(page) {
  await waitGame(page, .05);
  const view = await page.evaluate(() => {
    const game = window.__game;
    return { mode: game.cameraMode, soldier: game.player.visible, gun: game.scene.getObjectByName('first-person-view').visible, eyeHeight: game.camera.position.y - game.pos[1] };
  });
  assert.equal(view.mode, 'first');
  assert.equal(view.soldier, false, 'first person hides the external soldier');
  assert.equal(view.gun, true, 'first person renders the camera-space weapon');
  assert.ok(Math.abs(view.eyeHeight - 1.65) < .001, 'first-person camera follows eye height in flight');
  assert.equal(await page.locator('#cameraLabel').textContent(), '1P');
}
async function prepare(page, touch) {
  page.on('pageerror', error => errors.push(error.stack || error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto(`http://127.0.0.1:${port}/?debug=1&noscale=1&q=low`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
  await page.locator('#startBtn').click();
  await page.waitForFunction(() => window.__game.mode === 'intro');
  if (touch) await page.locator('#skipBtn').tap();
  else await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__game.mode === 'play');
  // Keep one inert enemy alive so waves and combat cannot interrupt input checks.
  await page.evaluate(() => {
    const game = window.__game;
    game.clearWave(); game.setPos(0, 0); game.setView(0, .06);
    const sentinel = game.spawnElite(true);
    sentinel.position.x += 40; sentinel.userData.speed = 0; sentinel.userData.slamCooldown = 9999;
    document.activeElement?.blur();
  });
  await waitGame(page, .15);
  assert.ok(await page.locator('#orbBtn').isVisible());
  assert.equal(await page.evaluate(() => window.__game.scene.getObjectByName('island-birds')?.userData.birdCount), 9, 'low tier renders a bounded flock');
  assert.ok(await page.evaluate(() => !!window.__game.player.getObjectByName('jetpack')), 'soldier carries visible jetpack hardware');
}

try {
  await new Promise((accept, reject) => {
    const timer = setTimeout(() => reject(new Error('Ability test server did not start')), 10000);
    server.stdout.once('data', () => { clearTimeout(timer); accept(); });
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Ability test server exited: ${code}`)); });
  });
  await mkdir('test-results', { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--enable-unsafe-swiftshader'] });

  const desktop = await browser.newContext({ viewport: { width: 960, height: 640 }, deviceScaleFactor: 1 });
  const page = await desktop.newPage();
  await prepare(page, false);
  const grounded = await state(page);
  await page.keyboard.press('Space');
  await waitGame(page, .15);
  const tapped = await state(page);
  assert.ok(tapped.position[1] > grounded.position[1] + .3, 'Space tap jumps');
  assert.equal(tapped.jetpack.active, false, 'a tap never engages thrust');
  assert.equal(tapped.jetpack.fuel, 1, 'jumping uses no jetpack fuel');
  await land(page);

  await page.keyboard.down('Space');
  await waitGame(page, .8);
  const flying = await state(page);
  assert.equal(flying.jetpack.active, true, 'holding Space engages thrust');
  assert.ok(flying.position[1] > grounded.position[1] + 2.5, 'held jump climbs above the normal jump');
  assert.ok(flying.jetpack.fuel < 1, 'flight consumes fuel');
  assert.ok(await page.evaluate(() => window.__game.player.getObjectByName('jetpack-exhaust').visible), 'flight lights both exhausts');
  await page.keyboard.down('KeyW');
  await waitGame(page, .3);
  await page.keyboard.up('KeyW');
  assert.ok(horizontalDistance(flying.position, (await state(page)).position) > .5, 'keyboard movement steers while airborne');
  await page.keyboard.press('KeyF');
  const cast = await state(page);
  assert.ok(cast.orb.active && cast.orb.cooldown > 7, 'F launches an orb and starts cooldown');
  assert.equal(await page.locator('#orbBtn').isDisabled(), true);
  await waitGame(page, .2);
  await page.keyboard.press('KeyF');
  assert.ok((await state(page)).orb.cooldown < cast.orb.cooldown, 'repeated F cannot restart cooldown');
  await page.screenshot({ path: 'test-results/abilities-desktop-flight-orb.png' });
  await page.keyboard.press('KeyV');
  await checkFirstPerson(page);
  await page.screenshot({ path: 'test-results/abilities-desktop-first-person.png' });
  await page.keyboard.press('KeyV');
  await waitGame(page, .05);
  assert.equal(await page.evaluate(() => window.__game.player.visible), true, 'V restores the third-person soldier');
  await page.keyboard.up('Space');
  await waitGame(page, .4);
  const released = await state(page);
  assert.equal(released.jetpack.active, false, 'release stops thrust');
  assert.equal(released.jetpack.held, false);
  assert.ok(released.jetpack.velocity < 0, 'release leads into descent');
  await land(page);
  const depleted = (await state(page)).jetpack.fuel;
  await waitGame(page, .4);
  assert.ok((await state(page)).jetpack.fuel > depleted, 'landing replenishes jetpack fuel');
  await page.waitForFunction(() => window.__game.frozenOrb.ready, null, { timeout: 60000 });
  assert.equal(await page.locator('#orbCooldown').textContent(), 'READY');
  assert.equal(await page.locator('#orbBtn').isDisabled(), false);
  await page.evaluate(() => window.__game.pause(true));
  await page.locator('[data-camera="first"]').click();
  assert.equal(await page.locator('[data-camera="first"]').getAttribute('aria-pressed'), 'true', 'settings can select first person');
  assert.equal(await page.evaluate(() => localStorage.getItem('szCamera')), 'first');
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
  assert.equal(await page.evaluate(() => window.__game.cameraMode), 'first', 'camera preference survives reload');
  console.log('PASS desktop abilities: tap/hold flight, steering, recharge, F cooldown, V camera, settings and persistence');
  await desktop.close();

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const mobile = await phone.newPage(), cdp = await phone.newCDPSession(mobile);
  await prepare(mobile, true);
  await mobile.locator('#cameraBtn').tap();
  await checkFirstPerson(mobile);
  const initial = await state(mobile), stick = await center(mobile, '#stick', 1), jump = await center(mobile, '#jumpBtn', 2);
  const movedStick = { ...stick, y: stick.y - 38 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [movedStick] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [movedStick, jump] });
  await waitGame(mobile, .7);
  const touchFlight = await state(mobile);
  assert.ok(touchFlight.jetpack.active && touchFlight.jetpack.held, 'touch hold activates jetpack');
  assert.ok(touchFlight.position[1] > initial.position[1] + 2, 'touch hold climbs');
  assert.ok(horizontalDistance(initial.position, touchFlight.position) > 1, 'simultaneous joystick steers during flight');
  const orbFinger = await center(mobile, '#orbBtn', 3);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [movedStick, jump, orbFinger] });
  await waitGame(mobile, .1);
  const tripleTouch = await state(mobile);
  assert.ok(tripleTouch.orb.active && tripleTouch.orb.cooldown > 7, 'a third finger casts while steering and holding flight');
  assert.ok(tripleTouch.jetpack.active && tripleTouch.jetpack.held, 'casting with a third finger preserves jetpack input');
  assert.ok(horizontalDistance(touchFlight.position, tripleTouch.position) > .1, 'casting with a third finger preserves steering');
  await mobile.screenshot({ path: 'test-results/abilities-mobile-three-fingers.png' });
  // CDP touchEnd lists the fingers being lifted, not the fingers still held.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [orbFinger] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [jump] });
  await waitGame(mobile, .05);
  assert.equal((await state(mobile)).jetpack.active, false, 'releasing only jump clears thrust while the joystick remains held');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await land(mobile);

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [jump] });
  await waitGame(mobile, .3);
  assert.ok((await state(mobile)).jetpack.active);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  assert.equal((await state(mobile)).jetpack.held, false, 'pointer cancellation releases the held jetpack button');
  assert.equal((await state(mobile)).jetpack.active, false);
  await land(mobile);

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [movedStick, jump] });
  await waitGame(mobile, .35);
  assert.ok((await state(mobile)).jetpack.active);
  await mobile.setViewportSize({ width: 844, height: 390 });
  await mobile.waitForFunction(() => !document.body.classList.contains('portrait') && !window.__game.jetpack.held);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const rotated = await state(mobile);
  assert.equal(rotated.jetpack.active, false, 'orientation change clears thrust');
  await waitGame(mobile, .2);
  assert.ok(horizontalDistance(rotated.position, (await state(mobile)).position) < .005, 'orientation change also releases the steering stick');
  await land(mobile);
  await mobile.waitForFunction(() => window.__game.frozenOrb.ready, null, { timeout: 60000 });
  await mobile.locator('#cameraBtn').tap();
  await waitGame(mobile, .05);
  assert.equal(await mobile.evaluate(() => window.__game.cameraMode), 'third', 'HUD toggles back to third person');

  const orbBefore = await state(mobile);
  await mobile.locator('#orbBtn').tap();
  const orbAfter = await state(mobile);
  assert.ok(orbAfter.orb.active && orbAfter.orb.cooldown > 7, 'a real touchscreen tap casts Frozen Orb');
  assert.equal(await mobile.locator('#orbBtn').isDisabled(), true, 'mobile orb button shows cooldown');
  await waitGame(mobile, .15);
  assert.ok(horizontalDistance(orbBefore.position, (await state(mobile)).position) < .005, 'casting does not start joystick movement');
  await mobile.screenshot({ path: 'test-results/abilities-mobile-orb.png' });
  const flightButton = await center(mobile, '#jumpBtn', 7);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [flightButton] });
  await waitGame(mobile, .3);
  await mobile.screenshot({ path: 'test-results/abilities-mobile-flight-orb.png' });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  console.log('PASS mobile abilities: three-finger movement/flight/casting, release, cancel, rotation and orb touch casting');
  await phone.close();
  assert.deepEqual(errors, [], 'abilities have no browser runtime or shader errors');
  console.log('Ability screenshots saved in test-results/.');
} finally {
  if (errors.length) console.error('Browser errors:', errors);
  await browser?.close();
  if (server.exitCode === null) { server.kill(); await once(server, 'exit'); }
}
