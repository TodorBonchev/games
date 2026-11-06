# Piano score sources

The library contains 65 songs. The source import supplies 28 complete
published settings: 14 classical settings, four carol harmonizations and ten
nursery settings. It also supplies complete melody-and-bass reductions of Canon
and Eine kleine Nachtmusik, plus 11 checked traditional melodies. A complete
setting can be a theme arrangement or one movement;
the player states that scope, rather than implying it contains an entire larger
work. The other entries remain explicitly labeled practice arrangements.

## What the import preserves

- Every pitched event in the selected published staves, including chords,
  overlapping voices, original octaves, absolute onsets and sustained ties.
- Written rhythms and time-signature denominators: quarter-note beats are the
  internal unit, so 3/8 is 1.5 beats and 9/8 is 4.5 beats per measure.
- Written repeats in the classical source files, expanded with LilyPond.
- Vocal and upper-piano notes combined in the right hand for Brahms' Lullaby;
  its original lower-piano staff remains the left hand. This is labeled a
  voice-and-piano reduction. Ode and the carols are published two-staff hymn
  harmonizations. Blue Danube is the complete published **theme arrangement**.
- Canon and Eine kleine Nachtmusik retain the complete violin I and original
  bass/cello parts, assigned to the two piano hands. Inner strings are omitted;
  wide violin chords may need rolling. These are explicitly labeled outer-voice
  reductions, rather than complete piano or ensemble editions.

The on-screen sheet is generated practice notation, not a facsimile edition. It
does not reproduce all original clef changes, ornaments, articulations, tied
engraving, expressive tempo changes or dynamics. Playback uses a steady reference
tempo and the chosen Listen speed. MIDI-derived accidentals are spelled according
to the home key; the published PDF remains the reference for original spelling
and engraving. **Score details** links to each edition and explains its scope.

## Sources and licenses

The [Mutopia Project](https://www.mutopiaproject.org/) supplies the classical and
carol editions. Exact edition URLs, original source files, hand-track mappings,
credits and individual licenses are in [manifest.json](manifest.json). The
unchanged LilyPond source editions are under `source/`; derived written-duration
MIDI files are under `midi/`. The source license notices remain in those files.

Most editions are public domain. These derived note datasets retain their
respective Creative Commons licenses; the license applies to the score data:

| Setting | Edition credit | License |
| --- | --- | --- |
| Moonlight Sonata, first movement | Stewart Holmes, Mutopia 276 | [CC BY-SA 2.5](https://creativecommons.org/licenses/by-sa/2.5/) |
| Sonata Facile, first movement | Alejandro Sierra, Mutopia 998 | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| Blue Danube, theme arrangement | Nikos Kouremenos, Mutopia 519; source reduction by Christian Mondrup | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| Canon, outer-voice reduction | Michael Fischer v. Mollard, Mutopia 2047 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

The nursery settings come from Alfred Moffat's 1911 *Our Old Nursery Rhymes*,
using the Project Gutenberg production team's MusicXML transcriptions. The
[catalog](https://www.gutenberg.org/ebooks/61009) and
[printed scores](https://www.gutenberg.org/files/61009/61009-h/61009-h.htm)
identify the source. Only musical note data is imported, with attribution; lyrics
and illustrations are not used. `nursery.json` records each source URL, printed
page, original MusicXML checksum and complete-setting scope. Moffat's historical
alternate melodies for Twinkle and Mary were checked and deliberately not used
to replace the familiar tunes already in the game.

## Rebuilding and checking

Normal play and tests need no score compiler or network access. To rebuild the
browser tuples from the checked-in MIDI and MusicXML:

```sh
python scripts/import-piano-nursery.py
node scripts/import-piano-scores.mjs
```

To reproduce the MIDI from the source editions, use LilyPond **2.24.4** and its
bundled `convert-ly`:

```sh
python scripts/compile-piano-scores.py /path/to/lilypond-2.24.4/bin
node scripts/import-piano-scores.mjs
```

The compiler converts temporary copies, unfolds repeats, removes `articulate`
so MIDI gates retain written note lengths, fixes obsolete layout declarations,
and corrects the old hymn files' `tempWholesPerMinute` spelling. It does not edit
the checked-in original editions. The runtime has no new package dependencies.
Nachtmusik's source-specific MIDI tags realize its written ornaments; only its
MIDI book supplies musical events, not a concatenation of the engraving and
playback books.

`melodies.json` records the 11 traditional-melody comparisons. Four retain their
verified notes and practice repetitions, Mary retains its straight-quarter rhythm
variant with that difference stated, and the other six use complete corrected
tunes. Amazing Grace restores tied five-beat notes, Auld Lang Syne includes its
chorus, and Old MacDonald includes its printed final rest. These entries retain
original simplified bass practice accompaniments; they are not published full
piano arrangements. Row and Greensleeves display their compound 6/8 meter.

Source tests compare all imported MIDI events and checksums with the browser
data, check familiar openings and corrected meters, and exercise chord practice
and playback. The nursery importer independently reparses every MusicXML staff,
backup/forward cursor and tied event, with checksum and structural assertions.

## Audit limits

Movie, game and pop entries are existing simplified excerpts, not newly retrieved
full copyrighted scores. They are not claimed to be verified originals. Swan
Lake retains explicit excerpt/reduction scope; its current piano parts are not
an authenticated complete piano edition.
Traditional melodies can have legitimate regional variants, so a different
historical tune alone is not evidence that the familiar version is incorrect.
The per-song audit is in [AUDIT.md](AUDIT.md).
