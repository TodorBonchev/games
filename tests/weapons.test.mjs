import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4 } from '../vendor/three/build/three.module.js';
import { createGame } from './harness.mjs';

const fire = (env, down = true) => down
  ? env.window.document.querySelector('canvas').dispatchEvent(new env.window.MouseEvent('mousedown', { button: 0, bubbles: true }))
  : env.window.dispatchEvent(new env.window.MouseEvent('mouseup'));
const select = (env, id) => env.window.document.querySelector(`button[data-weapon="${id}"]`).click();
function target(env, distance = 5) {
  env.game.clearWave(); env.game.setPos(0, 0); env.game.setView(0);
  const enemy = env.game.spawnElite();
  enemy.position.x = 0; enemy.position.z = -distance;
  enemy.userData.hp = enemy.userData.maxHp = 1000; enemy.userData.speed = 0;
  env.step(.1);
  return enemy;
}
function oneShot(env) {
  const before = env.game.combat.shots; fire(env);
  for (let frames = 0; frames < 120 && env.game.combat.shots === before; frames++) env.step(1 / 60);
  fire(env, false); assert.equal(env.game.combat.shots, before + 1);
}

test('Weapon choice persists, updates real hardware and cannot change during a run', async t => {
  const env = await createGame({ storage: { szWeapon: 'unknown-weapon' } }); t.after(() => env.close());
  assert.equal(env.game.weapon.id, 'rifle');
  select(env, 'burst');
  assert.equal(env.game.weapon.id, 'burst');
  assert.equal(env.window.localStorage.getItem('szWeapon'), 'burst');
  assert.equal(env.window.document.getElementById('weaponName').textContent, 'STRIKER');
  assert.equal(env.window.document.querySelectorAll('button[data-weapon][aria-pressed="true"]').length, 1);
  assert.ok(env.game.player.getObjectByName('striker-hardware').visible);
  assert.ok(!env.game.player.getObjectByName('breacher-hardware').visible);
  const longMuzzle = env.game.player.userData.muzzle.position.z;
  env.start(); select(env, 'scatter');
  assert.equal(env.game.weapon.id, 'burst', 'hidden menu cannot switch an active weapon');
  env.game.returnToMenu(); select(env, 'scatter');
  assert.equal(env.game.weapon.id, 'scatter');
  assert.ok(env.game.player.getObjectByName('breacher-hardware').visible);
  assert.ok(env.game.player.userData.muzzle.position.z < longMuzzle);
  const ember = await createGame({ level: 2, go: true, storage: { szWeapon: env.window.localStorage.getItem('szWeapon') } });
  t.after(() => ember.close()); assert.equal(ember.game.weapon.id, 'scatter', 'island deployment keeps the selected weapon');
});

test('Burst carbine fires three timed rounds, recovers, and cancels held input on pause', async t => {
  const env = await createGame({ seed: 4211, storage: { szWeapon: 'burst' } }); t.after(() => env.close()); env.start();
  const enemy = target(env), times = []; fire(env);
  for (let frame = 0; frame < 110 && times.length < 6; frame++) {
    const shots = env.game.combat.shots; env.step(1 / 60);
    if (env.game.combat.shots > shots) times.push(env.game.time);
  }
  assert.equal(times.length, 6);
  assert.ok(times[1] - times[0] < .1 && times[2] - times[1] < .1);
  assert.ok(times[3] - times[2] >= .29, 'each three-round volley has a meaningful recovery gap');
  assert.ok(Math.abs((1000 - enemy.userData.hp) - 8.4) < .001, 'all six real rounds apply the burst damage');
  env.game.pause(); const frozen = env.game.combat.shots; env.step(1); env.game.resume(); env.step(.4);
  assert.equal(env.game.combat.shots, frozen, 'pause releases fire instead of finishing an old burst');
  assert.equal(env.game.weapon.burstRound, 0);
});

test('Scattergun fires seven trajectories, deals close-range damage and keeps accuracy at one hit per trigger', async t => {
  const env = await createGame({ seed: 4211, storage: { szWeapon: 'scatter' } }); t.after(() => env.close()); env.start();
  const enemy = target(env); oneShot(env);
  assert.equal(env.game.weapon.pellets, 7);
  assert.equal(1000 - enemy.userData.hp, 8.75, 'seven close pellets hit the broad elite torso');
  assert.equal(env.game.combat.shots, 1); assert.equal(env.game.combat.hits, 1);
  const tracers = env.game.scene.children.filter(object => object.isLine && object.visible && object.userData.life > 0);
  assert.equal(tracers.length, 7);
  const endpoints = new Set(tracers.map(line => Array.from(line.geometry.attributes.position.array.slice(3)).map(value => value.toFixed(3)).join(',')));
  assert.equal(endpoints.size, 7, 'pellets follow distinct rays instead of multiplying one hit');
  assert.ok(env.game.combat.impacts <= env.game.combat.impactCapacity);
});

test('Scattergun falloff and limited range reward closing distance', async t => {
  const damages = [];
  for (const distance of [5, 20, 31]) {
    const env = await createGame({ seed: 4211, storage: { szWeapon: 'scatter' } }); t.after(() => env.close()); env.start();
    const enemy = target(env, distance); oneShot(env); damages.push(1000 - enemy.userData.hp);
  }
  assert.ok(damages[0] > 8);
  assert.ok(damages[1] > 0 && damages[1] < damages[0] * .3, `distant pellets lose coverage and damage: ${damages}`);
  assert.equal(damages[2], 0, 'targets beyond the shotgun range cannot be hit');
});

test('Every weapon respects solid scenery, including every scatter pellet', async t => {
  for (const weapon of ['rifle', 'burst', 'scatter']) {
    const env = await createGame({ seed: 4211, storage: { szWeapon: weapon } }); t.after(() => env.close()); env.start();
    const enemy = target(env, 8), trunks = env.game.scene.getObjectByName('palm-trunks');
    // Reposition an actual collidable trunk into a broad, deterministic cover
    // fixture. Raycasts still execute against the game's real solid mesh.
    trunks.setMatrixAt(0, new Matrix4().makeScale(5, 10, 5).setPosition(0, env.game.pos[1], -3));
    trunks.computeBoundingSphere(); env.step(.1); fire(env); env.step(1.2); fire(env, false);
    assert.ok(env.game.combat.shots > 0);
    assert.equal(enemy.userData.hp, 1000, `${weapon} cannot damage an enemy through the trunk`);
  }
});

test('Burst and scatter fire-rate upgrades work at 20 FPS without stored idle volleys', async t => {
  for (const weapon of ['burst', 'scatter']) {
    const shots = [];
    for (const cadence of [0, 3]) {
      const env = await createGame({ level: 2, go: true, storage: { szWeapon: weapon }, session: { szCarry: JSON.stringify({ ranks: { cadence } }) } });
      t.after(() => env.close()); env.click('skipBtn'); env.step(.1); env.game.clearWave(); env.step(.05); env.step(.5, 20);
      fire(env); env.step(.05, 20); assert.equal(env.game.combat.shots, 1, 'idle time cannot accumulate a volley');
      env.step(2, 20); fire(env, false); shots.push(env.game.combat.shots);
    }
    assert.ok(shots[1] > shots[0], `${weapon} cadence increases at low frame rate: ${shots}`);
  }
});
