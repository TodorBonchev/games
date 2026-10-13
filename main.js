import * as THREE from 'three';import {makeSoldier} from './soldier.js';import {makeHeli,makeChute} from './heli.js';
const $=id=>document.getElementById(id),Q=new URLSearchParams(location.search);
const MOBILE=matchMedia('(pointer:coarse)').matches||'ontouchstart' in window;
if(MOBILE)document.body.classList.add('touch');
const renderer=new THREE.WebGLRenderer({antialias:!MOBILE});renderer.setPixelRatio(Math.min(devicePixelRatio,MOBILE?1.5:2));renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.fog=new THREE.Fog(0xbfe6ff,35,95);
const cam=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,.1,500);cam.rotation.order='YXZ';
// sky
scene.add(new THREE.Mesh(new THREE.SphereGeometry(400,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,
 vertexShader:'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:'varying vec3 p;void main(){float h=normalize(p).y;vec3 c=mix(vec3(.75,.9,1.),vec3(.18,.5,.95),smoothstep(0.,.6,h));c=mix(c,vec3(1.,.85,.6),pow(max(0.,1.-abs(h)*4.),3.)*.4);gl_FragColor=vec4(c,1.);}'})));
scene.add(new THREE.HemisphereLight(0xcfe8ff,0x6a8a3a,1.1));
const sun=new THREE.DirectionalLight(0xfff1d6,2.2);sun.castShadow=true;const S=MOBILE?1024:2048;sun.shadow.mapSize.set(S,S);
Object.assign(sun.shadow.camera,{left:-25,right:25,top:25,bottom:-25,near:1,far:120});sun.shadow.bias=-.0005;sun.shadow.normalBias=.03;scene.add(sun,sun.target);
// toon mats
const grad=new THREE.DataTexture(new Uint8Array([90,170,255]),3,1,THREE.RedFormat);grad.needsUpdate=true;
const toon=(color,map)=>new THREE.MeshToonMaterial({color,map,gradientMap:grad});
const tex=(draw,rep)=>{const c=document.createElement('canvas');c.width=c.height=128;draw(c.getContext('2d'));const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rep,rep);t.colorSpace=THREE.SRGBColorSpace;return t;};
const grassT=tex(g=>{g.fillStyle='#5fbf3a';g.fillRect(0,0,128,128);for(let i=0;i<500;i++){g.fillStyle=['#6fd246','#4fa82e','#7ddc55'][i%3];g.fillRect(Math.random()*128,Math.random()*128,2,5);}},40);
const ARENA=48;const ground=new THREE.Mesh(new THREE.PlaneGeometry(260,260),toon(0xffffff,grassT));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
const solids=[],boxes=[];
const add=(geo,mat,x,y,z,col)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;scene.add(m);solids.push(m);if(col)boxes.push({x,z,hx:col[0],hz:col[1]});return m;};
const rnd=(a,b)=>a+Math.random()*(b-a);const freeSpot=(r)=>{let x,z;do{x=rnd(-ARENA+3,ARENA-3);z=rnd(-ARENA+3,ARENA-3)}while(Math.hypot(x,z)<8||boxes.some(b=>Math.abs(b.x-x)<b.hx+r&&Math.abs(b.z-z)<b.hz+r));return[x,z];};
// buildings
const wallM=[toon(0xf2d49b),toon(0xe8a87c),toon(0xa8d8ea)],roofM=[toon(0xd94f3d),toon(0x3d6fd9),toon(0x8a4fd9)];
[[18,14],[-20,-16],[-16,22],[22,-22]].forEach(([x,z],i)=>{const w=rnd(6,9),d=rnd(6,8),h=rnd(4,6);add(new THREE.BoxGeometry(w,h,d),wallM[i%3],x,h/2,z,[w/2,d/2]);
 const r=add(new THREE.ConeGeometry(Math.max(w,d)*.75,3,4),roofM[i%3],x,h+1.5,z);r.rotation.y=Math.PI/4;r.scale.set(w/Math.max(w,d),1,d/Math.max(w,d));
 add(new THREE.BoxGeometry(1.4,2.4,.1),toon(0x6b4423),x,1.2,z+d/2+.05);});
// walls
for(let i=0;i<6;i++){const[x,z]=freeSpot(4);const l=rnd(4,8),rot=Math.random()<.5;add(new THREE.BoxGeometry(rot?l:.6,1.6,rot?.6:l),toon(0xc9c3b5),x,.8,z,rot?[l/2,.3]:[.3,l/2]);}
// crates
const crateT=tex(g=>{g.fillStyle='#c98b3c';g.fillRect(0,0,128,128);g.strokeStyle='#7a4f1c';g.lineWidth=10;g.strokeRect(5,5,118,118);g.beginPath();g.moveTo(5,5);g.lineTo(123,123);g.stroke();},1);
for(let i=0;i<14;i++){const[x,z]=freeSpot(1.5);const s=rnd(1,1.8);add(new THREE.BoxGeometry(s,s,s),toon(0xffffff,crateT),x,s/2,z,[s/2,s/2]).rotation.y=0;}
// rocks
for(let i=0;i<14;i++){const[x,z]=freeSpot(1.5);const s=rnd(.6,1.6);const r=add(new THREE.DodecahedronGeometry(s,0),toon(0x9aa3ad),x,s*.4,z,[s*.8,s*.8]);r.rotation.set(rnd(0,3),rnd(0,3),0);r.material.flatShading=true;}
// trees
const leafM=[toon(0x3fbf3f),toon(0x2fa84f),toon(0x7ccf2a)],trunkM=toon(0x8b5a2b);
for(let i=0;i<(MOBILE?22:34);i++){let x,z;if(i<14){const a=rnd(0,6.28),r=rnd(ARENA+2,ARENA+14);x=Math.cos(a)*r;z=Math.sin(a)*r;}else[x,z]=freeSpot(1.2);
 const h=rnd(2,3.5);add(new THREE.CylinderGeometry(.25,.35,h,8),trunkM,x,h/2,z,[.4,.4]);const l=add(new THREE.IcosahedronGeometry(rnd(1.4,2.2),0),leafM[i%3],x,h+1,z);l.material.flatShading=true;}
// player
const player=makeSoldier();scene.add(player);
// audio
let ac;const snd=(f,d,type='square',v=.15,slide=.3)=>{if(!ac)return;const o=ac.createOscillator(),g=ac.createGain();o.type=type;o.frequency.setValueAtTime(f,ac.currentTime);o.frequency.exponentialRampToValueAtTime(f*slide,ac.currentTime+d);
 g.gain.setValueAtTime(v,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+d);o.connect(g).connect(ac.destination);o.start();o.stop(ac.currentTime+d);};
// input
let yaw=0,pitch=-.1,firing=false,running=false;const keys={};
addEventListener('keydown',e=>{keys[e.code]=true;if(mode==='intro'){skipIntro();return;}if(e.code==='Space'){jump();e.preventDefault();}});addEventListener('keyup',e=>keys[e.code]=false);
const cv=renderer.domElement;
cv.addEventListener('mousedown',()=>{if(mode==='intro'){skipIntro();return;}if(!running||MOBILE)return;if(document.pointerLockElement!==cv){try{const r=cv.requestPointerLock();r&&r.catch&&r.catch(()=>{});}catch(e){}}firing=true;});
addEventListener('mouseup',()=>firing=false);
addEventListener('mousemove',e=>{if(document.pointerLockElement===cv&&Math.abs(e.movementX)<150&&Math.abs(e.movementY)<150)look(e.movementX,e.movementY,.0025);});
const look=(dx,dy,k)=>{yaw-=dx*k;pitch=THREE.MathUtils.clamp(pitch-dy*k,-.7,.55);};
const stick={id:null,ox:0,oy:0,x:0,y:0},lk={id:null,x:0,y:0};let fireId=null;const knob=$('stick').firstChild;
addEventListener('touchstart',e=>{if(e.target.tagName==='BUTTON')return;e.preventDefault();if(mode==='intro'){skipIntro();return;}document.body.classList.add('touch');
 for(const t of e.changedTouches){const el=t.target;if(el.id==='jumpBtn'){jump();continue;}
  if(el.id==='fireBtn'){fireId=t.identifier;if(lk.id===null)Object.assign(lk,{id:t.identifier,x:t.clientX,y:t.clientY});continue;}
  if(t.clientX<innerWidth/2&&stick.id===null){const r=$('stick').getBoundingClientRect();Object.assign(stick,{id:t.identifier,ox:r.left+65,oy:r.top+65});moveStick(t);}
  else if(lk.id===null)Object.assign(lk,{id:t.identifier,x:t.clientX,y:t.clientY});}},{passive:false});
function moveStick(t){let dx=t.clientX-stick.ox,dy=t.clientY-stick.oy;const d=Math.hypot(dx,dy);if(d>55){dx*=55/d;dy*=55/d;}stick.x=dx/55;stick.y=dy/55;knob.style.transform=`translate(${dx}px,${dy}px)`;}
addEventListener('touchmove',e=>{e.preventDefault();for(const t of e.changedTouches){if(t.identifier===stick.id)moveStick(t);if(t.identifier===lk.id){look(t.clientX-lk.x,t.clientY-lk.y,.006);lk.x=t.clientX;lk.y=t.clientY;}}},{passive:false});
const tend=e=>{for(const t of e.changedTouches){if(t.identifier===stick.id){stick.id=null;stick.x=stick.y=0;knob.style.transform='';}if(t.identifier===lk.id)lk.id=null;if(t.identifier===fireId)fireId=null;}};
addEventListener('touchend',tend);addEventListener('touchcancel',tend);
['gesturestart','dblclick','contextmenu'].forEach(ev=>addEventListener(ev,e=>e.preventDefault(),{passive:false}));
const onResize=()=>{cam.aspect=innerWidth/innerHeight;cam.fov=innerHeight>innerWidth?85:70;cam.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);};
addEventListener('resize',onResize);addEventListener('orientationchange',()=>setTimeout(onResize,250));onResize();
// zombies
const zSkin=toon(0x7fdc4a),shirts=[0xa04fd9,0xff8c2a,0x2ab3ff,0xe03a7a].map(c=>toon(c)),zPants=toon(0x3d4a8a),eyeM=new THREE.MeshBasicMaterial({color:0xff2a00});
function makeZombie(){const g=new THREE.Group(),mats=[zSkin.clone(),shirts[Math.random()*4|0].clone(),zPants.clone()];mats.forEach(m=>m.transparent=true);
 const M=(geo,m,x,y,z,p=g)=>{const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);o.castShadow=true;p.add(o);o.userData.root=g;return o};
 M(new THREE.CapsuleGeometry(.26,.35,4,10),mats[1],0,1.3,0).scale.set(1.1,1,.7);const head=M(new THREE.SphereGeometry(.24,14,10),mats[0],0,1.9,.06);M(new THREE.SphereGeometry(.05,8,6),eyeM,-.09,.04,.21,head);M(new THREE.SphereGeometry(.05,8,6),eyeM,.09,.04,.21,head);
 const legs=[];for(const x of[-.15,.15]){const l=new THREE.Group();l.position.set(x,.95,0);g.add(l);M(new THREE.CapsuleGeometry(.11,.65,4,8),mats[2],0,-.47,0,l);legs.push(l);}
 const arms=[];for(const x of[-.38,.38]){const a=new THREE.Group();a.position.set(x,1.55,0);g.add(a);M(new THREE.CapsuleGeometry(.08,.55,4,8),mats[0],0,-.35,0,a);a.rotation.x=-1.5;arms.push(a);}
 g.userData={legs,arms,mats,head,hp:0,dead:0,ph:Math.random()*6};return g;}
let zombies=[],tracers=[],score=0,wave=0,hp=100,toSpawn=0,spawnT=0,fireT=0,vy=0,anim=0,curSpeed=0;
const ZCAP=MOBILE?14:30;
function reset(){toSpawn=0;debris.forEach(d=>scene.remove(d.o));debris=[];lockT=null;zombies.forEach(z=>scene.remove(z));zombies=[];score=0;wave=0;hp=100;player.position.set(0,0,0);yaw=0;pitch=-.1;vy=0;nextWave();updHud();}
function nextWave(){if(mode!=='play')return;wave++;toSpawn=4+wave*3;spawnT=1;snd(200,.6,'sawtooth',.1,2);}
function spawn(){const z=makeZombie();let x,zz,tries=0;do{const a=Math.random()*Math.PI*2,r=rnd(22,32);x=player.position.x+Math.cos(a)*r;zz=player.position.z+Math.sin(a)*r;x=THREE.MathUtils.clamp(x,-ARENA,ARENA);zz=THREE.MathUtils.clamp(zz,-ARENA,ARENA);}
 while(tries++<10&&boxes.some(b=>Math.abs(b.x-x)<b.hx+.5&&Math.abs(b.z-zz)<b.hz+.5));z.position.set(x,0,zz);
 z.userData.hp=2+Math.floor(wave/2);z.userData.speed=1.4+wave*.15+Math.random()*.6;scene.add(z);zombies.push(z);}
function updHud(){$('score').textContent=score;$('wave').textContent=wave;$('hp').style.width=Math.max(0,hp)+'%';}
function collide(p,r){for(const b of boxes){const cx=THREE.MathUtils.clamp(p.x,b.x-b.hx,b.x+b.hx),cz=THREE.MathUtils.clamp(p.z,b.z-b.hz,b.z+b.hz);const dx=p.x-cx,dz=p.z-cz,d=Math.hypot(dx,dz);
 if(d<r){if(d>1e-4){p.x=cx+dx/d*r;p.z=cz+dz/d*r;}else{p.x+=r;}}}p.x=THREE.MathUtils.clamp(p.x,-ARENA,ARENA);p.z=THREE.MathUtils.clamp(p.z,-ARENA,ARENA);}
function jump(){if(running&&player.position.y<=0.001){vy=6.5;snd(300,.15,'sine',.1,2);}}
const rc=new THREE.Raycaster(),center=new THREE.Vector2(0,0);
function shoot(){const u=player.userData;u.flash.visible=true;u.flashLight.intensity=8;u.flash.rotation.z=Math.random()*3;setTimeout(()=>{u.flash.visible=false;u.flashLight.intensity=0;},45);snd(900,.08,'square',.12,.2);
 if(lockT){const hp_=new THREE.Vector3();lockT.userData.head.getWorldPosition(hp_);rc.set(cam.position,hp_.sub(cam.position).normalize());}else rc.setFromCamera(center,cam);rc.far=120;const hits=rc.intersectObjects([...zombies.filter(z=>!z.userData.dead),...solids,ground],true);
 const o=new THREE.Vector3();u.muzzle.getWorldPosition(o);let end=hits.length?hits[0].point:rc.ray.at(120,new THREE.Vector3());
 if(hits.length){const z=hits[0].object.userData.root;if(z&&!z.userData.dead){z.userData.hp--;z.userData.hit=.1;const p=end.clone().sub(o).setY(0).normalize();z.position.addScaledVector(p,.25);
  if(z.userData.hp<=0){z.userData.dead=.001;decap(z,p);score+=10;snd(120,.4,'sawtooth',.15,.5);updHud();}}}
 const t=new THREE.Line(new THREE.BufferGeometry().setFromPoints([o,end]),new THREE.LineBasicMaterial({color:0xfff27a,transparent:true}));t.userData.life=.06;scene.add(t);tracers.push(t);}
const camRc=new THREE.Raycaster();const clock=new THREE.Clock();const closeup=Q.get('view')==='closeup';
const fwd=new THREE.Vector3(),right=new THREE.Vector3(),v=new THREE.Vector3();
function loop(){requestAnimationFrame(loop);const dt=Math.min(clock.getDelta(),.05),T=clock.elapsedTime;
 fwd.set(-Math.sin(yaw),0,-Math.cos(yaw));right.set(Math.cos(yaw),0,-Math.sin(yaw));
 if(running){let mx=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0),sx=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0);
  if(stick.id!==null){mx-=stick.y;sx+=stick.x;}v.set(0,0,0).addScaledVector(fwd,mx).addScaledVector(right,sx);let m=v.length();if(m>1){v.divideScalar(m);m=1;}if(m<.15)m=0;
  player.position.addScaledVector(v,m?6.5*dt:0);collide(player.position,.4);curSpeed=m;anim+=dt*(m?1:0);
  vy-=20*dt;player.position.y=Math.max(0,player.position.y+vy*dt);if(player.position.y===0)vy=0;
  player.rotation.y=yaw+Math.PI;
  autoAim(dt);fireT-=dt;if((firing||fireId!==null)&&fireT<=0){shoot();fireT=.1;}
  const alive=zombies.filter(z=>!z.userData.dead).length;
  if(toSpawn>0){spawnT-=dt;if(spawnT<=0&&alive<ZCAP){spawn();toSpawn--;spawnT=Math.max(.35,1.4-wave*.1);}}else if(!zombies.length){nextWave();updHud();}
  for(const z of [...zombies]){const u=z.userData;
   if(u.dead){u.dead+=dt;z.rotation.x=Math.max(-Math.PI/2,-u.dead*3);u.mats.forEach(m=>m.opacity=Math.max(0,1-(u.dead-3)));if(u.dead>4.1){scene.remove(z);zombies.splice(zombies.indexOf(z),1);}continue;}
   if(u.hit>0){u.hit-=dt;u.mats[0].emissive.setHex(0xffffff);}else u.mats[0].emissive.setHex(0);
   const d=player.position.clone().sub(z.position);d.y=0;const dist=d.length();z.rotation.y=Math.atan2(d.x,d.z);u.ph+=dt*5;
   u.legs[0].rotation.x=Math.sin(u.ph)*.45;u.legs[1].rotation.x=-Math.sin(u.ph)*.45;u.arms[0].rotation.x=-1.5+Math.sin(u.ph)*.12;u.arms[1].rotation.x=-1.5-Math.sin(u.ph)*.12;z.rotation.z=Math.sin(u.ph*.5)*.12;
   if(dist>1){z.position.addScaledVector(d.normalize(),u.speed*dt);collide(z.position,.35);}
   else if(player.position.y<1.2){hp-=22*dt;updHud();if(Math.random()<dt*3)snd(80,.2,'sawtooth',.1,.5);
    if(hp<=0){running=false;mode='over';lockT=null;firing=false;fireId=null;document.body.classList.remove('playing');document.exitPointerLock&&document.exitPointerLock();$('final').textContent=`Score ${score} · Wave ${wave}`;$('over').classList.remove('hide');snd(300,1.2,'sawtooth',.2,.1);}}}
 }
 if(mode==='intro')intro(dt);updDebris(dt);updLock();
 player.userData.animate(T,curSpeed,mode==='intro'?introAir:player.position.y>.05,dt);
 for(const t of [...tracers]){t.userData.life-=dt;t.material.opacity=t.userData.life/.06;if(t.userData.life<=0){scene.remove(t);t.geometry.dispose();tracers.splice(tracers.indexOf(t),1);}}
 const P=player.position;
 if(closeup&&!running){player.rotation.y=-Math.PI*.1;cam.position.set(P.x+.15,1.4,P.z+2.3);cam.lookAt(P.x,1.15,P.z);}
 else if(mode!=='intro'){cam.rotation.set(pitch,yaw,0);const f=new THREE.Vector3(0,0,-1).applyEuler(cam.rotation);const piv=new THREE.Vector3(P.x,P.y+1.75,P.z).addScaledVector(right,.8);const back=f.clone().negate();camRc.set(piv,back);camRc.far=4;const ch=camRc.intersectObjects(solids,false);const cd=ch.length?Math.max(.4,ch[0].distance-.3):4;cam.position.copy(piv).addScaledVector(back,cd);if(cam.position.y<.3)cam.position.y=.3;}
 sun.position.set(P.x+20,40,P.z+15);sun.target.position.set(P.x,0,P.z);
 renderer.render(scene,cam);}
function begin(){ac=ac||new(window.AudioContext||window.webkitAudioContext)();ac.resume&&ac.resume();$('start').classList.add('hide');$('over').classList.add('hide');reset();fireT=0;startIntro();}
$('startBtn').onclick=begin;$('restartBtn').onclick=begin;
if(closeup){$('start').classList.add('hide');$('hud').classList.add('hide');}

// ===== auto-aim =====
let lockT=null;const lockEl=$('lock'),tmpV=new THREE.Vector3(),losRc=new THREE.Raycaster();
const angD=a=>Math.atan2(Math.sin(a),Math.cos(a));
function los(z){z.userData.head.getWorldPosition(tmpV);const d=tmpV.clone().sub(cam.position);const L=d.length();losRc.set(cam.position,d.normalize());losRc.far=L;return !losRc.intersectObjects(solids,false).length;}
function autoAim(dt){const want=firing||fireId!==null;if(!want){lockT=null;return;}
 if(lockT&&(lockT.userData.dead||!zombies.includes(lockT)))lockT=null;
 if(!lockT){let best=null,bs=1e9;const f=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
  for(const z of zombies){if(z.userData.dead)continue;const d=z.position.clone().sub(player.position);d.y=0;const dist=d.length();if(dist>45)continue;
   const ang=Math.acos(THREE.MathUtils.clamp(d.normalize().dot(f),-1,1));let s=dist+ang*6+(los(z)?0:40);if(s<bs){bs=s;best=z;}}lockT=best;}
 if(!lockT)return;lockT.userData.head.getWorldPosition(tmpV);const d=tmpV.clone().sub(cam.position).normalize();
 const ty=Math.atan2(-d.x,-d.z),tp=THREE.MathUtils.clamp(Math.asin(d.y),-.7,.55);const k=Math.min(1,dt*12);yaw+=angD(ty-yaw)*k;pitch+=(tp-pitch)*k;}
function updLock(){if(!lockT||lockT.userData.dead){lockEl.style.display='none';return;}lockT.userData.head.getWorldPosition(tmpV);tmpV.project(cam);
 if(tmpV.z>1){lockEl.style.display='none';return;}lockEl.style.display='block';lockEl.style.left=((tmpV.x+1)/2*innerWidth)+'px';lockEl.style.top=((1-tmpV.y)/2*innerHeight)+'px';}
// ===== decapitation + blood =====
let debris=[];let headsDetached=0;
function decap(z,dir){const h=z.userData.head;scene.attach(h);headsDetached++;
 debris.push({o:h,v:new THREE.Vector3(dir.x*3+rnd(-1,1),rnd(5,7),dir.z*3+rnd(-1,1)),s:new THREE.Vector3(rnd(-12,12),rnd(-12,12),rnd(-12,12)),t:0,r:.24,mat:h.material});
 const n=MOBILE?24:40,pos=new Float32Array(n*3),col=new Float32Array(n*3),vel=[];h.getWorldPosition(tmpV);
 for(let i=0;i<n;i++){pos.set([tmpV.x,tmpV.y-.15,tmpV.z],i*3);const g=Math.random()<.5;col.set(g?[.3,1,.2]:[.9,.05,.05],i*3);vel.push(new THREE.Vector3(rnd(-3,3),rnd(1,5),rnd(-3,3)));}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('color',new THREE.BufferAttribute(col,3));
 const pts=new THREE.Points(geo,new THREE.PointsMaterial({size:.12,vertexColors:true,transparent:true}));scene.add(pts);debris.push({o:pts,parts:vel,t:0});}
function updDebris(dt){for(const d of [...debris]){d.t+=dt;
 if(d.parts){const a=d.o.geometry.attributes.position;for(let i=0;i<d.parts.length;i++){const v=d.parts[i];v.y-=15*dt;a.array[i*3]+=v.x*dt;a.array[i*3+1]=Math.max(.02,a.array[i*3+1]+v.y*dt);a.array[i*3+2]+=v.z*dt;}
  a.needsUpdate=true;d.o.material.opacity=Math.max(0,1-d.t/1.2);if(d.t>1.2){scene.remove(d.o);d.o.geometry.dispose();debris.splice(debris.indexOf(d),1);}continue;}
 const o=d.o;d.v.y-=20*dt;o.position.addScaledVector(d.v,dt);o.rotation.x+=d.s.x*dt;o.rotation.y+=d.s.y*dt;o.rotation.z+=d.s.z*dt;
 if(o.position.y<d.r){o.position.y=d.r;if(Math.abs(d.v.y)>1){d.v.y=-d.v.y*.45;}else d.v.y=0;d.v.x*=.7;d.v.z*=.7;d.s.multiplyScalar(.6);}
 d.mat.opacity=Math.max(0,1-(d.t-3));if(d.t>4.2){scene.remove(o);debris.splice(debris.indexOf(d),1);}}}
// ===== intro: helicopter + parachute =====
let mode='menu',introT=0,introAir=false,chuteOpen=false;const heli=makeHeli();heli.visible=false;scene.add(heli);const chute=makeChute();chute.visible=false;player.add(chute);
let rotor=null;const HY=24,HV=9;
function rotorSound(on){if(!ac)return;if(on&&!rotor){const o=ac.createOscillator(),f=ac.createBiquadFilter(),g=ac.createGain(),l=ac.createOscillator(),lg=ac.createGain();
  o.type='sawtooth';o.frequency.value=55;f.type='lowpass';f.frequency.value=300;l.frequency.value=13;lg.gain.value=.08;l.connect(lg).connect(g.gain);g.gain.value=.08;
  o.connect(f).connect(g).connect(ac.destination);o.start();l.start();rotor={o,l,g};}
 if(!on&&rotor){const r=rotor;rotor=null;r.g.gain.cancelScheduledValues(ac.currentTime);r.g.gain.setTargetAtTime(0,ac.currentTime,.4);setTimeout(()=>{r.o.stop();r.l.stop();},1500);}}
function startIntro(){mode='intro';introT=0;chuteOpen=false;heli.visible=true;chute.visible=false;document.body.classList.remove('playing');$('skip').classList.remove('hide');rotorSound(true);}
function heliPos(t){return new THREE.Vector3(-55+t*HV,HY+Math.sin(t)*.4,-2);}
function intro(dt){introT+=dt;const t=introT,P=player.position;heli.userData.spin(dt);heli.position.copy(heliPos(t));heli.rotation.z=t>7?-.12:-.05;
 if(t>7)heli.position.y+=(t-7)*(t-7)*.6;
 if(t<6){introAir=true;P.copy(heli.position).add(new THREE.Vector3(-.2,-.75,1.05));player.rotation.set(0,0,0);curSpeed=0;
  cam.position.copy(heli.position).add(new THREE.Vector3(-14+t*.8,-5,16));cam.lookAt(heli.position);}
 else{if(t<6.05){vy=0;}if(P.y>0){if(!chuteOpen&&t>7.2){chuteOpen=true;chute.visible=true;chute.scale.set(.1,.1,.1);snd(400,.3,'triangle',.15,.5);}
   if(chuteOpen){chute.scale.lerp(new THREE.Vector3(1,1,1),Math.min(1,dt*4));vy+=(-5-vy)*Math.min(1,dt*3);player.rotation.z=Math.sin(t*1.6)*.15;player.rotation.x=0;P.x+=Math.sin(t*.8)*dt*.6;}
   else{vy-=20*dt;vy=Math.max(vy,-22);player.rotation.x=.6;}
   P.z+=(0-P.z)*dt*.5;P.x+=(0-P.x)*dt*.5;P.y=Math.max(0,P.y+vy*dt);introAir=true;
   cam.position.lerp(new THREE.Vector3(P.x+7,P.y+(chuteOpen?3:4),P.z+9),Math.min(1,dt*3));cam.lookAt(P.x,P.y+(chuteOpen?2:1),P.z);}
  else{introAir=false;player.rotation.set(0,player.rotation.y,0);vy=0;if(!chute.userData.land)chute.userData.land=t;const lt=t-chute.userData.land;
   chute.userData.can.scale.y=1.3*Math.max(.05,1-lt*1.5);chute.userData.can.position.y=4.2*Math.max(.1,1-lt*.9);chute.userData.mat.opacity=Math.max(0,1-lt);chute.userData.cords.material.opacity=Math.max(0,1-lt*2);
   cam.position.lerp(new THREE.Vector3(P.x+5,2.5,P.z+7),Math.min(1,dt*3));cam.lookAt(P.x,1,P.z);if(lt>1.4)endIntro();}}}
function skipIntro(){player.position.set(0,0,0);endIntro();}
function endIntro(){mode='play';heli.visible=false;rotorSound(false);chute.visible=false;delete chute.userData.land;chute.userData.can.scale.y=1.3;chute.userData.can.position.y=4.2;chute.userData.mat.opacity=1;chute.userData.cords.material.opacity=1;
 player.rotation.set(0,0,0);vy=0;introAir=false;$('skip').classList.add('hide');document.body.classList.add('playing');running=true;wave=0;nextWave();updHud();}
window.__game={get mode(){return mode},get score(){return score},get heads(){return headsDetached},get zombies(){return zombies.length},setIntroT(t){introT=t},spawnNear(){spawn();const z=zombies[zombies.length-1];z.position.set(player.position.x-Math.sin(yaw)*5,0,player.position.z-Math.cos(yaw)*5);z.userData.hp=1;},skip:()=>skipIntro()};
reset();loop();
