// Real WebGL browser check. Requires Chromium and permission to bind localhost.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { once } from 'node:events';

const port = 5179;
const server = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Local test server did not start')), 10000);
    server.stdout.once('data', () => { clearTimeout(timer); resolve(); });
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Local server exited (${code}); check localhost permissions`)); });
  });
  await mkdir('test-results', { recursive: true });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    headless: true,
    args: ['--enable-unsafe-swiftshader']
  });
  const errors = [];
  const waitGame = async (page, seconds) => {
    const time = await page.evaluate(() => window.__game.time);
    await page.waitForFunction(({time, seconds}) => window.__game.time >= time + seconds, {time, seconds});
  };
  for (const spec of [
    // Keep software WebGL's full high-quality shader path at a manageable size.
    { name: 'desktop-palm', level: 1, quality: 'high', width: 640, height: 480, touch: false },
    { name: 'desktop-ember', level: 2, quality: 'medium', width: 1280, height: 720, touch: false },
    { name: 'mobile-landscape', level: 1, quality: 'low', width: 844, height: 390, touch: true },
    { name: 'mobile-portrait', level: 1, quality: 'low', width: 390, height: 844, touch: true }
  ].filter(spec => !process.env.BROWSER_CASE || spec.name === process.env.BROWSER_CASE)) {
    const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, hasTouch: spec.touch, isMobile: spec.touch, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${spec.name}: ${error.stack || error.message}`));
    page.on('console', message => { if (message.type() === 'error') errors.push(`${spec.name}: ${message.text()}`); });
    // Ensure every asset is local; external runtime requests are a regression.
    await page.route('**/*', route => {
      if (new URL(route.request().url()).hostname !== '127.0.0.1') return route.abort();
      return route.continue();
    });
    await page.goto(`http://127.0.0.1:${port}/?debug=1&noscale=1&q=${spec.quality}&level=${spec.level}`);
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
    assert.equal(await page.locator('#startBtn').isEnabled(), true);
    assert.ok(await page.locator('#lvlSel .level-card strong').count() === 2);
    const weapon = spec.name === 'mobile-portrait' ? 'scatter' : spec.name === 'desktop-palm' ? 'burst' : 'rifle';
    await page.locator(`button[data-weapon="${weapon}"]`).click();
    assert.equal(await page.evaluate(() => window.__game.weapon.id), weapon);
    await page.screenshot({ path: `test-results/${spec.name}-menu.png` });
    await page.locator('#startBtn').click();
    await page.waitForFunction(() => window.__game.mode === 'intro');
    if (spec.touch) await page.locator('#skipBtn').tap();
    else await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__game.mode === 'play');
    assert.ok(await page.locator('#fieldObjective').isVisible(), 'optional uplink gives a readable navigation objective');
    assert.ok(await page.locator('#weaponHud').isVisible());
    assert.ok(await page.locator('#lvlCard').isHidden(), 'insertion title clears before combat');
    await page.evaluate(() => {
      const game = window.__game; game.hp = 100;
      const elite = game.spawnElite(true); elite.userData.speed = 0; elite.userData.slamCooldown = 9999;
      game.spawnDrop('medkit', 0); game.spawnDrop('overdrive', 3);
    });
    await waitGame(page, .05);
    await page.screenshot({ path: `test-results/${spec.name}-play.png` });
    if (spec.touch) {
      const cdp = await context.newCDPSession(page);
      const stick = await page.locator('#stick').boundingBox();
      const center = {x: stick.x + stick.width / 2, y: stick.y + stick.height / 2, id: 1};
      const start = await page.evaluate(() => window.__game.pos);
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [center]});
      await waitGame(page, .2);
      const still = await page.evaluate(() => window.__game.pos);
      assert.ok(Math.hypot(still[0] - start[0], still[2] - start[2]) < .001, 'centered joystick does not drift');
      const moved = {...center, y: center.y - stick.height * .35};
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [moved]});
      await waitGame(page, .4);
      const pos = await page.evaluate(() => window.__game.pos);
      assert.ok(Math.hypot(pos[0] - still[0], pos[2] - still[2]) > .5, 'dragging joystick moves the soldier');
      const fire = await page.locator('#fireBtn').boundingBox();
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [moved, {x: fire.x + fire.width / 2, y: fire.y + fire.height / 2, id: 2}]});
      assert.ok(await page.evaluate(() => window.__game.firing), 'move and fire simultaneously');
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
      assert.ok(!await page.evaluate(() => window.__game.firing), 'release stops firing');
    }
    await page.evaluate(() => window.__game.pause(true));
    assert.ok(await page.locator('#setPanel').isVisible());
    const before = await page.evaluate(() => ({ hp: window.__game.hp, time: window.__game.time, pos: window.__game.pos }));
    await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(() => ({ hp: window.__game.hp, time: window.__game.time, pos: window.__game.pos })), before);
    if (spec.name === 'desktop-palm') {
      // Keyboard navigation stays in the dialog, and range keys keep their
      // native function instead of being swallowed by movement controls.
      const ends = await page.locator('#setPanel').evaluate(dialog => {
        const controls = [...dialog.querySelectorAll('button, input')].filter(element => !element.disabled && element.getClientRects().length);
        controls[0].focus();
        return { first: controls[0].id || controls[0].textContent, last: controls.at(-1).id || controls.at(-1).textContent };
      });
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id || document.activeElement.textContent), ends.last);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id || document.activeElement.textContent), ends.first);
      await page.locator('#lookSensitivity').focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('#lookSensitivity').inputValue(), '1.05');
      assert.equal(await page.evaluate(() => window.__game.weapon.id), weapon, 'weapon choice survives reload');
      await page.locator('#motionBtn').click();
      assert.ok(await page.locator('body').evaluate(element => element.classList.contains('reduced-motion')));
      assert.equal(await page.evaluate(() => localStorage.getItem('szSensitivity')), '1.05');
    }
    await page.locator('#setClose').click();
    await page.waitForFunction(() => !window.__game.paused);
    await page.evaluate(() => window.__game.clearWave());
    try {
      // The high tier runs through software WebGL on CI. Its capped simulation
      // delta can make a four-second recovery take over30 wall-clock seconds.
      await page.waitForFunction(() => window.__game.mode === 'upgrade', null, { timeout: 60000 });
    } catch (error) {
      console.error('Upgrade transition failed', spec.name, await page.evaluate(() => ({ mode: window.__game.mode, paused: window.__game.paused, time: window.__game.time, hp: window.__game.hp, waveBreak: window.__game.waveBreak, graphicsLost: window.__game.graphicsLost })), errors);
      throw error;
    }
    assert.equal(await page.locator('#upgradeChoices button:enabled').count(), 3);
    await page.screenshot({ path: `test-results/${spec.name}-upgrades.png` });
    const upgradeTime = await page.evaluate(() => window.__game.time);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => window.__game.mode), 'upgrade');
    assert.equal(await page.evaluate(() => window.__game.time), upgradeTime);
    if (spec.name === 'desktop-palm') {
      await page.evaluate(() => {
        const canvas = document.querySelector('body > canvas');
        window.__contextExtension = (canvas.getContext('webgl2') || canvas.getContext('webgl')).getExtension('WEBGL_lose_context');
        window.__contextExtension.loseContext();
      });
      await page.waitForFunction(() => window.__game.graphicsLost);
      assert.equal(await page.locator('#upgradeChoices button:enabled').count(), 0, 'graphics loss blocks committing an upgrade');
      await page.evaluate(() => document.querySelector('#upgradeChoices button').click());
      assert.equal(await page.evaluate(() => window.__game.mode), 'upgrade');
      await page.evaluate(() => window.__contextExtension.restoreContext());
      await page.waitForFunction(() => !window.__game.graphicsLost);
      assert.equal(await page.locator('#upgradeChoices button:enabled').count(), 3);
    }
    await page.locator('.upgrade-card[data-choice="0"]').click();
    await page.waitForFunction(() => window.__game.mode === 'play' && window.__game.wave === 2);
    assert.equal(await page.evaluate(() => Object.values(window.__game.progression.ranks).reduce((sum, rank) => sum + rank, 0)), 1);
    if (spec.name === 'desktop-palm') {
      // Exercise a real GPU context loss. Simulation must stop until the
      // context is restored and the player chooses to resume.
      await page.evaluate(() => {
        const canvas = document.querySelector('body > canvas');
        window.__contextExtension = (canvas.getContext('webgl2') || canvas.getContext('webgl')).getExtension('WEBGL_lose_context');
        window.__contextExtension.loseContext();
      });
      await page.waitForFunction(() => window.__game.graphicsLost && window.__game.paused);
      const frozen = await page.evaluate(() => ({ time: window.__game.time, hp: window.__game.hp, pos: window.__game.pos }));
      await page.keyboard.press('p');
      await page.waitForTimeout(250);
      assert.deepEqual(await page.evaluate(() => ({ time: window.__game.time, hp: window.__game.hp, pos: window.__game.pos })), frozen);
      await page.evaluate(() => window.__contextExtension.restoreContext());
      await page.waitForFunction(() => !window.__game.graphicsLost);
      assert.ok(await page.evaluate(() => window.__game.paused));
      await page.locator('#resumeBtn').click();
      await waitGame(page, .1);
      assert.ok(!await page.evaluate(() => window.__game.paused));
    }
    await page.evaluate(() => window.__game.pause());
    await page.screenshot({ path: `test-results/${spec.name}-pause.png` });
    await page.locator('#pauseMenuBtn').click();
    await page.waitForFunction(() => window.__game.mode === 'menu');
    assert.ok(await page.locator('#startBtn').isVisible());
    assert.equal(await page.evaluate(() => window.__game.zombies.length), 0);
    await page.locator('#startBtn').click();
    await page.waitForFunction(() => window.__game.mode === 'intro');
    if (spec.name === 'desktop-palm') {
      await page.reload();
      await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
      assert.equal(await page.locator('#lookSensitivity').inputValue(), '1.05');
      assert.ok(await page.locator('body').evaluate(element => element.classList.contains('reduced-motion')));
    }
    console.log(`PASS ${spec.name}: boot, combat HUD, controls, upgrades, pause and return to briefing`);
    await context.close();
  }
  assert.deepEqual(errors, [], 'browser must have no runtime or shader errors');
  console.log('Screenshots saved in test-results/.');
} finally {
  await browser?.close();
  if (server.exitCode === null) { server.kill(); await once(server, 'exit'); }
}
