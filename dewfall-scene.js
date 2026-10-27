import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LEVELS, BOARD_RADIUS } from './dewfall-game.js';

export function createDewfallScene(container, { resized, lost, restored } = {}) {
  const touch = matchMedia('(pointer: coarse)').matches, reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ antialias: !touch, powerPreference: 'low-power', alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setClearColor('#cfe9ee');
  renderer.domElement.setAttribute('aria-hidden', 'true'); container.prepend(renderer.domElement);
  const scene = new THREE.Scene(), garden = new THREE.Group(); scene.add(garden);
  const camera = new THREE.OrthographicCamera(-7, 7, 7, -7, .1, 80); camera.position.set(0, 17, 10.5); camera.lookAt(0, -.05, 0);
  scene.add(new THREE.HemisphereLight('#fffaff', '#8eb8cd', 1.65));
  const sun = new THREE.DirectionalLight('#ffffff', 1.55); sun.position.set(-8, 14, 8); scene.add(sun);
  const geometries = new Map(), materials = new Map(), extraGeometries = new Set(), textures = [];
  function geometry(type) {
    if (!geometries.has(type)) geometries.set(type, type === 'sphere' ? new THREE.SphereGeometry(1, 16, 12)
      : type === 'cylinder' ? new THREE.CylinderGeometry(1, 1, 1, 64)
      : type === 'ring' ? new THREE.TorusGeometry(1, .065, 7, 64)
      : type === 'box' ? new THREE.BoxGeometry(1, 1, 1)
      : type === 'cone' ? new THREE.ConeGeometry(1, 1, 12)
      : new THREE.CircleGeometry(1, 40));
    return geometries.get(type);
  }
  function material(color, flat = false) {
    const key = `${color}:${flat}`;
    if (!materials.has(key)) materials.set(key, flat ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshPhongMaterial({ color, shininess: 55, specular: '#667a89' }));
    return materials.get(key);
  }
  function piece(group, type, color, position, scale, rotation, flat = false) {
    const part = new THREE.Mesh(geometry(type), material(color, flat)); part.position.set(...position); part.scale.set(...scale);
    if (rotation) part.rotation.set(...rotation); group.add(part); return part;
  }
  function merge(group) {
    group.updateMatrixWorld(true); const buckets = new Map(), result = new THREE.Group();
    group.traverse(part => {
      if (!part.isMesh) return;
      const g = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone(); g.applyMatrix4(part.matrixWorld);
      if (!buckets.has(part.material)) buckets.set(part.material, []); buckets.get(part.material).push(g);
    });
    for (const [m, parts] of buckets) { const g = mergeGeometries(parts); parts.forEach(p => p.dispose()); extraGeometries.add(g); result.add(new THREE.Mesh(g, m)); }
    return result;
  }
  // A painted miniature meadow, lit by the same sun as the clay and glass.
  const paint = document.createElement('canvas'); paint.width = paint.height = 1024; const ctx = paint.getContext('2d');
  ctx.fillStyle = '#cde6d4'; ctx.fillRect(0, 0, 1024, 1024);
  ctx.strokeStyle = '#fff0d5'; ctx.lineWidth = 160; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(80, 850); ctx.bezierCurveTo(900, 700, 0, 200, 950, 120); ctx.stroke();
  ctx.strokeStyle = '#add2b7'; ctx.lineWidth = 5;
  for (let i = 0; i < 190; i++) {
    const x = 30 + i * 167 % 970, y = 20 + i * 293 % 980;
    ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.quadraticCurveTo(x, y - 10, x + 4, y); ctx.stroke();
    if (i % 5 === 0) { ctx.fillStyle = '#f8fff0'; ctx.beginPath(); ctx.arc(x + 8, y - 7, 3, 0, Math.PI * 2); ctx.fill(); }
  }
  const texture = new THREE.CanvasTexture(paint); texture.colorSpace = THREE.SRGBColorSpace; textures.push(texture);
  const floorMaterial = new THREE.MeshPhongMaterial({ map: texture, shininess: 10 }); materials.set('floor', floorMaterial);
  const floor = new THREE.Mesh(geometry('circle'), floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = .025; floor.scale.setScalar(BOARD_RADIUS); garden.add(floor);
  const island = new THREE.Group();
  piece(island, 'cylinder', '#91c7d3', [0, -.32, 0], [5.44, .6, 5.44]);
  piece(island, 'cylinder', '#d7e9e0', [0, -.04, 0], [5.37, .12, 5.37]);
  piece(island, 'cylinder', '#82afc5', [0, -.63, 0], [4.85, .15, 4.85]);
  piece(island, 'ring', '#f8faf0', [0, .08, 0], [5.32, 5.32, 1.6], [Math.PI / 2, 0, 0]);
  piece(island, 'ring', '#f4cfc1', [0, -.34, 0], [5.42, 5.42, .7], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 34; i++) {
    const a = i * Math.PI * 2 / 34, x = Math.cos(a) * 5.44, z = Math.sin(a) * 5.44;
    piece(island, 'sphere', '#e6f2e9', [x, -.25, z], [.07, .09, .07]);
  }
  garden.add(merge(island));
  // Soft painted contact shadow: no shadow map or post-processing pass.
  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 128; const sc = shadowCanvas.getContext('2d');
  const shadowGradient = sc.createRadialGradient(64, 64, 10, 64, 64, 64); shadowGradient.addColorStop(0, '#5b8fa34d'); shadowGradient.addColorStop(.65, '#5b8fa330'); shadowGradient.addColorStop(1, '#5b8fa300');
  sc.fillStyle = shadowGradient; sc.fillRect(0, 0, 128, 128); const shadowTexture = new THREE.CanvasTexture(shadowCanvas); textures.push(shadowTexture);
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }); materials.set('shadow', shadowMaterial);
  const shadow = new THREE.Mesh(geometry('circle'), shadowMaterial); shadow.rotation.x = -Math.PI / 2; shadow.position.set(.2, -.9, .35); shadow.scale.setScalar(7); scene.add(shadow);

  const perimeter = new THREE.Group();
  for (let i = 0; i < 19; i++) {
    const a = i * 2.399963, r = 5.06, x = Math.cos(a) * r, z = Math.sin(a) * r;
    for (let j = 0; j < 3; j++) {
      const angle = a + (j - 1) * .8;
      piece(perimeter, 'sphere', j % 2 ? '#87bda2' : '#a3cfad', [x + Math.cos(angle) * .12, .08, z + Math.sin(angle) * .12], [.22, .065, .08], [0, -angle, -.14]);
    }
    if (i % 3 === 0) {
      for (let n = 0; n < 5; n++) { const angle = n * Math.PI * 2 / 5; piece(perimeter, 'sphere', '#fffbed', [x + Math.cos(angle) * .12, .18, z + Math.sin(angle) * .12], [.115, .05, .09]); }
      piece(perimeter, 'sphere', '#e9b44e', [x, .21, z], [.07, .06, .07]);
    }
  }
  garden.add(merge(perimeter));

  const models = {};
  const droplet = new THREE.Group();
  piece(droplet, 'sphere', '#39b7df', [0, .29, 0], [.29, .31, .29]);
  piece(droplet, 'sphere', '#a2e9ee', [-.055, .36, .07], [.205, .215, .21]);
  piece(droplet, 'sphere', '#ecfffa', [-.105, .48, .12], [.08, .045, .06], [0, 0, -.5], true);
  piece(droplet, 'sphere', '#ffffff', [.115, .36, .22], [.032, .032, .02], null, true);
  for (const x of [-.075, .075]) piece(droplet, 'sphere', '#28748b', [x, .3, .245], [.025, .035, .016], null, true);
  models.drop = merge(droplet);
  const flowerBase = new THREE.Group();
  piece(flowerBase, 'cylinder', '#c3d7b0', [0, .045, 0], [.68, .065, .68]);
  piece(flowerBase, 'ring', '#fbffe6', [0, .085, 0], [.62, .62, .65], [Math.PI / 2, 0, 0]);
  piece(flowerBase, 'sphere', '#75ac86', [-.24, .15, .02], [.33, .085, .14], [0, -.3, -.25]);
  piece(flowerBase, 'sphere', '#87bc8c', [.24, .15, .1], [.33, .085, .14], [0, -.5, .25]);
  models.base = merge(flowerBase);
  const bud = new THREE.Group();
  for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; piece(bud, 'sphere', '#ffffff', [Math.cos(a) * .18, .27, Math.sin(a) * .18], [.19, .11, .19]); }
  piece(bud, 'sphere', '#fff2b4', [0, .31, 0], [.15, .09, .15]); models.bud = merge(bud);
  const bloom = new THREE.Group();
  for (let i = 0; i < 6; i++) { const a = i * Math.PI * 2 / 6; piece(bloom, 'sphere', '#ffffff', [Math.cos(a) * .34, .56, Math.sin(a) * .34], [.29, .13, .22], [0, -a, 0]); }
  models.bloom = merge(bloom);
  const stem = new THREE.Group();
  piece(stem, 'cylinder', '#6fa27d', [0, .26, 0], [.055, .46, .055]);
  piece(stem, 'sphere', '#ffd471', [0, .62, 0], [.24, .14, .24]);
  for (const x of [-.08, .08]) piece(stem, 'sphere', '#9d7542', [x, .675, .16], [.022, .022, .018], null, true);
  piece(stem, 'sphere', '#fff4bd', [-.07, .725, .03], [.06, .022, .05], null, true); models.stem = merge(stem);
  const pebble = new THREE.Group();
  piece(pebble, 'sphere', '#b3b7c5', [0, .26, 0], [1, .47, 1]);
  piece(pebble, 'sphere', '#d7d4db', [-.18, .49, -.12], [.65, .1, .63]);
  piece(pebble, 'sphere', '#a6bba8', [.4, .25, .35], [.36, .13, .31]); models.rock = merge(pebble);
  const puddle = new THREE.Group();
  piece(puddle, 'circle', '#7394b2', [0, .033, 0], [1, 1, 1], [-Math.PI / 2, 0, 0], true);
  piece(puddle, 'ring', '#b2cccf', [0, .035, 0], [.96, .96, .75], [Math.PI / 2, 0, 0]);
  piece(puddle, 'sphere', '#a8d3dc', [-.3, .035, -.15], [.3, .025, .07]); models.puddle = merge(puddle);
  const spring = new THREE.Group();
  piece(spring, 'sphere', '#db8cad', [0, .08, 0], [.65, .075, .65]);
  piece(spring, 'sphere', '#f0c1cb', [0, .115, 0], [.56, .055, .56]);
  for (let i = 0; i < 2; i++) for (const side of [-1, 1]) piece(spring, 'box', '#fff4de', [side * .13, .18, i * .23 - .13], [.32, .025, .065], [0, -side * .65, 0]);
  models.spring = merge(spring);
  const ring = new THREE.Mesh(geometry('ring'), material('#fff6d5', true)); ring.rotation.x = Math.PI / 2; ring.updateMatrix(); models.ring = ring;
  const spark = new THREE.Mesh(geometry('sphere'), material('#fff5c2', true)); models.spark = spark;
  const batches = new Map(), transform = new THREE.Object3D(), matrix = new THREE.Matrix4(), tint = new THREE.Color();
  function instance(key, model, capacity, x, y, z, scale = 1, color = '#ffffff', rotation = 0, sy = scale) {
    let batch = batches.get(key);
    if (!batch) {
      model.updateMatrix(); batch = { count: 0, base: model.matrix.clone(), meshes: (model.isMesh ? [model] : model.children).map(part => {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, capacity); mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0; mesh.frustumCulled = false;
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3); garden.add(mesh); return mesh;
      }) }; batches.set(key, batch);
    }
    if (batch.count >= capacity) return;
    transform.position.set(x, y, z); transform.scale.set(scale, sy, scale); transform.rotation.set(0, rotation, 0); transform.updateMatrix(); matrix.multiplyMatrices(transform.matrix, batch.base); tint.set(color);
    for (const mesh of batch.meshes) { mesh.setMatrixAt(batch.count, matrix); mesh.setColorAt(batch.count, tint); } batch.count++;
  }
  const colors = ['#f39c99', '#bba4e4', '#f4bf67', '#ed9fbb', '#b6c6ec'];
  let lastState, width = 0, height = 0;
  function render(state, time = 0) {
    lastState = state; const level = LEVELS[state.level - 1];
    garden.rotation.set(reduced.matches ? 0 : state.tilt.z * .095, 0, reduced.matches ? 0 : -state.tilt.x * .095);
    for (const batch of batches.values()) batch.count = 0;
    for (const rock of level.rocks) instance('rocks', models.rock, 8, rock.x, .02, rock.z, rock.radius);
    for (const pool of level.puddles) instance('puddles', models.puddle, 5, pool.x, 0, pool.z, pool.radius);
    for (const pad of level.springs) instance('springs', models.spring, 5, pad.x, 0, pad.z, 1);
    for (const flower of state.flowers) {
      const color = colors[flower.id % colors.length];
      instance('flowerBases', models.base, 8, flower.x, 0, flower.z);
      if (flower.filled) {
        const bloomEffect = state.effects.find(e => e.type === 'bloom' && e.x === flower.x && e.z === flower.z);
        const pulse = !reduced.matches && bloomEffect ? 1 + Math.sin(Math.min(1, bloomEffect.age / .4) * Math.PI) * .2 : 1;
        instance('flowers', models.bloom, 8, flower.x, 0, flower.z, pulse, color, flower.id * .6);
        instance('stems', models.stem, 8, flower.x, 0, flower.z, pulse);
      } else instance('buds', models.bud, 8, flower.x, 0, flower.z, 1, color, flower.id * .6);
    }
    for (const ball of state.balls) {
      if (ball.status === 'bloomed') continue;
      const returning = ball.status === 'returning', scale = returning ? Math.max(.08, ball.returnTicks / 42) : 1;
      instance('drops', models.drop, 8, ball.x, returning ? -.04 : .025, ball.z, scale);
      instance('dropShadows', models.ring, 8, ball.x + .06, .022, ball.z + .1, .24 * scale, '#8dbeb3', 0, .35);
    }
    if (!reduced.matches) for (const effect of state.effects) {
      if (effect.type === 'win') continue;
      const progress = effect.age / effect.duration, scale = .25 + progress * .8;
      instance('effects', models.ring, 64, effect.x, .10, effect.z, scale, effect.type === 'spill' ? '#bdd7e6' : '#fff3c0', 0, .5);
      if (effect.type === 'bloom') for (let i = 0; i < 5; i++) {
        const a = i * Math.PI * 2 / 5; instance('sparks', models.spark, 96, effect.x + Math.cos(a) * progress, .3 + Math.sin(progress * Math.PI) * 1.1, effect.z + Math.sin(a) * progress, .065 * (1 - progress));
      }
    }
    for (const batch of batches.values()) for (const mesh of batch.meshes) { mesh.count = batch.count; mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
    renderer.render(scene, camera);
  }
  function resize() {
    const rect = container.getBoundingClientRect(), w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
    if (width === w && height === h) return; width = w; height = h;
    const dpr = Math.min(devicePixelRatio || 1, touch ? 1.35 : 2, Math.sqrt((touch ? 420000 : 1700000) / (w * h)));
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
    const aspect = w / h, viewHeight = Math.max(11.3, 12.0 / aspect);
    camera.left = -viewHeight * aspect / 2; camera.right = viewHeight * aspect / 2; camera.top = viewHeight / 2; camera.bottom = -viewHeight / 2; camera.updateProjectionMatrix();
    resized?.();
  }
  const raycaster = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), point = new THREE.Vector3();
  function project(x, z, y = .05) {
    garden.updateMatrixWorld(true); const p = garden.localToWorld(new THREE.Vector3(x, y, z)).project(camera), rect = container.getBoundingClientRect();
    return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 };
  }
  function pick(clientX, clientY) {
    const rect = container.getBoundingClientRect(); raycaster.setFromCamera({ x: (clientX - rect.left) / rect.width * 2 - 1, y: -(clientY - rect.top) / rect.height * 2 + 1 }, camera);
    garden.updateMatrixWorld(true); plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0).applyQuaternion(garden.quaternion), garden.position);
    if (!raycaster.ray.intersectPlane(plane, point)) return null; garden.worldToLocal(point); return { x: point.x, z: point.z };
  }
  const observer = new ResizeObserver(resize); observer.observe(container); resize();
  const onLost = event => { event.preventDefault(); lost?.(); }, onRestored = () => { resize(); restored?.(); };
  renderer.domElement.addEventListener('webglcontextlost', onLost); renderer.domElement.addEventListener('webglcontextrestored', onRestored);
  return { render, resize, renderer, camera, project, pick, get state() { return lastState; }, dispose() {
    observer.disconnect(); renderer.domElement.removeEventListener('webglcontextlost', onLost); renderer.domElement.removeEventListener('webglcontextrestored', onRestored);
    for (const g of geometries.values()) g.dispose(); for (const g of extraGeometries) g.dispose(); for (const m of materials.values()) m.dispose(); textures.forEach(t => t.dispose()); renderer.dispose(); renderer.domElement.remove();
  } };
}
