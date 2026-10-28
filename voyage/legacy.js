import { createMoonbounce, WAVES } from '../moonbounce-game.js';
import { createPopwake, LEVELS as POP_LEVELS } from '../popwake-game.js';
import { createPondPost, LEVELS as POND_LEVELS } from '../pondpost-game.js';
import { createRibbon, LEVELS as REEF_LEVELS } from '../ribbon-game.js';
import { createDewfall, LEVELS as DEW_LEVELS } from '../dewfall-game.js';

// These are the original simulations and worlds, played as chapters of the
// voyage. No iframe, navigation, or second menu interrupts the shared journey.
export const legacyIds = Object.freeze(['moonbounce', 'popwake', 'pondpost', 'ribbon', 'dewfall']);
const factories = { moonbounce: createMoonbounce, popwake: createPopwake, pondpost: createPondPost, ribbon: createRibbon, dewfall: createDewfall };
const levelCounts = { moonbounce: 1, popwake: POP_LEVELS.length, pondpost: POND_LEVELS.length, ribbon: REEF_LEVELS.length, dewfall: DEW_LEVELS.length };
const clone = value => JSON.parse(JSON.stringify(value));
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const modeOf = engine => ['won', 'upgrade'].includes(engine.state.mode) ? 'won' : ['lost', 'failed'].includes(engine.state.mode) ? 'lost' : 'playing';

// Kept independent of WebGL so interrupted gestures and checkpoints can be
// verified against the real physics engines in ordinary Node tests.
export function createLegacyController(id, { container, view, level = 1, seed = 82941 } = {}) {
  if (!legacyIds.includes(id)) throw new Error('Unknown voyage activity.');
  let selected = Number.isInteger(level) ? clamp(level, 1, levelCounts[id]) : 1;
  let engine = factories[id]({ level: selected, seed });
  engine.start(id === 'moonbounce' ? seed : selected);
  const state = { mode: 'playing' };
  let held = false, anchorX = 0, anchorY = 0, originX = 0, originY = 0, axisX = 0, axisZ = 0;
  let ending = null, disposed = false;
  const refresh = () => { state.mode = modeOf(engine); };
  function cancel() {
    held = false; axisX = axisZ = 0;
    if (id === 'popwake') engine.cancel();
    if (id === 'pondpost') engine.cancelAim();
    if (id === 'dewfall') engine.endTilt();
    refresh();
  }
  function move(x, y) {
    if (!held) return;
    if (id === 'popwake') {
      const cell = view.pick(x, y); if (cell) engine.drag(cell);
    } else if (id === 'pondpost') engine.aim(view.dragVector(anchorX - x, anchorY - y));
    else if (id === 'ribbon') {
      const rect = container.getBoundingClientRect();
      engine.steer(originX + (x - anchorX) * 8.4 / Math.max(1, rect.width), originY - (y - anchorY) * 4.7 / Math.max(1, rect.height));
    } else {
      let dx = x - anchorX, dy = y - anchorY;
      const distance = Math.hypot(dx, dy), radius = 44;
      if (distance > radius) {
        anchorX += dx * (1 - radius / distance); anchorY += dy * (1 - radius / distance);
        dx *= radius / distance; dy *= radius / distance;
      }
      axisX = dx / radius; axisZ = dy / radius;
    }
  }
  function pointer(type, x, y) {
    if (disposed) return;
    if (type === 'cancel') { cancel(); return; }
    if (state.mode !== 'playing' || !Number.isFinite(x) || !Number.isFinite(y)) return;
    if (type === 'down' && !held) {
      anchorX = x; anchorY = y; axisX = axisZ = 0; held = true;
      if (id === 'popwake') { const cell = view.pick(x, y); held = !!cell && engine.begin(cell); }
      if (id === 'pondpost') held = engine.beginAim();
      if (id === 'dewfall') engine.beginTilt();
      if (id === 'ribbon') { originX = engine.state.targetX; originY = engine.state.targetY; }
    } else if (type === 'move') move(x, y);
    else if (type === 'up' && held) {
      move(x, y); held = false; axisX = axisZ = 0;
      if (id === 'moonbounce') engine.burst();
      if (id === 'popwake') engine.release();
      if (id === 'pondpost') {
        if (Math.hypot(x - anchorX, y - anchorY) >= 10) engine.launch(); else engine.cancelAim();
      }
      if (id === 'dewfall') engine.endTilt();
    }
    refresh();
  }
  function update(dt) {
    if (disposed || state.mode !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    const seconds = Math.min(.05, dt), input = { x: axisX, z: axisZ };
    // These two engines do not serialize defeats (and Reef does not serialize
    // victories). Retain the last legal tick and the exact finishing input.
    const prior = id === 'ribbon' || id === 'moonbounce' ? engine.snapshot() : null;
    engine.advance(seconds, input); refresh();
    if (prior && state.mode !== 'playing' && !engine.snapshot()) {
      ending = { engine: prior, steps: engine.state.ticks - prior.ticks, input };
    }
    if (state.mode !== 'playing') cancel();
  }
  function snapshot() {
    const data = engine.snapshot();
    if (!data && !ending) return null;
    return clone({ schema: 1, id, level: selected, mode: state.mode,
      engine: data || ending.engine,
      finish: data ? null : { steps: ending.steps, input: ending.input } });
  }
  function restore(saved) {
    try {
      if (!saved || saved.schema !== 1 || saved.id !== id || !['playing', 'won', 'lost'].includes(saved.mode) ||
        !Number.isInteger(saved.level) || saved.level < 1 || saved.level > levelCounts[id] ||
        (id !== 'moonbounce' && saved.engine?.level !== saved.level)) return false;
      const candidate = factories[id]({ level: saved.level, seed });
      if (!candidate.restore(saved.engine)) return false;
      candidate.resume();
      if (saved.finish !== null) {
        const finish = saved.finish;
        if (!['ribbon', 'moonbounce'].includes(id) || saved.mode === 'playing' || !finish ||
          !Number.isInteger(finish.steps) || finish.steps < 1 || finish.steps > 4 ||
          !['x', 'z'].every(key => Number.isFinite(finish.input?.[key]) && Math.abs(finish.input[key]) <= 1)) return false;
        candidate.advance(finish.steps / 60, finish.input);
      }
      if (modeOf(candidate) !== saved.mode) return false;
      // A voyage contains one Moonbounce wave, never a hidden full campaign.
      if (id === 'moonbounce' && candidate.state.wave !== 1) return false;
      cancel(); engine = candidate; selected = saved.level;
      ending = saved.finish ? { engine: clone(saved.engine), ...clone(saved.finish) } : null;
      cancel(); refresh(); return true;
    } catch { return false; }
  }
  function hud() {
    const s = engine.state;
    if (id === 'moonbounce') return { primary: `${s.waveKills}/${WAVES[0].goal} CHEERED`, secondary: `${Math.ceil(s.player.hp)} health · ${s.orbits.length} moons gathered`, hint: 'Drag to steer. Lift to launch your moons. Clear one wave.' };
    if (id === 'popwake') return { primary: `${s.awake}/${s.total} AWAKE`, secondary: `${s.budget - s.used} dominoes left · ${engine.level.name}`, hint: 'Draw from the blue spark. Lift to start the chain reaction.' };
    if (id === 'pondpost') return { primary: `${s.padId}/${engine.level.goalPad} PADS`, secondary: s.mode === 'aiming' ? 'The dotted arc shows your leap.' : engine.level.name, hint: 'Pull down to aim upward. Lift to hop to the next lily pad.' };
    if (id === 'ribbon') return { primary: `${Math.min(100, Math.floor(s.distance / REEF_LEVELS[s.level - 1].length * 100))}% HOME`, secondary: `${s.health} hearts · ${s.passed} arches crossed`, hint: 'Slide your finger to steer through glowing arches. Lift to hold course.' };
    return { primary: `${s.bloomed}/${s.total} BLOOMS`, secondary: `${s.spills} spills · ${engine.level.name}`, hint: 'Hold and slide to tilt all the drops. Lift to slow them down.' };
  }
  function project(x, z) {
    const rect = container.getBoundingClientRect();
    if (id === 'dewfall') return view.project(x, z);
    if (id === 'ribbon') {
      const p = view.camera.position.clone().set(x, z, 0).project(view.camera);
      return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 };
    }
    const point = view.project(x, z);
    return { x: rect.left + point.x, y: rect.top + point.y };
  }
  return {
    state, update, pointer, snapshot, restore, hud, project,
    get engine() { return engine; }, get renderer() { return view.renderer; }, get camera() { return view.camera; },
    render(time = 0) { if (!disposed) view.render(engine.state, time, id === 'pondpost' && engine.state.mode === 'aiming' ? engine.preview() : null); },
    ...(id === 'popwake' ? { hint() { return engine.hint(); }, resetLevel() { cancel(); engine.retry(); ending = null; refresh(); } } : {}),
    dispose() {
      if (disposed) return;
      cancel(); disposed = true;
      const renderer = view.renderer;
      view.dispose();
      // WebGL's context limit is small on phones. Resource disposal alone does
      // not release the context when players hop between several chapters.
      renderer?.forceContextLoss?.(); renderer?.domElement?.remove();
    },
  };
}

export async function createLegacy(id, { container, onResize, onLost, onRestored, level = 1, seed = 82941 } = {}) {
  if (!legacyIds.includes(id) || !container) throw new Error('This voyage activity could not be opened.');
  const modules = {
    moonbounce: () => import('../moonbounce-scene.js'), popwake: () => import('../popwake-scene.js'),
    pondpost: () => import('../pondpost-scene.js'), ribbon: () => import('../ribbon-scene.js'), dewfall: () => import('../dewfall-scene.js'),
  };
  const names = { moonbounce: 'createMoonbounceScene', popwake: 'createPopwakeScene', pondpost: 'createPondPostScene', ribbon: 'createRibbonScene', dewfall: 'createDewfallScene' };
  const module = await modules[id]();
  let active = true, controller;
  const view = module[names[id]](container, {
    resized() { if (active) { controller?.pointer('cancel'); onResize?.(); } },
    lost() { if (active) { controller?.pointer('cancel'); onLost?.(); } },
    restored() { if (active) onRestored?.(); },
  });
  controller = createLegacyController(id, { container, view, level, seed });
  const dispose = controller.dispose;
  controller.dispose = () => { active = false; dispose(); };
  return controller;
}
