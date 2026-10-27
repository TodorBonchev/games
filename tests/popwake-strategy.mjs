// Drives one authored path with the same public actions as a player. This is
// intentionally self-contained so a browser check can run it without cheating.
export function solvePopwake(game, solution) {
  if (game.state.mode === 'ready') game.start();
  if (game.state.mode === 'paused') game.resume();
  if (game.state.mode === 'failed') game.retry();
  if (!game.begin(solution[0])) throw new Error('Could not begin at the starter');
  for (const point of solution.slice(1)) if (!game.drag(point)) throw new Error(`Cannot reach ${point.x},${point.z}`);
  if (!game.release()) throw new Error('The completed trail did not start');
  for (let i = 0; i < 600 && game.state.mode === 'running'; i++) game.advance(1 / 60);
  return game.state.mode;
}
