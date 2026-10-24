import * as THREE from 'three';import {mk,LOD} from './lod.js?v18';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
function canvasTex(w,h,draw,repeat){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;if(repeat){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(repeat,repeat);}return t;}
// Broad, muted camouflage stays readable as the operator gets small on a phone.
function camoTex(){return canvasTex(128,128,(g)=>{g.fillStyle='#a7ac8a';g.fillRect(0,0,128,128);
 const blot=(col,n,sz)=>{g.fillStyle=col;for(let i=0;i<n;i++){let x=(Math.random()*32|0)*4,y=(Math.random()*32|0)*4;const k=2+Math.random()*sz|0;
  for(let j=0;j<k*3;j++){g.fillRect((x+128)%128,(y+128)%128,4,4);x+=(Math.random()*3-1|0)*4;y+=(Math.random()*3-1|0)*4;}}};
 blot('#899271',36,6);blot('#6f7858',28,7);blot('#4e5f49',18,5);blot('#c2bfa0',15,3);},1);}
function labelTex(){return canvasTex(128,64,(g)=>{g.fillStyle='#2f6a3c';g.fillRect(0,0,128,64);g.strokeStyle='#d8e8d0';g.lineWidth=4;g.strokeRect(5,5,118,54);
 g.fillStyle='#fff';g.font='bold 40px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('A-B',64,34);});}
function sashTex(){return canvasTex(64,64,(g)=>{g.fillStyle='#97504a';g.fillRect(0,0,64,64);g.fillStyle='#ac655a';for(let y=0;y<64;y+=4)g.fillRect(0,y,64,1);g.fillStyle='#89473f';for(let x=0;x<64;x+=4)g.fillRect(x,0,1,64);},1);}

export function makeSoldier(){
 function fabricN(){const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.fillStyle='rgb(128,128,255)';g.fillRect(0,0,256,256);
for(let i=0;i<260;i++){const x=Math.random()*256,y=Math.random()*256,l=8+Math.random()*30,a=Math.random()*.6-.3;g.strokeStyle=`rgba(${100+Math.random()*56},${100+Math.random()*56},255,.5)`;g.lineWidth=1+Math.random()*2;g.beginPath();g.moveTo(x,y);g.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l);g.stroke();}
for(let y=0;y<256;y+=3){g.fillStyle='rgba(128,120,255,.25)';g.fillRect(0,y,256,1);}
const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(3,3);return t;}
const FN=fabricN();
const camo=new THREE.MeshStandardMaterial({map:camoTex(),normalMap:FN,normalScale:new THREE.Vector2(.2,.2),roughness:.96});
 const tan=new THREE.MeshStandardMaterial({color:0xb3aa88,roughness:.93,normalMap:FN,normalScale:new THREE.Vector2(.18,.18)});
 const tanDark=new THREE.MeshStandardMaterial({color:0x777b5f,roughness:.94});
 const black=new THREE.MeshStandardMaterial({color:0x20292c,roughness:.75,metalness:.1});
 const skin=new THREE.MeshStandardMaterial({color:0xd9aa86,roughness:.85});
 const glove=new THREE.MeshStandardMaterial({color:0x424c42,roughness:.9,normalMap:FN,normalScale:new THREE.Vector2(.2,.2)});
 const gray=new THREE.MeshStandardMaterial({color:0x646a5d,roughness:.9});
 const seam=new THREE.MeshStandardMaterial({color:0x6f6350,roughness:.9});
 const metal=new THREE.MeshStandardMaterial({color:0x80908b,metalness:.65,roughness:.5});
 const gun=new THREE.MeshStandardMaterial({color:0x303c3b,metalness:.55,roughness:.6});
 const lens=new THREE.MeshStandardMaterial({color:0x406771,emissive:0x10222a,emissiveIntensity:.2,metalness:.45,roughness:.22});
 const sash=new THREE.MeshStandardMaterial({map:sashTex(),color:0xffffff,roughness:1,side:THREE.DoubleSide});
 const patch=new THREE.MeshStandardMaterial({map:labelTex(),roughness:1});
 const root=new THREE.Group();root.name='operator';
 const M=(geo,mat,p,x=0,y=0,z=0,rx=0,ry=0,rz=0)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);m.castShadow=true;p.add(m);return m;};
 const G=(p,x=0,y=0,z=0)=>{const g=new THREE.Group();g.position.set(x,y,z);p.add(g);return g;};
 // Lathe UVs allocate almost no texture height to a capsule's straight section.
 // Project V from its actual height so the fabric no longer becomes long streaks.
 const cap=(r,l)=>{const g=mk(THREE.CapsuleGeometry,r,l,5,12),p=g.attributes.position,uv=g.attributes.uv;for(let i=0;i<p.count;i++)uv.setY(i,(p.getY(i)+r+l/2)/(2*r+l));return g;};
 const sph=(r)=>mk(THREE.SphereGeometry,r,16,10), ring=(r,t)=>mk(THREE.TorusGeometry,r,t,6,16);
 // RoundedBox's segment count is per corner; it can safely use one on Low.
 const RB=(w,h,d,r=.03)=>new RoundedBoxGeometry(w,h,d,LOD.low?1:2,r);
 const body=G(root);
 // ---- torso / vest ----
 const torso=M(cap(.19,.28),camo,body,0,1.3,0);torso.scale.set(1.25,1,.78);
 M(RB(.46,.4,.3,.06),tan,body,0,1.33,0);               // vest
 M(RB(.4,.16,.27,.05),camo,body,0,1.06,0);              // pelvis
 M(RB(.44,.05,.3,.02),tanDark,body,0,1.13,0);           // belt
 M(ring(.2,.008),seam,body,0,1.12,0,Math.PI/2).scale.set(1.15,.8,1); // waist seam
 // front pouch with A-B plate
 M(RB(.3,.13,.1,.03),tan,body,0,1.2,.17);
 M(mk(THREE.PlaneGeometry,.13,.065),patch,body,0,1.2,.222);
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
 // A compact field pack and radio give the third-person view a clear silhouette.
 M(RB(.29,.29,.12,.035),tanDark,body,0,1.36,-.205);
 M(RB(.24,.12,.035,.018),tan,body,0,1.29,-.28);
 for(const x of[-.085,.085])M(RB(.025,.24,.018,.008),tan,body,x,1.4,-.276);
 M(RB(.075,.15,.055,.012),black,body,.135,1.46,-.24);
 M(mk(THREE.CylinderGeometry,.004,.005,.2,6),black,body,.135,1.62,-.24);
 M(mk(THREE.PlaneGeometry,.105,.052),patch,body,0,1.42,-.285,0,Math.PI);
 // ---- head ----
 M(mk(THREE.CylinderGeometry,.055,.06,.1,14),skin,body,0,1.6,0);
 const head=G(body,0,1.73,0);
 M(sph(.11),skin,head,0,0,0).scale.set(.95,1.08,1);
 M(sph(.112),black,head,0,.005,.022,0,0,0).scale.set(.98,.82,.92);   // full face visor/mask
 M(mk(THREE.CylinderGeometry,.04,.045,.06,18),black,head,0,-.045,.11,Math.PI/2); // respirator filter
 M(ring(.042,.006),gray,head,0,-.045,.142);
 M(mk(THREE.SphereGeometry,.137,20,12,0,Math.PI*2,0,Math.PI*.52),tan,head,0,.045,-.005); // helmet
 M(mk(THREE.TorusGeometry,.128,.01,6,20,Math.PI),tanDark,head,0,.045,-.005,0,Math.PI/2,0); // ridge seam top
 M(ring(.132,.009),tanDark,head,0,.035,-.005,Math.PI/2+.08);         // brim rim
 M(RB(.17,.061,.036,.014),black,head,0,.007,.105);
 M(RB(.144,.039,.012,.009),lens,head,0,.011,.128);
 M(RB(.012,.044,.015,.004),black,head,0,.01,.136);
 for(const s of[-1,1])M(RB(.03,.07,.07,.01),tanDark,head,s*.119,-.007,-.01);
 // corrugated hose: filter -> right chest
 const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,1.685,.15),new THREE.Vector3(-.02,1.645,.2),new THREE.Vector3(-.06,1.58,.215),new THREE.Vector3(-.11,1.5,.205),new THREE.Vector3(-.15,1.42,.19),new THREE.Vector3(-.17,1.36,.175)]);
 const N=16;for(let i=0;i<=N;i++){const p=curve.getPoint(i/N),t=curve.getTangent(i/N);const r=M(mk(THREE.TorusGeometry,.016,.007,6,12),black,body,p.x,p.y,p.z);r.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),t);r.castShadow=false;}
 // ---- arms ----
 const mkArm=(s)=>{const sh=G(body,s*.29,1.48,0);sh.name=s<0?'right-shoulder':'left-shoulder';M(sph(.085),camo,sh);M(ring(.075,.008),tanDark,sh,0,-.05,0,Math.PI/2);
  M(cap(.065,.22),camo,sh,0,-.17,0);const el=G(sh,0,-.34,0);M(sph(.06),camo,el);M(ring(.06,.007),tanDark,el,0,0,0,Math.PI/2);
  M(cap(.058,.24),camo,el,0,-.17,0);M(ring(.06,.012),tanDark,el,0,-.29,0,Math.PI/2);
  const f=G(el,0,-.36,0);f.name=s<0?'right-hand':'left-hand';M(RB(.1,.09,.1,.025),glove,f);for(let i=0;i<4;i++)M(sph(.015),glove,f,-.035+i*.024,-.027,.04);M(sph(.024),glove,f,s*-.048,.01,.025);
  return{sh,el,f,bend:new THREE.Vector3(s*.8,-1,-.1)};};
 const R=mkArm(-1),L=mkArm(1);
 // ---- legs ----
 const mkLeg=(s)=>{const hip=G(body,s*.12,.98,0);M(sph(.1),camo,hip);M(cap(.1,.26),camo,hip,0,-.2,0);
  M(RB(.06,.13,.13,.025),camo,hip,s*.1,-.2,0);M(RB(.065,.03,.135,.01),tanDark,hip,s*.1,-.13,0); // cargo pocket + flap
  const kn=G(hip,0,-.43,0);M(mk(THREE.SphereGeometry,.07,16,10,0,Math.PI*2,0,Math.PI/2),tanDark,kn,0,0,.06,Math.PI/2);
  M(ring(.085,.007),seam,kn,0,0,0,Math.PI/2);M(cap(.085,.22),camo,kn,0,-.18,0);
  // tall laced boot
  M(cap(.088,.16),tanDark,kn,0,-.3,0);for(let i=0;i<5;i++)M(mk(THREE.BoxGeometry,.07,.008,.01),tan,kn,0,-.22-i*.04,.088,0,0,i%2?.3:-.3);
  M(RB(.15,.09,.27,.035),tanDark,kn,0,-.44,.04);M(RB(.16,.05,.29,.02),black,kn,0,-.49,.04);
  for(let i=0;i<6;i++)M(mk(THREE.BoxGeometry,.165,.02,.018),seam,kn,0,-.515,-.08+i*.045);
  return{hip,kn};};
 const LL=mkLeg(1),RL=mkLeg(-1);
 // ---- sash: knotted at waist, two swaying tails ----
 M(mk(THREE.TorusGeometry,.215,.03,8,32),sash,body,0,1.08,0,Math.PI/2).scale.set(1.05,.78,.7);
 M(sph(.05),sash,body,-.15,1.08,-.1).scale.set(1.3,.8,1);
 const tails=[];for(const [x,len] of[[-.16,5],[-.12,7]]){let p=G(body,x,1.05,-.12);const segs=[];
  for(let i=0;i<len;i++){const s=G(p,0,i?-.075:0,0);M(mk(THREE.PlaneGeometry,.075,.08),sash,s,0,-.04,0);segs.push(s);p=s;}tails.push(segs);}
 // ---- rifle ----
 const rifle=G(body,-.11,1.36,.42);rifle.name='carbine';
 M(RB(.07,.11,.42,.015),gun,rifle,0,0,0);                    // receiver
 M(RB(.065,.11,.17,.02),tanDark,rifle,-.06,-.015,-.27,0,.2); // shoulder stock
 M(RB(.07,.125,.025,.008),black,rifle,-.075,-.015,-.35);
 M(mk(THREE.CylinderGeometry,.018,.018,.35,12),gun,rifle,0,.02,.38,Math.PI/2); // barrel
 M(RB(.078,.075,.2,.015),tanDark,rifle,0,.01,.25);            // handguard
 for(const x of[-.04,.04])for(const z of[.2,.25,.3])M(mk(THREE.BoxGeometry,.004,.018,.026),black,rifle,x,.01,z);
 M(RB(.045,.16,.07,.01),gun,rifle,0,-.12,.06,-.2);            // magazine
 M(RB(.035,.1,.045,.01),gun,rifle,0,-.09,-.1,.3);             // grip
 M(mk(THREE.CylinderGeometry,.026,.026,.2,14),black,rifle,0,.1,0,Math.PI/2); // scope
 M(mk(THREE.CylinderGeometry,.033,.026,.04,14),black,rifle,0,.1,.12,Math.PI/2);
 M(mk(THREE.CircleGeometry,.024,12),lens,rifle,0,.1,.141);
 M(mk(THREE.CircleGeometry,.022,12),lens,rifle,0,.1,-.101,0,Math.PI);
 for(const z of[-.05,.05])M(mk(THREE.BoxGeometry,.02,.04,.02),gun,rifle,0,.065,z);
 M(RB(.025,.055,.025,.005),black,rifle,0,.055,.34);
 M(mk(THREE.CylinderGeometry,.027,.023,.07,10),gun,rifle,0,.02,.535,Math.PI/2);
 const muzzle=G(rifle,0,.02,.57);
 // Fixed hardware variants stay pooled for the lifetime of the operator.
 // Dynamic group boundaries preserve their visibility through rigid merging.
 const precision=G(rifle),breacher=G(rifle);precision.name='striker-hardware';breacher.name='breacher-hardware';precision.visible=breacher.visible=false;
 const blueSteel=new THREE.MeshStandardMaterial({color:0x5fabb3,roughness:.45,metalness:.55});
 const brass=new THREE.MeshStandardMaterial({color:0xc59a55,roughness:.55,metalness:.4});
 M(mk(THREE.CylinderGeometry,.03,.035,.24,10),black,precision,0,.02,.68,Math.PI/2);
 for(const z of[.6,.68,.76])M(mk(THREE.TorusGeometry,.034,.006,4,10),blueSteel,precision,0,.02,z);
 for(const x of[-.045,.045])M(mk(THREE.BoxGeometry,.012,.025,.26),blueSteel,precision,x,.005,.24);
 for(const x of[-.043,.043]){M(mk(THREE.CylinderGeometry,.037,.037,.35,10),gun,breacher,x,.02,.39,Math.PI/2);M(mk(THREE.TorusGeometry,.038,.009,4,10),brass,breacher,x,.02,.568);M(mk(THREE.CircleGeometry,.027,10),black,breacher,x,.02,.57);}
 M(RB(.15,.09,.2,.02),brass,breacher,0,-.015,.26);
 for(const z of[.2,.25,.3])M(mk(THREE.BoxGeometry,.157,.012,.015),black,breacher,0,-.015,z);
 const flashGeo=mk(THREE.ConeGeometry,.06,.21,5).rotateX(Math.PI/2).translate(0,0,.105);
 const flash=new THREE.Mesh(flashGeo,new THREE.MeshBasicMaterial({color:0xffbc52,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));flash.visible=false;muzzle.add(flash);
 const core=new THREE.Mesh(mk(THREE.SphereGeometry,.032,8,6),new THREE.MeshBasicMaterial({color:0xfff3c3,toneMapped:false}));core.position.z=.045;core.scale.z=2;flash.add(core);
 const flashLight=new THREE.PointLight(0xffaa33,0,5);muzzle.add(flashLight);
 // Two small analytic arm solves keep both hands on the weapon during its sway.
 // All scratch objects are reused; only the existing joints need animation.
 const down=new THREE.Vector3(0,-1,0),dir=new THREE.Vector3(),bend=new THREE.Vector3(),elbow=new THREE.Vector3(),target=new THREE.Vector3(),inv=new THREE.Quaternion();
 const gripR=new THREE.Vector3(0,-.09,-.1),gripL=new THREE.Vector3(.035,-.045,.12);
 function hold(arm,grip){target.copy(grip).applyMatrix4(rifle.matrix);dir.subVectors(target,arm.sh.position);const d=Math.min(.699,Math.max(.001,dir.length()));dir.normalize();
  const along=(.34*.34-.36*.36+d*d)/(2*d),height=Math.sqrt(Math.max(0,.34*.34-along*along));bend.copy(arm.bend).addScaledVector(dir,-arm.bend.dot(dir)).normalize();
  elbow.copy(dir).multiplyScalar(along).addScaledVector(bend,height);dir.copy(elbow).normalize();arm.sh.quaternion.setFromUnitVectors(down,dir);
  dir.subVectors(target,arm.sh.position).sub(elbow).normalize();inv.copy(arm.sh.quaternion).invert();dir.applyQuaternion(inv);arm.el.quaternion.setFromUnitVectors(down,dir);
  inv.copy(arm.sh.quaternion).multiply(arm.el.quaternion).invert();arm.f.quaternion.copy(inv).multiply(rifle.quaternion);}
 let kick=0,flashed=false;
 root.traverse(o=>{if(o.isMesh)o.userData.player=true;});
 root.userData={muzzle,flash,flashLight,dyn:[LL.hip,RL.hip,LL.kn,RL.kn,body,R.sh,L.sh,R.el,L.el,R.f,L.f,rifle,precision,breacher,muzzle,flash,...(LOD.low?[]:tails.flat())],
  setWeapon(id){precision.visible=id==='burst';breacher.visible=id==='scatter';muzzle.position.z=id==='burst'?.81:.59;},
  animate(t,speed,air,dt,motion=true){const ph=t*11,a=Math.min(speed,1),breath=motion?Math.sin(t*2.1)*.004*(1-a):0;
   const sw=air?0:Math.sin(ph)*.75*a;LL.hip.rotation.x=air?-.6:sw;RL.hip.rotation.x=air?.3:-sw;
   LL.kn.rotation.x=air?.9:Math.max(0,-Math.sin(ph))*1.1*a;RL.kn.rotation.x=air?.3:Math.max(0,Math.sin(ph))*1.1*a;
   body.position.y=air?0:Math.abs(Math.sin(ph))*.035*a+breath;body.rotation.x=a*.06;
   if(flash.visible&&!flashed)kick=1;flashed=flash.visible;kick*=Math.exp(-18*Math.max(0,dt||0));if(!motion)kick=0;
   rifle.position.set(-.11,1.36+(motion?Math.sin(ph*2)*.008*a:0),.42-kick*.045);
   rifle.rotation.set(-kick*.035+(motion?Math.sin(t*2.1)*.006:0),0,motion?Math.sin(ph)*.018*a:0);rifle.updateMatrix();hold(R,gripR);hold(L,gripL);
   if(!LOD.low)tails.forEach((segs,k)=>segs.forEach((s,i)=>{s.rotation.x=-(.15+a*.5)*(i?0.25:1)+(motion?Math.sin(t*4+i*.7+k)*.12*(1+a):0);s.rotation.z=motion?Math.sin(t*3+i*.5+k*2)*.08:0;}));}};
 root.userData.animate(0,0,false,0);return root;}
