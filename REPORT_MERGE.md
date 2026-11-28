# Integration report: v3 (ours) + Phase 4 (other version)
All checks: desktop headless Chrome, software renderer (SwiftShader). Mobile emulation: only the older v3 mobile test; new features were only run at 390x844 emulation in the sandbox-events test. Real phone: NOT tested.

## Comparison result (source diff of js/ files, not assumption)
| Feature in Phase 4 | Status in v3 | Action |
|---|---|---|
| Mountain boundary + camera clamp | boundary.js already in v3 | kept ours |
| Full-screen world map | map-ui.js already in v3 | kept ours |
| 12-step tutorial | tutorial.js already in v3 | kept ours |
| River: wandering course, variable width, irregular banks, rapids | already in v3 terrain.js (noise banks, varying half width, rapids reach) | kept ours, ours is a superset |
| Shallow transparent water, turquoise shallows | already in v3 water shader | kept ours; their sandy-bed tint not copied (cosmetic, changes water colour) |
| Moonlight, blue night ambient, moon glints | already in v3 sky.js / water-system.js (moon glint on water, night floor) | kept ours; screenshot merge-farm-night.png |
| Vegetation (riparian bushes, ferns) | already in v3 vegetation.js | kept ours |
| Walking residents + farm animals | already in v3 life.js (commuters, herds) | kept ours |
| Random disasters in Sandbox | scheduler existed; controls were missing | BUILT: frequency, strength, start-now, chip, lightning, haze |
| Arabic for old dialogs | v3 had gaps | FIXED the ones found by tests/harvest-ar.py; remaining English: brand names, tech terms (FPS, GPU, WebGL), Asset preview dev tool |
| 6x6 farm with animal pen | not adopted | v3 keeps 4x4: the proven 3-star runs, farm placement and flood rule depend on it. Added hay, trough, coop to the model instead (visual) |

## Simulated vs visual only
Simulated: disaster strength (water source rate and rain volume), frequency. Visual only: lightning, haze, chip, farm props, walkers, animals.

## Nothing lost (checked)
Diff of v3t (pre-merge zip) against this build touches only: economy.js (event intensity), main.js, ui.js, campaign-ui.js, i18n.js, style.css, buildings.js (farm props), README. Roads, bridges, cars, theme B, briefings, funds, tips, flood rule files unchanged.

## Results (pre-merge baseline kept separate: /downloads/premerge-baseline)
Merged-build checks: see final message table. Stage 8 is NOT proven. No balance changed.

## Stage 8 funds 8000 -> 10000 (user-approved balance change)
- User approved on WhatsApp (2:08 PM, Nov 28, a reply to the 11:10 AM question "8000 to 10000").
- Only `js/campaign-data.js` s8 `env.funds` changed.
- The test bot also changed for s8 and s9 only: it now builds a short road spur to a farm spot near water that has no road link (before, most farm spots were refused for lacking access, so the bot never reached enough food). Placement cooldown key fixed. Desktop headless Chrome only; no real-phone test.
- Bot run on the working copy: s8 win, 3 stars, 75.9 h, 15 houses, 9 farms. The exact-archive rerun is in the table below (version v3x).
