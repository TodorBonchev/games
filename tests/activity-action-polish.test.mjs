import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/build/three.module.js';
import { games } from '../arcade/action-games.js';

function make(id, options = {}) {
  const root = new THREE.Group(), sounds = [];
  const game = games.find(spec => spec.id === id).create({ THREE, root, sound: (...args) => sounds.push(args), ...options });
  return { game, root, sounds };
}
const advance = (game, seconds, choose = () => {}) => {
  for (let i = 0; i < Math.round(seconds / .025) && game.state.mode === 'playing'; i++) { choose(game); game.update(.025); game.sync(); }
};
const tap = (game, x = 0, z = 0) => { game.pointer('down', x, z); game.pointer('up', x, z); };

test('Lane Lark predicts note/thorn arrival lanes and acknowledges real catches', () => {
  const { game, root, sounds } = make('lane-lark');
  advance(game, 2);
  const note = game.state.items.find(it => it.status === 1 && it.kind === 1);
  const thorn = game.state.items.find(it => it.status === 1 && it.kind === 2);
  assert.equal(root.getObjectByName(`Lane arrival ${note.lane}`).material.color.getHexString(), 'ffe18a');
  assert.equal(root.getObjectByName(`Lane arrival ${thorn.lane}`).material.color.getHexString(), 'ff8198');
  tap(game, [-3.3, 0, 3.3][note.lane]);
  while (game.state.score === 0) advance(game, .025);
  assert.match(game.hud().hint, /Note caught/); assert.ok(sounds.length);
  const marker = root.getObjectByName(`Lane arrival ${note.lane}`);
  assert.equal(marker.scale.x, .78, 'selected arrival lane is visibly larger');
});

test('Orbit Guard marks interception alignment and previews the next approach before impact', () => {
  const { game, root } = make('orbit-guard');
  assert.equal(root.getObjectByName('Next orbit approach').visible, false);
  advance(game, 1);
  const next = root.getObjectByName('Next orbit approach'); assert.equal(next.visible, true);
  assert.ok(Math.abs(Math.atan2(next.position.z, next.position.x) - 2.399963) < 1e-6);
  game.pointer('move', -4, 0); game.sync();
  assert.equal(root.getObjectByName('Orbit interception marker').material.color.getHexString(), 'ffce83');
  game.pointer('move', 4, 0); game.sync();
  assert.equal(root.getObjectByName('Orbit interception marker').material.color.getHexString(), 'a9f6c6');
  while (!game.state.hits) advance(game, .025);
  assert.match(game.hud().hint, /Centered catch/); assert.equal(game.state.health, 4);
});

test('Cloud Skimmer shows the next ring altitude and differentiates a precise pass', () => {
  const { game, root } = make('cloud-skimmer'); let held = false;
  advance(game, 3.1, g => {
    const next = g.state.gates.find(gate => gate.status === 0); if (!next) return;
    const desired = Math.max(-2.2, Math.min(2.2, (next.z - g.state.z) * 1.7));
    const shouldHold = g.state.velocity > desired;
    if (shouldHold !== held) { g.pointer(shouldHold ? 'down' : 'up'); held = shouldHold; }
  });
  assert.equal(game.state.hits, 1); assert.match(game.hud().hint, /Perfect center/);
  assert.equal(root.getObjectByName('Next ring altitude').position.z, -1.3);
});

test('Ink Sling previews the intercepted bloom and preserves a deliberately queued second shot', () => {
  const { game, root } = make('ink-sling');
  const first = game.state.targets[5], drift = Math.sin(first.z) * .23;
  game.pointer('down', drift, first.z); game.sync();
  assert.equal(root.getObjectByName('Bubble target preview').visible, true);
  assert.equal(root.getObjectByName('Bubble target preview').position.z, first.z);
  game.pointer('up', drift, first.z);
  tap(game, -3.5, -3.8);
  assert.equal(game.state.queued.active, true); assert.match(game.hud().secondary, /QUEUED/);
  const saved = game.snapshot(), { game: copy } = make('ink-sling');
  assert.ok(copy.restore(saved)); assert.equal(copy.state.queued.active, true);
  advance(copy, .7);
  assert.equal(copy.state.hits, 1); assert.equal(copy.state.queued.active, false);
  assert.equal(copy.state.shot.active, true); assert.ok(copy.state.shot.vx < 0);
  const old = game.snapshot(); delete old.state.queued;
  assert.ok(copy.restore(old), 'checkpoints from before queued shots remain compatible');
  assert.equal(copy.state.queued.active, false);
  const before = copy.snapshot(), corrupt = structuredClone(before); corrupt.state.queued.x = Infinity;
  assert.equal(copy.restore(corrupt), false); assert.deepEqual(copy.snapshot(), before);
});

test('Ink Sling cancelled aiming never schedules a follow-up shot', () => {
  const { game } = make('ink-sling');
  tap(game, 0, -.3); game.pointer('down', -3, -4); game.pointer('cancel'); game.pointer('up', -3, -4);
  assert.equal(game.state.queued.active, false);
});

test('Bubble Basket projects three upcoming catches with distinct urchin markers', () => {
  const { game, root } = make('bubble-basket');
  advance(game, 3.3, g => { const item = g.state.items.filter(it => it.status === 1).sort((a,b) => b.z-a.z)[0]; if (item) g.pointer('move', item.danger ? item.x > 0 ? -4.9 : 4.9 : item.x); });
  assert.match(game.hud().hint, /Perfect basket catch/);
  const forecasts = [0, 1, 2].map(i => root.getObjectByName(`Catch forecast ${i}`));
  assert.equal(forecasts.filter(mark => mark.visible).length, 3);
  const danger = game.state.items.find(it => it.status === 1 && it.danger);
  const mark = forecasts.find(mark => Math.abs(mark.position.x - danger.x) < .001);
  assert.equal(mark.material.color.getHexString(), 'ff7998');
});

test('Moss Flip telegraphs threatened rails, animates a short crossing, and honors reduced motion', () => {
  const { game, root } = make('moss-flip');
  advance(game, 1.5); assert.match(game.hud().hint, /Flip now/);
  assert.equal(root.getObjectByName('Moss thorn arrival').visible, true);
  assert.equal(root.getObjectByName('Moss safe landing').material.color.getHexString(), 'ffae89');
  tap(game); advance(game, .025);
  const hero = root.getObjectByName('Hero'); assert.ok(hero.position.z < 2.6 && hero.position.z > -2.6);
  assert.ok(hero.position.y > 0); assert.equal(game.state.lane, 1, 'input changes the collision lane immediately');
  advance(game, .5); assert.ok(Math.abs(hero.position.z + 2.6) < .01); assert.ok(Math.abs(hero.position.y) < 1e-10);
  advance(game, 1.8); assert.match(game.hud().hint, /Flip now/, 'incoming danger takes priority over the previous safe-crossing praise');
  const reduced = make('moss-flip', { reducedMotion: true }); tap(reduced.game); advance(reduced.game, .025);
  assert.equal(reduced.root.getObjectByName('Hero').position.z, -2.6); assert.equal(reduced.root.getObjectByName('Hero').position.y, 0);
});

test('Bell Bloom exposes its timing window, distinguishes perfect taps, and forgives a duplicate successful tap', () => {
  const { game, root } = make('bell-bloom');
  advance(game, 1.75); assert.match(game.hud().hint, /NOW/);
  assert.equal(root.getObjectByName('Bell timing window').material.color.getHexString(), 'fff4b6');
  advance(game, .25); tap(game); assert.equal(game.state.hits, 1); assert.match(game.hud().hint, /Perfect bell/);
  tap(game); assert.equal(game.state.faults, 0, 'a doubled physical tap cannot immediately fault the next beat');
  advance(game, .2); tap(game); assert.equal(game.state.faults, 1); assert.match(game.hud().hint, /Too early/);
  const spam = make('bell-bloom').game; for (let i=0;i<7;i++) tap(spam);
  assert.equal(spam.state.mode, 'lost', 'the protection cannot farm success or remove the spam rule');
});
