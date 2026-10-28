import * as THREE from 'three';
import { arcadeById } from '../arcade/catalog.js';

export function createArcade(id, { container, seed = 1, level = 1, sound, onResize, onLost, onRestored }) {
  const definition = arcadeById.get(id);
  if (!definition) throw new Error('This friend could not be found.');
  const touch = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: !touch, powerPreference: 'low-power' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute('aria-hidden', 'true'); container.prepend(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(definition.background);
  const camera = new THREE.OrthographicCamera(-8, 8, 8, -8, .1, 100);
  camera.position.set(0, 18, 9); camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight('#fff8ed', '#718494', 2.2));
  const sun = new THREE.DirectionalLight('#ffffff', 1.8); sun.position.set(-8, 18, 10); scene.add(sun);
  const root = new THREE.Group(); scene.add(root);
  const engine = definition.create({ THREE, root, seed, sound, singleRound: true, level, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  let width = 0, height = 0, disposed = false;
  function resize() {
    const rect = container.getBoundingClientRect(), w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
    if (w === width && h === height) return;
    width = w; height = h; onResize?.();
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, touch ? 1.35 : 1.75, Math.sqrt((touch ? 420000 : 1500000) / (w * h))));
    renderer.setSize(w, h, false);
    const aspect = w / h, span = 15;
    camera.left = -span / 2 * Math.max(1, aspect); camera.right = -camera.left;
    camera.top = span / 2 * Math.max(1, 1 / aspect); camera.bottom = -camera.top;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  }
  const observer = new ResizeObserver(resize); observer.observe(container); resize();
  const lost = event => { event.preventDefault(); if (!disposed) onLost?.(); };
  const restored = () => { if (!disposed) { width = height = 0; resize(); onRestored?.(); } };
  renderer.domElement.addEventListener('webglcontextlost', lost);
  renderer.domElement.addEventListener('webglcontextrestored', restored);
  return {
    definition, renderer, camera, root, engine, state: engine.state,
    update: dt => engine.update(dt),
    pointer(type, x, y) {
      if (type === 'cancel') { engine.pointer('cancel', 0, 0); return; }
      const rect = container.getBoundingClientRect();
      mouse.set((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2);
      ray.setFromCamera(mouse, camera);
      if (ray.ray.intersectPlane(plane, hit)) engine.pointer(type, THREE.MathUtils.clamp(hit.x, -6, 6), THREE.MathUtils.clamp(hit.z, -6, 6));
    },
    project(x, z) {
      const p = new THREE.Vector3(x, 0, z).project(camera), r = container.getBoundingClientRect();
      return { x: r.left + (p.x + 1) * r.width / 2, y: r.top + (1 - p.y) * r.height / 2 };
    },
    render() { engine.sync(); renderer.render(scene, camera); },
    snapshot: () => engine.snapshot(), restore: value => engine.restore(value),
    hud() { const hud = engine.hud(); return { ...hud, primary: definition.category === 'Puzzles' ? hud.secondary : hud.primary }; },
    resetLevel: engine.resetLevel ? () => engine.resetLevel() : undefined,
    dispose() {
      disposed = true; observer.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', lost); renderer.domElement.removeEventListener('webglcontextrestored', restored);
      const geometries = new Set(), materials = new Set();
      root.traverse(node => { if (node.geometry) geometries.add(node.geometry); if (node.material) for (const item of Array.isArray(node.material) ? node.material : [node.material]) materials.add(item); });
      engine.dispose?.(); geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); root.clear();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}
