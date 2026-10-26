// Phone-specific browser checks: orientation changes, touch cancellation,
// small-screen scrolling, notches, hit targets and overlapping controls.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'test-results/mobile');
const baseURL = process.env.MOBILE_GAME_URL || 'http://127.0.0.1:5181';
const problems = [], reports = [];
let server, browser;
const check = (condition, message) => { if (!condition) problems.push(message); };
const between = (value, low, high) => value >= low - 1 && value <= high + 1;
const distance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const overlapping = (a, b) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1;

async function waitGame(page, seconds) {
  const time = await page.evaluate(() => window.__game.time);
  await page.waitForFunction(({ time, seconds }) => window.__game.time >= time + seconds, { time, seconds }, { timeout: 30000 });
}
async function boxes(page, selector) {
  return page.locator(selector).evaluateAll(elements => elements.filter(element => element.checkVisibility()).map(element => {
    const rect = element.getBoundingClientRect();
    return { id: element.id || element.textContent.trim().slice(0, 24), x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }).filter(rect => rect.width > 0 && rect.height > 0));
}
function hitTargets(rects, label) {
  for (const rect of rects) check(rect.width >= 43.5 && rect.height >= 43.5, `${label}: ${rect.id} target is ${rect.width.toFixed(1)}×${rect.height.toFixed(1)}, below 44px`);
}
async function swipe(cdp, from, to) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 9 }] });
  for (let step = 1; step <= 10; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * step / 10, y: from.y + (to.y - from.y) * step / 10, id: 9 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function deploy(page) {
  await page.locator('#startBtn').tap();
  await page.waitForFunction(() => window.__game.mode === 'intro');
  await page.locator('#skipBtn').tap();
  await page.waitForFunction(() => window.__game.mode === 'play');
}
async function checkGameLayout(page, spec, label) {
  const controls = await boxes(page, '.hud-actions button, .tb, #stick');
  hitTargets(controls, label);
  const inset = spec.insets || {};
  for (const control of controls) {
    check(between(control.x, inset.left || 0, spec.width) && between(control.x + control.width, 0, spec.width - (inset.right || 0)), `${label}: ${control.id} overlaps a side safe area`);
    check(between(control.y, inset.top || 0, spec.height) && between(control.y + control.height, 0, spec.height - (inset.bottom || 0)), `${label}: ${control.id} overlaps a top/bottom safe area`);
  }
  for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) check(!overlapping(controls[i], controls[j]), `${label}: ${controls[i].id} overlaps ${controls[j].id}`);
  const canvas = await page.locator('body > canvas').boundingBox();
  check(Math.abs(canvas.width - spec.width) < 1 && Math.abs(canvas.height - spec.height) < 1, `${label}: canvas does not fill the viewport`);
  return controls;
}

try {
  if (!process.env.MOBILE_GAME_URL) {
    server = spawn(process.execPath, ['scripts/serve.mjs', '--port', '5181'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((accept, reject) => {
      const timer = setTimeout(() => reject(new Error('Mobile test server did not start')), 10000);
      server.stdout.once('data', () => { clearTimeout(timer); accept(); });
      server.once('error', error => { clearTimeout(timer); reject(error); });
      server.once('exit', code => { clearTimeout(timer); reject(new Error(`Mobile test server exited ${code}`)); });
    });
  }
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--enable-unsafe-swiftshader'] });
  const specs = [
    { width: 320, height: 568 },
    { width: 360, height: 640 },
    { width: 390, height: 844, insets: { top: 47, bottom: 34, left: 0, right: 0 } },
    { width: 430, height: 932 },
    { width: 667, height: 375 },
    { width: 844, height: 390, insets: { top: 0, bottom: 21, left: 47, right: 47 } },
    { width: 932, height: 430 }
  ];
  for (const spec of specs.filter(spec => !process.env.MOBILE_CASE || process.env.MOBILE_CASE.split(',').includes(String(spec.width)))) {
    const label = `${spec.width}×${spec.height}`;
    const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    const page = await context.newPage(), cdp = await context.newCDPSession(page);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    if (spec.insets) await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: spec.insets });
    await page.goto(`${baseURL}/soldier.html?debug=1&q=low&noscale=1`);
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
    await page.evaluate(async () => { await document.fonts.ready; });
    const problemStart = problems.length;
    check(await page.locator('#start').evaluate(element => element.scrollWidth <= element.clientWidth + 1), `${label}: briefing overflows horizontally`);
    hitTargets(await boxes(page, '#start button, #start summary'), `${label} briefing`);
    const weapon = spec.width % 3 === 0 ? 'burst' : spec.width % 3 === 1 ? 'scatter' : 'rifle';
    await page.locator(`button[data-weapon="${weapon}"]`).tap();
    check(await page.locator(`button[data-weapon="${weapon}"]`).getAttribute('aria-pressed') === 'true', `${label}: weapon card selects with touch`);
    check(await page.evaluate(() => window.__game.weapon.id) === weapon, `${label}: selected weapon reaches the real combat state`);
    await page.screenshot({ path: resolve(output, `${spec.width}-menu.png`) });
    if (spec.width <= 360) {
      await page.locator('.menu-settings summary').tap();
      hitTargets(await boxes(page, '#start button, #start summary'), `${label} expanded briefing`);
      await page.locator('#start').evaluate(element => { element.scrollTop = 0; });
      const scrollable = await page.locator('#start').evaluate(element => element.scrollHeight > element.clientHeight + 1);
      await swipe(cdp, { x: spec.width / 2, y: spec.height - 75 }, { x: spec.width / 2, y: 140 });
      await page.waitForTimeout(200);
      check(!scrollable || await page.locator('#start').evaluate(element => element.scrollTop > 0), `${label}: expanded briefing cannot be scrolled by touch`);
      await page.locator('#menuMuteBtn').tap();
      check(await page.evaluate(() => window.__game.muted), `${label}: sound control is unreachable after scrolling`);
      await page.screenshot({ path: resolve(output, `${spec.width}-menu-settings.png`) });
    }
    await deploy(page);
    await page.evaluate(() => {
      const game = window.__game, elite = game.spawnElite(true);
      elite.userData.speed = 0; elite.userData.slamCooldown = 9999; elite.position.x += 18;
      game.spawnDrop('overdrive', 0);
    });
    await page.waitForFunction(() => window.__game.progression.overdrive > 0);
    // Exercise the longest score-chain presentation independently of the
    // seven-second gameplay timer; real kill/expiry behavior has runtime tests.
    await page.evaluate(() => {
      document.getElementById('momentumHud').classList.remove('hide');
      document.getElementById('momentumMultiplier').textContent = '×3';
      document.getElementById('momentumCount').textContent = '18 CHAIN';
      document.getElementById('momentumFill').style.width = '80%';
    });
    const controls = await checkGameLayout(page, spec, label);
    const statusBoxes = await boxes(page, '#eliteHud, #overdriveHud, #fieldObjective, #weaponHud, #momentumHud');
    for (const status of statusBoxes) {
      check(status.x >= (spec.insets?.left || 0) && status.x + status.width <= spec.width - (spec.insets?.right || 0) + 1, `${label}: ${status.id} leaves the safe width`);
      for (const control of controls) check(!overlapping(status, control), `${label}: ${status.id} overlaps ${control.id}`);
    }
    for (let i = 0; i < statusBoxes.length; i++) for (let j = i + 1; j < statusBoxes.length; j++) check(!overlapping(statusBoxes[i], statusBoxes[j]), `${label}: ${statusBoxes[i].id} overlaps ${statusBoxes[j].id}`);
    await page.screenshot({ path: resolve(output, `${spec.width}-play.png`) });

    if (spec.width === 390) {
      const stick = await page.locator('#stick').boundingBox(), fire = await page.locator('#fireBtn').boundingBox();
      const touches = [{ x: stick.x + stick.width / 2, y: stick.y + stick.height * .15, id: 1 }, { x: fire.x + fire.width / 2, y: fire.y + fire.height / 2, id: 2 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches });
      await waitGame(page, .1);
      check(await page.evaluate(() => window.__game.firing), `${label}: simultaneous joystick and fire did not engage`);
      const landscape = { width: 844, height: 390, insets: { top: 0, bottom: 21, left: 47, right: 47 } };
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: landscape.insets });
      await page.setViewportSize({ width: landscape.width, height: landscape.height });
      await page.waitForTimeout(350);
      check(!await page.evaluate(() => window.__game.firing), 'rotation: held fire must clear when touch targets move');
      const position = await page.evaluate(() => window.__game.pos);
      await waitGame(page, .2);
      check(distance(position, await page.evaluate(() => window.__game.pos)) < .005, 'rotation: held joystick must not keep moving after orientation changes');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await checkGameLayout(page, landscape, 'portrait→landscape');
      await page.locator('#pauseBtn').tap();
      const state = await page.evaluate(() => ({ time: window.__game.time, pos: window.__game.pos, hp: window.__game.hp }));
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: spec.insets });
      await page.setViewportSize({ width: spec.width, height: spec.height });
      await page.waitForTimeout(350);
      assert.deepEqual(await page.evaluate(() => ({ time: window.__game.time, pos: window.__game.pos, hp: window.__game.hp })), state, 'paused rotation must preserve simulation state');
      check(await page.locator('#resumeBtn').isVisible(), 'rotation: resume control remains reachable');
      const canvas = await page.locator('body > canvas').boundingBox();
      check(canvas.width === spec.width && canvas.height === spec.height, 'paused rotation: renderer viewport updates');
      await page.screenshot({ path: resolve(output, 'rotation-paused.png') });
      await page.locator('#resumeBtn').tap();
      const yaw = await page.evaluate(() => window.__game.yaw);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: spec.width * .68, y: spec.height * .46, id: 4 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: spec.width * .85, y: spec.height * .46, id: 4 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      check(Math.abs((await page.evaluate(() => window.__game.yaw)) - yaw) > .1, 'rotation: right-side looking works after rotating and resuming');
      const fireAfter = await page.locator('#fireBtn').boundingBox();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fireAfter.x + fireAfter.width / 2, y: fireAfter.y + fireAfter.height / 2, id: 5 }] });
      check(await page.evaluate(() => window.__game.firing), 'rotation: fire control re-engages at its new location');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      check(!await page.evaluate(() => window.__game.firing), 'rotation: releasing new fire touch stops shooting');
    }

    if (spec.width === 430) {
      await page.waitForFunction(() => window.__game.rjCD <= 0);
      await page.evaluate(() => { window.__game.score = 60; window.__game.hp = 83; });
      await page.locator('#pauseBtn').tap();
      const run = await page.evaluate(() => ({ wave: window.__game.wave, score: window.__game.score, hp: window.__game.hp }));
      assert.ok(await page.locator('#pauseRejumpBtn').isEnabled(), 'ready helicopter redeploy is available in the phone pause menu');
      await page.screenshot({ path: resolve(output, '430-pause.png') });
      await page.locator('#pauseRejumpBtn').tap();
      await page.waitForFunction(() => window.__game.mode === 'intro' && !window.__game.paused);
      assert.ok(await page.locator('#pausePanel').isHidden(), 'redeployment closes pause');
      await waitGame(page, .05);
      await page.screenshot({ path: resolve(output, '430-redeployment.png') });
      await page.locator('#skipBtn').tap();
      await page.waitForFunction(() => window.__game.mode === 'play');
      assert.deepEqual(await page.evaluate(() => ({ wave: window.__game.wave, score: window.__game.score, hp: window.__game.hp })), run, 'phone helicopter redeploy preserves the current run');
      assert.equal(await page.evaluate(() => window.__game.paused), false);
    }

    await page.locator('#pauseBtn').tap();
    hitTargets(await boxes(page, '#pausePanel button'), `${label} pause`);
    await page.locator('#pauseSettingsBtn').tap();
    hitTargets(await boxes(page, '#setPanel button, #lookSensitivity'), `${label} settings`);
    await page.locator('#lookSensitivity').evaluate(element => { element.value = '1.25'; element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.locator('#motionBtn').tap();
    check(await page.locator('#lookSensitivityValue').textContent() === '1.25×', `${label}: look sensitivity updates`);
    if (spec.width === 430) {
      // Resolve a fullscreen request without resizing the test window. A
      // landscape-lock regression must still be observable after it resolves.
      await page.evaluate(() => {
        window.__fullscreenAudit = { requests: 0, locks: [] };
        document.documentElement.requestFullscreen = async () => { window.__fullscreenAudit.requests++; };
        Object.defineProperty(screen.orientation, 'lock', { configurable: true, value: async mode => { window.__fullscreenAudit.locks.push(mode); } });
      });
      await page.locator('#settingsFullscreenBtn').tap();
      await page.waitForFunction(() => window.__fullscreenAudit.requests === 1);
      assert.deepEqual(await page.evaluate(() => window.__fullscreenAudit.locks), [], 'fullscreen must not force an orientation');
      await page.screenshot({ path: resolve(output, '430-settings.png') });
    }
    if (spec.width === 667) await page.screenshot({ path: resolve(output, '667-settings.png') });
    await page.locator('#muteBtn').tap();
    await page.locator('#setClose').tap();
    check(!await page.evaluate(() => window.__game.paused), `${label}: settings can return to gameplay`);
    await page.evaluate(() => window.__game.clearWave());
    await page.waitForFunction(() => window.__game.mode === 'upgrade', null, { timeout: 30000 });
    const upgradeTargets = await boxes(page, '#upgradePanel button');
    hitTargets(upgradeTargets, `${label} upgrades`);
    check(await page.locator('#upgradeChoices button').count() === 3, `${label}: three upgrade choices are present`);
    for (const control of upgradeTargets) check(control.x >= (spec.insets?.left || 0) && control.x + control.width <= spec.width - (spec.insets?.right || 0) + 1 && control.y >= (spec.insets?.top || 0) && control.y + control.height <= spec.height - (spec.insets?.bottom || 0) + 1, `${label}: upgrade ${control.id} is clipped or outside the safe area`);
    const rewardState = await page.evaluate(() => ({ time: window.__game.time, hp: window.__game.hp, pos: window.__game.pos }));
    await page.waitForTimeout(200);
    assert.deepEqual(await page.evaluate(() => ({ time: window.__game.time, hp: window.__game.hp, pos: window.__game.pos })), rewardState, 'choosing an upgrade freezes combat');
    await page.screenshot({ path: resolve(output, `${spec.width}-upgrades.png`) });
    if (spec.width === 390) {
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 21, left: 47, right: 47 } });
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => window.__game.mode), 'upgrade');
      assert.deepEqual(await page.evaluate(() => ({ time: window.__game.time, hp: window.__game.hp, pos: window.__game.pos })), rewardState);
      await page.screenshot({ path: resolve(output, 'rotation-upgrades.png') });
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: spec.insets });
      await page.setViewportSize({ width: spec.width, height: spec.height });
    }
    await page.locator('.upgrade-card[data-choice="0"]').tap();
    await page.waitForFunction(() => window.__game.mode === 'play' && window.__game.wave === 2);
    check(!await page.evaluate(() => window.__game.firing), `${label}: choosing an upgrade leaves fire released`);
    await page.evaluate(() => window.__game.damage(1000));
    await page.waitForFunction(() => window.__game.mode === 'over');
    const debriefTargets = await boxes(page, '#over button');
    hitTargets(debriefTargets, `${label} debrief`);
    for (const control of debriefTargets) check(control.x >= 0 && control.x + control.width <= spec.width + 1 && control.y >= 0 && control.y + control.height <= spec.height + 1, `${label}: debrief ${control.id} is clipped`);
    await page.screenshot({ path: resolve(output, `${spec.width}-debrief.png`) });
    await page.locator('#overMenuBtn').tap();
    check(await page.evaluate(() => window.__game.mode === 'menu'), `${label}: debrief returns to briefing`);
    if (spec.width === 320 || spec.width === 667) {
      // Exercise the real five-wave Ember finish on the tightest viewport in
      // each orientation, including keeping the build when entering endless.
      await page.goto(`${baseURL}/soldier.html?debug=1&q=low&noscale=1&level=2`);
      await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
      await deploy(page);
      for (let wave = 1; wave <= 5; wave++) {
        await page.evaluate(() => window.__game.clearWave());
        await page.waitForFunction(() => window.__game.mode === 'upgrade', null, { timeout: 30000 });
        await page.locator('.upgrade-card[data-choice="0"]').tap();
      }
      await page.waitForFunction(() => window.__game.mode === 'over' && window.__game.campaignComplete);
      check(await page.locator('body').evaluate(el => el.classList.contains('victory')), `${label}: campaign shows victory`);
      const victoryTargets = await boxes(page, '#over button');
      hitTargets(victoryTargets, `${label} victory`);
      for (const control of victoryTargets) check(control.x >= 0 && control.x + control.width <= spec.width + 1 && control.y >= 0 && control.y + control.height <= spec.height + 1, `${label}: victory ${control.id} is clipped`);
      check(await page.locator('#finalRank').isVisible(), `${label}: operation rating is visible`);
      await page.screenshot({ path: resolve(output, `${spec.width}-victory.png`) });
      const build = await page.evaluate(() => window.__game.progression.ranks);
      await page.locator('#endlessBtn').tap();
      await page.waitForFunction(() => window.__game.mode === 'play' && window.__game.wave === 6);
      assert.deepEqual(await page.evaluate(() => window.__game.progression.ranks), build, 'endless preserves earned upgrades');
      await page.locator('#pauseBtn').tap();await page.locator('#pauseMenuBtn').tap();
    }
    check(errors.length === 0, `${label}: browser errors ${errors.join('; ')}`);
    reports.push({ viewport: spec, controls, problems: problems.slice(problemStart), errors });
    console.log(`${problems.length === problemStart ? 'PASS' : 'FAIL'} ${label}: phone layout, controls and settings`);
    await context.close();
  }
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ reports, problems }, null, 2));
  assert.equal(problems.length, 0, `${problems.length} mobile regressions; see test-results/mobile/report.json\n${problems.slice(0, 12).join('\n')}`);
  console.log('All phone layouts and rotation checks passed. Screenshots: test-results/mobile/.');
} finally {
  await browser?.close();
  if (server && server.exitCode === null) { server.kill(); await once(server, 'exit'); }
}
