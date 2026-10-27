import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createWeaver } from './borrowed-autoplay.mjs';

const port = 5184, baseURL = process.env.GAMES_TEST_URL || `http://127.0.0.1:${port}`;
const server = process.env.GAMES_TEST_URL ? null : spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
const errors = [], external = [], reports = [];
let browser;
const ready = async page => { await page.waitForFunction(() => document.body.dataset.ready === 'true'); await page.evaluate(() => document.fonts.ready); };
function monitor(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(baseURL)) external.push(request.url()); });
}
async function installPlayer(page) {
  await page.evaluate(async source => {
    const math = { ...await import('./borrowed-game.js'), ...await import('./borrowed-levels.js') };
    window.__playBorrowed = (0, eval)(`(${source})`)(window.__borrowed.game, math);
  }, createWeaver.toString());
}
async function finishRoom(page) {
  await installPlayer(page);
  return page.evaluate(() => {
    const api = window.__borrowed; api.setRealtime(false);
    for (let i = 0; i < 60 * 240 && ['playing', 'between'].includes(api.game.state.mode); i++) window.__playBorrowed();
    api.refresh(); return { mode: api.game.state.mode, level: api.game.state.level, loop: api.game.state.loop, hp: api.game.state.hp, score: api.game.state.score };
  });
}
try {
  if (server) await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Time-sail server did not start')), 10000);
    server.stdout.once('data', () => { clearTimeout(timeout); resolve(); }); server.once('error', reject);
  });
  await mkdir('test-results/borrowed', { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--enable-unsafe-swiftshader'] });
  if (process.argv.includes('--capture-art')) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 850 }, deviceScaleFactor: 1 }); monitor(page);
    await page.goto(`${baseURL}/borrowed.html?debug=1&level=5`); await ready(page);
    await page.locator('[data-action=start]').click(); await page.evaluate(() => window.__borrowed.setRealtime(false)); await installPlayer(page);
    await page.evaluate(() => {
      const api = window.__borrowed;
      for (let i = 0; i < 60 * 120 && api.game.state.mode !== 'won'; i++) { window.__playBorrowed(); if (api.game.state.loop >= 3 && api.game.state.loopTicks >= 45) break; }
      api.refresh();
    });
    await page.addStyleTag({ content: '.topbar,.hud,.bloom-strip,.control-deck,.save-status,.hint,.toast,.sail-readout,.boss-health{display:none!important}.clock-shell,.game-shell{height:625px;flex:none}.stage{height:625px;flex:none;width:1000px}.world-label{font-size:9px}.flower-label{font-size:17px}' });
    await page.waitForTimeout(150);
    const png = await page.locator('#timeStage').screenshot({ path: 'test-results/borrowed/preview.png' });
    const images = await page.evaluate(async base64 => {
      const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
      return [480, 960].map(width => { const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = Math.round(width / 1.6); canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); return { width, data: canvas.toDataURL('image/webp', 0.84).split(',')[1] }; });
    }, png.toString('base64'));
    for (const { width, data } of images) await writeFile(`assets/borrowed-preview-${width}.webp`, Buffer.from(data, 'base64'));
    await page.close(); console.log('Captured the real time sail and its two recorded routes for the game card.');
  } else {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    let page = await context.newPage(); monitor(page);
    await page.goto(`${baseURL}/borrowed.html?debug=1`); await ready(page);
    assert.equal(await page.locator('[data-room]').count(), 0);
    await page.locator('[data-action=rooms]').click(); assert.equal(await page.locator('[data-room]').count(), 6);
    await page.locator('[data-room="1"]').click();
    await page.locator('[data-action=help]').click(); await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'helpBack', 'dialog keyboard focus stays in help');
    await page.keyboard.press('Enter'); await page.locator('[data-action=start]').click();
    await page.keyboard.down('Space'); await page.keyboard.down('KeyD'); await page.waitForTimeout(430); await page.keyboard.up('KeyD');
    const moved = await page.evaluate(() => ({ x: window.__borrowed.game.state.player.x, snaps: window.__borrowed.game.state.snaps }));
    assert.ok(moved.x > 0.3 && moved.snaps >= 1, 'actual keyboard movement and hold-to-snap work together');
    await page.keyboard.up('Space');
    await page.evaluate(() => { window.__borrowed.setRealtime(false); window.__borrowed.advance(2, { pulse: true }); window.__borrowed.advance(1, { pulse: true }); });
    await page.locator('#bankButton').click(); assert.ok(await page.locator('[data-action=nextLoop]').isVisible()); assert.ok(await page.locator('.memory-picture').isVisible());
    await page.locator('[data-action=nextLoop]').click();
    assert.equal(await page.evaluate(() => window.__borrowed.game.state.loop), 2);
    await page.locator('#borrowButton').click({ trial: true });
    await page.keyboard.press('KeyQ');
    assert.ok(await page.evaluate(() => window.__borrowed.game.state.borrowCooldown > 5.9 && window.__borrowed.game.state.area < 0.01), 'borrowing jumps to an echo and folds the sail');
    await page.evaluate(() => { window.__borrowed.advance(1, { z: 0.5, pulse: true }); window.__borrowed.save(); });
    const checkpoint = await page.evaluate(() => JSON.parse(localStorage.getItem('games:save:borrowed')).data);
    await page.close(); page = await context.newPage(); monitor(page);
    await page.goto(`${baseURL}/borrowed.html?debug=1`); await ready(page);
    assert.ok(await page.locator('[data-action=continue]').isVisible());
    await page.locator('[data-action=continue]').click(); await page.evaluate(() => window.__borrowed.setRealtime(false));
    const restored = await page.evaluate(() => window.__borrowed.game.snapshot());
    assert.equal(restored.loop, checkpoint.loop); assert.deepEqual(restored.memories, checkpoint.memories); assert.equal(restored.beats, checkpoint.beats); assert.equal(restored.hp, checkpoint.hp);
    assert.equal(restored.recording.filter(p => p[3]).length, 1, 'the borrow jump survives closing the page');
    await page.locator('#pauseButton').click();
    await page.waitForTimeout(70);
    const frozen = await page.evaluate(() => ({ tick: window.__borrowed.game.state.ticks, frames: window.__borrowed.renderCount }));
    await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(() => ({ tick: window.__borrowed.game.state.ticks, frames: window.__borrowed.renderCount })), frozen, 'pause stops the clock and GPU');
    await page.locator('[data-action=resume]').click();
    await page.evaluate(() => { const ext = window.__borrowed.view.renderer.getContext().getExtension('WEBGL_lose_context'); window.__restorePicture = () => ext.restoreContext(); ext.loseContext(); });
    await page.waitForFunction(() => window.__borrowed.game.state.mode === 'paused');
    await page.waitForTimeout(250); await page.evaluate(() => window.__restorePicture());
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('garden is back'));
    await page.locator('[data-action=resume]').click();
    await page.evaluate(() => window.__borrowed.start(1));
    assert.equal((await finishRoom(page)).mode, 'won');
    assert.ok(await page.locator('[data-action=nextChamber]').isVisible());
    assert.ok(await page.evaluate(() => window.__borrowed.profile.records[1].stars >= 1));
    await page.locator('[data-action=nextChamber]').click(); assert.equal(await page.evaluate(() => window.__borrowed.game.state.level), 2);
    for (let level = 2; level <= 6; level++) {
      const result = await finishRoom(page); assert.equal(result.mode, 'won', `actual browser chamber ${level} can be completed`); reports.push(result);
      await page.screenshot({ path: `test-results/borrowed/chamber-${level}-won.png` });
      if (level < 6) await page.locator('[data-action=nextChamber]').click();
    }
    const resources = await page.evaluate(() => {
      const { game, view } = window.__borrowed, crowd = structuredClone(game.state);
      crowd.mode = 'playing'; crowd.enemies = Array.from({ length: 36 }, (_, i) => ({ id: i + 1, type: ['mote','hunter','sentry','armor'][i % 4], x: Math.sin(i) * 6, z: Math.cos(i) * 6, age: 3, angle: i, hit: 0 }));
      crowd.bullets = Array.from({ length: 96 }, (_, i) => ({ x: Math.sin(i * 2) * 7, z: Math.cos(i * 2) * 7 }));
      crowd.effects = Array.from({ length: 72 }, (_, i) => ({ id: i, type: 'catch', x: Math.sin(i) * 5, z: Math.cos(i) * 5, strength: 3, age: 0.3 }));
      view.render(crowd, 4); const memory = JSON.stringify(view.renderer.info.memory);
      for (let i = 0; i < 30; i++) view.render(crowd, 4 + i / 30);
      return { calls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles, stable: memory === JSON.stringify(view.renderer.info.memory) };
    });
    assert.ok(resources.calls <= 100 && resources.stable, 'a full arena stays bounded and reuses its geometry'); reports.push({ resources });
    await page.goto(`${baseURL}/`);
    assert.equal(await page.locator('.game-card').count(), 6);
    assert.equal(await page.locator('.borrowed-card [data-play-label]').textContent(), 'CONTINUE RUN');
    await page.locator('.borrowed-card').click(); await ready(page); assert.ok(await page.locator('[data-action=choose]').isVisible(), 'hub resumes the completed final chamber');
    await context.close();

    const phones = [
      { width: 320, height: 568, dpr: 2 }, { width: 360, height: 640, dpr: 2 },
      { width: 390, height: 844, dpr: 3, insets: { top: 47, bottom: 34 } }, { width: 430, height: 932, dpr: 3 },
      { width: 667, height: 375, dpr: 2 }, { width: 844, height: 390, dpr: 3, insets: { left: 47, right: 47, bottom: 21 } }, { width: 932, height: 430, dpr: 3 },
    ];
    for (const spec of phones) {
      const label = `${spec.width}x${spec.height}`, phone = await browser.newContext({ viewport: spec, isMobile: true, hasTouch: true, deviceScaleFactor: spec.dpr });
      const page = await phone.newPage(); monitor(page); const cdp = await phone.newCDPSession(page);
      if (spec.insets) await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: spec.insets });
      await page.goto(`${baseURL}/borrowed.html?debug=1`); await ready(page);
      const start = await page.locator('[data-action=start]').boundingBox();
      assert.ok(start.y + start.height <= spec.height - (spec.insets?.bottom || 0), `${label}: start is visible without scrolling`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: no horizontal overflow`);
      await page.screenshot({ path: `test-results/borrowed/${label}-intro.png` });
      await page.locator('[data-action=start]').tap();
      const controls = await page.locator('.topbar a,.topbar button,.control-deck button,#joystick').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { name: node.id || 'back', x: r.x, y: r.y, w: r.width, h: r.height }; }));
      for (const r of controls) {
        assert.ok(r.w >= 43.5 && r.h >= 43.5, `${label}: ${r.name} has a 44px touch target`);
        assert.ok(r.x >= (spec.insets?.left || 0) && r.x + r.w <= spec.width - (spec.insets?.right || 0) + 1, `${label}: ${r.name} clears side insets`);
        assert.ok(r.y >= (spec.insets?.top || 0) && r.y + r.h <= spec.height - (spec.insets?.bottom || 0) + 1, `${label}: ${r.name} clears top and bottom insets`);
      }
      const stick = await page.locator('#joystick').boundingBox(), snap = await page.locator('#snapButton').boundingBox();
      const left = { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2, id: 1 }, right = { x: snap.x + snap.width / 2, y: snap.y + snap.height / 2, id: 2 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left, right] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...left, x: left.x + 26 }, right] });
      await page.waitForTimeout(330);
      const held = await page.evaluate(() => ({ x: window.__borrowed.game.state.player.x, input: window.__borrowed.input, snaps: window.__borrowed.game.state.snaps }));
      assert.ok(held.x > 0.2 && held.input.x > 0.5 && held.input.pulse && held.snaps >= 1, `${label}: both thumbs work simultaneously`);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      assert.ok(await page.evaluate(() => { const input = window.__borrowed.input; return input.x === 0 && !input.pulse; }), `${label}: cancelled touches release all held input`);
      await page.locator('#dashButton').tap();
      await page.locator('#pauseButton').tap();
      await page.waitForTimeout(60);
      const paused = await page.evaluate(() => ({ tick: window.__borrowed.game.state.ticks, frame: window.__borrowed.renderCount }));
      await page.waitForTimeout(200); assert.deepEqual(await page.evaluate(() => ({ tick: window.__borrowed.game.state.ticks, frame: window.__borrowed.renderCount })), paused);
      await page.locator('[data-action=resume]').tap(); await page.evaluate(() => window.__borrowed.setRealtime(false));
      const stats = await page.evaluate(() => { const { renderer } = window.__borrowed.view; return { calls: renderer.info.render.calls, pixels: renderer.domElement.width * renderer.domElement.height, antialias: renderer.getContext().getContextAttributes().antialias }; });
      assert.ok(stats.calls < 100 && stats.pixels <= 421000 && !stats.antialias, `${label}: phone rendering budget`);
      await page.screenshot({ path: `test-results/borrowed/${label}-game.png` });
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: {} });
      const before = await page.evaluate(() => window.__borrowed.game.snapshot());
      await page.setViewportSize(spec.width < spec.height ? { width: 844, height: 390 } : { width: 390, height: 844 }); await page.waitForTimeout(100);
      assert.deepEqual(await page.evaluate(() => window.__borrowed.game.snapshot()), before, `${label}: rotating preserves the run`);
      await page.evaluate(() => { window.__borrowed.advance(1, { pulse: true }); window.__borrowed.advance(1, { pulse: true }); });
      await page.locator('#bankButton').tap();
      if (spec.width !== 320) await page.locator('[data-action=nextLoop]').tap();
      assert.equal(await page.evaluate(() => window.__borrowed.game.state.memories.length), 1);
      const memory = await page.evaluate(() => window.__borrowed.game.state.memories[0]);
      await page.close();
      const reopened = await phone.newPage(); monitor(reopened);
      if (spec.insets) { const reopenedCDP = await phone.newCDPSession(reopened); await reopenedCDP.send('Emulation.setSafeAreaInsetsOverride', { insets: spec.insets }); }
      await reopened.goto(`${baseURL}/borrowed.html?debug=1`); await ready(reopened);
      const continueButton = await reopened.locator('[data-action=continue]').boundingBox();
      assert.ok(continueButton.y + continueButton.height <= spec.height - (spec.insets?.bottom || 0), `${label}: Continue is visible without scrolling`);
      await reopened.locator('[data-action=continue]').tap();
      if (spec.width === 320) { assert.ok(await reopened.locator('[data-action=nextLoop]').isVisible()); await reopened.locator('[data-action=nextLoop]').tap(); }
      await reopened.evaluate(() => window.__borrowed.setRealtime(false));
      assert.equal(await reopened.evaluate(() => window.__borrowed.game.state.loop), 2);
      assert.deepEqual(await reopened.evaluate(() => window.__borrowed.game.state.memories[0]), memory, `${label}: closing and reopening retains the exact recorded path`);
      assert.ok(await reopened.evaluate(() => !window.__borrowed.input.x && !window.__borrowed.input.z && !window.__borrowed.input.pulse), `${label}: resuming does not restore held buttons`);
      reports.push({ phone: label, ...stats }); await phone.close();
    }
    for (const scenario of ['corrupt', 'blocked']) {
      const context = await browser.newContext(), page = await context.newPage(); monitor(page);
      await page.addInitScript(scenario => {
        if (scenario === 'blocked') { Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new Error('Device storage unavailable'); }; }
        else localStorage.setItem('games:save:borrowed', JSON.stringify({ version: 1, savedAt: Date.now(), data: { schema: 1, level: 99, mode: 'playing' } }));
      }, scenario);
      await page.goto(`${baseURL}/borrowed.html?debug=1&continue=1`); await ready(page);
      assert.equal(await page.locator('[data-action=continue]').count(), 0, `${scenario}: invalid checkpoint is ignored`);
      await page.locator('[data-action=start]').click();
      assert.equal(await page.evaluate(() => window.__borrowed.game.state.mode), 'playing');
      if (scenario === 'blocked') assert.ok((await page.locator('#saveStatus').textContent()).includes('UNAVAILABLE'));
      await context.close();
    }
    assert.deepEqual(external, [], 'the third game does not need a CDN, fonts service or account');
    console.log(JSON.stringify(reports, null, 2));
    await writeFile('test-results/borrowed/results.json', JSON.stringify(reports, null, 2) + '\n');
  }
  assert.deepEqual(errors, [], 'no JavaScript errors or failed resources');
} finally { await browser?.close(); server?.kill('SIGTERM'); }
