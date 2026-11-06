import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshMarket, startMarketSession, hydrateListings, getListings, browse, buy, bid, listItem, cancelListing} from '../selva/engine/ah.mjs';
import {players, BAG_MAX, vendorAsh, equipItem, computeGearStats} from '../selva/engine/ledger.mjs';
import {itemStatBonus} from '../selva/engine/loot.mjs';

let nextPlayer = 0;
function player(ash=25000) {
  const p={id:`market-test-${++nextPlayer}`,name:'The local pilgrim',ash,inventory:[],stash:[]};
  players.set(p.id,p); return p;
}
const stockSignature = lots => lots.map(lot=>({name:lot.item.name,slot:lot.item.slot,rarity:lot.item.rarity,stats:lot.item.rolledStats,price:lot.priceAsh}));
const item = (id,options={}) => ({id,name:'Spare Ashen Club',rarity:'magic',slot:'weapon',baseId:'ashen_club',qty:1,soulbound:false,equipSlot:null,...options});

test('each game launch creates fresh random items, effective stats and integer prices across all gear slots',()=>{
  const first=refreshMarket({seed:42}),second=startMarketSession({seed:912});
  assert.equal(first.length,24); assert.equal(second.length,24);
  assert.notDeepEqual(stockSignature(first),stockSignature(second));
  assert.notEqual(first[0].id,second[0].id);
  assert.equal(new Set(second.map(lot=>lot.id)).size,24);
  assert.equal(new Set(second.map(lot=>lot.item.id)).size,24);
  assert.deepEqual(new Set(second.slice(0,6).map(lot=>lot.item.slot)),new Set(['weapon','armor','helm','boots','gloves','offhand']));
  assert.ok(second.some(lot=>lot.priceAsh<=180),'each launch includes affordable gear');
  assert.ok(second.some(lot=>lot.item.rarity!=='normal'),'each launch includes rarer finds');
  assert.ok(new Set(second.map(lot=>lot.priceAsh)).size>12,'prices vary throughout the stock');
  for(const lot of [...first,...second]){
    assert.ok(Number.isSafeInteger(lot.priceAsh)&&lot.priceAsh>0);
    assert.ok(lot.priceAsh>vendorAsh(lot.item),'buying and selling cannot print Ash');
    assert.equal(lot.sellerId,'local-market'); assert.equal(lot.item.soulbound,false);
    assert.deepEqual(itemStatBonus(lot.item),lot.item.rolledStats,'rolled bonuses affect real gear calculations');
    for(const stat of Object.values(lot.item.rolledStats))assert.ok(Number.isSafeInteger(stat)&&stat>=0&&stat<=250);
    assert.ok(Object.values(lot.item.rolledStats).some(value=>value>0));
  }
  const controlled=refreshMarket({seed:42});
  assert.deepEqual(stockSignature(first),stockSignature(controlled),'injected seeds make stock reproducible for tests');
  assert.notEqual(first[0].id,controlled[0].id,'item identity remains unique even when a seeded layout is repeated');
});

test('browsing, refreshing the display and compatibility hydration keep session stock stable and detached',async()=>{
  const initial=refreshMarket({seed:17});
  assert.deepEqual(browse(),initial); assert.deepEqual(getListings(),initial);
  await hydrateListings(); assert.deepEqual(getListings(),initial,'hydrate cannot reroll an already started game');
  const view=getListings(); view[0].priceAsh=1;view[0].item.name='Changed';view[0].item.affixes.push('fake');view[0].item.rolledStats.dmg=250;view[0].bids.push({bidAsh:1});
  assert.deepEqual(getListings(),initial,'a client cannot mutate the underlying market through its display object');
});

test('a double purchase spends once, removes the lot and preserves bought gear and purse when a new market starts',async()=>{
  const [lot]=refreshMarket({seed:8}),p=player();
  const before=p.ash;
  const [first,second]=await Promise.all([buy(p.id,lot.id),buy(p.id,lot.id)]);
  assert.equal(first.ok,true);assert.equal(second.ok,false);assert.equal(second.reason,'not_found');
  assert.equal(p.ash,before-lot.priceAsh);assert.equal(p.inventory.length,1);
  assert.deepEqual(p.inventory[0],lot.item);assert.equal(first.paidAsh,lot.priceAsh);assert.equal(first.taxAsh,0);
  assert.equal(getListings().some(row=>row.id===lot.id),false);
  await hydrateListings();assert.equal(getListings().some(row=>row.id===lot.id),false);
  const bought=structuredClone(p.inventory),remaining=p.ash;
  refreshMarket({seed:9});assert.deepEqual(p.inventory,bought);assert.equal(p.ash,remaining);
  assert.equal(getListings().some(row=>row.item.id===lot.item.id),false);
});

test('insufficient, malformed and overflowing purses fail without changing gear, money or the offer',async()=>{
  const [lot]=refreshMarket({seed:22});
  for(const balance of [0,lot.priceAsh-1,NaN,Infinity,-1,'25000',Number.MAX_SAFE_INTEGER+1]){
    const p=player(balance),result=await buy(p.id,lot.id);
    assert.deepEqual(result,{ok:false,reason:'insufficient_ash'});
    assert.equal(p.inventory.length,0);assert.ok(Object.is(p.ash,balance));
    assert.ok(getListings().some(row=>row.id===lot.id));
  }
  assert.equal((await buy('missing-player',lot.id)).reason,'no_player');
  assert.equal((await buy(player().id,'missing-lot')).reason,'not_found');
});

test('bag capacity is atomic and excludes worn equipment; purchased rolled stats survive equip and real gear totals',async()=>{
  const [lot]=refreshMarket({seed:7}),p=player();
  p.inventory=Array.from({length:BAG_MAX},(_,i)=>item(`full-${i}`));
  const balance=p.ash;
  assert.deepEqual(await buy(p.id,lot.id),{ok:false,reason:'bag_full'});assert.equal(p.ash,balance);assert.equal(p.inventory.length,BAG_MAX);
  p.inventory[0].equipSlot='MainHand';
  assert.equal((await buy(p.id,lot.id)).ok,true,'worn gear is not a bag cell');
  const gear=player();const weapon=getListings().find(row=>row.item.slot==='weapon');
  assert.ok(weapon);assert.equal((await buy(gear.id,weapon.id)).ok,true);
  assert.equal((await equipItem(gear.id,weapon.item.id)).ok,true);
  assert.deepEqual(computeGearStats(gear),weapon.item.rolledStats);
});

test('selling spare gear pays its real vendor value immediately rather than trusting an invented asking price',async()=>{
  refreshMarket({seed:13});const originalStock=getListings(),p=player();
  const spare=item('sell-me',{rolledStats:{dmg:18,maxHp:5,armor:2}});p.inventory.push(spare);
  const expected=vendorAsh(spare),balance=p.ash;
  const [first,second]=await Promise.all([listItem(p.id,spare.id,Number.MAX_SAFE_INTEGER),listItem(p.id,spare.id,1)]);
  assert.equal(first.ok,true);assert.equal(first.soldAsh,expected);assert.equal(second.reason,'item_not_found');
  assert.equal(p.ash,balance+expected);assert.equal(p.inventory.length,0);
  assert.deepEqual(getListings(),originalStock,'selling has no unfulfillable player auction or newly minted NPC lot');
  for(const options of [{equipSlot:'MainHand'},{soulbound:true},{qty:-1},{qty:Infinity}]){
    const guarded=item(`guard-${p.inventory.length}`,options);p.inventory.push(guarded);const ash=p.ash;
    const result=await listItem(p.id,guarded.id,100);
    assert.equal(result.ok,false);assert.equal(p.ash,ash);assert.ok(p.inventory.includes(guarded));
  }
  const overflow=player(Number.MAX_SAFE_INTEGER);overflow.inventory.push(item('overflow'));
  assert.equal((await listItem(overflow.id,'overflow',999)).ok,false);assert.equal(overflow.ash,Number.MAX_SAFE_INTEGER);
});

test('legacy bid inputs resolve immediately at the fixed displayed ask without escrow or another player',async()=>{
  const [lot]=refreshMarket({seed:71}),p=player(),ash=p.ash;
  for(const bad of [0,-1,NaN,Infinity,1.5])assert.equal((await bid(p.id,lot.id,bad)).reason,'bad_bid');
  assert.equal((await bid(p.id,lot.id,lot.priceAsh-1)).reason,'below_ask');assert.equal(p.ash,ash);
  const result=await bid(p.id,lot.id,lot.priceAsh+100);
  assert.equal(result.ok,true);assert.equal(result.paidAsh,lot.priceAsh);assert.equal(p.ash,ash-lot.priceAsh);assert.equal(p.inventory.length,1);
  assert.equal((await cancelListing(p.id,getListings()[0].id)).reason,'not_owner');
  assert.equal((await cancelListing(p.id,lot.id)).reason,'not_found');
});
