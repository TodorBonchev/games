import * as THREE from 'three';
function camoTex(){const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');
g.fillStyle='#c9b99a';g.fillRect(0,0,128,128);const cols=['#8a6a4a','#a88f6e','#6e5238','#d8cbb0'];
for(let i=0;i<160;i++){g.fillStyle=cols[i%4];const x=Math.random()*128|0,y=Math.random()*128|0;g.fillRect(x-x%4,y-y%4,4+(Math.random()*3|0)*4,4+(Math.random()*2|0)*4);}
const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;return t;}
function labelTex(){const c=document.createElement('canvas');c.width=64;c.height=32;const g=c.getContext('2d');
g.fillStyle='#c4b394';g.fillRect(0,0,64,32);g.fillStyle='#2f6b3a';g.font='bold 20px sans-serif';g.fillText('A-B',10,24);return new THREE.CanvasTexture(c);}
export function makeSoldier(){
 const camo=new THREE.MeshStandardMaterial({map:camoTex(),roughness:.9});
 const tan=new THREE.MeshStandardMaterial({color:0xc8b896,roughness:.8});
 const black=new THREE.MeshStandardMaterial({color:0x111111,roughness:.5});
 const glove=new THREE.MeshStandardMaterial({color:0x3a3a3a});
 const red=new THREE.MeshStandardMaterial({color:0xe0566a,side:THREE.DoubleSide});
 const strap=new THREE.MeshStandardMaterial({color:0x9e8a68});
 const root=new THREE.Group();const M=(geo,mat,x,y,z,p=root)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;p.add(m);return m;};
 M(new THREE.BoxGeometry(.7,.75,.4),camo,0,1.35,0);
 M(new THREE.BoxGeometry(.6,.25,.38),camo,0,.9,0);
 const head=M(new THREE.SphereGeometry(.2,16,12),new THREE.MeshStandardMaterial({color:0xe0b892}),0,1.95,0);
 const helm=M(new THREE.SphereGeometry(.25,16,12,0,Math.PI*2,0,Math.PI/1.8),tan,0,2.0,0);
 M(new THREE.BoxGeometry(.32,.25,.12),black,0,1.92,.17);
 for(let i=0;i<6;i++){const r=M(new THREE.TorusGeometry(.04,.018,6,10),black,.08,1.78-i*.07,.2+(i*.01));r.rotation.x=Math.PI/2;}
 const pouch=M(new THREE.BoxGeometry(.3,.22,.12),tan,-.12,1.15,.24);
 M(new THREE.PlaneGeometry(.2,.1),new THREE.MeshBasicMaterial({map:labelTex()}),-.12,1.15,.305);
 M(new THREE.BoxGeometry(.07,.07,.02),new THREE.MeshStandardMaterial({color:0xffdd00,emissive:0x444400}),.2,1.55,.21);
 for(const x of[-.2,.2]){M(new THREE.BoxGeometry(.08,.8,.03),strap,x,1.35,-.215);M(new THREE.BoxGeometry(.08,.03,.4),strap,x,1.73,0);}
 M(new THREE.BoxGeometry(.5,.08,.03),strap,0,1.3,-.22);
 M(new THREE.CylinderGeometry(.33,.33,.12,16),red,0,.98,0);
 for(const [x,a] of[[-.1,.15],[.05,-.1]]){const t=M(new THREE.PlaneGeometry(.1,.5),red,x,.7,.22);t.rotation.z=a;}
 const legs=[];for(const x of[-.17,.17]){const g=new THREE.Group();g.position.set(x,.85,0);root.add(g);
  M(new THREE.BoxGeometry(.24,.6,.26),camo,0,-.3,0,g);M(new THREE.BoxGeometry(.26,.28,.36),tan,0,-.72,.04,g);legs.push(g);}
 const arms=[];for(const x of[-.45,.45]){const g=new THREE.Group();g.position.set(x,1.65,0);root.add(g);
  M(new THREE.BoxGeometry(.2,.65,.2),camo,0,-.3,0,g);M(new THREE.SphereGeometry(.13,10,8),glove,0,-.68,0,g);arms.push(g);}
 arms[0].rotation.x=arms[1].rotation.x=-1.3;arms[0].rotation.z=-.4;arms[1].rotation.z=.2;
 const gun=new THREE.Group();gun.position.set(.05,1.3,.55);root.add(gun);
 const gm=new THREE.MeshStandardMaterial({color:0x222222,metalness:.6});
 M(new THREE.BoxGeometry(.1,.15,.6),gm,0,0,0,gun);M(new THREE.CylinderGeometry(.03,.03,.5),gm,0,.03,.5,gun).rotation.x=Math.PI/2;
 M(new THREE.BoxGeometry(.07,.2,.08),gm,0,-.15,.05,gun);
 const flash=new THREE.Mesh(new THREE.SphereGeometry(.12,8,6),new THREE.MeshBasicMaterial({color:0xffcc33}));flash.position.set(0,.03,.8);flash.visible=false;gun.add(flash);
 root.userData={legs,flash,gun};return root;}
