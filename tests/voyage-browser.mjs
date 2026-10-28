import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { CHAPTERS, MISSIONS, freshProgress } from '../voyage/progress.js';

const base = process.env.GAMES_TEST_URL || 'http://127.0.0.1:5217';
const errors = [];
let server, browser;
const specs = [
  { width: 320, height: 568, insets: { top: 47, bottom: 34 } },
  { width: 568, height: 320, insets: { left: 47, right: 47, bottom: 21 } },
  { width: 390, height: 844, insets: { top: 47, bottom: 34 } },
];
async function ready(page) {
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && window.__voyage, null, { timeout: 30000 });
  await page.evaluate(() => { __voyage.setRealtime(false); return document.fonts.ready; });
}
function watch(page, label) {
  page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`${label}: ${message.text()}`); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${label}: ${response.status()} ${response.url()}`); });
}
async function touch(cdp, type, point) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [{ ...point, id: 1 }] : [] });
  await new Promise(resolve => setTimeout(resolve, 30));
}
async function worldTouch(page, cdp, type, x, z) {
  const point = type === 'touchEnd' || type === 'touchCancel' ? null : await page.evaluate(({ x, z }) => __voyage.controller.project(x, z), { x, z });
  await touch(cdp, type, point);
}
async function worldTap(page, cdp, x, z) { await worldTouch(page, cdp, 'touchStart', x, z); await worldTouch(page, cdp, 'touchEnd'); }
async function open(page, id) {
  const chapter = CHAPTERS.findIndex(chapter => chapter.missions.includes(id));
  await page.locator(`[data-chapter="${chapter}"]`).tap();
  await page.locator(`[data-mission="${id}"]`).tap();
  assert.ok(await page.locator('.gesture-tag').isVisible(), `${id}: one-gesture teaching card`);
  const button = page.locator('[data-action=continueMission],[data-action=startMission]');
  await button.tap();
  try { await page.waitForFunction(id => __voyage.phase === 'playing' && __voyage.currentId === id, id, { timeout: 10000 }); }
  catch (error) { throw new Error(`${id}: could not start ${JSON.stringify(await page.evaluate(() => ({ phase: __voyage.phase, id: __voyage.currentId, panel: document.querySelector('#panel').dataset.kind, text: document.querySelector('#panelTitle')?.textContent })))}`, { cause: error }); }
}
async function assertPlayLayout(page, spec, id) {
  const data = await page.evaluate(() => {
    const targets = [...document.querySelectorAll('.topbar a,.topbar button,.mission-controls button')].filter(e => e.getClientRects().length).map(e => {
      const r = e.getBoundingClientRect(); return { name: e.id || e.className, x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    });
    const title = document.querySelector('#missionTitle'), score = document.querySelector('#missionScore'), stage = document.querySelector('#stage').getBoundingClientRect(), canvas = __voyage.controller.renderer.domElement;
    return { targets, title: [title.scrollWidth, title.clientWidth, title.textContent], score: [score.scrollWidth, score.clientWidth, score.textContent],
      stage: { width: stage.width, height: stage.height }, canvases: document.querySelectorAll('canvas').length,
      pixels: canvas.width * canvas.height, horizontal: document.documentElement.scrollWidth <= innerWidth + 1 };
  });
  for (const target of data.targets) {
    assert.ok(target.width >= 43.5 && target.height >= 43.5, `${id}: target too small ${JSON.stringify(target)}`);
    assert.ok(target.x >= (spec.insets.left || 0) - 1 && target.right <= spec.width - (spec.insets.right || 0) + 1, `${id}: side safe area ${JSON.stringify(target)}`);
    assert.ok(target.y >= (spec.insets.top || 0) - 1 && target.bottom <= spec.height - (spec.insets.bottom || 0) + 1, `${id}: vertical safe area ${JSON.stringify(target)}`);
  }
  assert.ok(data.stage.height > 100 && data.stage.width > 120, `${id}: playable board ${JSON.stringify(data.stage)}`);
  assert.ok(data.title[0] <= data.title[1] + 1, `${id}: title overflow ${data.title}`);
  assert.ok(data.score[0] <= data.score[1] + 1, `${id}: score overflow ${data.score}`);
  assert.equal(data.canvases, 1, `${id}: only one active graphics canvas`);
  assert.ok(data.pixels <= 421000 && data.horizontal, `${id}: mobile render/layout budget`);
}

try {
  if (!process.env.GAMES_TEST_URL) {
    server = spawn(process.execPath, ['scripts/serve.mjs', '--port', '5217'], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', code => reject(Error(`Server exited ${code}`))); });
  }
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  await mkdir('test-results/voyage', { recursive: true });
  for (const spec of specs.filter(s => !process.env.VOYAGE_PHONE || process.env.VOYAGE_PHONE === `${s.width}x${s.height}`)) {
    const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await context.newPage(), cdp = await context.newCDPSession(page); watch(page, `${spec.width}×${spec.height}`);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: spec.insets });
    await page.goto(`${base}/wonderwake.html?debug=1`); await ready(page);
    // Layout/lifecycle coverage visits every chapter; progression is separately
    // earned from an empty save with physical gameplay below.
    await page.evaluate(data => { Object.assign(__voyage.progress, data); __voyage.checkpoint(); }, { ...freshProgress(), completed: MISSIONS.map(m => m.id) });
    await page.reload(); await ready(page);
    for (const mission of MISSIONS) {
      await open(page, mission.id); await assertPlayLayout(page, spec, mission.id);
      const r = await page.locator('#stage').boundingBox(), p = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      await touch(cdp, 'touchStart', p); await touch(cdp, 'touchMove', { x: p.x + 12, y: p.y + 16 }); await touch(cdp, 'touchCancel');
      assert.equal(await page.evaluate(() => __voyage.pointer), null, `${mission.id}: canceled finger released`);
      await page.evaluate(() => __voyage.advance(.12));
      await page.locator('#pauseButton').tap();
      assert.equal(await page.evaluate(() => __voyage.phase), 'paused');
      const saved = await page.evaluate(() => __voyage.controller.snapshot());
      await page.waitForTimeout(150); const frames = await page.evaluate(() => __voyage.renderCount);
      await page.waitForTimeout(100); assert.equal(await page.evaluate(() => __voyage.renderCount), frames, `${mission.id}: paused renderer sleeps`);
      await page.reload(); await ready(page);
      await open(page, mission.id);
      assert.deepEqual(await page.evaluate(() => __voyage.controller.snapshot()), saved, `${mission.id}: exact checkpoint survives full reload`);
      await page.locator('#mapButton').tap();
      assert.equal(await page.evaluate(() => __voyage.phase), 'map');
      assert.equal(await page.locator('canvas').count(), 1, `${mission.id}: returning to map disposes old renderer`);
    }
    await page.screenshot({ path: `test-results/voyage/map-${spec.width}x${spec.height}.png`, fullPage: true });
    console.log(`All 25 missions: UI start, touch cancellation, pause, exact reload, map return, target/readability checks passed at ${spec.width}×${spec.height}.`);
    await context.close();
  }

  // First beacon is earned from nothing: tilt physics, musical memory, and a
  // matching puzzle. No mission result, score, or unlocked flag is injected.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await context.newPage(), cdp = await context.newCDPSession(page); watch(page, 'legal campaign');
  await page.goto(`${base}/wonderwake.html?debug=1`); await ready(page);
  assert.ok(await page.locator('[data-chapter="1"]').isDisabled());
  for (const id of ['dewfall', 'bellwood-beats', 'dream-duos']) {
    await open(page, id);
    if (id === 'dewfall') {
      const r = await page.locator('#stage').boundingBox(), point = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      await touch(cdp, 'touchStart', point); await touch(cdp, 'touchMove', { x: point.x, y: point.y - 44 });
      await page.evaluate(() => __voyage.advance(3)); await touch(cdp, 'touchEnd');
    } else if (id === 'bellwood-beats') {
      for (const song of [[0, 1, 2], [2, 0, 1, 2], [1, 2, 0, 2, 1]]) {
        await worldTap(page, cdp, 0, 0); await page.evaluate(() => __voyage.advance(4));
        for (const note of song) await worldTap(page, cdp, [-3, 0, 3][note], 0);
      }
    } else {
      const known = new Map(); let attempts = 0;
      while (await page.evaluate(() => __voyage.phase === 'playing') && attempts++ < 50) {
        const state = await page.evaluate(() => ({ matched: __voyage.controller.engine.state.matched, length: __voyage.controller.engine.state.deck.length }));
        const available = Array.from({ length: state.length }, (_, i) => i).filter(i => !state.matched.includes(i));
        let first = -1, second = -1;
        for (const i of available) if (known.has(i)) { const j = available.find(j => j !== i && known.get(j) === known.get(i)); if (j !== undefined) { first = i; second = j; break; } }
        if (first < 0) { first = available.find(i => !known.has(i)) ?? available[0]; second = available.find(i => i !== first && !known.has(i)) ?? available.find(i => i !== first); }
        for (const index of [first, second]) {
          const rows = Math.ceil(state.length / 4), x = (index % 4 - 1.5) * 2.05, z = (Math.floor(index / 4) - (rows - 1) / 2) * 2.05 + .3;
          await worldTap(page, cdp, x, z);
          known.set(index, await page.evaluate(index => __voyage.controller.engine.state.deck[index], index));
        }
        await page.evaluate(() => __voyage.advance(.9));
      }
      assert.ok(attempts < 50);
    }
    assert.equal(await page.evaluate(() => __voyage.phase), 'won', `${id}: physical gameplay wins and final touch does not dismiss dialog`);
    assert.equal(await page.evaluate(id => __voyage.progress.plays[id], id), 1);
    await page.evaluate(() => { __voyage.changed(); __voyage.changed(); });
    assert.equal(await page.evaluate(id => __voyage.progress.plays[id], id), 1, 'UI refresh does not duplicate completion');
    // Keyboard activation remains usable during the final-touch click guard.
    await page.locator('[data-action=map]').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => __voyage.phase), 'map');
  }
  assert.equal(await page.locator('#crewCount').textContent(), '3 / 25');
  assert.equal(await page.locator('#beaconCount').textContent(), '1 / 5 BEACONS');
  assert.ok(await page.locator('[data-chapter="1"]').isEnabled());
  assert.ok(await page.locator('#mainAction button').textContent().then(t => t.includes('Parcel Harbor')));
  await page.reload(); await ready(page);
  assert.equal(await page.locator('#crewCount').textContent(), '3 / 25');
  assert.deepEqual(await page.evaluate(() => __voyage.progress.plays), { dewfall: 1, 'bellwood-beats': 1, 'dream-duos': 1 });
  console.log('First beacon earned by three real touch wins; crew, unlocked island, and single win records survive reload.');

  // Rotation/blur/context loss cancel the held gesture and preserve the island.
  for (const id of ['dewfall', 'moss-flip']) {
    await open(page, id);
    let r = await page.locator('#stage').boundingBox();
    await touch(cdp, 'touchStart', { x: r.x + r.width / 2, y: r.y + r.height / 2 });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForFunction(() => __voyage.pointer === null); await touch(cdp, 'touchCancel');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal(await page.evaluate(() => __voyage.phase), 'paused');
    await page.locator('[data-action=resume]').tap();
    await page.evaluate(() => { const extension = __voyage.controller.renderer.getContext().getExtension('WEBGL_lose_context'); window.restoreVoyage = () => extension.restoreContext(); extension.loseContext(); });
    await page.waitForFunction(() => document.querySelector('#panel').dataset.kind === 'restoring');
    await page.waitForTimeout(150); await page.evaluate(() => restoreVoyage());
    await page.waitForFunction(() => document.querySelector('#panel').dataset.kind === 'pause');
    await page.locator('[data-action=resume]').tap(); assert.equal(await page.evaluate(() => __voyage.phase), 'playing');
    await page.locator('#mapButton').tap();
  }
  await open(page, 'moss-flip');
  await worldTap(page, cdp, 0, 0); await page.evaluate(() => __voyage.advance(.45));
  await page.locator('#pauseButton').tap();
  const forestCheckpoint = await page.evaluate(() => __voyage.controller.snapshot());
  await page.locator('[data-action=map]').tap();
  await open(page, 'burrow-banquet');
  await worldTap(page, cdp, 0, 0); await page.locator('#pauseButton').tap();
  const picnicCheckpoint = await page.evaluate(() => __voyage.controller.snapshot());
  await page.locator('[data-action=map]').tap();
  await open(page, 'moss-flip');
  assert.deepEqual(await page.evaluate(() => __voyage.controller.snapshot()), forestCheckpoint, 'switching friends keeps the first exact unfinished challenge');
  await page.locator('#mapButton').tap(); await open(page, 'burrow-banquet');
  assert.deepEqual(await page.evaluate(() => __voyage.controller.snapshot()), picnicCheckpoint, 'switching back keeps the second unfinished challenge too');
  assert.equal(await page.evaluate(() => __voyage.progress.completed.length), 3, 'switching friends preserves the earned crew');
  await context.close();
  console.log('Graphics recovery, rotation during input, background pausing, and independently resumed challenges passed.');

  // The two endings are UI/state tests: only their prerequisites are fixtures.
  // Every celebration action is a real click, and reload cannot award wins.
  for (const total of [15, 25]) {
    const endingContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
    const endingPage = await endingContext.newPage(); watch(endingPage, `ending ${total}`);
    await endingPage.goto(`${base}/wonderwake.html?debug=1`); await ready(endingPage);
    const completed = total === 25 ? MISSIONS.map(m => m.id) : CHAPTERS.flatMap(chapter => chapter.missions.slice(0, 3));
    await endingPage.evaluate(data => { Object.assign(__voyage.progress, data); __voyage.checkpoint(); __voyage.showMap(); }, { ...freshProgress(), completed });
    await endingPage.locator('#mainAction button').tap();
    assert.equal(await endingPage.locator('#panel').getAttribute('data-kind'), 'festival');
    await endingPage.locator('[data-action=lightSky]').tap();
    await endingPage.waitForFunction(() => document.querySelector('#panel').dataset.kind === 'ending' && !document.querySelector('#modal').hidden);
    assert.ok(await endingPage.locator('#panelTitle').textContent().then(t => t.includes('Wonderwake is awake')));
    await endingPage.screenshot({ path: `test-results/voyage/ending-${total}.png` });
    assert.deepEqual(await endingPage.evaluate(() => ({ count: __voyage.progress.completed.length, festival: __voyage.progress.festivalSeen, full: __voyage.progress.fullCrewSeen, active: __voyage.progress.active, checkpoints: __voyage.progress.checkpoints, plays: __voyage.progress.plays })), { count: total, festival: true, full: total === 25, active: null, checkpoints: {}, plays: {} });
    await endingPage.locator('[data-action=endingBack]').tap();
    await endingPage.reload(); await ready(endingPage);
    assert.deepEqual(await endingPage.evaluate(() => ({ count: __voyage.progress.completed.length, festival: __voyage.progress.festivalSeen, full: __voyage.progress.fullCrewSeen, plays: __voyage.progress.plays })), { count: total, festival: true, full: total === 25, plays: {} });
    await endingPage.locator('#crewButton').tap(); assert.equal(await endingPage.locator('.crew-tile').count(), total);
    await endingContext.close();
    console.log(`${total}-friend ending: festival controls, celebration, crew gallery, and saved ending passed without duplicate rewards.`);
  }
  assert.deepEqual(errors, []);
} finally { await browser?.close(); server?.kill(); }
