// Beam tracing is discrete and bounded: each direction/color state is visited once.
export const GRID_SIZE = 7;
const freeze = o => { if (o && typeof o === 'object') { Object.values(o).forEach(freeze); Object.freeze(o); } return o; };
const S=(x,z,color=7,dir=0)=>({x,z,color,dir}), M=(x,z,solution,initial=1-solution)=>({x,z,type:'mirror',initial,solution}), P=(x,z,solution,initial=1-solution)=>({x,z,type:'splitter',initial,solution}), F=(x,z,color)=>({x,z,type:'filter',color}), G=(x,z,color)=>({x,z,color});
const L=(id,name,subtitle,sources,pieces,flowers,hint)=>({id,name,subtitle,sources,pieces,flowers,hint});
export const LEVELS=freeze([
 L(1,'First light','A single turn can wake a whole garden.',[S(0,5,3)],[M(3,5,0)],[G(3,1,3)],'Tap the crystal so the light turns upward.'),
 L(2,'Two little turns','Follow the light around the corner.',[S(0,5,3)],[M(2,5,0),M(2,2,0)],[G(6,2,3)],'Turn both crystals to guide the beam around the bend.'),
 L(3,'The winding glow','Three crystals, one bright path.',[S(0,6,5)],[M(1,6,0),M(1,4,0,0),M(5,4,0)],[G(5,0,5)],'Follow the beam up, across, and up again.'),
 L(4,'A light shared','A diamond sends light two ways.',[S(0,5,3)],[P(2,5,0),M(4,2,0,0)],[G(2,1,3),G(6,5,3)],'Tap the diamond to send one beam upward and one straight on.'),
 L(5,'A new color','Two colors can meet in one flower.',[S(0,5,7),S(6,0,4,2)],[F(1,5,1),P(3,5,0),M(3,0,0),M(5,3,0,0)],[G(6,5,1),G(3,1,5)],'The red branch and blue beam need to meet at the upper flower.'),
 L(6,'Twin paths','Two colors, two winding journeys.',[S(0,6,1),S(6,6,4,2)],[M(1,6,0),M(1,3,0),M(3,3,1),M(5,6,1),M(5,2,1)],[G(3,5,1),G(2,2,4)],'Trace red upward, across, and down. Send blue up and left.'),
 L(7,'A little spectrum','Split the light and guide each color home.',[S(0,6,7)],[P(2,6,0),F(2,5,1),M(2,3,0),M(4,3,1),F(3,6,4),M(5,6,0),M(5,1,1)],[G(4,4,1),G(1,1,4)],'Split the light, then follow the red and blue branches through their filters.'),
 L(8,'The midnight bloom','Two winding beams meet beneath the stars.',[S(0,6,7),S(6,3,4,2)],[F(1,6,1),P(2,6,0),M(2,4,0),M(4,4,0),M(5,3,1),M(5,1,1),M(4,1,0)],[G(6,6,1),G(4,3,5)],'Split the red light. Guide the other red branch and the blue beam to meet at the pink flower.'),
]);
const dirs=[[1,0],[0,1],[-1,0],[0,-1]], reflect=[[3,2,1,0],[1,0,3,2]];
const clone=o=>JSON.parse(JSON.stringify(o));
export function trace(level,orientations){
 const beams=[], incoming=level.flowers.map(()=>0), queue=level.sources.map(s=>({...s})), seen=new Set();
 while(queue.length){let {x,z,dir,color}=queue.shift();for(let i=0;i<100;i++){
 const nx=x+dirs[dir][0],nz=z+dirs[dir][1]; if(nx<0||nz<0||nx>=7||nz>=7) break;
 beams.push({x,z,toX:nx,toZ:nz,color}); x=nx;z=nz;
 const key=`${x},${z},${dir},${color}`;if(seen.has(key))break;seen.add(key);
 const flower=level.flowers.findIndex(f=>f.x===x&&f.z===z);if(flower>=0){incoming[flower]|=color;break;}
 const index=level.pieces.findIndex(p=>p.x===x&&p.z===z), p=level.pieces[index];
 if(p?.type==='filter'){color &= p.color;if(!color)break;}
 if(p?.type==='mirror')dir=reflect[orientations[index]][dir];
 if(p?.type==='splitter')queue.push({x,z,dir:reflect[orientations[index]][dir],color});
 }}
 return {beams,lit:incoming.map((v,i)=>(v&level.flowers[i].color)===level.flowers[i].color),incoming};
}
export function createPrism({level=1}={}){
 const state={};let current=LEVELS[0];
 function update(){const t=trace(current,state.orientations);state.beams=t.beams;state.lit=t.lit;state.incoming=t.incoming;state.awake=t.lit.filter(Boolean).length;state.total=current.flowers.length;}
 function start(id=1){current=LEVELS[Math.max(0,Math.min(7,(Number.isInteger(id)?id:1)-1))];Object.assign(state,{mode:'playing',level:current.id,orientations:current.pieces.map(p=>p.initial??0),moves:0,hintUsed:false,hintIndex:null,stars:0,events:[]});update();return state;}
 function rotate(index){if(state.mode!=='playing'||!Number.isInteger(index)||!['mirror','splitter'].includes(current.pieces[index]?.type))return false;state.orientations[index]=1-state.orientations[index];state.moves++;state.hintIndex=null;update();state.events.push({type:'rotate',index});if(state.events.length>32)state.events.shift();if(state.awake===state.total){state.mode='won';const par=current.pieces.filter(p=>p.solution!==undefined&&p.initial!==p.solution).length,earned=state.moves<=par?3:state.moves<=par+3?2:1;state.stars=state.hintUsed?Math.min(2,earned):earned;state.events.push({type:'won',stars:state.stars});if(state.events.length>32)state.events.shift();}return true;}
 function hint(){if(state.mode!=='playing')return false;state.hintUsed=true;state.hintIndex=current.pieces.findIndex((p,i)=>p.solution!==undefined&&state.orientations[i]!==p.solution);if(state.hintIndex<0)state.hintIndex=null;return true;}
 function pause(){if(state.mode!=='playing')return false;state.mode='paused';return true;}
 function resume(){if(state.mode!=='paused')return false;state.mode='playing';return true;}
 function snapshot(){if(!['playing','paused','won'].includes(state.mode))return null;return {schema:1,level:state.level,mode:state.mode,orientations:[...state.orientations],moves:state.moves,hintUsed:state.hintUsed,stars:state.stars};}
 function restore(value){const data=parsePrismSave(value);if(!data)return false;start(data.level);Object.assign(state,{mode:data.mode==='won'?'won':'paused',orientations:[...data.orientations],moves:data.moves,hintUsed:data.hintUsed,stars:data.stars,events:[]});update();return true;}
 start(level);state.mode='ready';return {state,start,rotate,hint,pause,resume,snapshot,restore,get level(){return current;}};
}
export function parsePrismSave(v){try{if(!v||typeof v!=='object'||Array.isArray(v)||v.schema!==1||!Number.isInteger(v.level)||v.level<1||v.level>8||!['playing','paused','won'].includes(v.mode)||!Number.isSafeInteger(v.moves)||v.moves<0||v.moves>100000||typeof v.hintUsed!=='boolean'||!Number.isInteger(v.stars)||v.stars<0||v.stars>3)return null;const l=LEVELS[v.level-1];if(!Array.isArray(v.orientations)||v.orientations.length!==l.pieces.length||v.orientations.some((n,i)=>!Number.isInteger(n)||n<0||n>1||(l.pieces[i].type==='filter'&&n!==0)))return null;const changes=l.pieces.reduce((n,p,i)=>n+(p.type!=='filter'&&v.orientations[i]!==p.initial?1:0),0);if(v.moves<changes||(v.moves-changes)%2)return null;const won=trace(l,v.orientations).lit.every(Boolean);const par=l.pieces.filter(p=>p.solution!==undefined&&p.initial!==p.solution).length,earned=v.hintUsed?Math.min(2,v.moves<=par?3:v.moves<=par+3?2:1):v.moves<=par?3:v.moves<=par+3?2:1;if((v.mode==='won')!==won||(won?v.stars!==earned:v.stars!==0))return null;return clone({schema:1,level:v.level,mode:v.mode,orientations:v.orientations,moves:v.moves,hintUsed:v.hintUsed,stars:v.stars});}catch{return null;}}
