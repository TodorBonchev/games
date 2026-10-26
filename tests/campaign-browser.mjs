import assert from 'node:assert/strict';
import { LEVELS } from '../garden-levels.js';

async function growUntil(page, until) {
  return page.evaluate(limit => {
    const { game } = window.__garden;
    const rows = [...new Set(game.level.enemies.map(enemy => enemy.row))];
    game.place('bloom', 0, 0);
    game.place('pea', rows[0], 1);
    let secondBloom = game.state.plants.some(plant => plant.type === 'bloom' && plant.row === 1 && plant.col === 0);
    const plan = [...rows.map(row => ['pea', row, 1]), ...rows.map(row => ['pea', row, 2]), ...rows.map(row => ['nut', row, 5]), ...rows.map(row => ['pea', row, 3])];
    for (let turn = 0; turn < 2000 && game.state.mode === 'playing' && game.state.time < limit; turn++) {
      for (const sun of [...game.state.suns]) game.collectSun(sun.id);
      if (!secondBloom) secondBloom = game.place('bloom', 1, 0).ok;
      for (const [type, row, col] of plan) {
        if (!game.state.plants.some(plant => plant.row === row && plant.col === col)) { game.place(type, row, col); break; }
      }
      game.tick(0.25);
    }
    window.__garden.advance(0);
    return { mode: game.state.mode, defeated: game.state.defeated, wave: game.state.wave, sun: game.state.sun, time: game.state.time, calls: window.__garden.view.renderer.info.render.calls };
  }, until);
}

export async function checkCampaign(browser, baseURL) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await page.goto(`${baseURL}/garden.html?debug=1`);
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
    await page.locator('#levelsBtn').tap();
    assert.equal(await page.locator('.garden-level-card').count(), 5);
    await page.locator('.garden-level-card[data-level="1"]').tap();
    await page.evaluate(() => window.__garden.stopRendering());
    for (const level of LEVELS) {
      assert.equal(await page.evaluate(() => window.__garden.game.state.level), level.id);
      assert.equal(await page.locator('#levelName').textContent(), level.name);
      assert.equal(await page.evaluate(() => window.__garden.game.state.sun), level.startSun);
      const before = await growUntil(page, level.id < 4 ? 85 : 115);
      assert.equal(before.mode, 'playing');
      assert.ok(before.calls <= 110, `level ${level.id}: mobile draw calls remain bounded`);
      await page.screenshot({ path: `test-results/garden-level-${level.id}-play.png`, fullPage: true });
      const result = await growUntil(page, 500);
      assert.equal(result.mode, 'won', `${level.name}: a full legal playthrough wins in the browser`);
      assert.equal(result.defeated, level.enemies.length);
      assert.equal(result.wave, level.waveCount);
      assert.ok(result.sun >= 0);
      assert.ok(await page.locator('#menuDialog').isVisible());
      assert.ok(await page.evaluate(id => JSON.parse(localStorage.getItem(`games:garden:level${id}`)).stars >= 1, level.id));
      await page.screenshot({ path: `test-results/garden-level-${level.id}-victory.png`, fullPage: true });
      console.log(`PASS level ${level.id}: ${level.name}, ${result.defeated} zombies, ${result.wave} waves, legal win at ${result.time.toFixed(1)}s.`);
      if (level.id < LEVELS.length) {
        assert.ok((await page.locator('#resumeBtn').textContent()).includes('NEXT GARDEN'));
        await page.locator('#resumeBtn').tap();
        assert.equal(await page.evaluate(() => window.__garden.game.state.plants.length), 0);
        assert.ok(await page.evaluate(() => window.__garden.game.state.mowers.every(mower => !mower.spent)));
      } else assert.ok(!(await page.locator('#resumeBtn').textContent()).includes('NEXT GARDEN'));
    }
    await page.reload();
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
    await page.locator('#levelsBtn').tap();
    for (const level of LEVELS) assert.ok((await page.locator(`.garden-level-card[data-level="${level.id}"] .level-stars`).textContent()).includes('★'));
    await page.screenshot({ path: 'test-results/garden-all-levels-saved.png', fullPage: true });
    await page.locator('.garden-level-card[data-level="5"]').tap();
    assert.equal(await page.evaluate(() => window.__garden.game.state.level), 5);
    await page.locator('#levelsBtn').tap();
    await page.locator('#levelsClose').tap();
    await page.waitForFunction(() => window.__garden.game.state.mode === 'playing');
    assert.equal(await page.evaluate(() => window.__garden.game.state.mode), 'playing', 'closing the picker resumes the existing garden');
    await page.locator('#pauseBtn').tap();
    await page.locator('#chooseLevelBtn').tap();
    await page.locator('.garden-level-card[data-level="3"]').tap();
    assert.equal(await page.evaluate(() => window.__garden.game.state.level), 3);
    assert.equal(await page.evaluate(() => window.__garden.game.state.sun), 250);
    assert.deepEqual(errors, []);
    console.log('Five-level progression, replay, level selection, saved stars and phone controls passed.');
  } finally { await context.close(); }
}
