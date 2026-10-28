import test from 'node:test';
import assert from 'node:assert/strict';
import { arcadeGames } from '../arcade/catalog.js';
import {
  CHAPTERS, MISSIONS, missionById, SAVE_KEY, freshProgress, chapterCount,
  unlockedChapter, festivalReady, isUnlocked, nextMission, parseProgress,
  readProgress, writeProgress, completeMission,
} from '../voyage/progress.js';

function memoryStorage(initial = []) {
  const values = new Map(initial), reads = [], writes = [];
  return {
    values, reads, writes,
    getItem(key) { reads.push(key); return values.get(key) ?? null; },
    setItem(key, value) { writes.push(key); values.set(key, String(value)); },
  };
}
function completeIsland(progress, island, indices = [0, 1, 2]) {
  for (const index of indices) assert.equal(completeMission(progress, CHAPTERS[island].missions[index]), true);
}
const combinations = [];
for (let a = 0; a < 3; a++) for (let b = a + 1; b < 4; b++) for (let c = b + 1; c < 5; c++) combinations.push([a, b, c]);

test('Wonderwake combines exactly the original twenty arcade games and five selected worlds', () => {
  const expected = [...arcadeGames.map(game => game.id), 'moonbounce', 'popwake', 'pondpost', 'ribbon', 'dewfall'].sort();
  assert.equal(MISSIONS.length, 25);
  assert.equal(missionById.size, 25);
  assert.deepEqual(MISSIONS.map(mission => mission.id).sort(), expected);
  assert.deepEqual(CHAPTERS.flatMap(island => island.missions).sort(), expected);
  assert.equal(new Set(MISSIONS.map(mission => mission.hero)).size, 25);
  for (const [index, island] of CHAPTERS.entries()) {
    assert.equal(island.missions.length, 5);
    assert.ok(island.missions.every(id => missionById.get(id).chapter === index));
  }
  for (const standalone of ['soldier', 'garden', 'borrowed', 'prism', 'lantern']) assert.equal(missionById.has(standalone), false);
});

test('a fresh voyage offers the gentle first mission and independent mutable state', () => {
  const progress = freshProgress(), other = freshProgress();
  assert.equal(nextMission(progress), 'dewfall');
  assert.equal(unlockedChapter(progress), 0);
  assert.equal(festivalReady(progress), false);
  assert.ok(CHAPTERS[0].missions.every(id => isUnlocked(progress, id)));
  assert.ok(CHAPTERS.slice(1).flatMap(island => island.missions).every(id => !isUnlocked(progress, id)));
  progress.completed.push('dewfall'); progress.checkpoints.dewfall = { sentinel: true }; progress.plays.dewfall = 2;
  assert.deepEqual(other, freshProgress());
});

test('every choice of three different friends opens the next island without a required order', () => {
  for (let island = 0; island < 4; island++) for (const choice of combinations) {
    const progress = freshProgress();
    for (let earlier = 0; earlier < island; earlier++) completeIsland(progress, earlier);
    for (let done = 0; done < 3; done++) {
      assert.equal(unlockedChapter(progress), island);
      assert.equal(completeMission(progress, CHAPTERS[island].missions[choice[done]]), true);
      assert.equal(chapterCount(progress, island), done + 1);
    }
    assert.equal(unlockedChapter(progress), island + 1);
    assert.ok(CHAPTERS[island + 1].missions.every(id => isUnlocked(progress, id)));
    assert.ok(CHAPTERS[island].missions.every(id => isUnlocked(progress, id)), 'earlier unfinished friends stay available');
  }
});

test('replaying one friend improves its replay count but never buys another beacon', () => {
  const progress = freshProgress();
  assert.equal(completeMission(progress, 'dewfall'), true);
  for (let replay = 0; replay < 20; replay++) assert.equal(completeMission(progress, 'dewfall'), false);
  assert.deepEqual(progress.completed, ['dewfall']);
  assert.equal(progress.plays.dewfall, 21);
  assert.equal(chapterCount(progress, 0), 1);
  assert.equal(unlockedChapter(progress), 0);
  assert.equal(festivalReady(progress), false);
  progress.plays.dewfall = 100000;
  completeMission(progress, 'dewfall');
  assert.equal(progress.plays.dewfall, 100000, 'replay count stays bounded');
});

test('locked and unknown missions cannot grant progress or erase an unfinished challenge', () => {
  const progress = freshProgress();
  progress.active = { id: 'dewfall' };
  progress.checkpoints.dewfall = { id: 'dewfall', seed: 17, state: { mode: 'playing' } };
  const before = structuredClone(progress);
  for (const id of ['pondpost', 'ribbon', 'moonbounce', 'unknown', '__proto__', null]) {
    assert.equal(isUnlocked(progress, id), false);
    assert.equal(completeMission(progress, id), false);
    assert.deepEqual(progress, before);
  }
});

test('a completed mission clears its unfinished checkpoint while preserving other saved challenges', () => {
  const progress = freshProgress();
  progress.active = { id: 'dewfall' };
  progress.checkpoints.dewfall = { id: 'dewfall', seed: 7, state: { mode: 'playing' } };
  progress.checkpoints['dream-duos'] = { id: 'dream-duos', seed: 9, state: { mode: 'playing', revealed: [1] } };
  const other = structuredClone(progress.checkpoints['dream-duos']);
  completeMission(progress, 'dewfall');
  assert.equal(progress.active, null);
  assert.equal(progress.checkpoints.dewfall, undefined);
  assert.deepEqual(progress.checkpoints['dream-duos'], other);
  assert.equal(nextMission(progress), 'burrow-banquet');
});

test('all five beacons require three friends on each island; the festival and full crew are different milestones', () => {
  const progress = freshProgress();
  for (let island = 0; island < 5; island++) {
    completeIsland(progress, island, [1, 3, 4]);
    assert.equal(festivalReady(progress), island === 4);
  }
  assert.equal(progress.completed.length, 15);
  assert.equal(unlockedChapter(progress), 4);
  progress.festivalSeen = true; progress.fullCrewSeen = true;
  const festival = parseProgress(progress);
  assert.equal(festival.festivalSeen, true);
  assert.equal(festival.fullCrewSeen, false);
  for (let island = 0; island < 5; island++) for (const index of [0, 2]) {
    assert.equal(completeMission(progress, CHAPTERS[island].missions[index]), true);
  }
  assert.equal(progress.completed.length, 25);
  const full = parseProgress(progress);
  assert.equal(full.festivalSeen, true);
  assert.equal(full.fullCrewSeen, true);
  assert.ok(CHAPTERS.every((_, index) => chapterCount(progress, index) === 5));
  progress.chapter = 4;
  assert.equal(nextMission(progress), null);
  const concentrated = freshProgress();
  for (let island = 0; island < 3; island++) completeIsland(concentrated, island, [0, 1, 2, 3, 4]);
  assert.equal(concentrated.completed.length, 15);
  assert.equal(festivalReady(concentrated), false, '15 friends concentrated on three islands cannot light the remaining beacons');
});

test('Continue prioritizes an interrupted unlocked mission, otherwise recommends an unfinished friend on the selected island', () => {
  const progress = freshProgress();
  completeIsland(progress, 0);
  progress.chapter = 1;
  assert.equal(nextMission(progress), 'pondpost');
  progress.active = { id: 'dream-duos' };
  assert.equal(nextMission(progress), 'dream-duos');
  progress.active = { id: 'moonbounce' };
  assert.equal(nextMission(progress), 'pondpost', 'an inaccessible active mission is ignored');
  progress.active = null;
  completeIsland(progress, 1, [0, 1, 2, 3, 4]);
  assert.equal(nextMission(progress), null, 'a finished island has no unfinished recommendation');
});

test('campaign save round trips preserve the active challenge and both completion milestones', () => {
  const storage = memoryStorage(), progress = freshProgress();
  completeIsland(progress, 0);
  progress.chapter = 1; progress.active = { id: 'pondpost' };
  progress.checkpoints.pondpost = { id: 'pondpost', seed: 0xffffffff, state: { schema: 1, id: 'pondpost', mode: 'playing', engine: { score: 50, player: { x: 1, y: 2 } } } };
  const before = structuredClone(progress);
  assert.equal(writeProgress(progress, storage), true);
  assert.deepEqual(readProgress(storage), progress);
  assert.deepEqual(progress, before, 'writing must not modify the live campaign');
  assert.deepEqual(storage.writes, [SAVE_KEY]);
  assert.deepEqual(storage.reads, [SAVE_KEY]);
});

test('duplicate friends and invalid optional fields are sanitized without awarding extra progress', () => {
  const source = freshProgress();
  source.completed = ['dewfall', 'dewfall', 'dream-duos']; source.chapter = 900;
  source.active = { id: 'moonbounce' }; source.festivalSeen = true; source.fullCrewSeen = true;
  source.plays = { dewfall: -2, 'dream-duos': 2, 'moss-flip': Infinity, invalid: 20 };
  source.checkpoints = {
    dewfall: { id: 'moonbounce', seed: 1, state: {} },
    'dream-duos': { id: 'dream-duos', seed: 1, state: { mode: 'playing' } },
    'moss-flip': { id: 'moss-flip', seed: -1, state: {} },
    'burrow-banquet': { id: 'burrow-banquet', seed: 2, state: [] },
  };
  const parsed = parseProgress(source);
  assert.deepEqual(parsed.completed, ['dewfall', 'dream-duos']);
  assert.equal(chapterCount(parsed, 0), 2);
  assert.equal(parsed.chapter, 0);
  assert.equal(parsed.active, null);
  assert.deepEqual(parsed.plays, { 'dream-duos': 2 });
  assert.deepEqual(Object.keys(parsed.checkpoints), ['dream-duos']);
  assert.equal(parsed.festivalSeen, false); assert.equal(parsed.fullCrewSeen, false);
});

test('malformed, oversized, missing, or incompatible saves fall back to a playable fresh voyage', () => {
  const invalid = [null, false, [], {}, { version: 2, completed: [] }, { version: 1, completed: 'dewfall' }, { version: 1, completed: ['unknown'] }, { version: 1, completed: Array(26).fill('dewfall') }];
  for (const value of invalid) {
    assert.equal(parseProgress(value), null);
    const storage = memoryStorage([[SAVE_KEY, JSON.stringify(value)]]);
    assert.deepEqual(readProgress(storage), freshProgress());
    assert.equal(writeProgress(value, storage), false);
    assert.deepEqual(storage.writes, []);
  }
  for (const raw of ['', '{broken', 'x'.repeat(2000001)]) {
    const storage = memoryStorage([[SAVE_KEY, raw]]);
    assert.deepEqual(readProgress(storage), freshProgress());
    assert.equal(nextMission(readProgress(storage)), 'dewfall');
  }
  assert.deepEqual(readProgress(memoryStorage()), freshProgress());
  const tooLarge = freshProgress();
  tooLarge.checkpoints.dewfall = { id: 'dewfall', seed: 1, state: { junk: 'x'.repeat(2000001) } };
  assert.equal(writeProgress(tooLarge, memoryStorage()), false);
});

test('blocked or full storage never prevents campaign play or overwrites existing data', () => {
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  const progress = readProgress(blocked);
  assert.deepEqual(progress, freshProgress());
  assert.equal(completeMission(progress, 'dewfall'), true);
  assert.equal(writeProgress(progress, blocked), false);
  assert.equal(nextMission(progress), 'burrow-banquet');
  const full = memoryStorage([[SAVE_KEY, JSON.stringify(freshProgress())]]);
  const before = full.values.get(SAVE_KEY);
  full.setItem = () => { throw Error('quota exceeded'); };
  assert.equal(writeProgress(progress, full), false);
  assert.equal(full.values.get(SAVE_KEY), before);
});

test('reading and writing Wonderwake leave every original checkpoint and win record byte-for-byte intact', () => {
  const legacy = ['soldier', 'garden', 'borrowed', 'moonbounce', 'popwake', 'pondpost', 'prism', 'ribbon', 'dewfall', 'lantern'];
  const entries = [
    ...legacy.flatMap(id => [[`games:save:${id}`, `original save ${id}`], [`games:${id}:progress`, `original progress ${id}`]]),
    ...arcadeGames.flatMap(game => [[`games:save:arcade:${game.id}`, `original checkpoint ${game.id}`], [`games:arcade:${game.id}:record`, `original record ${game.id}`]]),
  ];
  const storage = memoryStorage(entries), progress = readProgress(storage);
  completeIsland(progress, 0);
  assert.equal(writeProgress(progress, storage), true);
  assert.equal(readProgress(storage).completed.length, 3);
  for (const [key, value] of entries) assert.equal(storage.values.get(key), value, key);
  assert.ok(storage.reads.every(key => key === SAVE_KEY));
  assert.ok(storage.writes.every(key => key === SAVE_KEY));
});
