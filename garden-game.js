// The complete level simulation. Coordinates are lawn cells, independent of 3D
// rendering, so the same rules run on phones and in deterministic tests.
import { getLevel, MAX_ZOMBIES } from './garden-levels.js';
export const ROWS = 5;
export const COLS = 8;
export const PLANTS = Object.freeze({
  bloom: Object.freeze({ name: 'Sun bloom', cost: 50, hp: 100, cooldown: 3, description: 'Grows 25 sun every 10 seconds.', key: '1' }),
  pea: Object.freeze({ name: 'Pea pod', cost: 100, hp: 140, cooldown: 2.5, description: 'Shoots peas down its lane.', key: '2' }),
  nut: Object.freeze({ name: 'Shellnut', cost: 75, hp: 700, cooldown: 6, description: 'A tough little wall. Buys you time.', key: '3' }),
});

export const WAVES = getLevel(1).enemies;

export function createGarden({ random = Math.random, level = 1 } = {}) {
  let serial = 0;
  let garden = getLevel(level);
  const state = {};
  function reset(levelId = garden.id) {
    garden = getLevel(levelId);
    serial = 0;
    Object.assign(state, {
      mode: 'ready', level: garden.id, time: 0, sun: garden.startSun, wave: 1, spawned: 0, defeated: 0,
      plants: [], zombies: [], peas: [], suns: [], effects: [],
      cooldowns: { bloom: 0, pea: 0, nut: 0 }, nextSkySun: 5,
      mowers: Array.from({ length: ROWS }, (_, row) => ({ id: `mower-${row}`, row, x: -0.85, active: false, spent: false })),
    });
    return state;
  }
  reset();
  const id = () => ++serial;
  const effect = (kind, x, row) => state.effects.push({ id: id(), kind, x, row, age: 0 });
  function start(levelId = garden.id) {
    reset(levelId);
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
      state.nextSkySun += garden.skyInterval;
    }
    while (state.zombies.length < MAX_ZOMBIES && state.spawned < garden.enemies.length && state.time >= garden.enemies[state.spawned].at) {
      const spawn = garden.enemies[state.spawned++];
      state.wave = spawn.wave;
      const hp = Math.round((spawn.armored ? 235 : spawn.runner ? 75 : 100) * garden.health);
      state.zombies.push({ id: id(), row: spawn.row, x: COLS + 0.2, hp, maxHp: hp, armored: !!spawn.armored, runner: !!spawn.runner, speed: spawn.armored ? 0.14 : spawn.runner ? 0.32 : 0.19, age: 0, biting: false, hit: 0 });
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
      let target;
      for (const zombie of state.zombies) {
        if (zombie.hp > 0 && zombie.row === pea.row && zombie.x + 0.24 >= previous && zombie.x - 0.24 <= pea.x && (!target || zombie.x < target.x)) target = zombie;
      }
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
      let meal;
      for (const plant of state.plants) {
        if (plant.hp > 0 && plant.row === zombie.row && zombie.x >= plant.col - 0.35 && zombie.x <= plant.col + 0.6 && (!meal || plant.col > meal.col)) meal = plant;
      }
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
    if (state.mode === 'playing' && state.spawned === garden.enemies.length && state.zombies.length === 0) state.mode = 'won';
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
  return { state, get level() { return garden; }, start, reset, pause, resume, place, remove, collectSun, tick };
}
