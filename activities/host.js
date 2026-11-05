import { ACTIVITIES, DISTRICTS, byId } from './catalog.js';
import { completeActivity, writeProgress, claimDistrictMilestone } from './progress.js?v25';
import { completedStages, nextUnfinishedStage, districtProgress, directoryEntries, nearestUnrestored, checkpointSummary } from './directory.js?v25';
import { createKeyboardPointer } from './keyboard-pointer.js';
import { createActivityGamepad } from './gamepad.js';

// The zombie loop owns time. Activities never create a second animation loop,
// navigate away, or replace the live survival state.
export function createActivityHost({ world, progress, canEnter, onEnter, onExit, onReward, onSave, getPosition, isMuted, onMute, getEffectsVolume = () => 1, initialLevel = 1 }) {
  const root = document.createElement('section');
  root.id = 'activityShell'; root.className = 'activity-shell'; root.hidden = true;
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Survivor outpost');
  root.innerHTML = `<header class="activity-top"><a class="activity-brand" href="#">Z<span> / </span>OUTPOST</a><div class="activity-heading"><small id="activityDistrict"></small><h2 id="activityTitle"></h2></div><button id="activityHelp" aria-label="Activity instructions">?</button><button id="activityPause">Pause</button><button id="activityLeave">Return to island <span>↗</span></button></header><div id="activityStage" class="activity-stage"></div><div class="activity-live"><strong id="activityPrimary"></strong><span id="activitySecondary"></span><p id="activityHint"></p></div><div id="activityControls" class="activity-controls"></div><div id="activityCard" class="activity-card"></div><div id="activityJournal" class="activity-journal"></div><p id="activitySaveWarning" role="status" hidden>Storage is unavailable. Progress is kept for this visit.</p>`;
  document.body.append(root);
  const $ = id => root.querySelector(`#${id}`), stage = $('activityStage'), card = $('activityCard');
  const hud = document.createElement('aside'); hud.className = 'expedition-hud'; hud.hidden = true;
  hud.innerHTML = `<button id="expeditionJournal" aria-label="Open survivor outpost map (Tab)"><span class="expedition-mark">✦</span><span><small>SURVIVOR OUTPOSTS</small><strong id="expeditionCount">0 / 30 restored</strong></span><kbd>Tab</kbd></button><div id="expeditionWaypoint"></div>`;
  document.body.append(hud);
  const prompt = document.createElement('button'); prompt.id = 'activityInteract'; prompt.className = 'activity-interact'; prompt.hidden = true;
  document.body.append(prompt);
  let active = false, phase = 'closed', current = null, controller = null, level = 1, seed = 1, generation = 0, elapsed = 0, saveClock = 0, finished = false, previousFocus = null, selectedDistrict = 'all', lost = false;
  let directoryQuery = '', directoryStatus = 'all', directorySort = 'nearest';
  const gamepad=createActivityGamepad();
  const keyboardPointer=createKeyboardPointer({stage,onPointer:(...args)=>controller?.pointer?.(...args)});
  let actionSignature='',worldLayout='', routeSignature='',suppressTouchClickUntil=0;
  const activationTouches=new WeakMap();
  const route = document.createElement('div'); route.id = 'activityRoute'; route.className = 'activity-route'; route.hidden = true;
  route.setAttribute('role','progressbar'); route.setAttribute('aria-valuemin','0'); route.setAttribute('aria-valuemax','100');
  root.querySelector('.activity-live').append(route);
  const held = {}, pressed = {}, actionPointers = new Map(), directions = new Set(); let pointer = null, audio = null, nearest = null, hudCache = '';
  const refresh = () => { world.refresh(progress); document.getElementById('expeditionCount').textContent = `${progress.completed.length} / 30 restored`; };
  const persist = () => { const saved = writeProgress(progress); $('activitySaveWarning').hidden = saved; return saved; };
  function sound(frequency = 440, duration = .07, wave = 'sine', volume = .06) {
    if (isMuted?.() || phase !== 'playing') return;
    const gainValue = Math.max(0, Math.min(.12, volume)) * Math.max(0, Math.min(1, Number(getEffectsVolume()) || 0));
    if (!gainValue) return;
    try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); const oscillator = audio.createOscillator(), gain = audio.createGain(); oscillator.type = ['sine','triangle','square','sawtooth'].includes(wave) ? wave : 'sine'; oscillator.frequency.value = Math.max(30, Math.min(14000, frequency)); gain.gain.setValueAtTime(gainValue, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + duration); oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + duration); } catch {}
  }
  function clearInput() {
    for (const key of Object.keys(held)) delete held[key]; for(const key of Object.keys(pressed))delete pressed[key]; directions.clear();
    gamepad.reset(); keyboardPointer.reset(); controller?.pointer?.('cancel', 0, 0); pointer = null;
    for (const id of actionPointers.values()) controller?.action?.(id, false);
    actionPointers.clear();
    for (const action of controller?.actions || []) if (action.hold) controller.action?.(action.id, false);
    root.querySelectorAll('.held').forEach(button => button.classList.remove('held'));
    root.querySelectorAll('button').forEach(button=>activationTouches.get(button)?.clear());
  }
  function checkpoint() {
    if (controller && current && !finished && !lost) {
      try { const state = controller.snapshot(); if (state) progress.checkpoints[current.id] = { id: current.id, level, seed, state, savedAt: Date.now() }; } catch {}
    }
    persist(); onSave?.();
  }
  function setPhase(next) { phase = next; root.dataset.phase = next; $('activityPause').hidden = !['playing','paused'].includes(next); $('activityHelp').hidden = !current || next === 'loading'; $('activityControls').hidden = next !== 'playing'; root.querySelector('.activity-live').hidden = !['playing','paused'].includes(next); card.hidden = ['playing','journal'].includes(next); $('activityJournal').hidden = next !== 'journal'; }
  function enterShell() {
    if (!active) { previousFocus = document.activeElement; active = true; onEnter(); document.body.classList.add('activity-open'); root.hidden = false; hud.hidden = true; prompt.hidden = true; }
    root.querySelector('.activity-brand').focus();
  }
  function disposeController() { clearInput(); controller?.dispose(); controller = null; stage.replaceChildren(); }
  function close() {
    if (!active) return;
    checkpoint(); generation++; disposeController(); active = false; current = null; root.hidden = true; setPhase('closed'); document.body.classList.remove('activity-open'); audio?.suspend?.(); refresh(); onExit(); if (previousFocus?.isConnected) previousFocus.blur?.();
  }
  function instructions(activity) { return activity.instructions + (activity.inputMode === 'pointer' ? '\n\nKeyboard: arrows or WASD move the cursor. Hold Space or Enter to drag; release to act. Tab reaches the action buttons.' : activity.id === 'borrowed' ? '\n\nSpace: Snap · Shift: Dash · E: Borrow echo · B: Bank route.' : activity.id==='lantern'?'\n\nHold G for precision flight near a destination.':'') + (activity.inputMode==='native' ? '\n\nController: left stick / D-pad to move. ' + (activity.id==='upside'?'A jumps, B flips, X / trigger runs.':activity.id==='lantern'?'A rises, B descends, X / trigger boosts.':'A snaps, B borrows, X / trigger dashes.') + ' Start pauses.' : ''); }
  function heading(activity) { $('activityTitle').textContent = activity?.title || 'A home worth rebuilding'; $('activityDistrict').textContent = activity ? DISTRICTS.find(d => d.id === activity.district).title : 'ISLAND FIELD GUIDE · 30 OUTPOSTS'; root.style.setProperty('--activity-accent', activity?.color || '#a4d6ab'); }
  function bindActivation(button, fn) {
    const touches=new Map();activationTouches.set(button,touches);
    button.addEventListener('pointerdown',event=>{if(event.pointerType==='touch'&&!button.disabled)touches.set(event.pointerId,{x:event.clientX,y:event.clientY});});
    button.addEventListener('pointercancel',event=>touches.delete(event.pointerId));
    button.addEventListener('pointerup',event=>{
      const start=touches.get(event.pointerId);touches.delete(event.pointerId);if(!start||button.disabled)return;
      const rect=button.getBoundingClientRect();
      if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>20||event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)return;
      // Browsers can omit click for a second finger while the first steers.
      // Activate on release, then consume the compatibility click if emitted.
      event.preventDefault();suppressTouchClickUntil=performance.now()+700;fn(event);
    });
    button.addEventListener('click',fn);
  }
  function makeButton(label, fn, className = '') { const button = document.createElement('button'); button.textContent = label; button.className = className; bindActivation(button,fn); return button; }
  function showCard(eyebrow, title, description, buttons = []) {
    card.replaceChildren(); const small = document.createElement('small'), h = document.createElement('h3'), p = document.createElement('p'), row = document.createElement('div'); small.textContent = eyebrow; h.textContent = title; p.textContent = description; row.className = 'activity-card-actions'; row.append(...buttons); card.append(small, h, p, row); buttons[0]?.focus();
  }
  function open(id, requestedLevel) {
    const activity = byId.get(id); if (!activity || active || !canEnter(id)) return false;
    current = activity; level = Math.max(1, Math.min(activity.levelCount, requestedLevel || progress.checkpoints[id]?.level || nextUnfinishedStage(progress, id) || 1));
    if (initialLevel > 1 && !requestedLevel && !progress.checkpoints[id]) { level = Math.min(activity.levelCount, Math.floor(initialLevel)); initialLevel = 1; }
    heading(activity); enterShell(); setPhase('brief'); finished = false;
    const begin = makeButton('', () => launch(level, true), 'primary'); begin.id = 'activityBegin';
    const fresh = makeButton('Start fresh', () => launch(level, false)); fresh.id = 'activityStartFresh';
    showCard(`${progress.completed.includes(id) ? 'OUTPOST RESTORED · REPLAY' : 'SURVIVOR REQUEST'} · ${activity.category}`, activity.task, `${activity.description}\n\n${instructions(activity)}`, [begin, fresh, makeButton('Back to island', close)]);
    const preview = document.createElement('p'); preview.id = 'activityCheckpointPreview'; preview.className = 'activity-checkpoint-preview';
    card.insertBefore(preview, card.lastChild);
    const refreshPreview = () => {
      const saved = progress.checkpoints[id], resumable = saved?.level === level;
      begin.textContent = resumable ? 'Continue activity' : 'Begin activity'; fresh.hidden = !resumable;
      preview.textContent = saved ? `${checkpointSummary(saved)}${resumable ? ' · Continue keeps this attempt. Start fresh replaces it.' : ' · Select that stage to continue.'}` : `Stage ${level} · ${completedStages(progress, id).includes(level) ? 'Replay a completed stage' : 'Ready for a new attempt'}`;
    };
    refreshPreview();
    if (activity.levelCount > 1) {
      const label = document.createElement('label'); label.className = 'activity-level-select'; label.textContent = 'Stage '; const select = document.createElement('select'); select.setAttribute('aria-label', 'Activity stage');
      const won = completedStages(progress, id), recommended = nextUnfinishedStage(progress, id);
      for (let n = 1; n <= activity.levelCount; n++) { const option = document.createElement('option'); option.value = n; option.textContent = `${n} / ${activity.levelCount}${won.includes(n) ? ' · completed' : n === recommended ? ' · next unfinished' : ''}`; select.append(option); }
      select.value = level; select.addEventListener('change', () => { level = Number(select.value); refreshPreview(); }); label.append(select); card.insertBefore(label, card.lastChild);
    }
    const reward = document.createElement('p'); reward.className = 'activity-reward'; reward.textContent = progress.completed.includes(id) ? 'Your work here is remembered. Explore every stage or replay for practice.' : 'First restoration: +300 score · +20 health · +10 armor'; card.append(reward); return true;
  }
  async function launch(nextLevel = level, resume = false) {
    if (!active || !current) return;
    const token = ++generation; disposeController(); level = nextLevel; finished = false; lost = false; elapsed = saveClock = 0; heading(current); setPhase('loading');
    showCard('PREPARING OUTPOST', current.task, 'Your island and equipment are safe.');
    const saved = resume && progress.checkpoints[current.id]?.level === level ? progress.checkpoints[current.id] : null;
    seed = saved?.seed ?? ((Math.random() * 0xffffffff) >>> 0);
    try {
      const { createActivity } = await import('./controllers.js');
      const instance = await createActivity(current.id, { container: stage, level, seed, sound, onResize: () => { if(generation===token)clearInput(); }, onLost: () => { if(generation!==token)return; lost = true; pause('Graphics paused. Your last checkpoint is safe. Return to the island or retry when graphics recover.'); }, onRestored: () => { if(generation!==token)return; lost = false; if (active && phase === 'paused') pause('Graphics recovered. Resume when you are ready.'); } });
      if (generation !== token || !active) { instance.dispose(); return; }
      controller = instance;
      if (saved) { try { if (controller.restore(saved.state) === false) delete progress.checkpoints[current.id]; } catch { delete progress.checkpoints[current.id]; } }
      setPhase('playing'); setupControls(); $('activityPause').textContent = 'Pause'; stage.tabIndex = -1; stage.focus(); checkpoint();
    } catch (error) {
      if (generation !== token || !active) return;
      disposeController(); setPhase('error'); showCard('OUTPOST UNAVAILABLE', 'The activity could not start', 'Your island run is safe. Try again, or return and visit another outpost.', [makeButton('Try again', () => launch(level, resume), 'primary'), makeButton('Return to island', close)]); console.error('Activity load failed:', error);
    }
  }
  function pause(message) {
    if (!active || !controller || !['playing','paused'].includes(phase)) return;
    clearInput(); checkpoint(); setPhase('paused'); $('activityPause').textContent = 'Resume';
    showCard(`STAGE ${level} · ${current.title}`, 'Take a breath', message || instructions(current), [makeButton('Resume activity', resume, 'primary'), makeButton('Restart stage', () => launch(level)), makeButton(isMuted?.() ? 'Sound on' : 'Sound off', () => { onMute?.(); pause(message); }), makeButton('Return to island', close)]);
    for(const action of controller.menuActions||[])card.querySelector('.activity-card-actions').append(makeButton(action.label,()=>{const result=controller.menuAction?.(action.id);if(result==='resume')resume();else pause();}));
  }
  function resume() { if (phase !== 'paused' || lost) return; clearInput(); setPhase('playing'); $('activityPause').textContent = 'Pause'; stage.focus(); audio?.resume?.(); }
  function finish(won) {
    if (finished) return; finished = true; clearInput();
    let first = false, milestone = null;
    if (won) { first = completeActivity(progress, current.id, level); if (first) milestone = claimDistrictMilestone(progress, current.district); persist(); if (first) onReward(current); refresh(); onSave?.(); }
    else { delete progress.checkpoints[current.id]; persist(); }
    setPhase(won ? 'won' : 'lost');
    const buttons = [];
    const nextStage = nextUnfinishedStage(progress, current.id);
    if (won && nextStage !== null) buttons.push(makeButton('Next stage', () => launch(nextStage), 'primary'));
    buttons.push(makeButton(won ? 'Return to island' : 'Try again', won ? close : () => launch(level), buttons.length ? '' : 'primary'));
    buttons.push(makeButton(won ? 'Replay stage' : 'Return to island', won ? () => launch(level) : close));
    if (won && nearestUnrestored(progress, world.stations, getPosition())) buttons.push(makeButton('Track next unrestored outpost', trackNext));
    showCard(won ? `${progress.completed.length} / 30 OUTPOSTS RESTORED` : 'YOUR SURVIVAL RUN IS SAFE', won ? first ? 'A little more hope.' : 'Good work, survivor.' : 'Every attempt helps.', won ? `${current.task} — complete. ${first ? '+300 score · +20 health · +10 armor. The outpost beacon now shines green.' : 'Keep exploring the remaining stages, or head back to the island.'}${progress.completed.length === 30 ? ' All 30 outposts are restored. The settlement is alive again.' : ''}` : 'Retry this activity at no cost, or return to your exact spot on the island.', buttons);
    if (milestone) {
      const notice = document.createElement('p'); notice.id = 'activityDistrictMilestone'; notice.className = 'activity-district-milestone'; notice.setAttribute('role', 'status');
      notice.textContent = `${milestone.title} restored · All ${milestone.missions.length} outposts are back in service. ${milestone.description}`;
      card.insertBefore(notice, card.lastChild);
    }
  }
  function setupControls() {
    actionSignature=''; hudCache=''; routeSignature=''; route.hidden=true;
    const controls = $('activityControls'); controls.replaceChildren();
    if (controller.inputMode === 'native') {
      const dpad = document.createElement('div'); dpad.className = 'activity-dpad';
      for (const [id, label] of [['up','↑'],['left','←'],['down','↓'],['right','→']]) { const b = makeButton(label, () => {}); b.dataset.direction = id; b.setAttribute('aria-label', `Move ${id}`); bindHold(b, () => directions.add(id), () => directions.delete(id)); dpad.append(b); } controls.append(dpad);
    }
    const actions = document.createElement('div'); actions.className = 'activity-actions';
    controls.append(actions); syncActions();
  }
  function pressAction(id, key) {
    actionPointers.set(key,id);controller?.action?.(id,true);
    for(const button of root.querySelectorAll('[data-action]'))if(button.dataset.action===id)button.classList.add('held');
  }
  function releaseAction(key, id=actionPointers.get(key)) {
    if(!id)return;
    const wasHeld=actionPointers.delete(key),stillHeld=[...actionPointers.values()].includes(id);
    for(const button of root.querySelectorAll('[data-action]'))if(button.dataset.action===id)button.classList.toggle('held',stillHeld);
    if(wasHeld&&!stillHeld)controller?.action?.(id,false);
  }
  function syncActions() {
    const definitions=controller?.actions||[], actions=root.querySelector('.activity-actions');
    actionSignature=JSON.stringify(definitions);
    // Keep existing buttons and the D-pad alive while cooldowns or labels change.
    // Replacing them would steal focus and cancel a held touch gesture.
    for(const button of [...actions.children])if(!definitions.some(a=>a.id===button.dataset.action)){
      for(const [key,id] of actionPointers)if(id===button.dataset.action){controller.action?.(id,false);actionPointers.delete(key);}
      button.remove();
    }
    definitions.forEach((definition,index)=>{
      let button=[...actions.children].find(b=>b.dataset.action===definition.id);
      if(!button){
        const id=definition.id, currentAction=()=>controller?.actions?.find(a=>a.id===id);
        button=makeButton('',()=>{const a=currentAction();if(a&&!a.hold&&!a.disabled&&phase==='playing')controller.action?.(id,true);});
        button.dataset.action=id;
        bindHold(button,e=>{const a=currentAction();if(a?.hold&&!a.disabled)pressAction(id,e.pointerId??id);},e=>releaseAction(e.pointerId??id,id),()=>!!currentAction()?.hold);
      }
      if(definition.disabled){for(const [key,id] of actionPointers)if(id===definition.id){controller.action?.(id,false);actionPointers.delete(key);}button.classList.remove('held');}
      button.textContent=definition.label;button.disabled=!!definition.disabled;button.title=definition.description||'';
      if(definition.selected!==undefined)button.setAttribute('aria-pressed',String(!!definition.selected));else button.removeAttribute('aria-pressed');
      if(definition.shortcut)button.setAttribute('aria-keyshortcuts',definition.shortcut.replace(/^Key/,''));else button.removeAttribute('aria-keyshortcuts');
      button.classList.toggle('unavailable',!!definition.unavailable);
      if(actions.children[index]!==button)actions.insertBefore(button,actions.children[index]||null);
    });
  }
  function syncRoute(info) {
    route.hidden=!info;
    if(!info)return;
    const percent=Math.round(info.value*100);
    route.setAttribute('aria-label','World route');route.setAttribute('aria-valuenow',String(percent));
    route.setAttribute('aria-valuetext',`${info.label}. ${info.markers.filter(m=>m.complete).length} of ${info.markers.length} stars collected.`);
    route.style.setProperty('--route-progress',`${percent}%`);
    const signature=JSON.stringify(info.markers);
    if(signature!==routeSignature){routeSignature=signature;route.replaceChildren();for(const marker of info.markers){const pip=document.createElement('i');pip.textContent=marker.complete?'★':'☆';pip.style.left=`${marker.position*100}%`;pip.className=marker.complete?'collected':marker.missed?'missed':'';pip.setAttribute('aria-hidden','true');route.append(pip);}}
  }
  function bindHold(button, down, up, enabled=()=>true) {
    const release = e => { button.classList.remove('held'); up(e); };
    button.addEventListener('pointerdown', e => { if (phase !== 'playing'||button.disabled||!enabled()) return; e.preventDefault(); button.setPointerCapture?.(e.pointerId); button.classList.add('held'); down(e); });
    for (const name of ['pointerup','pointercancel','lostpointercapture','blur']) button.addEventListener(name, release);
    button.addEventListener('keydown', e => { if (['Space','Enter'].includes(e.code) && !e.repeat && phase === 'playing'&&!button.disabled&&enabled()) { e.preventDefault();button.classList.add('held'); down(e); } }); button.addEventListener('keyup', e => { if (['Space','Enter'].includes(e.code)&&enabled()) { e.preventDefault(); release(e); } });
  }
  function setTarget(id) { if (id !== null && !byId.has(id)) return false; progress.target = id; progress.targetCleared = id === null; world.setTarget(id); persist(); return true; }
  function trackNext() {
    const next = nearestUnrestored(progress, world.stations, getPosition());
    if (!next) return false;
    setTarget(next.id); close(); return true;
  }
  function journal() {
    if (active || !canEnter(null)) return false;
    current = null; enterShell(); heading(null); setPhase('journal'); renderJournal(); return true;
  }
  function renderJournal() {
    const journal = $('activityJournal'); journal.replaceChildren();
    const intro = document.createElement('div'); intro.className = 'expedition-intro'; intro.innerHTML = `<small>THE SETTLEMENT NEEDS YOU</small><h3>Every light is a reason<br>to keep going.</h3><p>Walk to an outpost and press E or tap its prompt. Restore it through a survivor activity, then return to your island with supplies. Green beacons mark completed work.</p><strong>${progress.completed.length} / 30 restored</strong>`;
    const map = document.createElementNS('http://www.w3.org/2000/svg','svg'); map.setAttribute('viewBox','-62 -62 124 124'); map.setAttribute('aria-label','Outpost locations on the island'); map.classList.add('expedition-map');
    const shape = (tag, attrs) => { const node = document.createElementNS(map.namespaceURI,tag); for (const [key,value] of Object.entries(attrs)) node.setAttribute(key,value); map.append(node); return node; };
    shape('circle',{cx:0,cy:0,r:51,fill:'#253b37',stroke:'#6a8574','stroke-dasharray':'1 2'});
    for (const station of world.stations) { const circle = shape('circle',{cx:station.x,cy:station.z,r:progress.target===station.id?2.7:1.7,fill:progress.completed.includes(station.id)?'#b6efa2':byId.get(station.id).color}); const title = document.createElementNS(map.namespaceURI,'title'); title.textContent = byId.get(station.id).title; circle.append(title); }
    const p = getPosition(); shape('circle',{cx:p.x,cy:p.z,r:2.2,fill:'#fff',stroke:'#111','stroke-width':.8}); intro.append(map); journal.append(intro);
    const guidance = document.createElement('div'); guidance.className = 'expedition-guidance';
    const next = nearestUnrestored(progress, world.stations, p);
    const track = makeButton('Track next unrestored outpost', trackNext); track.id = 'expeditionTrackNext'; track.disabled = !next;
    const clear = makeButton('Clear waypoint', () => { setTarget(null); renderJournal(); }); clear.id = 'expeditionClearTarget'; clear.disabled = !progress.target;
    const targetText = document.createElement('p'); targetText.id = 'expeditionTarget';
    targetText.textContent = progress.target ? `Tracking ${byId.get(progress.target).title}. Choose another outpost below to change your route.` : next ? `Nearest unrestored: ${next.title} · ${Math.round(next.distance)} m. Choose a waypoint to find it on foot.` : 'Every outpost is restored. Choose any activity to revisit.';
    guidance.append(targetText, track, clear); intro.insertBefore(guidance, map);
    const content = document.createElement('div'); content.className = 'expedition-directory';
    const searchLabel = document.createElement('label'); searchLabel.className = 'expedition-search'; searchLabel.textContent = 'Find an outpost';
    const search = document.createElement('input'); search.type = 'search'; search.id = 'expeditionSearch'; search.placeholder = 'Name, task, or district'; search.value = directoryQuery; search.autocomplete = 'off';
    searchLabel.append(search); content.append(searchLabel);
    const filters = document.createElement('nav'); filters.setAttribute('aria-label','Outpost districts');
    for (const district of [{id:'all',title:'All outposts',count:progress.completed.length,total:ACTIVITIES.length},...districtProgress(progress)]) {
      const button = makeButton(`${district.title} · ${district.count}/${district.total}`, () => { selectedDistrict = district.id; updateDirectory(); });
      button.dataset.district = district.id; filters.append(button);
    }
    content.append(filters);
    const options = document.createElement('div'); options.className = 'expedition-directory-options';
    const select = (id, caption, entries, selected, change) => {
      const label = document.createElement('label'); label.textContent = caption;
      const input = document.createElement('select'); input.id = id;
      for (const [value, title] of entries) { const option = document.createElement('option'); option.value = value; option.textContent = title; input.append(option); }
      input.value = selected; input.addEventListener('change', () => { change(input.value); updateDirectory(); }); label.append(input); options.append(label); return input;
    };
    const status = select('expeditionStatus', 'Show', [['all','All statuses'],['unrestored','Unrestored'],['in-progress','In progress'],['restored','Restored']], directoryStatus, value => { directoryStatus = value; });
    const sort = select('expeditionSort', 'Order', [['nearest','Nearest first'],['catalog','District order']], directorySort, value => { directorySort = value; });
    content.append(options);
    const count = document.createElement('p'); count.id = 'expeditionResultCount'; count.setAttribute('role','status'); count.setAttribute('aria-live','polite');
    const list = document.createElement('div'); list.className = 'expedition-list';
    content.append(count, list); journal.append(content);
    function updateDirectory() {
      for (const button of filters.children) { const selected = button.dataset.district === selectedDistrict; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); }
      const entries = directoryEntries({ progress, stations: world.stations, position: p, query: directoryQuery, district: selectedDistrict, status: directoryStatus, sort: directorySort });
      count.textContent = `${entries.length} of ${ACTIVITIES.length} outposts · ${directorySort === 'nearest' ? 'nearest first' : 'district order'}`;
      list.replaceChildren();
      for (const entry of entries) {
        const row = makeButton('', () => { setTarget(entry.id); close(); }); row.className = 'expedition-entry'; row.dataset.activity = entry.id; row.style.setProperty('--entry-color', entry.color);
        const title = document.createElement('strong'), task = document.createElement('span'), meta = document.createElement('small');
        title.textContent = entry.title; task.textContent = entry.task;
        const stage = nextUnfinishedStage(progress, entry.id), exact = completedStages(progress, entry.id).length;
        meta.textContent = `${entry.restored ? '✓ Restored' : '◇ Unrestored'} · ${Number.isFinite(entry.distance) ? Math.round(entry.distance)+' m' : 'Distance unavailable'}${progress.target === entry.id ? ' · Tracked' : ''}`;
        row.append(title, task, meta);
        const detail = document.createElement('small'); detail.className = 'expedition-entry-detail';
        detail.textContent = entry.checkpoint ? `◐ In progress · ${checkpointSummary(entry.checkpoint)}` : `${exact}/${entry.levelCount} stages completed${stage === null ? ' · All stages complete' : ` · Next unfinished: ${stage}`}`;
        row.append(detail); list.append(row);
      }
      if (!entries.length) {
        const empty = document.createElement('div'); empty.className = 'expedition-empty';
        const text = document.createElement('p'); text.textContent = 'No outposts match this search and these filters.';
        const reset = makeButton('Reset search and filters', () => {
          directoryQuery = ''; directoryStatus = selectedDistrict = 'all'; directorySort = 'nearest'; search.value = ''; status.value = 'all'; sort.value = 'nearest'; updateDirectory(); search.focus();
        }); reset.id = 'expeditionResetFilters'; empty.append(text, reset); list.append(empty);
      }
    }
    search.addEventListener('input', () => { directoryQuery = search.value; updateDirectory(); });
    updateDirectory();
  }
  function updateWorld({ playing, yaw = 0 }) {
    if (active) return;
    hud.hidden = !playing;
    const recovering=document.body.classList.contains('recovering'),nearOutpost=document.body.classList.contains('near-outpost'),fieldVisible=!document.getElementById('fieldObjective')?.classList.contains('hide'),layoutKey=`${innerWidth}:${innerHeight}:${playing}:${recovering}:${nearOutpost}:${fieldVisible}`;
    if(playing&&worldLayout!==layoutKey){worldLayout=layoutKey;const battle=document.getElementById('hud')?.getBoundingClientRect(),field=document.getElementById('fieldObjective')?.getBoundingClientRect();let bottom=battle?.bottom||120;if((!recovering||!document.body.classList.contains('touch'))&&field?.height&&field.top<innerHeight*.55&&field.bottom<innerHeight-145)bottom=Math.max(bottom,field.bottom);hud.style.top=`${Math.round(bottom+9)}px`;document.body.style.setProperty('--outpost-top',hud.style.top);}
    nearest = playing ? world.nearest(getPosition(), 3.8) : null;
    if (nearest && Math.abs(getPosition().y-nearest.y)>2) nearest=null;
    prompt.hidden = !nearest;document.body.classList.toggle('near-outpost',!!nearest);
    if (nearest) { const a=byId.get(nearest.id),copy=`<kbd>E</kbd><span><small>${progress.completed.includes(a.id)?'RESTORED OUTPOST · REPLAY':'SURVIVOR OUTPOST · INTERACT'}</small><strong>${a.title}</strong><em>${a.task}</em></span><b>↗</b>`;if(prompt.innerHTML!==copy)prompt.innerHTML=copy; }
    const target=world.stations.find(s=>s.id===progress.target), waypoint=document.getElementById('expeditionWaypoint');
    if(target&&playing&&innerHeight>=450){const p=getPosition(),angle=(Math.atan2(-(target.x-p.x),-(target.z-p.z))-yaw)*-180/Math.PI;waypoint.hidden=false;waypoint.innerHTML=`<i style="transform:rotate(${angle}deg)">↑</i><span>${byId.get(target.id).title}<small>${Math.round(Math.hypot(target.x-p.x,target.z-p.z))} m · follow the beacon</small></span>`;}else waypoint.hidden=true;
  }
  function update(dt) {
    if (!active || !controller) return;
    const pad=controller.inputMode==='native'?gamepad.sample():{};
    if(pad.pausePressed){if(phase==='playing')pause();else if(phase==='paused')resume();return;}
    if (phase === 'playing' && !lost) {
      const sampled={...pressed,...held}; for(const key of Object.keys(pressed))delete pressed[key];
      const input = { left:!!(sampled.KeyA||sampled.ArrowLeft||directions.has('left')),right:!!(sampled.KeyD||sampled.ArrowRight||directions.has('right')),up:!!(sampled.KeyW||sampled.ArrowUp||directions.has('up')),down:!!(sampled.KeyS||sampled.ArrowDown||directions.has('down')),jump:!!sampled.Space,run:!!(sampled.ShiftLeft||sampled.ShiftRight),flip:!!(sampled.KeyW||sampled.ArrowUp||directions.has('up')),fire:!!(sampled.ShiftLeft||sampled.ShiftRight),action:!!sampled.Space,secondary:!!sampled.KeyE,boost:!!(sampled.ShiftLeft||sampled.ShiftRight) };
      for(const key of ['left','right','up','down','jump','flip','run','fire','action','secondary','boost'])input[key]=input[key]||!!pad[key];
      if(controller.inputMode==='pointer')keyboardPointer.update(dt);
      controller.update(dt,input); if(JSON.stringify(controller.actions||[])!==actionSignature)syncActions(); elapsed+=dt; saveClock+=dt;
      const info=controller.hud(), cache=JSON.stringify(info); if(cache!==hudCache){hudCache=cache;$('activityPrimary').textContent=info.primary||'';$('activitySecondary').textContent=info.secondary||'';$('activityHint').textContent=info.hint||current.instructions;syncRoute(info.route);}
      if(controller.state.mode==='won'||controller.state.mode==='lost') finish(controller.state.mode==='won'); else if(saveClock>5){saveClock=0;checkpoint();}
    }
    if(!lost)controller.render(elapsed);
  }
  for (const name of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture']) stage.addEventListener(name,e=>{
    if(phase!=='playing'||!controller)return;
    if(name==='pointermove'&&pointer===null&&current.id==='garden'){controller.pointer?.('move',e.clientX,e.clientY);return;}
    if(name==='pointerdown'){if(pointer!==null||e.button!==0)return;pointer=e.pointerId;stage.setPointerCapture?.(e.pointerId);}
    if(pointer!==e.pointerId)return;e.preventDefault();controller.pointer?.(name==='pointerdown'?'down':name==='pointermove'?'move':name==='pointerup'?'up':'cancel',e.clientX,e.clientY);
    if(['pointerup','pointercancel','lostpointercapture'].includes(name))pointer=null;
  });
  stage.addEventListener('pointerleave',()=>{if(phase==='playing'&&pointer===null&&current.id==='garden')controller?.pointer?.('cancel',0,0);});
  // Closing a dialog on touch release may retarget its compatibility click to
  // the island underneath. Consume that click even after the shell is hidden.
  // A new physical press always starts a new gesture and remains responsive.
  addEventListener('pointerdown',()=>{suppressTouchClickUntil=0;},true);
  addEventListener('click',event=>{if(performance.now()<suppressTouchClickUntil&&event.detail!==0&&event.pointerType!=='mouse'){suppressTouchClickUntil=0;event.preventDefault();event.stopImmediatePropagation();}},true);
  addEventListener('keydown',e=>{
    if(!active)return;
    if(e.code==='Tab'){clearInput();const nodes=[...root.querySelectorAll('button,a,input,select,[tabindex="0"]')].filter(n=>!n.disabled&&!n.hidden&&n.getClientRects().length);if(nodes.length){const i=nodes.indexOf(document.activeElement);nodes[(i+(e.shiftKey?-1:1)+nodes.length)%nodes.length].focus();}e.preventDefault();e.stopImmediatePropagation();return;}
    if(e.target.matches?.('input,textarea,[contenteditable=true]')&&e.code!=='Escape'){e.stopImmediatePropagation();return;}
    if(e.target.matches?.('select')||(e.target.closest?.('button,a')&&['Space','Enter'].includes(e.code)))return;
    const action=phase==='playing'&&controller?.actions?.find(a=>a.shortcut===e.code);
    if(action){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat&&!action.disabled){if(action.hold)pressAction(action.id,e.code);else controller.action?.(action.id,true);}return;}
    if(phase==='playing'&&controller?.inputMode==='pointer'&&keyboardPointer.keydown(e)){e.stopImmediatePropagation();return;}
    e.stopImmediatePropagation();if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Escape','KeyP','KeyW','KeyA','KeyS','KeyD','KeyE'].includes(e.code))e.preventDefault();
    if(e.repeat)return;
    if(e.code==='Escape'){if(phase==='playing')pause();else if(phase==='paused')resume();else close();return;}
    if(e.code==='KeyM'){onMute?.();return;}
    if(e.code==='KeyP'){phase==='playing'?pause():resume();return;}
    if(phase==='playing'){held[e.code]=true;pressed[e.code]=true;}
  },true);
  addEventListener('keyup',e=>{if(active){delete held[e.code];releaseAction(e.code);if(e.target.closest?.('button,a,select')&&['Space','Enter'].includes(e.code))return;if(phase==='playing'&&controller?.inputMode==='pointer')keyboardPointer.keyup(e);e.stopImmediatePropagation();}},true);
  addEventListener('blur',()=>{clearInput();pause();});addEventListener('resize',clearInput);document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();pause();checkpoint();}});addEventListener('pagehide',checkpoint);
  bindActivation($('activityLeave'),close);bindActivation($('activityPause'),()=>phase==='playing'?pause():resume());bindActivation($('activityHelp'),()=>pause(current&&instructions(current)));root.querySelector('.activity-brand').addEventListener('click',e=>{e.preventDefault();close();});document.getElementById('expeditionJournal').addEventListener('click',journal);prompt.addEventListener('click',()=>nearest&&open(nearest.id));
  refresh();if(progress.target)world.setTarget(progress.target);
  return { get active(){return active;},get phase(){return phase;},get current(){return current;},get controller(){return controller;},get level(){return level;},progress,open,close,pause,resume,journal,setTarget,update,updateWorld,checkpoint,interact:()=>nearest?open(nearest.id):false };
}
