import test from 'node:test';
import assert from 'node:assert/strict';
import { createPondPost, parsePondPostSave, getPadPosition, windAt, LEVELS, STEP, GRAVITY, MAX_SPEED, MAX_VY, WORLD_EDGE, MAX_EFFECTS } from '../pondpost-game.js';
import { solvePondPost } from './pondpost-strategy.mjs';
const advance = (game, seconds) => { for (let i = 0; i < Math.round(seconds / STEP); i++) game.advance(STEP); };
const untilSettled = game => { for (let i = 0; i < 300 && ['flying', 'recovering'].includes(game.state.mode); i++) game.advance(STEP); };
const launch = (game, vx, vy) => { assert.ok(game.beginAim()); assert.ok(game.aim({ vx, vy })); assert.ok(game.launch()); };
const intentionalMiss = game => { launch(game, 11.5, 3); untilSettled(game); };

test('five handcrafted routes use generous pads, upward tiers and valid stamps', () => {
  assert.equal(LEVELS.length, 5);
  for (const [index, level] of LEVELS.entries()) {
    assert.equal(level.id, index + 1); assert.ok(Object.isFrozen(level) && Object.isFrozen(level.pads));
    assert.ok(level.pads.length >= 6 && level.pads.length <= 9); assert.equal(level.goalPad, level.pads.length - 1);
    assert.ok(level.pads.every((pad, i) => pad.id === i && Number.isFinite(pad.x) && Number.isFinite(pad.y) && Math.abs(pad.x) + pad.amplitude <= 4 && pad.width >= 2.3 && (!pad.amplitude || pad.period > 0) && (!i || pad.y > level.pads[i - 1].y)));
    assert.ok(level.stamps.length >= 3 && level.stamps.every((stamp, i) => stamp.id === i && stamp.padId > 0 && stamp.padId < level.goalPad));
    assert.equal(new Set(level.stamps.map(stamp => stamp.padId)).size, level.stamps.length);
  }
  assert.equal(LEVELS[0].wind.strength, 0); assert.ok(LEVELS[3].wind.strength > 0);
});
test('ready and start create a stable frog, pads and visible, independently saved stamps', () => {
  const game = createPondPost(); assert.equal(game.state.mode, 'ready'); assert.equal(game.snapshot(), null);
  assert.equal(game.beginAim(), false); game.start();
  assert.equal(game.state.mode, 'playing'); assert.deepEqual(game.state.landed, [0]); assert.equal(game.state.padId, 0);
  assert.equal(game.state.stamps.length, 3); assert.ok(game.state.stamps.every(item => !item.collected));
  assert.ok(parsePondPostSave(game.snapshot()));
});
test('aim clamps impossible velocity and cancels a weak or backward pull without spending a jump', () => {
  const game = createPondPost(); game.start(); assert.ok(game.beginAim());
  assert.equal(game.aim({ vx: NaN, vy: 3 }), false); assert.equal(game.aim(null), false);
  assert.ok(game.aim({ vx: 1000, vy: 1000 })); assert.ok(Math.hypot(game.state.aim.vx, game.state.aim.vy) <= MAX_SPEED + 1e-9); assert.ok(game.state.aim.vy <= MAX_VY);
  assert.ok(game.aim({ vx: 4, vy: -1 })); assert.deepEqual(game.preview(), { points: [], landing: null });
  assert.equal(game.launch(), false); assert.equal(game.state.mode, 'playing'); assert.equal(game.state.jumps, 0); assert.equal(game.state.misses, 0);
});
test('the first predicted leap really lands on the same pad and collects its stamp', () => {
  const game = createPondPost(); game.start(); assert.ok(game.beginAim()); assert.ok(game.aim({ vx: -1.3, vy: 8.4 }));
  const before = game.snapshot(), preview = game.preview();
  assert.ok(preview.points.length > 2); assert.equal(preview.landing.padId, 1); assert.equal(preview.landing.perfect, true);
  assert.deepEqual(game.snapshot(), before, 'preview has no side effects');
  assert.ok(game.launch()); untilSettled(game);
  assert.equal(game.state.mode, 'playing'); assert.equal(game.state.padId, preview.landing.padId);
  assert.equal(game.state.ticks, preview.arrivalTick, 'preview reports the exact landing frame');
  assert.ok(Math.abs(game.state.player.x - preview.landing.x) < 1e-9 && Math.abs(game.state.player.y - preview.landing.y) < 1e-9);
  assert.equal(game.state.perfects, 1); assert.equal(game.state.stamps.filter(item => item.collected).length, 1); assert.ok(game.state.score > 0);
});
test('a moving pad carries the idle frog and its stamp as the clock advances', () => {
  const game = createPondPost(); game.start(2); launch(game, -1.3, 8.4); untilSettled(game);
  assert.equal(game.state.padId, 1); const before = game.state.player.x, offset = game.state.padOffset, tick = game.state.ticks;
  advance(game, 0.8);
  const pad = getPadPosition(LEVELS[1].pads[1], game.state.ticks), stamp = game.state.stamps.find(item => item.padId === 1);
  assert.ok(Math.abs(game.state.player.x - before) > 0.05, 'the pad actually moved');
  assert.ok(Math.abs(game.state.player.x - pad.x - offset) < 1e-9);
  assert.ok(Math.abs(stamp.x - pad.x - LEVELS[1].stamps[0].offsetX) < 1e-9);
  assert.ok(game.state.ticks > tick); assert.ok(parsePondPostSave(game.snapshot()));
});
test('pad prediction can reuse a caller object without mutating level data', () => {
  const pad = LEVELS[1].pads[1], before = { ...pad }, out = {};
  assert.equal(getPadPosition(pad, 33.5, out), out);
  assert.equal(out.id, pad.id); assert.equal(out.width, pad.width); assert.notEqual(out.x, pad.x);
  assert.deepEqual(pad, before);
});
test('wind changes with time and preview includes the same wind and moving-pad phase', () => {
  const game = createPondPost(); game.start(4); const initialWind = game.state.wind; advance(game, 1);
  assert.notEqual(game.state.wind, initialWind); assert.equal(game.state.wind, windAt(LEVELS[3], game.state.ticks));
  assert.ok(game.beginAim()); game.aim({ vx: -1.3, vy: 8.4 });
  const prediction = game.preview(); assert.ok(prediction.landing); game.launch(); untilSettled(game);
  assert.equal(game.state.padId, prediction.landing.padId); assert.ok(Math.abs(game.state.player.x - prediction.landing.x) < 1e-9);
});
test('arrivalTick locates the moving pad at the exact predicted landing time', () => {
  const game = createPondPost(); game.start(3); const pad = LEVELS[2].pads[1];
  const current = getPadPosition(pad, game.state.ticks); game.beginAim(); game.aim({ vx: -1.3, vy: 8.4 });
  const prediction = game.preview(); assert.equal(prediction.landing?.padId, 1);
  const future = getPadPosition(pad, prediction.arrivalTick);
  assert.ok(Math.abs(future.x - current.x) > 0.2, 'the landing-time outline differs from the current leaf');
  game.launch(); untilSettled(game);
  assert.equal(game.state.ticks, prediction.arrivalTick);
  assert.ok(Math.abs(getPadPosition(pad, game.state.ticks).x - future.x) < 1e-9);
  assert.ok(Math.abs(game.state.player.x - prediction.landing.x) < 1e-9);
});
test('all five routes, stamps, and perfect landings are achievable using only legal pulls', () => {
  for (const level of LEVELS) {
    const game = createPondPost(); game.start(level.id); let invalid = false;
    const result = solvePondPost(game, LEVELS, { onStep: current => {
      if (!parsePondPostSave(current.snapshot())) invalid = true;
      assert.ok(current.state.effects.length <= MAX_EFFECTS);
    } });
    assert.equal(invalid, false, `route ${level.id}: every mid-flight checkpoint is valid`);
    assert.equal(result.mode, 'won', level.name); assert.equal(result.misses, 0); assert.equal(result.stars, 3);
    assert.equal(result.stamps, level.stamps.length); assert.ok(result.perfects >= 2);
    for (const prediction of result.predictions) {
      assert.equal(prediction.actualPad, prediction.expected.padId); assert.ok(Math.abs(prediction.actualX - prediction.expected.x) < 1e-8);
      assert.ok(Math.abs(prediction.actualY - prediction.expected.y) < 1e-8);
    }
    assert.ok(parsePondPostSave(game.snapshot()));
  }
});
test('waiting at every pad leaves all routes reachable across moving-pad and wind phases', () => {
  for (const level of LEVELS) for (const initial of [1, 7, 29]) {
    const game = createPondPost(); game.start(level.id); let seed = initial;
    const result = solvePondPost(game, LEVELS, { waitAtPad: () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 * 20; } });
    assert.equal(result.mode, 'won', `${level.name}, phase seed ${initial}`);
    assert.equal(result.misses, 0); assert.ok(result.predictions.every(item => item.expected.padId === item.actualPad && Math.abs(item.expected.x - item.actualX) < 1e-8));
  }
});
test('the first-visit rule prevents farming score or perfects on the same pad', () => {
  const game = createPondPost(); game.start(); launch(game, -1.3, 8.4); untilSettled(game);
  assert.equal(game.state.padId, 1); assert.equal(game.state.perfects, 1);
  const score = game.state.score, best = game.state.bestProgress;
  launch(game, 0, 5); untilSettled(game);
  assert.equal(game.state.padId, 1); assert.equal(game.state.score, score); assert.equal(game.state.perfects, 1);
  assert.equal(game.state.bestProgress, best); assert.deepEqual(game.state.landed, [0, 1]);
});
test('a return leap can land on an earlier pad without losing best progress or farming score', () => {
  const game = createPondPost(); game.start(); launch(game, -1.3, 8.4); untilSettled(game);
  assert.equal(game.state.padId, 1); const score = game.state.score;
  assert.ok(game.beginAim()); let chosen;
  for (let vx = 0.5; vx <= 4 && !chosen; vx += 0.1) for (const vy of [5, 6, 7, 8]) {
    game.aim({ vx, vy }); const result = game.preview().landing;
    if (result?.padId === 0) { chosen = { vx, vy }; break; }
  }
  assert.ok(chosen, 'an earlier pad is reachable'); game.aim(chosen); assert.ok(game.launch()); untilSettled(game);
  assert.equal(game.state.padId, 0); assert.equal(game.state.bestProgress, 1); assert.equal(game.state.score, score);
  assert.deepEqual(game.state.landed, [0, 1]); assert.ok(parsePondPostSave(game.snapshot()));
});
test('a miss returns to the last safe pad with no life counter and can be resumed during recovery', () => {
  const game = createPondPost(); game.start(); launch(game, 11.5, 3);
  for (let i = 0; i < 300 && game.state.mode === 'flying'; i++) game.advance(STEP);
  assert.equal(game.state.mode, 'recovering'); assert.equal(game.state.misses, 1); assert.equal(game.state.checkpoint, 0);
  assert.ok(Math.abs(game.state.player.x) > WORLD_EDGE || game.state.player.y < -2.9);
  const checkpoint = game.snapshot(), restored = createPondPost(); assert.ok(restored.restore(checkpoint));
  assert.equal(restored.state.mode, 'paused'); assert.equal(restored.state.resumeMode, 'recovering');
  assert.ok(game.pause()); assert.deepEqual(restored.snapshot(), game.snapshot());
  advance(game, 3); assert.deepEqual(game.snapshot(), restored.snapshot());
  assert.ok(game.resume() && restored.resume()); advance(game, 1); advance(restored, 1);
  assert.equal(game.state.mode, 'playing'); assert.equal(game.state.padId, 0); assert.deepEqual(game.snapshot(), restored.snapshot());
});
test('a paused or interrupted mid-air trip preserves exact position, velocity, wind and future landing', () => {
  const game = createPondPost(); game.start(4); advance(game, 0.4); game.beginAim(); game.aim({ vx: -1.3, vy: 8.4 });
  const expected = game.preview().landing; assert.ok(expected); game.launch(); advance(game, 0.35);
  assert.equal(game.state.mode, 'flying'); const checkpoint = game.snapshot(), restored = createPondPost();
  assert.ok(restored.restore(checkpoint)); assert.equal(restored.state.mode, 'paused'); assert.equal(restored.state.resumeMode, 'flying');
  assert.ok(game.pause()); assert.deepEqual(restored.snapshot(), game.snapshot());
  advance(game, 4); assert.deepEqual(restored.snapshot(), game.snapshot());
  game.resume(); restored.resume(); untilSettled(game); untilSettled(restored);
  assert.deepEqual(restored.snapshot(), game.snapshot()); assert.equal(game.state.padId, expected.padId);
  assert.ok(Math.abs(game.state.player.x - expected.x) < 1e-8);
});
test('saving or pausing an unfinished pull cancels it without launching', () => {
  const game = createPondPost(); game.start(2); advance(game, 0.3); game.beginAim(); game.aim({ vx: -3, vy: 9 }); advance(game, 0.25);
  const checkpoint = game.snapshot(); assert.equal(checkpoint.mode, 'playing'); assert.deepEqual(checkpoint.aim, { vx: 0, vy: 0 });
  const restored = createPondPost(); assert.ok(restored.restore(checkpoint)); assert.equal(restored.state.mode, 'paused');
  assert.ok(game.pause()); assert.deepEqual(game.snapshot(), restored.snapshot()); assert.equal(game.state.jumps, 0);
  assert.ok(restored.resume()); assert.equal(restored.state.mode, 'playing');
});
test('landed, moving and flying physics agree at 30 Hz and 60 Hz', () => {
  const a = createPondPost(), b = createPondPost(); a.start(4); b.start(4);
  for (let i = 0; i < 60; i++) a.advance(1 / 60); for (let i = 0; i < 30; i++) b.advance(1 / 30);
  launch(a, -1.3, 8.4); launch(b, -1.3, 8.4);
  for (let i = 0; i < 120; i++) a.advance(1 / 60); for (let i = 0; i < 60; i++) b.advance(1 / 30);
  assert.deepEqual(a.snapshot(), b.snapshot());
});
test('stars respond to missed jumps, optional stamps and accurate landings without imposing a timer', () => {
  const good = createPondPost(); good.start(); assert.equal(solvePondPost(good, LEVELS).stars, 3);
  const two = createPondPost(); two.start(); intentionalMiss(two); intentionalMiss(two);
  assert.equal(two.state.misses, 2); assert.equal(solvePondPost(two, LEVELS).stars, 2);
  const one = createPondPost(); one.start(); intentionalMiss(one); intentionalMiss(one);
  const shortcut = solvePondPost(one, LEVELS, { stride: 2 }); assert.equal(shortcut.mode, 'won'); assert.equal(shortcut.stamps, 1); assert.equal(shortcut.stars, 1);
});
test('completed routes resume at the result and offer the next route; retry resets only this run', () => {
  const game = createPondPost(); game.start(); solvePondPost(game, LEVELS);
  const saved = game.snapshot(), restored = createPondPost(); assert.ok(restored.restore(saved)); assert.equal(restored.state.mode, 'won');
  assert.ok(restored.next()); assert.equal(restored.state.level, 2); assert.equal(restored.state.mode, 'playing');
  assert.equal(restored.state.jumps, 0); assert.equal(restored.state.score, 0);
  assert.ok(restored.retry()); assert.equal(restored.state.level, 2); assert.equal(restored.state.mode, 'playing');
});
test('malformed checkpoints and null nested values never throw or change a valid run', () => {
  const game = createPondPost(); game.start(); launch(game, -1.3, 8.4); advance(game, 0.3); const save = game.snapshot();
  for (const corrupt of [data => data.level = 6, data => data.player = null, data => data.stamps[0] = null,
    data => data.landed = [null], data => data.padId = 99, data => data.aim = null,
    data => data.wind = 99, data => data.bestProgress = 8, data => data.mode = 'won', data => data.stamps[0].x = NaN]) {
    const bad = structuredClone(save); corrupt(bad); assert.doesNotThrow(() => parsePondPostSave(bad)); assert.equal(parsePondPostSave(bad), null);
    assert.equal(game.restore(bad), false); assert.deepEqual(game.snapshot(), save);
  }
  const values = [null, [], {}, '', 0, 1, true, false, [null], { x: null, y: null }];
  for (const field of Object.keys(save)) for (const value of values) {
    const bad = structuredClone(save); bad[field] = structuredClone(value);
    assert.doesNotThrow(() => parsePondPostSave(bad), `field ${field} with ${JSON.stringify(value)}`);
  }
  for (const field of ['player', 'aim']) for (const key of Object.keys(save[field])) for (const value of values) {
    const bad = structuredClone(save); bad[field][key] = structuredClone(value); assert.doesNotThrow(() => parsePondPostSave(bad));
  }
  for (const value of values) assert.doesNotThrow(() => parsePondPostSave(value));
});
