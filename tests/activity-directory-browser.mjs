// Real desktop/touch play through the survival host. The profile begins with
// four restored relay outposts; Prism's fifth restoration is earned with taps.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';

const port = 5362, base = process.env.GAMES_TEST_URL || `http://127.0.0.1:${port}`;
const output = 'test-results/activity-directory', errors = [];
const specs = [{ name: 'desktop', width: 1280, height: 800, touch: false }, { name: 'phone', width: 390, height: 844, touch: true }];
let server, browser, currentPage;
const press = (locator, spec) => spec.touch ? locator.tap() : locator.click();
const paint = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const survival = page => page.evaluate(() => ({ position: [...__game.pos], hp: __game.hp, time: __game.time, wave: __game.wave }));
async function start(page, spec) {
  await page.goto(`${base}/soldier.html?debug=1&q=low`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && window.__game?.activities?.host, null, { timeout: 90000 });
  await press(page.locator('#startBtn'), spec);
  await page.waitForFunction(() => __game.mode === 'intro' || __game.mode === 'play');
  if (await page.evaluate(() => __game.mode === 'intro')) { if (spec.touch) await page.locator('#skipBtn').tap(); else await page.keyboard.press('Space'); }
  await page.waitForFunction(() => __game.mode === 'play' && !__game.paused);
}
async function brief(page, spec) {
  await page.evaluate(() => { const s = __game.activities.world.stations.find(s => s.id === 'prism'); __game.setPos(s.x, s.z); });
  await page.waitForFunction(() => !document.querySelector('#activityInteract').hidden && document.querySelector('#activityInteract').textContent.includes('Prism'));
  if (spec.touch) await page.locator('#activityInteract').tap(); else await page.keyboard.press('KeyE');
  await page.waitForFunction(() => __game.activities.host.phase === 'brief');
}
async function launch(page, spec, selector = '#activityBegin') {
  await press(page.locator(selector), spec);
  await page.waitForFunction(() => __game.activities.host.phase === 'playing', null, { timeout: 60000 });
  await paint(page);
}
async function tapPiece(page, spec, index) {
  const point = await page.evaluate(index => { const c = __game.activities.host.controller, p = c.engine.level.pieces[index]; return c.project(p.x, p.z); }, index);
  if (spec.touch) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
  await paint(page);
}
async function solve(page, spec) {
  const targets = await page.evaluate(() => { const e = __game.activities.host.controller.engine; return e.level.pieces.flatMap((p, i) => p.solution !== undefined && p.solution !== e.state.orientations[i] ? [i] : []); });
  for (const index of targets) await tapPiece(page, spec, index);
  await page.waitForFunction(() => __game.activities.host.phase === 'won');
}
async function leave(page, spec) {
  await press(page.locator('#activityLeave'), spec);
  await page.waitForFunction(() => !__game.activities.host.active);
  assert.equal(await page.evaluate(() => __game.paused), false, 'return does not click through to pause');
}
async function journal(page, spec) {
  if (spec.touch) await page.locator('#expeditionJournal').tap(); else await page.keyboard.press('Tab');
  await page.waitForFunction(() => __game.activities.host.phase === 'journal');
}

try {
  if (!process.env.GAMES_TEST_URL) {
    server = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('Server failed to start')), 10000); server.stdout.once('data', () => { clearTimeout(timer); resolve(); }); server.once('error', reject); server.once('exit', code => reject(Error(`Server exited ${code}`))); });
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  await mkdir(output, { recursive: true });
  for (const spec of specs) {
    const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, hasTouch: spec.touch, isMobile: spec.touch });
    await context.addInitScript(() => {
      const key = 'games:zombie:expedition:v1';
      if (!localStorage.getItem(key)) {
        const completed = ['garden', 'borrowed', 'lantern', 'upside'];
        localStorage.setItem(key, JSON.stringify({ version: 1, completed, levels: Object.fromEntries(completed.map(id => [id, 1])), stages: Object.fromEntries(completed.map(id => [id, [1]])), checkpoints: {}, plays: {}, districtMilestones: [], target: 'dewfall' }));
      }
    });
    const page = await context.newPage(); currentPage = page; page.setDefaultTimeout(20000);
    page.on('pageerror', error => errors.push(`${spec.name}: ${error.stack || error.message}`));
    page.on('console', event => { if (event.type() === 'error') errors.push(`${spec.name}: ${event.text()}`); });
    page.on('response', response => { if (response.status() >= 400) errors.push(`${spec.name}: ${response.status()} ${response.url()}`); });
    await start(page, spec); console.log(`${spec.name}: started.`);

    await journal(page, spec); const frozen = await survival(page);
    assert.equal(await page.locator('.expedition-entry').count(), 30);
    assert.match(await page.locator('[data-district="relay"]').textContent(), /4\/5/);
    assert.equal(await page.evaluate(() => __game.activities.progress.target), 'dewfall');
    const search = page.locator('#expeditionSearch'); await search.fill('solar relay');
    assert.equal(await page.locator('.expedition-entry').count(), 1);
    assert.equal(await page.locator('.expedition-entry').getAttribute('data-activity'), 'prism');
    assert.equal(await search.evaluate(el => el === document.activeElement), true);
    await page.keyboard.type(' mqzx'); assert.equal(await page.evaluate(() => __game.activities.host.phase), 'journal');
    assert.equal(await page.locator('.expedition-entry').count(), 0);
    await press(page.locator('#expeditionResetFilters'), spec);
    assert.equal(await search.inputValue(), ''); assert.equal(await page.locator('.expedition-entry').count(), 30);
    await page.locator('#expeditionStatus').selectOption('restored');
    assert.equal(await page.locator('.expedition-entry').count(), 4);
    await press(page.locator('[data-district="harbor"]'), spec);
    assert.match(await page.locator('#expeditionResultCount').textContent(), /^0 of 30/);
    await press(page.locator('#expeditionResetFilters'), spec);
    await page.locator('#expeditionSort').selectOption('catalog');
    assert.equal(await page.locator('.expedition-entry').first().getAttribute('data-activity'), 'dewfall');
    assert.deepEqual(await survival(page), frozen, 'typing, filtering and sorting preserve the frozen world');
    await search.fill('prism'); await search.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/${spec.name}-journal.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await press(page.locator('.expedition-entry'), spec);
    assert.equal(await page.evaluate(() => __game.activities.host.controller), null, 'directory sets a route without launching remotely');
    assert.equal(await page.evaluate(() => __game.activities.progress.target), 'prism');
    console.log(`${spec.name}: search, combined filters, order, reset and waypoint-only routing passed.`);

    await brief(page, spec); await page.getByRole('combobox', { name: 'Activity stage' }).selectOption('8');
    await launch(page, spec); const beforeWin = await survival(page); await solve(page, spec);
    assert.deepEqual(await page.evaluate(() => __game.activities.progress.stages.prism), [8]);
    assert.equal(await page.evaluate(() => __game.activities.progress.levels.prism), 8);
    assert.equal(await page.evaluate(() => __game.activities.progress.target), 'prism', 'a win preserves the manually chosen waypoint');
    assert.match(await page.locator('#activityDistrictMilestone').textContent(), /Relay Command restored.*All 5 outposts/);
    assert.deepEqual(await page.evaluate(() => __game.activities.progress.districtMilestones), ['relay']);
    const afterWin = await survival(page); assert.equal(afterWin.time, beforeWin.time); assert.equal(afterWin.wave, beforeWin.wave); assert.deepEqual(afterWin.position, beforeWin.position);
    await page.screenshot({ path: `${output}/${spec.name}-district-restored.png`, fullPage: true });
    await press(page.getByRole('button', { name: 'Next stage', exact: true }), spec);
    await page.waitForFunction(() => __game.activities.host.phase === 'playing'); await paint(page);
    assert.equal(await page.evaluate(() => __game.activities.host.level), 1, 'a stage-eight win recommends the first gap');
    await solve(page, spec); assert.equal(await page.locator('#activityDistrictMilestone').count(), 0, 'restored district is not celebrated twice');
    assert.deepEqual(await page.evaluate(() => __game.activities.progress.stages.prism), [1, 8]);
    await leave(page, spec);

    await brief(page, spec); assert.equal(await page.getByRole('combobox', { name: 'Activity stage' }).inputValue(), '2');
    const choices = await page.getByRole('combobox', { name: 'Activity stage' }).locator('option').allTextContents();
    assert.match(choices[0], /completed/); assert.match(choices[1], /next unfinished/); assert.doesNotMatch(choices[2], /completed/); assert.match(choices[7], /completed/);
    await page.getByRole('combobox', { name: 'Activity stage' }).selectOption('4'); await launch(page, spec);
    const index = await page.evaluate(() => __game.activities.host.controller.engine.level.pieces.findIndex(p => p.solution !== undefined && p.initial === p.solution));
    await tapPiece(page, spec, index);
    const changed = await page.evaluate(() => ({ moves: __game.activities.host.controller.engine.state.moves, orientations: [...__game.activities.host.controller.engine.state.orientations] }));
    assert.equal(changed.moves, 1); assert.equal(await page.evaluate(() => __game.activities.host.phase), 'playing'); await leave(page, spec); await brief(page, spec);
    assert.equal(await page.getByRole('combobox', { name: 'Activity stage' }).inputValue(), '4');
    assert.equal(await page.locator('#activityBegin').textContent(), 'Continue activity');
    assert.match(await page.locator('#activityCheckpointPreview').textContent(), /Stage 4 · Saved just now/);
    assert.equal(await page.locator('#activityStartFresh').isVisible(), true); await launch(page, spec);
    assert.deepEqual(await page.evaluate(() => ({ moves: __game.activities.host.controller.engine.state.moves, orientations: [...__game.activities.host.controller.engine.state.orientations] })), changed, 'Continue resumes the actual interrupted puzzle');
    await leave(page, spec); await brief(page, spec);
    await page.screenshot({ path: `${output}/${spec.name}-checkpoint.png`, fullPage: true });
    await launch(page, spec, '#activityStartFresh');
    assert.equal(await page.evaluate(() => __game.activities.host.controller.engine.state.moves), 0, 'Start fresh replaces the old attempt');
    await leave(page, spec);
    console.log(`${spec.name}: exact stage wins, district milestone, next gap, Continue and Start fresh passed.`);

    await journal(page, spec); await press(page.locator('#expeditionClearTarget'), spec);
    assert.equal(await page.evaluate(() => __game.activities.progress.target), null);
    assert.equal(await page.evaluate(() => __game.activities.progress.targetCleared), true);
    await leave(page, spec); await page.reload();
    await page.waitForFunction(() => document.body.dataset.ready === 'true' && window.__game?.activities?.host, null, { timeout: 90000 });
    assert.equal(await page.evaluate(() => __game.activities.progress.target), null, 'explicit cleared waypoint survives reload');
    assert.deepEqual(await page.evaluate(() => __game.activities.progress.stages.prism), [1, 8]);
    assert.deepEqual(await page.evaluate(() => __game.activities.progress.districtMilestones), ['relay']);
    await context.close();
  }
  assert.deepEqual(errors, [], 'no JavaScript, console or asset errors');
  console.log('Outpost directory: desktop and touch searches, combined filters, saved puzzles, real wins, conservative stages and persistent routes passed.');
} catch (error) {
  if (currentPage && !currentPage.isClosed()) {
    await currentPage.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
    console.error('State:', await currentPage.evaluate(() => ({ phase: window.__game?.activities?.host.phase, mode: window.__game?.mode, activity: window.__game?.activities?.host.current?.id, level: window.__game?.activities?.host.level })).catch(() => null));
  }
  console.error('Browser errors:', errors); throw error;
} finally { await browser?.close(); server?.kill(); }
