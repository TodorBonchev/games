// The star field must behave like several distances, rather than a flat image
// sliding behind the island. Exercise its motion plus the real phone shell.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.GAMES_TEST_URL || 'http://127.0.0.1:5271';
let server, browser;
const errors = [], reports = [];
const watch = (page, label) => {
  page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`${label}: ${message.text()}`); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${label}: ${response.status()} ${response.url()}`); });
};
async function ready(page) {
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && window.__lantern?.view.space, null, { timeout: 45000 });
  await page.evaluate(() => document.fonts.ready);
}
async function samples(page) {
  return page.evaluate(() => __lantern.view.space.layers.map(layer => ({
    depth: layer.userData.depth, offset: layer.material.uniforms.uOffset.value.toArray(),
    time: layer.material.uniforms.uTime.value,
  })));
}
const difference = (a, b) => Math.hypot(a.offset[0] - b.offset[0], a.offset[1] - b.offset[1]);
try {
  if (!process.env.GAMES_TEST_URL) {
    server = spawn(process.execPath, ['scripts/serve.mjs', '--port', '5271'], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', code => reject(Error(`Server exited ${code}`))); });
  }
  await mkdir('test-results/lantern-space', { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  for (const spec of [
    { width: 390, height: 844, insets: { top: 47, bottom: 34 } },
    { width: 568, height: 320, insets: { left: 47, right: 47, bottom: 21 } },
  ]) {
    const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await context.newPage(), cdp = await context.newCDPSession(page); watch(page, `${spec.width}x${spec.height}`);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: spec.insets });
    await page.goto(`${base}/lantern.html?debug=1`); await ready(page);
    await page.locator('[data-action=start]').tap(); await page.evaluate(() => __lantern.setRealtime(false));
    const info = await page.evaluate(() => {
      const view = __lantern.view;
      return { world: !!view.scene.getObjectByName('LanternValeBlenderWorld'), spaceship: !!view.ship && view.assetStats.spaceship,
        layers: view.space.layers.map(layer => ({ name: layer.name, depth: layer.userData.depth, count: layer.geometry.attributes.position.count })),
        pixels: view.renderer.domElement.width * view.renderer.domElement.height, calls: view.renderer.info.render.calls,
        background: view.scene.background?.getHexString(), antialias: view.renderer.getContext().getContextAttributes().antialias };
    });
    assert.ok(info.world && info.spaceship, 'the actual Blender island is explored in a spacecraft');
    assert.equal(info.layers.length, 3); assert.equal(new Set(info.layers.map(layer => layer.depth)).size, 3);
    assert.ok(info.layers.reduce((sum, layer) => sum + layer.count, 0) >= 300, 'a populated three-depth sky');
    assert.ok(info.pixels <= 421000 && info.calls <= 150 && !info.antialias, 'phone rendering remains bounded');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const parallax = await page.evaluate(() => {
      const { space, camera } = __lantern.view, position = camera.position.clone();
      const sample = () => space.layers.map(layer => ({ depth: layer.userData.depth, offset: layer.material.uniforms.uOffset.value.toArray() }));
      space.update({ time: 0, cameraPosition: position, reducedMotion: false }); const before = sample();
      const right = position.clone().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(3).add(position);
      space.update({ time: 0, cameraPosition: right, reducedMotion: false }); const after = sample();
      space.update({ time: 0, cameraPosition: position, reducedMotion: false }); const still = sample();
      space.update({ time: 30, cameraPosition: position, reducedMotion: false }); const sailed = sample();
      __lantern.view.render(__lantern.game.state, performance.now() / 1000);
      return { before, after, still, sailed };
    });
    const shifts = parallax.before.map((item, i) => ({ depth: item.depth, shift: difference(parallax.after[i], item) })).sort((a, b) => b.depth - a.depth);
    assert.ok(shifts[0].shift > .001, 'camera translation moves the far stars');
    assert.ok(shifts[1].shift > shifts[0].shift * 1.15 && shifts[2].shift > shifts[1].shift * 1.15, `near stars cross the view faster: ${JSON.stringify(shifts)}`);
    for (let i = 0; i < 3; i++) assert.ok(difference(parallax.still[i], parallax.sailed[i]) > .001, 'the island keeps sailing while the spacecraft hovers');

    // Actual touch movement controls the spacecraft, and carries the
    // camera through the layered sky without altering any progression data.
    const r = await page.locator('#gameStage').boundingBox(), anchor = { x: r.x + r.width * .3, y: r.y + r.height * .6 };
    const before = await page.evaluate(() => ({ ...__lantern.game.state.player }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...anchor, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: anchor.x + 40, y: anchor.y, id: 1 }] });
    await page.evaluate(() => __lantern.advance(.5));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const after = await page.evaluate(() => ({ ...__lantern.game.state.player }));
    assert.ok(Math.hypot(after.x - before.x, after.z - before.z) > .2);
    await page.locator('#pauseButton').tap(); await page.waitForTimeout(180);
    const paused = { samples: await samples(page), frames: await page.evaluate(() => __lantern.renderCount), saved: await page.evaluate(() => __lantern.game.snapshot()) };
    await page.waitForTimeout(250);
    assert.deepEqual(await samples(page), paused.samples, 'pause stops star drift and sparkle');
    assert.equal(await page.evaluate(() => __lantern.renderCount), paused.frames, 'pause does not repaint the sky');
    await page.reload(); await ready(page); await page.evaluate(() => __lantern.setRealtime(false)); await page.locator('[data-action=continue]').tap();
    assert.deepEqual(await page.evaluate(() => __lantern.game.snapshot().player), paused.saved.player, 'changing the scenery keeps the exact saved position');

    const stable = await page.evaluate(() => {
      const { view, game } = __lantern; view.render(game.state, 10); const before = JSON.stringify(view.renderer.info.memory);
      for (let i = 0; i < 100; i++) view.render({ ...game.state, ticks: game.state.ticks + i }, 10 + i / 30);
      return before === JSON.stringify(view.renderer.info.memory);
    });
    assert.ok(stable, 'parallax frames reuse their GPU resources');
    const boundaryCameras = await page.evaluate(async () => {
      const { FLIGHT } = await import('./lantern-game.js');
      const { view, game } = __lantern;
      const locations = [{ x: 0, y: FLIGHT.maxY, z: 26, heading: Math.PI }, { x: FLIGHT.radius, y: 9, z: 0, heading: -Math.PI / 2 },
        { x: 4, y: -8, z: 3, heading: 0 }, { x: 0, y: FLIGHT.minY, z: 0, heading: 0 }];
      const results = locations.map((position, index) => {
        const display = { ...game.state, player: { ...game.state.player, ...position, speed: 0, verticalSpeed: 0, bank: 0 } };
        for (let i = 0; i < 40; i++) view.render(display, 100 + index * 2 + i / 30);
        const { camera } = view, dx = camera.position.x - position.x, dy = camera.position.y - position.y, dz = camera.position.z - position.z;
        return { position, distance: Math.hypot(dx, dy, dz), behind: dx * Math.sin(position.heading) + dz * Math.cos(position.heading), visible: view.project(position.x, position.z, position.y).visible };
      });
      for (let i = 0; i < 40; i++) view.render(game.state, 120 + i / 30);
      return results;
    });
    for (const sample of boundaryCameras) assert.ok(sample.distance > 6 && sample.behind < -1 && sample.visible,
      `the chase camera keeps its arm at the flight fence and beneath the island: ${JSON.stringify(sample)}`);
    await page.screenshot({ path: `test-results/lantern-space/playing-${spec.width}x${spec.height}.png` });
    reports.push({ phone: `${spec.width}x${spec.height}`, ...info, parallaxShifts: shifts });
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage(); watch(page, 'reduced motion');
  await page.goto(`${base}/lantern.html?debug=1`); await ready(page); await page.locator('[data-action=start]').tap(); await page.evaluate(() => __lantern.setRealtime(false));
  const staticSky = await page.evaluate(() => {
    const { view } = __lantern, p = view.camera.position.clone(), sample = () => view.space.layers.map(layer => ({ offset: layer.material.uniforms.uOffset.value.toArray(), time: layer.material.uniforms.uTime.value }));
    view.space.update({ time: 10, cameraPosition: p, reducedMotion: true }); const before = sample();
    p.x += 15; p.z -= 12; view.space.update({ time: 90, cameraPosition: p, reducedMotion: true });
    return { before, after: sample() };
  });
  assert.deepEqual(staticSky.before, staticSky.after, 'reduced motion stops travel, twinkle and camera parallax');
  for (const layer of staticSky.after) assert.equal(layer.time, 0);
  await context.close();
  assert.deepEqual(errors, [], 'no browser errors or missing assets');
  await writeFile('test-results/lantern-space/results.json', JSON.stringify(reports, null, 2) + '\n');
  console.log(JSON.stringify(reports, null, 2));
  console.log('Space-flight parallax, idle drift, reduced motion, paused rendering, phone movement and saved positions passed.');
} finally { await browser?.close(); server?.kill('SIGTERM'); }
