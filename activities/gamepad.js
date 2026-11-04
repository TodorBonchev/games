const DEADZONE = .22;
const BUTTON_THRESHOLD = .5;
const emptyInput = () => ({ left: false, right: false, up: false, down: false, jump: false, flip: false,
  run: false, fire: false, action: false, secondary: false, boost: false, pausePressed: false });
const buttonDown = button => button?.pressed === true || Number.isFinite(button?.value) && button.value > BUTTON_THRESHOLD;
const axisValue = value => Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;

/** Native activity controls share one controller without leaking held input across menus. */
export function createActivityGamepad({ getPads = () => globalThis.navigator?.getGamepads?.() || [] } = {}) {
  let blocked = true, padKey = null, previousStart = false;
  function readPad() {
    try {
      const pads = Array.from(getPads() || []);
      const slot = pads.findIndex(pad => pad && pad.connected !== false);
      if (slot < 0) return null;
      const pad = pads[slot];
      return { pad, key: `${slot}:${pad.index ?? slot}:${pad.id || ''}` };
    } catch { return null; }
  }
  function reset() {
    const current = readPad();
    blocked = true; padKey = current?.key ?? null;
    // A reset often happens inside the Start press that opened a pause panel.
    // Remember that press, so holding it cannot immediately resume the game.
    previousStart = buttonDown(current?.pad.buttons?.[9]);
  }
  function sample() {
    const input = emptyInput(), current = readPad();
    if (!current) { blocked = true; padKey = null; previousStart = false; return input; }
    const { pad, key } = current, buttons = Array.from(pad.buttons || []), axes = Array.from(pad.axes || []);
    const start = buttonDown(buttons[9]);
    if (key !== padKey) { blocked = true; padKey = key; previousStart = start; }
    input.pausePressed = start && !previousStart; previousStart = start;
    const neutral = !buttons.some(buttonDown) && !axes.some(value => Math.abs(axisValue(value)) > DEADZONE);
    if (blocked) {
      if (neutral) blocked = false;
      return input;
    }
    const x = axisValue(axes[0]), y = axisValue(axes[1]);
    input.left = x < -DEADZONE || buttonDown(buttons[14]);
    input.right = x > DEADZONE || buttonDown(buttons[15]);
    input.up = y < -DEADZONE || buttonDown(buttons[12]);
    input.down = y > DEADZONE || buttonDown(buttons[13]);
    input.jump = input.action = buttonDown(buttons[0]);
    input.flip = input.secondary = buttonDown(buttons[1]);
    input.run = input.fire = input.boost = buttonDown(buttons[2]) || buttonDown(buttons[6]) || buttonDown(buttons[7]);
    return input;
  }
  reset();
  return { sample, reset };
}
export default createActivityGamepad;
