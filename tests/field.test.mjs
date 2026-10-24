import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from './harness.mjs';

const quiet = game => {
  for (const enemy of game.zombies) { enemy.userData.speed = 0; enemy.position.set(45, 0, 45); }
};
function advance(env, seconds) {
  for (let t = 0; t < seconds - .0001; t += .1) { quiet(env.game); env.step(Math.min(.1, seconds - t)); }
}

test('Uplink capture rewards holding the zone once and resets with the run', async t => {
  const env = await createGame(); t.after(() => env.close()); env.start();
  const { game } = env, before = game.score, station = game.field;
  assert.ok(station.active);
  assert.ok(Math.hypot(game.pos[0] - station.position[0], game.pos[2] - station.position[2]) > 8);
  game.setPos(station.position[0], station.position[2]);
  advance(env, 4); assert.equal(game.field.captured, false); assert.ok(game.field.progress > 3.9);
  advance(env, 1.2); assert.equal(game.field.captured, true); assert.equal(game.field.completed, 1);
  assert.equal(game.score, before + 125); assert.equal(game.progression.shield, 20);
  assert.ok(game.progression.overdrive > 9 && game.progression.overdrive <= 10);
  advance(env, 3); assert.equal(game.score, before + 125, 'captured station cannot award twice');
  game.returnToMenu(); assert.equal(game.field.active, false); assert.equal(game.field.completed, 0);
  env.start(); assert.equal(game.field.captured, false); assert.equal(game.field.progress, 0);
});

test('Uplinks respect contesting, leaving the ring, pause and helicopter insertion', async t => {
  const env = await createGame(); t.after(() => env.close()); env.start();
  const { game, step } = env, station = game.field.position;
  game.setPos(station[0], station[2]); advance(env, 1);
  const partial = game.field.progress; game.pause(); step(2); assert.equal(game.field.progress, partial);
  game.resume(); game.spawnNear(); const enemy = game.zombies.at(-1);
  enemy.position.copy(game.player.position); enemy.position.x += 3; enemy.userData.speed = 0;
  step(.2); assert.equal(game.field.contested, true); assert.equal(game.field.progress, partial);
  enemy.position.set(45, 0, 45); game.setPos(station[0] + 7, station[2]); step(.5);
  assert.ok(game.field.progress < partial, 'leaving loses capture gradually');
  game.setPos(station[0], station[2]); game.rjCD = 0; game.rejump();
  const airborne = game.field.progress; step(2); assert.equal(game.field.progress, airborne);
  env.click('skipBtn'); game.clearWave(); step(.05); step(4.2);
  assert.equal(game.mode, 'upgrade'); const frozen = game.field.progress; step(2); assert.equal(game.field.progress, frozen);
  env.chooseUpgrade(); assert.equal(game.field.progress, 0, 'new wave places a fresh uplink');
});

test('Uplink rewards and ten-second Overdrive carry to Ember', async t => {
  const palm = await createGame(); t.after(() => palm.close()); palm.start();
  const at = palm.game.field.position; palm.game.setPos(at[0], at[2]); advance(palm, 5.1);
  assert.equal(palm.game.field.completed, 1); palm.game.winLevel();
  const carry = palm.window.sessionStorage.getItem('szCarry');
  const ember = await createGame({ level: 2, go: true, session: { szCarry: carry } }); t.after(() => ember.close());
  assert.equal(ember.game.field.completed, 1); assert.equal(ember.game.progression.shield, 20);
  assert.ok(ember.game.progression.overdrive > 9);
  ember.click('skipBtn'); ember.step(.05);
  assert.equal(ember.game.field.active, true); assert.equal(ember.game.field.captured, false);
});

test('Stations use safe interior sites across both islands and reuse their scene meshes', async t => {
  for (const level of [1, 2]) for (const seed of [4211, 9114, 572]) {
    const env = await createGame({ level, seed }); t.after(() => env.close()); env.start();
    const { game } = env;
    const root = game.scene.getObjectByName('field-uplink'), geometries = root.children.map(mesh => mesh.geometry);
    assert.equal(root.children.length, 3);
    for (let wave = 1; wave <= 4; wave++) {
      const at = game.field.position; assert.ok(game.field.active, `island${level}, seed${seed}, wave${wave} has an objective`);
      for (const c of game.colliders.circles) assert.ok(Math.hypot(c.x - at[0], c.z - at[2]) >= c.r + .9);
      for (const b of game.colliders.boxes) assert.ok(Math.abs(b.x - at[0]) >= b.hx + .9 || Math.abs(b.z - at[2]) >= b.hz + .9);
      assert.ok(at[1] > .65); assert.deepEqual(root.children.map(mesh => mesh.geometry), geometries);
      game.clearWave(); env.step(4.3); env.chooseUpgrade();
    }
  }
});
