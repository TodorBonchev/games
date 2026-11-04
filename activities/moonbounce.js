import { createMoonbounce, WAVES } from '../moonbounce-game.js';
const clone = value => JSON.parse(JSON.stringify(value));
const modeOf = engine => ['won', 'lost'].includes(engine.state.mode) ? engine.state.mode : 'playing';

export async function createMoonbounceActivity(options) {
  const { createMoonbounceScene } = await import('../moonbounce-scene.js');
  let active = true, controller;
  const view = createMoonbounceScene(options.container, {
    resized() { if (active) { controller?.pointer('cancel'); options.onResize?.(); } },
    lost() { if (active) { controller?.pointer('cancel'); options.onLost?.(); } },
    restored() { if (active) options.onRestored?.(); },
  });
  controller = createMoonbounceController({ ...options, view, onDispose: () => { active = false; } });
  return controller;
}

// A complete five-wave defense, including the original upgrade choices and boss.
export function createMoonbounceController({ container, view, seed = 82941, sound, onDispose } = {}) {
  let engine = createMoonbounce({ seed }); engine.start(seed);
  let held = false, anchorX = 0, anchorY = 0, axisX = 0, axisZ = 0, disposed = false, ending = null;
  const state = { get mode() { return modeOf(engine); } };
  function cancel() { held = false; axisX = axisZ = 0; }
  function move(x, y) {
    let dx = x - anchorX, dy = y - anchorY;
    const distance = Math.hypot(dx, dy), radius = 44;
    if (distance > radius) {
      anchorX += dx * (1 - radius / distance); anchorY += dy * (1 - radius / distance);
      dx *= radius / distance; dy *= radius / distance;
    }
    axisX = dx / radius; axisZ = dy / radius;
  }
  function pointer(type, x, y) {
    if (disposed) return;
    if (type === 'cancel') { cancel(); return; }
    if (engine.state.mode !== 'playing' || !Number.isFinite(x) || !Number.isFinite(y)) return;
    if (type === 'down' && !held) { held = true; anchorX = x; anchorY = y; axisX = axisZ = 0; }
    else if (type === 'move' && held) move(x, y);
    else if (type === 'up' && held) { cancel(); if (engine.burst()) sound?.(360, .1); }
  }
  function update(dt) {
    if (disposed || engine.state.mode !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    const before = engine.snapshot(), ticks = engine.state.ticks, input = { x: axisX, z: axisZ };
    engine.advance(Math.min(.05, dt), input);
    if (state.mode === 'lost' && before) ending = { engine: before, finish: { steps: engine.state.ticks - ticks, input } };
    if (engine.state.mode !== 'playing') cancel();
  }
  function snapshot() {
    const data = engine.snapshot(); if (!data && !ending) return null;
    return clone({ schema: 2, id: 'moonbounce', level: 1, mode: state.mode, engine: data || ending.engine, finish: data ? null : ending.finish });
  }
  function restore(saved) {
    try {
      if (disposed || !saved || ![1, 2].includes(saved.schema) || saved.id !== 'moonbounce' || saved.level !== 1 || !['playing', 'won', 'lost'].includes(saved.mode)) return false;
      const candidate = createMoonbounce({ seed });
      if (!candidate.restore(saved.engine)) return false; candidate.resume();
      if (saved.finish !== null) {
        const f = saved.finish;
        if (!f || saved.mode !== 'lost' || !Number.isInteger(f.steps) || f.steps < 1 || f.steps > 4 ||
          !['x', 'z'].every(key => Number.isFinite(f.input?.[key]) && Math.abs(f.input[key]) <= 1)) return false;
        candidate.advance(f.steps / 60, f.input);
      }
      // Old Wonderwake checkpoints ended after the first wave. Resume those at
      // the upgrade choice so no progress is discarded when entering this world.
      const oldWaveComplete = saved.schema === 1 && saved.mode === 'won' && candidate.state.mode === 'upgrade' && candidate.state.wave === 1;
      if (!oldWaveComplete && modeOf(candidate) !== saved.mode) return false;
      cancel(); engine = candidate; ending = saved.finish ? { engine: clone(saved.engine), finish: clone(saved.finish) } : null; return true;
    } catch { return false; }
  }
  return {
    state, inputMode: 'pointer', update, pointer, snapshot, restore,
    get engine() { return engine; }, get renderer() { return view.renderer; }, get camera() { return view.camera; },
    get actions() { return engine.state.mode === 'upgrade' ? engine.state.choices.map(choice => ({ id: `upgrade:${choice.id}`, label: choice.name, description: choice.description })) : [{id:'launch',label:engine.state.orbits.length>=6?'Launch Moonstorm · L':'Launch moons · L',shortcut:'KeyL',disabled:engine.state.mode!=='playing'||engine.state.orbits.length===0}]; },
    action(name, pressed = true) {
      if (disposed || !pressed || typeof name !== 'string') return false;
      if(name==='launch'){const fired=engine.burst();if(fired)sound?.(360,.1);return fired;}
      if(!name.startsWith('upgrade:'))return false;
      cancel(); const changed = engine.chooseUpgrade(name.slice(8)); if (changed) sound?.(640, .15); return changed;
    },
    hud() {
      const s = engine.state, wave = WAVES[s.wave - 1];
      return { primary: `WAVE ${s.wave}/${WAVES.length} · ${Math.min(s.waveKills, wave.goal)}/${wave.goal} CLEARED`,
        secondary: `${Math.ceil(s.player.hp)} health · ${s.orbits.length} moons${s.bossSpawned && !s.bossDefeated ? ' · BOSS APPROACHING' : ''}`,
        hint: s.mode === 'upgrade' ? `Choose an upgrade: ${s.choices.map(choice => `${choice.name}: ${choice.description}`).join(' ')}` : s.reason || (s.orbits.length>=6 ? 'Moonstorm ready! Launch six or more moons for extra damage and a bonus bounce.' : s.orbits.length ? `${6-s.orbits.length} more moons for a Moonstorm. Release your drag or press Launch / L.` : 'Orbit empty — steer toward loose moons to gather your next volley.'),
      };
    },
    project(x, z) { const point = view.project(x, z), rect = container.getBoundingClientRect(); return { x: rect.left + point.x, y: rect.top + point.y }; },
    render(time = 0) { if (!disposed) view.render(engine.state, time); },
    dispose() { if (disposed) return; disposed = true; cancel(); onDispose?.(); view.dispose(); view.renderer?.forceContextLoss?.(); view.renderer?.domElement?.remove?.(); },
  };
}
