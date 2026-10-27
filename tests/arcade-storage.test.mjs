import test from 'node:test';
import assert from 'node:assert/strict';
import { readArcadeSave, writeArcadeSave, readArcadeRecord, addArcadeWin } from '../arcade/storage.js';
import * as THREE from '../vendor/three/build/three.module.js';
import { arcadeGames } from '../arcade/catalog.js';

function memory() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
function save(id, score) { return { schema: 1, id, seed: 123, mode: 'playing', state: { schema: 1, id, mode: 'playing', score } }; }

test('independent arcade checkpoints and wins do not overwrite one another or existing game slots', () => {
  const storage = memory(); storage.setItem('games:save:lantern', 'existing');
  assert.ok(writeArcadeSave('first-star', save('first-star', 4), storage));
  assert.ok(writeArcadeSave('second-wave', save('second-wave', 9), storage));
  assert.ok(addArcadeWin('first-star', storage));
  assert.equal(readArcadeSave('first-star', storage).state.score, 4);
  assert.equal(readArcadeSave('second-wave', storage).state.score, 9);
  assert.equal(readArcadeRecord('first-star', storage).wins, 1);
  assert.equal(readArcadeRecord('second-wave', storage).wins, 0);
  assert.equal(storage.getItem('games:save:lantern'), 'existing');
});
test('corrupt, oversized, mismatched and blocked storage is recoverable', () => {
  const storage = memory();
  for (const raw of ['{', 'null', ' '.repeat(250001), JSON.stringify({version: 1, savedAt: 1, data: save('other', 0)})]) {
    storage.setItem('games:save:arcade:first-star', raw); assert.equal(readArcadeSave('first-star', storage), null);
  }
  for (const state of [{ schema: 1, id: 'other', mode: 'playing' }, { schema: 2, id: 'first-star', mode: 'playing' }, { schema: 1, id: 'first-star', mode: 'won' }]) {
    storage.setItem('games:save:arcade:first-star', JSON.stringify({ version: 1, savedAt: 1, data: { ...save('first-star', 0), state } }));
    assert.equal(readArcadeSave('first-star', storage), null);
  }
  assert.equal(writeArcadeSave('../bad', save('../bad', 0), storage), false);
  const blocked = new Proxy({}, { get() { throw new Error('Storage unavailable'); } });
  assert.equal(readArcadeSave('first-star', blocked), null);
  assert.equal(writeArcadeSave('first-star', save('first-star', 0), blocked), false);
  assert.equal(addArcadeWin('first-star', blocked), false);
});

test('every actual game checkpoint survives storage and a fresh controller restore', () => {
  const storage = memory();
  for (const definition of arcadeGames) {
    const game = definition.create({ THREE, root: new THREE.Group(), seed: 17 });
    game.update(.05);
    const data = { schema: 1, id: definition.id, seed: 17, mode: game.state.mode, state: game.snapshot() };
    assert.ok(writeArcadeSave(definition.id, data, storage), `${definition.id}: save accepted`);
    const read = readArcadeSave(definition.id, storage);
    const fresh = definition.create({ THREE, root: new THREE.Group(), seed: read.seed });
    assert.ok(fresh.restore(read.state), `${definition.id}: checkpoint restores`);
    assert.deepEqual(fresh.snapshot(), read.state, `${definition.id}: state remains exact`);
    game.dispose?.(); fresh.dispose?.();
  }
});
