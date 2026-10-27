// Seven small, deterministic puzzle worlds. Every input is a completed tap;
// cancelled or dragged touches cannot accidentally make a move.

const clone = value => JSON.parse(JSON.stringify(value));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const integer = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const modeOK = v => v === 'playing' || v === 'won';
const colorSet = ['#f3a0a3', '#ffd884', '#a8dbd0', '#a9b9ef', '#dcafe2', '#eeae78', '#a9d491', '#f3cada', '#86bfd4'];

function sceneKit(THREE, root, background, accent, animal) {
  const board = new THREE.Group(), hero = new THREE.Group();
  hero.name = 'Hero';
  root.add(board, hero);
  const geometries = {
    box: new THREE.BoxGeometry(1, 1, 1),
    ball: new THREE.SphereGeometry(1, 12, 8),
    cone: new THREE.ConeGeometry(1, 1, 8),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
    ring: new THREE.TorusGeometry(1, .08, 6, 24),
    oct: new THREE.OctahedronGeometry(1),
  };
  const materials = new Map();
  const mat = color => {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: .72, metalness: .02 }));
    return materials.get(color);
  };
  function part(parent, shape, color, x, y, z, sx, sy = sx, sz = sx, rotate = 0) {
    const obj = new THREE.Mesh(geometries[shape], mat(color));
    obj.position.set(x, y, z); obj.scale.set(sx, sy, sz); obj.rotation.y = rotate;
    if (shape === 'ring') obj.rotation.x = Math.PI / 2;
    parent.add(obj); return obj;
  }
  // The board may contain many pips or petals; reuse one instanced draw per
  // shape/color instead of issuing a separate draw call for every little piece.
  const batches = new Map(), matrix = new THREE.Object3D();
  function piece(shape, color, x, y, z, sx, sy = sx, sz = sx, rotate = 0) {
    const key = `${shape}:${color}`;
    let batch = batches.get(key);
    if (!batch) {
      batch = new THREE.InstancedMesh(geometries[shape], mat(color), 256);
      batch.count = 0; batch.frustumCulled = false; batches.set(key, batch); board.add(batch);
    }
    if (batch.count >= 256) return;
    matrix.position.set(x, y, z); matrix.scale.set(sx, sy, sz);
    matrix.rotation.set(shape === 'ring' ? Math.PI / 2 : 0, rotate, 0);
    matrix.updateMatrix(); batch.setMatrixAt(batch.count++, matrix.matrix); batch.instanceMatrix.needsUpdate = true;
  }
  // Each protagonist has distinctive ears, eyes, body, and a characteristic prop.
  const h = (shape, color, x, y, z, sx, sy = sx, sz = sx, rotate = 0) => part(hero, shape, color, x, y, z, sx, sy, sz, rotate);
  const coat = { aardvark: '#b8876b', cat: '#d5a5d9', beaver: '#a87553', jelly: '#aa90dc', fox: '#ed9a69', pigeon: '#a9b9da', snail: '#9bccb3' }[animal];
  h('ball', coat, 0, .6, 0, .56, .4, .5);
  h('ball', '#fff0d7', -.17, .86, .28, .13, .10, .11);
  h('ball', '#fff0d7', .17, .86, .28, .13, .10, .11);
  h('ball', '#303c53', -.17, .92, .37, .053, .06, .04);
  h('ball', '#303c53', .17, .92, .37, .053, .06, .04);
  if (animal === 'aardvark') {
    h('ball', '#dba797', 0, .65, .53, .16, .15, .38);
    h('ball', '#b8876b', -.38, .95, -.1, .16, .43, .14, -.3);
    h('ball', '#b8876b', .38, .95, -.1, .16, .43, .14, .3);
    h('ball', '#f5c09a', -.47, .36, .15, .18, .08, .23); h('ball', '#f5c09a', .47, .36, .15, .18, .08, .23);
  } else if (animal === 'cat') {
    h('cone', coat, -.35, 1.02, -.17, .20, .42, .2); h('cone', coat, .35, 1.02, -.17, .20, .42, .2);
    h('ball', '#ffdb90', 0, 1.25, -.1, .11, .11, .11); h('ring', '#ffdb90', 0, 1.18, -.1, .24, .24, .24);
  } else if (animal === 'beaver') {
    h('ball', '#795543', 0, .26, -.62, .38, .08, .50); h('ball', '#e5c19b', -.33, 1.0, -.1, .16); h('ball', '#e5c19b', .33, 1.0, -.1, .16);
    h('box', '#fff2d4', 0, .56, .49, .13, .21, .12); h('box', '#ffd177', -.50, .55, .15, .12, .55, .12);
  } else if (animal === 'jelly') {
    for (let i = -2; i <= 2; i++) h('ball', '#d4bbef', i * .17, .30, .10, .08, .28, .08);
    h('ball', '#eed9ff', 0, .98, -.15, .32, .11, .26);
  } else if (animal === 'fox') {
    h('cone', coat, -.35, 1.00, -.1, .22, .45, .2); h('cone', coat, .35, 1.00, -.1, .22, .45, .2);
    h('ball', '#f7d5b4', 0, .59, .47, .25, .17, .20); h('ball', '#f5b58c', .47, .28, -.55, .28, .14, .46, -.3);
    h('ball', '#fff1da', .56, .28, -.75, .18, .12, .18);
  } else if (animal === 'pigeon') {
    h('cone', '#f5c681', 0, .63, .55, .15, .28, .15); h('ball', '#dce7ff', -.48, .58, -.03, .22, .13, .40); h('ball', '#dce7ff', .48, .58, -.03, .22, .13, .40);
    h('box', '#779ac9', 0, 1.06, -.10, .33, .1, .26); h('box', '#779ac9', 0, 1.18, -.1, .23, .2, .22);
  } else {
    h('ball', '#dca789', 0, .78, -.3, .52, .48, .53); h('ring', '#f9d8af', 0, .97, -.26, .26, .26, .26);
    h('ball', coat, -.25, 1.04, .18, .08, .24, .08); h('ball', coat, .25, 1.04, .18, .08, .24, .08);
    h('ball', '#303c53', -.25, 1.29, .2, .07); h('ball', '#303c53', .25, 1.29, .2, .07);
  }
  hero.position.set(-4.35, .05, -6.35); hero.scale.setScalar(1.40);
  const base = new THREE.Group(); root.add(base);
  part(base, 'box', background, 0, -.38, 0, 11.4, .3, 11.4);
  part(base, 'box', accent, 0, -.20, 0, 10.9, .06, 10.9);
  return { board, hero, piece, clear() { batches.forEach(batch => { batch.count = 0; }); }, dispose() { batches.forEach(batch => batch.dispose()); root.clear(); Object.values(geometries).forEach(g => g.dispose()); materials.forEach(m => m.dispose()); } };
}

function createController(ctx, meta, rules) {
  const view = sceneKit(ctx.THREE, ctx.root, meta.background, meta.accent, meta.animal);
  const state = { schema: 1, game: meta.id, mode: 'playing', level: 1, moves: 0 };
  rules.reset(state, 0);
  let dirty = true, touch = null, elapsed = 0;
  const mark = () => { dirty = true; };
  const complete = () => {
    if (state.level < rules.rounds) { state.level++; rules.reset(state, state.level - 1); }
    else state.mode = 'won';
    mark();
  };
  function sync() {
    if (!dirty) return;
    view.clear(); rules.draw(view, state); dirty = false;
  }
  const controller = {
    state,
    pointer(type, x, z) {
      if (state.mode !== 'playing') return;
      if (type === 'cancel') { touch = null; return; }
      if (!Number.isFinite(x) || !Number.isFinite(z)) { touch = null; return; }
      if (type === 'down') { touch = { x, z }; return; }
      if (type === 'move') { if (touch && Math.hypot(x - touch.x, z - touch.z) > .8) touch = null; return; }
      if (type === 'up' && touch && Math.hypot(x - touch.x, z - touch.z) <= .8) {
        touch = null; rules.tap(state, x, z, complete, mark); mark();
      } else if (type === 'up') touch = null;
    },
    update(dt) {
      if (state.mode !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
      elapsed += Math.min(dt, .05);
      view.hero.position.y = .05 + Math.sin(elapsed * 1.8) * .045;
      view.hero.rotation.y = Math.sin(elapsed * .8) * .08;
      if (rules.tick) rules.tick(state, Math.min(dt, .05), complete, mark);
    },
    sync,
    snapshot() { return clone(state); },
    restore(value) {
      try {
        if (!value || value.schema !== 1 || value.game !== meta.id || !modeOK(value.mode) || !integer(value.level, 1, rules.rounds) || !integer(value.moves, 0, 100000) || !rules.valid(value)) return false;
        Object.assign(state, clone(value)); touch = null; mark(); sync(); return true;
      } catch { return false; }
    },
    hud() { return rules.hud(state); },
    resetLevel() { state.mode = 'playing'; touch = null; rules.reset(state, state.level - 1); mark(); sync(); },
    dispose() { view.dispose(); },
  };
  sync(); return controller;
}

function pips(v, value, x, y, z, spacing, radius) {
  for (let i = 0; i < value; i++) v.piece('ball', '#fff8e9', x + (i % 3 - 1) * spacing, y, z + (Math.floor(i / 3) - 1) * spacing, radius, radius * .55, radius);
}

const tile = (v, color, x, z, size = 1.7, height = .16) => v.piece('box', color, x, height / 2, z, size, height, size);
const glow = (v, color, x, z, scale = .25) => v.piece('ball', color, x, .30, z, scale, scale * .7, scale);
const indexAt = (x, z, cols, rows, size, offsetZ = 0) => {
  const col = Math.floor(x / size + cols / 2), row = Math.floor((z - offsetZ) / size + rows / 2);
  return col >= 0 && col < cols && row >= 0 && row < rows ? row * cols + col : -1;
};
const at = (i, cols, rows, size, offsetZ = 0) => ({ x: (i % cols - (cols - 1) / 2) * size, z: (Math.floor(i / cols) - (rows - 1) / 2) * size + offsetZ });

const metaBurrow = { id: 'burrow-banquet', title: 'Burrow Banquet', hero: 'Tansy the aardvark', animal: 'aardvark', tagline: 'Nudge the roots home.', instructions: 'Tap a neighboring patch to walk. Push each golden root onto a glowing burrow. You can push one root at a time.', background: '#7b8c72', accent: '#ddd2a3' };
const burrows = [
  { player: 22, crates: [11, 12], goals: [2, 14], walls: [8, 18] },
  { player: 20, crates: [11, 13], goals: [1, 3], walls: [12, 17] },
  { player: 22, crates: [11, 13, 17], goals: [1, 3, 9], walls: [5, 19] },
];
const stepCell = (a, b) => (Math.abs(a % 5 - b % 5) + Math.abs(Math.floor(a / 5) - Math.floor(b / 5))) === 1;
function createBurrow(ctx) {
  return createController(ctx, metaBurrow, {
    rounds: burrows.length,
    reset(s, i) { s.player = burrows[i].player; s.crates = [...burrows[i].crates]; },
    valid(s) {
      const d = burrows[s.level - 1];
      return integer(s.player, 0, 24) && !d.walls.includes(s.player) && Array.isArray(s.crates) && s.crates.length === d.crates.length && new Set(s.crates).size === s.crates.length && s.crates.every(i => integer(i, 0, 24) && i !== s.player && !d.walls.includes(i)) && (s.mode !== 'won' || d.goals.every(i => s.crates.includes(i)));
    },
    tap(s, x, z, complete) {
      const d = burrows[s.level - 1], target = indexAt(x, z, 5, 5, 1.75, .25);
      if (target < 0 || !stepCell(s.player, target) || d.walls.includes(target)) return;
      const ci = s.crates.indexOf(target);
      if (ci >= 0) {
        const dx = target % 5 - s.player % 5, dz = Math.floor(target / 5) - Math.floor(s.player / 5);
        const nx = target % 5 + dx, nz = Math.floor(target / 5) + dz, next = nz * 5 + nx;
        if (nx < 0 || nx >= 5 || nz < 0 || nz >= 5 || d.walls.includes(next) || s.crates.includes(next)) return;
        s.crates[ci] = next;
      }
      s.player = target; s.moves++;
      if (d.goals.every(i => s.crates.includes(i))) complete();
    },
    draw(v, s) {
      const d = burrows[s.level - 1];
      for (let i = 0; i < 25; i++) { const p = at(i, 5, 5, 1.75, .25); tile(v, d.walls.includes(i) ? '#637c6d' : '#e8d7aa', p.x, p.z, 1.62); if (d.goals.includes(i)) { v.piece('ring', '#ffdd78', p.x, .2, p.z, .48); glow(v, '#fff1bc', p.x, p.z, .16); } }
      for (const i of s.crates) { const p = at(i, 5, 5, 1.75, .25); v.piece('cone', '#efaa66', p.x, .5, p.z, .38, .8, .38); v.piece('ball', '#6fa17d', p.x, .95, p.z, .2, .15, .2); }
      const p = at(s.player, 5, 5, 1.75, .25);
      v.piece('ball', '#b8876b', p.x, .5, p.z, .38, .35, .38);
      for (const side of [-1, 1]) {
        v.piece('ball', '#fff0d7', p.x + side * .14, .75, p.z + .14, .09, .07, .07);
        v.piece('ball', '#303c53', p.x + side * .14, .81, p.z + .18, .042, .045, .035);
      }
      v.piece('ball', '#dba797', p.x, .66, p.z + .31, .11, .09, .17);
    },
    hud(s) { const d = burrows[s.level - 1]; return { primary: `BURROW ${s.level} / ${burrows.length}`, secondary: `${d.goals.filter(i => s.crates.includes(i)).length} / ${d.goals.length} ROOTS HOME`, hint: 'Tap an adjacent patch to walk or push.' }; },
  });
}

const metaMoon = { id: 'moon-basket', title: 'Moon Basket', hero: 'Cleo the cat', animal: 'cat', tagline: 'Arrange a sky of four colors.', instructions: 'Tap an open basket to cycle its jewel. Put each of the four colors once in every row and column. The star-marked clues stay in place.', background: '#7f7f9f', accent: '#e5c6d9' };
const moonSolution = [1,2,3,4, 3,4,1,2, 2,1,4,3, 4,3,2,1];
const moonMasks = [
  [0,1,2,4,5,7,8,10,11,12,14,15],
  [0,2,5,7,8,11,13,14],
  [0,3,5,6,9,10,12,15],
  [0,3,5,8,11,14],
];
function createMoon(ctx) {
  const colors = ['#f8efe4', '#ee9fae', '#f5cc79', '#93cbb8', '#99a7dc'];
  const solved = cells => Array.from({ length: 4 }, (_, i) => [0,1,2,3].map(j => cells[i * 4 + j])).every(row => new Set(row).size === 4 && !row.includes(0)) && Array.from({ length: 4 }, (_, i) => [0,1,2,3].map(j => cells[j * 4 + i])).every(col => new Set(col).size === 4 && !col.includes(0));
  return createController(ctx, metaMoon, {
    rounds: moonMasks.length,
    reset(s, i) { s.cells = moonSolution.map((value, cell) => moonMasks[i].includes(cell) ? value : 0); },
    valid(s) { return Array.isArray(s.cells) && s.cells.length === 16 && s.cells.every((n, i) => integer(n, 0, 4) && (!moonMasks[s.level - 1].includes(i) || n === moonSolution[i])) && (s.mode !== 'won' || solved(s.cells)); },
    tap(s, x, z, complete) { const i = indexAt(x, z, 4, 4, 2.05, .2); if (i < 0 || moonMasks[s.level - 1].includes(i)) return; s.cells[i] = (s.cells[i] + 1) % 5; s.moves++; if (solved(s.cells)) complete(); },
    draw(v, s) {
      for (let i = 0; i < 16; i++) { const p = at(i, 4, 4, 2.05, .2), c = s.cells[i]; tile(v, '#fbf1df', p.x, p.z, 1.85, .22); v.piece('cyl', '#b394a7', p.x, .22, p.z, .59, .16, .59); if (c) { v.piece(['oct', 'ball', 'cone', 'box', 'oct'][c], colors[c], p.x, .62, p.z, .49, .52, .49); if (moonMasks[s.level - 1].includes(i)) glow(v, '#fff8c8', p.x + .55, p.z - .55, .12); } }
    },
    hud(s) { return { primary: `SKY ${s.level} / ${moonMasks.length}`, secondary: `${s.cells.filter(Boolean).length} / 16 BASKETS`, hint: 'Four colors once in each row and column.' }; },
  });
}

const metaStack = { id: 'stack-strata', title: 'Stack Strata', hero: 'Bolo the beaver', animal: 'beaver', tagline: 'Build a little tower of logs.', instructions: 'Tap a log pile, then another pile to move its top log. A larger log cannot rest on a smaller one. Move the whole stack to the gold pad.', background: '#8da78b', accent: '#ead7ac' };
const stackSizes = [2, 3, 4];
function createStack(ctx) {
  const centers = [-3.2, 0, 3.2];
  return createController(ctx, metaStack, {
    rounds: stackSizes.length,
    reset(s, i) { s.rods = [Array.from({ length: stackSizes[i] }, (_, n) => stackSizes[i] - n), [], []]; s.selected = -1; },
    valid(s) {
      const n = stackSizes[s.level - 1];
      if (!Array.isArray(s.rods) || s.rods.length !== 3 || !integer(s.selected, -1, 2) || s.rods.some(r => !Array.isArray(r))) return false;
      const all = s.rods.flat();
      return all.length === n && new Set(all).size === n && all.every(v => integer(v, 1, n)) && s.rods.every(r => r.every((v, i) => !i || r[i - 1] > v)) && (s.selected < 0 || s.rods[s.selected].length > 0) && (s.mode !== 'won' || s.rods[2].length === n);
    },
    tap(s, x, z, complete) {
      if (Math.abs(z) > 3.8) return;
      const target = centers.findIndex(c => Math.abs(c - x) < 1.4); if (target < 0) return;
      if (s.selected < 0) { if (s.rods[target].length) s.selected = target; return; }
      if (s.selected === target) { s.selected = -1; return; }
      const source = s.rods[s.selected], dest = s.rods[target], top = source.at(-1);
      if (top && (!dest.length || dest.at(-1) > top)) { source.pop(); dest.push(top); s.moves++; }
      s.selected = -1; if (s.rods[2].length === stackSizes[s.level - 1]) complete();
    },
    draw(v, s) {
      for (let i = 0; i < 3; i++) {
        const x = centers[i]; v.piece('cyl', i === 2 ? '#f5ce72' : '#bed4ae', x, .10, 0, 1.35, .18, 1.35);
        v.piece('cyl', '#906a55', x, 1.12, 0, .12, 2.05, .12);
        for (let j = 0; j < s.rods[i].length; j++) { const n = s.rods[i][j], radius = .38 + n * .18; v.piece('cyl', ['','#e9a27b','#e8bd7b','#afc88d','#9cb9b2'][n], x, .36 + j * .27, 0, radius, .24, radius); }
        if (s.selected === i) v.piece('ring', '#fff3a4', x, .23, 0, 1.48);
      }
    },
    hud(s) { return { primary: `TOWER ${s.level} / ${stackSizes.length}`, secondary: `${s.moves} MOVES`, hint: 'Move smaller logs onto bigger ones.' }; },
  });
}

const metaSwitch = { id: 'jelly-lanterns', title: 'Jelly Lanterns', hero: 'Mona the jellyfish', animal: 'jelly', tagline: 'Wake a little constellation.', instructions: 'Tap a lantern to change it and its four neighbors. Find the right combination to light every lantern.', background: '#737caa', accent: '#d4c4ec' };
const lightSets = [[0, 4], [1, 5, 6], [0, 2, 4, 7], [1, 2, 3, 6, 8]];
function lightFlip(mask, i) { const r = Math.floor(i / 3), c = i % 3; for (const [dx, dz] of [[0,0],[-1,0],[1,0],[0,-1],[0,1]]) { const x = c + dx, z = r + dz; if (x >= 0 && x < 3 && z >= 0 && z < 3) mask ^= 1 << (z * 3 + x); } return mask; }
function createSwitch(ctx) {
  return createController(ctx, metaSwitch, {
    rounds: lightSets.length,
    reset(s, i) { s.mask = lightSets[i].reduce(lightFlip, 511); },
    valid(s) { return integer(s.mask, 0, 511) && (s.mode !== 'won' || s.mask === 511); },
    tap(s, x, z, complete) { const i = indexAt(x, z, 3, 3, 2.6, .2); if (i < 0) return; s.mask = lightFlip(s.mask, i); s.moves++; if (s.mask === 511) complete(); },
    draw(v, s) {
      for (let i = 0; i < 9; i++) { const p = at(i, 3, 3, 2.6, .2), on = !!(s.mask & (1 << i)); tile(v, on ? '#d6c3ed' : '#77799c', p.x, p.z, 2.32, .22); v.piece('cyl', '#77759e', p.x, .21, p.z, .78, .18, .78); for (let j = 0; j < 5; j++) { const a = j * Math.PI * 2 / 5; v.piece('ball', on ? '#ffe3b2' : '#9791ad', p.x + Math.cos(a) * .36, .46, p.z + Math.sin(a) * .36, .27, .12, .19, -a); } glow(v, on ? '#fff9dc' : '#b4abc2', p.x, p.z, .22); }
    },
    hud(s) { const n = s.mask.toString(2).split('1').length - 1; return { primary: `CONSTELLATION ${s.level} / ${lightSets.length}`, secondary: `${n} / 9 LANTERNS LIT`, hint: 'Each tap also changes its neighbors.' }; },
  });
}

const metaDuos = { id: 'dream-duos', title: 'Dream Duos', hero: 'Fenn the fox', animal: 'fox', tagline: 'Find the dreams that belong together.', instructions: 'Tap two sleeping dream tiles to reveal them. Find every matching pair. The dreams grow more numerous each round.', background: '#667593', accent: '#d0b6d6' };
const pairCounts = [3, 5, 8];
function shuffledDeck(count, seed, level) {
  const deck = Array.from({ length: count * 2 }, (_, i) => i % count);
  let random = ((seed >>> 0) ^ Math.imul(level + 1, 2654435761)) >>> 0;
  for (let i = deck.length - 1; i > 0; i--) { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; const j = random % (i + 1); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
}
function createDuos(ctx) {
  const seed = Number.isInteger(ctx.seed) ? ctx.seed >>> 0 : 2468;
  return createController(ctx, metaDuos, {
    rounds: pairCounts.length,
    reset(s, i) { s.seed ??= seed; s.deck = shuffledDeck(pairCounts[i], s.seed, i); s.matched = []; s.flipped = []; s.delay = 0; },
    valid(s) {
      const n = pairCounts[s.level - 1], expected = shuffledDeck(n, s.seed, s.level - 1);
      if (!integer(s.seed, 0, 0xffffffff) || !Array.isArray(s.deck) || s.deck.length !== 2 * n || s.deck.some((v, i) => v !== expected[i]) || !Array.isArray(s.matched) || !Array.isArray(s.flipped) || s.matched.length > 2*n || s.flipped.length > 2 || new Set([...s.matched, ...s.flipped]).size !== s.matched.length + s.flipped.length) return false;
      if (![...s.matched, ...s.flipped].every(i => integer(i, 0, 2*n-1)) || typeof s.delay !== 'number' || !Number.isFinite(s.delay) || s.delay < 0 || s.delay > 1) return false;
      const counted = Array.from({length:n},(_, id)=>s.matched.filter(i => s.deck[i] === id).length);
      return counted.every(k => k === 0 || k === 2) && (s.flipped.length === 2 ? s.delay > 0 && s.deck[s.flipped[0]] !== s.deck[s.flipped[1]] : s.delay === 0) && (s.mode !== 'won' || s.matched.length === 2*n);
    },
    tap(s, x, z, complete) {
      if (s.flipped.length >= 2) return;
      const rows = Math.ceil(s.deck.length / 4), index = indexAt(x, z, 4, rows, 2.05, .3);
      if (index < 0 || index >= s.deck.length || s.matched.includes(index) || s.flipped.includes(index)) return;
      s.flipped.push(index); s.moves++;
      if (s.flipped.length === 2) {
        if (s.deck[s.flipped[0]] === s.deck[s.flipped[1]]) { s.matched.push(...s.flipped); s.flipped = []; if (s.matched.length === s.deck.length) complete(); }
        else s.delay = .85;
      }
    },
    tick(s, dt, complete, mark) { if (s.delay > 0) { s.delay = Math.max(0, s.delay - dt); if (s.delay === 0) s.flipped = []; mark(); } },
    draw(v, s) {
      const rows = Math.ceil(s.deck.length / 4);
      for (let i = 0; i < s.deck.length; i++) { const p = at(i, 4, rows, 2.05, .3), face = s.flipped.includes(i) || s.matched.includes(i); tile(v, face ? '#fff0dc' : '#8d91b1', p.x, p.z, 1.8, .25); if (face) { const value = s.deck[i]; v.piece(value % 3 === 0 ? 'oct' : value % 3 === 1 ? 'ball' : 'cyl', colorSet[value], p.x, .56, p.z, .48, .42, .48); v.piece('ring', '#fff2ca', p.x, .27, p.z, .66); } else { v.piece('oct', '#dfc9ea', p.x, .42, p.z, .20, .20, .20); } }
    },
    hud(s) { return { primary: `DREAM ${s.level} / ${pairCounts.length}`, secondary: `${s.matched.length / 2} / ${s.deck.length / 2} PAIRS`, hint: 'Find the matching sleeping dreams.' }; },
  });
}

const metaFlock = { id: 'flock-shift', title: 'Flock Shift', hero: 'Kiko the pigeon', animal: 'pigeon', tagline: 'Turn little corners into a whole picture.', instructions: 'Tap a glowing ring to rotate its four neighboring stones. Restore the jewel mosaic to the small guide along the bottom.', background: '#889fba', accent: '#d8e7e5' };
const scrambles = [[[0,0]], [[0,0],[1,1]], [[0,0],[1,1],[0,1]], [[0,0],[1,1],[0,1],[1,0]]];
function turnCorner(tiles, row, col) { const p = [row*3+col, row*3+col+1, (row+1)*3+col+1, (row+1)*3+col], last = tiles[p[3]]; for(let i=3;i>0;i--) tiles[p[i]] = tiles[p[i-1]]; tiles[p[0]] = last; }
function createFlock(ctx) {
  return createController(ctx, metaFlock, {
    rounds: scrambles.length,
    reset(s, i) { s.tiles = [1,2,3,4,5,6,7,8,9]; for (const [row, col] of scrambles[i]) turnCorner(s.tiles, row, col); },
    valid(s) { return Array.isArray(s.tiles) && s.tiles.length === 9 && new Set(s.tiles).size === 9 && s.tiles.every(v => integer(v, 1, 9)) && (s.mode !== 'won' || s.tiles.every((v, i) => v === i + 1)); },
    tap(s, x, z, complete) {
      if (Math.abs(x) < .35 || Math.abs(z - .05) < .35 || Math.abs(x) > 2.45 || Math.abs(z - .05) > 2.45) return;
      const col = x < 0 ? 0 : 1, row = z < .05 ? 0 : 1; turnCorner(s.tiles, row, col); s.moves++;
      if (s.tiles.every((v, i) => v === i + 1)) complete();
    },
    draw(v, s) {
      for (let i = 0; i < 9; i++) { const p = at(i, 3, 3, 2.3, .05); tile(v, '#f7ebdb', p.x, p.z, 2.12, .18); v.piece('oct', colorSet[s.tiles[i]-1], p.x, .42, p.z, .70, .28, .70); pips(v, s.tiles[i], p.x, .74, p.z, .19, .07); }
      for (const x of [-1.15, 1.15]) for (const z of [-1.10, 1.20]) { v.piece('cyl', '#fbefcc', x, .69, z, .29, .11, .29); v.piece('ring', '#d0a063', x, .78, z, .22); }
      for (let i=0;i<9;i++) { const p=at(i,3,3,.70,4.48); v.piece('box', colorSet[i], p.x, .1, p.z, .63, .13, .63); pips(v, i+1, p.x, .22, p.z, .15, .045); }
    },
    hud(s) { return { primary: `MOSAIC ${s.level} / ${scrambles.length}`, secondary: `${s.moves} TURNS`, hint: 'Tap a ring; match the little guide below.' }; },
  });
}

const metaKelp = { id: 'kelp-kitchen', title: 'Kelp Kitchen', hero: 'Mallow the snail', animal: 'snail', tagline: 'Sort a little sea of ingredients.', instructions: 'Tap a jar, then another to pour its top ingredient. You can pour onto the same color or into an empty jar. Sort each color into its own full jar.', background: '#7eaaa2', accent: '#d1e9d0' };
const recipes = [
  { cap: 2, jars: [[1,2], [2,1], [], []] },
  { cap: 2, jars: [[1,2], [2,3], [3,1], [], []] },
  { cap: 3, jars: [[1,2,3], [2,3,1], [3,1,2], [], []] },
];
function createKelp(ctx) {
  const centers = n => n === 4 ? [-3.3, -1.1, 1.1, 3.3] : [-4, -2, 0, 2, 4];
  return createController(ctx, metaKelp, {
    rounds: recipes.length,
    reset(s, i) { s.jars = clone(recipes[i].jars); s.selected = -1; },
    valid(s) {
      const recipe = recipes[s.level-1], count = recipe.jars.length, maxColor = Math.max(...recipe.jars.flat());
      if (!Array.isArray(s.jars) || s.jars.length !== count || !integer(s.selected, -1, count-1) || s.jars.some(j=>!Array.isArray(j)||j.length>recipe.cap)) return false;
      const items=s.jars.flat();
      return items.length===recipe.jars.flat().length && items.every(x=>integer(x,1,maxColor)) && (s.selected < 0 || s.jars[s.selected].length > 0) && Array.from({length:maxColor},(_,i)=>items.filter(x=>x===i+1).length).every(n=>n===recipe.cap) && (s.mode!=='won'||s.jars.every(j=>!j.length||j.length===recipe.cap&&j.every(x=>x===j[0])));
    },
    tap(s, x, z, complete) {
      if (Math.abs(z) > 3.5) return;
      const recipe=recipes[s.level-1], target=centers(s.jars.length).findIndex(c=>Math.abs(c-x)<.85); if(target<0)return;
      if(s.selected<0) { if(s.jars[target].length)s.selected=target; return; }
      if(s.selected===target){s.selected=-1;return;}
      const from=s.jars[s.selected],to=s.jars[target],color=from.at(-1);
      if(color && to.length<recipe.cap && (!to.length||to.at(-1)===color)) { while(from.at(-1)===color&&to.length<recipe.cap)to.push(from.pop()); s.moves++; }
      s.selected=-1;
      if(s.jars.every(j=>!j.length||j.length===recipe.cap&&j.every(v=>v===j[0])))complete();
    },
    draw(v,s) {
      const recipe=recipes[s.level-1];
      s.jars.forEach((jar,i)=>{const x=centers(s.jars.length)[i];v.piece('cyl','#c8e3d5',x,.12,0,.78,.2,.78);v.piece('cyl','#e7f3df',x,.32,0,.69,.25,.69);for(let j=0;j<recipe.cap;j++){const z=((recipe.cap-1)/2-j)*1.15;v.piece('cyl','#a3c6b8',x,.20,z,.65,.13,.52);if(j<jar.length)v.piece('ball',[null,'#ee9f90','#f5d578','#9cbfe6'][jar[j]],x,.52,z,.50,.30,.43);}if(s.selected===i)v.piece('ring','#fff0a3',x,.24,0,.9);});
    },
    hud(s){const recipe=recipes[s.level-1], sorted=s.jars.filter(j=>j.length===recipe.cap&&j.every(v=>v===j[0])).length;return{primary:`RECIPE ${s.level} / ${recipes.length}`,secondary:`${sorted} COLORS SORTED`,hint:'Tap a jar, then tap where to pour.'};},
  });
}

export const games = [
  { ...metaBurrow, create: createBurrow },
  { ...metaMoon, create: createMoon },
  { ...metaStack, create: createStack },
  { ...metaSwitch, create: createSwitch },
  { ...metaDuos, create: createDuos },
  { ...metaFlock, create: createFlock },
  { ...metaKelp, create: createKelp },
];
