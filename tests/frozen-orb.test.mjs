import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as THREE from '../vendor/three/build/three.module.js';

const context = vm.createContext({});
const engine = new vm.SyntheticModule(Object.keys(THREE), function () {
  for (const [key, value] of Object.entries(THREE)) this.setExport(key, value);
}, { context });
const module = new vm.SourceTextModule(await readFile(new URL('../frozen-orb.js', import.meta.url), 'utf8'), { context });
await module.link(() => engine); await module.evaluate();
const { createFrozenOrb, FROZEN_ORB_COOLDOWN } = module.namespace;
const origin = () => new THREE.Vector3(0, 1.2, 0), forward = () => new THREE.Vector3(0, 0, -1);
function enemy(x, z, hp = 20) {
  const object = new THREE.Group(); object.position.set(x, 0, z); object.userData = { hp, dead: false }; return object;
}
function setup(options = {}) {
  const scene = new THREE.Scene(), hits = [];
  const spell = createFrozenOrb(scene, { ...options, hitEnemy(target, point, damage, source) {
    target.userData.hp -= damage; if (target.userData.hp <= 0) target.userData.dead = true;
    hits.push({ target, point: point.clone(), damage, source: source.clone() });
  } });
  return { scene, spell, hits };
}

test('Frozen Orb pierces enemies, chills survivors and respects its cooldown', () => {
  const { spell, hits } = setup(), targets = [enemy(0, -4), enemy(0, -9)];
  assert.equal(spell.cast(origin(), forward()), true);
  assert.equal(spell.cast(origin(), forward()), false);
  spell.update(1.1, targets);
  for (const target of targets) {
    assert.ok(target.userData.hp < 20);
    assert.equal(target.userData.frostTime, 3);
    assert.equal(hits.filter(hit => hit.target === target && hit.damage === 2.5).length, 1, 'the core hits each enemy once');
  }
  assert.ok(spell.state.cooldown > 6);
  assert.equal(spell.cast(origin(), forward()), false);
  spell.update(FROZEN_ORB_COOLDOWN, targets);
  assert.equal(spell.state.ready, true); assert.equal(spell.state.shards, 0);
  assert.equal(spell.cast(origin(), forward()), true);
});

test('Traveling orb sheds radial ice and ends with a burst from its final position', () => {
  const { spell, hits } = setup(), besideTrail = enemy(3, -2), besideBurst = enemy(4, -18);
  spell.cast(origin(), forward());
  spell.update(.7, [besideTrail]);
  assert.ok(spell.state.shards > 0); assert.ok(hits.some(hit => hit.target === besideTrail), 'shards leave the forward path');
  spell.update(1.11, [besideTrail]);
  assert.equal(spell.state.active, false); assert.ok(spell.state.shards >= 24, 'a final radial burst remains after the core disappears');
  spell.update(.5, [besideTrail, besideBurst]);
  assert.ok(hits.some(hit => hit.target === besideBurst && hit.damage === 1.5));
  spell.update(1, []); assert.equal(spell.state.shards, 0);
});

test('Swept collision gives the same damage across long and short frames', () => {
  const a = setup(), b = setup(), targetsA = [enemy(0, -7), enemy(2, -4)], targetsB = [enemy(0, -7), enemy(2, -4)];
  a.spell.cast(origin(), forward()); b.spell.cast(origin(), forward());
  a.spell.update(2.5, targetsA);
  for (let i = 0; i < 150; i++) b.spell.update(1 / 60, targetsB);
  assert.deepEqual(targetsA.map(z => z.userData.hp), targetsB.map(z => z.userData.hp));
  assert.ok(targetsA.every(z => z.userData.hp < 20), 'fast shards cannot tunnel past targets');
});

test('Solid cover blocks the core and shards even during a long frame', () => {
  const { spell, hits } = setup({ blocked(from, to) {
    // A wall at z=-4 extends through the entire X/Y plane.
    if (from.z >= -4 && to.z <= -4) return from.distanceTo(to) * ((from.z + 4) / (from.z - to.z));
    if (from.z < -4) return true;
    return false;
  } });
  const front = enemy(0, -1.5), behind = enemy(0, -6.5);
  spell.cast(origin(), forward()); spell.update(3, [front, behind]);
  assert.ok(hits.some(hit => hit.target === front)); assert.equal(behind.userData.hp, 20);
  assert.equal(spell.state.active, false); assert.ok(spell.state.position[2] >= -4 - 1e-8);
});

test('Airborne orbs keep their height and angled casts impact terrain', () => {
  const { spell, hits } = setup(), grounded = enemy(0, -6);
  spell.cast(new THREE.Vector3(0, 12, 0), forward()); spell.update(3, [grounded]);
  assert.equal(hits.length, 0, 'flying over an enemy cannot hit it through vertical distance');
  spell.reset(); const besideImpact = enemy(2.5, -3.9);
  spell.cast(new THREE.Vector3(0, 4, 0), new THREE.Vector3(0, -1, -1)); spell.update(1, [besideImpact]);
  assert.equal(spell.state.active, false); assert.ok(spell.state.position[1] >= .12 && spell.state.position[1] < .2);
  assert.ok(hits.some(hit => hit.target === besideImpact), 'the ground-impact burst reaches nearby enemies instead of burying its shards');
});

test('Shard overlap cannot multiply damage without a bound inside a large enemy', () => {
  const { spell, hits } = setup(), target = enemy(0, -18, 1000); target.scale.setScalar(2);
  spell.cast(origin(), forward()); spell.update(3, [target]);
  assert.ok(hits.some(hit => hit.damage === 1.5));
  assert.ok(target.userData.hp > 980, 'radial burst has a per-target hit interval');
});

test('Clear preserves cooldown; reset and disposal remove all reusable effects', () => {
  const { scene, spell } = setup({ low: true }), root = scene.getObjectByName('frozen-orb');
  const geometries = []; root.traverse(o => { if (o.isMesh) geometries.push(o.geometry); });
  for (let cast = 0; cast < 5; cast++) {
    spell.reset(); spell.cast(origin(), forward());
    for (let frame = 0; frame < 180; frame++) { spell.update(1 / 60, []); assert.ok(spell.state.shards <= spell.capacity); }
  }
  const after = []; root.traverse(o => { if (o.isMesh) after.push(o.geometry); }); assert.deepEqual(after, geometries);
  spell.clear(); assert.equal(spell.state.active, false); assert.equal(spell.state.shards, 0); assert.ok(spell.state.cooldown > 0);
  spell.reset(); assert.equal(spell.state.cooldown, 0); assert.equal(spell.state.ready, true);
  spell.dispose(); spell.dispose(); assert.equal(scene.getObjectByName('frozen-orb'), undefined); assert.equal(spell.cast(origin(), forward()), false);
});

test('Reduced motion retains gameplay and readable ice while suppressing rotation', () => {
  const { scene, spell, hits } = setup(); spell.cast(origin(), forward());
  spell.update(.5, [enemy(0, -3)], { motion: false });
  assert.ok(hits.length); const core = scene.getObjectByName('frozen-orb-core');
  assert.equal(core.visible, true); assert.equal(core.children[0].rotation.x, 0); assert.equal(core.children[0].rotation.y, 0);
  assert.equal(scene.getObjectByName('frozen-orb-shards').visible, true);
  const cooldown = spell.state.cooldown; spell.update(NaN); spell.update(-1); assert.equal(spell.state.cooldown, cooldown);
});
