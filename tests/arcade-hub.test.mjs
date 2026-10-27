import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule } from 'node:vm';
import { JSDOM } from 'jsdom';
import * as THREE from '../vendor/three/build/three.module.js';
import { arcadeGames } from '../arcade/catalog.js';
import { writeArcadeSave } from '../arcade/storage.js';

async function makeHub() {
  const dom = new JSDOM(await readFile(new URL('../index.html', import.meta.url), 'utf8'), {
    url: 'https://example.test/games/', runScripts: 'outside-only',
  });
  const context = dom.getInternalVMContext(), cache = new Map();
  async function moduleFor(url) {
    if (!cache.has(url.href)) {
      const source = await readFile(url, 'utf8');
      cache.set(url.href, new SourceTextModule(source, { context, identifier: url.href }));
    }
    return cache.get(url.href);
  }
  const entry = await moduleFor(new URL('../arcade/hub.js', import.meta.url));
  await entry.link((specifier, parent) => moduleFor(new URL(specifier, parent.identifier)));
  await entry.evaluate();
  return dom;
}

test('Little Arcade exposes 20 distinct heroes and searchable, filterable games', async () => {
  const dom = await makeHub();
  try {
    const { document, Event } = dom.window;
    assert.equal(arcadeGames.length, 20);
    assert.equal(new Set(arcadeGames.map(game => game.id)).size, 20);
    assert.equal(new Set(arcadeGames.map(game => game.hero)).size, 20);
    assert.equal(document.querySelectorAll('.arcade-card').length, 20);
    assert.equal(document.querySelectorAll('.game-card').length, 10);
    assert.equal(document.querySelectorAll('.quick-play a').length, 11);
    const visible = () => [...document.querySelectorAll('.arcade-card')].filter(card => !card.hidden);
    document.querySelector('[data-arcade-filter="Puzzles"]').click();
    assert.equal(visible().length, 7);
    assert.equal(document.querySelector('[data-arcade-filter="Puzzles"]').getAttribute('aria-pressed'), 'true');
    const search = document.querySelector('#arcade-search');
    search.value = 'fox'; search.dispatchEvent(new Event('input'));
    assert.equal(visible().length, 1);
    assert.equal(visible()[0].querySelector('.arcade-title').textContent, 'Dream Duos');
    search.value = 'no-such-hero'; search.dispatchEvent(new Event('input'));
    assert.equal(visible().length, 0);
    assert.equal(document.querySelector('#arcade-empty').hidden, false);
    search.value = ''; search.dispatchEvent(new Event('input'));
    document.querySelector('[data-arcade-filter="All"]').click();
    assert.equal(visible().length, 20);
  } finally { dom.window.close(); }
});

test('actual game checkpoints produce independent continuation links', async () => {
  const dom = await makeHub();
  try {
    const { document, localStorage, Event } = dom.window;
    localStorage.setItem('games:save:lantern', 'unchanged');
    for (const game of [arcadeGames[0], arcadeGames.at(-1)]) {
      const player = game.create({ THREE, root: new THREE.Group(), seed: 17 });
      player.update(.05);
      assert.ok(writeArcadeSave(game.id, { schema: 1, id: game.id, seed: 17, mode: player.state.mode, state: player.snapshot() }, localStorage));
    }
    dom.window.dispatchEvent(new Event('storage'));
    for (const game of [arcadeGames[0], arcadeGames.at(-1)]) {
      const card = document.querySelector(`[data-arcade-game="${game.id}"]`);
      assert.equal(card.querySelector('[data-arcade-play-label]').textContent, 'CONTINUE GAME');
      assert.equal(new URL(card.href).searchParams.get('continue'), '1');
      assert.equal(card.querySelector('.arcade-save-note').hidden, false);
    }
    const untouched = document.querySelector(`[data-arcade-game="${arcadeGames[1].id}"]`);
    assert.equal(untouched.querySelector('[data-arcade-play-label]').textContent, 'PLAY GAME');
    assert.equal(new URL(untouched.href).searchParams.has('continue'), false);
    assert.equal(localStorage.getItem('games:save:lantern'), 'unchanged');
  } finally { dom.window.close(); }
});
