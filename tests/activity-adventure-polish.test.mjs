import test from 'node:test';
import assert from 'node:assert/strict';
import { createPopwake, LEVELS as POP_LEVELS, parsePopwakeSave } from '../popwake-game.js';
import { createDewfall, LEVELS as DEW_LEVELS } from '../dewfall-game.js';
import { LEVELS as REEF_LEVELS } from '../ribbon-game.js';
import { createUpside, LEVELS as NIB_LEVELS } from '../upside-game.js';
import { createLegacyController } from '../voyage/legacy.js';
import { createMoonbounceController } from '../activities/moonbounce.js';
import { flightGuidance, reefGuidance, hopGuidance, nibRoute } from '../activities/guidance.js';

function options(level = 1) {
  return { level, seed: 42,
    container: { getBoundingClientRect: () => ({ left: 10, top: 20, width: 300, height: 400 }) },
    view: { pick: (x, z) => ({ x:Math.round(x), z:Math.round(z) }), project: (x, z) => ({ x, y: z }),
      dragVector: (x, y) => ({ vx: x * .12, vy: -y * .12 }), render() {}, dispose() {},
      renderer: { forceContextLoss() {}, domElement: { remove() {} } } },
  };
}
const legacy = (id, level = 1) => createLegacyController(id, options(level));
const advance = (game, seconds) => { for (let i = 0; i < Math.round(seconds * 60); i++) game.update(1 / 60); };
const json = value => JSON.parse(JSON.stringify(value));

test('Popwake undo refunds only placed dominoes and every authored route remains legal and solvable', () => {
  for (const level of POP_LEVELS) {
    const game = createPopwake({ level: level.id }); game.start();
    assert.equal(game.undo(), false);
    assert.ok(game.begin(level.solution[0])); assert.equal(game.undo(), false, 'the starter cannot be removed');
    for (const point of level.solution.slice(1)) assert.ok(game.drag(point));
    const before = json(game.state.trail), used = game.state.used, removed = before.at(-1);
    assert.ok(game.undo());
    assert.equal(game.state.used, used - 1); assert.deepEqual(game.state.trail, before.slice(0, -1));
    assert.deepEqual(game.state.stroke, { x: before.at(-2).x, z: before.at(-2).z });
    assert.equal(game.snapshot().used, 0, 'an interrupted gesture still saves as an idle attempt');
    assert.ok(game.drag(removed)); assert.equal(game.state.used, used);
    assert.ok(game.release()); assert.equal(game.undo(), false, 'a running chain cannot be rewound');
    assert.ok(parsePopwakeSave(json(game.snapshot())), `legal branched trail in level ${level.id}`);
    for (let i = 0; i < 600 && game.state.mode === 'running'; i++) game.advance(1 / 60);
    assert.equal(game.state.mode, 'won', `level ${level.id}`);
    assert.equal(game.undo(), false); assert.ok(parsePopwakeSave(game.snapshot()));
  }
});

test('Popwake adapter keeps an undone domino removed on a stationary release and supports reset/hints', () => {
  const game = legacy('popwake'), path = POP_LEVELS[0].solution;
  assert.equal(game.actions.find(a => a.id === 'undo').disabled, true);
  assert.ok(game.action('hint')); assert.equal(game.engine.state.hintVisible, true);
  game.pointer('down', path[0].x, path[0].z);
  for (const p of path.slice(1, 4)) game.pointer('move', p.x, p.z);
  const used = game.engine.state.used;
  assert.equal(game.actions.find(a => a.id === 'undo').disabled, false);
  assert.equal(game.action('undo', false), false); assert.equal(game.engine.state.used, used);
  assert.ok(game.action('undo')); assert.equal(game.engine.state.used, used - 1);
  // Pointer hardware may send unchanged samples and sub-tile release jitter.
  game.pointer('move', path[3].x, path[3].z); game.pointer('move', path[3].x+.12, path[3].z+.12);
  game.pointer('up', path[3].x+.18, path[3].z+.18);
  assert.equal(game.engine.state.used, used - 1); assert.equal(game.engine.state.mode, 'running');
  const copy = legacy('popwake'); assert.ok(copy.restore(json(game.snapshot())));
  assert.deepEqual(copy.snapshot(), game.snapshot());
  assert.ok(game.action('reset')); assert.equal(game.engine.state.mode, 'playing');
  game.pointer('down', path[0].x, path[0].z); game.pointer('move', path[1].x, path[1].z);
  assert.ok(game.action('undo')); game.pointer('move', path[2].x, path[2].z);
  assert.equal(game.engine.state.used, 2, 'deliberate new movement draws again');
  game.pointer('cancel'); assert.equal(game.action('undo'), false);
});

test('Dewdrop brake suppresses tilt, stops faster than coasting, and preserves ordinary checkpoints', () => {
  for (const level of DEW_LEVELS) {
    const stationary = createDewfall({ level: level.id }); stationary.start();
    const positions = stationary.state.balls.map(({ x, z }) => ({ x, z }));
    for (let i = 0; i < 30; i++) stationary.advance(1 / 60, { x: 1, z: -1, brake: true });
    assert.deepEqual(stationary.state.balls.map(({ x, z }) => ({ x, z })), positions, `no accidental tilt in level ${level.id}`);
    assert.deepEqual(stationary.state.tilt, { x: 0, z: 0 });
  }
  const braking = createDewfall(), coasting = createDewfall(); braking.start(); coasting.start();
  for (let i = 0; i < 30; i++) { braking.advance(1 / 60, { x: 1 }); coasting.advance(1 / 60, { x: 1 }); }
  const start = braking.state.balls[1].x;
  for (let i = 0; i < 15; i++) { braking.advance(1 / 60, { x: 1, brake: true }); coasting.advance(1 / 60); }
  assert.ok(braking.state.balls[1].vx < coasting.state.balls[1].vx * .1);
  assert.ok(braking.state.balls[1].x - start < (coasting.state.balls[1].x - start) * .5);
  const save = json(braking.snapshot()), copy = createDewfall();
  assert.ok(copy.restore(save)); copy.resume(); assert.deepEqual(copy.snapshot(), save);
  const speed = braking.state.balls[1].vx;
  for (let i = 0; i < 15; i++) { braking.advance(1 / 60, { x: 1 }); copy.advance(1 / 60, { x: 1 }); }
  assert.ok(braking.state.balls[1].vx > speed); assert.deepEqual(copy.snapshot(), braking.snapshot());
});

test('Dewdrop held brake survives pointer release and clears on cancellation or restore', () => {
  const game = legacy('dewfall');
  assert.equal(game.actions.find(a => a.id === 'brake').hold, true);
  game.pointer('down', 150, 180); game.pointer('move', 194, 180); advance(game, .3);
  assert.ok(game.action('brake')); game.pointer('up', 194, 180); advance(game, .1);
  assert.match(game.hud().hint, /Brake held/); assert.deepEqual(game.engine.state.tilt, { x: 0, z: 0 });
  assert.ok(game.action('brake', false)); assert.doesNotMatch(game.hud().hint, /Brake held/);
  game.action('brake'); game.pointer('cancel'); assert.doesNotMatch(game.hud().hint, /Brake held/);
  const save = json(game.snapshot()); game.action('brake'); assert.ok(game.restore(save));
  assert.doesNotMatch(game.hud().hint, /Brake held/); assert.deepEqual(game.snapshot(), save);
  game.dispose(); assert.equal(game.action('brake'), false);
});

test('Moonbounce separate launch preserves steering and readiness follows real gathered moons', () => {
  const game = createMoonbounceController(options());
  assert.match(game.hud().hint, /2 more moons/); assert.equal(game.actions[0].disabled, false);
  game.pointer('down', 150, 180);
  for (let tick = 0; tick < 600 && game.engine.state.orbits.length < 6; tick++) {
    const p = game.engine.state.player;
    const moon = game.engine.state.moons.filter(m => !m.cooldown).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    assert.ok(moon); const dx = moon.x - p.x, dz = moon.z - p.z, d = Math.hypot(dx, dz) || 1;
    game.pointer('move', 150 + dx / d * 44, 180 + dz / d * 44); game.update(1 / 60);
  }
  assert.equal(game.engine.state.orbits.length, 6); assert.match(game.hud().hint, /Moonstorm ready/);
  assert.match(game.actions[0].label, /Moonstorm/);
  const before = { ...game.engine.state.player };
  assert.equal(game.action('launch', false), false); assert.equal(game.engine.state.orbits.length, 6);
  assert.ok(game.action('launch')); assert.equal(game.engine.state.orbits.length, 0);
  assert.ok(game.engine.state.shots.every(s => s.storm && s.damage === 3 && s.bounces === 2));
  assert.match(game.hud().hint, /Orbit empty/); assert.equal(game.actions[0].disabled, true);
  game.update(1 / 60);
  assert.ok(Math.hypot(game.engine.state.player.x - before.x, game.engine.state.player.z - before.z) > .01, 'launch did not cancel the active steering gesture');
  game.pointer('cancel'); const saved = json(game.snapshot()), copy = createMoonbounceController(options());
  assert.ok(copy.restore(saved)); assert.deepEqual(copy.snapshot(), saved);
  advance(game, .5); advance(copy, .5); assert.deepEqual(copy.snapshot(), game.snapshot());
});

test('Moonbounce terminal HUD preserves the actual defeat explanation and disables launch', () => {
  const game = createMoonbounceController(options()); advance(game, 180);
  assert.equal(game.state.mode, 'lost'); assert.ok(game.engine.state.reason);
  assert.equal(game.hud().hint, game.engine.state.reason);
  assert.equal(game.actions[0].disabled, true); assert.equal(game.action('launch'), false);
});

test('Lantern compass is relative to heading, wraps correctly and gives actionable altitude/distance', () => {
  const p = { x: 0, y: 9, z: 0, heading: Math.PI };
  const expected = [[0,-10,'↑'],[10,-10,'↗'],[10,0,'→'],[10,10,'↘'],[0,10,'↓'],[-10,10,'↙'],[-10,0,'←'],[-10,-10,'↖']];
  for (const [x,z,arrow] of expected) assert.ok(flightGuidance(p,{x,z,y:9,name:'Beacon'}).startsWith(arrow), `${x},${z}`);
  assert.ok(flightGuidance({...p,heading:0},{x:10,z:0}).startsWith('←'), 'turning around reverses the relative direction');
  assert.ok(flightGuidance({...p,heading:-Math.PI+.01},{x:0,z:-10}).startsWith('↑'));
  assert.match(flightGuidance(p,{x:3,z:4,y:13,instruction:'Deliver the light'}), /5m · Rise 4m · Deliver the light/);
  assert.match(flightGuidance(p,{x:0,z:0,y:5}), /Descend 4m/);
  assert.match(flightGuidance(p,{x:0,z:0}), /Altitude aligned/);
  assert.match(flightGuidance(p,null), /All routes surveyed/);
});

test('Reef arch guidance advances and recent real perfect feedback expires back to navigation', () => {
  const route = REEF_LEVELS[0], first = route.gates[0];
  assert.match(reefGuidance({x:0,y:0,distance:0},route), /centered · height aligned · 4.0s/);
  assert.match(reefGuidance({x:4,y:2,distance:0},route), /← left · ↓ dive/);
  assert.match(reefGuidance({x:-4,y:-2,distance:0},route), /→ right · ↑ rise/);
  assert.match(reefGuidance({x:0,y:0,distance:first.distance},route), /3.0s/);
  assert.match(reefGuidance({x:0,y:0,distance:route.length},route), /Final stretch/);
  const game = legacy('ribbon'); advance(game, 4.05);
  assert.equal(game.engine.state.perfects, 1); assert.match(game.hud().hint, /Perfect arch! 1 in a row/);
  assert.match(game.hud().secondary, /1 perfects/); advance(game, 1);
  assert.match(game.hud().hint, /Next arch:/);
});

test('Hop preview reports safe/perfect/splash results and Cancel aim never launches a hop', () => {
  assert.match(hopGuidance({padId:0},{points:[]}), /Pull a little farther/);
  assert.match(hopGuidance({padId:0},{points:[{}],landing:null}), /Splash ahead/);
  assert.match(hopGuidance({padId:2},{points:[{}],landing:{padId:1}}), /Returning/);
  assert.match(hopGuidance({padId:0},{points:[{}],landing:{padId:1,perfect:false}}), /Safe landing/);
  const game = legacy('pondpost'); let pull;
  game.pointer('down',150,160);
  for (const vy of [7.6,8.4,9.2,10,10.8]) {
    for (let vx=-6;vx<=6;vx+=.25) {
      const x=150-vx/.12,y=160+vy/.12; game.pointer('move',x,y);
      if(game.engine.preview().landing?.padId===1&&game.engine.preview().landing.perfect){pull={x,y};break;}
    }
    if(pull)break;
  }
  assert.ok(pull); assert.match(game.hud().secondary,/Perfect landing · pad 1/);
  assert.ok(game.action('cancel-aim')); game.pointer('up',pull.x,pull.y);
  assert.equal(game.engine.state.jumps,0); assert.equal(game.engine.state.mode,'playing');
  assert.equal(game.actions[0].disabled,true);
  game.pointer('down',150,160);game.pointer('move',pull.x,pull.y);game.pointer('up',pull.x,pull.y);
  for(let i=0;i<240&&game.engine.state.mode==='flying';i++)game.update(1/60);
  assert.equal(game.engine.state.padId,1);assert.equal(game.engine.state.perfects,1);
});

test('Nib route uses the reachable finish and preserves distinct collected, missed and upcoming stars', () => {
  const game = createUpside({storage:{getItem(){return null;},setItem(){}}});
  for(const level of NIB_LEVELS){
    game.start(level.id); const state=game.state, before=json(state.stars), route=nibRoute(state,level);
    assert.equal(route.markers.length,level.stars.length); assert.ok(route.markers.every(m=>m.label==='Star ahead'));
    assert.deepEqual(state.stars,before,'guidance is read-only');
    const midpoint={...state,player:{...state.player,x:level.flagX/2}};
    assert.equal(nibRoute(midpoint,level).value,.5);
    assert.ok(nibRoute(midpoint,level).markers.some(m=>m.label==='Missed star — head back'));
    const collected={...midpoint,stars:state.stars.map((s,i)=>({...s,collected:i===0}))};
    assert.equal(nibRoute(collected,level).markers[0].label,'Star collected');
    assert.equal(nibRoute(collected,level).markers[0].complete,true);
    assert.equal(nibRoute(collected,level).markers[0].position,state.stars[0].x/level.flagX);
    for(const mode of ['flag','cleared','won']){
      const finish=nibRoute({...state,mode,player:{...state.player,x:level.flagX+.4-state.player.w}},level);
      assert.equal(finish.value,1); assert.match(finish.label,/100%/);
    }
    assert.equal(nibRoute({...state,player:{x:-10}},level).value,0);
    assert.equal(nibRoute({...state,player:{x:level.w+10}},level).value,1);
  }
});

test('Nib marks a passed star immediately even before rounded route progress crosses its marker', () => {
  const level=NIB_LEVELS[0],star=level.stars[0];
  const before=nibRoute({mode:'playing',player:{x:star.x-.0001},stars:[{...star,collected:false}]},level);
  const after=nibRoute({mode:'playing',player:{x:star.x+.0001},stars:[{...star,collected:false}]},level);
  assert.equal(before.value,after.value,'the progress bar has not crossed a rounding increment');
  assert.ok(after.value<=after.markers[0].position,'rounded progress alone would miss this crossing');
  assert.equal(before.markers[0].missed,false); assert.equal(after.markers[0].missed,true);
  assert.notEqual(JSON.stringify(before.markers),JSON.stringify(after.markers),'the host marker cache must invalidate');
  const collected=nibRoute({mode:'playing',player:{x:star.x+.0001},stars:[{...star,collected:true}]},level);
  assert.equal(collected.markers[0].missed,false); assert.equal(collected.markers[0].complete,true);
});
