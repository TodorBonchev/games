import { ACTIVITIES, DISTRICTS, byId } from './catalog.js';

export function completedStages(progress, id) {
  const activity = byId.get(id); if (!activity) return [];
  const exact = progress.stages?.[id];
  if (Array.isArray(exact)) return [...new Set(exact.filter(n => Number.isInteger(n) && n >= 1 && n <= activity.levelCount))].sort((a, b) => a - b);
  // Old saves recorded only the highest win. Earlier stages are unknown.
  const highest = progress.levels?.[id];
  return Number.isInteger(highest) && highest >= 1 && highest <= activity.levelCount ? [highest] : [];
}

export function nextUnfinishedStage(progress, id) {
  const activity = byId.get(id); if (!activity) return null;
  const won = new Set(completedStages(progress, id));
  for (let stage = 1; stage <= activity.levelCount; stage++) if (!won.has(stage)) return stage;
  return null;
}

export function districtProgress(progress) {
  const restored = new Set(progress.completed || []);
  return DISTRICTS.map(district => ({ ...district, count: district.missions.filter(id => restored.has(id)).length, total: district.missions.length }));
}

const normalized = text => String(text || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
export function directoryEntries({ progress, stations = [], position = { x: 0, z: 0 }, query = '', district = 'all', status = 'all', sort = 'nearest' }) {
  const locations = new Map(stations.map(station => [station.id, station]));
  const restored = new Set(progress.completed || []), words = normalized(query).trim().split(/\s+/).filter(Boolean);
  return ACTIVITIES.map((activity, index) => {
    const station = locations.get(activity.id), neighborhood = DISTRICTS.find(d => d.id === activity.district);
    const distance = station && Number.isFinite(position.x) && Number.isFinite(position.z) ? Math.hypot(station.x - position.x, station.z - position.z) : Infinity;
    return { ...activity, index, distance, restored: restored.has(activity.id), checkpoint: progress.checkpoints?.[activity.id] || null,
      searchable: normalized(`${activity.title} ${activity.originalTitle} ${activity.task} ${activity.description} ${activity.category} ${neighborhood.title}`) };
  }).filter(entry => (district === 'all' || entry.district === district) &&
    (status === 'unrestored' ? !entry.restored : status === 'in-progress' ? !!entry.checkpoint : status === 'restored' ? entry.restored : true) &&
    words.every(word => entry.searchable.includes(word)))
    .sort((a, b) => (sort === 'nearest' ? a.distance - b.distance : 0) || a.index - b.index);
}

export function nearestUnrestored(progress, stations, position) {
  return directoryEntries({ progress, stations, position, status: 'unrestored', sort: 'nearest' }).find(entry => Number.isFinite(entry.distance)) || null;
}

export function checkpointSummary(checkpoint, now = Date.now()) {
  if (!checkpoint) return '';
  let age = 'Saved progress';
  if (Number.isFinite(checkpoint.savedAt) && checkpoint.savedAt > 0) {
    const minutes = Math.floor(Math.max(0, now - checkpoint.savedAt) / 60000);
    age = minutes < 1 ? 'Saved just now' : minutes < 60 ? `Saved ${minutes} min ago` : minutes < 1440 ? `Saved ${Math.floor(minutes / 60)} h ago` : `Saved ${Math.floor(minutes / 1440)} d ago`;
  }
  return `Stage ${checkpoint.level} · ${age}`;
}
