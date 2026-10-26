// A playtester that can only use the same controls as a human. No state edits,
// enemy deletion, gifted resources, forced victories, or shortened clocks.
// Kept self-contained so browser tests can run it against the actual game too.
export function createWeaver(game, { triangleArea, insideTriangle, edgeDistance, bloomPosition, PORTALS }) {
  let target, tick = 0;
  return function playStep() {
    const s = game.state;
    if (s.mode === 'between') { game.nextLoop(); target = null; }
    if (s.mode !== 'playing') return;
    const bloom = s.blooms.find(b => b.index < s.loop && b.charge < b.need);
    const rest = !bloom && !s.bossAwake || s.bossAwake && s.hp < 36 && s.loop < s.maxLoops;
    if (tick++ % 20 === 0 || !target) {
      let best = -Infinity;
      for (let x = -7; x <= 7; x += 0.7) for (let z = -7; z <= 7; z += 0.7) {
        if (Math.hypot(x, z) > 7.8) continue;
        const triangle = [[x, z], ...s.sail.slice(1)], area = triangleArea(...triangle);
        let value = Math.min(45, area) * 0.16 - Math.hypot(x - s.player.x, z - s.player.z) * 1.2;
        if (bloom) {
          const [bx, bz] = bloomPosition(game.room, bloom.index, s.loopTicks / 60 + 0.4);
          if (area >= 8 && insideTriangle(bx, bz, triangle) && (!game.room.edge || edgeDistance(bx, bz, triangle) <= (s.difficulty === 'flow' ? 1.3 : 0.8))) value += s.beats >= 1 ? 60 : 10;
        }
        if (s.bossAwake && area >= 22 && insideTriangle(0, -0.3, triangle)) value += 80;
        for (const enemy of s.enemies) {
          if (area >= 8 && insideTriangle(enemy.x, enemy.z, triangle)) value += 3;
          if (Math.hypot(enemy.x - x, enemy.z - z) < 1.7) value -= 10;
        }
        if (rest) { const portal = PORTALS[(s.loop - 1) % 3]; value -= Math.hypot(x - portal[0], z - portal[1]) * 100; }
        for (const [ox, oz, radius] of game.room.obstacles) if (Math.hypot(x - ox, z - oz) < radius + 0.7) value -= 200;
        if (value > best) { best = value; target = [x, z]; }
      }
    }
    const dx = target[0] - s.player.x, dz = target[1] - s.player.z, distance = Math.max(1, Math.hypot(dx, dz));
    if (s.enemies.some(enemy => Math.hypot(enemy.x - s.player.x, enemy.z - s.player.z) < 1.1)) game.dash();
    game.advance(1 / 60, { x: dx / distance, z: dz / distance, pulse: true });
    if (s.mode === 'playing' && rest && s.loopTicks > 600 && Math.hypot(s.player.x - PORTALS[(s.loop - 1) % 3][0], s.player.z - PORTALS[(s.loop - 1) % 3][1]) < 1) game.bank();
  };
}
