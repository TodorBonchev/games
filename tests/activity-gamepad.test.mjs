import test from 'node:test';
import assert from 'node:assert/strict';
import { createActivityGamepad } from '../activities/gamepad.js';

function setup(initial = {}) {
  const pad = { id: 'test-standard', index: 0, connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), ...initial };
  let pads = [pad];
  const controls = createActivityGamepad({ getPads: () => pads });
  const press = (index, value = 1) => { pad.buttons[index] = { pressed: value === 1, value }; };
  const neutral = () => { pad.axes.fill(0); for (let i = 0; i < pad.buttons.length; i++) press(i, 0); };
  return { pad, controls, press, neutral, setPads: value => { pads = value; } };
}
const gameplay = sample => Object.entries(sample).filter(([key, value]) => key !== 'pausePressed' && value).map(([key]) => key);

test('a preexisting held stick/button cannot act until the gamepad becomes neutral', () => {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })); buttons[0] = { pressed: true, value: 1 };
  const { controls, pad, neutral, press } = setup({ axes: [.9, 0, 0, 0], buttons });
  assert.deepEqual(gameplay(controls.sample()), []);
  press(0, 0); assert.deepEqual(gameplay(controls.sample()), [], 'held stick keeps input blocked');
  neutral(); assert.deepEqual(gameplay(controls.sample()), []);
  pad.axes[0] = .9; press(0);
  assert.deepEqual(gameplay(controls.sample()), ['right', 'jump', 'action']);
});

test('sticks respect the deadzone and D-pad plus A/B/X/triggers map to native actions', () => {
  const { controls, pad, press, neutral } = setup(); controls.sample();
  pad.axes = [.21, -.22, NaN, 0]; assert.deepEqual(gameplay(controls.sample()), []);
  pad.axes = [-.8, .7, 0, 0]; let input = controls.sample(); assert.ok(input.left && input.down && !input.up && !input.right);
  neutral(); press(12); press(15); press(0); press(1); press(2); input = controls.sample();
  for (const key of ['up', 'right', 'jump', 'action', 'flip', 'secondary', 'run', 'fire', 'boost']) assert.equal(input[key], true, key);
  assert.equal(input.pausePressed, false);
  for (const index of [6, 7]) { neutral(); press(index, .8); input = controls.sample(); assert.ok(input.run && input.fire && input.boost); }
  neutral(); press(7, .4); assert.deepEqual(gameplay(controls.sample()), []);
});

test('Start is edge-triggered and can resume while gameplay waits for neutral', () => {
  const { controls, pad, press, neutral } = setup(); controls.sample();
  press(9); assert.equal(controls.sample().pausePressed, true);
  controls.reset(); assert.equal(controls.sample().pausePressed, false, 'reset does not repeat the held pause press');
  press(9, 0); pad.axes[0] = .8; assert.deepEqual(gameplay(controls.sample()), []);
  press(9); let input = controls.sample(); assert.equal(input.pausePressed, true); assert.deepEqual(gameplay(input), []);
  assert.equal(controls.sample().pausePressed, false);
  press(9, 0); assert.deepEqual(gameplay(controls.sample()), [], 'resuming still cannot move with the old held stick');
  neutral(); controls.sample(); pad.axes[0] = .8; assert.equal(controls.sample().right, true);
});

test('disconnect clears actions and reconnecting requires a fresh neutral sample', () => {
  const { controls, pad, press, neutral, setPads } = setup(); controls.sample(); press(0); pad.axes[1] = -.8;
  assert.ok(controls.sample().jump);
  setPads([null]); assert.deepEqual(gameplay(controls.sample()), []);
  press(9); setPads([pad]); let input = controls.sample(); assert.deepEqual(gameplay(input), []); assert.equal(input.pausePressed, false);
  neutral(); controls.sample(); press(0); assert.equal(controls.sample().jump, true);
  pad.connected = false; assert.deepEqual(gameplay(controls.sample()), []);
});

test('sparse gamepad lists and unavailable browser APIs are harmless', () => {
  const { controls, pad, press, setPads } = setup(); setPads([null, pad]); controls.sample(); press(14);
  assert.equal(controls.sample().left, true);
  const missing = createActivityGamepad({ getPads: () => { throw new Error('unavailable'); } });
  assert.doesNotThrow(() => missing.reset()); assert.deepEqual(gameplay(missing.sample()), []);
});
