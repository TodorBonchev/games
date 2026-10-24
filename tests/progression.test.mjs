import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from './harness.mjs';
import { restoreRanks, upgradeChoices } from '../progression.js';

const fire = (env, down = true) => down
  ? env.window.document.querySelector('canvas').dispatchEvent(new env.window.MouseEvent('mousedown', { button: 0, bubbles: true }))
  : env.window.dispatchEvent(new env.window.MouseEvent('mouseup'));
const clearAndOffer = env => { env.game.clearWave(); env.step(4.15); assert.equal(env.game.mode, 'upgrade'); };

test('Upgrade choices freeze the run, apply exactly once, and reset on redeployment', async t => {
  const env = await createGame({ touch: true }); t.after(() => env.close()); env.start();
  const { game, window, step, key } = env;
  clearAndOffer(env);
  const choices = game.progression.choices;
  assert.equal(choices.length, 3);
  assert.equal(new Set(choices.map(choice => choice.id)).size, 3);
  assert.ok(!window.document.getElementById('upgradePanel').classList.contains('hide'));
  const frozen = { time: game.time, seconds: game.combat.seconds, pos: [...game.pos], hp: game.hp };
  key('KeyW'); key('Space'); key('KeyP'); step(3);
  assert.deepEqual({ time: game.time, seconds: game.combat.seconds, pos: [...game.pos], hp: game.hp }, frozen);
  assert.equal(game.mode, 'upgrade', 'pause hotkey cannot bypass the reward choice');
  env.chooseUpgrade(1);
  window.document.querySelector('.upgrade-card[data-choice="1"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(game.mode, 'play'); assert.equal(game.wave, 2);
  assert.equal(game.progression.ranks[choices[1].id], 1);
  assert.equal(Object.values(game.progression.ranks).reduce((a, b) => a + b, 0), 1, 'duplicate activation cannot grant two upgrades');
  step(.1);
  assert.equal(game.pos[0], frozen.pos[0]); assert.equal(game.pos[2], frozen.pos[2]);
  game.damage(1000); env.click('restartBtn'); step(.1);
  assert.equal(Object.values(game.progression.ranks).reduce((a, b) => a + b, 0), 0);
  clearAndOffer(env); env.click('upgradeMenuBtn');
  assert.equal(game.mode, 'menu'); assert.equal(game.progression.choices.length, 0);
});

test('Picking an upgrade after window blur keeps the next wave paused', async t => {
  const env = await createGame(); t.after(() => env.close()); env.start();
  clearAndOffer(env);
  env.window.dispatchEvent(new env.window.Event('blur'));
  env.chooseUpgrade();
  assert.equal(env.game.mode, 'play'); assert.ok(env.game.paused);
  const time = env.game.time; env.step(1); assert.equal(env.game.time, time);
  env.window.dispatchEvent(new env.window.Event('focus'));
  env.click('resumeBtn'); assert.ok(!env.game.paused);
});

test('Carried perks affect real bullet damage, incoming damage, healing and collection radius', async t => {
  const env = await createGame({ level: 2, go: true, session: { szCarry: JSON.stringify({ ranks: { damage: 1, armor: 1, recovery: 1, magnet: 1 } }) } });
  t.after(() => env.close()); env.click('skipBtn'); env.step(.1);
  const { game, step } = env;
  game.spawnNear(); const enemy = game.zombies.at(-1);
  enemy.userData.speed = 0; enemy.userData.hp = 100;
  fire(env); step(.8); fire(env, false);
  assert.ok(game.combat.hits > 0);
  assert.ok(Math.abs((100 - enemy.userData.hp) - game.combat.hits * 1.4) < .00001, 'damage upgrade changes actual raycast hits');
  game.hp = 100; game.damage(20); assert.equal(game.hp, 82);
  game.hp = 30; game.clearWave(); step(.05); assert.equal(game.hp, 65, 'field medic improves wave recovery');
  assert.equal(game.progression.bonuses.pickupRadius, 2.9);
  game.spawnDrop('medkit', 0); step(.05); assert.equal(game.hp, 100, 'upgraded medkit heals up to36 HP');
});

test('Supplies reward moving, keep full-health medkits, and freeze Overdrive outside combat', async t => {
  const env = await createGame(); t.after(() => env.close()); env.start();
  const { game, step } = env;
  game.spawnDrop('medkit', 0); step(.1);
  assert.equal(game.progression.drops.length, 1, 'full-health player leaves a useful medkit on the ground');
  game.hp = 40; step(.05); assert.equal(game.hp, 70); assert.equal(game.progression.drops.length, 0);
  game.spawnDrop('overdrive', 4); step(.05);
  assert.equal(game.progression.overdrive, 0, 'distant supplies need collecting');
  const supply = game.progression.drops[0]; assert.ok(supply);
  game.setPos(supply.position[0], supply.position[2]); step(.05);
  assert.ok(game.progression.overdrive > 7.9); assert.equal(game.progression.drops.length, 0);
  game.pause(); const power = game.progression.overdrive; step(2); assert.equal(game.progression.overdrive, power);
  game.resume(); game.clearWave(); step(.05); const recoveryPower = game.progression.overdrive;
  step(4.2); assert.equal(game.mode, 'upgrade'); assert.equal(game.progression.overdrive, recoveryPower);
  step(3); assert.equal(game.progression.overdrive, recoveryPower);
  env.chooseUpgrade(); step(.2); assert.ok(game.progression.overdrive < recoveryPower);
  game.rjCD = 0; game.rejump(); const airPower = game.progression.overdrive; step(1);
  assert.equal(game.progression.overdrive, airPower, 'insertion does not waste a power-up');
  game.returnToMenu(); assert.equal(game.progression.drops.length, 0); assert.equal(game.progression.overdrive, 0);
});

test('Pickup storage stays bounded and old supplies expire', async t => {
  const env = await createGame(); t.after(() => env.close()); env.start();
  const { game, step } = env;
  for (let i = 0; i < 30; i++) game.spawnDrop('medkit', 0);
  assert.equal(game.progression.drops.length, 6);
  for (let seconds = 0; seconds < 47; seconds++) {
    game.hp = 100;
    for (const enemy of game.zombies) enemy.userData.speed = 0;
    step(1);
  }
  assert.equal(game.mode, 'play');
  assert.equal(game.progression.drops.length, 0, 'expired supplies release their pool slots');
});

test('Elites spawn at milestones and their armor still accepts bullets', async t => {
  const env = await createGame(); t.after(() => env.close()); env.start();
  const { game, step } = env;
  clearAndOffer(env); env.chooseUpgrade(); clearAndOffer(env); env.chooseUpgrade();
  assert.equal(game.wave, 3); step(1.6);
  assert.equal(game.progression.elites.length, 1);
  assert.equal(game.progression.elites[0].name, 'HOLLOW GUARD');
  const elite = game.zombies.find(enemy => enemy.userData.elite);
  assert.ok(elite.userData.maxHp > 10);
  elite.userData.speed = 0; elite.userData.hp = 1;
  game.setView(0); elite.position.copy(game.player.position); elite.position.z -= 5;
  fire(env); step(1.2); fire(env, false);
  assert.ok(elite.userData.dead, 'armored elite is vulnerable to aimed shots');
  assert.equal(game.progression.eliteKills, 1);
  assert.ok(game.score >= 120);
  assert.equal(game.progression.drops.length, 2, 'elite drops medkit and Overdrive');
});

test('Commander slam has a warning, respects pause, can be jumped and damages only once', async t => {
  const env = await createGame({ seed: 4211 }); t.after(() => env.close()); env.start();
  const { game, step, key } = env;
  game.setPos(-39, 12);
  const boss = game.spawnElite(true); boss.userData.speed = 0;
  boss.position.copy(game.player.position); boss.position.z -= 3;
  boss.userData.slamCooldown = 0; step(.02);
  assert.ok(boss.userData.slamWind > .95); assert.equal(game.hp, 100);
  step(.65); const wind = boss.userData.slamWind;
  game.pause(); step(1); assert.equal(boss.userData.slamWind, wind); game.resume();
  key('Space'); key('Space', false); step(.4); assert.equal(game.hp, 100, 'well-timed jump avoids the slam');
  step(.4); boss.userData.slamCooldown = 0; boss.userData.strike = 0;
  step(.02); assert.ok(boss.userData.slamWind > .95);
  step(1.1); assert.equal(game.hp, 68, 'standing inside the warning receives one 32 HP slam');
  step(.2); assert.equal(game.hp, 68, 'impact flash does not repeatedly deal damage');
  boss.userData.slamCooldown = 0; boss.userData.strike = 0; step(.02);
  game.setPos(game.pos[0] + 8, game.pos[2]); step(1.1); assert.equal(game.hp, 68, 'leaving the danger ring avoids damage');
});

test('Maxed builds always offer useful choices and reserve armor absorbs damage', async t => {
  const ranks = { damage: 3, cadence: 3, speed: 3, armor: 3, recovery: 3, magnet: 3 };
  assert.deepEqual(upgradeChoices(ranks).map(choice => choice.id), ['shield', 'overdrive', 'bounty']);
  assert.deepEqual(restoreRanks({ damage: 90, armor: -1, magnet: 2.9, speed: Infinity }), { damage: 3, cadence: 0, speed: 0, armor: 0, recovery: 0, magnet: 2 });
  const env = await createGame({ level: 2, go: true, session: { szCarry: JSON.stringify({ ranks }) } });
  t.after(() => env.close()); env.click('skipBtn'); env.step(.1);
  clearAndOffer(env); env.chooseUpgrade(0); assert.equal(env.game.progression.shield, 30);
  env.game.damage(20); assert.equal(env.game.hp, 100); assert.equal(env.game.progression.shield, 16);
  env.game.damage(1000); env.click('restartBtn');
  assert.equal(env.game.progression.shield, 0);
  assert.equal(Object.values(env.game.progression.ranks).reduce((a, b) => a + b, 0), 0);
});

test('Fire-rate upgrades still increase shot cadence at 20 FPS without an idle burst', async t => {
  const shots = [];
  for (const cadence of [0, 3]) {
    const env = await createGame({ level: 2, go: true, session: { szCarry: JSON.stringify({ ranks: { cadence } }) } });
    t.after(() => env.close()); env.click('skipBtn'); env.step(.1);
    env.game.clearWave(); env.step(.05);
    env.step(.5, 20); fire(env); env.step(2, 20); fire(env, false);
    shots.push(env.game.combat.shots);
  }
  assert.ok(shots[0] >= 19 && shots[0] <= 21, `base rate remains around 10 Hz: ${shots[0]} shots`);
  assert.ok(shots[1] >= shots[0] + 6 && shots[1] <= 30, `cadence upgrade works at 20 FPS: ${shots.join(' → ')}`);
});
