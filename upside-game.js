// Upside Nib — pure 2D platformer logic (no DOM) so it can be tested and bot-played in Node.
// Tile units: 1 = one 16px tile. y grows downward. Rows 13-14 are the floor world's ground,
// rows 0-1 are the ceiling world's ground. Nib may flip gravity (g = 1 down, -1 up).
export const ROWS = 15, TILE = 16, FLOOR_Y = 13, CEIL_Y = 2;
export const TUNE = { walk: 5.6, run: 9.6, accel: 14, runAccel: 20, airAccel: 12, skid: 34, friction: 18, gravity: 95, jumpGravity: 36, jump: 16.5, runJumpBonus: .25, cut: .5, coyote: .1, buffer: .12, maxFall: 17, flipKick: 2, timeRate: 2.5 };
export const BEST_KEY = 'games:best:upside', UNLOCK_KEY = 'games:progress:upside';
export const SIZE = { w: .75, small: .9, big: 1.75 };
const SOLID = new Set(['#', 'B', '?', 'M', 'U', 'X', 'P', 'R']);
export const isSolidChar = c => SOLID.has(c);

function makeLevel(id, name, hint, w, build) {
  const g = Array.from({ length: ROWS }, () => Array(w).fill('.'));
  const enemies = [], checks = [];
  let flagX = w - 14;
  const rowOf = (side, h) => side === 'f' ? FLOOR_Y - h : CEIL_Y - 1 + h;
  const set = (x, r, c) => { if (x >= 0 && x < w && r >= 0 && r < ROWS) g[r][x] = c; };
  const b = {
    floor(a, z) { for (let x = a; x < z; x++) { set(x, 13, '#'); set(x, 14, '#'); } },
    ceil(a, z) { for (let x = a; x < z; x++) { set(x, 0, '#'); set(x, 1, '#'); } },
    put(side, x, h, str) { [...str].forEach((c, i) => { if (c !== ' ') set(x + i, rowOf(side, h), c); }); },
    pipe(side, x, h) { for (let k = 1; k <= h; k++) { set(x, rowOf(side, k), 'P'); set(x + 1, rowOf(side, k), 'R'); } },
    stairs(side, x, n, dir = 1) { for (let i = 0; i < n; i++) { const hh = dir > 0 ? i + 1 : n - i; for (let k = 1; k <= hh; k++) set(x + i, rowOf(side, k), 'X'); } },
    coins(side, x, h, n, gap = 1) { for (let i = 0; i < n; i++) set(x + i * gap, rowOf(side, h), 'o'); },
    walker(side, x) { enemies.push({ type: 'walker', x, side }); },
    shell(side, x) { enemies.push({ type: 'shell', x, side }); },
    check(side, x) { checks.push({ x, g: side === 'f' ? 1 : -1 }); },
    flag(x) { flagX = x; },
  };
  build(b);
  checks.sort((a, z) => a.x - z.x);
  return { id, name, hint, w, time: 300, rows: g.map(r => r.join('')), enemies, checks, flagX, length: w };
}

export const LEVELS = [
  makeLevel(1, 'Meadow Morning', 'Bump blocks from below. When the floor runs out, FLIP to the sky world.', 184, b => {
    b.floor(0, 70); b.put('f', 14, 4, '?'); b.put('f', 19, 4, 'B?BMB'); b.put('f', 21, 8, '?'); b.coins('f', 9, 1, 3);
    b.walker('f', 24); b.pipe('f', 29, 2); b.pipe('f', 38, 3); b.walker('f', 43); b.walker('f', 45); b.pipe('f', 52, 3);
    b.put('f', 58, 4, 'BBB'); b.coins('f', 58, 6, 3); b.walker('f', 66);
    b.floor(74, 101); b.check('f', 76); b.put('f', 80, 4, '?B?'); b.shell('f', 88); b.coins('f', 93, 2, 5);
    b.ceil(94, 142); b.coins('c', 104, 2, 6); b.put('c', 110, 4, 'B?MB'); b.walker('c', 118); b.pipe('c', 124, 2); b.shell('c', 130); b.coins('c', 134, 1, 4);
    b.floor(137, 184); b.walker('f', 146); b.put('f', 148, 4, '?'); b.stairs('f', 156, 7); b.flag(168);
  }),
  makeLevel(2, 'Brickwork Breeze', 'Shells can be kicked. Ceiling pipes hang down — jump up and over them.', 214, b => {
    b.floor(0, 42); b.put('f', 11, 4, 'BMB?B'); b.walker('f', 17); b.walker('f', 19); b.pipe('f', 26, 3); b.pipe('f', 34, 4); b.walker('f', 38);
    b.ceil(32, 78); b.coins('c', 44, 2, 6); b.pipe('c', 50, 3); b.walker('c', 55); b.pipe('c', 60, 2); b.shell('c', 66); b.put('c', 69, 4, 'B?B?B');
    b.ceil(81, 122); b.check('c', 83); b.walker('c', 90); b.walker('c', 92); b.put('c', 96, 4, '?M?'); b.pipe('c', 104, 3); b.shell('c', 112);
    b.floor(86, 142); b.coins('f', 96, 3, 8); b.shell('f', 126); b.walker('f', 130); b.walker('f', 134);
    b.floor(146, 214); b.check('f', 148); b.pipe('f', 154, 2); b.walker('f', 158); b.pipe('f', 162, 4); b.put('f', 167, 4, '?B?'); b.walker('f', 172);
    b.stairs('f', 180, 6); b.flag(194);
  }),
  makeLevel(3, 'Twin Skies', 'The worlds take turns. Jump, then FLIP at the top of your arc.', 244, b => {
    b.floor(0, 32); b.put('f', 10, 4, '?M?'); b.walker('f', 20); b.pipe('f', 25, 3);
    b.ceil(28, 56); b.walker('c', 38); b.put('c', 42, 4, 'B?B'); b.shell('c', 48); b.coins('c', 34, 2, 4);
    b.floor(52, 78); b.walker('f', 60); b.walker('f', 66); b.pipe('f', 68, 3); b.coins('f', 56, 5, 4);
    b.ceil(85, 112); b.check('c', 88); b.walker('c', 96); b.pipe('c', 101, 3); b.walker('c', 106); b.coins('c', 90, 3, 5);
    b.floor(118, 146); b.put('f', 122, 4, 'BMB'); b.shell('f', 130); b.walker('f', 136); b.pipe('f', 140, 4);
    b.ceil(150, 178); b.check('c', 152); b.walker('c', 158); b.walker('c', 160); b.put('c', 164, 4, '?B?B'); b.shell('c', 172);
    b.floor(174, 244); b.walker('f', 186); b.pipe('f', 190, 3); b.walker('f', 196); b.put('f', 200, 4, '??'); b.stairs('f', 206, 8); b.flag(222);
  }),
  makeLevel(4, 'Lantern Keep', 'Everything at once. Read ahead, flip fast, stomp with style.', 278, b => {
    b.floor(0, 26); b.put('f', 8, 4, 'BMB'); b.walker('f', 16); b.shell('f', 20);
    b.ceil(22, 50); b.pipe('c', 30, 4); b.walker('c', 36); b.shell('c', 40); b.walker('c', 44); b.coins('c', 26, 3, 3);
    b.floor(46, 64); b.walker('f', 52); b.pipe('f', 56, 4); b.walker('f', 60);
    b.floor(68, 84); b.check('f', 69); b.put('f', 72, 4, '?M?'); b.shell('f', 78); b.walker('f', 81);
    b.ceil(92, 120); b.walker('c', 98); b.walker('c', 100); b.pipe('c', 106, 3); b.shell('c', 112); b.coins('c', 94, 2, 4);
    b.ceil(124, 140); b.walker('c', 130); b.walker('c', 134);
    b.floor(136, 160); b.check('f', 140); b.put('f', 144, 4, 'B?B'); b.pipe('f', 150, 4); b.shell('f', 156);
    b.ceil(164, 190); b.walker('c', 170); b.pipe('c', 176, 4); b.walker('c', 182); b.walker('c', 185);
    b.floor(186, 200); b.walker('f', 194);
    b.floor(204, 278); b.check('f', 205); b.put('f', 210, 4, '?M?'); b.shell('f', 216); b.walker('f', 222); b.walker('f', 224); b.pipe('f', 230, 3); b.stairs('f', 238, 8); b.flag(254);
  }),
];

const store = s => s ?? globalThis.localStorage;
export function readBest(storage) { try { const v = JSON.parse(store(storage)?.getItem(BEST_KEY)); return Number.isFinite(v?.score) && v.score >= 0 ? v : null; } catch { return null; } }
export function readUnlocked(storage) { try { return Math.max(1, Math.min(LEVELS.length, +store(storage)?.getItem(UNLOCK_KEY) || 1)); } catch { return 1; } }
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function createUpside({ storage, god = false } = {}) {
  const state = { mode: 'title', levelIndex: 0, lives: 3, score: 0, coins: 0, time: 0, t: 0, events: [], best: readBest(storage), unlocked: readUnlocked(storage), check: -1, combo: 0 };
  const ev = (type, extra = {}) => { state.events.push({ type, ...extra }); if (state.events.length > 48) state.events.splice(0, state.events.length - 48); };
  const L = () => LEVELS[state.levelIndex];
  const tile = (x, y) => { if (x < 0) return '#'; if (y < 0 || y >= ROWS || x >= L().w) return '.'; return String.fromCharCode(state.grid[y * L().w + x]); };
  const setTile = (x, y, c) => { state.grid[y * L().w + x] = c.charCodeAt(0); };
  const solidAt = (x, y) => SOLID.has(tile(x, y));

  function loadLevel() {
    const lv = L();
    state.grid = new Uint8Array(lv.w * ROWS); lv.rows.forEach((r, y) => { for (let x = 0; x < lv.w; x++) state.grid[y * lv.w + x] = r.charCodeAt(x); });
    state.enemies = lv.enemies.map(e => { const g = e.side === 'f' ? 1 : -1, h = .9; return { type: e.type, x: e.x + .05, y: g > 0 ? FLOOR_Y - h : CEIL_Y, w: .9, h, vx: 0, vy: 0, g, dir: -1, mode: 'walk', t: 0, alive: true, active: false }; });
    state.items = []; state.fireballs = []; state.bumps = []; state.time = lv.time; state.flag = null; state.combo = 0;
    const c = lv.checks[state.check], g = c ? c.g : 1, x = c ? c.x : 2.5, h = SIZE.small;
    const prev = state.player;
    state.player = { x, y: g > 0 ? FLOOR_Y - h : CEIL_Y, w: SIZE.w, h, vx: 0, vy: 0, g, power: 0, ground: true, coyote: 0, buffer: 0, airFlip: true, jumping: false, facing: 1, invuln: 0, pj: prev?.pj ?? false, pf: prev?.pf ?? false, pr: prev?.pr ?? false, deathT: 0, flips: 0 };
  }
  function start(id = 1) { state.levelIndex = Math.max(0, LEVELS.findIndex(l => l.id === id)); state.lives = 3; state.score = 0; state.coins = 0; state.check = -1; state.newBest = false; loadLevel(); state.mode = 'playing'; ev('start', { level: id }); return state; }
  function next() { if (state.levelIndex >= LEVELS.length - 1) return false; state.levelIndex++; state.check = -1; loadLevel(); state.mode = 'playing'; ev('start', { level: L().id }); return true; }
  function saveBest() {
    const run = { score: state.score, level: L().id, at: Date.now() };
    if (run.score > (state.best?.score ?? -1)) { state.best = run; state.newBest = true; try { store(storage)?.setItem(BEST_KEY, JSON.stringify(run)); } catch { } }
  }
  function unlock(n) { if (n > state.unlocked) { state.unlocked = Math.min(LEVELS.length, n); try { store(storage)?.setItem(UNLOCK_KEY, String(state.unlocked)); } catch { } } }
  const addScore = (n, x, y) => { state.score += n; if (x !== undefined) ev('points', { n, x, y }); };
  const addCoin = () => { state.coins++; addScore(200); ev('coin'); if (state.coins >= 100) { state.coins -= 100; state.lives = Math.min(9, state.lives + 1); ev('oneup'); } };

  function setSize(P, big) {
    const h = big ? SIZE.big : SIZE.small, d = h - P.h; if (!d) return;
    if (P.g > 0) P.y -= d; P.h = h;
    if (d > 0 && boxSolid(P)) { if (P.g > 0) P.y += d; P.h = h - d; } // no room: stay small-bodied this frame
  }
  function boxSolid(e) { for (let y = Math.floor(e.y); y <= Math.floor(e.y + e.h - 1e-4); y++) for (let x = Math.floor(e.x); x <= Math.floor(e.x + e.w - 1e-4); x++) if (solidAt(x, y)) return true; return false; }
  // move entity on one axis and resolve against tiles; returns list of hit tiles or null
  function moveAxis(e, axis, d) {
    if (!d) return null;
    if (axis === 'x') e.x += d; else e.y += d;
    const hits = [];
    for (let y = Math.floor(e.y); y <= Math.floor(e.y + e.h - 1e-4); y++) for (let x = Math.floor(e.x); x <= Math.floor(e.x + e.w - 1e-4); x++) if (solidAt(x, y)) hits.push({ x, y });
    if (!hits.length) return null;
    if (axis === 'x') { if (d > 0) e.x = Math.min(...hits.map(h => h.x)) - e.w; else e.x = Math.max(...hits.map(h => h.x)) + 1; }
    else { if (d > 0) e.y = Math.min(...hits.map(h => h.y)) - e.h; else e.y = Math.max(...hits.map(h => h.y)) + 1; }
    return hits;
  }

  function bump(tx, ty, P) {
    const c = tile(tx, ty), g = P.g;
    if (c === '?') { setTile(tx, ty, 'U'); addCoin(); ev('coinpop', { x: tx, y: ty, g }); }
    else if (c === 'M') { setTile(tx, ty, 'U'); const kind = P.power ? 'bloom' : 'cap'; state.items.push({ kind, x: tx + .05, y: ty, w: .9, h: .9, vx: 0, vy: 0, g, dir: 1, emerge: .6, sy: ty - g }); ev('sprout', { x: tx, y: ty }); }
    else if (c === 'B' && P.power) { setTile(tx, ty, '.'); addScore(50); ev('break', { x: tx, y: ty }); }
    else if (c === 'B') ev('bump', { x: tx, y: ty });
    else { ev('thud'); return; }
    state.bumps.push({ x: tx, y: ty, t: .18, g });
    const zone = { x: tx, y: ty - g, w: 1, h: 1 }; // tile on the far side of the block
    for (const e of state.enemies) if (e.alive && e.mode !== 'dead' && overlap(e, zone)) knock(e, 200);
    for (const it of state.items) if (overlap(it, zone)) { it.vy = -it.g * 9; it.dir = it.x + .45 < tx + .5 ? -1 : 1; }
  }
  function knock(e, pts) { e.mode = 'dead'; e.vy = -e.g * 9; e.t = 0; addScore(pts, e.x, e.y); ev('kick'); }
  function hurt(P) {
    if (god || P.invuln > 0 || state.mode !== 'playing') return;
    if (P.power > 0) { P.power = 0; setSize(P, false); P.invuln = 2; ev('shrink'); } else die();
  }
  function die() { if (state.mode !== 'playing') return; const P = state.player; state.mode = 'dying'; P.deathT = 2.2; P.vy = -P.g * 13; P.vx = 0; ev('die'); }
  function loseLife() {
    state.lives--;
    if (state.lives <= 0) { state.mode = 'lost'; saveBest(); ev('gameover'); return; }
    loadLevel(); state.mode = 'playing'; ev('respawn');
  }
  function finish() { state.score += Math.ceil(state.time) * 50; unlock(state.levelIndex + 2); saveBest(); state.mode = state.levelIndex >= LEVELS.length - 1 ? 'won' : 'cleared'; ev(state.mode); }

  function stepPlayer(dt, input) {
    const P = state.player, T = TUNE;
    const jp = !!input.jump && !P.pj, fp = !!input.flip && !P.pf, rp = !!input.run && !P.pr;
    P.pj = !!input.jump; P.pf = !!input.flip; P.pr = !!input.run;
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0), max = input.run ? T.run : T.walk;
    if (dir) {
      P.facing = dir;
      if (P.ground && P.vx * dir < 0) { P.vx += dir * T.skid * dt; if (P.vx * dir < -0.5) P.skid = true; }
      else { P.skid = false; const a = P.ground ? (input.run ? T.runAccel : T.accel) : T.airAccel; const v = P.vx * dir; P.vx = dir * (v < max ? Math.min(max, v + a * dt) : Math.max(max, v - T.friction * dt)); }
    } else { P.skid = false; const f = (P.ground ? T.friction : T.friction * .3) * dt; P.vx = Math.sign(P.vx) * Math.max(0, Math.abs(P.vx) - f); }
    P.buffer = jp ? T.buffer : Math.max(0, P.buffer - dt);
    P.coyote = P.ground ? T.coyote : Math.max(0, P.coyote - dt);
    if (P.buffer > 0 && P.coyote > 0) { P.vy = -P.g * (T.jump + Math.abs(P.vx) * T.runJumpBonus); P.ground = false; P.coyote = 0; P.buffer = 0; P.jumping = true; ev('jump', { big: P.power > 0 }); }
    if (!input.jump && P.jumping && P.vy * P.g < 0) { P.vy *= T.cut; P.jumping = false; }
    if (fp) {
      const free = P.ground || P.coyote > 0;
      if (free || P.airFlip) { if (!free) P.airFlip = false; if (P.power) { /* keep feet anchored to the new floor side */ } P.g = -P.g; P.vy = P.g * T.flipKick; P.ground = false; P.coyote = 0; P.jumping = false; P.flips++; ev('flip', { g: P.g }); }
    }
    if (rp && P.power === 2 && state.fireballs.length < 2) { state.fireballs.push({ x: P.x + (P.facing > 0 ? P.w : -.5), y: P.y + P.h / 2 - .25, w: .5, h: .5, vx: P.facing * 13, vy: P.g * 4, g: P.g, t: 0 }); ev('fire'); }
    const rising = P.vy * P.g < 0, grav = rising && P.jumping && input.jump ? T.jumpGravity : T.gravity;
    P.vy += P.g * grav * dt; if (P.vy * P.g > T.maxFall) P.vy = P.g * T.maxFall;
    const hx = moveAxis(P, 'x', P.vx * dt); if (hx) P.vx = 0;
    if (P.x > L().w - 1) P.x = L().w - 1;
    const wasGround = P.ground; P.ground = false;
    const hy = moveAxis(P, 'y', P.vy * dt);
    if (hy) {
      if (Math.sign(P.vy) === P.g) { P.ground = true; P.airFlip = true; P.jumping = false; P.vy = 0; state.combo = 0; if (!wasGround) ev('land'); }
      else {
        // corner correction: barely clipped a block edge? slide past instead of bonking
        const cx = P.x + P.w / 2, ov = hy.map(h => Math.min(P.x + P.w, h.x + 1) - Math.max(P.x, h.x));
        if (hy.length === 1 && ov[0] < .3) { P.y -= P.vy * dt * 0; P.x += cx < hy[0].x + .5 ? -ov[0] - .01 : ov[0] + .01; if (P.vy) P.y += 0; }
        else { const t = hy.reduce((b, h) => Math.abs(h.x + .5 - cx) < Math.abs(b.x + .5 - cx) ? h : b); P.vy = P.g * 1; P.jumping = false; bump(t.x, t.y, P); }
      }
    }
    if (P.invuln > 0) P.invuln -= dt;
    // coins in the grid
    for (let y = Math.floor(P.y); y <= Math.floor(P.y + P.h - 1e-4); y++) for (let x = Math.floor(P.x); x <= Math.floor(P.x + P.w - 1e-4); x++) if (tile(x, y) === 'o') { setTile(x, y, '.'); addCoin(); }
  }

  function stepEnemies(dt) {
    const P = state.player;
    for (const e of state.enemies) {
      if (!e.alive) continue;
      if (!e.active) { if (e.x < P.x + 17) e.active = true; else continue; }
      e.t += dt;
      if (e.mode === 'squish') { if (e.t > .5) e.alive = false; continue; }
      if (e.mode === 'dead') { e.vy += e.g * 40 * dt; e.y += e.vy * dt; if (e.y > ROWS + 2 || e.y < -3) e.alive = false; continue; }
      if (e.mode === 'shell' && e.t > 7) { e.mode = 'walk'; e.t = 0; }
      e.vx = e.mode === 'walk' ? e.dir * 1.7 : e.mode === 'slide' ? e.dir * 11 : 0;
      e.vy += e.g * 60 * dt; if (e.vy * e.g > 16) e.vy = e.g * 16;
      if (moveAxis(e, 'x', e.vx * dt)) { e.dir *= -1; if (e.mode === 'slide') ev('thud'); }
      if (moveAxis(e, 'y', e.vy * dt)) e.vy = 0;
      if (e.y > ROWS + 2 || e.y + e.h < -2 || e.x < P.x - 30) { e.alive = false; continue; }
      if (e.mode === 'slide') for (const o of state.enemies) if (o !== e && o.alive && o.active && o.mode !== 'dead' && o.mode !== 'squish' && overlap(e, o)) knock(o, 500);
      if (state.mode !== 'playing' || e.mode === 'dead') continue;
      if (!overlap(P, e)) continue;
      const feet = P.g > 0 ? P.y + P.h - e.y : e.y + e.h - P.y, falling = P.vy * P.g > 0;
      if ((falling || !P.ground) && feet < .55 && P.vy * P.g > -1) {
        const pts = [100, 200, 400, 800, 1000, 2000, 4000, 8000][Math.min(7, state.combo++)];
        if (e.type === 'walker') { e.mode = 'squish'; e.t = 0; }
        else if (e.mode === 'walk' || e.mode === 'slide') { e.mode = 'shell'; e.t = 0; }
        else { e.mode = 'slide'; e.dir = P.x + P.w / 2 < e.x + e.w / 2 ? 1 : -1; e.t = 0; e.grace = .25; }
        addScore(pts, e.x, e.y); P.vy = -P.g * (P.pj ? 15 : 10); P.jumping = !!P.pj; P.airFlip = true; P.ground = false; ev('stomp', { x: e.x, y: e.y });
        if (P.g > 0) P.y = Math.min(P.y, e.y - P.h); else P.y = Math.max(P.y, e.y + e.h);
      } else if (e.mode === 'shell') { e.mode = 'slide'; e.dir = P.x + P.w / 2 < e.x + e.w / 2 ? 1 : -1; e.t = 0; e.grace = .25; addScore(400, e.x, e.y); ev('kick'); e.x += e.dir * .3; }
      else if (!(e.mode === 'slide' && e.t < (e.grace || 0))) hurt(P);
    }
  }
  function stepItems(dt) {
    const P = state.player;
    for (const it of state.items) {
      if (it.emerge > 0) { it.emerge -= dt; it.y += (it.sy - it.y) * Math.min(1, dt * 6); if (it.emerge <= 0) { it.y = it.sy; it.dir = 1; } }
      else if (it.kind === 'cap') {
        it.vy += it.g * 50 * dt; if (it.vy * it.g > 14) it.vy = it.g * 14;
        if (moveAxis(it, 'x', it.dir * 3.2 * dt)) it.dir *= -1;
        if (moveAxis(it, 'y', it.vy * dt)) it.vy = 0;
        if (it.y > ROWS + 2 || it.y < -3) it.gone = true;
      }
      if (!it.gone && it.emerge < .3 && overlap(P, it) && state.mode === 'playing') {
        it.gone = true; addScore(1000, it.x, it.y);
        if (it.kind === 'cap') { if (!P.power) { P.power = 1; setSize(P, true); } ev('grow'); }
        else { if (!P.power) setSize(P, true); P.power = 2; ev('grow', { fire: true }); }
      }
    }
    state.items = state.items.filter(i => !i.gone);
    for (const f of state.fireballs) {
      f.t += dt; f.vy += f.g * 55 * dt;
      if (moveAxis(f, 'x', f.vx * dt)) { f.gone = true; ev('poof', { x: f.x, y: f.y }); }
      if (moveAxis(f, 'y', f.vy * dt)) f.vy = Math.sign(f.vy) === f.g ? -f.g * 8 : f.g * 2;
      if (f.t > 2.5 || f.y > ROWS + 1 || f.y < -2) f.gone = true;
      for (const e of state.enemies) if (!f.gone && e.alive && e.active && e.mode !== 'dead' && e.mode !== 'squish' && overlap(f, e)) { knock(e, 200); f.gone = true; }
    }
    state.fireballs = state.fireballs.filter(f => !f.gone);
    for (const b of state.bumps) b.t -= dt; state.bumps = state.bumps.filter(b => b.t > 0);
  }

  function step(dt, input = {}) {
    if (!['playing', 'dying', 'flag'].includes(state.mode)) return state;
    state.t += dt; const P = state.player;
    if (state.mode === 'dying') { P.deathT -= dt; if (P.deathT < 1.8) { P.vy += P.g * 40 * dt; P.y += P.vy * dt; } if (P.deathT <= 0) loseLife(); return state; }
    if (state.mode === 'flag') {
      const F = state.flag; F.t += dt;
      const target = P.g > 0 ? FLOOR_Y - P.h : CEIL_Y; P.vx = 0; P.vy = 0;
      P.y += Math.sign(target - P.y) * Math.min(Math.abs(target - P.y), 9 * dt); F.drop = Math.min(1, F.t / 1.1);
      if (F.t > 1.6) finish();
      return state;
    }
    state.time -= dt * TUNE.timeRate; if (state.time <= 0) { state.time = 0; die(); return state; }
    stepPlayer(dt, input); stepItems(dt); stepEnemies(dt);
    if (state.mode !== 'playing') return state;
    const lv = L();
    lv.checks.forEach((c, i) => { if (i > state.check && P.x >= c.x && P.g === c.g) { state.check = i; ev('check', { x: c.x }); } });
    if (P.x + P.w >= lv.flagX + .4) {
      const d = P.g > 0 ? FLOOR_Y - (P.y + P.h) : P.y - CEIL_Y, bonus = d >= 8.5 ? 5000 : d >= 6.5 ? 2000 : d >= 4.5 ? 800 : d >= 2.5 ? 400 : 100;
      state.mode = 'flag'; state.flag = { t: 0, bonus, drop: 0, y: P.y }; P.x = lv.flagX + .4 - P.w; addScore(bonus, lv.flagX, P.y); ev('flagpole', { bonus });
      return state;
    }
    if ((P.g > 0 && P.y > ROWS + .5) || (P.g < 0 && P.y + P.h < -.5)) { P.invuln = 0; die(); }
    return state;
  }
  const pause = () => { if (state.mode !== 'playing') return false; state.mode = 'paused'; ev('pause'); return true; };
  const resume = () => { if (state.mode !== 'paused') return false; state.mode = 'playing'; return true; };
  const snapshot = () => structuredClone(state), restore = s => { for (const k of Object.keys(state)) delete state[k]; Object.assign(state, structuredClone(s)); };
  return { state, start, next, step, pause, resume, tile, solidAt, snapshot, restore, get level() { return L(); } };
}
