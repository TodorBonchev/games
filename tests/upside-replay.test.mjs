import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpside, LEVELS } from '../upside-game.js';
import { botPlay } from './upside-bot.mjs';

const memory = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
};

for (const level of LEVELS) {
  test(`world ${level.id} completes in a fresh, forward-only input replay`, { timeout: 90000 }, () => {
    const planner = createUpside({ storage: memory() });
    planner.start(level.id);
    const route = botPlay(planner, { record: true });
    const expectedMode = level.id === LEVELS.at(-1).id ? 'won' : 'cleared';
    assert.equal(route.mode, expectedMode, 'planner found a complete route');
    assert.ok(route.replay.length > 60, 'route contains actual movement inputs');

    // This instance is never restored, teleported, made invulnerable, or advanced
    // by anything except the same public start/step API used by the browser.
    const game = createUpside({ storage: memory() });
    game.start(level.id);
    game.restore = () => { throw new Error('Replay must never restore a snapshot'); };
    for (const input of route.replay) game.step(route.dt, input);

    assert.equal(game.state.mode, expectedMode);
    assert.equal(game.state.score, planner.state.score);
    assert.equal(game.state.lives, planner.state.lives);
    assert.equal(game.state.check, planner.state.check);
    assert.equal(game.state.player.x, planner.state.player.x);
    assert.equal(game.state.player.y, planner.state.player.y);
    assert.ok(game.state.player.flips > 0, 'route uses the gravity mechanic');
  });
}
