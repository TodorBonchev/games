import * as THREE from 'three';

// The bodies, tapered wings and forked tails share one opaque draw. Animation
// stays in the vertex shader, so larger flocks do not add per-frame transforms.
export function createBirdFlocks(scene,{ember=false,low=false}={}){
 const count=low?9:18,perFlock=count/3,positions=[],colors=[],seeds=[],wings=[];
 const body=new THREE.Color(ember?0xb3c5ce:0x8e9b99),feather=new THREE.Color(ember?0x829ba9:0x647775),tip=new THREE.Color(ember?0x405b70:0x293e42),beak=new THREE.Color(0xbda478);
 const triangle=(a,b,c,color,wing=0)=>{for(const p of[a,b,c]){positions.push(...p);colors.push(color.r,color.g,color.b);wings.push(wing);}};
 for(let i=0;i<count;i++){
  const start=positions.length/3;
  // A narrow solid body reads from underneath as well as during insertion.
  const front=[0,.025,.44],back=[0,0,-.39],left=[-.105,0,.02],right=[.105,0,.02],top=[0,.12,.02],bottom=[0,-.09,.02];
  for(const [a,b] of[[front,left],[left,back],[back,right],[right,front]]){triangle(a,b,top,body);triangle(b,a,bottom,body);}
  triangle([-.055,.015,.36],[.055,.015,.36],[0,.015,.55],beak);
  for(const side of[-1,1]){
   const root=[side*.09,.025,.12],elbow=[side*.57,.035,.055],end=[side*1.18,0,-.28],trailing=[side*.57,.025,-.24],heel=[side*.09,.02,-.20];
   triangle(root,elbow,trailing,feather,1);triangle(root,trailing,heel,feather,1);triangle(elbow,end,trailing,tip,1);
   triangle([0,0,-.27],[side*.20,0,-.62],[side*.02,0,-.49],feather);
  }
  for(let v=start;v<positions.length/3;v++)seeds.push(i);
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 geometry.setAttribute('birdSeed',new THREE.Float32BufferAttribute(seeds,1));
 geometry.setAttribute('wing',new THREE.Float32BufferAttribute(wings,1));
 const animationTime={value:0},material=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,fog:true});
 material.onBeforeCompile=shader=>{
  shader.uniforms.birdTime=animationTime;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float birdSeed;attribute float wing;uniform float birdTime;');
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   float group=floor(birdSeed/${perFlock.toFixed(1)});
   float member=mod(birdSeed,${perFlock.toFixed(1)});
   float a=group*2.094-1.571+birdTime*(.070+group*.009)-member*.075;
   float radius=48.+group*16.+mod(member,2.)*3.5;
   float glide=smoothstep(-.15,.65,sin(birdTime*.75+birdSeed*1.7));
   float flap=sin(birdTime*(6.+mod(birdSeed,3.)*.2)+birdSeed*1.6)*.68*glide+.12;
   transformed.y+=wing*abs(position.x)*flap;
   transformed*=.9+mod(birdSeed,3.)*.12;
   float bank=-.16+sin(birdTime*.3+birdSeed)*.055;
   transformed.xy=mat2(cos(bank),sin(bank),-sin(bank),cos(bank))*transformed.xy;
   transformed.xz=mat2(cos(a),sin(a),-sin(a),cos(a))*transformed.xz;
   transformed+=vec3(cos(a)*radius,27.+group*3.5+mod(member,3.)*.85+sin(a*2.+member)*1.2,sin(a)*radius);`);
 };
 material.customProgramCacheKey=()=>`island-birds-${perFlock}`;
 const flock=new THREE.Mesh(geometry,material);flock.name='island-birds';
 // Geometry bounds describe the untransformed bird, not its shader orbit.
 flock.frustumCulled=false;flock.raycast=()=>{};
 flock.userData={birdCount:count,animationTime};scene.add(flock);
 let lastTime=null;
 return{flock,update(time,motion=true){
  const dt=lastTime===null?0:Math.max(0,Math.min(.1,time-lastTime));lastTime=time;
  if(motion)animationTime.value+=dt;
 },dispose(){flock.removeFromParent();geometry.dispose();material.dispose();}};
}
