import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { chamberFor, bloomPosition, ROOM_RADIUS, MAX_ENEMIES, MAX_BULLETS, MAX_PARTICLES } from './borrowed-levels.js';
import { insideTriangle, edgeDistance } from './borrowed-game.js';

export function createBorrowedScene(container, { resized, lost, restored } = {}) {
  const touch = matchMedia('(pointer: coarse)').matches;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ antialias: !touch, powerPreference: 'low-power' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b1424');
  scene.fog = new THREE.Fog('#0b1424', 32, 70);
  const camera = new THREE.OrthographicCamera(-12, 12, 10, -10, 0.1, 100);
  const hemi = new THREE.HemisphereLight('#c8e7ff', '#263148', 2.5);
  const sun = new THREE.DirectionalLight('#ffe4cd', 2.2); sun.position.set(-10, 18, 10);
  scene.add(hemi, sun);
  const geometries = new Map(), materials = new Map(), merged = new Set(), textures = [];
  function geo(type) {
    if (!geometries.has(type)) geometries.set(type, type === 'box' ? new THREE.BoxGeometry(1, 1, 1)
      : type === 'ball' ? new THREE.SphereGeometry(1, touch ? 8 : 12, touch ? 6 : 8)
      : type === 'crystal' ? new THREE.OctahedronGeometry(1)
      : type === 'cone' ? new THREE.ConeGeometry(1, 1, 6)
      : type === 'tube' ? new THREE.CylinderGeometry(1, 1, 1, 8)
      : new THREE.TorusGeometry(1, 0.07, 5, 24));
    return geometries.get(type);
  }
  function mat(color, glow = false) {
    const key = `${color}:${glow}`;
    if (!materials.has(key)) materials.set(key, glow ? new THREE.MeshBasicMaterial({ color, toneMapped: false }) : new THREE.MeshLambertMaterial({ color }));
    return materials.get(key);
  }
  function piece(group, type, color, position, scale, rotation, glow = false) {
    const mesh = new THREE.Mesh(geo(type), mat(color, glow));
    mesh.position.set(...position); mesh.scale.set(...scale);
    if (rotation) mesh.rotation.set(...rotation);
    group.add(mesh); return mesh;
  }
  function merge(group) {
    group.updateMatrixWorld(true);
    const buckets = new Map(), result = new THREE.Group();
    group.traverse(mesh => {
      if (!mesh.isMesh) return;
      if (!buckets.has(mesh.material)) buckets.set(mesh.material, []);
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      buckets.get(mesh.material).push(geometry.applyMatrix4(mesh.matrixWorld));
    });
    for (const [material, parts] of buckets) {
      const geometry = mergeGeometries(parts, false); parts.forEach(part => part.dispose()); merged.add(geometry);
      result.add(new THREE.Mesh(geometry, material));
    }
    return result;
  }
  const floorMaterial = mat('#223650');
  const island = new THREE.Mesh(new THREE.CylinderGeometry(ROOM_RADIUS, ROOM_RADIUS - 0.4, 0.65, 64), floorMaterial);
  island.position.y = -0.38; scene.add(island); merged.add(island.geometry);
  const decor = new THREE.Group();
  piece(decor, 'cone', '#14243b', [0, -1.6, 0], [8.15, 2.6, 8.15], [0, Math.PI / 6, Math.PI]);
  for (let i = 0; i < 24; i++) {
    const angle = i * Math.PI / 12, x = Math.sin(angle), z = Math.cos(angle);
    piece(decor, 'box', i % 2 ? '#53627a' : '#c9a270', [x * 8.25, -0.06, z * 8.25], [0.055, 0.035, i % 2 ? 0.23 : 0.42], [0, angle, 0]);
    if (i % 3 === 0) {
      piece(decor, 'crystal', '#263954', [x * 7.8, -1.1 - (i % 5) * 0.12, z * 7.8], [0.28, 1.1, 0.28]);
      piece(decor, 'box', '#749baf', [x * 8.18, -0.4, z * 8.18], [0.08, 0.4, 0.08], [0, angle, 0], true);
    }
  }
  scene.add(merge(decor));
  // The engraved clock face is generated locally, with no image downloads.
  const face = document.createElement('canvas'); face.width = face.height = 1024;
  const ctx = face.getContext('2d'); ctx.translate(512, 512);
  ctx.strokeStyle = '#7ea6c83c'; ctx.lineWidth = 1.2;
  for (const radius of [92, 198, 310, 403, 451]) { ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke(); }
  for (let i = 0; i < 60; i++) {
    const angle = i * Math.PI / 30, a = i % 5 ? 436 : 419;
    ctx.strokeStyle = i % 5 ? '#8eb7cd55' : '#d7c49d99'; ctx.lineWidth = i % 5 ? 2 : 3;
    ctx.beginPath(); ctx.moveTo(Math.sin(angle) * a, Math.cos(angle) * a); ctx.lineTo(Math.sin(angle) * 448, Math.cos(angle) * 448); ctx.stroke();
  }
  ctx.font = '22px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#acd0df66';
  for (let i = 1; i <= 12; i++) { const angle = i * Math.PI / 6; ctx.fillText(['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'][i % 12], Math.sin(angle) * 379, -Math.cos(angle) * 379); }
  ctx.strokeStyle = '#7199b021'; ctx.lineWidth = 1;
  for (let i = -8; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(i * 49, -410); ctx.lineTo(i * 49, 410); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-410, i * 49); ctx.lineTo(410, i * 49); ctx.stroke(); }
  const faceTexture = new THREE.CanvasTexture(face); faceTexture.colorSpace = THREE.SRGBColorSpace; textures.push(faceTexture);
  const faceMaterial = new THREE.MeshBasicMaterial({ map: faceTexture, transparent: true, depthWrite: false, opacity: 0.8 });
  const faceMesh = new THREE.Mesh(new THREE.PlaneGeometry(17, 17).rotateX(-Math.PI / 2), faceMaterial); faceMesh.position.y = -0.04; scene.add(faceMesh); merged.add(faceMesh.geometry);

  const circle = document.createElement('canvas'); circle.width = circle.height = 64;
  const cg = circle.getContext('2d'), gradient = cg.createRadialGradient(32, 32, 1, 32, 32, 32);
  gradient.addColorStop(0, '#ffffffa0'); gradient.addColorStop(0.3, '#ffffff30'); gradient.addColorStop(1, '#ffffff00'); cg.fillStyle = gradient; cg.fillRect(0, 0, 64, 64);
  const haloTexture = new THREE.CanvasTexture(circle); textures.push(haloTexture);
  const haloMaterial = new THREE.MeshBasicMaterial({ map: haloTexture, color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const haloGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); merged.add(haloGeometry);
  const haloModel = new THREE.Mesh(haloGeometry, haloMaterial);
  const anchorModel = new THREE.Mesh(geo('crystal'), mat('#ffffff', true));

  const templates = new Map();
  function weaver() {
    if (templates.has('weaver')) return templates.get('weaver');
    const group = new THREE.Group();
    piece(group, 'ball', '#f4ecdc', [0, 0.58, 0], [0.31, 0.41, 0.29]);
    piece(group, 'ball', '#132338', [0, 0.67, 0.2], [0.23, 0.16, 0.12]);
    for (const x of [-0.085, 0.085]) piece(group, 'box', '#ffffff', [x, 0.69, 0.307], [0.028, 0.064, 0.025], null, true);
    piece(group, 'cone', '#ffffff', [0, 0.15, 0], [0.19, 0.36, 0.19], [0, 0, Math.PI]);
    piece(group, 'ring', '#f3cf91', [0, 1.06, 0], [0.34, 0.34, 0.34], [Math.PI / 2, 0, 0], true);
    for (const side of [-1, 1]) piece(group, 'crystal', '#ffffff', [side * 0.36, 0.48, -0.04], [0.28, 0.1, 0.15], [0, side * 0.4, side * -0.35]);
    const model = merge(group); templates.set('weaver', model); return model;
  }
  function enemyTemplate(type) {
    if (templates.has(type)) return templates.get(type);
    const group = new THREE.Group();
    const color = { mote: '#f7a4b6', hunter: '#ee8b87', sentry: '#dfacfc', armor: '#ecc187' }[type];
    piece(group, type === 'hunter' ? 'cone' : type === 'armor' ? 'tube' : 'ball', color, [0, 0.38, 0], type === 'hunter' ? [0.27, 0.8, 0.27] : [0.34, 0.34, 0.34], type === 'hunter' ? [Math.PI / 2, 0, 0] : null);
    piece(group, 'ball', '#152137', [0, 0.43, 0.28], [0.15, 0.13, 0.1]);
    piece(group, 'ball', '#fff1c9', [0, 0.45, 0.36], [0.065, 0.065, 0.035], null, true);
    for (let n = 0; n < 3; n++) {
      const angle = n * Math.PI * 2 / 3;
      piece(group, 'cone', '#c0bbbe', [Math.sin(angle) * 0.38, 0.12, Math.cos(angle) * 0.38], [0.07, 0.3, 0.07], [0.4, angle, 0.35]);
    }
    if (type === 'armor' || type === 'sentry') piece(group, 'ring', color, [0, 0.45, 0], [0.51, 0.51, 0.51], [Math.PI / 2, 0, 0], true);
    const model = merge(group); templates.set(type, model); return model;
  }
  function bloomTemplate() {
    const group = new THREE.Group();
    piece(group, 'tube', '#7795ab', [0, 0.18, 0], [0.37, 0.3, 0.37]);
    piece(group, 'crystal', '#ffffff', [0, 0.78, 0], [0.32, 0.59, 0.32], null, true);
    for (let n = 0; n < 6; n++) { const angle = n * Math.PI / 3; piece(group, 'crystal', '#c5d0d4', [Math.sin(angle) * 0.4, 0.43, Math.cos(angle) * 0.4], [0.13, 0.32, 0.13], [Math.sin(angle) * 0.6, 0, Math.cos(angle) * -0.6]); }
    return merge(group);
  }
  const flowerModel = bloomTemplate();
  const pillarGroup = new THREE.Group();
  piece(pillarGroup, 'tube', '#30425b', [0, 0.18, 0], [1, 0.33, 1]);
  piece(pillarGroup, 'crystal', '#a3bdd3', [0, 1.0, 0], [0.8, 1.8, 0.8]);
  piece(pillarGroup, 'ring', '#8caac2', [0, 0.3, 0], [1.1, 1.1, 1.1], [Math.PI / 2, 0, 0], true);
  const pillarModel = merge(pillarGroup);
  const batches = new Map(), transform = new THREE.Object3D(), matrix = new THREE.Matrix4(), tint = new THREE.Color();
  function instance(name, model, capacity, x, y, z, scale = 1, angle = 0, color = '#ffffff') {
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
    transform.position.set(x, y, z); transform.rotation.set(0, angle, 0); transform.scale.setScalar(scale); transform.updateMatrix();
    matrix.multiplyMatrices(transform.matrix, batch.base); tint.set(color);
    for (const mesh of batch.meshes) { mesh.setMatrixAt(batch.count, matrix); mesh.setColorAt(batch.count, tint); }
    batch.count++;
  }
  const sailGeometry = new THREE.BufferGeometry();
  const sailPositions = new Float32Array(9); sailGeometry.setAttribute('position', new THREE.BufferAttribute(sailPositions, 3));
  const sailColors = new Float32Array([1, 0.57, 0.76, 0.3, 0.9, 0.86, 0.68, 0.55, 1]);
  sailGeometry.setAttribute('color', new THREE.BufferAttribute(sailColors, 3)); merged.add(sailGeometry);
  const sailMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const sail = new THREE.Mesh(sailGeometry, sailMaterial); sail.frustumCulled = false; scene.add(sail);
  const edgeGeometry = new THREE.CylinderGeometry(0.04, 0.04, 1, 6); merged.add(edgeGeometry);
  const edgeColors = ['#f4a0ca', '#7ee4dc', '#c5adfc'];
  const edges = edgeColors.map(color => { const mesh = new THREE.Mesh(edgeGeometry, mat(color, true)); mesh.frustumCulled = false; scene.add(mesh); return mesh; });
  const from = new THREE.Vector3(), to = new THREE.Vector3(), direction = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const trails = Array.from({ length: 3 }, (_, index) => {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(1218 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0); merged.add(geometry);
    const material = new THREE.LineBasicMaterial({ color: index < 2 ? edgeColors[index + 1] : '#eedbb3', transparent: true, opacity: index < 2 ? 0.25 : 0.18, depthWrite: false });
    const line = new THREE.LineSegments(geometry, material); line.frustumCulled = false; scene.add(line); return { line, source: null, count: -1 };
  });
  const bloomRings = Array.from({ length: 3 }, (_, index) => {
    const geometry = new THREE.RingGeometry(0.66, 0.71, 64).rotateX(-Math.PI / 2); merged.add(geometry);
    const material = new THREE.MeshBasicMaterial({ color: edgeColors[(index + 1) % 3], transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
    const mesh = new THREE.Mesh(geometry, material); scene.add(mesh); return mesh;
  });
  const waveGeometry = new THREE.RingGeometry(0.97, 1.03, 80).rotateX(-Math.PI / 2); merged.add(waveGeometry);
  const waveMaterial = new THREE.MeshBasicMaterial({ color: '#efb47c', transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const wave = new THREE.Mesh(waveGeometry, waveMaterial); scene.add(wave);
  const boss = new THREE.Group();
  piece(boss, 'crystal', '#c5aedb', [0, 0, 0], [0.74, 0.95, 0.74]);
  piece(boss, 'ball', '#211a36', [0, 0.04, 0.65], [0.34, 0.34, 0.18]);
  piece(boss, 'ball', '#ffddac', [0, 0.04, 0.79], [0.13, 0.19, 0.05], null, true);
  for (let n = 0; n < 10; n++) { const a = n * Math.PI / 5; piece(boss, 'crystal', '#c896b6', [Math.sin(a) * 1.1, Math.cos(a) * 1.1, 0], [0.11, 0.33, 0.12], [0, 0, -a]); }
  scene.add(boss);
  const bossRing = new THREE.Mesh(geo('ring'), mat('#f1bb8f', true)); bossRing.scale.setScalar(1.4); boss.add(bossRing);
  const bulletModel = new THREE.Mesh(geo('crystal'), mat('#ffb58b', true)); bulletModel.scale.setScalar(0.105);
  const sparkModel = new THREE.Mesh(geo('crystal'), mat('#ffffff', true)); sparkModel.scale.setScalar(0.06);
  const starPositions = new Float32Array(180 * 3);
  for (let i = 0; i < 180; i++) { const a = i * 2.39996, r = 12 + ((i * 17) % 13); starPositions.set([Math.cos(a) * r, -1 - (i % 7) * 1.7, Math.sin(a) * r], i * 3); }
  const starGeometry = new THREE.BufferGeometry(); starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3)); merged.add(starGeometry);
  const starMaterial = new THREE.PointsMaterial({ color: '#7c9ac0', size: 0.055, transparent: true, opacity: 0.5, depthWrite: false });
  scene.add(new THREE.Points(starGeometry, starMaterial));
  let width = 1, height = 1, currentLevel;
  function resize() {
    width = Math.max(1, container.clientWidth); height = Math.max(1, container.clientHeight);
    const aspect = width / height, vertical = Math.max(18.5, 20.5 / aspect);
    Object.assign(camera, { left: -vertical * aspect / 2, right: vertical * aspect / 2, top: vertical / 2, bottom: -vertical / 2 });
    camera.position.set(0, 25, 12); camera.lookAt(0, -0.1, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1.35 : 2, Math.sqrt((touch ? 420000 : 1500000) / (width * height))));
    renderer.setSize(width, height, false); resized?.();
  }
  const projectVector = new THREE.Vector3(), ray = new THREE.Raycaster(), pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), picked = new THREE.Vector3();
  function project(x, z, y = 0.2) { projectVector.set(x, y, z).project(camera); return { x: (projectVector.x + 1) * width / 2, y: (1 - projectVector.y) * height / 2 }; }
  function pick(clientX, clientY) {
    const rect = container.getBoundingClientRect(); ray.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2), camera);
    return ray.ray.intersectPlane(pickPlane, picked) ? { x: picked.x, z: picked.z } : null;
  }
  resize(); const observer = new ResizeObserver(resize); observer.observe(container);
  renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); lost?.(); });
  renderer.domElement.addEventListener('webglcontextrestored', () => { resize(); restored?.(); });
  function render(state, visualTime = 0) {
    const room = chamberFor(state.level), time = state.loopTicks / 60, animated = !motion.matches;
    if (currentLevel !== room.id) { currentLevel = room.id; scene.background.set(room.palette[0]).multiplyScalar(0.48); scene.fog.color.copy(scene.background); floorMaterial.color.set(room.palette[0]).lerp(new THREE.Color('#485d76'), 0.26); }
    for (const batch of batches.values()) batch.count = 0;
    const colors = ['#fff0d7', '#71e3dc', '#c2a7ff'];
    for (let index = 0; index < 3; index++) {
      const [x, z] = state.sail[index];
      const ghost = index > 0 && index <= state.memories.length;
      const bob = animated ? Math.sin(visualTime * 2.5 + index * 2) * 0.055 : 0;
      instance('halo', haloModel, 64, x, 0.01, z, index ? 2 : 2.5, 0, colors[index]);
      if (!index || ghost) instance('weavers', weaver(), 3, x, 0.17 + bob, z, !index ? 1.05 : 0.95, index ? Math.sin(time * 0.5 + index) * 0.2 : Math.atan2(state.player.dx, state.player.dz), colors[index]);
      else { instance('anchors', anchorModel, 2, x, 0.8 + bob, z, 0.35, animated ? visualTime * 0.4 : 0, colors[index]); }
      sailPositions.set([x, 0.1, z], index * 3);
      const next = state.sail[(index + 1) % 3]; from.set(x, 0.18, z); to.set(next[0], 0.18, next[1]); direction.subVectors(to, from);
      const edge = edges[index]; edge.position.copy(from).addScaledVector(direction, 0.5); edge.scale.set(1 + state.pulse * 2, direction.length(), 1 + state.pulse * 2); edge.quaternion.setFromUnitVectors(up, direction.normalize());
    }
    sailGeometry.attributes.position.needsUpdate = true;
    sailMaterial.opacity = state.area < 8 ? 0.035 : 0.11 + state.pulse * 0.48;
    for (let i = 0; i < 3; i++) {
      const bloom = state.blooms[i], [x, z] = bloomPosition(room, i, time), charged = bloom.charge >= bloom.need;
      const available = i < state.loop && !charged;
      const catchable = available && state.area >= 8 && insideTriangle(x, z, state.sail) && (!room.edge || edgeDistance(x, z, state.sail) <= (state.difficulty === 'flow' ? 1.5 : 1));
      const color = charged ? '#f5deb0' : colors[(i + 1) % 3];
      instance('flowers', flowerModel, 3, x, 0.02, z, charged ? 1.1 : 0.87, animated ? visualTime * 0.16 + i : i, available || charged ? color : '#496078');
      instance('halo', haloModel, 64, x, 0.015, z, charged ? 3.4 : catchable ? 2.9 : 1.7, 0, color);
      const ring = bloomRings[i]; ring.position.set(x, 0.06, z); ring.material.opacity = charged ? 0.95 : catchable ? 0.9 : 0.28;
      ring.geometry.setDrawRange(0, charged ? ring.geometry.index.count : Math.max(9, Math.floor(ring.geometry.index.count * bloom.charge / bloom.need / 3) * 3));
      ring.scale.setScalar(catchable && animated ? 1 + Math.sin(visualTime * 4) * 0.06 : 1);
    }
    room.obstacles.forEach(([x, z, radius]) => instance('pillars', pillarModel, 3, x, 0, z, radius));
    for (const enemy of state.enemies) {
      instance(`enemy:${enemy.type}`, enemyTemplate(enemy.type), MAX_ENEMIES, enemy.x, animated ? Math.sin(enemy.age * 6) * 0.045 + 0.04 : 0.04, enemy.z, enemy.hit > 0 ? 1.1 : 1, enemy.angle, enemy.hit > 0 ? '#ffffff' : '#e8d9e6');
      const caught = state.area >= 8 && insideTriangle(enemy.x, enemy.z, state.sail);
      instance('halo', haloModel, 64, enemy.x, 0.008, enemy.z, caught ? 2 : 1.1, 0, caught ? '#f5a2c1' : '#74476a');
    }
    for (const bullet of state.bullets) instance('bullets', bulletModel, MAX_BULLETS, bullet.x, 0.5, bullet.z, 1, animated ? visualTime * 3 : 0);
    for (const fx of state.effects) for (let n = 0; n < 3; n++) {
      const angle = fx.id * 2.39996 + n * Math.PI * 2 / 3, length = animated ? fx.age * (1.5 + fx.strength * 0.6) : 0.25, fade = Math.max(0, 1 - fx.age / 0.7);
      instance('sparks', sparkModel, MAX_PARTICLES * 3, fx.x + Math.cos(angle) * length, animated ? 0.3 + Math.sin(fx.age * 3) * 0.9 : 0.4, fx.z + Math.sin(angle) * length, fade * 1.5, angle, fx.type === 'hurt' ? '#ee7d91' : fx.type === 'feed' ? '#f1d397' : '#b2fff0');
    }
    for (const [index, trail] of trails.entries()) {
      const source = index < 2 ? state.memories[index]?.points : state.recording;
      if (trail.source !== source || trail.count !== source?.length) {
        trail.source = source; trail.count = source?.length;
        const attr = trail.line.geometry.attributes.position;
        let count = 0;
        for (let i = 1; source && i < Math.min(610, source.length); i++) {
          if (source[i][3]) continue; // A borrowed jump has no intervening route.
          attr.setXYZ(count++, source[i - 1][1], 0.07, source[i - 1][2]); attr.setXYZ(count++, source[i][1], 0.07, source[i][2]);
        }
        attr.needsUpdate = true; trail.line.geometry.setDrawRange(0, count);
      }
    }
    wave.visible = state.ring > 0; wave.position.y = 0.1; if (wave.visible) wave.scale.setScalar(state.ring);
    boss.visible = !!room.boss; boss.position.set(0, state.bossAwake ? 1.2 : 0.9, -0.3); boss.scale.setScalar(state.bossAwake ? 1 : 0.65);
    boss.rotation.z = animated ? Math.sin(visualTime * 0.7) * 0.13 : 0;
    bossRing.rotation.set(0.2, animated ? visualTime * 0.3 : 0, 0.1);
    for (const batch of batches.values()) for (const mesh of batch.meshes) {
      mesh.count = batch.count; mesh.visible = batch.count > 0;
      if (batch.count) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
    }
    if (!renderer.getContext().isContextLost()) renderer.render(scene, camera);
  }
  function dispose() {
    observer.disconnect();
    for (const batch of batches.values()) for (const mesh of batch.meshes) mesh.dispose();
    for (const g of [...geometries.values(), ...merged]) g.dispose();
    for (const m of [...materials.values(), faceMaterial, haloMaterial, sailMaterial, waveMaterial, starMaterial, ...bloomRings.map(ring => ring.material), ...trails.map(trail => trail.line.material)]) m.dispose();
    textures.forEach(texture => texture.dispose()); renderer.dispose();
  }
  return { render, resize, project, pick, dispose, renderer, camera };
}
