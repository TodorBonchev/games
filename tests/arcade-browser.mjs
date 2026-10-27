// Exercise all twenty games in the shared real-browser shell. Detailed legal
// wins live in the action, puzzle and skill browser suites.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { arcadeGames } from '../arcade/catalog.js';

const base = process.env.GAMES_TEST_URL || 'http://127.0.0.1:5204';
let server, browser;
const errors = [];
const specs = [
  { width: 320, height: 568, dpr: 2, insets: { top: 47, bottom: 34 } },
  { width: 390, height: 844, dpr: 3, insets: { top: 47, bottom: 34 } },
  { width: 568, height: 320, dpr: 2, insets: { left: 47, right: 47, bottom: 21 } },
];
function watch(page, label) {
  page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`${label}: ${message.text()}`); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${label}: ${response.status()} ${response.url()}`); });
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(base)) errors.push(`${label}: external request ${request.url()}`); });
}
async function ready(page) {
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
}
try {
  if (!process.env.GAMES_TEST_URL) {
    server = spawn(process.execPath, ['scripts/serve.mjs', '--port', '5204'], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', code => reject(Error(`Server exited ${code}`))); });
  }
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] });
  assert.equal(arcadeGames.length, 20); assert.equal(new Set(arcadeGames.map(game => game.id)).size, 20);
  assert.equal(new Set(arcadeGames.map(game => game.hero)).size, 20);
  for (const spec of specs.filter(item => !process.env.ARCADE_PHONE || `${item.width}x${item.height}` === process.env.ARCADE_PHONE)) {
    const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, deviceScaleFactor: spec.dpr, isMobile: true, hasTouch: true });
    const page = await context.newPage(), cdp = await context.newCDPSession(page);
    watch(page, `${spec.width}x${spec.height}`);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: spec.insets });
    for (const game of arcadeGames) {
      const label = `${spec.width}x${spec.height} ${game.id}`;
      await page.goto(`${base}/arcade.html?game=${game.id}&debug=1`); await ready(page);
      assert.equal(await page.locator('#gameTitle').textContent(), game.title, label);
      assert.ok(await page.evaluate(() => document.querySelector('.app').inert), `${label}: intro is a modal`);
      const start = await page.locator('[data-action=start]').boundingBox();
      assert.ok(start && start.height >= 44 && start.y >= (spec.insets.top || 0) && start.y + start.height <= spec.height - (spec.insets.bottom || 0) + 1, `${label}: start fits in the screen`);
      await page.locator('[data-action=start]').tap(); await page.evaluate(() => __arcade.setRealtime(false));
      const measurements = await page.evaluate(() => {
        const nodes = [...document.querySelectorAll('.app a, .app button')].filter(node => node.getClientRects().length);
        const targets = nodes.map(node => { const r = node.getBoundingClientRect(); return { name: node.id || node.textContent.trim(), x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; });
        const title = document.querySelector('#gameTitle'), score = document.querySelector('#scoreText');
        return { targets, score: { text: score.textContent, width: score.clientWidth, scroll: score.scrollWidth },
          title: { text: title.textContent, width: title.clientWidth, scroll: title.scrollWidth },
          pixels: __arcade.renderer.domElement.width * __arcade.renderer.domElement.height,
          antialias: __arcade.renderer.getContext().getContextAttributes().antialias,
          calls: __arcade.renderer.info.render.calls,
          hasHero: !!__arcade.root.getObjectByName('Hero'), horizontal: document.documentElement.scrollWidth <= innerWidth + 1 };
      });
      for (const target of measurements.targets) {
        assert.ok(target.width >= 43.5 && target.height >= 43.5, `${label}: small target ${JSON.stringify(target)}`);
        assert.ok(target.x >= (spec.insets.left || 0) && target.right <= spec.width - (spec.insets.right || 0) + 1, `${label}: target overlaps side inset ${JSON.stringify(target)}`);
        assert.ok(target.y >= (spec.insets.top || 0) - 1 && target.bottom <= spec.height - (spec.insets.bottom || 0) + 1, `${label}: target overlaps vertical inset ${JSON.stringify(target)}`);
      }
      assert.ok(measurements.horizontal && measurements.hasHero, `${label}: complete scene fits`);
      assert.ok(measurements.pixels <= 421000 && !measurements.antialias && measurements.calls <= 150, `${label}: bounded mobile rendering ${JSON.stringify(measurements)}`);
      assert.ok(measurements.score.scroll <= measurements.score.width + 1, `${label}: progress text is readable ${JSON.stringify(measurements.score)}`);
      assert.ok(measurements.title.scroll <= measurements.title.width + 1, `${label}: title is readable ${JSON.stringify(measurements.title)}`);
      const stage = await page.locator('#arcadeStage').boundingBox();
      assert.ok(stage.width > 120 && stage.height > 120, `${label}: game board has room`);
      const x = stage.x + stage.width * .52, y = stage.y + stage.height * .55;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await page.waitForTimeout(30);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 18, y: y - 12, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      assert.equal(await page.evaluate(() => __arcade.mode), 'playing', `${label}: cancelled touch remains playable`);
      const after = await page.locator('#arcadeStage').boundingBox();
      assert.deepEqual(after, stage, `${label}: control changes do not resize the board`);
      await page.locator('#pauseButton').tap();
      assert.equal(await page.evaluate(() => __arcade.mode), 'paused');
      await page.waitForTimeout(150);
      const checkpoint = await page.evaluate(() => ({ state: __arcade.game.snapshot(), frames: __arcade.renderCount }));
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => __arcade.renderCount), checkpoint.frames, `${label}: pause stops rendering`);
      await page.reload(); await ready(page);
      assert.ok(await page.locator('[data-action=continue]').isVisible(), `${label}: saved run is offered`);
      await page.evaluate(() => __arcade.setRealtime(false));
      await page.locator('[data-action=continue]').tap();
      assert.equal(await page.evaluate(() => __arcade.mode), 'playing', `${label}: checkpoint resumes`);
      assert.deepEqual(await page.evaluate(() => __arcade.game.snapshot()), checkpoint.state, `${label}: checkpoint restores exactly`);
    }
    console.log(`All 20 heroes, touch cancellation, layout, and saves passed at ${spec.width}x${spec.height}.`);
    await context.close();
  }
  // Rotation, backgrounding and graphics recovery must release held input
  // without turning the interrupted finger into an extra action.
  for (const id of ['lane-lark', 'burrow-banquet', 'mothlight']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage(), cdp = await context.newCDPSession(page); watch(page, `interrupt ${id}`);
    await page.goto(`${base}/arcade.html?game=${id}&debug=1`); await ready(page);
    await page.locator('[data-action=start]').tap(); await page.evaluate(() => __arcade.setRealtime(false));
    const r = await page.locator('#arcadeStage').boundingBox(), x = r.x + r.width * .5, y = r.y + r.height * .6;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 20, y: y - 20, id: 1 }] });
    await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(150);
    const interrupted = await page.evaluate(() => __arcade.game.snapshot());
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.deepEqual(await page.evaluate(() => __arcade.game.snapshot()), interrupted, `${id}: a rotated touch cannot fire on release`);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); delete document.hidden; });
    assert.equal(await page.evaluate(() => __arcade.mode), 'paused', `${id}: backgrounding pauses`);
    const hasContextLoss = await page.evaluate(() => {
      const extension = __arcade.renderer.getContext().getExtension('WEBGL_lose_context');
      if (!extension) return false;
      window.__restoreArcadeContext = () => extension.restoreContext(); extension.loseContext(); return true;
    });
    if (hasContextLoss) {
      await page.waitForFunction(() => document.getElementById('panel').dataset.kind === 'restoring');
      assert.ok(await page.locator('[data-action=wait]').isDisabled());
      await page.waitForTimeout(150); await page.evaluate(() => __restoreArcadeContext());
      await page.waitForFunction(() => document.getElementById('panel').dataset.kind === 'pause');
      await page.locator('[data-action=resume]').tap();
      assert.equal(await page.evaluate(() => __arcade.mode), 'playing', `${id}: graphics recovery resumes safely`);
    }
    await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage(); watch(page, 'intro graphics');
    await page.goto(`${base}/arcade.html?game=lane-lark&debug=1`); await ready(page);
    const supported = await page.evaluate(() => {
      const extension = __arcade.renderer.getContext().getExtension('WEBGL_lose_context');
      if (!extension) return false;
      window.__restoreArcadeContext = () => extension.restoreContext(); extension.loseContext(); return true;
    });
    if (supported) {
      await page.waitForFunction(() => document.getElementById('panel').dataset.kind === 'restoring');
      await page.waitForTimeout(150); await page.evaluate(() => __restoreArcadeContext());
      await page.waitForFunction(() => document.getElementById('panel').dataset.kind === 'intro');
      assert.ok(await page.locator('[data-action=start]').isEnabled(), 'intro returns after graphics recovery');
    }
    await context.close();
  }
  for (const scenario of ['blocked', 'corrupt']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await context.addInitScript(scenario => {
      if (scenario === 'blocked') Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new Error('blocked'); };
      else localStorage.setItem('games:save:arcade:lane-lark', '{bad');
    }, scenario);
    const page = await context.newPage(); watch(page, scenario);
    await page.goto(`${base}/arcade.html?game=lane-lark&debug=1`); await ready(page);
    assert.equal(await page.locator('[data-action=continue]').count(), 0);
    await page.locator('[data-action=start]').tap();
    assert.equal(await page.evaluate(() => __arcade.mode), 'playing');
    if (scenario === 'blocked') assert.match(await page.locator('#saveStatus').textContent(), /UNAVAILABLE/);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log('All 20 games pass phone layout, touch, pause, isolated saves, and storage failure checks.');
} finally { await browser?.close(); if (server) server.kill(); }
