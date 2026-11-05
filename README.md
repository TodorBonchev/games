# Games

[Play online](https://todorbonchev.github.io/games/)

The site has two destinations: **Zombie** and **Piano**. Zombie combines the two-island survival campaign with **30 activities discovered in the world**. Walk to survivor outposts, help rebuild the settlement, then return to the same live battle with your position, equipment and campaign intact. Piano remains a separate instrument.

The latest survival pass implements **[50 improvements from self-play](IMPROVEMENTS-50.md)**, with a numbered checklist and verification for every change.

| Destination | Play | Includes |
| --- | --- | --- |
| Zombie | [Enter the world](https://todorbonchev.github.io/games/soldier.html) | Survival, exploration, weapons, upgrades, and every former game as an outpost activity. |
| Piano | [Take a seat](https://todorbonchev.github.io/games/piano/) | Free play, instrument sounds, songs and guided practice. |

Former entry pages redirect into Zombie with an activity waypoint. They do not open separate game sessions. Wonderwake's 25 challenges and the five larger adventures now share the survivor settlement.

## Play locally

Run a static server with Node.js:

```sh
npm run dev
```

Open **http://127.0.0.1:5173**. The runtime needs no build step or account. Three.js, game assets and fonts are bundled locally; any ordinary static HTTP server works. Piano can download instrument samples and uses its built-in synthesizer when they are unavailable.

For a phone on your Wi-Fi, run `npm run dev -- --host 0.0.0.0` and open your computer's local IP on port 5173. Portrait and landscape layouts support rotation during play. Release and replace held touches after rotating.

## Survivor outposts

Thirty numbered workstations are placed on safe terrain across six districts on each island. Their colored rings, signs and beacons identify them; completed activities shine green. Placement checks the current island's terrain, lava, scenery collisions and approach slopes. Outposts do not add movement obstacles.

| District | Activities | Work for the settlement |
| --- | --- | --- |
| Greenhouse Quarter | Dewdrop Drift, Burrow Banquet, Moss Flip, Bellwood Beats, Dream Duos | Irrigation, food stores, trails and communications. |
| Supply Harbor | Pond Post, Tidehook, Bubble Basket, Parcel Parade, Kelp Kitchen | Mail, fishing, water filters, deliveries and medicine. |
| Repair Yard | Ribbon Reef, Ink Sling, Jelly Lanterns, Cloud Potter, Flock Shift | Water routes, crossing markers, floodlights and repairs. |
| Rooftop Camp | Cloud Skimmer, Lane Lark, Wobble Bakery, Moon Basket, Stack Strata | Glider training, rooftop routes and camp construction. |
| Night Watch | Moonbounce, Popwake, Orbit Guard, Bell Bloom, Mothlight | Perimeter defense, alarms, radio protection and returning scouts. |
| Relay Command | Garden Guard, Borrowed Tomorrow, Prism Orchard, Lantern Vale, Upside Nib | Food defense, echo power, solar relays, island connections and gravity cores. |

Press **Tab** or tap **Survivor Outposts** to see the map and directory. Selecting an activity sets a waypoint and returns you to the island. Follow its compass and beacon, approach on foot, then press **E** or tap the interaction prompt. The map does not launch activities remotely.

Search by activity, survivor task or district; combine district and restoration-status filters, or sort by distance. **Track next unrestored outpost** explicitly chooses nearby unfinished work; **Clear waypoint** remains cleared after a reload. District counts show the settlement's progress, and completing a district celebrates its first restoration once.

The briefing explains the survivor's request and the activity controls. Select any available stage before starting. After a win, **Next stage** continues a longer activity; **Replay stage** and **Return to island** remain available. The first successful restoration of each activity grants **300 score, up to 20 health and 10 reserve armor**. Replays and later stages keep their records without awarding that first-restoration bonus again. Activity restoration persists across new survival runs.

Stage records now remember exactly which stages you won. Skipping ahead no longer marks earlier stages completed, and the next-stage suggestion fills the earliest gap. Old highest-stage records retain that known stage. A checkpoint preview shows its stage and save age; choose **Continue activity** to retain the attempt or **Start fresh** to replace it.

Entering an activity or opening the map freezes the live island. Enemies, projectiles, wave timers, position, equipment and cooldowns do not advance behind the overlay. Returning resumes that same in-memory battle. Activities load within the page, without iframes, another game route or a second animation loop.

### Shared activity controls

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Move in a movement activity | WASD or arrows | Direction pad / drag, as shown in its briefing |
| Point, select or drag | Mouse; arrows/WASD move a visible keyboard cursor, hold Space/Enter to drag and release to act | Tap, hold, drag and release |
| Activity actions | Labeled buttons; Tab focuses controls | Labeled action buttons |
| Pause / resume | Esc or P | Pause / Resume |
| Return to survival | Return to island button | Return to island button |

Keyboard pointer controls apply to the activities originally designed for a mouse or finger. Pausing, backgrounding, rotating or leaving clears held keys and gestures. Native movement activities also support a controller: left stick or D-pad to move, A/B for the primary actions, X or a trigger for running/boosting, and Start to pause. Held input must return to neutral after menus or reconnection. Each activity's briefing remains the source for its specific controls.

### Longer activities

- **Upside Nib:** four complete gravity platforming worlds with three optional stars each, lantern checkpoints, enemies, power-ups and floor/ceiling routes. A/D or left/right moves, Space jumps, W/up flips gravity, and Shift runs or fires. Hold Jump for extra height. Its original pixel art, themed scenery and landing guides are retained. The shared pause menu retains Always run, Assist for the next restart and checkpoint retry. Assist grants unlimited retries and a gentler timer; its records remain separate from Classic. Original Nib best scores, medals, unlocks and preferences are preserved alongside the outpost checkpoint.
- **Garden Guard:** defend five gardens by planting Sun bloom, Pea pod and Shellnut, collecting sun and using the shovel. Plants, enemies, resources, waves and lawnmowers remain part of each garden's simulation.
- **Borrowed Tomorrow:** six echo chambers combine movement, recorded routes, borrowing and banking echoes. Space snaps, Shift dashes and E borrows; the action buttons expose the remaining tools.
- **Prism Orchard:** eight gardens of mirrors, splitters, colored light and flower receivers. Rotate pieces to complete the circuit; Hint and Reset remain available.
- **Lantern Vale:** freely fly the relief ship around the village and its two neighboring islands. Restore the village lanterns, awaken Moonbloom Sanctuary and calibrate Sunspire Observatory. W/S moves, A/D turns, Space rises, E descends and Shift boosts. Touch has flight gestures and altitude buttons.
- **Moonbounce:** the full five-wave run, including offered powers between waves and the final Big Grump. Gather moons, steer clear of incoming creatures and launch the orbit to defend the watch perimeter.
- **Popwake, Pond Post, Ribbon Reef and Dewdrop Drift:** their puzzle boards, mail routes, reef currents and gardens are selectable stages inside their outposts.

### Minigame polish

Every outpost has one or two focused improvements. The action buttons show their current availability and keep keyboard focus and held touches when their labels change. New controls clear on pause, rotation and return to the island; older activity saves remain supported.

| Activity | Improvements |
| --- | --- |
| Upside Nib | Route progress with collected, upcoming and missed star markers. |
| Garden Guard | Selected seed, cost and planting readiness; valid/invalid planting previews. |
| Borrowed Tomorrow | Ability cooldown and availability labels; **B** banks a route directly. |
| Prism Orchard | **Z** undoes rotations while retaining hint penalties; missing-color guidance for partially powered receivers. |
| Lantern Vale | Hold **G** for precision flight; relative direction, distance and altitude guidance. |
| Moonbounce | **L** launches moons while you keep steering; Moonstorm readiness guidance. |
| Popwake | **Z** removes the last domino while drawing and returns its budget. |
| Pond Post | **C** cancels an aimed hop; safe/perfect landing and splash guidance. |
| Ribbon Reef | Next-arch direction and arrival countdown; immediate gate feedback. |
| Dewdrop Drift | Hold **B** to brake and settle drops near flowers. |
| Lane Lark | Arrival markers; catch and miss feedback. |
| Orbit Guard | Next-star direction preview; alignment and centered-catch feedback. |
| Cloud Skimmer | Upcoming altitude guide; precise pass and miss feedback. |
| Ink Sling | Aiming trajectory and target preview; one buffered follow-up shot. |
| Bubble Basket | Pearl and urchin landing markers; catch feedback. |
| Moss Flip | Danger warnings; animated rail crossings that respect reduced motion. |
| Bell Bloom | Visible timing window; perfect, early and late feedback with duplicate-tap protection. |
| Burrow Banquet | Undo; legal walk and push markers. |
| Moon Basket | Undo; row and column conflict outlines. |
| Stack Strata | Undo; valid destination cues that preserve selection after a mistake. |
| Jelly Lanterns | Undo; next-switch hints computed from the current board. |
| Dream Duos | Buffered next tap during mismatch reveals; numbered symbols and distinct matched cards. |
| Flock Shift | Undo; correct-position outlines and progress count. |
| Kelp Kitchen | Undo; valid pour cues that preserve selection after a mistake. |
| Tidehook | Moving catch cue; directional miss feedback. |
| Bellwood Beats | **R** replays the song without spending a chance; visible notes and input progress. |
| Parcel Parade | Matching number symbols; valid/invalid depot drop previews. |
| Wobble Bakery | Wind direction and strength indicator; balance warning gauge. |
| Mothlight | Connection and lost-light feedback; active-flower route guidance. |
| Cloud Potter | Live swipe preview; matched-row markers. |

The six board-puzzle undo controls use **Z** and retain up to 32 successful moves across checkpoints. Reset remains available for a fresh attempt.

## Saved progress

Progress is stored in this browser's **localStorage**. No account is required. Clearing site data removes the saves; blocked or full storage leaves the current visit playable and displays a storage notice in activities.

| Save | Key | Contents |
| --- | --- | --- |
| Survival run | `games:save:soldier` | Island, wave, enemies, player, equipment, upgrades, health, score, supplies, armor, Overdrive, uplink, statistics and ability cooldowns. |
| Outpost expedition | `games:zombie:expedition:v1` | Restored activity IDs, completed stage progress, per-activity checkpoints, play counts and selected waypoint. |
| Previous Wonderwake campaign | `games:wonderwake:v1` | Read for migration when no valid outpost save exists; retained afterward. |

Activity checkpoints are recorded while playing, when pausing and when leaving. Reentering the corresponding station offers **Continue activity**. Closing or reloading the page resumes through the Zombie menu: continue the survival run, visit the station and continue its checkpoint. Time away does not advance either simulation. Ending or restarting a survival run does not remove restored outposts.

Migration imports compatible Wonderwake completion and checkpoints into the new expedition. Other standalone saves, scores and preferences remain on the device but are not automatically copied into every new activity. Keeping those keys does not make the retired standalone menus accessible.

Use **Save & return to briefing** from pause or upgrades to keep a run available through Continue. **End run & return** still explicitly ends it. Changing graphics quality during a run saves and resumes it; if saving is unavailable, the run stays open.

The live enter/return transition preserves the exact battle. New saves retain the world-construction seed and layout density. Scenery collisions and outpost positions survive reloads and graphics-quality changes; terrain, lighting and particle detail follow the selected quality. Loading older saves may reconcile player and enemy positions to nearby walkable ground. In-flight spells, acid and cosmetic effects are cleared during reload recovery. Pending upgrades, the Palm-to-Ember transition and completed-campaign endless continuation remain supported.

## Surviving the islands

A third-person island survival shooter with helicopter insertion, a flyable jetpack, Frozen Orb magic, three weapon styles, changing encounters and weather, optional field objectives, and an upgrade build carried through a two-island campaign.

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Move | WASD or arrow keys | Left thumb stick |
| Look | Mouse (click the scene to capture) | Drag right side |
| Aim and fire | Hold left mouse button | Hold FIRE |
| Jump / fly | Tap / hold Space | Tap / hold JUMP / FLY |
| Steer in flight | WASD or arrow keys | Left thumb stick |
| Frozen Orb | F | FROZEN ORB |
| First / third person | V or camera button | Camera button |
| Skip insertion | Space or Enter | SKIP INSERTION |
| Sprint | Hold Shift while moving, without firing | Push the movement stick fully, without firing |
| Pause / resume | Esc or P | Pause button / Resume |
| Keep scavenging after a wave | C | Keep scavenging |
| Choose an upgrade now | N, during recovery | Upgrade now |
| Enter nearby outpost | E | Tap the outpost prompt |
| Outpost map / waypoint | Tab | Survivor Outposts button |
| Sound | M or settings | Settings |
| Helicopter redeploy | H after cooldown | Pause → Helicopter redeploy |

Choose your weapon before deployment. **Ranger** is a versatile automatic rifle; **Striker** fires precise three-round bursts; **Breacher** fires seven spread pellets and rewards getting close. All three use the same hold-to-fire control, have unlimited ammo, and benefit from your upgrades. Your weapon preference is saved. Choose a different one when you return to the briefing.

Tap **Jump / Fly** for a normal jump, or hold it to ignite the soldier's twin-thruster jetpack. Use the movement controls to steer while flying and release to descend. The fuel meter provides six seconds of thrust and recharges on landing; flight levels off around 18 meters above terrain. After running out of fuel, release and hold again to restart. Pausing or rotating the phone releases held controls.

Switch between **first person** and **third person** using **V**, the HUD camera button, or the View option in settings. Your choice is saved. First person includes a visible weapon and supports flying, firing, and casting; helicopter insertion keeps its cinematic camera.

Cast **Frozen Orb** with **F** or its HUD button. Aim with the crosshair: the icy orb travels through enemies, sheds radial ice shards, then bursts into a final ring. Hits damage enemies and chill them for three seconds, slowing movement and attacks. Scenery blocks the spell, and aiming down from the air bursts it near the ground. Its eight-second cooldown pauses with the game. Spell kills award normal score and rewards without changing rifle accuracy.

Each wave also offers an optional **field uplink**. Follow its compass arrow to the turquoise station, enter the marked ring, and hold it for **five seconds**. Enemies inside the zone pause capture; leaving slowly loses progress. Securing it awards **125 score, 20 reserve armor, and ten seconds of Overdrive**. Armor absorbs damage before health and stacks up to 60 points. The uplink never blocks wave progression, and no extra interaction button is needed.

Clearing a wave restores up to **25 health** and starts a **four-second** recovery countdown. Press **C / Keep scavenging** to stay out as long as you need: collect supplies, finish the uplink, or visit an outpost. The combat clock and uncollected supplies stop aging during this extended break, and your choice survives saves and reloads. Press **N / Upgrade now** when ready. No new enemies spawn until you choose an upgrade.

Choose one of **three upgrades**: improve damage, fire rate, movement, armor, recovery, or collection range. Each perk has three ranks; fully upgraded builds receive useful one-time rewards. Combat freezes while you choose. Your build carries into Ember Isle and resets on a new run.

Amber chevrons around the crosshair show the direction of nearby enemies within **16 metres**. Multiple enemies in one direction share a count. Close enemies and winding attacks receive stronger red warnings; a brief bracket marks the direction of a hit. These cues clear during menus and outposts, and respect reduced motion.

Aim assist turns smoothly toward a target. Move the mouse or drag your firing thumb to take over aiming immediately; shots follow the crosshair. After you stop looking, assistance can return to a target in front of you. Releasing and pressing Fire again starts a fresh assisted search.

Assistance searches past blocked candidates and checks barrel clearance as well as the camera's view. A cover cue explains obstructed shots. Target health, pooled hit/kill feedback and the last-hostile compass make combat easier to follow. New arrivals telegraph for 0.65 seconds; overlapping enemies spread apart, and simultaneous melee hits share 0.26 seconds of protection. Acid, lava and commander slams retain their own damage behavior. The debrief identifies the final damage source and gives a relevant tip.

Open **Controls, visibility & audio** before deployment or from pause. Choose assistance strength or fully manual aim, inverted vertical look, toggle fire/sprint, mirrored touch controls, crosshair size, high contrast and reduced flashes. Effects and helicopter/wind volumes are independent; activities follow the effects volume. Settings persist on this device; pausing and entering activities release latched combat inputs.

Every four kills can drop supplies, and elites drop both kinds. Walk close to a **medkit** to recover 30 HP or an **Overdrive cell** for eight seconds of faster, stronger fire. Full-health medkits remain available until needed. Overdrive waits while you pause, choose an upgrade, recover between waves, or redeploy. Supplies expire after 45 active seconds; at most six are present at once.

Cells also remain available when your current Overdrive is already at least eight seconds. New drops favor keeping useful supplies and search clear, safe ground. The weapon HUD and recovery panel guide you to nearby useful items, prioritizing medical care at critical health. In their final eight seconds, supplies have a larger orange halo, with a static cue under reduced motion. Recovery previews the next encounter, while upgrade cards show numerical changes and accept **1 / 2 / 3** after appearing. Offers favor distinct available upgrade roles.

Frozen Orb accepts an input in its final 0.3 seconds of cooldown and casts once when ready. A short readiness cue also announces when the spell is available. Uplinks retain progress through a 0.35-second boundary misstep and explain when altitude, distance or hostiles prevent capture.

The five-wave sequence changes the fight: **First Contact, Cross Fire, Runner Rush, Iron Guard, and Commander**. Cross Fire introduces ranged **Spitters**: their acid globs mark a green warning ring for 1.4 seconds before forming a brief damaging pool. Move clear, jump across the acid, use solid cover, or kill the caster before the glob lands. At most three pools exist; overlapping pools cannot multiply their damage.

Wave three introduces an armored elite. Wave five brings a commander with a broad, clearly marked ground slam: **leave the warning ring or jump before it fills**. Clearing all five Palm Isle waves unlocks Ember Isle. Clear five Ember waves to complete the operation, see your rating, and choose either a fresh deployment or **Continue Endless**, which keeps your upgrades and starts wave six. Commanders recur every five endless waves. Best score, graphics, sound, and island unlocks are saved in this browser. Quality changes restart the current run; fullscreen is optional.

Keep a **momentum chain** by defeating another enemy within seven combat seconds and avoiding damage. Three consecutive kills earn **×2 kill score**, and eight earn **×3**. Pauses, upgrades, recovery, and helicopter insertion do not consume the timer. Your best chain contributes to the final **C–S operation rating**, alongside kills, elites, uplinks, accuracy, and completion. Uplink and upgrade score rewards are not multiplied.

The atmosphere develops with the operation: Palm's golden light gives way to blue storm clouds and light rain, while Ember's copper dusk develops a cyan aurora. Flocks of birds circle and glide above both islands. Lighting, clouds, fog, and ocean tint transition together. Reduced motion stops the weather and bird animation and rain while retaining readable attack warnings.

Watch for an enemy drawing its arms back: move away or jump before the strike lands. Enemies steer around scenery, and solid cover blocks attacks. The wave progress strip shows how close you are to clearing the area; the debrief records your kills, combat time, accuracy, wave, score, and upgrade build.

Settings include saved **look sensitivity** for both mouse and touch and **reduced motion** for recoil, impact particles, and interface animation. Auto motion follows your system preference. Controls and field tips are also available from the pause menu.

Use **End run & return** in the pause screen, or **Return to briefing** after defeat, to choose a new deployment. Your best score and unlocked islands are kept.

Phone graphics start at a capped resolution and adapt to sustained frame times. High quality adds antialiasing; lower tiers keep lighter terrain, vegetation, and water. Fullscreen is available in settings where supported and does not force landscape orientation.

Supplies use a fixed instance pool: all six together add six draw calls, with none while empty. A commander warning uses two reusable meshes and an uplink reuses three. Acid hazards reuse a three-slot pool, with at most seven draw calls while all warning globs are in flight. The new skies reuse the existing sky draw; Palm rain adds one draw and Ember adds none. These features add no dynamic lights and do not raise the active enemy cap. Important attack warnings remain visible with reduced motion.


## Piano

The separate piano supports mouse, touch and computer-keyboard playing, octave changes, sustain, volume, instrument choices and reverb. **Songs** opens the searchable practice library. **Wait** mode waits for the correct notes; **Tempo** mode advances in time. **Listen** demonstrates the song, and the sheet-music control shows its notes on a staff. Practice can be stopped, restarted or left without affecting Zombie progress.

Instrument samples are credited in the piano's sound menu. Grand and Old Piano use Alexander Holm's Salamander Grand Piano; other sampled instruments use Frank Wen's FluidR3_GM SoundFont. Both are distributed under CC BY 3.0 through the sources linked in that menu. The built-in synthesizer remains available offline.

## Lantern Vale source assets

The activity's village is authored in `blender/lantern-vale.blend` and exported as `assets/lantern-vale.glb`; `assets/lantern-world.json` describes the playable world. The editable Blender scene retains separate objects. Static web geometry is merged by material, while the flower petals and observatory orrery remain separate for animation.

Moonbloom Sanctuary and Sunspire Observatory retain their own Blender collections, cameras and lighting. `scripts/build-lantern-satellites.py` is composed by the main generator. Regenerate the editable scene and web assets with Blender installed:

```sh
blender --background --factory-startup --python scripts/build-lantern-world.py
```

Append `-- --render` to create `test-results/lantern/blender-world.png`. The generation script was tested with Blender 4.5 LTS.

## Development and checks

Use a Node.js version supported by `package.json`: 22.22.2+, 24.15+, or 26+. Install development dependencies and run the simulation/runtime suite:

```sh
npm ci
npm test
```

These tests execute game rules, DOM controls, real Three.js geometry and raycasts with substituted GPU/audio APIs. Outpost tests cover all 30 placements on both actual island terrains across multiple scenery seeds, collision-free approaches, slope/lava checks, completion state and resource disposal. Browser testing is separate:

```sh
npx playwright install chromium
npm run test:activities
npm run test:polish
npm run test:survival:polish
npm run test:survival:50
npm run test:browser
npm run test:mobile
npm run test:abilities
npm run test:piano
```

`test:activities` exercises the unified entry points, outposts and native controllers. Activity-specific aliases such as `test:upside`, `test:garden`, `test:moonbounce` and `test:lantern` select that activity in the same browser runner. The `test:arcade` and `test:voyage:legacy` aliases select groups. Older script names remain compatibility shortcuts; they no longer imply testing a standalone page or a complete old campaign playthrough.

`test:polish` checks the new controls in the live zombie host on desktop and phone: undo/replay, seed selection and costs, cooldowns, launching while steering, simultaneous touches, overlapping keyboard/touch holds, pause cleanup, route progress and returning to the island without click-through. The unit suite also checks each activity's new mechanics and existing legal completion paths.

`test:survival:polish` checks threat bearings and hit directions, manual aiming, recovery controls, held recovery across reloads, and phone controls in portrait and landscape.

`test:survival:50` runs the new combat, comfort-settings, supply/save/quality, and outpost-directory browser checks. They use native rendering and input, repeatable setup fixtures, actual legal activity wins, persistent checkpoints, and desktop/portrait/landscape layouts. Each suite also supports `GAMES_TEST_URL` to verify a published copy.

Use `CHROMIUM_PATH=/path/to/chromium` to select an installed browser. Screenshots and measurements go into ignored `test-results/`. Browser checks verify actual rendering, transitions, input and saves; simulation tests exercise additional completion paths. Passing these checks does not establish that every full campaign, audio path or physical phone has been played. Real iOS/Android hardware remains useful for touch, GPU, audio, thermal and browser-toolbar behavior.

### Code organization

| Module | Responsibility |
| --- | --- |
| `index.html`, `hub.js`, `hub.css` | Two-destination home and saved-survival continuation. |
| `soldier.html`, `main.js`, `world.js`, `world2.js` | Survival UI, one root animation loop, combat and island worlds. |
| `activities/catalog.js` | Thirty activities, six districts, descriptions and stages. |
| `activities/world.js` | Terrain-safe stations, batched workstation models, completion colors and projected waypoints. |
| `activities/host.js`, `activities/activities.css` | Briefings, journal, shared controls, pause, lifecycle, rewards and HUD. |
| `activities/controllers.js`, `activities/upside.js` | Native adapters around the existing game simulations and renderers. |
| `activities/progress.js` | Expedition validation, persistence and Wonderwake migration. |
| `voyage/`, `arcade/`, `*-game.js`, `*-scene.js` | Reused activity rules and scenes; historical standalone source remains available for reference. |
| `activity-redirect.js` | Compatibility entry URLs and selected activity/stage waypoints. |
| `piano/` | Independent instrument and learning experience. |

Only one activity controller is alive at a time. The zombie renderer and battle remain allocated but suspended while that activity runs. Its renderer is created on entry and disposed on exit; Upside Nib uses Canvas 2D, while other activities reuse their Three.js scenes. All activity updates are scheduled by the zombie loop. Activities must not install another animation loop, global gameplay keyboard handler, or page navigation.

To add content, extend the activity catalog and controller adapter, place it in a district, and verify its save/restore, completion, input cancellation and disposal behavior. Do not add another home-page game card or standalone launch flow.

For local inspection, `/soldier.html?debug=1` exposes `window.__game`, including `.activities.host`, `.activities.world` and `.activities.progress`. Add `&activity=upside` to track that outpost, `&activityLevel=2` to request a stage, `&level=2` for Ember Isle, or `&q=low`, `&q=medium`, `&q=high` to choose a rendering tier. Tracking an activity does not bypass walking to its station. Debug helpers are development tools, not access controls.

The locally bundled Three.js engine retains its MIT license. Barlow Condensed is bundled under the [SIL Open Font License](assets/fonts/OFL.txt); no external font requests are needed.
