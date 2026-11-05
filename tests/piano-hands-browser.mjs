// Native pointer/touch practice of both parts, plus phone layout and lifecycle.
// Source/debug reads choose the next key; notes, hits and completion use real input.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';

const port = 5361, base = (process.env.GAMES_TEST_URL || `http://127.0.0.1:${port}`).replace(/\/$/, '');
const url = `${base}/piano/index.html`, output = 'test-results/piano-hands';
let server, browser, page;
const errors = [], sampleWarnings = [], results = [];
const midiOf = note => { const [, letter, accidental, octave] = /^([A-G])(#|b)?(\d)$/.exec(note); return (+octave + 1) * 12 + [0, 2, 4, 5, 7, 9, 11]['CDEFGAB'.indexOf(letter)] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0); };
async function activate(selector, touch) { await page.locator(selector)[touch ? 'tap' : 'click'](); }
async function open(context, touch) {
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.stack || error.message));
  page.on('console', event => {
    if (event.type() !== 'error') return;
    // Resource errors are classified by their real request URL below. Chromium
    // leaves console.location empty for some optional external sample failures.
    if (/Failed to load resource/.test(event.text())) return;
    errors.push(event.text());
  });
  page.on('response', response => { if (response.status() >= 400) (response.url().startsWith(base) ? errors : sampleWarnings).push(`${response.status()} ${response.url()}`); });
  page.on('requestfailed', request => (request.url().startsWith(base) ? errors : sampleWarnings).push(`${request.failure()?.errorText} ${request.url()}`));
  await page.goto(url);
  await page.waitForFunction(() => !!window.__piano && window.PIANO_SONGS.length >= 49);
  if (await page.locator('#rotgo').isVisible()) await activate('#rotgo', touch);
}
async function pick(id, touch, hand = 'left') {
  await activate('#songsBtn', touch);
  await page.locator('#songHand').selectOption(hand);
  await page.locator('#songq').fill('');
  assert.equal(await page.locator('#songlist .song').count(), 49);
  await activate(`#songlist .song[data-id="${id}"]`, touch);
  await page.waitForFunction(hand => __learn.hand === hand && !!__learn.song, hand);
  assert.equal(await page.locator('#lhand').inputValue(), hand);
}
async function indexOfMidi(midi, touch) {
  for (let tries = 0; tries < 6; tries++) {
    const index = await page.evaluate(m => m - 60 - (+document.getElementById('oct').textContent.slice(1) - 4) * 12, midi);
    if (index >= 0 && index < 25) return index;
    await activate(index < 0 ? '#od' : '#ou', touch);
  }
  throw Error(`Cannot reach MIDI ${midi}`);
}
async function tapMidi(midi, touch) {
  const index = await indexOfMidi(midi, touch), key = page.locator(`#kb .k[data-i="${index}"]`), box = await key.boundingBox();
  const black = await key.evaluate(node => node.classList.contains('b'));
  const x = box.x + box.width / 2, y = box.y + box.height * (black ? .4 : .86);
  if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
}
async function next(touch) { await tapMidi(await page.evaluate(() => __learn.steps[__learn.pos].midi), touch); }
async function staff(hand, touch) {
  if (!await page.locator('#staff').isVisible()) await activate('#lsheet', touch);
  assert.equal(await page.locator('#staff').getAttribute('data-clef'), hand === 'left' ? 'bass' : 'treble');
  assert.match(await page.locator('#staff').getAttribute('aria-label'), hand === 'left' ? /left.*bass/i : /right.*treble/i);
  assert.equal(await page.locator('#staff .n').count(), await page.evaluate(() => __learn.steps.length));
}
async function bounded(selector, insets, { hit = false } = {}) {
  const box = await page.locator(selector).boundingBox(), size = page.viewportSize(); assert.ok(box, `${selector} is visible`);
  assert.ok(box.x >= insets.left - 1 && box.x + box.width <= size.width - insets.right + 1 && box.y >= insets.top - 1 && box.y + box.height <= size.height - insets.bottom + 1, `${selector} leaves safe bounds: ${JSON.stringify(box)}`);
  if (hit) assert.ok(box.width >= 44 && box.height >= 44, `${selector} needs a 44px target`);
  return box;
}
try {
  if (!process.env.GAMES_TEST_URL) {
    server = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Piano hand test server did not start')), 10000);
      server.stdout.once('data', () => { clearTimeout(timer); resolve(); });
      server.once('error', error => { clearTimeout(timer); reject(error); });
      server.once('exit', code => { clearTimeout(timer); reject(Error(`Piano server exited ${code}`)); });
    });
  }
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await open(desktop, false); await pick('twinkle', false);
  const catalog = await page.evaluate(() => __piano.songs.map(song => ({ id: song.id, right: song.notes.length, left: song.leftNotes?.length || 0 })));
  assert.ok(catalog.every(song => song.right && song.left), 'all 49 songs supply both parts');
  await staff('left', false);
  const firstLeft = await page.evaluate(() => __learn.steps[0].midi), firstRight = midiOf(await page.evaluate(() => __learn.song.notes.find(note => !note.rest).note));
  assert.notEqual(firstLeft, firstRight, 'left accompaniment is distinct from the melody');
  await tapMidi(firstRight, false); assert.equal(await page.evaluate(() => __learn.pos), 0, 'a right-hand melody pitch cannot satisfy the left part');
  await next(false); assert.equal(await page.evaluate(() => __learn.pos), 1);
  await page.waitForTimeout(650); assert.equal(await page.evaluate(() => __learn.pos), 1, 'Wait stays on its selected left note');
  await activate('#lstop', false);
  await page.evaluate(() => { window.__notes = []; }); await activate('#ldemo', false);
  await page.waitForFunction(() => __learn.state === 'listening' && window.__notes.length > 0);
  const heard = await page.evaluate(() => __lastVoice.midi); assert.ok(heard >= 36 && heard <= 60, `Listen plays bass, got ${heard}`);
  await page.locator('#lhand').selectOption('right');
  assert.equal(await page.evaluate(() => __learn.state), 'ready'); assert.equal(await page.evaluate(() => __learn.pos), 0);
  assert.equal(await page.evaluate(() => __learn.demo), null); assert.equal(await page.evaluate(() => __learn.timer), null);
  await page.waitForTimeout(650); assert.equal(await page.locator('#kb .k.down').count(), 0, 'hand change releases demonstration keys');
  await staff('right', false); assert.equal(await page.evaluate(() => __learn.steps[0].midi), firstRight);
  await page.locator('#lhand').selectOption('left'); await activate('#lmode', false); await activate('#lplay', false);
  await page.waitForFunction(() => __learn.pos > 0, null, { timeout: 10000 }); await activate('#lplay', false);
  const paused = await page.evaluate(() => __learn.pos); await page.waitForTimeout(800); assert.equal(await page.evaluate(() => __learn.pos), paused);
  await page.locator('#lhand').selectOption('right'); await page.waitForTimeout(650);
  assert.deepEqual(await page.evaluate(() => ({ pos: __learn.pos, state: __learn.state })), { pos: 0, state: 'ready' });
  await activate('#lmode', false); await page.locator('#lhand').selectOption('left');
  await page.reload(); await page.waitForFunction(() => !!window.__piano); assert.equal(await page.locator('#lhand').inputValue(), 'left');
  await pick('twinkle', false); await staff('left', false);
  const target = page.locator('#staff .n[data-k="4"] .hit'); await target.scrollIntoViewIfNeeded(); await target.click(); assert.equal(await page.evaluate(() => __learn.pos), 4);
  await activate('#lstop', false); await page.screenshot({ path: `${output}/desktop-left-part.png` });
  results.push({ device: 'desktop', songsWithBothParts: catalog.length, selectedBassMidi: heard, wait: true, listen: true, tempoPause: true, switchCleanup: true, persistence: true, bassSheetJump: true });
  await desktop.close();

  for (const [width, height, insets] of [[390, 844, { top: 47, bottom: 34, left: 0, right: 0 }], [667, 375, { top: 0, bottom: 21, left: 44, right: 44 }], [750, 342, { top: 0, bottom: 0, left: 0, right: 0 }], [844, 390, { top: 0, bottom: 21, left: 44, right: 44 }]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true });
    await open(context, true); const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
    await activate('#songsBtn', true); await page.locator('#songHand').selectOption('left'); await bounded('#songHand', insets, { hit: true });
    await page.locator('#songq').fill('twinkle'); await activate('#songlist .song[data-id="twinkle"]', true); await staff('left', true);
    await page.locator('#lhand').scrollIntoViewIfNeeded(); await bounded('#lhand', insets, { hit: true }); await bounded('#staff', insets);
    const keyboard = await bounded('#kb', insets); assert.ok(keyboard.height >= 180, `${width}x${height}: keys need room with sheet open, got ${keyboard.height}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'phone document does not overflow horizontally');
    for (let i = 0; i < 3; i++) await next(true);
    await page.screenshot({ path: `${output}/${width}x${height}-left-part.png` });
    if (width === 390) {
      const n = await page.evaluate(() => __learn.steps.length);
      for (let i = 3; i < n; i++) await next(true);
      assert.equal(await page.evaluate(() => __learn.state), 'done'); assert.equal(await page.locator('#done').isVisible(), true);
      await page.screenshot({ path: `${output}/phone-left-complete.png` });
      await activate('#dagain', true); assert.deepEqual(await page.evaluate(() => ({ pos: __learn.pos, state: __learn.state })), { pos: 0, state: 'ready' });
      results.push({ device: 'phone', nativeLeftCompletion: n });
    }
    // Changing the selected hand while a real finger is held releases that
    // gesture, rather than carrying its old keyboard index into the new octave.
    const index = await indexOfMidi(await page.evaluate(() => __learn.steps[__learn.pos].midi), true), key = await page.locator(`#kb .k[data-i="${index}"]`).boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 11, x: key.x + key.width / 2, y: key.y + key.height * .85 }] });
    await page.locator('#lhand').selectOption('right');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.equal(await page.locator('#kb .k.down').count(), 0); assert.deepEqual(await page.evaluate(() => ({ pos: __learn.pos, state: __learn.state })), { pos: 0, state: 'ready' });
    await staff('right', true); await next(true); assert.equal(await page.evaluate(() => __learn.pos), 1);
    results.push({ viewport: { width, height }, insets, keyboardHeight: keyboard.height, heldTouchSwitch: true, bothHands: true });
    await cdp.detach(); await context.close();
  }
  assert.deepEqual(errors, [], 'no script or first-party resource errors');
  await writeFile(`${output}/report.json`, JSON.stringify({ passed: true, results, errors, sampleWarnings }, null, 2));
  console.log(JSON.stringify({ passed: true, results, screenshots: output }, null, 2));
} catch (error) {
  if (page && !page.isClosed()) { await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {}); console.error('State', await page.evaluate(() => ({ hand: window.__learn?.hand, state: window.__learn?.state, pos: window.__learn?.pos, body: document.body.className })).catch(() => null)); }
  console.error('Browser errors', errors); console.error('Optional sample warnings', sampleWarnings); throw error;
} finally { await browser?.close(); server?.kill(); }
