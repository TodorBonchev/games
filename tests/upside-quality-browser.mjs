import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createUpside, LEVELS, RECORDS_KEY } from '../upside-game.js';
import { collectorPlay } from './upside-collector-bot.mjs';

const port = 5198;
const base = process.env.GAMES_TEST_URL || `http://127.0.0.1:${port}`;
const server = process.env.GAMES_TEST_URL ? null : spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
const shots = process.env.UPSIDE_QUALITY_SHOTS || 'test-results/upside-quality';
const errors = [];
let browser;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const state = page => page.evaluate(() => {
  const s = window.__upside.game.state;
  return { mode: s.mode, assist: s.assist, x: s.player.x, y: s.player.y, vx: s.player.vx, g: s.player.g, time: s.time };
});

async function open(context, { clock = false } = {}) {
  const page = await context.newPage();
  if (clock) await page.clock.install({ time: new Date('2026-11-03T10:00:00Z') });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(`${base}/upside.html?debug=1`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  if (clock) await page.clock.pauseAt(new Date('2026-11-03T12:00:00Z'));
  return page;
}

const overlaps = (a, b) => a.x < b.x + b.width - 1 && a.x + a.width > b.x + 1 && a.y < b.y + b.height - 1 && a.y + a.height > b.y + 1;

async function touchLayout(page, viewport) {
  const selectors = ['#dpad', '#jumpBtn', '#runBtn', '#flipBtn', '#pauseBtn', '#muteBtn', '#settingsBtn', '.sys .home'];
  const controls = [];
  for (const selector of selectors) {
    const box = await page.locator(selector).boundingBox();
    assert.ok(box, `${selector} visible at ${viewport.width}x${viewport.height}`);
    assert.ok(box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, `${selector} inside viewport`);
    controls.push({ selector, ...box });
  }
  for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
    assert.equal(overlaps(controls[i], controls[j]), false, `${controls[i].selector} overlaps ${controls[j].selector} at ${viewport.width}x${viewport.height}`);
  }
  const canvas = await page.evaluate(() => {
    const c = document.getElementById('screen'), rect = c.getBoundingClientRect();
    return { width: c.width, ratio: rect.width * devicePixelRatio / c.width, smoothing: c.getContext('2d').imageSmoothingEnabled, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  assert.ok(canvas.width >= 320, `at least 20 tiles visible: ${canvas.width}px`);
  assert.equal(canvas.smoothing, false);
  assert.ok(Math.abs(canvas.ratio - Math.round(canvas.ratio)) < .02, 'integer device-pixel canvas scale');
  assert.equal(canvas.overflow, false);
}

try {
  if (server) {
    await Promise.race([
      new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', code => reject(new Error(`server exited ${code}`))); }),
      delay(10000).then(() => { throw new Error('server timeout'); }),
    ]);
  }
  await mkdir(shots, { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true });

  // Real UI input, including two physical keys bound to the same action.
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
  const page = await open(desktop);
  await page.keyboard.press('Enter');
  assert.equal((await state(page)).mode, 'playing');
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(150);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(250);
  assert.ok((await state(page)).vx > 3, 'D remains pressed after releasing its ArrowRight alias');

  await page.keyboard.down('KeyP');
  assert.equal((await state(page)).mode, 'paused');
  await page.keyboard.down('KeyP'); // Playwright emits repeat:true for an already held key.
  assert.equal((await state(page)).mode, 'paused', 'auto-repeat must not resume');
  await page.keyboard.up('KeyP');
  await page.keyboard.up('KeyD');
  const frozen = await state(page);
  await page.waitForTimeout(250);
  assert.equal((await state(page)).time, frozen.time, 'pause freezes the simulation');
  await page.keyboard.press('KeyC');
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press(i % 3 === 0 ? 'Shift+Tab' : 'Tab');
    assert.equal(await page.evaluate(() => document.getElementById('panel').contains(document.activeElement)), true, 'keyboard focus stays inside the modal');
  }
  await page.locator('[data-action="resume"]').click();
  await page.waitForTimeout(600);
  assert.equal((await state(page)).g, frozen.g, 'menu key presses do not leak into a gravity flip');
  assert.equal((await state(page)).vx, 0, 'pausing clears held movement');

  // Enter activates the focused control, including secondary menu actions.
  await page.keyboard.press('KeyP');
  await page.locator('[data-action="settings"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-setting="effects"]').waitFor();
  assert.equal(await page.locator('[data-setting="reducedMotion"]').getAttribute('aria-pressed'), 'true', 'OS reduced-motion preference is respected');
  const saved = {};
  for (const key of ['effects', 'music', 'autoRun', 'assist']) {
    const control = page.locator(`[data-setting="${key}"]`);
    const before = await control.getAttribute('aria-pressed');
    await control.click();
    saved[key] = before === 'true' ? 'false' : 'true';
    assert.equal(await control.getAttribute('aria-pressed'), saved[key]);
  }
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  await page.locator('[data-action="settings"]').click();
  for (const [key, value] of Object.entries(saved)) assert.equal(await page.locator(`[data-setting="${key}"]`).getAttribute('aria-pressed'), value, `${key} survives reload`);
  await page.locator('[data-action="back"]').click();
  await page.locator('[data-action="start"]').click();
  assert.equal((await state(page)).assist, saved.assist === 'true', 'selected assist setting is applied to a new run');
  await page.screenshot({ path: `${shots}/desktop.png` });
  await desktop.close();

  // Standard controllers use the same input path; mock hardware, not game state.
  const controllerContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await controllerContext.addInitScript(() => {
    window.__testPad = { id: 'Test standard controller', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.__testPad] });
  });
  const controller = await open(controllerContext);
  await controller.locator('[data-primary]').click();
  await controller.waitForTimeout(80);
  await controller.evaluate(() => { window.__testPad.axes[0] = .2; });
  await controller.waitForTimeout(250);
  assert.equal((await state(controller)).x, 2.5, 'controller stick deadzone prevents drift');
  await controller.evaluate(() => { window.__testPad.axes[0] = .85; });
  await controller.waitForTimeout(350);
  assert.ok((await state(controller)).x > 3, 'controller stick moves Nib');
  await controller.evaluate(() => { window.__testPad.axes[0] = 0; });
  await controller.waitForTimeout(500);
  assert.equal((await state(controller)).vx, 0, 'controller neutral stops movement');
  const padButton = (index, pressed) => controller.evaluate(({ index, pressed }) => { window.__testPad.buttons[index] = { pressed, touched: pressed, value: pressed ? 1 : 0 }; }, { index, pressed });
  await padButton(0, true);
  await controller.waitForTimeout(140);
  assert.ok((await state(controller)).y < 11.5, 'controller A jumps');
  await padButton(0, false);
  await controller.waitForTimeout(700);
  await padButton(9, true);
  await controller.waitForTimeout(100);
  assert.equal((await state(controller)).mode, 'paused', 'controller Start pauses');
  await controller.waitForTimeout(150);
  assert.equal((await state(controller)).mode, 'paused', 'holding Start does not toggle repeatedly');
  await padButton(9, false);
  await controller.waitForTimeout(80);
  await padButton(9, true);
  await controller.waitForTimeout(100);
  assert.equal((await state(controller)).mode, 'playing', 'a new Start edge resumes');
  await padButton(9, false);
  await controller.waitForTimeout(80);
  await padButton(1, true);
  await controller.waitForTimeout(80);
  assert.equal((await state(controller)).g, -1, 'controller B flips gravity');
  await controllerContext.close();

  // The browser runs the entire campaign from normal start/next actions. Planning
  // may inspect/clone the state; the live browser only receives forward inputs.
  // A virtual clock prevents real-time simulation ticks during offline planning.
  const campaignContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const campaign = await open(campaignContext, { clock: true });
  await campaign.locator('[data-primary]').click({ force: true });
  const completed = [];
  for (const level of LEVELS) {
    await campaign.clock.runFor(34);
    const snapshot = await campaign.evaluate(() => {
      const s = window.__upside.game.snapshot();
      s.grid = Array.from(s.grid);
      if (s.checkpoint?.grid) s.checkpoint.grid = Array.from(s.checkpoint.grid);
      return s;
    });
    snapshot.grid = Uint8Array.from(snapshot.grid);
    if (snapshot.checkpoint?.grid) snapshot.checkpoint.grid = Uint8Array.from(snapshot.checkpoint.grid);
    const planner = createUpside({ storage: { getItem: () => null, setItem() {} } });
    planner.restore(snapshot);
    const route = collectorPlay(planner);
    assert.ok(['cleared', 'won'].includes(route.mode), `browser world ${level.id} has a route`);
    const result = await campaign.evaluate(({ dt, replay }) => {
      const game = window.__upside.game;
      for (const input of replay) game.step(dt, input);
      return { mode: game.state.mode, result: game.state.result, record: game.state.records[game.level.id]?.normal };
    }, { dt: 1 / 60, replay: route.inputs });
    assert.equal(result.mode, level.id === LEVELS.at(-1).id ? 'won' : 'cleared');
    assert.ok(result.result.elapsed > 0);
    assert.equal(result.result.stars, 3, 'all three lantern stars collected through gameplay');
    assert.equal(result.result.medals.collector, true, 'collector medal earned');
    assert.ok(result.record?.score > 0, 'normal-mode record saved on a genuine completion');
    completed.push({ level: level.id, ...result.result });
    await campaign.clock.runFor(34);
    assert.equal(await campaign.locator('#overlay').isVisible(), true, 'completion dialog renders');
    assert.equal(await campaign.locator('.result-stars').isVisible(), true, 'collected stars shown in results');
    assert.equal(await campaign.locator('.result-grid').isVisible(), true, 'run statistics shown in results');
    assert.ok(await campaign.locator('.medals .earned').count() >= 2, 'completion and collector medals shown');
    await campaign.screenshot({ path: `${shots}/world-${level.id}-complete.png` });
    console.log(`Upside browser replay: world ${level.id} completed in ${result.result.elapsed.toFixed(2)}s, ${result.result.stars}/3 stars, ${result.result.deaths} deaths.`);
    if (level.id < LEVELS.at(-1).id) await campaign.locator('[data-action="next"]').click({ force: true });
  }
  const storedRecords = await campaign.evaluate(key => JSON.parse(localStorage.getItem(key)), RECORDS_KEY);
  for (const level of LEVELS) assert.ok(storedRecords[level.id]?.normal?.score > 0);
  await campaign.clock.resume();
  await campaign.reload();
  await campaign.waitForFunction(() => document.body.dataset.ready === 'true');
  assert.deepEqual(await campaign.evaluate(() => window.__upside.game.state.records), storedRecords, 'completed campaign records survive reload');
  for (const level of LEVELS) assert.equal(await campaign.locator(`[data-level="${level.id}"]`).isDisabled(), false, `world ${level.id} unlocked after campaign`);
  await campaign.screenshot({ path: `${shots}/campaign-records.png` });
  await campaignContext.close();

  // Phones in portrait and landscape: sufficient look-ahead and separated targets.
  for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const phone = await open(context);
    await phone.locator('[data-primary]').tap();
    await touchLayout(phone, viewport);
    const dpad = await phone.locator('#dpad').boundingBox();
    const x = dpad.x + dpad.width - 10, y = dpad.y + dpad.height / 2;
    await phone.locator('#dpad').dispatchEvent('pointerdown', { pointerId: 11, pointerType: 'touch', clientX: x, clientY: y });
    await phone.waitForTimeout(350);
    assert.ok((await state(phone)).x > 2.8, 'touch moves Nib');
    await phone.locator('#dpad').dispatchEvent('pointercancel', { pointerId: 11, pointerType: 'touch' });
    await phone.waitForTimeout(550);
    assert.equal((await state(phone)).vx, 0, 'cancelled pointer releases movement');
    await phone.screenshot({ path: `${shots}/phone-${viewport.width}x${viewport.height}.png` });
    await context.close();
  }

  // Sandboxed/privacy browsers can reject storage entirely; gameplay must survive.
  const privateContext = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  await privateContext.addInitScript(() => Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Storage blocked', 'SecurityError'); } }));
  const privatePage = await open(privateContext);
  await privatePage.locator('[data-action="settings"]').click();
  await privatePage.locator('[data-setting="music"]').click();
  await privatePage.locator('[data-action="back"]').click();
  await privatePage.locator('[data-action="start"]').click();
  await privatePage.keyboard.down('ArrowRight');
  await privatePage.waitForTimeout(300);
  await privatePage.keyboard.up('ArrowRight');
  assert.ok((await state(privatePage)).x > 2.7, 'play continues with unavailable storage');
  await privateContext.close();

  assert.deepEqual(errors, [], 'no browser exceptions, console errors, or missing assets');
  console.log('Upside quality: all four campaign replays and saved records; responsive phones; keyboard/controller/touch input; modal focus; saved settings; assist; reduced motion; and unavailable storage passed.');
} finally {
  await browser?.close();
  server?.kill();
}
