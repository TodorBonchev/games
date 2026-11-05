import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from './harness.mjs';
import { parseSoldierSave } from '../soldier-save.js';

const near = (actual, expected, tolerance = .03) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should equal ${expected}`);
const tap = (env, key) => { env.key(key); env.key(key, false); };
function training(env) {
  env.start(); env.game.clearWave(); env.game.setPos(0, 0); env.game.setView(0, -.08);
  const guard = env.game.spawnElite(); guard.position.set(25, 0, 25); guard.userData.speed = 0;
  env.step(.05); return guard;
}

test('native Q travels 3.5m, takes the held movement direction and refuses midair/recharging requests', async t => {
  const env = await createGame({ seed: 4211 }); t.after(() => env.close()); training(env);
  const start = [...env.game.pos]; tap(env, 'KeyQ'); assert.equal(env.game.evasion.active, true);
  env.step(.22); near(env.game.pos[0], start[0]); near(start[2] - env.game.pos[2], 3.5);
  assert.equal(env.game.evasion.active, false); assert.ok(env.game.evasion.cooldown > 3.7);
  assert.equal(env.game.evade(), false); const firstEnd = [...env.game.pos]; env.step(.1); near(env.game.pos[2], firstEnd[2]);
  env.step(4); env.game.setPos(0, 0); env.key('KeyD'); tap(env, 'KeyQ'); env.step(.22); env.key('KeyD', false);
  near(env.game.pos[0], 3.5); near(env.game.pos[2], 0, .04);
  assert.ok(env.game.pos[0] < 3.6, 'walking does not add a second displacement during the dash');
  env.step(4); tap(env, 'Space'); env.step(.1); assert.equal(env.game.evade(), false); assert.equal(env.game.evasion.ready, true);
});

test('pause, outposts and rotation cancel motion while preserving the real cooldown', async t => {
  const env = await createGame({ seed: 4211 }); t.after(() => env.close()); training(env);
  tap(env, 'KeyQ'); env.step(.04); assert.ok(env.game.player.rotation.x < -.01, 'the real active dash has a visible lean'); env.game.pause();
  const paused = { position: [...env.game.pos], cooldown: env.game.evasion.cooldown };
  assert.equal(env.game.evasion.active, false); assert.equal(env.game.player.rotation.x, 0, 'pausing clears the dash pose'); env.step(2);
  assert.deepEqual([...env.game.pos], paused.position); assert.equal(env.game.evasion.cooldown, paused.cooldown);
  env.game.resume(); env.step(.1); near(env.game.pos[2], paused.position[2]); assert.ok(env.game.evasion.cooldown < paused.cooldown);
  env.step(4); env.game.setPos(0, 0); tap(env, 'KeyQ'); env.step(.04);
  env.window.innerWidth -= 1; env.window.dispatchEvent(new env.window.Event('resize'));
  const rotated = [...env.game.pos]; assert.equal(env.game.evasion.active, false); env.step(.15); near(env.game.pos[2], rotated[2]);
  env.step(4); const station = env.game.activities.world.stations.find(s => s.id === 'prism'); env.game.setPos(station.x, station.z);
  assert.ok(env.game.evade()); assert.ok(env.game.activities.host.open('prism'));
  const cooldown = env.game.evasion.cooldown; assert.equal(env.game.evasion.active, false); env.step(2); assert.equal(env.game.evasion.cooldown, cooldown);
  env.game.activities.host.close(); env.step(.1); assert.ok(env.game.evasion.cooldown < cooldown); assert.equal(env.game.evasion.active, false);
});

test('upgrade and redeployment pause recharge; selecting an upgrade never resumes old movement', async t => {
  const env = await createGame({ seed: 4211 }); t.after(() => env.close()); training(env);
  env.game.clearWave(); env.step(.05); assert.ok(env.game.waveBreak >= 0);
  tap(env, 'KeyQ'); tap(env, 'KeyN'); assert.equal(env.game.mode, 'upgrade');
  const cooldown = env.game.evasion.cooldown, position = [...env.game.pos]; assert.equal(env.game.evasion.active, false);
  env.step(3); assert.equal(env.game.evasion.cooldown, cooldown); assert.deepEqual([...env.game.pos], position);
  env.chooseUpgrade(); env.step(.1); assert.equal(env.game.mode, 'play'); assert.equal(env.game.evasion.active, false); near(env.game.pos[2], position[2]);
  assert.ok(env.game.evasion.cooldown < cooldown);
  env.game.rjCD = 0; env.game.rejump(); const redeployCooldown = env.game.evasion.cooldown; assert.equal(env.game.mode, 'intro');
  env.step(1); assert.equal(env.game.evasion.cooldown, redeployCooldown); assert.equal(env.game.evasion.active, false);
});

test('save/reload keeps the exact remaining recharge and never replays a partially completed dash', async t => {
  const env = await createGame({ seed: 4211 }); t.after(() => env.close()); training(env);
  tap(env, 'KeyQ'); env.step(.08); env.game.pause();
  const raw = env.window.localStorage.getItem('games:save:soldier'), envelope = JSON.parse(raw), cooldown = env.game.evasion.cooldown;
  near(envelope.data.evasionCooldown, cooldown, 1e-8);
  const resumed = await createGame({ seed: 9114, storage: { 'games:save:soldier': raw } }); t.after(() => resumed.close());
  assert.ok(resumed.game.continueRun()); near(resumed.game.evasion.cooldown, cooldown, 1e-8); assert.equal(resumed.game.evasion.active, false);
  const position = [...resumed.game.pos]; resumed.step(.15); near(resumed.game.pos[0], position[0]); near(resumed.game.pos[2], position[2]);
  assert.ok(resumed.game.evasion.cooldown < cooldown);
  const legacy = { ...envelope.data }; delete legacy.evasionCooldown; assert.equal(parseSoldierSave(legacy).evasionCooldown, 0);
  for (const value of [-1, 4.01, NaN, '2']) assert.equal(parseSoldierSave({ ...envelope.data, evasionCooldown: value }), null);
});

test('the real ground collision path cannot tunnel through a thin wall while evading', async t => {
  const env = await createGame({ seed: 4211 }); t.after(() => env.close()); training(env);
  env.game.colliders.boxes.push({ x: 1.1, z: 0, hx: .03, hz: 4 });
  env.game.setView(-Math.PI / 2); tap(env, 'KeyQ'); env.step(.3);
  assert.ok(env.game.pos[0] < .68, 'the .4m player radius remains on the near side of the thin collider');
  assert.ok(env.game.pos[0] > .5, 'the dash reaches the wall rather than refusing all movement');
  assert.equal(env.game.evasion.active, false); assert.ok(env.game.evasion.cooldown > 3.6);
});

test('an actual close melee swing resolves without damage during evade; normal damage remains possible', async t => {
  const env = await createGame({ seed: 4211 }); t.after(() => env.close()); training(env);
  env.game.spawnNear(); const enemy = env.game.zombies.at(-1);
  enemy.position.copy(env.game.player.position).x += .8;
  Object.assign(enemy.userData, { type: 'walker', speed: 0, hp: 1000, maxHp: 1000, attackWind: .001, arrivalTime: 0 });
  env.game.hp = 70; tap(env, 'KeyQ'); env.step(1 / 60);
  assert.equal(env.game.evasion.active, true); assert.equal(enemy.userData.attackWind, 0); assert.ok(enemy.userData.attackCooldown > 0);
  assert.equal(env.game.hp, 70, 'the attempted real melee hit is evaded');
  env.game.damage(10); assert.equal(env.game.hp, 60, 'evade does not create general invulnerability');
  env.step(.3); enemy.position.copy(env.game.player.position).x += .8; enemy.userData.attackWind = .001; env.step(1 / 60);
  assert.equal(env.game.hp, 42, 'the next swing damages normally after the dodge ends');
});

test('an actual commander slam still damages during the active evade window', async t => {
  const env = await createGame({ seed: 4211 }); t.after(() => env.close()); training(env);
  const commander = env.game.spawnElite(true); commander.position.copy(env.game.player.position).z -= 1;
  Object.assign(commander.userData, { speed: 0, arrivalTime: 0, slamWind: .001, slamCenter: env.game.player.position.clone() });
  tap(env, 'KeyQ'); env.step(1 / 60);
  assert.equal(env.game.evasion.active, true); assert.equal(env.game.hp, 68, 'ground slams require leaving their area, not melee protection');
});

test('an actual acid impact still damages a dodging player who has not left the warning circle', async t => {
  const env = await createGame({ seed: 4211 }); t.after(() => env.close()); training(env);
  env.game.clearWave(); const spitter = env.game.spawnSpitter(); spitter.position.set(0, env.game.alt, -10);
  Object.assign(spitter.userData, { speed: 0, hp: 1000, maxHp: 1000, spitCooldown: .1 });
  for (let frame = 0; frame < 120 && !env.game.threats.length; frame++) env.step(1 / 60);
  assert.equal(env.game.threats.length, 1); spitter.userData.spitCooldown = 100;
  env.step(1.395 - env.game.threats[0].age); tap(env, 'KeyQ'); env.step(.01);
  assert.equal(env.game.evasion.active, true); assert.equal(env.game.hp, 94, 'acid keeps its own damage rules during the dodge');
});

test('pause, resume and resize preserve native freefall and parachute poses instead of treating them as an evade lean', async t => {
  const env = await createGame({ seed: 4211 }); t.after(() => env.close());
  env.click('startBtn'); env.step(3.8);
  assert.equal(env.game.mode, 'intro'); assert.equal(env.game.phase, 'free');
  const pose = () => [env.game.player.rotation.x, env.game.player.rotation.z];
  assert.ok(pose()[0] > 1, 'a real freefall frame keeps its diving pose after the normal game loop');
  const freefall = pose(); env.game.pause(); assert.deepEqual(pose(), freefall);
  env.window.innerWidth -= 1; env.window.dispatchEvent(new env.window.Event('resize'));
  env.step(.5); assert.deepEqual(pose(), freefall, 'paused freefall remains frozen through clearInput and resize');
  env.game.resume(); assert.deepEqual(pose(), freefall, 'resume clears controls without straightening the soldier'); env.step(.05);
  assert.ok(pose()[0] > 1);
  for (let frame = 0; frame < 600 && env.game.phase !== 'chute'; frame++) env.step(.05);
  assert.equal(env.game.phase, 'chute'); env.step(.05);
  const parachute = pose(); assert.ok(Math.abs(parachute[1]) > .01, 'native parachute sway supplies a nonzero roll');
  env.window.innerHeight -= 1; env.window.dispatchEvent(new env.window.Event('resize')); assert.deepEqual(pose(), parachute);
  env.game.pause(); env.step(.5); assert.deepEqual(pose(), parachute, 'paused parachute pitch and roll stay intact');
  env.game.resume(); assert.deepEqual(pose(), parachute); env.step(.05);
  assert.equal(env.game.phase, 'chute'); assert.notDeepEqual(pose(), parachute, 'parachute animation resumes after the freeze');
});
