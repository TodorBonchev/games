# Three major phone gameplay improvements

Baseline: `6faad6d`. Native self-play cleared wave one with seven kills, 160 score and full health. Separate touch-only runs reached the first recovery break. They exposed three problems: a held movement thumb curved across the world as aim assist turned; touching the fixed pad off-center immediately sprinted without a drag; stacked HUD cards occupied the natural movement area and collided with notch/left-handed layouts.

1. **Mobile Play Surface.** A compact vitals rail, one contextual objective/action dock, and a consistent mirrored four-action thumb layout reserve the center for the world. Native outpost entry and recovery actions remain available; duplicate destination panels give way to the shared dock.
2. **Floating analog steering.** Touch starts neutral, a radial deadzone filters accidental motion, and the pad appears near the contact within a bounded range. Automatic aiming preserves the chosen ground direction. Deliberate look and returning to neutral give control of reorientation to the player.
3. **Evasive dash.** A 3.5-metre ground burst takes 0.22 seconds and recharges in four active seconds. It follows the movement direction, or the camera forward direction when stationary. Short collision steps prevent tunneling, wall sliding remains available, and cliffs/lava stop the dash. Only melee receives brief evasion; acid, lava and slams keep their damage behavior. Pause, activities, rotation and reload cancel motion while retaining the saved recharge.

## Verification

The revised game cleared a fresh opening wave using native touch input: **7 kills, 160 score and 100 health in 16.23 gameplay seconds**. Off-center touchdown produced zero movement. This run used normal movement and Fire, with read-only planning and no gameplay fixtures, save edits or instant kills. Its screenshot and exact statistics are in `test-results/phone-play/earned-wave1-{clear.png,report.json}`. Orb and Evade were verified separately rather than used in that opening run.

- `npm test`: **466 passing** simulation and real-main integration tests, including collision sweeps, melee-only protection, cooldown/save compatibility, input cancellation, and insertion poses through pause/rotation.
- `npm run test:mobile`: **all seven** 320–932px viewport cases pass, including notches, rotation, controls, settings, upgrades, debrief and campaign/endless transitions.
- `npm run test:mobile:hud`: **12** size/handedness/safe-area layouts; native Fire, Jump, Orb, Evade, second-finger Map/View/Pause, minigame entry/return and recovery. Additional 320×568, notched 390×844 and landscape 667×375 checks keep every upgrade and both 44px exit buttons visible, then save and continue the actual pending upgrade.
- `npm run test:mobile:movement`: both hands in portrait/landscape; neutral touchdown, jitter rejection, analog walking/sprinting, independent finger release, manual look, pause and rotation. Native assisted aiming turned 149–153 degrees while held movement kept its world heading.
- `npm run test:survival:polish`, `npm run test:survival:50` and `npm run test:browser`: desktop and phone combat, settings, recovery, saves, both islands, outpost routing and native activity wins.

Screenshots were visually reviewed in portrait and landscape. Browser checks also exposed and fixed second-finger utility taps, a clipped upgrade footer and an obstructed-shot warning hidden behind an outpost prompt. Evidence is under ignored `test-results/mobile-hud/`, `test-results/touch-movement/`, `test-results/evasion/`, and `test-results/phone-play/`.

These are emulated-device checks. Physical iOS/Android GPU performance, browser-toolbar behavior, thermals and touch hardware were not certified.
