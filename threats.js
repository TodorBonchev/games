import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const ACID_RADIUS = 2.6;
export const ACID_WARNING = 1.4;
export const ACID_DURATION = 2.6;
const CAPACITY = 3, SEGMENTS = 40;

/** Three reusable ground threats and one shared projectile draw, no lights. */
export function createAcidThreats(scene, { groundH }) {
  const root = new THREE.Group(); root.name = 'acid-threats'; scene.add(root);
  const warningMaterial = new THREE.MeshBasicMaterial({ color: 0xb6f89b, transparent: true, opacity: .20,
    depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false });
  const poolMaterial = new THREE.MeshBasicMaterial({ color: 0x87dc4d, transparent: true, opacity: .46,
    depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false });
  const acidTime = { value: 0 };
  poolMaterial.onBeforeCompile = shader => {
    shader.uniforms.acidTime = acidTime;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vAcid;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAcid=position.xz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vAcid;uniform float acidTime;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      vec2 p=vAcid*3.2;float cells=sin(p.x+sin(p.y*1.3+acidTime*.5))*sin(p.y-sin(p.x+acidTime*.4));
      float ripple=pow(max(0.,sin(length(vAcid)*10.-acidTime*2.)),10.);
      float foam=smoothstep(.62,.92,cells);
      diffuseColor.rgb*=.50+cells*.15;
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.64,.98,.25),foam*.78+ripple*.20);
      diffuseColor.a*=.78+foam*.22;`);
  };
  const rimMaterial = new THREE.MeshBasicMaterial({ color: 0xd4ff9c, transparent: true, opacity: .95,
    depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, polygonOffset: true, polygonOffsetFactor: -3, toneMapped: false });
  const orbMaterial = new THREE.MeshBasicMaterial({ color: 0xcbff86, toneMapped: false });
  const orb = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.16, 0), orbMaterial, CAPACITY);
  orb.name = 'acid-projectiles'; orb.frustumCulled = false; orb.instanceMatrix.setUsage(THREE.DynamicDrawUsage); orb.visible = false; root.add(orb);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0), matrix = new THREE.Matrix4(), at = new THREE.Vector3();
  const slots = Array.from({ length: CAPACITY }, (_, index) => {
    const group = new THREE.Group(); group.visible = false; root.add(group);
    const discGeometry = new THREE.CircleGeometry(ACID_RADIUS, SEGMENTS).rotateX(-Math.PI / 2);
    const rimGeometry = new THREE.RingGeometry(ACID_RADIUS - .065, ACID_RADIUS, SEGMENTS).rotateX(-Math.PI / 2);
    const fill = new THREE.Mesh(discGeometry, warningMaterial), rim = new THREE.Mesh(rimGeometry, rimMaterial);
    fill.renderOrder = 3; rim.renderOrder = 4; fill.frustumCulled = rim.frustumCulled = false; group.add(fill, rim);
    const originals = [discGeometry, rimGeometry].map(g => new Float32Array(g.attributes.position.array));
    orb.setMatrixAt(index, zero);
    return { index, group, fill, rim, originals, position: group.position, origin: new THREE.Vector3(), age: 0, tick: 0, active: false, owner: null };
  });
  root.traverse(object => { object.raycast = () => {}; });
  let disposed = false, hitCooldown = 0, time = 0;
  function remove(entry) { entry.active = entry.group.visible = false; entry.owner = null; orb.setMatrixAt(entry.index, zero); }
  function clear() { for (const entry of slots) remove(entry); orb.visible = false; hitCooldown = 0; orb.instanceMatrix.needsUpdate = true; }
  function launch(position, origin, owner = null) {
    if (disposed || !position || !origin || ![position.x, position.z, origin.x, origin.y, origin.z].every(Number.isFinite)) return false;
    const entry = slots.find(slot => !slot.active); if (!entry) return false;
    entry.active = entry.group.visible = true; entry.age = entry.tick = 0; entry.owner = owner;
    entry.position.set(position.x, groundH(position.x, position.z), position.z); entry.origin.copy(origin);
    for (const [i, mesh] of [entry.fill, entry.rim].entries()) {
      const attr = mesh.geometry.attributes.position, original = entry.originals[i];
      for (let vertex = 0; vertex < attr.count; vertex++) {
        const x = original[vertex * 3], z = original[vertex * 3 + 2];
        attr.setXYZ(vertex, x, groundH(position.x + x, position.z + z) - entry.position.y + .09, z);
      }
      attr.needsUpdate = true;
    }
    entry.fill.material = warningMaterial; entry.fill.geometry.setDrawRange(0, 0);
    matrix.makeTranslation(origin.x, origin.y, origin.z); orb.setMatrixAt(entry.index, matrix); orb.instanceMatrix.needsUpdate = true; orb.visible = true;
    return true;
  }
  function update(dt, player, motion = true) {
    if (disposed) return 0;
    time += dt; acidTime.value = motion ? time : 0;
    hitCooldown = Math.max(0, hitCooldown - dt);
    let damage = 0, projectiles = false;
    for (const entry of slots) {
      if (!entry.active) continue;
      if (entry.age < ACID_WARNING && entry.owner?.userData?.dead) { remove(entry); continue; }
      entry.age += dt;
      if (entry.age >= ACID_WARNING + ACID_DURATION) { remove(entry); continue; }
      if (entry.age < ACID_WARNING) {
        const progress = entry.age / ACID_WARNING;
        entry.fill.geometry.setDrawRange(0, Math.ceil(progress * SEGMENTS) * 3);
        at.copy(entry.origin).lerp(entry.position, progress); at.y += Math.sin(progress * Math.PI) * 3 + .12;
        matrix.makeTranslation(at.x, at.y, at.z); orb.setMatrixAt(entry.index, matrix); projectiles = true;
      } else {
        entry.fill.material = poolMaterial; entry.fill.geometry.setDrawRange(0, SEGMENTS * 3); orb.setMatrixAt(entry.index, zero);
        entry.tick -= dt;
        if (entry.tick <= 0) {
          entry.tick += .5;
          // Damage never stacks across overlapping pools in the same tick.
          if (Math.hypot(player.x - entry.position.x, player.z - entry.position.z) < ACID_RADIUS && player.y - groundH(player.x, player.z) < .65) damage = Math.max(damage, 6);
        }
      }
    }
    orb.visible = projectiles; orb.instanceMatrix.needsUpdate = true;
    if (damage && hitCooldown <= 0) { hitCooldown = .48; return damage; }
    return 0;
  }
  return {
    launch, update, clear, capacity: CAPACITY,
    get active() { return slots.filter(slot => slot.active).map(slot => ({ position: slot.position.toArray(), age: slot.age, warning: slot.age < ACID_WARNING, radius: ACID_RADIUS })); },
    get available() { return slots.some(slot => !slot.active); },
    cancel(owner) { for (const entry of slots) if (entry.active && entry.owner === owner && entry.age < ACID_WARNING) remove(entry); orb.instanceMatrix.needsUpdate = true; orb.visible = slots.some(entry => entry.active && entry.age < ACID_WARNING); },
    dispose() { if (disposed) return; clear(); disposed = true; root.removeFromParent(); for (const slot of slots) { slot.fill.geometry.dispose(); slot.rim.geometry.dispose(); } orb.dispose(); orb.geometry.dispose(); for (const material of [warningMaterial, poolMaterial, rimMaterial, orbMaterial]) material.dispose(); },
  };
}

/** A single merged, vertex-colored spore pack gives the ranged enemy its shape. */
export function createSpitterAccent(parent, zombie) {
  const parts = [], color = new THREE.Color();
  const add = (geometry, hex, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry; if (g !== geometry) geometry.dispose();
    g.scale(sx, sy, sz).translate(x, y, z); color.setHex(hex);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); g.clearGroups(); parts.push(g);
  };
  add(new THREE.IcosahedronGeometry(.35, 1), 0x285a46, 0, .60, -.32, 1.35, 1.1, .95);
  for (const [x, y, z, size] of [[-.27, .78, -.30, .18], [.26, .63, -.43, .20], [0, .96, -.29, .19], [0, .45, -.57, .15]]) {
    add(new THREE.IcosahedronGeometry(size, 0), 0x96dc60, x, y, z);
    add(new THREE.ConeGeometry(.055, .22, 5), 0xd4ef96, x, y + size, z);
  }
  const geometry = mergeGeometries(parts, false); parts.forEach(g => g.dispose());
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x183207, emissiveIntensity: .3 });
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'spitter-spore-pack'; mesh.userData.root = zombie; parent.add(mesh); return mesh;
}
