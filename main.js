import * as THREE from 'three';import {mk,mkc,LOD,mergeRigid} from './lod.js?v12';import {makeSoldier} from './soldier.js?v12';import {makeHeli,makeChute} from './heli.js?v12';
THREE.Sprite.prototype.raycast=function(){};
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
const LEVEL=new URLSearchParams(location.search).get('level')==='2'?2:1;
const WM=LEVEL===2?await import('./world2.js?v12'):await import('./world.js?v12');const {buildWorld,groundH,islandD,shoreR,SUN_DIR,FOG_COLOR,iceF,lavaF,LIGHTS}=WM;
export const BUILD='v12 2026-10-14 10:30';const $=id=>document.getElementById(id),Q=new URLSearchParams(location.search),DEBUG=Q.get('debug')==='1';
const MOBILE=matchMedia('(pointer:coarse)').matches||'ontouchstart' in window;if(MOBILE)document.body.classList.add('touch');
// ---------- quality tiers ----------
const QL=['auto','low','medium','high'];const LS=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);}catch(e){return null;}};
const qSet=QL.includes(Q.get('q'))?Q.get('q'):(QL.includes(LS('szQ'))?LS('szQ'):'auto');let DETECT=null;
function detectTier(){let gpu='';try{const c=document.createElement('canvas'),g=c.getContext('webgl');const e=g&&g.getExtension('WEBGL_debug_renderer_info');gpu=g?String(e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER)):'';const lc=g&&g.getExtension('WEBGL_lose_context');lc&&lc.loseContext();}catch(e){}
 const mem=navigator.deviceMemory||4,cores=navigator.hardwareConcurrency||4,px=Math.round(screen.width*screen.height*devicePixelRatio**2),G=gpu.toLowerCase();let sc=0;
 if(/swiftshader|llvmpipe|software|mali-[4t]|mali-g(31|51|52|57)|adreno \(tm\) [345]\d\d|adreno \(tm\) 6[01]\d|powervr|sgx|hd graphics [2-5]\d\d/.test(G))sc-=2;
 if(/apple gpu|apple m\d|adreno \(tm\) (6[4-9]\d|7\d\d)|mali-g7[1-9]|mali-g[67]\d\d|immortalis|nvidia|geforce|radeon|rtx/.test(G))sc+=1;
 if(mem<=3)sc-=1;if(cores<=4)sc-=1;if(MOBILE)sc-=1;if(MOBILE&&px>4e6)sc-=.5;if(!MOBILE&&cores>=8)sc+=1;
 DETECT={gpu,mem,cores,px,dpr:devicePixelRatio,score:sc};return sc<=-2?'low':sc<=0?'medium':'high';}
const detected=detectTier();const TIER=qSet==='auto'?(LS('szAutoTier')||detected):qSet;const LOWQ=TIER==='low',HIGHQ=TIER==='high',MEDQ=TIER==='medium';LOD.low=LOWQ;const LITE=MOBILE||!HIGHQ;
const maxPR=HIGHQ?Math.min(devicePixelRatio,MOBILE?1.3:2):MEDQ?Math.min(devicePixelRatio,1):.75,minPR=LOWQ?.5:MEDQ?.6:.7;let rScale=maxPR;
const renderer=new THREE.WebGLRenderer({antialias:HIGHQ&&!MOBILE,powerPreference:'high-performance'});renderer.setPixelRatio(rScale);renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=!LOWQ;if(MEDQ)renderer.shadowMap.autoUpdate=false;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=LIGHTS.exp;renderer.outputColorSpace=THREE.SRGBColorSpace;document.body.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.fog=new THREE.Fog(FOG_COLOR,90,520);
const cam=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,.1,7000);cam.rotation.order='YXZ';
const hemiL=new THREE.HemisphereLight(...LIGHTS.hemi);scene.add(hemiL);if(LOWQ){hemiL.intensity*=2.3;scene.add(new THREE.AmbientLight(0xffffff,LEVEL===2?.25:.45));}const rim=new THREE.DirectionalLight(...LIGHTS.rim);rim.position.set(...LIGHTS.rimPos);scene.add(rim);
const sun=new THREE.DirectionalLight(...LIGHTS.sun);sun.castShadow=!LOWQ;const S=MEDQ?1024:MOBILE?1024:2048;sun.shadow.mapSize.set(S,S);
Object.assign(sun.shadow.camera,{left:-30,right:30,top:30,bottom:-30,near:1,far:200});sun.shadow.bias=-.0003;sun.shadow.normalBias=.03;sun.shadow.radius=4;sun.shadow.blurSamples=12;scene.add(sun,sun.target);
const W=buildWorld(scene,LITE,renderer,{low:LOWQ});
// ---------- Low tier: Lambert materials, no dynamic point lights ----------
const LMC=new Map();function lamb(m){if(!m||!(m.isMeshStandardMaterial||m.isMeshPhysicalMaterial)||Object.prototype.hasOwnProperty.call(m,'onBeforeCompile'))return m;let l=LMC.get(m);
 if(!l){l=new THREE.MeshLambertMaterial({color:m.color,map:m.map,emissive:m.emissive,emissiveMap:m.emissiveMap,emissiveIntensity:m.emissiveIntensity,alphaTest:m.alphaTest,transparent:m.transparent,opacity:m.opacity,side:m.side,vertexColors:m.vertexColors,flatShading:m.flatShading,depthWrite:m.depthWrite});LMC.set(m,l);}return l;}
function lowify(root){if(!LOWQ)return;const kill=[];root.traverse(o=>{if(o.isMesh)o.material=Array.isArray(o.material)?o.material.map(lamb):lamb(o.material);if(o.isPointLight||o.isSpotLight)kill.push(o);});kill.forEach(o=>o.parent&&o.parent.remove(o));}
// ---------- merge static world meshes into few draw calls (all tiers; originals kept detached for raycasts) ----------
function matSig(m){return[m.type,m.color&&m.color.getHex(),m.map&&m.map.uuid,m.emissive&&m.emissive.getHex(),m.emissiveIntensity,m.emissiveMap&&m.emissiveMap.uuid,m.normalMap&&m.normalMap.uuid,m.bumpMap&&m.bumpMap.uuid,m.bumpScale,m.roughness,m.metalness,m.side,m.vertexColors,m.flatShading,m.alphaTest,m.opacity,m.wireframe,m.envMapIntensity,Object.prototype.hasOwnProperty.call(m,'onBeforeCompile')?m.uuid:''].join('|');}
const attrSig=g=>Object.keys(g.attributes).sort().map(k=>{const a=g.attributes[k];return k+':'+a.itemSize+(a.normalized?'n':'')+a.array.constructor.name+(a.isInterleavedBufferAttribute?'i':'');}).join(',');
const MERGE={before:0,after:0};
function mergeStatics(root){root.updateMatrixWorld(true);const snap=new Map();root.traverse(o=>{if(o.isMesh)snap.set(o,[o.matrixWorld.clone(),o.visible]);});
 W.update(1.3,cam);W.update(2.9,cam);root.updateMatrixWorld(true);const groups=new Map(),e=new THREE.Vector3();
 root.traverse(o=>{if(!o.isMesh||o.isInstancedMesh||o.isSkinnedMesh||o.children.length||!o.visible||Array.isArray(o.material)||o.material.transparent||o.material.isShaderMaterial||o===W.ground||o===W.water)return;
  const sn=snap.get(o);if(!sn||!sn[1]||!sn[0].equals(o.matrixWorld)||o.matrixWorld.determinant()<=0)return;for(let p=o.parent;p;p=p.parent)if(!p.visible)return;
  const g=o.geometry;if(g.morphAttributes&&Object.keys(g.morphAttributes).length)return;e.setFromMatrixPosition(o.matrixWorld);
  const key=matSig(o.material)+'#'+o.castShadow+o.receiveShadow+o.renderOrder+'#'+attrSig(g)+'#'+!!g.index+'#'+Math.floor(e.x/45)+','+Math.floor(e.z/45);let L=groups.get(key);if(!L)groups.set(key,L=[]);L.push(o);});
 for(const L of groups.values()){if(L.length<2)continue;MERGE.before+=L.length;const geos=L.map(o=>{const g=o.geometry.clone().applyMatrix4(o.matrixWorld);g.groups=[];return g;});const mg=mergeGeometries(geos,false);geos.forEach(g=>g.dispose());if(!mg){MERGE.before-=L.length;continue;}
  const m=new THREE.Mesh(mg,L[0].material);m.castShadow=L[0].castShadow;m.receiveShadow=L[0].receiveShadow;m.renderOrder=L[0].renderOrder;m.matrixAutoUpdate=false;m.updateMatrix();root.add(m);MERGE.after++;L.forEach(o=>o.parent.remove(o));}}
lowify(scene);scene.traverse(o=>{if(o.isInstancedMesh&&o.count===0)o.visible=false;});mergeStatics(scene);
let composer=null;if(HIGHQ&&!MOBILE){composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,cam));composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth/2,innerHeight/2),.28,.5,.9));composer.addPass(new OutputPass());}const solids=W.solids;
const rnd=(a,b)=>a+Math.random()*(b-a);
const player=makeSoldier();player.rotation.order='YXZ';scene.add(player);const RIGID={player:mergeRigid(player,player.userData.dyn)};lowify(player);
// blob shadow decals (Low tier replaces real-time shadows)
const blobG=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),blobM=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');const gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(0,0,0,.6)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);
 return new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});})();
function addBlob(parent,s){if(!LOWQ)return null;const b=new THREE.Mesh(blobG,blobM);b.scale.setScalar(s);b.position.y=.04;b.renderOrder=1;parent.add(b);return b;}
const pBlob=addBlob(player,1);
const SM=p=>{if(LOWQ){delete p.roughness;delete p.metalness;delete p.bumpMap;delete p.bumpScale;return new THREE.MeshLambertMaterial(p);}return new THREE.MeshStandardMaterial(p);};
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
addEventListener('touchstart',e=>{if(e.target.closest&&e.target.closest('button'))return;e.preventDefault();document.body.classList.add('touch');if(mode!=='intro'&&mode!=='play')return;
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
const _mv=new THREE.Vector3(),_mr=new THREE.Vector3(),_zd=new THREE.Vector3(),_c1=new THREE.Vector3(),_c2=new THREE.Vector3(),_c3=new THREE.Vector3(),_c4=new THREE.Vector3();
function moveInput(){let mx=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0),sx=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0);
 if(stick.id!==null){mx-=stick.y;sx+=stick.x;}const v=_mv.set(-Math.sin(yaw),0,-Math.cos(yaw)).multiplyScalar(mx).addScaledVector(_mr.set(Math.cos(yaw),0,-Math.sin(yaw)),sx);
 const m=v.length();if(m>1)v.divideScalar(m);return m<.15?v.set(0,0,0):v;}
// ---------- zombies ----------
// ---------- zombies: hunched fantasy undead, 3 types ----------
const rotTex=(()=>{const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.fillStyle='#8a9a6a';g.fillRect(0,0,256,256);
 for(let i=0;i<260;i++){const x=Math.random()*256,y=Math.random()*256,r=2+Math.random()*16;g.fillStyle=['rgba(70,60,40,.35)','rgba(110,40,50,.3)','rgba(150,170,110,.35)','rgba(40,50,30,.4)','rgba(90,110,140,.25)'][i%5];g.beginPath();g.ellipse(x,y,r,r*.6,Math.random()*3,0,7);g.fill();}
 g.strokeStyle='rgba(60,30,30,.5)';for(let i=0;i<40;i++){g.lineWidth=1+Math.random()*2;g.beginPath();let x=Math.random()*256,y=Math.random()*256;g.moveTo(x,y);for(let k=0;k<4;k++){x+=Math.random()*20-10;y+=Math.random()*20-10;g.lineTo(x,y);}g.stroke();}
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;})();
const tornTex=(()=>{const c=document.createElement('canvas');c.width=128;c.height=128;const g=c.getContext('2d');g.fillStyle='#fff';g.beginPath();g.moveTo(0,0);g.lineTo(128,0);
 for(let x=128;x>=0;x-=8)g.lineTo(x,90+Math.random()*36);g.closePath();g.fill();g.globalCompositeOperation='destination-out';for(let i=0;i<10;i++){g.beginPath();g.ellipse(Math.random()*128,20+Math.random()*80,3+Math.random()*7,2+Math.random()*5,Math.random()*3,0,7);g.fill();}
 g.globalCompositeOperation='source-atop';for(let i=0;i<300;i++){g.fillStyle=`rgba(0,0,0,${Math.random()*.25})`;g.fillRect(Math.random()*128,Math.random()*128,3,3);}
 g.strokeStyle='rgba(0,0,0,.25)';for(let y=0;y<128;y+=6){g.beginPath();g.moveTo(0,y);g.lineTo(128,y+Math.random()*4);g.stroke();}const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;})();
const glowZ=(()=>{const c=document.createElement('canvas');c.width=c.height=32;const g=c.getContext('2d');const gr=g.createRadialGradient(16,16,0,16,16,16);gr.addColorStop(0,'#fff');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,32,32);return new THREE.CanvasTexture(c);})();
const ZT={walker:{skin:0x9aae78,eye:0xc8ff40,sc:1,hp:1,sp:1,cloth:[0x4a3a5a,0x5a3a22,0x2a3f4f,0x4a2a2a]},runner:{skin:0x8f9aa8,eye:0xff3020,sc:.92,hp:.6,sp:1.75,cloth:[0x2f2f38,0x3a2a2a]},brute:{skin:0x6f7a4a,eye:0xffa020,sc:1.45,hp:3,sp:.62,cloth:[0x3a2a1a,0x2a2a1f]},fiery:{skin:0x4a2a22,eye:0xffb030,sc:1.08,hp:1.6,sp:1.35,cloth:[0x1a1210,0x2a1a14],fire:true}};
function makeZombie(type='walker'){const T=ZT[type],g=new THREE.Group(),sk=SM({map:rotTex,bumpMap:rotTex,bumpScale:2,color:T.skin,roughness:.75}),
  cl=SM({map:tornTex,alphaTest:.5,side:THREE.DoubleSide,color:T.cloth[Math.random()*T.cloth.length|0],roughness:.95}),pa=SM({map:tornTex,color:0x2a2a30,roughness:.95});
 if(T.fire){sk.emissive=new THREE.Color(0xff3a08);sk.emissiveMap=rotTex;sk.emissiveIntensity=.55;}
 const sockM=SM({color:0x1a1a14,roughness:.9});const mats=[sk,cl,pa];sk.color.offsetHSL(rnd(-.03,.03),rnd(-.1,.05),rnd(-.06,.04));const eyeM=new THREE.MeshBasicMaterial({color:T.eye});eyeM.color.multiplyScalar(3);
 const M=(geo,m,x,y,z,p=g)=>{const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);o.castShadow=true;p.add(o);o.userData.root=g;return o};const cap=(r,l)=>mkc(THREE.CapsuleGeometry,r,l,5,12);
 const legs=[];for(const x of[-.14,.14]){const l=new THREE.Group();l.position.set(x,.95,0);g.add(l);M(cap(.11,.36),pa,0,-.24,0,l);const kn=new THREE.Group();kn.position.y=-.48;l.add(kn);kn.rotation.x=.25;M(cap(.09,.34),sk,0,-.22,0,kn);M(mkc(THREE.BoxGeometry,.14,.07,.26),sk,0,-.44,.06,kn);legs.push(l);}
 const bod=new THREE.Group();bod.position.y=.95;bod.rotation.x=.45;g.add(bod);M(cap(.2,.15),pa,0,.05,0,bod).scale.set(1.15,1,.8);
 M(cap(.24,.32),sk,0,.48,0,bod).scale.set(1.12,1,.75);M(mkc(THREE.CylinderGeometry,.29,.27,.62,16,1,true),cl,0,.5,0,bod).scale.set(1.05,1,.8);
 for(let i=0;i<4;i++)M(mkc(THREE.SphereGeometry,.045,8,6),sk,0,.3+i*.12,-.17,bod);
 const nk=new THREE.Group();nk.position.set(0,.88,.06);nk.rotation.x=-.25;bod.add(nk);M(cap(.07,.08),sk,0,.05,0,nk);
 const head=M(mkc(THREE.SphereGeometry,.2,20,16),sk,0,.24,.07,nk);head.scale.set(.95,1.08,1);
 M(mkc(THREE.BoxGeometry,.2,.06,.14),sk,0,-.16,.08,head).rotation.x=.35;for(const s of[-1,1]){M(mkc(THREE.SphereGeometry,.042,10,8),eyeM,s*.075,.03,.17,head);if(!LOWQ)M(mkc(THREE.SphereGeometry,.06,10,8),sockM,s*.075,.06,.15,head).scale.set(1,.5,.6);}
 const eg=new THREE.Sprite(new THREE.SpriteMaterial({map:glowZ,color:T.eye,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:.8}));eg.scale.set(.5,.22,1);eg.position.set(0,.03,.2);if(!LOWQ)head.add(eg);
 const arms=[];for(const s of[-1,1]){const a=new THREE.Group();a.position.set(s*.33,.78,0);bod.add(a);M(cap(.075,.26),sk,0,-.18,0,a);if(!LOWQ)M(mkc(THREE.CylinderGeometry,.1,.09,.18,10,1,true),cl,0,-.06,0,a);
  const el=new THREE.Group();el.position.y=-.36;el.rotation.x=-.5;a.add(el);M(cap(.065,.24),sk,0,-.16,0,el);for(let k=0;k<3;k++)M(mkc(THREE.ConeGeometry,.018,.1,5),sk,(k-1)*.035,-.36,.02,el).rotation.x=Math.PI*.9;
  a.rotation.x=-1.1;arms.push(a);}
 if(T.fire){const fl=new THREE.Sprite(new THREE.SpriteMaterial({map:glowZ,color:0xff5a10,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:.55}));fl.scale.set(1.6,2.2,1);fl.position.set(0,.5,0);bod.add(fl);}
 addBlob(g,1.1);mergeRigid(g,[...legs,...arms,bod,head]);g.scale.setScalar(T.sc);g.userData={legs,arms,mats,head,type,hp:0,dead:0,ph:Math.random()*6,base:sk.color.clone(),base1:cl.color.clone()};return g;}
const ICE_SKIN=new THREE.Color(0x9fd8ff),ICE_CLOTH=new THREE.Color(0x4a6f9a);
let zombies=[],tracers=[],score=0,wave=0,hp=100,toSpawn=0,spawnT=0,fireT=0,vy=0,curSpeed=0;const ZCAP=LOWQ?9:MOBILE?14:28;
function onLand(x,z,clear=.6){if(islandD(x,z)>.88)return false;for(const c of W.circles)if(Math.hypot(c.x-x,c.z-z)<c.r+clear)return false;for(const b of W.boxes)if(Math.abs(b.x-x)<b.hx+clear&&Math.abs(b.z-z)<b.hz+clear)return false;return true;}
function spawn(){const r0=Math.random(),type=LEVEL===2?(r0<.22?'fiery':r0<.4?'brute':r0<.7?'runner':'walker'):(r0<.13?'brute':r0<.38?'runner':'walker');const z=makeZombie(type);let x=0,zz=0;for(let k=0;k<40;k++){const a=rnd(0,6.28),r=rnd(18,36);x=player.position.x+Math.cos(a)*r;zz=player.position.z+Math.sin(a)*r;if(onLand(x,zz)&&lavaF(x,zz)<.05)break;
  if(k===39){const b=rnd(0,6.28),R=shoreR(b)*rnd(.3,.8);x=Math.cos(b)*R;zz=Math.sin(b)*R;}}
 z.position.set(x,groundH(x,zz),zz);const ZTt=ZT[type];z.userData.hp=Math.max(1,Math.round((2+Math.floor(wave/2))*ZTt.hp*(LEVEL===2?1.6:1)));z.userData.speed=(1.4+wave*.15+Math.random()*.6)*ZTt.sp*(LEVEL===2?1.18:1);scene.add(z);zombies.push(z);}
function die(){if(mode==='over')return;running=false;mode='over';lockT=null;firing=false;fireId=null;document.body.classList.remove('playing');document.exitPointerLock&&document.exitPointerLock();$('final').textContent=`Score ${score} · Wave ${wave} · Level ${LEVEL}`;$('over').classList.remove('hide');snd(300,1.2,'sawtooth',.2,.1);}
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
 if(!lockT){let best=null,bs=1e9;const cands=[];const f=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
  for(const z of zombies){if(z.userData.dead)continue;const d=_zd.copy(z.position).sub(player.position);d.y=0;const dist=d.length();if(dist>45)continue;
   const s=dist+Math.acos(THREE.MathUtils.clamp(d.normalize().dot(f),-1,1))*6;cands.push([s,z]);}
  cands.sort((p,q)=>p[0]-q[0]);for(let i=0;i<Math.min(3,cands.length);i++)if(los(cands[i][1])){best=cands[i][1];break;}
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
 const t=TP[tpI++%TP.length],ta=t.geometry.attributes.position;ta.array.set([o.x,o.y,o.z,end.x,end.y,end.z]);ta.needsUpdate=true;t.userData.life=.06;t.material.opacity=1;t.visible=true;}
const TP=[];let tpI=0;for(let i=0;i<10;i++){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6),3));const l=new THREE.Line(g,new THREE.LineBasicMaterial({color:0xfff27a,transparent:true}));l.frustumCulled=false;l.visible=false;l.userData.life=0;scene.add(l);TP.push(l);}
// ---------- decapitation ----------
let debris=[],headsDetached=0;
function decap(z,dir){const h=z.userData.head;scene.attach(h);headsDetached++;
 for(let k=0;k<(LOWQ?2:MOBILE?3:6);k++){const ch=new THREE.Mesh(new THREE.DodecahedronGeometry(rnd(.04,.08),0),new THREE.MeshStandardMaterial({color:k%2?0x5a0a0a:0x3f5a20,roughness:.6,transparent:true}));h.getWorldPosition(ch.position);scene.add(ch);debris.push({o:ch,v:new THREE.Vector3(rnd(-3,3)+dir.x*2,rnd(3,6),rnd(-3,3)+dir.z*2),s:new THREE.Vector3(rnd(-15,15),rnd(-15,15),rnd(-15,15)),t:0,r:.05,mat:ch.material});}
 debris.push({o:h,v:new THREE.Vector3(dir.x*3+rnd(-1,1),rnd(5,7),dir.z*3+rnd(-1,1)),s:new THREE.Vector3(rnd(-12,12),rnd(-12,12),rnd(-12,12)),t:0,r:.24,mat:h.material});
 const n=LOWQ?18:MOBILE?36:70,pos=new Float32Array(n*3),col=new Float32Array(n*3),vel=[];h.getWorldPosition(tmpV);
 for(let i=0;i<n;i++){pos.set([tmpV.x,tmpV.y-.15,tmpV.z],i*3);col.set(Math.random()<.4?[.35,.8,.15]:[.6,.02,.02],i*3);vel.push(new THREE.Vector3(rnd(-3,3),rnd(1,5),rnd(-3,3)));}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('color',new THREE.BufferAttribute(col,3));
 const pts=new THREE.Points(geo,new THREE.PointsMaterial({size:.16,vertexColors:true,transparent:true,map:glowZ,depthWrite:false}));scene.add(pts);debris.push({o:pts,parts:vel,t:0,gy:z.position.y});}
function updDebris(dt){for(const d of [...debris]){d.t+=dt;
 if(d.parts){const a=d.o.geometry.attributes.position;for(let i=0;i<d.parts.length;i++){const v=d.parts[i];v.y-=15*dt;a.array[i*3]+=v.x*dt;a.array[i*3+1]=Math.max(d.gy+.02,a.array[i*3+1]+v.y*dt);a.array[i*3+2]+=v.z*dt;}
  a.needsUpdate=true;d.o.material.opacity=Math.max(0,1-d.t/1.2);if(d.t>1.2){scene.remove(d.o);d.o.geometry.dispose();debris.splice(debris.indexOf(d),1);}continue;}
 const o=d.o;d.v.y-=20*dt;o.position.addScaledVector(d.v,dt);o.rotation.x+=d.s.x*dt;o.rotation.y+=d.s.y*dt;o.rotation.z+=d.s.z*dt;const gy=groundH(o.position.x,o.position.z)+d.r;
 if(o.position.y<gy){o.position.y=gy;if(Math.abs(d.v.y)>1)d.v.y=-d.v.y*.45;else d.v.y=0;d.v.x*=.7;d.v.z*=.7;d.s.multiplyScalar(.6);}
 d.mat.opacity=Math.max(0,1-(d.t-3));if(d.t>4.2){scene.remove(o);debris.splice(debris.indexOf(d),1);}}}
// ---------- random drop spot ----------
function okSpot(x,z){if(!onLand(x,z,2)||islandD(x,z)>.8)return false;const h=groundH(x,z);if(h<.7||h>9)return false;
 for(const[a,b] of[[0,0],[3,0],[-3,0],[0,3],[0,-3]])if(lavaF(x+a,z+b)>.02)return false;return Math.abs(groundH(x+1,z)-groundH(x-1,z))<1.4&&Math.abs(groundH(x,z+1)-groundH(x,z-1))<1.4;}
function pickDrop(){for(let k=0;k<600;k++){const a=rnd(0,6.283),R=shoreR(a)*Math.sqrt(rnd(.01,.55)),x=Math.cos(a)*R,z=Math.sin(a)*R;if(okSpot(x,z))return new THREE.Vector3(x,groundH(x,z),z);}return new THREE.Vector3(0,groundH(0,0),0);}
let DT=new THREE.Vector3(),heading=0,rejumping=false,rjReady=0,rjShown=-1;const RJ_CD=3000;const landed=[];
// ---------- intro: high-altitude jump ----------
const heli=makeHeli();heli.visible=false;scene.add(heli);const chute=makeChute();chute.visible=false;player.add(chute);lowify(heli);lowify(chute);
const HALT=1150,HSPD=38;let iPhase='',iT=0,heliT=0,heliOn=false;const vel=new THREE.Vector3();
const NS=70,streakPos=new Float32Array(NS*6).fill(-9999);const streaks=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:0,fog:false}));
streaks.geometry.setAttribute('position',new THREE.BufferAttribute(streakPos,3));streaks.frustumCulled=false;streaks.visible=false;scene.add(streaks);
function startIntro(){mode='intro';iPhase='heli';iT=0;heliT=0;heliOn=true;heli.visible=true;DT=pickDrop();heading=rnd(0,6.283);const hd=new THREE.Vector3(Math.cos(heading),0,-Math.sin(heading));
 heli.position.copy(DT).addScaledVector(hd,-(19+HSPD*3.5));heli.position.y=HALT;heli.rotation.set(0,heading,0);chute.visible=false;
 yaw=heading-Math.PI/2+.5;pitch=-.25;document.body.classList.remove('playing');document.body.classList.add('intro');$('skipBtn').classList.remove('hide');rotorStart();windStart();setGain(rotor,.09);}
function updHeli(dt){if(!heliOn)return;heliT+=dt;heli.userData.spin(dt);heli.position.addScaledVector(new THREE.Vector3(Math.cos(heli.rotation.y),0,-Math.sin(heli.rotation.y)),HSPD*dt);
 if(iPhase!=='heli'){heli.position.y+=6*dt;heli.rotation.z=THREE.MathUtils.lerp(heli.rotation.z,-.18,dt);heli.rotation.x=THREE.MathUtils.lerp(heli.rotation.x,-.25,dt*.5);heli.rotation.y=THREE.MathUtils.lerp(heli.rotation.y,heading-.35,dt*.4);}
 const dist=heli.position.distanceTo(cam.position);if(rotor)setGain(rotor,.09*Math.max(0,1-dist/600));if(dist>2500||heliT>60){heliOn=false;heli.visible=false;}}
function intro(dt){iT+=dt;const P=player.position;const gh=groundH(P.x,P.z);
 if(iPhase==='heli'){heli.updateMatrixWorld();P.copy(heli.localToWorld(new THREE.Vector3(-.2,-.75,1.05)));player.rotation.set(0,heading,0);if(iT>3.5){iPhase='free';vel.set(Math.cos(heading)*HSPD*.6,2,-Math.sin(heading)*HSPD*.6);pitch=-1.05;snd(500,.4,'triangle',.12,.4);}}
 else if(iPhase==='free'||iPhase==='chute'){const inp=moveInput(),toC=new THREE.Vector3(DT.x-P.x,0,DT.z-P.z);const dc=toC.length();toC.normalize().multiplyScalar(Math.min(iPhase==='free'?12:3,dc/5));
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
 const P=player.position;if(!okSpot(P.x,P.z)&&(islandD(P.x,P.z)>.85||!onLand(P.x,P.z,.5)||lavaF(P.x,P.z)>.02)||P.y>groundH(P.x,P.z)+.5)P.copy(DT);P.y=groundH(P.x,P.z);
 landed.push([+P.x.toFixed(1),+P.z.toFixed(1)]);if(DEBUG)console.log('[drop] target',DT.x.toFixed(1),DT.z.toFixed(1),'landed',P.x.toFixed(1),P.z.toFixed(1));
 for(const z of zombies){const d=z.position.clone().sub(P);d.y=0;const L=d.length();if(L<16){d.normalize();for(const r of[18,22,26]){const x=P.x+d.x*r,zz=P.z+d.z*r;if(onLand(x,zz)&&lavaF(x,zz)<.05){z.position.set(x,groundH(x,zz),zz);break;}}}}
 introDone=true;$('skipBtn').classList.add('hide');document.body.classList.remove('intro');startPlay(rejumping);rejumping=false;}
function spawnPlayer(){player.position.copy(pickDrop());}
function startPlay(keep){mode='play';player.rotation.set(0,yaw+Math.PI,0);pitch=-.1;vy=0;document.body.classList.add('playing');running=true;rjReady=performance.now()+RJ_CD;if(!keep){wave=0;nextWave();}updHud();}
function rejump(){if(mode!=='play'||performance.now()<rjReady)return;running=false;firing=false;fireId=null;lockT=null;swing=null;wasFiring=false;rejumping=true;vy=0;document.exitPointerLock&&document.exitPointerLock();startIntro();snd(500,.3,'triangle',.12,1.5);}
$('rejumpBtn').addEventListener('click',e=>{e.stopPropagation();rejump();});addEventListener('keydown',e=>{if(e.code==='KeyH')rejump();});
function updRejump(){const el=$('rejumpBtn');const v=mode==='play'?Math.ceil(Math.max(0,(rjReady-performance.now())/1000)):-2;if(v===rjShown)return;rjShown=v;el.classList.toggle('cd',v!==0);el.disabled=v!==0;el.querySelector('b').textContent=v>0?v+'s':v===0?'JUMP AGAIN':'—';}
$('skipBtn').addEventListener('click',e=>{e.stopPropagation();skipIntro();});
// ---------- game flow ----------
function reset(){toSpawn=0;debris.forEach(d=>scene.remove(d.o));debris=[];lockT=null;swing=null;wasFiring=false;zombies.forEach(z=>scene.remove(z));zombies=[];score=0;wave=0;hp=100;vy=0;updHud();}
const lvURL=(l,go)=>{const q=new URLSearchParams(location.search);q.set('level',l);if(go)q.set('go','1');else q.delete('go');return location.pathname+'?'+q.toString();};
function card(t,sub,ms=2600){const c=$('lvlCard');c.querySelector('h2').textContent=t;c.querySelector('p').textContent=sub;c.classList.remove('hide');c.style.opacity=1;clearTimeout(card.t);card.t=setTimeout(()=>{c.style.opacity=0;setTimeout(()=>c.classList.add('hide'),700);},ms);}
function goLevel2(){if(mode==='trans')return;running=false;mode='trans';firing=false;fireId=null;lockT=null;try{localStorage.setItem('szUnlocked','2');sessionStorage.setItem('szCarry',JSON.stringify({score}));}catch(e){}
 document.body.classList.remove('playing');card('LEVEL 2','Ember Isle unlocked — prepare to drop',4000);snd(220,1.2,'sawtooth',.12,3);setTimeout(()=>location.href=lvURL(2,true),2600);}
function nextWave(){if(mode!=='play')return;wave++;toSpawn=4+wave*3;spawnT=1;snd(200,.6,'sawtooth',.1,2);}
function begin(){ac=ac||new(window.AudioContext||window.webkitAudioContext)();ac.resume&&ac.resume();$('start').classList.add('hide');$('over').classList.add('hide');reset();fireT=0;
 if(introDone){spawnPlayer();yaw=0;startPlay();}else startIntro();if(LEVEL===2&&!introDone)card('LEVEL 2','EMBER ISLE');}
function goFS(){try{const el=document.documentElement,f=el.requestFullscreen||el.webkitRequestFullscreen;if(f&&!(document.fullscreenElement||document.webkitFullscreenElement)){const r=f.call(el,{navigationUI:'hide'});const lock=()=>{try{const p=screen.orientation&&screen.orientation.lock&&screen.orientation.lock('landscape');p&&p.catch&&p.catch(()=>{});}catch(e){}};r&&r.then?r.then(lock,()=>{}):lock();}}catch(e){}}
const fsOK=!!(document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen);if(!fsOK||matchMedia('(display-mode: fullscreen),(display-mode: standalone)').matches||navigator.standalone)$('fsBtn').classList.add('hide');
$('fsBtn').addEventListener('click',e=>{e.stopPropagation();if(document.fullscreenElement||document.webkitFullscreenElement){(document.exitFullscreen||document.webkitExitFullscreen).call(document);}else goFS();});
const unlocked=(()=>{try{return +localStorage.getItem('szUnlocked')||1;}catch(e){return 1;}})();
document.querySelectorAll('#lvlSel button').forEach(b=>{const l=+b.dataset.l;if(l>unlocked&&!Q.get('unlock')){b.disabled=true;b.textContent+=' 🔒';}if(l===LEVEL)b.classList.add('sel');
 b.onclick=()=>{if(l===LEVEL){goFS();begin();}else location.href=lvURL(l,true);};});
addEventListener('pointerdown',()=>ac&&ac.resume&&ac.resume());addEventListener('touchstart',()=>ac&&ac.resume&&ac.resume(),{passive:true});
$('startBtn').onclick=()=>{goFS();begin();};$('restartBtn').addEventListener('click',goFS);$('restartBtn').onclick=begin;
// ---------- loop ----------
const camRc=new THREE.Raycaster(),clock=new THREE.Clock(),closeup=Q.get('view')==='closeup';let camOverride=null;
spawnPlayer();
let gT=0,lavaHurt=0,frameN=0;const PF={ms:[],calls:0,tris:0};function loop(){requestAnimationFrame(loop);const _t0=performance.now();scaler(_t0);const dt=Math.min(clock.getDelta(),.05),T=clock.elapsedTime;gT+=dt;const P=player.position;
 if(mode==='intro')intro(dt);updHeli(dt);
 if(running){const v=moveInput();const m=v.length();const gh0=groundH(P.x,P.z);const spd=gh0<.3?4:6.5;P.addScaledVector(v,spd*dt);collide(P,.4);curSpeed=m;
  const gh=groundH(P.x,P.z);vy-=20*dt;P.y+=vy*dt;if(P.y<=gh){P.y=gh;vy=0;}player.rotation.y=yaw+Math.PI;
  if(P.y<=gh+.05&&lavaF(P.x,P.z)>.5){hp-=34*dt;lavaHurt+=dt;$('vig').classList.add('burn');if(Math.random()<dt*4)snd(140,.25,'sawtooth',.1,.4);updHud();if(hp<=0)die();}else $('vig').classList.remove('burn');
  autoAim(dt);fireT-=dt;if((firing||fireId!==null)&&fireT<=0&&(aligned||(!lockT&&pause<=0))){shoot();fireT=.1;}
  const alive=zombies.filter(z=>!z.userData.dead).length;
  if(toSpawn>0){spawnT-=dt;if(spawnT<=0&&alive<ZCAP){spawn();toSpawn--;spawnT=Math.max(.35,1.4-wave*.1);}}else if(!zombies.length){if(LEVEL===1&&wave>=5)goLevel2();else{nextWave();updHud();}}
  for(const z of [...zombies]){const u=z.userData;
   if(u.dead){u.dead+=dt;z.rotation.x=Math.max(-Math.PI/2,-u.dead*3);if(u.dead>3)u.mats.forEach(m=>{if(!m.transparent){m.transparent=true;m.needsUpdate=true;}m.opacity=Math.max(0,1-(u.dead-3));});if(u.dead>4.1){scene.remove(z);zombies.splice(zombies.indexOf(z),1);}continue;}
   if(u.hit>0){u.hit-=dt;u.mats[0].emissive.setHex(0x664444);}else u.mats[0].emissive.setHex(u.type==='fiery'?0xff3a08:0);
   const d=_zd.copy(P).sub(z.position);d.y=0;const dist=d.length();z.rotation.y=Math.atan2(d.x,d.z);u.ph+=dt*5;
   u.legs[0].rotation.x=Math.sin(u.ph)*.45;u.legs[1].rotation.x=-Math.sin(u.ph)*.45;u.arms[0].rotation.x=-1.1+Math.sin(u.ph)*.18;u.arms[1].rotation.x=-1.1-Math.sin(u.ph)*.18;z.rotation.z=Math.sin(u.ph*.5)*.12;
   if(dist>1){z.position.addScaledVector(d.normalize(),u.speed*dt);collide(z.position,.35);}
   else if(P.y-z.position.y<1.2){hp-=22*dt*(u.type==='brute'?1.6:u.type==='fiery'?1.3:1);updHud();if(Math.random()<dt*3)snd(80,.2,'sawtooth',.1,.5);
    if(hp<=0)die();}
   z.position.y=groundH(z.position.x,z.position.z);const fi=iceF(z.position.x,z.position.z);u.mats[0].color.copy(u.base).lerp(ICE_SKIN,fi*.7);u.mats[1].color.copy(u.base1).lerp(ICE_CLOTH,fi*.5);}}
 if(DEBUG&&running&&(firing||fireId!==null))aimLog.push({t:gT,yaw:yaw*180/Math.PI,pitch:pitch*180/Math.PI,err:aimErrDeg(),aligned,lock:lockT?zombies.indexOf(lockT):-1});
 updRejump();
 updDebris(dt);updLock();
 player.userData.animate(T,mode==='intro'?0:curSpeed,mode==='intro'?(iPhase==='free'||iPhase==='chute'):P.y>groundH(P.x,P.z)+.05,dt);
 for(const t of TP)if(t.visible){t.userData.life-=dt;t.material.opacity=t.userData.life/.06;if(t.userData.life<=0)t.visible=false;}
 if(pBlob)pBlob.visible=mode!=='intro'||iPhase==='land';
 if(camOverride){cam.position.copy(camOverride[0]);cam.lookAt(camOverride[1]);}
 else if(closeup&&mode==='menu'){player.rotation.set(0,-Math.PI*.1,0);cam.position.set(P.x+.15,P.y+1.4,P.z+2.3);cam.lookAt(P.x,P.y+1.15,P.z);}
 else if(mode==='menu'){const a=T*.05;cam.position.set(Math.cos(a)*115,48,Math.sin(a)*115);cam.lookAt(0,4,0);}
 else if(mode==='intro')introCam();
 else{const right=_c1.set(Math.cos(yaw),0,-Math.sin(yaw));cam.rotation.set(pitch,yaw,0);const f=_c2.set(0,0,-1).applyEuler(cam.rotation);
  const piv=_c3.set(P.x,P.y+1.75,P.z).addScaledVector(right,.8);const back=_c4.copy(f).negate();camRc.set(piv,back);camRc.far=4;const ch=camRc.intersectObjects(solids,false);
  cam.position.copy(piv).addScaledVector(back,ch.length?Math.max(.4,ch[0].distance-.3):4);const g=groundH(cam.position.x,cam.position.z)+.3;if(cam.position.y<g)cam.position.y=g;}
 const alt=Math.max(0,cam.position.y);scene.fog.near=LIGHTS.fog[0]+alt*.7;scene.fog.far=LIGHTS.fog[1]+alt*2.2;W.fogU.fogNear.value=scene.fog.near;W.fogU.fogFar.value=scene.fog.far;
 const nn=alt>150?1.5:.1;if(cam.near!==nn){cam.near=nn;cam.updateProjectionMatrix();}
 const sc=mode==='intro'?(iPhase==='heli'?heli.position:P):P;sun.position.copy(sc).addScaledVector(SUN_DIR,90);sun.target.position.copy(sc);
 if(MEDQ&&(frameN++&1)===0)renderer.shadowMap.needsUpdate=true;
 W.update(T,cam);composer?composer.render():renderer.render(scene,cam);PF.calls=renderer.info.render.calls;PF.tris=renderer.info.render.triangles;PF.ms.push(performance.now()-_t0);if(PF.ms.length>600)PF.ms.shift();}
$('ver').textContent='build '+BUILD+' · '+TIER;
// ---------- dynamic resolution scaler (hysteresis) + auto tier downgrade + FPS counter ----------
let lastNow=performance.now(),winSum=0,winN=0,slowW=0,fastW=0,degraded=0;const NOSCALE=Q.get('noscale')==='1';
function setScale(v){rScale=Math.max(minPR,Math.min(maxPR,v));renderer.setPixelRatio(rScale);renderer.setSize(innerWidth,innerHeight);if(composer){composer.setPixelRatio(rScale);composer.setSize(innerWidth,innerHeight);}}
function degrade(){degraded++;if(composer)composer=null;else if(sun.castShadow){sun.castShadow=false;}
 if(degraded>=2){const order=['high','medium','low'],i=order.indexOf(TIER);if(i<2&&LS('szAutoTier')!==order[2])LS('szAutoTier',order[Math.min(2,i+1)]);}}
function scaler(now){const ft=now-lastNow;lastNow=now;if(ft>300||document.hidden)return;winSum+=ft;winN++;if(winSum<1000)return;const avg=winSum/winN;winSum=winN=0;
 if(showFps)$('fps').textContent=`${(1000/avg).toFixed(0)} fps · ${avg.toFixed(1)} ms · ${TIER}${qSet==='auto'?' (auto)':''} · ${rScale.toFixed(2)}x`;
 if(NOSCALE||(mode!=='play'&&mode!=='intro'))return;if(avg>19){slowW++;fastW=0;}else if(avg<15.5){fastW++;slowW=0;}else{slowW=0;fastW=0;}
 if(slowW>=2){slowW=0;if(rScale>minPR+.001)setScale(rScale-.1);else if(qSet==='auto')degrade();}
 if(fastW>=4){fastW=0;if(rScale<maxPR-.001)setScale(rScale+.05);}}
// ---------- settings UI (start screen + HUD gear) ----------
let showFps=LS('szFps')==='1'||Q.get('fps')==='1';
function syncSettings(){document.querySelectorAll('.qbtns').forEach(el=>{el.querySelectorAll('button').forEach(b=>b.classList.toggle('sel',b.dataset.q===qSet));});
 document.querySelectorAll('.fpsBtn').forEach(b=>b.textContent='FPS: '+(showFps?'ON':'OFF'));$('fps').classList.toggle('hide',!showFps);
 document.querySelectorAll('.qinfo').forEach(p=>p.textContent=`Running: ${TIER.toUpperCase()}${qSet==='auto'?' (auto-detected '+detected+(LS('szAutoTier')?', lowered after slow frames':'')+')':''} · changing quality reloads`);}
document.querySelectorAll('.qbtns').forEach(el=>{QL.forEach(q=>{const b=document.createElement('button');b.dataset.q=q;b.textContent=q==='medium'?'MED':q.toUpperCase();
 b.onclick=e=>{e.stopPropagation();if(q===qSet)return;LS('szQ',q);LS('szAutoTier',null);const u=new URLSearchParams(location.search);u.delete('q');u.delete('go');location.href=location.pathname+(u.toString()?'?'+u:'');};el.appendChild(b);});});
document.querySelectorAll('.fpsBtn').forEach(b=>b.onclick=e=>{e.stopPropagation();showFps=!showFps;LS('szFps',showFps?'1':'0');syncSettings();});
$('gearBtn').onclick=e=>{e.stopPropagation();$('setPanel').classList.remove('hide');document.exitPointerLock&&document.exitPointerLock();};$('setClose').onclick=e=>{e.stopPropagation();$('setPanel').classList.add('hide');};
syncSettings();
// ---------- shader precompile (all zombie types, heli, chute, tracers) to avoid first-use hitches ----------
function prewarm(){const zs=Object.keys(ZT).map(t=>{const z=makeZombie(t);z.position.set(player.position.x,-60,player.position.z);scene.add(z);return z;});heli.visible=chute.visible=true;TP.forEach(t=>t.visible=true);
 try{renderer.compile(scene,cam);}catch(e){}zs.forEach(z=>scene.remove(z));heli.visible=chute.visible=false;TP.forEach(t=>t.visible=false);}
prewarm();
if(closeup){$('start').classList.add('hide');$('hud').classList.add('hide');}
if(DEBUG)window.__game={get mode(){return mode},get phase(){return iPhase},get score(){return score},set score(v){score=v;updHud();},get heads(){return headsDetached},get yaw(){return yaw},get alt(){return player.position.y},aimLog,level:LEVEL,scene,player,get zombies(){return zombies},PF,tier:TIER,qSet,detect:DETECT,merge:MERGE,get scale(){return rScale},get programs(){return renderer.info.programs.length},landed,get drop(){return[DT.x,DT.z]},get hp(){return hp},set hp(v){hp=v},get rjCD(){return (rjReady-performance.now())/1000},set rjCD(v){rjReady=performance.now()+v*1000},get lavaHurt(){return lavaHurt},get wave(){return wave},get pos(){return[player.position.x,player.position.y,player.position.z]},
 setPos(x,z){player.position.set(x,groundH(x,z),z);},lavaSpot(){for(let k=0;k<5000;k++){const x=rnd(-60,60),z=rnd(-60,60);if(lavaF(x,z)>.95&&islandD(x,z)<.8&&lavaF(x+1.5,z)>.9&&lavaF(x-1.5,z)>.9)return[x,z];}return null;},winLevel(){goLevel2();},rejump(){rejump();},
 setAlt(y){player.position.y=y;},overview(on){camOverride=on?[new THREE.Vector3(...on[0]),new THREE.Vector3(...on[1])]:null;},
 spawnNear(){spawn();const z=zombies[zombies.length-1];z.position.set(player.position.x-Math.sin(yaw)*5,0,player.position.z-Math.cos(yaw)*5);z.position.y=groundH(z.position.x,z.position.z);z.userData.hp=1;}};
if(Q.get('go')==='1'&&!closeup){begin();try{const c=JSON.parse(sessionStorage.getItem('szCarry')||'null');if(c){score=c.score|0;sessionStorage.removeItem('szCarry');updHud();}}catch(e){}}
loop();
