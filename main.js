import {getWeapon,shotInterval,weaponDamage} from './weapons.js?v19';
import * as THREE from 'three';import {restoreRanks,bonuses,upgradeChoices,buildSummary} from './progression.js?v19';import {createRewardPool,createEliteAccent,createSlamWarning} from './rewards.js?v19';import {createCombatAudio,createImpactPool} from './combat.js?v19';import {createEnemyNavigator} from './navigation.js?v19';import {getLookSensitivity,reducedMotion} from './preferences.js?v19';import {mk,mkc,LOD,mergeRigid,isCachedGeometry} from './lod.js?v19';import {makeSoldier} from './soldier.js?v19';import {makeHeli,makeChute} from './heli.js?v19';
THREE.Sprite.prototype.raycast=function(){};
import {createAcidThreats,createSpitterAccent} from './threats.js?v19';
import {createFieldUplink,UPLINK_RADIUS} from './field.js?v19';
import {createEncounter,createMomentum,rateOperation} from './encounters.js?v19';
import {createFrozenOrb} from './frozen-orb.js?v19';
import {createFlightCollision} from './flight-collision.js?v19';
import {createFirstPersonView} from './first-person.js?v19';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
const LEVEL=new URLSearchParams(location.search).get('level')==='2'?2:1;
const WM=LEVEL===2?await import('./world2.js?v19'):await import('./world.js?v19');const {buildWorld,groundH,islandD,shoreR,SUN_DIR,FOG_COLOR,iceF,lavaF,LIGHTS}=WM;
export const BUILD='v20 · phone ready';const $=id=>document.getElementById(id),Q=new URLSearchParams(location.search),DEBUG=Q.get('debug')==='1';
const MOBILE=matchMedia('(pointer:coarse)').matches||'ontouchstart' in window;if(MOBILE)document.body.classList.add('touch');
// ---------- quality tiers ----------
const QL=['auto','low','medium','high'];const LS=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);}catch(e){return null;}};
let weapon=getWeapon(LS('szWeapon')),burstRound=0;
let cameraMode=LS('szCamera')==='first'?'first':'third';
const qSet=QL.includes(Q.get('q'))?Q.get('q'):(QL.includes(LS('szQ'))?LS('szQ'):'auto');let DETECT=null;
function detectTier(){let gpu='';try{const c=document.createElement('canvas'),g=c.getContext('webgl');const e=g&&g.getExtension('WEBGL_debug_renderer_info');gpu=g?String(e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER)):'';const lc=g&&g.getExtension('WEBGL_lose_context');lc&&lc.loseContext();}catch(e){}
 const mem=navigator.deviceMemory||4,cores=navigator.hardwareConcurrency||4,px=Math.round(screen.width*screen.height*devicePixelRatio**2),G=gpu.toLowerCase();let sc=0;
 if(/swiftshader|llvmpipe|software|mali-[4t]|mali-g(31|51|52|57)|adreno \(tm\) [345]\d\d|adreno \(tm\) 6[01]\d|powervr|sgx|hd graphics [2-5]\d\d/.test(G))sc-=2;
 if(/apple gpu|apple m\d|adreno \(tm\) (6[4-9]\d|7\d\d)|mali-g7[1-9]|mali-g[67]\d\d|immortalis|nvidia|geforce|radeon|rtx/.test(G))sc+=1;
 if(mem<=3)sc-=1;if(cores<=4)sc-=1;if(MOBILE)sc-=1;if(MOBILE&&px>4e6)sc-=.5;if(!MOBILE&&cores>=8)sc+=1;
 DETECT={gpu,mem,cores,px,dpr:devicePixelRatio,score:sc};return sc<=-2?'low':sc<=0?'medium':'high';}
const detected=detectTier(),savedTier=LS('szAutoTier');const TIER=qSet==='auto'?(['low','medium','high'].includes(savedTier)?savedTier:detected):qSet;const LOWQ=TIER==='low',HIGHQ=TIER==='high',MEDQ=TIER==='medium';LOD.low=LOWQ;const LITE=MOBILE||!HIGHQ;
// Keep phone edges crisp without rendering the full 3x device resolution.
// Adaptive resolution can lower this budget if sustained frame times need it.
const minPR=LOWQ?.65:MEDQ?.75:.8;
function pixelLimit(){const tierLimit=HIGHQ?(MOBILE?1.5:2):MEDQ?(MOBILE?1.25:1):1;const budget=HIGHQ?1800000:MEDQ?1000000:650000;return Math.max(minPR,Math.min(devicePixelRatio,tierLimit,MOBILE?Math.sqrt(budget/(innerWidth*innerHeight)):Infinity));}
let maxPR=pixelLimit(),rScale=maxPR;
const renderer=new THREE.WebGLRenderer({antialias:HIGHQ,powerPreference:'high-performance'});renderer.setPixelRatio(rScale);renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=!LOWQ;if(MEDQ)renderer.shadowMap.autoUpdate=false;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=LIGHTS.exp;renderer.outputColorSpace=THREE.SRGBColorSpace;document.body.appendChild(renderer.domElement);
const graphicsContext=renderer.getContext();
const scene=new THREE.Scene();scene.fog=new THREE.Fog(FOG_COLOR,90,520);
const cam=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,.1,7000);cam.rotation.order='YXZ';
const hemiL=new THREE.HemisphereLight(...LIGHTS.hemi);scene.add(hemiL);if(LOWQ){hemiL.intensity*=2.3;scene.add(new THREE.AmbientLight(0xffffff,LEVEL===2?.25:.45));}const rim=new THREE.DirectionalLight(...LIGHTS.rim);rim.position.set(...LIGHTS.rimPos);scene.add(rim);
const sun=new THREE.DirectionalLight(...LIGHTS.sun);sun.castShadow=!LOWQ;const S=MEDQ?1024:MOBILE?1024:2048;sun.shadow.mapSize.set(S,S);
Object.assign(sun.shadow.camera,{left:-30,right:30,top:30,bottom:-30,near:1,far:200});sun.shadow.bias=-.0003;sun.shadow.normalBias=.03;sun.shadow.radius=4;sun.shadow.blurSamples=12;scene.add(sun,sun.target);
const W=buildWorld(scene,LITE,renderer,{low:LOWQ,lights:{sun,hemi:hemiL,rim}});
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
const flightCollision=createFlightCollision({solids,groundH}),flightFrom=new THREE.Vector3();let flightMovement=false;
const firstPerson=createFirstPersonView(cam,player,{low:LOWQ});scene.add(cam);
// blob shadow decals (Low tier replaces real-time shadows)
const blobG=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),blobM=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');const gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(0,0,0,.6)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);
 return new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});})();
function addBlob(parent,s){if(!LOWQ)return null;const b=new THREE.Mesh(blobG,blobM);b.scale.setScalar(s);b.position.y=.04;b.renderOrder=1;parent.add(b);return b;}
const pBlob=addBlob(scene,1.15);if(pBlob)pBlob.material=blobM.clone();
const shadowNormal=new THREE.Vector3(),shadowUp=new THREE.Vector3(0,1,0);
// Instance materials and merged geometry must be released between waves and runs.
// Cached primitives, blob decals and procedural textures remain shared.
function disposeModel(root){const geometries=new Set(),materials=new Set();root.traverse(o=>{if((o.isMesh||o.isPoints)&&o.geometry&&o.geometry!==blobG&&!isCachedGeometry(o.geometry))geometries.add(o.geometry);if(o.material)for(const m of(Array.isArray(o.material)?o.material:[o.material]))if(m!==blobM)materials.add(m);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());root.removeFromParent();}
const SM=p=>{if(LOWQ){delete p.roughness;delete p.metalness;delete p.bumpMap;delete p.bumpScale;return new THREE.MeshLambertMaterial(p);}return new THREE.MeshStandardMaterial(p);};
// ---------- audio ----------
let ac,masterGain,combatSound,muted=LS('szMuted')==='1';
function syncAudio(){if(masterGain)masterGain.gain.setTargetAtTime(muted||gamePaused||mode==='upgrade'?0:.65,ac.currentTime,.025);document.querySelectorAll('.muteBtn').forEach(b=>{b.textContent='SOUND '+(muted?'OFF':'ON');b.setAttribute('aria-pressed',String(!muted));});}
function ensureAudio(){try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;if(!ac){ac=new Audio();masterGain=ac.createGain();masterGain.connect(ac.destination);combatSound=createCombatAudio(ac,masterGain,()=>!muted&&!gamePaused&&mode!=='upgrade');}syncAudio();ac.resume()?.catch(()=>{});}catch(e){/* The game remains playable without audio. */}}
const snd=(f,d,type='square',v=.15,slide=.3)=>{if(!ac||muted||gamePaused||mode==='upgrade')return;const o=ac.createOscillator(),g=ac.createGain();o.type=type;o.frequency.setValueAtTime(f,ac.currentTime);o.frequency.exponentialRampToValueAtTime(f*slide,ac.currentTime+d);
 g.gain.setValueAtTime(v,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+d);o.connect(g).connect(masterGain);o.onended=()=>{o.disconnect();g.disconnect();};o.start();o.stop(ac.currentTime+d);};
let rotor=null,wind=null;
function rotorStart(){if(!ac||rotor)return;const o=ac.createOscillator(),f=ac.createBiquadFilter(),g=ac.createGain(),m=ac.createGain(),l=ac.createOscillator(),lg=ac.createGain();
 o.type='sawtooth';o.frequency.value=55;f.type='lowpass';f.frequency.value=320;l.frequency.value=13;lg.gain.value=.5;m.gain.value=.5;l.connect(lg).connect(m.gain);g.gain.value=0;
 o.connect(f).connect(m).connect(g).connect(masterGain);o.start();l.start();rotor={o,l,g};}
function windStart(){if(!ac||wind)return;const b=ac.createBuffer(1,ac.sampleRate*2,ac.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
 const s=ac.createBufferSource();s.buffer=b;s.loop=true;const f=ac.createBiquadFilter();f.type='bandpass';f.frequency.value=700;f.Q.value=.7;const g=ac.createGain();g.gain.value=0;s.connect(f).connect(g).connect(masterGain);s.start();wind={s,f,g};}
const setGain=(n,v)=>n&&n.g.gain.setTargetAtTime(v,ac.currentTime,.15);
// ---------- input ----------
let yaw=0,pitch=-.1,firing=false,running=false,mode='menu',introDone=false,gamePaused=false,pauseStarted=0;const keys={};
let jumpPointer=null,jumpButtonHeld=false,jetHeldTime=0,jetFuel=1,jetActive=false,jetLocked=false;
addEventListener('keydown',e=>{
 if(e.defaultPrevented||e.target.closest?.('input,select,textarea,[contenteditable=true]'))return;
 if(e.code==='Escape'||e.code==='KeyP'){if(!e.repeat&&(mode==='play'||mode==='intro')){e.preventDefault();gamePaused?resumeGame():pauseGame();}return;}
 if(e.code==='KeyM'&&!e.repeat){muted=!muted;LS('szMuted',muted?'1':'0');syncAudio();return;}
 if(gamePaused||(mode!=='play'&&mode!=='intro'))return;
 if(mode==='intro'&&(e.code==='Space'||e.code==='Enter')&&!e.target.closest?.('button,input,select,textarea')){e.preventDefault();if(!e.repeat)skipIntro();return;}
 if(e.code==='Space'&&e.target.closest?.('button'))return;
 keys[e.code]=true;
 if(e.code==='Space'){if(!e.repeat)jump();e.preventDefault();}
 if(e.code==='KeyF'){if(!e.repeat)castFrozenOrb();e.preventDefault();}
 if(e.code==='KeyV'){if(!e.repeat)setCameraView(cameraMode==='first'?'third':'first');e.preventDefault();}
 if(e.code.startsWith('Arrow'))e.preventDefault();
});addEventListener('keyup',e=>{keys[e.code]=false;if(e.code==='Space'){jetHeldTime=0;jetLocked=false;if(!jumpButtonHeld){jetActive=false;player.userData.setJetpack(false);document.body.classList.remove('jetpacking');}}});
let graphicsLost=false,startDisabledBeforeLoss=false,inactiveWindow=false;const cv=renderer.domElement;
export function canStartGame(){return !graphicsLost&&!graphicsContext.isContextLost();}
function markGraphicsLost(){if(graphicsLost)return;graphicsLost=true;startDisabledBeforeLoss=$('startBtn').disabled;$('startBtn').disabled=true;if(mode==='upgrade')setUpgradeButtons(true);pauseGame();}
cv.addEventListener('webglcontextlost',e=>{e.preventDefault();markGraphicsLost();});
cv.addEventListener('webglcontextrestored',()=>{graphicsLost=false;renderer.setRenderTarget(null);$('startBtn').disabled=startDisabledBeforeLoss&&document.body.dataset.ready!=='true';if(mode==='upgrade')setUpgradeButtons(false);onResize();});
function renderFrame(){
 // GL can be lost before its queued DOM event arrives, including mid-pass.
 // Handle only that recoverable condition; ordinary render errors still surface.
 if(graphicsLost||graphicsContext.isContextLost()){markGraphicsLost();return;}
 const autoClear=renderer.autoClear;
 try{composer?composer.render():renderer.render(scene,cam);}
 catch(error){if(!graphicsContext.isContextLost())throw error;markGraphicsLost();}
 finally{renderer.autoClear=autoClear;}
}
const lockPointer=()=>{if(MOBILE||document.pointerLockElement===cv)return;try{const r=cv.requestPointerLock();r&&r.catch&&r.catch(()=>{});}catch(e){}};
cv.addEventListener('mousedown',e=>{if(gamePaused||e.button!==0)return;if(mode==='intro'){lockPointer();return;}if(!running||MOBILE)return;lockPointer();firing=true;});
addEventListener('mouseup',()=>firing=false);
addEventListener('mousemove',e=>{if(!gamePaused&&document.pointerLockElement===cv&&Math.abs(e.movementX)<150&&Math.abs(e.movementY)<150)look(e.movementX,e.movementY,.0025*getLookSensitivity());});
const look=(dx,dy,k)=>{yaw-=dx*k;pitch=THREE.MathUtils.clamp(pitch-dy*k,mode==='intro'?-1.45:cameraMode==='first'?-1.35:-.7,mode==='intro'?.6:cameraMode==='first'?1.35:.55);};
const stick={id:null,ox:0,oy:0,x:0,y:0},lk={id:null,x:0,y:0};let fireId=null;const knob=$('stick').querySelector('i');
addEventListener('touchstart',e=>{if(e.target.closest?.('button,.ov'))return;if(gamePaused||(mode!=='intro'&&mode!=='play'))return;e.preventDefault();document.body.classList.add('touch');
 for(const t of e.changedTouches){const el=t.target.closest?.('.tb')||t.target;if(el.id==='jumpBtn'){jump();continue;}
  if(el.id==='fireBtn'){fireId=t.identifier;$('fireBtn').classList.add('active');if(lk.id===null)Object.assign(lk,{id:t.identifier,x:t.clientX,y:t.clientY});continue;}
  if(t.clientX<innerWidth/2&&stick.id===null){const r=$('stick').getBoundingClientRect();Object.assign(stick,{id:t.identifier,ox:r.left+r.width/2,oy:r.top+r.height/2});$('stick').classList.add('active');moveStick(t);}
  else if(lk.id===null)Object.assign(lk,{id:t.identifier,x:t.clientX,y:t.clientY});}},{passive:false});
function moveStick(t){const el=$('stick'),r=el.getBoundingClientRect(),scale=r.width/(el.offsetWidth||r.width||1),radius=Math.max(1,r.width*.4);let dx=t.clientX-stick.ox,dy=t.clientY-stick.oy;const d=Math.hypot(dx,dy);if(d>radius){dx*=radius/d;dy*=radius/d;}stick.x=dx/radius;stick.y=dy/radius;knob.style.transform=`translate(${dx/scale}px,${dy/scale}px)`;}
addEventListener('touchmove',e=>{if(e.target.closest?.('.ov')||gamePaused||(mode!=='intro'&&mode!=='play'))return;e.preventDefault();for(const t of e.changedTouches){if(t.identifier===stick.id)moveStick(t);if(t.identifier===lk.id){look(t.clientX-lk.x,t.clientY-lk.y,2.4*getLookSensitivity()/Math.min(innerWidth,innerHeight));lk.x=t.clientX;lk.y=t.clientY;}}},{passive:false});
const tend=e=>{for(const t of e.changedTouches){if(t.identifier===stick.id){stick.id=null;stick.x=stick.y=0;knob.style.transform='';$('stick').classList.remove('active');}if(t.identifier===lk.id)lk.id=null;if(t.identifier===fireId){fireId=null;$('fireBtn').classList.remove('active');}}};
addEventListener('touchend',tend);addEventListener('touchcancel',tend);
function releaseJump(){jumpPointer=null;jumpButtonHeld=false;jetHeldTime=0;jetActive=false;jetLocked=false;$('jumpBtn').classList.remove('active');player.userData.setJetpack(false);document.body.classList.remove('jetpacking');}
const jumpButton=$('jumpBtn');
jumpButton.addEventListener('pointerdown',e=>{if(!running||gamePaused||e.button!==0||jumpPointer!==null)return;e.preventDefault();jumpPointer=e.pointerId;jumpButtonHeld=true;jump();jumpButton.classList.add('active');jumpButton.setPointerCapture?.(e.pointerId);});
for(const event of ['pointerup','pointercancel','lostpointercapture'])jumpButton.addEventListener(event,e=>{if(e.pointerId===jumpPointer)releaseJump();});
jumpButton.addEventListener('keydown',e=>{if(e.code!=='Space'&&e.code!=='Enter')return;e.preventDefault();e.stopPropagation();if(!running||gamePaused||e.repeat)return;jumpButtonHeld=true;jump();jumpButton.classList.add('active');});
jumpButton.addEventListener('keyup',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();e.stopPropagation();releaseJump();}});
jumpButton.addEventListener('blur',releaseJump);
jumpButton.addEventListener('click',e=>{e.preventDefault();if(e.detail===0&&!jumpButtonHeld)jump();});
$('orbBtn')?.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();castFrozenOrb();});
$('orbBtn')?.addEventListener('click',e=>{e.stopPropagation();if(e.detail===0)castFrozenOrb();});
function clearInput(){Object.keys(keys).forEach(k=>delete keys[k]);releaseJump();firing=false;fireId=null;stick.id=lk.id=null;stick.x=stick.y=0;knob.style.transform='';$('stick').classList.remove('active');$('fireBtn').classList.remove('active');document.body.classList.remove('sprinting');curSpeed=0;jumpBuffer=coyoteTime=0;lockT=null;swing=null;wasFiring=false;aligned=false;burstRound=0;}
function pauseGame(settings=false){if(mode!=='play'&&mode!=='intro')return;if(!gamePaused){gamePaused=true;pauseStarted=performance.now();running=false;clearInput();document.body.classList.add('paused');syncAudio();document.exitPointerLock?.();}updRejump();$('pausePanel')?.classList.toggle('hide',settings);$('setPanel').classList.toggle('hide',!settings);(settings?$('setClose'):$('resumeBtn'))?.focus();}
function resumeGame(){if(!gamePaused||graphicsLost)return;rjReady+=performance.now()-pauseStarted;gamePaused=false;running=mode==='play';document.body.classList.remove('paused');$('pausePanel')?.classList.add('hide');$('setPanel').classList.add('hide');clearInput();syncAudio();ensureAudio();document.activeElement?.blur();lockPointer();}
addEventListener('blur',()=>{inactiveWindow=true;pauseGame();});addEventListener('focus',()=>inactiveWindow=false);document.addEventListener('visibilitychange',()=>{inactiveWindow=document.hidden;if(document.hidden)pauseGame();});
let hadPointerLock=false;document.addEventListener('pointerlockchange',()=>{const locked=document.pointerLockElement===cv;if(hadPointerLock&&!locked&&!gamePaused)pauseGame();hadPointerLock=locked;});
['gesturestart','dblclick','contextmenu'].forEach(ev=>addEventListener(ev,e=>e.preventDefault(),{passive:false}));
const view={width:innerWidth,height:innerHeight,portrait:false,shoulder:.8,boom:4,follow:4};
function syncCameraView(){
 document.body.classList.toggle('first-person',cameraMode==='first');textAt('cameraLabel',cameraMode==='first'?'1P':'3P');
 const button=$('cameraBtn');if(button){button.setAttribute('aria-label','Switch to '+(cameraMode==='first'?'third':'first')+'-person view (V)');button.title=button.getAttribute('aria-label');button.setAttribute('aria-pressed',String(cameraMode==='first'));}
 document.querySelectorAll('[data-camera]').forEach(button=>{const selected=button.dataset.camera===cameraMode;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
}
function setCameraView(value){cameraMode=value==='first'?'first':'third';LS('szCamera',cameraMode);if(cameraMode==='third')pitch=THREE.MathUtils.clamp(pitch,-.7,.55);view.follow=view.boom;syncCameraView();}
$('cameraBtn')?.addEventListener('click',()=>{setCameraView(cameraMode==='first'?'third':'first');document.activeElement?.blur();});
document.querySelectorAll('[data-camera]').forEach(button=>button.addEventListener('click',()=>setCameraView(button.dataset.camera)));
const onResize=()=>{const changed=view.width!==innerWidth||view.height!==innerHeight;if(changed)clearInput();view.width=innerWidth;view.height=innerHeight;view.portrait=innerHeight>innerWidth;document.body.classList.toggle('portrait',view.portrait);
 cam.aspect=innerWidth/innerHeight;cam.fov=MOBILE&&view.portrait?THREE.MathUtils.clamp(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(27))/cam.aspect)*180/Math.PI,85,100):view.portrait?85:MOBILE?72:70;
 view.shoulder=MOBILE?(view.portrait?.42:.65):.8;view.boom=MOBILE&&view.portrait?4.6:4;cam.updateProjectionMatrix();maxPR=pixelLimit();rScale=Math.min(rScale,maxPR);renderer.setPixelRatio(rScale);renderer.setSize(innerWidth,innerHeight);if(composer){composer.setPixelRatio(rScale);composer.setSize(innerWidth,innerHeight);}if(gamePaused||mode==='upgrade')renderFrame();};
addEventListener('resize',onResize);addEventListener('orientationchange',()=>setTimeout(onResize,100));window.visualViewport?.addEventListener('resize',onResize);onResize();syncCameraView();
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
const ZT={spitter:{skin:0x648b72,eye:0xc2ff8c,sc:1.08,hp:1.45,sp:.85,cloth:[0x244a48,0x294c43]},walker:{skin:0x9aae78,eye:0xc8ff40,sc:1,hp:1,sp:1,cloth:[0x4a3a5a,0x5a3a22,0x2a3f4f,0x4a2a2a]},runner:{skin:0x8f9aa8,eye:0xff3020,sc:.92,hp:.6,sp:1.75,cloth:[0x2f2f38,0x3a2a2a]},brute:{skin:0x6f7a4a,eye:0xffa020,sc:1.45,hp:3,sp:.62,cloth:[0x3a2a1a,0x2a2a1f]},fiery:{skin:0x4a2a22,eye:0xffb030,sc:1.08,hp:1.6,sp:1.35,cloth:[0x1a1210,0x2a1a14],fire:true}};
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
 if(type==='spitter'){createSpitterAccent(bod,g);head.scale.set(1.15,1.02,1.14);M(mkc(THREE.SphereGeometry,.075,8,6),eyeM,0,-.08,.205,head).scale.set(1.2,.7,.7);bod.rotation.x=.58;}
 addBlob(g,1.1);mergeRigid(g,[...legs,...arms,bod,head]);g.scale.setScalar(T.sc);g.userData={legs,arms,mats,head,type,hp:0,dead:0,ph:Math.random()*6,base:sk.color.clone(),base1:cl.color.clone()};return g;}
const ICE_SKIN=new THREE.Color(0x9fd8ff),ICE_CLOTH=new THREE.Color(0x4a6f9a);
let zombies=[],tracers=[],score=0,wave=0,hp=100,toSpawn=0,spawnT=0,fireT=0,vy=0,curSpeed=0,jumpBuffer=0,coyoteTime=0;
let waveBreak=-1,bestScore=Math.max(0,Number(LS('szBest'))||0),recoil=0,hitTime=0,bannerTime=0,damageTime=0;
const ZCAP=LOWQ?9:MOBILE?14:28;const impacts=createImpactPool(scene,LOWQ),navigateEnemy=createEnemyNavigator(W.circles,W.boxes);
let flashTime=0,waveTotal=0,runKills=0,runSeconds=0,runShots=0,runHits=0,runBestStart=bestScore;const meleeRay=new THREE.Raycaster(),meleeFrom=new THREE.Vector3(),meleeTo=new THREE.Vector3();
let ranks=restoreRanks(),loadout=bonuses(ranks),offeredUpgrades=[],upgradeStarted=0,lastRecovery=0,overdrive=0,overdriveMax=8,reserveArmor=0,eliteKills=0,elitePending=null,pickupNoticeTime=0,progressionHudKey='';
const rewards=createRewardPool(scene,{low:LOWQ}),slamWarning=createSlamWarning(scene,{groundH});
const SLAM_RADIUS=6;
const momentum=createMomentum();let currentEncounter=createEncounter(1,LEVEL),momentumHudKey='',campaignComplete=false,debriefOutcome='defeat';
function updateMomentumHud(){const s=momentum.state,key=[s.chain,Math.ceil(s.time*10)].join('|');if(key===momentumHudKey)return;momentumHudKey=key;$('momentumHud')?.classList.toggle('hide',s.chain<2);textAt('momentumMultiplier','×'+s.multiplier);textAt('momentumCount',s.chain+' CHAIN');if($('momentumFill'))$('momentumFill').style.width=(s.time/7*100)+'%';}

const acidThreats=createAcidThreats(scene,{groundH});let acidHintShown=false;
const orbRay=new THREE.Raycaster(),orbFrom=new THREE.Vector3(),orbDirection=new THREE.Vector3(),orbAim=new THREE.Vector3();
const frozenOrb=createFrozenOrb(scene,{low:LOWQ,groundH,
 blocked(from,to){orbDirection.subVectors(to,from);const distance=orbDirection.length();if(distance<.0001)return false;orbRay.set(from,orbDirection.normalize());orbRay.far=distance;const hit=orbRay.intersectObjects(solids,false)[0];return hit?hit.distance:false;},
 hitEnemy(z,point,damage,origin){if(z.userData.dead)return;damageEnemy(z,point,damage,origin,.08);hitTime=.16;$('hitmarker')?.classList.add('show');},
 onCast(){snd(720,.45,'sine',.12,.22);}
});
function castFrozenOrb(){
 if(!running||gamePaused||mode!=='play'||!frozenOrb.state.ready)return false;
 orbFrom.copy(player.position).y+=1.35;
 // Aim through the crosshair, retaining nearby cover between chest and target.
 orbRay.setFromCamera(new THREE.Vector2(0,0),cam);orbRay.far=65;
 const target=orbRay.intersectObjects([...zombies.filter(z=>!z.userData.dead),...solids,W.ground],true)[0];
 if(target)orbAim.copy(target.point);else orbAim.copy(orbRay.ray.origin).addScaledVector(orbRay.ray.direction,35);
 orbDirection.copy(orbAim).sub(orbFrom).normalize();
 const cast=frozenOrb.cast(orbFrom,orbDirection);updateAbilityHud();return cast;
}
function updateAbilityHud(){
 const fuel=Math.ceil(jetFuel*100),state=frozenOrb.state,seconds=Math.ceil(state.cooldown),button=$('orbBtn'),meter=$('jetpackHud');
 textAt('jetpackValue',fuel+'%');if($('jetpackFill'))$('jetpackFill').style.width=fuel+'%';
 if(meter){meter.setAttribute('aria-valuenow',String(fuel));meter.classList.toggle('active',jetActive);meter.classList.toggle('empty',jetFuel<.01);}
 if(button){button.disabled=!running||gamePaused||!state.ready;button.classList.toggle('cd',!state.ready);button.classList.toggle('active',state.active);button.setAttribute('aria-label',state.ready?'Cast Frozen Orb (F)':'Frozen Orb recharging: '+seconds+' seconds');}
 textAt('orbCooldown',state.ready?'READY':seconds+'s');
}
function updateAcidThreats(dt){const damage=acidThreats.update(dt,player.position,!reducedMotion());if(damage){hurt(damage);if(running)pickupNotice('ACID POOL · MOVE OR JUMP CLEAR');}}
const fieldUplink=createFieldUplink(scene,groundH);let runUplinks=0,fieldHudClock=0;
function startFieldObjective(){
 const origin=player.position;let point=null;
 // Search the walkable interior, including the whole capture ring, without
 // adding collision geometry or depending on a particular random island seed.
 for(let i=0;i<80;i++){
  const angle=yaw+wave*1.7+i*2.39996,radius=12+i%6*2,x=origin.x+Math.sin(angle)*radius,z=origin.z+Math.cos(angle)*radius;
  if(!onLand(x,z,1)||islandD(x,z)>.78)continue;
  const h=groundH(x,z);let safe=h>.65;
  for(let j=0;j<8&&safe;j++){const a=j*Math.PI/4,px=x+Math.sin(a)*UPLINK_RADIUS,pz=z+Math.cos(a)*UPLINK_RADIUS;safe=islandD(px,pz)<.90&&lavaF(px,pz)<.05&&Math.abs(groundH(px,pz)-h)<2.2;}
  if(safe&&lavaF(x,z)<.02){point=new THREE.Vector3(x,h,z);break;}
 }
 if(point)fieldUplink.place(point);else fieldUplink.reset();fieldHudClock=0;updateFieldHud();
}
function updateFieldHud(){
 const state=fieldUplink.state,visible=state.active&&mode==='play'&&(!state.captured||state.doneTime<4);$('fieldObjective')?.classList.toggle('hide',!visible);if(!visible)return;
 const dx=fieldUplink.position.x-player.position.x,dz=fieldUplink.position.z-player.position.z,distance=Math.hypot(dx,dz);
 textAt('fieldTitle',state.captured?'UPLINK SECURED':state.contested?'UPLINK CONTESTED':'FIELD UPLINK');textAt('fieldDistance',state.inside?'IN RANGE':Math.ceil(distance)+'m');
 textAt('fieldStatus',state.captured?'+20 ARMOR · OVERDRIVE':state.contested?'CLEAR NEARBY HOSTILES':state.inside?'HOLD POSITION · '+Math.ceil(5-state.progress)+'s':'REACH THE BEACON · OPTIONAL');
 if($('fieldProgressFill'))$('fieldProgressFill').style.width=(state.progress/5*100)+'%';
 if($('fieldDirection'))$('fieldDirection').style.transform='rotate('+Math.round((Math.atan2(-dx,-dz)-yaw)*-180/Math.PI)+'deg)';
 if($('fieldObjective')){$('fieldObjective').dataset.state=state.captured?'secured':state.contested?'contested':state.inside?'capturing':'searching';$('fieldObjective').setAttribute('aria-label','Field uplink, '+Math.round(state.progress/5*100)+' percent captured');}
}
function updateFieldObjective(dt){
 const position=fieldUplink.position,contested=zombies.some(z=>!z.userData.dead&&Math.hypot(z.position.x-position.x,z.position.z-position.z)<UPLINK_RADIUS&&Math.abs(z.position.y-position.y)<2.5);
 if(fieldUplink.update(dt,player.position,contested)){runUplinks++;score+=125;reserveArmor=Math.min(60,reserveArmor+20);overdrive=Math.max(overdrive,10);overdriveMax=Math.max(overdriveMax,10);rememberScore();pickupNotice('UPLINK SECURED · +125 SCORE · +20 ARMOR');snd(440,.35,'sine',.14,2);announce('UPLINK SECURED · OVERDRIVE ONLINE',2.5);updHud();}
 fieldHudClock-=dt;if(fieldHudClock<=0){fieldHudClock=.1;updateFieldHud();}
}
function disposeZombie(z){z.userData.eliteAccent?.dispose();z.userData.eliteAccent=null;if(z.userData.slamWind>0)slamWarning.hide();disposeModel(z);}
function setUpgradeButtons(disabled){document.querySelectorAll('#upgradeChoices button').forEach(button=>button.disabled=disabled);}
function updateProgressionHud(){
 const elite=zombies.find(z=>z.userData.elite&&!z.userData.dead),key=[Math.ceil(reserveArmor),Math.ceil(overdrive*10),overdriveMax,elite?.id||0,elite?.userData.hp||0].join('|');
 if(key===progressionHudKey)return;progressionHudKey=key;
 textAt('reserveArmorValue',Math.ceil(reserveArmor));$('reserveArmorStatus')?.classList.toggle('hide',reserveArmor<=0);
 textAt('overdriveTime',Math.ceil(overdrive)+'s');$('overdriveHud')?.classList.toggle('hide',overdrive<=0);if($('overdriveFill'))$('overdriveFill').style.width=Math.min(100,overdrive/overdriveMax*100)+'%';document.body.classList.toggle('overdrive',overdrive>0);
 $('eliteHud')?.classList.toggle('hide',!elite);if(elite){const u=elite.userData;textAt('eliteName',u.eliteName);textAt('eliteHpText',Math.max(0,Math.ceil(u.hp))+' / '+u.maxHp);if($('eliteHpFill'))$('eliteHpFill').style.width=Math.max(0,u.hp/u.maxHp*100)+'%';$('eliteHpBar')?.setAttribute('aria-valuemax',String(u.maxHp));$('eliteHpBar')?.setAttribute('aria-valuenow',String(Math.max(0,Math.ceil(u.hp))));}
}
function pickupNotice(message){textAt('pickupNotice',message);$('pickupNotice')?.classList.add('show');pickupNoticeTime=2.2;}
function dropReward(type,position){
 const point=position.clone();let found=false;
 for(let radius=0;radius<=2.4&&!found;radius+=.8)for(let i=0;i<(radius?8:1);i++){const angle=i*Math.PI/4,x=position.x+Math.cos(angle)*radius,z=position.z+Math.sin(angle)*radius;if(onLand(x,z,.3)&&lavaF(x,z)<.2){point.set(x,groundH(x,z),z);found=true;break;}}
 if(!found)return null;
 if(rewards.active.length>=rewards.capacity)rewards.remove(rewards.active[0].id);
 const entry=rewards.spawn(type,point);if(entry)entry.age=0;return entry;
}
function updateRewards(dt){
 if(waveBreak<0)overdrive=Math.max(0,overdrive-dt);pickupNoticeTime=Math.max(0,pickupNoticeTime-dt);if(!pickupNoticeTime)$('pickupNotice')?.classList.remove('show');
 for(let i=rewards.active.length-1;i>=0;i--){const entry=rewards.active[i];entry.age=(entry.age||0)+dt;if(entry.age>45){rewards.remove(entry.id);continue;}
  if(Math.hypot(entry.position.x-player.position.x,entry.position.z-player.position.z)>loadout.pickupRadius||Math.abs(entry.position.y-player.position.y)>2)continue;
  if(entry.type==='medkit'){if(hp>=100)continue;const healed=Math.min(loadout.medkit,100-hp);hp+=healed;pickupNotice('MEDKIT · +'+Math.ceil(healed)+' HP');snd(600,.2,'sine',.12,1.7);}
  else{if(overdrive<=8)overdriveMax=8;overdrive=Math.max(overdrive,8);pickupNotice('OVERDRIVE · 8 SECONDS');snd(360,.3,'triangle',.12,2.2);}
  rewards.remove(entry.id);updHud();
 }
 rewards.update(dt,gT,!reducedMotion());updateProgressionHud();
}
function showUpgrades(){
 if(mode!=='play')return;running=false;mode='upgrade';acidThreats.clear();frozenOrb.clear();updateFieldHud();upgradeStarted=performance.now();clearInput();offeredUpgrades=upgradeChoices(ranks);flashTime=0;player.userData.flash.visible=false;player.userData.flashLight.intensity=0;slamWarning.hide();
 textAt('upgradeWave','WAVE '+String(wave).padStart(2,'0')+' SECURED');textAt('upgradeRecovery',(lastRecovery>0?'+'+Math.ceil(lastRecovery)+' HEALTH':'FULL HEALTH')+' · AREA SECURED');textAt('upgradeBuild',buildSummary(ranks));
 document.querySelectorAll('#upgradeChoices button').forEach((button,index)=>{const choice=offeredUpgrades[index];button.dataset.choice=String(index);button.dataset.perk=choice.id;for(const [key,value] of Object.entries({icon:choice.icon,category:choice.category,title:choice.title,description:choice.text,rank:choice.rank?(choice.rank===1?'NEW · I':['','I','II'][choice.rank-1]+' → '+['','I','II','III'][choice.rank])+' / III':'ONE-TIME BOOST'})){const el=button.querySelector('[data-upgrade-'+key+']');if(el)el.textContent=value;}button.disabled=false;});
 document.body.classList.add('upgrading');$('upgradePanel')?.classList.remove('hide');$('waveBanner')?.classList.remove('show');$('lock').style.display='none';syncAudio();document.exitPointerLock?.();document.querySelector('#upgradeChoices button')?.focus();
}
function chooseUpgrade(index){
 if(mode!=='upgrade'||graphicsLost||!Number.isInteger(index)||!offeredUpgrades[index])return;
 const choice=offeredUpgrades[index];setUpgradeButtons(true);if(choice.id in ranks){if(ranks[choice.id]>=3)return;ranks[choice.id]++;loadout=bonuses(ranks);}else if(choice.id==='shield')reserveArmor=Math.min(60,reserveArmor+30);else if(choice.id==='overdrive'){overdrive=Math.max(overdrive,12);overdriveMax=12;}else if(choice.id==='bounty'){score+=150;rememberScore();}
 offeredUpgrades=[];rjReady+=performance.now()-upgradeStarted;mode='play';running=true;document.body.classList.remove('upgrading');$('upgradePanel')?.classList.add('hide');clearInput();document.activeElement?.blur();syncAudio();ensureAudio();
 if(LEVEL===1&&wave>=5)goLevel2();else if(LEVEL===2&&wave===5&&!campaignComplete)winOperation();else{nextWave();if(inactiveWindow||document.hidden)pauseGame();else lockPointer();}updHud();
}
function updateSlam(z,dt,distance){
 const u=z.userData;if(u.elite!=='commander')return false;u.slamCooldown=Math.max(0,(u.slamCooldown||0)-dt);
 if(u.slamFlash>0){u.slamFlash=Math.max(0,u.slamFlash-dt);slamWarning.show(u.slamCenter,SLAM_RADIUS,1);if(!u.slamFlash)slamWarning.hide();}
 if(u.slamWind>0){u.slamWind=Math.max(0,u.slamWind-dt);slamWarning.show(u.slamCenter,SLAM_RADIUS,1-u.slamWind);u.arms.forEach(arm=>arm.rotation.x=-2.6);u.legs.forEach(leg=>leg.rotation.x=0);
  if(!u.slamWind){u.slamCooldown=6;u.slamFlash=.18;u.attackCooldown=1;u.strike=.18;combatSound?.('swipe',1);snd(65,.3,'triangle',.2,.35);const within=Math.hypot(player.position.x-u.slamCenter.x,player.position.z-u.slamCenter.z)<SLAM_RADIUS;if(within&&player.position.y-groundH(player.position.x,player.position.z)<.65&&meleeClear(z)){hurt(32);if(running)pickupNotice('GROUND SLAM · MOVE OUT OF THE RING');}}
  return true;
 }
 if(distance<5.8&&!u.slamCooldown&&!u.attackWind&&!u.strike){u.slamWind=1;u.slamCenter=z.position.clone();u.attackWind=0;slamWarning.show(u.slamCenter,SLAM_RADIUS,0);announce('GROUND SLAM · LEAVE THE RING',1);return true;}
 return false;
}
const spitRay=new THREE.Raycaster(),spitOrigin=new THREE.Vector3(),spitDirection=new THREE.Vector3(),spitGoal=new THREE.Vector3();
function updateSpitter(z,dt,distance){
 const u=z.userData;if(u.type!=='spitter')return false;
 u.spitCooldown=Math.max(0,(u.spitCooldown||0)-dt);u.spitPose=Math.max(0,(u.spitPose||0)-dt);
 if(distance<4)return false;
 // Ranged enemies hold a readable middle distance. Closing right in forces
 // them into ordinary melee, so the scattergun can punish them aggressively.
 let moving=false;
 if(!u.spitPose&&(distance>13||distance<8)){
  if(distance>13)spitGoal.copy(player.position);
  else{spitGoal.copy(z.position).sub(player.position).setY(0).normalize().multiplyScalar(8).add(z.position);if(!onLand(spitGoal.x,spitGoal.z,.4))spitGoal.copy(z.position);}
  const nav=navigateEnemy(z.position,spitGoal,u,dt),speed=u.speed*dt;
  z.position.x+=nav.navX*speed;z.position.z+=nav.navZ*speed;collide(z.position,.35);moving=true;
 }
 z.position.y=groundH(z.position.x,z.position.z);
 if(!u.spitCooldown&&distance<21&&distance>5&&waveBreak<0){
  u.spitCooldown=.35;z.userData.head.getWorldPosition(spitOrigin);spitGoal.copy(player.position);spitGoal.y=groundH(spitGoal.x,spitGoal.z)+1;
  spitDirection.copy(spitGoal).sub(spitOrigin);spitRay.far=spitDirection.length();spitRay.set(spitOrigin,spitDirection.normalize());
  if(acidThreats.available&&!spitRay.intersectObjects(solids,false).length&&!spitRay.intersectObject(W.ground,false).length&&lavaF(player.position.x,player.position.z)<.5){
   if(acidThreats.launch(player.position,spitOrigin,z)){if(!acidHintShown){acidHintShown=true;announce('ACID INBOUND · MOVE OUT OF THE RING',2);}u.spitCooldown=5.8+Math.random()*.8;u.spitPose=.5;snd(440,.28,'triangle',.055,.6);}
  }
 }
 u.legs[0].rotation.x=moving?Math.sin(u.ph)*.35:0;u.legs[1].rotation.x=moving?-Math.sin(u.ph)*.35:0;
 u.arms[0].rotation.x=u.spitPose>0?-1.9:-.85+Math.sin(u.ph)*.12;u.arms[1].rotation.x=u.spitPose>0?-1.9:-.85-Math.sin(u.ph)*.12;z.rotation.z=Math.sin(u.ph*.5)*.045;
 return true;
}
function meleeClear(z){meleeFrom.copy(z.position).y+=1.1;meleeTo.copy(player.position).y+=1.1;meleeTo.sub(meleeFrom);meleeRay.set(meleeFrom,meleeTo.normalize());meleeRay.far=z.position.distanceTo(player.position);return !meleeRay.intersectObjects(solids,false).length;}
function runSummary(){const seconds=Math.floor(runSeconds),chain=momentum.state,rating=rateOperation({kills:runKills,elites:eliteKills,uplinks:runUplinks,shots:runShots,hits:runHits,chain:chain.best,completed:campaignComplete});textAt('finalScore',score.toLocaleString());textAt('finalKills',runKills);textAt('finalWave',String(wave).padStart(2,'0'));textAt('finalTime',String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0'));textAt('finalAccuracy',runShots?Math.round(runHits/runShots*100)+'%':'—');textAt('finalRecord',score>runBestStart?'NEW PERSONAL BEST':'PERSONAL BEST '+bestScore.toLocaleString());textAt('final',debriefOutcome==='victory'?'Both islands secured. Keep your build and push into endless waves, or begin a fresh operation.':'Keep your chain alive, capture uplinks, and move before the acid lands.');textAt('finalBuild',buildSummary(ranks));textAt('finalElites',eliteKills);textAt('finalUplinks',runUplinks);textAt('finalChain',chain.best);textAt('finalMultiplier','×'+chain.bestMultiplier);textAt('finalRank',rating.grade);textAt('finalRankLabel',rating.label);const medal=document.querySelector('.mission-rank');if(medal)medal.dataset.rank=rating.grade;}
function showOutcome(won){debriefOutcome=won?'victory':'defeat';document.body.classList.toggle('victory',won);textAt('debriefTitle',won?'Operation complete.':'Good fight, soldier.');textAt('debriefEyebrow',won?'BOTH ISLANDS SECURED':'OPERATION DEBRIEF');$('endlessBtn')?.classList.toggle('hide',!won);}
function winOperation(){
 if(campaignComplete||mode==='over')return;campaignComplete=true;running=false;mode='over';clearInput();acidThreats.clear();frozenOrb.clear();slamWarning.hide();rememberScore();heliOn=false;heli.visible=false;setGain(rotor,0);setGain(wind,0);document.body.classList.remove('playing');document.exitPointerLock?.();$('waveBanner')?.classList.remove('show');showOutcome(true);runSummary();$('over').classList.remove('hide');$('endlessBtn')?.focus();snd(440,.7,'sine',.18,2);
}
function continueEndless(){
 if(mode!=='over'||debriefOutcome!=='victory'||!campaignComplete||graphicsLost)return;
 mode='play';running=true;showOutcome(false);$('over').classList.add('hide');document.body.classList.add('playing');clearInput();nextWave();syncAudio();ensureAudio();if(inactiveWindow||document.hidden)pauseGame();else lockPointer();
}
function textAt(id,value){const el=$(id),s=String(value);if(el&&el.textContent!==s)el.textContent=s;}
function announce(message,seconds=2.8){textAt('waveBanner',message);$('waveBanner')?.classList.add('show');bannerTime=seconds;}
function rememberScore(){if(score>bestScore){bestScore=score;LS('szBest',String(bestScore));}}
function hurt(amount){if(!running)return;if(amount>0){momentum.clear();updateMomentumHud();}amount*=loadout.armor;const absorbed=Math.min(reserveArmor,amount);reserveArmor-=absorbed;amount-=absorbed;hp=Math.max(0,hp-amount);damageTime=.3;$('vig').classList.add('hurt');updHud();if(hp<=0)die();}
function onLand(x,z,clear=.6){if(islandD(x,z)>.88)return false;for(const c of W.circles)if(Math.hypot(c.x-x,c.z-z)<c.r+clear)return false;for(const b of W.boxes)if(Math.abs(b.x-x)<b.hx+clear&&Math.abs(b.z-z)<b.hz+clear)return false;return true;}
function spawn(elite=null,forcedType=null){const r0=Math.random(),type=elite?'brute':forcedType&&ZT[forcedType]?forcedType:LEVEL===2?(r0<.22?'fiery':r0<.4?'brute':r0<.7?'runner':'walker'):(r0<.13?'brute':r0<.38?'runner':'walker');const z=makeZombie(type);let x=0,zz=0;for(let k=0;k<40;k++){const a=rnd(0,6.28),r=elite?rnd(10,14):rnd(18,36);x=player.position.x+Math.cos(a)*r;zz=player.position.z+Math.sin(a)*r;if(onLand(x,zz)&&lavaF(x,zz)<.05)break;
  if(k===39){const b=rnd(0,6.28),R=shoreR(b)*rnd(.3,.8);x=Math.cos(b)*R;zz=Math.sin(b)*R;}}
 z.position.set(x,groundH(x,zz),zz);const ZTt=ZT[type];z.userData.hp=Math.max(1,Math.round((2+Math.floor(wave/2))*ZTt.hp*(LEVEL===2?1.6:1)));z.userData.speed=(1.4+wave*.15+Math.random()*.6)*ZTt.sp*(LEVEL===2?1.18:1);if(type==='spitter')z.userData.spitCooldown=1.6+Math.random()*1.6;if(elite){const u=z.userData;u.elite=elite;u.eliteName=elite==='commander'?(LEVEL===2?'ASH TITAN':'ISLAND WARDEN'):'HOLLOW GUARD';u.hp=Math.round(u.hp*(elite==='commander'?14:6));u.speed=Math.max(elite==='commander'?2.8:2.5,u.speed*(elite==='commander'?1.9:1.7));u.maxHp=u.hp;u.slamCooldown=.8;z.scale.multiplyScalar(elite==='commander'?1.24:1.12);u.eliteAccent=createEliteAccent(z,elite==='commander',{low:LOWQ});announce(u.eliteName+' · '+(elite==='commander'?'COMMANDER':'ELITE')+' INBOUND',3.5);}scene.add(z);zombies.push(z);updateProgressionHud();return z;}
function die(){if(mode==='over')return;acidThreats.clear();frozenOrb.clear();showOutcome(false);slamWarning.hide();running=false;mode='over';clearInput();rememberScore();heliOn=false;heli.visible=false;setGain(rotor,0);setGain(wind,0);document.body.classList.remove('playing');document.exitPointerLock?.();$('waveBanner')?.classList.remove('show');runSummary();$('over').classList.remove('hide');$('restartBtn').focus();snd(300,.7,'triangle',.16,.2);}
function updHud(){updateProgressionHud();const remaining=toSpawn+zombies.filter(z=>!z.userData.dead).length,cleared=Math.max(0,waveTotal-remaining);textAt('waveProgressLabel',cleared+' / '+waveTotal);if($('waveProgressFill'))$('waveProgressFill').style.width=(waveTotal?cleared/waveTotal*100:0)+'%';if($('waveProgress')){$('waveProgress').setAttribute('aria-valuemax',String(waveTotal||1));$('waveProgress').setAttribute('aria-valuenow',String(cleared));$('waveProgress').classList.toggle('complete',waveTotal>0&&remaining===0);}textAt('score',score.toLocaleString());textAt('wave',String(Math.max(1,wave)).padStart(2,'0'));textAt('hpValue',Math.ceil(Math.max(0,hp)));textAt('bestScore',bestScore.toLocaleString());textAt('enemies',toSpawn+zombies.filter(z=>!z.userData.dead).length);$('hp').style.width=Math.max(0,hp)+'%';$('hpbar').setAttribute('aria-valuenow',String(Math.ceil(hp)));document.body.classList.toggle('low-health',hp<=30);}
function collide(p,r){for(const c of W.circles){const dx=p.x-c.x,dz=p.z-c.z,d=Math.hypot(dx,dz),m=c.r+r;if(d<m&&d>1e-4){p.x=c.x+dx/d*m;p.z=c.z+dz/d*m;}}
 for(const b of W.boxes){const cx=THREE.MathUtils.clamp(p.x,b.x-b.hx,b.x+b.hx),cz=THREE.MathUtils.clamp(p.z,b.z-b.hz,b.z+b.hz);const dx=p.x-cx,dz=p.z-cz,d=Math.hypot(dx,dz);if(d<r){if(d>1e-4){p.x=cx+dx/d*r;p.z=cz+dz/d*r;}else p.x+=r;}}
 constrainShore(p);}
function constrainShore(p){const R=Math.hypot(p.x,p.z),lim=shoreR(Math.atan2(p.z,p.x))*.97;if(R>lim){p.x*=lim/R;p.z*=lim/R;}}
function jump(){if(running&&mode==='play')jumpBuffer=.14;}
function updateJump(dt){
 // Small downhill terrain gaps should not eat a jump tap. A short buffer also
 // accepts taps just before landing, without allowing a second jump in midair.
 const ground=flightMovement?flightCollision.surfaceAt(player.position.x,player.position.z,player.position.y):groundH(player.position.x,player.position.z);
 const grounded=vy<=0&&player.position.y<=ground+.025;
 coyoteTime=grounded?.1:Math.max(0,coyoteTime-dt);
 if(jumpBuffer>0&&coyoteTime>0){vy=6.5;jumpBuffer=coyoteTime=0;snd(300,.15,'sine',.1,2);}
 else jumpBuffer=Math.max(0,jumpBuffer-dt);
 const held=!!keys.Space||jumpButtonHeld;
 jetHeldTime=held?jetHeldTime+dt:0;if(!held)jetLocked=false;
 const wasActive=jetActive;jetActive=held&&jetHeldTime>=.18&&jetFuel>0&&!jetLocked;
 if(jetActive){jetFuel=Math.max(0,jetFuel-dt/6);if(!wasActive)snd(130,.25,'triangle',.09,2);if(!jetFuel)jetLocked=true;}
 else if(grounded)jetFuel=Math.min(1,jetFuel+dt*.3);
 player.userData.setJetpack(jetActive);document.body.classList.toggle('jetpacking',jetActive);
}
// ---------- shooting / auto-aim ----------
const rc=new THREE.Raycaster(),center=new THREE.Vector2(0,0),tmpV=new THREE.Vector3(),losRc=new THREE.Raycaster(),muzzleRc=new THREE.Raycaster();
const shotForward=new THREE.Vector3(),shotRight=new THREE.Vector3(),shotUp=new THREE.Vector3(),shotDirection=new THREE.Vector3(),shotOrigin=new THREE.Vector3(),shotPush=new THREE.Vector3(),shotWorldUp=new THREE.Vector3(0,1,0);
function syncWeapon(){
 document.body.dataset.weapon=weapon.id;textAt('weaponName',weapon.name);textAt('weaponHint',weapon.hint);
 document.querySelectorAll('button[data-weapon]').forEach(button=>{const selected=button.dataset.weapon===weapon.id;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
 player.getObjectByName('carbine')?.scale.set(...weapon.modelScale);player.userData.setWeapon(weapon.id);firstPerson.setWeapon(weapon.id);player.userData.flash.scale.setScalar(weapon.id==='scatter'?1.4:weapon.id==='burst'?.85:1);
 player.userData.flash.material.color.setHex(weapon.id==='burst'?0xa6ddff:0xffbc52);
}
document.querySelectorAll('button[data-weapon]').forEach(button=>button.addEventListener('click',()=>{if(mode!=='menu')return;weapon=getWeapon(button.dataset.weapon);LS('szWeapon',weapon.id);burstRound=0;syncWeapon();}));
syncWeapon();
// ---- auto-aim state machine ----
// firstLock: true only between FIRE press and the first time the aim settles on a target.
// Every other target change (kill, LOS loss) is a "retarget": 0.25s pause, then an ease-in-out swing whose
// duration is chosen so the PEAK turn rate stays <= ~110 deg/s, minimum 0.9s. No shots at a target until aligned.
let lockT=null,losT=0,firstLock=false,wasFiring=false,pause=0,swing=null,aligned=false;
const RET_PAUSE=.25,RET_MIN=.9,PEAK=110*Math.PI/180,FIRST_DUR=.3,ALIGN=2.5*Math.PI/180;
const angD=a=>Math.atan2(Math.sin(a),Math.cos(a));
function los(z){z.userData.head.getWorldPosition(tmpV);const d=tmpV.clone().sub(cam.position);const L=d.length();losRc.set(cam.position,d.normalize());losRc.far=L-.3;return !losRc.intersectObjects(solids,false).length;}
function aimPoint(z,out){z.userData.head.getWorldPosition(out);if(weapon.id==='scatter')out.y-=.48*z.scale.y;return out;}
function aimAngles(z){aimPoint(z,tmpV);const d=tmpV.clone().sub(cam.position).normalize();return[Math.atan2(-d.x,-d.z),THREE.MathUtils.clamp(Math.asin(d.y),cameraMode==='first'?-1.35:-.7,cameraMode==='first'?1.35:.55)];}
function dropLock(){lockT=null;swing=null;aligned=false;burstRound=0;if(!firstLock)pause=RET_PAUSE;}
function autoAim(dt){const want=firing||fireId!==null;
 if(!want){lockT=null;swing=null;aligned=false;pause=0;wasFiring=false;burstRound=0;return;}
 if(!wasFiring){wasFiring=true;firstLock=true;burstRound=0;}
 if(lockT&&(lockT.userData.dead||!zombies.includes(lockT))){dropLock();aimEv('kill');}
 if(lockT&&(losT-=dt)<=0){losT=.25;if(lockT.position.distanceTo(player.position)>weapon.assistRange||!los(lockT)){dropLock();aimEv('los');}}
 if(pause>0){pause-=dt;return;}
 if(!lockT){let best=null,bs=1e9;const cands=[];const f=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
  for(const z of zombies){if(z.userData.dead)continue;const d=_zd.copy(z.position).sub(player.position);d.y=0;const dist=d.length();if(dist>weapon.assistRange)continue;
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
function updLock(){const el=$('lock');if(!lockT||lockT.userData.dead){el.style.display='none';return;}el.style.opacity=aligned?1:.45;aimPoint(lockT,tmpV);tmpV.project(cam);
 if(tmpV.z>1){el.style.display='none';return;}el.style.display='block';el.style.left=((tmpV.x+1)/2*innerWidth)+'px';el.style.top=((1-tmpV.y)/2*innerHeight)+'px';}
function damageEnemy(z,end,damage,origin=shotOrigin,knockback=.25/weapon.pellets.length){
 z.userData.hp-=damage;z.userData.hit=.1;const p=shotPush.copy(end).sub(origin).setY(0).normalize();z.position.addScaledVector(p,z.userData.elite?.025:knockback);
 if(z.userData.hp<=0){z.userData.dead=.001;runKills++;z.userData.eliteAccent?.dispose();z.userData.eliteAccent=null;if(z.userData.elite){eliteKills++;slamWarning.hide();dropReward('medkit',z.position.clone().add(new THREE.Vector3(-.8,0,0)));dropReward('overdrive',z.position.clone().add(new THREE.Vector3(.8,0,0)));announce(z.userData.eliteName+' DEFEATED',2.5);}else if(runKills%4===0)dropReward(Math.floor(runKills/4)%2?'medkit':'overdrive',z.position);decap(z,p);combatSound?.('kill',.85);score+=(z.userData.elite==='commander'?300:z.userData.elite?120:z.userData.type==='brute'?30:z.userData.type==='fiery'||z.userData.type==='spitter'?20:10)*momentum.kill();updateMomentumHud();rememberScore();snd(180,.12,'triangle',.09,.5);updHud();return true;}updateProgressionHud();return false;
}
function shoot(){
 const u=player.userData;runShots++;recoil=reducedMotion()?0:weapon.recoil;flashTime=weapon.id==='scatter'?.07:.045;u.flash.visible=true;u.flashLight.intensity=weapon.id==='scatter'?11:8;u.flash.rotation.z=Math.random()*3;combatSound?.(weapon.sound,.8);
 if(lockT&&aligned){aimPoint(lockT,tmpV);shotForward.copy(tmpV).sub(cam.position).normalize();}else{rc.setFromCamera(center,cam);shotForward.copy(rc.ray.direction);}
 shotRight.crossVectors(shotForward,shotWorldUp).normalize();shotUp.crossVectors(shotRight,shotForward).normalize();(cameraMode==='first'?firstPerson.muzzle:u.muzzle).getWorldPosition(shotOrigin);
 const candidates=[...zombies.filter(z=>!z.userData.dead),...solids,W.ground],cover=[...solids,W.ground];let hitEnemy=false,killed=false;
 for(const [sx,sy] of weapon.pellets){
  shotDirection.copy(shotForward).addScaledVector(shotRight,sx).addScaledVector(shotUp,sy).normalize();rc.set(cam.position,shotDirection);rc.far=weapon.range;
  let hit=rc.intersectObjects(candidates,true)[0],end=hit?hit.point:rc.ray.at(weapon.range,new THREE.Vector3());
  // The shoulder camera can see past cover while the barrel is still behind it.
  // Check the muzzle path too, so no weapon can fire through a nearby wall.
  muzzleRc.set(shotOrigin,shotDirection.copy(end).sub(shotOrigin).normalize());muzzleRc.far=shotOrigin.distanceTo(end)-.02;
  const obstruction=muzzleRc.intersectObjects(cover,false)[0];if(obstruction){hit=obstruction;end=obstruction.point;}
  if(hit){const z=hit.object.userData.root;if(!reducedMotion())impacts.emit(end,muzzleRc.ray.direction,!!z);if(z&&!z.userData.dead){hitEnemy=true;killed=damageEnemy(z,end,weaponDamage(weapon,shotOrigin.distanceTo(end))*loadout.damage*(overdrive>0?1.25:1))||killed;}}
  const tracer=TP[tpI++%TP.length],positions=tracer.geometry.attributes.position;positions.array.set([shotOrigin.x,shotOrigin.y,shotOrigin.z,end.x,end.y,end.z]);positions.needsUpdate=true;tracer.userData.life=.06;tracer.material.opacity=1;tracer.material.color.setHex(weapon.color);tracer.visible=true;
 }
 if(hitEnemy){runHits++;combatSound?.('impact',.8);hitTime=.16;$('hitmarker')?.classList.add('show');$('hitmarker')?.classList.toggle('kill',killed);snd(1100,.035,'sine',.045,.7);}
}
function updateWeaponFire(dt){fireT-=dt;if((firing||fireId!==null)&&fireT<=0&&(aligned||(!lockT&&pause<=0))){shoot();burstRound=(burstRound+1)%3;fireT=Math.max(fireT,-dt)+shotInterval(weapon,burstRound,loadout.fireRate*(overdrive>0?1.4:1));}}
const TP=[];let tpI=0;for(let i=0;i<10;i++){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6),3));const l=new THREE.Line(g,new THREE.LineBasicMaterial({color:0xfff27a,transparent:true}));l.frustumCulled=false;l.visible=false;l.userData.life=0;scene.add(l);TP.push(l);}
// ---------- decapitation ----------
let debris=[],headsDetached=0;
function decap(z,dir){const h=z.userData.head;scene.attach(h);headsDetached++;
 // The detached head outlives its body. Clone shared materials only; head-only
 // materials retain ownership and are disposed with the head.
 const bodyMaterials=new Set();z.traverse(o=>{if(o.material)for(const m of(Array.isArray(o.material)?o.material:[o.material]))bodyMaterials.add(m);});
 const clones=new Map();h.traverse(o=>{if(!o.material)return;const clone=m=>{if(!bodyMaterials.has(m))return m;if(!clones.has(m)){const c=m.clone();c.transparent=true;clones.set(m,c);}return clones.get(m);};o.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material);});
 for(let k=0;k<(LOWQ?2:MOBILE?3:6);k++){const ch=new THREE.Mesh(new THREE.DodecahedronGeometry(rnd(.04,.08),0),new THREE.MeshStandardMaterial({color:k%2?0x5a0a0a:0x3f5a20,roughness:.6,transparent:true}));h.getWorldPosition(ch.position);scene.add(ch);debris.push({o:ch,v:new THREE.Vector3(rnd(-3,3)+dir.x*2,rnd(3,6),rnd(-3,3)+dir.z*2),s:new THREE.Vector3(rnd(-15,15),rnd(-15,15),rnd(-15,15)),t:0,r:.05,mat:ch.material});}
 debris.push({o:h,v:new THREE.Vector3(dir.x*3+rnd(-1,1),rnd(5,7),dir.z*3+rnd(-1,1)),s:new THREE.Vector3(rnd(-12,12),rnd(-12,12),rnd(-12,12)),t:0,r:.24,mat:h.material});
 const n=LOWQ?18:MOBILE?36:70,pos=new Float32Array(n*3),col=new Float32Array(n*3),vel=[];h.getWorldPosition(tmpV);
 for(let i=0;i<n;i++){pos.set([tmpV.x,tmpV.y-.15,tmpV.z],i*3);col.set(Math.random()<.4?[.35,.8,.15]:[.6,.02,.02],i*3);vel.push(new THREE.Vector3(rnd(-3,3),rnd(1,5),rnd(-3,3)));}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('color',new THREE.BufferAttribute(col,3));
 const pts=new THREE.Points(geo,new THREE.PointsMaterial({size:.16,vertexColors:true,transparent:true,map:glowZ,depthWrite:false}));scene.add(pts);debris.push({o:pts,parts:vel,t:0,gy:z.position.y});}
function updDebris(dt){for(const d of [...debris]){d.t+=dt;
 if(d.parts){const a=d.o.geometry.attributes.position;for(let i=0;i<d.parts.length;i++){const v=d.parts[i];v.y-=15*dt;a.array[i*3]+=v.x*dt;a.array[i*3+1]=Math.max(d.gy+.02,a.array[i*3+1]+v.y*dt);a.array[i*3+2]+=v.z*dt;}
  a.needsUpdate=true;d.o.material.opacity=Math.max(0,1-d.t/1.2);if(d.t>1.2){disposeModel(d.o);debris.splice(debris.indexOf(d),1);}continue;}
 const o=d.o;d.v.y-=20*dt;o.position.addScaledVector(d.v,dt);o.rotation.x+=d.s.x*dt;o.rotation.y+=d.s.y*dt;o.rotation.z+=d.s.z*dt;const gy=groundH(o.position.x,o.position.z)+d.r;
 if(o.position.y<gy){o.position.y=gy;if(Math.abs(d.v.y)>1)d.v.y=-d.v.y*.45;else d.v.y=0;d.v.x*=.7;d.v.z*=.7;d.s.multiplyScalar(.6);}
 d.mat.opacity=Math.max(0,1-(d.t-3));if(d.t>4.2){disposeModel(o);debris.splice(debris.indexOf(d),1);}}}
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
function startIntro(){clearInput();mode='intro';iPhase='heli';iT=0;heliT=0;heliOn=true;heli.visible=true;DT=pickDrop();heading=rnd(0,6.283);const hd=new THREE.Vector3(Math.cos(heading),0,-Math.sin(heading));
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
function startPlay(keep){clearInput();flightMovement=false;clearTimeout(card.t);clearTimeout(card.hideT);$('lvlCard').classList.add('hide');mode='play';view.follow=view.boom;player.rotation.set(0,yaw+Math.PI,0);pitch=-.1;vy=0;document.body.classList.add('playing');running=true;rjReady=performance.now()+RJ_CD;if(!keep){wave=0;nextWave();}else announce('BACK IN THE FIGHT');updHud();}
function rejump(){if(gamePaused||mode!=='play'||performance.now()<rjReady)return;running=false;clearInput();frozenOrb.clear();rejumping=true;vy=0;startIntro();snd(500,.3,'triangle',.12,1.5);}
$('rejumpBtn').addEventListener('click',e=>{e.stopPropagation();rejump();});addEventListener('keydown',e=>{if(!e.defaultPrevented&&!e.target.closest?.('input,select,textarea,[contenteditable=true]')&&e.code==='KeyH')rejump();});
function updRejump(){const el=$('rejumpBtn'),pauseEl=$('pauseRejumpBtn');const v=mode==='play'?Math.ceil(Math.max(0,(rjReady-(gamePaused?pauseStarted:performance.now()))/1000)):-2;if(v===rjShown)return;rjShown=v;el.classList.toggle('cd',v!==0);el.disabled=v!==0;el.querySelector('b').textContent=v>0?v+'s':v===0?'JUMP AGAIN':'—';if(pauseEl){pauseEl.disabled=v!==0;const label=pauseEl.querySelector('[data-rejump-label]')||pauseEl;const text=v>0?'REDEPLOY IN '+v+'s':v===0?'HELICOPTER REDEPLOY':'AVAILABLE AFTER LANDING';if(label.textContent!==text)label.textContent=text;}}
$('skipBtn').addEventListener('click',e=>{e.stopPropagation();if(gamePaused)return;skipIntro();document.activeElement?.blur();lockPointer();});
// ---------- game flow ----------
let levelTimer=null;
function reset(){clearInput();flightMovement=false;jetFuel=1;frozenOrb.reset();acidThreats.clear();acidHintShown=false;momentum.reset();updateMomentumHud();campaignComplete=false;showOutcome(false);W.setEncounter?.(0,{immediate:true,motion:!reducedMotion()});fieldUplink.reset();runUplinks=0;updateFieldHud();ranks=restoreRanks();loadout=bonuses(ranks);offeredUpgrades=[];overdriveMax=8;overdrive=reserveArmor=eliteKills=pickupNoticeTime=0;elitePending=null;rewards.clear();slamWarning.hide();$('upgradePanel')?.classList.add('hide');$('pickupNotice')?.classList.remove('show');document.body.classList.remove('upgrading','overdrive');flashTime=0;player.userData.flash.visible=false;player.userData.flashLight.intensity=0;impacts.clear();waveTotal=runKills=runSeconds=runShots=runHits=0;runBestStart=bestScore;gamePaused=false;waveBreak=-1;recoil=hitTime=bannerTime=damageTime=0;heliOn=false;heli.visible=false;setGain(rotor,0);setGain(wind,0);document.body.classList.remove('paused','low-health');$('pausePanel')?.classList.add('hide');$('setPanel').classList.add('hide');$('hitmarker')?.classList.remove('show');$('waveBanner')?.classList.remove('show');$('vig').classList.remove('burn','hurt');toSpawn=0;debris.forEach(d=>disposeModel(d.o));debris=[];zombies.forEach(disposeZombie);zombies=[];TP.forEach(t=>t.visible=false);score=0;wave=0;hp=100;vy=0;updHud();}
function returnToMenu(){
 rememberScore();mode='menu';running=false;reset();introDone=false;rejumping=false;iPhase='';iT=heliT=0;vel.set(0,0,0);rjReady=0;rjShown=-1;
 chute.visible=false;chute.scale.setScalar(1);const u=chute.userData;u.can.scale.y=1.3;u.can.position.y=4.2;u.mat.opacity=1;u.cords.material.opacity=1;streaks.visible=false;streaks.material.opacity=0;
 player.userData.flash.visible=false;player.userData.flashLight.intensity=0;player.rotation.set(0,0,0);yaw=0;pitch=-.1;spawnPlayer();
 clearTimeout(card.t);clearTimeout(card.hideT);clearTimeout(levelTimer);levelTimer=null;$('lvlCard').classList.add('hide');$('skipBtn').classList.add('hide');$('over').classList.add('hide');$('lock').style.display='none';
 document.body.classList.remove('playing','intro','paused');$('start').classList.remove('hide');document.exitPointerLock?.();syncAudio();$('startBtn').focus();
}
const lvURL=(l,go)=>{const q=new URLSearchParams(location.search);q.set('level',l);if(go)q.set('go','1');else q.delete('go');return location.pathname+'?'+q.toString();};
function card(t,sub,ms=2600){const c=$('lvlCard');clearTimeout(card.t);clearTimeout(card.hideT);c.querySelector('h2').textContent=t;c.querySelector('p').textContent=sub;c.classList.remove('hide');c.style.opacity=1;card.t=setTimeout(()=>{c.style.opacity=0;card.hideT=setTimeout(()=>c.classList.add('hide'),700);},ms);}
function goLevel2(){if(mode==='trans')return;acidThreats.clear();frozenOrb.clear();clearInput();running=false;mode='trans';firing=false;fireId=null;lockT=null;try{localStorage.setItem('szUnlocked','2');sessionStorage.setItem('szCarry',JSON.stringify({score,runKills,runSeconds,runShots,runHits,runBestStart,ranks,overdrive,overdriveMax,reserveArmor,eliteKills,runUplinks,momentum:momentum.state}));}catch(e){}
 document.body.classList.remove('playing');card('LEVEL 2','Ember Isle unlocked — prepare to drop',4000);snd(220,1.2,'sawtooth',.12,3);levelTimer=setTimeout(()=>location.href=lvURL(2,true),2600);}
function nextWave(){if(mode!=='play')return;waveBreak=-1;wave++;currentEncounter=createEncounter(wave,LEVEL);W.setEncounter?.(wave,{motion:!reducedMotion()});startFieldObjective();elitePending=currentEncounter.elite;toSpawn=waveTotal=currentEncounter.count;spawnT=1.5;announce('WAVE '+String(wave).padStart(2,'0')+' · '+currentEncounter.name,3);textAt('encounterName',currentEncounter.name);textAt('encounterHint',currentEncounter.hint);textAt('objective','');snd(320,.3,'triangle',.1,1.5);updHud();}
function completeWave(){acidThreats.clear();waveBreak=4;if(LEVEL===1&&wave>=5){LS('szUnlocked','2');const island=document.querySelector('#lvlSel button[data-l="2"]');if(island){island.disabled=false;island.classList.remove('locked');island.setAttribute('aria-label','Select Ember Isle');}}const healed=Math.min(loadout.recovery,100-hp);lastRecovery=healed;hp=Math.min(100,hp+loadout.recovery);announce('WAVE CLEAR'+(healed>0?' · +'+Math.ceil(healed)+' HEALTH':' · AREA SECURED'),3.5);snd(520,.28,'sine',.1,1.5);updHud();}
function begin(){if(graphicsLost)return;reset();ensureAudio();$('start').classList.add('hide');$('over').classList.add('hide');fireT=0;document.activeElement?.blur();
 if(introDone){spawnPlayer();yaw=0;startPlay();}else startIntro();if(LEVEL===2&&!introDone)card('EMBER ISLE','THE SECOND DEPLOYMENT');lockPointer();}
function goFS(){try{const el=document.documentElement,f=el.requestFullscreen||el.webkitRequestFullscreen;if(f&&!(document.fullscreenElement||document.webkitFullscreenElement)){const r=f.call(el,{navigationUI:'hide'});r?.catch?.(()=>{});}}catch(e){}}
const fsOK=!!(document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen);if(!fsOK||matchMedia('(display-mode: fullscreen),(display-mode: standalone)').matches||navigator.standalone)$('fsBtn').classList.add('hide');
function toggleFullscreen(e){e?.stopPropagation();try{if(document.fullscreenElement||document.webkitFullscreenElement){const r=(document.exitFullscreen||document.webkitExitFullscreen).call(document);r?.catch?.(()=>{});}else goFS();}catch(e){}}
$('fsBtn').addEventListener('click',toggleFullscreen);if($('settingsFullscreenBtn')){if(!fsOK)$('settingsFullscreenBtn').classList.add('hide');else $('settingsFullscreenBtn').onclick=toggleFullscreen;}
const unlocked=(()=>{try{return +localStorage.getItem('szUnlocked')||1;}catch(e){return 1;}})();
document.querySelectorAll('#lvlSel button').forEach(b=>{const l=+b.dataset.l;if(l>unlocked&&!Q.get('unlock')&&l!==LEVEL){b.disabled=true;b.classList.add('locked');b.setAttribute('aria-label','Ember Isle — clear five waves to unlock');}b.classList.toggle('sel',l===LEVEL);b.setAttribute('aria-pressed',String(l===LEVEL));
 b.onclick=()=>{if(l!==LEVEL)location.href=lvURL(l,false);};});
addEventListener('pointerdown',()=>{if(ac&&!gamePaused)ac.resume()?.catch(()=>{});});
$('startBtn').onclick=begin;$('restartBtn').onclick=begin;
document.querySelectorAll('.muteBtn').forEach(b=>b.onclick=()=>{muted=!muted;LS('szMuted',muted?'1':'0');syncAudio();});
if($('pauseBtn'))$('pauseBtn').onclick=()=>pauseGame();if($('resumeBtn'))$('resumeBtn').onclick=resumeGame;if($('pauseSettingsBtn'))$('pauseSettingsBtn').onclick=()=>pauseGame(true);
if($('pauseMenuBtn'))$('pauseMenuBtn').onclick=returnToMenu;if($('overMenuBtn'))$('overMenuBtn').onclick=returnToMenu;
if($('endlessBtn'))$('endlessBtn').onclick=continueEndless;
if($('pauseRejumpBtn'))$('pauseRejumpBtn').onclick=()=>{if(mode!=='play'||rjReady>(gamePaused?pauseStarted:performance.now()))return;resumeGame();rejump();};
document.querySelectorAll('#upgradeChoices button').forEach((button,index)=>button.addEventListener('click',()=>chooseUpgrade(index)));if($('upgradeMenuBtn'))$('upgradeMenuBtn').onclick=returnToMenu;
syncAudio();updHud();
// ---------- loop ----------
const camRc=new THREE.Raycaster(),camAnchor=new THREE.Vector3(),camSight=new THREE.Vector3(),clock=new THREE.Clock(),closeup=Q.get('view')==='closeup';let camOverride=null;
spawnPlayer();
let gT=0,lavaHurt=0,frameN=0,lastMobileFrameAt=-Infinity;const PF={ms:[],calls:0,tris:0};
function loop(){requestAnimationFrame(loop);const _t0=performance.now();
 // Keep high-refresh phones within a useful battery and thermal budget.
 if(document.hidden){clock.getDelta();lastNow=_t0;return;}
 if(MOBILE){const interval=1000/(mode==='play'||mode==='intro'?60:30);if(_t0-lastMobileFrameAt<interval-.5)return;lastMobileFrameAt=_t0;}
 const dt=Math.min(clock.getDelta(),.05);if(graphicsContext.isContextLost())markGraphicsLost();if(gamePaused||graphicsLost||mode==='upgrade'){lastNow=_t0;return;}scaler(_t0);gT+=dt;const T=gT,P=player.position;
 flashTime=Math.max(0,flashTime-dt);if(!flashTime){player.userData.flash.visible=false;player.userData.flashLight.intensity=0;}impacts.update(dt);recoil*=Math.exp(-16*dt);hitTime=Math.max(0,hitTime-dt);bannerTime=Math.max(0,bannerTime-dt);damageTime=Math.max(0,damageTime-dt);
 if(!hitTime)$('hitmarker')?.classList.remove('show');if(!bannerTime)$('waveBanner')?.classList.remove('show');if(!damageTime)$('vig').classList.remove('hurt');
 if(mode==='intro')intro(dt);updHeli(dt);
 if(running){flightFrom.copy(P);runSeconds+=dt;updateFieldObjective(dt);updateRewards(dt);updateJump(dt);const v=moveInput();const m=v.length();const gh0=groundH(P.x,P.z),sprinting=(keys.ShiftLeft||keys.ShiftRight||(MOBILE&&stick.id!==null&&m>.92))&&!(firing||fireId!==null)&&m>.1;document.body.classList.toggle('sprinting',!!sprinting);const spd=(jetActive?8.5:gh0<.3?4:sprinting?9.4:6.5)*loadout.movement;flightMovement=flightMovement||jetActive||P.y-gh0>1.5;P.addScaledVector(v,spd*dt);if(flightMovement)constrainShore(P);else collide(P,.4);curSpeed=m*(sprinting?1.25:1);
  const gh=groundH(P.x,P.z);if(jetActive){const lift=THREE.MathUtils.clamp((18-(P.y-gh))*2,-3,5.5);vy=THREE.MathUtils.lerp(vy,lift,1-Math.exp(-9*dt));}else vy=Math.max(-12,vy-20*dt);P.y+=vy*dt;if(flightMovement){const contact=flightCollision.move(flightFrom,P);if((contact.grounded&&vy<0)||(contact.ceiling&&vy>0))vy=0;if(contact.grounded&&P.y<=groundH(P.x,P.z)+.025)flightMovement=false;}else if(P.y<=gh){P.y=gh;vy=0;}player.rotation.y=yaw+Math.PI;
  if(P.y<=gh+.05&&lavaF(P.x,P.z)>.5){hurt(34*dt);lavaHurt+=dt;$('vig').classList.add('burn');if(Math.random()<dt*4)snd(140,.25,'sawtooth',.1,.4);if(!running)return;}else $('vig').classList.remove('burn');
  if(waveBreak<0){updateAcidThreats(dt);if(!running)return;momentum.update(dt);updateMomentumHud();}autoAim(dt);updateWeaponFire(dt);frozenOrb.update(dt,zombies,{motion:!reducedMotion()});
  const alive=zombies.filter(z=>!z.userData.dead).length;
  if(waveBreak>=0){waveBreak=Math.max(0,waveBreak-dt);textAt('objective','Choose an upgrade in '+Math.ceil(waveBreak)+'s · collect supplies');if(!waveBreak)showUpgrades();}
  else if(toSpawn>0){spawnT-=dt;if(spawnT<=0&&alive<ZCAP){spawn(elitePending,currentEncounter.roster[waveTotal-toSpawn]);elitePending=null;toSpawn--;spawnT=currentEncounter.gap;updHud();}}else if(alive===0)completeWave();
  for(const z of [...zombies]){if(!running)break;const u=z.userData;
   if(u.dead){u.dead+=dt;z.rotation.x=Math.max(-Math.PI/2,-u.dead*3);if(u.dead>3)u.mats.forEach(m=>{if(!m.transparent){m.transparent=true;m.needsUpdate=true;}m.opacity=Math.max(0,1-(u.dead-3));});if(u.dead>4.1){disposeZombie(z);zombies.splice(zombies.indexOf(z),1);}continue;}
   const frosted=(u.frostTime||0)>0;u.frostTime=Math.max(0,(u.frostTime||0)-dt);const enemyDt=dt*(frosted?.45:1),fi=Math.max(iceF(z.position.x,z.position.z),frosted?1:0);u.mats[0].color.copy(u.base).lerp(ICE_SKIN,fi*.8);u.mats[1].color.copy(u.base1).lerp(ICE_CLOTH,fi*.7);
   if(u.hit>0){u.hit-=dt;u.mats[0].emissive.setHex(0x664444);}else u.mats[0].emissive.setHex(u.type==='fiery'?0xff3a08:0);
   const d=_zd.copy(P).sub(z.position);d.y=0;const dist=d.length();z.rotation.y=Math.atan2(d.x,d.z);u.ph+=enemyDt*5;u.eliteAccent?.update(dt,!reducedMotion());if(updateSlam(z,enemyDt,dist)||updateSpitter(z,enemyDt,dist))continue;
   u.attackCooldown=Math.max(0,(u.attackCooldown||0)-enemyDt);
   if(u.attackWind>0){u.attackWind=Math.max(0,u.attackWind-enemyDt);if(!u.attackWind){u.attackCooldown=u.elite?.8:u.type==='brute'?.5:.62;u.strike=.15;combatSound?.('swipe',Math.max(0,1-dist/8));if(dist<(u.elite?1.8:1.5)&&P.y-groundH(P.x,P.z)<.65&&Math.abs(P.y-z.position.y)<1.8&&meleeClear(z)){hurt(18*(u.type==='brute'?1.6:u.type==='fiery'?1.3:1)*(u.elite==='commander'?1.25:u.elite?1.1:1));snd(80,.16,'triangle',.12,.5);if(!running)break;}}}
   else if(dist<(u.elite?1.5:1.25)&&!u.attackCooldown&&Math.abs(P.y-z.position.y)<1.8){u.attackWind=u.elite?.75:u.type==='brute'?.5:.38;}
   u.strike=Math.max(0,(u.strike||0)-enemyDt);const winding=u.attackWind>0,attacking=winding||u.strike>0;
   u.legs[0].rotation.x=attacking?0:Math.sin(u.ph)*.45;u.legs[1].rotation.x=attacking?0:-Math.sin(u.ph)*.45;u.arms[0].rotation.x=winding?-2.3:u.strike>0?-.55:-1.1+Math.sin(u.ph)*.18;u.arms[1].rotation.x=winding?-2.1:u.strike>0?-.55:-1.1-Math.sin(u.ph)*.18;z.rotation.z=winding?-.12:Math.sin(u.ph*.5)*.12;
   if(dist>1&&!attacking){const nav=navigateEnemy(z.position,P,u,enemyDt),speed=u.speed*enemyDt;z.position.x+=nav.navX*speed;z.position.z+=nav.navZ*speed;collide(z.position,.35);}
   z.position.y=groundH(z.position.x,z.position.z);}}
 if(DEBUG&&running&&(firing||fireId!==null))aimLog.push({t:gT,yaw:yaw*180/Math.PI,pitch:pitch*180/Math.PI,err:aimErrDeg(),aligned,lock:lockT?zombies.indexOf(lockT):-1});
 updRejump();updateAbilityHud();
 updDebris(dt);updLock();
 player.userData.animate(T,mode==='intro'?0:curSpeed,mode==='intro'?(iPhase==='free'||iPhase==='chute'):P.y>groundH(P.x,P.z)+.05,dt,!reducedMotion());
 for(const t of TP)if(t.visible){t.userData.life-=dt;t.material.opacity=t.userData.life/.06;if(t.userData.life<=0)t.visible=false;}
 if(pBlob){pBlob.visible=mode!=='intro'||iPhase==='land';if(pBlob.visible){const ground=groundH(P.x,P.z),height=Math.max(0,P.y-ground);pBlob.position.set(P.x,ground+.05,P.z);shadowNormal.set(-(groundH(P.x+.3,P.z)-groundH(P.x-.3,P.z))/.6,1,-(groundH(P.x,P.z+.3)-groundH(P.x,P.z-.3))/.6).normalize();pBlob.quaternion.setFromUnitVectors(shadowUp,shadowNormal);pBlob.scale.setScalar(1.15+height*.16);pBlob.material.opacity=.85/Math.max(1,1+height*.8);}}
 player.visible=true;firstPerson.root.visible=false;
 firstPerson.update({time:T,speed:curSpeed,recoil,flash:player.userData.flash.visible,motion:!reducedMotion()});
 if(camOverride){cam.position.copy(camOverride[0]);cam.lookAt(camOverride[1]);}
 else if(closeup&&mode==='menu'){player.rotation.set(0,-Math.PI*.1,0);cam.position.set(P.x+.15,P.y+1.4,P.z+2.3);cam.lookAt(P.x,P.y+1.15,P.z);}
 else if(mode==='menu'){const a=T*.05;cam.position.set(Math.cos(a)*115,48,Math.sin(a)*115);cam.lookAt(0,4,0);}
 else if(mode==='intro')introCam();
 else if(cameraMode==='first'){cam.position.set(P.x,P.y+1.65,P.z);cam.rotation.set(pitch+recoil,yaw,0);player.visible=false;firstPerson.root.visible=true;}
 else{const right=_c1.set(Math.cos(yaw),0,-Math.sin(yaw));cam.rotation.set(pitch+recoil,yaw,0);const f=_c2.set(0,0,-1).applyEuler(cam.rotation);
  const piv=_c3.set(P.x,P.y+1.75,P.z).addScaledVector(right,view.shoulder);const back=_c4.copy(f).negate();camRc.set(piv,back);camRc.far=view.boom;const ch=camRc.intersectObjects(solids,false);
  const wanted=ch.length?Math.max(.4,ch[0].distance-.3):view.boom;view.follow=wanted<view.follow?wanted:THREE.MathUtils.lerp(view.follow,wanted,1-Math.exp(-7*dt));cam.position.copy(piv).addScaledVector(back,view.follow);
  // A clear shoulder path can still leave a thin trunk directly over the
  // soldier. Sweep the chest-to-camera sightline too, then stay in front of it.
  camAnchor.set(P.x,P.y+1.4,P.z);camSight.copy(cam.position).sub(camAnchor);const sightLength=camSight.length();camSight.normalize();camRc.set(camAnchor,camSight);camRc.far=sightLength;const occluders=camRc.intersectObjects(solids,false);
  if(occluders.length){cam.position.copy(camAnchor).addScaledVector(camSight,Math.max(.15,occluders[0].distance-.3));view.follow=Math.min(view.follow,cam.position.distanceTo(piv));}
  const g=groundH(cam.position.x,cam.position.z)+.3;if(cam.position.y<g)cam.position.y=g;
  // Tight spaces briefly become first-person instead of filling the view with
  // the soldier's back. Menu and insertion restore the model on the next frame.
  if(cam.position.distanceTo(camAnchor)<1.1)player.visible=false;}
 const alt=Math.max(0,cam.position.y);scene.fog.near=LIGHTS.fog[0]+alt*.7;scene.fog.far=LIGHTS.fog[1]+alt*2.2;W.fogU.fogNear.value=scene.fog.near;W.fogU.fogFar.value=scene.fog.far;
 const nn=alt>150?1.5:.1;if(cam.near!==nn){cam.near=nn;cam.updateProjectionMatrix();}
 const sc=mode==='intro'?(iPhase==='heli'?heli.position:P):P;sun.position.copy(sc).addScaledVector(SUN_DIR,90);sun.target.position.copy(sc);
 if(MEDQ&&(frameN++&1)===0)renderer.shadowMap.needsUpdate=true;
 W.update(T,cam,!reducedMotion());renderFrame();PF.calls=renderer.info.render.calls;PF.tris=renderer.info.render.triangles;PF.ms.push(performance.now()-_t0);if(PF.ms.length>600)PF.ms.shift();}
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
 document.querySelectorAll('.qinfo').forEach(p=>p.textContent=`${TIER.charAt(0).toUpperCase()+TIER.slice(1)} graphics${qSet==='auto'?' · adapted to your device':''}. Changing quality restarts your run.`);}
document.querySelectorAll('.qbtns').forEach(el=>{QL.forEach(q=>{const b=document.createElement('button');b.dataset.q=q;b.textContent=q==='medium'?'MED':q.toUpperCase();
 b.onclick=e=>{e.stopPropagation();if(q===qSet)return;LS('szQ',q);LS('szAutoTier',null);const u=new URLSearchParams(location.search);u.delete('q');u.delete('go');location.href=location.pathname+(u.toString()?'?'+u:'');};el.appendChild(b);});});
document.querySelectorAll('.fpsBtn').forEach(b=>b.onclick=e=>{e.stopPropagation();showFps=!showFps;LS('szFps',showFps?'1':'0');syncSettings();});
$('gearBtn').onclick=e=>{e.stopPropagation();pauseGame(true);};$('setClose').onclick=e=>{e.stopPropagation();if(gamePaused)resumeGame();else $('setPanel').classList.add('hide');};
syncSettings();
// ---------- shader precompile (all zombie types, heli, chute, tracers) to avoid first-use hitches ----------
// Keep just these four archetypes' materials alive so disposing a temporary
// model does not evict its warmed shader program before the first real spawn.
const prewarmMaterials=new Set();
function prewarm(){const zs=Object.keys(ZT).map(t=>{const z=makeZombie(t);z.position.set(player.position.x,-60,player.position.z);scene.add(z);return z;});createEliteAccent(zs[0],true,{low:LOWQ});heli.visible=chute.visible=true;TP.forEach(t=>t.visible=true);
 try{renderer.compile(scene,cam);}catch(e){}
 for(const z of zs){const geometries=new Set();z.traverse(o=>{if(o.isMesh&&o.geometry!==blobG&&!isCachedGeometry(o.geometry))geometries.add(o.geometry);if(o.material)for(const m of(Array.isArray(o.material)?o.material:[o.material]))if(m!==blobM)prewarmMaterials.add(m);});geometries.forEach(g=>g.dispose());z.removeFromParent();}
 heli.visible=chute.visible=false;TP.forEach(t=>t.visible=false);}
prewarm();
if(closeup){$('start').classList.add('hide');$('hud').classList.add('hide');}
if(DEBUG)window.__game={get cameraMode(){return cameraMode},setCameraView,get jetpack(){return{active:jetActive,fuel:jetFuel,held:!!keys.Space||jumpButtonHeld,velocity:vy}},get frozenOrb(){return frozenOrb.state},castFrozenOrb,get encounter(){return{id:currentEncounter.id,name:currentEncounter.name,roster:[...currentEncounter.roster],gap:currentEncounter.gap}},get momentum(){return momentum.state},get campaignComplete(){return campaignComplete},get weather(){return W.weather?.state||null},get threats(){return acidThreats.active},spawnSpitter(){const z=spawn(null,'spitter');z.position.copy(player.position).add(new THREE.Vector3(0,0,-12));z.position.y=groundH(z.position.x,z.position.z);return z;},get field(){return{...fieldUplink.state,position:fieldUplink.position.toArray(),completed:runUplinks}},get progression(){return{ranks:{...ranks},choices:offeredUpgrades.map(({id,rank})=>({id,rank})),overdrive,shield:reserveArmor,eliteKills,drops:rewards.active.map(e=>({id:e.id,type:e.type,position:e.position.toArray(),age:e.age})),elites:zombies.filter(z=>z.userData.elite&&!z.userData.dead).map(z=>({name:z.userData.eliteName,hp:z.userData.hp,maxHp:z.userData.maxHp,slamWind:z.userData.slamWind||0,slamCooldown:z.userData.slamCooldown||0})),bonuses:{...loadout}}},spawnDrop(type='medkit',offset=2){return dropReward(type,player.position.clone().add(new THREE.Vector3(offset,0,0)))?.id;},spawnElite(commander=false){const z=spawn(commander?'commander':'elite');z.position.copy(player.position).add(new THREE.Vector3(0,0,-5));z.position.y=groundH(z.position.x,z.position.z);return z;},get weapon(){return{id:weapon.id,name:weapon.name,pellets:weapon.pellets.length,range:weapon.range,assistRange:weapon.assistRange,burstRound,cooldown:fireT}},get graphicsLost(){return graphicsLost},get combat(){return{kills:runKills,seconds:runSeconds,shots:runShots,hits:runHits,waveTotal,impacts:impacts.active,impactCapacity:impacts.capacity}},colliders:{circles:W.circles,boxes:W.boxes},get mode(){return mode},get phase(){return iPhase},get paused(){return gamePaused},pause:pauseGame,resume:resumeGame,returnToMenu,get muted(){return muted},get toSpawn(){return toSpawn},get waveBreak(){return waveBreak},get bestScore(){return bestScore},get time(){return gT},get firing(){return firing||fireId!==null},get score(){return score},set score(v){score=v;rememberScore();updHud();},get heads(){return headsDetached},get yaw(){return yaw},get alt(){return player.position.y},aimLog,level:LEVEL,scene,player,camera:cam,setView(y,p=-.1){yaw=y;pitch=THREE.MathUtils.clamp(p,cameraMode==='first'?-1.35:-.7,cameraMode==='first'?1.35:.55);},get zombies(){return zombies},PF,tier:TIER,qSet,detect:DETECT,merge:MERGE,get scale(){return rScale},get programs(){return renderer.info.programs.length},landed,get drop(){return[DT.x,DT.z]},get hp(){return hp},set hp(v){hp=Math.max(0,Math.min(100,v));updHud();},get rjCD(){return (rjReady-performance.now())/1000},set rjCD(v){rjReady=performance.now()+v*1000},get lavaHurt(){return lavaHurt},get wave(){return wave},get pos(){return[player.position.x,player.position.y,player.position.z]},
 clearWave(){zombies.forEach(disposeZombie);zombies=[];toSpawn=0;waveBreak=-1;updHud();},damage(amount){hurt(amount);},
 setPos(x,z){player.position.set(x,groundH(x,z),z);},lavaSpot(){for(let k=0;k<5000;k++){const x=rnd(-60,60),z=rnd(-60,60);if(lavaF(x,z)>.95&&islandD(x,z)<.8&&lavaF(x+1.5,z)>.9&&lavaF(x-1.5,z)>.9)return[x,z];}return null;},winLevel(){goLevel2();},rejump(){rejump();},
 setAlt(y){player.position.y=y;},overview(on){camOverride=on?[new THREE.Vector3(...on[0]),new THREE.Vector3(...on[1])]:null;},
 spawnNear(){spawn();const z=zombies[zombies.length-1];z.position.set(player.position.x-Math.sin(yaw)*5,0,player.position.z-Math.cos(yaw)*5);z.position.y=groundH(z.position.x,z.position.z);z.userData.hp=1;}};
if(Q.get('go')==='1'&&!closeup){
 begin();
 if(LEVEL===2)try{
  const saved=sessionStorage.getItem('szCarry');sessionStorage.removeItem('szCarry');const c=JSON.parse(saved||'null');
  if(c&&typeof c==='object'){
   const valid=(value,fallback=0)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.min(value,Number.MAX_SAFE_INTEGER):fallback;
   score=Math.floor(valid(c.score));runKills=Math.floor(valid(c.runKills));runSeconds=valid(c.runSeconds);runShots=Math.floor(valid(c.runShots));runHits=Math.min(runShots,Math.floor(valid(c.runHits)));runBestStart=valid(c.runBestStart,runBestStart);ranks=restoreRanks(c.ranks);loadout=bonuses(ranks);overdrive=Math.min(12,valid(c.overdrive));overdriveMax=Math.max(overdrive,Math.min(12,Math.max(8,valid(c.overdriveMax,8))));reserveArmor=Math.min(60,valid(c.reserveArmor));eliteKills=Math.floor(valid(c.eliteKills));runUplinks=Math.floor(valid(c.runUplinks));momentum.restore(c.momentum);updateMomentumHud();rememberScore();updHud();
  }
 }catch(e){}
}
loop();
