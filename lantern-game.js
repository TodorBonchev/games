// Fixed-step spaceship movement and island discoveries, independent of WebGL.
export const STEP = 1 / 60;
export const PLAYER_RADIUS = 0.28; // Only used to validate earlier walking saves.
export const LIGHT_SECONDS = 1.05;
export const FLIGHT = Object.freeze({ cruiseSpeed: 5.8, boostSpeed: 10.8, liftSpeed: 4, turnSpeed: 1.35, radius: 110, minY: -24, maxY: 48, margin: .65, targetY: 7.2, moteReach: 1.35, secretReach: 1.8, beaconReach: 2.4 });
const clone = value => JSON.parse(JSON.stringify(value));
const active = mode => mode === 'playing' || mode === 'exploring';
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const wrap = value => Math.atan2(Math.sin(value), Math.cos(value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const targetCache = new WeakMap();
const emptyExpedition = () => ({ visited: [], collected: [], awakened: [], destination: null });
export function expeditionTargets(world) {
  return (world.satellites || []).flatMap(island => island.nodes.map((node, index) => ({ ...node,
    id: `${island.id}:${index}`, island: island.id, index, kind: island.id === 'moonbloom' ? 'seed' : 'signal',
    name: island.id === 'moonbloom' ? 'A Moonbloom dewseed' : 'A Sunspire signal ring',
  })));
}
const islandCeiling = island => Math.max(island.topY, ...(island.colliders || []).map(collider => collider.maxY)) + 2;
const nearIsland = (player, island) => Math.hypot(player.x - island.center.x, player.z - island.center.z) < Math.max(island.rx, island.rz) + 7 && Math.abs(player.y - island.topY) < 18;


export function flightSpawn() { return { x: 0, y: 9, z: 26, heading: Math.PI, moving: false, speed: 0, verticalSpeed: 0, bank: 0 }; }
export function flightTargets(world) {
  if (!targetCache.has(world)) {
    const positions = [[-18, 2, 10], [-20, 7, -7], [-4, 12, -17], [18, 4, -12], [4, -8, 3]];
    targetCache.set(world, {
      motes: world.motes.map(([x, z], id) => ({ x, y: FLIGHT.targetY, z, id })),
      beacons: world.beacons.map(beacon => ({ ...beacon, y: FLIGHT.targetY })),
      secrets: world.secrets.map((secret, id) => ({ ...secret, id, x: positions[id][0], y: positions[id][1], z: positions[id][2] })),
    });
  }
  return targetCache.get(world);
}

// Older walking checkpoints are validated before being lifted safely into flight.
export function isWalkable(world, x, z, margin = PLAYER_RADIUS) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if ((x / (world.bounds.rx - margin)) ** 2 + (z / (world.bounds.rz - margin)) ** 2 > 1) return false;
  const river = world.river;
  if (x > river.left - margin && x < river.right + margin && !river.bridges.some(bridge => Math.abs(z - bridge.z) <= bridge.halfWidth - margin)) return false;
  return !world.colliders.some(item => Math.hypot(x - item.x, z - item.z) < item.radius + margin);
}

export function isFlyable(world, x, y, z, margin = FLIGHT.margin) {
  if (![x, y, z, margin].every(Number.isFinite) || margin < 0 || Math.hypot(x, z) > FLIGHT.radius || y < FLIGHT.minY || y > FLIGHT.maxY) return false;
  return isFlightClear(world, x, y, z, margin);
}

// Camera collision uses scenery only, so its chase arm can cross the flight fence.
export function isFlightClear(world, x, y, z, margin = FLIGHT.margin) {
  if (![x, y, z, margin].every(Number.isFinite) || margin < 0) return false;
  for (const island of world.satellites || []) {
    if (y > island.bottomY - margin && y < island.topY + margin && ((x - island.center.x) / (island.rx + margin)) ** 2 + ((z - island.center.z) / (island.rz + margin)) ** 2 < 1) return false;
    if ((island.colliders || []).some(collider => y > (collider.minY ?? island.topY) - margin && y < collider.maxY + margin && Math.hypot(x - collider.x, z - collider.z) < collider.radius + margin)) return false;
  }
  // A generous rock envelope protects the irregular Blender coast and underside.
  if (y > -5.9 - margin && y < world.groundY + margin && (x / (17.4 + margin)) ** 2 + (z / (12.7 + margin)) ** 2 < 1) return false;
  if (y < world.groundY - margin) return true;
  const heights = { windmill: 6.2, cottage: 4.6, tower: 4.85, tree: 6, gazebo: 3.5, lantern: 3.05, market: 2.9, bench: 1.6 };
  const radius = item => item.kind === 'tree' ? Math.max(1.5, item.radius * 3) : item.kind === 'windmill' ? 2.8 : item.kind === 'cottage' ? item.radius * 1.3 : item.radius;
  return !world.colliders.some(item => y < (heights[item.kind] || 4.5) + margin && Math.hypot(x - item.x, z - item.z) < radius(item) + margin);
}

export function createLantern({ world }) {
  const state = {}, targets = flightTargets(world), satellites = world.satellites || [], expeditionNodes = expeditionTargets(world);
  let accumulator = 0, serial = 0;
  const emit = (type, detail = {}) => {
    state.events.push({ type, ...detail });
    if (state.events.length > 40) state.events.shift();
  };
  const effect = (type, target) => {
    state.effects.push({ id: ++serial, type, x: target.x, y: target.y, z: target.z, age: 0, duration: type === 'light' ? 1.8 : .75 });
    if (state.effects.length > 50) state.effects.shift();
  };
  function refreshGuide() {
    const closest = items => items.sort((a, b) => distance(a, state.player) - distance(b, state.player))[0];
    const lamp = closest(targets.beacons.filter(beacon => !state.lit.includes(beacon.id)));
    if (lamp) {
      const mote = state.charge < lamp.cost && closest(targets.motes.filter(mote => !state.collected.includes(mote.id)));
      state.guide = mote ? { ...mote, kind: 'mote', name: 'A little firefly', needed: lamp.cost - state.charge, beacon: lamp.id }
        : { ...lamp, kind: 'beacon', needed: lamp.cost, beacon: lamp.id };
    } else {
      const memory = closest(targets.secrets.filter(secret => !state.secrets.includes(secret.id)));
      state.guide = memory ? { ...memory, kind: 'secret' } : null;
    }
    const selected = state.expedition.destination;
    const destination = satellites.find(island => island.id === selected);
    const nearby = satellites.find(island => nearIsland(state.player, island) && !state.expedition.awakened.includes(island.id));
    const remainingIsland = closest(satellites.filter(island => !state.expedition.awakened.includes(island.id)).map(island => ({ ...island, ...island.center })));
    const island = destination || (selected !== 'vale' ? nearby || (!state.guide ? remainingIsland : null) : null);
    if (island) {
      const nodes = expeditionNodes.filter(node => node.island === island.id);
      const missing = nodes.filter(node => !state.expedition.collected.includes(node.id));
      const node = closest(missing);
      state.guide = node ? { ...node, count: nodes.length - missing.length, total: nodes.length }
        : { ...(island.approach || { ...island.landmark, y: islandCeiling(island) }), id: island.id, island: island.id, kind: 'island', name: island.name, restored: true };
    } else if (selected === 'vale' && !state.guide) state.guide = { x: 0, y: 9, z: 8, id: 'vale', island: 'vale', kind: 'island', name: 'Lantern Vale', restored: state.lit.length === world.beacons.length };
    const target = state.guide, player = state.player;
    if (!target) return;
    const clearBelow = -5.9 - FLIGHT.margin;
    const outside = (player.x / 20) ** 2 + (player.z / 15.5) ** 2 > 1;
    const waypoint = (x, y, z, instruction) => { state.guide = { ...target, destination: { x: target.x, y: target.y, z: target.z }, x, y, z, viaCoast: true, instruction }; };
    const belowSatellite = satellites.find(item => ((player.x - item.center.x) / (item.rx + 2)) ** 2 + ((player.z - item.center.z) / (item.rz + 2)) ** 2 < 1 && player.y <= item.bottomY - FLIGHT.margin && target.y > item.bottomY - FLIGHT.margin);
    if (belowSatellite) waypoint(belowSatellite.center.x, player.y, belowSatellite.center.z + belowSatellite.rz + 6, 'Fly beyond the coast');
    else if (target.y < clearBelow && player.y > clearBelow) {
      if (outside) waypoint(player.x, target.y, player.z, 'Descend beside the island');
      else if (player.y < FLIGHT.targetY) waypoint(player.x, 9, player.z, 'Climb above the village');
      else waypoint(0, Math.max(9, player.y), 22, 'Fly beyond the coast');
    } else if (target.y >= clearBelow && player.y < FLIGHT.targetY) {
      if (player.y <= clearBelow && !outside) waypoint(0, Math.min(-8, player.y), 22, 'Fly beyond the coast');
      else if (outside) {
        // Keep climbing after crossing the underside until the route to the
        // actual target clears rock and rooflines. This also survives reload.
        let blocked = false;
        for (let i = 1; i <= 40 && !blocked; i++) {
          const f = i / 40;
          blocked = !isFlightClear(world, player.x + (target.x - player.x) * f, player.y + (target.y - player.y) * f, player.z + (target.z - player.z) * f);
        }
        if (blocked || player.y < 2) waypoint(player.x, Math.max(9, target.y), player.z, 'Climb beside the island');
      }
    }
    // An approach to a satellite can pass through its cliff or an observatory.
    // A height waypoint clears the scenery, then a viewpoint above the target
    // makes the final descent readable instead of pointing through the rock.
    if (!state.guide.viaCoast) {
      let blocked = false;
      const steps = Math.max(1, Math.ceil(distance(player, target) / .35));
      for (let i = 1; i <= steps && !blocked; i++) {
        const f = i / steps;
        blocked = !isFlightClear(world, player.x + (target.x - player.x) * f, player.y + (target.y - player.y) * f, player.z + (target.z - player.z) * f);
      }
      if (blocked) {
        const ceiling = Math.max(9, ...satellites.map(islandCeiling));
        const currentHull = satellites.find(item => ((player.x - item.center.x) / (item.rx + 2)) ** 2 + ((player.z - item.center.z) / (item.rz + 2)) ** 2 < 1 && player.y <= item.bottomY - FLIGHT.margin);
        if (currentHull) waypoint(currentHull.center.x, player.y, currentHull.center.z + currentHull.rz + 6, 'Fly beyond the coast');
        else if (player.y < ceiling - .3) waypoint(player.x, ceiling, player.z, 'Climb above the island');
        else waypoint(target.x, ceiling, target.z, 'Fly above your destination');
      }
    }
  }
  function setDestination(id) {
    if (id !== null && id !== 'vale' && !satellites.some(island => island.id === id)) return false;
    state.expedition.destination = id; refreshGuide(); return true;
  }
  function start() {
    accumulator = serial = 0;
    Object.assign(state, {
      mode: 'playing', resumeMode: 'playing', level: 1, ticks: 0,
      player: flightSpawn(world), collected: [], secrets: [], lit: [], charge: 0, stars: 0,
      channel: { beacon: null, progress: 0 }, guide: null, events: [], effects: [], distance: 0, expedition: emptyExpedition(),
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
    const player = state.player, old = { x: player.x, y: player.y, z: player.z };
    player.heading = wrap(player.heading - input.turn * FLIGHT.turnSpeed * STEP);
    const desiredSpeed = input.throttle * (input.boost ? FLIGHT.boostSpeed : FLIGHT.cruiseSpeed);
    player.speed += (desiredSpeed - player.speed) * (1 - Math.exp(-STEP * (input.throttle ? 7 : 18)));
    player.verticalSpeed += (input.lift * FLIGHT.liftSpeed - player.verticalSpeed) * (1 - Math.exp(-STEP * (input.lift ? 8 : 18)));
    player.bank += (-input.turn * .32 - player.bank) * (1 - Math.exp(-STEP * 8));
    if (!input.throttle && Math.abs(player.speed) < .02) player.speed = 0;
    if (!input.lift && Math.abs(player.verticalSpeed) < .02) player.verticalSpeed = 0;
    const dx = Math.sin(player.heading) * player.speed * STEP, dz = Math.cos(player.heading) * player.speed * STEP;
    const dy = player.verticalSpeed * STEP;
    if (isFlyable(world, player.x + dx, player.y + dy, player.z + dz)) {
      player.x += dx; player.y += dy; player.z += dz;
    } else {
      // Sliding rather than bouncing keeps close exploration calm and predictable.
      if (isFlyable(world, player.x, player.y + dy, player.z)) player.y += dy;
      else player.verticalSpeed = 0;
      if (isFlyable(world, player.x + dx, player.y, player.z)) player.x += dx;
      if (isFlyable(world, player.x, player.y, player.z + dz)) player.z += dz;
      if (Math.hypot(player.x - old.x, player.z - old.z) < .00001) player.speed = 0;
    }
    const moved = distance(player, old);
    player.moving = moved > .0001; state.distance += moved;
    targets.motes.forEach(mote => {
      if (!state.collected.includes(mote.id) && distance(player, mote) < FLIGHT.moteReach) {
        state.collected.push(mote.id); state.charge++; effect('mote', mote); emit('mote', { id: mote.id, charge: state.charge });
      }
    });
    targets.secrets.forEach(secret => {
      if (!state.secrets.includes(secret.id) && distance(player, secret) < FLIGHT.secretReach) {
        state.secrets.push(secret.id); effect('secret', secret); emit('secret', { id: secret.id, name: secret.name });
        if (state.lit.length === world.beacons.length) state.stars = earnedStars(state.secrets.length, world.secrets.length);
      }
    });
    for (const island of satellites) {
      if (!state.expedition.visited.includes(island.id) && nearIsland(player, island)) {
        state.expedition.visited.push(island.id); emit('island', { id: island.id, name: island.name, mission: island.mission });
      }
      const nodes = expeditionNodes.filter(node => node.island === island.id);
      for (const node of nodes) if (!state.expedition.collected.includes(node.id) && distance(player, node) < (node.kind === 'seed' ? 1.8 : 2.1)) {
        if (!state.expedition.visited.includes(island.id)) state.expedition.visited.push(island.id);
        state.expedition.collected.push(node.id); effect(node.kind, node);
        const count = nodes.filter(item => state.expedition.collected.includes(item.id)).length;
        emit(node.kind, { id: node.id, island: island.id, name: island.name, count, total: nodes.length });
      }
      if (!state.expedition.awakened.includes(island.id) && nodes.length && nodes.every(node => state.expedition.collected.includes(node.id))) {
        state.expedition.awakened.push(island.id); effect('light', island.landmark);
        emit('island-awakened', { id: island.id, name: island.name, reward: island.reward });
      }
    }
    const nearby = targets.beacons.find(beacon => !state.lit.includes(beacon.id) && distance(player, beacon) < FLIGHT.beaconReach && state.charge >= beacon.cost);
    if (!nearby) state.channel = { beacon: null, progress: 0 };
    else {
      if (state.channel.beacon !== nearby.id) state.channel = { beacon: nearby.id, progress: 0 };
      // Hover to charge. Passing through still gives a moment of progress, but
      // the full lantern requires an intentional stop in its sky ring.
      if (Math.abs(player.speed) < .5 && Math.abs(player.verticalSpeed) < .5 && !input.throttle && !input.lift) state.channel.progress = Math.min(1, state.channel.progress + STEP / LIGHT_SECONDS);
      if (state.channel.progress >= 1 - 1e-8) {
        state.lit.push(nearby.id); state.charge -= nearby.cost; state.channel = { beacon: null, progress: 0 };
        effect('light', nearby); emit('light', { id: nearby.id, name: nearby.name });
        if (state.lit.length === world.beacons.length) {
          state.mode = 'won'; state.resumeMode = 'exploring'; player.moving = false; player.speed = player.verticalSpeed = 0;
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
    const input = {};
    for (const key of ['throttle', 'turn', 'lift']) input[key] = Number.isFinite(control[key]) ? clamp(control[key], -1, 1) : 0;
    input.boost = control.boost === true;
    accumulator += Math.min(seconds, 1);
    while (accumulator + 1e-9 >= STEP && active(state.mode)) { accumulator -= STEP; step(input); }
  }
  function snapshot() {
    if (state.mode === 'ready') return null;
    return clone({ schema: 3, level: 1, mode: state.mode, resumeMode: state.resumeMode,
      ticks: state.ticks, player: { ...state.player, moving: false }, collected: state.collected,
      secrets: state.secrets, lit: state.lit, charge: state.charge, stars: state.stars,
      channel: state.channel, distance: state.distance, expedition: state.expedition });
  }
  function restore(value) {
    const data = parseLanternSave(value, world); if (!data) return false;
    start(); Object.assign(state, data, { events: [], effects: [] });
    if (active(state.mode)) { state.resumeMode = state.mode; state.mode = 'paused'; }
    accumulator = 0; refreshGuide(); return true;
  }
  start(); state.mode = 'ready'; state.events = [];
  return { state, world, targets, satellites, start, advance, pause, resume, explore, snapshot, restore, refreshGuide, setDestination };
}

function earnedStars(found, total) { return 1 + (found >= Math.ceil(total * .6) ? 1 : 0) + (found === total ? 1 : 0); }
export function parseLanternSave(value, world) {
  try {
    const finite = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
    const integer = (n, min, max) => Number.isInteger(n) && finite(n, min, max);
    const ids = (items, max) => Array.isArray(items) && items.length <= max && new Set(items).size === items.length && items.every(id => integer(id, 0, max - 1));
    if (!value || ![1, 2, 3].includes(value.schema) || value.level !== 1 || !['playing', 'paused', 'won', 'exploring'].includes(value.mode) || !['playing', 'exploring'].includes(value.resumeMode)) return null;
    const legacy = value.schema === 1, player = value.player;
    if (!integer(value.ticks, 0, 1e9) || !finite(value.distance, 0, 1e8) || !player || player.moving !== false || !finite(player.heading, -Math.PI, Math.PI)) return null;
    if (legacy) { if (!isWalkable(world, player.x, player.z, PLAYER_RADIUS - .001)) return null; }
    else {
      const validationWorld = value.schema < 3 ? { ...world, satellites: [] } : world;
      if (!isFlyable(validationWorld, player.x, player.y, player.z) || !finite(player.speed, -FLIGHT.boostSpeed, FLIGHT.boostSpeed) || !finite(player.verticalSpeed, -FLIGHT.liftSpeed, FLIGHT.liftSpeed) || !finite(player.bank, -.32, .32)) return null;
      if (value.schema === 2 && (Math.hypot(player.x, player.z) > 60 || player.y < -16 || player.y > 32)) return null;
    }
    let restoredY = legacy ? FLIGHT.targetY : player.y;
    if (value.schema < 3 && !isFlightClear(world, player.x, restoredY, player.z)) {
      // A newly authored satellite may occupy a place that used to be empty
      // space. Lift only this older checkpoint rather than discarding its run.
      restoredY = Math.max(restoredY, ...(world.satellites || []).map(islandCeiling));
      if (!isFlyable(world, player.x, restoredY, player.z)) return null;
    }
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
      const beacon = legacy ? world.beacons[value.channel.beacon] : flightTargets(world).beacons[value.channel.beacon];
      const separation = legacy ? Math.hypot(player.x - beacon.x, player.z - beacon.z) : distance(player, beacon);
      if (value.charge < beacon.cost || separation >= (legacy ? 1.25 : FLIGHT.beaconReach)) return null;
    }
    let expedition = emptyExpedition();
    if (value.schema === 3) {
      const input = value.expedition, islands = world.satellites || [], nodes = expeditionTargets(world);
      const validList = (list, allowed) => Array.isArray(list) && list.length <= allowed.length && new Set(list).size === list.length && list.every(id => typeof id === 'string' && allowed.includes(id));
      const islandIds = islands.map(island => island.id);
      if (!input || !validList(input.visited, islandIds) || !validList(input.awakened, islandIds) || !validList(input.collected, nodes.map(node => node.id))) return null;
      if (input.destination !== null && input.destination !== 'vale' && !islandIds.includes(input.destination)) return null;
      if (input.awakened.some(id => !input.visited.includes(id)) || input.collected.some(id => !input.visited.includes(nodes.find(node => node.id === id).island))) return null;
      if (islands.some(island => input.awakened.includes(island.id) !== nodes.filter(node => node.island === island.id).every(node => input.collected.includes(node.id)))) return null;
      expedition = { visited: input.visited, collected: input.collected, awakened: input.awakened, destination: input.destination };
    }
    return clone({ schema: 3, level: 1, mode: value.mode, resumeMode: value.resumeMode, ticks: value.ticks,
      player: { x: player.x, y: restoredY, z: player.z, heading: player.heading, moving: false,
        speed: legacy ? 0 : player.speed, verticalSpeed: legacy ? 0 : player.verticalSpeed, bank: legacy ? 0 : player.bank },
      collected: value.collected, secrets: value.secrets, lit: value.lit, charge: value.charge, stars: value.stars,
      channel: { beacon: value.channel.beacon, progress: value.channel.progress }, distance: value.distance, expedition });
  } catch { return null; }
}
