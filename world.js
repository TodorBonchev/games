import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Sky } from 'three/addons/objects/Sky.js';
export const SUN_DIR=new THREE.Vector3(-.55,.1,-.8).normalize();
export const FOG_COLOR=new THREE.Color(0xd9a48c);
export const LIGHTS={hemi:[0xa8bce8,0x4a3c28,.7],rim:[0xffc8b0,.5],rimPos:[60,30,80],sun:[0xffa860,4.2],exp:.62,fog:[90,520],name:'PALM ISLE'};
export function lavaF(){return 0;}
export function shoreR(a){return 52+5*Math.sin(3*a)+4*Math.sin(5*a+1.3)+2.5*Math.sin(9*a+.7);}
const HILL={x:-24,z:-20},POND={x:-15,z:-9};
export const ICE_A=2.25;const angDiff=a=>Math.abs(Math.atan2(Math.sin(a),Math.cos(a)));
export const ICE_POND=(()=>{const R=shoreR(ICE_A)*.52;return{x:Math.cos(ICE_A)*R,z:Math.sin(ICE_A)*R};})();
export function iceF(x,z){const a=Math.atan2(z,x);const t=1-Math.min(1,Math.max(0,(angDiff(a-ICE_A)-.42)/.38));const d=Math.hypot(x,z)/shoreR(a);const k=Math.min(1,Math.max(0,(d-.12)/.25));const v=t*k;return v*v*(3-2*v);}
const hills=(x,z)=>1.6*Math.sin(x*.07)*Math.cos(z*.06)+1.1*Math.sin(x*.13+z*.09+1)+.6*Math.cos(z*.17-x*.05);
const hash2=(x,z)=>{const s=Math.sin(x*127.1+z*311.7)*43758.5453;return s-Math.floor(s);};
export function vnoise(x,z){const ix=Math.floor(x),iz=Math.floor(z);let fx=x-ix,fz=z-iz;fx=fx*fx*(3-2*fx);fz=fz*fz*(3-2*fz);const a=hash2(ix,iz),b=hash2(ix+1,iz),c=hash2(ix,iz+1),d=hash2(ix+1,iz+1);return a+(b-a)*fx+(c-a)*fz+(a-b-c+d)*fx*fz;}
export function fbm(x,z,o=4){let s=0,a=.5;for(let i=0;i<o;i++){s+=a*vnoise(x,z);x=x*2.03+17.1;z=z*2.03+9.3;a*=.5;}return s;}
const sstep=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
export function islandD(x,z){return Math.hypot(x,z)/shoreR(Math.atan2(z,x));}
export function groundH(x,z){const d=islandD(x,z);
 if(d<1){const inl=sstep(.95,.6,d);const dm2=(x-HILL.x)**2+(z-HILL.z)**2;const g=Math.exp(-dm2/240);
  const ridge=1-Math.abs(2*vnoise(x*.11,z*.11)-1);let m=g*(19+ridge*5)+Math.exp(-dm2/40)*4;const tt=m/3.2;m=m*.55+.45*3.2*(Math.floor(tt)+sstep(.45,1,tt-Math.floor(tt)));
  return Math.min((1-d)*9,2.4)+(hills(x,z)+1.5)*.8*inl+(fbm(x*.045,z*.045,4)-.5)*5.5*inl+(fbm(x*.18,z*.18,2)-.5)*.6*inl+m*sstep(.98,.75,d)-2.4*Math.exp(-((x-POND.x)**2+(z-POND.z)**2)/12)-1.6*Math.exp(-((x-ICE_POND.x)**2+(z-ICE_POND.z)**2)/22);}
 return Math.max(-(d-1)*16,-12);}
const GL_SHORE='float shoreR(float a){return 52.+5.*sin(3.*a)+4.*sin(5.*a+1.3)+2.5*sin(9.*a+.7);}';
export function buildWorld(scene,MOBILE,renderer){
 const solids=[],circles=[],boxes=[],updaters=[];const rnd=(a,b)=>a+Math.random()*(b-a);
 const fogU={fogColor:{value:FOG_COLOR},fogNear:{value:60},fogFar:{value:320}};
 // ---- sky (Preetham) + PMREM environment ----
 const setSky=s=>{const u=s.material.uniforms;u.turbidity.value=9;u.rayleigh.value=3;u.mieCoefficient.value=.006;u.mieDirectionalG.value=.86;u.sunPosition.value.copy(SUN_DIR);};
 const sky=new Sky();sky.scale.setScalar(4000);setSky(sky);scene.add(sky);updaters.push((t,cam)=>sky.position.copy(cam.position));
 {const pm=new THREE.PMREMGenerator(renderer);const es=new THREE.Scene();const s2=new Sky();s2.scale.setScalar(50);setSky(s2);es.add(s2);
  es.add(new THREE.Mesh(new THREE.PlaneGeometry(200,200).rotateX(-Math.PI/2).translate(0,-2,0),new THREE.MeshBasicMaterial({color:0x2a3a30})));
  scene.environment=pm.fromScene(es,0,.1,200).texture;pm.dispose();}
 // ---- clouds (sprites) ----
 const cc=document.createElement('canvas');cc.width=cc.height=128;const cg=cc.getContext('2d');
 for(let i=0;i<14;i++){const x=rnd(30,98),y=rnd(45,85),r=rnd(18,34);const gr=cg.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,'rgba(255,255,255,.9)');gr.addColorStop(1,'rgba(255,255,255,0)');cg.fillStyle=gr;cg.beginPath();cg.arc(x,y,r,0,7);cg.fill();}
 const ct=new THREE.CanvasTexture(cc);ct.colorSpace=THREE.SRGBColorSpace;
 const cloudTex=(seed,W,H)=>{const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');const img=g.createImageData(W,H);const dens=(u,v)=>{const e=((u-.5)/.5)**2+((v-.58)/.36)**2;return Math.max(0,fbm(u*5+seed,v*3.2+seed*1.7,5)*1.65-e*.95-.28);};
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const u=x/W,v=y/H,d=dens(u,v);const i=(y*W+x)*4;if(d<=0){img.data[i+3]=0;continue;}
   const du=dens(u-.035,v-.07);const lit=Math.max(0,Math.min(1,1-du*1.6))*.75+.25*(1-v);const rim=Math.max(0,1-d/.12)*(1-du*3)*.8;
   const r=110+lit*145+rim*60,gg=100+lit*125+rim*60,b=135+lit*85+rim*55;img.data[i]=Math.min(255,r);img.data[i+1]=Math.min(255,gg);img.data[i+2]=Math.min(255,b);img.data[i+3]=Math.min(255,Math.pow(Math.min(1,d/.35),.8)*240);}
  g.putImageData(img,0,0);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;};
 const CW=MOBILE?128:256,CH=MOBILE?64:128;const cloudMats=[0,1,2,3].map(k=>{const m=new THREE.SpriteMaterial({map:cloudTex(k*7.3+1,CW,CH),transparent:true,opacity:.95,fog:false,depthWrite:false});m.color.setRGB(2.1,1.75,1.6);return m;});
 const NC=MOBILE?50:110;for(let i=0;i<NC;i++){const s=new THREE.Sprite(cloudMats[i%4]);const low=i>=NC*.7,near=!low&&i<NC*.2,ca=rnd(0,6.28),cr=low?rnd(600,1600):near?rnd(90,220):rnd(220,1200);
  s.position.set(Math.cos(ca)*cr,low?rnd(110,260):rnd(430,650),Math.sin(ca)*cr);const k=low?rnd(160,320):rnd(170,340);s.scale.set(k*2,k,1);scene.add(s);}
 updaters.push((t,cam)=>{const y=cam.position.y;const inside=y>380&&y<820;cloudMats.forEach(m=>m.opacity+=((inside?.45:.95)-m.opacity)*.08);});
 {const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');const gr=g.createRadialGradient(64,64,0,64,64,64);gr.addColorStop(0,'rgba(255,240,200,1)');gr.addColorStop(.15,'rgba(255,190,120,.6)');gr.addColorStop(1,'rgba(255,140,80,0)');g.fillStyle=gr;g.fillRect(0,0,128,128);
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),blending:THREE.AdditiveBlending,fog:false,depthWrite:false,transparent:true,opacity:MOBILE?.6:.9}));glow.scale.set(300,300,1);glow.material.opacity=MOBILE?.35:.45;scene.add(glow);
  const rays=[];if(!MOBILE)for(let i=0;i<5;i++){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),color:0xffc890,blending:THREE.AdditiveBlending,fog:false,depthWrite:false,transparent:true,opacity:.12,rotation:-.6+i*.3}));s.scale.set(140,1600,1);scene.add(s);rays.push(s);}
  updaters.push((t,cam)=>rays.forEach((s,i)=>{s.position.copy(cam.position).addScaledVector(SUN_DIR,2950);s.material.opacity=.08+.04*Math.sin(t*.3+i);}));
  updaters.push((t,cam)=>glow.position.copy(cam.position).addScaledVector(SUN_DIR,3000));}
 // ---- terrain ----
 const SEG=MOBILE?150:250,SZ=170;const tg=new THREE.PlaneGeometry(SZ,SZ,SEG,SEG);tg.rotateX(-Math.PI/2);const P=tg.attributes.position,iceA=new Float32Array(P.count);
 for(let i=0;i<P.count;i++){const x=P.getX(i),z=P.getZ(i),h=groundH(x,z);P.setY(i,h);iceA[i]=h>-.3?iceF(x,z):0;}
 tg.setAttribute('ice',new THREE.BufferAttribute(iceA,1));tg.computeVertexNormals();
 const gm=new THREE.MeshStandardMaterial({roughness:.9,metalness:0});const gU={time:{value:0}};
 gm.onBeforeCompile=s=>{Object.assign(s.uniforms,gU);s.defines=s.defines||{};s.defines.OCT=MOBILE?2:4;
  s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nattribute float ice;varying float vIce;varying vec3 vWP;varying vec3 vWN;').replace('#include <begin_vertex>','#include <begin_vertex>\nvIce=ice;vWP=(modelMatrix*vec4(position,1.)).xyz;vWN=normalize(mat3(modelMatrix)*normal);');
  s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>
uniform float time;varying float vIce;varying vec3 vWP;varying vec3 vWN;float splatR;vec3 splatN;
float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbmS(vec2 p){float s=0.,a=.5;for(int i=0;i<OCT;i++){s+=a*vn(p);p=p*2.03+17.1;a*=.5;}return s;}`)
  .replace('#include <color_fragment>',`#include <color_fragment>
  {float h=vWP.y;float slope=1.-clamp(vWN.y,0.,1.);vec2 P=vWP.xz;float n1=fbmS(P*.08),n2=fbmS(P*.6),n3=vn(P*3.1);
  vec3 grass=mix(vec3(.10,.23,.04),vec3(.22,.33,.06),n1);grass=mix(grass,vec3(.33,.32,.12),smoothstep(.55,.75,n2)*.45);grass*=.82+.36*n3;
  vec3 dirt=vec3(.25,.17,.1)*(.8+.4*n2);vec3 sand=mix(vec3(.72,.6,.4),vec3(.85,.74,.54),n2)*(.92+.16*n3);vec3 wet=vec3(.45,.36,.24);
  float rs=vn(vec2(h*1.9+n1*2.,dot(P,vec2(.7,.7))*.18));vec3 rock=mix(vec3(.24,.22,.21),vec3(.47,.44,.4),rs)*(.75+.4*n3);
  vec3 snow=vec3(.9,.94,1.);vec3 icec=mix(vec3(.28,.52,.8),vec3(.5,.72,.92),n2);
  vec3 c=grass;c=mix(c,dirt,smoothstep(.56,.7,fbmS(P*.15+3.))*.75);
  float sandW=1.-smoothstep(.9,1.5+n2*.4,h);c=mix(c,sand,sandW);c=mix(c,wet,(1.-smoothstep(.0,.35,h))*.55);
  float rockW=smoothstep(.3,.5,slope+n2*.14-.07);c=mix(c,rock,rockW);
  float snowW=smoothstep(16.,19.,h+n1*3.)*(1.-smoothstep(.6,.85,slope));c=mix(c,snow,snowW);
  c=mix(c,icec,smoothstep(.1,.6,vIce));if(h<-.05)c=mix(sand,vec3(.4,.55,.48),clamp(-h/6.,0.,1.));
  diffuseColor.rgb=c;splatR=mix(mix(.95,.82,rockW),.22,max(vIce,snowW*.5));
  float e=.06;splatN=vec3(fbmS(P*.6+vec2(e,0))-n2,0.,fbmS(P*.6+vec2(0,e))-n2)*(1.-vIce)*(4.+rockW*10.);}`)
  .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=splatR;')
  .replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nnormal=normalize(normal-(viewMatrix*vec4(splatN,0.)).xyz);')
  .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
  if(vIce>.05){vec3 V=normalize(cameraPosition-vWP);float fr=pow(1.-abs(dot(V,normalize(vWN))),3.);float hs=h21(floor(vWP.xz*16.));float tw=step(.985,hs)*(.5+.5*sin(time*6.+hs*60.));totalEmissiveRadiance+=vIce*(vec3(.01,.03,.08)+vec3(.3,.55,1.)*fr*.2+vec3(1.)*tw*1.6);}`);};
 updaters.push(t=>gU.time.value=t);
 const ground=new THREE.Mesh(tg,gm);ground.receiveShadow=true;scene.add(ground);
 // ---- ocean ----
 const water=new THREE.Mesh(new THREE.PlaneGeometry(9000,9000),new THREE.ShaderMaterial({transparent:true,fog:false,
  uniforms:{time:{value:0},sunDir:{value:SUN_DIR},...fogU},
  vertexShader:'varying vec3 wp;void main(){vec4 w=modelMatrix*vec4(position,1.);wp=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
  fragmentShader:`uniform float time,fogNear,fogFar;uniform vec3 sunDir,fogColor;varying vec3 wp;${GL_SHORE}
  void main(){vec2 p=wp.xz;float a=atan(p.y,p.x);float d=length(p)/shoreR(a);float t=time;
   vec2 g=vec2(.8,.6)*cos(dot(p,vec2(.8,.6))*.35+t*1.3)*.5+vec2(-.5,.86)*cos(dot(p,vec2(-.5,.86))*.53+t*1.7)*.35+vec2(.2,-.98)*cos(dot(p,vec2(.2,-.98))*1.1+t*2.3)*.2+vec2(.95,.3)*cos(dot(p,vec2(.95,.3))*2.3-t*2.9)*.12;
   float dist=length(cameraPosition-wp);float att=1./(1.+dist*.025);vec3 n=normalize(vec3(-g.x*.28*att,1.,-g.y*.28*att));vec3 v=normalize(cameraPosition-wp);
   float sh=1.-smoothstep(1.,1.28,d);float ia=abs(atan(sin(a-2.25),cos(a-2.25)));float icew=(1.-smoothstep(.4,.8,ia))*(1.-smoothstep(1.,1.6,d));
   vec3 sand=vec3(.95,.85,.6);vec3 col=mix(vec3(.0,.7,.72),vec3(.0,.36,.6),smoothstep(1.02,1.3,d));col=mix(col,vec3(.0,.14,.34),smoothstep(1.25,2.1,d));col=mix(col,vec3(.0,.06,.2),smoothstep(2.1,7.,d));
   col=mix(col,sand*vec3(.7,1.,.92),sh*sh*.2);
   vec2 q=p*1.7;float ca=abs(sin(q.x+t*.9+sin(q.y*1.3+t*.6))+sin(q.y*1.1-t*.7+sin(q.x*.8-t*.5)));float cs=pow(max(0.,1.-ca*.55),6.)*sh;col+=vec3(.8,1.,.9)*cs*.3;
   col=mix(col,vec3(.55,.85,.95),icew*.45);vec3 rd=reflect(-v,n);float rh=max(rd.y,0.);vec3 sky=mix(vec3(1.,.55,.35),vec3(.5,.32,.55),smoothstep(0.,.3,rh));sky=mix(sky,vec3(.15,.2,.45),smoothstep(.3,.9,rh));
   float fr=.02+.98*pow(1.-max(dot(n,v),0.),5.);col=mix(col,sky,clamp(fr*.5,0.,.3));
   vec3 r=reflect(-sunDir,n);float sp=max(dot(r,v),0.);col+=vec3(1.,.75,.45)*(pow(sp,60.)*.9+pow(sp,700.)*6.);
   vec2 cell=floor(p*3.);float hsh=fract(sin(dot(cell,vec2(12.9898,78.233))+floor(t*6.)*.37)*43758.5);float path=pow(max(dot(normalize(vec3(sunDir.x,0.,sunDir.z)),normalize(vec3(-v.x,0.,-v.z))),0.),40.);
   col+=vec3(1.,.85,.6)*step(.985,hsh)*path*att*3.;
   float wv=sin(t*1.4+a*30.)*.006+sin(t*.9)*.01;float f=smoothstep(1.022+wv,1.0,d)*step(.995,d+.01);float st=.55+.45*sin(p.x*2.1+t*2.)*sin(p.y*2.3-t*1.6);
   f=max(f*st,smoothstep(1.075+wv,1.06+wv,d)*smoothstep(1.045+wv,1.06+wv,d)*.6);col=mix(col,vec3(1.),clamp(f,0.,1.)*.9);
   float al=mix(.72,1.,smoothstep(1.,1.18,d));
   col=mix(col,fogColor,smoothstep(fogNear*1.5,fogFar*2.,dist)*.75);gl_FragColor=vec4(col,max(al,f));
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`}));water.rotation.x=-Math.PI/2;water.position.y=.02;scene.add(water);
 updaters.push(t=>water.material.uniforms.time.value=t);
 // ---- placement helper ----
 const blobs=[],icicles=[];const taken=[];const free=(r,dmax=.86,dmin=0,minC=9)=>{for(let k=0;k<200;k++){const a=rnd(0,6.283),R=shoreR(a)*Math.sqrt(rnd(dmin*dmin,dmax*dmax)),x=Math.cos(a)*R,z=Math.sin(a)*R;
  if(Math.hypot(x,z)<minC)continue;if(Math.hypot(x-HILL.x,z-HILL.z)<17||Math.hypot(x-POND.x,z-POND.z)<5.5)continue;if(taken.some(o=>Math.hypot(o.x-x,o.z-z)<o.r+r))continue;taken.push({x,z,r});return[x,z];}return[rnd(-20,20),rnd(-20,20)];};
 const m4=new THREE.Matrix4(),q=new THREE.Quaternion(),sc=new THREE.Vector3(),pv=new THREE.Vector3(),eu=new THREE.Euler();
 const setM=(im,i,x,y,z,ry,s,sy=s,rx=0)=>{eu.set(rx,ry,0);q.setFromEuler(eu);im.setMatrixAt(i,m4.compose(pv.set(x,y,z),q,sc.set(s,sy,s)));};
 const glowTex=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');const gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.3,'rgba(255,255,255,.35)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);return new THREE.CanvasTexture(g.canvas);})();
 const ropeM=new THREE.MeshLambertMaterial({color:0xc9a66b});
 const ropes=(g,y0)=>{for(const[sx,sz] of[[-1.7,-1.7],[1.7,-1.7],[-1.7,1.7],[1.7,1.7]])for(const dy of[.6,.95]){const r=new THREE.Mesh(new THREE.TorusGeometry(.15,.035,5,10),ropeM);r.rotation.x=Math.PI/2;r.position.set(sx,y0+dy,sz);g.add(r);}
  const rp=new THREE.Mesh(new THREE.CylinderGeometry(.015,.015,.6,4),ropeM);rp.position.set(1.3,y0+3.35,1.9);g.add(rp);
  const fr=new THREE.Mesh(new THREE.BoxGeometry(.32,.38,.32),new THREE.MeshLambertMaterial({color:0x3a2a1a,wireframe:true}));fr.position.set(1.3,y0+2.9,1.9);g.add(fr);};
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
  {const lp=new THREE.Vector3(1.3,y0+2.9,1.9);const lan=add(new THREE.SphereGeometry(.16,10,8),new THREE.MeshBasicMaterial({color:0xffc060}),g,lp.x,lp.y,lp.z,false);
   const gl=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:0xffa040,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false}));gl.scale.set(2.2,2.2,1);gl.position.copy(lp);g.add(gl);
   if(!MOBILE){const pl=new THREE.PointLight(0xff9a40,6,9,1.6);pl.position.copy(lp);g.add(pl);updaters.push(t=>{pl.intensity=5+Math.sin(t*9+x)*.8+Math.sin(t*23+z)*.4;});}
   updaters.push(t=>{gl.material.opacity=.75+Math.sin(t*9+x)*.15;});}
  circles.push({x,z,r:2.6});blobs.push([x,z,5.5]);ropes(g,y0);}
 // ---- pier ----
 {const a0=.95,r0=shoreR(a0)*.92,dx=Math.cos(a0),dz=Math.sin(a0);const g=new THREE.Group();g.position.set(dx*r0,0,dz*r0);g.rotation.y=Math.atan2(dx,dz);scene.add(g);
  add(new THREE.BoxGeometry(2.2,.15,18),wood,g,0,.75,9);for(let k=0;k<10;k++)for(const s of[-1,1])add(new THREE.CylinderGeometry(.11,.11,4,6),wood,g,s*1.05,-1,k*2);}
 // ---- palms (instanced) ----
 const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(0,0,0),new THREE.Vector3(.3,3.5,0),new THREE.Vector3(1.6,6.6,0));
 const ringT=(()=>{const c=document.createElement('canvas');c.width=8;c.height=64;const g=c.getContext('2d');for(let i=0;i<8;i++){g.fillStyle=i%2?'#8b6a43':'#a5825a';g.fillRect(0,i*8,8,8);}const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(8,1);t.rotation=Math.PI/2;t.colorSpace=THREE.SRGBColorSpace;return t;})();
 const trunkG=mergeGeometries([new THREE.TubeGeometry(curve,10,.2,7),...[0,1,2].map(k=>new THREE.SphereGeometry(.2,8,6).translate(1.6+Math.cos(k*2.1)*.25,6.35,Math.sin(k*2.1)*.25))]);
 const frond=()=>{const S=8,L=3.6,pos=[],idx=[],uv=[];for(let i=0;i<=S;i++){const t=i/S,x=t*L,y=.9*t-1.9*t*t,w=.75*Math.sin(Math.PI*Math.min(1,t*1.05+.06))+.06;pos.push(x,y-.05,-w,x,y+.1,0,x,y-.05,w);uv.push(0,t,.5,t,1,t);}
  for(let i=0;i<S;i++){const b=i*3;idx.push(b,b+1,b+3,b+1,b+4,b+3,b+1,b+2,b+4,b+2,b+5,b+4);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;};
 const frondTex=(()=>{const c=document.createElement('canvas');c.width=128;c.height=512;const g=c.getContext('2d');g.lineCap='round';
  for(let y=8;y<500;y+=7){const L=58*Math.sin(Math.PI*Math.min(1,y/500*1.05+.05));for(const s of[-1,1]){g.strokeStyle=`hsl(${80+Math.random()*30},${12+Math.random()*10}%,${58+Math.random()*28}%)`;g.lineWidth=5;g.beginPath();g.moveTo(64,y);g.quadraticCurveTo(64+s*L*.5,y+6,64+s*L,y+18);g.stroke();}}
  g.strokeStyle='#6b5a2a';g.lineWidth=4;g.beginPath();g.moveTo(64,0);g.lineTo(64,512);g.stroke();const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;})();
 const frondG=mergeGeometries([...Array(9)].map((_,k)=>frond().rotateZ(rnd(-.25,.15)).rotateY(k*Math.PI*2/9+rnd(-.15,.15)).translate(1.6,6.6,0)));
 const NP=MOBILE?40:70;const trunks=new THREE.InstancedMesh(trunkG,new THREE.MeshLambertMaterial({map:ringT}),NP),fronds=new THREE.InstancedMesh(frondG,new THREE.MeshStandardMaterial({map:frondTex,alphaTest:.45,side:THREE.DoubleSide,roughness:.7}),NP);
 trunks.castShadow=fronds.castShadow=true;fronds.receiveShadow=true;const fc=new THREE.Color();
 for(let i=0;i<NP;i++){const beach=i<NP*.45;const[x,z]=free(.9,beach?.95:.8,beach?.8:.2,6);const y=groundH(x,z)-.1,ry=rnd(0,6.28),s=rnd(.8,1.25);setM(trunks,i,x,y,z,ry,s);setM(fronds,i,x,y,z,ry,s);
  const fi=iceF(x,z);fronds.setColorAt(i,fi>.5?fc.setHSL(.55,.55,.82):fc.setHSL(rnd(.22,.3),rnd(.55,.8),rnd(.22,.34)));trunks.setColorAt(i,fi>.5?fc.setHSL(.57,.4,.78):fc.setHSL(rnd(.06,.1),rnd(.2,.4),rnd(.6,.9)));circles.push({x,z,r:.45});blobs.push([x,z,1.6*s]);
  if(fi>.5)for(let k=0;k<9;k++){const a=k*Math.PI*2/9-ry,tx=x+(Math.cos(-ry)*1.6+Math.cos(a)*1.9)*s,tz=z+(Math.sin(-ry)*1.6+Math.sin(a)*1.9)*s;icicles.push([tx,y+6.4*s,tz,rnd(.3,.7)]);}}
 scene.add(trunks,fronds);solids.push(trunks);
 // ---- bushes & flowers ----
 const NB=MOBILE?70:130,NF=MOBILE?110:220;const leafTex=(()=>{const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');for(let i=0;i<70;i++){const a=rnd(0,6.28),r=rnd(10,100),x=128+Math.cos(a)*r,y=150+Math.sin(a)*r*.7-r*.2;g.save();g.translate(x,y);g.rotate(a+rnd(-.5,.5));g.fillStyle=`hsl(${80+rnd(0,30)},${10+rnd(0,12)}%,${55+rnd(0,30)}%)`;g.beginPath();g.ellipse(0,0,rnd(14,22),rnd(6,9),0,0,7);g.fill();g.restore();}const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;})();
 const bushG=mergeGeometries([0,1,2].map(k=>new THREE.PlaneGeometry(2.2,1.8).translate(0,.7,0).rotateY(k*Math.PI/3)));
 const bush=new THREE.InstancedMesh(bushG,new THREE.MeshStandardMaterial({map:leafTex,alphaTest:.5,side:THREE.DoubleSide,roughness:.75}),NB),flw=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.18,0),new THREE.MeshLambertMaterial({emissive:0x221111}),NF);
 bush.receiveShadow=true;const bp=[];
 for(let i=0;i<NB;i++){const[x,z]=free(.6,.85,.1,5);bp.push([x,z]);setM(bush,i,x,groundH(x,z)-.15,z,rnd(0,6),rnd(.6,1.2),rnd(.7,1.1));{const fi=iceF(x,z);bush.setColorAt(i,fi>.4?fc.setHSL(.55,rnd(.45,.6),rnd(.75,.85)):fc.setHSL(rnd(.22,.32),rnd(.5,.75),rnd(.2,.32)));}blobs.push([x,z,1.4]);}
 const pal=[0xff4f7b,0xffd23f,0xff7a2f,0xd94fff,0xffffff,0xff2d55];
 for(let i=0;i<NF;i++){const b=bp[i%NB];const x=b[0]+rnd(-1.4,1.4),z=b[1]+rnd(-1.4,1.4);setM(flw,i,x,groundH(x,z)+rnd(.4,.8),z,rnd(0,6),rnd(.8,1.4));flw.setColorAt(i,iceF(x,z)>.4?fc.setHex(i%2?0xbfe8ff:0xffffff):fc.setHex(pal[i%pal.length]));}
 scene.add(bush,flw);
 // ---- rocks ----
 const NR=MOBILE?22:34;const rockG=new THREE.IcosahedronGeometry(1,MOBILE?2:3);{const p=rockG.attributes.position,v=new THREE.Vector3();for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);const k=1+(fbm(v.x*1.3+5,v.z*1.3+v.y*1.7,4)-.5)*.7;v.multiplyScalar(k);v.y=Math.max(v.y,-.3);p.setXYZ(i,v.x,v.y,v.z);}rockG.computeVertexNormals();}
 const rocks=new THREE.InstancedMesh(rockG,new THREE.MeshStandardMaterial({roughness:.88,metalness:0}),NR);rocks.castShadow=rocks.receiveShadow=true;
 for(let i=0;i<NR;i++){let x,z,s;if(i<8){const a=i/8*6.28;x=POND.x+Math.cos(a)*4.6;z=POND.z+Math.sin(a)*4.6;s=rnd(.6,1.1);}else{[x,z]=free(1.4,.97,.3,7);s=rnd(.5,1.6);}
  setM(rocks,i,x,groundH(x,z)+s*.2,z,rnd(0,6),s,s*rnd(.6,.9),rnd(0,1));rocks.setColorAt(i,iceF(x,z)>.4?fc.setHSL(.56,rnd(.45,.65),rnd(.72,.84)):fc.setHSL(.08,rnd(.04,.12),rnd(.32,.48)));circles.push({x,z,r:s*.85});blobs.push([x,z,s*1.9]);}
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
 for(let i=0;i<12;i++){const[x,z]=free(1.6,.85,.15,7);const s=rnd(1,1.6);const m=add(new THREE.BoxGeometry(s,s,s),crM,scene,x,groundH(x,z)+s/2-.05,z);solids.push(m);boxes.push({x,z,hx:s/2,hz:s/2});blobs.push([x,z,s*1.5]);}
 // ================= ICE ZONE =================
 const icy=(n)=>{const out=[];for(let k=0;k<400&&out.length<n;k++){const a=ICE_A+rnd(-.75,.75),R=shoreR(a)*rnd(.3,.9),x=Math.cos(a)*R,z=Math.sin(a)*R;if(iceF(x,z)<.6)continue;if(Math.hypot(x-ICE_POND.x,z-ICE_POND.z)<6)continue;if(taken.some(o=>Math.hypot(o.x-x,o.z-z)<o.r+1.2))continue;taken.push({x,z,r:1.4});out.push([x,z]);}return out;};
 const iceMat=MOBILE?new THREE.MeshStandardMaterial({color:0xcdeeff,emissive:0x2a6fa8,emissiveIntensity:.6,roughness:.08,metalness:.1,transparent:true,opacity:.82,flatShading:true}):new THREE.MeshPhysicalMaterial({color:0xbfe8ff,emissive:0x2a6fa8,emissiveIntensity:.45,roughness:.05,metalness:0,transmission:.7,thickness:.8,ior:1.31,flatShading:true,envMapIntensity:1.5});
 const clusters=icy(MOBILE?12:20);const NS=clusters.length*5;const spikes=new THREE.InstancedMesh(new THREE.ConeGeometry(.35,1,5),iceMat,NS);spikes.castShadow=true;let si=0;
 for(const[cx,cz] of clusters){const gy=groundH(cx,cz);for(let k=0;k<5;k++){const h=k?rnd(.8,2.2):rnd(2.2,3.6),ox=k?rnd(-.7,.7):0,oz=k?rnd(-.7,.7):0;eu.set(rnd(-.35,.35)+(k?ox*.4:0),rnd(0,6),rnd(-.35,.35)-(k?oz*.4:0));q.setFromEuler(eu);
   spikes.setMatrixAt(si,m4.compose(pv.set(cx+ox,gy+h*.42,cz+oz),q,sc.set(rnd(.7,1.3),h,rnd(.7,1.3))));spikes.setColorAt(si,fc.setHSL(rnd(.53,.58),rnd(.5,.9),rnd(.78,.95)));si++;}circles.push({x:cx,z:cz,r:1});blobs.push([cx,cz,2.6]);}
 scene.add(spikes);solids.push(spikes);
 // icicles under frozen palm fronds
 if(icicles.length){const ic=new THREE.InstancedMesh(new THREE.ConeGeometry(.06,1,4).rotateX(Math.PI),iceMat,icicles.length);icicles.forEach((p,i)=>{setM(ic,i,p[0],p[1]-p[3]*.5,p[2],0,1,p[3]);});scene.add(ic);}
 // frozen pond (ice sheet with cracks)
 {let iy=99;for(let k=0;k<16;k++){const a=k/16*6.28;iy=Math.min(iy,groundH(ICE_POND.x+Math.cos(a)*5,ICE_POND.z+Math.sin(a)*5));}
  const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');const gr=g.createRadialGradient(128,128,10,128,128,128);gr.addColorStop(0,'#bfe8ff');gr.addColorStop(1,'#e8f7ff');g.fillStyle=gr;g.fillRect(0,0,256,256);
  g.strokeStyle='rgba(255,255,255,.9)';g.lineWidth=1.5;for(let i=0;i<14;i++){g.beginPath();let x=128,y=128,a=rnd(0,6.28);g.moveTo(x,y);for(let k=0;k<6;k++){a+=rnd(-.6,.6);x+=Math.cos(a)*22;y+=Math.sin(a)*22;g.lineTo(x,y);}g.stroke();}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const sheet=new THREE.Mesh(new THREE.CircleGeometry(5.3,40),new THREE.MeshStandardMaterial({map:t,roughness:.05,metalness:.3,emissive:0x1d4f78,emissiveIntensity:.25}));
  sheet.rotation.x=-Math.PI/2;sheet.position.set(ICE_POND.x,iy-.05,ICE_POND.z);sheet.receiveShadow=true;scene.add(sheet);}
 // ice floes in the water off the ice coast
 {const fl=[];const NFl=MOBILE?7:12;const fim=new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1.1,.35,7),new THREE.MeshStandardMaterial({color:0xd2efff,emissive:0x3a7fb8,emissiveIntensity:.45,roughness:.25,flatShading:true}),NFl);
  for(let i=0;i<NFl;i++){const a=ICE_A+rnd(-.5,.5),R=shoreR(a)*rnd(1.06,1.4);fl.push([Math.cos(a)*R,Math.sin(a)*R,rnd(.8,2.6),rnd(0,6)]);}
  scene.add(fim);updaters.push(t=>{fl.forEach((f,i)=>{setM(fim,i,f[0],.05+Math.sin(t*1.2+f[3])*.06,f[1],f[3]+t*.02,f[2],1,Math.sin(t+f[3])*.04);});fim.instanceMatrix.needsUpdate=true;});}
 // snow / frost particles
 {const N=MOBILE?160:380,pos=new Float32Array(N*3),seed=[];const box=()=>{const a=ICE_A+rnd(-.7,.7),R=shoreR(a)*rnd(.25,1.05);return[Math.cos(a)*R,rnd(0,14),Math.sin(a)*R];};
  for(let i=0;i<N;i++){const b=box();pos.set(b,i*3);seed.push(rnd(0,6));}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const sn=new THREE.Points(geo,new THREE.PointsMaterial({map:glowTex,color:0xffffff,size:.28,transparent:true,opacity:.9,depthWrite:false}));sn.frustumCulled=false;scene.add(sn);
  updaters.push((t)=>{for(let i=0;i<N;i++){pos[i*3+1]-=.025;pos[i*3]+=Math.sin(t+seed[i])*.012;pos[i*3+2]+=Math.cos(t*.8+seed[i])*.012;if(pos[i*3+1]<groundH(pos[i*3],pos[i*3+2])){const b=box();pos[i*3]=b[0];pos[i*3+1]=14;pos[i*3+2]=b[2];}}geo.attributes.position.needsUpdate=true;});}
 // cool blue glow / lights
 for(let i=0;i<(MOBILE?3:4);i++){const[cx,cz]=clusters[i]||[ICE_POND.x,ICE_POND.z];const y=groundH(cx,cz)+1.6;const s=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:0x66c8ff,blending:THREE.AdditiveBlending,transparent:true,opacity:.55,depthWrite:false}));s.scale.set(5,5,1);s.position.set(cx,y,cz);scene.add(s);
  if(!MOBILE&&i<3){const pl=new THREE.PointLight(0x7fd0ff,10,14,1.5);pl.position.set(cx,y,cz);scene.add(pl);}updaters.push(t=>s.material.opacity=.45+.15*Math.sin(t*1.5+i));}
 // ================= DETAILS =================
 const onBeach=()=>{for(let k=0;k<50;k++){const a=rnd(0,6.28),R=shoreR(a)*rnd(.86,.98),x=Math.cos(a)*R,z=Math.sin(a)*R,h=groundH(x,z);if(h>.15&&h<.95&&iceF(x,z)<.3)return[x,z];}return[0,0];};
 // wind-swaying grass blades (instanced)
 {const bg=new THREE.PlaneGeometry(.07,.55,1,3).translate(0,.27,0);{const p=bg.attributes.position;for(let i=0;i<p.count;i++){const y=p.getY(i)/.55;p.setX(i,p.getX(i)*(1-y*.9));}}
  const gU2={time:{value:0}};const gmB=new THREE.MeshStandardMaterial({side:THREE.DoubleSide,roughness:.8});
  gmB.onBeforeCompile=s=>{Object.assign(s.uniforms,gU2);s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nuniform float time;').replace('#include <begin_vertex>',`#include <begin_vertex>
   float hh=position.y/.55;vec4 ip=instanceMatrix[3];float wv=sin(time*1.8+ip.x*.35+ip.z*.25)*.6+sin(time*3.1+ip.x*.9)*.25;transformed.x+=wv*hh*hh*.18;transformed.z+=wv*hh*hh*.08;`);};
  updaters.push(t=>gU2.time.value=t);
  const NT=MOBILE?2600:9000;const tm=new THREE.InstancedMesh(bg,gmB,NT);let n=0;
  for(let k=0;k<NT*3&&n<NT;k++){const a=rnd(0,6.28),R=shoreR(a)*Math.sqrt(rnd(.01,.82)),cx=Math.cos(a)*R,cz=Math.sin(a)*R,h=groundH(cx,cz);if(h<1.3||h>14||iceF(cx,cz)>.3)continue;
   const sl=Math.abs(groundH(cx+.8,cz)-h)+Math.abs(groundH(cx,cz+.8)-h);if(sl>.5)continue;
   for(let j=0;j<6&&n<NT;j++){const x=cx+rnd(-.35,.35),z=cz+rnd(-.35,.35);eu.set(rnd(-.25,.25),rnd(0,6.28),rnd(-.25,.25));q.setFromEuler(eu);tm.setMatrixAt(n,m4.compose(pv.set(x,groundH(x,z)-.03,z),q,sc.set(1,rnd(.6,1.5),1)));
    tm.setColorAt(n,fc.setRGB(rnd(.12,.22),rnd(.28,.42),rnd(.04,.08)));n++;}}tm.count=n;scene.add(tm);}
 // pebbles, shells, starfish, drift logs
 {const NPb=MOBILE?70:160;const pb=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.1,0),new THREE.MeshLambertMaterial({flatShading:true}),NPb);
  for(let i=0;i<NPb;i++){const[x,z]=onBeach();setM(pb,i,x,groundH(x,z)+.02,z,rnd(0,6),rnd(.5,1.4),rnd(.4,.8));pb.setColorAt(i,fc.setHSL(rnd(.05,.12),rnd(.05,.25),rnd(.45,.8)));}scene.add(pb);
  const sh=new THREE.InstancedMesh(new THREE.SphereGeometry(.14,10,6,0,Math.PI*2,0,Math.PI/2),new THREE.MeshLambertMaterial(),MOBILE?20:40);
  for(let i=0;i<sh.count;i++){const[x,z]=onBeach();setM(sh,i,x,groundH(x,z),z,rnd(0,6),rnd(.7,1.2),.5);sh.setColorAt(i,fc.setHex([0xffe8d6,0xffc4c4,0xfff4e0,0xf7d0a8][i%4]));}scene.add(sh);
  const st=new THREE.Shape();for(let k=0;k<10;k++){const r=k%2?.07:.2,a=k/10*Math.PI*2;k?st.lineTo(Math.cos(a)*r,Math.sin(a)*r):st.moveTo(r,0);}
  const sf=new THREE.InstancedMesh(new THREE.ExtrudeGeometry(st,{depth:.04,bevelEnabled:true,bevelSize:.02,bevelThickness:.02,bevelSegments:1}).rotateX(-Math.PI/2),new THREE.MeshLambertMaterial(),MOBILE?12:24);
  for(let i=0;i<sf.count;i++){const[x,z]=onBeach();setM(sf,i,x,groundH(x,z)+.03,z,rnd(0,6),rnd(.8,1.3));sf.setColorAt(i,fc.setHex([0xff7a3d,0xff5a6e,0xffb13d,0xd9558a][i%4]));}scene.add(sf);
  const logM=new THREE.MeshLambertMaterial({color:0x9a7a5a});for(let i=0;i<(MOBILE?4:7);i++){const[x,z]=onBeach();const l=new THREE.Mesh(new THREE.CylinderGeometry(.18,.22,rnd(2,3.5),8),logM);l.rotation.set(Math.PI/2,0,rnd(0,6));l.position.set(x,groundH(x,z)+.15,z);l.castShadow=true;scene.add(l);blobs.push([x,z,2.5]);}}
 // campfire
 {let x,z;for(let k=0;k<30;k++){[x,z]=free(2,.6,.25,6);if(iceF(x,z)<.15)break;}const y=groundH(x,z);const g=new THREE.Group();g.position.set(x,y,z);scene.add(g);
  for(let k=0;k<8;k++){const a=k/8*6.28;const s=new THREE.Mesh(new THREE.DodecahedronGeometry(.22,0),new THREE.MeshLambertMaterial({color:0x8a8580,flatShading:true}));s.position.set(Math.cos(a)*.75,.08,Math.sin(a)*.75);g.add(s);}
  for(let k=0;k<4;k++){const l=new THREE.Mesh(new THREE.CylinderGeometry(.08,.09,1.1,6),new THREE.MeshLambertMaterial({color:0x4a2e1a}));l.rotation.set(Math.PI/2-.35,k*Math.PI/2,0);l.position.set(Math.cos(k*Math.PI/2)*.25,.25,Math.sin(k*Math.PI/2)*.25);l.lookAt(0,.6,0);g.add(l);}
  const flames=[0xffd040,0xff8a20,0xff5010].map((c,k)=>{const s=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:c,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false}));s.position.y=.5+k*.15;g.add(s);return s;});
  const NSm=MOBILE?14:28,sp=new Float32Array(NSm*3),sa=[];for(let i=0;i<NSm;i++){sa.push(rnd(0,4));}const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.BufferAttribute(sp,3));
  const smoke=new THREE.Points(sg,new THREE.PointsMaterial({map:glowTex,color:0x8a8078,size:1.2,transparent:true,opacity:.35,depthWrite:false}));smoke.frustumCulled=false;g.add(smoke);
  const fl=new THREE.PointLight(0xff8a30,12,14,1.5);fl.position.y=1;fl.castShadow=false;g.add(fl);circles.push({x,z,r:1});blobs.push([x,z,2.2]);
  updaters.push(t=>{flames.forEach((s,k)=>{const f=1+Math.sin(t*(11+k*3))*.15+Math.sin(t*23+k)*.1;s.scale.set((1.4-k*.3)*f,(1.9-k*.3)*f*1.2,1);});fl.intensity=10+Math.sin(t*13)*2+Math.sin(t*31)*1.2;
   for(let i=0;i<NSm;i++){const u=(t*.35+sa[i])%4/4;sp[i*3]=Math.sin(sa[i]*7+u*4)*.3*u*3;sp[i*3+1]=1+u*5;sp[i*3+2]=Math.cos(sa[i]*5+u*3)*.3*u*3;}sg.attributes.position.needsUpdate=true;});}
 // fake AO contact blobs
 {const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');const gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(0,0,0,.55)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);
  const bm=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}),blobs.length);
  blobs.forEach((b,i)=>setM(bm,i,b[0],groundH(b[0],b[1])+.04,b[1],0,b[2]));bm.renderOrder=1;scene.add(bm);}
 {const NFF=MOBILE?40:90,pos=new Float32Array(NFF*3),base=[];for(let i=0;i<NFF;i++){const a=rnd(0,6.28),R=shoreR(a)*rnd(.1,.8),x=Math.cos(a)*R,z=Math.sin(a)*R;base.push([x,groundH(x,z)+rnd(.5,2.5),z,rnd(0,6)]);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));const ff=new THREE.Points(geo,new THREE.PointsMaterial({map:glowTex,color:0xfff08a,size:.45,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));ff.frustumCulled=false;scene.add(ff);
  updaters.push(t=>{for(let i=0;i<NFF;i++){const b=base[i];pos[i*3]=b[0]+Math.sin(t*.5+b[3])*1.2;pos[i*3+1]=b[1]+Math.sin(t*.9+b[3]*2)*.4;pos[i*3+2]=b[2]+Math.cos(t*.4+b[3])*1.2;}geo.attributes.position.needsUpdate=true;ff.material.opacity=.6+.4*Math.sin(t*2);});}
 scene.traverse(o=>{if(!o.isMesh||!o.material||!o.material.isMeshLambertMaterial)return;const L=o.material;o.material=new THREE.MeshStandardMaterial({color:L.color,map:L.map,vertexColors:L.vertexColors,side:L.side,transparent:L.transparent,opacity:L.opacity,emissive:L.emissive,flatShading:L.flatShading,wireframe:L.wireframe,roughness:.82,metalness:0});});
 return{solids,circles,boxes,ground,water,fogU,update(t,cam){updaters.forEach(f=>f(t,cam));}};}
