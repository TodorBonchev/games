export const AWARENESS_RANGE = 16;
export const AWARENESS_CLOSE = 3.25;
export const AWARENESS_SECTORS = 8;
export const HIT_CUE_SECONDS = 1;
const TAU = Math.PI * 2, SECTOR = TAU / AWARENESS_SECTORS, ANNOUNCE_INTERVAL = 1.5;
const wrap = angle => ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI;
const directions = ['ahead', 'ahead on your right', 'your right', 'behind on your right', 'behind', 'behind on your left', 'your left', 'ahead on your left'];

function point(value) {
  if (!value || typeof value !== 'object') return null;
  const x = Array.isArray(value) ? value[0] : value.x;
  const y = Array.isArray(value) ? value[1] : value.y ?? 0;
  const z = Array.isArray(value) ? value[2] : value.z;
  return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
}

/** Clockwise bearing from world -Z. Main camera forward is (-sin(yaw), -cos(yaw)). */
export function worldBearing(source, position) {
  const from = point(position), to = point(source);
  if (!from || !to || Math.hypot(to.x - from.x, to.z - from.z) < .0001) return null;
  return Math.atan2(to.x - from.x, from.z - to.z);
}

export function relativeBearing(bearing, yaw) {
  return Number.isFinite(bearing) && Number.isFinite(yaw) ? wrap(bearing + yaw) : null;
}

function sectorFor(angle) { return (Math.round(angle / SECTOR) + AWARENESS_SECTORS) % AWARENESS_SECTORS; }

/**
 * Accepts native zombies ({ position, userData: { dead, hp, attackWind, slamWind,
 * strike } }) or normalized enemies ({ position, alive, winding }). Only nearby
 * living enemies contribute; exact positions and enemies outside 16m are omitted.
 */
export function nearbyThreats({ position, yaw = 0, enemies = [] } = {}) {
  const origin = point(position), slots = Array(AWARENESS_SECTORS).fill(null);
  let closeCount = 0;
  const result = { count: 0, urgentCount: 0, sectors: [], directions: { ahead: 0, behind: 0, left: 0, right: 0 }, description: 'No nearby threats.' };
  if (!origin || !Number.isFinite(yaw) || !Array.isArray(enemies)) return result;
  for (const enemy of enemies) {
    if (!enemy || enemy.alive === false || enemy.dead || enemy.userData?.dead ||
      Number.isFinite(enemy.hp) && enemy.hp <= 0 || Number.isFinite(enemy.userData?.hp) && enemy.userData.hp <= 0) continue;
    const location = point(enemy.position);
    if (!location) continue;
    const distance = Math.hypot(location.x - origin.x, location.y - origin.y, location.z - origin.z);
    if (distance > AWARENESS_RANGE) continue;
    const winding = enemy.winding === true || enemy.userData?.attackWind > 0 || enemy.userData?.slamWind > 0 || enemy.userData?.strike > 0;
    const urgent = winding || distance <= AWARENESS_CLOSE;
    const bearing = worldBearing(location, origin), angle = bearing === null ? 0 : relativeBearing(bearing, yaw), index = sectorFor(angle);
    const slot = slots[index] ||= { index, angle: index * SECTOR, count: 0, nearest: AWARENESS_RANGE, urgent: false, winding: false, strength: 0 };
    slot.count++; slot.nearest = Math.min(slot.nearest, distance); slot.urgent ||= urgent; slot.winding ||= winding;
    slot.strength = 1 - slot.nearest / AWARENESS_RANGE;
    result.count++; result.urgentCount += Number(urgent);
    closeCount += Number(distance <= AWARENESS_CLOSE);
    result.directions[index === 2 ? 'right' : index === 6 ? 'left' : index >= 3 && index <= 5 ? 'behind' : 'ahead']++;
  }
  result.sectors = slots.filter(Boolean);
  if (result.count) {
    const places = Object.entries(result.directions).filter(([, count]) => count).map(([place, count]) => `${count} ${place === 'left' || place === 'right' ? `on the ${place}` : place}`);
    result.description = `${result.count} nearby ${result.count === 1 ? 'threat' : 'threats'}: ${places.join(', ')}.${closeCount ? ' Danger close.' : ''}${result.sectors.some(sector => sector.winding) ? ' Attack incoming.' : ''}`;
  }
  return result;
}

/**
 * Caller owns the frame loop and combat lifecycle. Pass active:false (or clear)
 * before pause, activities, graphics recovery, menus, insertion, or upgrades.
 * No global listeners, timers, or animation frames are installed by this view.
 */
export function createCombatAwareness({ container = globalThis.document?.body } = {}) {
  if (!container?.ownerDocument) throw new TypeError('Combat awareness needs a DOM container.');
  const doc = container.ownerDocument, element = doc.createElement('div');
  element.className = 'combat-awareness'; element.hidden = true;
  const ring = doc.createElement('div'); ring.className = 'combat-awareness-ring'; ring.setAttribute('aria-hidden', 'true'); element.append(ring);
  const markers = Array.from({ length: AWARENESS_SECTORS }, (_, index) => {
    const marker = doc.createElement('span'), glyph = doc.createElement('i'), count = doc.createElement('b');
    marker.className = 'combat-awareness-bearing'; marker.dataset.sector = index; marker.style.transform = `rotate(${index * 45}deg)`; marker.hidden = true;
    glyph.className = 'combat-awareness-chevron'; count.className = 'combat-awareness-count'; count.style.transform = `translateX(-50%) rotate(${-index * 45}deg)`;
    marker.append(glyph, count); ring.append(marker); return { marker, count };
  });
  const hitCue = doc.createElement('span'); hitCue.className = 'combat-awareness-hit'; hitCue.hidden = true; ring.append(hitCue);
  const status = doc.createElement('span'); status.className = 'combat-awareness-status';
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true'); element.append(status);
  container.append(element);
  let disposed = false, hitBearing = null, hitRemaining = 0, announceClock = ANNOUNCE_INTERVAL, state = nearbyThreats();

  function clear() {
    hitBearing = null; hitRemaining = 0; announceClock = ANNOUNCE_INTERVAL;
    state = nearbyThreats(); element.hidden = true; hitCue.hidden = true;
    element.dataset.threatCount = '0'; element.dataset.urgentCount = '0';
    status.textContent = ''; for (const { marker } of markers) marker.hidden = true;
  }
  function update(dt, { position, yaw = 0, enemies = [], active = false, reducedMotion = false } = {}) {
    if (disposed) return state;
    if (!active || !point(position) || !Number.isFinite(yaw)) { clear(); return state; }
    const seconds = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    hitRemaining = Math.max(0, hitRemaining - seconds); announceClock += seconds;
    state = nearbyThreats({ position, yaw, enemies });
    element.hidden = !state.count && !hitRemaining;
    element.dataset.reducedMotion = String(!!reducedMotion);
    element.dataset.threatCount = String(state.count); element.dataset.urgentCount = String(state.urgentCount);
    for (const { marker } of markers) marker.hidden = true;
    for (const sector of state.sectors) {
      const { marker, count } = markers[sector.index]; marker.hidden = false;
      marker.classList.toggle('urgent', sector.urgent); marker.classList.toggle('winding', sector.winding);
      marker.style.setProperty('--awareness-strength', String(Math.round((.48 + sector.strength * .52) * 100) / 100));
      count.hidden = sector.count < 2; count.textContent = sector.count > 9 ? '9+' : String(sector.count);
    }
    hitCue.hidden = !hitRemaining;
    let hitDirection = '';
    if (hitRemaining && hitBearing !== null) {
      const angle = relativeBearing(hitBearing, yaw);
      hitCue.style.transform = `rotate(${angle * 180 / Math.PI}deg)`;
      hitCue.style.opacity = String(reducedMotion ? 1 : Math.min(1, hitRemaining / .3));
      hitDirection = ` Hit from ${directions[sectorFor(angle)]}.`;
    }
    // Movement may change the bearings every frame; screen readers receive a
    // concise summary only when it changes, no more than once per 1.5 seconds.
    const description = state.description + hitDirection;
    if (announceClock >= ANNOUNCE_INTERVAL && status.textContent !== description) {
      status.textContent = description; announceClock = 0;
    }
    return state;
  }
  function hit(sourcePosition, playerPosition) {
    if (disposed) return false;
    const bearing = worldBearing(sourcePosition, playerPosition);
    if (bearing === null) return false;
    hitBearing = bearing; hitRemaining = HIT_CUE_SECONDS; return true;
  }
  return { element, update, hit, clear, get state() { return state; }, dispose() { if (disposed) return; clear(); disposed = true; element.remove(); } };
}
