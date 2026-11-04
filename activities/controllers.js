import { byId } from './catalog.js';
import { createGarden, PLANTS, ROWS, COLS } from '../garden-game.js';
import { createBorrowed } from '../borrowed-game.js';
import { createPrism } from '../prism-game.js';
import { createLantern } from '../lantern-game.js';

const LEGACY = new Set(['moonbounce', 'popwake', 'pondpost', 'ribbon', 'dewfall']);
const STANDALONE = new Set(['garden', 'borrowed', 'prism', 'lantern']);
const clone = value => JSON.parse(JSON.stringify(value));
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const axis = (positive, negative) => Number(!!positive) - Number(!!negative);
const uint = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;

/** One native scene at a time. The zombie host owns animation, input, and saves. */
export async function createActivity(id, options = {}) {
  const definition = byId.get(id);
  if (!definition) throw new Error('This settlement activity could not be found.');
  if (!options.container) throw new Error('An activity needs a place in the settlement.');
  const level = Number.isInteger(options.level) ? clamp(options.level, 1, definition.levelCount) : 1;
  const settings = { ...options, level, seed: uint(options.seed) ? options.seed : 82941 };
  if (id === 'upside') {
    const { createUpsideActivity } = await import('./upside.js');
    const controller = createUpsideActivity(settings);
    controller.inputMode = 'native';
    return controller;
  }
  if (id === 'moonbounce') {
    const { createMoonbounceActivity } = await import('./moonbounce.js');
    return createMoonbounceActivity(settings);
  }
  if (LEGACY.has(id)) {
    const { createLegacy } = await import('../voyage/legacy.js');
    const controller = await createLegacy(id, settings);
    controller.inputMode = 'pointer';
    controller.actions = id === 'popwake' ? [{ id: 'hint', label: 'Show path hint' }, { id: 'reset', label: 'Reset puzzle' }] : [];
    controller.action = name => name === 'hint' ? controller.hint?.() : name === 'reset' ? controller.resetLevel?.() : false;
    return controller;
  }
  if (!STANDALONE.has(id)) {
    const { createArcade } = await import('../voyage/arcade.js');
    const controller = createArcade(id, settings);
    controller.inputMode = 'pointer';
    controller.actions = controller.resetLevel ? [{ id: 'reset', label: 'Reset puzzle' }] : [];
    controller.action = name => name === 'reset' ? controller.resetLevel?.() : false;
    return controller;
  }
  // A disposed scene must never reopen the host's graphics recovery dialog.
  let alive = true;
  const onResize = () => { if (alive) options.onResize?.(); };
  const onLost = () => { if (alive) options.onLost?.(); };
  const onRestored = () => { if (alive) options.onRestored?.(); };
  let view, world;
  if (id === 'garden') {
    const { createGardenScene } = await import('../garden-scene.js');
    view = createGardenScene(options.container, { onResize, onLost, onRestored });
  } else if (id === 'borrowed') {
    const { createBorrowedScene } = await import('../borrowed-scene.js');
    view = createBorrowedScene(options.container, { resized: onResize, lost: onLost, restored: onRestored });
  } else if (id === 'prism') {
    const { createPrismScene } = await import('../prism-scene.js');
    view = createPrismScene(options.container, { resized: onResize, lost: onLost, restored: onRestored });
  } else {
    const [{ createLanternScene }, response] = await Promise.all([
      import('../lantern-scene.js'), fetch(new URL('../assets/lantern-world.json', import.meta.url)),
    ]);
    if (!response.ok) throw new Error('The island chart could not be loaded. Please try again.');
    world = await response.json(); world.satellites ||= [];
    view = await createLanternScene(options.container, world, { resized: onResize, lost: onLost, restored: onRestored });
  }
  return createStandaloneController(id, { ...settings, view, world, onDispose: () => { alive = false; } });
}

// Pure-engine adapter kept separate from WebGL construction so real input,
// interrupted gestures, completion, and restored checkpoints can be tested.
export function createStandaloneController(id, { container, view, world, level = 1, seed = 82941, sound, onDispose } = {}) {
  if (!STANDALONE.has(id)) throw new Error('Unknown settlement activity.');
  const definition = byId.get(id);
  let selectedLevel = Number.isInteger(level) ? clamp(level, 1, definition.levelCount) : 1;
  let random = { value: uint(seed) ? seed : 82941 };
  function makeEngine(chapter, rng) {
    if (id === 'garden') return createGarden({ level: chapter, random: () => {
      rng.value = (Math.imul(rng.value, 1664525) + 1013904223) >>> 0; return rng.value / 4294967296;
    } });
    if (id === 'borrowed') return createBorrowed({ level: chapter, seed: uint(seed) ? seed : 82941 });
    if (id === 'prism') return createPrism({ level: chapter });
    return createLantern({ world });
  }
  let engine = makeEngine(selectedLevel, random);
  engine.start(id === 'lantern' ? undefined : selectedLevel);
  let disposed = false, selected = 'bloom', message = '', messageTime = 0, ending = null;
  let down = null, pointerX = 0, pointerZ = 0, focus = null;
  let held = {}, previous = {};
  const completeLantern = game => game.state.lit.length === world.beacons.length && (world.satellites || []).every(island => game.state.expedition.awakened.includes(island.id));
  const modeOf = game => id === 'lantern' ? completeLantern(game) ? 'won' : 'playing' : ['won', 'lost'].includes(game.state.mode) ? game.state.mode : 'playing';
  const state = { get mode() { return modeOf(engine); } };
  function progress() {
    if (id === 'borrowed' && engine.state.mode === 'between') {
      engine.nextLoop(); message = 'Route banked. Your echo is moving with you.'; messageTime = 3;
    }
    if (id === 'lantern' && engine.state.mode === 'won' && !completeLantern(engine)) engine.explore();
    if (id === 'lantern' && engine.state.lit.length === world.beacons.length && !completeLantern(engine)) {
      const destination = engine.state.expedition.destination;
      if (!destination || destination === 'vale' || engine.state.expedition.awakened.includes(destination)) {
        const next = world.satellites.find(island => !engine.state.expedition.awakened.includes(island.id));
        if (next) engine.setDestination(next.id);
      }
    }
  }
  function cancel() {
    down = null; pointerX = pointerZ = 0; held = {}; previous = {}; focus = null;
    view.setHover?.(-1, -1);
  }
  const actions = id === 'garden' ? [
    { id: 'bloom', label: 'Sun bloom · 50' }, { id: 'pea', label: 'Pea pod · 100' },
    { id: 'nut', label: 'Shellnut · 75' }, { id: 'shovel', label: 'Shovel' },
    { id: 'collect', label: 'Collect sun' },
  ] : id === 'borrowed' ? [
    { id: 'snap', label: 'Snap', hold: true }, { id: 'dash', label: 'Dash' },
    { id: 'borrow', label: 'Borrow echo' }, { id: 'bank', label: 'Bank route' },
  ] : id === 'prism' ? [{ id: 'hint', label: 'Hint' }, { id: 'reset', label: 'Reset mirrors' }] : [
    { id: 'rise', label: 'Rise', hold: true }, { id: 'descend', label: 'Descend', hold: true },
    { id: 'boost', label: 'Boost', hold: true }, { id: 'destination', label: 'Change destination' },
  ];
  function action(name, pressed = true) {
    if (disposed) return false;
    const entry = actions.find(item => item.id === name);
    if (!entry) return false;
    if (entry.hold) {
      held[name] = !!pressed;
      if (!pressed || state.mode !== 'playing') return true;
      if (id === 'borrowed' && name === 'snap') engine.snap();
      return true;
    }
    if (!pressed || state.mode !== 'playing') return false;
    if (id === 'garden') {
      if (name === 'collect') {
        for (const sun of [...engine.state.suns]) engine.collectSun(sun.id);
        sound?.(660, .08); return true;
      }
      selected = name; message = name === 'shovel' ? 'Tap a plant to recover half its sun cost.' : `${PLANTS[name].name}: ${PLANTS[name].description}`;
      messageTime = 4; return true;
    }
    if (id === 'borrowed') {
      const before = name === 'bank' ? engine.snapshot() : null;
      const result = engine[name]?.();
      if (before && engine.state.mode === 'lost') ending = { engine: before, random: random.value, finish: { action: 'bank' } };
      if (!result) { message = name === 'bank' ? 'Move for at least two seconds before banking a route.' : name === 'borrow' ? 'Bank a route first, then jump to its echo.' : 'Dash is recharging.'; messageTime = 2; }
      progress(); return !!result;
    }
    if (id === 'prism') {
      if (name === 'reset') { cancel(); engine.start(selectedLevel); ending = null; return true; }
      return engine.hint();
    }
    const destinations = [null, 'vale', ...world.satellites.map(island => island.id)];
    const next = destinations[(destinations.indexOf(engine.state.expedition.destination) + 1) % destinations.length];
    engine.setDestination(next); return true;
  }
  function gardenCell(clientX, clientY) {
    const rect = container.getBoundingClientRect(), x = clientX - rect.left, y = clientY - rect.top;
    let nearest = null, distance = Infinity;
    for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
      const bounds = view.cellBounds(row, col), center = view.project(col, row);
      if (Math.abs(x - center.x) <= Math.max(8, bounds.width / 2) && Math.abs(y - center.y) <= Math.max(8, bounds.height / 2)) {
        const delta = (x - center.x) ** 2 + (y - center.y) ** 2;
        if (delta < distance) { nearest = { row, col }; distance = delta; }
      }
    }
    return nearest;
  }
  function gardenTap(x, y) {
    const rect = container.getBoundingClientRect();
    for (const sun of engine.state.suns) {
      const point = view.project(sun.x, sun.row, 1.5);
      if (Math.hypot(x - rect.left - point.x, y - rect.top - point.y) < 23) {
        engine.collectSun(sun.id); sound?.(660, .08); return;
      }
    }
    const cell = gardenCell(x, y); if (!cell) return;
    const result = selected === 'shovel' ? engine.remove(cell.row, cell.col) : engine.place(selected, cell.row, cell.col);
    message = result.reason; messageTime = 3; if (result.ok) sound?.(selected === 'shovel' ? 260 : 480, .08);
  }
  function pointer(type, x, y) {
    if (disposed) return;
    if (type === 'cancel') { cancel(); return; }
    if (state.mode !== 'playing' || !['down', 'move', 'up'].includes(type) || !Number.isFinite(x) || !Number.isFinite(y)) return;
    if (id === 'garden') {
      const cell = gardenCell(x, y); view.setHover?.(cell?.row ?? -1, cell?.col ?? -1);
      if (type === 'down') down = { x, y };
      if (type === 'up') { if (down && Math.hypot(x - down.x, y - down.y) < 18) gardenTap(x, y); down = null; }
      return;
    }
    if (id === 'prism') {
      focus = view.pick(x, y, engine.state);
      if (type === 'down') down = { x, y, index: focus };
      if (type === 'up') {
        if (down && down.index !== null && down.index !== undefined && focus === down.index && Math.hypot(x - down.x, y - down.y) < 18) {
          if (engine.rotate(focus)) sound?.(420 + focus * 30, .09);
        }
        down = null;
      }
      return;
    }
    if (type === 'down') { down = { x, y }; pointerX = pointerZ = 0; }
    if (type === 'move' && down) {
      const radius = 58, dx = x - down.x, dy = y - down.y, length = Math.max(radius, Math.hypot(dx, dy));
      pointerX = dx / length; pointerZ = dy / length;
    }
    if (type === 'up') { down = null; pointerX = pointerZ = 0; }
  }
  function update(dt, input = {}) {
    if (disposed || state.mode !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    const seconds = Math.min(.05, dt); messageTime = Math.max(0, messageTime - seconds);
    if (id === 'prism') return;
    if (id === 'borrowed') {
      if ((input.run || input.boost) && !(previous.run || previous.boost)) engine.dash();
      if (input.secondary && !previous.secondary) engine.borrow();
    }
    const control = id === 'borrowed' ? {
      x: clamp(axis(input.right, input.left) + pointerX, -1, 1),
      z: clamp(axis(input.down, input.up) + pointerZ, -1, 1),
      pulse: !!(input.action || input.fire || held.snap),
    } : id === 'lantern' ? {
      throttle: input.up || input.down ? axis(input.up, input.down) : down ? 1 : 0,
      turn: clamp(axis(input.right, input.left) + pointerX, -1, 1),
      lift: clamp(axis(input.jump || input.action || held.rise, input.secondary || held.descend) - pointerZ, -1, 1),
      boost: !!(input.run || input.boost || held.boost),
    } : null;
    // These two original engines omit defeated saves. Retain the exact legal
    // state and final step so a result survives interruption without a restart.
    const before = id === 'garden' || id === 'borrowed' ? engine.snapshot() : null;
    const randomBefore = random.value, ticksBefore = engine.state.ticks;
    if (id === 'garden') engine.tick(seconds); else engine.advance(seconds, control);
    if (before && modeOf(engine) === 'lost') ending = {
      engine: before, random: randomBefore,
      finish: { seconds: id === 'borrowed' ? (engine.state.ticks - ticksBefore) / 60 : seconds, control },
    };
    previous = { ...input }; progress();
    if (state.mode !== 'playing') cancel();
  }
  function snapshot() {
    const data = engine.snapshot();
    if (!data && !ending) return null;
    return clone({ schema: 1, id, level: selectedLevel, mode: state.mode, engine: data || ending.engine,
      selected, random: data ? random.value : ending.random, finish: data ? null : ending.finish });
  }
  function restore(saved) {
    try {
      if (disposed || !saved || saved.schema !== 1 || saved.id !== id || !['playing', 'won', 'lost'].includes(saved.mode) ||
        !Number.isInteger(saved.level) || saved.level < 1 || saved.level > definition.levelCount || !uint(saved.random) ||
        !['bloom', 'pea', 'nut', 'shovel'].includes(saved.selected) || saved.engine?.level !== saved.level) return false;
      if (saved.finish !== null) {
        const finish = saved.finish;
        if (!finish || saved.mode !== 'lost' || !['garden', 'borrowed'].includes(id)) return false;
        if (finish.action) { if (id !== 'borrowed' || finish.action !== 'bank') return false; }
        else if (!Number.isFinite(finish.seconds) || finish.seconds <= 0 || finish.seconds > .051 ||
          id === 'borrowed' && (!finish.control || !['x', 'z'].every(key => Number.isFinite(finish.control[key]) && Math.abs(finish.control[key]) <= 1) || typeof finish.control.pulse !== 'boolean')) return false;
      }
      const candidateRandom = { value: saved.random }, candidate = makeEngine(saved.level, candidateRandom);
      if (!candidate.restore(saved.engine)) return false;
      candidate.resume();
      if (saved.finish?.action === 'bank') candidate.bank();
      else if (saved.finish) {
        if (id === 'garden') candidate.tick(saved.finish.seconds);
        else candidate.advance(saved.finish.seconds, saved.finish.control);
      }
      if (modeOf(candidate) !== saved.mode) return false;
      cancel(); engine = candidate; random = candidateRandom; selected = saved.selected; selectedLevel = saved.level;
      ending = saved.finish ? { engine: clone(saved.engine), random: saved.random, finish: clone(saved.finish) } : null;
      message = ''; messageTime = 0; progress(); return true;
    } catch { return false; }
  }
  function hud() {
    const s = engine.state;
    if (id === 'garden') return {
      primary: `${s.sun} SUN · WAVE ${s.wave}/${engine.level.waveCount}`,
      secondary: `${selected === 'shovel' ? 'Shovel selected' : `${PLANTS[selected].name} selected`} · ${s.defeated}/${engine.level.enemies.length} stopped`,
      hint: messageTime ? message : 'Choose a seed, then tap a lawn patch. Tap suns or use Collect sun.',
      selectedAction: selected,
    };
    if (id === 'borrowed') return {
      primary: `${s.blooms.filter(bloom => bloom.charge >= bloom.need - .001).length}/3 BLOOMS · ${Math.ceil(s.hp)} HEALTH`,
      secondary: `Loop ${s.loop}/${s.maxLoops} · ${Math.ceil(Math.max(0, s.duration - s.loopTicks / 60))}s · ${s.memories.length} echoes`,
      hint: messageTime ? message : s.reason || 'Move to spread the sail. Bank routes in different corners; hold Snap to pulse.',
    };
    if (id === 'prism') return {
      primary: `${s.awake}/${s.total} RECEIVERS LIT`, secondary: `${s.moves} turns · ${engine.level.name}`,
      hint: s.hintIndex === null ? 'Tap a mirror or splitter to turn the beam.' : 'The highlighted mirror can help. Tap it to turn.',
    };
    const guide = s.guide, home = s.lit.length === world.beacons.length;
    const target = guide ? `${guide.instruction || guide.name || 'Follow the glowing guide'}${Number.isFinite(guide.y) ? ` · altitude ${Math.round(guide.y)}` : ''}` : 'Follow the light across the islands.';
    return { primary: `${s.lit.length}/${world.beacons.length} LANTERNS · ${s.expedition.awakened.length}/${world.satellites.length} ISLANDS`,
      secondary: `${s.charge} fireflies · altitude ${Math.round(s.player.y)}${s.channel.progress > 0 ? ` · charging ${Math.round(s.channel.progress * 100)}%` : ''}`,
      hint: !home && guide?.kind === 'beacon' ? 'Release movement and hover inside the lantern ring to relight it.' : target,
    };
  }
  return {
    state, inputMode: definition.inputMode, actions, action, update, pointer, snapshot, restore, hud,
    get engine() { return engine; }, get renderer() { return view.renderer; }, get camera() { return view.camera; },
    project(x, z, elevation) {
      const point = view.project(x, z, elevation), rect = container.getBoundingClientRect();
      return { ...point, x: rect.left + point.x, y: rect.top + point.y };
    },
    render(time = 0) { if (!disposed) view.render(engine.state, time, id === 'prism' ? focus : undefined); },
    dispose() {
      if (disposed) return;
      disposed = true; cancel(); onDispose?.(); view.dispose?.();
      // Lantern already releases its canvas; the other original scenes do not.
      if (id !== 'lantern') view.renderer?.forceContextLoss?.();
      view.renderer?.domElement?.remove?.();
    },
  };
}
