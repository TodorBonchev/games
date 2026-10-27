import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// The village is authored in Blender. Only the keeper's movement, light,
// water, and collectible effects are animated here.
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
  renderer.setClearColor('#c3cedf');
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#c3cedf');
  scene.fog = new THREE.Fog('#c3cedf', 65, 155);
  const camera = new THREE.PerspectiveCamera(43, 1, .15, 200);
  const sky = new THREE.HemisphereLight('#fff0db', '#607b9d', 1.95);
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
  const rimLight = new THREE.DirectionalLight('#b5d4ff', .9);
  rimLight.position.set(12, 15, -20);
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
    color: '#bdeaff', emissive: '#608dce', emissiveIntensity: .6,
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
  const foamMaterial = basic('#e4f8ef', { transparent: true, opacity: .6, depthWrite: false });
  const foam = makeInstances(sphere, foamMaterial, 42);
  const transform = new THREE.Object3D();
  const tint = new THREE.Color();
  const facingCamera = new THREE.Quaternion();
  const counts = new Map();
  const dynamicMeshes = [moteCores, moteGlows, trailCores, memoryCrystals, memoryRings,
    effectCores, lanternGlows, lanternCores, lanternPools, foam];

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

  // A quiet sea and scattered clouds frame the island without extra lights or
  // post-processing. The main terrain, houses, trees and river remain the GLB.
  const sea = new THREE.Mesh(registerGeometry(new THREE.PlaneGeometry(240, 240)),
    registerMaterial(new THREE.MeshStandardMaterial({ color: '#799fbd', roughness: .82, metalness: .08 })));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -4.1;
  scene.add(sea);
  const cloudMaterial = basic('#e1e6ee', { transparent: true, opacity: .61, depthWrite: false });
  const clouds = makeInstances(sphere, cloudMaterial, 35);
  counts.set(clouds, 0);
  for (let i = 0; i < 7; i++) {
    const angle = i * 2.399963, radius = 25 + (i % 3) * 7;
    for (let j = 0; j < 5; j++) put(clouds,
      Math.cos(angle) * radius + j * 1.4, -1.8 - i % 3 * .3,
      Math.sin(angle) * radius, 2.6 - Math.abs(j - 2) * .3, .7, 1.4);
  }
  clouds.count = counts.get(clouds);
  clouds.instanceMatrix.needsUpdate = true;
  counts.clear();

  let asset;
  try {
    asset = await new GLTFLoader().loadAsync(new URL('./assets/lantern-vale.glb', import.meta.url).href,
      event => { if (event.lengthComputable && event.total > 0) progress?.(event.loaded / event.total); });
  } catch (error) {
    renderer.dispose();
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

  const keeper = new THREE.Group();
  keeper.name = 'KeeperMotion';
  keeper.scale.setScalar(1.18);
  const authoredAvatar = village.getObjectByName('Avatar');
  if (authoredAvatar) {
    authoredAvatar.removeFromParent();
    authoredAvatar.position.set(0, 0, 0);
    keeper.add(authoredAvatar);
  } else {
    // Authoring fallback only for the keeper; the village always comes from Blender.
    const coat = registerMaterial(new THREE.MeshStandardMaterial({ color: '#df976c', roughness: .75 }));
    const skin = registerMaterial(new THREE.MeshStandardMaterial({ color: '#f6d3aa', roughness: .8 }));
    const body = new THREE.Mesh(registerGeometry(new THREE.CapsuleGeometry(.25, .35, 3, 8)), coat);
    body.position.y = .57;
    keeper.add(body);
    const head = new THREE.Mesh(sphere, skin);
    head.scale.setScalar(.22); head.position.y = 1.1; keeper.add(head);
    const hat = new THREE.Mesh(registerGeometry(new THREE.ConeGeometry(.37, .34, 8)), coat);
    hat.position.y = 1.35; keeper.add(hat);
  }
  scene.add(keeper);
  const legL = keeper.getObjectByName('AvatarLegL'), legR = keeper.getObjectByName('AvatarLegR');
  const legs = [legL, legR].filter(Boolean).map((object, index) => ({ object, base: object.quaternion.clone(), sign: index ? -1 : 1 }));
  const windmill = village.getObjectByName('WindmillRotor');
  const rotorBase = windmill?.quaternion.clone();
  const rotorTurn = new THREE.Quaternion();
  const spinAxis = new THREE.Vector3(0, 0, 1), legAxis = new THREE.Vector3(1, 0, 0);

  const keeperShadow = new THREE.Mesh(plane, basic('#273c51', {
    map: glowTexture, transparent: true, opacity: .48, depthWrite: false,
  }));
  keeperShadow.rotation.x = -Math.PI / 2;
  keeperShadow.scale.set(1.3, 1.05, 1);
  scene.add(keeperShadow);
  const keeperRing = new THREE.Mesh(ringGeometry, basic('#ffe8a8', {
    transparent: true, opacity: .74, depthWrite: false, toneMapped: false,
  }));
  keeperRing.rotation.x = -Math.PI / 2;
  keeperRing.scale.setScalar(.44);
  scene.add(keeperRing);
  const compass = new THREE.Group();
  const compassCenter = new THREE.Mesh(sphere, paleGold);
  compassCenter.scale.set(.10, .10, .16); compass.add(compassCenter);
  const wings = [];
  for (const sign of [-1, 1]) {
    const wing = new THREE.Mesh(sphere, basic('#caffef', { transparent: true, opacity: .8, toneMapped: false }));
    wing.position.x = sign * .14; wing.scale.set(.19, .025, .10);
    wings.push({ wing, sign }); compass.add(wing);
  }
  scene.add(compass);

  let width = 0, height = 0, initializedCamera = false, lastTime = null;
  let lastState = null, contextLost = false, cameraMode = null;
  const focus = new THREE.Vector3();
  const desiredFocus = new THREE.Vector3();
  const cameraDirection = new THREE.Vector3(.47, .79, .59).normalize();
  const overviewDirection = new THREE.Vector3(.5, .48, .7).normalize();
  const viewRight = new THREE.Vector3(), viewForward = new THREE.Vector3();
  const cameraDestination = new THREE.Vector3();
  const animationTime = state => reduced.matches ? 0 : (state.ticks || 0) / 60;

  function updateCamera(state, time) {
    const overview = state.mode === 'ready' || state.mode === 'won';
    // Results are rendered once, so their composed view must not depend on a
    // camera animation that would otherwise stop behind the dialog.
    if (overview && cameraMode !== state.mode) initializedCamera = false;
    cameraMode = state.mode;
    const aspect = width / height;
    const player = state.player || world.spawn;
    // Near the coast, keep a little more land in view without moving the
    // keeper far from the middle of the phone screen.
    desiredFocus.set(overview ? 0 : player.x * .88, overview ? -.9 : .75, overview ? -.5 : player.z * .88);
    const span = overview ? Math.max(34, 42 / aspect) : aspect < 1 ? 22 : 16.8;
    const distance = span / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * .5)));
    const elapsed = lastTime === null ? 1 : Math.min(.1, Math.max(0, time - lastTime));
    const blend = reduced.matches || !initializedCamera ? 1 : 1 - Math.exp(-elapsed * 6);
    focus.lerp(desiredFocus, blend);
    cameraDestination.copy(focus).addScaledVector(overview ? overviewDirection : cameraDirection, distance);
    camera.position.lerp(cameraDestination, blend);
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
    const t = animationTime(state), moving = state.player?.moving && !reduced.matches;
    const player = state.player || world.spawn;
    const lit = new Set(state.lit || []), collected = new Set(state.collected || []), secrets = new Set(state.secrets || []);
    sky.intensity = 1.8 + lit.size * .045;
    sun.intensity = 2.25 + lit.size * .04;
    for (const material of windowMaterials) material.emissiveIntensity = .25 + lit.size * .15;
    keeper.position.set(player.x, world.groundY + (moving ? Math.abs(Math.sin(t * 11)) * .035 : 0), player.z);
    keeper.rotation.y = player.heading || 0;
    for (const leg of legs) {
      rotorTurn.setFromAxisAngle(legAxis, moving ? Math.sin(t * 11) * .4 * leg.sign : 0);
      leg.object.quaternion.copy(leg.base).multiply(rotorTurn);
    }
    keeperShadow.position.set(player.x, world.groundY + .015, player.z);
    keeperRing.position.set(player.x, world.groundY + .09, player.z);
    if (windmill) {
      rotorTurn.setFromAxisAngle(spinAxis, reduced.matches ? 0 : t * .3);
      windmill.quaternion.copy(rotorBase).multiply(rotorTurn);
    }

    counts.clear();
    for (let i = 0; i < world.motes.length; i++) {
      if (collected.has(i)) continue;
      const [x, z] = world.motes[i];
      const bob = Math.sin(t * 2.1 + i * 1.7) * .1;
      put(moteCores, x, world.groundY + .72 + bob, z, .09);
      put(moteGlows, x, world.groundY + .72 + bob, z, .9, .9, 1, null, 'billboard');
      for (let n = 0; n < 2; n++) {
        const a = t * 1.5 + i + n * Math.PI;
        put(moteCores, x + Math.cos(a) * .18, world.groundY + .67 + bob + n * .1, z + Math.sin(a) * .15, .025);
      }
    }
    world.beacons.forEach((beacon, i) => {
      const isLit = lit.has(i);
      const charging = state.channel?.beacon === i ? state.channel.progress : 0;
      const strength = isLit ? 1 : charging * .7;
      put(lanternCores, beacon.x, world.groundY + 2, beacon.z, isLit ? .18 : .085, undefined, undefined, isLit ? beacon.color : '#736b6b');
      if (strength > 0) {
        const pulse = reduced.matches ? 1 : 1 + Math.sin(t * 2.5 + i) * .06;
        put(lanternGlows, beacon.x, world.groundY + 2, beacon.z, 2.6 * strength * pulse, 2.6 * strength * pulse, 1, beacon.color, 'billboard');
        put(lanternPools, beacon.x, world.groundY + .025, beacon.z, 6 * strength, 6 * strength, 1, beacon.color, [-Math.PI / 2, 0, 0]);
      }
    });
    world.secrets.forEach((secret, i) => {
      if (secrets.has(i)) return;
      const bob = Math.sin(t * 1.8 + i * 2) * .07;
      put(memoryCrystals, secret.x, world.groundY + .72 + bob, secret.z, .22, .32, .22, null, [0, t * .7 + i, .25]);
      put(memoryRings, secret.x, world.groundY + .43, secret.z, .43, .43, .43, null, [-Math.PI / 2, 0, 0]);
    });

    const guide = state.guide;
    compass.visible = !!guide && !['ready', 'won'].includes(state.mode);
    if (compass.visible) {
      const dx = guide.x - player.x, dz = guide.z - player.z;
      const length = Math.hypot(dx, dz), amount = Math.min(2, length * .65);
      const nx = length > .001 ? dx / length : 0, nz = length > .001 ? dz / length : 1;
      compass.position.set(player.x + nx * amount, world.groundY + 1.15 + Math.sin(t * 3) * .08, player.z + nz * amount);
      compass.rotation.y = Math.atan2(nx, nz);
      for (const { wing, sign } of wings) wing.rotation.z = reduced.matches ? sign * .2 : Math.sin(t * 18) * .7 * sign;
      for (let i = 0; i < 6; i++) {
        const f = (i + 1) / 7, d = amount * f;
        put(trailCores, player.x + nx * d, world.groundY + .14 + Math.sin(t * 3 + i) * .035, player.z + nz * d, .025 + f * .018);
      }
    }
    const carried = Math.min(8, state.charge || 0);
    for (let i = 0; i < carried; i++) {
      const angle = t * 1.4 + i * Math.PI * 2 / Math.max(1, carried);
      put(moteCores, player.x + Math.cos(angle) * .55, world.groundY + .9 + Math.sin(angle * 2) * .12, player.z + Math.sin(angle) * .55, .04);
    }
    if (!reduced.matches) for (const effect of state.effects || []) {
      const progress = effect.age / effect.duration;
      const count = effect.type === 'light' ? 18 : effect.type === 'secret' ? 9 : 5;
      for (let i = 0; i < count; i++) {
        const angle = i * Math.PI * 2 / count + effect.id;
        const spread = progress * (effect.type === 'light' ? 2.7 : 1.1);
        put(effectCores, effect.x + Math.cos(angle) * spread,
          world.groundY + .4 + Math.sin(progress * Math.PI) * (effect.type === 'light' ? 2.5 : 1.1),
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
    render, resize, project, movement, renderer, camera, scene,
    get state() { return lastState; },
    get assetStats() {
      let meshes = 0, vertices = 0;
      village.traverse(object => { if (object.isMesh) { meshes++; vertices += object.geometry.attributes.position.count; } });
      return { meshes, vertices, authoredAvatar: !!authoredAvatar };
    },
    dispose() {
      observer.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', onLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onRestored);
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      textures.forEach(texture => texture.dispose());
      renderer.dispose(); renderer.domElement.remove();
    },
  };
}
