// A small automated playtester. It uses only the same steering, lift and upgrade
// choices as a person: no granted moons, shortened waves or forced victories.
export function createMoonbouncePilot(game) {
  let release = 0;
  return function playStep() {
    const state = game.state;
    if (state.mode === 'upgrade') game.chooseUpgrade(state.choices[0].id);
    if (state.mode !== 'playing') return;
    const p = state.player;
    let nearest = null, best = Infinity;
    for (const moon of state.moons) {
      if (moon.cooldown) continue;
      const d = Math.hypot(moon.x - p.x, moon.z - p.z);
      if (d < best) { nearest = moon; best = d; }
    }
    let x = 0, z = 0;
    if (nearest) { x = nearest.x - p.x; z = nearest.z - p.z; const d = Math.hypot(x, z) || 1; x /= d; z /= d; }
    for (const enemy of state.enemies) {
      const dx = p.x - enemy.x, dz = p.z - enemy.z, d = Math.hypot(dx, dz) || 1;
      if (d < enemy.radius + 1.1) { x += dx / d * 1.4; z += dz / d * 1.4; }
    }
    if (release-- <= 0) { if (state.orbits.length >= 2) game.burst(); release = 90; }
    game.advance(1 / 60, { x, z });
  };
}
