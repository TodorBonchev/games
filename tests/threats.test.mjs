import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from './harness.mjs';

function setup(env, distance = 10) {
  env.start(); env.game.clearWave(); env.game.setPos(0, 0);
  const enemy = env.game.spawnSpitter(); enemy.position.set(0, 0, -distance);
  enemy.userData.speed = 0; enemy.userData.hp = 1000; enemy.userData.spitCooldown = .1;
  env.step(.15); return enemy;
}
function waitForLaunch(env) {
  for (let frame = 0; frame < 120 && !env.game.threats.length; frame++) env.step(1 / 60);
  assert.equal(env.game.threats.length, 1, 'unobstructed spitter launches a telegraphed attack');
}

test('Spitter gives a full warning before acid damage and rewards moving clear', async t => {
  const env = await createGame({ seed: 4211, storage: { szMotion: 'reduced' } }); t.after(() => env.close());
  const enemy = setup(env); waitForLaunch(env); enemy.userData.spitCooldown = 100;
  const first = env.game.threats[0]; assert.equal(first.warning, true); assert.equal(first.radius, 2.6);
  assert.ok(env.game.scene.getObjectByName('acid-threats').children.some(object => object.isGroup && object.visible), 'danger ring stays visible with reduced motion');
  const before = env.game.hp; env.step(1); assert.equal(env.game.hp, before, 'warning does not deal damage');
  env.game.setPos(5, 0); env.step(1); assert.equal(env.game.hp, before, 'leaving the marked circle avoids impact and pool damage');
  env.game.setPos(first.position[0], first.position[2]); env.step(.6);
  assert.ok(env.game.hp < before && env.game.hp >= before - 12, 'active acid deals bounded periodic damage');
  env.step(2); assert.equal(env.game.threats.length, 0, 'the pool expires');
});

test('Acid warnings freeze with pause and insertion, and killing the caster cancels a warning', async t => {
  const env = await createGame({ seed: 4211 }); t.after(() => env.close());
  const enemy = setup(env); waitForLaunch(env); enemy.userData.spitCooldown = 100;
  env.game.pause(); const age = env.game.threats[0].age; env.step(2); assert.equal(env.game.threats[0].age, age);
  env.game.resume(); env.game.rjCD = 0; env.game.rejump(); env.step(1); assert.equal(env.game.threats[0].age, age);
  env.click('skipBtn'); enemy.userData.dead = .001; env.step(.1);
  assert.equal(env.game.threats.length, 0, 'shooting a caster during the telegraph cancels its airborne glob');
});

test('Jumping over an acid impact avoids damage, and run boundaries clear pooled threats', async t => {
  const env = await createGame({ seed: 4211 }); t.after(() => env.close());
  const enemy = setup(env); waitForLaunch(env); enemy.userData.spitCooldown = 100;
  env.step(.9); env.key('Space'); env.step(.4); env.key('Space', false);
  const hp = env.game.hp; env.step(.1); assert.equal(env.game.hp, hp); assert.equal(hp, 100, 'jump clears the first acid impact');
  env.game.returnToMenu(); assert.equal(env.game.threats.length, 0);
  env.start(); env.game.clearWave(); const next = env.game.spawnSpitter(); next.position.set(0, 0, -10); env.game.setPos(0, 0); next.userData.speed = 0; next.userData.spitCooldown = .1;
  waitForLaunch(env); env.game.damage(1000); assert.equal(env.game.threats.length, 0, 'defeat clears acid before a new deployment');
});

test('Solid cover blocks spitter attacks and projectiles share a bounded reusable pool', async t => {
  const env = await createGame({ seed: 4211 }); t.after(() => env.close());
  env.start(); env.game.clearWave(); env.game.setPos(0, 0);
  const enemy = env.game.spawnSpitter(); enemy.position.set(0, 0, -10); enemy.userData.speed = 0; enemy.userData.spitCooldown = 0;
  // Put a real scenery collider between the caster and player; visible
  // decorations alone must not count as attack-blocking cover.
  const circle = env.game.colliders.circles[0];
  env.game.setPos(circle.x - circle.r - 2, circle.z);
  enemy.position.set(circle.x + circle.r + 7, env.game.player.position.y, circle.z);
  const launches = env.game.threats.length; env.step(2);
  assert.equal(env.game.threats.length, launches, 'solid tree trunk or pillar interrupts the spitter sightline');
  env.game.setPos(0, 0); enemy.position.set(0, 0, -10); enemy.userData.spitCooldown = .1; waitForLaunch(env);
  const root = env.game.scene.getObjectByName('acid-threats'), geometries = root.children.flatMap(object => object.isMesh ? [object.geometry] : object.children.map(mesh => mesh.geometry));
  for (let i = 0; i < 5; i++) { const z = env.game.spawnSpitter(); z.position.set((i - 2) * .35, 0, -10); z.userData.speed = 0; z.userData.spitCooldown = .1; }
  env.step(.6); assert.ok(env.game.threats.length <= 3 && env.game.threats.length >= 2);
  env.step(2.4); assert.ok(env.game.hp >= 76, 'overlapping pools cannot multiply periodic damage');
  env.game.setPos(7, 0); env.step(1.6);
  for (const z of env.game.zombies) z.userData.spitCooldown = .1;
  env.step(.6); assert.ok(env.game.threats.length <= 3, 'new casts reuse freed slots');
  env.game.pause(); assert.deepEqual(root.children.flatMap(object => object.isMesh ? [object.geometry] : object.children.map(mesh => mesh.geometry)), geometries);
});

test('A fatal commander slam stops later spitters from creating hazards after defeat', async t => {
  const env = await createGame({ seed: 4211 }); t.after(() => env.close()); env.start();
  const game = env.game; game.clearWave(); game.setPos(0, 0);
  const commander = game.spawnElite(true);
  commander.position.set(0, game.player.position.y, -1); commander.userData.speed = 0;
  commander.userData.slamWind = .01; commander.userData.slamCenter = game.player.position.clone();
  const spitter = game.spawnSpitter();
  spitter.position.set(0, game.player.position.y, -10); spitter.userData.speed = 0; spitter.userData.spitCooldown = 0;
  game.hp = 1; env.step(.05);
  assert.equal(game.mode, 'over'); assert.equal(game.hp, 0);
  assert.equal(game.threats.length, 0, 'an enemy later in the update order cannot cast after death');
  env.step(.2); assert.equal(game.threats.length, 0, 'the following render frames keep defeat free of hazards');
});
