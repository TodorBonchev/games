import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/build/three.module.js';
import { createEvasion, moveEvasion, EVASION_DISTANCE, EVASION_DURATION, EVASION_COOLDOWN, EVASION_STEP } from '../evasion.js';
import { createFlightCollision } from '../flight-collision.js';

const allowed = { allowed: true, grounded: true };
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should equal ${expected}`);
const flat = { surfaceAt: () => 0 };
function box(x, y, z, width, height, depth) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth)); mesh.position.set(x, y, z); mesh.updateMatrixWorld(); return mesh;
}
const collisionOptions = collision => ({ resolve: (from, to) => collision.move(from, to), surfaceAt: (x, z, y) => collision.surfaceAt(x, z, y) });

test('20/60/120 FPS travel is the same normalized 3.5m smooth dash with a four-second recharge', () => {
  for (const fps of [20, 60, 120]) {
    const evade = createEvasion(), position = { x: 0, y: 0, z: 0 };
    assert.ok(evade.request({ x: 3, z: 4 }, allowed));
    const samples = [];
    for (let frame = 0; frame < fps * 4; frame++) {
      const delta = evade.update(1 / fps); samples.push(Math.hypot(delta.x, delta.z));
      const moved = moveEvasion(position, delta, flat); assert.equal(moved.blocked, false);
    }
    near(position.x, EVASION_DISTANCE * .6); near(position.z, EVASION_DISTANCE * .8);
    assert.equal(evade.state.ready, true); assert.equal(evade.state.active, false); assert.equal(evade.state.cooldown, 0);
    assert.equal(evade.state.progress, 1); assert.ok(samples[0] < Math.max(...samples), 'travel ramps up rather than teleporting on press');
    assert.ok(samples.slice(Math.ceil(EVASION_DURATION * fps)).every(distance => distance === 0));
  }
});

test('permissions, air, malformed input and held requests cannot spend or refresh a dash', () => {
  const evade = createEvasion();
  for (const permission of [{}, { allowed: false, grounded: true }, { allowed: true, grounded: false }]) assert.equal(evade.request({ x: 1, z: 0 }, permission), false);
  for (const direction of [null, {}, { x: 0, z: 0 }, { x: NaN, z: 1 }, { x: Infinity, z: 0 }, { x: Number.MAX_VALUE, z: Number.MAX_VALUE }]) assert.equal(evade.request(direction, allowed), false);
  assert.equal(evade.state.ready, true); assert.ok(evade.request({ x: 1, z: 0 }, allowed));
  evade.update(.1); const state = evade.state;
  for (let i = 0; i < 20; i++) assert.equal(evade.request({ x: 0, z: 1 }, allowed), false);
  assert.deepEqual(evade.state, state, 'repeated presses neither steer an active dash nor reset cooldown');
  for (const dt of [NaN, Infinity, -1, 0]) assert.deepEqual(evade.update(dt), { x: 0, z: 0 });
  assert.deepEqual(evade.state, state);
});

test('cancellation ends travel without refunding cooldown; only simulation updates recharge', () => {
  const evade = createEvasion(); evade.request({ x: 1, z: 0 }, allowed); evade.update(.07);
  const remaining = evade.state.cooldown; evade.cancel();
  assert.equal(evade.state.active, false); assert.equal(evade.state.cooldown, remaining); assert.equal(evade.state.progress, 0);
  assert.deepEqual(evade.update(.5), { x: 0, z: 0 }); near(evade.state.cooldown, remaining - .5);
  assert.equal(evade.request({ x: 1, z: 0 }, allowed), false);
  evade.update(remaining - .5); assert.ok(evade.state.ready); assert.ok(evade.request({ x: 0, z: -1 }, allowed));
  evade.reset(); assert.deepEqual(evade.state, { active: false, ready: true, cooldown: 0, progress: 0 });
});

test('a saved cooldown restores only recharge, never a partially executed dodge', () => {
  const evade = createEvasion(); evade.request({ x: 1, z: 1 }, allowed); evade.update(.08);
  const restored = createEvasion(); restored.restore(JSON.parse(JSON.stringify(evade.state.cooldown)));
  near(restored.state.cooldown, EVASION_COOLDOWN - .08); assert.equal(restored.state.active, false);
  assert.deepEqual(restored.update(.1), { x: 0, z: 0 });
  restored.restore(undefined); assert.equal(restored.state.ready, true);
  for (const value of [null, NaN, Infinity, '4', -2]) { restored.restore(value); assert.equal(restored.state.cooldown, 0); }
  restored.restore(100); assert.equal(restored.state.cooldown, EVASION_COOLDOWN);
  const publicState = restored.state; publicState.cooldown = 0; assert.equal(restored.state.ready, false, 'a caller cannot mutate live state');
});

test('a long frame emits only the remaining dash and sweeps every ground segment at most .15m', () => {
  const evade = createEvasion(), position = { x: 0, y: 0, z: 0 }, lengths = [];
  evade.request({ x: 1, z: 0 }, allowed);
  const result = moveEvasion(position, evade.update(5), { ...flat, resolve: (from, to) => lengths.push(Math.hypot(to.x - from.x, to.z - from.z)) });
  near(position.x, EVASION_DISTANCE); near(result.distance, EVASION_DISTANCE); assert.equal(result.blocked, false);
  assert.ok(lengths.length >= Math.ceil(EVASION_DISTANCE / EVASION_STEP)); assert.ok(lengths.every(length => length <= EVASION_STEP + 1e-9));
  assert.equal(evade.state.ready, true); assert.deepEqual(evade.update(5), { x: 0, z: 0 });
  const flatFallback = { x: 0, y: 2, z: 0 }; moveEvasion(flatFallback, { x: 1, z: 0 }); assert.equal(flatFallback.y, 2);
});

test('real swept scenery blocks thin walls but preserves diagonal sliding along them', () => {
  const wall = box(1, 2, 0, .06, 4, 10), collision = createFlightCollision({ solids: [wall] }), options = collisionOptions(collision);
  const headOn = { x: 0, y: 0, z: 0 };
  const blocked = moveEvasion(headOn, { x: 3.5, z: 0 }, options);
  assert.equal(blocked.blocked, true); assert.ok(headOn.x < .571 && headOn.x > .5); assert.ok(blocked.distance < 1);
  const slide = { x: 0, y: 0, z: -2 };
  const sliding = moveEvasion(slide, { x: 2, z: 2 }, options);
  assert.equal(sliding.blocked, false); assert.ok(slide.x < .571); near(slide.z, 0); assert.ok(sliding.distance > 2);
  wall.geometry.dispose(); wall.material.dispose();
});

test('gentle terrain follows support, while rises, drops and hazard strips stop safely', () => {
  const slope = { x: 0, y: 0, z: 0 };
  assert.equal(moveEvasion(slope, { x: 3, z: 0 }, { surfaceAt: x => x * .3 }).blocked, false); near(slope.y, .9);
  for (const height of [.7, -1.4]) {
    const position = { x: 0, y: 0, z: 0 };
    const result = moveEvasion(position, { x: 3.5, z: 0 }, { surfaceAt: x => x >= 1 ? height : 0 });
    assert.equal(result.blocked, true); assert.ok(position.x < 1); assert.equal(position.y, 0);
  }
  const hazard = { x: 0, y: 0, z: 0 };
  assert.equal(moveEvasion(hazard, { x: 3.5, z: 0 }, { ...flat, safeAt: x => x < 1 || x > 2 }).blocked, true);
  assert.ok(hazard.x < 1, 'a safe far endpoint cannot skip the lava between');
});

test('real roof support allows grounded dodges and stops before the roof edge', () => {
  const roof = box(0, 2, 0, 10, 4, 10), collision = createFlightCollision({ solids: [roof] }), options = collisionOptions(collision);
  const across = { x: -2, y: 4, z: 0 };
  assert.equal(moveEvasion(across, { x: 3.5, z: 0 }, options).blocked, false); near(across.y, 4); near(across.x, 1.5);
  const edge = { x: 4, y: 4, z: 0 };
  assert.equal(moveEvasion(edge, { x: 3.5, z: 0 }, options).blocked, true); assert.ok(edge.x < 5.4); near(edge.y, 4);
  roof.geometry.dispose(); roof.material.dispose();
});

test('resolved positions are rechecked for hazards and cannot depenetrate through distant scenery', () => {
  const position = { x: 0, y: 0, z: 0 };
  assert.equal(moveEvasion(position, { x: .1, z: 0 }, { ...flat, resolve: (_from, to) => { to.z = .04; }, safeAt: (_x, z) => z < .03 }).blocked, true);
  assert.deepEqual(position, { x: 0, y: 0, z: 0 });
  assert.equal(moveEvasion(position, { x: .1, z: 0 }, { ...flat, resolve: (_from, to) => { to.x = 3; } }).blocked, true);
  assert.deepEqual(position, { x: 0, y: 0, z: 0 });
  assert.equal(moveEvasion(position, { x: 100000, z: 0 }, flat).blocked, true);
  assert.equal(moveEvasion(position, { x: NaN, z: 0 }, flat).blocked, true);
});
