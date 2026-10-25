import * as THREE from 'three';
import {mk,LOD,mergeRigid} from './lod.js?v19';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
const T=(c,o={})=>new THREE.MeshStandardMaterial({color:c,roughness:.82,...o});
export function makeHeli(){
 const g=new THREE.Group();g.name='insertion-helicopter';
 const body=T(0x566452),panel=T(0x6e7c62),dark=T(0x242f31),glass=T(0x264553,{metalness:.4,roughness:.24}),stripe=T(0xd7b779),metal=T(0x86928b,{metalness:.6,roughness:.45});
 const lamp=new THREE.MeshBasicMaterial({color:0xffe5ac,toneMapped:false});
 const beacon=T(0xbf493c,{emissive:0xa32214,emissiveIntensity:1});
 const M=(geo,mat,p,x=0,y=0,z=0,rx=0,ry=0,rz=0)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);m.castShadow=true;p.add(m);return m;};
 const box=(w,h,d,r=.04)=>new RoundedBoxGeometry(w,h,d,LOD.low?1:2,r);
 const tube=(points,r,mat,p=g)=>M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(a=>new THREE.Vector3(...a))),LOD.low?8:16,r,6,false),mat,p);
 const strut=(from,to,r,mat,p=g)=>{const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to),d=b.clone().sub(a);const m=M(mk(THREE.CylinderGeometry,r,r,d.length(),8),mat,p);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return m;};
 // Rounded cabin, tapered nose and opaque glazed panels avoid sorting artifacts.
 M(box(2.85,1.7,1.78,.32),body,g,-.23,-.04,0);
 M(mk(THREE.SphereGeometry,1,24,14),body,g,1.1,-.04,0).scale.set(1.55,.82,.9);
 for(const start of[Math.PI/2+.055,Math.PI+.055])M(mk(THREE.SphereGeometry,1.025,20,12,start,Math.PI/2-.11,.33,1.34),glass,g,1.1,-.04,0).scale.set(1.55,.82,.9);
 const brow=[],lower=[],spine=[];for(let i=0;i<=12;i++){const a=Math.PI/2+i*Math.PI/12;for(const [list,t] of[[brow,.33],[lower,1.67]])list.push([1.1-1.59*Math.cos(a)*Math.sin(t),-.04+.85*Math.cos(t),.925*Math.sin(a)*Math.sin(t)]);const t=.33+i*1.34/12;spine.push([1.1+1.59*Math.sin(t),-.04+.85*Math.cos(t),0]);}
 tube(brow,.028,body);tube(lower,.032,body);tube(spine,.032,body);
 // Door recesses and cockpit side windows; the open starboard doorway frames the operator.
 for(const z of[-.904,.904]){
  const side=Math.sign(z);
  M(box(.7,.61,.025,.07),dark,g,.72,.28,z);
  M(box(.59,.48,.03,.05),glass,g,.72,.3,z+side*.018);
  M(box(1.17,1.48,.022,.05),dark,g,-.39,-.02,z);
  if(side<0){M(box(1.1,1.41,.026,.04),panel,g,-.39,-.02,z-.012);M(box(.91,.53,.03,.06),glass,g,-.39,.32,z-.035);}
  for(const x of[-1.01,.23])M(box(.048,1.53,.05,.018),panel,g,x,-.02,z+side*.02);
  M(box(1.3,.06,.075,.02),panel,g,-.39,.76,z);
  M(box(1.3,.065,.075,.02),metal,g,-.39,-.78,z);
  M(box(.48,.065,.018,.01),stripe,g,-1.37,.08,z);
  M(box(.18,.035,.055,.014),metal,g,.36,-.14,z+side*.02);
 }
 M(box(1.27,.055,.35,.025),dark,g,-.39,-.79,1.02);
 M(box(.85,.32,.58,.08),dark,g,-.55,-.53,.71); // rear bench visible behind the doorway
 M(box(.95,.08,.22,.025),stripe,g,.75,-.62,.84);
 // Engine fairings, air intakes and exhausts break up the roof silhouette.
 for(const z of[-.38,.38]){
  M(box(1.5,.46,.53,.2),panel,g,-.45,.91,z);
  M(mk(THREE.CylinderGeometry,.16,.16,.07,12),dark,g,.3,.94,z,0,0,Math.PI/2);
  M(mk(THREE.CylinderGeometry,.15,.19,.36,12),metal,g,-1.23,.92,z,0,0,Math.PI/2);
  M(mk(THREE.CircleGeometry,.129,12),dark,g,-1.415,.92,z,0,-Math.PI/2);
 }
 M(mk(THREE.CylinderGeometry,.2,.33,.3,12),dark,g,-.2,1.18,0);
 M(mk(THREE.CylinderGeometry,.065,.085,.5,8),metal,g,-.2,1.5,0);
 // Tail: raised fin, horizontal stabilizer, identifier band and navigation beacon.
 M(mk(THREE.CylinderGeometry,.15,.4,4.5,14),body,g,-3.9,.26,0,0,0,Math.PI/2);
 M(box(.68,1.38,.12,.04),panel,g,-6.04,.87,0,0,0,-.28);
 M(box(.74,.085,1.72,.035),panel,g,-5.35,.33,0);
 M(mk(THREE.CylinderGeometry,.228,.254,.24,14),stripe,g,-4.5,.26,0,0,0,Math.PI/2);
 M(mk(THREE.SphereGeometry,.075,8,6),beacon,g,-6.2,1.55,0);
 M(mk(THREE.SphereGeometry,.07,8,6),lamp,g,2.51,-.37,.25).scale.set(.4,1,1);
 // Meshes attached to each rotor are merged separately from the airframe.
 const main=new THREE.Group();main.name='main-rotor';main.position.set(-.2,1.8,0);g.add(main);
 M(mk(THREE.CylinderGeometry,.19,.19,.14,12),metal,main);
 for(let i=0;i<4;i++){const b=new THREE.Group();b.rotation.y=i*Math.PI/2;main.add(b);M(new THREE.BoxGeometry(4.55,.04,.25),dark,b,2.42,0,0,.025);M(new THREE.BoxGeometry(.3,.045,.255),stripe,b,4.55,0,0,.025);}
 const rotorBlur=new THREE.Mesh(new THREE.RingGeometry(.7,4.72,48),new THREE.MeshBasicMaterial({color:0x2d3a39,side:THREE.DoubleSide,transparent:true,opacity:.065,depthWrite:false}));rotorBlur.rotation.x=-Math.PI/2;rotorBlur.position.set(-.2,1.805,0);g.add(rotorBlur);
 const tail=new THREE.Group();tail.name='tail-rotor';tail.position.set(-6.1,1.02,.23);g.add(tail);
 for(let i=0;i<3;i++){const b=new THREE.Group();b.rotation.z=i*Math.PI*2/3;tail.add(b);M(new THREE.BoxGeometry(.105,.71,.035),dark,b,0,.36,0);M(new THREE.BoxGeometry(.11,.12,.04),stripe,b,0,.64,0);}
 M(mk(THREE.CylinderGeometry,.09,.09,.11,8),metal,tail,0,0,0,Math.PI/2);
 // Bent tubular skids have a softer, more recognisable landing silhouette.
 for(const z of[-.98,.98]){
  tube([[-1.65,-1.28,z],[-1.4,-1.38,z],[1.6,-1.38,z],[1.98,-1.19,z]],.057,dark);
  for(const x of[-.77,.82])strut([x,-.65,z*.72],[x,-1.35,z],.05,metal);
 }
 mergeRigid(g,[main,tail]);let time=0;
 g.userData={spin(dt){time+=dt;main.rotation.y+=dt*28;tail.rotation.z+=dt*40;beacon.emissiveIntensity=Math.sin(time*5)> .85?2:.2;}};return g;
}
export function makeChute(){
 const g=new THREE.Group();const c=document.createElement('canvas');c.width=256;c.height=32;const x=c.getContext('2d');
 for(let i=0;i<8;i++){x.fillStyle=i%2?'#ffffff':'#ff4d2e';x.fillRect(i*32,0,32,32);}const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
 const mat=new THREE.MeshStandardMaterial({map:t,side:THREE.DoubleSide,transparent:true,roughness:.8});
 const can=new THREE.Mesh(new THREE.SphereGeometry(1,24,10,0,Math.PI*2,0,Math.PI*.42),mat);can.scale.set(2.6,1.3,2.6);can.position.y=4.2;can.castShadow=true;g.add(can);
 const pts=[];const rim=Math.sin(Math.PI*.42)*2.6,rimY=4.2+Math.cos(Math.PI*.42)*1.3;
 for(let i=0;i<10;i++){const a=i/10*Math.PI*2;pts.push(new THREE.Vector3(Math.cos(a)*rim,rimY,Math.sin(a)*rim),new THREE.Vector3(i<5?.2:-.2,1.5,0));}
 const cords=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0x222222,transparent:true}));g.add(cords);
 g.userData={can,mat,cords};return g;}
