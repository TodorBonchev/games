// Source fixtures establish note/timing completeness independently of the
// compact beginner arrangements; runtime checks use the real piano lesson.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {readMidi} from '../scripts/import-piano-scores.mjs';

const root = new URL('../piano/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('scores/manifest.json',root),'utf8'));
const nursery = JSON.parse(await readFile(new URL('scores/nursery.json',root),'utf8'));
const melodies = JSON.parse(await readFile(new URL('scores/melodies.json',root),'utf8'));
const scripts = await Promise.all(['scores.js','songs.js'].map(name => readFile(new URL(name,root),'utf8')));
const html = (await readFile(new URL('index.html',root),'utf8')).replace(/<script src="(?:scores|songs)\.js[^"]*"><\/script>/g,'');
const NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const midiOf = name => {const m=/^([A-G])(#|b)?(\d)$/.exec(name);assert.ok(m,`valid pitch ${name}`);return(+m[3]+1)*12+[0,2,4,5,7,9,11]['CDEFGAB'.indexOf(m[1])]+(m[2]==='#'?1:m[2]==='b'?-1:0);};
const nameOf = midi => NAMES[midi%12]+(Math.floor(midi/12)-1);
const near = (a,b,message) => assert.ok(Math.abs(a-b)<1e-6,`${message}: ${a} vs ${b}`);
const ordered = tuples => tuples.sort((a,b)=>a[1]-b[1]||a[0]-b[0]||a[2]-b[2]);
const tuplesOf = part => ordered(Array.from(part,event=>[midiOf(event.note),event.beat,event.dur]));
const library = () => {const context={window:{}};for(const source of scripts)vm.runInNewContext(source,context);return context.window.PIANO_SONGS;};
const requestedIds = new Set((process.env.PIANO_SCORE_IDS||'').split(',').map(id=>id.trim()).filter(Boolean));
function exhaustiveScores(songs){
  const scores=songs.filter(song=>song.score);assert.ok(scores.length>=30,'the complete source catalog is loaded');
  for(const id of requestedIds)assert.ok(scores.some(song=>song.id===id),`requested source score ${id} exists`);
  return requestedIds.size?scores.filter(song=>requestedIds.has(song.id)):scores;
}

async function load(t){
  const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost/piano/'});
  t.after(()=>dom.window.close());const w=dom.window,d=w.document;
  w.localStorage.setItem('piano.sound','synth');
  let now=0,next=1;const live=new Map(),heap=[];
  const before=(a,b)=>a.at<b.at||(a.at===b.at&&a.id<b.id);
  function push(job){heap.push(job);let index=heap.length-1;while(index){const parent=(index-1)>>1;if(!before(heap[index],heap[parent]))break;[heap[index],heap[parent]]=[heap[parent],heap[index]];index=parent;}}
  function pop(){const first=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let index=0;for(;;){let child=index*2+1;if(child>=heap.length)break;if(child+1<heap.length&&before(heap[child+1],heap[child]))child++;if(!before(heap[child],heap[index]))break;[heap[child],heap[index]]=[heap[index],heap[child]];index=child;}}return first;}
  w.setTimeout=(fn,delay=0,...args)=>{const id=next++,job={id,at:now+Math.max(0,Number(delay)||0),fn:()=>fn(...args)};live.set(id,job);push(job);return id;};
  w.clearTimeout=id=>live.delete(id);
  const tick=milliseconds=>{const end=now+milliseconds;for(let count=0;heap.length&&heap[0].at<=end;count++){assert.ok(count<200000,'source timers settle');const job=pop();if(!live.delete(job.id))continue;now=job.at;job.fn();}now=end;};
  // A single inert hardware node avoids millions of Proxy allocations while
  // the real scheduler, voice ownership and audible-note calls still execute.
  const channel=new Float32Array(8),readChannel=()=>channel;
  const hardware=new Proxy(function(){},{get:(_,key)=>key==='getChannelData'?readChannel:['value','sampleRate'].includes(key)?44100:hardware,set:()=>true,apply:()=>hardware});
  const node=()=>hardware;
  w.AudioContext=function(){return new Proxy({},{get:(_,key)=>key==='state'?'running':key==='currentTime'?now/1000:key==='sampleRate'?44100:key==='resume'?()=>Promise.resolve():()=>node()});};
  for(const source of scripts)w.eval(source);for(const script of d.querySelectorAll('script:not([src])'))w.eval(script.textContent);
  const P=w.__piano,heard=[];w.__notes={push:name=>heard.push({name,at:now})};
  const press=midi=>{const index=midi-P.keyboard.base;assert.ok(index>=0&&index<P.keyboard.count,`${midi} visible in original range`);P.keyDown(index);P.keyUp(index);};
  return {w,d,P,tick,press,heard,get now(){return now;}};
}

test('every published MIDI fixture is retained exactly in both generated score parts, including its full endpoint',async()=>{
  const songs=new Map(library().map(song=>[song.id,song]));
  assert.ok(manifest.length>=20,'full classical/carol source coverage');
  for(const item of manifest){
    const bytes=await readFile(new URL('scores/'+item.midiFile,root)),midi=readMidi(bytes),song=songs.get(item.id);
    assert.ok(song?.score,`${item.id}: source score replaces its excerpt`);
    assert.equal(song.source.url,item.sourceUrl);assert.equal(song.source.license,item.license);
    assert.equal(song.source.sha256,createHash('sha256').update(bytes).digest('hex'),`${item.id}: exact checked source bytes`);
    near(song.duration,midi.duration,`${item.id}: no truncated source ending`);
    assert.deepEqual(Array.from(song.timeSignature),Array.from(midi.signatures[0].value));
    near(song.meter,song.timeSignature[0]*4/song.timeSignature[1],`${item.id}: quarter-note bar grid`);
    for(const [hand,key]of [['right','rightTracks'],['left','leftTracks']]){
      const expected=ordered(item[key].flatMap(index=>midi.tracks[index].notes.map(note=>[...note])));
      assert.deepEqual(tuplesOf(hand==='right'?song.notes:song.leftNotes),expected,`${item.id}/${hand}: all pitches, starts and written durations`);
    }
  }
});

test('every nursery setting retains its verified MusicXML provenance, all voices and complete timeline',async()=>{
  const songs=new Map(library().map(song=>[song.id,song]));assert.ok(nursery.length>=10);
  for(const item of nursery){
    const song=songs.get(item.id);assert.ok(song?.score,`${item.id}: published setting`);
    const xml=await readFile(new URL(item.source.file,root));
    assert.equal(item.source.sha256,createHash('sha256').update(xml).digest('hex'),`${item.id}: original MusicXML bytes`);
    assert.equal(song.source.scoreUrl,item.source.scoreUrl);assert.equal(song.source.scope,item.source.scope);
    assert.equal(song.duration,item.duration);assert.deepEqual(Array.from(song.timeSignature),item.timeSignature);
    for(const hand of ['right','left']){
      const part=hand==='right'?song.notes:song.leftNotes,expected=ordered(item[hand].map(([name,beat,dur])=>[midiOf(name),beat,dur]));
      assert.deepEqual(tuplesOf(part),expected,`${item.id}/${hand}: no omitted inner voices or tied duration`);
      assert.ok(part.every(event=>event.beat>=0&&event.dur>0&&event.beat+event.dur<=song.duration+1e-6));
    }
  }
});

test('verified folk melodies retain the source tune, complete cadence lengths and explicit practice repetitions',()=>{
  const songs=new Map(library().map(song=>[song.id,song]));assert.ok(Object.keys(melodies).length>=11);
  const parse=melody=>melody.replace(/\|/g,' ').trim().split(/\s+/).map(token=>{const[note,duration]=token.split(':');return note==='r'?{rest:true,dur:duration?Number(duration):1}:{note,dur:duration?Number(duration):1};});
  for(const[id,fixture]of Object.entries(melodies)){
    const song=songs.get(id),expected=parse(fixture.melody),actual=Array.from(song.notes,note=>note.rest?{rest:true,dur:note.dur}:{note:note.note,dur:note.dur});
    assert.equal(song.source.verifiedMelody,true,id);assert.equal(song.source.url,fixture.source.url);assert.equal(song.source.checked,fixture.source.checked);
    assert.deepEqual(Array.from(song.timeSignature),fixture.timeSignature);assert.equal(song.pickup||0,fixture.pickup||0);
    if(fixture.replaceMelody)assert.deepEqual(actual,expected,`${id}: complete compared tune`);
    else{
      assert.equal(actual.length%expected.length,0,`${id}: whole practice repetitions`);
      for(let index=0;index<actual.length;index+=expected.length){
        const verse=actual.slice(index,index+expected.length);
        if(id==='mary')assert.deepEqual(verse.map(event=>midiOf(event.note)),expected.map(event=>midiOf(event.note)),'Mary: the documented straight-rhythm variant keeps all26 source pitches');
        else assert.deepEqual(verse,expected,`${id}: every retained verse agrees with the checked tune`);
      }
    }
  }
  const amazing=songs.get('amazing');assert.deepEqual({...amazing.notes.at(-1)},{note:'G4',dur:5});assert.equal(amazing.notes.filter(note=>note.dur===5).length,2,'both long phrase holds are retained');
  const auld=songs.get('auld');assert.equal(auld.notes.length,59,'one complete verse and chorus');assert.equal(auld.notes.filter(note=>note.note==='G4'&&note.dur===3).length,2,'verse and chorus each retain their cadence');assert.match(auld.subtitle,/verse and chorus/);
  const birthday=songs.get('birthday');assert.deepEqual({...birthday.notes.at(-1)},{note:'C5',dur:3},'the full closing measure replaces the clipped ending');
  const oldmac=songs.get('oldmac');assert.deepEqual({...oldmac.notes.at(-1)},{rest:true,dur:1},'the source ending rest is part of the melody timeline');
  const mary=songs.get('mary');assert.deepEqual(Array.from(mary.notes.slice(0,2),note=>note.dur),[1,1],'the deliberate straight-quarter practice rhythm remains');
  assert.deepEqual(parse(melodies.mary.melody).slice(0,2).map(note=>note.dur),[1.5,.5],'the published comparison uses dotted rhythm');assert.match(mary.source.changes,/straight-quarter rhythm variant.*dotted rhythm/);
  assert.deepEqual(Array.from(songs.get('row').timeSignature),[6,8]);assert.deepEqual(Array.from(songs.get('greensleeves').timeSignature),[6,8]);
});

test('published openings keep their original pitches, rhythms and compound or half-note meter',()=>{
  const songs=new Map(library().map(song=>[song.id,song]));
  const elise=songs.get('elise');
  assert.deepEqual(Array.from(elise.notes.slice(0,4),event=>[midiOf(event.note),event.beat,event.dur]),[[76,0,.25],[75,.25,.25],[76,.5,.25],[75,.75,.25]]);
  assert.deepEqual(Array.from(elise.timeSignature),[3,8]);assert.equal(elise.meter,1.5);assert.equal(elise.pickup,.5);
  const moon=songs.get('moonlight');
  assert.deepEqual(Array.from(moon.notes.slice(0,3),event=>midiOf(event.note)),[56,61,64]);
  moon.notes.slice(0,3).forEach((event,index)=>{near(event.beat,index/3,'Moonlight triplet onset');near(event.dur,1/3,'Moonlight triplet duration');});
  assert.deepEqual(Array.from(moon.leftNotes.slice(0,2),event=>[midiOf(event.note),event.beat,event.dur]),[[37,0,4],[49,0,4]]);
  assert.deepEqual(Array.from(moon.timeSignature),[2,2]);assert.equal(moon.meter,4);
  const clair=songs.get('clairdelune');assert.deepEqual(Array.from(clair.timeSignature),[9,8]);assert.equal(clair.meter,4.5);
  assert.deepEqual(Array.from(clair.notes.slice(0,2),event=>[midiOf(event.note),event.beat,event.dur]),[[77,1,2],[80,1,2]],'opening dyad is retained instead of the previous top-voice-only excerpt');
  const minuet=songs.get('minuet');assert.deepEqual(Array.from(minuet.notes.slice(0,5),event=>midiOf(event.note)),[74,67,69,71,72]);
  assert.deepEqual(Array.from(minuet.leftNotes.slice(0,2),event=>[midiOf(event.note),event.beat,event.dur]),[[55,0,2],[59,0,2]]);
  const hickory=songs.get('hickory');assert.deepEqual(Array.from(hickory.timeSignature),[6,8]);assert.equal(hickory.meter,3);
  assert.ok(hickory.notes.filter(event=>event.beat===0).length>1,'the nursery right hand includes its inner voice');
  const canon=songs.get('canon');assert.equal(canon.source.reduction,true);assert.equal(canon.duration,228);
  assert.deepEqual(Array.from(canon.notes.slice(0,4),event=>[midiOf(event.note),event.beat,event.dur]),[[78,8,1],[76,9,1],[74,10,1],[73,11,1]],'the complete violin melody keeps the original bass-only introduction');
  const nacht=songs.get('nachtmusik');assert.equal(nacht.source.reduction,true);assert.equal(nacht.duration,768);
  assert.deepEqual(Array.from(nacht.notes.filter(event=>event.beat===0),event=>[midiOf(event.note),event.dur]),[[62,1],[71,1],[79,1]],'the original G-major violin chord replaces the transposed single-note excerpt');
  near(Math.max(...[...nacht.notes,...nacht.leftNotes].map(event=>event.beat+event.dur)),767,'the final written rest is not stretched into the closing chord');
});

test('the MIDI reader handles simultaneous pitches, mixed gates and running-status note-offs in quarter-note units',()=>{
  const track=Buffer.from([0,255,88,4,3,3,24,8,0,255,81,3,7,161,32,0,144,60,80,0,64,80,120,64,0,120,60,0,0,255,47,0]);
  const header=Buffer.from([77,84,104,100,0,0,0,6,0,1,0,1,1,224]),chunk=Buffer.alloc(8);chunk.write('MTrk');chunk.writeUInt32BE(track.length,4);
  const result=readMidi(Buffer.concat([header,chunk,track]));
  assert.deepEqual(result.tracks[0].notes,[[60,0,.5],[64,0,.25]]);assert.equal(result.duration,.5);
  assert.deepEqual(result.signatures[0].value,[3,8]);near(result.tempos[0].bpm,120,'source tempo');
});

test('source notation distinguishes32nd,64th,128th and triplet values instead of collapsing them to16ths',async t=>{
  const {d,P}=await load(t);
  P.setHand('right');P.startSong({id:'short-source-values',title:'Short source values',score:true,tempo:120,timeSignature:[6,8],meter:3,duration:6,
    notes:[{note:'C5',beat:0,dur:.125},{note:'D5',beat:1.5,dur:.0625},{note:'E5',beat:3,dur:.03125},{note:'F5',beat:4.5,dur:1/3}],leftNotes:[{note:'C3',beat:0,dur:6}]});
  for(const [index,value,flags]of [[0,'t',3],[1,'x',4],[2,'z',5]]){
    const note=d.querySelector(`#staff .n[data-event="right:${index}"]`);
    assert.equal(note.dataset.noteValue,value);assert.equal(note.querySelectorAll(':scope > path').length,flags,'separate short note has the written flag count');
  }
  const triplet=d.querySelector('#staff .n[data-event="right:3"]');assert.equal(triplet.dataset.noteValue,'e');assert.equal(triplet.querySelector('.tuplet').textContent,'3');
  assert.equal(d.querySelector('#staff .time-signature').dataset.denominator,'8');
});

test('every complete source score can finish real right, left and Both Wait lessons with all chord targets',async t=>{
  const {d,P,press}=await load(t);const scores=exhaustiveScores(P.songs);
  for(const hand of ['right','left','both']){
    P.setHand(hand);
    for(const song of scores){
      P.startSong(song);const expected=P.L.steps.reduce((sum,group)=>sum+group.midis.length,0);
      while(P.L.pos<P.L.steps.length){
        const before=P.L.pos,midis=Array.from(P.L.steps[before].midis);
        for(let index=0;index<midis.length;index++){press(midis[index]);assert.equal(P.L.pos,before+(index===midis.length-1?1:0),`${song.id}/${hand}: every chord tone is required`);}
      }
      assert.equal(P.L.state,'done',`${song.id}/${hand}: full score completes`);assert.equal(P.L.misses,0);assert.equal(P.L.hits,expected);
      assert.equal(d.getElementById('lprog').firstChild.style.width,'100%');assert.equal(d.querySelectorAll('#staff .n').length,P.L.events.length);
    }
    console.log(`Complete source Wait passed: ${hand} (${scores.length} scores)`);
  }
});

test('complete source Listen playback retains every physical onset at quarter speed in all hand modes',async t=>{
  const H=await load(t),{P,tick,heard}=H;P.setListenSpeed(.25);const scores=exhaustiveScores(P.songs);
  for(const hand of ['right','left','both']){
    P.setHand(hand);
    for(const song of scores){
      P.startSong(song);heard.length=0;const start=H.now,first=P.L.steps[0].beat,ms=60000/song.tempo/.25;
      const expected=Array.from(P.L.steps).flatMap(group=>Array.from(group.midis,midi=>({name:nameOf(midi),at:start+80+(group.beat-first)*ms})));
      P.listen();tick((P.L.total-first)*ms+400);
      const order=(a,b)=>a.at-b.at||a.name.localeCompare(b.name);heard.sort(order);expected.sort(order);
      assert.equal(heard.length,expected.length,`${song.id}/${hand}: all unique source onsets are sounded`);
      heard.forEach((note,index)=>{assert.equal(note.name,expected[index].name,`${song.id}/${hand}: original pitch`);near(note.at,expected[index].at,`${song.id}/${hand}: exact slow onset`);});
      assert.equal(P.L.demo,null);assert.equal(P.L.demoActive.size,0);assert.equal(P.L.demoNotes.size,0);assert.equal(P.L.pos,0);
    }
    console.log(`Complete source Listen passed: ${hand}`);
  }
});

test('absolute score chords keep wide original pitches, one selected staff, trailing duration and unison ownership',async t=>{
  const {d,P,tick,press,heard}=await load(t);
  const score={id:'polyphonic-source-regression',title:'Polyphonic source regression',score:true,tempo:120,timeSignature:[9,8],meter:4.5,duration:4.5,
    notes:[{note:'C4',beat:0,dur:2},{note:'E4',beat:0,dur:1},{note:'G4',beat:0,dur:1},{note:'E7',beat:1,dur:.5},{note:'D4',beat:2,dur:1}],
    leftNotes:[{note:'A1',beat:0,dur:3},{note:'C4',beat:0,dur:.5}]};
  for(const hand of ['right','left','both']){
    P.setHand(hand);P.startSong(score);assert.equal(P.L.total,4.5);assert.ok(P.L.events.every(event=>event.midi>=P.keyboard.base&&event.midi<=P.keyboard.high));
    assert.equal(d.querySelectorAll('#staff .staff-part').length,hand==='both'?2:1,'single hand has no phantom staff');
    assert.equal(d.getElementById('staff').dataset.clef,hand==='both'?'grand':hand==='left'?'bass':'treble');
    assert.equal(d.querySelector('#staff .time-signature').dataset.numerator,'9');assert.equal(d.querySelector('#staff .time-signature').dataset.denominator,'8');
    const box=d.querySelector('#staff svg').getAttribute('viewBox').split(/\s+/).map(Number);
    for(const head of d.querySelectorAll('#staff .n ellipse')){const y=+head.getAttribute('cy');assert.ok(y>=box[1]&&y<=box[1]+box[3],'original high/low ledger pitches fit the view');}
    while(P.L.pos<P.L.steps.length){for(const midi of Array.from(P.L.steps[P.L.pos].midis))press(midi);}assert.equal(P.L.state,'done');
  }
  P.restart();heard.length=0;P.listen();tick(81);assert.equal(heard.filter(note=>note.name==='C4').length,1,'unison voices use one piano attack');
  tick(300);assert.equal(P.L.demoActive.has('left:1'),false);assert.equal(P.L.demoActive.has('right:0'),true);
  assert.equal(d.querySelector('#kb .k[data-midi="60"]').classList.contains('down'),true,'a short unison cannot release its longer owner');
  tick(300);assert.equal(P.L.demoActive.has('left:0'),true,'bass survives upper melody movement');
  P.listen();const count=heard.length;tick(100000);assert.equal(heard.length,count);assert.equal(P.L.demoActive.size,0);
});

test('Tempo stop/restart clears the old timer so a partial Moonlight chord receives a fresh deadline',async t=>{
  const {d,P,tick,press}=await load(t);P.setHand('both');P.startSong(P.songs.find(song=>song.id==='moonlight'));
  d.getElementById('lmode').click();assert.equal(P.L.follow,true);assert.ok(P.L.steps[0].midis.length>=3,'the real opening combines triplet melody with the bass octave');
  for(const action of ['stop','restart']){
    P.restart();P.play();const oldTimer=P.L.timer;assert.notEqual(oldTimer,null);
    P[action]();assert.equal(P.L.timer,null,`${action}: no stale timeout identifier`);assert.equal(P.L.state,'ready');
    press(P.L.steps[0].midis[0]);assert.equal(P.L.pos,0,'one tone leaves the chord incomplete');assert.equal(P.L.pressed.size,1);
    assert.notEqual(P.L.timer,null,'partial chord starts a live Tempo deadline');assert.notEqual(P.L.timer,oldTimer);
    const deadline=(P.L.steps[1].beat-P.L.steps[0].beat)*60000/P.L.song.tempo*1.15+150;
    tick(deadline-1);assert.equal(P.L.pos,0);tick(2);assert.equal(P.L.pos,1,`${action}: the new deadline advances an incomplete chord`);assert.equal(P.L.pressed.size,0);
  }
});
