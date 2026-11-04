import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule } from 'node:vm';
import { JSDOM } from 'jsdom';
import { writeGameSave, removeGameSave } from '../save-store.js';

async function hub() {
  const dom = new JSDOM(await readFile(new URL('../index.html', import.meta.url), 'utf8'), { url: 'https://example.test/games/', runScripts: 'outside-only' });
  const context = dom.getInternalVMContext(), cache = new Map();
  async function moduleFor(url) {
    if (!cache.has(url.href)) cache.set(url.href, new SourceTextModule(await readFile(url, 'utf8'), { context, identifier: url.href }));
    return cache.get(url.href);
  }
  const entry = await moduleFor(new URL('../hub.js', import.meta.url));
  await entry.link((specifier, parent) => moduleFor(new URL(specifier, parent.identifier)));
  return { dom, run: () => entry.evaluate(), refresh: () => dom.window.dispatchEvent(new dom.window.Event('storage')) };
}

test('the two-destination home resumes the zombie campaign and leaves piano independent', async () => {
  const { dom, run, refresh } = await hub(), { document, localStorage } = dom.window;
  try {
    writeGameSave('soldier', { schema: 1, level: 2, wave: 3, phase: 'play' }, localStorage);
    writeGameSave('garden', { schema: 1, level: 3, wave: 2, mode: 'playing' }, localStorage);
    const previousGarden = localStorage.getItem('games:save:garden');
    await run();
    assert.equal(document.querySelectorAll('.game-card').length, 2);
    const card = document.querySelector('.soldier-card'), url = new URL(card.href);
    assert.equal(card.querySelector('[data-play-label]').textContent, 'CONTINUE THE ADVENTURE');
    assert.equal(url.pathname, '/games/soldier.html');
    assert.equal(url.searchParams.get('level'), '2');
    assert.equal(url.searchParams.get('continue'), '1');
    assert.equal(document.querySelector('.quick-play [data-game-link="soldier"]').href, card.href);
    assert.equal(card.querySelector('.game-save-note').textContent, 'SAVED · EMBER ISLE · WAVE 3');
    assert.equal(new URL(document.querySelector('.piano-card').href).pathname, '/games/piano/');
    assert.equal(localStorage.getItem('games:save:garden'), previousGarden);
    removeGameSave('soldier', localStorage); refresh();
    assert.equal(card.querySelector('[data-play-label]').textContent, 'ENTER THE WORLD');
    assert.equal(new URL(card.href).search, '');
    assert.equal(card.querySelector('.game-save-note').hidden, true);
  } finally { dom.window.close(); }
});

test('home reflects unique completed expedition activities without changing any save', async () => {
  const { dom, run, refresh } = await hub(), { document, localStorage } = dom.window;
  try {
    localStorage.setItem('games:save:arcade:lane-lark', 'existing arcade save');
    localStorage.setItem('games:save:ribbon', 'existing ribbon save');
    await run();
    const note = document.querySelector('.expedition-note');
    assert.equal(note.hidden, true);
    const raw = JSON.stringify({ version: 1, completed: ['upside', 'garden', 'moonbounce', 'lane-lark', 'upside', 'unknown-game'] });
    localStorage.setItem('games:zombie:expedition:v1', raw); refresh();
    assert.equal(note.textContent, '4 / 30 OUTPOST ACTIVITIES COMPLETED');
    assert.equal(note.hidden, false);
    assert.equal(localStorage.getItem('games:zombie:expedition:v1'), raw);
    assert.equal(localStorage.getItem('games:save:arcade:lane-lark'), 'existing arcade save');
    assert.equal(localStorage.getItem('games:save:ribbon'), 'existing ribbon save');
    assert.equal(document.querySelectorAll('[data-game-link]:not([data-game-link="soldier"]):not([data-game-link="piano"])').length, 0);
  } finally { dom.window.close(); }
});

test('invalid campaign and expedition saves never advertise a broken continuation', async () => {
  const { dom, run, refresh } = await hub(), { document, localStorage } = dom.window;
  try {
    await run();
    for (const data of [{ schema: 999, level: 1, wave: 1, phase: 'play' }, { schema: 1, level: 999, wave: 1, phase: 'play' }, { schema: 1, level: 1, wave: 1, phase: 'broken' }, { schema: 1, level: 1, wave: -1, phase: 'play' }]) {
      writeGameSave('soldier', data, localStorage); refresh();
      assert.equal(document.querySelector('.soldier-card [data-play-label]').textContent, 'ENTER THE WORLD');
      assert.equal(document.querySelector('.soldier-card .game-save-note').hidden, true);
    }
    for (const raw of ['broken json', '{"completed":["unknown-game"]}', '{"completed":"upside"}', 'null']) {
      localStorage.setItem('games:zombie:expedition:v1', raw); refresh();
      assert.equal(document.querySelector('.expedition-note').hidden, true);
    }
  } finally { dom.window.close(); }
});

test('home remains usable when browser storage is unavailable', async () => {
  const { dom, run, refresh } = await hub();
  try {
    Object.defineProperty(dom.window, 'localStorage', { configurable: true, get() { throw new Error('blocked storage'); } });
    await run(); assert.doesNotThrow(refresh);
    const links = [...dom.window.document.querySelectorAll('.game-card')].map(card => new URL(card.href).pathname);
    assert.deepEqual(links, ['/games/soldier.html', '/games/piano/']);
  } finally { dom.window.close(); }
});
