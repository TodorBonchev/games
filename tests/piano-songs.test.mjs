// Validates every song in piano/songs.js and plays each through the real guided mode.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const root = new URL('../piano/', import.meta.url);
const NOTE = /^([A-G])(#|b)?(\d)$/;
const midiOf = n => { const m = NOTE.exec(n); return (+m[3] + 1) * 12 + [0, 2, 4, 5, 7, 9, 11]['CDEFGAB'.indexOf(m[1])] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); };

async function loadPiano(t) {
  const html = (await readFile(new URL('index.html', root), 'utf8')).replace(/<script src="(?:scores|songs)\.js[^"]*"><\/script>/g, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/piano/' });
  t.after(() => dom.window.close());
  const w = dom.window;
  const node = () => new Proxy(function () {}, { get: (t, k) => k === 'connect' ? () => node() : k === 'getChannelData' ? () => new Float32Array(8) : (k === 'value' || k === 'currentTime' || k === 'sampleRate') ? 44100 : node(), set: () => true, apply: () => node() });
  w.AudioContext = function () { return new Proxy({}, { get: (t, k) => k === 'state' ? 'running' : k === 'currentTime' ? 0 : k === 'sampleRate' ? 44100 : k === 'resume' ? () => Promise.resolve() : () => node(), }); };
  w.eval(await readFile(new URL('scores.js', root), 'utf8'));
  w.eval(await readFile(new URL('songs.js', root), 'utf8'));
  for (const s of w.document.querySelectorAll('script:not([src])')) w.eval(s.textContent);
  return w;
}

test('every piano song has valid pitches and metadata; legacy melodies retain their compact range', async t => {
  const w = await loadPiano(t);
  const songs = w.PIANO_SONGS, cats = w.PIANO_CATEGORIES;
  assert.ok(songs.length >= 65, `expected expanded 65+ song catalog, got ${songs.length}`);
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
      if (s.score) {
        assert.ok(m >= 21 && m <= 108, `${s.id}: source pitch ${n.note} outside piano range`);
        assert.ok(Number.isFinite(n.beat) && n.beat >= 0, `${s.id}: absolute source onset`);
      } else assert.ok(m >= 60 && m <= 84, `${s.id}: ${n.note} outside C4–C6`);
    }
  }
});

test('guided mode completes every legacy melody with only correct presses', async t => {
  const w = await loadPiano(t);
  const P = w.__piano;
  for (const s of P.songs.filter(song => !song.score)) {
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

test('song list groups by category and filters by search', async t => {
  const w = await loadPiano(t), d = w.document;
  const heads = [...d.querySelectorAll('#songlist h3')].map(h => h.textContent);
  assert.deepEqual(heads, [...w.PIANO_CATEGORIES]);
  assert.equal(d.querySelector('#songlist .song').dataset.id, 'imperial');
  const q = d.getElementById('songq'); q.value = 'jingle'; q.dispatchEvent(new w.Event('input'));
  assert.deepEqual([...d.querySelectorAll('#songlist .song')].map(b => b.dataset.id), ['jingle']);
});

test('extended songs keep their full forms', async t => {
  const w = await loadPiano(t);
  const count = id => w.PIANO_SONGS.find(s => s.id === id).notes.filter(n => !n.rest).length;
  assert.ok(count('imperial') >= 100, 'Imperial March: main theme twice, B section with both endings, da capo');
  assert.ok(count('ode') >= 62 && w.PIANO_SONGS.find(song => song.id === 'ode').score, 'Ode to Joy retains the full sourced harmonization');
  assert.ok(count('elise') >= 400 && count('starwars') >= 130 && count('turkish') >= 300 && count('nachtmusik') >= 300 && count('jingle') >= 190);
  assert.ok(count('moonlight') >= 95 && count('swanlake') >= 85 && count('pinkpanther') >= 75 && count('titanic') >= 90 && count('shapeofyou') >= 250 && count('santa') >= 105 && count('takeonme') >= 75, 'new MIDI-sourced songs');
  for (const s of w.PIANO_SONGS.filter(song => !song.score)) {   // legacy melodies with a meter fill whole bars after the pickup (sheet bar lines line up)
    const total = s.notes.reduce((a, n) => a + n.dur, 0), m = s.meter || 4, whole = b => Math.abs(b / m - Math.round(b / m)) < 0.02;
    if (['ode', 'imperial', 'elise', 'jingle', 'twinkle', 'silent', 'starwars', 'turkish', 'nachtmusik', 'danube', 'clairdelune', 'zelda', 'megalovania', 'moonlight', 'swanlake', 'pinkpanther', 'titanic', 'shapeofyou', 'zaychentseto'].includes(s.id)) assert.ok(whole(total) || whole(total - (s.pickup || 0)), `${s.id}: ${total} beats`);
  }
});

test('sheet music renders every note with pitch, ledger lines, accidentals and follows the cursor', async t => {
  const w = await loadPiano(t), d = w.document, P = w.__piano;
  for (const s of P.songs) {
    P.startSong(s);
    const notes = d.querySelectorAll('#staff .n');
    assert.equal(notes.length, s.score ? P.L.events.length : P.L.steps.length, `${s.id}: every written pitch is rendered`);
  }
  P.startSong(P.songs.find(s => s.id === 'imperial'));
  const st = d.getElementById('staff');
  assert.equal(st.querySelectorAll('svg > line.ln').length >= 5, true);
  assert.ok(st.textContent.includes('♯'), 'sharps drawn');
  const ys = [...st.querySelectorAll('.n ellipse')].slice(0, 4).map(e => +e.getAttribute('cy'));
  assert.equal(ys[0], ys[1]); assert.ok(ys[3] > ys[0], 'D#4 sits below G4');
  P.startSong(P.songs.find(s => s.id === 'elise'));
  const c4Event = P.L.events.find(event => event.midi === 60);
  const c4 = st.querySelector(`.n[data-event="${c4Event.id}"]`);
  assert.ok(c4.querySelectorAll('line').length >= 2, 'C4 has a ledger line plus stem');
  assert.ok(st.querySelector('.bm'), 'eighths are beamed');
  P.startSong(P.songs.find(song => song.id === 'imperial'));
  const cls = k => st.querySelectorAll('.n')[k].getAttribute('class');
  assert.match(cls(0), /cur/); assert.match(cls(1), /nxt/);
  P.keyDown(P.L.steps[0].midi - P.keyboard.base); P.keyUp(P.L.steps[0].midi - P.keyboard.base);
  assert.match(cls(0), /played/); assert.match(cls(1), /cur/); assert.match(cls(2), /nxt/);
  P.jumpTo(10); assert.equal(P.L.pos, 10); assert.match(cls(10), /cur/); assert.match(cls(9), /played/);
  P.setStaff(true); assert.equal(w.localStorage.getItem('piano.sheet'), '1');
  assert.ok(d.body.classList.contains('staffon'));
  P.setStaff(false); assert.equal(w.localStorage.getItem('piano.sheet'), '0');
  P.exitSong(); assert.equal(st.querySelectorAll('.n').length, 0);
});
