# Phase 3 report — Campaign, economy, and graphics performance

Scope: turn WORLDSHIFT / TERRA into a world-simulation game with a staged campaign, and improve the graphics engine after the flora assets were integrated. Nothing was started from scratch; Sandbox, the water simulation, saves, graphics presets, asset pipeline and procedural fallbacks are all kept.

## 1. What was implemented

### Simulation layer the campaign stands on (new, real systems)
`js/economy.js`
- **Water** = sum of what water tanks really store (tanks are sinks in the water solver).
- **Food** from farms × irrigation quality (the existing `irrigation()` check: Excellent ≤4 cells from water, Good ≤8, None) × energy satisfaction; zero while the farm is flooded.
- **Energy**: new solar plant (production follows sun and cloud cover) and wind turbine (follows the wind setting); demand from houses/farms/factories follows time of day.
- **Funds**: tax + factory output − upkeep. **Stability**: smoothed score from water/food/energy satisfaction and flooding.
- **Growth rules**: a house only fills while the stage's needs are met; residents leave when water/food run out or the house floods.
- **Events** (`EventSystem`): rain, storm, drought. They change the river inflow and add/remove water through the real water solver, with a warning before they start.
- In Sandbox the economy is computed for display but **never enforced** (nothing charged, nothing consumed, no growth gating).

### Campaign
- 9 stages (`js/campaign-data.js`): 1 First Steps (tutorial), 2 Village (water), 3 Harvest (food), 4 Power (energy), 5 Industry (economy), 6 City (urban expansion), 7 Storm Season, 8 Dry Spell, 9 Metropolis. Each has its own seed/terrain, weather, start funds, active needs, objectives, bonus objectives, hints, scheduled events, difficulty and star thresholds.
- Objectives are evaluated every 3 game minutes by `Campaign._evaluate` from live data (house counts, population, tank storage, food, energy balance, funds, stability, farms with irrigation, sustained-for-N-hours conditions, surviving a named event without exceeding a flood limit). No button completes anything. Objectives latch once met.
- Stars: ★ complete, ★★ within the first par time, ★★★ within the second par time **and** stability threshold **and** bonus objectives.
- Failure: all residents gone, stability collapse, or too much flooding during a survive-event objective. Retry / Next stage / Stage list / Keep playing on the result screen.
- Unlocking: stage N+1 opens when stage N is completed. States shown: locked / available / completed with stars. Rewards unlock buildings/tools that exist (farm, solar plant, wind turbine, small factory, medium house, drain tool).
- Costs are charged and refunded only in Campaign through `tools.gate`; locked buildings/tools are refused with a message.
- Saves: separate progress record (`worldshift.terra.campaign.v1`), a separate slot for the stage in progress (`worldshift.terra.campaign.run.v1`) that includes the world, economy, events and campaign state, and the chosen mode. Resume after reload works. The campaign slot never writes without an active run, and the Sandbox slot is never touched by the campaign.

### UI (existing identity kept: same top bar, rail, panels, colours)
Mode screen (Campaign / Sandbox), stage list with lock states and stars, stage detail (environment, objectives, par times, rewards), in-game HUD (water/food/energy/funds/stability + objective tracker with progress and hints), result screen with stars, rewards and statistics, Arabic/English toggle with RTL/LTR. New buildings show in the normal build panel. Mobile: list→detail navigation, one-line headers, HUD sized to avoid the camera buttons, RTL-aware.

### Graphics / performance
Audit result first — what already existed and was kept: instancing (one draw call per set), distance LOD with hysteresis for procedural trees and for GLB sets, shader-side distance collapse, density fraction, five presets and 16 settings, FPS/frame-time monitor, dynamic resolution, Auto mode, rAF limiter.
What was missing and was added:
1. **GLB flora had only one detail level** (the pack ships one model per species), so the LOD system did nothing for it. `js/lod-gen.js` generates medium (~40 %) and low (~15 %) levels at load time (vertex clustering; materials/UVs kept; no extra textures).
2. **No real culling.** Instances beyond draw distance were collapsed in the vertex shader but still processed. They are now removed from the draw call. Non-shadow-casting sets are also frustum-culled on the CPU; shadow casters are deliberately not (their shadows would vanish).
3. **LOD distances ignored the preset.** They now scale with Foliage quality and draw distance.
4. **Dynamic resolution** rewritten to move in 5 % steps with a proportional step, spike filtering, settle time after settings changes and a lower floor on touch devices.
5. **Mobile profile** in the Auto-Detect recommendation (never Ultra, High only for strong devices, weak devices start on Low).
6. Diagnostics: `vegetation.stats()`, `vegetation.setCulling(on)`.

## 2. Measured effect (software renderer, so only *relative* numbers are meaningful)
Instanced triangles submitted at the default camera, GLB flora, per preset:

| Preset | Before this phase | After |
|---|---|---|
| Low | 332 k | 82 k |
| Medium | 684 k | 160 k |
| High | 1 537 k | 359 k |
| Ultra | 1 741 k | 406 k |

Culling alone at High (generated LODs on in both columns): overview 461 k → 318 k (−31 %), mid zoom 557 k → 430 k (−23 %), close 708 k → 587 k (−17 %). Presets are monotone in triangles, LOD scale and draw distance (checked by `perf2.py`).

## 3. Tests run (all in headless Chrome with SwiftShader — no GPU)
| Test | Result |
|---|---|
| `cmp3.py` UI/flow: mode screen, stage list, locking, costs, result modal, star saving, reward unlock, resume after reload, Sandbox isolation, graphics settings unchanged, Arabic/RTL, no console errors | 26 / 26 (re-run after the final CSS and graphics changes) |
| `cmp1.py`, `cmp2.py` bot plays stages through real game APIs | S1–S5 and S7 won; S6, S8, S9 playable but **not** won by the bot (see §4) |
| `sim-test.mjs` water solver and save round-trip | all PASS |
| `perf2.py` generated LODs, distance culling, shadow casters not view-culled, presets monotone, campaign survives preset changes, dynamic-resolution steps/floor/frequency | 16 / 16 |
| `gfx8.py` every preset: build/delete/water/camera/save/resolution | 32 / 32 |
| `assets1.py` GLB loading, LOD, density, fallback after bad URL | 30 / 30 (two assertions were updated: far camera is now *culled*, not low-LOD; density is measured with culling off) |
| `gfx9–12`, `assets2` | no failures; the only console messages are the expected 404s of the deliberate bad-URL fallback test |
| `mobile1.py` 390×844 touch viewport: mode screen, stage list, detail, HUD, Arabic HUD, no horizontal scroll | screenshots reviewed; two layout bugs found and fixed (HUD bars overflowing their cell; HUD overlapping camera buttons in RTL) |



## 4. Not finished, and limits (stated plainly)
- **No real-device testing.** Everything ran in desktop headless Chrome with a software renderer. Frame rates from it are meaningless; only triangle counts and relative behaviour are reported. Heat, memory pressure and touch feel on phones were not measured. The mobile profile is a heuristic from browser-reported values.
- **Stages 6, 8, 9** are playable and progress, but the automatic test bot did not win them (it builds greedily and floods its own farms). They have not been proven winnable by a human either; balance may need tuning.
- **Economy balance** was tuned with bots only; no human playtest.
- **Translations** cover the new UI, building/category names and stage/objective texts. Older base dialogs (Graphics page, asset preview, some World-panel text) remain English.
- Generated LODs are a geometric approximation: far trees look blockier and slightly smaller (the averaging shrinks thin leaves). Hand-made LODs can be provided per asset in the manifest and always win.
- Procedural fallback trees/grass (used when GLBs fail) keep the old shader-side distance collapse and the old tree LOD; the new instance culling applies to GLB sets.
- Frustum culling for shadow casters is intentionally off, so trees cost their full triangles when on-screen-adjacent and shadows are enabled.
- Ground tiles from the flora pack are still preview-only (no ground system uses them).
- Sandbox: economy is calculated but not enforced; the Drain tool is unlocked there as before.

## 5. Run / update
- Run: any static server in the project folder (`python3 -m http.server 8000`) → open `index.html`. No build step. GitHub Pages: upload the folder as is (all imports are relative).
- Update: replace the folder; saves live in browser LocalStorage and are untouched. New keys: `worldshift.terra.campaign.v1`, `worldshift.terra.campaign.run.v1`, `worldshift.terra.mode`, `worldshift.terra.lang`.
- Files added: `js/economy.js`, `js/i18n.js`, `js/campaign-data.js`, `js/campaign.js`, `js/campaign-ui.js`, `js/lod-gen.js`, `campaign.css`, tests (`cmp*.py`, `perf1/2.py`, `mobile1.py`, `bot.js`, …). Modified: `buildings.js` (solar, wind), `icons.js`, `simulation.js`, `save-system.js`, `tools.js`, `ui.js`, `main.js`, `config.js`, `instances.js`, `vegetation.js`, `world.js`, `assets.js`, `graphics.js`, `performance.js`, `index.html`.
