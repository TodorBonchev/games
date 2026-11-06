import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerForces } from '../selva/app/src/world/forces.ts';

test('pausing a rooted, partially shoved pilgrim preserves the remaining movement on resume', () => {
  const forces = new PlayerForces(), movement = { x: 0, y: 0 };
  forces.status(.5, true, 1000, 100);
  forces.shove(4, 0, 1000, 100);
  forces.displacement(movement, 600);
  assert.equal(movement.x, 3);
  forces.shiftTime(60000);
  assert.equal(forces.rooted(60600), true);
  assert.equal(forces.speedMul(60600), 0);
  forces.displacement(movement, 60600);
  assert.equal(movement.x, 0, 'resuming cannot jump through the remaining shove');
  forces.displacement(movement, 61100);
  assert.equal(movement.x, 1, 'only the remaining displacement is applied');
  assert.equal(forces.rooted(61100), false);
  assert.equal(forces.speedMul(61100), 1);
});
