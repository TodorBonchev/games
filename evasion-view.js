import * as THREE from 'three';

// One reusable draw for the short ground trail. The main game owns its clock.
export function createEvasionTrail(scene) {
  const count=8,geometry=new THREE.DodecahedronGeometry(.12,0),material=new THREE.MeshBasicMaterial({color:0xc8dbc0,transparent:true,opacity:.38,depthWrite:false});
  const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.name='evasion-trail';mesh.frustumCulled=false;mesh.visible=false;mesh.raycast=()=>{};scene.add(mesh);
  const slots=Array.from({length:count},()=>({x:0,y:0,z:0,life:0})),matrix=new THREE.Matrix4(),zero=new THREE.Matrix4().makeScale(0,0,0);
  let cursor=0,clock=0;
  function clear(){for(const slot of slots)slot.life=0;mesh.visible=false;clock=0;}
  return {clear,update(dt,position,{active=false,motion=true}={}){
    if(!motion){clear();return;}
    clock=Math.max(0,clock-dt);
    if(active&&!clock){const slot=slots[cursor++%count];Object.assign(slot,{x:position.x,y:position.y+.13,z:position.z,life:.3});clock=.035;}
    let living=0;
    slots.forEach((slot,i)=>{slot.life=Math.max(0,slot.life-dt);if(!slot.life){mesh.setMatrixAt(i,zero);return;}living++;const size=.5+(1-slot.life/.3)*.9;matrix.makeScale(size,size*.65,size);matrix.setPosition(slot.x,slot.y+(1-slot.life/.3)*.12,slot.z);mesh.setMatrixAt(i,matrix);});
    mesh.visible=living>0;mesh.instanceMatrix.needsUpdate=true;
  },dispose(){clear();mesh.removeFromParent();mesh.dispose();geometry.dispose();material.dispose();}};
}
