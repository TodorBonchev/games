// Production RAF and native controls throughout. Debug positioning and one
// validated age-42 checkpoint fixture make supply/save regressions repeatable.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const port = 5354, base = process.env.GAMES_TEST_URL || `http://127.0.0.1:${port}`;
const output = 'test-results/survival-support', errors = [], layoutIssues = [];
const specs = [{ name: 'desktop', width: 960, height: 640, touch: false }, { name: 'phone', width: 390, height: 844, touch: true }]
  .filter(spec => !process.env.BROWSER_CASE || process.env.BROWSER_CASE === spec.name);
let browser, server, currentPage;
const press = (locator, spec) => spec.touch ? locator.tap() : locator.click();
const paint = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const ready = page => page.waitForFunction(() => document.body.dataset.ready === 'true' && window.__game, null, { timeout: 90000 });
async function waitGame(page, seconds) {
  const start = await page.evaluate(() => __game.time);
  await page.waitForFunction(({ start, seconds }) => __game.time >= start + seconds, { start, seconds }, { timeout: 60000 });
}
async function pause(page, spec) {
  if (spec.touch) await page.locator('#pauseBtn').tap(); else await page.keyboard.press('KeyP');
  await page.waitForFunction(() => __game.paused);
}
async function saveReturn(page, spec, upgrade = false) {
  if (!upgrade) await pause(page, spec);
  await press(page.locator(upgrade ? '#upgradeSaveBtn' : '#pauseSaveBtn'), spec);
  await page.waitForFunction(() => __game.mode === 'menu');
  assert.equal(await page.locator('#continueBtn').isVisible(), true);
  return page.evaluate(() => JSON.parse(localStorage.getItem('games:save:soldier')).data);
}
async function continueRun(page, spec, phase = 'play') {
  await press(page.locator('#continueBtn'), spec);
  await page.waitForFunction(phase => __game.mode === phase && !__game.paused, phase);
  await paint(page);
  assert.equal(await page.locator('#encounterName').textContent(), await page.evaluate(() => __game.encounter.name), 'Continue restores the actual encounter title');
}
async function settings(page, spec) {
  await pause(page, spec); await press(page.locator('#pauseSettingsBtn'), spec);
  await page.locator('#setPanel').waitFor({ state: 'visible' });
}
async function layout(page, selector, avoid = []) {
  const box = await page.locator(selector).boundingBox(), view = page.viewportSize();
  assert.ok(box, `${selector} is visible`);
  const report = reason => { const message = `${view.width}×${view.height}: ${reason}`; layoutIssues.push(message); console.error(`LAYOUT ISSUE: ${message}`); };
  if (box.x < -1 || box.y < -1 || box.x + box.width > view.width + 1 || box.y + box.height > view.height + 1) report(`${selector} exceeds viewport ${JSON.stringify(box)}`);
  for (const other of avoid) {
    if (!await page.locator(other).isVisible()) continue;
    const b = await page.locator(other).boundingBox();
    if (b && !(box.x + box.width <= b.x || b.x + b.width <= box.x || box.y + box.height <= b.y || b.y + b.height <= box.y)) report(`${selector} overlaps ${other}: ${JSON.stringify(box)} / ${JSON.stringify(b)}`);
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'no horizontal overflow');
}
async function worldFingerprint(page) {
  const world = await page.evaluate(() => ({ seed: __game.worldSeed, initialRandom: window.__supportRandomSeed, tier: __game.tier, colliders: JSON.stringify(__game.colliders), stations: JSON.stringify(__game.activities.world.stations.map(s => [s.id, s.x, s.y, s.z])) }));
  assert.equal(JSON.parse(world.stations).length, 30, 'the comparison includes every survivor outpost');
  const shapes = JSON.parse(world.colliders); assert.ok(shapes.circles.length + shapes.boxes.length > 0, 'the comparison includes real scenery collision shapes');
  for (const key of ['colliders', 'stations']) world[key] = createHash('sha256').update(world[key]).digest('hex');
  return world;
}
async function halo(page) {
  return page.evaluate(async () => {
    const { Color } = await import('three'), ring = __game.scene.getObjectByName('reward-ground-halos'), beam = __game.scene.getObjectByName('reward-beacons'), body = __game.scene.getObjectByName('medkit-cases');
    const color = new Color(); ring.getColorAt(0, color);
    return { color: color.getHex(), matrix: Array.from(ring.instanceMatrix.array.slice(0, 16)), body: Array.from(body.instanceMatrix.array.slice(0, 16)), opacity: beam.material.opacity, visible: ring.visible };
  });
}
async function quality(page, spec, value, active = true) {
  if (active) await settings(page, spec); else await press(page.locator('#briefSettingsBtn'), spec);
  await press(page.locator(`#setPanel [data-q="${value}"]`), spec);
  await page.waitForURL(url => !url.searchParams.has('q') && (active ? url.searchParams.get('continue') === '1' : true));
  await ready(page); await page.waitForFunction(value => __game.tier === value, value, { timeout: 90000 });
}

try {
  if (!process.env.GAMES_TEST_URL) {
    server = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('Support test server failed to start')), 10000); server.stdout.once('data', () => { clearTimeout(timer); resolve(); }); server.once('error', reject); server.once('exit', code => reject(Error(`Server exited ${code}`))); });
  }
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  for (const spec of specs) {
    const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, deviceScaleFactor: 1, hasTouch: spec.touch, isMobile: spec.touch });
    await context.addInitScript(() => {
      const visit = Number(sessionStorage.getItem('supportTestVisit') || 0) + 1; sessionStorage.setItem('supportTestVisit', visit);
      let seed = visit === 1 ? 4211 : 9114 + visit; window.__supportRandomSeed = seed;
      Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    });
    const page = await context.newPage(); currentPage = page; page.setDefaultTimeout(25000);
    page.on('pageerror', error => errors.push(`${spec.name}: ${error.stack || error.message}`));
    page.on('console', event => { if (event.type() === 'error') errors.push(`${spec.name}: ${event.text()}`); });
    page.on('response', response => { if (response.status() >= 400) errors.push(`${spec.name}: ${response.status()} ${response.url()}`); });
    await page.goto(`${base}/soldier.html?debug=1&q=low&noscale=1`); await ready(page);
    await press(page.locator('#startBtn'), spec); await page.waitForFunction(() => __game.mode === 'intro' || __game.mode === 'play');
    if (await page.evaluate(() => __game.mode === 'intro')) { if (spec.touch) await page.locator('#skipBtn').tap(); else await page.keyboard.press('Space'); }
    await page.waitForFunction(() => __game.mode === 'play' && !__game.paused); await waitGame(page, 1.7);
    await page.evaluate(() => { __game.hp = 47; __game.score = 321; for (const enemy of __game.zombies) { enemy.position.set(40, 0, 40); Object.assign(enemy.userData, { speed: 0, attackCooldown: 9999, spitCooldown: 9999 }); } });
    const battle = await saveReturn(page, spec); assert.ok(battle.zombies.length > 0, 'battle fixture contains a live enemy');
    await continueRun(page, spec);
    assert.deepEqual(await page.evaluate(() => [__game.hp, __game.score, __game.wave, __game.toSpawn + __game.zombies.length]), [47, 321, battle.wave, battle.toSpawn + battle.zombies.length]);
    console.log(`${spec.name}: native battle Save & Return and Continue passed.`);

    // Probe a drop originating inside scenery. Production dropReward must find
    // a nearby clear landing point; no reward position is edited by the test.
    const relocated = await page.evaluate(() => {
      const game = __game, old = [...game.pos], collider = game.colliders.circles.find(c => c.r < 2 && Math.hypot(c.x, c.z) < 28);
      if (!collider) throw Error('No small interior scenery fixture');
      game.hp = 100; game.setPos(collider.x, collider.z); const id = game.spawnDrop('medkit', 0), drop = game.progression.drops.find(d => d.id === id); game.setPos(old[0], old[2]);
      if (!drop) throw Error('Nearby clear medkit landing was not found');
      const [x, , z] = drop.position;
      return { shifted: Math.hypot(x - collider.x, z - collider.z), clear: game.colliders.circles.every(c => Math.hypot(c.x - x, c.z - z) >= c.r + .49) && game.colliders.boxes.every(b => Math.abs(b.x - x) >= b.hx + .49 || Math.abs(b.z - z) >= b.hz + .49) };
    });
    assert.ok(relocated.shifted > 0); assert.equal(relocated.clear, true, 'medkit lands outside every scenery collider');
    const medkit = await page.evaluate(async () => {
      const { groundH, islandD } = await import('./world.js?v19'), game = __game;
      const clear = (x, z) => islandD(x, z) < .75 && groundH(x, z) > .3 && game.colliders.circles.every(c => Math.hypot(c.x - x, c.z - z) >= c.r + 1) && game.colliders.boxes.every(b => Math.abs(b.x - x) >= b.hx + 1 || Math.abs(b.z - z) >= b.hz + 1);
      let base;
      for (let x = -20; x <= 20 && !base; x += 4) for (let z = -20; z <= 20 && !base; z += 4) if (clear(x, z) && clear(x + 6, z) && game.activities.world.stations.every(s => Math.hypot(s.x - x, s.z - z) > 7)) base = { x, z };
      if (!base) throw Error('No clear non-outpost supply fixture');
      window.__supportBase = base; game.setPos(base.x, base.z); game.setView(-Math.PI / 2, -.25); game.hp = 30;
      const id = game.spawnDrop('medkit', 6); game.spawnDrop('overdrive', 3); return game.progression.drops.find(d => d.id === id);
    });
    assert.ok(medkit); await page.waitForFunction(() => !document.querySelector('#supplyGuide').hidden && document.querySelector('#supplyGuide').textContent.includes('MEDKIT'));
    assert.equal(await page.locator('#weaponHud').isVisible(), true); assert.match(await page.locator('#supplyGuide').textContent(), /MEDKIT · \d+m (ahead|behind|left|right)/);
    await page.screenshot({ path: `${output}/${spec.name}-supply-hint.png` });

    await page.evaluate(() => __game.clearWave()); await page.locator('#recoveryPanel').waitFor({ state: 'visible' });
    if (spec.touch) await page.locator('#recoveryHold').tap(); else await page.keyboard.press('KeyC');
    await page.waitForFunction(() => __game.recoveryHeld);
    assert.match(await page.locator('#recoveryNext').textContent(), /NEXT: CROSS FIRE · 10 HOSTILES/);
    assert.match(await page.locator('#recoveryHint').textContent(), /MEDKIT|OVERDRIVE/);
    await settings(page, spec); await press(page.locator('#motionBtn'), spec); assert.equal(await page.locator('body').evaluate(el => el.classList.contains('reduced-motion')), true);
    await press(page.locator('#setClose'), spec); await page.waitForFunction(() => !__game.paused);
    const held = await saveReturn(page, spec); assert.equal(held.recoveryHeld, true);
    const beforeWorld = await worldFingerprint(page);
    // Keep a single valid held-recovery checkpoint with an old, useful medkit.
    await page.evaluate(drop => {
      const key = 'games:save:soldier', save = JSON.parse(localStorage.getItem(key));
      save.data.drops = [{ type: 'medkit', position: drop.position, age: 42 }]; save.data.hp = 30; localStorage.setItem(key, JSON.stringify(save));
    }, medkit);
    await page.reload(); await ready(page);
    const afterWorld = await worldFingerprint(page); assert.notEqual(afterWorld.initialRandom, beforeWorld.initialRandom);
    for (const key of ['seed', 'tier', 'colliders', 'stations']) assert.equal(afterWorld[key], beforeWorld[key], `${key} is preserved across a differently randomized same-quality reload`);
    await continueRun(page, spec); await waitGame(page, .15);
    assert.equal(await page.evaluate(() => __game.recoveryHeld), true); assert.equal(await page.evaluate(() => __game.hp), 30);
    assert.equal(await page.evaluate(() => __game.progression.drops[0].age), 42);
    assert.match(await page.locator('#recoveryHint').textContent(), /MEDKIT.*3s left/);
    const staticHalo = await halo(page); assert.equal(staticHalo.color, 0xff8c69); assert.equal(staticHalo.visible, true);
    await waitGame(page, .45); assert.deepEqual(await halo(page), staticHalo, 'reduced-motion expiry halo/body remain static while the native game clock advances');
    await layout(page, '#recoveryPanel', ['#fieldObjective', '#expeditionJournal', '#stick', '#fireBtn', '#jumpBtn', '#orbBtn']);
    await page.screenshot({ path: `${output}/${spec.name}-held-expiring-supply.png` });
    console.log(`${spec.name}: useful supply guidance, scenery-safe drop, age-42 static red halo, encounter preview, held save and world-seed reload passed.`);

    if (spec.touch) {
      for (const viewport of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport); await waitGame(page, .15);
        await layout(page, '#recoveryPanel', ['#fieldObjective', '#expeditionJournal', '#stick', '#fireBtn', '#jumpBtn', '#orbBtn']);
        await page.screenshot({ path: `${output}/phone-recovery-${viewport.width}x${viewport.height}.png` });
        await page.evaluate(() => { const s = __game.activities.world.stations.find(s => s.id === 'garden'); __game.setPos(s.x, s.z); });
        await page.locator('#activityInteract').waitFor({ state: 'visible' }); await waitGame(page, .1);
        await layout(page, '#recoveryPanel', ['#activityInteract', '#stick', '#fireBtn', '#jumpBtn', '#orbBtn']);
        await page.screenshot({ path: `${output}/phone-outpost-recovery-${viewport.width}x${viewport.height}.png` });
        await page.evaluate(() => { const [x, , z] = JSON.parse(localStorage.getItem('games:save:soldier')).data.player.position; __game.setPos(x, z); }); await waitGame(page, .15);
      }
    } else {
      const frozen = await page.evaluate(() => ({ hp: __game.hp, score: __game.score, held: __game.recoveryHeld, wave: __game.wave, seed: __game.worldSeed }));
      const beforeQualityWorld = await worldFingerprint(page);
      await quality(page, spec, 'medium'); await page.waitForFunction(() => __game.mode === 'play');
      assert.deepEqual(await page.evaluate(() => ({ hp: __game.hp, score: __game.score, held: __game.recoveryHeld, wave: __game.wave, seed: __game.worldSeed })), frozen, 'active low-to-medium navigation automatically resumes the exact held operation');
      const afterQualityWorld = await worldFingerprint(page);
      for (const key of ['seed', 'colliders', 'stations']) assert.equal(afterQualityWorld[key], beforeQualityWorld[key], `native low-to-medium navigation preserves exact ${key}`);
      assert.equal(new URL(page.url()).searchParams.get('continue'), '1');
      if (await page.evaluate(() => __game.paused)) await press(page.locator('#resumeBtn'), spec);
      console.log('desktop: native low-to-medium navigation automatically resumed the operation with identical colliders and every outpost location.');
    }

    if (!spec.touch) await page.keyboard.down('Digit1');
    if (spec.touch) await page.locator('#recoveryReady').tap(); else await page.keyboard.press('KeyN');
    await page.waitForFunction(() => __game.mode === 'upgrade');
    await page.waitForTimeout(250);
    if (!spec.touch) { await page.keyboard.down('Digit1'); assert.equal(await page.evaluate(() => __game.mode), 'upgrade', 'a digit held before the cards appeared cannot choose an upgrade'); await page.keyboard.up('Digit1'); }
    const choices = await page.evaluate(() => __game.progression.choices);
    const labels = await page.locator('.upgrade-comparison').allTextContents(); assert.equal(labels.length, 3); assert.ok(labels.every(label => label.includes('→')));
    const categories = await page.locator('[data-upgrade-category]').allTextContents(); assert.equal(new Set(categories).size, 3);
    assert.deepEqual(await page.locator('#upgradeChoices button').evaluateAll(buttons => buttons.map(b => b.getAttribute('aria-keyshortcuts'))), ['1', '2', '3']);
    await page.screenshot({ path: `${output}/${spec.name}-upgrade-benefits.png` });
    const pending = await saveReturn(page, spec, true); assert.equal(pending.phase, 'upgrade'); assert.deepEqual(pending.choices, choices.map(c => c.id));
    if (spec.touch) {
      const beforeQualityWorld = await worldFingerprint(page);
      await quality(page, spec, 'medium', false); assert.equal(await page.evaluate(() => __game.mode), 'menu');
      const afterQualityWorld = await worldFingerprint(page);
      for (const key of ['seed', 'colliders', 'stations']) assert.equal(afterQualityWorld[key], beforeQualityWorld[key], `phone low-to-medium navigation preserves exact ${key} with a saved upgrade`);
    }
    await continueRun(page, spec, 'upgrade');
    assert.deepEqual(await page.evaluate(() => __game.progression.choices), choices);
    assert.equal(await page.evaluate(() => __game.hp), pending.hp); assert.equal(await page.evaluate(() => __game.score), pending.score);
    await page.waitForTimeout(250);
    if (spec.touch) await page.locator('#upgradeChoices button').nth(1).tap(); else await page.keyboard.press('Digit2');
    await page.waitForFunction(() => __game.mode === 'play' && __game.wave === 2);
    assert.equal(await page.evaluate(() => Object.values(__game.progression.ranks).reduce((a, b) => a + b, 0)), 1);
    if (!spec.touch) { await page.keyboard.press('Digit2'); assert.equal(await page.evaluate(() => Object.values(__game.progression.ranks).reduce((a, b) => a + b, 0)), 1); }
    assert.equal(await page.evaluate(() => __game.recoveryHeld), false);
    console.log(`${spec.name}: actual upgrade benefits/categories, guarded shortcut/touch selection and pending-upgrade Save/Continue passed.`);
    await context.close();
  }
  assert.deepEqual(errors, [], 'no JavaScript, console or asset failures');
  assert.deepEqual(layoutIssues, [], 'new recovery preview and supply hint remain separate from world/touch controls');
  console.log(`Survival support browser passed: ${specs.map(s => s.name).join(', ')}. Screenshots: ${output}`);
} catch (error) {
  if (currentPage && !currentPage.isClosed()) {
    await currentPage.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
    console.error('State:', await currentPage.evaluate(() => ({ mode: window.__game?.mode, paused: window.__game?.paused, wave: window.__game?.wave, held: window.__game?.recoveryHeld, hp: window.__game?.hp, supply: document.querySelector('#supplyGuide')?.textContent, recovery: document.querySelector('#recoveryPanel')?.textContent })).catch(() => null));
  }
  console.error('Browser errors:', errors); console.error('Layout issues:', layoutIssues); throw error;
} finally { await browser?.close(); server?.kill(); }
