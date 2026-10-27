import * as THREE from 'three';
import { LEVELS } from './prism-game.js';

export function createPrismScene(container,{lost,restored,resized}={}){
 const touch=matchMedia('(pointer: coarse)').matches;
 const renderer=new THREE.WebGLRenderer({antialias:!touch,powerPreference:'low-power'});
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor('#090b24');renderer.domElement.setAttribute('aria-hidden','true');container.prepend(renderer.domElement);
 const scene=new THREE.Scene(), camera=new THREE.OrthographicCamera(-5,5,5,-5,.1,80);camera.position.set(0,15,2.4);camera.lookAt(0,0,0);
 scene.add(new THREE.HemisphereLight('#b6eaff','#24223f',1.6));const light=new THREE.DirectionalLight('#ffffff',1.8);light.position.set(-3,10,4);scene.add(light);
 const basic=(color,opacity=1)=>new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,depthWrite:opacity===1});
 const mat=(color,emissive='#000000')=>new THREE.MeshStandardMaterial({color,emissive,emissiveIntensity:.3,metalness:.38,roughness:.26});
 const mats={tile:mat('#171e42'),tileAlt:mat('#1c264e'),rim:mat('#614680','#2a0a42'),mirror:mat('#79f7ff','#1e9ba8'),splitter:mat('#fbbdff','#a34d9b'),filter:mat('#ffbe70'),dark:mat('#141631'),gold:mat('#ffcc78','#ad7727'),leaf:mat('#246b67','#104b46')};
 const geo={box:new THREE.BoxGeometry(1,1,1),sphere:new THREE.SphereGeometry(1,12,8),oct:new THREE.OctahedronGeometry(1),torus:new THREE.TorusGeometry(1,.045,6,32),cyl:new THREE.CylinderGeometry(1,1,1,10)};
 const staticGroup=new THREE.Group(),dynamic=new THREE.Group();scene.add(staticGroup,dynamic);
 function mesh(group,g,m,x,y,z,sx,sy,sz,rot=0){const v=new THREE.Mesh(g,m);v.position.set(x,y,z);v.scale.set(sx,sy,sz);v.rotation.y=rot;if(g===geo.torus)v.rotation.x=Math.PI/2;group.add(v);return v;}
 mesh(staticGroup,geo.box,mats.dark,0,-.3,0,7.55,.45,7.55);
 for(let z=0;z<7;z++)for(let x=0;x<7;x++)mesh(staticGroup,geo.box,(x+z)%2?mats.tile:mats.tileAlt,x-3,-.04,z-3,.97,.12,.97);
 // Glassy vines and jewel-like buds surround the playable tray.
 const orchard=new THREE.Group();scene.add(orchard);
 const starMatPlaceholder=basic('#ffe3b5');
 const vine=mat('#165751','#092e37'),leaf2=mat('#3fb7a4','#125c54'),pink=mat('#fa8dca','#873657'),fruit=mat('#ffd47e','#b57727');
 for(const side of [-1,1])for(let j=0;j<16;j++){
  const z=-3.7+j*.49,x=side*(3.94+.10*Math.sin(j*.8));
  mesh(orchard,geo.sphere,vine,x,-.16,z,.09,.08,.37,.2*Math.sin(j));
  for(const offset of [-1,1]){const lx=x+side*.18+offset*.08,lz=z+offset*.16;mesh(orchard,geo.sphere,j%3===0?leaf2:mats.leaf,lx,.01,lz,.24,.08,.11,offset*.75*side);}
  if(j%4===0){mesh(orchard,geo.sphere,j%8===0?pink:fruit,x+side*.14,.14,z,.115,.12,.115);mesh(orchard,geo.sphere,lightMatsPlaceholder(),x+side*.14,.27,z,.025,.025,.025);}
 }
 function lightMatsPlaceholder(){return starMatPlaceholder;}
 const stars=new THREE.Group();scene.add(stars);const starMat=basic('#b3d9ff');for(let i=0;i<100;i++){const a=i*2.39996,r=4.2+(i*17%55)/10;mesh(stars,geo.sphere,starMat,Math.sin(a)*r,-.45,Math.cos(a)*r,.026+(i%3)*.012,.025,.026+(i%3)*.012);}
 // Static ornaments share a handful of geometry/material pairs. Batching keeps
 // the jewel border lush without a separate draw call for every leaf and star.
 function batchStatic(group){
  const groups=new Map();for(const child of [...group.children]){child.updateMatrix();let byMaterial=groups.get(child.geometry);if(!byMaterial){byMaterial=new Map();groups.set(child.geometry,byMaterial);}let entries=byMaterial.get(child.material);if(!entries){entries=[];byMaterial.set(child.material,entries);}entries.push(child.matrix.clone());group.remove(child);}
  for(const [geometry,byMaterial] of groups)for(const [material,matrices] of byMaterial){const batch=new THREE.InstancedMesh(geometry,material,matrices.length);for(let i=0;i<matrices.length;i++)batch.setMatrixAt(i,matrices[i]);batch.instanceMatrix.needsUpdate=true;batch.frustumCulled=false;group.add(batch);}
 }
 batchStatic(staticGroup);batchStatic(orchard);batchStatic(stars);
 const palette=['#ffffff','#ff647f','#80ed91','#ffcd78','#77aaff','#ed8fff','#71f6ee','#ffffff'];
 const lightMats=palette.map(c=>basic(c));const sleepingMats=['#455178','#8e3b53','#3c774f','#9b713b','#425d9b','#844d8d','#418b86','#8491ad'].map(c=>mat(c));const glowMats=palette.map(c=>basic(c,.19));
 function clear(){while(dynamic.children.length)dynamic.remove(dynamic.children[0]);}
 function render(state,time=0,focus=null){clear();const level=LEVELS[state.level-1]||LEVELS[0];
 for(const b of state.beams||[]){const x=(b.x+b.toX)/2-3,z=(b.z+b.toZ)/2-3,dx=b.toX-b.x,dz=b.toZ-b.z;mesh(dynamic,geo.box,glowMats[b.color],x,.20,z,dx?.99:.16,.03,dz?.99:.16);mesh(dynamic,geo.box,lightMats[b.color],x,.23,z,dx?.99:.045,.035,dz?.99:.045);}
 for(const src of level.sources){const x=src.x-3,z=src.z-3;mesh(dynamic,geo.cyl,mats.gold,x,.17,z,.32,.24,.32);mesh(dynamic,geo.oct,lightMats[src.color],x,.42,z,.2,.24,.2);mesh(dynamic,geo.torus,glowMats[src.color],x,.2,z,.44,.44,.44);}
 level.pieces.forEach((p,i)=>{const x=p.x-3,z=p.z-3;if(p.type==='filter'){mesh(dynamic,geo.box,mats.dark,x,.15,z,.55,.22,.55);mesh(dynamic,geo.oct,lightMats[p.color],x,.39,z,.24,.3,.24);return;}mesh(dynamic,geo.cyl,mats.dark,x,.12,z,.37,.16,.37);mesh(dynamic,geo.torus,focus===i?lightMats[6]:state.hintIndex===i?lightMats[3]:glowMats[6],x,.19,z,.42,.42,.42);const crystal=mesh(dynamic,geo.oct,p.type==='splitter'?mats.splitter:mats.mirror,x,.39,z,.3,.44,.3);crystal.rotation.y=Math.PI/4;const mark=mesh(dynamic,geo.box,lightMats[p.type==='splitter'?5:6],x,.65,z,.70,.035,.07,state.orientations?.[i]===0?Math.PI/4:-Math.PI/4);if(p.type==='splitter')mesh(dynamic,geo.sphere,lightMats[7],x,.68,z,.09,.09,.09);});
 level.flowers.forEach((f,i)=>{const x=f.x-3,z=f.z-3,lit=state.lit?.[i];mesh(dynamic,geo.cyl,mats.leaf,x,.15,z,.3,.14,.3);for(let j=0;j<6;j++){const a=j*Math.PI/3;mesh(dynamic,geo.sphere,lit?lightMats[f.color]:sleepingMats[f.color],x+Math.cos(a)*.21,.32,z+Math.sin(a)*.21,.17,.09,.12,a);}mesh(dynamic,geo.sphere,lit?lightMats[3]:mats.gold,x,.4,z,.14,.12,.14);if(lit)mesh(dynamic,geo.torus,glowMats[f.color],x,.25,z,.43,.43,.43);});
 renderer.render(scene,camera);}
 function resize(){const w=Math.max(1,container.clientWidth),h=Math.max(1,container.clientHeight),aspect=w/h;let span=8.8;if(aspect<1){camera.left=-span/2;camera.right=span/2;camera.top=span/2/aspect;camera.bottom=-span/2/aspect;}else{camera.top=span/2;camera.bottom=-span/2;camera.left=-span/2*aspect;camera.right=span/2*aspect;}camera.updateProjectionMatrix();const d=Math.min(devicePixelRatio||1,touch?1.35:1.75,Math.sqrt(420000/(w*h)));renderer.setPixelRatio(d);renderer.setSize(w,h,false);resized?.();}
 function project(x,z,height=.4){const v=new THREE.Vector3(x-3,height,z-3).project(camera);return{x:(v.x+1)*container.clientWidth/2,y:(1-v.y)*container.clientHeight/2};}
 function pick(clientX,clientY,state){const rect=container.getBoundingClientRect(),level=LEVELS[state.level-1];let best=null,dist=Infinity;level.pieces.forEach((p,i)=>{if(p.type==='filter')return;const q=project(p.x,p.z),d=Math.hypot(clientX-rect.left-q.x,clientY-rect.top-q.y);if(d<dist){dist=d;best=i;}});const a=project(0,0),b=project(1,0);return dist<=Math.max(22,Math.abs(b.x-a.x)*.49)?best:null;}
 const onLost=e=>{e.preventDefault();lost?.();},onRestored=()=>restored?.();renderer.domElement.addEventListener('webglcontextlost',onLost);renderer.domElement.addEventListener('webglcontextrestored',onRestored);
 const observer=new ResizeObserver(resize);observer.observe(container);resize();return {render,resize,project,pick,renderer,camera,dispose(){observer.disconnect();renderer.dispose();}};
}
