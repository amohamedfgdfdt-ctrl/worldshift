// Building catalogue: metadata + procedural 3D models (merged, vertex coloured).
// 1 grid cell = CELL (3 m). Models are authored around the footprint centre,
// with y = 0 on the foundation top.
import * as THREE from '../vendor/three.module.min.js';
import { ModelBuilder, hex } from './geometry.js';
import { CELL } from './config.js';

// ---------------------------------------------------------------- models
function houseSmall() {
  const b = new ModelBuilder();
  b.box(5.2, 0.3, 4.8, 0, 0, 0, hex(0x8f8b84));
  b.box(4.6, 2.8, 4.2, 0, 0.3, 0, hex(0xeadfc6), { jitter: 0.04 });
  b.gable(5.7, 1.9, 5.1, 0, 3.1, 0, hex(0xa9462f), { jitter: 0.12 });
  b.box(5.8, 0.14, 5.2, 0, 3.02, 0, hex(0xf2ede2));
  // door + step
  b.box(1.0, 1.95, 0.14, -0.9, 0.3, 2.15, hex(0x5a3a22));
  b.box(1.5, 0.14, 0.55, -0.9, 0.3, 2.4, hex(0xa7a39b));
  // windows (frame + glass)
  b.box(1.15, 1.15, 0.1, 1.15, 1.0, 2.12, hex(0xf6f2ea));
  b.box(0.95, 0.95, 0.12, 1.15, 1.1, 2.14, hex(0x5f86a6));
  for (const z of [-0.9, 0.9]) {
    b.box(0.1, 1.15, 1.15, 2.32, 1.0, z, hex(0xf6f2ea));
    b.box(0.12, 0.95, 0.95, 2.34, 1.1, z, hex(0x5f86a6));
    b.box(0.1, 1.15, 1.15, -2.32, 1.0, z, hex(0xf6f2ea));
    b.box(0.12, 0.95, 0.95, -2.34, 1.1, z, hex(0x5f86a6));
  }
  b.box(0.6, 2.0, 0.6, 1.5, 3.4, -1.0, hex(0x8a4b3a), { jitter: 0.1 });
  b.box(0.75, 0.15, 0.75, 1.5, 5.4, -1.0, hex(0x5d5a56));
  return b.build();
}

function houseMedium() {
  const b = new ModelBuilder();
  b.box(8.4, 0.35, 7.6, 0, 0, 0, hex(0x8f8b84));
  b.box(7.4, 3.0, 6.6, 0, 0.35, 0, hex(0xd8c6a0), { jitter: 0.04 });
  b.box(7.6, 0.22, 6.8, 0, 3.3, 0, hex(0xf4efe4));
  b.box(7.4, 2.6, 6.6, 0, 3.52, 0, hex(0xefe7d7), { jitter: 0.04 });
  b.pyramid(8.8, 2.8, 8.0, 0, 6.12, 0, hex(0x6d3b2b), { jitter: 0.12 });
  b.box(0.8, 2.4, 0.8, 2.3, 6.4, -1.3, hex(0x8a4b3a), { jitter: 0.1 });
  // porch
  b.box(3.8, 0.2, 2.2, -1.5, 3.0, 4.1, hex(0xf2ede2));
  b.box(3.8, 0.16, 2.2, -1.5, 0.35, 4.1, hex(0xa7a39b));
  for (const x of [-3.2, 0.2]) b.cyl(0.14, 0.14, 2.65, x, 0.35, 5.0, hex(0xf6f2ea), { seg: 8 });
  // doors & windows
  b.box(1.5, 2.15, 0.14, -1.5, 0.35, 3.35, hex(0x4a3020));
  for (const x of [1.6, 3.0]) {
    b.box(1.1, 1.2, 0.1, x, 1.0, 3.34, hex(0xf6f2ea));
    b.box(0.9, 1.0, 0.12, x, 1.1, 3.36, hex(0x5f86a6));
  }
  for (const x of [-2.6, -0.6, 1.4, 3.0]) {
    b.box(1.1, 1.3, 0.1, x, 3.9, 3.34, hex(0xf6f2ea));
    b.box(0.9, 1.1, 0.12, x, 4.0, 3.36, hex(0x5f86a6));
  }
  for (const z of [-1.6, 0, 1.6]) for (const s of [-1, 1]) {
    b.box(0.1, 1.2, 1.1, 3.72 * s, 1.0, z, hex(0xf6f2ea));
    b.box(0.12, 1.0, 0.9, 3.74 * s, 1.1, z, hex(0x5f86a6));
    b.box(0.1, 1.3, 1.1, 3.72 * s, 3.9, z, hex(0xf6f2ea));
    b.box(0.12, 1.1, 0.9, 3.74 * s, 4.0, z, hex(0x5f86a6));
  }
  return b.build();
}

function factorySmall() {
  const b = new ModelBuilder();
  b.box(11.6, 0.3, 8.8, 0, 0, 0, hex(0x9c9a94));
  b.box(9.2, 0.9, 7.2, -0.6, 0.3, -0.2, hex(0x7f7b72));
  b.box(9.0, 4.6, 7.0, -0.6, 1.2, -0.2, hex(0xbdb8ac), { jitter: 0.06 });
  b.box(9.3, 0.2, 7.3, -0.6, 5.8, -0.2, hex(0x6b6f74));
  // sawtooth roof
  for (let i = 0; i < 3; i++) {
    const x = -0.6 - 3.0 + i * 3.0;
    b.wedge(3.0, 1.5, 7.2, x, 6.0, -0.2, hex(0x6f747a));
    b.box(0.08, 1.15, 6.6, x + 1.52, 6.15, -0.2, hex(0x7fa6bf));
  }
  // loading door + side door + windows
  b.box(3.6, 3.5, 0.16, -2.4, 0.3, 3.38, hex(0xe4e2dc));
  b.box(3.2, 3.2, 0.18, -2.4, 0.3, 3.4, hex(0x3d6a8a));
  b.box(1.1, 2.2, 0.16, 1.9, 0.3, 3.38, hex(0x2f3035));
  for (let i = 0; i < 4; i++) b.box(1.2, 0.8, 0.12, 0.8 + i * 1.7 - 2.2 + 3.4, 3.7, 3.35, hex(0x6f93ad));
  // chimneys
  b.cyl(0.62, 0.78, 10.2, -4.1, 0.3, -2.6, hex(0xa65b45), { seg: 12, jitter: 0.1 });
  b.cyl(0.7, 0.64, 0.7, -4.1, 9.8, -2.6, hex(0x2f2c2a), { seg: 12 });
  b.cyl(0.5, 0.62, 7.4, -2.7, 0.3, -2.8, hex(0xa65b45), { seg: 12, jitter: 0.1 });
  b.cyl(0.56, 0.52, 0.6, -2.7, 7.1, -2.8, hex(0x2f2c2a), { seg: 12 });
  // silo + pipes
  b.cyl(1.0, 1.0, 5.6, 4.9, 0.3, -2.0, hex(0xa9b4bd), { seg: 14 });
  b.cone(1.08, 0.8, 4.9, 5.9, -2.0, hex(0x7c8790), { seg: 14 });
  b.cyl(0.14, 0.14, 4.0, 4.0, 2.0, -2.0, hex(0x6b6f74), { seg: 8, rz: Math.PI / 2 });
  b.box(1.6, 1.2, 1.4, 4.9, 0.3, 1.6, hex(0x555a60));
  return b.build();
}

function waterTank() {
  const b = new ModelBuilder();
  b.cyl(2.5, 2.6, 0.4, 0, 0, 0, hex(0x9c9a94), { seg: 20 });
  for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) {
    b.cyl(0.17, 0.2, 4.0, x, 0.4, z, hex(0x6c747c), { seg: 8 });
  }
  for (let i = 0; i < 2; i++) {
    const y = 1.5 + i * 1.6;
    b.box(3.2, 0.08, 0.08, 0, y, -1.5, hex(0x6c747c));
    b.box(3.2, 0.08, 0.08, 0, y, 1.5, hex(0x6c747c));
    b.box(0.08, 0.08, 3.2, -1.5, y, 0, hex(0x6c747c));
    b.box(0.08, 0.08, 3.2, 1.5, y, 0, hex(0x6c747c));
  }
  b.cyl(2.15, 2.15, 2.8, 0, 4.4, 0, hex(0x7aa0bd), { seg: 24 });
  b.cyl(2.22, 2.22, 0.14, 0, 5.3, 0, hex(0x5d7f98), { seg: 24 });
  b.cyl(2.22, 2.22, 0.14, 0, 6.2, 0, hex(0x5d7f98), { seg: 24 });
  b.cone(2.35, 1.0, 0, 7.2, 0, hex(0x4f6a80), { seg: 24 });
  b.cyl(0.14, 0.14, 4.4, 0, 0.4, 2.5, hex(0x6c747c), { seg: 8 }); // inlet pipe
  b.box(0.12, 4.3, 0.5, 2.2, 0.4, 0, hex(0x555a60));              // ladder
  b.box(1.0, 0.7, 0.9, 1.9, 0.4, 1.9, hex(0x3d6a8a));
  return b.build();
}


function solarPlant() {
  const b = new ModelBuilder();
  b.box(9.2, 0.25, 7.6, 0, 0, 0, hex(0x9c9a94));
  for (const z of [-2.2, 0, 2.2]) for (const x of [-2.4, 2.4]) {
    b.box(0.14, 0.9, 0.14, x, 0.25, z, hex(0x6c747c));
    b.box(3.6, 0.1, 1.7, x, 1.1, z, hex(0x23385c));          // panel
    b.box(3.6, 0.04, 0.06, x, 1.2, z - 0.4, hex(0x8fa7d0));
    b.box(3.6, 0.04, 0.06, x, 1.2, z + 0.4, hex(0x8fa7d0));
  }
  b.box(1.4, 1.3, 1.1, 0, 0.25, -3.1, hex(0xd7d4cb));        // inverter hut
  return b.build();
}

function windTurbine() {
  const b = new ModelBuilder();
  b.cyl(1.6, 1.8, 0.4, 0, 0, 0, hex(0x9c9a94), { seg: 14 });
  b.cyl(0.28, 0.5, 8.5, 0, 0.4, 0, hex(0xeceff2), { seg: 12 });
  b.box(0.9, 0.8, 1.7, 0, 8.7, 0, hex(0xdfe3e8));
  b.cyl(0.3, 0.3, 0.4, 0, 8.9, 1.0, hex(0xb8bec6), { seg: 10 });
  for (let i = 0; i < 3; i++) {                              // three blades, fixed pose
    const a = i * Math.PI * 2 / 3 + 0.35;
    b.box(0.22, 4.4, 0.12, Math.sin(a) * 2.2, 8.9 + Math.cos(a) * 2.2 - 2.2, 1.3, hex(0xf4f6f8), { rz: -a });
  }
  return b.build();
}

function farm() {
  const b = new ModelBuilder();
  b.box(11.2, 0.22, 11.2, 0, 0, 0, hex(0x5a4331), { jitter: 0.2 });
  for (let r = 0; r < 8; r++) {
    const z = -4.7 + r * 0.82;
    const green = r < 4;
    b.box(9.6, 0.5, 0.52, 0, 0.2, z, hex(green ? 0x5c9a38 : 0xc9a63c), { jitter: 0.32 });
  }
  for (let r = 0; r < 3; r++) {
    b.box(4.6, 0.36, 0.5, -3.0, 0.2, 2.4 + r * 0.9, hex(0x77a845), { jitter: 0.32 });
  }
  // barn
  b.box(3.8, 2.7, 3.2, 3.3, 0.22, 3.7, hex(0xa23a2f), { jitter: 0.06 });
  b.gable(4.4, 1.6, 3.8, 3.3, 2.92, 3.7, hex(0x4a4540));
  b.box(1.3, 1.9, 0.1, 3.3, 0.22, 5.34, hex(0xf0e6d2));
  b.box(0.12, 1.9, 0.12, 3.3, 0.22, 5.38, hex(0xa23a2f));
  // fence (back, left, right)
  const post = (x, z) => b.cyl(0.07, 0.08, 1.05, x, 0.0, z, hex(0x6d4f33), { seg: 6 });
  for (let i = 0; i <= 6; i++) { const x = -5.4 + i * 1.8; post(x, -5.4); }
  for (let i = 0; i <= 5; i++) { const z = -5.4 + i * 1.8; post(-5.4, z); post(5.4, z); }
  b.box(10.8, 0.07, 0.07, 0, 0.8, -5.4, hex(0x8a6a45));
  b.box(10.8, 0.07, 0.07, 0, 0.45, -5.4, hex(0x8a6a45));
  for (const x of [-5.4, 5.4]) {
    b.box(0.07, 0.07, 9.0, x, 0.8, -0.9, hex(0x8a6a45));
    b.box(0.07, 0.07, 9.0, x, 0.45, -0.9, hex(0x8a6a45));
  }
  // scarecrow
  b.cyl(0.05, 0.05, 1.7, -1.0, 0.2, -2.3, hex(0x6d4f33), { seg: 6 });
  b.box(1.1, 0.07, 0.07, -1.0, 1.4, -2.3, hex(0x6d4f33));
  b.blob(0.16, -1.0, 1.75, -2.3, hex(0xd9b56d), { detail: 0, lump: 0.05 });
  b.cone(0.28, 0.25, -1.0, 1.95, -2.3, hex(0x6b4a2a), { seg: 8 });
  return b.build();
}

export function buildOak() {
  const b = new ModelBuilder();
  b.cyl(0.26, 0.42, 2.5, 0, 0, 0, hex(0x5b4030), { seg: 7, jitter: 0.12 });
  b.blob(1.9, 0, 3.7, 0, hex(0x3f7a2a), { lump: 0.18, jitter: 0.3 });
  b.blob(1.45, 1.1, 2.95, 0.5, hex(0x4b8b31), { lump: 0.2, jitter: 0.3 });
  b.blob(1.4, -1.0, 3.1, -0.5, hex(0x357025), { lump: 0.2, jitter: 0.3 });
  b.blob(1.25, 0.1, 4.8, 0.1, hex(0x59983b), { lump: 0.2, jitter: 0.3 });
  return b.build();
}

export function buildPine() {
  const b = new ModelBuilder();
  b.cyl(0.22, 0.34, 1.6, 0, 0, 0, hex(0x4e3828), { seg: 6 });
  b.cone(2.2, 2.8, 0, 1.0, 0, hex(0x2b5a2e), { seg: 9, jitter: 0.25 });
  b.cone(1.8, 2.6, 0, 2.6, 0, hex(0x2f6431), { seg: 9, jitter: 0.25 });
  b.cone(1.35, 2.4, 0, 4.2, 0, hex(0x33693a), { seg: 9, jitter: 0.25 });
  b.cone(0.9, 2.2, 0, 5.7, 0, hex(0x38703f), { seg: 9, jitter: 0.25 });
  return b.build();
}

export function buildBirch() {
  const b = new ModelBuilder();
  b.cyl(0.14, 0.24, 3.6, 0, 0, 0, hex(0xd9d4c8), { seg: 6, jitter: 0.06 });
  b.blob(1.25, 0.1, 4.3, 0, hex(0x7fae48), { lump: 0.2, jitter: 0.3 });
  b.blob(0.95, 0.7, 3.5, 0.3, hex(0x93bd54), { lump: 0.2, jitter: 0.3 });
  b.blob(0.9, -0.6, 3.3, -0.3, hex(0x6e9e3c), { lump: 0.2, jitter: 0.3 });
  b.blob(0.8, 0, 5.2, 0.1, hex(0x9bc45a), { lump: 0.2, jitter: 0.3 });
  return b.build();
}

// far-distance LODs: a handful of triangles each
export function buildOakLow() {
  const b = new ModelBuilder();
  b.cyl(0.3, 0.4, 2.4, 0, 0, 0, hex(0x5b4030), { seg: 4 });
  b.blob(2.1, 0, 3.8, 0, hex(0x44802c), { lump: 0.1, jitter: 0.2, detail: 0 });
  return b.build();
}
export function buildPineLow() {
  const b = new ModelBuilder();
  b.cyl(0.25, 0.32, 1.4, 0, 0, 0, hex(0x4e3828), { seg: 4 });
  b.cone(2.0, 6.2, 0, 1.2, 0, hex(0x2f6431), { seg: 5, jitter: 0.1 });
  return b.build();
}
export function buildBirchLow() {
  const b = new ModelBuilder();
  b.cyl(0.18, 0.22, 3.2, 0, 0, 0, hex(0xd9d4c8), { seg: 4 });
  b.blob(1.4, 0.1, 4.2, 0, hex(0x86b34c), { lump: 0.1, jitter: 0.2, detail: 0 });
  return b.build();
}
export function buildReed() {
  const b = new ModelBuilder();
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26, r = 0.18;
    b.cone(0.07, 1.5 + (i % 3) * 0.3, Math.cos(a) * r, 0, Math.sin(a) * r, hex(i % 2 ? 0x7a8d3b : 0x8a9a45), { seg: 3 });
  }
  b.cyl(0.05, 0.05, 0.5, 0.05, 1.2, 0.02, hex(0x6b4a2e), { seg: 4 });
  return b.build();
}

export function buildBush() {
  const b = new ModelBuilder();
  b.blob(0.85, 0, 0.45, 0, hex(0x3f7a2a), { lump: 0.22, jitter: 0.3, sy: 0.8 });
  b.blob(0.65, 0.7, 0.35, 0.3, hex(0x4b8b31), { lump: 0.22, jitter: 0.3, sy: 0.8 });
  b.blob(0.6, -0.6, 0.3, -0.3, hex(0x356b25), { lump: 0.22, jitter: 0.3, sy: 0.8 });
  return b.build();
}

export function buildRock() {
  const b = new ModelBuilder();
  b.blob(1.1, 0, 0.35, 0, hex(0x77746f), { lump: 0.3, jitter: 0.35, sy: 0.7, detail: 1 });
  b.blob(0.6, 0.9, 0.2, 0.4, hex(0x6c6964), { lump: 0.3, jitter: 0.35, sy: 0.7, detail: 1 });
  return b.build();
}

export function buildSourceMarker() {
  const b = new ModelBuilder();
  b.cyl(1.0, 1.1, 0.35, 0, 0, 0, hex(0x4a5058), { seg: 16 });
  b.cyl(0.32, 0.36, 1.5, 0, 0.35, 0, hex(0x7d8a96), { seg: 12 });
  b.cyl(0.26, 0.26, 1.1, 0.55, 1.5, 0, hex(0x7d8a96), { seg: 10, rz: Math.PI / 2 });
  b.cyl(0.4, 0.4, 0.16, 0, 1.85, 0, hex(0x3ea2ff), { seg: 12 });
  b.cyl(0.22, 0.22, 0.5, 1.15, 0.95, 0, hex(0x7d8a96), { seg: 10 });
  b.cyl(1.35, 1.35, 0.06, 0, 0.0, 0, hex(0x36a8ff), { seg: 24 });
  return b.build();
}

export function buildFoundation() {
  const b = new ModelBuilder();
  b.box(1, 1, 1, 0, 0, 0, [1, 1, 1]);
  return b.build();
}

// ---------------------------------------------------------------- registry
export const CATEGORIES = [
  { id: 'buildings', label: 'Buildings', icon: 'house' },
  { id: 'nature', label: 'Nature', icon: 'tree' },
  { id: 'infrastructure', label: 'Infrastructure', icon: 'road' },
  { id: 'water', label: 'Water Tools', icon: 'drop' },
  { id: 'world', label: 'World Settings', icon: 'globe' },
];

export const TYPES = {
  house_small: {
    key: 'house_small', name: 'Small House', category: 'buildings', icon: 'house', w: 2, d: 2,
    desc: 'A cosy home for a small family.', capacity: 4, maxDiff: 1.8, build: houseSmall, tint: 'warm', cap: 300, kind: 'house',
  },
  house_medium: {
    key: 'house_medium', name: 'Medium House', category: 'buildings', icon: 'house2', w: 3, d: 3,
    desc: 'Two floors, room for a larger family.', capacity: 8, maxDiff: 2.2, build: houseMedium, tint: 'warm', cap: 200, kind: 'house',
  },
  factory_small: {
    key: 'factory_small', name: 'Small Factory', category: 'buildings', icon: 'factory', w: 4, d: 3,
    desc: 'Light industry. Provides jobs (used by the economy in later phases).', jobs: 12, maxDiff: 1.6, build: factorySmall, tint: 'neutral', cap: 100, kind: 'factory',
  },
  tree: {
    key: 'tree', name: 'Tree', category: 'nature', icon: 'tree', w: 1, d: 1,
    desc: 'Plant a tree. It sways in the wind.', maxDiff: 4, build: buildOak, tint: 'green', cap: 1500, kind: 'tree', foundation: false, solid: false,
  },
  farm: {
    key: 'farm', name: 'Farm', category: 'nature', icon: 'wheat', w: 4, d: 4,
    desc: 'Crops and a barn. Does best close to water.', maxDiff: 1.4, build: farm, tint: 'neutral', cap: 60, kind: 'farm',
  },
  water_tank: {
    key: 'water_tank', name: 'Water Tank', category: 'infrastructure', icon: 'tank', w: 2, d: 2,
    desc: 'Collects water from the surrounding ground and stores it.', capacity: 30000, maxDiff: 1.6, build: waterTank, tint: 'neutral', cap: 60, kind: 'tank',
  },
  solar_plant: {
    key: 'solar_plant', name: 'Solar Plant', category: 'infrastructure', icon: 'sun', w: 3, d: 3,
    desc: 'Photovoltaic panels. Output follows the sun and is zero at night.', maxDiff: 1.4, build: solarPlant, tint: 'neutral', cap: 60, kind: 'power',
  },
  wind_turbine: {
    key: 'wind_turbine', name: 'Wind Turbine', category: 'infrastructure', icon: 'wind', w: 2, d: 2,
    desc: 'Steady output that grows with the wind setting. Works at night.', maxDiff: 1.6, build: windTurbine, tint: 'neutral', cap: 60, kind: 'power',
  },
  road: {
    key: 'road', name: 'Road', category: 'infrastructure', icon: 'road', w: 1, d: 1,
    desc: 'Click to start, click again to draw a straight road. Esc ends the chain.', special: 'road',
  },
};

export function typesOf(category) {
  return Object.values(TYPES).filter((t) => t.category === category);
}

const _geoCache = new Map();
export function getGeometry(key) {
  if (!_geoCache.has(key)) _geoCache.set(key, TYPES[key].build());
  return _geoCache.get(key);
}

export function footprintSize(t, rot) {
  return rot % 2 === 0 ? { w: t.w, d: t.d } : { w: t.d, d: t.w };
}

/** Per-instance colour tint (multiplies the vertex colours). */
export function tintFor(type, seed) {
  const r = ((Math.sin(seed * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1;
  const r2 = ((Math.sin(seed * 269.5 + 183.3) * 43758.5453) % 1 + 1) % 1;
  const c = new THREE.Color(1, 1, 1);
  if (type.tint === 'warm') {
    const palette = [[1, 1, 1], [1.05, 0.96, 0.88], [0.9, 0.97, 1.05], [1.02, 1.05, 0.9], [0.96, 0.9, 0.9]];
    const p = palette[Math.floor(r * palette.length)];
    const s = 0.94 + r2 * 0.1;
    c.setRGB(p[0] * s, p[1] * s, p[2] * s);
  } else if (type.tint === 'green') {
    const s = 0.85 + r2 * 0.3;
    c.setRGB(s * (0.95 + r * 0.1), s, s * (0.9 + r * 0.1));
  } else {
    const s = 0.95 + r2 * 0.1;
    c.setRGB(s, s, s);
  }
  return c;
}

export const CELLSIZE = CELL;
