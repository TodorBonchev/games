// Upside Nib — pure platformer logic (no DOM, no Three.js) so it can be tested in Node.
// Twist: Nib can flip gravity. Every level has a floor world and a ceiling world;
// enemies, spikes and coins live on both sides, and you stomp "down" relative to your gravity.
export const H = 10;            // distance between floor top (y=0) and ceiling underside (y=H)
export const PLAYER = { w: .8, h: 1.2 };
export const TUNE = { run: 7.5, accel: 55, airAccel: 30, friction: 40, gravity: 34, jump: 12.5, cut: .45, coyote: .11, buffer: .13, maxFall: 24, flipBoost: 3 };

// Authoring helpers. d = distance along the course (world z = -d), side = 'f' floor or 'c' ceiling.
const floor = (d0, d1, x = 0, w = 6) => ({ kind: 'solid', x, y: -.5, z: -(d0 + d1) / 2, w, h: 1, d: d1 - d0, side: 'f' });
const ceil = (d0, d1, x = 0, w = 6) => ({ kind: 'solid', x, y: H + .5, z: -(d0 + d1) / 2, w, h: 1, d: d1 - d0, side: 'c' });
const block = (d, x, y, s = 1.4) => ({ kind: 'solid', x, y, z: -d, w: s, h: s, d: s, side: y < H / 2 ? 'f' : 'c' });
const pillar = (d, x, side, h) => ({ kind: 'solid', x, y: side === 'f' ? h / 2 : H - h / 2, z: -d, w: 1.6, h, d: 1.6, side });

function level(id, name, hint, time, parts) {
  const solids = [], spikes = [], enemies = [], coins = [], movers = [], checkpoints = [];
  let goal = null, length = 0;
  for (const p of parts) {
    if (p.kind === 'solid') { solids.push(p); length = Math.max(length, -p.z + p.d / 2); }
    else if (p.kind === 'spike') spikes.push({ x: p.x ?? 0, y: p.side === 'f' ? .3 : H - .3, z: -(p.d0 + p.d1) / 2, w: p.w ?? 6, h: .6, d: p.d1 - p.d0, side: p.side });
    else if (p.kind === 'enemy') enemies.push({ ...p });
    else if (p.kind === 'coins') for (let i = 0; i < p.n; i++) coins.push({ x: p.x ?? 0, y: p.side === 'f' ? (p.y ?? 1) : H - (p.y ?? 1), z: -(p.d + i * (p.gap ?? 1.5)) });
    else if (p.kind === 'mover') movers.push({ ...p });
    else if (p.kind === 'check') checkpoints.push({ d: p.d, side: p.side });
    else if (p.kind === 'goal') goal = { d: p.d, side: p.side };
  }
  return { id, name, hint, time, solids, spikes, enemies, coins, movers, checkpoints, goal, length };
}
const E = (d, side, range = 2.5, x = 0, speed = 2) => ({ kind: 'enemy', d, side, range, x, speed });
const C = (d, side, n = 3, y = 1, x = 0, gap = 1.5) => ({ kind: 'coins', d, side, n, y, x, gap });
const S = (d0, d1, side, x = 0, w = 6) => ({ kind: 'spike', d0, d1, side, x, w });
const M = (d, side, axis, amp, period, w = 3.4, len = 3.4) => ({ kind: 'mover', d, side, axis, amp, period, w, len });

export const LEVELS = [
  level(1, 'Sprout Steps', 'Press FLIP to fall to the ceiling. The floor ends — the sky does not.', 90, [
    floor(-4, 22), C(4, 'f', 4), E(16, 'f', 3), C(10, 'f', 3, 2.6), block(12, 0, 1.8),
    ceil(18, 44), C(26, 'c', 5), E(34, 'c', 3),
    { kind: 'check', d: 40, side: 'c' }, floor(40, 62), C(46, 'f', 4), E(53, 'f', 2.5), block(50, -1.5, 1.8), C(50, 'f', 1, 3.2, -1.5),
    { kind: 'goal', d: 60, side: 'f' },
  ]),
  level(2, 'Lantern Loft', 'Spikes grow on both sides. Flip mid-air to dodge them.', 100, [
    floor(-4, 14), C(3, 'f', 4), ceil(10, 30), S(20, 24, 'c'), C(13, 'c', 4), E(27, 'c', 1.8),
    floor(22, 40), S(32, 35, 'f'), C(24, 'f', 3), E(37, 'f', 2), { kind: 'check', d: 38, side: 'f' },
    ceil(36, 52), C(41, 'c', 4), pillar(46, -1.5, 'c', 2.4), pillar(46, 1.5, 'c', 2.4), C(46, 'c', 1, 3.4),
    floor(50, 58), S(54, 55.5, 'f', 0, 6), ceil(56, 72), E(62, 'c', 3, -1), E(66, 'c', 3, 1, 2.6), C(60, 'c', 6),
    floor(70, 80), { kind: 'goal', d: 78, side: 'f' },
  ]),
  level(3, 'Drifting Gardens', 'Moving petals carry you. Ride them — and flip between them.', 110, [
    floor(-4, 10), C(2, 'f', 4), M(15, 'f', 'x', 1.2, 3.2), C(15, 'f', 1, 1.2), M(21, 'c', 'x', -1.2, 3.2), C(21, 'c', 1, 1.2),
    floor(25, 36), E(31, 'f', 3, 0, 2.6), { kind: 'check', d: 27, side: 'f' }, C(28, 'f', 4, 2.4),
    M(41, 'c', 'z', 2.5, 3.8), ceil(46, 58), S(50, 52, 'c', -1.5, 3), C(48, 'c', 6), E(55, 'c', 2.2, 1.5),
    M(62, 'f', 'x', 1.2, 2.6), M(68, 'c', 'x', -1.2, 2.6), M(74, 'f', 'x', 1.2, 2.4),
    { kind: 'check', d: 79, side: 'f' }, floor(78, 98), S(84, 86, 'f', -1.5, 3), S(89, 91, 'f', 1.5, 3), E(94, 'f', 2, 0, 3), C(82, 'f', 8, 2.2),
    ceil(84, 98), C(86, 'c', 6), { kind: 'goal', d: 97, side: 'f' },
  ]),
  level(4, 'The Inverted Spire', 'Everything at once. Read ahead, flip fast, stomp with style.', 130, [
    floor(-4, 8), C(2, 'f', 3), ceil(6, 18, 0, 4), S(10, 12, 'c', 0, 4), E(15, 'c', 1.5, 0, 3), C(8, 'c', 3),
    floor(16, 26, 0, 4), S(20, 21.5, 'f', 0, 4), E(24, 'f', 1.5, 0, 3), M(30, 'c', 'x', 1.6, 2.2, 3),
    { kind: 'check', d: 36, side: 'f' }, floor(34, 48, 0, 5), pillar(40, -1.7, 'f', 2), C(40, 'f', 1, 3, -1.7), S(43, 46, 'f', 1, 3),
    ceil(44, 60, 0, 5), S(48, 50, 'c', -1, 3), S(53, 55, 'c', 1, 3), E(57, 'c', 2, 0, 3.4), C(47, 'c', 8, 1, 0, 1.4),
    M(65, 'f', 'z', 1.5, 2.6, 3.4, 4), M(71, 'c', 'x', 1.6, 2), { kind: 'check', d: 77, side: 'c' },
    ceil(76, 92, 0, 4), E(82, 'c', 2, 0, 3.6), E(88, 'c', 2, 0, 3.6), C(80, 'c', 6),
    floor(88, 104, 0, 4), S(92, 94, 'f', 0, 4), C(96, 'f', 5), E(100, 'f', 1.5, 0, 3.6), { kind: 'goal', d: 103, side: 'f' },
  ]),
];

const overlap = (a, b) => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h && Math.abs(a.z - b.z) * 2 < a.d + b.d;

export function moverBox(m, t) {
  const s = Math.sin(t * Math.PI * 2 / m.period) * m.amp;
  return { kind: 'solid', x: m.axis === 'x' ? s : 0, y: m.side === 'f' ? -.3 : H + .3, z: -m.d + (m.axis === 'z' ? s : 0), w: m.w, h: .6, d: m.len, side: m.side };
}
export function enemyPos(e, t) {
  const s = Math.sin(t * e.speed / Math.max(e.range, .5)) * e.range;
  return { x: e.x, y: e.side === 'f' ? .45 : H - .45, z: -e.d + s, w: .9, h: .9, d: .9 };
}

export function createUpside({ storage, god = false } = {}) {
  const state = { mode: 'title', levelIndex: 0, lives: 3, score: 0, coins: 0, stomps: 0, time: 0, t: 0, events: [], best: readBest(storage) };
  let lvl, p, dead, coinTaken, check;

  function push(type, data = {}) { state.events.push({ type, ...data }); if (state.events.length > 48) state.events.shift(); }
  function spawnAt(cp) {
    const up = cp.side === 'c';
    p = { x: 0, y: up ? H - PLAYER.h / 2 : PLAYER.h / 2, z: -cp.d, vx: 0, vy: 0, vz: 0, flipped: up, grounded: true, coyote: TUNE.coyote, buffer: 0, airFlip: true, jumping: false, facing: Math.PI, invuln: 1.2, wasJump: false, wasFlip: false };
    state.player = p;
  }
  function start(n = 1, keepRun = false) {
    state.levelIndex = Math.max(0, Math.min(LEVELS.length - 1, n - 1));
    lvl = LEVELS[state.levelIndex]; state.level = lvl;
    if (!keepRun) { state.lives = 3; state.score = 0; state.coins = 0; state.stomps = 0; }
    state.time = 0; state.t = 0; dead = new Set(); coinTaken = new Set(); check = { d: 0, side: 'f' };
    state.dead = dead; state.coinTaken = coinTaken;
    spawnAt(check); state.mode = 'playing'; push('start', { level: lvl.id });
    return true;
  }
  function solidsAt(t) { return lvl.solids.concat(lvl.movers.map(m => moverBox(m, t))); }
  function hurt(fell = false) {
    if (p.invuln > 0 || (god && !fell)) return;
    state.lives--; push('hurt');
    if (state.lives <= 0) { state.mode = 'lost'; saveBest(); push('lost'); return; }
    spawnAt(check);
  }
  function step(dt, input = {}) {
    if (state.mode !== 'playing') return;
    dt = Math.min(dt, 1 / 30);
    const t0 = state.t; state.t += dt; state.time += dt; p.invuln = Math.max(0, p.invuln - dt);
    const down = p.flipped ? 1 : -1;
    // input edges
    const jumpHeld = !!input.jump, jumpPressed = jumpHeld && !p.wasJump, flipPressed = !!input.flip && !p.wasFlip;
    p.wasJump = jumpHeld; p.wasFlip = !!input.flip;
    if (jumpPressed) p.buffer = TUNE.buffer; else p.buffer = Math.max(0, p.buffer - dt);
    // horizontal
    let mx = +input.x || 0, mz = +input.z || 0; const len = Math.hypot(mx, mz); if (len > 1) { mx /= len; mz /= len; }
    const acc = p.grounded ? TUNE.accel : TUNE.airAccel;
    for (const [k, m] of [['vx', mx], ['vz', mz]]) {
      const target = m * TUNE.run, dv = target - p[k], lim = (m ? acc : (p.grounded ? TUNE.friction : TUNE.airAccel * .4)) * dt;
      p[k] += Math.max(-lim, Math.min(lim, dv));
    }
    if (len > .1) p.facing = Math.atan2(mx, mz);
    // flip
    if (flipPressed && (p.grounded || p.coyote > 0 || p.airFlip)) {
      if (!p.grounded && p.coyote <= 0) p.airFlip = false;
      p.flipped = !p.flipped; p.grounded = false; p.coyote = 0; p.jumping = false;
      p.vy = (p.flipped ? 1 : -1) * TUNE.flipBoost; push('flip', { flipped: p.flipped });
    }
    const dn = p.flipped ? 1 : -1;
    // jump with coyote + buffer
    if (p.buffer > 0 && (p.grounded || p.coyote > 0)) {
      p.vy = -dn * TUNE.jump; p.grounded = false; p.coyote = 0; p.buffer = 0; p.jumping = true; push('jump');
    }
    if (p.jumping && !jumpHeld && p.vy * -dn > 0) { p.vy *= TUNE.cut; p.jumping = false; }
    p.vy += dn * TUNE.gravity * dt;
    if (p.vy * dn > TUNE.maxFall) p.vy = dn * TUNE.maxFall;
    // ride movers
    const wasGrounded = p.grounded;
    if (p.grounded && p.ride) { const a = moverBox(p.ride, t0), b = moverBox(p.ride, state.t); p.x += b.x - a.x; p.z += b.z - a.z; }
    // integrate per axis
    const solids = solidsAt(state.t), box = { x: p.x, y: p.y, z: p.z, w: PLAYER.w, h: PLAYER.h, d: PLAYER.w };
    p.grounded = false; p.ride = null;
    for (const axis of ['x', 'z', 'y']) {
      const v = axis === 'x' ? p.vx : axis === 'z' ? p.vz : p.vy, size = axis === 'y' ? PLAYER.h : PLAYER.w;
      box[axis] += v * dt;
      for (let i = 0; i < solids.length; i++) {
        const s = solids[i]; if (!overlap(box, s)) continue;
        const half = (axis === 'y' ? s.h : axis === 'x' ? s.w : s.d) / 2 + size / 2;
        // y-step: when moving horizontally onto a lip ≤ .35, let y resolution handle it
        if (axis !== 'y') {
          const feet = dn < 0 ? box.y - PLAYER.h / 2 : box.y + PLAYER.h / 2, lip = dn < 0 ? s.y + s.h / 2 : s.y - s.h / 2;
          if (Math.abs(feet - lip) < .3) continue;
        }
        box[axis] = s[axis] + (box[axis] > s[axis] ? half : -half);
        if (axis === 'x') p.vx = 0; else if (axis === 'z') p.vz = 0;
        else if (p.vy * dn >= 0 || (box.y - s.y) * dn < 0) {
          box.y = s.y - dn * half; p.vy = 0; p.grounded = true; if (i >= lvl.solids.length) p.ride = lvl.movers[i - lvl.solids.length];
        } else { box.y = s.y + dn * half; p.vy = 0; p.jumping = false; push('bonk'); }
      }
    }
    p.x = box.x; p.y = box.y; p.z = box.z;
    if (p.grounded) { if (!wasGrounded) push('land', { flipped: p.flipped }); p.coyote = TUNE.coyote; p.airFlip = true; p.jumping = false; }
    else p.coyote = Math.max(0, p.coyote - dt);
    // hazards
    box.x = p.x; box.y = p.y; box.z = p.z;
    if (p.y < -12 || p.y > H + 12) { p.invuln = 0; state.falls = (state.falls || 0) + 1; hurt(true); return; }
    for (const s of lvl.spikes) if (overlap(box, { ...s, h: s.h * .8 })) { hurt(); if (state.mode !== 'playing') return; return; }
    // enemies: stomp if travelling with gravity and above them relative to gravity
    lvl.enemies.forEach((e, i) => {
      if (dead.has(i)) return; const q = enemyPos(e, state.t);
      if (!overlap(box, q)) return;
      const rel = (p.y - q.y) * -dn; // >0 means player is "above" relative to its own gravity
      if (rel > .35 && (p.vy * dn >= -1)) {
        dead.add(i); state.stomps++; state.score += 200; p.vy = -dn * TUNE.jump * (jumpHeld ? .95 : .6); p.jumping = jumpHeld; p.airFlip = true;
        push('stomp', { x: q.x, y: q.y, z: q.z });
      } else hurt();
    });
    if (state.mode !== 'playing') return;
    lvl.coins.forEach((c, i) => {
      if (coinTaken.has(i)) return;
      if (Math.abs(c.x - p.x) < .9 && Math.abs(c.y - p.y) < 1.1 && Math.abs(c.z - p.z) < .9) {
        coinTaken.add(i); state.coins++; state.score += 100; push('coin', { x: c.x, y: c.y, z: c.z });
        if (state.coins % 50 === 0) { state.lives++; push('life'); }
      }
    });
    for (const cp of lvl.checkpoints) if (cp.d > check.d && -p.z >= cp.d - .5) { check = cp; push('checkpoint', { d: cp.d }); }
    const g = lvl.goal; if (g && Math.abs(-p.z - g.d) < 1.2 && Math.abs(p.x) < 1.6 && (g.side === 'f' ? p.y < 3.5 : p.y > H - 3.5)) {
      const bonus = Math.max(0, Math.round((lvl.time - state.time) * 10)) + (coinTaken.size === lvl.coins.length ? 1000 : 0);
      state.score += bonus; state.lastBonus = bonus; push('goal', { bonus });
      if (state.levelIndex === LEVELS.length - 1) { state.mode = 'won'; saveBest(); push('won'); }
      else state.mode = 'cleared';
    }
  }
  function next() { if (state.mode !== 'cleared') return false; const lives = state.lives; start(state.levelIndex + 2, true); state.lives = lives; return true; }
  function pause() { if (state.mode !== 'playing') return false; state.mode = 'paused'; return true; }
  function resume() { if (state.mode !== 'paused') return false; state.mode = 'playing'; p.wasJump = true; p.wasFlip = true; return true; }
  function saveBest() {
    const run = { score: state.score, level: state.levelIndex + 1, won: state.mode === 'won' };
    if (run.score > (state.best?.score ?? -1)) { state.best = run; state.newBest = true; try { (storage ?? globalThis.localStorage)?.setItem(BEST_KEY, JSON.stringify(run)); } catch { } }
    else state.newBest = false;
  }
  return { state, start, step, next, pause, resume, get level() { return lvl; } };
}
export const BEST_KEY = 'games:best:upside';
export function readBest(storage) {
  try { const v = JSON.parse((storage ?? globalThis.localStorage)?.getItem(BEST_KEY)); return Number.isFinite(v?.score) && v.score >= 0 ? v : null; } catch { return null; }
}
