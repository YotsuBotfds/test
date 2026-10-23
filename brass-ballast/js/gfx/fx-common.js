// Shared constants & settings helpers for the particle/FX modules (WP3).

import { Save } from '../core/storage.js';
import { Quality } from './quality.js';

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

/** Is the effective quality tier 'low' (setting or auto governor)? Read live. */
export function lowQuality() {
  return Quality.tier === 0;
}

/** FX spawn-count multiplier for the effective quality tier (1 high … 0.45 low). */
export function particleScale() {
  return Quality.cfg.particles;
}

/** Multiplier for flash/flare brightness (reduced-flashing accessibility setting). */
export function flashScale() {
  try {
    return Save.settings?.flashes === false ? 0.3 : 1;
  } catch {
    return 1;
  }
}
