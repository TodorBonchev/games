import test from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_KEYS, readGameSave, writeGameSave, removeGameSave } from '../save-store.js';

function memory() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
test('each game has its own save and clearing a run keeps scores, stars and the other game', () => {
  const storage = memory();
  storage.setItem('szBest', '900');
  storage.setItem('games:garden:level3', '{"stars":3,"time":140}');
  assert.ok(writeGameSave('soldier', { schema: 1, level: 2, wave: 3 }, storage));
  assert.ok(writeGameSave('garden', { schema: 1, level: 4, wave: 2 }, storage));
  assert.ok(writeGameSave('borrowed', { schema: 1, level: 5, loop: 3 }, storage));
  assert.ok(writeGameSave('moonbounce', { schema: 1, wave: 4, mode: 'playing' }, storage));
  assert.ok(writeGameSave('popwake', { schema: 1, level: 3, mode: 'running' }, storage));
  assert.ok(writeGameSave('pondpost', { schema: 1, level: 4, mode: 'flying' }, storage));
  for (const game of ['prism', 'ribbon', 'dewfall']) assert.ok(writeGameSave(game, { schema: 1, level: 2, mode: 'playing' }, storage));
  assert.equal(new Set(Object.values(SAVE_KEYS)).size, 9);
  assert.equal(readGameSave('soldier', storage).data.level, 2);
  assert.equal(readGameSave('garden', storage).data.level, 4);
  assert.ok(readGameSave('garden', storage).savedAt > 0);
  assert.ok(removeGameSave('soldier', storage));
  assert.equal(readGameSave('soldier', storage), null);
  assert.equal(readGameSave('garden', storage).data.wave, 2);
  assert.equal(readGameSave('borrowed', storage).data.loop, 3);
  assert.equal(readGameSave('moonbounce', storage).data.wave, 4);
  assert.equal(readGameSave('popwake', storage).data.level, 3);
  assert.equal(readGameSave('pondpost', storage).data.level, 4);
  for (const game of ['prism', 'ribbon', 'dewfall']) assert.equal(readGameSave(game, storage).data.level, 2);
  assert.ok(removeGameSave('ribbon', storage));
  assert.equal(readGameSave('ribbon', storage), null);
  assert.equal(readGameSave('prism', storage).data.level, 2);
  assert.equal(readGameSave('dewfall', storage).data.level, 2);
  assert.equal(storage.getItem('szBest'), '900');
  assert.equal(storage.getItem('games:garden:level3'), '{"stars":3,"time":140}');
});
test('corrupt, incompatible and oversized saves are ignored without throwing', () => {
  const storage = memory();
  for (const raw of ['{', 'null', '42', '{"version":2,"savedAt":1,"data":{}}', ' '.repeat(250001)]) {
    storage.setItem(SAVE_KEYS.garden, raw);
    assert.equal(readGameSave('garden', storage), null);
  }
});
test('blocked or full storage is a recoverable failure and does not erase a previous save', () => {
  const storage = memory();
  writeGameSave('garden', { level: 1 }, storage);
  storage.setItem = () => { throw new Error('Quota exceeded'); };
  assert.equal(writeGameSave('garden', { level: 2 }, storage), false);
  assert.equal(readGameSave('garden', storage).data.level, 1);
  const blocked = new Proxy({}, { get() { throw new Error('Storage unavailable'); } });
  assert.equal(readGameSave('garden', blocked), null);
  assert.equal(writeGameSave('soldier', {}, blocked), false);
  assert.equal(removeGameSave('soldier', blocked), false);
});
