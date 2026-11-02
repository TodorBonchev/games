// Song library for the piano's learning mode.
//
// Lazy-friendly: each entry stores its melody as a compact string. The list UI
// only reads the metadata (title, category, level); notes are parsed on first use
// via the `notes` getter, which returns [{note:'G4', dur:beats} | {rest:true, dur}].
//
// Melody string: space-separated tokens "NOTE[:beats]", "r:beats" for a rest,
// "|" bar lines are ignored. Default length is `unit` (1 beat unless given).
// `transpose` (semitones) shifts the whole tune, e.g. to fit C4–C6.
// `meter` (beats per bar, default 4) and `pickup` (beats before the first bar line) only drive the sheet view.
// Add a song: append { id, title, subtitle, category, level, tempo, melody }.
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
  const song = s => { let cache; return Object.defineProperty(s, 'notes', { enumerable: true,
    get: () => cache || (cache = parse(s.melody, s.unit, s.transpose)) }); };
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
  const swB = 'G4:.75 G4:.25 | A4:1.5 A4:.5 F5:.5 E5:.5 D5:.5 C5:.5 | C5:.33 D5:.33 E5:.34 D5 B4 G4:.75 G4:.25 | A4:1.5 A4:.5 F5:.5 E5:.5 D5:.5 C5:.5 | G5 D5:2 G4:.75 G4:.25 | ' +
    'A4:1.5 A4:.5 F5:.5 E5:.5 D5:.5 C5:.5 | C5:.33 D5:.33 E5:.34 D5 B4 G5:.75 G5:.25 | C6:.75 A#5:.25 G#5:.75 G5:.25 F5:.75 D#5:.25 D5:.75 C5:.25 | G5:3';
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
    { id: 'imperial', title: 'The Imperial March', subtitle: 'Star Wars · right hand', category: M, level: 'Medium', tempo: 104, featured: true, melody:
      impOpen + ' | ' + impOpen + ' | ' +
      impA + ' G4:.25 | A#4 G4:.75 A#4:.25 D5:2 | ' + impA + ' A#4:.25 | G4 D#4:.75 A#4:.25 G4:2 | ' + impOpen },
    { id: 'starwars', title: 'Star Wars Main Theme', subtitle: 'John Williams · in C · A A B A, B A A, finale', category: M, level: 'Medium', tempo: 104, meter: 4, pickup: 1, melody:
      [swA, swA, swB, swA, swB, swA, swA].join(' ') + ' G4:.33 G4:.33 G4:.34 | C5:.33 C5:.33 C5:.34 C5:3' },
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
    { id: 'santa', title: 'Santa Claus Is Coming to Town', subtitle: 'Chorus three times · in F', category: X, level: 'Medium', tempo: 130, pickup: 1, melody: scA + ' F4:3 | ' + scA + ' F4:3 | ' + scA + ' F4:3' },
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
    { id: 'takeonme', title: 'Take On Me', subtitle: 'a-ha · synth riff, twice', category: P, level: 'Hard', tempo: 168, unit: .5, melody: tomR + ' | ' + tomR },
    { id: 'sevennation', title: 'Seven Nation Army', subtitle: 'The White Stripes · riff ×4', category: P, level: 'Easy', tempo: 120, melody: snaR + snaR + snaR + snaR },
    { id: 'smoke', title: 'Smoke on the Water', subtitle: 'Deep Purple · riff ×4', category: P, level: 'Easy', tempo: 112, melody: smR + smR + smR + smR },
    { id: 'sweetchild', title: "Sweet Child o' Mine", subtitle: "Guns N' Roses · intro riff, twice", category: P, level: 'Hard', tempo: 125, unit: .5, melody: scmR + ' | ' + scmR },
    { id: 'megalovania', title: 'Megalovania', subtitle: 'Toby Fox · Undertale riff, four roots, twice · up a tone', category: P, level: 'Hard', tempo: 120, transpose: 2, melody: mgR + mgR },
    { id: 'zelda', title: "Zelda's Lullaby", subtitle: 'Koji Kondo · Ocarina of Time · in G', category: P, level: 'Easy', tempo: 90, transpose: -2, meter: 3, melody: zlA + zlA.replace('D5:2 C5:.5 B4:.5 | A4:3', 'D6:3 | r:3') + zlB + zlA },
    // ---------------- Kids & Folk ----------------
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
  ].map(song);
})();
