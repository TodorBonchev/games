// Each game owns a versioned slot. Existing scores, preferences and stars are
// separate keys and are never cleared when a run is restarted or finishes.
export const SAVE_KEYS = Object.freeze({ soldier: 'games:save:soldier', garden: 'games:save:garden' });
const MAX_SAVE_BYTES = 250000;

export function readGameSave(game, storage) {
  try {
    if (!SAVE_KEYS[game]) return null;
    const raw = (storage ?? globalThis.localStorage).getItem(SAVE_KEYS[game]);
    if (!raw || raw.length > MAX_SAVE_BYTES) return null;
    const save = JSON.parse(raw);
    return save?.version === 1 && Number.isFinite(save.savedAt) && save.savedAt > 0 && save.data && typeof save.data === 'object' ? save : null;
  } catch { return null; }
}

export function writeGameSave(game, data, storage) {
  try {
    if (!SAVE_KEYS[game] || !data || typeof data !== 'object') return false;
    const raw = JSON.stringify({ version: 1, savedAt: Date.now(), data });
    if (raw.length > MAX_SAVE_BYTES) return false;
    (storage ?? globalThis.localStorage).setItem(SAVE_KEYS[game], raw);
    return true;
  } catch { return false; }
}

export function removeGameSave(game, storage) {
  try {
    if (!SAVE_KEYS[game]) return false;
    (storage ?? globalThis.localStorage).removeItem(SAVE_KEYS[game]);
    return true;
  } catch { return false; }
}
