import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpside, LEVELS } from '../upside-game.js';
import { collectorPlay } from './upside-collector-bot.mjs';

const storage = { getItem: () => null, setItem() {} };
for (const level of LEVELS) test(`all three stars and exit are reachable in world ${level.id} by a forward-only normal run`, { timeout: 30000 }, () => {
  const planner = createUpside({ storage }); planner.start(level.id);
  const route = collectorPlay(planner);
  assert.ok(['cleared', 'won'].includes(route.mode), `planner ended ${route.mode}`);
  assert.deepEqual(route.stars, [1, 2, 3]);
  const replay = createUpside({ storage }); replay.start(level.id);
  // From this point the proof only submits ordinary inputs; no snapshot restore,
  // teleport, invulnerability, assisted mode, or injected collectible state.
  for (const input of route.inputs) {
    replay.step(1 / 60, input);
    assert.ok(!['dying', 'lost'].includes(replay.state.mode), 'route must survive every frame');
  }
  assert.equal(replay.state.mode, level.id === LEVELS.length ? 'won' : 'cleared');
  assert.equal(replay.state.assist, false);
  assert.equal(replay.state.result.stars, 3);
  assert.equal(replay.state.result.deaths, 0);
  assert.deepEqual(replay.state.result.medals, { clear: true, collector: true, clean: true });
});
