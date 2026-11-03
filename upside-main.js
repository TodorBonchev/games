import * as THREE from 'three';
import { createUpside, LEVELS, H, PLAYER, moverBox, enemyPos } from './upside-game.js?v1';

const $ = id => document.getElementById(id);
const stage = $('stage'), hud = { score: $('score'), coins: $('coins'), lives: $('lives'), level: $('levelName'), time: $('time'), best: $('best') };
const UNLOCK_KEY = 'games:progress:upside';
let storage = null; try { storage = window.localStorage; storage.getItem('x'); } catch { storage = null; }
const game = createUpside({ storage });
const unlocked = () => { try { return Math.max(1, Math.min(LEVELS.length, +storage?.getItem(UNLOCK_KEY) || 1)); } catch { return 1; } };
const unlock = n => { try { if (n > unlocked()) storage?.setItem(UNLOCK_KEY, String(n)); } catch { } };

// ---------- renderer ----------
const lowPower = matchMedia('(pointer: coarse)').matches;
const renderer = new THREE.WebGLRenderer({ antialias: !lowPower, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, lowPower ? 1.5 : 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, .1, 400);
{ // gradient sky
  const c = document.createElement('canvas'); c.width = 2; c.height = 256; const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#2b1b5e'); g.addColorStop(.45, '#ff9e7a'); g.addColorStop(.55, '#ffd59a'); g.addColorStop(1, '#3a8f9e');
  x.fillStyle = g; x.fillRect(0, 0, 2, 256); const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; scene.background = tex;
}
scene.fog = new THREE.Fog(0xffc9a0, 30, 110);
scene.add(new THREE.HemisphereLight(0xfff1d6, 0x5a3d8a, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(6, 14, 4); sun.castShadow = true;
sun.shadow.mapSize.set(lowPower ? 1024 : 2048, lowPower ? 1024 : 2048); Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 50 });
scene.add(sun, sun.target);
const under = new THREE.DirectionalLight(0xb48cff, 1.1); under.position.set(-4, -10, 3); scene.add(under);

// stars / floating motes for depth
{
  const n = 600, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - .5) * 120; pos[i * 3 + 1] = H / 2 + (Math.random() - .5) * 80; pos[i * 3 + 2] = -Math.random() * 160 + 20; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xfff4c0, size: .25, transparent: true, opacity: .7 })));
}

const mat = {
  moss: new THREE.MeshStandardMaterial({ color: 0x6fd38a, roughness: .8 }),
  soil: new THREE.MeshStandardMaterial({ color: 0x8a5a3c, roughness: .9 }),
  crystal: new THREE.MeshStandardMaterial({ color: 0xb59cff, roughness: .35, metalness: .1, emissive: 0x3a1f80, emissiveIntensity: .35 }),
  crystalDark: new THREE.MeshStandardMaterial({ color: 0x4b3592, roughness: .6 }),
  spike: new THREE.MeshStandardMaterial({ color: 0xff4f6d, roughness: .4, emissive: 0x5a0010, emissiveIntensity: .4 }),
  coin: new THREE.MeshStandardMaterial({ color: 0xffd34d, metalness: .6, roughness: .25, emissive: 0x8a5a00, emissiveIntensity: .6 }),
  petal: new THREE.MeshStandardMaterial({ color: 0xff8fc8, roughness: .5, emissive: 0x6a1040, emissiveIntensity: .25 }),
  bug: new THREE.MeshStandardMaterial({ color: 0x3fb6ff, roughness: .5 }),
  bugC: new THREE.MeshStandardMaterial({ color: 0xffa23d, roughness: .5 }),
  white: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .3 }),
  black: new THREE.MeshBasicMaterial({ color: 0x111122 }),
  glow: new THREE.MeshBasicMaterial({ color: 0xfff1a8 }),
};

// ---------- player: Nib, a little paper-lantern sprite ----------
const nib = new THREE.Group(), nibBody = new THREE.Group(); nib.add(nibBody);
{
  const body = new THREE.Mesh(new THREE.SphereGeometry(.5, 24, 18), new THREE.MeshStandardMaterial({ color: 0xff7a3d, emissive: 0xff5a10, emissiveIntensity: .5, roughness: .55 }));
  body.scale.set(1, 1.15, 1); body.castShadow = true; nibBody.add(body);
  for (const y of [-.2, 0, .2]) { const r = new THREE.Mesh(new THREE.TorusGeometry(.5 * Math.cos(y * 1.6) + .01, .025, 6, 28), mat.soil); r.rotation.x = Math.PI / 2; r.position.y = y * 1.15; nibBody.add(r); }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(.2, .28, .14, 16), mat.crystalDark); cap.position.y = .62; nibBody.add(cap);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .35), mat.moss); stem.position.y = .82; nibBody.add(stem);
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(.16, 12, 8), mat.moss); leaf.scale.set(1.6, .35, .8); leaf.position.set(.16, 1, 0); leaf.rotation.z = .5; nibBody.add(leaf);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.11, 12, 10), mat.white); eye.position.set(s * .18, .12, .44); nibBody.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(.06, 10, 8), mat.black); pupil.position.set(s * .18, .12, .54); nibBody.add(pupil);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(.14, 10, 8), mat.crystalDark); foot.scale.set(1, .6, 1.3); foot.position.set(s * .2, -.6, .05); foot.castShadow = true; nibBody.add(foot);
  }
  const light = new THREE.PointLight(0xffa860, 6, 7, 1.6); light.position.y = .1; nibBody.add(light);
}
scene.add(nib);

// ---------- level building ----------
let world = new THREE.Group(); scene.add(world);
let enemyMeshes = [], coinMeshes = [], moverMeshes = [], goalMesh = null, checkMeshes = [];
const coinGeo = new THREE.TorusGeometry(.32, .1, 10, 24), coinCore = new THREE.OctahedronGeometry(.16);
function makeBug(side) {
  const g = new THREE.Group(), b = new THREE.Mesh(new THREE.SphereGeometry(.45, 18, 14), side === 'f' ? mat.bug : mat.bugC); b.scale.set(1.1, .85, 1); b.castShadow = true; g.add(b);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(.12, 10, 8), mat.white); e.position.set(s * .17, .15, .38); g.add(e);
    const p = new THREE.Mesh(new THREE.SphereGeometry(.06, 8, 6), mat.black); p.position.set(s * .17, .13, .48); g.add(p);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(.18, .04, .04), mat.black); brow.position.set(s * .17, .3, .44); brow.rotation.z = -s * .4; g.add(brow);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(.07, .25, 8), mat.crystalDark); horn.position.set(s * .2, .42, 0); g.add(horn);
  }
  if (side === 'c') g.rotation.z = Math.PI;
  return g;
}
function build(lvl) {
  scene.remove(world); world.traverse(o => { if (o.geometry && o.geometry !== coinGeo && o.geometry !== coinCore) o.geometry.dispose(); });
  world = new THREE.Group(); scene.add(world); enemyMeshes = []; coinMeshes = []; moverMeshes = []; checkMeshes = [];
  for (const s of lvl.solids) {
    const thick = s.h >= 1 && (s.side === 'f' ? s.y < 0 : s.y > H);
    const m = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, s.d), s.side === 'f' ? mat.soil : mat.crystalDark);
    m.position.set(s.x, s.y, s.z); m.receiveShadow = m.castShadow = true; world.add(m);
    const top = new THREE.Mesh(new THREE.BoxGeometry(s.w + .1, .22, s.d + .1), s.side === 'f' ? mat.moss : mat.crystal);
    top.position.set(s.x, s.side === 'f' ? s.y + s.h / 2 - .08 : s.y - s.h / 2 + .08, s.z); top.receiveShadow = true; world.add(top);
    if (thick) for (let i = 0; i < s.d / 3; i++) { // decorative tufts / crystals
      const z = s.z - s.d / 2 + Math.random() * s.d, x = s.x + (Math.random() > .5 ? 1 : -1) * (s.w / 2 - .25);
      const d = s.side === 'f' ? new THREE.Mesh(new THREE.ConeGeometry(.15, .5, 5), mat.moss) : new THREE.Mesh(new THREE.OctahedronGeometry(.28), mat.crystal);
      d.position.set(x, s.side === 'f' ? .2 : H - .2, z); if (s.side === 'c') d.scale.y = 1.8; world.add(d);
    }
  }
  for (const s of lvl.spikes) {
    const n = Math.max(1, Math.round(s.w / .6)), rows = Math.max(1, Math.round(s.d / .6)), geo = new THREE.ConeGeometry(.24, .6, 6);
    const inst = new THREE.InstancedMesh(geo, mat.spike, n * rows), m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), s.side === 'c' ? Math.PI : 0);
    let k = 0; for (let i = 0; i < n; i++) for (let j = 0; j < rows; j++) inst.setMatrixAt(k++, m4.compose(new THREE.Vector3(s.x - s.w / 2 + (i + .5) * s.w / n, s.y, s.z - s.d / 2 + (j + .5) * s.d / rows), q, new THREE.Vector3(1, 1, 1)));
    inst.castShadow = true; world.add(inst);
  }
  for (const m of lvl.movers) { const g = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, .6, 24), mat.petal); g.scale.set(m.w / 2, 1, m.len / 2); g.castShadow = g.receiveShadow = true; world.add(g); moverMeshes.push(g); }
  for (const e of lvl.enemies) { const g = makeBug(e.side); world.add(g); enemyMeshes.push(g); }
  for (const c of lvl.coins) { const g = new THREE.Group(), r = new THREE.Mesh(coinGeo, mat.coin), o = new THREE.Mesh(coinCore, mat.glow); g.add(r, o); g.position.set(c.x, c.y, c.z); world.add(g); coinMeshes.push(g); }
  for (const cp of lvl.checkpoints) {
    const g = new THREE.Group(), pole = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 2), mat.white); pole.position.y = 1; g.add(pole);
    const flag = new THREE.Mesh(new THREE.ConeGeometry(.35, .8, 3), new THREE.MeshStandardMaterial({ color: 0x777777, emissive: 0, roughness: .5 })); flag.rotation.z = -Math.PI / 2; flag.position.set(.4, 1.7, 0); g.add(flag);
    g.position.set(2.4, cp.side === 'f' ? 0 : H, -cp.d); if (cp.side === 'c') g.rotation.z = Math.PI; world.add(g); checkMeshes.push({ g, flag, d: cp.d });
  }
  const g = lvl.goal, arch = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, .22, 14, 40), new THREE.MeshStandardMaterial({ color: 0x7affd9, emissive: 0x22ffaa, emissiveIntensity: 1.2 }));
  ring.position.y = 1.7; arch.add(ring);
  const core = new THREE.Mesh(new THREE.CircleGeometry(1.3, 32), new THREE.MeshBasicMaterial({ color: 0xc8fff0, transparent: true, opacity: .35, side: THREE.DoubleSide })); core.position.y = 1.7; arch.add(core);
  const gl = new THREE.PointLight(0x55ffcc, 10, 10); gl.position.y = 1.7; arch.add(gl);
  arch.position.set(0, g.side === 'f' ? 0 : H, -g.d); if (g.side === 'c') arch.rotation.z = Math.PI; world.add(arch); goalMesh = arch;
}

// ---------- particles ----------
const P = 260, pGeo = new THREE.BufferGeometry(), pPos = new Float32Array(P * 3), pCol = new Float32Array(P * 3), pv = [];
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const parts = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: .22, vertexColors: true, transparent: true, depthWrite: false })); parts.frustumCulled = false; scene.add(parts);
for (let i = 0; i < P; i++) { pv.push({ life: 0, vx: 0, vy: 0, vz: 0 }); pPos[i * 3 + 1] = -999; }
let pNext = 0; const tmpC = new THREE.Color();
function burst(x, y, z, color, n = 14, speed = 4, gy = 0) {
  tmpC.set(color);
  for (let k = 0; k < n; k++) {
    const i = pNext = (pNext + 1) % P, a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2, s = speed * (.4 + Math.random() * .6);
    Object.assign(pv[i], { life: .5 + Math.random() * .4, vx: Math.cos(a) * Math.cos(b) * s, vy: Math.sin(b) * s + gy, vz: Math.sin(a) * Math.cos(b) * s });
    pPos.set([x, y, z], i * 3); pCol.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
  }
}
function stepParticles(dt) {
  for (let i = 0; i < P; i++) { const v = pv[i]; if (v.life <= 0) continue; v.life -= dt; v.vx *= .96; v.vy *= .96; v.vz *= .96; pPos[i * 3] += v.vx * dt; pPos[i * 3 + 1] += v.vy * dt; pPos[i * 3 + 2] += v.vz * dt; if (v.life <= 0) pPos[i * 3 + 1] = -999; }
  pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
}

// ---------- audio ----------
let ac = null, muted = false; try { muted = storage?.getItem('games:pref:upside:muted') === '1'; } catch { }
function audio() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { } } if (ac?.state === 'suspended') ac.resume(); return ac; }
function tone(f0, f1, dur, type = 'square', vol = .12, delay = 0) {
  if (muted) return; const a = audio(); if (!a) return; const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + .02);
}
const sfx = {
  jump: () => tone(320, 640, .14, 'square', .07),
  flip: () => { tone(900, 200, .22, 'sawtooth', .06); tone(200, 900, .22, 'triangle', .08); },
  coin: () => { tone(988, 988, .06, 'square', .06); tone(1319, 1319, .18, 'square', .06, .06); },
  stomp: () => { tone(500, 90, .16, 'triangle', .2); tone(120, 60, .12, 'square', .08); },
  hurt: () => tone(400, 60, .45, 'sawtooth', .12),
  land: () => tone(140, 70, .06, 'triangle', .08),
  bonk: () => tone(180, 120, .08, 'square', .06),
  check: () => [523, 659, 784].forEach((f, i) => tone(f, f, .12, 'triangle', .1, i * .08)),
  goal: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, f, .16, 'square', .07, i * .1)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, f * .97, .25, 'triangle', .12, i * .2)),
  life: () => [660, 880, 1100, 1320].forEach((f, i) => tone(f, f, .1, 'square', .06, i * .06)),
};

// ---------- input ----------
const keys = new Set(); const input = { x: 0, z: 0, jump: false, flip: false };
const joy = { id: null, x: 0, y: 0, ox: 0, oy: 0 }, touchBtn = { jump: false, flip: false };
addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return; keys.add(e.code); audio();
  if (e.code === 'Escape' || e.code === 'KeyP') { game.state.mode === 'playing' ? doPause() : game.state.mode === 'paused' && doResume(); }
  if (e.code === 'Enter') overlay.querySelector('[data-primary]')?.click();
  if (e.code === 'KeyM') toggleMute();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); doPause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) doPause(); });
const joyEl = $('joystick'), knob = $('knob');
function joyMove(t) { const dx = t.clientX - joy.ox, dy = t.clientY - joy.oy, r = 50, l = Math.hypot(dx, dy), k = l > r ? r / l : 1; joy.x = dx * k / r; joy.y = dy * k / r; knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`; }
$('touchZone').addEventListener('touchstart', e => {
  e.preventDefault(); audio(); for (const t of e.changedTouches) if (joy.id === null) { joy.id = t.identifier; joy.ox = t.clientX; joy.oy = t.clientY; joyEl.style.left = t.clientX + 'px'; joyEl.style.top = t.clientY + 'px'; joyEl.classList.add('on'); joyMove(t); }
}, { passive: false });
addEventListener('touchmove', e => { for (const t of e.changedTouches) if (t.identifier === joy.id) { e.preventDefault(); joyMove(t); } }, { passive: false });
const joyEnd = e => { for (const t of e.changedTouches) if (t.identifier === joy.id) { joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; joyEl.classList.remove('on'); } };
addEventListener('touchend', joyEnd); addEventListener('touchcancel', joyEnd);
for (const [id, k] of [['jumpBtn', 'jump'], ['flipBtn', 'flip']]) {
  const b = $(id);
  b.addEventListener('pointerdown', e => { e.preventDefault(); audio(); touchBtn[k] = true; b.classList.add('down'); b.setPointerCapture?.(e.pointerId); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => { touchBtn[k] = false; b.classList.remove('down'); });
}
function readInput() {
  let x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + joy.x;
  let z = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + joy.y;
  // when the world is upside down the camera rolls, so screen-right is world -x
  if (Math.cos(roll) < 0) x = -x;
  input.x = Math.max(-1, Math.min(1, x)); input.z = Math.max(-1, Math.min(1, z));
  input.jump = keys.has('Space') || keys.has('KeyJ') || keys.has('KeyZ') || touchBtn.jump;
  input.flip = keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('KeyK') || keys.has('KeyX') || keys.has('KeyF') || touchBtn.flip;
  return input;
}

// ---------- UI ----------
const overlay = $('overlay'), panel = $('panel');
function fmt(n) { return String(n).padStart(6, '0'); }
function show(html) { panel.innerHTML = html; overlay.hidden = false; panel.querySelector('[data-primary]')?.focus({ preventScroll: true }); }
function hide() { overlay.hidden = true; }
const bestLine = () => game.state.best ? `<p class="best">BEST ${fmt(game.state.best.score)}${game.state.best.won ? ' · ★ CLEARED' : ` · LEVEL ${game.state.best.level}`}</p>` : '';
function title() {
  const u = unlocked();
  show(`<p class="kicker">A GRAVITY-FLIPPING PLATFORMER</p><h1>Upside <span>Nib</span></h1>
  <p>Nib the lantern sprite can flip gravity at will. Run, jump, stomp Grumblebugs, gather glimmers, and reach the glowing gate — on the floor <em>or</em> the ceiling.</p>
  ${bestLine()}<div class="levels">${LEVELS.map(l => `<button data-level="${l.id}" ${l.id > u ? 'disabled' : ''}>${String(l.id).padStart(2, '0')}<small>${l.id > u ? 'LOCKED' : l.name}</small></button>`).join('')}</div>
  <button class="primary" data-primary data-level="1">▶ PLAY</button>
  <p class="keys"><b>Keyboard</b> WASD / arrows move · Space jump (hold = higher) · Shift / K flip gravity · P pause · M mute<br><b>Touch</b> left thumb joystick · JUMP and FLIP buttons on the right</p>`);
  panel.querySelectorAll('[data-level]').forEach(b => b.onclick = () => begin(+b.dataset.level));
}
function begin(n) { game.start(n); build(game.level); flash(`${String(n).padStart(2, '0')} · ${game.level.name}`, game.level.hint); hide(); snapCamera(); }
function doPause() { if (!game.pause()) return; show(`<h2>Paused</h2>${bestLine()}<button class="primary" data-primary data-action="resume">▶ RESUME</button><button data-action="restart">↺ RESTART LEVEL</button><button data-action="mute">${muted ? '🔇 SOUND OFF' : '🔊 SOUND ON'}</button><button data-action="menu">☰ MENU</button>`); wire(); }
function doResume() { if (game.resume()) { hide(); last = performance.now(); } }
function toggleMute() { muted = !muted; try { storage?.setItem('games:pref:upside:muted', muted ? '1' : '0'); } catch { } $('muteBtn').textContent = muted ? '🔇' : '🔊'; }
function wire() {
  panel.querySelectorAll('[data-action]').forEach(b => b.onclick = () => {
    const a = b.dataset.action, lives = game.state.lives, score = game.state.score;
    if (a === 'resume') doResume(); if (a === 'menu') title(); if (a === 'mute') { toggleMute(); b.textContent = muted ? '🔇 SOUND OFF' : '🔊 SOUND ON'; }
    if (a === 'restart') { game.start(game.state.levelIndex + 1); build(game.level); hide(); snapCamera(); }
    if (a === 'next') { game.next(); build(game.level); flash(`${String(game.level.id).padStart(2, '0')} · ${game.level.name}`, game.level.hint); hide(); snapCamera(); }
    if (a === 'retry') begin(game.state.levelIndex + 1);
    void lives; void score;
  });
}
let flashTimer; function flash(a, b) { const f = $('flash'); f.innerHTML = `<strong>${a}</strong><span>${b}</span>`; f.classList.add('on'); clearTimeout(flashTimer); flashTimer = setTimeout(() => f.classList.remove('on'), 3200); }
function onModeChange(mode) {
  const s = game.state;
  if (mode === 'cleared') { unlock(s.levelIndex + 2); show(`<p class="kicker">LEVEL ${s.levelIndex + 1} CLEAR</p><h2>${game.level.name}</h2><p class="big">${fmt(s.score)}</p><p>Time bonus + glimmers: <b>+${s.lastBonus}</b> · ${s.coinTaken.size}/${game.level.coins.length} glimmers · ${s.stomps} stomps</p><button class="primary" data-primary data-action="next">NEXT LEVEL →</button><button data-action="menu">☰ MENU</button>`); wire(); }
  if (mode === 'won') show(`<p class="kicker">ALL FOUR WORLDS LIT</p><h2>Nib made it home!</h2><p class="big">${fmt(s.score)}</p>${s.newBest ? '<p class="best">★ NEW BEST SCORE ★</p>' : bestLine()}<button class="primary" data-primary data-action="menu">PLAY AGAIN</button>`), wire();
  if (mode === 'lost') show(`<p class="kicker">OUT OF LANTERNS</p><h2>Game over</h2><p class="big">${fmt(s.score)}</p>${s.newBest ? '<p class="best">★ NEW BEST SCORE ★</p>' : bestLine()}<button class="primary" data-primary data-action="retry">↺ TRY LEVEL ${s.levelIndex + 1} AGAIN</button><button data-action="menu">☰ MENU</button>`), wire();
}
$('pauseBtn').onclick = () => game.state.mode === 'playing' ? doPause() : doResume();
$('muteBtn').onclick = toggleMute; $('muteBtn').textContent = muted ? '🔇' : '🔊';

// ---------- loop ----------
let roll = 0, shake = 0, last = performance.now(), acc = 0, lastMode = 'title', squash = 1, renderCount = 0;
const camPos = new THREE.Vector3(0, 4, 8), camLook = new THREE.Vector3();
function snapCamera() { const p = game.state.player; roll = p.flipped ? Math.PI : 0; camPos.set(0, p.y + (p.flipped ? -3.6 : 3.6), p.z + 8); camLook.set(p.x, p.y, p.z - 4); }
function handleEvents() {
  for (const e of game.state.events.splice(0)) {
    const p = game.state.player;
    if (e.type === 'jump') { sfx.jump(); squash = 1.35; burst(p.x, p.y + (p.flipped ? .6 : -.6), p.z, 0xffffff, 6, 2); }
    if (e.type === 'flip') { sfx.flip(); burst(p.x, p.y, p.z, 0xb59cff, 22, 5); shake = .15; }
    if (e.type === 'land') { sfx.land(); squash = .65; burst(p.x, p.y + (p.flipped ? .6 : -.6), p.z, p.flipped ? 0xd5c4ff : 0xa8f0b0, 8, 2.5); }
    if (e.type === 'coin') { sfx.coin(); burst(e.x, e.y, e.z, 0xffd34d, 12, 3.5); }
    if (e.type === 'stomp') { sfx.stomp(); burst(e.x, e.y, e.z, 0x3fb6ff, 26, 6); shake = .25; squash = 1.4; }
    if (e.type === 'hurt') { sfx.hurt(); shake = .5; burst(p.x, p.y, p.z, 0xff4f6d, 30, 6); $('stage').classList.add('hit'); setTimeout(() => $('stage').classList.remove('hit'), 300); }
    if (e.type === 'bonk') sfx.bonk();
    if (e.type === 'checkpoint') { sfx.check(); const c = checkMeshes.find(c => c.d === e.d); if (c) { c.flag.material.color.set(0x7affd9); c.flag.material.emissive.set(0x22aa88); } flash('CHECKPOINT', 'Lantern lit — you will respawn here.'); }
    if (e.type === 'goal') { sfx.goal(); burst(p.x, p.y, p.z, 0x7affd9, 60, 8); }
    if (e.type === 'lost') sfx.lose();
    if (e.type === 'life') { sfx.life(); flash('+1 LANTERN', '50 glimmers collected!'); }
  }
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  const s = game.state;
  if (s.mode === 'playing') { acc += dt; readInput(); while (acc >= 1 / 120) { game.step(1 / 120, input); acc -= 1 / 120; } } else acc = 0;
  handleEvents();
  if (s.mode !== lastMode) { lastMode = s.mode; onModeChange(s.mode); }
  stepParticles(dt);
  if (s.player && game.level) {
    const p = s.player, t = s.t;
    // nib
    nib.position.set(p.x, p.y - (p.flipped ? -1 : 1) * (PLAYER.h / 2 - .55), p.z);
    const targetRoll = p.flipped ? Math.PI : 0; nib.rotation.z += (targetRoll - nib.rotation.z) * Math.min(1, dt * 14);
    let dy = p.facing - nibBody.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); nibBody.rotation.y += dy * Math.min(1, dt * 12);
    squash += (1 - squash) * Math.min(1, dt * 10); const run = Math.hypot(p.vx, p.vz) > .5 && p.grounded ? Math.sin(t * 22) * .06 : 0;
    nibBody.scale.set(1 / Math.sqrt(squash), squash + run, 1 / Math.sqrt(squash));
    nib.visible = p.invuln <= 0 || Math.floor(t * 16) % 2 === 0;
    // dynamic entities
    game.level.enemies.forEach((e, i) => { const m = enemyMeshes[i]; if (s.dead.has(i)) { m.scale.y = Math.max(.01, m.scale.y - dt * 5); if (m.scale.y < .05) m.visible = false; return; } const q = enemyPos(e, t); m.position.set(q.x, q.y, q.z); m.rotation.y = Math.cos(t * e.speed / Math.max(e.range, .5)) > 0 ? Math.PI : 0; m.children[0].scale.y = .85 + Math.sin(t * 10 + i) * .06; });
    game.level.movers.forEach((m, i) => { const b = moverBox(m, t); moverMeshes[i].position.set(b.x, b.y, b.z); });
    coinMeshes.forEach((c, i) => { c.visible = !s.coinTaken.has(i); c.rotation.y = t * 3 + i * .3; });
    if (goalMesh) goalMesh.children[0].rotation.z = t;
    // camera follows, rolling with gravity
    roll += (targetRoll - roll) * Math.min(1, dt * 5);
    const up = new THREE.Vector3(-Math.sin(roll), Math.cos(roll), 0), want = new THREE.Vector3(p.x * .6, p.y, p.z).addScaledVector(up, 3.6).add(new THREE.Vector3(0, 0, 8));
    camPos.lerp(want, Math.min(1, dt * 6)); camLook.lerp(new THREE.Vector3(p.x * .8, p.y + up.y * .5, p.z - 5), Math.min(1, dt * 8));
    camera.position.copy(camPos); if (shake > 0) { camera.position.x += (Math.random() - .5) * shake; camera.position.y += (Math.random() - .5) * shake; shake = Math.max(0, shake - dt * 1.6); }
    camera.up.copy(up); camera.lookAt(camLook);
    sun.position.set(p.x + 6, H / 2 + (p.flipped ? -10 : 14), p.z + 4); sun.target.position.set(p.x, p.flipped ? H : 0, p.z);
    // HUD
    hud.score.textContent = fmt(s.score); hud.coins.textContent = s.coins; hud.lives.textContent = '◆'.repeat(Math.max(0, Math.min(s.lives, 6))) + (s.lives > 6 ? `+${s.lives - 6}` : '');
    hud.level.textContent = `${String(game.level.id).padStart(2, '0')} ${game.level.name}`; hud.time.textContent = Math.max(0, Math.ceil(game.level.time - s.time));
    hud.best.textContent = s.best ? fmt(s.best.score) : '------';
    $('progress').style.width = `${Math.min(100, Math.max(0, -p.z / game.level.goal.d * 100))}%`;
    $('flipBtn').classList.toggle('spent', !p.grounded && p.coyote <= 0 && !p.airFlip);
  } else { camera.position.set(Math.sin(now / 4000) * 6, 5, 10); camera.up.set(0, 1, 0); camera.lookAt(0, 3, -10); }
  renderer.render(scene, camera); renderCount++;
}
function resize() { const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 1 ? 75 : 60; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); new ResizeObserver(resize).observe(stage); resize();
build(LEVELS[0]); title(); requestAnimationFrame(frame);
document.body.dataset.ready = 'true'; $('loading')?.remove();
if (new URLSearchParams(location.search).has('debug')) window.__upside = { game, begin, get renderCount() { return renderCount; }, input: touchBtn };
