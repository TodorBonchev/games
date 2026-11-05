/** One mobile information hierarchy; combat remains visible before navigation. */
export function chooseMobileContext({ nearOutpost = false, blocked = false, elite = false, fieldVisible = false, fieldState = '', lastEnemy = false, hasWaypoint = false } = {}) {
  if (blocked) return 'cover';
  if (nearOutpost) return 'outpost';
  if (elite) return 'elite';
  if (fieldVisible && ['capturing', 'contested', 'secured'].includes(fieldState)) return 'field';
  if (lastEnemy) return 'last';
  if (hasWaypoint) return 'waypoint';
  return fieldVisible ? 'field' : 'none';
}

/** Reuse the real controls so keyboard, touch, persistence and focus stay native. */
export function createMobileHud({ document: doc = globalThis.document } = {}) {
  if (!doc?.body) throw new TypeError('Mobile HUD needs a document.');
  const make = (tag, id, parent) => { const node = doc.createElement(tag); node.id = id; parent?.append(node); return node; };
  const root = make('div', 'mobileHud'), rail = make('div', 'mobileTopRail', root), utilities = make('nav', 'mobileUtilities', rail);
  utilities.setAttribute('aria-label', 'Game controls');
  const dock = make('aside', 'mobileContextDock', root), content = make('div', 'mobileContextContent', dock);
  dock.setAttribute('aria-label', 'Current objective and recovery');
  const notice = make('p', 'mobileStatusNotice', dock); notice.setAttribute('aria-hidden', 'true');
  const controls = make('div', 'mobileControls', root);
  root.hidden = true;
  const originals = new Map(), contexts = new Map(), originalLabels = new Map(), originalAria = new Map();
  const utilityTouches = new Map();
  const clock = () => doc.defaultView?.performance.now() ?? Date.now();
  let suppressClickUntil = 0;
  let mounted = false, disposed = false, lastNotice = '', lastJournalLabel = '';
  function utilityDown(event) {
    suppressClickUntil = 0;
    const button = event.target.closest?.('#mobileUtilities > button');
    if (!mounted || root.hidden || event.pointerType !== 'touch' || !button || button.disabled) return;
    utilityTouches.set(event.pointerId, { button, x: event.clientX, y: event.clientY });
  }
  function utilityUp(event) {
    const start = utilityTouches.get(event.pointerId); utilityTouches.delete(event.pointerId);
    if (!start || root.hidden || start.button.disabled || event.type === 'pointercancel') return;
    const rect = start.button.getBoundingClientRect();
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 20 || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
    // Browsers can omit click for a second finger. Activate the original
    // handler once, and keep the compatibility guard after opening a modal.
    event.preventDefault(); suppressClickUntil = clock() + 700; start.button.click();
  }
  function utilityClick(event) {
    if (clock() < suppressClickUntil && event.detail !== 0 && event.pointerType !== 'mouse') {
      suppressClickUntil = 0; event.preventDefault(); event.stopImmediatePropagation();
    }
  }
  doc.addEventListener('pointerdown', utilityDown, true);
  doc.addEventListener('pointerup', utilityUp, true);
  doc.addEventListener('pointercancel', utilityUp, true);
  doc.addEventListener('click', utilityClick, true);
  function move(id, parent) {
    const node = doc.getElementById(id); if (!node || originals.has(node)) return node;
    const anchor = doc.createComment(`mobile:${id}`); node.before(anchor); originals.set(node, anchor); parent.append(node); return node;
  }
  function mount() {
    if (mounted) return;
    mounted = true; doc.body.append(root); doc.body.classList.add('mobile-play-surface');
    const hud = move('hud', rail); if (hud) rail.prepend(hud);
    for (const id of ['expeditionJournal', 'cameraBtn', 'pauseBtn']) move(id, utilities);
    const journal = doc.getElementById('expeditionJournal'); if (journal) originalAria.set(journal, journal.getAttribute('aria-label'));
    for (const [name, id] of [['outpost', 'activityInteract'], ['field', 'fieldObjective'], ['waypoint', 'expeditionWaypoint'], ['cover', 'muzzleBlocked'], ['elite', 'eliteHud'], ['last', 'lastEnemy']]) {
      const node = move(id, content); if (node) contexts.set(name, node);
    }
    const recovery = move('recoveryPanel', dock); if (recovery) dock.insertBefore(recovery, notice);
    for (const id of ['stick', 'fireBtn', 'jumpBtn', 'orbBtn', 'evadeBtn']) move(id, controls);
    const fire = doc.getElementById('fireBtn'), jump = doc.getElementById('jumpBtn');
    if (fire) move('weaponHud', fire);
    if (jump) move('jetpackHud', jump);
    // Short labels fit at readable sizes; underlying values and accessible
    // progress bars stay intact. Restore the desktop wording on unmount.
    for (const [node, text] of [[hud?.querySelector('.threat-stat > span'), 'LEFT'], [doc.getElementById('orbLabel'), 'ORB'], [jump?.querySelector(':scope > span'), 'JUMP'], [jump?.querySelector(':scope > small'), 'HOLD: FLY']]) {
      if (node) { originalLabels.set(node, node.textContent); node.textContent = text; }
    }
  }
  function unmount() {
    if (!mounted) return;
    for (const [node, anchor] of originals) { if (anchor.parentNode) anchor.replaceWith(node); node.removeAttribute('data-mobile-context-hidden'); node.removeAttribute('data-mobile-secondary'); }
    for (const [node, label] of originalLabels) node.textContent = label;
    for (const [node, label] of originalAria) { if (label === null) node.removeAttribute('aria-label'); else node.setAttribute('aria-label', label); }
    originals.clear(); contexts.clear(); originalLabels.clear(); originalAria.clear(); lastJournalLabel = '';
    root.remove(); root.hidden = true; mounted = false;
    doc.body.classList.remove('mobile-play-surface', 'mobile-hud-active');
  }
  const available = node => !!node && !node.hidden && !node.classList.contains('hide');
  const data = (node, key, value) => { const text = String(value); if (node.dataset[key] !== text) node.dataset[key] = text; };
  function update({ active = false, mobile = doc.body.classList.contains('touch') } = {}) {
    if (disposed) return;
    if (!mobile) { unmount(); return; }
    mount();
    // These body states also hide the surface in CSS immediately, before the
    // next simulation frame. Never show a reparented control over a modal.
    const inPlay = active && !['paused', 'activity-open', 'upgrading', 'intro'].some(name => doc.body.classList.contains(name));
    if (root.hidden === inPlay) root.hidden = !inPlay;
    doc.body.classList.toggle('mobile-hud-active', inPlay);
    if (!inPlay) { utilityTouches.clear(); return; }
    const state = {
      nearOutpost: available(contexts.get('outpost')),
      blocked: available(contexts.get('cover')),
      elite: available(contexts.get('elite')),
      fieldVisible: available(contexts.get('field')),
      fieldState: contexts.get('field')?.dataset.state,
      lastEnemy: available(contexts.get('last')),
      hasWaypoint: available(contexts.get('waypoint')),
    };
    const selected = chooseMobileContext(state); data(dock, 'context', selected);
    for (const [name, node] of contexts) {
      const secondary = name === 'field' && selected === 'waypoint' && state.fieldVisible;
      data(node, 'mobileContextHidden', name !== selected && !secondary);
      data(node, 'mobileSecondary', secondary);
    }
    const recovery = doc.getElementById('recoveryPanel');
    data(dock, 'recovering', available(recovery));
    const pickup = doc.getElementById('pickupNotice'), wave = doc.getElementById('waveBanner'), overdrive = doc.getElementById('overdriveHud'), supply = doc.getElementById('supplyGuide');
    const text = pickup?.classList.contains('show') ? pickup.textContent.trim() : available(supply) && supply.textContent.trim() ? supply.textContent.trim() : available(overdrive) ? overdrive.textContent.trim().replace(/\s+/g, ' ') : !state.nearOutpost && wave?.classList.contains('show') ? wave.textContent.trim() : '';
    if (text !== lastNotice) { notice.textContent = text; lastNotice = text; }
    if (notice.hidden === !!text) notice.hidden = !text;
    const hideDock = selected === 'none' && !available(recovery) && !text;
    if (dock.hidden !== hideDock) dock.hidden = hideDock;
    const journal = doc.getElementById('expeditionJournal'), count = doc.getElementById('expeditionCount')?.textContent || '';
    const label = `Open survivor outposts${count ? `, ${count}` : ''}`;
    if (journal && label !== lastJournalLabel) { journal.setAttribute('aria-label', label); lastJournalLabel = label; }
  }
  return { element: root, update, dispose() {
    if (disposed) return;
    unmount(); root.remove(); disposed = true; utilityTouches.clear();
    doc.removeEventListener('pointerdown', utilityDown, true); doc.removeEventListener('pointerup', utilityUp, true);
    doc.removeEventListener('pointercancel', utilityUp, true); doc.removeEventListener('click', utilityClick, true);
  } };
}
