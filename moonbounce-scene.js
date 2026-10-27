import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ARENA_RADIUS, MAX_MOONS, MAX_ORBITS, MAX_SHOTS, MAX_ENEMIES, MAX_BULLETS, MAX_EFFECTS } from './moonbounce-game.js';

// A tiny, tactile toy planet. Gameplay owns all positions; this renderer only
// decorates them, so resizing and reduced motion cannot change the simulation.
export function createMoonbounceScene(container, { resized, lost, restored } = {}) {
  const touch = matchMedia('(pointer: coarse)').matches;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ antialias: !touch, powerPreference: 'low-power' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f5e2d2');
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 80);
  const light = new THREE.HemisphereLight('#fff7e5', '#8470af', 1.65);
  const sunshine = new THREE.DirectionalLight('#fff6da', 1.45);
  sunshine.position.set(-8, 20, 10);
  scene.add(light, sunshine);

  const geometryCache = new Map(), materialCache = new Map(), ownedGeometry = new Set(), ownedMaterial = new Set(), textures = [];
  function geometry(type) {
    if (!geometryCache.has(type)) {
      const shape = type === 'ball' ? new THREE.SphereGeometry(1, touch ? 10 : 14, touch ? 7 : 10)
        : type === 'cone' ? new THREE.ConeGeometry(1, 1, 6)
        : type === 'box' ? new THREE.BoxGeometry(1, 1, 1)
        : type === 'tube' ? new THREE.CylinderGeometry(1, 1, 1, 10)
        : type === 'diamond' ? new THREE.OctahedronGeometry(1)
        : new THREE.TorusGeometry(1, 0.075, 6, 32);
      geometryCache.set(type, shape);
    }
    return geometryCache.get(type);
  }
  function material(color, basic = false) {
    const key = `${color}:${basic}`;
    if (!materialCache.has(key)) materialCache.set(key, basic
      ? new THREE.MeshBasicMaterial({ color })
      : new THREE.MeshLambertMaterial({ color }));
    return materialCache.get(key);
  }
  function piece(group, type, color, position, scale, rotation, basic = false) {
    const mesh = new THREE.Mesh(geometry(type), material(color, basic));
    mesh.position.set(...position); mesh.scale.set(...scale);
    if (rotation) mesh.rotation.set(...rotation);
    group.add(mesh); return mesh;
  }
  function merge(group) {
    group.updateMatrixWorld(true);
    const buckets = new Map(), model = new THREE.Group();
    group.traverse(mesh => {
      if (!mesh.isMesh) return;
      if (!buckets.has(mesh.material)) buckets.set(mesh.material, []);
      const part = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      buckets.get(mesh.material).push(part.applyMatrix4(mesh.matrixWorld));
    });
    for (const [mat, parts] of buckets) {
      const merged = mergeGeometries(parts, false); parts.forEach(part => part.dispose());
      ownedGeometry.add(merged); model.add(new THREE.Mesh(merged, mat));
    }
    return model;
  }

  // The fat raised edge doubles as the visual boundary for bouncing moons.
  const side = new THREE.Mesh(new THREE.CylinderGeometry(ARENA_RADIUS + 0.12, ARENA_RADIUS - 0.06, 0.56, 64), material('#6656ba'));
  side.position.y = -0.35; scene.add(side); ownedGeometry.add(side.geometry);
  const floorMaterial = material('#78d9c5');
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(ARENA_RADIUS, ARENA_RADIUS, 0.08, 64), floorMaterial);
  floor.position.y = -0.03; scene.add(floor); ownedGeometry.add(floor.geometry);
  const rimGeometry = new THREE.TorusGeometry(ARENA_RADIUS, 0.16, 8, 80).rotateX(Math.PI / 2);
  const rim = new THREE.Mesh(rimGeometry, material('#6654cf')); rim.position.y = 0.05; scene.add(rim); ownedGeometry.add(rimGeometry);

  const rimDetail = new THREE.Group();
  const candy = ['#ff877f', '#ffcb72', '#a592eb', '#f8e7c3'];
  for (let i = 0; i < 32; i++) {
    const a = i * Math.PI / 16, x = Math.sin(a) * ARENA_RADIUS, z = Math.cos(a) * ARENA_RADIUS;
    piece(rimDetail, 'ball', candy[i % 4], [x, 0.17, z], [0.18, 0.10, 0.18]);
  }
  scene.add(merge(rimDetail));

  // Locally drawn icing-like curves add character without a downloaded texture.
  const face = document.createElement('canvas'); face.width = face.height = 1024;
  const ctx = face.getContext('2d'); ctx.translate(512, 512);
  ctx.strokeStyle = '#ffffff65'; ctx.lineWidth = 3;
  for (const r of [144, 260, 374]) { ctx.setLineDash([8, 16]); ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); }
  ctx.setLineDash([]);
  for (let i = 0; i < 27; i++) {
    const angle = i * 2.399963, radius = 110 + (i * 91 % 325), x = Math.sin(angle) * radius, y = Math.cos(angle) * radius;
    const size = i % 5 === 0 ? 10 : 5;
    ctx.fillStyle = i % 3 === 0 ? '#ffe6a888' : i % 3 === 1 ? '#dcceff77' : '#ffffff66';
    ctx.beginPath();
    for (let n = 0; n < 8; n++) {
      const a = n * Math.PI / 4 - Math.PI / 2, r = n % 2 ? size * 0.36 : size;
      if (!n) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = '#fff5cb79'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  for (const [x, y, r, start, end] of [[-300, -240, 50, 0.2, 2.3], [270, 245, 65, 3.4, 5.3], [-260, 260, 42, 4, 6]]) {
    ctx.beginPath(); ctx.arc(x, y, r, start, end); ctx.stroke();
  }
  const faceTexture = new THREE.CanvasTexture(face); faceTexture.colorSpace = THREE.SRGBColorSpace; textures.push(faceTexture);
  const faceMaterial = new THREE.MeshBasicMaterial({ map: faceTexture, transparent: true, depthWrite: false, opacity: 0.72 });
  const faceGeometry = new THREE.PlaneGeometry(ARENA_RADIUS * 2, ARENA_RADIUS * 2).rotateX(-Math.PI / 2);
  const faceMesh = new THREE.Mesh(faceGeometry, faceMaterial); faceMesh.position.y = 0.02; scene.add(faceMesh);
  ownedGeometry.add(faceGeometry); ownedMaterial.add(faceMaterial);

  // A few distant, quieter planets make the playfield feel like a little toy in space.
  const decor = new THREE.Group();
  const planetColors = ['#edada6', '#a6a2df', '#f5c879', '#a6d2ca'];
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI * 2 / 12 + 0.13, distance = 10.3 + (i % 3) * 1.2;
    const x = Math.sin(a) * distance, z = Math.cos(a) * distance;
    const scale = 0.28 + (i % 3) * 0.11;
    piece(decor, 'ball', planetColors[i % 4], [x, -0.8, z], [scale, scale * 0.82, scale]);
    if (i % 3 === 0) piece(decor, 'ring', '#d5a3ba', [x, -0.65, z], [scale * 1.6, scale * 1.6, scale * 1.6], [Math.PI / 2, 0, 0.15]);
  }
  for (let i = 0; i < 80; i++) {
    const angle = i * 2.399963, radius = 9.4 + (i * 11 % 125) / 10;
    const size = i % 6 ? 0.035 : 0.085;
    piece(decor, 'diamond', i % 3 ? '#d8afc4' : '#d3b57f', [Math.cos(angle) * radius, -1, Math.sin(angle) * radius], [size, size, size]);
  }
  scene.add(merge(decor));

  function starGeometry(outer, inner, height) {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? inner : outer;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (!i) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    shape.closePath();
    const result = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.035, bevelSegments: 2, steps: 1, curveSegments: 1 });
    result.rotateX(-Math.PI / 2); ownedGeometry.add(result); return result;
  }
  const player = new THREE.Group();
  const playerOutline = new THREE.Mesh(starGeometry(0.69, 0.36, 0.14), material('#262b62'));
  playerOutline.position.y = 0.22; player.add(playerOutline);
  const playerBody = new THREE.Mesh(starGeometry(0.59, 0.31, 0.10), material('#ffd56b'));
  playerBody.position.y = 0.38; player.add(playerBody);
  for (const x of [-0.16, 0.16]) {
    piece(player, 'ball', '#20254e', [x, 0.53, -0.04], [0.052, 0.035, 0.079]);
    piece(player, 'ball', '#fff9df', [x - 0.016, 0.565, -0.058], [0.016, 0.011, 0.022], null, true);
  }
  const smileGeometry = new THREE.TorusGeometry(0.10, 0.018, 5, 12, Math.PI).rotateZ(Math.PI).rotateX(-Math.PI / 2);
  const smile = new THREE.Mesh(smileGeometry, material('#20254e', true)); smile.position.set(0, 0.54, 0.09); player.add(smile); ownedGeometry.add(smileGeometry);
  for (const x of [-0.28, 0.28]) piece(player, 'ball', '#f99691', [x, 0.52, 0.075], [0.075, 0.025, 0.048]);
  scene.add(player);

  // The orbit guide makes it obvious which candy moons are ready to launch.
  const orbitGeometry = new THREE.RingGeometry(0.98, 1.02, 64).rotateX(-Math.PI / 2);
  const orbitMaterial = new THREE.MeshBasicMaterial({ color: '#fff7d1', transparent: true, opacity: 0.68, side: THREE.DoubleSide, depthWrite: false });
  const orbitGuide = new THREE.Mesh(orbitGeometry, orbitMaterial); orbitGuide.position.y = 0.08; scene.add(orbitGuide);
  ownedGeometry.add(orbitGeometry); ownedMaterial.add(orbitMaterial);

  // All entities use instancing. Materials, geometry and instance buffers are
  // allocated once, even for a full arena of moons and pinballs.
  const batches = new Map(), object = new THREE.Object3D(), transform = new THREE.Matrix4(), tint = new THREE.Color();
  function instance(name, model, capacity, x, y, z, scale = 1, angle = 0, color = '#ffffff', length = 1) {
    let batch = batches.get(name);
    if (!batch) {
      model.updateMatrix();
      batch = { count: 0, capacity, base: model.matrix.clone(), meshes: (model.isMesh ? [model] : model.children).map(part => {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, capacity);
        mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0;
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
        scene.add(mesh); return mesh;
      }) };
      batches.set(name, batch);
    }
    if (batch.count >= capacity) return;
    object.position.set(x, y, z); object.rotation.set(0, angle, 0); object.scale.set(scale, scale, scale * length); object.updateMatrix();
    transform.multiplyMatrices(object.matrix, batch.base); tint.set(color);
    for (const mesh of batch.meshes) { mesh.setMatrixAt(batch.count, transform); mesh.setColorAt(batch.count, tint); }
    batch.count++;
  }
  const shadowGeometry = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: '#1f2853', transparent: true, opacity: 0.13, depthWrite: false });
  const shadowModel = new THREE.Mesh(shadowGeometry, shadowMaterial); ownedGeometry.add(shadowGeometry); ownedMaterial.add(shadowMaterial);

  const moonParts = new THREE.Group();
  piece(moonParts, 'ball', '#42426a', [0, 0, 0], [1, 0.65, 1]);
  piece(moonParts, 'ball', '#ffffff', [0, 0.20, 0], [0.86, 0.55, 0.86]);
  piece(moonParts, 'ball', '#fffef3', [-0.28, 0.71, -0.28], [0.16, 0.035, 0.12], null, true);
  const moonModel = merge(moonParts);
  const trailModel = new THREE.Mesh(geometry('ball'), material('#ffffff', true));
  const moonColors = ['#ffe18a', '#ff9c9c', '#aff3df', '#d3b9ff', '#a9ddff', '#fff2bc'];

  const enemyModels = new Map();
  function enemyModel(type) {
    if (enemyModels.has(type)) return enemyModels.get(type);
    const group = new THREE.Group();
    const color = { drifter: '#ab71d1', dasher: '#f16d7a', shooter: '#8872cf', boss: '#ba71b6' }[type] || '#ab71d1';
    piece(group, 'ball', '#312659', [0, 0, 0], [1, 0.72, 1]);
    piece(group, 'ball', color, [0, 0.18, 0], [0.88, 0.67, 0.88]);
    // Wide eyes and an expressive face read from the camera's overhead angle.
    for (const x of [-0.28, 0.28]) {
      piece(group, 'ball', '#fff8e7', [x, 0.78, -0.06], [0.19, 0.075, 0.22]);
      piece(group, 'ball', '#26254c', [x, 0.85, -0.02], [0.085, 0.035, 0.11]);
      piece(group, 'ball', '#fff8e7', [x - 0.02, 0.88, -0.06], [0.024, 0.012, 0.027], null, true);
    }
    piece(group, 'ball', '#672d60', [0, 0.81, 0.38], [0.14, 0.03, 0.055]);
    if (type === 'dasher') {
      for (const side of [-1, 1]) piece(group, 'cone', '#f48683', [side * 0.72, 0.12, -0.65], [0.33, 0.8, 0.33], [0.7, 0, side * 0.5]);
    } else if (type === 'shooter') {
      piece(group, 'ring', '#ead0fb', [0, 0.16, 0], [1.16, 1.16, 1.16], [Math.PI / 2, 0, 0]);
      piece(group, 'tube', '#4e3779', [0, 0.26, 1.04], [0.27, 0.65, 0.27], [Math.PI / 2, 0, 0]);
      piece(group, 'ball', '#ffb9bf', [0, 0.30, 1.38], [0.21, 0.20, 0.14]);
    } else if (type === 'boss') {
      for (const side of [-1, 1]) piece(group, 'ball', '#e69ebd', [side * 0.95, 0.03, 0.12], [0.43, 0.4, 0.55]);
      for (let i = -1; i <= 1; i++) piece(group, 'diamond', '#ffe39a', [i * 0.32, 0.95 + (i === 0 ? 0.12 : 0), -0.42], [0.19, 0.27, 0.19]);
      piece(group, 'ring', '#ffdc91', [0, 0.31, 0], [1.17, 1.17, 1.17], [Math.PI / 2, 0, 0]);
    } else {
      for (const side of [-1, 1]) piece(group, 'ball', '#d5a0e0', [side * 0.67, 0.10, -0.62], [0.24, 0.26, 0.34]);
    }
    const result = merge(group); enemyModels.set(type, result); return result;
  }
  const bulletParts = new THREE.Group();
  piece(bulletParts, 'ball', '#5c295c', [0, 0, 0], [1, 0.75, 1]);
  piece(bulletParts, 'ball', '#ff767d', [0, 0.20, 0], [0.75, 0.55, 0.75]);
  const bulletModel = merge(bulletParts);
  const sparkleModel = new THREE.Mesh(geometry('diamond'), material('#ffffff', true));
  const pulseGeometry = new THREE.RingGeometry(0.90, 1, 32).rotateX(-Math.PI / 2);
  const pulseMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.68, side: THREE.DoubleSide, depthWrite: false });
  const pulseModel = new THREE.Mesh(pulseGeometry, pulseMaterial); ownedGeometry.add(pulseGeometry); ownedMaterial.add(pulseMaterial);

  const palettes = ['#78d9c5', '#9cdac4', '#a8d3df', '#b7d4c4', '#f0c3b0'];
  const fxColors = { collect: '#fff8d7', burst: '#fff9d4', storm: '#ffdc75', hit: '#ffe5ad', kill: '#ff8f87', hurt: '#ff7d89', chain: '#ffe073', wave: '#dbbcff', upgrade: '#d9b2ff' };
  const pulseTypes = new Set(['burst', 'storm', 'kill', 'chain', 'wave', 'hurt']);
  // A storm can add a second ring and two more sparkles per effect. They use
  // the same bounded batches as ordinary impacts and launches.
  const pulseCapacity = MAX_EFFECTS * 2 + MAX_ENEMIES;
  const sparkleCapacity = MAX_EFFECTS * 6;
  let width = 1, height = 1, currentWave = 0;
  function resize() {
    width = Math.max(1, container.clientWidth); height = Math.max(1, container.clientHeight);
    const aspect = width / height, vertical = Math.max(18.7, 18.7 / aspect);
    Object.assign(camera, { left: -vertical * aspect / 2, right: vertical * aspect / 2, top: vertical / 2, bottom: -vertical / 2 });
    camera.position.set(0, 25, 10.5); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    const density = Math.min(globalThis.devicePixelRatio || 1, touch ? 1.35 : 2, Math.sqrt((touch ? 420000 : 1500000) / (width * height)));
    renderer.setPixelRatio(density); renderer.setSize(width, height, false); resized?.();
  }
  const projection = new THREE.Vector3(), raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), intersection = new THREE.Vector3();
  function project(x, z, y = 0.2) { projection.set(x, y, z).project(camera); return { x: (projection.x + 1) * width / 2, y: (1 - projection.y) * height / 2 }; }
  function pick(clientX, clientY) {
    const rect = container.getBoundingClientRect();
    pointer.set((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.ray.intersectPlane(plane, intersection) ? { x: intersection.x, z: intersection.z } : null;
  }
  function contextLost(event) { event.preventDefault(); lost?.(); }
  function contextRestored() { resize(); restored?.(); }
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  renderer.domElement.addEventListener('webglcontextrestored', contextRestored);
  resize(); const observer = new ResizeObserver(resize); observer.observe(container);

  function render(state, visualTime = 0) {
    const animated = !reduced.matches, p = state.player, wave = Math.max(1, Math.min(5, state.wave || 1));
    if (currentWave !== wave) { currentWave = wave; floorMaterial.color.set(palettes[wave - 1]); }
    for (const batch of batches.values()) batch.count = 0;
    const bob = animated ? Math.sin(visualTime * 3.5) * 0.035 : 0;
    player.position.set(p.x, bob, p.z);
    player.rotation.z = animated ? Math.sin(visualTime * 2.3) * 0.045 : 0;
    player.scale.setScalar(p.invulnerable > 0 && animated ? 1 + Math.sin(visualTime * 28) * 0.06 : 1);
    instance('shadows', shadowModel, 1 + MAX_ENEMIES, p.x, 0.055, p.z, 0.68);

    const orbits = state.orbits || [], loose = state.moons || [], shots = state.shots || [];
    orbitGuide.position.set(p.x, 0.08, p.z);
    // The first ring has a fixed 1.05-unit radius in the simulation. Near the
    // rail the moons are clamped, so fade the guide before its circle would
    // leave the planet rather than shrinking it around just the first moon.
    orbitGuide.scale.setScalar(1.05);
    const clearance = ARENA_RADIUS - Math.hypot(p.x, p.z);
    const visibility = Math.max(0, Math.min(1, (clearance - 1.075) / 0.45));
    orbitGuide.visible = visibility > 0;
    orbitGuide.material.opacity = (orbits.length ? 0.7 : 0.24) * visibility;
    const totalMoons = MAX_MOONS + MAX_ORBITS + MAX_SHOTS;
    for (const moon of loose) {
      const float = animated ? Math.sin(visualTime * 3 + moon.id * 2) * 0.035 : 0;
      instance('moons', moonModel, totalMoons, moon.x, 0.23 + float, moon.z, 0.24, 0, moonColors[moon.id % moonColors.length]);
    }
    for (const moon of orbits) {
      const float = animated ? Math.sin(visualTime * 4 + moon.id) * 0.035 : 0;
      instance('moons', moonModel, totalMoons, moon.x, 0.30 + float, moon.z, 0.29, 0, moonColors[moon.id % moonColors.length]);
    }
    for (const shot of shots) {
      const angle = Math.atan2(shot.dx, shot.dz), color = moonColors[shot.id % moonColors.length];
      const trailColor = shot.storm ? (shot.id % 2 ? '#ffb7cf' : '#ffe8a3') : color;
      if (animated) instance('trails', trailModel, MAX_SHOTS, shot.x - Math.sin(angle) * 0.30, 0.2, shot.z - Math.cos(angle) * 0.30, shot.storm ? 0.15 : 0.12, angle, trailColor, shot.storm ? 4.1 : 3.4);
      instance('moons', moonModel, totalMoons, shot.x, 0.31, shot.z, shot.storm ? 0.34 : 0.29, 0, color);
    }
    for (const enemy of state.enemies || []) {
      const scale = enemy.radius * 1.13, float = animated ? Math.sin(enemy.age * 5 + enemy.id) * 0.04 : 0;
      instance('shadows', shadowModel, 1 + MAX_ENEMIES, enemy.x, 0.052, enemy.z, scale * 1.12);
      const direction = enemy.type === 'shooter' && Number.isFinite(enemy.angle) ? enemy.angle : 0;
      instance(`enemy:${enemy.type}`, enemyModel(enemy.type), MAX_ENEMIES, enemy.x, scale * 0.68 + float, enemy.z, scale, direction);
      if (enemy.hit > 0) instance('pulses', pulseModel, pulseCapacity, enemy.x, 0.09, enemy.z, scale * 1.55, 0, '#fff1ca');
    }
    for (const bullet of state.bullets || []) instance('bullets', bulletModel, MAX_BULLETS, bullet.x, 0.20, bullet.z, 0.19);
    for (const fx of state.effects || []) {
      const t = Math.max(0, Math.min(1, fx.age / (fx.duration || 0.6))), color = fxColors[fx.type] || '#fff6cf';
      if (pulseTypes.has(fx.type)) {
        const radius = animated ? (0.35 + t * (fx.type === 'storm' ? 3.8 : fx.type === 'burst' ? 2.7 : 1.3)) : fx.type === 'storm' ? 1.25 : 0.85;
        instance('pulses', pulseModel, pulseCapacity, fx.x, 0.10, fx.z, radius, 0, color);
        if (fx.type === 'storm') {
          const inner = animated ? 0.22 + t * 2.4 : 0.8;
          instance('pulses', pulseModel, pulseCapacity, fx.x, 0.11, fx.z, inner, 0, '#ff91ad');
        }
      }
      const sparkCount = fx.type === 'storm' ? 6 : fx.type === 'collect' ? 2 : 4;
      for (let i = 0; i < sparkCount; i++) {
        const angle = fx.id * 2.399963 + i * Math.PI * 2 / sparkCount, distance = animated ? 0.15 + t * (fx.type === 'storm' ? 1.9 : 1.2) : 0.35;
        const y = animated ? 0.32 + Math.sin(t * Math.PI) * 0.5 : 0.45;
        const sparkColor = fx.type === 'storm' && i % 2 ? '#ff91ad' : color;
        const size = (fx.type === 'storm' ? 0.15 : 0.11) * (animated ? 1 - t : 0.8);
        instance('sparks', sparkleModel, sparkleCapacity, fx.x + Math.sin(angle) * distance, y, fx.z + Math.cos(angle) * distance, size, angle, sparkColor);
      }
    }
    for (const batch of batches.values()) for (const mesh of batch.meshes) {
      mesh.count = batch.count; mesh.visible = batch.count > 0;
      if (batch.count) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
    }
    if (!renderer.getContext().isContextLost()) renderer.render(scene, camera);
  }
  function dispose() {
    observer.disconnect();
    renderer.domElement.removeEventListener('webglcontextlost', contextLost);
    renderer.domElement.removeEventListener('webglcontextrestored', contextRestored);
    for (const batch of batches.values()) for (const mesh of batch.meshes) mesh.dispose();
    for (const geo of [...geometryCache.values(), ...ownedGeometry]) geo.dispose();
    for (const mat of [...materialCache.values(), ...ownedMaterial]) mat.dispose();
    textures.forEach(texture => texture.dispose()); renderer.dispose();
  }
  return { render, resize, project, pick, renderer, camera, dispose };
}
