// Real WebGL integration checks for the game picker and Garden Guard.
// --capture-art refreshes the hub thumbnail from the game's actual 3D scene.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { checkPhones } from './phone-browser.mjs';
import { checkCampaign } from './campaign-browser.mjs';

const port = 5182;
const baseURL = process.env.GAMES_TEST_URL || `http://127.0.0.1:${port}`;
const server = process.env.GAMES_TEST_URL ? null : spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
const errors = [];
try {
  if (server) await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Game test server did not start')), 10000);
    server.stdout.once('data', () => { clearTimeout(timer); resolve(); });
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Game test server exited (${code})`)); });
  });
  await mkdir('test-results', { recursive: true });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    headless: true,
    args: ['--enable-unsafe-swiftshader'],
  });
  const monitor = page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`); });
  };
  const ready = async page => {
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
  };
  const cell = (page, row, col) => page.locator(`.lawn-cell[data-row="${row}"][data-col="${col}"]`);
  async function preparePreviews() {
    const page = await browser.newPage();
    await page.goto(`${baseURL}/garden.html?debug=1`);
    await ready(page);
    const previews = await page.evaluate(async () => {
      const output = [];
      for (const [name, source] of [['soldier', 'high-tier-gameplay.png'], ['garden', 'assets/garden-preview.png']]) {
        const image = new Image(); image.src = source; await image.decode();
        for (const width of [480, 960]) {
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = Math.round(image.naturalHeight * width / image.naturalWidth);
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          output.push({ name, width, data: canvas.toDataURL('image/webp', 0.8).split(',')[1] });
        }
      }
      return output;
    });
    for (const preview of previews) await writeFile(`assets/${preview.name}-preview-${preview.width}.webp`, Buffer.from(preview.data, 'base64'));
    await page.close();
    console.log('Prepared responsive WebP game previews.');
  }
  if (process.argv.includes('--prepare-previews')) {
    await preparePreviews();
  } else if (process.argv.includes('--campaign-only')) {
    await checkCampaign(browser, baseURL);
  } else if (process.argv.includes('--phone-only') || process.argv.includes('--phone-baseline')) {
    await checkPhones(browser, baseURL, { baseline: process.argv.includes('--phone-baseline') });
  } else {
  if (process.argv.includes('--capture-art')) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1100 }, deviceScaleFactor: 1 });
    monitor(page);
    await page.goto(`${baseURL}/garden.html?debug=1`);
    await ready(page);
    await page.evaluate(() => {
      document.getElementById('introPanel').hidden = true;
      document.querySelector('.stage-label').hidden = true;
      document.getElementById('gardenStage').style.height = '625px';
    });
    await page.waitForFunction(() => document.querySelector('#gardenStage canvas').height === document.getElementById('gardenStage').clientHeight);
    await page.locator('#gardenStage').screenshot({ path: 'assets/garden-preview.png' });
    const icons = await page.evaluate(async () => {
      const image = new Image();
      image.src = 'assets/games-icon.svg';
      await image.decode();
      return [180, 192, 512].map(size => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const context = canvas.getContext('2d');
        context.fillStyle = '#151c19';
        context.fillRect(0, 0, size, size);
        context.drawImage(image, 0, 0, size, size);
        return { size, data: canvas.toDataURL('image/png').split(',')[1] };
      });
    });
    for (const icon of icons) await writeFile(`assets/games-icon-${icon.size}.png`, Buffer.from(icon.data, 'base64'));
    await page.close();
    console.log('Captured the actual Three.js garden for the hub thumbnail.');
    await preparePreviews();
  }
  for (const spec of [
    { name: 'desktop', width: 1280, height: 960, touch: false },
    { name: 'phone', width: 390, height: 844, touch: true },
    { name: 'small-phone', width: 320, height: 740, touch: true },
  ]) {
    const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, hasTouch: spec.touch, isMobile: spec.touch, deviceScaleFactor: 1 });
    const page = await context.newPage();
    monitor(page);
    const runtimeRequests = [];
    await page.route('**/*', route => {
      const request = route.request();
      if (new URL(request.url()).origin !== new URL(baseURL).origin) { errors.push(`External runtime request: ${request.url()}`); return route.abort(); }
      runtimeRequests.push(new URL(request.url()).pathname);
      return route.continue();
    });
    await page.goto(`${baseURL}/`);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.title(), 'Games — Pick a world. Jump in.');
    assert.equal(await page.locator('.game-card').count(), 2);
    assert.equal(await page.locator('canvas').count(), 0, 'the hub does not boot a 3D engine');
    assert.ok(!runtimeRequests.some(path => path.includes('three.module') || path.includes('main.js')), 'game code is lazy by navigation');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'the hub fits the viewport');
    await page.screenshot({ path: `test-results/hub-${spec.name}.png`, fullPage: true });
    await page.locator('.garden-card').click();
    await ready(page);
    assert.equal(await page.locator('.lawn-cell').count(), 40);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Garden Guard fits the viewport');
    await page.screenshot({ path: `test-results/garden-${spec.name}-intro.png`, fullPage: true });
    await page.locator('#helpBtn').click();
    assert.ok(await page.locator('#helpDialog').isVisible());
    await page.locator('#helpClose').click();
    await page.locator('#startBtn').click();
    assert.ok(await page.locator('#introPanel').isHidden());
    if (spec.touch) await cell(page, 0, 0).tap();
    else await cell(page, 0, 0).click();
    assert.equal(await page.locator('#sunCount').textContent(), '150');
    await page.locator('[data-seed="pea"]').click();
    if (spec.touch) await cell(page, 2, 1).tap();
    else await cell(page, 2, 1).click();
    assert.equal(await page.locator('#sunCount').textContent(), '50');
    await cell(page, 2, 1).click();
    assert.equal(await page.locator('#sunCount').textContent(), '50', 'occupied cells do not spend sun');
    assert.ok(await page.locator('#playHint').evaluate(element => element.classList.contains('error')));
    await page.locator('#pauseBtn').click();
    assert.ok(await page.locator('#menuDialog').isVisible());
    const frozen = await page.evaluate(() => Number(document.getElementById('waveFill').style.width.replace('%', '')));
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => Number(document.getElementById('waveFill').style.width.replace('%', ''))), frozen);
    await page.locator('#resumeBtn').click();
    await page.locator('#helpBtn').click();
    await page.locator('#helpClose').click();
    await page.locator('#speedBtn').click();
    assert.equal(await page.locator('#speedBtn').textContent(), '2×');
    await page.locator('#speedBtn').click();
    await page.screenshot({ path: `test-results/garden-${spec.name}-play.png`, fullPage: true });
    if (spec.name === 'phone') {
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForFunction(() => document.querySelector('#gardenStage').getBoundingClientRect().height < 300);
      await page.screenshot({ path: 'test-results/garden-phone-landscape.png', fullPage: true });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForFunction(() => document.querySelector('#gardenStage').getBoundingClientRect().height > 300);
      assert.equal(await page.locator('#sunCount').textContent(), '50', 'rotation keeps the current run');
    }
    await page.locator('#pauseBtn').click();
    await page.locator('#menuDialog .dialog-back').click();
    assert.equal(await page.locator('.game-card').count(), 2, 'both games return to the collection');
    await context.close();
    console.log(`Hub, planting, pause, help and navigation: ${spec.name} passed.`);
  }
  const page = await browser.newPage({ viewport: { width: 1120, height: 900 }, deviceScaleFactor: 1 });
  monitor(page);
  await page.goto(`${baseURL}/garden.html?debug=1`);
  await ready(page);
  await page.locator('#startBtn').click();
  await page.evaluate(() => window.__garden.stopRendering());
  await page.keyboard.press('2');
  await cell(page, 2, 1).focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.__garden.game.state.plants[0].type), 'pea', 'the lawn works with a keyboard');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.row), '3');
  await page.keyboard.press('4');
  await cell(page, 2, 1).click();
  assert.equal(await page.evaluate(() => window.__garden.game.state.sun), 150, 'the shovel gives a half-cost refund');
  await page.evaluate(() => window.__garden.advance(6));
  await page.locator('.sun-drop').first().click();
  assert.equal(await page.evaluate(() => window.__garden.game.state.sun), 175);
  await page.locator('#pauseBtn').click();
  const paused = await page.evaluate(() => JSON.stringify(window.__garden.game.state));
  await page.evaluate(() => window.__garden.advance(30));
  assert.equal(await page.evaluate(() => JSON.stringify(window.__garden.game.state)), paused);
  await page.locator('#restartBtn').click();
  assert.equal(await page.evaluate(() => window.__garden.game.state.sun), 200);
  assert.equal(await page.locator('.sun-drop').count(), 0);
  await page.evaluate(() => {
    const { game } = window.__garden;
    game.place('bloom', 0, 0);
    game.place('pea', 2, 1);
    let extraBloom = false;
    for (let turn = 0; turn < 1000 && game.state.mode === 'playing'; turn++) {
      for (const sun of [...game.state.suns]) game.collectSun(sun.id);
      if (!extraBloom) extraBloom = game.place('bloom', 1, 0).ok;
      for (const [row, col] of [[1, 1], [3, 1], [0, 1], [4, 1], [2, 2], [1, 2], [3, 2], [0, 2], [4, 2]]) {
        if (!game.state.plants.some(plant => plant.row === row && plant.col === col)) { game.place('pea', row, col); break; }
      }
      game.tick(0.25);
    }
    window.__garden.advance(0);
  });
  assert.equal(await page.evaluate(() => window.__garden.game.state.mode), 'won');
  assert.ok(await page.locator('#menuTitle').textContent().then(text => text.includes('RESTORED')));
  assert.equal(await page.locator('#resultIcon').textContent(), '★★★');
  assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('games:garden:level1')).stars === 3));
  await page.screenshot({ path: 'test-results/garden-victory.png', fullPage: true });
  await page.locator('#resumeBtn').click();
  await page.evaluate(() => window.__garden.advance(400));
  assert.equal(await page.evaluate(() => window.__garden.game.state.mode), 'lost');
  assert.ok(await page.locator('#menuTitle').textContent().then(text => text.includes('OVERRUN')));
  await page.screenshot({ path: 'test-results/garden-defeat.png', fullPage: true });
  await page.locator('#resumeBtn').click();
  await page.evaluate(() => {
    const renderer = window.__garden.view.renderer;
    window.__garden.contextExtension = renderer.getContext().getExtension('WEBGL_lose_context');
    window.__garden.contextExtension.loseContext();
  });
  await page.waitForFunction(() => window.__garden.game.state.mode === 'paused');
  assert.equal(await page.locator('#resumeBtn').isEnabled(), false);
  await page.evaluate(() => window.__garden.contextExtension.restoreContext());
  await page.waitForFunction(() => !document.getElementById('resumeBtn').disabled);
  assert.equal(await page.evaluate(() => window.__garden.game.state.mode), 'paused', 'graphics restoration waits for the player');
  await page.locator('#resumeBtn').click();
  assert.equal(await page.evaluate(() => window.__garden.game.state.mode), 'playing');
  await page.evaluate(() => window.__garden.advance(0.1));
  assert.ok(await page.evaluate(() => window.__garden.view.renderer.info.render.calls > 0), 'the restored instanced garden renders again');
  console.log('Keyboard controls, resources, complete victory, defeat, restart and WebGL recovery passed.');
  await page.goto(`${baseURL}/soldier.html?debug=1&q=low&noscale=1`);
  await ready(page);
  assert.ok(await page.locator('#startBtn').isEnabled());
  await page.locator('#startBtn').click();
  await page.waitForFunction(() => window.__game.mode === 'intro');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__game.mode === 'play');
  // Desktop play captures the mouse for looking; the pause shortcut releases it.
  await page.keyboard.press('p');
  await page.locator('#pausePanel .games-return').click();
  assert.equal(await page.locator('.game-card').count(), 2, 'the existing shooter launches and returns to the hub');
  assert.deepEqual(errors, [], 'no browser errors, missing assets or external runtime dependencies');
  console.log('Soldier vs Zombies still deploys, plays and returns to the hub. All game browser checks passed.');
  }
} finally {
  await browser?.close();
  server?.kill();
}
