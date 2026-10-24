// Every weapon uses the same hold-to-fire control. Differences come from
// timing, range and real bullet trajectories, never additional phone buttons.
const scatterPattern = Object.freeze([
  [0, 0], [.034, 0], [-.034, 0], [.017, .029], [-.017, .029], [.017, -.029], [-.017, -.029]
].map(Object.freeze));
const straight = Object.freeze([Object.freeze([0, 0])]);
export const WEAPONS = Object.freeze({
  rifle: Object.freeze({ id: 'rifle', name: 'RANGER', hint: 'ASSAULT RIFLE · FULL AUTO', damage: 1, interval: .1, range: 100, assistRange: 45, pellets: straight, recoil: .012, color: 0xffed9b, sound: 'rifle', modelScale: [1, 1, 1] }),
  burst: Object.freeze({ id: 'burst', name: 'STRIKER', hint: 'BURST CARBINE · 3 ROUNDS', damage: 1.4, interval: .075, recovery: .32, range: 130, assistRange: 55, pellets: straight, recoil: .009, color: 0xb4edff, sound: 'burst', modelScale: [.88, .94, 1.08] }),
  scatter: Object.freeze({ id: 'scatter', name: 'BREACHER', hint: 'SCATTERGUN · CLOSE RANGE', damage: 1.25, interval: .65, range: 26, assistRange: 24, pellets: scatterPattern, recoil: .027, color: 0xffbd78, sound: 'scatter', modelScale: [1.3, 1.12, .84] })
});
export function getWeapon(id) { return Object.hasOwn(WEAPONS, id) ? WEAPONS[id] : WEAPONS.rifle; }
export function shotInterval(weapon, round, rate = 1) { return (weapon.recovery && round % 3 === 0 ? weapon.recovery : weapon.interval) / rate; }
export function weaponDamage(weapon, distance) {
  // The shotgun has a clear close-range advantage without becoming a sniper.
  const falloff = weapon.id === 'scatter' ? 1 - Math.max(0, Math.min(1, (distance - 8) / 16)) * .8 : 1;
  return weapon.damage * falloff;
}
