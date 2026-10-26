import { createGarden, PLANTS, ROWS, COLS } from './garden-game.js?v2';
import { createGardenScene } from './garden-scene.js?v2';
import { LEVELS } from './garden-levels.js';

const $ = id => document.getElementById(id);
const game = createGarden({ level: new URLSearchParams(location.search).get('level') || 1 });
const { state } = game;
const stage = $('gardenStage');
const menu = $('menuDialog');
const help = $('helpDialog');
const levels = $('levelsDialog');
const cells = [];
const sunButtons = new Map();
const touch = matchMedia('(pointer: coarse)').matches;
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const seeds = [...document.querySelectorAll('[data-seed]')];
const seedMeters = seeds.map(button => button.querySelector('.seed-cooldown'));
let selected = 'bloom', speed = 1, graphicsLost = false, resumeAfterHelp = false;
let resumeAfterLevels = false;
let lastMode = 'ready', lastWave = 0, bannerUntil = 0, messageUntil = 0;
let lastFrame = performance.now(), lastUI = 0, lastRender = 0, frameId = 0;
let layoutDirty = true, viewDirty = true, renderingStopped = false;
const timeLabel = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

function requestFrame() {
  if (!frameId && !document.hidden && !renderingStopped) frameId = requestAnimationFrame(frame);
}
function invalidate() { viewDirty = true; requestFrame(); }
function text(element, value) { if (element.textContent !== String(value)) element.textContent = value; }

function hint(message, error = false, duration = 4) {
  if ($('playHint').textContent !== message) $('playHint').textContent = message;
  $('playHint').classList.toggle('error', error);
  messageUntil = state.time + duration;
}
function select(type) {
  selected = type;
  for (const button of seeds) {
    const active = button.dataset.seed === type;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
  }
  $('shovelBtn').setAttribute('aria-pressed', String(type === 'shovel'));
  for (const cell of cells) cell.classList.toggle('shoveling', type === 'shovel');
  hint(type === 'shovel' ? 'Tap a plant to dig it up. You get half its sun cost back.' : `${PLANTS[type].name} · ${PLANTS[type].cost} sun. ${PLANTS[type].description} Tap an empty patch to plant.`);
  invalidate();
}
function act(row, col) {
  const result = selected === 'shovel' ? game.remove(row, col) : game.place(selected, row, col);
  hint(result.reason, !result.ok, 3);
  syncUI();
  invalidate();
}
for (let row = 0; row < ROWS; row++) {
  const rowElement = document.createElement('div');
  rowElement.setAttribute('role', 'row');
  rowElement.setAttribute('aria-rowindex', row + 1);
  $('lawnGrid').append(rowElement);
  for (let col = 0; col < COLS; col++) {
    const button = document.createElement('button');
    button.className = 'lawn-cell';
    button.type = 'button';
    button.dataset.row = row;
    button.dataset.col = col;
    button.setAttribute('role', 'gridcell');
    button.setAttribute('aria-colindex', col + 1);
    button.tabIndex = row === 0 && col === 0 ? 0 : -1;
    button.disabled = true;
    button.innerHTML = '<span class="cell-health" hidden aria-hidden="true"><span></span></span>';
    button.addEventListener('click', () => act(row, col));
    button.addEventListener('pointerenter', () => { view.setHover(row, col); invalidate(); });
    button.addEventListener('focus', () => {
      for (const cell of cells) cell.tabIndex = cell === button ? 0 : -1;
      view.setHover(row, col);
      invalidate();
    });
    button.addEventListener('keydown', event => {
      const movement = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key];
      if (!movement && event.key !== 'Home' && event.key !== 'End') return;
      event.preventDefault();
      let nextRow = row, nextCol = col;
      if (movement) { nextRow = Math.max(0, Math.min(ROWS - 1, row + movement[0])); nextCol = Math.max(0, Math.min(COLS - 1, col + movement[1])); }
      else nextCol = event.key === 'Home' ? 0 : COLS - 1;
      cells[nextRow * COLS + nextCol].focus();
    });
    rowElement.append(button);
    cells.push(button);
  }
}

const view = createGardenScene(stage, {
  onResize() { layoutDirty = true; invalidate(); },
  onLost() {
    graphicsLost = true;
    $('startBtn').disabled = true;
    game.pause();
    if (help.open) help.close();
    if (levels.open) levels.close();
    showMenu();
    $('menuDescription').textContent = 'The graphics connection paused. Your garden is safe while it restores.';
    $('resumeBtn').textContent = 'RESTORING THE GARDEN…';
    $('resumeBtn').disabled = true;
  },
  onRestored() {
    graphicsLost = false;
    $('startBtn').disabled = false;
    $('resumeBtn').disabled = false;
    if (state.mode === 'ready' && menu.open) menu.close();
    else if (state.mode === 'paused') showMenu();
    syncUI();
    invalidate();
  },
});
stage.addEventListener('pointerleave', () => { view.setHover(); invalidate(); });
seeds.forEach(button => button.addEventListener('click', () => select(button.dataset.seed)));
$('shovelBtn').addEventListener('click', () => select(selected === 'shovel' ? 'bloom' : 'shovel'));

function bestRun(id = state.level) {
  try {
    const saved = JSON.parse(localStorage.getItem(`games:garden:level${id}`) || 'null');
    return saved && Number.isInteger(saved.stars) && saved.stars >= 1 && saved.stars <= 3 && Number.isFinite(saved.time) && saved.time >= 0 ? saved : null;
  }
  catch { return null; }
}
function updateBest() {
  const best = bestRun();
  $('levelBest').textContent = best ? `${'★'.repeat(best.stars)} GARDEN SAVED · BEST ${timeLabel(best.time)}` : `5 LANES · ${game.level.waveCount} WAVES · ${game.level.enemies.length} ZOMBIES`;
}
function syncLevel() {
  const level = game.level;
  text($('levelNumber'), `LEVEL ${String(level.id).padStart(2, '0')}`);
  text($('levelName'), level.name);
  text($('levelsBtn'), `${String(level.id).padStart(2, '0')} / 05 ▾`);
  text($('introKicker'), `GARDEN ${level.id} · ${level.name.toUpperCase()}`);
  text($('introDescription'), level.subtitle);
  text($('loadStatus'), `GARDEN ${level.id} OF 5 · ${level.waveCount} WAVES · ${level.startSun} STARTING SUN`);
  document.body.style.setProperty('--green', level.theme.accent);
  document.body.dataset.level = level.id;
  $('waveTrack').setAttribute('aria-valuemax', level.enemies.length);
  $('waveTrack').querySelectorAll('i').forEach(marker => marker.remove());
  for (let wave = 1; wave < level.waveCount; wave++) {
    const marker = document.createElement('i');
    marker.style.left = `${level.enemies.filter(enemy => enemy.wave <= wave).length / level.enemies.length * 100}%`;
    $('waveTrack').append(marker);
  }
  updateBest();
}
function showLevels() {
  resumeAfterLevels = state.mode === 'playing';
  game.pause();
  if (menu.open) menu.close();
  $('levelChoices').replaceChildren();
  for (const level of LEVELS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'garden-level-card';
    button.dataset.level = level.id;
    button.setAttribute('aria-pressed', String(level.id === state.level));
    const number = document.createElement('span'), copy = document.createElement('span'), title = document.createElement('strong'), detail = document.createElement('span'), stars = document.createElement('span');
    number.className = 'level-index'; number.textContent = String(level.id).padStart(2, '0');
    title.textContent = level.name;
    detail.textContent = `${level.waveCount} WAVES · ${level.startSun} SUN · ${level.subtitle}`;
    copy.className = 'level-card-copy'; copy.append(title, detail);
    const best = bestRun(level.id);
    stars.className = 'level-stars'; stars.textContent = best ? '★'.repeat(best.stars) : '→';
    button.append(number, copy, stars);
    button.addEventListener('click', () => { resumeAfterLevels = false; levels.close(); start(level.id); });
    $('levelChoices').append(button);
  }
  levels.showModal();
  syncUI();
  invalidate();
}
$('levelsBtn').addEventListener('click', showLevels);
$('chooseLevelBtn').addEventListener('click', showLevels);
$('levelsClose').addEventListener('click', () => levels.close());
levels.addEventListener('close', () => {
  if (resumeAfterLevels && !graphicsLost) game.resume();
  else if (state.mode === 'paused' && !graphicsLost) showMenu();
  resumeAfterLevels = false;
  lastFrame = performance.now();
  syncUI();
  invalidate();
});
function saveWin() {
  const used = state.mowers.filter(mower => mower.spent).length;
  const stars = used === 0 ? 3 : used <= 2 ? 2 : 1;
  const best = bestRun();
  if (!best || stars > best.stars || (stars === best.stars && state.time < best.time)) {
    try { localStorage.setItem(`games:garden:level${state.level}`, JSON.stringify({ stars, time: state.time })); } catch { /* Play normally when storage is unavailable. */ }
  }
  updateBest();
  return stars;
}
function showMenu() {
  const won = state.mode === 'won', lost = state.mode === 'lost';
  const next = won && state.level < LEVELS.length;
  $('menuEyebrow').textContent = won ? `LEVEL ${String(state.level).padStart(2, '0')} · GARDEN SECURED` : lost ? 'THE NEIGHBORS GOT A LITTLE TOO CLOSE' : 'A WELL-EARNED BREATHER';
  $('menuTitle').innerHTML = won ? 'LAWN ORDER.<br />RESTORED.' : lost ? 'GARDEN<br />OVERRUN.' : 'GARDEN<br />ON PAUSE.';
  $('menuDescription').textContent = won ? `All ${game.level.waveCount} waves cleared.${next ? ' Your next garden is waiting.' : ' The last lawn is still standing. Replay any garden to improve your stars.'}` : lost ? `A zombie reached your home. ${game.level.tip}` : 'Your plants can wait. Take your time.';
  $('resultIcon').textContent = won ? '★'.repeat(saveWin()) : lost ? '↻' : '✺';
  $('resultStats').hidden = !won && !lost;
  if (won || lost) {
    $('resultStats').replaceChildren();
    for (const [value, label] of [[state.defeated, 'ZOMBIES STOPPED'], [state.mowers.filter(mower => !mower.spent).length, 'MOWERS SAVED'], [timeLabel(state.time), 'TIME IN GARDEN']]) {
      const stat = document.createElement('div'), number = document.createElement('strong'), caption = document.createElement('span');
      number.textContent = value;
      caption.textContent = label;
      stat.append(number, caption);
      $('resultStats').append(stat);
    }
  }
  $('resumeBtn').innerHTML = `${next ? 'NEXT GARDEN' : won ? 'GROW AGAIN' : lost ? 'GIVE IT ANOTHER GROW' : 'BACK TO THE GARDEN'} <span aria-hidden="true">→</span>`;
  $('resumeBtn').disabled = graphicsLost;
  $('restartBtn').hidden = lost || state.mode === 'ready' || (won && !next);
  text($('restartBtn'), won ? 'REPLAY THIS GARDEN' : 'START LEVEL AGAIN');
  if (!menu.open) menu.showModal();
  invalidate();
}
function start(levelId) {
  if (graphicsLost) return;
  if (menu.open) menu.close();
  if (help.open) help.close();
  game.start(typeof levelId === 'number' ? levelId : state.level);
  syncLevel();
  lastMode = 'playing';
  lastWave = 0;
  bannerUntil = 0;
  speed = 1;
  $('speedBtn').textContent = '1×';
  $('speedBtn').setAttribute('aria-pressed', 'false');
  $('speedBtn').setAttribute('aria-label', 'Switch to double speed');
  $('introPanel').hidden = true;
  document.body.classList.add('garden-playing');
  select('bloom');
  hint(game.level.tip, false, 9);
  lastFrame = performance.now();
  syncUI();
  invalidate();
}
function togglePause() {
  if (graphicsLost || help.open) return;
  if (state.mode === 'playing') { game.pause(); showMenu(); }
  else if (state.mode === 'paused') { game.resume(); menu.close(); lastFrame = performance.now(); }
  syncUI();
  invalidate();
}
$('startBtn').addEventListener('click', start);
$('pauseBtn').addEventListener('click', togglePause);
$('resumeBtn').addEventListener('click', () => {
  if (graphicsLost) return;
  if (state.mode === 'paused') togglePause();
  else if (state.mode === 'won' && state.level < LEVELS.length) start(state.level + 1);
  else start();
});
$('restartBtn').addEventListener('click', start);
menu.addEventListener('cancel', event => {
  event.preventDefault();
  if (state.mode === 'paused') togglePause();
});
$('speedBtn').addEventListener('click', () => {
  speed = speed === 1 ? 2 : 1;
  $('speedBtn').textContent = `${speed}×`;
  $('speedBtn').setAttribute('aria-pressed', String(speed === 2));
  $('speedBtn').setAttribute('aria-label', `Switch to ${speed === 1 ? 'double' : 'normal'} speed`);
});
$('helpBtn').addEventListener('click', () => {
  resumeAfterHelp = state.mode === 'playing';
  game.pause();
  help.showModal();
  syncUI();
  invalidate();
});
$('helpClose').addEventListener('click', () => help.close());
help.addEventListener('close', () => {
  if (resumeAfterHelp && !graphicsLost) game.resume();
  else if (state.mode === 'paused' && !graphicsLost) showMenu();
  resumeAfterHelp = false;
  lastFrame = performance.now();
  syncUI();
  invalidate();
});
document.addEventListener('keydown', event => {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || help.open || menu.open || levels.open) return;
  const type = { Digit1: 'bloom', Digit2: 'pea', Digit3: 'nut', Digit4: 'shovel' }[event.code];
  if (type) { event.preventDefault(); select(type); }
  if ((event.code === 'KeyP' || event.code === 'Escape') && state.mode === 'playing') { event.preventDefault(); togglePause(); }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.mode === 'playing') { game.pause(); showMenu(); }
  if (document.hidden) { resumeAfterHelp = false; resumeAfterLevels = false; }
  lastFrame = performance.now();
  if (document.hidden) { cancelAnimationFrame(frameId); frameId = 0; }
  else invalidate();
});
motion.addEventListener('change', invalidate);

let previousSun = -1;
function syncUI() {
  const relayout = layoutDirty;
  layoutDirty = false;
  if (previousSun !== state.sun) { $('sunCount').textContent = state.sun; previousSun = state.sun; }
  $('pauseBtn').disabled = !['playing', 'paused'].includes(state.mode) || graphicsLost;
  $('speedBtn').disabled = !['playing', 'paused'].includes(state.mode) || graphicsLost;
  $('waveTrack').setAttribute('aria-valuenow', state.defeated);
  $('waveFill').style.width = `${state.defeated / game.level.enemies.length * 100}%`;
  const firstEnemy = game.level.enemies[0].at;
  text($('waveLabel'), state.mode === 'ready' ? 'YOUR GARDEN AWAITS' : state.time < firstEnemy ? `FIRST ZOMBIE IN ${Math.max(0, Math.ceil(firstEnemy - state.time))}S` : `WAVE ${state.wave} OF ${game.level.waveCount}`);
  text($('waveCount'), state.mode === 'ready' ? `${game.level.waveCount} WAVES` : `${state.defeated} / ${game.level.enemies.length}`);
  for (const [index, button] of seeds.entries()) {
    const type = button.dataset.seed;
    button.classList.toggle('unaffordable', state.sun < PLANTS[type].cost);
    const transform = `scaleX(${state.cooldowns[type] / PLANTS[type].cooldown})`;
    if (seedMeters[index].style.transform !== transform) seedMeters[index].style.transform = transform;
    button.title = `${PLANTS[type].description}${state.cooldowns[type] > 0 ? ` Ready in ${Math.ceil(state.cooldowns[type])} seconds.` : ''}`;
  }
  const planting = state.mode === 'playing' && !graphicsLost;
  for (const cell of cells) {
    const row = Number(cell.dataset.row), col = Number(cell.dataset.col);
    if (relayout) {
      const bounds = view.cellBounds(row, col);
      cell.style.left = `${bounds.left}px`;
      cell.style.top = `${bounds.top}px`;
      cell.style.width = `${bounds.width}px`;
      cell.style.height = `${bounds.height}px`;
    }
    cell.disabled = !planting;
    const plant = state.plants.find(plant => plant.row === row && plant.col === col);
    const label = `Lane ${row + 1}, column ${col + 1}: ${plant ? `${PLANTS[plant.type].name}, ${Math.ceil(plant.hp)} health` : 'empty patch'}`;
    if (cell.getAttribute('aria-label') !== label) cell.setAttribute('aria-label', label);
    const health = cell.firstElementChild;
    health.hidden = !plant || plant.hp >= PLANTS[plant.type].hp;
    if (plant && !health.hidden) {
      health.style.setProperty('--hp', `${Math.max(0, plant.hp / PLANTS[plant.type].hp * 100)}%`);
      health.classList.toggle('low', plant.hp < PLANTS[plant.type].hp * 0.4);
    }
  }
  const visibleSuns = new Set();
  for (const sun of state.suns) {
    visibleSuns.add(sun.id);
    let button = sunButtons.get(sun.id);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'sun-drop';
      button.innerHTML = '☀<span>25</span>';
      button.setAttribute('aria-label', 'Collect 25 sun');
      button.addEventListener('click', () => { if (game.collectSun(sun.id)) { hint('+25 sun. A little sunshine goes a long way.', false, 2); syncUI(); invalidate(); } });
      sunButtons.set(sun.id, button);
      $('sunDrops').append(button);
    }
    if (relayout || !button.style.left) {
      const position = view.project(sun.x, sun.row, 1.5);
      button.style.left = `${position.x}px`;
      button.style.top = `${position.y}px`;
    }
    button.classList.toggle('expiring', sun.age > sun.life - 3);
    button.disabled = !planting;
  }
  for (const [id, button] of sunButtons) {
    if (visibleSuns.has(id)) continue;
    button.remove();
    sunButtons.delete(id);
  }
  if (state.spawned > 0 && state.wave !== lastWave && state.mode === 'playing') {
    lastWave = state.wave;
    bannerUntil = state.time + 4;
    $('waveBanner').textContent = state.wave === game.level.waveCount ? 'FINAL WAVE · DIG IN!' : `WAVE 0${state.wave} · HERE THEY COME`;
  }
  $('waveBanner').hidden = state.time >= bannerUntil || state.mode !== 'playing';
  if (state.time > messageUntil && state.mode === 'playing') {
    hint(state.suns.length ? 'A little sunshine! Tap the glowing suns to collect them.' : state.time < firstEnemy ? game.level.tip : selected === 'shovel' ? 'Tap a plant to remove it and recover half its sun cost.' : 'Pea pods fire to the right. Keep every lane covered.', false, 2);
  }
  if (state.mode !== lastMode) {
    lastMode = state.mode;
    if (state.mode === 'won' || state.mode === 'lost') showMenu();
  }
}
function frame(now) {
  frameId = 0;
  if (document.hidden) return;
  const active = state.mode === 'playing' && !graphicsLost;
  const demo = state.mode === 'ready' && !touch && !motion.matches && !help.open && !levels.open && !graphicsLost;
  const interval = active ? 1000 / (touch ? 30 : 60) : 1000 / 15;
  if (!viewDirty && now - lastRender < interval - 0.5) { if (active || demo) requestFrame(); return; }
  const dt = Math.min(0.1, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if (active) game.tick(dt * speed);
  if (viewDirty || layoutDirty || now - lastUI >= 100) { syncUI(); lastUI = now; }
  if (active || demo || viewDirty) view.render(state, state.mode === 'ready' ? now / 1000 : state.time);
  viewDirty = false;
  lastRender = now;
  if (active || demo) requestFrame();
}
syncLevel();
syncUI();
view.render(state, 0);
$('startBtn').disabled = false;
$('startBtn').innerHTML = 'LET’S GROW <span aria-hidden="true">→</span>';
$('levelsBtn').disabled = false;
document.body.dataset.ready = 'true';
invalidate();
if (new URLSearchParams(location.search).get('debug') === '1') {
  window.__garden = {
    game, view, select, start,
    advance(seconds) { game.tick(seconds); syncUI(); view.render(state, state.time); },
    stopRendering() { renderingStopped = true; cancelAnimationFrame(frameId); frameId = 0; },
  };
}
