// Shared constants for the whole game. Keep this file free of imports so that
// every module (and the Node based tests) can use it.

export const CELL = 3;                 // world units (metres) per grid cell
export const N = 128;                  // cells per side
export const VERTS = N + 1;            // grid nodes per side
export const SIZE = CELL * N;          // world edge length (384 m)
export const HALF = SIZE / 2;
export const DEFAULT_SEED = 7;

export const SAVE_KEY = 'worldshift.terra.save.v1';
export const SAVE_VERSION = 1;

// Simulation
export const GRAVITY = 9.81;
export const STEPS_PER_SEC = 60;       // water steps per real second at x1
export const WATER_DT = 0.08;          // seconds of simulated water time per step
export const MAX_STEPS_PER_FRAME = 8;
export const GAME_MIN_PER_SEC = 2;     // in-game minutes per real second at x1
export const START_MINUTES = 9 * 60;

export const isTouchDevice =
  typeof window !== 'undefined' &&
  ('ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0);

export const vIndex = (i, j) => j * VERTS + i;
export const toGrid = (x) => (x + HALF) / CELL;
export const toWorld = (i) => i * CELL - HALF;
