import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from './harness.mjs';
import { parseSoldierSave } from '../soldier-save.js';
import { SAVE_KEYS } from '../save-store.js';

const storageOf = window => Object.fromEntries(Array.from({ length: window.localStorage.length }, (_, i) => {
  const key = window.localStorage.key(i); return [key, window.localStorage.getItem(key)];
}));
const savedRun = env => JSON.parse(env.window.localStorage.getItem(SAVE_KEYS.soldier));
const recovery = env => {
  env.game.clearWave(); env.step(1 / 60);
  assert.equal(env.game.mode, 'play'); assert.equal(env.game.toSpawn, 0);
  assert.ok(env.game.waveBreak > 3.9 && env.game.waveBreak <= 4);
  assert.equal(env.game.recoveryHeld, false);
};
const frozenState = game => ({ time: game.time, seconds: game.combat.seconds, remaining: game.waveBreak,
  held: game.recoveryHeld, hp: game.hp, score: game.score, pos: [...game.pos],
  field: { progress: game.field.progress, completed: game.field.completed },
  drops: [...game.progression.drops].map(drop => ({ id: drop.id, age: drop.age })),
});
function enterOutpost(env) {
  const station = env.game.activities.world.stations.find(s => s.id === 'garden');
  assert.ok(station); env.game.setPos(station.x, station.z);
  assert.ok(env.game.activities.host.open(station.id));
  assert.equal(env.game.activities.host.phase, 'brief');
}

test('recovery retains the default four-second upgrade countdown when the player does not hold it', async t => {
  const env = await createGame(); t.after(() => env.close()); env.start();
  assert.equal(env.game.recoveryHeld, false); recovery(env);
  const panel = env.window.document.getElementById('recoveryPanel');
  assert.ok(panel && !panel.hidden && !panel.classList.contains('hide'), 'wave clear exposes recovery choices');
  assert.match(env.window.document.getElementById('recoveryHold').textContent, /Keep scavenging/i);
  assert.match(env.window.document.getElementById('recoveryReady').textContent, /Upgrade now/i);
  env.step(3.85); assert.equal(env.game.mode, 'play');
  assert.ok(env.game.waveBreak > 0 && env.game.waveBreak < .2);
  env.step(.2); assert.equal(env.game.mode, 'upgrade');
  assert.equal(env.game.wave, 1); assert.equal(env.game.progression.choices.length, 3);
  assert.ok(panel.hidden || panel.classList.contains('hide'), 'recovery choices disappear during upgrade selection');
  env.chooseUpgrade(); assert.equal(env.game.wave, 2); assert.equal(env.game.recoveryHeld, false);
});

test('held recovery keeps movement, supply collection and a full five-second uplink available without spawning enemies', async t => {
  const env = await createGame(); t.after(() => env.close()); env.start(); recovery(env);
  env.click('recoveryHold'); assert.equal(env.game.recoveryHeld, true);
  assert.equal(env.window.document.getElementById('recoveryHold').getAttribute('aria-pressed'), 'true');
  const remaining = env.game.waveBreak, wave = env.game.wave, combatSeconds = env.game.combat.seconds, worldTime = env.game.time;
  const field = env.game.field.position; assert.ok(env.game.field.active);
  env.game.setPos(field[0], field[2]); env.game.setView(0);
  const start = [...env.game.pos]; env.key('KeyD'); env.step(.25); env.key('KeyD', false);
  assert.ok(Math.hypot(env.game.pos[0] - start[0], env.game.pos[2] - start[2]) > .2, 'scavenging retains real movement');
  env.game.hp = 40; assert.ok(env.game.spawnDrop('medkit', 0)); env.step(.05);
  assert.equal(env.game.hp, 70); assert.equal(env.game.progression.drops.length, 0, 'a supply is collected once');
  const waitingSupply = env.game.spawnDrop('medkit', 4); assert.ok(waitingSupply);
  env.game.setPos(field[0], field[2]); const score = env.game.score;
  env.step(5.2);
  assert.equal(env.game.field.captured, true); assert.equal(env.game.field.completed, 1);
  assert.equal(env.game.score, score + 125); assert.equal(env.game.progression.shield, 20);
  const power = env.game.progression.overdrive; assert.ok(power >= 9.9);
  env.step(3);
  assert.equal(env.game.mode, 'play'); assert.equal(env.game.wave, wave);
  assert.equal(env.game.recoveryHeld, true); assert.equal(env.game.waveBreak, remaining);
  assert.equal(env.game.combat.seconds, combatSeconds, 'optional scavenging does not penalize the operation clock');
  assert.ok(env.game.time > worldTime + 8, 'world movement and uplink simulation keep advancing');
  assert.equal(env.game.progression.drops.find(drop => drop.id === waitingSupply)?.age, 0, 'supplies stay fresh throughout held recovery');
  assert.equal(env.game.toSpawn, 0); assert.equal(env.game.zombies.length, 0);
  assert.equal(env.game.hp, 70, 'holding the break never repeats the wave-clear heal');
  assert.equal(env.game.score, score + 125, 'the captured uplink cannot award again');
  assert.equal(env.game.progression.overdrive, power, 'recovery does not waste the captured boost');
});

test('pause and outposts freeze recovery and prevent their inputs from advancing the survival run', async t => {
  const env = await createGame(); t.after(() => env.close()); env.start(); recovery(env); env.step(.8);
  env.game.spawnDrop('medkit', 4); env.game.pause();
  const paused = frozenState(env.game);
  env.key('KeyN'); env.key('KeyN', false); env.click('recoveryReady'); env.step(6);
  assert.deepEqual(frozenState(env.game), paused); assert.equal(env.game.mode, 'play');
  env.game.resume(); assert.equal(env.game.paused, false);
  enterOutpost(env); const inOutpost = frozenState(env.game);
  env.key('KeyN'); env.key('KeyN', false); env.click('recoveryReady'); env.step(6);
  assert.deepEqual(frozenState(env.game), inOutpost); assert.equal(env.game.mode, 'play');
  assert.equal(env.game.activities.host.active, true);
  env.game.activities.host.close(); env.step(.1);
  assert.equal(env.game.paused, false); assert.ok(env.game.waveBreak < inOutpost.remaining);
  env.click('recoveryHold'); assert.equal(env.game.recoveryHeld, true);
  enterOutpost(env); const heldOutpost = frozenState(env.game); env.step(6);
  assert.deepEqual(frozenState(env.game), heldOutpost);
  env.game.activities.host.close(); env.step(5);
  assert.equal(env.game.mode, 'play'); assert.equal(env.game.recoveryHeld, true);
  assert.equal(env.game.waveBreak, heldOutpost.remaining);
});

test('held recovery survives reload and old checkpoints without its optional flag keep auto-upgrading', async t => {
  const original = await createGame(); t.after(() => original.close()); original.start(); recovery(original);
  original.step(.7); original.click('recoveryHold'); original.game.save();
  const envelope = savedRun(original), saved = envelope.data;
  assert.equal(saved.recoveryHeld, true); assert.ok(parseSoldierSave(saved));
  const restored = await createGame({ storage: storageOf(original.window) }); t.after(() => restored.close());
  assert.ok(restored.game.continueRun()); assert.equal(restored.game.mode, 'play');
  assert.equal(restored.game.recoveryHeld, true); assert.equal(restored.game.waveBreak, saved.waveBreak);
  restored.step(6); assert.equal(restored.game.mode, 'play'); assert.equal(restored.game.waveBreak, saved.waveBreak);
  restored.click('recoveryReady'); assert.equal(restored.game.mode, 'upgrade');
  const upgradedSave = savedRun(restored).data;
  assert.equal(upgradedSave.recoveryHeld, false); assert.ok(parseSoldierSave(upgradedSave));

  const old = { ...saved }; delete old.recoveryHeld;
  const parsed = parseSoldierSave(old); assert.ok(parsed); assert.equal(parsed.recoveryHeld, false);
  const oldStorage = { ...storageOf(original.window), [SAVE_KEYS.soldier]: JSON.stringify({ ...envelope, data: old }) };
  const legacy = await createGame({ storage: oldStorage }); t.after(() => legacy.close());
  assert.ok(legacy.game.continueRun()); assert.equal(legacy.game.recoveryHeld, false);
  legacy.step(saved.waveBreak + .1); assert.equal(legacy.game.mode, 'upgrade');
});

test('Upgrade now and N offer one upgrade, cannot skip combat, and clear held recovery for the next wave', async t => {
  for (const trigger of ['button', 'keyboard']) {
    const env = await createGame(); t.after(() => env.close()); env.start();
    env.key('KeyN'); env.key('KeyN', false); env.click('recoveryReady');
    assert.equal(env.game.mode, 'play'); assert.equal(env.game.wave, 1); assert.equal(env.game.waveBreak, -1);
    recovery(env);
    if (trigger === 'button') env.click('recoveryHold'); else { env.key('KeyC'); env.key('KeyC', false); }
    assert.equal(env.game.recoveryHeld, true);
    if (trigger === 'button') env.click('recoveryReady'); else { env.key('KeyN'); env.key('KeyN', false); }
    assert.equal(env.game.mode, 'upgrade', trigger); assert.equal(env.game.wave, 1);
    assert.equal(env.game.recoveryHeld, false); const choices = [...env.game.progression.choices].map(choice => choice.id);
    env.key('KeyN'); env.key('KeyN', false); env.click('recoveryReady'); env.step(2);
    assert.equal(env.game.mode, 'upgrade'); assert.deepEqual([...env.game.progression.choices].map(choice => choice.id), choices);
    const chosen = env.window.document.querySelector('.upgrade-card[data-choice="0"]');
    env.chooseUpgrade(); chosen.click(); env.click('recoveryReady'); env.key('KeyN'); env.key('KeyN', false);
    assert.equal(env.game.mode, 'play'); assert.equal(env.game.wave, 2);
    assert.equal(env.game.progression.ranks[choices[0]], 1);
    assert.equal(Object.values(env.game.progression.ranks).reduce((sum, value) => sum + value, 0), 1);
    assert.equal(env.game.recoveryHeld, false); assert.equal(env.game.waveBreak, -1);
    recovery(env); env.step(4.1); assert.equal(env.game.mode, 'upgrade', 'new waves return to the default countdown');
  }
});

test('recovery save validation rejects non-booleans and held flags that contradict the saved phase', async t => {
  const env = await createGame(); t.after(() => env.close()); env.start(); env.game.spawnNear(); env.game.save();
  const combat = savedRun(env).data;
  recovery(env); env.click('recoveryHold'); env.game.save(); const held = savedRun(env).data;
  assert.ok(parseSoldierSave(held));
  for (const recoveryHeld of [null, 0, 1, 'true', {}, []]) assert.equal(parseSoldierSave({ ...held, recoveryHeld }), null);
  assert.equal(parseSoldierSave({ ...combat, recoveryHeld: true }), null, 'an active wave cannot be held as recovery');
  assert.equal(parseSoldierSave({ ...held, toSpawn: 1 }), null, 'pending enemies contradict a held wave break');
  assert.equal(parseSoldierSave({ ...held, zombies: combat.zombies }), null, 'live enemies contradict a held wave break');
  env.click('recoveryReady'); const upgrade = savedRun(env).data;
  assert.equal(parseSoldierSave({ ...upgrade, recoveryHeld: true }), null, 'upgrade selection cannot retain held recovery');
});
