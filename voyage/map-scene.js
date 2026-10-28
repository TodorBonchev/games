import * as THREE from 'three';
import { CHAPTERS } from './progress.js';

// The map is a single small world. Restored homes, recruited neighbours and
// lighthouse beams are driven entirely by the adventure's saved mission IDs.
// The owner calls render(progress, timeInSeconds); this module owns no loop.
export function createVoyageMap(container, { onSelect = () => {}, onLost = () => {}, onRestored = () => {} } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'low-power' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor('#76bac2');
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y;';
  container.append(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-10, 10, 12, -12, .1, 100);
  camera.position.set(3, 26, 27); camera.lookAt(0, .3, -1.25); camera.updateMatrixWorld();
  scene.add(new THREE.HemisphereLight('#fff3dc', '#508f9b', 2.1));
  const sun = new THREE.DirectionalLight('#fff1cf', 2.4); sun.position.set(-9, 16, 8); scene.add(sun);

  const centers = [new THREE.Vector3(-3.9, 0, 5), new THREE.Vector3(3.9, 0, 2.8), new THREE.Vector3(-4.1, 0, -.8), new THREE.Vector3(3.5, 0, -3.8), new THREE.Vector3(-1.4, 0, -8.1)];
  const grass = ['#99c587', '#bddba1', '#b5cbb9', '#c6b9d9', '#8ea9cb'];
  const roof = ['#e99d7b', '#dfb766', '#bd82a8', '#b398d8', '#a9c9d6'];
  const crewColors = ['#f7c88c', '#a7cbdc', '#f2b2c0', '#c8d68c', '#d1b4de'];
  const geometries = {
    ball: new THREE.SphereGeometry(1, 10, 7),
    rock: new THREE.DodecahedronGeometry(1, 0),
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 9),
    cone: new THREE.ConeGeometry(1, 1, 7),
    ring: new THREE.TorusGeometry(1, .025, 4, 32),
    sail: new THREE.BufferGeometry(),
  };
  geometries.sail.setAttribute('position', new THREE.Float32BufferAttribute([-.68, 0, 0, 0, 1.28, 0, .68, 0, 0], 3));
  geometries.sail.computeVertexNormals();
  const matte = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .92, flatShading: true, side: THREE.DoubleSide });
  const lightMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const beamMaterial = new THREE.MeshBasicMaterial({ color: '#ffe6a0', transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide });
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: '#397e92', transparent: true, opacity: .2, depthWrite: false });
  const entries = new Map(), batches = [];
  const transform = new THREE.Object3D(), group = new THREE.Object3D(), matrix = new THREE.Matrix4(), color = new THREE.Color();
  function part(kind, tint, x, y, z, sx = 1, sy = sx, sz = sx, details = {}) {
    const key = details.beam ? 'beam' : details.glow ? 'glow' : details.shadow ? 'shadow' : kind;
    if (!entries.has(key)) entries.set(key, { geometry: geometries[kind], material: details.beam ? beamMaterial : details.glow ? lightMaterial : details.shadow ? shadowMaterial : matte, objects: [] });
    const entry = { tint, x, y, z, sx, sy, sz, rx: 0, ry: 0, rz: 0, ...details };
    entries.get(key).objects.push(entry); return entry;
  }
  const at = (i, kind, tint, x, y, z, sx = 1, sy = sx, sz = sx, details = {}) => part(kind, tint, centers[i].x + x, y, centers[i].z + z, sx, sy, sz, { island: i, ...details });
  part('cylinder', '#76bac2', 0, -1.15, 0, 60, .2, 60);
  // Low relief sea ripples and tiny drifting islets make the water feel alive.
  for (let n = 0; n < 24; n++) {
    const x = Math.sin(n * 7.13) * 10, z = Math.cos(n * 5.73) * 12;
    if (centers.some(c => Math.hypot(c.x - x, c.z - z) < 3)) continue;
    part('box', '#a2d2d1', x, -.99, z, .5 + n % 3 * .25, .015, .045, { ry: -.25 });
  }
  for (const [x, z, s] of [[-7.6, 2.3, .45], [7.5, -1, .55], [3.3, -9.8, .38], [-.5, 7.9, .32]]) {
    part('rock', '#c8d7bb', x, -.65, z, s, .58, s * 1.3);
    part('cone', '#689b85', x, .03, z, s * .5, .7, s * .5);
  }

  // Cream stepping lights form a single continuous voyage, with gold sections
  // behind the player and quiet blue sections where the fog has yet to lift.
  for (let i = 0; i < 4; i++) {
    const a = centers[i], b = centers[i + 1], dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz), nx = -dz / length, nz = dx / length;
    for (let n = 0; n < 24; n++) {
      const t = (n + .5) / 24, bend = Math.sin(t * Math.PI) * (i % 2 ? -.6 : .6);
      const x = a.x + dx * t + nx * bend, z = a.z + dz * t + nz * bend;
      if (Math.hypot(x - a.x, z - a.z) < 2.05 || Math.hypot(x - b.x, z - b.z) < 2.05) continue;
      part('cylinder', '#eff0c7', x, -.97, z, .065, .025, .065, { route: i });
    }
  }

  for (let i = 0; i < 5; i++) {
    const chapter = CHAPTERS[i];
    at(i, 'cylinder', '#467f90', .05, -1, .12, 2.5, .02, 2.22, { shadow: true });
    at(i, 'rock', '#d5c3a5', 0, -.15, 0, 2.26, 1.3, 2.08, { terrain: true, ry: .4 + i });
    at(i, 'cylinder', grass[i], 0, .52, 0, 2.08, .47, 1.9, { terrain: true, ry: .24 + i });
    at(i, 'cylinder', '#e9d8ae', .06, .77, .22, .55, .035, 1.27, { ry: -.22 });
    at(i, 'ring', '#b6e3dc', 0, -.91, 0, 2.6, 2.31, 1, { rx: Math.PI / 2, ripple: i });
    at(i, 'ring', '#9ad3d2', 0, -.93, 0, 2.92, 2.58, 1, { rx: Math.PI / 2, ripple: i + 1 });
    // A little dock points toward the next crossing.
    for (let n = 0; n < 5; n++) at(i, 'box', '#bc9170', 1.35 + n * .22, .38, .95, .19, .12, .7, { ry: -.18 });
    for (const z of [.6, 1.3]) at(i, 'cylinder', '#8b725f', 2.25, .35, z, .07, .65, .07);
    // Lighthouse: the exact same tower changes from asleep to golden.
    at(i, 'cylinder', '#fff0d2', 0, 1.48, -.15, .27, 1.45, .27);
    at(i, 'cylinder', roof[i], 0, 1.15, -.15, .28, .21, .28);
    at(i, 'cylinder', '#fff3d9', 0, 2.15, -.15, .48, .11, .48);
    at(i, 'cylinder', '#637d88', 0, 2.45, -.15, .29, .5, .29);
    at(i, 'ball', '#ffdf87', 0, 2.46, -.15, .29, .25, .29, { glow: true, lamp: true });
    for (const [x, z] of [[-.23, -.23], [.23, -.23], [-.23, .23], [.23, .23]]) at(i, 'cylinder', '#f4e6c6', x, 2.46, -.15 + z, .035, .47, .035);
    at(i, 'cone', roof[i], 0, 2.84, -.15, .54, .45, .54);
    at(i, 'ball', '#f6e6b6', 0, 3.13, -.15, .075);
    at(i, 'cone', '#ffe6a0', 0, 4.0, -.15, 1.0, 2.9, 1, { beam: true, requiresLit: true, rx: Math.PI });
    // Two established little trees keep an unvisited island inviting.
    for (const [x, z, s] of [[-1.3, -1.1, .85], [1, -1.2, .62]]) {
      at(i, 'cylinder', '#9e8168', x, .98, z, .065, .56, .065);
      at(i, 'cone', i === 4 ? '#8ca6c5' : '#80ac91', x, 1.45, z, .43 * s, 1.1 * s, .43 * s, { terrain: true });
      at(i, 'cone', i === 4 ? '#adc1d6' : '#a1c4a0', x, 1.75, z, .3 * s, .7 * s, .3 * s, { terrain: true });
    }
    // Every mission restores one distinct detail, and its neighbour joins the
    // island. There are no currency counters detached from the visible world.
    for (let m = 0; m < 5; m++) {
      const a = .35 + m * Math.PI * 2 / 5, x = Math.cos(a) * 1.32, z = Math.sin(a) * 1.23, mission = chapter.missions[m];
      at(i, 'cylinder', '#c9c9aa', x, .78, z, .31, .04, .31, { missing: mission });
      const condition = { mission };
      if (m === 0 || m === 2) {
        at(i, 'box', m === 0 ? '#fff1cd' : '#f3d4bd', x, 1, z, .57, .48, .5, condition);
        at(i, 'cone', roof[i], x, 1.42, z, .48, .47, .43, { ...condition, ry: Math.PI / 4 });
        at(i, 'box', '#687b8a', x, .97, z + .258, .15, .27, .02, condition);
        at(i, 'box', '#ffdf93', x - .17, 1.09, z + .26, .1, .1, .02, condition);
      } else if (m === 1) {
        at(i, 'cylinder', '#9c8267', x, 1.08, z, .085, .67, .085, condition);
        at(i, 'ball', '#adc68b', x, 1.52, z, .42, .42, .39, condition);
        for (let k = 0; k < 4; k++) at(i, 'ball', '#efaf7f', x + Math.cos(k * 1.7) * .29, 1.53 + Math.sin(k * 2) * .18, z + .25, .09, .09, .09, condition);
      } else if (m === 3) {
        at(i, 'box', '#bc9072', x, 1, z, .64, .13, .43, condition);
        at(i, 'box', '#eeb69b', x, 1.43, z, .75, .12, .55, { ...condition, rz: -.1 });
        for (const dx of [-.28, .28]) at(i, 'cylinder', '#c7a484', x + dx, 1.18, z, .04, .6, .04, condition);
        for (const dx of [-.18, 0, .18]) at(i, 'ball', '#e8d788', x + dx, 1.14, z + .13, .07, .1, .07, condition);
      } else {
        at(i, 'cylinder', '#cbb3a1', x, .9, z, .31, .25, .31, condition);
        for (let n = 0; n < 5; n++) {
          const f = n * Math.PI * 2 / 5;
          at(i, 'ball', '#f0b9ca', x + Math.cos(f) * .19, 1.18, z + Math.sin(f) * .19, .16, .08, .16, condition);
        }
        at(i, 'ball', '#ffe5a0', x, 1.23, z, .12, .08, .12, condition);
      }
      const cx = x * .66, cz = z * .7 + .14;
      at(i, 'ball', crewColors[m], cx, .96, cz, .13, .2, .12, condition);
      at(i, 'ball', '#f6d4b0', cx, 1.17, cz, .14, .13, .13, condition);
      for (const dx of [-.07, .07]) {
        at(i, 'ball', crewColors[m], cx + dx, 1.3, cz, .045, .085, .045, condition);
        at(i, 'ball', '#40556a', cx + dx * .65, 1.19, cz + .117, .018, .022, .016, condition);
      }
    }
  }

  // The captain and their patchwork sail are always visible beside the
  // selected island. This same boat carries the player through the campaign.
  function aboard(kind, tint, x, y, z, sx, sy = sx, sz = sx, more = {}) { return part(kind, tint, x, y, z, sx, sy, sz, { boat: true, ...more }); }
  aboard('ball', '#9c6f58', 0, -.67, 0, .54, .25, .83);
  aboard('box', '#e3c69d', 0, -.49, 0, .68, .1, 1.24);
  for (const x of [-.37, .37]) aboard('box', '#c0916f', x, -.4, 0, .11, .2, 1.13);
  aboard('cylinder', '#a08365', 0, .3, -.25, .045, 1.6, .045);
  aboard('sail', '#fff0c9', 0, .05, -.25, 1, 1, 1);
  aboard('sail', '#eaa68f', 0, .08, -.265, .55, .55, .55, { ry: Math.PI });
  aboard('ball', '#e8b46e', 0, -.17, .32, .2, .29, .18);
  aboard('ball', '#f4d2a9', 0, .12, .35, .21, .2, .19);
  for (const x of [-.12, .12]) {
    aboard('ball', '#efbc98', x, .29, .34, .07, .14, .065);
    aboard('ball', '#3c5268', x * .65, .15, .511, .027, .037, .02);
  }
  aboard('cylinder', '#7b9b97', 0, .29, .37, .24, .045, .23);
  aboard('cone', '#7b9b97', 0, .39, .35, .2, .22, .19);
  aboard('ball', '#f7d88b', .12, -.9, .91, .1, .1, .13, { wake: true });

  // The festival is staged in this same restored world. Paper lanterns rise
  // between the islands; reduced-motion callers can render a still time of 0.
  for (let n = 0; n < 20; n++) {
    const i = n % 5, a = n * 2.39996, x = centers[i].x + Math.cos(a) * 1.8, z = centers[i].z + Math.sin(a) * 1.8;
    const details = { lantern: n };
    part('box', n % 2 ? '#ffdf9b' : '#f2b89a', x, 0, z, .18, .24, .18, details);
    part('ball', '#fff2b2', x, -.04, z, .095, .13, .095, { ...details, glow: true });
    part('box', '#d29f76', x, -.13, z, .19, .025, .19, details);
  }

  for (const entry of entries.values()) {
    const mesh = new THREE.InstancedMesh(entry.geometry, entry.material, entry.objects.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
    scene.add(mesh); batches.push({ mesh, objects: entry.objects });
  }

  const labels = [], textures = [];
  for (let i = 0; i < 5; i++) {
    const image = document.createElement('canvas'); image.width = 384; image.height = 112;
    const texture = new THREE.CanvasTexture(image); texture.colorSpace = THREE.SRGBColorSpace; textures.push(texture);
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, transparent: true });
    const sprite = new THREE.Sprite(material); sprite.position.copy(centers[i]).add(new THREE.Vector3(0, .6, 2.2)); sprite.scale.set(3.1, .9, 1); sprite.renderOrder = 3; scene.add(sprite);
    labels.push({ image, texture, sprite, last: '' });
  }

  let width = 0, height = 0, disposed = false, lost = false, latest = null, latestTime = 0, pointer = null, locked = [false, true, true, true, true];
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.78), hit = new THREE.Vector3();
  function paintLabel(i, count, selected, isLocked) {
    const label = labels[i], signature = `${count}/${selected}/${isLocked}`; if (label.last === signature) return; label.last = signature;
    const ctx = label.image.getContext('2d'); ctx.clearRect(0, 0, 384, 112);
    ctx.fillStyle = selected ? '#fff0c9' : '#eaf2dd'; ctx.globalAlpha = isLocked ? .68 : .96;
    ctx.beginPath(); ctx.roundRect(4, 5, 376, 102, 28); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = '#355366'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 27px sans-serif';
    const title = `${i + 1} · ${CHAPTERS[i].title}`;
    ctx.fillText(title, 192, 39, 346);
    ctx.font = '700 21px sans-serif'; ctx.fillStyle = isLocked ? '#667f85' : '#6d8067';
    ctx.fillText(isLocked ? 'NEXT ON YOUR VOYAGE' : count >= 3 ? `${count}/5 FRIENDS · BEACON LIT` : `${count}/5 FRIENDS · HELP 3 TO SAIL`, 192, 76, 346);
    label.texture.needsUpdate = true;
  }
  function resize() {
    if (disposed) return;
    const rect = container.getBoundingClientRect(); width = Math.max(1, Math.round(rect.width)); height = Math.max(1, Math.round(rect.height));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35, Math.sqrt(420000 / (width * height))));
    renderer.setSize(width, height, false);
    // Fit all five islands and their labels, regardless of a phone's rotation.
    let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity; const v = new THREE.Vector3();
    const include = (x, y, z) => { v.set(x, y, z).applyMatrix4(camera.matrixWorldInverse); left = Math.min(left, v.x); right = Math.max(right, v.x); bottom = Math.min(bottom, v.y); top = Math.max(top, v.y); };
    for (const center of centers) {
      for (const dx of [-2.4, 2.4]) for (const dz of [-2.25, 2.9]) include(center.x + dx, .4, center.z + dz);
      for (const dx of [-.8, .8]) include(center.x + dx, 5.5, center.z);
      include(center.x + 3.6, 1.4, center.z + 2);
    }
    const aspect = width / height, halfWidth = Math.max((right - left) / 2, (top - bottom) / 2 * aspect) * 1.04;
    const cx = (left + right) / 2, cy = (top + bottom) / 2;
    camera.left = cx - halfWidth; camera.right = cx + halfWidth; camera.top = cy + halfWidth / aspect; camera.bottom = cy - halfWidth / aspect; camera.updateProjectionMatrix();
    pointer = null;
    if (latest && !lost) render(latest, latestTime);
  }
  function render(progress = {}, time = 0) {
    if (disposed || lost) return;
    latest = progress;
    const completed = progress.completed instanceof Set ? progress.completed : new Set(Array.isArray(progress.completed) ? progress.completed : []);
    const counts = CHAPTERS.map(chapter => chapter.missions.filter(id => completed.has(id)).length);
    locked = counts.map((_, i) => i > 0 && counts.slice(0, i).some(count => count < 3));
    const selected = Math.max(0, Math.min(4, Number.isInteger(progress.chapter) ? progress.chapter : 0));
    const seconds = Number.isFinite(time) ? time : 0;
    latestTime = seconds;
    group.position.copy(centers[selected]).add(new THREE.Vector3(2.8, Math.sin(seconds * 1.8) * .045, 1.25));
    group.rotation.set(0, -.35, Math.sin(seconds * 1.4) * .035); group.updateMatrix();
    for (const batch of batches) {
      batch.objects.forEach((p, n) => {
        const lit = p.island !== undefined && counts[p.island] >= 3;
        const visible = (!p.mission || completed.has(p.mission)) && (!p.missing || !completed.has(p.missing)) && (!p.requiresLit || lit) && (p.lantern === undefined || progress.celebrating === true);
        transform.position.set(p.x, p.y, p.z); transform.rotation.set(p.rx, p.ry, p.rz);
        if (p.lantern !== undefined) {
          transform.position.y += 1.1 + ((seconds * .28 + p.lantern * .41) % 3.5);
          transform.position.x += Math.sin(seconds * .5 + p.lantern) * .13;
          transform.rotation.z = Math.sin(seconds * .65 + p.lantern) * .1;
        }
        const ripple = p.ripple !== undefined ? 1 + Math.sin(seconds * .55 + p.ripple) * .025 : 1;
        transform.scale.set(visible ? p.sx * ripple : 0, visible ? p.sy * ripple : 0, visible ? p.sz : 0); transform.updateMatrix();
        if (p.boat) matrix.multiplyMatrices(group.matrix, transform.matrix); else matrix.copy(transform.matrix);
        batch.mesh.setMatrixAt(n, matrix);
        color.set(p.tint);
        if (p.terrain && locked[p.island]) color.lerp(new THREE.Color('#7899a6'), .49);
        if (p.lamp) color.set(lit ? '#fff1a6' : '#637d88');
        if (p.route !== undefined) color.set(counts[p.route] >= 3 ? '#ffdf98' : '#b7d7d5');
        batch.mesh.setColorAt(n, color);
      });
      batch.mesh.instanceMatrix.needsUpdate = true; if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = true;
    }
    for (let i = 0; i < 5; i++) paintLabel(i, counts[i], selected === i, locked[i]);
    renderer.render(scene, camera);
  }
  function down(event) { if (!event.isPrimary || event.button !== 0) return; pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }; }
  function up(event) {
    const start = pointer; pointer = null;
    if (!start || start.id !== event.pointerId || Math.hypot(start.x - event.clientX, start.y - event.clientY) > 12 || lost) return;
    const rect = canvas.getBoundingClientRect(); ndc.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    raycaster.setFromCamera(ndc, camera); if (!raycaster.ray.intersectPlane(plane, hit)) return;
    let closest = -1, distance = 2.35;
    for (let i = 0; i < centers.length; i++) { const d = Math.hypot(hit.x - centers[i].x, hit.z - centers[i].z); if (d < distance) { closest = i; distance = d; } }
    if (closest >= 0 && !locked[closest]) onSelect(closest);
  }
  function cancel() { pointer = null; }
  function contextLost(event) { event.preventDefault(); lost = true; pointer = null; onLost(); }
  function contextRestored() { lost = false; resize(); if (latest) render(latest, 0); onRestored(); }
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', cancel); canvas.addEventListener('pointerleave', cancel);
  canvas.addEventListener('webglcontextlost', contextLost); canvas.addEventListener('webglcontextrestored', contextRestored);
  const observer = new ResizeObserver(resize); observer.observe(container); resize();
  function project(index) {
    const point = centers[index]?.clone(); if (!point) return null;
    point.y = .78; point.project(camera); const rect = canvas.getBoundingClientRect();
    return { x: rect.left + (point.x + 1) / 2 * rect.width, y: rect.top + (1 - point.y) / 2 * rect.height };
  }
  function dispose() {
    if (disposed) return; disposed = true; pointer = null; observer.disconnect();
    canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', cancel); canvas.removeEventListener('pointerleave', cancel);
    canvas.removeEventListener('webglcontextlost', contextLost); canvas.removeEventListener('webglcontextrestored', contextRestored);
    for (const geometry of Object.values(geometries)) geometry.dispose();
    for (const material of [matte, lightMaterial, beamMaterial, shadowMaterial]) material.dispose();
    for (const { sprite } of labels) sprite.material.dispose(); for (const texture of textures) texture.dispose();
    for (const { mesh } of batches) mesh.dispose(); scene.clear(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
  }
  return { render, resize, dispose, renderer, camera, project };
}
