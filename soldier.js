import * as THREE from 'three';import {mk,LOD} from './lod.js?v12';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
function canvasTex(w,h,draw,repeat){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;if(repeat){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(repeat,repeat);}t.magFilter=THREE.NearestFilter;return t;}
// Desert digital camo: tan base with brown / dark brown pixel blotches
function camoTex(){return canvasTex(128,128,(g)=>{g.fillStyle='#cdbd9c';g.fillRect(0,0,128,128);
 const blot=(col,n,sz)=>{g.fillStyle=col;for(let i=0;i<n;i++){let x=(Math.random()*32|0)*4,y=(Math.random()*32|0)*4;const k=2+Math.random()*sz|0;
  for(let j=0;j<k*3;j++){g.fillRect((x+128)%128,(y+128)%128,4,4);x+=(Math.random()*3-1|0)*4;y+=(Math.random()*3-1|0)*4;}}};
 blot('#b7a383',40,6);blot('#8d6a4c',30,7);blot('#5e3f2c',22,5);blot('#e2d6bd',15,3);},2);}
function labelTex(){return canvasTex(128,64,(g)=>{g.fillStyle='#2f6a3c';g.fillRect(0,0,128,64);g.strokeStyle='#d8e8d0';g.lineWidth=4;g.strokeRect(5,5,118,54);
 g.fillStyle='#fff';g.font='bold 40px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('A-B',64,34);});}
function sashTex(){return canvasTex(64,64,(g)=>{for(let y=0;y<64;y+=2)for(let x=0;x<64;x+=2){const v=Math.random();g.fillStyle=v>.85?'#ffb3a8':v>.4?'#d9655f':'#9c3a3a';g.fillRect(x,y,2,2);}},1);}

export function makeSoldier(){
 function fabricN(){const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.fillStyle='rgb(128,128,255)';g.fillRect(0,0,256,256);
for(let i=0;i<260;i++){const x=Math.random()*256,y=Math.random()*256,l=8+Math.random()*30,a=Math.random()*.6-.3;g.strokeStyle=`rgba(${100+Math.random()*56},${100+Math.random()*56},255,.5)`;g.lineWidth=1+Math.random()*2;g.beginPath();g.moveTo(x,y);g.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l);g.stroke();}
for(let y=0;y<256;y+=3){g.fillStyle='rgba(128,120,255,.25)';g.fillRect(0,y,256,1);}
const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(3,3);return t;}
const FN=fabricN();
const camo=new THREE.MeshStandardMaterial({map:camoTex(),normalMap:FN,normalScale:new THREE.Vector2(.7,.7),roughness:.85});
 const tan=new THREE.MeshStandardMaterial({color:0xcbbd9f,roughness:.7,normalMap:FN,normalScale:new THREE.Vector2(.4,.4)});
 const tanDark=new THREE.MeshStandardMaterial({color:0xa99a7c,roughness:.8});
 const black=new THREE.MeshStandardMaterial({color:0x0c0c0c,roughness:.35,metalness:.1});
 const skin=new THREE.MeshStandardMaterial({color:0xe8b48e,roughness:.6});
 const glove=new THREE.MeshStandardMaterial({color:0x3b3b3b,roughness:.55,normalMap:FN,normalScale:new THREE.Vector2(.5,.5)});
 const gray=new THREE.MeshStandardMaterial({color:0x5c5c58,roughness:.8});
 const seam=new THREE.MeshStandardMaterial({color:0x6f6350,roughness:.9});
 const metal=new THREE.MeshStandardMaterial({color:0x9aa0a6,metalness:.9,roughness:.3});
 const gun=new THREE.MeshStandardMaterial({color:0x2a2c2e,metalness:.75,roughness:.38});
 const sash=new THREE.MeshStandardMaterial({map:sashTex(),color:0xffffff,metalness:.65,roughness:.3,side:THREE.DoubleSide});
 const root=new THREE.Group();
 const M=(geo,mat,p,x=0,y=0,z=0,rx=0,ry=0,rz=0)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);m.castShadow=true;p.add(m);return m;};
 const G=(p,x=0,y=0,z=0)=>{const g=new THREE.Group();g.position.set(x,y,z);p.add(g);return g;};
 const cap=(r,l)=>mk(THREE.CapsuleGeometry,r,l,6,14), sph=(r)=>mk(THREE.SphereGeometry,r,20,14), ring=(r,t)=>mk(THREE.TorusGeometry,r,t,6,20);
 const RB=(w,h,d,r=.03)=>mk(RoundedBoxGeometry,w,h,d,3,r);
 const body=G(root);
 // ---- torso / vest ----
 const torso=M(cap(.19,.28),camo,body,0,1.3,0);torso.scale.set(1.25,1,.78);
 M(RB(.46,.4,.3,.06),tan,body,0,1.33,0);               // vest
 M(RB(.4,.16,.27,.05),camo,body,0,1.06,0);              // pelvis
 M(RB(.44,.05,.3,.02),tanDark,body,0,1.13,0);           // belt
 M(ring(.2,.008),seam,body,0,1.12,0,Math.PI/2).scale.set(1.15,.8,1); // waist seam
 // front pouch with A-B plate
 M(RB(.3,.13,.1,.03),tan,body,0,1.2,.17);
 M(mk(THREE.PlaneGeometry,.13,.065),new THREE.MeshStandardMaterial({map:labelTex(),roughness:.5}),body,0,1.2,.222);
 for(const x of[-.12,.12])M(mk(THREE.CylinderGeometry,.03,.03,.11,12),tanDark,body,x,1.2,.17);
 // chest straps + gray strap over left shoulder + yellow badge
 for(const x of[-.15,.15])M(RB(.06,.36,.02,.01),tanDark,body,x,1.4,.155);
 M(RB(.055,.42,.025,.01),gray,body,.09,1.42,.165,0,0,.45);
 M(mk(THREE.CylinderGeometry,.028,.028,.012,16),new THREE.MeshStandardMaterial({color:0xffe01a,emissive:0x332a00}),body,.17,1.5,.165,Math.PI/2);
 // back Y-harness + bolts
 for(const s of[-1,1])M(RB(.06,.3,.02,.01),tanDark,body,s*.1,1.43,-.158,0,0,s*.25);
 M(RB(.06,.2,.02,.01),tanDark,body,0,1.22,-.158);M(RB(.36,.05,.02,.01),tanDark,body,0,1.17,-.158);
 for(const y of[1.45,1.2]){const b=M(mk(THREE.CylinderGeometry,.03,.03,.02,16),metal,body,0,y,-.172,Math.PI/2);
  M(mk(THREE.BoxGeometry,.04,.025,.008),black,body,0,y,-.183);M(mk(THREE.BoxGeometry,.008,.025,.04),black,body,0,y,-.183,Math.PI/2);}
 // shoulder straps over top
 for(const x of[-.13,.13])M(RB(.07,.03,.32,.01),tanDark,body,x,1.535,0);
 // ---- head ----
 M(mk(THREE.CylinderGeometry,.055,.06,.1,14),skin,body,0,1.6,0);
 const head=G(body,0,1.73,0);
 M(sph(.11),skin,head,0,0,0).scale.set(.95,1.08,1);
 M(sph(.112),black,head,0,.005,.022,0,0,0).scale.set(.98,.82,.92);   // full face visor/mask
 M(mk(THREE.CylinderGeometry,.04,.045,.06,18),black,head,0,-.045,.11,Math.PI/2); // respirator filter
 M(ring(.042,.006),gray,head,0,-.045,.142);
 M(mk(THREE.SphereGeometry,.137,24,16,0,Math.PI*2,0,Math.PI*.55),tan,head,0,.015,-.005); // helmet
 M(mk(THREE.TorusGeometry,.128,.012,8,28,Math.PI),tanDark,head,0,.015,-.005,0,Math.PI/2,0); // ridge seam top
 M(mk(THREE.TorusGeometry,.128,.008,8,28,Math.PI),tanDark,head,0,.015,-.005,0,0,0).rotation.set(0,0,0);
 M(ring(.132,.012),tanDark,head,0,-.01,-.005,Math.PI/2+.12);         // brim rim
 // corrugated hose: filter -> right chest
 const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,1.685,.15),new THREE.Vector3(-.02,1.645,.2),new THREE.Vector3(-.06,1.58,.215),new THREE.Vector3(-.11,1.5,.205),new THREE.Vector3(-.15,1.42,.19),new THREE.Vector3(-.17,1.36,.175)]);
 const N=26;for(let i=0;i<=N;i++){const p=curve.getPoint(i/N),t=curve.getTangent(i/N);const r=M(mk(THREE.TorusGeometry,.016,.007,6,12),black,body,p.x,p.y,p.z);r.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),t);r.castShadow=false;}
 // ---- arms ----
 const mkArm=(s)=>{const sh=G(body,s*.29,1.48,0);M(sph(.085),camo,sh);M(ring(.075,.008),seam,sh,0,-.05,0,Math.PI/2);
  M(cap(.065,.17),camo,sh,0,-.15,0);const el=G(sh,0,-.28,0);M(sph(.06),camo,el);M(ring(.06,.007),seam,el,0,0,0,Math.PI/2);
  M(cap(.058,.15),camo,el,0,-.13,0);M(ring(.06,.012),tanDark,el,0,-.21,0,Math.PI/2);
  const f=G(el,0,-.29,0);M(RB(.11,.1,.1,.035),glove,f);for(let i=0;i<4;i++)M(sph(.017),glove,f,-.04+i*.027,-.03,.045);M(sph(.025),glove,f,s*-.05,.01,.03);
  return{sh,el};};
 const R=mkArm(-1),L=mkArm(1);
 // ---- legs ----
 const mkLeg=(s)=>{const hip=G(body,s*.12,.98,0);M(sph(.1),camo,hip);M(cap(.1,.26),camo,hip,0,-.2,0);
  M(RB(.06,.13,.13,.025),camo,hip,s*.1,-.2,0);M(RB(.065,.03,.135,.01),tanDark,hip,s*.1,-.13,0); // cargo pocket + flap
  const kn=G(hip,0,-.43,0);M(mk(THREE.SphereGeometry,.07,16,10,0,Math.PI*2,0,Math.PI/2),tanDark,kn,0,0,.06,Math.PI/2);
  M(ring(.085,.007),seam,kn,0,0,0,Math.PI/2);M(cap(.085,.22),camo,kn,0,-.18,0);
  // tall laced boot
  M(cap(.088,.16),tan,kn,0,-.3,0);for(let i=0;i<5;i++)M(mk(THREE.BoxGeometry,.07,.008,.01),tanDark,kn,0,-.22-i*.04,.088,0,0,i%2?.3:-.3);
  M(RB(.15,.09,.27,.035),tan,kn,0,-.44,.04);const sole=M(RB(.16,.05,.29,.02),tanDark,kn,0,-.49,.04);
  for(let i=0;i<6;i++)M(mk(THREE.BoxGeometry,.165,.02,.018),seam,kn,0,-.515,-.08+i*.045);
  return{hip,kn};};
 const LL=mkLeg(1),RL=mkLeg(-1);
 // ---- sash: knotted at waist, two swaying tails ----
 M(mk(THREE.TorusGeometry,.215,.03,8,32),sash,body,0,1.08,0,Math.PI/2).scale.set(1.05,.78,.7);
 M(sph(.05),sash,body,-.15,1.08,-.1).scale.set(1.3,.8,1);
 const tails=[];for(const [x,len] of[[-.16,7],[-.12,9]]){let p=G(body,x,1.05,-.12);const segs=[];
  for(let i=0;i<len;i++){const s=G(p,0,i?-.075:0,0);M(mk(THREE.PlaneGeometry,.075,.08),sash,s,0,-.04,0);segs.push(s);p=s;}tails.push(segs);}
 // ---- rifle ----
 const rifle=G(body,-.36,1.18,.42);
 M(RB(.07,.11,.42,.015),gun,rifle,0,0,0);                    // receiver
 M(RB(.06,.13,.24,.02),gun,rifle,0,-.02,-.3);                 // stock
 M(mk(THREE.CylinderGeometry,.018,.018,.35,12),gun,rifle,0,.02,.38,Math.PI/2); // barrel
 M(RB(.075,.075,.2,.015),gun,rifle,0,.01,.25);                // handguard
 M(RB(.045,.16,.07,.01),gun,rifle,0,-.12,.06,-.2);            // magazine
 M(RB(.035,.1,.045,.01),gun,rifle,0,-.09,-.1,.3);             // grip
 M(mk(THREE.CylinderGeometry,.026,.026,.2,14),black,rifle,0,.1,0,Math.PI/2); // scope
 M(mk(THREE.CylinderGeometry,.033,.026,.04,14),black,rifle,0,.1,.12,Math.PI/2);
 for(const z of[-.05,.05])M(mk(THREE.BoxGeometry,.02,.04,.02),gun,rifle,0,.065,z);
 const muzzle=G(rifle,0,.02,.57);
 const flash=new THREE.Mesh(mk(THREE.SphereGeometry,.07,8,6),new THREE.MeshBasicMaterial({color:0xffd24a}));flash.scale.set(1,1,2.2);flash.visible=false;muzzle.add(flash);
 const flashLight=new THREE.PointLight(0xffaa33,0,5);muzzle.add(flashLight);
 // aim pose
 R.sh.rotation.set(-.3,0,.08);R.el.rotation.set(-.9,0,0);L.sh.rotation.set(-.25,0,-.12);L.el.rotation.set(-.6,0,0);
 root.traverse(o=>{if(o.isMesh)o.userData.player=true;});
 root.userData={muzzle,flash,flashLight,dyn:[LL.hip,RL.hip,LL.kn,RL.kn,body,R.sh,L.sh,muzzle,flash,...(LOD.low?[]:tails.flat())],
  animate(t,speed,air,dt){const ph=t*11,a=Math.min(speed,1);
   const sw=air?0:Math.sin(ph)*.75*a;LL.hip.rotation.x=air?-.6:sw;RL.hip.rotation.x=air?.3:-sw;
   LL.kn.rotation.x=air?.9:Math.max(0,-Math.sin(ph))*1.1*a;RL.kn.rotation.x=air?.3:Math.max(0,Math.sin(ph))*1.1*a;
   body.position.y=air?0:Math.abs(Math.sin(ph))*.05*a;body.rotation.x=a*.1;
   R.sh.rotation.x=-.3+Math.sin(ph*2)*.04*a;L.sh.rotation.x=-.25+Math.sin(ph)*.3*a+Math.sin(ph*2)*.04*a;
   tails.forEach((segs,k)=>segs.forEach((s,i)=>{s.rotation.x=-(.15+a*.5)*(i?0.25:1)+Math.sin(t*4+i*.7+k)*.12*(1+a);s.rotation.z=Math.sin(t*3+i*.5+k*2)*.08;}));}};
 return root;}
