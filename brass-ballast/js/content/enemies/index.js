// Enemy registry (WP0 aggregator — do not edit). Defs: docs/DESIGN.md §4.4.
import { SKIRMISHERS } from './skirmishers.js';
import { WARSHIPS } from './warships.js';

/** @type {Record<string, any>} */
export const ENEMIES = { ...SKIRMISHERS, ...WARSHIPS };

/** Canonical order (codex / debug). */
export const ENEMY_ORDER = [
  'gyroScout', 'kiteBomber', 'balloonMine', 'gunboat', 'clockWasp', 'flakIsland',
  'carrier', 'teslaBuoy', 'frigate', 'ornithopter', 'steamWraith', 'mortarBarge',
].filter((id) => ENEMIES[id]);
