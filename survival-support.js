import { createEncounter } from './encounters.js?v25';

export function usefulSupply(entry, hp, overdrive) {
  return entry.type === 'medkit' ? hp < 100 : entry.type === 'overdrive' && overdrive < 8;
}
export function supplyToReplace(entries, hp, overdrive) {
  // Prefer an unneeded or nearly expired item, keeping a scarce useful medkit.
  const counts={medkit:0,overdrive:0};for(const entry of entries)counts[entry.type]=(counts[entry.type]||0)+1;
  const value=entry=>usefulSupply(entry,hp,overdrive)?1+(entry.type==='medkit'&&hp<=40?2:0)+1/counts[entry.type]:0;
  return [...entries].sort((a,b) => value(a)-value(b) || (b.age||0)-(a.age||0))[0] || null;
}
export function nearestSupply(entries, position, hp, overdrive, range = 24) {
  const candidates = entries.filter(e => usefulSupply(e,hp,overdrive)).map(entry => ({entry,distance:Math.hypot(entry.position.x-position.x,entry.position.z-position.z)})).filter(e=>e.distance<=range);
  candidates.sort((a,b)=>(hp<=40?Number(b.entry.type==='medkit')-Number(a.entry.type==='medkit'):0)||a.distance-b.distance);
  return candidates[0] || null;
}
export function supplyDescription(supply, position, yaw = 0) {
  if(!supply)return '';
  const {entry,distance}=supply, bearing=Math.atan2(entry.position.x-position.x,position.z-entry.position.z)+yaw;
  const angle=Math.atan2(Math.sin(bearing),Math.cos(bearing));
  const direction=Math.abs(angle)<.65?'ahead':Math.abs(angle)>2.5?'behind':angle>0?'right':'left';
  return `${entry.type==='medkit'?'MEDKIT':'OVERDRIVE'} · ${Math.ceil(distance)}m ${direction}${entry.age>=37?` · ${Math.max(0,Math.ceil(45-entry.age))}s left`:''}`;
}
export function recoveryPreview(wave, level) {
  if(level===2&&wave===5)return 'BOTH ISLANDS SECURED · ENDLESS AVAILABLE';
  const next=createEncounter(level===1&&wave>=5?1:wave+1,level===1&&wave>=5?2:level);
  return `${level===1&&wave>=5?'EMBER ISLE · ':''}NEXT: ${next.name} · ${next.count} HOSTILES${next.elite?' · '+next.elite.toUpperCase():''}`;
}
export function createSupplyGuide(document) {
  const element=document.createElement('span');element.id='supplyGuide';element.className='supply-guide';element.hidden=true;
  document.getElementById('weaponHud')?.append(element);
  return { update(text,active=true){element.hidden=!active||!text;if(element.textContent!==text)element.textContent=text;},clear(){element.hidden=true;} };
}
