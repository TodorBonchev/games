import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/build/three.module.js';
import { games } from '../arcade/skill-games.js';

function make(id) {
  const root = new THREE.Group(), sounds = [];
  const game = games.find(g => g.id === id).create({ THREE, root, reducedMotion: true, sound: (...args) => sounds.push(args) });
  return { game, root, sounds };
}
const step = (game, duration) => { for (let t = 0; t < duration - 1e-8; t += .02) game.update(Math.min(.02, duration - t)); };
const tap = (game, x, z) => { game.pointer('down', x, z); game.pointer('up', x, z); };
const node = (root, name) => { const mesh = root.getObjectByName(name); assert.ok(mesh, name); return mesh; };

test('Tidehook moving catch cue agrees with successful releases and explains misses', () => {
  const { game, root } = make('tidehook');
  game.pointer('down', game.state.fishX, 0);
  for (let i = 0; i < 300 && !/RELEASE NOW/.test(game.hud().hint); i++) {
    game.update(.02); game.pointer('move', game.state.fishX, 0);
  }
  game.sync();
  assert.equal(node(root, 'Release cue').visible, true);
  assert.equal(node(root, 'Catch window').position.x, game.state.fishX);
  assert.equal(node(root, 'Catch window').position.z, game.state.fishZ);
  game.pointer('up', game.state.fishX, 0); assert.equal(game.state.caught, 1);
  assert.match(game.hud().hint, /Good catch/);
  game.pointer('down', -4, 0); game.pointer('up', -4, 0);
  assert.equal(game.state.misses, 1); assert.match(game.hud().hint, /Slide the hook/);
  const restored = make('tidehook').game; assert.ok(restored.restore(game.snapshot()));
  assert.equal(restored.state.misses, 1); game.dispose(); restored.dispose();
});

test('Bellwood free replay clears partial input, keeps chances and remains fully playable', () => {
  const { game, root } = make('bellwood-beats');
  assert.ok(game.action('replay')); assert.deepEqual(game.actions, []); step(game, 2.2);
  tap(game, -3, 0); game.sync(); assert.equal(game.state.input, 1);
  assert.ok(node(root, 'Song progress 1').scale.y > node(root, 'Song progress 2').scale.y);
  assert.ok(game.action('replay')); assert.equal(game.state.input, 0); assert.equal(game.state.mistakes, 0);
  assert.equal(game.action('replay'), false, 'cannot double-trigger the playback');
  step(game, 2.2);
  for (const [round, phrase] of [[0,[0,1,2]], [1,[2,0,1,2]], [2,[1,2,0,2,1]]]) {
    if (round) { game.action('replay'); step(game, 4); }
    for (const note of phrase) tap(game, [-3,0,3][note], 0);
  }
  assert.equal(game.state.mode, 'won'); assert.equal(game.state.mistakes, 0);
  assert.deepEqual(game.actions, []); game.dispose();
});

test('Parcel symbols match depot identities and previews warn without consuming chances', () => {
  const { game, root } = make('parcel-parade');
  const colors = [0,2,1,0,1,2,0,2,1], xs = [-3.4,0,3.4];
  for (const color of colors) {
    game.sync(); assert.equal([1,2,3].filter(i => node(root, `Parcel symbol ${i}`).visible).length, color + 1);
    game.pointer('down', 0, game.state.z);
    game.pointer('move', xs[(color + 1) % 3], -3.65); game.sync();
    assert.equal(node(root, 'Depot drop preview').visible, true); assert.match(game.hud().hint, /Different symbol/);
    assert.equal(game.state.mistakes, 0);
    game.pointer('move', xs[color], -3.65); game.sync(); assert.match(game.hud().hint, /Matching depot/);
    game.pointer('up', xs[color], -3.65);
  }
  assert.equal(game.state.mode, 'won'); assert.equal(game.state.mistakes, 0); game.dispose();
});

test('Wobble vane reverses with real wind and balance warning appears before a slip', () => {
  const { game, root } = make('wobble-bakery');
  game.pointer('down', 0, 0);
  let warning = false, directions = new Set();
  for (let i = 0; i < 1510 && game.state.mode === 'playing'; i++) {
    // Follow for a full playthrough, except briefly leave the tray behind to expose the warning.
    if (i < 90 || i > 130) game.pointer('move', game.state.cake, 0);
    game.update(.02); game.sync(); directions.add(node(root, 'Wind direction').rotation.y);
    if (game.state.danger > 0) { warning = true; assert.equal(node(root, 'Balance warning').visible, true); assert.match(game.hud().hint, /Cake tipping/); }
  }
  assert.equal(game.state.mode, 'won'); assert.ok(warning); assert.ok(directions.has(0) && directions.has(Math.PI));
  assert.ok(game.state.slips < 3); game.dispose();
});

test('Mothlight shows lost contact and active route without moving the moth for the player', () => {
  const { game, root } = make('mothlight'), start = { x: game.state.mothX, z: game.state.mothZ };
  game.pointer('down', 5, -5); step(game, .1); game.sync();
  assert.equal(node(root, 'Moth connection').visible, false); assert.match(game.hud().hint, /lost your light/);
  assert.equal(game.state.mothX, start.x); assert.equal(game.state.mothZ, start.z);
  game.pointer('move', start.x + 1, start.z); game.sync(); assert.equal(node(root, 'Moth connection').visible, true);
  assert.deepEqual([node(root, 'Active flower').position.x, node(root, 'Active flower').position.z], [3.7,-2.8]);
  const end = [3.7,-2.8];
  for (let i = 0; i < 500 && !game.state.delivered; i++) {
    const dx = end[0]-game.state.mothX, dz=end[1]-game.state.mothZ, d=Math.hypot(dx,dz)||1;
    game.pointer('move',game.state.mothX+dx/d,game.state.mothZ+dz/d);game.update(.02);
  }
  assert.equal(game.state.delivered, 1); game.sync();
  assert.deepEqual([node(root, 'Active flower').position.x, node(root, 'Active flower').position.z], [-3.7,-2.8]);
  game.pointer('cancel',0,0);game.sync();assert.equal(node(root,'Moth connection').visible,false);game.dispose();
});

test('Cloud Potter previews a swipe without committing it and shows completed rows', () => {
  const { game, root } = make('cloud-potter');
  game.sync(); assert.equal(node(root, 'Matched clay row 3').visible, true);
  game.pointer('down', 2, -2.65); game.pointer('move', 1, -2.65); game.sync();
  assert.equal(node(root, 'Clay swipe preview').visible, true); assert.equal(node(root, 'Clay swipe preview').scale.x, 1.02);
  assert.equal(game.state.widths[0],2);assert.equal(game.state.moves,0);
  game.pointer('cancel',1,-2.65);game.sync();assert.equal(node(root,'Clay swipe preview').visible,false);assert.equal(game.state.widths[0],2);
  game.pointer('down',2,-2.65);game.pointer('move',1,-2.65);game.pointer('up',1,-2.65);game.sync();
  assert.equal(game.state.widths[0],1);assert.equal(game.state.moves,1);assert.equal(node(root,'Matched clay row 1').visible,true);
  const restored=make('cloud-potter').game;assert.ok(restored.restore(game.snapshot()));assert.deepEqual(restored.snapshot(),game.snapshot());game.dispose();restored.dispose();
});
