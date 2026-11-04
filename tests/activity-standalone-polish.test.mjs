import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createStandaloneController } from '../activities/controllers.js';
import { flightGuidance } from '../activities/guidance.js';

const world = JSON.parse(await readFile(new URL('../assets/lantern-world.json', import.meta.url), 'utf8'));
function make(id, level = 1) {
  const hovers = [];
  const container = { getBoundingClientRect: () => ({ left: 10, top: 20, width: 800, height: 500 }) };
  const view = {
    project: (x, z) => ({ x: 40 + x * 80, y: 40 + z * 60 }),
    cellBounds: (row, col) => ({ left: col * 80, top: row * 60, width: 80, height: 60 }),
    pick: x => Math.round((x - 50) / 80), setHover: (...args) => hovers.push(args), render() {}, dispose() {},
  };
  return { game: createStandaloneController(id, { container, view, world, level, seed: 42 }), hovers };
}
const tap = (game, x, y = 60) => { game.pointer('down', x, y); game.pointer('up', x, y); };
const advance = (game, seconds, input = {}) => { for (let frame = 0; frame < Math.round(seconds * 60); frame++) game.update(1 / 60, input); };
const action = (game, id) => game.actions.find(item => item.id === id);

test('Garden previews occupancy, sun and cooldown without blocking seed selection for planning', () => {
  const { game, hovers } = make('garden');
  assert.equal(action(game, 'bloom').selected, true);
  assert.match(action(game, 'pea').label, /100 sun · ready/);
  game.action('pea'); game.pointer('move', 130, 180);
  assert.deepEqual(hovers.at(-1), [2, 1, true]);
  assert.match(game.hud().hint, /Plant Pea pod here/);
  tap(game, 130, 180);
  assert.deepEqual(hovers.at(-1), [2, 1, false]);
  assert.match(game.hud().hint, /Already planted/);
  assert.equal(action(game, 'pea').unavailable, true);
  assert.match(action(game, 'pea').label, /3s/);
  assert.notEqual(action(game, 'pea').disabled, true);
  assert.equal(game.action('pea'), true);
  game.pointer('move', 210, 180);
  assert.equal(hovers.at(-1)[2], false);
  assert.match(game.hud().hint, /recharging/);
  game.action('shovel'); game.pointer('move', 130, 180);
  assert.equal(hovers.at(-1)[2], true);
  tap(game, 130, 180); game.action('pea');
  assert.match(game.hud().hint, /recharging/);
  advance(game, 2.6);
  assert.equal(hovers.at(-1)[2], true, 'stationary preview becomes ready as the cooldown expires');
  assert.match(action(game, 'pea').label, /ready/);
  tap(game, 210, 180); game.pointer('move', 290, 180);
  assert.match(game.hud().hint, /Need 50 more sun/);
  advance(game, 2.6); assert.match(action(game, 'pea').label, /need 50/);
  game.pointer('cancel'); assert.deepEqual(hovers.at(-1), [-1, -1]);
  const saved = game.snapshot(), copy = make('garden').game;
  assert.ok(copy.restore(saved)); assert.equal(action(copy, 'pea').selected, true);
});

test('Borrowed readiness follows legal cooldowns and route recording while preserving terminal banking', () => {
  const { game } = make('borrowed');
  assert.equal(action(game, 'bank').shortcut, 'KeyB');
  assert.equal(action(game, 'bank').disabled, true);
  assert.equal(action(game, 'borrow').disabled, true);
  assert.equal(action(game, 'dash').disabled, false);
  assert.ok(game.action('dash'));
  assert.equal(action(game, 'dash').disabled, true); assert.match(action(game, 'dash').label, /3s/);
  advance(game, 2.1, { left: true });
  assert.equal(action(game, 'bank').disabled, false); assert.match(action(game, 'bank').label, /B · ready/);
  assert.ok(game.action('bank')); assert.equal(game.engine.state.loop, 2);
  assert.equal(action(game, 'borrow').disabled, false);
  assert.ok(game.action('borrow')); assert.equal(action(game, 'borrow').disabled, true);
  assert.match(action(game, 'borrow').label, /6s/);
  while (game.engine.state.loop < game.engine.state.maxLoops) {
    advance(game, 2.1, { right: true }); assert.ok(game.action('bank'));
  }
  assert.match(action(game, 'bank').label, /Final loop/);
  advance(game, 2.1);
  assert.equal(action(game, 'bank').disabled, true);
  assert.ok(game.action('bank'), 'direct engine semantics remain available to legal replays');
  assert.equal(game.state.mode, 'lost');
  const copy = make('borrowed').game;
  assert.ok(copy.restore(game.snapshot())); assert.equal(copy.state.mode, 'lost');
});

test('Prism undo restores real previous turns and never erases the hint penalty', () => {
  const { game } = make('prism', 2);
  const original = [...game.engine.state.orientations];
  assert.equal(action(game, 'undo').disabled, true); assert.equal(action(game, 'undo').shortcut, 'KeyZ');
  tap(game, 50); assert.equal(game.engine.state.moves, 1);
  assert.equal(action(game, 'undo').disabled, false);
  game.action('hint'); assert.equal(game.engine.state.hintUsed, true);
  assert.ok(game.action('undo'));
  assert.deepEqual(game.engine.state.orientations, original); assert.equal(game.engine.state.moves, 0);
  assert.equal(game.engine.state.hintUsed, true);
  tap(game, 50); tap(game, 130);
  assert.equal(game.state.mode, 'won'); assert.equal(game.engine.state.stars, 2);
});

test('Prism bounds and validates undo history transactionally, and still accepts old checkpoints', () => {
  const { game } = make('prism', 2);
  for (let turn = 0; turn < 40; turn++) tap(game, 50);
  const saved = game.snapshot();
  assert.equal(saved.history.length, 32);
  assert.equal(saved.history[0].moves, 8);
  const { game: copy } = make('prism'); assert.ok(copy.restore(saved));
  assert.deepEqual(copy.snapshot(), saved);
  const badHistories = [
    [...saved.history, saved.history.at(-1)],
    saved.history.map((item, index) => index ? item : { ...item, level: 3 }),
    saved.history.map((item, index) => index ? item : { ...item, moves: -1 }),
    saved.history.map((item, index) => index ? item : { ...item, orientations: [0, 1] }),
    saved.history.map((item, index) => index ? item : { ...item, hintUsed: true }),
    [null], 'invalid',
  ];
  for (const history of badHistories) {
    assert.equal(copy.restore({ ...saved, history }), false);
    assert.deepEqual(copy.snapshot(), saved);
  }
  for (let turn = 0; turn < 32; turn++) assert.ok(copy.action('undo'));
  assert.equal(copy.engine.state.moves, 8); assert.equal(copy.action('undo'), false);
  const legacy = { ...saved }; delete legacy.history;
  assert.ok(copy.restore(legacy)); assert.equal(action(copy, 'undo').disabled, true);
  tap(copy, 50); assert.equal(copy.snapshot().history.length, 1);
  copy.action('reset'); assert.equal(copy.snapshot().history.length, 0);
});

test('Prism explains the missing component of a partially lit receiver', () => {
  const { game } = make('prism', 5);
  tap(game, 130);
  assert.equal(game.engine.state.incoming[1], 1);
  assert.match(game.hud().hint, /pink receiver has red; add blue/);
  tap(game, 210); assert.equal(game.state.mode, 'won');
});

test('Lantern precision slows all flight axes, overrides boost and clears on cancellation', () => {
  const normal = make('lantern').game, precise = make('lantern').game;
  const start = { ...normal.engine.state.player }, input = { up: true, right: true, jump: true, boost: true };
  assert.equal(action(precise, 'precision').shortcut, 'KeyG'); assert.equal(action(precise, 'precision').hold, true);
  precise.action('precision', true); precise.action('boost', true);
  advance(normal, .3, input); advance(precise, .3, input);
  assert.equal(action(precise, 'precision').selected, true); assert.equal(action(precise, 'boost').disabled, true);
  const p = precise.engine.state.player, n = normal.engine.state.player;
  assert.ok(p.speed < n.speed * .36, 'precision uses cruise speed even while boost is held');
  assert.ok(Math.abs((p.heading - start.heading) / (n.heading - start.heading) - .35) < 1e-10);
  assert.ok(Math.abs((p.y - start.y) / (n.y - start.y) - .35) < 1e-10);
  assert.match(precise.hud().secondary, /precision flight/);
  assert.ok(precise.hud().hint.startsWith(flightGuidance(p, precise.engine.state.guide)));
  precise.pointer('cancel'); assert.equal(action(precise, 'precision').selected, false);
  assert.equal(action(precise, 'boost').disabled, false);
  advance(precise, 1); assert.ok(Math.abs(precise.engine.state.player.speed) < .001);
  precise.action('precision', true);
  const saved = precise.snapshot(); assert.ok(precise.restore(saved));
  assert.equal(action(precise, 'precision').selected, false, 'restoring never replays a held control');
});
