import * as THREE from 'three';

export const FROZEN_ORB_COOLDOWN = 8;
export const FROZEN_ORB_CHILL = 3;
const ORB_SPEED = 10, ORB_LIFE = 1.8, SHARD_SPEED = 12, SHARD_LIFE = .8;
const CAPACITY = 112, STEP = 1 / 60;

/** One piercing orb and a fixed pool of ice shards. All time is combat time. */
export function createFrozenOrb(scene, { low = false, groundH = () => 0, blocked = () => false, hitEnemy = () => {}, onCast } = {}) {
  const root = new THREE.Group(); root.name = 'frozen-orb'; scene.add(root);
  const orb = new THREE.Group(); orb.name = 'frozen-orb-core'; root.add(orb); orb.visible = false;
  const ice = new THREE.MeshBasicMaterial({ color: 0xb5efff, toneMapped: false });
  const glow = new THREE.MeshBasicMaterial({ color: 0x46bfff, transparent: true, opacity: .24, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const rim = new THREE.MeshBasicMaterial({ color: 0xe4fbff, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(.34, low ? 0 : 1), ice);
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(.55, 1), glow);
  const lattice = new THREE.Mesh(new THREE.IcosahedronGeometry(.43, 0), rim); lattice.material = rim.clone(); lattice.material.wireframe = true;
  const ringGeometry = new THREE.TorusGeometry(.63, .018, 4, low ? 20 : 32);
  const rings = [new THREE.Mesh(ringGeometry, rim), new THREE.Mesh(ringGeometry, rim)];
  rings[0].rotation.x = Math.PI / 2; rings[1].rotation.set(.65, .4, .7);
  orb.add(core, shell, lattice, ...rings);
  // Crystalline, tapered silhouettes remain legible without bloom or lights.
  const shardGeometry = new THREE.OctahedronGeometry(1, 0).scale(.075, .075, .34);
  const shardMaterial = new THREE.MeshBasicMaterial({ color: 0xa5eaff, toneMapped: false });
  const shardMesh = new THREE.InstancedMesh(shardGeometry, shardMaterial, CAPACITY);
  shardMesh.name = 'frozen-orb-shards'; shardMesh.frustumCulled = false;
  shardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); shardMesh.visible = false; root.add(shardMesh);
  const slots = Array.from({ length: CAPACITY }, (_, index) => ({ index, active: false, position: new THREE.Vector3(), direction: new THREE.Vector3(), age: 0, damage: 0 }));
  const zero = new THREE.Matrix4().makeScale(0, 0, 0), matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  const forward = new THREE.Vector3(0, 0, 1), direction = new THREE.Vector3(), castOrigin = new THREE.Vector3();
  const from = new THREE.Vector3(), end = new THREE.Vector3(), center = new THREE.Vector3(), relative = new THREE.Vector3(), point = new THREE.Vector3();
  const orbHits = new Set(), burstHits = new Set(), nextShardHit = new Map();
  for (const entry of slots) shardMesh.setMatrixAt(entry.index, zero);
  root.traverse(object => { object.raycast = () => {}; });
  let cooldown = 0, age = 0, clock = 0, nextEmission = .12, emission = 0, disposed = false, activeCount = 0;

  function clear() {
    orb.visible = false; activeCount = 0;
    for (const entry of slots) { entry.active = false; shardMesh.setMatrixAt(entry.index, zero); }
    shardMesh.visible = false; shardMesh.instanceMatrix.needsUpdate = true;
    orbHits.clear(); burstHits.clear(); nextShardHit.clear();
  }
  function reset() { clear(); cooldown = age = clock = 0; }
  function cast(origin, heading) {
    if (disposed || cooldown > 0 || !origin || !heading || ![origin.x, origin.y, origin.z, heading.x, heading.y, heading.z].every(Number.isFinite) || heading.lengthSq() < 1e-8) return false;
    clear(); castOrigin.copy(origin); orb.position.copy(origin); direction.copy(heading).normalize();
    cooldown = FROZEN_ORB_COOLDOWN; age = emission = 0; nextEmission = .12; orb.visible = true;
    orb.rotation.set(0, 0, 0); onCast?.(); return true;
  }
  function emit(count, damage, offset, lift = 0) {
    for (let i = 0; i < count; i++) {
      const entry = slots.find(slot => !slot.active); if (!entry) break;
      const angle = i / count * Math.PI * 2 + offset;
      entry.position.copy(orb.position);
      // A ground impact opens into a low ring of frost rather than burying all
      // horizontal shards in the terrain at their point of creation.
      if (lift) entry.position.y = Math.max(entry.position.y, groundH(entry.position.x, entry.position.z) + lift);
      entry.direction.set(Math.cos(angle), Math.sin(angle * 3 + offset) * .06, Math.sin(angle)).normalize();
      entry.age = 0; entry.damage = damage; entry.active = true; activeCount++;
    }
  }
  function burst() { if (!orb.visible) return; emit(24, 1.5, emission * .43, .65); orb.visible = false; }
  // Return the first blocked distance; a boolean callback conservatively stops
  // at the start of this small simulation segment. Numeric callbacks can supply
  // an exact ray-hit distance so targets in front of cover still take damage.
  function clearDistance(start, finish, length) {
    const obstruction = blocked(start, finish);
    let limit = obstruction === true ? 0 : typeof obstruction === 'number' && Number.isFinite(obstruction) ? Math.max(0, Math.min(length, obstruction)) : length;
    if (finish.y <= groundH(finish.x, finish.z) + .12) {
      let lo = 0, hi = 1;
      for (let i = 0; i < 8; i++) { const t = (lo + hi) / 2; point.copy(start).lerp(finish, t); if (point.y <= groundH(point.x, point.z) + .12) hi = t; else lo = t; }
      limit = Math.min(limit, length * lo);
    }
    return limit;
  }
  function enemyDistance(enemy, start, heading, limit, radius) {
    const size = enemy.scale?.y || 1;
    center.copy(enemy.position); center.y += 1.05 * size;
    relative.subVectors(start, center);
    const r = .72 * size + radius, b = relative.dot(heading), c = relative.lengthSq() - r * r;
    if (c <= 0) return 0;
    const discriminant = b * b - c;
    if (discriminant < 0) return Infinity;
    const distance = -b - Math.sqrt(discriminant);
    return distance >= 0 && distance <= limit ? distance : Infinity;
  }
  function damage(enemy, at, amount, shard) {
    if (enemy.userData.dead) return;
    // Shards that start inside the same large enemy cannot all hit at once.
    if (shard === 'burst') {
      if (burstHits.has(enemy)) return;
      burstHits.add(enemy);
    } else if (shard) {
      if ((nextShardHit.get(enemy) || 0) > clock) return;
      nextShardHit.set(enemy, clock + .16);
    }
    enemy.userData.frostTime = Math.max(enemy.userData.frostTime || 0, FROZEN_ORB_CHILL);
    hitEnemy(enemy, at, amount, castOrigin);
  }
  function update(dt, enemies = [], { motion = true } = {}) {
    if (disposed || !Number.isFinite(dt) || dt <= 0) return;
    cooldown = Math.max(0, cooldown - dt);
    if (!orb.visible && !activeCount) { clock += dt; return; }
    let remaining = dt;
    // Swept segments plus small fixed steps keep terrain, shard emission and
    // collision order consistent even if a caller supplies a long frame.
    while (remaining > 1e-8 && (orb.visible || activeCount)) {
      const h = Math.min(STEP, remaining); remaining -= h; clock += h;
      if (orb.visible) {
        const advance = Math.min(h, ORB_LIFE - age), travel = ORB_SPEED * advance;
        from.copy(orb.position); end.copy(from).addScaledVector(direction, travel);
        const limit = clearDistance(from, end, travel);
        for (const enemy of enemies) {
          if (enemy.userData.dead || orbHits.has(enemy)) continue;
          const distance = enemyDistance(enemy, from, direction, limit, .34);
          if (limit > 0 && distance !== Infinity && distance < limit + 1e-8) { point.copy(from).addScaledVector(direction, distance); orbHits.add(enemy); damage(enemy, point, 2.5, false); }
        }
        orb.position.copy(from).addScaledVector(direction, limit); age += advance;
        if (limit < travel - 1e-8 || age >= ORB_LIFE - 1e-8) burst();
        else if (age >= nextEmission) { emit(8, .7, emission++ * .43); nextEmission += .18; }
      }
      for (const entry of slots) {
        if (!entry.active) continue;
        const advance = Math.min(h, SHARD_LIFE - entry.age), travel = SHARD_SPEED * advance;
        from.copy(entry.position); end.copy(from).addScaledVector(entry.direction, travel);
        const limit = clearDistance(from, end, travel); let nearest = null, nearestDistance = Infinity;
        for (const enemy of enemies) {
          if (enemy.userData.dead) continue;
          const distance = enemyDistance(enemy, from, entry.direction, limit, .09);
          if (limit > 0 && distance < nearestDistance) { nearestDistance = distance; nearest = enemy; }
        }
        if (nearest) { point.copy(from).addScaledVector(entry.direction, nearestDistance); damage(nearest, point, entry.damage, entry.damage === 1.5 ? 'burst' : 'trail'); }
        entry.position.copy(from).addScaledVector(entry.direction, limit); entry.age += advance;
        if (nearest || limit < travel - 1e-8 || entry.age >= SHARD_LIFE - 1e-8) { entry.active = false; activeCount--; }
      }
    }
    clock += remaining;
    if (orb.visible) {
      core.rotation.set(motion ? age * 1.6 : 0, motion ? age * 2.4 : 0, .3);
      lattice.rotation.set(.2, motion ? -age * 1.5 : 0, .7);
      rings[0].rotation.z = motion ? age * 2.2 : 0; rings[1].rotation.y = motion ? age * 1.9 : .4;
      shell.scale.setScalar(motion ? 1 + Math.sin(age * 12) * .06 : 1);
    }
    for (const entry of slots) {
      if (entry.active) {
        rotation.setFromUnitVectors(forward, entry.direction);
        const fade = Math.min(1, (SHARD_LIFE - entry.age) / .18);
        scale.set(fade, fade, .6 + fade * .4); matrix.compose(entry.position, rotation, scale); shardMesh.setMatrixAt(entry.index, matrix);
      } else shardMesh.setMatrixAt(entry.index, zero);
    }
    shardMesh.visible = activeCount > 0; shardMesh.instanceMatrix.needsUpdate = true;
  }
  return {
    cast, update, clear, reset, capacity: CAPACITY,
    get state() { return { cooldown, ready: !disposed && cooldown === 0, active: orb.visible, shards: activeCount, position: orb.position.toArray() }; },
    dispose() { if (disposed) return; clear(); disposed = true; root.removeFromParent(); for (const geometry of [core.geometry, shell.geometry, lattice.geometry, ringGeometry, shardGeometry]) geometry.dispose(); for (const material of [ice, glow, rim, lattice.material, shardMaterial]) material.dispose(); shardMesh.dispose(); },
  };
}
