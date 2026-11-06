// Real selected-hand lessons with only audio and wall time substituted. Playback
// assertions inspect the notes the actual synth receives and the visible cursor.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

const root = new URL('../piano/', import.meta.url);
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-5, `${message}: ${actual} versus ${expected}`);
const midiOf = name => {const m=/^([A-G])(#|b)?(\d)$/.exec(name);assert.ok(m);return(+m[3]+1)*12+[0,2,4,5,7,9,11]['CDEFGAB'.indexOf(m[1])]+(m[2]==='#'?1:m[2]==='b'?-1:0);};

async function load(t, {savedSpeed, blockedStorage = false} = {}) {
  const html = (await readFile(new URL('index.html', root), 'utf8')).replace(/<script src="(?:scores|songs)\.js[^"]*"><\/script>/g, '');
  const dom = new JSDOM(html, {runScripts:'outside-only', pretendToBeVisual:true, url:'http://localhost/piano/'});
  t.after(() => dom.window.close());
  const w = dom.window, d = w.document;
  w.localStorage.setItem('piano.sound', 'synth');
  if (savedSpeed !== undefined) w.localStorage.setItem('piano.listenSpeed', savedSpeed);
  if (blockedStorage) Object.defineProperty(w, 'localStorage', {get() {throw new w.DOMException('Storage blocked', 'SecurityError');}});
  const node = () => new Proxy(function () {}, {
    get: (_, key) => key === 'connect' ? () => node() : key === 'getChannelData' ? () => new Float32Array(8) : ['value', 'currentTime', 'sampleRate'].includes(key) ? 44100 : node(),
    set: () => true, apply: () => node(),
  });
  w.AudioContext = function () {return new Proxy({}, {get: (_, key) => key === 'state' ? 'running' : key === 'currentTime' ? 0 : key === 'sampleRate' ? 44100 : key === 'resume' ? () => Promise.resolve() : () => node()});};
  let now = 0, next = 1;
  const timers = new Map();
  Object.defineProperty(w.performance, 'now', {value:() => now});
  w.setTimeout = (fn, delay = 0, ...args) => {const id = next++; timers.set(id, {at:now + Math.max(0, Number(delay) || 0), fn:() => fn(...args)}); return id;};
  w.clearTimeout = id => timers.delete(id);
  const advanceTo = end => {
    assert.ok(end >= now, 'the test clock cannot move backwards');
    for (let count = 0; ; count++) {
      assert.ok(count < 100000, 'lesson timers settle');
      const job = [...timers].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!job) break;
      const [id, task] = job; timers.delete(id); now = task.at; task.fn();
    }
    now = end;
  };
  const tick = ms => advanceTo(now + ms);
  w.eval(await readFile(new URL('scores.js', root), 'utf8'));
  w.eval(await readFile(new URL('songs.js', root), 'utf8'));
  for (const script of d.querySelectorAll('script:not([src])')) w.eval(script.textContent);
  const P = w.__piano;
  assert.equal(typeof P.setListenSpeed, 'function');
  const heard = [];
  w.__notes = {push(name) {heard.push({name, at:now});}};
  const select = value => {const control = d.getElementById('lspeed'); control.value = String(value); control.dispatchEvent(new w.Event('change', {bubbles:true}));};
  return {w, d, P, heard, select, tick, advanceTo, now:() => now};
}

test('listening speed defaults to normal, exposes slow choices, persists and survives song/hand changes', async t => {
  const {w, d, P, select} = await load(t);
  const control = d.getElementById('lspeed');
  assert.ok(control, 'listening speed is a real native setting');
  assert.equal(P.L.listenSpeed, 1); assert.equal(control.value, '1');
  assert.deepEqual([...control.options].map(option => Number(option.value)), [.25, .5, .75, 1]);
  select(.5); assert.equal(P.L.listenSpeed, .5);
  assert.equal(w.localStorage.getItem('piano.listenSpeed'), '0.5');
  P.startSong(P.songs.find(song => song.id === 'twinkle')); P.setHand('left');
  assert.equal(P.L.listenSpeed, .5); assert.equal(control.value, '0.5');
  P.startSong(P.songs.find(song => song.id === 'imperial')); P.exitSong();
  assert.equal(P.L.listenSpeed, .5); assert.equal(P.L.song, null);
  for (const value of [0, -1, .6, 2, NaN, Infinity, 'slow', null, undefined]) {
    assert.equal(P.setListenSpeed(value), false, `reject invalid rate ${String(value)}`);
    assert.equal(P.L.listenSpeed, .5);
    assert.equal(w.localStorage.getItem('piano.listenSpeed'), '0.5');
  }
});

test('saved listening speed is validated and unavailable storage does not prevent slowing playback', async t => {
  for (const speed of ['0.25', '0.5', '0.75', '1']) {
    const {P, d} = await load(t, {savedSpeed:speed});
    assert.equal(P.L.listenSpeed, Number(speed)); assert.equal(d.getElementById('lspeed').value, speed);
  }
  for (const savedSpeed of ['', '0', '-1', 'NaN', 'Infinity', '2', '0.6', '0.5oops']) {
    const {P, d} = await load(t, {savedSpeed});
    assert.equal(P.L.listenSpeed, 1, `invalid stored rate ${savedSpeed}`);
    assert.equal(d.getElementById('lspeed').value, '1');
  }
  const {P, select} = await load(t, {blockedStorage:true});
  assert.equal(P.L.listenSpeed, 1);
  assert.doesNotThrow(() => select(.25)); assert.equal(P.L.listenSpeed, .25);
});

test('every legacy song and both hands retain pitch and scale the whole Listen timeline to quarter speed', async t => {
  const {P, heard, tick} = await load(t);
  assert.ok(P.songs.length >= 65); P.setListenSpeed(.25);
  for (const hand of ['right', 'left']) {
    P.setHand(hand);
    for (const song of P.songs.filter(song => !song.score)) {
      P.startSong(song); heard.length = 0;
      const steps = Array.from(P.L.steps, step => ({...step}));
      P.listen(); tick(P.L.total * 60000 / song.tempo / .25 + 1000);
      assert.equal(heard.length, steps.length, `${song.id}/${hand}: no skipped or extra notes`);
      assert.deepEqual(heard.map(event => midiOf(event.name)), steps.map(step => step.midi), `${song.id}/${hand}: slowdown preserves exact pitch regardless of enharmonic notation spelling`);
      for (let k = 0; k < steps.length; k++) close(heard[k].at - heard[0].at, (steps[k].beat - steps[0].beat) * 60000 / song.tempo / .25, `${song.id}/${hand}: scaled onset ${k}`);
      assert.equal(P.L.state, 'ready'); assert.equal(P.L.pos, 0);
      assert.equal(P.L.demo, null); assert.equal(P.L.demoNotes.size, 0);
    }
  }
});

test('all four Listen rates scale note gates and highlights without changing pitch', async t => {
  const {w, d, P, heard, tick, advanceTo} = await load(t);
  const song = P.songs.find(song => song.id === 'twinkle');
  for (const speed of [.25, .5, .75, 1]) {
    P.startSong(song); P.setStaff(true); P.setListenSpeed(speed); heard.length = 0; P.listen(); tick(100);
    assert.equal(heard.length, 1); assert.equal(w.__lastVoice.midi, P.L.steps[0].midi);
    const hold = Math.max(90, P.L.steps[0].dur * 60000 / song.tempo / speed * .9);
    advanceTo(heard[0].at + hold - 1);
    assert.equal(d.querySelectorAll('#kb .k.down').length, 1);
    assert.equal(d.querySelector('#staff .n.cur').dataset.k, '0');
    advanceTo(heard[0].at + hold + 1);
    assert.equal(d.querySelectorAll('#kb .k.down').length, 0, 'notes receive a scaled release');
    const nextOnset = heard[0].at + (P.L.steps[1].beat - P.L.steps[0].beat) * 60000 / song.tempo / speed;
    advanceTo(nextOnset + 1);
    assert.equal(heard.length, 2); assert.equal(P.L.demoPos, 1);
    assert.equal(d.querySelector('#staff .n.cur').dataset.k, '1');
    assert.equal(w.__lastVoice.midi, P.L.steps[1].midi, 'pitch remains the score pitch');
  }
});

test('changing speed during Listen replays its current note and preserves the original learning position', async t => {
  const {d, P, heard, select, tick, advanceTo} = await load(t);
  const song = P.songs.find(song => song.id === 'twinkle');
  P.startSong(song); P.jumpTo(3); P.play(); P.setListenSpeed(.5); P.listen(); tick(100);
  const oldFirst = heard[0].at, gap = (P.L.steps[4].beat - P.L.steps[3].beat) * 60000 / song.tempo / .5;
  advanceTo(oldFirst + gap + 10);
  assert.equal(P.L.demoPos, 4); assert.equal(P.L.pos, 3);
  const before = heard.length; select(.25);
  assert.equal(P.L.state, 'listening'); assert.equal(P.L.demoPos, 4);
  assert.equal(P.L.resumePos, 3); assert.equal(P.L.pos, 3);
  tick(100); assert.equal(heard.length, before + 1);
  assert.equal(heard.at(-1).name, P.L.steps[4].name, 'the current note restarts at the new pace');
  const resumed = heard.at(-1).at;
  const newGap = (P.L.steps[5].beat - P.L.steps[4].beat) * 60000 / song.tempo / .25;
  advanceTo(resumed + newGap - 1); assert.equal(heard.length, before + 1, 'old faster callbacks are canceled');
  advanceTo(resumed + newGap + 1); assert.equal(heard.length, before + 2); assert.equal(P.L.demoPos, 5);
  d.getElementById('ldemo').click(); const count = heard.length; tick(1000000);
  assert.equal(heard.length, count); assert.equal(P.L.pos, 3);
  assert.equal(P.L.state, 'playing', 'Wait practice resumes its original state');
  assert.equal(P.L.demo, null); assert.equal(P.L.demoNotes.size, 0);
  assert.equal(d.querySelectorAll('#kb .k.down').length, 0);
});

test('listening speed never changes Wait or Tempo practice timing and native setting keys cannot play notes', async t => {
  const {w, d, P, heard, select, tick} = await load(t);
  const song = P.songs.find(song => song.id === 'twinkle');
  P.startSong(song); select(.25); tick(10000); assert.equal(P.L.pos, 0);
  const control = d.getElementById('lspeed'), octave = d.getElementById('oct').textContent;
  for (const key of ['z', 'ArrowLeft', 'ArrowRight', ' ']) {
    control.dispatchEvent(new w.KeyboardEvent('keydown', {key, bubbles:true}));
    control.dispatchEvent(new w.KeyboardEvent('keyup', {key, bubbles:true}));
  }
  assert.equal(heard.length, 0); assert.equal(d.getElementById('oct').textContent, octave);
  assert.equal(d.getElementById('sus').classList.contains('on'), false);
  d.getElementById('lmode').click(); P.play();
  const practiceGap = (P.L.steps[1].beat - P.L.steps[0].beat) * 60000 / song.tempo * 1.15 + 150;
  tick(practiceGap - 1); assert.equal(P.L.pos, 0);
  select(.5); tick(2); assert.equal(P.L.pos, 1, 'changing Listen speed cannot restart or slow a practice timer');
  P.pause(); const pos = P.L.pos; select(.75); tick(10000);
  assert.equal(P.L.state, 'paused'); assert.equal(P.L.pos, pos);
});

test('a rapid repeated-note fixture retains release ownership when the same piano key is retriggered', async t => {
  const {P, d, heard, tick, advanceTo} = await load(t);
  // Deliberately short repeated notes exercise overlapping release callbacks;
  // this is a scheduler fixture, not an assertion about a library arrangement.
  const song = {id:'rapid-restrike-fixture', title:'Rapid restrike', tempo:180, notes:[{note:'C4', dur:.25}, {note:'C4', dur:.25}, {note:'D4', dur:1}]};
  P.startSong(song); P.setListenSpeed(1); P.listen(); tick(100);
  const first = heard[0], step = P.L.steps[0];
  const gate = Math.max(90, step.dur * 60000 / song.tempo * .9);
  advanceTo(first.at + gate + 1);
  assert.equal(P.L.demoPos, 1);
  assert.ok(d.querySelector('#kb .k.next.down'), 'an earlier note cannot release the same key’s newer voice');
});

test('slow playback cannot leave queued notes after restart, hand change, song change, exit or backgrounding', async t => {
  const {w, d, P, heard, tick} = await load(t);
  const song = P.songs.find(song => song.id === 'twinkle');
  const actions = [
    () => P.restart(),
    () => P.setHand(P.L.hand === 'left' ? 'right' : 'left'),
    () => P.startSong(P.songs.find(song => song.id === 'canon')),
    () => P.exitSong(),
    () => {Object.defineProperty(d, 'hidden', {configurable:true, value:true}); d.dispatchEvent(new w.Event('visibilitychange'));},
  ];
  for (const action of actions) {
    Object.defineProperty(d, 'hidden', {configurable:true, value:false});
    P.startSong(song); P.setListenSpeed(.25); P.listen(); tick(100);
    assert.ok(P.L.demoNotes.size > 0); action();
    const count = heard.length; tick(1000000);
    assert.equal(heard.length, count, 'no stale callback may sound after a playback lifecycle transition');
    assert.equal(P.L.demo, null); assert.equal(P.L.demoNotes.size, 0);
    assert.equal(d.querySelectorAll('#kb .k.down').length, 0);
    assert.equal(P.L.listenSpeed, .25, 'transitions preserve the selected listening preference');
  }
});
