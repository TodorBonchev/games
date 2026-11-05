import { ACTIVITIES, DISTRICTS, byId } from './catalog.js';
import { readProgress as readVoyage } from '../voyage/progress.js';
import { completedStages } from './directory.js?v25';

export const SAVE_KEY = 'games:zombie:expedition:v1';
export const freshProgress = () => ({ version: 1, completed: [], levels: {}, stages: {}, checkpoints: {}, plays: {}, target: null, targetCleared: false, districtMilestones: [] });
export function parseProgress(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.completed) || value.completed.length > 30 || value.completed.some(id => !byId.has(id))) return null;
  const result = freshProgress();
  result.completed = [...new Set(value.completed)];
  result.target = byId.has(value.target) ? value.target : null;
  result.targetCleared = result.target === null && value.targetCleared === true;
  for (const { id, levelCount } of ACTIVITIES) {
    const level = value.levels?.[id];
    if (Number.isInteger(level) && level >= 1 && level <= levelCount) result.levels[id] = level;
    const stages = completedStages(value, id);
    if (stages.length || Array.isArray(value.stages?.[id])) result.stages[id] = stages;
    const plays = value.plays?.[id];
    if (Number.isInteger(plays) && plays >= 0 && plays <= 100000) result.plays[id] = plays;
    const saved = value.checkpoints?.[id];
    if (saved?.id === id && Number.isInteger(saved.level) && saved.level >= 1 && saved.level <= levelCount && Number.isInteger(saved.seed) && saved.seed >= 0 && saved.seed <= 0xffffffff && saved.state && typeof saved.state === 'object' && !Array.isArray(saved.state)) {
      const { savedAt, ...checkpoint } = saved;
      result.checkpoints[id] = { ...checkpoint, ...(Number.isFinite(savedAt) && savedAt > 0 ? { savedAt } : {}) };
    }
  }
  // Districts already restored in older profiles have already been celebrated.
  const known = Array.isArray(value.districtMilestones) ? value.districtMilestones : DISTRICTS.filter(d => d.missions.every(id => result.completed.includes(id))).map(d => d.id);
  result.districtMilestones = DISTRICTS.filter(d => known.includes(d.id) && d.missions.every(id => result.completed.includes(id))).map(d => d.id);
  return result;
}
export function readProgress(storage) {
  try {
    const raw = (storage ?? globalThis.localStorage).getItem(SAVE_KEY);
    if (raw && raw.length <= 5000000) { const valid = parseProgress(JSON.parse(raw)); if (valid) return valid; }
  } catch {}
  const result = freshProgress(), voyage = readVoyage(storage);
  result.completed = [...voyage.completed];
  for (const id of voyage.completed) { result.levels[id] = 1; result.stages[id] = [1]; }
  result.plays = { ...voyage.plays };
  for (const [id, checkpoint] of Object.entries(voyage.checkpoints)) {
    if (byId.has(id)) result.checkpoints[id] = { ...checkpoint, level: Math.max(1, Math.min(byId.get(id).levelCount, checkpoint.state.level || 1)) };
  }
  result.districtMilestones = DISTRICTS.filter(d => d.missions.every(id => result.completed.includes(id))).map(d => d.id);
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
  const stages = completedStages(progress, id);
  progress.stages ||= {}; progress.stages[id] = [...new Set([...stages, level])].sort((a, b) => a - b);
  progress.levels[id] = Math.max(progress.levels[id] || 0, level);
  progress.plays[id] = Math.min(100000, (progress.plays[id] || 0) + 1);
  delete progress.checkpoints[id];
  return first;
}

export function claimDistrictMilestone(progress, id) {
  const district = DISTRICTS.find(d => d.id === id);
  if (!district || !district.missions.every(activity => progress.completed.includes(activity))) return null;
  progress.districtMilestones ||= [];
  if (progress.districtMilestones.includes(id)) return null;
  progress.districtMilestones.push(id); return district;
}
