// Validates every song in piano/songs.js and plays each through the real guided mode.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const root = new URL('../piano/', import.meta.url);
const NOTE = /^([A-G])(#|b)?(\d)$/;
const midiOf = n => { const m = NOTE.exec(n); return (+m[3] + 1) * 12 + [0, 2, 4, 5, 7, 9, 11]['CDEFGAB'.indexOf(m[1])] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); };

async function loadPiano() {
  const html = (await readFile(new URL('index.html', root), 'utf8')).replace(/<script src="songs\.js[^"]*"><\/script>/, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const node = () => new Proxy(function () {}, { get: (t, k) => k === 'connect' ? () => node() : k === 'getChannelData' ? () => new Float32Array(8) : (k === 'value' || k === 'currentTime' || k === 'sampleRate') ? 44100 : node(), set: () => true, apply: () => node() });
  w.AudioContext = function () { return new Proxy({}, { get: (t, k) => k === 'state' ? 'running' : k === 'currentTime' ? 0 : k === 'sampleRate' ? 44100 : k === 'resume' ? () => Promise.resolve() : () => node(), }); };
  w.eval(await readFile(new URL('songs.js', root), 'utf8'));
  for (const s of w.document.querySelectorAll('script:not([src])')) w.eval(s.textContent);
  return w;
}

test('every piano song has valid notes, durations, metadata and fits C4–C6', async () => {
  const w = await loadPiano();
  const songs = w.PIANO_SONGS, cats = w.PIANO_CATEGORIES;
  assert.ok(songs.length >= 35, `expected 35+ songs, got ${songs.length}`);
  assert.equal(songs[0].id, 'imperial', 'Imperial March stays first');
  const ids = new Set();
  for (const s of songs) {
    assert.ok(!ids.has(s.id), `duplicate id ${s.id}`); ids.add(s.id);
    assert.ok(cats.includes(s.category), `${s.id}: category ${s.category}`);
    assert.ok(['Easy', 'Medium', 'Hard'].includes(s.level), `${s.id}: level`);
    assert.ok(s.tempo > 30 && s.tempo < 260, `${s.id}: tempo`);
    assert.ok(s.notes.length > 0);
    for (const n of s.notes) {
      assert.ok(n.dur > 0, `${s.id}: duration ${n.dur}`);
      if (n.rest) continue;
      assert.match(n.note, NOTE, `${s.id}: unknown note ${n.note}`);
      const m = midiOf(n.note);
      assert.ok(m >= 60 && m <= 84, `${s.id}: ${n.note} outside C4–C6`);
    }
  }
});

test('guided mode completes every song with only correct presses', async () => {
  const w = await loadPiano();
  const P = w.__piano;
  for (const s of P.songs) {
    P.startSong(s);
    const steps = P.L.steps.length;
    assert.equal(steps, s.notes.filter(n => !n.rest).length, s.id);
    P.keyDown(steps && P.L.steps[0].midi === 60 ? 1 : 0); P.keyUp(0); P.keyUp(1);   // a wrong key never advances
    assert.equal(P.L.pos, 0, `${s.id}: wrong key advanced`);
    for (let k = 0; k < steps; k++) {
      const i = P.L.steps[k].midi - 60 - 0;     // songs fit C4–C6 so the view stays at C4
      assert.ok(i >= 0 && i <= 24, `${s.id}: step ${k} off the keyboard`);
      P.keyDown(i); P.keyUp(i);
    }
    assert.equal(P.L.pos, steps, `${s.id}: did not complete`);
    assert.match(w.document.getElementById('lstep').textContent, /Done/);
  }
});

test('song list groups by category and filters by search', async () => {
  const w = await loadPiano(), d = w.document;
  const heads = [...d.querySelectorAll('#songlist h3')].map(h => h.textContent);
  assert.deepEqual(heads, [...w.PIANO_CATEGORIES]);
  assert.equal(d.querySelector('#songlist .song').dataset.id, 'imperial');
  const q = d.getElementById('songq'); q.value = 'jingle'; q.dispatchEvent(new w.Event('input'));
  assert.deepEqual([...d.querySelectorAll('#songlist .song')].map(b => b.dataset.id), ['jingle']);
});
