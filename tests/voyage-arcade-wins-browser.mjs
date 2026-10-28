// Actual touch wins through Wonderwake's unified runtime. Only campaign unlocks
// are preseeded; all wins are earned through game controls without state edits.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import * as THREE from '../vendor/three/build/three.module.js';
import { games as actions } from '../arcade/action-games.js';
import { games as puzzles } from '../arcade/puzzle-games.js';
import { games as skills } from '../arcade/skill-games.js';
import { CHAPTERS, missionById, freshProgress, SAVE_KEY } from '../voyage/progress.js';
const base = process.env.GAMES_TEST_URL || 'http://127.0.0.1:5269';
let server,browser;
const errors=[];
function legalTrace(spec) {
  const game = spec.create({ THREE, root: new THREE.Group(), seed: 9281 });
  const events = [], beatTimes = Array.from({ length: 14 }, (_, i) => 2 + i * 1.08 + (i > 4 ? Math.sin(i * 1.8) * .18 : 0));
  let tick = 0, held = false, lastAngle = null, lastX = null;
  const send = (type, x = 0, z = 0) => {
    events.push({ tick, type, x, z });
    if (type === 'tap') { game.pointer('down', x, z); game.pointer('up', x, z); }
    else game.pointer(type, x, z);
  };
  while (game.state.mode === 'playing' && tick < 12000) {
    const s = game.state;
    if (spec.id === 'lane-lark') {
      const note = s.items.filter(item => item.status === 1 && item.kind === 1).sort((a, b) => b.z - a.z)[0];
      if (note && note.lane !== s.lane) send('tap', [-3.3, 0, 3.3][note.lane]);
    } else if (spec.id === 'orbit-guard') {
      if (s.cometAngle !== lastAngle) { send('tap', Math.cos(s.cometAngle) * 4, Math.sin(s.cometAngle) * 4); lastAngle = s.cometAngle; }
    } else if (spec.id === 'cloud-skimmer') {
      const gate = s.gates.find(item => item.status === 0);
      if (gate) {
        const desired = Math.max(-2.2, Math.min(2.2, (gate.z - s.z) * 1.7));
        // Hysteresis gives a realistic rhythm of holds instead of rapid taps.
        const shouldHold = held ? s.velocity > desired - 1.2 : s.velocity > desired + 1.2;
        if (shouldHold !== held) { send(shouldHold ? 'down' : 'up'); held = shouldHold; }
      }
    } else if (spec.id === 'ink-sling') {
      if (!s.shot.active) {
        const target = s.targets.find(item => item.alive);
        if (target) send('tap', target.x + Math.sin(s.time * 1.15 + target.z) * .23, target.z);
      }
    } else if (spec.id === 'bubble-basket') {
      const item = s.items.filter(entry => entry.status === 1).sort((a, b) => b.z - a.z)[0];
      if (item) {
        const x = item.danger ? item.x > 0 ? -4.9 : 4.9 : item.x;
        if (x !== lastX) { send('tap', x); lastX = x; }
      }
    } else if (spec.id === 'moss-flip') {
      const obstacle = s.obstacles.find(item => item.status === 0);
      if (obstacle && obstacle.lane === s.lane) send('tap');
    } else if (spec.id === 'bell-bloom') {
      if (Math.abs(s.time - beatTimes[s.index]) < .025) send('tap');
    }
    game.update(.025); tick++;
  }
  assert.equal(game.state.mode, 'won', `${spec.id}: planner completed via legal inputs`);
  return { events, ticks: tick, held };
}

const point = (i, cols, rows, size, offset = 0) => ({ x: (i % cols - (cols - 1) / 2) * size, z: (Math.floor(i / cols) - (rows - 1) / 2) * size + offset });
function tap(game, plan, x, z) { game.pointer('down', x, z); game.pointer('up', x, z); plan.push({ x, z }); }
function tapCell(game, plan, i, cols, rows, size, offset = 0) { const p = point(i, cols, rows, size, offset); tap(game, plan, p.x, p.z); }

function burrowPlan(game, plan) {
  for (let level = 1; level <= 1; level++) {
    const start = game.snapshot(), queue = [{ state: start, path: [] }], seen = new Set(); let solution = null;
    for (let cursor = 0; cursor < queue.length && !solution; cursor++) {
      const node = queue[cursor], key = `${node.state.player}|${[...node.state.crates].sort((a, b) => a - b)}`;
      if (seen.has(key)) continue; seen.add(key);
      const px = node.state.player % 5, pz = Math.floor(node.state.player / 5);
      for (const [dx, dz] of [[0,-1], [1,0], [0,1], [-1,0]]) {
        const x = px + dx, z = pz + dz; if (x < 0 || x >= 5 || z < 0 || z >= 5) continue;
        assert.ok(game.restore(node.state)); const index = z * 5 + x, p = point(index, 5, 5, 1.75, .25);
        game.pointer('down', p.x, p.z); game.pointer('up', p.x, p.z);
        if (game.state.level !== level || game.state.mode === 'won') { solution = [...node.path, index]; break; }
        if (game.state.player !== node.state.player) queue.push({ state: game.snapshot(), path: [...node.path, index] });
      }
    }
    assert.ok(solution, `burrow ${level} must be solvable`); assert.ok(game.restore(start));
    for (const index of solution) tapCell(game, plan, index, 5, 5, 1.75, .25);
  }
}
function moonPlan(game, plan) {
  const solution = [1,2,3,4, 3,4,1,2, 2,1,4,3, 4,3,2,1];
  for (let level = 1; level <= 1; level++) {
    for (let i = 0; i < 16 && game.state.level === level; i++) {
      if (game.state.cells[i] === 0) for (let n = 0; n < solution[i] && game.state.level === level; n++) tapCell(game, plan, i, 4, 4, 2.05, .2);
    }
  }
}
function stackPlan(game, plan) {
  const centers = [-3.2, 0, 3.2];
  function solve(n, from, spare, to) {
    if (!n) return; solve(n - 1, from, to, spare); tap(game, plan, centers[from], 0); tap(game, plan, centers[to], 0); solve(n - 1, spare, from, to);
  }
  for (let level = 1; level <= 1; level++) solve(level + 1, 0, 1, 2);
}
function jellyPlan(game, plan) {
  const switches = [[0,4], [1,5,6], [0,2,4,7], [1,2,3,6,8]];
  for (let level = 1; level <= 1; level++) for (const i of switches[level - 1]) {
    if (game.state.mode !== 'playing' || game.state.level !== level) break;
    tapCell(game, plan, i, 3, 3, 2.6, .2);
  }
}
function duoPlan(game, plan) {
  for (let level = 1; level <= 1; level++) {
    const known = new Map(); let tries = 0;
    while (game.state.mode === 'playing' && game.state.level === level && tries++ < 200) {
      const s = game.state, rows = Math.ceil(s.deck.length / 4), available = s.deck.map((_, i) => i).filter(i => !s.matched.includes(i));
      let first = -1, second = -1;
      for (const i of available) { if (!known.has(i)) continue; const found = available.find(j => j !== i && known.get(j) === known.get(i)); if (found !== undefined) { first = i; second = found; break; } }
      if (first < 0) { first = available.find(i => !known.has(i)) ?? available[0]; second = available.find(i => i !== first && !known.has(i)) ?? available.find(i => i !== first); }
      tapCell(game, plan, first, 4, rows, 2.05, .3); if (game.state.level !== level) break;
      // A value is only recorded once that card has physically been revealed.
      known.set(first, game.state.deck[first]); tapCell(game, plan, second, 4, rows, 2.05, .3);
      if (game.state.level !== level || game.state.mode === 'won') break; known.set(second, game.state.deck[second]);
      if (game.state.delay) { for (let n = 0; n < 18; n++) game.update(.05); plan.push({ waitForFlips: true }); }
    }
    assert.ok(tries < 200, 'memory challenge should be solvable');
  }
}
function flockPlan(game, plan) {
  const scrambles = [[[0,0]], [[0,0],[1,1]], [[0,0],[1,1],[0,1]], [[0,0],[1,1],[0,1],[1,0]]];
  for (let level = 1; level <= 1; level++) for (const [row, col] of [...scrambles[level - 1]].reverse()) for (let n = 0; n < 3; n++) {
    if (game.state.mode !== 'playing' || game.state.level !== level) break;
    tap(game, plan, col ? 1.15 : -1.15, row ? 1.2 : -1.1);
  }
}
function sortSolution(jars, capacity) {
  const queue = [{ jars, path: [] }], seen = new Set([JSON.stringify(jars)]);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const node = queue[cursor];
    if (node.jars.every(j => !j.length || j.length === capacity && j.every(v => v === j[0]))) return node.path;
    for (let from = 0; from < jars.length; from++) for (let to = 0; to < jars.length; to++) {
      if (from === to || !node.jars[from].length || node.jars[to].length >= capacity) continue;
      const color = node.jars[from].at(-1); if (node.jars[to].length && node.jars[to].at(-1) !== color) continue;
      const next = node.jars.map(j => [...j]); while (next[from].at(-1) === color && next[to].length < capacity) next[to].push(next[from].pop());
      const key = JSON.stringify(next); if (!seen.has(key)) { seen.add(key); queue.push({ jars: next, path: [...node.path, [from, to]] }); }
    }
  }
  return null;
}
function kelpPlan(game, plan) {
  for (let level = 1; level <= 1; level++) {
    const solution = sortSolution(game.state.jars, level === 3 ? 3 : 2); assert.ok(solution);
    const centers = game.state.jars.length === 4 ? [-3.3,-1.1,1.1,3.3] : [-4,-2,0,2,4];
    for (const [from, to] of solution) { if (game.state.mode !== 'playing' || game.state.level !== level) break; tap(game, plan, centers[from], 0); tap(game, plan, centers[to], 0); }
  }
}
const planners = {
  'burrow-banquet': burrowPlan, 'moon-basket': moonPlan, 'stack-strata': stackPlan,
  'jelly-lanterns': jellyPlan, 'dream-duos': duoPlan, 'flock-shift': flockPlan, 'kelp-kitchen': kelpPlan,
};

try {
  if(!process.env.GAMES_TEST_URL){server=spawn(process.execPath,['scripts/serve.mjs','--port','5269'],{stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});}
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  for(const spec of [...actions,...puzzles,...skills]){
    const id=spec.id, context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2}),p=await context.newPage(),cdp=await context.newCDPSession(p);
    p.on('pageerror',e=>errors.push(`${id}: ${e.message}`));
    p.on('response',r=>{if(r.status()>=400)errors.push(`${id}: ${r.status()} ${r.url()}`);});
    const progress=freshProgress();progress.chapter=missionById.get(id).chapter;
    progress.completed=CHAPTERS.slice(0,progress.chapter).flatMap(c=>c.missions.slice(0,3));
    await p.goto(base);await p.evaluate(({key,progress})=>localStorage.setItem(key,JSON.stringify(progress)),{key:SAVE_KEY,progress});
    await p.goto(`${base}/wonderwake.html?debug=1`);await p.waitForFunction(()=>document.body.dataset.ready==='true');
    await p.evaluate(()=>__voyage.setRealtime(false));
    await p.locator(`[data-mission="${id}"]`).tap();await p.locator('[data-action=startMission]').tap();
    await p.waitForFunction(()=>__voyage.phase==='playing');
    const point=async(x,z)=>p.evaluate(({x,z})=>__voyage.controller.project(x,z),{x,z});
    async function touch(type,x,z){const q=type==='touchEnd'||type==='touchCancel'?null:await point(x,z);await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:q?[{...q,id:1}]:[]});}
    async function tap(x,z){await touch('touchStart',x,z);await p.waitForTimeout(35);await touch('touchEnd');}
    async function advance(n){await p.evaluate(n=>__voyage.advance(n),n);}
    async function state(){return p.evaluate(()=>({...__voyage.controller.engine.state}));}
    if(actions.some(g=>g.id===id)){
      const trace=legalTrace(spec);let elapsed=0,held=false;
      for(const event of trace.events){if(event.tick>elapsed)await p.evaluate(n=>{for(let i=0;i<n;i++)__voyage.advance(.025);},event.tick-elapsed);elapsed=event.tick;
        if(event.type==='tap')await tap(event.x,event.z);
        else if(event.type==='down'){await touch('touchStart',event.x,event.z);held=true;}
        else{await touch('touchEnd');held=false;}
      }
      if(trace.ticks>elapsed)await p.evaluate(n=>{for(let i=0;i<n;i++)__voyage.advance(.025);},trace.ticks-elapsed);
      if(held)await touch('touchEnd');
    }else if(puzzles.some(g=>g.id===id)){
      const game=spec.create({THREE,root:new THREE.Group(),seed:117,singleRound:true}),plan=[];
      assert.ok(game.restore(await p.evaluate(()=>__voyage.controller.snapshot())));
      planners[id](game,plan);assert.equal(game.state.mode,'won',`${id}: one-board plan`);game.dispose();
      for(const item of plan){if(item.waitForFlips)await advance(.9);else await tap(item.x,item.z);}
    }else if(id==='tidehook'){
      for(let n=0;n<8;n++){let s=await state();await touch('touchStart',s.fishX,0);let caught=false;for(let k=0;k<130;k++){await advance(.05);s=await state();await touch('touchMove',s.fishX,0);if(Math.abs(s.depth-s.fishZ)<.2){await touch('touchEnd');caught=true;break;}}assert.ok(caught);assert.equal((await state()).caught,n+1);}
    }else if(id==='bellwood-beats'){
      for(const seq of [[0,1,2],[2,0,1,2],[1,2,0,2,1]]){await tap(0,0);await advance(4);assert.equal((await state()).phase,'repeat');for(const note of seq)await tap([-3,0,3][note],0);}
    }else if(id==='parcel-parade'){
      for(const color of [0,2,1,0,1,2,0,2,1]){const s=await state();await touch('touchStart',0,s.z);await p.waitForTimeout(35);await touch('touchMove',[-3.4,0,3.4][color],-3.65);await touch('touchEnd');}
    }else if(id==='wobble-bakery'){
      await touch('touchStart',0,0);for(let i=0;i<160&&(await state()).mode==='playing';i++){const s=await state();await touch('touchMove',s.cake,0);await advance(.2);}await touch('touchEnd');
    }else if(id==='mothlight'){
      const ends=[[3.7,-2.8],[-3.7,-2.8],[1.2,-2.7],[-1.2,-2.7]];let s=await state();await touch('touchStart',s.mothX,s.mothZ);for(let i=0;i<650&&(s=await state()).mode==='playing';i++){const[x,z]=ends[s.delivered],dx=x-s.mothX,dz=z-s.mothZ,d=Math.hypot(dx,dz)||1;await touch('touchMove',s.mothX+dx/d*1.15,s.mothZ+dz/d*1.15);await advance(.18);}await touch('touchEnd');
    }else if(id==='cloud-potter'){
      const rows=[-2.65,-1.05,.55,2.15],goals=[[1,3,2,1],[2,2,3,1],[1,2,3,2]];for(let round=0;round<3;round++)for(let row=0;row<4;row++){let s;while((s=await state()).mode==='playing'&&s.round===round&&s.widths[row]!==goals[round][row]){const dir=Math.sign(goals[round][row]-s.widths[row]);await touch('touchStart',2,rows[row]);await p.waitForTimeout(35);await touch('touchMove',2+dir*.8,rows[row]);await touch('touchEnd');}}
    }
    assert.equal(await p.evaluate(()=>__voyage.phase),'won',id);
    const saved=await p.evaluate(()=>__voyage.progress);assert.equal(saved.completed.length,progress.completed.length+1);assert.ok(saved.completed.includes(id));assert.equal(saved.plays[id],1);assert.equal(saved.active,null);assert.equal(saved.checkpoints[id],undefined);
    // The physical winning finger must not activate a result-screen button.
    assert.equal(await p.locator('#panel').getAttribute('data-kind'),'won');
    await p.waitForTimeout(550);await p.locator('[data-action=map]').tap();await p.waitForFunction(()=>__voyage.phase==='map');
    assert.equal(await p.locator(`[data-mission="${id}"]`).getAttribute('data-done'),'true');
    await p.reload();await p.waitForFunction(()=>document.body.dataset.ready==='true');assert.equal(await p.evaluate(id=>__voyage.progress.plays[id],id),1,'reload does not re-award friend');
    console.log(`${id}: actual touch win inside Wonderwake, one reward, durable crew`);await context.close();
  }
  assert.deepEqual(errors,[]);console.log('All20 arcade-derived missions legally completed in Wonderwake.');
}finally{await browser?.close();server?.kill('SIGTERM');}
