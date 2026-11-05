import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { COMBAT_PREFERENCES_KEY, DEFAULT_COMBAT_PREFERENCES, createCombatPreferenceStore, parseCombatPreferences, initSurvivalSettings } from '../survival-settings.js';

function memory(initial) {
  const data = new Map(initial === undefined ? [] : [[COMBAT_PREFERENCES_KEY, initial]]);
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), data };
}
function setup(t, saved) {
  const dom = new JSDOM('<body><main id="start"></main><section id="setPanel" class="ov hide"><div class="dialog-card"><div class="preference-controls"><input id="lookSensitivity" value="1"><button id="motionBtn">MOTION: AUTO</button></div><div class="camera-setting"></div><button id="setClose">Back</button></div></section></body>');
  const storage = memory(saved), store = createCombatPreferenceStore(storage), doc = dom.window.document;
  const view = initSurvivalSettings({ document: doc, preferences: store });
  t.after(() => { view.dispose(); dom.window.close(); });
  return { dom, doc, store, view, storage };
}
const pref = (doc, key) => doc.getElementById(`survival-pref-${key}`);
function change(env, key, value) {
  const input = pref(env.doc, key);
  if (input.type === 'checkbox') input.checked = value; else input.value = String(value);
  input.dispatchEvent(new env.dom.window.Event(input.type === 'checkbox' ? 'change' : 'input', { bubbles: true }));
}

test('combat preference defaults preserve existing controls, visuals and sound', () => {
  assert.deepEqual(createCombatPreferenceStore(memory()).get(), {
    aimAssist: true, assistStrength: 1, invertY: false, toggleFire: false, toggleSprint: false,
    leftHanded: false, crosshairScale: 1, highContrast: false, reduceFlashes: false, effectsVolume: 1, ambienceVolume: 1,
  });
  assert.deepEqual(createCombatPreferenceStore(memory('{broken')).get(), DEFAULT_COMBAT_PREFERENCES);
  assert.deepEqual(parseCombatPreferences({ schema: 999, aimAssist: false }), DEFAULT_COMBAT_PREFERENCES);
});

test('saved preference parsing is bounded and rejects incorrect types and unknown fields', () => {
  const loaded = parseCombatPreferences({ schema: 1, assistStrength: 900, crosshairScale: -4,
    effectsVolume: -20, ambienceVolume: 5, aimAssist: 'false', toggleFire: true, reduceFlashes: true,
    invertY: null, highContrast: 1, leftHanded: true, unknown: true });
  assert.equal(loaded.assistStrength, 1); assert.equal(loaded.crosshairScale, .75);
  assert.equal(loaded.effectsVolume, 0); assert.equal(loaded.ambienceVolume, 1);
  assert.equal(loaded.aimAssist, true); assert.equal(loaded.invertY, false); assert.equal(loaded.highContrast, false);
  assert.equal(loaded.toggleFire, true); assert.equal(loaded.reduceFlashes, true); assert.equal(loaded.leftHanded, true);
  assert.equal(Object.hasOwn(loaded, 'unknown'), false);
});

test('changes persist once, notify live subscribers, and cannot leak mutable state', () => {
  const storage = memory(), store = createCombatPreferenceStore(storage), received = [];
  const unsubscribe = store.subscribe(value => received.push(value));
  assert.equal(store.set({ effectsVolume: .4, ambienceVolume: .2, toggleSprint: true }), true);
  assert.equal(received.length, 1); assert.equal(received[0].effectsVolume, .4);
  assert.throws(() => { received[0].effectsVolume = 1; }, TypeError);
  assert.equal(store.get().effectsVolume, .4);
  assert.equal(store.set({ effectsVolume: .4, unknown: true }), false);
  assert.equal(store.set({ effectsVolume: NaN, invertY: 'true' }), false);
  assert.equal(received.length, 1);
  const copy = createCombatPreferenceStore(storage); assert.deepEqual(copy.get(), store.get());
  unsubscribe(); store.set({ aimAssist: false }); assert.equal(received.length, 1);
});

test('all controls mount before deployment and do not replace existing sensitivity, motion or camera controls', t => {
  const env = setup(t), { doc, view, store } = env;
  assert.equal(doc.querySelectorAll('.survival-settings input').length, 11);
  assert.equal(doc.querySelectorAll('.survival-settings-group').length, 3);
  assert.equal(doc.querySelector('#lookSensitivity').value, '1'); assert.equal(doc.querySelector('#motionBtn').textContent, 'MOTION: AUTO');
  assert.ok(doc.querySelector('.camera-setting')); assert.ok(doc.querySelector('#start'));
  assert.equal(initSurvivalSettings({ document: doc, preferences: store }), view);
  assert.equal(doc.querySelectorAll('.survival-settings').length, 1);
  assert.equal(pref(doc, 'aimAssist').checked, true); assert.equal(pref(doc, 'aimAssist').getAttribute('role'), 'switch');
  for (const input of doc.querySelectorAll('.survival-settings input')) {
    assert.ok(doc.querySelector(`label[for="${input.id}"]`)?.textContent);
    assert.ok(doc.getElementById(input.getAttribute('aria-describedby'))?.textContent);
  }
});

test('assist controls preserve strength when off and every input change reaches the live API', t => {
  const env = setup(t), values = []; env.store.subscribe(value => values.push(value));
  change(env, 'assistStrength', .4); assert.equal(env.store.get().assistStrength, .4);
  change(env, 'aimAssist', false); assert.equal(pref(env.doc, 'assistStrength').disabled, true);
  assert.equal(env.store.get().assistStrength, .4);
  change(env, 'aimAssist', true); assert.equal(pref(env.doc, 'assistStrength').disabled, false);
  assert.equal(pref(env.doc, 'assistStrength').value, '0.4');
  for (const key of ['invertY', 'toggleFire', 'toggleSprint', 'reduceFlashes']) {
    change(env, key, true); assert.equal(env.store.get()[key], true); assert.equal(pref(env.doc, key).getAttribute('aria-checked'), 'true');
  }
  change(env, 'effectsVolume', .35); change(env, 'ambienceVolume', 0);
  assert.equal(values.at(-1).effectsVolume, .35); assert.equal(values.at(-1).ambienceVolume, 0);
  assert.equal(pref(env.doc, 'ambienceVolume').getAttribute('aria-valuetext'), '0 percent');
});

test('visibility and handedness settings apply immediately, survive reload and keep unrelated body classes', t => {
  const env = setup(t); env.doc.body.classList.add('touch', 'paused');
  for (const key of ['leftHanded', 'highContrast', 'reduceFlashes']) change(env, key, true);
  change(env, 'crosshairScale', 1.5);
  assert.equal(env.doc.body.style.getPropertyValue('--survival-crosshair-scale'), '1.5');
  for (const name of ['survival-left-handed', 'survival-high-contrast', 'survival-reduced-flashes', 'touch', 'paused']) assert.ok(env.doc.body.classList.contains(name));
  assert.equal(pref(env.doc, 'crosshairScale').getAttribute('aria-valuetext'), '150 percent of normal size');
  const copy = setup(t, env.storage.data.get(COMBAT_PREFERENCES_KEY));
  assert.equal(copy.doc.body.style.getPropertyValue('--survival-crosshair-scale'), '1.5');
  assert.ok(copy.doc.body.classList.contains('survival-left-handed'));
  change(env, 'leftHanded', false); assert.equal(env.doc.body.classList.contains('survival-left-handed'), false);
});

test('storage failures leave live settings usable and report only the observed saving failure', t => {
  const env = setup(t), broken = createCombatPreferenceStore({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } });
  env.view.dispose(); const replacement = initSurvivalSettings({ document: env.doc, preferences: broken }); t.after(() => replacement.dispose());
  assert.doesNotThrow(() => broken.set({ highContrast: true, effectsVolume: .25 }));
  assert.equal(broken.get().effectsVolume, .25); assert.equal(broken.persisted, false);
  assert.ok(env.doc.body.classList.contains('survival-high-contrast'));
  assert.match(replacement.element.querySelector('[role="status"]').textContent, /storage is unavailable/);
});

test('existing sensitivity, reduced-motion and modal keyboard navigation still work with the new panel', async () => {
  const dom = new JSDOM('<section id="setPanel" role="dialog" aria-modal="true"><div class="dialog-card"><input id="lookSensitivity" type="range" min=".5" max="1.75" step=".05"><output id="lookSensitivityValue"></output><button id="motionBtn"></button><button id="setClose">Back</button></div></section>', { url: 'https://game.test/' });
  const previous = Object.fromEntries(['document', 'localStorage', 'matchMedia'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: dom.window.localStorage });
    Object.defineProperty(globalThis, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener() {} }) });
    dom.window.localStorage.setItem('szSensitivity', '1.3'); dom.window.localStorage.setItem('szMotion', 'reduced');
    const preferences = await import('../preferences.js?survival-behavior-test');
    preferences.initPreferences(); preferences.initDialogNavigation();
    assert.equal(preferences.getLookSensitivity(), 1.3); assert.equal(preferences.reducedMotion(), true);
    const slider = dom.window.document.getElementById('lookSensitivity');
    slider.value = '.7'; slider.dispatchEvent(new dom.window.Event('input')); slider.dispatchEvent(new dom.window.Event('change'));
    assert.equal(preferences.getLookSensitivity(), .7); assert.equal(dom.window.localStorage.getItem('szSensitivity'), '0.7');
    dom.window.document.getElementById('motionBtn').click(); assert.equal(preferences.reducedMotion(), false);
    assert.equal(dom.window.document.querySelectorAll('.survival-settings').length, 1);
    for (const control of dom.window.document.querySelectorAll('button,input,summary')) control.getClientRects = () => [{}];
    const close = dom.window.document.getElementById('setClose'); close.focus();
    close.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true, cancelable: true }));
    assert.equal(dom.window.document.activeElement, slider);
    slider.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    assert.equal(dom.window.document.activeElement, close);
  } finally {
    dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
