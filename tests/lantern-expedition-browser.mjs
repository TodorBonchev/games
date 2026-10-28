// Explore both Blender-authored satellite islands using public flight inputs.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const base = process.env.GAMES_TEST_URL || 'http://127.0.0.1:5198';
const errors = [], reports = [];
let server, browser;
const watch = (page, label) => {
  page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`${label}: ${message.text()}`); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${label}: ${response.status()} ${response.url()}`); });
};
async function ready(page) {
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && window.__lantern?.view, null, { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
}
const strategy = await readFile(new URL('./lantern-strategy.mjs', import.meta.url), 'utf8');
const imports = [...strategy.matchAll(/import\s*\{([^}]+)\}\s*from\s*[^;]+;/g)].map(match => match[1]).join(',');
const source = strategy.replace(/^import .*?;\s*/gm, '').replace(/^export /gm, '');
async function flyTo(page, target) {
  return page.evaluate(async ({ source, imports, target }) => {
    const helpers = await import('./lantern-game.js'), { game, world } = __lantern;
    const pilot = new Function('helpers', `const {${imports}} = helpers;\n${source}\nreturn flyTo;`)(helpers);
    const advance = game.advance, samples = { safe: true, steps: 0, distance: 0 };
    const initial = game.state.distance;
    game.advance = (...args) => {
      advance(...args); samples.steps++;
      const p = game.state.player;
      samples.safe &&= helpers.isFlyable(world, p.x, p.y, p.z);
    };
    try { pilot(game, target, .45); } finally { game.advance = advance; }
    __lantern.refresh();
    samples.distance = game.state.distance - initial;
    return { ...samples, expedition: structuredClone(game.state.expedition), player: { ...game.state.player } };
  }, { source, imports, target });
}
async function selectIsland(page, id) {
  await page.locator('#mapButton').tap();
  const choice = page.locator(`[data-destination="${id}"]`);
  await choice.tap();
  assert.ok(await page.locator('#modalLayer').isHidden(), 'choosing a destination returns directly to flight');
  assert.equal(await page.evaluate(() => __lantern.game.state.expedition.destination), id);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('games:save:lantern')).data.expedition.destination), id,
    'the selected island is saved immediately');
}
async function frameIsland(page, id) {
  const island = await page.evaluate(id => __lantern.world.satellites.find(island => island.id === id), id);
  const staging = await page.evaluate(() => ({ ...__lantern.game.state.player, y: Math.max(20,
    ...__lantern.world.satellites.flatMap(item => item.colliders.map(collider => collider.maxY + 2))) }));
  await flyTo(page, staging);
  await flyTo(page, { x: island.center.x, y: staging.y, z: island.center.z + 28 });
  const route = await flyTo(page, { x: island.center.x, y: island.topY + 5, z: island.center.z + 28 });
  assert.ok(route.safe, 'the approach viewpoint is reachable by normal flight');
  await page.evaluate(center => {
    const { game, view } = __lantern;
    for (let i = 0; i < 240; i++) {
      const p = game.state.player, angle = Math.atan2(center.x - p.x, center.z - p.z);
      const difference = Math.atan2(Math.sin(angle - p.heading), Math.cos(angle - p.heading));
      if (Math.abs(difference) < .01) break;
      game.advance(1 / 30, { turn: Math.max(-1, Math.min(1, -difference * 4)) });
    }
    for (let i = 0; i < 60; i++) { game.advance(1 / 30); view.render(game.state, 100 + i / 30); }
    __lantern.refresh();
  }, island.center);
}
try {
  if (!process.env.GAMES_TEST_URL) {
    server = spawn(process.execPath, ['scripts/serve.mjs', '--port', '5198'], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', code => reject(Error(`Server exited ${code}`))); });
  }
  await mkdir('test-results/lantern-expedition', { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage(), cdp = await context.newCDPSession(page); watch(page, 'expedition');
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, bottom: 34 } });
  await page.goto(`${base}/lantern.html?debug=1`); await ready(page);
  await page.locator('[data-action=start]').tap(); await page.evaluate(() => __lantern.setRealtime(false));
  const assets = await page.evaluate(async () => {
    const THREE = await import('three'), { view, world } = __lantern;
    const islands = [{ name: 'MoonbloomSanctuary', prefix: 'Static_Moon', landmark: 'MoonbloomBloom' },
      { name: 'SunspireObservatory', prefix: 'Static_Sun', landmark: 'SunspireOrrery' }].map(({ name, prefix, landmark }) => {
      // Blender batches the static scenery by material while keeping moving
      // landmarks separate. Verify those authored meshes in world coordinates.
      const parts = [];
      view.scene.traverse(object => { if (object.isMesh && object.name.startsWith(prefix)) parts.push(object); });
      const model = view.scene.getObjectByName(landmark);
      if (!model || !parts.length) return { name, present: false };
      const colors = new Set(); let meshes = 0, vertices = 0;
      const bounds = new THREE.Box3().setFromObject(view.scene.getObjectByName(`${prefix}Rock`));
      for (const object of parts) {
        meshes++; vertices += object.geometry.attributes.position.count;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material.color) colors.add(material.color.getHexString());
      }
      return { name, present: true, meshes, vertices, colors: [...colors], min: bounds.min.toArray(), max: bounds.max.toArray() };
    });
    return { islands, satelliteCount: world.satellites.length, bloom: !!view.scene.getObjectByName('MoonbloomBloom'),
      orrery: !!view.scene.getObjectByName('SunspireOrrery'), main: !!view.scene.getObjectByName('LanternValeBlenderWorld') };
  });
  assert.equal(assets.satelliteCount, 2); assert.ok(assets.main && assets.bloom && assets.orrery);
  for (const model of assets.islands) assert.ok(model.present && model.meshes >= 3 && model.vertices > 500 && model.colors.length >= 4,
    `an actual detailed, colored Blender model is loaded for ${model.name}: ${JSON.stringify(model)}`);
  assert.ok(assets.islands[0].max[0] < -20 && assets.islands[1].min[0] > 20, 'both neighboring islands occupy distinct open-space locations');
  assert.notDeepEqual(assets.islands[0].colors.sort(), assets.islands[1].colors.sort(), 'the two islands have different authored palettes');
  reports.push({ assets });
  await page.locator('#mapButton').tap();
  assert.equal(await page.locator('[data-destination]').count(), 3, 'the flight map offers all three islands');
  for (const item of await page.locator('[data-destination]').all()) {
    const rect = await item.boundingBox(); assert.ok(rect.width >= 44 && rect.height >= 44, 'island destinations have finger-sized targets');
  }
  await page.screenshot({ path: 'test-results/lantern-expedition/map-390x844.png' });
  await page.locator('[data-destination="moonbloom"]').tap();

  const nodes = await page.evaluate(async () => {
    const { expeditionTargets } = await import('./lantern-game.js');
    return expeditionTargets(__lantern.world);
  });
  assert.equal(nodes.length, 6, 'each satellite has three distinct discovery pickups');
  for (const id of ['moonbloom', 'sunspire']) {
    await selectIsland(page, id);
    const checkpoints = [];
    for (const target of nodes.filter(node => node.island === id)) {
      const route = await flyTo(page, target);
      assert.ok(route.safe && route.steps > 0, `legal flight reaches ${target.id} without crossing terrain`);
      assert.ok(route.expedition.collected.includes(target.id), `flying through ${target.id} collects its discovery`);
      checkpoints.push(route);
    }
    const progress = await page.evaluate(() => structuredClone(__lantern.game.state.expedition));
    assert.ok(progress.visited.includes(id) && progress.awakened.includes(id), `${id} awakens after its three discoveries`);
    assert.equal(progress.collected.filter(item => item.startsWith(`${id}:`)).length, 3);
    assert.ok(await page.locator('#modalLayer').isHidden(), 'awakening celebrates without interrupting flight');
    await frameIsland(page, id); await page.evaluate(() => __lantern.save());
    const transformed = await page.evaluate(id => {
      const island = __lantern.view.satellites.find(item => item.id === id);
      return { open: island.open, changed: island.bloom ? island.petals.every(petal => Math.abs(petal.object.quaternion.dot(petal.base)) < .99)
        : Math.abs(island.orrery.quaternion.dot(island.base)) < .9999, glow: island.core?.material.emissiveIntensity };
    }, id);
    assert.ok(transformed.open > .98 && transformed.changed && transformed.glow > 1,
      `${id}'s actual Blender landmark transforms and glows after awakening: ${JSON.stringify(transformed)}`);
    await page.screenshot({ path: `test-results/lantern-expedition/${id}-awakened-phone.png` });
    reports.push({ island: id, checkpoints });
  }
  assert.match(await page.locator('#expeditionValue').textContent(), /2\s*\/\s*2/);
  const before = await page.evaluate(() => { __lantern.save(); return __lantern.game.snapshot(); });
  await page.reload(); await ready(page); await page.evaluate(() => __lantern.setRealtime(false));
  await page.locator('[data-action=continue]').tap();
  const resumed = await page.evaluate(() => __lantern.game.snapshot());
  assert.equal(resumed.schema, 3); assert.deepEqual(resumed.expedition, before.expedition); assert.deepEqual(resumed.player, before.player,
    'both awakenings and exact flight position resume after a reload');
  const stable = await page.evaluate(() => {
    const { view, game } = __lantern; view.render(game.state, 2); const memory = JSON.stringify(view.renderer.info.memory);
    for (let i = 0; i < 120; i++) view.render({ ...game.state, ticks: game.state.ticks + i }, 2 + i / 30);
    return { stable: memory === JSON.stringify(view.renderer.info.memory), calls: view.renderer.info.render.calls,
      pixels: view.renderer.domElement.width * view.renderer.domElement.height };
  });
  assert.ok(stable.stable && stable.calls <= 150 && stable.pixels <= 421000, `all three worlds keep the phone budget: ${JSON.stringify(stable)}`);
  reports.push({ resources: stable });
  await page.locator('#mapButton').tap();
  for (const id of ['moonbloom', 'sunspire']) assert.match(await page.locator(`[data-destination="${id}"]`).textContent(), /AWAKENED.*STORY DISCOVERED/s,
    'the saved flight journal records each awakened island');
  await page.screenshot({ path: 'test-results/lantern-expedition/completed-journal.png' });
  await page.locator('[data-destination="moonbloom"]').tap();
  // Visiting the same pickups again cannot duplicate rewards or journal entries.
  await flyTo(page, nodes.find(node => node.id === 'moonbloom:0'));
  const revisited = await page.evaluate(() => structuredClone(__lantern.game.state.expedition));
  assert.deepEqual(revisited.awakened, before.expedition.awakened); assert.deepEqual(revisited.collected, before.expedition.collected);
  await selectIsland(page, 'vale');
  assert.equal(await page.evaluate(() => __lantern.game.state.expedition.destination), 'vale', 'the home island remains a selectable destination');
  await context.close();

  // Earlier spacecraft saves gain empty expeditions, preserving every lantern,
  // memory, star, and their exact safe position.
  const old = { schema: 2, level: 1, mode: 'exploring', resumeMode: 'exploring', ticks: 10000, distance: 450,
    player: { x: 0, y: 9, z: 26, heading: Math.PI, moving: false, speed: 0, verticalSpeed: 0, bank: 0 },
    collected: Array.from({ length: 30 }, (_, i) => i), secrets: [0, 1, 2, 3, 4], lit: [0, 1, 2, 3, 4], charge: 9, stars: 3,
    channel: { beacon: null, progress: 0 } };
  const legacyContext = await browser.newContext({ viewport: { width: 568, height: 320 }, isMobile: true, hasTouch: true });
  const legacyPage = await legacyContext.newPage(); watch(legacyPage, 'schema 2 migration');
  await legacyPage.addInitScript(data => localStorage.setItem('games:save:lantern', JSON.stringify({ version: 1, savedAt: Date.now(), data })), old);
  await legacyPage.goto(`${base}/lantern.html?debug=1`); await ready(legacyPage); await legacyPage.evaluate(() => __lantern.setRealtime(false));
  await legacyPage.locator('[data-action=continue]').tap();
  const migrated = await legacyPage.evaluate(() => { __lantern.save(); return __lantern.game.snapshot(); });
  assert.equal(migrated.schema, 3); assert.deepEqual(migrated.player, old.player); assert.deepEqual(migrated.lit, old.lit);
  assert.deepEqual(migrated.secrets, old.secrets); assert.equal(migrated.stars, old.stars);
  assert.deepEqual(migrated.expedition.awakened, []); assert.deepEqual(migrated.expedition.collected, []);
  await legacyPage.locator('#mapButton').tap();
  assert.equal(await legacyPage.locator('[data-destination]').count(), 3);
  assert.ok(await legacyPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await legacyPage.screenshot({ path: 'test-results/lantern-expedition/map-568x320.png' });
  await legacyPage.locator('[data-destination="sunspire"]').tap();
  assert.equal(await legacyPage.evaluate(() => __lantern.game.state.expedition.destination), 'sunspire');
  await legacyContext.close();
  assert.deepEqual(errors, [], 'the archipelago has no browser errors or missing assets');
  await writeFile('test-results/lantern-expedition/results.json', JSON.stringify(reports, null, 2) + '\n');
  console.log(JSON.stringify(reports, null, 2));
} finally { await browser?.close(); server?.kill('SIGTERM'); }
