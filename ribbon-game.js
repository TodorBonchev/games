// Ribbon Reef's world is a deterministic forward current, independent of rendering.
export const STEP = 1 / 60, SPEED = 6, MAX_HEALTH = 5, TAIL_LENGTH = 22;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const routes = [
  ['Sunlit shallows', 'A gentle current through the coral garden.', [0,0.7,-0.6,2.4,-2.5,2.3,-2.5,2.5,-2.4,2.4,-2.5,2.3,-2.3,0]],
  ['The blue ballet', 'Follow the arches as the reef begins to sway.', [0,-1,2.3,-2.5,2.5,-2.4,2.5,-2.5,2.4,-2.5,2.5,-2.4,2.4,0]],
  ['Coral crossroads', 'Wide turns leave room for a beautiful wake.', [0,1.3,-2.5,2.6,-2.6,2.5,-2.6,2.6,-2.5,2.6,-2.6,2.5,-2.4,0]],
  ['The violet drift', 'The current nudges you gently from side to side.', [0,-1.2,2.5,-2.7,2.7,-2.6,2.6,-2.7,2.7,-2.6,2.7,-2.5,2.5,0]],
  ['The glowing garden', 'One last dance under a sea of light.', [0,1.4,-2.6,2.8,-2.8,2.7,-2.7,2.8,-2.8,2.7,-2.8,2.6,-2.5,0]],
];
export const LEVELS = Object.freeze(routes.map(([name, subtitle, xs], i) => {
  const gates = xs.map((x, n) => Object.freeze({ id:n, x, y:n === 0 || n === xs.length-1 ? 0 : Math.sin(n*1.8+i*.7)*(.45+i*.1), distance:24+n*18, width:1.9-i*.055, height:1.65 }));
  const pearls = gates.flatMap((g,n) => [Object.freeze({id:n*2,x:g.x+(n%2 ? 1 : -1)*1.05,y:g.y+.3,distance:g.distance-3.8}), Object.freeze({id:n*2+1,x:g.x+(n%2 ? -1 : 1)*.8,y:g.y-.35,distance:g.distance+4})]);
  const obstacles = gates.slice(0,-1).map((g,n) => Object.freeze({id:n,x:xs[n+1]>=0 ? -3.65 : 3.65,y:Math.sin(n)*.6,distance:g.distance+9,radius:.65}));
  return Object.freeze({id:i+1,name,subtitle,length:280,gates:Object.freeze(gates),pearls:Object.freeze(pearls),obstacles:Object.freeze(obstacles),current:i*.08});
}));
const definition = id => LEVELS[Math.max(0, Math.min(4, (Number(id)|0)-1))];
const clone = o => JSON.parse(JSON.stringify(o));
export function createRibbon({level=1}={}) {
  const state={}, tail=[]; let route=definition(level), accumulator=0, tailClock=0;
  function reset(id=route.id) { route=definition(id); accumulator=tailClock=0; tail.length=0; for(let i=0;i<TAIL_LENGTH;i++) tail.push({x:0,y:0,distance:-i*.45}); Object.assign(state,{mode:'ready',level:route.id,ticks:0,distance:0,x:0,y:0,targetX:0,targetY:0,health:MAX_HEALTH,score:0,combo:0,bestCombo:0,perfects:0,passed:0,nearMisses:0,pearls:[],hits:[],tail,events:[],effects:[],stars:0}); return state; }
  function emit(type,detail={}) {state.events.push({type,...detail});if(state.events.length>40)state.events.shift();}
  function fx(type,x,y,distance) { state.effects.push({type,x,y,distance,age:0}); if(state.effects.length>40)state.effects.shift(); }
  function start(id=route.id) {reset(id);state.mode='playing';emit('start');return state;}
  function steer(x,y) {if(state.mode!=='playing'||!Number.isFinite(x)||!Number.isFinite(y))return false;state.targetX=clamp(x,-4.2,4.2);state.targetY=clamp(y,-2.35,2.35);return true;}
  function step() {
    state.ticks++; const old=state.distance; state.distance=Math.min(route.length,old+SPEED*STEP); if(route.length-state.distance<1e-7)state.distance=route.length;
    const current=route.current*Math.sin(state.ticks*STEP*.8); state.x=clamp(state.x+(state.targetX-state.x)*.095+current*STEP,-4.2,4.2); state.y=clamp(state.y+(state.targetY-state.y)*.095,-2.35,2.35);
    tailClock+=SPEED*STEP; if(tailClock>=.45){tailClock-=.45;tail.unshift({x:state.x,y:state.y,distance:state.distance});tail.pop();}
    for(const gate of route.gates) if(old<gate.distance&&state.distance>=gate.distance){const dx=Math.abs(state.x-gate.x),dy=Math.abs(state.y-gate.y);if(dx<=gate.width&&dy<=gate.height){state.passed++;const perfect=dx<.62&&dy<.6;if(perfect){state.perfects++;state.combo++;state.bestCombo=Math.max(state.bestCombo,state.combo);state.score+=120+Math.min(8,state.combo)*25;emit('perfect',{combo:state.combo});fx('perfect',gate.x,gate.y,gate.distance);}else {state.combo=0;state.score+=80;emit('gate');fx('gate',gate.x,gate.y,gate.distance);}}else{state.combo=0;state.health--;emit('miss');fx('miss',state.x,state.y,state.distance);}}
    for(const obstacle of route.obstacles) if(old<obstacle.distance&&state.distance>=obstacle.distance){const gap=Math.hypot(state.x-obstacle.x,state.y-obstacle.y);if(gap<obstacle.radius+.38){state.health--;state.combo=0;state.hits.push(obstacle.id);emit('hit');fx('miss',state.x,state.y,state.distance);}else if(gap<obstacle.radius+1.3){state.nearMisses++;state.score+=40;emit('flow');fx('flow',state.x,state.y,state.distance);}}
    // The full wake, not just the head, gathers pearls as it passes them.
    for(const p of route.pearls){if(state.pearls.includes(p.id)||p.distance>state.distance+.6||p.distance<state.distance-TAIL_LENGTH*.45-1)continue; for(const part of tail){if(Math.abs(part.distance-p.distance)<.7&&Math.hypot(part.x-p.x,part.y-p.y)<1.15){state.pearls.push(p.id);state.score+=30;emit('pearl');fx('pearl',p.x,p.y,p.distance);break;}}}
    for(const effect of state.effects)effect.age+=STEP; state.effects=state.effects.filter(e=>e.age<1);
    if(state.health<=0){state.health=0;state.mode='lost';emit('lost');}else if(state.distance>=route.length){state.mode='won';state.stars=1+(state.passed>=Math.ceil(route.gates.length*.75)?1:0)+(state.perfects>=5&&state.pearls.length>=6?1:0);state.score+=500;emit('won');}
  }
  function advance(seconds){if(state.mode!=='playing'||!Number.isFinite(seconds)||seconds<=0)return;accumulator+=Math.min(1,seconds);while(accumulator+1e-9>=STEP&&state.mode==='playing'){accumulator-=STEP;step();}}
  function pause(){if(state.mode!=='playing')return false;state.mode='paused';accumulator=0;return true;}
  function resume(){if(state.mode!=='paused')return false;state.mode='playing';return true;}
  function snapshot(){if(!['playing','paused'].includes(state.mode))return null;return {version:1,schema:1,mode:state.mode,level:state.level,ticks:state.ticks,distance:state.distance,x:state.x,y:state.y,targetX:state.targetX,targetY:state.targetY,health:state.health,score:state.score,combo:state.combo,bestCombo:state.bestCombo,perfects:state.perfects,passed:state.passed,nearMisses:state.nearMisses,pearls:[...state.pearls],hits:[...state.hits],tail:clone(tail),tailClock};}
  function restore(data){const parsed=parseRibbonSave(data);if(!parsed)return false;reset(parsed.level);Object.assign(state,parsed,{mode:'paused',events:[],effects:[],stars:0});tail.length=0;tail.push(...parsed.tail.map(p=>({...p})));state.tail=tail;tailClock=parsed.tailClock;return true;}
  reset();return {state,start,steer,advance,pause,resume,snapshot,restore};
}
export function parseRibbonSave(data){try{
  if(!data||data.version!==1||data.schema!==1||!['playing','paused'].includes(data.mode)||!Number.isInteger(data.level)||data.level<1||data.level>5)return null;
  const r=LEVELS[data.level-1], finite=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b, integer=(v,a,b)=>Number.isInteger(v)&&v>=a&&v<=b;
  if(!integer(data.ticks,0,100000)||!finite(data.distance,0,r.length-.00001)||Math.abs(data.distance-data.ticks*STEP*SPEED)>.001||!finite(data.x,-4.2,4.2)||!finite(data.y,-2.35,2.35)||!finite(data.targetX,-4.2,4.2)||!finite(data.targetY,-2.35,2.35)||!integer(data.health,1,MAX_HEALTH)||!integer(data.score,0,1000000)||!integer(data.combo,0,r.gates.length)||!integer(data.bestCombo,0,r.gates.length)||!integer(data.perfects,0,r.gates.length)||!integer(data.passed,0,r.gates.length)||!integer(data.nearMisses,0,r.obstacles.length)||data.perfects>data.passed||data.combo>data.bestCombo||!finite(data.tailClock,0,.45))return null;
  const ids=(arr,max)=>Array.isArray(arr)&&arr.length<=max&&new Set(arr).size===arr.length&&arr.every(v=>integer(v,0,max-1));
  if(!ids(data.pearls,r.pearls.length)||!ids(data.hits,r.obstacles.length)||!Array.isArray(data.tail)||data.tail.length!==TAIL_LENGTH||!data.tail.every(p=>p&&finite(p.x,-4.2,4.2)&&finite(p.y,-2.35,2.35)&&finite(p.distance,-TAIL_LENGTH,data.distance)))return null;
  return clone(data);
}catch{return null;}}
