import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

const base = process.env.GAMES_TEST_URL || 'http://127.0.0.1:5198';
let server, browser;
const errors = [], games = ['wonderwake', 'soldier', 'garden', 'borrowed', 'prism', 'lantern'];
const specs = [
  { width: 320, height: 568, insets: { top: 47, bottom: 34 } },
  { width: 390, height: 844, insets: { top: 47, bottom: 34 } },
  { width: 568, height: 320, insets: { left: 47, right: 47, bottom: 21 } },
  { width: 1440, height: 1000, insets: {}, desktop: true },
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
    const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, isMobile: !spec.desktop, hasTouch: !spec.desktop, deviceScaleFactor: 2 });
    const page = await context.newPage(); watch(page);
    await (await context.newCDPSession(page)).send('Emulation.setSafeAreaInsetsOverride', { insets: spec.insets });
    await page.goto(base);
    await page.evaluate(() => document.fonts.ready);
    assert.deepEqual(await page.locator('.game-card').evaluateAll(cards => cards.map(card => card.dataset.gameLink)), games);
    assert.equal(await page.locator('.quick-play a').count(), 6);
    assert.equal(await page.locator('.arcade-card').count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'homepage has no horizontal overflow');
    if (!spec.desktop) for (const link of await page.locator('.quick-play a').all()) {
      const r = await link.boundingBox();
      assert.ok(r.width >= 44 && r.height >= 44, 'quick links have 44px touch targets');
      assert.ok(r.x >= (spec.insets.left || 0) && r.x + r.width <= spec.width - (spec.insets.right || 0) + 1, 'quick links clear the notch');
      assert.ok(r.y + r.height <= spec.height - (spec.insets.bottom || 0), 'all six games are available above the fold');
    }
    for (const card of await page.locator('.game-card').all()) {
      await card.scrollIntoViewIfNeeded();
      assert.ok(await card.locator('h3').evaluate(node => node.scrollWidth <= node.clientWidth + 1), 'game titles fit');
    }
    const previews = await page.locator('.game-art img').evaluateAll(async images => {
      await Promise.all(images.map(image => image.decode()));
      return images.map(image => ({ width: image.naturalWidth, source: image.currentSrc }));
    });
    assert.equal(previews.length, 6); assert.ok(previews.every(image => image.width > 0));
    assert.ok(previews[0].source.endsWith('/assets/wonderwake-preview.svg'));
    assert.ok(previews.slice(1).every(image => /-preview-(480|960)\.webp$/.test(new URL(image.source).pathname)));
    assert.equal(await page.locator('canvas').count(), 0, 'homepage loads no 3D renderer');
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: `test-results/collection/six-games-${spec.width}.png`, fullPage: true });
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); watch(page);
  await page.goto(base);
  await page.evaluate(async () => {
    const [{ createPrism }, { createLantern }, { writeGameSave }, { freshProgress, writeProgress }, world] = await Promise.all([
      import('./prism-game.js'), import('./lantern-game.js'), import('./save-store.js?v7'), import('./voyage/progress.js'), fetch('./assets/lantern-world.json').then(response => response.json()),
    ]);
    const prism = createPrism(); prism.start(2); prism.rotate(0);
    const lantern = createLantern({ world }); lantern.start(); lantern.advance(.5, { x: 0, z: -1 });
    if (!writeGameSave('prism', prism.snapshot()) || !writeGameSave('lantern', lantern.snapshot())) throw new Error('Could not save standalone games');
    const voyage = freshProgress(); voyage.completed = ['dewfall', 'dream-duos', 'burrow-banquet']; voyage.chapter = 1;
    if (!writeProgress(voyage)) throw new Error('Could not save the voyage');
    dispatchEvent(new Event('storage'));
  });
  assert.equal(await page.locator('.wonderwake-card [data-play-label]').textContent(), 'CONTINUE THE VOYAGE');
  assert.match(await page.locator('.wonderwake-card .game-save-note').textContent(), /3 \/ 25 FRIENDS/);
  for (const slug of ['prism', 'lantern']) {
    await page.goto(base);
    assert.equal(await page.locator(`.${slug}-card [data-play-label]`).textContent(), 'CONTINUE RUN');
    await page.locator(`.quick-play [data-game-link="${slug}"]`).tap();
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
    assert.ok(page.url().includes('continue=1'));
    for (const dialog of await page.locator('[role="dialog"]').all()) assert.equal(await dialog.isVisible(), false, `${slug}: the hub resumes play directly`);
    assert.equal(await page.evaluate(slug => `__${slug}` in window, slug), false, 'normal navigation does not expose debug controls');
  }
  await page.goto(base);
  assert.match(await page.locator('.wonderwake-card .game-save-note').textContent(), /3 \/ 25 FRIENDS/);
  await context.close();
  assert.deepEqual(errors, []);
  console.log('Collection: six game choices, all previews, independent Continue links, and phone/desktop layouts passed.');
} finally { await browser?.close(); if (server) server.kill(); }
