import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalSession,LOCAL_SAVE_KEY,parseLocalSave,readLocalSave} from '../selva/engine/session.mjs';
import {getListings} from '../selva/engine/ah.mjs';
import {tryEmit,computeGearStats} from '../selva/engine/ledger.mjs';
import {getProgress} from '../selva/engine/progression.mjs';

function store(){const data=new Map();return{data,getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};}
function boot(t,options={}){const messages=[],storage=options.storage||store(),local=createLocalSession({name:'Solo pilgrim',storage,onMessage:message=>messages.push(message),...options});local.start();t.after(()=>local.dispose());return{local,messages,storage};}

test('local startup owns one player, equipped starter gear, all authored worlds and a solo Giants trial',t=>{
  const{local,messages}=boot(t,{marketSeed:8});
  assert.equal(local.playerId,'solo-pilgrim');assert.equal(local.player.inventory.length,2);assert.ok(local.player.inventory.every(item=>item.equipSlot));
  assert.equal(local.player.ash,25000);assert.equal(local.player.pendingAsh,0);
  const snapshot=messages.find(message=>message.type==='snapshot').room;
  assert.equal(snapshot.players.length,1);assert.equal(snapshot.you.id,local.playerId);assert.equal(snapshot.title,'Dark Wood');
  assert.equal(local.world.rooms.size,6);
  const trial=local.world.roomFor('inferno_31');assert.equal(trial.canto.role,'combat');assert.ok([...trial.entities.values()].filter(entity=>entity.kind==='mob').length>=3);assert.ok([...trial.entities.values()].some(entity=>entity.kind==='boss'));
  assert.ok(!snapshot.entities.some(entity=>/PvP|off-chain/.test(entity.name+' '+entity.hint)));
});

test('normal gate travel still requires reaching the road and single-player combat uses actual damage and XP',async t=>{
  const{local,messages}=boot(t);
  await local.dispatch({type:'travel',toCanto:'inferno_05',bypassGates:true});assert.equal(local.room.cantoId,'inferno_01','a normal run cannot bypass the physical gate');
  const gate=[...local.room.entities.values()].find(entity=>entity.toCanto==='inferno_05');local.session.x=gate.x;local.session.y=gate.y;
  await local.dispatch({type:'interact',targetId:gate.id});assert.equal(local.room.cantoId,'inferno_05');
  const mob=[...local.room.entities.values()].find(entity=>entity.kind==='mob'&&!entity.champion&&entity.hp>40);local.session.x=mob.x;local.session.y=mob.y-1;
  const before=mob.hp;await local.dispatch({type:'attack',targetId:mob.id});assert.ok(mob.hp<before,'original room attack reduces foe HP');
  const beforeXp=local.progress.xp;mob.hp=1;local.session.x=mob.x;local.session.y=mob.y-1;local.session.atkReadyAt=0;await local.dispatch({type:'attack',targetId:mob.id});local.tick(.1);assert.ok(local.progress.xp>beforeXp,'actual kill grants XP');
  assert.ok(messages.some(message=>message.type==='combat'));assert.equal(local.room.sessions.size,1);
});

test('generated gear purchases, rolled combat stats, skills, flags, stash and location survive a fresh local launch',async t=>{
  const storage=store();const first=boot(t,{storage,debug:true,marketSeed:17}).local;
  const weapon=getListings().find(lot=>lot.item.slot==='weapon');await first.dispatch({type:'ah_buy',listingId:weapon.id});await first.dispatch({type:'equip',itemId:weapon.item.id});
  await first.dispatch({type:'dev_grant_xp',amount:1500});await first.dispatch({type:'skill_learn',skillId:'ferocia'});
  first.player.spokeToGuide=true;first.player.firstClears.add('inferno_05');
  const extra=getListings().find(lot=>lot.item.slot==='helm');await first.dispatch({type:'ah_buy',listingId:extra.id});
  first.player.stash.push(first.player.inventory.splice(first.player.inventory.findIndex(item=>item.id===extra.item.id),1)[0]);
  first.session.x=66;first.session.y=71;first.session.hp=111;first.save();
  const expected={ash:first.player.ash,xp:first.progress.xp,ranks:structuredClone(first.progress.ranks),stats:computeGearStats(first.player),ids:first.player.inventory.map(item=>item.id),offerIds:getListings().map(lot=>lot.id)};
  first.dispose();
  const second=boot(t,{storage,marketSeed:18}).local;
  assert.equal(second.restored,true);assert.equal(second.player.ash,expected.ash);assert.equal(second.progress.xp,expected.xp);assert.deepEqual(second.progress.ranks,expected.ranks);assert.deepEqual(computeGearStats(second.player),expected.stats);
  assert.deepEqual(second.player.inventory.map(item=>item.id),expected.ids);assert.equal(second.player.stash[0].id,extra.item.id);assert.ok(second.player.firstClears.has('inferno_05'));assert.equal(second.player.spokeToGuide,true);
  assert.equal(second.session.x,66);assert.equal(second.session.y,71);assert.equal(second.session.hp,111);
  assert.ok(getListings().every(lot=>!expected.offerIds.includes(lot.id)),'offers refresh without losing owned gear');
  assert.deepEqual(second.player.inventory.find(item=>item.id===weapon.item.id).rolledStats,weapon.item.rolledStats);
});

test('reward events grant spendable local Ash and first-clear and daily rewards cannot be replayed',t=>{
  const{local}=boot(t);const start=local.player.ash;
  assert.equal(tryEmit(local.playerId,'FirstClear',{cantoId:'inferno_05'}).payoutAsh,1500);assert.equal(local.player.ash,start+1500);
  assert.equal(tryEmit(local.playerId,'FirstClear',{cantoId:'inferno_05'}).ok,false);
  assert.equal(tryEmit(local.playerId,'DailyQuest').payoutAsh,500);assert.equal(tryEmit(local.playerId,'DailyQuest').ok,false);
  assert.equal(tryEmit(local.playerId,'Boss').payoutAsh,1000);assert.equal(local.player.pendingAsh,0);
});

test('pause freezes simulation and unsupported multiplayer actions cannot create another character or spend resources',async t=>{
  const{local}=boot(t,{debug:true});await local.dispatch({type:'travel',toCanto:'inferno_05',bypassGates:true});
  local.session.sipCd=4;const hp=local.session.hp,pos=[local.session.x,local.session.y],count=local.room.sessions.size,ash=local.player.ash;
  local.setPaused(true);local.tick(10000);await local.dispatch({type:'move',x:80,y:80});
  assert.equal(local.session.sipCd,4);assert.equal(local.session.hp,hp);assert.deepEqual([local.session.x,local.session.y],pos);
  for(const type of ['party_invite','pvp_queue','duel_challenge','arena_spectate'])await local.dispatch({type});
  assert.equal(local.room.sessions.size,count);assert.equal(local.player.ash,ash);
  local.setPaused(false);local.tick(10000);assert.ok(local.session.sipCd>=3.9,'resuming one long frame cannot fast-forward world timers');
});

test('malformed saves are rejected and inaccessible storage still permits a playable local world',t=>{
  const{storage}=boot(t);const good=JSON.parse(storage.getItem(LOCAL_SAVE_KEY));assert.ok(parseLocalSave(good));
  for(const change of [value=>value.version=99,value=>value.player.ash=-1,value=>value.location.x=Infinity,value=>value.player.inventory.push(value.player.inventory[0]),value=>value.progress.xp='bad',value=>value.player.inventory[0].rolledStats={dmg:999999,armor:0,maxHp:0}]){const value=structuredClone(good);change(value);assert.equal(parseLocalSave(value),null);}
  assert.equal(parseLocalSave('{'),null);assert.equal(readLocalSave({getItem(){throw new Error('denied')}}),null);
  const messages=[],blocked=createLocalSession({storage:{getItem(){throw new Error('denied')},setItem(){throw new Error('denied')}},onMessage:message=>messages.push(message)});blocked.start();t.after(()=>blocked.dispose());
  assert.equal(blocked.player.inventory.length,2);assert.equal(blocked.save(),false);assert.equal(messages.filter(message=>message.type==='toast'&&message.text.includes('Saving is unavailable')).length,1);
});

test('backgrounding preserves the real Avarice procession phase and wall-clock ability deadlines',async t=>{
  const{local}=boot(t,{debug:true});await local.dispatch({type:'travel',toCanto:'inferno_07',bypassGates:true});
  const originalNow=Date.now,at=originalNow();
  try{
    Date.now=()=>at;
    local.session.dashReadyAt=at+3500;local.session.spellReadyAt={gale_bolt:at+5200};
    const before=local.room.mech.snapshotExtra(local.room).t;
    local.setBackgroundPaused(true);local.setPaused(true);
    Date.now=()=>at+60000;local.tick(60);local.setBackgroundPaused(false);
    assert.equal(local.paused,true,'background return cannot close an open pause menu');
    local.setPaused(false);
    const after=local.room.mech.snapshotExtra(local.room).t;
    assert.ok(Math.abs(after-before)<.002,'the moving weights resume at their previous phase');
    assert.equal(local.session.dashReadyAt-Date.now(),3500);
    assert.equal(local.session.spellReadyAt.gale_bolt-Date.now(),5200);
  }finally{Date.now=originalNow;}
});

test('saving while paused retains flask, dash and learned-skill cooldowns on the next game launch',t=>{
  const storage=store(),first=boot(t,{storage}).local,originalNow=Date.now,at=originalNow();
  try{
    Date.now=()=>at;
    first.session.sipCd=8;first.session.sipReadyAt=at+8000;
    first.session.dashCd=4;first.session.dashReadyAt=at+4000;
    first.session.spellCd.furious_cleave=4;first.session.spellReadyAt={furious_cleave:at+4000};
    first.setPaused(true);Date.now=()=>at+60000;first.save();first.dispose();
    const second=boot(t,{storage}).local;
    assert.equal(second.session.sipReadyAt-Date.now(),8000);
    assert.equal(second.session.dashReadyAt-Date.now(),4000);
    assert.equal(second.session.spellReadyAt.furious_cleave-Date.now(),4000);
  }finally{Date.now=originalNow;}
});
