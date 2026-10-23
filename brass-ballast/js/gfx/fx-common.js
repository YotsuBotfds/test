// Shared constants & settings helpers for the particle/FX modules (WP3).

import { Save } from '../core/storage.js';

/** Particle flag bits (also used by fx.js). */
export const PF = {
  ADD: 1,
  TINT: 2,
  ALIGN: 4,
  STRETCH: 8,
  FADEIN: 16,
  LATE: 32,
  FLICKER: 64,
  WIND: 128,
  SHRINK: 256, // size eases toward size1 late (sparks that "burn out")
};

export const LAYER = { low: 0, normal: 1, add: 2 };
export const LAYER_IDX = (name) => (name === 'low' ? 0 : name === 'add' ? 2 : 1);

/** Is the user's quality setting 'low'? Read live so the settings screen applies instantly. */
export function lowQuality() {
  try {
    return Save.settings?.quality === 'low';
  } catch {
    return false;
  }
}

/** Multiplier for flash/flare brightness (reduced-flashing accessibility setting). */
export function flashScale() {
  try {
    return Save.settings?.flashes === false ? 0.3 : 1;
  } catch {
    return 1;
  }
}
