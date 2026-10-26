import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from './harness.mjs';
import { Matrix4, Vector3, Raycaster } from '../vendor/three/build/three.module.js';

test('120 Hz phones keep a 60 fps play budget without slowing the simulation clock', async t => {
  const env = await createGame({ touch: true });
  t.after(() => env.close());
  const menuFrames = env.game.PF.ms.length;
  env.step(1, 120);
  assert.ok(env.game.PF.ms.length - menuFrames <= 32, 'the animated phone menu renders at about 30 fps');
  env.start();
  const before = { frames: env.game.PF.ms.length, time: env.game.time };
  env.step(1, 120);
  const frames = env.game.PF.ms.length - before.frames;
  assert.ok(frames >= 55 && frames <= 62, `play uses about 60 renders per second (${frames})`);
  assert.ok(Math.abs(env.game.time - before.time - 1) < 0.05, 'the game still advances one second at 120 Hz');
});

test('Palm Isle: deployment, combat, pause, recovery, persistence and restart', async t => {
  const env = await createGame();
  t.after(() => env.close());
  const { game, window, step, key, click } = env;
  const $ = id => window.document.getElementById(id);
  assert.equal(game.mode, 'menu');
  assert.equal(window.document.querySelectorAll('.qbtns button').length, 8);
  assert.ok(window.document.querySelector('[data-l="2"]').disabled);
  assert.ok(window.document.querySelector('[data-l="2"] strong'), 'locked card keeps its styled contents');
  env.start();
  assert.equal(game.mode, 'play');
  assert.equal(game.wave, 1);
  assert.equal(game.hp, 100);
  assert.ok(window.document.body.classList.contains('playing'));

  key('KeyW'); step(.15); key('KeyP');
  assert.ok(game.paused);
  const frozen = { pos: [...game.pos], hp: game.hp, time: game.time, spawn: game.toSpawn };
  step(2);
  assert.deepEqual([...game.pos], frozen.pos);
  assert.equal(game.hp, frozen.hp);
  assert.equal(game.time, frozen.time);
  assert.equal(game.toSpawn, frozen.spawn);
  assert.equal(game.firing, false);
  click('resumeBtn'); step(.2);
  assert.ok(!game.paused);
  assert.equal(game.pos[0], frozen.pos[0], 'movement input cleared on pause');
  assert.equal(game.pos[2], frozen.pos[2]);

  click('gearBtn');
  window.document.dispatchEvent(new window.Event('pointerlockchange'));
  assert.ok(game.paused);
  assert.ok(!$('setPanel').classList.contains('hide'));
  click('muteBtn');
  assert.ok(game.muted);
  assert.equal(window.localStorage.getItem('szMuted'), '1');
  click('setClose');
  assert.ok(!game.paused);
  window.dispatchEvent(new window.Event('blur'));
  assert.ok(game.paused, 'switching away pauses the game');
  window.dispatchEvent(new window.Event('focus'));
  click('resumeBtn');

  game.spawnNear();
  const target = game.zombies.at(-1);
  target.userData.speed = 0;
  const headMaterials = new Set(), bodyMaterials = new Set(), disposed = new Map();
  target.userData.head.traverse(object => { if (object.material) headMaterials.add(object.material); });
  target.traverse(object => {
    let ancestor = object;
    while (ancestor && ancestor !== target.userData.head) ancestor = ancestor.parent;
    if (!ancestor && object.material) bodyMaterials.add(object.material);
  });
  for (const material of headMaterials) if (!bodyMaterials.has(material)) {
    disposed.set(material, 0);
    material.addEventListener('dispose', () => disposed.set(material, disposed.get(material) + 1));
  }
  window.document.querySelector('canvas').dispatchEvent(new window.MouseEvent('mousedown', { button: 0, bubbles: true }));
  step(2);
  window.dispatchEvent(new window.MouseEvent('mouseup'));
  assert.ok(game.score >= 10, 'aim-assisted fire kills a nearby zombie and awards points');
  assert.ok(game.heads > 0);
  assert.ok(game.combat.kills > 0);
  assert.ok(game.combat.shots >= game.combat.hits && game.combat.hits > 0);

  game.hp = 50;
  game.clearWave(); step(.05);
  assert.equal(game.hp, 75, 'wave clear grants 25 HP');
  assert.equal(game.wave, 1);
  assert.ok(game.waveBreak > 3);
  assert.match($('waveBanner').textContent, /clear/i);
  assert.equal($('waveProgress').getAttribute('aria-valuenow'), '7');
  step(3);
  assert.equal(game.toSpawn, 0, 'recovery period has no spawning');
  step(1.2);
  assert.equal(game.mode, 'upgrade');
  env.chooseUpgrade();
  assert.equal(game.wave, 2);
  assert.ok(game.toSpawn > 0);
  assert.ok(disposed.size > 0);
  for (const count of disposed.values()) assert.equal(count, 1, 'head-only materials are disposed once after debris expires');

  game.score = 120;
  assert.equal(game.bestScore, 120);
  assert.equal($('bestScore').textContent, '120');
  game.damage(1000);
  assert.equal(game.mode, 'over');
  assert.equal($('finalScore').textContent, '120');
  assert.equal($('finalKills').textContent, String(game.combat.kills));
  assert.match($('finalTime').textContent, /^\d+:\d{2}$/);
  assert.match($('finalAccuracy').textContent, /^\d+%$/);
  assert.ok(!$('over').classList.contains('hide'));
  click('restartBtn'); step(.1);
  assert.equal(game.mode, 'play');
  assert.equal(game.hp, 100);
  assert.equal(game.wave, 1);
  assert.equal(game.score, 0);
  assert.equal(game.combat.kills, 0);
  assert.equal(game.combat.shots, 0);
  assert.equal(game.bestScore, 120);
  assert.ok($('over').classList.contains('hide'));

  key('KeyP'); click('pauseMenuBtn');
  assert.equal(game.mode, 'menu');
  assert.equal(game.paused, false);
  assert.equal(game.bestScore, 120);
  assert.equal(game.zombies.length, 0);
  assert.ok(!$('start').classList.contains('hide'));
  assert.ok(!window.document.body.classList.contains('playing'));
  click('startBtn'); step(.1);
  assert.equal(game.mode, 'intro', 'new deployment replays insertion');
  key('Space'); step(.1);
  assert.equal(game.mode, 'play');
  game.damage(1000); click('overMenuBtn');
  assert.equal(game.mode, 'menu', 'debrief can return to briefing');
  env.start();

  for (let wave = 1; wave <= 5; wave++) {
    assert.equal(game.wave, wave);
    game.clearWave(); step(4.15);
    assert.equal(game.mode, 'upgrade');
    if (wave === 5) {
      assert.equal(window.localStorage.getItem('szUnlocked'), '2', 'island unlock is earned before choosing whether to continue');
      assert.ok(!window.document.querySelector('[data-l="2"]').disabled, 'returning to briefing offers the earned island immediately');
    }
    env.chooseUpgrade();
  }
  assert.equal(game.mode, 'trans');
  assert.equal(window.localStorage.getItem('szUnlocked'), '2', 'five completed waves unlock Ember Isle');
});

test('Ember Isle: volcanic damage and pause during insertion', async t => {
  const env = await createGame({ level: 2 });
  t.after(() => env.close());
  const { game, window, step, key, click } = env;
  click('startBtn'); step(.1);
  assert.equal(game.mode, 'intro');
  key('Escape');
  const altitude = game.alt;
  step(1);
  assert.equal(game.alt, altitude);
  assert.ok(game.paused);
  click('resumeBtn'); key('Space'); step(.1);
  assert.equal(game.mode, 'play');
  assert.ok(window.document.getElementById('lvlCard').classList.contains('hide'), 'insertion title never obscures combat after skipping');
  const lava = game.lavaSpot();
  assert.ok(lava, 'volcanic world has hazardous lava');
  game.setPos(...lava); step(.25);
  assert.ok(game.hp < 100, 'lava drains health');
  assert.ok(window.document.getElementById('vig').classList.contains('burn'));
  assert.ok(Number.isFinite(game.hp));
});

test('Mobile controls use nested icons and cancel held input on pause', async t => {
  const env = await createGame({ touch: true });
  t.after(() => env.close());
  const { game, window, step, click } = env;
  env.start();
  assert.ok(window.document.body.classList.contains('touch'));
  const icon = window.document.querySelector('#fireBtn svg');
  const touch = { identifier: 42, clientX: 790, clientY: 330, target: icon };
  const event = new window.Event('touchstart', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'changedTouches', { value: [touch] });
  icon.dispatchEvent(event); step(.1);
  assert.ok(game.firing, 'touching the fire icon fires');
  click('pauseBtn');
  assert.ok(game.paused);
  assert.equal(game.firing, false);
});

test('Camera keeps a clear view of the soldier beside palm trunks', async t => {
  const env = await createGame({ seed: 4211 });
  t.after(() => env.close());
  env.start();
  const { game, step } = env;
  const trunks = game.scene.getObjectByName('palm-trunks');
  assert.ok(trunks?.isInstancedMesh);
  const matrix = new Matrix4(), position = new Vector3();
  for (let i = 0; i < trunks.count; i++) {
    trunks.getMatrixAt(i, matrix);
    position.setFromMatrixPosition(matrix);
    // This offset leaves the shoulder ray clear while the trunk can obscure
    // the soldier. Check the actual sightline after the camera has updated.
    game.setPos(position.x - .5, position.z - 2.5);
    game.setView(0);
    step(1 / 60);
    const chest = game.player.position.clone().add(new Vector3(0, 1.4, 0));
    const direction = game.camera.position.clone().sub(chest);
    const distance = direction.length();
    const ray = new Raycaster(chest, direction.normalize(), 0, Math.max(0, distance - .05));
    assert.equal(ray.intersectObject(trunks).length, 0, `palm ${i} must not obscure the soldier`);
  }
  game.returnToMenu(); step(1 / 60);
  assert.ok(game.player.visible, 'menu restores soldier visibility after a tight camera position');
});

test('Phone rotation releases held controls and portrait framing preserves the run', async t => {
  const env = await createGame({ touch: true });
  t.after(() => env.close());
  const { game, window, step } = env;
  env.start();
  const canvas = window.document.querySelector('canvas');
  const fire = window.document.getElementById('fireBtn');
  const touchEvent = (type, target, touches) => {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'changedTouches', { value: touches });
    target.dispatchEvent(event);
  };
  const thumb = { identifier: 1, clientX: 0, clientY: 0, target: canvas };
  touchEvent('touchstart', canvas, [thumb]);
  touchEvent('touchmove', canvas, [{ ...thumb, clientY: -40 }]); step(.1);
  assert.ok(window.document.body.classList.contains('sprinting'), 'fully pushing the stick sprints');
  touchEvent('touchstart', fire, [{identifier: 2, clientX: 750, clientY: 300, target: fire}]); step(.05);
  assert.ok(game.firing);
  assert.ok(!window.document.body.classList.contains('sprinting'), 'firing steadies movement');

  const wave = game.wave, hp = game.hp, score = game.score;
  window.innerWidth = 390; window.innerHeight = 844;
  window.dispatchEvent(new window.Event('resize'));
  assert.equal(game.firing, false);
  assert.equal(game.camera.aspect, 390 / 844);
  assert.ok(game.camera.fov > 90, 'portrait gets a wider useful field of view');
  const position = [...game.pos]; step(.2);
  assert.equal(game.pos[0], position[0]); assert.equal(game.pos[2], position[2]);
  assert.equal(game.wave, wave); assert.equal(game.hp, hp); assert.equal(game.score, score);
  assert.ok(!fire.classList.contains('active'));

  game.pause(); const time = game.time;
  window.innerWidth = 844; window.innerHeight = 390;
  window.dispatchEvent(new window.Event('resize')); step(.5);
  assert.equal(game.time, time);
  assert.equal(game.camera.aspect, 844 / 390);
  assert.ok(game.paused);
  game.resume(); step(.1);
  assert.equal(game.mode, 'play'); assert.equal(game.firing, false);
});

test('Camera comfort settings persist and scale actual mouse and touch look', async t => {
  for (const touch of [false, true]) {
    const env = await createGame({ touch, storage: { szSensitivity: '1.5', szMotion: 'reduced' } });
    t.after(() => env.close());
    const { game, window, click, step } = env;
    const slider = window.document.getElementById('lookSensitivity');
    assert.equal(slider.value, '1.5');
    assert.ok(window.document.body.classList.contains('reduced-motion'));
    env.start();
    const canvas = window.document.querySelector('canvas');
    const turn = () => {
      if (!touch) {
        const event = new window.MouseEvent('mousemove', { bubbles: true });
        Object.defineProperties(event, { movementX: { value: 20 }, movementY: { value: 0 } });
        window.dispatchEvent(event);
      } else {
        const send = (type, x) => {
          const event = new window.Event(type, { bubbles: true, cancelable: true });
          Object.defineProperty(event, 'changedTouches', { value: [{ identifier: 9, clientX: x, clientY: 180, target: canvas }] });
          canvas.dispatchEvent(event);
        };
        send('touchstart', 600); send('touchmove', 620); send('touchend', 620);
      }
    };
    game.setView(0); turn();
    const fast = Math.abs(game.yaw);
    assert.ok(fast > .01);
    game.pause(true);
    slider.value = '.75';
    slider.dispatchEvent(new window.Event('input', { bubbles: true }));
    slider.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal(window.localStorage.getItem('szSensitivity'), '0.75');
    assert.equal(window.document.getElementById('lookSensitivityValue').textContent, '0.75×');
    click('motionBtn');
    assert.equal(window.localStorage.getItem('szMotion'), 'auto');
    assert.ok(!window.document.body.classList.contains('reduced-motion'));
    slider.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight', bubbles: true }));
    const position = [...game.pos];
    game.resume(); game.setView(0); turn();
    assert.ok(Math.abs(Math.abs(game.yaw) - fast / 2) < .0001, `${touch ? 'touch' : 'mouse'} turn uses chosen sensitivity`);
    step(.05);
    assert.equal(game.pos[0], position[0]); assert.equal(game.pos[2], position[2]);
  }
});

test('Melee wind-up gives time to dodge, freezes on pause, and strikes once per attack', async t => {
  const env = await createGame();
  t.after(() => env.close());
  const { game, step, key } = env;
  env.start();
  game.spawnNear();
  const enemy = game.zombies.at(-1);
  enemy.userData.type = 'walker'; enemy.userData.speed = 0;
  enemy.position.copy(game.player.position).x += .95;
  step(.02);
  assert.ok(enemy.userData.attackWind > .3);
  assert.equal(game.hp, 100, 'contact does not deal instant damage');
  step(.2);
  const wind = enemy.userData.attackWind, seconds = game.combat.seconds;
  game.pause(); step(1);
  assert.equal(enemy.userData.attackWind, wind);
  assert.equal(game.combat.seconds, seconds);
  game.resume();
  key('Space'); key('Space', false); step(.25);
  assert.equal(game.hp, 100, 'jumping during the wind-up dodges the strike');
  step(.65);
  enemy.position.copy(game.player.position).x += .95;
  enemy.userData.attackWind = .1; enemy.userData.attackCooldown = 0;
  step(.15);
  assert.equal(game.hp, 82, 'a grounded walker strike deals one 18 HP hit');
  step(.15);
  assert.equal(game.hp, 82, 'recovery prevents continuous contact damage');
  enemy.userData.attackWind = .2;
  game.setPos(game.pos[0] - 3, game.pos[2]);
  step(.25);
  assert.equal(game.hp, 82, 'moving away makes a committed attack miss');
});

test('Solid palm trunks block enemy melee strikes', async t => {
  const env = await createGame({ seed: 4211 });
  t.after(() => env.close());
  const { game, step } = env;
  env.start(); game.spawnNear();
  const enemy = game.zombies.at(-1), trunks = game.scene.getObjectByName('palm-trunks');
  const matrix = new Matrix4(), position = new Vector3();
  trunks.getMatrixAt(0, matrix); position.setFromMatrixPosition(matrix);
  // Use a narrow collision proxy to put both actors in melee range while
  // retaining the actual trunk mesh as the solid obstruction for this case.
  const proxy = game.colliders.circles.find(c => Math.hypot(c.x - position.x, c.z - position.z) < .01);
  assert.ok(proxy); proxy.r = .1;
  game.setPos(position.x - .58, position.z);
  enemy.position.set(position.x + .58, game.player.position.y, position.z);
  enemy.userData.type = 'walker'; enemy.userData.speed = 0;
  step(.02);
  assert.ok(game.player.position.distanceTo(enemy.position) < 1.5, 'target is in attack range');
  enemy.userData.attackWind = .03;
  step(.08);
  assert.equal(game.hp, 100, 'a trunk between the enemy and player blocks damage');
});

test('Enemies navigate around actual island huts and crates without crossing colliders', async t => {
  for (const kind of ['hut', 'crate']) {
    const env = await createGame({ seed: 4211 });
    t.after(() => env.close());
    const { game, step } = env;
    env.start(); game.clearWave();
    const obstacle = kind === 'hut' ? game.colliders.circles.find(c => c.r > 2 && Math.hypot(c.x, c.z) < 70) : game.colliders.boxes[0];
    assert.ok(obstacle);
    const radius = kind === 'hut' ? obstacle.r : obstacle.hz;
    game.setPos(obstacle.x, obstacle.z + radius + 5);
    game.spawnNear();
    const enemy = game.zombies.at(-1);
    enemy.position.set(obstacle.x, game.pos[1], obstacle.z - radius - 5);
    enemy.userData.speed = 2; enemy.userData.hp = 1000;
    let closest = Infinity;
    for (let frame = 0; frame < 900; frame++) {
      step(1 / 60);
      const x = enemy.position.x - obstacle.x, z = enemy.position.z - obstacle.z;
      closest = Math.min(closest, kind === 'hut' ? Math.hypot(x, z) - radius : Math.hypot(Math.max(0, Math.abs(x) - obstacle.hx), Math.max(0, Math.abs(z) - obstacle.hz)));
      if (Math.hypot(enemy.position.x - game.pos[0], enemy.position.z - game.pos[2]) < 1.2) break;
    }
    assert.ok(closest >= .34, `${kind}: enemy stays outside collider`);
    assert.ok(Math.hypot(enemy.position.x - game.pos[0], enemy.position.z - game.pos[2]) < 1.2, `${kind}: enemy routes around the obstacle and reaches player`);
  }
});

test('Palm-to-Ember deployment continues score, combat statistics and record status', async t => {
  const palm = await createGame();
  t.after(() => palm.close());
  palm.start(); palm.game.spawnNear();
  palm.game.zombies.at(-1).userData.speed = 0;
  palm.window.document.querySelector('canvas').dispatchEvent(new palm.window.MouseEvent('mousedown', { button: 0, bubbles: true }));
  palm.step(2);
  palm.window.dispatchEvent(new palm.window.MouseEvent('mouseup'));
  assert.ok(palm.game.combat.kills > 0);
  for (let wave = 1; wave <= 5; wave++) { palm.game.clearWave(); palm.step(4.15); palm.chooseUpgrade(); }
  assert.equal(palm.game.mode, 'trans');
  const stats = palm.game.combat, score = palm.game.score;
  const build = JSON.stringify(palm.game.progression.ranks);
  const carry = palm.window.sessionStorage.getItem('szCarry');
  assert.ok(carry);
  const ember = await createGame({ level: 2, go: true, storage: { szBest: String(score) }, session: { szCarry: carry } });
  t.after(() => ember.close());
  assert.equal(ember.game.mode, 'intro');
  assert.equal(ember.game.score, score);
  assert.equal(JSON.stringify(ember.game.progression.ranks), build, 'upgrade build continues across islands');
  for (const key of ['kills', 'seconds', 'shots', 'hits']) assert.equal(ember.game.combat[key], stats[key], `continued ${key}`);
  assert.equal(ember.window.sessionStorage.getItem('szCarry'), null, 'transfer is consumed once');
  ember.click('skipBtn'); ember.step(.02); ember.game.damage(1000);
  assert.equal(ember.window.document.getElementById('finalKills').textContent, String(stats.kills));
  assert.equal(ember.window.document.getElementById('finalRecord').textContent, 'NEW PERSONAL BEST');
});

test('Jump tolerates terrain gaps and buffers a tap before landing without double jumping', async t => {
  const env = await createGame();
  t.after(() => env.close());
  const { game, step, key } = env;
  env.start();
  const ground = game.alt;
  game.setAlt(ground + .04); // A tiny downhill gap just after leaving ground.
  key('Space'); key('Space', false); step(.1);
  assert.ok(game.alt > ground + .5, 'recent ground contact keeps a downhill jump responsive');
  step(.44);
  const descending = game.alt;
  key('Space'); key('Space', false); step(.03);
  assert.ok(game.alt < descending, 'buffering while falling does not jump in midair');
  step(.2);
  assert.ok(game.alt > ground + .4, 'tap shortly before landing triggers the next grounded jump');
});

test('Startup context loss does not leave Deploy disabled after loading completes', async t => {
  const env = await createGame();
  t.after(() => env.close());
  const { game, window, step, click } = env;
  const canvas = window.document.querySelector('canvas');
  const deploy = window.document.getElementById('startBtn');
  deploy.disabled = true;
  window.document.body.dataset.ready = 'loading';

  const loss = new window.Event('webglcontextlost', { cancelable: true });
  canvas.dispatchEvent(loss);
  assert.ok(loss.defaultPrevented, 'context recovery remains enabled');
  assert.ok(game.graphicsLost);
  assert.ok(deploy.disabled);
  const frozenTime = game.time;
  step(.2);
  assert.equal(game.time, frozenTime, 'the loading menu also freezes while graphics are unavailable');

  // The module finishes loading before the browser delivers restoration.
  window.document.body.dataset.ready = 'true';
  canvas.dispatchEvent(new window.Event('webglcontextrestored'));
  assert.equal(game.graphicsLost, false);
  assert.equal(deploy.disabled, false, 'loading-time disabled state must not override completed boot');
  click('startBtn'); step(.02);
  assert.equal(game.mode, 'intro', 'the recovered deployment action starts the game');
});
