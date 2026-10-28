import { createLantern, parseLanternSave, flightTargets } from './lantern-game.js?v4';
import { createLanternScene } from './lantern-scene.js?v4';
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

let world, targets, game, state, view, contextLost = false, dirty = true, realtime = true;
let resultClickGuardUntil = 0;
let panelKind = '', panelReturn = 'intro', lastMode = 'ready', lastFrame = 0, lastUI = 0, lastSaveTick = 0;
let renderCount = 0, storageAvailable = true, recordsAvailable = true, toastUntil = 0, audio, voices = 0;
let pointer = null, boostPointer = null, anchorX = 0, anchorY = 0, stickX = 0, stickY = 0;
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
function clearSteering(release = true) {
  const old = pointer; pointer = null; stickX = stickY = 0;
  if (release && old !== null && $('gameStage').hasPointerCapture(old)) $('gameStage').releasePointerCapture(old);
  $('joystick').hidden = true; dirty = true;
}
function clearBoost(release = true) {
  const old = boostPointer; boostPointer = null;
  if (release && old !== null && $('boostButton').hasPointerCapture(old)) $('boostButton').releasePointerCapture(old);
  $('boostButton').classList.remove('engaged'); dirty = true;
}
function clearInput() { clearSteering(); clearBoost(); keys.clear(); }
function control() {
  const boost = boostPointer !== null || keys.has('ShiftLeft') || keys.has('ShiftRight');
  return {
    turn: pointer !== null ? stickX : Number(keys.has('ArrowRight') || keys.has('KeyD')) - Number(keys.has('ArrowLeft') || keys.has('KeyA')),
    lift: pointer !== null ? -stickY : Number(keys.has('KeyE') || keys.has('Space')) - Number(keys.has('KeyQ') || keys.has('ControlLeft')),
    throttle: pointer !== null || boost ? 1 : Number(keys.has('ArrowUp') || keys.has('KeyW')) - Number(keys.has('ArrowDown') || keys.has('KeyS')),
    boost,
  };
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
  showPanel('intro', `<div class="intro-layout"><div><span class="eyebrow">YOUR LITTLE SHIP. A WORLD TO DISCOVER.</span><h1 id="panelTitle">LANTERN<br><span>VALE.</span></h1><p class="lede">Three islands among the stars.<br>One little ship. Your adventure.</p><div class="intro-steps"><div><span>01</span><strong>FLY ANYWHERE</strong><small>Hold to fly. Drag to turn and climb. Release to hover.</small></div><div><span>02</span><strong>DISCOVER THREE WORLDS</strong><small>Light the village. Wake a garden and an ancient observatory.</small></div></div></div><div>${saved ? button('continue', 'CONTINUE MY FLIGHT →', true) + button('start', 'BEGIN A FRESH FLIGHT') : button('start', 'TAKE FLIGHT →', true)}${button('help', 'FLIGHT CONTROLS')}<a class="action text-button" href="./">← ALL GAMES</a><p class="fine">THREE ISLANDS · FREE FLIGHT · NO RUSH${profile.completed ? `<br>${profile.stars} / 3 STARS · ${profile.memories} / 5 MEMORIES FOUND` : ''}</p></div></div>`);
}
function showHelp() {
  panelReturn = playing() || state.mode === 'paused' ? 'pause' : panelKind || 'intro';
  if (playing()) { game.pause(); changed(); }
  showPanel('help', `<span class="eyebrow">A VIEW FROM YOUR OWN LITTLE SPACESHIP</span><h2 id="panelTitle">Three islands.<br>A sky full of stories.</h2><ul class="help-list"><li><span>↟</span><div><b>Hold anywhere in space to fly.</b>Drag left or right to steer. Drag up to climb, down to descend. Lift your thumb to hover. Hold BOOST for a burst of speed.</div></li><li><span>✧</span><div><b>Fly through the golden fireflies.</b>They power the village lanterns. Your compass points toward the next glow and tells you whether to climb or descend.</div></li><li><span>◎</span><div><b>Hover in the lantern rings.</b>With enough fireflies aboard, stop inside a golden ring above a landmark. The village lantern lights itself.</div></li><li><span>✦</span><div><b>Explore above and below.</b>Five purple memories wait around the coast and beneath the floating island. Find them all for three stars. Your ship gently avoids solid ground.</div></li><li><span>❋</span><div><b>Two new islands are waiting.</b>Choose a destination on the map. Gather Moonbloom’s three dew seeds to open its giant flower. Fly through Sunspire’s three star rings to wake the observatory. Visit in any order.</div></li></ul><p class="fine">${touch ? 'HOLD TO FLY · RELEASE TO HOVER.' : 'W/S OR ↑/↓ FLY · A/D OR ←/→ TURN · Q/E DESCEND/CLIMB · SHIFT BOOST · P/ESC PAUSE.'}<br>USE THE MAP TO FIND YOUR WAY. NO LIVES. NO TIMERS.</p>${button('helpBack', 'READY TO FLY →', true)}`);
}
function showPause() {
  showPanel('pause', `<span class="eyebrow">THE FIREFLIES CAN WAIT</span><h2 id="panelTitle">A little pause.</h2><p>${state.lit.length} of 5 village lanterns are glowing.<br>${storageAvailable ? 'Your flight and discoveries are saved on this device.' : 'Device storage is unavailable. Keep this page open to continue your journey.'}</p>${button('resume', 'BACK TO THE VALE →', true, contextLost)}${button('map', 'FLIGHT MAP')}${button('help', 'HOW TO PLAY')}${button('restart', 'BEGIN A FRESH FLIGHT')}<a class="action text-button" href="./">← ALL GAMES</a>`);
}
function showMap() {
  panelReturn = playing() || state.mode === 'paused' ? 'pause' : panelKind || 'intro';
  if (playing()) { game.pause(); changed(); }
  const expedition = state.expedition;
  const scale = Math.min(2.35, 138 / Math.max(56, Math.abs(state.player.x)), 99 / Math.max(45, Math.abs(state.player.z + 13)));
  const mapPoint = p => ({ x: 160 + p.x * scale, y: 110 + (p.z + 13) * scale });
  const player = mapPoint(state.player), vale = mapPoint({ x: 0, z: 0 });
  const islandDrawings = world.satellites.map(island => {
    const p = mapPoint(island.center), awake = expedition.awakened.includes(island.id);
    const marks = island.nodes.map((node, index) => { const n = mapPoint(node); return `<circle cx="${n.x}" cy="${n.y}" r="3" fill="${expedition.collected.includes(`${island.id}:${index}`) ? '#ffdb93' : '#edf0ff'}"/>`; }).join('');
    return `<path d="M${vale.x},${vale.y}L${p.x},${p.y}" stroke="#b5b9de55" stroke-dasharray="3 5"/><ellipse cx="${p.x}" cy="${p.y}" rx="${island.rx * scale}" ry="${island.rz * scale}" fill="${island.color}" opacity=".65" stroke="${awake ? '#ffe1a1' : '#d2d7ff'}" stroke-width="${awake ? 3 : 1}"/>${marks}<text x="${p.x}" y="${p.y - island.rz * scale - 9}" text-anchor="middle" fill="#f7eccf" font-family="Arial" font-size="9">${island.id === 'moonbloom' ? 'MOONBLOOM' : 'SUNSPIRE'}</text>`;
  }).join('');
  const markers = world.beacons.map(beacon => { const p = mapPoint(beacon); return `<circle cx="${p.x}" cy="${p.y}" r="2.5" fill="${state.lit.includes(beacon.id) ? '#ffdc8e' : '#f2eee5'}"/>`; }).join('');
  const cards = [{ id: 'vale', name: 'Lantern Vale', color: '#a8c98f', mission: 'Gather fireflies and hover in five lantern rings.', status: `${state.lit.length} / 5 lanterns · ${state.secrets.length} / 5 memories` }, ...world.satellites.map(island => {
    const count = expedition.collected.filter(id => id.startsWith(`${island.id}:`)).length, awake = expedition.awakened.includes(island.id);
    return { ...island, mission: awake ? island.reward : island.mission, status: awake ? 'AWAKENED · STORY DISCOVERED' : `${count} / 3 ${island.id === 'moonbloom' ? 'dew seeds' : 'star rings'}${expedition.visited.includes(island.id) ? ' · DISCOVERED' : ' · UNEXPLORED'}` };
  })].map(island => `<button class="island-card${expedition.destination === island.id ? ' selected' : ''}" data-destination="${island.id}" style="--island-color:${island.color}"><span class="island-icon" aria-hidden="true">${island.id === 'vale' ? '✧' : island.id === 'moonbloom' ? '❋' : '☼'}</span><span><strong>${island.name}</strong><small>${island.status}</small><span>${island.mission}</span></span><b aria-hidden="true">↗</b></button>`).join('');
  showPanel('map', `<span class="eyebrow">YOUR FLIGHT CHART & DISCOVERY JOURNAL</span><h2 id="panelTitle">Where next, pilot?</h2><div class="expedition-map-layout"><div><svg class="village-map" viewBox="0 0 320 230" role="img" aria-label="Flight chart with Lantern Vale, Moonbloom Sanctuary and Sunspire Observatory. Your ship is the white arrow.">${islandDrawings}<ellipse cx="${vale.x}" cy="${vale.y}" rx="${17.4 * scale}" ry="${12.7 * scale}" fill="#93b89c" stroke="#e2cc9c" stroke-width="2"/>${markers}<text x="${vale.x}" y="${vale.y + 12.7 * scale + 13}" text-anchor="middle" fill="#f7eccf" font-family="Arial" font-size="9">LANTERN VALE</text><path d="M0,8 L-5,-5 L0,-2 L5,-5Z" fill="#fff9e8" stroke="#244b61" stroke-width="1.5" transform="translate(${player.x},${player.y}) rotate(${-state.player.heading * 180 / Math.PI})"/></svg><p class="fine">TAP AN ISLAND TO SET YOUR COMPASS.<br>FLY THERE YOURSELF · EXPLORE IN ANY ORDER.</p></div><div class="island-cards">${cards}</div></div>${button('mapBack', 'BACK TO MY FLIGHT →', true)}`);
}
function chooseDestination(id) {
  if (!game.setDestination(id) || contextLost) return;
  if (state.mode === 'paused') game.resume();
  else if (state.mode === 'won') game.explore();
  lastMode = 'paused'; lastFrame = performance.now(); changed(); save();
  toast(`COURSE SET · ${id === 'vale' ? 'LANTERN VALE' : world.satellites.find(island => island.id === id).name.toUpperCase()}`, 2);
}
function showResult() {
  showPanel('won', `<div class="result-layout"><div><div class="result-stars" aria-label="${state.stars} stars">${'★'.repeat(state.stars)}${'☆'.repeat(3 - state.stars)}</div><span class="eyebrow">FIVE LANTERNS. ONE HAPPY LITTLE VILLAGE.</span><h2 id="panelTitle">You brought<br><em>the evening home.</em></h2><p>The vale is glowing again. Every little light has a story, and you’re part of this one now.</p></div><div><div class="result-stats"><div><strong>5 / 5</strong><span>LANTERNS</span></div><div><strong>${state.secrets.length} / 5</strong><span>MEMORIES</span></div></div>${button('explore', state.secrets.length < 5 ? 'FIND THE HIDDEN MEMORIES →' : 'EXPLORE THE OTHER ISLANDS →', true)}${button('replay', 'BEGIN A NEW FLIGHT')}<a class="action text-button" href="./">← ALL GAMES</a><p class="fine">${state.stars < 3 ? 'FIND ALL FIVE MEMORIES FOR THREE STARS.<br>' : ''}${storageAvailable && recordsAvailable ? 'YOUR JOURNEY IS SAVED ON THIS DEVICE' : 'DEVICE STORAGE UNAVAILABLE'}</p></div></div>`);
}
function showRestoring() {
  showPanel('restoring', `<span class="eyebrow">HOLD ON TO THAT LITTLE LIGHT</span><h2 id="panelTitle">The picture is returning.</h2><p>Your ship and discoveries are safe here.</p>${button('waiting', 'RESTORING THE VALE…', true, true)}`);
}
function toast(message, seconds = 2.2) {
  $('toast').textContent = message; $('toast').hidden = false; toastUntil = performance.now() + seconds * 1000;
}
function refreshHUD() {
  const guide = state.guide, expedition = state.expedition;
  const island = world.satellites.find(item => item.id === guide?.island || item.id === guide?.id);
  $('expeditionValue').textContent = `${expedition.awakened.length} / 2`;
  $('litValue').innerHTML = `${state.lit.length} <small>/ 5</small>`;
  $('chargeValue').textContent = state.charge; $('memoryValue').textContent = `${state.secrets.length} / 5`;
  $('objectiveLabel').textContent = island ? island.name.toUpperCase() : state.lit.length === 5 ? state.secrets.length === 5 ? 'THE SKY IS YOURS' : 'DISCOVER THE HIDDEN MEMORIES' : 'BRING THE VILLAGE TO LIFE';
  $('objectiveTitle').textContent = guide?.instruction || (guide?.kind === 'seed' ? `Gather the dew seeds · ${guide.count} / ${guide.total}` : guide?.kind === 'signal' ? `Align the star rings · ${guide.count} / ${guide.total}` : guide?.kind === 'island' ? `Explore ${guide.name}.` : guide?.kind === 'mote' ? `Gather ${guide.needed} more firefl${guide.needed === 1 ? 'y' : 'ies'}.` : guide?.kind === 'beacon' ? `Light ${guide.name}.` : guide?.kind === 'secret' ? guide.name : 'Fly wherever curiosity leads.');
  $('pauseButton').disabled = !playing() || contextLost;
  $('mapButton').disabled = state.mode === 'ready' || contextLost;
  $('boostButton').disabled = !playing() || contextLost;
  $('controlTitle').textContent = pointer !== null || keys.size || boostPointer !== null ? 'RELEASE TO HOVER.' : touch ? 'HOLD ANYWHERE TO FLY.' : 'W/S FLY · A/D TURN · Q/E ALTITUDE';
  $('controlText').textContent = state.channel.beacon !== null ? 'Hover in the ring. Let the lantern glow.' : touch ? 'Drag ↔ to turn · ↕ to climb or descend.' : 'Shift to boost · Release to hover · P to pause.';
  $('lighting').hidden = state.channel.beacon === null;
  $('lightingFill').style.width = `${state.channel.progress * 100}%`;
  const target = guide || { x: 0, y: 8, z: 0, name: 'Lantern Vale' };
  const dx = target.x - state.player.x, dz = target.z - state.player.z, dy = target.y - state.player.y;
  const bearing = Math.atan2(dx, dz), relative = Math.hypot(dx, dz) < 1.5 ? 0 : Math.atan2(Math.sin(state.player.heading - bearing), Math.cos(state.player.heading - bearing));
  $('navArrow').style.transform = `rotate(${relative}rad)`;
  $('navDistance').textContent = `${Math.round(Math.hypot(dx, dy, dz))} m`;
  $('navAltitude').textContent = dy > 1.7 ? 'CLIMB ↑' : dy < -1.7 ? 'DESCEND ↓' : 'LEVEL';
  $('navLabel').textContent = guide?.viaCoast || guide?.viaRoute ? 'SAFE ROUTE' : guide?.kind === 'seed' ? 'DEW SEED' : guide?.kind === 'signal' ? 'STAR RING' : guide?.kind === 'mote' ? 'FIREFLY' : guide?.kind === 'secret' ? 'MEMORY' : guide?.kind === 'beacon' ? 'LANTERN' : 'ISLAND';
  $('flightNav').hidden = state.mode === 'ready' || state.mode === 'won';
}
function handleMode() {
  if (lastMode === state.mode) return;
  lastMode = state.mode; dirty = true;
  if (playing()) hidePanel();
  else if (state.mode === 'paused') { clearInput(); save(); showPause(); }
  else if (state.mode === 'won') { resultClickGuardUntil = performance.now() + 500; clearInput(); bankRecords(); save(); showResult(); }
}
function changed() {
  let checkpoint = false;
  for (const event of state.events.splice(0)) {
    if (event.type === 'mote') { tone(490 + event.charge % 6 * 65, 0, 0.14); checkpoint = true; }
    if (event.type === 'light') { chime([392, 494, 587, 784]); toast(`${event.name.toUpperCase()} IS GLOWING`); checkpoint = true; }
    if (event.type === 'secret') { chime([659, 784, 988]); toast(`A MEMORY FOUND · ${event.name}`); bankRecords(); checkpoint = true; }
    if (event.type === 'island') { toast(`DISCOVERED · ${event.name.toUpperCase()}`, 3); chime([440, 554, 659]); checkpoint = true; }
    if (event.type === 'seed' || event.type === 'signal') { toast(`${event.type === 'seed' ? 'DEW SEED' : 'STAR RING'} · ${event.count} / ${event.total}`); chime([659, 880]); checkpoint = true; }
    if (event.type === 'island-awakened') { toast(`${event.name.toUpperCase()} AWAKENS · STORY SAVED IN YOUR MAP`, 5); chime([440, 554, 659, 880, 1109]); checkpoint = true; }
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
  $('panelContent').addEventListener('pointerdown', () => { resultClickGuardUntil = 0; });
  $('panelContent').addEventListener('click', event => { if (event.detail && performance.now() < resultClickGuardUntil) return; const target = event.target.closest('button'); if (target?.dataset.destination) { chooseDestination(target.dataset.destination); return; } if (target?.dataset.action) doAction(target.dataset.action); });
  $('soundButton').addEventListener('click', () => { profile.sound = !profile.sound; recordsAvailable = saveProfile(); unlockAudio(); soundUI(); if (profile.sound) chime([440, 659]); });
  $('helpButton').addEventListener('click', showHelp);
  $('mapButton').addEventListener('click', showMap);
  $('pauseButton').addEventListener('click', () => { game.pause(); changed(); });
  const stage = $('gameStage');
  stage.addEventListener('pointerdown', event => {
    if (event.target.closest('button') || !playing() || contextLost || pointer !== null || event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.pointerType === 'mouse') event.preventDefault();
    unlockAudio(); keys.clear(); pointer = event.pointerId; anchorX = event.clientX; anchorY = event.clientY; stickX = stickY = 0;
    stage.setPointerCapture(pointer); updateStick(event); $('joystick').hidden = false; refreshHUD(); dirty = true;
  });
  stage.addEventListener('pointermove', event => { if (event.pointerId === pointer && playing()) updateStick(event); });
  stage.addEventListener('pointerup', event => { if (event.pointerId === pointer) { clearSteering(false); refreshHUD(); save(); } });
  for (const type of ['pointercancel', 'lostpointercapture']) stage.addEventListener(type, event => { if (event.pointerId === pointer) { clearSteering(); refreshHUD(); save(); } });
  const boost = $('boostButton');
  boost.addEventListener('pointerdown', event => {
    if (!playing() || contextLost || boostPointer !== null || event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); unlockAudio();
    boostPointer = event.pointerId; boost.setPointerCapture(boostPointer); boost.classList.add('engaged'); refreshHUD();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) boost.addEventListener(type, event => {
    if (event.pointerId === boostPointer) { clearBoost(); refreshHUD(); save(); }
  });
  boost.addEventListener('keydown', event => {
    if (['Space', 'Enter'].includes(event.code)) { event.preventDefault(); keys.add('ShiftLeft'); boost.classList.add('engaged'); }
  });
  boost.addEventListener('keyup', event => {
    if (['Space', 'Enter'].includes(event.code)) { event.preventDefault(); keys.delete('ShiftLeft'); boost.classList.remove('engaged'); refreshHUD(); save(); }
  });
  boost.addEventListener('blur', () => { keys.delete('ShiftLeft'); clearBoost(); });
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
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'ControlLeft', 'ShiftLeft', 'ShiftRight'].includes(event.code)) { event.preventDefault(); keys.add(event.code); refreshHUD(); dirty = true; }
  });
  document.addEventListener('keyup', event => { if (keys.delete(event.code)) { refreshHUD(); save(); } });
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
  const response = await fetch('./assets/lantern-world.json?v4');
  if (!response.ok) throw Error('The village map could not be loaded.');
  world = await response.json(); world.satellites ||= []; targets = flightTargets(world); game = createLantern({ world }); state = game.state;
  view = await createLanternScene($('gameStage'), world, {
    resized: () => { clearInput(); dirty = true; },
    lost: () => { contextLost = true; suspend(); showRestoring(); refreshHUD(); },
    restored: () => { contextLost = false; dirty = true; if (state.mode === 'paused') showPause(); else if (state.mode === 'won') showResult(); else showIntro(); refreshHUD(); },
    progress: percent => { $('loadingDetail').textContent = `Gathering the village… ${Math.round(percent * 100)}%`; },
  });
  bindInputs(); soundUI(); refreshHUD(); showIntro(); $('loading').hidden = true;
  if (query.get('continue') === '1' && savedRun()) continueRun();
  if (query.has('debug')) window.__lantern = {
    game, world, targets, view, start, save, continueRun, refresh: changed,
    get control() { return control(); },
    advance(seconds, input = control()) { game.advance(seconds, input); changed(); },
    setRealtime(value) { realtime = !!value; lastFrame = performance.now(); dirty = true; },
    get profile() { return JSON.parse(JSON.stringify(profile)); }, get renderCount() { return renderCount; },
  };
  document.body.dataset.ready = 'true'; requestAnimationFrame(frame);
} catch (error) {
  console.error(error);
  $('loading').innerHTML = '<span class="loading-star" aria-hidden="true">✦</span><strong>The vale needs a moment.</strong><span>Reload to try again, or open this page in a browser with WebGL.</span><a href="./">← Back to games</a>';
}
