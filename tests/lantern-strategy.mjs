// The pilot uses only the same throttle / steering / lift inputs as the UI.
import { flightTargets, isFlyable, FLIGHT } from '../lantern-game.js';
const flightDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function clearFlight(world, a, b) {
  const steps = Math.ceil(flightDistance(a, b) / .15);
  for (let i = 1; i <= steps; i++) if (!isFlyable(world, a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps, a.z + (b.z - a.z) * i / steps)) return false;
  return true;
}
function flyDirect(game, target, reach = .25) {
  for (let i = 0; i < 12000; i++) {
    const player = game.state.player;
    if (flightDistance(player, target) < reach && Math.abs(player.speed) < .18 && Math.abs(player.verticalSpeed) < .18) return;
    if (game.state.mode === 'won') return;
    if (!['playing', 'exploring'].includes(game.state.mode)) throw Error(`Flight ended in ${game.state.mode} before reaching ${JSON.stringify(target)}`);
    const dx = target.x - player.x, dz = target.z - player.z, dy = target.y - player.y;
    const flat = Math.hypot(dx, dz), desiredHeading = Math.atan2(dx, dz);
    const error = Math.atan2(Math.sin(desiredHeading - player.heading), Math.cos(desiredHeading - player.heading));
    const throttle = Math.abs(error) < .12 && flat > .08 ? Math.min(.9, flat / 4) : 0;
    const turn = flat > .08 ? Math.max(-1, Math.min(1, -error * 3)) : 0;
    const lift = Math.abs(dy) > .04 ? Math.max(-1, Math.min(1, dy / 2)) : 0;
    game.advance(1 / 30, { throttle, turn, lift });
  }
  throw Error(`Flight stalled at ${JSON.stringify(game.state.player)} en route to ${JSON.stringify(target)}`);
}
export function flyTo(game, rawTarget, reach = .45) {
  const target = { ...rawTarget, y: rawTarget.y ?? FLIGHT.targetY };
  if (!isFlyable(game.world, target.x, target.y, target.z)) throw Error(`Unflyable target ${JSON.stringify(target)}`);
  let player = game.state.player;
  const cruiseY = Math.max(9, ...(game.world.satellites || []).flatMap(island => [island.topY + 2, ...(island.colliders || []).map(collider => collider.maxY + 2)]));
  const inside = (point, island) => ((point.x - island.center.x) / (island.rx + 2)) ** 2 + ((point.z - island.center.z) / (island.rz + 2)) ** 2 < 1;
  const belowIsland = (game.world.satellites || []).find(island => inside(player, island) && player.y <= island.bottomY - FLIGHT.margin);
  if (belowIsland) flyDirect(game, { x: belowIsland.center.x, y: player.y, z: belowIsland.center.z + belowIsland.rz + 6 });
  const targetBelowIsland = (game.world.satellites || []).find(island => inside(target, island) && target.y <= island.bottomY - FLIGHT.margin);
  if (targetBelowIsland) {
    const coast = { x: targetBelowIsland.center.x, z: targetBelowIsland.center.z + targetBelowIsland.rz + 6 };
    flyDirect(game, { ...game.state.player, y: cruiseY });
    flyDirect(game, { ...coast, y: cruiseY });
    flyDirect(game, { ...coast, y: target.y });
    flyDirect(game, target, reach); return;
  }
  // Travel over the roofs. For a discovery below the island, first descend
  // outside the coast, then sweep under the rock rather than crossing it.
  if (player.y < 6.6 && !clearFlight(game.world, player, { ...player, y: 9 })) {
    flyDirect(game, { x: 0, y: player.y, z: 22 });
  }
  if (target.y < -6.2 && !clearFlight(game.world, { ...target, y: 9 }, target)) {
    if (game.state.player.y > -6.2) {
      flyDirect(game, { ...game.state.player, y: 9 });
      flyDirect(game, { x: 0, y: 9, z: 22 });
      flyDirect(game, { x: 0, y: target.y, z: 22 });
    }
    flyDirect(game, target, reach); return;
  }
  player = game.state.player;
  if (!clearFlight(game.world, player, target) || player.y < 6.6 || target.y < 6.6) {
    flyDirect(game, { ...player, y: cruiseY });
    flyDirect(game, { ...target, y: cruiseY });
  }
  flyDirect(game, target, reach);
}
export function walkTo(game, target, reach = .45) { return flyTo(game, target, reach); }
export function finishVillage(game, includeSecrets = true) {
  const targets = flightTargets(game.world);
  if (includeSecrets) for (const secret of targets.secrets) if (!game.state.secrets.includes(secret.id)) flyTo(game, secret);
  for (const mote of targets.motes) if (!game.state.collected.includes(mote.id) && game.state.mode !== 'won') flyTo(game, mote);
  for (const beacon of targets.beacons) {
    if (game.state.lit.includes(beacon.id)) continue;
    flyTo(game, beacon, .8);
    game.advance(1); game.advance(.2);
  }
  return game.state;
}
