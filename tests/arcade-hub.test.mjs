import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { CHAPTERS, MISSIONS } from '../voyage/progress.js';
import { arcadeGames } from '../arcade/catalog.js';

test('the home page exposes exactly six games, with one unified adventure first', async () => {
  const dom = new JSDOM(await readFile(new URL('../index.html', import.meta.url), 'utf8'));
  try {
    const { document } = dom.window;
    const expected = ['wonderwake', 'soldier', 'garden', 'borrowed', 'prism', 'lantern'];
    assert.deepEqual([...document.querySelectorAll('.game-card')].map(card => card.dataset.gameLink), expected);
    assert.deepEqual([...document.querySelectorAll('.quick-play a')].map(card => card.dataset.gameLink), expected);
    assert.equal(document.querySelectorAll('.arcade-card, #arcade-grid, #arcade-search').length, 0);
    assert.ok(![...document.querySelectorAll('script')].some(script => script.src.includes('arcade/hub.js')));
    assert.equal(document.querySelector('.wonderwake-card').getAttribute('href'), 'wonderwake.html');
    for (const card of document.querySelectorAll('.game-card')) {
      assert.ok(document.getElementById(card.getAttribute('aria-labelledby')));
      const image = card.querySelector('img');
      assert.ok(image.alt.length > 20);
      await access(new URL(`../${image.getAttribute('src')}`, import.meta.url));
    }
  } finally { dom.window.close(); }
});

test('the single adventure contains all 25 merged games exactly once across five islands', () => {
  const merged = [...arcadeGames.map(game => game.id), 'moonbounce', 'popwake', 'pondpost', 'ribbon', 'dewfall'].sort();
  assert.equal(CHAPTERS.length, 5);
  assert.ok(CHAPTERS.every(chapter => chapter.missions.length === 5));
  assert.deepEqual(MISSIONS.map(mission => mission.id).sort(), merged);
  assert.deepEqual(CHAPTERS.flatMap(chapter => chapter.missions).sort(), merged);
  assert.equal(new Set(MISSIONS.map(mission => mission.hero)).size, 25);
  assert.ok(MISSIONS.every(mission => mission.task && mission.gift && mission.gesture));
});
