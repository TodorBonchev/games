const finite = value => Number.isFinite(value) ? value : 0;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// A held gesture belongs to the player's chosen heading, not assisted camera turns.
// Looking deliberately turns that heading; returning to neutral chooses a new one.
export function createTouchMovement({ deadzone = .16 } = {}) {
  deadzone = clamp(finite(deadzone), 0, .8);
  const state = { id: null, x: 0, y: 0, magnitude: 0, heading: 0, ox: 0, oy: 0, radius: 1, dx: 0, dy: 0 };
  function reset() {
    Object.assign(state, { id: null, x: 0, y: 0, magnitude: 0, dx: 0, dy: 0 });
  }
  return {
    state,
    begin(id, point, yaw, radius) {
      if (state.id !== null || id === null || id === undefined) return false;
      reset();
      Object.assign(state, { id, ox: finite(point.x), oy: finite(point.y), heading: finite(yaw), radius: Math.max(1, finite(radius)) });
      return true;
    },
    move(id, point, yaw) {
      if (id !== state.id || state.id === null) return false;
      const dx = finite(point.x) - state.ox, dy = finite(point.y) - state.oy;
      const distance = Math.hypot(dx, dy), amount = Math.min(distance / state.radius, 1);
      // Recenter at a new camera heading, including when the first drag follows
      // several stationary frames of assisted aiming.
      if (state.magnitude === 0 || amount <= deadzone) state.heading = finite(yaw);
      state.magnitude = Math.max(0, (amount - deadzone) / (1 - deadzone));
      const ux = distance ? dx / distance : 0, uy = distance ? dy / distance : 0;
      state.x = ux * state.magnitude;
      state.y = uy * state.magnitude;
      state.dx = ux * Math.min(distance, state.radius);
      state.dy = uy * Math.min(distance, state.radius);
      return true;
    },
    manualTurn(delta) {
      if (state.id !== null) state.heading += finite(delta);
    },
    end(id) {
      if (id !== state.id || state.id === null) return false;
      reset(); return true;
    },
    reset,
  };
}

// Clamp presentation only: even a contact at a screen edge starts physically
// neutral. Moving the visual base must never synthesize movement input.
export function floatingStickAnchor({ x, y, width, height, size, leftHanded = false, edge = 12, bottom = 18 }) {
  const half = Math.max(1, finite(size) / 2), mid = width / 2;
  const lowX = leftHanded ? mid + half + 4 : edge + half;
  const highX = leftHanded ? width - edge - half : mid - half - 4;
  const lowY = Math.max(half + edge, height * .5);
  const highY = height - half - bottom;
  return {
    x: lowX <= highX ? clamp(x, lowX, highX) : leftHanded ? width * .75 : width * .25,
    y: lowY <= highY ? clamp(y, lowY, highY) : height / 2,
  };
}
