# Soldier vs Zombies

[Play online](https://todorbonchev.github.io/soldier-zombie-game/)

A third-person island survival shooter with helicopter insertion, three weapon styles, changing encounters and weather, optional field objectives, and an upgrade build carried through a two-island campaign.

## Play locally

With Node.js installed, run:

```sh
npm run dev
```

Open **http://127.0.0.1:5173**. No install, build step, account, or internet connection is needed to play. The pinned Three.js engine is included in `vendor/` with its MIT license. The game can also be served by any ordinary static HTTP server.

To try on a phone on your Wi-Fi, run `npm run dev -- --host 0.0.0.0` and open your computer's local IP on port 5173. Both portrait and landscape have dedicated menus, camera framing, and thumb controls. Rotate during a run without losing progress; lift and place your thumbs again after rotating.

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Move | WASD or arrow keys | Left thumb stick |
| Look | Mouse (click the scene to capture) | Drag right side |
| Aim and fire | Hold left mouse button | Hold FIRE |
| Jump | Space | JUMP |
| Skip insertion | Space or Enter | SKIP INSERTION |
| Sprint | Hold Shift while moving, without firing | Push the movement stick fully, without firing |
| Pause / resume | Esc or P | Pause button / Resume |
| Sound | M or settings | Settings |
| Helicopter redeploy | H after cooldown | Pause → Helicopter redeploy |

Choose your weapon before deployment. **Ranger** is a versatile automatic rifle; **Striker** fires precise three-round bursts; **Breacher** fires seven spread pellets and rewards getting close. All three use the same hold-to-fire control, have unlimited ammo, and benefit from your upgrades. Your weapon preference is saved. Choose a different one when you return to the briefing.

Each wave also offers an optional **field uplink**. Follow its compass arrow to the turquoise station, enter the marked ring, and hold it for **five seconds**. Enemies inside the zone pause capture; leaving slowly loses progress. Securing it awards **125 score, 20 reserve armor, and ten seconds of Overdrive**. Armor absorbs damage before health and stacks up to 60 points. The uplink never blocks wave progression, and no extra interaction button is needed.

Clearing a wave restores up to **25 health** and grants **four seconds** to collect supplies. Then choose one of **three upgrades**: improve damage, fire rate, movement, armor, recovery, or collection range. Each perk has three ranks; fully upgraded builds receive useful one-time rewards. Combat freezes while you choose. Your build carries into Ember Isle and resets on a new run.

Every four kills can drop supplies, and elites drop both kinds. Walk close to a **medkit** to recover 30 HP or an **Overdrive cell** for eight seconds of faster, stronger fire. Full-health medkits remain available until needed. Overdrive waits while you pause, choose an upgrade, recover between waves, or redeploy. Supplies expire after 45 active seconds; at most six are present at once.

The five-wave sequence changes the fight: **First Contact, Cross Fire, Runner Rush, Iron Guard, and Commander**. Cross Fire introduces ranged **Spitters**: their acid globs mark a green warning ring for 1.4 seconds before forming a brief damaging pool. Move clear, jump across the acid, use solid cover, or kill the caster before the glob lands. At most three pools exist; overlapping pools cannot multiply their damage.

Wave three introduces an armored elite. Wave five brings a commander with a broad, clearly marked ground slam: **leave the warning ring or jump before it fills**. Clearing all five Palm Isle waves unlocks Ember Isle. Clear five Ember waves to complete the operation, see your rating, and choose either a fresh deployment or **Continue Endless**, which keeps your upgrades and starts wave six. Commanders recur every five endless waves. Best score, graphics, sound, and island unlocks are saved in this browser. Quality changes restart the current run; fullscreen is optional.

Keep a **momentum chain** by defeating another enemy within seven combat seconds and avoiding damage. Three consecutive kills earn **×2 kill score**, and eight earn **×3**. Pauses, upgrades, recovery, and helicopter insertion do not consume the timer. Your best chain contributes to the final **C–S operation rating**, alongside kills, elites, uplinks, accuracy, and completion. Uplink and upgrade score rewards are not multiplied.

The atmosphere develops with the operation: Palm's golden light gives way to blue storm clouds and light rain, while Ember's copper dusk develops a cyan aurora. Lighting, clouds, fog, and ocean tint transition together. Reduced motion stops the new weather animation and rain while retaining readable attack warnings.

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
```

Use `CHROMIUM_PATH=/path/to/chromium npm run test:browser` to use an installed browser. Screenshots go into ignored `test-results/`. The browser check covers both islands, high/medium/low graphics, desktop and mobile layouts, simultaneous touch movement and firing, keyboard dialog navigation, saved preferences, real WebGL context loss/recovery, pause, and returning to the briefing. It needs permission to run Chromium and bind a localhost port. Visual quality, sound, and physical touch controls still benefit from hands-on playtesting.

The mobile suite checks seven emulated phone sizes, notch insets, 44px touch targets, upgrade selection, combat status, debrief layouts, scrolling, and rotating while moving, firing, paused, or choosing an upgrade. Physical iOS/Android devices are still useful for GPU, thermal, audio, and browser-toolbar testing.

The locally bundled Barlow Condensed display font is licensed under the [SIL Open Font License](assets/fonts/OFL.txt). No external font requests are needed.

For development inspection, `?debug=1` exposes `window.__game`; `?level=2` previews Ember Isle, and `?q=low`, `?q=medium`, or `?q=high` selects a rendering tier. These are local development shortcuts, not access controls.
