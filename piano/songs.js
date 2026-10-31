// Song library for the piano's learning mode.
//
// Lazy-friendly: each entry stores its melody as a compact string. The list UI
// only reads the metadata (title, category, level); notes are parsed on first use
// via the `notes` getter, which returns [{note:'G4', dur:beats} | {rest:true, dur}].
//
// Melody string: space-separated tokens "NOTE[:beats]", "r:beats" for a rest,
// "|" bar lines are ignored. Default length is `unit` (1 beat unless given).
// `transpose` (semitones) shifts the whole tune, e.g. to fit C4–C6.
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
  const impA = 'G5 G4:.75 G4:.25 G5 F#5:.75 F5:.25 | E5:.25 D#5:.25 E5:.5 r:.5 G#4:.5 C#5 C5:.75 B4:.25 | A#4:.25 A4:.25 A#4:.5 r:.5 D#4:.5 F#4 D#4:.75';
  const jbChorus = 'E5 E5 E5:2 | E5 E5 E5:2 | E5 G5 C5:1.5 D5:.5 | E5:4 | F5 F5 F5:1.5 F5:.5 | F5 E5 E5 E5:.5 E5:.5 |';
  const swA = 'G4:.33 G4:.33 G4:.34 | C5:2 G5:2 | F5:.33 E5:.33 D5:.34 C6:2 G5 | F5:.33 E5:.33 D5:.34 C6:2 G5 | F5:.33 E5:.33 F5:.34 D5:2';
  const pirA = 'A4:.5 C5:.5 | D5 D5 D5:.5 E5:.5 | F5 F5 F5:.5 G5:.5 | E5 E5 D5:.5 C5:.5 |';
  const tetA = 'E5 B4:.5 C5:.5 D5 C5:.5 B4:.5 | A4 A4:.5 C5:.5 E5 D5:.5 C5:.5 | B4:1.5 C5:.5 D5 E5 | C5 A4 A4:2 |';
  const tetB = 'r:.5 D5 F5:.5 A5 G5:.5 F5:.5 | E5:1.5 C5:.5 E5 D5:.5 C5:.5 | B4 B4:.5 C5:.5 D5 E5 | C5 A4 A4:2 |';
  const mtk = 'B4 C#5 D5 E5 F#5 D5 F#5:1 | F5 C#5 F5:1 E5 C5 E5:1 |';
  const lbA = 'G4:1.5 A4:.5 G4 F4 | E4 F4 G4:2 | D4 E4 F4:2 | E4 F4 G4:2 |';
  const fj = 'F4 G4 A4 F4 | F4 G4 A4 F4 | A4 A#4 C5:2 | A4 A#4 C5:2 | C5:.5 D5:.5 C5:.5 A#4:.5 A4 F4 | C5:.5 D5:.5 C5:.5 A#4:.5 A4 F4 | F4 C4 F4:2 | F4 C4 F4:2';
  const omd = 'G4 G4 G4 D4 | E4 E4 D4:2 | B4 B4 A4 A4 | G4:3 ';
  return [
    // ---------------- Star Wars & Movies ----------------
    { id: 'imperial', title: 'The Imperial March', subtitle: 'Star Wars · right hand', category: M, level: 'Medium', tempo: 104, featured: true, melody:
      'G4 G4 G4 D#4:.75 A#4:.25 | G4 D#4:.75 A#4:.25 G4:2 | D5 D5 D5 D#5:.75 A#4:.25 | F#4 D#4:.75 A#4:.25 G4:2 | ' +
      impA + ' G4:.25 | A#4 G4:.75 A#4:.25 D5:2 | ' + impA + ' A#4:.25 | G4 D#4:.75 A#4:.25 G4:2' },
    { id: 'starwars', title: 'Star Wars Main Theme', subtitle: 'John Williams · in C', category: M, level: 'Medium', tempo: 104, melody: swA + ' ' + swA },
    { id: 'pirate', title: "He's a Pirate", subtitle: 'Pirates of the Caribbean', category: M, level: 'Hard', tempo: 140, melody:
      pirA + ' D5:.5 C5:.5 C5:.5 D5:1.5 | ' + pirA + ' C5:.5 D5:2 | ' +
      'A4:.5 C5:.5 | D5 D5 D5:.5 F5:.5 | G5 G5 G5:.5 A5:.5 | A#5 A#5 A5:.5 G5:.5 | A5:.5 D5:1.5 | D5:.5 E5:.5 | F5 F5 G5 | A5:.5 D5:1.5 D5:.5 F5:.5 | E5 E5 F5:.5 D5:.5 | E5:2' },
    { id: 'hedwig', title: "Hedwig's Theme", subtitle: 'Harry Potter · transposed to D minor', category: M, level: 'Hard', tempo: 120, transpose: -2, melody:
      'B4 E5:1.5 G5:.5 F#5 | E5:2 B5 | A5:3 | F#5:3 | E5:1.5 G5:.5 F#5 | D#5:2 F5 | B4:5 | ' +
      'B4 E5:1.5 G5:.5 F#5 | E5:2 B5 | D6:2 C#6 | C6:2 G#5 | C6:1.5 B5:.5 A#5 | A#4:2 G5 | E5:5' },
    { id: 'got', title: 'Game of Thrones', subtitle: 'Main title · transposed to F minor', category: M, level: 'Medium', tempo: 160, transpose: 5, melody:
      'G4 C4 D#4:.5 F4:.5 | G4 C4 D#4:.5 F4:.5 | G4 C4 D#4:.5 F4:.5 | G4 C4 D#4:.5 F4:.5 | G4 C4 E4:.5 F4:.5 | G4 C4 E4:.5 F4:.5 | G4 C4 E4:.5 F4:.5 | G4 C4 E4:.5 F4:.5 | ' +
      'G4:3 | C4:3 | D#4:.5 F4:.5 G4:2 | C4:2 D#4:.5 F4:.5 | D4:6 | F4:3 | A#3:3 | D#4:.5 D4:.5 F4:2 | A#3:2 D#4:.5 D4:.5 | C4:6' },
    { id: 'mario', title: 'Super Mario Bros. Theme', subtitle: 'Overworld · Koji Kondo', category: M, level: 'Hard', tempo: 180, melody:
      'E5:.5 E5:.5 r:.5 E5:.5 r:.5 C5:.5 E5 | G5 r G4 r | C5 r:.5 G4 r:.5 E4 | r:.5 A4 B4 A#4:.5 A4 | G4:.67 E5:.67 G5:.66 A5 F5:.5 G5:.5 | r:.5 E5 C5:.5 D5:.5 B4 r:.5 | ' +
      'C5 r:.5 G4 r:.5 E4 | r:.5 A4 B4 A#4:.5 A4 | G4:.67 E5:.67 G5:.66 A5 F5:.5 G5:.5 | r:.5 E5 C5:.5 D5:.5 B4:1.5' },
    { id: 'tetris', title: 'Tetris (Korobeiniki)', subtitle: 'Game Boy theme A', category: M, level: 'Medium', tempo: 150, melody: tetA + tetB + tetA + tetB },
    // ---------------- Christmas ----------------
    { id: 'jingle', title: 'Jingle Bells', subtitle: 'Verse + chorus', category: X, level: 'Easy', tempo: 140, melody:
      'G4 E5 D5 C5 | G4:3 G4:.5 G4:.5 | G4 E5 D5 C5 | A4:4 | A4 F5 E5 D5 | B4:4 | G5 G5 F5 D5 | E5:4 | ' +
      'G4 E5 D5 C5 | G4:4 | G4 E5 D5 C5 | A4:3 A4 | A4 F5 E5 D5 | G5 G5 G5 G5 | A5 G5 F5 D5 | C5:2 G5:2 | ' +
      jbChorus + ' E5 D5 D5 E5 | D5:2 G5:2 | ' + jbChorus + ' G5 G5 F5 D5 | C5:4' },
    { id: 'wewish', title: 'We Wish You a Merry Christmas', subtitle: 'Traditional', category: X, level: 'Easy', tempo: 150, melody:
      'D4 | G4 G4:.5 A4:.5 G4:.5 F#4:.5 | E4 E4 E4 | A4 A4:.5 B4:.5 A4:.5 G4:.5 | F#4 D4 D4 | B4 B4:.5 C5:.5 B4:.5 A4:.5 | G4 E4 D4:.5 D4:.5 | E4 A4 F#4 | G4:2 ' +
      'D4 | G4 G4 G4 | F#4:2 F#4 | G4 F#4 E4 | D4:2 A4 | B4 A4:.5 A4:.5 G4:.5 G4:.5 | D5 D4 D4:.5 D4:.5 | E4 A4 F#4 | G4:3' },
    { id: 'silent', title: 'Silent Night', subtitle: 'Franz Gruber', category: X, level: 'Easy', tempo: 120, melody:
      'G4:1.5 A4:.5 G4 E4:3 | G4:1.5 A4:.5 G4 E4:3 | D5:2 D5 B4:3 | C5:2 C5 G4:3 | A4:2 A4 C5:1.5 B4:.5 A4 | G4:1.5 A4:.5 G4 E4:3 | ' +
      'A4:2 A4 C5:1.5 B4:.5 A4 | G4:1.5 A4:.5 G4 E4:3 | D5:2 D5 F5:1.5 D5:.5 B4 | C5:3 E5:3 | C5 G4 E4 G4:1.5 F4:.5 D4 | C4:6' },
    { id: 'deck', title: 'Deck the Halls', subtitle: 'Traditional Welsh', category: X, level: 'Easy', tempo: 130, melody:
      'D5:1.5 C5:.5 B4 A4 | G4 A4 B4 G4 | A4:.5 B4:.5 C5:.5 A4:.5 B4:1.5 A4:.5 | G4 F#4 G4:2 | ' +
      'D5:1.5 C5:.5 B4 A4 | G4 A4 B4 G4 | A4:.5 B4:.5 C5:.5 A4:.5 B4:1.5 A4:.5 | G4 F#4 G4:2 | ' +
      'A4:1.5 B4:.5 C5 A4 | B4:1.5 C5:.5 D5 A4 | B4:.5 C#5:.5 D5 E5:.5 F#5:.5 G5 | F#5 E5 D5:2 | ' +
      'D5:1.5 C5:.5 B4 A4 | G4 A4 B4 G4 | E5:.5 E5:.5 E5:.5 E5:.5 D5:1.5 C5:.5 | B4 A4 G4:2' },
    { id: 'joy', title: 'Joy to the World', subtitle: 'G. F. Handel / Lowell Mason', category: X, level: 'Medium', tempo: 110, melody:
      'C5:2 B4:1.5 A4:.5 | G4:3 F4 | E4:2 D4:2 | C4:3 G4 | A4:3 A4 | B4:3 B4 | C5:3 C5 | ' +
      'C5 B4 A4 G4 | G4:1.5 F4:.5 E4 C5 | C5 B4 A4 G4 | G4:1.5 F4:.5 E4 E4 | E4 E4 E4 E4:.5 F4:.5 | G4:3 F4:.5 E4:.5 | ' +
      'D4 D4 D4 D4:.5 E4:.5 | F4:3 E4:.5 D4:.5 | C4 C5:2 A4 | G4:1.5 F4:.5 E4 F4 | E4:2 D4:2 | C4:4' },
    { id: 'rudolph', title: 'Rudolph the Red-Nosed Reindeer', subtitle: 'Johnny Marks · verse', category: X, level: 'Easy', tempo: 140, melody:
      'G4:.5 A4 G4:.5 E4 C5 | A4 G4:3 | G4:.5 A4:.5 G4:.5 A4:.5 G4 C5 | B4:4 | F4:.5 G4 F4:.5 D4 B4 | A4 G4:3 | G4:.5 A4:.5 G4:.5 A4:.5 G4 A4 | E4:4 | ' +
      'G4:.5 A4 G4:.5 E4 C5 | A4 G4:3 | G4:.5 A4:.5 G4:.5 A4:.5 G4 C5 | B4:4 | F4:.5 G4 F4:.5 D4 B4 | A4 G4:3 | G4:.5 A4:.5 G4:.5 A4:.5 G4 D5 | C5:4' },
    { id: 'santa', title: 'Santa Claus Is Coming to Town', subtitle: 'Chorus · in F', category: X, level: 'Medium', tempo: 130, melody:
      'C5:.5 A4:.5 | A#4:.5 C5 C5 C5:.5 | D5:.5 E5:.5 F5 F5:2 | A4:.5 A#4:.5 | C5 C5 C5:.5 D5:.5 | C5:.5 A#4 A#4:2 | A4 C5 F4 A4 | G4 A#4 E4 | F4:4 | ' +
      'C5:.5 A4:.5 | A#4:.5 C5 C5 C5:.5 | D5:.5 E5:.5 F5 F5:2 | A4:.5 A#4:.5 | C5 C5 C5:.5 D5:.5 | C5:.5 A#4 A#4:2 | A4 C5 F4 A4 | G4 A#4 E4 | F4:4' },
    { id: 'wenceslas', title: 'Good King Wenceslas', subtitle: 'Traditional', category: X, level: 'Easy', tempo: 120, melody:
      'G4 G4 G4 A4 | G4 G4 D4:2 | E4 D4 E4 F#4 | G4:2 G4:2 | G4 G4 G4 A4 | G4 G4 D4:2 | E4 D4 E4 F#4 | G4:2 G4:2 | ' +
      'D5 C5 B4 A4 | B4 A4 G4:2 | E4 D4 E4 F#4 | G4:2 G4:2 | D4 D4 E4 F#4 | G4 G4 A4:2 | D5 C5 B4 A4 | G4:2 C5:2 | G4:4' },
    { id: 'faithful', title: 'O Come, All Ye Faithful', subtitle: 'Adeste Fideles · first lines', category: X, level: 'Medium', tempo: 100, melody:
      'G4 | G4:2 D4 G4 | A4:2 D4:2 | B4 A4 B4 C5 | B4:2 A4 G4 | G4:2 F#4 E4 | F#4 G4 A4 B4 | F#4:1.5 E4:.5 D4:3' },
    { id: 'carol', title: 'Carol of the Bells', subtitle: 'Leontovych · opening ostinato', category: X, level: 'Easy', tempo: 150, melody:
      'A#4 A4:.5 A#4:.5 G4 | A#4 A4:.5 A#4:.5 G4 | A#4 A4:.5 A#4:.5 G4 | A#4 A4:.5 A#4:.5 G4 | A#4 A4:.5 A#4:.5 G4 | A#4 A4:.5 A#4:.5 G4 | A#4 A4:.5 A#4:.5 G4 | A#4 A4:.5 A#4:.5 G4' },
    // ---------------- Classical ----------------
    { id: 'ode', title: 'Ode to Joy', subtitle: 'Beethoven', category: C, level: 'Easy', tempo: 112, melody:
      'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4:1.5 D4:.5 D4:2 | E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:.5 C4:2' },
    { id: 'elise', title: 'Für Elise (opening)', subtitle: 'Beethoven', category: C, level: 'Medium', tempo: 120, unit: .5, melody:
      'E5 D#5 E5 D#5 E5 B4 D5 C5 A4:2 C4 E4 A4 B4:2 E4 G#4 B4 C5:2 E4 E5 D#5 E5 D#5 E5 B4 D5 C5 A4:2 C4 E4 A4 B4:2 E4 C5 B4 A4:3' },
    { id: 'canon', title: 'Canon in D', subtitle: 'Pachelbel · melody', category: C, level: 'Easy', tempo: 90, melody:
      'F#5:2 E5:2 | D5:2 C#5:2 | B4:2 A4:2 | B4:2 C#5:2 | D5:2 C#5:2 | B4:2 A4:2 | G4:2 F#4:2 | G4:2 E4:2' },
    { id: 'mountain', title: 'In the Hall of the Mountain King', subtitle: 'Grieg', category: C, level: 'Medium', tempo: 120, unit: .5, melody:
      mtk + ' B4 C#5 D5 E5 F#5 D5 F#5 B5 | A5 F#5 D5 F#5 A5:2 | ' + mtk + ' B4 C#5 D5 E5 F#5 D5 F#5 B5 | A5 F#5 D5 F#5 A5:2' },
    { id: 'brahms', title: "Brahms' Lullaby", subtitle: 'Wiegenlied', category: C, level: 'Easy', tempo: 100, melody:
      'E4:.5 E4:.5 | G4:2 E4:.5 E4:.5 | G4:2 E4:.5 G4:.5 | C5 B4:1.5 A4:.5 | A4 G4 D4:.5 E4:.5 | F4 D4 D4:.5 E4:.5 | F4:2 D4:.5 F4:.5 | B4:.5 A4:.5 G4 B4 | C5:2 ' +
      'C4:.5 C4:.5 | C5:2 A4:.5 F4:.5 | G4:2 E4:.5 C4:.5 | F4 G4 A4 | G4:2 C4:.5 C4:.5 | C5:2 A4:.5 F4:.5 | G4:2 E4:.5 C4:.5 | F4 E4 D4 | C4:2' },
    { id: 'turkish', title: 'Turkish March (opening)', subtitle: 'Mozart · Rondo alla Turca', category: C, level: 'Hard', tempo: 120, melody:
      'B4:.25 A4:.25 G#4:.25 A4:.25 C5 | D5:.25 C5:.25 B4:.25 C5:.25 E5 | F5:.25 E5:.25 D#5:.25 E5:.25 B5:.25 A5:.25 G#5:.25 A5:.25 | B5:.25 A5:.25 G#5:.25 A5:.25 C6 | ' +
      'A5:.5 C6:.5 | B5:.5 A5:.5 G5:.5 A5:.5 | B5:.5 A5:.5 G5:.5 A5:.5 | B5:.5 A5:.5 G5:.5 F#5:.5 | E5' },
    { id: 'nachtmusik', title: 'Eine kleine Nachtmusik', subtitle: 'Mozart · opening', category: C, level: 'Medium', tempo: 120, melody:
      'G4 r:.5 D4:.5 G4 r:.5 D4:.5 | G4:.5 D4:.5 G4:.5 B4:.5 D5:2 | C5 r:.5 A4:.5 C5 r:.5 A4:.5 | C5:.5 A4:.5 F#4:.5 A4:.5 D4:2' },
    // ---------------- Pop ----------------
    { id: 'takeonme', title: 'Take On Me', subtitle: 'a-ha · synth riff', category: P, level: 'Hard', tempo: 168, unit: .5, melody:
      'F#5 F#5 D5 B4 r B4 r E5 | r E5 r E5 G#5 G#5 A5 B5 | A5 A5 A5 E5 r D5 r F#5 | r F#5 r F#5 E5 E5 F#5 E5' },
    { id: 'sevennation', title: 'Seven Nation Army', subtitle: 'The White Stripes · riff', category: P, level: 'Easy', tempo: 120, melody:
      'E5:1.5 E5:.5 G5:.75 E5:.75 D5:.5 | C5:2 B4:2 | E5:1.5 E5:.5 G5:.75 E5:.75 D5:.5 | C5 D5 C5 B4:2' },
    { id: 'smoke', title: 'Smoke on the Water', subtitle: 'Deep Purple · riff', category: P, level: 'Easy', tempo: 112, melody:
      'G4 A#4 C5:1.5 | G4 A#4 C#5:.5 C5:2 | G4 A#4 C5:1.5 | A#4 G4:2.5' },
    { id: 'sweetchild', title: "Sweet Child o' Mine", subtitle: "Guns N' Roses · intro riff", category: P, level: 'Hard', tempo: 125, unit: .5, melody:
      'D4 D5 A4 G4 G5 A4 F#5 A4 | D4 D5 A4 G4 G5 A4 F#5 A4 | E4 D5 A4 G4 G5 A4 F#5 A4 | E4 D5 A4 G4 G5 A4 F#5 A4 | ' +
      'G4 D5 A4 G4 G5 A4 F#5 A4 | G4 D5 A4 G4 G5 A4 F#5 A4 | D4 D5 A4 G4 G5 A4 F#5 A4 | D4 D5 A4 G4 G5 A4 F#5 A4' },
    // ---------------- Kids & Folk ----------------
    { id: 'twinkle', title: 'Twinkle Twinkle Little Star', subtitle: 'Traditional', category: K, level: 'Easy', tempo: 100, melody:
      'C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2' },
    { id: 'birthday', title: 'Happy Birthday', subtitle: 'Traditional', category: K, level: 'Easy', tempo: 100, melody:
      'G4:.75 G4:.25 A4 G4 C5 B4:2 G4:.75 G4:.25 A4 G4 D5 C5:2 G4:.75 G4:.25 G5 E5 C5 B4 A4:2 F5:.75 F5:.25 E5 C5 D5 C5:2' },
    { id: 'mary', title: 'Mary Had a Little Lamb', subtitle: 'Traditional', category: K, level: 'Easy', tempo: 110, melody:
      'E4 D4 C4 D4 | E4 E4 E4:2 | D4 D4 D4:2 | E4 G4 G4:2 | E4 D4 C4 D4 | E4 E4 E4 E4 | D4 D4 E4 D4 | C4:4' },
    { id: 'frere', title: 'Frère Jacques', subtitle: 'Traditional · in F', category: K, level: 'Easy', tempo: 110, melody: fj },
    { id: 'oldmac', title: 'Old MacDonald Had a Farm', subtitle: 'Traditional', category: K, level: 'Easy', tempo: 130, melody:
      omd + 'D4 | ' + omd + 'D4:.5 D4:.5 | G4 G4 G4 D4:.5 D4:.5 | G4 G4 G4:2 | G4:.5 G4:.5 G4 G4:.5 G4:.5 G4 | G4:.5 G4:.5 G4:.5 G4:.5 G4 G4 | ' + omd },
    { id: 'row', title: 'Row, Row, Row Your Boat', subtitle: 'Traditional', category: K, level: 'Easy', tempo: 100, melody:
      'C4:1.5 C4:1.5 | C4 D4:.5 E4:1.5 | E4 D4:.5 E4 F4:.5 | G4:3 | C5:.5 C5:.5 C5:.5 G4:.5 G4:.5 G4:.5 | E4:.5 E4:.5 E4:.5 C4:.5 C4:.5 C4:.5 | G4 F4:.5 E4 D4:.5 | C4:3' },
    { id: 'london', title: 'London Bridge Is Falling Down', subtitle: 'Traditional', category: K, level: 'Easy', tempo: 120, melody:
      lbA + ' G4:1.5 A4:.5 G4 F4 | E4 F4 G4:2 | D4:2 G4:2 | E4 C4:3' },
    { id: 'saints', title: 'When the Saints Go Marching In', subtitle: 'Traditional', category: K, level: 'Easy', tempo: 140, melody:
      'C4 E4 F4 | G4:4 | r C4 E4 F4 | G4:4 | r C4 E4 F4 | G4:2 E4:2 | C4:2 E4:2 | D4:4 | r E4 E4 D4 | C4:3 C4 | E4:2 G4:2 | G4 F4:3 | r E4 F4 G4 | E4:2 C4:2 | D4:2 C4:2 | C4:4' },
    { id: 'auld', title: 'Auld Lang Syne', subtitle: 'Scottish traditional', category: K, level: 'Easy', tempo: 90, melody:
      'D4 | G4:1.5 G4:.5 G4 B4 | A4:1.5 G4:.5 A4 B4:.5 A4:.5 | G4:1.5 G4:.5 B4 D5 | E5:3 E5 | D5:1.5 B4:.5 B4 G4 | A4:1.5 G4:.5 A4 B4:.5 A4:.5 | G4:1.5 E4:.5 E4 D4 | G4:3' },
    { id: 'amazing', title: 'Amazing Grace', subtitle: 'Traditional hymn', category: K, level: 'Easy', tempo: 90, melody:
      'D4 | G4:2 B4:.5 G4:.5 | B4:2 A4 | G4:2 E4 | D4:2 D4 | G4:2 B4:.5 G4:.5 | B4:2 A4 | D5:3 | D5:2 B4:.5 D5:.5 | B4:.5 G4:1.5 D4 | E4:1.5 G4:.5 G4:.5 E4:.5 | D4:2 D4 | G4:2 B4:.5 G4:.5 | B4:2 A4 | G4:3' },
    { id: 'greensleeves', title: 'Greensleeves', subtitle: 'English folk', category: K, level: 'Medium', tempo: 110, melody:
      'A4:.5 | C5 D5:.5 E5:.75 F5:.25 E5:.5 | D5 B4:.5 G4:.75 A4:.25 B4:.5 | C5 A4:.5 A4:.75 G#4:.25 A4:.5 | B4 G#4:.5 E4 A4:.5 | ' +
      'C5 D5:.5 E5:.75 F5:.25 E5:.5 | D5 B4:.5 G4:.75 A4:.25 B4:.5 | C5:.75 B4:.25 A4:.5 G#4:.75 F#4:.25 G#4:.5 | A4:1.5' },
  ].map(song);
})();
