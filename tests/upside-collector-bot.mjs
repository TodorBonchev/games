import { makePlans, inputAt } from './upside-bot.mjs';

// Plan toward the next star before pursuing the exit. All returned inputs can be
// replayed from an ordinary fresh game; search snapshots never enter the replay.
const PLANS = makePlans();
for (const dir of [-1, 0]) for (const jd of [0, .1, .25, 2]) for (const fa of [0, .2, .45, .8]) PLANS.push({ dir, jd, fa, re: false });

export function collectorPlay(game, { maxDecisions = 600 } = {}) {
  const S = game.state, dt = 1 / 60, inputs = [];
  const score = () => {
    if (['flag', 'cleared', 'won'].includes(S.mode)) return S.levelStats.stars.length === 3 ? 1e7 : -1e7;
    const p = S.player, target = S.stars.find(s => !s.collected);
    if (!target) return 30000 + p.x;
    const progress = p.x > target.x - 8 ? target.x - Math.abs(p.x - target.x) * 2 - Math.abs(p.y - target.y) * .8 : p.x;
    return S.levelStats.stars.length * 10000 + progress;
  };
  let decisions = 0;
  while (['playing', 'flag'].includes(S.mode) && decisions++ < maxDecisions) {
    if (S.mode === 'flag') { game.step(dt); inputs.push({}); continue; }
    const snapshot = game.snapshot();
    let best = null, bestScore = -Infinity;
    for (const plan of PLANS) {
      game.restore(snapshot); let failed = false;
      for (let i = 0; i < 84; i++) {
        game.step(dt, inputAt(plan, i * dt, dt));
        if (['flag', 'cleared', 'won'].includes(S.mode)) break;
        if (S.mode !== 'playing' || S.lives < snapshot.lives) { failed = true; break; }
      }
      const value = score() - (failed ? 1e6 : 0) + (plan.fa === null ? .05 : 0) + (plan.dir === 1 ? .02 : 0);
      if (value > bestScore) { best = plan; bestScore = value; }
    }
    game.restore(snapshot);
    if (!best || bestScore < -1e5) break;
    for (let i = 0; i < 12 && S.mode === 'playing'; i++) {
      const input = inputAt(best, i * dt, dt); game.step(dt, input); inputs.push(input);
    }
  }
  return { mode: S.mode, stars: [...S.levelStats.stars], inputs, decisions };
}
