import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createKeyboardPointer } from '../activities/keyboard-pointer.js';
function setup() {
  const dom = new JSDOM('<main id="stage"><canvas></canvas></main>'), stage = dom.window.document.getElementById('stage'), canvas = stage.querySelector('canvas');
  stage.getBoundingClientRect = () => ({ left: 20, top: 40, width: 500, height: 400, right: 520, bottom: 440 });
  canvas.getBoundingClientRect = () => ({ left: 40, top: 60, width: 460, height: 350, right: 500, bottom: 410 });
  const calls = [], pointer = createKeyboardPointer({ stage, onPointer: (...args) => calls.push(args) });
  const key = code => ({ code, preventDefault() {} });
  return { dom, stage, calls, pointer, key };
}
test('keyboard cursor supports tap, held drag, release, diagonal movement and canvas bounds', () => {
  const { pointer, calls, stage, key } = setup();
  assert.equal(pointer.keydown(key('KeyQ')), false);
  pointer.keydown(key('Space')); assert.deepEqual(calls[0], ['down', 270, 235]);
  pointer.keydown(key('ArrowRight')); pointer.keydown(key('ArrowDown'));
  for (let i = 0; i < 500; i++) pointer.update(1 / 60);
  assert.deepEqual(calls.at(-1), ['move', 498, 408]);
  pointer.keyup(key('Space')); assert.deepEqual(calls.at(-1), ['up', 498, 408]);
  assert.equal(stage.querySelector('.activity-keyboard-cursor').hidden, false);
  pointer.dispose(); assert.equal(stage.querySelector('.activity-keyboard-cursor'), null);
});
test('reset and real pointer input cancel a held keyboard gesture without activating it', () => {
  const { pointer, calls, stage, key, dom } = setup();
  pointer.keydown(key('Enter')); stage.dispatchEvent(new dom.window.Event('pointermove'));
  assert.deepEqual(calls.map(call => call[0]), ['down', 'cancel']);
  pointer.keyup(key('Enter')); assert.equal(calls.length, 2);
  assert.equal(stage.querySelector('.activity-keyboard-cursor').hidden, true);
  pointer.keydown(key('Space')); pointer.reset(); assert.equal(calls.at(-1)[0], 'cancel');
  const size = calls.length; pointer.update(1); assert.equal(calls.length, size);
});
test('cursor reconnects after a new activity replaces its stage children', () => {
  const { pointer, calls, stage, key } = setup();
  stage.replaceChildren(); pointer.keydown(key('Enter'));
  assert.ok(stage.querySelector('.activity-keyboard-cursor')); assert.deepEqual(calls[0], ['down', 270, 240]);
  pointer.keydown(key('Space')); pointer.keyup(key('Enter')); assert.equal(calls.length, 1);
  pointer.keyup(key('Space')); assert.equal(calls.at(-1)[0], 'up');
});
