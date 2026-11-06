// Song library for the piano's learning mode.
//
// Lazy-friendly: each entry stores its melody as a compact string. The list UI
// only reads the metadata (title, category, level); notes are parsed on first use
// via `notes` (right hand) and `leftNotes` (bass accompaniment), returning
// [{note:'G4', dur:beats} | {rest:true, dur}]. Both parts share one timeline.
// Published settings from scores.js use absolute `beat` onsets as well, so
// chords and independent voices retain their timing. See scores/README.md.
//
// Melody string: space-separated tokens "NOTE[:beats]", "r:beats" for a rest,
// "|" bar lines are ignored. Default length is `unit` (1 beat unless given).
// `transpose` (semitones) shifts the stored melody, e.g. to fit C4–C6.
// `meter` (beats per bar, default 4) and `pickup` define the shared bar grid
// for notation and the bass arrangement; bass plans already use sounding keys.
// Add a song: append { id, title, subtitle, category, level, tempo, melody }
// and its explicit LEFT_PARTS harmony/style plan below.
window.PIANO_CATEGORIES = ['Star Wars & Movies', 'Christmas', 'Classical', 'Pop', 'Kids & Folk'];
window.PIANO_SONGS = (() => {
  const NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const midiOf = s => { const m = /^([A-G])(#|b)?(\d)$/.exec(s); if (!m) throw new Error('Unknown note ' + s);
    return (+m[3] + 1) * 12 + [0,2,4,5,7,9,11]['CDEFGAB'.indexOf(m[1])] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); };
  const nameOf = m => NAMES[m % 12] + (Math.floor(m / 12) - 1);
  function parse(str, unit = 1, transpose = 0) {
    return str.replace(/\|/g, ' ').trim().split(/\s+/).map(tok => {
      const [n, d] = tok.split(':'); const dur = d ? +d : unit;
      if (n === 'r') return { rest: true, dur };
      return { note: transpose ? nameOf(midiOf(n) + transpose) : n, dur };
    });
  }
  // Original beginner practice accompaniments, not transcriptions of the
  // published piano scores. Chords are in each melody's *sounding* key, after
  // its transpose. A token lasts one bar unless ':beats' is supplied. Every
  // library entry has an explicit plan; adding a melody requires adding a plan.
  const LEFT_PARTS = {
    imperial:    { style:'march', harmony:'Gm Gm Eb Gm Cm Gm D7 Gm Gm Eb Cm D7 Gm Cm D7 Gm', ending:'Gm' },
    starwars:    { style:'march', harmony:'C C F G C C F G Am Em F C Dm Am D7 G C C F G C', ending:'C' },
    pirate:      { style:'fifths', harmony:'Dm Dm Bb Bb C C Am Dm Dm Dm Bb Bb C C Am Dm Gm Bb C A7 Dm', ending:'Dm' },
    hedwig:      { style:'waltz', harmony:'Dm Dm Dm Dm Gm Gm A7 A7 Dm Dm F B7 Eb A7 Dm Dm', ending:'Dm' },
    got:         { style:'waltz', harmony:'Fm Fm Fm Fm F F F F Fm Fm Db Eb Fm Fm Ab Eb Db Eb Fm Fm', ending:'Fm' },
    mario:       { style:'bounce', harmony:'C G C G C C Am F Dm G C G C G Am F Dm G C G', ending:'C' },
    tetris:      { style:'bounce', harmony:'Am E7 E7 Am Dm Am E7 Am Dm Dm Am Am E7 E7 Am Am Am Dm E7 Am', ending:'Am' },
    pinkpanther: { style:'walking', harmony:'Em Em Em Em C7 C7 Em Em B7 C7 Em B7', ending:'Em' },
    titanic:     { style:'ballad', harmony:'F F Bb F F C Bb C F F Bb F Dm Am Bb C F C Dm Bb F C Bb C', ending:'F' },
    jingle:      { style:'bounce', harmony:'C C C F F G7 G7 C C C C F F G7 C G7 C C C C F F F F G7 G7 G7 G7 C G7 C C', ending:'C' },
    wewish:      { style:'waltz', harmony:'G C A7 D7 B7 Em Am D7 G D7 G C G C D7 G', ending:'G' },
    silent:      { style:'waltz', harmony:'C C C C G7 G7 C C F F C C F F C C G7 G7 C C C G7 C C', ending:'C' },
    deck:        { style:'fifths', harmony:'G G D7 G G D7 G G Am D7 G D7 G C G D7', ending:'G' },
    joy:         { style:'march', harmony:'C G C G C C G G C C F G C C F G C C G G C C G C', ending:'C' },
    rudolph:     { style:'bounce', harmony:'C C G7 G7 G7 G7 C C F C G7 C D7 D7 G7 G7 C C G7 G7 C C', ending:'C' },
    santa:       { style:'bounce', harmony:'F F Bb Bb F F G7 C7 F F Bb Bb F C7 F F Bb Bb F F G7 G7 C7 C7 F F Bb Bb F C7 F F', ending:'F' },
    wenceslas:   { style:'march', harmony:'G G C G G G D7 G D7 G C G Em C D7 G', ending:'G' },
    faithful:    { style:'march', harmony:'G G D7 D7 G D7 G D7 G G D7 G Em A7 D7 D7 G G C G C G D7 G', ending:'G' },
    carol:       { style:'waltz', harmony:'Gm Gm Gm Gm Cm Cm Cm Cm D7 D7 D7 D7 Gm Gm D7 D7 Gm Gm Cm D7 Gm Gm Gm Gm', ending:'Gm' },
    ode:         { style:'fifths', harmony:'G D7 G D7 G D7 G G D7 G D7 D7 G D7 G G', ending:'G' },
    elise:       { style:'arpeggio', harmony:'Am Am E7 Am Am Am E7 Am Am C G7 C E7 E7 E7 Am Am E7 Am Am Am E7 Am C F C G7 C G7 C C E7', ending:'Am' },
    canon:       { style:'held', harmony:'D:2 A:2 Bm:2 F#m:2 G:2 D:2 G:2 A:2', ending:'D' },
    mountain:    { style:'pulse', harmony:'Bm F#7 Bm F#7 Bm Em Bm F#7 F#m C#7 F#m C#7 Bm Em F#7 Bm', ending:'Bm' },
    brahms:      { style:'waltz', harmony:'C C C C F F G7 G7 C C F F C G7 C C', ending:'C' },
    turkish:     { style:'alberti', harmony:'F#m C#7 F#m C#7 F#m C#7 F#m F#m A E7 A E7 F#m C#7 F#m F#m F# C#7 F# C#7 F# C#7 F# F#', ending:'F#m' },
    nachtmusik:  { style:'alberti', harmony:'D D D A7 A7 D A7 D D D A7 A7 D D A7 D A A E7 E7 A A E7 A', ending:'D' },
    danube:      { style:'waltz', harmony:'C C C G7 G7 G7 G7 C C C F F C C G7 C F F C C G7 G7 C C', ending:'C' },
    clairdelune: { style:'compound', harmony:'Db Db Ab7 Ab7 Db Gb Db Ab7 Bbm Ebm Ab7 Db Gb Db Ab7 Db', ending:'Db' },
    moonlight:   { style:'ballad', harmony:'C#m C#m F#m G#7 C#m B E E Em Em B7 Em Em F#7 Bm Bm F#m F#m G#7 C#m', ending:'C#m' },
    swanlake:    { style:'broken', harmony:'Am Am Am Am F Dm E7 E7 Am Am Am Am F Dm E7 Am Am Dm G C F Bdim E7 Am', ending:'Am' },
    takeonme:    { style:'pulse', harmony:'Bm E A D Bm E A D F#m D A E F#m D A E Bm E A D', ending:'Bm' },
    shapeofyou:  { style:'syncopated', harmony:'C#m F#m A B', ending:'C#m' },
    sevennation: { style:'rock', harmony:'Em Em C B7 Em Em C B7 Em Em C B7 C C D D', ending:'Em' },
    smoke:       { style:'rock', harmony:'Gm Bb C Gm Bb Db C C Gm Bb C Bb Gm Gm Gm Gm', ending:'Gm' },
    sweetchild:  { style:'broken', harmony:'D D C C G G D D D D C C G G D D', ending:'D' },
    megalovania: { style:'pulse', harmony:'Em D C#dim C Em D C#dim C', ending:'Em' },
    zelda:       { style:'waltz', harmony:'F F C C F F C C F F Bb Bb C C F F', ending:'F' },
    zaychentseto:{ style:'bounce', harmony:'C C F C F G7 C C F C F G7', ending:'C' },
    twinkle:     { style:'fifths', harmony:'C F C G7 C G7 C G7 C F C G7', ending:'C' },
    birthday:    { style:'waltz', harmony:'C G7 G7 C C F C G7', ending:'C' },
    mary:        { style:'fifths', harmony:'C C G7 C C C G7 C', ending:'C' },
    frere:       { style:'fifths', harmony:'F F F F F F F C7', ending:'F' },
    oldmac:      { style:'bounce', harmony:'G C G D7 G C G D7 G G G G G C G D7', ending:'G' },
    row:         { style:'waltz', harmony:'C C C C C C G7 C', ending:'C' },
    london:      { style:'fifths', harmony:'C C G7 C C C G7 C', ending:'C' },
    saints:      { style:'march', harmony:'C C C C C C G7 G7 C C F F C G7 C C', ending:'C' },
    auld:        { style:'fifths', harmony:'G D7 G C G Em C D7 G D7 G C Em C D7 G', ending:'G' },
    amazing:     { style:'waltz', harmony:'G G C G G G D7 D7 G G C G Em D7 G G', ending:'G' },
    greensleeves:{ style:'waltz', harmony:'Am C G Em Am F E7 E7 C C G G Am E7 Am Am', ending:'Am' },
  };
  // Relative pitches and rhythmic weights within a harmony. One note at a time
  // keeps either hand independently playable on a two-octave touch keyboard.
  const LEFT_STYLES = {
    held: [[0,1]],
    fifths: [[0,1],[7,1]],
    march: [[0,2],[7,1],[12,1]],
    pulse: [[0,1],[0,1],[7,1],[12,1]],
    rock: [[0,1],[0,1],[7,1],[0,1]],
    bounce: [[0,1],[7,1],[12,1],[7,1]],
    broken: [[0,1],[7,1],['third',1],[7,1]],
    alberti: [[0,1],[7,1],['third',1],[7,1]],
    arpeggio: [[0,1],[7,1],[12,1]],
    ballad: [[0,2],[7,1],['third',1]],
    waltz: [[0,1],['third',1],[7,1]],
    walking: [[0,1],['third',1],[7,1],[10,1]],
    syncopated: [[0,1],[null,.5],[7,.5],[12,1],[7,1]],
    compound: [[0,1],[7,1],['third',1],[0,1],[7,1],['third',1],[0,1],[7,1],['third',1]],
  };
  function bassChord(token) {
    const m = /^([A-G])([#b]?)(m|dim|7)?(?::(\d+(?:\.\d+)?))?$/.exec(token);
    if (!m) throw new Error('Unknown left-hand harmony ' + token);
    return { root:midiOf(m[1]+m[2]+'2'), third:m[3]==='m'||m[3]==='dim'?3:4, fifth:m[3]==='dim'?6:7, beats:m[4]?+m[4]:null };
  }
  function leftNotes(s, plan) {
    const total=s.notes.reduce((sum,n)=>sum+n.dur,0), out=[], meter=s.meter||4;
    const pattern=LEFT_STYLES[plan.style], harmonies=plan.harmony.split(/\s+/).map(bassChord);
    const weight=pattern.reduce((sum,[,dur])=>sum+dur,0);
    let beat=0, bar=0;
    const append=(note,dur)=>{const clipped=Math.min(dur,total-beat);if(clipped>1e-8){out.push(note===null?{rest:true,dur:clipped}:{note:nameOf(note),dur:clipped});beat+=clipped;}};
    if(s.pickup)append(null,s.pickup);
    while(beat<total-1e-8){
      let chord=harmonies[bar++%harmonies.length];
      const span=chord.beats||meter;
      // A final tonic supports the closing phrase, even for excerpts whose
      // last bar is incomplete. Clipping preserves the exact melody timeline.
      if(total-beat<=span+1e-8)chord=bassChord(plan.ending);
      for(const[degree,dur]of pattern){
        const offset=degree==='third'?chord.third:degree===7?chord.fifth:degree;
        append(degree===null?null:chord.root+offset,span*dur/weight);
      }
    }
    return out;
  }
  const song = s => {
    let cache, leftCache;
    const plan=LEFT_PARTS[s.id];
    if(!plan)throw new Error('Missing left-hand arrangement for '+s.id);
    return Object.defineProperties(s, {
      notes:{enumerable:true,get:()=>cache||(cache=parse(s.melody,s.unit,s.transpose))},
      leftNotes:{enumerable:true,get:()=>leftCache||(leftCache=leftNotes(s,plan))},
      leftArrangement:{enumerable:true,value:'Simplified bass accompaniment'},
    });
  };
  const M = 'Star Wars & Movies', X = 'Christmas', C = 'Classical', P = 'Pop', K = 'Kids & Folk';
  const impOpen = 'G4 G4 G4 D#4:.75 A#4:.25 | G4 D#4:.75 A#4:.25 G4:2 | D5 D5 D5 D#5:.75 A#4:.25 | F#4 D#4:.75 A#4:.25 G4:2';
  const impA = 'G5 G4:.75 G4:.25 G5 F#5:.75 F5:.25 | E5:.25 D#5:.25 E5:.5 r:.5 G#4:.5 C#5 C5:.75 B4:.25 | A#4:.25 A4:.25 A#4:.5 r:.5 D#4:.5 F#4 D#4:.75';
  const jbChorus = 'E5 E5 E5:2 | E5 E5 E5:2 | E5 G5 C5:1.5 D5:.5 | E5:4 | F5 F5 F5:1.5 F5:.5 | F5 E5 E5 E5:.5 E5:.5 |';
  const jbVerse = 'G4 E5 D5 C5 | G4:3 G4:.5 G4:.5 | G4 E5 D5 C5 | A4:4 | A4 F5 E5 D5 | B4:4 | G5 G5 F5 D5 | E5:4 | ' +
    'G4 E5 D5 C5 | G4:4 | G4 E5 D5 C5 | A4:3 A4 | A4 F5 E5 D5 | G5 G5 G5 G5 | A5 G5 F5 D5 | C5:2 G5:2 | ';
  const odeA = 'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | ';
  const elP = 'E5 D#5 | E5 D#5 E5 B4 D5 C5 | A4:1.5 C4 E4 A4 | B4:1.5 E4 G#4 B4 | C5:1.5 E4 ';
  const elQ = 'E5 D#5 | E5 D#5 E5 B4 D5 C5 | A4:1.5 C4 E4 A4 | B4:1.5 E4 C5 B4 | ';
  const swA = 'G4:.33 G4:.33 G4:.34 | C5:2 G5:2 | F5:.33 E5:.33 D5:.34 C6:2 G5 | F5:.33 E5:.33 D5:.34 C6:2 G5 | F5:.33 E5:.33 F5:.34 D5:2';
  const swB = 'G4:.75 G4:.25 | A4:1.5 A4:.5 F5:.5 E5:.5 D5:.5 C5:.5 | C5:.33 D5:.33 E5:.34 D5:.75 A4:.25 B4 G4:.75 G4:.25 | A4:1.5 A4:.5 F5:.5 E5:.5 D5:.5 C5:.5 | G5 D5:2 G4:.75 G4:.25 | ' +
    'A4:1.5 A4:.5 F5:.5 E5:.5 D5:.5 C5:.5 | C5:.33 D5:.33 E5:.34 D5:.75 A4:.25 B4 G5:.75 G5:.25 | C6:.67 A#5:.33 G#5:.67 G5:.33 F5:.67 D#5:.33 D5:.67 C5:.33 | G5:3';
  const pirA = 'A4:.5 C5:.5 | D5 D5 D5:.5 E5:.5 | F5 F5 F5:.5 G5:.5 | E5 E5 D5:.5 C5:.5 |';
  const tetA = 'E5 B4:.5 C5:.5 D5 C5:.5 B4:.5 | A4 A4:.5 C5:.5 E5 D5:.5 C5:.5 | B4:1.5 C5:.5 D5 E5 | C5 A4 A4:2 |';
  const tetB = 'r:.5 D5 F5:.5 A5 G5:.5 F5:.5 | E5:1.5 C5:.5 E5 D5:.5 C5:.5 | B4 B4:.5 C5:.5 D5 E5 | C5 A4 A4:2 |';
  const mtk = 'B4 C#5 D5 E5 F#5 D5 F#5:1 | F5 C#5 F5:1 E5 C5 E5:1 |';
  const lbA = 'G4:1.5 A4:.5 G4 F4 | E4 F4 G4:2 | D4 E4 F4:2 | E4 F4 G4:2 |';
  const fj = 'F4 G4 A4 F4 | F4 G4 A4 F4 | A4 A#4 C5:2 | A4 A#4 C5:2 | C5:.5 D5:.5 C5:.5 A#4:.5 A4 F4 | C5:.5 D5:.5 C5:.5 A#4:.5 A4 F4 | F4 C4 F4:2 | F4 C4 F4:2';
  const omd = 'G4 G4 G4 D4 | E4 E4 D4:2 | B4 B4 A4 A4 | G4:3 ';

  const pirB = 'D5 D5 D5:.5 E5:.5 | F5 F5 F5:.5 G5:.5 | E5 E5 D5:.5 C5:.5 |';
  const pirFull = 'A4:.5 C5:.5 | ' + pirB + ' C5:.5 D5:1.5 A4:.5 C5:.5 | ' + pirB + ' C5:.5 D5:2 A4:.5 C5:.5 | ' +
    'D5 D5 D5:.5 F5:.5 | G5 G5 G5:.5 A5:.5 | A#5 A#5 A5:.5 G5:.5 | A5:.5 D5:1.5 D5:.5 E5:.5 | F5 F5 G5 | A5:.5 D5:1.5 D5:.5 F5:.5 | E5 E5 F5:.5 D5:.5 |';
  const hwA = 'B4 E5:1.5 G5:.5 F#5 | E5:2 B5 | A5:3 | F#5:3 | E5:1.5 G5:.5 F#5 | D#5:2 F5 | B4:5 | B4 E5:1.5 G5:.5 F#5 | E5:2 B5 | D6:2 C#6 | C6:2 G#5 | C6:1.5 B5:.5 A#5 | A#4:2 G5 |';
  const gotA = 'G4 C4 D#4:.5 F4:.5 | G4 C4 D#4:.5 F4:.5 | G4 C4 D#4:.5 F4:.5 | G4 C4 D#4:.5 F4:.5 | G4 C4 E4:.5 F4:.5 | G4 C4 E4:.5 F4:.5 | G4 C4 E4:.5 F4:.5 | G4 C4 E4:.5 F4:.5 | ' +
    'G4:3 | C4:3 | D#4:.5 F4:.5 G4:2 | C4:2 D#4:.5 F4:.5 | D4:6 | F4:3 | A#3:3 | D#4:.5 D4:.5 F4:2 | A#3:2 D#4:.5 D4:.5 | C4:6';
  const marI = 'E5:.5 E5:.5 r:.5 E5:.5 r:.5 C5:.5 E5 | G5 r G4 r | ';
  const marA = 'C5 r:.5 G4 r:.5 E4 | r:.5 A4 B4 A#4:.5 A4 | G4:.67 E5:.67 G5:.66 A5 F5:.5 G5:.5 | r:.5 E5 C5:.5 D5:.5 B4 r:.5 | ';
  const marB = 'r G5:.5 F#5:.5 F5:.5 D#5 E5:.5 | r:.5 G#4:.5 A4:.5 C5:.5 r:.5 A4:.5 C5:.5 D5:.5 | r G5:.5 F#5:.5 F5:.5 D#5 E5:.5 | r:.5 C6 C6:.5 C6:2 | ' +
    'r G5:.5 F#5:.5 F5:.5 D#5 E5:.5 | r:.5 G#4:.5 A4:.5 C5:.5 r:.5 A4:.5 C5:.5 D5:.5 | r D#5 r:.5 D5:1.5 | C5:2 r:2 | ';
  const marCh = 'C5:.5 C5:.5 r:.5 C5:.5 r:.5 C5:.5 D5 | E5:.5 C5 A4:.5 G4:2 | ';
  const marC = marCh + 'C5:.5 C5:.5 r:.5 C5:.5 r:.5 C5:.5 D5:.5 E5:.5 | r:4 | ' + marCh;
  const tetC = 'E5:2 C5:2 | D5:2 B4:2 | C5:2 A4:2 | G#4:2 B4:2 | E5:2 C5:2 | D5:2 B4:2 | C5 E5 A5:2 | G#5:4 |';
  const wwV = 'D4 | G4 G4:.5 A4:.5 G4:.5 F#4:.5 | E4 E4 E4 | A4 A4:.5 B4:.5 A4:.5 G4:.5 | F#4 D4 D4 | B4 B4:.5 C5:.5 B4:.5 A4:.5 | G4 E4 D4:.5 D4:.5 | E4 A4 F#4 | G4:2 ';
  const wwC = 'D4 | G4 G4 G4 | F#4:2 F#4 | G4 F#4 E4 | D4:2 A4 | B4 A4:.5 A4:.5 G4:.5 G4:.5 | D5 D4 D4:.5 D4:.5 | E4 A4 F#4 | G4';
  const snV = 'G4:1.5 A4:.5 G4 E4:3 | G4:1.5 A4:.5 G4 E4:3 | D5:2 D5 B4:3 | C5:2 C5 G4:3 | A4:2 A4 C5:1.5 B4:.5 A4 | G4:1.5 A4:.5 G4 E4:3 | ' +
    'A4:2 A4 C5:1.5 B4:.5 A4 | G4:1.5 A4:.5 G4 E4:3 | D5:2 D5 F5:1.5 D5:.5 B4 | C5:3 E5:3 | C5 G4 E4 G4:1.5 F4:.5 D4 | C4:6';
  const deckA = 'D5:1.5 C5:.5 B4 A4 | G4 A4 B4 G4 | A4:.5 B4:.5 C5:.5 A4:.5 B4:1.5 A4:.5 | G4 F#4 G4:2 | ';
  const deckV = deckA + deckA + 'A4:1.5 B4:.5 C5 A4 | B4:1.5 C5:.5 D5 A4 | B4:.5 C#5:.5 D5 E5:.5 F#5:.5 G5 | F#5 E5 D5:2 | ' +
    'D5:1.5 C5:.5 B4 A4 | G4 A4 B4 G4 | E5:.5 E5:.5 E5:.5 E5:.5 D5:1.5 C5:.5 | B4 A4 G4:2';
  const joyV = 'C5:2 B4:1.5 A4:.5 | G4:3 F4 | E4:2 D4:2 | C4:3 G4 | A4:3 A4 | B4:3 B4 | C5:3 C5 | ' +
    'C5 B4 A4 G4 | G4:1.5 F4:.5 E4 C5 | C5 B4 A4 G4 | G4:1.5 F4:.5 E4 E4 | E4 E4 E4 E4:.5 F4:.5 | G4:3 F4:.5 E4:.5 | ' +
    'D4 D4 D4 D4:.5 E4:.5 | F4:3 E4:.5 D4:.5 | C4 C5:2 A4 | G4:1.5 F4:.5 E4 F4 | E4:2 D4:2 |';
  const rdA = 'G4:.5 A4 G4:.5 E4 C5 | A4 G4:3 | G4:.5 A4:.5 G4:.5 A4:.5 G4 C5 | B4:4 | ';
  const rdB = 'F4:.5 G4 F4:.5 D4 B4 | A4 G4:3 | G4:.5 A4:.5 G4:.5 A4:.5 G4 ';
  const rdEnd = 'A4 | E4:4 | ';
  const rdBr = 'A4 A4 C5 A4 | G4 E4 G4:2 | F4 A4 G4 F4 | E4:4 | D4 E4 G4 A4 | B4 B4 B4:2 | C5 C5 B4 A4 | G4 F4 D4:2 | ' + rdA;
  const scA = 'C5:.5 A4:.5 | A#4:.5 C5 C5 C5:.5 | D5:.5 E5:.5 F5 F5:2 | A4:.5 A#4:.5 | C5 C5 C5:.5 D5:.5 | C5 A#4 A#4:2 | A4 C5 F4 A4 | G4:2 A#4 E4 |';
  const gkV = 'G4 G4 G4 A4 | G4 G4 D4:2 | E4 D4 E4 F#4 | G4:2 G4:2 | G4 G4 G4 A4 | G4 G4 D4:2 | E4 D4 E4 F#4 | G4:2 G4:2 | ' +
    'D5 C5 B4 A4 | B4 A4 G4:2 | E4 D4 E4 F#4 | G4:2 G4:2 | D4 D4 E4 F#4 | G4 G4 A4:2 | D5 C5 B4 A4 | G4:2 C5:2 | G4:4';
  const ocV = 'G4:2 D4 G4 | A4:2 D4:2 | B4 A4 B4 C5 | B4:2 A4 G4 | G4:2 F#4 E4 | F#4 G4 A4 B4 | F#4:1.5 E4:.5 D4:2 | ' +
    'D5:2 C5 B4 | C5:2 B4:2 | A4 B4 G4 A4 | F#4:1.5 E4:.5 D4 G4 | G4 F#4 G4 A4 | G4:2 D4 B4 | B4 A4 B4 C5 | B4:2 A4 B4 | ' +
    'C5 B4 A4 G4 | F#4:2 G4 C5 | B4:2 A4:1.5 G4:.5 |';
  const cbO = 'A#4 A4:.5 A#4:.5 G4 | A#4 A4:.5 A#4:.5 G4 | A#4 A4:.5 A#4:.5 G4 | A#4 A4:.5 A#4:.5 G4 | ';
  const cbD = 'D5 C5:.5 D5:.5 A#4 | D5 C5:.5 D5:.5 A#4 | ';
  const cbH = 'G5 G5:.5 G5:.5 F5:.5 D#5:.5 | D5 D5:.5 D5:.5 C5:.5 A#4:.5 | C5 C5:.5 C5:.5 D5:.5 C5:.5 | G4 G4:.5 G4:.5 G4 | ';
  const cnA = 'F#5:2 E5:2 | D5:2 C#5:2 | B4:2 A4:2 | B4:2 C#5:2 | ';
  const cnQ = 'D5 F#5 A5 G5 | F#5 D5 F#5 E5 | D5 B4 D5 A5 | G5 B5 A5 G5 | ';
  const mtkA = mtk + ' B4 C#5 D5 E5 F#5 D5 F#5 B5 | A5 F#5 D5 F#5 A5:2 | ';
  const mtkB = 'F#4 G#4 A#4 B4 C#5 A#4 C#5:1 | D5 A#4 D5:1 C#5 A#4 C#5:1 | F#4 G#4 A#4 B4 C#5 A#4 C#5:1 | D5 A#4 D5:1 C#5:2 | ';
  const brV = 'E4:.5 E4:.5 | G4:2 E4:.5 E4:.5 | G4:2 E4:.5 G4:.5 | C5 B4:1.5 A4:.5 | A4 G4 D4:.5 E4:.5 | F4 D4 D4:.5 E4:.5 | F4:2 D4:.5 F4:.5 | B4:.5 A4:.5 G4 B4 | C5:2 ' +
    'C4:.5 C4:.5 | C5:2 A4:.5 F4:.5 | G4:2 E4:.5 C4:.5 | F4 G4 A4 | G4:2 C4:.5 C4:.5 | C5:2 A4:.5 F4:.5 | G4:2 E4:.5 C4:.5 | F4 E4 D4 | C4:2';
  const tkA = 'B4:.25 A4:.25 G#4:.25 A4:.25 C5 | D5:.25 C5:.25 B4:.25 C5:.25 E5 | F5:.25 E5:.25 D#5:.25 E5:.25 B5:.25 A5:.25 G#5:.25 A5:.25 | B5:.25 A5:.25 G#5:.25 A5:.25 C6 | ' +
    'A5:.5 C6:.5 | B5:.5 A5:.5 G5:.5 A5:.5 | B5:.5 A5:.5 G5:.5 A5:.5 | B5:.5 A5:.5 G5:.5 F#5:.5 | E5';
  const tomV = 'D5:1.25 r:0.25 D5:1 C#5:0.5 B4:4.5 r:0.5 C#5:0.5 C#5:0.75 r:0.25 C#5:1 A4:0.75 r:1.25 F#5:0.5 r:0.5 F#5:0.25 r:0.25 F#5:1 E5:1 D5:1.25 r:0.25 D5:0.25 r:0.25 D5:0.5 C#5:1 B4:3.75 r:0.75 C#5:0.5 C#5:0.5 r:0.5 C#5:1 B4:1 A4:1 B4:1 C#5:0.5 B4:1 A4:1 r:1 D5:1.25 r:0.25 D5:0.25 r:0.25 D5:0.25 r:0.25 D5:0.75 r:3.75';
  const tomR = 'F#5 F#5 D5 B4 r B4 r E5 | r E5 r E5 G#5 G#5 A5 B5 | A5 A5 A5 E5 r D5 r F#5 | r F#5 r F#5 E5 E5 F#5 E5';
  const snaR = 'E5:1.5 E5:.5 G5:.75 E5:.75 D5:.5 | C5:2 B4:2 | E5:1.5 E5:.5 G5:.75 E5:.75 D5:.5 | C5 D5:.5 C5:.5 B4:2 | ';
  const smR = 'G4 A#4 C5:2 | G4 A#4 C#5:.5 C5:1.5 | G4 A#4 C5:2 | A#4 G4:3 | ';
  const scmR = 'D4 D5 A4 G4 G5 A4 F#5 A4 | D4 D5 A4 G4 G5 A4 F#5 A4 | E4 D5 A4 G4 G5 A4 F#5 A4 | E4 D5 A4 G4 G5 A4 F#5 A4 | ' +
    'G4 D5 A4 G4 G5 A4 F#5 A4 | G4 D5 A4 G4 G5 A4 F#5 A4 | D4 D5 A4 G4 G5 A4 F#5 A4 | D4 D5 A4 G4 G5 A4 F#5 A4';
  const twV = 'C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2';
  const hbV = 'G4:.75 G4:.25 | A4 G4 C5 | B4:2 G4:.75 G4:.25 | A4 G4 D5 | C5:2 G4:.75 G4:.25 | G5 E5 C5 | B4 A4 F5:.75 F5:.25 | E5 C5 D5 |';
  const mhV = 'E4 D4 C4 D4 | E4 E4 E4:2 | D4 D4 D4:2 | E4 G4 G4:2 | E4 D4 C4 D4 | E4 E4 E4 E4 | D4 D4 E4 D4 | C4:4 | ';
  const omV = omd + 'D4 | ' + omd + 'D4:.5 D4:.5 | G4 G4 G4 D4:.5 D4:.5 | G4 G4 G4:2 | G4:.5 G4:.5 G4 G4:.5 G4:.5 G4 | G4:.5 G4:.5 G4:.5 G4:.5 G4 G4 | G4 G4 G4 D4 | E4 E4 D4:2 | B4 B4 A4 A4 |';
  const rwV = 'C4:1.5 C4:1.5 | C4 D4:.5 E4:1.5 | E4 D4:.5 E4 F4:.5 | G4:3 | C5:.5 C5:.5 C5:.5 G4:.5 G4:.5 G4:.5 | E4:.5 E4:.5 E4:.5 C4:.5 C4:.5 C4:.5 | G4 F4:.5 E4 D4:.5 | C4:3 | ';
  const lbV = lbA + ' G4:1.5 A4:.5 G4 F4 | E4 F4 G4:2 | D4:2 G4:2 | E4 C4:3 | ';
  const stV = 'G4:4 | r C4 E4 F4 | G4:4 | r C4 E4 F4 | G4:2 E4:2 | C4:2 E4:2 | D4:4 | r E4 E4 D4 | C4:3 C4 | E4:2 G4:2 | G4 F4:3 | r E4 F4 G4 | E4:2 C4:2 | D4:2 |';
  const alV = 'G4:1.5 G4:.5 G4 B4 | A4:1.5 G4:.5 A4 B4:.5 A4:.5 | G4:1.5 G4:.5 B4 D5 | E5:3 E5 | D5:1.5 B4:.5 B4 G4 | A4:1.5 G4:.5 A4 B4:.5 A4:.5 | G4:1.5 E4:.5 E4 D4 |';
  const agV = 'G4:2 B4:.5 G4:.5 | B4:2 A4 | G4:2 E4 | D4:2 D4 | G4:2 B4:.5 G4:.5 | B4:2 A4 | D5:3 | D5:2 B4:.5 D5:.5 | B4:.5 G4:1.5 D4 | E4:1.5 G4:.5 G4:.5 E4:.5 | D4:2 D4 | G4:2 B4:.5 G4:.5 | B4:2 A4 |';
  const gsV = 'C5 D5:.5 E5:.75 F5:.25 E5:.5 | D5 B4:.5 G4:.75 A4:.25 B4:.5 | C5 A4:.5 A4:.75 G#4:.25 A4:.5 | B4 G#4:.5 E4 A4:.5 | ' +
    'C5 D5:.5 E5:.75 F5:.25 E5:.5 | D5 B4:.5 G4:.75 A4:.25 B4:.5 | C5:.75 B4:.25 A4:.5 G#4:.75 F#4:.25 G#4:.5 | A4:3 | ';
  const gsC = 'G5:1.5 G5:.75 F#5:.25 E5:.5 | D5 B4:.5 G4:.75 A4:.25 B4:.5 | C5 A4:.5 A4:.75 G#4:.25 A4:.5 | B4 G#4:.5 E4:1.5 | ' +
    'G5:1.5 G5:.75 F#5:.25 E5:.5 | D5 B4:.5 G4:.75 A4:.25 B4:.5 | C5:.75 B4:.25 A4:.5 G#4:.75 F#4:.25 G#4:.5 |';
  const mgT = ' D5:.5 A4:.75 G#4:.5 G4:.5 F4:.5 D4:.25 F4:.25 G4:.25 | ';
  const mgR = 'D4:.25 D4:.25' + mgT + 'C4:.25 C4:.25' + mgT + 'B3:.25 B3:.25' + mgT + 'A#3:.25 A#3:.25' + mgT;
  const zlA = 'B4:2 D5 | A4:2 G4:.5 A4:.5 | B4:2 D5 | A4:3 | B4:2 D5 | A5:2 G5 | D5:2 C5:.5 B4:.5 | A4:3 | ';
  const zlB = 'G5:2 F5:.5 E5:.5 | F5:3 | F5:2 E5:.5 D5:.5 | E5:3 | E5:2 D5:.5 C5:.5 | D5:3 | D5:2 C5:.5 B4:.5 | C5:3 | ';
  return [
    // ---------------- Star Wars & Movies ----------------
    { id: 'imperial', title: 'The Imperial March', subtitle: 'Star Wars · A B B, A B B, A B, coda', category: M, level: 'Medium', tempo: 104, featured: true, melody:
      [1, 2, 3].map(i => impOpen + ' | ' + (i < 3 ? impA + ' G4:.25 | A#4 G4:.75 A#4:.25 D5:2 | ' : '') +
        impA + ' A#4:.25 | G4 D#4:.75 A#4:.25 G4:2 | ').join('') +
      'G4 G4 G4 D#4:.75 A#4:.25 | G4 D#4:.75 A#4:.25 G4 D#4:.75 A#4:.25 | G4:4' },
    { id: 'starwars', title: 'Star Wars Main Theme', subtitle: 'John Williams · in C · A A, B, A A, finale', category: M, level: 'Medium', tempo: 104, meter: 4, pickup: 1, melody:
      [swA, swA, swB, swA, swA].join(' ') + ' G4 | C6:4 | C6:3 G5:.33 G5:.33 G5:.34 | G5 r:3' },
    { id: 'pirate', title: "He's a Pirate", subtitle: 'Pirates of the Caribbean · A A B, twice', category: M, level: 'Hard', tempo: 140, meter: 3, pickup: 1, melody:
      pirFull + ' E5:2 ' + pirFull + ' E5:2' },
    { id: 'hedwig', title: "Hedwig's Theme", subtitle: 'Harry Potter · transposed to D minor', category: M, level: 'Hard', tempo: 120, transpose: -2, meter: 3, pickup: 1, melody:
      hwA + ' E5:5 ' + hwA + ' E5:6' },
    { id: 'got', title: 'Game of Thrones', subtitle: 'Main title · transposed to F minor', category: M, level: 'Medium', tempo: 160, transpose: 5, meter: 3, melody: gotA + ' | ' + gotA },
    { id: 'mario', title: 'Super Mario Bros. Theme', subtitle: 'Overworld · Koji Kondo', category: M, level: 'Hard', tempo: 180, melody:
      marI + marA + marA + marB + marB + marC + marI + marA + marA },
    { id: 'tetris', title: 'Tetris (Korobeiniki)', subtitle: 'Game Boy theme A · A and B sections', category: M, level: 'Medium', tempo: 150, melody:
      tetA + tetB + tetA + tetB + tetC + tetA + tetB },
    { id: 'pinkpanther', title: 'The Pink Panther Theme', subtitle: 'Henry Mancini · main theme A A B · up an octave', category: M, level: 'Medium', tempo: 120, pickup: .25, melody:
      'D#4:0.25 E4:0.25 r:1.5 F#4:0.25 G4:0.25 r:1.5 D#4:0.25 E4:0.25 r:0.5 F#4:0.25 G4:0.25 r:0.5 C5:0.25 B4:0.25 r:0.5 E4:0.25 G4:0.25 r:0.5 B4:0.25 A#4:2.25 A4:0.25 r:0.25 G4:0.25 E4:0.25 D4:0.25 r:0.25 E4:3.25 r:0.75 D#4:0.25 E4:0.25 r:1.5 F#4:0.25 G4:0.25 r:1.5 D#4:0.25 E4:0.25 r:0.5 F#4:0.25 G4:0.25 r:0.5 C5:0.25 B4:0.25 r:0.5 G4:0.25 B4:0.25 r:0.5 E5:0.25 D#5:7 r:0.75 D#4:0.25 E4:0.25 r:1.5 F#4:0.25 G4:0.25 r:1.5 D#4:0.25 E4:0.25 r:0.5 F#4:0.25 G4:0.25 r:0.5 C5:0.25 B4:0.25 r:0.5 E4:0.25 G4:0.25 r:0.5 B4:0.25 A#4:2.25 A4:0.25 r:0.25 G4:0.25 E4:0.25 D4:0.25 r:0.25 E4:3.25 r:2 E5:0.75 D5:0.25 B4:0.75 A4:0.25 G4:0.75 E4:0.25 A#4:0.25 A4:0.75 A#4:0.25 A4:0.75 A#4:0.25 A4:0.75 A#4:0.25 A4:0.75 G4:0.25 E4:0.25 r:0.25 D4:0.25 E4:0.75 E4:6.25 G4:0.25 E4:0.25 r:0.25 D4:0.25 E4:0.75 E4:6.25 G4:0.25 E4:0.25 r:0.25 D4:0.25 E4:0.75 E4:5.25 r' },
    { id: 'titanic', title: 'My Heart Will Go On', subtitle: 'Titanic · verse and chorus · in F', category: M, level: 'Medium', tempo: 99, melody:
      'r:1.5 F4:0.5 F4:1.5 F4:0.5 E4:1 F4:2 F4:1 E4:2 F4:1 G4:1 A4:2 G4:2 F4:1 F4:0.5 F4:0.5 F4:1 F4:1 E4:1 F4:2 F4:1 C4:4 A#4:0.5 C4:0.5 D4:0.5 F4:0.5 A#4:0.5 C5:0.5 D5:0.5 E5:0.5 F5:1 F5:2 F5:1 E5:1 F5:2 F5:1 E5:1 F5:2 G5:1 A5:2 G5:2 F5:1 F5:2 F5:1 E5:1 F5:2 F5:1 C5:6 D5:1 E5:1 F5:1 F4:0.5 C5:0.5 F5:1 F5:1 G5:2 C5:1 C6:1 C6:2 A#5:1 A5:1 G5:2 A5:1 A#5:1 A5:2 G5:1 F5:1 E5:1 F5:2 E5:1 D5:4 C5:2 A#4:2 F5:3 F5:1 G5:2 C5:1 C6:0.5 C6:2.5 A#5:1 A5:1 G5:2 A5:1 A#5:1 A5:2 G5:1 F5:1 E5:1 F5:2 E5:1 E5:1 F5:2 G5:1 A5:2 G5:2 F5:4' },
    // ---------------- Christmas ----------------
    { id: 'jingle', title: 'Jingle Bells', subtitle: 'Two verses + choruses', category: X, level: 'Easy', tempo: 140, melody:
      jbVerse + jbChorus + ' E5 D5 D5 E5 | D5:2 G5:2 | ' + jbChorus + ' G5 G5 F5 D5 | C5:4 | ' + jbVerse + jbChorus + ' E5 D5 D5 E5 | D5:2 G5:2 | ' + jbChorus + ' G5 G5 F5 D5 | C5:4' },
    { id: 'wewish', title: 'We Wish You a Merry Christmas', subtitle: 'Traditional · verses, good tidings, figgy pudding', category: X, level: 'Easy', tempo: 150, meter: 3, pickup: 1, melody:
      wwV + wwC + ' D4 | ' + wwV + wwC + ' D4 | ' + wwV + wwC + ' D4 | ' + wwV + wwC + ':2' },
    { id: 'silent', title: 'Silent Night', subtitle: 'Franz Gruber · three verses', category: X, level: 'Easy', tempo: 120, meter: 3, melody: snV + ' | ' + snV + ' | ' + snV },
    { id: 'deck', title: 'Deck the Halls', subtitle: 'Traditional Welsh · two verses', category: X, level: 'Easy', tempo: 130, melody: deckV + ' | ' + deckV },
    { id: 'joy', title: 'Joy to the World', subtitle: 'G. F. Handel / Lowell Mason · two verses', category: X, level: 'Medium', tempo: 110, melody: joyV + ' C4:4 | ' + joyV + ' C4:4' },
    { id: 'rudolph', title: 'Rudolph the Red-Nosed Reindeer', subtitle: 'Johnny Marks · verse, bridge, ending', category: X, level: 'Easy', tempo: 140, melody:
      rdA + rdB + rdA + rdEnd + rdBr + rdB + rdEnd },
    { id: 'santa', title: 'Santa Claus Is Coming to Town', subtitle: 'Verse, verse, bridge (He sees you when you\'re sleeping), verse · in F', category: X, level: 'Medium', tempo: 130, pickup: 1, melody:
      'C5:1 A4:0.5 A#4:0.5 C5:1 C5:1.5 C5:0.5 D5:0.5 E5:0.5 F5:1 F5:2 A4:0.5 A#4:0.5 C5:1 C5:1 C5:1 D5:0.5 C5:0.5 A#4:1 A#4:2 A4:1 C5:1 F4:1 A4:1 G4:1 A#4:2 E4:1 F4:2 r:5.5 C5:0.5 A4:0.5 A#4:0.5 C5:1 C5:1.5 C5:0.5 D5:0.5 E5:0.5 F5:1 F5:2 A4:0.5 A#4:0.5 C5:1 C5:1 C5:1 D5:0.5 C5:0.5 A#4:1 A#4:2 A4:1 C5:1 F4:1 A4:1 G4:1 A#4:2 E4:1 F4:5 r:2 F5:1 G5:1 F5:1 E5:1 F5:1 D5:1 D5:2 F5:1 G5:1 F5:1 E5:1 F5:1 D5:3 G5:1 A5:1 G5:1 F#5:1 G5:1 E5:1 E5:1 E5:1 E5:0.5 F5:0.5 G5:1 F5:1 E5:1 D5:1 C5:1 r:1 C5:1.5 C5:0.5 A4:0.5 A#4:0.5 C5:1 C5:1.5 C5:0.5 D5:0.5 E5:0.5 F5:1 F5:2 A4:0.5 A#4:0.5 C5:1 C5:1 C5:1 D5:0.5 C5:0.5 A#4:1 A#4:2 A4:1 C5:1 F4:1 A4:1 G4:1 A#4:2 G5:1 F5:4' },
    { id: 'wenceslas', title: 'Good King Wenceslas', subtitle: 'Traditional · two verses', category: X, level: 'Easy', tempo: 120, melody: gkV + ' | ' + gkV },
    { id: 'faithful', title: 'O Come, All Ye Faithful', subtitle: 'Adeste Fideles · verse and refrain, twice', category: X, level: 'Medium', tempo: 100, pickup: 1, melody:
      'G4 | ' + ocV + ' G4:3 G4 | ' + ocV + ' G4:3' },
    { id: 'carol', title: 'Carol of the Bells', subtitle: 'Leontovych · ostinato and melody', category: X, level: 'Easy', tempo: 150, meter: 3, melody:
      cbO + cbO + cbD + cbD + cbH + cbH + cbO },
    // ---------------- Classical ----------------
    { id: 'ode', title: 'Ode to Joy', subtitle: 'Beethoven · full theme AABA, in G', category: C, level: 'Easy', tempo: 112, transpose: 7, melody:
      odeA + 'E4:1.5 D4:.5 D4:2 | ' + odeA + 'D4:1.5 C4:.5 C4:2 | ' +
      'D4 D4 E4 C4 | D4 E4:.5 F4:.5 E4 C4 | D4 E4:.5 F4:.5 E4 D4 | C4 D4 G3:2 | ' + odeA + 'D4:1.5 C4:.5 C4:2' },
    { id: 'elise', title: 'Für Elise', subtitle: 'Beethoven · full rondo A B A C A (a few low/high notes folded by octave)', category: C, level: 'Hard', tempo: 120, unit: .5, meter: 3, pickup: 1, melody:
      'E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1 r:0.5 C4:0.5 E4:0.5 A4:0.5 B4:1 r:0.5 E4:0.5 G#4:0.5 B4:0.5 C5:1 r:0.5 E4:0.5 E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1 r:0.5 C4:0.5 E4:0.5 A4:0.5 B4:1 r:0.5 E4:0.5 C5:0.5 B4:0.5 A4:2 A4:1 r:0.5 B4:0.5 C5:0.5 D5:0.5 E5:1.5 G4:0.5 F5:0.5 E5:0.5 D5:1.5 F4:0.5 E5:0.5 D5:0.5 C5:1.5 E4:0.5 D5:0.5 C5:0.5 B4:1 r:0.5 E4:0.5 E5:0.5 r:1 E5:0.5 E5:0.5 r:1 D#5:0.5 E5:1 r:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1 r:0.5 C4:0.5 E4:0.5 A4:0.5 B4:1 r:0.5 E4:0.5 G#4:0.5 B4:0.5 C5:1 r:0.5 E4:0.5 E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1 r:0.5 C4:0.5 E4:0.5 A4:0.5 B4:1 r:0.5 E4:0.5 C5:0.5 B4:0.5 A4:1 r:0.5 B4:0.5 C5:0.5 D5:0.5 A4:1 r:0.5 C5:0.5 C5:0.5 C5:0.5 C5:2 F5:1 E5:0.5 r:0.5 D5:1 A#5:1 A5:0.5 G5:0.5 F5:0.5 E5:0.5 D5:0.5 C5:0.5 A#4:1 A4:1 A#4:0.5 A4:0.5 C5:2 D5:0.5 D#5:0.5 E5:1.5 E5:0.5 F5:0.5 A4:0.5 C5:2 D5:1 G5:0.5 G4:0.5 G5:0.5 B4:0.5 G5:0.5 D5:0.5 G5:0.5 C6:0.5 B5:0.5 F5:0.5 G5:0.5 F5:0.5 G5:0.5 G4:0.5 G5:0.5 B4:0.5 G5:0.5 D5:0.5 G5:0.5 C6:0.5 B5:0.5 F5:0.5 G5:0.5 F5:0.5 F5:0.5 E5:0.5 E5:0.5 E5:0.5 E5:0.5 E5:0.5 E5:1.5 B4:0.5 E5:0.5 D#5:0.5 E5:1.5 B4:0.5 E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1 r:0.5 C4:0.5 E4:0.5 A4:0.5 B4:1 r:0.5 E4:0.5 G#4:0.5 B4:0.5 C5:1 r:0.5 E4:0.5 E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1 r:0.5 C4:0.5 E4:0.5 A4:0.5 B4:1 r:0.5 E4:0.5 C5:0.5 B4:0.5 A4:1 r:0.5 B4:0.5 C5:0.5 D5:0.5 E5:1.5 G4:0.5 F5:0.5 E5:0.5 D5:1.5 F4:0.5 E5:0.5 D5:0.5 C5:1.5 E4:0.5 D5:0.5 C5:0.5 B4:1 r:0.5 E4:0.5 E5:0.5 r:1 E5:0.5 E5:0.5 r:1 D#5:0.5 E5:0.5 r:1 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1 r:0.5 C4:0.5 E4:0.5 A4:0.5 B4:1 r:0.5 E4:0.5 G#4:0.5 B4:0.5 C5:1 r:0.5 E4:0.5 E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1 r:0.5 C4:0.5 E4:0.5 A4:0.5 B4:1 r:0.5 E4:0.5 C5:0.5 B4:0.5 A4:1 r:2 C#5:3 D5:2 E5:0.5 F5:0.5 F5:2 F5:1 E5:3 D5:2 C5:0.5 B4:0.5 A4:2 A4:1 A4:1 C5:1 B4:1 A4:3 C#5:3 D5:2 E5:0.5 F5:0.5 F5:2 F5:1 F5:3 D#5:2 D5:0.5 C5:0.5 A#4:2 A4:1 G#4:2 G#4:1 A4:2 r:1 B4:1 r:2 A4:0.5 E4:0.5 A4:0.5 E5:0.5 D5:0.5 C5:0.5 A4:0.5 E5:0.5 A5:0.5 E5:0.5 D5:0.5 C6:0.5 A5:0.5 E5:0.5 A5:0.5 E5:0.5 D5:0.5 C6:0.5 A#5:0.5 A5:0.5 G5:0.5 F#5:0.5 E5:0.5 D#5:0.5 C#5:0.5 C6:0.5 A#5:0.5 A5:0.5 G5:0.5 F#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1 r:0.5 C4:0.5 E4:0.5 A4:0.5 B4:1 r:0.5 E4:0.5 G#4:0.5 B4:0.5 C5:1 r:0.5 E4:0.5 E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1 r:0.5 C4:0.5 E4:0.5 A4:0.5 B4:1 r:0.5 E4:0.5 C5:0.5 B4:0.5 A4:1 r:0.5 B4:0.5 C5:0.5 D5:0.5 E5:1.5 G4:0.5 F5:0.5 E5:0.5 D5:1.5 F4:0.5 E5:0.5 D5:0.5 C5:1.5 E4:0.5 D5:0.5 C5:0.5 B4:1 r:0.5 E4:0.5 E5:0.5 r:1 E5:0.5 E5:0.5 r:1 D#5:0.5 E5:0.5 r:1 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1 r:0.5 C4:0.5 E4:0.5 A4:0.5 B4:1 r:0.5 E4:0.5 G#4:0.5 B4:0.5 C5:1 r:0.5 E4:0.5 E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1 r:0.5 C4:0.5 E4:0.5 A4:0.5 B4:1 r:0.5 E4:0.5 C5:0.5 B4:0.5 A4:1' },
    { id: 'canon', title: 'Canon in D', subtitle: 'Pachelbel · theme and quarter-note variation', category: C, level: 'Easy', tempo: 90, melody:
      cnA + cnA + cnQ + cnQ + cnA },
    { id: 'mountain', title: 'In the Hall of the Mountain King', subtitle: 'Grieg · theme, dominant section, return', category: C, level: 'Medium', tempo: 120, unit: .5, melody:
      mtkA + mtkA + mtkB + mtkB + mtkA + mtkA },
    { id: 'brahms', title: "Brahms' Lullaby", subtitle: 'Wiegenlied · twice', category: C, level: 'Easy', tempo: 100, meter: 3, pickup: 1, melody: brV + ' E4:.5 E4:.5 | ' + brV },
    { id: 'turkish', title: 'Turkish March', subtitle: 'Mozart · Rondo alla Turca, A theme, episodes, A-major refrain · in F♯ minor', category: C, level: 'Hard', tempo: 120, meter: 2, melody:
      'G#4:0.25 F#4:0.25 F4:0.25 F#4:0.25 A4:0.5 r:0.5 B4:0.25 A4:0.25 G#4:0.25 A4:0.25 C#5:0.5 r:0.5 D5:0.25 C#5:0.25 C5:0.25 C#5:0.25 G#5:0.25 F#5:0.25 F5:0.25 F#5:0.25 G#5:0.25 F#5:0.25 F5:0.25 F#5:0.25 A5 F#5:0.5 A5:0.5 G#5:0.5 F#5:0.5 E5:0.5 F#5:0.5 G#5:0.5 F#5:0.5 E5:0.5 F#5:0.5 G#5:0.5 F#5:0.5 E5:0.5 D#5:0.5 C#5 C#5:0.5 D5:0.5 E5:0.5 E5:0.5 F#5:0.25 E5:0.25 D5:0.25 C#5:0.25 B4:0.5 E4:0.5 C#5:0.5 D5:0.5 E5:0.5 E5:0.5 F#5:0.25 E5:0.25 D5:0.25 C#5:0.25 B4 A4:0.5 B4:0.5 C#5:0.5 C#5:0.5 D5:0.25 C#5:0.25 B4:0.25 A4:0.25 G#4:0.5 C#4:0.5 A4:0.5 B4:0.5 C#5:0.5 C#5:0.5 D5:0.25 C#5:0.25 B4:0.25 A4:0.25 G#4 G#4:0.25 F#4:0.25 F4:0.25 F#4:0.25 A4:0.5 r:0.5 B4:0.25 A4:0.25 G#4:0.25 A4:0.25 C#5:0.5 r:0.5 D5:0.25 C#5:0.25 C5:0.25 C#5:0.25 G#5:0.25 F#5:0.25 F5:0.25 F#5:0.25 G#5:0.25 F#5:0.25 F5:0.25 F#5:0.25 A5:0.5 r:0.5 F#5:0.5 G#5:0.5 A5:0.5 G#5:0.5 F#5:0.5 F5:0.5 F#5:0.5 C#5:0.5 D5:0.5 B4:0.5 A4 G#4:0.75 F#4:0.25 G#4:0.25 r:0.75 F#5:0.5 G#5:0.5 A#5 F#5:0.5 G#5:0.5 A#5:0.5 G#5:0.5 F#5:0.5 F5:0.5 D#5:0.5 F5:0.5 F#5:0.5 G#5:0.5 F5:0.5 C#5:0.5 F#5:0.5 G#5:0.5 A#5 F#5:0.5 G#5:0.5 A#5:0.5 G#5:0.5 F#5:0.5 F5:0.5 D#5:0.5 G#5:0.5 F5:0.5 C#5:0.5 F#5 A#5:0.25 B5:0.25 A#5:0.25 G#5:0.25 F#5:0.25 G#5:0.25 F#5:0.25 F5:0.25 D#5:0.25 F#5:0.25 F5:0.25 D#5:0.25 D5:0.25 D#5:0.25 F5:0.25 D5:0.25 A#4:0.25 C5:0.25 D5:0.25 A#4:0.25 D#5:0.25 D5:0.25 D#5:0.25 F5:0.25 F#5:0.25 F5:0.25 F#5:0.25 G#5:0.25 A#5:0.25 A5:0.25 A#5:0.25 A5:0.25 A#5:0.25 B5:0.25 A#5:0.25 G#5:0.25 F#5:0.25 G#5:0.25 F#5:0.25 F5:0.25 D#5:0.25 F#5:0.25 F5:0.25 D#5:0.25 C#5:0.25 D#5:0.25 F5:0.25 C#5:0.25 A#4:0.25 C5:0.25 C#5:0.25 A#4:0.25 C5:0.25 C#5:0.25 D#5:0.25 C5:0.25 A4:0.25 A#4:0.25 C5:0.25 A4:0.25 A#4 C#5:0.25 B4:0.25 A#4:0.25 G#4:0.25 F#4:0.25 G#4:0.25 A#4:0.25 B4:0.25 C#5:0.25 D#5:0.25 F5:0.25 F#5:0.25 F#5:0.25 F5:0.25 D#5:0.25 C#5:0.25 C#5:0.25 B4:0.25 A#4:0.25 G#4:0.25 F#4:0.25 G#4:0.25 A#4:0.25 B4:0.25 C#5:0.25 D#5:0.25 F5:0.25 F#5:0.25 G5:0.5 G#5:0.5 C#5:0.25 B4:0.25 A#4:0.25 G#4:0.25 F#4:0.25 G#4:0.25 A#4:0.25 B4:0.25 C#5:0.25 D#5:0.25 F5:0.25 F#5:0.25 F#5:0.25 F5:0.25 D#5:0.25 C#5:0.25 C#5:0.25 B4:0.25 A#4:0.25 G#4:0.25 A#4:0.25 C#5:0.25 F#4:0.25 A#4:0.25 G#4:0.25 B4:0.25 F4:0.25 G#4:0.25 F#4 A#5:0.25 B5:0.25 A#5:0.25 G#5:0.25 F#5:0.25 G#5:0.25 F#5:0.25 F5:0.25 D#5:0.25 F#5:0.25 F5:0.25 D#5:0.25 D5:0.25 D#5:0.25 F5:0.25 D5:0.25 A#4:0.25 C5:0.25 D5:0.25 A#4:0.25 D#5:0.25 D5:0.25 D#5:0.25 F5:0.25 F#5:0.25 F5:0.25 F#5:0.25 G#5:0.25 A#5:0.25 A5:0.25 A#5:0.25 A5:0.25 A#5:0.25 A5:0.25 A#5:0.25 G5:0.25 B5:0.25 A#5:0.25 B5:0.25 A#5:0.25 B5:0.25 A#5:0.25 B5:0.25 A#5:0.25 B5:0.25 A#5:0.25 G#5:0.25 F#5:0.25 F5:0.25 F#5:0.25 G#5:0.25 F5:0.25 F#5:0.25 G#5:0.25 A#5:0.25 D#5:0.25 D5:0.25 D#5:0.25 F5:0.25 D5:0.25 D#5 F#5:0.5 G#5:0.5 A#5 F#5:0.5 G#5:0.5 A#5:0.5 G#5:0.5 F#5:0.5 F5:0.5 D#5:0.5 F5:0.5 F#5:0.5 G#5:0.5 F5:0.5 C#5:0.5 F#5:0.5 G#5:0.5 A#5 F#5:0.5 G#5:0.5 A#5:0.5 G#5:0.5 F#5:0.5 F5:0.5 D#5:0.5 G#5:0.5 F5:0.5 C#5:0.5 F#5' },
    { id: 'nachtmusik', title: 'Eine kleine Nachtmusik', subtitle: 'Mozart · 1st violin, full exposition · in D', category: C, level: 'Hard', tempo: 120, melody:
      'D5 r:0.5 A4:0.5 D5 r:0.5 A4:0.5 D5:0.5 A4:0.5 D5:0.5 F#5:0.5 A5 r G5 r:0.5 E5:0.5 G5 r:0.5 E5:0.5 G5:0.5 E5:0.5 C#5:0.5 E5:0.5 A4 r D5:0.5 r:0.5 D5:1.5 F#5:0.5 E5:0.5 D5:0.5 E5:0.25 E5:0.25 D5:0.25 r:0.25 C#5:1.5 E5:0.5 G5:0.5 C#5:0.5 E5:0.5 D5:0.5 D5:1.5 F#5:0.5 E5:0.5 D5:0.5 E5:0.25 E5:0.25 D5:0.25 r:0.25 C#5:1.5 E5:0.5 G5:0.5 C#5:0.5 D5:0.5 D5:0.5 C#5:0.5 B4:0.25 C#5:0.25 D5:0.5 D5:0.5 F#5:0.25 r:0.25 D5:0.25 E5:0.25 F#5:0.5 F#5:0.5 A5:0.25 r:0.25 F#5:0.25 G5:0.25 A5 r A4:2 B4:1.75 A4:0.25 G4 G4 F#4 F#4 E4 E4 D4:0.5 C#4:0.5 B4:0.5 C#4:0.5 D4:0.5 r:0.5 E4:0.5 r:0.5 F#4:0.5 r:1.5 A4:2 B4:2 A4:0.5 G4:0.5 G4:0.5 G4:0.5 G4:0.5 F#4:0.5 F#4:0.5 F#4:0.5 F#4:0.5 E4:0.5 E4:0.5 E4:0.5 D4:0.5 C#4:0.5 B4:0.5 C#4:0.5 D4:2.5 E4:0.25 C#4:0.25 E4:0.5 C#4:0.5 F#4:2.5 G4:0.25 E4:0.25 G4:0.5 E4:0.5 A4:0.25 A4:0.25 A4:0.25 A4:0.25 A4:0.25 A4:0.25 A4:0.25 A4:0.25 B4:0.25 B4:0.25 B4:0.25 B4:0.25 C#5:0.25 C#5:0.25 C#5:0.25 C#5:0.25 D5:0.25 D5:0.25 D5:0.25 D5:0.25 E5:0.25 E5:0.25 E5:0.25 E5:0.25 F#5:0.25 F#5:0.25 F#5:0.25 F#5:0.25 G#5:0.25 G#5:0.25 G#5:0.25 G#5:0.25 A5:1.5 E5:0.5 G#5:0.75 E5:0.25 G#5:0.75 E5:0.25 A5:1.5 E5:0.5 G#5:0.75 E5:0.25 G#5:0.75 E5:0.25 A5:0.5 A5 A5 A5 A5:0.5 B4:0.5 A5 A5 A5 A5:0.5 G#5:0.5 E5:0.5 A5:0.5 E5:0.5 G#5:0.5 E5:0.5 A5:0.5 E5:0.5 G#5:0.5 E4:0.5 E4:0.5 E4:0.5 E4 r E5:1.5 D5:0.25 C#5:0.25 A4:0.5 r:0.5 F#5:0.5 r:0.5 D5:0.5 r:0.5 B4:0.5 r:0.5 E5:0.5 r:1.5 C#5:1.5 B4:0.25 A4:0.25 F#4:0.5 r:0.5 D5:0.5 r:0.5 C#5:2 B4 r:1.5 E5:0.5 E5:0.5 E5:0.5 E5:0.5 E5:0.5 E5:0.5 E5:0.5 E5:0.5 E5:0.5 E5:0.5 E5:0.5 E5:0.5 E5:0.5 F#5:0.5 G#5:0.5 G#5:0.5 A5:0.5 r:0.5 F#5:0.5 F#5:0.5 E5:0.5 r:0.5 G#4:0.5 A4 r:0.5 E5:0.5 A5:0.5 G#5:0.5 F#5:0.5 E5:0.5 F#5:0.25 G#5:0.25 E5:0.5 r:0.5 E5:0.5 E5:0.5 E5:0.5 E5:0.5 E5:0.5 F#5:0.25 G#5:0.25 E5:0.5 r:0.5 E5:0.5 A5:0.5 G#5:0.5 F#5:0.5 E5:0.5 F#5:0.25 G#5:0.25 E5:0.5 r:0.5 E5:0.5 E5:0.5 E5:0.5 E5:0.5 E5:0.5 F#5:0.25 G#5:0.25 E5:0.5 r F#5:1.5 E5:0.25 D5:0.25 D5 r E5:1.5 D5:0.25 C#5:0.25 C#5 r F#5:0.5 G#5:0.25 A5:0.25 G#5:0.5 F#5:0.5 F#5:0.5 E5:0.5 C#5:0.5 E5:0.5 E5:0.5 D5:0.5 C#5:0.5 B4:0.5 A4 r:0.5 E5:0.5 A5:0.5 G#5:0.5 F#5:0.5 E5:0.5 F#5:0.25 G#5:0.25 E5:0.5 r:0.5 E5:0.5 E5:0.5 E5:0.5 E5:0.5 E5:0.5 F#5:0.25 G#5:0.25 E5:0.5 r:0.5 E5:0.5 A5:0.5 G#5:0.5 F#5:0.5 E5:0.5 F#5:0.25 G#5:0.25 E5:0.5 r:0.5 E5:0.5 E5:0.5 E5:0.5 E5:0.5 E5:0.5 F#5:0.25 G#5:0.25 E5:0.5 r F#5:1.5 E5:0.25 D5:0.25 D5 r E5:1.5 D5:0.25 C#5:0.25 C#5 r F#5:0.5 G#5:0.25 A5:0.25 G#5:0.5 F#5:0.5 F#5:0.5 E5:0.5 C#5:0.5 E5:0.5 E5:0.5 D5:0.5 C#5:0.5 B4:0.5 A4:0.5 E4:0.5 F#4:0.5 G#4:0.5 A4:0.5 A4:0.5 B4:0.25 C#5:0.25 A4:0.25 B4:0.25 C#5:0.5 G#4:0.5 A4:0.5 B4:0.5 C#5:0.5 C#5:0.5 D5:0.25 E5:0.25 C#5:0.25 D5:0.25 E5:0.5 E5:0.5 F5:0.25 F#5:0.25 D#5:0.25 F5:0.25 F#5 r F#4:1.5 B4:0.5 A4:0.5 G#4:0.5 F#4:0.5 E4:0.5 A4:0.5 r:0.5 C#5:0.5 r:0.5 A4:0.5 r:1.5' },
    { id: 'danube', title: 'The Blue Danube', subtitle: 'Johann Strauss II · waltz theme', category: C, level: 'Easy', tempo: 150, meter: 3, melody:
      'C4 C4 E4 G4 G4:2 G5 G5:2 E5 E5:2 C4 C4 E4 G4 G4:2 G5 G5:2 F5 F5:2 B4 B4 D4 A4 A4:2 A5 A5:2 F5 F5:2 B4 B4 D4 A4 A4:2 A5 A5:2 E5 E5:2 C4 C4 E4 G4 C5:2 C6 C6:2 G5 G5:2 C4 C4 E4 G4 C5:2 C6 C6:2 A5 A5:2 D4 D4 F4 A4 A4:4 F#4 G4 E5:4 C5 E4 E4:2 D4 A4:2 G4 C4:1.5 C5:0.5 C5 C5 r' },
    { id: 'clairdelune', title: 'Clair de Lune (opening)', subtitle: 'Debussy · first 14 bars, top voice', category: C, level: 'Medium', tempo: 100, unit: .5, meter: 9, melody:
      'r:2 G#5:4 F5:4 D#5:1 F5:1 D#5:7 C#5:1 D#5:1 C#5:1 F5:3 r:1 C#5:2 C5:1 C#5:1 C5:6 F#4:1 A#4:1 C5:1 A#4:1 D#5:1 A#4:1 G#4:1 A#4:1 G#4:1 D#4:1 F#4:1 G#4:1 F#4:3 F4:3 C#4:1 F4:1 F#4:1 F4:1 A#4:1 F4:1 D#4:1 F4:1 D#4:1 A#4:1 C#4:1 D#4:1 C#4:3 C4:3 r:1 G#4:2 G#5:3 F5:4 D#5:1 F5:1 D#5:7 C#5:1 D#5:1 G#5:3 F5:4 D#5:1 F5:1 D#5:3 C#5:4 C#5:1 D#5:1 A#5:1 G#5:3 r:1 F4:1 F5:1 D#5:1 F5:1 D#5:2 C#5:3 r:1' },
    { id: 'moonlight', title: 'Moonlight Sonata (1st mvt)', subtitle: 'Beethoven · melody line, bars 5–23 and 42–60 (piano-midi.de)', category: C, level: 'Medium', tempo: 60, pickup: 1, melody:
      'G#4:0.75 G#4:0.25 G#4:3 G#4:0.75 G#4:0.25 G#4:2 A4:2 G#4:2 F#4 B4 E4 r:6 G4:0.75 G4:0.25 G4:3 G4:0.75 G4:0.25 G4:3 F#4 F#4:2 G4 E4 F#4:2 F#4:2 r:3 B4 C5:3 A#4 B4:3 B4 C5:3 A#4 B4:2 B4:2 B4:2 A4:2 G4:2 F#4:2 C#4:2 C#4 C#4 r:3 C#5:0.75 C#5:0.25 C#5:3 C#5:0.75 C#5:0.25 C#5:2 C5 C#5 D#5:3 D#5 E5:2 D#5 C#5 | r:3 G#4:0.75 G#4:0.25 G#4:3 G#4:0.75 G#4:0.25 G#4:2 A4:2 G#4:2 F#4 B4 E4 r:2 B4:0.75 B4:0.25 B4:3 B4:0.75 B4:0.25 B4:2 C5 C#5 D#5:2 E5:2 D5:2 C5:2 C#5:3 C#5 D5:3 C5 C#5:3 C#5 D5:3 C5 C#5:2 C#5:2 B4:3 B4 A4 A4 G#4 G#4 F#4:2 G#4 A4 G#4:2 G#4:2 C#4:4' },
    { id: 'swanlake', title: 'Swan Lake (main theme)', subtitle: 'Tchaikovsky · oboe theme and continuation · in A minor', category: C, level: 'Medium', tempo: 76, melody:
      'E5:2 A4:0.5 B4:0.5 C5:0.5 D5:0.5 E5:1.5 C5:0.5 E5:1.5 C5:0.5 E5:1.5 A4:0.5 C5:0.5 A4:0.5 F4:0.5 C5:0.5 A4:2.5 D5:0.5 C5:0.5 B4:0.5 E5:2 A4:0.5 B4:0.5 C5:0.5 D5:0.5 E5:1.5 C5:0.5 E5:1.5 C5:0.5 E5:1.5 A4:0.5 C5:0.5 A4:0.5 F4:0.5 C5:0.5 A4:3 A4 B4 C5 D5 E5:0.5 F5:0.5 G5:1.5 F5:0.5 E5 F5:0.5 G5:0.5 A5:1.5 G5:0.5 F5 G5:0.5 A5:0.5 B5:1.5 A5:0.5 E5:0.5 C5:0.5 B4:0.5 A4:0.5 B4 C5 D5 E5:0.5 F5:0.5 G5:1.5 F5:0.5 E5 F5:0.5 G5:0.5 A5:1.5 G5:0.5 F5 G5:0.5 A5:0.5 A#5:1.5 F5:0.5 D5 F5:0.5 A#5:0.5 B5:1.5 F#5:0.5 B5:1.5 E5:0.5 A5:4 C5:4 C5:3 D5 C5:2 D5:2 E5:2 F5:2 E5:4' },
    // ---------------- Pop ----------------
    { id: 'takeonme', title: 'Take On Me', subtitle: 'a-ha · synth riff, first verse (up an octave), riff', category: P, level: 'Hard', tempo: 168, unit: .5, melody: tomR + ' | ' + tomV + ' | ' + tomR },
    { id: 'shapeofyou', title: 'Shape of You', subtitle: 'Ed Sheeran · verse, pre-chorus, chorus hook · in C♯ minor', category: P, level: 'Hard', tempo: 96, pickup: .25, melody:
      'C#5:0.25 E5:0.5 E5:0.25 E5:0.25 E5:0.25 E5:0.25 r:0.25 E5:0.25 r:0.25 C#5:0.25 E5:0.25 E5:0.25 E5:0.25 E5:0.25 E5:0.25 E5:0.25 E5:0.25 r:0.25 E5:0.25 r:0.25 G#5:0.25 G#5:0.25 r:0.25 G#5:0.25 r:2 B5:0.25 F#5:0.25 G#5:0.25 G#5:0.25 r:0.25 G#5:0.25 r:0.25 G#5:0.25 F#5:0.25 F#5:0.25 F#5:0.25 F#5:0.25 F#5:0.25 r:0.25 F#5:0.25 E5:0.25 F#5:0.25 r:0.25 F#5:0.25 r:0.25 F#5:0.25 E5:0.25 r:0.25 C#5:0.25 r:1.75 F#5:0.25 G#5:0.25 G#5:0.25 G#5:0.25 G#5:0.25 G#5:0.25 G#5:0.25 G#5:0.25 G#5:0.25 r:0.25 G#5:0.25 G#5:0.25 G#5:0.25 G#5:0.25 G#5:0.25 G#5:0.25 G#5:0.25 B5:0.25 r:0.25 G#5:0.25 r:0.25 F#5:0.25 F#5:0.25 E5:0.25 G#5:1 r:0.25 F#5:0.25 E5:0.25 r:0.25 E5:0.25 B5:0.25 F#5:0.25 G#5:0.25 G#5:0.25 r:0.25 G#5:0.25 r:0.25 G#5:0.25 F#5:0.25 F#5:0.25 F#5:0.25 F#5:0.25 F#5:0.25 r:0.25 F#5:0.25 E5:0.25 F#5:0.25 r:0.25 F#5:0.25 r:0.25 F#5:0.25 E5:0.25 r:0.25 C#5:0.25 r:0.25 G#4:0.25 G#4:0.25 r:0.25 C#5:0.25 C#5:0.25 C#5:0.25 r:0.25 C#5:0.25 r:0.25 C#5:0.25 r:0.25 C#5:0.25 r:0.25 B4:0.25 r:0.25 C#5:0.25 r:0.25 G#5:0.25 r:0.25 F#5:0.5 r:0.5 E5:0.25 F#5:0.25 r:0.25 G#5:0.25 F#5:0.25 r:0.25 E5:0.25 r:0.25 C#5:0.25 r:0.25 E5:0.25 r:0.25 G#5:0.25 E5:0.25 F#5:0.5 C#5:0.25 r:0.75 B5:0.25 F#5:0.25 G#5:0.25 r:0.25 F#5:0.25 F#5:0.25 E5:0.25 r:0.25 C#5:0.25 r:0.75 F#5:0.25 F#5:0.25 r:0.25 E5:0.25 F#5:0.25 r:0.25 E5:0.25 r:0.25 F#5:0.25 r:0.25 E5:0.25 r:0.25 C#5:0.25 r:0.25 B4:0.25 r:0.25 C#5:0.5 r:0.5 C#5:0.5 B4:0.5 C#5:0.5 G#5:0.5 F#5:0.5 r:0.5 F#5:0.25 F#5:0.25 r:0.25 G#5:0.25 F#5:0.25 r:0.25 E5:0.25 r:0.25 C#5:0.25 r:0.25 E5:0.25 r:0.25 G#5:0.25 E5:0.25 F#5:0.25 r:0.25 C#5:0.25 r:0.75 B5:0.25 F#5:0.25 G#5:0.25 r:0.25 F#5:0.25 F#5:0.25 E5:0.25 r:0.25 C#5:0.25 r:0.25 C#5:0.25 r:0.25 B5:0.25 F#5:0.25 G#5:0.25 r:0.25 F#5:0.25 F#5:0.25 E5:0.25 r:0.25 C#5:0.25 r:3.25 E5:0.25 F#5:0.25 G#5:0.25 r:0.25 F#5:0.25 E5:0.25 E5:0.25 r:0.25 F#5:0.25 r:0.25 F#5:0.25 r:1.25 E5:0.25 F#5:0.25 G#5:0.25 r:0.25 F#5:0.25 E5:0.25 E5:0.25 r:0.25 F#5:0.25 r:0.25 C#5:0.25 r:1.25 E5:0.25 F#5:0.25 G#5:0.25 r:0.25 F#5:0.25 E5:0.25 E5:0.25 r:0.25 F#5:0.25 r:0.25 F#5:0.25 r:1.25 E5:0.25 F#5:0.25 G#5:0.25 r:0.25 F#5:0.25 E5:0.25 F#5:0.75 C#5:0.25 r:1.5 E5:0.25 F#5:0.25 G#5:0.25 r:0.25 F#5:0.25 E5:0.25 E5:0.25 r:0.25 F#5:0.25 r:0.25 F#5:0.25 r:1.25 E5:0.25 F#5:0.25 G#5:0.25 r:0.25 F#5:0.25 E5:0.25 E5:0.25 r:0.25 F#5:0.25 r:0.25 C#5:0.25 r:0.25 C#5:0.25 C#5:0.25 C#5:0.25 C#5:0.25 E5:0.25 F#5:0.25 G#5:0.25 r:0.25 C#5:0.25 r:0.25 E5:0.25 r:0.25 F#5:0.25 r:0.25 F#5:0.25 r:1.25 E5:0.25 F#5:0.25 G#5:0.25 r:0.25 F#5:0.25 E5:0.25 F#5:0.75 C#5:0.25 r:5.5 E5:0.25 F#5:0.25 G#5:0.5 F#5:0.25 E5:0.25 F#5:0.75 C#5:0.25 r:5.5 E5:0.25 F#5:0.25 G#5:0.5 F#5:0.25 E5:0.25 F#5:0.75 C#5:0.25 r:5.5 E5:0.25 F#5:0.25 G#5:0.5 F#5:0.25 E5:0.25 F#5:0.75 C#5:0.25 r:0.5 C#5:0.25 C#5:0.25 C#5:0.25 C#5:0.25 E5:0.25 F#5:0.25 G#5:0.25 r:0.25 C#5:0.25 r:0.25 E5:0.25 r:0.25 F#5:0.25 r:0.25 F#5:0.25 r:1.25 E5:0.25 F#5:0.25 G#5:0.5 F#5:0.25 E5:0.25 E5:0.5 F#5:0.5 C#5:4' },
    { id: 'sevennation', title: 'Seven Nation Army', subtitle: 'The White Stripes · riff ×4', category: P, level: 'Easy', tempo: 120, melody: snaR + snaR + snaR + snaR },
    { id: 'smoke', title: 'Smoke on the Water', subtitle: 'Deep Purple · riff ×4', category: P, level: 'Easy', tempo: 112, melody: smR + smR + smR + smR },
    { id: 'sweetchild', title: "Sweet Child o' Mine", subtitle: "Guns N' Roses · intro riff, twice", category: P, level: 'Hard', tempo: 125, unit: .5, melody: scmR + ' | ' + scmR },
    { id: 'megalovania', title: 'Megalovania', subtitle: 'Toby Fox · Undertale riff, four roots, twice · up a tone', category: P, level: 'Hard', tempo: 120, transpose: 2, melody: mgR + mgR },
    { id: 'zelda', title: "Zelda's Lullaby", subtitle: 'Koji Kondo · Ocarina of Time · in F', category: P, level: 'Easy', tempo: 90, transpose: -2, meter: 3, melody: zlA + zlA.replace('D5:2 C5:.5 B4:.5 | A4:3', 'D6:3 | r:3') + zlB + zlA },
    // ---------------- Kids & Folk ----------------
    { id: 'zaychentseto', title: 'Зайченцето бяло', subtitle: 'The Little White Bunny · Petar Stupel · two verses', category: K, level: 'Easy', tempo: 100, meter: 4, melody: 'G4:.5 G4:.5 E4:.5 G4:.5 C5:.5 B4:.25 A4:.25 G4 | G4:.5 G4:.5 E4:.5 G4:.5 C5:.5 B4:.25 A4:.25 G4 | F4:.5 F4:.5 G4:.5 G4:.5 E4 G4 | F4:.5 F4:.5 G4:.5 G4:.5 E4 G4 | A4:.5 A4:.5 C5:.5 C5:.5 G4 C5 | G4:.5 F4:.5 E4:.5 D4:.5 C4 C4 | G4:.5 G4:.5 E4:.5 G4:.5 C5:.5 B4:.25 A4:.25 G4 | G4:.5 G4:.5 E4:.5 G4:.5 C5:.5 B4:.25 A4:.25 G4 | F4:.5 F4:.5 G4:.5 G4:.5 E4 G4 | F4:.5 F4:.5 G4:.5 G4:.5 E4 G4 | A4:.5 A4:.5 C5:.5 C5:.5 G4 C5 | G4:.5 F4:.5 E4:.5 D4:.5 C4 C4' },
    { id: 'twinkle', title: 'Twinkle Twinkle Little Star', subtitle: 'Traditional · two verses', category: K, level: 'Easy', tempo: 100, melody: twV + ' ' + twV },
    { id: 'birthday', title: 'Happy Birthday', subtitle: 'Traditional · twice', category: K, level: 'Easy', tempo: 100, meter: 3, pickup: 1, melody: hbV + ' C5:2 ' + hbV + ' C5:2' },
    { id: 'mary', title: 'Mary Had a Little Lamb', subtitle: 'Traditional · three verses', category: K, level: 'Easy', tempo: 110, melody: mhV + mhV + mhV },
    { id: 'frere', title: 'Frère Jacques', subtitle: 'Traditional · in F, twice', category: K, level: 'Easy', tempo: 110, melody: fj + ' | ' + fj },
    { id: 'oldmac', title: 'Old MacDonald Had a Farm', subtitle: 'Traditional · two verses', category: K, level: 'Easy', tempo: 130, melody: omV + ' G4:4 | ' + omV + ' G4:4' },
    { id: 'row', title: 'Row, Row, Row Your Boat', subtitle: 'Traditional · three times', category: K, level: 'Easy', tempo: 100, meter: 3, melody: rwV + rwV + rwV },
    { id: 'london', title: 'London Bridge Is Falling Down', subtitle: 'Traditional · three verses', category: K, level: 'Easy', tempo: 120, melody: lbV + lbV + lbV },
    { id: 'saints', title: 'When the Saints Go Marching In', subtitle: 'Traditional · three verses', category: K, level: 'Easy', tempo: 140, pickup: 3, melody:
      'C4 E4 F4 | ' + stV + ' C4:2 | C4 C4 E4 F4 | ' + stV + ' C4:2 | C4 C4 E4 F4 | ' + stV + ' C4:2 | C4:4' },
    { id: 'auld', title: 'Auld Lang Syne', subtitle: 'Scottish traditional · two verses', category: K, level: 'Easy', tempo: 90, pickup: 1, melody: 'D4 | ' + alV + ' G4:3 D4 | ' + alV + ' G4:3' },
    { id: 'amazing', title: 'Amazing Grace', subtitle: 'Traditional hymn · three verses', category: K, level: 'Easy', tempo: 90, meter: 3, pickup: 1, melody:
      'D4 | ' + agV + ' G4:2 D4 | ' + agV + ' G4:2 D4 | ' + agV + ' G4:3' },
    { id: 'greensleeves', title: 'Greensleeves', subtitle: 'English folk · verse and chorus, twice', category: K, level: 'Medium', tempo: 110, meter: 3, pickup: .5, melody:
      'A4:.5 | ' + gsV + gsC + ' A4:2.5 A4:.5 | ' + gsV + gsC + ' A4:2.5' },
  ].map(s => {
    const score=(window.PIANO_SCORE_DATA||[]).find(item=>item.id===s.id);
    return score ? sourced(score) : practice(s);
  }).concat((window.PIANO_SCORE_DATA||[]).filter(item=>!LEFT_PARTS[item.id]).map(sourced));

  function sourced(data){
    const flats=/^(?:F|Bb|Eb|Ab|Db|Gb|Cb|Dm|Gm|Cm|Fm|Bbm|Ebm|Abm)(?:$|\s)/.test(data.key||'');
    const names=flats?['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']:NAMES;
    const part=events=>events.map(([pitch,beat,dur,voice])=>({note:typeof pitch==='string'?pitch:names[pitch%12]+(Math.floor(pitch/12)-1),beat,dur,...(voice?{voice}:{})}));
    let right,left;
    const {right:rawRight,left:rawLeft,...metadata}=data;
    return Object.defineProperties({...metadata,meter:data.timeSignature[0]*4/data.timeSignature[1],leftArrangement:data.source.scope},{
      notes:{enumerable:true,get:()=>right||(right=part(rawRight))},
      leftNotes:{enumerable:true,get:()=>left||(left=part(rawLeft))},
    });
  }
  function practice(s){
    const audit=(window.PIANO_MELODY_AUDIT||{})[s.id];
    if(!audit)return song({...s,source:{scope:'Simplified practice arrangement · excerpt',checked:null}});
    const copy={...s,meter:audit.meter,timeSignature:audit.timeSignature,pickup:audit.pickup,key:audit.key,source:audit.source};
    if(audit.replaceMelody){copy.melody=audit.melody;copy.unit=1;copy.transpose=0;}
    if(audit.key==='F')copy.melody=copy.melody.replace(/\bA#/g,'Bb');
    if(audit.subtitle)copy.subtitle=audit.subtitle;
    return song(copy);
  }
})();
