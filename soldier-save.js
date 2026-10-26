import { restoreRanks } from './progression.js?v21';
import { createEncounter } from './encounters.js?v21';

// Only data crosses a reload. Three.js objects, held controls and transient
// projectiles are rebuilt by the game after the saved world data is validated.
export function parseSoldierSave(saved) {
  const number = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
  const integer = (value, min, max) => Number.isInteger(value) && number(value, min, max);
  const point = value => Array.isArray(value) && value.length === 3 && value.every(n => number(n, -5000, 5000));
  const types = ['walker', 'runner', 'brute', 'spitter', 'fiery'];
  if (!saved || saved.schema !== 1 || ![1, 2].includes(saved.level) || !['play', 'upgrade', 'victory'].includes(saved.phase) || !integer(saved.wave, 1, 999)) return null;
  const encounter = createEncounter(saved.wave, saved.level);
  if (!integer(saved.score, 0, Number.MAX_SAFE_INTEGER) || !number(saved.hp, 0.001, 100) || !integer(saved.toSpawn, 0, encounter.count) || saved.waveTotal !== encounter.count || !number(saved.waveBreak, -1, 4) || !number(saved.spawnT, 0, 10)) return null;
  if (!['rifle', 'burst', 'scatter'].includes(saved.weapon) || typeof saved.campaignComplete !== 'boolean') return null;
  if (!saved.player || !point(saved.player.position) || !number(saved.player.height, 0, 100) || !number(saved.player.yaw, -1000000, 1000000) || !number(saved.player.pitch, -1.5, 1.5) || !number(saved.player.fuel, 0, 1) || !number(saved.player.velocity, -100, 100)) return null;
  if (!saved.stats || !['runKills', 'runShots', 'runHits', 'eliteKills', 'runUplinks', 'runBestStart'].every(key => integer(saved.stats[key], 0, Number.MAX_SAFE_INTEGER)) || !number(saved.stats.runSeconds, 0, 10000000) || saved.stats.runHits > saved.stats.runShots) return null;
  if (!number(saved.overdrive, 0, 12) || !number(saved.overdriveMax, 8, 12) || !number(saved.armor, 0, 60) || !number(saved.frozenCooldown, 0, 8) || !number(saved.redeployCooldown, 0, 3) || !number(saved.lastRecovery, 0, 100) || !number(saved.time, 0, 10000000)) return null;
  if (![null, 'elite', 'commander'].includes(saved.elitePending)) return null;
  if (!Array.isArray(saved.zombies) || saved.zombies.length > 64 || !saved.zombies.every(enemy => enemy && types.includes(enemy.type) && [null, 'elite', 'commander'].includes(enemy.elite) && point(enemy.position) && number(enemy.hp, 0.001, 10000000) && number(enemy.maxHp, enemy.hp, 10000000) && number(enemy.speed, 0, 1000) && ['attackWind', 'attackCooldown', 'spitCooldown', 'frostTime', 'slamWind', 'slamCooldown'].every(key => number(enemy[key], 0, 10000)) && (!enemy.slamCenter || point(enemy.slamCenter)))) return null;
  if (!Array.isArray(saved.drops) || saved.drops.length > 6 || !saved.drops.every(drop => drop && ['medkit', 'overdrive'].includes(drop.type) && point(drop.position) && number(drop.age, 0, 45))) return null;
  if (saved.field && (!point(saved.field.position) || typeof saved.field.active !== 'boolean' || typeof saved.field.captured !== 'boolean' || !number(saved.field.progress, 0, 5) || !number(saved.field.doneTime, 0, 10000000))) return null;
  const choiceIds = ['damage', 'cadence', 'speed', 'armor', 'recovery', 'magnet', 'shield', 'overdrive', 'bounty'];
  if (!Array.isArray(saved.choices) || saved.choices.length > 3 || !saved.choices.every(id => choiceIds.includes(id)) || (saved.phase === 'upgrade' && (saved.choices.length !== 3 || new Set(saved.choices).size !== 3))) return null;
  if (saved.phase === 'victory' && (!saved.campaignComplete || saved.level !== 2)) return null;
  return {
    ...saved, ranks: restoreRanks(saved.ranks),
    player: { ...saved.player, position: [...saved.player.position] },
    zombies: saved.zombies.map(enemy => ({ ...enemy, position: [...enemy.position], slamCenter: enemy.slamCenter ? [...enemy.slamCenter] : null })),
    drops: saved.drops.map(drop => ({ ...drop, position: [...drop.position] })),
    field: saved.field ? { ...saved.field, position: [...saved.field.position] } : null,
    stats: { ...saved.stats }, choices: [...saved.choices],
  };
}
