import { createLantern, parseLanternSave } from './lantern-game.js';
import { createLanternScene } from './lantern-scene.js?v2';
import { readGameSave, writeGameSave } from './save-store.js?v7';

const $ = id => document.getElementById(id);
const query = new URLSearchParams(location.search);
const touch = matchMedia('(pointer: coarse)').matches;
const profileKey = 'games:lantern:progress';
const profile = { sound: false, stars: 0, completed: false, memories: 0 };
try {
  const data = JSON.parse(localStorage.getItem(profileKey));
  if (data?.version === 1) {
    profile.sound = data.sound === true;
    if (Number.isInteger(data.stars) && data.stars >= 0 && data.stars <= 3) profile.stars = data.stars;
    if (Number.isInteger(data.memories) && data.memories >= 0 && data.memories <= 5) profile.memories = data.memories;
    profile.completed = data.completed === true;
  }
} catch { /* The village remains playable when storage is unavailable. */ }

let world, game, state, view, contextLost = false, dirty = true, realtime = true;
let panelKind = '', panelReturn = 'intro', lastMode = 'ready', lastFrame = 0, lastUI = 0, lastSaveTick = 0;
let renderCount = 0, storageAvailable = true, recordsAvailable = true, toastUntil = 0, audio, voices = 0;
let pointer = null, anchorX = 0, anchorY = 0, stickX = 0, stickY = 0;
const keys = new Set();
const playing = () => state && ['playing', 'exploring'].includes(state.mode);
const button = (action, label, primary = false, disabled = false) => `<button data-action="${action}" class="${primary ? 'primary' : 'secondary'}"${disabled ? ' disabled' : ''}>${label}</button>`;

function saveProfile() {
  try { localStorage.setItem(profileKey, JSON.stringify({ version: 1, ...profile })); return true; }
  catch { return false; }
}
function savedRun() { return parseLanternSave(readGameSave('lantern')?.data, world); }
function save() {
  const data = game?.snapshot(); if (!data) return false;
  storageAvailable = writeGameSave('lantern', data); lastSaveTick = state.ticks;
  $('saveStatus').textContent = storageAvailable ? 'YOUR LITTLE JOURNEY IS SAVED ON THIS DEVICE' : 'DEVICE STORAGE UNAVAILABLE · KEEP THIS PAGE OPEN';
  $('saveStatus').classList.toggle('failed', !storageAvailable);
  return storageAvailable;
}
function bankRecords() {
  profile.stars = Math.max(profile.stars, state.stars);
  profile.memories = Math.max(profile.memories, state.secrets.length);
  profile.completed ||= state.lit.length === world.beacons.length;
  recordsAvailable = saveProfile();
}
function unlockAudio() {
  if (!profile.sound) return;
  try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume().catch(() => {}); } catch { /* Optional sound. */ }
}
function tone(frequency, delay = 0, duration = 0.24) {
  if (!profile.sound || !audio || audio.state !== 'running' || voices >= 12) return;
  const oscillator = audio.createOscillator(), gain = audio.createGain(), at = audio.currentTime + delay;
  voices++; oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, at);
  gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(0.035, at + 0.015); gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(at); oscillator.stop(at + duration + 0.02);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); voices--; };
}
function chime(notes) { notes.forEach((note, i) => tone(note, i * 0.075)); }
function soundUI() {
  $('soundButton').setAttribute('aria-pressed', String(profile.sound));
  $('soundButton').setAttribute('aria-label', profile.sound ? 'Turn sound off' : 'Turn sound on');
  $('soundButton').textContent = profile.sound ? '♫' : '♪';
}
function clearInput(release = true) {
  const old = pointer; pointer = null; stickX = stickY = 0; keys.clear();
  if (state) state.player.moving = false;
  if (release && old !== null && $('gameStage').hasPointerCapture(old)) $('gameStage').releasePointerCapture(old);
  $('joystick').hidden = true; dirty = true;
}
function control() {
  const x = pointer !== null ? stickX : Number(keys.has('ArrowRight') || keys.has('KeyD')) - Number(keys.has('ArrowLeft') || keys.has('KeyA'));
  const y = pointer !== null ? stickY : Number(keys.has('ArrowDown') || keys.has('KeyS')) - Number(keys.has('ArrowUp') || keys.has('KeyW'));
  return view ? view.movement(x, y) : { x: 0, z: 0 };
}
function showPanel(kind, content) {
  clearInput(); panelKind = kind; $('gamePanel').dataset.kind = kind;
  $('panelContent').innerHTML = content; $('modalLayer').hidden = false;
  document.querySelector('.game-app').inert = true;
  $('gamePanel').scrollTop = 0; $('gamePanel').focus({ preventScroll: true }); dirty = true;
}
function hidePanel() {
  panelKind = ''; $('modalLayer').hidden = true; $('toast').hidden = true; toastUntil = 0;
  document.querySelector('.game-app').inert = false;
  $('gameStage').focus({ preventScroll: true }); dirty = true;
}
function showIntro() {
  const saved = savedRun();
  showPanel('intro', `<div class="intro-layout"><div><span class="eyebrow">A SMALL WORLD WITH A WARM HEART</span><h1 id="panelTitle">LANTERN<br><span>VALE.</span></h1><p class="lede">A village adrift among the stars.<br>A little light in your hands.</p><div class="intro-steps"><div><span>01</span><strong>TAKE A LITTLE WALK</strong><small>Drag anywhere to guide your keeper.</small></div><div><span>02</span><strong>BRING BACK THE GLOW</strong><small>Gather fireflies. Light the five lanterns.</small></div></div></div><div>${saved ? button('continue', 'CONTINUE MY JOURNEY →', true) + button('start', 'BEGIN A FRESH JOURNEY') : button('start', 'STEP INTO THE VALE →', true)}${button('help', 'HOW TO PLAY')}<a class="action text-button" href="./">← ALL GAMES</a><p class="fine">ONE THUMB · FIVE LANTERNS · NO RUSH${profile.completed ? `<br>${profile.stars} / 3 STARS · ${profile.memories} / 5 MEMORIES FOUND` : ''}</p></div></div>`);
}
function showHelp() {
  panelReturn = playing() || state.mode === 'paused' ? 'pause' : panelKind || 'intro';
  if (playing()) { game.pause(); changed(); }
  showPanel('help', `<span class="eyebrow">LET THE LITTLE THINGS LEAD THE WAY</span><h2 id="panelTitle">Your first evening<br>in the vale.</h2><ul class="help-list"><li><span>↟</span><div><b>Drag anywhere to walk.</b>Your keeper follows your thumb. A small drag moves gently. Lift to stop.</div></li><li><span>✧</span><div><b>Gather the golden fireflies.</b>Walk near a glowing firefly and it joins your lantern. Follow your little guide when you need a nudge.</div></li><li><span>♧</span><div><b>Bring a little light to each lantern.</b>Carry enough fireflies, then linger beside a village lantern for a moment. It lights itself.</div></li><li><span>✦</span><div><b>Five small memories are waiting.</b>Look around the quiet corners for purple memory stars. Find three for two stars; find all five for three.</div></li></ul><p class="fine">${touch ? 'ONE THUMB IS ALL YOU NEED.' : 'ARROWS OR WASD WALK · P OR ESC PAUSES.'}<br>USE THE MAP TO FIND THE BRIDGES AND LANTERNS. NO LIVES. NO TIMERS.</p>${button('helpBack', 'LET’S FIND SOME LIGHT →', true)}`);
}
function showPause() {
  showPanel('pause', `<span class="eyebrow">THE FIREFLIES CAN WAIT</span><h2 id="panelTitle">A little pause.</h2><p>${state.lit.length} of 5 village lanterns are glowing.<br>${storageAvailable ? 'Your place in the village is saved on this device.' : 'Device storage is unavailable. Keep this page open to continue your journey.'}</p>${button('resume', 'BACK TO THE VALE →', true, contextLost)}${button('map', 'VILLAGE MAP')}${button('help', 'HOW TO PLAY')}${button('restart', 'BEGIN A FRESH JOURNEY')}<a class="action text-button" href="./">← ALL GAMES</a>`);
}
function showMap() {
  panelReturn = playing() || state.mode === 'paused' ? 'pause' : panelKind || 'intro';
  if (playing()) { game.pause(); changed(); }
  const mapPoint = p => ({ x: 160 + p.x * 9, y: 115 + p.z * 9 });
  const player = mapPoint(state.player);
  const riverX = 160 + world.river.left * 9, riverWidth = (world.river.right - world.river.left) * 9;
  const labels = world.beacons.map(beacon => {
    const p = mapPoint(beacon), lit = state.lit.includes(beacon.id);
    return `<circle cx="${p.x}" cy="${p.y}" r="11" fill="${lit ? '#e2a655' : '#7e9791'}" stroke="#fff9e8" stroke-width="2"/><text x="${p.x}" y="${p.y + 3.5}" text-anchor="middle" font-size="10" fill="white" font-family="Arial">${beacon.id + 1}</text>`;
  }).join('');
  const houses = world.colliders.map(item => { const p = mapPoint(item); return `<circle cx="${p.x}" cy="${p.y}" r="${item.radius * 8}" fill="${item.kind === 'tree' ? '#6d9c83' : '#bf9475'}" opacity=".7"/>`; }).join('');
  const bridges = world.river.bridges.map(bridge => `<rect x="${riverX - 7}" y="${115 + bridge.z * 9 - 6}" width="${riverWidth + 14}" height="12" rx="2" fill="#b08a66"/>`).join('');
  showPanel('map', `<span class="eyebrow">A FEW LITTLE PLACES TO WANDER</span><h2 id="panelTitle">The whole little vale.</h2><svg class="village-map" viewBox="0 0 320 230" role="img" aria-label="Village map. Your keeper is the white dot. The five lanterns are numbered; lit lanterns are gold. Two bridges cross the river."><defs><clipPath id="islandClip"><ellipse cx="160" cy="115" rx="140" ry="100"/></clipPath></defs><ellipse cx="160" cy="115" rx="143" ry="103" fill="#f1dfb5"/><g clip-path="url(#islandClip)"><ellipse cx="160" cy="115" rx="140" ry="100" fill="#b9ceb0"/><rect x="${riverX}" y="0" width="${riverWidth}" height="230" fill="#7dbfc4"/>${houses}${bridges}${labels}</g><circle cx="${player.x}" cy="${player.y}" r="7" fill="#fff9e8" stroke="#305c67" stroke-width="3"/></svg><div class="map-legend"><span>● YOU</span><span>● GOLD = LIT</span><span>━ TWO BRIDGES</span></div><p class="fine">${world.beacons.map(beacon => `${beacon.id + 1} ${beacon.name}`).join(' · ')}</p>${button('mapBack', 'BACK TO MY JOURNEY →', true)}`);
}
function showResult() {
  showPanel('won', `<div class="result-layout"><div><div class="result-stars" aria-label="${state.stars} stars">${'★'.repeat(state.stars)}${'☆'.repeat(3 - state.stars)}</div><span class="eyebrow">FIVE LANTERNS. ONE HAPPY LITTLE VILLAGE.</span><h2 id="panelTitle">You brought<br><em>the evening home.</em></h2><p>The vale is glowing again. Every little light has a story, and you’re part of this one now.</p></div><div><div class="result-stats"><div><strong>5 / 5</strong><span>LANTERNS</span></div><div><strong>${state.secrets.length} / 5</strong><span>MEMORIES</span></div></div>${button('explore', state.secrets.length < 5 ? 'FIND THE HIDDEN MEMORIES →' : 'WANDER A LITTLE LONGER →', true)}${button('replay', 'BEGIN A NEW EVENING')}<a class="action text-button" href="./">← ALL GAMES</a><p class="fine">${state.stars < 3 ? 'FIND ALL FIVE MEMORIES FOR THREE STARS.<br>' : ''}${storageAvailable && recordsAvailable ? 'YOUR JOURNEY IS SAVED ON THIS DEVICE' : 'DEVICE STORAGE UNAVAILABLE'}</p></div></div>`);
}
function showRestoring() {
  showPanel('restoring', `<span class="eyebrow">HOLD ON TO THAT LITTLE LIGHT</span><h2 id="panelTitle">The picture is returning.</h2><p>Your keeper and the village are safe here.</p>${button('waiting', 'RESTORING THE VALE…', true, true)}`);
}
function toast(message, seconds = 2.2) {
  $('toast').textContent = message; $('toast').hidden = false; toastUntil = performance.now() + seconds * 1000;
}
function refreshHUD() {
  const guide = state.guide;
  $('litValue').innerHTML = `${state.lit.length} <small>/ 5</small>`;
  $('chargeValue').textContent = state.charge; $('memoryValue').textContent = `${state.secrets.length} / 5`;
  $('objectiveLabel').textContent = state.lit.length === 5 ? state.secrets.length === 5 ? 'THE VALE IS YOURS TO WANDER' : 'A FEW LITTLE MEMORIES REMAIN' : 'BRING THE VILLAGE TO LIFE';
  $('objectiveTitle').textContent = guide?.kind === 'mote' ? `Find ${guide.needed} more firefl${guide.needed === 1 ? 'y' : 'ies'}.` : guide?.kind === 'beacon' ? `Light ${guide.name}.` : guide?.kind === 'secret' ? 'Look for a purple memory star.' : 'Stay a little longer.';
  $('pauseButton').disabled = !playing() || contextLost;
  $('mapButton').disabled = state.mode === 'ready' || contextLost;
  $('controlTitle').textContent = pointer !== null || keys.size ? 'LIFT TO STOP AND LOOK AROUND.' : 'A LITTLE WALK. A LITTLE WONDER.';
  $('controlText').textContent = guide?.viaBridge ? 'A wooden bridge leads to the next glow.' : state.channel.beacon !== null ? 'Stay beside the lantern. Let it glow.' : 'Drag to walk. Follow the golden glow.';
  $('lighting').hidden = state.channel.beacon === null;
  $('lightingFill').style.width = `${state.channel.progress * 100}%`;
}
function handleMode() {
  if (lastMode === state.mode) return;
  lastMode = state.mode; dirty = true;
  if (playing()) hidePanel();
  else if (state.mode === 'paused') { clearInput(); save(); showPause(); }
  else if (state.mode === 'won') { clearInput(); bankRecords(); save(); showResult(); }
}
function changed() {
  let checkpoint = false;
  for (const event of state.events.splice(0)) {
    if (event.type === 'mote') { tone(490 + event.charge % 6 * 65, 0, 0.14); checkpoint = true; }
    if (event.type === 'light') { chime([392, 494, 587, 784]); toast(`${event.name.toUpperCase()} IS GLOWING`); checkpoint = true; }
    if (event.type === 'secret') { chime([659, 784, 988]); toast(`A MEMORY FOUND · ${event.name}`); bankRecords(); checkpoint = true; }
    if (event.type === 'won') chime([392, 494, 587, 784, 988]);
  }
  handleMode(); refreshHUD(); if (checkpoint) save(); dirty = true;
}
function start() {
  if (contextLost || !game) return false;
  clearInput(); unlockAudio(); game.start(); lastMode = 'ready'; lastFrame = performance.now(); changed(); save(); return true;
}
function continueRun() {
  const saved = savedRun(); if (!saved || contextLost || !game.restore(saved)) { showIntro(); return false; }
  clearInput(); unlockAudio(); if (state.mode === 'paused') game.resume();
  lastMode = 'ready'; lastFrame = performance.now(); changed(); return true;
}
function returnPanel(kind) {
  if (kind === 'pause') showPause(); else if (kind === 'won') showResult(); else showIntro();
}
function doAction(action) {
  if (contextLost) return;
  unlockAudio();
  if (['start', 'restart', 'replay'].includes(action)) start();
  if (action === 'continue') continueRun();
  if (action === 'resume') { game.resume(); lastFrame = performance.now(); changed(); }
  if (action === 'explore') { game.explore(); lastFrame = performance.now(); changed(); save(); }
  if (action === 'help') showHelp();
  if (action === 'map') showMap();
  if (action === 'helpBack' || action === 'mapBack') returnPanel(panelReturn);
}
function suspend() {
  clearInput();
  if (playing()) { game.pause(); changed(); } else save();
  audio?.suspend().catch(() => {});
}
function bindInputs() {
  $('panelContent').addEventListener('click', event => { const target = event.target.closest('button'); if (target?.dataset.action) doAction(target.dataset.action); });
  $('soundButton').addEventListener('click', () => { profile.sound = !profile.sound; recordsAvailable = saveProfile(); unlockAudio(); soundUI(); if (profile.sound) chime([440, 659]); });
  $('helpButton').addEventListener('click', showHelp);
  $('mapButton').addEventListener('click', showMap);
  $('pauseButton').addEventListener('click', () => { game.pause(); changed(); });
  const stage = $('gameStage');
  stage.addEventListener('pointerdown', event => {
    if (!playing() || contextLost || pointer !== null || event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.pointerType === 'mouse') event.preventDefault();
    unlockAudio(); keys.clear(); pointer = event.pointerId; anchorX = event.clientX; anchorY = event.clientY; stickX = stickY = 0;
    stage.setPointerCapture(pointer); updateStick(event); $('joystick').hidden = false; refreshHUD(); dirty = true;
  });
  stage.addEventListener('pointermove', event => { if (event.pointerId === pointer && playing()) updateStick(event); });
  stage.addEventListener('pointerup', event => { if (event.pointerId === pointer) { clearInput(false); refreshHUD(); save(); } });
  for (const type of ['pointercancel', 'lostpointercapture']) stage.addEventListener(type, event => { if (event.pointerId === pointer) { clearInput(); refreshHUD(); save(); } });
  document.addEventListener('keydown', event => {
    if (event.code === 'Tab' && !$('modalLayer').hidden) {
      const items = [...$('gamePanel').querySelectorAll('button:not(:disabled),a[href]')], first = items[0], last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || !items.includes(document.activeElement))) { last?.focus(); event.preventDefault(); }
      else if (!event.shiftKey && (document.activeElement === last || !items.includes(document.activeElement))) { first?.focus(); event.preventDefault(); }
      return;
    }
    if (['Escape', 'KeyP'].includes(event.code) && !event.repeat) {
      event.preventDefault(); if (contextLost) return;
      if (panelKind === 'help' || panelKind === 'map') returnPanel(panelReturn);
      else if (state.mode === 'paused') doAction('resume'); else if (playing()) { game.pause(); changed(); }
      return;
    }
    if (!playing() || contextLost || !$('modalLayer').hidden || pointer !== null || event.target.closest?.('button,a,input,select,textarea,[contenteditable="true"]')) return;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) { event.preventDefault(); keys.add(event.code); refreshHUD(); dirty = true; }
  });
  document.addEventListener('keyup', event => { if (keys.delete(event.code)) { if (!keys.size) clearInput(); refreshHUD(); save(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); else { lastFrame = performance.now(); dirty = true; } });
  window.addEventListener('pagehide', suspend); window.addEventListener('blur', suspend);
}
function updateStick(event) {
  let dx = event.clientX - anchorX, dy = event.clientY - anchorY;
  const radius = 46, distance = Math.hypot(dx, dy);
  if (distance > radius) { anchorX += dx * (1 - radius / distance); anchorY += dy * (1 - radius / distance); dx *= radius / distance; dy *= radius / distance; }
  stickX = dx / radius; stickY = dy / radius;
  const rect = $('gameStage').getBoundingClientRect();
  $('joystick').style.left = `${anchorX - rect.left}px`; $('joystick').style.top = `${anchorY - rect.top}px`;
  $('joystickKnob').style.transform = `translate(${dx}px,${dy}px)`; dirty = true;
}
function frame(now) {
  requestAnimationFrame(frame);
  if (contextLost || document.hidden) { lastFrame = now; return; }
  const interval = touch ? 1000 / 30 : 1000 / 60;
  if (now - lastFrame < interval - 0.5) return;
  const elapsed = Math.min(0.08, (now - (lastFrame || now)) / 1000); lastFrame = now;
  if (realtime && playing()) {
    game.advance(elapsed, control());
    if (state.events.length || state.mode !== lastMode) changed();
    else if (now - lastUI > 100) { refreshHUD(); lastUI = now; }
  }
  if (toastUntil && now >= toastUntil) { $('toast').hidden = true; toastUntil = 0; }
  if (dirty || realtime && playing()) { view.render(state, now / 1000); renderCount++; dirty = false; }
  if (playing() && state.ticks - lastSaveTick >= 180) save();
}

try {
  const response = await fetch('./assets/lantern-world.json');
  if (!response.ok) throw Error('The village map could not be loaded.');
  world = await response.json(); game = createLantern({ world }); state = game.state;
  view = await createLanternScene($('gameStage'), world, {
    resized: () => { clearInput(); dirty = true; },
    lost: () => { contextLost = true; suspend(); showRestoring(); refreshHUD(); },
    restored: () => { contextLost = false; dirty = true; if (state.mode === 'paused') showPause(); else if (state.mode === 'won') showResult(); else showIntro(); refreshHUD(); },
    progress: percent => { $('loadingDetail').textContent = `Gathering the village… ${Math.round(percent * 100)}%`; },
  });
  bindInputs(); soundUI(); refreshHUD(); showIntro(); $('loading').hidden = true;
  if (query.get('continue') === '1' && savedRun()) continueRun();
  if (query.has('debug')) window.__lantern = {
    game, world, view, start, save, continueRun, refresh: changed,
    advance(seconds, input = control()) { game.advance(seconds, input); changed(); },
    setRealtime(value) { realtime = !!value; lastFrame = performance.now(); dirty = true; },
    get profile() { return JSON.parse(JSON.stringify(profile)); }, get renderCount() { return renderCount; },
  };
  document.body.dataset.ready = 'true'; requestAnimationFrame(frame);
} catch (error) {
  console.error(error);
  $('loading').innerHTML = '<span class="loading-star" aria-hidden="true">✦</span><strong>The vale needs a moment.</strong><span>Reload to try again, or open this page in a browser with WebGL.</span><a href="./">← Back to games</a>';
}
