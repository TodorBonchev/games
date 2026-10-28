import { expeditionTargets } from './lantern-game.js?v4';

// The landscapes and transforming landmarks are authored in Blender. This
// small layer animates those objects and batches the flight activity markers.
export function createExpeditionScene({ THREE, scene, village, world, camera, registerGeometry, registerMaterial, glowTexture }) {
  const nodes = expeditionTargets(world);
  const basic = (color, options = {}) => registerMaterial(new THREE.MeshBasicMaterial({ color, toneMapped: false, ...options }));
  const coreGeometry = registerGeometry(new THREE.OctahedronGeometry(1));
  const ringGeometry = registerGeometry(new THREE.TorusGeometry(1, .035, 6, 40));
  const glowGeometry = registerGeometry(new THREE.PlaneGeometry(1, 1));
  const sparkGeometry = registerGeometry(new THREE.SphereGeometry(1, 6, 4));
  const create = (geometry, material, capacity) => {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0;
    scene.add(mesh); return mesh;
  };
  const cores = create(coreGeometry, basic('#ffffff'), 8);
  const rings = create(ringGeometry, basic('#ffffff', { transparent: true, opacity: .9 }), 10);
  const glows = create(glowGeometry, basic('#ffffff', { map: glowTexture, transparent: true, opacity: .65, blending: THREE.AdditiveBlending, depthWrite: false }), 10);
  const sparks = create(sparkGeometry, basic('#ffffff', { transparent: true, opacity: .8 }), 64);
  const transform = new THREE.Object3D(), tint = new THREE.Color(), facing = new THREE.Quaternion();
  const rotation = new THREE.Quaternion(), spinAxis = new THREE.Vector3(0, 1, 0);
  const counts = new Map(), meshes = [cores, rings, glows, sparks];
  const satellites = (world.satellites || []).map(island => {
    const bloom = village.getObjectByName('MoonbloomBloom');
    const orrery = village.getObjectByName('SunspireOrrery');
    const model = village.getObjectByName(island.id === 'moonbloom' ? 'MoonbloomSanctuary' : 'SunspireObservatory');
    const petals = island.id === 'moonbloom' ? Array.from({ length: 6 }, (_, i) => village.getObjectByName(`MoonbloomPetal${i}`)).filter(Boolean).map((object, i) => ({ object, base: object.quaternion.clone(), axis: new THREE.Vector3(Math.sin(i * Math.PI / 3), 0, -Math.cos(i * Math.PI / 3)) })) : [];
    const landmark = island.id === 'moonbloom' ? bloom : orrery;
    const core = village.getObjectByName(island.id === 'moonbloom' ? 'MoonbloomCore' : 'SunspireCore');
    if (core?.isMesh) core.material = registerMaterial(core.material.clone());
    return { ...island, model, bloom: island.id === 'moonbloom' ? bloom : null, orrery: island.id === 'sunspire' ? orrery : null, petals, landmark, core, base: landmark?.quaternion.clone(), open: 0 };
  });
  function put(mesh, position, scale, color, orient = null) {
    const index = counts.get(mesh) || 0;
    if (index >= mesh.instanceMatrix.count) return;
    transform.position.set(position.x, position.y, position.z);
    if (typeof scale === 'number') transform.scale.setScalar(scale); else transform.scale.set(...scale);
    transform.quaternion.identity();
    if (orient === 'billboard') transform.quaternion.copy(facing);
    else if (orient) transform.rotation.set(...orient);
    transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix); mesh.setColorAt(index, tint.set(color)); counts.set(mesh, index + 1);
  }
  let lastTick = null;
  function update(state, time, reduced) {
    counts.clear(); camera.getWorldQuaternion(facing);
    const expedition = state.expedition || { collected: [], awakened: [] };
    const collected = new Set(expedition.collected), awake = new Set(expedition.awakened);
    const delta = lastTick === null || state.ticks < lastTick ? 1 : Math.min(.1, Math.max(0, (state.ticks - lastTick) / 60));
    lastTick = state.ticks;
    const blend = reduced || !['playing', 'exploring'].includes(state.mode) ? 1 : 1 - Math.exp(-delta * 4);
    for (const node of nodes) {
      if (collected.has(node.id)) continue;
      const seed = node.kind === 'seed', color = seed ? '#bdfbea' : '#ffdc89';
      const position = { ...node, y: node.y + (reduced ? 0 : Math.sin(time * 1.6 + node.index) * .12) };
      if (seed) put(cores, position, [.32, .55, .32], color, [0, reduced ? 0 : time * .4, .2]);
      put(rings, node, seed ? .85 : 1.6, color, 'billboard');
      put(glows, position, seed ? 2 : 3.2, color, 'billboard');
    }
    for (const island of satellites) {
      const awakened = awake.has(island.id), target = awakened ? 1 : 0;
      island.open += (target - island.open) * blend;
      if (Math.abs(target - island.open) < .001) island.open = target;
      if (island.bloom) {
        for (const petal of island.petals) {
          rotation.setFromAxisAngle(petal.axis, island.open * .9);
          petal.object.quaternion.copy(petal.base).multiply(rotation);
        }
      }
      if (island.orrery && island.base) {
        rotation.setFromAxisAngle(spinAxis, reduced || !awakened ? 0 : time * .24);
        island.orrery.quaternion.copy(island.base).premultiply(rotation);
      }
      if (island.core?.material.emissiveIntensity !== undefined) island.core.material.emissiveIntensity = .15 + island.open * 2;
      if (!awakened) continue;
      const center = world.satellites.find(item => item.id === island.id).landmark;
      const color = island.id === 'moonbloom' ? '#d3b8ff' : '#ffd27b';
      put(glows, { ...center, y: center.y + 1 }, island.id === 'moonbloom' ? 8 : 7, color, 'billboard');
      put(rings, { ...center, y: center.y + .3 }, 3.6, color, [-Math.PI / 2, 0, 0]);
      for (let i = 0; i < 24; i++) {
        const phase = i / 24 * Math.PI * 2, angle = phase + (reduced ? 0 : time * .14), radius = 2.2 + Math.sin(i * 2.1) * .8;
        put(sparks, { x: center.x + Math.sin(angle) * radius, y: center.y + 1 + (reduced ? i / 12 : ((i / 24 + time * .07) % 1) * 3), z: center.z + Math.cos(angle) * radius }, .05 + i % 3 * .015, color);
      }
    }
    for (const mesh of meshes) {
      mesh.count = counts.get(mesh) || 0; mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
  return { update, satellites };
}
