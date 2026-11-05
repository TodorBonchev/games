import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { Vector3, PerspectiveCamera } from '../vendor/three/build/three.module.js';
import { createCombatDirector, findSafeSpawn, separateEnemies, FEEDBACK_CAPACITY, MELEE_GRACE_SECONDS } from '../combat-director.js';

const enemy = (x = 0, z = -10, extra = {}) => ({ id: 1, position: new Vector3(x, 0, z), userData: { hp: 8, maxHp: 10, type: 'walker', ...extra } });
function setup(t, options = {}) {
  const dom = new JSDOM('<body></body>'); t.after(() => dom.window.close());
  const director = createCombatDirector({ container: dom.window.document.body, ...options }); t.after(() => director.dispose());
  const camera = new PerspectiveCamera(60, 1.5, .1, 200); camera.position.set(0, 2, 3); camera.updateMatrixWorld(true);
  const frame = (dt = 1 / 60, options = {}) => director.update(dt, { active: true, combat: true, position: new Vector3(), camera, enemies: [], ...options });
  return { director, frame, doc: dom.window.document };
}

test('a failed random spawn sequence falls back only to validated terrain at a safe player distance', () => {
  let checked = 0;
  const isValid = (x, z) => { checked++; return x < -8 && x > -15 && Math.abs(z) < 2; };
  const result = findSafeSpawn({ position: { x: 0, z: 0 }, isValid, shoreRadius: () => 30, random: () => 0 });
  assert.ok(result && isValid(result.x, result.z)); assert.ok(checked > 40);
  assert.ok(Math.hypot(result.x, result.z) >= 7);
  assert.equal(findSafeSpawn({ position: { x: 0, z: 0 }, isValid: () => false, random: () => 0 }), null, 'an impossible map cannot force an unsafe fallback');
});

test('crowd separation resolves exact overlaps, caps movement and constrains scenery after pushing', () => {
  const pair = [enemy(), { ...enemy(), id: 2 }], old = pair.map(z => z.position.clone()); let calls = 0;
  separateEnemies(pair, 1 / 60, () => calls++);
  assert.equal(calls, 2); assert.ok(pair[0].position.distanceTo(pair[1].position) > 0);
  pair.forEach((z, i) => assert.ok(z.position.distanceTo(old[i]) <= 1.4 / 60 + 1e-9));
  const dense = Array.from({ length: 24 }, (_, i) => ({ ...enemy(), id: i + 1 }));
  separateEnemies(dense, .05);
  dense.forEach(z => assert.ok(z.position.distanceTo(new Vector3(0, 0, -10)) <= .07 + 1e-9));
  const dead = enemy(0, -10, { dead: .1 }); const elevated = enemy(); elevated.position.y = 4;
  const saved = [dead.position.clone(), elevated.position.clone()]; separateEnemies([dead, elevated, enemy()], .05);
  assert.ok(dead.position.equals(saved[0])); assert.ok(elevated.position.equals(saved[1]));
});

test('shared grace suppresses overlapping melee strikes without protecting against acid, lava or slams', t => {
  const { director, frame } = setup(t);
  assert.ok(director.acceptDamage('melee', 18)); assert.equal(director.acceptDamage('melee', 18), false);
  for (const kind of ['acid', 'lava', 'slam']) assert.ok(director.acceptDamage(kind, 6));
  frame(.1); frame(.1); assert.equal(director.acceptDamage('melee', 18), false);
  frame(MELEE_GRACE_SECONDS - .2 + .001); assert.ok(director.acceptDamage('melee', 18));
  director.clear(); assert.equal(director.acceptDamage('melee', 18), false, 'opening a menu cannot erase a recent hit');
  director.reset(); assert.ok(director.acceptDamage('melee', 18));
  assert.equal(director.acceptDamage('lava', NaN), false);
});

test('early orb presses buffer only the last .3 seconds, cast once, and cancel on lifecycle clear', t => {
  let casts = 0, cues = 0; const { director, frame, doc } = setup(t, { onOrbReady: () => cues++ });
  assert.equal(director.requestOrb(.6), false); assert.equal(director.state.orbBuffered, false);
  frame(.01, { orbCooldown: .25 }); assert.equal(director.requestOrb(.25), false); assert.ok(director.state.orbBuffered);
  frame(.1, { orbCooldown: .15 }); frame(.1, { orbCooldown: .05 });
  frame(.05, { orbCooldown: 0, castOrb: () => casts++ }); frame(.05, { orbCooldown: 0, castOrb: () => casts++ });
  assert.equal(casts, 1); assert.equal(cues, 1); assert.equal(doc.getElementById('orbReadyCue').hidden, true, 'queued cast does not leave a misleading ready label');
  director.requestOrb(.2); director.clear(); frame(.1, { orbCooldown: 0, castOrb: () => casts++ }); assert.equal(casts, 1);
  assert.ok(director.requestOrb(0));
});

test('orb-ready sound and visual cue occur once per cooldown, never on initial deployment', t => {
  let cues = 0; const { frame, doc } = setup(t, { onOrbReady: () => cues++ });
  frame(.1); assert.equal(cues, 0);
  frame(.1, { orbCooldown: .1 }); frame(.1, { orbCooldown: 0 });
  assert.equal(cues, 1); assert.equal(doc.getElementById('orbReadyCue').hidden, false);
  for (let i = 0; i < 20; i++) frame(.1);
  assert.equal(cues, 1); assert.equal(doc.getElementById('orbReadyCue').hidden, true);
  frame(.1, { orbCooldown: .1 }); frame(.1); assert.equal(cues, 2);
});

test('target health and last-hostile direction update without leaking through noncombat screens', t => {
  const { director, frame, doc } = setup(t), z = enemy(20, 0);
  director.target(z); frame(.01, { enemies: [z] });
  assert.equal(doc.getElementById('combatTarget').hidden, false); assert.match(doc.getElementById('combatTarget').textContent, /Walker8 \/ 10/);
  assert.equal(doc.querySelector('[role=progressbar]').getAttribute('aria-valuenow'), '8');
  assert.equal(doc.getElementById('lastEnemy').hidden, false); assert.match(doc.getElementById('lastEnemy').getAttribute('aria-label'), /20 meters, right/);
  frame(.01, { enemies: [z], yaw: -Math.PI / 2 }); assert.match(doc.getElementById('lastEnemy').getAttribute('aria-label'), /ahead/);
  frame(.01, { enemies: [z], toSpawn: 1 }); assert.equal(doc.getElementById('lastEnemy').hidden, true);
  frame(.01, { enemies: [z], combat: false }); assert.equal(doc.getElementById('combatTarget').hidden, true);
  frame(.01, { active: false }); assert.equal(director.element.hidden, true);
});

test('damage feedback aggregates scatter pellets and stays bounded under orb and crowd hits', t => {
  const { director, frame, doc } = setup(t), z = enemy();
  for (let i = 0; i < 7; i++) director.damage(z, 1.25, i === 6);
  frame(); assert.equal(director.state.feedback, 1); assert.match(doc.querySelector('.combat-number:not([hidden])').textContent, /8.8 · ELIMINATED/);
  frame(.1); frame(.1); director.damage(z, 1); frame(); assert.equal(director.state.feedback, 1, 'sustained hits cannot stack unreadable labels over the same enemy');
  for (let i = 0; i < 40; i++) director.damage(enemy(i * .1), .7);
  frame(); assert.equal(director.state.feedback, FEEDBACK_CAPACITY); assert.equal(doc.querySelectorAll('.combat-number').length, FEEDBACK_CAPACITY);
  for (let i = 0; i < 9; i++) frame(.1);
  assert.equal(director.state.feedback, 0); assert.equal(doc.querySelectorAll('.combat-number:not([hidden])').length, 0);
});

test('barrel obstruction is brief, arrivals have visible labels and death tips identify the actual hazard', t => {
  const { director, frame, doc } = setup(t);
  director.blocked(); frame(.01, { enemies: [enemy(0, -10, { arrivalTime: .5 })] });
  assert.equal(doc.getElementById('muzzleBlocked').hidden, false);
  assert.equal(doc.querySelectorAll('.combat-arrival:not([hidden])').length, 1);
  for (let i = 0; i < 9; i++) frame(.1);
  assert.equal(doc.getElementById('muzzleBlocked').hidden, true); assert.equal(doc.querySelectorAll('.combat-arrival:not([hidden])').length, 0);
  director.acceptDamage('acid', 6); assert.match(director.deathInfo.cause, /acid/); assert.match(director.deathInfo.tip, /spitter/);
  director.clear(); assert.match(director.deathInfo.cause, /acid/, 'death UI survives the input clear');
  director.acceptDamage('slam', 32); assert.match(director.deathInfo.cause, /commander/);
  director.reset(); assert.match(director.deathInfo.cause, /combat/);
});
