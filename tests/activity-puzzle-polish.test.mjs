import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/build/three.module.js';
import { games } from '../arcade/puzzle-games.js';

function make(id, level = 1) {
  const root = new THREE.Group();
  return { root, game: games.find(game => game.id === id).create({ THREE, root, seed: 117, singleRound: true, level }) };
}
function tap(game, x, z) { game.pointer('down', x, z); game.pointer('up', x, z); game.sync(); }
function cell(index, columns, rows, size, offset = 0) {
  return [(index % columns - (columns - 1) / 2) * size, (Math.floor(index / columns) - (rows - 1) / 2) * size + offset];
}
const tapCell = (game, index, columns, rows, size, offset) => tap(game, ...cell(index, columns, rows, size, offset));
function instances(root, shape, color) {
  let count = 0;
  root.traverse(node => { if (node.isInstancedMesh && node.geometry.type === shape && node.material.color.getHexString() === color.slice(1)) count += node.count; });
  return count;
}

test('Burrow marks legal steps/pushes and undo restores a pushed root after a save roundtrip', () => {
  const { game, root } = make('burrow-banquet');
  assert.ok(instances(root, 'TorusGeometry', '#7fbba7') > 0);
  tapCell(game, 17, 5, 5, 1.75, .25);
  assert.ok(instances(root, 'TorusGeometry', '#fff0a3') > 0, 'a reachable root gets a push marker');
  tapCell(game, 12, 5, 5, 1.75, .25);
  assert.equal(game.state.player, 12); assert.ok(game.state.crates.includes(7));
  const saved = JSON.parse(JSON.stringify(game.snapshot())), { game: restored } = make('burrow-banquet');
  assert.ok(restored.restore(saved)); assert.ok(restored.action('undo'));
  assert.equal(restored.state.player, 17); assert.deepEqual(restored.state.crates, [11, 12]); assert.equal(restored.state.moves, 1);
  assert.ok(restored.action('undo')); assert.equal(restored.state.player, 22); assert.equal(restored.state.moves, 0);
  assert.equal(restored.actions.find(action => action.id === 'undo').disabled, true);
  game.dispose(); restored.dispose();
});

test('Moon Basket identifies duplicate colors and clears conflict markers when corrected or undone', () => {
  const { game, root } = make('moon-basket');
  assert.equal(instances(root, 'TorusGeometry', '#d76879'), 0);
  tapCell(game, 3, 4, 4, 2.05, .2);
  assert.match(game.hud().hint, /repeat a color/); assert.ok(instances(root, 'TorusGeometry', '#d76879') >= 2);
  assert.ok(game.action('undo')); assert.equal(game.state.cells[3], 0); assert.equal(instances(root, 'TorusGeometry', '#d76879'), 0);
  for (let i = 0; i < 4; i++) tapCell(game, 3, 4, 4, 2.05, .2);
  assert.equal(game.state.cells[3], 4); assert.equal(instances(root, 'TorusGeometry', '#d76879'), 0);
  game.dispose();
});

test('Stack keeps a selected log after an invalid drop and marks only legal landing pads', () => {
  const { game, root } = make('stack-strata', 2);
  tap(game, -3.2, 0);
  assert.equal(instances(root, 'TorusGeometry', '#78c4ac'), 2);
  tap(game, 0, 0); assert.deepEqual(game.state.rods, [[3, 2], [1], []]);
  tap(game, -3.2, 0); assert.equal(instances(root, 'TorusGeometry', '#78c4ac'), 1);
  tap(game, 0, 0);
  assert.equal(game.state.selected, 0, 'invalid destination does not discard the chosen log');
  assert.equal(game.state.moves, 1); assert.equal(game.state.history.length, 1);
  tap(game, 3.2, 0); assert.deepEqual(game.state.rods, [[3], [1], [2]]);
  assert.ok(game.action('undo')); assert.deepEqual(game.state.rods, [[3, 2], [1], []]);
  assert.equal(game.state.selected, -1); assert.equal(game.state.moves, 1); game.dispose();
});

test('Jelly hints solve every current constellation through actual taps without making moves for the player', () => {
  for (let level = 1; level <= 4; level++) {
    const { game, root } = make('jelly-lanterns', level);
    tapCell(game, 8, 3, 3, 2.6, .2); assert.ok(game.action('undo'));
    let hints = 0;
    while (game.state.mode === 'playing' && hints++ < 10) {
      const before = game.state.mask, moves = game.state.moves;
      assert.ok(game.action('hint')); assert.equal(game.state.mask, before); assert.equal(game.state.moves, moves);
      assert.equal(instances(root, 'TorusGeometry', '#fff3a4'), 1);
      const saved = JSON.parse(JSON.stringify(game.snapshot())); assert.ok(game.restore(saved));
      tapCell(game, game.state.hint, 3, 3, 2.6, .2);
    }
    assert.equal(game.state.mode, 'won', `constellation ${level}`); assert.ok(hints <= 5); game.dispose();
  }
});

test('Dream Duos queues a deliberate third tap across pause/save and distinguishes paired numbered cards', () => {
  const { game, root } = make('dream-duos', 3);
  const first = 0, second = game.state.deck.findIndex(value => value !== game.state.deck[first]);
  const queued = game.state.deck.findIndex((_, index) => index !== first && index !== second);
  const rows = 4;
  tapCell(game, first, 4, rows, 2.05, .3); tapCell(game, second, 4, rows, 2.05, .3);
  tapCell(game, queued, 4, rows, 2.05, .3);
  assert.equal(game.state.queued, queued); assert.equal(game.state.moves, 2); assert.equal(instances(root, 'TorusGeometry', '#fff2a8'), 1);
  const saved = JSON.parse(JSON.stringify(game.snapshot())); const { game: restored } = make('dream-duos', 3);
  assert.ok(restored.restore(saved));
  for (let i = 0; i < 18; i++) { game.update(.05); restored.update(.05); }
  assert.deepEqual(restored.snapshot(), game.snapshot()); assert.deepEqual(game.state.flipped, [queued]); assert.equal(game.state.moves, 3);
  const mate = game.state.deck.findIndex((value, index) => index !== queued && value === game.state.deck[queued]);
  tapCell(game, mate, 4, rows, 2.05, .3);
  assert.deepEqual(new Set(game.state.matched), new Set([queued, mate]));
  assert.equal(instances(root, 'TorusGeometry', '#6da998'), 2);
  assert.ok(instances(root, 'SphereGeometry', '#354859') >= 2, 'number pips provide a cue beyond color');
  game.dispose(); restored.dispose();
});

test('Flock Shift shows correct positions and undo restores an entire corner rotation', () => {
  const { game, root } = make('flock-shift', 3);
  const before = [...game.state.tiles], correct = before.filter((value, i) => value === i + 1).length;
  assert.equal(instances(root, 'TorusGeometry', '#74bda1'), correct);
  tap(game, -1.15, -1.1); assert.notDeepEqual(game.state.tiles, before);
  const nextCorrect = game.state.tiles.filter((value, i) => value === i + 1).length;
  assert.equal(instances(root, 'TorusGeometry', '#74bda1'), nextCorrect);
  assert.match(game.hud().secondary, new RegExp(`${nextCorrect} / 9 IN PLACE`));
  assert.ok(game.action('undo')); assert.deepEqual(game.state.tiles, before); assert.equal(game.state.moves, 0); game.dispose();
});

test('Kelp Kitchen previews legal pours and keeps the ingredient selected after a rejected pour', () => {
  const { game, root } = make('kelp-kitchen');
  tap(game, -3.3, 0); assert.equal(instances(root, 'TorusGeometry', '#72bba3'), 2);
  tap(game, -1.1, 0); assert.equal(game.state.selected, 0); assert.equal(game.state.moves, 0);
  tap(game, 1.1, 0); assert.deepEqual(game.state.jars, [[1], [2, 1], [2], []]);
  const saved = JSON.parse(JSON.stringify(game.snapshot())), { game: restored } = make('kelp-kitchen');
  assert.ok(restored.restore(saved)); assert.ok(restored.action('undo'));
  assert.deepEqual(restored.state.jars, [[1, 2], [2, 1], [], []]); assert.equal(restored.state.moves, 0);
  game.dispose(); restored.dispose();
});

test('undo history is bounded, validated transactionally, and optional for existing checkpoints', () => {
  const { game } = make('moon-basket');
  for (let i = 0; i < 80; i++) tapCell(game, 3, 4, 4, 2.05, .2);
  const saved = game.snapshot(); assert.equal(saved.history.length, 32);
  for (const bad of [
    { ...saved, history: [...saved.history, saved.history[0]] },
    { ...saved, history: [{ ...saved.history[0], level: 99 }] },
    { ...saved, history: [{ ...saved.history[0], cells: [1] }] },
  ]) { assert.equal(game.restore(bad), false); assert.deepEqual(game.snapshot(), saved); }
  const circular = { ...saved }; circular.extra = circular;
  assert.equal(game.restore(circular), false); assert.deepEqual(game.snapshot(), saved);
  const legacy = { ...saved }; delete legacy.history;
  assert.ok(game.restore(legacy)); assert.deepEqual(game.state.cells, saved.cells); assert.deepEqual(game.state.history, []);
  tapCell(game, 3, 4, 4, 2.05, .2); assert.ok(game.state.history.length);
  game.resetLevel(); assert.equal(game.state.history.length, 0); assert.equal(game.action('undo'), false); game.dispose();
});
