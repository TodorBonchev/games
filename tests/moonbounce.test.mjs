import test from 'node:test';
import assert from 'node:assert/strict';
import { createMoonbounce, parseMoonbounceSave, orbitCapacity, WAVES, ARENA_RADIUS, MAX_ORBITS, MAX_MOONS, MAX_ENEMIES, MAX_SHOTS, MAX_BULLETS, MAX_EFFECTS } from '../moonbounce-game.js';
import { createMoonbouncePilot } from './moonbounce-strategy.mjs';
const advance = (game, seconds, input = {}) => { for (let i = 0; i < Math.round(seconds * 60); i++) game.advance(1 / 60, input); };
const ids = state => [...state.orbits, ...state.moons, ...state.shots, ...state.enemies, ...state.bullets].map(item => item.id);

test('ready and first play show a little orbit, loose moons and targets', () => {
  const game = createMoonbounce();
  assert.equal(game.state.mode, 'ready'); assert.equal(game.state.orbits.length, 4); assert.equal(game.state.moons.length, 6);
  assert.equal(game.burst(), false); assert.equal(game.snapshot(), null);
  game.start(); assert.equal(game.state.mode, 'playing'); assert.equal(game.state.orbits.length, 4);
  assert.equal(game.state.enemies.length, 2); assert.ok(parseMoonbounceSave(game.snapshot()));
});
test('moving gathers moons; lifting launches those same moons and can defeat visitors', () => {
  const game = createMoonbounce(); game.start();
  const moon = { ...game.state.moons[0] }, length = Math.hypot(moon.x, moon.z);
  advance(game, 1, { x: moon.x / length, z: moon.z / length });
  assert.ok(game.state.orbits.some(item => item.id === moon.id), 'the player gathered a real loose moon');
  const orbitIds = game.state.orbits.map(item => item.id); const before = game.state.kills;
  assert.ok(game.burst()); assert.equal(game.state.orbits.length, 0);
  assert.deepEqual(game.state.shots.map(item => item.id), orbitIds, 'orbiting moons become the launched moons');
  assert.ok(game.state.events.some(item => item.type === 'burst' && item.count === orbitIds.length && item.storm === false));
  assert.ok(game.state.shots.every(item => item.storm === false && item.damage === 2 && item.bounces === 1), 'a small launch keeps its normal strength');
  advance(game, 1);
  assert.ok(game.state.kills > before, 'launched moons reach an enemy');
  assert.ok(game.state.score > 0); assert.ok(game.state.moons.length > 0);
  assert.equal(new Set(ids(game.state)).size, ids(game.state).length);
});
test('gathering six moons creates a Moonstorm whose real checkpoint resumes exactly', () => {
  const game = createMoonbounce(); game.start();
  for (let tick = 0; tick < 600 && game.state.mode === 'playing' && game.state.orbits.length < 6; tick++) {
    const p = game.state.player;
    const moon = game.state.moons.filter(item => !item.cooldown).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    assert.ok(moon); const dx = moon.x - p.x, dz = moon.z - p.z, d = Math.hypot(dx, dz) || 1;
    game.advance(1 / 60, { x: dx / d, z: dz / d });
  }
  assert.equal(game.state.orbits.length, 6, 'the extra moons were gathered through movement');
  const ids = game.state.orbits.map(moon => moon.id); assert.ok(game.burst());
  assert.deepEqual(game.state.events.at(-1), { type: 'burst', count: 6, storm: true });
  assert.ok(game.state.effects.some(effect => effect.type === 'storm'));
  assert.deepEqual(game.state.shots.map(shot => shot.id), ids);
  assert.ok(game.state.shots.every(shot => shot.storm && shot.damage === 3 && shot.bounces === 2));
  const actualSave = JSON.parse(JSON.stringify(game.snapshot()));
  assert.ok(parseMoonbounceSave(actualSave));
  const restored = createMoonbounce(); assert.ok(restored.restore(actualSave)); game.pause();
  assert.deepEqual(restored.snapshot(), game.snapshot());
  game.resume(); restored.resume(); advance(game, 1, { x: 0.2 }); advance(restored, 1, { x: 0.2 });
  assert.deepEqual(restored.snapshot(), game.snapshot(), 'shots and future collisions survive the saved run');
});
test('fully upgraded Moonstorm shots fit the save bounds', () => {
  // These two seeds naturally offer the same upgrade at all four wave breaks.
  // Complete the waves with legal inputs to exercise the actual max values.
  for (const [seed, upgrade] of [[8, 'power'], [13, 'bounces']]) {
    const game = createMoonbounce({ seed }); game.start(); const pilot = createMoonbouncePilot(game);
    for (let ticks = 0; ticks < 60 * 180 && game.state.wave < 5 && game.state.mode !== 'lost'; ticks++) {
      if (game.state.mode === 'upgrade') { assert.ok(game.state.choices.some(choice => choice.id === upgrade)); assert.ok(game.chooseUpgrade(upgrade)); }
      else pilot();
    }
    assert.equal(game.state.wave, 5); assert.equal(game.state.upgrades[upgrade], 4);
    assert.ok(game.state.orbits.length >= 6); assert.ok(game.burst());
    const launched = game.state.shots.filter(shot => shot.storm);
    assert.ok(launched.length >= 6);
    if (upgrade === 'power') assert.ok(launched.every(shot => shot.damage === 7));
    else assert.ok(launched.every(shot => shot.bounces === 6));
    const checkpoint = game.snapshot(); assert.ok(parseMoonbounceSave(checkpoint));
    const restored = createMoonbounce(); assert.ok(restored.restore(checkpoint)); restored.resume(); game.pause(); game.resume();
    advance(game, 0.5, { z: 0.5 }); advance(restored, 0.5, { z: 0.5 }); assert.deepEqual(restored.snapshot(), game.snapshot());
  }
});
test('fixed-clock movement and actions are identical at 30 Hz and 60 Hz', () => {
  const a = createMoonbounce({ seed: 123 }), b = createMoonbounce({ seed: 123 }); a.start(); b.start();
  assert.ok(a.burst() && b.burst());
  for (let i = 0; i < 360; i++) a.advance(1 / 60, { x: 0.7, z: -0.4 });
  for (let i = 0; i < 180; i++) b.advance(1 / 30, { x: 0.7, z: -0.4 });
  assert.deepEqual(a.snapshot(), b.snapshot());
  const straight = createMoonbounce(), diagonal = createMoonbounce(); straight.start(); diagonal.start();
  advance(straight, 0.5, { x: 1 }); advance(diagonal, 0.5, { x: 1, z: 1 });
  assert.ok(Math.abs(Math.hypot(straight.state.player.x, straight.state.player.z) - Math.hypot(diagonal.state.player.x, diagonal.state.player.z)) < 1e-8);
});
test('the arena edge keeps the player and every orbiting moon inside the rail', () => {
  const game = createMoonbounce(); game.start(); advance(game, 3, { x: 1 });
  const { player, orbits } = game.state;
  assert.ok(Math.hypot(player.x, player.z) <= ARENA_RADIUS - 0.48 + 1e-8);
  assert.ok(orbits.every(moon => Math.hypot(moon.x, moon.z) <= ARENA_RADIUS - 0.2 + 1e-8));
  assert.ok(parseMoonbounceSave(game.snapshot()));
});
test('a moon launched inward from the rail travels inward without losing a bounce', () => {
  const game = createMoonbounce(); game.start(); advance(game, 3, { x: 1 }); game.burst();
  const shot = game.state.shots.find(item => Math.hypot(item.x, item.z) > 7.799 && item.x * item.dx + item.z * item.dz < 0);
  assert.ok(shot, 'a moon starts at the rail and aims toward an enemy inside it');
  const before = { ...shot }; advance(game, 1 / 60);
  const after = game.state.shots.find(item => item.id === before.id);
  assert.ok(after); assert.ok(Math.hypot(after.x, after.z) < Math.hypot(before.x, before.z));
  assert.equal(after.bounces, before.bounces);
});
test('pause freezes the clock and input; saved runs resume from the same state', () => {
  const game = createMoonbounce(); game.start(); game.burst(); advance(game, 1, { x: 1 });
  assert.ok(game.pause()); const saved = game.snapshot();
  advance(game, 12, { z: 1 }); assert.equal(game.burst(), false); assert.equal(game.chooseUpgrade('power'), false);
  assert.deepEqual(game.snapshot(), saved);
  const restored = createMoonbounce(); assert.ok(restored.restore(saved)); assert.deepEqual(restored.snapshot(), saved);
  assert.ok(game.resume()); assert.ok(restored.resume());
  advance(game, 2, { x: -0.2, z: 0.8 }); advance(restored, 2, { x: -0.2, z: 0.8 });
  assert.deepEqual(restored.snapshot(), game.snapshot());
});
test('all five waves and the boss can be won with ordinary steering, lifts and upgrades', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 82941]) {
    const game = createMoonbounce({ seed }); game.start(); const pilot = createMoonbouncePilot(game);
    let bossAt, upgrades = 0, bossFired = false;
    for (let tick = 0; tick < 60 * 180 && ['playing', 'upgrade'].includes(game.state.mode); tick++) {
      const was = game.state.mode, priorBossTimer = game.state.enemies.find(enemy => enemy.type === 'boss')?.shotTimer;
      pilot(); const state = game.state;
      const currentBoss = state.enemies.find(enemy => enemy.type === 'boss');
      if (priorBossTimer !== undefined && currentBoss && currentBoss.shotTimer > priorBossTimer + 1) bossFired = true;
      if (was === 'upgrade') upgrades++;
      if (state.bossSpawned && bossAt === undefined) bossAt = state.waveTime;
      assert.ok(state.orbits.length <= orbitCapacity(state.upgrades) && state.orbits.length <= MAX_ORBITS);
      assert.ok(state.moons.length <= MAX_MOONS && state.shots.length <= MAX_SHOTS && state.enemies.length <= MAX_ENEMIES && state.bullets.length <= MAX_BULLETS && state.effects.length <= MAX_EFFECTS);
      if (tick % 180 === 0 && state.mode !== 'lost') assert.ok(parseMoonbounceSave(game.snapshot()), `seed ${seed}, tick ${tick} checkpoint is valid`);
    }
    assert.equal(game.state.mode, 'won', `seed ${seed} finishes: wave ${game.state.wave}, HP ${game.state.player.hp}`);
    assert.equal(upgrades, 4); assert.ok(game.state.bossDefeated); assert.ok(bossFired, `seed ${seed}: the boss gets to attack`);
    assert.ok(game.state.waveTime - bossAt < 25, `seed ${seed}: boss can be defeated without a long stall`);
    assert.equal(new Set(ids(game.state)).size, ids(game.state).length);
  }
});
test('a saved run from before balancing keeps its current visitors and can continue', () => {
  const game = createMoonbounce({ seed: 1 }); game.start(); const pilot = createMoonbouncePilot(game);
  while (game.state.wave < 3 && ['playing', 'upgrade'].includes(game.state.mode)) pilot();
  const save = game.snapshot(), previousHealth = { drifter: 2, dasher: 3, shooter: 4 };
  for (const enemy of save.enemies) { enemy.maxHp = previousHealth[enemy.type]; enemy.hp = Math.min(enemy.hp, enemy.maxHp); }
  const restored = createMoonbounce(); assert.ok(restored.restore(save));
  assert.equal(restored.state.mode, 'paused'); assert.ok(restored.resume());
  advance(restored, 1, { x: 0.5 }); assert.ok(parseMoonbounceSave(restored.snapshot()));
  while (!game.state.bossSpawned && ['playing', 'upgrade'].includes(game.state.mode)) pilot();
  const oldBossSave = game.snapshot(), boss = oldBossSave.enemies.find(enemy => enemy.type === 'boss');
  for (const oldMaxHp of [140, 180]) {
    boss.maxHp = oldMaxHp; boss.hp = Math.min(boss.hp, oldMaxHp);
    oldBossSave.shots.forEach(shot => { delete shot.storm; });
    assert.ok(restored.restore(oldBossSave)); assert.equal(restored.state.enemies.find(enemy => enemy.type === 'boss').maxHp, oldMaxHp);
  }
});
test('upgrade choices, wave progress, launched moons and RNG survive an interruption', () => {
  const game = createMoonbounce({ seed: 5 }); game.start(); const pilot = createMoonbouncePilot(game);
  while (game.state.mode === 'playing') pilot();
  assert.equal(game.state.mode, 'upgrade'); assert.equal(game.state.choices.length, 3);
  const checkpoint = game.snapshot(), restored = createMoonbounce(); assert.ok(restored.restore(checkpoint));
  assert.deepEqual(restored.snapshot(), checkpoint); assert.equal(restored.chooseUpgrade('not-a-choice'), false);
  const id = checkpoint.choices[0].id; assert.ok(game.chooseUpgrade(id)); assert.ok(restored.chooseUpgrade(id));
  assert.deepEqual(restored.snapshot(), game.snapshot());
  for (let i = 0; i < 180; i++) {
    if (i === 25 || i === 95) { assert.equal(game.burst(), restored.burst()); }
    game.advance(1 / 60, { x: 0.4, z: -0.1 }); restored.advance(1 / 60, { x: 0.4, z: -0.1 });
  }
  assert.deepEqual(restored.snapshot(), game.snapshot()); assert.ok(JSON.stringify(game.snapshot()).length < 250000);
});
test('a finishing bounce wins before an incoming shot can steal the victory', () => {
  const game = createMoonbounce({ seed: 1 }); game.start(); const pilot = createMoonbouncePilot(game);
  while (!game.state.bossSpawned && ['playing', 'upgrade'].includes(game.state.mode)) pilot();
  assert.ok(game.state.bossSpawned);
  const save = game.snapshot(), boss = save.enemies.find(enemy => enemy.type === 'boss');
  save.enemies = [boss]; Object.assign(boss, { x: 3, z: 0, hp: 1 });
  Object.assign(save.player, { x: 0, z: 0, hp: 1, invulnerable: 0 });
  const moon = save.orbits.pop() || save.moons.pop(); assert.ok(moon);
  save.shots = [{ id: moon.id, x: 3, z: 0, dx: 0, dz: 0, age: 1, life: 2, bounces: 0, damage: 2, target: boss.id, lastHit: 0, ignore: 0 }];
  save.bullets = [{ id: ++save.serial, x: 0, z: 0, dx: 0, dz: 0, life: 1 }];
  assert.ok(parseMoonbounceSave(save)); assert.ok(game.restore(save)); game.resume();
  game.advance(1 / 60); assert.equal(game.state.mode, 'won'); assert.equal(game.state.player.hp, 1);
  assert.ok(parseMoonbounceSave(game.snapshot()));
});
test('corrupt checkpoints are ignored and do not alter the current run', () => {
  const game = createMoonbounce(); game.start(); advance(game, 1, { x: 0.5 }); const saved = game.snapshot();
  for (const corrupt of [data => data.wave = 6, data => data.player.x = Infinity, data => data.player.hp = 0,
    data => data.enemies[0].type = '__proto__', data => data.moons[0].id = data.orbits[0].id,
    data => data.orbits = Array(MAX_ORBITS + 1).fill({}), data => data.upgrades.capacity = -1,
    data => data.mode = 'won', data => data.random = null]) {
    const broken = structuredClone(saved); corrupt(broken);
    assert.equal(parseMoonbounceSave(broken), null); assert.equal(game.restore(broken), false); assert.deepEqual(game.snapshot(), saved);
  }
  assert.equal(parseMoonbounceSave(null), null);
});
test('the heart upgrade increases maximum health and heals at the next wave', () => {
  let game;
  for (let seed = 1; seed <= 30; seed++) {
    const candidate = createMoonbounce({ seed }); candidate.start(); const pilot = createMoonbouncePilot(candidate);
    while (candidate.state.mode === 'playing') pilot();
    if (candidate.state.mode === 'upgrade' && candidate.state.choices.some(choice => choice.id === 'heart')) { game = candidate; break; }
  }
  assert.ok(game); const previous = game.state.player.hp;
  assert.ok(game.chooseUpgrade('heart')); assert.equal(game.state.wave, 2); assert.equal(game.state.player.maxHp, 115);
  assert.ok(game.state.player.hp >= previous); assert.equal(game.state.upgrades.heart, 1);
  assert.ok(parseMoonbounceSave(game.snapshot()));
});
