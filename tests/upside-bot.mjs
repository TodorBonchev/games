// Look-ahead bot with backtracking: tries short input plans in a cloned simulation, commits to the best,
// and rewinds earlier decisions when every option from a state ends badly. Used to prove each level is completable.
export function makePlans() {
  const plans = [];
  for (const jd of [0, .1, .25, 2]) for (const fa of [null, 0, .1, .2, .3, .45, .6, .8]) plans.push({ dir: 1, jd, fa, re: false });
  for (const fa of [null, .2, .4]) plans.push({ dir: 1, jd: 2, fa, re: true });
  for (const d of [0, -1]) for (const jd of [0, .1, .25, 2]) plans.push({ dir: d, jd, fa: null, re: false });
  return plans;
}
const PLANS = makePlans();
export const inputAt = (pl, t, dt) => ({ right: pl.dir > 0, left: pl.dir < 0, run: true, jump: pl.re && t < dt * 1.5 ? false : t < pl.jd, flip: pl.fa !== null && t >= pl.fa && t < pl.fa + dt * 3 });
const live = m => m === 'playing' || m === 'dying' || m === 'flag';
export function botPlay(g, { dt = 1 / 60, horizon = 1.4, every = .2, maxBacktracks = 400, record = false } = {}) {
  const S = g.state, steps = Math.round(every / dt), stack = [], replay = [];
  // Record only committed inputs. Speculative search steps are never in this tape;
  // rewinding a decision also removes its abandoned inputs.
  const commit = input => { if (record) replay.push({ ...input }); g.step(dt, input); };
  let backtracks = 0, guard = 0;
  while (live(S.mode) && guard++ < 20000) {
    if (S.mode !== 'playing') { commit({}); continue; }
    const top = stack.at(-1), pending = top?.pending, snap = pending ? top.snap : g.snapshot(), banned = pending ? top.banned : new Set();
    let best = -1, bestScore = -Infinity;
    PLANS.forEach((pl, idx) => {
      if (banned.has(idx)) return;
      g.restore(snap); const lives = S.lives, power = S.player.power; let bad = 0;
      for (let i = 0, t = 0; i < horizon / dt; i++, t += dt) { g.step(dt, inputAt(pl, t, dt)); if (S.mode === 'flag' || S.mode === 'cleared' || S.mode === 'won') break; if (S.mode !== 'playing' || S.lives < lives) { bad = 2; break; } }
      if (!bad && S.player.power < power) bad = 1;
      const sc = (live(S.mode) && S.mode !== 'flag' ? 0 : S.mode === 'playing' ? 0 : 1e6) + S.player.x - bad * 1e4 + (pl.fa === null ? .3 : 0) + (pl.dir === 1 ? .2 : 0);
      if (sc > bestScore) { bestScore = sc; best = idx; }
    });
    g.restore(snap);
    if (bestScore < -15000 && backtracks < maxBacktracks && stack.length) {
      // every option dies: rewind one decision (deeper each time that one is exhausted) and ban its choice
      backtracks++; if (pending) stack.pop();
      let entry = stack.pop(); while (entry.banned.size >= PLANS.length - 1 && stack.length) entry = stack.pop();
      entry.banned.add(entry.choice); g.restore(entry.snap); replay.length = entry.replayLength;
      stack.push({ snap: entry.snap, banned: entry.banned, replayLength: entry.replayLength, pending: true }); continue;
    }
    if (pending) stack.pop();
    stack.push({ snap, banned, choice: best, replayLength: replay.length }); if (stack.length > 12) stack.shift();
    const pl = PLANS[best];
    for (let i = 0; i < steps && S.mode === 'playing'; i++) commit(inputAt(pl, i * dt, dt));
  }
  return { mode: S.mode, backtracks, ...(record ? { replay, dt } : {}) };
}
