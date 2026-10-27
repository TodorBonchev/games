import { createPondPost, parsePondPostSave, LEVELS } from './pondpost-game.js';
import { createPondPostScene } from './pondpost-scene.js';
import { readGameSave, writeGameSave } from './save-store.js?v5';

const $ = id => document.getElementById(id), query = new URLSearchParams(location.search);
const touch = matchMedia('(pointer: coarse)').matches, PROFILE_KEY = 'games:pondpost:progress';
const profile = { unlocked: 1, stars: Array(LEVELS.length).fill(0), bestScore: Array(LEVELS.length).fill(0), sound: false };
try {
  const data = JSON.parse(localStorage.getItem(PROFILE_KEY));
  if (data?.version === 1) {
    profile.sound = data.sound === true;
    for (let i = 0; i < LEVELS.length; i++) {
      if (Number.isInteger(data.stars?.[i]) && data.stars[i] >= 0 && data.stars[i] <= 3) profile.stars[i] = data.stars[i];
      if (Number.isInteger(data.bestScore?.[i]) && data.bestScore[i] >= 0 && data.bestScore[i] <= 1e9) profile.bestScore[i] = data.bestScore[i];
      if (profile.stars[i]) profile.unlocked = Math.min(LEVELS.length, i + 2);
    }
  }
} catch { /* Optional device storage must never prevent a delivery. */ }
const game = createPondPost(), s = game.state;
let view, contextLost = false, dirty = true, realtime = true, panelKind = '', helpReturn = 'intro', lastMode = 'ready';
let lastFrame = 0, lastUI = 0, lastSavedTick = 0, renderCount = 0, toastUntil = 0;
let pointer = null, anchorX = 0, anchorY = 0, pullDistance = 0, previewKey = '', previewCache = null;
let audio, activeVoices = 0, storageAvailable = true, recordsAvailable = true;
let selectedLevel = Math.floor(Math.max(1, Math.min(query.has('debug') ? LEVELS.length : profile.unlocked, Number(query.get('level')) || profile.unlocked)));
const activeModes = ['playing', 'aiming', 'flying', 'recovering'];
const button = (action, label, style = 'secondary', disabled = false) => `<button class="${style}" data-action="${action}"${disabled ? ' disabled' : ''}>${label}</button>`;

function saveProfile() { try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ version: 1, ...profile })); return true; } catch { return false; } }
function savedRun() { return parsePondPostSave(readGameSave('pondpost')?.data); }
function saveRun() {
  const data = game.snapshot(); if (!data) return false;
  storageAvailable = writeGameSave('pondpost', data); lastSavedTick = s.ticks;
  $('saveStatus').textContent = storageAvailable ? 'PROGRESS SAVED ON THIS DEVICE' : 'DEVICE STORAGE UNAVAILABLE · YOU CAN STILL PLAY';
  $('saveStatus').classList.toggle('failed', !storageAvailable); return storageAvailable;
}
function unlockAudio() {
  if (!profile.sound) return;
  try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume().catch(() => {}); } catch { /* Sound is optional. */ }
}
function tone(frequency, duration = .16, volume = .025, delay = 0, type = 'sine') {
  if (!profile.sound || !audio || audio.state !== 'running' || activeVoices >= 12) return;
  const oscillator = audio.createOscillator(), gain = audio.createGain(), at = audio.currentTime + delay;
  activeVoices++; oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, at);
  gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(volume, at + .01); gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
  oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(at); oscillator.stop(at + duration + .02);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); activeVoices--; };
}
function chime(notes) { notes.forEach((frequency, i) => tone(frequency, .25, .025, i * .07)); }
function soundUI() {
  $('soundButton').setAttribute('aria-pressed', String(profile.sound));
  $('soundButton').setAttribute('aria-label', profile.sound ? 'Turn sound off' : 'Turn sound on');
  $('soundButton').innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z${profile.sound ? 'm4 3c3 2 3 6 0 8m3-11c5 4 5 10 0 14' : 'm4 4 6 6m0-6-6 6'}"/></svg>`;
}
function clearInput(cancel = true) {
  const old = pointer; pointer = null; pullDistance = 0;
  if (old !== null && $('gameStage').hasPointerCapture(old)) $('gameStage').releasePointerCapture(old);
  $('aimGesture').hidden = true;
  if (cancel && s.mode === 'aiming') game.cancelAim();
  dirty = true;
}
function getPreview() {
  if (s.mode !== 'aiming') return null;
  const key = `${s.level}:${s.ticks}:${s.padId}:${s.aim.vx}:${s.aim.vy}`;
  if (key !== previewKey) { previewKey = key; previewCache = game.preview(); }
  return previewCache;
}
function showPanel(kind, content) {
  clearInput(); panelKind = kind; $('gamePanel').dataset.kind = kind; $('panelContent').innerHTML = content;
  $('modalLayer').hidden = false; $('hud').inert = true; $('controls').inert = true; $('gameStage').inert = true;
  $('gamePanel').scrollTop = 0; $('gamePanel').focus({ preventScroll: true }); dirty = true;
}
function hidePanel() { panelKind = ''; $('modalLayer').hidden = true; $('hud').inert = false; $('controls').inert = false; $('gameStage').inert = false; dirty = true; }
function showIntro() {
  const saved = savedRun(), totalStars = profile.stars.reduce((a, b) => a + b, 0);
  showPanel('intro', `<div class="intro-layout"><div><div class="intro-head"><span class="eyebrow">THE LITTLEST COURIER IN THE FOREST</span><h1 id="panelTitle">SPECIAL<br><span>DELIVERY!</span></h1><div class="mail-stamp" aria-hidden="true"><svg viewBox="0 0 28 24"><path d="M3 5h22v15H3zM3 5l11 9L25 5"/></svg></div></div><p class="lede">One frog. One important letter.<br>A very leafy way to get there.</p><div class="how-row"><div class="how-step"><span>01 / AIM</span><strong>PULL BACK</strong><small>Touch anywhere. Drag down to leap up.</small></div><div class="how-step"><span>02 / LEAP</span><strong>LET GO!</strong><small>Follow the arc to the next lily pad.</small></div></div></div><div>${saved ? button('continue', `CONTINUE · ROUTE ${String(saved.level).padStart(2, '0')} →`, 'primary') + button('start', `PLAY ROUTE ${String(selectedLevel).padStart(2, '0')}`) : button('start', 'OFF WE HOP! →', 'primary')}${button('levels', 'CHOOSE A ROUTE')}${button('help', 'HOW TO PLAY', 'text-button')}<p class="fine-print">ONE FINGER · FIVE ROUTES · UNLIMITED TRIES${totalStars ? `<br>${totalStars} / 15 STARS COLLECTED` : ''}</p></div></div>`);
}
function showHelp() {
  helpReturn = [...activeModes, 'paused'].includes(s.mode) ? 'pause' : panelKind || 'intro';
  if (activeModes.includes(s.mode)) { game.pause(); changed(); }
  showPanel('help', `<span class="eyebrow">FIRST-CLASS FROG, FIRST-CLASS HOPS</span><h2 id="panelTitle">Ready for lift-off?</h2><ul class="help-list"><li><span aria-hidden="true">↓</span><span><b>Pull back anywhere.</b>Drag down to jump up. Pull left to go right, or right to go left. A longer pull makes a bigger leap.</span></li><li><span aria-hidden="true">↗</span><span><b>Aim with the dotted arc.</b>The ring turns green on a new leaf, and gold for its center. A pale outline shows where a moving leaf will be. Release to jump.</span></li><li><span aria-hidden="true">✧</span><span><b>Take the scenic route.</b>Collect shiny stamps in the air. Land near the middle of new pads for perfect bonuses and a streak.</span></li><li><span aria-hidden="true">✉</span><span><b>Deliver the letter at the top.</b>A missed jump returns you to your safe pad. There are no lives or timers. Moving leaves and wind keep later routes lively.</span></li></ul><div class="key-help">${touch ? 'One finger is all you need. Aim at your own pace; the arc includes moving leaves and wind.' : 'Mouse: pull back, then release. Keyboard: Space to aim, arrows or WASD to adjust, Space / Enter to leap. P or Esc pauses.'}<br>Three stars: collect at least half the stamps, make two perfect landings, and miss at most once.</div>${button('helpBack', 'GOT IT. LET’S HOP! →', 'primary')}`);
}
function showPause() {
  showPanel('pause', `<span class="eyebrow">THE LETTER IS IN GOOD HANDS</span><h2 id="panelTitle">A little lily break.</h2><p>Route ${s.level} / ${LEVELS.length} · ${LEVELS[s.level - 1].name}.<br>${storageAvailable ? 'Your delivery is saved on this device.' : 'Device storage is unavailable. Keep this page open to retain your delivery.'}</p>${button('resume', 'KEEP HOPPING →', 'primary', contextLost)}${button('help', 'HOW TO PLAY')}${button('restart', 'RESTART THIS ROUTE')}${button('levels', 'CHOOSE A ROUTE', 'text-button')}<a class="text-button" href="./">← ALL GAMES</a>`);
}
function showRestoring() {
  showPanel('restoring', `<span class="eyebrow">HOLD THAT LEAP</span><h2 id="panelTitle">A little picture break.</h2><p>Restoring the forest. Your delivery is safe here.</p>${button('waiting', 'RESTORING…', 'primary', true)}<a class="text-button" href="./">← ALL GAMES</a>`);
}
function showLevels() {
  if (activeModes.includes(s.mode)) { game.pause(); changed(); }
  showPanel('levels', `<span class="eyebrow">FIVE FIRST-CLASS ADVENTURES</span><h2 id="panelTitle">Where to, little frog?</h2><p>Deliver a letter to open the next route. Replay a favorite to collect stamps and perfect your landings.</p><div class="level-grid">${LEVELS.map((level, i) => `<button class="level-choice${level.id === s.level ? ' current' : ''}" data-level="${level.id}" aria-label="Route ${level.id}, ${level.name}${profile.stars[i] ? `, ${profile.stars[i]} stars` : level.id > profile.unlocked ? ', locked' : ''}"${level.id > profile.unlocked ? ' disabled' : ''}><span>${String(level.id).padStart(2, '0')}</span><small>${profile.stars[i] ? '★'.repeat(profile.stars[i]) + '☆'.repeat(3 - profile.stars[i]) : level.id > profile.unlocked ? 'LOCKED' : 'LET’S HOP'}</small></button>`).join('')}</div>${button('menuBack', s.mode === 'paused' ? 'BACK TO MY DELIVERY →' : 'BACK →', 'primary')}<p class="fine-print">${profile.stars.reduce((a, b) => a + b, 0)} / 15 STARS · ${recordsAvailable ? 'SAVED ON THIS DEVICE' : 'STORAGE UNAVAILABLE'}</p>`);
}
function showResult() {
  const final = s.level === LEVELS.length, stamps = s.stamps.filter(stamp => stamp.collected).length;
  showPanel('won', `<div class="result-layout"><div><div class="result-stars" aria-label="${s.stars} stars">${'★'.repeat(s.stars)}${'☆'.repeat(3 - s.stars)}</div><span class="eyebrow">${final ? 'FIVE LETTERS · ONE VERY GOOD FROG' : `ROUTE ${s.level} · DELIVERY COMPLETE`}</span><h2 id="panelTitle">${final ? 'You made the forest’s day.' : 'Signed, sealed, delivered.'}</h2><p>${final ? 'Every letter found a home. There’s always time for another leap through the leaves.' : 'A little kindness goes a long way. Especially when it arrives by frog.'}</p><p class="result-tip">${s.stars === 3 ? 'First-class delivery. Every star is yours!' : 'For three stars: half the stamps, two perfect landings, and at most one miss.'}</p></div><div><div class="result-stats"><div><strong>${s.score.toLocaleString()}</strong><span>POINTS</span></div><div><strong>${stamps} / ${s.stamps.length}</strong><span>STAMPS</span></div><div><strong>${s.perfects}</strong><span>PERFECTS</span></div></div>${final ? button('replay', 'HOP THIS ROUTE AGAIN →', 'primary') : button('next', 'NEXT DELIVERY →', 'primary')}${final ? button('levels', 'CHOOSE A ROUTE') : button('replay', 'TRY FOR A PERFECT DELIVERY')}<a class="text-button" href="./">← ALL GAMES</a><p class="fine-print">${s.jumps} LEAPS · ${s.misses} MISSES<br>${recordsAvailable && storageAvailable ? 'PROGRESS SAVED ON THIS DEVICE' : 'DEVICE STORAGE UNAVAILABLE'}</p></div></div>`);
}
function toast(message, seconds = 1.8) { $('toast').textContent = message; $('toast').hidden = false; toastUntil = performance.now() + seconds * 1000; }
function refreshHUD() {
  const level = LEVELS[s.level - 1], count = s.stamps.filter(stamp => stamp.collected).length, active = activeModes.includes(s.mode);
  $('levelLabel').innerHTML = `${String(s.level).padStart(2, '0')} <small>/ 05</small><span aria-hidden="true">⌄</span>`;
  $('levelName').textContent = level.name;
  const progress = Math.max(0, level.pads.findIndex(pad => pad.id === s.bestProgress));
  $('goalLabel').textContent = `LETTER ${Math.round(progress / Math.max(1, level.pads.length - 1) * 100)}% OF THE WAY`;
  $('goalFill').style.width = `${progress / Math.max(1, level.pads.length - 1) * 100}%`;
  $('stampValue').innerHTML = `${count} <small>/ ${s.stamps.length}</small>`; $('scoreValue').textContent = `${s.score.toLocaleString()} POINTS`;
  $('pauseButton').disabled = !active || contextLost; $('levelButton').disabled = contextLost; document.querySelector('.topbar nav').inert = contextLost;
  const forecast = getPreview(), landing = forecast?.landing;
  $('controlTitle').textContent = s.mode === 'aiming' ? landing ? landing.padId === s.padId ? 'SAME LEAF · AIM SIDEWAYS' : s.landed.includes(landing.padId) ? 'BACK TO AN EARLIER LEAF' : landing.perfect ? 'A PERFECT LITTLE LANDING' : 'LEAF IN SIGHT · LET GO!' : 'FIND YOUR NEXT LEAF' : s.mode === 'flying' ? 'SPECIAL DELIVERY, COMING THROUGH!' : s.mode === 'recovering' ? 'A SPLASH. ANOTHER CHANCE.' : 'PULL BACK. LET GO.';
  $('controlText').textContent = s.mode === 'aiming' ? 'Pull down to go up. Pull sideways to steer.' : s.mode === 'flying' ? 'Collect stamps and land in the middle.' : s.mode === 'recovering' ? 'Your last safe leaf is waiting for you.' : s.level === 1 ? 'Touch anywhere. Drag down to leap up.' : level.subtitle;
  $('badgeIcon').textContent = s.streak >= 2 ? '✧' : '↗';
  $('badgeValue').textContent = s.streak >= 2 ? `${s.streak}× PERFECT STREAK` : s.perfects ? `${s.perfects} PERFECT LANDINGS` : 'TAKE YOUR TIME';
  $('badgeText').textContent = s.streak >= 3 ? 'FIRST-CLASS HOPPING' : 'MISSES GET ANOTHER HOP';
}
function handleMode() {
  if (s.mode === lastMode) return;
  lastMode = s.mode; dirty = true;
  if (activeModes.includes(s.mode)) hidePanel();
  if (s.mode === 'paused') { clearInput(false); saveRun(); showPause(); }
  if (s.mode === 'won') {
    clearInput(false); const i = s.level - 1;
    profile.stars[i] = Math.max(profile.stars[i], s.stars); profile.bestScore[i] = Math.max(profile.bestScore[i], s.score);
    profile.unlocked = Math.max(profile.unlocked, Math.min(LEVELS.length, s.level + 1)); recordsAvailable = saveProfile(); saveRun(); showResult();
  }
}
function changed() {
  let checkpoint = false;
  for (const event of s.events.splice(0)) {
    if (event.type === 'launch') { tone(250, .22, .025, 0, 'triangle'); tone(440, .14, .02, .06); checkpoint = true; }
    if (event.type === 'landing') { if (!event.perfect) tone(330, .11, .018); checkpoint = true; }
    if (event.type === 'perfect') { toast(event.streak >= 3 ? `${event.streak}× FIRST-CLASS LANDING!` : 'PERFECT LITTLE LANDING!'); chime([440, 554, 659]); }
    if (event.type === 'stamp') { tone(880, .18, .021); checkpoint = true; }
    if (event.type === 'splash') { toast('SPLISH. LET’S TRY THAT AGAIN.', 1.4); tone(165, .25, .025, 0, 'triangle'); checkpoint = true; }
    if (event.type === 'recover') checkpoint = true;
    if (event.type === 'invalid') toast('PULL DOWN A LITTLE MORE TO LEAP');
    if (event.type === 'won') chime([392, 494, 587, 784]);
  }
  handleMode(); refreshHUD(); if (checkpoint) saveRun(); dirty = true;
}
function start(level = selectedLevel) {
  if (contextLost) return false;
  clearInput(); unlockAudio(); selectedLevel = Math.floor(Math.max(1, Math.min(LEVELS.length, Number(level) || 1)));
  game.start(selectedLevel); previewKey = ''; lastMode = 'ready'; lastFrame = performance.now(); changed(); saveRun(); return true;
}
function continueRun() {
  const saved = savedRun(); if (!saved || contextLost || !game.restore(saved)) { showIntro(); return false; }
  unlockAudio(); if (s.mode === 'paused') game.resume(); selectedLevel = s.level; previewKey = ''; lastMode = 'ready'; lastFrame = performance.now(); changed(); return true;
}
function doAction(action) {
  unlockAudio();
  if (action === 'start') start();
  if (action === 'continue') continueRun();
  if (action === 'restart' || action === 'replay') start(s.level);
  if (action === 'next' && !contextLost) { game.next(); selectedLevel = s.level; previewKey = ''; changed(); saveRun(); }
  if (action === 'resume' && !contextLost) { game.resume(); changed(); lastFrame = performance.now(); }
  if (action === 'help') showHelp();
  if (action === 'levels') showLevels();
  if (action === 'menuBack') { if (s.mode === 'paused') showPause(); else showIntro(); }
  if (action === 'helpBack') { if (helpReturn === 'pause') showPause(); else if (helpReturn === 'won') showResult(); else if (helpReturn === 'levels') showLevels(); else showIntro(); }
}
$('panelContent').addEventListener('click', event => { const target = event.target.closest('button'); if (!target) return; if (target.dataset.action) doAction(target.dataset.action); if (target.dataset.level && Number(target.dataset.level) <= profile.unlocked) start(Number(target.dataset.level)); });
$('soundButton').addEventListener('click', () => { profile.sound = !profile.sound; recordsAvailable = saveProfile(); unlockAudio(); soundUI(); if (profile.sound) chime([440, 554]); });
$('helpButton').addEventListener('click', showHelp);
$('pauseButton').addEventListener('click', () => { game.pause(); changed(); });
$('levelButton').addEventListener('click', showLevels);
function movePointer(event) {
  if (event.pointerId !== pointer || s.mode !== 'aiming') return;
  const dx = event.clientX - anchorX, dy = event.clientY - anchorY;
  pullDistance = Math.hypot(dx, dy); game.aim(view.dragVector(-dx, -dy));
  $('aimKnob').style.transform = `translate(${dx}px,${dy}px)`;
  $('aimLine').style.width = `${pullDistance}px`; $('aimLine').style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  changed();
}
$('gameStage').addEventListener('pointerdown', event => {
  if (s.mode !== 'playing' || pointer !== null || contextLost || event.pointerType === 'mouse' && event.button !== 0) return;
  event.preventDefault(); unlockAudio(); if (!game.beginAim()) return;
  pointer = event.pointerId; anchorX = event.clientX; anchorY = event.clientY; pullDistance = 0; game.aim({ vx: 0, vy: 0 });
  const rect = $('gameStage').getBoundingClientRect(); $('aimGesture').style.left = `${anchorX - rect.left}px`; $('aimGesture').style.top = `${anchorY - rect.top}px`;
  $('aimGesture').hidden = false; $('aimKnob').style.transform = 'translate(0,0)'; $('aimLine').style.width = '0'; $('gameStage').setPointerCapture(pointer); changed();
});
$('gameStage').addEventListener('pointermove', movePointer);
$('gameStage').addEventListener('pointerup', event => {
  if (event.pointerId !== pointer) return;
  movePointer(event); const launch = pullDistance >= 10; clearInput(false);
  if (launch) game.launch(); else game.cancelAim(); changed(); saveRun();
});
for (const type of ['pointercancel', 'lostpointercapture']) $('gameStage').addEventListener(type, event => { if (event.pointerId === pointer) { clearInput(); changed(); saveRun(); } });
document.addEventListener('keydown', event => {
  if (event.code === 'Tab' && !$('modalLayer').hidden) {
    const items = [...$('gamePanel').querySelectorAll('button:not(:disabled),a[href]')], first = items[0], last = items.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === $('gamePanel'))) { last?.focus(); event.preventDefault(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === $('gamePanel'))) { first?.focus(); event.preventDefault(); }
    return;
  }
  if (['Escape', 'KeyP'].includes(event.code) && !event.repeat) {
    event.preventDefault();
    if (panelKind === 'help') doAction('helpBack'); else if (panelKind === 'levels') doAction('menuBack');
    else if (s.mode === 'paused' && !contextLost) doAction('resume'); else if (activeModes.includes(s.mode)) { game.pause(); changed(); } return;
  }
  if (!$('modalLayer').hidden || contextLost || pointer !== null || !['playing', 'aiming'].includes(s.mode)) return;
  if (['Space', 'Enter'].includes(event.code) && event.target.closest?.('button,a,input,select,textarea,[contenteditable="true"]')) return;
  if (event.code === 'Space' || event.code === 'Enter') {
    event.preventDefault(); if (event.repeat) return; unlockAudio();
    if (s.mode === 'playing') { game.beginAim(); game.aim({ vx: 0, vy: 8.5 }); } else game.launch();
    changed(); saveRun(); return;
  }
  const direction = { ArrowLeft: [-.4, 0], ArrowRight: [.4, 0], ArrowUp: [0, .4], ArrowDown: [0, -.4], KeyA: [-.4, 0], KeyD: [.4, 0], KeyW: [0, .4], KeyS: [0, -.4] }[event.code];
  if (direction) { event.preventDefault(); unlockAudio(); if (s.mode === 'playing') { game.beginAim(); game.aim({ vx: 0, vy: 8.5 }); } game.aim({ vx: s.aim.vx + direction[0], vy: s.aim.vy + direction[1] }); changed(); }
});
function suspend() { clearInput(); if (activeModes.includes(s.mode)) { game.pause(); changed(); } else if (s.mode !== 'ready') saveRun(); }
window.addEventListener('blur', suspend); window.addEventListener('pagehide', suspend);
document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); else { dirty = true; lastFrame = performance.now(); } });
window.addEventListener('pageshow', () => { dirty = true; lastFrame = performance.now(); });
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden || contextLost || !view) { lastFrame = now; return; }
  if (now - lastFrame < (touch ? 1000 / 30 : 1000 / 60) - 1 && !dirty) return;
  const elapsed = Math.min(.1, (now - (lastFrame || now)) / 1000); lastFrame = now;
  if (realtime && activeModes.includes(s.mode)) {
    game.advance(elapsed);
    if (s.events.length || s.mode !== lastMode) changed();
    else if (now - lastUI > 100) { refreshHUD(); lastUI = now; }
  }
  if (toastUntil && now >= toastUntil) { $('toast').hidden = true; toastUntil = 0; }
  if (dirty || realtime && activeModes.includes(s.mode)) { view.render(s, now / 1000, getPreview()); renderCount++; dirty = false; }
  if (s.mode !== 'aiming' && activeModes.includes(s.mode) && s.ticks - lastSavedTick >= 300) saveRun();
}
try {
  view = createPondPostScene($('gameStage'), {
    resized: () => { const aiming = s.mode === 'aiming'; clearInput(); if (aiming) { changed(); saveRun(); } dirty = true; },
    lost: () => { contextLost = true; suspend(); showRestoring(); refreshHUD(); },
    restored: () => { contextLost = false; dirty = true; if (s.mode === 'paused') showPause(); else if (s.mode === 'won') showResult(); else showIntro(); refreshHUD(); toast('THE FOREST IS READY AGAIN!'); },
  });
  soundUI(); refreshHUD(); showIntro(); $('loading').hidden = true; document.body.dataset.ready = 'true';
  if (query.has('continue') && savedRun()) continueRun();
  if (query.has('debug')) window.__pondpost = { game, view, start, save: saveRun, continueRun, refresh: changed,
    advance(seconds) { game.advance(seconds); changed(); }, setRealtime(value) { realtime = !!value; lastFrame = performance.now(); dirty = true; },
    get renderCount() { return renderCount; }, get profile() { return JSON.parse(JSON.stringify(profile)); },
  };
  requestAnimationFrame(frame);
} catch (error) { console.error(error); $('loading').innerHTML = '<span class="loading-letter" aria-hidden="true">✉</span><strong>This little forest needs a browser with WebGL.</strong><span>Try reloading or opening this page in your regular browser.</span><a href="./">← Back to games</a>'; }
