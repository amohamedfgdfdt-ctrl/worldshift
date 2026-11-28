# External asset pipeline (GLB / glTF 2.0)

`assets/manifest.json` is read at start-up. With no entries (the default) nothing is downloaded and the glTF loader is never even imported: the game runs on its procedural models. `assets/manifest.example.json` shows every field.

## What can be replaced
| category | targets (`target`) | notes |
|---|---|---|
| `building` | `house_small`, `house_medium`, `factory_small`, `farm`, `water_tank` | footprint stays the game's grid footprint |
| `tree` | `oak`, `pine`, `birch` (natural forest) and `tree` (the tree the player plants) | wind sway + draw-distance cull are added to the materials automatically |
| `shrub` | `bush`, `reed` | |
| `rock` | `rock` | no wind |
| `plant` | `grass`, `flower`, `reed` | grass cull distance |

Each asset: `url` (one file) **or** `lods` (up to 3 files: high, medium, low with the `distance` in metres where each level starts; defaults per category), optional `dimensions` {width,height,depth in m}, `fit` (`none` | `height` | `footprint`: uniform scale to match `dimensions`), `scale`, `yOffset`. All levels get the same scale (computed on the high level). A manifest entry that is invalid, or whose high-detail file fails, is skipped and the procedural model stays; a broken lower LOD is dropped with a warning (`assets.report()`).

## Model conventions
Y up, origin at the centre of the footprint on the ground, 1 unit = 1 m, glTF 2.0 (`.glb` preferred). Static meshes only (no skins/animations).

## Materials
Every mesh is split by material and merged into one geometry with one group per distinct material, so one instanced draw per material and LOD level. Meshes that carry several materials (material array + geometry groups) are handled by group; no material is dropped. Kept: base colour/albedo, normal, roughness/metalness, AO (`uv1` is preserved), emissive, alphaTest/alpha-blend, double-sided, vertex colours when the material uses them. Anisotropic filtering follows the Texture quality setting. Shadows follow the Shadow settings (High and Medium levels cast, Low does not); Vegetation density applies to GLB vegetation; Draw distance applies to GLB vegetation.

## Level of detail
`LodInstanceSet` (js/instances.js) keeps each instance in exactly one level's InstancedMesh, switches by camera distance with 10 % hysteresis, a quarter of the instances per frame. Works for buildings and vegetation, including picking, deleting and save/load.

## Compression
All decoders are loaded lazily, only when a model actually uses the extension, from `vendor/decoders/` (~0.8 MB, never fetched otherwise; delete the folder to save the space if you do not use Draco/KTX2).
- **Draco** (`KHR_draco_mesh_compression`): `vendor/decoders/draco/` (WASM only). Tested with a real encode → GLB → load round trip (14 % of raw size on the test mesh).
- **Meshopt** (`EXT_meshopt_compression`): decoder module in `vendor/jsm/libs/` (25 KB). Decoder initialises; **not tested with a real meshopt-encoded file** (no encoder offline).
- **KTX2 / Basis** (`KHR_texture_basisu`): `vendor/decoders/basis/` (WASM). Transcoder initialises; **not tested with a real .ktx2 texture** (no encoder offline).
Produce compressed files with `gltf-transform` (`optimize --compress draco|meshopt --texture-compress ktx2`) or gltfpack.


## Variants vs. LOD (manifest v2)

- A **variant** is a *different model* of the same species (young / mature / old oak, hawthorn vs. elder, boulder types). Variants are chosen per instance by `weight` through a stable hash, so a world always gets the same mix. Each variant becomes its own instanced set (`oak#young`, `oak#mature`, ...).
- A **LOD level** is the *same model* at lower detail (`lods`: high / medium / low). Growth stages are never LODs.
- An entry has `enabled: true|false`. `enabled:false` entries are listed in the preview but not applied to the world. `category: "ground"` is preview-only.
- `pivot: "base-center"` puts the base of the model on y = 0 and centres the footprint. `fit: "height"` scales uniformly to `dimensions.height`; an extra `scale` multiplies on top.
- If any variant fails, the others still load; if all fail, the procedural model stays.

## In-game preview

World panel > **Asset preview...** (or `index.html?preview=1`). Shows every manifest model at true size with a 1.8 m figure and 1 m grid, measured size, triangle count, material list, automated checks (base on ground, centred, opaque, normals, height matches manifest, triangle budget) and three lighting presets plus the game's current light. Nothing changes in the world until **Apply approved** is pressed. Rendering is in a separate scene with its own lights.

## Pack: Dense Temperate Forest Flora

Source: 3dassets.dev, author "3D Assets (3dassets)", licence CC0 1.0 Universal (no attribution required; credit kept in the manifest `source` blocks). The models are AI-generated, stylised low-poly, not realistic.


## Automatic LOD (Phase 3)

A variant with a single model file gets generated medium and low levels at load (vertex clustering, `js/lod-gen.js`, ~40 % and ~15 % of the triangles; skipped under 220 triangles; buildings and ground excluded). `"autoLod": false` on an entry or variant turns it off. Report: `assets.report()` lists each level with `url: "auto-lod"`. The generated levels share the original materials and textures (no extra texture memory). Hand-made `lods` in the manifest always win and are never replaced.

## Textures: ambientCG (CC0)

Terrain detail and normal maps are photo-based PBR textures from ambientCG.com,
licence CC0 1.0 Universal (https://docs.ambientcg.com/license/), no attribution required.

- `assets/textures/ground054/` — Ground054 (grassy soil): Color, NormalGL, Roughness. Used for the terrain detail multiplier and the terrain normal map, with a procedural fallback baked at startup and brightness renormalised on swap so overall terrain brightness is unchanged.
- `assets/textures/rock035/` — Rock035 (rock face): Color, NormalGL, Roughness. Reserved for rock/mountain surface work.

Downloaded 2026-11-27, 1K JPG sets. If a file is missing or fails to load, the game
keeps its original procedural textures.

## Models: Poly Haven photoscanned (CC0) — v2 realism pass

Photoscanned hero assets from polyhaven.com, licence CC0 1.0 Universal (https://polyhaven.com/license), no attribution required. Downloaded 2026-11-27 as glTF + 1K JPG PBR textures, welded and decimated with gltf-transform (meshoptimizer) to LOD0 budgets below; the game's automatic LOD pass (js/lod-gen.js) generates the medium/low levels at load.

- `assets/models/vegetation/trees/fir_tree_01.glb` — European fir (https://polyhaven.com/a/fir_tree_01), ~11k tris, manifest target `pine` (variant `fir_real`).
- `assets/models/vegetation/trees/jacaranda_tree.glb` — flowering jacaranda (https://polyhaven.com/a/jacaranda_tree), ~13k tris, target `oak` (variant `jacaranda_real`).
- `assets/models/vegetation/trees/tree_small_02.glb` — small broadleaf tree (https://polyhaven.com/a/tree_small_02), ~11k tris, target `birch` (variant `broadleaf_real`).
- `assets/models/environment/rocks/rock_07.glb` — scanned rock (https://polyhaven.com/a/rock_07), ~5k tris, target `rock` (variant `rock_real_a`).
- `assets/models/environment/rocks/stone_01.glb` — scanned stone (https://polyhaven.com/a/stone_01), ~3.3k tris, target `rock` (variant `rock_real_b`).
- `assets/models/environment/street_rat.glb` — scanned rat (https://polyhaven.com/a/street_rat), ~4.5k tris, reserved for ambient wildlife.

`pine_tree_01` (https://polyhaven.com/a/pine_tree_01) was evaluated and dropped: its source geometry (949 MB bin) exceeds this build machine's memory; `fir_tree_01` covers the conifer slot. `boulder_01` was dropped: meshoptimizer could not simplify its proxy mesh below ~54k tris without visible damage; `rock_07` + `stone_01` cover the slot.
