import * as THREE from 'three';import {makeSoldier} from './soldier.js';
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
addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='Space'){jump();e.preventDefault();}});addEventListener('keyup',e=>keys[e.code]=false);
const cv=renderer.domElement;
cv.addEventListener('mousedown',()=>{if(!running||MOBILE)return;if(document.pointerLockElement!==cv){try{const r=cv.requestPointerLock();r&&r.catch&&r.catch(()=>{});}catch(e){}}firing=true;});
addEventListener('mouseup',()=>firing=false);
addEventListener('mousemove',e=>{if(document.pointerLockElement===cv&&Math.abs(e.movementX)<150&&Math.abs(e.movementY)<150)look(e.movementX,e.movementY,.0025);});
const look=(dx,dy,k)=>{yaw-=dx*k;pitch=THREE.MathUtils.clamp(pitch-dy*k,-.7,.55);};
const stick={id:null,ox:0,oy:0,x:0,y:0},lk={id:null,x:0,y:0};let fireId=null;const knob=$('stick').firstChild;
addEventListener('touchstart',e=>{if(e.target.tagName==='BUTTON')return;e.preventDefault();document.body.classList.add('touch');
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
 M(new THREE.CapsuleGeometry(.26,.35,4,10),mats[1],0,1.3,0).scale.set(1.1,1,.7);M(new THREE.SphereGeometry(.24,14,10),mats[0],0,1.9,.06);
 M(new THREE.SphereGeometry(.05,8,6),eyeM,-.09,1.94,.27);M(new THREE.SphereGeometry(.05,8,6),eyeM,.09,1.94,.27);
 const legs=[];for(const x of[-.15,.15]){const l=new THREE.Group();l.position.set(x,.95,0);g.add(l);M(new THREE.CapsuleGeometry(.11,.65,4,8),mats[2],0,-.47,0,l);legs.push(l);}
 const arms=[];for(const x of[-.38,.38]){const a=new THREE.Group();a.position.set(x,1.55,0);g.add(a);M(new THREE.CapsuleGeometry(.08,.55,4,8),mats[0],0,-.35,0,a);a.rotation.x=-1.5;arms.push(a);}
 g.userData={legs,arms,mats,hp:0,dead:0,ph:Math.random()*6};return g;}
let zombies=[],tracers=[],score=0,wave=0,hp=100,toSpawn=0,spawnT=0,fireT=0,vy=0,anim=0,curSpeed=0;
const ZCAP=MOBILE?14:30;
function reset(){zombies.forEach(z=>scene.remove(z));zombies=[];score=0;wave=0;hp=100;player.position.set(0,0,0);yaw=0;pitch=-.1;vy=0;nextWave();updHud();}
function nextWave(){wave++;toSpawn=4+wave*3;spawnT=1;snd(200,.6,'sawtooth',.1,2);}
function spawn(){const z=makeZombie();let x,zz,tries=0;do{const a=Math.random()*Math.PI*2,r=rnd(22,32);x=player.position.x+Math.cos(a)*r;zz=player.position.z+Math.sin(a)*r;x=THREE.MathUtils.clamp(x,-ARENA,ARENA);zz=THREE.MathUtils.clamp(zz,-ARENA,ARENA);}
 while(tries++<10&&boxes.some(b=>Math.abs(b.x-x)<b.hx+.5&&Math.abs(b.z-zz)<b.hz+.5));z.position.set(x,0,zz);
 z.userData.hp=2+Math.floor(wave/2);z.userData.speed=1.4+wave*.15+Math.random()*.6;scene.add(z);zombies.push(z);}
function updHud(){$('score').textContent=score;$('wave').textContent=wave;$('hp').style.width=Math.max(0,hp)+'%';}
function collide(p,r){for(const b of boxes){const cx=THREE.MathUtils.clamp(p.x,b.x-b.hx,b.x+b.hx),cz=THREE.MathUtils.clamp(p.z,b.z-b.hz,b.z+b.hz);const dx=p.x-cx,dz=p.z-cz,d=Math.hypot(dx,dz);
 if(d<r){if(d>1e-4){p.x=cx+dx/d*r;p.z=cz+dz/d*r;}else{p.x+=r;}}}p.x=THREE.MathUtils.clamp(p.x,-ARENA,ARENA);p.z=THREE.MathUtils.clamp(p.z,-ARENA,ARENA);}
function jump(){if(running&&player.position.y<=0.001){vy=6.5;snd(300,.15,'sine',.1,2);}}
const rc=new THREE.Raycaster(),center=new THREE.Vector2(0,0);
function shoot(){const u=player.userData;u.flash.visible=true;u.flashLight.intensity=8;u.flash.rotation.z=Math.random()*3;setTimeout(()=>{u.flash.visible=false;u.flashLight.intensity=0;},45);snd(900,.08,'square',.12,.2);
 rc.setFromCamera(center,cam);rc.far=120;const hits=rc.intersectObjects([...zombies.filter(z=>!z.userData.dead),...solids,ground],true);
 const o=new THREE.Vector3();u.muzzle.getWorldPosition(o);let end=hits.length?hits[0].point:rc.ray.at(120,new THREE.Vector3());
 if(hits.length){const z=hits[0].object.userData.root;if(z&&!z.userData.dead){z.userData.hp--;z.userData.hit=.1;const p=end.clone().sub(o).setY(0).normalize();z.position.addScaledVector(p,.25);
  if(z.userData.hp<=0){z.userData.dead=.001;score+=10;snd(120,.4,'sawtooth',.15,.5);updHud();}}}
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
  fireT-=dt;if((firing||fireId!==null)&&fireT<=0){shoot();fireT=.1;}
  const alive=zombies.filter(z=>!z.userData.dead).length;
  if(toSpawn>0){spawnT-=dt;if(spawnT<=0&&alive<ZCAP){spawn();toSpawn--;spawnT=Math.max(.35,1.4-wave*.1);}}else if(!zombies.length){nextWave();updHud();}
  for(const z of [...zombies]){const u=z.userData;
   if(u.dead){u.dead+=dt;z.rotation.x=Math.max(-Math.PI/2,-u.dead*3);u.mats.forEach(m=>m.opacity=Math.max(0,1-(u.dead-.6)));if(u.dead>1.7){scene.remove(z);zombies.splice(zombies.indexOf(z),1);}continue;}
   if(u.hit>0){u.hit-=dt;u.mats[0].emissive.setHex(0xffffff);}else u.mats[0].emissive.setHex(0);
   const d=player.position.clone().sub(z.position);d.y=0;const dist=d.length();z.rotation.y=Math.atan2(d.x,d.z);u.ph+=dt*5;
   u.legs[0].rotation.x=Math.sin(u.ph)*.45;u.legs[1].rotation.x=-Math.sin(u.ph)*.45;u.arms[0].rotation.x=-1.5+Math.sin(u.ph)*.12;u.arms[1].rotation.x=-1.5-Math.sin(u.ph)*.12;z.rotation.z=Math.sin(u.ph*.5)*.12;
   if(dist>1){z.position.addScaledVector(d.normalize(),u.speed*dt);collide(z.position,.35);}
   else if(player.position.y<1.2){hp-=22*dt;updHud();if(Math.random()<dt*3)snd(80,.2,'sawtooth',.1,.5);
    if(hp<=0){running=false;firing=false;fireId=null;document.body.classList.remove('playing');document.exitPointerLock&&document.exitPointerLock();$('final').textContent=`Score ${score} · Wave ${wave}`;$('over').classList.remove('hide');snd(300,1.2,'sawtooth',.2,.1);}}}
 }
 player.userData.animate(T,curSpeed,player.position.y>.05,dt);
 for(const t of [...tracers]){t.userData.life-=dt;t.material.opacity=t.userData.life/.06;if(t.userData.life<=0){scene.remove(t);t.geometry.dispose();tracers.splice(tracers.indexOf(t),1);}}
 const P=player.position;
 if(closeup&&!running){player.rotation.y=Math.PI*.22;cam.position.set(P.x+.5,1.35,P.z+2.2);cam.lookAt(P.x,1.15,P.z);}
 else{cam.rotation.set(pitch,yaw,0);const f=new THREE.Vector3(0,0,-1).applyEuler(cam.rotation);const piv=new THREE.Vector3(P.x,P.y+1.75,P.z).addScaledVector(right,.8);const back=f.clone().negate();camRc.set(piv,back);camRc.far=4;const ch=camRc.intersectObjects(solids,false);const cd=ch.length?Math.max(.4,ch[0].distance-.3):4;cam.position.copy(piv).addScaledVector(back,cd);if(cam.position.y<.3)cam.position.y=.3;}
 sun.position.set(P.x+20,40,P.z+15);sun.target.position.set(P.x,0,P.z);
 renderer.render(scene,cam);}
function begin(){ac=ac||new(window.AudioContext||window.webkitAudioContext)();ac.resume&&ac.resume();$('start').classList.add('hide');$('over').classList.add('hide');document.body.classList.add('playing');reset();fireT=0;running=true;}
$('startBtn').onclick=begin;$('restartBtn').onclick=begin;
if(closeup){$('start').classList.add('hide');$('hud').classList.add('hide');}
reset();loop();
