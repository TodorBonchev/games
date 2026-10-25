const HEIGHT=1.8,SKIN=.001;

// Ground navigation intentionally uses simple infinite-height circles. Flight
// instead needs the actual static objects' heights, including every instance.
// The boxes are conservative: wings/leaves and other non-solid decoration are
// excluded by using the same solids list as weapon and camera raycasts.
export function createFlightCollision({solids=[],groundH=()=>0}={}){
 const obstacles=[];
 function addGeometry(geometry,matrix){
  if(!geometry.boundingBox)geometry.computeBoundingBox();
  if(!geometry.boundingBox||geometry.boundingBox.isEmpty())return;
  const bounds=geometry.boundingBox.clone().applyMatrix4(matrix),min=bounds.min,max=bounds.max;
  if(max.x-min.x<12&&max.z-min.z<12){obstacles.push({x0:min.x,x1:max.x,y0:min.y,y1:max.y,z0:min.z,z1:max.z});return;}
  // Ruins are already merged across the island. Partition their triangles so
  // one huge mesh bounding box cannot become an invisible island-sized wall.
  const cells=new Map(),p=geometry.attributes.position,index=geometry.index,m=matrix.elements,size=1.5;
  const count=index?index.count:p.count,vertices=Array.from({length:3},()=>({x:0,y:0,z:0}));
  for(let i=0;i+2<count;i+=3){
   for(let j=0;j<3;j++){const v=index?index.getX(i+j):i+j,x=p.getX(v),y=p.getY(v),z=p.getZ(v),out=vertices[j];
    out.x=m[0]*x+m[4]*y+m[8]*z+m[12];out.y=m[1]*x+m[5]*y+m[9]*z+m[13];out.z=m[2]*x+m[6]*y+m[10]*z+m[14];}
   const x0=Math.min(...vertices.map(v=>v.x)),x1=Math.max(...vertices.map(v=>v.x)),z0=Math.min(...vertices.map(v=>v.z)),z1=Math.max(...vertices.map(v=>v.z));
   const y0=Math.min(...vertices.map(v=>v.y)),y1=Math.max(...vertices.map(v=>v.y));
   for(let x=Math.floor(x0/size);x<=Math.floor(x1/size);x++)for(let z=Math.floor(z0/size);z<=Math.floor(z1/size);z++){
    const key=x+','+z,old=cells.get(key);
    if(old){old.y0=Math.min(old.y0,y0);old.y1=Math.max(old.y1,y1);}
    else cells.set(key,{x0:Math.max(x*size,min.x),x1:Math.min((x+1)*size,max.x),y0,y1,z0:Math.max(z*size,min.z),z1:Math.min((z+1)*size,max.z)});
   }
  }
  obstacles.push(...cells.values());
 }
 for(const mesh of solids){
  if(!mesh.geometry?.attributes?.position)continue;
  // Detached originals retain matrixWorld after static scene batching.
  if(mesh.parent)mesh.updateWorldMatrix(true,false);
  if(mesh.isInstancedMesh){const instance=mesh.matrixWorld.clone(),world=mesh.matrixWorld.clone();
   for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,instance);world.copy(mesh.matrixWorld).multiply(instance);addGeometry(mesh.geometry,world);}}
  else addGeometry(mesh.geometry,mesh.matrixWorld);
 }
 const start={x:0,y:0,z:0},delta={x:0,y:0,z:0},result={grounded:false,ceiling:false};
 const axes=['x','y','z'];
 function surfaceAt(x,z,feetY=Infinity,radius=.4){
  let height=groundH(x,z);
  for(const b of obstacles)if(b.y1<=feetY+.025&&b.y1>height&&x>b.x0-radius&&x<b.x1+radius&&z>b.z0-radius&&z<b.z1+radius)height=b.y1;
  return height;
 }
 function move(from,desired,radius=.4){
  result.grounded=result.ceiling=false;
  start.x=from.x;start.y=from.y;start.z=from.z;
  delta.x=desired.x-from.x;delta.y=desired.y-from.y;delta.z=desired.z-from.z;
  // A takeoff may start inside a conservative flight box even though the
  // narrower ground collider allowed it. Resolve that overlap without traps.
  for(let pass=0;pass<3;pass++)for(const b of obstacles){
   if(start.x<=b.x0-radius+SKIN||start.x>=b.x1+radius-SKIN||start.y<=b.y0-HEIGHT+SKIN||start.y>=b.y1-SKIN||start.z<=b.z0-radius+SKIN||start.z>=b.z1+radius-SKIN)continue;
   const choices=[[start.x-(b.x0-radius),'x',b.x0-radius-SKIN],[b.x1+radius-start.x,'x',b.x1+radius+SKIN],
    [start.z-(b.z0-radius),'z',b.z0-radius-SKIN],[b.z1+radius-start.z,'z',b.z1+radius+SKIN],
    [b.y1-start.y,'y',b.y1+SKIN]];
   if(b.y0-HEIGHT>=groundH(start.x,start.z))choices.push([start.y-(b.y0-HEIGHT),'y',b.y0-HEIGHT-SKIN]);
   choices.sort((a,b)=>a[0]-b[0]);start[choices[0][1]]=choices[0][2];
  }
  for(let pass=0;pass<4;pass++){
   let earliest=1,axis=null,normal=0;
   for(const b of obstacles){
    let near=0,far=1,hitAxis=null,hitNormal=0,miss=false;
    for(const a of axes){
     const lo=b[a+'0']-(a==='y'?HEIGHT:radius),hi=b[a+'1']+(a==='y'?0:radius),origin=start[a],d=delta[a];
     if(Math.abs(d)<1e-10){if(origin<=lo+SKIN*.1||origin>=hi-SKIN*.1){miss=true;break;}continue;}
     let enter=(lo-origin)/d,exit=(hi-origin)/d,sign=-1;
     if(enter>exit){const swap=enter;enter=exit;exit=swap;sign=1;}
     if(enter>near||(enter>=near-1e-10&&!hitAxis)){near=enter;hitAxis=a;hitNormal=sign;}
     far=Math.min(far,exit);if(near>far){miss=true;break;}
    }
    if(!miss&&hitAxis&&far>=0&&near>=0&&near<=earliest){earliest=near;axis=hitAxis;normal=hitNormal;}
   }
   start.x+=delta.x*earliest;start.y+=delta.y*earliest;start.z+=delta.z*earliest;
   if(!axis)break;
   start[axis]+=normal*SKIN;
   delta.x*=1-earliest;delta.y*=1-earliest;delta.z*=1-earliest;delta[axis]=0;
   if(axis==='y'){if(normal>0)result.grounded=true;else result.ceiling=true;}
  }
  desired.x=start.x;desired.y=start.y;desired.z=start.z;
  const ground=groundH(desired.x,desired.z);
  if(desired.y<=ground){desired.y=ground;result.grounded=true;}
  // Retain support when sliding across a roof without downward velocity.
  if(desired.y<=surfaceAt(desired.x,desired.z,desired.y,radius)+.003)result.grounded=true;
  return result;
 }
 return{move,surfaceAt,get obstacleCount(){return obstacles.length;}};
}
