// Exercise the real lesson with its public controls. Only audio and time are
// substituted: no generated notes, learned progress or completion fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

const root = new URL('../piano/', import.meta.url);
const midiOf = name => {
  const m = /^([A-G])(#|b)?(\d)$/.exec(name);
  assert.ok(m, `valid note: ${name}`);
  return (+m[3] + 1) * 12 + [0, 2, 4, 5, 7, 9, 11]['CDEFGAB'.indexOf(m[1])] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
};

async function load(t, {hand, blockedStorage = false} = {}) {
  const html = (await readFile(new URL('index.html', root), 'utf8')).replace(/<script src="songs\.js[^"]*"><\/script>/, '');
  const dom = new JSDOM(html, {runScripts:'outside-only', pretendToBeVisual:true, url:'http://localhost/piano/'});
  t.after(() => dom.window.close());
  const w = dom.window, d = w.document;
  w.localStorage.setItem('piano.sound', 'synth');
  if (hand !== undefined) w.localStorage.setItem('piano.hand', hand);
  if (blockedStorage) Object.defineProperty(w, 'localStorage', {get() {throw new w.DOMException('Storage blocked', 'SecurityError');}});
  const node = () => new Proxy(function () {}, {
    get: (_, key) => key === 'connect' ? () => node() : key === 'getChannelData' ? () => new Float32Array(8) : ['value', 'currentTime', 'sampleRate'].includes(key) ? 44100 : node(),
    set: () => true, apply: () => node(),
  });
  w.AudioContext = function () {return new Proxy({}, {get: (_, key) => key === 'state' ? 'running' : key === 'currentTime' ? 0 : key === 'sampleRate' ? 44100 : key === 'resume' ? () => Promise.resolve() : () => node()});};
  let now = 0, next = 1;
  const timers = new Map();
  w.setTimeout = (fn, delay = 0, ...args) => {const id = next++; timers.set(id, {at:now + Math.max(0, Number(delay) || 0), fn:() => fn(...args)}); return id;};
  w.clearTimeout = id => timers.delete(id);
  const tick = ms => {
    const end = now + ms;
    for (let count = 0; ; count++) {
      assert.ok(count < 100000, 'lesson timers settle');
      const pending = [...timers].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!pending) break;
      const [id, job] = pending; timers.delete(id); now = job.at; job.fn();
    }
    now = end;
  };
  w.eval(await readFile(new URL('songs.js', root), 'utf8'));
  for (const script of d.querySelectorAll('script:not([src])')) w.eval(script.textContent);
  const P = w.__piano;
  assert.equal(typeof P.setHand, 'function', 'the live hand selector has a public lesson action');
  const choose = (value, id = 'lhand') => {const control = d.getElementById(id); assert.ok(control, `${id} exists`); control.value = value; control.dispatchEvent(new w.Event('change', {bubbles:true}));};
  const indexOf = midi => midi - 12 * (+d.getElementById('oct').textContent.slice(1) + 1);
  const press = () => {
    const expected = P.L.steps[P.L.pos], i = indexOf(expected.midi);
    assert.ok(i >= 0 && i < 25, `${P.L.song.id}/${P.L.hand}: ${expected.name} is visible`);
    const before = P.L.pos; P.keyDown(i); P.keyUp(i);
    assert.equal(P.L.pos, before + 1, 'one correct press advances exactly one note');
  };
  return {w, d, P, tick, choose, indexOf, press};
}

test('both hand settings stay synchronized and persist before selecting a song', async t => {
  const {w, d, P, choose} = await load(t);
  assert.equal(P.L.hand, 'right');
  choose('left', 'songHand');
  assert.equal(P.L.song, null, 'choosing a default does not start an arbitrary song');
  assert.equal(P.L.hand, 'left');
  assert.equal(d.getElementById('lhand').value, 'left');
  assert.equal(w.localStorage.getItem('piano.hand'), 'left');
  d.querySelector('#songlist .song[data-id="twinkle"]').click();
  assert.equal(P.L.hand, 'left');
  assert.equal(P.L.song.id, 'twinkle');
  assert.equal(P.L.steps[0].midi, midiOf(P.L.song.leftNotes.find(n => !n.rest).note));
  choose('right');
  assert.equal(d.getElementById('songHand').value, 'right');
  assert.equal(w.localStorage.getItem('piano.hand'), 'right');
  assert.equal(P.L.steps[0].midi, midiOf(P.L.song.notes.find(n => !n.rest).note));
});

test('saved left hand initializes both selectors; invalid or inaccessible storage falls back safely', async t => {
  const saved = await load(t, {hand:'left'});
  assert.equal(saved.P.L.hand, 'left');
  for (const id of ['lhand', 'songHand']) assert.equal(saved.d.getElementById(id).value, 'left');
  saved.P.startSong(saved.P.songs.find(song => song.id === 'canon'));
  assert.ok(saved.P.L.steps.every(step => step.midi <= 60) && saved.P.L.steps.some(step => step.midi < 60), 'saved choice selects actual bass notes');
  const invalid = await load(t, {hand:'unknown'});
  assert.equal(invalid.P.L.hand, 'right');
  const blocked = await load(t, {blockedStorage:true});
  assert.equal(blocked.P.L.hand, 'right');
  assert.doesNotThrow(() => blocked.choose('left', 'songHand'));
  assert.equal(blocked.P.L.hand, 'left');
});

test('every left-hand arrangement is reachable and completable through the real Wait lesson', async t => {
  const {d, P, choose, indexOf, press, tick} = await load(t);
  choose('left', 'songHand');
  assert.equal(P.songs.length, 49, 'the full current library is covered');
  for (const song of P.songs) {
    P.startSong(song);
    const notes = song.leftNotes.filter(note => !note.rest), steps = P.L.steps.length;
    assert.equal(P.L.hand, 'left');
    assert.equal(steps, notes.length, `${song.id}: the bass part supplies every learning target`);
    assert.deepEqual(Array.from(P.L.steps, step => step.midi), Array.from(notes, note => midiOf(note.note)), `${song.id}: no melody substitution`);
    assert.ok(Math.abs(P.L.total - song.notes.reduce((total, note) => total + note.dur, 0)) < 1e-6, `${song.id}: whole arrangement length`);
    tick(5000); assert.equal(P.L.pos, 0, `${song.id}: Wait remains stationary`);
    const target = indexOf(P.L.steps[0].midi), wrong = target === 0 ? 1 : 0;
    P.keyDown(wrong); P.keyUp(wrong); assert.equal(P.L.pos, 0, `${song.id}: wrong note cannot advance`);
    for (let k = 0; k < steps; k++) press();
    assert.equal(P.L.state, 'done', song.id);
    assert.equal(d.getElementById('done').classList.contains('show'), true, `${song.id}: completion UI`);
    assert.match(d.getElementById('dstats').textContent, new RegExp(`^${steps} notes`));
  }
});

test('the staff uses the selected part, fits bass pitches and keeps note seeking/highlights', async t => {
  const {w, d, P, choose, press} = await load(t);
  const song = P.songs.find(song => song.id === 'canon');
  P.startSong(song); P.setStaff(true);
  const staff = d.getElementById('staff'), trebleGlyph = staff.querySelector('svg').innerHTML;
  choose('left');
  assert.match(`${staff.dataset.clef || ''} ${staff.getAttribute('aria-label') || ''}`, /bass/i);
  assert.notEqual(staff.querySelector('svg').innerHTML, trebleGlyph);
  assert.equal(staff.querySelectorAll('.n').length, P.L.steps.length);
  for (const note of staff.querySelectorAll('.n ellipse')) {
    const y = +note.getAttribute('cy'); assert.ok(y >= 0 && y <= 74, `bass pitch visible at ${y}`);
  }
  press();
  assert.equal(staff.querySelector('.n.cur').dataset.k, '1');
  assert.equal(staff.querySelector('.n[data-k="0"]').classList.contains('played'), true);
  staff.querySelector('.n[data-k="5"] .hit').dispatchEvent(new w.MouseEvent('click', {bubbles:true}));
  assert.equal(P.L.pos, 5, 'tapping selected-hand notation seeks within that part');
  assert.equal(staff.querySelector('.n.cur').dataset.k, '5');
  choose('right');
  assert.match(`${staff.dataset.clef || ''} ${staff.getAttribute('aria-label') || ''}`, /treble/i);
  assert.equal(staff.querySelectorAll('.n').length, song.notes.filter(note => !note.rest).length);
});

test('Listen plays only the chosen part and stopping restores its learning position', async t => {
  const {w, d, P, choose, tick} = await load(t);
  const song = P.songs.find(song => song.id === 'canon');
  for (const hand of ['right', 'left']) {
    choose(hand, 'songHand'); P.startSong(song); P.jumpTo(3);
    const expected = Array.from(P.L.steps.slice(3), step => step.name);
    w.__notes = []; P.listen();
    assert.equal(P.L.state, 'listening');
    tick(P.L.total * 60000 / song.tempo + 1000);
    assert.deepEqual(Array.from(w.__notes), expected, `${hand}: playback uses its own part`);
    assert.equal(P.L.pos, 3); assert.equal(P.L.state, 'ready');
    assert.equal(P.L.demo, null); assert.equal(P.L.demoNotes.size, 0);
    assert.equal(d.querySelectorAll('#kb .k.down').length, 0, 'completed listen has no sustained keys');
    w.__notes = []; P.listen(); tick(81); assert.equal(w.__notes.length, 1);
    d.getElementById('ldemo').click(); const count = w.__notes.length; tick(1000000);
    assert.equal(w.__notes.length, count, 'Stop cancels all queued audio');
    assert.equal(P.L.pos, 3);
  }
});

test('changing hand during Tempo, pause or Listen resets progress and cannot revive old timers', async t => {
  const {w, d, P, choose, tick} = await load(t);
  const song = P.songs.find(song => song.id === 'twinkle');
  P.startSong(song); d.getElementById('lmode').click(); P.play();
  const firstGap = (P.L.steps[1].beat - P.L.steps[0].beat) * 60000 / song.tempo * 1.15 + 150;
  tick(firstGap + 1); assert.equal(P.L.pos, 1); assert.equal(P.L.misses, 1);
  P.pause(); assert.equal(P.L.state, 'paused');
  choose('left');
  assert.equal(P.L.follow, true, 'hand choice preserves Tempo preference');
  assert.equal(P.L.state, 'ready'); assert.equal(P.L.pos, 0);
  assert.equal(P.L.hits, 0); assert.equal(P.L.misses, 0);
  tick(1000000); assert.equal(P.L.pos, 0, 'old Tempo timer cannot move new part');
  P.play(); choose('right'); tick(1000000);
  assert.equal(P.L.state, 'ready'); assert.equal(P.L.pos, 0, 'switching while running also freezes the fresh part');
  P.listen(); tick(81); assert.equal(P.L.demoNotes.size, 1);
  w.__notes = []; choose('left'); tick(1000000);
  assert.equal(P.L.state, 'ready'); assert.equal(P.L.pos, 0);
  assert.equal(P.L.demo, null); assert.equal(P.L.demoNotes.size, 0);
  assert.deepEqual(Array.from(w.__notes), [], 'old Listen callbacks cannot sound the new hand');
  assert.equal(d.querySelectorAll('#kb .k.down').length, 0);
});

test('switching hand releases held notes/keyboard ownership and dismisses completion', async t => {
  const {w, d, P, choose, press} = await load(t);
  P.startSong(P.songs.find(song => song.id === 'twinkle'));
  w.dispatchEvent(new w.KeyboardEvent('keydown', {key:'z', bubbles:true}));
  assert.equal(P.L.pos, 1); assert.equal(d.querySelectorAll('#kb .k.down').length, 1);
  d.getElementById('sus').click();
  choose('left');
  assert.equal(d.querySelectorAll('#kb .k.down').length, 0, 'held/sustained notes stop when the part changes');
  w.__notes = []; w.dispatchEvent(new w.KeyboardEvent('keydown', {key:'z', bubbles:true}));
  assert.equal(w.__notes.length, 1, 'the prior hand cannot retain keyboard ownership');
  w.dispatchEvent(new w.KeyboardEvent('keyup', {key:'z', bubbles:true}));
  d.getElementById('sus').click(); P.restart();
  while (P.L.pos < P.L.steps.length) press();
  assert.equal(P.L.state, 'done');
  choose('right');
  assert.equal(P.L.state, 'ready'); assert.equal(P.L.pos, 0);
  assert.equal(d.getElementById('done').classList.contains('show'), false);
  assert.equal(d.getElementById('lprog').firstChild.style.width, '0%');
});

test('keyboard interaction with a hand select cannot play keys, transpose or toggle sustain', async t => {
  const {w, d, P} = await load(t);
  P.startSong(P.songs.find(song => song.id === 'twinkle'));
  const select = d.getElementById('lhand'), octave = d.getElementById('oct').textContent;
  w.__notes = [];
  for (const key of ['z', 'ArrowRight', 'ArrowLeft', ' ']) {
    select.dispatchEvent(new w.KeyboardEvent('keydown', {key, bubbles:true}));
    select.dispatchEvent(new w.KeyboardEvent('keyup', {key, bubbles:true}));
  }
  assert.deepEqual(Array.from(w.__notes), []);
  assert.equal(P.L.pos, 0); assert.equal(d.getElementById('oct').textContent, octave);
  assert.equal(d.getElementById('sus').classList.contains('on'), false);
});
