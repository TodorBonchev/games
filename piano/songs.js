// Song data for the piano's learning mode.
// Each song: { id, title, tempo (quarter-note BPM), notes: [{note:'G4', dur:beats} | {rest:true, dur:beats}] }
// Notes must fit C4–C6 (or the learn mode will shift the octave view if possible).
window.PIANO_SONGS = (() => {
  const n = (note, dur = 1) => ({ note, dur });
  const r = dur => ({ rest: true, dur });
  const seq = (str, dur = 1) => str.split(' ').map(s => {
    const [note, d] = s.split(':'); return note === 'r' ? r(+d || dur) : n(note, d ? +d : dur);
  });
  // Imperial March (J. Williams), main theme, right hand, G minor. Dotted 8th = .75, 16th = .25
  const imperialA = 'G5 G4:.75 G4:.25 G5 F#5:.75 F5:.25 E5:.25 D#5:.25 E5:.5 r:.5 G#4:.5 C#5 C5:.75 B4:.25 A#4:.25 A4:.25 A#4:.5 r:.5 D#4:.5 F#4 D#4:.75';
  return [
    { id: 'imperial', title: 'The Imperial March', subtitle: 'Star Wars · right hand', tempo: 104, featured: true, notes: seq(
      'G4 G4 G4 D#4:.75 A#4:.25 G4 D#4:.75 A#4:.25 G4:2 ' +
      'D5 D5 D5 D#5:.75 A#4:.25 F#4 D#4:.75 A#4:.25 G4:2 ' +
      imperialA + ' G4:.25 A#4 G4:.75 A#4:.25 D5:2 ' +
      imperialA + ' A#4:.25 G4 D#4:.75 A#4:.25 G4:2') },
    { id: 'ode', title: 'Ode to Joy', subtitle: 'Beethoven', tempo: 112, notes: seq(
      'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:.5 D4:2 ' +
      'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:.5 C4:2') },
    { id: 'twinkle', title: 'Twinkle Twinkle Little Star', subtitle: 'Traditional', tempo: 100, notes: seq(
      'C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2') },
    { id: 'birthday', title: 'Happy Birthday', subtitle: 'Traditional', tempo: 100, notes: seq(
      'G4:.75 G4:.25 A4 G4 C5 B4:2 G4:.75 G4:.25 A4 G4 D5 C5:2 G4:.75 G4:.25 G5 E5 C5 B4 A4:2 F5:.75 F5:.25 E5 C5 D5 C5:2') },
    { id: 'elise', title: 'Für Elise (opening)', subtitle: 'Beethoven', tempo: 120, notes: seq(
      'E5 D#5 E5 D#5 E5 B4 D5 C5 A4:2 C4 E4 A4 B4:2 E4 G#4 B4 C5:2 E4 E5 D#5 E5 D#5 E5 B4 D5 C5 A4:2 C4 E4 A4 B4:2 E4 C5 B4 A4:3', .5) },
  ];
})();
