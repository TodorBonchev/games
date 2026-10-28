// Real WebGL worlds and physical touch events inside the shared chapter host.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const base = process.env.GAMES_TEST_URL || 'http://127.0.0.1:5216';
let server, browser;
const errors = [];
try {
  if (!process.env.GAMES_TEST_URL) {
    server = spawn(process.execPath, ['scripts/serve.mjs', '--port', '5216'], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', code => reject(Error(`Server exited ${code}`))); });
  }
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }]) {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await context.newPage(), cdp = await context.newCDPSession(page);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/__voyage-test.html', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;overflow:hidden}#stage{height:100%;width:100%;touch-action:none}canvas{display:block;width:100%;height:100%}</style><script type="importmap">{"imports":{"three":"./vendor/three/build/three.module.js","three/addons/":"./vendor/three/examples/jsm/"}}</script><div id="stage"></div>` }));
    await page.goto(`${base}/__voyage-test.html`);
    await page.evaluate(async () => {
      const { createLegacy } = await import('./voyage/legacy.js');
      const stage = document.getElementById('stage');
      window.losses = 0; window.restores = 0;
      window.openChapter = async id => {
        window.chapter?.dispose();
        window.chapter = await createLegacy(id, { container: stage, onLost() { window.losses++; }, onRestored() { window.restores++; } });
        window.chapter.render(0);
      };
      for (const [type, action] of [['pointerdown', 'down'], ['pointermove', 'move'], ['pointerup', 'up'], ['pointercancel', 'cancel']]) stage.addEventListener(type, event => {
        event.preventDefault();
        if (type === 'pointerdown') stage.setPointerCapture(event.pointerId);
        window.chapter?.pointer(action, event.clientX, event.clientY); window.chapter?.render(0);
      });
      window.advanceChapter = seconds => { for (let left = seconds; left > 1e-8; left -= 1 / 60) window.chapter.update(Math.min(1 / 60, left)); window.chapter.render(seconds); };
    });
    const touch = async (type, point) => {
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [{ ...point, id: 1 }] : [] });
      await page.waitForTimeout(35);
    };
    for (let cycle = 0; cycle < 3; cycle++) for (const id of ['moonbounce', 'popwake', 'pondpost', 'ribbon', 'dewfall']) {
      await page.evaluate(id => openChapter(id), id);
      const metrics = await page.evaluate(() => ({ canvas: document.querySelectorAll('canvas').length, width: chapter.renderer.domElement.width, height: chapter.renderer.domElement.height, pixels: chapter.renderer.domElement.width * chapter.renderer.domElement.height, mode: chapter.state.mode, losses }));
      assert.equal(metrics.canvas, 1, `${id}: one canvas after chapter switch`);
      assert.equal(metrics.mode, 'playing'); assert.equal(metrics.losses, 0, 'disposal must not trigger a recovery screen');
      assert.ok(metrics.pixels <= 421000, `${id}: phone framebuffer budget`);
      if (cycle) continue;
      const start = { x: viewport.width / 2, y: viewport.height / 2 };
      await touch('touchStart', start); await touch('touchMove', { x: start.x + 20, y: start.y + 30 }); await touch('touchCancel');
      const saved = await page.evaluate(() => chapter.snapshot());
      assert.ok(await page.evaluate(saved => chapter.restore(saved), saved), `${id}: real browser checkpoint restores`);
      assert.deepEqual(await page.evaluate(() => chapter.snapshot()), saved);
      if (id === 'moonbounce') {
        await touch('touchStart', start); await touch('touchEnd');
        assert.equal(await page.evaluate(() => chapter.engine.state.bursts), 1, 'lift launches real moons');
      } else if (id === 'popwake') {
        const path = await page.evaluate(async () => { const { LEVELS } = await import('./popwake-game.js'); return LEVELS[0].solution.map(p => chapter.project(p.x, p.z)); });
        await touch('touchStart', path[0]); for (const point of path.slice(1)) await touch('touchMove', point); await touch('touchEnd');
        await page.evaluate(() => advanceChapter(5)); assert.equal(await page.evaluate(() => chapter.state.mode), 'won', 'real finger trail wins');
      } else if (id === 'pondpost') {
        await touch('touchStart', start); await touch('touchMove', { x: start.x + 1.3 / .12, y: start.y + 8.4 / .12 }); await touch('touchEnd');
        await page.evaluate(() => advanceChapter(3)); assert.equal(await page.evaluate(() => chapter.engine.state.padId), 1, 'pull lands on first lily pad');
      } else if (id === 'ribbon') {
        const before = await page.evaluate(() => ({ x: chapter.engine.state.targetX, y: chapter.engine.state.targetY }));
        await touch('touchStart', start); await touch('touchMove', { x: start.x + 20, y: start.y - 10 }); await touch('touchEnd');
        await page.evaluate(() => advanceChapter(.4)); assert.ok(await page.evaluate(before => chapter.engine.state.targetX > before.x + .1 && chapter.engine.state.targetY > before.y + .05, before), 'finger steers ray in both dimensions');
      } else {
        await touch('touchStart', start); await touch('touchMove', { x: start.x, y: start.y - 44 });
        await page.evaluate(() => advanceChapter(3)); await touch('touchEnd');
        assert.equal(await page.evaluate(() => chapter.state.mode), 'won', 'real held tilt blooms the entire garden');
      }
    }
    // A live context loss is different from voluntarily leaving a chapter.
    await page.evaluate(async () => { await openChapter('ribbon'); const ext = chapter.renderer.getContext().getExtension('WEBGL_lose_context'); window.restoreGraphics = () => ext.restoreContext(); ext.loseContext(); });
    await page.waitForFunction(() => losses === 1); await page.waitForTimeout(200); await page.evaluate(() => restoreGraphics());
    await page.waitForFunction(() => restores === 1); await page.evaluate(() => chapter.render(0));
    await page.evaluate(() => chapter.dispose());
    assert.equal(await page.locator('canvas').count(), 0);
    console.log(`Five original worlds, touch controls, checkpoints, 15 chapter switches, and graphics recovery passed at ${viewport.width}×${viewport.height}.`);
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally { await browser?.close(); server?.kill(); }
