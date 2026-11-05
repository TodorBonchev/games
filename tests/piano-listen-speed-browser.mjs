// Real playback timers, native controls and note rendering; instrumentation only
// records notes emitted by the real audio path. No fabricated progress or audio.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';

const port = 5363, base = (process.env.GAMES_TEST_URL || `http://127.0.0.1:${port}`).replace(/\/$/, '');
const output = 'test-results/piano-listen-speed';
let server, browser, page;
const errors = [], sampleWarnings = [], results = [];
async function activate(selector, touch = false) { await page.locator(selector)[touch ? 'tap' : 'click'](); }
async function open(context, touch = false) {
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.stack || error.message));
  page.on('console', event => { if (event.type() === 'error' && !/Failed to load resource/.test(event.text())) errors.push(event.text()); });
  const recordResource = text => text.startsWith(base) ? errors : sampleWarnings;
  page.on('response', response => { if (response.status() >= 400) recordResource(response.url()).push(`${response.status()} ${response.url()}`); });
  page.on('requestfailed', request => recordResource(request.url()).push(`${request.failure()?.errorText} ${request.url()}`));
  await page.goto(`${base}/piano/index.html`);
  await page.waitForFunction(() => typeof window.__piano?.setListenSpeed === 'function');
  if (await page.locator('#rotgo').isVisible()) await activate('#rotgo', touch);
}
async function pick(id, hand = 'right', touch = false) {
  await activate('#songsBtn', touch); await page.locator('#songHand').selectOption(hand);
  await page.locator('#songq').fill(''); await activate(`#songlist .song[data-id="${id}"]`, touch);
  if (!await page.locator('#staff').isVisible()) await activate('#lsheet', touch);
}
async function recordNotes() {
  await page.evaluate(() => {
    window.__noteTrace = []; window.__notes = [];
    const push = window.__notes.push;
    window.__notes.push = function (...notes) { for (const note of notes) window.__noteTrace.push({ note, at: performance.now() }); return push.apply(this, notes); };
  });
}
async function next(touch = false) {
  const index = await page.evaluate(() => __learn.steps[__learn.pos].midi - (+document.getElementById('oct').textContent.slice(1) + 1) * 12);
  assert.ok(index >= 0 && index < 25, 'next practice note is visible');
  const key = page.locator(`#kb .k[data-i="${index}"]`), rect = await key.boundingBox(), black = await key.evaluate(node => node.classList.contains('b'));
  const x = rect.x + rect.width / 2, y = rect.y + rect.height * (black ? .4 : .86);
  if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
}
async function checkCue() {
  const cue = await page.evaluate(() => {
    const current = __learn.steps[__learn.demoPos], shift = +document.getElementById('oct').textContent.slice(1) - 4;
    return { state: __learn.state, pos: __learn.demoPos, staff: +document.querySelector('#staff .n.cur')?.dataset.k, next: +document.querySelector('#kb .k.next')?.dataset.i, expected: current.midi - 60 - shift * 12, midi: window.__lastVoice?.midi, expectedMidi: current.midi };
  });
  assert.equal(cue.state, 'listening'); assert.equal(cue.staff, cue.pos, 'sheet follows the slowed note');
  assert.equal(cue.next, cue.expected, 'keyboard follows the slowed note'); assert.equal(cue.midi, cue.expectedMidi, 'sound keeps the original pitch');
}
async function stop(touch = false) {
  await activate('#ldemo', touch); await page.waitForTimeout(350);
  assert.equal(await page.evaluate(() => __learn.demo), null); assert.equal(await page.evaluate(() => __learn.demoNotes.size), 0);
  assert.equal(await page.locator('#kb .k.down').count(), 0, 'Stop releases all demonstration keys');
}
async function bounds(selector, insets, hit = false) {
  const rect = await page.locator(selector).boundingBox(), viewport = page.viewportSize(); assert.ok(rect, `${selector} exists`);
  assert.ok(rect.x >= insets.left - 1 && rect.x + rect.width <= viewport.width - insets.right + 1 && rect.y >= insets.top - 1 && rect.y + rect.height <= viewport.height - insets.bottom + 1, `${selector} exceeds safe area: ${JSON.stringify(rect)}`);
  if (hit) assert.ok(rect.width >= 44 && rect.height >= 44, `${selector} has a 44px target`);
  return rect;
}
try {
  if (!process.env.GAMES_TEST_URL) {
    server = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('Listen speed test server did not start')), 10000); server.stdout.once('data', () => { clearTimeout(timer); resolve(); }); server.once('error', error => { clearTimeout(timer); reject(error); }); server.once('exit', code => { clearTimeout(timer); reject(Error(`Server exited ${code}`)); }); });
  }
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await open(desktop); await pick('imperial');
  assert.equal(await page.locator('#lspeed').inputValue(), '1');
  const timings = [];
  for (const speed of [1, .5, .25]) {
    await page.locator('#lspeed').selectOption(String(speed)); await recordNotes(); await activate('#ldemo');
    await page.waitForFunction(() => __noteTrace.length >= 3, null, { timeout: 15000 }); await checkCue();
    const trace = await page.evaluate(() => __noteTrace.slice(0, 3));
    assert.deepEqual(trace.map(note => note.note), ['G4', 'G4', 'G4'], 'slowing keeps melody pitches');
    const elapsed = (trace[2].at - trace[0].at) / 2, expected = await page.evaluate(speed => 60000 / __learn.song.tempo / speed, speed);
    assert.ok(Math.abs(elapsed - expected) <= Math.max(130, expected * .18), `${speed}x onset interval ${elapsed}ms; expected ${expected}ms`);
    timings.push({ speed, noteIntervalMs: Math.round(elapsed), expectedMs: Math.round(expected) });
    if (speed === .25) { await page.locator('#lspeed').scrollIntoViewIfNeeded(); await page.screenshot({ path: `${output}/desktop-quarter-speed.png` }); }
    await stop(); assert.equal(await page.evaluate(() => __learn.pos), 0, 'Stop restores original practice position');
  }
  assert.ok(timings[1].noteIntervalMs > timings[0].noteIntervalMs * 1.7 && timings[2].noteIntervalMs > timings[1].noteIntervalMs * 1.7, 'half and quarter speeds really slow playback');
  await pick('twinkle', 'left'); await page.locator('#lspeed').selectOption('0.5');
  for (let i = 0; i < 3; i++) await next();
  const practicePosition = await page.evaluate(() => __learn.pos);
  await recordNotes(); await activate('#ldemo'); await page.waitForFunction(() => __noteTrace.length >= 2, null, { timeout: 10000 });
  const playing = await page.evaluate(() => ({ position: __learn.demoPos, count: __noteTrace.length, note: __noteTrace.at(-1).note }));
  await page.locator('#lspeed').selectOption('0.25');
  await page.waitForFunction(count => __noteTrace.length > count, playing.count, { timeout: 2000 });
  assert.equal(await page.evaluate(() => __learn.demoPos), playing.position, 'speed change resumes the currently demonstrated note');
  assert.equal(await page.evaluate(() => __noteTrace.at(-1).note), playing.note, 'changing speed keeps the current bass pitch');
  const changedCount = await page.evaluate(() => __noteTrace.length);
  await page.waitForTimeout(2800); assert.equal(await page.evaluate(() => __noteTrace.length), changedCount, 'old half-speed timers cannot fire after a quarter-speed change');
  await checkCue(); assert.equal(await page.evaluate(() => __learn.pos), practicePosition, 'listening does not edit practice progress');
  await stop(); assert.equal(await page.evaluate(() => __learn.pos), practicePosition, 'speed changes preserve the original resume position');
  await page.reload(); await page.waitForFunction(() => !!window.__piano); assert.equal(await page.locator('#lspeed').inputValue(), '0.25', 'listening speed persists');
  results.push({ device: 'desktop', timings, midPlaybackChange: true, originalPracticePositionPreserved: true, bassPitch: playing.note, persistence: true });
  await desktop.close();

  for (const [width, height, insets] of [[390, 844, { top: 47, bottom: 34, left: 0, right: 0 }], [667, 375, { top: 0, bottom: 21, left: 44, right: 44 }], [750, 342, { top: 0, bottom: 0, left: 0, right: 0 }], [844, 390, { top: 0, bottom: 21, left: 44, right: 44 }]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true });
    await open(context, true); const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
    await pick('twinkle', 'left', true); await page.locator('#lspeed').selectOption('0.5');
    await page.locator('#lspeed').scrollIntoViewIfNeeded(); await bounds('#lspeed', insets, true);
    await bounds('#staff', insets); const keyboard = await bounds('#kb', insets); assert.ok(keyboard.height >= 180, `${width}x${height}: keyboard retains room (${keyboard.height}px)`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'document has no horizontal overflow');
    await recordNotes(); await activate('#ldemo', true); await page.waitForFunction(() => __noteTrace.length >= 1, null, { timeout: 5000 }); await checkCue();
    await page.locator('#lspeed').scrollIntoViewIfNeeded(); await page.screenshot({ path: `${output}/${width}x${height}-slow-listening.png` });
    await stop(true); await page.locator('#lhand').selectOption('right'); assert.equal(await page.locator('#lspeed').inputValue(), '0.5', 'hand change retains listening speed');
    await activate('#ldemo', true); await page.waitForFunction(() => __learn.state === 'listening', null, { timeout: 3000 }); await stop(true);
    results.push({ viewport: { width, height }, insets, keyboardHeight: keyboard.height, speedControl: true, bothHands: true });
    await cdp.detach(); await context.close();
  }
  assert.deepEqual(errors, [], 'no script or first-party resource failures');
  await writeFile(`${output}/report.json`, JSON.stringify({ passed: true, results, errors, sampleWarnings }, null, 2));
  console.log(JSON.stringify({ passed: true, results, sampleWarnings, screenshots: output }, null, 2));
} catch (error) {
  if (page && !page.isClosed()) { await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {}); console.error('State', await page.evaluate(() => ({ state: window.__learn?.state, speed: window.__learn?.listenSpeed, pos: window.__learn?.pos, demoPos: window.__learn?.demoPos })).catch(() => null)); }
  console.error('Browser errors', errors); console.error('Optional sample warnings', sampleWarnings); throw error;
} finally { await browser?.close(); server?.kill(); }
