// Native synchronized practice/playback, grand staff, and full-range phone keys.
// Debug reads select notes and inspect timings; actual input creates every hit.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';

const port = 5367, base = (process.env.GAMES_TEST_URL || `http://127.0.0.1:${port}`).replace(/\/$/, '');
const output = 'test-results/piano-both-hands', url = `${base}/piano/index.html`;
let server, browser, page;
const errors = [], sampleWarnings = [], results = [];
const midiOf = note => { const [, letter, accidental, octave] = /^([A-G])(#|b)?(\d)$/.exec(note); return (+octave + 1) * 12 + [0, 2, 4, 5, 7, 9, 11]['CDEFGAB'.indexOf(letter)] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0); };
async function activate(selector, touch = false) { await page.locator(selector)[touch ? 'tap' : 'click'](); }
async function open(context, touch = false) {
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.stack || error.message));
  page.on('console', event => { if (event.type() === 'error' && !/Failed to load resource/.test(event.text())) errors.push(event.text()); });
  // Resource URLs are more reliable than Chromium's sometimes-empty console
  // locations. Optional remote sample failures remain visible in the report.
  page.on('response', response => { if (response.status() >= 400) (response.url().startsWith(base) ? errors : sampleWarnings).push(`${response.status()} ${response.url()}`); });
  page.on('requestfailed', request => (request.url().startsWith(base) ? errors : sampleWarnings).push(`${request.failure()?.errorText} ${request.url()}`));
  await page.goto(url); await page.waitForFunction(() => !!window.__piano && !!__piano.keyboard);
  if (await page.locator('#rotgo').isVisible()) await activate('#rotgo', touch);
}
async function pick(id, touch = false) {
  await activate('#songsBtn', touch); await page.locator('#songHand').selectOption('both'); await page.locator('#songq').fill('');
  assert.equal(await page.locator('#songlist .song').count(), await page.evaluate(() => __piano.songs.length));
  await activate(`#songlist .song[data-id="${id}"]`, touch);
  await page.waitForFunction(() => __learn.hand === 'both' && !!__learn.events?.length);
  assert.equal(await page.locator('#lhand').inputValue(), 'both');
}
async function ensureStaff(touch = false) {
  if (!await page.locator('#staff').isVisible()) await activate('#lsheet', touch);
  assert.equal(await page.locator('#staff').getAttribute('data-clef'), 'grand');
  assert.ok(await page.locator('#staff .n[data-hand="left"]').count() > 0);
  assert.ok(await page.locator('#staff .n[data-hand="right"]').count() > 0);
}
async function keyPoint(midi) {
  const index = await page.evaluate(m => m - __piano.keyboard.base, midi), key = page.locator(`#kb .k[data-i="${index}"]`), box = await key.boundingBox();
  assert.ok(box, `MIDI ${midi} has a visible key`);
  const black = await key.evaluate(node => node.classList.contains('b'));
  return { x: box.x + box.width / 2, y: box.y + box.height * (black ? .4 : .86) };
}
async function playChord(cdp) {
  const midis = await page.evaluate(() => __learn.steps[__learn.pos].midis);
  assert.ok(midis.length >= 2, 'first Twinkle onset contains both hands');
  const points = await Promise.all(midis.map(keyPoint));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 11, ...points[0] }] });
  assert.equal(await page.evaluate(() => __learn.pos), 0, 'one hand cannot complete the two-hand onset');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points.map((point, index) => ({ id: 11 + index, ...point })) });
  await page.waitForFunction(() => __learn.pos === 1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function recordOnsets() {
  await page.evaluate(() => {
    window.__onsets = [];
    window.__notes = { push(note) { __onsets.push({ note, time: performance.now() }); } };
  });
}
async function bounded(selector, insets, hit = false) {
  const box = await page.locator(selector).boundingBox(), size = page.viewportSize(); assert.ok(box, `${selector} is visible`);
  assert.ok(box.x >= insets.left - 1 && box.x + box.width <= size.width - insets.right + 1 && box.y >= insets.top - 1 && box.y + box.height <= size.height - insets.bottom + 1, `${selector} leaves safe bounds ${JSON.stringify(box)}`);
  if (hit) assert.ok(box.width >= 44 && box.height >= 44, `${selector} has a 44px target`);
  return box;
}
async function allKeysVisible() {
  const data = await page.evaluate(() => {
    const kb = document.getElementById('kb'), area = kb.getBoundingClientRect(), all = [...kb.querySelectorAll('.k')];
    return { keyboard: __piano.keyboard, count: all.length, scroll: kb.scrollWidth > kb.clientWidth + 1, hidden: all.filter(node => { const r = node.getBoundingClientRect(); return r.width <= 0 || r.x < area.x - 1 || r.right > area.right + 1; }).map(node => node.dataset.i), markers: all.filter(node => ((__piano.keyboard.base + +node.dataset.i) % 12) === 0).map(node => { const label = node.querySelector('span'), style = getComputedStyle(label); return { name: label.textContent, visible: style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.fontSize) >= 8 }; }) };
  });
  assert.equal(data.count, data.keyboard.count); assert.ok(data.count > 25 && data.count <= 128);
  assert.equal(data.keyboard.count, data.keyboard.high - data.keyboard.base + 1);
  assert.equal(data.scroll, false, 'expanded keyboard needs no horizontal scroll'); assert.deepEqual(data.hidden, []);
  assert.ok(data.markers.length >= 4 && data.markers.every(marker => marker.visible), 'C octave markers remain readable');
  return data.keyboard;
}
async function bothCurrent() {
  const active = await page.locator('#staff .n.cur').evaluateAll(nodes => nodes.map(node => ({ hand: node.dataset.hand, event: node.dataset.event })));
  assert.ok(active.some(node => node.hand === 'left') && active.some(node => node.hand === 'right'), 'both active voices are highlighted on the score');
  return active;
}
try {
  if (!process.env.GAMES_TEST_URL) {
    server = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('Both-hand server did not start')), 10000); server.stdout.once('data', () => { clearTimeout(timer); resolve(); }); server.once('error', error => { clearTimeout(timer); reject(error); }); server.once('exit', code => { clearTimeout(timer); reject(Error(`Both-hand server exited ${code}`)); }); });
  }
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 850 }, hasTouch: true });
  await open(desktop); await pick('twinkle'); await ensureStaff(); const cdp = await desktop.newCDPSession(page);
  const first = await page.evaluate(() => ({ midis: __learn.steps[0].midis, events: __learn.events.filter(event => Math.abs(event.beat) < 1e-6).map(event => ({ id: event.id, hand: event.hand, midi: event.midi, dur: event.dur })), tempo: __learn.song.tempo }));
  assert.ok(first.events.some(event => event.hand === 'left') && first.events.some(event => event.hand === 'right'));
  await playChord(cdp); await activate('#lstop');
  // Two aligned staves use the same horizontal coordinate for a shared onset.
  const aligned = await page.locator('#staff .n[data-k="0"]').evaluateAll(nodes => nodes.map(node => { const r = node.querySelector('ellipse').getBoundingClientRect(); return { hand: node.dataset.hand, x: r.x + r.width / 2 }; }));
  const left = aligned.find(note => note.hand === 'left'), right = aligned.find(note => note.hand === 'right');
  assert.ok(left && right && Math.abs(left.x - right.x) < 1, 'left and right notes at the same beat align');
  const timing = [];
  for (const speed of [.25, .5, .75, 1]) {
    if (await page.locator('#lstop').isEnabled()) await activate('#lstop');
    await page.locator('#lspeed').selectOption(String(speed)); await recordOnsets(); await activate('#ldemo');
    await page.waitForFunction(() => window.__onsets.length >= 3, null, { timeout: 15000 });
    const onsets = await page.evaluate(() => __onsets.slice(0, 3));
    assert.deepEqual(onsets.slice(0, 2).map(onset => midiOf(onset.note)).sort((a, b) => a - b), [...first.midis].sort((a, b) => a - b), 'Listen emits the actual pitches of both parts');
    assert.ok(Math.abs(onsets[0].time - onsets[1].time) < 50, 'two hands share an onset');
    const expected = 60000 / first.tempo / speed, gap = onsets[2].time - Math.min(onsets[0].time, onsets[1].time);
    assert.ok(Math.abs(gap - expected) < expected * .2 + 80, `${speed}: expected ${expected}ms between melody notes, got ${gap}`);
    const active = await bothCurrent(), bass = first.events.find(event => event.hand === 'left');
    assert.ok(active.some(event => event.event === String(bass.id)), 'the original sustained bass stays highlighted under the next melody note');
    const bassIndex = await page.evaluate(midi => midi - __piano.keyboard.base, bass.midi);
    assert.equal(await page.locator(`#kb .k[data-i="${bassIndex}"]`).evaluate(node => node.classList.contains('down')), true, 'bass remains held while melody changes');
    timing.push({ speed, expectedGapMs: expected, actualGapMs: Math.round(gap), synchronizedOnsetMs: Math.round(Math.abs(onsets[0].time - onsets[1].time)) });
    if (speed === .25) {
      // The current melody-only onset still lies inside the first bass note.
      // Changing speed must restore that remaining bass span with the melody.
      await recordOnsets(); await page.locator('#lspeed').selectOption('0.5');
      await page.waitForFunction(() => window.__onsets.length >= 2);
      const carry = await page.evaluate(() => ({ notes: __onsets.slice(0, 2).map(note => note.note), pos: __learn.demoPos }));
      assert.equal(carry.pos, 1); assert.deepEqual(carry.notes.map(midiOf).sort((a, b) => a - b), [...first.midis].sort((a, b) => a - b)); await bothCurrent();
    }
    await activate('#ldemo'); await page.waitForTimeout(160);
    assert.equal(await page.evaluate(() => __learn.demo), null); assert.equal(await page.locator('#kb .k.down').count(), 0);
  }
  const melodyOnly = page.locator('#staff .n[data-hand="right"][data-k="1"] .hit');
  await melodyOnly.scrollIntoViewIfNeeded(); await melodyOnly.click(); assert.equal(await page.evaluate(() => __learn.pos), 1);
  await page.locator('#lspeed').selectOption('0.5'); await recordOnsets(); await activate('#ldemo');
  await page.waitForFunction(() => window.__onsets.length >= 2); await bothCurrent();
  assert.deepEqual((await page.evaluate(() => __onsets.slice(0, 2).map(onset => onset.note))).map(midiOf).sort((a, b) => a - b), [...first.midis].sort((a, b) => a - b), 'seeking into a sustained bass restores its remaining span');
  await activate('#ldemo'); assert.equal(await page.evaluate(() => __learn.pos), 1);
  assert.equal(await page.locator('#staff .n.cur[data-hand="left"]').count(), 0, 'Stop restores the melody-only practice target without a stale bass highlight');
  const target = page.locator('#staff .n[data-hand="left"]').nth(1), targetStep = +(await target.getAttribute('data-k'));
  await target.locator('.hit').scrollIntoViewIfNeeded(); await target.locator('.hit').click(); assert.equal(await page.evaluate(() => __learn.pos), targetStep, 'clicking either staff seeks its shared onset');
  await activate('#lstop'); await page.screenshot({ path: `${output}/desktop-grand-staff.png` });
  const catalog = await page.evaluate(() => {
    const rows = [];
    for (const song of __piano.songs) { __piano.startSong(song); const range = __piano.keyboard, events = __learn.events; rows.push({ id: song.id, ...range, missing: events.filter(event => event.midi < range.base || event.midi > range.high).length, hands: [...new Set(events.map(event => event.hand))].sort() }); }
    return rows;
  });
  assert.ok(catalog.length >= 65 && catalog.every(song => !song.missing && song.base >= 0 && song.high <= 127 && song.count === song.high - song.base + 1 && song.hands.join(',') === 'left,right'), 'all sourced and practice arrangements fit the expanded keyboard without octave folding');
  await pick('twinkle'); await page.reload(); await page.waitForFunction(() => !!window.__piano?.keyboard);
  assert.equal(await page.locator('#lhand').inputValue(), 'both'); await pick('twinkle'); await ensureStaff(); await allKeysVisible();
  await activate('#ldemo'); await page.waitForFunction(() => __learn.demoNotes.size >= 2); await page.locator('#lhand').selectOption('right');
  assert.equal(await page.evaluate(() => __piano.keyboard.count), 25); assert.equal(await page.evaluate(() => __learn.demo), null); assert.equal(await page.locator('#kb .k.down').count(), 0);
  await page.locator('#lhand').selectOption('left'); assert.equal(await page.evaluate(() => __piano.keyboard.count), 25); assert.equal(await page.locator('#staff').getAttribute('data-clef'), 'bass');
  results.push({ device: 'desktop', songsWithBothParts: catalog.length, nativeTwoHandWait: true, alignedGrandStaff: true, sustainedBass: true, restoredBassOnSpeedChange: true, timing, persistence: true, cleanSingleHandReturn: true });
  await cdp.detach(); await desktop.close();

  for (const [width, height, insets] of [[390, 844, { top: 47, bottom: 34, left: 0, right: 0 }], [667, 375, { top: 0, bottom: 21, left: 44, right: 44 }], [750, 342, { top: 0, bottom: 0, left: 0, right: 0 }], [844, 390, { top: 0, bottom: 21, left: 44, right: 44 }]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true });
    await open(context, true); const touch = await context.newCDPSession(page); await touch.send('Emulation.setSafeAreaInsetsOverride', { insets });
    await activate('#songsBtn', true); await page.locator('#songHand').selectOption('both'); await bounded('#songHand', insets, true);
    await page.locator('#songq').fill('twinkle'); await activate('#songlist .song[data-id="twinkle"]', true); await ensureStaff(true);
    await page.locator('#lhand').scrollIntoViewIfNeeded(); await bounded('#lhand', insets, true); const score = await bounded('#staff', insets), kb = await bounded('#kb', insets);
    assert.ok(kb.height >= 96, `${width}x${height}: keys have at least96px with grand staff, got ${kb.height}`);
    assert.ok(kb.y >= score.y + score.height - 1, 'grand staff and keyboard do not overlap');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    const range = await allKeysVisible(); await playChord(touch); await activate('#lstop', true);
    await page.locator('#lspeed').selectOption('0.25'); await activate('#ldemo', true); await page.waitForFunction(() => __learn.demoNotes.size >= 2); await bothCurrent();
    await page.screenshot({ path: `${output}/${width}x${height}-both-playing.png` }); await activate('#ldemo', true);
    assert.equal(await page.locator('#kb .k.down').count(), 0);
    results.push({ viewport: { width, height }, insets, keyboardHeight: kb.height, grandStaffHeight: score.height, keys: range.count, nativeChord: true, bothHandsListen: true });
    await touch.detach(); await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(`${output}/report.json`, JSON.stringify({ passed: true, results, errors, sampleWarnings }, null, 2));
  console.log(JSON.stringify({ passed: true, results, screenshots: output }, null, 2));
} catch (error) {
  if (page && !page.isClosed()) { await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {}); console.error('State', await page.evaluate(() => ({ hand: window.__learn?.hand, state: window.__learn?.state, pos: window.__learn?.pos, demoPos: window.__learn?.demoPos, keyboard: window.__piano?.keyboard })).catch(() => null)); }
  console.error('Browser errors', errors); console.error('Optional sample warnings', sampleWarnings); throw error;
} finally { await browser?.close(); server?.kill(); }
