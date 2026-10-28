import test from 'node:test';
import assert from 'node:assert/strict';
import { createLegacyController, legacyIds } from '../voyage/legacy.js';
import { LEVELS as POP_LEVELS } from '../popwake-game.js';
import { LEVELS as POND_LEVELS } from '../pondpost-game.js';
import { LEVELS as REEF_LEVELS } from '../ribbon-game.js';
import { createMoonbouncePilot } from './moonbounce-strategy.mjs';
import { solvePondPost } from './pondpost-strategy.mjs';

function build(id, level = 1) {
  const calls = [];
  const container = { getBoundingClientRect: () => ({ left: 10, top: 20, width: 300, height: 400 }) };
  const view = { pick: (x, z) => ({ x, z }), project: (x, z) => ({ x, y: z }),
    dragVector: (x, y) => ({ vx: x * .12, vy: -y * .12 }), render: () => {},
    dispose: () => calls.push('dispose'), renderer: { forceContextLoss: () => calls.push('context'), domElement: { remove: () => calls.push('remove') } } };
  return { game: createLegacyController(id, { container, view, level, seed: 42 }), calls };
}
function advance(game, seconds) { for (let i = 0; i < Math.round(seconds * 60); i++) game.update(1 / 60); }

test('five original worlds retain their real engines, normalize running modes, and restore separately', () => {
  assert.equal(legacyIds.length, 5);
  for (const id of legacyIds) {
    const { game } = build(id), { game: copy } = build(id);
    assert.equal(game.state.mode, 'playing'); advance(game, .1);
    const saved = game.snapshot();
    assert.ok(saved.engine.ticks > 0 || id === 'popwake');
    assert.ok(copy.restore(saved), id); assert.deepEqual(copy.snapshot(), saved, id);
    for (const bad of [{ ...saved, id: 'other' }, { ...saved, mode: 'won' }, { ...saved, level: 999 },
      { ...saved, engine: { ...saved.engine, ticks: NaN } }, { ...saved, finish: { steps: 1, input: { x: 0, z: 0 } } }]) {
      assert.equal(copy.restore(bad), false, id); assert.deepEqual(copy.snapshot(), saved, `${id}: invalid save is transactional`);
    }
    assert.doesNotThrow(() => { game.pointer('down', NaN, 0); game.update(NaN); game.render(0); });
  }
});

test('canceled input never launches a moon, leap, or domino chain; tilt and pointer axes release', () => {
  for (const id of legacyIds) {
    const { game } = build(id), before = game.engine.state;
    const start = id === 'popwake' ? POP_LEVELS[0].start : { x: 100, z: 120 };
    game.pointer('down', start.x, start.z); game.pointer('move', start.x + 12, start.z + 40); game.pointer('cancel');
    assert.equal(game.engine.state.mode, 'playing', id);
    if (id === 'moonbounce') assert.equal(before.bursts, 0);
    if (id === 'pondpost') assert.equal(before.jumps, 0);
    if (id === 'popwake') assert.equal(before.used, 0);
    if (id === 'dewfall') assert.equal(before.dragging, false);
    const saved = game.snapshot(), { game: copy } = build(id); assert.ok(copy.restore(saved));
    advance(game, .1); advance(copy, .1); assert.deepEqual(copy.snapshot(), game.snapshot(), id);
  }
});

test('Popwake chapter is a legal full puzzle and a finished checkpoint resumes without replaying', () => {
  const { game } = build('popwake', 2), path = POP_LEVELS[1].solution;
  game.pointer('down', path[0].x, path[0].z);
  for (const point of path.slice(1)) game.pointer('move', point.x, point.z);
  game.pointer('up', path.at(-1).x, path.at(-1).z); advance(game, 5);
  assert.equal(game.state.mode, 'won'); assert.equal(game.engine.state.level, 2);
  const { game: copy } = build('popwake'); assert.ok(copy.restore(game.snapshot())); assert.equal(copy.state.mode, 'won');
  game.resetLevel(); assert.equal(game.state.mode, 'playing'); assert.equal(game.engine.state.level, 2);
  assert.ok(game.hint().length > 1); assert.equal(game.engine.state.hintVisible, true);
});

test('a whole Dewdrop chapter completes through the shared drag control', () => {
  const { game } = build('dewfall'); game.pointer('down', 150, 200); game.pointer('move', 150, 156); advance(game, 3);
  assert.equal(game.state.mode, 'won'); assert.equal(game.engine.state.bloomed, 3);
  const { game: copy } = build('dewfall'); assert.ok(copy.restore(game.snapshot())); assert.equal(copy.state.mode, 'won');
});

test('the frog can complete a route through actual pull, release, preview and physics', () => {
  const { game } = build('pondpost'); let x = 150, y = 160;
  const input = {
    get state() { return game.engine.state; }, beginAim() { game.pointer('down', 150, 160); return game.engine.state.mode === 'aiming'; },
    aim(v) { x = 150 - v.vx / .12; y = 160 + v.vy / .12; game.pointer('move', x, y); },
    preview() { return game.engine.preview(); }, cancelAim() { game.pointer('cancel'); },
    launch() { game.pointer('up', x, y); return game.engine.state.mode === 'flying'; },
    advance(dt) { for (let time = 0; time < dt - 1e-8; time += 1 / 60) game.update(1 / 60); },
  };
  const result = solvePondPost(input, POND_LEVELS);
  assert.equal(result.mode, 'won'); assert.equal(game.state.mode, 'won');
  const { game: copy } = build('pondpost'); assert.ok(copy.restore(game.snapshot())); assert.equal(copy.state.mode, 'won');
});

test('Moonbounce stops after one real wave and retains its resulting save', () => {
  const { game } = build('moonbounce');
  const pilot = createMoonbouncePilot({
    get state() { return game.engine.state; },
    burst() { game.pointer('down', 150, 180); game.pointer('up', 150, 180); },
    advance(dt, { x, z }) {
      game.pointer('cancel'); game.pointer('down', 150, 180);
      // The original engine clamps component values before normalizing.
      x = Math.max(-1, Math.min(1, x)); z = Math.max(-1, Math.min(1, z));
      const n = Math.max(1, Math.hypot(x, z)); game.pointer('move', 150 + x / n * 44, 180 + z / n * 44); game.update(dt);
      game.pointer('cancel');
    },
  });
  for (let tick = 0; tick < 60 * 180 && game.state.mode === 'playing'; tick++) pilot();
  assert.equal(game.state.mode, 'won'); assert.equal(game.engine.state.wave, 1); assert.equal(game.engine.state.mode, 'upgrade');
  const { game: copy } = build('moonbounce'); assert.ok(copy.restore(game.snapshot())); assert.equal(copy.state.mode, 'won');
});

test('Reef victories and defeats reconstruct their exact terminal physics tick', () => {
  for (const win of [true, false]) {
    const { game } = build('ribbon');
    for (let tick = 0; tick < 4000 && game.state.mode === 'playing'; tick++) {
      if (win) {
        const target = REEF_LEVELS[0].gates.find(gate => gate.distance > game.engine.state.distance + .1);
        if (target) {
          game.pointer('down', 150, 180);
          const x = 150 + (target.x - game.engine.state.targetX) * 300 / 8.4, y = 180 - (target.y - game.engine.state.targetY) * 400 / 4.7;
          game.pointer('move', x, y); game.pointer('up', x, y);
        }
      }
      game.update(tick % 2 ? .023 : .027);
    }
    assert.equal(game.state.mode, win ? 'won' : 'lost');
    const saved = game.snapshot(); assert.ok(saved.finish);
    const { game: copy } = build('ribbon'); assert.ok(copy.restore(saved));
    assert.equal(copy.state.mode, game.state.mode); assert.equal(copy.engine.state.distance, game.engine.state.distance);
    assert.equal(copy.engine.state.score, game.engine.state.score); assert.deepEqual(copy.snapshot(), saved);
  }
});

test('Moonbounce defeat restores safely and switching chapters releases the graphics context once', () => {
  const { game } = build('moonbounce'); advance(game, 180); assert.equal(game.state.mode, 'lost');
  const saved = game.snapshot(), { game: copy } = build('moonbounce');
  assert.ok(copy.restore(saved)); assert.equal(copy.state.mode, 'lost'); assert.deepEqual(copy.snapshot(), saved);
  for (const id of legacyIds) {
    const { game, calls } = build(id); game.dispose(); game.dispose();
    assert.deepEqual(calls, ['dispose', 'context', 'remove']);
  }
});
