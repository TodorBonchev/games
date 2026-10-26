import test from 'node:test';
import assert from 'node:assert/strict';
import { createGarden, parseGardenSave } from '../garden-game.js';
import { playGarden } from './garden-strategy.mjs';

test('a restored lawn keeps combat, economy, sun, cooldowns and mower progress without advancing offline', () => {
  const original = createGarden({ level: 3, random: () => 0.5 });
  original.start();
  original.place('bloom', 0, 0);
  original.place('pea', 2, 1);
  original.tick(21);
  const saved = original.snapshot();
  const json = JSON.stringify(saved);
  const restored = createGarden({ random: () => 0.5 });
  assert.ok(restored.restore(JSON.parse(json)));
  assert.equal(restored.state.mode, 'paused');
  for (const field of ['level', 'time', 'sun', 'wave', 'spawned', 'defeated', 'nextSkySun', 'plants', 'peas', 'suns', 'mowers', 'cooldowns']) assert.deepEqual(restored.state[field], original.state[field], field);
  assert.deepEqual(restored.state.zombies, original.state.zombies);
  restored.tick(500);
  assert.equal(restored.state.time, saved.time, 'loading cannot silently consume combat time');
  restored.resume();
  original.tick(3); restored.tick(3);
  for (const field of ['time', 'sun', 'plants', 'zombies', 'suns', 'mowers', 'spawned', 'defeated']) assert.deepEqual(restored.state[field], original.state[field], field);
  assert.equal(JSON.stringify(saved), json, 'resuming never mutates the original save');
});
test('new entities after resume receive unique IDs and can be collected and planted normally', () => {
  const game = createGarden({ random: () => 0.5 }); game.start(); game.tick(5.2);
  const restored = createGarden({ random: () => 0.5 });
  assert.ok(restored.restore(game.snapshot())); restored.resume();
  const oldSun = restored.state.suns[0].id;
  assert.ok(restored.collectSun(oldSun));
  assert.ok(restored.place('bloom', 1, 0).ok);
  restored.tick(8);
  const entries = [...restored.state.plants, ...restored.state.zombies, ...restored.state.suns, ...restored.state.peas];
  assert.equal(new Set(entries.map(entry => entry.id)).size, entries.length);
  assert.ok(!restored.state.suns.some(sun => sun.id === oldSun));
});
test('completed levels can resume at the victory screen and invalid saves leave the current run intact', () => {
  const game = createGarden({ level: 5, random: () => 0.5 }); game.start(); playGarden(game);
  const saved = game.snapshot();
  const restored = createGarden();
  assert.ok(restored.restore(saved));
  assert.equal(restored.state.mode, 'won');
  assert.equal(restored.state.level, 5);
  const before = structuredClone(restored.state);
  for (const invalid of [null, {}, { ...saved, schema: 2 }, { ...saved, sun: -1 }, { ...saved, mowers: [null, ...saved.mowers.slice(1)] }, { ...saved, plants: [...saved.plants, saved.plants[0]] }]) {
    assert.equal(restored.restore(invalid), false);
    assert.deepEqual(restored.state, before);
  }
  assert.equal(parseGardenSave({ ...saved, zombies: [null] }), null);
});
