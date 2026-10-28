import { CHAPTERS, MISSIONS, missionById, readProgress, writeProgress, chapterCount, unlockedChapter, festivalReady, isUnlocked, nextMission, completeMission } from './progress.js';
import { arcadeById } from '../arcade/catalog.js';
import { readArcadeSave } from '../arcade/storage.js';
import { readGameSave } from '../save-store.js';
import { createVoyageMap } from './map-scene.js';

const $ = id => document.getElementById(id), stage = $('stage');
const touch = matchMedia('(pointer: coarse)').matches, reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const query = new URLSearchParams(location.search), legacy = new Set(['dewfall', 'pondpost', 'ribbon', 'moonbounce', 'popwake']);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const button = (action, label, primary = false) => `<button class="${primary ? 'primary' : 'secondary'}" data-action="${action}">${label}</button>`;
const portrait = id => legacy.has(id) ? `assets/${id}-preview-480.webp` : `assets/arcade/${id}-480.webp`;
const originalTitle = id => arcadeById.get(id)?.title || ({ dewfall: 'Dewdrop Drift', pondpost: 'Pond Post', ribbon: 'Ribbon Reef', moonbounce: 'Moonbounce', popwake: 'Popwake' })[id];
const instructions = id => arcadeById.get(id)?.instructions || ({
  dewfall: 'Hold anywhere in the garden, then slide gently to tilt it. Roll the blue drops into the flowers. Lift to slow down. Fill every flower; there is no timer.',
  pondpost: 'Hold anywhere and pull back to aim a hop. The dotted arc shows where you will land. Lift to leap. Reach the mailbox; a missed hop returns you to a safe pad.',
  ribbon: 'Hold and slide to steer Ray through the glowing arches. Collect pearls with your ribbon tail. Reach the end of this current before you lose your hearts.',
  moonbounce: 'Hold and slide to steer Nova and gather moons. Lift your finger to launch them into the grumps. Clear one wave to make the bay peaceful.',
  popwake: 'Start at the blue spark. Draw a trail through neighboring squares, then lift to set off a chain reaction. Wake every jelly. You can retrace your trail to branch. Use Hint if you get stuck.',
})[id];
let progress = readProgress(), mapView = null, controller = null, currentId = null, pendingId = null;
let phase = 'map', panelKind = '', screen = 'map', seed = 1, loadToken = 0, contextLost = false, mapLost = false;
let pointer = null, px = 0, py = 0, keyboardHeld = false, kx = .5, ky = .5, releaseDispatch = false;
let suppressPointer = null, suppressUntil = 0, dirty = true, lastFrame = 0, lastRender = 0, lastSave = 0, renderCount = 0, realtime = true;
let storageOK = true, soundOn = false, audio, voices = 0, festivalTimer = null;
try { soundOn = localStorage.getItem('games:wonderwake:sound') === '1'; } catch {}
function soundUI() { $('soundButton').textContent = soundOn ? '♫' : '♪'; $('soundButton').setAttribute('aria-pressed', String(soundOn)); $('soundButton').setAttribute('aria-label', soundOn ? 'Turn sound off' : 'Turn sound on'); }
function unlockAudio() { if (!soundOn) return; try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume().catch(() => {}); } catch {} }
function sound(frequency = 500, duration = .17) {
  if (!soundOn || !audio || audio.state !== 'running' || voices >= 8) return;
  try { const oscillator = audio.createOscillator(), gain = audio.createGain(), now = audio.currentTime; voices++;
    oscillator.frequency.value = Math.max(70, Math.min(4000, frequency)); gain.gain.setValueAtTime(.0001, now); gain.gain.linearRampToValueAtTime(.035, now + .01); gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(now + duration + .02); oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); voices--; };
  } catch {}
}
function persist() {
  storageOK = writeProgress(progress); lastSave = performance.now();
  for (const id of ['mapSave', 'playSave']) { $(id).textContent = storageOK ? 'YOUR VOYAGE SAVES ON THIS DEVICE' : 'STORAGE UNAVAILABLE · KEEP THIS PAGE OPEN'; $(id).classList.toggle('failed', !storageOK); }
  return storageOK;
}
function checkpoint() {
  if (controller && currentId && controller.state.mode === 'playing') {
    try { const state = controller.snapshot(); if (state) progress.checkpoints[currentId] = { id: currentId, seed, state }; } catch { storageOK = false; }
  }
  persist();
}
function cancelInput() {
  if (controller && (pointer !== null || keyboardHeld)) controller.pointer('cancel', px, py);
  const old = pointer; pointer = null; keyboardHeld = false;
  if (old !== null && stage.hasPointerCapture(old)) stage.releasePointerCapture(old);
  $('keyCursor').hidden = true;
}
function showPanel(kind, html) {
  if (pointer !== null) { suppressPointer = pointer; suppressUntil = Infinity; }
  else if (releaseDispatch) suppressUntil = performance.now() + 500;
  cancelInput(); panelKind = kind; $('panel').dataset.kind = kind; $('panelContent').innerHTML = html;
  $('modal').hidden = false; $('app').inert = true; $('panel').scrollTop = 0; $('panel').focus({ preventScroll: true }); dirty = true;
}
function hidePanel() { panelKind = ''; $('modal').hidden = true; $('app').inert = false; dirty = true; if (screen === 'mission') stage.focus({ preventScroll: true }); }
function setScreen(next) {
  screen = next; const playing = next === 'mission';
  document.body.classList.toggle('playing', playing); $('mapScreen').hidden = playing; $('playScreen').hidden = !playing;
  $('pauseButton').hidden = !playing; $('crewButton').hidden = playing;
}
function disposeMission() { cancelInput(); controller?.dispose(); controller = null; currentId = null; contextLost = false; }
function stopCelebration() { clearTimeout(festivalTimer); festivalTimer = null; delete progress.celebrating; document.querySelector('.festival-sky')?.remove(); if ($('modal').hidden) $('app').inert = false; }
function showMap() {
  loadToken++; if (controller) checkpoint(); disposeMission(); stopCelebration();
  phase = 'map'; setScreen('map'); hidePanel(); $('loading').hidden = true;
  if (!mapView) {
    try { mapView = createVoyageMap($('world'), { onSelect: selectChapter,
      onLost() { mapLost = true; $('worldCaption').textContent = 'Restoring the view… Your voyage is safe.'; },
      onRestored() { mapLost = false; dirty = true; renderMapUI(); },
    }); } catch (error) { $('worldCaption').textContent = 'The map picture is unavailable. Choose an island below to keep playing.'; }
  }
  renderMapUI(); mapView?.resize(); dirty = true;
}
function renderMapUI() {
  const chapter = CHAPTERS[progress.chapter], count = chapterCount(progress, progress.chapter), unlocked = unlockedChapter(progress);
  document.documentElement.style.setProperty('--accent', chapter.color);
  $('crewCount').textContent = `${progress.completed.length} / 25`;
  $('beaconCount').textContent = `${CHAPTERS.filter((_, i) => chapterCount(progress, i) >= 3).length} / 5 BEACONS`;
  $('chapterNumber').textContent = `ISLAND ${String(progress.chapter + 1).padStart(2, '0')} / 05`;
  $('islandTitle').textContent = chapter.title; $('islandCount').textContent = count >= 3 ? '✦' : `${count} / 3`;
  $('islandCount').setAttribute('aria-label', `${count} of 5 friends helped. ${count >= 3 ? 'Beacon lit.' : 'Help 3 to light the beacon.'}`);
  $('islandStory').textContent = count >= 3 ? `${chapter.reward} ${count === 5 ? 'Every friend here is on your crew.' : 'You can sail on or stay to meet everyone.'}` : `${chapter.subtitle} Help ${3 - count} ${count === 2 ? 'more friend' : 'friends'} to light its beacon.`;
  $('chapterNav').innerHTML = CHAPTERS.map((item, i) => `<button data-chapter="${i}" aria-label="Island ${i + 1}: ${esc(item.title)}${i > unlocked ? ', help three friends on the previous island to unlock' : ''}" aria-current="${progress.chapter === i}" data-lit="${chapterCount(progress, i) >= 3}" ${i > unlocked ? 'disabled' : ''}>${i > unlocked ? '·' : chapterCount(progress, i) >= 3 ? '✦' : String(i + 1).padStart(2, '0')}</button>`).join('');
  $('missionList').innerHTML = chapter.missions.map(id => {
    const m = missionById.get(id), done = progress.completed.includes(id), saved = !!progress.checkpoints[id];
    return `<button class="mission-card" data-mission="${id}" data-done="${done}" aria-label="${esc(m.title)} with ${esc(m.hero)}${done ? ', already on your crew, play again' : saved ? ', continue saved challenge' : ''}"><img src="${portrait(id)}" alt="" width="64" height="64"><span><strong>${esc(m.title)}</strong><small>${esc(m.hero)}</small><small class="mission-meta">${done ? '✓ ON YOUR CREW · PLAY AGAIN' : saved ? 'CONTINUE CHALLENGE' : `${m.gesture}${m.relaxed ? ' · TAKE YOUR TIME' : ''}`}</small></span><span class="mission-arrow" aria-hidden="true">${done ? '✓' : '↗'}</span></button>`;
  }).join('');
  let label, action, id = nextMission(progress);
  if (progress.active && isUnlocked(progress, progress.active.id) && progress.checkpoints[progress.active.id]) { label = `Continue: ${missionById.get(progress.active.id).title}`; action = `mission:${progress.active.id}`; }
  else if (festivalReady(progress) && !progress.festivalSeen || progress.completed.length === 25 && !progress.fullCrewSeen) { label = progress.completed.length === 25 ? 'The whole crew is here · Light the sky' : 'Five beacons lit · Start the festival'; action = 'festival'; }
  else if (count >= 3 && progress.chapter < 4) { label = `Sail to ${CHAPTERS[progress.chapter + 1].title}`; action = `sail:${progress.chapter + 1}`; }
  else if (id) { label = progress.completed.length ? `Next friend: ${missionById.get(id).hero.split(' the ')[0]}` : 'Begin the voyage → Wake the wildflowers'; action = `mission:${id}`; }
  else if (festivalReady(progress)) { label = 'Visit the festival'; action = 'festival'; }
  else { label = 'Revisit your first friend'; action = `mission:${chapter.missions[0]}`; }
  $('mainAction').innerHTML = `<button data-action="${action}">${esc(label)}<span aria-hidden="true">→</span></button>`;
  $('worldCaption').textContent = progress.completed.length === 25 ? 'Twenty-five friends. Five bright islands. One beautiful adventure.' : progress.completed.length ? `${progress.completed.length} friends aboard. Each one brought a little more life.` : 'Start small. Every friend brings a little more life.';
  $('voyageSummary').innerHTML = progress.festivalSeen ? `The festival is glowing.<br>${25 - progress.completed.length ? `${25 - progress.completed.length} friends are still waiting to join your crew.` : 'Everyone made it. Take the long way home.'}` : 'Five sleeping islands need a festival.<br>Help any three friends on each island to bring it back.';
  dirty = true;
}
function selectChapter(index) {
  if (!Number.isInteger(index) || index < 0 || index > unlockedChapter(progress)) return;
  progress.chapter = index; persist(); renderMapUI();
}
function oldCheckpoint(id) {
  if (progress.completed.includes(id)) return null;
  if (!legacy.has(id)) { const old = readArcadeSave(id); return old?.mode === 'playing' ? { id, seed: old.seed, state: old.state } : null; }
  const old = readGameSave(id)?.data;
  if (!old || !['playing', 'paused', 'running', 'drawing', 'aiming', 'flying', 'recovering'].includes(old.mode) || id === 'moonbounce' && old.wave !== 1) return null;
  return { id, seed: 82941, state: { schema: 1, id, level: old.level || 1, mode: 'playing', engine: old, finish: null } };
}
function missionIntro(id) {
  if (!isUnlocked(progress, id)) return;
  pendingId = id; const m = missionById.get(id), existing = progress.checkpoints[id] || oldCheckpoint(id), done = progress.completed.includes(id);
  showPanel('missionIntro', `<img class="mission-portrait" src="${portrait(id)}" alt="${esc(m.hero)}"><p class="eyebrow">${esc(CHAPTERS[m.chapter].title)} · ${esc(originalTitle(id))}</p><h2 id="panelTitle">${esc(m.title)}.</h2><span class="gesture-tag">${esc(m.gesture)}</span><p><strong>${esc(m.hero)}</strong> needs a hand. ${esc(instructions(id))}</p><div class="gift"><strong>${done ? 'A friend worth another visit' : 'Bring back: ' + esc(m.gift)}</strong><p>${done ? 'Try another round. Your crew and beacon stay safe.' : 'Finish this challenge to invite your friend aboard and restore a little of the island.'}</p></div>${button(existing ? 'continueMission' : 'startMission', existing ? 'CONTINUE CHALLENGE →' : 'LET’S HELP →', true)}${existing ? button('freshMission', 'START THIS CHALLENGE AGAIN') : ''}${button('close', '← BACK TO THE ISLAND')}<p class="fine">ONE ${arcadeById.get(id)?.category === 'Puzzles' ? 'PUZZLE' : legacy.has(id) ? 'ROUTE OR ROUND' : 'LITTLE CHALLENGE'} · CHANGE FRIENDS ANY TIME</p>`);
}
async function startMission(id = pendingId, fresh = false) {
  if (!isUnlocked(progress, id)) return;
  const token = ++loadToken; if (controller) checkpoint(); disposeMission(); mapView?.dispose(); mapView = null; mapLost = false;
  stopCelebration(); hidePanel(); phase = 'loading'; setScreen('mission'); currentId = id;
  $('loading').hidden = false; $('loading').innerHTML = '<span>✦</span><strong>Meeting your next friend…</strong>';
  const m = missionById.get(id); progress.chapter = m.chapter; progress.active = { id }; progress.checkpoints[id] ||= oldCheckpoint(id) || undefined;
  const saved = fresh ? null : progress.checkpoints[id];
  if (fresh) delete progress.checkpoints[id];
  seed = saved?.seed ?? crypto.getRandomValues(new Uint32Array(1))[0];
  try {
    const factory = legacy.has(id) ? (await import('./legacy.js')).createLegacy : (await import('./arcade.js')).createArcade;
    if (token !== loadToken) return;
    const instance = await factory(id, { container: stage, seed, level: 1 + (progress.plays[id] || 0), sound,
      onResize() { cancelInput(); dirty = true; updateKeyboardCursor(); },
      onLost() { contextLost = true; cancelInput(); if (phase === 'playing') { phase = 'paused'; checkpoint(); } showPanel('restoring', '<p class="eyebrow">HOLD THAT MOMENT</p><h2 id="panelTitle">Restoring the picture.</h2><p>Your voyage is safe. You can return to the island while the view recovers.</p>' + button('map', '← RETURN TO ISLAND')); },
      onRestored() { contextLost = false; dirty = true; if (controller?.state.mode === 'won' || controller?.state.mode === 'lost') resultPanel(false); else pausePanel(); },
    });
    if (token !== loadToken) { instance.dispose(); return; }
    controller = instance;
    let recovered = true;
    if (saved) { try { recovered = controller.restore(saved.state); } catch { recovered = false; } }
    if (!recovered) { delete progress.checkpoints[id]; }
    $('missionHero').textContent = `${CHAPTERS[m.chapter].title} · ${m.hero.split(' the ')[0]}`.toUpperCase(); $('missionTitle').textContent = m.title;
    $('hintButton').hidden = !controller.hint; $('pauseButton').disabled = false;
    document.documentElement.style.setProperty('--accent', CHAPTERS[m.chapter].color);
    kx = ky = .5; phase = 'playing'; lastFrame = performance.now(); lastRender = 0;
    $('loading').hidden = true; stage.focus({ preventScroll: true }); unlockAudio(); controller.render(0); refreshHUD(); checkpoint();
    if (controller.state.mode !== 'playing') resultPanel(false);
    else if (!recovered) { phase = 'paused'; showPanel('pause', '<p class="eyebrow">A FRESH START</p><h2 id="panelTitle">Your crew is safe.</h2><p>This challenge’s checkpoint could not be read, so the challenge starts again. Your friends and islands are unchanged.</p>' + button('resume', 'KEEP PLAYING →', true) + button('map', '← RETURN TO ISLAND')); }
  } catch (error) {
    if (token !== loadToken) return;
    phase = 'paused'; $('loading').hidden = true;
    showPanel('error', '<p class="eyebrow">A LITTLE DETOUR</p><h2 id="panelTitle">The world couldn’t open.</h2><p>Try this friend again, or return to the island and choose another. Your crew is saved.</p>' + button('retryLoad', 'TRY AGAIN →', true) + button('map', '← RETURN TO ISLAND'));
    console.error(error);
  }
}
function refreshHUD() {
  if (!controller) return; const hud = controller.hud();
  $('missionScore').textContent = hud.primary || 'LET’S HELP'; $('missionHint').textContent = hud.hint || missionById.get(currentId).task;
  $('pauseButton').disabled = phase !== 'playing' || contextLost; $('resetButton').disabled = phase !== 'playing' || contextLost;
  dirty = true;
}
function resultPanel(award = true) {
  if (!controller) return;
  const won = controller.state.mode === 'won', m = missionById.get(currentId), wasDone = progress.completed.includes(currentId);
  phase = won ? 'won' : 'lost';
  if (won && award) { completeMission(progress, currentId); persist(); sound(740, .3); }
  else if (!won) { delete progress.checkpoints[currentId]; progress.active = null; persist(); sound(180, .2); }
  const count = chapterCount(progress, m.chapter), lit = count >= 3;
  showPanel(phase, `<div class="result-stars" aria-hidden="true">${won ? '✦ ✦ ✦' : '✦'}</div><p class="eyebrow">${won ? wasDone ? 'FRIENDS MAKE THE BEST ENCORES' : 'A NEW FRIEND ABOARD' : 'YOUR CREW IS STILL SAFE'}</p><h2 id="panelTitle">${won ? wasDone ? 'Lovely teamwork.' : `Welcome, ${esc(m.hero.split(' the ')[0])}!` : 'Another little try?'}</h2><p>${won ? `${esc(m.hero)} brought ${esc(m.gift.toLowerCase())}.` : 'That was a tricky one. Try again, or help someone else on the island. You never lose friends you have already helped.'}</p>${won ? `<div class="gift"><strong>${lit ? '✦ ' + esc(CHAPTERS[m.chapter].reward) : `${count} / 3 friends · ${3 - count} to light the beacon`}</strong><p>${lit ? m.chapter === 4 && festivalReady(progress) ? 'Every beacon is shining. The festival is ready!' : 'Your island has come to life. The crew is ready to sail on.' : 'Your island is growing. Meet another friend to keep it blooming.'}</p></div>` : ''}${button(won ? 'map' : 'retry', won ? 'SEE THE ISLAND →' : 'TRY AGAIN →', true)}${button(won ? 'retry' : 'map', won ? 'PLAY ANOTHER ROUND' : 'CHOOSE A DIFFERENT FRIEND')}<p class="fine">${storageOK ? `${progress.completed.length} / 25 FRIENDS · VOYAGE SAVED` : 'STORAGE UNAVAILABLE · KEEP THIS PAGE OPEN'}</p>`);
  refreshHUD();
}
function changed() { if (phase === 'playing' && controller?.state.mode !== 'playing') resultPanel(true); refreshHUD(); }
function pausePanel() {
  if (!controller) return; phase = 'paused';
  showPanel('pause', `<p class="eyebrow">YOUR FRIEND WILL WAIT</p><h2 id="panelTitle">A little breather.</h2><p>${storageOK ? 'Your challenge and your crew are saved on this device.' : 'Storage is unavailable. Keep this page open to keep your voyage.'}</p>${button('resume', 'KEEP HELPING →', true)}${button('help', 'HOW TO PLAY')}${button('map', '← CHOOSE ANOTHER FRIEND')}`); refreshHUD();
}
function pause() { if (phase !== 'playing') return; cancelInput(); checkpoint(); pausePanel(); }
function resume() { if (contextLost || !controller || phase !== 'paused') return; phase = 'playing'; hidePanel(); unlockAudio(); lastFrame = performance.now(); refreshHUD(); }
function help() {
  if (phase === 'loading' || contextLost) return;
  if (screen === 'mission' && controller) {
    if (phase === 'playing') { cancelInput(); checkpoint(); phase = 'paused'; }
    const m = missionById.get(currentId);
    showPanel('help', `<p class="eyebrow">${esc(m.hero)}</p><h2 id="panelTitle">${esc(m.title)}.</h2><span class="gesture-tag">${esc(m.gesture)}</span><p>${esc(instructions(currentId))}</p><p>Keyboard: arrows move the cursor. Hold Space or Enter to touch; release to lift. P or Escape pauses. Your friends stay safe if you choose another challenge.</p>${button('helpBack', 'GOT IT →', true)}`);
  } else showPanel('mapHelp', `<p class="eyebrow">A LITTLE HELP MAKES A WHOLE WORLD</p><h2 id="panelTitle">Bring back the festival.</h2><p>Sail to five islands. On each one, help <strong>any three of its five friends</strong> to light the beacon and open the next island.</p><p>Each friend has a different little challenge and a gift for the festival. Tap a friend to learn one simple gesture. If it isn’t your kind of challenge, return to the island and choose another.</p><p>Light all five beacons for the festival ending. Come back for the remaining friends to gather the whole crew of 25. Replays open harder rounds where available.</p>${button('close', 'LET’S EXPLORE →', true)}<p class="fine">One voyage save on this device. Earlier game saves are kept, too.</p>`);
}
function showCrew() {
  const crew = progress.completed.map(id => missionById.get(id));
  showPanel('crew', `<p class="eyebrow">SMALL FAVORS. BIG FRIENDSHIPS.</p><h2 id="panelTitle">Your wonderful crew.</h2><p>${crew.length} of 25 friends are aboard.${!crew.length ? ' Help someone on Mossy Landing to begin.' : ' Every friend brings something for the festival.'}</p><div class="crew-grid">${crew.map(m => `<div class="crew-tile"><img src="${portrait(m.id)}" alt="" loading="lazy"><strong>${esc(m.hero)}</strong><span>${esc(m.gift)}</span></div>`).join('')}</div>${button('close', 'BACK TO THE VOYAGE →', true)}`);
}
function festival() {
  if (!festivalReady(progress)) return;
  showPanel('festival', `<div class="result-stars" aria-hidden="true">✦ ✦ ✦</div><p class="eyebrow">FIVE ISLANDS. ONE BIG NIGHT.</p><h2 id="panelTitle">The festival is ready.</h2><p>Your crew brought the music, the food, and the light. ${progress.completed.length === 25 ? 'All 25 friends are here. Nobody has been left out.' : `${progress.completed.length} friends are here to celebrate. You can return for the rest after the festival.`}</p>${button('lightSky', 'LIGHT THE SKY →', true)}${button('close', 'EXPLORE A LITTLE LONGER')}`);
}
function lightSky() {
  progress.festivalSeen = true; if (progress.completed.length === 25) progress.fullCrewSeen = true; persist(); hidePanel();
  progress.celebrating = true; $('app').inert = true; dirty = true; sound(660, .4);
  const sky = document.createElement('div'); sky.className = 'festival-sky'; sky.setAttribute('aria-hidden', 'true');
  sky.innerHTML = progress.completed.map((_, i) => `<i style="--x:${4 + i * 37 % 92}%;--delay:${-(i % 9) * .5}s"></i>`).join(''); document.body.append(sky);
  renderMapUI();
  festivalTimer = setTimeout(() => {
    showPanel('ending', `<div class="result-stars" aria-hidden="true">✦ ✦ ✦</div><p class="eyebrow">${progress.completed.length === 25 ? 'THE FULL-CREW ENDING' : 'THE FESTIVAL ENDING'}</p><h2 id="panelTitle">Wonderwake is awake.</h2><p>It started with a little boat and a small favor. Now five islands are shining together.</p><p>${progress.completed.length === 25 ? 'Every garden, every gift, every friend. You brought the whole world together.' : `Your ${progress.completed.length} friends will keep the festival glowing. ${25 - progress.completed.length} more are waiting to join you.`}</p>${button('endingBack', progress.completed.length === 25 ? 'KEEP EXPLORING →' : 'FIND THE REST OF THE CREW →', true)}<a class="secondary" href="./#collection">ALL SIX GAMES</a>`);
  }, reduced ? 500 : 3200);
}
function handleAction(name) {
  if (name.startsWith('mission:')) { missionIntro(name.slice(8)); return; }
  if (name.startsWith('sail:')) { progress.active = null; selectChapter(Number(name.slice(5))); sound(520); return; }
  if (name === 'startMission' || name === 'continueMission') startMission();
  else if (name === 'freshMission') startMission(pendingId, true);
  else if (name === 'retry' || name === 'retryLoad') startMission(currentId, true);
  else if (name === 'map') showMap();
  else if (name === 'resume') resume();
  else if (name === 'help') help();
  else if (name === 'helpBack') { if (phase === 'paused') pausePanel(); else resultPanel(false); }
  else if (name === 'close') { hidePanel(); if (screen === 'map') $('mainAction').querySelector('button')?.focus({ preventScroll: true }); }
  else if (name === 'festival') festival();
  else if (name === 'lightSky') lightSky();
  else if (name === 'endingBack') { stopCelebration(); hidePanel(); const first = CHAPTERS.findIndex((_, i) => chapterCount(progress, i) < 5); if (first >= 0) selectChapter(first); else renderMapUI(); }
}
function act(type, x, y) {
  if (phase !== 'playing' || contextLost || !controller) return;
  px = x; py = y; controller.pointer(type, x, y); changed();
}
function updateKeyboardCursor() { const rect = stage.getBoundingClientRect(); $('keyCursor').style.left = `${kx * rect.width}px`; $('keyCursor').style.top = `${ky * rect.height}px`; return { x: rect.left + kx * rect.width, y: rect.top + ky * rect.height }; }
$('modal').addEventListener('click', event => { if (event.detail > 0 && (suppressPointer !== null || performance.now() < suppressUntil)) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
$('modal').addEventListener('pointerdown', () => { if (suppressPointer === null) suppressUntil = 0; }, true);
for (const type of ['pointerup', 'pointercancel']) document.addEventListener(type, event => { if (event.pointerId === suppressPointer) { suppressPointer = null; suppressUntil = performance.now() + 500; } }, true);
document.addEventListener('click', event => {
  const action = event.target.closest('[data-action]'); if (action) handleAction(action.dataset.action);
  const mission = event.target.closest('[data-mission]'); if (mission) missionIntro(mission.dataset.mission);
  const chapter = event.target.closest('[data-chapter]'); if (chapter) selectChapter(Number(chapter.dataset.chapter));
});
$('mapButton').addEventListener('click', showMap); $('pauseButton').addEventListener('click', pause); $('helpButton').addEventListener('click', help); $('crewButton').addEventListener('click', showCrew);
$('soundButton').addEventListener('click', () => { soundOn = !soundOn; try { localStorage.setItem('games:wonderwake:sound', soundOn ? '1' : '0'); } catch {} soundUI(); unlockAudio(); sound(); });
$('resetButton').addEventListener('click', () => { if (phase !== 'playing' || contextLost) return; if (controller.resetLevel) { cancelInput(); controller.resetLevel(); changed(); checkpoint(); } else { pause(); showPanel('reset', '<h2 id="panelTitle">Try from the beginning?</h2><p>Only this challenge restarts. Your crew and islands stay safe.</p>' + button('retry', 'RESTART CHALLENGE', true) + button('resume', 'KEEP GOING')); } });
$('hintButton').addEventListener('click', () => { if (phase === 'playing' && !contextLost) { controller.hint?.(); changed(); checkpoint(); } });
stage.addEventListener('pointerdown', event => {
  if (phase !== 'playing' || contextLost || pointer !== null || event.pointerType === 'mouse' && event.button !== 0) return;
  event.preventDefault(); pointer = event.pointerId; stage.setPointerCapture(pointer); $('keyCursor').hidden = true; unlockAudio(); act('down', event.clientX, event.clientY);
});
stage.addEventListener('pointermove', event => { if (event.pointerId === pointer) act('move', event.clientX, event.clientY); });
stage.addEventListener('pointerup', event => { if (event.pointerId !== pointer) return; pointer = null; releaseDispatch = true; try { act('up', event.clientX, event.clientY); } finally { releaseDispatch = false; } checkpoint(); });
for (const type of ['pointercancel', 'lostpointercapture']) stage.addEventListener(type, event => { if (event.pointerId === pointer) { cancelInput(); changed(); checkpoint(); } });
document.addEventListener('keydown', event => {
  if (!$('modal').hidden) {
    if (event.key === 'Tab') { const controls = [...$('panel').querySelectorAll('button:not(:disabled),a[href]')], first = controls[0], last = controls.at(-1); if (event.shiftKey && [first, $('panel')].includes(document.activeElement)) { last?.focus(); event.preventDefault(); } else if (!event.shiftKey && [last, $('panel')].includes(document.activeElement)) { first?.focus(); event.preventDefault(); } }
    else if (event.key === 'Escape') { event.preventDefault(); if (panelKind === 'pause' || panelKind === 'reset') resume(); else if (['mapHelp', 'crew', 'missionIntro', 'festival'].includes(panelKind)) hidePanel(); }
    return;
  }
  if (phase !== 'playing') return;
  if (event.key === 'Escape' || event.key.toLowerCase() === 'p') { event.preventDefault(); pause(); return; }
  if (event.target.closest?.('button,a,input')) return;
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
    event.preventDefault(); const rect = stage.getBoundingClientRect(); kx = Math.max(.02, Math.min(.98, kx + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0) * 18 / rect.width)); ky = Math.max(.02, Math.min(.98, ky + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0) * 18 / rect.height));
    $('keyCursor').hidden = false; const p = updateKeyboardCursor(); if (keyboardHeld) act('move', p.x, p.y); dirty = true;
  } else if ([' ', 'Enter'].includes(event.key) && !event.repeat && !keyboardHeld) { event.preventDefault(); keyboardHeld = true; $('keyCursor').hidden = false; const p = updateKeyboardCursor(); unlockAudio(); act('down', p.x, p.y); }
});
document.addEventListener('keyup', event => { if ([' ', 'Enter'].includes(event.key) && keyboardHeld) { event.preventDefault(); keyboardHeld = false; const p = updateKeyboardCursor(); releaseDispatch = true; try { act('up', p.x, p.y); } finally { releaseDispatch = false; } checkpoint(); } });
function suspend() { if (suppressPointer !== null) { suppressPointer = null; suppressUntil = performance.now() + 500; } cancelInput(); if (phase === 'playing') { checkpoint(); pausePanel(); } else if (controller?.state.mode === 'playing') checkpoint(); else persist(); audio?.suspend().catch(() => {}); }
addEventListener('blur', suspend); addEventListener('pagehide', suspend); document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); else lastFrame = performance.now(); });
function frame(now) {
  requestAnimationFrame(frame); const dt = Math.min(.05, Math.max(0, (now - (lastFrame || now)) / 1000)); lastFrame = now;
  if (document.hidden) return;
  if (phase === 'playing' && realtime && !contextLost && controller) { controller.update(dt); changed(); }
  if (now - lastRender >= (screen === 'map' ? 50 : touch ? 1000 / 30 : 1000 / 60) - .5) {
    if (screen === 'map' && mapView && !mapLost && (dirty || !reduced && $('modal').hidden)) { mapView.render(progress, reduced ? 0 : now / 1000); renderCount++; dirty = false; lastRender = now; }
    else if (screen === 'mission' && controller && !contextLost && (dirty || phase === 'playing' && realtime)) { controller.render(now / 1000); renderCount++; dirty = false; lastRender = now; }
  }
  if (phase === 'playing' && now - lastSave > 4000) checkpoint();
}
if (query.has('debug')) window.__voyage = {
  get controller() { return controller; }, get progress() { return progress; }, get mapView() { return mapView; }, get phase() { return phase; }, get currentId() { return currentId; }, get pointer() { return pointer; }, get renderCount() { return renderCount; },
  startMission, missionIntro, showMap, checkpoint, changed, selectChapter,
  setRealtime(value) { realtime = !!value; lastFrame = performance.now(); },
  advance(seconds) { for (let remaining = seconds; remaining > 0 && phase === 'playing'; remaining -= .05) { controller.update(Math.min(.05, remaining)); changed(); } dirty = true; },
};
soundUI(); showMap(); document.body.dataset.ready = 'true'; requestAnimationFrame(frame);
if (query.get('continue') === '1' && progress.active && isUnlocked(progress, progress.active.id)) missionIntro(progress.active.id);
if (query.has('mission') && isUnlocked(progress, query.get('mission'))) missionIntro(query.get('mission'));
