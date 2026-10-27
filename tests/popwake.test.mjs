import test from 'node:test';
import assert from 'node:assert/strict';
import { GRID_SIZE, LEVELS, createPopwake, parsePopwakeSave } from '../popwake-game.js';
import { solvePopwake } from './popwake-strategy.mjs';
const advance = (game, seconds) => { for (let i = 0; i < Math.round(seconds * 60); i++) game.advance(1 / 60); };
const solve = (game, number) => solvePopwake(game, LEVELS[number - 1].solution);
const key = point => `${point.x},${point.z}`;
const inBounds = point => point && Number.isInteger(point.x) && Number.isInteger(point.z) && point.x >= 0 && point.x < GRID_SIZE && point.z >= 0 && point.z < GRID_SIZE;
const neighbors = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z) === 1;

test('eight handcrafted boards have legal, unique pieces and connected solution strokes', () => {
  assert.equal(LEVELS.length, 8); assert.equal(GRID_SIZE, 7);
  for (const [i, level] of LEVELS.entries()) {
    assert.equal(level.id, i + 1); assert.ok(Object.isFrozen(level) && Object.isFrozen(level.solution));
    assert.ok(inBounds(level.start)); assert.ok(level.rocks.every(inBounds)); assert.ok(level.jellies.every(inBounds));
    const rocks = new Set(level.rocks.map(key)), jellies = new Set(level.jellies.map(key));
    assert.equal(rocks.size, level.rocks.length); assert.equal(jellies.size, level.jellies.length);
    assert.ok(!rocks.has(key(level.start)) && level.jellies.every(jelly => !rocks.has(key(jelly))));
    assert.deepEqual(level.solution[0], level.start);
    assert.ok(level.solution.every((point, index) => inBounds(point) && !rocks.has(key(point)) && (!index || neighbors(level.solution[index - 1], point))));
    const unique = new Set(level.solution.map(key));
    assert.equal(unique.size - 1, level.par); assert.ok(level.par < level.budget);
  }
});
test('only the glowing starter can begin a stroke, and cancelling leaves a clean board', () => {
  const game = createPopwake(); assert.equal(game.state.mode, 'ready'); assert.equal(game.snapshot(), null);
  game.start(1); const clean = game.snapshot(); assert.equal(game.begin({ x: 0, z: 0 }), false); assert.deepEqual(game.snapshot(), clean);
  assert.ok(game.begin(LEVELS[0].start)); assert.equal(game.state.used, 0); assert.deepEqual(game.state.stroke, LEVELS[0].start);
  assert.equal(game.release(), false, 'a tap without a trail does not spend an attempt');
  assert.equal(game.state.mode, 'playing'); assert.deepEqual(game.state.trail, []);
  assert.ok(game.begin(LEVELS[0].start)); assert.ok(game.drag({ x: 3, z: 6 }));
  assert.equal(game.state.used, 2); assert.ok(game.cancel()); assert.equal(game.state.mode, 'playing');
  assert.equal(game.state.used, 0); assert.deepEqual(game.state.trail, []); assert.equal(game.state.stroke, null);
});
test('fast finger movement is interpolated into connected cells and cannot cross rocks', () => {
  const game = createPopwake(); game.start(4); assert.ok(game.begin(LEVELS[3].start));
  assert.equal(game.drag({ x: 6, z: 6 }), false, 'the rock immediately right of the starter blocks a skipped pointer sample');
  assert.equal(game.state.used, 0); assert.deepEqual(game.state.stroke, { x: 0, z: 6 });
  assert.ok(game.drag({ x: 0, z: 2 })); assert.equal(game.state.used, 4);
  assert.ok(game.drag({ x: 2, z: 2 })); assert.equal(game.state.used, 6);
  assert.equal(game.drag({ x: 6, z: 2 }), false, 'the next wall cannot be crossed with a long gesture');
  assert.deepEqual(game.state.stroke, { x: 2, z: 2 });
  assert.ok(game.state.trail.slice(1).every((point, index) => neighbors(game.state.trail[index], point)));
  assert.ok(game.state.events.some(event => event.type === 'blocked'));
});
test('revisiting a cell is free even after the trail budget runs out', () => {
  const game = createPopwake(); game.start(1); game.begin(LEVELS[0].start);
  for (const point of LEVELS[0].solution.slice(1)) assert.ok(game.drag(point));
  assert.equal(game.state.used, 8);
  assert.ok(game.drag({ x: 5, z: 1 })); assert.ok(game.drag({ x: 5, z: 0 })); assert.equal(game.state.used, 10);
  assert.equal(game.drag({ x: 4, z: 0 }), false); assert.equal(game.state.used, 10);
  assert.ok(game.drag({ x: 5, z: 1 })); assert.ok(game.drag({ x: 5, z: 2 })); assert.equal(game.state.used, 10);
  assert.ok(game.release()); advance(game, 5);
  assert.equal(game.state.mode, 'won'); assert.equal(game.state.stars, 1);
});
test('a successful trail between the target and budget earns two stars', () => {
  const game = createPopwake(); game.start(1); game.begin(LEVELS[0].start);
  for (const point of LEVELS[0].solution.slice(1)) game.drag(point);
  assert.ok(game.drag({ x: 5, z: 1 })); assert.equal(game.state.used, 9);
  game.release(); advance(game, 5);
  assert.equal(game.state.mode, 'won'); assert.equal(game.state.stars, 2); assert.equal(game.state.hintUsed, false);
});
test('every authored trail wakes all jellies and earns three stars without a hint', () => {
  const game = createPopwake();
  for (const level of LEVELS) {
    game.start(level.id); assert.equal(solve(game, level.id), 'won', level.name);
    assert.equal(game.state.used, level.par); assert.equal(game.state.stars, 3);
    assert.equal(game.state.awake, game.state.total); assert.ok(game.state.jellies.every(jelly => jelly.awake));
    assert.ok(parsePopwakeSave(game.snapshot()), `${level.name} completion can be saved`);
    if (level.id < LEVELS.length) { assert.ok(game.next()); assert.equal(game.state.level, level.id + 1); }
    else assert.equal(game.next(), false);
  }
});
test('a retraced fork ignites both branches as a single cascade', () => {
  const game = createPopwake(); game.start(2); assert.equal(solve(game, 2), 'won');
  const left = game.state.trail.find(item => item.x === 2 && item.z === 3);
  const right = game.state.trail.find(item => item.x === 4 && item.z === 3);
  assert.ok(Number.isInteger(left.litAt) && Number.isInteger(right.litAt));
  assert.ok(Math.abs(left.litAt - right.litAt) <= 7, 'both arms begin within one domino step');
  assert.equal(new Set(game.state.trail.map(key)).size, game.state.trail.length);
});
test('the gold ripple awakens jellies across the rock gap without a trail on their cells', () => {
  const game = createPopwake(); game.start(3); assert.equal(solve(game, 3), 'won');
  const relay = game.state.jellies.find(jelly => jelly.type === 'relay');
  const far = game.state.jellies.find(jelly => jelly.x === 5 && jelly.z === 4);
  assert.ok(relay.awake && far.awake && far.litAt > relay.litAt);
  assert.ok(!game.state.trail.some(point => point.x === far.x && point.z === far.z));
  assert.ok(LEVELS[2].rocks.some(rock => rock.x === 4 && rock.z === 4));
});
test('hinted runs cap stars at two, including after retry; a fresh run can earn three', () => {
  const game = createPopwake(); game.start(1);
  assert.deepEqual(game.hint(), LEVELS[0].solution); assert.equal(game.state.hintVisible, true); assert.equal(game.state.hintUsed, true);
  assert.equal(solve(game, 1), 'won'); assert.equal(game.state.stars, 2);
  assert.ok(game.retry()); assert.equal(game.state.hintVisible, true); assert.equal(game.state.hintUsed, true);
  assert.equal(solve(game, 1), 'won'); assert.equal(game.state.stars, 2);
  game.start(1); assert.equal(solve(game, 1), 'won'); assert.equal(game.state.stars, 3);
});
test('an incomplete cascade can be retried without losing a life or another level', () => {
  const game = createPopwake(); game.start(1); game.begin(LEVELS[0].start); game.drag({ x: 2, z: 6 }); game.release(); advance(game, 5);
  assert.equal(game.state.mode, 'failed'); assert.equal(game.state.awake, 0); assert.ok(parsePopwakeSave(game.snapshot()));
  assert.ok(game.retry()); assert.equal(game.state.mode, 'playing'); assert.equal(game.state.level, 1);
  assert.equal(game.state.awake, 0); assert.deepEqual(game.state.trail, []); assert.equal(game.state.ticks, 0);
  assert.equal(solve(game, 1), 'won');
});
test('the cascade is deterministic at 30 Hz and 60 Hz and pauses during interruption', () => {
  const a = createPopwake(), b = createPopwake(); a.start(6); b.start(6);
  for (const game of [a, b]) { game.begin(LEVELS[5].start); for (const cell of LEVELS[5].solution.slice(1)) game.drag(cell); game.release(); }
  for (let i = 0; i < 300; i++) a.advance(1 / 60);
  for (let i = 0; i < 150; i++) b.advance(1 / 30);
  assert.deepEqual(a.snapshot(), b.snapshot()); assert.equal(a.state.mode, 'won');
  const game = createPopwake(); game.start(4); game.begin(LEVELS[3].start); for (const cell of LEVELS[3].solution.slice(1)) game.drag(cell); game.release(); advance(game, 0.4);
  const inFlight = game.snapshot(), restored = createPopwake(); assert.ok(restored.restore(inFlight)); assert.equal(restored.state.mode, 'paused'); assert.equal(restored.state.resumeMode, 'running');
  assert.ok(game.pause()); const frozen = game.snapshot(); advance(game, 4); advance(restored, 4);
  assert.deepEqual(game.snapshot(), frozen); assert.deepEqual(restored.snapshot(), frozen);
  assert.ok(game.resume() && restored.resume()); advance(game, 5); advance(restored, 5);
  assert.deepEqual(restored.snapshot(), game.snapshot()); assert.equal(game.state.mode, 'won');
});
test('saving or pausing an unfinished gesture safely discards it', () => {
  const game = createPopwake(); game.start(1); game.begin(LEVELS[0].start); game.drag({ x: 3, z: 6 });
  const checkpoint = game.snapshot(); assert.equal(checkpoint.mode, 'playing'); assert.deepEqual(checkpoint.trail, []); assert.equal(checkpoint.used, 0);
  const restored = createPopwake(); assert.ok(restored.restore(checkpoint)); assert.equal(restored.state.mode, 'paused');
  assert.ok(restored.resume()); assert.ok(restored.begin(LEVELS[0].start)); assert.ok(restored.cancel());
  assert.ok(game.pause()); assert.equal(game.state.mode, 'paused'); assert.equal(game.state.resumeMode, 'playing');
  assert.equal(game.state.used, 0); assert.deepEqual(game.state.trail, []); assert.ok(parsePopwakeSave(game.snapshot()));
});
test('corrupt checkpoints cannot alter the active puzzle or inject a cascade', () => {
  const game = createPopwake(); game.start(1); game.begin(LEVELS[0].start); for (const cell of LEVELS[0].solution.slice(1)) game.drag(cell); game.release(); advance(game, 0.2);
  const save = game.snapshot(); assert.ok(parsePopwakeSave(save));
  for (const corrupt of [data => data.level = 9, data => data.budget = 99, data => data.trail[0].x = 99,
    data => data.jellies[0].radius = 100, data => data.jellies[0].awake = !data.jellies[0].awake,
    data => data.queue.push({ at: data.ticks, kind: 'trail', index: 0 }), data => data.queue.push({ at: data.ticks + 1, kind: 'fire', index: 0 }),
    data => data.used = -1, data => data.hintUsed = 'yes', data => data.mode = 'won']) {
    const broken = structuredClone(save); corrupt(broken); assert.equal(parsePopwakeSave(broken), null); assert.equal(game.restore(broken), false); assert.deepEqual(game.snapshot(), save);
  }
  assert.equal(parsePopwakeSave(null), null);
});
test('malformed JSON-shaped checkpoints, including null trail cells, never throw', () => {
  const idle = createPopwake(); idle.start(1);
  const idleSave = idle.snapshot(), nullStarter = structuredClone(idleSave);
  nullStarter.trail = [null];
  assert.doesNotThrow(() => parsePopwakeSave(nullStarter));
  assert.equal(parsePopwakeSave(nullStarter), null);
  const game = createPopwake(); game.start(1); game.begin(LEVELS[0].start);
  for (const point of LEVELS[0].solution.slice(1)) game.drag(point);
  game.release(); advance(game, 0.2);
  const runningSave = game.snapshot();
  const values = [null, [], {}, '', 0, 1, true, false, [null], { x: null, z: null }];
  for (const fixture of [idleSave, runningSave]) for (const field of Object.keys(fixture)) for (const value of values) {
    const broken = structuredClone(fixture); broken[field] = structuredClone(value);
    assert.doesNotThrow(() => parsePopwakeSave(broken), `field ${field} with ${JSON.stringify(value)}`);
  }
  for (const field of ['trail', 'jellies', 'queue']) for (const value of values) {
    const broken = structuredClone(runningSave); broken[field][0] = structuredClone(value);
    assert.doesNotThrow(() => parsePopwakeSave(broken), `${field}[0] with ${JSON.stringify(value)}`);
  }
  for (const value of values) assert.doesNotThrow(() => parsePopwakeSave(value));
});
