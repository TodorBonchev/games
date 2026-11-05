import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4 } from '../vendor/three/build/three.module.js';
import { createGame } from './harness.mjs';

const fire = env => env.window.document.querySelector('canvas').dispatchEvent(new env.window.MouseEvent('mousedown', { button: 0, bubbles: true }));
function stationary(env, x, z) {
  env.game.spawnNear(); const enemy = env.game.zombies.at(-1);
  enemy.position.set(x, env.game.player.position.y, z); enemy.userData.hp = enemy.userData.maxHp = 1000; enemy.userData.speed = 0; enemy.userData.arrivalTime = 0;
  return enemy;
}

test('assist finds a fourth visible enemy when the first three ranked enemies are behind real cover', async t => {
  const env = await createGame({ seed: 4211 }); t.after(() => env.close()); env.start(); env.game.clearWave(); env.game.setPos(0, 0); env.game.setView(0);
  const blocked = [stationary(env, 0, -7), stationary(env, 0, -9), stationary(env, 0, -11)];
  const visible = stationary(env, 9, -12), trunks = env.game.scene.getObjectByName('palm-trunks');
  trunks.setMatrixAt(0, new Matrix4().makeScale(5, 10, 5).setPosition(0, env.game.pos[1], -3)); trunks.computeBoundingSphere();
  env.step(.1); fire(env); env.step(3);
  assert.ok(visible.userData.hp < 1000, 'held assisted fire reaches the fourth clear target');
  assert.ok(blocked.every(enemy => enemy.userData.hp === 1000), 'three occluded targets stay protected by cover');
  assert.ok(env.game.aimLog.some(entry => entry.lock === 3), 'the actual automatic selector acquired candidate four');
});

test('naturally spawned enemies telegraph arrival before moving or starting an attack', async t => {
  const env = await createGame({ seed: 4211 }); t.after(() => env.close()); env.start();
  for (let i = 0; i < 120 && !env.game.zombies.length; i++) env.step(1 / 60);
  const enemy = env.game.zombies.find(z => !z.userData.dead); assert.ok(enemy);
  assert.ok(enemy.userData.arrivalTime > .5, 'new spawn has its full arrival grace');
  const initial = enemy.position.clone(); env.step(.3);
  assert.equal(enemy.position.distanceTo(initial), 0, 'arrival pose remains in place'); assert.ok(!enemy.userData.attackWind);
  assert.equal(enemy.userData.maxHp, enemy.userData.hp, 'every ordinary enemy tracks its starting health');
  env.step(.8); assert.ok(enemy.position.distanceTo(initial) > .1, 'normal pursuit starts after the telegraph');
});

test('a shoulder-camera peek cannot lock through a blocked barrel and explains how to clear the shot', async t => {
  const env = await createGame({ seed: 4211 }); t.after(() => env.close()); env.start(); env.game.clearWave(); env.game.setPos(0, 0); env.game.setView(0);
  const enemy = stationary(env, 0, -10), trunks = env.game.scene.getObjectByName('palm-trunks'); env.step(.1);
  // A low piece of real trunk geometry intersects the muzzle ray while the
  // higher shoulder camera still sees the target head over it.
  trunks.setMatrixAt(0, new Matrix4().makeScale(.4, .1, .5).setPosition(-.4, env.game.pos[1] + .85, -2)); trunks.computeBoundingSphere();
  fire(env); env.step(.3);
  assert.equal(enemy.userData.hp, 1000); assert.ok(env.game.combat.shots > 0, 'manual crosshair shots remain possible');
  assert.ok(env.game.aimLog.every(entry => entry.lock === undefined || entry.lock < 0), 'assistance avoids the futile camera-only lock');
  assert.equal(env.window.document.getElementById('muzzleBlocked').hidden, false);
  assert.match(env.window.document.getElementById('muzzleBlocked').textContent, /STEP OUT OF COVER/);
});

test('simultaneous real melee swings apply one hit, then another hit after the short grace expires', async t => {
  const env = await createGame({ seed: 4211 }); t.after(() => env.close()); env.start(); env.game.clearWave(); env.game.setPos(0, 0);
  const foes = [stationary(env, -.6, -.65), stationary(env, 0, -.95), stationary(env, .6, -.65)];
  for (const enemy of foes) { enemy.userData.type = 'walker'; enemy.userData.attackWind = .01; }
  env.step(.05); assert.equal(env.game.hp, 82, 'a synchronized crowd cannot delete 54 HP in one frame');
  env.step(.3); foes[0].position.copy(env.game.player.position).x += .9; foes[0].userData.attackWind = .01;
  env.step(.05); assert.equal(env.game.hp, 64, 'grace is brief rather than lasting invulnerability');
});

test('a near-ready real Orb press casts once when ready and an early press cannot queue seconds ahead', async t => {
  const env = await createGame({ seed: 4211 }); t.after(() => env.close()); env.start(); env.game.clearWave(); env.game.setPos(0, 0);
  stationary(env, 20, 20); env.key('KeyF'); env.key('KeyF', false); assert.ok(env.game.frozenOrb.cooldown > 7.9);
  env.step(4); env.key('KeyF'); env.key('KeyF', false); env.step(3.75);
  assert.ok(env.game.frozenOrb.cooldown < .3 && env.game.frozenOrb.cooldown > 0);
  env.key('KeyF'); env.key('KeyF', false); env.step(.3);
  assert.ok(env.game.frozenOrb.cooldown > 7.8, 'the last-quarter-second press became a new real cast');
  const cooldown = env.game.frozenOrb.cooldown; env.step(.4); assert.ok(env.game.frozenOrb.cooldown < cooldown, 'buffer fires only once');
});
