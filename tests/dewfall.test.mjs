import test from 'node:test';
import assert from 'node:assert/strict';
import { createDewfall, parseDewfallSave, LEVELS, STEP, BOARD_RADIUS, BALL_RADIUS, MAX_SPEED, MAX_EFFECTS } from '../dewfall-game.js';
import { createGardenPilot, playGarden } from './dewfall-strategy.mjs';

const copy = value => JSON.parse(JSON.stringify(value));
const advance = (game, ticks, tilt = {}) => { for (let i = 0; i < ticks; i++) game.advance(STEP, tilt); };
const running = (level = 1) => { const game = createDewfall(); game.start(level); return game; };
const close = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} should be within ${epsilon} of ${expected}`);

test('six gardens fit the circular field and introduce distinct obstacles gradually', () => {
  assert.equal(LEVELS.length, 6);
  for (const [i, level] of LEVELS.entries()) {
    assert.equal(level.id, i + 1); assert.ok(Object.isFrozen(level)); assert.ok(Object.isFrozen(level.balls));
    assert.equal(level.balls.length, level.flowers.length); assert.ok(level.balls.length >= 3 && level.balls.length <= 5);
    for (const point of [...level.balls, ...level.flowers]) assert.ok(Math.hypot(point.x, point.z) + BALL_RADIUS < BOARD_RADIUS);
    for (const ball of level.balls) {
      assert.ok(level.rocks.every(rock => Math.hypot(ball.x - rock.x, ball.z - rock.z) > rock.radius + BALL_RADIUS));
      assert.ok(level.puddles.every(pool => Math.hypot(ball.x - pool.x, ball.z - pool.z) > pool.radius));
      assert.ok(level.flowers.every(flower => Math.hypot(ball.x - flower.x, ball.z - flower.z) > .62));
    }
    assert.equal(new Set(level.flowers.map(flower => flower.id)).size, level.flowers.length);
  }
  assert.equal(LEVELS[0].rocks.length, 0); assert.equal(LEVELS[0].puddles.length, 0);
  assert.ok(LEVELS[1].rocks.length); assert.ok(LEVELS[3].springs.length); assert.ok(LEVELS[4].wind > 0 && LEVELS[4].puddles.length);
});

test('ready mode is inert and starting keeps the public state object stable', () => {
  const game = createDewfall({ level: 3 }), state = game.state;
  assert.equal(state.mode, 'ready'); assert.equal(state.level, 3); assert.equal(game.snapshot(), null);
  assert.equal(game.beginTilt(), false); assert.equal(game.pause(), false); assert.equal(game.resume(), false); assert.equal(game.retry(), false); assert.equal(game.next(), false);
  game.advance(1, { x: 1, z: -1 }); assert.equal(state.ticks, 0);
  game.start(4); assert.equal(game.state, state); assert.equal(state.mode, 'playing'); assert.equal(state.level, 4);
  assert.equal(state.total, 4); assert.equal(state.bloomed, 0); assert.ok(state.balls.every(ball => ball.status === 'rolling'));
  assert.ok(parseDewfallSave(game.snapshot())); game.start(999); assert.equal(state.level, 1);
});

test('one held tilt moves every drop together; lifting flattens and brakes the garden', () => {
  const game = running(), start = copy(game.state.balls);
  assert.equal(game.beginTilt(), true); assert.equal(game.beginTilt(), false); assert.equal(game.state.gestures, 1);
  advance(game, 20, { x: .7, z: 0 });
  for (let i = 0; i < start.length; i++) {
    assert.ok(game.state.balls[i].x > start[i].x + .2); close(game.state.balls[i].z, start[i].z);
    close(game.state.balls[i].x - start[i].x, game.state.balls[0].x - start[0].x);
    close(game.state.balls[i].vx, game.state.balls[0].vx);
  }
  const speed = game.state.balls[1].vx, x = game.state.balls[1].x;
  game.endTilt(); assert.equal(game.state.dragging, false); assert.deepEqual(game.state.tilt, { x: 0, z: 0 });
  advance(game, 30); assert.ok(game.state.balls[1].vx < speed * .07, 'release supplies substantial gentle braking');
  assert.ok(game.state.balls[1].x > x, 'braking retains a little physical momentum');
  assert.ok(game.beginTilt()); assert.equal(game.state.gestures, 2);
});

test('input is normalized and non-finite components cannot poison physics', () => {
  const game = running(); advance(game, 8, { x: 99, z: 99 }); close(Math.hypot(game.state.tilt.x, game.state.tilt.z), 1);
  assert.ok(game.state.balls.every(ball => Number.isFinite(ball.x) && Number.isFinite(ball.z) && Math.hypot(ball.vx, ball.vz) <= MAX_SPEED));
  advance(game, 8, { x: NaN, z: Infinity }); assert.deepEqual(game.state.tilt, { x: 0, z: 0 });
  const tick = game.state.ticks;
  for (const duration of [NaN, Infinity, -1, 0]) game.advance(duration, { x: 1, z: 0 });
  assert.equal(game.state.ticks, tick); game.advance(50); assert.equal(game.state.ticks, tick + 60, 'long stalls are bounded');
});

test('a null control behaves exactly like lifting the thumb, including braking', () => {
  const explicitRelease = running(), nullRelease = running();
  for (const game of [explicitRelease, nullRelease]) { game.beginTilt(); advance(game, 20, { x: .7, z: -.1 }); }
  assert.doesNotThrow(() => advance(nullRelease, 30, null)); advance(explicitRelease, 30, {});
  assert.deepEqual(nullRelease.snapshot(), explicitRelease.snapshot());
  assert.deepEqual(nullRelease.state.tilt, { x: 0, z: 0 });
});

test('fixed input traces produce identical simulation at 30, 60 and 120 Hz', () => {
  const games = [30, 60, 120].map(fps => ({ game: running(6), fps }));
  const turns = [{ x: .8, z: .1 }, { x: -.3, z: -.7 }, {}, { x: -.8, z: .4 }, { x: .2, z: .8 }];
  for (const { game, fps } of games) {
    game.beginTilt();
    for (const control of turns) for (let i = 0; i < fps / 2; i++) game.advance(1 / fps, control);
  }
  assert.deepEqual(games[0].game.snapshot(), games[1].game.snapshot());
  assert.deepEqual(games[1].game.snapshot(), games[2].game.snapshot());
});

test('every garden has a real tilt-only route to three stars, with valid intermediate saves', () => {
  for (const level of LEVELS) {
    const game = running(level.id), pilot = createGardenPilot(); game.beginTilt();
    for (let turn = 0; turn < 5400 && game.state.mode === 'playing'; turn++) {
      const before = game.snapshot(), input = pilot(game.state);
      assert.deepEqual(game.snapshot(), before, 'the pilot only observes state');
      assert.ok(Number.isFinite(input.x) && Number.isFinite(input.z) && Math.hypot(input.x, input.z) <= 1 + 1e-9);
      game.advance(1 / 30, input);
      assert.ok(parseDewfallSave(game.snapshot()), `${level.name}: tick ${game.state.ticks} is a valid checkpoint`);
      assert.ok(game.state.effects.length <= MAX_EFFECTS); assert.ok(game.state.events.length <= 40);
    }
    assert.equal(game.state.mode, 'won', level.name); assert.equal(game.state.stars, 3, level.name);
    assert.equal(game.state.bloomed, game.state.total); assert.ok(game.state.flowers.every(flower => flower.filled));
    assert.ok(game.state.spills <= 1); assert.ok(game.state.score > 1000); assert.equal(game.state.dragging, false);
    assert.deepEqual(game.state.tilt, { x: 0, z: 0 });
  }
});

test('a flower captures any drop once, then remains safely bloomed under later tilts', () => {
  const game = running(3), ball = game.state.balls[2], flower = game.state.flowers[0];
  Object.assign(ball, { x: flower.x, z: flower.z, vx: .3, vz: -.1 }); game.advance(STEP);
  assert.equal(game.state.bloomed, 1); assert.equal(ball.status, 'bloomed'); assert.equal(ball.flowerId, 0);
  assert.equal(flower.ballId, 2); assert.equal(flower.filled, true); assert.equal(game.state.score, 200);
  const captured = copy(ball); advance(game, 40, { x: 1, z: .4 }); assert.deepEqual(ball, captured);
  assert.equal(game.state.score, 200); assert.ok(parseDewfallSave(game.snapshot()));
});

test('rocks deflect incoming drops and recover a drop located exactly at a rock center', () => {
  const game = running(2), ball = game.state.balls[1], rock = game.level.rocks[0], radius = rock.radius + BALL_RADIUS;
  Object.assign(ball, { x: rock.x - radius - .002, z: rock.z, vx: 2, vz: 0 }); game.advance(STEP);
  close(Math.hypot(ball.x - rock.x, ball.z - rock.z), radius); assert.ok(ball.vx <= 0, 'the drop bounces away instead of tunnelling');
  Object.assign(ball, { x: rock.x, z: rock.z, vx: 0, vz: 0 }); game.advance(STEP);
  close(Math.hypot(ball.x - rock.x, ball.z - rock.z), radius); assert.ok(Number.isFinite(ball.x) && Number.isFinite(ball.z));
});

test('rolling drops collide, including the exact-overlap return-to-start regression', () => {
  const game = running(), [a, b] = game.state.balls;
  Object.assign(a, { x: -.27, z: .3, vx: 1, vz: 0 }); Object.assign(b, { x: .27, z: .3, vx: -1, vz: 0 }); game.advance(STEP);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= BALL_RADIUS * 2 - 1e-9); assert.ok(a.vx < 0 && b.vx > 0);
  Object.assign(a, { x: 0, z: .3, vx: 0, vz: 0 }); Object.assign(b, { x: 0, z: .3, vx: 0, vz: 0 }); game.advance(STEP);
  close(Math.hypot(a.x - b.x, a.z - b.z), BALL_RADIUS * 2); assert.ok([a.x, a.z, b.x, b.z].every(Number.isFinite));
});

test('the round rim keeps a fast outward-moving drop on the island without a penalty', () => {
  const game = running(), ball = game.state.balls[0], edge = BOARD_RADIUS - BALL_RADIUS;
  Object.assign(ball, { x: edge - .001, z: 0, vx: MAX_SPEED, vz: 0 }); game.advance(STEP);
  close(Math.hypot(ball.x, ball.z), edge); assert.ok(ball.vx < 0); assert.equal(game.state.spills, 0);
});

test('spring leaves apply one nudge then cool down instead of accelerating every frame', () => {
  const game = running(4), ball = game.state.balls[0], spring = game.level.springs[0];
  Object.assign(ball, { x: spring.x, z: spring.z, vx: 0, vz: 0 }); game.advance(STEP);
  assert.ok(ball.vz < -1); assert.equal(ball.springCooldown, 60); assert.ok(game.state.events.some(event => event.type === 'spring'));
  const speed = -ball.vz; game.advance(STEP); assert.ok(-ball.vz < speed); assert.equal(ball.springCooldown, 59);
  assert.equal(game.state.events.filter(event => event.type === 'spring').length, 1);
});

test('a puddle returns only the spilled drop to its own start and keeps captured flowers', () => {
  const game = running(5), flower = game.state.flowers[0];
  Object.assign(game.state.balls[0], { x: flower.x, z: flower.z }); game.advance(STEP); assert.equal(game.state.bloomed, 1);
  const ball = game.state.balls[1], pool = game.level.puddles[0], start = game.level.balls[1];
  Object.assign(ball, { x: pool.x, z: pool.z, vx: .1, vz: .1 }); game.advance(STEP);
  assert.equal(ball.status, 'returning'); assert.equal(ball.returnTicks, 42); assert.equal(game.state.spills, 1); assert.equal(ball.vx, 0); assert.equal(ball.vz, 0);
  assert.ok(parseDewfallSave(game.snapshot()), 'returning is a valid resumable checkpoint');
  advance(game, 41); assert.equal(ball.status, 'returning'); assert.equal(ball.returnTicks, 1);
  game.advance(STEP); assert.equal(ball.status, 'rolling'); close(ball.x, start.x); close(ball.z, start.z);
  assert.equal(game.state.bloomed, 1); assert.equal(flower.filled, true); assert.equal(game.state.balls[0].status, 'bloomed');
  assert.ok(game.state.events.some(event => event.type === 'return')); assert.ok(parseDewfallSave(game.snapshot()));
});

test('calm gardens have no deadline and breezes do not move resting drops', () => {
  const game = running(5), before = copy(game.state.balls); advance(game, 3600);
  assert.equal(game.state.mode, 'playing'); assert.equal(game.state.ticks, 3600); assert.equal(game.state.spills, 0);
  assert.deepEqual(game.state.balls, before); assert.equal(game.state.score, 0);
});

test('pause and restore preserve exact drop physics while discarding an interrupted gesture', () => {
  const original = running(4); original.beginTilt(); advance(original, 21, { x: .3, z: -.8 });
  const moving = original.snapshot(); assert.equal(moving.dragging, false); assert.deepEqual(moving.tilt, { x: 0, z: 0 });
  assert.equal(original.state.dragging, true, 'taking a checkpoint does not cancel live input');
  const restored = createDewfall(); assert.equal(restored.restore(moving), true); assert.equal(restored.state.mode, 'paused');
  assert.deepEqual(restored.state.balls, original.state.balls); assert.equal(restored.state.ticks, original.state.ticks);
  assert.equal(restored.state.dragging, false); assert.equal(restored.state.effects.length, 0); assert.equal(restored.state.events.length, 0);
  assert.ok(original.pause()); assert.deepEqual(restored.snapshot(), original.snapshot());
  const paused = original.snapshot(); original.advance(1, { x: 1, z: 1 }); assert.deepEqual(original.snapshot(), paused);
  assert.equal(original.pause(), false); assert.ok(original.resume()); assert.ok(restored.resume());
  for (const input of [{ x: -.4, z: -.8 }, {}, { x: .6, z: .4 }]) { advance(original, 12, input); advance(restored, 12, input); }
  assert.deepEqual(original.snapshot(), restored.snapshot(), 'the resumed trajectory is identical');
});

test('return countdown and already won results survive a storage round trip', () => {
  const game = running(6), ball = game.state.balls[2], pool = game.level.puddles[0];
  Object.assign(ball, { x: pool.x, z: pool.z }); game.advance(STEP); advance(game, 12);
  const saved = game.snapshot(), resumed = createDewfall(); assert.ok(resumed.restore(saved)); assert.equal(resumed.state.balls[2].returnTicks, ball.returnTicks);
  resumed.resume(); game.pause(); game.resume(); advance(game, 40); advance(resumed, 40); assert.deepEqual(resumed.snapshot(), game.snapshot());
  const won = running(2); playGarden(won); const complete = won.snapshot(), loaded = createDewfall(); assert.ok(loaded.restore(complete));
  assert.equal(loaded.state.mode, 'won'); assert.deepEqual(loaded.snapshot(), complete); loaded.advance(1, { x: 1, z: 1 }); assert.deepEqual(loaded.snapshot(), complete);
});

test('stars reward limited spills and replay/next reset only the requested garden', () => {
  for (const [spills, expected] of [[0, 3], [1, 3], [2, 2], [4, 2], [5, 1]]) {
    const game = running(); game.state.spills = spills; playGarden(game); assert.equal(game.state.stars, expected);
    assert.ok(parseDewfallSave(game.snapshot()));
  }
  const game = running(); assert.equal(game.next(), false); playGarden(game); assert.equal(game.next(), true);
  assert.equal(game.state.level, 2); assert.equal(game.state.mode, 'playing'); assert.equal(game.state.bloomed, 0); assert.equal(game.state.ticks, 0);
  advance(game, 20, { x: .5 }); assert.ok(game.retry()); assert.equal(game.state.level, 2); assert.equal(game.state.ticks, 0); assert.equal(game.state.spills, 0);
  game.start(6); playGarden(game); assert.equal(game.next(), false); assert.equal(game.state.mode, 'won');
});

test('save validation rejects malformed values, impossible cross-links and contradictory modes', () => {
  const game = running(), good = game.snapshot();
  const invalid = [null, undefined, false, true, 1, 'save', [], {}, { ...good, schema: 9 }, { ...good, level: 0 }, { ...good, level: 7 },
    { ...good, ticks: NaN }, { ...good, ticks: -1 }, { ...good, mode: 'ready' }, { ...good, mode: 'won' }, { ...good, stars: 4 }, { ...good, stars: 1 },
    { ...good, dragging: true }, { ...good, tilt: null }, { ...good, tilt: { x: 1, z: 0 } }, { ...good, total: 0 }, { ...good, bloomed: 1 },
    { ...good, balls: null }, { ...good, balls: [] }, { ...good, flowers: {} }];
  for (const mutate of [save => { save.balls[0] = null; }, save => { save.flowers[0] = null; }, save => { save.balls[0].x = Infinity; },
    save => { save.balls[0].id = 1; }, save => { save.balls[0].vx = 7; }, save => { save.balls[0].status = 'flying'; },
    save => { save.balls[0].returnTicks = 1; }, save => { save.balls[0].status = 'returning'; }, save => { save.balls[0].springCooldown = -1; },
    save => { save.balls[0].flowerId = 0; }, save => { save.flowers[0].x += .1; }, save => { save.flowers[0].filled = true; },
    save => { save.flowers[0].ballId = 0; }, save => { save.serial = -1; }, save => { save.spills = -.1; }]) { const malformed = copy(good); mutate(malformed); invalid.push(malformed); }
  for (const value of invalid) { assert.doesNotThrow(() => parseDewfallSave(value)); assert.equal(parseDewfallSave(value), null); }
  const before = game.snapshot(); for (const value of invalid) assert.equal(game.restore(value), false); assert.deepEqual(game.snapshot(), before);
  playGarden(game); const complete = game.snapshot();
  for (const mutate of [save => { save.stars = 0; }, save => { save.mode = 'playing'; }, save => { save.balls[0].vx = 1; },
    save => { save.balls[0].flowerId = 1; }, save => { save.flowers[0].ballId = 1; }, save => { save.balls[0].x += .1; }, save => { save.bloomed--; }]) {
    const malformed = copy(complete); mutate(malformed); assert.equal(parseDewfallSave(malformed), null);
  }
  const parsed = parseDewfallSave(complete); parsed.balls[0].x = 99; assert.notEqual(complete.balls[0].x, 99, 'parsing returns independent data');
});

test('save validation rejects scores and stars that disagree with the saved garden', () => {
  const partial = running(3), flower = partial.state.flowers[0];
  Object.assign(partial.state.balls[0], { x: flower.x, z: flower.z }); partial.advance(STEP);
  const checkpoint = partial.snapshot(); assert.equal(checkpoint.bloomed, 1); assert.equal(checkpoint.score, 200);
  assert.ok(parseDewfallSave(checkpoint));
  assert.equal(parseDewfallSave({ ...checkpoint, score: 0 }), null, 'a captured flower must award its points');
  assert.equal(parseDewfallSave({ ...checkpoint, score: 400 }), null, 'an unfinished garden cannot invent extra points');
  const complete = running(); playGarden(complete); const won = complete.snapshot(); assert.ok(parseDewfallSave(won));
  assert.equal(parseDewfallSave({ ...won, score: won.score + 1 }), null, 'finished score must match its saved result');
  assert.equal(parseDewfallSave({ ...won, stars: 2, score: won.score - 150 }), null, 'even a matching star bonus cannot override earned stars');
  assert.equal(parseDewfallSave({ ...won, spills: 5 }), null, 'many spills cannot retain a three-star result');
  assert.equal(parseDewfallSave({ ...won, travel: won.travel + 1000 }), null, 'travel efficiency must agree with the point bonus');
});

test('arbitrary JSON input cannot crash the save parser', () => {
  let seed = 18731;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const leaves = [null, true, false, '', 'won', 0, -1, 42, [], {}];
  const fuzz = depth => depth <= 0 || random() < .55 ? copy(leaves[Math.floor(random() * leaves.length)]) : random() < .5
    ? Array.from({ length: Math.floor(random() * 6) }, () => fuzz(depth - 1))
    : Object.fromEntries(['schema', 'level', 'mode', 'balls', 'flowers', 'tilt'].filter(() => random() < .6).map(key => [key, fuzz(depth - 1)]));
  const good = running().snapshot();
  for (let i = 0; i < 1500; i++) {
    const value = i % 2 ? fuzz(3) : { ...copy(good), [Object.keys(good)[i % Object.keys(good).length]]: fuzz(2) };
    assert.doesNotThrow(() => parseDewfallSave(value));
  }
});

test('long varied play keeps effects, events, physics and checkpoints bounded', () => {
  const game = running(6); let seed = 923;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 10000 && game.state.mode === 'playing'; i++) {
    if (i % 30 === 0) game.beginTilt(); if (i % 30 === 15) game.endTilt();
    game.advance(STEP, { x: Math.sin(i / 31) * .8 + (random() - .5), z: Math.cos(i / 63) * .8 });
    assert.ok(game.state.effects.length <= MAX_EFFECTS); assert.ok(game.state.events.length <= 40);
    for (const ball of game.state.balls) assert.ok([ball.x, ball.z, ball.vx, ball.vz].every(Number.isFinite));
    if (i % 60 === 0) assert.ok(parseDewfallSave(game.snapshot()), `tick ${game.state.ticks} remains resumable`);
  }
});
