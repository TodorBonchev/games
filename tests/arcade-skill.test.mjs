import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/build/three.module.js';
import { games } from '../arcade/skill-games.js';

const build = id => {
  const spec = games.find(game => game.id === id);
  assert.ok(spec, `missing game ${id}`);
  const root = new THREE.Group(), controller = spec.create({ THREE, root, seed: 42 });
  return { controller, root };
};
const tap = (game, x, z) => { game.pointer('down', x, z); game.pointer('up', x, z); };

test('all six characters and games have distinct identities, valid saves, and safe canceled input', () => {
  assert.equal(games.length, 6);
  assert.equal(new Set(games.map(game => game.id)).size, 6);
  assert.equal(new Set(games.map(game => game.hero)).size, 6);
  for (const spec of games) {
    const { controller: game, root } = build(spec.id), { controller: copy } = build(spec.id);
    assert.ok(root.children.length > 10, `${spec.id} has a 3D world and character`);
    assert.equal(game.state.mode, 'playing');
    game.pointer('down', 0, 0); game.pointer('cancel', 0, 0);
    const snapshot = game.snapshot();
    assert.equal(copy.restore(snapshot), true, `${spec.id} can resume`);
    assert.deepEqual(copy.snapshot(), snapshot);
    assert.equal(copy.restore({ ...snapshot, schema: 2 }), false);
    assert.equal(copy.restore({ ...snapshot, id: 'other' }), false);
    assert.equal(copy.restore({ ...snapshot, mode: 'not-a-mode' }), false);
    assert.doesNotThrow(() => { game.pointer('move', NaN, 0); game.update(NaN); game.sync(); });
    game.dispose(); copy.dispose();
  }
});

test('Nori catches every moving fish with timed pointer controls', () => {
  const { controller: game } = build('tidehook');
  for (let n = 0; n < 8; n++) {
    game.pointer('down', game.state.fishX, 0);
    let caught = false;
    for (let i = 0; i < 400 && game.state.holding; i++) {
      game.pointer('move', game.state.fishX, 0); game.update(.02);
      if (Math.abs(game.state.depth - game.state.fishZ) < .19) {
        game.pointer('up', game.state.fishX, 0); caught = true; break;
      }
    }
    assert.equal(caught, true, `fish ${n + 1} was catchable`);
    assert.equal(game.state.caught, n + 1);
  }
  assert.equal(game.state.mode, 'won'); assert.equal(game.state.misses, 0);
  const copy = build('tidehook').controller; assert.equal(copy.restore(game.snapshot()), true);
  game.dispose(); copy.dispose();
});

test('Bibi plays three increasingly long songs and ignores interrupted fingers', () => {
  const { controller: game } = build('bellwood-beats');
  game.pointer('down', 0, 0); game.pointer('cancel', 0, 0); game.pointer('up', 0, 0);
  assert.equal(game.state.phase, 'ready');
  for (const phrase of [[0, 1, 2], [2, 0, 1, 2], [1, 2, 0, 2, 1]]) {
    tap(game, 0, 0);
    for (let i = 0; i < 150 && game.state.phase === 'show'; i++) game.update(.05);
    assert.equal(game.state.phase, 'repeat');
    for (const note of phrase) tap(game, [-3, 0, 3][note], 0);
  }
  assert.equal(game.state.mode, 'won'); assert.equal(game.state.mistakes, 0);
  const copy = build('bellwood-beats').controller; assert.equal(copy.restore(game.snapshot()), true);
  game.dispose(); copy.dispose();
});

test('Dottie delivers all parcels using actual drag-and-drop gestures', () => {
  const { controller: game } = build('parcel-parade');
  for (const color of [0, 2, 1, 0, 1, 2, 0, 2, 1]) {
    game.pointer('down', 0, game.state.z); game.pointer('move', [-3.4, 0, 3.4][color], -3.65); game.pointer('up', [-3.4, 0, 3.4][color], -3.65);
  }
  assert.equal(game.state.mode, 'won'); assert.equal(game.state.delivered, 9); assert.equal(game.state.mistakes, 0);
  const copy = build('parcel-parade').controller; assert.equal(copy.restore(game.snapshot()), true);
  game.dispose(); copy.dispose();
});

test('Milo can balance a cake through the full windy delivery', () => {
  const { controller: game } = build('wobble-bakery');
  game.pointer('down', 0, 0);
  for (let i = 0; i < 700 && game.state.mode === 'playing'; i++) {
    game.pointer('move', game.state.cake, 0); game.update(.05);
  }
  assert.equal(game.state.mode, 'won'); assert.equal(game.state.slips, 0); assert.equal(game.state.time, 30);
  const copy = build('wobble-bakery').controller; assert.equal(copy.restore(game.snapshot()), true);
  game.dispose(); copy.dispose();
});

test('Vesper can guide each moth to a different flower without changing game state', () => {
  const { controller: game } = build('mothlight');
  const ends = [[3.7, -2.8], [-3.7, -2.8], [1.2, -2.7], [-1.2, -2.7]];
  game.pointer('down', game.state.mothX, game.state.mothZ);
  for (let i = 0; i < 2500 && game.state.mode === 'playing'; i++) {
    const [x, z] = ends[game.state.delivered], dx = x - game.state.mothX, dz = z - game.state.mothZ, distance = Math.hypot(dx, dz) || 1;
    game.pointer('move', game.state.mothX + dx / distance * 1.15, game.state.mothZ + dz / distance * 1.15);
    game.update(.05);
  }
  assert.equal(game.state.mode, 'won'); assert.equal(game.state.delivered, 4); assert.equal(game.state.bumps, 0);
  const copy = build('mothlight').controller; assert.equal(copy.restore(game.snapshot()), true);
  game.dispose(); copy.dispose();
});

test('Saffron shapes all three clay pots using physical swipe inputs', () => {
  const { controller: game } = build('cloud-potter');
  const rows = [-2.65, -1.05, .55, 2.15], goals = [[1, 3, 2, 1], [2, 2, 3, 1], [1, 2, 3, 2]];
  for (let round = 0; round < goals.length; round++) {
    for (let row = 0; row < 4; row++) {
      while (game.state.mode === 'playing' && game.state.round === round && game.state.widths[row] !== goals[round][row]) {
        const direction = Math.sign(goals[round][row] - game.state.widths[row]);
        game.pointer('down', 2, rows[row]); game.pointer('up', 2 + direction * .8, rows[row]);
      }
    }
  }
  assert.equal(game.state.mode, 'won');
  const copy = build('cloud-potter').controller; assert.equal(copy.restore(game.snapshot()), true);
  game.dispose(); copy.dispose();
});
