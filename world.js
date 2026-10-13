import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
export const SUN_DIR=new THREE.Vector3(-.55,.22,-.8).normalize();
export const FOG_COLOR=new THREE.Color(0xf2b28a);
export function shoreR(a){return 52+5*Math.sin(3*a)+4*Math.sin(5*a+1.3)+2.5*Math.sin(9*a+.7);}
const HILL={x:-24,z:-20},POND={x:-15,z:-9};
const hills=(x,z)=>1.6*Math.sin(x*.07)*Math.cos(z*.06)+1.1*Math.sin(x*.13+z*.09+1)+.6*Math.cos(z*.17-x*.05);
const sstep=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
export function islandD(x,z){return Math.hypot(x,z)/shoreR(Math.atan2(z,x));}
export function groundH(x,z){const d=islandD(x,z);
 if(d<1){const inl=sstep(.95,.6,d);return Math.min((1-d)*9,2.4)+(hills(x,z)+1.5)*.9*inl+10*Math.exp(-((x-HILL.x)**2+(z-HILL.z)**2)/70)-2.4*Math.exp(-((x-POND.x)**2+(z-POND.z)**2)/12);}
 return Math.max(-(d-1)*16,-12);}
const GL_SHORE='float shoreR(float a){return 52.+5.*sin(3.*a)+4.*sin(5.*a+1.3)+2.5*sin(9.*a+.7);}';
export function buildWorld(scene,MOBILE){
 const solids=[],circles=[],boxes=[],updaters=[];const rnd=(a,b)=>a+Math.random()*(b-a);
 const fogU={fogColor:{value:FOG_COLOR},fogNear:{value:60},fogFar:{value:320}};
 // ---- sky ----
 const sky=new THREE.Mesh(new THREE.SphereGeometry(4500,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,
  uniforms:{sunDir:{value:SUN_DIR},hz:{value:FOG_COLOR}},
  vertexShader:'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`uniform vec3 sunDir,hz;varying vec3 p;void main(){vec3 d=normalize(p);float h=d.y;
   vec3 c=mix(hz,vec3(1.,.42,.25),smoothstep(0.,.1,h));c=mix(c,vec3(.55,.3,.5),smoothstep(.08,.3,h));c=mix(c,vec3(.12,.16,.45),smoothstep(.28,.85,h));
   float s=max(dot(d,sunDir),0.);c+=vec3(1.,.5,.15)*pow(s,5.)*.55+vec3(1.,.75,.4)*pow(s,60.)*.8+vec3(1.,.9,.7)*pow(s,900.)*6.;
   if(h<0.)c=hz;gl_FragColor=vec4(c,1.);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`}));sky.renderOrder=-10;scene.add(sky);updaters.push((t,cam)=>sky.position.copy(cam.position));
 // ---- clouds (sprites) ----
 const cc=document.createElement('canvas');cc.width=cc.height=128;const cg=cc.getContext('2d');
 for(let i=0;i<14;i++){const x=rnd(30,98),y=rnd(45,85),r=rnd(18,34);const gr=cg.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,'rgba(255,255,255,.9)');gr.addColorStop(1,'rgba(255,255,255,0)');cg.fillStyle=gr;cg.beginPath();cg.arc(x,y,r,0,7);cg.fill();}
 const ct=new THREE.CanvasTexture(cc);ct.colorSpace=THREE.SRGBColorSpace;
 const cloudMats=[0xffe0cc,0xffd0b8,0xfff0e0].map(c=>new THREE.SpriteMaterial({map:ct,color:c,transparent:true,opacity:.92,fog:false,depthWrite:false}));
 const NC=MOBILE?45:80;for(let i=0;i<NC;i++){const s=new THREE.Sprite(cloudMats[i%3]);const near=i<NC*.2,ca=rnd(0,6.28),cr=near?rnd(90,220):rnd(220,1200);
  s.position.set(Math.cos(ca)*cr,rnd(430,650),Math.sin(ca)*cr);const k=rnd(140,300);s.scale.set(k*1.6,k,1);scene.add(s);}
 updaters.push((t,cam)=>{const y=cam.position.y;const inside=y>380&&y<820;cloudMats.forEach(m=>m.opacity+=((inside?.38:.85)-m.opacity)*.08);});
 {const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');const gr=g.createRadialGradient(64,64,0,64,64,64);gr.addColorStop(0,'rgba(255,240,200,1)');gr.addColorStop(.15,'rgba(255,190,120,.6)');gr.addColorStop(1,'rgba(255,140,80,0)');g.fillStyle=gr;g.fillRect(0,0,128,128);
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),blending:THREE.AdditiveBlending,fog:false,depthWrite:false,transparent:true,opacity:MOBILE?.6:.9}));glow.scale.set(520,520,1);scene.add(glow);
  updaters.push((t,cam)=>glow.position.copy(cam.position).addScaledVector(SUN_DIR,3000));}
 // ---- terrain ----
 const SEG=MOBILE?110:170,SZ=170;const tg=new THREE.PlaneGeometry(SZ,SZ,SEG,SEG);tg.rotateX(-Math.PI/2);const P=tg.attributes.position,col=new Float32Array(P.count*3),c=new THREE.Color();
 const sand=new THREE.Color(0xf2d9a2),wet=new THREE.Color(0xc9a979),grass=new THREE.Color(0x5db436),grass2=new THREE.Color(0x3f8f2a),under=new THREE.Color(0xd8c8a0);
 for(let i=0;i<P.count;i++){const x=P.getX(i),z=P.getZ(i),h=groundH(x,z);P.setY(i,h);const n=Math.sin(x*.9)*Math.cos(z*.8)*.5+.5,patch=Math.sin(x*.21+z*.13)*Math.cos(z*.19-x*.07);
  if(h<-.05)c.copy(under).lerp(new THREE.Color(0x8fc9b0),Math.min(1,-h/6));else if(h<.25)c.copy(wet).lerp(sand,h/.25);else if(h<.95)c.copy(sand);
  else if(h<1.4)c.copy(sand).lerp(grass,(h-.95)/.45);else{c.copy(grass).lerp(grass2,Math.min(1,Math.max(0,n*.4+patch*.35+.25)));c.offsetHSL(patch*.02,0,0);}
  const ao=h>0?THREE.MathUtils.clamp(.82+(h-groundH(x+1.5,z)*.5-groundH(x-1.5,z)*.5)*.25+ (h-groundH(x,z+1.5)*.5-groundH(x,z-1.5)*.5)*.25,.7,1.05):1;c.multiplyScalar(ao+.1);c.offsetHSL(0,0,(Math.random()-.5)*.03);col.set([c.r,c.g,c.b],i*3);}
 tg.setAttribute('color',new THREE.BufferAttribute(col,3));tg.computeVertexNormals();
 const ground=new THREE.Mesh(tg,new THREE.MeshLambertMaterial({vertexColors:true}));ground.receiveShadow=true;scene.add(ground);
 // ---- ocean ----
 const water=new THREE.Mesh(new THREE.PlaneGeometry(9000,9000),new THREE.ShaderMaterial({transparent:true,fog:false,
  uniforms:{time:{value:0},sunDir:{value:SUN_DIR},...fogU},
  vertexShader:'varying vec3 wp;void main(){vec4 w=modelMatrix*vec4(position,1.);wp=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
  fragmentShader:`uniform float time,fogNear,fogFar;uniform vec3 sunDir,fogColor;varying vec3 wp;${GL_SHORE}
  void main(){vec2 p=wp.xz;float a=atan(p.y,p.x);float d=length(p)/shoreR(a);float t=time;
   vec2 g=vec2(.8,.6)*cos(dot(p,vec2(.8,.6))*.35+t*1.3)*.5+vec2(-.5,.86)*cos(dot(p,vec2(-.5,.86))*.53+t*1.7)*.35+vec2(.2,-.98)*cos(dot(p,vec2(.2,-.98))*1.1+t*2.3)*.2+vec2(.95,.3)*cos(dot(p,vec2(.95,.3))*2.3-t*2.9)*.12;
   float dist=length(cameraPosition-wp);float att=1./(1.+dist*.025);vec3 n=normalize(vec3(-g.x*.35*att,1.,-g.y*.35*att));vec3 v=normalize(cameraPosition-wp);
   vec3 col=mix(vec3(.2,.88,.8),vec3(.02,.42,.62),smoothstep(1.,1.3,d));col=mix(col,vec3(.0,.13,.33),smoothstep(1.25,2.2,d));col=mix(col,vec3(.0,.07,.2),smoothstep(2.2,8.,d));
   float fr=pow(1.-max(dot(n,v),0.),4.);col=mix(col,vec3(.75,.42,.42),fr*.3);col*=.92+.16*(n.x*3.+.5);
   vec3 r=reflect(-sunDir,n);float sp=max(dot(r,v),0.);col+=vec3(1.,.75,.45)*(pow(sp,80.)*1.2+pow(sp,1200.)*8.);
   float wv=sin(t*1.4+a*30.)*.006+sin(t*.9)*.01;float f=smoothstep(1.04+wv,1.0,d)*step(.995,d+.01);float st=.55+.45*sin(p.x*2.1+t*2.)*sin(p.y*2.3-t*1.6);
   f=max(f*st,smoothstep(1.075+wv,1.06+wv,d)*smoothstep(1.045+wv,1.06+wv,d)*.6);col=mix(col,vec3(1.),clamp(f,0.,1.)*.9);
   float al=mix(.55,1.,smoothstep(1.,1.25,d));
   col=mix(col,fogColor,smoothstep(fogNear*1.5,fogFar*1.8,dist)*.9);gl_FragColor=vec4(col,max(al,f));
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`}));water.rotation.x=-Math.PI/2;water.position.y=.02;scene.add(water);
 updaters.push(t=>water.material.uniforms.time.value=t);
 // ---- placement helper ----
 const taken=[];const free=(r,dmax=.86,dmin=0,minC=9)=>{for(let k=0;k<200;k++){const a=rnd(0,6.283),R=shoreR(a)*Math.sqrt(rnd(dmin*dmin,dmax*dmax)),x=Math.cos(a)*R,z=Math.sin(a)*R;
  if(Math.hypot(x,z)<minC)continue;if(Math.hypot(x-HILL.x,z-HILL.z)<8||Math.hypot(x-POND.x,z-POND.z)<5.5)continue;if(taken.some(o=>Math.hypot(o.x-x,o.z-z)<o.r+r))continue;taken.push({x,z,r});return[x,z];}return[rnd(-20,20),rnd(-20,20)];};
 const m4=new THREE.Matrix4(),q=new THREE.Quaternion(),sc=new THREE.Vector3(),pv=new THREE.Vector3(),eu=new THREE.Euler();
 const setM=(im,i,x,y,z,ry,s,sy=s,rx=0)=>{eu.set(rx,ry,0);q.setFromEuler(eu);im.setMatrixAt(i,m4.compose(pv.set(x,y,z),q,sc.set(s,sy,s)));};
 // ---- huts ----
 const bamboo=(()=>{const c=document.createElement('canvas');c.width=64;c.height=8;const g=c.getContext('2d');for(let i=0;i<8;i++){g.fillStyle=i%2?'#c79a5b':'#ad7f45';g.fillRect(i*8,0,8,8);}const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(3,1);t.colorSpace=THREE.SRGBColorSpace;return t;})();
 const wood=new THREE.MeshLambertMaterial({color:0x8a5a32}),wallM=new THREE.MeshLambertMaterial({map:bamboo}),straw=new THREE.MeshLambertMaterial({color:0xd9b45a,flatShading:true}),darkM=new THREE.MeshLambertMaterial({color:0x2a1a0e});
 const add=(geo,mat,p,x,y,z,cast=true)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=cast;m.receiveShadow=true;p.add(m);return m;};
 for(let i=0;i<4;i++){const[x,z]=free(3.2,.75,.35);const y0=groundH(x,z);const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=Math.atan2(-x,-z);scene.add(g);
  for(const[sx,sz] of[[-1.7,-1.7],[1.7,-1.7],[-1.7,1.7],[1.7,1.7]])add(new THREE.CylinderGeometry(.13,.13,3,6),wood,g,sx,y0+.2,sz);
  add(new THREE.BoxGeometry(4,.2,4.2),wood,g,0,y0+1.3,0);const w=add(new THREE.BoxGeometry(3.3,2,3.3),wallM,g,0,y0+2.4,0);solids.push(w);
  add(new THREE.PlaneGeometry(1,1.6),darkM,g,0,y0+2.2,1.66,false);
  const r=add(new THREE.ConeGeometry(3.3,2.4,i%2?4:8),straw,g,0,y0+4.6,0);r.rotation.y=Math.PI/4;solids.push(r);
  for(let k=0;k<4;k++)add(new THREE.BoxGeometry(.9,.06,.12),wood,g,0,y0+.3+k*.3,2.4+k*.05);
  circles.push({x,z,r:2.6});}
 // ---- pier ----
 {const a0=.95,r0=shoreR(a0)*.92,dx=Math.cos(a0),dz=Math.sin(a0);const g=new THREE.Group();g.position.set(dx*r0,0,dz*r0);g.rotation.y=Math.atan2(dx,dz);scene.add(g);
  add(new THREE.BoxGeometry(2.2,.15,18),wood,g,0,.75,9);for(let k=0;k<10;k++)for(const s of[-1,1])add(new THREE.CylinderGeometry(.11,.11,4,6),wood,g,s*1.05,-1,k*2);}
 // ---- palms (instanced) ----
 const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(0,0,0),new THREE.Vector3(.3,3.5,0),new THREE.Vector3(1.6,6.6,0));
 const ringT=(()=>{const c=document.createElement('canvas');c.width=8;c.height=64;const g=c.getContext('2d');for(let i=0;i<8;i++){g.fillStyle=i%2?'#8b6a43':'#a5825a';g.fillRect(0,i*8,8,8);}const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(8,1);t.rotation=Math.PI/2;t.colorSpace=THREE.SRGBColorSpace;return t;})();
 const trunkG=mergeGeometries([new THREE.TubeGeometry(curve,10,.2,7),...[0,1,2].map(k=>new THREE.SphereGeometry(.2,8,6).translate(1.6+Math.cos(k*2.1)*.25,6.35,Math.sin(k*2.1)*.25))]);
 const frond=()=>{const S=6,L=3.4,pos=[],idx=[];for(let i=0;i<=S;i++){const t=i/S,x=t*L,y=.9*t-1.9*t*t,w=.6*Math.sin(Math.PI*Math.min(1,t*1.05+.06))+.04;pos.push(x,y,-w,x,y+.12,0,x,y,w);}
  for(let i=0;i<S;i++){const b=i*3;idx.push(b,b+1,b+3,b+1,b+4,b+3,b+1,b+2,b+4,b+2,b+5,b+4);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g;};
 const frondG=mergeGeometries([...Array(9)].map((_,k)=>frond().rotateZ(rnd(-.25,.15)).rotateY(k*Math.PI*2/9+rnd(-.15,.15)).translate(1.6,6.6,0)));
 const NP=MOBILE?40:70;const trunks=new THREE.InstancedMesh(trunkG,new THREE.MeshLambertMaterial({map:ringT}),NP),fronds=new THREE.InstancedMesh(frondG,new THREE.MeshLambertMaterial({color:0xffffff,side:THREE.DoubleSide}),NP);
 trunks.castShadow=fronds.castShadow=true;fronds.receiveShadow=true;const fc=new THREE.Color();
 for(let i=0;i<NP;i++){const beach=i<NP*.45;const[x,z]=free(.9,beach?.95:.8,beach?.8:.2,6);const y=groundH(x,z)-.1,ry=rnd(0,6.28),s=rnd(.8,1.25);setM(trunks,i,x,y,z,ry,s);setM(fronds,i,x,y,z,ry,s);
  fronds.setColorAt(i,fc.setHSL(rnd(.2,.33),rnd(.5,.8),rnd(.26,.42)));trunks.setColorAt(i,fc.setHSL(rnd(.06,.1),rnd(.2,.4),rnd(.6,.9)));circles.push({x,z,r:.45});}
 scene.add(trunks,fronds);solids.push(trunks);
 // ---- bushes & flowers ----
 const NB=MOBILE?70:130,NF=MOBILE?110:220;const bush=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshLambertMaterial({flatShading:true}),NB),flw=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.18,0),new THREE.MeshLambertMaterial({emissive:0x221111}),NF);
 bush.receiveShadow=true;const bp=[];
 for(let i=0;i<NB;i++){const[x,z]=free(.6,.85,.1,5);bp.push([x,z]);setM(bush,i,x,groundH(x,z)+.2,z,rnd(0,6),rnd(.5,1.1),rnd(.4,.7));bush.setColorAt(i,fc.setHSL(rnd(.25,.38),rnd(.5,.8),rnd(.2,.35)));}
 const pal=[0xff4f7b,0xffd23f,0xff7a2f,0xd94fff,0xffffff,0xff2d55];
 for(let i=0;i<NF;i++){const b=bp[i%NB];const x=b[0]+rnd(-1.4,1.4),z=b[1]+rnd(-1.4,1.4);setM(flw,i,x,groundH(x,z)+rnd(.4,.8),z,rnd(0,6),rnd(.8,1.4));flw.setColorAt(i,fc.setHex(pal[i%pal.length]));}
 scene.add(bush,flw);
 // ---- rocks ----
 const NR=MOBILE?22:34;const rocks=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),new THREE.MeshLambertMaterial({flatShading:true}),NR);rocks.castShadow=rocks.receiveShadow=true;
 for(let i=0;i<NR;i++){let x,z,s;if(i<8){const a=i/8*6.28;x=POND.x+Math.cos(a)*4.6;z=POND.z+Math.sin(a)*4.6;s=rnd(.6,1.1);}else{[x,z]=free(1.4,.97,.3,7);s=rnd(.5,1.6);}
  setM(rocks,i,x,groundH(x,z)+s*.2,z,rnd(0,6),s,s*rnd(.6,.9),rnd(0,1));rocks.setColorAt(i,fc.setHSL(.08,rnd(.05,.2),rnd(.42,.6)));circles.push({x,z,r:s*.85});}
 scene.add(rocks);solids.push(rocks);
 // ---- pond + waterfall ----
 let pondY=99;for(let k=0;k<16;k++){const a=k/16*6.28;pondY=Math.min(pondY,groundH(POND.x+Math.cos(a)*4.3,POND.z+Math.sin(a)*4.3));}pondY-=.15;
 const pond=new THREE.Mesh(new THREE.CircleGeometry(4.4,32),new THREE.MeshStandardMaterial({color:0x37d3c8,transparent:true,opacity:.82,roughness:.05,metalness:.2}));pond.rotation.x=-Math.PI/2;pond.position.set(POND.x,pondY,POND.z);scene.add(pond);
 const wfT=(()=>{const c=document.createElement('canvas');c.width=32;c.height=128;const g=c.getContext('2d');g.fillStyle='#9fe8f0';g.fillRect(0,0,32,128);for(let i=0;i<60;i++){g.fillStyle=`rgba(255,255,255,${Math.random()*.8})`;g.fillRect(Math.random()*32,Math.random()*128,2,8+Math.random()*20);}const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(2,2);return t;})();
 {const dx=POND.x-HILL.x,dz=POND.z-HILL.z,L=Math.hypot(dx,dz),ux=dx/L,uz=dz/L;const tx=HILL.x+ux*4.2,tz=HILL.z+uz*4.2,top=groundH(tx,tz)+.3,bx=POND.x-ux*3,bz=POND.z-uz*3;
  const T=new THREE.Vector3(tx,top,tz),B=new THREE.Vector3(bx,pondY,bz),yA=T.clone().sub(B),len=yA.length();yA.normalize();const xA=new THREE.Vector3(-uz,0,ux),zA=new THREE.Vector3().crossVectors(xA,yA);
  const wf=new THREE.Mesh(new THREE.PlaneGeometry(1.8,len),new THREE.MeshBasicMaterial({map:wfT,transparent:true,opacity:.9,side:THREE.DoubleSide}));
  wf.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xA,yA,zA));wf.position.copy(T).add(B).multiplyScalar(.5).addScaledVector(zA,.6);scene.add(wf);const wf2=wf.clone();wf2.material=wf.material.clone();wf2.material.map=wfT.clone();wf2.material.opacity=.45;wf2.scale.set(1.25,1,1);wf2.position.addScaledVector(zA,.08);scene.add(wf2);
  const mist=new THREE.Sprite(new THREE.SpriteMaterial({map:ct,color:0xffffff,transparent:true,opacity:.55,depthWrite:false}));mist.position.set(bx,pondY+.8,bz);mist.scale.set(4,2.2,1);scene.add(mist);updaters.push(t=>{wf2.material.map.offset.y=t*2.3;mist.material.opacity=.45+Math.sin(t*3)*.1;});
  const foam=new THREE.Mesh(new THREE.CircleGeometry(1.4,16),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.6}));foam.rotation.x=-Math.PI/2;foam.position.set(bx,pondY+.03,bz);scene.add(foam);
  updaters.push(t=>{wfT.offset.y=t*1.5;foam.scale.setScalar(1+Math.sin(t*6)*.1);});}
 // ---- crates ----
 const crateT=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');g.fillStyle='#c98b3c';g.fillRect(0,0,64,64);g.strokeStyle='#7a4f1c';g.lineWidth=6;g.strokeRect(3,3,58,58);g.beginPath();g.moveTo(3,3);g.lineTo(61,61);g.stroke();const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;})();
 const crM=new THREE.MeshLambertMaterial({map:crateT});
 for(let i=0;i<12;i++){const[x,z]=free(1.6,.85,.15,7);const s=rnd(1,1.6);const m=add(new THREE.BoxGeometry(s,s,s),crM,scene,x,groundH(x,z)+s/2-.05,z);solids.push(m);boxes.push({x,z,hx:s/2,hz:s/2});}
 return{solids,circles,boxes,ground,water,fogU,update(t,cam){updaters.forEach(f=>f(t,cam));}};}
