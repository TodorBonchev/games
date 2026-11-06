import { World } from './room.mjs';
import { CANTOS } from './content.mjs';
import { players, playersByName, getOrCreatePlayer } from './ledger.mjs';
import { makeStarterKitItems, contentSlotToEquip } from './loot.mjs';
import { applyPlayerStats, getProgress, grantXp, handleSkillLearn, handleSkillLoadout, handleSkillRespec, handleTutorial, localProgressSnapshot, restoreLocalProgress, resetLocalProgress } from './progression.mjs';
import { handleChallengesGet, handleFlairSet, localChallengeSnapshot, restoreLocalChallenges, _challengesReset } from './challenges.mjs';
import * as market from './ah.mjs';
import {SKILLS} from './skills.mjs';

export const LOCAL_SAVE_KEY='games.selva.run.v1';
const PLAYER_ID='solo-pilgrim';
const finite=(v,lo,hi)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
const slots=new Set(['Head','Chest','Hands','Feet','MainHand','OffHand']);
const rarities=new Set(['normal','magic','rare','set','unique','canto_unique']);
function cleanItem(value,stash=false){
  if(!value||typeof value!=='object'||typeof value.id!=='string'||!value.id||value.id.length>150||typeof value.name!=='string'||value.name.length>150||!rarities.has(value.rarity))return null;
  if(value.equipSlot!=null&&!slots.has(value.equipSlot))return null;
  if(stash&&value.equipSlot)return null;
  const result={id:value.id,name:value.name,rarity:value.rarity,soulbound:value.soulbound===true,qty:finite(value.qty,1,1000000)?Math.floor(value.qty):1,equipSlot:value.equipSlot||null,affixes:Array.isArray(value.affixes)?value.affixes.filter(x=>typeof x==='string'&&x.length<=150).slice(0,12):[]};
  for(const key of ['baseId','slot','itemPool'])if(typeof value[key]==='string'&&value[key].length<=150)result[key]=value[key];
  if(finite(value.seed,0,0xffffffff))result.seed=value.seed;
  if(value.rolledStats){if(!['dmg','maxHp','armor'].every(k=>finite(value.rolledStats[k],0,250)))return null;result.rolledStats={dmg:Math.round(value.rolledStats.dmg),maxHp:Math.round(value.rolledStats.maxHp),armor:Math.round(value.rolledStats.armor)};}
  return result;
}
export function parseLocalSave(raw){
  try{
    const value=typeof raw==='string'?JSON.parse(raw):raw;
    if(!value||value.version!==1||!value.player||typeof value.player.name!=='string'||!finite(value.player.ash,0,Number.MAX_SAFE_INTEGER)||!Array.isArray(value.player.inventory)||value.player.inventory.length>46||!Array.isArray(value.player.stash)||value.player.stash.length>60)return null;
    const inventory=value.player.inventory.map(x=>cleanItem(x)),stash=value.player.stash.map(x=>cleanItem(x,true));
    if(inventory.some(x=>!x)||stash.some(x=>!x))return null;
    const ids=new Set(),worn=new Set();for(const item of [...inventory,...stash]){if(ids.has(item.id))return null;ids.add(item.id);if(item.equipSlot){if(worn.has(item.equipSlot))return null;worn.add(item.equipSlot);}}
    if(inventory.filter(x=>!x.equipSlot).length>40)return null;
    const clears=Array.isArray(value.player.firstClears)?value.player.firstClears.filter(id=>Object.hasOwn(CANTOS,id)):[];
    const player={id:PLAYER_ID,name:value.player.name.trim().slice(0,24)||'Pilgrim',ash:Math.floor(value.player.ash),pendingAsh:0,inventory,stash,firstClears:clears,spokeToGuide:value.player.spokeToGuide===true,visitedInferno:value.player.visitedInferno===true,dailyQuestDoneUtc:typeof value.player.dailyQuestDoneUtc==='string'?value.player.dailyQuestDoneUtc:null};
    const location=value.location&&Object.hasOwn(CANTOS,value.location.cantoId)?value.location:null;
    if(location&&(!finite(location.x,0,CANTOS[location.cantoId].geo.bounds.width)||!finite(location.y,0,CANTOS[location.cantoId].geo.bounds.height)))return null;
    if(location){for(const key of ['hp','mana','sipCd','dashCd'])if(location[key]!==undefined&&!finite(location[key],0,1000000))return null;if(location.skillCooldowns&&(!Object.entries(location.skillCooldowns).every(([id,ms])=>SKILLS[id]?.type==='active'&&finite(ms,0,600000))))return null;}
    const progress=value.progress&&typeof value.progress==='object'?value.progress:null;
    if(progress&&!finite(progress.xp,0,1e12))return null;
    return {version:1,player,location,progress,challenges:value.challenges};
  }catch{return null;}
}
export function readLocalSave(storage){try{const store=storage===undefined?globalThis.localStorage:storage;return parseLocalSave(store?.getItem(LOCAL_SAVE_KEY));}catch{return null;}}

/** One browser owns one character and one copy of the authored PvE world.
 * @param {{name?:string,storage?:any,onMessage?:(message:any)=>void,debug?:boolean,marketSeed?:number}} options
 */
export function createLocalSession({name='Pilgrim',storage,onMessage=(_message)=>{},debug=false,marketSeed}={}){
  if(storage===undefined){try{storage=globalThis.localStorage;}catch{storage=null;}}
  let world=null,started=false,disposed=false,paused=false,backgroundPaused=false,pausedAt=0,saveFailed=false,ticksSinceSave=0;
  const ws={readyState:1,send(raw){onMessage(JSON.parse(raw));}};
  const restored=readLocalSave(storage);
  const send=msg=>onMessage(structuredClone(msg));
  const room=()=>world?.getRoom(PLAYER_ID);
  const session=()=>room()?.sessions.get(PLAYER_ID);
  function save(){
    if(!started||disposed||!world)return false;
    const player=players.get(PLAYER_ID),s=session();if(!player||!s)return false;
    const clock=pausedAt||Date.now();
    const remain=at=>Math.min(600000,Math.max(0,(Number(at)||0)-clock));
    const cooldowns=Object.fromEntries(Object.entries(s.spellReadyAt||{}).filter(([id])=>SKILLS[id]?.type==='active').map(([id,at])=>[id,remain(at)]));
    const data={version:1,savedAt:Date.now(),player:{...player,firstClears:[...player.firstClears]},progress:localProgressSnapshot(PLAYER_ID),challenges:localChallengeSnapshot(PLAYER_ID),location:{cantoId:room().cantoId,x:s.x,y:s.y,hp:s.hp,mana:s.mana,sipCd:s.sipReadyAt?remain(s.sipReadyAt)/1000:s.sipCd,dashCd:s.dashReadyAt?remain(s.dashReadyAt)/1000:s.dashCd,spellCd:s.spellCd,skillCooldowns:cooldowns}};
    try{if(!storage)throw new Error('Storage unavailable');storage.setItem(LOCAL_SAVE_KEY,JSON.stringify(data));saveFailed=false;return true;}catch{if(!saveFailed){saveFailed=true;send({type:'toast',level:'warn',text:'Saving is unavailable in this browser. Keep this tab open to continue your adventure.'});}return false;}
  }
  function start(){
    if(started||disposed)return;started=true;
    players.clear();playersByName.clear();resetLocalProgress();_challengesReset();
    const player=getOrCreatePlayer(PLAYER_ID,restored?.player.name||String(name).trim().slice(0,24)||'Pilgrim');
    if(restored){Object.assign(player,restored.player,{id:PLAYER_ID,firstClears:new Set(restored.player.firstClears)});restoreLocalProgress(PLAYER_ID,restored.progress);restoreLocalChallenges(PLAYER_ID,restored.challenges);}
    if(!player.inventory.length){for(const item of makeStarterKitItems()){item.equipSlot=contentSlotToEquip(item.slot);player.inventory.push(item);}}
    market.startMarketSession({...(marketSeed===undefined?{}:{seed:marketSeed})});
    world=new World();
    for(const r of world.rooms.values())r.soloDebug=debug;
    const cid=restored?.location?.cantoId||'inferno_01';
    const current=world.ensureJoin(ws,PLAYER_ID,player.name,cid),s=current.sessions.get(PLAYER_ID);
    if(restored?.location&&restored.location.hp>0){s.x=restored.location.x;s.y=restored.location.y;s.hp=Math.min(s.maxHp,Math.max(1,Number(restored.location.hp)||s.maxHp));s.mana=Math.min(s.maxMana,Math.max(0,Number(restored.location.mana)||0));s.sipCd=Math.min(15,Math.max(0,Number(restored.location.sipCd)||0));s.dashCd=Math.min(4,Math.max(0,Number(restored.location.dashCd)||0));s.dashReadyAt=Date.now()+s.dashCd*1000;s.sipReadyAt=Date.now()+s.sipCd*1000;if(restored.location.spellCd&&typeof restored.location.spellCd==='object')for(const[key,value]of Object.entries(restored.location.spellCd))if(SKILLS[key]?.type==='active')s.spellCd[key]=Math.min(600,Math.max(0,Number(value)||0));s.spellReadyAt={};for(const[id,ms]of Object.entries(restored.location.skillCooldowns||{}))s.spellReadyAt[id]=Date.now()+Number(ms);for(const[id,seconds]of Object.entries(s.spellCd))if(!s.spellReadyAt[id]&&seconds>0)s.spellReadyAt[id]=Date.now()+seconds*1000;}
    send({type:'welcome',playerId:PLAYER_ID,protocol:1,server:'single-player',restored:!!restored});
    current.pushSnapshot(PLAYER_ID);
    send({type:'toast',level:'info',text:restored?'Welcome back. Your solo adventure is restored.':'Welcome, pilgrim. Your adventure saves on this device.'});
    save();
  }
  async function dispatch(msg){
    if(!started||disposed||!msg||typeof msg.type!=='string')return;
    const current=room(),s=session();if(!current||!s)return;
    if((paused||backgroundPaused)&&['move','attack','cast','dash','sip','travel','interact','pickup'].includes(msg.type))return;
    switch(msg.type){
      case 'hello': current.pushSnapshot(PLAYER_ID);break;
      case 'ping':send({type:'pong',t:Date.now(),c:msg.c});break;
      case 'move':current.handleMove(PLAYER_ID,Number(msg.x),Number(msg.y));break;
      case 'attack':current.handleAttack(PLAYER_ID,String(msg.targetId),Number(msg.combo)||0);break;
      case 'cast':current.handleCast(PLAYER_ID,String(msg.spellId||''),msg.aimX==null?undefined:Number(msg.aimX),msg.aimY==null?undefined:Number(msg.aimY));break;
      case 'interact':{const result=current.handleInteract(PLAYER_ID,String(msg.targetId));if(result?.travel)world.travel(PLAYER_ID,result.travel,ws,players.get(PLAYER_ID).name);break;}
      case 'travel':world.travel(PLAYER_ID,String(msg.toCanto),ws,players.get(PLAYER_ID).name,{bypassGates:debug&&msg.bypassGates===true});break;
      case 'pickup':await current.handlePickup(PLAYER_ID,String(msg.lootId));break;
      case 'equip':await current.handleEquip(PLAYER_ID,String(msg.itemId));break;
      case 'unequip':await current.handleUnequip(PLAYER_ID,msg.itemId?String(msg.itemId):null,msg.slot?String(msg.slot):null);break;
      case 'stash_put':case 'stash_take':await current.handleStash(PLAYER_ID,String(msg.itemId),msg.type==='stash_take'?'take':'put');break;
      case 'salvage_bag':await current.handleSalvage(PLAYER_ID);break;
      case 'sip':current.handleSip(PLAYER_ID);break;
      case 'dash':current.handleDash(PLAYER_ID,Number(msg.x),Number(msg.y));break;
      case 'claim_daily':current.tryDaily(PLAYER_ID);break;
      case 'tutorial':handleTutorial(current,s,String(msg.step||''));break;
      case 'skill_learn':handleSkillLearn(current,s,msg.skillId);break;
      case 'skill_loadout':handleSkillLoadout(current,s,msg.slots);break;
      case 'skill_respec':handleSkillRespec(current,s,false);break;
      case 'challenges_get':handleChallengesGet(current,s);break;
      case 'flair_set':handleFlairSet(current,s,String(msg.kind||'title'),msg.id??null);break;
      case 'ah_browse':send({type:'ah_listings',listings:market.getListings()});break;
      case 'ah_buy':case 'ah_bid':case 'ah_list':case 'ah_cancel':{
        const result=msg.type==='ah_buy'?await market.buy(PLAYER_ID,String(msg.listingId)):msg.type==='ah_bid'?await market.bid(PLAYER_ID,String(msg.listingId),Number(msg.bidAsh)):msg.type==='ah_list'?await market.listItem(PLAYER_ID,String(msg.itemId),Number(msg.priceAsh)):await market.cancelListing(PLAYER_ID,String(msg.listingId));
        if(!result.ok)send({type:'error',code:result.reason,message:'Auction House: '+String(result.reason).replaceAll('_',' ')});
        else send({type:'toast',level:'loot',text:msg.type==='ah_list'?`Sold ${result.item?.name||'item'} for ${result.soldAsh} Ash.`:msg.type==='ah_cancel'?'Offer cancelled.':`Bought ${result.item?.name||'item'} for ${result.paidAsh} Ash.`});
        send({type:'ah_listings',listings:market.getListings()});current.pushSnapshot(PLAYER_ID);break;
      }
      case 'dev_grant_xp':if(debug)grantXp(current,PLAYER_ID,Math.min(1000000,Math.max(0,Number(msg.amount)||0)),'practice',{skipPenalty:true});break;
      default:if(/^(pvp_|duel_|party_|arena_)/.test(msg.type))return;send({type:'error',code:'unknown_action',message:'That action is unavailable.'});
    }
    if(!['move','ping','hello','ah_browse'].includes(msg.type))save();
  }
  function tick(dt){if(!started||disposed||paused||backgroundPaused||!Number.isFinite(dt)||dt<=0)return;world.tick(Math.min(dt,.1));ticksSinceSave+=Math.min(dt,.1);if(ticksSinceSave>=2){ticksSinceSave=0;save();}}
  // The original mechanics use wall-clock deadlines as well as delta timers.
  // Move those deadlines forward by time spent paused so resuming does not
  // skip an attack windup, spend a dash recharge or jump the procession phase.
  function shiftDeadlines(root,delta){
    const seen=new WeakSet();
    const timestamp=value=>typeof value==='number'&&Number.isFinite(value)&&value>1e12&&value<Date.now()+86400000;
    function visit(value){
      if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);
      if(value instanceof Map){for(const[key,item]of value){if(timestamp(item))value.set(key,item+delta);else visit(item);}return;}
      if(value instanceof Set)return;
      for(const key of Object.keys(value)){const item=value[key];if(timestamp(item))value[key]=item+delta;else visit(item);}
    }
    visit(root);
  }
  function pauseState(kind,value){
    const before=paused||backgroundPaused;
    if(kind==='background')backgroundPaused=!!value;else paused=!!value;
    const after=paused||backgroundPaused;
    if(!before&&after)pausedAt=Date.now();
    if(before&&!after&&pausedAt){const elapsed=Math.max(0,Date.now()-pausedAt);pausedAt=0;if(elapsed)shiftDeadlines(world,elapsed);room()?.pushSnapshot(PLAYER_ID);}
  }
  return {start,dispatch,tick,save,setPaused(value){pauseState('menu',value);},setBackgroundPaused(value){pauseState('background',value);},get paused(){return paused||backgroundPaused;},get restored(){return !!restored;},get playerId(){return PLAYER_ID;},get world(){return world;},get room(){return room();},get session(){return session();},get player(){return players.get(PLAYER_ID);},get progress(){return getProgress(PLAYER_ID);},dispose(){if(disposed)return;save();disposed=true;ws.readyState=3;world?.leave(PLAYER_ID);}};
}
