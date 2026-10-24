const TYPES = [
  { id:'skirmish', name:'FIRST CONTACT', hint:'Find your footing. Hold the uplink.', pattern:['walker','walker','runner','walker','brute','walker','runner'], gap:1.3 },
  { id:'crossfire', name:'CROSS FIRE', hint:'Spitters mark the ground. Move before impact.', pattern:['spitter','walker','runner','walker','brute','spitter','walker','runner','walker','runner'], gap:1.15 },
  { id:'rush', name:'RUNNER RUSH', hint:'Keep moving. Fast hostiles close the gap.', pattern:['runner','runner','walker','runner','spitter','runner','walker'], gap:.75 },
  { id:'iron', name:'IRON GUARD', hint:'Break the heavy line. Watch the acid zones.', pattern:['brute','walker','brute','spitter','walker','brute','walker'], gap:1.05 },
  { id:'command', name:'COMMANDER', hint:'Leave the slam ring. Keep an escape route.', pattern:['walker','runner','spitter','walker','walker','runner','walker','brute','walker'], gap:.9 }
];

export function createEncounter(wave, level=1) {
  const number=Math.max(1,Math.floor(wave)),type=TYPES[(number-1)%5],count=4+number*3;
  const elite=number%5===0?'commander':number===3?'elite':null;
  const roster=Array.from({length:count},(_,index)=>{
    const value=type.pattern[index%type.pattern.length];
    return level===2&&value==='walker'&&index%3===0?'fiery':value;
  });
  if(elite)roster[0]='brute';
  return {...type,wave:number,count,elite,roster,gap:Math.max(.45,type.gap-(number>5?(number-5)*.035:0))};
}

export function createMomentum() {
  let chain=0,time=0,best=0,bestMultiplier=1;
  const multiplier=()=>chain>=8?3:chain>=3?2:1;
  function clear(){chain=time=0;}
  return {
    kill(){chain++;time=7;best=Math.max(best,chain);bestMultiplier=Math.max(bestMultiplier,multiplier());return multiplier();},
    update(dt){if(chain){time=Math.max(0,time-dt);if(!time)clear();}},
    clear,
    reset(){clear();best=0;bestMultiplier=1;},
    restore(saved){clear();best=Math.min(100000,Math.max(0,Math.floor(Number(saved?.best)||0)));bestMultiplier=Math.max(1,Math.min(3,Math.floor(Number(saved?.bestMultiplier)||1)));},
    get state(){return{chain,time,best,multiplier:multiplier(),bestMultiplier};}
  };
}

export function rateOperation({kills=0,elites=0,uplinks=0,shots=0,hits=0,chain=0,completed=false}={}) {
  const cap=(value,denominator)=>Math.min(1,Math.max(0,Number(value)||0)/denominator);
  const points=cap(kills,65)*25+cap(elites,4)*20+cap(uplinks,6)*20+(shots?cap(hits,shots)*15:0)+cap(chain,8)*10+(completed?10:0);
  const grade=points>=85?'S':points>=65?'A':points>=40?'B':'C';
  return {grade,points:Math.round(points),label:{S:'ISLAND LEGEND',A:'FIELD ACE',B:'STEADY OPERATOR',C:'RISING OPERATOR'}[grade]};
}
