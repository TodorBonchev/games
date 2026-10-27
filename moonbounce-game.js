// Moonbounce runs at a fixed 60 Hz. The renderer and the player's finger only
// supply steering and release actions; no browser or Three.js state is needed.
export const ARENA_RADIUS = 8;
export const MAX_MOONS = 80;
export const MAX_ORBITS = 22;
export const MAX_SHOTS = 96;
export const MAX_ENEMIES = 40;
export const MAX_BULLETS = 80;
export const MAX_EFFECTS = 80;
export const STEP = 1 / 60;

export const WAVES = Object.freeze([
  { id: 1, name: 'Hello, little moons', subtitle: 'Gather a few friends. Let them fly.', goal: 10, interval: 1.45, pattern: ['drifter', 'drifter', 'drifter', 'dasher'], boss: false },
  { id: 2, name: 'The fast and the fuzzy', subtitle: 'Quick visitors make a lovely racket.', goal: 14, interval: 1.2, pattern: ['drifter', 'dasher', 'drifter', 'shooter'], boss: false },
  { id: 3, name: 'A sky full of mischief', subtitle: 'The crowd has brought company.', goal: 18, interval: 0.85, pattern: ['dasher', 'drifter', 'shooter', 'drifter', 'dasher'], boss: false },
  { id: 4, name: 'The great moon party', subtitle: 'Keep the bounces going.', goal: 22, interval: 0.75, pattern: ['shooter', 'dasher', 'drifter', 'dasher', 'drifter'], boss: false },
  { id: 5, name: 'The big grump', subtitle: 'One enormous guest needs cheering up.', goal: 8, interval: 0.8, pattern: ['drifter', 'shooter', 'dasher', 'drifter'], boss: true },
].map(wave => Object.freeze({ ...wave, pattern: Object.freeze(wave.pattern) })));

export const UPGRADES = Object.freeze({
  capacity: Object.freeze({ id: 'capacity', name: 'Room for friends', description: 'Carry 3 more moons in your orbit.' }),
  power: Object.freeze({ id: 'power', name: 'Extra sparkle', description: 'Your launched moons hit harder.' }),
  bounces: Object.freeze({ id: 'bounces', name: 'Bouncy moons', description: 'Moons bounce one extra time.' }),
  speed: Object.freeze({ id: 'speed', name: 'Zoomies', description: 'Move a little faster.' }),
  magnet: Object.freeze({ id: 'magnet', name: 'Moon magnet', description: 'Gather moons from farther away.' }),
  heart: Object.freeze({ id: 'heart', name: 'Big heart', description: 'Get more maximum health and a big heal.' }),
});
const ENEMIES = Object.freeze({
  drifter: Object.freeze({ hp: 2, speed: 0.83, radius: 0.4, points: 25 }),
  dasher: Object.freeze({ hp: 3, speed: 1.32, radius: 0.34, points: 40 }),
  shooter: Object.freeze({ hp: 4, speed: 0.65, radius: 0.48, points: 60 }),
  boss: Object.freeze({ hp: 250, speed: 0.43, radius: 1.15, points: 600 }),
});
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const TAU = Math.PI * 2;
export function orbitCapacity(upgrades) { return Math.min(MAX_ORBITS, 10 + (upgrades?.capacity || 0) * 3); }
const enemyHealth = (type, wave) => ENEMIES[type].hp + (type === 'boss' ? 0 : Math.max(0, wave - 2));

export function createMoonbounce({ seed = 82941 } = {}) {
  seed = Number.isFinite(seed) ? Math.floor(seed) >>> 0 : 82941;
  let serial = 0, accumulator = 0;
  const state = {};
  const nextId = () => ++serial;
  const random = () => { state.random = (Math.imul(state.random, 1664525) + 1013904223) >>> 0; return state.random / 4294967296; };
  const capacity = () => orbitCapacity(state.upgrades);
  const effect = (type, x, z, duration = 0.55) => {
    if (state.effects.length >= MAX_EFFECTS) state.effects.shift();
    state.effects.push({ id: nextId(), type, x, z, age: 0, duration });
  };
  const event = (type, detail = {}) => { state.events.push({ type, ...detail }); if (state.events.length > 32) state.events.shift(); };
  function clampToArena(point, radius = 0) {
    const length = Math.hypot(point.x, point.z), limit = ARENA_RADIUS - radius;
    if (length > limit) { point.x *= limit / length; point.z *= limit / length; }
  }
  function placeOrbits() {
    const count = state.orbits.length;
    for (let i = 0; i < count; i++) {
      // Two rings remain legible when an upgraded orbit holds many moons.
      const ring = Math.floor(i / 11), start = ring * 11, ringCount = Math.min(11, count - start);
      const angle = state.ticks * STEP * (ring ? -1.5 : 1.8) + (i - start) * TAU / ringCount;
      const radius = 1.05 + ring * 0.48;
      Object.assign(state.orbits[i], { angle, x: state.player.x + Math.cos(angle) * radius, z: state.player.z + Math.sin(angle) * radius });
      // Keep moons inside the rail, including the outer upgraded orbit.
      clampToArena(state.orbits[i], 0.2);
    }
  }
  function addOrbit(id) {
    if (state.orbits.length >= capacity()) return false;
    state.orbits.push({ id, x: state.player.x, z: state.player.z, angle: 0 });
    state.maxOrbit = Math.max(state.maxOrbit, state.orbits.length); placeOrbits(); return true;
  }
  function addMoon(x, z, id = nextId(), cooldown = 0) {
    if (state.moons.length >= MAX_MOONS) return false;
    const moon = { id, x, z, age: 0, cooldown };
    clampToArena(moon, 0.32); state.moons.push(moon); return true;
  }
  function spawnEnemy(type, x, z) {
    if (state.enemies.length >= MAX_ENEMIES) return false;
    const definition = ENEMIES[type], angle = random() * TAU;
    const hp = enemyHealth(type, state.wave);
    const enemy = { id: nextId(), type, x: x ?? Math.cos(angle) * 7.45, z: z ?? Math.sin(angle) * 7.45,
      hp, maxHp: hp, radius: definition.radius, age: 0, angle: 0, hit: 0, shotTimer: type === 'boss' ? 1.0 : 1.8 + random() * 1.2, stun: 0 };
    clampToArena(enemy, definition.radius); state.enemies.push(enemy); state.spawned++; return true;
  }
  function seedScene() {
    for (let i = 0; i < 4; i++) addOrbit(nextId());
    for (let i = 0; i < 6; i++) {
      const angle = i * TAU / 6 + 0.24, radius = 4.6 + (i % 2) * 1.0;
      addMoon(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    placeOrbits();
  }
  function reset(nextSeed = seed) {
    seed = Number.isFinite(nextSeed) ? Math.floor(nextSeed) >>> 0 : 82941;
    serial = 0; accumulator = 0;
    Object.assign(state, {
      mode: 'ready', wave: 1, waveTime: 0, ticks: 0, seed, random: seed,
      player: { x: 0, z: 0, dx: 0, dz: -1, hp: 100, maxHp: 100, invulnerable: 0 },
      orbits: [], moons: [], shots: [], enemies: [], bullets: [], effects: [], events: [],
      score: 0, kills: 0, waveKills: 0, combo: 0, bestCombo: 0, comboTime: 0,
      bursts: 0, launched: 0, collected: 0, maxOrbit: 0, damageTaken: 0,
      upgrades: { capacity: 0, power: 0, bounces: 0, speed: 0, magnet: 0, heart: 0 }, choices: [],
      bossSpawned: false, bossDefeated: false, spawned: 0, spawnIndex: 0, spawnTimer: 1,
      moonTimer: 2.5, reason: '',
    });
    seedScene(); return state;
  }
  function beginWave() {
    state.mode = 'playing'; state.waveTime = 0; state.waveKills = 0; state.spawned = 0; state.spawnIndex = 0;
    state.spawnTimer = 1.0; state.bossSpawned = false; state.bossDefeated = false; state.choices = [];
    state.enemies = []; state.bullets = []; accumulator = 0;
    const wave = WAVES[state.wave - 1];
    spawnEnemy(wave.pattern[state.spawnIndex++ % wave.pattern.length], -4.5, -4.6);
    spawnEnemy(wave.pattern[state.spawnIndex++ % wave.pattern.length], 4.5, -4.6);
    effect('wave', state.player.x, state.player.z, 0.9); event('wave', { wave: state.wave });
  }
  function start(nextSeed = seed) { reset(nextSeed); beginWave(); return state; }
  function pause() { if (state.mode === 'playing') { state.mode = 'paused'; accumulator = 0; return true; } return false; }
  function resume() { if (state.mode === 'paused') { state.mode = 'playing'; accumulator = 0; return true; } return false; }
  function nearest(x, z, ignored = 0, range = Infinity) {
    let chosen, best = range * range;
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0 || enemy.id === ignored) continue;
      const d = (enemy.x - x) ** 2 + (enemy.z - z) ** 2;
      if (d < best) { best = d; chosen = enemy; }
    }
    return chosen;
  }
  function aim(shot, target, fallbackX, fallbackZ) {
    const dx = target ? target.x - shot.x : fallbackX, dz = target ? target.z - shot.z : fallbackZ;
    const length = Math.hypot(dx, dz) || 1;
    shot.dx = dx / length * 8.4; shot.dz = dz / length * 8.4; shot.target = target?.id || 0;
  }
  function burst() {
    if (state.mode !== 'playing' || !state.orbits.length) return false;
    placeOrbits();
    const count = Math.min(state.orbits.length, MAX_SHOTS - state.shots.length);
    if (!count) return false;
    const storm = count >= 6;
    const orbiting = state.orbits.splice(0, count);
    for (const moon of orbiting) {
      const shot = { id: moon.id, x: moon.x, z: moon.z, dx: 0, dz: 0, age: 0, life: state.wave >= 3 ? 4.4 : 6,
        bounces: 1 + state.upgrades.bounces + Number(storm), damage: 2 + state.upgrades.power + Number(storm),
        storm, target: 0, lastHit: 0, ignore: 0 };
      aim(shot, nearest(shot.x, shot.z), shot.x - state.player.x, shot.z - state.player.z);
      state.shots.push(shot);
    }
    state.bursts++; state.launched += count; effect(storm ? 'storm' : 'burst', state.player.x, state.player.z, 0.8);
    event('burst', { count, storm }); placeOrbits(); return true;
  }
  function hitPlayer(damage) {
    const p = state.player;
    if (state.mode !== 'playing' || p.invulnerable > 0) return;
    const amount = Math.min(p.hp, damage); p.hp -= amount; state.damageTaken += amount; p.invulnerable = 1.05;
    state.combo = 0; state.comboTime = 0; effect('hurt', p.x, p.z); event('hurt', { damage: amount });
    if (p.hp <= 0) { state.mode = 'lost'; state.reason = 'Your star needs a little rest. Try releasing a full orbit when the crowd gathers.'; event('lost'); }
  }
  function damageEnemy(enemy, amount, chained = false) {
    if (enemy.hp <= 0 || state.mode !== 'playing') return false;
    enemy.hp = Math.max(0, enemy.hp - amount); enemy.hit = 0.16; enemy.stun = Math.max(enemy.stun, 0.12);
    effect(chained ? 'chain' : 'hit', enemy.x, enemy.z, 0.45);
    if (enemy.hp > 0) { event('hit', { enemy: enemy.type }); return false; }
    state.kills++; state.waveKills++; state.combo++; state.comboTime = 4; state.bestCombo = Math.max(state.bestCombo, state.combo);
    const multiplier = Math.min(5, 1 + Math.floor((state.combo - 1) / 4));
    const points = ENEMIES[enemy.type].points * multiplier; state.score += points;
    effect('kill', enemy.x, enemy.z, 0.75); event('kill', { enemy: enemy.type, points, combo: state.combo });
    if (enemy.type === 'boss') { state.bossDefeated = true; return true; }
    const count = enemy.type === 'shooter' ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const angle = random() * TAU, offset = 0.25 + random() * 0.5;
      addMoon(enemy.x + Math.cos(angle) * offset, enemy.z + Math.sin(angle) * offset);
    }
    // A pop can set off nearby visitors. Chains never damage the player.
    let linked = 0;
    for (const neighbor of state.enemies) if (neighbor.hp > 0 && neighbor !== enemy && distance(neighbor, enemy) < 1.35) {
      linked++; damageEnemy(neighbor, 1, true);
    }
    if (linked) event('chain', { count: linked });
    return true;
  }
  function toMoon(shot) { addMoon(shot.x, shot.z, shot.id); shot.life = 0; }
  function finishWave() {
    if (state.mode !== 'playing') return;
    const current = WAVES[state.wave - 1];
    if (current.boss) {
      if (!state.bossSpawned && state.waveKills >= current.goal && spawnEnemy('boss', 0, -5.8)) {
        state.bossSpawned = true; effect('wave', 0, -5.8, 1); event('boss');
      }
      if (state.bossDefeated) { state.mode = 'won'; state.score += 1000 + Math.round(state.player.hp * 5); state.enemies = []; state.bullets = []; state.shots = []; effect('wave', 0, 0, 1); event('won'); accumulator = 0; }
      return;
    }
    if (state.waveKills < current.goal) return;
    state.mode = 'upgrade'; state.enemies = []; state.bullets = [];
    // Returning moons preserves what the player was holding when the wave ended.
    for (const shot of state.shots) if (!addOrbit(shot.id)) addMoon(shot.x, shot.z, shot.id);
    state.shots = [];
    const ids = Object.keys(UPGRADES), selected = [];
    while (selected.length < 3) { const i = Math.floor(random() * ids.length); selected.push(ids.splice(i, 1)[0]); }
    state.choices = selected.map(id => ({ ...UPGRADES[id] }));
    event('upgradeReady', { wave: state.wave }); accumulator = 0; placeOrbits();
  }
  function chooseUpgrade(id) {
    if (state.mode !== 'upgrade' || !state.choices.some(choice => choice.id === id) || !UPGRADES[id]) return false;
    state.upgrades[id]++;
    const p = state.player;
    if (id === 'heart') { p.maxHp += 15; p.hp = Math.min(p.maxHp, p.hp + 32); }
    p.hp = Math.min(p.maxHp, p.hp + 15);
    // A fresh set makes every next wave playable even after a difficult finish.
    while (state.orbits.length < 4) addOrbit(nextId());
    state.wave++; event('upgrade', { id }); beginWave(); return true;
  }
  function shoot(x, z, angle, speed = 3.2) {
    if (state.bullets.length >= MAX_BULLETS) return;
    state.bullets.push({ id: nextId(), x, z, dx: Math.cos(angle) * speed, dz: Math.sin(angle) * speed, life: 7 });
  }
  function step(input) {
    state.ticks++; state.waveTime += STEP;
    const p = state.player, wave = WAVES[state.wave - 1];
    p.invulnerable = Math.max(0, p.invulnerable - STEP); state.comboTime = Math.max(0, state.comboTime - STEP);
    if (!state.comboTime) state.combo = 0;
    let x = clamp(Number(input.x) || 0, -1, 1), z = clamp(Number(input.z) || 0, -1, 1);
    const magnitude = Math.hypot(x, z); if (magnitude > 1) { x /= magnitude; z /= magnitude; }
    if (magnitude > 0.08) { const norm = Math.hypot(x, z); p.dx = x / norm; p.dz = z / norm; }
    const speed = 4.6 + state.upgrades.speed * 0.55;
    p.x += x * speed * STEP; p.z += z * speed * STEP; clampToArena(p, 0.48); placeOrbits();

    state.moonTimer = Math.max(0, state.moonTimer - STEP);
    if (!state.moonTimer) {
      if (state.moons.length < 10 && state.orbits.length < capacity()) {
        const a = random() * TAU, r = 2.4 + random() * 4.1; addMoon(Math.cos(a) * r, Math.sin(a) * r);
      }
      state.moonTimer = 2.5;
    }
    for (const moon of state.moons) {
      moon.age += STEP; moon.cooldown = Math.max(0, moon.cooldown - STEP);
      if (!moon.cooldown && state.orbits.length < capacity() && distance(moon, p) < 1.05 + state.upgrades.magnet * 0.5) {
        if (addOrbit(moon.id)) { moon.age = -1; state.collected++; effect('collect', moon.x, moon.z); event('collect', { count: 1 }); }
      }
    }
    state.moons = state.moons.filter(moon => moon.age >= 0);
    state.spawnTimer = Math.max(0, state.spawnTimer - STEP);
    if (!state.spawnTimer && !state.bossSpawned) {
      spawnEnemy(wave.pattern[state.spawnIndex++ % wave.pattern.length]); state.spawnTimer = wave.interval;
    }
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0 || state.mode !== 'playing') continue;
      enemy.age += STEP; enemy.hit = Math.max(0, enemy.hit - STEP); enemy.stun = Math.max(0, enemy.stun - STEP);
      enemy.shotTimer = Math.max(0, enemy.shotTimer - STEP);
      const dx = p.x - enemy.x, dz = p.z - enemy.z, d = Math.hypot(dx, dz) || 0.001;
      enemy.angle = Math.atan2(dx, dz);
      let direction = 1;
      if (enemy.type === 'shooter') direction = d > 4.0 ? 1 : d < 2.8 ? -0.65 : 0;
      if (enemy.type === 'boss') direction = d > 3.1 ? 1 : d < 2.2 ? -0.5 : 0;
      if (!enemy.stun) {
        const speed = ENEMIES[enemy.type].speed * (1 + (state.wave - 1) * 0.11);
        enemy.x += dx / d * speed * STEP * direction; enemy.z += dz / d * speed * STEP * direction; clampToArena(enemy, enemy.radius);
      }
      if ((enemy.type === 'shooter' || enemy.type === 'boss') && !enemy.shotTimer) {
        const angle = Math.atan2(dz, dx);
        if (enemy.type === 'boss') for (let i = 0; i < 8; i++) shoot(enemy.x, enemy.z, angle + i * TAU / 8, 2.8);
        else shoot(enemy.x, enemy.z, angle, 3.0);
        enemy.shotTimer = enemy.type === 'boss' ? 2.8 : 3.3; effect('hit', enemy.x, enemy.z, 0.35);
      }
      // An orbit can absorb a close visitor, but it is spent on impact.
      const index = state.orbits.findIndex(moon => Math.hypot(moon.x - enemy.x, moon.z - enemy.z) < enemy.radius + 0.23);
      if (index >= 0) {
        const [moon] = state.orbits.splice(index, 1); damageEnemy(enemy, 1); addMoon(moon.x, moon.z, moon.id, 0.8); placeOrbits();
      }
      if (state.bossDefeated) { finishWave(); return; }
      if (!wave.boss && state.waveKills >= wave.goal) break;
      if (enemy.hp > 0 && distance(enemy, p) < enemy.radius + 0.45) {
        hitPlayer(enemy.type === 'boss' ? 18 : enemy.type === 'dasher' ? 14 : 11);
        const away = Math.hypot(enemy.x - p.x, enemy.z - p.z) || 1;
        enemy.x += (enemy.x - p.x) / away * 0.65; enemy.z += (enemy.z - p.z) / away * 0.65; clampToArena(enemy, enemy.radius);
      }
    }
    if (!wave.boss && state.waveKills >= wave.goal) { finishWave(); return; }
    for (const shot of state.shots) {
      if (shot.life <= 0 || state.mode !== 'playing') continue;
      shot.age += STEP; shot.life = Math.max(0, shot.life - STEP); shot.ignore = Math.max(0, shot.ignore - STEP);
      // The initial throw aims anywhere. After its first moments, a moon seeks
      // only nearby visitors, so a large old swarm can't clear the whole sky.
      const seekRange = state.wave >= 3 && shot.age >= 0.45 ? 4.8 : Infinity;
      let target = state.enemies.find(e => e.id === shot.target && e.hp > 0 && !(shot.ignore > 0 && e.id === shot.lastHit) && distance(shot, e) <= seekRange);
      if (!target) target = nearest(shot.x, shot.z, shot.ignore > 0 ? shot.lastHit : 0, seekRange);
      if (target) {
        const dx = target.x - shot.x, dz = target.z - shot.z, d = Math.hypot(dx, dz) || 1, turn = 3.8 * STEP;
        shot.dx += (dx / d * 8.4 - shot.dx) * turn; shot.dz += (dz / d * 8.4 - shot.dz) * turn;
        const speed = Math.hypot(shot.dx, shot.dz) || 1; shot.dx *= 8.4 / speed; shot.dz *= 8.4 / speed; shot.target = target.id;
      }
      shot.x += shot.dx * STEP; shot.z += shot.dz * STEP;
      const edge = Math.hypot(shot.x, shot.z), limit = ARENA_RADIUS - 0.2;
      if (edge > limit) {
        const nx = shot.x / edge, nz = shot.z / edge, dot = shot.dx * nx + shot.dz * nz;
        shot.x = nx * limit; shot.z = nz * limit;
        if (dot > 0) {
          shot.dx -= 2 * dot * nx; shot.dz -= 2 * dot * nz; shot.target = 0;
          if (shot.bounces > 0) shot.bounces--; else { toMoon(shot); continue; }
        }
      }
      for (const enemy of state.enemies) {
        if (enemy.hp <= 0 || (shot.ignore > 0 && enemy.id === shot.lastHit)) continue;
        if (distance(shot, enemy) < enemy.radius + 0.22) {
          damageEnemy(enemy, shot.damage); shot.lastHit = enemy.id; shot.ignore = 0.24;
          if (shot.bounces > 0) {
            shot.bounces--;
            const target = nearest(shot.x, shot.z, enemy.id, state.wave >= 3 ? 4.8 : Infinity);
            aim(shot, target, shot.x - enemy.x, shot.z - enemy.z);
          } else toMoon(shot);
          break;
        }
      }
      if (shot.life > 0 && shot.age > 0.5 && state.orbits.length < capacity() && distance(shot, p) < 0.6) {
        if (addOrbit(shot.id)) { shot.life = 0; state.collected++; effect('collect', p.x, p.z); event('collect', { count: 1 }); }
      }
      if (!shot.life && !state.moons.some(moon => moon.id === shot.id) && !state.orbits.some(moon => moon.id === shot.id)) addMoon(shot.x, shot.z, shot.id);
      if (state.bossDefeated) { finishWave(); return; }
    }
    state.shots = state.shots.filter(shot => shot.life > 0);
    if (!wave.boss && state.waveKills >= wave.goal) { finishWave(); return; }
    for (const bullet of state.bullets) {
      if (state.mode !== 'playing') break;
      bullet.life = Math.max(0, bullet.life - STEP); bullet.x += bullet.dx * STEP; bullet.z += bullet.dz * STEP;
      if (Math.hypot(bullet.x, bullet.z) > ARENA_RADIUS + 0.1) { bullet.life = 0; continue; }
      const index = state.orbits.findIndex(moon => Math.hypot(moon.x - bullet.x, moon.z - bullet.z) < 0.38);
      if (index >= 0) {
        const [moon] = state.orbits.splice(index, 1); bullet.life = 0; addMoon(moon.x, moon.z, moon.id, 0.8); effect('hit', moon.x, moon.z); placeOrbits();
      } else if (distance(bullet, p) < 0.52) { bullet.life = 0; hitPlayer(9); }
    }
    state.enemies = state.enemies.filter(enemy => enemy.hp > 0);
    state.bullets = state.bullets.filter(bullet => bullet.life > 0);
    for (const item of state.effects) item.age += STEP;
    state.effects = state.effects.filter(item => item.age < item.duration);
    if (state.mode === 'playing') finishWave();
  }
  function advance(seconds, input = {}) {
    if (state.mode !== 'playing' || !Number.isFinite(seconds) || seconds <= 0) return;
    accumulator += Math.min(seconds, 1);
    let steps = 0;
    while (accumulator + 1e-8 >= STEP && state.mode === 'playing' && steps++ < 61) { accumulator -= STEP; step(input); }
    if (state.mode !== 'playing') accumulator = 0;
  }
  function snapshot() {
    if (!['playing', 'paused', 'upgrade', 'won'].includes(state.mode)) return null;
    const { effects, events, ...data } = state;
    return JSON.parse(JSON.stringify({ schema: 1, ...data, serial }));
  }
  function restore(saved) {
    const data = parseMoonbounceSave(saved); if (!data) return false;
    seed = data.seed; serial = data.serial; accumulator = 0;
    Object.assign(state, data, { effects: [], events: [] });
    if (state.mode === 'playing') state.mode = 'paused';
    placeOrbits(); return true;
  }
  reset();
  return { state, start, reset, pause, resume, advance, burst, chooseUpgrade, snapshot, restore };
}

// A malformed, oversized or incompatible run never changes the active game.
// Only known fields are returned so a storage edit cannot add runtime behavior.
export function parseMoonbounceSave(saved) {
  const number = (value, low = 0, high = 10000000) => Number.isFinite(value) && value >= low && value <= high;
  const integer = (value, low, high) => Number.isInteger(value) && number(value, low, high);
  if (!saved || saved.schema !== 1 || !['playing', 'paused', 'upgrade', 'won'].includes(saved.mode)) return null;
  if (!integer(saved.wave, 1, WAVES.length) || !integer(saved.seed, 0, 0xffffffff) || !integer(saved.random, 0, 0xffffffff)
    || !integer(saved.serial, 1, 10000000) || !integer(saved.ticks, 0, 10000000) || !number(saved.waveTime, 0, 200000)
    || saved.waveTime > saved.ticks * STEP + 0.001) return null;
  if (!saved.upgrades || !Object.keys(UPGRADES).every(id => integer(saved.upgrades[id], 0, 4))
    || Object.keys(UPGRADES).reduce((sum, id) => sum + saved.upgrades[id], 0) !== saved.wave - 1) return null;
  const p = saved.player;
  if (!p || !number(p.x, -ARENA_RADIUS, ARENA_RADIUS) || !number(p.z, -ARENA_RADIUS, ARENA_RADIUS)
    || !number(p.dx, -1.000001, 1.000001) || !number(p.dz, -1.000001, 1.000001)
    || p.maxHp !== 100 + saved.upgrades.heart * 15 || !number(p.hp, 0.001, p.maxHp) || !number(p.invulnerable, 0, 1.05)) return null;
  const counterKeys = ['score', 'kills', 'waveKills', 'combo', 'bestCombo', 'bursts', 'launched', 'collected', 'maxOrbit', 'spawned', 'spawnIndex'];
  if (!counterKeys.every(key => integer(saved[key], 0, 10000000)) || saved.waveKills > saved.kills || saved.combo > saved.kills
    || saved.bestCombo > saved.kills || saved.maxOrbit > MAX_ORBITS || !number(saved.comboTime, 0, 4)
    || !number(saved.damageTaken, 0, 10000000) || !number(saved.spawnTimer, 0, 2) || !number(saved.moonTimer, 0, 2.5)
    || typeof saved.bossSpawned !== 'boolean' || typeof saved.bossDefeated !== 'boolean'
    || typeof saved.reason !== 'string' || saved.reason.length > 200) return null;
  const position = item => item && integer(item.id, 1, saved.serial) && number(item.x, -9, 9) && number(item.z, -9, 9);
  const list = (value, max, predicate) => Array.isArray(value) && value.length <= max && value.every(item => position(item) && predicate(item));
  if (!list(saved.orbits, Math.min(MAX_ORBITS, 10 + saved.upgrades.capacity * 3), item => number(item.angle, -1000000, 1000000))) return null;
  if (!list(saved.moons, MAX_MOONS, item => number(item.age, 0, 10000000) && number(item.cooldown, 0, 0.8))) return null;
  if (!list(saved.shots, MAX_SHOTS, item => number(item.dx, -9, 9) && number(item.dz, -9, 9)
    && number(item.age, 0, 6) && number(item.life, 0.001, 6) && integer(item.bounces, 0, 6) && integer(item.damage, 2, 7)
    && (item.storm === undefined || typeof item.storm === 'boolean')
    && integer(item.target, 0, saved.serial) && integer(item.lastHit, 0, saved.serial) && number(item.ignore, 0, 0.24))) return null;
  // Keep runs made before a balance adjustment playable. Their existing foes
  // retain their saved health; newly spawned foes use the current values.
  const validEnemyHealth = item => item.type === 'boss' ? [48, 140, 180, ENEMIES.boss.hp].includes(item.maxHp)
    : integer(item.maxHp, ENEMIES[item.type].hp, enemyHealth(item.type, saved.wave));
  if (!list(saved.enemies, MAX_ENEMIES, item => Object.hasOwn(ENEMIES, item.type) && validEnemyHealth(item)
    && item.radius === ENEMIES[item.type].radius && number(item.hp, 0.001, item.maxHp) && number(item.age, 0, 10000000)
    && number(item.angle, -Math.PI, Math.PI) && number(item.hit, 0, 0.16) && number(item.stun, 0, 0.12) && number(item.shotTimer, 0, 3.3))) return null;
  if (!list(saved.bullets, MAX_BULLETS, item => number(item.dx, -4, 4) && number(item.dz, -4, 4) && number(item.life, 0.001, 7))) return null;
  if (saved.maxOrbit < saved.orbits.length) return null;
  const all = [...saved.orbits, ...saved.moons, ...saved.shots, ...saved.enemies, ...saved.bullets];
  if (new Set(all.map(item => item.id)).size !== all.length) return null;
  if (!Array.isArray(saved.choices) || (saved.mode === 'upgrade' ? saved.choices.length !== 3 : saved.choices.length !== 0)
    || !saved.choices.every(item => item && Object.hasOwn(UPGRADES, item.id)) || new Set(saved.choices.map(item => item.id)).size !== saved.choices.length) return null;
  if (saved.mode === 'upgrade' && (saved.wave >= 5 || saved.waveKills < WAVES[saved.wave - 1].goal || saved.enemies.length || saved.shots.length || saved.bullets.length)) return null;
  if ((saved.bossSpawned || saved.bossDefeated) && saved.wave !== 5) return null;
  if (saved.mode === 'won' && (saved.wave !== 5 || !saved.bossSpawned || !saved.bossDefeated)) return null;
  if (saved.bossDefeated && saved.mode !== 'won') return null;
  const fields = ['schema', 'mode', 'wave', 'waveTime', 'ticks', 'seed', 'random', 'serial', 'player', 'orbits', 'moons', 'shots', 'enemies', 'bullets', 'score', 'kills', 'waveKills', 'combo', 'bestCombo', 'comboTime', 'bursts', 'launched', 'collected', 'maxOrbit', 'damageTaken', 'upgrades', 'choices', 'bossSpawned', 'bossDefeated', 'spawned', 'spawnIndex', 'spawnTimer', 'moonTimer', 'reason'];
  const data = JSON.parse(JSON.stringify(Object.fromEntries(fields.map(key => [key, saved[key]]))));
  data.choices = data.choices.map(choice => ({ ...UPGRADES[choice.id] }));
  return data;
}
