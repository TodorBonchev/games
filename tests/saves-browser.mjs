import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { SAVE_KEYS } from '../save-store.js';

const options = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 };
const ready = page => page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
export async function checkSaves(browser, baseURL) {
  await mkdir('test-results/saves', { recursive: true });
  const errors = [];
  let context, page;
  const open = async (storageState, viewport = options.viewport) => {
    context = await browser.newContext({ ...options, viewport, storageState });
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  };
  try {
    await open();
    await page.goto(`${baseURL}/garden.html?debug=1&level=3`); await ready(page);
    await page.locator('#startBtn').tap();
    await page.locator('.lawn-cell[data-row="0"][data-col="0"]').tap();
    await page.locator('[data-seed="pea"]').tap();
    await page.locator('.lawn-cell[data-row="2"][data-col="1"]').tap();
    await page.evaluate(() => { window.__garden.stopRendering(); window.__garden.advance(21); });
    await page.locator('#speedBtn').tap();
    await page.locator('#pauseBtn').tap();
    const garden = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), SAVE_KEYS.garden);
    assert.equal(garden.data.level, 3);
    assert.equal(garden.data.mode, 'paused');
    assert.equal(garden.data.plants.length, 2);
    assert.ok(garden.data.zombies.length > 0);
    const gardenStorage = await context.storageState();
    await context.close();
    for (const viewport of [{ width: 320, height: 568 }, options.viewport, { width: 844, height: 390 }]) {
      await open(gardenStorage, viewport);
      await page.goto(`${baseURL}/garden.html?debug=1`); await ready(page);
      assert.ok(await page.locator('#continueRunBtn').isVisible());
      assert.equal(await page.locator('#sunCount').textContent(), '200', 'saved resources are not spent before choosing Continue');
      const stage = await page.locator('#gardenStage').boundingBox();
      for (const id of ['continueRunBtn', 'startBtn']) {
        const button = await page.locator(`#${id}`).boundingBox();
        assert.ok(button.height >= 44 && button.y >= stage.y && button.y + button.height <= stage.y + stage.height, `${viewport.width}: ${id} fits inside the phone intro`);
      }
      await page.screenshot({ path: `test-results/saves/garden-${viewport.width}-continue.png`, fullPage: true });
      await page.locator('#continueRunBtn').tap();
      await page.evaluate(() => window.__garden.stopRendering());
      const actual = await page.evaluate(() => window.__garden.game.snapshot());
      assert.equal(actual.level, garden.data.level);
      assert.equal(actual.sun, garden.data.sun);
      assert.equal(actual.spawned, garden.data.spawned);
      assert.equal(actual.defeated, garden.data.defeated);
      assert.equal(actual.zombies.length, garden.data.zombies.length);
      assert.deepEqual(actual.plants.map(({ type, row, col, hp }) => ({ type, row, col, hp })), garden.data.plants.map(({ type, row, col, hp }) => ({ type, row, col, hp })));
      assert.ok(actual.time >= garden.data.time && actual.time - garden.data.time < 1, 'time spent outside the site never advances the level');
      assert.equal(await page.locator('#speedBtn').textContent(), '2×');
      await page.locator('#pauseBtn').tap();
      if (viewport.width !== 844) await context.close();
    }
    await page.locator('#menuDialog .dialog-back').tap();
    await page.waitForFunction(() => document.querySelector('.garden-card [data-play-label]')?.textContent === 'CONTINUE RUN');
    assert.ok((await page.locator('.garden-card').getAttribute('href')).includes('continue=1'));
    await page.locator('.garden-card').tap(); await ready(page);
    assert.equal(await page.locator('#levelName').textContent(), 'Runner’s row');
    await page.locator('#pauseBtn').tap();
    console.log('Garden Guard: autosave, closing/reopening, all phone Continue layouts, exact lawn state, speed and hub continuation passed.');

    await page.goto(`${baseURL}/soldier.html?debug=1&q=low&noscale=1`); await ready(page);
    await page.locator('[data-weapon="burst"]').tap();
    await page.locator('#startBtn').tap();
    await page.locator('#skipBtn').tap();
    await page.waitForFunction(() => window.__game.mode === 'play' && window.__game.zombies.some(z => !z.userData.dead));
    await page.evaluate(() => { window.__game.score = 580; window.__game.hp = 73; window.__game.castFrozenOrb(); window.__game.pause(); });
    const soldier = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), SAVE_KEYS.soldier);
    assert.equal(soldier.data.hp, 73);
    assert.equal(soldier.data.weapon, 'burst');
    assert.ok(soldier.data.zombies.length > 0);
    const both = await context.storageState(); await context.close();
    await open(both);
    await page.goto(`${baseURL}/soldier.html?debug=1&q=low&noscale=1`); await ready(page);
    assert.ok(await page.locator('#continueBtn').isVisible());
    await page.screenshot({ path: 'test-results/saves/soldier-continue.png', fullPage: true });
    await page.locator('#continueBtn').tap();
    await page.evaluate(() => window.__game.pause());
    const actual = await page.evaluate(() => ({ hp: window.__game.hp, score: window.__game.score, wave: window.__game.wave, toSpawn: window.__game.toSpawn, weapon: window.__game.weapon.id, foes: window.__game.zombies.filter(z => !z.userData.dead).length, firing: window.__game.firing, cooldown: window.__game.frozenOrb.cooldown }));
    assert.equal(actual.hp, soldier.data.hp); assert.equal(actual.score, soldier.data.score);
    assert.equal(actual.wave, soldier.data.wave); assert.equal(actual.toSpawn, soldier.data.toSpawn);
    assert.equal(actual.weapon, soldier.data.weapon); assert.equal(actual.foes, soldier.data.zombies.length);
    assert.equal(actual.firing, false);
    assert.ok(actual.cooldown <= soldier.data.frozenCooldown && actual.cooldown > 0);
    assert.ok(await page.evaluate(key => !!localStorage.getItem(key), SAVE_KEYS.garden), 'saving the shooter keeps the garden save');
    await page.locator('#pausePanel .games-return').tap();
    await page.waitForFunction(() => [...document.querySelectorAll('.garden-card [data-play-label], .soldier-card [data-play-label]')].every(label => label.textContent === 'CONTINUE RUN'));
    await page.screenshot({ path: 'test-results/saves/hub-both-saved.png', fullPage: true });
    await page.locator('.soldier-card').tap(); await ready(page);
    assert.equal(await page.locator('#score').textContent(), String(soldier.data.score));
    await page.locator('#pauseBtn').tap();
    await page.locator('#pauseMenuBtn').tap();
    assert.equal(await page.evaluate(key => localStorage.getItem(key), SAVE_KEYS.soldier), null);
    assert.ok(await page.evaluate(key => !!localStorage.getItem(key), SAVE_KEYS.garden));
    assert.ok(await page.evaluate(() => Number(localStorage.getItem('szBest')) >= 580));
    console.log('Soldier vs Zombies: full reload, health, weapon, wave, enemies, cooldown, hub continuation and independent game saves passed.');
    await context.close();

    await open();
    await page.goto(`${baseURL}/soldier.html?debug=1&q=low&noscale=1`); await ready(page);
    await page.locator('#startBtn').tap(); await page.locator('#skipBtn').tap();
    await page.waitForFunction(() => window.__game.mode === 'play');
    await page.evaluate(() => { window.__game.score = 890; window.__game.winLevel(); });
    await page.goto(`${baseURL}/soldier.html?debug=1&q=low&noscale=1`); await ready(page);
    await page.locator('#continueBtn').tap();
    await page.waitForURL(url => url.searchParams.get('level') === '2' && url.searchParams.get('continue') === '1');
    await ready(page);
    assert.equal(await page.evaluate(() => window.__game.level), 2);
    assert.equal(await page.evaluate(() => window.__game.score), 890);
    assert.equal(await page.evaluate(() => window.__game.wave), 1);
    await context.close();
    console.log('Closing during the island transition and continuing from the default shooter URL restores Ember Isle.');

    for (const scenario of ['corrupt', 'blocked']) {
      await open();
      await context.addInitScript(({ scenario, keys }) => {
        if (scenario === 'corrupt') for (const key of keys) localStorage.setItem(key, '{broken');
        else Storage.prototype.setItem = () => { throw new DOMException('Storage disabled', 'QuotaExceededError'); };
      }, { scenario, keys: Object.values(SAVE_KEYS) });
      await page.goto(`${baseURL}/garden.html?debug=1`); await ready(page);
      assert.ok(await page.locator('#continueRunBtn').isHidden());
      await page.locator('#startBtn').tap();
      await page.locator('.lawn-cell[data-row="0"][data-col="0"]').tap();
      assert.equal(await page.locator('#sunCount').textContent(), '150');
      await page.locator('#pauseBtn').tap();
      if (scenario === 'blocked') assert.ok((await page.locator('#saveStatus').textContent()).includes('unavailable'));
      await page.goto(`${baseURL}/soldier.html?debug=1&q=low&noscale=1`); await ready(page);
      assert.ok(await page.locator('#continueBtn').isHidden());
      await page.locator('#startBtn').tap(); await page.locator('#skipBtn').tap();
      await page.locator('#pauseBtn').tap();
      if (scenario === 'blocked') assert.ok((await page.locator('#saveStatus').textContent()).includes('unavailable'));
      await context.close();
    }
    assert.deepEqual(errors, []);
    console.log('Both games remain playable with corrupt saves or blocked storage. All save browser checks passed.');
  } finally { await context?.close(); }
}
