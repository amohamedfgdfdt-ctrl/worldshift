# Graphics settings guide

Every setting below is read by a real rendering system (nothing is a UI-only toggle). Settings a device cannot support are disabled in the UI with the reason; they are never shown as working.

| Setting | Values | What it really does |
|---|---|---|
| Frame rate limit | 30/45/60/90/120 | Skips animation frames in the main loop. A *target*: the display refresh rate is the ceiling (90/120 are offered only if the measured refresh supports them; 45 on a 60 Hz screen cannot be perfectly even). |
| Render resolution scale | 50–125 % | Canvas pixel ratio = min(DPR, 2) × scale × dynamic scale. |
| Draw distance | 40–100 % | Fog density, GPU culling distance of trees/grass/reeds, and the tree LOD switch distance. |
| Shadow resolution | Off/512/1024/2048/4096 | Sun shadow-map size (Off disables shadow casting). Capped by `MAX_TEXTURE_SIZE`. |
| Shadow quality | Hard/Soft/Softest | `BasicShadowMap` / `PCFShadowMap` / `PCFSoftShadowMap` + filter radius. |
| Ambient occlusion | Off/Medium/High | GTAO pass (8 or 16 samples). Sky, water, grass and particles are excluded from its depth pass. Needs float render targets. |
| Volumetric effects | Off / Height fog + sun scatter / + Light shafts | Replaces three.js fog chunks (height-dependent density, sun in-scatter); level 2 adds a screen-space radial light-shaft pass. Not true volumetrics. |
| Anti-aliasing | Off/FXAA/SMAA/MSAA 4× | MSAA = multisampled HDR render target (needs 4 samples). Off + no post = direct render to canvas. |
| Post-processing | Off / Bloom + grade | Bloom, mild saturation/contrast, vignette. |
| Texture quality | Low/Med/High | Anisotropic filtering 1×/4×/16× (clamped to the device), also applied to GLB material maps. |
| Terrain detail | Basic/Detailed/Rich | Detail-texture layers in the terrain shader (0/1/2 + fine layer) and normal-map strength. The terrain mesh grid is fixed so buildings and water stay exactly aligned. |
| Vegetation density | 10–100 % | Fraction of every vegetation instance set that is drawn. |
| Foliage quality | Static/Wind/Wind + shadows | Wind sway on/off, tree shadows on/off, tree LOD distance (70/110/150 m × draw distance). |
| Particle density | 0–100 % | Factory smoke pool size and emission, ambient motes/fireflies count. |
| Water quality | Low/Med/High/Ultra | 0 flat colour; 1 ripple normals; 2 wave sum with vertex displacement, depth colouring, decaying foam; 3 adds caustics on the lake/river bed. Visual only. |
| Reflection quality | Sky / +sun glint / Planar half / Planar high | 2-3 re-render the scene mirrored about the lake plane into a render target (grass, bushes, rocks, particles skipped). River water uses sky reflection. |

**Presets** set all keys at once; editing any key switches to *Custom*. **Auto Detect** reads WebGL capabilities, screen size/DPR and measures render throughput (K renders per animation frame at Medium) to pick a preset. It never uses the device name; the GPU renderer string is read only to detect software rendering (then Low is chosen). **Auto Graphics Mode** steps resolution down first (to 50 %), then the preset down one tier, and restores resolution/preset after sustained headroom; it never exceeds the preset you started from.

**Live preview / Apply / Cancel:** changes preview instantly; *Apply Settings* stores them in LocalStorage (`worldshift.terra.graphics.v1`); *Cancel* reverts. Old saves are unaffected (graphics settings are stored separately).
