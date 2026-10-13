import * as THREE from 'three';import {makeSoldier} from './soldier.js?v9';import {makeHeli,makeChute} from './heli.js?v9';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {buildWorld,groundH,islandD,shoreR,SUN_DIR,FOG_COLOR,iceF} from './world.js?v9';
export const BUILD='v9 2026-10-13 23:59';const $=id=>document.getElementById(id),Q=new URLSearchParams(location.search),DEBUG=Q.get('debug')==='1';
const MOBILE=matchMedia('(pointer:coarse)').matches||'ontouchstart' in window;if(MOBILE)document.body.classList.add('touch');
const renderer=new THREE.WebGLRenderer({antialias:!MOBILE,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,MOBILE?1.5:2));renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;renderer.outputColorSpace=THREE.SRGBColorSpace;document.body.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.fog=new THREE.Fog(FOG_COLOR,90,520);
const cam=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,.1,7000);cam.rotation.order='YXZ';
scene.add(new THREE.HemisphereLight(0xb4c2e8,0x5a4a30,.95));const rim=new THREE.DirectionalLight(0xffd0b0,.35);rim.position.set(60,30,80);scene.add(rim);
const sun=new THREE.DirectionalLight(0xffb060,3.0);sun.castShadow=true;const S=MOBILE?1024:2048;sun.shadow.mapSize.set(S,S);
Object.assign(sun.shadow.camera,{left:-30,right:30,top:30,bottom:-30,near:1,far:200});sun.shadow.bias=-.0003;sun.shadow.normalBias=.03;sun.shadow.radius=3;scene.add(sun,sun.target);
const W=buildWorld(scene,MOBILE);
let composer=null;if(!MOBILE){composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,cam));composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth/2,innerHeight/2),.22,.35,.93));composer.addPass(new OutputPass());}const solids=W.solids;
const rnd=(a,b)=>a+Math.random()*(b-a);
const player=makeSoldier();player.rotation.order='YXZ';scene.add(player);
// ---------- audio ----------
let ac;const snd=(f,d,type='square',v=.15,slide=.3)=>{if(!ac)return;const o=ac.createOscillator(),g=ac.createGain();o.type=type;o.frequency.setValueAtTime(f,ac.currentTime);o.frequency.exponentialRampToValueAtTime(f*slide,ac.currentTime+d);
 g.gain.setValueAtTime(v,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+d);o.connect(g).connect(ac.destination);o.start();o.stop(ac.currentTime+d);};
let rotor=null,wind=null;
function rotorStart(){if(!ac||rotor)return;const o=ac.createOscillator(),f=ac.createBiquadFilter(),g=ac.createGain(),m=ac.createGain(),l=ac.createOscillator(),lg=ac.createGain();
 o.type='sawtooth';o.frequency.value=55;f.type='lowpass';f.frequency.value=320;l.frequency.value=13;lg.gain.value=.5;m.gain.value=.5;l.connect(lg).connect(m.gain);g.gain.value=0;
 o.connect(f).connect(m).connect(g).connect(ac.destination);o.start();l.start();rotor={o,l,g};}
function windStart(){if(!ac||wind)return;const b=ac.createBuffer(1,ac.sampleRate*2,ac.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
 const s=ac.createBufferSource();s.buffer=b;s.loop=true;const f=ac.createBiquadFilter();f.type='bandpass';f.frequency.value=700;f.Q.value=.7;const g=ac.createGain();g.gain.value=0;s.connect(f).connect(g).connect(ac.destination);s.start();wind={s,f,g};}
const setGain=(n,v)=>n&&n.g.gain.setTargetAtTime(v,ac.currentTime,.15);
// ---------- input ----------
let yaw=0,pitch=-.1,firing=false,running=false,mode='menu',introDone=false;const keys={};
addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='Space'){jump();e.preventDefault();}});addEventListener('keyup',e=>keys[e.code]=false);
const cv=renderer.domElement;const lockPointer=()=>{if(MOBILE||document.pointerLockElement===cv)return;try{const r=cv.requestPointerLock();r&&r.catch&&r.catch(()=>{});}catch(e){}};
cv.addEventListener('mousedown',()=>{if(mode==='intro'){lockPointer();return;}if(!running||MOBILE)return;lockPointer();firing=true;});
addEventListener('mouseup',()=>firing=false);
addEventListener('mousemove',e=>{if(document.pointerLockElement===cv&&Math.abs(e.movementX)<150&&Math.abs(e.movementY)<150)look(e.movementX,e.movementY,.0025);});
const look=(dx,dy,k)=>{yaw-=dx*k;pitch=THREE.MathUtils.clamp(pitch-dy*k,mode==='intro'?-1.45:-.7,mode==='intro'?.6:.55);};
const stick={id:null,ox:0,oy:0,x:0,y:0},lk={id:null,x:0,y:0};let fireId=null;const knob=$('stick').firstChild;
addEventListener('touchstart',e=>{if(e.target.tagName==='BUTTON')return;e.preventDefault();document.body.classList.add('touch');if(mode!=='intro'&&mode!=='play')return;
 for(const t of e.changedTouches){const el=t.target;if(el.id==='jumpBtn'){jump();continue;}
  if(el.id==='fireBtn'){fireId=t.identifier;if(lk.id===null)Object.assign(lk,{id:t.identifier,x:t.clientX,y:t.clientY});continue;}
  if(t.clientX<innerWidth/2&&stick.id===null){const r=$('stick').getBoundingClientRect();Object.assign(stick,{id:t.identifier,ox:r.left+65,oy:r.top+65});moveStick(t);}
  else if(lk.id===null)Object.assign(lk,{id:t.identifier,x:t.clientX,y:t.clientY});}},{passive:false});
function moveStick(t){let dx=t.clientX-stick.ox,dy=t.clientY-stick.oy;const d=Math.hypot(dx,dy);if(d>55){dx*=55/d;dy*=55/d;}stick.x=dx/55;stick.y=dy/55;knob.style.transform=`translate(${dx}px,${dy}px)`;}
addEventListener('touchmove',e=>{e.preventDefault();for(const t of e.changedTouches){if(t.identifier===stick.id)moveStick(t);if(t.identifier===lk.id){look(t.clientX-lk.x,t.clientY-lk.y,.006);lk.x=t.clientX;lk.y=t.clientY;}}},{passive:false});
const tend=e=>{for(const t of e.changedTouches){if(t.identifier===stick.id){stick.id=null;stick.x=stick.y=0;knob.style.transform='';}if(t.identifier===lk.id)lk.id=null;if(t.identifier===fireId)fireId=null;}};
addEventListener('touchend',tend);addEventListener('touchcancel',tend);
['gesturestart','dblclick','contextmenu'].forEach(ev=>addEventListener(ev,e=>e.preventDefault(),{passive:false}));
const onResize=()=>{cam.aspect=innerWidth/innerHeight;cam.fov=innerHeight>innerWidth?85:70;cam.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer&&composer.setSize(innerWidth,innerHeight);};
addEventListener('resize',onResize);addEventListener('orientationchange',()=>setTimeout(onResize,250));onResize();
function moveInput(){let mx=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0),sx=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0);
 if(stick.id!==null){mx-=stick.y;sx+=stick.x;}const v=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)).multiplyScalar(mx).addScaledVector(new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw)),sx);
 const m=v.length();if(m>1)v.divideScalar(m);return m<.15?v.set(0,0,0):v;}
// ---------- zombies ----------
const toon=c=>new THREE.MeshLambertMaterial({color:c});
const zSkin=toon(0x86d94e),shirts=[0x5a2d78,0x8a4a1c,0x1f4f6e,0x6e1f3a,0x3d4a2a].map(toon),zPants=toon(0x2a2f4a),eyeM=new THREE.MeshBasicMaterial({color:0xff2a00});
function makeZombie(){const g=new THREE.Group(),mats=[zSkin.clone(),shirts[Math.random()*5|0].clone(),zPants.clone()];mats[0].color.offsetHSL(rnd(-.04,.04),rnd(-.15,.05),rnd(-.08,.04));mats.forEach(m=>m.transparent=true);
 const M=(geo,m,x,y,z,p=g)=>{const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);o.castShadow=true;p.add(o);o.userData.root=g;return o};
 M(new THREE.CapsuleGeometry(.26,.35,4,10),mats[1],0,1.3,0).scale.set(1.1,1,.7);const head=M(new THREE.SphereGeometry(.24,14,10),mats[0],0,1.9,.06);
 M(new THREE.SphereGeometry(.05,8,6),eyeM,-.09,.04,.21,head);M(new THREE.SphereGeometry(.05,8,6),eyeM,.09,.04,.21,head);
 const legs=[];for(const x of[-.15,.15]){const l=new THREE.Group();l.position.set(x,.95,0);g.add(l);M(new THREE.CapsuleGeometry(.11,.65,4,8),mats[2],0,-.47,0,l);legs.push(l);}
 const arms=[];for(const x of[-.38,.38]){const a=new THREE.Group();a.position.set(x,1.55,0);g.add(a);M(new THREE.CapsuleGeometry(.08,.55,4,8),mats[0],0,-.35,0,a);a.rotation.x=-1.5;arms.push(a);}
 g.userData={legs,arms,mats,head,hp:0,dead:0,ph:Math.random()*6,base:mats[0].color.clone(),base1:mats[1].color.clone()};return g;}
const ICE_SKIN=new THREE.Color(0x9fd8ff),ICE_CLOTH=new THREE.Color(0x4a6f9a);
let zombies=[],tracers=[],score=0,wave=0,hp=100,toSpawn=0,spawnT=0,fireT=0,vy=0,curSpeed=0;const ZCAP=MOBILE?14:28;
function onLand(x,z,clear=.6){if(islandD(x,z)>.88)return false;for(const c of W.circles)if(Math.hypot(c.x-x,c.z-z)<c.r+clear)return false;for(const b of W.boxes)if(Math.abs(b.x-x)<b.hx+clear&&Math.abs(b.z-z)<b.hz+clear)return false;return true;}
function spawn(){const z=makeZombie();let x=0,zz=0;for(let k=0;k<40;k++){const a=rnd(0,6.28),r=rnd(18,36);x=player.position.x+Math.cos(a)*r;zz=player.position.z+Math.sin(a)*r;if(onLand(x,zz))break;
  if(k===39){const b=rnd(0,6.28),R=shoreR(b)*rnd(.3,.8);x=Math.cos(b)*R;zz=Math.sin(b)*R;}}
 z.position.set(x,groundH(x,zz),zz);z.userData.hp=2+Math.floor(wave/2);z.userData.speed=1.4+wave*.15+Math.random()*.6;scene.add(z);zombies.push(z);}
function updHud(){$('score').textContent=score;$('wave').textContent=wave;$('hp').style.width=Math.max(0,hp)+'%';}
function collide(p,r){for(const c of W.circles){const dx=p.x-c.x,dz=p.z-c.z,d=Math.hypot(dx,dz),m=c.r+r;if(d<m&&d>1e-4){p.x=c.x+dx/d*m;p.z=c.z+dz/d*m;}}
 for(const b of W.boxes){const cx=THREE.MathUtils.clamp(p.x,b.x-b.hx,b.x+b.hx),cz=THREE.MathUtils.clamp(p.z,b.z-b.hz,b.z+b.hz);const dx=p.x-cx,dz=p.z-cz,d=Math.hypot(dx,dz);if(d<r){if(d>1e-4){p.x=cx+dx/d*r;p.z=cz+dz/d*r;}else p.x+=r;}}
 const R=Math.hypot(p.x,p.z),lim=shoreR(Math.atan2(p.z,p.x))*.97;if(R>lim){p.x*=lim/R;p.z*=lim/R;}}
function jump(){if(mode==='play'&&player.position.y<=groundH(player.position.x,player.position.z)+.01){vy=6.5;snd(300,.15,'sine',.1,2);}}
// ---------- shooting / auto-aim ----------
const rc=new THREE.Raycaster(),center=new THREE.Vector2(0,0),tmpV=new THREE.Vector3(),losRc=new THREE.Raycaster();
// ---- auto-aim state machine ----
// firstLock: true only between FIRE press and the first time the aim settles on a target.
// Every other target change (kill, LOS loss) is a "retarget": 0.25s pause, then an ease-in-out swing whose
// duration is chosen so the PEAK turn rate stays <= ~110 deg/s, minimum 0.9s. No shots at a target until aligned.
let lockT=null,losT=0,firstLock=false,wasFiring=false,pause=0,swing=null,aligned=false;
const RET_PAUSE=.25,RET_MIN=.9,PEAK=110*Math.PI/180,FIRST_DUR=.3,ALIGN=2.5*Math.PI/180;
const angD=a=>Math.atan2(Math.sin(a),Math.cos(a));
function los(z){z.userData.head.getWorldPosition(tmpV);const d=tmpV.clone().sub(cam.position);const L=d.length();losRc.set(cam.position,d.normalize());losRc.far=L-.3;return !losRc.intersectObjects(solids,false).length;}
function aimAngles(z){z.userData.head.getWorldPosition(tmpV);const d=tmpV.clone().sub(cam.position).normalize();return[Math.atan2(-d.x,-d.z),THREE.MathUtils.clamp(Math.asin(d.y),-.7,.55)];}
function dropLock(){lockT=null;swing=null;aligned=false;if(!firstLock)pause=RET_PAUSE;}
function autoAim(dt){const want=firing||fireId!==null;
 if(!want){lockT=null;swing=null;aligned=false;pause=0;wasFiring=false;return;}
 if(!wasFiring){wasFiring=true;firstLock=true;}
 if(lockT&&(lockT.userData.dead||!zombies.includes(lockT))){dropLock();aimEv('kill');}
 if(lockT&&(losT-=dt)<=0){losT=.25;if(!los(lockT)){dropLock();aimEv('los');}}
 if(pause>0){pause-=dt;return;}
 if(!lockT){let best=null,bs=1e9;const f=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
  for(const z of zombies){if(z.userData.dead)continue;const d=z.position.clone().sub(player.position);d.y=0;const dist=d.length();if(dist>45)continue;
   const s=dist+Math.acos(THREE.MathUtils.clamp(d.normalize().dot(f),-1,1))*6;if(s<bs&&los(z)){bs=s;best=z;}}
  if(!best)return;lockT=best;losT=.25;aligned=false;const[ty,tp]=aimAngles(best);const ang=Math.hypot(angD(ty-yaw),tp-pitch);
  // smoothstep peak speed = 1.5*ang/dur  ->  dur >= 1.5*ang/PEAK
  swing={t:0,y0:yaw,p0:pitch,dur:firstLock?FIRST_DUR:Math.max(RET_MIN,1.5*ang/PEAK)};aimEv(firstLock?'firstlock':'retarget',swing.dur);}
 const[ty,tp]=aimAngles(lockT);
 if(swing){swing.t+=dt;const u=Math.min(1,swing.t/swing.dur),e=u*u*(3-2*u);yaw=swing.y0+angD(ty-swing.y0)*e;pitch=swing.p0+(tp-swing.p0)*e;if(u>=1)swing=null;}
 else{const k=Math.min(1,dt*10);yaw+=angD(ty-yaw)*k;pitch+=(tp-pitch)*k;} // tracking a moving, already-acquired head
 aligned=!swing&&Math.hypot(angD(ty-yaw),tp-pitch)<ALIGN;if(aligned)firstLock=false;}
const aimLog=[];function aimEv(e,x){if(DEBUG)aimLog.push({t:gT,ev:e,x});}
function aimErrDeg(){if(!lockT)return null;const[ty,tp]=aimAngles(lockT);return Math.hypot(angD(ty-yaw),tp-pitch)*180/Math.PI;}
function updLock(){const el=$('lock');if(!lockT||lockT.userData.dead){el.style.display='none';return;}el.style.opacity=aligned?1:.45;lockT.userData.head.getWorldPosition(tmpV);tmpV.project(cam);
 if(tmpV.z>1){el.style.display='none';return;}el.style.display='block';el.style.left=((tmpV.x+1)/2*innerWidth)+'px';el.style.top=((1-tmpV.y)/2*innerHeight)+'px';}
function shoot(){const u=player.userData;u.flash.visible=true;u.flashLight.intensity=8;u.flash.rotation.z=Math.random()*3;setTimeout(()=>{u.flash.visible=false;u.flashLight.intensity=0;},45);snd(900,.08,'square',.12,.2);
 if(lockT&&aligned){lockT.userData.head.getWorldPosition(tmpV);rc.set(cam.position,tmpV.clone().sub(cam.position).normalize());}else rc.setFromCamera(center,cam);rc.far=150;
 const hits=rc.intersectObjects([...zombies.filter(z=>!z.userData.dead),...solids,W.ground],true);
 const o=new THREE.Vector3();u.muzzle.getWorldPosition(o);let end=hits.length?hits[0].point:rc.ray.at(150,new THREE.Vector3());
 if(hits.length){const z=hits[0].object.userData.root;if(z&&!z.userData.dead){z.userData.hp--;z.userData.hit=.1;const p=end.clone().sub(o).setY(0).normalize();z.position.addScaledVector(p,.25);
  if(z.userData.hp<=0){z.userData.dead=.001;decap(z,p);score+=10;snd(120,.4,'sawtooth',.15,.5);updHud();}}}
 const t=new THREE.Line(new THREE.BufferGeometry().setFromPoints([o,end]),new THREE.LineBasicMaterial({color:0xfff27a,transparent:true}));t.userData.life=.06;scene.add(t);tracers.push(t);}
// ---------- decapitation ----------
let debris=[],headsDetached=0;
function decap(z,dir){const h=z.userData.head;scene.attach(h);headsDetached++;
 debris.push({o:h,v:new THREE.Vector3(dir.x*3+rnd(-1,1),rnd(5,7),dir.z*3+rnd(-1,1)),s:new THREE.Vector3(rnd(-12,12),rnd(-12,12),rnd(-12,12)),t:0,r:.24,mat:h.material});
 const n=MOBILE?24:40,pos=new Float32Array(n*3),col=new Float32Array(n*3),vel=[];h.getWorldPosition(tmpV);
 for(let i=0;i<n;i++){pos.set([tmpV.x,tmpV.y-.15,tmpV.z],i*3);col.set(Math.random()<.5?[.3,1,.2]:[.9,.05,.05],i*3);vel.push(new THREE.Vector3(rnd(-3,3),rnd(1,5),rnd(-3,3)));}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('color',new THREE.BufferAttribute(col,3));
 const pts=new THREE.Points(geo,new THREE.PointsMaterial({size:.12,vertexColors:true,transparent:true}));scene.add(pts);debris.push({o:pts,parts:vel,t:0,gy:z.position.y});}
function updDebris(dt){for(const d of [...debris]){d.t+=dt;
 if(d.parts){const a=d.o.geometry.attributes.position;for(let i=0;i<d.parts.length;i++){const v=d.parts[i];v.y-=15*dt;a.array[i*3]+=v.x*dt;a.array[i*3+1]=Math.max(d.gy+.02,a.array[i*3+1]+v.y*dt);a.array[i*3+2]+=v.z*dt;}
  a.needsUpdate=true;d.o.material.opacity=Math.max(0,1-d.t/1.2);if(d.t>1.2){scene.remove(d.o);d.o.geometry.dispose();debris.splice(debris.indexOf(d),1);}continue;}
 const o=d.o;d.v.y-=20*dt;o.position.addScaledVector(d.v,dt);o.rotation.x+=d.s.x*dt;o.rotation.y+=d.s.y*dt;o.rotation.z+=d.s.z*dt;const gy=groundH(o.position.x,o.position.z)+d.r;
 if(o.position.y<gy){o.position.y=gy;if(Math.abs(d.v.y)>1)d.v.y=-d.v.y*.45;else d.v.y=0;d.v.x*=.7;d.v.z*=.7;d.s.multiplyScalar(.6);}
 d.mat.opacity=Math.max(0,1-(d.t-3));if(d.t>4.2){scene.remove(o);debris.splice(debris.indexOf(d),1);}}}
// ---------- intro: high-altitude jump ----------
const heli=makeHeli();heli.visible=false;scene.add(heli);const chute=makeChute();chute.visible=false;player.add(chute);
const HALT=1150,HSPD=38;let iPhase='',iT=0,heliT=0,heliOn=false;const vel=new THREE.Vector3();
const NS=70,streakPos=new Float32Array(NS*6).fill(-9999);const streaks=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:0,fog:false}));
streaks.geometry.setAttribute('position',new THREE.BufferAttribute(streakPos,3));streaks.frustumCulled=false;streaks.visible=false;scene.add(streaks);
function startIntro(){mode='intro';iPhase='heli';iT=0;heliT=0;heliOn=true;heli.visible=true;heli.position.set(-140,HALT,25);heli.rotation.set(0,0,0);chute.visible=false;
 yaw=-Math.PI/2+.5;pitch=-.25;document.body.classList.remove('playing');document.body.classList.add('intro');$('skipBtn').classList.remove('hide');rotorStart();windStart();setGain(rotor,.09);}
function updHeli(dt){if(!heliOn)return;heliT+=dt;heli.userData.spin(dt);heli.position.x+=HSPD*dt;
 if(iPhase!=='heli'){heli.position.y+=6*dt;heli.rotation.z=THREE.MathUtils.lerp(heli.rotation.z,-.18,dt);heli.rotation.x=THREE.MathUtils.lerp(heli.rotation.x,-.25,dt*.5);heli.position.z+=dt*12;heli.rotation.y=THREE.MathUtils.lerp(heli.rotation.y,-.35,dt*.4);}
 const dist=heli.position.distanceTo(cam.position);if(rotor)setGain(rotor,.09*Math.max(0,1-dist/600));if(dist>2500||heliT>60){heliOn=false;heli.visible=false;}}
function intro(dt){iT+=dt;const P=player.position;const gh=groundH(P.x,P.z);
 if(iPhase==='heli'){P.copy(heli.position).add(new THREE.Vector3(-.2,-.75,1.05));player.rotation.set(0,0,0);if(iT>3.5){iPhase='free';vel.set(HSPD*.6,2,5);pitch=-1.05;snd(500,.4,'triangle',.12,.4);}}
 else if(iPhase==='free'||iPhase==='chute'){const inp=moveInput(),toC=new THREE.Vector3(-P.x,0,-P.z);const dc=toC.length();toC.normalize().multiplyScalar(Math.min(iPhase==='free'?12:3,dc/5));
  const free=iPhase==='free';const want=toC.addScaledVector(inp,free?25:6);vel.x+=(want.x-vel.x)*Math.min(1,dt*1.2);vel.z+=(want.z-vel.z)*Math.min(1,dt*1.2);
  if(free){vel.y=Math.max(-140,vel.y-30*dt);player.rotation.set(1.25,yaw+Math.PI,0);if(P.y-gh<80){iPhase='chute';chute.visible=true;chute.scale.setScalar(.1);snd(380,.35,'triangle',.18,.5);}}
  else{vel.y+=(-6.5-vel.y)*Math.min(1,dt*2.2);chute.scale.lerp(new THREE.Vector3(1,1,1),Math.min(1,dt*4));player.rotation.set(Math.max(0,player.rotation.x-dt*3),yaw+Math.PI,Math.sin(iT*1.6)*.12);
   if(islandD(P.x,P.z)>.8){P.x*=.995;P.z*=.995;}}
  P.addScaledVector(vel,dt);if(P.y<=gh){P.y=gh;iPhase='land';iT=0;}
  const sp=-vel.y;if(wind)setGain(wind,free?.25*Math.min(1,sp/120):.03);
  if(free){for(let i=0;i<NS;i++){const b=i*6;let x=streakPos[b],y=streakPos[b+1],z=streakPos[b+2];if(y>P.y+25||y<P.y-40||Math.abs(x-P.x)>20||Math.abs(z-P.z)>20){x=P.x+rnd(-15,15);y=P.y-rnd(25,40);z=P.z+rnd(-15,15);}
    streakPos.set([x,y,z,x,y+sp*.06,z],b);}streaks.geometry.attributes.position.needsUpdate=true;streaks.visible=true;streaks.material.opacity=.55*Math.min(1,sp/100);}else streaks.visible=false;}
 else if(iPhase==='land'){P.y=gh;player.rotation.set(0,yaw+Math.PI,0);streaks.material.opacity=0;if(wind)setGain(wind,0);const u=chute.userData;
  u.can.scale.y=1.3*Math.max(.05,1-iT*1.5);u.can.position.y=4.2*Math.max(.1,1-iT*.9);u.mat.opacity=Math.max(0,1-iT);u.cords.material.opacity=Math.max(0,1-iT*2);if(iT>1.3)endIntro();}}
function introCam(){const P=player.position,tgt=iPhase==='heli'?heli.position.clone():P.clone().add(new THREE.Vector3(0,iPhase==='chute'?2.2:1,0));
 const dist=iPhase==='heli'?18:iPhase==='chute'?10:iPhase==='land'?7:6;cam.rotation.set(pitch,yaw,0);const f=new THREE.Vector3(0,0,-1).applyEuler(cam.rotation);
 cam.position.copy(tgt).addScaledVector(f,-dist);const g=groundH(cam.position.x,cam.position.z)+.5;if(cam.position.y<g)cam.position.y=g;}
function skipIntro(){if(mode!=='intro')return;endIntro();}
function endIntro(){iPhase='';const u=chute.userData;chute.visible=false;u.can.scale.y=1.3;u.can.position.y=4.2;u.mat.opacity=1;u.cords.material.opacity=1;streaks.visible=false;if(wind)setGain(wind,0);
 const P=player.position;if(islandD(P.x,P.z)>.85||P.y>groundH(P.x,P.z)+.5)spawnPlayer();introDone=true;$('skipBtn').classList.add('hide');document.body.classList.remove('intro');startPlay();}
function spawnPlayer(){let x=0,z=0;for(let k=0;k<50;k++){x=rnd(-6,6);z=rnd(-6,6);if(onLand(x,z,1))break;}player.position.set(x,groundH(x,z),z);}
function startPlay(){mode='play';player.rotation.set(0,yaw+Math.PI,0);pitch=-.1;vy=0;document.body.classList.add('playing');running=true;wave=0;nextWave();updHud();}
$('skipBtn').addEventListener('click',e=>{e.stopPropagation();skipIntro();});
// ---------- game flow ----------
function reset(){toSpawn=0;debris.forEach(d=>scene.remove(d.o));debris=[];lockT=null;swing=null;wasFiring=false;zombies.forEach(z=>scene.remove(z));zombies=[];score=0;wave=0;hp=100;vy=0;updHud();}
function nextWave(){if(mode!=='play')return;wave++;toSpawn=4+wave*3;spawnT=1;snd(200,.6,'sawtooth',.1,2);}
function begin(){ac=ac||new(window.AudioContext||window.webkitAudioContext)();ac.resume&&ac.resume();$('start').classList.add('hide');$('over').classList.add('hide');reset();fireT=0;
 if(introDone){spawnPlayer();yaw=0;startPlay();}else startIntro();}
$('startBtn').onclick=begin;$('restartBtn').onclick=begin;
// ---------- loop ----------
const camRc=new THREE.Raycaster(),clock=new THREE.Clock(),closeup=Q.get('view')==='closeup';let camOverride=null;
spawnPlayer();
let gT=0;function loop(){requestAnimationFrame(loop);const dt=Math.min(clock.getDelta(),.05),T=clock.elapsedTime;gT+=dt;const P=player.position;
 if(mode==='intro')intro(dt);updHeli(dt);
 if(running){const v=moveInput();const m=v.length();const gh0=groundH(P.x,P.z);const spd=gh0<.3?4:6.5;P.addScaledVector(v,spd*dt);collide(P,.4);curSpeed=m;
  const gh=groundH(P.x,P.z);vy-=20*dt;P.y+=vy*dt;if(P.y<=gh){P.y=gh;vy=0;}player.rotation.y=yaw+Math.PI;
  autoAim(dt);fireT-=dt;if((firing||fireId!==null)&&fireT<=0&&(aligned||(!lockT&&pause<=0))){shoot();fireT=.1;}
  const alive=zombies.filter(z=>!z.userData.dead).length;
  if(toSpawn>0){spawnT-=dt;if(spawnT<=0&&alive<ZCAP){spawn();toSpawn--;spawnT=Math.max(.35,1.4-wave*.1);}}else if(!zombies.length){nextWave();updHud();}
  for(const z of [...zombies]){const u=z.userData;
   if(u.dead){u.dead+=dt;z.rotation.x=Math.max(-Math.PI/2,-u.dead*3);u.mats.forEach(m=>m.opacity=Math.max(0,1-(u.dead-3)));if(u.dead>4.1){scene.remove(z);zombies.splice(zombies.indexOf(z),1);}continue;}
   if(u.hit>0){u.hit-=dt;u.mats[0].emissive.setHex(0xffffff);}else u.mats[0].emissive.setHex(0);
   const d=P.clone().sub(z.position);d.y=0;const dist=d.length();z.rotation.y=Math.atan2(d.x,d.z);u.ph+=dt*5;
   u.legs[0].rotation.x=Math.sin(u.ph)*.45;u.legs[1].rotation.x=-Math.sin(u.ph)*.45;u.arms[0].rotation.x=-1.5+Math.sin(u.ph)*.12;u.arms[1].rotation.x=-1.5-Math.sin(u.ph)*.12;z.rotation.z=Math.sin(u.ph*.5)*.12;
   if(dist>1){z.position.addScaledVector(d.normalize(),u.speed*dt);collide(z.position,.35);}
   else if(P.y-z.position.y<1.2){hp-=22*dt;updHud();if(Math.random()<dt*3)snd(80,.2,'sawtooth',.1,.5);
    if(hp<=0){running=false;mode='over';lockT=null;firing=false;fireId=null;document.body.classList.remove('playing');document.exitPointerLock&&document.exitPointerLock();$('final').textContent=`Score ${score} · Wave ${wave}`;$('over').classList.remove('hide');snd(300,1.2,'sawtooth',.2,.1);}}
   z.position.y=groundH(z.position.x,z.position.z);const fi=iceF(z.position.x,z.position.z);u.mats[0].color.copy(u.base).lerp(ICE_SKIN,fi*.7);u.mats[1].color.copy(u.base1).lerp(ICE_CLOTH,fi*.5);}}
 if(DEBUG&&running&&(firing||fireId!==null))aimLog.push({t:gT,yaw:yaw*180/Math.PI,pitch:pitch*180/Math.PI,err:aimErrDeg(),aligned,lock:lockT?zombies.indexOf(lockT):-1});
 updDebris(dt);updLock();
 player.userData.animate(T,mode==='intro'?0:curSpeed,mode==='intro'?(iPhase==='free'||iPhase==='chute'):P.y>groundH(P.x,P.z)+.05,dt);
 for(const t of [...tracers]){t.userData.life-=dt;t.material.opacity=t.userData.life/.06;if(t.userData.life<=0){scene.remove(t);t.geometry.dispose();tracers.splice(tracers.indexOf(t),1);}}
 if(camOverride){cam.position.copy(camOverride[0]);cam.lookAt(camOverride[1]);}
 else if(closeup&&mode==='menu'){player.rotation.set(0,-Math.PI*.1,0);cam.position.set(P.x+.15,P.y+1.4,P.z+2.3);cam.lookAt(P.x,P.y+1.15,P.z);}
 else if(mode==='menu'){const a=T*.05;cam.position.set(Math.cos(a)*115,48,Math.sin(a)*115);cam.lookAt(0,4,0);}
 else if(mode==='intro')introCam();
 else{const right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));cam.rotation.set(pitch,yaw,0);const f=new THREE.Vector3(0,0,-1).applyEuler(cam.rotation);
  const piv=new THREE.Vector3(P.x,P.y+1.75,P.z).addScaledVector(right,.8);const back=f.clone().negate();camRc.set(piv,back);camRc.far=4;const ch=camRc.intersectObjects(solids,false);
  cam.position.copy(piv).addScaledVector(back,ch.length?Math.max(.4,ch[0].distance-.3):4);const g=groundH(cam.position.x,cam.position.z)+.3;if(cam.position.y<g)cam.position.y=g;}
 const alt=Math.max(0,cam.position.y);scene.fog.near=90+alt*.7;scene.fog.far=520+alt*2.2;W.fogU.fogNear.value=scene.fog.near;W.fogU.fogFar.value=scene.fog.far;
 const nn=alt>150?1.5:.1;if(cam.near!==nn){cam.near=nn;cam.updateProjectionMatrix();}
 const sc=mode==='intro'?(iPhase==='heli'?heli.position:P):P;sun.position.copy(sc).addScaledVector(SUN_DIR,90);sun.target.position.copy(sc);
 W.update(T,cam);composer?composer.render():renderer.render(scene,cam);}
$('ver').textContent='build '+BUILD;
if(closeup){$('start').classList.add('hide');$('hud').classList.add('hide');}
if(DEBUG)window.__game={get mode(){return mode},get phase(){return iPhase},get score(){return score},get heads(){return headsDetached},get yaw(){return yaw},get alt(){return player.position.y},aimLog,
 setAlt(y){player.position.y=y;},overview(on){camOverride=on?[new THREE.Vector3(...on[0]),new THREE.Vector3(...on[1])]:null;},
 spawnNear(){spawn();const z=zombies[zombies.length-1];z.position.set(player.position.x-Math.sin(yaw)*5,0,player.position.z-Math.cos(yaw)*5);z.position.y=groundH(z.position.x,z.position.z);z.userData.hp=1;}};
loop();
