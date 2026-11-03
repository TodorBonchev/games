import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpside, LEVELS, FLOOR_Y, CEIL_Y, SIZE, RECORDS_KEY, BEST_KEY, UNLOCK_KEY, readRecords, readUnlocked } from '../upside-game.js';

const memory = () => { const data = new Map(); return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) }; };
const play = (game, seconds, input = {}) => { for (let remaining = seconds; remaining > 1e-8; remaining -= 1 / 60) game.step(Math.min(remaining, 1 / 60), input); };
const fresh = (id = 1, options = {}) => { const storage = options.storage ?? memory(), game = createUpside({ storage }); game.start(id, options); return game; };
const place = (game, x, y = FLOOR_Y - SIZE.small, g = 1) => Object.assign(game.state.player, { x, y, g, vx: 0, vy: 0, ground: false, pj: false, pf: false });
const finish = game => { place(game, game.level.flagX, FLOOR_Y - game.state.player.h); game.step(1 / 60); assert.equal(game.state.mode, 'flag'); play(game, 1.7); return game.state.result; };

test('checkpoints require a nearby landing on the marked side', () => {
  const game = fresh();
  place(game, 76, 7); game.step(1 / 60); assert.equal(game.state.check, -1, 'flying past does not save');
  place(game, 150); game.step(1 / 60); assert.equal(game.state.check, -1, 'distant ground does not save');
  place(game, 76); game.step(1 / 60); assert.equal(game.state.check, 0);
  const ceiling = fresh(2);
  place(ceiling, 83, 7, -1); ceiling.step(1 / 60); assert.equal(ceiling.state.check, -1);
  place(ceiling, 83, CEIL_Y, -1); ceiling.step(1 / 60); assert.equal(ceiling.state.check, 0);
});

test('checkpoint retry restores the earned world and power without retaining later rewards', () => {
  const game = fresh(), s = game.state;
  place(game, 9); game.step(1 / 60); assert.equal(s.coins, 1);
  s.player.power = 1;
  place(game, 76); game.step(1 / 60); assert.equal(s.check, 0);
  const saved = structuredClone(s.checkpoint);
  place(game, 93, 11); game.step(1 / 60);
  const star = s.stars[1]; place(game, star.x, star.y); game.step(1 / 60);
  place(game, 80.1, 10.05); s.player.vy = -12; play(game, .1);
  s.player.power = 0; s.enemies[0].alive = false;
  assert.ok(s.score > saved.score);
  assert.equal(game.retryCheckpoint(), true);
  assert.equal(s.lives, 2); assert.equal(s.levelStats.deaths, 1);
  for (const key of ['score', 'coins', 'time', 'earnedLives']) assert.equal(s[key], saved[key], key);
  for (const key of ['grid', 'enemies', 'items', 'stars']) assert.deepEqual(s[key], saved[key], key);
  assert.equal(s.player.power, 1); assert.equal(s.player.h, SIZE.big); assert.equal(s.player.invuln, 1.5);
  assert.ok(s.levelStats.elapsed > saved.levelStats.elapsed);
});

test('repeated starting retries cannot farm coins, score, stars, or extra lives', () => {
  const game = fresh();
  for (let attempt = 0; attempt < 2; attempt++) {
    place(game, 9); game.step(1 / 60); assert.equal(game.state.score, 200);
    game.retryCheckpoint(); assert.equal(game.state.coins, 0); assert.equal(game.state.score, 0); assert.equal(game.tile(9, 12), 'o');
  }
  game.retryCheckpoint(); assert.equal(game.state.mode, 'lost'); assert.equal(game.state.lives, 0);
  assert.equal(game.retryCheckpoint(), false);
  const extra = fresh(); extra.state.coins = 99;
  place(extra, 76); extra.step(1 / 60);
  place(extra, 93, 11); extra.step(1 / 60); assert.equal(extra.state.lives, 4);
  extra.retryCheckpoint(); assert.equal(extra.state.lives, 2); assert.equal(extra.state.coins, 99);
});

test('pit death recovers in about a second and gives temporary collision protection', () => {
  const game = fresh(); place(game, 71, 16); game.step(1 / 60);
  assert.equal(game.state.mode, 'dying'); play(game, 1.12);
  assert.equal(game.state.mode, 'playing'); assert.equal(game.state.lives, 2);
  assert.ok(game.state.player.invuln > 1.4);
  const enemy = game.state.enemies[0]; enemy.active = true;
  place(game, enemy.x - .4, enemy.y); game.step(1 / 60);
  assert.equal(game.state.mode, 'playing', 'contact after respawn is protected');
});

test('assist has unlimited retries, a half-speed timer, and remains enabled between worlds', () => {
  const normal = fresh(), assist = fresh(1, { assist: true });
  play(normal, 10); play(assist, 10);
  assert.ok(Math.abs((300 - normal.state.time) - 2 * (300 - assist.state.time)) < 1e-6);
  for (let i = 0; i < 12; i++) { assert.equal(assist.retryCheckpoint(), true); assert.equal(assist.state.mode, 'playing'); }
  assert.equal(assist.state.lives, 3); assert.equal(assist.state.levelStats.deaths, 12);
  finish(assist); assert.equal(assist.state.result.assisted, true); assert.equal(assist.next(), true); assert.equal(assist.state.assist, true);
});

test('each optional star has clear space and is reachable with a jump from its local surface', () => {
  for (const level of LEVELS) {
    assert.equal(level.stars.length, 3);
    for (const star of level.stars) {
      const game = fresh(level.id); game.state.enemies = [];
      const ceiling = star.y === 5.2 && !(level.id === 1 && star.id === 3);
      const row = ceiling ? CEIL_Y : Array.from({ length: 13 }, (_, i) => i + 2).find(y => game.solidAt(Math.floor(star.x), y) && y > star.y);
      assert.ok(row !== undefined, `${level.id}/${star.id}: supporting surface exists`);
      place(game, star.x, ceiling ? row : row - SIZE.small, ceiling ? -1 : 1);
      game.step(1 / 60); assert.equal(game.state.player.ground, true);
      play(game, .7, { jump: true });
      assert.equal(game.state.stars[star.id - 1].collected, true, `world ${level.id} star ${star.id} reachable`);
      assert.equal(game.state.levelStats.stars.filter(id => id === star.id).length, 1);
      const score = game.state.score;
      place(game, star.x, star.y); play(game, .1);
      assert.equal(game.state.score, score, 'star cannot be collected twice');
    }
  }
});

test('completion awards collector and clean medals and saves independent best records', () => {
  const storage = memory(), game = fresh(1, { storage });
  for (const star of game.state.stars) { place(game, star.x, star.y); game.step(1 / 60); }
  const result = finish(game);
  assert.equal(result.stars, 3); assert.deepEqual(result.medals, { clear: true, collector: true, clean: true });
  assert.equal(result.newRecord, true); assert.equal(result.assisted, false);
  const first = structuredClone(readRecords(storage)[1].normal);
  assert.equal(first.score, result.score); assert.equal(first.time, result.elapsed); assert.equal(first.stars, 3);
  game.start(1); game.retryCheckpoint(); play(game, 2); finish(game);
  assert.equal(game.state.result.medals.clean, false); assert.equal(game.state.result.medals.collector, false);
  const persisted = readRecords(storage)[1].normal;
  assert.equal(persisted.score, first.score); assert.equal(persisted.time, first.time); assert.equal(persisted.stars, 3);
  assert.equal(persisted.medals.clean, true, 'earned medals survive later imperfect runs');
});

test('assisted score and time records do not overwrite normal records or legacy best', () => {
  const storage = memory(), game = fresh(1, { storage }); finish(game);
  const normal = structuredClone(readRecords(storage)[1].normal), best = storage.getItem(BEST_KEY);
  game.start(1, { assist: true }); play(game, 3); finish(game);
  const records = readRecords(storage);
  assert.deepEqual(records[1].normal, normal); assert.ok(records[1].assist); assert.equal(storage.getItem(BEST_KEY), best);
});

test('corrupt and unavailable save storage never prevents play or records', () => {
  const storage = memory(); storage.setItem(RECORDS_KEY, '{nope'); assert.deepEqual(readRecords(storage), {});
  storage.setItem(RECORDS_KEY, JSON.stringify({ 1: { normal: { score: -4, time: 2, stars: 3 } }, 2: { normal: { score: 1, time: 2, stars: 9 } }, 3: { assist: { score: 10, time: 1, stars: 2, medals: { clear: true, clean: 'yes' } } } }));
  assert.deepEqual(Object.keys(readRecords(storage)), ['3']); assert.equal(readRecords(storage)[3].assist.medals.clean, false);
  for (const value of ['Infinity', '-5', '2.8', 'NaN']) { storage.setItem(UNLOCK_KEY, value); const n = readUnlocked(storage); assert.ok(Number.isInteger(n) && n >= 1 && n <= 4); }
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); } };
  const game = fresh(1, { storage: blocked }); assert.doesNotThrow(() => finish(game)); assert.equal(game.state.result.medals.clear, true);
});

test('invalid steps do nothing and long frames use bounded collision-safe substeps', () => {
  const game = fresh(), initial = game.snapshot();
  for (const dt of [-1, 0, NaN, Infinity, undefined]) game.step(dt, { right: true });
  assert.deepEqual(game.snapshot(), initial);
  const split = fresh(); game.step(.2, { right: true, run: true }); play(split, .2, { right: true, run: true });
  assert.ok(Math.abs(game.state.player.x - split.state.player.x) < 1e-9);
  const t = game.state.t; game.step(10); assert.ok(Math.abs(game.state.t - t - .25) < 1e-9);
});

test('a powered Nib grows as soon as headroom becomes available', () => {
  const game = fresh(), p = game.state.player;
  game.state.grid[11 * game.level.w + 3] = '#'.charCodeAt(0);
  place(game, 3); p.power = 1; game.step(1 / 60); assert.equal(p.h, SIZE.small);
  place(game, 5); game.step(1 / 60); assert.equal(p.h, SIZE.big); assert.ok(Math.abs(p.y + p.h - FLOOR_Y) < 1e-9);
});

test('corner correction keeps upward momentum and slides past an unobstructed edge', () => {
  const game = fresh(), p = game.state.player;
  place(game, 13.4, 10.05); p.vy = -12; p.jumping = true;
  game.step(1 / 60, { jump: true });
  assert.ok(p.x + p.w < 14); assert.ok(p.y < 10); assert.ok(p.vy < 0);
});

test('one midair flip is available, denial is reported, and landing restores it', () => {
  const game = fresh(), p = game.state.player;
  place(game, 97, 7); game.step(1 / 60, { flip: true }); assert.equal(p.g, -1); assert.equal(p.airFlip, false);
  game.step(1 / 60); game.step(1 / 60, { flip: true }); assert.equal(p.g, -1);
  assert.ok(game.state.events.some(e => e.type === 'flipdenied'));
  play(game, 1); assert.equal(p.ground, true); assert.equal(p.airFlip, true);
});

test('pause and level completion guard progression, timers, and results', () => {
  const game = fresh(); assert.equal(game.next(), false);
  game.pause(); const stats = structuredClone(game.state.levelStats); play(game, 2); assert.deepEqual(game.state.levelStats, stats);
  game.resume(); finish(game); const result = structuredClone(game.state.result); play(game, 1); assert.deepEqual(game.state.result, result);
  assert.equal(game.next(), true); assert.equal(game.state.levelIndex, 1); assert.equal(game.state.result, null); assert.equal(game.state.levelStats.elapsed, 0);
});

test('falling outside the world cannot trigger the finish flag', () => {
  const game = fresh(); place(game, game.level.flagX + 1, 16); game.step(1 / 60); assert.equal(game.state.mode, 'dying');
});

test('manual fire still works while auto-run keeps the run action held', () => {
  const game = fresh(); game.state.player.power = 2;
  game.step(1 / 60, { run: true });
  assert.equal(game.state.fireballs.length, 1);
  play(game, .15, { run: true });
  assert.equal(game.state.fireballs.length, 1, 'holding run does not repeat shots');
  game.step(1 / 60, { run: true, fire: true });
  assert.equal(game.state.fireballs.length, 2, 'a physical fire press creates the second shot');
});
