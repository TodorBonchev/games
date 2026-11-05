export const COMBAT_PREFERENCES_KEY = 'szCombatPreferences:v1';
export const DEFAULT_COMBAT_PREFERENCES = Object.freeze({
  aimAssist: true, assistStrength: 1, invertY: false, toggleFire: false, toggleSprint: false,
  leftHanded: false, crosshairScale: 1, highContrast: false, reduceFlashes: false,
  effectsVolume: 1, ambienceVolume: 1,
});
const ranges = { assistStrength: [.25, 1], crosshairScale: [.75, 2], effectsVolume: [0, 1], ambienceVolume: [0, 1] };
const classes = { leftHanded: 'survival-left-handed', highContrast: 'survival-high-contrast', reduceFlashes: 'survival-reduced-flashes', toggleFire: 'survival-toggle-fire', toggleSprint: 'survival-toggle-sprint' };
const safeStorage = () => { try { return globalThis.document ? globalThis.localStorage : null; } catch { return null; } };
const isRecord = value => value && typeof value === 'object' && !Array.isArray(value);

function acceptedValue(key, value) {
  if (!Object.hasOwn(DEFAULT_COMBAT_PREFERENCES, key)) return undefined;
  if (ranges[key]) return Number.isFinite(value) ? Math.max(ranges[key][0], Math.min(ranges[key][1], value)) : undefined;
  return typeof value === 'boolean' ? value : undefined;
}
export function parseCombatPreferences(saved) {
  const result = { ...DEFAULT_COMBAT_PREFERENCES };
  if (!isRecord(saved) || saved.schema !== 1) return result;
  for (const key of Object.keys(result)) {
    const value = acceptedValue(key, saved[key]); if (value !== undefined) result[key] = value;
  }
  return result;
}

/** A small store also usable without a DOM, including when browser storage fails. */
export function createCombatPreferenceStore(storage = safeStorage()) {
  let state = Object.freeze({ ...DEFAULT_COMBAT_PREFERENCES }), persisted = !!storage, serialized;
  try { serialized = storage?.getItem(COMBAT_PREFERENCES_KEY); }
  catch { persisted = false; }
  try { state = Object.freeze(parseCombatPreferences(JSON.parse(serialized || 'null'))); }
  catch { /* A damaged preference falls back to the normal controls. */ }
  const listeners = new Set();
  const get = () => state;
  return {
    get,
    get persisted() { return persisted; },
    set(patch) {
      if (!isRecord(patch)) return false;
      const next = { ...state };
      for (const key of Object.keys(DEFAULT_COMBAT_PREFERENCES)) {
        const value = acceptedValue(key, patch[key]); if (value !== undefined) next[key] = value;
      }
      if (Object.keys(next).every(key => next[key] === state[key])) return false;
      state = Object.freeze(next);
      try {
        if (typeof storage?.setItem !== 'function') throw new Error('Storage unavailable');
        storage.setItem(COMBAT_PREFERENCES_KEY, JSON.stringify({ schema: 1, ...state })); persisted = true;
      } catch { persisted = false; }
      for (const listener of [...listeners]) listener(get());
      return true;
    },
    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('A preference subscriber must be a function.');
      listeners.add(listener); return () => listeners.delete(listener);
    },
  };
}
const store = createCombatPreferenceStore();
export const getCombatPreferences = () => store.get();
export const subscribePreferences = listener => store.subscribe(listener);

const groups = [
  { title: 'Aiming & controls', open: true, entries: [
    { key: 'aimAssist', title: 'Aim assistance', help: 'Follow nearby targets while firing. Turn off for fully manual aim.' },
    { key: 'assistStrength', title: 'Assist strength', help: 'A lower setting makes target tracking gentler.', min: .25, max: 1, step: .05 },
    { key: 'invertY', title: 'Invert vertical look', help: 'Move the mouse or look thumb down to look up.' },
    { key: 'toggleFire', title: 'Toggle firing', help: 'Press fire once to keep shooting; press again to stop. Pausing stops firing.' },
    { key: 'toggleSprint', title: 'Toggle sprint', help: 'Press sprint to switch pace. On touch, push the stick fully once; release to stop.' },
  ] },
  { title: 'Visibility & touch layout', entries: [
    { key: 'leftHanded', title: 'Left-handed touch layout', help: 'Move with your right thumb; look and use actions on the left.' },
    { key: 'crosshairScale', title: 'Crosshair size', help: 'Make the aiming mark easier to see. This does not change accuracy.', min: .75, max: 2, step: .05 },
    { key: 'highContrast', title: 'High-contrast HUD', help: 'Solid dark panels and brighter labels remain clear over the island.' },
    { key: 'reduceFlashes', title: 'Reduce weapon flashes', help: 'Remove bright muzzle flashes while keeping shot and hit feedback.' },
  ] },
  { title: 'Sound mix', entries: [
    { key: 'effectsVolume', title: 'Effects volume', help: 'Weapons, impacts, pickups, and action cues. Sound Off still mutes everything.', min: 0, max: 1, step: .05 },
    { key: 'ambienceVolume', title: 'Ambience volume', help: 'Helicopter and wind. Lower this to hear combat cues more clearly.', min: 0, max: 1, step: .05 },
  ] },
];
const mounted = new WeakMap();

/** Mounted by initPreferences before the world loads; menu and pause use one panel. */
export function initSurvivalSettings({ document: doc = globalThis.document, preferences = store } = {}) {
  if (!doc?.body) return null;
  if (mounted.has(doc)) return mounted.get(doc);
  const panel = doc.getElementById('setPanel'), card = panel?.querySelector('.dialog-card');
  const apply = values => {
    for (const [key, name] of Object.entries(classes)) doc.body.classList.toggle(name, values[key]);
    doc.body.style.setProperty('--survival-crosshair-scale', String(values.crosshairScale));
  };
  apply(preferences.get());
  if (!card) return null;
  panel.classList.add('survival-settings-panel');
  const section = doc.createElement('section'); section.className = 'survival-settings'; section.setAttribute('aria-label', 'Combat comfort settings');
  const controls = new Map();
  for (const group of groups) {
    const details = doc.createElement('details'), summary = doc.createElement('summary'), rows = doc.createElement('div');
    details.className = 'survival-settings-group'; details.open = !!group.open;
    summary.textContent = group.title; rows.className = 'survival-settings-rows'; details.append(summary, rows); section.append(details);
    for (const entry of group.entries) {
      const row = doc.createElement('div'), copy = doc.createElement('div'), label = doc.createElement('label'), help = doc.createElement('small');
      const input = doc.createElement('input'), output = doc.createElement('output'), control = doc.createElement('div');
      row.className = `survival-preference ${entry.min === undefined ? 'is-switch' : 'is-range'}`;
      row.dataset.preference = entry.key; copy.className = 'survival-preference-copy'; control.className = 'survival-preference-control';
      input.id = `survival-pref-${entry.key}`; input.name = entry.key; label.htmlFor = input.id; label.textContent = entry.title;
      help.id = `${input.id}-help`; help.textContent = entry.help; input.setAttribute('aria-describedby', help.id);
      output.htmlFor = input.id; output.setAttribute('aria-hidden', 'true');
      if (entry.min === undefined) { input.type = 'checkbox'; input.setAttribute('role', 'switch'); }
      else { input.type = 'range'; input.min = entry.min; input.max = entry.max; input.step = entry.step; }
      input.addEventListener(entry.min === undefined ? 'change' : 'input', () => preferences.set({ [entry.key]: input.type === 'checkbox' ? input.checked : Number(input.value) }));
      copy.append(label, help); control.append(input, output); row.append(copy, control); rows.append(row);
      controls.set(entry.key, { input, output, row });
    }
  }
  const note = doc.createElement('p'); note.className = 'survival-settings-note'; note.setAttribute('role', 'status'); section.append(note);
  const anchor = card.querySelector('.camera-setting') || card.querySelector('#setClose'); card.insertBefore(section, anchor || null);
  function sync(values) {
    apply(values);
    for (const [key, { input, output, row }] of controls) {
      if (input.type === 'checkbox') {
        input.checked = values[key]; input.setAttribute('aria-checked', String(values[key])); output.value = values[key] ? 'On' : 'Off';
      } else {
        input.value = String(values[key]); output.value = `${Math.round(values[key] * 100)}%`;
        input.setAttribute('aria-valuetext', key === 'crosshairScale' ? `${Math.round(values[key] * 100)} percent of normal size` : `${Math.round(values[key] * 100)} percent`);
      }
      const disabled = key === 'assistStrength' && !values.aimAssist;
      input.disabled = disabled; row.classList.toggle('unavailable', disabled);
    }
    const text = preferences.persisted ? 'Applies immediately. Saved on this device.' : 'Applies now. Browser storage is unavailable, so settings may reset after reloading.';
    if (note.textContent !== text) note.textContent = text;
  }
  sync(preferences.get());
  const unsubscribe = preferences.subscribe(sync);
  let disposed = false;
  const view = { element: section, dispose() { if (disposed) return; disposed = true; unsubscribe(); section.remove(); panel.classList.remove('survival-settings-panel'); mounted.delete(doc); } };
  mounted.set(doc, view); return view;
}
