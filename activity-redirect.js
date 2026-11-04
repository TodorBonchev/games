// Compatibility for bookmarks: every former game now lives inside Zombie.
export const ACTIVITY_IDS = Object.freeze([
  'lane-lark', 'orbit-guard', 'cloud-skimmer', 'ink-sling', 'bubble-basket', 'moss-flip', 'bell-bloom',
  'burrow-banquet', 'moon-basket', 'stack-strata', 'jelly-lanterns', 'dream-duos', 'flock-shift', 'kelp-kitchen',
  'tidehook', 'bellwood-beats', 'parcel-parade', 'wobble-bakery', 'mothlight', 'cloud-potter',
  'moonbounce', 'popwake', 'pondpost', 'ribbon', 'dewfall', 'garden', 'borrowed', 'prism', 'lantern', 'upside',
]);
const known = new Set(ACTIVITY_IDS);
export function activityDestination(source, entry) {
  const from = new URL(source), target = new URL('soldier.html', from);
  const requested = entry === 'arcade' ? from.searchParams.get('game') : entry === 'wonderwake' ? from.searchParams.get('mission') : entry;
  if (known.has(requested)) target.searchParams.set('activity', requested);
  else target.searchParams.set('district', 'harbor');
  const stage = Number(from.searchParams.get('level'));
  if (known.has(requested) && Number.isInteger(stage) && stage >= 1 && stage <= 100) target.searchParams.set('activityLevel', String(stage));
  for (const key of ['debug', 'fps', 'continue']) if (from.searchParams.get(key) === '1') target.searchParams.set(key, '1');
  const quality = from.searchParams.get('q');
  if (['auto', 'low', 'medium', 'high'].includes(quality)) target.searchParams.set('q', quality);
  return target;
}
if (typeof document !== 'undefined' && document.documentElement.dataset.activityEntry) {
  const destination = activityDestination(location.href, document.documentElement.dataset.activityEntry);
  const fallback = document.getElementById('activityDestination');
  if (fallback) fallback.href = destination.href;
  location.replace(destination.href);
}
