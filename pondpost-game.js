// Pond Post's side-view flight is deterministic and independent of Three.js.
// Preview and gameplay use the very same fixed-step motion and collision code.
export const STEP = 1 / 60;
export const GRAVITY = 12;
export const MAX_SPEED = 12;
export const MAX_VY = 10.8;
export const MAX_EFFECTS = 80;
export const WORLD_EDGE = 5.2;
const PERFECT_DISTANCE = 0.32;
const TAU = Math.PI * 2;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

const pad = (id, x, y, width = 2.5, amplitude = 0, period = 0, phase = 0) => Object.freeze({ id, x, y, width, amplitude, period, phase });
const stamp = (id, padId, offsetX = 0, height = 0.8) => Object.freeze({ id, padId, offsetX, height });
const route = (id, name, subtitle, pads, stampPads, strength = 0, speed = 0, phase = 0) => Object.freeze({
  id, name, subtitle, pads: Object.freeze(pads.map((values, i) => pad(i, ...values))),
  stamps: Object.freeze(stampPads.map((padId, i) => stamp(i, padId, i % 2 ? -0.22 : 0.22))),
  goalPad: pads.length - 1, wind: Object.freeze({ strength, speed, phase }),
});
export const LEVELS = Object.freeze([
  route(1, 'The first delivery', 'A gentle leap is a lovely start.', [
    [0, 0, 2.8], [-1.5, 1.8, 2.6], [1.3, 3.6, 2.6], [-1.4, 5.4, 2.6], [1.2, 7.2, 2.6], [0, 9, 2.8],
  ], [1, 3, 4]),
  route(2, 'The wobble way', 'Wait for a drifting leaf, then take the leap.', [
    [0, 0, 2.8], [-1.6, 1.8, 2.5, 0.55, 5.5, 0], [1.4, 3.6, 2.5], [-1.5, 5.4, 2.5, 0.65, 5.2, 1.2],
    [1.5, 7.2, 2.5], [-1.1, 9, 2.5, 0.5, 5.8, 2.1], [0.8, 10.8, 2.8],
  ], [1, 3, 5]),
  route(3, 'The dancing reeds', 'Some leaves sway to their own beat.', [
    [0, 0, 2.8], [-1.65, 1.9, 2.5, 0.7, 5.4, 0], [1.4, 3.8, 2.5, 0.6, 5.7, Math.PI],
    [-1.55, 5.7, 2.5], [1.45, 7.6, 2.45, 0.7, 5, 1.3], [-1.4, 9.5, 2.5, 0.55, 5.6, 3.5], [0.7, 11.4, 2.8],
  ], [1, 3, 5]),
  route(4, 'The breezy bend', 'The dotted arc follows the breeze.', [
    [0, 0, 2.8], [-1.4, 1.85, 2.5], [1.5, 3.7, 2.4, 0.55, 5, 0.7], [-1.55, 5.55, 2.45],
    [1.5, 7.4, 2.4, 0.6, 5.2, 2], [-1.4, 9.25, 2.45], [1.3, 11.1, 2.4, 0.5, 5.7, 1], [-0.4, 12.95, 2.8],
  ], [1, 3, 5, 6], 1.0, 0.62, 0.35),
  route(5, 'Sunset special', 'One last little letter, high above the pond.', [
    [0, 0, 2.8], [-1.6, 2.05, 2.45, 0.5, 5.1, 0], [1.55, 4.1, 2.4, 0.55, 5.5, 2.2],
    [-1.65, 6.15, 2.4], [1.5, 8.2, 2.4, 0.7, 4.9, 0.9], [-1.5, 10.25, 2.4, 0.65, 5.8, 3.1],
    [1.45, 12.3, 2.4], [-1.4, 14.35, 2.45, 0.6, 5.4, 1.7], [0.4, 16.4, 2.8],
  ], [1, 3, 5, 7], 0.8, 0.7, 0.8),
]);
const forLevel = id => LEVELS.find(level => level.id === Number(id)) || LEVELS[0];
const clone = value => JSON.parse(JSON.stringify(value));

// `ticks` may be fractional when resolving a crossing within a fixed step.
// The optional output object allows the renderer to reuse temporary storage.
export function getPadPosition(item, ticks, out = {}) {
  const time = Number(ticks) * STEP;
  out.id = item.id; out.x = item.x + (item.amplitude && item.period ? item.amplitude * Math.sin(time * TAU / item.period + item.phase) : 0);
  out.y = item.y; out.width = item.width; return out;
}
export function windAt(level, ticks) {
  const config = typeof level === 'object' ? level.wind : forLevel(level).wind;
  return config.strength ? config.strength * Math.sin(Number(ticks) * STEP * config.speed + config.phase) : 0;
}

export function createPondPost({ level: requestedLevel = 1 } = {}) {
  let current = forLevel(requestedLevel), accumulator = 0, serial = 0;
  const state = {}, scratchPad = {}, scratchEndPad = {}, stepResult = { landing: null, fell: false };
  function event(type, detail = {}) { state.events.push({ type, ...detail }); if (state.events.length > 32) state.events.shift(); }
  function effect(type, x, y, duration = 0.65) {
    if (state.effects.length >= MAX_EFFECTS) state.effects.shift();
    state.effects.push({ id: ++serial, type, x, y, age: 0, duration });
  }
  function getPad(id) { return current.pads[id]; }
  function updateStamps() {
    for (const item of state.stamps) {
      const def = current.stamps[item.id], center = getPadPosition(getPad(def.padId), state.ticks, scratchPad);
      item.x = center.x + def.offsetX; item.y = center.y + def.height;
    }
  }
  function reset(id = current.id) {
    current = forLevel(id); accumulator = 0; serial = 0;
    const start = getPadPosition(current.pads[0], 0);
    Object.assign(state, {
      mode: 'ready', level: current.id, ticks: 0, player: { x: start.x, y: start.y, vx: 0, vy: 0 },
      padId: 0, checkpoint: 0, bestProgress: 0, padOffset: 0, aim: { vx: 0, vy: 0 },
      stamps: current.stamps.map(item => ({ id: item.id, padId: item.padId, x: 0, y: 0, collected: false })),
      landed: [0], jumps: 0, misses: 0, perfects: 0, streak: 0, bestStreak: 0,
      score: 0, stars: 0, wind: windAt(current, 0), events: [], effects: [], resumeMode: 'playing', recoveryTicks: 0,
    });
    updateStamps(); return state;
  }
  function start(id = current.id) { reset(id); state.mode = 'playing'; event('start', { level: current.id }); return state; }
  function beginAim() {
    if (state.mode !== 'playing') return false;
    state.mode = 'aiming'; state.aim = { vx: 0, vy: 0 }; event('aimStart'); return true;
  }
  function aim(vector) {
    if (state.mode !== 'aiming' || !vector || !Number.isFinite(vector.vx) || !Number.isFinite(vector.vy)) return false;
    let vx = clamp(vector.vx, -MAX_SPEED, MAX_SPEED), vy = clamp(vector.vy, -MAX_SPEED, MAX_VY);
    const speed = Math.hypot(vx, vy); if (speed > MAX_SPEED) { vx *= MAX_SPEED / speed; vy *= MAX_SPEED / speed; }
    state.aim = { vx, vy }; return true;
  }
  function cancelAim() {
    if (state.mode !== 'aiming') return false;
    state.mode = 'playing'; state.aim = { vx: 0, vy: 0 }; event('cancel'); return true;
  }
  function launch() {
    if (state.mode !== 'aiming') return false;
    if (state.aim.vy < 1.3) { cancelAim(); event('invalid'); return false; }
    Object.assign(state.player, { vx: state.aim.vx, vy: state.aim.vy });
    state.mode = 'flying'; state.jumps++; accumulator = 0;
    effect('launch', state.player.x, state.player.y); event('launch', { vx: state.player.vx, vy: state.player.vy });
    state.aim = { vx: 0, vy: 0 }; return true;
  }
  // Mutate one motion object for one physics tick. The same routine is used
  // for a real frog and the non-mutating aim preview.
  function flightStep(motion, tick, checkpoint, result) {
    result.landing = null; result.fell = false;
    const fromX = motion.x, fromY = motion.y;
    motion.vx += windAt(current, tick) * STEP; motion.vy -= GRAVITY * STEP;
    motion.x += motion.vx * STEP; motion.y += motion.vy * STEP;
    if (motion.vy < 0 && motion.y < fromY) {
      let hit, top = -Infinity;
      for (const item of current.pads) {
        if (fromY + 1e-9 < item.y || motion.y - 1e-9 > item.y || item.y < top) continue;
        const fraction = clamp((fromY - item.y) / (fromY - motion.y), 0, 1);
        const crossX = fromX + (motion.x - fromX) * fraction;
        const center = getPadPosition(item, tick - 1 + fraction, scratchPad);
        if (Math.abs(crossX - center.x) > item.width / 2) continue;
        const perfect = Math.abs(crossX - center.x) <= PERFECT_DISTANCE;
        const end = getPadPosition(item, tick, scratchEndPad);
        const x = clamp(crossX, end.x - item.width / 2 + 0.08, end.x + item.width / 2 - 0.08);
        hit = { padId: item.id, x, y: item.y, perfect }; top = item.y;
      }
      if (hit) { motion.x = hit.x; motion.y = hit.y; result.landing = hit; return result; }
    }
    if (Math.abs(motion.x) > WORLD_EDGE || motion.y < getPad(checkpoint).y - 3) result.fell = true;
    return result;
  }
  function preview() {
    if (state.mode !== 'aiming' || state.aim.vy < 1.3) return { points: [], landing: null };
    const motion = { x: state.player.x, y: state.player.y, vx: state.aim.vx, vy: state.aim.vy }, result = { landing: null, fell: false };
    const points = [{ x: motion.x, y: motion.y }];
    let arrivalTick = null;
    for (let i = 1; i <= 200; i++) {
      flightStep(motion, state.ticks + i, state.checkpoint, result);
      if (i % 3 === 0 || result.landing || result.fell) points.push({ x: motion.x, y: motion.y });
      if (result.landing || result.fell) { if (result.landing) arrivalTick = state.ticks + i; break; }
    }
    return result.landing ? { points, landing: result.landing, arrivalTick } : { points, landing: null };
  }
  function collectStamps(fromX, fromY) {
    const toX = state.player.x, toY = state.player.y + 0.35, aY = fromY + 0.35, dx = toX - fromX, dy = toY - aY;
    const lengthSquared = dx * dx + dy * dy;
    for (const item of state.stamps) {
      if (item.collected) continue;
      const t = lengthSquared ? clamp(((item.x - fromX) * dx + (item.y - aY) * dy) / lengthSquared, 0, 1) : 0;
      if (Math.hypot(item.x - (fromX + dx * t), item.y - (aY + dy * t)) > 0.72) continue;
      item.collected = true; state.score += 120; effect('stamp', item.x, item.y); event('stamp', { id: item.id });
    }
  }
  function finish() {
    const gathered = state.stamps.filter(item => item.collected).length;
    const clean = state.misses <= 1, collected = gathered >= Math.ceil(state.stamps.length / 2);
    state.stars = clean && collected && state.perfects >= 2 ? 3 : clean || collected ? 2 : 1;
    state.score += 500 + Math.max(0, 250 - state.misses * 50);
    state.mode = 'won'; state.resumeMode = 'playing'; effect('win', state.player.x, state.player.y, 1.3);
    event('won', { stars: state.stars, score: state.score }); accumulator = 0;
  }
  function land(hit) {
    const p = state.player, item = getPad(hit.padId), center = getPadPosition(item, state.ticks, scratchPad);
    p.x = hit.x; p.y = hit.y; p.vx = p.vy = 0; state.padId = state.checkpoint = item.id;
    state.padOffset = clamp(hit.x - center.x, -item.width / 2 + 0.08, item.width / 2 - 0.08);
    const firstVisit = !state.landed.includes(item.id);
    if (firstVisit) {
      state.landed.push(item.id); state.bestProgress = Math.max(state.bestProgress, item.id);
      state.score += 100;
      if (hit.perfect) { state.perfects++; state.streak++; state.bestStreak = Math.max(state.bestStreak, state.streak); state.score += 50 + Math.min(4, state.streak - 1) * 25; }
      else state.streak = 0;
    }
    state.mode = 'playing'; effect('landing', p.x, p.y); event('landing', { padId: item.id, perfect: hit.perfect && firstVisit, firstVisit });
    if (hit.perfect && firstVisit) { effect('perfect', p.x, p.y, 0.9); event('perfect', { streak: state.streak }); }
    if (item.id === current.goalPad) finish();
  }
  function miss() {
    state.mode = 'recovering'; state.recoveryTicks = 36; state.misses++; state.streak = 0;
    effect('splash', state.player.x, state.player.y, 0.8); event('splash', { padId: state.checkpoint });
  }
  function step() {
    state.ticks++; state.wind = windAt(current, state.ticks); updateStamps();
    if (state.mode === 'playing' || state.mode === 'aiming') {
      const p = getPadPosition(getPad(state.padId), state.ticks, scratchPad);
      state.player.x = p.x + state.padOffset; state.player.y = p.y;
    } else if (state.mode === 'flying') {
      const fromX = state.player.x, fromY = state.player.y;
      flightStep(state.player, state.ticks, state.checkpoint, stepResult); collectStamps(fromX, fromY);
      if (stepResult.landing) land(stepResult.landing); else if (stepResult.fell) miss();
    } else if (state.mode === 'recovering') {
      state.recoveryTicks--;
      if (state.recoveryTicks <= 0) {
        const p = getPadPosition(getPad(state.checkpoint), state.ticks, scratchPad);
        state.player.x = p.x + state.padOffset; state.player.y = p.y; state.player.vx = state.player.vy = 0;
        state.padId = state.checkpoint; state.recoveryTicks = 0; state.mode = 'playing';
        effect('recover', state.player.x, state.player.y); event('recover', { padId: state.padId });
      }
    }
    for (const item of state.effects) item.age += STEP;
    state.effects = state.effects.filter(item => item.age < item.duration);
  }
  function advance(seconds) {
    if (!['playing', 'aiming', 'flying', 'recovering'].includes(state.mode) || !Number.isFinite(seconds) || seconds <= 0) return;
    accumulator += Math.min(seconds, 1);
    let steps = 0;
    while (accumulator + 1e-8 >= STEP && ['playing', 'aiming', 'flying', 'recovering'].includes(state.mode) && steps++ < 61) { accumulator -= STEP; step(); }
    if (state.mode === 'won') accumulator = 0;
  }
  function pause() {
    if (state.mode === 'aiming') cancelAim();
    if (!['playing', 'flying', 'recovering'].includes(state.mode)) return false;
    state.resumeMode = state.mode; state.mode = 'paused'; accumulator = 0; event('pause'); return true;
  }
  function resume() {
    if (state.mode !== 'paused') return false;
    state.mode = state.resumeMode; state.resumeMode = 'playing'; accumulator = 0; event('resume'); return true;
  }
  function retry() {
    if (state.mode === 'ready') return false;
    start(current.id); event('retry', { level: current.id }); return true;
  }
  function next() {
    if (state.mode !== 'won' || state.level >= LEVELS.length) return false;
    start(state.level + 1); return true;
  }
  function snapshot() {
    if (state.mode === 'ready') return null;
    const { effects, events, ...data } = state;
    if (state.mode === 'aiming') Object.assign(data, { mode: 'playing', aim: { vx: 0, vy: 0 } });
    return clone({ schema: 1, ...data, serial });
  }
  function restore(saved) {
    const data = parsePondPostSave(saved); if (!data) return false;
    current = forLevel(data.level); serial = data.serial; accumulator = 0;
    Object.assign(state, data, { events: [], effects: [] });
    if (['playing', 'flying', 'recovering'].includes(state.mode)) { state.resumeMode = state.mode; state.mode = 'paused'; }
    return true;
  }
  reset();
  return { state, get level() { return current; }, start, beginAim, aim, launch, cancelAim, preview, pause, resume, advance, retry, next, snapshot, restore };
}

// Checkpoints are small and fully validated. Unexpected device data cannot
// alter an active trip or leave a restored moving-pad phase out of sync.
export function parsePondPostSave(saved) {
  const number = (value, low, high) => Number.isFinite(value) && value >= low && value <= high;
  const integer = (value, low, high) => Number.isInteger(value) && number(value, low, high);
  if (!saved || saved.schema !== 1 || !['playing', 'flying', 'recovering', 'paused', 'won'].includes(saved.mode)
    || !integer(saved.level, 1, LEVELS.length) || !integer(saved.ticks, 0, 10000000) || !integer(saved.serial, 0, 10000000)) return null;
  const level = LEVELS[saved.level - 1], last = level.pads.length - 1;
  const p = saved.player;
  if (!p || !number(p.x, -WORLD_EDGE - 1, WORLD_EDGE + 1) || !number(p.y, -4, level.pads[last].y + 6)
    || !number(p.vx, -16, 16) || !number(p.vy, -16, MAX_VY + 0.001)) return null;
  if (!integer(saved.padId, 0, last) || !integer(saved.checkpoint, 0, last) || saved.padId !== saved.checkpoint
    || !integer(saved.bestProgress, 0, last) || !number(saved.padOffset, -2, 2)
    || Math.abs(saved.padOffset) > level.pads[saved.padId].width / 2 - 0.08 + 1e-6) return null;
  if (!saved.aim || saved.aim.vx !== 0 || saved.aim.vy !== 0 || !integer(saved.recoveryTicks, 0, 36)
    || !['playing', 'flying', 'recovering'].includes(saved.resumeMode)
    || !number(saved.wind, -level.wind.strength - 1e-6, level.wind.strength + 1e-6)
    || Math.abs(saved.wind - windAt(level, saved.ticks)) > 1e-6) return null;
  const counters = ['jumps', 'misses', 'perfects', 'streak', 'bestStreak', 'score'];
  if (!counters.every(key => integer(saved[key], 0, 10000000)) || saved.misses > saved.jumps || saved.streak > saved.bestStreak || saved.bestStreak > saved.perfects
    || !integer(saved.stars, 0, 3)) return null;
  if (!Array.isArray(saved.landed) || !saved.landed.length || saved.landed.length > level.pads.length || saved.landed[0] !== 0
    || !saved.landed.every(id => integer(id, 0, last)) || new Set(saved.landed).size !== saved.landed.length
    || !saved.landed.includes(saved.padId) || Math.max(...saved.landed) !== saved.bestProgress
    || saved.perfects > saved.landed.length - 1 || saved.jumps < saved.landed.length - 1) return null;
  if (!Array.isArray(saved.stamps) || saved.stamps.length !== level.stamps.length || !saved.stamps.every((item, i) => {
    if (!item || item.id !== i || item.padId !== level.stamps[i].padId || typeof item.collected !== 'boolean') return false;
    const def = level.stamps[i], center = getPadPosition(level.pads[def.padId], saved.ticks);
    return number(item.x, -6, 6) && number(item.y, -1, level.pads[last].y + 2)
      && Math.abs(item.x - center.x - def.offsetX) < 1e-6 && Math.abs(item.y - center.y - def.height) < 1e-6;
  })) return null;
  const effective = saved.mode === 'paused' ? saved.resumeMode : saved.mode;
  if (saved.mode !== 'paused' && saved.resumeMode !== 'playing') return null;
  if (effective === 'recovering' ? saved.recoveryTicks < 1 : saved.recoveryTicks !== 0) return null;
  if (effective === 'playing' || effective === 'won') {
    const center = getPadPosition(level.pads[saved.padId], saved.ticks);
    if (Math.abs(p.x - center.x - saved.padOffset) > 1e-6 || Math.abs(p.y - center.y) > 1e-6 || p.vx !== 0 || p.vy !== 0) return null;
  }
  if (saved.mode === 'won' ? saved.padId !== level.goalPad || saved.stars < 1 : saved.stars !== 0 || saved.landed.includes(level.goalPad)) return null;
  const fields = ['schema', 'mode', 'level', 'ticks', 'player', 'padId', 'checkpoint', 'bestProgress', 'padOffset', 'aim', 'stamps', 'landed', 'jumps', 'misses', 'perfects', 'streak', 'bestStreak', 'score', 'stars', 'wind', 'resumeMode', 'recoveryTicks', 'serial'];
  return clone(Object.fromEntries(fields.map(key => [key, saved[key]])));
}
