import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { CHAPTERS, MISSIONS } from '../voyage/progress.js';
import { arcadeGames } from '../arcade/catalog.js';
import { ACTIVITY_IDS, activityDestination } from '../activity-redirect.js';
import { ACTIVITIES, DISTRICTS } from '../activities/catalog.js';

const distinctActivities = [...arcadeGames.map(game => game.id), 'moonbounce', 'popwake', 'pondpost', 'ribbon', 'dewfall', 'garden', 'borrowed', 'prism', 'lantern', 'upside'];

test('home exposes Zombie, Piano and Selva with complete accessible destination cards', async () => {
  const dom = new JSDOM(await readFile(new URL('../index.html', import.meta.url), 'utf8'));
  try {
    const { document } = dom.window;
    assert.deepEqual([...document.querySelectorAll('.game-card')].map(card => card.dataset.gameLink), ['soldier', 'piano', 'selva']);
    assert.deepEqual([...document.querySelectorAll('.quick-play a')].map(card => card.dataset.gameLink), ['soldier', 'piano', 'selva']);
    assert.equal(document.querySelectorAll('.arcade-card, .wonderwake-card, .upside-card, #arcade-grid').length, 0);
    for (const card of document.querySelectorAll('.game-card')) {
      assert.ok(document.getElementById(card.getAttribute('aria-labelledby')));
      const image = card.querySelector('img'); assert.ok(image.alt.length > 20);
      await access(new URL(`../${image.getAttribute('src')}`, import.meta.url));
    }
    const destinations = [...new Set([...document.querySelectorAll('a[href]')].map(link => link.getAttribute('href')).filter(href => !href.startsWith('#') && href !== './'))].sort();
    assert.deepEqual(destinations, ['piano/', 'selva/', 'soldier.html']);
  } finally { dom.window.close(); }
});

test('the former Wonderwake content still contains all 25 activities exactly once', () => {
  const merged = [...arcadeGames.map(game => game.id), 'moonbounce', 'popwake', 'pondpost', 'ribbon', 'dewfall'].sort();
  assert.equal(CHAPTERS.length, 5); assert.ok(CHAPTERS.every(chapter => chapter.missions.length === 5));
  assert.deepEqual(MISSIONS.map(mission => mission.id).sort(), merged);
  assert.deepEqual(CHAPTERS.flatMap(chapter => chapter.missions).sort(), merged);
  assert.equal(new Set(MISSIONS.map(mission => mission.hero)).size, 25);
  assert.ok(MISSIONS.every(mission => mission.task && mission.gift && mission.gesture));
});

test('compatibility routes cover all 30 activities with no separate game destinations', async () => {
  assert.equal(ACTIVITY_IDS.length, 30); assert.deepEqual([...ACTIVITY_IDS].sort(), distinctActivities.sort());
  assert.deepEqual(ACTIVITIES.map(activity => activity.id).sort(), [...ACTIVITY_IDS].sort());
  assert.deepEqual(DISTRICTS.flatMap(district => district.missions).sort(), [...ACTIVITY_IDS].sort());
  for (const id of ACTIVITY_IDS) {
    const source = arcadeGames.some(game => game.id === id) ? `https://example.test/games/arcade.html?game=${id}` : `https://example.test/games/${id}.html`;
    const target = activityDestination(source, source.includes('/arcade.html') ? 'arcade' : id);
    assert.equal(target.origin, 'https://example.test'); assert.equal(target.pathname, '/games/soldier.html'); assert.equal(target.searchParams.get('activity'), id);
  }
  for (const entry of ['garden', 'borrowed', 'prism', 'lantern', 'upside', 'wonderwake', 'moonbounce', 'popwake', 'pondpost', 'ribbon', 'dewfall', 'arcade']) {
    const dom = new JSDOM(await readFile(new URL(`../${entry}.html`, import.meta.url), 'utf8'));
    try {
      assert.equal(dom.window.document.documentElement.dataset.activityEntry, entry);
      const scripts = [...dom.window.document.querySelectorAll('script[src]')];
      assert.equal(scripts.length, 1); assert.ok(scripts[0].getAttribute('src').startsWith('activity-redirect.js'));
      assert.equal(dom.window.document.querySelectorAll('canvas, iframe').length, 0);
      assert.ok(dom.window.document.getElementById('activityDestination').getAttribute('href').startsWith('soldier.html?'));
    } finally { dom.window.close(); }
  }
});

test('old activity bookmarks preserve stage and safe settings without changing zombie island', () => {
  const target = activityDestination('https://example.test/games/upside.html?level=3&debug=1&q=low&continue=1&fps=1', 'upside');
  assert.equal(target.searchParams.get('activityLevel'), '3'); assert.equal(target.searchParams.has('level'), false);
  for (const key of ['debug', 'fps', 'continue']) assert.equal(target.searchParams.get(key), '1');
  assert.equal(target.searchParams.get('q'), 'low');
  const mission = activityDestination('https://example.test/games/wonderwake.html?mission=dewfall', 'wonderwake');
  assert.equal(mission.searchParams.get('activity'), 'dewfall');
  const unknown = activityDestination('https://example.test/games/arcade.html?game=https://hostile.test/&level=999&q=evil', 'arcade');
  assert.equal(unknown.href, 'https://example.test/games/soldier.html?district=harbor');
  assert.equal(activityDestination('https://example.test/games/wonderwake.html', 'wonderwake').searchParams.get('district'), 'harbor');
});
