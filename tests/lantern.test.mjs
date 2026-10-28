import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLantern, isFlyable, isFlightClear, flightTargets, flightSpawn, FLIGHT, parseLanternSave, STEP } from '../lantern-game.js';
import { finishVillage, flyTo } from './lantern-strategy.mjs';
const world = JSON.parse(await readFile(new URL('../assets/lantern-world.json', import.meta.url), 'utf8'));
const targets = flightTargets(world);
const make = () => { const game = createLantern({ world }); game.start(); return game; };
const advance = (game, seconds, controls) => { for (let i = 0; i < Math.round(seconds * 60); i++) game.advance(STEP, controls); };

test('all five landmarks and aerial discoveries can be reached with legal flight controls', () => {
  const game = make(); finishVillage(game);
  assert.equal(game.state.mode, 'won'); assert.equal(game.state.lit.length, 5);
  assert.equal(game.state.secrets.length, 5); assert.equal(game.state.stars, 3);
  assert.equal(game.state.charge, game.state.collected.length - 21);
  assert.ok(game.state.ticks > 1000); assert.ok(parseLanternSave(game.snapshot(), world));
});
test('the spaceship flies beyond the shore, above the roofs, and under the island', () => {
  const game = make(); assert.deepEqual(game.state.player, flightSpawn(world));
  flyTo(game, { x: 24, y: 2, z: 0 }); assert.ok(game.state.player.x > world.bounds.rx);
  flyTo(game, { x: -7.4, y: 10, z: -7.3 }); assert.ok(game.state.player.y > 9.5);
  flyTo(game, targets.secrets[4]); assert.ok(game.state.player.y < -7); assert.ok(game.state.secrets.includes(4));
  assert.ok(isFlyable(world, game.state.player.x, game.state.player.y, game.state.player.z));
});
test('island rock, rooflines, and the edge of space are solid without trapping the ship', () => {
  assert.equal(isFlyable(world, 0, 0, 0), false);
  assert.equal(isFlyable(world, 0, -4, 0), false);
  assert.equal(isFlyable(world, 16.8, 0, 0), false, 'outer Blender coast is protected, not only the old walking boundary');
  assert.equal(isFlyable(world, 11.2, 4, -2.4), false, 'the full tree canopy is protected');
  assert.equal(isFlyable(world, -7.4, 5.8, -7.3), false);
  assert.equal(isFlyable(world, -7.4, 7, -7.3), true);
  assert.equal(isFlyable(world, 0, -8, 0), true);
  assert.equal(isFlyable(world, 0, 6.8, 0), true);
  assert.equal(isFlyable(world, 70, 40, 70), false);
  assert.equal(isFlightClear(world, 70, 40, 70), true, 'camera can safely extend beyond the flight fence');
  const game = make(); flyTo(game, { x: 0, y: -8, z: 0 });
  advance(game, 8, { lift: 1 }); assert.ok(game.state.player.y < -6.5, 'cannot fly through the underside');
  assert.ok(isFlyable(world, game.state.player.x, game.state.player.y, game.state.player.z));
  flyTo(game, { x: 0, y: 9, z: 22 }); advance(game, 90, { throttle: 1, boost: true });
  assert.ok(Math.hypot(game.state.player.x, game.state.player.z) <= FLIGHT.radius);
  advance(game, 30, { lift: 1 }); assert.ok(game.state.player.y <= FLIGHT.maxY);
});
test('right steering turns right from behind, boost accelerates, and release settles into a hover', () => {
  const normal = make(), boosted = make();
  advance(normal, 1, { throttle: 1 }); advance(boosted, 1, { throttle: 1, boost: true });
  assert.ok(boosted.state.distance > normal.state.distance * 1.7);
  const heading = normal.state.player.heading; advance(normal, .5, { turn: 1 }); assert.ok(normal.state.player.heading < heading);
  advance(boosted, .6, {}); assert.equal(boosted.state.player.speed, 0);
  const before = { ...boosted.state.player }; advance(boosted, 1, {});
  assert.deepEqual(boosted.state.player, before);
});
test('fixed steps and exact airborne continuation produce the same future', () => {
  const a = make(), b = make(), controls = { throttle: .7, turn: .2, lift: -.3, boost: true };
  for (let i = 0; i < 120; i++) a.advance(STEP, controls);
  for (let i = 0; i < 30; i++) b.advance(STEP * 4, controls);
  assert.deepEqual(a.snapshot(), b.snapshot());
  const restored = createLantern({ world }); assert.ok(restored.restore(a.snapshot()));
  assert.equal(restored.state.mode, 'paused'); restored.resume();
  for (let i = 0; i < 30; i++) { a.advance(STEP, { throttle: 1, turn: -.6, lift: .4 }); restored.advance(STEP, { throttle: 1, turn: -.6, lift: .4 }); }
  assert.deepEqual(a.snapshot(), restored.snapshot());
});
test('pause prevents movement, discoveries, and simulation time', () => {
  const game = make(); advance(game, .5, { throttle: 1, lift: 1 }); game.pause();
  const before = game.snapshot(); game.advance(1, { throttle: 1, turn: 1, lift: -1 }); assert.deepEqual(game.snapshot(), before);
  game.resume(); finishVillage(game); assert.ok(game.explore()); game.pause();
  assert.equal(game.state.resumeMode, 'exploring');
  const restored = make(); assert.ok(restored.restore(game.snapshot())); restored.resume(); assert.equal(restored.state.mode, 'exploring');
});
test('fireflies require three-dimensional proximity and every flight target is accessible', () => {
  for (const list of Object.values(targets)) for (const target of list) assert.ok(isFlyable(world, target.x, target.y, target.z), JSON.stringify(target));
  const game = make(), mote = targets.motes[0];
  flyTo(game, { ...mote, y: 13 }); assert.equal(game.state.collected.includes(mote.id), false);
  flyTo(game, mote); assert.ok(game.state.collected.includes(mote.id));
});
test('malformed positions, velocity, and impossible checkpoint progress are rejected', () => {
  const valid = make().snapshot();
  for (const value of [null, 7, [], {}, { ...valid, schema: 3 }, { ...valid, player: null }, ...[
    { x: 0, y: 0, z: 0 }, { x: 100 }, { y: NaN }, { speed: Infinity }, { verticalSpeed: 90 }, { bank: 9 },
  ].map(change => ({ ...valid, player: { ...valid.player, ...change } })), { ...valid, collected: [0, 0], charge: 2 }, { ...valid, charge: 99 }, { ...valid, lit: [0] }, { ...valid, mode: 'exploring' }, { ...valid, stars: 3 }, { ...valid, channel: { beacon: 0, progress: .5 } }]) assert.equal(parseLanternSave(value, world), null);
  const copy = parseLanternSave(valid, world); copy.player.x = 100; assert.notEqual(valid.player.x, 100);
});
test('walking checkpoints migrate without losing collected light, discoveries, or lanterns', () => {
  const legacy = { ...make().snapshot(), schema: 1, player: { ...world.spawn, heading: .7, moving: false }, collected: [0, 1, 2, 3], charge: 1, lit: [0], secrets: [1, 2], ticks: 600, distance: 20 };
  const migrated = parseLanternSave(legacy, world); assert.ok(migrated); assert.equal(migrated.schema, 2);
  assert.deepEqual(migrated.collected, legacy.collected); assert.deepEqual(migrated.lit, legacy.lit); assert.deepEqual(migrated.secrets, legacy.secrets);
  assert.equal(migrated.player.y, FLIGHT.targetY); assert.equal(migrated.player.x, legacy.player.x); assert.equal(migrated.player.speed, 0);
  assert.ok(parseLanternSave(migrated, world)); assert.ok(make().restore(legacy));
  const complete = { ...legacy, collected: Array.from({ length: 30 }, (_, id) => id), lit: [0, 1, 2, 3, 4], charge: 9, secrets: [0, 1, 2, 3, 4], stars: 3, mode: 'won', resumeMode: 'exploring' };
  assert.equal(parseLanternSave(complete, world).stars, 3);
});
test('long flight remains finite and every checkpoint remains valid', () => {
  const game = make();
  for (let i = 0; i < 12000; i++) {
    game.advance(STEP, { throttle: Math.sin(i / 170), turn: Math.sin(i / 79), lift: Math.cos(i / 101), boost: i % 100 < 30 });
    if (i % 120 === 0) assert.ok(parseLanternSave(game.snapshot(), world));
  }
  assert.ok(game.state.events.length <= 40); assert.ok(game.state.effects.length <= 50);
  const before = game.snapshot(); game.advance(NaN); game.advance(-2); assert.deepEqual(game.snapshot(), before);
  game.advance(STEP, null); assert.ok(parseLanternSave(game.snapshot(), world));
});
test('a restored island remains explorable and missing discoveries improve saved stars', () => {
  const game = make(); finishVillage(game, false);
  assert.equal(game.state.mode, 'won'); assert.ok(game.state.secrets.length < 5);
  game.state.events.length = 0; assert.ok(game.explore());
  for (const secret of targets.secrets) flyTo(game, secret);
  assert.equal(game.state.mode, 'exploring'); assert.equal(game.state.secrets.length, 5); assert.equal(game.state.stars, 3);
  assert.equal(game.state.events.some(event => event.type === 'won'), false);
  const restored = make(); assert.ok(restored.restore(game.snapshot())); restored.resume();
  assert.equal(restored.state.mode, 'exploring'); assert.equal(restored.state.stars, 3);
});
test('a partially charged sky lantern resumes without spending charge twice', () => {
  const game = make(), run = game.advance, stop = {};
  // Stop the legal pilot at the first actual charging frame; never edit state.
  game.advance = (seconds, control) => {
    for (let i = 0; i < Math.round(seconds / STEP); i++) {
      run(STEP, control);
      if (game.state.channel.progress > 0) throw stop;
    }
  };
  try { finishVillage(game, false); } catch (error) { if (error !== stop) throw error; }
  game.advance = run;
  assert.notEqual(game.state.channel.beacon, null);
  assert.ok(game.state.channel.progress > 0 && game.state.channel.progress < 1);
  const beacon = targets.beacons[game.state.channel.beacon], charge = game.state.charge;
  game.pause(); const saved = game.snapshot(), restored = make(); assert.ok(restored.restore(saved));
  game.resume(); restored.resume(); game.advance(1); restored.advance(1); game.advance(.2); restored.advance(.2);
  assert.deepEqual(game.snapshot(), restored.snapshot()); assert.ok(game.state.lit.includes(beacon.id));
  assert.equal(game.state.charge, charge - beacon.cost);
});

test('under-island guidance takes a safe coast route and survives reload on the return climb', () => {
  const game = make(); finishVillage(game, false); game.explore();
  for (const secret of targets.secrets.slice(0, 4)) flyTo(game, secret);
  flyTo(game, { x: 0, y: 9, z: 0 }); game.refreshGuide();
  assert.equal(game.state.guide.id, 4); assert.equal(game.state.guide.viaCoast, true);
  assert.equal(game.state.guide.instruction, 'Fly beyond the coast'); assert.ok(game.state.guide.z > 20);
  flyTo(game, { x: 0, y: 9, z: 22 }); game.refreshGuide();
  assert.equal(game.state.guide.instruction, 'Descend beside the island'); assert.equal(game.state.guide.y, -8);
  const restored = make(); assert.ok(restored.restore(game.snapshot()));
  assert.deepEqual(restored.state.guide, game.state.guide);
  flyTo(game, { x: 0, y: -6.7, z: 0 }); game.refreshGuide();
  assert.equal(game.state.guide.viaCoast, undefined, 'a ship already clear of the underside follows the memory instead of climbing into rock');
  flyTo(game, targets.secrets[4]); assert.equal(game.state.guide, null);
  const unfinished = make(); flyTo(unfinished, { x: 0, y: -8, z: 0 }); unfinished.refreshGuide();
  assert.equal(unfinished.state.guide.instruction, 'Fly beyond the coast'); assert.equal(unfinished.state.guide.y, -8);
  flyTo(unfinished, { x: 0, y: -8, z: 22 }); unfinished.refreshGuide();
  assert.equal(unfinished.state.guide.instruction, 'Climb beside the island');
  advance(unfinished, 1, { lift: 1 }); unfinished.refreshGuide();
  const clone = make(); assert.ok(clone.restore(unfinished.snapshot()));
  assert.deepEqual(clone.state.guide, unfinished.state.guide);
});
