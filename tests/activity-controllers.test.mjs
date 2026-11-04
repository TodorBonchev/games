import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACTIVITIES, DISTRICTS } from '../activities/catalog.js';
import { createStandaloneController } from '../activities/controllers.js';
import { expeditionTargets } from '../lantern-game.js';
import { finishVillage, flyTo } from './lantern-strategy.mjs';
import { playGarden } from './garden-strategy.mjs';

const world = JSON.parse(await readFile(new URL('../assets/lantern-world.json', import.meta.url), 'utf8'));
function make(id, level = 1) {
  const calls = [];
  const container = { getBoundingClientRect: () => ({ left: 10, top: 20, width: 800, height: 500 }) };
  const view = {
    project: (x, z) => ({ x: 40 + x * 80, y: 40 + z * 60 }),
    cellBounds: (row, col) => ({ left: col * 80, top: row * 60, width: 80, height: 60 }),
    pick: x => Math.round((x - 50) / 80), setHover() {}, render() {},
    dispose: () => calls.push('dispose'),
    renderer: { forceContextLoss: () => calls.push('context'), domElement: { remove: () => calls.push('remove') } },
  };
  return { game: createStandaloneController(id, { container, view, world, level, seed: 42 }), calls };
}
const advance = (game, seconds, input = {}) => { for (let tick = 0; tick < Math.round(seconds * 60); tick++) game.update(1 / 60, input); };
const tap = (game, x, y) => { game.pointer('down', x, y); game.pointer('up', x, y); };

test('the settlement includes exactly thirty distinct activities in six complete districts', () => {
  assert.equal(ACTIVITIES.length, 30); assert.equal(new Set(ACTIVITIES.map(a => a.id)).size, 30);
  assert.equal(DISTRICTS.length, 6);
  for (const district of DISTRICTS) {
    assert.equal(district.missions.length, 5);
    assert.equal(ACTIVITIES.filter(activity => activity.district === district.id).length, 5);
  }
  for (const a of ACTIVITIES) {
    assert.ok(a.title && a.task && a.description && a.instructions && a.asset);
    assert.ok(a.levelCount > 0 && Number.isInteger(a.levelCount));
  }
});

test('four native adapters restore real engine state transactionally and release their scenes once', () => {
  for (const id of ['garden', 'borrowed', 'prism', 'lantern']) {
    const { game, calls } = make(id), { game: copy } = make(id);
    advance(game, .5);
    const saved = JSON.parse(JSON.stringify(game.snapshot()));
    assert.ok(copy.restore(saved), id); assert.deepEqual(copy.snapshot(), saved, id);
    for (const bad of [{ ...saved, id: 'other' }, { ...saved, mode: 'lost' }, { ...saved, level: 999 }, { ...saved, random: NaN }, { ...saved, engine: { ...saved.engine, level: 999 } }]) {
      assert.equal(copy.restore(bad), false, id); assert.deepEqual(copy.snapshot(), saved, id);
    }
    game.pointer('down', 50, 60); game.pointer('cancel');
    game.dispose(); game.dispose();
    assert.equal(calls.filter(value => value === 'dispose').length, 1);
    assert.equal(calls.filter(value => value === 'remove').length, 1);
    assert.doesNotThrow(() => { game.pointer('down', NaN, 0); game.update(NaN); game.render(); });
  }
});

test('Garden seed selection, pointer cancellation, planting, collecting, and a whole level work through the adapter', () => {
  const { game } = make('garden');
  game.action('pea'); game.pointer('down', 130, 180); game.pointer('cancel'); game.pointer('up', 130, 180);
  assert.equal(game.engine.state.plants.length, 0);
  tap(game, 130, 180); assert.equal(game.engine.state.plants[0].type, 'pea');
  assert.equal(game.engine.state.plants[0].row, 2); assert.equal(game.engine.state.plants[0].col, 1);
  game.action('shovel'); tap(game, 130, 180); assert.equal(game.engine.state.plants.length, 0);
  advance(game, 5.1); game.action('collect'); assert.equal(game.engine.state.suns.length, 0);
  const { game: complete } = make('garden', 2);
  const facade = {
    get state() { return complete.engine.state; }, get level() { return complete.engine.level; },
    place(type, row, col) { complete.action(type); tap(complete, 50 + col * 80, 60 + row * 60); return { ok: complete.engine.state.plants.some(plant => plant.type === type && plant.row === row && plant.col === col) }; },
    collectSun() { complete.action('collect'); }, tick(seconds) { advance(complete, seconds); },
  };
  assert.equal(playGarden(facade).mode, 'won'); assert.equal(complete.state.mode, 'won');
  const { game: restored } = make('garden'); assert.ok(restored.restore(complete.snapshot())); assert.equal(restored.state.mode, 'won');
});

test('Garden defeats retain a resumable exact final step', () => {
  const { game } = make('garden');
  for (let tick = 0; tick < 25000 && game.state.mode === 'playing'; tick++) game.update(1 / 60);
  assert.equal(game.state.mode, 'lost'); assert.ok(game.snapshot().finish);
  const { game: restored } = make('garden'); assert.ok(restored.restore(game.snapshot())); assert.equal(restored.state.mode, 'lost');
});

test('Borrowed has usable keyboard movement, held snap, dash, bank and echo controls', () => {
  const { game } = make('borrowed'); const start = { ...game.engine.state.player };
  game.action('snap', true); advance(game, 2.1, { left: true }); game.action('snap', false);
  assert.ok(game.engine.state.player.x < start.x - 1); assert.ok(game.engine.state.snaps > 0);
  assert.ok(game.action('bank')); assert.equal(game.engine.state.loop, 2); assert.equal(game.engine.state.memories.length, 1);
  assert.equal(game.state.mode, 'playing'); assert.equal(game.engine.state.mode, 'playing');
  assert.ok(game.action('borrow')); assert.ok(game.action('dash'));
  const save = game.snapshot(), { game: copy } = make('borrowed'); assert.ok(copy.restore(save));
  assert.deepEqual(copy.engine.state.memories, game.engine.state.memories);
  advance(game, .5);
  game.pointer('down', 100, 100); game.pointer('move', 150, 50); game.pointer('cancel');
  const before = { ...game.engine.state.player }; advance(game, .2);
  assert.equal(game.engine.state.player.x, before.x);
});

test('Prism completes all eight original puzzles with taps and preserves finished checkpoints', () => {
  for (let level = 1; level <= 8; level++) {
    const { game } = make('prism', level);
    for (const [index, piece] of game.engine.level.pieces.entries()) if (piece.solution !== undefined && game.engine.state.orientations[index] !== piece.solution) tap(game, 50 + index * 80, 60);
    assert.equal(game.state.mode, 'won', `Prism ${level}`);
    const { game: copy } = make('prism'); assert.ok(copy.restore(game.snapshot())); assert.equal(copy.state.mode, 'won');
  }
});

test('Lantern supports every flight axis and clears held movement when input is cancelled', () => {
  const { game } = make('lantern'); const start = { ...game.engine.state.player };
  game.action('rise', true); advance(game, .5, { up: true, right: true }); game.action('rise', false);
  assert.ok(game.engine.state.player.y > start.y); assert.notEqual(game.engine.state.player.heading, start.heading);
  game.action('descend', true); const high = game.engine.state.player.y; advance(game, 1); game.action('descend', false);
  assert.ok(game.engine.state.player.y < high);
  game.action('boost', true); game.pointer('down', 100, 100); game.pointer('move', 140, 70); game.pointer('cancel');
  advance(game, 1); assert.ok(Math.abs(game.engine.state.player.speed) < .001);
});

test('Lantern is one continuous three-island relief mission with the full original world', () => {
  const { game } = make('lantern');
  finishVillage(game.engine, false);
  assert.equal(game.engine.state.mode, 'won'); assert.equal(game.state.mode, 'playing', 'home village alone is not the full mission');
  game.update(1 / 60); assert.equal(game.engine.state.mode, 'exploring');
  assert.ok(world.satellites.some(island => island.id === game.engine.state.expedition.destination));
  const { game: copy } = make('lantern'); assert.ok(copy.restore(game.snapshot())); assert.equal(copy.state.mode, 'playing');
  for (const node of expeditionTargets(world)) flyTo(game.engine, node);
  assert.equal(game.state.mode, 'won'); assert.equal(game.engine.state.expedition.awakened.length, 2);
  assert.ok(copy.restore(game.snapshot())); assert.equal(copy.state.mode, 'won');
});

const { createMoonbounceController } = await import('../activities/moonbounce.js');
const { createMoonbouncePilot } = await import('./moonbounce-strategy.mjs');
function moonbounce(seed = 1) {
  return createMoonbounceController({ seed,
    container: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) },
    view: { project: (x, y) => ({ x, y }), render() {}, dispose() {}, renderer: { forceContextLoss() {}, domElement: { remove() {} } } },
  });
}
test('Moonbounce preserves every wave, all four upgrade choices, and the real final boss', () => {
  const game = moonbounce(); let upgrades = 0;
  const pilot = createMoonbouncePilot({
    get state() { return game.engine.state; },
    chooseUpgrade(id) {
      assert.equal(game.state.mode, 'playing'); assert.equal(game.actions.length, 3);
      const copy = moonbounce(); assert.ok(copy.restore(game.snapshot())); assert.deepEqual(copy.actions, game.actions);
      upgrades++; return game.action(`upgrade:${id}`);
    },
    burst() { game.pointer('down', 150, 180); game.pointer('up', 150, 180); },
    advance(dt, { x, z }) {
      game.pointer('cancel'); game.pointer('down', 150, 180);
      x = Math.max(-1, Math.min(1, x)); z = Math.max(-1, Math.min(1, z));
      const n = Math.max(1, Math.hypot(x, z));
      game.pointer('move', 150 + x / n * 44, 180 + z / n * 44); game.update(dt); game.pointer('cancel');
    },
  });
  for (let tick = 0; tick < 60 * 300 && game.state.mode === 'playing'; tick++) pilot();
  assert.equal(upgrades, 4); assert.equal(game.state.mode, 'won'); assert.equal(game.engine.state.wave, 5); assert.equal(game.engine.state.bossDefeated, true);
  const copy = moonbounce(); assert.ok(copy.restore(game.snapshot())); assert.equal(copy.state.mode, 'won');
});
test('Moonbounce migrates a finished Wonderwake wave into the original upgrade decision', () => {
  const game = moonbounce(), pilot = createMoonbouncePilot(game.engine);
  while (game.engine.state.mode === 'playing') pilot();
  const old = { ...game.snapshot(), schema: 1, mode: 'won' }, copy = moonbounce();
  assert.ok(copy.restore(old)); assert.equal(copy.state.mode, 'playing'); assert.equal(copy.engine.state.mode, 'upgrade');
  assert.equal(copy.actions.length, 3);
});
