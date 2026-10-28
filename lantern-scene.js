import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createLanternSpace } from './lantern-space.js';
import { createLanternShip } from './lantern-ship.js';
import { flightTargets, flightSpawn, isFlightClear } from './lantern-game.js?v3';

// The island is authored in Blender; the scout, flight markers, and starfield
// animate around it without changing the environment's baked geometry.
export async function createLanternScene(container, world, { resized, lost, restored, progress } = {}) {
  const touch = matchMedia('(pointer: coarse)').matches;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ antialias: !touch, powerPreference: 'low-power' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  // The village never moves. Its shadow map is drawn once rather than once
  // per frame, keeping the soft roof/tree shadows affordable on a phone.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.setClearColor('#090e23');
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#090e23');
  const camera = new THREE.PerspectiveCamera(58, 1, .12, 600);
  const targets = flightTargets(world);
  const sky = new THREE.HemisphereLight('#e5e4ff', '#68618d', 1.8);
  scene.add(sky);
  const sun = new THREE.DirectionalLight('#ffd8b4', 2.45);
  sun.position.set(-20, 30, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -22;
  sun.shadow.camera.right = sun.shadow.camera.top = 22;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 85;
  sun.shadow.bias = -.0004;
  sun.shadow.normalBias = .035;
  scene.add(sun);
  const rimLight = new THREE.DirectionalLight('#acbaff', 1.3);
  rimLight.position.set(12, 8, -20);
  scene.add(rimLight);

  const geometries = new Set(), materials = new Set(), textures = new Set();
  const registerGeometry = geometry => { geometries.add(geometry); return geometry; };
  const registerMaterial = material => { materials.add(material); return material; };
  const sphere = registerGeometry(new THREE.SphereGeometry(1, 10, 7));
  const ringGeometry = registerGeometry(new THREE.TorusGeometry(1, .035, 5, 32));
  const octahedron = registerGeometry(new THREE.OctahedronGeometry(1));
  const basic = (color, options = {}) => registerMaterial(new THREE.MeshBasicMaterial({ color, ...options }));
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 64;
  const ctx = glowCanvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  gradient.addColorStop(0, '#ffffffd9');
  gradient.addColorStop(.22, '#ffffff94');
  gradient.addColorStop(.55, '#ffffff23');
  gradient.addColorStop(1, '#ffffff00');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  textures.add(glowTexture);
  const plane = registerGeometry(new THREE.PlaneGeometry(1, 1));
  const gold = basic('#fff4ac', { toneMapped: false });
  const paleGold = basic('#ffdb8a', { toneMapped: false });
  const glowMaterial = basic('#ffc975', {
    map: glowTexture, transparent: true, depthWrite: false,
    opacity: .68, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const groundGlowMaterial = basic('#ffd485', {
    map: glowTexture, transparent: true, depthWrite: false, opacity: .47,
    blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const crystalMaterial = registerMaterial(new THREE.MeshStandardMaterial({
    color: '#d3b5ff', emissive: '#8b5ec9', emissiveIntensity: .6,
    metalness: .25, roughness: .25,
  }));
  const makeInstances = (geometry, material, count) => {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    return mesh;
  };
  const moteCores = makeInstances(sphere, gold, world.motes.length * 3 + 16);
  const moteGlows = makeInstances(plane, glowMaterial, world.motes.length + 16);
  const trailCores = makeInstances(sphere, paleGold, 14);
  const memoryCrystals = makeInstances(octahedron, crystalMaterial, world.secrets.length);
  const memoryRings = makeInstances(ringGeometry, paleGold, world.secrets.length);
  const effectCores = makeInstances(sphere, gold, 250);
  const lanternGlows = makeInstances(plane, glowMaterial, world.beacons.length);
  const lanternCores = makeInstances(sphere, gold, world.beacons.length);
  const lanternPools = makeInstances(plane, groundGlowMaterial, world.beacons.length);
  const scanRings = makeInstances(ringGeometry, paleGold, world.beacons.length);
  const scanBeams = makeInstances(sphere, basic('#7fe5eb', { transparent: true, opacity: .28, depthWrite: false, toneMapped: false }), world.beacons.length);
  const foamMaterial = basic('#e4f8ef', { transparent: true, opacity: .6, depthWrite: false });
  const foam = makeInstances(sphere, foamMaterial, 42);
  const transform = new THREE.Object3D();
  const tint = new THREE.Color();
  const facingCamera = new THREE.Quaternion();
  const counts = new Map();
  const dynamicMeshes = [moteCores, moteGlows, trailCores, memoryCrystals, memoryRings,
    effectCores, lanternGlows, lanternCores, lanternPools, scanRings, scanBeams, foam];

  function put(mesh, x, y, z, sx, sy = sx, sz = sx, color = null, rotation = null) {
    const index = counts.get(mesh) || 0;
    if (index >= mesh.instanceMatrix.count) return;
    transform.position.set(x, y, z);
    transform.scale.set(sx, sy, sz);
    transform.quaternion.identity();
    if (rotation === 'billboard') transform.quaternion.copy(facingCamera);
    else if (rotation) transform.rotation.set(...rotation);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    if (color) mesh.setColorAt(index, tint.set(color));
    counts.set(mesh, index + 1);
  }

  // With no sea, horizon, or cloud floor, the authored rock strata and
  // cascading river remain suspended in open space. Stars use four batched
  // background draws rather than extra world lights or a post-process pass.
  const space = createLanternSpace({ THREE, scene, camera, reducedMotion: reduced.matches });

  let asset;
  try {
    asset = await new GLTFLoader().loadAsync(new URL('./assets/lantern-vale.glb', import.meta.url).href,
      event => { if (event.lengthComputable && event.total > 0) progress?.(event.loaded / event.total); });
  } catch (error) {
    space.dispose();
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    textures.forEach(texture => texture.dispose());
    renderer.dispose(); renderer.forceContextLoss();
    renderer.domElement.remove();
    throw error;
  }
  const village = asset.scene;
  village.name = 'LanternValeBlenderWorld';
  scene.add(village);
  const windowMaterials = new Set();
  village.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = object.name.startsWith('Static_') && !/Water|Window|Flower|Flag/i.test(object.name);
    object.receiveShadow = true;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      if (/windowglow/i.test(material.name)) windowMaterials.add(material);
      // A restrained specular response keeps the painted miniature readable.
      if (material.roughness !== undefined) material.roughness = Math.max(.42, material.roughness);
      if (material.map) textures.add(material.map);
    }
  });

  const authoredAvatar = village.getObjectByName('Avatar');
  authoredAvatar?.removeFromParent();
  const scout = createLanternShip({ THREE, registerGeometry, registerMaterial, glowTexture });
  const ship = scout.ship; scene.add(ship);
  const windmill = village.getObjectByName('WindmillRotor');
  const rotorBase = windmill?.quaternion.clone();
  const rotorTurn = new THREE.Quaternion();
  const spinAxis = new THREE.Vector3(0, 0, 1);

  let width = 0, height = 0, initializedCamera = false, lastTime = null;
  let lastState = null, contextLost = false, cameraMode = null;
  const focus = new THREE.Vector3();
  const desiredFocus = new THREE.Vector3();
  const overviewDirection = new THREE.Vector3(.5, .48, .7).normalize();
  const viewRight = new THREE.Vector3(), viewForward = new THREE.Vector3();
  const cameraDestination = new THREE.Vector3(), shipPosition = new THREE.Vector3();
  const cameraRay = new THREE.Vector3(), probe = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const animationTime = state => reduced.matches ? 0 : (state.ticks || 0) / 60;

  // Pull a chase camera forward if scenery lies between it and the ship.
  // This also prevents smoothing across the rock when circling underneath.
  function keepCameraClear(position, player) {
    shipPosition.set(player.x, player.y, player.z);
    cameraRay.copy(position).sub(shipPosition);
    const distance = cameraRay.length();
    if (distance < .001) return;
    cameraRay.divideScalar(distance);
    let safe = 0;
    for (let d = .25; d <= distance + .249; d += .25) {
      const step = Math.min(d, distance);
      probe.copy(shipPosition).addScaledVector(cameraRay, step);
      // Camera clearance is independent of the pilot's outer flight fence.
      if (!isFlightClear(world, probe.x, probe.y, probe.z, .16)) break;
      safe = step;
    }
    if (safe < distance) position.copy(shipPosition).addScaledVector(cameraRay, Math.max(.18, safe - .1));
  }

  function updateCamera(state, time) {
    const overview = state.mode === 'ready' || state.mode === 'won';
    if (cameraMode !== overview) initializedCamera = false;
    cameraMode = overview;
    const aspect = width / height;
    const player = state.player || flightSpawn(world);
    const elapsed = lastTime === null ? 1 : Math.min(.1, Math.max(0, time - lastTime));
    const blend = reduced.matches || !initializedCamera ? 1 : 1 - Math.exp(-elapsed * 12);
    if (overview) {
      desiredFocus.set(0, -.6, 0);
      const span = Math.max(36, 39 / aspect);
      const distance = span / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * .5)));
      cameraDestination.copy(desiredFocus).addScaledVector(overviewDirection, distance);
    } else {
      forward.set(Math.sin(player.heading), 0, Math.cos(player.heading));
      // Keep the engine bells in the lower third, with the destination ahead.
      // Widen portrait framing by moving back, rather than shrinking the craft.
      const distance = aspect < .85 ? 8.8 : 7.4;
      const underIsland = player.y < -5;
      const height = underIsland ? -1.6 : 2.8;
      desiredFocus.set(player.x, player.y + (underIsland ? 2.5 : .45), player.z).addScaledVector(forward, 6.2);
      cameraDestination.set(player.x, player.y + height, player.z).addScaledVector(forward, -distance);
      keepCameraClear(cameraDestination, player);
    }
    focus.lerp(desiredFocus, blend);
    camera.position.lerp(cameraDestination, blend);
    if (!overview) keepCameraClear(camera.position, player);
    camera.lookAt(focus);
    camera.updateMatrixWorld();
    camera.getWorldQuaternion(facingCamera);
    initializedCamera = true;
    lastTime = time;
  }

  function render(state, time = 0) {
    if (contextLost) return;
    lastState = state;
    updateCamera(state, time);
    space.update({ time: animationTime(state), cameraPosition: camera.position, focus, reducedMotion: reduced.matches });
    const t = animationTime(state);
    const player = state.player || flightSpawn(world);
    const lit = new Set(state.lit || []), collected = new Set(state.collected || []), secrets = new Set(state.secrets || []);
    sky.intensity = 1.8 + lit.size * .045;
    sun.intensity = 2.25 + lit.size * .04;
    for (const material of windowMaterials) material.emissiveIntensity = .25 + lit.size * .15;
    scout.update(player, t, reduced.matches);
    if (windmill) {
      rotorTurn.setFromAxisAngle(spinAxis, reduced.matches ? 0 : t * .3);
      windmill.quaternion.copy(rotorBase).multiply(rotorTurn);
    }

    counts.clear();
    for (let i = 0; i < world.motes.length; i++) {
      if (collected.has(i)) continue;
      const { x, y, z } = targets.motes[i];
      const bob = Math.sin(t * 2.1 + i * 1.7) * .1;
      put(moteCores, x, y + bob, z, .13);
      put(moteGlows, x, y + bob, z, .9, .9, 1, null, 'billboard');
      for (let n = 0; n < 2; n++) {
        const a = t * 1.5 + i + n * Math.PI;
        put(moteCores, x + Math.cos(a) * .18, y - .05 + bob + n * .1, z + Math.sin(a) * .15, .025);
      }
    }
    world.beacons.forEach((beacon, i) => {
      const isLit = lit.has(i);
      const target = targets.beacons[i];
      const charging = state.channel?.beacon === i ? state.channel.progress : 0;
      const strength = isLit ? 1 : charging * .7;
      put(lanternCores, beacon.x, world.groundY + 2, beacon.z, isLit ? .18 : .085, undefined, undefined, isLit ? beacon.color : '#736b6b');
      if (!isLit) {
        const pulse = reduced.matches ? 1 : 1 + Math.sin(t * 1.8 + i) * .045;
        put(scanRings, target.x, target.y, target.z, 1.35 * pulse, 1.35 * pulse, 1.35 * pulse, state.charge >= beacon.cost ? '#9cfff0' : '#e6c99b', 'billboard');
        put(scanBeams, target.x, (target.y + world.groundY + 2) / 2, target.z, .025, (target.y - world.groundY - 2) / 2, .025);
      }
      if (strength > 0) {
        const pulse = reduced.matches ? 1 : 1 + Math.sin(t * 2.5 + i) * .06;
        put(lanternGlows, beacon.x, world.groundY + 2, beacon.z, 2.6 * strength * pulse, 2.6 * strength * pulse, 1, beacon.color, 'billboard');
        put(lanternPools, beacon.x, world.groundY + .025, beacon.z, 6 * strength, 6 * strength, 1, beacon.color, [-Math.PI / 2, 0, 0]);
      }
    });
    targets.secrets.forEach((secret, i) => {
      if (secrets.has(i)) return;
      const bob = Math.sin(t * 1.8 + i * 2) * .07;
      put(memoryCrystals, secret.x, secret.y + bob, secret.z, .35, .5, .35, null, [0, t * .7 + i, .25]);
      put(memoryRings, secret.x, secret.y, secret.z, .86, .86, .86, '#dcc5ff', 'billboard');
    });

    const guide = state.guide;
    if (guide && !['ready', 'won'].includes(state.mode)) {
      const dx = guide.x - player.x, dy = guide.y - player.y, dz = guide.z - player.z;
      const length = Math.hypot(dx, dy, dz), amount = Math.min(6, length);
      if (length > 1) for (let i = 0; i < 9; i++) {
        const f = (i + 1) / 10, ratio = amount * f / length;
        put(trailCores, player.x + dx * ratio, player.y + dy * ratio, player.z + dz * ratio, .035 + f * .025);
      }
    }
    const carried = Math.min(8, state.charge || 0);
    for (let i = 0; i < carried; i++) {
      const angle = t * 1.4 + i * Math.PI * 2 / Math.max(1, carried);
      put(moteCores, player.x + Math.cos(angle) * .55, player.y + .45 + Math.sin(angle * 2) * .12, player.z + Math.sin(angle) * .55, .04);
    }
    if (!reduced.matches) for (const effect of state.effects || []) {
      const progress = effect.age / effect.duration;
      const count = effect.type === 'light' ? 18 : effect.type === 'secret' ? 9 : 5;
      for (let i = 0; i < count; i++) {
        const angle = i * Math.PI * 2 / count + effect.id;
        const spread = progress * (effect.type === 'light' ? 2.7 : 1.1);
        put(effectCores, effect.x + Math.cos(angle) * spread,
          (effect.y ?? 6.8) + Math.sin(progress * Math.PI) * (effect.type === 'light' ? 2.5 : 1.1),
          effect.z + Math.sin(angle) * spread, .05 * (1 - progress));
      }
    }
    for (let i = 0; i < 24; i++) {
      const z = -10.5 + ((i * 1.73 + t * .45) % 21.4);
      const x = 2.4 + Math.sin(i * 2.1) * .78;
      put(foam, x, .465, z, .14 + i % 3 * .05, .015, .035);
    }
    for (let i = 0; i < 16; i++) {
      const f = (i / 16 + t * .27) % 1;
      put(foam, 2.4 + Math.sin(i * 3.4) * .8, .4 - f * 4.4, 11.35 + f * .15, .08, .12 + f * .14, .05);
    }
    for (const mesh of dynamicMeshes) {
      mesh.count = counts.get(mesh) || 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    renderer.render(scene, camera);
  }

  function resize() {
    const rect = container.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.round(rect.width)), nextHeight = Math.max(1, Math.round(rect.height));
    if (nextWidth === width && nextHeight === height) return;
    width = nextWidth; height = nextHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, touch ? 1.35 : 1.75,
      Math.sqrt((touch ? 420000 : 1500000) / (width * height))));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    initializedCamera = false;
    resized?.();
  }
  function project(x, z, y = world.groundY) {
    const point = new THREE.Vector3(x, y, z).project(camera);
    return { x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2, visible: point.z >= -1 && point.z <= 1 && Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1 };
  }
  function movement(screenX, screenY) {
    viewRight.setFromMatrixColumn(camera.matrixWorld, 0); viewRight.y = 0; viewRight.normalize();
    camera.getWorldDirection(viewForward); viewForward.y = 0; viewForward.normalize();
    return { x: viewRight.x * screenX - viewForward.x * screenY, z: viewRight.z * screenX - viewForward.z * screenY };
  }
  const onLost = event => { event.preventDefault(); contextLost = true; lost?.(); };
  const onRestored = () => {
    contextLost = false; initializedCamera = false;
    renderer.shadowMap.needsUpdate = true;
    restored?.();
  };
  renderer.domElement.addEventListener('webglcontextlost', onLost);
  renderer.domElement.addEventListener('webglcontextrestored', onRestored);
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  return {
    render, resize, project, movement, renderer, camera, scene, space, ship,
    get state() { return lastState; },
    get assetStats() {
      let meshes = 0, vertices = 0;
      village.traverse(object => { if (object.isMesh) { meshes++; vertices += object.geometry.attributes.position.count; } });
      return { meshes, vertices, authoredAvatar: !!authoredAvatar, spaceship: true };
    },
    dispose() {
      observer.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', onLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onRestored);
      space.dispose();
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      textures.forEach(texture => texture.dispose());
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}
