const firstGarden = [
  { at: 18, row: 2, wave: 1 }, { at: 25, row: 1, wave: 1 }, { at: 32, row: 3, wave: 1 },
  { at: 52, row: 0, wave: 2 }, { at: 57, row: 4, wave: 2 }, { at: 62, row: 2, wave: 2 },
  { at: 67, row: 1, wave: 2 }, { at: 72, row: 3, wave: 2 }, { at: 77, row: 0, wave: 2, armored: true },
  { at: 95, row: 2, wave: 3, armored: true }, { at: 99, row: 4, wave: 3 },
  { at: 103, row: 0, wave: 3 }, { at: 107, row: 1, wave: 3, armored: true },
  { at: 111, row: 3, wave: 3 }, { at: 115, row: 2, wave: 3 },
  { at: 119, row: 4, wave: 3, armored: true }, { at: 123, row: 0, wave: 3 },
  { at: 127, row: 3, wave: 3, armored: true },
];

// Each wave has an explicit lane order and enemy mix. Every garden gets an
// opening to build an economy, followed by its own increasingly dense waves.
function waves(...groups) {
  return groups.flatMap(([at, gap, lanes, types = ''], index) => lanes.map((row, n) => ({
    at: at + n * gap, row, wave: index + 1,
    armored: types[n] === 'a', runner: types[n] === 'r',
  })));
}
const definitions = [
  {
    id: 1, name: 'Backyard beginnings', subtitle: 'A little green power.',
    tip: 'Start with two Sun blooms on the left. Then put Pea pods in every lane.',
    startSun: 200, skyInterval: 7, health: 1,
    theme: { sky: '#cddcc3', grass: ['#90b65a', '#9fc36a'], turf: '#72984f', light: '#ffecd1', accent: '#385c36' },
    enemies: firstGarden,
  },
  {
    id: 2, name: 'Sunny side', subtitle: 'Trouble on both flanks.',
    tip: 'The outer lanes are up first. Cover the top and bottom before filling the middle.',
    startSun: 225, skyInterval: 7, health: 1,
    theme: { sky: '#dedfbd', grass: ['#a2bb60', '#b3c976'], turf: '#81974d', light: '#fff0bf', accent: '#627237' },
    enemies: waves(
      [18, 5, [0, 4, 2, 1, 3]],
      [58, 4, [4, 0, 1, 3, 2, 4, 0, 2], 'a...a...'],
      [103, 3.6, [0, 4, 2, 1, 3, 0, 4, 2, 1, 3, 2], 'a..a..a..aa'],
    ),
  },
  {
    id: 3, name: 'Runner’s row', subtitle: 'They skipped the morning walk.',
    tip: 'Runners move fast. Add a second Pea pod per lane and use Shellnuts to slow the rush.',
    startSun: 250, skyInterval: 6, health: 1,
    theme: { sky: '#c5d9ce', grass: ['#86ad68', '#9cbd7a'], turf: '#668b56', light: '#e9f4dc', accent: '#376c54' },
    enemies: waves(
      [20, 5, [2, 1, 3, 0, 4, 2], '.....r'],
      [66, 4, [0, 4, 2, 1, 3, 0, 4, 2, 1], '.r.r.r.ar'],
      [112, 3, [2, 1, 3, 0, 4, 2, 1, 3, 0, 4, 2], 'arrrraarrra'],
    ),
  },
  {
    id: 4, name: 'Dusk patrol', subtitle: 'Less sunshine. More strategy.',
    tip: 'Sky suns arrive less often at dusk. Plant extra Sun blooms and keep them protected.',
    startSun: 225, skyInterval: 9, health: 1.1,
    theme: { sky: '#b3c1d0', grass: ['#788d72', '#8fa17f'], turf: '#5d7768', light: '#c9d9ff', accent: '#405e70' },
    enemies: waves(
      [24, 5, [2, 0, 4, 1, 3], '..a..'],
      [63, 4, [0, 4, 1, 3, 2, 0, 4], 'a..r.ra'],
      [104, 3.8, [1, 3, 2, 0, 4, 1, 3, 2], 'ar..ra.a'],
      [144, 3.5, [2, 0, 4, 1, 3, 2, 0, 4, 2], 'aarraaara'],
    ),
  },
  {
    id: 5, name: 'Last lawn standing', subtitle: 'The whole neighborhood is counting on you.',
    tip: 'Five waves. Reinforce every lane with multiple Pea pods and a Shellnut near the front.',
    startSun: 300, skyInterval: 7, health: 1.2,
    theme: { sky: '#d8c7bb', grass: ['#9aa85e', '#adba70'], turf: '#7d8b4f', light: '#ffdfbc', accent: '#79603c' },
    enemies: waves(
      [24, 4, [2, 1, 3, 0, 4], '....a'],
      [64, 3.8, [0, 4, 1, 3, 2, 0, 4], 'ar..r.a'],
      [104, 3.5, [2, 1, 3, 0, 4, 2, 1, 3], 'arraarra'],
      [145, 3, [4, 0, 2, 1, 3, 4, 0, 2, 3], 'aarraarra'],
      [186, 3, [0, 4, 1, 3, 2, 0, 4, 1, 3, 2, 2], 'aaraaraaraa'],
    ),
  },
];

export const LEVELS = Object.freeze(definitions.map(level => Object.freeze({
  ...level,
  enemies: Object.freeze(level.enemies.map(Object.freeze)),
  waveCount: Math.max(...level.enemies.map(enemy => enemy.wave)),
  theme: Object.freeze({ ...level.theme, grass: Object.freeze(level.theme.grass) }),
})));
export const MAX_ZOMBIES = 24;
export function getLevel(id = 1) { return LEVELS.find(level => level.id === Number(id)) || LEVELS[0]; }
