// Wonderwake owns one campaign save. Earlier games' saves are never overwritten.
export const CHAPTERS = Object.freeze([
  { id: 'moss', title: 'Mossy Landing', color: '#a4d6ab', subtitle: 'Wake the gardens. Find your first friends.', reward: 'The garden lantern is glowing.', missions: ['dewfall', 'burrow-banquet', 'moss-flip', 'bellwood-beats', 'dream-duos'] },
  { id: 'harbor', title: 'Parcel Harbor', color: '#f3c182', subtitle: 'A festival needs food, invitations, and a little teamwork.', reward: 'The harbor lantern is glowing.', missions: ['pondpost', 'tidehook', 'bubble-basket', 'parcel-parade', 'kelp-kitchen'] },
  { id: 'coral', title: 'Coral Atelier', color: '#f3a7b3', subtitle: 'Make something beautiful for the islands.', reward: 'The coral lantern is glowing.', missions: ['ribbon', 'ink-sling', 'jelly-lanterns', 'cloud-potter', 'flock-shift'] },
  { id: 'cloud', title: 'Cloud Fair', color: '#c2b7f3', subtitle: 'Bring the music, the cake, and a little sky magic.', reward: 'The cloud lantern is glowing.', missions: ['cloud-skimmer', 'lane-lark', 'wobble-bakery', 'moon-basket', 'stack-strata'] },
  { id: 'stars', title: 'Starfall Bay', color: '#f5d58b', subtitle: 'Bring everyone together for a night to remember.', reward: 'Every island is shining. The festival can begin!', missions: ['moonbounce', 'popwake', 'orbit-guard', 'bell-bloom', 'mothlight'] },
]);

export const MISSIONS = Object.freeze([
  { id: 'dewfall', title: 'Wake the wildflowers', hero: 'Dew the water sprite', task: 'Roll the little drops into every flower.', gift: 'A wildflower garden', gesture: 'HOLD & SLIDE', relaxed: true },
  { id: 'burrow-banquet', title: 'Gather the picnic', hero: 'Tansy the aardvark', task: 'Push the golden roots into their burrows.', gift: 'A picnic for the crew', gesture: 'TAP', relaxed: true },
  { id: 'moss-flip', title: 'Scout the moss trail', hero: 'Bramble the moss beetle', task: 'Switch rails to get past the thorns.', gift: 'A safe forest trail', gesture: 'TAP' },
  { id: 'bellwood-beats', title: 'Learn the welcome song', hero: 'Bibi the koala', task: 'Watch the bells and tap their song back.', gift: 'The festival melody', gesture: 'WATCH & TAP', relaxed: true },
  { id: 'dream-duos', title: 'Find the lost dreams', hero: 'Fenn the fox', task: 'Find matching pairs of sleeping dreams.', gift: 'Dream lanterns', gesture: 'TAP', relaxed: true },
  { id: 'pondpost', title: 'Deliver the invitations', hero: 'Pogo the post frog', task: 'Hop across the pond to reach the mailbox.', gift: 'Invitations for everyone', gesture: 'PULL & RELEASE', relaxed: true },
  { id: 'tidehook', title: 'Catch supper', hero: 'Nori the penguin', task: 'Lower the hook and lift it beside a fish.', gift: 'A seaside supper', gesture: 'HOLD & RELEASE' },
  { id: 'bubble-basket', title: 'Gather sea pearls', hero: 'Coral the little crab', task: 'Catch the pearls and avoid the urchins.', gift: 'Pearl garlands', gesture: 'SLIDE' },
  { id: 'parcel-parade', title: 'Unpack the party', hero: 'Dottie the stork', task: 'Drag parcels to their matching depots.', gift: 'Presents for the guests', gesture: 'DRAG' },
  { id: 'kelp-kitchen', title: 'Mix the sea sweets', hero: 'Mallow the snail', task: 'Pour the ingredients into matching jars.', gift: 'A sweet little kitchen', gesture: 'TAP', relaxed: true },
  { id: 'ribbon', title: 'Weave a coral ribbon', hero: 'Ray the ribbon manta', task: 'Glide through arches and collect pearls.', gift: 'A luminous ribbon bridge', gesture: 'SLIDE' },
  { id: 'ink-sling', title: 'Paint the sea blooms', hero: 'Inky the bubble octopus', task: 'Tap the drifting blooms to give them color.', gift: 'A painted coral arch', gesture: 'TAP', relaxed: true },
  { id: 'jelly-lanterns', title: 'Light the decorations', hero: 'Mona the jellyfish', task: 'Turn on every lantern; neighbors change too.', gift: 'A constellation of lights', gesture: 'TAP', relaxed: true },
  { id: 'cloud-potter', title: 'Shape the wish pots', hero: 'Saffron the raccoon', task: 'Swipe the clay to match each pale outline.', gift: 'Pots full of wishes', gesture: 'SWIPE', relaxed: true },
  { id: 'flock-shift', title: 'Finish the mosaic', hero: 'Kiko the pigeon', task: 'Turn the stones to restore the jewel picture.', gift: 'A jewel dance floor', gesture: 'TAP', relaxed: true },
  { id: 'cloud-skimmer', title: 'Gather the sky rings', hero: 'Hazel the flying squirrel', task: 'Hold to rise; release to glide through rings.', gift: 'A sky full of bunting', gesture: 'HOLD & RELEASE' },
  { id: 'lane-lark', title: 'Collect the music', hero: 'Pip the blue owl', task: 'Change lanes to catch notes and dodge branches.', gift: 'A song for the journey', gesture: 'TAP' },
  { id: 'wobble-bakery', title: 'Carry the party cake', hero: 'Milo the mole', task: 'Slide the tray to keep the cake balanced.', gift: 'The tallest party cake', gesture: 'SLIDE' },
  { id: 'moon-basket', title: 'Arrange the sky jewels', hero: 'Cleo the cat', task: 'Put each of four colors once in every row and column.', gift: 'A jewel-studded sky', gesture: 'TAP', relaxed: true },
  { id: 'stack-strata', title: 'Build the bandstand', hero: 'Bolo the beaver', task: 'Move the logs onto the gold pad, smallest on top.', gift: 'A stage for the band', gesture: 'TAP', relaxed: true },
  { id: 'moonbounce', title: 'Chase away the grumps', hero: 'Nova the little star', task: 'Gather moons, then lift to bounce them into the grumps.', gift: 'A peaceful starry bay', gesture: 'DRAG & RELEASE' },
  { id: 'popwake', title: 'Wake the party guests', hero: 'Poppy the spark jelly', task: 'Draw one domino trail to wake every sleepy jelly.', gift: 'A bouncing crowd', gesture: 'DRAW & RELEASE', relaxed: true },
  { id: 'orbit-guard', title: 'Protect the wishing star', hero: 'Quill the star hedgehog', task: 'Move the shield to catch incoming stars.', gift: 'The festival wishing star', gesture: 'SLIDE' },
  { id: 'bell-bloom', title: 'Ring in the festival', hero: 'Mira the bell axolotl', task: 'Tap as each moving ring meets its glowing target.', gift: 'A chorus of festival bells', gesture: 'TAP IN TIME' },
  { id: 'mothlight', title: 'Guide the last guests', hero: 'Vesper the bat', task: 'Lead the moths gently to the glowing flower.', gift: 'A fluttering lantern parade', gesture: 'HOLD & GUIDE', relaxed: true },
]);
export const missionById = new Map(MISSIONS.map((mission, index) => [mission.id, { ...mission, chapter: Math.floor(index / 5) }]));
export const SAVE_KEY = 'games:wonderwake:v1';
export const freshProgress = () => ({ version: 1, chapter: 0, completed: [], active: null, checkpoints: {}, plays: {}, festivalSeen: false, fullCrewSeen: false });
export const chapterCount = (progress, index) => CHAPTERS[index].missions.filter(id => progress.completed.includes(id)).length;
export const unlockedChapter = progress => {
  let index = 0;
  while (index < 4 && chapterCount(progress, index) >= 3) index++;
  return index;
};
export const festivalReady = progress => CHAPTERS.every((_, index) => chapterCount(progress, index) >= 3);
export const isUnlocked = (progress, id) => missionById.has(id) && missionById.get(id).chapter <= unlockedChapter(progress);
export const nextMission = progress => {
  if (progress.active && isUnlocked(progress, progress.active.id)) return progress.active.id;
  return CHAPTERS[progress.chapter].missions.find(id => !progress.completed.includes(id)) || null;
};
const checkpointOK = (id, entry) => entry && entry.id === id && Number.isInteger(entry.seed) && entry.seed >= 0 && entry.seed <= 0xffffffff && entry.state && typeof entry.state === 'object' && !Array.isArray(entry.state);

export function parseProgress(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.completed) || value.completed.length > 25 || value.completed.some(id => !missionById.has(id))) return null;
  const result = freshProgress();
  result.completed = [...new Set(value.completed)];
  result.chapter = Math.max(0, Math.min(unlockedChapter(result), Number.isInteger(value.chapter) ? value.chapter : 0));
  if (value.active && isUnlocked(result, value.active.id)) result.active = { id: value.active.id };
  for (const id of missionById.keys()) {
    if (checkpointOK(id, value.checkpoints?.[id])) result.checkpoints[id] = value.checkpoints[id];
    if (Number.isInteger(value.plays?.[id]) && value.plays[id] >= 0 && value.plays[id] <= 100000) result.plays[id] = value.plays[id];
  }
  result.festivalSeen = value.festivalSeen === true && festivalReady(result);
  result.fullCrewSeen = value.fullCrewSeen === true && result.completed.length === 25;
  return result;
}
export function readProgress(storage) {
  try {
    const raw = (storage ?? globalThis.localStorage).getItem(SAVE_KEY);
    if (!raw || raw.length > 2000000) return freshProgress();
    return parseProgress(JSON.parse(raw)) || freshProgress();
  } catch { return freshProgress(); }
}
export function writeProgress(progress, storage) {
  try {
    const valid = parseProgress(progress); if (!valid) return false;
    const raw = JSON.stringify(valid); if (raw.length > 2000000) return false;
    (storage ?? globalThis.localStorage).setItem(SAVE_KEY, raw); return true;
  } catch { return false; }
}
export function completeMission(progress, id) {
  if (!isUnlocked(progress, id)) return false;
  const first = !progress.completed.includes(id);
  if (first) progress.completed.push(id);
  progress.plays[id] = Math.min(100000, (progress.plays[id] || 0) + 1);
  delete progress.checkpoints[id];
  progress.active = null;
  return first;
}
