// Dewdrop Drift: every drop feels the same tilt. Physics and captures are
// fixed-step and independent of presentation, screen size and frame rate.
export const STEP = 1 / 60;
export const BOARD_RADIUS = 5.35;
export const BALL_RADIUS = 0.28;
export const MAX_SPEED = 3.7;
export const MAX_EFFECTS = 64;
const clone = value => JSON.parse(JSON.stringify(value));
const point = (x, z) => Object.freeze({ x, z });
const circles = data => Object.freeze(data.map(([x, z, radius]) => Object.freeze({ x, z, radius })));
const level = (id, name, subtitle, balls, flowers, rocks = [], springs = [], puddles = [], wind = 0) => Object.freeze({
  id, name, subtitle, balls: Object.freeze(balls.map(([x, z]) => point(x, z))),
  flowers: Object.freeze(flowers.map(([x, z], i) => Object.freeze({ id: i, x, z }))), rocks: circles(rocks), puddles: circles(puddles),
  springs: Object.freeze(springs.map(([x, z, dx, dz]) => Object.freeze({ x, z, dx, dz, radius: 0.7 }))), wind,
});
export const LEVELS = Object.freeze([
  level(1, 'Morning dew', 'Three little drops. Three thirsty flowers.', [[-2.1, 2.4], [0, 2.4], [2.1, 2.4]], [[-2.1, -2.2], [0, -2.2], [2.1, -2.2]]),
  level(2, 'Pebble promenade', 'A little curve around the stones.', [[-2.5, 2.5], [0, 2.9], [2.5, 2.5]], [[-2.8, -2.5], [0, -2.9], [2.8, -2.5]], [[0, 0, .85], [-2.5, .15, .5], [2.5, .15, .5]]),
  level(3, 'The petal turn', 'The whole garden leans together.', [[-3.1, 1.5], [-2.5, 2.2], [-1.7, 2.9]], [[-2.8, -2.4], [2.3, -2.5], [3.4, 1]], [[-1, .2, .75], [1, -.8, .7]]),
  level(4, 'A little spring', 'Pink spring leaves give your drops a nudge.', [[-2.8, 2], [-.8, 2.8], [1.2, 2.5], [2.8, 1.8]], [[-3, -2], [-1, -3.1], [1.3, -3.1], [3.2, -1.8]], [[0, 0, .8]], [[-2.2, .1, 0, -1], [2.2, .1, 0, -1]]),
  level(5, 'Breezy blue', 'A soft breeze. A few little puddles.', [[-3, 2.5], [-1, 2.9], [1, 2.9], [3, 2.5]], [[-3, -2.6], [-1, -3.1], [1.2, -3.1], [3.2, -2.3]], [[-1.6, 0, .65], [1.6, 0, .65]], [[0, -1.1, 0, -1]], [[-4, 0, .55], [4, 0, .55]], .36),
  level(6, 'The sunset garden', 'Let the whole little island bloom.', [[-3, 2.5], [-1.6, 3.1], [0, 3.3], [1.6, 3.1], [3, 2.5]], [[-4, -.3], [-2.6, -3], [0, -3.6], [2.6, -3], [4, -.3]], [[-1.1, .1, .7], [1.1, .1, .7], [0, -1.8, .6]], [[-3, 1, 0, -1], [3, 1, 0, -1]], [[0, 1.3, .6]], .24),
]);
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const forLevel = id => LEVELS.find(item => item.id === Number(id)) || LEVELS[0];
export function createDewfall({ level: requestedLevel = 1 } = {}) {
  const state = {};
  let current = forLevel(requestedLevel), accumulator = 0, serial = 0;
  const event = (type, detail = {}) => { state.events.push({ type, ...detail }); if (state.events.length > 40) state.events.shift(); };
  const effect = (type, x, z, duration = .7) => { if (state.effects.length >= MAX_EFFECTS) state.effects.shift(); state.effects.push({ id: ++serial, type, x, z, age: 0, duration }); };
  function reset(id = current.id) {
    current = forLevel(id); accumulator = 0; serial = 0;
    Object.assign(state, { mode: 'ready', level: current.id, ticks: 0, tilt: { x: 0, z: 0 }, gestures: 0, spilling: 0,
      balls: current.balls.map((p, id) => ({ id, x: p.x, z: p.z, vx: 0, vz: 0, status: 'rolling', flowerId: null, returnTicks: 0, springCooldown: 0 })),
      flowers: current.flowers.map(p => ({ ...p, filled: false, ballId: null })), bloomed: 0, total: current.flowers.length,
      spills: 0, travel: 0, score: 0, stars: 0, effects: [], events: [], dragging: false,
    }); return state;
  }
  function start(id = current.id) { reset(id); state.mode = 'playing'; event('start', { level: state.level }); return state; }
  function beginTilt() { if (state.mode !== 'playing' || state.dragging) return false; state.dragging = true; state.gestures++; event('tilt'); return true; }
  function endTilt() { state.dragging = false; state.tilt.x = state.tilt.z = 0; }
  function pause() { if (state.mode !== 'playing') return false; endTilt(); state.mode = 'paused'; accumulator = 0; event('pause'); return true; }
  function resume() { if (state.mode !== 'paused') return false; state.mode = 'playing'; accumulator = 0; event('resume'); return true; }
  function retry() { if (state.mode === 'ready') return false; start(current.id); return true; }
  function next() { if (state.mode !== 'won' || current.id >= LEVELS.length) return false; start(current.id + 1); return true; }
  function bloom(ball, flower) {
    ball.status = 'bloomed'; ball.flowerId = flower.id; ball.x = flower.x; ball.z = flower.z; ball.vx = ball.vz = 0;
    flower.filled = true; flower.ballId = ball.id; state.bloomed++; state.score += 200;
    effect('bloom', flower.x, flower.z, 1.15); event('bloom', { flowerId: flower.id, bloomed: state.bloomed, total: state.total });
    if (state.bloomed === state.total) {
      state.mode = 'won'; endTilt(); state.stars = state.spills <= 1 ? 3 : state.spills <= 4 ? 2 : 1;
      state.score += 600 + state.stars * 150 + Math.max(0, 350 - Math.round(state.travel));
      effect('win', 0, 0, 1.5); event('won', { stars: state.stars }); accumulator = 0;
    }
  }
  function spill(ball) { ball.status = 'returning'; ball.returnTicks = 42; ball.vx = ball.vz = 0; state.spills++; effect('spill', ball.x, ball.z); event('spill', { ballId: ball.id }); }
  function captureAlong(ball, fromX, fromZ) {
    const dx = ball.x - fromX, dz = ball.z - fromZ, length = dx * dx + dz * dz;
    for (const flower of state.flowers) {
      if (flower.filled) continue;
      const t = length ? clamp(((flower.x - fromX) * dx + (flower.z - fromZ) * dz) / length, 0, 1) : 0;
      if (Math.hypot(flower.x - fromX - dx * t, flower.z - fromZ - dz * t) < .62) { bloom(ball, flower); return true; }
    }
    return false;
  }
  function step(input) {
    state.ticks++;
    state.tilt.x = input.x; state.tilt.z = input.z;
    const moving = Math.hypot(input.x, input.z) > .025, friction = moving ? 2.35 : 5.6;
    const breeze = current.wind * Math.sin(state.ticks / 110);
    for (const ball of state.balls) {
      if (ball.status === 'bloomed') continue;
      if (ball.status === 'returning') {
        ball.returnTicks--;
        if (ball.returnTicks <= 0) { const start = current.balls[ball.id]; ball.x = start.x; ball.z = start.z; ball.vx = ball.vz = 0; ball.status = 'rolling'; ball.returnTicks = 0; effect('return', ball.x, ball.z); event('return', { ballId: ball.id }); }
        continue;
      }
      ball.springCooldown = Math.max(0, ball.springCooldown - 1);
      const fromX = ball.x, fromZ = ball.z;
      ball.vx = (ball.vx + (input.x * 10 + (moving ? breeze : 0)) * STEP) * Math.exp(-friction * STEP);
      ball.vz = (ball.vz + input.z * 10 * STEP) * Math.exp(-friction * STEP);
      const speed = Math.hypot(ball.vx, ball.vz); if (speed > MAX_SPEED) { ball.vx *= MAX_SPEED / speed; ball.vz *= MAX_SPEED / speed; }
      ball.x += ball.vx * STEP; ball.z += ball.vz * STEP;
      for (const rock of current.rocks) {
        let dx = ball.x - rock.x, dz = ball.z - rock.z, distance = Math.hypot(dx, dz), radius = rock.radius + BALL_RADIUS;
        if (distance < radius) {
          if (distance < .00001) { dx = 1; dz = 0; distance = 1; }
          const nx = dx / distance, nz = dz / distance; ball.x = rock.x + nx * radius; ball.z = rock.z + nz * radius;
          const dot = ball.vx * nx + ball.vz * nz; if (dot < 0) { ball.vx -= dot * nx * 1.25; ball.vz -= dot * nz * 1.25; }
        }
      }
      const distance = Math.hypot(ball.x, ball.z), edge = BOARD_RADIUS - BALL_RADIUS;
      if (distance > edge) {
        const nx = ball.x / distance, nz = ball.z / distance; ball.x = nx * edge; ball.z = nz * edge;
        const dot = ball.vx * nx + ball.vz * nz; if (dot > 0) { ball.vx -= dot * nx * 1.45; ball.vz -= dot * nz * 1.45; }
      }
      state.travel += Math.hypot(ball.x - fromX, ball.z - fromZ);
      if (captureAlong(ball, fromX, fromZ)) continue;
      if (current.puddles.some(puddle => Math.hypot(ball.x - puddle.x, ball.z - puddle.z) < puddle.radius)) { spill(ball); continue; }
      if (!ball.springCooldown) for (const spring of current.springs) if (Math.hypot(ball.x - spring.x, ball.z - spring.z) < spring.radius) {
        ball.vx += spring.dx * 1.3; ball.vz += spring.dz * 1.3; ball.springCooldown = 60;
        effect('spring', spring.x, spring.z, .5); event('spring'); break;
      }
    }
    const rolling = state.balls.filter(ball => ball.status === 'rolling');
    for (let i = 0; i < rolling.length; i++) for (let j = i + 1; j < rolling.length; j++) {
      const a = rolling[i], b = rolling[j]; let dx = b.x - a.x, dz = b.z - a.z, distance = Math.hypot(dx, dz);
      if (distance >= BALL_RADIUS * 2) continue;
      const nx = distance < .00001 ? 1 : dx / distance, nz = distance < .00001 ? 0 : dz / distance;
      const shift = Math.max(0, BALL_RADIUS * 2 - distance) * .5;
      a.x -= nx * shift; a.z -= nz * shift; b.x += nx * shift; b.z += nz * shift;
      const relative = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (relative < 0) { const impulse = relative * .65; a.vx += impulse * nx; a.vz += impulse * nz; b.vx -= impulse * nx; b.vz -= impulse * nz; }
    }
    for (const item of state.effects) item.age += STEP;
    state.effects = state.effects.filter(item => item.age < item.duration);
    if (state.mode === 'won') state.tilt.x = state.tilt.z = 0;
  }
  function advance(seconds, control = {}) {
    if (state.mode !== 'playing' || !Number.isFinite(seconds) || seconds <= 0) return;
    control ||= {};
    let x = Number.isFinite(control.x) ? clamp(control.x, -1, 1) : 0, z = Number.isFinite(control.z) ? clamp(control.z, -1, 1) : 0;
    const length = Math.hypot(x, z); if (length > 1) { x /= length; z /= length; }
    accumulator += Math.min(1, seconds); let steps = 0;
    while (accumulator + 1e-8 >= STEP && state.mode === 'playing' && steps++ < 61) { accumulator -= STEP; step({ x, z }); }
    if (state.mode === 'won') accumulator = 0;
  }
  function snapshot() {
    if (state.mode === 'ready') return null;
    const { effects, events, ...data } = state;
    return clone({ schema: 1, ...data, tilt: { x: 0, z: 0 }, dragging: false, serial });
  }
  function restore(saved) {
    const data = parseDewfallSave(saved); if (!data) return false;
    current = forLevel(data.level); serial = data.serial; accumulator = 0;
    Object.assign(state, data, { events: [], effects: [], mode: data.mode === 'playing' ? 'paused' : data.mode }); return true;
  }
  reset(); return { state, get level() { return current; }, start, beginTilt, endTilt, advance, pause, resume, retry, next, snapshot, restore };
}

export function parseDewfallSave(saved) {
  const finite = (n, low, high) => typeof n === 'number' && Number.isFinite(n) && n >= low && n <= high;
  const integer = (n, low, high) => Number.isInteger(n) && n >= low && n <= high;
  if (!saved || saved.schema !== 1 || !integer(saved.level, 1, LEVELS.length) || !['playing', 'paused', 'won'].includes(saved.mode)
    || !integer(saved.ticks, 0, 1e9) || !integer(saved.serial, 0, 1e9) || !integer(saved.gestures, 0, 1e7)
    || !integer(saved.spills, 0, 1e7) || !finite(saved.travel, 0, 1e9) || !integer(saved.score, 0, 1e9) || !integer(saved.stars, 0, 3)
    || saved.dragging !== false || saved.tilt?.x !== 0 || saved.tilt?.z !== 0 || saved.spilling !== 0) return null;
  const current = LEVELS[saved.level - 1], total = current.flowers.length;
  if (saved.total !== total || !integer(saved.bloomed, 0, total) || !Array.isArray(saved.balls) || saved.balls.length !== total || !Array.isArray(saved.flowers) || saved.flowers.length !== total) return null;
  for (let i = 0; i < total; i++) {
    const ball = saved.balls[i], flower = saved.flowers[i], def = current.flowers[i];
    if (!ball || ball.id !== i || !finite(ball.x, -6, 6) || !finite(ball.z, -6, 6) || !finite(ball.vx, -6, 6) || !finite(ball.vz, -6, 6)
      || !['rolling', 'returning', 'bloomed'].includes(ball.status) || !integer(ball.returnTicks, 0, 42) || !integer(ball.springCooldown, 0, 60)) return null;
    if (!flower || flower.id !== i || flower.x !== def.x || flower.z !== def.z || typeof flower.filled !== 'boolean') return null;
    if (ball.status === 'bloomed') {
      if (!integer(ball.flowerId, 0, total - 1) || ball.returnTicks || ball.vx || ball.vz) return null;
      const target = saved.flowers[ball.flowerId];
      if (!target || !target.filled || target.ballId !== i || ball.x !== target.x || ball.z !== target.z) return null;
    } else if (ball.flowerId !== null || (ball.status === 'returning' ? ball.returnTicks < 1 || ball.vx || ball.vz : ball.returnTicks !== 0)) return null;
    if (flower.filled) { if (!integer(flower.ballId, 0, total - 1) || saved.balls[flower.ballId]?.flowerId !== i) return null; }
    else if (flower.ballId !== null) return null;
  }
  if (saved.balls.filter(ball => ball.status === 'bloomed').length !== saved.bloomed || saved.flowers.filter(flower => flower.filled).length !== saved.bloomed) return null;
  if (saved.mode === 'won' ? saved.bloomed !== total || saved.stars < 1 : saved.bloomed === total || saved.stars !== 0) return null;
  const earnedStars = saved.spills <= 1 ? 3 : saved.spills <= 4 ? 2 : 1;
  if (saved.mode === 'won' && saved.stars !== earnedStars) return null;
  const earnedScore = saved.bloomed * 200 + (saved.mode === 'won' ? 600 + saved.stars * 150 + Math.max(0, 350 - Math.round(saved.travel)) : 0);
  if (saved.score !== earnedScore) return null;
  const keys = ['schema', 'mode', 'level', 'ticks', 'tilt', 'gestures', 'spilling', 'balls', 'flowers', 'bloomed', 'total', 'spills', 'travel', 'score', 'stars', 'dragging', 'serial'];
  return clone(Object.fromEntries(keys.map(key => [key, saved[key]])));
}
