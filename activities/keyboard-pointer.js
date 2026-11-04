const DIRECTIONS = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] };
const BUTTONS = new Set(['Space', 'Enter']);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/** A visible mouse substitute for the original drag, aim, and tap activities. */
export function createKeyboardPointer({ stage, onPointer }) {
  const cursor = stage.ownerDocument.createElement('span');
  cursor.className = 'activity-keyboard-cursor'; cursor.hidden = true; cursor.setAttribute('aria-hidden', 'true');
  Object.assign(cursor.style, { position: 'absolute', width: '22px', height: '22px', border: '2px solid #fff', borderRadius: '50%',
    background: '#102a3266', boxShadow: '0 0 0 3px #153c4466,0 2px 10px #0008', pointerEvents: 'none', transform: 'translate(-50%,-50%)', zIndex: '8' });
  stage.append(cursor);
  let x = 0, y = 0, visible = false, down = false, disposed = false;
  const keys = new Set(), buttons = new Set();
  function bounds() {
    const rect = stage.getBoundingClientRect(), canvas = stage.querySelector('canvas')?.getBoundingClientRect();
    const left = Math.max(rect.left, canvas?.left ?? rect.left), right = Math.min(rect.right ?? rect.left + rect.width, canvas?.right ?? rect.left + rect.width);
    const top = Math.max(rect.top, canvas?.top ?? rect.top), bottom = Math.min(rect.bottom ?? rect.top + rect.height, canvas?.bottom ?? rect.top + rect.height);
    return { left: left + 2, right: Math.max(left + 2, right - 2), top: top + 2, bottom: Math.max(top + 2, bottom - 2), rect };
  }
  function draw() {
    const b = bounds(); x = clamp(x, b.left, b.right); y = clamp(y, b.top, b.bottom);
    cursor.style.left = `${x - b.rect.left}px`; cursor.style.top = `${y - b.rect.top}px`;
    cursor.style.background = down ? '#ffdc7bcc' : '#102a3266'; cursor.style.transform = `translate(-50%,-50%) scale(${down ? .8 : 1})`;
  }
  function activate() {
    if (visible) return;
    const b = bounds(); x = (b.left + b.right) / 2; y = (b.top + b.bottom) / 2;
    visible = true; cursor.hidden = false;
    if (!cursor.isConnected) stage.append(cursor);
    draw();
  }
  function reset() {
    if (down) onPointer('cancel', x, y);
    keys.clear(); buttons.clear(); down = false; visible = false; cursor.hidden = true;
  }
  function keydown(event) {
    if (disposed || !DIRECTIONS[event.code] && !BUTTONS.has(event.code)) return false;
    event.preventDefault?.(); activate();
    if (DIRECTIONS[event.code]) keys.add(event.code);
    else {
      buttons.add(event.code);
      if (!down) { down = true; draw(); onPointer('down', x, y); }
    }
    return true;
  }
  function keyup(event) {
    if (disposed || !DIRECTIONS[event.code] && !BUTTONS.has(event.code)) return false;
    event.preventDefault?.(); keys.delete(event.code); buttons.delete(event.code);
    if (down && BUTTONS.has(event.code) && !buttons.size) { down = false; draw(); onPointer('up', x, y); }
    return true;
  }
  function update(dt) {
    if (disposed || !visible || !Number.isFinite(dt) || dt <= 0) return;
    let dx = 0, dy = 0;
    for (const key of keys) { dx += DIRECTIONS[key][0]; dy += DIRECTIONS[key][1]; }
    if (!dx && !dy) return;
    const distance = Math.hypot(dx, dy), b = bounds();
    const speed = Math.max(200, Math.min(600, Math.min(b.right - b.left, b.bottom - b.top) * .9));
    x += dx / distance * speed * Math.min(.05, dt); y += dy / distance * speed * Math.min(.05, dt);
    draw(); onPointer('move', x, y);
  }
  const mouse = () => reset();
  stage.addEventListener('pointerdown', mouse, true); stage.addEventListener('pointermove', mouse, true);
  return { keydown, keyup, update, reset, dispose() { if (disposed) return; reset(); disposed = true; cursor.remove(); stage.removeEventListener('pointerdown', mouse, true); stage.removeEventListener('pointermove', mouse, true); } };
}
export default createKeyboardPointer;
