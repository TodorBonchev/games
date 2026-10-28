// Real browser checks for Moonbounce. The pilot only uses steering, launches,
// and offered upgrades; it never edits the simulation or grants resources.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createMoonbouncePilot } from './moonbounce-strategy.mjs';

const port = 5187;
const baseURL = process.env.GAMES_TEST_URL || `http://127.0.0.1:${port}`;
const server = process.env.GAMES_TEST_URL ? null : spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
const errors = [], external = [], reports = [];
let browser;
const ready = async page => {
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
};
function monitor(page, label = '') {
  page.on('pageerror', error => errors.push(`${label}${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`${label}${message.text()}`); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${label}${response.status()} ${response.url()}`); });
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(baseURL)) external.push(request.url()); });
}
async function installPilot(page) {
  await page.evaluate(source => { window.__moonPilot = (0, eval)(`(${source})`)(window.__moonbounce.game); }, createMoonbouncePilot.toString());
}
// Build an orbit by steering toward real loose moons without releasing any.
// This function is intentionally self-contained for the browser context.
function gatherSixMoons(game) {
  for (let tick = 0; tick < 60 * 40 && game.state.mode === 'playing' && game.state.orbits.length < 6; tick++) {
    const state = game.state, player = state.player;
    let nearest, distance = Infinity;
    for (const moon of state.moons) {
      if (moon.cooldown) continue;
      const length = Math.hypot(moon.x - player.x, moon.z - player.z);
      if (length < distance) { distance = length; nearest = moon; }
    }
    let x = 0, z = 0;
    if (nearest) { const length = Math.max(0.01, distance); x = (nearest.x - player.x) / length; z = (nearest.z - player.z) / length; }
    for (const enemy of state.enemies) {
      const dx = player.x - enemy.x, dz = player.z - enemy.z, length = Math.hypot(dx, dz) || 1;
      if (length < enemy.radius + 1.1) { x += dx / length * 1.4; z += dz / length * 1.4; }
    }
    game.advance(1 / 60, { x, z });
  }
  return game.state.orbits.length;
}
async function finishWave(page) {
  return page.evaluate(() => {
    const api = window.__moonbounce; api.setRealtime(false);
    for (let i = 0; i < 60 * 120 && api.game.state.mode === 'playing'; i++) window.__moonPilot();
    api.refresh();
    const s = api.game.state;
    return { wave: s.wave, mode: s.mode, score: s.score, hp: s.player.hp, kills: s.kills, bossDefeated: s.bossDefeated };
  });
}
try {
  if (server) await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Moonbounce test server did not start')), 10000);
    server.stdout.once('data', () => { clearTimeout(timer); resolve(); });
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Moonbounce test server exited (${code})`)); });
  });
  await mkdir('test-results/moonbounce', { recursive: true });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    headless: true, args: ['--enable-unsafe-swiftshader'],
  });

  if (process.argv.includes('--capture-art')) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 850 }, deviceScaleFactor: 1 }); monitor(page, 'capture: ');
    await page.goto(`${baseURL}/moonbounce.html?debug=1&seed=82941`); await ready(page);
    await page.locator('[data-action=start]').click();
    const orbitCount = await page.evaluate(() => {
      const api = window.__moonbounce; api.setRealtime(false);
      for (const input of [{ x: 0.97, z: 0.24 }, { x: -0.12, z: -0.99 }, { x: -0.98, z: -0.18 }]) api.game.advance(1, input);
      api.game.advance(0.2, { x: 1, z: 0 });
      const count = api.game.state.orbits.length;
      api.refresh(); api.game.burst(); api.game.advance(0.12); api.refresh(); return count;
    });
    assert.ok(orbitCount >= 6, 'the capture shows a real Moonstorm collected through movement');
    await page.addStyleTag({ content: '.topbar,.hud,.play-controls,.save-note,.stage-note,.boss-meter,.toast,.touch-stick,.screen-flash{display:none!important}.game-app,.game-main{height:625px;flex:none}.game-app{max-width:none}.stage{height:625px;flex:none;width:1000px}' });
    await page.waitForTimeout(200);
    const png = await page.locator('#gameStage').screenshot({ path: 'test-results/moonbounce/preview.png' });
    const images = await page.evaluate(async base64 => {
      const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
      return [480, 960].map(width => {
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = Math.round(width / 1.6);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        return { width, data: canvas.toDataURL('image/webp', 0.84).split(',')[1] };
      });
    }, png.toString('base64'));
    for (const { width, data } of images) await writeFile(`assets/moonbounce-preview-${width}.webp`, Buffer.from(data, 'base64'));
    await page.close(); console.log('Captured the real Moonbounce scene for both responsive hub previews.');
  } else {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    let page = await context.newPage(); monitor(page, 'desktop: ');
    await page.goto(`${baseURL}/moonbounce.html?debug=1&seed=82941`); await ready(page);
    assert.ok(await page.locator('[data-action=start]').isVisible());
    await page.locator('[data-action=help]').click();
    assert.ok((await page.locator('#gamePanel').textContent()).includes('Lift your finger'));
    await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'helpBack');
    await page.keyboard.press('Enter'); await page.locator('[data-action=start]').click();
    await page.keyboard.down('KeyD'); await page.waitForTimeout(350); await page.keyboard.up('KeyD');
    assert.ok(await page.evaluate(() => window.__moonbounce.game.state.player.x > 0.3), 'keyboard movement uses the real player input');
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => window.__moonbounce.game.state.bursts), 1, 'Space launches a held orbit');
    await page.locator('#pauseButton').click(); await page.waitForTimeout(70);
    const paused = await page.evaluate(() => ({ tick: window.__moonbounce.game.state.ticks, frame: window.__moonbounce.renderCount }));
    await page.waitForTimeout(260);
    assert.deepEqual(await page.evaluate(() => ({ tick: window.__moonbounce.game.state.ticks, frame: window.__moonbounce.renderCount })), paused, 'pause stops the clock and GPU');
    await page.locator('[data-action=help]').click(); await page.locator('[data-action=helpBack]').click();
    assert.equal(await page.evaluate(() => window.__moonbounce.game.state.mode), 'paused', 'help returns to pause');
    await page.locator('[data-action=resume]').click();
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal(await page.evaluate(() => window.__moonbounce.game.state.mode), 'paused', 'losing focus pauses the run');
    await page.locator('[data-action=resume]').click();
    // Headless Chromium keeps every tab visible, so model the browser's
    // visibility transition while exercising the real document event handler.
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
      delete document.hidden;
    });
    assert.equal(await page.evaluate(() => window.__moonbounce.game.state.mode), 'paused', 'backgrounding pauses the run');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('games:save:moonbounce')).data.mode), 'paused', 'backgrounding saves the run');
    await page.locator('[data-action=resume]').click();
    await page.evaluate(() => {
      const extension = window.__moonbounce.view.renderer.getContext().getExtension('WEBGL_lose_context');
      window.__restorePicture = () => extension.restoreContext(); extension.loseContext();
    });
    await page.waitForFunction(() => window.__moonbounce.game.state.mode === 'paused');
    await page.waitForTimeout(250); await page.evaluate(() => window.__restorePicture());
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('READY TO BOUNCE AGAIN'));
    await page.locator('[data-action=resume]').click();
    const orbitCount = await page.evaluate(source => {
      const api = window.__moonbounce; api.setRealtime(false); api.start();
      const count = (0, eval)(`(${source})`)(api.game); api.refresh(); return count;
    }, gatherSixMoons.toString());
    assert.ok(orbitCount >= 6, 'ordinary movement gathers a six-moon orbit');
    await page.locator('#launchButton').click();
    const storm = await page.evaluate(() => ({ shots: window.__moonbounce.game.state.shots, bursts: window.__moonbounce.game.state.bursts, feedback: document.getElementById('toast').textContent }));
    assert.equal(storm.bursts, 1); assert.ok(storm.shots.length >= 6 && storm.shots.every(shot => shot.storm && shot.damage === 3 && shot.bounces === 2), 'launching six moons rewards a stronger Moonstorm');
    assert.ok(storm.feedback.includes('MOONSTORM'), 'the player sees the Moonstorm feedback');
    await page.locator('#pauseButton').click();
    const stormCheckpoint = await page.evaluate(() => JSON.parse(localStorage.getItem('games:save:moonbounce')).data);
    await page.reload(); await ready(page); await page.evaluate(() => window.__moonbounce.setRealtime(false));
    await page.locator('[data-action=continue]').click();
    assert.deepEqual(await page.evaluate(() => window.__moonbounce.game.state.shots), stormCheckpoint.shots, 'an in-flight Moonstorm survives reloading and continuing');
    await page.evaluate(() => { window.__moonbounce.setRealtime(false); window.__moonbounce.start(); });
    await installPilot(page);
    assert.equal((await finishWave(page)).mode, 'upgrade', 'a legal player completes wave one');
    assert.equal(await page.locator('[data-upgrade]').count(), 3);
    const upgradeSave = await page.evaluate(() => JSON.parse(localStorage.getItem('games:save:moonbounce')).data);
    const otherSave = await page.evaluate(async () => {
      const { createBorrowed } = await import('./borrowed-game.js');
      const { writeGameSave } = await import('./save-store.js?v3');
      const other = createBorrowed(); other.start(); assertNoop(writeGameSave('borrowed', other.snapshot()));
      return localStorage.getItem('games:save:borrowed');
      function assertNoop(value) { if (!value) throw new Error('Could not create independent saved run'); }
    });
    await page.close(); page = await context.newPage(); monitor(page, 'reopened: ');
    await page.goto(`${baseURL}/moonbounce.html?debug=1&seed=82941`); await ready(page);
    assert.ok(await page.locator('[data-action=continue]').isVisible()); await page.locator('[data-action=continue]').click();
    assert.equal(await page.evaluate(() => window.__moonbounce.game.state.mode), 'upgrade');
    assert.deepEqual(await page.evaluate(() => window.__moonbounce.game.state.choices), upgradeSave.choices, 'upgrade options survive closing the page');
    await page.locator('[data-upgrade]').first().click();
    assert.equal(await page.evaluate(() => window.__moonbounce.game.state.wave), 2);
    assert.equal(await page.evaluate(() => localStorage.getItem('games:save:borrowed')), otherSave, 'choosing an upgrade preserves the other game save');
    await installPilot(page);
    for (let wave = 2; wave <= 5; wave++) {
      const outcome = await finishWave(page); reports.push(outcome);
      assert.equal(outcome.mode, wave === 5 ? 'won' : 'upgrade', `legal browser pilot wins wave ${wave}`);
      if (wave < 5) await page.locator('[data-upgrade]').first().click();
    }
    assert.ok(await page.locator('#panelTitle').textContent().then(text => text.includes('moon party')));
    const result = await page.evaluate(() => ({ score: window.__moonbounce.game.state.score, profile: window.__moonbounce.profile, saved: JSON.parse(localStorage.getItem('games:save:moonbounce')).data }));
    assert.equal(result.profile.best, result.score); assert.equal(result.profile.victories, 1); assert.equal(result.saved.mode, 'won');
    assert.ok(result.saved.bossDefeated && result.score > 0);
    await page.screenshot({ path: 'test-results/moonbounce/won.png' });
    const resources = await page.evaluate(() => {
      const { game, view } = window.__moonbounce, crowd = structuredClone(game.state);
      crowd.mode = 'playing'; crowd.enemies = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, type: ['drifter', 'dasher', 'shooter', 'boss'][i % 4], x: Math.sin(i) * 6, z: Math.cos(i) * 6, age: 2, radius: i % 4 === 3 ? 1.15 : 0.4, hit: i % 5 === 0 ? 0.1 : 0 }));
      crowd.moons = Array.from({ length: 80 }, (_, i) => ({ id: i + 100, x: Math.sin(i * 2) * 5, z: Math.cos(i * 2) * 5 }));
      crowd.orbits = Array.from({ length: 22 }, (_, i) => ({ id: i + 200, x: Math.sin(i) * 1.2, z: Math.cos(i) * 1.2 }));
      crowd.shots = Array.from({ length: 96 }, (_, i) => ({ id: i + 300, x: Math.sin(i) * 6, z: Math.cos(i) * 6, dx: 3, dz: 4 }));
      crowd.bullets = Array.from({ length: 80 }, (_, i) => ({ id: i + 500, x: Math.sin(i) * 6.5, z: Math.cos(i) * 6.5 }));
      crowd.effects = Array.from({ length: 80 }, (_, i) => ({ id: i + 600, x: Math.sin(i) * 5, z: Math.cos(i) * 5, type: 'kill', age: 0.3, duration: 0.7 }));
      view.render(crowd, 3); const memory = JSON.stringify(view.renderer.info.memory);
      for (let i = 0; i < 20; i++) view.render(crowd, 3 + i / 30);
      return { calls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles, stable: memory === JSON.stringify(view.renderer.info.memory) };
    });
    assert.ok(resources.calls <= 100 && resources.stable, `full arena uses a bounded and reused renderer (${resources.calls} calls)`); reports.push({ resources });
    await page.goto(`${baseURL}/`);
    assert.equal(await page.locator('.game-card').count(), 6);
    assert.equal(await page.locator('.moonbounce-card').count(), 0, 'Moonbounce is now part of Wonderwake');
    assert.equal(await page.locator('.borrowed-card [data-play-label]').textContent(), 'CONTINUE RUN');
    // The original engine remains testable without presenting a seventh homepage game.
    await page.goto(`${baseURL}/moonbounce.html?continue=1`); await ready(page);
    assert.ok((await page.locator('#panelTitle').textContent()).includes('moon party'));
    assert.equal(await page.evaluate(() => window.__moonbounce?.profile?.victories ?? JSON.parse(localStorage.getItem('games:moonbounce:progress')).victories), 1, 'reopening a win does not count it twice');
    assert.equal(await page.evaluate(() => localStorage.getItem('games:save:borrowed')), otherSave);
    await context.close();

    const phones = [
      { width: 320, height: 568, dpr: 2 }, { width: 360, height: 640, dpr: 2 },
      { width: 390, height: 844, dpr: 3, insets: { top: 47, bottom: 34 } }, { width: 430, height: 932, dpr: 3 },
      { width: 667, height: 375, dpr: 2 }, { width: 844, height: 390, dpr: 3, insets: { left: 47, right: 47, bottom: 21 } }, { width: 932, height: 430, dpr: 3 },
    ];
    for (const spec of phones) {
      const label = `${spec.width}x${spec.height}`;
      const phone = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, isMobile: true, hasTouch: true, deviceScaleFactor: spec.dpr });
      let page = await phone.newPage(); monitor(page, `${label}: `); let cdp = await phone.newCDPSession(page);
      if (spec.insets) await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: spec.insets });
      await page.goto(`${baseURL}/moonbounce.html?debug=1&seed=82941`); await ready(page);
      const start = await page.locator('[data-action=start]').boundingBox();
      assert.ok(start.y + start.height <= spec.height - (spec.insets?.bottom || 0), `${label}: start is visible without scrolling`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: no horizontal overflow`);
      await page.screenshot({ path: `test-results/moonbounce/${label}-intro.png` });
      await page.locator('[data-action=start]').tap();
      const controls = await page.locator('.topbar a,.topbar button,#launchButton').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { name: node.id || node.className, x: r.x, y: r.y, w: r.width, h: r.height }; }));
      for (const r of controls) {
        assert.ok(r.w >= 43.5 && r.h >= 43.5, `${label}: ${r.name} has a 44px touch target (${r.w}×${r.h})`);
        assert.ok(r.x >= (spec.insets?.left || 0) && r.x + r.w <= spec.width - (spec.insets?.right || 0) + 1, `${label}: ${r.name} clears side insets`);
        assert.ok(r.y >= (spec.insets?.top || 0) && r.y + r.h <= spec.height - (spec.insets?.bottom || 0) + 1, `${label}: ${r.name} clears top and bottom insets`);
      }
      const stage = await page.locator('#gameStage').boundingBox();
      const finger = { x: stage.x + stage.width * 0.43, y: stage.y + stage.height * 0.55, id: 1 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...finger, x: finger.x + 28 }] });
      await page.waitForTimeout(350);
      const dragged = await page.evaluate(() => ({ x: window.__moonbounce.game.state.player.x, input: window.__moonbounce.input, bursts: window.__moonbounce.game.state.bursts }));
      assert.ok(dragged.x > 0.25 && dragged.input.x > 0.5 && dragged.bursts === 0, `${label}: one finger steers without launching early`);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      assert.equal(await page.evaluate(() => window.__moonbounce.game.state.bursts), 1, `${label}: lifting launches the moons`);
      assert.ok(await page.evaluate(() => window.__moonbounce.input.x === 0 && window.__moonbounce.input.z === 0));
      await page.evaluate(() => window.__moonbounce.start());
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...finger, x: finger.x + 24 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      assert.ok(await page.evaluate(() => window.__moonbounce.input.x === 0 && window.__moonbounce.input.z === 0 && window.__moonbounce.game.state.bursts === 0), `${label}: cancelled input does not accidentally launch`);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...finger, x: finger.x + 24 }] });
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: {} });
      const rotated = spec.width < spec.height ? { width: 844, height: 390 } : { width: 390, height: 844 };
      await page.setViewportSize(rotated); await page.waitForTimeout(150);
      assert.ok(await page.evaluate(() => window.__moonbounce.input.x === 0 && window.__moonbounce.input.z === 0 && window.__moonbounce.game.state.bursts === 0), `${label}: rotating releases held input without firing`);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      assert.equal(await page.evaluate(() => window.__moonbounce.game.state.bursts), 0, `${label}: lifting after rotation does not fire`);
      await page.evaluate(() => { const api = window.__moonbounce; api.setRealtime(false); api.advance(1, { x: 0.5, z: -0.2 }); api.save(); });
      const checkpoint = await page.evaluate(() => JSON.parse(localStorage.getItem('games:save:moonbounce')).data);
      const stats = await page.evaluate(() => { const { renderer } = window.__moonbounce.view; return { calls: renderer.info.render.calls, pixels: renderer.domElement.width * renderer.domElement.height, antialias: renderer.getContext().getContextAttributes().antialias }; });
      assert.ok(stats.calls < 100 && stats.pixels <= 421000 && !stats.antialias, `${label}: phone rendering budget`);
      await page.close();
      page = await phone.newPage(); monitor(page, `${label} reopened: `); cdp = await phone.newCDPSession(page);
      if (spec.insets) await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: spec.insets });
      await page.goto(`${baseURL}/moonbounce.html?debug=1&seed=82941`); await ready(page);
      const resume = await page.locator('[data-action=continue]').boundingBox();
      assert.ok(resume.y + resume.height <= spec.height - (spec.insets?.bottom || 0), `${label}: Continue is visible without scrolling`);
      await page.locator('[data-action=continue]').tap(); await page.evaluate(() => window.__moonbounce.setRealtime(false));
      const restored = await page.evaluate(() => window.__moonbounce.game.snapshot());
      assert.equal(restored.wave, checkpoint.wave); assert.equal(restored.player.x, checkpoint.player.x); assert.deepEqual(restored.orbits, checkpoint.orbits);
      assert.ok(await page.evaluate(() => !window.__moonbounce.input.x && !window.__moonbounce.input.z), `${label}: resuming does not restore a held finger`);
      await page.screenshot({ path: `test-results/moonbounce/${label}-game.png` });
      await installPilot(page);
      assert.equal((await finishWave(page)).mode, 'upgrade', `${label}: a legal run reaches its upgrade choices`);
      const choices = await page.locator('[data-upgrade]').evaluateAll(nodes => nodes.map(node => {
        const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height };
      }));
      assert.equal(choices.length, 3);
      for (const r of choices) {
        assert.ok(r.w >= 43.5 && r.h >= 43.5, `${label}: upgrade choices have 44px touch targets`);
        assert.ok(r.x >= (spec.insets?.left || 0) && r.x + r.w <= spec.width - (spec.insets?.right || 0) + 1
          && r.y >= (spec.insets?.top || 0) && r.y + r.h <= spec.height - (spec.insets?.bottom || 0) + 1, `${label}: upgrade choices fit inside the safe area`);
      }
      await page.locator('[data-upgrade]').first().tap();
      assert.equal(await page.evaluate(() => window.__moonbounce.game.state.wave), 2, `${label}: choosing a power starts the next wave`);
      if (spec.width === 320 || spec.width === 844) {
        await page.locator('.home-button').tap();
        assert.equal(await page.locator('.game-card').count(), 6);
        assert.equal(await page.locator('.wonderwake-card').count(), 1);
        await page.goto(`${baseURL}/moonbounce.html?continue=1`); await ready(page);
        assert.equal(new URL(page.url()).searchParams.get('continue'), '1', `${label}: the preserved engine continues its saved run`);
        assert.ok(await page.locator('#modalLayer').isHidden());
        assert.ok((await page.locator('#waveLabel').textContent()).includes('WAVE 2'));
      }
      reports.push({ phone: label, ...stats }); await phone.close();
    }
    for (const scenario of ['corrupt', 'blocked']) {
      const context = await browser.newContext(), page = await context.newPage(); monitor(page, `${scenario}: `);
      await page.addInitScript(scenario => {
        if (scenario === 'blocked') Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new Error('Device storage unavailable'); };
        else localStorage.setItem('games:save:moonbounce', JSON.stringify({ version: 1, savedAt: Date.now(), data: { schema: 1, wave: 99, mode: 'playing' } }));
      }, scenario);
      await page.goto(`${baseURL}/moonbounce.html?debug=1&seed=82941&continue=1`); await ready(page);
      assert.equal(await page.locator('[data-action=continue]').count(), 0, `${scenario}: invalid checkpoint is ignored`);
      await page.locator('[data-action=start]').click(); assert.equal(await page.evaluate(() => window.__moonbounce.game.state.mode), 'playing');
      if (scenario === 'blocked') assert.ok((await page.locator('#saveStatus').textContent()).includes('UNAVAILABLE'));
      await context.close();
    }
    {
      const context = await browser.newContext(), page = await context.newPage(); monitor(page, 'new seeds: ');
      await page.goto(`${baseURL}/moonbounce.html?debug=1`); await ready(page);
      const seeds = await page.evaluate(() => {
        const api = window.__moonbounce; api.setRealtime(false);
        const values = [];
        for (let i = 0; i < 3; i++) { api.start(); values.push(api.game.state.seed); }
        return values;
      });
      assert.ok(new Set(seeds).size > 1, 'new unseeded games do not always replay the same layout');
      await context.close();
    }
    assert.deepEqual(external, [], 'the new game makes no external requests');
    await writeFile('test-results/moonbounce/results.json', JSON.stringify(reports, null, 2) + '\n');
    console.log(JSON.stringify(reports, null, 2));
  }
  assert.deepEqual(errors, [], 'no JavaScript errors or failed resources');
} finally { await browser?.close(); server?.kill('SIGTERM'); }
