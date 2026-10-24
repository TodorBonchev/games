import * as THREE from 'three';

const clamp = value => Math.max(0, Math.min(1, value));
const palettes = {
  palm: [
    { top:0x477b9d, horizon:0xf0be89, cloud:0x8d9fba, light:0xffe6bb, fog:0xbcc9bb, sun:0xffd6a6, hemi:0xc2dfe7, rim:0xffd49a, power:1, cover:.16 },
    { top:0x426c90, horizon:0xdfb28f, cloud:0x657e9b, light:0xe0d9c7, fog:0xa5bec0, sun:0xe9dfc0, hemi:0xc4dfef, rim:0xdcd3b7, power:.96, cover:.52 },
    { top:0x29445f, horizon:0x91b0ba, cloud:0x3c566e, light:0xa7bac8, fog:0x8baab5, sun:0xc7dbed, hemi:0xcce8ef, rim:0x9bd3df, power:.91, cover:.88 },
  ],
  ember: [
    { top:0x111d35, horizon:0x9b5145, cloud:0x26324d, light:0x8b6269, fog:0x41495b, sun:0xc8daff, hemi:0xa2bad8, rim:0xffa05b, power:1, cover:.22 },
    { top:0x142840, horizon:0x795774, cloud:0x2b3858, light:0x7d88a6, fog:0x45546a, sun:0xb9dfff, hemi:0xaac8e1, rim:0xffa66d, power:1.01, cover:.42 },
    { top:0x0c2639, horizon:0x576d83, cloud:0x253f59, light:0x739db4, fog:0x3c5967, sun:0xb9f2ec, hemi:0xb4dce1, rim:0xffb581, power:1.04, cover:.60 },
  ],
};

function cloudTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(128,128);
  const hash = (x,y,n) => { const v=Math.sin((x%n)*127.1+(y%n)*311.7)*43758.5453; return v-Math.floor(v); };
  const noise = (x,y,n) => {
    const ix=Math.floor(x),iy=Math.floor(y);let fx=x-ix,fy=y-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix,iy,n),hash(ix+1,iy,n),fx),THREE.MathUtils.lerp(hash(ix,iy+1,n),hash(ix+1,iy+1,n),fx),fy);
  };
  for(let y=0;y<128;y++)for(let x=0;x<128;x++) {
    const density=noise(x/32,y/32,4)*.55+noise(x/16,y/16,8)*.3+noise(x/8,y/8,16)*.15,i=(y*128+x)*4;
    pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=Math.round(density*255);pixels.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;return texture;
}

// The sky uses the existing dome draw. Two small noise texture reads produce
// layered cloud banks; aurora and stars share that shader on the second island.
export function createEncounterWeather(scene,{sky,water,fogColor,sunDirection,lights={},ember=false,low=false,cloudMaterials=[]}) {
  const texture=cloudTexture(),colors=palettes[ember?'ember':'palm'].map(p=>({...p,...Object.fromEntries(['top','horizon','cloud','light','fog','sun','hemi','rim'].map(k=>[k,new THREE.Color(p[k])]))}));
  const uniforms={ time:{value:0}, phase:{value:0}, top:{value:colors[0].top.clone()}, horizon:{value:colors[0].horizon.clone()},
    cloudShade:{value:colors[0].cloud.clone()},cloudLight:{value:colors[0].light.clone()},cover:{value:colors[0].cover},sunDir:{value:sunDirection},noiseTex:{value:texture} };
  const previousSky=sky.material;
  const material=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,uniforms,defines:{EMBER:ember?1:0},
    vertexShader:'varying vec3 skyDirection;void main(){skyDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position.z=gl_Position.w;}',
    fragmentShader:`
uniform float time,phase,cover;uniform vec3 top,horizon,cloudShade,cloudLight,sunDir;uniform sampler2D noiseTex;varying vec3 skyDirection;
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
void main(){
 vec3 d=normalize(skyDirection);float elevation=max(0.,d.y);
 vec3 color=mix(horizon,top,smoothstep(-.025,.48,d.y));color=mix(color,top*.63,smoothstep(.5,1.,d.y)*.55);
 float facing=max(dot(d,sunDir),0.);float halo=pow(facing,22.);
 #if EMBER == 1
 color+=vec3(.18,.24,.34)*halo*.35;
 #else
 color+=mix(vec3(.48,.26,.09),vec3(.15,.25,.3),phase)*halo*(1.-cover*.65);
 color+=vec3(1.5,1.22,.73)*smoothstep(.9995,.99985,facing)*(1.-cover*.65);
 #endif
 vec2 cloudUV=d.xz/max(.13,d.y+.18)*.14+vec2(time*.002,0.);
 float a=texture2D(noiseTex,cloudUV).r,b=texture2D(noiseTex,cloudUV*2.7+vec2(.17,time*.001)).r;
 float density=a*.76+b*.24;float threshold=mix(.67,.34,cover);
 float shape=smoothstep(threshold,threshold+.18,density)*smoothstep(.015,.12,d.y)*(1.-smoothstep(.73,.98,d.y));
 vec3 cloudColor=mix(cloudShade,cloudLight,smoothstep(.42,.76,density)*.5+halo*.35);
 color=mix(color,cloudColor,shape*.85);
 #if EMBER == 1
 float azimuth=atan(d.z,d.x);float ribbon=.30+sin(azimuth*2.5+time*.025)*.075+sin(azimuth*5.-time*.018)*.025;
 float curtain=exp(-abs(d.y-ribbon)*22.)*smoothstep(.08,.20,d.y)*(1.-smoothstep(.60,.75,d.y));
 float folds=.55+.45*sin(azimuth*22.+d.y*13.+time*.08);folds=folds*folds;
 vec3 aurora=mix(vec3(.12,.4,.65),vec3(.15,.8,.52),smoothstep(ribbon-.1,ribbon+.08,d.y));
 color+=aurora*curtain*(.3+folds*.7)*(.22+phase*.7)*(1.-shape*.7);
 float stars=step(.9992,hash(floor(d*500.)))*smoothstep(.10,.4,d.y)*(1.-shape);
 color+=vec3(.55,.72,.86)*stars*.65;
 #endif
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}` });
  sky.material=material;previousSky.dispose();sky.name='encounter-sky';
  const waterTint={value:new THREE.Color(1,1,1)};
  water.material.uniforms.weatherWaterTint=waterTint;
  water.material.fragmentShader='uniform vec3 weatherWaterTint;\n'+water.material.fragmentShader.replace('gl_FragColor=vec4(col','col*=weatherWaterTint;gl_FragColor=vec4(col');
  const startingLights={};for(const key of ['sun','hemi','rim'])if(lights[key])startingLights[key]=lights[key].intensity;
  const scratch=new THREE.Color(),waterWarm=new THREE.Color(1,1.025,1.04),waterStorm=new THREE.Color(.73,.95,1.16);
  let phase=0,target=0,wave=0,lastTime=null,animationTime=0,motion=true;
  // Rain is a fixed tiny line field, never a full-screen transparent overlay.
  // Ember already has ash and embers, so it adds no particle draw here.
  let rain=null;
  if(!ember){
    const count=low?54:100,positions=new Float32Array(count*6),seeds=new Float32Array(count*2);
    for(let i=0;i<count;i++)for(let end=0;end<2;end++){const n=i*6+end*3;positions[n]=(i*17.33%1)*50-25;positions[n+1]=(i*3.71%1)*23;positions[n+2]=(i*11.27%1)*50-25;seeds[i*2+end]=end;}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('lineEnd',new THREE.BufferAttribute(seeds,1));
    const rainMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:{value:0},cameraAt:{value:new THREE.Vector3()},opacity:{value:0}},
      vertexShader:'uniform float time;uniform vec3 cameraAt;attribute float lineEnd;void main(){vec3 p=position;p.y=mod(p.y-time*8.,23.)-6.;p.x+=sin(time*.15)*2.;p+=cameraAt;p+=vec3(-.08,-.65,0.)*lineEnd;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}',
      fragmentShader:'uniform float opacity;void main(){gl_FragColor=vec4(.67,.83,.89,opacity);}' });
    rain=new THREE.LineSegments(geometry,rainMaterial);rain.name='coastal-drizzle';rain.frustumCulled=false;rain.visible=false;rain.raycast=()=>{};scene.add(rain);
  }
  function apply(){
    const section=phase<.5?0:1,t=phase<.5?phase*2:(phase-.5)*2,a=colors[section],b=colors[section+1];
    for(const [uniform,key] of [['top','top'],['horizon','horizon'],['cloudShade','cloud'],['cloudLight','light']])uniforms[uniform].value.copy(a[key]).lerp(b[key],t);
    uniforms.cover.value=THREE.MathUtils.lerp(a.cover,b.cover,t);uniforms.phase.value=phase;
    fogColor.copy(a.fog).lerp(b.fog,t);scene.fog?.color.copy(fogColor);
    for(const key of ['sun','hemi','rim'])if(lights[key]){
      lights[key].color.copy(a[key]).lerp(b[key],t);
      lights[key].intensity=startingLights[key]*(key==='hemi'?1+phase*.10:key==='rim'?1+phase*.12:THREE.MathUtils.lerp(a.power,b.power,t));
    }
    for(const mat of cloudMaterials)mat.color.copy(scratch.copy(a.light).lerp(b.light,t)).multiplyScalar(ember?1.4:1.8);
    waterTint.value.copy(waterWarm).lerp(waterStorm,phase);
  }
  function setEncounter(value,{immediate=false,motion:allowMotion=motion}={}){
    wave=Math.max(0,Math.floor(Number.isFinite(value)?value:0));target=clamp((Math.max(1,wave)-1)/4);motion=allowMotion;
    if(immediate||!motion){phase=target;apply();}
  }
  function update(time,camera,allowMotion=true){
    const dt=lastTime===null?0:Math.max(0,Math.min(.1,time-lastTime));lastTime=time;motion=allowMotion;
    if(motion)animationTime+=dt;uniforms.time.value=animationTime;
    const next=motion?THREE.MathUtils.lerp(phase,target,1-Math.exp(-dt*.32)):target;
    if(Math.abs(next-phase)>.00001){phase=next;apply();}
    if(rain){rain.visible=motion&&phase>.52&&camera.position.y<100;rain.material.uniforms.time.value=animationTime;rain.material.uniforms.cameraAt.value.copy(camera.position);rain.material.uniforms.opacity.value=Math.max(0,(phase-.5)*.28);}
  }
  apply();
  return {setEncounter,update,get state(){return {wave,phase,target,motion,rain:!!rain?.visible};}};
}
