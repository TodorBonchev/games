// Runs the real game, DOM, input handlers, Three.js geometry and raycasts.
// GPU rendering, texture drawing and audio are substituted; visual quality
// and browser integration must still be checked with test:browser / playtesting.
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import * as THREE from '../vendor/three/build/three.module.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function createGame({ level = 1, touch = false, seed: randomSeed = 4253 + level, storage = {}, session = {}, go = false } = {}) {
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: `http://localhost/?debug=1&q=low&noscale=1&level=${level}${go ? '&go=1' : ''}`, pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  for (const [key, value] of Object.entries(storage)) window.localStorage.setItem(key, value);
  for (const [key, value] of Object.entries(session)) window.sessionStorage.setItem(key, value);
  let seed = randomSeed;
  window.Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  let now = 1000, frame, timerId = 0;
  const timers = new Map();
  Object.defineProperty(window.performance, 'now', { value: () => now });
  window.requestAnimationFrame = callback => { frame = callback; return 1; };
  window.cancelAnimationFrame = () => { frame = null; };
  window.setTimeout = (callback, delay = 0) => { timers.set(++timerId, { callback, at: now + delay }); return timerId; };
  window.clearTimeout = id => timers.delete(id);
  window.matchMedia = query => ({ matches: touch && query.includes('pointer:coarse'), addEventListener() {}, removeEventListener() {} });
  window.innerWidth = touch ? 844 : 1440;
  window.innerHeight = touch ? 390 : 900;
  window.devicePixelRatio = 1;
  if (!touch) delete window.ontouchstart;
  window.HTMLCanvasElement.prototype.getContext = function (type) {
    if (type !== '2d') return null;
    return new Proxy({
      canvas: this,
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      createRadialGradient: () => ({ addColorStop() {} }),
      createLinearGradient: () => ({ addColorStop() {} }),
      measureText: text => ({ width: String(text).length * 8 })
    }, { get: (target, key) => key in target ? target[key] : () => {} });
  };
  let pointerLock = null;
  Object.defineProperty(window.document, 'pointerLockElement', { get: () => pointerLock });
  window.HTMLCanvasElement.prototype.requestPointerLock = function () {
    pointerLock = this;
    window.document.dispatchEvent(new window.Event('pointerlockchange'));
    return Promise.resolve();
  };
  window.document.exitPointerLock = () => {
    pointerLock = null;
    window.document.dispatchEvent(new window.Event('pointerlockchange'));
  };
  class Renderer {
    constructor() {
      this.domElement = window.document.createElement('canvas');
      this.shadowMap = {};
      this.info = { render: { calls: 0, triangles: 0 }, programs: [] };
      this.capabilities = { getMaxAnisotropy: () => 1 };
    }
    setPixelRatio() {}
    setSize() {}
    getContext() { return { isContextLost: () => false }; }
    setRenderTarget() {}
    compile() {}
    render(scene, camera) { scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); }
  }
  class Clock {
    elapsedTime = 0;
    last = now;
    getDelta() { const delta = (now - this.last) / 1000; this.last = now; this.elapsedTime += delta; return delta; }
  }
  const context = dom.getInternalVMContext();
  const modules = new Map();
  const engine = new vm.SyntheticModule(Object.keys(THREE), function () {
    for (const [name, value] of Object.entries(THREE)) this.setExport(name, name === 'WebGLRenderer' ? Renderer : name === 'Clock' ? Clock : value);
  }, { context, identifier: 'three' });
  const resolveImport = (specifier, parent) => {
    if (specifier === 'three') return 'three';
    if (specifier.startsWith('three/addons/')) return resolve(root, 'vendor/three/examples/jsm', specifier.slice(13));
    return resolve(dirname(parent), specifier.split('?')[0]);
  };
  async function getModule(path) {
    if (path === 'three') return engine;
    if (modules.has(path)) return modules.get(path);
    const code = await readFile(path, 'utf8');
    const module = new vm.SourceTextModule(code, {
      context, identifier: path,
      importModuleDynamically: async (specifier, referencing) => {
        const dependency = await getModule(resolveImport(specifier, referencing.identifier));
        if (dependency.status === 'unlinked') await dependency.link(linker);
        if (dependency.status === 'linked') await dependency.evaluate();
        return dependency;
      }
    });
    modules.set(path, module);
    return module;
  }
  const linker = (specifier, referencing) => getModule(resolveImport(specifier, referencing.identifier));
  const entry = await getModule(resolve(root, 'main.js'));
  await entry.link(linker);
  await entry.evaluate();
  const preferences = await getModule(resolve(root, 'preferences.js'));
  if (preferences.status === 'unlinked') await preferences.link(linker);
  if (preferences.status === 'linked') await preferences.evaluate();
  preferences.namespace.initPreferences();
  const step = (seconds = 1 / 60, framesPerSecond = 60) => {
    const frames = Math.ceil(seconds * framesPerSecond);
    for (let i = 0; i < frames; i++) {
      now += seconds * 1000 / frames;
      const next = frame; frame = null; next?.(now);
      for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); }
    }
  };
  const key = (code, down = true) => window.document.body.dispatchEvent(new window.KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true, cancelable: true }));
  const click = id => window.document.getElementById(id).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  return {
    window, game: window.__game, step, key, click,
    start() { click('startBtn'); step(.1); click('skipBtn'); step(.1); },
    chooseUpgrade(index = 0) {
      const button = window.document.querySelector(`.upgrade-card[data-choice="${index}"]`);
      if (!button || button.disabled) throw new Error(`Upgrade choice ${index} is unavailable`);
      button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    },
    close() { dom.window.close(); }
  };
}
