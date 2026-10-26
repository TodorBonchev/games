import { createBorrowed, parseBorrowedSave, insideTriangle, edgeDistance } from './borrowed-game.js';
import { CHAMBERS, chamberFor, bloomPosition } from './borrowed-levels.js';
import { createBorrowedScene } from './borrowed-scene.js';
import { readGameSave, writeGameSave, removeGameSave } from './save-store.js?v2';

const $ = id => document.getElementById(id);
const query = new URLSearchParams(location.search);
const touch = matchMedia('(pointer: coarse)').matches;
const PROFILE_KEY = 'games:borrowed:progress';
const roman = ['Ⅰ', 'Ⅱ', 'Ⅲ'];
let profile = { records: {}, difficulty: 'flow', sound: false };
try {
  const saved = JSON.parse(localStorage.getItem(PROFILE_KEY));
  if (saved?.version === 1) {
    profile.difficulty = saved.difficulty === 'rift' ? 'rift' : 'flow'; profile.sound = saved.sound === true;
    for (const room of CHAMBERS) {
      const record = saved.records?.[room.id];
      if (record && Number.isInteger(record.stars) && record.stars >= 1 && record.stars <= 3 && Number.isFinite(record.score) && record.score > 0 && Number.isInteger(record.loops) && record.loops > 0) profile.records[room.id] = { stars: record.stars, score: record.score, loops: record.loops };
    }
  }
} catch { /* Play remains available when device storage is disabled. */ }
const game = createBorrowed({ level: query.get('level'), difficulty: profile.difficulty });
const s = game.state;
let view, dirty = true, lastMode = 'ready', panelKind = '', helpReturn = 'intro', contextLost = false;
let lastFrame = 0, lastUI = 0, lastSavedTick = 0, renderCount = 0, realtime = true, storageAvailable = true;
let toastUntil = 0, feedbackUntil = 0, feedback = '', previousFocus;
let stickPointer = null, snapPointer = null, stickX = 0, stickZ = 0, target = null;
const keys = new Set();
let audio;

function saveProfile() { try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ version: 1, ...profile })); } catch { /* Optional preferences. */ } }
function savedRun() { const data = readGameSave('borrowed')?.data; return parseBorrowedSave(data); }
function saveRun() {
  const data = game.snapshot(); if (!data) return false;
  const ok = writeGameSave('borrowed', data); storageAvailable = ok; lastSavedTick = s.ticks;
  $('saveStatus').textContent = ok ? 'PROGRESS SAVED ON THIS DEVICE' : 'DEVICE STORAGE UNAVAILABLE · YOU CAN STILL PLAY';
  $('saveStatus').classList.toggle('failed', !ok); return ok;
}
function unlockAudio() {
  if (!profile.sound) return;
  try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume().catch(() => {}); } catch { /* Silent play works in every supported browser. */ }
}
function tone(frequency, seconds = 0.12, volume = 0.035, delay = 0, shape = 'sine') {
  if (!profile.sound || !audio || audio.state !== 'running') return;
  const at = audio.currentTime + delay, oscillator = audio.createOscillator(), gain = audio.createGain();
  oscillator.type = shape; oscillator.frequency.setValueAtTime(frequency, at);
  gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(volume, at + 0.012); gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(at); oscillator.stop(at + seconds + 0.02);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}
function chime(notes = [392, 494, 587], length = 0.25) { notes.forEach((note, i) => tone(note, length, 0.03, i * 0.075)); }
function soundUI() {
  $('soundButton').setAttribute('aria-pressed', String(profile.sound));
  $('soundButton').setAttribute('aria-label', profile.sound ? 'Turn sound off' : 'Turn sound on');
  $('soundButton').innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z${profile.sound ? 'm4 3c3 2 3 6 0 8m3-11c5 4 5 10 0 14' : 'm4 4 6 6m0-6-6 6'}"/></svg>`;
}
function clearInput() {
  keys.clear(); stickX = stickZ = 0; target = null;
  if (stickPointer !== null && $('joystick').hasPointerCapture(stickPointer)) $('joystick').releasePointerCapture(stickPointer);
  if (snapPointer !== null && $('snapButton').hasPointerCapture(snapPointer)) $('snapButton').releasePointerCapture(snapPointer);
  stickPointer = snapPointer = null;
  $('joystick').classList.remove('active'); $('joystickKnob').style.transform = 'translate(-50%,-50%)'; $('snapButton').classList.remove('holding');
}
function showPanel(kind, content) {
  clearInput(); panelKind = kind;
  $('gamePanel').dataset.kind = kind;
  if ($('modalLayer').hidden) previousFocus = document.activeElement;
  $('panelContent').innerHTML = content; $('modalLayer').hidden = false;
  $('controls').inert = true; $('hud').inert = true;
  $('gamePanel').scrollTop = 0; $('gamePanel').focus({ preventScroll: true }); dirty = true;
}
function hidePanel() { panelKind = ''; $('modalLayer').hidden = true; $('controls').inert = false; $('hud').inert = false; previousFocus?.blur?.(); dirty = true; }
const button = (action, label, style = 'secondary') => `<button class="${style}" data-action="${action}">${label}</button>`;
const diagram = `<div class="intro-symbol" aria-hidden="true"><svg viewBox="0 0 360 100"><path class="sail-fill" d="M180 17 55 74H305Z"/><path d="M180 17 55 74H305Z"/><circle class="you" cx="180" cy="17" r="8"/><circle cx="55" cy="74" r="8"/><circle cx="305" cy="74" r="8"/><path d="m145 54 5 8-9 1Zm60-9 5 8-9 1Z"/><circle class="gold" cx="180" cy="62" r="5"/><text x="180" y="1" text-anchor="middle">YOU</text><text x="55" y="97" text-anchor="middle">YOUR PAST</text><text x="305" y="97" text-anchor="middle">YOUR PAST</text></svg></div>`;
function showIntro() {
  const saved = savedRun();
  const record = profile.records[s.level];
  showPanel('intro', `<div class="intro-layout"><div class="intro-copy"><p class="overline">A LITTLE EXPERIMENT IN TIME</p><h1 id="panelTitle">BORROWED<br><span>TOMORROW.</span></h1><p class="lede">Your past selves hold the sail.<br>You decide what it catches.</p>${diagram}<div class="intro-steps"><span><b><i>01</i> Shape it</b>Move one corner.</span><span><b><i>02</i> Snap it</b>Catch. Repair.</span><span><b><i>03</i> Repeat</b>Play with your past.</span></div></div><div class="intro-options"><button class="room-pill" data-action="rooms"><span>0${s.level} / 06</span>${game.room.name}<em>${record ? '★'.repeat(record.stars) : 'CHOOSE'} ↗</em></button><div class="mode-switch" role="group" aria-label="Difficulty"><button data-difficulty="flow" aria-pressed="${s.difficulty === 'flow'}">Flow<small>Room to experiment</small></button><button data-difficulty="rift" aria-pressed="${s.difficulty === 'rift'}">Rift<small>A sharper challenge</small></button></div>${saved ? button('continue', `CONTINUE · CHAMBER ${saved.level} / LOOP ${saved.loop}`, 'primary') + button('start', `NEW RUN · CHAMBER ${s.level}`) : button('start', 'WEAVE YOUR FIRST MEMORY →', 'primary')}${button('help', 'HOW TO PLAY', 'text-button')}<p class="panel-footnote">6 CHAMBERS · ${touch ? 'MADE FOR YOUR THUMBS' : 'WASD + SPACE / TOUCH'} · LOCAL AUTOSAVE</p></div></div>`);
}
function showRooms() {
  showPanel('rooms', `<p class="overline">SIX WAYS TO BORROW TOMORROW</p><h2 id="panelTitle">Pick a chamber.</h2><p>Every room changes the dance. Start anywhere, or follow the thread from chamber one.</p><div class="room-grid">${CHAMBERS.map(room => `<button class="room-card${s.level === room.id ? ' selected' : ''}" data-room="${room.id}" aria-pressed="${s.level === room.id}"><span>0${room.id}<span class="stars">${'★'.repeat(profile.records[room.id]?.stars || 0)}</span></span><strong>${room.name}</strong><small>${room.twist}</small></button>`).join('')}</div>${button('intro', '← BACK', 'secondary')}<p class="panel-footnote">STARS AND BEST SCORES STAY ON THIS DEVICE</p>`);
}
function showHelp() {
  helpReturn = s.mode === 'playing' || s.mode === 'paused' ? 'pause' : panelKind || s.mode;
  if (s.mode === 'playing') { game.pause(); changed(); }
  showPanel('help', `<p class="overline">THREE CORNERS. ONE SHARED FUTURE.</p><h2 id="panelTitle">Make a useful past.</h2>${diagram}<ul class="help-list"><li><span class="help-icon">△</span><span><b>Move to shape your sail. Hold SNAP.</b>Catch pink machines inside the triangle to earn beats. A bigger sail hits harder and catches incoming shots.</span></li><li><span class="help-icon">✦</span><span><b>Repair three clockblooms.</b>Put a glowing bloom inside your sail and SNAP to feed it beats. Bloom Ⅱ opens on loop 2; Ⅲ on loop 3. Later rooms need a sail edge near the bloom.</span></li><li><span class="help-icon">↺</span><span><b>Bank a loop. Keep its path.</b>Your last two routes replay as the other corners. They stop at their last position. Leave memories in different corners to keep the sail open.</span></li><li><span class="help-icon">↯</span><span><b>Dash through danger. Borrow an escape.</b>DASH protects you briefly. BORROW jumps to an echo, but folds your sail until you move away. Banking restores a little health.</span></li></ul>${touch ? '<p>Left thumb: move. Right thumb: hold SNAP. Tap DASH to escape, and BANK LOOP when you’re ready to record another memory.</p>' : '<div class="help-keys">WASD / arrows / click → move · Space / E → hold SNAP<br>Shift → dash · Q → borrow · R → bank · P / Esc → pause</div>'}${button('helpBack', 'GOT IT →', 'primary')}`);
}
function showPause() {
  showPanel('pause', `<p class="overline">YOUR THREAD CAN WAIT</p><h2 id="panelTitle">A moment outside time.</h2><p>Chamber ${s.level} · Loop ${s.loop} · ${Math.ceil(s.duration - s.loopTicks / 60)} seconds left.<br>${storageAvailable ? 'Your memories and progress are saved here.' : 'Device storage is unavailable. Keep this page open to retain this attempt.'}</p>${button('resume', 'KEEP WEAVING →', 'primary')}${button('help', 'HOW TO PLAY')}${button('restart', 'RESTART THIS CHAMBER')}${button('choose', 'CHOOSE A CHAMBER', 'text-button')}<a class="text-button" href="./">← ALL GAMES</a>`);
}
function memoryPicture() {
  const points = s.recording, first = points[0], last = points.at(-1);
  if (!first || !last) return '↝';
  return `<svg class="memory-picture" viewBox="-9 -9 18 18" aria-label="Your recorded route"><circle cx="0" cy="0" r="8.4" fill="#0b1424" stroke="#8be5d833" stroke-width=".15"/><path d="${points.map((p, i) => `${!i || p[3] ? 'M' : 'L'}${p[1]} ${p[2]}`).join(' ')}" fill="none" stroke="#8be5d8" stroke-width=".18" stroke-linecap="round"/><circle cx="${first[1]}" cy="${first[2]}" r=".35" fill="#f0b1cd"/><circle cx="${last[1]}" cy="${last[2]}" r=".5" fill="#eed3a2"/></svg>`;
}
function showBetween() {
  const number = s.memories.length;
  const next = Math.min(3, s.loop + 1);
  showPanel('between', `<p class="overline">LOOP ${s.loop} → ${s.loop + 1}</p><h2 id="panelTitle">A memory,<br>well borrowed.</h2><p>The path you just made will move a corner of your next sail. When it finishes, it waits where you left it.</p><div class="memory-swatch"><span aria-hidden="true">${memoryPicture()}</span><div>${number} ${number === 1 ? 'past self is' : 'past selves are'} coming with you.<small>${s.loop < 3 ? `Bloom ${roman[next - 1]} is ready to wake up next.` : 'Keep your corners apart. Give tomorrow some room.'}</small></div></div>${button('nextLoop', `ENTER LOOP ${s.loop + 1} →`, 'primary')}${button('help', 'A REMINDER OF HOW IT WORKS', 'text-button')}<p class="panel-footnote">+30 THREAD HEALTH · REPAIRS AND BEATS CARRY OVER</p>`);
}
function showWin() {
  const stars = game.rating(), last = s.level === 6;
  showPanel('won', `<p class="overline">${last ? 'A FUTURE WORTH BORROWING' : `CHAMBER 0${s.level} · REPAIRED`}</p><h2 id="panelTitle">${last ? 'Tomorrow,<br>unbroken.' : 'You made time.'}</h2><div class="stars" aria-label="${stars} of 3 stars">${'★'.repeat(stars)}<span style="opacity:.2">${'★'.repeat(3 - stars)}</span></div><p>${last ? 'The Unwinder is quiet. Three little blooms are keeping time again. You did it with a little help from who you used to be.' : game.room.subtitle}</p><div class="result-stats"><div><strong>${Math.round(s.score).toLocaleString()}</strong><span>POINTS</span></div><div><strong>${s.loop}</strong><span>LOOPS</span></div><div><strong>${s.kills}</strong><span>MACHINES CAUGHT</span></div></div>${button(last ? 'choose' : 'nextChamber', last ? 'EXPLORE THE CHAMBERS →' : `NEXT · ${chamberFor(s.level + 1).name.toUpperCase()} →`, 'primary')}${button('restart', 'WEAVE IT AGAIN')}${s.difficulty === 'flow' && last ? button('tryRift', 'TRY THE RIFT CHALLENGE') : ''}<a class="text-button" href="./">← ALL GAMES</a><p class="panel-footnote">${stars === 3 ? 'A BEAUTIFUL MEMORY. BEST RESULT SAVED.' : `THREE STARS: ${game.room.par} LOOPS OR FEWER, AT MOST 5 HITS.`}</p>`);
}
function showLost() {
  showPanel('lost', `<p class="overline">EVERY ATTEMPT LEAVES AN IDEA</p><h2 id="panelTitle">Try a different thread.</h2><p>${s.reason}</p><div class="memory-swatch"><span aria-hidden="true">△</span><div>A little plan for next time.<small>Stay wide, catch machines for beats, then bank each route near a different corner. Hold SNAP while you move.</small></div></div>${button('restart', 'ONE MORE TOMORROW →', 'primary')}${s.difficulty === 'rift' ? button('tryFlow', 'TRY FLOW MODE') : ''}${button('help', 'HOW TO PLAY')}${button('choose', 'CHOOSE A CHAMBER', 'text-button')}`);
}
function toast(message, seconds = 3) { $('toast').textContent = message; $('toast').hidden = false; toastUntil = performance.now() + seconds * 1000; }
function hintText() {
  if (performance.now() < feedbackUntil) return feedback;
  if (s.mode !== 'playing') return game.room.subtitle;
  if (s.bossAwake) return 'Trap the Unwinder’s heart in a wide sail. Hold SNAP.';
  if (s.area < 8) return 'Sail folded. Move away from your echoes to open it.';
  const open = s.blooms.filter(b => b.index < s.loop && b.charge < b.need);
  if (!open.length) return 'This loop’s blooms are repaired. BANK LOOP to wake the next.';
  if (s.beats < 0.5) return 'Hold SNAP to catch machines inside the sail. They become beats.';
  const [x, z] = bloomPosition(game.room, open[0].index, s.loopTicks / 60);
  if (game.room.edge && (!insideTriangle(x, z, s.sail) || edgeDistance(x, z, s.sail) > (s.difficulty === 'flow' ? 1.5 : 1))) return `Skim bloom ${roman[open[0].index]} with a sail edge, then SNAP.`;
  return `Hold SNAP with bloom ${roman[open[0].index]} inside the sail. Feed it your beats.`;
}
function handleMode() {
  if (s.mode === lastMode) return;
  lastMode = s.mode; clearInput(); dirty = true;
  if (s.mode === 'playing') hidePanel();
  if (s.mode === 'paused') { saveRun(); showPause(); }
  if (s.mode === 'between') { saveRun(); showBetween(); }
  if (s.mode === 'won') {
    const old = profile.records[s.level];
    profile.records[s.level] = { stars: Math.max(old?.stars || 0, game.rating()), score: Math.max(old?.score || 0, s.score), loops: Math.min(old?.loops || 99, s.loop) };
    saveProfile(); saveRun(); showWin(); chime([392, 494, 587, 784], 0.4);
  }
  if (s.mode === 'lost') { removeGameSave('borrowed'); showLost(); tone(147, 0.5, 0.04); }
}
function refreshHUD() {
  const room = game.room, time = Math.max(0, s.duration - s.loopTicks / 60), active = s.mode === 'playing' && !contextLost;
  $('chamberNumber').textContent = `CHAMBER 0${s.level} / 06`; $('chamberName').textContent = room.name;
  $('loopLabel').textContent = `LOOP ${s.loop} / ${s.maxLoops}`; $('clockValue').textContent = Math.ceil(time);
  $('clockRing').style.strokeDashoffset = String(100.53 * (1 - time / s.duration));
  $('clockValue').closest('.loop-clock').classList.toggle('urgent', time <= 5);
  $('healthValue').textContent = `${Math.ceil(s.hp / s.maxHp * 100)}%`; $('healthFill').style.width = `${s.hp / s.maxHp * 100}%`;
  const harmony = Math.min(4, 1 + Math.floor(s.combo / 4));
  $('scoreValue').textContent = `${Math.round(s.score).toLocaleString()} points${harmony > 1 ? ` · ×${harmony}` : ''}`;
  $('scoreValue').style.color = harmony > 1 ? 'var(--gold)' : ''; $('beatValue').textContent = Number(s.beats.toFixed(1));
  s.blooms.forEach((bloom, i) => {
    const node = document.querySelector(`[data-bloom="${i}"]`), done = bloom.charge >= bloom.need;
    node.classList.toggle('available', i < s.loop); node.classList.toggle('complete', done);
    node.querySelector('b').style.width = `${bloom.charge / bloom.need * 100}%`;
    node.querySelector('em').textContent = done ? 'REPAIRED' : i < s.loop ? `${Number(bloom.charge.toFixed(1))} / ${bloom.need}` : `LOOP ${i + 1}`;
    node.setAttribute('aria-label', `Bloom ${i + 1}: ${done ? 'repaired' : i < s.loop ? `${bloom.charge} of ${bloom.need} beats` : `opens on loop ${i + 1}`}`);
  });
  $('pauseButton').disabled = !active; $('snapButton').disabled = !active;
  $('dashButton').disabled = !active || s.dashCooldown > 0;
  $('dashButton').querySelector('small').textContent = s.dashCooldown > 0 ? `${s.dashCooldown.toFixed(1)}s` : 'READY';
  $('borrowButton').disabled = !active || s.borrowCooldown > 0 || !s.memories.length;
  $('borrowButton').querySelector('small').textContent = !s.memories.length ? 'AFTER LOOP 1' : s.borrowCooldown > 0 ? `${s.borrowCooldown.toFixed(1)}s` : 'ECHO STEP';
  $('bankButton').disabled = !active || s.loopTicks < 120;
  const suggested = s.blooms.every(b => b.index >= s.loop || b.charge >= b.need) && !s.bossAwake;
  $('bankButton').classList.toggle('suggested', suggested);
  $('bankDetail').textContent = s.loop === s.maxLoops ? 'LAST LOOP' : suggested ? 'NEXT BLOOM →' : 'LEAVE A MEMORY';
  $('sailReadout').classList.toggle('thin', s.area < 8);
  $('sailReadout').querySelector('span').textContent = s.area < 8 ? 'SAIL FOLDED' : s.area >= 32 ? 'WIDE SAIL · 3× POWER' : 'SAIL OPEN · 2× POWER';
  $('hintText').textContent = hintText();
  $('bossHealth').hidden = !s.bossAwake; $('bossFill').style.width = `${s.bossHp / 30 * 100}%`;
  document.body.classList.toggle('hurt-flash', s.hurt > 0);
}
function worldLabels() {
  s.sail.forEach(([x, z], i) => {
    const node = $(i ? `echoLabel${i}` : 'youLabel'), point = view.project(x, z, 1.35);
    node.style.left = `${point.x}px`; node.style.top = `${point.y}px`;
    if (i) node.textContent = i <= s.memories.length ? `PAST ${i}` : 'ANCHOR';
  });
  s.blooms.forEach((bloom, i) => {
    const [x, z] = bloomPosition(game.room, i, s.loopTicks / 60), point = view.project(x, z, 1.45), node = $(`bloomLabel${i}`);
    node.style.left = `${point.x}px`; node.style.top = `${point.y}px`;
    node.classList.toggle('complete', bloom.charge >= bloom.need); node.classList.toggle('waiting', i >= s.loop);
  });
}
function changed() {
  for (const event of s.events.splice(0)) {
    if (event.type === 'snap') { tone(150 + Math.min(60, s.area) * 4, 0.14, event.caught ? 0.04 : 0.015, 0, 'triangle'); if (event.fed) { feedback = `+${Number(event.fed.toFixed(1))} beats woven into the blooms`; feedbackUntil = performance.now() + 1100; tone(660, 0.18, 0.025, 0.06); } }
    if (event.type === 'thin') { feedback = 'Move away from your echoes to open the sail.'; feedbackUntil = performance.now() + 1200; tone(110, 0.09, 0.02); }
    if (event.type === 'bloom') { toast(`Bloom ${roman[event.index]} repaired. ${s.loop < 3 && s.blooms.every(b => b.index >= s.loop || b.charge >= b.need) ? 'Bank this loop to wake the next.' : 'Keep weaving.'}`); chime(); }
    if (event.type === 'loop') toast(s.loop === 1 ? s.level === 1 ? 'Move to shape the sail. Hold SNAP to catch machines.' : game.room.lesson : `${s.memories.length} past ${s.memories.length === 1 ? 'self' : 'selves'}. A new corner is yours.`, s.loop === 1 && s.level > 1 ? 7 : 4);
    if (event.type === 'bank') chime([262, 330, 392]);
    if (event.type === 'dash') tone(220, 0.1, 0.025, 0, 'triangle');
    if (event.type === 'borrow') chime([659, 440], 0.16);
    if (event.type === 'hurt') tone(85, 0.15, 0.04, 0, 'triangle');
    if (event.type === 'boss') { toast('The Unwinder wakes. Catch its heart inside a wide sail.', 5); chime([196, 247, 294], 0.4); }
    if (event.type === 'bossHit') tone(110 + s.bossHp * 6, 0.2, 0.05, 0, 'triangle');
  }
  handleMode(); refreshHUD(); dirty = true;
}
function start(id = s.level, difficulty = s.difficulty) {
  if (contextLost) return;
  unlockAudio(); profile.difficulty = difficulty; saveProfile();
  game.start(id, difficulty); lastMode = 'ready'; feedbackUntil = 0; lastFrame = performance.now(); changed(); saveRun();
}
function continueRun() {
  const saved = savedRun(); if (!saved || contextLost || !game.restore(saved)) { showIntro(); return false; }
  if (s.mode === 'paused') game.resume(); lastMode = 'ready'; lastFrame = performance.now(); changed(); return true;
}
function doAction(action) {
  unlockAudio();
  if (action === 'start' || action === 'restart') start();
  if (action === 'continue') continueRun();
  if (action === 'resume' && !contextLost) { game.resume(); lastFrame = performance.now(); changed(); }
  if (action === 'nextLoop') { game.nextLoop(); lastFrame = performance.now(); changed(); saveRun(); }
  if (action === 'nextChamber') start(Math.min(6, s.level + 1));
  if (action === 'tryRift') start(1, 'rift');
  if (action === 'tryFlow') start(s.level, 'flow');
  if (action === 'rooms') showRooms();
  if (action === 'choose') { game.reset(s.level, s.difficulty); lastMode = 'ready'; changed(); showRooms(); }
  if (action === 'intro') showIntro();
  if (action === 'help') showHelp();
  if (action === 'helpBack') {
    if (helpReturn === 'pause') showPause();
    else if (helpReturn === 'between') showBetween();
    else if (helpReturn === 'won') showWin();
    else if (helpReturn === 'lost') showLost();
    else if (helpReturn === 'rooms') showRooms();
    else showIntro();
  }
}
$('panelContent').addEventListener('click', event => {
  const node = event.target.closest('button'); if (!node) return;
  if (node.dataset.action) doAction(node.dataset.action);
  if (node.dataset.room) { game.reset(Number(node.dataset.room), s.difficulty); lastMode = 'ready'; refreshHUD(); showIntro(); }
  if (node.dataset.difficulty) { game.reset(s.level, node.dataset.difficulty); profile.difficulty = s.difficulty; saveProfile(); refreshHUD(); showIntro(); }
});
$('soundButton').addEventListener('click', () => { profile.sound = !profile.sound; saveProfile(); unlockAudio(); soundUI(); if (profile.sound) chime([392, 494], 0.18); });
$('helpButton').addEventListener('click', showHelp);
$('pauseButton').addEventListener('click', () => { game.pause(); changed(); });
$('bankButton').addEventListener('click', () => { unlockAudio(); game.bank(); changed(); });
$('dashButton').addEventListener('pointerdown', event => { event.preventDefault(); unlockAudio(); game.dash(); changed(); });
$('borrowButton').addEventListener('pointerdown', event => { event.preventDefault(); unlockAudio(); game.borrow(); changed(); });
// Click also supports keyboard activation; pointer actions above respond without delay.
$('dashButton').addEventListener('click', event => { if (!event.detail) { game.dash(); changed(); } });
$('borrowButton').addEventListener('click', event => { if (!event.detail) { game.borrow(); changed(); } });
$('snapButton').addEventListener('pointerdown', event => {
  if (s.mode !== 'playing' || snapPointer !== null) return;
  event.preventDefault(); unlockAudio(); snapPointer = event.pointerId; $('snapButton').setPointerCapture(event.pointerId);
  $('snapButton').classList.add('holding'); game.snap(); changed();
});
function releaseSnap(event) { if (event.pointerId !== snapPointer) return; snapPointer = null; $('snapButton').classList.remove('holding'); }
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('snapButton').addEventListener(type, releaseSnap);
$('snapButton').addEventListener('click', event => { if (!event.detail) { unlockAudio(); game.snap(); changed(); } });
function moveStick(event) {
  if (event.pointerId !== stickPointer) return;
  const rect = $('joystick').getBoundingClientRect(), radius = rect.width * 0.35;
  const x = (event.clientX - rect.left - rect.width / 2) / radius, z = (event.clientY - rect.top - rect.height / 2) / radius, length = Math.max(1, Math.hypot(x, z));
  stickX = x / length; stickZ = z / length;
  if (Math.hypot(stickX, stickZ) < 0.12) stickX = stickZ = 0;
  $('joystickKnob').style.transform = `translate(calc(-50% + ${stickX * radius}px),calc(-50% + ${stickZ * radius}px))`;
}
$('joystick').addEventListener('pointerdown', event => {
  if (s.mode !== 'playing' || stickPointer !== null) return;
  event.preventDefault(); unlockAudio(); stickPointer = event.pointerId; target = null;
  $('joystick').setPointerCapture(event.pointerId); $('joystick').classList.add('active'); moveStick(event);
});
$('joystick').addEventListener('pointermove', moveStick);
function releaseStick(event) {
  if (event.pointerId !== stickPointer) return;
  stickPointer = null; stickX = stickZ = 0; $('joystick').classList.remove('active'); $('joystickKnob').style.transform = 'translate(-50%,-50%)';
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('joystick').addEventListener(type, releaseStick);
$('timeStage').addEventListener('pointerdown', event => {
  if (s.mode === 'playing' && !touch && view) {
    unlockAudio(); const picked = view.pick(event.clientX, event.clientY);
    if (picked) { game.constrain(picked); target = picked; }
  }
});
document.addEventListener('keydown', event => {
  const key = event.code;
  if (key === 'Tab' && !$('modalLayer').hidden) {
    const items = [...$('gamePanel').querySelectorAll('button:not(:disabled),a[href]')], first = items[0], last = items.at(-1);
    if (!items.length) return;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === $('gamePanel'))) { last.focus(); event.preventDefault(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === $('gamePanel'))) { first.focus(); event.preventDefault(); }
    return;
  }
  if ((key === 'Escape' || key === 'KeyP') && !event.repeat) {
    event.preventDefault(); if (panelKind === 'help') doAction('helpBack'); else if (s.mode === 'playing') { game.pause(); changed(); } else if (panelKind === 'pause' && !contextLost) { game.resume(); changed(); } return;
  }
  if (s.mode !== 'playing' || !$('modalLayer').hidden) return;
  if (!['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyE','KeyQ','KeyR','ShiftLeft','ShiftRight'].includes(key)) return;
  event.preventDefault(); unlockAudio(); keys.add(key); target = null;
  if (!event.repeat) { if (key.startsWith('Shift')) game.dash(); if (key === 'KeyQ') game.borrow(); if (key === 'KeyR') game.bank(); changed(); }
  $('snapButton').classList.toggle('holding', keys.has('Space') || keys.has('KeyE') || snapPointer !== null);
});
document.addEventListener('keyup', event => { keys.delete(event.code); $('snapButton').classList.toggle('holding', keys.has('Space') || keys.has('KeyE') || snapPointer !== null); });
function suspend() { clearInput(); if (s.mode === 'playing') { game.pause(); changed(); } else if (['paused','between','won'].includes(s.mode)) saveRun(); }
window.addEventListener('blur', suspend);
document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); else { lastFrame = performance.now(); dirty = true; } });
window.addEventListener('pagehide', suspend);
window.addEventListener('pageshow', () => { lastFrame = performance.now(); dirty = true; });
function input() {
  let x = stickX + Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  let z = stickZ + Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp'));
  if (!x && !z && target) { const dx = target.x - s.player.x, dz = target.z - s.player.z, length = Math.hypot(dx, dz); if (length < 0.16) target = null; else { x = dx / Math.max(0.6, length); z = dz / Math.max(0.6, length); } }
  return { x, z, pulse: snapPointer !== null || keys.has('Space') || keys.has('KeyE') };
}
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden || contextLost || !view) { lastFrame = now; return; }
  const elapsed = Math.min(0.1, (now - (lastFrame || now)) / 1000);
  if (now - lastFrame < (touch ? 1000 / 30 : 1000 / 60) - 1 && !dirty) return;
  lastFrame = now;
  if (realtime && s.mode === 'playing') { game.advance(elapsed, input()); handleEventsForFrame(now); }
  if (toastUntil && now > toastUntil) { $('toast').hidden = true; toastUntil = 0; }
  if (dirty || (realtime && s.mode === 'playing')) {
    view.render(s, s.ticks / 60); worldLabels(); renderCount++; dirty = false;
  }
  if (s.mode === 'playing' && s.ticks - lastSavedTick >= 300) saveRun();
}
function handleEventsForFrame(now) {
  if (s.events.length || s.mode !== lastMode) changed();
  else if (now - lastUI > 100) { refreshHUD(); lastUI = now; }
}
try {
  view = createBorrowedScene($('timeStage'), {
    resized: () => { clearInput(); dirty = true; },
    lost: () => { contextLost = true; suspend(); toast('The garden is restoring its picture. Your thread is saved.', 8); },
    restored: () => { contextLost = false; dirty = true; if (s.mode === 'paused') showPause(); refreshHUD(); toast('The garden is back. Resume when you’re ready.'); },
  });
  soundUI(); refreshHUD(); showIntro();
  $('loading').hidden = true; document.body.dataset.ready = 'true';
  if (query.has('continue') && savedRun()) continueRun();
  if (query.has('debug')) window.__borrowed = {
    game, view, start, save: saveRun, continueRun, refresh: changed,
    advance(seconds, control = {}) { game.advance(seconds, control); changed(); },
    setRealtime(value) { realtime = !!value; lastFrame = performance.now(); dirty = true; },
    get renderCount() { return renderCount; },
    get input() { return input(); },
    get profile() { return JSON.parse(JSON.stringify(profile)); },
  };
  requestAnimationFrame(frame);
} catch (error) {
  console.error(error);
  $('loading').innerHTML = '<span class="loading-mark">△</span><strong>This garden needs a browser with WebGL.</strong><span>Try reloading or opening this page in your regular browser.</span><a href="./">← Back to games</a>';
}
