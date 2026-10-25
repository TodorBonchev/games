// Level 2: Ember Isle — volcanic night island with lava rivers, basalt, ruins, glowing fungi.
import * as THREE from 'three';
import {lowSky,lowTerrainMat,lowWater} from './lowfx.js?v19';
import {expeditionScenery} from './atmosphere.js?v19';
import {createEncounterWeather} from './weather.js?v19';
export const SUN_DIR=new THREE.Vector3(.45,.42,-.78).normalize(); // moon direction
export const FOG_COLOR=new THREE.Color(0x343e4d);
export const LIGHTS={hemi:[0x7f91b7,0x5b2d20,.6],rim:[0xff8a49,.95],rimPos:[-30,8,-40],sun:[0xc5d9ff,2.1],exp:.9,fog:[40,300],name:'EMBER ISLE'};
export function shoreR(a){return 56+6*Math.sin(2*a+.5)+4*Math.sin(5*a+2.1)+2*Math.sin(11*a+.3);}
const GL_SHORE='float shoreR(float a){return 56.+6.*sin(2.*a+.5)+4.*sin(5.*a+2.1)+2.*sin(11.*a+.3);}';
export const VOLC={x:-16,z:-20};export const TEMPLE={x:17,z:15};
const hash2=(x,z)=>{const s=Math.sin(x*127.1+z*311.7)*43758.5453;return s-Math.floor(s);};
export function vnoise(x,z){const ix=Math.floor(x),iz=Math.floor(z);let fx=x-ix,fz=z-iz;fx=fx*fx*(3-2*fx);fz=fz*fz*(3-2*fz);const a=hash2(ix,iz),b=hash2(ix+1,iz),c=hash2(ix,iz+1),d=hash2(ix+1,iz+1);return a+(b-a)*fx+(c-a)*fz+(a-b-c+d)*fx*fz;}
export function fbm(x,z,o=4){let s=0,a=.5;for(let i=0;i<o;i++){s+=a*vnoise(x,z);x=x*2.03+17.1;z=z*2.03+9.3;a*=.5;}return s;}
const sstep=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
export function islandD(x,z){return Math.hypot(x,z)/shoreR(Math.atan2(z,x));}
export function iceF(){return 0;}
const RIV=[.35,1.45,2.6,-1.0];
// lava rivers radiating from the volcano, meandering; 1 = inside lava
export function lavaF(x,z){const dx=x-VOLC.x,dz=z-VOLC.z,r=Math.hypot(dx,dz);if(r<4.2)return 1;if(r<9)return 0;if(islandD(x,z)>.93)return 0;const th=Math.atan2(dz,dx);let v=0;
 for(let k=0;k<RIV.length;k++){const c=RIV[k]+.32*Math.sin(r*.09+k*1.7)+.12*Math.sin(r*.23+k);let d=Math.atan2(Math.sin(th-c),Math.cos(th-c));d=Math.abs(d)*r;const w=1.1+r*.022;v=Math.max(v,1-sstep(w*.55,w,d));}
 return v*sstep(9,13,r);}
export function groundH(x,z){const d=islandD(x,z);if(d>=1)return Math.max(-(d-1)*16,-12);
 const inl=sstep(.97,.65,d);const dx=x-VOLC.x,dz=z-VOLC.z,r2=dx*dx+dz*dz,r=Math.sqrt(r2);
 let v=24*Math.exp(-r2/420)-14*Math.exp(-r2/22)+(fbm(x*.12,z*.12,3)-.5)*3*Math.exp(-r2/600);
 const base=Math.min((1-d)*8,2.2)+(fbm(x*.05,z*.05,4)-.5)*5*inl+(fbm(x*.21,z*.21,2)-.5)*.9*inl;
 const terr=Math.floor((base+3)/1.6)*1.6-3;const b2=base*.6+terr*.4*inl+.4*(1-inl);
 const t=Math.hypot(x-TEMPLE.x,z-TEMPLE.z),flat=sstep(13,8,t);
 return (b2*(1-flat)+1.8*flat)+v*sstep(.98,.7,d)-.9*lavaF(x,z);}
export function buildWorld(scene,MOBILE,renderer,opt={}){const LOWQ=!!opt.low;
 const solids=[],circles=[],boxes=[],updaters=[];const rnd=(a,b)=>a+Math.random()*(b-a);
 const fogU={fogColor:{value:FOG_COLOR},fogNear:{value:40},fogFar:{value:300}};
 // ---- sky: eerie purple-red dusk with stars ----
 const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,uniforms:{moon:{value:SUN_DIR},time:{value:0}},
  vertexShader:'varying vec3 vd;void main(){vd=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position.z=gl_Position.w;}',
  fragmentShader:`uniform vec3 moon;uniform float time;varying vec3 vd;float h(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
  float n3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}
  void main(){vec3 d=normalize(vd);float y=d.y;vec3 c=mix(vec3(.55,.13,.07),vec3(.15,.09,.16),smoothstep(-.02,.18,y));c=mix(c,vec3(.025,.055,.10),smoothstep(.15,.6,y));c=mix(c,vec3(.015,.012,.04),smoothstep(.55,1.,y));
   float lv=max(0.,dot(d,normalize(vec3(-.4,0.,-.6))));c+=vec3(.6,.15,.04)*pow(lv,6.)*(1.-smoothstep(0.,.35,y))*.8;
   float cl=n3(d*vec3(3.,9.,3.)+vec3(time*.01,0,0))*.6+n3(d*9.)*.4;float band=smoothstep(.45,.8,cl)*smoothstep(.02,.15,y)*(1.-smoothstep(.35,.6,y));c=mix(c,vec3(.12,.04,.08),band*.7);
   float md=dot(d,moon);c+=vec3(.6,.55,.8)*pow(max(md,0.),30.)*.25+vec3(.9,.7,.9)*pow(max(md,0.),300.)*.4;c+=vec3(.9,.9,1.)*band*pow(max(md,0.),8.)*.35;
   vec3 sp=floor(d*300.);float st=step(.997,h(sp))*smoothstep(.1,.4,y)*(1.-band)*(.6+.4*sin(time*3.+h(sp)*40.));c+=vec3(st);
   gl_FragColor=vec4(c,1.);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`});
 const sky=LOWQ?lowSky(0x172335,0x744339,new THREE.Vector3(-.4,0,-.6).normalize(),0x7a3a12,true):new THREE.Mesh(new THREE.SphereGeometry(4000,32,16),skyMat);scene.add(sky);updaters.push((t,cam)=>{sky.position.copy(cam.position);skyMat.uniforms.time.value=t;});
 if(!LOWQ){const pm=new THREE.PMREMGenerator(renderer);const es=new THREE.Scene();const s2=new THREE.Mesh(new THREE.SphereGeometry(50,32,16),skyMat);es.add(s2);
  es.add(new THREE.Mesh(new THREE.PlaneGeometry(200,200).rotateX(-Math.PI/2).translate(0,-2,0),new THREE.MeshBasicMaterial({color:0x3a1208})));
  scene.environment=pm.fromScene(es,0,.1,200).texture;pm.dispose();}
 const glowTex=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');const gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.3,'rgba(255,255,255,.35)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);})();
 // moon
 {const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');const gr=g.createRadialGradient(128,128,40,128,128,128);gr.addColorStop(0,'rgba(220,210,255,.5)');gr.addColorStop(1,'rgba(160,120,220,0)');g.fillStyle=gr;g.fillRect(0,0,256,256);
  g.fillStyle='#f3ecff';g.beginPath();g.arc(128,128,40,0,7);g.fill();for(let i=0;i<14;i++){g.fillStyle=`rgba(150,140,190,${.2+Math.random()*.3})`;g.beginPath();g.arc(100+Math.random()*56,100+Math.random()*56,3+Math.random()*9,0,7);g.fill();}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const moon=new THREE.Sprite(new THREE.SpriteMaterial({map:t,fog:false,depthWrite:false,transparent:true}));moon.material.color.setRGB(2,2,2.2);moon.scale.set(420,420,1);scene.add(moon);
  updaters.push((t2,cam)=>moon.position.copy(cam.position).addScaledVector(SUN_DIR,3000));}
 // dark clouds lit red from below (needed for freefall)
 const cloudTex=(seed,W,H)=>{const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');const img=g.createImageData(W,H);const dens=(u,v)=>{const e=((u-.5)/.5)**2+((v-.58)/.36)**2;return Math.max(0,fbm(u*5+seed,v*3.2+seed*1.7,5)*1.65-e*.95-.28);};
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const u=x/W,v=y/H,d=dens(u,v);const i=(y*W+x)*4;if(d<=0){img.data[i+3]=0;continue;}const below=v;
   img.data[i]=60+below*120;img.data[i+1]=35+below*30;img.data[i+2]=60+(1-below)*50;img.data[i+3]=Math.min(255,Math.pow(Math.min(1,d/.35),.8)*235);}
  g.putImageData(img,0,0);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;};
 const CW=MOBILE?96:192,CH=MOBILE?48:96;const cloudMats=[0,1,2].map(k=>new THREE.SpriteMaterial({map:cloudTex(k*5.1+2,CW,CH),transparent:true,opacity:.9,fog:false,depthWrite:false}));
 const NC=LOWQ?14:MOBILE?40:80;for(let i=0;i<NC;i++){const s=new THREE.Sprite(cloudMats[i%3]);const ca=rnd(0,6.28),cr=rnd(80,1300);s.position.set(Math.cos(ca)*cr,rnd(420,640),Math.sin(ca)*cr);const k=rnd(170,330);s.scale.set(k*2,k,1);scene.add(s);}
 updaters.push((t,cam)=>{const y=cam.position.y;const inside=y>380&&y<820;cloudMats.forEach(m=>m.opacity+=((inside?.45:.9)-m.opacity)*.08);});
 // ---- terrain ----
 const SEG=LOWQ?110:MOBILE?150:250,SZ=170;const tg=new THREE.PlaneGeometry(SZ,SZ,SEG,SEG);tg.rotateX(-Math.PI/2);const P=tg.attributes.position,lavA=new Float32Array(P.count);
 for(let i=0;i<P.count;i++){const x=P.getX(i),z=P.getZ(i);P.setY(i,groundH(x,z));lavA[i]=lavaF(x,z);}
 tg.setAttribute('lava',new THREE.BufferAttribute(lavA,1));tg.computeVertexNormals();
 const gm=new THREE.MeshStandardMaterial({roughness:.9,metalness:0});const gU={time:{value:0}};
 gm.onBeforeCompile=s=>{Object.assign(s.uniforms,gU);s.defines=s.defines||{};s.defines.OCT=MOBILE?2:4;
  s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nattribute float lava;varying float vLava;varying vec3 vWP;varying vec3 vWN;').replace('#include <begin_vertex>','#include <begin_vertex>\nvLava=lava;vWP=(modelMatrix*vec4(position,1.)).xyz;vWN=normalize(mat3(modelMatrix)*normal);');
  s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>
uniform float time;varying float vLava;varying vec3 vWP;varying vec3 vWN;float splatR;vec3 splatN;float lavaM;float crack;
float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbmS(vec2 p){float s=0.,a=.5;for(int i=0;i<OCT;i++){s+=a*vn(p);p=p*2.03+17.1;a*=.5;}return s;}`)
  .replace('#include <color_fragment>',`#include <color_fragment>
  {float h=vWP.y;float slope=1.-clamp(vWN.y,0.,1.);vec2 P=vWP.xz;float n1=fbmS(P*.08),n2=fbmS(P*.6),n3=vn(P*3.1);
  vec3 basalt=mix(vec3(.05,.045,.05),vec3(.14,.12,.13),n2)*(.75+.5*n3);vec3 ash=mix(vec3(.24,.22,.23),vec3(.34,.31,.3),n1)*(.85+.3*n3);
  vec3 moss=mix(vec3(.06,.1,.08),vec3(.1,.13,.16),n2);vec3 sand=vec3(.07,.065,.075)*(.8+.4*n3);
  vec3 c=mix(ash,moss,smoothstep(.45,.7,fbmS(P*.11+5.)));c=mix(c,basalt,smoothstep(.22,.42,slope+n2*.15));c=mix(c,sand,1.-smoothstep(.6,1.4+n2*.4,h));
  if(h<-.05)c=mix(sand,vec3(.05,.04,.08),clamp(-h/5.,0.,1.));
  vec2 cg=P*.9;vec2 ci=floor(cg);float md=1.;for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 o=vec2(float(i),float(j));vec2 pt=o+vec2(h21(ci+o),h21(ci+o+7.1));md=min(md,length(fract(cg)-pt));}
  crack=1.-smoothstep(.02,.07,abs(md-.55));
  lavaM=smoothstep(.35,.6,vLava+(n2-.5)*.25);float near=smoothstep(.02,.35,vLava);
  c=mix(c,vec3(.03,.02,.02),near*(1.-lavaM));diffuseColor.rgb=mix(c,vec3(.05,.02,.01),lavaM);
  splatR=mix(.92,.55,smoothstep(.3,.5,slope));
  float e=.06;splatN=vec3(fbmS(P*.6+vec2(e,0))-n2,0.,fbmS(P*.6+vec2(0,e))-n2)*(5.+slope*8.);}`)
  .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=splatR;')
  .replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nnormal=normalize(normal-(viewMatrix*vec4(splatN,0.)).xyz);')
  .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
  {vec2 P=vWP.xz;float fl=fbmS(P*.35+vec2(time*.12,-time*.08))+.5*vn(P*1.7-time*.3);vec3 hot=mix(vec3(1.,.25,.02),vec3(1.,.75,.2),smoothstep(.55,.95,fl));
   float crust=smoothstep(.55,.7,vn(P*.9+time*.05)+vn(P*2.3)*.4);vec3 lv=mix(hot*1.5,hot*.25,crust*.75);
   totalEmissiveRadiance+=lv*lavaM;float near=smoothstep(.0,.4,vLava)*(1.-lavaM);totalEmissiveRadiance+=vec3(1.,.3,.05)*(near*.35+crack*near*1.4);
  }`);};
 updaters.push(t=>gU.time.value=t);
 if(LOWQ){const col=new Float32Array(P.count*3),c=new THREE.Color(),N=tg.attributes.normal;
  for(let i=0;i<P.count;i++){const x=P.getX(i),z=P.getZ(i),h=P.getY(i),sl=1-N.getY(i),n=fbm(x*.08,z*.08,2);
   c.setRGB(.15+.1*n,.16+.09*n,.19+.09*n);if(fbm(x*.11+5,z*.11,2)>.55)c.setRGB(.055,.12,.12);if(sl>.25)c.setRGB(.07+.06*n,.075+.05*n,.10+.06*n);if(h<1.2)c.setRGB(.065,.075,.09);
   const lv=lavA[i];if(lv>.02)c.lerp(new THREE.Color(.04,.02,.01),Math.min(1,lv*2));col.set([c.r,c.g,c.b],i*3);}
  tg.setAttribute('color',new THREE.BufferAttribute(col,3));}
 const ground=new THREE.Mesh(tg,LOWQ?lowTerrainMat('lava','1.6,.55,.08',gU):gm);ground.receiveShadow=true;scene.add(ground);
 // ---- dark sea with moon glitter ----
 const water=new THREE.Mesh(new THREE.PlaneGeometry(30000,30000),LOWQ?lowWater(GL_SHORE,{time:{value:0},sunDir:{value:SUN_DIR},...fogU},'.015,.015,.04','.18,.06,.06','.8,.75,1.'):new THREE.ShaderMaterial({transparent:true,fog:false,uniforms:{time:{value:0},sunDir:{value:SUN_DIR},...fogU},
  vertexShader:'varying vec3 wp;void main(){vec4 w=modelMatrix*vec4(position,1.);wp=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
  fragmentShader:`uniform float time,fogNear,fogFar;uniform vec3 sunDir,fogColor;varying vec3 wp;${GL_SHORE}
  void main(){vec2 p=wp.xz;float a=atan(p.y,p.x);float d=length(p)/shoreR(a);float t=time;
   vec2 g=vec2(.8,.6)*cos(dot(p,vec2(.8,.6))*.35+t*1.1)*.5+vec2(-.5,.86)*cos(dot(p,vec2(-.5,.86))*.53+t*1.5)*.35+vec2(.2,-.98)*cos(dot(p,vec2(.2,-.98))*1.1+t*2.)*.2+vec2(.95,.3)*cos(dot(p,vec2(.95,.3))*2.3-t*2.6)*.12;
   float dist=length(cameraPosition-wp);float att=1./(1.+dist*.025);vec3 n=normalize(vec3(-g.x*.3*att,1.,-g.y*.3*att));vec3 v=normalize(cameraPosition-wp);
   vec3 col=mix(vec3(.04,.05,.09),vec3(.015,.015,.04),smoothstep(1.,1.6,d));col+=vec3(.25,.06,.02)*(1.-smoothstep(1.,1.25,d));
   vec3 rd=reflect(-v,n);float rh=max(rd.y,0.);vec3 sky=mix(vec3(.55,.14,.08),vec3(.2,.06,.18),smoothstep(0.,.2,rh));sky=mix(sky,vec3(.03,.02,.06),smoothstep(.2,.7,rh));
   float fr=.02+.98*pow(1.-max(dot(n,v),0.),5.);col=mix(col,sky,clamp(fr*.8,0.,.6));
   vec3 r=reflect(-sunDir,n);float sp=max(dot(r,v),0.);col+=vec3(.8,.75,1.)*(pow(sp,80.)*.8+pow(sp,900.)*5.);
   float wv=sin(t*1.2+a*30.)*.006;float f=(1.-smoothstep(1.,1.022+wv,d))*step(.995,d+.01)*(.5+.5*sin(p.x*2.1+t*2.));col=mix(col,vec3(.6,.5,.6),clamp(f,0.,1.)*.6);
   float al=mix(.8,1.,smoothstep(1.,1.15,d));col=mix(col,fogColor,smoothstep(fogNear*1.5,fogFar*2.,dist)*.8);gl_FragColor=vec4(col,max(al,f));
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`}));water.rotation.x=-Math.PI/2;water.position.y=.02;scene.add(water);updaters.push(t=>water.material.uniforms.time.value=t);
 // ---- placement ----
 const taken=[];const free=(r,dmax=.86,dmin=.1)=>{for(let k=0;k<300;k++){const a=rnd(0,6.283),R=shoreR(a)*Math.sqrt(rnd(dmin*dmin,dmax*dmax)),x=Math.cos(a)*R,z=Math.sin(a)*R;
  if(Math.hypot(x-VOLC.x,z-VOLC.z)<15||Math.hypot(x-TEMPLE.x,z-TEMPLE.z)<11||lavaF(x,z)>0.01||lavaF(x+r,z)>.01||lavaF(x-r,z)>.01||lavaF(x,z+r)>.01||lavaF(x,z-r)>.01)continue;if(taken.some(o=>Math.hypot(o.x-x,o.z-z)<o.r+r))continue;taken.push({x,z,r});return[x,z];}return null;};
 const m4=new THREE.Matrix4(),q=new THREE.Quaternion(),sc=new THREE.Vector3(),pv=new THREE.Vector3(),eu=new THREE.Euler();
 const setM=(im,i,x,y,z,ry,s,sy=s,rx=0,rz=0)=>{eu.set(rx,ry,rz);q.setFromEuler(eu);im.setMatrixAt(i,m4.compose(pv.set(x,y,z),q,sc.set(s,sy,s)));};
 const noiseTex=(r,g2,b,sz=128,rep=2)=>{const c=document.createElement('canvas');c.width=c.height=sz;const g=c.getContext('2d');g.fillStyle=`rgb(${r},${g2},${b})`;g.fillRect(0,0,sz,sz);
  for(let i=0;i<sz*6;i++){const k=Math.random()*60-30;g.fillStyle=`rgba(${r+k},${g2+k},${b+k},.5)`;g.fillRect(Math.random()*sz,Math.random()*sz,1+Math.random()*4,1+Math.random()*4);}
  g.strokeStyle='rgba(0,0,0,.35)';for(let i=0;i<14;i++){g.lineWidth=Math.random()*1.5+.5;g.beginPath();let x=Math.random()*sz,y=Math.random()*sz;g.moveTo(x,y);for(let k=0;k<5;k++){x+=Math.random()*24-12;y+=Math.random()*24-12;g.lineTo(x,y);}g.stroke();}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rep,rep);t.colorSpace=THREE.SRGBColorSpace;return t;};
 // ---- basalt column clusters ----
 {const bt=noiseTex(74,80,91,128,1);const bm=new THREE.MeshStandardMaterial({map:bt,bumpMap:bt,bumpScale:.1,roughness:.88,metalness:.02,flatShading:true});
  const NCl=MOBILE?16:26,per=6;const im=new THREE.InstancedMesh(new THREE.CylinderGeometry(.55,.62,1,6),bm,NCl*per);let n=0;
  for(let c=0;c<NCl;c++){const p=free(2.6,.9,.2);if(!p)continue;const[x,z]=p;const base=groundH(x,z);circles.push({x,z,r:1.7});
   for(let k=0;k<per;k++){const a=k/per*6.28+rnd(-.3,.3),rr=k===0?0:rnd(.7,1.3),cx=x+Math.cos(a)*rr,cz=z+Math.sin(a)*rr,hh=k===0?rnd(3.5,6):rnd(1,4);setM(im,n++,cx,base+hh/2-.3,cz,rnd(0,1),rnd(.9,1.3),hh,rnd(-.06,.06),rnd(-.06,.06));}}
  im.count=n;im.castShadow=im.receiveShadow=true;scene.add(im);solids.push(im);
  const rk=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,1),bm,MOBILE?40:80);for(let i=0;i<rk.count;i++){const p=free(.8,.95,.15);if(!p){setM(rk,i,0,-50,0,0,.01);continue;}const s=rnd(.3,1);setM(rk,i,p[0],groundH(p[0],p[1])+s*.2,p[1],rnd(0,6),s,s*rnd(.5,.8));if(s>.7)circles.push({x:p[0],z:p[1],r:s*.9});}
  rk.castShadow=rk.receiveShadow=true;scene.add(rk);}
 // ---- ruined temple ----
 {const st=noiseTex(118,108,118,256,1);const sm=new THREE.MeshStandardMaterial({map:st,bumpMap:st,bumpScale:.12,roughness:.85,color:0xb0a0b8});const T0=TEMPLE,y0=groundH(T0.x,T0.z);
  const plat=new THREE.Mesh(new THREE.CylinderGeometry(9,9.6,.6,10),sm);plat.position.set(T0.x,y0-.05,T0.z);plat.receiveShadow=true;scene.add(plat);
  const col=new THREE.CylinderGeometry(.55,.62,1,14,4);{const p=col.attributes.position;for(let i=0;i<p.count;i++){const a=Math.atan2(p.getZ(i),p.getX(i));const k=1+.06*Math.cos(a*14);p.setX(i,p.getX(i)*k);p.setZ(i,p.getZ(i)*k);}col.computeVertexNormals();}
  const ring=10;for(let i=0;i<ring;i++){const a=i/ring*6.283,x=T0.x+Math.cos(a)*7,z=T0.z+Math.sin(a)*7;const broken=i%3===1,h=broken?rnd(1.2,3):6.5;
   const m=new THREE.Mesh(col,sm);m.scale.set(1,h,1);m.position.set(x,y0+.25+h/2,z);m.rotation.z=broken?rnd(-.08,.08):0;m.castShadow=m.receiveShadow=true;scene.add(m);solids.push(m);circles.push({x,z,r:.75});
   const cap=new THREE.Mesh(new THREE.BoxGeometry(1.5,.4,1.5),sm);cap.position.set(x,y0+.25+(broken?h:h+.2),z);if(!broken){cap.castShadow=true;scene.add(cap);}
   if(!broken&&i%3===0){const j=(i+1)%ring,b2=(i+2)%ring;}}
  for(const [i,j] of [[0,1],[3,4],[6,7]]){const a=i/ring*6.283,b=j/ring*6.283;const x1=T0.x+Math.cos(a)*7,z1=T0.z+Math.sin(a)*7,x2=T0.x+Math.cos(b)*7,z2=T0.z+Math.sin(b)*7;
   if(i===3)continue;const l=new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(x2-x1,z2-z1)+1.4,.7,1.2),sm);l.position.set((x1+x2)/2,y0+7.3,(z1+z2)/2);l.rotation.y=-Math.atan2(z2-z1,x2-x1);l.castShadow=true;scene.add(l);}
  const fallen=new THREE.Mesh(col,sm);fallen.scale.set(1,5,1);fallen.rotation.set(0,.6,Math.PI/2);fallen.position.set(T0.x+11,groundH(T0.x+11,T0.z-4)+.5,T0.z-4);fallen.castShadow=true;scene.add(fallen);solids.push(fallen);boxes.push({x:T0.x+11,z:T0.z-4,hx:2.2,hz:1.6});
  const alt=new THREE.Mesh(new THREE.BoxGeometry(2.2,1,1.4),sm);alt.position.set(T0.x,y0+.75,T0.z);alt.castShadow=true;scene.add(alt);solids.push(alt);boxes.push({x:T0.x,z:T0.z,hx:1.1,hz:.7});
  const cr=new THREE.Mesh(new THREE.OctahedronGeometry(.7,0),new THREE.MeshStandardMaterial({color:0x9a40ff,emissive:0x8a30ff,emissiveIntensity:1.6,roughness:.2,metalness:.3}));cr.scale.set(.7,1.4,.7);cr.position.set(T0.x,y0+2.4,T0.z);scene.add(cr);
  const cg=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:0xa050ff,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false}));cg.scale.set(6,6,1);cr.add(cg);cg.scale.set(5/.7,5/1.4,1);
  updaters.push(t=>{cr.rotation.y=t*.6;cr.position.y=y0+2.4+Math.sin(t*1.3)*.15;});}
 // ---- glowing mushrooms & crystals ----
 {const nCl=MOBILE?14:24,per=MOBILE?5:7,N=nCl*per;const stem=new THREE.InstancedMesh(new THREE.CylinderGeometry(.05,.08,1,6),new THREE.MeshStandardMaterial({color:0xd8d0c0,roughness:.7,emissive:0x3a2a40}),N);
  const capG=new THREE.SphereGeometry(.3,12,6,0,6.283,0,1.6);const capM=new THREE.MeshBasicMaterial({color:0xffffff});const caps=new THREE.InstancedMesh(capG,capM,N);
  const cols=[new THREE.Color(.2,1.6,1.4),new THREE.Color(1.5,.4,1.8),new THREE.Color(.5,1.,2.)];let n=0;const glows=[];
  for(let c=0;c<nCl;c++){const p=free(1.5,.88,.15);if(!p)continue;const cc=cols[c%3];
   for(let k=0;k<per;k++){const x=p[0]+rnd(-1.2,1.2),z=p[1]+rnd(-1.2,1.2),y=groundH(x,z),h=rnd(.2,.9),s=rnd(.5,1.4);setM(stem,n,x,y+h*s/2,z,0,s,h*s);setM(caps,n,x,y+h*s,z,rnd(0,6),s,s*.6);caps.setColorAt(n,cc);n++;}
   if(glows.length<(MOBILE?8:16)){const g=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:cc.clone().multiplyScalar(.5),blending:THREE.AdditiveBlending,transparent:true,depthWrite:false}));g.position.set(p[0],groundH(p[0],p[1])+.6,p[1]);g.scale.set(4,2.5,1);scene.add(g);glows.push(g);}}
  stem.count=caps.count=n;caps.instanceColor.needsUpdate=true;scene.add(stem,caps);
  updaters.push(t=>glows.forEach((g,i)=>g.material.opacity=.7+.3*Math.sin(t*1.5+i)));
  const cm=new THREE.MeshStandardMaterial({color:0x247f99,emissive:0x2e8d9a,emissiveIntensity:.55,roughness:.28,metalness:.2,flatShading:true});const cim=new THREE.InstancedMesh(new THREE.OctahedronGeometry(.4,0),cm,MOBILE?30:60);
  for(let i=0;i<cim.count;i++){const p=free(.6,.9,.2);if(!p){setM(cim,i,0,-50,0,0,.01);continue;}const s=rnd(.6,1.6);setM(cim,i,p[0],groundH(p[0],p[1])+s*.4,p[1],rnd(0,6),s*.7,s*2,rnd(-.3,.3),rnd(-.3,.3));}
  cim.castShadow=true;scene.add(cim);}
 // ---- dead charred trees ----
 {const tm=new THREE.MeshStandardMaterial({color:0x1a1412,roughness:.95});const parts=[];const NT=MOBILE?10:18;
  for(let i=0;i<NT;i++){const p=free(1.2,.85,.25);if(!p)continue;const[x,z]=p,y=groundH(x,z),h=rnd(3.5,6);const g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=rnd(0,6);scene.add(g);
   const tr=new THREE.Mesh(new THREE.CylinderGeometry(.08,.28,h,7),tm);tr.position.y=h/2;tr.rotation.z=rnd(-.15,.15);tr.castShadow=true;g.add(tr);solids.push(tr);circles.push({x,z,r:.4});
   for(let k=0;k<4;k++){const l=rnd(1,2.2);const b=new THREE.Mesh(new THREE.CylinderGeometry(.03,.09,l,5),tm);const a=k*1.6+rnd(0,.5);b.position.set(Math.cos(a)*l*.35,h*rnd(.55,.9),Math.sin(a)*l*.35);b.rotation.set(Math.sin(a)*.9,0,-Math.cos(a)*.9);b.castShadow=true;g.add(b);}}}
 // ---- volcano smoke + crater glow ----
 const vy=groundH(VOLC.x,VOLC.z);
 {const cg=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:0xff5a10,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,fog:false}));cg.position.set(VOLC.x,vy+6,VOLC.z);cg.scale.set(40,22,1);scene.add(cg);
  const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');const gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(60,45,55,.8)');gr.addColorStop(1,'rgba(40,30,40,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);
  const smT=new THREE.CanvasTexture(c);const sm=[];for(let i=0;i<(LOWQ?5:MOBILE?8:14);i++){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:smT,transparent:true,depthWrite:false,opacity:.7}));scene.add(s);sm.push({s,o:i/(MOBILE?8:14)});}
  updaters.push(t=>{cg.material.opacity=.75+.25*Math.sin(t*2.3)*Math.sin(t*.7);sm.forEach(o=>{const u=(t*.04+o.o)%1;o.s.position.set(VOLC.x+u*30+Math.sin(u*9+o.o*20)*3,vy+4+u*70,VOLC.z-u*12);const k=8+u*40;o.s.scale.set(k,k,1);o.s.material.opacity=.75*Math.sin(u*Math.PI);});});}
 // ---- ash (falling) and embers (rising) ----
 {const NA=LOWQ?90:MOBILE?260:700,ap=new Float32Array(NA*3);for(let i=0;i<NA;i++)ap.set([rnd(-30,30),rnd(0,25),rnd(-30,30)],i*3);const ag=new THREE.BufferGeometry();ag.setAttribute('position',new THREE.BufferAttribute(ap,3));
  const ash=new THREE.Points(ag,new THREE.PointsMaterial({size:.09,color:0xb8a8a8,transparent:true,opacity:.75,map:glowTex,depthWrite:false}));ash.frustumCulled=false;scene.add(ash);
  const NE=LOWQ?50:MOBILE?120:300,ep=new Float32Array(NE*3),ev=[];const lavaPts=[];for(let k=0;k<4000&&lavaPts.length<300;k++){const a=rnd(0,6.28),R=rnd(0,60),x=VOLC.x+Math.cos(a)*R,z=VOLC.z+Math.sin(a)*R;if(lavaF(x,z)>.6)lavaPts.push([x,z]);}
  const reset=i=>{const p=lavaPts[Math.random()*lavaPts.length|0]||[VOLC.x,VOLC.z];ep.set([p[0]+rnd(-1,1),groundH(p[0],p[1])+rnd(0,1),p[1]+rnd(-1,1)],i*3);ev[i]=[rnd(-.4,.4),rnd(.8,2.5),rnd(-.4,.4),rnd(2,5)];};
  for(let i=0;i<NE;i++){reset(i);ep[i*3+1]+=rnd(0,5);}const eg=new THREE.BufferGeometry();eg.setAttribute('position',new THREE.BufferAttribute(ep,3));
  const emb=new THREE.Points(eg,new THREE.PointsMaterial({size:.22,color:0xff8a30,map:glowTex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));emb.frustumCulled=false;scene.add(emb);
  let last=null;updaters.push((t,cam)=>{const dt=last===null?0:Math.max(0,Math.min(.05,t-last));last=t;if(!dt)return;const c=cam.position;for(let i=0;i<NA;i++){const b=i*3;ap[b+1]-=dt*(.6+(i%5)*.15);ap[b]+=Math.sin(t*.5+i)*dt*.4;
    let x=ap[b],y=ap[b+1],z=ap[b+2];if(y<c.y-8||Math.abs(x-c.x)>30||Math.abs(z-c.z)>30){ap[b]=c.x+rnd(-30,30);ap[b+1]=c.y+rnd(5,20);ap[b+2]=c.z+rnd(-30,30);}}ag.attributes.position.needsUpdate=true;
   for(let i=0;i<NE;i++){const v=ev[i];v[3]-=dt;if(v[3]<=0){reset(i);continue;}ep[i*3]+=v[0]*dt;ep[i*3+1]+=v[1]*dt;ep[i*3+2]+=v[2]*dt;}eg.attributes.position.needsUpdate=true;});}
 const expedition=expeditionScenery(scene,{ground,groundH,islandD,lavaF,iceF,circles,boxes,solids,ember:true,low:LOWQ});updaters.push((t,cam,motion)=>expedition.update(t,motion));
 const weather=createEncounterWeather(scene,{sky,water,fogColor:FOG_COLOR,sunDirection:SUN_DIR,lights:opt.lights,ember:true,low:LOWQ,cloudMaterials:cloudMats});
 scene.traverse(o=>{if(o.isMesh&&o!==ground&&o.material&&o.material.isMeshStandardMaterial)o.material.envMapIntensity=.45;});
 return{solids,circles,boxes,ground,water,fogU,lavaF,weather,setEncounter:weather.setEncounter,update(t,cam,motion=true){updaters.forEach(f=>f(t,cam,motion));weather.update(t,cam,motion);}};}
