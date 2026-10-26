import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from './harness.mjs';
import { parseSoldierSave } from '../soldier-save.js';
import { SAVE_KEYS } from '../save-store.js';

const storageOf = window => Object.fromEntries(Array.from({ length: window.localStorage.length }, (_, i) => {
  const key = window.localStorage.key(i); return [key, window.localStorage.getItem(key)];
}));

test('an operation resumes health, weapon, score, enemies, supplies, timers and wave progress after a reload', async t => {
  const original = await createGame(); t.after(() => original.close());
  original.window.document.querySelector('[data-weapon="burst"]').click();
  original.start(); original.step(3);
  original.game.score = 345; original.game.hp = 68;
  original.game.castFrozenOrb();
  original.game.spawnDrop('medkit', 6); original.game.spawnDrop('overdrive', 9);
  original.game.pause();
  const stored = JSON.parse(original.window.localStorage.getItem(SAVE_KEYS.soldier));
  assert.ok(parseSoldierSave(stored.data), 'the actual runtime produces a valid save');
  const restored = await createGame({ storage: storageOf(original.window) }); t.after(() => restored.close());
  assert.ok(!restored.window.document.getElementById('continueBtn').classList.contains('hide'));
  assert.ok(restored.game.continueRun());
  assert.equal(restored.game.mode, 'play');
  assert.equal(restored.game.hp, 68);
  assert.equal(restored.game.score, 345);
  assert.equal(restored.game.weapon.id, 'burst');
  assert.equal(restored.game.wave, original.game.wave);
  assert.equal(restored.game.toSpawn, original.game.toSpawn);
  assert.equal(restored.game.time, stored.data.time);
  assert.equal(restored.game.frozenOrb.cooldown, stored.data.frozenCooldown);
  assert.deepEqual([...restored.game.zombies].map(z => [z.userData.type, z.userData.hp]), [...original.game.zombies].filter(z => !z.userData.dead).map(z => [z.userData.type, z.userData.hp]));
  assert.equal(restored.game.progression.drops.length, original.game.progression.drops.length);
  assert.equal(restored.game.firing, false, 'held touch controls never persist across a reload');
});
test('pending upgrades resume with the same choices and apply once to the next wave', async t => {
  const original = await createGame(); t.after(() => original.close()); original.start();
  original.game.clearWave(); original.step(4.2);
  assert.equal(original.game.mode, 'upgrade');
  const choices = [...original.game.progression.choices].map(choice => choice.id);
  const restored = await createGame({ storage: storageOf(original.window) }); t.after(() => restored.close());
  assert.ok(restored.game.continueRun());
  assert.equal(restored.game.mode, 'upgrade');
  assert.deepEqual([...restored.game.progression.choices].map(choice => choice.id), choices);
  restored.chooseUpgrade(0);
  assert.equal(restored.game.wave, 2);
  assert.equal(restored.game.progression.ranks[choices[0]], 1);
});
test('the island transition is recoverable from local storage even without the old tab session', async t => {
  const original = await createGame(); t.after(() => original.close()); original.start(); original.game.score = 890;
  original.game.winLevel();
  const stored = JSON.parse(original.window.localStorage.getItem(SAVE_KEYS.soldier));
  assert.equal(stored.data.level, 2);
  assert.equal(stored.data.wave, 1);
  assert.ok(parseSoldierSave(stored.data));
  const restored = await createGame({ level: 2, storage: storageOf(original.window) }); t.after(() => restored.close());
  assert.ok(restored.game.continueRun());
  assert.equal(restored.game.level, 2);
  assert.equal(restored.game.score, 890);
  assert.equal(restored.game.wave, 1);
});
test('ending or losing a run clears its checkpoint and keeps records and preferences', async t => {
  const env = await createGame(); t.after(() => env.close()); env.start(); env.game.score = 999;
  env.game.pause(); assert.ok(env.window.localStorage.getItem(SAVE_KEYS.soldier));
  env.game.returnToMenu();
  assert.equal(env.window.localStorage.getItem(SAVE_KEYS.soldier), null);
  assert.equal(env.window.localStorage.getItem('szBest'), '999');
  env.start(); env.game.damage(10000);
  assert.equal(env.game.mode, 'over');
  assert.equal(env.window.localStorage.getItem(SAVE_KEYS.soldier), null);
});
