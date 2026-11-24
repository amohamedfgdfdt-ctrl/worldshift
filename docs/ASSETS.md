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
