// Optional post-wave controls. Simulation and persistence belong to main.js.
export function createRecoveryControls({ document, onHold, onReady }) {
  const root = document.createElement('section');
  root.id = 'recoveryPanel'; root.className = 'recovery-panel'; root.hidden = true;
  root.setAttribute('aria-label', 'Wave recovery');
  root.innerHTML = '<div><small>AREA SECURED</small><strong id="recoveryStatus"></strong></div><p id="recoveryHint">Collect supplies or finish the uplink.</p><nav aria-label="Recovery choices"><button id="recoveryHold" type="button">Keep scavenging <kbd>C</kbd></button><button id="recoveryReady" type="button">Upgrade now <kbd>N</kbd></button></nav>';
  document.body.append(root);
  const preview=document.createElement('span');preview.id='recoveryNext';preview.className='recovery-next';root.append(preview);
  const hold = root.querySelector('#recoveryHold'), ready = root.querySelector('#recoveryReady');
  const touches = new Map(), view = document.defaultView;
  let suppressClickUntil = 0, lastState = '';
  // A second finger needs a pointer release: mobile browsers can omit its click.
  // The resulting compatibility click must not select an upgrade underneath.
  view.addEventListener('pointerdown', () => { suppressClickUntil = 0; }, true);
  view.addEventListener('click', event => {
    if (view.performance.now() < suppressClickUntil && event.detail !== 0 && event.pointerType !== 'mouse') {
      suppressClickUntil = 0; event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  for (const [button, action] of [[hold, onHold], [ready, onReady]]) {
    button.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch' && !button.disabled) touches.set(event.pointerId, { button, x: event.clientX, y: event.clientY });
    });
    button.addEventListener('pointercancel', event => touches.delete(event.pointerId));
    button.addEventListener('pointerup', event => {
      const start = touches.get(event.pointerId); touches.delete(event.pointerId);
      if (!start || start.button !== button || button.disabled || root.hidden) return;
      const rect = button.getBoundingClientRect();
      if (Math.hypot(start.x-event.clientX,start.y-event.clientY)>20 || event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom) return;
      event.preventDefault(); suppressClickUntil = view.performance.now() + 700; action();
    });
    button.addEventListener('click', action);
  }
  return {
    cancel() { touches.clear(); },
    update({ active, held, seconds, next = '', supply = '' }) {
      root.hidden = !active;
      if (!active) touches.clear();
      document.body.classList.toggle('recovering', active);
      const remaining = Math.ceil(seconds), state = `${held}:${remaining}:${next}:${supply}`;
      if (state === lastState) return;
      lastState = state;
      root.querySelector('#recoveryStatus').textContent = held ? 'Your next wave can wait.' : `Upgrade in ${remaining}s`;
      root.querySelector('#recoveryHint').textContent = supply || (held ? 'Supplies stay fresh. Explore, then upgrade when ready.' : 'Collect supplies or finish the uplink.');
      preview.textContent=next;
      hold.disabled = !!held; hold.setAttribute('aria-pressed', String(!!held));
      hold.firstChild.textContent = held ? 'Scavenging ' : 'Keep scavenging ';
    },
  };
}
