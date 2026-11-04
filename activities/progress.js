import { ACTIVITIES, byId } from './catalog.js';
import { readProgress as readVoyage } from '../voyage/progress.js';

export const SAVE_KEY = 'games:zombie:expedition:v1';
export const freshProgress = () => ({ version: 1, completed: [], levels: {}, checkpoints: {}, plays: {}, target: null });
export function parseProgress(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.completed) || value.completed.length > 30 || value.completed.some(id => !byId.has(id))) return null;
  const result = freshProgress();
  result.completed = [...new Set(value.completed)];
  result.target = byId.has(value.target) ? value.target : null;
  for (const { id, levelCount } of ACTIVITIES) {
    const level = value.levels?.[id];
    if (Number.isInteger(level) && level >= 1 && level <= levelCount) result.levels[id] = level;
    const plays = value.plays?.[id];
    if (Number.isInteger(plays) && plays >= 0 && plays <= 100000) result.plays[id] = plays;
    const saved = value.checkpoints?.[id];
    if (saved?.id === id && Number.isInteger(saved.level) && saved.level >= 1 && saved.level <= levelCount && Number.isInteger(saved.seed) && saved.seed >= 0 && saved.seed <= 0xffffffff && saved.state && typeof saved.state === 'object' && !Array.isArray(saved.state)) result.checkpoints[id] = saved;
  }
  return result;
}
export function readProgress(storage) {
  try {
    const raw = (storage ?? globalThis.localStorage).getItem(SAVE_KEY);
    if (raw && raw.length <= 5000000) { const valid = parseProgress(JSON.parse(raw)); if (valid) return valid; }
  } catch {}
  const result = freshProgress(), voyage = readVoyage(storage);
  result.completed = [...voyage.completed];
  for (const id of voyage.completed) result.levels[id] = 1;
  result.plays = { ...voyage.plays };
  for (const [id, checkpoint] of Object.entries(voyage.checkpoints)) {
    if (byId.has(id)) result.checkpoints[id] = { ...checkpoint, level: Math.max(1, Math.min(byId.get(id).levelCount, checkpoint.state.level || 1)) };
  }
  return result;
}
export function writeProgress(progress, storage) {
  try {
    const valid = parseProgress(progress); if (!valid) return false;
    const raw = JSON.stringify(valid); if (raw.length > 5000000) return false;
    (storage ?? globalThis.localStorage).setItem(SAVE_KEY, raw); return true;
  } catch { return false; }
}
export function completeActivity(progress, id, level = 1) {
  const activity = byId.get(id);
  if (!activity || !Number.isInteger(level) || level < 1 || level > activity.levelCount) return false;
  const first = !progress.completed.includes(id);
  if (first) progress.completed.push(id);
  progress.levels[id] = Math.max(progress.levels[id] || 0, level);
  progress.plays[id] = Math.min(100000, (progress.plays[id] || 0) + 1);
  delete progress.checkpoints[id];
  return first;
}
