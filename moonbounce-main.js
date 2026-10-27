import { createMoonbounce, parseMoonbounceSave, orbitCapacity, WAVES } from './moonbounce-game.js';
import { createMoonbounceScene } from './moonbounce-scene.js';
import { readGameSave, writeGameSave, removeGameSave } from './save-store.js?v3';

const $ = id => document.getElementById(id);
const query = new URLSearchParams(location.search);
const touch = matchMedia('(pointer: coarse)').matches;
const PROFILE_KEY = 'games:moonbounce:progress';
let profile = { best: 0, furthest: 1, victories: 0, sound: false };
try {
  const stored = JSON.parse(localStorage.getItem(PROFILE_KEY));
  if (stored?.version === 1) {
    if (Number.isFinite(stored.best) && stored.best >= 0 && stored.best <= 100000000) profile.best = stored.best;
    if (Number.isInteger(stored.furthest) && stored.furthest >= 1 && stored.furthest <= 5) profile.furthest = stored.furthest;
    if (Number.isInteger(stored.victories) && stored.victories >= 0 && stored.victories <= 100000) profile.victories = stored.victories;
    profile.sound = stored.sound === true;
  }
} catch { /* A run is still playable if browser storage is blocked. */ }

const game = createMoonbounce();
const s = game.state;
let view, contextLost = false, dirty = true, panelKind = '', lastMode = 'ready', helpReturn = 'intro';
let lastFrame = 0, lastUI = 0, lastSavedTick = 0, lastFeedback = 0, toastUntil = 0, renderCount = 0;
let realtime = true, restoring = false, storageAvailable = true, recordsAvailable = true, previousFocus, audio, activeVoices = 0;
let pointer = null, anchorX = 0, anchorY = 0, moveX = 0, moveZ = 0;
const keys = new Set();

function saveProfile() { try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ version: 1, ...profile })); return true; } catch { return false; } }
function savedRun() { return parseMoonbounceSave(readGameSave('moonbounce')?.data); }
function saveRun() {
  const data = game.snapshot();
  if (!data) return false;
  const ok = writeGameSave('moonbounce', data);
  storageAvailable = ok; lastSavedTick = s.ticks;
  $('saveStatus').textContent = ok ? 'PROGRESS SAVED ON THIS DEVICE' : 'DEVICE STORAGE UNAVAILABLE · YOU CAN STILL PLAY';
  $('saveStatus').classList.toggle('failed', !ok); return ok;
}
function unlockAudio() {
  if (!profile.sound) return;
  try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume().catch(() => {}); } catch { /* Sound is optional. */ }
}
function tone(frequency, duration = 0.13, volume = 0.026, delay = 0, type = 'sine') {
  if (!profile.sound || !audio || audio.state !== 'running' || activeVoices >= 12) return;
  const at = audio.currentTime + delay, oscillator = audio.createOscillator(), gain = audio.createGain();
  activeVoices++; oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, at);
  gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(volume, at + 0.01); gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(at); oscillator.stop(at + duration + 0.02);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); activeVoices--; };
}
function chime(notes, duration = 0.22) { notes.forEach((note, index) => tone(note, duration, 0.025, index * 0.065)); }
function soundUI() {
  $('soundButton').setAttribute('aria-pressed', String(profile.sound));
  $('soundButton').setAttribute('aria-label', profile.sound ? 'Turn sound off' : 'Turn sound on');
  $('soundButton').innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z${profile.sound ? 'm4 3c3 2 3 6 0 8m3-11c5 4 5 10 0 14' : 'm4 4 6 6m0-6-6 6'}"/></svg>`;
}
function clearInput() {
  keys.clear(); moveX = moveZ = 0;
  const old = pointer; pointer = null;
  if (old !== null && $('gameStage').hasPointerCapture(old)) $('gameStage').releasePointerCapture(old);
  $('touchStick').hidden = true; $('touchKnob').style.transform = 'translate(-50%, -50%)';
}
function showPanel(kind, content) {
  clearInput(); panelKind = kind; $('gamePanel').dataset.kind = kind;
  if ($('modalLayer').hidden) previousFocus = document.activeElement;
  $('panelContent').innerHTML = content; $('modalLayer').hidden = false;
  $('controls').inert = true; $('hud').inert = true; $('gameStage').inert = true;
  $('gamePanel').scrollTop = 0; $('gamePanel').focus({ preventScroll: true }); dirty = true;
}
function hidePanel() {
  panelKind = ''; $('modalLayer').hidden = true;
  $('controls').inert = false; $('hud').inert = false; $('gameStage').inert = false;
  previousFocus?.blur?.(); dirty = true;
}
const button = (action, label, style = 'secondary', disabled = false) => `<button class="${style}" data-action="${action}"${disabled ? ' disabled' : ''}>${label}</button>`;
function showIntro() {
  const saved = savedRun();
  showPanel('intro', `<div class="intro-layout"><div class="intro-copy"><div class="intro-head"><span class="eyebrow">A TINY GALAXY IN YOUR POCKET</span><h1 id="panelTitle">MOON<br><span>BOUNCE!</span></h1><span class="intro-doodle" aria-hidden="true">✦</span></div><p class="lede">A little star. A lot of moons.<br>One very bouncy space adventure.</p><div class="how-row"><div class="how-step"><span>01 / GATHER</span><strong>DRAG TO MOVE</strong><small>Pick up moons as you go.</small></div><div class="how-step"><span>02 / BOUNCE</span><strong>LIFT TO LAUNCH!</strong><small>Send them flying into trouble.</small></div></div></div><div class="intro-actions">${saved ? button('continue', `CONTINUE · WAVE ${saved.wave} →`, 'primary') + button('start', 'START A NEW GAME') : button('start', 'LET’S BOUNCE! →', 'primary')}${button('help', 'HOW TO PLAY', 'text-button')}<p class="fine-print">${profile.best ? `BEST: ${Math.round(profile.best).toLocaleString()} POINTS · ` : ''}ONE THUMB · FIVE WAVES · AUTOSAVE</p></div></div>`);
}
function showHelp() {
  helpReturn = s.mode === 'playing' || s.mode === 'paused' ? 'pause' : panelKind || s.mode;
  if (s.mode === 'playing') { game.pause(); changed(); }
  showPanel('help', `<span class="eyebrow">ONE LITTLE GESTURE</span><h2 id="panelTitle">Go on, give it a whirl.</h2><ul class="help-list"><li><span aria-hidden="true">☝</span><span><b>Drag anywhere to move.</b>Your star gathers nearby moons into a colorful little orbit.</span></li><li><span aria-hidden="true">↗</span><span><b>Lift your finger to launch!</b>Your moons bounce around and find space creatures. You can tap LAUNCH too.</span></li><li><span aria-hidden="true">✦</span><span><b>Six moons make a Moonstorm!</b>Launch six together for extra power and an extra bounce. Creatures leave more moons behind, and chains earn extra points.</span></li><li><span aria-hidden="true">♥</span><span><b>Keep your star safe.</b>Move away from creatures and their shots. Pick a new power after each wave and take on the big boss in wave five.</span></li></ul><div class="key-help">${touch ? 'Play with one thumb: touch the space, drag to move, and lift to launch.' : 'Mouse: drag to move, release to launch. Keyboard: WASD or arrow keys to move; Space to launch; P or Esc to pause.'}</div>${button('helpBack', 'GOT IT! →', 'primary')}`);
}
function showPause() {
  const message = contextLost ? 'Restoring the picture. Your run is safe here.' : storageAvailable ? 'Your little galaxy is saved on this device.' : 'Device storage is unavailable. Keep this page open to retain your run.';
  showPanel('pause', `<span class="eyebrow">A LITTLE BREATHER</span><h2 id="panelTitle">Space can wait.</h2><p>Wave ${s.wave} / 5 · ${Math.round(s.score).toLocaleString()} points.<br>${message}</p>${button('resume', contextLost ? 'RESTORING…' : 'KEEP BOUNCING! →', 'primary', contextLost)}${button('help', 'HOW TO PLAY')}${button('restart', 'START OVER') }<a class="text-button" href="./">← ALL GAMES</a>`);
}
function showUpgrade() {
  const icons = { capacity: '☼', power: '✦', bounces: '↗', speed: 'ϟ', magnet: '⊕', heart: '♥' };
  showPanel('upgrade', `<span class="eyebrow">WAVE ${s.wave} COMPLETE · NICE BOUNCING!</span><h2 id="panelTitle">Pick a little power.</h2><p>Each one stays with you for the rest of this run.</p><div class="choice-list">${s.choices.map(choice => `<button class="choice" data-upgrade="${choice.id}"><span class="choice-icon" aria-hidden="true">${icons[choice.id] || '✦'}</span><span><strong>${choice.name}</strong><small>${choice.description}</small></span><span aria-hidden="true">↗</span></button>`).join('')}</div><p class="fine-print">TAKE YOUR TIME · YOUR GAME IS SAVED</p>`);
}
function showResult(won) {
  showPanel(won ? 'won' : 'lost', `<div class="result-symbol" aria-hidden="true">${won ? '✦' : '☄'}</div><span class="eyebrow">${won ? 'FIVE WAVES · ONE HAPPY GALAXY' : `YOU MADE IT TO WAVE ${s.wave}`}</span><h2 id="panelTitle">${won ? 'What a moon party!' : 'One more orbit?'}</h2><p>${won ? 'You bounced all the way through the galaxy. That was a stellar little adventure.' : 'Your star ran out of hearts, but there are plenty more moons to gather.'}</p><div class="result-stats"><div><strong>${Math.round(s.score).toLocaleString()}</strong><span>POINTS</span></div><div><strong>${s.kills}</strong><span>BOUNCED</span></div><div><strong>${s.bestCombo}</strong><span>BEST CHAIN</span></div></div>${button('restart', 'BOUNCE AGAIN! →', 'primary')}<a class="text-button" href="./">← ALL GAMES</a><p class="fine-print">BEST SCORE ${Math.round(profile.best).toLocaleString()} · ${recordsAvailable ? 'SAVED ON THIS DEVICE' : 'STORAGE UNAVAILABLE'}</p>`);
}
function toast(message, seconds = 2.2) {
  $('toast').textContent = message; $('toast').hidden = false;
  toastUntil = performance.now() + seconds * 1000;
}
function handleMode() {
  if (s.mode === lastMode) return;
  lastMode = s.mode; clearInput(); dirty = true;
  if (s.mode === 'playing') { hidePanel(); lastFrame = performance.now(); }
  if (s.mode === 'paused') { saveRun(); showPause(); }
  if (s.mode === 'upgrade') { saveRun(); showUpgrade(); chime([392, 494, 587]); }
  if (s.mode === 'won' || s.mode === 'lost') {
    profile.best = Math.max(profile.best, Math.round(s.score)); profile.furthest = Math.max(profile.furthest, s.wave);
    if (s.mode === 'won' && !restoring) profile.victories++;
    recordsAvailable = saveProfile();
    if (s.mode === 'won') { saveRun(); chime([392, 494, 587, 784], 0.35); }
    else { removeGameSave('moonbounce'); tone(155, 0.35, 0.035, 0, 'triangle'); }
    showResult(s.mode === 'won');
  }
}
function refreshHUD() {
  const wave = WAVES[s.wave - 1] || WAVES[0], goal = wave.goal || 1, boss = s.enemies.find(enemy => enemy.type === 'boss');
  const active = s.mode === 'playing' && !contextLost;
  $('waveLabel').innerHTML = `WAVE ${s.wave} <small>/ ${WAVES.length}</small>`;
  $('goalLabel').textContent = s.bossSpawned ? 'BOSS TIME!' : `${Math.min(s.waveKills, goal)} / ${goal} BOUNCED`;
  $('goalFill').style.width = `${Math.min(1, s.waveKills / goal) * 100}%`;
  $('waveName').textContent = wave.name.toUpperCase();
  $('healthValue').textContent = Math.ceil(s.player.hp);
  $('healthFill').style.width = `${Math.max(0, s.player.hp / s.player.maxHp) * 100}%`;
  $('scoreValue').textContent = `${Math.round(s.score).toLocaleString()} POINTS`;
  $('moonCount').textContent = s.orbits.length;
  $('moonCapacity').textContent = ` / ${orbitCapacity(s.upgrades)}`;
  $('launchButton').disabled = !active || s.orbits.length === 0;
  $('pauseButton').disabled = !active;
  $('bossMeter').hidden = !boss;
  $('stageNote').hidden = !!boss;
  if (boss) $('bossFill').style.width = `${Math.max(0, boss.hp / boss.maxHp) * 100}%`;
  const empty = !s.orbits.length, storm = s.orbits.length >= 6;
  $('noteText').textContent = empty ? 'GATHER MOONS TO RELOAD' : storm ? 'MOONSTORM READY · LIFT TO LAUNCH!' : s.bursts === 0 ? 'DRAG TO MOVE · LIFT TO LAUNCH' : s.bursts < 3 ? 'LIFT TO LAUNCH YOUR MOONS!' : 'GATHER SIX FOR A MOONSTORM!';
  $('controlTitle').textContent = empty ? 'GATHER MOONS' : storm ? 'MOONSTORM READY!' : 'DRAG TO MOVE';
  $('controlText').textContent = empty ? 'Pick up the little sparkles.' : storm ? 'Lift for a stronger launch!' : touch ? 'Lift your finger to launch!' : 'Release mouse or press Space.';
  $('launchButton').classList.toggle('storm', storm);
  document.querySelector('.orbit-info').classList.toggle('charged', storm);
  document.querySelector('.game-app').classList.toggle('hurt', s.player.invulnerable > 0.5);
}
function changed() {
  for (const event of s.events.splice(0)) {
    if (event.type === 'wave') { if (event.wave > 1) toast(`WAVE ${event.wave} · LET’S GO!`, 2.5); chime([330, 440, 550]); }
    if (event.type === 'collect') tone(600 + Math.min(5, s.orbits.length) * 65, 0.09, 0.014);
    if (event.type === 'burst') {
      if (event.storm) { toast('MOONSTORM! ✦', 2); chime([392, 523, 659, 784], 0.25); }
      else { if (s.bursts === 1) toast('HERE COME THE MOONS!', 1.5); tone(260, 0.18, 0.03, 0, 'triangle'); tone(390, 0.16, 0.02, 0.04); }
    }
    if (event.type === 'hit') tone(470, 0.08, 0.012);
    if (event.type === 'kill') {
      tone(510 + Math.min(5, event.combo || 0) * 45, 0.1, 0.02);
      if (event.combo >= 3 && performance.now() - lastFeedback > 800) { toast(`${event.combo}× MOON COMBO!`, 1.6); lastFeedback = performance.now(); }
    }
    if (event.type === 'chain' && event.count >= 2) { toast('MOON PARTY! ✦', 1.6); chime([523, 659, 784], 0.15); }
    if (event.type === 'hurt') tone(140, 0.2, 0.04, 0, 'triangle');
    if (event.type === 'boss') { toast('BIG BOUNCE INCOMING!', 2.8); chime([196, 247, 330], 0.3); }
  }
  handleMode(); refreshHUD(); dirty = true;
}
function nextSeed() {
  const fixed = query.has('debug') ? query.get('seed') : null;
  if (fixed && /^\d{1,10}$/.test(fixed) && Number(fixed) <= 0xffffffff) return Number(fixed);
  try { const value = new Uint32Array(1); crypto.getRandomValues(value); return value[0]; }
  catch { return Math.floor(Math.random() * 0x100000000); }
}
function start() {
  if (contextLost) return;
  unlockAudio(); game.start(nextSeed()); lastMode = 'ready'; lastSavedTick = 0; lastFrame = performance.now();
  changed(); saveRun();
}
function continueRun() {
  const saved = savedRun();
  if (!saved || contextLost || !game.restore(saved)) { showIntro(); return false; }
  unlockAudio(); if (s.mode === 'paused') game.resume();
  lastMode = 'ready'; lastFrame = performance.now(); restoring = true;
  try { changed(); } finally { restoring = false; }
  return true;
}
function doAction(action) {
  unlockAudio();
  if (action === 'start' || action === 'restart') start();
  if (action === 'continue') continueRun();
  if (action === 'resume' && !contextLost) { game.resume(); changed(); }
  if (action === 'help') showHelp();
  if (action === 'helpBack') {
    if (helpReturn === 'pause') showPause();
    else if (helpReturn === 'upgrade') showUpgrade();
    else if (helpReturn === 'won' || helpReturn === 'lost') showResult(helpReturn === 'won');
    else showIntro();
  }
}
$('panelContent').addEventListener('click', event => {
  const target = event.target.closest('button'); if (!target) return;
  if (target.dataset.action) doAction(target.dataset.action);
  if (target.dataset.upgrade && s.mode === 'upgrade') { unlockAudio(); game.chooseUpgrade(target.dataset.upgrade); changed(); saveRun(); }
});
$('soundButton').addEventListener('click', () => { profile.sound = !profile.sound; saveProfile(); unlockAudio(); soundUI(); if (profile.sound) chime([440, 554], 0.16); });
$('helpButton').addEventListener('click', showHelp);
$('pauseButton').addEventListener('click', () => { game.pause(); changed(); });
$('launchButton').addEventListener('click', () => { unlockAudio(); game.burst(); changed(); });
function updateStick(event) {
  if (event.pointerId !== pointer) return;
  const rect = $('gameStage').getBoundingClientRect(), radius = 34;
  let dx = event.clientX - anchorX, dz = event.clientY - anchorY, length = Math.hypot(dx, dz);
  if (length > radius) { anchorX = event.clientX - dx / length * radius; anchorY = event.clientY - dz / length * radius; dx = event.clientX - anchorX; dz = event.clientY - anchorY; length = radius; }
  moveX = length < 4 ? 0 : dx / radius; moveZ = length < 4 ? 0 : dz / radius;
  $('touchStick').style.left = `${anchorX - rect.left}px`; $('touchStick').style.top = `${anchorY - rect.top}px`;
  $('touchKnob').style.transform = `translate(calc(-50% + ${moveX * radius}px), calc(-50% + ${moveZ * radius}px))`;
}
$('gameStage').addEventListener('pointerdown', event => {
  if (s.mode !== 'playing' || pointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
  event.preventDefault(); unlockAudio(); pointer = event.pointerId; anchorX = event.clientX; anchorY = event.clientY; moveX = moveZ = 0;
  $('gameStage').setPointerCapture(pointer); $('touchStick').hidden = false; updateStick(event);
});
$('gameStage').addEventListener('pointermove', updateStick);
function releaseStick(event, launch) {
  if (event.pointerId !== pointer) return;
  pointer = null; moveX = moveZ = 0; $('touchStick').hidden = true;
  $('touchKnob').style.transform = 'translate(-50%, -50%)';
  if (launch && s.mode === 'playing') { unlockAudio(); game.burst(); changed(); }
}
$('gameStage').addEventListener('pointerup', event => releaseStick(event, true));
for (const type of ['pointercancel', 'lostpointercapture']) $('gameStage').addEventListener(type, event => releaseStick(event, false));
document.addEventListener('keydown', event => {
  const key = event.code;
  if (key === 'Tab' && !$('modalLayer').hidden) {
    const items = [...$('gamePanel').querySelectorAll('button:not(:disabled), a[href]')], first = items[0], last = items.at(-1);
    if (!items.length) return;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === $('gamePanel'))) { last.focus(); event.preventDefault(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === $('gamePanel'))) { first.focus(); event.preventDefault(); }
    return;
  }
  if ((key === 'Escape' || key === 'KeyP') && !event.repeat) {
    event.preventDefault();
    if (panelKind === 'help') doAction('helpBack');
    else if (s.mode === 'playing') { game.pause(); changed(); }
    else if (panelKind === 'pause' && !contextLost) { game.resume(); changed(); }
    return;
  }
  if (s.mode !== 'playing' || !$('modalLayer').hidden) return;
  if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(key)) return;
  event.preventDefault(); unlockAudio();
  if (key === 'Space') { if (!event.repeat) { game.burst(); changed(); } }
  else keys.add(key);
});
document.addEventListener('keyup', event => keys.delete(event.code));
function suspend() {
  clearInput();
  if (s.mode === 'playing') { game.pause(); changed(); }
  else if (['paused', 'upgrade', 'won'].includes(s.mode)) saveRun();
}
window.addEventListener('blur', suspend);
document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); else { lastFrame = performance.now(); dirty = true; } });
window.addEventListener('pagehide', suspend);
window.addEventListener('pageshow', () => { lastFrame = performance.now(); dirty = true; });
function input() {
  return { x: moveX + Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')), z: moveZ + Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp')) };
}
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden || contextLost || !view) { lastFrame = now; return; }
  if (now - lastFrame < (touch ? 1000 / 30 : 1000 / 60) - 1 && !dirty) return;
  const elapsed = Math.min(0.1, (now - (lastFrame || now)) / 1000); lastFrame = now;
  if (realtime && s.mode === 'playing') {
    game.advance(elapsed, input());
    if (s.events.length || s.mode !== lastMode) changed();
    else if (now - lastUI > 100) { refreshHUD(); lastUI = now; }
  }
  if (toastUntil && now >= toastUntil) { $('toast').hidden = true; toastUntil = 0; }
  if (dirty || (realtime && s.mode === 'playing')) { view.render(s, s.ticks / 60); renderCount++; dirty = false; }
  if (s.mode === 'playing' && s.ticks - lastSavedTick >= 300) saveRun();
}
try {
  view = createMoonbounceScene($('gameStage'), {
    resized: () => { clearInput(); dirty = true; },
    lost: () => { contextLost = true; suspend(); },
    restored: () => { contextLost = false; dirty = true; if (s.mode === 'paused') showPause(); refreshHUD(); toast('READY TO BOUNCE AGAIN!'); },
  });
  soundUI(); refreshHUD(); showIntro(); $('loading').hidden = true; document.body.dataset.ready = 'true';
  if (query.has('continue') && savedRun()) continueRun();
  if (query.has('debug')) window.__moonbounce = {
    game, view, start, save: saveRun, continueRun, refresh: changed,
    advance(seconds, control = {}) { game.advance(seconds, control); changed(); },
    setRealtime(value) { realtime = !!value; lastFrame = performance.now(); dirty = true; },
    get renderCount() { return renderCount; }, get input() { return input(); },
    get profile() { return JSON.parse(JSON.stringify(profile)); },
  };
  requestAnimationFrame(frame);
} catch (error) {
  console.error(error);
  $('loading').innerHTML = '<span class="loading-star">✦</span><strong>This little galaxy needs a browser with WebGL.</strong><span>Try reloading or opening this page in your regular browser.</span><a href="./">← Back to games</a>';
}
