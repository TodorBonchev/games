import { arcadeGames } from '../arcade/catalog.js';
import { LEVELS as GARDEN_LEVELS } from '../garden-levels.js';
import { CHAMBERS } from '../borrowed-levels.js';
import { LEVELS as PRISM_LEVELS } from '../prism-game.js';
import { LEVELS as POP_LEVELS } from '../popwake-game.js';
import { LEVELS as POND_LEVELS } from '../pondpost-game.js';
import { LEVELS as REEF_LEVELS } from '../ribbon-game.js';
import { LEVELS as DEW_LEVELS } from '../dewfall-game.js';

// Wonderwake's five neighborhoods now belong to the survivors' settlement.
// The relay district brings the five larger adventures into the same world.
export const DISTRICTS = Object.freeze([
  { id: 'meadow', title: 'Greenhouse Quarter', color: '#a4d6ab', description: 'Grow food, recover supplies, and keep the woodland paths safe.', missions: ['dewfall', 'burrow-banquet', 'moss-flip', 'bellwood-beats', 'dream-duos'] },
  { id: 'harbor', title: 'Supply Harbor', color: '#f3c182', description: 'Keep the settlement fed and its deliveries moving.', missions: ['pondpost', 'tidehook', 'bubble-basket', 'parcel-parade', 'kelp-kitchen'] },
  { id: 'coral', title: 'Repair Yard', color: '#f3a7b3', description: 'Restore the water routes, lighting, and equipment.', missions: ['ribbon', 'ink-sling', 'jelly-lanterns', 'cloud-potter', 'flock-shift'] },
  { id: 'cloud', title: 'Rooftop Camp', color: '#c2b7f3', description: 'Train the runners and make the rooftops a home.', missions: ['cloud-skimmer', 'lane-lark', 'wobble-bakery', 'moon-basket', 'stack-strata'] },
  { id: 'stars', title: 'Night Watch', color: '#f5d58b', description: 'Bring the survivors home and restore the warning network.', missions: ['moonbounce', 'popwake', 'orbit-guard', 'bell-bloom', 'mothlight'] },
  { id: 'relay', title: 'Relay Command', color: '#8edfd8', description: 'Defend the gardens and reconnect all three islands.', missions: ['garden', 'borrowed', 'prism', 'lantern', 'upside'] },
].map(district => Object.freeze({ ...district, missions: Object.freeze(district.missions) })));

const tasks = {
  'dewfall': ['Restart the irrigation', 'Guide clean water through the nursery to grow a fresh food supply.'],
  'burrow-banquet': ['Stock the root cellar', 'Move the food crates into storage before the next night watch.'],
  'moss-flip': ['Scout the forest trail', 'Practice switching paths through the thorny evacuation route.'],
  'bellwood-beats': ['Decode the radio tones', 'Repeat the signal sequence so distant survivors can find the camp.'],
  'dream-duos': ['Reunite the supply pairs', 'Match the scattered keepsakes and supplies in the relief shelter.'],
  'pondpost': ['Deliver the relief mail', 'Cross the flooded route to get a message to the harbor crew.'],
  'tidehook': ['Bring in the catch', 'Catch supper for the survivors without losing the fishing tackle.'],
  'bubble-basket': ['Recover water filters', 'Catch the clean pearls used in the camp filters and avoid contaminated spikes.'],
  'parcel-parade': ['Sort the relief crates', 'Send each incoming parcel to the crew that needs it.'],
  'kelp-kitchen': ['Prepare the medicine', 'Separate the ingredients into matching jars for the field clinic.'],
  'ribbon': ['Survey the water tunnel', 'Pilot the reef scout through the arches and map a safe supply route.'],
  'ink-sling': ['Mark the safe crossings', 'Paint the floating route markers for the next supply convoy.'],
  'jelly-lanterns': ['Repair the floodlights', 'Bring every lamp online to keep the repair yard visible at night.'],
  'cloud-potter': ['Shape the filter housings', 'Match the clay patterns to build replacement parts for the water system.'],
  'flock-shift': ['Rebuild the control panel', 'Rotate the damaged tiles to recover the workshop circuit.'],
  'cloud-skimmer': ['Train the glider crew', 'Fly through the supply rings to qualify for the next rooftop delivery.'],
  'lane-lark': ['Run the rooftop route', 'Collect radio signals and avoid the obstacles along the evacuation rails.'],
  'wobble-bakery': ['Carry the welcome cake', 'Keep the cake balanced for the survivors returning to camp.'],
  'moon-basket': ['Balance the power grid', 'Place every color once in each row and column to balance the rooftop circuits.'],
  'stack-strata': ['Rebuild the lookout', 'Move the tower sections in order to repair the camp lookout.'],
  'moonbounce': ['Clear the watch perimeter', 'Gather orbiting lights, choose upgrades between five waves, and defeat the boss outside the shelter.'],
  'popwake': ['Reconnect the alarm chain', 'Lay a single signal path that wakes every relay in the warning network.'],
  'orbit-guard': ['Shield the radio core', 'Turn the shield to intercept incoming sparks and protect the transmitter.'],
  'bell-bloom': ['Tune the warning bells', 'Time each bell strike to synchronize the camp alarm.'],
  'mothlight': ['Guide the night scouts', 'Lead the lost moth scouts back to the illuminated shelter.'],
  'garden': ['Defend the food garden', 'Build a living defense and survive every wave attacking the settlement crops.'],
  'borrowed': ['Power the echo reactor', 'Use recorded movement, echoes, and energy sails to charge the reactor chamber.'],
  'prism': ['Align the solar relay', 'Redirect colored light through the mirrors to reconnect every receiver.'],
  'lantern': ['Reconnect the three islands', 'Pilot the relief ship, relight Lantern Vale, and restore both distant islands.'],
  'upside': ['Recover the gravity core', 'Cross the gravity tunnels, gather stars, and recover the machinery behind the exit.'],
};
const extras = [
  { id: 'dewfall', title: 'Dewdrop Drift', category: 'Puzzle', levelCount: DEW_LEVELS.length, instructions: 'Hold and slide to tilt all the drops. Lift to slow them down. Water every flower; avoid spilling over the edges.' },
  { id: 'pondpost', title: 'Pond Post', category: 'Adventure', levelCount: POND_LEVELS.length, instructions: 'Pull back from anywhere to aim a hop. Release to jump along the lily pads until you reach the mailbox.' },
  { id: 'ribbon', title: 'Ribbon Reef', category: 'Adventure', levelCount: REEF_LEVELS.length, instructions: 'Slide to steer through the glowing arches and collect pearls. Release to hold your course and reach the end of the reef.' },
  { id: 'moonbounce', title: 'Moonbounce', category: 'Action', levelCount: 1, instructions: 'Drag to steer and gather orbiting moons. Release to launch them. Clear all five waves, choose upgrades between waves, and defeat the final boss.' },
  { id: 'popwake', title: 'Popwake', category: 'Puzzle', levelCount: POP_LEVELS.length, instructions: 'Draw a connected domino path from the blue spark. Release to start the chain reaction and wake every jelly.' },
  { id: 'garden', title: 'Garden Guard', category: 'Defense', levelCount: GARDEN_LEVELS.length, instructions: 'Choose Sun bloom, Pea pod, or Shellnut, then tap a lawn patch. Collect glowing suns to buy plants. Defend every lane through the final wave.' },
  { id: 'borrowed', title: 'Borrowed Tomorrow', category: 'Action', levelCount: CHAMBERS.length, instructions: 'Move with WASD or drag to steer. Hold Snap to pulse, use Dash to escape, and bank a route to leave an echo. Stretch the sail between your echoes over all three blooms.' },
  { id: 'prism', title: 'Prism Orchard', category: 'Puzzle', levelCount: PRISM_LEVELS.length, instructions: 'Tap mirrors and splitters to turn them. Guide the correct colored beams into every flower receiver. Hint highlights a useful piece.' },
  { id: 'lantern', title: 'Lantern Vale', category: 'Exploration', levelCount: 1, instructions: 'W/S fly forward/back, A/D turn, Space rises, and E descends; Shift boosts. On touch, drag to fly and hold the altitude buttons. Gather fireflies, hover still inside lantern rings, then follow the guide to restore both distant islands.' },
  { id: 'upside', title: 'Upside Nib', category: 'Platformer', levelCount: 4, instructions: 'Move with A/D or arrows, Space jumps, W or ↑ flips gravity, and Shift runs or fires. Find the exit; stars and checkpoints help along the way.' },
];
const puzzleLevels = { 'burrow-banquet': 3, 'moon-basket': 4, 'stack-strata': 3, 'jelly-lanterns': 4, 'dream-duos': 3, 'flock-shift': 4, 'kelp-kitchen': 3 };
const originals = new Map([...arcadeGames.map(({ id, title, instructions, category }) => ({ id, title, instructions, category, levelCount: puzzleLevels[id] || 1 })), ...extras].map(entry => [entry.id, entry]));
export const ACTIVITIES = Object.freeze(DISTRICTS.flatMap(district => district.missions.map(id => {
  const original = originals.get(id), [task, description] = tasks[id];
  return Object.freeze({ ...original, originalTitle: original.title, task, description, district: district.id, color: district.color,
    inputMode: ['borrowed', 'lantern', 'upside'].includes(id) ? 'native' : 'pointer',
    asset: `./assets/${arcadeGames.some(game => game.id === id) ? `arcade/${id}` : `${id}-preview`}-480.webp` });
})));
export const byId = new Map(ACTIVITIES.map(activity => [activity.id, activity]));
