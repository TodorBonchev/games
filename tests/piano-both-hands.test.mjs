// Run the actual combined lesson, scheduler and staff. Substitute only sound
// hardware and a deterministic clock; songs and completion are never fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

const root = new URL('../piano/', import.meta.url);
const NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const midiOf = name => {
  const match = /^([A-G])(#|b)?(\d)$/.exec(name); assert.ok(match, `valid pitch ${name}`);
  return (+match[3] + 1) * 12 + [0,2,4,5,7,9,11]['CDEFGAB'.indexOf(match[1])] + (match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0);
};
const nameOf = midi => NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} vs ${expected}`);
const pitched = (notes, hand) => {
  let beat = 0;
  return Array.from(notes).flatMap((note, index) => {
    const at = beat; beat += note.dur;
    return note.rest ? [] : [{id:`${hand}:${index}`, midi:midiOf(note.note), hand, beat:at, dur:note.dur}];
  });
};

async function load(t, {hand = 'both'} = {}) {
  const html = (await readFile(new URL('index.html', root), 'utf8')).replace(/<script src="songs\.js[^"]*"><\/script>/, '');
  const dom = new JSDOM(html, {runScripts:'outside-only', pretendToBeVisual:true, url:'http://localhost/piano/'});
  t.after(() => dom.window.close());
  const w = dom.window, d = w.document;
  w.localStorage.setItem('piano.sound', 'synth'); w.localStorage.setItem('piano.hand', hand);
  let now = 0, next = 1;
  const timers = new Map();
  const node = () => new Proxy(function () {}, {
    get: (_, key) => key === 'connect' ? () => node() : key === 'getChannelData' ? () => new Float32Array(8) : ['value','sampleRate'].includes(key) ? 44100 : node(),
    set: () => true, apply: () => node(),
  });
  w.AudioContext = function () {return new Proxy({}, {get: (_, key) => key === 'state' ? 'running' : key === 'currentTime' ? now / 1000 : key === 'sampleRate' ? 44100 : key === 'resume' ? () => Promise.resolve() : () => node()});};
  w.setTimeout = (fn, delay = 0, ...args) => {const id = next++; timers.set(id, {at:now + Math.max(0, Number(delay) || 0), fn:() => fn(...args)}); return id;};
  w.clearTimeout = id => timers.delete(id);
  const tick = milliseconds => {
    const end = now + milliseconds;
    for (let count = 0; ; count++) {
      assert.ok(count < 100000, 'lesson timers settle');
      const pending = [...timers].filter(([, job]) => job.at <= end).sort((a,b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!pending) break;
      const [id, job] = pending; timers.delete(id); now = job.at; job.fn();
    }
    now = end;
  };
  w.eval(await readFile(new URL('songs.js', root), 'utf8'));
  for (const script of d.querySelectorAll('script:not([src])')) w.eval(script.textContent);
  const P = w.__piano;
  const choose = (value, id = 'lhand') => {const select = d.getElementById(id); select.value = value; select.dispatchEvent(new w.Event('change', {bubbles:true}));};
  const indexOf = midi => midi - P.keyboard.base;
  const press = midi => {const index = indexOf(midi); assert.ok(index >= 0 && index < P.keyboard.count, `${midi} fits keyboard`); P.keyDown(index); P.keyUp(index);};
  const record = () => {const heard = []; w.__notes = {push:name => heard.push({name, at:now})}; return heard;};
  const start = id => P.startSong(P.songs.find(song => song.id === id));
  return {w,d,P,tick,choose,indexOf,press,record,start,get now(){return now;}};
}

test('Both is a saved practice choice, synchronizes settings and restores single-hand keyboard modes', async t => {
  const {w,d,P,choose,start} = await load(t);
  assert.equal(P.L.hand, 'both');
  for (const id of ['lhand','songHand']) assert.equal(d.getElementById(id).value, 'both');
  start('twinkle');
  assert.ok(P.keyboard.count > 25 && P.keyboard.count <= 49);
  assert.equal(P.setHand('not-a-hand'), false); assert.equal(P.L.hand, 'both');
  choose('left');
  assert.equal(P.L.hand, 'left'); assert.equal(P.keyboard.count, 25);
  assert.equal(P.L.steps.length, P.L.song.leftNotes.filter(note => !note.rest).length);
  assert.ok(P.L.events.every(event => event.hand === 'left'));
  choose('right','songHand');
  assert.equal(P.L.hand, 'right'); assert.equal(P.keyboard.count, 25);
  assert.equal(P.L.steps.length, P.L.song.notes.filter(note => !note.rest).length);
  assert.ok(P.L.events.every(event => event.hand === 'right'));
  choose('both');
  assert.equal(w.localStorage.getItem('piano.hand'), 'both');
  assert.equal(d.getElementById('songHand').value, 'both');
});

test('all49 combined songs preserve both full parts, note durations and shared onsets within one visible keyboard', async t => {
  const {d,P} = await load(t);
  assert.equal(P.songs.length, 49);
  for (const song of P.songs) {
    P.startSong(song);
    const expected = [...pitched(song.notes,'right'), ...pitched(song.leftNotes,'left')];
    const expectedById = new Map(expected.map(event => [event.id,event]));
    assert.equal(P.L.events.length, expected.length, `${song.id}: no shortened or omitted part`);
    assert.equal(d.querySelectorAll('#staff .n').length,expected.length,`${song.id}: the grand staff keeps every written note`);
    for (const hand of ['right','left']) assert.equal(d.querySelectorAll(`#staff .n[data-hand="${hand}"]`).length,expected.filter(event => event.hand === hand).length,`${song.id}: complete ${hand} staff`);
    assert.equal(new Set(Array.from(P.L.events,event => event.id)).size, expected.length);
    for (const event of P.L.events) {
      const note = expectedById.get(event.id); assert.ok(note, `${song.id}: ${event.id}`);
      assert.equal(event.hand, note.hand); assert.equal(event.midi,note.midi);
      assert.equal(midiOf(event.name),note.midi); near(event.beat,note.beat,`${song.id}: onset`); near(event.dur,note.dur,`${song.id}: original duration`);
      assert.ok(event.midi >= P.keyboard.base && event.midi <= P.keyboard.high, `${song.id}: both ranges are visible`);
      const group = P.L.steps[event.stepIndex];
      assert.ok(group.notes.some(item => item.id === event.id), `${song.id}: event points to its learning onset`);
      near(group.beat,event.beat,`${song.id}: shared onset`);
    }
    const orderedBeats = expected.map(event => event.beat).sort((a,b) => a-b);
    const onsets = orderedBeats.filter((beat,index) => index === 0 || Math.abs(beat - orderedBeats[index-1]) > 1e-6);
    assert.equal(P.L.steps.length,onsets.length,`${song.id}: simultaneous notes form one learning step`);
    P.L.steps.forEach((group,index) => {
      near(group.beat,onsets[index],`${song.id}: group time`);
      assert.deepEqual(Array.from(group.midis).sort((a,b) => a-b),Array.from(group.notes,event => event.midi).sort((a,b) => a-b));
      assert.equal(new Set(Array.from(group.midis)).size,group.midis.length);
      const until = index + 1 < onsets.length ? onsets[index+1] : P.L.total;
      near(group.dur,until-group.beat,`${song.id}: learning deadline uses onset gap`);
    });
    near(P.L.total,song.notes.reduce((sum,note) => sum+note.dur,0),`${song.id}: full song length`);
    assert.ok(P.keyboard.count > 25 && P.keyboard.count <= 49,`${song.id}: combined key count`);
    assert.equal(P.keyboard.high,P.keyboard.base + P.keyboard.count - 1);
    assert.equal(d.querySelectorAll('#kb .k').length,P.keyboard.count);
    assert.equal(d.getElementById('od').disabled,true); assert.equal(d.getElementById('ou').disabled,true);
    const before = P.keyboard.base; d.getElementById('od').click(); d.getElementById('ou').click();
    assert.equal(P.keyboard.base,before,`${song.id}: the full-range view cannot hide one hand`);
  }
});

test('Both Wait accepts chord notes in either order, requires the complete group and ignores duplicate targets', async t => {
  const {d,P,start,indexOf,press,choose} = await load(t);
  start('twinkle');
  const first = P.L.steps[0], bass = first.notes.find(note => note.hand === 'left'), melody = first.notes.find(note => note.hand === 'right');
  assert.ok(bass && melody, 'the real opening has simultaneous bass and melody');
  const wrong = Array.from({length:P.keyboard.count},(_,index) => index + P.keyboard.base).find(midi => !first.midis.includes(midi));
  press(wrong); assert.equal(P.L.pos,0); assert.equal(P.L.pressed.size,0);
  P.keyDown(indexOf(bass.midi));
  assert.equal(P.L.pos,0); assert.equal(P.L.pressed.has(bass.midi),true);
  P.keyDown(indexOf(bass.midi)); assert.equal(P.L.pos,0,'repeating the same bass does not supply the melody');
  assert.equal(P.L.pressed.size,1);
  choose('0.5','lspeed'); assert.equal(P.L.pressed.size,1,'Listen speed does not clear partial Wait input');
  press(melody.midi); P.keyUp(indexOf(bass.midi));
  assert.equal(P.L.pos,1); assert.equal(P.L.pressed.size,0);
  P.jumpTo(0); press(melody.midi); assert.equal(P.L.pos,0);
  press(bass.midi); assert.equal(P.L.pos,1,'melody-first also completes the chord');
  P.jumpTo(0); press(bass.midi); P.setHand('both'); assert.equal(P.L.pressed.size,1,'same-hand setting is idempotent');
  P.jumpTo(3); assert.equal(P.L.pressed.size,0,'seeking cancels partial input');
  P.restart(); assert.equal(P.L.pressed.size,0); assert.equal(d.getElementById('lprog').firstChild.style.width,'0%');
});

test('every combined song completes only after all current-onset notes have been played', async t => {
  const {d,P,press} = await load(t);
  for (const song of P.songs) {
    P.startSong(song);
    while (P.L.pos < P.L.steps.length) {
      const before = P.L.pos, notes = Array.from(P.L.steps[before].midis).sort((a,b) => before % 2 ? b-a : a-b);
      for (let index = 0; index < notes.length; index++) {
        press(notes[index]);
        assert.equal(P.L.pos,before + (index === notes.length - 1 ? 1 : 0),`${song.id}: no partial chord advances`);
      }
      assert.equal(P.L.pressed.size,0,`${song.id}: no target carries into the next onset`);
    }
    assert.equal(P.L.state,'done',song.id); assert.equal(P.L.misses,0,`${song.id}: correct chords have no misses`);
    assert.equal(d.getElementById('done').classList.contains('show'),true);
    assert.equal(d.getElementById('lprog').firstChild.style.width,'100%');
  }
});

test('grand notation includes both voices at shared x positions, highlights concurrent notes and seeks by either staff', async t => {
  const {w,d,P,start,press} = await load(t);
  start('twinkle'); P.setStaff(true);
  const staff = d.getElementById('staff');
  assert.equal(staff.dataset.clef,'grand');
  assert.equal(staff.querySelectorAll('.n').length,P.L.events.length);
  for (const hand of ['right','left']) assert.equal(staff.querySelectorAll(`.n[data-hand="${hand}"]`).length,P.L.events.filter(event => event.hand === hand).length);
  const first = P.L.steps[0];
  const current = [...staff.querySelectorAll('.n.cur')];
  assert.deepEqual(current.map(note => note.dataset.event).sort(),Array.from(first.notes,note => note.id).sort());
  const xs = current.map(note => +note.querySelector('ellipse').getAttribute('cx'));
  xs.forEach(x => near(x,xs[0],'shared chord x position'));
  const group = P.L.steps.findIndex((step,index) => index > 1 && step.notes.some(note => note.hand === 'left'));
  const bassNote = staff.querySelector(`.n[data-k="${group}"][data-hand="left"] .hit`); assert.ok(bassNote);
  bassNote.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  assert.equal(P.L.pos,group);
  assert.deepEqual([...staff.querySelectorAll('.n.cur')].map(note => note.dataset.event).sort(),Array.from(P.L.steps[group].notes,note => note.id).sort());
  const before = P.L.pos; for (const midi of Array.from(P.L.steps[group].midis)) press(midi);
  assert.equal(P.L.pos,before+1);
  assert.ok([...staff.querySelectorAll(`.n[data-k="${before}"]`)].every(note => note.classList.contains('played')));
});

test('Both Listen uses one musical clock at every speed and preserves every simultaneous onset and pitch', async t => {
  const H = await load(t), {d,P,tick,choose,record,start} = H;
  start('twinkle');
  for (const speed of [.25,.5,.75,1]) {
    choose(String(speed),'lspeed'); P.restart();
    const heard = record(), from = H.now, ms = 60000/P.L.song.tempo/speed;
    const expected = Array.from(P.L.events,event => ({name:nameOf(event.midi),at:from + 80 + event.beat*ms}));
    P.listen(); tick(P.L.total*ms+400);
    const order = (a,b) => a.at-b.at || a.name.localeCompare(b.name);
    heard.sort(order); expected.sort(order);
    assert.equal(heard.length,expected.length,`${speed}: no lost or extra voice`);
    heard.forEach((note,index) => {assert.equal(note.name,expected[index].name); near(note.at,expected[index].at,`${speed}: synchronized time`);});
    assert.equal(P.L.demo,null); assert.equal(P.L.demoActive.size,0); assert.equal(P.L.demoNotes.size,0);
    assert.equal(P.L.pos,0,'Listen leaves the practice checkpoint unchanged');
    assert.equal(d.querySelectorAll('#kb .k.down').length,0);
  }
});

test('melody movement, seeking and mid-Listen speed changes retain a sustained bass without stale releases', async t => {
  const {d,P,tick,choose,indexOf,record,start} = await load(t);
  start('twinkle');
  const bass = P.L.events.find(event => event.hand === 'left' && event.beat === 0);
  const inner = P.L.steps.findIndex(step => step.beat > bass.beat && step.beat < bass.beat + bass.dur);
  assert.ok(inner > 0,'the actual bass spans another melody onset');
  const ms = 60000/P.L.song.tempo;
  P.listen(); tick(81);
  assert.equal(P.L.demoActive.has(bass.id),true);
  tick(P.L.steps[inner].beat*ms);
  assert.equal(P.L.demoPos,inner); assert.equal(P.L.demoActive.has(bass.id),true,'melody onset cannot damp a different voice');
  assert.equal(d.querySelector(`#kb .k[data-i="${indexOf(bass.midi)}"]`).classList.contains('down'),true);
  choose('0.25','lspeed');
  const heard = record(); tick(81);
  assert.equal(P.L.demoPos,inner); assert.equal(P.L.demoActive.has(bass.id),true,'new speed restores the bass remaining at the cursor');
  assert.ok(heard.some(note => note.name === nameOf(bass.midi)));
  tick(400); assert.equal(P.L.demoActive.has(bass.id),true,'old speed note-off cannot kill the restarted bass');
  P.listen(); assert.equal(P.L.pos,0); assert.equal(P.L.demoActive.size,0);
  P.jumpTo(inner); choose('1','lspeed'); P.listen(); tick(81);
  assert.equal(P.L.demoActive.has(bass.id),true,'Listen from a sought melody onset restores its ongoing bass');
  P.listen(); assert.equal(P.L.pos,inner,'Stop returns to the sought learning checkpoint');
  const after = heard.length; tick(1000000); assert.equal(heard.length,after,'stopped sessions cannot trigger further sound');
  assert.equal(P.L.demoNotes.size,0); assert.equal(d.querySelectorAll('#kb .k.down').length,0);
});

test('Tempo uses onset gaps, while switching hand or exiting clears partial chords and all combined playback', async t => {
  const {w,d,P,tick,choose,press,record,start} = await load(t);
  start('twinkle');
  press(P.L.steps[0].midis[0]); assert.equal(P.L.pressed.size,1);
  d.getElementById('lmode').click(); P.play();
  const deadline = (P.L.steps[1].beat-P.L.steps[0].beat)*60000/P.L.song.tempo*1.15+150;
  tick(deadline-1); assert.equal(P.L.pos,0); tick(2); assert.equal(P.L.pos,1);
  assert.equal(P.L.pressed.size,0);
  P.pause(); const paused = P.L.pos; tick(10000); assert.equal(P.L.pos,paused);
  P.restart(); P.jumpTo(2); P.listen(); tick(81); assert.ok(P.L.demoActive.size > 0);
  const heard = record(); choose('right'); tick(1000000);
  assert.deepEqual(heard,[]); assert.equal(P.L.state,'ready'); assert.equal(P.L.pos,0);
  assert.equal(P.L.demoActive.size,0); assert.equal(P.L.demoNotes.size,0); assert.equal(P.L.pressed.size,0);
  assert.equal(P.keyboard.count,25); assert.equal(d.querySelectorAll('#kb .k.down').length,0);
  choose('both'); P.listen(); tick(81); P.exitSong();
  assert.equal(P.L.song,null); assert.equal(P.keyboard.count,25);
  assert.equal(d.getElementById('od').disabled,false); assert.equal(d.getElementById('ou').disabled,false);
  assert.equal(P.L.demoActive.size,0); assert.equal(P.L.pressed.size,0);
  const octave = P.keyboard.base; w.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
  assert.equal(P.keyboard.base,octave-12,'free play regains octave movement');
});
