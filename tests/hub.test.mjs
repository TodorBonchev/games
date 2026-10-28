import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule } from 'node:vm';
import { JSDOM } from 'jsdom';
import { writeGameSave, removeGameSave } from '../save-store.js';
import { createPrism } from '../prism-game.js';
import { createLantern } from '../lantern-game.js';
import { freshProgress, writeProgress, SAVE_KEY } from '../voyage/progress.js';

async function hub() {
  const dom = new JSDOM(await readFile(new URL('../index.html', import.meta.url), 'utf8'), {
    url: 'https://example.test/games/', runScripts: 'outside-only',
  });
  const context = dom.getInternalVMContext(), cache = new Map();
  async function moduleFor(url) {
    if (!cache.has(url.href)) cache.set(url.href, new SourceTextModule(await readFile(url, 'utf8'), { context, identifier: url.href }));
    return cache.get(url.href);
  }
  const entry = await moduleFor(new URL('../hub.js', import.meta.url));
  await entry.link((specifier, parent) => moduleFor(new URL(specifier, parent.identifier)));
  return { dom, run: () => entry.evaluate(), refresh: () => dom.window.dispatchEvent(new dom.window.Event('storage')) };
}

test('the six-game collection resumes each retained game independently', async () => {
  const { dom, run, refresh } = await hub(), { document, localStorage } = dom.window;
  try {
    const world = JSON.parse(await readFile(new URL('../assets/lantern-world.json', import.meta.url), 'utf8'));
    const prism = createPrism(), lantern = createLantern({ world });
    prism.start(2); prism.rotate(0); lantern.start(); lantern.advance(.5, { x: 0, z: -1 });
    for (const [slug, data] of [
      ['prism', prism.snapshot()], ['lantern', lantern.snapshot()],
      ['soldier', { schema: 1, level: 2, wave: 3, phase: 'play' }],
      ['garden', { schema: 1, level: 3, wave: 2, mode: 'playing' }],
      ['borrowed', { schema: 1, level: 4, loop: 2, mode: 'between' }],
    ]) assert.ok(writeGameSave(slug, data, localStorage));
    await run();
    assert.equal(document.querySelectorAll('.game-card').length, 6);
    for (const [slug, level] of [['soldier', 2], ['garden', 3], ['borrowed', 4], ['prism', 2], ['lantern', 1]]) {
      const card = document.querySelector(`.${slug}-card`), url = new URL(card.href);
      assert.equal(card.querySelector('[data-play-label]').textContent, 'CONTINUE RUN');
      assert.equal(url.pathname, `/games/${slug}.html`);
      assert.equal(url.searchParams.get('level'), String(level));
      assert.equal(url.searchParams.get('continue'), '1');
      assert.equal(document.querySelector(`.quick-play [data-game-link="${slug}"]`).href, card.href);
      assert.equal(card.querySelector('.game-save-note').hidden, false);
    }
    removeGameSave('prism', localStorage); refresh();
    assert.equal(document.querySelector('.prism-card [data-play-label]').textContent, 'PLAY GAME');
    assert.equal(new URL(document.querySelector('.prism-card').href).search, '');
    assert.equal(document.querySelector('.lantern-card [data-play-label]').textContent, 'CONTINUE RUN');
    assert.equal(document.querySelector('.wonderwake-card [data-play-label]').textContent, 'START THE VOYAGE');
  } finally { dom.window.close(); }
});

test('Wonderwake continuation reflects the unified campaign and never changes older saves', async () => {
  const { dom, run, refresh } = await hub(), { document, localStorage } = dom.window;
  try {
    localStorage.setItem('games:save:arcade:lane-lark', 'existing arcade save');
    localStorage.setItem('games:save:ribbon', 'existing ribbon save');
    await run();
    const progress = freshProgress(); progress.active = { id: 'dewfall' };
    assert.ok(writeProgress(progress, localStorage)); refresh();
    const card = document.querySelector('.wonderwake-card');
    assert.equal(card.querySelector('[data-play-label]').textContent, 'CONTINUE THE VOYAGE');
    assert.equal(card.querySelector('.game-save-note').textContent, 'SAVED · 0 / 25 FRIENDS RECRUITED');
    progress.completed = ['dewfall', 'dream-duos', 'burrow-banquet']; progress.active = null; progress.chapter = 1;
    assert.ok(writeProgress(progress, localStorage)); refresh();
    assert.equal(card.querySelector('.game-save-note').textContent, 'SAVED · 3 / 25 FRIENDS RECRUITED');
    assert.equal(new URL(card.href).pathname, '/games/wonderwake.html');
    assert.equal(document.querySelector('.quick-play [data-game-link="wonderwake"]').href, card.href);
    assert.equal(localStorage.getItem('games:save:arcade:lane-lark'), 'existing arcade save');
    assert.equal(localStorage.getItem('games:save:ribbon'), 'existing ribbon save');
    localStorage.removeItem(SAVE_KEY); refresh();
    assert.equal(card.querySelector('[data-play-label]').textContent, 'START THE VOYAGE');
    assert.equal(card.querySelector('.game-save-note').hidden, true);
  } finally { dom.window.close(); }
});

test('invalid checkpoints do not advertise continuation or break the collection', async () => {
  const { dom, run, refresh } = await hub(), { document, localStorage } = dom.window;
  try {
    await run();
    for (const slug of ['prism', 'lantern', 'garden', 'borrowed', 'soldier']) {
      for (const data of [{ schema: 999, level: 1, mode: 'playing' }, { schema: 1, level: 999, mode: 'playing' }, { schema: 1, level: 1, mode: 'broken' }]) {
        writeGameSave(slug, data, localStorage); refresh();
        assert.equal(document.querySelector(`.${slug}-card [data-play-label]`).textContent, 'PLAY GAME');
        assert.equal(document.querySelector(`.${slug}-card .game-save-note`).hidden, true);
      }
    }
    for (const raw of ['broken json', '{"version":1,"completed":["unknown-game"]}', '{"version":9}']) {
      localStorage.setItem(SAVE_KEY, raw); refresh();
      assert.equal(document.querySelector('.wonderwake-card [data-play-label]').textContent, 'START THE VOYAGE');
    }
  } finally { dom.window.close(); }
});

test('Lantern Vale retains its separate continuation slot in each resumable mode', async () => {
  const { dom, run, refresh } = await hub(), { document, localStorage } = dom.window;
  try {
    const world = JSON.parse(await readFile(new URL('../assets/lantern-world.json', import.meta.url), 'utf8'));
    await run();
    for (const schema of [1, 2, 3]) for (const mode of ['playing', 'paused', 'won', 'exploring']) {
      writeGameSave('lantern', { schema, level: 1, mode, player: world.spawn }, localStorage); refresh();
      const card = document.querySelector('.lantern-card'), url = new URL(card.href);
      assert.equal(card.querySelector('[data-play-label]').textContent, 'CONTINUE RUN');
      assert.equal(card.querySelector('.game-save-note').textContent, 'SAVED · FLIGHT 1 / 1');
      assert.equal(url.searchParams.get('level'), '1');
      assert.equal(url.searchParams.get('continue'), '1');
    }
  } finally { dom.window.close(); }
});
