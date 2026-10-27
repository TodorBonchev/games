// Public-action-only pilot: try plausible pulls against the same preview a
// player sees, then launch and let real physics carry the frog to each pad.
// Self-contained for reuse in a real-browser check.
export function solvePondPost(game, levels, { onStep, stride = 1, waitAtPad } = {}) {
  const predictions = [];
  let waits = 0, attempts = 0, lastWaitedJump = -1;
  while (game.state.mode !== 'won' && attempts++ < 100) {
    if (game.state.mode === 'paused') game.resume();
    if (game.state.mode === 'recovering' || game.state.mode === 'flying') {
      game.advance(1 / 60); onStep?.(game); continue;
    }
    if (game.state.mode !== 'playing') break;
    if (waitAtPad && lastWaitedJump !== game.state.jumps) {
      let seconds = Math.max(0, Math.min(60, Number(waitAtPad(game.state.padId, game.state.jumps, game.state.level)) || 0));
      while (seconds > 0) { const slice = Math.min(1, seconds); game.advance(slice); onStep?.(game); seconds -= slice; }
      lastWaitedJump = game.state.jumps;
    }
    const target = Math.min(levels[game.state.level - 1].goalPad, game.state.padId + stride);
    if (!game.beginAim()) break;
    let best = null;
    for (const vy of [7.6, 8.4, 9.2, 10, 10.8]) {
      for (let j = -24; j <= 24; j++) {
        const vx = j * 0.25;
        if (Math.hypot(vx, vy) > 12) continue;
        game.aim({ vx, vy }); const landing = game.preview().landing;
        if (!landing || landing.padId !== target) continue;
        if (!best || landing.perfect) best = { vx, vy, landing };
        if (landing.perfect) break;
      }
      if (best?.landing.perfect) break;
    }
    if (!best) {
      game.cancelAim(); game.advance(0.25); onStep?.(game);
      if (++waits > 80) break;
      continue;
    }
    waits = 0; game.aim(best); const prediction = game.preview().landing;
    if (!game.launch()) break;
    for (let tick = 0; tick < 240 && game.state.mode === 'flying'; tick++) { game.advance(1 / 60); onStep?.(game); }
    predictions.push({ expected: prediction, actualPad: game.state.padId, actualX: game.state.player.x, actualY: game.state.player.y });
    while (game.state.mode === 'recovering') { game.advance(1 / 60); onStep?.(game); }
  }
  return { mode: game.state.mode, level: game.state.level, stars: game.state.stars, jumps: game.state.jumps, misses: game.state.misses, perfects: game.state.perfects, stamps: game.state.stamps.filter(item => item.collected).length, predictions };
}
