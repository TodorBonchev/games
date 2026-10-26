// A route recorded in one loop becomes a moving corner of the next loop's sail.
// Each chamber changes one part of that relationship, rather than just adding HP.
export const ROOM_RADIUS = 8.5;
export const STEP = 1 / 60;
export const RECORD_EVERY = 3;
export const MAX_ENEMIES = 36;
export const MAX_BULLETS = 96;
export const MAX_PARTICLES = 72;
export const PORTALS = Object.freeze([[0, 5.9], [-5.8, -3.5], [5.8, -3.5]].map(Object.freeze));

export const CHAMBERS = Object.freeze([
  {
    id: 1, name: 'A thread in time', subtitle: 'Your past is your most useful invention.',
    lesson: 'Catch the little machines inside your sail. Hold SNAP to harvest them. Feed the glowing bloom, then bank a memory.',
    twist: 'LEARN TO WEAVE', duration: 22, loops: 6, spawnGap: 1.22, enemySpeed: 1.1, par: 3,
    blooms: [[-2.1, -1.7, 4], [2.1, -1.7, 5], [0, 1.65, 6]],
    obstacles: [], palette: ['#101e36', '#58d9d0', '#f39ac5'], pattern: ['mote', 'mote', 'mote', 'hunter'],
  },
  {
    id: 2, name: 'The turning garden', subtitle: 'Even the still things have somewhere to be.',
    lesson: 'Your spare corner turns around the garden. Watch the shape of the sail and snap when it opens wide.',
    twist: 'A MOVING ANCHOR', duration: 23, loops: 6, spawnGap: 1.12, enemySpeed: 1.2, par: 3,
    blooms: [[-2.8, -1.8, 5], [2.7, -1.3, 5], [0.2, 2.0, 6]],
    obstacles: [], rotating: true, palette: ['#17283b', '#a9de91', '#f4c97a'], pattern: ['mote', 'hunter', 'mote', 'sentry'],
  },
  {
    id: 3, name: 'Crosswind engine', subtitle: 'Make a good memory. Let the wind do the rest.',
    lesson: 'Crosswinds push you. Feed a bloom by touching its ring with an edge of your sail. Your echoes keep their original paths.',
    twist: 'SKIM THE BLOOMS', duration: 24, loops: 6, spawnGap: 1.05, enemySpeed: 1.28, par: 4, edge: true,
    blooms: [[-2.6, -1.3, 5], [2.6, -1.5, 6], [0, 2.4, 6]],
    obstacles: [], wind: true, palette: ['#16263e', '#79c7f6', '#c1a4f0'], pattern: ['mote', 'hunter', 'sentry', 'mote', 'hunter'],
  },
  {
    id: 4, name: 'The narrow hour', subtitle: 'Take the long way. Leave a beautiful shortcut.',
    lesson: 'Skim each bloom with a sail edge. Crystal pillars bend your route, but the sail passes straight through. Wide sails break armor.',
    twist: 'CRYSTAL MAZE', duration: 24, loops: 7, spawnGap: 1.0, enemySpeed: 1.32, par: 4, edge: true,
    blooms: [[-2.8, -1.5, 6], [2.8, -1.5, 6], [0, 2.1, 7]],
    obstacles: [[-3.8, 0.6, 0.8], [3.8, 0.6, 0.8], [0, -3.6, 0.75]],
    palette: ['#241d3b', '#c3b0fa', '#f39fb8'], pattern: ['mote', 'armor', 'hunter', 'sentry', 'mote'],
  },
  {
    id: 5, name: 'Three-body weather', subtitle: 'A dance you can only learn by remembering.',
    lesson: 'The blooms drift. Skim them with a sail edge, then borrow an echo’s position to escape the little machines.',
    twist: 'ORBITING BLOOMS', duration: 25, loops: 7, spawnGap: 0.95, enemySpeed: 1.38, par: 4, edge: true,
    blooms: [[-2.7, -1.7, 6], [2.7, -1.7, 7], [0, 2.6, 7]],
    obstacles: [], orbiting: true, palette: ['#102c32', '#8ee3bb', '#f3cf83'], pattern: ['hunter', 'mote', 'sentry', 'armor', 'mote'],
  },
  {
    id: 6, name: 'Tomorrow, unbroken', subtitle: 'Build a future big enough for all three of you.',
    lesson: 'Repair the three blooms to expose the Unwinder. Trap its heart inside a wide sail and SNAP it out of time.',
    twist: 'THE UNWINDER', duration: 26, loops: 8, spawnGap: 0.92, enemySpeed: 1.42, par: 5,
    blooms: [[-2.5, -1.8, 6], [2.5, -1.8, 7], [0, 2.3, 8]],
    obstacles: [[-4.2, 0.6, 0.7], [4.2, 0.6, 0.7]], boss: true,
    palette: ['#291f37', '#f1b982', '#f5a4cd'], pattern: ['mote', 'hunter', 'armor', 'sentry', 'mote', 'hunter'],
  },
].map(chamber => Object.freeze({
  ...chamber,
  blooms: Object.freeze(chamber.blooms.map(Object.freeze)),
  obstacles: Object.freeze(chamber.obstacles.map(Object.freeze)),
  palette: Object.freeze(chamber.palette), pattern: Object.freeze(chamber.pattern),
})));

export function chamberFor(id) { return CHAMBERS.find(room => room.id === Number(id)) || CHAMBERS[0]; }
export function bloomPosition(room, index, time) {
  const [x, z] = room.blooms[index];
  return room.orbiting ? [x + Math.sin(time * 0.18 + index * 2.1) * 0.8, z + Math.cos(time * 0.18 + index * 2.1) * 0.65] : [x, z];
}
