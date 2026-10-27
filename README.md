# Games

[Play online](https://todorbonchev.github.io/games/)

A collection of standalone Three.js browser games. The home page is a lightweight game picker; each game loads its own 3D scene only when opened. Everything needed to play is bundled locally.

| Game | Play | What's included |
| --- | --- | --- |
| **Soldier vs Zombies** | [Launch the shooter](https://todorbonchev.github.io/games/soldier.html) | The existing two-island survival campaign, jetpack, Frozen Orb, weapons, upgrades, and endless mode. |
| **Garden Guard** | [Launch garden defense](https://todorbonchev.github.io/games/garden.html) | Five garden defense levels with five lanes, three plant types, runners, armored zombies, and up to five waves. |
| **Borrowed Tomorrow** | [Launch the time sail](https://todorbonchev.github.io/games/borrowed.html) | Six clockworld chambers where your two recorded past selves steer a triangular weapon. Flow and Rift difficulties, clockblooms, crosswinds, armor, and a final boss. |
| **Moonbounce** | [Launch Moonbounce](https://todorbonchev.github.io/games/moonbounce.html) | A one-thumb 3D arcade game: gather little moons, lift to send them bouncing, pick powers, and face the big grump. |
| **Popwake** | [Launch Popwake](https://todorbonchev.github.io/games/popwake.html) | Draw a trail of jelly dominoes and start a chain reaction to wake every jelly in eight handmade puzzles. |
| **Pond Post** | [Launch Pond Post](https://todorbonchev.github.io/games/pondpost.html) | Help a little frog deliver mail by leaping across floating lily pads, collecting stamps, and navigating five routes. |
| **Prism Orchard** | [Launch Prism Orchard](https://todorbonchev.github.io/games/prism.html) | Turn crystal mirrors, split colored light, and combine beams to bloom eight night gardens. |
| **Ribbon Reef** | [Launch Ribbon Reef](https://todorbonchev.github.io/games/ribbon.html) | Glide a little manta through five coral currents, chain perfect arches, and gather pearls with your ribbon wake. |
| **Dewdrop Drift** | [Launch Dewdrop Drift](https://todorbonchev.github.io/games/dewfall.html) | Tilt six tiny gardens to roll water marbles around rocks, springs, and breezes into thirsty flowers. |

## Play locally

With Node.js installed, run:

```sh
npm run dev
```

Open **http://127.0.0.1:5173** to choose a game. Direct entries are `/soldier.html`, `/garden.html`, `/borrowed.html`, `/moonbounce.html`, `/popwake.html`, `/pondpost.html`, `/prism.html`, `/ribbon.html`, and `/dewfall.html`. No install, build step, account, or internet connection is needed to play. The pinned Three.js engine is included in `vendor/` with its MIT license. The game can also be served by any ordinary static HTTP server.

To try on a phone on your Wi-Fi, run `npm run dev -- --host 0.0.0.0` and open your computer's local IP on port 5173. Both portrait and landscape have dedicated menus, camera framing, and thumb controls. Rotate during a run without losing progress; lift and place your thumbs again after rotating.

## Saved progress

All nine games automatically save their current progress to **localStorage** in this browser. Use **Continue** on the game menu, or the game card on the home page, to resume. Time spent away does not advance the run.

Garden Guard restores the chosen level, plants and health, enemies, sun resources and drops, projectiles, seed cooldowns, used lawnmowers, wave progress, selected plant, and game speed. A completed garden can resume at its victory screen and continue to the next garden. Each level’s best stars and time stay separate from its current run.

Soldier vs Zombies restores the island, wave and remaining enemies, health, score, weapon, upgrade build, supplies, armor, Overdrive, field uplink progress, statistics, jetpack fuel, and ability cooldown. Pending upgrade choices are retained; the Palm-to-Ember transition is saved independently of the old tab session. Positions are moved to nearby walkable ground when the regenerated island scenery requires it. In-flight spells, acid, and cosmetic effects are cleared on restore. A completed campaign can resume into endless play.

Borrowed Tomorrow restores the chamber, difficulty, exact loop clock, player and enemies, incoming shots, health, beats, bloom repairs, boss health, cooldowns, random sequence, and both recorded routes, including borrow teleports. You can also resume between loops or from a completed chamber. Chamber stars, best scores, fewest loops, sound, and difficulty preference are stored separately from the run.

Moonbounce restores the wave, health, enemies, orbiting and loose moons, flying moons and shots, score, combo, chosen powers, and random sequence. An unchosen power selection and the final victory screen can also be resumed. The best score and sound preference are saved separately from the current run.

Popwake restores the selected puzzle and its current board or chain reaction. Completing a puzzle saves its best stars and unlocks the next one. An interrupted drawing is discarded safely, so you can draw a fresh trail after resuming. Puzzle progress is stored separately from the other games.

Pond Post saves the route, current lily pad and checkpoint, collected stamps, score, and route records separately from the other games. An interrupted aim is cleared safely so a restored run cannot launch unexpectedly.

Prism Orchard restores the puzzle, mirror orientations, turn count, and hint use. Its completion stars and unlocked puzzles are saved separately. Ribbon Reef restores the current, exact position and wake, hearts, collected pearls, and arch streak; completed currents and best scores remain after a swim ends. Dewdrop Drift restores every water marble, filled flower, and spill count, while preserving earned garden stars separately.

Starting a fresh run replaces that game’s checkpoint. In the action games, defeat or **End run & return** clears the unfinished run; scores, island unlocks, preferences, and earned stars are kept. Each game has its own save slot. No account or cookies are needed. Saves belong to this browser and device; clearing site data removes them. If storage is blocked or full, gameplay continues.

## Prism Orchard

Guide colored light into every flower in eight night gardens. Tap a crystal to rotate its mirror; diamonds split the beam, and colored filters keep only their own color. Separate beams can meet in a flower: red and blue make pink. The early puzzles teach each idea, and the final gardens combine branching paths and multiple colors.

There is no timer. Finish in the fewest turns for three stars, or use **Hint** to highlight a useful crystal; a hinted attempt can earn at most two stars. **Reset** begins a fresh attempt. On a keyboard, focus the board, use arrow keys to select crystals, and press Enter or Space to turn one. Completing each garden opens the next.

## Ribbon Reef

Guide a little manta through five coral currents. Drag one finger anywhere in the scene to move horizontally and vertically; lifting holds your course. Your whole trailing ribbon collects pearls. The current carries you forward, so look ahead and steer toward the next glowing arch. Keyboard arrows or WASD also steer.

Passing through an arch's center builds a perfect streak. Close passes by coral earn extra flow points; missed arches and collisions cost a heart. Each swim takes about 47 seconds. Reach the end to open the next current. For three stars, pass at least 75% of the arches, earn five perfects, and collect six pearls. Retry a current to improve your record.

## Dewdrop Drift

Hold anywhere in the garden and slide your thumb to tilt it. Every water marble rolls together; guide each into a thirsty flower. Release to level the garden and slow the drops. Six gardens introduce rocks, spring leaves, and breezes. The rim keeps drops on the island, while puddles send a drop back to its starting point without undoing flowers already filled.

There is no timer or lives counter. A gentle touch helps you guide the remaining drops as the garden blooms. Earn three stars with at most one spill, two with at most four, or one for finishing. Keyboard arrows or WASD also tilt the garden.

All three games support portrait and landscape, safe-area insets, cancelled touches, pause, reduced motion, and WebGL context recovery. Touch rendering uses at most 420,000 pixels and 1.35× density with multisample antialiasing disabled. Paused games stop repainting until something changes; actual frame rate depends on the device.

## Pond Post

Help a little frog carry the post across five forest ponds. Hold and pull back to aim, watch the predicted arc, then release to leap onto the next lily pad. Collect stamps along the way and reach the mailbox to finish the route. Some pads move and the wind changes, so each jump is a small timing puzzle.

There are no lives to lose: a missed jump returns the frog to the last safe pad. Aim for the centers of pads to make perfect landings and build a streak. The game supports phone play in portrait and landscape and saves route progress on the device.

For three stars, collect at least half the stamps, make two perfect landings, and miss at most once. The predicted arc accounts for wind and moving pads. A flight can be resumed from the exact point where it was saved.

| Action | Phone | Keyboard / mouse |
| --- | --- | --- |
| Aim and leap | Hold anywhere, pull back, and release | Drag and release, or press Space, adjust with arrows or WASD, and press Space / Enter |
| Pause / resume | Pause / Keep hopping | P / Esc |

The scene supports interrupted touches, rotation, background pausing, reduced motion, and WebGL recovery. On touch devices it caps the framebuffer at 420,000 pixels and 1.35× density, disables multisample antialiasing, and targets 30 frames per second. Actual performance depends on the device.

## Popwake

Draw a connected trail of jelly dominoes from the glowing starter, then lift your finger to set off a chain reaction. Your goal is to wake every sleeping jelly in eight handcrafted puzzles. Trails can revisit a square to branch, so a single pop can travel in more than one direction. Each puzzle has a limited trail budget; only new squares use it.

Pops can wake a nearby jelly or ignite another domino. Gold jellies have a larger ripple that can reach across rocks, but your finger and dominoes must go around those rocks. Each puzzle shows a budget and a three-star target. Use no more than the target without a hint for three stars; longer successful routes earn one or two stars.

There is no timer or lives counter. Redraw as often as you like, or use a hint when you need a nudge. A hint caps that attempt at two stars and remains active when you redraw; replay the puzzle for a fresh unhinted attempt. Puzzle completion and best stars are saved on the device. Popwake uses locally bundled Three.js and supports phone play in portrait and landscape.

| Action | Phone | Keyboard / mouse |
| --- | --- | --- |
| Draw a trail | Drag from the blue spark across neighboring cells | Drag with the mouse, or press Space and use arrow keys or WASD |
| Start the chain | Lift your finger | Release the mouse, or press Space / Enter |
| Redraw / hint | REDRAW / HINT | R / H |
| Pause / resume | Pause / Keep popping | P / Esc |

The board supports interrupted touches, resizing, reduced motion, background pausing, and WebGL recovery. On touch devices the renderer limits its framebuffer to 420,000 pixels and 1.35× density, avoids multisample antialiasing, and targets 15 frames per second while idle and 30 while drawing or reacting. Reduced motion stops idle rendering while keeping chain reactions visible. Models and effects use reusable Three.js instance batches; actual performance depends on the device.

## Moonbounce

A little star gathers moons into an orbit. **Touch and drag anywhere in the play area to move; lift your finger to launch every moon in the orbit.** They seek nearby space creatures and bounce between targets or off the rail. Creatures leave more moons to gather, and nearby pops can set off a chain. Collect the returning moons and send them out again. On a computer, drag and release with the mouse, or use WASD / arrow keys to move and Space to launch. The LAUNCH button also works with touch or a keyboard.

The orbit begins with four moons and holds ten; a power can increase its capacity. Launch six or more at once to create a **Moonstorm**, giving each launched moon extra damage and an extra bounce. Orbiting moons also absorb a close enemy or shot, becoming loose moons that can be picked up again. Move away from enemies and their shots to protect your star. A few moons appear over time if the field gets sparse, so an empty orbit is recoverable. Hitting several creatures close together earns a chain and a score bonus.

Play five waves of increasingly lively creatures. After each of the first four waves, choose one of three powers to keep for the rest of the run: more capacity, stronger moons, extra bounces, faster movement, a larger collection range, or extra health. Each new wave restores some health. Wave five ends with the Big Grump. New runs shuffle the visitor and power sequence. There is a victory screen, best score, replay, optional synthesized sound, help, and local autosave.

The complete game works with one thumb in portrait or landscape, including after a rotation or interrupted touch. It also supports keyboard navigation, reduced motion, background pausing, and WebGL context recovery. On touch devices rendering caps its framebuffer at 420,000 pixels and 1.35× density, avoids multisample antialiasing, and targets 30 fps. Models, moons, shots, and effects use shared Three.js instance batches. The simulation caps loose moons at 80, orbiting moons at 22, launched moons at 96, enemies at 40, and incoming shots and effects at 80 each. Actual frame rate depends on the device.

## Borrowed Tomorrow

An original game built around a **time sail**: you move one corner of a glowing triangle, while your previous two routes move the other corners. The first loop supplies two crystal anchors. Bank that loop, and your route replaces an anchor; bank another, and both corners are past versions of you. Your echoes replay exactly what you did and then wait at their endpoints. Every few seconds you are cooperating with a decision you made earlier.

**Hold SNAP** to catch machines inside the sail and turn them into beats. Put a glowing clockbloom inside the triangle, then snap to feed it those beats. Repair all three blooms to finish the room. Bloom II wakes on loop two, and III on loop three, so learning to leave useful memories is part of the goal. Later chambers require a sail edge to skim the bloom. A wide sail hits harder and turns enemy shots into more beats.

Bank early when your route is useful, or let the loop clock run out. Repairs and beats carry over; machines reset and you recover up to 30 health. You keep only the last two memories. The three starting corners alternate each loop. Leave yourself spread-out endpoints and useful paths rather than a folded triangle. Running out of health or loops ends the attempt.

| Chamber | What changes |
| --- | --- |
| 1 · A thread in time | Learn to catch machines, feed blooms, and record a useful route. |
| 2 · The turning garden | The remaining crystal anchor rotates. Sentries start firing. |
| 3 · Crosswind engine | Wind pushes the present. Past routes stay fixed. Skim blooms with an edge. |
| 4 · The narrow hour | Crystal pillars constrain movement; armor and expanding clockwaves demand care. |
| 5 · Three-body weather | The blooms drift around their orbits while both echoes replay their routes. |
| 6 · Tomorrow, unbroken | Repair three blooms to expose the Unwinder, then catch its heart in a wide sail. |

**Flow** gives more health, longer loops, slower machines, and more generous bloom edges. **Rift** tightens those margins. All chambers can be selected directly. Win in the room's par number of loops with at most five hits for three stars; finish within par plus two loops for two stars. Replay to improve your records.

| Action | Keyboard / mouse | Phone |
| --- | --- | --- |
| Move / reshape sail | WASD, arrows, or click the garden | Left thumb joystick |
| Snap repeatedly | Hold Space or E, or hold SNAP | Hold SNAP with right thumb |
| Dash through danger | Shift | DASH |
| Jump to your farther echo | Q | BORROW, available from loop two |
| Bank the current route | R | BANK LOOP |
| Pause / resume | P or Esc | Pause / Keep weaving |

Dash briefly protects you and damages machines you pass through. Borrow jumps to the farther echo's position, which folds the sail until you move away; the jump is preserved in the next recording. Both abilities have cooldowns. The game includes contextual hints, a route preview between loops, optional synthesized sound, help, a final ending, and system reduced-motion support. Leaving the page, losing focus, or losing the WebGL context pauses the game.

Phone controls support simultaneous movement and snapping, pointer cancellation, portrait and landscape, safe-area insets, and rotation during play. Touch rendering caps the framebuffer at 420,000 pixels and 1.35× density, disables multisample antialiasing, and targets 30 fps. Enemies, characters, glows, shots, and particles use shared instance batches. The simulation caps machines at 36, shots at 96, and effects at 72. Menus and paused or finished rooms render only when something changes. These are rendering budgets, not a guarantee of frame rate on every phone.

## Garden Guard

An original Plants vs. Zombies-inspired lane defense game, rendered with the locally bundled Three.js engine. All plants, zombies, lawnmowers, the cottage, and the garden are modeled in code.

Choose any of **five gardens** with the **01 / 05** button. Each has five lanes across eight columns, its own wave schedule, lighting, starting resources, and saved completion stars. Winning offers **Next garden**; replay and direct level selection are available throughout. Each new garden starts with fresh plants, sun, and emergency mowers.

| Level | Garden | Waves | Zombies | Starting sun | Challenge |
| --- | --- | --- | --- | --- | --- |
| 1 | Backyard beginnings | 3 | 18 | 200 | Learn to grow sun and defend the lawn. |
| 2 | Sunny side | 3 | 24 | 225 | Early attacks on the outside lanes, then more armor. |
| 3 | Runner’s row | 3 | 26 | 250 | Faster runners arrive among the walkers. |
| 4 | Dusk patrol | 4 | 29 | 225 | Sky sun arrives every nine seconds; protect your blooms. |
| 5 | Last lawn standing | 5 | 40 | 300 | The longest siege, with tougher enemies and mixed rushes. |

Runs last about two to four minutes. Cone-wearing zombies take more hits; runners wear turquoise and yellow and move faster. Each lane has one emergency lawnmower; a later zombie reaching home ends the run.

| Plant | Cost | Role |
| --- | --- | --- |
| Sun bloom | 50 sun | Produces 25 sun, first after seven seconds and then every ten seconds. |
| Pea pod | 100 sun | Automatically shoots zombies to its right in the same lane. |
| Shellnut | 75 sun | Blocks zombies and absorbs bites so other plants can keep firing. |

Tap a seed packet, then an empty lawn tile. Tap glowing suns to collect **25 sun**; uncollected suns disappear after fourteen active seconds. Sky suns appear regularly, and Sun blooms grow more. Keep the blooms on the left and put Pea pods in every lane before the larger waves. Seed packets have brief cooldowns. The shovel returns half a removed plant's cost, rounded down.

Mouse and touch use the same controls. On a keyboard, **1–3** select plants, **4** selects the shovel, and **P / Esc** pauses. Tab onto the lawn, use arrow keys to choose a patch, and press Enter or Space to plant. The **1× / 2×** button changes game speed. Help and pause freeze the level; switching browser tabs also pauses it. Best completion stars and time are saved separately from the shooter's settings.

The level includes victory and defeat screens, restart, WebGL context recovery, keyboard dialog navigation, and links back to all games. It works in portrait and landscape; rotating preserves the current run. All five gardens are available from the level picker. Each stores its own best stars and time.

## Soldier vs Zombies

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
| Sound | M or settings | Settings |
| Helicopter redeploy | H after cooldown | Pause → Helicopter redeploy |

Choose your weapon before deployment. **Ranger** is a versatile automatic rifle; **Striker** fires precise three-round bursts; **Breacher** fires seven spread pellets and rewards getting close. All three use the same hold-to-fire control, have unlimited ammo, and benefit from your upgrades. Your weapon preference is saved. Choose a different one when you return to the briefing.

Tap **Jump / Fly** for a normal jump, or hold it to ignite the soldier's twin-thruster jetpack. Use the movement controls to steer while flying and release to descend. The fuel meter provides six seconds of thrust and recharges on landing; flight levels off around 18 meters above terrain. After running out of fuel, release and hold again to restart. Pausing or rotating the phone releases held controls.

Switch between **first person** and **third person** using **V**, the HUD camera button, or the View option in settings. Your choice is saved. First person includes a visible weapon and supports flying, firing, and casting; helicopter insertion keeps its cinematic camera.

Cast **Frozen Orb** with **F** or its HUD button. Aim with the crosshair: the icy orb travels through enemies, sheds radial ice shards, then bursts into a final ring. Hits damage enemies and chill them for three seconds, slowing movement and attacks. Scenery blocks the spell, and aiming down from the air bursts it near the ground. Its eight-second cooldown pauses with the game. Spell kills award normal score and rewards without changing rifle accuracy.

Each wave also offers an optional **field uplink**. Follow its compass arrow to the turquoise station, enter the marked ring, and hold it for **five seconds**. Enemies inside the zone pause capture; leaving slowly loses progress. Securing it awards **125 score, 20 reserve armor, and ten seconds of Overdrive**. Armor absorbs damage before health and stacks up to 60 points. The uplink never blocks wave progression, and no extra interaction button is needed.

Clearing a wave restores up to **25 health** and grants **four seconds** to collect supplies. Then choose one of **three upgrades**: improve damage, fire rate, movement, armor, recovery, or collection range. Each perk has three ranks; fully upgraded builds receive useful one-time rewards. Combat freezes while you choose. Your build carries into Ember Isle and resets on a new run.

Every four kills can drop supplies, and elites drop both kinds. Walk close to a **medkit** to recover 30 HP or an **Overdrive cell** for eight seconds of faster, stronger fire. Full-health medkits remain available until needed. Overdrive waits while you pause, choose an upgrade, recover between waves, or redeploy. Supplies expire after 45 active seconds; at most six are present at once.

The five-wave sequence changes the fight: **First Contact, Cross Fire, Runner Rush, Iron Guard, and Commander**. Cross Fire introduces ranged **Spitters**: their acid globs mark a green warning ring for 1.4 seconds before forming a brief damaging pool. Move clear, jump across the acid, use solid cover, or kill the caster before the glob lands. At most three pools exist; overlapping pools cannot multiply their damage.

Wave three introduces an armored elite. Wave five brings a commander with a broad, clearly marked ground slam: **leave the warning ring or jump before it fills**. Clearing all five Palm Isle waves unlocks Ember Isle. Clear five Ember waves to complete the operation, see your rating, and choose either a fresh deployment or **Continue Endless**, which keeps your upgrades and starts wave six. Commanders recur every five endless waves. Best score, graphics, sound, and island unlocks are saved in this browser. Quality changes restart the current run; fullscreen is optional.

Keep a **momentum chain** by defeating another enemy within seven combat seconds and avoiding damage. Three consecutive kills earn **×2 kill score**, and eight earn **×3**. Pauses, upgrades, recovery, and helicopter insertion do not consume the timer. Your best chain contributes to the final **C–S operation rating**, alongside kills, elites, uplinks, accuracy, and completion. Uplink and upgrade score rewards are not multiplied.

The atmosphere develops with the operation: Palm's golden light gives way to blue storm clouds and light rain, while Ember's copper dusk develops a cyan aurora. Flocks of birds circle and glide above both islands. Lighting, clouds, fog, and ocean tint transition together. Reduced motion stops the weather and bird animation and rain while retaining readable attack warnings.

Watch for an enemy drawing its arms back: move away or jump before the strike lands. Enemies steer around scenery, and solid cover blocks attacks. The wave progress strip shows how close you are to clearing the area; the debrief records your kills, combat time, accuracy, wave, score, and upgrade build.

Settings include saved **look sensitivity** for both mouse and touch and **reduced motion** for recoil, impact particles, and interface animation. Auto motion follows your system preference. Controls and field tips are also available from the pause menu.

Use **End run & return** in the pause screen, or **Return to briefing** after defeat, to choose a new deployment. Your best score and unlocked islands are kept.

Phone graphics start at a capped resolution and adapt to sustained frame times. High quality adds antialiasing; lower tiers keep lighter terrain, vegetation, and water. Fullscreen is available in settings where supported and does not force landscape orientation.

Supplies use a fixed instance pool: all six together add six draw calls, with none while empty. A commander warning uses two reusable meshes and an uplink reuses three. Acid hazards reuse a three-slot pool, with at most seven draw calls while all warning globs are in flight. The new skies reuse the existing sky draw; Palm rain adds one draw and Ember adds none. These features add no dynamic lights and do not raise the active enemy cap. Important attack warnings remain visible with reduced motion.

## Check changes

Development checks use Node 22.22.2+, 24.15+, or 26+:

```sh
npm ci
npm test
```

The runtime tests execute the real game modules, DOM, controls, geometry, and raycasts, substituting GPU rendering and audio. They cover deployment, weapons, cover, enemy navigation, acid warnings and damage, momentum scoring, encounter composition, campaign victory and endless continuation, uplinks, pause/resume, upgrades, supply limits, commander slams, low-frame-rate fire cadence, cross-island progression, lava, death/restart, saved settings, and mobile controls.

For actual browser rendering and screenshots:

```sh
npx playwright install chromium
npm run test:browser
npm run test:mobile
npm run test:abilities
npm run test:garden
npm run test:phone
npm run test:campaign
npm run test:saves
npm run test:borrowed
npm run test:moonbounce
npm run test:popwake
npm run test:pondpost
npm run test:prism
npm run test:ribbon
npm run test:dewfall
npm run test:collection
```

Use `CHROMIUM_PATH=/path/to/chromium npm run test:browser` to use an installed browser. Screenshots go into ignored `test-results/`. The browser check covers both islands, high/medium/low graphics, desktop and mobile layouts, simultaneous touch movement and firing, keyboard dialog navigation, saved preferences, real WebGL context loss/recovery, pause, and returning to the briefing. It needs permission to run Chromium and bind a localhost port. Visual quality, sound, and physical touch controls still benefit from hands-on playtesting.

The mobile suite checks seven emulated phone sizes, notch insets, 44px touch targets, upgrade selection, combat status, debrief layouts, scrolling, and rotating while moving, firing, paused, or choosing an upgrade. Physical iOS/Android devices are still useful for GPU, thermal, audio, and browser-toolbar testing.

The abilities suite checks tap/hold jetpack flight, steering, fuel, touch cancellation, Frozen Orb cooldowns, simultaneous touch controls, and first-person switching in a real browser.

The garden suite checks the game picker, real WebGL rendering, phones, landscape rotation, touch and keyboard planting, sun collection, shovel refunds, pause, help, victory, defeat, restart, saved completion, graphics restoration, and launching the existing shooter. The campaign suite plays all five levels using only collected sun and legal planting, then checks next-level navigation, the level picker, replay, and saved stars after a reload. The phone suite checks seven phone sizes at 2× or 3× density, simulated notches, 44px main controls, complete lawn visibility, rotation, GPU budgets, and no rendering while paused. Screenshots and measurements are written to `test-results/`.

The save suite checks real closing/reopening, Continue controls on small portrait and landscape phones, independent game slots, hub continuation, corrupt data, and blocked storage. Unit tests also cover exact lawn restoration, unique restored IDs, pending upgrades, and island transitions.

The Borrowed Tomorrow suite completes all six chambers through legal controls in a real WebGL browser, tests keyboard and simultaneous touch input, and covers seven phone sizes with notches, rotation, bank/borrow flows, persistent memories, records, hub continuation, blocked/corrupt storage, and context recovery. A crowded arena test checks draw-call and geometry reuse. Pure simulation tests also complete every chamber in Flow and Rift and compare deterministic clocks and restored futures. Refresh its real-game hub thumbnail with `npm run test:borrowed -- --capture-art`.

The Moonbounce suite plays all five waves using legal movement, launches, and offered powers. In a real browser it also checks drag and release, pointer cancellation, backgrounding, rotation, notches, 44px controls, pause, graphics restoration, local saves and upgrade choices, the completed run, and seven phone layouts. It checks the crowded scene's draw calls and reuse of geometry. The simulation tests run multiple seeds and verify deterministic clocks, projectiles, and restores. Refresh the actual 3D hub thumbnail with `npm run test:moonbounce -- --capture-art`.

The Popwake suite completes all eight puzzles with legal trails and three-star solutions. Real-browser checks cover keyboard controls, a fully drawn branching trail, interrupted fingers, rotation, safe areas, pause, context recovery, an in-progress reaction restored from local storage, hints and records, blocked/corrupt storage, and seven phone layouts. The preview is captured from a live chain reaction with `npm run test:popwake -- --capture-art`.

The Pond Post suite completes all five routes through legal jumps and compares predicted landings with the actual results. Browser checks cover real touch gestures on seven phone layouts, interruptions and rotation, keyboard controls, a resumed midair flight, missed-jump recovery, independent saves, graphics restoration, and blocked or corrupt storage. Capture its live-game preview with `npm run test:pondpost -- --capture-art`.

Run `npm run test:garden -- --capture-art` to refresh the garden thumbnail and responsive WebP previews. Use `npm run test:garden -- --prepare-previews` to re-encode the existing source previews without running the full suite. The hub serves 480px or 960px images instead of the full PNG sources.

Phone rendering uses instanced plant, zombie, mower, projectile, and shadow batches. Garden Guard caps its framebuffer at 360,000 pixels and 1.25× density, disables multisample antialiasing on touch devices, and renders active play at up to 30 frames per second. The phone menu is static; paused, finished, help, and background screens stop rendering until something changes. Tile geometry is recalculated only after resizing, and the HUD refreshes at ten updates per second. The shooter keeps adaptive graphics and caps touch devices at 60 frames per second in play and 30 in its animated menu. These are resource budgets; actual performance depends on the device.

Each game owns its entry page and UI. The shooter is `soldier.html` with its existing modules. Garden Guard uses `garden.html`, `garden-main.js` (controls and UI), `garden-scene.js` (Three.js rendering), and `garden-game.js` (deterministic rules), and `garden-levels.js` (five level definitions). To add a game, give it a separate entry page and add its link to `index.html`; keep the hub free of gameplay code.

The locally bundled Barlow Condensed display font is licensed under the [SIL Open Font License](assets/fonts/OFL.txt). No external font requests are needed.

For shooter development inspection, `/soldier.html?debug=1` exposes `window.__game`; `?level=2` previews Ember Isle, and `?q=low`, `?q=medium`, or `?q=high` selects a rendering tier. These are local development shortcuts, not access controls.

For Garden Guard, `/garden.html?debug=1` exposes `window.__garden` with the simulation and scene for local inspection. Append `&level=2` through `&level=5` to preview another garden. Normal play does not expose these helpers.

Borrowed Tomorrow follows the same separation: `borrowed.html`, `borrowed.css`, `borrowed-main.js` (input, UI, sound, saves), `borrowed-scene.js` (Three.js), `borrowed-game.js` (fixed-clock simulation), and `borrowed-levels.js` (six chamber definitions). `/borrowed.html?debug=1&level=5` exposes `window.__borrowed` for local inspection. Normal play does not expose this helper.

Moonbounce uses `moonbounce.html`, `moonbounce.css`, `moonbounce-main.js` (input, UI, sound, saves), `moonbounce-scene.js` (Three.js), and `moonbounce-game.js` (fixed-clock simulation and waves). `/moonbounce.html?debug=1&seed=82941` exposes `window.__moonbounce` with a repeatable test seed. Normal play uses a fresh seed and does not expose the helper.

Popwake uses `popwake.html`, `popwake.css`, `popwake-main.js` (input, UI, sound, saves), `popwake-scene.js` (Three.js), and `popwake-game.js` (puzzles and fixed-clock chain reactions). `/popwake.html?debug=1` exposes `window.__popwake` for local inspection. Normal play does not expose this helper.

Pond Post uses `pondpost.html`, `pondpost.css`, `pondpost-main.js` (input, UI, sound, saves), `pondpost-scene.js` (Three.js), and `pondpost-game.js` (fixed-clock flight and routes). `/pondpost.html?debug=1` exposes `window.__pondpost` for local inspection. Normal play does not expose this helper.

Prism Orchard, Ribbon Reef, and Dewdrop Drift each use their own `{slug}.html`, `{slug}.css`, `{slug}-main.js`, `{slug}-scene.js`, and `{slug}-game.js`, with slugs `prism`, `ribbon`, and `dewfall`. Their `?debug=1` pages expose `window.__prism`, `window.__ribbon`, and `window.__dewfall` for local inspection. Normal play does not expose these helpers. The respective browser suites exercise legal completion, real touch controls, phone layouts, interruption and graphics recovery, and storage failures. Their hub previews are captured from the actual Three.js scenes.

The collection browser suite checks the new games together: independent hub continuation, actual preview loading, 44px controls, notch clearance, and stable play areas while instructions change on small portrait and landscape phones.
