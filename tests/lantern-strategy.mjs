// Navigation uses only legal movement vectors and public world geometry.
import { isWalkable } from '../lantern-game.js';
const CELL = 0.4;
function clearLine(world, a, b) {
  const steps = Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / 0.1);
  for (let i = 1; i <= steps; i++) if (!isWalkable(world, a.x + (b.x - a.x) * i / steps, a.z + (b.z - a.z) * i / steps, 0.34)) return false;
  return true;
}
export function planWalk(world, from, target, reach = 0.6) {
  if (clearLine(world, from, target)) return [target];
  const open = [{ x: from.x, z: from.z, g: 0, parent: null, key: 'start' }], visited = new Set();
  while (open.length) {
    open.sort((a, b) => a.g + Math.hypot(a.x - target.x, a.z - target.z) - b.g - Math.hypot(b.x - target.x, b.z - target.z));
    const node = open.shift(); if (visited.has(node.key)) continue; visited.add(node.key);
    if (Math.hypot(node.x - target.x, node.z - target.z) < reach || clearLine(world, node, target)) {
      const path = clearLine(world, node, target) ? [target] : [];
      for (let cursor = node; cursor.parent; cursor = cursor.parent) path.unshift({ x: cursor.x, z: cursor.z });
      return path;
    }
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) {
      if (!x && !z) continue;
      const ix = Math.round(node.x / CELL) + x, iz = Math.round(node.z / CELL) + z;
      const next = { x: ix * CELL, z: iz * CELL }, key = `${ix},${iz}`;
      if (visited.has(key) || !isWalkable(world, next.x, next.z, 0.34) || !clearLine(world, node, next)) continue;
      open.push({ ...next, key, g: node.g + Math.hypot(next.x - node.x, next.z - node.z), parent: node });
    }
  }
  throw Error(`No legal path to ${JSON.stringify(target)}`);
}
export function walkTo(game, target, reach = 0.64) {
  let path = planWalk(game.world, game.state.player, target, reach);
  for (let i = 0; i < 9000; i++) {
    const player = game.state.player;
    if (Math.hypot(player.x - target.x, player.z - target.z) < reach) return;
    while (path.length > 1 && Math.hypot(player.x - path[0].x, player.z - path[0].z) < 0.16) path.shift();
    if (!path.length) path = planWalk(game.world, player, target, reach);
    const next = path[0], x = next.x - player.x, z = next.z - player.z, length = Math.max(0.14, Math.hypot(x, z));
    game.advance(1 / 30, { x: x / length, z: z / length });
    if (i && i % 500 === 0) path = planWalk(game.world, player, target, reach);
  }
  throw Error(`Walk stalled near ${JSON.stringify(game.state.player)} on way to ${JSON.stringify(target)}`);
}
export function finishVillage(game, includeSecrets = true) {
  for (let id = 0; id < game.world.motes.length; id++) if (!game.state.collected.includes(id)) {
    const [x, z] = game.world.motes[id]; walkTo(game, { x, z });
  }
  if (includeSecrets) for (const memory of game.world.secrets) walkTo(game, memory);
  for (const beacon of game.world.beacons) {
    if (game.state.lit.includes(beacon.id)) continue;
    walkTo(game, beacon, 0.8);
    game.advance(1); game.advance(0.2);
  }
  return game.state;
}
