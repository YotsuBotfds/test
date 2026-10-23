// Boss registry (WP0 aggregator — do not edit). Defs: docs/DESIGN.md §2.11, §4.4.
import ironMatriarch from './ironMatriarch.js';
import kraken from './kraken.js';
import stormEngine from './stormEngine.js';
import behemoth from './behemoth.js';
import sunFurnace from './sunFurnace.js';

/** @type {Record<string, any>} */
export const BOSSES = { ironMatriarch, kraken, stormEngine, behemoth, sunFurnace };
export const BOSS_ORDER = ['ironMatriarch', 'kraken', 'stormEngine', 'behemoth', 'sunFurnace'];
