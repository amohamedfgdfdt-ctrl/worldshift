# Report: Dense Temperate Forest Flora integration

## Integrated (enabled in assets/manifest.json)
| Entry | Variants (height in game) | Notes |
|---|---|---|
| oak | young 4.2 m, mature 9.5 m, old 8.5 m (weights .25/.55/.20) | bark texture (WebP) |
| birch | young 3.4, mature 9.0, old 8.0 (.28/.52/.20) | 3 materials |
| pine | young 3.2, mature 11.0, old 10.0 (.25/.55/.20) | bark texture |
| bush | hawthorn 1.8, elder 2.3 (.5/.5) | |
| fern (new species) | lady fern 0.8, bracken 1.1 (.7/.3) | placed in forest understory |
| tussock (new species) | tall grass 0.9 | open meadow |
| reed | reed clump 1.7 | |
| rock | boulder a/b, mossy, cluster, outcrop with ferns | scaled .55-.85 to match the game |

22 files total, all 22 load without errors. Not integrated: `ground` (forest_floor, moss_carpet): they are 2 x 2 m slabs 0.43 m thick that do not fit the terrain heightfield. They are shown in the preview only. The player-placed `tree` building stays procedural.

## Problems found and fixed
1. **Quantized vertex data (KHR_mesh_quantization) was truncated when node transforms were baked**, which crumpled every model. Found in the preview. Fixed in `AssetManager.flatten` (attributes converted to float first).
2. `rock` was rejected as an unknown species on swap (null in the species table). Fixed.
3. The AO and water-reflection passes still referenced the old single bush/rock/reed meshes, which throw once variants are split into sets. They now use `Vegetation.meshesOf(...)` (a small change in `pipeline.js`; no settings or behaviour changed).

## Tests (Chrome + SwiftShader, no real GPU)
- Preview: all 22 models load, all automated checks pass; screenshots reviewed per asset and under 3 lights.
- Integration: 21 instance sets, growth stages are separate variant sets and not LOD; the distribution follows the weights; a bad URL leaves the procedural model untouched and reports the failure; save still works.
- Pipeline suite `assets1.py`: 30/30. Simulation suite (water, save): pass.
- Memory: geometries 28 -> 48 and textures 6 -> 12 with the assets; cycling Low > Ultra > Medium > High > Low returns to the same counts (no leak).

## Performance (honest)
Rendered triangles at Low in the start view rose from about 183k (procedural) to about 908k, because the GLB models are 100 to 2,200 triangles each and have a single detail level. In SwiftShader (software, relative only) Low went from 9.7 to 6.8 fps. This was **not tested on a real GPU or phone**; expect it to be fine on desktop GPUs and heavy on weak mobile. Levers: lower graphics preset (reduces density), set `enabled:false` for bracken, bush or fern in the manifest, or add real `lods` levels (not supplied in this pack). The biggest costs are pine, oak, bush and fern.

## Licence
CC0 1.0 Universal, author "3D Assets (3dassets)", AI-generated. Stylised low-poly: not photorealistic.
