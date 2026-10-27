// A legal garden pilot: it reads the same positions a player sees and only
// supplies a shared tilt vector. It never moves drops or fills flowers.
import { LEVELS, BOARD_RADIUS } from '../dewfall-game.js';
const clearance = .4, cell = .42;
function obstacles(level) { return [...level.rocks.map(p => ({ ...p, radius: p.radius + clearance })), ...level.puddles.map(p => ({ ...p, radius: p.radius + .3 }))]; }
function openLine(a, b, blocked) {
  const dx = b.x - a.x, dz = b.z - a.z, length = dx * dx + dz * dz;
  return blocked.every(p => { const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / length)) : 0; return Math.hypot(a.x + dx * t - p.x, a.z + dz * t - p.z) > p.radius; });
}
function path(from, goal, level) {
  const blocked = obstacles(level); if (openLine(from, goal, blocked)) return [goal];
  const nodes = [{ x: from.x, z: from.z, g: 0, parent: null, key: 'start' }], visited = new Map();
  const radius = BOARD_RADIUS - .55;
  while (nodes.length) {
    nodes.sort((a, b) => (a.g + Math.hypot(goal.x - a.x, goal.z - a.z)) - (b.g + Math.hypot(goal.x - b.x, goal.z - b.z)));
    const node = nodes.shift(); if (visited.has(node.key)) continue; visited.set(node.key, node);
    if (openLine(node, goal, blocked)) { const result = [goal]; let cursor = node; while (cursor.parent) { result.unshift({ x: cursor.x, z: cursor.z }); cursor = cursor.parent; } return result; }
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      const ix = Math.round(node.x / cell) + dx, iz = Math.round(node.z / cell) + dz, x = ix * cell, z = iz * cell, key = `${ix},${iz}`;
      if (visited.has(key) || Math.hypot(x, z) > radius || !openLine(node, { x, z }, blocked)) continue;
      nodes.push({ x, z, key, parent: node, g: node.g + Math.hypot(x - node.x, z - node.z) });
    }
  }
  // A ball touching a rock needs a tiny outward nudge before normal planning.
  const near = blocked.find(p => Math.hypot(from.x - p.x, from.z - p.z) <= p.radius);
  if (near) { const angle = Math.atan2(from.z - near.z, from.x - near.x); return [{ x: near.x + Math.cos(angle) * (near.radius + .35), z: near.z + Math.sin(angle) * (near.radius + .35) }]; }
  return [goal];
}
export function createGardenPilot() {
  let ballId = null, flowerId = null, route = [], plannedAt = -999, lastBloom = -1;
  return state => {
    const level = LEVELS[state.level - 1];
    if (state.level === 6 && state.ticks < 40 && !state.bloomed) return { x: 1, z: 0 };
    let ball = state.balls.find(b => b.id === ballId && b.status === 'rolling'), flower = state.flowers.find(f => f.id === flowerId && !f.filled);
    if (!ball || !flower || lastBloom !== state.bloomed) {
      const pairs = state.balls.filter(b => b.status === 'rolling').flatMap(b => state.flowers.filter(f => !f.filled).map(f => ({ b, f, distance: Math.hypot(b.x - f.x, b.z - f.z) })));
      pairs.sort((a, b) => a.distance - b.distance); if (!pairs.length) return { x: 0, z: 0 };
      ({ b: ball, f: flower } = pairs[0]); ballId = ball.id; flowerId = flower.id; route = []; lastBloom = state.bloomed;
    }
    if (!route.length || state.ticks - plannedAt > 45) { route = path(ball, flower, level); plannedAt = state.ticks; }
    while (route.length > 1 && Math.hypot(ball.x - route[0].x, ball.z - route[0].z) < .36) route.shift();
    const blocked = obstacles(level);
    while (route.length > 1 && openLine(ball, route[1], blocked)) route.shift();
    const target = route[0], dx = target.x - ball.x, dz = target.z - ball.z;
    const x = dx * 1.45 - ball.vx * .75, z = dz * 1.45 - ball.vz * .75, size = Math.max(1, Math.hypot(x, z));
    return { x: x / size, z: z / size };
  };
}
export function playGarden(game, maxSeconds = 180) {
  const pilot = createGardenPilot(), trace = [];
  game.beginTilt();
  for (let i = 0; i < maxSeconds * 30 && game.state.mode === 'playing'; i++) {
    const control = pilot(game.state); trace.push(control); game.advance(1 / 30, control);
  }
  return trace;
}
