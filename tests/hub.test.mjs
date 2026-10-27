import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule } from 'node:vm';
import { JSDOM } from 'jsdom';
import { writeGameSave, removeGameSave } from '../save-store.js';
import { createPrism } from '../prism-game.js';
import { createRibbon } from '../ribbon-game.js';
import { createDewfall } from '../dewfall-game.js';

async function hub() {
  const dom = new JSDOM(await readFile(new URL('../index.html', import.meta.url), 'utf8'), {
    url: 'https://example.test/games/', runScripts: 'outside-only',
  });
  const context = dom.getInternalVMContext();
  const saveModule = new SourceTextModule(await readFile(new URL('../save-store.js', import.meta.url), 'utf8'), { context });
  const module = new SourceTextModule(await readFile(new URL('../hub.js', import.meta.url), 'utf8'), { context });
  await module.link(() => saveModule);
  return { dom, run: () => module.evaluate(), refresh: () => dom.window.dispatchEvent(new dom.window.Event('storage')) };
}

test('the collection continues actual checkpoints from all three new game engines independently', async () => {
  const { dom, run, refresh } = await hub(), { document, localStorage } = dom.window;
  try {
    const prism = createPrism(), ribbon = createRibbon(), dewfall = createDewfall();
    prism.start(2); prism.rotate(0);
    ribbon.start(3); ribbon.steer(1, .3); ribbon.advance(.5);
    dewfall.start(4); dewfall.advance(.5, { x: .2, z: -.3 });
    for (const [slug, game] of [['prism', prism], ['ribbon', ribbon], ['dewfall', dewfall]]) {
      assert.ok(writeGameSave(slug, game.snapshot(), localStorage));
    }
    await run();
    assert.equal(document.querySelectorAll('.game-card').length, 9);
    for (const [slug, level] of [['prism', 2], ['ribbon', 3], ['dewfall', 4]]) {
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
    assert.equal(document.querySelector('.ribbon-card [data-play-label]').textContent, 'CONTINUE RUN');
    assert.equal(document.querySelector('.dewfall-card [data-play-label]').textContent, 'CONTINUE RUN');
  } finally { dom.window.close(); }
});

test('invalid new-game checkpoints do not break the collection or advertise continuation', async () => {
  const { dom, run, refresh } = await hub(), { document, localStorage } = dom.window;
  try {
    await run();
    for (const slug of ['prism', 'ribbon', 'dewfall']) {
      for (const data of [{ schema: 2, level: 1, mode: 'playing' }, { schema: 1, level: 999, mode: 'playing' }, { schema: 1, level: 1, mode: 'broken' }]) {
        writeGameSave(slug, data, localStorage); refresh();
        assert.equal(document.querySelector(`.${slug}-card [data-play-label]`).textContent, 'PLAY GAME');
        assert.equal(document.querySelector(`.${slug}-card .game-save-note`).hidden, true);
      }
    }
  } finally { dom.window.close(); }
});
