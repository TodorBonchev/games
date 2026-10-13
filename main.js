import * as THREE from 'three';import {makeSoldier} from './soldier.js';
const $=id=>document.getElementById(id);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;document.body.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x6b7a6b);scene.fog=new THREE.Fog(0x6b7a6b,20,55);
const cam=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.1,200);
scene.add(new THREE.HemisphereLight(0xddeeff,0x554433,.8));const sun=new THREE.DirectionalLight(0xffeedd,1.4);sun.position.set(15,30,10);sun.castShadow=true;
Object.assign(sun.shadow.camera,{left:-35,right:35,top:35,bottom:-35});const MOBILE=matchMedia('(pointer:coarse)').matches||'ontouchstart' in window;sun.shadow.mapSize.set(MOBILE?1024:2048,MOBILE?1024:2048);scene.add(sun);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.MeshStandardMaterial({color:0x5d6b44}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
const ARENA=35,crates=[];const cm=new THREE.MeshStandardMaterial({color:0x8b6533});
for(let i=0;i<14;i++){const s=1+Math.random()*1.5;const c=new THREE.Mesh(new THREE.BoxGeometry(s,s,s),cm);let x,z;do{x=(Math.random()-.5)*60;z=(Math.random()-.5)*60}while(Math.hypot(x,z)<6);
 c.position.set(x,s/2,z);c.castShadow=c.receiveShadow=true;c.userData.r=s*.6;scene.add(c);crates.push(c);}
const player=makeSoldier();scene.add(player);
let ac;const snd=(f,d,type='square',v=.15,slide=.3)=>{if(!ac)return;const o=ac.createOscillator(),g=ac.createGain();o.type=type;o.frequency.setValueAtTime(f,ac.currentTime);o.frequency.exponentialRampToValueAtTime(f*slide,ac.currentTime+d);
 g.gain.setValueAtTime(v,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+d);o.connect(g).connect(ac.destination);o.start();o.stop(ac.currentTime+d);};
const keys={};addEventListener('keydown',e=>keys[e.code]=true);addEventListener('keyup',e=>keys[e.code]=false);
const mouse=new THREE.Vector2(),ray=new THREE.Raycaster(),aim=new THREE.Vector3(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);let firing=false;
addEventListener('mousemove',e=>{mouse.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1)});
addEventListener('mousedown',e=>{if(e.target.tagName!=='BUTTON')firing=true});addEventListener('mouseup',()=>firing=false);
const onResize=()=>{cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)};addEventListener('resize',onResize);addEventListener('orientationchange',()=>setTimeout(onResize,200));
if(MOBILE)document.body.classList.add('touch');
const sticks={l:{id:null,x:0,y:0,ox:0,oy:0,el:document.getElementById('ls')},r:{id:null,x:0,y:0,ox:0,oy:0,el:document.getElementById('rs')}};
const opts={passive:false};
addEventListener('touchstart',e=>{if(e.target.tagName==='BUTTON')return;e.preventDefault();document.body.classList.add('touch');for(const t of e.changedTouches){const s=t.clientX<innerWidth/2?sticks.l:sticks.r;if(s.id!==null)continue;
 s.id=t.identifier;s.ox=t.clientX;s.oy=t.clientY;s.x=s.y=0;s.el.style.left=(t.clientX-65)+'px';s.el.style.right='auto';s.el.style.top=(t.clientY-65)+'px';s.el.style.bottom='auto';}},opts);
addEventListener('touchmove',e=>{e.preventDefault();for(const t of e.changedTouches)for(const s of Object.values(sticks))if(s.id===t.identifier){let dx=t.clientX-s.ox,dy=t.clientY-s.oy;const d=Math.hypot(dx,dy);if(d>55){dx*=55/d;dy*=55/d;}
 s.x=dx/55;s.y=dy/55;s.el.firstChild.style.transform=`translate(${dx}px,${dy}px)`;}},opts);
const tend=e=>{for(const t of e.changedTouches)for(const s of Object.values(sticks))if(s.id===t.identifier){s.id=null;s.x=s.y=0;s.el.firstChild.style.transform='';s.el.style.cssText='';}};
addEventListener('touchend',tend);addEventListener('touchcancel',tend);
['gesturestart','dblclick','contextmenu'].forEach(ev=>addEventListener(ev,e=>e.preventDefault(),opts));
const zmSkin=new THREE.MeshStandardMaterial({color:0x6fa04a}),zmCloth=new THREE.MeshStandardMaterial({color:0x4a3f5c});
function makeZombie(){const g=new THREE.Group(),mats=[zmSkin.clone(),zmCloth.clone()];mats.forEach(m=>m.transparent=true);
 const M=(geo,m,x,y,z,p=g)=>{const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);o.castShadow=true;p.add(o);return o};
 M(new THREE.BoxGeometry(.6,.7,.35),mats[1],0,1.3,0);M(new THREE.BoxGeometry(.38,.38,.38),mats[0],0,1.88,.05);
 M(new THREE.BoxGeometry(.08,.05,.02),new THREE.MeshBasicMaterial({color:0xff2200}),-.09,1.92,.25);M(new THREE.BoxGeometry(.08,.05,.02),new THREE.MeshBasicMaterial({color:0xff2200}),.09,1.92,.25);
 const legs=[];for(const x of[-.15,.15]){const l=new THREE.Group();l.position.set(x,.95,0);g.add(l);M(new THREE.BoxGeometry(.22,.95,.25),mats[1],0,-.47,0,l);legs.push(l);}
 const arms=[];for(const x of[-.4,.4]){const a=new THREE.Group();a.position.set(x,1.6,0);g.add(a);M(new THREE.BoxGeometry(.16,.7,.16),mats[0],0,-.35,0,a);a.rotation.x=-1.5;arms.push(a);}
 g.userData={legs,arms,mats,hp:0,dead:0,ph:Math.random()*6};return g;}
let zombies=[],tracers=[],score,wave,hp,toSpawn,spawnT,fireT,running=false,waveT;
function reset(){zombies.forEach(z=>scene.remove(z));zombies=[];score=0;wave=0;hp=100;player.position.set(0,0,0);nextWave();updHud();}
function nextWave(){wave++;toSpawn=4+wave*3;spawnT=0;snd(200,.6,'sawtooth',.1,2);}
function spawn(){const z=makeZombie();const a=Math.random()*Math.PI*2;z.position.set(Math.cos(a)*30,0,Math.sin(a)*30);z.userData.hp=2+Math.floor(wave/2);z.userData.speed=1.3+wave*.15+Math.random()*.5;scene.add(z);zombies.push(z);}
function updHud(){$('score').textContent=score;$('wave').textContent=wave;$('hp').style.width=Math.max(0,hp)+'%';}
function collide(p,r){for(const c of crates){const dx=p.x-c.position.x,dz=p.z-c.position.z,d=Math.hypot(dx,dz),m=c.userData.r+r;if(d<m&&d>0){p.x=c.position.x+dx/d*m;p.z=c.position.z+dz/d*m;}}
 p.x=THREE.MathUtils.clamp(p.x,-ARENA,ARENA);p.z=THREE.MathUtils.clamp(p.z,-ARENA,ARENA);}
function shoot(){const fl=player.userData.flash;fl.visible=true;setTimeout(()=>fl.visible=false,40);snd(900,.08,'square',.12,.2);
 const o=new THREE.Vector3();fl.getWorldPosition(o);const dir=new THREE.Vector3(Math.sin(player.rotation.y),0,Math.cos(player.rotation.y));
 dir.applyAxisAngle(new THREE.Vector3(0,1,0),(Math.random()-.5)*.05);
 const r=new THREE.Raycaster(o,dir,0,60);const targets=zombies.filter(z=>!z.userData.dead);const hits=r.intersectObjects([...targets,...crates],true);
 let end=o.clone().addScaledVector(dir,60);if(hits.length){end=hits[0].point;let z=hits[0].object;while(z.parent&&!zombies.includes(z))z=z.parent;
  if(zombies.includes(z)){z.userData.hp--;z.position.addScaledVector(dir,.25);if(z.userData.hp<=0){z.userData.dead=.001;score+=10;snd(120,.4,'sawtooth',.15,.5);updHud();}}}
 const t=new THREE.Line(new THREE.BufferGeometry().setFromPoints([o,end]),new THREE.LineBasicMaterial({color:0xffee88,transparent:true}));t.userData.life=.06;scene.add(t);tracers.push(t);}
const clock=new THREE.Clock();let walk=0;
function loop(){requestAnimationFrame(loop);const dt=Math.min(clock.getDelta(),.05);
 if(running){const v=new THREE.Vector3((keys.KeyD?1:0)-(keys.KeyA?1:0),0,(keys.KeyS?1:0)-(keys.KeyW?1:0));
  if(sticks.l.id!==null){v.x+=sticks.l.x;v.z+=sticks.l.y;}if(v.lengthSq()>.04){if(v.length()>1)v.normalize();v.multiplyScalar(6*dt);player.position.add(v);walk+=dt*10;}collide(player.position,.4);
  const L=player.userData.legs;L[0].rotation.x=Math.sin(walk)*.6;L[1].rotation.x=-Math.sin(walk)*.6;
  const rs=sticks.r;let autoFire=false;if(rs.id!==null&&Math.hypot(rs.x,rs.y)>.25){player.rotation.y=Math.atan2(rs.x,rs.y);autoFire=true;}else if(!MOBILE){ray.setFromCamera(mouse,cam);if(ray.ray.intersectPlane(plane,aim))player.rotation.y=Math.atan2(aim.x-player.position.x,aim.z-player.position.z);}
  fireT-=dt;if((firing||autoFire)&&fireT<=0){shoot();fireT=.11;}
  const alive=zombies.filter(z=>!z.userData.dead).length;if(toSpawn>0&&alive<(MOBILE?18:35)){spawnT-=dt;if(spawnT<=0){spawn();toSpawn--;spawnT=Math.max(.3,1.5-wave*.1);}}
  else if(toSpawn<=0&&!zombies.length){nextWave();updHud();}
  for(const z of [...zombies]){const u=z.userData;
   if(u.dead){u.dead+=dt;z.rotation.x=Math.max(-Math.PI/2,-u.dead*3);u.mats.forEach(m=>m.opacity=Math.max(0,1-(u.dead-.5)));if(u.dead>1.6){scene.remove(z);zombies.splice(zombies.indexOf(z),1);}continue;}
   const d=player.position.clone().sub(z.position);d.y=0;const dist=d.length();z.rotation.y=Math.atan2(d.x,d.z);u.ph+=dt*5;
   u.legs[0].rotation.x=Math.sin(u.ph)*.4;u.legs[1].rotation.x=-Math.sin(u.ph)*.4;u.arms[0].rotation.x=-1.5+Math.sin(u.ph)*.1;z.rotation.z=Math.sin(u.ph*.5)*.1;
   if(dist>1){z.position.addScaledVector(d.normalize(),u.speed*dt);collide(z.position,.35);}
   else{hp-=20*dt;updHud();if(Math.random()<dt*3)snd(80,.2,'sawtooth',.1,.5);if(hp<=0){running=false;firing=false;$('final').textContent=`Score ${score} · Wave ${wave}`;$('over').classList.remove('hide');snd(300,1.2,'sawtooth',.2,.1);}}}
 }
 for(const t of [...tracers]){t.userData.life-=dt;t.material.opacity=t.userData.life/.06;if(t.userData.life<=0){scene.remove(t);t.geometry.dispose();tracers.splice(tracers.indexOf(t),1);}}
 const por=innerHeight>innerWidth;cam.fov=por?75:55;cam.updateProjectionMatrix();cam.position.set(player.position.x,por?18:14,player.position.z+(por?12:11));cam.lookAt(player.position.x,0,player.position.z);renderer.render(scene,cam);}
function begin(){ac=ac||new AudioContext();$('start').classList.add('hide');$('over').classList.add('hide');reset();fireT=0;running=true;}
$('startBtn').onclick=begin;$('restartBtn').onclick=begin;reset();loop();
