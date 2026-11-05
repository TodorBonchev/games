import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVITIES, DISTRICTS } from '../activities/catalog.js';
import { freshProgress, parseProgress, completeActivity, claimDistrictMilestone, writeProgress, readProgress } from '../activities/progress.js';
import { completedStages, nextUnfinishedStage, districtProgress, directoryEntries, nearestUnrestored, checkpointSummary } from '../activities/directory.js';
import { createGame } from './harness.mjs';

const checkpoint = (id, level = 1, savedAt) => ({ id, level, seed: 42, state: { schema: 1, id, level }, ...(savedAt ? { savedAt } : {}) });
const stations = ACTIVITIES.map((activity, index) => ({ id: activity.id, x: 30 - index, z: 0 }));
const store = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; };

test('directory search combines task, title and district terms with status and district filters', () => {
  const progress = freshProgress(); completeActivity(progress, 'prism', 8);
  progress.checkpoints.prism = checkpoint('prism', 2); progress.checkpoints.garden = checkpoint('garden');
  const find = options => directoryEntries({ progress, stations, position: { x: 0, z: 0 }, ...options }).map(entry => entry.id);
  assert.deepEqual(find({ query: '  SOLAR   relay ' }), ['prism']);
  assert.ok(find({ query: 'Relay Command' }).includes('garden'));
  assert.deepEqual(find({ query: 'Prism Orchard', status: 'unrestored' }), []);
  assert.deepEqual(find({ query: 'prism', status: 'restored', district: 'relay' }), ['prism']);
  assert.deepEqual(find({ query: 'prism', status: 'in-progress', district: 'relay' }), ['prism']);
  assert.deepEqual(find({ query: 'prism', district: 'harbor' }), []);
  assert.deepEqual(new Set(find({ status: 'in-progress' })), new Set(['garden', 'prism']));
  assert.deepEqual(find({ query: '<script>missing</script>' }), []);
});

test('nearest ordering and next-unrestored navigation use current distance without changing a manual target', () => {
  const progress = freshProgress(); progress.target = 'dewfall';
  const options = { progress, stations, position: { x: 0, z: 0 } };
  assert.equal(directoryEntries(options)[0].id, ACTIVITIES.at(-1).id);
  assert.deepEqual(directoryEntries({ ...options, sort: 'catalog' }).map(a => a.id), ACTIVITIES.map(a => a.id));
  const nearest = nearestUnrestored(progress, stations, options.position); completeActivity(progress, nearest.id);
  assert.notEqual(nearestUnrestored(progress, stations, options.position).id, nearest.id);
  assert.equal(progress.target, 'dewfall');
  for (const activity of ACTIVITIES) completeActivity(progress, activity.id);
  assert.equal(nearestUnrestored(progress, stations, options.position), null);
});

test('exact stage wins migrate the one known legacy stage and recommend the earliest actual gap', () => {
  const progress = parseProgress({ version: 1, completed: ['prism'], levels: { prism: 8 }, checkpoints: {}, plays: {} });
  assert.deepEqual(completedStages(progress, 'prism'), [8]); assert.equal(nextUnfinishedStage(progress, 'prism'), 1);
  completeActivity(progress, 'prism', 1); completeActivity(progress, 'prism', 3); completeActivity(progress, 'prism', 1);
  assert.deepEqual(progress.stages.prism, [1, 3, 8]); assert.equal(progress.levels.prism, 8);
  assert.equal(nextUnfinishedStage(progress, 'prism'), 2);
  const memory = store(); assert.ok(writeProgress(progress, memory)); assert.deepEqual(readProgress(memory).stages, progress.stages);
  for (let stage = 1; stage <= 8; stage++) completeActivity(progress, 'prism', stage);
  assert.equal(nextUnfinishedStage(progress, 'prism'), null);
  assert.deepEqual(completedStages(parseProgress({ version: 1, completed: ['prism'] }), 'prism'), [], 'an unknown historical stage is never fabricated');
  const bad = parseProgress({ ...progress, stages: { prism: [1, 1, 9, -1, '2', 8] } });
  assert.deepEqual(bad.stages.prism, [1, 8]);
  const empty = parseProgress({ ...progress, stages: { prism: [] } });
  assert.ok(writeProgress(empty, memory)); assert.deepEqual(completedStages(readProgress(memory), 'prism'), [], 'an explicit empty stage record remains authoritative after saving');
});

test('district counts and milestone acknowledgement work exactly once across replays and reloads', () => {
  const progress = freshProgress(), district = DISTRICTS[0];
  for (const id of district.missions.slice(0, -1)) completeActivity(progress, id);
  assert.equal(districtProgress(progress)[0].count, 4); assert.equal(claimDistrictMilestone(progress, district.id), null);
  completeActivity(progress, district.missions.at(-1)); assert.equal(districtProgress(progress)[0].count, 5);
  assert.equal(claimDistrictMilestone(progress, district.id)?.id, district.id);
  const restored = parseProgress(JSON.parse(JSON.stringify(progress)));
  completeActivity(restored, district.missions[0]); assert.equal(claimDistrictMilestone(restored, district.id), null);
  assert.deepEqual(restored.districtMilestones, [district.id]);
  const legacy = parseProgress({ version: 1, completed: [...district.missions] });
  assert.deepEqual(legacy.districtMilestones, [district.id]); assert.equal(claimDistrictMilestone(legacy, district.id), null);
});

test('checkpoint previews support old saves, relative age, malformed timestamps and explicit cleared targets', () => {
  const now = 2_000_000_000;
  assert.equal(checkpointSummary(checkpoint('prism', 4)), 'Stage 4 · Saved progress');
  assert.equal(checkpointSummary(checkpoint('prism', 4, now - 125000), now), 'Stage 4 · Saved 2 min ago');
  assert.equal(checkpointSummary(checkpoint('prism', 4, now + 1000), now), 'Stage 4 · Saved just now');
  const progress = freshProgress(); progress.targetCleared = true;
  progress.checkpoints.prism = { ...checkpoint('prism', 4), savedAt: 'invalid' };
  const parsed = parseProgress(progress); assert.equal(parsed.targetCleared, true); assert.equal(parsed.checkpoints.prism.savedAt, undefined);
  assert.equal(parseProgress({ ...progress, target: 'prism' }).targetCleared, false);
});

test('real journal search retains focus, displays empty/reset feedback and leaves survival frozen', async t => {
  const env = await createGame(); t.after(() => env.close()); env.start();
  const host = env.game.activities.host, doc = env.window.document;
  assert.ok(host.journal());
  const frozen = { time: env.game.time, hp: env.game.hp, wave: env.game.wave, pos: [...env.game.pos] };
  const search = doc.getElementById('expeditionSearch'); search.focus(); search.value = 'solar relay'; search.dispatchEvent(new env.window.Event('input', { bubbles: true }));
  assert.equal(doc.activeElement, search); assert.equal(doc.querySelectorAll('.expedition-entry').length, 1);
  assert.equal(doc.querySelector('.expedition-entry').dataset.activity, 'prism'); assert.match(doc.getElementById('expeditionResultCount').textContent, /^1 of 30/);
  search.dispatchEvent(new env.window.KeyboardEvent('keydown', { code: 'KeyM', key: 'm', bubbles: true, cancelable: true }));
  assert.equal(host.phase, 'journal'); assert.equal(doc.activeElement, search);
  const status = doc.getElementById('expeditionStatus'); status.value = 'restored'; status.dispatchEvent(new env.window.Event('change'));
  assert.match(doc.getElementById('expeditionResultCount').textContent, /^0 of 30/);
  doc.getElementById('expeditionResetFilters').click(); assert.equal(search.value, ''); assert.equal(status.value, 'all');
  assert.equal(doc.querySelectorAll('.expedition-entry').length, 30); assert.equal(doc.activeElement, search);
  env.step(3); assert.deepEqual({ time: env.game.time, hp: env.game.hp, wave: env.game.wave, pos: [...env.game.pos] }, frozen);
});

test('real journal clear/track actions only change waypoints and never launch a remote activity', async t => {
  const env = await createGame(); t.after(() => env.close()); env.start();
  const { host, world, progress } = env.game.activities, doc = env.window.document;
  host.setTarget('prism'); host.journal(); doc.getElementById('expeditionClearTarget').click();
  assert.equal(progress.target, null); assert.equal(progress.targetCleared, true); assert.equal(world.target, null);
  assert.equal(host.phase, 'journal'); assert.equal(doc.getElementById('expeditionClearTarget').disabled, true);
  const expected = nearestUnrestored(progress, world.stations, env.game.player.position).id;
  doc.getElementById('expeditionTrackNext').click();
  assert.equal(progress.target, expected); assert.equal(progress.targetCleared, false); assert.equal(world.target, expected);
  assert.equal(host.active, false); assert.equal(host.controller, null); assert.equal(env.game.mode, 'play');
});

test('real activity briefing recommends gaps, labels only actual wins and previews the saved stage separately', async t => {
  const env = await createGame(); t.after(() => env.close()); env.start();
  const { host, world, progress } = env.game.activities, doc = env.window.document;
  completeActivity(progress, 'prism', 8);
  const station = world.stations.find(s => s.id === 'prism'); env.game.setPos(station.x, station.z); assert.ok(host.open('prism'));
  assert.equal(host.level, 1);
  const select = doc.querySelector('[aria-label="Activity stage"]');
  assert.match(select.options[0].textContent, /next unfinished/); assert.doesNotMatch(select.options[0].textContent, /completed/);
  assert.match(select.options[7].textContent, /completed/); assert.equal(doc.getElementById('activityStartFresh').hidden, true);
  host.close(); progress.checkpoints.prism = checkpoint('prism', 4, Date.now() - 125000); assert.ok(host.open('prism'));
  assert.equal(host.level, 4); assert.equal(doc.getElementById('activityBegin').textContent, 'Continue activity');
  assert.equal(doc.getElementById('activityStartFresh').hidden, false); assert.match(doc.getElementById('activityCheckpointPreview').textContent, /Stage 4 · Saved 2 min ago/);
  const stages = doc.querySelector('[aria-label="Activity stage"]'); stages.value = '2'; stages.dispatchEvent(new env.window.Event('change'));
  assert.equal(doc.getElementById('activityBegin').textContent, 'Begin activity'); assert.equal(doc.getElementById('activityStartFresh').hidden, true);
  assert.match(doc.getElementById('activityCheckpointPreview').textContent, /Select that stage to continue/);
});
