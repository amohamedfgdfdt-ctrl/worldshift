# Asset audit and what still needs external / AI creation

## Current state
All 3D content is still procedural (merged vertex-coloured meshes). The GLB pipeline is ready and tested; see `ASSETS.md` for the manifest format, material/LOD/compression rules. Add a file under `assets/models/`, list it in `assets/manifest.json`, done. LOD files: one GLB each for high / medium / low (suggested triangle budgets below).

## Recommended replacements (none required for the game to run)
| Name | Type | Use | Format | Detail (tris) | Size (m) | Procedural / external |
|---|---|---|---|---|---|---|
| house_small | building | residential | GLB, PBR 1024² | 1.5–3k (+LOD ≤400) | 6×6×6 | external |
| house_medium | building | residential | GLB, PBR 1024² | 3–5k (+LOD ≤600) | 9×6×8 | external |
| factory_small | building | industry (chimney at +7 m, smoke emitter) | GLB, PBR 2048² | 4–8k | 12×9×8 | external |
| farm | building | barn + fields | GLB, PBR 1024² | 3–6k | 12×12×7 | external |
| water_tank | building | storage | GLB, PBR 512² | 1–2k | 6×6×8 | procedural is fine |
| oak / birch / pine | vegetation | forests | GLB + alpha leaf cards, 3 LODs | 1.5k / 400 / 80 | 8–12 tall | external (best visual gain) |
| shrub, fern, reed clump | vegetation | undergrowth | GLB cards | 100–300 | 1–2 | external |
| rock set (5 variants) | terrain prop | cliffs | GLB, PBR 1024² | 300–800 | 1–5 | external |
| terrain PBR layers | textures | grass, rock, sand, snow, mud | 1024² tileable albedo+normal+roughness+AO | – | 4 m tile | external (terrain currently uses vertex colours + procedural detail) |
| road set | textures/meshes | junctions, bends | GLB or tiling texture | 200 | 3×3 | external |
| sky HDRI / cloud sprites | environment | cinematic sky | 1k–2k HDR / PNG | – | – | external (sky and clouds are procedural now) |

- Flora pack: add real medium/low LOD levels for trees, bushes and ferns (the pack has one level each).
- Flora pack: a terrain-conforming ground-cover system for forest_floor / moss_carpet (currently preview-only).
- Test on real GPUs and phones; Meshopt and KTX2 are initialised but untested on real compressed files.
