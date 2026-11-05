import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestSupply, usefulSupply, supplyToReplace, supplyDescription, recoveryPreview } from '../survival-support.js';
import { upgradeChoices, upgradeComparison, restoreRanks, PERKS } from '../progression.js';
import { seededRandom, withWorldSeed } from '../world-seed.js';
import { createGame } from './harness.mjs';

const at=(type,x,age=0)=>({id:x+20,type,age,position:{x,y:0,z:0}});
const quiet=game=>{for(const enemy of game.zombies){enemy.position.set(45,0,45);enemy.userData.speed=0;}};
const advance=(env,seconds)=>{for(let t=0;t<seconds-.00001;t+=.05){quiet(env.game);env.step(Math.min(.05,seconds-t));}};

test('supply guidance prioritizes useful nearby items and critical medical care',()=>{
  const med=at('medkit',18),cell=at('overdrive',3),far=at('medkit',40),p={x:0,z:0};
  assert.equal(usefulSupply(cell,100,10),false);
  assert.equal(nearestSupply([med,cell,far],p,30,0).entry,med);
  assert.equal(nearestSupply([med,cell],p,80,0).entry,cell);
  assert.equal(nearestSupply([med,cell],p,100,10),null);
  assert.equal(supplyDescription({entry:med,distance:18},p,0),'MEDKIT · 18m right');
  med.age=42;assert.match(supplyDescription({entry:med,distance:18},p,Math.PI),/left · 3s left/);
});

test('a full supply pool sacrifices unneeded items before useful medical care',()=>{
  const med=at('medkit',1,40),cell=at('overdrive',2,5);
  assert.equal(supplyToReplace([med,cell],20,10),cell);
  assert.equal(supplyToReplace([med,cell],100,0),med);
  assert.equal(supplyToReplace([at('medkit',1,3),med],20,0),med);
  assert.equal(supplyToReplace([med,at('overdrive',3,12),cell],20,0).type,'overdrive','critical medical care survives a pool of useful energy cells');
  assert.equal(supplyToReplace([],20,0),null);
});

test('recovery previews match next encounters and campaign boundaries',()=>{
  assert.match(recoveryPreview(1,1),/CROSS FIRE · 10 HOSTILES/);
  assert.match(recoveryPreview(2,1),/RUNNER RUSH · 13 HOSTILES · ELITE/);
  assert.match(recoveryPreview(4,2),/COMMANDER · 19 HOSTILES · COMMANDER/);
  assert.match(recoveryPreview(5,1),/EMBER ISLE · NEXT: FIRST CONTACT · 7 HOSTILES/);
  assert.match(recoveryPreview(5,2),/ENDLESS AVAILABLE/);
  assert.match(recoveryPreview(9,2),/COMMANDER · 34 HOSTILES/);
});

test('upgrade offers include three available roles and show actual resulting values',()=>{
  for(let seed=0;seed<30;seed++){
    const ranks=restoreRanks(),choices=upgradeChoices(ranks,seededRandom(seed));
    assert.equal(new Set(choices.map(c=>c.category)).size,3);
    assert.equal(new Set(choices.map(c=>c.id)).size,3);
  }
  const ranks=restoreRanks();
  assert.equal(upgradeComparison(PERKS[0],ranks),'Damage 1.00× → 1.40×');
  assert.equal(upgradeComparison(PERKS.find(p=>p.id==='armor'),ranks),'Damage taken 100% → 90%');
  assert.match(upgradeComparison(PERKS.find(p=>p.id==='recovery'),ranks),/25 → 35 HP · medkits 30 → 36 HP/);
  assert.match(upgradeComparison(PERKS.find(p=>p.id==='magnet'),ranks),/1.9 → 2.9 m/);
});

test('seeded construction is repeatable and never changes later combat randomness',()=>{
  const original=Math.random;
  const build=()=>Array.from({length:20},()=>Math.random());
  assert.deepEqual(withWorldSeed(4211,build),withWorldSeed(4211,build));
  assert.notDeepEqual(withWorldSeed(4211,build),withWorldSeed(9114,build));
  assert.equal(Math.random,original);
  assert.throws(()=>withWorldSeed(1,()=>{throw Error('construction failed');}));
  assert.equal(Math.random,original);
});

test('a real Overdrive cell remains while powered fire is already stronger',async t=>{
  const env=await createGame();t.after(()=>env.close());env.start();
  const field=env.game.field.position;env.game.setPos(field[0],field[2]);advance(env,5.1);
  assert.ok(env.game.progression.overdrive>9);
  const cell=env.game.spawnDrop('overdrive',0);assert.ok(cell);advance(env,.2);
  assert.ok(env.game.progression.drops.some(d=>d.id===cell));
  for(let i=0;i<60&&env.game.progression.drops.some(d=>d.id===cell);i++)advance(env,.05);
  assert.ok(!env.game.progression.drops.some(d=>d.id===cell));
  assert.ok(env.game.progression.overdrive<=8&&env.game.progression.overdrive>7.9);
});

test('save and return preserves a live battle and a pending upgrade without ending either',async t=>{
  const env=await createGame();t.after(()=>env.close());env.start();advance(env,2);
  env.game.hp=54;env.game.score=321;env.game.pause();
  assert.equal(env.game.saveAndReturn(),true);assert.equal(env.game.mode,'menu');
  assert.equal(env.game.continueRun(),true);assert.equal(env.game.hp,54);assert.equal(env.game.score,321);
  assert.equal(env.window.document.getElementById('encounterName').textContent,env.game.encounter.name);
  env.game.clearWave();env.step(4.3);assert.equal(env.game.mode,'upgrade');
  const offered=env.game.progression.choices;assert.equal(env.game.saveAndReturn(),true);
  assert.equal(env.game.continueRun(),true);assert.equal(env.game.mode,'upgrade');assert.deepEqual(env.game.progression.choices,offered);
});

test('saved world seeds preserve scenery colliders and outposts after a differently seeded reload',async t=>{
  for(const level of [1,2]){
    const env=await createGame({level,seed:4211});t.after(()=>env.close());env.start();advance(env,.2);env.game.pause();env.game.save();
    const raw=env.window.localStorage.getItem('games:save:soldier');
    const resumed=await createGame({level,seed:9114,storage:{'games:save:soldier':raw}});t.after(()=>resumed.close());
    assert.equal(resumed.game.worldSeed,env.game.worldSeed);
    assert.equal(JSON.stringify(resumed.game.colliders),JSON.stringify(env.game.colliders));
    const stations=g=>g.activities.world.stations.map(s=>[s.id,s.x,s.z]);
    assert.equal(JSON.stringify(stations(resumed.game)),JSON.stringify(stations(env.game)));
    assert.equal(resumed.game.continueRun(),true);
  }
});

test('uplink edge grace holds a brief misstep and explains airborne capture blocking',async t=>{
  const env=await createGame();t.after(()=>env.close());env.start();
  const p=env.game.field.position;env.game.setPos(p[0],p[2]);advance(env,1);
  const partial=env.game.field.progress;env.game.setPos(p[0]+7,p[2]);advance(env,.2);
  assert.equal(env.game.field.progress,partial);advance(env,.5);assert.ok(env.game.field.progress<partial);
  env.game.setPos(p[0],p[2]);env.game.setAlt(env.game.alt+3);env.step(.05);
  assert.equal(env.game.field.reason,'altitude');assert.equal(env.window.document.getElementById('fieldStatus').textContent,'LAND INSIDE THE RING');
});

test('upgrade number shortcuts cannot repeat or consume an old held digit',async t=>{
  const env=await createGame();t.after(()=>env.close());env.start();env.game.clearWave();env.step(4.05);
  assert.equal(env.game.mode,'upgrade');
  env.key('Digit2');assert.equal(env.game.mode,'upgrade','freshly revealed cards reject the opening gesture');
  env.step(.3);env.key('Digit2');assert.equal(env.game.mode,'play');assert.equal(env.game.wave,2);
  const ranks=Object.values(env.game.progression.ranks).reduce((a,b)=>a+b,0);assert.equal(ranks,1);
  env.key('Digit2');assert.equal(Object.values(env.game.progression.ranks).reduce((a,b)=>a+b,0),ranks);
});
