import { readGameSave } from './save-store.js?v6';

const games = {
  soldier: { levels: 2 }, garden: { levels: 5 }, borrowed: { levels: 6 }, moonbounce: { waves: 5 },
  popwake: { levels: 8, label: 'PUZZLE', modes: ['playing', 'drawing', 'running', 'paused', 'won', 'failed'] },
  pondpost: { levels: 5, label: 'ROUTE', modes: ['playing', 'aiming', 'flying', 'recovering', 'paused', 'won'] },
  prism: { levels: 8, label: 'ORCHARD', modes: ['playing', 'paused', 'won'] },
  ribbon: { levels: 5, label: 'CURRENT', modes: ['playing', 'paused', 'won'] },
  dewfall: { levels: 6, label: 'GARDEN', modes: ['playing', 'paused', 'won'] },
};

function validCheckpoint(game, data, config) {
  if (data?.schema !== 1) return false;
  if (game === 'moonbounce') return Number.isInteger(data.wave) && data.wave >= 1 && data.wave <= config.waves && ['playing', 'paused', 'upgrade', 'won'].includes(data.mode);
  if (!Number.isInteger(data.level) || data.level < 1 || data.level > config.levels) return false;
  if (config.modes) return config.modes.includes(data.mode);
  if (game === 'borrowed') return Number.isInteger(data.loop) && data.loop >= 1 && data.loop <= 9 && ['playing', 'paused', 'between', 'won'].includes(data.mode);
  return Number.isInteger(data.wave) && data.wave >= 1 && (game === 'garden' ? ['playing', 'paused', 'won'].includes(data.mode) : ['play', 'upgrade', 'victory'].includes(data.phase));
}

function checkpointLabel(game, data, config) {
  if (config.label) return `SAVED · ${config.label} ${data.level} / ${config.levels}`;
  if (game === 'moonbounce') return `SAVED · WAVE ${data.wave} / 5`;
  if (game === 'borrowed') return `SAVED · CHAMBER ${data.level} · LOOP ${data.loop}`;
  if (game === 'garden') return `SAVED · GARDEN ${data.level} · WAVE ${data.wave}`;
  return `SAVED · ${data.level === 2 ? 'EMBER' : 'PALM'} ISLE · WAVE ${data.wave}`;
}

function refreshSavedGames() {
  for (const [game, config] of Object.entries(games)) {
    const data = readGameSave(game)?.data, valid = validCheckpoint(game, data, config);
    const url = new URL(`${game}.html`, document.baseURI);
    if (valid) { if (game !== 'moonbounce') url.searchParams.set('level', data.level); url.searchParams.set('continue', '1'); }
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
