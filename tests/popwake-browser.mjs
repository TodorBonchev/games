// Browser checks for the real Popwake board, gesture, saves, and collection.
// Authored solutions use only the public drawing and release controls.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const port = 5189, baseURL = process.env.GAMES_TEST_URL || `http://127.0.0.1:${port}`;
const server = process.env.GAMES_TEST_URL ? null : spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
const errors = [], external = [], reports = [];
let browser;
const ready = async page => { await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 }); await page.evaluate(() => document.fonts.ready); };
function monitor(page, label = '') {
  page.on('pageerror', error => errors.push(`${label}${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`${label}${message.text()}`); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${label}${response.status()} ${response.url()}`); });
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(baseURL)) external.push(request.url()); });
}
async function cellPoints(page, level = 1) {
  return page.evaluate(async level => {
    const { LEVELS } = await import('./popwake-game.js'), api = window.__popwake, rect = document.getElementById('gameStage').getBoundingClientRect();
    return LEVELS[level - 1].solution.map(cell => {
      const point = api.view.project(cell.x, cell.z);
      return { x: rect.left + point.x, y: rect.top + point.y };
    });
  }, level);
}
async function touchTrail(cdp, points, cancel = false) {
  const point = position => ({ ...position, id: 1 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(points[0])] });
  for (const position of points.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(position)] });
  await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
}
async function mouseTrail(page, points) {
  await page.mouse.move(points[0].x, points[0].y); await page.mouse.down();
  for (const point of points.slice(1)) await page.mouse.move(point.x, point.y);
  await page.mouse.up();
}
async function finishChain(page) {
  return page.evaluate(() => {
    const api = window.__popwake;
    for (let i = 0; i < 60 * 60 && api.game.state.mode === 'running'; i++) api.game.advance(1 / 60);
    api.refresh(); const s = api.game.state;
    return { level: s.level, mode: s.mode, stars: s.stars, used: s.used, awake: s.awake, total: s.total };
  });
}
async function drawSolution(page, level) {
  return page.evaluate(async level => {
    const { LEVELS } = await import('./popwake-game.js'), api = window.__popwake;
    const solution = LEVELS[level - 1].solution;
    if (!api.game.begin(solution[0])) return false;
    for (const cell of solution.slice(1)) if (!api.game.drag(cell)) return false;
    const ok = api.game.release(); api.refresh(); return ok;
  }, level);
}
try {
  if (server) await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Popwake test server did not start')), 10000);
    server.stdout.once('data', () => { clearTimeout(timeout); resolve(); });
    server.once('error', error => { clearTimeout(timeout); reject(error); });
    server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Popwake test server exited (${code})`)); });
  });
  await mkdir('test-results/popwake', { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--enable-unsafe-swiftshader'] });
  if (process.argv.includes('--capture-art')) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 850 }, deviceScaleFactor: 1 }); monitor(page, 'capture: ');
    await page.goto(`${baseURL}/popwake.html?debug=1`); await ready(page);
    await page.evaluate(() => { window.__popwake.setRealtime(false); window.__popwake.start(4); });
    assert.ok(await drawSolution(page, 4));
    const frame = await page.evaluate(() => {
      const api = window.__popwake;
      for (let i = 0; i < 60 * 10 && api.game.state.mode === 'running' && api.game.state.awake < 2; i++) api.game.advance(1 / 60);
      api.refresh(); return { mode: api.game.state.mode, awake: api.game.state.awake, total: api.game.state.total };
    });
    assert.equal(frame.mode, 'running'); assert.ok(frame.awake > 0 && frame.awake < frame.total, 'capture depicts a real chain in progress');
    await page.addStyleTag({ content: '.topbar,.hud,.play-controls,.save-note,.toast{display:none!important}.game-app,.game-main{height:625px;flex:none}.game-app{max-width:none}.stage{height:625px;flex:none;width:1000px}' });
    await page.waitForTimeout(200);
    const png = await page.locator('#gameStage').screenshot({ path: 'test-results/popwake/preview.png' });
    const images = await page.evaluate(async base64 => {
      const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
      return [480, 960].map(width => {
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = Math.round(width / 1.6);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        return { width, data: canvas.toDataURL('image/webp', 0.84).split(',')[1] };
      });
    }, png.toString('base64'));
    for (const { width, data } of images) await writeFile(`assets/popwake-preview-${width}.webp`, Buffer.from(data, 'base64'));
    await page.close(); console.log('Captured the live Popwake chain reaction for both hub previews.');
  } else {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    let page = await context.newPage(); monitor(page, 'desktop: ');
    await page.goto(`${baseURL}/popwake.html?debug=1`); await ready(page);
    await page.locator('[data-action=help]').click();
    assert.ok((await page.locator('#gamePanel').textContent()).includes('Start at the blue spark'));
    await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'helpBack');
    await page.keyboard.press('Enter'); await page.locator('[data-action=start]').click();
    await page.evaluate(() => window.__popwake.setRealtime(false));
    await page.locator('#hintButton').focus(); await page.keyboard.press('Enter');
    assert.ok(await page.evaluate(() => window.__popwake.game.state.hintUsed && window.__popwake.game.state.mode === 'playing'), 'Enter activates a focused Hint button');
    await page.locator('#pauseButton').focus(); await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => window.__popwake.game.state.mode), 'paused', 'Space activates a focused Pause button');
    await page.locator('[data-action=resume]').click();
    await page.locator('.home-button').focus(); await page.keyboard.press('Enter');
    await page.waitForURL(url => url.pathname === new URL(`${baseURL}/`).pathname);
    assert.equal(await page.locator('.game-card').count(), 6, 'Enter activates the focused Home link');
    await page.goto(`${baseURL}/popwake.html?debug=1`); await ready(page);
    await page.locator('[data-action=start]').click();
    await page.evaluate(() => window.__popwake.setRealtime(false)); await page.locator('#gameStage').focus();
    await page.keyboard.press('Space'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => window.__popwake.game.state.mode), 'running', 'keyboard starts and releases a trail');
    assert.equal((await finishChain(page)).mode, 'failed', 'a short, incomplete trail ends in a retry instead of a false victory');
    await page.locator('[data-action=retry]').click();
    assert.equal(await page.evaluate(() => window.__popwake.game.state.used), 0);
    await mouseTrail(page, await cellPoints(page));
    assert.equal(await page.evaluate(() => window.__popwake.game.state.mode), 'running', 'a real mouse drag launches the trail');
    await page.evaluate(() => window.__popwake.advance(0.6));
    const partial = await page.evaluate(() => ({ mode: window.__popwake.game.state.mode, awake: window.__popwake.game.state.awake, total: window.__popwake.game.state.total }));
    assert.equal(partial.mode, 'running'); assert.ok(partial.awake > 0 && partial.awake < partial.total, 'checkpoint is captured during the cascade');
    await page.locator('#pauseButton').click(); await page.waitForTimeout(70);
    const paused = await page.evaluate(() => ({ tick: window.__popwake.game.state.ticks, frame: window.__popwake.renderCount }));
    await page.waitForTimeout(250);
    assert.deepEqual(await page.evaluate(() => ({ tick: window.__popwake.game.state.ticks, frame: window.__popwake.renderCount })), paused, 'pause freezes the cascade and GPU');
    const checkpoint = await page.evaluate(() => JSON.parse(localStorage.getItem('games:save:popwake')).data);
    const otherSave = await page.evaluate(async () => {
      const { createMoonbounce } = await import('./moonbounce-game.js'); const { writeGameSave } = await import('./save-store.js?v4');
      const other = createMoonbounce({ seed: 82941 }); other.start();
      if (!writeGameSave('moonbounce', other.snapshot())) throw new Error('Could not make independent Moonbounce save');
      return localStorage.getItem('games:save:moonbounce');
    });
    await page.close(); page = await context.newPage(); monitor(page, 'reopened: ');
    await page.goto(`${baseURL}/popwake.html?debug=1`); await ready(page);
    assert.ok(await page.locator('[data-action=continue]').isVisible());
    await page.evaluate(() => window.__popwake.setRealtime(false)); await page.locator('[data-action=continue]').click();
    const resumed = await page.evaluate(() => window.__popwake.game.snapshot());
    assert.equal(resumed.mode, 'running'); assert.equal(resumed.ticks, checkpoint.ticks);
    assert.deepEqual(resumed.trail, checkpoint.trail); assert.deepEqual(resumed.queue, checkpoint.queue); assert.deepEqual(resumed.jellies, checkpoint.jellies);
    assert.equal(await page.evaluate(() => localStorage.getItem('games:save:moonbounce')), otherSave, 'resuming a puzzle preserves the other game');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); delete document.hidden;
    });
    assert.equal(await page.evaluate(() => window.__popwake.game.state.mode), 'paused', 'backgrounding pauses the reaction');
    await page.locator('[data-action=resume]').click();
    await page.evaluate(() => {
      const extension = window.__popwake.view.renderer.getContext().getExtension('WEBGL_lose_context');
      window.__restorePicture = () => extension.restoreContext(); extension.loseContext();
    });
    await page.waitForFunction(() => window.__popwake.game.state.mode === 'paused');
    await page.waitForTimeout(250); await page.evaluate(() => window.__restorePicture());
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('READY TO POP AGAIN'));
    await page.locator('[data-action=resume]').click();
    let result = await finishChain(page); assert.equal(result.mode, 'won'); assert.equal(result.stars, 3); reports.push(result);
    assert.equal(await page.evaluate(() => window.__popwake.profile.stars[0]), 3);
    await page.locator('[data-action=replay]').click(); await page.locator('#hintButton').click();
    assert.ok(await page.evaluate(() => window.__popwake.game.state.hintUsed));
    await page.locator('#retryButton').click();
    assert.ok(await page.evaluate(() => window.__popwake.game.state.hintUsed), 'redrawing does not erase the hint for this attempt');
    assert.ok(await drawSolution(page, 1)); result = await finishChain(page);
    assert.equal(result.mode, 'won'); assert.equal(result.stars, 2, 'a hinted attempt is capped at two stars');
    assert.equal(await page.evaluate(() => window.__popwake.profile.stars[0]), 3, 'a hinted replay cannot lower a better saved result');
    await page.locator('[data-action=next]').click();
    for (let level = 2; level <= 8; level++) {
      assert.equal(await page.evaluate(() => window.__popwake.game.state.level), level);
      assert.ok(await drawSolution(page, level), `puzzle ${level}: legal trail can be drawn`);
      result = await finishChain(page); reports.push(result);
      assert.equal(result.mode, 'won', `puzzle ${level} can be completed through real game rules`);
      assert.equal(result.stars, 3, `puzzle ${level} supports a three-star trail`);
      assert.equal(result.awake, result.total);
      if (level < 8) await page.locator('[data-action=next]').click();
    }
    assert.equal(await page.evaluate(() => window.__popwake.profile.unlocked), 8);
    assert.deepEqual(await page.evaluate(() => window.__popwake.profile.stars), Array(8).fill(3));
    await page.screenshot({ path: 'test-results/popwake/all-awake.png' });
    const resources = await page.evaluate(() => {
      const { game, view } = window.__popwake, crowd = structuredClone(game.state);
      crowd.mode = 'running'; crowd.trail = Array.from({ length: 49 }, (_, i) => ({ x: i % 7, z: Math.floor(i / 7), litAt: crowd.ticks }));
      crowd.effects = Array.from({ length: 80 }, (_, i) => ({ id: i + 1, type: i % 2 ? 'pop' : 'trail', x: i % 7, z: Math.floor(i / 7) % 7, age: 0.2, duration: 0.7, jellyType: i % 3 ? 'normal' : 'relay' }));
      view.render(crowd, 3); const memory = JSON.stringify(view.renderer.info.memory);
      for (let i = 0; i < 20; i++) view.render(crowd, 3 + i / 30);
      return { calls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles, stable: memory === JSON.stringify(view.renderer.info.memory) };
    });
    assert.ok(resources.calls <= 100 && resources.stable, `a full board reuses its geometry (${resources.calls} calls)`); reports.push({ resources });
    await page.goto(`${baseURL}/`);
    assert.equal(await page.locator('.game-card').count(), 6);
    assert.equal(await page.locator('.popwake-card, .moonbounce-card').count(), 0, 'both engines are part of Wonderwake');
    await page.goto(`${baseURL}/popwake.html?continue=1`); await ready(page);
    assert.ok((await page.locator('#panelTitle').textContent()).includes('happy little world'));
    assert.equal(await page.evaluate(() => localStorage.getItem('games:save:moonbounce')), otherSave);
    await context.close();

    {
      const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
      const page = await phone.newPage(); monitor(page, 'level 8 fork: ');
      const cdp = await phone.newCDPSession(page);
      await page.goto(`${baseURL}/popwake.html?debug=1`); await ready(page);
      await page.locator('[data-action=start]').tap();
      await page.evaluate(() => { window.__popwake.setRealtime(false); window.__popwake.start(8); });
      const points = await cellPoints(page, 8), finger = point => ({ ...point, id: 1 });
      const before = await page.locator('#gameStage').boundingBox();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger(points[0])] });
      for (const point of points.slice(1)) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [finger(point)] });
        const board = await page.locator('#gameStage').boundingBox();
        assert.ok(Math.abs(board.y - before.y) < 0.1 && Math.abs(board.height - before.height) < 0.1, 'the board stays still as the used count grows into two digits');
        assert.equal(await page.evaluate(() => window.__popwake.game.state.mode), 'drawing', 'the live fork remains one uninterrupted gesture');
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      assert.ok(await page.evaluate(() => window.__popwake.game.state.mode === 'running' && window.__popwake.game.state.used === 14 && !window.__popwake.game.state.hintUsed), 'a real finger draws the entire level 8 fork without a hint');
      const result = await finishChain(page); assert.equal(result.mode, 'won'); assert.equal(result.stars, 3);
      await page.screenshot({ path: 'test-results/popwake/level-8-finger.png' });
      await phone.close();
    }

    for (const scenario of ['ready', 'paused']) {
      const context = await browser.newContext(), page = await context.newPage(); monitor(page, `context ${scenario}: `);
      await page.goto(`${baseURL}/popwake.html?debug=1`); await ready(page);
      if (scenario === 'paused') { await page.locator('[data-action=start]').click(); await page.locator('#pauseButton').click(); }
      const before = await page.evaluate(() => ({ mode: window.__popwake.game.state.mode, saved: window.__popwake.game.snapshot() }));
      await page.evaluate(() => {
        const extension = window.__popwake.view.renderer.getContext().getExtension('WEBGL_lose_context');
        window.__restorePicture = () => extension.restoreContext(); extension.loseContext();
      });
      await page.waitForFunction(() => document.getElementById('gamePanel').dataset.kind === 'restoring');
      assert.ok(await page.locator('[data-action=waiting]').isDisabled(), `${scenario}: restoration cannot be skipped`);
      assert.ok(await page.evaluate(() => document.querySelector('.topbar nav').inert), `${scenario}: controls are inactive while graphics restore`);
      await page.waitForTimeout(250); await page.evaluate(() => window.__restorePicture());
      if (scenario === 'ready') assert.ok(await page.locator('[data-action=start]').isVisible(), 'restoring at the intro returns to the intro');
      else assert.ok(await page.locator('[data-action=resume]').isEnabled(), 'restoring while paused returns to a resumable pause');
      assert.deepEqual(await page.evaluate(() => ({ mode: window.__popwake.game.state.mode, saved: window.__popwake.game.snapshot() })), before, `${scenario}: graphics recovery preserves the puzzle`);
      await context.close();
    }
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), page = await context.newPage();
      monitor(page, 'reduced motion: '); await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`${baseURL}/popwake.html?debug=1`); await ready(page); await page.locator('[data-action=start]').tap();
      await page.waitForTimeout(200);
      const frame = await page.evaluate(() => window.__popwake.renderCount);
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => window.__popwake.renderCount), frame, 'reduced-motion idle stops GPU rendering');
      await page.locator('#hintButton').tap();
      await page.waitForFunction(frame => window.__popwake.renderCount > frame, frame);
      assert.ok(await drawSolution(page, 1));
      await page.waitForFunction(() => window.__popwake.game.state.ticks > 5, null, { timeout: 5000 });
      assert.ok(await page.evaluate(() => window.__popwake.renderCount > 1), 'the reaction still runs with reduced motion');
      await context.close();
    }

    const phones = [
      { width: 320, height: 568, dpr: 2 }, { width: 360, height: 640, dpr: 2 },
      { width: 390, height: 844, dpr: 3, insets: { top: 47, bottom: 34 } }, { width: 430, height: 932, dpr: 3 },
      { width: 667, height: 375, dpr: 2 }, { width: 844, height: 390, dpr: 3, insets: { left: 47, right: 47, bottom: 21 } }, { width: 932, height: 430, dpr: 3 },
    ];
    for (const spec of phones) {
      const label = `${spec.width}x${spec.height}`, phone = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, isMobile: true, hasTouch: true, deviceScaleFactor: spec.dpr });
      let page = await phone.newPage(); monitor(page, `${label}: `); let cdp = await phone.newCDPSession(page);
      if (spec.insets) await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: spec.insets });
      await page.goto(`${baseURL}/popwake.html?debug=1`); await ready(page);
      const start = await page.locator('[data-action=start]').boundingBox();
      assert.ok(start.y + start.height <= spec.height - (spec.insets?.bottom || 0), `${label}: start is visible without scrolling`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: no horizontal overflow`);
      await page.screenshot({ path: `test-results/popwake/${label}-intro.png` });
      await page.locator('[data-action=levels]').tap();
      const choices = await page.locator('.level-choice').evaluateAll(nodes => {
        const panel = document.getElementById('gamePanel').getBoundingClientRect();
        return nodes.map(node => { const r = node.getBoundingClientRect(); return { x: r.x, right: r.right, w: r.width, h: r.height, disabled: node.disabled, panelX: panel.x, panelRight: panel.right }; });
      });
      assert.equal(choices.length, 8, `${label}: all puzzles appear in the picker`);
      assert.equal(choices.filter(choice => choice.disabled).length, 7, `${label}: future puzzles remain locked`);
      for (const choice of choices) assert.ok(choice.w >= 43.5 && choice.h >= 43.5 && choice.x >= choice.panelX && choice.right <= choice.panelRight + 1, `${label}: each puzzle target fits inside the panel at 44px`);
      await page.locator('[data-action=menuBack]').tap();
      await page.locator('[data-action=start]').tap(); await page.evaluate(() => window.__popwake.setRealtime(false));
      const controls = await page.locator('.topbar a,.topbar button,#levelButton,#hintButton,#retryButton').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { name: node.id || node.className, x: r.x, y: r.y, w: r.width, h: r.height }; }));
      for (const r of controls) {
        assert.ok(r.w >= 43.5 && r.h >= 43.5, `${label}: ${r.name} has a 44px touch target (${r.w}×${r.h})`);
        assert.ok(r.x >= (spec.insets?.left || 0) && r.x + r.w <= spec.width - (spec.insets?.right || 0) + 1, `${label}: ${r.name} clears side insets`);
        assert.ok(r.y >= (spec.insets?.top || 0) && r.y + r.h <= spec.height - (spec.insets?.bottom || 0) + 1, `${label}: ${r.name} clears top and bottom insets`);
      }
      let points = await cellPoints(page);
      await touchTrail(cdp, points.slice(0, 3), true);
      assert.ok(await page.evaluate(() => window.__popwake.game.state.mode === 'playing' && window.__popwake.game.state.used === 0 && window.__popwake.game.state.awake === 0), `${label}: cancelled touch discards the trail without firing`);
      const finger = point => ({ ...point, id: 1 });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger(points[0])] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [finger(points[1])] });
      assert.equal(await page.evaluate(() => window.__popwake.game.state.mode), 'drawing');
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: {} });
      const rotated = spec.width < spec.height ? { width: 844, height: 390 } : { width: 390, height: 844 };
      await page.setViewportSize(rotated); await page.waitForTimeout(150);
      assert.ok(await page.evaluate(() => window.__popwake.game.state.mode === 'playing' && window.__popwake.game.state.used === 0 && window.__popwake.game.state.awake === 0), `${label}: rotating cancels the drawing without firing`);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      assert.equal(await page.evaluate(() => window.__popwake.game.state.mode), 'playing', `${label}: lifting after rotation does not fire`);
      await page.setViewportSize({ width: spec.width, height: spec.height });
      if (spec.insets) await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: spec.insets });
      await page.waitForTimeout(100); points = await cellPoints(page);
      await touchTrail(cdp, points);
      assert.equal(await page.evaluate(() => window.__popwake.game.state.mode), 'running', `${label}: dragging then lifting starts the chain`);
      const result = await finishChain(page); assert.equal(result.mode, 'won'); assert.equal(result.stars, 3);
      const stats = await page.evaluate(() => { const { renderer } = window.__popwake.view; return { calls: renderer.info.render.calls, pixels: renderer.domElement.width * renderer.domElement.height, antialias: renderer.getContext().getContextAttributes().antialias }; });
      assert.ok(stats.calls < 100 && stats.pixels <= 421000 && !stats.antialias, `${label}: phone rendering budget`);
      await page.screenshot({ path: `test-results/popwake/${label}-won.png` });
      await page.close(); page = await phone.newPage(); monitor(page, `${label} reopened: `); cdp = await phone.newCDPSession(page);
      if (spec.insets) await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: spec.insets });
      await page.goto(`${baseURL}/popwake.html?debug=1`); await ready(page);
      const resume = await page.locator('[data-action=continue]').boundingBox();
      assert.ok(resume.y + resume.height <= spec.height - (spec.insets?.bottom || 0), `${label}: Continue is visible without scrolling`);
      await page.locator('[data-action=continue]').tap();
      assert.equal(await page.evaluate(() => window.__popwake.game.state.mode), 'won');
      assert.equal(await page.evaluate(() => window.__popwake.profile.stars[0]), 3);
      await page.locator('[data-action=next]').tap();
      assert.equal(await page.evaluate(() => window.__popwake.game.state.level), 2);
      await page.locator('.home-button').tap();
      assert.equal(await page.locator('.game-card').count(), 6);
      assert.equal(await page.locator('.wonderwake-card').count(), 1);
      await page.goto(`${baseURL}/popwake.html?continue=1`); await ready(page);
      assert.equal(new URL(page.url()).searchParams.get('continue'), '1', `${label}: preserved engine continues its puzzle`);
      assert.ok(await page.locator('#modalLayer').isHidden());
      assert.ok((await page.locator('#levelLabel').textContent()).includes('02'));
      reports.push({ phone: label, ...stats }); await phone.close();
    }
    for (const scenario of ['corrupt', 'blocked']) {
      const context = await browser.newContext(), page = await context.newPage(); monitor(page, `${scenario}: `);
      await page.addInitScript(scenario => {
        if (scenario === 'blocked') Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new Error('Device storage unavailable'); };
        else localStorage.setItem('games:save:popwake', JSON.stringify({ version: 1, savedAt: Date.now(), data: { schema: 1, level: 99, mode: 'running' } }));
      }, scenario);
      await page.goto(`${baseURL}/popwake.html?debug=1&continue=1`); await ready(page);
      assert.equal(await page.locator('[data-action=continue]').count(), 0, `${scenario}: invalid checkpoint is ignored`);
      await page.locator('[data-action=start]').click(); assert.equal(await page.evaluate(() => window.__popwake.game.state.mode), 'playing');
      if (scenario === 'blocked') assert.ok((await page.locator('#saveStatus').textContent()).includes('UNAVAILABLE'));
      await context.close();
    }
    assert.deepEqual(external, [], 'Popwake makes no external requests');
    await writeFile('test-results/popwake/results.json', JSON.stringify(reports, null, 2) + '\n');
    console.log(JSON.stringify(reports, null, 2));
  }
  assert.deepEqual(errors, [], 'no JavaScript errors or failed resources');
} finally { await browser?.close(); server?.kill('SIGTERM'); }
