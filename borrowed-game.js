import { chamberFor, bloomPosition, PORTALS, ROOM_RADIUS, STEP, RECORD_EVERY, MAX_ENEMIES, MAX_BULLETS, MAX_PARTICLES } from './borrowed-levels.js';

export function triangleArea(a, b, c) { return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2; }
export function edgeDistance(x, z, triangle) {
  let distance = Infinity;
  for (let i = 0; i < 3; i++) {
    const a = triangle[i], b = triangle[(i + 1) % 3], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    distance = Math.min(distance, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
  }
  return distance;
}
export function insideTriangle(x, z, triangle) {
  const [a, b, c] = triangle;
  if (triangleArea(a, b, c) < 0.001) return false;
  const cross = (p, q) => (x - q[0]) * (p[1] - q[1]) - (p[0] - q[0]) * (z - q[1]);
  const u = cross(a, b), v = cross(b, c), w = cross(c, a);
  return !((u < -0.0001 || v < -0.0001 || w < -0.0001) && (u > 0.0001 || v > 0.0001 || w > 0.0001));
}
export function memoryPosition(memory, tick) {
  const points = memory.points;
  if (tick >= memory.ticks || points.length === 1) return [points.at(-1)[1], points.at(-1)[2]];
  let low = 0, high = points.length - 1;
  while (low + 1 < high) { const middle = (low + high) >> 1; if (points[middle][0] <= tick) low = middle; else high = middle; }
  const index = Math.min(low, points.length - 2);
  const a = points[index], b = points[index + 1], t = Math.max(0, Math.min(1, (tick - a[0]) / Math.max(1, b[0] - a[0])));
  if (b[3] && tick < b[0]) return [a[1], a[2]];
  return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const ENEMIES = Object.freeze({
  mote: { hp: 1, speed: 1, radius: 0.32, value: 25 },
  hunter: { hp: 2, speed: 1.6, radius: 0.3, value: 40 },
  sentry: { hp: 3, speed: 0.65, radius: 0.4, value: 60 },
  armor: { hp: 6, speed: 0.72, radius: 0.48, value: 80 },
});
const round = value => Math.round(value * 1000) / 1000;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

export function createBorrowed({ level = 1, difficulty = 'flow', seed = 14691 } = {}) {
  let room = chamberFor(level), accumulator = 0, serial = 0;
  const state = {};
  function event(type, detail = {}) { state.events.push({ type, ...detail }); if (state.events.length > 24) state.events.shift(); }
  function random() { state.random = (Math.imul(state.random, 1664525) + 1013904223) >>> 0; return state.random / 4294967296; }
  function effect(type, x, z, strength = 1) {
    if (state.effects.length >= MAX_PARTICLES) state.effects.shift();
    state.effects.push({ id: ++serial, type, x, z, strength, age: 0 });
  }
  function reset(id = room.id, mode = difficulty, nextSeed = seed) {
    room = chamberFor(id); difficulty = mode === 'rift' ? 'rift' : 'flow'; seed = Number.isFinite(nextSeed) ? Math.floor(nextSeed) >>> 0 : 14691;
    serial = 0; accumulator = 0;
    const maxHp = difficulty === 'flow' ? 120 : 90;
    Object.assign(state, {
      mode: 'ready', level: room.id, difficulty, seed, random: seed, ticks: 0, loopTicks: 0, loop: 1,
      duration: room.duration + (difficulty === 'flow' ? 4 : 0), maxLoops: room.loops + (difficulty === 'flow' ? 1 : 0),
      hp: maxHp, maxHp, beats: 0, score: 0, combo: 0, comboTime: 0, peakCombo: 0,
      kills: 0, caught: 0, snaps: 0, hits: 0, damageTaken: 0, largestSail: 0, maxHarmony: 1,
      player: { x: PORTALS[0][0], z: PORTALS[0][1], dx: 0, dz: -1 },
      sail: [[0, 0], [...PORTALS[1]], [...PORTALS[2]]], area: 0,
      memories: [], recording: [], blooms: room.blooms.map((b, i) => ({ index: i, charge: 0, need: b[2] })),
      enemies: [], bullets: [], effects: [], events: [], spawnIndex: 0, nextSpawn: 1.2,
      snapCooldown: 0, dashCooldown: 0, borrowCooldown: 0, dashTime: 0, dashSerial: 0,
      invulnerable: 0, pulse: 0, hurt: 0, bossHp: room.boss ? 30 : 0, bossAwake: false, bossClock: 1.5,
      ring: -1, windX: 0, windZ: 0, reason: '',
    });
    geometry();
    return state;
  }
  function geometry() {
    const nodes = [[state.player.x, state.player.z]];
    for (const memory of state.memories) nodes.push(memoryPosition(memory, state.loopTicks));
    if (nodes.length < 3) {
      const occupied = new Set([(state.loop - 1) % 3, ...state.memories.map(memory => memory.portal)]);
      for (let index = 0; index < PORTALS.length && nodes.length < 3; index++) {
        if (occupied.has(index)) continue;
        const [x, z] = PORTALS[index];
        const angle = room.rotating ? Math.sin(state.loopTicks * STEP * 0.28) * 0.48 : 0;
        nodes.push([x * Math.cos(angle) - z * Math.sin(angle), x * Math.sin(angle) + z * Math.cos(angle)]);
      }
    }
    state.sail = nodes;
    state.area = triangleArea(...nodes);
    state.largestSail = Math.max(state.largestSail, state.area);
  }
  function constrain(point, radius = 0.4) {
    for (const [x, z, obstacleRadius] of room.obstacles) {
      const dx = point.x - x, dz = point.z - z, distance = Math.hypot(dx, dz), edge = obstacleRadius + radius;
      if (distance < edge) { point.x = x + (distance ? dx / distance : 1) * edge; point.z = z + (distance ? dz / distance : 0) * edge; }
    }
    const distance = Math.hypot(point.x, point.z), limit = ROOM_RADIUS - radius;
    if (distance > limit) { point.x *= limit / distance; point.z *= limit / distance; }
  }
  function recordPoint(jump = 0) {
    const last = state.recording.at(-1), point = [state.loopTicks, round(state.player.x), round(state.player.z)];
    if (jump) point.push(1);
    if (last?.[0] === point[0]) { if (last[3] && !point[3]) point.push(1); state.recording[state.recording.length - 1] = point; }
    else state.recording.push(point);
  }
  function spawn(type = 'mote', x, z) {
    if (state.enemies.length >= MAX_ENEMIES) return;
    const definition = ENEMIES[type], angle = random() * Math.PI * 2;
    state.enemies.push({ id: ++serial, type, x: x ?? Math.cos(angle) * 7.9, z: z ?? Math.sin(angle) * 7.9,
      hp: definition.hp, age: 0, shot: 1.9 + random(), stun: 0, hit: 0, dashHit: -1, angle: 0 });
  }
  function beginLoop() {
    state.mode = 'playing'; state.loopTicks = 0; state.enemies = []; state.bullets = []; state.effects = []; state.recording = [];
    state.random = (state.seed ^ Math.imul(state.level, 0x9e3779b9)) >>> 0; state.spawnIndex = 0; state.nextSpawn = 1.2;
    const portal = PORTALS[(state.loop - 1) % 3];
    const distance = Math.hypot(...portal);
    Object.assign(state.player, { x: portal[0], z: portal[1], dx: -portal[0] / distance, dz: -portal[1] / distance });
    state.snapCooldown = state.dashCooldown = state.borrowCooldown = state.dashTime = state.invulnerable = state.hurt = 0;
    state.hp = Math.min(state.maxHp, state.hp + 30); state.combo = state.comboTime = 0;
    geometry(); recordPoint(); spawn('mote', -2.5, 0.2); spawn('mote', 2.5, -0.2);
    event('loop', { loop: state.loop });
  }
  function start(id = room.id, mode = difficulty, nextSeed = seed) { reset(id, mode, nextSeed); beginLoop(); }
  function pause() { if (state.mode === 'playing') { state.mode = 'paused'; accumulator = 0; } }
  function resume() { if (state.mode === 'paused') { state.mode = 'playing'; accumulator = 0; } }
  function hitPlayer(damage) {
    if (state.invulnerable > 0 || state.mode !== 'playing') return;
    const amount = damage * (state.difficulty === 'flow' ? 0.65 : 1);
    state.hp = Math.max(0, state.hp - amount); state.damageTaken += amount; state.hits++;
    state.invulnerable = 0.85; state.hurt = 0.35; state.combo = state.comboTime = 0;
    effect('hurt', state.player.x, state.player.z); event('hurt');
    if (state.hp <= 0) { state.mode = 'lost'; state.reason = 'The thread broke. Your next attempt can be a better memory.'; event('lost'); }
  }
  function hitEnemy(enemy, damage, trapped) {
    if (enemy.hp <= 0) return;
    enemy.hp -= damage; enemy.hit = 0.14; enemy.stun = 0.12;
    if (enemy.hp > 0) return;
    state.kills++;
    if (trapped) { state.combo++; state.comboTime = 4; state.peakCombo = Math.max(state.peakCombo, state.combo); }
    const multiplier = trapped ? Math.min(4, 1 + Math.floor(state.combo / 4)) : 1;
    state.maxHarmony = Math.max(state.maxHarmony, multiplier);
    state.beats = Math.min(60, state.beats + (trapped ? 1.5 : 0.75));
    state.score += ENEMIES[enemy.type].value * multiplier;
    effect('catch', enemy.x, enemy.z, multiplier);
  }
  function completed() { return state.blooms.every(bloom => bloom.charge >= bloom.need - 0.001); }
  function win() {
    if (state.mode !== 'playing') return;
    state.mode = 'won'; state.score += 1000 + Math.round(state.hp * 2) + Math.max(0, room.par + 2 - state.loop) * 150;
    effect('win', 0, 0, 3); event('won');
  }
  function snap() {
    if (state.mode !== 'playing' || state.snapCooldown > 0) return false;
    geometry(); state.snapCooldown = state.difficulty === 'flow' ? 1.25 : 1.4; state.pulse = 0.4; state.snaps++;
    const wide = state.area >= 8, power = state.area >= 32 ? 3 : 2;
    let caught = 0;
    for (const enemy of state.enemies) {
      const trapped = wide && insideTriangle(enemy.x, enemy.z, state.sail);
      if (trapped || Math.hypot(enemy.x - state.player.x, enemy.z - state.player.z) < 1.7) {
        hitEnemy(enemy, trapped ? power : 1, trapped); caught++;
      }
    }
    for (const bullet of state.bullets) {
      if (bullet.life > 0 && wide && insideTriangle(bullet.x, bullet.z, state.sail)) {
        bullet.life = 0; state.beats = Math.min(60, state.beats + 0.25); state.caught++; effect('shield', bullet.x, bullet.z, 0.5);
      }
    }
    let fed = 0;
    if (wide) for (const bloom of state.blooms) {
      if (bloom.index >= state.loop || bloom.charge >= bloom.need || state.beats < 0.25) continue;
      const [x, z] = bloomPosition(room, bloom.index, state.loopTicks * STEP);
      if (!insideTriangle(x, z, state.sail) || (room.edge && edgeDistance(x, z, state.sail) > (state.difficulty === 'flow' ? 1.5 : 1))) continue;
      const transfer = Math.min(2, bloom.need - bloom.charge, state.beats);
      bloom.charge += transfer; state.beats -= transfer; fed += transfer; effect('feed', x, z, transfer);
      if (bloom.charge >= bloom.need - 0.001) { bloom.charge = bloom.need; state.score += 150; event('bloom', { index: bloom.index }); }
    }
    state.enemies = state.enemies.filter(enemy => enemy.hp > 0);
    state.bullets = state.bullets.filter(bullet => bullet.life > 0);
    if (completed()) {
      if (!room.boss) win();
      else if (!state.bossAwake) { state.bossAwake = true; state.bossClock = 1.8; event('boss'); }
      else if (state.area >= 22 && insideTriangle(0, -0.3, state.sail)) {
        state.bossHp = Math.max(0, state.bossHp - power); effect('boss', 0, -0.3, power); event('bossHit');
        if (!state.bossHp) win();
      }
    }
    event(wide ? 'snap' : 'thin', { caught, fed, power });
    return true;
  }
  function dash() {
    if (state.mode !== 'playing' || state.dashCooldown > 0) return false;
    state.dashCooldown = 2.6; state.dashTime = 0.22; state.dashSerial++; state.invulnerable = Math.max(state.invulnerable, 0.3);
    event('dash'); effect('dash', state.player.x, state.player.z, 1.2); return true;
  }
  function borrow() {
    if (state.mode !== 'playing' || state.borrowCooldown > 0 || !state.memories.length) return false;
    const options = state.memories.map(memory => memoryPosition(memory, state.loopTicks));
    options.sort((a, b) => Math.hypot(b[0] - state.player.x, b[1] - state.player.z) - Math.hypot(a[0] - state.player.x, a[1] - state.player.z));
    effect('borrow', state.player.x, state.player.z);
    [state.player.x, state.player.z] = options[0]; constrain(state.player);
    state.borrowCooldown = 6; state.invulnerable = Math.max(state.invulnerable, 0.65);
    geometry(); recordPoint(1); effect('borrow', state.player.x, state.player.z); event('borrow'); return true;
  }
  function bank() {
    if (state.mode !== 'playing' || state.loopTicks < 120) return false;
    if (state.loop >= state.maxLoops) { state.mode = 'lost'; state.reason = 'Out of thread. End your memories in different corners to open a wider sail.'; event('lost'); return true; }
    recordPoint();
    state.memories.push({ portal: (state.loop - 1) % 3, ticks: state.loopTicks, points: state.recording.map(point => [...point]) });
    if (state.memories.length > 2) state.memories.shift();
    state.mode = 'between'; state.bullets = []; geometry(); event('bank'); accumulator = 0; return true;
  }
  function nextLoop() {
    if (state.mode !== 'between') return false;
    state.loop++; beginLoop(); return true;
  }
  function shoot(x, z, angle, speed = 3.4) {
    if (state.bullets.length >= MAX_BULLETS) return;
    state.bullets.push({ id: ++serial, x, z, dx: Math.sin(angle) * speed, dz: Math.cos(angle) * speed, life: 6 });
  }
  function step(input) {
    state.ticks++; state.loopTicks++;
    const time = state.loopTicks * STEP, p = state.player;
    for (const key of ['snapCooldown', 'dashCooldown', 'borrowCooldown', 'dashTime', 'invulnerable', 'hurt', 'pulse', 'comboTime']) state[key] = Math.max(0, state[key] - STEP);
    if (!state.comboTime) state.combo = 0;
    let x = clamp(Number(input.x) || 0, -1, 1), z = clamp(Number(input.z) || 0, -1, 1);
    let length = Math.hypot(x, z); if (length > 1) { x /= length; z /= length; length = 1; }
    if (length > 0.08 && state.dashTime <= 0) { p.dx = x / length; p.dz = z / length; }
    const wind = room.wind ? Math.sin(time * 0.55) * 0.7 : 0;
    state.windX = wind; state.windZ = room.wind ? Math.cos(time * 0.4) * 0.25 : 0;
    if (state.dashTime > 0) { x = p.dx * 2.9; z = p.dz * 2.9; }
    p.x += (x * 4.3 + state.windX) * STEP; p.z += (z * 4.3 + state.windZ) * STEP; constrain(p);
    geometry();
    if (state.loopTicks % RECORD_EVERY === 0) recordPoint();
    if (input.pulse) snap();
    if (state.mode !== 'playing') return;
    state.nextSpawn -= STEP;
    if (state.nextSpawn <= 0) {
      spawn(room.pattern[state.spawnIndex++ % room.pattern.length]);
      state.nextSpawn += room.spawnGap * (state.difficulty === 'flow' ? 1.16 : 1);
    }
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) continue;
      enemy.age += STEP; enemy.shot = Math.max(0, enemy.shot - STEP); enemy.hit = Math.max(0, enemy.hit - STEP); enemy.stun = Math.max(0, enemy.stun - STEP);
      const dx = p.x - enemy.x, dz = p.z - enemy.z, distance = Math.hypot(dx, dz) || 0.001;
      const definition = ENEMIES[enemy.type]; enemy.angle = Math.atan2(dx, dz);
      let direction = 1;
      if (enemy.type === 'sentry') {
        direction = distance > 5 ? 1 : distance < 3.3 ? -0.6 : 0;
        if (enemy.shot <= 0) { for (const spread of [-0.17, 0, 0.17]) shoot(enemy.x, enemy.z, enemy.angle + spread); enemy.shot = state.difficulty === 'flow' ? 3.8 : 2.9; effect('warning', enemy.x, enemy.z); }
      }
      if (!enemy.stun) { const speed = room.enemySpeed * definition.speed * (state.difficulty === 'flow' ? 0.85 : 1); enemy.x += dx / distance * speed * STEP * direction; enemy.z += dz / distance * speed * STEP * direction; constrain(enemy, definition.radius); }
      if (distance < 0.7 && state.dashTime > 0 && enemy.dashHit !== state.dashSerial) { enemy.dashHit = state.dashSerial; hitEnemy(enemy, 2, state.area >= 8 && insideTriangle(enemy.x, enemy.z, state.sail)); }
      if (enemy.hp > 0 && distance < 0.42 + definition.radius) { hitPlayer(enemy.type === 'armor' ? 20 : 14); enemy.x -= dx / distance * 0.8; enemy.z -= dz / distance * 0.8; }
    }
    for (const bullet of state.bullets) {
      if (bullet.life <= 0) continue;
      bullet.life -= STEP; bullet.x += bullet.dx * STEP; bullet.z += bullet.dz * STEP;
      if (Math.hypot(bullet.x, bullet.z) > ROOM_RADIUS + 0.5) { bullet.life = 0; continue; }
      if (state.area >= 8 && insideTriangle(bullet.x, bullet.z, state.sail)) { bullet.life = 0; state.beats = Math.min(60, state.beats + 0.25); state.caught++; effect('shield', bullet.x, bullet.z, 0.5); }
      else if (Math.hypot(bullet.x - p.x, bullet.z - p.z) < 0.48) { bullet.life = 0; hitPlayer(12); }
    }
    state.ring = -1;
    if (room.id >= 4 || state.bossAwake) {
      const phase = time % 8;
      if (phase > 5) { state.ring = (phase - 5) * 3.1; if (Math.abs(Math.hypot(p.x, p.z) - state.ring) < 0.3) hitPlayer(13); }
    }
    if (state.bossAwake) {
      state.bossClock -= STEP;
      if (state.bossClock <= 0) { for (let n = 0; n < 10; n++) shoot(0, -0.3, n * Math.PI / 5 + time * 0.23, 2.5); state.bossClock = 2.1; event('bossShot'); }
    }
    state.enemies = state.enemies.filter(enemy => enemy.hp > 0);
    state.bullets = state.bullets.filter(bullet => bullet.life > 0);
    for (const fx of state.effects) fx.age += STEP;
    state.effects = state.effects.filter(fx => fx.age < 0.7);
    if (state.mode === 'playing' && state.loopTicks >= Math.round(state.duration / STEP)) bank();
  }
  function advance(seconds, input = {}) {
    if (state.mode !== 'playing' || !Number.isFinite(seconds) || seconds <= 0) return;
    accumulator += Math.min(seconds, 1);
    let steps = 0;
    while (accumulator + 1e-8 >= STEP && state.mode === 'playing' && steps++ < 61) { accumulator -= STEP; step(input); }
    if (state.mode !== 'playing') accumulator = 0;
  }
  function rating() { return state.loop <= room.par && state.hits <= 5 ? 3 : state.loop <= room.par + 2 ? 2 : 1; }
  function snapshot() {
    if (!['playing', 'paused', 'between', 'won'].includes(state.mode)) return null;
    const { effects, events, sail, ...data } = state;
    return JSON.parse(JSON.stringify({ schema: 1, ...data, serial }));
  }
  function restore(saved) {
    const data = parseBorrowedSave(saved);
    if (!data) return false;
    room = chamberFor(data.level); difficulty = data.difficulty; seed = data.seed; serial = data.serial;
    Object.assign(state, data, { effects: [], events: [] });
    state.mode = saved.mode === 'playing' ? 'paused' : saved.mode;
    accumulator = 0; geometry(); return true;
  }
  reset();
  return { state, get room() { return room; }, start, reset, pause, resume, advance, snap, dash, borrow, bank, nextLoop, rating, snapshot, restore, constrain };
}

export function parseBorrowedSave(saved) {
  if (!saved || saved.schema !== 1 || !['playing', 'paused', 'between', 'won'].includes(saved.mode) || !['flow', 'rift'].includes(saved.difficulty)) return null;
  const n = (v, lo = 0, hi = 10000000) => Number.isFinite(v) && v >= lo && v <= hi;
  const integer = (v, lo, hi) => Number.isInteger(v) && n(v, lo, hi);
  if (!integer(saved.level, 1, 6) || !integer(saved.seed, 0, 0xffffffff) || !integer(saved.random, 0, 0xffffffff) || !integer(saved.serial, 0, 10000000)) return null;
  const room = chamberFor(saved.level), duration = room.duration + (saved.difficulty === 'flow' ? 4 : 0), maxLoops = room.loops + (saved.difficulty === 'flow' ? 1 : 0);
  if (saved.duration !== duration || saved.maxLoops !== maxLoops || !integer(saved.loop, 1, maxLoops) || !integer(saved.loopTicks, 0, Math.round(duration / STEP)) || !integer(saved.ticks, saved.loopTicks, 10000000)) return null;
  if (!n(saved.hp, 0.001, saved.maxHp) || saved.maxHp !== (saved.difficulty === 'flow' ? 120 : 90) || !n(saved.beats, 0, 60) || !n(saved.bossHp, 0, 30) || typeof saved.bossAwake !== 'boolean') return null;
  if (!saved.player || !['x', 'z'].every(key => n(saved.player[key], -ROOM_RADIUS, ROOM_RADIUS)) || !['dx', 'dz'].every(key => n(saved.player[key], -1, 1))) return null;
  const point = p => Array.isArray(p) && (p.length === 3 || (p.length === 4 && p[3] === 1)) && integer(p[0], 0, Math.round(duration / STEP)) && n(p[1], -ROOM_RADIUS, ROOM_RADIUS) && n(p[2], -ROOM_RADIUS, ROOM_RADIUS);
  const recording = points => Array.isArray(points) && points.length > 0 && points.length <= 610 && points.every((p, i) => point(p) && (!i || p[0] > points[i - 1][0])) && points[0][0] === 0;
  if (!recording(saved.recording) || !Array.isArray(saved.memories) || saved.memories.length > 2 || !saved.memories.every(m => m && integer(m.portal, 0, 2) && integer(m.ticks, 120, Math.round(duration / STEP)) && recording(m.points) && m.points.at(-1)[0] === m.ticks)) return null;
  const recordedLoops = saved.loop - (saved.mode === 'between' ? 0 : 1);
  if (saved.recording.at(-1)[0] > saved.loopTicks || saved.memories.length !== Math.min(2, recordedLoops)
    || !saved.memories.every((m, i) => m.portal === (recordedLoops - saved.memories.length + i) % 3)
    || (saved.mode === 'between' && (saved.loop >= maxLoops || saved.recording.at(-1)[0] !== saved.loopTicks))) return null;
  if (!Array.isArray(saved.blooms) || saved.blooms.length !== 3 || !saved.blooms.every((b, i) => b && b.index === i && b.need === room.blooms[i][2] && n(b.charge, 0, b.need))) return null;
  const entry = e => e && integer(e.id, 1, saved.serial) && n(e.x, -10, 10) && n(e.z, -10, 10);
  if (!Array.isArray(saved.enemies) || saved.enemies.length > MAX_ENEMIES || !saved.enemies.every(e => entry(e) && ENEMIES[e.type] && n(e.hp, 0.001, ENEMIES[e.type].hp) && ['age', 'stun', 'hit'].every(key => n(e[key])) && n(e.shot, -1, 10) && n(e.angle, -Math.PI, Math.PI) && Number.isInteger(e.dashHit))) return null;
  if (!Array.isArray(saved.bullets) || saved.bullets.length > MAX_BULLETS || !saved.bullets.every(b => entry(b) && n(b.life, 0.001, 6) && n(b.dx, -5, 5) && n(b.dz, -5, 5))) return null;
  if (!['score', 'combo', 'comboTime', 'peakCombo', 'kills', 'caught', 'snaps', 'hits', 'damageTaken', 'largestSail', 'maxHarmony', 'spawnIndex', 'nextSpawn', 'snapCooldown', 'dashCooldown', 'borrowCooldown', 'dashTime', 'dashSerial', 'invulnerable', 'pulse', 'hurt', 'bossClock'].every(key => n(saved[key], key === 'bossClock' ? -1 : 0))) return null;
  if (!n(saved.ring, -1, 10) || !n(saved.windX, -1, 1) || !n(saved.windZ, -1, 1) || !n(saved.area, 0, 120) || typeof saved.reason !== 'string' || saved.reason.length > 200) return null;
  if (saved.mode === 'won' && (!saved.blooms.every(b => b.charge >= b.need) || (room.boss && saved.bossHp > 0))) return null;
  const fields = ['schema', 'mode', 'level', 'difficulty', 'seed', 'random', 'serial', 'ticks', 'loopTicks', 'loop', 'duration', 'maxLoops', 'hp', 'maxHp', 'beats', 'score', 'combo', 'comboTime', 'peakCombo', 'kills', 'caught', 'snaps', 'hits', 'damageTaken', 'largestSail', 'maxHarmony', 'player', 'area', 'memories', 'recording', 'blooms', 'enemies', 'bullets', 'spawnIndex', 'nextSpawn', 'snapCooldown', 'dashCooldown', 'borrowCooldown', 'dashTime', 'dashSerial', 'invulnerable', 'pulse', 'hurt', 'bossHp', 'bossAwake', 'bossClock', 'ring', 'windX', 'windZ', 'reason'];
  return JSON.parse(JSON.stringify(Object.fromEntries(fields.map(key => [key, saved[key]]))));
}
