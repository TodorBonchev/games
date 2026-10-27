// Each new game has its own checkpoint and completion record. Storage may be
// unavailable (private browsing, quota, or policy); play never depends on it.
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_LENGTH = 250000;
const key = id => `games:save:arcade:${id}`;
const recordKey = id => `games:arcade:${id}:record`;
const validData = (id, data) => {
  const state = data?.state;
  return data?.schema === 1 && data.id === id && Number.isInteger(data.seed) && data.seed >= 0 && data.seed <= 0xffffffff &&
    ['playing', 'won', 'lost'].includes(data.mode) && state && typeof state === 'object' && !Array.isArray(state) &&
    state.schema === 1 && state.mode === data.mode && (state.id === id || state.game === id) &&
    (state.id === undefined || state.id === id) && (state.game === undefined || state.game === id);
};

export function readArcadeSave(id, storage) {
  try {
    if (!idPattern.test(id)) return null;
    const raw = (storage ?? globalThis.localStorage).getItem(key(id));
    if (!raw || raw.length > MAX_LENGTH) return null;
    const value = JSON.parse(raw), data = value?.data;
    if (value?.version !== 1 || !Number.isFinite(value.savedAt) || value.savedAt <= 0 || !validData(id, data)) return null;
    return data;
  } catch { return null; }
}

export function writeArcadeSave(id, data, storage) {
  try {
    if (!idPattern.test(id) || !validData(id, data)) return false;
    const raw = JSON.stringify({ version: 1, savedAt: Date.now(), data });
    if (raw.length > MAX_LENGTH) return false;
    (storage ?? globalThis.localStorage).setItem(key(id), raw);
    return true;
  } catch { return false; }
}

export function readArcadeRecord(id, storage) {
  try {
    if (!idPattern.test(id)) return { wins: 0 };
    const value = JSON.parse((storage ?? globalThis.localStorage).getItem(recordKey(id)));
    return { wins: Number.isSafeInteger(value?.wins) && value.wins >= 0 && value.wins <= 1e7 ? value.wins : 0 };
  } catch { return { wins: 0 }; }
}

export function addArcadeWin(id, storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    const record = readArcadeRecord(id, target);
    record.wins = Math.min(1e7, record.wins + 1);
    target.setItem(recordKey(id), JSON.stringify(record));
    return true;
  } catch { return false; }
}
