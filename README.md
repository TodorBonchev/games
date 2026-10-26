# Games

[Play online](https://todorbonchev.github.io/games/)

A collection of standalone Three.js browser games. The home page is a lightweight game picker; each game loads its own 3D scene only when opened. Everything needed to play is bundled locally.

| Game | Play | What's included |
| --- | --- | --- |
| **Soldier vs Zombies** | [Launch the shooter](https://todorbonchev.github.io/games/soldier.html) | The existing two-island survival campaign, jetpack, Frozen Orb, weapons, upgrades, and endless mode. |
| **Garden Guard** | [Launch garden defense](https://todorbonchev.github.io/games/garden.html) | Five garden defense levels with five lanes, three plant types, runners, armored zombies, and up to five waves. |

## Play locally

With Node.js installed, run:

```sh
npm run dev
```

Open **http://127.0.0.1:5173** to choose a game. Direct entries are `/soldier.html` and `/garden.html`. No install, build step, account, or internet connection is needed to play. The pinned Three.js engine is included in `vendor/` with its MIT license. The game can also be served by any ordinary static HTTP server.

To try on a phone on your Wi-Fi, run `npm run dev -- --host 0.0.0.0` and open your computer's local IP on port 5173. Both portrait and landscape have dedicated menus, camera framing, and thumb controls. Rotate during a run without losing progress; lift and place your thumbs again after rotating.

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
```

Use `CHROMIUM_PATH=/path/to/chromium npm run test:browser` to use an installed browser. Screenshots go into ignored `test-results/`. The browser check covers both islands, high/medium/low graphics, desktop and mobile layouts, simultaneous touch movement and firing, keyboard dialog navigation, saved preferences, real WebGL context loss/recovery, pause, and returning to the briefing. It needs permission to run Chromium and bind a localhost port. Visual quality, sound, and physical touch controls still benefit from hands-on playtesting.

The mobile suite checks seven emulated phone sizes, notch insets, 44px touch targets, upgrade selection, combat status, debrief layouts, scrolling, and rotating while moving, firing, paused, or choosing an upgrade. Physical iOS/Android devices are still useful for GPU, thermal, audio, and browser-toolbar testing.

The abilities suite checks tap/hold jetpack flight, steering, fuel, touch cancellation, Frozen Orb cooldowns, simultaneous touch controls, and first-person switching in a real browser.

The garden suite checks the game picker, real WebGL rendering, phones, landscape rotation, touch and keyboard planting, sun collection, shovel refunds, pause, help, victory, defeat, restart, saved completion, graphics restoration, and launching the existing shooter. The campaign suite plays all five levels using only collected sun and legal planting, then checks next-level navigation, the level picker, replay, and saved stars after a reload. The phone suite checks seven phone sizes at 2× or 3× density, simulated notches, 44px main controls, complete lawn visibility, rotation, GPU budgets, and no rendering while paused. Screenshots and measurements are written to `test-results/`.

Run `npm run test:garden -- --capture-art` to refresh the garden thumbnail and responsive WebP previews. Use `npm run test:garden -- --prepare-previews` to re-encode the existing source previews without running the full suite. The hub serves 480px or 960px images instead of the full PNG sources.

Phone rendering uses instanced plant, zombie, mower, projectile, and shadow batches. Garden Guard caps its framebuffer at 360,000 pixels and 1.25× density, disables multisample antialiasing on touch devices, and renders active play at up to 30 frames per second. The phone menu is static; paused, finished, help, and background screens stop rendering until something changes. Tile geometry is recalculated only after resizing, and the HUD refreshes at ten updates per second. The shooter keeps adaptive graphics and caps touch devices at 60 frames per second in play and 30 in its animated menu. These are resource budgets; actual performance depends on the device.

Each game owns its entry page and UI. The shooter is `soldier.html` with its existing modules. Garden Guard uses `garden.html`, `garden-main.js` (controls and UI), `garden-scene.js` (Three.js rendering), and `garden-game.js` (deterministic rules), and `garden-levels.js` (five level definitions). To add a game, give it a separate entry page and add its link to `index.html`; keep the hub free of gameplay code.

The locally bundled Barlow Condensed display font is licensed under the [SIL Open Font License](assets/fonts/OFL.txt). No external font requests are needed.

For shooter development inspection, `/soldier.html?debug=1` exposes `window.__game`; `?level=2` previews Ember Isle, and `?q=low`, `?q=medium`, or `?q=high` selects a rendering tier. These are local development shortcuts, not access controls.

For Garden Guard, `/garden.html?debug=1` exposes `window.__garden` with the simulation and scene for local inspection. Append `&level=2` through `&level=5` to preview another garden. Normal play does not expose these helpers.
