// Upside Nib — 2D canvas renderer, input, chiptune audio. All art is drawn procedurally at 16px/tile.
import { createUpside, LEVELS, ROWS, TILE, FLOOR_Y, CEIL_Y } from './upside-game.js?v3';
import { createUI } from './upside-ui.js?v3';

const $ = id => document.getElementById(id);
let storage = null; try { storage = window.localStorage; storage.getItem('x'); } catch { storage = null; }
const game = createUpside({ storage }), S = game.state;
const cv = $('screen'), ctx = cv.getContext('2d', { alpha: false });
let VW = 400, VH = 240, OY = 0, scale = 1, safe = { t: 0, r: 0, b: 0, l: 0 };
let prefs = { effects: true, music: true, reducedMotion: false }, ui;
const active = () => ['playing', 'dying', 'flag'].includes(S.mode);

// ---------- crisp integer scaling ----------
function resize() {
  const bounds = $('stage').getBoundingClientRect();
  const dpr = devicePixelRatio || 1, wd = Math.round(bounds.width * dpr), hd = Math.round(bounds.height * dpr);
  // Preserve at least twenty tiles of look-ahead, including portrait phones.
  scale = Math.max(1, Math.floor(Math.min(hd / 240, wd / 320)));
  VW = Math.ceil(wd / scale); VH = Math.min(288, Math.ceil(hd / scale)); OY = Math.max(16, Math.floor((VH - 240) / 2));
  cv.width = VW; cv.height = VH; cv.style.width = `${VW * scale / dpr}px`; cv.style.height = `${VH * scale / dpr}px`;
  ctx.imageSmoothingEnabled = false;
  const cs = getComputedStyle($('safe')), px = v => (parseFloat(v) || 0) * dpr / scale;
  safe = { t: px(cs.paddingTop), r: px(cs.paddingRight), b: px(cs.paddingBottom), l: px(cs.paddingLeft) };
  const canvasTop = bounds.top + (bounds.height - VH * scale / dpr) / 2;
  // Use portrait letterboxing for hints; otherwise keep them below both HUD rows.
  $('hint').style.top = `${canvasTop > 90 ? Math.max(54, bounds.top + safe.t * scale / dpr + 12) : canvasTop + 45 * scale / dpr + 8}px`;
}
addEventListener('resize', resize);
new ResizeObserver(resize).observe($('stage'));

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
let camX = 0, last = performance.now(), acc = 0, frame = 0, visualDT = 0, squash = 0, trailT = 0;
const THEMES = [
  { sky: '#69b9d5', low: '#d0ecbf', far: '#75a997', hill: '#579b65', bush: '#9acb67', line: '#295b57', cloud: '#f9efd5', label: 'MEADOW MORNING' },
  { sky: '#b2819c', low: '#ffd2a3', far: '#a87984', hill: '#a66e6a', bush: '#d4a56e', line: '#684b69', cloud: '#ffe6cd', label: 'BRICKWORK BREEZE' },
  { sky: '#444e91', low: '#9cb9d4', far: '#5a72a0', hill: '#467b91', bush: '#7cb6b2', line: '#263b68', cloud: '#d1d9f0', label: 'TWIN SKIES' },
  { sky: '#141b38', low: '#444571', far: '#303452', hill: '#424c70', bush: '#6a7392', line: '#20253f', cloud: '#737d9e', label: 'LANTERN KEEP' },
];
const theme = () => THEMES[S.levelIndex] || THEMES[0];
const W2S = (x, y) => [Math.round(x * TILE - camX * TILE), Math.round(OY + y * TILE)];

function drawDistantWorld() {
  const th = theme(), px = camX * TILE;
  // Three quiet depth layers frame the collision silhouettes without obscuring them.
  ctx.fillStyle = th.far;
  for (let i = -1; i < Math.ceil(VW / 80) + 2; i++) {
    const x = Math.round(i * 80 - (px * .18 % 80));
    ctx.beginPath(); ctx.moveTo(x - 25, OY + 214); ctx.lineTo(x + 37, OY + 116 + (i % 3) * 11); ctx.lineTo(x + 116, OY + 214); ctx.fill();
  }
  if (S.levelIndex >= 2) {
    for (let i = 0; i < 32; i++) {
      const x = ((i * 83 - px * .08) % (VW + 10) + VW + 10) % (VW + 10);
      const y = OY + 35 + (i * 47 % 135);
      ctx.fillStyle = i % 4 ? '#d7e9e885' : '#fff2cc'; ctx.fillRect(Math.round(x), y, i % 4 ? 1 : 2, 1);
    }
    const moonX = VW - 62, moonY = OY + 62;
    ctx.fillStyle = '#eae4ce'; ctx.fillRect(moonX, moonY, 17, 17); ctx.fillRect(moonX - 3, moonY + 4, 23, 9);
    ctx.fillStyle = th.sky; ctx.fillRect(moonX - 3, moonY - 2, 13, 14);
  } else {
    ctx.fillStyle = '#fff0bf'; ctx.fillRect(VW - 77, OY + 47, 21, 19); ctx.fillRect(VW - 80, OY + 51, 27, 11);
  }
}
function drawStars() {
  for (const star of S.stars || []) {
    if (star.collected) continue;
    const [x, base] = W2S(star.x, star.y), y = base + (prefs.reducedMotion ? 0 : Math.round(Math.sin(frame / 12 + star.id) * 2));
    if (x < -20 || x > VW + 20) continue;
    ctx.fillStyle = '#18314666'; ctx.fillRect(x - 2, y - 2, 17, 17);
    ctx.fillStyle = '#fff1b5'; ctx.fillRect(x + 5, y, 3, 13); ctx.fillRect(x, y + 5, 13, 3);
    ctx.fillStyle = '#f7b75c'; ctx.fillRect(x + 3, y + 3, 7, 7); ctx.fillStyle = '#fff7da'; ctx.fillRect(x + 5, y + 4, 3, 3);
    ctx.fillStyle = '#b87b40'; ctx.fillRect(x + 5, y + 9, 3, 1);
  }
}
function drawGuides() {
  const P = S.player, lv = game.level;
  // Hand-placed geometry supplies the signs: each gap has an explicit leap/flip cue.
  for (const g of [1, -1]) {
    const row = g > 0 ? 13 : 1, other = g > 0 ? 1 : 13;
    const lo = Math.max(2, Math.floor(camX) - 2), hi = Math.min(lv.flagX, Math.ceil(camX + VW / TILE));
    for (let x = lo; x < hi; x++) {
      if (lv.rows[row][x] !== '#' || lv.rows[row][x + 1] === '#') continue;
      const canFlip = lv.rows[other].slice(Math.max(0, x - 2), x + 10).includes('#');
      const [sx, sy] = W2S(x - 1, g > 0 ? 11 : 3);
      ctx.fillStyle = '#172b3d'; ctx.fillRect(sx - 3, sy - 1, 27, 11);
      text(canFlip ? 'FLIP' : 'LEAP', sx, sy + 2, canFlip ? '#9bf0e6' : '#ffe1a0', 1, false);
      ctx.fillStyle = '#f5cc86'; ctx.fillRect(sx + 10, sy + (g > 0 ? 10 : -14), 2, 14);
      const arrowY = g > 0 ? sy - 6 : sy + 14;
      ctx.fillStyle = canFlip ? '#9bf0e6' : '#ffe1a0'; ctx.fillRect(sx + 10, arrowY, 2, 1); ctx.fillRect(sx + 9, arrowY + g, 4, 1); ctx.fillRect(sx + 7, arrowY + g * 2, 8, 1);
    }
  }
  // Preview the surface straight across from Nib. The world never rotates.
  if (S.mode !== 'playing' || !(P.airFlip || P.ground)) return;
  const cx = P.x + P.w / 2, tx = Math.floor(cx), from = P.g > 0 ? P.y : P.y + P.h;
  let target = null;
  for (let y = Math.floor(from) - P.g; y >= 0 && y < ROWS; y -= P.g) {
    if (game.solidAt(tx, y)) { target = P.g > 0 ? y + 1 : y; break; }
  }
  if (target === null || Math.abs(target - from) < 2) return;
  const [x, y0] = W2S(cx, from), [, y1] = W2S(cx, target);
  ctx.fillStyle = '#d2fff04d';
  for (let y = Math.min(y0, y1) + 6; y < Math.max(y0, y1) - 4; y += 8) ctx.fillRect(x, y, 1, 2);
  ctx.fillStyle = '#b1fff0'; ctx.fillRect(x - 5, y1 - (P.g < 0 ? 2 : 0), 11, 2);
}

function draw() {
  if (active() && !prefs.reducedMotion) frame += visualDT * 60;
  const lv = game.level, VWt = VW / TILE, P = S.player;
  const th = theme(), sky = ctx.createLinearGradient(0, 0, 0, VH); sky.addColorStop(0, th.sky); sky.addColorStop(1, th.low);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, VW, VH);
  if (!P) return;
  const px = Math.round(camX * TILE);
  drawDistantWorld();
  // clouds (parallax)
  for (const c of deco.clouds) { const x = Math.round(c.x * TILE - px * .5), y = OY + Math.round(c.y * TILE); if (x > -80 && x < VW + 20) puff(x, y, c.n, th.cloud, th.far); }
  // hills + bushes (fixed to world like a classic stage)
  for (const h of deco.hills) { const [x, y] = W2S(h.x, h.side === 'f' ? FLOOR_Y : CEIL_Y); if (x < -100 || x > VW + 10) continue; const w = h.big ? 80 : 48, hh = h.big ? 36 : 20; blob(x, y + (h.side === 'f' ? 0 : -1), w, hh, th.hill, th.line, h.side === 'c'); ctx.fillStyle = '#0c4a0c'; const sy = h.side === 'f' ? y - hh + 8 : y + hh - 10; ctx.fillRect(x + w / 2 - 6, sy, 2, 3); ctx.fillRect(x + w / 2 + 4, sy, 2, 3); ctx.fillRect(x + w / 2 - 1, sy + (h.side === 'f' ? 8 : -6), 2, 3); }
  for (const b of deco.bushes) { const [x, y] = W2S(b.x, b.side === 'f' ? FLOOR_Y : CEIL_Y); if (x > -80 && x < VW + 20) puff(x, y + (b.side === 'c' ? 0 : 0), b.n, th.bush, th.line, b.side === 'c'); }
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
  drawGuides();
  drawStars();
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
  if (!(P.invuln > 0 && !prefs.reducedMotion && active() && frame % 6 < 3)) {
    const big = P.power > 0 && P.h > 1 ? 1 : 0, fire = P.power === 2 ? 1 : 0, air = !P.ground;
    let pose = S.mode === 'dying' ? 'dead' : air ? 'jump' : P.skid ? 'skid' : Math.abs(P.vx) > .3 ? (['walk1', 'stand', 'walk2', 'stand'][Math.floor(S.t * (6 + Math.abs(P.vx) * 1.4)) % 4]) : 'stand';
    if (S.mode === 'flag') pose = 'jump';
    const spr = NIB[`${big}${fire}${pose}`], img = spr[(P.facing < 0 ? 'l' : 'r') + (P.g < 0 ? 'v' : '')];
    const sx = Math.round((P.x + P.w / 2) * TILE - px - 8), sy = P.g > 0 ? Math.round(OY + (P.y + P.h) * TILE - img.height) : Math.round(OY + P.y * TILE);
    if (P.invuln > 0) { ctx.strokeStyle = '#fff1b5'; ctx.lineWidth = 1; ctx.strokeRect(sx - 2.5, sy - 2.5, 21, img.height + 5); }
    const squeeze = prefs.reducedMotion ? 0 : squash;
    const sh = Math.round(img.height * (1 - squeeze * .16)), sw = Math.round(16 * (1 + squeeze * .16));
    ctx.drawImage(img, sx - (sw - 16) / 2, sy + (P.g > 0 ? img.height - sh : 0), sw, sh);
    if (!P.ground && P.airFlip && S.mode === 'playing') { ctx.fillStyle = '#7cf0ff'; const gy = P.g > 0 ? sy - 3 : sy + img.height + 1; ctx.fillRect(sx + 7, gy, 2, 2); }
  }
  // particles
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.t += visualDT; p.vy += (p.grav ?? 40) * visualDT; p.x += p.vx * visualDT; p.y += p.vy * visualDT; if (p.t > p.life) { parts.splice(i, 1); continue; } const [x, y] = W2S(p.x, p.y);
    if (p.kind === 'brick') { ctx.fillStyle = K; ctx.fillRect(x - 1, y - 1, 6, 6); ctx.fillStyle = '#c84c0c'; ctx.fillRect(x, y, 4, 4); }
    else if (p.kind === 'coin') ctx.drawImage(coinF[Math.floor(p.t * 20) % 4], x, y);
    else if (p.kind === 'dust') { ctx.fillStyle = '#ffffff'; const s = p.t < .1 ? 3 : 2; ctx.fillRect(x, y, s, s); }
    else if (p.kind === 'spark') { ctx.fillStyle = p.t % .1 < .05 ? '#fff070' : '#ff9a1f'; ctx.fillRect(x, y, 2, 2); } }
  for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.t += visualDT; if (p.t > .8) { pops.splice(i, 1); continue; } const [x, y] = W2S(p.x, p.y); text(p.n, x, y - Math.round(p.t * 24 * p.g), '#fff', 1); }
  hud();
}
function castle(x, y, down) {
  const rows = 5, wd = 5; for (let r = 0; r < rows; r++) for (let c = 0; c < wd; c++) { if (r === rows - 1 && (c === 0 || c === 4) || (r === rows - 1 && c % 2)) {} const yy = down ? y + r * 16 : y - (r + 1) * 16; if (r === rows - 1 && c % 2 === 1) continue; ctx.drawImage(brick, x + c * 16, yy); }
  ctx.fillStyle = K; const dy = down ? y : y - 28; ctx.fillRect(x + 32, dy, 16, 28); ctx.fillStyle = '#ffd040'; ctx.fillRect(x + 37, down ? y + 10 : y - 18, 6, 8); // lit lantern window
}
function drawItem(it) { const [x, y] = W2S(it.x - .05, it.y - .05); if (it.kind === 'cap') ctx.drawImage(it.g > 0 ? glowCap.r : glowCap.rv, x, y); else ctx.drawImage(it.g > 0 ? bloom[Math.floor(frame / 8) % 2] : bloomV[Math.floor(frame / 8) % 2], x, y); }

function hud() {
  const P = S.player, lv = game.level, left = Math.max(9, Math.round(safe.l) + 5), right = VW - Math.max(9, Math.round(safe.r) + 5), top = 5;
  ctx.fillStyle = '#101b30ed'; ctx.fillRect(0, 0, VW, 31);
  const cells = [['SCORE', String(S.score).padStart(6, '0')], ['COINS', String(S.coins).padStart(2, '0')], ['WORLD', String(lv.id) + '/4'], ['TIME', String(Math.ceil(S.time)).padStart(3, '0')], ['LIVES', S.assist ? '--' : String(S.lives)]];
  const step = (right - left) / 5;
  cells.forEach(([label, value], i) => { const x = Math.round(left + i * step); text(label, x, top, '#91afbc', 1, false); text(value, x, top + 9, i === 3 && S.time < 60 ? '#ffb095' : '#fff2cd', 2, false); });
  const progress = Math.max(0, Math.min(1, P.x / lv.flagX));
  ctx.fillStyle = '#31465b'; ctx.fillRect(left, 27, right - left, 2); ctx.fillStyle = '#7ee0d7'; ctx.fillRect(left, 27, Math.round((right - left) * progress), 2);
  for (const [i, c] of lv.checks.entries()) { const x = left + Math.round(c.x / lv.flagX * (right - left)); ctx.fillStyle = i <= S.check ? '#ffe1a0' : '#718799'; ctx.fillRect(x, 26, 2, 4); }
  const y = 35, ok = P.ground || P.airFlip;
  ctx.fillStyle = '#101b30e8'; ctx.fillRect(0, y - 4, VW, 14);
  text(`${P.g > 0 ? 'DOWN' : 'UP'} / ${ok ? 'FLIP READY' : 'LAND TO REFILL'}`, left, y, ok ? '#a1f0e5' : '#e6c2af', 1, false);
  const stars = (S.stars || []).filter(s => s.collected).length;
  text(`STARS ${stars}/3`, Math.round(VW * .52), y, '#ffe1a0', 1, false);
  const lastLabel = S.assist ? 'ASSIST' : `${Math.round(S.levelStats?.elapsed || 0)}S`;
  text(lastLabel, right - textW(lastLabel, 1), y, '#e0ebee', 1, false);
}
const pop = (n, x, y, g = 1) => pops.push({ n: String(n), x, y, t: 0, g });
function burst(kind, x, y, n, sp = 6, life = .9, grav = 40) { if (prefs.reducedMotion) return; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; parts.push({ kind, x, y, vx: Math.cos(a) * sp * (.6 + (i % 3) * .2), vy: Math.sin(a) * sp - 4, t: 0, life, grav }); } }

// ---------- audio ----------
let ac = null, master = null, musicBus = null, effectsBus = null, musicVoice = false;
function audio() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = .5; master.connect(ac.destination); musicBus = ac.createGain(); effectsBus = ac.createGain(); musicBus.connect(master); effectsBus.connect(master); syncAudio(); } catch { ac = null; } } if (ac?.state === 'suspended') ac.resume().catch(() => { }); return ac; }
function tone(f, dur, type = 'square', to = null, vol = .12, delay = 0) {
  if (!(musicVoice ? prefs.music : prefs.effects) || !audio()) return; const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); o.connect(g).connect(musicVoice ? musicBus : effectsBus); o.start(t); o.stop(t + dur + .02);
}
function noise(dur, vol = .15, delay = 0) { if (!(musicVoice ? prefs.music : prefs.effects) || !audio()) return; const b = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length); const s = ac.createBufferSource(), g = ac.createGain(); g.gain.value = vol; s.buffer = b; s.connect(g).connect(effectsBus); s.start(ac.currentTime + delay); }
const SFX = {
  jump: e => tone(e.big ? 220 : 300, .16, 'square', e.big ? 520 : 760, .09), coin: () => { tone(988, .06, 'square', null, .08); tone(1319, .25, 'square', null, .08, .06); },
  stomp: () => { tone(260, .1, 'square', 90, .12); }, bump: () => tone(140, .08, 'triangle', 90, .25), thud: () => tone(110, .06, 'triangle', 70, .2), break: () => { noise(.18, .25); tone(180, .1, 'square', 60, .06); },
  sprout: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .08, 'square', null, .07, i * .06)), grow: () => [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .07, 'square', null, .07, i * .05)),
  shrink: () => [880, 660, 440, 330].forEach((f, i) => tone(f, .08, 'square', null, .08, i * .06)), flip: e => tone(e.g > 0 ? 900 : 260, .18, 'triangle', e.g > 0 ? 260 : 900, .25),
  fire: () => tone(1400, .06, 'square', 300, .06), kick: () => tone(660, .05, 'square', 330, .1), poof: () => noise(.06, .08), oneup: () => [660, 784, 1319, 1047, 1175, 1568].forEach((f, i) => tone(f, .09, 'square', null, .07, i * .08)),
  star: () => [784, 1047, 1319, 1568].forEach((f, i) => tone(f, .12, 'triangle', null, .18, i * .09)),
  flipdenied: () => tone(160, .08, 'triangle', 110, .15),
  lowtime: () => [660, 660, 880].forEach((f, i) => tone(f, .1, 'square', null, .08, i * .16)),
  check: () => { tone(784, .1, 'square', null, .07); tone(1175, .2, 'square', null, .07, .1); },
  die: () => [494, 466, 440, 0, 330, 294, 262].forEach((f, i) => f && tone(f, .14, 'square', null, .09, .3 + i * .14)),
  flagpole: () => tone(220, 1, 'square', 1760, .07), cleared: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, .14, 'square', null, .08, i * .13)),
  won: () => [523, 523, 659, 784, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, .16, 'square', null, .08, i * .14)), gameover: () => [392, 330, 262, 196].forEach((f, i) => tone(f, .25, 'triangle', null, .25, i * .25)),
};
// original looping chiptune (lead + bass), scheduled ahead
const N = n => 440 * 2 ** ((n - 69) / 12);
const LEAD = [[76, 1], [79, 1], [81, 2], [79, 1], [76, 1], [72, 2], [74, 1], [76, 1], [79, 2], [76, 2], [0, 2], [81, 1], [84, 1], [83, 1], [81, 1], [79, 2], [76, 1], [79, 1], [81, 1], [79, 1], [76, 1], [74, 1], [72, 4], [0, 2], [72, 1], [74, 1], [76, 2], [72, 1], [69, 1], [67, 2], [69, 1], [72, 1], [74, 2], [76, 2], [0, 2], [79, 1], [81, 1], [79, 1], [76, 1], [74, 2], [72, 1], [74, 1], [76, 1], [74, 1], [71, 1], [74, 1], [72, 4], [0, 2]];
const BASS = [48, 55, 57, 53, 48, 55, 53, 55];
let leadI = 0, bassI = 0, nextLead = 0, nextBass = 0, musicOn = false;
function musicTick() {
  if (!prefs.music || !ac || S.mode !== 'playing') { musicOn = false; return; }
  musicVoice = true;
  const e8 = S.levelIndex === 3 ? .135 : .15, now = ac.currentTime; if (!musicOn) { musicOn = true; nextLead = nextBass = now + .05; }
  while (nextLead < now + .3) { const [n, l] = LEAD[leadI++ % LEAD.length]; if (n) tone(N(n), e8 * l * .9, 'square', null, .035, nextLead - now); nextLead += e8 * l; }
  while (nextBass < now + .3) { const n = BASS[Math.floor(bassI / 4) % BASS.length]; tone(N(bassI % 2 ? n + 7 : n), e8 * 1.8, 'triangle', null, .12, nextBass - now); bassI++; nextBass += e8 * 2; }
  musicVoice = false;
}
function syncAudio() {
  if (musicBus) musicBus.gain.value = prefs.music && S.mode === 'playing' ? 1 : 0;
  if (effectsBus) effectsBus.gain.value = prefs.effects ? 1 : 0;
}
function begin(id, options = {}) {
  ui?.hidePanel(); ui?.resetInput(); parts.length = pops.length = 0; trailT = squash = 0;
  game.start(id, options); buildDeco(); camX = 0; acc = 0; last = performance.now(); ended = false;
  hintsSeen.clear(); ui?.showHint(id === 1 ? (matchMedia('(pointer: coarse)').matches ? 'Use the left pad to move. Hold JUMP to leap higher.' : 'Move with arrows or A/D. Hold jump to leap higher.') : game.level.hint);
}
function nextWorld() {
  if (!game.next()) return;
  ui?.hidePanel(); ui?.resetInput(); buildDeco(); camX = 0; acc = 0;
  parts.length = pops.length = 0; ended = false; hintsSeen.clear(); ui?.showHint(game.level.hint);
}
const hintsSeen = new Set();
function contextualHints() {
  if (S.mode !== 'playing') return;
  const P = S.player, candidates = [];
  if (S.levelIndex === 0) {
    if (P.x > 8 && P.x < 17) candidates.push(['blocks', 'Jump into glowing blocks from below. Hold jump for extra height.']);
    if (P.x > 18 && P.x < 28) candidates.push(['stomp', 'Land on a Grumblebug to bounce. Hold jump for a higher stomp.']);
    if (P.x > 88 && P.x < 102) candidates.push(['flip', 'The path continues above! C / Down or FLIP changes gravity.']);
  }
  if (!P.airFlip && !P.ground) candidates.push(['refill', 'Air flip spent. Landing or stomping refills your flip.']);
  const chosen = candidates.find(([id]) => !hintsSeen.has(id));
  if (chosen) { hintsSeen.add(chosen[0]); ui?.showHint(chosen[1]); }
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
    else if (e.type === 'respawn') { buildDeco(); camX = Math.max(0, P.x - VW / TILE * .35); ui?.resetInput(); ui?.showHint('Lantern relit. Your checkpoint is safe.'); }
    else if (e.type === 'land') { squash = 1; burst('dust', P.x + .3, P.g > 0 ? P.y + P.h : P.y, 5, 1.5, .2, 0); }
    else if (e.type === 'check') { pop('SAVED', P.x, P.y - P.g, P.g); ui?.announce('Checkpoint lit'); ui?.showHint('Checkpoint lit! Your coins, stars and power are saved.'); }
    else if (e.type === 'star') { burst('spark', e.x ?? P.x, e.y ?? P.y, 14, 4, .7, 0); pop('STAR!', P.x, P.y - P.g, P.g); ui?.announce('Lantern star collected'); }
    else if (e.type === 'flipdenied') ui?.showHint('Land or stomp to recharge your air flip.');
    else if (e.type === 'lowtime') ui?.showHint('Time is running low. Head for the lantern flag!');
  }
  S.events.length = 0;
}
let ended = false;
function loop(now) {
  const dt = Math.max(0, Math.min(.1, (now - last) / 1000)); last = now;
  ui.update(dt); visualDT = active() ? dt : 0;
  squash = Math.max(0, squash - visualDT * 7);
  if (['playing', 'dying', 'flag'].includes(S.mode)) { acc += dt; const inp = ui.input(); let n = 0; while (acc >= 1 / 60 && n++ < 6) { game.step(1 / 60, n === 1 ? inp : ui.input()); ui.clearLatch(); acc -= 1 / 60; } if (acc > .1) acc = 0; ended = false; }
  handleEvents();
  if (!ended && ['cleared', 'won', 'lost'].includes(S.mode)) { ended = true; ui.onEnd(); }
  const P = S.player;
  if (P && active()) { const VWt = VW / TILE, target = Math.max(0, Math.min(game.level.w - VWt, P.x + P.w / 2 - VWt * .4 + P.facing * 1.5 + P.vx * .15)); camX += (target - camX) * Math.min(1, dt * 5); camX = Math.max(0, Math.min(game.level.w - VWt, camX)); }
  if (deco) draw(); else { ctx.fillStyle = '#5c94fc'; ctx.fillRect(0, 0, VW, VH); }
  contextualHints();
  if (active() && !prefs.reducedMotion && P && !P.ground && Math.abs(P.vy) > 3) {
    trailT += dt; if (trailT > .055) { trailT = 0; parts.push({kind:'spark', x:P.x + .35, y:P.y + P.h / 2, vx:0, vy:0, grav:0, t:0, life:.22}); }
  }
  syncAudio();
  musicTick();
  requestAnimationFrame(loop);
}
resize();
// attract mode: show level 1 behind the title
game.start(1); S.mode = 'title'; buildDeco(); S.events.length = 0;
ui = createUI({ game, begin, next: nextWorld, titlePreview: () => { S.mode = 'title'; },
  onSettings: settings => { prefs = settings; syncAudio(); }, onAction: audio });
ui.showTitle();
if (new URLSearchParams(location.search).has('debug')) window.__upside = { game, begin, ui, get camX() { return camX; } };
$('loading').remove(); document.body.dataset.ready = 'true';
requestAnimationFrame(t => { last = t; loop(t); });
