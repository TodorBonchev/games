// Each route is planned in a separate simulation and then replayed using real
// browser touch events. No browser game state is edited by this test.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as THREE from '../vendor/three/build/three.module.js';
import { games } from '../arcade/action-games.js';

const baseURL = process.env.GAMES_TEST_URL || 'http://127.0.0.1:5201';
let server, browser;
const errors = [];

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

try {
  if (!process.env.GAMES_TEST_URL) {
    server = spawn(process.execPath, ['scripts/serve.mjs', '--port', '5201'], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', code => reject(Error(`Server exited ${code}`))); });
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--enable-unsafe-swiftshader'] });
  for (const spec of games) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await context.newPage(), cdp = await context.newCDPSession(page);
    page.on('pageerror', error => errors.push(`${spec.id}: ${error.message}`));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${spec.id}: ${response.status()} ${response.url()}`); });
    await page.goto(`${baseURL}/arcade.html?game=${spec.id}&debug=1`);
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
    await page.evaluate(() => window.__arcade.setRealtime(false));
    await page.locator('[data-action=start]').tap();
    const trace = legalTrace(spec), projected = await page.evaluate(async events => {
      const THREE = await import('three'), camera = window.__arcade.camera;
      const rect = document.getElementById('arcadeStage').getBoundingClientRect();
      return events.map(event => {
        const point = new THREE.Vector3(event.x, 0, event.z).project(camera);
        return { ...event, clientX: rect.left + (point.x + 1) * rect.width / 2, clientY: rect.top + (1 - point.y) * rect.height / 2 };
      });
    }, trace.events);
    let elapsed = 0, down = false;
    const advance = async count => {
      if (count <= 0) return;
      await page.evaluate(n => { for (let i = 0; i < n; i++) window.__arcade.advance(.025); }, count);
    };
    for (let i = 0; i < projected.length; i++) {
      const event = projected[i]; await advance(event.tick - elapsed); elapsed = event.tick;
      if (event.type === 'tap') {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: event.clientX, y: event.clientY, id: 1 }] });
        if (spec.id === 'bell-bloom' && i === projected.length - 1) {
          // Win while the same physical finger is still down, then release over
          // the result button: it must not accidentally restart the game.
          await page.waitForFunction(() => window.__arcade.game.state.mode === 'won');
          const button = await page.locator('[data-action=restart]').boundingBox();
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: button.x + button.width / 2, y: button.y + button.height / 2, id: 1 }] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await page.waitForTimeout(100);
          assert.ok(await page.locator('[data-action=restart]').isVisible(), 'the winning overlay survives the finger release');
        } else await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else if (event.type === 'down') {
        assert.equal(down, false, 'one finger at a time');
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: event.clientX, y: event.clientY, id: 1 }] }); down = true;
      } else {
        assert.equal(down, true, 'each lift follows a hold');
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); down = false;
      }
    }
    await advance(trace.ticks - elapsed);
    if (down) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.equal(await page.evaluate(() => window.__arcade.game.state.mode), 'won', `${spec.id}: real touch wins the complete game`);
    assert.equal(await page.locator('#panel').getAttribute('data-kind'), 'won');
    assert.ok(await page.locator('[data-action=restart]').isVisible());
    if (spec.id === 'bell-bloom') {
      const supported = await page.evaluate(() => {
        const extension = __arcade.renderer.getContext().getExtension('WEBGL_lose_context');
        if (!extension) return false;
        window.__restoreArcadeContext = () => extension.restoreContext(); extension.loseContext(); return true;
      });
      if (supported) {
        await page.waitForFunction(() => document.getElementById('panel').dataset.kind === 'restoring');
        await page.waitForTimeout(150); await page.evaluate(() => __restoreArcadeContext());
        await page.waitForFunction(() => document.getElementById('panel').dataset.kind === 'won');
        assert.ok(await page.locator('[data-action=restart]').isVisible(), 'win screen survives graphics recovery');
      }
    }
    const wins = await page.evaluate(id => JSON.parse(localStorage.getItem(`games:arcade:${id}:record`)).wins, spec.id);
    await page.reload(); await page.waitForFunction(() => document.body.dataset.ready === 'true');
    await page.locator('[data-action=continue]').tap();
    assert.equal(await page.evaluate(() => window.__arcade.mode), 'won', `${spec.id}: a completed game resumes at its result`);
    assert.equal(await page.evaluate(id => JSON.parse(localStorage.getItem(`games:arcade:${id}:record`)).wins, spec.id), wins, 'continuing does not duplicate a win');
    console.log(`${spec.id}: legal real-touch win (${trace.events.length} gestures)`);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log('All seven action games were completed by physical touch in the shared phone shell.');
} finally { await browser?.close(); if (server) server.kill(); }
