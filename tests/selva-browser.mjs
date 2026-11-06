// Native browser regression for the local Selva Oscura build.
// Gameplay uses normal keys/pointers. The explicitly labelled fixture section
// only checks gated-area rendering and persistence of a previous clear.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';

const port = 5366;
const base = (process.env.GAMES_TEST_URL || `http://127.0.0.1:${port}`).replace(/\/$/, '');
const shots = 'test-results/selva';
const phase = process.env.SELVA_PHASE || 'all';
const errors = [], external = [], sockets = [], reports = [];
let server, browser;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function monitor(page, label) {
  page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`${label}: ${message.text()}`); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${label}: ${response.status()} ${response.url()}`); });
  page.on('request', request => { const url = request.url(); if (/^https?:/.test(url) && new URL(url).origin !== new URL(base).origin) external.push(url); });
  page.on('websocket', socket => sockets.push(socket.url()));
}
async function open(context, label) {
  const page = await context.newPage(); monitor(page, label);
  await page.goto(`${base}/selva/?debug=1`);
  await page.locator('#btn-enter-wood').waitFor({ state: 'visible' });
  return page;
}
async function enter(page, name) {
  if (name !== undefined) await page.locator('#boot-name').fill(name);
  await page.locator('#btn-enter-wood').click();
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && window.__selva?.app.room?.you, null, { timeout: 60000 });
  await page.waitForFunction(() => !document.getElementById('boot-veil') || document.getElementById('boot-veil').classList.contains('out'), null, { timeout: 30000 });
  await page.evaluate(() => {
    window.__selvaMessages = [];
    window.__selvaListings = [];
    window.__selva.socket.on(message => {
      if (message.type === 'ah_listings') window.__selvaListings = structuredClone(message.listings);
      if (['combat', 'entity_removed', 'xp', 'level_up', 'loot'].includes(message.type)) window.__selvaMessages.push(structuredClone(message));
    });
  });
  await page.waitForTimeout(350);
}
const state = page => page.evaluate(() => {
  const { app, local } = window.__selva;
  return { name: local.player.name, canto: app.room.cantoId, x: local.session.x, y: local.session.y, hp: local.session.hp, maxHp: local.session.maxHp,
    ash: local.player.ash, inventory: structuredClone(local.player.inventory), stash: structuredClone(local.player.stash),
    clears: [...local.player.firstClears], xp: local.progress.xp, level: local.progress.level, ranks: { ...local.progress.ranks },
    loadout: [...local.progress.loadout], gear: { ...app.room.you.gearStats }, paused: local.paused };
});
async function closePanel(page, id) {
  await page.locator(`[data-close="${id}"]`).click();
  await page.waitForFunction(id => document.getElementById(id)?.classList.contains('hidden'), id);
}
async function keyWalkTo(page, target, tolerance = 2.1) {
  const held = new Set();
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      const direction = await page.evaluate(({ x, y }) => {
        const { app } = window.__selva, p = app.renderYou;
        const f = app.camera.position.clone(); app.camera.getWorldDirection(f); f.y = 0; f.normalize();
        const dx = x - p.x, dy = y - p.y, distance = Math.hypot(dx, dy);
        return { distance, forward: (dx * f.x + dy * f.z) / (distance || 1), right: (-dx * f.z + dy * f.x) / (distance || 1) };
      }, target);
      if (direction.distance <= tolerance) return;
      const desired = new Set();
      if (direction.forward > .30) desired.add('KeyW'); else if (direction.forward < -.30) desired.add('KeyS');
      if (direction.right > .30) desired.add('KeyD'); else if (direction.right < -.30) desired.add('KeyA');
      for (const code of held) if (!desired.has(code)) { await page.keyboard.up(code); held.delete(code); }
      for (const code of desired) if (!held.has(code)) { await page.keyboard.down(code); held.add(code); }
      await page.waitForTimeout(Math.min(240, Math.max(80, direction.distance * 25)));
    }
    assert.fail(`Keyboard route did not reach ${JSON.stringify(target)}: ${JSON.stringify(await state(page))}`);
  } finally { for (const code of held) await page.keyboard.up(code); }
}
async function assertReachable(page, selector, { min = 30 } = {}) {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box, `${selector} is visible`);
  const viewport = page.viewportSize();
  assert.ok(box.width >= min && box.height >= min, `${selector} has usable dimensions ${JSON.stringify(box)}`);
  assert.ok(box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, `${selector} stays inside the viewport: ${JSON.stringify(box)}`);
  return box;
}
async function assertImages(page) {
  const broken = await page.locator('img').evaluateAll(images => images.filter(img => img.getClientRects().length && (!img.complete || img.naturalWidth === 0)).map(img => img.src));
  assert.deepEqual(broken, [], 'visible images load');
}
async function assertTutorialHidden(page) {
  assert.equal(await page.locator('#tut-card').isVisible(), false, 'tutorial instructions cannot cover an open modal');
}
async function freshBrowser() {
  await browser?.close();
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--enable-unsafe-swiftshader'] });
}
async function auction(page) {
  await page.locator('#btn-ah').click();
  await page.waitForFunction(() => window.__selvaListings.length === 24);
  await assertTutorialHidden(page);
  assert.equal(await page.locator('#ah-list .ah-row').count(), 24, 'market displays 24 actual offers');
  const stock = await page.evaluate(() => window.__selvaListings);
  assert.ok(new Set(stock.map(offer => offer.priceAsh)).size > 8, 'asking prices vary');
  assert.ok(new Set(stock.map(offer => JSON.stringify(offer.item.rolledStats))).size > 8, 'rolled stat bundles vary');
  for (const offer of stock) {
    assert.ok(Number.isSafeInteger(offer.priceAsh) && offer.priceAsh > 0);
    assert.ok(Object.values(offer.item.rolledStats).some(value => value > 0), 'offers have useful stat bonuses');
  }
  await page.locator('#btn-ah-refresh').click(); await page.waitForTimeout(150);
  assert.deepEqual(await page.evaluate(() => window.__selvaListings), stock, 'checking stock does not reroll prices or items');
  const before = await state(page);
  const offer = stock.find(offer => ['helm', 'boots', 'gloves', 'offhand'].includes(offer.item.slot) && offer.priceAsh <= before.ash && stock.filter(other => other.item.name === offer.item.name).length === 1);
  assert.ok(offer, 'stock contains an affordable piece for an unused equipment slot');
  await page.locator('.ah-row').filter({ has: page.getByText(offer.item.name, { exact: true }) }).getByRole('button', { name: 'Buy', exact: true }).click();
  await page.waitForFunction(id => window.__selva.local.player.inventory.some(item => item.id === id), offer.item.id);
  assert.equal((await state(page)).ash, before.ash - offer.priceAsh, 'buying debits the displayed price exactly');
  assert.equal(await page.locator('#ah-list .ah-row').count(), 23, 'bought offer disappears');
  await page.locator('#btn-ah-refresh').click(); await page.waitForTimeout(120);
  assert.equal(await page.locator('#ah-list .ah-row').count(), 23, 'checking stock cannot restore a bought offer');
  await page.screenshot({ path: `${shots}/auction-desktop.png` });
  await closePanel(page, 'ah');
  await page.locator('#btn-inv').click();
  await assertTutorialHidden(page);
  await page.locator('#inv-grid').getByRole('button', { name: new RegExp(escape(offer.item.name)) }).click();
  const gearBefore = (await state(page)).gear;
  await page.locator('#btn-equip').click();
  await page.waitForFunction(id => window.__selva.local.player.inventory.find(item => item.id === id)?.equipSlot, offer.item.id);
  await page.waitForTimeout(150);
  const after = await state(page);
  for (const key of ['dmg', 'armor', 'maxHp']) assert.equal(after.gear[key], gearBefore[key] + offer.item.rolledStats[key], `equipped ${key} uses the actual rolled bonus`);
  await closePanel(page, 'inventory');
  return { stock, bought: offer, ashAfter: after.ash };
}

try {
  if (!process.env.GAMES_TEST_URL) {
    server = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
    await Promise.race([
      new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', code => reject(new Error(`Selva test server exited ${code}`))); }),
      sleep(10000).then(() => { throw new Error('Selva test server timeout'); }),
    ]);
  }
  await mkdir(shots, { recursive: true });

  if (phase === 'all' || phase === 'desktop') {
    await freshBrowser();
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await open(context, 'desktop');
    assert.match(await page.locator('#btn-enter-wood').textContent(), /Start single-player journey/);
    await enter(page, 'Browser Pilgrim');
    assert.equal((await state(page)).canto, 'inferno_01');
    await page.waitForTimeout(4200);
    const skip = page.getByRole('button', { name: 'Skip tutorial', exact: true });
    if (await skip.isVisible()) { await skip.click(); await page.waitForTimeout(3500); }
    await page.screenshot({ path: `${shots}/preview.jpg`, type: 'jpeg', quality: 82 });
    const shop = await auction(page);
    // Speak to the guide and reach the gold gate with real keyboard movement.
    await page.keyboard.press('KeyE');
    await keyWalkTo(page, { x: 96, y: 40 });
    await page.keyboard.down('KeyE'); await page.waitForTimeout(1100); await page.keyboard.up('KeyE');
    await page.waitForFunction(() => window.__selva.app.room.cantoId === 'inferno_05', null, { timeout: 15000 });
    assert.ok((await state(page)).x < 30, 'normal gate travel arrives at the Lust entrance');
    const combatStart = await state(page);
    await page.keyboard.down('KeyF');
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(500);
      const current = await state(page);
      if (current.hp < current.maxHp * .55) await page.keyboard.press('KeyQ');
      if (current.level >= 2 && current.inventory.length > combatStart.inventory.length) break;
    }
    await page.keyboard.up('KeyF');
    const afterCombat = await state(page);
    const hits = await page.evaluate(() => window.__selvaMessages.filter(message => message.type === 'combat' && message.attackerId === 'solo-pilgrim' && message.damage > 0));
    assert.ok(hits.some(hit => hit.targetHp > 0), 'normal attacks visibly damage a surviving enemy');
    assert.ok(hits.some(hit => hit.targetHp === 0), 'normal attacks defeat an enemy');
    assert.ok(afterCombat.xp > combatStart.xp && afterCombat.level >= 2, 'genuine combat awards additional XP and progression remains valid');
    assert.ok(afterCombat.inventory.length > combatStart.inventory.length, 'genuine defeated enemies drop collectible loot');
    await page.screenshot({ path: `${shots}/combat-desktop.png` });
    reports.push({ kind: 'genuine-input-combat', damageEvents: hits.length, kills: hits.filter(hit => hit.targetHp === 0).length, xpBefore: combatStart.xp, xp: afterCombat.xp, levelBefore: combatStart.level, level: afterCombat.level, looted: afterCombat.inventory.length - combatStart.inventory.length });
    // A point awarded through normal onboarding/progression is spent through the sheet.
    await page.keyboard.down('KeyW');
    await page.locator('#btn-skills').click();
    await page.waitForFunction(() => window.__selva.local.paused);
    const pausedPosition = await state(page);
    await page.waitForTimeout(350);
    assert.equal((await state(page)).x, pausedPosition.x, 'opening skills pauses the local simulation');
    assert.equal((await state(page)).y, pausedPosition.y, 'paused movement cannot drift');
    assert.equal(await page.evaluate(() => window.__selva.app.keys.size), 0, 'opening a modal clears held movement');
    await page.keyboard.up('KeyW');
    await page.locator('.sk-node[data-id="ferocia"]').click();
    await page.locator('#sk-learn').click();
    await page.waitForFunction(() => window.__selva.local.progress.ranks.ferocia === 1);
    await closePanel(page, 'skills');
    await page.waitForFunction(() => !window.__selva.local.paused);

    // Fixture-only coverage: visit later authored areas without claiming a boss clear.
    for (const canto of ['inferno_06', 'inferno_07', 'inferno_08', 'inferno_31', 'inferno_01']) {
      await page.evaluate(canto => window.__selvaTravel(canto), canto);
      await page.waitForFunction(canto => window.__selva.app.room.cantoId === canto, canto);
      await page.waitForTimeout(650);
      assert.ok(await page.evaluate(() => window.__selva.app.room.entities.length > 0));
      await assertImages(page);
    }
    // Bank genuinely acquired spare loot at the actual stash.
    await keyWalkTo(page, { x: 52, y: 78 }); await page.keyboard.press('KeyE');
    await page.waitForFunction(() => !document.getElementById('stash-wrap').classList.contains('hidden'));
    const bag = (await state(page)).inventory.filter(item => !item.equipSlot);
    assert.ok(bag.length > 0);
    const spare = bag.find(item => bag.filter(other => other.name === item.name).length === 1) || bag[0];
    await page.locator('#inv-grid').getByRole('button', { name: new RegExp(escape(spare.name)) }).first().click();
    await page.locator('#btn-stash').click();
    await page.waitForFunction(() => window.__selva.local.player.stash.length > 0);
    await closePanel(page, 'inventory');
    // Explicit previous-clear fixture tests save round-tripping, not combat success.
    await page.evaluate(() => { window.__selva.local.player.firstClears.add('inferno_05'); window.__selva.local.save(); });
    const saved = await state(page);
    await page.reload();
    await page.locator('#btn-enter-wood').waitFor({ state: 'visible' });
    assert.match(await page.locator('#btn-enter-wood').textContent(), /Continue journey/);
    await enter(page);
    const restored = await state(page);
    for (const key of ['name', 'ash', 'inventory', 'stash', 'clears', 'xp', 'level', 'ranks', 'loadout']) assert.deepEqual(restored[key], saved[key], `${key} survives a complete reload`);
    await page.locator('#btn-ah').click();
    await page.waitForFunction(() => window.__selvaListings.length === 24);
    const fresh = await page.evaluate(() => window.__selvaListings);
    assert.notDeepEqual(fresh.map(offer => [offer.item.name, offer.priceAsh, offer.item.rolledStats]), shop.stock.map(offer => [offer.item.name, offer.priceAsh, offer.item.rolledStats]), 'a new launch rolls fresh offers, prices and stats');
    assert.ok(fresh.every(offer => !shop.stock.some(old => old.id === offer.id)), 'new offers have new identities');
    await closePanel(page, 'ah');
    await page.locator('#btn-menu').click();
    await page.locator('#pvp-menu').getByRole('menuitem', { name: /Back to games/ }).click();
    await page.waitForURL(`${base}/`);
    assert.equal(await page.locator('.game-card').count(), 3, 'Games home has exactly three experience cards');
    assert.deepEqual(await page.locator('.game-card').evaluateAll(cards => cards.map(card => card.dataset.gameLink)), ['soldier', 'piano', 'selva']);
    await assertImages(page);
    reports.push({ kind: 'market-and-persistence', offerCount: shop.stock.length, bought: shop.bought.item.name, paid: shop.bought.priceAsh, savedAsh: saved.ash, savedXp: saved.xp, savedStash: saved.stash.length, laterAreaRenderFixtures: ['inferno_06', 'inferno_07', 'inferno_08', 'inferno_31'], previousClearFixture: 'inferno_05' });
    console.log('Selva desktop: genuine movement/combat/loot/XP, modal pause, skills, market, equipment, saves and return to Games passed.');
    await context.close();
  }

  if (phase === 'all' || phase === 'phone') for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    // Each independent device run releases Chromium's software-rendering resources.
    await freshBrowser();
    const label = `${viewport.width}x${viewport.height}`;
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const page = await open(context, label);
    await assertReachable(page, '#btn-enter-wood');
    await enter(page, 'Touch Pilgrim');
    for (const selector of ['#btn-attack', '#btn-dash', '#btn-sip', '#btn-interact', '#btn-skills', '#btn-inv', '#btn-ah', '#btn-menu']) await assertReachable(page, selector);
    const before = await state(page), stick = await page.locator('#virtual-joystick .vj-base').boundingBox();
    const cdp = await context.newCDPSession(page), center = { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 };
    assert.equal(await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('#virtual-joystick'), center), true, 'the visible stick ring receives the touch');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...center, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: center.x + 48, y: center.y - 12, id: 1 }] });
    await page.waitForTimeout(550);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const moved = await state(page);
    assert.ok(Math.hypot(moved.x - before.x, moved.y - before.y) > 1, 'actual touch stick moves the character');
    await page.locator('#btn-inv').tap(); await assertReachable(page, '[data-close="inventory"]'); await assertTutorialHidden(page); await closePanel(page, 'inventory');
    await page.locator('#btn-skills').tap(); await assertReachable(page, '[data-close="skills"]'); await closePanel(page, 'skills');
    await page.locator('#btn-ah').tap();
    await page.waitForFunction(() => window.__selvaListings.length === 24);
    await assertTutorialHidden(page);
    await assertReachable(page, '[data-close="ah"]');
    await page.locator('#ah-list .ah-row button:not(:disabled)').first().scrollIntoViewIfNeeded();
    await page.locator('#ah-list .ah-row button:not(:disabled)').first().tap();
    await page.waitForFunction(() => window.__selvaListings.length === 23);
    await page.screenshot({ path: `${shots}/auction-${label}.png` });
    await closePanel(page, 'ah');
    await page.locator('#btn-menu').tap();
    await assertReachable(page, '#pvp-menu .solo-back');
    await page.locator('.pvp-menu-catch').tap({ position: { x: 5, y: 5 } });
    await page.waitForFunction(() => document.getElementById('pvp-menu').classList.contains('hidden'));
    // Explicit arena-entry fixture isolates the phone's actual hold-to-attack input.
    await page.evaluate(() => window.__selvaTravel('inferno_05'));
    await page.waitForFunction(() => window.__selva.app.room.cantoId === 'inferno_05');
    const attackBox = await assertReachable(page, '#btn-attack');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: attackBox.x + attackBox.width / 2, y: attackBox.y + attackBox.height / 2, id: 2 }] });
    await page.waitForFunction(() => window.__selvaMessages.some(message => message.type === 'combat' && message.attackerId === 'solo-pilgrim' && message.damage > 0), null, { timeout: 15000 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.equal(await page.evaluate(() => window.__selva.app.attackHeld), false, 'lifting the attack thumb stops held attacks');
    await assertImages(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'phone has no horizontal page overflow');
    await page.screenshot({ path: `${shots}/phone-${label}.png` });
    reports.push({ kind: 'phone-input-and-menus', viewport, combatEntryFixture: 'inferno_05', actualTouchDamage: true, moved: Math.hypot(moved.x - before.x, moved.y - before.y) });
    console.log(`Selva phone ${label}: first-drag movement, menus, auction purchase, actual hold-to-attack and release passed.`);
    await context.close();
  }
  assert.deepEqual(external, [], 'single-player requests only local game resources');
  assert.deepEqual(sockets, [], 'single-player opens no WebSocket connection');
  assert.deepEqual(errors, [], 'no browser exceptions, console errors, or missing resources');
  await writeFile(`${shots}/${phase === 'all' ? 'report' : `report-${phase}`}.json`, JSON.stringify({ reports, errors, external, sockets }, null, 2));
  console.log(`Selva native browser (${phase}): ${reports.map(report => report.kind).join(', ')}; local-only network and no browser errors passed.`);
} finally { await browser?.close(); server?.kill(); }
