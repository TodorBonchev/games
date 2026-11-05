import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from './harness.mjs';

const angle = value => Math.atan2(Math.sin(value), Math.cos(value));
const fire = (env, down = true) => down
  ? env.window.document.querySelector('canvas').dispatchEvent(new env.window.MouseEvent('mousedown', { button: 0, bubbles: true }))
  : env.window.dispatchEvent(new env.window.MouseEvent('mouseup'));
function mouseLook(env, dx, dy = 0) {
  const event = new env.window.MouseEvent('mousemove', { bubbles: true });
  Object.defineProperties(event, { movementX: { value: dx }, movementY: { value: dy } });
  env.window.dispatchEvent(event);
}
function setup(env, behind = false) {
  env.start(); env.game.clearWave(); env.game.setPos(0, 0); env.game.setView(0);
  env.game.spawnNear(); const enemy = env.game.zombies.at(-1);
  enemy.position.set(0, env.game.player.position.y, behind ? 5 : -10);
  enemy.userData.hp = 1000; enemy.userData.speed = 0;
  env.step(.05); return enemy;
}
function touchEvent(env, type, target, x, y = 300) {
  const event = new env.window.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'changedTouches', { value: [{ identifier: 91, clientX: x, clientY: y, target }] });
  target.dispatchEvent(event);
}

test('initial rear-target acquisition and tracking never whip the camera faster than 110 degrees per second', async t => {
  const env = await createGame({ seed: 4211 }); t.after(() => env.close());
  const enemy = setup(env, true); fire(env);
  let previous = env.game.yaw, travelled = 0;
  for (let frame = 0; frame < 180; frame++) {
    env.step(1 / 60);
    const turn = Math.abs(angle(env.game.yaw - previous));
    assert.ok(turn <= 110 * Math.PI / 180 / 60 + 1e-8, `frame ${frame} turns ${turn * 180 / Math.PI}°`);
    travelled += turn; previous = env.game.yaw;
    if (frame === 18) assert.ok(travelled < 35 * Math.PI / 180, 'the old 169° first-third-second snap is gone');
  }
  assert.ok(travelled > 130 * Math.PI / 180, 'assistance still acquires a rear threat smoothly');
  assert.ok(env.game.combat.shots > 0, 'aligned assisted fire still works');
  enemy.position.set(0, env.game.player.position.y, -10);
  for (let frame = 0; frame < 30; frame++) {
    env.step(1 / 60);
    assert.ok(Math.abs(angle(env.game.yaw - previous)) <= 110 * Math.PI / 180 / 60 + 1e-8, 'a moving locked target also obeys the turn bound');
    previous = env.game.yaw;
  }
});

test('mouse look takes ownership immediately and crosshair firing continues without pulling back to an old side target', async t => {
  const env = await createGame({ seed: 4211 }); t.after(() => env.close());
  const enemy = setup(env); fire(env); env.step(.6);
  assert.ok(env.game.combat.hits > 0, 'start with an acquired enemy');
  for (let i = 0; i < 6; i++) mouseLook(env, 100);
  const yaw = env.game.yaw, shots = env.game.combat.shots, health = enemy.userData.hp;
  env.step(.8);
  assert.equal(env.game.yaw, yaw, 'manual view is unchanged during the grace period');
  assert.ok(env.game.combat.shots >= shots + 7, 'rifle continues its ordinary crosshair cadence');
  assert.equal(enemy.userData.hp, health, 'shots no longer use the old assisted target');
  assert.equal(env.window.document.getElementById('lock').style.display, 'none');
  env.step(.8);
  assert.equal(env.game.yaw, yaw, 'old enemy outside the forward cone stays released after the grace period');
  fire(env, false); env.step(.05); fire(env); env.step(1);
  assert.ok(Math.abs(angle(env.game.yaw - yaw)) > .1, 'a new fire hold deliberately starts normal assistance again');
});

test('small manual corrections get a full grace period before assistance resumes on a forward target', async t => {
  const env = await createGame({ seed: 4211 }); t.after(() => env.close());
  setup(env); fire(env); env.step(.6);
  const initial = env.game.yaw;
  mouseLook(env, 100); const corrected = env.game.yaw;
  env.step(.8); assert.equal(env.game.yaw, corrected);
  env.step(.9);
  assert.ok(Math.abs(angle(env.game.yaw - initial)) < Math.abs(angle(corrected - initial)) * .6, 'nearby forward target is smoothly reacquired');
  const locks = env.game.aimLog.filter(entry => entry.ev === 'firstlock');
  assert.ok(locks.length >= 2);
});

test('continued mouse movement renews ownership instead of timing out mid-aim', async t => {
  const env = await createGame({ seed: 4211 }); t.after(() => env.close());
  setup(env); fire(env); env.step(.6);
  for (let i = 0; i < 5; i++) {
    mouseLook(env, 10); const yaw = env.game.yaw;
    env.step(.4); assert.equal(env.game.yaw, yaw);
  }
  assert.ok(env.game.combat.shots > 15);
});

test('aiming before pressing fire also keeps acquisition within the chosen view', async t => {
  const env = await createGame({ seed: 4211 }); t.after(() => env.close());
  setup(env);
  for (let i = 0; i < 6; i++) mouseLook(env, 100);
  const yaw = env.game.yaw; env.step(1.2); fire(env); env.step(1.1);
  assert.equal(env.game.yaw, yaw, 'aim-before-fire does not recapture an enemy outside the forward cone');
  assert.ok(env.game.combat.shots >= 10, 'the player can fire into the chosen direction');
});

test('dragging the phone fire control gives touch aiming the same ownership and keeps firing', async t => {
  const env = await createGame({ seed: 4211, touch: true }); t.after(() => env.close());
  setup(env); const button = env.window.document.getElementById('fireBtn');
  touchEvent(env, 'touchstart', button, 750); env.step(.6);
  assert.ok(env.game.combat.hits > 0);
  touchEvent(env, 'touchmove', button, 950);
  const yaw = env.game.yaw, shots = env.game.combat.shots;
  env.step(1.6);
  assert.equal(env.game.yaw, yaw, 'manual touch aim does not snap back after release of the lock');
  assert.ok(env.game.firing); assert.ok(env.game.combat.shots > shots + 10);
  touchEvent(env, 'touchend', button, 950); env.step(.05); assert.equal(env.game.firing, false);
});

test('taking over mid-burst preserves the three-round sequence and recovery gap', async t => {
  const env = await createGame({ seed: 4211, storage: { szWeapon: 'burst' } }); t.after(() => env.close());
  setup(env); fire(env);
  const rounds = [], times = [];
  for (let frame = 0; frame < 120 && rounds.length < 6; frame++) {
    const shots = env.game.combat.shots; env.step(1 / 60);
    if (env.game.combat.shots > shots) {
      rounds.push(env.game.weapon.burstRound); times.push(env.game.time);
      if (rounds.length === 1) mouseLook(env, 1);
    }
  }
  assert.deepEqual(rounds, [1, 2, 0, 1, 2, 0]);
  assert.ok(times[1] - times[0] < .1 && times[2] - times[1] < .1);
  assert.ok(times[3] - times[2] >= .29, 'manual look cannot bypass the burst recovery');
});
