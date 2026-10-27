// Seven original, self-contained arcade adventures. Every rule uses a small
// fixed state, so the same games work with touch, mouse, keyboard and saves.

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const copy = value => JSON.parse(JSON.stringify(value));
const angleDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const int = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;

// Reject missing, malformed and non-finite data before it reaches a renderer.
function sameShape(value, template) {
  if (typeof template === 'number') return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e7;
  if (typeof template === 'boolean' || typeof template === 'string') return typeof value === typeof template;
  if (Array.isArray(template)) return Array.isArray(value) && value.length === template.length && template.every((v, i) => sameShape(value[i], v));
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(template).every(k => sameShape(value[k], template[k]));
}

function controller(id, state, { update, pointer, sync, hud, valid = () => true }) {
  const template = copy(state);
  return {
    state,
    update(dt) { if (state.mode === 'playing' && Number.isFinite(dt) && dt > 0) update(Math.min(dt, .05)); },
    pointer(type, x = 0, z = 0) {
      if (state.mode !== 'playing' || !['down', 'move', 'up', 'cancel'].includes(type)) return;
      pointer(type, clamp(Number.isFinite(x) ? x : 0, -6, 6), clamp(Number.isFinite(z) ? z : 0, -6, 6));
    },
    sync,
    hud,
    snapshot() { return { schema: 1, id, mode: state.mode, state: copy(state) }; },
    restore(data) {
      try {
        if (!data || data.schema !== 1 || data.id !== id || !['playing', 'won', 'lost'].includes(data.mode) || data.state?.mode !== data.mode || !sameShape(data.state, template) || !valid(data.state)) return false;
        for (const key of Object.keys(template)) state[key] = copy(data.state[key]);
        // Interrupted gestures never repeat a release or remain held after reload.
        if ('holding' in state) state.holding = false;
        if ('aiming' in state) state.aiming = false;
        sync(); return true;
      } catch { return false; }
    },
  };
}

function workshop(THREE, root) {
  const materials = new Map();
  const sphere = new THREE.SphereGeometry(1, 12, 8), cube = new THREE.BoxGeometry(1, 1, 1);
  const cone = new THREE.ConeGeometry(1, 1, 9), cylinder = new THREE.CylinderGeometry(1, 1, 1, 16);
  const torus = new THREE.TorusGeometry(1, .07, 6, 32);
  function material(color) {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: .75, metalness: .02 }));
    return materials.get(color);
  }
  function part(parent, kind, color, x, y, z, sx, sy = sx, sz = sx) {
    const geo = { sphere, cube, cone, cylinder, torus }[kind];
    const mesh = new THREE.Mesh(geo, material(color));
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
    if (kind === 'torus') mesh.rotation.x = Math.PI / 2;
    parent.add(mesh); return mesh;
  }
  function group(parent = root) { const g = new THREE.Group(); parent.add(g); return g; }
  function ground(color, trim) {
    part(root, 'cube', color, 0, -.31, 0, 12.15, .5, 12.15);
    for (const [x, z, sx, sz] of [[-5.9,0,.12,12],[5.9,0,.12,12],[0,-5.9,12,.12],[0,5.9,12,.12]]) part(root,'cube',trim,x,.015,z,sx,.06,sz);
  }
  function star(parent, color, x, y, z, size = .24) {
    const g = group(parent);
    part(g, 'sphere', color, 0, 0, 0, size, size, size);
    const a = part(g,'cube',color,0,0,0,size*3,.08,size*.5); a.rotation.y = Math.PI / 4;
    const b = part(g,'cube',color,0,.02,0,size*3,.08,size*.5); b.rotation.y = -Math.PI / 4;
    g.position.set(x,y,z); return g;
  }
  // Each creature has a distinctive profile, rather than a recolored mascot.
  function character(kind) {
    const g = group();
    g.name = 'Hero';
    const eye = (x, y, z, scale=.11) => part(g,'sphere','#142f3c',x,y,z,scale,scale,scale);
    if (kind === 'owl') {
      part(g,'sphere','#87bde9',0,.73,0,.54,.65,.42);
      part(g,'sphere','#f6ecd6',0,.72,.35,.36,.43,.09);
      for (const x of [-.33,.33]) { const ear=part(g,'cone','#729cd5',x,1.3,-.08,.19,.42,.19); ear.rotation.z=x<0?.3:-.3; eye(x*.55,1,.37); }
      const beak=part(g,'cone','#ffbe78',0,.82,.43,.12,.25,.12); beak.rotation.x=Math.PI/2;
      for (const x of [-.55,.55]) { const wing=part(g,'sphere','#6e9fce',x,.7,0,.26,.44,.18); wing.rotation.z=x<0?-.45:.45; }
    } else if (kind === 'hedgehog') {
      part(g,'sphere','#896cae',0,.52,-.04,.62,.52,.58);
      for(let i=0;i<9;i++){const a=i*Math.PI*2/9;const q=part(g,'cone','#5a4a84',Math.cos(a)*.48,.9,Math.sin(a)*.38,.17,.6,.17);q.rotation.z=-Math.cos(a)*.4;q.rotation.x=Math.sin(a)*.4;}
      part(g,'sphere','#efd8b7',0,.5,.42,.43,.36,.23); eye(-.17,.64,.61,.075);eye(.17,.64,.61,.075);part(g,'sphere','#50445f',0,.47,.67,.09);
    } else if (kind === 'squirrel') {
      part(g,'sphere','#dca46f',0,.65,.02,.38,.57,.3);
      for(const x of [-.31,.31]) { const ear=part(g,'sphere','#e5b68e',x,1.22,-.06,.16,.32,.12);ear.rotation.z=x<0?-.25:.25;eye(x*.53,.96,.28,.07); }
      part(g,'sphere','#f6e4c2',0,.67,.28,.25,.32,.07);
      const tail=part(g,'sphere','#c17758',0,.75,-.52,.55,.65,.24);tail.rotation.z=.45;
      for(const x of [-.58,.58]) { const wing=part(g,'sphere','#f6d3a7',x,.62,0,.43,.12,.36);wing.rotation.z=x<0?-.17:.17; }
    } else if (kind === 'octopus') {
      part(g,'sphere','#8b8ce1',0,.8,0,.48,.57,.43);
      for(let i=0;i<8;i++){const a=i*Math.PI/4;const tent=part(g,'sphere','#736fc5',Math.cos(a)*.58,.25,Math.sin(a)*.55,.38,.13,.17);tent.rotation.y=-a;part(g,'sphere','#d8c2f1',Math.cos(a)*.82,.26,Math.sin(a)*.77,.12,.12,.12);}
      eye(-.17,1,.36,.07);eye(.17,1,.36,.07);part(g,'sphere','#f5b5d1',0,.74,.42,.10,.07,.05);
    } else if (kind === 'crab') {
      part(g,'sphere','#f18d78',0,.42,0,.58,.31,.4);
      for(const x of [-.66,.66]) { const claw=part(g,'sphere','#f6b08b',x,.53,.34,.29,.22,.22);claw.rotation.z=x<0?-.35:.35; }
      for(let i=0;i<3;i++)for(const side of [-1,1]) {const leg=part(g,'cube','#d16a69',side*.56,.16,-.30+i*.25,.46,.08,.08);leg.rotation.y=side*.55;}
      for(const x of [-.22,.22]) {part(g,'cylinder','#f18d78',x,.78,.1,.05,.4,.05);eye(x,.99,.13,.09);}
    } else if (kind === 'beetle') {
      part(g,'sphere','#77aa79',0,.43,0,.58,.35,.67);part(g,'sphere','#a4cb8b',0,.62,-.05,.48,.16,.57);
      part(g,'cube','#4e805f',0,.79,-.05,.035,.025,1.05);
      for(const side of [-1,1])for(let i=0;i<3;i++) {const leg=part(g,'cube','#50775d',side*.62,.15,-.4+i*.35,.5,.08,.09);leg.rotation.y=side*.5;}
      for(const x of [-.27,.27]) { eye(x,.61,.55,.07);const horn=part(g,'cylinder','#50775d',x,.94,.45,.035,.45,.035);horn.rotation.z=x<0?.3:-.3; }
    } else {
      part(g,'sphere','#f0a4ba',0,.56,0,.5,.4,.55);part(g,'sphere','#ffd2d5',0,.62,.38,.4,.29,.23);
      for(const x of [-.19,.19])eye(x,.72,.58,.065);
      for(const side of [-1,1])for(let i=0;i<3;i++){const fin=part(g,'sphere','#d66caa',side*(.57+i*.12),.65+i*.07,.03,.23,.08,.10);fin.rotation.y=side*(.3+i*.2);}
      const tail=part(g,'sphere','#db82ab',0,.37,-.63,.23,.13,.55);tail.rotation.y=.4;
    }
    return g;
  }
  return { part, group, ground, star, character };
}

function railLark(ctx) {
  const { THREE, root } = ctx, w = workshop(THREE, root);
  w.ground('#354f72','#a9def0');
  for (const x of [-3.3,0,3.3]) w.part(root,'cube','#6e96bc',x,.02,0,.12,.04,11.5);
  const hero=w.character('owl'); hero.position.set(0,.1,4.25);
  const lanes=[-3.3,0,3.3], items=[];
  for(let i=0;i<44;i++) {
    const g=w.group();
    if(i%2===0) w.star(g,'#ffdf89',0,.35,0,.25);
    else {w.part(g,'sphere','#ee8792',0,.3,0,.36);for(let n=0;n<5;n++){const a=n*Math.PI*2/5;const q=w.part(g,'cone','#ffb4a6',Math.cos(a)*.28,.4,Math.sin(a)*.28,.1,.4,.1);q.rotation.z=Math.cos(a)*.5;}}
    items.push(g);
  }
  const state={mode:'playing',time:0,spawned:0,score:0,health:3,lane:1,items:Array.from({length:44},(_,i)=>({lane:0,kind:i%2===0?1:2,z:-8,status:0}))};
  function update(dt){
    state.time+=dt;
    while(state.spawned<22 && state.time>=.35+state.spawned*1.02){const n=state.spawned, lane=(n*7+Math.floor(n/4))%3;const note=state.items[n*2],hazard=state.items[n*2+1];Object.assign(note,{lane,z:-5.5,status:1});Object.assign(hazard,{lane:(lane+1+n%2)%3,z:-5.5,status:1});state.spawned++;}
    for(const it of state.items)if(it.status===1){it.z+=dt*(3.6+Math.min(state.spawned,20)*.035);if(it.z>=4.2){if(it.lane===state.lane){if(it.kind===1)state.score++;else state.health--;}it.status=2;}}
    if(state.health<=0)state.mode='lost';else if(state.spawned===22&&state.items.every(it=>it.status!==1))state.mode=state.score>=14?'won':'lost';
  }
  function pointer(type,x){if(type==='down'||type==='move')state.lane=x < -1.7 ? 0 : x > 1.7 ? 2 : 1;}
  function sync(){hero.position.x=lanes[state.lane];hero.rotation.z=(1-state.lane)*.13;state.items.forEach((it,i)=>{items[i].visible=it.status===1;items[i].position.set(lanes[it.lane],.1,it.z);items[i].rotation.y=state.time*1.4;});}
  sync();return controller('lane-lark',state,{update,pointer,sync,hud:()=>({primary:`${state.score} / 14 NOTES`,secondary:`${state.health} HEARTS`,hint:'Tap a rail to catch gold and dodge thorns.'}),valid:s=>int(s.lane,0,2)&&int(s.health,0,3)&&int(s.score,0,22)&&int(s.spawned,0,22)&&s.time>=0&&s.items.every((it,i)=>int(it.lane,0,2)&&int(it.status,0,2)&&it.kind===(i%2===0?1:2)&&it.z>=-8&&it.z<=4.4)});
}

function orbitGuard(ctx) {
  const {THREE,root}=ctx,w=workshop(THREE,root);w.ground('#293450','#7ba8c6');
  w.part(root,'torus','#698ba8',0,.08,0,4.5,4.5,4.5);w.part(root,'torus','#9cb7be',0,.1,0,1.4,1.4,1.4);
  const hero=w.character('hedgehog');hero.scale.setScalar(1.25);
  const shield=w.group();for(let i=-2;i<=2;i++){const a=i*.21;w.part(shield,'sphere','#7ce9d8',Math.cos(a)*1.55,.46,Math.sin(a)*1.55,.22,.25,.22);}
  const comet=w.group();w.star(comet,'#ffce83',0,.5,0,.27);w.part(comet,'sphere','#ff9d91',0,.35,-.32,.12,.12,.38);
  const state={mode:'playing',time:0,index:0,hits:0,health:4,angle:0,distance:5.5,cometAngle:0};
  function update(dt){state.time+=dt;state.distance-=dt*(2.25+state.index*.06);if(state.distance<=1.42){if(angleDiff(state.angle,state.cometAngle)<.58)state.hits++;else state.health--;state.index++;state.distance=5.5;state.cometAngle=(state.index*2.399963)%(Math.PI*2);if(state.health<=0)state.mode='lost';else if(state.index>=16)state.mode=state.hits>=13?'won':'lost';}}
  function pointer(type,x,z){if(type==='down'||type==='move')state.angle=Math.atan2(z,x);}
  function sync(){shield.rotation.y=-state.angle;comet.visible=state.mode==='playing';comet.position.set(Math.cos(state.cometAngle)*state.distance,.2,Math.sin(state.cometAngle)*state.distance);hero.rotation.y=-state.angle+Math.PI/2;}
  sync();return controller('orbit-guard',state,{update,pointer,sync,hud:()=>({primary:`${state.hits} / 13 SAVED`,secondary:`${state.health} HEARTS`,hint:'Drag the shield toward each falling star.'}),valid:s=>int(s.index,0,16)&&int(s.hits,0,16)&&int(s.health,0,4)&&s.distance>=0&&s.distance<=5.6&&Math.abs(s.angle)<=Math.PI&&s.cometAngle>=0&&s.cometAngle<=Math.PI*2&&s.time>=0});
}

function cloudSkimmer(ctx) {
  const {THREE,root}=ctx,w=workshop(THREE,root);w.ground('#b5d9eb','#e9f6f0');
  for(let i=0;i<9;i++)w.part(root,'sphere','#e6f4f0',-5+i*1.4,.05,i%2?-5.25:5.25,.58,.15,.27);
  const hero=w.character('squirrel');hero.position.x=-3.2;
  const rings=[];for(let i=0;i<10;i++){const g=w.group();w.part(g,'torus','#f6bf6c',0,.3,0,.82,.82,.82);w.star(g,'#fff3cc',0,.42,0,.12);rings.push(g);}
  const state={mode:'playing',time:0,z:0,velocity:0,holding:false,hits:0,misses:0,gates:Array.from({length:10},(_,i)=>({x:5.5+i*5.3,z:[0,-1.3,1.3,-2,1.7,-.8,2,-1.8,1,0][i],status:0}))};
  function update(dt){state.time+=dt;state.velocity=clamp(state.velocity+(state.holding?-9:7)*dt,-3.2,3.2);state.z=clamp(state.z+state.velocity*dt,-4.4,4.4);if(Math.abs(state.z)>=4.4)state.velocity=0;
    for(const gate of state.gates)if(gate.status===0){gate.x-=dt*3;if(gate.x<=-3.2){gate.status=1;if(Math.abs(state.z-gate.z)<1.05)state.hits++;else state.misses++;}}
    if(state.misses>2)state.mode='lost';else if(state.gates.every(g=>g.status===1))state.mode=state.hits>=8?'won':'lost';}
  function pointer(type){if(type==='down')state.holding=true;if(type==='up'||type==='cancel')state.holding=false;}
  function sync(){hero.position.z=state.z;hero.position.y=.4;hero.rotation.y=-Math.PI/2;hero.rotation.z=clamp(-state.velocity*.08,-.25,.25);state.gates.forEach((gate,i)=>{rings[i].visible=gate.status===0&&gate.x<=6;rings[i].position.set(gate.x,.3,gate.z);});}
  sync();return controller('cloud-skimmer',state,{update,pointer,sync,hud:()=>({primary:`${state.hits} / 8 RINGS`,secondary:`${Math.max(0,3-state.misses)} CHANCES`,hint:'Hold to rise; lift to drift down.'}),valid:s=>int(s.hits,0,10)&&int(s.misses,0,10)&&Math.abs(s.z)<=4.4&&Math.abs(s.velocity)<=3.2&&s.time>=0&&s.gates.every(g=>int(g.status,0,1)&&g.x>=-3.4&&g.x<=54&&Math.abs(g.z)<=4.4)&&s.hits+s.misses===s.gates.filter(g=>g.status===1).length});
}

function inkSling(ctx) {
  const {THREE,root}=ctx,w=workshop(THREE,root);w.ground('#274c66','#77d7d6');
  for(let i=0;i<8;i++){const x=-5.2+i*1.5;const leaf=w.part(root,'sphere',i%2?'#4caa99':'#76c3aa',x,.2,-5.4,.17,.24,.7);leaf.rotation.y=(i%2?1:-1)*.4;}
  const hero=w.character('octopus');hero.position.z=4;
  const shot=w.part(root,'sphere','#b4f8f3',0,.65,0,.22);const aim=w.group();
  for(let i=0;i<7;i++)w.part(aim,'sphere','#b4eee5',0,.3,0,.05+i*.012);
  const targets=[];for(let i=0;i<6;i++){const g=w.group();w.part(g,'torus','#ffcf93',0,.16,0,.59,.59,.59);w.part(g,'sphere','#f08fa2',0,.35,0,.27,.23,.27);for(let n=0;n<5;n++){const a=n*Math.PI*2/5;w.part(g,'sphere','#f6b3b4',Math.cos(a)*.32,.30,Math.sin(a)*.32,.13,.09,.13);}targets.push(g);}
  const state={mode:'playing',time:0,hits:0,aiming:false,aimX:0,aimZ:-3,shot:{active:false,x:0,z:4,vx:0,vz:0},targets:[{x:-3.5,z:-3.8,alive:true},{x:0,z:-4.2,alive:true},{x:3.5,z:-3.8,alive:true},{x:-2.4,z:-1.3,alive:true},{x:2.4,z:-1.3,alive:true},{x:0,z:-.3,alive:true}]};
  function pointer(type,x,z){if(type==='down'){state.aiming=true;state.aimX=x;state.aimZ=z;}else if(type==='move'&&state.aiming){state.aimX=x;state.aimZ=z;}else if(type==='cancel')state.aiming=false;else if(type==='up'&&state.aiming){state.aimX=x;state.aimZ=z;state.aiming=false;if(!state.shot.active){const dx=x, dz=z-4, size=Math.hypot(dx,dz);if(size>.15)Object.assign(state.shot,{active:true,x:0,z:4,vx:dx/size*9,vz:dz/size*9});}}}
  function update(dt){state.time+=dt;const p=state.shot;if(!p.active)return;const ox=p.x,oz=p.z;p.x+=p.vx*dt;p.z+=p.vz*dt;
    for(const target of state.targets)if(target.alive){const drift=Math.sin(state.time*1.15+target.z)*.23,x=target.x+drift;const dx=p.x-ox,dz=p.z-oz,len=dx*dx+dz*dz,t=len?clamp(((x-ox)*dx+(target.z-oz)*dz)/len,0,1):0;if(Math.hypot(x-ox-t*dx,target.z-oz-t*dz)<.64){target.alive=false;p.active=false;state.hits++;break;}}
    if(Math.abs(p.x)>6||Math.abs(p.z)>6)p.active=false;if(state.hits===6)state.mode='won';}
  function sync(){shot.visible=state.shot.active;shot.position.set(state.shot.x,.55,state.shot.z);targets.forEach((g,i)=>{const t=state.targets[i];g.visible=t.alive;g.position.set(t.x+Math.sin(state.time*1.15+t.z)*.23,0,t.z);g.rotation.y=state.time*.4;});aim.visible=state.aiming&&!state.shot.active;const dx=state.aimX,dz=state.aimZ-4,len=Math.hypot(dx,dz)||1;aim.children.forEach((p,i)=>p.position.set(dx/len*(i+1)*.45,.2,4+dz/len*(i+1)*.45));}
  sync();return controller('ink-sling',state,{update,pointer,sync,hud:()=>({primary:`${state.hits} / 6 BLOOMS`,secondary:state.shot.active?'BUBBLE IN FLIGHT':'READY TO AIM',hint:'Touch a bloom and lift to launch a bubble.'}),valid:s=>int(s.hits,0,6)&&s.time>=0&&s.hits===s.targets.filter(t=>!t.alive).length&&s.targets.every(t=>Math.abs(t.x)<=6&&Math.abs(t.z)<=6)&&Math.abs(s.shot.vx)<=9.01&&Math.abs(s.shot.vz)<=9.01&&Math.abs(s.aimX)<=6&&Math.abs(s.aimZ)<=6});
}

function bubbleBasket(ctx) {
  const {THREE,root}=ctx,w=workshop(THREE,root);w.ground('#254e68','#8bdccf');
  for(let i=0;i<12;i++){const x=-5.4+i*.98;w.part(root,'sphere',i%2?'#69a9a5':'#4b8e97',x,.05,5.5,.4,.09,.17);}
  const hero=w.character('crab');hero.position.z=4.15;
  const net=w.part(root,'torus','#ffe6b9',0,.15,4.15,.95,.95,.95);
  const drops=[];for(let i=0;i<20;i++){const g=w.group();const danger=i%4===3;w.part(g,'sphere',danger?'#db7288':'#a8f6f2',0,.5,0,danger?.34:.29);if(danger){for(let j=0;j<6;j++){const a=j*Math.PI/3;w.part(g,'sphere','#ef9aaa',Math.cos(a)*.36,.4,Math.sin(a)*.36,.13);}}else w.part(g,'sphere','#ffffff',-.1,.65,.1,.075);drops.push(g);}
  const state={mode:'playing',time:0,spawned:0,score:0,health:3,x:0,items:Array.from({length:20},(_,i)=>({x:Math.sin(i*2.3)*4.4,z:-7,status:0,danger:i%4===3}))};
  function update(dt){state.time+=dt;while(state.spawned<20&&state.time>=.4+state.spawned*.82){state.items[state.spawned].status=1;state.items[state.spawned].z=-5.5;state.spawned++;}
    for(const item of state.items)if(item.status===1){item.z+=dt*(3.35+state.spawned*.045);if(item.z>=4.1){if(Math.abs(item.x-state.x)<.95){if(item.danger)state.health--;else state.score++;}item.status=2;}}
    if(state.health<=0)state.mode='lost';else if(state.score>=12)state.mode='won';else if(state.spawned===20&&state.items.every(item=>item.status!==1))state.mode='lost';}
  function pointer(type,x){if(type==='down'||type==='move')state.x=clamp(x,-4.9,4.9);}
  function sync(){hero.position.x=state.x;net.position.x=state.x;state.items.forEach((it,i)=>{drops[i].visible=it.status===1;drops[i].position.set(it.x,0,it.z);});}
  sync();return controller('bubble-basket',state,{update,pointer,sync,hud:()=>({primary:`${state.score} / 12 PEARLS`,secondary:`${state.health} HEARTS`,hint:'Slide the crab under bubbles, not urchins.'}),valid:s=>int(s.score,0,15)&&int(s.health,0,3)&&int(s.spawned,0,20)&&Math.abs(s.x)<=4.9&&s.time>=0&&s.items.every((it,i)=>int(it.status,0,2)&&it.danger===(i%4===3)&&Math.abs(it.x)<=4.5&&it.z>=-7&&it.z<=4.4)});
}

function mossFlip(ctx) {
  const {THREE,root}=ctx,w=workshop(THREE,root);w.ground('#3e604d','#accb91');
  for(const z of [-2.6,2.6]){w.part(root,'cube','#a7bd7c',0,.03,z,11.8,.12,.25);for(let i=0;i<12;i++)w.part(root,'sphere','#d2d99d',-5.5+i, .13,z,.11,.08,.1);}
  const hero=w.character('beetle');hero.position.x=-3.2;hero.rotation.y=-Math.PI/2;
  const hazards=[];for(let i=0;i<22;i++){const g=w.group();for(let j=0;j<3;j++){const q=w.part(g,'cone','#d48876',(j-1)*.29,.35,0,.16,.65,.2);q.rotation.z=(j-1)*.13;}hazards.push(g);}
  const state={mode:'playing',time:0,lane:0,health:3,cleared:0,obstacles:Array.from({length:22},(_,i)=>({x:5.5+i*3.3,lane:[0,0,1,0,1,1,0,1,0,0,1][i%11],status:0}))};
  function pointer(type){if(type==='down')state.lane=1-state.lane;}
  function update(dt){state.time+=dt;for(const o of state.obstacles)if(o.status===0){o.x-=dt*(3.3+Math.min(state.cleared,18)*.04);if(o.x<=-3.2){o.status=1;state.cleared++;if(o.lane===state.lane)state.health--;}}
    if(state.health<=0)state.mode='lost';else if(state.cleared===22)state.mode='won';}
  function sync(){hero.position.z=state.lane===0?2.6:-2.6;hero.rotation.y=state.lane===0?-Math.PI/2:Math.PI/2;state.obstacles.forEach((o,i)=>{hazards[i].visible=o.status===0&&o.x<6;hazards[i].position.set(o.x,.1,o.lane===0?2.6:-2.6);});}
  sync();return controller('moss-flip',state,{update,pointer,sync,hud:()=>({primary:`${state.cleared} / 22 THORNS`,secondary:`${state.health} HEARTS`,hint:'Tap to flip between the two moss rails.'}),valid:s=>int(s.lane,0,1)&&int(s.health,0,3)&&int(s.cleared,0,22)&&s.time>=0&&s.obstacles.every(o=>int(o.lane,0,1)&&int(o.status,0,1)&&o.x>=-3.5&&o.x<=76)&&s.cleared===s.obstacles.filter(o=>o.status===1).length});
}

function bellBloom(ctx) {
  const {THREE,root}=ctx,w=workshop(THREE,root);w.ground('#504668','#d5bee4');
  for(let i=0;i<9;i++){const a=i*Math.PI*2/9;w.star(root,i%2?'#c4b4e9':'#eed0d5',Math.cos(a)*5,.1,Math.sin(a)*5,.13);}
  const hero=w.character('axolotl');hero.scale.setScalar(1.25);
  w.part(root,'torus','#f4d4a0',0,.07,0,1.45,1.45,1.45);const pulse=w.part(root,'torus','#8ee8e0',0,.12,0,1,1,1);
  const beatTimes=Array.from({length:14},(_,i)=>2+i*1.08+(i>4?Math.sin(i*1.8)*.18:0));
  const state={mode:'playing',time:0,index:0,hits:0,misses:0,faults:0,flash:0};
  function advanceBeat(){state.index++;if(state.index>=beatTimes.length)state.mode=state.hits>=10?'won':'lost';}
  function pointer(type){if(type!=='down')return;if(state.index>=beatTimes.length)return;if(Math.abs(state.time-beatTimes[state.index])<=.27){state.hits++;state.flash=.35;advanceBeat();}else{state.faults++;if(state.faults>=7)state.mode='lost';}}
  function update(dt){state.time+=dt;state.flash=Math.max(0,state.flash-dt);if(state.index<beatTimes.length&&state.time>beatTimes[state.index]+.27){state.misses++;advanceBeat();}}
  function sync(){const until=beatTimes[state.index]-state.time;const scale=clamp(1.45+until*.9,1.1,4.1);pulse.scale.set(scale,scale,scale);pulse.visible=state.mode==='playing';hero.scale.setScalar(1.25+state.flash*.6);}
  sync();return controller('bell-bloom',state,{update,pointer,sync,hud:()=>({primary:`${state.hits} / 10 BELLS`,secondary:`${state.index} / 14 BEATS`,hint:'Tap when the glowing ring meets the gold.'}),valid:s=>int(s.index,0,14)&&int(s.hits,0,14)&&int(s.misses,0,14)&&int(s.faults,0,7)&&s.hits+s.misses===s.index&&s.time>=0&&s.flash>=0&&s.flash<=.35});
}

export const games = [
  {id:'lane-lark',title:'Lane Lark',hero:'Pip the blue owl',tagline:'A sky full of songs.',instructions:'Tap or slide between the three rails. Catch gold notes and avoid the pink thorns. Collect at least 14 notes before the last rail passes.',background:'#263e5d',accent:'#b6eaff',create:railLark},
  {id:'orbit-guard',title:'Orbit Guard',hero:'Quill the star hedgehog',tagline:'One little shield. A whole sky.',instructions:'Drag around Quill to turn the turquoise shield. Catch the incoming stars before they reach the center. Save 13 of 16 stars.',background:'#263047',accent:'#9af7e1',create:orbitGuard},
  {id:'cloud-skimmer',title:'Cloud Skimmer',hero:'Hazel the flying squirrel',tagline:'Hold the sky in your paws.',instructions:'Hold anywhere to rise, then lift your finger to drift down. Glide through at least 8 of the 10 golden rings. You can miss two.',background:'#87bcd3',accent:'#ffedba',create:cloudSkimmer},
  {id:'ink-sling',title:'Ink Sling',hero:'Inky the bubble octopus',tagline:'A small splash makes flowers bloom.',instructions:'Touch a sea bloom, then lift to send a bubble toward it. Aim for all six drifting blooms; missed bubbles can be tried again.',background:'#20465c',accent:'#aaf5ee',create:inkSling},
  {id:'bubble-basket',title:'Bubble Basket',hero:'Coral the little crab',tagline:'A pocketful of ocean treasure.',instructions:'Slide left and right to catch bubbles in Coral’s basket. Gather 12 pearls and avoid the pink spiky urchins.',background:'#205064',accent:'#a2f1e5',create:bubbleBasket},
  {id:'moss-flip',title:'Moss Flip',hero:'Bramble the moss beetle',tagline:'Two sides to every little adventure.',instructions:'Tap anywhere to flip between the two moss rails. Avoid the coral thorns as the tunnel rolls by. Survive all 22 thorns.',background:'#325542',accent:'#d0eaa6',create:mossFlip},
  {id:'bell-bloom',title:'Bell Bloom',hero:'Mira the bell axolotl',tagline:'The garden has a heartbeat.',instructions:'Tap when the moving turquoise ring meets the gold circle. Make at least 10 of 14 bells bloom; too many early taps end the song.',background:'#423854',accent:'#dfc9fa',create:bellBloom},
];
