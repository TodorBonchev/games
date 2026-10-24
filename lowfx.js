// Cheap replacements used by the Low quality tier.
import * as THREE from 'three';
export function lowSky(top,hor,glowDir,glowCol,night=false){return new THREE.Mesh(new THREE.SphereGeometry(4000,16,8),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,defines:{STARFIELD:night?1:0},
 uniforms:{top:{value:new THREE.Color(top)},hor:{value:new THREE.Color(hor)},gd:{value:glowDir},gc:{value:new THREE.Color(glowCol)}},
 vertexShader:'varying vec3 vd;void main(){vd=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position.z=gl_Position.w;}',
 fragmentShader:'uniform vec3 top,hor,gd,gc;varying vec3 vd;void main(){vec3 d=normalize(vd);vec3 c=mix(hor,top,smoothstep(-.06,.22,d.y));c+=gc*pow(max(dot(d,gd),0.),14.)*.65;\n#if STARFIELD == 1\nfloat stars=step(.99945,fract(sin(dot(floor(d*500.),vec3(127.1,311.7,74.7)))*43758.5453))*smoothstep(.05,.4,d.y);c+=vec3(.45,.65,.85)*stars*.7;\n#endif\ngl_FragColor=vec4(c,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'}));}
// detail texture: one greyscale noise tile
export function detailTex(){const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');const im=g.createImageData(128,128);
 // A seamless, softly mottled surface with fine mineral flecks. One texture
 // lookup keeps the phone tier cheap while broad patches survive downscaling.
 const hash=(x,y,n)=>{const v=Math.sin((x%n)*127.1+(y%n)*311.7)*43758.5453;return v-Math.floor(v);};
 const noise=(x,y,n)=>{const ix=Math.floor(x),iy=Math.floor(y);let fx=x-ix,fy=y-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);const a=hash(ix,iy,n),b=hash(ix+1,iy,n),c=hash(ix,iy+1,n),d=hash(ix+1,iy+1,n);return a+(b-a)*fx+(c-a)*fy+(a-b-c+d)*fx*fy;};
 for(let y=0;y<128;y++)for(let x=0;x<128;x++){const grain=Math.random(),v=216+noise(x/16,y/16,8)*19+noise(x/4,y/4,32)*8+grain*12,i=(y*128+x)*4;im.data[i]=im.data[i+1]=im.data[i+2]=v;im.data[i+3]=255;}g.putImageData(im,0,0);
 const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(60,60);return t;}
// Lambert terrain: per-vertex splat colours + one detail texture (+ optional animated emissive attribute, e.g. lava)
export function lowTerrainMat(emAttr,emCol,U){const m=new THREE.MeshLambertMaterial({vertexColors:true,map:detailTex()});
 if(emAttr){m.onBeforeCompile=s=>{s.uniforms.time=U.time;s.vertexShader=s.vertexShader.replace('#include <common>',`#include <common>\nattribute float ${emAttr};varying float vEm;varying vec2 vXZ;`).replace('#include <begin_vertex>',`#include <begin_vertex>\nvEm=${emAttr};vXZ=(modelMatrix*vec4(position,1.)).xz;`);
  s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nuniform float time;varying float vEm;varying vec2 vXZ;').replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>\n{float k=smoothstep(.3,.7,vEm);float flow=sin(vXZ.x*.8+vXZ.y*.35+time*.7)*sin(vXZ.y*1.3-time*.9);float veins=pow(max(0.,sin(vXZ.x*2.5+vXZ.y*1.7+sin(vXZ.y*2.4-time*.5))),4.);vec3 hot=mix(vec3(.8,.09,.008),vec3(${emCol}),smoothstep(-.3,.65,flow));totalEmissiveRadiance+=hot*k*(.6+veins*.45)+vec3(.55,.09,.005)*(smoothstep(.04,.3,vEm)-k)*.15;}`);};}
 return m;}
// Low-tier water keeps broad moving swells, shore foam and a soft reflection.
// Analytic waves avoid reflection render targets and extra texture lookups.
export function lowWater(GL_SHORE,U,deep,shallow,sunCol){return new THREE.ShaderMaterial({transparent:true,fog:false,uniforms:U,
 vertexShader:'varying vec3 wp;void main(){vec4 w=modelMatrix*vec4(position,1.);wp=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
 fragmentShader:`uniform float time,fogNear,fogFar;uniform vec3 sunDir,fogColor;varying vec3 wp;${GL_SHORE}
 void main(){vec2 p=wp.xz;float a=atan(p.y,p.x);float d=length(p)/shoreR(a);float dist=length(cameraPosition-wp);vec3 col=mix(vec3(${shallow}),vec3(${deep}),smoothstep(1.,1.6,d));
  float w1=sin(dot(p,vec2(.22,.16))+time*.8),w2=sin(dot(p,vec2(-.31,.25))-time*1.1);float att=1./(1.+dist*.012);
  vec3 n=normalize(vec3((w1+w2*.55)*.13*att,1.,(w1*.65-w2)*.11*att));vec3 v=normalize(cameraPosition-wp);float fresnel=pow(1.-max(dot(n,v),0.),4.);col=mix(col,fogColor*.7,fresnel*.35);
  float sp=max(dot(reflect(-sunDir,n),v),0.);col+=vec3(${sunCol})*(pow(sp,48.)*.5+pow(sp,280.)*.7);
  float wash=sin(time*1.1+a*13.)*.008;float foam=(1.-smoothstep(1.004+wash,1.025+wash,d))*smoothstep(.987+wash,1.001+wash,d);
  foam+=smoothstep(1.025+wash,1.038+wash,d)*(1.-smoothstep(1.038+wash,1.055+wash,d))*.28;
  col=mix(col,vec3(.82,.9,.84),foam*.72);col+=vec3(.07,.11,.08)*(w1*w2*.5+.5)*(1.-smoothstep(1.02,1.22,d));
  col=mix(col,fogColor,smoothstep(fogNear*1.5,fogFar*2.,dist)*.75);gl_FragColor=vec4(col,mix(.78,1.,smoothstep(1.,1.15,d)));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }`});}
