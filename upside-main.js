// Upside Nib — 2D canvas renderer, input, chiptune audio. All art is drawn procedurally at 16px/tile.
import { createUpside, LEVELS, ROWS, TILE, FLOOR_Y, CEIL_Y } from './upside-game.js?v2';

const $ = id => document.getElementById(id);
let storage = null; try { storage = window.localStorage; storage.getItem('x'); } catch { storage = null; }
const game = createUpside({ storage }), S = game.state;
const cv = $('screen'), ctx = cv.getContext('2d', { alpha: false });
let VW = 400, VH = 240, OY = 0, scale = 1, safe = { t: 0, r: 0, b: 0, l: 0 };

// ---------- crisp integer scaling ----------
function resize() {
  const dpr = devicePixelRatio || 1, wd = Math.round(innerWidth * dpr), hd = Math.round(innerHeight * dpr);
  scale = Math.max(1, Math.floor(hd / 240));
  VW = Math.ceil(wd / scale); VH = Math.ceil(hd / scale); OY = Math.floor((VH - 240) / 2);
  cv.width = VW; cv.height = VH; cv.style.width = `${VW * scale / dpr}px`; cv.style.height = `${VH * scale / dpr}px`;
  ctx.imageSmoothingEnabled = false;
  const cs = getComputedStyle($('safe')), px = v => (parseFloat(v) || 0) * dpr / scale;
  safe = { t: px(cs.paddingTop), r: px(cs.paddingRight), b: px(cs.paddingBottom), l: px(cs.paddingLeft) };
}
addEventListener('resize', resize);

// ---------- pixel art ----------
const mk = (w, h, f) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; f((X, Y, W, H, col) => { x.fillStyle = col; x.fillRect(X, Y, W, H); }, x); return c; };
const K = '#140c1c';
const flipV = src => mk(src.width, src.height, (r, x) => { x.translate(0, src.height); x.scale(1, -1); x.drawImage(src, 0, 0); });
const flipH = src => mk(src.width, src.height, (r, x) => { x.translate(src.width, 0); x.scale(-1, 1); x.drawImage(src, 0, 0); });
const variants = src => { const h = flipH(src); return { r: src, l: h, rv: flipV(src), lv: flipV(h) }; };

function groundTile(grass, dir) { // dir 1: grass on top (floor world), -1: grass underneath (ceiling world)
  const t = mk(16, 16, r => {
    r(0, 0, 16, 16, '#c86c30');
    for (const [x, y, w, h] of [[0, 0, 7, 7], [8, 0, 8, 4], [8, 5, 8, 6], [0, 8, 4, 8], [5, 8, 11, 3], [5, 12, 6, 4], [12, 12, 4, 4]]) { r(x, y, w, 1, '#f0a868'); r(x, y, 1, h, '#f0a868'); r(x, y + h - 1, w, 1, '#7a3412'); r(x + w - 1, y, 1, h, '#7a3412'); }
    if (grass) { r(0, 0, 16, 4, '#4cc038'); r(0, 4, 16, 1, '#1e7a1e'); for (const x of [1, 5, 8, 12, 14]) r(x, 4, 2, 1 + (x % 3), '#1e7a1e'); r(2, 1, 2, 1, '#a8f070'); r(9, 1, 3, 1, '#a8f070'); }
  });
  return dir < 0 ? flipV(t) : t;
}
const brick = mk(16, 16, r => { r(0, 0, 16, 16, '#c84c0c'); for (const y of [0, 4, 8, 12]) { r(0, y, 16, 1, '#f8a070'); r(0, y + 3, 16, 1, K); } for (let y = 0; y < 4; y++) { const o = y % 2 ? 4 : 0; for (let x = o; x < 16; x += 8) r(x + 7 > 15 ? 15 : x + 7, y * 4, 1, 3, K); } });
const qblock = ['#fcbc3c', '#e89a20', '#c87810'].map(base => mk(16, 16, r => {
  r(0, 0, 16, 16, K); r(1, 1, 14, 14, base); r(1, 1, 14, 1, '#fff0a0'); r(1, 1, 1, 14, '#fff0a0');
  for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) r(x, y, 1, 1, K);
  const Q = [[5, 3, 6, 2], [4, 4, 2, 3], [10, 4, 2, 3], [9, 6, 2, 2], [7, 7, 2, 3], [7, 11, 2, 2]];
  for (const [x, y, w, h] of Q) r(x + 1, y + 1, w, h, '#8a3a00'); for (const [x, y, w, h] of Q) r(x, y, w, h, '#fff8e0');
}));
const used = mk(16, 16, r => { r(0, 0, 16, 16, K); r(1, 1, 14, 14, '#9a5a28'); r(1, 1, 14, 1, '#c88850'); for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) r(x, y, 1, 1, K); });
const hard = mk(16, 16, r => { r(0, 0, 16, 16, '#c87838'); r(0, 0, 16, 2, '#f8c080'); r(0, 0, 2, 16, '#f8c080'); r(0, 14, 16, 2, '#5a2a0c'); r(14, 0, 2, 16, '#5a2a0c'); r(4, 4, 8, 8, '#a85a24'); });
const pipeCol = (r, x0, cap) => { const cols = ['#0c4a0c', '#9cf070', '#9cf070', '#5ad040', '#2ca82c', '#2ca82c', '#2ca82c', '#2ca82c', '#2ca82c', '#2ca82c', '#2ca82c', '#1a7a1a', '#1a7a1a', '#2ca82c', '#1a7a1a', '#0c4a0c']; return cols; };
const PC = pipeCol();
const pipeL = mk(16, 16, r => { r(0, 0, 1, 16, K); for (let i = 1; i < 16; i++) r(i, 0, 1, 16, PC[Math.min(15, Math.floor(i / 2) + (i > 8 ? 4 : 0))] || '#2ca82c'); r(1, 0, 1, 16, '#5ad040'); r(3, 0, 2, 16, '#9cf070'); });
const pipeR = mk(16, 16, r => { r(0, 0, 16, 16, '#2ca82c'); r(6, 0, 2, 16, '#1a7a1a'); r(10, 0, 4, 16, '#1a7a1a'); r(13, 0, 2, 16, '#0c4a0c'); r(15, 0, 1, 16, K); });
const pipeCap = mk(36, 16, r => { r(0, 0, 36, 16, K); r(1, 1, 34, 14, '#2ca82c'); r(3, 1, 2, 14, '#9cf070'); r(6, 1, 2, 14, '#9cf070'); r(24, 1, 3, 14, '#1a7a1a'); r(29, 1, 5, 14, '#1a7a1a'); r(1, 14, 34, 1, '#0c4a0c'); });
const pipeCapV = flipV(pipeCap);
const coinF = [8, 6, 2, 6].map(w => mk(16, 16, r => { const x = 8 - w / 2; r(x, 2, w, 12, K); if (w > 2) { r(x + 1, 3, w - 2, 10, '#fcbc3c'); r(x + 1, 3, 1, 10, '#fff0a0'); if (w > 5) r(7, 5, 2, 6, '#c87810'); } else r(x, 3, w, 10, '#fcbc3c'); }));

// Nib, the lantern sprite. Procedural so small/big/fire share one design.
function nib(big, fire, pose) {
  const H = big ? 28 : 16, glassH = big ? 13 : 6, top = big ? 6 : 4;
  const Y = fire ? '#ffffff' : '#fff070', O = fire ? '#ff4060' : '#ff9a1f', B = fire ? '#e4402c' : '#b8742a', G = fire ? '#fff4f0' : '#ffe9a0', E = fire ? '#c81f3a' : '#ff7a3a';
  return mk(16, H, r => {
    if (pose === 'dead') { r(4, top + 2, 8, glassH, K); }
    // flame
    const f = big ? 1 : 0; r(7, 0, 2, 1 + f, Y); r(6, 1 + f, 4, 1, Y); r(6, 2 + f, 4, 1 + f, O); r(7, 2 + f, 2, 1, Y); r(7, 3 + 2 * f, 2, 1, O);
    // cap
    r(4, top, 8, 1, K); r(3, top + 1, 10, 1, K); r(4, top + 1, 8, 1, B); r(5, top, 6, 1, B); r(5, top, 2, 1, '#ffd890');
    // glass body
    const gy = top + 2; r(2, gy, 12, glassH, K); r(3, gy, 10, glassH, G); r(3, gy, 1, glassH, O); r(12, gy, 1, glassH, O); r(4, gy, 1, 2, '#ffffff');
    const ey = gy + (big ? 4 : 1);
    if (pose === 'dead') { r(7, ey, 1, 1, K); r(6, ey + 1, 1, 1, K); r(8, ey + 1, 1, 1, K); r(10, ey, 1, 1, K); r(9, ey + 1, 1, 1, K); r(11, ey + 1, 1, 1, K); }
    else { r(7, ey, 1, 2, K); r(10, ey, 1, 2, K); r(6, ey + 2, 1, 1, E); r(11, ey + 2, 1, 1, E); }
    r(8, ey + 3, 2, 1, pose === 'dead' ? K : '#c84c0c');
    if (big) { r(5, gy + glassH - 4, 6, 1, O); r(5, gy + glassH - 3, 6, 1, '#ffc060'); } // inner flame band
    // arms
    const ay = gy + (big ? 6 : 2); if (pose === 'jump') { r(1, ay - 2, 1, 2, K); r(14, ay - 3, 1, 2, K); } else { r(1, ay, 1, 2, K); r(14, ay, 1, 2, K); }
    // base + legs
    const by = gy + glassH; r(3, by, 10, 1, B); r(3, by + 1, 10, 1, K);
    const ly = H - 2;
    if (pose === 'walk1') { r(3, ly, 3, 1, K); r(2, ly + 1, 3, 1, K); r(10, ly, 3, 1, K); r(11, ly + 1, 3, 1, K); }
    else if (pose === 'walk2') { r(6, ly, 2, 2, K); r(8, ly, 2, 1, K); r(8, ly + 1, 3, 1, K); }
    else if (pose === 'jump') { r(3, ly - 1, 2, 2, K); r(11, ly, 3, 1, K); r(12, ly + 1, 2, 1, K); }
    else if (pose === 'skid') { r(4, ly, 2, 2, K); r(9, ly, 4, 1, K); r(12, ly - 1, 2, 1, K); }
    else { r(5, ly, 2, 2, K); r(9, ly, 2, 2, K); r(4, ly + 1, 1, 1, K); r(11, ly + 1, 1, 1, K); }
  });
}
const NIB = {}; for (const big of [0, 1]) for (const fire of [0, 1]) for (const pose of ['stand', 'walk1', 'walk2', 'jump', 'skid', 'dead']) NIB[`${big}${fire}${pose}`] = variants(nib(big, fire, pose));
function bug(frame, squish) { // Grumblebug
  return mk(16, 16, r => {
    if (squish) { r(1, 10, 14, 6, K); r(2, 11, 12, 4, '#7a3cc8'); r(3, 11, 10, 1, '#b088ff'); r(4, 13, 2, 1, '#fff'); r(10, 13, 2, 1, '#fff'); return; }
    r(3, 2, 10, 1, K); r(2, 3, 12, 1, K); r(1, 4, 14, 8, K); r(2, 3, 12, 9, '#7a3cc8'); r(3, 3, 10, 2, '#b088ff'); r(2, 11, 12, 1, '#4a1c88');
    r(4, 5, 3, 1, K); r(9, 5, 3, 1, K); r(4, 6, 3, 3, '#fff'); r(9, 6, 3, 3, '#fff'); r(5, 7, 2, 2, K); r(9, 7, 2, 2, K); r(6, 10, 4, 1, '#fff');
    r(2, 1, 1, 2, K); r(13, 1, 1, 2, K); r(2, 0, 2, 1, '#b088ff'); r(12, 0, 2, 1, '#b088ff');
    if (frame) { r(1, 12, 5, 2, K); r(0, 14, 5, 2, '#3a1440'); r(10, 12, 4, 2, K); r(10, 14, 4, 2, '#3a1440'); }
    else { r(2, 12, 4, 2, K); r(2, 14, 4, 2, '#3a1440'); r(10, 12, 5, 2, K); r(11, 14, 5, 2, '#3a1440'); }
  });
}
function shellback(frame, mode) { // red-shelled beetle; mode 'walk' | 'shell'
  return mk(16, 16, r => {
    const sy = mode === 'walk' ? 2 : 5;
    r(2, sy, 12, 1, K); r(1, sy + 1, 14, 8, K); r(2, sy + 1, 12, 7, '#d83020'); r(3, sy + 1, 10, 2, '#ff8060'); r(1, sy + 8, 14, 2, K); r(2, sy + 8, 12, 1, '#fff0c0');
    for (const x of [4, 8, 11]) r(x, sy + 4, 2, 2, '#fcbc3c');
    if (mode === 'walk') { r(12, 9, 4, 4, K); r(12, 10, 3, 2, '#fcbc3c'); r(14, 10, 1, 1, K); r(2, 12, 3, 3, K); r(8 + (frame ? 1 : -1), 12, 3, 3, K); r(3, 13, 1, 1, '#fcbc3c'); }
    else if (frame) { r(5, sy + 3, 6, 1, '#ffffff'); } else r(6, sy + 6, 2, 1, '#fff');
  });
}
const BUG = [0, 1].map(f => variants(bug(f))), BUGSQ = variants(bug(0, true));
const SHB = { walk: [0, 1].map(f => variants(shellback(f, 'walk'))), shell: [0, 1].map(f => variants(shellback(f, 'shell'))) };
const glowCap = variants(mk(16, 16, r => { r(3, 1, 10, 1, K); r(1, 2, 14, 6, K); r(2, 2, 12, 6, '#20c0b0'); r(2, 2, 12, 1, '#80fff0'); r(4, 3, 3, 3, '#ffd040'); r(10, 4, 3, 2, '#ffd040'); r(7, 2, 2, 2, '#ffd040'); r(0, 7, 16, 2, K); r(3, 9, 10, 6, K); r(4, 9, 8, 5, '#ffe8c0'); r(6, 10, 1, 2, K); r(9, 10, 1, 2, K); r(4, 15, 8, 1, K); }));
const bloom = [0, 1].map(f => mk(16, 16, r => { const a = f ? '#ff6020' : '#ffb020', b = f ? '#ffb020' : '#ff6020'; r(2, 1, 12, 7, K); r(3, 2, 10, 5, a); r(5, 3, 6, 3, b); r(7, 4, 2, 1, '#fff8c0'); r(7, 8, 2, 7, '#1e7a1e'); r(3, 10, 4, 2, '#4cc038'); r(9, 11, 4, 2, '#4cc038'); r(2, 15, 12, 1, K); }));
const bloomV = bloom.map(flipV);
const ember = [0, 1].map(f => mk(8, 8, r => { if (f) { r(3, 0, 2, 8, '#ffdd40'); r(0, 3, 8, 2, '#ffdd40'); r(2, 2, 4, 4, '#ff6020'); } else { r(1, 1, 2, 2, '#ffdd40'); r(5, 5, 2, 2, '#ffdd40'); r(5, 1, 2, 2, '#ffdd40'); r(1, 5, 2, 2, '#ffdd40'); r(2, 2, 4, 4, '#ff6020'); } }));
const lifeIcon = mk(8, 8, r => { r(3, 0, 2, 2, '#fff070'); r(2, 2, 4, 1, '#b8742a'); r(1, 3, 6, 4, K); r(2, 3, 4, 4, '#ffe9a0'); r(3, 4, 1, 1, K); r(5, 4, 1, 1, K); r(2, 7, 4, 1, '#b8742a'); });
const coinIcon = mk(6, 8, r => { r(1, 0, 4, 8, K); r(2, 1, 2, 6, '#fcbc3c'); });
const GROUND = { f: groundTile(false, 1), fg: groundTile(true, 1), c: groundTile(false, -1), cg: groundTile(true, -1) };

// 3x5 pixel font
const FONT = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001010010', 8: '111101111101111', 9: '111101111001111', A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010', Z: '111001010100111', '-': '000000111000000', '*': '000101010101000', ':': '000010000010000', '!': '010010010000010', '.': '000000000000010', '+': '000010111010000', '/': '001001010100100' };
function text(str, x, y, col = '#fff', s = 2, shadow = true) {
  str = String(str).toUpperCase();
  const draw = (ox, oy, c) => { ctx.fillStyle = c; let cx = x + ox; for (const ch of str) { const g = FONT[ch]; if (g) for (let i = 0; i < 15; i++) if (g[i] === '1') ctx.fillRect(cx + (i % 3) * s, y + oy + Math.floor(i / 3) * s, s, s); cx += 4 * s; } };
  if (shadow) draw(s / 2 || 1, s / 2 || 1, K); draw(0, 0, col); return str.length * 4 * s;
}
const textW = (str, s = 2) => String(str).length * 4 * s - s;

// ---------- background decoration (deterministic per level) ----------
let deco = null;
function buildDeco() {
  const lv = game.level, w = lv.w, hasF = x => lv.rows[13][x] === '#', hasC = x => lv.rows[0][x] === '#';
  const span = (a, n, f) => { for (let x = a; x < a + n; x++) if (x < 0 || x >= w || !f(x)) return false; return true; };
  const hills = [], bushes = [], clouds = [];
  for (let x = 0; x < w; x += 16) { const big = (x / 16) % 2 === 0, n = big ? 5 : 3; if (span(x, n, hasF)) hills.push({ x, big, side: 'f' }); const cx = x + 8; if (span(cx, 3, hasC)) hills.push({ x: cx, big: false, side: 'c' }); }
  for (let x = 11; x < w; x += 12) { const n = 1 + (x * 7) % 3; if (span(x, n + 2, hasF) && lv.rows[12].slice(x, x + n + 2).split('').every(c => c === '.')) bushes.push({ x, n, side: 'f' }); if (span(x + 5, n + 2, hasC) && lv.rows[2].slice(x + 5, x + n + 7).split('').every(c => c === '.')) bushes.push({ x: x + 5, n, side: 'c' }); }
  for (let x = 4; x < w * 1.2; x += 9 + (x * 13) % 7) clouds.push({ x, y: 4.2 + ((x * 31) % 50) / 12, n: 1 + (x % 3) });
  deco = { hills, bushes, clouds, castle: { x: lv.flagX + 6, f: span(lv.flagX + 5, 6, hasF), c: span(lv.flagX + 5, 6, hasC) } };
}
function blob(x, y, w, h, fill, line, down) { // rounded pixel shape sitting on y (down: hanging from y)
  for (let i = 0; i < h; i++) { const t = 1 - (i / h), half = Math.round(w / 2 * Math.sqrt(1 - t * t)); const yy = down ? y + h - 1 - i : y - h + i; ctx.fillStyle = line; ctx.fillRect(x + w / 2 - half - 1, yy, half * 2 + 2, 1); }
  for (let i = 1; i < h; i++) { const t = 1 - (i / h), half = Math.round(w / 2 * Math.sqrt(1 - t * t)) - 1; const yy = down ? y + h - 1 - i : y - h + i; if (half > 0) { ctx.fillStyle = fill; ctx.fillRect(x + w / 2 - half, yy, half * 2, 1); } }
}
function puff(x, y, n, fill, line, down) { for (let i = 0; i < n + 2; i++) blob(x + i * 12 - 2, y, 20, i === 0 || i === n + 1 ? 10 : 14, fill, line, down); }

// ---------- particles / camera ----------
const parts = [], pops = [];
let camX = 0, last = performance.now(), acc = 0, frame = 0;
const W2S = (x, y) => [Math.round(x * TILE - camX * TILE), Math.round(OY + y * TILE)];

function draw() {
  frame++;
  const lv = game.level, VWt = VW / TILE, P = S.player;
  ctx.fillStyle = '#5c94fc'; ctx.fillRect(0, 0, VW, VH);
  if (!P) return;
  const px = Math.round(camX * TILE);
  // clouds (parallax)
  for (const c of deco.clouds) { const x = Math.round(c.x * TILE - px * .5), y = OY + Math.round(c.y * TILE); if (x > -80 && x < VW + 20) puff(x, y, c.n, '#ffffff', '#3c5cbc'); }
  // hills + bushes (fixed to world like a classic stage)
  for (const h of deco.hills) { const [x, y] = W2S(h.x, h.side === 'f' ? FLOOR_Y : CEIL_Y); if (x < -100 || x > VW + 10) continue; const w = h.big ? 80 : 48, hh = h.big ? 36 : 20; blob(x, y + (h.side === 'f' ? 0 : -1), w, hh, '#3ca830', '#0c4a0c', h.side === 'c'); ctx.fillStyle = '#0c4a0c'; const sy = h.side === 'f' ? y - hh + 8 : y + hh - 10; ctx.fillRect(x + w / 2 - 6, sy, 2, 3); ctx.fillRect(x + w / 2 + 4, sy, 2, 3); ctx.fillRect(x + w / 2 - 1, sy + (h.side === 'f' ? 8 : -6), 2, 3); }
  for (const b of deco.bushes) { const [x, y] = W2S(b.x, b.side === 'f' ? FLOOR_Y : CEIL_Y); if (x > -80 && x < VW + 20) puff(x, y + (b.side === 'c' ? 0 : 0), b.n, '#7ad840', '#0c4a0c', b.side === 'c'); }
  // castles (lantern keeps) after the flag
  for (const side of ['f', 'c']) if (deco.castle[side]) { const [x, y] = W2S(deco.castle.x, side === 'f' ? FLOOR_Y : CEIL_Y); if (x < VW && x > -100) castle(x, y, side === 'c'); }
  // items emerging sit behind blocks
  for (const it of S.items) if (it.emerge > 0) drawItem(it);
  // tiles
  const x0 = Math.floor(camX) - 1, x1 = x0 + Math.ceil(VWt) + 3, rowMin = Math.floor(-OY / TILE) - 1, rowMax = Math.ceil((VH - OY) / TILE);
  for (let ty = rowMin; ty <= rowMax; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (tx < 0 || tx >= lv.w) continue;
    let c = ty < 0 ? (game.tile(tx, 0) === '#' ? '#' : '.') : ty >= ROWS ? (game.tile(tx, ROWS - 1) === '#' ? '#' : '.') : game.tile(tx, ty);
    if (c === '.' ) continue;
    let [sx, sy] = W2S(tx, ty);
    const b = S.bumps.find(b => b.x === tx && b.y === ty); if (b) sy -= Math.round(b.g * Math.sin((1 - b.t / .18) * Math.PI) * 5);
    if (c === '#') { const floorSide = ty >= 7, edge = floorSide ? ty === 13 && game.tile(tx, 12) !== '#' : ty === 1 && game.tile(tx, 2) !== '#'; ctx.drawImage(floorSide ? (edge ? GROUND.fg : GROUND.f) : (edge ? GROUND.cg : GROUND.c), sx, sy); }
    else if (c === 'B') ctx.drawImage(brick, sx, sy);
    else if (c === '?' || c === 'M') ctx.drawImage(qblock[[0, 0, 0, 1, 2, 1][Math.floor(frame / 8) % 6]], sx, sy);
    else if (c === 'U') ctx.drawImage(used, sx, sy);
    else if (c === 'X') ctx.drawImage(hard, sx, sy);
    else if (c === 'P' || c === 'R') {
      ctx.drawImage(c === 'P' ? pipeL : pipeR, sx, sy);
      if (c === 'P') { const fl = ty >= 7, open = fl ? game.tile(tx, ty - 1) !== 'P' : game.tile(tx, ty + 1) !== 'P'; if (open) ctx.drawImage(fl ? pipeCap : pipeCapV, sx - 2, sy); }
    }
    else if (c === 'o') ctx.drawImage(coinF[[0, 0, 1, 2, 1, 0][Math.floor(frame / 7) % 6]], sx, sy);
  }
  // checkpoints
  lv.checks.forEach((c, i) => { const [x, y] = W2S(c.x, c.g > 0 ? FLOOR_Y : CEIL_Y), on = i <= S.check; ctx.fillStyle = K; if (c.g > 0) { ctx.fillRect(x + 7, y - 32, 2, 32); ctx.fillStyle = on ? '#ff9a1f' : '#a0a0a0'; ctx.fillRect(x + 9, y - 31, 9, 6); ctx.fillRect(x + 9, y - 25, 5, 2); } else { ctx.fillRect(x + 7, y, 2, 32); ctx.fillStyle = on ? '#ff9a1f' : '#a0a0a0'; ctx.fillRect(x + 9, y + 25, 9, 6); ctx.fillRect(x + 9, y + 23, 5, 2); } });
  // flag pole spanning both worlds
  { const [x, yTop] = W2S(lv.flagX, CEIL_Y), [, yBot] = W2S(lv.flagX, FLOOR_Y); if (x > -40 && x < VW + 40) {
    ctx.fillStyle = '#d8f8d8'; ctx.fillRect(x + 7, yTop, 2, yBot - yTop); ctx.fillStyle = '#3ca830'; ctx.fillRect(x + 6, yTop + 4, 4, yBot - yTop - 8);
    ctx.fillStyle = '#d8f8d8'; ctx.fillRect(x + 7, yTop, 2, yBot - yTop);
    for (const yy of [yTop, yBot - 8]) { ctx.fillStyle = K; ctx.fillRect(x + 4, yy, 8, 8); ctx.fillStyle = '#4cc038'; ctx.fillRect(x + 5, yy + 1, 6, 6); ctx.fillStyle = '#c8ffb0'; ctx.fillRect(x + 6, yy + 2, 2, 2); }
    const mid = (yTop + yBot) / 2 - 7, F = S.flag, g = P.g, dest = g > 0 ? yBot - 24 : yTop + 10, fy = Math.round(F ? mid + (dest - mid) * F.drop : mid + Math.sin(frame / 20) * 2);
    ctx.fillStyle = K; ctx.beginPath(); ctx.moveTo(x + 7, fy - 1); ctx.lineTo(x - 11, fy + 7); ctx.lineTo(x + 7, fy + 15); ctx.fill(); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(x + 7, fy); ctx.lineTo(x - 9, fy + 7); ctx.lineTo(x + 7, fy + 14); ctx.fill(); ctx.fillStyle = '#ff9a1f'; ctx.fillRect(x - 1, fy + 5, 4, 5); ctx.fillStyle = '#fff070'; ctx.fillRect(x, fy + 3, 2, 2);
  } }
  for (const it of S.items) if (!(it.emerge > 0)) drawItem(it);
  // enemies
  for (const e of S.enemies) {
    if (!e.alive || !e.active) continue; const [x, y] = W2S(e.x - .05, e.y - (e.g > 0 ? .1 : 0)); if (x < -20 || x > VW + 20) continue;
    const f = Math.floor(e.t * 6) % 2, side = e.dir > 0 ? 'r' : 'l', dead = e.mode === 'dead', v = (e.g < 0) !== dead ? 'v' : '';
    let set = e.type === 'walker' ? (e.mode === 'squish' ? BUGSQ : BUG[f]) : SHB[e.mode === 'walk' ? 'walk' : 'shell'][e.mode === 'slide' ? Math.floor(e.t * 16) % 2 : (e.mode === 'shell' && e.t > 5 ? Math.floor(e.t * 10) % 2 : 0)];
    ctx.drawImage(set[side + v] || set[side], x, y);
  }
  for (const f of S.fireballs) { const [x, y] = W2S(f.x, f.y); ctx.drawImage(ember[Math.floor(f.t * 12) % 2], x, y); }
  // Nib
  if (!(P.invuln > 0 && frame % 6 < 3)) {
    const big = P.power > 0 && P.h > 1 ? 1 : 0, fire = P.power === 2 ? 1 : 0, air = !P.ground;
    let pose = S.mode === 'dying' ? 'dead' : air ? 'jump' : P.skid ? 'skid' : Math.abs(P.vx) > .3 ? (['walk1', 'stand', 'walk2', 'stand'][Math.floor(S.t * (6 + Math.abs(P.vx) * 1.4)) % 4]) : 'stand';
    if (S.mode === 'flag') pose = 'jump';
    const spr = NIB[`${big}${fire}${pose}`], img = spr[(P.facing < 0 ? 'l' : 'r') + (P.g < 0 ? 'v' : '')];
    const sx = Math.round((P.x + P.w / 2) * TILE - px - 8), sy = P.g > 0 ? Math.round(OY + (P.y + P.h) * TILE - img.height) : Math.round(OY + P.y * TILE);
    if (S.mode !== 'dying' || frame % 2 === 0 || true) ctx.drawImage(img, sx, sy);
    if (!P.ground && P.airFlip && S.mode === 'playing') { ctx.fillStyle = '#7cf0ff'; const gy = P.g > 0 ? sy - 3 : sy + img.height + 1; ctx.fillRect(sx + 7, gy, 2, 2); }
  }
  // particles
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.t += 1 / 60; p.vy += (p.grav ?? 40) * 1 / 60; p.x += p.vx / 60; p.y += p.vy / 60; if (p.t > p.life) { parts.splice(i, 1); continue; } const [x, y] = W2S(p.x, p.y);
    if (p.kind === 'brick') { ctx.fillStyle = K; ctx.fillRect(x - 1, y - 1, 6, 6); ctx.fillStyle = '#c84c0c'; ctx.fillRect(x, y, 4, 4); }
    else if (p.kind === 'coin') ctx.drawImage(coinF[Math.floor(p.t * 20) % 4], x, y);
    else if (p.kind === 'dust') { ctx.fillStyle = '#ffffff'; const s = p.t < .1 ? 3 : 2; ctx.fillRect(x, y, s, s); }
    else if (p.kind === 'spark') { ctx.fillStyle = p.t % .1 < .05 ? '#fff070' : '#ff9a1f'; ctx.fillRect(x, y, 2, 2); } }
  for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.t += 1 / 60; if (p.t > .8) { pops.splice(i, 1); continue; } const [x, y] = W2S(p.x, p.y); text(p.n, x, y - Math.round(p.t * 24 * p.g), '#fff', 1); }
  hud();
}
function castle(x, y, down) {
  const rows = 5, wd = 5; for (let r = 0; r < rows; r++) for (let c = 0; c < wd; c++) { if (r === rows - 1 && (c === 0 || c === 4) || (r === rows - 1 && c % 2)) {} const yy = down ? y + r * 16 : y - (r + 1) * 16; if (r === rows - 1 && c % 2 === 1) continue; ctx.drawImage(brick, x + c * 16, yy); }
  ctx.fillStyle = K; const dy = down ? y : y - 28; ctx.fillRect(x + 32, dy, 16, 28); ctx.fillStyle = '#ffd040'; ctx.fillRect(x + 37, down ? y + 10 : y - 18, 6, 8); // lit lantern window
}
function drawItem(it) { const [x, y] = W2S(it.x - .05, it.y - .05); if (it.kind === 'cap') ctx.drawImage(it.g > 0 ? glowCap.r : glowCap.rv, x, y); else ctx.drawImage(it.g > 0 ? bloom[Math.floor(frame / 8) % 2] : bloomV[Math.floor(frame / 8) % 2], x, y); }

function hud() {
  const P = S.player, top = Math.max(3, Math.round(safe.t) + 3), left = Math.max(6, Math.round(safe.l) + 6), right = VW - Math.max(6, Math.round(safe.r) + 6), lv = game.level;
  ctx.fillStyle = '#0008'; ctx.fillRect(0, 0, VW, top + 22);
  const cols = [['NIB', String(S.score).padStart(6, '0')], [null, '*' + String(S.coins).padStart(2, '0')], ['WORLD', `${lv.id}-1`], ['TIME', String(Math.ceil(S.time)).padStart(3, '0')], [null, 'x' + S.lives]];
  const span = right - left, step = span / cols.length;
  cols.forEach(([a, b], i) => { const x = Math.round(left + step * i + (i ? step / 2 - 22 : 0)); if (a) text(a, x, top, '#fff', 2); else { if (i === 1) ctx.drawImage(coinIcon, x, top + 2); else ctx.drawImage(lifeIcon, x - 2, top + 1); }
    text(b.replace('*', ' ').replace('x', ' '), x + (a ? 0 : 0), a ? top + 12 : top + 12, i === 1 ? '#fcbc3c' : '#fff', 2); if (!a) text(i === 1 ? 'COIN' : 'LIVES', x + 10, top, '#fff', 2); });
  // flip charge indicator
  const ok = P.ground || P.airFlip; text(ok ? 'FLIP' : '----', right - 32, top + 24, ok ? '#7cf0ff' : '#808080', 2);
}
const pop = (n, x, y, g = 1) => pops.push({ n: String(n), x, y, t: 0, g });
function burst(kind, x, y, n, sp = 6, life = .9, grav = 40) { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; parts.push({ kind, x, y, vx: Math.cos(a) * sp * (.6 + (i % 3) * .2), vy: Math.sin(a) * sp - 4, t: 0, life, grav }); } }

// ---------- audio ----------
let ac = null, master = null, muted = false; try { muted = storage?.getItem('games:pref:upside:muted') === '1'; } catch { }
function audio() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = .5; master.connect(ac.destination); } catch { ac = null; } } if (ac?.state === 'suspended') ac.resume().catch(() => { }); return ac; }
function tone(f, dur, type = 'square', to = null, vol = .12, delay = 0) {
  if (muted || !audio()) return; const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); o.connect(g).connect(master); o.start(t); o.stop(t + dur + .02);
}
function noise(dur, vol = .15, delay = 0) { if (muted || !audio()) return; const b = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length); const s = ac.createBufferSource(), g = ac.createGain(); g.gain.value = vol; s.buffer = b; s.connect(g).connect(master); s.start(ac.currentTime + delay); }
const SFX = {
  jump: e => tone(e.big ? 220 : 300, .16, 'square', e.big ? 520 : 760, .09), coin: () => { tone(988, .06, 'square', null, .08); tone(1319, .25, 'square', null, .08, .06); },
  stomp: () => { tone(260, .1, 'square', 90, .12); }, bump: () => tone(140, .08, 'triangle', 90, .25), thud: () => tone(110, .06, 'triangle', 70, .2), break: () => { noise(.18, .25); tone(180, .1, 'square', 60, .06); },
  sprout: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .08, 'square', null, .07, i * .06)), grow: () => [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .07, 'square', null, .07, i * .05)),
  shrink: () => [880, 660, 440, 330].forEach((f, i) => tone(f, .08, 'square', null, .08, i * .06)), flip: e => tone(e.g > 0 ? 900 : 260, .18, 'triangle', e.g > 0 ? 260 : 900, .25),
  fire: () => tone(1400, .06, 'square', 300, .06), kick: () => tone(660, .05, 'square', 330, .1), poof: () => noise(.06, .08), oneup: () => [660, 784, 1319, 1047, 1175, 1568].forEach((f, i) => tone(f, .09, 'square', null, .07, i * .08)),
  check: () => { tone(784, .1, 'square', null, .07); tone(1175, .2, 'square', null, .07, .1); },
  die: () => [494, 466, 440, 0, 330, 294, 262].forEach((f, i) => f && tone(f, .14, 'square', null, .09, .3 + i * .14)),
  flagpole: () => tone(220, 1, 'square', 1760, .07), cleared: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, .14, 'square', null, .08, i * .13)),
  won: () => [523, 523, 659, 784, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, .16, 'square', null, .08, i * .14)), gameover: () => [392, 330, 262, 196].forEach((f, i) => tone(f, .25, 'triangle', null, .25, i * .25)),
};
// original looping chiptune (lead + bass), scheduled ahead
const N = n => 440 * 2 ** ((n - 69) / 12);
const LEAD = [[76, 1], [79, 1], [81, 2], [79, 1], [76, 1], [72, 2], [74, 1], [76, 1], [79, 2], [76, 2], [0, 2], [81, 1], [84, 1], [83, 1], [81, 1], [79, 2], [76, 1], [79, 1], [81, 1], [79, 1], [76, 1], [74, 1], [72, 4], [0, 2], [72, 1], [74, 1], [76, 2], [72, 1], [69, 1], [67, 2], [69, 1], [72, 1], [74, 2], [76, 2], [0, 2], [79, 1], [81, 1], [79, 1], [76, 1], [74, 2], [72, 1], [74, 1], [76, 1], [74, 1], [71, 1], [74, 1], [72, 4], [0, 2]];
const BASS = [48, 55, 57, 53, 48, 55, 53, 55];
let musicT = 0, leadI = 0, bassI = 0, nextLead = 0, nextBass = 0, musicOn = false;
function musicTick() {
  if (muted || !ac || S.mode !== 'playing') { musicOn = false; return; }
  const e8 = .15, now = ac.currentTime; if (!musicOn) { musicOn = true; nextLead = nextBass = now + .05; }
  while (nextLead < now + .3) { const [n, l] = LEAD[leadI++ % LEAD.length]; if (n) tone(N(n), e8 * l * .9, 'square', null, .035, nextLead - now); nextLead += e8 * l; }
  while (nextBass < now + .3) { const n = BASS[Math.floor(bassI / 4) % BASS.length]; tone(N(bassI % 2 ? n + 7 : n), e8 * 1.8, 'triangle', null, .12, nextBass - now); bassI++; nextBass += e8 * 2; }
}
function toggleMute() { muted = !muted; try { storage?.setItem('games:pref:upside:muted', muted ? '1' : '0'); } catch { } $('muteBtn').textContent = muted ? '×' : '♪'; if (!muted) audio(); }

// ---------- input ----------
const keys = new Set(), latch = new Set(), touch = { left: false, right: false, jump: false, flip: false, run: false };
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'jump', KeyZ: 'jump', ArrowUp: 'jump', KeyW: 'jump', KeyX: 'run', ShiftLeft: 'run', ShiftRight: 'run', KeyJ: 'run', KeyC: 'flip', ArrowDown: 'flip', KeyS: 'flip', KeyK: 'flip' };
addEventListener('keydown', e => {
  audio();
  if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); if (S.mode === 'playing') pauseGame(); else if (S.mode === 'paused') resumeGame(); return; }
  if (e.code === 'KeyM') { toggleMute(); return; }
  if (e.code === 'Enter' && !$('overlay').hidden) { e.preventDefault(); $('panel').querySelector('[data-primary]')?.click(); return; }
  const k = KEYMAP[e.code]; if (k) { e.preventDefault(); keys.add(k); latch.add(k); }
});
addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) keys.delete(k); });
addEventListener('blur', () => { keys.clear(); for (const k in touch) touch[k] = false; if (S.mode === 'playing') pauseGame(); });
const input = () => { const o = {}; for (const k of ['left', 'right', 'jump', 'flip', 'run']) o[k] = keys.has(k) || touch[k] || latch.has(k); return o; };
function holdButton(el, k) {
  const ids = new Set(), set = () => { touch[k] = ids.size > 0; el.classList.toggle('down', touch[k]); };
  el.addEventListener('pointerdown', e => { e.preventDefault(); audio(); ids.add(e.pointerId); latch.add(k); try { el.setPointerCapture(e.pointerId); } catch { } set(); });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, e => { ids.delete(e.pointerId); set(); });
  el.addEventListener('contextmenu', e => e.preventDefault());
}
holdButton($('jumpBtn'), 'jump'); holdButton($('flipBtn'), 'flip'); holdButton($('runBtn'), 'run');
{ // d-pad: slide a thumb between left and right
  const el = $('dpad'), ptrs = new Map(), arrows = el.querySelectorAll('.arrow');
  const upd = () => { let l = false, r = false; for (const x of ptrs.values()) { const b = el.getBoundingClientRect(), d = x - (b.left + b.width / 2); if (d < -8) l = true; else if (d > 8) r = true; } touch.left = l; touch.right = r; arrows[0].classList.toggle('on', l); arrows[1].classList.toggle('on', r); };
  el.addEventListener('pointerdown', e => { e.preventDefault(); audio(); ptrs.set(e.pointerId, e.clientX); try { el.setPointerCapture(e.pointerId); } catch { } upd(); });
  el.addEventListener('pointermove', e => { if (ptrs.has(e.pointerId)) { ptrs.set(e.pointerId, e.clientX); upd(); } });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, e => { ptrs.delete(e.pointerId); upd(); });
}
$('muteBtn').onclick = toggleMute; $('muteBtn').textContent = muted ? '×' : '♪';
$('pauseBtn').onclick = () => S.mode === 'playing' ? pauseGame() : S.mode === 'paused' && resumeGame();
document.addEventListener('visibilitychange', () => { if (document.hidden && S.mode === 'playing') pauseGame(); });

// ---------- screens ----------
let selected = 1;
const panel = (html, actions) => { const ov = $('overlay'), p = $('panel'); p.innerHTML = html; ov.hidden = false; for (const b of p.querySelectorAll('[data-action]')) b.onclick = () => { audio(); actions[b.dataset.action]?.(b); }; p.querySelector('[data-primary]')?.focus({ preventScroll: true }); };
const hidePanel = () => { $('overlay').hidden = true; };
const bestLine = () => S.best ? `<p class="kicker">BEST ${String(S.best.score).padStart(6, '0')}</p>` : '';
const keysLine = `<p class="keys">← → move · Z/Space jump · X/Shift run &amp; fire · C/↓ flip gravity · P pause · M mute</p>`;
function title() {
  selected = Math.min(selected, S.unlocked);
  const lv = LEVELS.map(l => `<button data-action="pick" data-level="${l.id}" class="${l.id === selected ? 'sel' : ''}" ${l.id > S.unlocked ? 'disabled' : ''}>${l.id}-1<small>${l.name}</small></button>`).join('');
  panel(`<p class="kicker">A GRAVITY-FLIP PLATFORMER</p><h1>UPSIDE <span>NIB</span></h1><p>Run, stomp and bump blocks — then FLIP to the ceiling world. One mid-air flip, refilled when you land or stomp.</p><div class="levels">${lv}</div><button class="primary" data-primary data-action="start">START ${selected}-1</button>${bestLine()}${keysLine}`,
    { pick: b => { selected = +b.dataset.level; title(); }, start: () => begin(selected) });
}
function begin(id) { hidePanel(); parts.length = pops.length = 0; game.start(id); buildDeco(); camX = 0; flash(); }
function pauseGame() { if (game.pause()) panel(`<h2>PAUSED</h2><p>${game.level.name} · ${Math.ceil(S.time)} left</p><button class="primary" data-primary data-action="resume">RESUME</button><div class="row"><button data-action="restart">RESTART</button><button data-action="quit">TITLE</button></div>`, { resume: resumeGame, restart: () => begin(game.level.id), quit: () => { S.mode = 'title'; title(); } }); }
function resumeGame() { if (game.resume()) { hidePanel(); last = performance.now(); } }
let hintT = 0; function flash() { hintT = 3.5; }
function onEnd() {
  if (S.mode === 'cleared') panel(`<p class="kicker">WORLD ${game.level.id}-1 CLEAR</p><h2>${game.level.name}</h2><p class="big">${String(S.score).padStart(6, '0')}</p><p>Flag bonus ${S.flag?.bonus ?? 0} · ★ ${S.coins} coins</p><button class="primary" data-primary data-action="next">NEXT WORLD ▶</button>${bestLine()}`, { next: () => { hidePanel(); game.next(); buildDeco(); camX = 0; parts.length = 0; flash(); } });
  else if (S.mode === 'won') panel(`<p class="kicker">ALL FOUR WORLDS LIT</p><h1>YOU <span>WIN!</span></h1><p class="big">${String(S.score).padStart(6, '0')}</p><p>${S.newBest ? 'NEW BEST SCORE!' : 'Nib\u2019s lantern glows on both skies.'}</p><button class="primary" data-primary data-action="again">PLAY AGAIN</button><button data-action="title">TITLE</button>${bestLine()}`, { again: () => begin(1), title });
  else if (S.mode === 'lost') panel(`<h2>GAME OVER</h2><p class="big">${String(S.score).padStart(6, '0')}</p><p>${S.newBest ? 'NEW BEST SCORE!' : 'The lantern flickers… but never goes out.'}</p><button class="primary" data-primary data-action="retry">TRY ${game.level.id}-1 AGAIN</button><button data-action="title">TITLE</button>${bestLine()}`, { retry: () => begin(game.level.id), title });
}

// ---------- loop ----------
function handleEvents() {
  for (const e of S.events) {
    SFX[e.type]?.(e);
    const P = S.player;
    if (e.type === 'break') burst('brick', e.x + .4, e.y + .4, 4, 7, 1.2, 50);
    else if (e.type === 'coinpop') parts.push({ kind: 'coin', x: e.x, y: e.y - e.g, vx: 0, vy: -e.g * 14, grav: e.g * 40, t: 0, life: .55 });
    else if (e.type === 'stomp') burst('dust', e.x + .45, e.y + .5, 6, 4, .3, 0);
    else if (e.type === 'points') pop(e.n, e.x, e.y, P.g);
    else if (e.type === 'poof') burst('spark', e.x, e.y, 5, 4, .25, 0);
    else if (e.type === 'flip') burst('spark', P.x + P.w / 2, P.y + P.h / 2, 8, 5, .35, 0);
    else if (e.type === 'oneup') pop('1UP', P.x, P.y, P.g);
    else if (e.type === 'respawn') { buildDeco(); camX = Math.max(0, P.x - VW / TILE * .35); flash(); }
  }
  S.events.length = 0;
}
let ended = false;
function loop(now) {
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  if (['playing', 'dying', 'flag'].includes(S.mode)) { acc += dt; const inp = input(); let n = 0; while (acc >= 1 / 60 && n++ < 6) { game.step(1 / 60, n === 1 ? inp : input()); latch.clear(); acc -= 1 / 60; } if (acc > .1) acc = 0; ended = false; }
  handleEvents();
  if (!ended && ['cleared', 'won', 'lost'].includes(S.mode)) { ended = true; onEnd(); }
  const P = S.player;
  if (P) { const VWt = VW / TILE, target = Math.max(0, Math.min(game.level.w - VWt, P.x + P.w / 2 - VWt * .4 + P.facing * 1.5 + P.vx * .15)); camX += (target - camX) * Math.min(1, dt * 5); camX = Math.max(0, Math.min(game.level.w - VWt, camX)); }
  if (deco) draw(); else { ctx.fillStyle = '#5c94fc'; ctx.fillRect(0, 0, VW, VH); }
  if (hintT > 0 && S.mode === 'playing') { hintT -= dt; const h = game.level.hint.toUpperCase().replace(/[^A-Z0-9 .!\-:]/g, ''), s = VW > 500 ? 2 : 1, w = textW(h, s); ctx.fillStyle = '#000a'; ctx.fillRect(Math.round(VW / 2 - w / 2 - 6), OY + 52, w + 12, 6 * s + 8); text(h, Math.round(VW / 2 - w / 2), OY + 56, '#fcbc3c', s, false); const name = `WORLD ${game.level.id}-1  ${game.level.name}`; text(name, Math.round(VW / 2 - textW(name) / 2), OY + 34, '#fff', 2); }
  $('flipBtn').classList.toggle('spent', !!(P && !P.ground && !P.airFlip));
  musicTick();
  requestAnimationFrame(loop);
}
resize();
// attract mode: show level 1 behind the title
game.start(1); S.mode = 'title'; buildDeco(); S.events.length = 0;
title();
if (new URLSearchParams(location.search).has('debug')) window.__upside = { game, begin, get camX() { return camX; } };
$('loading').remove(); document.body.dataset.ready = 'true';
requestAnimationFrame(t => { last = t; loop(t); });
