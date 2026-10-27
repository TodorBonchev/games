// Each move below is applied to the real game by a timed native touch gesture.
// Simulations are used only to find legal solutions; browser state is never edited.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import * as THREE from '../vendor/three/build/three.module.js';
import { games } from '../arcade/puzzle-games.js';

const base = process.env.GAMES_TEST_URL || 'http://127.0.0.1:5202';
const errors = [];
let server, browser;
const local = id => games.find(game => game.id === id).create({ THREE, root: new THREE.Group(), seed: 117 });
const point = (i, cols, rows, size, offset = 0) => ({ x: (i % cols - (cols - 1) / 2) * size, z: (Math.floor(i / cols) - (rows - 1) / 2) * size + offset });
function tap(game, plan, x, z) { game.pointer('down', x, z); game.pointer('up', x, z); plan.push({ x, z }); }
function tapCell(game, plan, i, cols, rows, size, offset = 0) { const p = point(i, cols, rows, size, offset); tap(game, plan, p.x, p.z); }

function burrowPlan(game, plan) {
  for (let level = 1; level <= 3; level++) {
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
  for (let level = 1; level <= 4; level++) {
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
  for (let level = 1; level <= 3; level++) solve(level + 1, 0, 1, 2);
}
function jellyPlan(game, plan) {
  const switches = [[0,4], [1,5,6], [0,2,4,7], [1,2,3,6,8]];
  for (let level = 1; level <= 4; level++) for (const i of switches[level - 1]) {
    if (game.state.mode !== 'playing' || game.state.level !== level) break;
    tapCell(game, plan, i, 3, 3, 2.6, .2);
  }
}
function duoPlan(game, plan) {
  for (let level = 1; level <= 3; level++) {
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
  for (let level = 1; level <= 4; level++) for (const [row, col] of [...scrambles[level - 1]].reverse()) for (let n = 0; n < 3; n++) {
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
  for (let level = 1; level <= 3; level++) {
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
  if (!process.env.GAMES_TEST_URL) {
    server = spawn(process.execPath, ['scripts/serve.mjs', '--port', '5202'], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', code => reject(Error(`server exited: ${code}`))); });
  }
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  for (const definition of games) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await context.newPage(), cdp = await context.newCDPSession(page);
    page.on('pageerror', error => errors.push(`${definition.id}: ${error.message}`));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${definition.id}: ${response.status()} ${response.url()}`); });
    await page.goto(`${base}/arcade.html?game=${definition.id}&debug=1`);
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
    await page.locator('[data-action=start]').tap();
    const initial = await page.evaluate(() => window.__arcade.game.snapshot()), game = local(definition.id), plan = [];
    assert.ok(game.restore(initial), `${definition.id}: planning uses the real fresh checkpoint`);
    planners[definition.id](game, plan); assert.equal(game.state.mode, 'won', `${definition.id}: legal plan wins`); game.dispose();
    const projected = await page.evaluate(async positions => {
      const { Vector3 } = await import('three'), camera = window.__arcade.camera, r = document.getElementById('arcadeStage').getBoundingClientRect();
      return positions.map(item => {
        if (item.waitForFlips) return item;
        const p = new Vector3(item.x, 0, item.z).project(camera);
        return { x: r.x + (p.x + 1) * r.width / 2, y: r.y + (1 - p.y) * r.height / 2 };
      });
    }, plan);
    for (const item of projected) {
      if (item.waitForFlips) { await page.waitForFunction(() => window.__arcade.game.state.flipped.length < 2, null, { timeout: 4000 }); continue; }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: item.x, y: item.y, id: 1 }] });
      await page.waitForTimeout(35);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await page.waitForFunction(() => window.__arcade.game.state.mode === 'won', null, { timeout: 5000 });
    assert.ok(await page.locator('[data-action=restart]').isVisible(), `${definition.id}: win is presented`);
    const wins = await page.evaluate(id => JSON.parse(localStorage.getItem(`games:arcade:${id}:record`)).wins, definition.id);
    await page.reload(); await page.waitForFunction(() => document.body.dataset.ready === 'true');
    await page.locator('[data-action=continue]').tap();
    assert.equal(await page.evaluate(() => window.__arcade.mode), 'won', `${definition.id}: completed puzzle resumes at its result`);
    assert.equal(await page.evaluate(id => JSON.parse(localStorage.getItem(`games:arcade:${id}:record`)).wins, definition.id), wins, 'continuing does not duplicate a win');
    console.log(`${definition.id}: completed ${plan.filter(item => !item.waitForFlips).length} real phone taps`);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log('All seven puzzle games completed through physical touch in a real browser.');
} finally { await browser?.close(); server?.kill('SIGTERM'); }
