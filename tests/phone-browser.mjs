import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

export async function checkPhones(browser, baseURL, { baseline = false } = {}) {
  await mkdir('test-results/phone', { recursive: true });
  const errors = [], reports = [];
  const specs = baseline ? [{ width: 390, height: 844, dpr: 3 }] : [
    { width: 320, height: 568, dpr: 2 },
    { width: 360, height: 640, dpr: 2 },
    { width: 390, height: 844, dpr: 3, insets: { top: 47, bottom: 34 } },
    { width: 430, height: 932, dpr: 3 },
    { width: 667, height: 375, dpr: 2 },
    { width: 844, height: 390, dpr: 3, insets: { left: 47, right: 47, bottom: 21 } },
    { width: 932, height: 430, dpr: 3 },
  ];
  for (const spec of specs) {
    const label = `${spec.width}x${spec.height}`;
    const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, deviceScaleFactor: spec.dpr, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') errors.push(`${label}: ${message.text()}`); });
    const cdp = await context.newCDPSession(page);
    if (spec.insets) await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: spec.insets });
    await page.goto(`${baseURL}/`);
    // The fourth card is below Chromium's lazy-load threshold on small phones.
    // Visit it before decoding all previews, then return to the quick links.
    await page.locator('.moonbounce-card').scrollIntoViewIfNeeded();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.querySelectorAll('.game-art img')].map(image => image.decode()));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await page.evaluate(() => scrollTo(0, 0));
    const previews = await page.locator('.game-art img').evaluateAll(images => images.map(image => ({ src: image.currentSrc, width: image.naturalWidth })));
    if (!baseline) {
      assert.ok(previews.every(image => image.src.endsWith('.webp')), `${label}: compressed previews load`);
      assert.ok(await page.locator('.quick-play').isVisible(), `${label}: all games can be opened without scrolling`);
      for (const link of await page.locator('.quick-play a').all()) {
        const bounds = await link.boundingBox();
        assert.ok(bounds.y + bounds.height <= spec.height - (spec.insets?.bottom || 0), `${label}: quick play stays above the phone's bottom inset`);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: hub fits`);
    }
    if (!baseline) await page.screenshot({ path: `test-results/phone/${label}-hub.png`, fullPage: true });
    await page.goto(`${baseURL}/garden.html?debug=1`);
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    const initial = await page.evaluate(() => {
      const { renderer } = window.__garden.view;
      return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, pixels: renderer.domElement.width * renderer.domElement.height, antialias: renderer.getContext().getContextAttributes().antialias };
    });
    if (!baseline) {
      assert.ok(initial.calls <= 100, `${label}: demo stays within 100 draw calls (${initial.calls})`);
      assert.ok(initial.pixels <= 361000, `${label}: pixel budget is bounded (${initial.pixels})`);
      assert.equal(initial.antialias, false, `${label}: mobile avoids multisample rendering`);
      const controls = await page.locator('.garden-nav a, .garden-nav button, .toolbar-actions button, .seed-bank button').evaluateAll(elements => elements.map(element => {
        const r = element.getBoundingClientRect();
        return { label: element.getAttribute('aria-label') || element.textContent.trim(), x: r.x, y: r.y, width: r.width, height: r.height };
      }));
      for (const control of controls) {
        assert.ok(control.width >= 43.5 && control.height >= 43.5, `${label}: ${control.label} has a 44px touch target (${control.width}x${control.height})`);
        assert.ok(control.x >= (spec.insets?.left || 0) && control.x + control.width <= spec.width - (spec.insets?.right || 0) + 1, `${label}: ${control.label} clears the notch`);
        assert.ok(control.y >= (spec.insets?.top || 0), `${label}: ${control.label} clears the top inset`);
      }
    }
    await page.locator('#startBtn').tap();
    await page.locator('.lawn-cell[data-row="0"][data-col="0"]').tap();
    assert.equal(await page.locator('#sunCount').textContent(), '150');
    await page.locator('[data-seed="pea"]').tap();
    await page.locator('.lawn-cell[data-row="2"][data-col="1"]').tap();
    assert.equal(await page.locator('#sunCount').textContent(), '50');
    if (!baseline) {
      const board = await page.locator('#gardenStage').boundingBox();
      assert.ok(board.y + board.height <= spec.height - (spec.insets?.bottom || 0) + 1, `${label}: the complete lawn fits on screen (${board.y + board.height})`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: `test-results/phone/${label}-garden.png`, fullPage: true });
    }
    await page.locator('#pauseBtn').tap();
    await page.waitForTimeout(250);
    const frozen = await page.evaluate(() => ({ time: window.__garden.game.state.time, frame: window.__garden.view.renderer.info.render.frame }));
    await page.waitForTimeout(350);
    const afterPause = await page.evaluate(() => ({ time: window.__garden.game.state.time, frame: window.__garden.view.renderer.info.render.frame }));
    if (!baseline) assert.deepEqual(afterPause, frozen, `${label}: pause stops simulation and GPU rendering`);
    await page.locator('#resumeBtn').tap();
    await page.waitForFunction(time => window.__garden.game.state.time > time, frozen.time);
    if (!baseline) {
      await page.locator('#helpBtn').tap();
      await page.locator('#helpClose').tap();
      await page.waitForFunction(() => window.__garden.game.state.mode === 'playing');
      assert.equal(await page.evaluate(() => window.__garden.game.state.mode), 'playing');
      // Every cell must remain usable after the viewport changes shape.
      const rotated = spec.width < spec.height ? { width: 844, height: 390 } : { width: 390, height: 844 };
      const plantsBefore = await page.evaluate(() => window.__garden.game.state.plants.map(({ type, row, col }) => ({ type, row, col })));
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: {} });
      await page.setViewportSize(rotated);
      await page.waitForTimeout(180);
      assert.deepEqual(await page.evaluate(() => window.__garden.game.state.plants.map(({ type, row, col }) => ({ type, row, col }))), plantsBefore);
      const patch = page.locator('.lawn-cell[data-row="4"][data-col="6"]');
      await page.locator('#shovelBtn').tap();
      await patch.tap();
      assert.ok((await page.locator('#playHint').textContent()).includes('planted patch'), `${label}: rotated hit regions remain aligned`);
    }
    const stress = await page.evaluate(() => {
      const { view } = window.__garden;
      window.__garden.stopRendering();
      const crowd = {
        mode: 'playing', mowers: Array.from({ length: 5 }, (_, row) => ({ id: row, row, x: -0.85 })),
        plants: Array.from({ length: 40 }, (_, id) => ({ id, type: ['bloom', 'pea', 'nut'][id % 3], row: id % 5, col: Math.floor(id / 5), age: 5 })),
        zombies: Array.from({ length: 18 }, (_, id) => ({ id, row: id % 5, x: 5 + (id % 3), age: 5, armored: id % 2 === 0 })),
        peas: [],
      };
      view.render(crowd, 5);
      const without = { calls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles };
      crowd.peas = Array.from({ length: 80 }, (_, id) => ({ id, x: id % 8, row: id % 5 }));
      view.render(crowd, 5);
      return { calls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles, projectileCalls: view.renderer.info.render.calls - without.calls, projectileTriangles: view.renderer.info.render.triangles - without.triangles };
    });
    if (!baseline) {
      assert.ok(stress.calls <= 100, `${label}: a full lawn keeps draw calls bounded (${stress.calls})`);
      assert.equal(stress.projectileCalls, 1, `${label}: all projectiles share one separate draw call`);
      assert.ok(stress.projectileTriangles > 0 && stress.projectileTriangles <= 80 * 200, `${label}: peas use compact sphere geometry`);
    }
    const report = { label, initial, pauseRenders: afterPause.frame - frozen.frame, stress };
    reports.push(report);
    console.log(JSON.stringify(report));
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(`test-results/phone/${baseline ? 'baseline' : 'results'}.json`, JSON.stringify(reports, null, 2) + '\n');
}
