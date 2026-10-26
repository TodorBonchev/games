// A legal player strategy: collect available sun and buy a balanced defense.
// No resources, cooldowns, enemy health or state are overwritten.
export function playGarden(game) {
  const rows = [...new Set(game.level.enemies.map(enemy => enemy.row))];
  game.place('bloom', 0, 0);
  game.place('pea', rows[0], 1);
  let secondBloom = false;
  for (let turn = 0; turn < 2000 && game.state.mode === 'playing'; turn++) {
    for (const sun of [...game.state.suns]) game.collectSun(sun.id);
    if (!secondBloom) secondBloom = game.place('bloom', 1, 0).ok;
    const plan = [...rows.map(row => ['pea', row, 1]), ...rows.map(row => ['pea', row, 2]), ...rows.map(row => ['nut', row, 5]), ...rows.map(row => ['pea', row, 3])];
    for (const [type, row, col] of plan) {
      if (!game.state.plants.some(plant => plant.row === row && plant.col === col)) { game.place(type, row, col); break; }
    }
    game.tick(0.25);
  }
  return game.state;
}
