import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GRID_SIZE, LEVELS } from './popwake-game.js';

// Popwake is laid out in grid cells by the simulation. The scene only draws
// those cells, so resize, reduced motion and WebGL recovery leave play intact.
export function createPopwakeScene(container, { resized, lost, restored } = {}) {
  const touch = matchMedia('(pointer: coarse)').matches;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ antialias: !touch, powerPreference: 'low-power' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f2d6af');
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 80);
  scene.add(new THREE.HemisphereLight('#fff7e4', '#9cacc0', 1.45));
  const sun = new THREE.DirectionalLight('#fff5d9', 1.25);
  sun.position.set(-6, 18, 9); scene.add(sun);

  const geometryCache = new Map(), materialCache = new Map(), ownedGeometry = new Set(), ownedMaterial = new Set();
  const half = (GRID_SIZE - 1) / 2;
  const MAX_CELLS = GRID_SIZE * GRID_SIZE;
  const MAX_TRAIL = 128;
  const MAX_EFFECTS = 100;
  function geometry(type) {
    if (!geometryCache.has(type)) {
      const shape = type === 'ball' ? new THREE.SphereGeometry(1, touch ? 10 : 14, touch ? 7 : 10)
        : type === 'box' ? new THREE.BoxGeometry(1, 1, 1)
        : type === 'cone' ? new THREE.ConeGeometry(1, 1, 6)
        : type === 'tube' ? new THREE.CylinderGeometry(1, 1, 1, 8)
        : type === 'diamond' ? new THREE.OctahedronGeometry(1)
        : new THREE.TorusGeometry(1, 0.07, 5, 28);
      geometryCache.set(type, shape);
    }
    return geometryCache.get(type);
  }
  function material(color, basic = false) {
    const key = `${color}:${basic}`;
    if (!materialCache.has(key)) materialCache.set(key, basic ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color }));
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

  // A thick glazed tray on a warm tabletop. A little offset shadow gives it
  // depth without a dynamic shadow map on phones.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(70, 70).rotateX(-Math.PI / 2), material('#f4d6aa', true));
  ground.position.y = -0.77; scene.add(ground); ownedGeometry.add(ground.geometry);
  const shadow = new THREE.Mesh(new THREE.BoxGeometry(GRID_SIZE + 1.1, 0.05, GRID_SIZE + 1.1), material('#d5ad87', true));
  shadow.position.set(0.13, -0.72, 0.24); scene.add(shadow); ownedGeometry.add(shadow.geometry);
  const tray = new THREE.Group();
  piece(tray, 'box', '#294d81', [0, -0.34, 0], [GRID_SIZE + 0.82, 0.52, GRID_SIZE + 0.82]);
  piece(tray, 'box', '#fff4dc', [0, -0.06, 0], [GRID_SIZE + 0.67, 0.22, GRID_SIZE + 0.67]);
  for (const side of [-1, 1]) {
    piece(tray, 'box', '#355f91', [side * (half + 0.64), 0.06, 0], [0.16, 0.16, GRID_SIZE + 0.40]);
    piece(tray, 'box', '#355f91', [0, 0.06, side * (half + 0.64)], [GRID_SIZE + 0.40, 0.16, 0.16]);
    for (const other of [-1, 1]) piece(tray, 'ball', '#ffcc72', [side * (half + 0.64), 0.15, other * (half + 0.64)], [0.11, 0.055, 0.11]);
  }
  scene.add(merge(tray));

  const tileGeometry = new THREE.BoxGeometry(0.93, 0.075, 0.93);
  const tileMaterial = material('#ffffff');
  const tiles = new THREE.InstancedMesh(tileGeometry, tileMaterial, MAX_CELLS);
  tiles.frustumCulled = false; tiles.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  tiles.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CELLS * 3).fill(1), 3);
  tiles.instanceColor.setUsage(THREE.DynamicDrawUsage);
  const temp = new THREE.Object3D(), tint = new THREE.Color();
  for (let z = 0; z < GRID_SIZE; z++) for (let x = 0; x < GRID_SIZE; x++) {
    const index = z * GRID_SIZE + x;
    temp.position.set(x - half, 0.02, z - half); temp.updateMatrix(); tiles.setMatrixAt(index, temp.matrix);
    tiles.setColorAt(index, tint.set((x + z) % 2 ? '#f9e9ce' : '#fff0d8'));
  }
  tiles.instanceMatrix.needsUpdate = true; tiles.instanceColor.needsUpdate = true;
  scene.add(tiles); ownedGeometry.add(tileGeometry);

  // A few quiet stationery and garden shapes sit outside the play area. They
  // stay decorative and never intercept drawing on a board cell.
  const decor = new THREE.Group();
  const sprigColors = ['#76a790', '#9bb48b', '#e68b68'];
  for (let i = 0; i < 9; i++) {
    const angle = i * 2.399963, radius = 5.0 + (i % 3) * 0.68;
    const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
    if (Math.abs(x) < half + 1.12 && Math.abs(z) < half + 1.12) continue;
    const color = sprigColors[i % sprigColors.length];
    piece(decor, 'tube', '#76917f', [x, -0.57, z], [0.035, 0.64, 0.035], [Math.PI / 2, angle, 0.25]);
    for (const side of [-1, 1]) piece(decor, 'ball', color, [x + side * 0.17, -0.51, z + side * 0.08], [0.22, 0.07, 0.10], [0, side * 0.55 + angle, 0]);
    piece(decor, 'ball', '#ffd16d', [x, -0.47, z - 0.23], [0.12, 0.07, 0.12]);
  }
  // Colorful paper tabs and tiny cross-shaped sparkles frame the tray.
  for (let i = 0; i < 30; i++) {
    const angle = i * 2.399963, radius = 4.8 + (i * 17 % 45) / 10;
    const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
    if (Math.abs(x) < half + 1.0 && Math.abs(z) < half + 1.0) continue;
    const size = i % 4 === 0 ? 0.10 : 0.055, color = i % 3 === 0 ? '#ee9f75' : i % 3 === 1 ? '#97aeb3' : '#e8bc66';
    piece(decor, 'box', color, [x, -0.62, z], [size * 0.35, 0.025, size * 1.6]);
    piece(decor, 'box', color, [x, -0.62, z], [size * 1.6, 0.025, size * 0.35]);
  }
  piece(decor, 'tube', '#ec9a6e', [5.2, -0.55, -3.3], [0.25, 1.65, 0.25], [Math.PI / 2, 0, -0.45]);
  piece(decor, 'cone', '#fff1d6', [5.55, -0.55, -2.55], [0.26, 0.40, 0.26], [Math.PI / 2, 0, -0.45]);
  scene.add(merge(decor));

  // All moving pieces share instance buffers. Their base geometry is baked
  // once by material; subsequent frames only update transforms and colors.
  const batches = new Map(), object = new THREE.Object3D(), matrix = new THREE.Matrix4();
  function instance(name, model, capacity, x, y, z, scale = 1, angle = 0, color = '#ffffff', brightness = 1, tilt = 0) {
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
    object.position.set(x, y, z); object.rotation.set(tilt, angle, 0, 'YXZ'); object.scale.setScalar(scale); object.updateMatrix();
    matrix.multiplyMatrices(object.matrix, batch.base); tint.set(color).multiplyScalar(brightness);
    for (const mesh of batch.meshes) { mesh.setMatrixAt(batch.count, matrix); mesh.setColorAt(batch.count, tint); }
    batch.count++;
  }
  const shadowGeometry = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: '#4c536c', transparent: true, opacity: 0.15, depthWrite: false });
  const shadowModel = new THREE.Mesh(shadowGeometry, shadowMaterial);
  ownedGeometry.add(shadowGeometry); ownedMaterial.add(shadowMaterial);

  const jellyParts = new THREE.Group();
  piece(jellyParts, 'ball', '#3b3856', [0, 0.23, 0], [0.39, 0.26, 0.39]);
  piece(jellyParts, 'ball', '#ffffff', [0, 0.30, 0], [0.34, 0.25, 0.34]);
  piece(jellyParts, 'ball', '#fff9ec', [-0.16, 0.53, -0.16], [0.095, 0.03, 0.07], null, true);
  const jellyModel = merge(jellyParts);
  const sleepyParts = new THREE.Group();
  for (const x of [-0.13, 0.13]) piece(sleepyParts, 'box', '#252d49', [x, 0.553, -0.01], [0.10, 0.025, 0.026], [0, x * -0.7, 0], true);
  piece(sleepyParts, 'ball', '#7d3852', [0, 0.56, 0.14], [0.055, 0.016, 0.026], null, true);
  const sleepyFace = merge(sleepyParts);
  const awakeParts = new THREE.Group();
  for (const x of [-0.13, 0.13]) {
    piece(awakeParts, 'ball', '#fff9ea', [x, 0.56, -0.035], [0.091, 0.035, 0.11], null, true);
    piece(awakeParts, 'ball', '#24304d', [x, 0.598, -0.02], [0.042, 0.020, 0.057], null, true);
    piece(awakeParts, 'ball', '#ffffff', [x - 0.012, 0.617, -0.04], [0.014, 0.008, 0.018], null, true);
  }
  for (const x of [-0.25, 0.25]) piece(awakeParts, 'ball', '#ffa39c', [x, 0.55, 0.09], [0.065, 0.024, 0.038], null, true);
  const mouthGeometry = new THREE.TorusGeometry(0.075, 0.014, 5, 12, Math.PI).rotateZ(Math.PI).rotateX(-Math.PI / 2);
  const mouth = new THREE.Mesh(mouthGeometry, material('#26304d', true)); mouth.position.set(0, 0.58, 0.10); awakeParts.add(mouth); ownedGeometry.add(mouthGeometry);
  const awakeFace = merge(awakeParts);
  const crownParts = new THREE.Group();
  for (const x of [-0.20, 0.20]) {
    piece(crownParts, 'tube', '#795c41', [x, 0.42, -0.24], [0.022, 0.28, 0.022]);
    piece(crownParts, 'ball', '#fff2a5', [x, 0.59, -0.24], [0.075, 0.075, 0.075], null, true);
  }
  const relayCrown = merge(crownParts);

  const rockParts = new THREE.Group();
  piece(rockParts, 'diamond', '#294a74', [0, 0.20, 0], [0.43, 0.42, 0.43], [0, 0.4, 0]);
  piece(rockParts, 'diamond', '#5c7994', [-0.08, 0.33, -0.04], [0.30, 0.28, 0.30], [0, 0.25, 0]);
  for (const angle of [-Math.PI / 4, Math.PI / 4]) piece(rockParts, 'box', '#ffe7c8', [0, 0.60, 0], [0.29, 0.018, 0.044], [0, angle, 0], true);
  const rockModel = merge(rockParts);
  const dominoParts = new THREE.Group();
  piece(dominoParts, 'box', '#354d75', [0, 0.22, 0], [0.36, 0.43, 0.29]);
  piece(dominoParts, 'box', '#ffffff', [0, 0.26, 0], [0.28, 0.38, 0.23]);
  for (const z of [-0.067, 0.067]) piece(dominoParts, 'ball', '#ffffff', [0, 0.47, z], [0.038, 0.018, 0.038], null, true);
  const dominoModel = merge(dominoParts);
  const starterParts = new THREE.Group();
  piece(starterParts, 'ball', '#244475', [0, 0.12, 0], [0.22, 0.11, 0.22]);
  piece(starterParts, 'ball', '#4c91ec', [0, 0.19, 0], [0.17, 0.10, 0.17]);
  piece(starterParts, 'ball', '#ffffff', [-0.045, 0.29, -0.045], [0.045, 0.014, 0.045], null, true);
  const starterModel = merge(starterParts);

  const lineGeometry = new THREE.CylinderGeometry(0.052, 0.052, 1, 8);
  const lineModel = new THREE.Mesh(lineGeometry, material('#ffffff', true)); ownedGeometry.add(lineGeometry);
  const hintGeometry = new THREE.CylinderGeometry(0.035, 0.035, 1, 6);
  const hintMaterial = new THREE.MeshBasicMaterial({ color: '#45a49c', transparent: true, opacity: 0.68, depthWrite: false });
  const hintModel = new THREE.Mesh(hintGeometry, hintMaterial); ownedGeometry.add(hintGeometry); ownedMaterial.add(hintMaterial);
  const up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  function segment(name, model, capacity, x1, z1, x2, z2, y, color = '#ffffff') {
    const dx = x2 - x1, dz = z2 - z1, length = Math.hypot(dx, dz);
    if (length < 0.001) return;
    let batch = batches.get(name);
    if (!batch) {
      model.updateMatrix();
      const mesh = new THREE.InstancedMesh(model.geometry, model.material, capacity);
      mesh.frustumCulled = false; mesh.count = 0; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3); scene.add(mesh);
      batch = { count: 0, capacity, base: model.matrix.clone(), meshes: [mesh] }; batches.set(name, batch);
    }
    if (batch.count >= capacity) return;
    object.position.set((x1 + x2) / 2, y, (z1 + z2) / 2); object.quaternion.setFromUnitVectors(up, direction.set(dx / length, 0, dz / length));
    object.scale.set(1, length, 1); object.updateMatrix(); matrix.multiplyMatrices(object.matrix, batch.base);
    tint.set(color); const mesh = batch.meshes[0]; mesh.setMatrixAt(batch.count, matrix); mesh.setColorAt(batch.count, tint); batch.count++;
  }
  const haloGeometry = new THREE.RingGeometry(0.33, 0.39, 32).rotateX(-Math.PI / 2);
  const haloMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
  const haloModel = new THREE.Mesh(haloGeometry, haloMaterial); ownedGeometry.add(haloGeometry); ownedMaterial.add(haloMaterial);
  const sparkModel = new THREE.Mesh(geometry('diamond'), material('#ffffff', true));
  const waveGeometry = new THREE.RingGeometry(0.96, 1.04, 48).rotateX(-Math.PI / 2);
  const waveMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false });
  const waveModel = new THREE.Mesh(waveGeometry, waveMaterial); ownedGeometry.add(waveGeometry); ownedMaterial.add(waveMaterial);

  let width = 0, height = 0, pixelRatio = 0;
  const projection = new THREE.Vector3(), raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.065), intersection = new THREE.Vector3();
  function resize(force = false) {
    const nextWidth = Math.max(1, container.clientWidth), nextHeight = Math.max(1, container.clientHeight);
    const density = Math.min(globalThis.devicePixelRatio || 1, touch ? 1.35 : 2, Math.sqrt((touch ? 420000 : 1500000) / (nextWidth * nextHeight)));
    // ResizeObserver also reports fractional layout changes that leave the
    // canvas dimensions unchanged. Do not cancel a finger stroke for those.
    if (!force && width === nextWidth && height === nextHeight && Math.abs(pixelRatio - density) < 0.0001) return;
    width = nextWidth; height = nextHeight; pixelRatio = density;
    const aspect = width / height, vertical = Math.max(9.2, 8.8 / aspect);
    Object.assign(camera, { left: -vertical * aspect / 2, right: vertical * aspect / 2, top: vertical / 2, bottom: -vertical / 2 });
    camera.position.set(0, 25, 11); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    renderer.setPixelRatio(density); renderer.setSize(width, height, false); resized?.();
  }
  function project(cellOrX, z, y = 0.065) {
    const x = typeof cellOrX === 'object' ? cellOrX.x : cellOrX;
    const row = typeof cellOrX === 'object' ? cellOrX.z : z;
    projection.set(x - half, y, row - half).project(camera);
    return { x: (projection.x + 1) * width / 2, y: (1 - projection.y) * height / 2 };
  }
  function pick(clientX, clientY) {
    const rect = container.getBoundingClientRect();
    pointer.set((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2);
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(plane, intersection)) return null;
    const x = intersection.x + half, z = intersection.z + half;
    if (x < -0.62 || x > GRID_SIZE - 0.38 || z < -0.62 || z > GRID_SIZE - 0.38) return null;
    return { x: Math.max(0, Math.min(GRID_SIZE - 1, Math.round(x))), z: Math.max(0, Math.min(GRID_SIZE - 1, Math.round(z))) };
  }
  function contextLost(event) { event.preventDefault(); lost?.(); }
  function contextRestored() { resize(true); restored?.(); }
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  renderer.domElement.addEventListener('webglcontextrestored', contextRestored);
  resize(); const observer = new ResizeObserver(() => resize()); observer.observe(container);

  const markedCells = new Uint8Array(MAX_CELLS);
  function render(state, visualTime = 0) {
    const animated = !reduced.matches, level = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, (state.level || 1) - 1))];
    const path = state.trail || [], jellies = state.jellies || [], effects = state.effects || [], tick = state.ticks || 0;
    for (const batch of batches.values()) batch.count = 0;
    markedCells.fill(0);
    for (const cell of path) if (cell.x >= 0 && cell.x < GRID_SIZE && cell.z >= 0 && cell.z < GRID_SIZE) markedCells[cell.z * GRID_SIZE + cell.x] = 1;
    markedCells[level.start.z * GRID_SIZE + level.start.x] = 2;
    for (let z = 0; z < GRID_SIZE; z++) for (let x = 0; x < GRID_SIZE; x++) {
      const index = z * GRID_SIZE + x, marker = markedCells[index];
      const color = marker === 2 ? '#ffdfa3' : marker === 1 ? '#ffe6cf' : (x + z) % 2 ? '#f9e9ce' : '#fff0d8';
      tiles.setColorAt(index, tint.set(color));
    }
    tiles.instanceColor.needsUpdate = true;

    for (const rock of level.rocks) {
      const x = rock.x - half, z = rock.z - half;
      instance('shadows', shadowModel, MAX_CELLS * 2, x, 0.065, z, 0.45);
      instance('rocks', rockModel, MAX_CELLS, x, 0.06, z);
    }

    // The pale dashed route is displayed only while the requested hint is up.
    if (state.hintVisible && ['playing', 'drawing', 'paused'].includes(state.mode)) {
      const solution = level.solution || [];
      for (let i = 1; i < solution.length && i < MAX_TRAIL; i++) {
        const a = solution[i - 1], b = solution[i], dx = b.x - a.x, dz = b.z - a.z;
        for (let dash = 0; dash < 3; dash++) {
          const from = (dash * 2 + 0.15) / 6, to = (dash * 2 + 1.05) / 6;
          segment('hints', hintModel, MAX_TRAIL * 3, a.x - half + dx * from, a.z - half + dz * from, a.x - half + dx * to, a.z - half + dz * to, 0.125, '#ffffff');
        }
      }
    }
    // A player can retrace an existing segment for free and then branch.
    // Trail entries represent unique occupied cells, not traversal order, so
    // draw the actual adjacent-cell graph rather than joining insertion order.
    for (let i = 0; i < path.length && i < MAX_TRAIL; i++) for (let j = i + 1; j < path.length && j < MAX_TRAIL; j++) {
      const a = path[i], b = path[j];
      if (Math.abs(a.x - b.x) + Math.abs(a.z - b.z) !== 1) continue;
      segment('connections', lineModel, MAX_TRAIL, a.x - half, a.z - half, b.x - half, b.z - half, 0.13, a.litAt != null || b.litAt != null ? '#f18b60' : '#7a91a0');
    }
    for (let i = 0; i < path.length && i < MAX_TRAIL; i++) {
      const item = path[i], next = path.find(other => Math.abs(other.x - item.x) + Math.abs(other.z - item.z) === 1), lit = item.litAt != null;
      const elapsed = lit ? Math.max(0, (tick - item.litAt) / 60) : 0;
      const tip = lit && animated ? -Math.min(0.8, elapsed * 4) : 0;
      const angle = next ? Math.atan2(next.x - item.x, next.z - item.z) : 0;
      const color = lit ? '#ffab6d' : '#a6d6c8';
      instance('dominoes', dominoModel, MAX_TRAIL, item.x - half, 0.07, item.z - half, 1, angle, color, 1, tip);
    }
    // The first spark is always easy to find, including before a trail exists.
    const starter = level.start;
    const seedScale = animated && ['ready', 'playing', 'drawing'].includes(state.mode) ? 1 + Math.sin(visualTime * 4) * 0.10 : 1;
    instance('starter', starterModel, 1, starter.x - half, 0.065, starter.z - half);
    instance('halos', haloModel, MAX_CELLS + 2, starter.x - half, 0.10, starter.z - half, seedScale, 0, '#3c7de8');
    if (state.mode === 'drawing' && state.stroke) {
      const end = state.stroke;
      instance('halos', haloModel, MAX_CELLS + 2, end.x - half, 0.12, end.z - half, 1.08, 0, '#35a79c');
    }
    for (const jelly of jellies) {
      const x = jelly.x - half, z = jelly.z - half, awake = !!jelly.awake, relay = jelly.type === 'relay';
      const age = jelly.litAt == null ? 10 : Math.max(0, (tick - jelly.litAt) / 60);
      const bounce = awake && animated && age < 0.45 ? Math.sin(age / 0.45 * Math.PI) * 0.12 : 0;
      const breathe = !awake && animated && state.mode === 'playing' ? Math.sin(visualTime * 2 + jelly.id * 1.7) * 0.015 : 0;
      const scale = 1 + bounce;
      instance('shadows', shadowModel, MAX_CELLS * 2, x, 0.066, z, 0.43);
      instance('jellies', jellyModel, MAX_CELLS, x, 0.065 + breathe, z, scale, 0, relay ? '#ffd477' : '#ff8d79', awake ? 1 : 0.85);
      instance(awake ? 'awakeFaces' : 'sleepFaces', awake ? awakeFace : sleepyFace, MAX_CELLS, x, 0.065 + breathe, z, scale);
      if (relay) instance('crowns', relayCrown, MAX_CELLS, x, 0.065 + breathe, z, scale);
      if (awake) instance('halos', haloModel, MAX_CELLS + 2, x, 0.105, z, 1.25, 0, relay ? '#f6bb3f' : '#f17c65');
    }
    for (let index = 0; index < effects.length && index < MAX_EFFECTS; index++) {
      const fx = effects[index], x = fx.x - half, z = fx.z - half;
      const t = Math.max(0, Math.min(1, fx.age / (fx.duration || 0.6))), relay = fx.jellyType === 'relay';
      const color = fx.type === 'win' ? '#ffd063' : relay ? '#ffc64f' : '#ff9476';
      if (fx.type === 'pop' || fx.type === 'win') {
        const target = fx.type === 'win' ? 2.6 : relay ? 2.1 : 1.1;
        const radius = animated ? Math.max(0.15, t * target) : target * 0.6;
        instance('waves', waveModel, MAX_EFFECTS, x, 0.14, z, radius, 0, color);
      }
      const count = fx.type === 'win' ? 8 : fx.type === 'pop' ? 5 : 3;
      for (let i = 0; i < count; i++) {
        const angle = index * 2.399963 + i * Math.PI * 2 / count;
        const distance = animated ? 0.14 + t * (fx.type === 'win' ? 1.6 : 0.8) : 0.32;
        const y = animated ? 0.26 + Math.sin(t * Math.PI) * 0.38 : 0.40;
        const size = (fx.type === 'win' ? 0.11 : 0.085) * (animated ? 1 - t : 0.8);
        instance('sparks', sparkModel, MAX_EFFECTS * 8, x + Math.sin(angle) * distance, y, z + Math.cos(angle) * distance, size, angle, i % 2 ? '#ffe59a' : color);
      }
    }
    for (const batch of batches.values()) for (const mesh of batch.meshes) {
      mesh.count = batch.count; mesh.visible = batch.count > 0;
      if (batch.count) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
    }
    if (!renderer.getContext().isContextLost()) renderer.render(scene, camera);
  }
  function dispose() {
    observer.disconnect(); renderer.domElement.removeEventListener('webglcontextlost', contextLost); renderer.domElement.removeEventListener('webglcontextrestored', contextRestored);
    tiles.dispose();
    for (const batch of batches.values()) for (const mesh of batch.meshes) mesh.dispose();
    for (const geo of [...geometryCache.values(), ...ownedGeometry]) geo.dispose();
    for (const mat of [...materialCache.values(), ...ownedMaterial]) mat.dispose();
    renderer.dispose();
  }
  return { render, resize, project, pick, renderer, camera, dispose };
}
