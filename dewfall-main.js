import { createDewfall, parseDewfallSave, LEVELS } from './dewfall-game.js';
import { createDewfallScene } from './dewfall-scene.js';
import { readGameSave, writeGameSave } from './save-store.js?v6';

const $ = id => document.getElementById(id), query = new URLSearchParams(location.search);
const touch = matchMedia('(pointer: coarse)').matches, PROFILE_KEY = 'games:dewfall:progress';
const profile = { unlocked: 1, stars: Array(6).fill(0), bestScore: Array(6).fill(0), sound: false };
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
} catch { /* Playing never depends on device storage. */ }
const game = createDewfall(), s = game.state;
let view, contextLost = false, dirty = true, realtime = true, panelKind = '', helpReturn = 'intro', lastMode = 'ready';
let lastFrame = 0, lastUI = 0, lastSavedTick = 0, renderCount = 0, toastUntil = 0, audio, voices = 0;
let pointer = null, anchorX = 0, anchorY = 0, tiltX = 0, tiltZ = 0, storageAvailable = true, recordsAvailable = true;
const keys = new Set();
let selectedLevel = Math.floor(Math.max(1, Math.min(query.has('debug') ? LEVELS.length : profile.unlocked, Number(query.get('level')) || profile.unlocked)));
const button = (action, label, style = 'secondary', disabled = false) => `<button class="${style}" data-action="${action}"${disabled ? ' disabled' : ''}>${label}</button>`;
function saveProfile() { try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ version: 1, ...profile })); return true; } catch { return false; } }
function savedRun() { return parseDewfallSave(readGameSave('dewfall')?.data); }
function saveRun() {
  const data = game.snapshot(); if (!data) return false;
  storageAvailable = writeGameSave('dewfall', data); lastSavedTick = s.ticks;
  $('saveStatus').textContent = storageAvailable ? 'PROGRESS SAVED ON THIS DEVICE' : 'DEVICE STORAGE UNAVAILABLE · YOU CAN STILL PLAY';
  $('saveStatus').classList.toggle('failed', !storageAvailable); return storageAvailable;
}
function unlockAudio() { if (!profile.sound) return; try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume().catch(() => {}); } catch { /* Optional. */ } }
function tone(frequency, delay = 0, duration = .22) {
  if (!profile.sound || !audio || audio.state !== 'running' || voices >= 12) return;
  const oscillator = audio.createOscillator(), gain = audio.createGain(), at = audio.currentTime + delay; voices++;
  oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, at); oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.03, at + duration);
  gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(.025, at + .012); gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
  oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(at); oscillator.stop(at + duration + .02);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); voices--; };
}
function chime(notes) { notes.forEach((n, i) => tone(n, i * .075)); }
function soundUI() {
  $('soundButton').setAttribute('aria-pressed', String(profile.sound)); $('soundButton').setAttribute('aria-label', profile.sound ? 'Turn sound off' : 'Turn sound on');
  $('soundButton').innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z${profile.sound ? 'm4 3c3 2 3 6 0 8m3-11c5 4 5 10 0 14' : 'm4 4 6 6m0-6-6 6'}"/></svg>`;
}
function clearInput(release = true) {
  const old = pointer; pointer = null; tiltX = tiltZ = 0; keys.clear(); game.endTilt();
  if (release && old !== null && $('gameStage').hasPointerCapture(old)) $('gameStage').releasePointerCapture(old);
  $('tiltGesture').hidden = true; dirty = true;
}
function control() {
  if (pointer !== null) return { x: tiltX, z: tiltZ };
  return { x: Number(keys.has('ArrowRight') || keys.has('KeyD')) - Number(keys.has('ArrowLeft') || keys.has('KeyA')),
    z: Number(keys.has('ArrowDown') || keys.has('KeyS')) - Number(keys.has('ArrowUp') || keys.has('KeyW')) };
}
function showPanel(kind, content) {
  clearInput(); panelKind = kind; $('gamePanel').dataset.kind = kind; $('panelContent').innerHTML = content; $('modalLayer').hidden = false;
  document.querySelector('.game-app').inert = true; $('hud').inert = true; $('controls').inert = true; $('gameStage').inert = true; $('gamePanel').scrollTop = 0; $('gamePanel').focus({ preventScroll: true }); dirty = true;
}
function hidePanel() { panelKind = ''; $('modalLayer').hidden = true; $('toast').hidden = true; toastUntil = 0; document.querySelector('.game-app').inert = false; $('hud').inert = false; $('controls').inert = false; $('gameStage').inert = false; $('gameStage').focus({ preventScroll: true }); dirty = true; }
function showIntro() {
  const saved = savedRun();
  showPanel('intro', `<div class="intro-layout"><div><div class="intro-head"><span class="eyebrow">A TINY GARDEN IN YOUR HANDS</span><h1 id="panelTitle">DEWDROP<br><span>DRIFT.</span></h1><span class="intro-drop" aria-hidden="true">✧</span></div><p class="lede">A little tilt. A little sparkle.<br>Let a whole little world bloom.</p><div class="how-row"><div class="how-step"><span>01 / TILT</span><strong>DRAG A LITTLE</strong><small>Every drop rolls where your thumb goes.</small></div><div class="how-step"><span>02 / BLOOM</span><strong>WATER THE FLOWERS</strong><small>Guide a drop into each flower. Lift to brake.</small></div></div></div><div>${saved ? button('continue', `CONTINUE · GARDEN ${String(saved.level).padStart(2, '0')} →`, 'primary') + button('start', `PLAY GARDEN ${String(selectedLevel).padStart(2, '0')}`) : button('start', 'LET’S MAKE IT BLOOM →', 'primary')}${button('levels', 'CHOOSE A GARDEN')}${button('help', 'HOW TO PLAY', 'text-button')}<p class="fine-print">ONE THUMB · SIX GARDENS · NO RUSH${profile.stars.some(Boolean) ? `<br>${profile.stars.reduce((a, b) => a + b, 0)} / 18 STARS COLLECTED` : ''}</p></div></div>`);
}
function showHelp() {
  helpReturn = ['playing', 'paused'].includes(s.mode) ? 'pause' : panelKind || 'intro';
  if (s.mode === 'playing') { game.pause(); changed(); }
  showPanel('help', `<span class="eyebrow">A LITTLE CARE GOES A LONG WAY</span><h2 id="panelTitle">Give the garden a tilt.</h2><ul class="help-list"><li><span aria-hidden="true">✥</span><span><b>Drag anywhere to lean.</b>All drops roll in the direction you drag. A small drag rolls gently; a longer drag rolls faster.</span></li><li><span aria-hidden="true">✿</span><span><b>One drop. One flower.</b>Roll any drop into a thirsty flower. It blooms and stays watered while you guide the others.</span></li><li><span aria-hidden="true">↟</span><span><b>Lift your thumb to brake.</b>The garden levels itself and drops gently slow down. Circle around rocks; pink spring leaves give a nudge.</span></li><li><span aria-hidden="true">≈</span><span><b>Little spills get another try.</b>Blue puddles return a drop to its start. Bloomed flowers stay safe. There are no lives or timers.</span></li></ul><div class="key-help">${touch ? 'One thumb is all you need. You can touch any open part of the garden.' : 'Mouse: drag to tilt. Keyboard: arrows or WASD. Release to brake. P or Esc pauses.'}<br>Three stars: finish with at most one spill. A shorter journey earns more points.</div>${button('helpBack', 'GOT IT. LET’S BLOOM →', 'primary')}`);
}
function showPause() {
  showPanel('pause', `<span class="eyebrow">GOOD THINGS GROW SLOWLY</span><h2 id="panelTitle">A little garden break.</h2><p>Garden ${s.level} / 6 · ${LEVELS[s.level - 1].name}.<br>${storageAvailable ? 'Every drop is saved on this device.' : 'Device storage is unavailable. Keep this page open to retain your garden.'}</p>${button('resume', 'BACK TO THE GARDEN →', 'primary', contextLost)}${button('help', 'HOW TO PLAY')}${button('restart', 'RESTART THIS GARDEN')}${button('levels', 'CHOOSE A GARDEN', 'text-button')}<a class="text-button" href="./">← ALL GAMES</a>`);
}
function showRestoring() { showPanel('restoring', `<span class="eyebrow">HOLD THAT LITTLE DROP</span><h2 id="panelTitle">A little picture break.</h2><p>Restoring the garden. Your flowers are safe here.</p>${button('waiting', 'RESTORING…', 'primary', true)}`); }
function showLevels() {
  if (s.mode === 'playing') { game.pause(); changed(); }
  showPanel('levels', `<span class="eyebrow">SIX LITTLE WORLDS TO MAKE BLOOM</span><h2 id="panelTitle">Pick a little garden.</h2><p>Bloom every flower to open the next garden. Revisit a favorite for a gentler journey and more stars.</p><div class="level-grid">${LEVELS.map((level, i) => `<button class="level-choice${level.id === s.level ? ' current' : ''}" data-level="${level.id}" aria-label="Garden ${level.id}, ${level.name}${profile.stars[i] ? `, ${profile.stars[i]} stars` : level.id > profile.unlocked ? ', locked' : ''}"${level.id > profile.unlocked ? ' disabled' : ''}><span>${String(level.id).padStart(2, '0')}</span><small>${profile.stars[i] ? '★'.repeat(profile.stars[i]) + '☆'.repeat(3 - profile.stars[i]) : level.id > profile.unlocked ? 'LOCKED' : 'LET’S BLOOM'}</small></button>`).join('')}</div>${button('menuBack', s.mode === 'paused' ? 'BACK TO MY GARDEN →' : 'BACK →', 'primary')}<p class="fine-print">${profile.stars.reduce((a, b) => a + b, 0)} / 18 STARS · ${recordsAvailable ? 'SAVED ON THIS DEVICE' : 'STORAGE UNAVAILABLE'}</p>`);
}
function showResult() {
  const final = s.level === LEVELS.length;
  showPanel('won', `<div class="result-layout"><div><div class="result-stars" aria-label="${s.stars} stars">${'★'.repeat(s.stars)}${'☆'.repeat(3 - s.stars)}</div><span class="eyebrow">${final ? 'SIX LITTLE GARDENS · SO MUCH COLOR' : `GARDEN ${s.level} · EVERY FLOWER WATERED`}</span><h2 id="panelTitle">${final ? 'You made the world bloom.' : 'A beautiful little bloom.'}</h2><p>${final ? 'From morning dew to a sunset garden. A little care brought every flower to life.' : 'One small drop can make a whole flower happy. Look at what you grew.'}</p><p class="result-tip">${s.stars === 3 ? 'A lovely gentle journey. All three stars are yours!' : 'For three stars, make the garden bloom with at most one spill.'}</p></div><div><div class="result-stats"><div><strong>${s.score.toLocaleString()}</strong><span>POINTS</span></div><div><strong>${s.total}</strong><span>BLOOMS</span></div><div><strong>${s.spills}</strong><span>SPILLS</span></div></div>${button(final ? 'replay' : 'next', final ? 'BLOOM THIS GARDEN AGAIN →' : 'NEXT LITTLE GARDEN →', 'primary')}${button(final ? 'levels' : 'replay', final ? 'CHOOSE A GARDEN' : 'BLOOM THIS GARDEN AGAIN')}<a class="text-button" href="./">← ALL GAMES</a><p class="fine-print">${recordsAvailable && storageAvailable ? 'PROGRESS SAVED ON THIS DEVICE' : 'DEVICE STORAGE UNAVAILABLE'}</p></div></div>`);
}
function toast(message, seconds = 1.6) { $('toast').textContent = message; $('toast').hidden = false; toastUntil = performance.now() + seconds * 1000; }
function refreshHUD() {
  $('levelLabel').innerHTML = `${String(s.level).padStart(2, '0')} <small>/ 06</small><span aria-hidden="true">⌄</span>`;
  $('levelName').textContent = LEVELS[s.level - 1].name; $('goalLabel').textContent = `${s.total - s.bloomed} THIRSTY FLOWER${s.total - s.bloomed === 1 ? '' : 'S'}`;
  $('goalFill').style.width = `${s.bloomed / s.total * 100}%`; $('bloomValue').innerHTML = `${s.bloomed} <small>/ ${s.total}</small>`; $('spillValue').textContent = `${s.spills} SPILL${s.spills === 1 ? '' : 'S'}`;
  $('pauseButton').disabled = s.mode !== 'playing' || contextLost; $('levelButton').disabled = contextLost; document.querySelector('.topbar nav').inert = contextLost;
  $('controlTitle').textContent = s.dragging ? 'LIFT TO GENTLY STOP' : 'DRAG TO TILT';
  $('controlText').textContent = s.level === 1 ? 'The drops roll where your thumb goes.' : LEVELS[s.level - 1].subtitle;
}
function handleMode() {
  if (s.mode === lastMode) return; lastMode = s.mode; dirty = true;
  if (s.mode === 'playing') hidePanel();
  if (s.mode === 'paused') { clearInput(); saveRun(); showPause(); }
  if (s.mode === 'won') {
    clearInput(); const i = s.level - 1; profile.stars[i] = Math.max(profile.stars[i], s.stars); profile.bestScore[i] = Math.max(profile.bestScore[i], s.score);
    profile.unlocked = Math.max(profile.unlocked, Math.min(6, s.level + 1)); recordsAvailable = saveProfile(); saveRun(); showResult();
  }
}
function changed() {
  let checkpoint = false;
  for (const event of s.events.splice(0)) {
    if (event.type === 'bloom') { chime([440 + event.bloomed * 55, 660 + event.bloomed * 55]); toast(`${event.bloomed} / ${event.total} · A LITTLE MORE COLOR`); checkpoint = true; }
    if (event.type === 'spring') tone(550);
    if (event.type === 'spill') { tone(180, 0, .28); toast('A LITTLE SPLASH. ANOTHER CHANCE.'); checkpoint = true; }
    if (event.type === 'return') checkpoint = true;
    if (event.type === 'won') chime([440, 554, 659, 880]);
  }
  handleMode(); refreshHUD(); if (checkpoint) saveRun(); dirty = true;
}
function start(level = selectedLevel) {
  if (contextLost) return false; clearInput(); unlockAudio(); selectedLevel = Math.floor(Math.max(1, Math.min(6, Number(level) || 1)));
  game.start(selectedLevel); lastMode = 'ready'; lastFrame = performance.now(); changed(); saveRun(); return true;
}
function continueRun() {
  const saved = savedRun(); if (!saved || contextLost || !game.restore(saved)) { showIntro(); return false; }
  clearInput(); unlockAudio(); if (s.mode === 'paused') game.resume(); selectedLevel = s.level; lastMode = 'ready'; lastFrame = performance.now(); changed(); return true;
}
function doAction(action) {
  if (contextLost) return; unlockAudio();
  if (action === 'start') start(); if (action === 'continue') continueRun();
  if (action === 'restart' || action === 'replay') start(s.level);
  if (action === 'next') { game.next(); selectedLevel = s.level; lastFrame = performance.now(); changed(); saveRun(); }
  if (action === 'resume') { game.resume(); changed(); lastFrame = performance.now(); }
  if (action === 'help') showHelp(); if (action === 'levels') showLevels();
  if (action === 'menuBack') { if (s.mode === 'paused') showPause(); else if (s.mode === 'won') showResult(); else showIntro(); }
  if (action === 'helpBack') { if (helpReturn === 'pause') showPause(); else if (helpReturn === 'won') showResult(); else if (helpReturn === 'levels') showLevels(); else showIntro(); }
}
$('panelContent').addEventListener('click', event => { const target = event.target.closest('button'); if (!target) return; if (target.dataset.action) doAction(target.dataset.action); if (target.dataset.level && Number(target.dataset.level) <= profile.unlocked) start(Number(target.dataset.level)); });
$('soundButton').addEventListener('click', () => { profile.sound = !profile.sound; recordsAvailable = saveProfile(); unlockAudio(); soundUI(); if (profile.sound) chime([440, 554]); });
$('helpButton').addEventListener('click', () => { if (!contextLost) showHelp(); });
$('pauseButton').addEventListener('click', () => { game.pause(); changed(); }); $('levelButton').addEventListener('click', () => { if (!contextLost) showLevels(); });
function movePointer(event) {
  if (event.pointerId !== pointer || s.mode !== 'playing') return;
  let dx = event.clientX - anchorX, dy = event.clientY - anchorY, distance = Math.hypot(dx, dy); const radius = 44;
  if (distance > radius) { anchorX += dx * (1 - radius / distance); anchorY += dy * (1 - radius / distance); dx *= radius / distance; dy *= radius / distance; }
  tiltX = dx / radius; tiltZ = dy / radius;
  const rect = $('gameStage').getBoundingClientRect(); $('tiltGesture').style.left = `${anchorX - rect.left}px`; $('tiltGesture').style.top = `${anchorY - rect.top}px`;
  $('tiltKnob').style.transform = `translate(${dx}px,${dy}px)`; dirty = true;
}
$('gameStage').addEventListener('pointerdown', event => {
  if (s.mode !== 'playing' || pointer !== null || contextLost || event.pointerType === 'mouse' && event.button !== 0) return;
  if (event.pointerType === 'mouse') event.preventDefault(); unlockAudio(); keys.clear(); game.beginTilt(); pointer = event.pointerId; anchorX = event.clientX; anchorY = event.clientY; tiltX = tiltZ = 0;
  const rect = $('gameStage').getBoundingClientRect(); $('tiltGesture').style.left = `${anchorX - rect.left}px`; $('tiltGesture').style.top = `${anchorY - rect.top}px`;
  $('tiltGesture').hidden = false; $('tiltKnob').style.transform = 'translate(0,0)'; $('gameStage').setPointerCapture(pointer); refreshHUD(); dirty = true;
});
$('gameStage').addEventListener('pointermove', movePointer);
$('gameStage').addEventListener('pointerup', event => { if (event.pointerId !== pointer) return; clearInput(false); changed(); saveRun(); });
for (const type of ['pointercancel', 'lostpointercapture']) $('gameStage').addEventListener(type, event => { if (event.pointerId === pointer) { clearInput(); changed(); saveRun(); } });
document.addEventListener('keydown', event => {
  if (event.code === 'Tab' && !$('modalLayer').hidden) {
    const items = [...$('gamePanel').querySelectorAll('button:not(:disabled),a[href]')], first = items[0], last = items.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === $('gamePanel'))) { last?.focus(); event.preventDefault(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === $('gamePanel'))) { first?.focus(); event.preventDefault(); } return;
  }
  if (['Escape', 'KeyP'].includes(event.code) && !event.repeat) {
    event.preventDefault(); if (contextLost) return;
    if (panelKind === 'help') doAction('helpBack'); else if (panelKind === 'levels') doAction('menuBack');
    else if (s.mode === 'paused') doAction('resume'); else if (s.mode === 'playing') { game.pause(); changed(); } return;
  }
  if (contextLost || !$('modalLayer').hidden || s.mode !== 'playing' || pointer !== null || event.target.closest?.('button,a,input,select,textarea,[contenteditable="true"]')) return;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) { event.preventDefault(); keys.add(event.code); game.beginTilt(); refreshHUD(); dirty = true; }
});
document.addEventListener('keyup', event => { if (keys.delete(event.code) && !keys.size) { game.endTilt(); changed(); saveRun(); } });
function suspend() { clearInput(); if (s.mode === 'playing') { game.pause(); changed(); } else saveRun(); audio?.suspend().catch(() => {}); }
document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); else { lastFrame = performance.now(); dirty = true; } });
window.addEventListener('pagehide', suspend); window.addEventListener('blur', suspend);
function frame(now) {
  requestAnimationFrame(frame); if (contextLost || document.hidden) { lastFrame = now; return; }
  const interval = touch ? 1000 / 30 : 1000 / 60; if (now - lastFrame < interval - .5) return;
  const elapsed = Math.min(.07, (now - (lastFrame || now)) / 1000); lastFrame = now;
  if (realtime && s.mode === 'playing') {
    game.advance(elapsed, control()); if (s.events.length || s.mode !== lastMode) changed(); else if (now - lastUI > 120) { refreshHUD(); lastUI = now; }
  }
  if (toastUntil && now >= toastUntil) { $('toast').hidden = true; toastUntil = 0; }
  if (dirty || realtime && s.mode === 'playing') { view.render(s, now / 1000); renderCount++; dirty = false; }
  if (s.mode === 'playing' && s.ticks - lastSavedTick >= 300) saveRun();
}
try {
  view = createDewfallScene($('gameStage'), {
    resized: () => { const active = s.dragging; clearInput(); if (active) { changed(); saveRun(); } dirty = true; },
    lost: () => { contextLost = true; suspend(); showRestoring(); refreshHUD(); },
    restored: () => { contextLost = false; dirty = true; if (s.mode === 'paused') showPause(); else if (s.mode === 'won') showResult(); else showIntro(); refreshHUD(); toast('THE GARDEN IS READY AGAIN!'); },
  });
  soundUI(); refreshHUD(); showIntro(); $('loading').hidden = true; document.body.dataset.ready = 'true';
  if (query.has('continue') && savedRun()) continueRun();
  if (query.has('debug')) window.__dewfall = { game, view, start, save: saveRun, continueRun, refresh: changed,
    advance(seconds, input = control()) { game.advance(seconds, input); changed(); }, setRealtime(value) { realtime = !!value; lastFrame = performance.now(); dirty = true; },
    get renderCount() { return renderCount; }, get profile() { return JSON.parse(JSON.stringify(profile)); },
  };
  requestAnimationFrame(frame);
} catch (error) { console.error(error); $('loading').innerHTML = '<span class="loading-drop" aria-hidden="true">✧</span><strong>This little garden needs a browser with WebGL.</strong><span>Try reloading or opening this page in your regular browser.</span><a href="./">← Back to games</a>'; }
