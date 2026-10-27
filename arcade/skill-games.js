// Six small worlds. Game rules stay independent of the renderer, and every
// moving prop is reused rather than allocating geometry during play.
const clone = value => JSON.parse(JSON.stringify(value));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const finite = (n, min = -1e6, max = 1e6) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
const modes = ['playing', 'won', 'lost'];
const object = value => value && typeof value === 'object' && !Array.isArray(value);

function stage(ctx) {
  const { THREE, root } = ctx;
  const geometries = {
    sphere: new THREE.SphereGeometry(1, 12, 9),
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 24),
    cone: new THREE.ConeGeometry(1, 1, 12),
    torus: new THREE.TorusGeometry(1, .06, 6, 32),
    diamond: new THREE.OctahedronGeometry(1),
  };
  const materials = new Map();
  function material(color) {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: .68, metalness: .06 }));
    return materials.get(color);
  }
  function mesh(parent, shape, color, x, y, z, sx = 1, sy = sx, sz = sx) {
    const result = new THREE.Mesh(geometries[shape], material(color));
    result.position.set(x, y, z); result.scale.set(sx, sy, sz); parent.add(result); return result;
  }
  const ball = (p, color, x, y, z, sx = 1, sy = sx, sz = sx) => mesh(p, 'sphere', color, x, y, z, sx, sy, sz);
  const block = (p, color, x, y, z, sx, sy, sz) => mesh(p, 'box', color, x, y, z, sx, sy, sz);
  const disc = (p, color, x, y, z, r, h = .15) => mesh(p, 'cylinder', color, x, y, z, r, h, r);
  const ring = (p, color, x, y, z, r) => { const m = mesh(p, 'torus', color, x, y, z, r); m.rotation.x = Math.PI / 2; return m; };
  const group = () => { const g = new THREE.Group(); root.add(g); return g; };
  function dispose() {
    Object.values(geometries).forEach(g => g.dispose());
    materials.forEach(m => m.dispose());
    root.clear();
  }
  return { THREE, root, ball, block, disc, ring, mesh, group, dispose };
}

function island(s, color, edge, shape = 'round') {
  if (shape === 'square') {
    s.block(s.root, edge, 0, -.24, 0, 11.5, .42, 10.5);
    s.block(s.root, color, 0, -.015, 0, 11.15, .12, 10.15);
    for (let n = 0; n < 8; n++) for (const side of [-1, 1]) {
      s.ball(s.root, edge, -4.7 + n * 1.35, .08, side * 4.94, .10, .07, .10);
    }
  } else {
    s.disc(s.root, edge, 0, -.24, 0, 5.8, .42);
    s.disc(s.root, color, 0, -.015, 0, 5.65, .12);
    for (let n = 0; n < 16; n++) {
      const a = n * Math.PI * 2 / 16;
      s.ball(s.root, edge, Math.cos(a) * 5.48, .08, Math.sin(a) * 5.48, .10, .07, .10);
    }
  }
  // Small floating jewels frame the board on tall and wide phone screens.
  for (const [x, z] of [[-4, -9], [0, -8.6], [4, -9], [-4, 9], [0, 8.6], [4, 9], [-9, -2], [-9, 2], [9, -2], [9, 2]]) {
    const jewel = s.mesh(s.root, 'diamond', edge, x, .25, z, .13, .2, .13);
    jewel.rotation.y = Math.PI / 4;
  }
}

// All six heroes are individually modeled and deliberately differ in species,
// proportions and accessories. Their front faces look towards the player.
function hero(s, kind, x = -4.1, z = 4.15, size = 1.28) {
  const g = s.group(); g.name = 'Hero'; g.position.set(x, .07, z); g.scale.setScalar(size);
  const { ball, block, mesh } = s;
  const eye = (xx, yy = 1.15, zz = .36) => ball(g, '#1e2633', xx, yy, zz, .065, .085, .045);
  if (kind === 'penguin') {
    ball(g, '#314457', 0, .72, 0, .51, .72, .4); ball(g, '#fff2d8', 0, .64, .28, .36, .49, .16);
    ball(g, '#314457', 0, 1.30, 0, .43, .40, .37); eye(-.16, 1.34, .34); eye(.16, 1.34, .34);
    const beak = mesh(g, 'cone', '#f3ba61', 0, 1.14, .45, .14, .27, .14); beak.rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) { ball(g, '#314457', side * .49, .73, 0, .15, .43, .22).rotation.z = side * .33; ball(g, '#e9a55c', side * .25, .12, .23, .22, .1, .3); }
    s.disc(g, '#f3ba61', 0, 1.68, -.08, .35, .07); s.disc(g, '#c87a6d', 0, 1.79, -.08, .23, .22);
  } else if (kind === 'koala') {
    ball(g, '#a5b8bc', 0, .66, 0, .47, .60, .38); ball(g, '#d6e4df', 0, .59, .29, .27, .36, .13);
    ball(g, '#a5b8bc', 0, 1.30, 0, .48, .44, .38);
    for (const side of [-1, 1]) { ball(g, '#a5b8bc', side * .55, 1.42, 0, .29, .32, .18); ball(g, '#e1afb5', side * .55, 1.43, .16, .18, .20, .06); eye(side * .16, 1.35, .34); }
    ball(g, '#354754', 0, 1.18, .39, .13, .18, .09); block(g, '#f2cc81', 0, .27, .42, .60, .15, .16);
  } else if (kind === 'stork') {
    ball(g, '#f5f1dd', 0, .70, 0, .46, .42, .34); ball(g, '#f5f1dd', .05, 1.18, 0, .18, .52, .18); ball(g, '#f5f1dd', .06, 1.54, .02, .25, .25, .22);
    eye(-.01, 1.58, .21); eye(.15, 1.58, .21); const bill = mesh(g, 'cone', '#dc8b58', .08, 1.45, .36, .11, .42, .11); bill.rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) { ball(g, '#bfcec5', side * .4, .75, 0, .20, .35, .20).rotation.z = side * .7; block(g, '#d9895d', side * .18, .22, .06, .065, .42, .065); }
    block(g, '#a86762', 0, .82, .35, .38, .33, .13);
  } else if (kind === 'mole') {
    ball(g, '#806566', 0, .68, 0, .55, .60, .43); ball(g, '#e3bd9e', 0, .56, .31, .31, .32, .15);
    ball(g, '#806566', 0, 1.25, 0, .47, .43, .40); eye(-.15, 1.29, .36); eye(.15, 1.29, .36); ball(g, '#e9aaa5', 0, 1.15, .39, .10, .08, .07);
    for (const side of [-1, 1]) { ball(g, '#d29a8c', side * .54, .6, .13, .25, .18, .27); s.ring(g, '#f3d286', side * .15, 1.35, .38, .13).rotation.x = 0; }
    s.disc(g, '#fff0dc', 0, 1.69, 0, .42, .12); s.disc(g, '#fff0dc', 0, 1.83, 0, .27, .25);
  } else if (kind === 'bat') {
    for (const side of [-1, 1]) { const wing = mesh(g, 'cone', '#a48bc4', side * .63, .88, 0, .41, .8, .14); wing.rotation.z = side * 1.2; }
    ball(g, '#bcaad6', 0, .72, 0, .39, .48, .34); ball(g, '#d7c9e7', 0, 1.25, 0, .43, .39, .34);
    for (const side of [-1, 1]) { const ear = mesh(g, 'cone', '#bcaad6', side * .27, 1.64, 0, .15, .42, .12); ear.rotation.z = side * -.22; eye(side * .14, 1.28, .32); }
    ball(g, '#edb6c4', 0, 1.14, .36, .08, .07, .06);
  } else if (kind === 'raccoon') {
    ball(g, '#a48e7d', 0, .65, 0, .46, .55, .39); ball(g, '#eee3cf', 0, .6, .31, .26, .34, .14);
    ball(g, '#b6a392', 0, 1.23, 0, .47, .42, .38);
    for (const side of [-1, 1]) {
      const ear = mesh(g, 'cone', '#897b75', side * .31, 1.6, -.02, .19, .42, .16); ear.rotation.z = side * -.2;
      ball(g, '#665d61', side * .17, 1.28, .31, .18, .14, .08); ball(g, '#fff7e8', side * .17, 1.3, .385, .06, .07, .03); eye(side * .17, 1.3, .41);
      ball(g, '#b6a392', side * .4, .57, .24, .14, .25, .14);
    }
    ball(g, '#4a454d', 0, 1.12, .39, .09, .07, .06);
    for (let i = 0; i < 4; i++) ball(g, i % 2 ? '#645d62' : '#b9a08c', -.43 - i * .12, .36, -.12 - i * .05, .18 - i * .025, .17, .16);
  }
  return g;
}

function envelope(id, state, clear = {}) {
  return { schema: 1, id, ...clone(state), ...clear };
}
function restoreState(id, state, value, validate) {
  try {
    if (!object(value) || value.schema !== 1 || value.id !== id || !modes.includes(value.mode) || !validate(value)) return false;
    const clean = clone(value); delete clean.schema; delete clean.id;
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, clean); return true;
  } catch { return false; }
}
function safeCoordinates(x, z) { return finite(x, -20, 20) && finite(z, -20, 20); }

function tidehook(ctx) {
  const s = stage(ctx); island(s, '#559bb0', '#34758c'); hero(s, 'penguin');
  // Pond, fishing rod, fish and an actual dangling hook.
  s.disc(s.root, '#74c5cc', .5, .10, -.2, 4.55, .11);
  for (let i = 0; i < 6; i++) s.ring(s.root, '#a6e6df', -3.2 + i * 1.3, .18, -3.5 + (i % 2) * .34, .26);
  s.block(s.root, '#b98668', -.3, .5, -4.9, 8.0, .12, .18);
  const line = s.block(s.root, '#fff1c6', 0, .75, -4, .035, .04, 1);
  const hook = s.ring(s.root, '#fff2ce', 0, .79, -4, .17);
  const fish = s.group();
  s.ball(fish, '#fbce75', 0, .38, 0, .58, .25, .32);
  const tail = s.mesh(fish, 'cone', '#ff9f80', -.58, .34, 0, .28, .48, .2); tail.rotation.z = Math.PI / 2;
  s.ball(fish, '#31566c', .3, .55, .18, .045, .06, .05);
  s.ring(s.root, '#dbf5e3', 0, .22, 0, .55);
  const id = 'tidehook';
  const state = { mode: 'playing', time: 0, caught: 0, misses: 0, holding: false, x: 0, depth: -4.25, fishX: 0, fishZ: 0 };
  function update(dt) {
    if (state.mode !== 'playing' || !finite(dt, 0, .051)) return;
    state.time += dt;
    state.fishX = Math.sin(state.time * .9 + state.caught * .7) * 1.65;
    state.fishZ = Math.sin(state.time * .67 + state.caught * 1.1) * 1.45 + (state.caught % 3 - 1) * .5;
    if (state.holding) {
      state.depth += dt * (3.0 + state.caught * .16);
      if (state.depth > 4.4) { state.holding = false; state.depth = -4.25; state.misses++; if (state.misses >= 4) state.mode = 'lost'; }
    }
  }
  function pointer(type, x, z) {
    if (state.mode !== 'playing' || !safeCoordinates(x, z)) return;
    if (type === 'down' && !state.holding) { state.holding = true; state.depth = -4.25; state.x = clamp(x, -4, 4); }
    else if (type === 'move' && state.holding) state.x = clamp(x, -4, 4);
    else if (type === 'cancel') { state.holding = false; state.depth = -4.25; }
    else if (type === 'up' && state.holding) {
      state.holding = false;
      if (Math.abs(state.x - state.fishX) < .85 && Math.abs(state.depth - state.fishZ) < .6) {
        state.caught++; ctx.sound?.(440 + state.caught * 35, .16); if (state.caught === 8) state.mode = 'won';
      } else { state.misses++; ctx.sound?.(170, .15); if (state.misses >= 4) state.mode = 'lost'; }
      state.depth = -4.25;
    }
  }
  function sync() {
    fish.position.set(state.fishX, .12, state.fishZ);
    fish.rotation.y = Math.sin(state.time * .9) > 0 ? 0 : Math.PI;
    hook.position.set(state.x, .78, state.depth); const length = Math.max(.05, state.depth + 4.65);
    line.position.set(state.x, .72, -4.65 + length / 2); line.scale.z = length;
  }
  return { state, update, pointer, sync, dispose: s.dispose,
    snapshot: () => envelope(id, state, { holding: false, depth: -4.25 }),
    restore(value) { return restoreState(id, state, value, v => finite(v.time, 0, 1e7) && integer(v.caught, 0, 8) && integer(v.misses, 0, 4) && v.holding === false && v.depth === -4.25 && finite(v.x, -4, 4) && finite(v.fishX, -1.65, 1.65) && finite(v.fishZ, -2, 2) && (v.mode === 'won' ? v.caught === 8 : v.mode === 'lost' ? v.misses === 4 : v.caught < 8 && v.misses < 4)); },
    hud: () => ({ primary: `${state.caught} / 8 FISH`, secondary: `${4 - state.misses} CHANCES`, hint: 'Hold to lower. Slide to follow. Release on the fish.' }) };
}

const PHRASES = [[0, 1, 2], [2, 0, 1, 2], [1, 2, 0, 2, 1]];
function bellwood(ctx) {
  const s = stage(ctx); island(s, '#c4d9c1', '#7a9e85'); hero(s, 'koala');
  const colors = ['#ec9a8d', '#f5cc7e', '#8fc9c5'], frequencies = [330, 415, 494], xs = [-3, 0, 3], pads = [];
  for (let i = 0; i < 3; i++) {
    s.disc(s.root, '#799b87', xs[i], .16, 0, 1.35, .32);
    pads.push(s.disc(s.root, colors[i], xs[i], .40, 0, 1.15, .24));
    s.ring(s.root, '#fff2d6', xs[i], .54, 0, .8);
    for (let j = 0; j <= i; j++) s.ball(s.root, '#fff7df', xs[i] + (j - i / 2) * .31, .58, 0, .11, .07, .11);
  }
  const id = 'bellwood-beats';
  const state = { mode: 'playing', round: 0, phase: 'ready', playback: 0, input: 0, mistakes: 0, lit: -1, lastCue: -1, pressed: -1 };
  function begin() { state.phase = 'show'; state.playback = 0; state.input = 0; state.lit = -1; state.lastCue = -1; }
  function update(dt) {
    if (state.mode !== 'playing' || state.phase !== 'show' || !finite(dt, 0, .051)) return;
    state.playback += dt;
    const phrase = PHRASES[state.round], index = Math.floor(state.playback / .72);
    if (index >= phrase.length) { state.phase = 'repeat'; state.lit = -1; return; }
    state.lit = state.playback % .72 < .44 ? phrase[index] : -1;
    if (index !== state.lastCue) { state.lastCue = index; ctx.sound?.(frequencies[phrase[index]], .22); }
  }
  function pointer(type, x, z) {
    if (state.mode !== 'playing' || !safeCoordinates(x, z)) return;
    const index = Math.abs(z) <= 1.5 ? xs.findIndex(px => Math.abs(px - x) < 1.4) : -1;
    if (type === 'down') { state.pressed = state.phase === 'ready' ? 3 : state.phase === 'repeat' ? index : -1; return; }
    if (type === 'cancel') { state.pressed = -1; return; }
    if (type !== 'up') return;
    const pressed = state.pressed; state.pressed = -1;
    if (state.phase === 'ready' && pressed === 3) { begin(); return; }
    if (state.phase !== 'repeat' || index < 0 || pressed !== index) return;
    ctx.sound?.(frequencies[index], .18);
    if (index !== PHRASES[state.round][state.input]) {
      state.mistakes++; state.input = 0;
      if (state.mistakes >= 4) state.mode = 'lost'; else begin();
    } else if (++state.input === PHRASES[state.round].length) {
      if (state.round === PHRASES.length - 1) state.mode = 'won'; else { state.round++; state.phase = 'ready'; state.input = 0; }
    }
  }
  function sync() {
    pads.forEach((pad, i) => {
      const lit = state.lit === i;
      // Each cue changes size and brightness, so the song remains easy to
      // follow on a small screen even when the player has sound turned off.
      pad.scale.set(lit ? 1.34 : 1.15, lit ? .42 : .24, lit ? 1.34 : 1.15);
      pad.position.y = lit ? .50 : .40;
      pad.material.emissive.set(colors[i]);
      pad.material.emissiveIntensity = lit ? 1 : 0;
    });
  }
  return { state, update, pointer, sync, dispose: s.dispose,
    snapshot: () => envelope(id, state, { pressed: -1 }),
    restore(value) { return restoreState(id, state, value, v => v.pressed === -1 && integer(v.round, 0, 2) && ['ready', 'show', 'repeat'].includes(v.phase) && finite(v.playback, 0, 10) && integer(v.input, 0, PHRASES[v.round].length) && integer(v.mistakes, 0, 4) && integer(v.lit, -1, 2) && integer(v.lastCue, -1, 5) && (v.mode === 'won' ? v.round === 2 && v.input === PHRASES[2].length : v.mode === 'lost' ? v.mistakes === 4 : v.mistakes < 4 && v.input < PHRASES[v.round].length)); },
    hud: () => ({ primary: `SONG ${state.round + 1} / 3`, secondary: `${4 - state.mistakes} CHANCES`, hint: state.phase === 'ready' ? 'Tap anywhere to hear the next song.' : state.phase === 'show' ? 'Watch and listen to the glowing bells.' : 'Tap the bells in the same order.' }) };
}

const PARCELS = [0, 2, 1, 0, 1, 2, 0, 2, 1];
function parcelParade(ctx) {
  const s = stage(ctx); island(s, '#c5d8e4', '#8da9b5', 'square'); hero(s, 'stork');
  const colors = ['#ef9b8b', '#f2cd79', '#91bebc'], xs = [-3.4, 0, 3.4];
  s.block(s.root, '#eaf0db', 0, .12, .45, 2.15, .18, 7.7);
  for (let n = 0; n < 9; n++) s.block(s.root, '#a8c6bf', 0, .23, -3.1 + n * .92, 1.95, .04, .1);
  for (let i = 0; i < 3; i++) {
    s.block(s.root, '#f5e9d8', xs[i], .28, -3.65, 2.2, .5, 1.25);
    s.block(s.root, colors[i], xs[i], .57, -3.65, 1.95, .1, 1);
    for (let j = 0; j <= i; j++) s.ball(s.root, '#fff7e7', xs[i] + (j - i / 2) * .3, .65, -3.65, .09, .06, .09);
  }
  const parcel = s.group(), boxes = colors.map(color => s.block(parcel, color, 0, .62, 0, .95, .75, .95));
  s.block(parcel, '#fff3de', 0, 1.03, 0, .16, .08, .97); s.block(parcel, '#fff3de', 0, 1.04, 0, .97, .08, .16);
  const id = 'parcel-parade';
  const state = { mode: 'playing', delivered: 0, mistakes: 0, z: 3.1, dragging: false, dragX: 0, dragZ: 3.1 };
  function update(dt) {
    if (state.mode !== 'playing' || !finite(dt, 0, .051)) return;
    if (!state.dragging) {
      state.z -= dt * (.65 + state.delivered * .06);
      if (state.z < -2.85) { state.mistakes++; state.z = 3.1; if (state.mistakes >= 4) state.mode = 'lost'; }
    }
  }
  function pointer(type, x, z) {
    if (state.mode !== 'playing' || !safeCoordinates(x, z)) return;
    if (type === 'down' && Math.hypot(x, z - state.z) < 1.15) { state.dragging = true; state.dragX = x; state.dragZ = z; }
    else if (type === 'move' && state.dragging) { state.dragX = clamp(x, -5.2, 5.2); state.dragZ = clamp(z, -5.2, 5.2); }
    else if (type === 'cancel') state.dragging = false;
    else if (type === 'up' && state.dragging) {
      state.dragging = false;
      const slot = xs.findIndex(px => Math.abs(x - px) < 1.3 && Math.abs(z + 3.65) < 1.0);
      if (slot >= 0) {
        if (slot === PARCELS[state.delivered]) { state.delivered++; ctx.sound?.(440 + state.delivered * 24, .15); if (state.delivered === PARCELS.length) state.mode = 'won'; }
        else { state.mistakes++; ctx.sound?.(170, .15); if (state.mistakes >= 4) state.mode = 'lost'; }
        state.z = 3.1;
      }
    }
  }
  function sync() {
    boxes.forEach((box, i) => { box.visible = i === PARCELS[Math.min(state.delivered, PARCELS.length - 1)]; });
    parcel.position.set(state.dragging ? state.dragX : 0, state.dragging ? .3 : 0, state.dragging ? state.dragZ : state.z);
  }
  return { state, update, pointer, sync, dispose: s.dispose,
    snapshot: () => envelope(id, state, { dragging: false, dragX: 0, dragZ: state.z }),
    restore(value) { return restoreState(id, state, value, v => integer(v.delivered, 0, PARCELS.length) && integer(v.mistakes, 0, 4) && finite(v.z, -2.85, 3.1) && v.dragging === false && v.dragX === 0 && v.dragZ === v.z && (v.mode === 'won' ? v.delivered === PARCELS.length : v.mode === 'lost' ? v.mistakes === 4 : v.delivered < PARCELS.length && v.mistakes < 4)); },
    hud: () => ({ primary: `${state.delivered} / ${PARCELS.length} DELIVERED`, secondary: `${4 - state.mistakes} CHANCES`, hint: 'Drag each parcel to its matching colored depot.' }) };
}

function wobbleBakery(ctx) {
  const s = stage(ctx); island(s, '#e8cfb4', '#c68c82', 'square'); hero(s, 'mole');
  // Big wind vane and rolling, springy cake on a movable platter.
  for (let i = 0; i < 7; i++) s.block(s.root, '#f5e5ca', -4.2 + i * 1.4, .10, 2.7, 1.25, .11, 1.6);
  const tray = s.group(), cake = s.group();
  s.block(tray, '#986e70', 0, .44, 2.7, 3.05, .23, 1.45);
  s.block(tray, '#f4ddbf', 0, .59, 2.7, 2.8, .12, 1.3);
  s.disc(cake, '#c78876', 0, .91, 2.7, .65, .62); s.disc(cake, '#f9dec3', 0, 1.23, 2.7, .69, .14);
  for (let i = 0; i < 5; i++) s.ball(cake, '#ec9aa8', Math.cos(i * Math.PI * .4) * .4, 1.36, 2.7 + Math.sin(i * Math.PI * .4) * .4, .12, .11, .12);
  s.ball(cake, '#f5c76c', 0, 1.43, 2.7, .15, .14, .15);
  const clouds = [];
  for (let i = 0; i < 5; i++) clouds.push(s.ball(s.root, '#fff3dd', -4 + i * 2, .33, -2.9 - (i % 2), .7, .18, .26));
  const id = 'wobble-bakery';
  const state = { mode: 'playing', time: 0, tray: 0, target: 0, cake: 0, speed: 0, slips: 0, danger: 0, dragging: false };
  function update(dt) {
    if (state.mode !== 'playing' || !finite(dt, 0, .051)) return;
    state.time = Math.min(30, state.time + dt);
    state.tray += clamp(state.target - state.tray, -7 * dt, 7 * dt);
    const wind = (1.7 + state.time / 30) * Math.sin(state.time * .73) + .65 * Math.sin(state.time * 1.47);
    state.speed = clamp(state.speed + (wind - state.speed * .72) * dt, -3.3, 3.3);
    state.cake += state.speed * dt;
    if (Math.abs(state.cake) > 4.1) { state.cake = clamp(state.cake, -4.1, 4.1); state.speed *= -.45; }
    if (Math.abs(state.cake - state.tray) > 1.18) state.danger += dt; else state.danger = Math.max(0, state.danger - dt * 2);
    if (state.danger >= .45) {
      state.slips++; state.danger = 0; state.cake = state.tray; state.speed = 0; ctx.sound?.(180, .18);
      if (state.slips >= 3) state.mode = 'lost';
    }
    if (state.time >= 30 && state.mode === 'playing') state.mode = 'won';
  }
  function pointer(type, x, z) {
    if (state.mode !== 'playing' || !safeCoordinates(x, z)) return;
    if (type === 'down') { state.dragging = true; state.target = clamp(x, -4.1, 4.1); }
    else if (type === 'move' && state.dragging) state.target = clamp(x, -4.1, 4.1);
    else if (type === 'up' || type === 'cancel') state.dragging = false;
  }
  function sync() { tray.position.x = state.tray; cake.position.x = state.cake; cake.rotation.z = clamp((state.cake - state.tray) * -.17, -.3, .3); clouds.forEach((m, i) => { m.position.x = ((-4 + i * 2 + state.time * .24 + 5) % 10) - 5; }); }
  return { state, update, pointer, sync, dispose: s.dispose,
    snapshot: () => envelope(id, state, { dragging: false }),
    restore(value) { return restoreState(id, state, value, v => finite(v.time, 0, 30) && finite(v.tray, -4.1, 4.1) && finite(v.target, -4.1, 4.1) && finite(v.cake, -4.1, 4.1) && finite(v.speed, -3.3, 3.3) && integer(v.slips, 0, 3) && finite(v.danger, 0, .45) && v.dragging === false && (v.mode === 'won' ? v.time === 30 && v.slips < 3 : v.mode === 'lost' ? v.slips === 3 : v.time < 30 && v.slips < 3)); },
    hud: () => ({ primary: `${Math.floor(state.time)} / 30 SECONDS`, secondary: `${3 - state.slips} CHANCES`, hint: 'Slide the platter under the cake as the wind blows.' }) };
}

const MOTH_ROUTES = [
  { start: [-3, 2.6], end: [3.7, -2.8] }, { start: [2.8, 2.6], end: [-3.7, -2.8] },
  { start: [-2.8, 2.6], end: [1.2, -2.7] }, { start: [2.8, 2.6], end: [-1.2, -2.7] },
];
function mothlight(ctx) {
  const s = stage(ctx); island(s, '#34365f', '#252846');
  const bat = hero(s, 'bat', -4.4, 3.7, 1.0);
  const spotlight = s.ring(s.root, '#f5cd82', -4.4, .18, 3.7, 2.55);
  const moth = s.group();
  s.ball(moth, '#fff0bf', 0, .55, 0, .22, .16, .24);
  for (const side of [-1, 1]) s.ball(moth, '#eab6d4', side * .29, .55, 0, .30, .09, .25).rotation.y = side * .35;
  const flowers = MOTH_ROUTES.map(route => {
    const g = s.group(); g.position.set(route.end[0], .08, route.end[1]);
    s.disc(g, '#5c877d', 0, .05, 0, .8, .18);
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; s.ball(g, '#edb7cb', Math.cos(a) * .45, .24, Math.sin(a) * .45, .25, .12, .20); }
    s.ball(g, '#ffe3a4', 0, .32, 0, .25, .17, .25); return g;
  });
  const thorns = [{ x: -4.1, z: -.1 }, { x: 4.1, z: -.1 }];
  for (const thorn of thorns) { s.disc(s.root, '#5a6d68', thorn.x, .14, thorn.z, .62, .18); for (let j = 0; j < 5; j++) { const a = j * Math.PI * .4; const cone = s.mesh(s.root, 'cone', '#9ab79a', thorn.x + .34 * Math.cos(a), .52, thorn.z + .34 * Math.sin(a), .13, .65, .13); cone.rotation.z = Math.cos(a) * .25; } }
  const id = 'mothlight';
  const state = { mode: 'playing', delivered: 0, bumps: 0, lightX: -4.4, lightZ: 3.7, mothX: -3, mothZ: 2.6, dragging: false, time: 0 };
  function update(dt) {
    if (state.mode !== 'playing' || !finite(dt, 0, .051)) return;
    state.time += dt;
    const dx = state.lightX - state.mothX, dz = state.lightZ - state.mothZ, distance = Math.hypot(dx, dz);
    if (state.dragging && distance > .08 && distance < 2.65) { const step = Math.min(distance, dt * 2.05); state.mothX += dx / distance * step; state.mothZ += dz / distance * step; }
    if (thorns.some(thorn => Math.hypot(state.mothX - thorn.x, state.mothZ - thorn.z) < .62)) {
      state.bumps++; const start = MOTH_ROUTES[state.delivered].start; state.mothX = start[0]; state.mothZ = start[1]; ctx.sound?.(190, .16);
    }
    const end = MOTH_ROUTES[state.delivered].end;
    if (Math.hypot(state.mothX - end[0], state.mothZ - end[1]) < .65) {
      state.delivered++; ctx.sound?.(520 + state.delivered * 35, .22);
      if (state.delivered === MOTH_ROUTES.length) state.mode = 'won';
      else { const start = MOTH_ROUTES[state.delivered].start; state.mothX = start[0]; state.mothZ = start[1]; }
    }
  }
  function pointer(type, x, z) {
    if (state.mode !== 'playing' || !safeCoordinates(x, z)) return;
    if (type === 'down') { state.dragging = true; state.lightX = clamp(x, -5, 5); state.lightZ = clamp(z, -5, 5); }
    else if (type === 'move' && state.dragging) { state.lightX = clamp(x, -5, 5); state.lightZ = clamp(z, -5, 5); }
    else if (type === 'up' || type === 'cancel') state.dragging = false;
  }
  function sync() {
    bat.position.set(state.lightX, .1, state.lightZ); spotlight.position.set(state.lightX, .18, state.lightZ);
    moth.position.set(state.mothX, .12, state.mothZ); moth.rotation.y = Math.sin(state.time * 8) * .12;
    flowers.forEach((g, i) => { g.scale.setScalar(i < state.delivered ? 1 : i === state.delivered ? 1.13 : .72); });
  }
  return { state, update, pointer, sync, dispose: s.dispose,
    snapshot: () => envelope(id, state, { dragging: false }),
    restore(value) { return restoreState(id, state, value, v => integer(v.delivered, 0, 4) && integer(v.bumps, 0, 1e7) && finite(v.time, 0, 1e7) && finite(v.lightX, -5, 5) && finite(v.lightZ, -5, 5) && finite(v.mothX, -5, 5) && finite(v.mothZ, -5, 5) && v.dragging === false && (v.mode === 'won' ? v.delivered === 4 : v.mode === 'playing' && v.delivered < 4)); },
    hud: () => ({ primary: `${state.delivered} / 4 MOTHS HOME`, secondary: `${state.bumps} BUMPS`, hint: 'Drag Vesper near the moth. Lead it to the bright flower.' }) };
}

const VASES = [[1, 3, 2, 1], [2, 2, 3, 1], [1, 2, 3, 2]];
function cloudPotter(ctx) {
  const s = stage(ctx); island(s, '#d7c5df', '#ad93c0', 'square'); hero(s, 'raccoon');
  const rows = [-2.65, -1.05, .55, 2.15], bands = [], targets = [];
  s.block(s.root, '#b5a3c3', -2.4, .12, -.15, 4.1, .22, 6.9);
  s.block(s.root, '#f2d7cf', 2.0, .12, -.15, 4.1, .22, 6.9);
  for (let i = 0; i < 4; i++) {
    targets.push(s.block(s.root, '#fff0e1', -2.4, .32, rows[i], 1, .16, 1.28));
    bands.push(s.block(s.root, ['#d88f82', '#dc9c8b', '#e4ad96', '#e9baa2'][i], 2, .37, rows[i], 1, .35, 1.28));
    s.ring(s.root, '#fff4df', -4.45, .26, rows[i], .17);
  }
  const id = 'cloud-potter';
  const state = { mode: 'playing', round: 0, widths: [2, 2, 2, 2], moves: 0, pending: -1, originX: 0 };
  function update(dt) { if (!finite(dt, 0, .051)) return; }
  function pointer(type, x, z) {
    if (state.mode !== 'playing' || !safeCoordinates(x, z)) return;
    if (type === 'down') {
      const row = rows.findIndex(r => Math.abs(r - z) < .72);
      if (row >= 0 && x > -.1) { state.pending = row; state.originX = x; }
    } else if (type === 'cancel') state.pending = -1;
    else if (type === 'up' && state.pending >= 0) {
      const row = state.pending, amount = x - state.originX; state.pending = -1;
      if (Math.abs(amount) < .3) return;
      const next = clamp(state.widths[row] + (amount > 0 ? 1 : -1), 1, 3);
      if (next === state.widths[row]) return;
      state.widths[row] = next; state.moves++; ctx.sound?.(330 + row * 65, .14);
      if (state.widths.every((width, index) => width === VASES[state.round][index])) {
        if (state.round === VASES.length - 1) state.mode = 'won';
        else { state.round++; state.widths = [2, 2, 2, 2]; }
      }
    }
  }
  function sync() {
    for (let i = 0; i < 4; i++) {
      targets[i].scale.x = .5 + VASES[state.round][i] * .52;
      bands[i].scale.x = .5 + state.widths[i] * .52;
    }
  }
  return { state, update, pointer, sync, dispose: s.dispose,
    snapshot: () => envelope(id, state, { pending: -1, originX: 0 }),
    restore(value) { return restoreState(id, state, value, v => integer(v.round, 0, 2) && Array.isArray(v.widths) && v.widths.length === 4 && v.widths.every(n => integer(n, 1, 3)) && integer(v.moves, 0, 1e7) && v.pending === -1 && v.originX === 0 && (v.mode === 'won' ? v.round === 2 && v.widths.every((n, i) => n === VASES[2][i]) : v.mode === 'playing' && !v.widths.every((n, i) => n === VASES[v.round][i]))); },
    hud: () => ({ primary: `POT ${state.round + 1} / 3`, secondary: `${state.moves} SHAPES`, hint: 'Swipe each clay band left or right to match the white pot.' }) };
}

export const games = [
  { id: 'tidehook', title: 'Tidehook', hero: 'Nori the penguin', tagline: 'Catch a little shimmer.', instructions: 'Hold to lower the hook. Slide to follow the fish, then lift when the hook reaches it. Catch eight fish before four misses.', background: '#173d56', accent: '#bcece5', create: tidehook },
  { id: 'bellwood-beats', title: 'Bellwood Beats', hero: 'Bibi the koala', tagline: 'Listen. Remember. Play.', instructions: 'Tap to hear Bibi’s song. Watch the colored bells, then tap them back in the same order. Learn three songs.', background: '#334d45', accent: '#f8d8a2', create: bellwood },
  { id: 'parcel-parade', title: 'Parcel Parade', hero: 'Dottie the stork', tagline: 'Every parcel has a place.', instructions: 'Drag each moving parcel to the depot with the same color. Deliver nine before four mistakes.', background: '#365469', accent: '#f4dcad', create: parcelParade },
  { id: 'wobble-bakery', title: 'Wobble Bakery', hero: 'Milo the mole', tagline: 'A cake in a gusty hurry.', instructions: 'Drag the tray beneath the cake as gusts blow it around. Keep it safe for 30 seconds; three slips end the run.', background: '#694755', accent: '#ffe4be', create: wobbleBakery },
  { id: 'mothlight', title: 'Mothlight', hero: 'Vesper the bat', tagline: 'A little light leads the way.', instructions: 'Drag Vesper close to the moth, then slowly lead it to the glowing flower. Guide all four home and avoid thorns.', background: '#222742', accent: '#f9dca5', create: mothlight },
  { id: 'cloud-potter', title: 'Cloud Potter', hero: 'Saffron the raccoon', tagline: 'Shape something lovely.', instructions: 'Swipe a clay band left to narrow it or right to widen it. Match the pale pattern for each of three little pots.', background: '#59496e', accent: '#ffe5d6', create: cloudPotter },
];
