import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from './harness.mjs';

test('Both islands include a bounded flock that does not intercept aiming raycasts', async t => {
 for(const level of [1,2]){
  const env=await createGame({level});t.after(()=>env.close());
  const birds=env.game.scene.getObjectByName('island-birds');
  assert.ok(birds?.isMesh,'flock remains in the scene after world geometry batching');
  assert.equal(birds.userData.birdCount,9,'low quality uses three small flocks');
  assert.equal(birds.material.transparent,false,'opaque birds share one draw');
  assert.ok(birds.geometry.attributes.position.count<600,'flock geometry stays bounded');
  const hits=[];birds.raycast(null,hits);assert.equal(hits.length,0,'decorative birds cannot absorb shots');
  const shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>'};
  birds.material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.birdTime,birds.userData.animationTime);
  assert.match(shader.vertexShader,/float glide=/,'wing motion includes gliding intervals');
 }
});

test('Reduced motion freezes flocks and resumes without jumping to elapsed wall time', async t => {
 const env=await createGame();t.after(()=>env.close());env.start();
 const clock=env.game.scene.getObjectByName('island-birds').userData.animationTime;
 const before=clock.value;env.step(.5);assert.ok(clock.value>before,'birds circle during play');
 env.click('motionBtn');const frozen=clock.value;env.step(2);assert.equal(clock.value,frozen);
 env.click('motionBtn');env.step(.05);assert.ok(clock.value>frozen&&clock.value<=frozen+.051,'resuming does not catch up frozen movement');
 env.game.pause();const paused=clock.value;env.step(1);assert.equal(clock.value,paused);
});
