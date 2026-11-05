// Exercise the shared settings through the actual zombie game and native input.
// Combat fixtures only place stationary targets / return to clear ground; they
// never manufacture shots, hits, movement, input states, or successful results.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';

const port = 5352, base = process.env.GAMES_TEST_URL || `http://127.0.0.1:${port}`;
const output = 'test-results/survival-settings', errors = [];
let server, browser, currentPage;
const key = id => `#survival-pref-${id}`;
async function gameTime(page, seconds) {
  const start = await page.evaluate(() => __game.time);
  await page.waitForFunction(({ start, seconds }) => __game.time >= start + seconds, { start, seconds }, { timeout: 60000 });
}
async function press(page, selector, touch = false) { await page.locator(selector)[touch ? 'tap' : 'click'](); }
async function expandFor(page, id) {
  const details = page.locator(key(id)).locator('xpath=ancestor::details[1]');
  if (!await details.evaluate(node => node.open)) await details.locator('summary').click();
}
async function toggle(page, id, value) { await expandFor(page, id); await page.locator(key(id)).setChecked(value); }
async function range(page, id, steps) {
  await expandFor(page, id); await page.locator(key(id)).focus(); await page.keyboard.press('Home');
  for (let step = 0; step < steps; step++) await page.keyboard.press('ArrowRight');
}
async function pauseSettings(page, touch = false) {
  if (touch) await press(page, '#pauseBtn', true); else await page.keyboard.press('Escape');
  await page.waitForFunction(() => __game.paused);
  await press(page, '#pauseSettingsBtn', touch);
  await page.locator('#setPanel').waitFor({ state: 'visible' });
}
async function closeSettings(page) {
  await page.locator('#lookSensitivity').focus(); await page.keyboard.press('Escape');
  await page.locator('#setPanel').waitFor({ state: 'hidden' });
}
async function ready(page) { await page.waitForFunction(() => document.body.dataset.ready === 'true' && window.__game, null, { timeout: 90000 }); }
async function boot(context) {
  await context.addInitScript(() => {
    let seed = 4211; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    window.__settingsShots = [];
    const request = requestAnimationFrame; let lastShots = 0;
    window.requestAnimationFrame = callback => request(time => {
      callback(time);
      const game = window.__game; if (!game || game.combat.shots === lastShots) return;
      lastShots = game.combat.shots;
      const first = game.camera.getObjectByName('first-person-view'); let firstFlash = false, flashMeshes = 0;
      first?.traverse(object => {
        if (!object.isMesh || object.renderOrder !== 103) return;
        flashMeshes++; let visible = true;
        for (let current = object; current && current !== game.camera; current = current.parent) visible &&= current.visible;
        firstFlash ||= visible;
      });
      window.__settingsShots.push({ shots: lastShots, hits: game.combat.hits, mode: game.cameraMode,
        thirdFlash: game.player.userData.flash.visible, light: game.player.userData.flashLight.intensity, firstFlash, flashMeshes });
      if (window.__settingsShots.length > 300) window.__settingsShots.shift();
    });
  });
  const page = await context.newPage(); currentPage = page;
  page.on('pageerror', error => errors.push(error.stack || error.message));
  page.on('console', event => { if (event.type() === 'error') errors.push(event.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(`${base}/soldier.html?debug=1&q=low&noscale=1`); await ready(page); return page;
}
async function briefing(page, touch) {
  const before = await page.evaluate(() => ({ mode: __game.mode, combatSeconds: __game.combat.seconds, hp: __game.hp,
    saves: Object.fromEntries(Object.keys(localStorage).filter(name => name !== 'szCombatPreferences:v1').map(name => [name, localStorage.getItem(name)])) }));
  await press(page, '#briefSettingsBtn', touch); await page.locator('#setPanel').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.survival-settings input').count(), 11);
  assert.equal(await page.evaluate(() => document.querySelector('#setPanel .dialog-card').scrollTop), 0);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'settingsTitle');
  await toggle(page, 'aimAssist', false); assert.equal(await page.locator(key('assistStrength')).isDisabled(), true);
  await toggle(page, 'toggleFire', true); await toggle(page, 'toggleSprint', true); await toggle(page, 'invertY', true);
  await toggle(page, 'reduceFlashes', true); await toggle(page, 'highContrast', true);
  if (touch) await toggle(page, 'leftHanded', true);
  await range(page, 'crosshairScale', 10); // 125%, starting at 75%.
  await range(page, 'effectsVolume', 6); await range(page, 'ambienceVolume', 4);
  const back = await page.locator('#setClose').boundingBox(), size = page.viewportSize();
  assert.ok(back.y >= 0 && back.y + back.height <= size.height + 1, 'Back remains reachable while scrolling');
  await closeSettings(page);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'briefSettingsBtn');
  const after = await page.evaluate(() => ({ mode: __game.mode, combatSeconds: __game.combat.seconds, hp: __game.hp,
    saves: Object.fromEntries(Object.keys(localStorage).filter(name => name !== 'szCombatPreferences:v1').map(name => [name, localStorage.getItem(name)])) }));
  assert.deepEqual(after, before, 'briefing preferences do not start or overwrite a run');
  await page.reload(); await ready(page);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('szCombatPreferences:v1')).toggleFire), true);
  await press(page, '#startBtn', touch); await page.waitForFunction(() => ['intro', 'play'].includes(__game.mode));
  if (await page.evaluate(() => __game.mode === 'intro')) { if (touch) await page.locator('#skipBtn').tap(); else await page.keyboard.press('Space'); }
  await page.waitForFunction(() => __game.mode === 'play' && !__game.paused);
}
async function fixture(page, target = [20, -24]) {
  await page.evaluate(([x, z]) => {
    __game.clearWave(); __game.setPos(0, 0); __game.setView(0, 0); __game.spawnNear();
    const enemy = __game.zombies.at(-1); enemy.position.set(x, __game.player.position.y, z);
    Object.assign(enemy.userData, { hp: 1000, maxHp: 1000, speed: 0, arrivalTime: 0, attackWind: 0, attackCooldown: 999, slamWind: 0, slamCooldown: 999, spitCooldown: 999 });
  }, target); await gameTime(page, .1);
}
async function checkAudio(page) {
  await page.waitForFunction(() => __game.audioMix && Math.abs(__game.audioMix.effects - .3) < .02 && Math.abs(__game.audioMix.ambience - .2) < .02);
  await page.keyboard.press('KeyM'); await page.waitForFunction(() => __game.audioMix.master < .02);
  assert.ok(Math.abs((await page.evaluate(() => __game.audioMix.effects)) - .3) < .02);
  await page.keyboard.press('KeyM'); await page.waitForFunction(() => __game.audioMix.master > .6);
}
async function checkBounds(page, touch) {
  const size = page.viewportSize();
  const box = await page.locator('#cross').boundingBox(); assert.ok(Math.abs(box.x + box.width / 2 - size.width / 2) < .1);
  assert.ok(Math.abs(box.width - 27.5) < .1, '125% crosshair stays centered');
  if (!touch) return;
  const controls = [];
  for (const id of ['stick', 'fireBtn', 'jumpBtn', 'orbBtn']) {
    const box = await page.locator(`#${id}`).boundingBox(); controls.push({ id, ...box });
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= size.width + 1 && box.y + box.height <= size.height + 1, `${id} remains on screen`);
  }
  assert.ok(controls[0].x > size.width / 2, 'left-handed stick is on the right');
  assert.ok(controls[1].x < size.width / 2, 'left-handed fire is on the left');
  for (const a of controls) for (const b of controls) if (a.id !== b.id) {
    assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, `${a.id} overlaps ${b.id}`);
  }
}
async function fireClick(page) { const size = page.viewportSize(); await page.mouse.click(size.width / 2, size.height / 2); }

try {
  if (!process.env.GAMES_TEST_URL) {
    server = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('Settings browser server timeout')), 10000); server.stdout.once('data', () => { clearTimeout(timer); resolve(); }); server.once('error', reject); server.once('exit', code => reject(Error(`Server exited ${code}`))); });
  }
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--enable-unsafe-swiftshader'] });
  if (!process.argv.includes('--touch-only')) {
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } }), page = await boot(desktop);
  await briefing(page, false); await checkAudio(page); await fixture(page); await checkBounds(page, false);

  // Real mouse firing persists after release, stops on the next click, and the
  // disabled assist never turns toward a stationary off-center enemy.
  await page.mouse.move(640, 400); await gameTime(page, .05);
  const yaw = await page.evaluate(() => __game.yaw); await fireClick(page); await gameTime(page, .4);
  assert.equal(await page.evaluate(() => __game.firing), true); assert.ok(await page.evaluate(() => __game.combat.shots > 0));
  assert.ok(Math.abs((await page.evaluate(() => __game.yaw)) - yaw) < 1e-8, 'aim assistance off leaves yaw unchanged');
  await fireClick(page); assert.equal(await page.evaluate(() => __game.firing), false);

  // Turning off flash affects both model views while real bullets still hit.
  await fixture(page, [0, -8]); await page.keyboard.press('KeyV');
  await page.waitForFunction(() => __game.cameraMode === 'first');
  await gameTime(page, .1);
  await page.evaluate(() => {
    const target = __game.player.position.clone();
    __game.zombies[0].userData.head.getWorldPosition(target);
    target.sub(__game.camera.position).normalize();
    __game.setView(Math.atan2(-target.x, -target.z), Math.asin(target.y));
  });
  await gameTime(page, .1);
  const hits = await page.evaluate(() => __game.combat.hits); await fireClick(page);
  await page.waitForFunction(hits => __game.combat.hits > hits, hits); await gameTime(page, .25); await fireClick(page);
  const shots = await page.evaluate(() => __settingsShots.filter(s => s.shots > 0));
  assert.ok(shots.some(s => s.mode === 'first' && s.flashMeshes > 0));
  assert.ok(shots.every(s => !s.thirdFlash && !s.firstFlash && s.light === 0), 'every observed shot suppresses both muzzle meshes and the light');

  await fixture(page); await page.mouse.move(640, 400); await gameTime(page, .05);
  const pitch = await page.evaluate(() => __game.pitch); await page.mouse.move(640, 425); await gameTime(page, .05);
  assert.ok((await page.evaluate(() => __game.pitch)) > pitch + .02, 'inverted native mouse motion looks up when moved down');

  // Use equal simulation windows on clear ground, with the sprint key released.
  async function walk() {
    await page.evaluate(() => { __game.setPos(0, 0); __game.setView(0, 0); }); await gameTime(page, .05);
    const before = await page.evaluate(() => ({ pos: __game.pos, time: __game.time }));
    await page.keyboard.down('KeyW'); await gameTime(page, .25); await page.keyboard.up('KeyW');
    const after = await page.evaluate(() => ({ pos: __game.pos, time: __game.time }));
    return Math.hypot(after.pos[0] - before.pos[0], after.pos[2] - before.pos[2]) / (after.time - before.time);
  }
  const normal = await walk(); await page.keyboard.press('ShiftLeft'); const sprint = await walk();
  assert.ok(sprint > normal * 1.25, `toggle sprint remains faster after key release (${normal} → ${sprint})`);
  await fireClick(page); await page.keyboard.press('Escape'); await page.waitForFunction(() => __game.paused);
  assert.equal(await page.evaluate(() => __game.firing), false); await page.locator('#resumeBtn').click();
  const resumed = await walk(); assert.ok(resumed < sprint * .85, 'pause clears the latched sprint');
  await pauseSettings(page); await page.getByText('Sound mix', { exact: true }).click(); await range(page, 'effectsVolume', 9);
  assert.equal(await page.locator(key('effectsVolume')).inputValue(), '0.45');
  await closeSettings(page);
  // Read the graph while an actual effects voice is playing: an idle bus may
  // retain its last rendered AudioParam value until it has an active source.
  const beforeAudioShot = await page.evaluate(() => __game.combat.shots);
  await fireClick(page); await page.waitForFunction(shots => __game.combat.shots > shots, beforeAudioShot);
  await page.waitForFunction(() => Math.abs(__game.audioMix.effects - .45) < .02);
  await fireClick(page);
  assert.ok(Math.abs((await page.evaluate(() => __game.audioMix.ambience)) - .2) < .02, 'effects change independently of ambience');
  await page.screenshot({ path: `${output}/desktop.png` }); await desktop.close();
  console.log('Desktop: briefing/settings lifecycle, live audio graph, toggle fire/sprint, inverted look, manual aim, real hits and suppressed flashes passed.');
  }

  for (const [width, height] of [[390, 844], [844, 390]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true }), page = await boot(context);
    await briefing(page, true); await fixture(page); await checkBounds(page, true);
    await page.evaluate(() => {
      window.__settingsTouches = [];
      for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) addEventListener(type, event => {
        const item = { type, target: event.target.id, changed: [...event.changedTouches].map(t => ({ id: t.identifier, target: t.target.id, x: t.clientX, y: t.clientY })), before: __game.firing };
        window.__settingsTouches.push(item); queueMicrotask(() => item.after = __game.firing);
      }, true);
    });
    const cdp = await context.newCDPSession(page), stick = await page.locator('#stick').boundingBox(), fire = await page.locator('#fireBtn').boundingBox();
    let move = { id: 71, x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 }, trigger = { id: 72, x: fire.x + fire.width / 2, y: fire.y + fire.height / 2 };
    const before = await page.evaluate(() => ({ pos: __game.pos, yaw: __game.yaw, pitch: __game.pitch, shots: __game.combat.shots }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [move] });
    move = { ...move, y: move.y - 42 }; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [move] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [move, trigger] }); await gameTime(page, .25);
    trigger = { ...trigger, x: trigger.x + 12, y: trigger.y + 10 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [move, trigger] }); await gameTime(page, .25);
    // CDP touchEnd lists the ended finger, retaining the movement thumb.
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [trigger] });
    assert.equal(await page.evaluate(() => __game.firing), true, 'touch toggle keeps firing after thumb release');
    const after = await page.evaluate(() => ({ pos: __game.pos, yaw: __game.yaw, pitch: __game.pitch, shots: __game.combat.shots }));
    assert.ok(Math.hypot(after.pos[0] - before.pos[0], after.pos[2] - before.pos[2]) > .4);
    assert.ok(Math.abs(after.yaw - before.yaw) > .015); assert.ok(after.pitch > before.pitch + .015, 'inverted touch look applies while the other thumb moves');
    assert.ok(after.shots > before.shots, 'two-finger movement and look do not swallow fire');
    trigger = { ...trigger, x: fire.x + fire.width / 2, y: fire.y + fire.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [move, trigger] });
    await gameTime(page, .05);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await gameTime(page, .05);
    assert.equal(await page.evaluate(() => __game.firing), false, 'second touch toggles fire off exactly once');
    await page.locator('#fireBtn').tap(); await gameTime(page, .2); assert.equal(await page.evaluate(() => __game.firing), true);
    await page.screenshot({ path: `${output}/touch-${width}x${height}.png` });
    await page.locator('#pauseBtn').tap(); await page.waitForFunction(() => __game.paused);
    assert.equal(await page.evaluate(() => __game.firing), false, 'touch pause clears latched fire');
    await cdp.detach(); await context.close(); console.log(`Touch ${width}×${height}: mirrored bounds, native two-finger movement/look/fire, inversion, toggle stop and pause clearing passed.`);
  }
  assert.deepEqual(errors, [], 'no browser errors'); console.log('Survival settings browser: all full-game checks passed.');
} catch (error) {
  if (currentPage && !currentPage.isClosed()) {
    await currentPage.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
    console.error('Settings failure state:', await currentPage.evaluate(() => ({ mode: __game?.mode, paused: __game?.paused, phase: __game?.activities?.host.phase, body: document.body.className, focused: document.activeElement?.id, audioMix: __game?.audioMix, preferences: localStorage.getItem('szCombatPreferences:v1') })).catch(() => null));
    console.error('Touch trace:', await currentPage.evaluate(() => JSON.stringify(window.__settingsTouches || [])).catch(() => null));
  }
  console.error('Browser errors:', errors); throw error;
} finally { await browser?.close(); server?.kill(); }
