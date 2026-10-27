// Real-browser checks. Every campaign win uses only legal shared tilt vectors.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const port = 5197, baseURL = process.env.GAMES_TEST_URL || `http://127.0.0.1:${port}`;
const server = process.env.GAMES_TEST_URL ? null : spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
const errors = [], external = [], reports = []; let browser;
const pilotSource = (await readFile(new URL('./dewfall-strategy.mjs', import.meta.url), 'utf8')).replace(/^import .*;$/m, '').replace(/^export /gm, '');
async function ready(page) { await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 }); await page.evaluate(() => document.fonts.ready); }
function monitor(page, label = '') {
  page.on('pageerror', error => errors.push(`${label}${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`${label}${message.text()}`); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${label}${response.status()} ${response.url()}`); });
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(baseURL)) external.push(request.url()); });
}
async function solve(page) { return page.evaluate(async source => { const { LEVELS, BOARD_RADIUS } = await import('./dewfall-game.js'), playGarden = new Function('LEVELS', 'BOARD_RADIUS', source + ';return playGarden')(LEVELS, BOARD_RADIUS), api = window.__dewfall; api.setRealtime(false); playGarden(api.game); api.refresh(); return { level: api.game.state.level, mode: api.game.state.mode, stars: api.game.state.stars, spills: api.game.state.spills, ticks: api.game.state.ticks }; }, pilotSource); }
async function lose(page) {
  await page.evaluate(() => { const ext = window.__dewfall.view.renderer.getContext().getExtension('WEBGL_lose_context'); window.__restoreDew = () => ext.restoreContext(); ext.loseContext(); });
  await page.waitForFunction(() => document.getElementById('gamePanel').dataset.kind === 'restoring');
  assert.ok(await page.locator('[data-action=waiting]').isDisabled()); assert.ok(await page.evaluate(() => document.querySelector('.game-app').inert));
  await page.waitForTimeout(150); await page.evaluate(() => window.__restoreDew()); await page.waitForFunction(() => document.getElementById('gamePanel').dataset.kind !== 'restoring');
}
async function touchStart(cdp, point) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] }); await new Promise(resolve => setTimeout(resolve, 45)); }
async function touchMove(cdp, point) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, id: 1 }] }); await new Promise(resolve => setTimeout(resolve, 60)); }
async function touchEnd(cdp, cancel = false) { await new Promise(resolve => setTimeout(resolve, 160)); await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] }); await new Promise(resolve => setTimeout(resolve, 45)); }
try {
  if (server) await new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error('Dewfall server did not start')), 10000); server.stdout.once('data', () => { clearTimeout(timeout); resolve(); }); server.once('error', reject); server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}`)); }); });
  await mkdir('test-results/dewfall', { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--enable-unsafe-swiftshader'] });
  if (process.argv.includes('--capture-art')) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 850 }, deviceScaleFactor: 1 }); monitor(page);
    await page.goto(`${baseURL}/dewfall.html?debug=1`); await ready(page);
    const state = await page.evaluate(async source => {
      const { LEVELS, BOARD_RADIUS } = await import('./dewfall-game.js'), createGardenPilot = new Function('LEVELS', 'BOARD_RADIUS', source + ';return createGardenPilot')(LEVELS, BOARD_RADIUS), api = window.__dewfall; api.setRealtime(false); api.start(4); const pilot = createGardenPilot(); api.game.beginTilt();
      for (let i = 0; i < 1800 && api.game.state.bloomed < 2; i++) api.game.advance(1 / 60, pilot(api.game.state));
      api.game.endTilt(); api.refresh(); return { bloomed: api.game.state.bloomed, mode: api.game.state.mode };
    }, pilotSource);
    assert.ok(state.bloomed >= 2 && state.mode === 'playing', 'art is a real partially bloomed garden');
    await page.addStyleTag({ content: '.topbar,.hud,.play-controls,.save-note,.toast,.tilt-gesture,.stage-caption{display:none!important}.game-app,.game-main{height:625px;flex:none}.stage{height:625px;flex:none;width:1000px}' });
    await page.waitForTimeout(200);
    const png = await page.locator('#gameStage').screenshot({ path: 'test-results/dewfall/preview.png' });
    const images = await page.evaluate(async base64 => { const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode(); return [480, 960].map(width => { const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = Math.round(width / 1.6); canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); return { width, data: canvas.toDataURL('image/webp', .86).split(',')[1] }; }); }, png.toString('base64'));
    for (const { width, data } of images) await writeFile(`assets/dewfall-preview-${width}.webp`, Buffer.from(data, 'base64'));
    await page.close(); console.log('Captured actual Dewdrop Drift gameplay for both hub previews.');
  } else {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }); let page = await context.newPage(); monitor(page, 'desktop: ');
    await page.goto(`${baseURL}/dewfall.html?debug=1`); await ready(page);
    assert.ok(await page.evaluate(() => document.querySelector('.game-app').inert));
    await page.locator('[data-action=help]').click(); assert.ok((await page.locator('#gamePanel').textContent()).includes('Drag anywhere'));
    await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'helpBack'); await page.keyboard.press('Enter');
    await page.locator('[data-action=start]').click(); await page.evaluate(() => window.__dewfall.setRealtime(false));
    await page.locator('#helpButton').focus(); await page.keyboard.press('Enter'); assert.ok(await page.locator('[data-action=helpBack]').isVisible());
    await page.locator('[data-action=helpBack]').click(); await page.locator('[data-action=resume]').click();
    await page.locator('#pauseButton').focus(); await page.keyboard.press('Space'); assert.equal(await page.evaluate(() => window.__dewfall.game.state.mode), 'paused');
    await page.locator('[data-action=resume]').click(); await page.keyboard.down('ArrowUp'); await page.evaluate(() => window.__dewfall.advance(.4)); await page.keyboard.up('ArrowUp');
    const tilted = await page.evaluate(() => window.__dewfall.game.snapshot()); assert.ok(tilted.balls[0].z < 2.4 && tilted.balls.every(b => b.vz < 0), 'arrows roll every drop together'); assert.equal(tilted.dragging, false);
    const g = await page.locator('#gameStage').boundingBox(); await page.mouse.move(g.x + g.width / 2, g.y + g.height * .7); await page.mouse.down(); await page.mouse.move(g.x + g.width / 2 + 44, g.y + g.height * .7);
    await page.evaluate(() => window.__dewfall.advance(.25)); await page.mouse.up();
    assert.ok(await page.evaluate(() => window.__dewfall.game.state.balls.some(b => b.vx > .5)), 'real mouse drag tilts the garden');
    await page.locator('#pauseButton').click(); await page.waitForTimeout(100);
    const frozen = await page.evaluate(() => ({ ticks: window.__dewfall.game.state.ticks, frames: window.__dewfall.renderCount })); await page.waitForTimeout(240);
    assert.deepEqual(await page.evaluate(() => ({ ticks: window.__dewfall.game.state.ticks, frames: window.__dewfall.renderCount })), frozen, 'pause stops physics and GPU');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('games:save:dewfall')).data);
    const sentinels = await page.evaluate(() => { const names = ['soldier', 'garden', 'borrowed', 'moonbounce', 'popwake', 'pondpost', 'prism', 'ribbon']; for (const name of names) localStorage.setItem(`games:save:${name}`, `sentinel-${name}`); return Object.fromEntries(names.map(n => [n, localStorage.getItem(`games:save:${n}`)])); });
    await page.close(); page = await context.newPage(); monitor(page, 'reopened: '); await page.goto(`${baseURL}/dewfall.html?debug=1`); await ready(page);
    await page.evaluate(() => window.__dewfall.setRealtime(false)); await page.locator('[data-action=continue]').click(); const resumed = await page.evaluate(() => window.__dewfall.game.snapshot());
    assert.deepEqual({ ...resumed, mode: 'paused' }, saved, 'reopening restores every position, velocity, flower and counter exactly');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); delete document.hidden; });
    assert.equal(await page.evaluate(() => window.__dewfall.game.state.mode), 'paused'); await page.locator('[data-action=resume]').click(); await lose(page); assert.ok(await page.locator('[data-action=resume]').isEnabled()); await page.locator('[data-action=resume]').click();
    await page.evaluate(() => window.__dewfall.start(1));
    for (let level = 1; level <= 6; level++) { const result = await solve(page); reports.push(result); assert.equal(result.level, level); assert.equal(result.mode, 'won'); assert.equal(result.stars, 3); if (level < 6) await page.locator('[data-action=next]').click(); }
    assert.deepEqual(await page.evaluate(() => window.__dewfall.profile.stars), Array(6).fill(3));
    await lose(page); assert.equal(await page.evaluate(() => window.__dewfall.game.state.mode), 'won');
    await page.locator('[data-action=replay]').click(); assert.equal(await page.evaluate(() => window.__dewfall.game.state.mode), 'playing'); await page.locator('#pauseButton').click(); await page.locator('[data-action=levels]').click();
    assert.equal(await page.locator('.level-choice:disabled').count(), 0); await page.locator('[data-level="4"]').click(); assert.equal(await page.evaluate(() => window.__dewfall.game.state.level), 4);
    const resources = await page.evaluate(() => { const { game, view } = window.__dewfall, state = structuredClone(game.state); state.effects = Array.from({ length: 64 }, (_, i) => ({ id: i, type: 'bloom', x: Math.sin(i) * 4, z: Math.cos(i) * 4, age: .25, duration: 1.15 })); view.render(state, 1); const memory = JSON.stringify(view.renderer.info.memory); for (let i = 0; i < 20; i++) view.render(state, i / 30); return { calls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles, stable: memory === JSON.stringify(view.renderer.info.memory) }; });
    assert.ok(resources.stable && resources.calls <= 80); reports.push({ resources });
    await page.goto(`${baseURL}/`); await page.waitForFunction(() => document.querySelector('.dewfall-card [data-play-label]')?.textContent === 'CONTINUE RUN'); await page.locator('.dewfall-card').click(); await ready(page); assert.ok(await page.locator('#modalLayer').isHidden());
    assert.deepEqual(await page.evaluate(names => Object.fromEntries(names.map(n => [n, localStorage.getItem(`games:save:${n}`)])), Object.keys(sentinels)), sentinels);
    await context.close();

    for (const mode of ['ready', 'paused']) {
      const context = await browser.newContext(), page = await context.newPage(); monitor(page, `${mode}: `); await page.goto(`${baseURL}/dewfall.html?debug=1`); await ready(page);
      if (mode === 'paused') { await page.locator('[data-action=start]').click(); await page.locator('#pauseButton').click(); }
      const before = await page.evaluate(() => window.__dewfall.game.snapshot()); await lose(page); assert.deepEqual(await page.evaluate(() => window.__dewfall.game.snapshot()), before);
      assert.ok(await page.locator(mode === 'ready' ? '[data-action=start]' : '[data-action=resume]').isEnabled()); await context.close();
    }
    const phones = [{ width: 320, height: 568, dpr: 2 }, { width: 360, height: 640, dpr: 2 }, { width: 390, height: 844, dpr: 3, insets: { top: 47, bottom: 34 } }, { width: 430, height: 932, dpr: 3 }, { width: 667, height: 375, dpr: 2 }, { width: 844, height: 390, dpr: 3, insets: { left: 47, right: 47, bottom: 21 } }, { width: 932, height: 430, dpr: 3 }];
    for (const spec of phones) {
      const label = `${spec.width}x${spec.height}`, context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, deviceScaleFactor: spec.dpr, isMobile: true, hasTouch: true });
      const page = await context.newPage(); monitor(page, `${label}: `); const cdp = await context.newCDPSession(page);
      if (spec.insets) await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: spec.insets }); await page.goto(`${baseURL}/dewfall.html?debug=1`); await ready(page);
      const startBox = await page.locator('[data-action=start]').boundingBox(); assert.ok(startBox.y + startBox.height <= spec.height - (spec.insets?.bottom || 0), `${label}: start visible`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await page.screenshot({ path: `test-results/dewfall/${label}-intro.png` });
      await page.locator('[data-action=levels]').tap(); const choices = await page.locator('.level-choice').evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(), p = n.closest('.panel').getBoundingClientRect(); return { w: r.width, h: r.height, x: r.x, right: r.right, panelX: p.x, panelRight: p.right }; }));
      assert.equal(choices.length, 6); assert.equal(await page.locator('.level-choice:disabled').count(), 5); for (const r of choices) assert.ok(r.w >= 43.5 && r.h >= 43.5 && r.x >= r.panelX && r.right <= r.panelRight + 1, `${label}: 44px picker fits`);
      await page.locator('[data-action=menuBack]').tap(); await page.locator('[data-action=start]').tap(); await page.evaluate(() => window.__dewfall.setRealtime(false));
      const buttons = await page.locator('.topbar a,.topbar button,#levelButton').evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { name: n.id || n.className, x: r.x, y: r.y, w: r.width, h: r.height }; }));
      for (const r of buttons) { assert.ok(r.w >= 43.5 && r.h >= 43.5, `${label}: ${r.name} 44px (${r.w}×${r.h})`); assert.ok(r.x >= (spec.insets?.left || 0) && r.x + r.w <= spec.width - (spec.insets?.right || 0) + 1, `${label}: side insets`); assert.ok(r.y >= (spec.insets?.top || 0) && r.y + r.h <= spec.height - (spec.insets?.bottom || 0) + 1, `${label}: vertical insets`); }
      let stage = await page.locator('#gameStage').boundingBox(), anchor = { x: stage.x + stage.width * .55, y: stage.y + stage.height * .65 };
      await touchStart(cdp, anchor); await touchMove(cdp, { x: anchor.x, y: anchor.y - 44 }); assert.ok(await page.evaluate(() => window.__dewfall.game.state.dragging));
      await touchEnd(cdp, true); assert.ok(await page.evaluate(() => !window.__dewfall.game.state.dragging && window.__dewfall.game.state.tilt.x === 0 && window.__dewfall.game.state.tilt.z === 0));
      await touchStart(cdp, anchor); await touchMove(cdp, { x: anchor.x + 40, y: anchor.y });
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: {} }); await page.setViewportSize(spec.width < spec.height ? { width: 844, height: 390 } : { width: 390, height: 844 }); await page.waitForTimeout(100);
      assert.ok(await page.evaluate(() => !window.__dewfall.game.state.dragging), `${label}: rotation clears thumb tilt`); await touchEnd(cdp);
      await page.setViewportSize({ width: spec.width, height: spec.height }); if (spec.insets) await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: spec.insets }); await page.waitForTimeout(100);
      stage = await page.locator('#gameStage').boundingBox(); anchor = { x: stage.x + stage.width * .55, y: stage.y + stage.height * .65 };
      const stageBefore = { width: stage.width, height: stage.height }; await touchStart(cdp, anchor); await touchMove(cdp, { x: anchor.x, y: anchor.y - 44 });
      await page.evaluate(() => window.__dewfall.advance(.6)); const moving = await page.evaluate(() => window.__dewfall.game.snapshot()); assert.ok(moving.balls.every(b => b.z < 2.4 && b.vz < 0), `${label}: actual one-finger drag rolls all drops`);
      const stageAfter = await page.locator('#gameStage').boundingBox(); assert.deepEqual({ width: stageAfter.width, height: stageAfter.height }, stageBefore, `${label}: control copy cannot resize the stage`);
      await touchEnd(cdp); const speed = Math.abs(moving.balls[0].vz); await page.evaluate(() => window.__dewfall.advance(.5)); assert.ok(await page.evaluate(before => Math.abs(window.__dewfall.game.state.balls[0].vz) < before * .1, speed), `${label}: lifting brakes`);
      await page.locator('#pauseButton').tap(); await page.waitForFunction(() => window.__dewfall.game.state.mode === 'paused'); const saved = await page.evaluate(() => window.__dewfall.game.snapshot()); await page.reload(); await ready(page); await page.evaluate(() => window.__dewfall.setRealtime(false));
      const continueBox = await page.locator('[data-action=continue]').boundingBox(); assert.ok(continueBox.y + continueBox.height <= spec.height - (spec.insets?.bottom || 0), `${label}: continue visible`);
      await page.locator('[data-action=continue]').tap(); const restored = await page.evaluate(() => window.__dewfall.game.snapshot()); assert.deepEqual({ ...restored, mode: 'paused' }, saved, `${label}: exact save/reopen`);
      await touchStart(cdp, anchor); await touchMove(cdp, { x: anchor.x, y: anchor.y - 44 }); await page.evaluate(() => { for (let i = 0; i < 90 && window.__dewfall.game.state.mode === 'playing'; i++) window.__dewfall.advance(1 / 30); }); await touchEnd(cdp);
      assert.equal(await page.evaluate(() => window.__dewfall.game.state.mode), 'won', `${label}: one thumb waters the first garden`);
      await page.locator('[data-action=next]').tap(); await page.waitForFunction(() => window.__dewfall.game.state.level === 2); await page.waitForTimeout(100);
      const stats = await page.evaluate(() => { const r = window.__dewfall.view.renderer; return { calls: r.info.render.calls, pixels: r.domElement.width * r.domElement.height, antialias: r.getContext().getContextAttributes().antialias }; });
      assert.ok(stats.pixels <= 420000 && stats.calls <= 80 && !stats.antialias, `${label}: bounded phone renderer`); await page.screenshot({ path: `test-results/dewfall/${label}-play.png` }); reports.push({ phone: label, ...stats }); await context.close();
    }
    for (const scenario of ['corrupt', 'blocked']) {
      const context = await browser.newContext(), page = await context.newPage(); monitor(page, `${scenario}: `);
      await page.addInitScript(scenario => { if (scenario === 'blocked') Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new Error('Blocked storage'); }; else localStorage.setItem('games:save:dewfall', JSON.stringify({ version: 1, savedAt: Date.now(), data: { schema: 1, level: 999, mode: 'playing' } })); }, scenario);
      await page.goto(`${baseURL}/dewfall.html?debug=1&continue=1`); await ready(page); assert.equal(await page.locator('[data-action=continue]').count(), 0); await page.locator('[data-action=start]').click(); assert.equal(await page.evaluate(() => window.__dewfall.game.state.mode), 'playing');
      if (scenario === 'blocked') assert.ok((await page.locator('#saveStatus').textContent()).includes('UNAVAILABLE')); await context.close();
    }
    const reduced = await browser.newContext({ reducedMotion: 'reduce' }), reducedPage = await reduced.newPage(); monitor(reducedPage, 'reduced: '); await reducedPage.goto(`${baseURL}/dewfall.html?debug=1`); await ready(reducedPage); await reducedPage.locator('[data-action=start]').click(); assert.equal((await solve(reducedPage)).mode, 'won'); await reduced.close();
    assert.deepEqual(external, []); await writeFile('test-results/dewfall/results.json', JSON.stringify(reports, null, 2) + '\n'); console.log(JSON.stringify(reports, null, 2));
  }
  assert.deepEqual(errors, [], 'no errors or failed requests');
} finally { await browser?.close(); server?.kill('SIGTERM'); }
