import test from 'node:test';
import assert from 'node:assert/strict';
import { createBorrowed, parseBorrowedSave, triangleArea, insideTriangle, edgeDistance, memoryPosition } from '../borrowed-game.js';
import { CHAMBERS, bloomPosition, PORTALS, MAX_ENEMIES, MAX_BULLETS, MAX_PARTICLES } from '../borrowed-levels.js';
import { createWeaver } from './borrowed-autoplay.mjs';
const maths = { triangleArea, insideTriangle, edgeDistance, bloomPosition, PORTALS };
const advance = (game, seconds, input) => { for (let i = 0; i < seconds * 60; i++) game.advance(1 / 60, input); };

test('the sail catches boundaries in either winding and rejects a folded triangle', () => {
  const triangle = [[0, 0], [4, 0], [0, 3]];
  assert.equal(triangleArea(...triangle), 6);
  for (const shape of [triangle, [...triangle].reverse()]) {
    assert.ok(insideTriangle(1, 1, shape)); assert.ok(insideTriangle(2, 0, shape));
    assert.equal(insideTriangle(3, 2, shape), false);
    assert.equal(edgeDistance(1, 1, shape), 1);
  }
  assert.equal(insideTriangle(0, 0, [[0, 0], [0, 0], [0, 0]]), false);
  assert.equal(edgeDistance(1, 0, [[0, 0], [0, 0], [0, 0]]), 1);
});
test('echoes interpolate routes, freeze at the end, and preserve borrow teleports', () => {
  const memory = { ticks: 12, points: [[0, 0, 0], [3, 3, 0], [6, 6, 0], [7, -5, 1, 1], [9, -3, 1], [12, 0, 1]] };
  assert.deepEqual(memoryPosition(memory, 1.5), [1.5, 0]);
  assert.deepEqual(memoryPosition(memory, 6.5), [6, 0]);
  assert.deepEqual(memoryPosition(memory, 7), [-5, 1]);
  assert.deepEqual(memoryPosition(memory, 50), [0, 1]);
});
test('fixed-clock simulation is identical at 30 and 60 Hz; diagonal input stays fair', () => {
  const a = createBorrowed(), b = createBorrowed(); a.start(); b.start();
  for (let i = 0; i < 480; i++) a.advance(1 / 60, { x: 0.5, z: -0.4, pulse: true });
  for (let i = 0; i < 240; i++) b.advance(1 / 30, { x: 0.5, z: -0.4, pulse: true });
  assert.deepEqual(a.snapshot(), b.snapshot());
  const straight = createBorrowed(), diagonal = createBorrowed(); straight.start(); diagonal.start();
  advance(straight, 0.5, { z: -1 }); advance(diagonal, 0.5, { x: 1, z: -1 });
  const moved = game => Math.hypot(game.state.player.x, game.state.player.z - PORTALS[0][1]);
  assert.ok(Math.abs(moved(straight) - moved(diagonal)) < 1e-8);
});
test('banking records the actual route, replays it independently, and retains two memories', () => {
  const game = createBorrowed(); game.start();
  assert.equal(game.bank(), false, 'an empty memory cannot be banked');
  advance(game, 2, { x: 0.4, pulse: true }); assert.ok(game.bank());
  const memory = JSON.stringify(game.state.memories[0]);
  assert.equal(game.state.mode, 'between'); assert.equal(game.state.memories[0].ticks, 120);
  assert.ok(parseBorrowedSave(game.snapshot()));
  game.nextLoop(); advance(game, 1, { z: 0.5 });
  assert.deepEqual(game.state.sail[1], memoryPosition(game.state.memories[0], 60));
  assert.equal(JSON.stringify(game.state.memories[0]), memory, 'current actions cannot mutate a past route');
  assert.ok(game.borrow()); assert.ok(game.state.recording.at(-1)[3]);
  assert.equal(game.borrow(), false, 'borrow has a cooldown');
  advance(game, 1.2, { z: -0.4 }); game.bank(); game.nextLoop();
  advance(game, 2, { z: 0.2, pulse: true }); game.bank();
  assert.equal(game.state.memories.length, 2); assert.deepEqual(game.state.memories.map(m => m.portal), [1, 2]);
  assert.ok(parseBorrowedSave(game.snapshot()));
});
test('pause freezes gameplay and cooldowns; resuming restores the same active state', () => {
  const game = createBorrowed(); game.start(); game.dash(); advance(game, 0.2, { x: 1, pulse: true }); game.pause();
  const saved = game.snapshot(); advance(game, 20, { x: -1, pulse: true });
  assert.deepEqual(game.snapshot(), saved);
  assert.equal(game.snap(), false); assert.equal(game.dash(), false); assert.equal(game.bank(), false);
  game.resume(); advance(game, 0.5); assert.ok(game.state.ticks > saved.ticks);
});
test('banking immediately after a borrow preserves the jump and the between-loop checkpoint', () => {
  const a = createBorrowed(); a.start(); advance(a, 2); a.bank(); a.nextLoop(); advance(a, 2); a.borrow(); a.bank();
  assert.equal(a.state.memories.at(-1).points.at(-1)[3], 1);
  const save = a.snapshot(), b = createBorrowed(); assert.ok(b.restore(save)); assert.deepEqual(b.snapshot(), save);
  a.nextLoop(); b.nextLoop(); advance(a, 1, { pulse: true }); advance(b, 1, { pulse: true }); assert.deepEqual(b.snapshot(), a.snapshot());
});
test('the last loop has an honest limit and cannot be banked for free health forever', () => {
  const game = createBorrowed(); game.start();
  for (let loop = 1; loop <= game.state.maxLoops; loop++) {
    advance(game, 2); assert.ok(game.bank());
    if (loop < game.state.maxLoops) assert.ok(game.nextLoop());
  }
  assert.equal(game.state.mode, 'lost'); assert.match(game.state.reason, /Out of thread/);
});
test('all six chambers are winnable with legal controls in Flow and Rift', () => {
  for (const difficulty of ['flow', 'rift']) for (const room of CHAMBERS) {
    const game = createBorrowed({ level: room.id, difficulty }); game.start();
    const play = createWeaver(game, maths);
    for (let tick = 0; tick < 60 * 240 && ['playing', 'between'].includes(game.state.mode); tick++) {
      play();
      const s = game.state;
      assert.ok(s.enemies.length <= MAX_ENEMIES && s.bullets.length <= MAX_BULLETS && s.effects.length <= MAX_PARTICLES);
      if (tick % 180 === 0 && s.mode !== 'lost') assert.ok(parseBorrowedSave(game.snapshot()), `valid ${difficulty} / ${room.id} checkpoint at ${tick}`);
    }
    assert.equal(game.state.mode, 'won', `${difficulty} / chamber ${room.id}, HP ${game.state.hp}, blooms ${game.state.blooms.map(b => b.charge)}`);
    assert.ok(game.state.blooms.every(b => b.charge === b.need));
    assert.ok(game.state.loop >= 3, 'blooms are unlocked by memories');
    assert.ok(game.rating() >= 1 && game.rating() <= 3);
    if (room.boss) { assert.ok(game.state.bossAwake); assert.equal(game.state.bossHp, 0); }
  }
});
test('checkpoint roundtrips retain clocks, actors, resources and exact tapes; future simulation agrees', () => {
  const a = createBorrowed({ level: 5 }); a.start(); const play = createWeaver(a, maths);
  for (let i = 0; i < 1100 && a.state.mode === 'playing'; i++) play();
  if (a.state.mode === 'between') a.nextLoop();
  advance(a, 1, { x: 0.1, pulse: true });
  const saved = a.snapshot(), b = createBorrowed();
  assert.ok(b.restore(saved)); assert.equal(b.state.mode, 'paused'); b.resume();
  assert.deepEqual(b.snapshot(), saved);
  for (let i = 0; i < 60; i++) { const input = { x: -0.1, z: 0.3, pulse: true }; a.advance(1 / 60, input); b.advance(1 / 60, input); }
  assert.deepEqual(b.snapshot(), a.snapshot());
  assert.ok(JSON.stringify(saved).length < 250000);
});
test('malformed checkpoints fail closed and do not alter the active run', () => {
  const game = createBorrowed(); game.start(); advance(game, 2, { pulse: true });
  const save = game.snapshot();
  for (const mutate of [s => s.player.x = NaN, s => s.level = 7, s => s.recording[0] = [999999, 1, 1], s => s.blooms[0].charge = 999, s => s.memories = [{}], s => s.bullets = Array(97).fill({}), s => s.mode = 'won', s => s.random = 'bad', s => s.windX = Infinity, s => s.ring = null]) {
    const broken = structuredClone(save); mutate(broken); assert.equal(parseBorrowedSave(broken), null); assert.equal(game.restore(broken), false); assert.deepEqual(game.snapshot(), save);
  }
  assert.equal(parseBorrowedSave(null), null);
});
test('idle play loses honestly; a new chamber clears the previous encounter and tapes', () => {
  const game = createBorrowed(); game.start(); advance(game, 26);
  assert.equal(game.state.mode, 'lost'); assert.equal(game.snapshot(), null);
  game.start(6, 'rift'); assert.equal(game.state.level, 6); assert.equal(game.state.memories.length, 0); assert.equal(game.state.bossHp, 30);
  assert.equal(game.state.hp, 90); assert.equal(game.state.ticks, 0); assert.equal(game.state.mode, 'playing');
});
