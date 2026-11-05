// Run-only upgrades: no currency, unlock grind or persistent power advantage.
export const PERKS = [
  {id:'damage', title:'HOLLOW POINTS', short:'Damage', category:'OFFENSE', icon:'✦', description:rank=>`Bullets deal ${rank*40}% more damage.`},
  {id:'cadence', title:'RAPID CYCLING', short:'Fire rate', category:'OFFENSE', icon:'»', description:rank=>`Your weapon fires ${rank*15}% faster.`},
  {id:'speed', title:'LIGHT FOOTED', short:'Movement', category:'MOBILITY', icon:'↗', description:rank=>`Move and sprint ${rank*8}% faster.`},
  {id:'armor', title:'PLATE CARRIER', short:'Armor', category:'DEFENSE', icon:'◇', description:rank=>`Take ${rank*10}% less damage from all threats.`},
  {id:'recovery', title:'FIELD MEDIC', short:'Recovery', category:'SUPPORT', icon:'+', description:rank=>`Wave recovery: ${25+rank*10} HP. Medkits: ${30+rank*6} HP.`},
  {id:'magnet', title:'SALVAGE EXPERT', short:'Collection', category:'SUPPORT', icon:'⊕', description:rank=>`Collect supplies from ${(1.9+rank).toFixed(1)} meters away.`}
];
const BOONS = [
  {id:'shield',title:'RESERVE ARMOR',short:'Reserve armor',category:'DEFENSE',icon:'◇',description:()=> 'Gain 30 armor points that absorb incoming damage.'},
  {id:'overdrive',title:'POWER SURGE',short:'Power surge',category:'OFFENSE',icon:'»',description:()=> 'Start the next wave with 12 seconds of powered-up fire.'},
  {id:'bounty',title:'SUPPLY BOUNTY',short:'Supply bounty',category:'REWARD',icon:'✦',description:()=> 'Add 150 bonus points to this run’s score.'}
];
export function restoreRanks(saved) {
  const ranks={};
  for(const perk of PERKS) ranks[perk.id]=Number.isFinite(saved?.[perk.id])?Math.max(0,Math.min(3,Math.floor(saved[perk.id]))):0;
  return ranks;
}
export function bonuses(ranks) {
  return {damage:1+ranks.damage*.4,fireRate:1+ranks.cadence*.15,movement:1+ranks.speed*.08,armor:1-ranks.armor*.1,recovery:25+ranks.recovery*10,medkit:30+ranks.recovery*6,pickupRadius:1.9+ranks.magnet};
}
export function upgradeChoices(ranks, random=Math.random) {
  const available=PERKS.filter(perk=>ranks[perk.id]<3);
  for(let i=available.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[available[i],available[j]]=[available[j],available[i]];}
  // Spread the offer across available roles before filling repeated roles.
  const selected=[], categories=new Set();
  for(const perk of available)if(!categories.has(perk.category)&&selected.length<3){selected.push(perk);categories.add(perk.category);}
  for(const perk of available)if(selected.length<3&&!selected.includes(perk))selected.push(perk);
  for(const boon of BOONS)if(selected.length<3)selected.push(boon);
  return selected.map(perk=>({...perk,rank:perk.id in ranks?ranks[perk.id]+1:0,text:perk.description((ranks[perk.id]||0)+1)}));
}
export function restoreUpgradeChoices(ids, ranks) {
  const definitions = [...PERKS, ...BOONS];
  if (!Array.isArray(ids) || ids.length !== 3 || new Set(ids).size !== 3) return upgradeChoices(ranks);
  const choices = ids.map(id => definitions.find(perk => perk.id === id));
  if (choices.some(perk => !perk || (perk.id in ranks && ranks[perk.id] >= 3))) return upgradeChoices(ranks);
  return choices.map(perk => ({ ...perk, rank: perk.id in ranks ? ranks[perk.id] + 1 : 0, text: perk.description((ranks[perk.id] || 0) + 1) }));
}
export function buildSummary(ranks) {
  return PERKS.filter(perk=>ranks[perk.id]>0).map(perk=>`${perk.short} ${['','I','II','III'][ranks[perk.id]]}`).join(' · ')||'Standard issue · Your build starts after wave one';
}

export function upgradeComparison(choice, ranks) {
  const before=bonuses(restoreRanks(ranks)), after=bonuses(restoreRanks({...ranks,[choice.id]:(ranks[choice.id]||0)+1}));
  const percent=n=>`${Math.round(n*100)}%`, multiplier=n=>`${n.toFixed(2)}×`;
  switch(choice.id){
    case 'damage':return `Damage ${multiplier(before.damage)} → ${multiplier(after.damage)}`;
    case 'cadence':return `Fire rate ${multiplier(before.fireRate)} → ${multiplier(after.fireRate)}`;
    case 'speed':return `Movement ${multiplier(before.movement)} → ${multiplier(after.movement)}`;
    case 'armor':return `Damage taken ${percent(before.armor)} → ${percent(after.armor)}`;
    case 'recovery':return `Wave healing ${before.recovery} → ${after.recovery} HP · medkits ${before.medkit} → ${after.medkit} HP`;
    case 'magnet':return `Collection ${before.pickupRadius.toFixed(1)} → ${after.pickupRadius.toFixed(1)} m`;
    default:return choice.text;
  }
}
