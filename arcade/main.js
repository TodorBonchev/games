import * as THREE from 'three';
import { arcadeGames, arcadeById } from './catalog.js';
import { readArcadeSave, writeArcadeSave, readArcadeRecord, addArcadeWin } from './storage.js';

const $ = id => document.getElementById(id);
const query = new URLSearchParams(location.search);
const definition = arcadeById.get(query.get('game'));
const touch = matchMedia('(pointer: coarse)').matches;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let renderer, scene, camera, root, game, seed = 0, mode = 'intro', panelKind = '';
let pointer = null, pointerX = 0, pointerZ = 0, keyboardHeld = false, cursorX = 0, cursorZ = 0;
let contextLost = false, dirty = true, realtime = true, renderCount = 0, lastFrame = 0, lastRender = 0, lastSave = 0;
let savedAvailable = true, storageAvailable = true, audio, voices = 0, soundEnabled = false;
let priorContextMode = 'intro';
let stageReleaseDispatch = false, suppressPointer = null, suppressClickUntil = 0;
const cursor = new THREE.Mesh(new THREE.TorusGeometry(.24, .025, 5, 20), new THREE.MeshBasicMaterial({ color: '#fff8d7', depthTest: false }));
cursor.rotation.x = -Math.PI / 2; cursor.position.y = .35; cursor.renderOrder = 999; cursor.visible = false;
const raycaster = new THREE.Raycaster(), mouse = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const action = (name, label, primary = false, disabled = false) => `<button data-action="${name}" class="${primary ? 'primary' : 'secondary'}"${disabled ? ' disabled' : ''}>${label}</button>`;
try { soundEnabled = localStorage.getItem('games:arcade:sound') === '1'; } catch { /* sound remains off */ }

function soundUI() {
  $('soundButton').setAttribute('aria-pressed', String(soundEnabled));
  $('soundButton').setAttribute('aria-label', soundEnabled ? 'Turn sound off' : 'Turn sound on');
  $('soundButton').textContent = soundEnabled ? '♫' : '♪';
}
function unlockAudio() {
  if (!soundEnabled) return;
  try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume().catch(() => {}); } catch { /* optional */ }
}
function sound(frequency, duration = .2) {
  if (!soundEnabled || !audio || audio.state !== 'running' || voices >= 8 || !Number.isFinite(frequency)) return;
  try {
    const oscillator = audio.createOscillator(), gain = audio.createGain(), at = audio.currentTime;
    const length = Math.max(.04, Math.min(.6, Number(duration) || .2)); voices++;
    oscillator.type = 'sine'; oscillator.frequency.value = Math.max(70, Math.min(4000, frequency));
    gain.gain.setValueAtTime(.0001, at); gain.gain.linearRampToValueAtTime(.035, at + .015); gain.gain.exponentialRampToValueAtTime(.0001, at + length);
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(at); oscillator.stop(at + length + .02);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); voices--; };
  } catch { /* optional sound must never stop play */ }
}
function makeSeed() {
  try { const value = new Uint32Array(1); crypto.getRandomValues(value); return value[0]; }
  catch { return Math.floor(Math.random() * 0x100000000); }
}
function disposeRoot() {
  const geometries = new Set(), materials = new Set();
  root?.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    const list = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
    for (const material of list) materials.add(material);
  });
  root?.clear(); geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose());
}
function makeGame(nextSeed) {
  if (game?.dispose) game.dispose();
  disposeRoot(); seed = nextSeed >>> 0;
  game = definition.create({ THREE, root, seed, sound, reducedMotion });
  if (!game || !game.state || !['update', 'pointer', 'sync', 'snapshot', 'restore', 'hud'].every(key => typeof game[key] === 'function')) throw new Error('This game could not be initialized.');
  $('restartButton').textContent = game.resetLevel ? 'RESET ↻' : 'RESTART ↻';
  $('restartButton').setAttribute('aria-label', game.resetLevel ? 'Reset this puzzle' : 'Restart game');
  cursorX = cursorZ = 0; cursor.visible = false; dirty = true;
}
function savedRun() { return savedAvailable && definition ? readArcadeSave(definition.id) : null; }
function save() {
  if (!game || !['playing', 'won', 'lost'].includes(game.state.mode)) return false;
  try {
    const data = { schema: 1, id: definition.id, seed, mode: game.state.mode, state: game.snapshot() };
    storageAvailable = writeArcadeSave(definition.id, data); lastSave = performance.now();
  } catch { storageAvailable = false; }
  $('saveStatus').textContent = storageAvailable ? 'YOUR PROGRESS IS SAVED ON THIS DEVICE' : 'STORAGE UNAVAILABLE · KEEP THIS PAGE OPEN';
  $('saveStatus').classList.toggle('failed', !storageAvailable);
  return storageAvailable;
}
function cancelInput() {
  if (game && (pointer !== null || keyboardHeld)) game.pointer('cancel', pointerX, pointerZ);
  const old = pointer; pointer = null; keyboardHeld = false;
  if (old !== null && $('arcadeStage').hasPointerCapture(old)) $('arcadeStage').releasePointerCapture(old);
}
function panel(kind, content) {
  // A result can open beneath the finger that completed the game. Keep that
  // touch's eventual synthetic click from activating a button in the dialog.
  if (pointer !== null) { suppressPointer = pointer; suppressClickUntil = Infinity; }
  else if (stageReleaseDispatch) suppressClickUntil = performance.now() + 500;
  cancelInput(); panelKind = kind; $('panel').dataset.kind = kind; $('panelContent').innerHTML = content;
  $('modalLayer').hidden = false; document.querySelector('.app').inert = true; $('panel').scrollTop = 0; $('panel').focus({ preventScroll: true }); dirty = true;
}
function hidePanel() {
  panelKind = ''; $('modalLayer').hidden = true; document.querySelector('.app').inert = false;
  $('arcadeStage').focus({ preventScroll: true }); dirty = true;
}
function intro(note = '') {
  mode = 'intro'; const saved = savedRun(), record = readArcadeRecord(definition.id);
  panel('intro', `<div class="panel-grid"><div><span class="eyebrow">A LITTLE ARCADE ADVENTURE</span><h2 id="panelTitle">${escape(definition.title)}<span>.</span></h2><p><span class="hero-name">Meet ${escape(definition.hero)}.</span><br>${escape(definition.tagline)}</p><p>${escape(definition.instructions)}</p>${note ? `<p>${escape(note)}</p>` : ''}</div><div>${saved ? action('continue', 'CONTINUE MY GAME →', true) + action('start', 'START A FRESH GAME') : action('start', 'LET’S PLAY →', true)}${action('help', 'HOW TO PLAY')}<a class="action" href="./#little-arcade">← ALL GAMES</a><p class="fine">ONE LITTLE HERO · NO DOWNLOAD${record.wins ? `<br>${record.wins} ${record.wins === 1 ? 'WIN' : 'WINS'} ON THIS DEVICE` : ''}</p></div></div>`);
}
function help() {
  const previous = mode;
  if (mode === 'playing') { mode = 'paused'; save(); }
  panel('help', `<span class="eyebrow">MEET ${escape(definition.hero).toUpperCase()}</span><h2 id="panelTitle">HOW TO PLAY<span>.</span></h2><p>${escape(definition.instructions)}</p><p>Touch the game area to play. On a keyboard, use the arrow keys to move the cursor, then press Enter or Space to interact. P or Escape pauses.</p>${action('helpBack', 'GOT IT →', true)}<p class="fine">${previous === 'playing' || previous === 'paused' ? 'YOUR GAME IS PAUSED' : 'TAKE YOUR TIME'}</p>`);
}
function pausePanel() {
  mode = 'paused';
  panel('pause', `<span class="eyebrow">TAKE A LITTLE BREAK</span><h2 id="panelTitle">PAUSED<span>.</span></h2><p>${storageAvailable ? 'Your game is saved on this device.' : 'Device storage is unavailable. Keep this page open to continue.'}</p>${action('resume', contextLost ? 'RESTORING…' : 'KEEP PLAYING →', true, contextLost)}${action('help', 'HOW TO PLAY')}${action('restart', 'RESTART GAME')}<a class="action" href="./#little-arcade">← ALL GAMES</a>`);
}
function resultPanel() {
  const won = game.state.mode === 'won', hud = game.hud() || {};
  mode = won ? 'won' : 'lost';
  panel(mode, `<div class="panel-grid"><div><div class="result-mark">${won ? '✦ ✦ ✦' : '✦'}</div><span class="eyebrow">${won ? 'LITTLE HERO, BIG WIN' : 'READY FOR ANOTHER GO?'}</span><h2 id="panelTitle">${won ? 'YOU DID IT' : 'TRY AGAIN'}<span>.</span></h2><p>${escape(won ? `${definition.hero} did it! ${hud.secondary || 'What a lovely run.'}` : `${definition.hero} is ready when you are.`)}</p></div><div>${action('restart', 'PLAY AGAIN →', true)}${action('help', 'HOW TO PLAY')}<a class="action" href="./#little-arcade">← ALL GAMES</a><p class="fine">${storageAvailable ? 'PROGRESS SAVED ON THIS DEVICE' : 'STORAGE UNAVAILABLE'}</p></div></div>`);
}
function refresh() {
  if (!game) return;
  const hud = game.hud() || {};
  $('statusText').textContent = String(hud.secondary || definition.tagline);
  const score = String(hud.primary || 'PLAY');
  $('scoreText').textContent = score;
  $('scoreText').classList.toggle('long', score.length > 12);
  $('controlText').textContent = String(hud.hint || definition.instructions);
  $('pauseButton').disabled = mode !== 'playing' || contextLost;
  $('restartButton').disabled = mode !== 'playing' || contextLost;
  dirty = true;
}
function change() {
  if (!game) return;
  const ended = game.state.mode === 'won' || game.state.mode === 'lost';
  if (mode === 'playing' && ended) {
    if (game.state.mode === 'won') addArcadeWin(definition.id);
    sound(game.state.mode === 'won' ? 740 : 180, .25);
    save(); resultPanel();
  }
  refresh();
}
function start() {
  if (contextLost) return false;
  unlockAudio(); cancelInput(); makeGame(makeSeed());
  mode = 'playing'; hidePanel(); lastFrame = performance.now(); lastRender = 0; refresh(); save(); return true;
}
function continueRun() {
  const data = savedRun(); if (!data || contextLost) return false;
  cancelInput(); makeGame(data.seed);
  try {
    if (!game.restore(data.state) || game.state.mode !== data.mode) throw new Error('Invalid checkpoint');
  } catch { savedAvailable = false; makeGame(makeSeed()); intro('This saved game could not be read. Start a fresh game to play.'); return false; }
  unlockAudio(); lastFrame = performance.now();
  if (game.state.mode === 'playing') { mode = 'playing'; hidePanel(); }
  else resultPanel();
  refresh(); return true;
}
function togglePause() {
  if (mode !== 'playing' || contextLost) return;
  cancelInput(); mode = 'paused'; save(); pausePanel(); refresh();
}
function resume() {
  if (contextLost || mode !== 'paused') return;
  unlockAudio(); mode = 'playing'; hidePanel(); lastFrame = performance.now(); refresh(); save();
}
function handleAction(name) {
  if (contextLost) return;
  if (name === 'start' || name === 'restart') start();
  else if (name === 'continue') continueRun();
  else if (name === 'resume') resume();
  else if (name === 'help') help();
  else if (name === 'helpBack') { if (mode === 'paused') pausePanel(); else if (mode === 'won' || mode === 'lost') resultPanel(); else intro(); }
}
function position(event) {
  const rect = $('arcadeStage').getBoundingClientRect();
  mouse.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
  raycaster.setFromCamera(mouse, camera);
  if (!raycaster.ray.intersectPlane(plane, hit)) return null;
  return { x: THREE.MathUtils.clamp(hit.x, -6, 6), z: THREE.MathUtils.clamp(hit.z, -6, 6) };
}
function act(type, x, z) {
  if (mode !== 'playing' || contextLost) return;
  if (type === 'down' && definition.id !== 'bellwood-beats') sound(390, .08);
  pointerX = x; pointerZ = z; game.pointer(type, x, z); change();
}
function resize() {
  if (!renderer) return;
  const rect = $('arcadeStage').getBoundingClientRect(), w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
  if (renderer.domElement.dataset.width === String(w) && renderer.domElement.dataset.height === String(h)) return;
  if (pointer !== null || keyboardHeld) cancelInput();
  renderer.domElement.dataset.width = String(w); renderer.domElement.dataset.height = String(h);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, touch ? 1.35 : 1.75, Math.sqrt((touch ? 420000 : 1500000) / (w * h))));
  renderer.setSize(w, h, false);
  const aspect = w / h, span = 15;
  camera.left = -span / 2 * Math.max(1, aspect); camera.right = -camera.left;
  camera.top = span / 2 * Math.max(1, 1 / aspect); camera.bottom = -camera.top;
  camera.updateProjectionMatrix(); camera.updateMatrixWorld(); dirty = true;
}
function frame(now) {
  requestAnimationFrame(frame);
  if (!lastFrame) lastFrame = now;
  const dt = Math.min(.05, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now;
  if (contextLost || document.hidden) return;
  if (mode === 'playing' && realtime && game.state.mode === 'playing') { game.update(dt); change(); }
  if ((dirty || mode === 'playing' && realtime) && now - lastRender >= (touch ? 1000 / 30 : 1000 / 60) - .5) {
    game.sync(); renderer.render(scene, camera); renderCount++; lastRender = now; dirty = false;
  }
  if (mode === 'playing' && now - lastSave > 5000) save();
}

async function initialize() {
  if (!definition) throw new Error('Choose a game from the collection to get started.');
  if (arcadeGames.length !== 20 || arcadeById.size !== 20) throw new Error('The arcade collection could not be loaded.');
  document.title = `${definition.title} — Games`;
  document.documentElement.style.setProperty('--accent', definition.accent || '#ffd48c');
  $('gameTitle').textContent = definition.title; $('heroLabel').textContent = `MEET ${definition.hero}`.toUpperCase();
  $('controlText').textContent = definition.instructions; soundUI();
  renderer = new THREE.WebGLRenderer({ antialias: !touch, powerPreference: 'low-power' });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setClearColor(definition.background || '#273d4a');
  renderer.domElement.setAttribute('aria-hidden', 'true'); $('arcadeStage').prepend(renderer.domElement);
  scene = new THREE.Scene(); scene.background = new THREE.Color(definition.background || '#273d4a');
  camera = new THREE.OrthographicCamera(-8, 8, 8, -8, .1, 100); camera.position.set(0, 18, 9); camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight('#fff8ed', '#718494', 2.2));
  const sun = new THREE.DirectionalLight('#ffffff', 1.8); sun.position.set(-8, 18, 10); scene.add(sun);
  root = new THREE.Group(); scene.add(root, cursor); makeGame(makeSeed());
  const observer = new ResizeObserver(resize); observer.observe($('arcadeStage')); resize();
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); contextLost = true; priorContextMode = mode; cancelInput();
    if (mode === 'playing') { mode = 'paused'; save(); }
    panel('restoring', `<span class="eyebrow">HOLD THAT MOMENT</span><h2 id="panelTitle">RESTORING<span>.</span></h2><p>Your game is safe here while the picture returns.</p>${action('wait', 'RESTORING…', true, true)}<a class="action" href="./#little-arcade">← ALL GAMES</a>`); refresh();
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    contextLost = false; renderer.setSize(0, 0, false); delete renderer.domElement.dataset.width; delete renderer.domElement.dataset.height; resize();
    if (priorContextMode === 'intro') intro(); else if (game.state.mode === 'won' || game.state.mode === 'lost') resultPanel(); else pausePanel(); refresh();
  });
  $('loading').hidden = true; document.body.dataset.ready = 'true'; intro();
  if (query.get('continue') === '1' && savedRun()) continueRun();
  if (query.has('debug')) window.__arcade = { definition, get game() { return game; }, get renderer() { return renderer; }, get camera() { return camera; }, get scene() { return scene; }, get root() { return root; }, start, continueRun, save, refresh: change,
    advance(seconds) { for (let remaining = Math.max(0, seconds); remaining > 0 && game.state.mode === 'playing'; remaining -= .05) game.update(Math.min(.05, remaining)); change(); },
    setRealtime(value) { realtime = !!value; lastFrame = performance.now(); dirty = true; }, renderNow() { game.sync(); renderer.render(scene, camera); renderCount++; }, get renderCount() { return renderCount; }, get mode() { return mode; } };
  requestAnimationFrame(frame);
}

$('modalLayer').addEventListener('click', event => {
  // Keyboard-generated clicks have detail 0 and remain immediately usable.
  if (event.detail > 0 && (suppressPointer !== null || performance.now() < suppressClickUntil)) { event.preventDefault(); event.stopImmediatePropagation(); }
}, true);
for (const type of ['pointerup', 'pointercancel']) document.addEventListener(type, event => {
  if (event.pointerId === suppressPointer) { suppressPointer = null; suppressClickUntil = performance.now() + 500; }
}, true);
$('panelContent').addEventListener('click', event => { const button = event.target.closest('button[data-action]'); if (button) handleAction(button.dataset.action); });
$('soundButton').addEventListener('click', () => { soundEnabled = !soundEnabled; try { localStorage.setItem('games:arcade:sound', soundEnabled ? '1' : '0'); } catch {} unlockAudio(); soundUI(); if (soundEnabled) sound(620); });
$('helpButton').addEventListener('click', () => { if (!contextLost) help(); });
$('pauseButton').addEventListener('click', togglePause);
$('restartButton').addEventListener('click', () => {
  if (mode !== 'playing') return;
  if (game.resetLevel) { cancelInput(); game.resetLevel(); change(); save(); }
  else start();
});
const stage = $('arcadeStage');
stage.addEventListener('pointerdown', event => {
  if (mode !== 'playing' || contextLost || pointer !== null || event.pointerType === 'mouse' && event.button !== 0) return;
  const point = position(event); if (!point) return;
  event.preventDefault(); unlockAudio(); pointer = event.pointerId; cursor.visible = false; stage.setPointerCapture(pointer); act('down', point.x, point.z);
});
stage.addEventListener('pointermove', event => { if (event.pointerId !== pointer) return; const point = position(event); if (point) act('move', point.x, point.z); });
stage.addEventListener('pointerup', event => {
  if (event.pointerId !== pointer) return;
  const point = position(event) || { x: pointerX, z: pointerZ }; pointer = null; stageReleaseDispatch = true;
  try { act('up', point.x, point.z); } finally { stageReleaseDispatch = false; }
  save();
});
for (const type of ['pointercancel', 'lostpointercapture']) stage.addEventListener(type, event => { if (event.pointerId === pointer) { cancelInput(); change(); save(); } });
document.addEventListener('keydown', event => {
  if (!$('modalLayer').hidden) {
    if (event.key === 'Tab') {
      const controls = [...$('panel').querySelectorAll('button:not(:disabled),a[href]')], first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === $('panel'))) { last?.focus(); event.preventDefault(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === $('panel'))) { first?.focus(); event.preventDefault(); }
    } else if (event.key === 'Escape' && panelKind === 'pause') { event.preventDefault(); resume(); }
    return;
  }
  if ((event.key === 'Escape' || event.key.toLowerCase() === 'p') && mode === 'playing') { event.preventDefault(); togglePause(); return; }
  if (mode !== 'playing' || event.target.closest?.('button,a,input,textarea,select')) return;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
    event.preventDefault(); cursor.visible = true;
    cursorX = THREE.MathUtils.clamp(cursorX + (event.key === 'ArrowRight' ? .5 : event.key === 'ArrowLeft' ? -.5 : 0), -6, 6);
    cursorZ = THREE.MathUtils.clamp(cursorZ + (event.key === 'ArrowDown' ? .5 : event.key === 'ArrowUp' ? -.5 : 0), -6, 6);
    cursor.position.x = cursorX; cursor.position.z = cursorZ;
    if (keyboardHeld) act('move', cursorX, cursorZ); dirty = true;
  } else if ((event.key === ' ' || event.key === 'Enter') && !event.repeat && !keyboardHeld) {
    event.preventDefault(); unlockAudio(); cursor.visible = true; keyboardHeld = true; act('down', cursorX, cursorZ);
  }
});
document.addEventListener('keyup', event => { if ((event.key === ' ' || event.key === 'Enter') && keyboardHeld) { event.preventDefault(); keyboardHeld = false; act('up', cursorX, cursorZ); save(); } });
function suspend() {
  // A browser can cancel an active touch without delivering its final up
  // event when the page loses focus. Do not leave the dialog guard stuck.
  if (suppressPointer !== null) { suppressPointer = null; suppressClickUntil = performance.now() + 500; }
  cancelInput();
  if (mode === 'playing') { mode = 'paused'; save(); pausePanel(); refresh(); }
  else if (game && mode !== 'intro') save();
  audio?.suspend().catch(() => {});
}
document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); else lastFrame = performance.now(); });
window.addEventListener('blur', suspend); window.addEventListener('pagehide', suspend);
initialize().catch(error => { console.error(error); $('loading').innerHTML = `<span>✦</span><strong>${escape(error.message || 'This game could not be displayed.')}</strong><a href="./#little-arcade">← Back to all games</a>`; });
