import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

const base = process.env.GAMES_TEST_URL || 'http://127.0.0.1:5198';
let server, browser;
const errors = [], games = ['prism', 'ribbon', 'dewfall'];
const specs = [
  { width: 320, height: 568, insets: {} },
  { width: 390, height: 844, insets: { top: 47, bottom: 34 } },
  { width: 568, height: 320, insets: { left: 47, right: 47, bottom: 21 } },
];
function watch(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
}
try {
  if (!process.env.GAMES_TEST_URL) {
    server = spawn(process.execPath, ['scripts/serve.mjs', '--port', '5198'], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', code => reject(Error(`Server exited ${code}`))); });
  }
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  await mkdir('test-results/collection', { recursive: true });
  for (const spec of specs) {
    const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await context.newPage(); watch(page);
    await (await context.newCDPSession(page)).send('Emulation.setSafeAreaInsetsOverride', { insets: spec.insets });
    await page.goto(base);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('.quick-play a').count(), 9);
    for (const link of await page.locator('.quick-play a').all()) {
      const r = await link.boundingBox();
      assert.ok(r.width >= 44 && r.height >= 44, 'quick links have 44px touch targets');
      assert.ok(r.x >= (spec.insets.left || 0) && r.x + r.width <= spec.width - (spec.insets.right || 0) + 1, 'quick links clear the notch');
      assert.ok(r.y + r.height <= spec.height - (spec.insets.bottom || 0), 'all nine games are available above the fold');
    }
    for (const slug of games) {
      await page.goto(`${base}/${slug}.html?debug=1`);
      await page.waitForFunction(() => document.body.dataset.ready === 'true');
      await page.evaluate(() => document.fonts.ready);
      await page.locator('button[data-action="start"]').tap();
      await page.evaluate(slug => window[`__${slug}`].setRealtime(false), slug);
      const targets = await page.locator('button, a').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length && !node.closest('[hidden]')).map(node => {
        const r = node.getBoundingClientRect(); return { text: node.textContent.trim(), x: r.x, y: r.y, width: r.width, height: r.height };
      }));
      for (const target of targets) {
        assert.ok(target.width >= 43.5 && target.height >= 43.5, `${slug} ${spec.width}: small target ${JSON.stringify(target)}`);
        assert.ok(target.x >= (spec.insets.left || 0) && target.x + target.width <= spec.width - (spec.insets.right || 0) + 1, `${slug}: control overlaps notch`);
        assert.ok(target.y >= (spec.insets.top || 0) - 1 && target.y + target.height <= spec.height - (spec.insets.bottom || 0) + 1, `${slug}: control outside usable screen`);
      }
      const stage = await page.locator('#gameStage').boundingBox();
      // Status changes during an ongoing gesture must not resize the canvas and cancel it.
      await page.evaluate(slug => {
        const api = window[`__${slug}`];
        if (slug === 'ribbon') api.game.state.combo = 12;
        if (slug === 'dewfall') api.game.beginTilt();
        if (slug === 'prism') api.game.hint();
        api.refresh();
      }, slug);
      assert.deepEqual(await page.locator('#gameStage').boundingBox(), stage, `${slug}: changing instructions must keep the stage stable`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), `${slug}: viewport overflow`);
      await page.screenshot({ path: `test-results/collection/${slug}-${spec.width}.png` });
    }
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); watch(page);
  for (const slug of games) {
    await page.goto(`${base}/${slug}.html?debug=1`);
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
    await page.evaluate(slug => {
      const api = window[`__${slug}`]; api.setRealtime(false); api.start(2);
      if (slug === 'prism') api.game.rotate(0);
      if (slug === 'ribbon') { api.game.steer(1, .2); api.advance(.5); }
      if (slug === 'dewfall') api.advance(.5, { x: .1, z: -.3 });
      api.save();
    }, slug);
  }
  for (const slug of games) {
    await page.goto(base);
    assert.equal(await page.locator('.game-card').count(), 9);
    assert.equal(await page.locator(`.${slug}-card [data-play-label]`).textContent(), 'CONTINUE RUN');
    await page.locator(`.quick-play [data-game-link="${slug}"]`).tap();
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
    assert.ok(page.url().includes('continue=1'));
    assert.match(await page.locator('#levelLabel').textContent(), /02/);
    for (const dialog of await page.locator('[role="dialog"]').all()) assert.equal(await dialog.isVisible(), false, `${slug}: the hub resumes play directly`);
    assert.equal(await page.evaluate(slug => `__${slug}` in window), false, 'normal navigation does not expose debug controls');
  }
  await page.goto(base);
  for (const card of await page.locator('.game-card').all()) await card.scrollIntoViewIfNeeded();
  const previews = await page.locator('.game-art img').evaluateAll(async images => { await Promise.all(images.map(image => image.decode())); return images.map(image => ({ width: image.naturalWidth, source: image.currentSrc })); });
  // naturalWidth is density-corrected when srcset uses width descriptors.
  assert.equal(previews.length, 9); assert.ok(previews.every(image => image.width > 0 && /-preview-(480|960)\.webp$/.test(image.source)));
  await context.close();
  assert.deepEqual(errors, []);
  console.log('Collection: nine previews, independent Continue links, and all new games on small/notched phones passed.');
} finally { await browser?.close(); if (server) server.kill(); }
