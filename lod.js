// Geometry factory: halves tessellation on the Low tier and caches identical geometries (shared across zombies).
import * as THREE from 'three';
export const LOD={low:false};const cache=new Map(),cachedGeometries=new WeakSet();
export const isCachedGeometry=geometry=>cachedGeometries.has(geometry);
const SEGIDX={SphereGeometry:[1,2],CapsuleGeometry:[2,3],CylinderGeometry:[3],ConeGeometry:[2],TorusGeometry:[2,3],CircleGeometry:[1],RoundedBoxGeometry:[3]};
export function mk(C,...a){if(LOD.low){const ix=SEGIDX[C.name];if(ix)for(const i of ix)if(typeof a[i]==='number')a[i]=Math.max(i===1&&C.name==='SphereGeometry'?8:3,Math.ceil(a[i]/2));}return new C(...a);}
export function mkc(C,...a){const k=C.name+a.join(',')+LOD.low;let g=cache.get(k);if(!g){g=mk(C,...a);cache.set(k,g);cachedGeometries.add(g);}return g;}
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
const attrSig=g=>Object.keys(g.attributes).sort().map(k=>{const a=g.attributes[k];return k+a.itemSize+(a.normalized?'n':'')+a.array.constructor.name+(a.isInterleavedBufferAttribute?'i':'');}).join(',');
// Merge every mesh that is rigidly attached to an animated joint into one mesh per material (fewer draw calls, same look).
export function mergeRigid(root,dyn){const D=new Set(dyn);D.add(root);root.updateMatrixWorld(true);const inv=new THREE.Matrix4(),rel=new THREE.Matrix4();let saved=0;
 for(const A of D){const groups=new Map();
  const walk=o=>{for(const c of o.children){if(D.has(c))continue;if(c.isMesh&&!c.isInstancedMesh&&!c.children.length&&!Array.isArray(c.material)&&c.visible&&!c.material.transparent){
    const k=c.material.uuid+'|'+attrSig(c.geometry)+'|'+!!c.geometry.index+'|'+c.castShadow+c.receiveShadow+'|'+c.renderOrder;let L=groups.get(k);if(!L)groups.set(k,L=[]);L.push(c);}
   if(c.children.length)walk(c);}};walk(A);
  A.updateMatrixWorld(true);inv.copy(A.matrixWorld).invert();
  for(const L0 of groups.values()){const L=L0.filter(m=>{rel.multiplyMatrices(inv,m.matrixWorld);return rel.determinant()>0;});if(L.length<2)continue;
   const geos=L.map(m=>{rel.multiplyMatrices(inv,m.matrixWorld);const g=m.geometry.clone().applyMatrix4(rel);g.groups=[];return g;});const mg=mergeGeometries(geos,false);geos.forEach(g=>g.dispose());if(!mg)continue;
   const M=new THREE.Mesh(mg,L[0].material);M.castShadow=L[0].castShadow;M.receiveShadow=L[0].receiveShadow;M.renderOrder=L[0].renderOrder;M.userData={...L[0].userData};A.add(M);L.forEach(m=>m.parent.remove(m));saved+=L.length-1;}}
 return saved;}
