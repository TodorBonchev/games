import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from './harness.mjs';

function training(env) {
  env.start();
  const { game } = env;
  game.clearWave(); game.setPos(0, 0); game.setView(0, -.08);
  const guard = game.spawnElite();
  guard.position.set(25, 0, 25); guard.userData.speed = 0;
  env.step(.05);
  return guard;
}

test('Tap jumps normally; held Space powers flight, consumes fuel and lands to recharge', async t => {
  const env = await createGame(); t.after(() => env.close()); training(env);
  const { game, key, step } = env, ground = game.alt;
  key('Space'); key('Space', false); step(.25);
  assert.ok(game.alt > ground + .5);
  assert.equal(game.jetpack.active, false); assert.equal(game.jetpack.fuel, 1);
  step(.6); assert.ok(Math.abs(game.alt - ground) < .05);
  key('Space'); step(1.2);
  assert.ok(game.jetpack.active); assert.ok(game.alt > ground + 4);
  assert.ok(game.jetpack.fuel < .9);
  assert.ok(game.player.getObjectByName('jetpack-exhaust').visible);
  const height = game.alt; key('Space', false); step(1);
  assert.equal(game.jetpack.active, false); assert.ok(game.alt < height);
  step(3); assert.ok(Math.abs(game.alt - ground) < .05); assert.equal(game.jetpack.fuel, 1);
});

test('Jetpack fuel and altitude are bounded; holding after exhaustion cannot auto-launch', async t => {
  const env = await createGame(); t.after(() => env.close()); training(env);
  const { game, key, step } = env, ground = game.alt;
  key('Space'); step(5);
  assert.ok(game.alt <= ground + 18.1); assert.ok(game.alt > ground + 15);
  step(2); assert.equal(game.jetpack.fuel, 0); assert.equal(game.jetpack.active, false);
  step(3); assert.ok(Math.abs(game.alt - ground) < .05);
  assert.ok(game.jetpack.fuel > 0); assert.equal(game.jetpack.active, false);
  key('Space', false); key('Space'); step(.5); assert.ok(game.jetpack.active);
});

test('Pause and orientation changes release thrust without consuming paused fuel', async t => {
  const env = await createGame(); t.after(() => env.close()); training(env);
  const { game, key, step, window } = env;
  key('Space'); step(.6); game.pause();
  const fuel = game.jetpack.fuel, height = game.alt;
  step(3); assert.equal(game.alt, height); assert.equal(game.jetpack.fuel, fuel);
  assert.equal(game.jetpack.active, false); assert.equal(game.jetpack.held, false);
  game.resume(); step(.15); assert.ok(game.alt <= height + .6);
  key('Space'); step(.3); assert.ok(game.jetpack.active);
  window.innerWidth = 600; window.dispatchEvent(new window.Event('resize'));
  assert.equal(game.jetpack.active, false); assert.equal(game.jetpack.held, false);
  game.returnToMenu(); assert.equal(game.jetpack.fuel, 1);
  assert.equal(game.player.getObjectByName('jetpack-exhaust').visible, false);
});

test('Jump/Fly touch button supports hold and pointer cancellation', async t => {
  const env = await createGame({ touch: true }); t.after(() => env.close()); training(env);
  const { window, game, step } = env, button = window.document.getElementById('jumpBtn');
  const pointer = type => {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, { pointerId: { value: 7 }, button: { value: 0 } });
    button.dispatchEvent(event);
  };
  pointer('pointerdown'); step(.7);
  assert.ok(game.jetpack.active); assert.ok(button.classList.contains('active'));
  pointer('pointercancel'); step(.05);
  assert.equal(game.jetpack.active, false); assert.equal(game.jetpack.held, false);
  assert.equal(button.classList.contains('active'), false);
});

test('Frozen Orb HUD and F share cooldown, pause safely, and reset on deployment', async t => {
  const env = await createGame(); t.after(() => env.close()); training(env);
  const { game, key, click, step, window } = env;
  const button = window.document.getElementById('orbBtn');
  assert.equal(button.disabled, false);
  key('KeyF'); step(.05); key('KeyF', false);
  assert.ok(game.frozenOrb.active); assert.ok(game.frozenOrb.cooldown > 7.8);
  assert.ok(button.disabled); assert.match(window.document.getElementById('orbCooldown').textContent, /8s/);
  const initial = game.frozenOrb.cooldown; click('orbBtn'); assert.equal(game.frozenOrb.cooldown, initial);
  game.pause(); const before = game.frozenOrb; step(2);
  assert.deepEqual(game.frozenOrb, before);
  game.resume(); step(8); assert.equal(game.frozenOrb.ready, true); assert.equal(button.disabled, false);
  click('orbBtn'); assert.ok(game.frozenOrb.active);
  game.returnToMenu(); assert.equal(game.frozenOrb.active, false); assert.equal(game.frozenOrb.shards, 0);
  env.start(); assert.equal(game.frozenOrb.ready, true); assert.equal(game.jetpack.fuel, 1);
});

test('Frozen Orb chills an enemy, awards kills, and leaves rifle accuracy unchanged', async t => {
  const env = await createGame(); t.after(() => env.close());
  const enemy = training(env), { game, key, step } = env;
  enemy.position.copy(game.player.position); enemy.position.z -= 7;
  enemy.userData.hp = 100; enemy.userData.speed = 0;
  game.setView(0, -.02); step(.05);
  key('KeyF'); key('KeyF', false); step(.8);
  assert.ok(enemy.userData.hp < 100); assert.ok(enemy.userData.frostTime > 0);
  assert.equal(game.combat.shots, 0); assert.equal(game.combat.hits, 0);
  const chilled = enemy.userData.frostTime; game.pause(); step(1); assert.equal(enemy.userData.frostTime, chilled);
  game.resume(); step(8); assert.equal(enemy.userData.frostTime, 0);
  enemy.position.copy(game.player.position); enemy.position.z -= 7; enemy.userData.hp = 1;
  game.setView(0, -.02); step(.05); const score = game.score;
  key('KeyF'); key('KeyF', false); step(.8);
  assert.ok(enemy.userData.dead); assert.ok(game.score > score); assert.equal(game.combat.kills, 1);
  assert.equal(game.combat.shots, 0);
});
