// Real-browser checks for Pond Post. The pilot uses only the same aim,
// preview, launch and wait actions available to a player.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { solvePondPost } from './pondpost-strategy.mjs';

const port = 5188, baseURL = process.env.GAMES_TEST_URL || `http://127.0.0.1:${port}`;
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
async function solveRoute(page) {
  return page.evaluate(async source => {
    const { LEVELS } = await import('./pondpost-game.js'), api = window.__pondpost;
    api.setRealtime(false); const result = (0, eval)(`(${source})`)(api.game, LEVELS); api.refresh(); return result;
  }, solvePondPost.toString());
}
async function settleFlight(page) {
  return page.evaluate(() => {
    const api = window.__pondpost, game = api.game;
    for (let i = 0; i < 60 * 10 && ['flying', 'recovering'].includes(game.state.mode); i++) game.advance(1 / 60);
    api.refresh();
    const s = game.state;
    return { mode: s.mode, padId: s.padId, checkpoint: s.checkpoint, player: { ...s.player }, misses: s.misses, jumps: s.jumps, perfects: s.perfects, stamps: s.stamps.filter(item => item.collected).length };
  });
}
async function dragCoordinates(page) {
  const stage = await page.locator('#gameStage').boundingBox();
  const anchor = { x: stage.x + stage.width / 2, y: stage.y + stage.height * 0.46 };
  // At tick zero this normal pull predicts a perfect first-pad landing.
  return { anchor, pulled: { x: anchor.x + 1.3 / 0.12, y: anchor.y + 8.4 / 0.12 } };
}
async function touchStart(cdp, point) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] }); }
async function touchMove(cdp, point) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, id: 1 }] }); }
async function touchFinish(cdp, cancel = false) { await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] }); }
try {
  if (server) await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Pond Post test server did not start')), 10000);
    server.stdout.once('data', () => { clearTimeout(timeout); resolve(); });
    server.once('error', error => { clearTimeout(timeout); reject(error); });
    server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Pond Post test server exited (${code})`)); });
  });
  await mkdir('test-results/pondpost', { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--enable-unsafe-swiftshader'] });
  if (process.argv.includes('--capture-art')) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 850 }, deviceScaleFactor: 1 }); monitor(page, 'capture: ');
    await page.goto(`${baseURL}/pondpost.html?debug=1`); await ready(page);
    await page.evaluate(() => {
      const api = window.__pondpost, game = api.game; api.setRealtime(false); api.start(1);
      game.beginAim(); game.aim({ vx: -1.3, vy: 8.4 }); game.launch(); game.advance(0.36); api.refresh();
    });
    assert.equal(await page.evaluate(() => window.__pondpost.game.state.mode), 'flying', 'the artwork shows a real leap');
    await page.addStyleTag({ content: '.topbar,.hud,.play-controls,.save-note,.toast,.aim-gesture{display:none!important}.game-app,.game-main{height:625px;flex:none}.game-app{max-width:none}.stage{height:625px;flex:none;width:1000px}' });
    await page.waitForTimeout(200);
    const png = await page.locator('#gameStage').screenshot({ path: 'test-results/pondpost/preview.png' });
    const images = await page.evaluate(async base64 => {
      const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
      return [480, 960].map(width => {
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = Math.round(width / 1.6);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        return { width, data: canvas.toDataURL('image/webp', 0.84).split(',')[1] };
      });
    }, png.toString('base64'));
    for (const { width, data } of images) await writeFile(`assets/pondpost-preview-${width}.webp`, Buffer.from(data, 'base64'));
    await page.close(); console.log('Captured an actual Pond Post leap for both responsive hub previews.');
  } else {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    let page = await context.newPage(); monitor(page, 'desktop: ');
    await page.goto(`${baseURL}/pondpost.html?debug=1`); await ready(page);
    await page.locator('[data-action=help]').click();
    assert.ok((await page.locator('#gamePanel').textContent()).includes('Pull back anywhere'));
    await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'helpBack');
    await page.keyboard.press('Enter'); await page.locator('[data-action=start]').click();
    await page.evaluate(() => window.__pondpost.setRealtime(false));
    await page.locator('#helpButton').focus(); await page.keyboard.press('Enter');
    assert.ok(await page.locator('[data-action=helpBack]').isVisible(), 'Enter activates a focused Help button');
    await page.locator('[data-action=helpBack]').click(); await page.locator('[data-action=resume]').click();
    await page.locator('#pauseButton').focus(); await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => window.__pondpost.game.state.mode), 'paused', 'Space activates a focused Pause button');
    await page.locator('[data-action=resume]').click();
    await page.locator('.home-button').focus(); await page.keyboard.press('Enter');
    await page.waitForURL(url => url.pathname === new URL(`${baseURL}/`).pathname);
    assert.equal(await page.locator('.game-card').count(), 9, 'Enter activates the focused Home link');
    await page.goto(`${baseURL}/pondpost.html?debug=1`); await ready(page);
    await page.locator('[data-action=start]').click(); await page.evaluate(() => window.__pondpost.setRealtime(false));
    await page.locator('#gameStage').focus(); await page.keyboard.press('Space'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Space');
    assert.ok(await page.evaluate(() => window.__pondpost.game.state.mode === 'flying' && window.__pondpost.game.state.jumps === 1), 'keyboard aim and launch work');
    await page.evaluate(() => {
      const api = window.__pondpost, game = api.game; api.start(1); game.beginAim(); game.aim({ vx: -8, vy: 2 }); game.launch(); api.refresh();
    });
    const recovered = await settleFlight(page);
    assert.ok(recovered.mode === 'playing' && recovered.misses === 1 && recovered.padId === 0 && recovered.checkpoint === 0, 'a miss returns to the last safe pad without ending play');
    await page.evaluate(() => window.__pondpost.start(1));
    const gesture = await dragCoordinates(page);
    await page.mouse.move(gesture.anchor.x, gesture.anchor.y); await page.mouse.down(); await page.mouse.move(gesture.pulled.x, gesture.pulled.y);
    const prediction = await page.evaluate(() => window.__pondpost.game.preview().landing);
    assert.ok(prediction?.padId === 1 && prediction.perfect, 'the dotted preview predicts a perfect first landing');
    assert.ok((await page.locator('#controlTitle').textContent()).includes('PERFECT'));
    await page.mouse.up();
    assert.equal(await page.evaluate(() => window.__pondpost.game.state.mode), 'flying', 'releasing a real drag launches the frog');
    await page.evaluate(() => window.__pondpost.advance(0.25));
    const flight = await page.evaluate(() => ({ mode: window.__pondpost.game.state.mode, y: window.__pondpost.game.state.player.y }));
    assert.equal(flight.mode, 'flying'); assert.ok(flight.y > 0, 'save is captured mid-leap');
    await page.locator('#pauseButton').click(); await page.waitForTimeout(70);
    const paused = await page.evaluate(() => ({ tick: window.__pondpost.game.state.ticks, frame: window.__pondpost.renderCount }));
    await page.waitForTimeout(250);
    assert.deepEqual(await page.evaluate(() => ({ tick: window.__pondpost.game.state.ticks, frame: window.__pondpost.renderCount })), paused, 'pause freezes the leap and GPU');
    const checkpoint = await page.evaluate(() => JSON.parse(localStorage.getItem('games:save:pondpost')).data);
    const otherSaves = await page.evaluate(async () => {
      const { writeGameSave } = await import('./save-store.js?v5'), { createPopwake } = await import('./popwake-game.js');
      for (const name of ['soldier', 'garden', 'borrowed', 'moonbounce']) if (!writeGameSave(name, { sentinel: name })) throw new Error(`Could not prepare ${name} slot`);
      const other = createPopwake(); other.start(1); if (!writeGameSave('popwake', other.snapshot())) throw new Error('Could not prepare Popwake slot');
      return Object.fromEntries(['soldier', 'garden', 'borrowed', 'moonbounce', 'popwake'].map(name => [name, localStorage.getItem(`games:save:${name}`)]));
    });
    await page.close(); page = await context.newPage(); monitor(page, 'reopened: ');
    await page.goto(`${baseURL}/pondpost.html?debug=1`); await ready(page);
    assert.ok(await page.locator('[data-action=continue]').isVisible());
    await page.evaluate(() => window.__pondpost.setRealtime(false)); await page.locator('[data-action=continue]').click();
    const resumed = await page.evaluate(() => window.__pondpost.game.snapshot());
    assert.equal(resumed.mode, 'flying'); assert.equal(resumed.ticks, checkpoint.ticks);
    assert.deepEqual(resumed.player, checkpoint.player); assert.deepEqual(resumed.stamps, checkpoint.stamps); assert.equal(resumed.checkpoint, checkpoint.checkpoint);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); delete document.hidden; });
    assert.equal(await page.evaluate(() => window.__pondpost.game.state.mode), 'paused', 'backgrounding pauses the leap');
    await page.locator('[data-action=resume]').click();
    await page.evaluate(() => {
      const extension = window.__pondpost.view.renderer.getContext().getExtension('WEBGL_lose_context');
      window.__restorePicture = () => extension.restoreContext(); extension.loseContext();
    });
    await page.waitForFunction(() => document.getElementById('gamePanel').dataset.kind === 'restoring');
    assert.ok(await page.locator('[data-action=waiting]').isDisabled());
    await page.waitForTimeout(250); await page.evaluate(() => window.__restorePicture());
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('THE FOREST IS READY AGAIN'));
    await page.locator('[data-action=resume]').click();
    const landing = await settleFlight(page);
    assert.equal(landing.mode, 'playing'); assert.equal(landing.padId, prediction.padId);
    assert.ok(Math.abs(landing.player.x - prediction.x) < 1e-7 && landing.player.y === prediction.y, 'actual landing matches the aim preview after restoring');
    assert.equal(landing.perfects, 1); assert.ok(landing.stamps >= 1);
    let result = await solveRoute(page); reports.push(result);
    assert.equal(result.mode, 'won'); assert.equal(result.stars, 3);
    for (const item of result.predictions) assert.ok(item.expected.padId === item.actualPad && Math.abs(item.expected.x - item.actualX) < 1e-7 && item.expected.y === item.actualY, 'every predicted landing matches real flight');
    await page.locator('[data-action=next]').click();
    for (let level = 2; level <= 5; level++) {
      assert.equal(await page.evaluate(() => window.__pondpost.game.state.level), level);
      result = await solveRoute(page); reports.push(result);
      assert.equal(result.mode, 'won', `route ${level} can be completed with legal aims and jumps`); assert.equal(result.stars, 3);
      for (const item of result.predictions) assert.ok(item.expected.padId === item.actualPad && Math.abs(item.expected.x - item.actualX) < 1e-7 && item.expected.y === item.actualY, `route ${level}: moving-pad and wind prediction matches the landing`);
      if (level < 5) await page.locator('[data-action=next]').click();
    }
    const records = await page.evaluate(() => ({ profile: window.__pondpost.profile, score: window.__pondpost.game.state.score }));
    assert.equal(records.profile.unlocked, 5); assert.deepEqual(records.profile.stars, Array(5).fill(3)); assert.equal(records.profile.bestScore[4], records.score);
    await page.screenshot({ path: 'test-results/pondpost/all-delivered.png' });
    const resources = await page.evaluate(() => {
      const { game, view } = window.__pondpost, crowd = structuredClone(game.state);
      crowd.effects = Array.from({ length: 80 }, (_, i) => ({ id: i + 1, type: i % 2 ? 'perfect' : 'landing', x: Math.sin(i) * 4, y: crowd.player.y + Math.cos(i) * 2, age: 0.2, duration: 0.7 }));
      const preview = { points: Array.from({ length: 70 }, (_, i) => ({ x: Math.sin(i * 0.1) * 3, y: crowd.player.y + i * 0.04 })), landing: { x: 1, y: crowd.player.y, perfect: true } };
      view.render(crowd, 3, preview); const memory = JSON.stringify(view.renderer.info.memory);
      for (let i = 0; i < 20; i++) view.render(crowd, 3 + i / 30, preview);
      return { calls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles, stable: memory === JSON.stringify(view.renderer.info.memory) };
    });
    assert.ok(resources.calls <= 100 && resources.stable, `a full scene reuses geometry (${resources.calls} calls)`); reports.push({ resources });
    await page.goto(`${baseURL}/`); assert.equal(await page.locator('.game-card').count(), 9);
    await page.waitForFunction(() => document.querySelector('.pondpost-card [data-play-label]')?.textContent === 'CONTINUE RUN');
    assert.equal(await page.locator('.popwake-card [data-play-label]').textContent(), 'CONTINUE RUN');
    await page.locator('.pondpost-card').click(); await ready(page);
    assert.ok((await page.locator('#panelTitle').textContent()).includes('forest'));
    const after = await page.evaluate(() => Object.fromEntries(['soldier', 'garden', 'borrowed', 'moonbounce', 'popwake'].map(name => [name, localStorage.getItem(`games:save:${name}`)])));
    assert.deepEqual(after, otherSaves, 'Pond Post never overwrites any other game slot');
    await context.close();

    for (const scenario of ['ready', 'paused']) {
      const context = await browser.newContext(), page = await context.newPage(); monitor(page, `context ${scenario}: `);
      await page.goto(`${baseURL}/pondpost.html?debug=1`); await ready(page);
      if (scenario === 'paused') { await page.locator('[data-action=start]').click(); await page.locator('#pauseButton').click(); }
      const before = await page.evaluate(() => ({ mode: window.__pondpost.game.state.mode, saved: window.__pondpost.game.snapshot() }));
      await page.evaluate(() => { const extension = window.__pondpost.view.renderer.getContext().getExtension('WEBGL_lose_context'); window.__restorePicture = () => extension.restoreContext(); extension.loseContext(); });
      await page.waitForFunction(() => document.getElementById('gamePanel').dataset.kind === 'restoring');
      assert.ok(await page.locator('[data-action=waiting]').isDisabled());
      assert.ok(await page.evaluate(() => document.querySelector('.topbar nav').inert));
      await page.waitForTimeout(250); await page.evaluate(() => window.__restorePicture());
      if (scenario === 'ready') assert.ok(await page.locator('[data-action=start]').isVisible());
      else assert.ok(await page.locator('[data-action=resume]').isEnabled());
      assert.deepEqual(await page.evaluate(() => ({ mode: window.__pondpost.game.state.mode, saved: window.__pondpost.game.snapshot() })), before, `${scenario}: graphics recovery preserves the run`);
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
      await page.goto(`${baseURL}/pondpost.html?debug=1`); await ready(page);
      const start = await page.locator('[data-action=start]').boundingBox();
      assert.ok(start.y + start.height <= spec.height - (spec.insets?.bottom || 0), `${label}: start is visible without scrolling`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: no horizontal overflow`);
      await page.screenshot({ path: `test-results/pondpost/${label}-intro.png` });
      await page.locator('[data-action=levels]').tap();
      const choices = await page.locator('.level-choice').evaluateAll(nodes => {
        const panel = document.getElementById('gamePanel').getBoundingClientRect();
        return nodes.map(node => { const r = node.getBoundingClientRect(); return { x: r.x, right: r.right, w: r.width, h: r.height, disabled: node.disabled, panelX: panel.x, panelRight: panel.right }; });
      });
      assert.equal(choices.length, 5, `${label}: all routes appear in the picker`);
      assert.equal(choices.filter(choice => choice.disabled).length, 4, `${label}: future routes remain locked`);
      for (const choice of choices) assert.ok(choice.w >= 43.5 && choice.h >= 43.5 && choice.x >= choice.panelX && choice.right <= choice.panelRight + 1, `${label}: each route target fits inside the panel at 44px`);
      await page.locator('[data-action=menuBack]').tap();
      await page.locator('[data-action=start]').tap(); await page.evaluate(() => window.__pondpost.setRealtime(false));
      const controls = await page.locator('.topbar a,.topbar button,#levelButton').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { name: node.id || node.className, x: r.x, y: r.y, w: r.width, h: r.height }; }));
      for (const r of controls) {
        assert.ok(r.w >= 43.5 && r.h >= 43.5, `${label}: ${r.name} has a 44px touch target (${r.w}×${r.h})`);
        assert.ok(r.x >= (spec.insets?.left || 0) && r.x + r.w <= spec.width - (spec.insets?.right || 0) + 1, `${label}: ${r.name} clears side insets`);
        assert.ok(r.y >= (spec.insets?.top || 0) && r.y + r.h <= spec.height - (spec.insets?.bottom || 0) + 1, `${label}: ${r.name} clears top and bottom insets`);
      }
      await page.evaluate(() => { const api = window.__pondpost; api.game.beginAim(); api.game.aim({ vx: 0, vy: 8.5 }); api.refresh(); });
      assert.ok((await page.locator('#controlTitle').textContent()).includes('SAME LEAF'), `${label}: a return to the current pad is explained`);
      await page.evaluate(() => { const api = window.__pondpost; api.game.cancelAim(); api.refresh(); });
      let gesture = await dragCoordinates(page);
      await touchStart(cdp, gesture.anchor); await touchFinish(cdp);
      assert.ok(await page.evaluate(() => window.__pondpost.game.state.mode === 'playing' && window.__pondpost.game.state.jumps === 0), `${label}: a tap does not launch by accident`);
      await touchStart(cdp, gesture.anchor); await touchMove(cdp, gesture.pulled); await touchFinish(cdp, true);
      assert.ok(await page.evaluate(() => window.__pondpost.game.state.mode === 'playing' && window.__pondpost.game.state.jumps === 0), `${label}: cancelled touch does not launch`);
      await touchStart(cdp, gesture.anchor); await touchMove(cdp, gesture.pulled);
      assert.equal(await page.evaluate(() => window.__pondpost.game.state.mode), 'aiming');
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: {} });
      const rotated = spec.width < spec.height ? { width: 844, height: 390 } : { width: 390, height: 844 };
      await page.setViewportSize(rotated); await page.waitForTimeout(150);
      assert.ok(await page.evaluate(() => window.__pondpost.game.state.mode === 'playing' && window.__pondpost.game.state.jumps === 0), `${label}: rotating cancels aim without firing`);
      await touchFinish(cdp);
      assert.equal(await page.evaluate(() => window.__pondpost.game.state.jumps), 0, `${label}: lifting after rotation does not launch`);
      await page.setViewportSize({ width: spec.width, height: spec.height });
      if (spec.insets) await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: spec.insets });
      await page.waitForTimeout(100); gesture = await dragCoordinates(page);
      await touchStart(cdp, gesture.anchor); await touchMove(cdp, gesture.pulled);
      const predicted = await page.evaluate(() => window.__pondpost.game.preview().landing);
      assert.ok(predicted?.padId === 1 && predicted.perfect, `${label}: finger aim shows the actual first-pad prediction`);
      assert.ok((await page.locator('#controlTitle').textContent()).includes('PERFECT'));
      await touchFinish(cdp); assert.equal(await page.evaluate(() => window.__pondpost.game.state.mode), 'flying', `${label}: lifting launches the frog`);
      const landed = await settleFlight(page);
      assert.ok(landed.mode === 'playing' && landed.padId === 1 && landed.checkpoint === 1 && landed.misses === 0 && landed.perfects === 1 && landed.stamps >= 1, `${label}: the real touch leap lands and collects its stamp`);
      assert.ok(Math.abs(landed.player.x - predicted.x) < 1e-7 && landed.player.y === predicted.y, `${label}: preview matches the actual landing`);
      await page.evaluate(() => window.__pondpost.save());
      const checkpoint = await page.evaluate(() => JSON.parse(localStorage.getItem('games:save:pondpost')).data);
      const stats = await page.evaluate(() => { const { renderer } = window.__pondpost.view; return { calls: renderer.info.render.calls, pixels: renderer.domElement.width * renderer.domElement.height, antialias: renderer.getContext().getContextAttributes().antialias }; });
      assert.ok(stats.calls < 100 && stats.pixels <= 421000 && !stats.antialias, `${label}: phone rendering budget`);
      await page.screenshot({ path: `test-results/pondpost/${label}-landed.png` });
      await page.close(); page = await phone.newPage(); monitor(page, `${label} reopened: `); cdp = await phone.newCDPSession(page);
      if (spec.insets) await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: spec.insets });
      await page.goto(`${baseURL}/pondpost.html?debug=1`); await ready(page);
      const resume = await page.locator('[data-action=continue]').boundingBox();
      assert.ok(resume.y + resume.height <= spec.height - (spec.insets?.bottom || 0), `${label}: Continue is visible without scrolling`);
      await page.evaluate(() => window.__pondpost.setRealtime(false)); await page.locator('[data-action=continue]').tap();
      const restored = await page.evaluate(() => window.__pondpost.game.snapshot());
      assert.equal(restored.padId, checkpoint.padId); assert.equal(restored.checkpoint, checkpoint.checkpoint); assert.equal(restored.score, checkpoint.score); assert.deepEqual(restored.stamps, checkpoint.stamps);
      if (spec.width === 320 || spec.width === 844) {
        await page.locator('.home-button').tap();
        await page.waitForFunction(() => document.querySelector('.pondpost-card [data-play-label]')?.textContent === 'CONTINUE RUN');
        await page.locator('.quick-play [data-game-link=pondpost]').tap(); await ready(page);
        assert.equal(new URL(page.url()).searchParams.get('continue'), '1', `${label}: the phone hub continues the saved route`);
        assert.ok(await page.locator('#modalLayer').isHidden()); assert.ok((await page.locator('#levelLabel').textContent()).includes('01'));
      }
      reports.push({ phone: label, ...stats }); await phone.close();
    }
    for (const scenario of ['corrupt', 'blocked']) {
      const context = await browser.newContext(), page = await context.newPage(); monitor(page, `${scenario}: `);
      await page.addInitScript(scenario => {
        if (scenario === 'blocked') Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new Error('Device storage unavailable'); };
        else localStorage.setItem('games:save:pondpost', JSON.stringify({ version: 1, savedAt: Date.now(), data: { schema: 1, level: 99, mode: 'flying' } }));
      }, scenario);
      await page.goto(`${baseURL}/pondpost.html?debug=1&continue=1`); await ready(page);
      assert.equal(await page.locator('[data-action=continue]').count(), 0, `${scenario}: invalid checkpoint is ignored`);
      await page.locator('[data-action=start]').click(); assert.equal(await page.evaluate(() => window.__pondpost.game.state.mode), 'playing');
      if (scenario === 'blocked') assert.ok((await page.locator('#saveStatus').textContent()).includes('UNAVAILABLE'));
      await context.close();
    }
    assert.deepEqual(external, [], 'Pond Post makes no external requests');
    await writeFile('test-results/pondpost/results.json', JSON.stringify(reports, null, 2) + '\n');
    console.log(JSON.stringify(reports, null, 2));
  }
  assert.deepEqual(errors, [], 'no JavaScript errors or failed resources');
} finally { await browser?.close(); server?.kill('SIGTERM'); }
