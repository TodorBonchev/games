import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import * as THREE from '../vendor/three/build/three.module.js';
import { seededRandom } from '../world-seed.js';

// Production builders, real Three.js geometry and actual outpost placement.
// Only the canvas drawing and GPU-generated environment texture are replaced.
const dom = new JSDOM('<body></body>');
dom.window.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy({ canvas: this, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    createRadialGradient: () => ({ addColorStop() {} }), createLinearGradient: () => ({ addColorStop() {} }) },
  { get: (target, key) => key in target ? target[key] : () => {} });
};
class EnvironmentTexture { fromScene() { return { texture: new THREE.Texture() }; } dispose() {} }
const context = vm.createContext({ document: dom.window.document, console });
const engine = new vm.SyntheticModule(Object.keys(THREE), function () {
  for (const [name, value] of Object.entries(THREE)) this.setExport(name, name === 'PMREMGenerator' ? EnvironmentTexture : value);
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
const worlds = [await imported('../world.js'), await imported('../world2.js')];
const { placeActivityStations } = await imported('../activities/world.js');
const tiers = [{ name: 'low', mobile: true, low: true }, { name: 'medium', mobile: true, low: false }, { name: 'high', mobile: false, low: false }];
function signature(level, layoutSeed, layoutMobile, tier, visualSeed) {
  context.visualRandom = seededRandom(visualSeed); vm.runInContext('Math.random = visualRandom', context);
  const terrain = worlds[level - 1], scene = new THREE.Scene();
  const world = terrain.buildWorld(scene, tier.mobile, { capabilities: { getMaxAnisotropy: () => 1 } }, { low: tier.low, layoutSeed, layoutMobile });
  scene.updateMatrixWorld(true);
  const { circles, boxes } = world, onLand = (x, z, clear = 0) => terrain.islandD(x, z) <= .88 &&
    circles.every(c => Math.hypot(c.x - x, c.z - z) >= c.r + clear) && boxes.every(b => Math.abs(b.x - x) >= b.hx + clear || Math.abs(b.z - z) >= b.hz + clear);
  const stations = placeActivityStations({ ...terrain, onLand, level });
  const result = {
    layout: JSON.stringify({ circles, boxes, solids: world.solids.map(mesh => ({ transform: mesh.matrixWorld.toArray(), count: mesh.count,
      instances: mesh.isInstancedMesh ? Array.from(mesh.instanceMatrix.array.slice(0, mesh.count * 16)) : null })),
    stations: stations.map(({ id, x, y, z }) => ({ id, x, y, z })) }),
    groundVertices: world.ground.geometry.attributes.position.count,
    particles: scene.children.filter(object => object.isPoints).reduce((n, object) => n + object.geometry.attributes.position.count, 0),
  };
  assert.equal(stations.length, 30);
  const geometries = new Set(), materials = new Set(), textures = new Set();
  scene.traverse(object => { if (object.geometry) geometries.add(object.geometry); for (const material of (Array.isArray(object.material) ? object.material : object.material ? [object.material] : [])) materials.add(material); });
  for (const material of materials) for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(texture => texture.dispose()); scene.environment?.dispose(); scene.clear();
  return result;
}
for (const level of [1, 2]) for (const layoutMobile of [true, false]) for (const seed of [42, 3728251702]) {
  test(`island ${level}, ${layoutMobile ? 'compact' : 'dense'} seed ${seed}: quality and cosmetic randomness preserve physical cover and all outposts`, () => {
    const results = tiers.map((tier, index) => signature(level, seed, layoutMobile, tier, 9114 + index * 193));
    assert.equal(results[1].layout, results[0].layout, 'low → medium preserves all colliders, solid transforms and outposts');
    assert.equal(results[2].layout, results[0].layout, 'low → high preserves all colliders, solid transforms and outposts');
    assert.ok(results[1].groundVertices > results[0].groundVertices, 'medium still upgrades terrain detail');
    assert.ok(results[2].groundVertices > results[1].groundVertices, 'high still upgrades terrain detail');
    assert.ok(results[2].particles > results[0].particles, 'the visual effects budget still follows actual quality');
  });
}
test.after(() => dom.window.close());
