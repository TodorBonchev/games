import { worldBearing, relativeBearing } from './combat-awareness.js';

export const ARRIVAL_SECONDS = .65;
export const MELEE_GRACE_SECONDS = .26;
export const ORB_BUFFER_SECONDS = .3;
export const FEEDBACK_CAPACITY = 6;
const names = { walker: 'Walker', runner: 'Runner', brute: 'Brute', fiery: 'Ash walker', spitter: 'Spitter' };
const causes = {
  melee: ['Overrun by a zombie', 'Keep moving sideways during the raised-arm windup. Frozen Orb slows a crowd.'],
  slam: ['Caught in a commander slam', 'Leave the large warning ring before it fills, or jump as the slam lands.'],
  acid: ['Caught in an acid pool', 'Move out of the green target ring before it lands. Defeat the spitter to cancel its incoming shot.'],
  lava: ['Burned by lava', 'Stay on the dark solid ground. A short jetpack burst carries you over lava.'],
  damage: ['Lost in combat', 'Keep some room to retreat, and use Frozen Orb when enemies close in.']
};
const alive = z => z && !z.userData?.dead && z.userData?.hp > 0;
const seconds = dt => Number.isFinite(dt) ? Math.min(.1, Math.max(0, dt)) : 0;

/** Every returned candidate passes the caller's terrain, lava and clearance test. */
export function findSafeSpawn({ position, minRadius = 18, maxRadius = 36, isValid, shoreRadius, random = Math.random }) {
  if (!position || typeof isValid !== 'function') return null;
  const valid = (x, z, distance = 7) => Number.isFinite(x) && Number.isFinite(z) && Math.hypot(x - position.x, z - position.z) >= distance && isValid(x, z);
  for (let i = 0; i < 40; i++) {
    const angle = random() * Math.PI * 2, radius = minRadius + random() * (maxRadius - minRadius);
    const x = position.x + Math.cos(angle) * radius, z = position.z + Math.sin(angle) * radius;
    if (valid(x, z)) return { x, z };
  }
  // A deterministic search makes a bad random sequence harmless and covers the
  // whole island. Never accept the old, unchecked fortieth random fallback.
  for (let ring = 0; ring < 16; ring++) for (let i = 0; i < 96; i++) {
    const angle = i * Math.PI * 2 / 96 + ring * .07;
    const radius = (shoreRadius?.(angle) || 45) * (.08 + ring * .052);
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    if (valid(x, z)) return { x, z };
  }
  return null;
}

/** Soft bounded separation, followed by the game's ordinary scenery collision. */
export function separateEnemies(enemies, dt, constrain = () => {}) {
  const step = seconds(dt); if (!step) return;
  const living = enemies.filter(alive), pushes = new Map(living.map(enemy => [enemy, { x: 0, z: 0 }]));
  for (let i = 0; i < living.length; i++) for (let j = i + 1; j < living.length; j++) {
    const a = living[i], b = living[j];
    if (Math.abs(a.position.y - b.position.y) > 1.8) continue;
    let dx = b.position.x - a.position.x, dz = b.position.z - a.position.z, distance = Math.hypot(dx, dz);
    const clearance = a.userData.elite || b.userData.elite ? 1.15 : .88;
    if (distance >= clearance) continue;
    if (distance < .00001) { const angle = (a.id || i + 1) * 2.39996; dx = Math.cos(angle); dz = Math.sin(angle); }
    else { dx /= distance; dz /= distance; }
    const push = (clearance - distance) * .5, pa = pushes.get(a), pb = pushes.get(b);
    pa.x -= dx * push; pa.z -= dz * push; pb.x += dx * push; pb.z += dz * push;
  }
  for (const [enemy, push] of pushes) {
    const length = Math.hypot(push.x, push.z); if (!length) continue;
    const factor = Math.min(1, step * 1.4 / length);
    enemy.position.x += push.x * factor; enemy.position.z += push.z * factor; constrain(enemy);
  }
}

export function createCombatDirector({ container = globalThis.document?.body, onOrbReady = () => {} } = {}) {
  if (!container?.ownerDocument) throw new TypeError('Combat director needs a DOM container.');
  const doc = container.ownerDocument, element = doc.createElement('div');
  element.id = 'combatDirector'; element.className = 'combat-director'; element.hidden = true;
  const make = (tag, cls, parent = element) => { const node = doc.createElement(tag); node.className = cls; parent.append(node); return node; };
  const target = make('div', 'combat-target'); target.id = 'combatTarget'; target.hidden = true;
  const targetName = make('span', 'combat-target-name', target), targetHealth = make('span', 'combat-target-health', target);
  const targetTrack = make('span', 'combat-target-track', target), targetFill = make('i', 'combat-target-fill', targetTrack);
  targetTrack.setAttribute('role', 'progressbar'); targetTrack.setAttribute('aria-label', 'Target health'); targetTrack.setAttribute('aria-valuemin', '0');
  const last = make('div', 'combat-last'); last.id = 'lastEnemy'; last.hidden = true;
  const lastArrow = make('span', 'combat-last-arrow', last), lastText = make('span', 'combat-last-text', last); lastArrow.textContent = '↑'; lastArrow.setAttribute('aria-hidden', 'true');
  const cover = make('div', 'combat-cover'); cover.id = 'muzzleBlocked'; cover.hidden = true; cover.textContent = 'BARREL BLOCKED · STEP OUT OF COVER';
  const ready = make('div', 'combat-orb-ready'); ready.id = 'orbReadyCue'; ready.hidden = true; ready.textContent = 'FROZEN ORB READY';
  const status = make('span', 'combat-director-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const feedback = Array.from({ length: FEEDBACK_CAPACITY }, () => ({ node: make('span', 'combat-number'), ttl: 0, total: 0, enemy: null, kill: false, age: 0 }));
  const arrivals = Array.from({ length: 5 }, () => { const node = make('span', 'combat-arrival'); node.textContent = '◇ INBOUND'; node.hidden = true; return node; });
  for (const entry of feedback) entry.node.hidden = true;
  container.append(element);
  let disposed = false, meleeGrace = 0, orbBuffer = 0, previousOrb = null, orbCue = 0, coverTime = 0, recentTarget = null, recentTime = 0, selectedTarget = null, damageKind = 'damage', lastCount = 0;
  function clear() {
    element.hidden = true; target.hidden = last.hidden = cover.hidden = ready.hidden = true;
    orbBuffer = coverTime = recentTime = orbCue = 0; selectedTarget = recentTarget = null; status.textContent = '';
    for (const entry of feedback) { entry.ttl = 0; entry.node.hidden = true; }
    for (const node of arrivals) node.hidden = true;
  }
  function reset() { clear(); meleeGrace = 0; previousOrb = null; damageKind = 'damage'; lastCount = 0; }
  function project(position, camera, node, offset = 2.2) {
    if (!position?.clone || !camera) { node.hidden = true; return; }
    const point = position.clone(); point.y += offset; point.project(camera);
    node.hidden = !Number.isFinite(point.x) || point.z < -1 || point.z > 1 || Math.abs(point.x) > .95 || Math.abs(point.y) > .9;
    if (!node.hidden) { node.style.left = `${(point.x + 1) * 50}%`; node.style.top = `${(1 - point.y) * 50}%`; }
  }
  function update(dt, { active = false, combat = true, position, yaw = 0, enemies = [], toSpawn = 0, camera, reducedMotion = false, orbCooldown = 0, castOrb } = {}) {
    if (disposed) return;
    if (!active) { clear(); return; }
    const delta = seconds(dt); element.hidden = false; element.dataset.reducedMotion = String(!!reducedMotion);
    meleeGrace = Math.max(0, meleeGrace - delta); coverTime = Math.max(0, coverTime - delta); recentTime = Math.max(0, recentTime - delta); orbCue = Math.max(0, orbCue - delta);
    if (previousOrb > 0 && orbCooldown <= 0) { orbCue = 1.5; status.textContent = 'Frozen Orb ready.'; onOrbReady(); }
    previousOrb = orbCooldown;
    if (orbBuffer > 0 && orbCooldown <= .00001) { orbBuffer = 0; castOrb?.(); orbCue = 0; }
    else orbBuffer = Math.max(0, orbBuffer - delta);
    ready.hidden = !orbCue; cover.hidden = !coverTime;
    const current = alive(selectedTarget) ? selectedTarget : recentTime && alive(recentTarget) ? recentTarget : null;
    target.hidden = !current || !combat;
    if (current) {
      const u = current.userData, max = Math.max(u.hp, u.maxHp || u.hp);
      targetName.textContent = u.eliteName || names[u.type] || 'Hostile'; targetHealth.textContent = `${Math.max(0, Math.ceil(u.hp))} / ${Math.ceil(max)}`;
      targetFill.style.width = `${Math.max(0, u.hp / max * 100)}%`; targetTrack.setAttribute('aria-valuenow', String(Math.max(0, Math.ceil(u.hp)))); targetTrack.setAttribute('aria-valuemax', String(Math.ceil(max)));
    }
    const living = enemies.filter(alive); last.hidden = !combat || toSpawn > 0 || living.length !== 1 || !position;
    if (!last.hidden) {
      const distance = Math.hypot(living[0].position.x - position.x, living[0].position.z - position.z);
      const bearing = relativeBearing(worldBearing(living[0].position, position), yaw) || 0;
      lastArrow.style.transform = `rotate(${bearing * 180 / Math.PI}deg)`; lastText.textContent = `LAST HOSTILE · ${Math.ceil(distance)}m`;
      last.setAttribute('aria-label', `Last hostile, ${Math.ceil(distance)} meters, ${Math.abs(bearing) < .7 ? 'ahead' : Math.abs(bearing) > 2.4 ? 'behind' : bearing > 0 ? 'right' : 'left'}`);
      if (lastCount !== 1) status.textContent = last.getAttribute('aria-label');
    }
    lastCount = !last.hidden ? 1 : 0;
    for (const entry of feedback) {
      entry.ttl = Math.max(0, entry.ttl - delta); entry.age += delta; entry.node.hidden = !entry.ttl;
      if (!entry.ttl) continue;
      project(entry.position, camera, entry.node, reducedMotion ? 2.6 : 2.6 + entry.age * .4);
      entry.node.textContent = entry.kill ? `−${formatDamage(entry.total)} · ELIMINATED` : `−${formatDamage(entry.total)}`;
      entry.node.classList.toggle('kill', entry.kill); entry.node.style.opacity = reducedMotion ? '1' : String(Math.min(1, entry.ttl / .2));
    }
    const incoming = combat ? living.filter(z => z.userData.arrivalTime > 0).slice(0, arrivals.length) : [];
    arrivals.forEach((node, index) => { node.hidden = true; if (incoming[index]) project(incoming[index].position, camera, node, 2.8); });
  }
  function damage(enemy, amount, killed = false) {
    if (disposed || !enemy || !(amount > 0)) return;
    recentTarget = enemy; recentTime = 1.2;
    // One live label per enemy keeps sustained rifle fire and piercing shards
    // readable instead of stacking several numbers at the same screen point.
    let entry = feedback.find(e => e.ttl > 0 && e.enemy === enemy);
    if (!entry) { entry = feedback.find(e => !e.ttl) || feedback.reduce((a, b) => a.ttl < b.ttl ? a : b); entry.total = 0; entry.kill = false; entry.age = 0; }
    entry.enemy = enemy; entry.position = enemy.position.clone(); entry.total += amount; entry.kill ||= killed; entry.ttl = .75; entry.age = 0;
  }
  return {
    element, update, clear, reset, damage,
    target(enemy) { selectedTarget = enemy; },
    blocked(value = true) { coverTime = value ? .8 : 0; },
    acceptDamage(kind = 'damage', amount = 0) { if (!(amount > 0) || !Number.isFinite(amount)) return false; if (kind === 'melee' && meleeGrace > 0) return false; if (kind === 'melee') meleeGrace = MELEE_GRACE_SECONDS; damageKind = kind in causes ? kind : 'damage'; return true; },
    requestOrb(cooldown) { if (!Number.isFinite(cooldown)) return false; if (cooldown <= 0) { orbBuffer = 0; return true; } if (cooldown <= ORB_BUFFER_SECONDS) orbBuffer = ORB_BUFFER_SECONDS + .05; return false; },
    get deathInfo() { const [cause, tip] = causes[damageKind]; return { cause, tip }; },
    get state() { return { meleeGrace, orbBuffered: orbBuffer > 0, cover: coverTime > 0, feedback: feedback.filter(e => e.ttl > 0).length, capacity: FEEDBACK_CAPACITY }; },
    dispose() { if (disposed) return; clear(); disposed = true; element.remove(); }
  };
}
function formatDamage(value) { return Number(value.toFixed(1)).toString(); }
