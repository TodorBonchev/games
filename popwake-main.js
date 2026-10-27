import { createPopwake, parsePopwakeSave, LEVELS, GRID_SIZE } from './popwake-game.js';
import { createPopwakeScene } from './popwake-scene.js';
import { readGameSave, writeGameSave } from './save-store.js?v4';

const $ = id => document.getElementById(id);
const query = new URLSearchParams(location.search);
const touch = matchMedia('(pointer: coarse)').matches;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const PROFILE_KEY = 'games:popwake:progress';
const profile = { unlocked: 1, stars: Array(LEVELS.length).fill(0), bestUsed: Array(LEVELS.length).fill(null), sound: false };
try {
  const saved = JSON.parse(localStorage.getItem(PROFILE_KEY));
  if (saved?.version === 1) {
    profile.sound = saved.sound === true;
    for (let i = 0; i < LEVELS.length; i++) {
      const star = saved.stars?.[i], used = saved.bestUsed?.[i];
      if (Number.isInteger(star) && star >= 0 && star <= 3) profile.stars[i] = star;
      if (Number.isInteger(used) && used >= 1 && used <= 48) profile.bestUsed[i] = used;
    }
    for (let i = 0; i < LEVELS.length - 1; i++) if (profile.stars[i]) profile.unlocked = i + 2;
  }
} catch { /* Storage can be unavailable without preventing play. */ }

const game = createPopwake(), s = game.state;
let view, contextLost = false, dirty = true, realtime = true, panelKind = '', helpReturn = 'intro', lastMode = 'ready';
let lastFrame = 0, lastUI = 0, lastSavedTick = 0, renderCount = 0, toastUntil = 0, lastDrawSound = 0;
let pointer = null, lastCell = null, audio, activeVoices = 0, storageAvailable = true, recordsAvailable = true;
let selectedLevel = Math.max(1, Math.min(query.has('debug') ? LEVELS.length : profile.unlocked, Number(query.get('level')) || profile.unlocked));
selectedLevel = Math.floor(selectedLevel);

function saveProfile() {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ version: 1, ...profile })); return true; }
  catch { return false; }
}
function savedRun() { return parsePopwakeSave(readGameSave('popwake')?.data); }
function saveRun() {
  const data = game.snapshot();
  if (!data) return false;
  storageAvailable = writeGameSave('popwake', data); lastSavedTick = s.ticks;
  $('saveStatus').textContent = storageAvailable ? 'PROGRESS SAVED ON THIS DEVICE' : 'DEVICE STORAGE UNAVAILABLE · YOU CAN STILL PLAY';
  $('saveStatus').classList.toggle('failed', !storageAvailable); return storageAvailable;
}
function unlockAudio() {
  if (!profile.sound) return;
  try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume().catch(() => {}); } catch { /* Sound is optional. */ }
}
function tone(frequency, duration = .13, volume = .025, delay = 0, type = 'sine') {
  if (!profile.sound || !audio || audio.state !== 'running' || activeVoices >= 12) return;
  const oscillator = audio.createOscillator(), gain = audio.createGain(), at = audio.currentTime + delay;
  activeVoices++; oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, at);
  gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(volume, at + .01); gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
  oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(at); oscillator.stop(at + duration + .02);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); activeVoices--; };
}
function chime(notes) { notes.forEach((frequency, i) => tone(frequency, .24, .025, i * .075)); }
function soundUI() {
  $('soundButton').setAttribute('aria-pressed', String(profile.sound));
  $('soundButton').setAttribute('aria-label', profile.sound ? 'Turn sound off' : 'Turn sound on');
  $('soundButton').innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z${profile.sound ? 'm4 3c3 2 3 6 0 8m3-11c5 4 5 10 0 14' : 'm4 4 6 6m0-6-6 6'}"/></svg>`;
}
function clearInput(cancel = true) {
  const old = pointer; pointer = null; lastCell = null;
  if (old !== null && $('gameStage').hasPointerCapture(old)) $('gameStage').releasePointerCapture(old);
  if (cancel && s.mode === 'drawing') game.cancel();
  dirty = true;
}
const button = (action, label, style = 'secondary', disabled = false) => `<button class="${style}" data-action="${action}"${disabled ? ' disabled' : ''}>${label}</button>`;
function showPanel(kind, content) {
  clearInput(); panelKind = kind; $('gamePanel').dataset.kind = kind; $('panelContent').innerHTML = content;
  $('modalLayer').hidden = false; $('hud').inert = true; $('controls').inert = true; $('gameStage').inert = true;
  $('gamePanel').scrollTop = 0; $('gamePanel').focus({ preventScroll: true }); dirty = true;
}
function hidePanel() {
  panelKind = ''; $('modalLayer').hidden = true; $('hud').inert = false; $('controls').inert = false; $('gameStage').inert = false; dirty = true;
}
function showIntro() {
  const saved = savedRun(), totalStars = profile.stars.reduce((sum, stars) => sum + stars, 0);
  showPanel('intro', `<div class="intro-layout"><div><div class="intro-head"><span class="eyebrow">A LITTLE CHAIN REACTION OF JOY</span><h1 id="panelTitle">SMALL TRAIL.<br><span>BIG POP!</span></h1><div class="intro-mascot" aria-hidden="true"></div></div><p class="lede">The jellies are sleeping.<br>Let’s make a little wake-up call.</p><div class="how-row"><div class="how-step"><span>01 / DRAW</span><strong>START AT THE SPARK</strong><small>Drag a trail through sleeping jellies.</small></div><div class="how-step"><span>02 / POP</span><strong>LIFT YOUR FINGER!</strong><small>Wake every jelly in one big chain.</small></div></div></div><div>${saved ? button('continue', `CONTINUE · PUZZLE ${String(saved.level).padStart(2, '0')} →`, 'primary') + button('start', `PLAY PUZZLE ${String(selectedLevel).padStart(2, '0')}`) : button('start', 'LET’S MAKE A LITTLE MAGIC →', 'primary')}${button('levels', 'CHOOSE A PUZZLE')}${button('help', 'HOW TO PLAY', 'text-button')}<p class="fine-print">ONE FINGER · EIGHT PUZZLES · NO TIMER${totalStars ? `<br>${totalStars} / 24 STARS COLLECTED` : ''}</p></div></div>`);
}
function showHelp() {
  helpReturn = ['playing', 'drawing', 'running', 'paused'].includes(s.mode) ? 'pause' : panelKind || 'intro';
  if (['playing', 'drawing', 'running'].includes(s.mode)) { game.pause(); changed(); saveRun(); }
  showPanel('help', `<span class="eyebrow">DRAW A LITTLE. POP A LOT.</span><h2 id="panelTitle">A tiny domino effect.</h2><ul class="help-list"><li><span aria-hidden="true">↝</span><span><b>Start at the blue spark.</b>Drag through neighboring squares and into a jelly’s square. Lift your finger to set it off.</span></li><li><span aria-hidden="true">✳</span><span><b>Wake every sleepy jelly.</b>Each one pops in a circle, waking nearby jellies and lighting nearby dominoes. Gold jellies reach farther.</span></li><li><span aria-hidden="true">⑂</span><span><b>Branch out.</b>Drag back over your own trail for free, then go a different way. The chain can split in every direction.</span></li><li><span aria-hidden="true">★</span><span><b>Less trail, more stars.</b>Stay within the domino budget. REDRAW gives you a fresh try. HINT shows a route and caps that attempt at two stars.</span></li></ul><div class="key-help">${touch ? 'Just one finger. No rush, no timer, no lives to lose.' : 'Mouse: drag from the blue spark, then release. Keyboard: Space to begin, arrows to draw, Space or Enter to pop. R redraws; H gives a hint; P or Esc pauses.'}</div>${button('helpBack', 'GOT IT! →', 'primary')}`);
}
function showPause() {
  showPanel('pause', `<span class="eyebrow">A PERFECTLY GOOD TIME FOR A BREATHER</span><h2 id="panelTitle">The pop can wait.</h2><p>Puzzle ${s.level} / ${LEVELS.length} · ${LEVELS[s.level - 1].name}.<br>${contextLost ? 'Restoring the picture. Your puzzle is safe.' : storageAvailable ? 'Your puzzle is saved on this device.' : 'Device storage is unavailable. Keep this page open to retain your puzzle.'}</p>${button('resume', contextLost ? 'RESTORING…' : 'KEEP POPPING →', 'primary', contextLost)}${button('help', 'HOW TO PLAY')}${button('levels', 'CHOOSE A PUZZLE')}<a class="text-button" href="./">← ALL GAMES</a>`);
}
function showRestoring() {
  showPanel('restoring', `<span class="eyebrow">YOUR PUZZLE CAN WAIT</span><h2 id="panelTitle">A little picture break.</h2><p>Restoring the picture. Your puzzle is safe here.</p>${button('waiting', 'RESTORING…', 'primary', true)}<a class="text-button" href="./">← ALL GAMES</a>`);
}
function showLevels() {
  if (['playing', 'drawing', 'running'].includes(s.mode)) { game.pause(); changed(); saveRun(); }
  showPanel('levels', `<span class="eyebrow">EIGHT LITTLE CHAIN REACTIONS</span><h2 id="panelTitle">Pick a pocket of joy.</h2><p>Wake every jelly to open the next puzzle. Replay a favorite to find a shorter trail.</p><div class="level-grid">${LEVELS.map((level, i) => `<button class="level-choice${level.id === s.level ? ' current' : ''}" data-level="${level.id}" aria-label="Puzzle ${level.id}, ${level.name}${profile.stars[i] ? `, ${profile.stars[i]} stars` : level.id > profile.unlocked ? ', locked' : ''}"${level.id > profile.unlocked ? ' disabled' : ''}><span>${String(level.id).padStart(2, '0')}</span><small>${profile.stars[i] ? '★'.repeat(profile.stars[i]) + '☆'.repeat(3 - profile.stars[i]) : level.id > profile.unlocked ? 'LOCKED' : 'LET’S POP'}</small></button>`).join('')}</div>${button('menuBack', s.mode === 'paused' ? 'BACK TO MY PUZZLE →' : 'BACK →', 'primary')}<p class="fine-print">${profile.stars.reduce((sum, stars) => sum + stars, 0)} / 24 STARS · ${recordsAvailable ? 'SAVED ON THIS DEVICE' : 'STORAGE UNAVAILABLE'}</p>`);
}
function showResult(won) {
  const final = s.level === LEVELS.length, level = LEVELS[s.level - 1];
  showPanel(won ? 'won' : 'failed', `<div class="result-layout"><div><div class="result-stars" aria-label="${won ? `${s.stars} stars` : `${s.awake} of ${s.total} jellies awake`}">${won ? '★'.repeat(s.stars) + '☆'.repeat(3 - s.stars) : '✳'}</div><span class="eyebrow">${won ? final ? 'THE WHOLE PARADE IS AWAKE' : `PUZZLE ${s.level} · ${level.name.toUpperCase()}` : 'A LITTLE MORE CHAIN, PERHAPS?'}</span><h2 id="panelTitle">${won ? final ? 'What a happy little world.' : 'Now that’s a good pop.' : 'Almost a pop party!'}</h2><p>${won ? final ? 'Eight puzzles, so many little pops. Can you wake them with even fewer dominoes?' : s.hintUsed ? 'A lovely chain! Replay without a hint for a chance at three stars.' : `Every jelly is awake. Use ${level.par} dominoes or fewer without a hint for three stars.` : `${s.awake} of ${s.total} jellies woke up. Try branching your trail or getting closer to a jelly.`}</p></div><div><div class="result-stats"><div><strong>${s.used}</strong><span>DOMINOES</span></div><div><strong>${s.awake} / ${s.total}</strong><span>HAPPY JELLIES</span></div><div><strong>${profile.stars.reduce((sum, stars) => sum + stars, 0)}</strong><span>TOTAL STARS</span></div></div>${won && !final ? button('next', 'NEXT LITTLE PUZZLE →', 'primary') : button(won ? 'replay' : 'retry', won ? 'POP THIS ONE AGAIN →' : 'REDRAW & TRY AGAIN →', 'primary')}${won && !final ? button('replay', s.hintUsed ? 'REPLAY WITHOUT THE HINT' : 'TRY FOR A SHORTER TRAIL') : button('levels', 'CHOOSE A PUZZLE')}${!won ? button('hintRetry', 'A LITTLE HINT, PLEASE', 'text-button') : '<a class="text-button" href="./">← ALL GAMES</a>'}<p class="fine-print">${recordsAvailable && storageAvailable ? 'PROGRESS SAVED ON THIS DEVICE' : 'DEVICE STORAGE UNAVAILABLE'}</p></div></div>`);
}
function toast(message, duration = 1.8) {
  $('toast').textContent = message; $('toast').hidden = false; toastUntil = performance.now() + duration * 1000;
}
function refreshHUD() {
  const level = LEVELS[s.level - 1], active = ['playing', 'drawing', 'running'].includes(s.mode);
  $('levelLabel').innerHTML = `${String(s.level).padStart(2, '0')} <small>/ 08</small><span aria-hidden="true">⌄</span>`;
  $('levelName').textContent = level.name; $('goalLabel').textContent = `${s.awake} / ${s.total} HAPPY JELLIES`;
  $('goalFill').style.width = `${s.total ? s.awake / s.total * 100 : 0}%`;
  $('budgetValue').textContent = Math.max(0, s.budget - s.used);
  $('budgetDetail').textContent = `${s.used} / ${s.budget} USED · ${level.par} FOR ★★★`;
  document.querySelector('.budget-info').classList.toggle('empty', s.used >= s.budget);
  $('pauseButton').disabled = !active || contextLost; $('levelButton').disabled = contextLost;
  document.querySelector('.topbar nav').inert = contextLost;
  $('hintButton').disabled = contextLost || !['playing', 'drawing'].includes(s.mode);
  $('retryButton').disabled = contextLost || !active;
  $('controlTitle').textContent = s.mode === 'running' ? 'HERE COMES THE POP!' : s.mode === 'drawing' ? s.used >= s.budget ? 'LIFT TO START THE CHAIN' : 'LIFT YOUR FINGER TO POP' : s.hintVisible ? 'FOLLOW THE DOTTED TRAIL' : 'DRAW FROM THE BLUE SPARK';
  $('controlText').textContent = s.mode === 'running' ? 'A small trail can wake a big world.' : s.mode === 'drawing' ? 'Retrace your trail to make a fork for free.' : s.hintUsed ? level.hint : s.level === 1 ? 'Draw through the jellies. Lift to start!' : level.subtitle;
}
function handleMode() {
  if (s.mode === lastMode) return;
  lastMode = s.mode; dirty = true;
  if (['playing', 'drawing', 'running'].includes(s.mode)) hidePanel();
  if (s.mode === 'paused') { clearInput(false); saveRun(); showPause(); }
  if (s.mode === 'won' || s.mode === 'failed') {
    clearInput(false);
    if (s.mode === 'won') {
      const i = s.level - 1;
      profile.stars[i] = Math.max(profile.stars[i], s.stars);
      profile.bestUsed[i] = Math.min(profile.bestUsed[i] ?? 49, s.used);
      profile.unlocked = Math.max(profile.unlocked, Math.min(LEVELS.length, s.level + 1));
      recordsAvailable = saveProfile();
    }
    saveRun(); showResult(s.mode === 'won');
  }
}
function changed() {
  for (const event of s.events.splice(0)) {
    if (event.type === 'draw' && performance.now() - lastDrawSound > 65) { tone(280 + s.used * 12, .07, .012, 0, 'triangle'); lastDrawSound = performance.now(); }
    if (event.type === 'ignite') tone(230, .17, .035, 0, 'triangle');
    if (event.type === 'pop') tone(330 * 2 ** (Math.min(12, s.awake) / 12), .15, .027);
    if (event.type === 'budget') toast('TRAIL BUDGET REACHED · LIFT TO POP');
    if (event.type === 'blocked') toast('GO AROUND THE BLUE BLOCKS');
    if (event.type === 'won') chime([392, 494, 587, 784]);
    if (event.type === 'failed') tone(247, .22, .025);
  }
  handleMode(); refreshHUD(); dirty = true;
}
function start(level = selectedLevel) {
  if (contextLost) return false;
  clearInput(); unlockAudio(); selectedLevel = Math.max(1, Math.min(LEVELS.length, Math.floor(level) || 1));
  game.start(selectedLevel); lastMode = 'ready'; lastFrame = performance.now(); changed(); saveRun(); return true;
}
function continueRun() {
  const saved = savedRun();
  if (!saved || contextLost || !game.restore(saved)) { showIntro(); return false; }
  unlockAudio(); if (s.mode === 'paused') game.resume();
  selectedLevel = s.level; lastMode = 'ready'; lastFrame = performance.now(); changed(); return true;
}
function retry(hint = false) {
  if (contextLost) return;
  clearInput(); game.retry(); if (hint) game.hint(); lastMode = 'ready'; changed(); saveRun();
}
function doAction(action) {
  unlockAudio();
  if (action === 'start') start();
  if (action === 'continue') continueRun();
  if (action === 'retry') retry();
  if (action === 'replay') start(s.level);
  if (action === 'hintRetry') retry(true);
  if (action === 'next' && !contextLost) { game.next(); selectedLevel = s.level; changed(); saveRun(); }
  if (action === 'resume' && !contextLost) { game.resume(); changed(); lastFrame = performance.now(); }
  if (action === 'help') showHelp();
  if (action === 'levels') showLevels();
  if (action === 'menuBack') { if (s.mode === 'paused') showPause(); else showIntro(); }
  if (action === 'helpBack') {
    if (helpReturn === 'pause') showPause();
    else if (helpReturn === 'won' || helpReturn === 'failed') showResult(helpReturn === 'won');
    else if (helpReturn === 'levels') showLevels();
    else showIntro();
  }
}
$('panelContent').addEventListener('click', event => {
  const target = event.target.closest('button'); if (!target) return;
  if (target.dataset.action) doAction(target.dataset.action);
  if (target.dataset.level) { const level = Number(target.dataset.level); if (level <= profile.unlocked) start(level); }
});
$('soundButton').addEventListener('click', () => { profile.sound = !profile.sound; recordsAvailable = saveProfile(); unlockAudio(); soundUI(); if (profile.sound) chime([392, 523]); });
$('helpButton').addEventListener('click', showHelp);
$('pauseButton').addEventListener('click', () => { game.pause(); changed(); });
$('levelButton').addEventListener('click', showLevels);
$('retryButton').addEventListener('click', () => retry());
$('hintButton').addEventListener('click', () => { clearInput(); game.hint(); changed(); saveRun(); toast('A LITTLE HELP · FOLLOW THE DOTTED TRAIL', 2.5); });
function cellAt(event) { return view?.pick(event.clientX, event.clientY); }
function movePointer(event) {
  if (event.pointerId !== pointer || s.mode !== 'drawing') return;
  for (const sample of event.getCoalescedEvents?.().length ? event.getCoalescedEvents() : [event]) {
    const cell = cellAt(sample);
    if (!cell || lastCell && lastCell.x === cell.x && lastCell.z === cell.z) continue;
    game.drag(cell); lastCell = cell; changed();
  }
}
$('gameStage').addEventListener('pointerdown', event => {
  if (s.mode !== 'playing' || pointer !== null || contextLost || event.pointerType === 'mouse' && event.button !== 0) return;
  event.preventDefault(); unlockAudio(); const cell = cellAt(event);
  if (!cell || !game.begin(cell)) { toast('START AT THE BLUE SPARK'); return; }
  pointer = event.pointerId; lastCell = cell; $('gameStage').setPointerCapture(pointer); changed();
});
$('gameStage').addEventListener('pointermove', movePointer);
$('gameStage').addEventListener('pointerup', event => {
  if (event.pointerId !== pointer) return;
  movePointer(event); clearInput(false); game.release(); changed(); saveRun();
});
for (const type of ['pointercancel', 'lostpointercapture']) $('gameStage').addEventListener(type, event => {
  if (event.pointerId !== pointer) return;
  clearInput(); changed(); saveRun();
});
document.addEventListener('keydown', event => {
  if (event.code === 'Tab' && !$('modalLayer').hidden) {
    const items = [...$('gamePanel').querySelectorAll('button:not(:disabled),a[href]')], first = items[0], last = items.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === $('gamePanel'))) { last?.focus(); event.preventDefault(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === $('gamePanel'))) { first?.focus(); event.preventDefault(); }
    return;
  }
  if (['Escape', 'KeyP'].includes(event.code) && !event.repeat) {
    event.preventDefault();
    if (panelKind === 'help') doAction('helpBack');
    else if (panelKind === 'levels') doAction('menuBack');
    else if (s.mode === 'paused' && !contextLost) doAction('resume');
    else if (['playing', 'drawing', 'running'].includes(s.mode)) { game.pause(); changed(); }
    return;
  }
  if (!$('modalLayer').hidden || contextLost || pointer !== null) return;
  if (['Space', 'Enter'].includes(event.code) && event.target.closest?.('button,a,input,select,textarea,[contenteditable="true"]')) return;
  if (event.code === 'KeyR') { event.preventDefault(); if (!event.repeat) retry(); return; }
  if (event.code === 'KeyH') { event.preventDefault(); if (!event.repeat && s.mode === 'playing') { game.hint(); changed(); saveRun(); } return; }
  if (s.mode !== 'playing' && s.mode !== 'drawing') return;
  const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1] };
  if (event.code === 'Space' || event.code === 'Enter') {
    event.preventDefault(); if (event.repeat) return;
    unlockAudio(); if (s.mode === 'playing') game.begin(LEVELS[s.level - 1].start); else { game.release(); saveRun(); }
    changed(); return;
  }
  const direction = directions[event.code];
  if (direction) {
    event.preventDefault(); unlockAudio(); if (s.mode === 'playing') game.begin(LEVELS[s.level - 1].start);
    const from = s.stroke || LEVELS[s.level - 1].start;
    game.drag({ x: Math.max(0, Math.min(GRID_SIZE - 1, from.x + direction[0])), z: Math.max(0, Math.min(GRID_SIZE - 1, from.z + direction[1])) }); changed();
  }
});
function suspend() {
  clearInput();
  if (['playing', 'drawing', 'running'].includes(s.mode)) { game.pause(); changed(); }
  else if (s.mode !== 'ready') saveRun();
}
window.addEventListener('blur', suspend); window.addEventListener('pagehide', suspend);
document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); else { dirty = true; lastFrame = performance.now(); } });
window.addEventListener('pageshow', () => { dirty = true; lastFrame = performance.now(); });
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden || contextLost || !view) { lastFrame = now; return; }
  const targetRate = touch ? s.mode === 'playing' ? 15 : 30 : 60;
  if (now - lastFrame < 1000 / targetRate - 1 && !dirty) return;
  const elapsed = Math.min(.1, (now - (lastFrame || now)) / 1000); lastFrame = now;
  if (realtime && ['playing', 'drawing', 'running'].includes(s.mode)) {
    game.advance(elapsed);
    if (s.events.length || s.mode !== lastMode) changed();
    else if (now - lastUI > 100) { refreshHUD(); lastUI = now; }
  }
  if (toastUntil && now >= toastUntil) { $('toast').hidden = true; toastUntil = 0; }
  const animate = ['playing', 'drawing', 'running'].includes(s.mode) && !(reducedMotion.matches && s.mode === 'playing');
  if (dirty || realtime && animate) { view.render(s, now / 1000); renderCount++; dirty = false; }
  if (s.mode !== 'drawing' && s.ticks - lastSavedTick >= 300 && s.mode !== 'ready') saveRun();
}
try {
  view = createPopwakeScene($('gameStage'), {
    resized: () => { const drawing = s.mode === 'drawing'; clearInput(); if (drawing) { changed(); saveRun(); } dirty = true; },
    lost: () => { contextLost = true; suspend(); showRestoring(); refreshHUD(); },
    restored: () => {
      contextLost = false; dirty = true;
      if (s.mode === 'paused') showPause();
      else if (s.mode === 'won' || s.mode === 'failed') showResult(s.mode === 'won');
      else showIntro();
      refreshHUD(); toast('READY TO POP AGAIN!');
    },
  });
  soundUI(); refreshHUD(); showIntro(); $('loading').hidden = true; document.body.dataset.ready = 'true';
  if (query.has('continue') && savedRun()) continueRun();
  if (query.has('debug')) window.__popwake = {
    game, view, start, save: saveRun, continueRun, refresh: changed,
    advance(seconds) { game.advance(seconds); changed(); },
    setRealtime(value) { realtime = !!value; lastFrame = performance.now(); dirty = true; },
    get renderCount() { return renderCount; }, get profile() { return JSON.parse(JSON.stringify(profile)); },
  };
  requestAnimationFrame(frame);
} catch (error) {
  console.error(error);
  $('loading').innerHTML = '<span aria-hidden="true">✳</span><strong>This little world needs a browser with WebGL.</strong><span>Try reloading or opening this page in your regular browser.</span><a href="./">← Back to games</a>';
}
