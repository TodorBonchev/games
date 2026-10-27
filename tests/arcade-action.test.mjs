import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/build/three.module.js';
import { games } from '../arcade/action-games.js';

const byId = Object.fromEntries(games.map(game => [game.id, game]));
const create = id => byId[id].create({ THREE, root: new THREE.Group(), seed: 39211 });
const step = game => { game.update(.025); game.sync(); };
const tap = (game, x=0, z=0) => { game.pointer('down', x, z); game.pointer('up', x, z); };
function finish(game, choose, limit = 12000) {
  for (let i = 0; i < limit && game.state.mode === 'playing'; i++) { choose(game); step(game); }
  assert.equal(game.state.mode, 'won', JSON.stringify({ game: game.snapshot().id, state: game.state }));
}

test('seven action adventures have distinct characters, bounded scenes, and safe independent saves', () => {
  assert.equal(games.length, 7); assert.equal(new Set(games.map(game => game.id)).size, 7);
  assert.equal(new Set(games.map(game => game.hero)).size, 7);
  for (const spec of games) {
    const root = new THREE.Group(), game = spec.create({ THREE, root, seed: 4 });
    assert.ok(root.children.length > 4, `${spec.id} has real scene geometry`);
    for (let i=0;i<20;i++) step(game);
    const saved=game.snapshot(), other=create(spec.id);
    assert.ok(other.restore(saved)); assert.equal(other.state.mode, game.state.mode);
    assert.equal(other.restore(null),false);assert.equal(other.restore({...saved,id:'bad'}),false);
    const bad=structuredClone(saved);bad.state.time=Infinity;assert.equal(other.restore(bad),false);
    assert.doesNotThrow(()=>{other.pointer('cancel',NaN,NaN);other.update(NaN);other.sync();});
    assert.ok(other.hud().primary.length>0 && other.hud().hint.length>0);
  }
});

test('Pip legally follows the moving note rails', () => {
  const game=create('lane-lark');
  finish(game,g=>{const note=g.state.items.filter(i=>i.status===1&&i.kind===1).sort((a,b)=>b.z-a.z)[0];if(note)g.pointer('down',[-3.3,0,3.3][note.lane],0);});
  assert.ok(game.state.score>=14);
});

test('Quill turns the shield toward every incoming star', () => {
  const game=create('orbit-guard');
  finish(game,g=>{const a=g.state.cometAngle;g.pointer('move',Math.cos(a)*4,Math.sin(a)*4);});
  assert.equal(game.state.hits,16);
});

test('Hazel reaches the sky rings using only lift and release', () => {
  const game=create('cloud-skimmer');let holding=false;
  finish(game,g=>{const s=g.state,gate=s.gates.find(item=>item.status===0);if(!gate)return;const desired=Math.max(-2.2,Math.min(2.2,(gate.z-s.z)*1.7));const shouldHold=s.velocity>desired;if(shouldHold!==holding){g.pointer(shouldHold?'down':'up',0,0);holding=shouldHold;}});
  assert.ok(game.state.hits>=8);
});

test('Inky aims bubbles at the moving blooms and can retry misses', () => {
  const game=create('ink-sling');
  finish(game,g=>{if(!g.state.shot.active){const t=g.state.targets.find(t=>t.alive);if(t){const drift=Math.sin(g.state.time*1.15+t.z)*.23;tap(g,t.x+drift,t.z);}}});
  assert.equal(game.state.hits,6);
});

test('Coral catches pearls and steers away from urchins', () => {
  const game=create('bubble-basket');
  finish(game,g=>{const next=g.state.items.filter(i=>i.status===1).sort((a,b)=>b.z-a.z)[0];if(next)g.pointer('move',next.danger?(next.x>0?-4.9:4.9):next.x,0);});
  assert.equal(game.state.score,12);
});

test('Bramble flips rails before the approaching thorns', () => {
  const game=create('moss-flip');
  finish(game,g=>{const next=g.state.obstacles.find(o=>o.status===0);if(next&&next.lane===g.state.lane)tap(g);});
  assert.equal(game.state.cleared,22);
});

test('Mira rings the bells by timing real taps', () => {
  const game=create('bell-bloom'),beats=Array.from({length:14},(_,i)=>2+i*1.08+(i>4?Math.sin(i*1.8)*.18:0));
  finish(game,g=>{if(Math.abs(g.state.time-beats[g.state.index])<.025)tap(g);});
  assert.equal(game.state.hits,14);
});

test('each action game requires input rather than winning unattended', () => {
  for (const spec of games) {
    const game=create(spec.id);
    for(let tick=0;tick<4000 && game.state.mode==='playing';tick++) game.update(.05);
    assert.notEqual(game.state.mode,'won',`${spec.id} cannot win while idle`);
  }
});

test('invalid saved indices and inconsistent progress never reach rendering', () => {
  const rail=create('lane-lark'), a=rail.snapshot();a.state.lane=1.5;assert.equal(rail.restore(a),false);
  const bell=create('bell-bloom'), b=bell.snapshot();b.state.index=9;assert.equal(bell.restore(b),false);
  const basket=create('bubble-basket'), c=basket.snapshot();c.state.items[0].status=7;assert.equal(basket.restore(c),false);
});
