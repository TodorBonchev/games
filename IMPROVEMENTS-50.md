# Zombie: 50 improvements from self-play

Baseline: `4dddb6d`. Played native opening combat with movement, firing, flight and Frozen Orb, then inspected the live outpost directory. Two opening runs ended with little explanation; cover could stall assisted fire, and the directory made unfinished nearby work hard to find. Source review and repeatable gameplay checks informed the remaining changes.

Each numbered item is a distinct player-facing change. Completion and evidence are recorded below after implementation.

| # | Improvement | Verification |
|---|---|---|
| 1 | Assisted targeting searches beyond three blocked enemies. | Passed: Fourth visible target acquired past three obstructed candidates; native raycast check. |
| 2 | Cover-blocked shots give feedback and avoid futile assisted locks. | Passed: Native camera-over-cover fixture rejects the barrel-blocked lock and shows the cue. |
| 3 | Show the current target's remaining health. | Passed: Live health/progress values checked on desktop and both phone orientations. |
| 4 | Guide the player toward the last remaining hostile. | Passed: One remaining hostile shows a correctly oriented compass and distance. |
| 5 | Brief shared melee protection prevents stacked crowd hits in one instant. | Passed: Three simultaneous melee strikes deal 18 HP rather than 54 HP; hazards remain independent. |
| 6 | Arriving enemies visibly telegraph before moving or attacking. | Passed: Natural spawn stays still for 0.65 seconds with an arrival cue. |
| 7 | Validate fallback spawn locations against terrain, hazards and scenery. | Passed: Validated random/fallback searches and real native spawn clearance checks. |
| 8 | Separate overlapping enemies so crowds remain readable. | Passed: Initially overlapping native enemies spread more than 0.8 m apart. |
| 9 | Buffer a Frozen Orb press just before its cooldown finishes. | Passed: Near-ready input casts exactly once; pausing cancels the queued cast. |
| 10 | Announce when Frozen Orb becomes ready again. | Passed: Readiness transitions announce once; native cooldown/pause checks. |
| 11 | Add bounded damage and kill feedback near targets. | Passed: Sustained hits share one label per enemy within the six-label pool; real kill text. |
| 12 | Explain the final damage source and offer a relevant survival tip. | Passed: Source-specific tips covered in logic; native melee death shows the cause. |
| 13 | Allow aim assistance to be disabled. | Passed: Native firing with assistance off leaves camera yaw unchanged. |
| 14 | Make assisted turning strength adjustable. | Passed: 25% assistance caps native automatic turning at 27.5 degrees/second. |
| 15 | Offer inverted vertical look. | Passed: Native mouse and simultaneous-touch look verify inverted pitch. |
| 16 | Offer toggle-to-fire with safe clearing through menus. | Passed: Native mouse/touch start, release, second-tap stop and pause clearing. |
| 17 | Offer toggle sprint to reduce sustained key holding. | Passed: Native movement stays faster after releasing Shift and resets on pause. |
| 18 | Mirror touch controls for left-handed play. | Passed: Mirrored controls and simultaneous steering/look/fire pass in both phone orientations. |
| 19 | Offer a larger crosshair. | Passed: Centered reticle checked at 2x size, including persistence. |
| 20 | Offer a high-contrast HUD. | Passed: Solid high-contrast panels and critical labels visually checked. |
| 21 | Reduce bright weapon and damage flashes independently of motion. | Passed: Actual first-person hits retain damage while both muzzle views and light stay off. |
| 22 | Adjust effects volume independently. | Passed: Actual shot playback processes the updated 45% effects bus independently of ambience. |
| 23 | Adjust ambience volume independently. | Passed: Actual 20% ambience bus, independent effects changes and master mute verified. |
| 24 | Open full comfort settings before deployment, with reliable Escape/focus behavior. | Passed: Briefing/settings leave the run untouched; native Escape restores opener focus. |
| 25 | Search the outpost directory by name, task or district. | Passed: Native searches find Prism by text without losing the input field. |
| 26 | Filter outposts by restoration/checkpoint status. | Passed: Combined restoration/checkpoint and district filters checked. |
| 27 | Sort outposts by distance. | Passed: Directory rows match actual ascending world distances. |
| 28 | Show directory result counts and a useful empty-state reset. | Passed: Zero-match results expose a working reset; result counts update. |
| 29 | Track exact won stages instead of claiming skipped stages were completed. | Passed: Legal stage-8 and stage-1 wins record exactly [1,8]. |
| 30 | Recommend the next genuinely unfinished stage. | Passed: After stages [1,8], the next suggested stage is 2. |
| 31 | Preview an activity checkpoint's stage and save time. | Passed: Native briefing shows saved stage and checkpoint age. |
| 32 | Explicitly offer a fresh activity attempt alongside Continue. | Passed: Native Continue retains the puzzle; Start fresh replaces that attempt. |
| 33 | Allow the tracked outpost waypoint to be cleared. | Passed: Cleared waypoint stays cleared through a real reload. |
| 34 | Offer to track the nearest unrestored outpost after a restoration. | Passed: Explicit tracking chooses nearby unfinished work and never launches remotely. |
| 35 | Show completion counts for each district. | Passed: District counts change from 4/5 to 5/5 after a legal restoration. |
| 36 | Celebrate a district's first full restoration once. | Passed: The fifth restoration celebrates once; replay/reload do not repeat it. |
| 37 | Leave an Overdrive cell available when collecting it gives no benefit. | Passed: A cell survives stronger Overdrive, then applies once below eight seconds. |
| 38 | Preserve useful scarce supplies when a full drop pool needs space. | Passed: Utility/scarcity ordering preserves critical medical care and evicts unneeded items first. |
| 39 | Keep dropped supplies clear of scenery and hazardous ground. | Passed: Native medkit placement clears scenery; terrain/hazard/clearance checks remain active. |
| 40 | Guide the player toward nearby useful supplies. | Passed: Needed-medkit priority, compass direction and live weapon/recovery hints checked. |
| 41 | Make expiring supplies visibly distinct. | Passed: Age-42 save restores orange expiry halos; reduced-motion matrices remain static. |
| 42 | Preview the upcoming encounter during recovery. | Passed: Preview names, roster counts, elites and island/endless boundaries match actual encounters. |
| 43 | Show actual before-and-after upgrade benefits. | Passed: Before/after numbers match the resulting damage, mitigation, healing and pickup bonuses. |
| 44 | Offer a broader mix of upgrade categories when available. | Passed: Offers span three distinct available roles and retain distinct choice IDs. |
| 45 | Select upgrades with guarded 1/2/3 keyboard shortcuts. | Passed: Opening/repeated digits cannot skip choices; native selection applies one upgrade. |
| 46 | Save and return to the briefing without ending the run. | Passed: Native Save/Continue preserves battle, held recovery and pending offered choices. |
| 47 | Resume the saved run after changing graphics quality. | Passed: Native low-to-medium changes preserve health, score, choices, all colliders and all 30 outposts. |
| 48 | Preserve the generated world seed through reloads. | Passed: 24 production builds preserve colliders, solid transforms and outposts across tiers/densities/seeds. |
| 49 | Briefly preserve uplink capture progress when stepping across its edge. | Passed: A brief edge crossing retains progress; sustained departure decays it; pause/reload covered. |
| 50 | Explain whether hostiles, altitude or distance are stopping capture. | Passed: Native/gameplay checks distinguish altitude, hostile contesting and leaving the ring. |

## Validation

All 50 items are implemented and verified. **433 automated tests pass**, and all four new native browser suites pass with zero JavaScript or missing-asset errors. Browser screenshots are written to ignored `test-results/`.

- `npm test`: gameplay, saves, controls, progression, directory and world-layout checks.
- `npm run test:survival:50`: native combat, settings, support/save/quality and legal outpost completion checks.
- `npm run test:browser`: all four existing desktop/phone campaign, controls, upgrade and graphics-recovery cases passed. The high-quality desktop case was repeated successfully after the final world-layout change.

The new browser suites cover desktop, portrait phone and landscape phone. The layout checks use real WebGL, and the world-layout tests compare 24 production builds while verifying that graphics detail still changes. Browser tests use repeatable placement/checkpoint fixtures alongside native input; these checks do not claim a complete unassisted campaign or physical-device coverage.
