import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LEVELS, getPadPosition, MAX_SPEED, MAX_VY, MAX_EFFECTS } from './pondpost-game.js';

// The physics uses side-view x/y coordinates. Depth here is only scenery;
// pad positions, flight dots and landing marks come from that same simulation.
export function createPondPostScene(container, { resized, lost, restored } = {}) {
  const touch = matchMedia('(pointer: coarse)').matches;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ antialias: !touch, powerPreference: 'low-power' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#103d34');
  const camera = new THREE.OrthographicCamera(-6, 6, 6, -6, 0.1, 100);
  scene.add(new THREE.HemisphereLight('#fff4d4', '#366e58', 1.4));
  const sunlight = new THREE.DirectionalLight('#fff2d1', 1.3);
  sunlight.position.set(-7, 14, 18); scene.add(sunlight);

  const geometries = new Map(), materials = new Map(), ownedGeometry = new Set(), ownedMaterial = new Set(), textures = [];
  function geometry(type) {
    if (!geometries.has(type)) geometries.set(type, type === 'ball' ? new THREE.SphereGeometry(1, touch ? 10 : 14, touch ? 7 : 10)
      : type === 'box' ? new THREE.BoxGeometry(1, 1, 1)
      : type === 'cone' ? new THREE.ConeGeometry(1, 1, 6)
      : type === 'tube' ? new THREE.CylinderGeometry(1, 1, 1, 8)
      : type === 'diamond' ? new THREE.OctahedronGeometry(1)
      : new THREE.TorusGeometry(1, 0.07, 5, 24));
    return geometries.get(type);
  }
  function material(color, basic = false) {
    const key = `${color}:${basic}`;
    if (!materials.has(key)) materials.set(key, basic ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color }));
    return materials.get(key);
  }
  function piece(group, type, color, position, scale, rotation, basic = false) {
    const mesh = new THREE.Mesh(geometry(type), material(color, basic));
    mesh.position.set(...position); mesh.scale.set(...scale); if (rotation) mesh.rotation.set(...rotation);
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
      const combined = mergeGeometries(parts, false); parts.forEach(part => part.dispose());
      ownedGeometry.add(combined); model.add(new THREE.Mesh(combined, mat));
    }
    return model;
  }

  // Painted light and transparent waterfall strokes give the forest depth
  // without downloaded assets, dynamic lights or a post-processing pass.
  const backdrop = document.createElement('canvas'); backdrop.width = 512; backdrop.height = 1536;
  const ctx = backdrop.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, backdrop.height);
  gradient.addColorStop(0, '#277a56'); gradient.addColorStop(0.55, '#165e4c'); gradient.addColorStop(1, '#103d34');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 512, 1536);
  for (let i = 0; i < 6; i++) {
    const x = 42 + i * 92;
    ctx.fillStyle = i % 2 ? '#d7f5a009' : '#fff8c707';
    ctx.beginPath(); ctx.moveTo(x - 35, 0); ctx.lineTo(x + 65, 0); ctx.lineTo(x + 300, 1536); ctx.lineTo(x + 175, 1536); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = '#cbefca10'; ctx.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const x = 20 + i * 46; ctx.lineWidth = i % 3 === 0 ? 8 : 3;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x - 35, 450, x + 35, 1000, x - 5, 1536); ctx.stroke();
  }
  for (let i = 0; i < 110; i++) {
    const x = (i * 139 + 29) % 512, y = (i * 307 + 57) % 1536;
    ctx.fillStyle = i % 4 ? '#d0f2ae18' : '#fff6c52a';
    ctx.beginPath(); ctx.arc(x, y, i % 7 ? 1.5 : 3.4, 0, Math.PI * 2); ctx.fill();
  }
  const backgroundTexture = new THREE.CanvasTexture(backdrop); backgroundTexture.colorSpace = THREE.SRGBColorSpace; textures.push(backgroundTexture);
  const backgroundMaterial = new THREE.MeshBasicMaterial({ map: backgroundTexture, depthWrite: false });
  const backgroundGeometry = new THREE.PlaneGeometry(45, 65);
  const background = new THREE.Mesh(backgroundGeometry, backgroundMaterial); background.position.set(0, 10, -11); scene.add(background);
  ownedGeometry.add(backgroundGeometry); ownedMaterial.add(backgroundMaterial);

  // Paper-cut leaves and branches frame the open middle; their sparse shapes
  // leave moving platforms and the launch preview easy to read.
  const decor = new THREE.Group();
  for (const side of [-1, 1]) {
    piece(decor, 'tube', '#245e48', [side * 5.15, 8, -4.1], [0.22, 29, 0.22], [0, 0, side * 0.04]);
    for (let i = 0; i < 14; i++) {
      const y = -2 + i * 2.05, x = side * (4.8 + (i % 3) * 0.22), angle = side * (0.3 + (i % 3) * 0.16);
      piece(decor, 'ball', i % 3 === 0 ? '#4b9f6c' : i % 3 === 1 ? '#347c5a' : '#66af78', [x, y, -3.65], [0.72, 0.19, 0.15], [0, 0, angle]);
      piece(decor, 'ball', '#1d6a51', [x + side * 0.30, y + 0.42, -3.8], [0.53, 0.13, 0.12], [0, 0, -angle]);
      if (i % 4 === 0) {
        piece(decor, 'ball', '#f6df9d', [x - side * 0.17, y + 0.02, -3.3], [0.07, 0.07, 0.07], null, true);
        for (let n = 0; n < 4; n++) {
          const a = n * Math.PI / 2;
          piece(decor, 'ball', '#f7f1d1', [x - side * 0.17 + Math.cos(a) * 0.12, y + 0.02 + Math.sin(a) * 0.12, -3.33], [0.075, 0.045, 0.04], [0, 0, a]);
        }
      }
    }
  }
  scene.add(merge(decor));

  const pond = new THREE.Group();
  piece(pond, 'box', '#115b50', [0, -7.5, -2.5], [40, 8, 0.2]);
  for (let i = 0; i < 12; i++) piece(pond, 'box', i % 2 ? '#3e9b82' : '#7cc5a1', [-5 + i * 0.9, -3.54 - (i % 3) * 0.16, -2.28], [0.55, 0.025, 0.025], null, true);
  scene.add(merge(pond));
  const dustPositions = new Float32Array(95 * 3);
  for (let i = 0; i < 95; i++) dustPositions.set([Math.sin(i * 2.399963) * (1.2 + i % 5), -2 + (i * 37 % 240) / 10, -2.5 - (i % 4) * 0.4], i * 3);
  const dustGeometry = new THREE.BufferGeometry(); dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMaterial = new THREE.PointsMaterial({ color: '#e6f4bc', size: 0.055, transparent: true, opacity: 0.6, depthWrite: false });
  const dust = new THREE.Points(dustGeometry, dustMaterial); scene.add(dust); ownedGeometry.add(dustGeometry); ownedMaterial.add(dustMaterial);

  const maxPads = Math.max(...LEVELS.map(level => level.pads.length));
  const maxStamps = Math.max(...LEVELS.map(level => level.stamps.length));
  const batches = new Map(), object = new THREE.Object3D(), transform = new THREE.Matrix4(), tint = new THREE.Color();
  function instance(name, model, capacity, x, y, z, sx = 1, sy = sx, sz = sx, angle = 0, color = '#ffffff') {
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
    object.position.set(x, y, z); object.rotation.set(0, 0, angle); object.scale.set(sx, sy, sz); object.updateMatrix();
    transform.multiplyMatrices(object.matrix, batch.base); tint.set(color);
    for (const mesh of batch.meshes) { mesh.setMatrixAt(batch.count, transform); mesh.setColorAt(batch.count, tint); }
    batch.count++;
  }

  function leafShape() {
    const shape = new THREE.Shape();
    shape.moveTo(-1, -0.12); shape.bezierCurveTo(-0.72, 0.04, 0.48, 0.04, 1, -0.12);
    shape.bezierCurveTo(0.60, -0.36, -0.55, -0.38, -1, -0.12); shape.closePath();
    return shape;
  }
  const leafGeometry = new THREE.ExtrudeGeometry(leafShape(), { depth: 0.12, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 2, steps: 1, curveSegments: 4 });
  ownedGeometry.add(leafGeometry);
  const padParts = new THREE.Group();
  const leafOutline = new THREE.Mesh(leafGeometry, material('#144637')); leafOutline.position.z = 0.01; padParts.add(leafOutline);
  const leafFill = new THREE.Mesh(leafGeometry, material('#70cf8d')); leafFill.scale.set(0.94, 0.72, 0.5); leafFill.position.set(0, -0.025, 0.16); padParts.add(leafFill);
  piece(padParts, 'box', '#b5edb3', [0, -0.12, 0.23], [1.36, 0.022, 0.018], null, true);
  for (const side of [-1, 1]) piece(padParts, 'box', '#a8e7aa', [side * 0.33, -0.15, 0.23], [0.35, 0.016, 0.015], [0, 0, side * 0.28], true);
  const padModel = merge(padParts);
  // During a forecast, a moving leaf may be in a different place when the
  // frog arrives. A faint dashed silhouette explains that future position.
  const ghostGeometry = new THREE.BufferGeometry().setFromPoints(leafShape().getPoints(16).map(point => new THREE.Vector3(point.x, point.y, 0)));
  const ghostMaterial = new THREE.LineDashedMaterial({ color: '#e1fff0', dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.85, depthWrite: false });
  const futureOutline = new THREE.LineLoop(ghostGeometry, ghostMaterial); futureOutline.computeLineDistances(); futureOutline.visible = false; scene.add(futureOutline);
  const ghostFillMaterial = new THREE.MeshBasicMaterial({ color: '#bdffe5', transparent: true, opacity: 0.2, depthWrite: false });
  const futureFill = new THREE.Mesh(leafGeometry, ghostFillMaterial); futureFill.visible = false; scene.add(futureFill);
  ownedGeometry.add(ghostGeometry); ownedMaterial.add(ghostMaterial); ownedMaterial.add(ghostFillMaterial);
  const arrowParts = new THREE.Group();
  piece(arrowParts, 'box', '#d5f1b6', [0, 0, 0], [0.48, 0.025, 0.02], null, true);
  for (const side of [-1, 1]) piece(arrowParts, 'cone', '#d5f1b6', [side * 0.29, 0, 0], [0.07, 0.15, 0.035], [0, 0, side * -Math.PI / 2], true);
  const arrowModel = merge(arrowParts);
  const flagParts = new THREE.Group();
  piece(flagParts, 'box', '#f8edc6', [0, 0.22, 0], [0.035, 0.46, 0.035], null, true);
  piece(flagParts, 'diamond', '#ffd46c', [0.105, 0.41, 0], [0.14, 0.105, 0.04], null, true);
  const flagModel = merge(flagParts);
  const flowerParts = new THREE.Group();
  for (let n = 0; n < 5; n++) {
    const a = n * Math.PI * 2 / 5;
    piece(flowerParts, 'ball', '#fff4d4', [Math.cos(a) * 0.11, Math.sin(a) * 0.11, 0], [0.10, 0.065, 0.035], [0, 0, a], true);
  }
  piece(flowerParts, 'ball', '#ffd36b', [0, 0, 0.045], [0.065, 0.065, 0.025], null, true);
  const flowerModel = merge(flowerParts);

  const stampParts = new THREE.Group();
  piece(stampParts, 'box', '#7d533f', [0, 0, 0], [0.48, 0.33, 0.10]);
  piece(stampParts, 'box', '#fff1c7', [0, 0.01, 0.07], [0.40, 0.25, 0.06]);
  for (const side of [-1, 1]) piece(stampParts, 'box', '#d78860', [side * 0.095, 0.03, 0.11], [0.24, 0.025, 0.02], [0, 0, side * -0.42], true);
  piece(stampParts, 'ball', '#f17f58', [0, -0.075, 0.12], [0.045, 0.045, 0.025], null, true);
  const stampModel = merge(stampParts);
  const boxParts = new THREE.Group();
  piece(boxParts, 'box', '#76523a', [0, 0.32, 0], [0.46, 0.62, 0.27]);
  piece(boxParts, 'box', '#f3a45c', [0, 0.36, 0.16], [0.37, 0.49, 0.08]);
  piece(boxParts, 'box', '#fff4ca', [0, 0.43, 0.21], [0.25, 0.12, 0.025], null, true);
  piece(boxParts, 'box', '#d4764f', [0, 0.66, 0.06], [0.55, 0.10, 0.32], null, true);
  piece(boxParts, 'box', '#f9d477', [0.28, 0.59, 0.04], [0.04, 0.40, 0.04], null, true);
  piece(boxParts, 'diamond', '#ffd974', [0.38, 0.73, 0.04], [0.13, 0.10, 0.035], null, true);
  const mailboxModel = merge(boxParts);

  // The frog's feet are at local y=0, exactly the physics' landing height.
  const frog = new THREE.Group();
  piece(frog, 'ball', '#683f35', [0, 0.34, 0], [0.47, 0.37, 0.26]);
  piece(frog, 'ball', '#f49b57', [0, 0.39, 0.09], [0.42, 0.32, 0.23]);
  piece(frog, 'ball', '#ffd396', [0, 0.22, 0.29], [0.25, 0.15, 0.055]);
  for (const side of [-1, 1]) {
    piece(frog, 'ball', '#d77849', [side * 0.31, 0.09, 0.10], [0.18, 0.10, 0.16]);
    piece(frog, 'ball', '#744236', [side * 0.22, 0.61, 0.09], [0.155, 0.14, 0.13]);
    piece(frog, 'ball', '#fff4d4', [side * 0.22, 0.64, 0.20], [0.112, 0.105, 0.065]);
    piece(frog, 'ball', '#263c35', [side * 0.22, 0.64, 0.264], [0.046, 0.061, 0.025], null, true);
    piece(frog, 'ball', '#ffffff', [side * 0.23 - 0.012, 0.67, 0.286], [0.014, 0.018, 0.009], null, true);
  }
  const smileGeometry = new THREE.TorusGeometry(0.095, 0.014, 5, 12, Math.PI).rotateZ(Math.PI);
  const smile = new THREE.Mesh(smileGeometry, material('#714239', true)); smile.position.set(0, 0.32, 0.315); frog.add(smile); ownedGeometry.add(smileGeometry);
  piece(frog, 'box', '#9f6344', [0.30, 0.28, 0.25], [0.28, 0.24, 0.08], [0, 0, -0.12]);
  piece(frog, 'box', '#fff0c8', [0.30, 0.29, 0.30], [0.22, 0.18, 0.035], [0, 0, -0.12]);
  piece(frog, 'ball', '#eb8057', [0.30, 0.27, 0.326], [0.035, 0.035, 0.012], null, true);
  scene.add(frog);

  const dotModel = new THREE.Mesh(geometry('ball'), material('#ffffff', true));
  const sparkleModel = new THREE.Mesh(geometry('diamond'), material('#ffffff', true));
  const ringGeometry = new THREE.RingGeometry(0.80, 1, 32);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
  const ringModel = new THREE.Mesh(ringGeometry, ringMaterial); ownedGeometry.add(ringGeometry); ownedMaterial.add(ringMaterial);
  const fxColors = { launch: '#d8f4d3', landing: '#b5f2e1', perfect: '#ffdf77', stamp: '#ffe9a2', splash: '#a1e3dc', recover: '#b8ead1', win: '#ffe08a' };
  const pulseTypes = new Set(['landing', 'perfect', 'splash', 'recover', 'win']);
  const empty = [];

  let width = 0, height = 0, pixelRatio = 0, viewHeight = 10, focusY = null, lastVisual = 0, currentLevel = 0;
  const projection = new THREE.Vector3(), padBuffer = {};
  function resize(force = false) {
    const nextWidth = Math.max(1, container.clientWidth), nextHeight = Math.max(1, container.clientHeight);
    const density = Math.min(globalThis.devicePixelRatio || 1, touch ? 1.35 : 2, Math.sqrt((touch ? 420000 : 1500000) / (nextWidth * nextHeight)));
    if (!force && width === nextWidth && height === nextHeight && Math.abs(pixelRatio - density) < 0.0001) return;
    width = nextWidth; height = nextHeight; pixelRatio = density;
    const aspect = width / height; viewHeight = Math.max(8.4, 10.8 / aspect);
    Object.assign(camera, { left: -viewHeight * aspect / 2, right: viewHeight * aspect / 2, top: viewHeight / 2, bottom: -viewHeight / 2 });
    camera.updateProjectionMatrix(); renderer.setPixelRatio(density); renderer.setSize(width, height, false); resized?.();
  }
  function positionCamera(y) {
    camera.position.set(0, y + 2.8, 25); camera.lookAt(0, y, 0); camera.updateMatrixWorld(true);
  }
  function project(pointOrX, y, depth = 0) {
    const x = typeof pointOrX === 'object' ? pointOrX.x : pointOrX;
    const worldY = typeof pointOrX === 'object' ? pointOrX.y : y;
    const worldDepth = typeof pointOrX === 'object' && Number.isFinite(y) ? y : depth;
    projection.set(x, worldY, worldDepth).project(camera);
    return { x: (projection.x + 1) * width / 2, y: (1 - projection.y) * height / 2 };
  }
  function dragVector(dx, dy) {
    let vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, dx * 0.12));
    let vy = Math.max(-MAX_SPEED, Math.min(MAX_VY, -dy * 0.12));
    const speed = Math.hypot(vx, vy);
    if (speed > MAX_SPEED) { vx *= MAX_SPEED / speed; vy *= MAX_SPEED / speed; }
    return { vx, vy };
  }
  function contextLost(event) { event.preventDefault(); lost?.(); }
  function contextRestored() { resize(true); restored?.(); }
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  renderer.domElement.addEventListener('webglcontextrestored', contextRestored);
  resize(); positionCamera(0); const observer = new ResizeObserver(() => resize()); observer.observe(container);

  function render(state, visualTime = 0, preview = null) {
    const animated = !reduced.matches, level = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, (state.level || 1) - 1))];
    const player = state.player, tick = state.ticks || 0;
    const checkpoint = level.pads[state.checkpoint] || level.pads[0];
    getPadPosition(checkpoint, tick, padBuffer);
    const desired = Math.max(player.y, padBuffer.y) + viewHeight * 0.16;
    const dt = Math.max(0, Math.min(0.1, visualTime - (lastVisual || visualTime))); lastVisual = visualTime;
    if (currentLevel !== level.id || focusY === null) { currentLevel = level.id; focusY = desired; }
    else if (state.mode !== 'aiming') focusY += (desired - focusY) * (animated ? 1 - Math.exp(-dt * 5) : 1);
    positionCamera(focusY);
    dust.position.x = animated ? Math.sin(visualTime * 0.38) * 0.09 : 0;
    dust.material.opacity = animated ? 0.48 + Math.sin(visualTime * 1.3) * 0.12 : 0.55;
    for (const batch of batches.values()) batch.count = 0;
    for (const pad of level.pads) {
      const position = getPadPosition(pad, tick, padBuffer), x = position.x, y = position.y, scaleX = position.width / 2;
      const current = pad.id === state.padId, next = pad.id === Math.min(level.goalPad, state.padId + 1);
      const color = current ? '#ecffd8' : next ? '#f3ffdb' : '#d3f2d0';
      instance('pads', padModel, maxPads, x, y, 0, scaleX, 1, 1, 0, color);
      if (pad.amplitude && !current) instance('padArrows', arrowModel, maxPads, x, y - 0.43, 0.32);
      if (next) instance('flags', flagModel, maxPads, x - position.width * 0.36, y + 0.03, 0.35);
      if (pad.id % 3 === 2 && pad.id !== level.goalPad) instance('flowers', flowerModel, maxPads, x + position.width * 0.30, y + 0.10, 0.32, 0.75);
      if (pad.id === level.goalPad) instance('mailbox', mailboxModel, 1, x + position.width * 0.31, y + 0.02, 0.28, 0.8);
    }
    for (const stamp of state.stamps || empty) {
      if (stamp.collected) continue;
      const float = animated ? Math.sin(visualTime * 2.8 + stamp.id) * 0.045 : 0;
      instance('stamps', stampModel, maxStamps, stamp.x, stamp.y + float, 0.45, 0.85, 0.85, 0.85, animated ? Math.sin(visualTime * 2 + stamp.id) * 0.08 : 0);
    }
    let squash = 0;
    if (animated) for (const fx of state.effects || empty) if ((fx.type === 'landing' || fx.type === 'perfect') && fx.age < 0.24) squash = Math.max(squash, Math.sin(fx.age / 0.24 * Math.PI) * 0.16);
    frog.position.set(player.x, player.y, 0.58);
    frog.scale.set(1 + squash, 1 - squash, 1);
    frog.rotation.z = animated && state.mode === 'flying' ? -Math.max(-0.22, Math.min(0.22, player.vx / 50)) : 0;

    // Preview points and the landing marker are the core's actual prediction,
    // including future motion of the target leaf and changing wind.
    futureFill.visible = futureOutline.visible = false;
    if (preview?.points?.length) {
      const points = preview.points, stride = Math.max(1, Math.ceil(points.length / 128));
      const freshLanding = preview.landing && !state.landed.includes(preview.landing.padId);
      const targetColor = preview.landing ? !freshLanding ? '#a5d8e1' : preview.landing.perfect ? '#ffe27b' : '#bff4b8' : '#ff9d88';
      const targetPad = preview.landing && level.pads[preview.landing.padId];
      if (targetPad?.amplitude && Number.isFinite(preview.arrivalTick)) {
        const currentX = getPadPosition(targetPad, tick, padBuffer).x;
        const future = getPadPosition(targetPad, preview.arrivalTick, padBuffer);
        if (Math.abs(future.x - currentX) > 0.05) {
          futureFill.visible = futureOutline.visible = true;
          futureFill.position.set(future.x, future.y, 0.31); futureOutline.position.set(future.x, future.y, 0.46);
          futureFill.scale.set(future.width / 2, 1, 1); futureOutline.scale.set(future.width / 2, 1, 1);
        }
      }
      for (let i = 1; i < points.length; i += stride) {
        const point = points[i], size = 0.065 + 0.025 * i / points.length;
        instance('previewDots', dotModel, 128, point.x, point.y + 0.12, 0.75, size, size, size, 0, i > points.length * 0.72 ? targetColor : '#fff6d7');
      }
      const target = preview.landing || points[points.length - 1];
      instance('previewMark', ringModel, 1, target.x, target.y + 0.12, 0.78, 0.18, 0.18, 0.18, 0, targetColor);
      if (freshLanding && preview.landing.perfect) instance('perfectMark', ringModel, 1, target.x, target.y + 0.12, 0.79, 0.28, 0.28, 0.28, 0, '#ffe8a4');
    }
    for (const fx of state.effects || empty) {
      const t = Math.max(0, Math.min(1, fx.age / (fx.duration || 0.7))), color = fxColors[fx.type] || '#fff2c9';
      const pulse = pulseTypes.has(fx.type);
      if (pulse) {
        const size = animated ? 0.15 + t * (fx.type === 'perfect' || fx.type === 'win' ? 1.05 : 0.65) : 0.42;
        instance('effectRings', ringModel, MAX_EFFECTS * 2, fx.x, fx.y + 0.18, 0.62, size, size * 0.45, size, 0, color);
        if (fx.type === 'perfect') instance('effectRings', ringModel, MAX_EFFECTS * 2, fx.x, fx.y + 0.22, 0.64, size * 0.65, size * 0.3, size, 0, '#fff1bb');
      }
      const count = fx.type === 'win' ? 6 : fx.type === 'perfect' ? 5 : 3;
      for (let i = 0; i < count; i++) {
        const angle = fx.id * 2.399963 + i * Math.PI * 2 / count, distance = animated ? 0.18 + t * (fx.type === 'win' ? 1.3 : 0.75) : 0.35;
        const size = (fx.type === 'perfect' ? 0.09 : 0.075) * (animated ? 1 - t : 0.8);
        instance('sparkles', sparkleModel, MAX_EFFECTS * 6, fx.x + Math.cos(angle) * distance, fx.y + 0.35 + Math.sin(angle) * distance, 0.72, size, size, size, angle, i % 2 ? '#fff4c9' : color);
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
    for (const batch of batches.values()) for (const mesh of batch.meshes) mesh.dispose();
    for (const geometry of [...geometries.values(), ...ownedGeometry]) geometry.dispose();
    for (const mat of [...materials.values(), ...ownedMaterial]) mat.dispose();
    textures.forEach(texture => texture.dispose()); renderer.dispose();
  }
  return { render, resize, project, dragVector, renderer, camera, dispose };
}
