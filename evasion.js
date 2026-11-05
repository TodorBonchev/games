export const EVASION_DISTANCE = 3.5;
export const EVASION_DURATION = .22;
export const EVASION_COOLDOWN = 4;
export const EVASION_STEP = .15;
const EPSILON = 1e-9;
const smooth = value => value * value * (3 - 2 * value);
const finitePoint = point => point && [point.x, point.y, point.z].every(Number.isFinite);

/** The caller owns simulation time, input permissions and the world. */
export function createEvasion() {
  let active = false, cooldown = 0, elapsed = 0, directionX = 0, directionZ = 0;
  function cancel() { active = false; elapsed = directionX = directionZ = 0; }
  return {
    request(direction, { allowed = false, grounded = false } = {}) {
      if (!allowed || !grounded || active || cooldown > 0 || !Number.isFinite(direction?.x) || !Number.isFinite(direction?.z)) return false;
      const length = Math.hypot(direction.x, direction.z);
      if (!Number.isFinite(length) || length < EPSILON) return false;
      directionX = direction.x / length; directionZ = direction.z / length;
      active = true; elapsed = 0; cooldown = EVASION_COOLDOWN;
      return true;
    },
    update(dt) {
      const delta = { x: 0, z: 0 };
      if (!Number.isFinite(dt) || dt <= 0) return delta;
      cooldown = Math.max(0, cooldown - dt); if (cooldown < EPSILON) cooldown = 0;
      if (!active) return delta;
      const before = elapsed / EVASION_DURATION;
      elapsed = Math.min(EVASION_DURATION, elapsed + dt);
      const distance = EVASION_DISTANCE * (smooth(elapsed / EVASION_DURATION) - smooth(before));
      delta.x = directionX * distance; delta.z = directionZ * distance;
      if (elapsed >= EVASION_DURATION - EPSILON) { active = false; elapsed = EVASION_DURATION; }
      return delta;
    },
    cancel,
    reset() { cancel(); cooldown = 0; },
    restore(value) { cancel(); cooldown = Number.isFinite(value) ? Math.max(0, Math.min(EVASION_COOLDOWN, value)) : 0; },
    get state() { return { active, ready: !active && cooldown === 0, cooldown, progress: elapsed / EVASION_DURATION }; },
  };
}

/**
 * Traverse short ground steps, preserving the caller's collision sliding.
 * resolve(from,to) mutates to; callbacks use plain coordinate objects.
 * A blocked result stops the remaining dash, rather than moving across a cliff
 * or spending later steps trying to escape through a solid obstacle.
 */
export function moveEvasion(position, delta, { resolve = () => {}, surfaceAt = () => position.y, safeAt = () => true } = {}) {
  if (!finitePoint(position) || !Number.isFinite(delta?.x) || !Number.isFinite(delta?.z)) return { blocked: true, distance: 0 };
  const length = Math.hypot(delta.x, delta.z);
  if (length < EPSILON) return { blocked: false, distance: 0 };
  // Only one dash can be consumed per update; reject accidental unbounded
  // input before allocating a long sweep or teleporting the player.
  if (length > EVASION_DISTANCE + EPSILON) return { blocked: true, distance: 0 };
  const steps = Math.ceil(length / EVASION_STEP), stepX = delta.x / steps, stepZ = delta.z / steps;
  const stepLength = length / steps, unitX = delta.x / length, unitZ = delta.z / length;
  let distance = 0;
  for (let step = 0; step < steps; step++) {
    const from = { x: position.x, y: position.y, z: position.z }, to = { x: position.x + stepX, y: position.y, z: position.z + stepZ };
    const supported = point => {
      const height = surfaceAt(point.x, point.z, from.y + .5);
      if (!Number.isFinite(height) || height - from.y > .5 + EPSILON || from.y - height > 1.2 + EPSILON || !safeAt(point.x, point.z, height)) return false;
      point.y = height; return true;
    };
    if (!supported(to) || resolve(from, to) === false || !finitePoint(to) || !supported(to)) return { blocked: true, distance };
    const dx = to.x - position.x, dz = to.z - position.z, traveled = Math.hypot(dx, dz);
    // Collision skin may move a point by a millimeter. A larger depenetration
    // is not a valid dash step and must not become a shortcut through scenery.
    if (traveled > stepLength + .025 || dx * unitX + dz * unitZ <= EPSILON) return { blocked: true, distance };
    position.x = to.x; position.y = to.y; position.z = to.z; distance += traveled;
  }
  return { blocked: false, distance };
}
