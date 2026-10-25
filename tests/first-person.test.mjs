import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from './harness.mjs';

test('First-person choice persists, switches with V/HUD/settings, and leaves insertion cinematic', async t => {
  const env = await createGame({ storage: { szCamera: 'first' } }); t.after(() => env.close());
  const { game, window, click, step, key } = env;
  assert.equal(game.cameraMode, 'first');
  click('startBtn'); step(.1);
  assert.equal(game.mode, 'intro'); assert.ok(game.player.visible);
  click('skipBtn'); step(.1);
  assert.equal(game.player.visible, false);
  assert.ok(Math.abs(game.camera.position.y - game.alt - 1.65) < .001);
  assert.ok(Math.abs(game.camera.position.x - game.player.position.x) < .001);
  assert.equal(window.document.getElementById('cameraLabel').textContent, '1P');
  key('KeyV'); key('KeyV', false); step(.05);
  assert.equal(game.cameraMode, 'third'); assert.ok(game.player.visible);
  assert.equal(window.localStorage.getItem('szCamera'), 'third');
  click('cameraBtn'); step(.05); assert.equal(game.cameraMode, 'first');
  game.pause(true);
  window.document.querySelector('[data-camera="third"]').click();
  assert.equal(game.cameraMode, 'third');
  assert.equal(window.document.querySelector('[data-camera="third"]').getAttribute('aria-pressed'), 'true');
  game.resume(); step(.05); assert.ok(game.player.visible);
});

test('First-person flight follows eye height and can aim/cast down without seeing the soldier', async t => {
  const env = await createGame({ storage: { szCamera: 'first' } }); t.after(() => env.close()); env.start();
  const { game, key, step } = env;
  game.setPos(0, 0); key('Space'); step(.8);
  assert.ok(game.jetpack.active); assert.equal(game.player.visible, false);
  assert.ok(Math.abs(game.camera.position.y - game.alt - 1.65) < .001);
  game.setView(0, -1.15); step(.05);
  assert.ok(game.camera.rotation.x < -1);
  key('KeyF'); key('KeyF', false); step(.05);
  assert.ok(game.frozenOrb.cooldown > 7);
  key('KeyV'); key('KeyV', false); step(.05);
  assert.equal(game.cameraMode, 'third'); assert.ok(game.player.visible);
  assert.ok(game.camera.rotation.x >= -.71);
});

test('All first-person weapon variants fire real rounds from the visible view', async t => {
  for (const weapon of ['rifle', 'burst', 'scatter']) {
    const env = await createGame({ seed: 4211, storage: { szCamera: 'first', szWeapon: weapon } });
    t.after(() => env.close()); env.start();
    const { game, window, step } = env;
    game.clearWave(); game.setPos(0, 0); game.setView(0, -.05);
    const enemy = game.spawnElite(); enemy.position.set(0, game.alt, -6); enemy.userData.speed = 0; enemy.userData.hp = 1000;
    step(.1);
    window.document.querySelector('canvas').dispatchEvent(new window.MouseEvent('mousedown', { button: 0, bubbles: true }));
    step(1);
    window.dispatchEvent(new window.MouseEvent('mouseup'));
    assert.ok(game.combat.shots > 0, `${weapon} fires in first person`);
    assert.ok(enemy.userData.hp < 1000, `${weapon} hits a visible enemy`);
    assert.equal(game.player.visible, false);
  }
});
