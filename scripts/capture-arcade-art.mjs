// Capture each hero from its actual Three.js scene for the collection cards.
// Run after npm ci: node scripts/capture-arcade-art.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { arcadeGames } from '../arcade/catalog.js';

const port = 5199, base = process.env.GAMES_TEST_URL || `http://127.0.0.1:${port}`;
let server, browser;
try {
  if (!process.env.GAMES_TEST_URL) {
    server = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', code => reject(Error(`Preview server exited: ${code}`))); });
  }
  await mkdir('assets/arcade', { recursive: true });
  await mkdir('test-results/arcade', { recursive: true });
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1000, height: 850 }, deviceScaleFactor: 1 });
  for (const game of arcadeGames) {
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/arcade.html?game=${encodeURIComponent(game.id)}&debug=1`);
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 30000 });
    await page.addStyleTag({ content: '.app{max-width:none;padding:0;height:600px}.topbar,.hud,.controls,.save-status,.touch-hint{display:none!important}.layout{height:600px;flex:none;display:block}.stage{width:960px;height:600px;border-radius:0}' });
    await page.evaluate(() => { __arcade.start(); __arcade.setRealtime(false); __arcade.advance(.7); });
    await page.waitForTimeout(100);
    const framed = await page.evaluate(async () => {
      const THREE = await import('three');
      const api = window.__arcade, hero = api.root.getObjectByName('Hero');
      if (!hero) return false;
      hero.updateWorldMatrix(true, true);
      const center = new THREE.Box3().setFromObject(hero).getCenter(new THREE.Vector3());
      api.camera.position.set(center.x, center.y + 18, center.z + 9);
      api.camera.lookAt(center); api.camera.zoom = 3.0; api.camera.updateProjectionMatrix(); api.camera.updateMatrixWorld();
      api.renderNow(); return true;
    });
    if (!framed) throw new Error(`Missing 3D hero for ${game.id}`);
    const png = await page.locator('#arcadeStage').screenshot({ path: `test-results/arcade/${game.id}-hero.png` });
    const images = await page.evaluate(async base64 => {
      const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
      return [480, 960].map(width => {
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = Math.round(width / 1.6);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        return { width, data: canvas.toDataURL('image/webp', .86).split(',')[1] };
      });
    }, png.toString('base64'));
    for (const image of images) await writeFile(`assets/arcade/${game.id}-${image.width}.webp`, Buffer.from(image.data, 'base64'));
    if (errors.length) throw new Error(`${game.id}: ${errors.join('; ')}`);
    console.log(`Captured ${game.title} · ${game.hero}`);
    await page.close();
  }
  await context.close();
} finally { await browser?.close(); if (server) server.kill(); }
