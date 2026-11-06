// Source-backed polyphonic scores: exact notes, original range, native practice,
// owner lifetimes, notation and phone rendering. Fixtures only select positions.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';

const port = 5369, base = (process.env.GAMES_TEST_URL || `http://127.0.0.1:${port}`).replace(/\/$/, '');
const output = 'test-results/piano-scores', errors = [], sampleWarnings = [], results = [];
let server, browser, page;
async function activate(selector, touch = false) { await page.locator(selector)[touch ? 'tap' : 'click'](); }
async function open(context, touch = false) {
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.stack || error.message));
  page.on('console', event => { if (event.type() === 'error' && !/Failed to load resource/.test(event.text())) errors.push(event.text()); });
  page.on('response', response => { if (response.status() >= 400) (response.url().startsWith(base) ? errors : sampleWarnings).push(`${response.status()} ${response.url()}`); });
  page.on('requestfailed', request => (request.url().startsWith(base) ? errors : sampleWarnings).push(`${request.failure()?.errorText} ${request.url()}`));
  await page.goto(`${base}/piano/index.html`);
  await page.waitForFunction(() => !!window.__piano && window.__piano.songs.length >= 65 && window.PIANO_SCORE_DATA?.length >= 28);
  if (await page.locator('#rotgo').isVisible()) await activate('#rotgo', touch);
}
async function pick(id, hand = 'both', touch = false) {
  await activate('#songsBtn', touch); await page.locator('#songHand').selectOption(hand); await page.locator('#songq').fill('');
  await activate(`#songlist .song[data-id="${id}"]`, touch);
  assert.equal(await page.evaluate(() => __learn.song.score), true);
  if (!await page.locator('#staff').isVisible()) await activate('#lsheet', touch);
}
async function point(midi) {
  const index = await page.evaluate(note => note - __piano.keyboard.base, midi), key = page.locator(`#kb .k[data-i="${index}"]`), box = await key.boundingBox();
  assert.ok(box, `source MIDI ${midi} has a visible key`);
  const black = await key.evaluate(node => node.classList.contains('b'));
  return { x: box.x + box.width / 2, y: box.y + box.height * (black ? .4 : .86) };
}
async function playOnset(touch = false) {
  for (const midi of await page.evaluate(() => __learn.steps[__learn.pos].midis)) {
    const p = await point(midi);
    if (touch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
  }
}
async function bounded(selector, insets, hit = false) {
  const box = await page.locator(selector).boundingBox(), viewport = page.viewportSize(); assert.ok(box, `${selector} is visible`);
  assert.ok(box.x >= insets.left - 1 && box.x + box.width <= viewport.width - insets.right + 1 && box.y >= insets.top - 1 && box.y + box.height <= viewport.height - insets.bottom + 1, `${selector} leaves safe bounds ${JSON.stringify(box)}`);
  if (hit) assert.ok(box.width >= 44 && box.height >= 44, `${selector} has a 44px target`);
  return box;
}
async function scoreDetails(touch = false) {
  assert.match(await page.locator('#scoreInfo').textContent(), /sourced/i);
  await activate('#scoreInfo', touch); await page.locator('#scoreDetails').waitFor({ state: 'visible' });
  assert.match(await page.locator('#scoreScope').textContent(), /complete/i);
  assert.equal(await page.locator('#scoreSource').getAttribute('href'), await page.evaluate(() => __learn.song.source.url));
  assert.ok((await page.locator('#scoreCredit').textContent()).length > 10);
  await activate('#scoreClose', touch);
}
async function visibleScoreAndKeys(insets) {
  const score = await bounded('#staff', insets), keyboard = await bounded('#kb', insets);
  assert.ok(keyboard.height >= 96, `source-score keyboard needs96px height, got ${keyboard.height}`);
  assert.ok(keyboard.y >= score.y + score.height - 1, 'score and keyboard do not overlap');
  const geometry = await page.evaluate(() => {
    const score = document.getElementById('staff').getBoundingClientRect(), keyboard = document.getElementById('kb'), rect = keyboard.getBoundingClientRect();
    return {
      notes: document.querySelectorAll('#staff .n').length,
      clippedNotes: [...document.querySelectorAll('#staff .n ellipse')].filter(node => { const r = node.getBoundingClientRect(); return r.y < score.y - 1 || r.bottom > score.bottom + 1; }).length,
      missingKeys: [...keyboard.querySelectorAll('.k')].filter(node => { const r = node.getBoundingClientRect(); return r.width <= 0 || r.x < rect.x - 1 || r.right > rect.right + 1; }).length,
      keyboardScroll: keyboard.scrollWidth > keyboard.clientWidth + 1,
      pageScroll: document.documentElement.scrollWidth > innerWidth + 1,
      ...__piano.keyboard,
    };
  });
  assert.equal(geometry.notes, await page.evaluate(() => __learn.events.length), 'every source note is engraved');
  assert.equal(geometry.clippedNotes, 0, 'low bass and high treble notes remain inside the score');
  assert.equal(geometry.missingKeys, 0); assert.equal(geometry.keyboardScroll, false); assert.equal(geometry.pageScroll, false);
  return { keyboardHeight: keyboard.height, staffHeight: score.height, ...geometry };
}
async function recordNotes() {
  await page.evaluate(() => { window.__scoreOnsets = []; window.__notes = { push(note) { __scoreOnsets.push({ note, time: performance.now() }); } }; });
}
async function keyboardZoom(touch, insets, name, persist = false) {
  assert.equal(await page.evaluate(() => __piano.keyboardZoom), 1, 'scores start in the fitted keyboard view');
  assert.equal(await page.locator('#keyPan').isVisible(), false);
  const original = await page.evaluate(() => ({ range: __piano.keyboard, keyWidth: document.querySelector('#kb .k.w').getBoundingClientRect().width }));
  const markers = await page.locator('#kb .k.octave-key span').evaluateAll(nodes => nodes.map(node => { const style = getComputedStyle(node), rect = node.getBoundingClientRect(); return { text: node.textContent, width: rect.width, textWidth: node.scrollWidth, font: parseFloat(style.fontSize), visible: style.display !== 'none' && style.visibility !== 'hidden' }; }));
  assert.ok(markers.length >= 6 && markers.every(marker => marker.visible && marker.font >= 9 && marker.textWidth <= Math.ceil(marker.width) + 1 && /^C\d$/.test(marker.text)), 'wide fitted keyboards keep full readable octave tags');
  await activate('#keyZoom', touch); assert.equal(await page.evaluate(() => __piano.keyboardZoom), 2);
  await page.locator('#keyPan').scrollIntoViewIfNeeded(); await bounded('#keyPan', insets, true);
  const doubled = await page.evaluate(() => ({ keyWidth: document.querySelector('#kb .k.w').getBoundingClientRect().width, scroll: document.getElementById('kb').scrollWidth, width: document.getElementById('kb').clientWidth }));
  assert.ok(Math.abs(doubled.keyWidth - original.keyWidth * 2) < 1 && doubled.scroll > doubled.width * 1.9, '2× enlarges the actual playing surface');
  await page.locator('#keyPan').focus(); await page.keyboard.press('End');
  assert.ok(await page.evaluate(() => { const kb = document.getElementById('kb'); return kb.scrollLeft >= (kb.scrollWidth - kb.clientWidth) * .98; }), 'native position input pans to the high keys');
  await page.keyboard.press('Home');
  assert.ok(await page.evaluate(() => document.getElementById('kb').scrollLeft < 2), 'native position input pans back to low keys');
  const slider = await page.locator('#keyPan').boundingBox();
  if (touch) await page.touchscreen.tap(slider.x + slider.width * .6, slider.y + slider.height / 2);
  else await page.mouse.click(slider.x + slider.width * .6, slider.y + slider.height / 2);
  assert.ok(await page.evaluate(() => { const kb = document.getElementById('kb'), ratio = kb.scrollLeft / (kb.scrollWidth - kb.clientWidth); return ratio > .35 && ratio < .85; }), 'pointer input pans the enlarged keyboard');
  await page.locator('#keyPan').focus(); await page.keyboard.press('Home');
  const high = await page.evaluate(() => { let index = 0; __learn.steps.forEach((step, i) => { if (step.midi > __learn.steps[index].midi) index = i; }); return { index, midi: __learn.steps[index].midi }; });
  const note = page.locator(`#staff .n[data-k="${high.index}"] .hit`).first(); await note.scrollIntoViewIfNeeded(); await note[touch ? 'tap' : 'click']();
  const followed = await page.evaluate(midi => { const kb = document.getElementById('kb'), viewport = kb.getBoundingClientRect(), key = kb.querySelector(`.k[data-i="${midi - __piano.keyboard.base}"]`).getBoundingClientRect(); return { inside: key.x >= viewport.x - 1 && key.right <= viewport.right + 1, pan: kb.scrollLeft, pos: __learn.pos }; }, high.midi);
  assert.ok(followed.inside && followed.pan > 0 && followed.pos === high.index, 'selecting a later high note follows it in the enlarged keyboard');
  await activate('#keyZoom', touch); assert.equal(await page.evaluate(() => __piano.keyboardZoom), 3);
  assert.deepEqual(await page.evaluate(() => __piano.keyboard), original.range, 'zoom changes presentation, preserving every source pitch');
  const tripled = await page.locator('#kb .k.w').first().evaluate(node => node.getBoundingClientRect().width);
  assert.ok(Math.abs(tripled - original.keyWidth * 3) < 1, '3× offers larger keys');
  await page.locator('#keyZoom').scrollIntoViewIfNeeded(); await page.screenshot({ path: `${output}/${name}-zoom3.png` });
  if (persist) {
    const song = await page.evaluate(() => __learn.song.id); await page.reload(); await page.waitForFunction(() => !!window.__piano);
    assert.equal(await page.evaluate(() => __piano.keyboardZoom), 3); assert.equal(await page.evaluate(() => localStorage.getItem('piano.zoom')), '3');
    await pick(song, 'both', touch);
  }
  await activate('#keyZoom', touch); assert.equal(await page.evaluate(() => __piano.keyboardZoom), 1);
  assert.equal(await page.locator('#keyPan').isVisible(), false);
  assert.ok(await page.evaluate(() => { const kb = document.getElementById('kb'); return kb.scrollLeft === 0 && kb.scrollWidth <= kb.clientWidth + 1; }), 'Fit resets pan and reveals the entire original range');
  await activate('#lab', touch); await activate('#lab', touch);
  assert.equal(await page.locator('#kb .k span').evaluateAll(nodes => nodes.filter(node => node.checkVisibility({ checkVisibilityCSS: true })).length), 0, 'No labels also hides the fitted octave tags');
  await activate('#lab', touch);
  await page.locator('#lhand').scrollIntoViewIfNeeded(); await page.screenshot({ path: `${output}/${name}-fit-octaves.png` });
  return { zoom2: true, zoom3: true, nativePan: true, followsLesson: true, fitReset: true, persistence: persist, fitKeyWidth: original.keyWidth, zoom3KeyWidth: tripled };
}
try {
  if (!process.env.GAMES_TEST_URL) {
    server = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('Score browser server did not start')), 10000); server.stdout.once('data', () => { clearTimeout(timer); resolve(); }); server.once('error', error => { clearTimeout(timer); reject(error); }); server.once('exit', code => { clearTimeout(timer); reject(Error(`Score server exited ${code}`)); }); });
  }
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 850 }, hasTouch: true });
  await open(desktop); await pick('elise'); await scoreDetails();
  const catalog = await page.evaluate(() => {
    const midi = value => { if (typeof value === 'number') return value; const [, note, accidental, octave] = /^([A-G])(#|b)?(\d)$/.exec(value); return (+octave + 1) * 12 + [0, 2, 4, 5, 7, 9, 11]['CDEFGAB'.indexOf(note)] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0); };
    const normalized = values => values.map(value => [value[0], Math.round(value[1] * 1e6), Math.round(value[2] * 1e6), value[3]]).sort((a, b) => a[3].localeCompare(b[3]) || a[1] - b[1] || a[0] - b[0] || a[2] - b[2]);
    __piano.setHand('both');
    return PIANO_SCORE_DATA.map(source => {
      const song = __piano.songs.find(song => song.id === source.id); __piano.startSong(song);
      const expected = normalized(['right', 'left'].flatMap(hand => source[hand].map(note => [midi(note[0]), note[1], note[2], hand])));
      const actual = normalized(__learn.events.map(event => [event.midi, event.beat, event.dur, event.hand]));
      const score = document.getElementById('staff').getBoundingClientRect();
      const clipped = [...document.querySelectorAll('#staff .n ellipse')].filter(node => { const r = node.getBoundingClientRect(); return r.y < score.y - 1 || r.bottom > score.bottom + 1; }).length;
      const range = __piano.keyboard;
      const wrongKeyColors = [...document.querySelectorAll('#kb .k')].filter(key => key.classList.contains('b') !== [1, 3, 6, 8, 10].includes((range.base + +key.dataset.i) % 12)).length;
      return { id: source.id, notes: actual.length, exactNotes: JSON.stringify(expected) === JSON.stringify(actual), duration: __learn.total, expectedDuration: source.duration, missing: __learn.events.filter(event => event.midi < range.base || event.midi > range.high).length, clipped, wrongKeyColors, range, signature: song.timeSignature, source: song.source.url };
    });
  });
  assert.ok(catalog.length >= 28);
  for (const song of catalog) { assert.ok(song.exactNotes, `${song.id}: every source pitch, onset, duration and staff survives import`); assert.ok(Math.abs(song.duration - song.expectedDuration) < 1e-6, `${song.id}: full published duration`); assert.equal(song.missing, 0, `${song.id}: no folded or unreachable source notes`); assert.equal(song.clipped, 0, `${song.id}: notation bounds preserve original pitch extremes`); assert.ok(song.range.base >= 21 && song.range.high <= 108 && song.range.count <= 88, `${song.id}: expanded keys stay within the physical piano`); assert.equal(song.wrongKeyColors, 0, `${song.id}: A0-based layouts retain correct black and white pitches`); }
  for (const [id, signature, barLength, pickup] of [['elise', [3, 8], 1.5, .5], ['clairdelune', [9, 8], 4.5, 0]]) {
    for (const hand of ['right', 'left', 'both']) {
      await pick(id, hand); await scoreDetails();
      assert.equal(await page.locator(`#staff .time-signature[data-numerator="${signature[0]}"][data-denominator="${signature[1]}"]`).count(), hand === 'both' ? 2 : 1);
      const bars = await page.locator('#staff .barline').evaluateAll(nodes => nodes.slice(0, 3).map(node => +node.dataset.beat));
      assert.ok(Math.abs(bars[0] - (pickup || barLength)) < 1e-6 && Math.abs(bars[1] - bars[0] - barLength) < 1e-6, `${id}: quarter-beat barlines respect the denominator`);
      const visible = await visibleScoreAndKeys({ top: 0, bottom: 0, left: 0, right: 0 });
      await page.screenshot({ path: `${output}/desktop-${id}-${hand}.png` }); results.push({ id, hand, ...visible });
    }
  }
  // A polyphonic single-hand score still waits for every distinct key in its
  // chord, rather than treating its first melody pitch as the complete onset.
  await pick('elise', 'right');
  const chord = await page.evaluate(() => { const index = __learn.steps.findIndex(step => step.midis.length >= 2 && step.midis.length <= 4); __piano.jumpTo(index); return { index, midis: __learn.steps[index].midis }; });
  const cdp = await desktop.newCDPSession(page), points = await Promise.all(chord.midis.map(point));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 31, ...points[0] }] }); assert.equal(await page.evaluate(() => __learn.pos), chord.index);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points.map((point, index) => ({ id: 31 + index, ...point })) });
  assert.equal(await page.evaluate(() => __learn.pos), chord.index + 1); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  // The printed Humpty score has G4 in two right-hand voices at beat19.5,
  // lasting .5 and1.5 beats. One attack must outlive its shorter owner.
  await pick('humpty', 'right'); await page.locator('#lspeed').selectOption('1');
  const unison = await page.evaluate(() => { const events = __learn.events.filter(event => event.midi === 67 && Math.abs(event.beat - 19.5) < 1e-6).sort((a, b) => a.dur - b.dur); const step = events[0].stepIndex; __piano.jumpTo(step); return { short: events[0].id, long: events[1].id, step }; });
  await recordNotes(); await activate('#ldemo');
  await page.waitForFunction(({ short, long }) => __learn.demoActive.has(long) && !__learn.demoActive.has(short), unison, { timeout: 3000 });
  const heldUnison = await page.evaluate(() => ({ sounding: document.querySelector(`#kb .k[data-i="${67 - __piano.keyboard.base}"]`).classList.contains('down'), attacks: __scoreOnsets.filter(onset => onset.note === 'G4').length }));
  assert.deepEqual(heldUnison, { sounding: true, attacks: 1 });
  await page.waitForFunction(({ long }) => !__learn.demoActive.has(long), unison, { timeout: 3000 });
  assert.equal(await page.locator(`#kb .k[data-i="${await page.evaluate(() => 67 - __piano.keyboard.base)}"]`).evaluate(node => node.classList.contains('down')), false, 'the longer owner finally releases the unison key');
  await activate('#ldemo');
  // Play the entire sourced Yankee Doodle setting by native piano presses.
  await pick('yankee'); const groups = await page.evaluate(() => __learn.steps.length);
  for (let index = 0; index < groups; index++) await playOnset();
  assert.equal(await page.evaluate(() => __learn.state), 'done'); assert.ok(await page.locator('#done').isVisible());
  await page.screenshot({ path: `${output}/source-yankee-native-complete.png` });
  results.push({ sourceScores: catalog.length, sourceNotes: catalog.reduce((sum, song) => sum + song.notes, 0), exactImport: true, singleHandChord: chord.midis.length, overlappingUnisonOwners: true, nativeSourceCompletion: { id: 'yankee', groups } });
  await activate('#dclose'); await pick('elise'); results.push({ device: 'desktop', keyboardZoom: await keyboardZoom(false, { top: 0, bottom: 0, left: 0, right: 0 }, 'desktop-elise', true) });
  await cdp.detach(); await desktop.close();

  for (const [width, height, insets] of [[390, 844, { top: 47, bottom: 34, left: 0, right: 0 }], [667, 375, { top: 0, bottom: 21, left: 44, right: 44 }], [750, 342, { top: 0, bottom: 0, left: 0, right: 0 }], [844, 390, { top: 0, bottom: 21, left: 44, right: 44 }]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true });
    await open(context, true); const touch = await context.newCDPSession(page); await touch.send('Emulation.setSafeAreaInsetsOverride', { insets });
    for (const id of ['elise', 'clairdelune']) {
      await pick(id, 'both', true); await page.locator('#lhand').scrollIntoViewIfNeeded(); await bounded('#lhand', insets, true);
      const visible = await visibleScoreAndKeys(insets); await scoreDetails(true); await page.locator('#lhand').scrollIntoViewIfNeeded();
      await page.locator('#lspeed').selectOption('0.25'); await activate('#ldemo', true); await page.waitForFunction(() => __learn.demoActive.size > 0);
      await page.screenshot({ path: `${output}/${width}x${height}-${id}-both.png` }); await activate('#ldemo', true);
      assert.equal(await page.locator('#kb .k.down').count(), 0); results.push({ viewport: { width, height }, insets, id, ...visible });
      if (id === 'clairdelune') results.push({ viewport: { width, height }, keyboardZoom: await keyboardZoom(true, insets, `${width}x${height}-${id}`) });
    }
    await touch.detach(); await context.close();
  }
  assert.deepEqual(errors, []); await writeFile(`${output}/report.json`, JSON.stringify({ passed: true, results, catalog, errors, sampleWarnings }, null, 2));
  console.log(JSON.stringify({ passed: true, results, screenshots: output }, null, 2));
} catch (error) {
  if (page && !page.isClosed()) { await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {}); console.error('State', await page.evaluate(() => ({ song: __learn?.song?.id, hand: __learn?.hand, state: __learn?.state, pos: __learn?.pos, keyboard: __piano?.keyboard })).catch(() => null)); }
  console.error('Browser errors', errors); console.error('Sample warnings', sampleWarnings); throw error;
} finally { await browser?.close(); server?.kill(); }
