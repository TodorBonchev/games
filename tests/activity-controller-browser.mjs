import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
const base = process.env.GAMES_TEST_URL || 'http://127.0.0.1:5208';
const server = process.env.GAMES_TEST_URL ? null : spawn(process.execPath, ['scripts/serve.mjs', '--port', '5208'], { stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
const errors = [];
try {
  if (server) await new Promise((resolve, reject) => {
    server.stdout.once('data', resolve); server.once('error', reject);
    setTimeout(() => reject(Error('Activity server did not start.')), 10000).unref();
  });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true });
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.route('**/native-activity-harness.html', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="importmap">{"imports":{"three":"./vendor/three/build/three.module.js","three/addons/":"./vendor/three/examples/jsm/"}}</script><style>body{margin:0}#stage{position:relative;width:100vw;height:100vh;overflow:hidden}canvas{display:block}</style></head><body><div id="stage"></div></body></html>` }));
  await page.goto(`${base}/native-activity-harness.html`);
  await page.evaluate(async () => {
    window.api = await import('./activities/controllers.js');
    window.catalog = await import('./activities/catalog.js');
    window.stage = document.getElementById('stage');
  });
  const ids = await page.evaluate(() => window.catalog.ACTIVITIES.map(activity => activity.id));
  for (const id of ids) {
    const result = await page.evaluate(async id => {
      const controller = await window.api.createActivity(id, { container: window.stage, seed: 42 });
      window.activity = controller;
      controller.render(0); controller.update(1 / 60, {}); controller.render(16);
      const saved = JSON.parse(JSON.stringify(controller.snapshot()));
      const restored = controller.restore(saved);
      controller.pointer('down', 80, 80); controller.pointer('move', 90, 95); controller.pointer('cancel');
      controller.render(32);
      const answer = { id, restored, mode: controller.state.mode, canvas: stage.querySelectorAll('canvas').length, hud: !!controller.hud().primary };
      controller.dispose(); controller.dispose(); answer.remaining = stage.querySelectorAll('canvas').length;
      return answer;
    }, id);
    assert.equal(result.restored, true, `${id}: JSON checkpoint restores`);
    assert.equal(result.mode, 'playing', `${id}: running`);
    assert.equal(result.canvas, 1, `${id}: one native renderer`);
    assert.equal(result.remaining, 0, `${id}: no orphaned canvas`);
    assert.equal(result.hud, true, `${id}: progress HUD`);
  }
  for (const width of [390, 960]) {
    await page.setViewportSize({ width, height: width === 390 ? 700 : 640 });
    const result = await page.evaluate(async () => {
      const garden = await window.api.createActivity('garden', { container: stage });
      garden.render(0); garden.action('pea');
      const patch = garden.project(1, 2); garden.pointer('down', patch.x, patch.y); garden.pointer('up', patch.x, patch.y);
      const planted = garden.engine.state.plants.some(plant => plant.type === 'pea' && plant.row === 2 && plant.col === 1);
      garden.dispose();
      const prism = await window.api.createActivity('prism', { container: stage }); prism.render(0);
      for (const [index, piece] of prism.engine.level.pieces.entries()) if (piece.solution !== undefined && prism.engine.state.orientations[index] !== piece.solution) {
        const point = prism.project(piece.x, piece.z); prism.pointer('down', point.x, point.y); prism.pointer('up', point.x, point.y); prism.render(0);
      }
      const solved = prism.state.mode === 'won'; prism.dispose(); return { planted, solved };
    });
    assert.ok(result.planted, `Garden projected taps work at ${width}px`);
    assert.ok(result.solved, `Prism projected taps complete puzzle at ${width}px`);
  }
  assert.deepEqual(errors, []);
  console.log('Native activities: all 30 factories render, restore JSON checkpoints and dispose; Garden and Prism pointer hit tests pass at phone and desktop widths.');
} finally { await browser?.close(); server?.kill(); }
