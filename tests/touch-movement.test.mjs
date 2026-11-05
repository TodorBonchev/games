import test from 'node:test';
import assert from 'node:assert/strict';
import { createTouchMovement, floatingStickAnchor } from '../touch-movement.js';
import { createGame } from './harness.mjs';

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-8, message || `${actual} ~= ${expected}`);
const direction = state => ({ x: Math.sin(state.heading) * state.y + Math.cos(state.heading) * state.x, z: Math.cos(state.heading) * state.y - Math.sin(state.heading) * state.x });

test('every floating origin starts neutral, including far off-center and edge contacts', () => {
  const input = createTouchMovement();
  for (const point of [{ x: 110, y: 700 }, { x: 1, y: 843 }, { x: 389, y: 422 }]) {
    assert.equal(input.begin(2, point, 1.2, 44.8), true);
    assert.equal(input.state.magnitude, 0);
    input.move(2, point, 2.4);
    assert.equal(input.state.x, 0); assert.equal(input.state.y, 0);
    assert.equal(input.state.heading, 2.4);
    input.end(2);
  }
});

test('radial deadzone rejects thumb jitter and rescales smoothly through walk to full diagonal sprint', () => {
  const input = createTouchMovement({ deadzone: .16 }); input.begin(0, { x: 100, y: 100 }, 0, 50);
  input.move(0, { x: 106, y: 105 }, 0); assert.equal(input.state.magnitude, 0);
  input.move(0, { x: 108.001, y: 100 }, 0); assert.ok(input.state.magnitude > 0 && input.state.magnitude < .0001);
  input.move(0, { x: 129, y: 100 }, 0); near(input.state.magnitude, .5);
  input.move(0, { x: 200, y: 0 }, 0); near(Math.hypot(input.state.x, input.state.y), 1);
  near(input.state.x, Math.SQRT1_2); near(input.state.y, -Math.SQRT1_2);
});

test('an assisted 180-degree camera turn cannot reverse a held forward thumb; manual look can steer it', () => {
  const input = createTouchMovement(); input.begin(7, { x: 80, y: 700 }, 0, 40);
  input.move(7, { x: 80, y: 660 }, 0);
  for (let yaw = .1; yaw <= Math.PI; yaw += .1) input.move(7, { x: 80, y: 660 }, yaw);
  assert.deepEqual(direction(input.state), { x: 0, z: -1 });
  input.manualTurn(Math.PI / 2); const steered = direction(input.state);
  near(steered.x, -1); near(steered.z, 0);
  input.move(7, { x: 80, y: 700 }, Math.PI);
  input.move(7, { x: 80, y: 660 }, Math.PI);
  const recentered = direction(input.state); near(recentered.x, 0); near(recentered.z, 1);
});

test('releasing, cancellation, foreign fingers, and neutral assisted rotation do not retain a stale heading', () => {
  const input = createTouchMovement(); input.begin(0, { x: 80, y: 700 }, 0, 40);
  assert.equal(input.begin(1, { x: 200, y: 700 }, 0, 40), false);
  assert.equal(input.move(1, { x: 80, y: 660 }, 0), false);
  assert.equal(input.end(1), false); assert.equal(input.state.id, 0);
  input.move(0, { x: 80, y: 660 }, 2); near(input.state.heading, 2);
  input.reset(); assert.equal(input.state.id, null); near(input.state.magnitude, 0);
  input.begin(1, { x: 300, y: 700 }, -1, 40); near(input.state.heading, -1);
  assert.equal(input.end(1), true); assert.equal(input.state.id, null);
});

test('visual anchors stay wholly within the movement half for both hands and phone orientations', () => {
  for (const [width, height, size] of [[390, 844, 112], [320, 568, 104], [844, 390, 104]]) {
    for (const leftHanded of [false, true]) for (const [x, y] of [[0, 0], [width, height]]) {
      const point = floatingStickAnchor({ x, y, width, height, size, leftHanded });
      assert.ok(point.x - size / 2 >= 0 && point.x + size / 2 <= width);
      assert.ok(point.y - size / 2 >= 0 && point.y + size / 2 <= height);
      if (leftHanded) assert.ok(point.x - size / 2 >= width / 2);
      else assert.ok(point.x + size / 2 <= width / 2);
    }
  }
  const inset = floatingStickAnchor({ x: 0, y: 390, width: 844, height: 390, size: 104, edge: 59, bottom: 35 });
  assert.equal(inset.x - 52, 59, 'floating pad retains the notch safe-area inset');
  assert.equal(inset.y + 52, 355, 'floating pad retains the home-bar inset');
});

function touch(env, type, id, x, y, target = env.window.document.getElementById('stick')) {
  const event = new env.window.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'changedTouches', { value: [{ identifier: id, clientX: x, clientY: y, target }] });
  target.dispatchEvent(event);
}
async function fixture(t, storage = {}) {
  const env = await createGame({ seed: 4211, touch: true, storage }); t.after(() => env.close());
  env.start(); env.game.clearWave(); env.step(.05); env.key('KeyC'); env.key('KeyC', false);
  env.game.setPos(0, 0); env.game.setView(0);
  const element = env.window.document.getElementById('stick');
  element.getBoundingClientRect = () => ({ left: 12, top: 268, width: 104, height: 104 });
  return env;
}

test('real game input stays still on off-center contact, walks after dragging, and clears on pause', async t => {
  const env = await fixture(t), start = [...env.game.pos];
  touch(env, 'touchstart', 1, 110, 280); env.step(1.2);
  near(env.game.pos[0], start[0]); near(env.game.pos[2], start[2]);
  assert.equal(env.window.document.body.classList.contains('sprinting'), false);
  touch(env, 'touchmove', 1, 110, 255); env.step(.25);
  assert.ok(env.game.pos[2] < start[2] - .5, 'deliberate partial drag walks');
  assert.equal(env.window.document.body.classList.contains('sprinting'), false);
  env.click('pauseBtn'); assert.equal(env.game.paused, true);
  const element = env.window.document.getElementById('stick');
  assert.equal(element.classList.contains('active'), false); assert.equal(element.style.getPropertyValue('--stick-offset-x'), '');
  env.click('resumeBtn'); const paused = [...env.game.pos]; env.step(.3);
  near(env.game.pos[0], paused[0]); near(env.game.pos[2], paused[2]);
});

test('real touch movement remains stable through camera rotation and explicit look intentionally steers', async t => {
  const env = await fixture(t);
  touch(env, 'touchstart', 1, 64, 320); touch(env, 'touchmove', 1, 64, 280);
  env.game.setView(Math.PI); env.step(.2);
  assert.ok(env.game.pos[2] < -1, 'automatic camera change does not turn forward movement backward');
  const canvas = env.window.document.querySelector('canvas');
  touch(env, 'touchstart', 2, 700, 200, canvas);
  touch(env, 'touchmove', 2, 700 + Math.PI / 2 * 390 / 2.4, 200, canvas);
  const before = [...env.game.pos]; env.step(.15);
  assert.ok(env.game.pos[0] > before[0] + .6, 'manual right look steers the held motion right');
  near(env.game.pos[2], before[2]);
  touch(env, 'touchend', 2, 700, 200, canvas);
  touch(env, 'touchmove', 1, 64, 320); touch(env, 'touchmove', 1, 64, 280);
  const centered = [...env.game.pos]; env.step(.1);
  assert.ok(env.game.pos[0] < centered[0] - .4, 'recenter deliberately adopts the present camera heading');
});

test('left-handed movement uses the right half and releasing it does not steal held Fire', async t => {
  const env = await fixture(t, { 'szCombatPreferences:v1': JSON.stringify({ schema: 1, leftHanded: true }) });
  const stick = env.window.document.getElementById('stick'), fire = env.window.document.getElementById('fireBtn');
  touch(env, 'touchstart', 1, 750, 300, stick); touch(env, 'touchmove', 1, 750, 260, stick);
  touch(env, 'touchstart', 2, 64, 300, fire); env.step(.2);
  assert.ok(env.game.pos[2] < -.8); assert.equal(env.game.firing, true);
  touch(env, 'touchend', 1, 750, 260, stick); assert.equal(env.game.firing, true);
  const before = [...env.game.pos]; env.step(.1); near(env.game.pos[2], before[2]);
  touch(env, 'touchend', 2, 64, 300, fire); assert.equal(env.game.firing, false);
});
