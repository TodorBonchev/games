import { readGameSave } from './save-store.js?v7';
import { ACTIVITY_IDS } from './activity-redirect.js';

const EXPEDITION_KEY = 'games:zombie:expedition:v1';
const activityIds = new Set(ACTIVITY_IDS);
function expeditionCount() {
  try {
    const raw = localStorage.getItem(EXPEDITION_KEY);
    if (!raw || raw.length > 5000000) return 0;
    const data = JSON.parse(raw);
    return Array.isArray(data?.completed) ? new Set(data.completed.filter(id => activityIds.has(id))).size : 0;
  } catch { return 0; }
}
function refreshSavedGames() {
  const data = readGameSave('soldier')?.data;
  const valid = data?.schema === 1 && Number.isInteger(data.level) && data.level >= 1 && data.level <= 2 && Number.isInteger(data.wave) && data.wave >= 1 && ['play', 'upgrade', 'victory'].includes(data.phase);
  const url = new URL('soldier.html', document.baseURI);
  if (valid) { url.searchParams.set('level', data.level); url.searchParams.set('continue', '1'); }
  document.querySelectorAll('[data-game-link="soldier"]').forEach(link => { link.href = url.href; });
  const card = document.querySelector('.soldier-card');
  if (!card) return;
  card.querySelector('[data-play-label]').textContent = valid ? 'CONTINUE THE ADVENTURE' : 'ENTER THE WORLD';
  const note = card.querySelector('.game-save-note');
  note.hidden = !valid;
  note.textContent = valid ? `SAVED · ${data.level === 2 ? 'EMBER' : 'PALM'} ISLE · WAVE ${data.wave}` : '';
  const count = expeditionCount(), expedition = card.querySelector('.expedition-note');
  expedition.hidden = count === 0;
  expedition.textContent = count ? `${count} / 30 OUTPOST ACTIVITIES COMPLETED` : '';
}
refreshSavedGames();
addEventListener('pageshow', refreshSavedGames);
addEventListener('storage', refreshSavedGames);
