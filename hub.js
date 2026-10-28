import { readGameSave } from './save-store.js?v7';
import { readProgress } from './voyage/progress.js';

const games = {
  soldier: { levels: 2 }, garden: { levels: 5 }, borrowed: { levels: 6 },
  prism: { levels: 8, label: 'ORCHARD', modes: ['playing', 'paused', 'won'] },
  lantern: { levels: 1, label: 'FLIGHT', modes: ['playing', 'paused', 'won', 'exploring'] },
};

function validCheckpoint(game, data, config) {
  if (data?.schema !== 1 && !(game === 'lantern' && data?.schema === 2)) return false;
  if (!Number.isInteger(data.level) || data.level < 1 || data.level > config.levels) return false;
  if (config.modes) return config.modes.includes(data.mode);
  if (game === 'borrowed') return Number.isInteger(data.loop) && data.loop >= 1 && data.loop <= 9 && ['playing', 'paused', 'between', 'won'].includes(data.mode);
  return Number.isInteger(data.wave) && data.wave >= 1 && (game === 'garden' ? ['playing', 'paused', 'won'].includes(data.mode) : ['play', 'upgrade', 'victory'].includes(data.phase));
}

function checkpointLabel(game, data, config) {
  if (config.label) return `SAVED · ${config.label} ${data.level} / ${config.levels}`;
  if (game === 'borrowed') return `SAVED · CHAMBER ${data.level} · LOOP ${data.loop}`;
  if (game === 'garden') return `SAVED · GARDEN ${data.level} · WAVE ${data.wave}`;
  return `SAVED · ${data.level === 2 ? 'EMBER' : 'PALM'} ISLE · WAVE ${data.wave}`;
}

function refreshSavedGames() {
  const progress = readProgress();
  const completed = Array.isArray(progress?.completed) ? progress.completed.length : 0;
  const hasVoyage = completed > 0 || !!progress?.active || progress?.chapter > 0;
  const voyage = document.querySelector('.wonderwake-card');
  if (voyage) {
    voyage.querySelector('[data-play-label]').textContent = hasVoyage ? 'CONTINUE THE VOYAGE' : 'START THE VOYAGE';
    const note = voyage.querySelector('.game-save-note');
    note.hidden = !hasVoyage;
    note.textContent = hasVoyage ? `SAVED · ${completed} / 25 FRIENDS RECRUITED` : '';
  }
  for (const [game, config] of Object.entries(games)) {
    const data = readGameSave(game)?.data, valid = validCheckpoint(game, data, config);
    const url = new URL(`${game}.html`, document.baseURI);
    if (valid) { url.searchParams.set('level', data.level); url.searchParams.set('continue', '1'); }
    document.querySelectorAll(`[data-game-link="${game}"]`).forEach(link => { link.href = url.href; });
    const card = document.querySelector(`.${game}-card`);
    if (!card) continue;
    card.querySelector('[data-play-label]').textContent = valid ? 'CONTINUE RUN' : 'PLAY GAME';
    const note = card.querySelector('.game-save-note');
    note.hidden = !valid;
    if (valid) note.textContent = checkpointLabel(game, data, config);
  }
}
refreshSavedGames();
addEventListener('pageshow', refreshSavedGames);
addEventListener('storage', refreshSavedGames);
