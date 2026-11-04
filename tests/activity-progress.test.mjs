import test from 'node:test';
import assert from 'node:assert/strict';
import { freshProgress, readProgress, writeProgress, parseProgress, completeActivity, SAVE_KEY } from '../activities/progress.js';
import { SAVE_KEY as VOYAGE_KEY } from '../voyage/progress.js';
const storage = (entries = {}) => { const data = new Map(Object.entries(entries));return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)}; };
test('first restoration rewards once across stages, replays, and reloads',()=>{
  const save=storage(),progress=freshProgress();assert.equal(completeActivity(progress,'upside',1),true);
  assert.equal(completeActivity(progress,'upside',2),false);assert.equal(completeActivity(progress,'upside',1),false);
  assert.equal(progress.levels.upside,2);assert.equal(progress.plays.upside,3);assert.ok(writeProgress(progress,save));
  const restored=readProgress(save);assert.deepEqual(restored,progress);assert.equal(completeActivity(restored,'upside',4),false);
  assert.equal(restored.levels.upside,4);assert.equal(completeActivity(restored,'upside',5),false);assert.equal(completeActivity(restored,'unknown'),false);
});
test('Wonderwake accomplishments and interrupted activities migrate without overwriting source',()=>{
  const old=JSON.stringify({version:1,completed:['dewfall','burrow-banquet','moss-flip'],chapter:1,active:{id:'pondpost'},checkpoints:{pondpost:{id:'pondpost',seed:121,state:{schema:1,id:'pondpost',level:2,engine:{a:1}}}},plays:{dewfall:2}}),save=storage({[VOYAGE_KEY]:old});
  const p=readProgress(save);assert.deepEqual(p.completed,['dewfall','burrow-banquet','moss-flip']);assert.equal(p.checkpoints.pondpost.level,2);assert.equal(p.plays.dewfall,2);assert.ok(writeProgress(p,save));assert.equal(save.getItem(VOYAGE_KEY),old);assert.equal(completeActivity(p,'dewfall'),false);
});
test('untrusted optional progress is sanitized and malformed top-level saves recover',()=>{
  assert.equal(parseProgress({version:1,completed:['made-up']}),null);const p=parseProgress({version:1,completed:['upside','upside'],target:'evil',levels:{upside:900},plays:{upside:-1},checkpoints:{upside:{id:'upside',level:0,seed:NaN,state:[]}}});
  assert.deepEqual(p.completed,['upside']);assert.deepEqual(p.levels,{});assert.deepEqual(p.checkpoints,{});assert.equal(p.target,null);
  assert.deepEqual(readProgress(storage({[SAVE_KEY]:'{broken'})),freshProgress());
});
test('full or blocked storage leaves in-memory expedition usable',()=>{
  const p=freshProgress(),blocked={getItem(){throw Error('blocked');},setItem(){throw Error('full');}};assert.deepEqual(readProgress(blocked),freshProgress());assert.ok(completeActivity(p,'prism'));assert.equal(writeProgress(p,blocked),false);assert.deepEqual(p.completed,['prism']);
});

test('denied access to the browser storage property cannot break startup',()=>{
  const old=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('SecurityError');}});
  try{assert.deepEqual(readProgress(),freshProgress());assert.equal(writeProgress(freshProgress()),false);}
  finally{if(old)Object.defineProperty(globalThis,'localStorage',old);else delete globalThis.localStorage;}
});
