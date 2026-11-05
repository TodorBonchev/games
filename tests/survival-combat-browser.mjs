import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const port = 5353, base = process.env.GAMES_TEST_URL || `http://127.0.0.1:${port}`;
const server = process.env.GAMES_TEST_URL ? null : spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
const output = 'test-results/survival-combat', errors = [], layouts = [];
let browser;
async function gameTime(page, seconds) {
  const start = await page.evaluate(() => window.__game.time);
  await page.waitForFunction(({ start, seconds }) => window.__game.time >= start + seconds, { start, seconds }, { timeout: 60000 });
}
async function boot(context, phone = false) {
  await context.addInitScript(() => { let seed = 4211; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296); });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.stack || String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(`${base}/soldier.html?debug=1&q=low&noscale=1`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
  await page.locator('#startBtn')[phone ? 'tap' : 'click'](); await page.waitForFunction(() => window.__game.mode === 'intro');
  if (phone) await page.locator('#skipBtn').tap(); else await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__game.mode === 'play' && !window.__game.paused);
  return page;
}
async function fixture(page, points) {
  await page.evaluate(points => {
    const g = window.__game; g.clearWave(); g.setPos(0, 0); g.setView(0); g.hp = 100;
    points.forEach(([x, z]) => { g.spawnNear(); const enemy = g.zombies.at(-1); enemy.position.set(x, g.player.position.y, z); Object.assign(enemy.userData, { hp: 1000, maxHp: 1000, speed: 0, arrivalTime: 0, attackWind: 0, attackCooldown: 999, slamWind: 0, slamCooldown: 999, spitCooldown: 999 }); });
  }, points); await gameTime(page, .1);
}
async function bounds(page, selector, avoid = []) {
  const rect = await page.locator(selector).boundingBox(), viewport = page.viewportSize(); assert.ok(rect, `${selector} is visible`);
  assert.ok(rect.x >= -1 && rect.y >= -1 && rect.x + rect.width <= viewport.width + 1 && rect.y + rect.height <= viewport.height + 1, `${selector} within ${viewport.width}×${viewport.height}: ${JSON.stringify(rect)}`);
  for (const other of avoid) {
    if (!await page.locator(other).isVisible()) continue;
    const b = await page.locator(other).boundingBox();
    assert.ok(rect.x + rect.width <= b.x || b.x + b.width <= rect.x || rect.y + rect.height <= b.y || b.y + b.height <= rect.y, `${selector} ${JSON.stringify(rect)} overlaps ${other} ${JSON.stringify(b)}`);
  }
  layouts.push({ viewport, selector, rect });
}
async function fireStart(page, phone = false) {
  if (!phone) { await page.mouse.move(page.viewportSize().width / 2, page.viewportSize().height / 2); await page.mouse.down(); return null; }
  const session = await page.context().newCDPSession(page), box = await page.locator('#fireBtn').boundingBox();
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 31, radiusX: 2, radiusY: 2, force: 1 };
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] }); return { session, point };
}
async function fireStop(page, touch) {
  if (!touch) return page.mouse.up();
  await touch.session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [touch.point] }); await touch.session.detach();
}

try {
  if (server) await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('Combat browser server timeout')), 10000); server.stdout.once('data', () => { clearTimeout(timer); resolve(); }); server.once('error', reject); server.once('exit', code => reject(Error(`Server exited ${code}`))); });
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--enable-unsafe-swiftshader'] });
  const desktop = await browser.newContext({ viewport: { width: 960, height: 640 }, deviceScaleFactor: 1 }), page = await boot(desktop);

  // The real wave spawner creates an arrival; the fixture only brings it into
  // the camera so its actual grace and warning can be inspected on screen.
  await page.waitForFunction(() => window.__game.zombies.some(z => z.userData.arrivalTime > .4));
  const safeArrival = await page.evaluate(() => {
    const g = window.__game, enemy = g.zombies.find(z => z.userData.arrivalTime > 0), { x, z } = enemy.position;
    const safe = g.colliders.circles.every(c => Math.hypot(x - c.x, z - c.z) >= c.r + .6) && g.colliders.boxes.every(b => Math.abs(x - b.x) >= b.hx + .6 || Math.abs(z - b.z) >= b.hz + .6);
    g.setPos(0, 0); g.setView(0); enemy.position.set(0, g.player.position.y, -8); return safe;
  }); assert.ok(safeArrival, 'the real arrival has clear scenery before moving it into the test camera');
  await page.locator('.combat-arrival:not([hidden])').first().waitFor({ state: 'visible' });
  await page.screenshot({ path: `${output}/desktop-arrival.png` });

  await fixture(page, [[0, -8]]); await fireStart(page); await gameTime(page, .8);
  assert.equal(await page.locator('#combatTarget').isVisible(), true); assert.equal(await page.locator('#lastEnemy').isVisible(), true);
  assert.ok(await page.evaluate(() => window.__game.zombies[0].userData.hp < 1000));
  assert.ok(await page.locator('.combat-number:not([hidden])').count() > 0);
  assert.equal(await page.locator('.combat-number').count(), 6);
  await bounds(page, '#combatTarget'); await bounds(page, '#lastEnemy');
  await page.screenshot({ path: `${output}/desktop-target-and-damage.png` });
  await page.evaluate(() => { window.__game.zombies[0].userData.hp = 1; });
  await page.waitForFunction(() => [...document.querySelectorAll('.combat-number:not([hidden])')].some(node => node.textContent.includes('ELIMINATED')));
  assert.equal(await page.evaluate(() => window.__game.combat.kills), 1); await page.screenshot({ path: `${output}/desktop-kill-feedback.png` }); await fireStop(page);

  await fixture(page, [[0, -7], [0, -9], [0, -11], [9, -12]]);
  await page.evaluate(() => { const g = window.__game, trunks = g.scene.getObjectByName('palm-trunks'); window.__combatTrunkMatrix = g.player.matrix.clone(); trunks.getMatrixAt(0, window.__combatTrunkMatrix); trunks.setMatrixAt(0, g.player.matrix.clone().makeScale(5, 10, 5).setPosition(0, g.pos[1], -3)); trunks.computeBoundingSphere(); });
  await fireStart(page); await gameTime(page, 3);
  const health = await page.evaluate(() => window.__game.zombies.map(z => z.userData.hp)); assert.ok(health[3] < 1000); assert.deepEqual(health.slice(0, 3), [1000, 1000, 1000]); await fireStop(page);
  await page.evaluate(() => { const t = window.__game.scene.getObjectByName('palm-trunks'); t.setMatrixAt(0, window.__combatTrunkMatrix); t.computeBoundingSphere(); });

  await fixture(page, [[0, -10]]);
  const barrelFixture = await page.evaluate(async () => {
    const { Raycaster, Vector3 } = await import('three');
    const g = window.__game, trunks = g.scene.getObjectByName('palm-trunks'), muzzle = new Vector3(), head = new Vector3(), ray = new Raycaster();
    g.player.userData.muzzle.getWorldPosition(muzzle); g.zombies[0].userData.head.getWorldPosition(head);
    const intersects = origin => { ray.set(origin, head.clone().sub(origin).normalize()); ray.far = origin.distanceTo(head) - .3; return ray.intersectObject(trunks, false).length > 0; };
    // Find a real low-cover position with margin for the soldier's idle pose.
    // This fixture leaves the camera ray clear and blocks all three barrel rays.
    for (let x = -2; x < 1; x += .1) for (let y = .3; y < 1.5; y += .05) {
      trunks.setMatrixAt(0, g.player.matrix.clone().makeScale(.6, .15, .7).setPosition(x, g.pos[1] + y, -2)); trunks.computeBoundingSphere();
      if (!intersects(g.camera.position) && [-.06, 0, .06].every(offset => intersects(muzzle.clone().add(new Vector3(0, offset, 0))))) return { x, y };
    }
    return null;
  }); assert.ok(barrelFixture, 'construct low cover using the actual rendered barrel and camera rays');
  await fireStart(page); await gameTime(page, .3); assert.equal(await page.locator('#muzzleBlocked').isVisible(), true);
  assert.equal(await page.evaluate(() => window.__game.zombies[0].userData.hp), 1000); await bounds(page, '#muzzleBlocked');
  await page.screenshot({ path: `${output}/desktop-barrel-cover.png` }); await fireStop(page);
  await page.evaluate(() => { const t = window.__game.scene.getObjectByName('palm-trunks'); t.setMatrixAt(0, window.__combatTrunkMatrix); t.computeBoundingSphere(); });

  await fixture(page, [[22, 22]]); await page.keyboard.press('KeyF');
  await page.waitForFunction(() => window.__game.frozenOrb.cooldown > 0 && window.__game.frozenOrb.cooldown < .25, null, { timeout: 60000 });
  await page.keyboard.press('KeyF'); await page.waitForFunction(() => window.__game.frozenOrb.cooldown > 7);
  await page.waitForFunction(() => window.__game.frozenOrb.cooldown > 0 && window.__game.frozenOrb.cooldown < .25, null, { timeout: 60000 });
  await page.keyboard.press('KeyF'); await page.keyboard.press('Escape'); await page.waitForFunction(() => window.__game.paused);
  const pausedOrb = await page.evaluate(() => window.__game.frozenOrb.cooldown); await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.__game.frozenOrb.cooldown), pausedOrb); assert.equal(await page.evaluate(() => window.__game.combatDirector.orbBuffered), false);
  await page.locator('#resumeBtn').click(); await gameTime(page, .45); assert.equal(await page.evaluate(() => window.__game.frozenOrb.cooldown), 0);
  assert.equal(await page.locator('#orbReadyCue').isVisible(), true); await page.screenshot({ path: `${output}/desktop-orb-ready.png` });

  // Real settings controls feed the native input and aim state machines.
  await page.keyboard.press('Escape'); await page.locator('#pauseSettingsBtn').click();
  await page.locator('#survival-pref-aimAssist').uncheck(); await page.locator('#survival-pref-toggleFire').check(); await page.locator('#setClose').click();
  await fixture(page, [[8, -6]]); const manualYaw = await page.evaluate(() => window.__game.yaw);
  await page.mouse.click(480, 320); await gameTime(page, .5);
  assert.equal(await page.evaluate(() => window.__game.yaw), manualYaw, 'disabled assistance leaves the player view alone');
  assert.equal(await page.evaluate(() => window.__game.firing), true, 'toggle fire persists after real mouse release');
  assert.ok(await page.evaluate(() => window.__game.combat.shots > 0));
  await page.mouse.click(480, 320); await gameTime(page, .1); assert.equal(await page.evaluate(() => window.__game.firing), false);
  await page.mouse.click(480, 320); await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => window.__game.firing), false, 'pausing clears the latched trigger');
  await page.locator('#pauseSettingsBtn').click(); await page.locator('#survival-pref-aimAssist').check(); await page.locator('#survival-pref-toggleFire').uncheck();
  await page.locator('#survival-pref-assistStrength').focus(); await page.keyboard.press('Home'); assert.equal(await page.locator('#survival-pref-assistStrength').inputValue(), '0.25'); await page.locator('#setClose').click();
  await fixture(page, [[0, 7]]); const startTurn = await page.evaluate(() => ({ time: window.__game.time, yaw: window.__game.yaw }));
  await fireStart(page); await gameTime(page, .7); const endTurn = await page.evaluate(() => ({ time: window.__game.time, yaw: window.__game.yaw })); await fireStop(page);
  const turn = Math.abs(Math.atan2(Math.sin(endTurn.yaw - startTurn.yaw), Math.cos(endTurn.yaw - startTurn.yaw)));
  assert.ok(turn > .01 && turn <= (endTurn.time - startTurn.time) * 27.5 * Math.PI / 180 + .001, '25% strength limits actual assisted camera turn to 27.5 degrees per second');

  await fixture(page, [[-.6, -.65], [0, -.95], [.6, -.65]]);
  await page.evaluate(() => { for (const z of window.__game.zombies) Object.assign(z.userData, { type: 'walker', attackWind: .01, attackCooldown: 999 }); });
  await gameTime(page, .05); assert.equal(await page.evaluate(() => window.__game.hp), 82);
  await gameTime(page, .3);
  const nearestPair = await page.evaluate(() => { const zs = window.__game.zombies; return Math.min(zs[0].position.distanceTo(zs[1].position), zs[0].position.distanceTo(zs[2].position), zs[1].position.distanceTo(zs[2].position)); });
  assert.ok(nearestPair > .8, 'native simulation spreads the overlapping crowd before the next attack');
  await page.evaluate(() => { const g = window.__game; g.hp = 18; const z = g.zombies[0]; z.position.copy(g.player.position).x += .9; z.userData.attackWind = .01; });
  await page.waitForFunction(() => window.__game.mode === 'over'); assert.match(await page.locator('#deathCause').innerText(), /Overrun/); assert.match(await page.locator('#final').innerText(), /windup/);
  await page.screenshot({ path: `${output}/desktop-death-cause.png` }); await desktop.close();

  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }), phone = await boot(context, true);
    await fixture(phone, [[0, -8]]); const touch = await fireStart(phone, true); await gameTime(phone, .8);
    assert.equal(await phone.locator('#combatTarget').isVisible(), true); assert.equal(await phone.locator('#lastEnemy').isVisible(), true);
    assert.ok(await phone.evaluate(() => window.__game.combat.hits > 0)); assert.ok(await phone.locator('.combat-number:not([hidden])').count() <= 6);
    for (const selector of ['#combatTarget', '#lastEnemy']) await bounds(phone, selector, ['#fireBtn', '#jumpBtn', '#orbBtn', '#stick', '#pauseBtn', '#expeditionJournalBtn']);
    if (await phone.locator('.activity-interact').isVisible()) await bounds(phone, '.activity-interact', ['#orbBtn', '#fireBtn', '#jumpBtn', '#stick']);
    const waypoint = phone.locator('.activity-world-label.is-target:not([hidden])');
    if (await waypoint.isVisible()) await bounds(phone, '.activity-world-label.is-target:not([hidden])', ['#expeditionJournal']);
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await phone.screenshot({ path: `${output}/phone-${viewport.width}-combat.png` }); await fireStop(phone, touch);
    // A true touch pause releases the held controls and removes combat overlays.
    await phone.locator('#pauseBtn').tap(); assert.equal(await phone.locator('#combatDirector').isVisible(), false);
    await context.close();
  }
  assert.deepEqual(errors, []); console.log(JSON.stringify({ result: 'PASS', screenshots: output, layouts }, null, 2));
} finally { await browser?.close(); server?.kill(); }
