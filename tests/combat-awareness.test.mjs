import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { AWARENESS_RANGE, HIT_CUE_SECONDS, worldBearing, relativeBearing, nearbyThreats, createCombatAwareness } from '../combat-awareness.js';

const origin = { x: 0, y: 0, z: 0 };
const enemy = (x, z, extra = {}) => ({ position: { x, y: 0, z }, ...extra });
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);
function view(t) {
  const dom = new JSDOM('<main></main>'); t.after(() => dom.window.close());
  const awareness = createCombatAwareness({ container: dom.window.document.querySelector('main') });
  t.after(() => awareness.dispose()); return awareness;
}
const frame = (awareness, seconds = 0, options = {}) => awareness.update(seconds, { position: origin, yaw: 0, active: true, enemies: [], ...options });

test('world and camera bearings match the native yaw convention through full turns', () => {
  closeTo(worldBearing({ x: 0, z: -8 }, origin), 0);
  closeTo(worldBearing([8, 0, 0], origin), Math.PI / 2);
  closeTo(worldBearing({ x: -8, z: 0 }, origin), -Math.PI / 2);
  assert.equal(Math.abs(worldBearing({ x: 0, z: 8 }, origin)), Math.PI);
  closeTo(relativeBearing(-Math.PI / 2, Math.PI / 2), 0, 'turning left brings a western enemy ahead');
  closeTo(relativeBearing(0, Math.PI / 2), Math.PI / 2);
  closeTo(relativeBearing(.4, Math.PI * 20), .4);
  assert.equal(worldBearing(origin, origin), null);
  assert.equal(worldBearing({ x: NaN, z: 0 }, origin), null);
  assert.equal(relativeBearing(NaN, 0), null);
});

test('nearby threat groups are bounded, use 3D range, and ignore dead or malformed enemies', () => {
  const enemies = [enemy(0, -8), enemy(.2, -7), enemy(0, 2), enemy(8, 0, { winding: true }),
    enemy(0, -AWARENESS_RANGE), enemy(0, -AWARENESS_RANGE - .01), enemy(0, 0, { position: { x: 0, y: 17, z: 0 } }),
    enemy(1, 1, { alive: false }), enemy(1, 1, { dead: true }), enemy(1, 1, { userData: { dead: .001, hp: 10 } }),
    enemy(1, 1, { hp: 0 }), enemy(1, 1, { userData: { hp: 0 } }), enemy(NaN, 1), null];
  const result = nearbyThreats({ position: origin, yaw: 0, enemies });
  assert.equal(result.count, 5); assert.equal(result.urgentCount, 2);
  assert.deepEqual(result.directions, { ahead: 3, behind: 1, left: 0, right: 1 });
  assert.equal(result.sectors.length, 3);
  assert.equal(result.sectors.find(s => s.index === 0).count, 3);
  assert.equal(result.sectors.find(s => s.index === 0).nearest, Math.hypot(.2, 7));
  assert.equal(result.sectors.find(s => s.index === 2).winding, true);
  assert.equal(result.sectors.find(s => s.index === 4).urgent, true);
  assert.match(result.description, /5 nearby threats: 3 ahead, 1 behind, 1 on the right. Danger close/);
  const crowd = nearbyThreats({ position: origin, enemies: Array.from({ length: 200 }, (_, i) => enemy(Math.sin(i) * 8, Math.cos(i) * 8)) });
  assert.equal(crowd.count, 200); assert.equal(crowd.sectors.length, 8);
  assert.equal(nearbyThreats({ position: null, enemies }).count, 0);
});

test('native zombie attack and slam windups raise urgency without altering game objects', () => {
  const enemies = [enemy(-10, 0, { userData: { hp: 12, dead: 0, attackWind: .2 } }),
    enemy(0, -10, { userData: { hp: 90, slamWind: .8 } }), enemy(10, 0, { userData: { hp: 5, strike: .1 } })];
  const saved = structuredClone(enemies), result = nearbyThreats({ position: origin, yaw: Math.PI / 2, enemies });
  assert.equal(result.urgentCount, 3); assert.ok(result.sectors.every(s => s.urgent && s.winding));
  assert.match(result.description, /Attack incoming/); assert.doesNotMatch(result.description, /Danger close/);
  assert.equal(result.sectors.find(s => s.index === 0).count, 1);
  assert.deepEqual(enemies, saved);
});

test('DOM markers group counts, keep the center clear, and reuse their eight slots', t => {
  const awareness = view(t), markers = [...awareness.element.querySelectorAll('.combat-awareness-bearing')];
  assert.equal(awareness.element.hidden, true);
  frame(awareness, 0, { enemies: [enemy(0, -8), enemy(.1, -7), enemy(0, 2)] });
  assert.equal(awareness.element.hidden, false); assert.equal(awareness.element.dataset.threatCount, '3');
  assert.equal(markers.filter(m => !m.hidden).length, 2);
  assert.equal(markers[0].querySelector('b').textContent, '2'); assert.equal(markers[0].querySelector('b').hidden, false);
  assert.equal(markers[4].classList.contains('urgent'), true);
  frame(awareness, .1, { enemies: [enemy(-8, 0)] });
  assert.equal(markers.filter(m => !m.hidden).length, 1); assert.equal(markers[6].hidden, false);
  assert.deepEqual([...awareness.element.querySelectorAll('.combat-awareness-bearing')], markers);
  frame(awareness, .1); assert.equal(awareness.element.hidden, true);
});

test('hit cue keeps its impact bearing as the camera turns, expires, and is static in reduced motion', t => {
  const awareness = view(t), cue = awareness.element.querySelector('.combat-awareness-hit');
  frame(awareness);
  assert.equal(awareness.hit({ x: 8, y: 0, z: 0 }, origin), true);
  frame(awareness, 0); assert.equal(cue.hidden, false); assert.equal(cue.style.transform, 'rotate(90deg)');
  frame(awareness, .2, { yaw: -Math.PI / 2, position: { x: 3, y: 0, z: 3 } });
  assert.equal(cue.style.transform, 'rotate(0deg)', 'movement does not rewrite the impact direction');
  frame(awareness, .6); assert.ok(Number(cue.style.opacity) < 1 && Number(cue.style.opacity) > 0);
  frame(awareness, .1, { reducedMotion: true }); assert.equal(cue.style.opacity, '1');
  assert.equal(awareness.element.dataset.reducedMotion, 'true');
  frame(awareness, HIT_CUE_SECONDS); assert.equal(cue.hidden, true); assert.equal(awareness.element.hidden, true);
  assert.equal(awareness.hit(origin, origin), false);
});

test('inactive combat and clear remove cues immediately and never replay stale hits on resume', t => {
  const awareness = view(t), options = { enemies: [enemy(0, -2)] };
  frame(awareness, 0, options); awareness.hit({ x: 0, z: 4 }, origin);
  frame(awareness, 0, { ...options, active: false });
  assert.equal(awareness.element.hidden, true); assert.equal(awareness.state.count, 0);
  assert.equal(awareness.element.querySelector('[role="status"]').textContent, '');
  frame(awareness, 0); assert.equal(awareness.element.hidden, true);
  frame(awareness, 0, options); awareness.clear(); assert.equal(awareness.element.hidden, true);
  awareness.dispose(); assert.equal(awareness.element.isConnected, false);
  assert.equal(awareness.hit({ x: 1, z: 0 }, origin), false);
  assert.doesNotThrow(() => frame(awareness, .1, options));
});

test('accessible summaries describe front and rear threats without live updates every frame', t => {
  const awareness = view(t), status = awareness.element.querySelector('[role="status"]');
  frame(awareness, 0, { enemies: [enemy(0, -8)] });
  assert.equal(status.getAttribute('aria-live'), 'polite'); assert.match(status.textContent, /1 nearby threat: 1 ahead/);
  const first = status.textContent;
  for (let i = 0; i < 80; i++) frame(awareness, 1 / 60, { enemies: [enemy(0, 8), enemy(.2, 7)] });
  assert.equal(status.textContent, first, 'frequent updates are held for the announcement interval');
  frame(awareness, .2, { enemies: [enemy(0, 8), enemy(.2, 7)] });
  assert.match(status.textContent, /2 nearby threats: 2 behind/);
});
