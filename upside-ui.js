import { LEVELS } from './upside-game.js?v3';

const PREF_KEY = 'games:pref:upside:v3';
const ACTIONS = ['left', 'right', 'jump', 'flip', 'run'];
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'jump', KeyZ: 'jump', ArrowUp: 'jump', KeyW: 'jump', KeyX: 'run', ShiftLeft: 'run', ShiftRight: 'run', KeyJ: 'run', KeyC: 'flip', ArrowDown: 'flip', KeyS: 'flip', KeyK: 'flip' };
const cleanNumber = value => Number.isFinite(value) && value >= 0 ? value : 0;
const score = value => Math.floor(cleanNumber(value)).toLocaleString('en-US');
const clock = value => { const seconds = cleanNumber(value); return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`; };

// DOM, input and preferences live here; deterministic simulation stays in upside-game.js.
export function createUI({ game, begin, next, titlePreview, onSettings = () => {}, onAction = () => {} }) {
  const $ = id => document.getElementById(id), S = game.state;
  let storage; try { storage = window.localStorage; } catch { /* private browsing */ }
  const settings = { effects: true, music: true, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, autoRun: false, assist: false };
  try {
    const saved = JSON.parse(storage?.getItem(PREF_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      for (const key of Object.keys(settings)) if (typeof saved[key] === 'boolean') settings[key] = saved[key];
    } else if (storage?.getItem('games:pref:upside:muted') === '1') settings.effects = settings.music = false;
  } catch { /* preferences are optional */ }
  const overlay = $('overlay'), panel = $('panel');
  const backgrounds = [$('stage'), document.querySelector('.sys'), $('dpad'), document.querySelector('.buttons')];
  const keys = new Set(), latch = new Set(), touch = Object.fromEntries(ACTIONS.map(k => [k, false]));
  const touchButtons = new Map(), dpadPointers = new Map();
  let selected = 1, screen = 'title', returnScreen = 'title', lastMode = S.mode;
  let hintTime = 0, hintPriority = 0, lastAnnouncement = '', gamepadSeen = false;
  let gamepadInput = {}, previousPad = [], previousAxis = 0, padBlocked = false, menuRepeat = 0;
  let soundBeforeMute = { effects: true, music: true };

  function announce(message) {
    if (!message || message === lastAnnouncement) return;
    lastAnnouncement = message;
    $('status').textContent = message;
  }
  function showHint(message, seconds = 5, priority = 0) {
    if (!message || (hintTime > 0 && priority < hintPriority)) return;
    $('hint').textContent = message; $('hint').hidden = false;
    hintTime = seconds; hintPriority = priority;
  }
  function syncSettings() {
    document.body.dataset.reducedMotion = String(settings.reducedMotion);
    const muted = !settings.effects && !settings.music;
    $('muteBtn').textContent = muted ? '×' : '♪';
    $('muteBtn').setAttribute('aria-label', muted ? 'Sound off. Turn sound on' : 'Sound on. Mute sound');
    $('muteBtn').setAttribute('aria-pressed', String(muted));
    try { storage?.setItem(PREF_KEY, JSON.stringify(settings)); } catch { /* storage unavailable */ }
    onSettings({ ...settings });
  }
  function toggleMute() {
    if (settings.effects || settings.music) {
      soundBeforeMute = { effects: settings.effects, music: settings.music };
      settings.effects = settings.music = false;
    } else {
      settings.effects = soundBeforeMute.effects; settings.music = soundBeforeMute.music;
      if (!settings.effects && !settings.music) settings.effects = settings.music = true;
    }
    syncSettings(); announce(settings.effects || settings.music ? 'Sound on' : 'Sound off');
  }
  function resetInput() {
    keys.clear(); latch.clear();
    for (const k of ACTIONS) touch[k] = false;
    for (const [el, ids] of touchButtons) {
      for (const id of ids) { try { el.releasePointerCapture(id); } catch { /* already released */ } }
      ids.clear(); el.classList.remove('down');
    }
    for (const id of dpadPointers.keys()) { try { $('dpad').releasePointerCapture(id); } catch { /* already released */ } }
    dpadPointers.clear();
    $('dpad').querySelectorAll('.arrow').forEach(el => el.classList.remove('on'));
    gamepadInput = {}; padBlocked = true;
  }
  function hidePanel() {
    overlay.hidden = true; document.body.classList.remove('menu-open');
    for (const el of backgrounds) if (el) el.inert = false;
    resetInput(); $('screen').focus({ preventScroll: true });
  }
  function showPanel(kind, html, actions) {
    resetInput(); screen = kind; panel.innerHTML = html; overlay.hidden = false;
    document.body.classList.add('menu-open');
    for (const el of backgrounds) if (el) el.inert = true;
    const heading = panel.querySelector('h1,h2');
    if (heading) { heading.id = 'panel-title'; panel.setAttribute('aria-labelledby', 'panel-title'); }
    for (const button of panel.querySelectorAll('[data-action]')) button.onclick = () => { onAction('ui'); actions[button.dataset.action]?.(button); };
    (panel.querySelector('[data-primary]') || panel.querySelector('button:not(:disabled)'))?.focus({ preventScroll: true });
    panel.scrollTop = 0;
  }
  const primary = (action, label) => `<button class="primary" data-primary data-action="${action}">${label}</button>`;
  const bestLine = () => S.best ? `<p class="best-line">Career best <strong>${score(S.best.score)}</strong></p>` : '';
  const medalsLine = medals => `<span class="medal ${medals?.clear ? 'earned' : ''}">⚑ Clear</span><span class="medal ${medals?.collector ? 'earned' : ''}">★ Collector</span><span class="medal ${medals?.clean ? 'earned' : ''}">✦ Flawless</span>`;
  const modeLabel = () => settings.assist ? 'Assist · unlimited retries' : 'Classic · three lives';
  const launch = (id = selected) => { hidePanel(); lastAnnouncement = ''; begin(id, { assist: settings.assist }); lastMode = S.mode; announce(`World ${id}: ${game.level.name}. ${S.assist ? 'Assist mode.' : 'Classic mode.'}`); };

  function showTitle() {
    if (titlePreview) titlePreview(); else S.mode = 'title';
    selected = Math.min(Math.max(1, selected), S.unlocked);
    const mode = settings.assist ? 'assist' : 'normal';
    const levels = LEVELS.map((level, i) => {
      const record = S.records?.[level.id]?.[mode], locked = level.id > S.unlocked;
      return `<button data-action="pick" data-level="${level.id}" class="chapter ${level.id === selected ? 'sel' : ''}" aria-pressed="${level.id === selected}" ${locked ? 'disabled' : ''}>
        <span class="chapter-number">${String(level.id).padStart(2, '0')}<span>${locked ? '⌑' : record ? '⚑' : '↗'}</span></span>
        <strong>${level.name}</strong><small>${['Learn to turn the world', 'Find your rhythm', 'Dance between skies', 'Light the last lantern'][i]}</small>
        <span class="chapter-record">${locked ? 'Clear the previous world' : record ? `★ ${record.stars || 0}/3 · ${clock(record.time)}` : '★ 0/3 · New adventure'}</span>
        ${record ? `<span class="chapter-best">Best ${score(record.score)}${record.medals?.clean ? ' · ✦ Flawless' : ''}</span>` : ''}
      </button>`;
    }).join('');
    showPanel('title', `<div class="title-intro"><p class="kicker">A little lantern. Two sides to every sky.</p><h1>UPSIDE <span>NIB</span></h1><p>Run, jump, and turn gravity upside down.<br>Find three hidden stars in every world.</p></div>
      <div class="levels">${levels}</div><div class="launch-row">${primary('start', `Play world ${selected} <span aria-hidden="true">↗</span>`)}<span class="mode-badge">${modeLabel()}</span></div>
      <div class="row subtle-row"><button data-action="help">How to play</button><button data-action="settings">Settings</button></div>${bestLine()}<p class="keys">← → Move · Space Jump · Shift Run · C Flip<br><span id="controllerStatus">Keyboard, touch &amp; controller ready</span></p>`,
    { pick: button => { selected = Number(button.dataset.level); showTitle(); }, start: () => launch(selected), help: () => showHelp('title'), settings: () => showSettings('title') });
  }
  function showPause() {
    showPanel('pause', `<p class="kicker">Take a breath. The skies can wait.</p><h2>Lantern resting</h2><p>World ${game.level.id} · ${game.level.name}</p><div class="pause-stats"><span>★ ${S.levelStats?.stars?.length ?? 0}/3 stars</span><span>${S.check >= 0 ? `Checkpoint ${S.check + 1}` : 'Starting lantern'}</span><span>${S.assist ? 'Assist mode' : `${S.lives} lives`}</span></div>
      ${primary('resume', 'Back to the adventure')}<div class="row"><button data-action="retryCheckpoint">Retry checkpoint<small>${S.assist ? 'Unlimited retries' : 'Uses one life'}</small></button><button data-action="restart">Restart world<small>Fresh score &amp; ${settings.assist ? 'unlimited retries' : 'three lives'}</small></button></div><div class="row subtle-row"><button data-action="help">Controls</button><button data-action="settings">Settings</button><button data-action="quit">Worlds</button></div>`,
    { resume, retryCheckpoint: () => { hidePanel(); game.resume(); game.retryCheckpoint?.(); announce('Returning to your last lantern'); }, restart: () => launch(game.level.id), quit: showTitle, help: () => showHelp('pause'), settings: () => showSettings('pause') });
  }
  function pause() { if (!game.pause()) return false; resetInput(); showPause(); announce('Paused'); return true; }
  function resume() { if (!game.resume()) return false; hidePanel(); lastMode = S.mode; announce('Adventure resumed'); return true; }
  function backTo(origin) { if (origin === 'pause') showPause(); else if (origin === 'end') onEnd(); else showTitle(); }
  function showSettings(origin = S.mode === 'paused' ? 'pause' : 'title') {
    returnScreen = origin;
    const rows = [
      ['effects', 'Sound effects', 'Jumps, stars, flips and landing sounds.'],
      ['music', 'Music', 'A little chiptune for the journey.'],
      ['reducedMotion', 'Reduced motion', 'Less particle motion, no shake or trails.'],
      ['autoRun', 'Always run', 'Move at running speed without holding Shift.'],
      ['assist', 'Assist on your next run', 'Unlimited retries and a gentler timer. Records stay separate.'],
    ].map(([key, name, description]) => `<button class="setting" data-setting="${key}" aria-pressed="${settings[key]}"><span><strong>${name}</strong><small>${description}</small></span><span class="switch" aria-hidden="true">${settings[key] ? 'ON' : 'OFF'}</span></button>`).join('');
    showPanel('settings', `<p class="kicker">Make yourself at home</p><h2>Your adventure</h2><div class="settings-list">${rows}</div><p class="keys">Preferences are saved on this device.${S.mode === 'paused' ? '<br>Assist changes apply when starting or restarting a world.' : ''}</p>${primary('back', 'Done')}`, { back: () => backTo(origin) });
    for (const button of panel.querySelectorAll('[data-setting]')) button.onclick = () => {
      const key = button.dataset.setting; settings[key] = !settings[key]; syncSettings();
      button.setAttribute('aria-pressed', String(settings[key])); button.querySelector('.switch').textContent = settings[key] ? 'ON' : 'OFF';
      onAction('ui'); announce(`${button.querySelector('strong').textContent}: ${settings[key] ? 'on' : 'off'}`);
    };
  }
  function showHelp(origin = 'title') {
    returnScreen = origin;
    showPanel('help', `<p class="kicker">Learn the rhythm</p><h2>Every sky has a floor</h2><div class="help-grid">
      <div><span class="help-icon">↔</span><h3>Move &amp; run</h3><p>Arrow keys or A/D. Hold Shift or X to run. On touch, hold RUN with your thumb.</p></div>
      <div><span class="help-icon">↑</span><h3>Jump your way</h3><p>Space, Z or ↑. Tap for a low hop; hold for a high jump. Land on bugs to bounce.</p></div>
      <div><span class="help-icon">⇅</span><h3>Turn the world</h3><p>C or ↓ flips gravity. One air flip, refilled when you land or stomp. Look for the landing guide.</p></div>
      <div><span class="help-icon">★</span><h3>Find your challenge</h3><p>Three stars in every world. Light checkpoint lanterns to save your spot. Finish without dying for Flawless.</p></div>
    </div><p class="controller-help"><strong>Controller:</strong> stick / D-pad move · A jump · B flip · X run / fire · Start pause.<br><strong>Keyboard:</strong> P / Escape pause · M mute. With a Bloom, press RUN to throw an ember.</p><p class="keys">Stuck? Try Assist in Settings: unlimited retries and more time.</p>${primary('back', 'Got it')}`, { back: () => backTo(origin) });
  }
  function onEnd() {
    const result = S.result || {}, cleared = S.mode === 'cleared', won = S.mode === 'won';
    const wonWorld = cleared || won;
    const stats = wonWorld ? `<div class="result-stars" aria-label="${result.stars || 0} of 3 stars collected">${[0, 1, 2].map(i => `<span class="${i < (result.stars || 0) ? 'earned' : ''}">★</span>`).join('')}</div><div class="medals">${medalsLine(result.medals)}</div>
      <div class="result-grid"><span><strong>${clock(result.elapsed)}</strong>Time</span><span><strong>${score(result.score ?? S.score)}</strong>World score</span><span><strong>${result.deaths ?? 0}</strong>Retries</span><span><strong>${result.coins ?? 0}</strong>Coins</span></div>
      <p class="keys">${result.newRecord ? 'A new personal best. ' : ''}${result.assisted ? 'Assist record saved separately.' : 'Classic record saved.'}${result.stars < 3 ? ' Replay to find the missing stars.' : ' Every star found!'}</p>` : `<p class="big">${score(S.score)}</p><p>The lantern can always be lit again.<br>Try Assist in Settings for unlimited retries.</p>`;
    showPanel('end', `<p class="kicker">${won ? 'Both skies are shining' : cleared ? `World ${game.level.id} complete` : 'A fresh spark awaits'}</p><h2>${won ? 'You lit the whole sky!' : cleared ? game.level.name : 'Keep your spark'}</h2>${stats}
      ${primary(cleared ? 'next' : won ? 'again' : 'retry', cleared ? 'Next world →' : won ? 'A new adventure' : `Try world ${game.level.id} again`)}<div class="row subtle-row">${wonWorld ? '<button data-action="replay">Replay world</button>' : '<button data-action="settings">Settings</button>'}<button data-action="title">Worlds</button></div>${bestLine()}`,
    { next: () => { hidePanel(); next(); lastMode = S.mode; announce(`World ${game.level.id}: ${game.level.name}`); }, again: () => launch(1), retry: () => launch(game.level.id), replay: () => launch(game.level.id), title: showTitle, settings: () => showSettings('end') });
    announce(won ? 'Adventure complete! All four worlds lit.' : cleared ? `World ${game.level.id} complete. ${result.stars || 0} stars collected.` : 'Out of lives. You can retry or choose Assist in settings.');
  }
  function focusables() { return [...panel.querySelectorAll('button:not(:disabled), a[href], input, select, [tabindex="0"]')].filter(el => !el.hidden); }
  function menuBack() { if (screen === 'settings' || screen === 'help') backTo(returnScreen); else if (S.mode === 'paused') resume(); }
  addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (!overlay.hidden) {
      if (event.code === 'Tab') {
        const all = focusables(), at = all.indexOf(document.activeElement);
        if (all.length && (at < 0 || (!event.shiftKey && at === all.length - 1) || (event.shiftKey && at === 0))) { event.preventDefault(); all[event.shiftKey ? all.length - 1 : 0].focus(); }
        return;
      }
      if (event.code === 'Escape' || event.code === 'KeyP') { event.preventDefault(); if (!event.repeat) menuBack(); return; }
      if (event.code === 'Enter') { event.preventDefault(); if (!event.repeat) (panel.contains(document.activeElement) && document.activeElement.tagName === 'BUTTON' ? document.activeElement : panel.querySelector('[data-primary]'))?.click(); return; }
      if (event.code === 'KeyM') { event.preventDefault(); if (!event.repeat) toggleMute(); return; }
      return;
    }
    if (event.code === 'KeyP' || event.code === 'Escape') { event.preventDefault(); if (!event.repeat) pause(); return; }
    if (event.code === 'KeyM') { event.preventDefault(); if (!event.repeat) toggleMute(); return; }
    const action = KEYMAP[event.code];
    if (action) { event.preventDefault(); if (event.repeat || S.mode !== 'playing') return; onAction('input'); keys.add(event.code); latch.add(action); }
  });
  addEventListener('keyup', event => keys.delete(event.code));
  addEventListener('blur', () => { resetInput(); if (S.mode === 'playing') pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { resetInput(); if (S.mode === 'playing') pause(); } });
  function holdButton(el, action) {
    const pointers = new Set(); touchButtons.set(el, pointers);
    const sync = () => { touch[action] = pointers.size > 0; el.classList.toggle('down', touch[action]); };
    el.addEventListener('pointerdown', event => {
      event.preventDefault(); if (!overlay.hidden || S.mode !== 'playing') return;
      onAction('input'); pointers.add(event.pointerId); latch.add(action);
      try { el.setPointerCapture(event.pointerId); } catch { /* synthetic events / old browser */ }
      sync();
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(name, event => { pointers.delete(event.pointerId); sync(); });
    el.addEventListener('contextmenu', event => event.preventDefault());
    el.addEventListener('click', event => { if (event.detail === 0 && overlay.hidden && S.mode === 'playing') { onAction('input'); latch.add(action); } });
  }
  holdButton($('jumpBtn'), 'jump'); holdButton($('flipBtn'), 'flip'); holdButton($('runBtn'), 'run');
  const dpad = $('dpad');
  function syncDpad() {
    let left = false, right = false;
    const rect = dpad.getBoundingClientRect();
    for (const position of dpadPointers.values()) { const delta = position - (rect.left + rect.width / 2); if (delta < -5) left = true; else if (delta > 5) right = true; }
    touch.left = left; touch.right = right;
    dpad.querySelector('.l').classList.toggle('on', left); dpad.querySelector('.r').classList.toggle('on', right);
  }
  dpad.addEventListener('pointerdown', event => { event.preventDefault(); if (!overlay.hidden || S.mode !== 'playing') return; onAction('input'); dpadPointers.set(event.pointerId, event.clientX); try { dpad.setPointerCapture(event.pointerId); } catch { /* synthetic */ } syncDpad(); });
  dpad.addEventListener('pointermove', event => { if (dpadPointers.has(event.pointerId)) { dpadPointers.set(event.pointerId, event.clientX); syncDpad(); } });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) dpad.addEventListener(name, event => { dpadPointers.delete(event.pointerId); syncDpad(); });
  for (const [selector, action] of [['.l', 'left'], ['.r', 'right']]) dpad.querySelector(selector).addEventListener('click', event => { if (event.detail === 0 && overlay.hidden && S.mode === 'playing') latch.add(action); });
  function pollGamepad(dt) {
    let pad; try { pad = [...(navigator.getGamepads?.() || [])].find(candidate => candidate?.connected && candidate.mapping === 'standard'); } catch { /* unsupported or restricted */ }
    if (!pad) { gamepadInput = {}; previousPad = []; previousAxis = 0; return; }
    if (!gamepadSeen) { gamepadSeen = true; const label = $('controllerStatus'); if (label) label.textContent = 'Controller connected · A select · Start pause'; announce('Controller connected'); }
    const buttons = pad.buttons.map(button => button.pressed), pressed = n => buttons[n] && !previousPad[n];
    const x = pad.axes[0] || 0, y = pad.axes[1] || 0;
    if (padBlocked) {
      if (buttons.every(value => !value) && Math.abs(x) < .25 && Math.abs(y) < .25) padBlocked = false;
      previousPad = buttons; gamepadInput = {}; return;
    }
    if (pressed(9)) { onAction('input'); S.mode === 'playing' ? pause() : S.mode === 'paused' ? resume() : null; previousPad = buttons; return; }
    if (!overlay.hidden) {
      gamepadInput = {};
      if (pressed(0)) { onAction('input'); (panel.contains(document.activeElement) ? document.activeElement : panel.querySelector('[data-primary]'))?.click(); }
      else if (pressed(1)) menuBack();
      const axis = buttons[13] || buttons[15] || x > .5 || y > .5 ? 1 : buttons[12] || buttons[14] || x < -.5 || y < -.5 ? -1 : 0;
      menuRepeat = Math.max(0, menuRepeat - dt);
      if (axis && (axis !== previousAxis || menuRepeat === 0)) { const all = focusables(), at = all.indexOf(document.activeElement); if (all.length) all[(at + axis + all.length) % all.length].focus(); menuRepeat = .22; }
      previousAxis = axis;
    } else {
      gamepadInput = { left: x < -.25 || buttons[14], right: x > .25 || buttons[15], jump: buttons[0], flip: buttons[1], run: buttons[2] || buttons[5] || buttons[7] };
      for (const [action, index] of [['jump', 0], ['flip', 1], ['run', 2]]) if (pressed(index)) latch.add(action);
      if (buttons.some((value, i) => value && !previousPad[i])) onAction('input');
    }
    previousPad = buttons;
  }
  addEventListener('gamepaddisconnected', () => { gamepadInput = {}; previousPad = []; gamepadSeen = false; if (S.mode === 'playing') pause(); announce('Controller disconnected. Game paused.'); });
  $('muteBtn').onclick = () => { onAction('ui'); toggleMute(); };
  $('pauseBtn').onclick = () => S.mode === 'playing' ? pause() : S.mode === 'paused' ? resume() : null;
  $('settingsBtn').onclick = () => { if (S.mode === 'playing') pause(); showSettings(S.mode === 'paused' ? 'pause' : 'title'); };
  function input() {
    if (!overlay.hidden || S.mode !== 'playing') return {};
    const result = Object.fromEntries(ACTIONS.map(action => [action, !!(touch[action] || gamepadInput[action] || latch.has(action))]));
    for (const code of keys) result[KEYMAP[code]] = true;
    result.fire = result.run;
    if (settings.autoRun && (result.left || result.right)) result.run = true;
    return result;
  }
  function update(dt) {
    if (lastMode !== S.mode) { resetInput(); lastMode = S.mode; }
    pollGamepad(dt);
    const player = S.player, spent = !!(player && !player.ground && !player.airFlip);
    $('flipBtn').classList.toggle('spent', spent);
    $('flipBtn').setAttribute('aria-label', spent ? 'Flip spent. Land or stomp to recharge' : 'Flip gravity');
    $('pauseBtn').disabled = !['playing', 'paused'].includes(S.mode);
    $('pauseBtn').setAttribute('aria-label', S.mode === 'paused' ? 'Resume adventure' : 'Pause adventure');
    $('hint').classList.toggle('suppressed', !overlay.hidden || S.mode !== 'playing');
    if (S.mode === 'playing' && hintTime > 0) { hintTime -= dt; if (hintTime <= 0) { $('hint').hidden = true; hintPriority = 0; } }
  }
  syncSettings();
  return { input, clearLatch: () => latch.clear(), resetInput, showTitle, onEnd, update, get settings() { return settings; }, announce, showHint, hidePanel, pause, resume };
}
