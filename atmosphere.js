// Baked expedition scenery: one stone batch, one accent batch, one bird flock.
// Ground detail and contact shading are vertex attributes, not shadow passes.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createBirdFlocks} from './birds.js?v19';

const hash=n=>{const v=Math.sin(n*127.17+31.7)*43758.5453;return v-Math.floor(v);};
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};

export function expeditionScenery(scene,{ground,groundH,islandD,lavaF,iceF,circles,boxes,solids,ember=false,low=false}){
 const stoneParts=[],accentParts=[],clothParts=[],sites=[],colors=ember?[0x647083,0x818598,0x485368]:[0xc8b993,0xa49c7d,0x8d9276];
 const add=(geometry,x,y,z,color,rotation=0,batch=stoneParts)=>{
  const g=geometry.index?geometry.toNonIndexed():geometry;g.rotateY(rotation).translate(x,y,z);
  const c=new THREE.Color(color),a=new Float32Array(g.attributes.position.count*3);for(let i=0;i<a.length;i+=3){a[i]=c.r;a[i+1]=c.g;a[i+2]=c.b;}
  g.setAttribute('color',new THREE.BufferAttribute(a,3));g.deleteAttribute('uv');batch.push(g);if(g!==geometry)geometry.dispose();
 };
 const choose=(angle,radius)=>{
  for(let k=0;k<90;k++){const a=angle+(k%2?1:-1)*Math.floor(k/2)*.13,r=radius+(k%3-1)*1.5,x=Math.cos(a)*r,z=Math.sin(a)*r;
   if(islandD(x,z)>.77||iceF(x,z)>.2||lavaF(x,z)>.01||lavaF(x+3,z)>.01||lavaF(x-3,z)>.01||lavaF(x,z+3)>.01||lavaF(x,z-3)>.01)continue;
   if(Math.abs(groundH(x+3,z)-groundH(x-3,z))+Math.abs(groundH(x,z+3)-groundH(x,z-3))>2.4)continue;
   if(circles.some(c=>Math.hypot(x-c.x,z-c.z)<c.r+4)||boxes.some(b=>Math.abs(x-b.x)<b.hx+4&&Math.abs(z-b.z)<b.hz+4))continue;
   return{x,z};
  }return null;
 };
 for(let i=0;i<3;i++){
  const p=choose([-1.05,.3,2.7][i],[19,32,25][i]);if(!p)continue;sites.push(p);const {x,z}=p,y=groundH(x,z),a=Math.atan2(x,z),ca=Math.cos(a),sa=Math.sin(a);
  const transform=(dx,dz)=>[x+dx*ca+dz*sa,z-dx*sa+dz*ca];
  // The open gateway frames the landscape; only its feet block movement.
  for(const sign of[-1,1]){const[px,pz]=transform(sign*2.2,0),py=groundH(px,pz),height=i===2&&sign<0?2.5:Math.max(3.7,y+5.3-py-.45);
   add(new THREE.BoxGeometry(1.22,.45,1.55),px,py+.22,pz,colors[1],a);
   for(let j=0;j<Math.ceil(height/.84);j++){const h=Math.min(.78,height-j*.84);if(h<=0)continue;add(new THREE.BoxGeometry(.92,h,1.05),px+(hash(i*40+j)-.5)*.08,py+.45+j*.84+h/2,pz,colors[(j+i)%3],a+(hash(j+sign*9)-.5)*.025);}
   add(new THREE.BoxGeometry(1.35,.28,1.38),px,py+.5+height,pz,colors[0],a);
   circles.push({x:px,z:pz,r:1.05});
  }
  if(i!==2){add(new THREE.BoxGeometry(5.85,.6,1.25),x,y+5.65,z,colors[0],a);add(new THREE.BoxGeometry(4.85,.18,1.4),x,y+6.02,z,colors[1],a);}
  if(i!==2){const[fx,fz]=transform(-1.2,.68),flag=new THREE.PlaneGeometry(.82,2.4,3,6),p=flag.attributes.position,weights=new Float32Array(p.count);
   for(let j=0;j<p.count;j++){const w=clamp(.5-p.getY(j)/2.4);weights[j]=w*w;p.setZ(j,Math.sin(w*5.2)*.11);if(w>.95)p.setY(j,p.getY(j)+Math.abs(p.getX(j))*.4);}
   flag.setAttribute('clothWeight',new THREE.BufferAttribute(weights,1));flag.computeVertexNormals();add(flag,fx,y+4.05,fz,ember?0x378da0:0x5a8580,a,clothParts);
  }
  // Carved inset mosaics are opaque, luminous color, without lights or bloom.
  for(const sign of[-1,1]){const[px,pz]=transform(sign*2.2,.54);for(let j=0;j<3;j++){
   add(new THREE.BoxGeometry(.24,.24,.025),px,y+1.6+j*.5,pz,ember?0x6ce2da:0x497c79,a,accentParts);
  }}
  for(let j=0;j<7;j++){const angle=hash(i*60+j)*6.283,r=3.8+hash(j*2+i)*2.2,px=x+Math.cos(angle)*r,pz=z+Math.sin(angle)*r;
   if(lavaF(px,pz)>.01)continue;add(new THREE.BoxGeometry(.45+hash(j)*.5,.16,.5+hash(j+7)*.4),px,groundH(px,pz)+.035,pz,colors[j%3],angle);
  }
 }
 const fabricTime={value:0};if(clothParts.length){const geometry=mergeGeometries(clothParts,false);clothParts.forEach(g=>g.dispose());const material=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
  material.onBeforeCompile=shader=>{shader.uniforms.fabricTime=fabricTime;shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float clothWeight;uniform float fabricTime;').replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.z+=sin(fabricTime*1.8+position.x*.8+position.y*2.)*clothWeight*.13;');};
  const fabric=new THREE.Mesh(geometry,material);fabric.name='weathered-banners';scene.add(fabric);
 }
 for(const [parts,name,unlit] of[[stoneParts,'expedition-ruins',false],[accentParts,'ruin-mosaics',true]])if(parts.length){
  const geometry=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());const material=unlit?new THREE.MeshBasicMaterial({vertexColors:true}):new THREE.MeshLambertMaterial({vertexColors:true});
  const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.castShadow=!unlit;mesh.receiveShadow=!unlit;scene.add(mesh);if(!unlit)solids.push(mesh);
 }
 // Softly worn trails give the otherwise broad terrain a readable scale.
 // They fade at lava/ice and keep their original hazardous surfaces intact.
 const positions=ground.geometry.attributes.position,shade=new Float32Array(positions.count*3),path=new Float32Array(positions.count);
 const trailColor=new THREE.Color(ember?0x727a86:0xb59b69);
 for(let i=0;i<positions.count;i++){
  const x=positions.getX(i),z=positions.getZ(i),height=positions.getY(i);let occlusion=0;
  for(const c of circles){const d=Math.hypot(x-c.x,z-c.z)-c.r;if(d<3.3)occlusion=Math.max(occlusion,(1-smooth(-.4,3.3,d))*.22);}
  for(const b of boxes){const d=Math.hypot(Math.max(0,Math.abs(x-b.x)-b.hx),Math.max(0,Math.abs(z-b.z)-b.hz));if(d<3.3)occlusion=Math.max(occlusion,(1-smooth(0,3.3,d))*.25);}
  const patch=Math.sin(x*.24+Math.sin(z*.18)*1.6)*Math.cos(z*.21-x*.04),broad=Math.sin(x*.068+z*.045);
  const brightness=(ember?1.01:1.04)+patch*.065+broad*.035-occlusion;
  shade.set([brightness*(ember?.98:1.025),brightness*(ember?1.015:1.005),brightness*(ember?1.05:.95)],i*3);
  if(height<1.1||islandD(x,z)>.9||lavaF(x,z)>.01||iceF(x,z)>.2)continue;
  for(const site of sites){const length=Math.hypot(site.x,site.z),dx=site.x/length,dz=site.z/length,along=x*dx+z*dz;
   if(along<0||along>length+2)continue;
   const sway=Math.sin(along*.18)*1.3*Math.sin(clamp(along/length)*Math.PI),cross=Math.abs(x*dz-z*dx-sway),edge=.95+Math.sin(x*.8+z*.4)*.15;
   const weight=(1-smooth(edge,edge+1.25,cross))*smooth(0,4,along)*(1-smooth(length,length+2,along));path[i]=Math.max(path[i],weight*(ember?.48:.66));
  }
 }
 ground.geometry.setAttribute('artShade',new THREE.BufferAttribute(shade,3));ground.geometry.setAttribute('artPath',new THREE.BufferAttribute(path,1));
 const previous=ground.material.onBeforeCompile;ground.material.onBeforeCompile=function(shader,renderer){previous.call(this,shader,renderer);shader.uniforms.trailColor={value:trailColor};
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec3 artShade;attribute float artPath;varying vec3 vArtShade;varying float vArtPath;').replace('#include <begin_vertex>','#include <begin_vertex>\nvArtShade=artShade;vArtPath=artPath;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform vec3 trailColor;varying vec3 vArtShade;varying float vArtPath;').replace('#include <alphamap_fragment>','diffuseColor.rgb=mix(diffuseColor.rgb*vArtShade,trailColor*vArtShade,vArtPath);\n#include <alphamap_fragment>');
 };
 ground.material.customProgramCacheKey=()=>`expedition-terrain-${ember?'ember':'palm'}`;
 const birds=createBirdFlocks(scene,{ember,low});
 return{sites,update(time,motion=true){birds.update(time,motion);if(motion)fabricTime.value=time;}};
}
