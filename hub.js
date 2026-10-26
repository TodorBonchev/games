import { readGameSave } from './save-store.js?v2';

function refreshSavedGames() {
  for (const game of ['soldier', 'garden', 'borrowed']) {
    const save = readGameSave(game), data = save?.data;
    const valid = data?.schema === 1 && Number.isInteger(data.level) && data.level >= 1 && data.level <= ({ garden: 5, soldier: 2, borrowed: 6 }[game])
      && (game === 'borrowed' ? Number.isInteger(data.loop) && data.loop >= 1 && data.loop <= 9 && ['playing', 'paused', 'between', 'won'].includes(data.mode)
        : Number.isInteger(data.wave) && data.wave >= 1 && (game === 'garden' ? ['playing', 'paused', 'won'].includes(data.mode) : ['play', 'upgrade', 'victory'].includes(data.phase)));
    const url = new URL(`${game}.html`, document.baseURI);
    if (valid) { url.searchParams.set('level', data.level); url.searchParams.set('continue', '1'); }
    document.querySelectorAll(`[data-game-link="${game}"]`).forEach(link => { link.href = url.href; });
    const card = document.querySelector(`.${game}-card`);
    card.querySelector('[data-play-label]').textContent = valid ? 'CONTINUE RUN' : 'PLAY GAME';
    const note = card.querySelector('.game-save-note');
    note.hidden = !valid;
    if (valid) note.textContent = game === 'borrowed' ? `SAVED · CHAMBER ${data.level} · LOOP ${data.loop}` : game === 'garden' ? `SAVED · GARDEN ${data.level} · WAVE ${data.wave}` : `SAVED · ${data.level === 2 ? 'EMBER' : 'PALM'} ISLE · WAVE ${data.wave}`;
  }
}
refreshSavedGames();
addEventListener('pageshow', refreshSavedGames);
addEventListener('storage', refreshSavedGames);
