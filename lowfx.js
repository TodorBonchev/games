// Cheap replacements used by the Low quality tier.
import * as THREE from 'three';
export function lowSky(top,hor,glowDir,glowCol){return new THREE.Mesh(new THREE.SphereGeometry(4000,16,8),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,
 uniforms:{top:{value:new THREE.Color(top)},hor:{value:new THREE.Color(hor)},gd:{value:glowDir},gc:{value:new THREE.Color(glowCol)}},
 vertexShader:'varying vec3 vd;void main(){vd=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position.z=gl_Position.w;}',
 fragmentShader:'uniform vec3 top,hor,gd,gc;varying vec3 vd;void main(){vec3 d=normalize(vd);vec3 c=mix(hor,top,pow(clamp(d.y,0.,1.),.55));c+=gc*pow(max(dot(d,gd),0.),8.);gl_FragColor=vec4(c,1.);\n#include <colorspace_fragment>\n}'}));}
// detail texture: one greyscale noise tile
export function detailTex(){const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');const im=g.createImageData(128,128);
 for(let i=0;i<128*128;i++){const v=200+Math.random()*55;im.data[i*4]=im.data[i*4+1]=im.data[i*4+2]=v;im.data[i*4+3]=255;}g.putImageData(im,0,0);
 const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(60,60);return t;}
// Lambert terrain: per-vertex splat colours + one detail texture (+ optional animated emissive attribute, e.g. lava)
export function lowTerrainMat(emAttr,emCol,U){const m=new THREE.MeshLambertMaterial({vertexColors:true,map:detailTex()});
 if(emAttr){m.onBeforeCompile=s=>{s.uniforms.time=U.time;s.vertexShader=s.vertexShader.replace('#include <common>',`#include <common>\nattribute float ${emAttr};varying float vEm;varying vec2 vXZ;`).replace('#include <begin_vertex>',`#include <begin_vertex>\nvEm=${emAttr};vXZ=(modelMatrix*vec4(position,1.)).xz;`);
  s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nuniform float time;varying float vEm;varying vec2 vXZ;').replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>\n{float k=smoothstep(.3,.7,vEm);float f=.75+.25*sin(vXZ.x*.7+time*1.3)*sin(vXZ.y*.6-time*.9);totalEmissiveRadiance+=vec3(${emCol})*k*f;}`);};}
 return m;}
// cheap water: gradient by shore distance, scrolling analytic normal, sun glint, foam line
export function lowWater(GL_SHORE,U,deep,shallow,sunCol){return new THREE.ShaderMaterial({transparent:true,fog:false,uniforms:U,
 vertexShader:'varying vec3 wp;void main(){vec4 w=modelMatrix*vec4(position,1.);wp=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
 fragmentShader:`uniform float time,fogNear,fogFar;uniform vec3 sunDir,fogColor;varying vec3 wp;${GL_SHORE}
 void main(){vec2 p=wp.xz;float a=atan(p.y,p.x);float d=length(p)/shoreR(a);vec3 col=mix(vec3(${shallow}),vec3(${deep}),smoothstep(1.,1.5,d));
  vec3 n=normalize(vec3(sin(p.x*.4+time*1.2)*.12,1.,cos(p.y*.5-time)*.12));vec3 v=normalize(cameraPosition-wp);float sp=pow(max(dot(reflect(-sunDir,n),v),0.),40.);col+=vec3(${sunCol})*sp*.8;
  float f=smoothstep(1.03,1.,d)*step(.995,d+.01);col=mix(col,vec3(.9),f*.6);float dist=length(cameraPosition-wp);col=mix(col,fogColor,smoothstep(fogNear*1.5,fogFar*2.,dist)*.75);
  gl_FragColor=vec4(col,mix(.8,1.,smoothstep(1.,1.15,d)));
  #include <colorspace_fragment>
 }`});}
