import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/build/three.module.js';
import {createFlightCollision} from '../flight-collision.js';
import {createGame} from './harness.mjs';

function box(x,y,z,w=2,h=4,d=2){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d));mesh.position.set(x,y,z);mesh.updateMatrixWorld();return mesh;}
const v=(x,y,z)=>new THREE.Vector3(x,y,z);

test('Flight sweeps scenery sides, slides along them and clears their roofs',()=>{
 const collision=createFlightCollision({solids:[box(0,2,0)]});
 const blocked=v(4,1,0);collision.move(v(-4,1,0),blocked);assert.ok(blocked.x<-1.39,'long movement cannot tunnel through a wall');
 const above=v(4,4.1,0);collision.move(v(-4,4.1,0),above);assert.equal(above.x,4,'flying above scenery clears its finite height');
 const slide=v(4,1,3);collision.move(v(-4,1,-.5),slide);assert.ok(slide.z>2.99,'contact preserves movement along the wall');
});

test('Descending lands on roofs, roof takeoff works, and undersides stop ascent',()=>{
 const collision=createFlightCollision({solids:[box(0,2,0),box(6,5,0,4,.5,4)]});
 const land=v(0,-2,0),landed=collision.move(v(0,8,0),land);assert.ok(landed.grounded);assert.ok(Math.abs(land.y-4)<.002);
 assert.equal(collision.surfaceAt(0,0,land.y),4);
 const takeoff=v(0,6,0);collision.move(land,takeoff);assert.ok(takeoff.y>=6,'standing on a roof does not trap takeoff');
 const ceiling=v(6,8,0),blocked=collision.move(v(6,1,0),ceiling);assert.ok(blocked.ceiling);assert.ok(ceiling.y<=2.951,'head stays below suspended solid');
 const terrain=v(12,-2,0),ground=collision.move(v(12,2,0),terrain);assert.ok(ground.grounded);assert.equal(terrain.y,0);
});

test('Each instance has its own height and separated merged scenery leaves open sky',()=>{
 const instance=new THREE.InstancedMesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshBasicMaterial(),2);
 instance.setMatrixAt(0,new THREE.Matrix4().makeTranslation(-8,1,0));instance.setMatrixAt(1,new THREE.Matrix4().makeTranslation(8,5,0));instance.updateMatrixWorld();
 const parts=[new THREE.BoxGeometry(2,4,2).toNonIndexed().translate(-20,2,12),new THREE.BoxGeometry(2,4,2).toNonIndexed().translate(20,2,12)];
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([...parts[0].attributes.position.array,...parts[1].attributes.position.array],3));
 const merged=new THREE.Mesh(geometry);merged.updateMatrixWorld();
 const collision=createFlightCollision({solids:[instance,merged]});
 assert.equal(collision.surfaceAt(-8,0,12),2);assert.equal(collision.surfaceAt(8,0,12),6);
 const between=v(0,2,15);collision.move(v(0,2,9),between);assert.equal(between.z,15,'merged scenery does not create a giant invisible wall');
});

test('Real island scenery supports rooftop landing and leaves high flight paths open',async t=>{
 for(const level of [1,2]){
  const env=await createGame({level});t.after(()=>env.close());env.start();
  const game=env.game;game.clearWave();const guard=game.spawnElite();guard.position.set(-35,0,-35);guard.userData.speed=0;
  const target=game.colliders.boxes.at(-1);game.setPos(target.x,target.z);const terrain=game.alt;
  game.player.position.y=terrain+10;env.step(1.8);
  assert.ok(game.alt>terrain+.6,`island ${level} lands on the scenery instead of falling through it`);
  assert.ok(Math.hypot(game.pos[0]-target.x,game.pos[2]-target.z)<.01,'landing keeps the soldier over the real prop');
  const roof=game.alt;env.step(.3);assert.ok(Math.abs(game.alt-roof)<.01,'roof support remains stable');
  env.key('Space');env.step(.7);assert.ok(game.alt>roof+2,'roof landing permits a new jump and jetpack takeoff');
  game.setView(0);game.player.position.set(target.x-5,terrain+30,target.z);env.key('KeyD');env.step(1.3);env.key('KeyD',false);env.key('Space',false);
  assert.ok(game.pos[0]>target.x+4,`island ${level} allows moving across a prop above its roof`);
 }
});
