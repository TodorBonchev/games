import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as THREE from '../vendor/three/build/three.module.js';
import { createGame } from './harness.mjs';

const context = vm.createContext({});
const engine = new vm.SyntheticModule(Object.keys(THREE), function () {
  for (const [name, value] of Object.entries(THREE)) this.setExport(name, value);
}, { context, identifier: 'three' });
const modules = new Map();
async function load(url) {
  if (!modules.has(url.href)) modules.set(url.href, (async () => new vm.SourceTextModule(await readFile(url, 'utf8'), { context, identifier: url.href }))());
  return modules.get(url.href);
}
async function imported(path) {
  const entry = await load(new URL(path, import.meta.url));
  if (entry.status === 'unlinked') await entry.link((specifier, parent) => {
    if (specifier === 'three') return engine;
    return load(specifier.startsWith('three/addons/') ? new URL(`../vendor/three/examples/jsm/${specifier.slice(13)}`, import.meta.url) : new URL(specifier.split('?')[0], parent.identifier));
  });
  if (entry.status !== 'evaluated') await entry.evaluate();
  return entry.namespace;
}
const { placeActivityStations, createActivityWorld, ACTIVITY_SPACING } = await imported('../activities/world.js');
const terrains = [await imported('../world.js'), await imported('../world2.js')];

for (const level of [1, 2]) test(`all 30 activities have separated, approachable stations on island ${level}`, async () => {
  const terrain = terrains[level - 1];
  for (const seed of [42, 4253 + level, 98422, 1, 4729, 222222]) {
    const harness = await createGame({ level, seed });
    try {
      const { circles, boxes } = harness.game.colliders;
      const onLand = (x, z, clearance = 0) => terrain.islandD(x, z) <= .88 &&
        circles.every(c => Math.hypot(x - c.x, z - c.z) >= c.r + clearance) &&
        boxes.every(b => Math.abs(x - b.x) >= b.hx + clearance || Math.abs(z - b.z) >= b.hz + clearance);
      const options = { ...terrain, onLand, level };
      const stations = placeActivityStations(options);
      assert.equal(stations.length, 30); assert.equal(new Set(stations.map(s => s.id)).size, 30);
      assert.equal(new Set(stations.map(s => s.district)).size, 6);
      for (const station of stations) {
        const location = `${station.id} on island ${level}, seed ${seed}`;
        assert.ok(terrain.islandD(station.x, station.z) < .78, `inland: ${location}`);
        assert.ok(terrain.lavaF(station.x, station.z) < .02, `no lava: ${location}`);
        assert.ok(onLand(station.x, station.z, 1.5), `no overlapping world props: ${location}`);
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
          const x = station.x + Math.cos(angle) * 2.3, z = station.z + Math.sin(angle) * 2.3;
          assert.ok(onLand(x, z, .45), `clear approach: ${location}`);
          assert.ok(terrain.lavaF(x, z) < .02, `lava-free approach: ${location}`);
          assert.ok(Math.abs(terrain.groundH(x, z) - station.y) <= 1.4, `walkable slope: ${location}`);
        }
        for (const other of stations) if (other !== station) assert.ok(Math.hypot(station.x - other.x, station.z - other.z) >= ACTIVITY_SPACING - 1e-9, `separated: ${location}`);
      }
      assert.deepEqual(placeActivityStations(options).map(({ id, x, z }) => ({ id, x, z })), stations.map(({ id, x, z }) => ({ id, x, z })), 'placement is stable for a built world');
    } finally { harness.close(); }
  }
});

test('outpost sanctuary excludes flying players, tracks completion and releases its resources', () => {
  const scene = new THREE.Scene();
  const world = createActivityWorld({ scene, groundH: () => 2, islandD: (x, z) => Math.hypot(x, z) / 60, lavaF: () => 0, onLand: () => true, progress: { completed: ['upside'], target: 'upside' } });
  const station = world.stations.find(s => s.id === 'upside'), standing = new THREE.Vector3(station.x, station.y, station.z);
  assert.equal(world.nearest(standing).id, 'upside'); assert.equal(world.safe(standing), true);
  assert.equal(world.safe(standing.clone().add(new THREE.Vector3(0, 3, 0))), false);
  assert.equal(world.safe(new THREE.Vector3(100, 2, 100)), false);
  assert.equal(station.completed, true); assert.equal(world.target, 'upside');
  assert.equal(world.setTarget('unknown-game'), false); assert.equal(world.target, null);
  world.refresh({ completed: ['garden'], target: 'garden' });
  assert.equal(station.completed, false); assert.equal(world.stations.find(s => s.id === 'garden').completed, true); assert.equal(world.target, 'garden');
  const camera = new THREE.PerspectiveCamera(); world.update({ time: 2, player: standing, camera });
  assert.ok(world.root.children.every(object => !object.isLight), 'outposts do not add dynamic lights');
  assert.ok(world.root.children.length <= 7, 'thirty terminals are batched into at most seven draws');
  assert.equal(world.zones.length, 30); world.dispose(); world.dispose(); assert.equal(scene.children.length, 0);
});
