import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from './harness.mjs';
import { createEncounter, rateOperation } from '../encounters.js';

const fire = (env, down=true) => down
  ? env.window.document.querySelector('canvas').dispatchEvent(new env.window.MouseEvent('mousedown',{button:0,bubbles:true}))
  : env.window.dispatchEvent(new env.window.MouseEvent('mouseup'));
const offer = env => { env.game.clearWave(); env.step(4.2); assert.equal(env.game.mode,'upgrade'); };

test('Encounter roster introduces ranged pressure and distinct rush/heavy waves', () => {
  const waves=Array.from({length:5},(_,i)=>createEncounter(i+1));
  assert.equal(new Set(waves.map(w=>w.id)).size,5);
  assert.ok(!waves[0].roster.includes('spitter'),'first deployment teaches basic movement before ranged zones');
  assert.equal(waves[1].roster.filter(t=>t==='spitter').length,2);
  assert.ok(waves[2].roster.filter(t=>t==='runner').length>=6);
  assert.ok(waves[3].roster.filter(t=>t==='brute').length>=5);
  assert.equal(waves[4].elite,'commander');
  for(const wave of waves)assert.equal(wave.roster.length,4+wave.wave*3);
  assert.ok(createEncounter(1,2).roster.includes('fiery'));
  assert.equal(createEncounter(10,2).elite,'commander');
});

test('Real kills earn momentum score bonuses; incoming damage ends the current chain', async t => {
  const env=await createGame();t.after(()=>env.close());env.start();const {game,step}=env;
  let expected=0;
  for(let i=0;i<3;i++){
    for(const z of game.zombies){z.userData.speed=0;z.position.set(45,0,45);}
    game.spawnNear();const enemy=game.zombies.at(-1);enemy.userData.speed=0;
    const base=enemy.userData.type==='brute'?30:enemy.userData.type==='fiery'?20:10;
    fire(env);for(let frame=0;frame<60&&!enemy.userData.dead;frame++)step(.025);fire(env,false);
    assert.ok(enemy.userData.dead,'actual rifle hits kill each target');
    expected+=base*(i===2?2:1);assert.equal(game.score,expected);step(.05);
  }
  assert.equal(game.momentum.chain,3);assert.equal(game.momentum.multiplier,2);
  assert.equal(env.window.document.getElementById('momentumMultiplier').textContent,'×2');
  game.damage(1);assert.equal(game.momentum.chain,0);assert.equal(game.momentum.best,3);
  assert.equal(game.momentum.bestMultiplier,2);
  game.returnToMenu();assert.equal(game.momentum.best,0);
});

test('Momentum timer freezes in pause and upgrade choice, then expires in combat', async t => {
  const env=await createGame();t.after(()=>env.close());env.start();const {game,step}=env;
  game.spawnNear();const target=game.zombies.at(-1);target.userData.speed=0;fire(env);
  for(let frame=0;frame<60&&!target.userData.dead;frame++)step(.025);fire(env,false);
  assert.equal(game.momentum.chain,1);game.pause();const saved=game.momentum.time;step(10);assert.equal(game.momentum.time,saved);
  game.resume();offer(env);const recovery=game.momentum.time;step(10);assert.equal(game.momentum.time,recovery);assert.equal(game.momentum.chain,1);
  env.chooseUpgrade();step(1);assert.ok(game.momentum.time<recovery);step(7);assert.equal(game.momentum.chain,0);assert.equal(game.momentum.best,1);
});

test('Encounter progression spawns its real ranged archetype and updates weather phase', async t => {
  const env=await createGame();t.after(()=>env.close());env.start();offer(env);env.chooseUpgrade();
  assert.equal(env.game.encounter.id,'crossfire');env.step(1.6);
  assert.equal(env.game.zombies[0].userData.type,'spitter');
  assert.equal(env.window.document.getElementById('encounterName').textContent,'CROSS FIRE');
  assert.ok(env.game.weather,'weather controller exists for phase progression');
});

test('Completing Ember presents victory and offers a guarded endless continuation', async t => {
  const env=await createGame({level:2});t.after(()=>env.close());env.start();const {game,window,click,step}=env;
  for(let wave=1;wave<=5;wave++){assert.equal(game.wave,wave);offer(env);env.chooseUpgrade();}
  assert.equal(game.mode,'over');assert.equal(game.campaignComplete,true);assert.ok(window.document.body.classList.contains('victory'));
  assert.equal(window.document.getElementById('debriefTitle').textContent,'Operation complete.');
  assert.ok(!window.document.getElementById('endlessBtn').classList.contains('hide'));
  assert.match(window.document.getElementById('finalRank').textContent,/^[SABC]$/);
  const build=JSON.stringify(game.progression.ranks);click('endlessBtn');click('endlessBtn');
  assert.equal(game.mode,'play');assert.equal(game.wave,6);assert.equal(JSON.stringify(game.progression.ranks),build);
  assert.equal(game.campaignComplete,true);assert.equal(window.document.body.classList.contains('victory'),false);
  game.damage(1000);assert.equal(game.mode,'over');assert.ok(window.document.getElementById('endlessBtn').classList.contains('hide'));
  click('restartBtn');step(.05);assert.equal(game.campaignComplete,false);assert.equal(game.wave,1);
});

test('Operation rating rewards combat, accuracy and optional objectives without requiring perfection', () => {
  assert.equal(rateOperation().grade,'C');
  assert.equal(rateOperation({kills:130,elites:4,uplinks:7,shots:400,hits:280,chain:12,completed:true}).grade,'S');
  const modest=rateOperation({kills:30,elites:1,uplinks:2,shots:100,hits:50,chain:4});
  const improved=rateOperation({kills:65,elites:2,uplinks:4,shots:100,hits:70,chain:8});
  assert.ok(improved.points>modest.points);assert.ok(improved.points<100);
});
