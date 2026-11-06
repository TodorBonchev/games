import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../piano/songs.js', import.meta.url), 'utf8');
const scoreSource = await readFile(new URL('../piano/scores.js', import.meta.url), 'utf8');
const library = () => { const window = {}; vm.runInNewContext(scoreSource, { window }); vm.runInNewContext(source, { window }); return window.PIANO_SONGS; };
const midiOf = name => { const m = /^([A-G])(#|b)?(\d)$/.exec(name); assert.ok(m, `valid note ${name}`); return (+m[3] + 1) * 12 + [0,2,4,5,7,9,11]['CDEFGAB'.indexOf(m[1])] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); };
const duration = notes => notes.reduce((sum, event) => sum + event.dur, 0);
const almost = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-7, `${message}: ${a} versus ${b}`);

// Deliberate expected coverage catches accidentally dropping a long or less
// common tune while adding the second part. No category uses a fallback track.
const ids = 'imperial starwars pirate hedwig got mario tetris pinkpanther titanic jingle wewish silent deck joy rudolph santa wenceslas faithful carol ode elise canon mountain brahms turkish nachtmusik danube clairdelune moonlight swanlake takeonme shapeofyou sevennation smoke sweetchild megalovania zelda zaychentseto twinkle birthday mary frere oldmac row london saints auld amazing greensleeves'.split(' ');

test('the expanded library retains every legacy song and its deliberate bass arrangement', () => {
  const songs = library();
  assert.ok(songs.length >= 65);
  assert.deepEqual(Array.from(songs, song => song.id).filter(id => ids.includes(id)), ids);
  for (const song of songs.filter(song => !song.score)) {
    const right = song.notes, left = song.leftNotes;
    assert.ok(left.length > 0, `${song.id}: empty left part`);
    assert.equal(song.leftArrangement, 'Simplified bass accompaniment');
    almost(duration(left), duration(right), `${song.id}: hands finish together`);
    assert.equal(song.leftNotes, left, `${song.id}: lazy left cache`);
    assert.equal(song.notes, right, `${song.id}: right cache is not replaced`);
    const melodyFloor = Math.min(...right.filter(n => !n.rest).map(n => midiOf(n.note)));
    let audible = 0;
    for (const event of left) {
      assert.ok(Number.isFinite(event.dur) && event.dur > 0, `${song.id}: positive finite duration`);
      if (event.rest) { assert.equal(event.note, undefined); continue; }
      const midi = midiOf(event.note); audible++;
      assert.ok(midi >= 36 && midi <= 59, `${song.id}: ${event.note} leaves C2–B3`);
      assert.ok(midi < melodyFloor, `${song.id}: bass crosses the right melody`);
    }
    assert.ok(audible >= 8, `${song.id}: full-length left practice`);
    assert.ok(Math.max(...left.filter(n => !n.rest).map(n => midiOf(n.note))) - Math.min(...left.filter(n => !n.rest).map(n => midiOf(n.note))) <= 24, `${song.id}: left fits the two-octave keyboard`);
    // An octave-down copy keeps melody pitch classes and durations; these
    // accompaniments teach their own harmony and rhythm instead.
    const signature = events => events.map(n => `${n.rest ? 'r' : midiOf(n.note) % 12}:${n.dur}`).join(' ');
    assert.notEqual(signature(left), signature(right), `${song.id}: independent bass, not transposed melody`);
  }
});

test('pickups remain silent in the bass and align its first harmony to the first complete bar', () => {
  for (const song of library().filter(song => !song.score)) {
    if (!song.pickup) continue;
    assert.equal(song.leftNotes[0].rest, true, `${song.id}: bass waits through pickup`);
    almost(song.leftNotes[0].dur, song.pickup, `${song.id}: exact pickup length`);
    assert.ok(song.leftNotes[1].note, `${song.id}: first downbeat sounds`);
  }
});

test('left harmonies use sounding keys rather than double-transposing the melody metadata', () => {
  const songs = new Map(library().map(song => [song.id, song]));
  for (const [id, expected] of Object.entries({ imperial:'G2', starwars:'C2', pirate:'D2', hedwig:'D2', got:'F2', ode:'G2', turkish:'F#2', nachtmusik:'D2', clairdelune:'C#2', moonlight:'C#2', megalovania:'E2', zelda:'F2' })) {
    if (songs.get(id).score) continue; // Original score pitches are checked against their published MIDI fixture.
    const first = songs.get(id).leftNotes.find(n => !n.rest);
    assert.equal(first.note, expected, id);
  }
  assert.match(songs.get('zelda').subtitle, /in F/);
});

test('Canon now keeps the complete published bass cycle and a truthful outer-voice reduction scope', () => {
  const canon = library().find(song => song.id === 'canon');
  assert.ok(canon.score && canon.source.reduction);
  assert.match(canon.source.scope, /Complete canon.*violin I.*bass reduction/);
  assert.deepEqual(Array.from(canon.leftNotes.slice(0, 8), n => [n.note,n.beat,n.dur]), [['D3',0,1],['A2',1,1],['B2',2,1],['F#2',3,1],['G2',4,1],['D2',5,1],['G2',6,1],['A2',7,1]]);
  assert.ok(canon.leftNotes.length > 200, 'the full bass replaces the former40-note excerpt');
  assert.equal(canon.duration,228);assert.equal(canon.leftNotes.at(-1).note,'D3');
  almost(canon.leftNotes.at(-1).beat + canon.leftNotes.at(-1).dur,225,'written closing tonic ends before the final rests');
  almost(canon.duration - 225,3,'the complete source retains three trailing silent beats');
});

test('fractional excerpts, compound meter and long forms produce finite timelines without truncation', () => {
  for (const song of library().filter(song => !song.score && ['pinkpanther','shapeofyou','clairdelune','elise','jingle','saints'].includes(song.id))) {
    almost(duration(song.leftNotes), duration(song.notes), song.id);
    let elapsed = 0;
    for (const event of song.leftNotes) { elapsed += event.dur; assert.ok(elapsed <= duration(song.notes) + 1e-7, `${song.id}: no event runs beyond the melody`); }
  }
});

test('adding a song without a deliberate left arrangement fails explicitly', () => {
  const changed = source.replace('  ].map(s => {', "  ].concat({id:'missing-arrangement', melody:'C4:4'}).map(s => {");
  assert.notEqual(changed, source);
  const window = {}; vm.runInNewContext(scoreSource, {window});
  assert.throws(() => vm.runInNewContext(changed, { window }), /Missing left-hand arrangement for missing-arrangement/);
});
