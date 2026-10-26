// The complete level simulation. Coordinates are lawn cells, independent of 3D
// rendering, so the same rules run on phones and in deterministic tests.
export const ROWS = 5;
export const COLS = 8;
export const PLANTS = Object.freeze({
  bloom: Object.freeze({ name: 'Sun bloom', cost: 50, hp: 100, cooldown: 3, description: 'Grows 25 sun every 10 seconds.', key: '1' }),
  pea: Object.freeze({ name: 'Pea pod', cost: 100, hp: 140, cooldown: 2.5, description: 'Shoots peas down its lane.', key: '2' }),
  nut: Object.freeze({ name: 'Shellnut', cost: 75, hp: 700, cooldown: 6, description: 'A tough little wall. Buys you time.', key: '3' }),
});

export const WAVES = Object.freeze([
  { at: 18, row: 2, wave: 1 }, { at: 25, row: 1, wave: 1 }, { at: 32, row: 3, wave: 1 },
  { at: 52, row: 0, wave: 2 }, { at: 57, row: 4, wave: 2 }, { at: 62, row: 2, wave: 2 },
  { at: 67, row: 1, wave: 2 }, { at: 72, row: 3, wave: 2 }, { at: 77, row: 0, wave: 2, armored: true },
  { at: 95, row: 2, wave: 3, armored: true }, { at: 99, row: 4, wave: 3 },
  { at: 103, row: 0, wave: 3 }, { at: 107, row: 1, wave: 3, armored: true },
  { at: 111, row: 3, wave: 3 }, { at: 115, row: 2, wave: 3 },
  { at: 119, row: 4, wave: 3, armored: true }, { at: 123, row: 0, wave: 3 },
  { at: 127, row: 3, wave: 3, armored: true },
].map(Object.freeze));

export function createGarden({ random = Math.random } = {}) {
  let serial = 0;
  const state = {};
  function reset() {
    serial = 0;
    Object.assign(state, {
      mode: 'ready', time: 0, sun: 200, wave: 1, spawned: 0, defeated: 0,
      plants: [], zombies: [], peas: [], suns: [], effects: [],
      cooldowns: { bloom: 0, pea: 0, nut: 0 }, nextSkySun: 5,
      mowers: Array.from({ length: ROWS }, (_, row) => ({ id: `mower-${row}`, row, x: -0.85, active: false, spent: false })),
    });
    return state;
  }
  reset();
  const id = () => ++serial;
  const effect = (kind, x, row) => state.effects.push({ id: id(), kind, x, row, age: 0 });
  function start() {
    reset();
    state.mode = 'playing';
  }
  function pause() { if (state.mode === 'playing') state.mode = 'paused'; }
  function resume() { if (state.mode === 'paused') state.mode = 'playing'; }
  function place(type, row, col) {
    if (state.mode !== 'playing') return { ok: false, reason: 'Start or resume the level to plant.' };
    const plant = PLANTS[type];
    if (!plant || !Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= ROWS || col < 0 || col >= COLS)
      return { ok: false, reason: 'Choose a patch of lawn.' };
    if (state.plants.some(p => p.row === row && p.col === col)) return { ok: false, reason: 'That patch is already planted. Use the shovel to clear it.' };
    if (state.sun < plant.cost) return { ok: false, reason: `You need ${plant.cost} sun for a ${plant.name}. Tap the glowing suns to collect more.` };
    if (state.cooldowns[type] > 0) return { ok: false, reason: `${plant.name} is recharging. Ready in ${Math.ceil(state.cooldowns[type])}s.` };
    state.sun -= plant.cost;
    state.cooldowns[type] = plant.cooldown;
    state.plants.push({ id: id(), type, row, col, hp: plant.hp, fire: 0.2, produce: 7, age: 0 });
    effect('plant', col, row);
    return { ok: true, reason: `${plant.name} planted in lane ${row + 1}.` };
  }
  function remove(row, col) {
    if (state.mode !== 'playing') return { ok: false, reason: 'Resume the level to use the shovel.' };
    const index = state.plants.findIndex(p => p.row === row && p.col === col);
    if (index < 0) return { ok: false, reason: 'Choose a planted patch to dig it up.' };
    const [plant] = state.plants.splice(index, 1);
    const refund = Math.floor(PLANTS[plant.type].cost / 2);
    state.sun += refund;
    effect('plant', col, row);
    return { ok: true, reason: `Plant removed. ${refund} sun returned.` };
  }
  function dropSun(x, row) {
    state.suns.push({ id: id(), x, row, age: 0, life: 14, value: 25 });
  }
  function collectSun(sunId) {
    if (state.mode !== 'playing') return false;
    const index = state.suns.findIndex(sun => sun.id === sunId);
    if (index < 0) return false;
    const [sun] = state.suns.splice(index, 1);
    state.sun += sun.value;
    effect('sun', sun.x, sun.row);
    return true;
  }
  function kill(zombie) {
    if (zombie.hp <= 0) return;
    zombie.hp = 0;
    state.defeated++;
    effect('hit', zombie.x, zombie.row);
  }
  function step(dt) {
    state.time += dt;
    for (const type of Object.keys(PLANTS)) state.cooldowns[type] = Math.max(0, state.cooldowns[type] - dt);
    if (state.time >= state.nextSkySun) {
      dropSun(0.3 + random() * (COLS - 1.6), Math.floor(random() * ROWS));
      state.nextSkySun += 7;
    }
    while (state.spawned < WAVES.length && state.time >= WAVES[state.spawned].at) {
      const spawn = WAVES[state.spawned++];
      state.wave = spawn.wave;
      const hp = spawn.armored ? 235 : 100;
      state.zombies.push({ id: id(), row: spawn.row, x: COLS + 0.2, hp, maxHp: hp, armored: !!spawn.armored, speed: spawn.armored ? 0.14 : 0.19, age: 0, biting: false, hit: 0 });
    }
    for (const plant of state.plants) {
      plant.age += dt;
      if (plant.type === 'bloom') {
        plant.produce -= dt;
        if (plant.produce <= 0) { dropSun(plant.col + 0.3, plant.row); plant.produce += 10; }
      }
      if (plant.type === 'pea') {
        plant.fire = Math.max(0, plant.fire - dt);
        if (plant.fire <= 0 && state.zombies.some(z => z.hp > 0 && z.row === plant.row && z.x > plant.col + 0.25)) {
          state.peas.push({ id: id(), x: plant.col + 0.36, row: plant.row });
          plant.fire = 1.35;
        }
      }
    }
    for (const pea of state.peas) {
      const previous = pea.x;
      pea.x += dt * 5.5;
      const target = state.zombies.filter(z => z.hp > 0 && z.row === pea.row && z.x + 0.24 >= previous && z.x - 0.24 <= pea.x).sort((a, b) => a.x - b.x)[0];
      if (target) {
        const damage = 25;
        if (target.hp <= damage) kill(target);
        else { target.hp -= damage; target.hit = 0.14; }
        pea.x = COLS + 10;
      }
    }
    for (const zombie of state.zombies) {
      if (zombie.hp <= 0) continue;
      zombie.age += dt;
      zombie.hit = Math.max(0, zombie.hit - dt);
      const meal = state.plants.filter(p => p.hp > 0 && p.row === zombie.row && zombie.x >= p.col - 0.35 && zombie.x <= p.col + 0.6).sort((a, b) => b.col - a.col)[0];
      zombie.biting = !!meal;
      if (meal) meal.hp -= dt * 24;
      else zombie.x -= zombie.speed * dt;
      const mower = state.mowers[zombie.row];
      if (zombie.x < -0.38 && !mower.spent) { mower.active = true; mower.spent = true; }
      if (zombie.x < -1.12) { state.mode = 'lost'; break; }
    }
    for (const mower of state.mowers) {
      if (!mower.active) continue;
      const from = mower.x;
      mower.x += dt * 7;
      for (const zombie of state.zombies) {
        if (zombie.row === mower.row && zombie.x >= from - 0.45 && zombie.x <= mower.x + 0.45) kill(zombie);
      }
      if (mower.x > COLS + 1) mower.active = false;
    }
    state.plants = state.plants.filter(p => p.hp > 0);
    state.zombies = state.zombies.filter(z => z.hp > 0);
    state.peas = state.peas.filter(p => p.x < COLS + 1);
    for (const sun of state.suns) sun.age += dt;
    state.suns = state.suns.filter(s => s.age < s.life);
    for (const fx of state.effects) fx.age += dt;
    state.effects = state.effects.filter(fx => fx.age < 0.55);
    if (state.mode === 'playing' && state.spawned === WAVES.length && state.zombies.length === 0) state.mode = 'won';
  }
  function tick(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    let remaining = seconds;
    while (remaining > 1e-8 && state.mode === 'playing') {
      const dt = Math.min(remaining, 0.05);
      step(dt);
      remaining -= dt;
    }
  }
  return { state, start, reset, pause, resume, place, remove, collectSun, tick };
}
