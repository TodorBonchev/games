import test from 'node:test';
import assert from 'node:assert/strict';
import { createGarden, PLANTS, WAVES } from '../garden-game.js';

const fresh = () => { const game = createGarden({ random: () => 0.5 }); game.start(); return game; };
const collect = game => { for (const sun of [...game.state.suns]) game.collectSun(sun.id); };

test('planting spends sun once and respects occupancy, bounds, cooldown and available resources', () => {
  const game = fresh();
  assert.ok(game.place('pea', 2, 1).ok);
  assert.equal(game.state.sun, 100);
  assert.equal(game.place('bloom', 2, 1).ok, false);
  assert.equal(game.place('pea', 1, 1).ok, false);
  assert.equal(game.place('bloom', -1, 1).ok, false);
  assert.equal(game.place('bloom', 0.5, 1).ok, false);
  assert.equal(game.place('unknown', 0, 0).ok, false);
  assert.equal(game.state.sun, 100);
  game.tick(3);
  assert.ok(game.place('pea', 1, 1).ok);
  assert.equal(game.state.sun, 0);
  game.tick(3);
  assert.equal(game.place('bloom', 0, 0).ok, false);
  assert.equal(game.state.plants.length, 2);
});

test('sun must be collected, expires, and a Sun bloom produces a renewable supply', () => {
  const game = fresh();
  game.place('bloom', 0, 0);
  game.tick(7.1);
  assert.equal(game.state.suns.length, 2, 'one sky sun and one grown sun');
  assert.equal(game.state.sun, 150, 'uncollected sun is not spendable');
  const sun = game.state.suns[0];
  assert.ok(game.collectSun(sun.id));
  assert.equal(game.state.sun, 175);
  assert.equal(game.collectSun(sun.id), false, 'a sun cannot be collected twice');
  const grown = game.state.suns[0].id;
  game.tick(14.1);
  assert.equal(game.collectSun(grown), false, 'expired sun cannot be collected');
  assert.ok(game.state.suns.some(drop => Math.abs(drop.x - 0.3) < 0.001), 'the bloom produces again');
});

test('pause freezes the entire level, including cooldowns, suns and scheduled waves', () => {
  const game = fresh();
  game.place('bloom', 0, 0);
  game.tick(5.5);
  game.pause();
  const snapshot = structuredClone(game.state);
  game.tick(100);
  assert.equal(game.place('pea', 2, 1).ok, false);
  assert.equal(game.remove(0, 0).ok, false);
  assert.equal(game.collectSun(game.state.suns[0].id), false);
  assert.deepEqual(game.state, snapshot);
  game.resume();
  game.tick(1);
  assert.ok(game.state.time > snapshot.time);
});

test('the shovel refunds half the cost and cannot refund the same plant twice', () => {
  const game = fresh();
  game.place('nut', 0, 3);
  assert.equal(game.state.sun, 125);
  assert.ok(game.remove(0, 3).ok);
  assert.equal(game.state.sun, 162);
  assert.equal(game.state.plants.length, 0);
  assert.equal(game.remove(0, 3).ok, false);
  assert.equal(game.state.sun, 162);
});

test('Pea pods defend their own lane and do not shoot through an adjacent lane', () => {
  const defended = fresh(), adjacent = fresh();
  defended.place('pea', 2, 1);
  adjacent.place('pea', 0, 1);
  defended.tick(24);
  adjacent.tick(24);
  assert.equal(defended.state.defeated, 1);
  assert.equal(adjacent.state.defeated, 0);
  assert.equal(adjacent.state.zombies[0].row, 2);
});

test('a Shellnut holds an attacker while biting wears down its health', () => {
  const game = fresh();
  game.place('nut', 2, 6);
  game.tick(35);
  const nut = game.state.plants[0];
  assert.ok(nut.hp < PLANTS.nut.hp && nut.hp > 0);
  const zombie = game.state.zombies.find(zombie => zombie.row === 2);
  assert.ok(zombie.biting);
  assert.ok(zombie.x > nut.col, 'the zombie stays on the approach side of the blocker');
  game.tick(35);
  assert.ok(!game.state.plants.some(plant => plant.type === 'nut'), 'the wall can eventually be eaten');
});

test('mowers are single-use and leaving the garden undefended loses the level', () => {
  const game = fresh();
  game.tick(400);
  assert.equal(game.state.mode, 'lost');
  assert.ok(game.state.mowers.some(mower => mower.spent));
  assert.ok(game.state.defeated > 0, 'emergency mowers stop the first intruders');
  const snapshot = structuredClone(game.state);
  game.tick(400);
  assert.deepEqual(game.state, snapshot, 'a finished level cannot keep progressing');
});

test('the complete sample level is winnable with legal planting and collected sun', () => {
  const game = fresh();
  game.place('bloom', 0, 0);
  game.place('pea', 2, 1);
  let secondBloom = false;
  for (let turn = 0; turn < 1000 && game.state.mode === 'playing'; turn++) {
    collect(game);
    if (!secondBloom) secondBloom = game.place('bloom', 1, 0).ok;
    for (const [row, col] of [[1, 1], [3, 1], [0, 1], [4, 1], [2, 2], [1, 2], [3, 2], [0, 2], [4, 2]]) {
      if (!game.state.plants.some(plant => plant.row === row && plant.col === col)) { game.place('pea', row, col); break; }
    }
    game.tick(0.25);
  }
  assert.equal(game.state.mode, 'won');
  assert.equal(game.state.defeated, WAVES.length);
  assert.equal(game.state.spawned, WAVES.length);
  assert.equal(game.state.wave, 3);
  assert.equal(game.state.mowers.filter(mower => mower.spent).length, 0, 'a good strategy saves every mower');
  assert.ok(game.state.sun >= 0, 'the strategy never borrows sun');
});

test('restart clears defeated enemies, suns, timers, cooldowns and spent mowers', () => {
  const game = fresh();
  game.tick(90);
  game.start();
  assert.equal(game.state.time, 0);
  assert.equal(game.state.mode, 'playing');
  assert.equal(game.state.sun, 200);
  assert.equal(game.state.defeated, 0);
  assert.equal(game.state.wave, 1);
  for (const list of ['plants', 'zombies', 'peas', 'suns', 'effects']) assert.equal(game.state[list].length, 0);
  assert.ok(game.state.mowers.every(mower => !mower.spent && !mower.active));
  assert.deepEqual(game.state.cooldowns, { bloom: 0, pea: 0, nut: 0 });
});
