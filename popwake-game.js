// A 7×7 jelly garden with one continuous, branching trail per attempt.
// Each cell is addressed in board coordinates, independent of the renderer.
export const GRID_SIZE = 7;
export const STEP = 1 / 60;
const MAX_EFFECTS = 80;

const positions = text => text ? text.trim().split(/\s+/).map(pair => {
  const [x, z] = pair.split(',').map(Number); return Object.freeze({ x, z });
}) : [];
const jellySpecs = text => text.trim().split(/\s+/).map((piece, i) => {
  const [x, z, code] = piece.split(',');
  const type = code === 'g' ? 'relay' : 'normal';
  return Object.freeze({ id: i + 1, x: Number(x), z: Number(z), type, radius: type === 'relay' ? 2.1 : 1.1 });
});
const level = (id, name, subtitle, budget, par, start, rocks, jellies, solution, hint) => Object.freeze({
  id, name, subtitle, budget, par, start: positions(start)[0], rocks: Object.freeze(positions(rocks)),
  jellies: Object.freeze(jellySpecs(jellies)), solution: Object.freeze(positions(solution)), hint,
});

// Solutions can revisit cells, letting one uninterrupted drag create a fork.
// Relay ripples can hop over rocks; fingers and trails cannot pass through them.
export const LEVELS = Object.freeze([
  level(1, 'First little hello', 'A sleepy garden is waiting.', 10, 8, '1,6', '',
    '3,4,n 4,3,n 5,2,n', '1,6 2,6 3,6 3,5 3,4 4,4 4,3 5,3 5,2',
    'Start at the glowing seed, then draw through the three jellies.'),
  level(2, 'A fork in the fun', 'One little path can go two ways.', 14, 11, '3,6', '2,2 4,2 2,1 4,1',
    '3,3,n 1,1,n 5,1,n', '3,6 3,5 3,4 3,3 2,3 1,3 1,2 1,1 1,2 1,3 2,3 3,3 4,3 5,3 5,2 5,1',
    'Draw one branch, retrace your trail for free, then draw the other.'),
  level(3, 'The golden gap', 'A big ripple can cross a wall.', 7, 5, '0,6', '4,2 4,3 4,4 4,5 4,6',
    '2,5,n 3,4,g 5,4,n 5,3,n', '0,6 1,6 2,6 2,5 3,5 3,4',
    'Wake the gold jelly. Its big ripple reaches the jellies beyond the rocks.'),
  level(4, 'The winding way', 'A little detour makes a big parade.', 22, 19, '0,6',
    '1,3 1,4 1,5 1,6 3,2 3,3 3,4 3,5 5,3 5,4 5,5 5,6',
    '0,3,n 2,5,n 4,3,n 6,1,n',
    '0,6 0,5 0,4 0,3 0,2 1,2 2,2 2,3 2,4 2,5 2,6 3,6 4,6 4,5 4,4 4,3 4,2 5,2 6,2 6,1',
    'Follow the openings in the three rock walls; your trail can turn as often as you need.'),
  level(5, 'Golden hopscotch', 'One gold jelly can wake another.', 8, 5, '0,4', '3,2 3,3 3,4 5,2 5,3 5,4',
    '1,2,n 2,3,g 4,3,g 6,3,n 6,2,n', '0,4 1,4 1,3 1,2 2,2 2,3',
    'Reach the first gold jelly and watch its ripple hop to the next.'),
  level(6, 'A shared spark', 'Give both sides a reason to smile.', 18, 15, '3,6', '2,2 4,2 2,1 4,1',
    '3,3,g 0,3,n 1,0,n 6,3,n 5,0,n',
    '3,6 3,5 3,4 3,3 2,3 1,3 0,3 1,3 1,2 1,1 1,0 1,1 1,2 1,3 2,3 3,3 4,3 5,3 6,3 5,3 5,2 5,1 5,0',
    'Make a fork at the gold jelly; trace back over each branch without spending extra trail.'),
  level(7, 'Ripple islands', 'A spark has a few surprising friends.', 13, 10, '0,6', '1,3 1,4 1,5 3,1 3,2 3,3 5,2 5,3',
    '0,4,n 1,2,n 2,2,g 4,2,g 5,1,g 6,2,n 6,0,n 4,0,n 5,6,n',
    '0,6 0,5 0,4 0,3 0,2 1,2 0,2 0,3 0,4 0,5 0,6 1,6 2,6 3,6 4,6 5,6',
    'Wake the gold chain on the left, then retrace to visit the jelly at the bottom.'),
  level(8, 'The big wake-up', 'Everyone is invited to the pop parade.', 17, 14, '3,6', '2,4 4,4 2,2 4,2 1,1 5,1',
    '3,3,g 0,4,n 6,4,n 3,0,g 1,0,g 5,0,g 0,0,n 6,0,n',
    '3,6 3,5 3,4 3,3 2,3 1,3 0,3 0,4 0,3 1,3 2,3 3,3 4,3 5,3 6,3 6,4 6,3 5,3 4,3 3,3 3,2 3,1 3,0',
    'Branch left, right, and up from the center. The top gold jellies wake their neighbors.'),
]);
const forLevel = id => LEVELS.find(item => item.id === Number(id)) || LEVELS[0];
const same = (a, b) => a.x === b.x && a.z === b.z;
const adjacent = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z) === 1;
const within = point => point && Number.isInteger(point.x) && Number.isInteger(point.z) && point.x >= 0 && point.x < GRID_SIZE && point.z >= 0 && point.z < GRID_SIZE;
const clone = value => JSON.parse(JSON.stringify(value));

export function createPopwake({ level: requestedLevel = 1 } = {}) {
  const state = {};
  let current = forLevel(requestedLevel), accumulator = 0, serial = 0;
  function event(type, detail = {}) { state.events.push({ type, ...detail }); if (state.events.length > 32) state.events.shift(); }
  function effect(type, x, z, duration = 0.55, jellyType = '') {
    if (state.effects.length >= MAX_EFFECTS) state.effects.shift();
    state.effects.push({ id: ++serial, type, x, z, age: 0, duration, jellyType });
  }
  function reset(id = current.id, hints = false, visible = false) {
    current = forLevel(id); accumulator = 0; serial = 0;
    Object.assign(state, {
      mode: 'ready', level: current.id, ticks: 0, trail: [],
      jellies: current.jellies.map(jelly => ({ ...jelly, awake: false, litAt: null })),
      effects: [], events: [], budget: current.budget, used: 0, awake: 0, total: current.jellies.length,
      score: 0, stars: 0, hintUsed: hints, hintVisible: visible,
      stroke: null, queue: [], settleAt: 0, resumeMode: 'playing',
    });
    return state;
  }
  function start(id = current.id) { reset(id); state.mode = 'playing'; event('start', { level: current.id }); return state; }
  function begin(point) {
    if (state.mode !== 'playing' || !within(point) || !same(point, current.start)) return false;
    state.mode = 'drawing'; state.trail = [{ x: point.x, z: point.z, litAt: null }]; state.stroke = { x: point.x, z: point.z };
    state.used = 0; event('draw', { x: point.x, z: point.z, used: 0 }); return true;
  }
  function drag(point) {
    if (state.mode !== 'drawing' || !within(point)) return false;
    let { x, z } = state.stroke;
    const dx = Math.abs(point.x - x), dz = Math.abs(point.z - z), sx = Math.sign(point.x - x), sz = Math.sign(point.z - z);
    let ix = 0, iz = 0, changed = false;
    // Interpolate missed pointer samples using orthogonal supercover steps.
    while (ix < dx || iz < dz) {
      const stepX = ix < dx && (iz >= dz || (ix + 0.5) * dz <= (iz + 0.5) * dx);
      const next = { x: x + (stepX ? sx : 0), z: z + (stepX ? 0 : sz) };
      if (current.rocks.some(rock => same(rock, next))) { event('blocked', { x: next.x, z: next.z }); break; }
      const already = state.trail.some(item => same(item, next));
      if (!already && state.used >= state.budget) { event('budget', { budget: state.budget }); break; }
      if (stepX) ix++; else iz++;
      x = next.x; z = next.z; state.stroke = { x, z }; changed = true;
      if (!already) { state.trail.push({ x, z, litAt: null }); state.used++; event('draw', { x, z, used: state.used }); }
    }
    return changed;
  }
  function queue(kind, index, delay) {
    const collection = kind === 'trail' ? state.trail : state.jellies, item = collection[index];
    if (!item || (kind === 'trail' ? item.litAt !== null : item.awake)) return;
    const at = state.ticks + Math.max(1, Math.round(delay)), existing = state.queue.find(entry => entry.kind === kind && entry.index === index);
    if (existing) existing.at = Math.min(existing.at, at); else state.queue.push({ at, kind, index });
    state.queue.sort((a, b) => a.at - b.at || (a.kind === b.kind ? a.index - b.index : a.kind === 'trail' ? -1 : 1));
  }
  function release() {
    if (state.mode !== 'drawing') return false;
    if (!state.used) { state.mode = 'playing'; state.trail = []; state.stroke = null; event('cancel'); return false; }
    state.mode = 'running'; state.stroke = null; accumulator = 0; state.queue = []; state.settleAt = 0;
    queue('trail', 0, 1); event('release', { used: state.used }); return true;
  }
  function cancel() {
    if (state.mode !== 'drawing') return false;
    state.mode = 'playing'; state.trail = []; state.used = 0; state.stroke = null; state.queue = []; state.settleAt = 0; event('cancel'); return true;
  }
  function retry() {
    if (!['playing', 'drawing', 'running', 'paused', 'failed', 'won'].includes(state.mode)) return false;
    const hints = state.hintUsed, visible = state.hintVisible; reset(current.id, hints, visible);
    state.mode = 'playing'; event('retry', { level: current.id }); return true;
  }
  function hint() {
    if (!['playing', 'failed'].includes(state.mode)) return null;
    state.hintUsed = state.hintVisible = true; event('hint');
    return current.solution.map(point => ({ ...point }));
  }
  function next() {
    if (state.mode !== 'won' || state.level >= LEVELS.length) return false;
    start(state.level + 1); return true;
  }
  function pause() {
    if (state.mode === 'drawing') cancel();
    if (!['playing', 'running'].includes(state.mode)) return false;
    state.resumeMode = state.mode; state.mode = 'paused'; accumulator = 0; event('pause'); return true;
  }
  function resume() {
    if (state.mode !== 'paused') return false;
    state.mode = state.resumeMode; state.resumeMode = 'playing'; accumulator = 0; event('resume'); return true;
  }
  function igniteTrail(index) {
    const item = state.trail[index]; if (!item || item.litAt !== null) return;
    item.litAt = state.ticks; effect('trail', item.x, item.z, 0.5); event('ignite', { x: item.x, z: item.z });
    state.trail.forEach((other, i) => { if (adjacent(item, other)) queue('trail', i, 7); });
    state.jellies.forEach((jelly, i) => { if (same(item, jelly)) queue('jelly', i, 3); });
  }
  function popJelly(index) {
    const item = state.jellies[index]; if (!item || item.awake) return;
    item.awake = true; item.litAt = state.ticks; state.awake++;
    effect('pop', item.x, item.z, item.type === 'relay' ? 0.95 : 0.7, item.type);
    event('pop', { x: item.x, z: item.z, jellyType: item.type, awake: state.awake, total: state.total });
    const delay = other => 4 + Math.round(Math.hypot(other.x - item.x, other.z - item.z) * 4);
    const reached = other => Math.hypot(other.x - item.x, other.z - item.z) <= item.radius + 0.00001;
    state.trail.forEach((other, i) => { if (reached(other)) queue('trail', i, delay(other)); });
    state.jellies.forEach((other, i) => { if (reached(other)) queue('jelly', i, delay(other)); });
  }
  function finish() {
    state.resumeMode = 'playing';
    if (state.awake === state.total) {
      const middle = Math.ceil((current.par + current.budget) / 2);
      const earned = state.used <= current.par ? 3 : state.used <= middle ? 2 : 1;
      state.stars = state.hintUsed ? Math.min(2, earned) : earned;
      state.score = 1000 + state.total * 100 + (current.budget - state.used) * 80 + state.stars * 200;
      state.mode = 'won'; effect('win', current.start.x, current.start.z, 1.2); event('won', { stars: state.stars, score: state.score });
    } else {
      state.stars = 0; state.score = state.awake * 100; state.mode = 'failed'; event('failed', { awake: state.awake, total: state.total });
    }
    accumulator = 0;
  }
  function step() {
    state.ticks++;
    while (state.queue.length && state.queue[0].at <= state.ticks) {
      const next = state.queue.shift();
      if (next.kind === 'trail') igniteTrail(next.index); else popJelly(next.index);
    }
    for (const item of state.effects) item.age += STEP;
    state.effects = state.effects.filter(item => item.age < item.duration);
    if (!state.queue.length) {
      if (!state.settleAt) state.settleAt = state.ticks + 30;
      else if (state.ticks >= state.settleAt) finish();
    }
  }
  function advance(seconds) {
    if (state.mode !== 'running' || !Number.isFinite(seconds) || seconds <= 0) return;
    accumulator += Math.min(seconds, 1);
    let steps = 0;
    while (accumulator + 1e-8 >= STEP && state.mode === 'running' && steps++ < 61) { accumulator -= STEP; step(); }
    if (state.mode !== 'running') accumulator = 0;
  }
  function snapshot() {
    if (state.mode === 'ready') return null;
    const { effects, events, ...data } = state;
    if (state.mode === 'drawing') Object.assign(data, { mode: 'playing', trail: [], used: 0, stroke: null });
    return clone({ schema: 1, ...data, serial });
  }
  function restore(saved) {
    const data = parsePopwakeSave(saved); if (!data) return false;
    current = forLevel(data.level); serial = data.serial; accumulator = 0;
    Object.assign(state, data, { effects: [], events: [], stroke: null });
    if (state.mode === 'playing' || state.mode === 'running') { state.resumeMode = state.mode; state.mode = 'paused'; }
    return true;
  }
  reset();
  return { state, get level() { return current; }, start, begin, drag, release, cancel, retry, hint, next, pause, resume, advance, snapshot, restore };
}

// Only accept bounded, internally consistent checkpoints. An incomplete finger
// gesture is intentionally saved as a fresh, idle attempt.
export function parsePopwakeSave(saved) {
  const integer = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
  if (!saved || saved.schema !== 1 || !['playing', 'running', 'paused', 'won', 'failed'].includes(saved.mode)
    || !integer(saved.level, 1, LEVELS.length) || !integer(saved.ticks, 0, 10000000) || !integer(saved.serial, 0, 10000000)) return null;
  const level = LEVELS[saved.level - 1];
  if (saved.budget !== level.budget || saved.total !== level.jellies.length || !integer(saved.used, 0, level.budget)
    || !integer(saved.awake, 0, saved.total) || !integer(saved.score, 0, 10000000) || !integer(saved.stars, 0, 3)
    || typeof saved.hintUsed !== 'boolean' || typeof saved.hintVisible !== 'boolean' || (saved.hintVisible && !saved.hintUsed)
    || saved.stroke !== null || !['playing', 'running'].includes(saved.resumeMode) || !integer(saved.settleAt, 0, 10000100)) return null;
  if (!Array.isArray(saved.trail) || saved.trail.length > level.budget + 1 || saved.used !== Math.max(0, saved.trail.length - 1)) return null;
  const trail = saved.trail;
  const litAt = value => value === null || integer(value, 0, saved.ticks);
  if (trail.length && (!within(trail[0]) || !same(trail[0], level.start))) return null;
  if (!trail.every((point, i) => within(point) && litAt(point.litAt) && !level.rocks.some(rock => same(rock, point))
    && !trail.slice(0, i).some(prior => same(prior, point)) && (!i || trail.slice(0, i).some(prior => adjacent(prior, point))))) return null;
  if (!Array.isArray(saved.jellies) || saved.jellies.length !== level.jellies.length || !saved.jellies.every((jelly, i) => {
    const def = level.jellies[i];
    return jelly && jelly.id === def.id && same(jelly, def) && jelly.type === def.type && jelly.radius === def.radius
      && typeof jelly.awake === 'boolean' && (jelly.awake ? integer(jelly.litAt, 0, saved.ticks) : jelly.litAt === null);
  }) || saved.jellies.filter(jelly => jelly.awake).length !== saved.awake) return null;
  if (!Array.isArray(saved.queue) || saved.queue.length > GRID_SIZE * GRID_SIZE + level.jellies.length) return null;
  const seen = new Set();
  for (const item of saved.queue) {
    if (!item || !['trail', 'jelly'].includes(item.kind) || !integer(item.at, saved.ticks + 1, saved.ticks + 100)) return null;
    const list = item.kind === 'trail' ? trail : saved.jellies;
    if (!integer(item.index, 0, list.length - 1)) return null;
    const target = list[item.index], key = `${item.kind}:${item.index}`;
    if (seen.has(key) || (item.kind === 'trail' ? target.litAt !== null : target.awake)) return null;
    seen.add(key);
  }
  const effective = saved.mode === 'paused' ? saved.resumeMode : saved.mode;
  if (saved.mode !== 'paused' && saved.resumeMode !== 'playing') return null;
  if (effective === 'playing' && (trail.length || saved.queue.length || saved.awake || saved.settleAt || saved.ticks || saved.stars || saved.score)) return null;
  if (effective === 'running' && (trail.length < 2 || saved.stars || saved.score
    || (saved.queue.length ? saved.settleAt !== 0 : saved.settleAt <= saved.ticks))) return null;
  if (saved.mode === 'won' && (trail.length < 2 || saved.awake !== saved.total || saved.queue.length || !saved.settleAt
    || saved.settleAt > saved.ticks || saved.stars < 1 || (saved.hintUsed && saved.stars > 2))) return null;
  if (saved.mode === 'failed' && (trail.length < 2 || saved.awake >= saved.total || saved.queue.length || !saved.settleAt
    || saved.settleAt > saved.ticks || saved.stars !== 0)) return null;
  const fields = ['schema', 'mode', 'level', 'ticks', 'trail', 'jellies', 'budget', 'used', 'awake', 'total', 'score', 'stars', 'hintUsed', 'hintVisible', 'stroke', 'queue', 'settleAt', 'resumeMode', 'serial'];
  const data = clone(Object.fromEntries(fields.map(key => [key, saved[key]])));
  data.queue.sort((a, b) => a.at - b.at || (a.kind === b.kind ? a.index - b.index : a.kind === 'trail' ? -1 : 1));
  return data;
}
