import * as THREE from 'three';
const T=(c,o={})=>new THREE.MeshStandardMaterial({color:c,roughness:.6,...o});
export function makeHeli(){
 const g=new THREE.Group(),body=T(0x5d6b3a),dark=T(0x2a2d2a),glass=T(0x7fd0ff,{transparent:true,opacity:.55,metalness:.3,roughness:.1}),stripe=T(0xffcc1a);
 const M=(geo,mat,p,x=0,y=0,z=0,rx=0,ry=0,rz=0)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);m.castShadow=true;p.add(m);return m;};
 // fuselage along +X (nose)
 M(new THREE.CapsuleGeometry(1.1,2.6,8,20),body,g,0,0,0,0,0,Math.PI/2).scale.set(1,1,.9);
 M(new THREE.SphereGeometry(1.05,24,16,0,Math.PI*2,0,Math.PI/2),glass,g,1.7,.15,0,0,0,-Math.PI/2).scale.set(1,.9,.85);
 M(new THREE.BoxGeometry(1.4,1.3,.05),dark,g,-.1,-.05,.99);           // open side door (dark)
 M(new THREE.BoxGeometry(2.6,.12,.02),stripe,g,-.2,.45,1.0);
 M(new THREE.CylinderGeometry(.18,.42,4.6,14),body,g,-4,.35,0,0,0,Math.PI/2); // tail boom
 M(new THREE.BoxGeometry(.9,1.4,.1),body,g,-6.1,1,0,0,0,-.35);                // fin
 M(new THREE.BoxGeometry(.7,.08,1.6),body,g,-5.6,.4,0);                       // stabilizer
 M(new THREE.CylinderGeometry(.5,.7,.5,16),dark,g,-.2,1.05,0);                // engine hump
 M(new THREE.CylinderGeometry(.08,.08,.6,8),dark,g,-.2,1.5,0);                // mast
 const main=new THREE.Group();main.position.set(-.2,1.8,0);g.add(main);M(new THREE.CylinderGeometry(.18,.18,.15,12),dark,main);
 for(let i=0;i<4;i++){const b=new THREE.Group();b.rotation.y=i*Math.PI/2;main.add(b);M(new THREE.BoxGeometry(4.6,.04,.28),dark,b,2.4,0,0,.04);}
 const tail=new THREE.Group();tail.position.set(-6.2,1.05,.15);g.add(tail);
 for(let i=0;i<2;i++)M(new THREE.BoxGeometry(.1,1.3,.03),dark,tail,0,0,0,0,0,i*Math.PI/2);
 for(const z of[-.8,.8]){M(new THREE.CylinderGeometry(.06,.06,3.6,8),dark,g,.2,-1.35,z,0,0,Math.PI/2);
  for(const x of[-.6,.9])M(new THREE.CylinderGeometry(.05,.05,.5,6),dark,g,x,-1.1,z*.85,z>0?-.3:.3);}
 g.userData={spin(dt){main.rotation.y+=dt*28;tail.rotation.z+=dt*40;}};return g;}
export function makeChute(){
 const g=new THREE.Group();const c=document.createElement('canvas');c.width=256;c.height=32;const x=c.getContext('2d');
 for(let i=0;i<8;i++){x.fillStyle=i%2?'#ffffff':'#ff4d2e';x.fillRect(i*32,0,32,32);}const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
 const mat=new THREE.MeshStandardMaterial({map:t,side:THREE.DoubleSide,transparent:true,roughness:.8});
 const can=new THREE.Mesh(new THREE.SphereGeometry(1,24,10,0,Math.PI*2,0,Math.PI*.42),mat);can.scale.set(2.6,1.3,2.6);can.position.y=4.2;can.castShadow=true;g.add(can);
 const pts=[];const rim=Math.sin(Math.PI*.42)*2.6,rimY=4.2+Math.cos(Math.PI*.42)*1.3;
 for(let i=0;i<10;i++){const a=i/10*Math.PI*2;pts.push(new THREE.Vector3(Math.cos(a)*rim,rimY,Math.sin(a)*rim),new THREE.Vector3(i<5?.2:-.2,1.5,0));}
 const cords=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0x222222,transparent:true}));g.add(cords);
 g.userData={can,mat,cords};return g;}
