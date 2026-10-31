// Playwright: song mode (Wait/Tempo/Listen/Start/Pause/Stop/completion) on an emulated iPhone in landscape.
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const PORT = 5199, URL = `http://127.0.0.1:${PORT}/piano/index.html`;
const server = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(PORT)], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 600));
const shot = process.argv.includes('--shot');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const iphone = devices['iPhone 13 landscape'];
const ctx = await browser.newContext({ ...iphone });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => m.type() === 'error' && errors.push(m.text()));
let passed = 0;
const t = async (name, fn) => { await fn(); passed++; console.log('ok -', name); };
await page.goto(URL);

const L = () => page.evaluate(() => ({ pos: __learn.pos, state: __learn.state, n: __learn.steps.length }));
const pick = async id => {
  await page.tap('#songsBtn'); await page.fill('#songq', '');
  await page.tap(`#songlist .song[data-id="${id}"]`);
};
const midi = k => page.evaluate(k => __learn.steps[k ?? __learn.pos].midi, k);
// tap the key element for a midi note (must be visible)
const tapMidi = async m => {
  const sel = await page.evaluate(m => { const sh = +document.getElementById('oct').textContent.slice(1) - 4; const i = m - 60 - sh * 12; return i >= 0 && i < 25 ? `#kb .k[data-i="${i}"]` : null; }, m);
  assert.ok(sel, `midi ${m} not on screen`);
  const box = await page.locator(sel).boundingBox();
  const black = await page.locator(sel).evaluate(e => e.classList.contains('b'));
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height * (black ? 0.4 : 0.85));
};
const tapNext = async () => tapMidi(await midi());

await t('Imperial March: wait mode waits, advances only on the blue key', async () => {
  await pick('imperial');
  assert.deepEqual(await L(), { pos: 0, state: 'ready', n: (await L()).n });
  assert.match(await page.textContent('#lstep'), /^G4 ×3 • 1\//);
  await page.waitForTimeout(1500);
  assert.equal((await L()).pos, 0, 'wait mode must not move on its own');
  const m = await midi();
  await tapMidi(m === 60 ? 62 : 60);
  assert.equal((await L()).pos, 0, 'wrong key advanced');
  assert.ok(await page.locator('#kb .k.wrong').count() >= 1, 'wrong key flashes red');
  await tapNext();
  assert.equal((await L()).pos, 1); assert.equal((await L()).state, 'playing');
  // repeated same notes (G4 G4): each tap advances exactly one step
  assert.equal(await midi(1), await midi(2)); assert.match(await page.textContent('#lstep'), /×2/);
  await tapNext(); assert.equal((await L()).pos, 2);
  await tapNext(); assert.equal((await L()).pos, 3);
  const w = await page.evaluate(() => parseFloat(document.querySelector('#lprog i').style.width));
  assert.ok(w > 0, 'progress bar moves');
});

await t('multi-touch: two simultaneous fingers on the right key advance once', async () => {
  const before = (await L()).pos, m = await midi();
  await page.evaluate(m => { const sh = +document.getElementById('oct').textContent.slice(1) - 4; const el = document.querySelector(`#kb .k[data-i="${m - 60 - sh * 12}"]`);
    const r = el.getBoundingClientRect(); const o = { clientX: r.x + r.width / 2, clientY: r.y + r.height * .85, bubbles: true, pointerType: 'touch' };
    el.dispatchEvent(new PointerEvent('pointerdown', { ...o, pointerId: 11 })); el.dispatchEvent(new PointerEvent('pointerdown', { ...o, pointerId: 12 }));
    el.dispatchEvent(new PointerEvent('pointerup', { ...o, pointerId: 11 })); el.dispatchEvent(new PointerEvent('pointerup', { ...o, pointerId: 12 })); }, m);
  const p = (await L()).pos;
  assert.ok(p === before + 1 || (p === before + 2 && (await midi(before)) === (await midi(before + 1))), `advanced ${p - before}`);
});

await t('out-of-range: hint arrow when the view hides the target, auto-shift on next step', async () => {
  const pos = (await L()).pos;
  await page.tap('#ou'); await page.tap('#ou');
  assert.equal(await page.textContent('#oct'), 'C6');
  assert.equal(await page.locator('#od.hint').count(), 1, 'hint arrow points down');
  assert.equal(await page.locator('#kb .k.next').count(), 0);
  await page.tap('#od'); await page.tap('#od');
  assert.equal(await page.locator('#bar .hint').count(), 0);
  await tapNext(); assert.equal((await L()).pos, pos + 1);
  await page.tap('#ou'); await page.tap('#ou');
  await page.tap('#lrestart');          // a new step re-centres the view on the target
  assert.equal(await page.locator('#kb .k.next').count(), 1, 'target visible after auto-shift');
  assert.equal(await page.locator('#bar .hint').count(), 0);
  for (let k = 0; k < 5; k++) await tapNext();
});

await t('Listen plays from the wait position, Stop returns there cleanly', async () => {
  await tapNext(); await tapNext();
  const pos = (await L()).pos;
  await page.tap('#ldemo');
  assert.equal((await L()).state, 'listening');
  assert.equal(await page.textContent('#ldemo'), '■ Stop');
  await page.waitForTimeout(1200);
  const notes = await page.evaluate(() => __learn.demoPos);
  assert.ok(notes > pos, 'listen moves along');
  await tapNext().catch(() => {});
  await page.tap('#ldemo');
  const s = await L();
  assert.equal(s.pos, pos, 'returns to wait position'); assert.equal(s.state, 'playing');
  await page.waitForTimeout(700);
  assert.equal(await page.locator('#kb .k.down').count(), 0, 'no hanging notes');
  assert.equal(await page.evaluate(() => __learn.demo), null);
});

await t('Tempo mode advances in time, Pause freezes, Resume continues, Stop resets', async () => {
  await pick('jingle');
  await page.tap('#lmode'); assert.equal(await page.textContent('#lmode'), 'Tempo');
  await page.waitForTimeout(1000); assert.equal((await L()).pos, 0, 'nothing before Start');
  await page.tap('#lplay'); assert.equal((await L()).state, 'playing');
  await page.waitForTimeout(1800);
  const p1 = (await L()).pos; assert.ok(p1 >= 2, `tempo advanced ${p1}`);
  await page.tap('#lplay'); assert.equal((await L()).state, 'paused');
  await page.waitForTimeout(1500); assert.equal((await L()).pos, p1, 'paused froze');
  await page.tap('#lplay'); await page.waitForTimeout(1200);
  assert.ok((await L()).pos > p1, 'resumed');
  await page.tap('#lstop');
  assert.deepEqual(await L(), { pos: 0, state: 'ready', n: (await L()).n });
  await page.waitForTimeout(1200); assert.equal((await L()).pos, 0, 'no stuck timer after stop');
  await page.tap('#lmode');
});

await t('switching songs mid-listen stops cleanly', async () => {
  await page.tap('#ldemo'); await page.waitForTimeout(400);
  await pick('ode');
  const s = await L(); assert.equal(s.state, 'ready'); assert.equal(s.pos, 0);
  assert.equal(await page.evaluate(() => __learn.demo), null);
  await page.waitForTimeout(800);
  assert.equal(await page.locator('#kb .k.down').count(), 0);
});

for (const id of ['jingle', 'twinkle', 'imperial']) {
  await t(`${id}: complete by tapping every blue key, completion + replay`, async () => {
    await pick(id);
    const n = (await L()).n;
    for (let k = 0; k < n; k++) await tapNext();
    assert.equal((await L()).state, 'done');
    assert.match(await page.textContent('#lstep'), /Done/);
    assert.ok(await page.isVisible('#done'));
    await page.tap('#dagain');
    assert.deepEqual(await L(), { pos: 0, state: 'ready', n });
    assert.ok(!(await page.isVisible('#done')));
  });
}

await t('Exit leaves song mode', async () => {
  await page.tap('#lexit');
  assert.ok(!(await page.isVisible('#lbar')));
  assert.equal(await page.locator('#kb .k.next').count(), 0);
});

if (shot) { await pick('imperial'); await tapNext(); await tapNext(); await page.screenshot({ path: 'piano-wait-screenshot.png' }); }
assert.deepEqual(errors, [], 'console errors: ' + errors.join('\n'));
console.log(`\n${passed} piano browser tests passed`);
await browser.close(); server.kill();
