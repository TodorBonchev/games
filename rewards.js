import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CAPACITY = 6;
const noRaycast = () => {};
const tint = new THREE.Color();

// Painted parts become a single vertex-coloured mesh. Small markings need no
// extra materials, textures or draw calls, including on the Lambert phone tier.
function painted(geometry, color, position = [0, 0, 0], rotation = [0, 0, 0]) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  g.rotateX(rotation[0]); g.rotateY(rotation[1]); g.rotateZ(rotation[2]);
  g.translate(...position);
  tint.setHex(color);
  const colors = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) tint.toArray(colors, i);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.clearGroups();
  return g;
}
function joined(parts) {
  const result = mergeGeometries(parts, false);
  parts.forEach(g => g.dispose());
  return result;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const rounded = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 1, r);

function medkitGeometry() {
  const parts = [
    painted(rounded(.58, .31, .38, .045), 0xd6e7cd),
    painted(box(.59, .055, .39), 0xeaf0d8, [0, .14, 0]),
    painted(box(.585, .065, .385), 0x255d4c, [0, -.01, 0]),
    painted(box(.23, .045, .07), 0x214b40, [0, .255, 0]),
  ];
  for (const x of [-.25, .25]) parts.push(painted(box(.055, .10, .39), 0x487663, [x, -.12, 0]));
  for (const x of [-.095, .095]) parts.push(painted(box(.04, .085, .07), 0x214b40, [x, .215, 0]));
  return joined(parts);
}
function medkitSymbols() {
  const parts = [];
  for (const z of [-.199, .199]) {
    parts.push(painted(box(.16, .048, .008), 0x76f2b6, [0, 0, z]));
    parts.push(painted(box(.048, .16, .008), 0x76f2b6, [0, 0, z]));
  }
  // A small three-dimensional cross remains identifiable from every approach.
  parts.push(painted(box(.28, .075, .075), 0xb8ffdf, [0, .53, 0]));
  parts.push(painted(box(.075, .28, .075), 0xb8ffdf, [0, .53, 0]));
  parts.push(painted(box(.075, .075, .28), 0xb8ffdf, [0, .53, 0]));
  return joined(parts);
}
function energyGeometry() {
  const parts = [painted(new THREE.CylinderGeometry(.19, .19, .43, 8), 0x244051)];
  for (const y of [-.23, .23]) parts.push(painted(new THREE.CylinderGeometry(.225, .225, .07, 8), 0xd8a44c, [0, y, 0]));
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    parts.push(painted(box(.045, .4, .035), 0x6d8591, [Math.sin(a) * .185, 0, Math.cos(a) * .185], [0, a, 0]));
  }
  return joined(parts);
}
function boltGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(.025, .2); shape.lineTo(-.145, -.015); shape.lineTo(-.025, -.015);
  shape.lineTo(-.075, -.2); shape.lineTo(.145, .045); shape.lineTo(.035, .045); shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: .035, bevelEnabled: false, steps: 1 }).translate(0, 0, -.0175);
}
function energySymbols() {
  const parts = [painted(boltGeometry(), 0xffe9a9, [0, .54, 0])];
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    parts.push(painted(box(.075, .24, .009), 0xffcf6c, [Math.sin(a) * .19, 0, Math.cos(a) * .19], [0, a, 0]));
  }
  return joined(parts);
}
function glowTexture(beam = false) {
  const canvas = document.createElement('canvas');
  canvas.width = beam ? 8 : 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = beam ? ctx.createLinearGradient(0, 0, 0, 64) : ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (beam) {
    gradient.addColorStop(0, 'rgba(255,255,255,0)');
    gradient.addColorStop(.3, 'rgba(255,255,255,.04)');
    gradient.addColorStop(1, 'rgba(255,255,255,.6)');
  } else {
    gradient.addColorStop(0, 'rgba(255,255,255,.03)');
    gradient.addColorStop(.63, 'rgba(255,255,255,.08)');
    gradient.addColorStop(.76, 'rgba(255,255,255,.8)');
    gradient.addColorStop(.86, 'rgba(255,255,255,.12)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
  }
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Pool-owned visuals; gameplay owns collection and expiry. `active` is a live
 * array, so remove entries while iterating backwards. Never pass a pickup's
 * mesh/controller to disposeModel: use remove/clear, or dispose for teardown.
 */
export function createRewardPool(scene, { low = false } = {}) {
  const root = new THREE.Group(); root.name = 'reward-pool'; scene.add(root);
  const bodyMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const iconMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const ringTexture = glowTexture(), beamTexture = glowTexture(true);
  const ringMaterial = new THREE.MeshBasicMaterial({ map: ringTexture, transparent: true, opacity: .72,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, forceSinglePass: true });
  const beamMaterial = new THREE.MeshBasicMaterial({ map: beamTexture, transparent: true, opacity: .2,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, forceSinglePass: true });
  const zero = new THREE.Matrix4().makeScale(0, 0, 0), matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion(), axis = new THREE.Vector3(0, 1, 0), scale = new THREE.Vector3(1, 1, 1), at = new THREE.Vector3();
  const allMeshes = [];
  const instances = (geometry, material, name) => {
    const mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
    mesh.name = name; mesh.frustumCulled = false; mesh.raycast = noRaycast;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < CAPACITY; i++) mesh.setMatrixAt(i, zero);
    mesh.visible = false; root.add(mesh); allMeshes.push(mesh); return mesh;
  };
  const types = {
    medkit: [instances(medkitGeometry(), bodyMaterial, 'medkit-cases'), instances(medkitSymbols(), iconMaterial, 'medkit-crosses')],
    overdrive: [instances(energyGeometry(), bodyMaterial, 'overdrive-cells'), instances(energySymbols(), iconMaterial, 'overdrive-bolts')],
  };
  const ring = instances(new THREE.PlaneGeometry(1.35, 1.35).rotateX(-Math.PI / 2), ringMaterial, 'reward-ground-halos');
  const beam = instances(new THREE.CylinderGeometry(.08, .38, 1.35, low ? 8 : 12, 1, true).translate(0, .7, 0), beamMaterial, 'reward-beacons');
  // Allocate instance colours up front, including while hidden for precompile.
  for (let i = 0; i < CAPACITY; i++) { ring.setColorAt(i, new THREE.Color(0x79e8bd)); beam.setColorAt(i, new THREE.Color(0x79e8bd)); }
  const slots = Array.from({ length: CAPACITY }, (_, index) => {
    const mesh = new THREE.Group(); mesh.name = 'reward-position'; mesh.visible = false; root.add(mesh);
    return { index, id: 0, type: 'medkit', position: mesh.position, mesh, age: 0, used: false };
  });
  const active = []; let nextId = 1, disposed = false, currentTime = 0, currentMotion = true;
  const dirty = () => allMeshes.forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; });
  const visibility = () => {
    for (const [type, meshes] of Object.entries(types)) meshes.forEach(mesh => { mesh.visible = active.some(entry => entry.type === type); });
    ring.visible = beam.visible = active.length > 0;
  };
  function update(dt, time = 0, motion = true) {
    if (disposed || !active.length) return;
    const t = Number.isFinite(time) ? time : 0;
    currentTime = t; currentMotion = motion;
    for (const entry of active) {
      const phase = entry.index * 1.7;
      rotation.setFromAxisAngle(axis, .35 + phase + (motion ? t * .32 : 0));
      at.copy(entry.position); at.y += .47 + (motion ? Math.sin(t * 2.2 + phase) * .035 : 0);
      matrix.compose(at, rotation, scale);
      for (const mesh of types[entry.type]) mesh.setMatrixAt(entry.index, matrix);
      matrix.makeTranslation(entry.position.x, entry.position.y + .045, entry.position.z);
      ring.setMatrixAt(entry.index, matrix); beam.setMatrixAt(entry.index, matrix);
    }
    beamMaterial.opacity = motion ? .18 + Math.sin(t * 1.7) * .025 : .18;
    dirty();
  }
  function remove(id) {
    const index = active.findIndex(entry => entry.id === id);
    if (index < 0) return false;
    const entry = active[index]; entry.used = entry.mesh.visible = false;
    for (const mesh of allMeshes) mesh.setMatrixAt(entry.index, zero);
    active.splice(index, 1); dirty(); visibility(); return true;
  }
  function clear() {
    while (active.length) remove(active[active.length - 1].id);
  }
  return {
    capacity: CAPACITY,
    get active() { return active; },
    spawn(type, position) {
      if (disposed || (type !== 'medkit' && type !== 'overdrive') || !position || ![position.x, position.y, position.z].every(Number.isFinite)) return null;
      const entry = slots.find(slot => !slot.used); if (!entry) return null;
      entry.used = entry.mesh.visible = true; entry.id = nextId++; entry.type = type; entry.age = 0;
      entry.position.copy(position); entry.mesh.userData.rewardType = type;
      const color = tint.setHex(type === 'medkit' ? 0x75e9b5 : 0xffc46c);
      ring.setColorAt(entry.index, color); beam.setColorAt(entry.index, color);
      ring.instanceColor.needsUpdate = beam.instanceColor.needsUpdate = true;
      active.push(entry); visibility(); update(0, currentTime, currentMotion); return entry;
    },
    update, remove, clear,
    dispose() {
      if (disposed) return; clear(); disposed = true; root.removeFromParent();
      allMeshes.forEach(mesh => { mesh.dispose(); mesh.geometry.dispose(); });
      for (const material of [bodyMaterial, iconMaterial, ringMaterial, beamMaterial]) material.dispose();
      ringTexture.dispose(); beamTexture.dispose();
    },
  };
}

/** Owned per enemy: safe for disposeModel, with no shared mutable resources. */
export function createEliteAccent(zombie, commander = false, { low = false } = {}) {
  const head = zombie.userData.head, torso = head?.parent?.parent || zombie;
  const armorMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const markerMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const owned = [], eyeColors = []; let disposed = false, time = 0;
  const dark = commander ? 0x353e49 : 0x344b49, gold = commander ? 0xd3a65b : 0xa4b76f;
  const add = (parent, parts, material = armorMaterial, name = 'elite-armor') => {
    const mesh = new THREE.Mesh(joined(parts), material); mesh.name = name;
    mesh.userData.root = zombie; mesh.castShadow = !low; parent.add(mesh); owned.push(mesh); return mesh;
  };
  add(torso, [painted(rounded(.41, .3, .07, .025), dark, [0, .51, .224]),
    painted(box(.055, .28, .078), gold, [-.12, .52, .23], [0, 0, -.18]),
    painted(box(.055, .28, .078), gold, [.12, .52, .23], [0, 0, .18]),
    painted(box(.095, .08, .085), 0xeac878, [0, .58, .24])]);
  for (let i = 0; i < (zombie.userData.arms || []).length; i++) {
    const arm = zombie.userData.arms[i], s = i ? 1 : -1;
    add(arm, [painted(rounded(commander ? .29 : .24, .16, .25, .035), dark, [s * .015, -.025, 0]),
      painted(box(commander ? .3 : .25, .035, .26), gold, [s * .015, .045, 0]),
      painted(new THREE.ConeGeometry(.035, commander ? .15 : .08, 4), gold, [s * .09, .13, 0])]);
  }
  if (head) {
    const crown = [painted(new THREE.TorusGeometry(.19, .025, 5, 16), gold, [0, .17, 0], [Math.PI / 2, 0, 0])];
    const count = commander ? 5 : 3;
    for (let i = 0; i < count; i++) {
      const a = i / count * Math.PI * 2;
      crown.push(painted(new THREE.ConeGeometry(.045, commander ? .18 : .11, 4), gold,
        [Math.sin(a) * .175, commander ? .26 : .225, Math.cos(a) * .175]));
    }
    add(head, crown, armorMaterial, commander ? 'commander-crown' : 'elite-circlet');
    head.traverse(child => {
      if ((child.isMesh && child.material?.isMeshBasicMaterial) || child.isSprite) {
        const material = child.material;
        if (material.color && !eyeColors.some(entry => entry.material === material)) {
          eyeColors.push({ material, color: material.color.clone() }); material.color.setHex(0xffbb55);
          if (material.isMeshBasicMaterial) material.color.multiplyScalar(2);
        }
      }
    });
  }
  const marks = [];
  for (let i = 0; i < (commander ? 2 : 1); i++) for (const s of [-1, 1])
    marks.push(painted(box(.23, .055, .055), 0xffd38b, [s * .085, 2.55 + i * .16, 0], [0, 0, s * .55]));
  const marker = add(zombie, marks, markerMaterial, commander ? 'commander-marker' : 'elite-marker');
  marker.raycast = noRaycast; marker.castShadow = false;
  return {
    update(dt, motion = true) {
      if (disposed) return; time += Math.max(0, dt || 0);
      marker.rotation.y = motion ? Math.sin(time * 1.2) * .12 : 0;
      marker.position.y = motion ? Math.sin(time * 2) * .025 : 0;
    },
    dispose() {
      if (disposed) return; disposed = true;
      for (const mesh of owned) { mesh.removeFromParent(); mesh.geometry.dispose(); }
      armorMaterial.dispose(); markerMaterial.dispose();
      for (const { material, color } of eyeColors) material.color.copy(color);
    },
  };
}

// Angle-major triangles let a progress wedge fill using drawRange alone. Four
// radial bands sample the terrain once per slam rather than rebuilding a disk.
function warningDisk(segments = 48, bands = 4) {
  const vertices = [];
  const point = (angle, radius) => [Math.sin(angle) * radius, 0, Math.cos(angle) * radius];
  for (let i = 0; i < segments; i++) for (let band = 0; band < bands; band++) {
    const a = i / segments * Math.PI * 2, b = (i + 1) / segments * Math.PI * 2;
    const p0 = point(a, band / bands), p1 = point(b, band / bands);
    const p2 = point(a, (band + 1) / bands), p3 = point(b, (band + 1) / bands);
    vertices.push(...p0, ...p2, ...p1, ...p1, ...p2, ...p3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3).setUsage(THREE.DynamicDrawUsage));
  return geometry;
}

/** The full danger radius stays visible from progress 0, including reduced motion. */
export function createSlamWarning(scene, { groundH = null } = {}) {
  const root = new THREE.Group(); root.name = 'commander-slam-warning'; root.visible = false; scene.add(root);
  const fillGeometry = warningDisk(), rimGeometry = new THREE.RingGeometry(.969, 1, 64).rotateX(-Math.PI / 2);
  rimGeometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  const fillMaterial = new THREE.MeshBasicMaterial({ color: 0xff593f, transparent: true, opacity: .23,
    side: THREE.DoubleSide, forceSinglePass: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false });
  const rimMaterial = new THREE.MeshBasicMaterial({ color: 0xff9670, transparent: true, opacity: .9,
    side: THREE.DoubleSide, forceSinglePass: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, toneMapped: false });
  const fill = new THREE.Mesh(fillGeometry, fillMaterial), rim = new THREE.Mesh(rimGeometry, rimMaterial);
  for (const mesh of [fill, rim]) { mesh.frustumCulled = false; mesh.raycast = noRaycast; root.add(mesh); }
  fill.renderOrder = 3; rim.renderOrder = 4;
  const originals = [new Float32Array(fillGeometry.attributes.position.array), new Float32Array(rimGeometry.attributes.position.array)];
  const lastPosition = new THREE.Vector3(Infinity, Infinity, Infinity); let lastRadius = 0, disposed = false;
  function conform(position, radius) {
    root.position.copy(position);
    [fillGeometry, rimGeometry].forEach((geometry, index) => {
      const attribute = geometry.attributes.position, original = originals[index];
      for (let i = 0; i < attribute.count; i++) {
        const x = original[i * 3] * radius, z = original[i * 3 + 2] * radius;
        const y = groundH ? groundH(position.x + x, position.z + z) - position.y : 0;
        attribute.setXYZ(i, x, y + .075, z);
      }
      attribute.needsUpdate = true;
    });
    lastPosition.copy(position); lastRadius = radius;
  }
  return {
    get visible() { return root.visible; },
    show(position, radius, progress) {
      if (disposed || !position || ![position.x, position.y, position.z, radius, progress].every(Number.isFinite) || radius <= 0) return;
      if (!lastPosition.equals(position) || radius !== lastRadius) conform(position, radius);
      const p = THREE.MathUtils.clamp(progress, 0, 1);
      fillGeometry.setDrawRange(0, Math.ceil(p * 48) * 4 * 6);
      fillMaterial.opacity = p >= 1 ? .38 : .17 + p * .1;
      rimMaterial.color.setHex(p >= 1 ? 0xffedbc : 0xff9670);
      root.visible = true;
    },
    hide() { root.visible = false; },
    dispose() {
      if (disposed) return; disposed = true; root.removeFromParent();
      fillGeometry.dispose(); rimGeometry.dispose(); fillMaterial.dispose(); rimMaterial.dispose();
    },
  };
}
