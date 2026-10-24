import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const UPLINK_RADIUS = 4.5;
export const UPLINK_SECONDS = 5;

// One reusable station per wave. The device, light strips and terrain ring
// use three draws, no lights, textures, colliders or per-frame allocations.
export function createFieldUplink(scene, groundH) {
  const root = new THREE.Group(); root.name = 'field-uplink'; root.visible = false; scene.add(root);
  const color = new THREE.Color(), parts = [];
  function part(geometry, hex, x, y, z, rotation = 0) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    g.rotateZ(rotation); g.translate(x, y, z); color.setHex(hex);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); g.clearGroups(); parts.push(g);
  }
  part(new THREE.BoxGeometry(.74, .42, .56), 0x3f5657, 0, .52, 0);
  part(new THREE.BoxGeometry(.78, .07, .60), 0xd9bc80, 0, .76, 0);
  part(new THREE.BoxGeometry(.48, .18, .035), 0x132b37, 0, .56, .297);
  part(new THREE.CylinderGeometry(.035, .045, 1.5, 6), 0xd6dccc, .23, 1.45, 0);
  part(new THREE.BoxGeometry(.85, .07, .08), 0x394b4c, .23, 2.17, 0);
  part(new THREE.BoxGeometry(.08, .28, .08), 0xe4ce92, .23, 2.31, 0);
  for (const side of [-1, 1]) {
    part(new THREE.CylinderGeometry(.04, .06, .58, 6), 0x66716a, side * .34, .25, -.12, side * -.40);
    part(new THREE.BoxGeometry(.25, .055, .23), 0xd2ad64, side * .45, .035, -.12);
  }
  part(new THREE.BoxGeometry(.075, .49, .075), 0x66716a, 0, .25, .27);
  const bodyGeometry = mergeGeometries(parts, false); parts.forEach(g => g.dispose());
  const bodyMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial); root.add(body);
  const glowGeometry = new THREE.BoxGeometry(.35, .035, .04);
  const glowMaterial = new THREE.MeshBasicMaterial({ color: 0x9affdf, toneMapped: false });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial); glow.position.set(0, .57, .32); root.add(glow);
  // The outer ring and radial ticks are a single geometry, conformed only
  // when a station moves. It stays visible even with reduced motion enabled.
  const rings = [new THREE.RingGeometry(UPLINK_RADIUS - .07, UPLINK_RADIUS, 64).rotateX(-Math.PI / 2)];
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    rings.push(new THREE.PlaneGeometry(.08, .32).rotateX(-Math.PI / 2).rotateY(a)
      .translate(Math.sin(a) * (UPLINK_RADIUS - .24), 0, Math.cos(a) * (UPLINK_RADIUS - .24)));
  }
  const ringGeometry = mergeGeometries(rings, false); rings.forEach(g => g.dispose());
  const basePositions = new Float32Array(ringGeometry.attributes.position.array);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x78e9df, transparent: true, opacity: .7,
    depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial); ring.frustumCulled = false; root.add(ring);
  root.traverse(object => { object.raycast = () => {}; });
  const position = root.position;
  let active = false, captured = false, progress = 0, inside = false, blocked = false, doneTime = 0, tint = '';
  function reset() { active = captured = inside = blocked = false; progress = doneTime = 0; root.visible = false; tint = ''; }
  function place(point) {
    reset(); position.copy(point); active = root.visible = true;
    const attr = ringGeometry.attributes.position;
    for (let i = 0; i < attr.count; i++) {
      const x = basePositions[i * 3], z = basePositions[i * 3 + 2];
      attr.setXYZ(i, x, groundH(position.x + x, position.z + z) - position.y + .07, z);
    }
    attr.needsUpdate = true; ringGeometry.computeBoundingSphere(); updateColor();
  }
  function updateColor() {
    const next = captured ? 'done' : blocked ? 'blocked' : inside ? 'inside' : 'idle';
    if (next === tint) return; tint = next;
    const hex = captured ? 0xe8c77d : blocked ? 0xffa06b : inside ? 0xc0ffee : 0x64dcd0;
    ringMaterial.color.setHex(hex); glowMaterial.color.setHex(hex);
    ringMaterial.opacity = captured ? .35 : inside ? .95 : .65;
  }
  function update(dt, player, contested = false) {
    if (!active) return false;
    if (captured) { doneTime += dt; if (doneTime > 4) root.visible = false; return false; }
    inside = Math.hypot(player.x - position.x, player.z - position.z) <= UPLINK_RADIUS && Math.abs(player.y - groundH(player.x, player.z)) < 2;
    blocked = inside && contested;
    if (inside && !blocked) progress = Math.min(UPLINK_SECONDS, progress + dt);
    else if (!inside) progress = Math.max(0, progress - dt * .5);
    if (progress >= UPLINK_SECONDS - 1e-7) { progress = UPLINK_SECONDS; captured = true; }
    updateColor(); return captured;
  }
  return {
    position, place, update, reset,
    get state() { return { active, captured, progress, inside, contested: blocked, doneTime, radius: UPLINK_RADIUS, duration: UPLINK_SECONDS }; },
    dispose() { reset(); root.removeFromParent(); for (const mesh of [body, glow, ring]) { mesh.geometry.dispose(); mesh.material.dispose(); } },
  };
}
