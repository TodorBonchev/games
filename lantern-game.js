// Lantern Vale rules: fixed-step movement and interactions, independent of WebGL.
export const STEP = 1 / 60;
export const PLAYER_RADIUS = 0.28;
export const WALK_SPEED = 3.8;
export const LIGHT_SECONDS = 1.05;
const clone = value => JSON.parse(JSON.stringify(value));
const active = mode => mode === 'playing' || mode === 'exploring';
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function isWalkable(world, x, z, margin = PLAYER_RADIUS) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if ((x / (world.bounds.rx - margin)) ** 2 + (z / (world.bounds.rz - margin)) ** 2 > 1) return false;
  const river = world.river;
  if (x > river.left - margin && x < river.right + margin && !river.bridges.some(bridge => Math.abs(z - bridge.z) <= bridge.halfWidth - margin)) return false;
  return !world.colliders.some(item => Math.hypot(x - item.x, z - item.z) < item.radius + margin);
}

export function createLantern({ world }) {
  const state = {};
  let accumulator = 0, serial = 0;
  const emit = (type, detail = {}) => {
    state.events.push({ type, ...detail });
    if (state.events.length > 40) state.events.shift();
  };
  const effect = (type, x, z) => {
    state.effects.push({ id: ++serial, type, x, z, age: 0, duration: type === 'light' ? 1.8 : 0.75 });
    if (state.effects.length > 50) state.effects.shift();
  };
  function refreshGuide() {
    const remaining = world.beacons.filter(beacon => !state.lit.includes(beacon.id));
    let target;
    if (remaining.length) {
      const lamp = [...remaining].sort((a, b) => Math.hypot(a.x - state.player.x, a.z - state.player.z) - Math.hypot(b.x - state.player.x, b.z - state.player.z))[0];
      const available = world.motes.map(([x, z], id) => ({ x, z, id })).filter(mote => !state.collected.includes(mote.id));
      if (state.charge < lamp.cost && available.length) {
        const mote = available.sort((a, b) => Math.hypot(a.x - state.player.x, a.z - state.player.z) - Math.hypot(b.x - state.player.x, b.z - state.player.z))[0];
        target = { ...mote, kind: 'mote', name: 'A little firefly', needed: lamp.cost - state.charge, beacon: lamp.id };
      } else target = { x: lamp.x, z: lamp.z, id: lamp.id, kind: 'beacon', name: lamp.name, needed: lamp.cost, beacon: lamp.id };
    } else {
      const memories = world.secrets.map((secret, id) => ({ ...secret, id })).filter(secret => !state.secrets.includes(secret.id));
      const memory = memories.sort((a, b) => Math.hypot(a.x - state.player.x, a.z - state.player.z) - Math.hypot(b.x - state.player.x, b.z - state.player.z))[0];
      target = memory ? { ...memory, kind: 'secret' } : null;
    }
    state.guide = target;
    if (!target) return;
    const river = world.river, side = x => x < river.left ? -1 : x > river.right ? 1 : 0;
    if (side(state.player.x) * side(target.x) === -1) {
      const bridge = [...river.bridges].sort((a, b) => Math.hypot(state.player.x - (river.left + river.right) / 2, state.player.z - a.z) + Math.hypot(target.x - (river.left + river.right) / 2, target.z - a.z) - Math.hypot(state.player.x - (river.left + river.right) / 2, state.player.z - b.z) - Math.hypot(target.x - (river.left + river.right) / 2, target.z - b.z))[0];
      state.guide = { ...target, viaBridge: true, destination: { x: target.x, z: target.z }, x: side(state.player.x) < 0 ? river.left - 0.65 : river.right + 0.65, z: bridge.z };
      if (Math.abs(state.player.z - bridge.z) < 0.7) state.guide.x = side(state.player.x) < 0 ? river.right + 0.65 : river.left - 0.65;
    }
  }
  function start() {
    accumulator = serial = 0;
    Object.assign(state, {
      mode: 'playing', resumeMode: 'playing', level: 1, ticks: 0,
      player: { ...world.spawn, heading: 0, moving: false },
      collected: [], secrets: [], lit: [], charge: 0, stars: 0,
      channel: { beacon: null, progress: 0 }, guide: null, events: [], effects: [], distance: 0,
    });
    refreshGuide(); emit('start'); return state;
  }
  function pause() {
    if (!active(state.mode)) return false;
    state.resumeMode = state.mode; state.mode = 'paused'; state.player.moving = false; accumulator = 0; return true;
  }
  function resume() {
    if (state.mode !== 'paused') return false;
    state.mode = state.resumeMode; accumulator = 0; return true;
  }
  function explore() {
    if (state.mode !== 'won') return false;
    state.mode = state.resumeMode = 'exploring'; accumulator = 0; return true;
  }
  function step(input) {
    state.ticks++;
    let dx = input.x * WALK_SPEED * STEP, dz = input.z * WALK_SPEED * STEP;
    const oldX = state.player.x, oldZ = state.player.z;
    if (isWalkable(world, oldX + dx, oldZ + dz)) {
      state.player.x += dx; state.player.z += dz;
    } else {
      if (isWalkable(world, state.player.x + dx, state.player.z)) state.player.x += dx;
      if (isWalkable(world, state.player.x, state.player.z + dz)) state.player.z += dz;
    }
    const moved = Math.hypot(state.player.x - oldX, state.player.z - oldZ);
    state.player.moving = moved > 0.0001;
    state.distance += moved;
    if (Math.hypot(dx, dz) > 0.0001) state.player.heading = Math.atan2(dx, dz);
    world.motes.forEach(([x, z], id) => {
      if (!state.collected.includes(id) && Math.hypot(state.player.x - x, state.player.z - z) < 0.85) {
        state.collected.push(id); state.charge++; effect('mote', x, z); emit('mote', { id, charge: state.charge });
      }
    });
    world.secrets.forEach((secret, id) => {
      if (!state.secrets.includes(id) && Math.hypot(state.player.x - secret.x, state.player.z - secret.z) < 0.85) {
        state.secrets.push(id); effect('secret', secret.x, secret.z); emit('secret', { id, name: secret.name });
        if (state.lit.length === world.beacons.length) state.stars = earnedStars(state.secrets.length, world.secrets.length);
      }
    });
    const nearby = world.beacons.find(beacon => !state.lit.includes(beacon.id) && Math.hypot(state.player.x - beacon.x, state.player.z - beacon.z) < 1.25 && state.charge >= beacon.cost);
    if (!nearby) state.channel = { beacon: null, progress: 0 };
    else {
      if (state.channel.beacon !== nearby.id) state.channel = { beacon: nearby.id, progress: 0 };
      state.channel.progress = Math.min(1, state.channel.progress + STEP / LIGHT_SECONDS);
      if (state.channel.progress >= 1 - 1e-8) {
        state.lit.push(nearby.id); state.charge -= nearby.cost; state.channel = { beacon: null, progress: 0 };
        effect('light', nearby.x, nearby.z); emit('light', { id: nearby.id, name: nearby.name });
        if (state.lit.length === world.beacons.length) {
          state.mode = 'won'; state.resumeMode = 'exploring'; state.player.moving = false;
          state.stars = earnedStars(state.secrets.length, world.secrets.length); emit('won', { stars: state.stars }); accumulator = 0;
        }
      }
    }
    for (const item of state.effects) item.age += STEP;
    state.effects = state.effects.filter(item => item.age < item.duration);
    if (state.ticks % 15 === 0 || state.events.length) refreshGuide();
  }
  function advance(seconds, control = {}) {
    if (!active(state.mode) || !Number.isFinite(seconds) || seconds <= 0) return;
    control ||= {};
    let x = Number.isFinite(control.x) ? clamp(control.x, -1, 1) : 0;
    let z = Number.isFinite(control.z) ? clamp(control.z, -1, 1) : 0;
    const length = Math.hypot(x, z); if (length > 1) { x /= length; z /= length; }
    accumulator += Math.min(seconds, 1);
    while (accumulator + 1e-9 >= STEP && active(state.mode)) { accumulator -= STEP; step({ x, z }); }
  }
  function snapshot() {
    if (state.mode === 'ready') return null;
    return clone({ schema: 1, level: 1, mode: state.mode, resumeMode: state.resumeMode,
      ticks: state.ticks, player: { ...state.player, moving: false }, collected: state.collected,
      secrets: state.secrets, lit: state.lit, charge: state.charge, stars: state.stars,
      channel: state.channel, distance: state.distance });
  }
  function restore(value) {
    const data = parseLanternSave(value, world); if (!data) return false;
    start(); Object.assign(state, data, { events: [], effects: [] });
    if (active(state.mode)) { state.resumeMode = state.mode; state.mode = 'paused'; }
    accumulator = 0; refreshGuide(); return true;
  }
  start(); state.mode = 'ready'; state.events = [];
  return { state, world, start, advance, pause, resume, explore, snapshot, restore, refreshGuide };
}

function earnedStars(found, total) { return 1 + (found >= Math.ceil(total * 0.6) ? 1 : 0) + (found === total ? 1 : 0); }
export function parseLanternSave(value, world) {
  try {
    const finite = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
    const integer = (n, min, max) => Number.isInteger(n) && finite(n, min, max);
    const ids = (items, max) => Array.isArray(items) && items.length <= max && new Set(items).size === items.length && items.every(id => integer(id, 0, max - 1));
    if (!value || value.schema !== 1 || value.level !== 1 || !['playing', 'paused', 'won', 'exploring'].includes(value.mode) || !['playing', 'exploring'].includes(value.resumeMode)) return null;
    if (!integer(value.ticks, 0, 1e9) || !finite(value.distance, 0, 1e8) || !value.player || value.player.moving !== false || !finite(value.player.heading, -Math.PI, Math.PI)) return null;
    if (!isWalkable(world, value.player.x, value.player.z, PLAYER_RADIUS - 0.001)) return null;
    if (!ids(value.collected, world.motes.length) || !ids(value.secrets, world.secrets.length) || !ids(value.lit, world.beacons.length)) return null;
    const spent = value.lit.reduce((sum, id) => sum + world.beacons[id].cost, 0);
    if (value.charge !== value.collected.length - spent || !integer(value.charge, 0, world.motes.length)) return null;
    const complete = value.lit.length === world.beacons.length;
    if (value.stars !== (complete ? earnedStars(value.secrets.length, world.secrets.length) : 0)) return null;
    if (complete !== (value.mode === 'won' || value.mode === 'exploring' || value.mode === 'paused' && value.resumeMode === 'exploring')) return null;
    if (!complete && value.resumeMode !== 'playing') return null;
    if (!value.channel || !finite(value.channel.progress, 0, 1)) return null;
    if (value.channel.beacon === null) { if (value.channel.progress !== 0) return null; }
    else {
      if (!integer(value.channel.beacon, 0, world.beacons.length - 1) || value.lit.includes(value.channel.beacon) || complete) return null;
      const beacon = world.beacons[value.channel.beacon];
      if (value.charge < beacon.cost || Math.hypot(value.player.x - beacon.x, value.player.z - beacon.z) >= 1.25) return null;
    }
    return clone({ schema: 1, level: 1, mode: value.mode, resumeMode: value.resumeMode, ticks: value.ticks,
      player: { x: value.player.x, z: value.player.z, heading: value.player.heading, moving: false },
      collected: value.collected, secrets: value.secrets, lit: value.lit, charge: value.charge, stars: value.stars,
      channel: { beacon: value.channel.beacon, progress: value.channel.progress }, distance: value.distance });
  } catch { return null; }
}
