import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROWS, COLS } from './garden-game.js?v2';
import { getLevel, MAX_ZOMBIES } from './garden-levels.js';

const CELL = 1.45;
const xAt = col => (col - (COLS - 1) / 2) * CELL;
const zAt = row => (row - (ROWS - 1) / 2) * CELL;

export function createGardenScene(container, { onLost, onRestored, onResize } = {}) {
  const mobile = matchMedia('(pointer: coarse)').matches;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ antialias: !mobile, alpha: false, powerPreference: 'low-power' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.shadowMap.enabled = !mobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#cddcc3');
  scene.fog = new THREE.Fog('#cddcc3', 28, 65);
  const camera = new THREE.OrthographicCamera(-9, 9, 6, -6, 0.1, 80);
  const ambient = new THREE.HemisphereLight(0xfff5dc, 0x708647, 2.6);
  scene.add(ambient);
  const sunlight = new THREE.DirectionalLight(0xffecd1, 3.1);
  sunlight.position.set(-8, 15, 8);
  sunlight.castShadow = !mobile;
  sunlight.shadow.mapSize.set(1024, 1024);
  Object.assign(sunlight.shadow.camera, { left: -11, right: 11, top: 9, bottom: -9, near: 1, far: 40 });
  sunlight.shadow.normalBias = 0.05;
  sunlight.shadow.bias = -0.0002;
  scene.add(sunlight);

  const materials = new Map();
  function mat(color, basic = false) {
    const key = `${color}:${basic}`;
    if (!materials.has(key)) materials.set(key, basic ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color }));
    return materials.get(key);
  }
  const geometries = new Map();
  function geo(kind) {
    if (!geometries.has(kind)) {
      const geometry = kind === 'box' ? new THREE.BoxGeometry(1, 1, 1)
        : kind === 'sphere' ? new THREE.SphereGeometry(1, mobile ? 8 : 12, mobile ? 6 : 8)
        : kind === 'cylinder' ? new THREE.CylinderGeometry(1, 1, 1, mobile ? 8 : 10)
        : kind === 'cone' ? new THREE.ConeGeometry(1, 1, mobile ? 6 : 10)
        : new THREE.TorusGeometry(1, 0.1, 5, mobile ? 12 : 16);
      geometries.set(kind, geometry);
    }
    return geometries.get(kind);
  }
  function shape(parent, kind, color, position, scale, rotation) {
    const mesh = new THREE.Mesh(geo(kind), mat(color));
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function box(parent, color, x, y, z, sx, sy, sz, rotation) {
    return shape(parent, 'box', color, [x, y, z], [sx, sy, sz], rotation);
  }
  function ball(parent, color, x, y, z, sx, sy = sx, sz = sx) {
    return shape(parent, 'sphere', color, [x, y, z], [sx, sy, sz]);
  }
  // Merge decorative parts of each shared model by material once. Instances
  // reuse that geometry instead of allocating a new mesh for every petal.
  const mergedGeometries = new Set();
  function mergeModel(group) {
    group.updateMatrixWorld(true);
    const buckets = new Map();
    group.traverse(mesh => {
      if (!mesh.isMesh) return;
      if (!buckets.has(mesh.material)) buckets.set(mesh.material, []);
      buckets.get(mesh.material).push(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
    });
    const result = new THREE.Group();
    for (const [material, parts] of buckets) {
      const geometry = mergeGeometries(parts, false);
      parts.forEach(part => part.dispose());
      mergedGeometries.add(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      result.add(mesh);
    }
    return result;
  }
  const decor = new THREE.Group();
  box(decor, '#cddcc3', 0, -0.75, 0, 100, 0.3, 100);
  box(decor, '#72984f', 0, -0.3, 0, COLS * CELL + 0.16, 0.65, ROWS * CELL + 0.16);
  box(decor, '#a5bd70', 0, 0.02, 0, COLS * CELL + 0.08, 0.08, ROWS * CELL + 0.08);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      box(decor, (row + col) % 2 ? '#90b65a' : '#9fc36a', xAt(col), 0.08, zAt(row), CELL - 0.035, 0.10, CELL - 0.035);
      for (let n = 0; n < 3; n++) {
        const ox = Math.sin(col * 17 + row * 11 + n * 13) * 0.5;
        const oz = Math.cos(col * 7 + row * 21 + n * 9) * 0.5;
        shape(decor, 'cone', '#78a449', [xAt(col) + ox, 0.18, zAt(row) + oz], [0.024, 0.12, 0.024]);
      }
    }
  }
  // Right-hand approach and the picket fence make the direction of play clear.
  box(decor, '#bcb397', 7.1, -0.4, 0.2, 1.85, 0.3, 10);
  for (let row = 0; row < 8; row++) box(decor, '#d4cfb9', 7.1, -0.22, row * 1.25 - 4.2, 1.6, 0.12, 1.1);
  box(decor, '#ece6c9', 0, 0.56, -4.65, 17, 0.13, 0.15);
  box(decor, '#ece6c9', 0, 1.06, -4.65, 17, 0.13, 0.15);
  for (let i = 0; i < 36; i++) {
    const x = -8.65 + i * 0.5;
    box(decor, '#f7f0d8', x, 0.7, -4.7, 0.23, 1.45, 0.12);
    shape(decor, 'cone', '#f7f0d8', [x, 1.47, -4.7], [0.17, 0.24, 0.12], [0, Math.PI / 4, 0]);
  }
  for (let i = 0; i < 15; i++) {
    const x = -8.5 + i * 1.2;
    ball(decor, i % 2 ? '#78935a' : '#8da66b', x, 0.1, -5.1, 0.8, 0.65, 0.65);
  }
  // A little cottage sits on the safe side of the lawn.
  box(decor, '#edcf9b', -9.1, 1.05, 0, 3.5, 3, 7);
  box(decor, '#ce8660', -9.1, 2.85, 0, 4, 0.3, 7.7, [0, 0, 0.22]);
  box(decor, '#f7e9c3', -7.31, 1.0, -0.4, 0.08, 2.2, 1.4);
  box(decor, '#588a91', -7.25, 1.15, -0.4, 0.08, 1.35, 0.95);
  box(decor, '#f3e5bf', -7.19, 1.15, -0.4, 0.08, 0.07, 1.02);
  box(decor, '#f3e5bf', -7.19, 1.15, -0.4, 0.08, 1.4, 0.07);
  for (let i = 0; i < 26; i++) {
    const x = -6.7 + i * 0.51;
    const z = i % 2 ? 4.05 : -3.98;
    ball(decor, '#597f3d', x, -0.04, z, 0.29, 0.30, 0.25);
    const color = ['#f2bc68', '#e28e87', '#eee1a4'][i % 3];
    shape(decor, 'cylinder', '#658d43', [x, 0.21, z], [0.025, 0.35, 0.025]);
    for (let p = 0; p < 5; p++) ball(decor, color, x + Math.cos(p * Math.PI * 0.4) * 0.085, 0.41 + Math.sin(p * Math.PI * 0.4) * 0.085, z, 0.085, 0.085, 0.05);
    ball(decor, '#b98a40', x, 0.41, z + 0.04, 0.045);
  }
  scene.add(mergeModel(decor));

  const templates = new Map();
  function plantTemplate(type) {
    if (templates.has(type)) return templates.get(type);
    const group = new THREE.Group();
    if (type === 'nut') {
      ball(group, '#ab7542', 0, 0.57, 0, 0.41, 0.54, 0.34);
      ball(group, '#c2945d', 0, 0.62, 0.09, 0.35, 0.47, 0.28);
      for (const side of [-1, 1]) {
        ball(group, '#ffefd5', side * 0.13, 0.76, 0.32, 0.085, 0.105, 0.04);
        ball(group, '#302a21', side * 0.11, 0.75, 0.36, 0.033, 0.055, 0.025);
      }
      box(group, '#735132', 0, 0.48, 0.351, 0.11, 0.025, 0.025);
      for (const x of [-0.26, 0.25]) box(group, '#a67846', x, 0.49, 0.27, 0.023, 0.38, 0.03, [0, 0, x * 0.5]);
    } else {
      shape(group, 'cylinder', '#4c842f', [0, 0.48, 0], [0.055, 0.72, 0.055]);
      shape(group, 'sphere', '#569639', [-0.20, 0.35, 0.02], [0.29, 0.075, 0.13], [0, 0.4, -0.4]);
      shape(group, 'sphere', '#71ad45', [0.20, 0.46, 0.02], [0.28, 0.075, 0.13], [0, -0.4, 0.4]);
      if (type === 'bloom') {
        for (let p = 0; p < 11; p++) {
          const angle = p * Math.PI * 2 / 11;
          shape(group, 'sphere', p % 2 ? '#f0bc3e' : '#f9cc50', [Math.cos(angle) * 0.31, 1.0 + Math.sin(angle) * 0.31, 0.04], [0.17, 0.12, 0.075], [0, 0, angle]);
        }
        ball(group, '#bd7c36', 0, 1.0, 0.1, 0.24, 0.24, 0.13);
        ball(group, '#d69543', 0, 1.02, 0.16, 0.20, 0.20, 0.09);
        for (const side of [-1, 1]) ball(group, '#3b3024', side * 0.072, 1.055, 0.25, 0.023, 0.036, 0.016);
        ball(group, '#704b2c', 0, 0.94, 0.25, 0.045, 0.018, 0.014);
      } else {
        ball(group, '#75b747', 0, 0.93, 0, 0.31, 0.29, 0.28);
        shape(group, 'cylinder', '#75b747', [0.32, 0.95, 0], [0.19, 0.36, 0.19], [0, 0, Math.PI / 2]);
        shape(group, 'cylinder', '#39662c', [0.51, 0.95, 0], [0.125, 0.017, 0.125], [0, 0, Math.PI / 2]);
        shape(group, 'torus', '#8ac359', [0.525, 0.95, 0], [0.17, 0.17, 0.17], [0, Math.PI / 2, 0]);
        ball(group, '#fcf4d5', -0.065, 1.03, 0.24, 0.073, 0.09, 0.035);
        ball(group, '#273c24', -0.045, 1.04, 0.269, 0.032, 0.048, 0.023);
        shape(group, 'sphere', '#4f8c35', [-0.2, 1.2, -0.02], [0.2, 0.07, 0.09], [0, 0, -0.6]);
      }
    }
    const model = mergeModel(group);
    templates.set(type, model);
    return model;
  }
  const zombieTemplates = new Map();
  function zombieTemplate(armored, runner = false) {
    const variant = armored ? 'armored' : runner ? 'runner' : 'zombie';
    if (zombieTemplates.has(variant)) return zombieTemplates.get(variant);
    const group = new THREE.Group();
    box(group, runner ? '#4b8990' : '#66566a', 0, 0.65, 0, 0.37, 0.49, 0.28, [0, 0, 0.12]);
    box(group, '#e6d8b1', -0.08, 0.76, 0.15, 0.11, 0.26, 0.035, [0, 0, 0.18]);
    box(group, '#ac6951', -0.07, 0.71, 0.18, 0.045, 0.17, 0.025);
    ball(group, '#91a674', -0.08, 1.12, 0, 0.26, 0.29, 0.23);
    ball(group, '#a5b985', -0.11, 1.04, 0.08, 0.20, 0.17, 0.19);
    for (const side of [-1, 1]) {
      ball(group, '#f6edca', -0.11 + side * 0.1, 1.19, 0.2, 0.083, 0.09, 0.035);
      ball(group, '#3d4731', -0.13 + side * 0.1, 1.18, 0.232, 0.032, 0.047, 0.016);
      box(group, '#93a877', -0.28, 0.79, side * 0.22, 0.52, 0.11, 0.13, [0, 0, -0.12]);
      ball(group, '#9aad7c', -0.56, 0.82, side * 0.22, 0.09, 0.075, 0.08);
      box(group, '#3d4b50', side * 0.11, 0.24, 0, 0.14, 0.40, 0.17);
      box(group, '#45413b', side * 0.11 - 0.045, 0.09, 0.04, 0.23, 0.13, 0.24);
    }
    box(group, '#574b3b', -0.11, 1.0, 0.244, 0.15, 0.055, 0.02);
    box(group, '#fff0c5', -0.15, 1.015, 0.26, 0.035, 0.035, 0.02);
    if (armored) {
      shape(group, 'cone', '#ec8e44', [-0.06, 1.61, 0], [0.29, 0.62, 0.29], [0, 0, 0.13]);
      shape(group, 'cylinder', '#f6e2ac', [-0.075, 1.57, 0], [0.18, 0.10, 0.18]);
      box(group, '#d47b39', -0.07, 1.32, 0, 0.66, 0.07, 0.57);
    } else {
      box(group, '#5e6749', -0.14, 1.38, -0.02, 0.16, 0.04, 0.2, [0, 0, 0.2]);
      if (runner) box(group, '#e6bb62', -0.08, 1.32, 0.02, 0.48, 0.07, 0.40);
    }
    const model = mergeModel(group);
    model.rotation.y = -0.12;
    zombieTemplates.set(variant, model);
    return model;
  }
  function mowerTemplate() {
    const group = new THREE.Group();
    box(group, '#b95643', 0, 0.25, 0, 0.73, 0.22, 0.67);
    box(group, '#d87254', 0.03, 0.42, 0, 0.40, 0.23, 0.39);
    box(group, '#504a3c', -0.04, 0.57, 0, 0.17, 0.06, 0.22);
    for (const x of [-0.25, 0.25]) for (const z of [-0.34, 0.34]) shape(group, 'cylinder', '#3e4439', [x, 0.18, z], [0.16, 0.09, 0.16], [Math.PI / 2, 0, 0]);
    for (const z of [-0.22, 0.22]) box(group, '#5a6352', -0.42, 0.64, z, 0.045, 0.85, 0.045, [0, 0, -0.45]);
    box(group, '#4a5344', -0.61, 1.02, 0, 0.07, 0.07, 0.51);
    return mergeModel(group);
  }
  const mowerModel = mowerTemplate();
  // Repeated models share one GPU draw per material, including their shadows.
  // Capacities follow the actual level limits; no per-frame meshes are created.
  const batches = new Map();
  const transform = new THREE.Object3D();
  const instanceMatrix = new THREE.Matrix4();
  function makeBatch(name, template, capacity) {
    template.updateMatrix();
    const parts = template.isMesh ? [template] : template.children;
    const meshes = parts.map(part => {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = part.castShadow;
      mesh.receiveShadow = part.receiveShadow;
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
      return mesh;
    });
    const batch = { meshes, capacity, count: 0, base: template.matrix.clone() };
    batches.set(name, batch);
    return batch;
  }
  const shadowGeometry = new THREE.CircleGeometry(0.44, 16).rotateX(-Math.PI / 2);
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: '#31452b', transparent: true, opacity: 0.13, depthWrite: false });
  const shadowModel = new THREE.Mesh(shadowGeometry, shadowMaterial);
  function instance(name, template, capacity, x, row, y = 0.15, scale = 1, rotation = 0) {
    const batch = batches.get(name) || makeBatch(name, template, capacity);
    if (batch.count >= batch.capacity) return;
    transform.position.set(xAt(x), y, zAt(row));
    transform.scale.setScalar(scale);
    transform.rotation.set(0, 0, rotation);
    transform.updateMatrix();
    instanceMatrix.multiplyMatrices(transform.matrix, batch.base);
    for (const mesh of batch.meshes) mesh.setMatrixAt(batch.count, instanceMatrix);
    batch.count++;
  }
  const peaTemplate = new THREE.Mesh(geo('sphere'), mat('#b5e16b'));
  peaTemplate.scale.setScalar(0.105);
  const hover = new THREE.Mesh(new THREE.BoxGeometry(CELL - 0.04, 0.025, CELL - 0.04), new THREE.MeshBasicMaterial({ color: '#f6e6a4', transparent: true, opacity: 0.38, depthWrite: false }));
  hover.visible = false;
  hover.position.y = 0.15;
  scene.add(hover);
  let hoverRow = -1, hoverCol = -1;
  function setHover(row = -1, col = -1) { hoverRow = row; hoverCol = col; }
  const vector = new THREE.Vector3();
  let width = 1, height = 1;
  function project(col, row, elevation = 0.15) {
    vector.set(xAt(col), elevation, zAt(row)).project(camera);
    return { x: (vector.x + 1) * width / 2, y: (1 - vector.y) * height / 2 };
  }
  function resize() {
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    const aspect = width / height;
    const span = width < 600 ? 13.8 : 16.6;
    const vertical = Math.max(10.7, span / aspect);
    camera.left = -vertical * aspect / 2;
    camera.right = vertical * aspect / 2;
    camera.top = vertical / 2;
    camera.bottom = -vertical / 2;
    camera.position.set(0, width < 600 ? 24 : 19, width < 600 ? 11 : 14);
    camera.lookAt(0, 0.2, -0.15);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const ratio = Math.min(devicePixelRatio, mobile ? 1.25 : 2, mobile ? Math.sqrt(360000 / (width * height)) : Infinity);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    onResize?.();
  }
  resize();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); onLost?.(); });
  renderer.domElement.addEventListener('webglcontextrestored', () => { resize(); onRestored?.(); });
  const demoPlants = [
    { id: 'a', type: 'bloom', row: 0, col: 0 }, { id: 'b', type: 'bloom', row: 1, col: 0 },
    { id: 'c', type: 'bloom', row: 3, col: 0 }, { id: 'd', type: 'bloom', row: 4, col: 0 },
    { id: 'e', type: 'pea', row: 0, col: 2 }, { id: 'f', type: 'pea', row: 1, col: 2 },
    { id: 'g', type: 'pea', row: 2, col: 1 }, { id: 'h', type: 'pea', row: 3, col: 2 },
    { id: 'i', type: 'pea', row: 4, col: 1 }, { id: 'j', type: 'nut', row: 1, col: 4 },
    { id: 'k', type: 'nut', row: 3, col: 4 },
  ];
  const demoZombies = [{ id: 'a', row: 0, x: 6.7 }, { id: 'b', row: 2, x: 6.3, armored: true }, { id: 'c', row: 4, x: 7.4 }];
  let activeLevel;
  function render(state, time) {
    if (activeLevel !== state.level) {
      activeLevel = state.level;
      const { theme } = getLevel(state.level);
      scene.background.set(theme.sky);
      scene.fog.color.set(theme.sky);
      mat('#cddcc3').color.set(theme.sky);
      mat('#90b65a').color.set(theme.grass[0]);
      mat('#9fc36a').color.set(theme.grass[1]);
      mat('#72984f').color.set(theme.turf);
      sunlight.color.set(theme.light);
    }
    for (const batch of batches.values()) batch.count = 0;
    const demo = state.mode === 'ready';
    for (const plant of demo ? demoPlants : state.plants) {
      const grow = demo ? 1 : Math.min(1, 0.3 + plant.age * 3);
      const sway = reduced.matches ? 0 : Math.sin(time * 2 + plant.row + plant.col) * 0.025;
      instance(`plant:${plant.type}`, plantTemplate(plant.type), ROWS * COLS, plant.col, plant.row, 0.15, grow, sway);
      instance('shadow', shadowModel, ROWS * COLS + MAX_ZOMBIES + ROWS, plant.col, plant.row, 0.143, grow);
    }
    for (const zombie of demo ? demoZombies : state.zombies) {
      const walk = reduced.matches ? 0 : Math.sin((demo ? time : zombie.age) * (zombie.runner ? 9 : 6) + zombie.row) * 0.035;
      const variant = zombie.armored ? 'armored' : zombie.runner ? 'runner' : 'zombie';
      instance(variant, zombieTemplate(zombie.armored, zombie.runner), MAX_ZOMBIES, zombie.x, zombie.row, 0.15 + Math.abs(walk) * 0.5, zombie.hit > 0 ? 1.06 : 1, walk);
      instance('shadow', shadowModel, ROWS * COLS + MAX_ZOMBIES + ROWS, zombie.x, zombie.row, 0.143);
    }
    for (const mower of state.mowers) {
      if (mower.spent && !mower.active) continue;
      instance('mower', mowerModel, ROWS, mower.x, mower.row);
      instance('shadow', shadowModel, ROWS * COLS + MAX_ZOMBIES + ROWS, mower.x, mower.row, 0.143);
    }
    for (const pea of state.peas) {
      instance('projectile', peaTemplate, ROWS * COLS * 3, pea.x, pea.row, 1.1);
    }
    for (const batch of batches.values()) {
      for (const mesh of batch.meshes) {
        mesh.count = batch.count;
        mesh.visible = batch.count > 0;
        if (batch.count) mesh.instanceMatrix.needsUpdate = true;
      }
    }
    hover.visible = hoverRow >= 0 && hoverCol >= 0 && state.mode === 'playing';
    if (hover.visible) hover.position.set(xAt(hoverCol), 0.15, zAt(hoverRow));
    if (!renderer.getContext().isContextLost()) renderer.render(scene, camera);
  }
  function cellBounds(row, col) {
    const middle = project(col, row);
    const left = project(col - 0.48, row);
    const top = project(col, row - 0.48);
    return { left: left.x, top: top.y, width: (middle.x - left.x) * 2, height: (middle.y - top.y) * 2 };
  }
  function dispose() {
    resizeObserver.disconnect();
    for (const batch of batches.values()) for (const mesh of batch.meshes) mesh.dispose();
    for (const geometry of [...geometries.values(), ...mergedGeometries, shadowGeometry, hover.geometry]) geometry.dispose();
    for (const material of [...materials.values(), shadowMaterial, hover.material]) material.dispose();
    renderer.dispose();
  }
  return { render, project, cellBounds, setHover, resize, dispose, renderer, camera };
}
