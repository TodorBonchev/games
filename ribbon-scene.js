import * as THREE from './vendor/three/build/three.module.js';
import { LEVELS } from './ribbon-game.js';

// All reef pieces are created once. Only transforms change while swimming.
export function createRibbonScene(container, { resized=()=>{}, lost=()=>{}, restored=()=>{} }={}) {
  const scene=new THREE.Scene(); scene.fog=new THREE.Fog('#087a87',35,90);
  const backdrop=document.createElement('canvas');backdrop.width=512;backdrop.height=512;const bg=backdrop.getContext('2d');const gradient=bg.createLinearGradient(0,0,0,512);gradient.addColorStop(0,'#16447c');gradient.addColorStop(.46,'#087c8e');gradient.addColorStop(1,'#075c70');bg.fillStyle=gradient;bg.fillRect(0,0,512,512);for(let i=0;i<38;i++){bg.fillStyle=`rgba(208,255,235,${.12+(i%4)*.04})`;bg.beginPath();bg.arc((i*193)%512,(i*83)%360,1+(i%3)*.6,0,Math.PI*2);bg.fill();}const backgroundTexture=new THREE.CanvasTexture(backdrop);backgroundTexture.colorSpace=THREE.SRGBColorSpace;scene.background=backgroundTexture;
  const camera=new THREE.PerspectiveCamera(48,1,.1,120); camera.position.set(0,2.6,10.5); camera.lookAt(0,0,-13);
  const renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,powerPreference:'high-performance'}); renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.setClearColor('#087a87'); container.append(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();lost();});renderer.domElement.addEventListener('webglcontextrestored',restored);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  scene.add(new THREE.HemisphereLight(0xc7fff2,0x123361,2.1)); const light=new THREE.DirectionalLight(0xffe2ba,2.1);light.position.set(-5,9,8);scene.add(light);
  const materials=[], geometries=[]; const mat=(c,extra={})=>{const m=new THREE.MeshStandardMaterial({color:c,roughness:.72,...extra});materials.push(m);return m;}; const basic=(c,extra={})=>{const m=new THREE.MeshBasicMaterial({color:c,...extra});materials.push(m);return m;};
  const geo=g=>{geometries.push(g);return g;}; const sphere=geo(new THREE.SphereGeometry(1,12,8)), cylinder=geo(new THREE.CylinderGeometry(1,1,1,8)), torus=geo(new THREE.TorusGeometry(1,.095,8,40)), cone=geo(new THREE.ConeGeometry(1,1,8));
  const coral=[mat('#fa8569'),mat('#ffbb73'),mat('#db64a1'),mat('#775de1')], dark=mat('#123d59'), pearl=mat('#fff1c5',{emissive:'#817942',emissiveIntensity:.45}), mint=mat('#8cf5d8',{emissive:'#0e8471',emissiveIntensity:.7}), gold=mat('#ffd47a',{emissive:'#c26924',emissiveIntensity:.5});
  const sand=document.createElement('canvas');sand.width=sand.height=256;const sandCtx=sand.getContext('2d');sandCtx.fillStyle='#167e83';sandCtx.fillRect(0,0,256,256);for(let i=0;i<34;i++){const x=(i*79)%256,y=(i*137)%256;sandCtx.strokeStyle=i%2?'#258e8c':'#208687';sandCtx.lineWidth=2;sandCtx.beginPath();sandCtx.ellipse(x,y,10+i%5*4,3+i%3,0,0,Math.PI*2);sandCtx.stroke();}const floorTexture=new THREE.CanvasTexture(sand);floorTexture.colorSpace=THREE.SRGBColorSpace;floorTexture.wrapS=floorTexture.wrapT=THREE.RepeatWrapping;floorTexture.repeat.set(6,22);const floorMat=mat('#ffffff',{map:floorTexture});const floor=meshFloor();function meshFloor(){const p=new THREE.Mesh(geo(new THREE.PlaneGeometry(50,200)),floorMat);p.rotation.x=-Math.PI/2;p.position.set(0,-3.5,-35);scene.add(p);return p;}
  const fishMat=mat('#ffb35f'), fishLight=mat('#fff0b3'), eye=basic('#12374a');
  function mesh(g,m,parent=scene){const o=new THREE.Mesh(g,m);parent.add(o);return o;}
  // Expressive little ray seen from behind, with glowing fins and a long silk wake.
  const fish=new THREE.Group();scene.add(fish);const body=mesh(sphere,fishMat,fish);body.scale.set(.58,.25,.7);
  for(const side of [-1,1]){const wing=mesh(sphere,fishMat,fish);wing.position.set(side*.53,-.03,.05);wing.rotation.z=side*.28;wing.scale.set(.62,.13,.38); const spot=mesh(sphere,fishLight,fish);spot.position.set(side*.62,.11,.12);spot.scale.set(.11,.025,.16); const e=mesh(sphere,eye,fish);e.position.set(side*.3,.16,-.48);e.scale.set(.075,.075,.075);}
  const nose=mesh(sphere,fishLight,fish);nose.position.set(0,.01,-.57);nose.scale.set(.22,.12,.15);
  const tail=[];for(let i=0;i<21;i++){const m=mesh(cylinder,i%3===0?gold:mint);tail.push(m);}
  const effects=[];for(let i=0;i<16;i++){const material=basic('#fff1b0',{transparent:true,opacity:0,depthWrite:false});const ring=mesh(torus,material);ring.visible=false;effects.push({ring,material});}
  const rings=[];for(let i=0;i<14;i++){const group=new THREE.Group();scene.add(group);const outer=mesh(torus,i%3===0?gold:mint,group);const left=mesh(sphere,coral[i%4],group),right=mesh(sphere,coral[(i+1)%4],group);left.scale.set(.28,.35,.25);right.scale.copy(left.scale);rings.push({group,outer,left,right});}
  const pearls=[];for(let i=0;i<28;i++){const o=mesh(sphere,pearl);o.scale.setScalar(.17);pearls.push(o);}
  const rocks=[];for(let i=0;i<13;i++){const g=new THREE.Group();scene.add(g);const core=mesh(sphere,coral[i%4],g);core.scale.set(.7,.8,.65);for(let k=0;k<3;k++){const branch=mesh(cone,coral[(i+k)%4],g);branch.position.set((k-1)*.35,.6,.05);branch.scale.set(.24,.85,.24);branch.rotation.z=(k-1)*.3;}rocks.push(g);}
  // Decorative corals and kelp share instanced geometry to keep mobile draw calls low.
  const reefMaterial=mat('#ffffff');const reefBase=new THREE.InstancedMesh(sphere,reefMaterial,40),reefStalk=new THREE.InstancedMesh(cylinder,reefMaterial,120),reefTip=new THREE.InstancedMesh(sphere,reefMaterial,120);
  const kelp=new THREE.InstancedMesh(sphere,mint,48);scene.add(reefBase,reefStalk,reefTip,kelp);for(const o of [reefBase,reefStalk,reefTip,kelp])o.frustumCulled=false;const instanceObject=new THREE.Object3D(), instanceColor=new THREE.Color();const colors=['#fa8569','#ffbb73','#db64a1','#775de1'];
  for(let i=0;i<40;i++){instanceColor.set(colors[i%4]);reefBase.setColorAt(i,instanceColor);for(let j=0;j<3;j++){instanceColor.set(colors[(i+j)%4]);reefStalk.setColorAt(i*3+j,instanceColor);reefTip.setColorAt(i*3+j,instanceColor);}}
  for(let i=0;i<48;i++){instanceColor.set(i%2?'#45dbba':'#2cc3ae');kelp.setColorAt(i,instanceColor);}
  function setInstance(mesh,index,x,y,z,sx,sy,sz,rotation=0){instanceObject.position.set(x,y,z);instanceObject.rotation.set(0,0,rotation);instanceObject.scale.set(sx,sy,sz);instanceObject.updateMatrix();mesh.setMatrixAt(index,instanceObject.matrix);}
  const schooling=[];for(let i=0;i<16;i++){const group=new THREE.Group();scene.add(group);const body=mesh(sphere,i%2?gold:mint,group);body.scale.set(.20,.12,.32);const fin=mesh(cone,i%2?gold:mint,group);fin.position.z=.32;fin.rotation.x=Math.PI/2;fin.scale.set(.16,.27,.11);schooling.push(group);}
  const sparkles=[];for(let i=0;i<32;i++){const o=mesh(sphere,i%2?gold:mint);o.scale.setScalar(.06+(i%3)*.025);sparkles.push(o);}
  const beams=[];const beamMat=basic('#a9fff0',{transparent:true,opacity:.10,side:THREE.DoubleSide,depthWrite:false});const plane=geo(new THREE.PlaneGeometry(1,1));for(let i=0;i<5;i++){const beam=mesh(plane,beamMat);beam.position.set(-5+i*3,5,-25-i*7);beam.rotation.z=.22;beam.scale.set(2.5,22,1);beams.push(beam);}
  const dummy=new THREE.Vector3(), a=new THREE.Vector3(), b=new THREE.Vector3(), up=new THREE.Vector3(0,1,0);let lastWidth=0,lastHeight=0,lastDpr=0;
  function resize(){const rect=container.getBoundingClientRect(),w=Math.max(1,Math.round(rect.width)),h=Math.max(1,Math.round(rect.height)),dpr=Math.min(window.devicePixelRatio||1,matchMedia('(pointer: coarse)').matches?1.35:1.7,Math.sqrt(420000/(w*h)));if(w===lastWidth&&h===lastHeight&&dpr===lastDpr)return;lastWidth=w;lastHeight=h;lastDpr=dpr;renderer.setPixelRatio(dpr);renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=w/h<.8?54:48;camera.updateProjectionMatrix();resized();}
  const observer=new ResizeObserver(resize);observer.observe(container);resize();
  function render(state,time=0){const route=LEVELS[state.level-1], d=state.distance;fish.position.set(state.x,state.y,0);fish.rotation.z=(state.targetX-state.x)*-.12;fish.rotation.x=(state.targetY-state.y)*.08;
    for(let i=0;i<tail.length;i++){const p=state.tail[i],q=state.tail[i+1],o=tail[i];a.set(p.x,p.y,(d-p.distance));b.set(q.x,q.y,(d-q.distance));o.position.copy(a).add(b).multiplyScalar(.5);dummy.copy(b).sub(a);const length=dummy.length();if(length>1e-6)o.quaternion.setFromUnitVectors(up,dummy.multiplyScalar(1/length));o.scale.set(.14*(1-i/26),length,.14*(1-i/26));}
    for(let i=0;i<effects.length;i++){const e=state.effects[i],o=effects[i];o.ring.visible=!!e;if(!e)continue;const t=e.age;o.ring.position.set(e.x,e.y,-(e.distance-d));o.ring.scale.setScalar(.3+t*2.4);o.material.color.set(e.type==='miss'?'#ff7f80':e.type==='perfect'?'#ffe19a':'#9bffe7');o.material.opacity=(1-t)*.7;}
    for(let i=0;i<rings.length;i++){const def=route.gates[i],o=rings[i];if(!def){o.group.visible=false;continue;}const z=-(def.distance-d);o.group.visible=z<4&&z>-78;o.group.position.set(def.x,def.y,z);o.outer.scale.set(def.width,def.height,1);o.left.position.set(-def.width,0,0);o.right.position.set(def.width,0,0);}
    for(let i=0;i<pearls.length;i++){const def=route.pearls[i],o=pearls[i];if(!def){o.visible=false;continue;}const z=-(def.distance-d);o.visible=!state.pearls.includes(i)&&z<9&&z>-75;o.position.set(def.x,def.y+(reduced?0:Math.sin(time*2+i)*.09),z);}
    for(let i=0;i<rocks.length;i++){const def=route.obstacles[i],o=rocks[i];if(!def){o.visible=false;continue;}const z=-(def.distance-d);o.visible=z<5&&z>-75;o.position.set(def.x,def.y,z);}
    for(let i=0;i<40;i++){const side=i%2?1:-1,lane=Math.floor(i/2),cycle=(lane*8-(d%160)+160)%160,x=side*(5.2+(i%3)*.5),z=-cycle+5;setInstance(reefBase,i,x,-3.2,z,.7,.35,.65);for(let j=0;j<3;j++){const dx=(j-1)*.3;setInstance(reefStalk,i*3+j,x+dx,-2.7+j%2*.2,z,.11,.95+j%2*.4,.11,(j-1)*.22);setInstance(reefTip,i*3+j,x+(j-1)*.4,-2.2+j%2*.4,z,.19,.19,.19);}}
    for(let i=0;i<48;i++){const side=i%2?1:-1,lane=Math.floor(i/2),cycle=(lane*7-(d%168)+168)%168, sway=reduced?0:Math.sin(time*1.2+i)*.12;setInstance(kelp,i,side*(6.4+(i%3)*.3),-1.8,-cycle+4,.27,1.8+(i%4)*.3,.2,side*.3+sway);}
    reefBase.instanceMatrix.needsUpdate=reefStalk.instanceMatrix.needsUpdate=reefTip.instanceMatrix.needsUpdate=kelp.instanceMatrix.needsUpdate=true;
    for(let i=0;i<schooling.length;i++){const o=schooling[i],cycle=(i*8-(d*.8%100)+100)%100;o.position.set(Math.sin(i*8.7)*4,Math.cos(i*4.5)*2+(reduced?0:Math.sin(time+i)*.15),-cycle);o.visible=cycle<65;}
    for(let i=0;i<sparkles.length;i++){const o=sparkles[i],cycle=(i*7-(d*.7%80)+80)%80;o.position.set(Math.sin(i*12.1)*5,Math.cos(i*6.7)*3+(reduced?0:Math.sin(time+i)*.12),-cycle);o.visible=cycle<70;}
    renderer.render(scene,camera);
  }
  function dispose(){observer.disconnect();renderer.dispose();backgroundTexture.dispose();floorTexture.dispose();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();renderer.domElement.remove();}
  return {render,resize,renderer,camera,dispose};
}
