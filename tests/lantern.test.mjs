import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLantern, isWalkable, parseLanternSave, STEP } from '../lantern-game.js';
import { finishVillage, walkTo } from './lantern-strategy.mjs';
const world = JSON.parse(await readFile(new URL('../assets/lantern-world.json', import.meta.url), 'utf8'));
const make = () => { const game = createLantern({ world }); game.start(); return game; };

test('the complete Blender village can be explored and lit using only legal walking', () => {
  const game = make(); finishVillage(game);
  assert.equal(game.state.mode, 'won'); assert.equal(game.state.lit.length, 5);
  assert.equal(game.state.secrets.length, 5); assert.equal(game.state.stars, 3);
  assert.equal(game.state.charge, game.state.collected.length - 21);
  assert.ok(game.state.ticks > 1000); assert.ok(parseLanternSave(game.snapshot(), world));
});
test('water, houses, and the cliff remain solid while bridges can be crossed', () => {
  assert.equal(isWalkable(world, 2.4, 0), false);
  assert.equal(isWalkable(world, 2.4, -5.7), true);
  assert.equal(isWalkable(world, -6.5, -0.7), false);
  assert.equal(isWalkable(world, 16, 0), false);
  const game = make(); walkTo(game, { x: 0.7, z: 1 });
  for (let i = 0; i < 300; i++) game.advance(STEP, { x: 1, z: 0 });
  assert.ok(game.state.player.x < world.river.left);
  assert.ok(isWalkable(world, game.state.player.x, game.state.player.z));
  walkTo(game, { x: 5, z: 4.5 }); assert.ok(game.state.player.x > world.river.right);
});
test('fixed simulation steps and exact continuation produce the same future', () => {
  const a = make(), b = make();
  for (let i = 0; i < 120; i++) a.advance(STEP, { x: 0.2, z: -0.5 });
  for (let i = 0; i < 30; i++) b.advance(STEP * 4, { x: 0.2, z: -0.5 });
  assert.deepEqual(a.snapshot(), b.snapshot());
  const restored = createLantern({ world }); assert.ok(restored.restore(a.snapshot()));
  assert.equal(restored.state.mode, 'paused'); restored.resume();
  for (let i = 0; i < 30; i++) { a.advance(STEP, { x: 0.5, z: 0.3 }); restored.advance(STEP, { x: 0.5, z: 0.3 }); }
  assert.deepEqual(a.snapshot(), restored.snapshot());
});
test('pause prevents progress and exploring preserves the complete village', () => {
  const game = make(); game.pause(); const before = game.snapshot(); game.advance(1, { x: 1 }); assert.deepEqual(game.snapshot(), before);
  game.resume(); finishVillage(game); assert.ok(game.explore()); assert.equal(game.state.mode, 'exploring');
  game.pause(); assert.equal(game.state.resumeMode, 'exploring');
  const restored = make(); assert.ok(restored.restore(game.snapshot())); restored.resume(); assert.equal(restored.state.mode, 'exploring');
});
test('lanterns consume the required fireflies and require a short nearby pause', () => {
  const game = make(), beacon = world.beacons[0];
  walkTo(game, beacon, 0.8); // The trail collects the first three motes.
  if (game.state.charge < beacon.cost) for (const [x, z] of world.motes.slice(0, 3)) walkTo(game, { x, z });
  walkTo(game, beacon, 0.8); const charge = game.state.charge;
  game.advance(0.3); assert.equal(game.state.lit.length, 0);
  game.advance(1); assert.ok(game.state.lit.includes(0)); assert.equal(game.state.charge, charge - 3);
  game.advance(1); assert.equal(game.state.charge, charge - 3);
});
test('malformed checkpoints and impossible progress are rejected safely', () => {
  const valid = make().snapshot();
  for (const value of [null, 7, [], {}, { ...valid, schema: 2 }, { ...valid, player: null }, { ...valid, player: { ...valid.player, x: 2.4, z: 0 } }, { ...valid, collected: [0, 0], charge: 2 }, { ...valid, charge: 99 }, { ...valid, lit: [0] }, { ...valid, mode: 'exploring' }, { ...valid, stars: 3 }, { ...valid, channel: { beacon: 0, progress: 0.5 } }]) {
    assert.equal(parseLanternSave(value, world), null);
  }
  const copy = parseLanternSave(valid, world); copy.player.x = 100; assert.notEqual(valid.player.x, 100);
});
test('long roaming remains finite and snapshots stay valid', () => {
  const game = make();
  for (let i = 0; i < 6000; i++) {
    game.advance(STEP, { x: Math.sin(i / 79), z: Math.cos(i / 101) });
    if (i % 120 === 0) assert.ok(parseLanternSave(game.snapshot(), world));
  }
  assert.ok(game.state.events.length <= 40); assert.ok(game.state.effects.length <= 50);
  const before = game.snapshot(); game.advance(NaN); game.advance(-2); assert.deepEqual(game.snapshot(), before);
  game.advance(STEP, null); assert.ok(parseLanternSave(game.snapshot(), world));
});

test('a finished village remains explorable and missing memories improve its saved stars', () => {
  const game = make(); finishVillage(game, false);
  assert.equal(game.state.mode, 'won'); assert.ok(game.state.secrets.length < 5);
  game.state.events.length = 0; assert.ok(game.explore());
  for (const secret of world.secrets) walkTo(game, secret);
  assert.equal(game.state.mode, 'exploring'); assert.equal(game.state.secrets.length, 5); assert.equal(game.state.stars, 3);
  assert.equal(game.state.events.some(event => event.type === 'won'), false);
  const restored = make(); assert.ok(restored.restore(game.snapshot())); restored.resume();
  assert.equal(restored.state.mode, 'exploring'); assert.equal(restored.state.stars, 3);
});

test('a partly lit lantern resumes at the same point without spending its charge twice', () => {
  const game = make(), beacon = world.beacons[0];
  for (const [x, z] of world.motes.slice(0, 3)) walkTo(game, { x, z });
  walkTo(game, beacon, 0.8); game.advance(0.2);
  assert.equal(game.state.channel.beacon, 0); assert.ok(game.state.channel.progress > 0 && game.state.channel.progress < 1);
  game.pause(); const saved = game.snapshot(), restored = make(); assert.ok(restored.restore(saved));
  game.resume(); restored.resume(); game.advance(1); restored.advance(1);
  assert.deepEqual(game.snapshot(), restored.snapshot()); assert.deepEqual(game.state.lit, [0]); assert.equal(game.state.charge, 0);
});
