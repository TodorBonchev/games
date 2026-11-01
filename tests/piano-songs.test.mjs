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
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/piano/' });
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

test('extended songs keep their full forms', async () => {
  const w = await loadPiano();
  const count = id => w.PIANO_SONGS.find(s => s.id === id).notes.filter(n => !n.rest).length;
  assert.ok(count('imperial') >= 100, 'Imperial March: main theme twice, B section with both endings, da capo');
  assert.equal(count('ode'), 62, 'Ode to Joy AABA');
  assert.ok(count('elise') >= 120 && count('starwars') >= 100 && count('jingle') >= 190);
  for (const s of w.PIANO_SONGS) {   // songs with a meter fill whole bars after the pickup (sheet bar lines line up)
    const total = s.notes.reduce((a, n) => a + n.dur, 0), m = s.meter || 4, whole = b => Math.abs(b / m - Math.round(b / m)) < 0.02;
    if (['ode', 'imperial', 'elise', 'jingle', 'twinkle', 'silent', 'starwars'].includes(s.id)) assert.ok(whole(total) || whole(total - (s.pickup || 0)), `${s.id}: ${total} beats`);
  }
});

test('sheet music renders every note with pitch, ledger lines, accidentals and follows the cursor', async () => {
  const w = await loadPiano(), d = w.document, P = w.__piano;
  for (const s of P.songs) {
    P.startSong(s);
    const notes = d.querySelectorAll('#staff .n');
    assert.equal(notes.length, P.L.steps.length, `${s.id}: one staff note per step`);
  }
  P.startSong(P.songs.find(s => s.id === 'imperial'));
  const st = d.getElementById('staff');
  assert.equal(st.querySelectorAll('svg > line.ln').length >= 5, true);
  assert.ok(st.textContent.includes('♯'), 'sharps drawn');
  const ys = [...st.querySelectorAll('.n ellipse')].slice(0, 4).map(e => +e.getAttribute('cy'));
  assert.equal(ys[0], ys[1]); assert.ok(ys[3] > ys[0], 'D#4 sits below G4');
  P.startSong(P.songs.find(s => s.id === 'elise'));
  const c4 = [...st.querySelectorAll('.n')][P.L.steps.findIndex(x => x.midi === 60)];
  assert.ok(c4.querySelectorAll('line').length >= 2, 'C4 has a ledger line plus stem');
  assert.ok(st.querySelector('.bm'), 'eighths are beamed');
  const cls = k => st.querySelectorAll('.n')[k].getAttribute('class');
  assert.match(cls(0), /cur/); assert.match(cls(1), /nxt/);
  P.keyDown(P.L.steps[0].midi - 60); P.keyUp(P.L.steps[0].midi - 60);
  assert.match(cls(0), /played/); assert.match(cls(1), /cur/); assert.match(cls(2), /nxt/);
  P.jumpTo(10); assert.equal(P.L.pos, 10); assert.match(cls(10), /cur/); assert.match(cls(9), /played/);
  P.setStaff(true); assert.equal(w.localStorage.getItem('piano.sheet'), '1');
  assert.ok(d.body.classList.contains('staffon'));
  P.setStaff(false); assert.equal(w.localStorage.getItem('piano.sheet'), '0');
  P.exitSong(); assert.equal(st.querySelectorAll('.n').length, 0);
});
