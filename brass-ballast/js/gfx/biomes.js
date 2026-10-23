// Biome palettes & atmosphere settings (DESIGN §2.12, §4.16). Pure data: the ground painters
// (bg-<biome>.js), Background and Weather all read from here, and other modules may borrow
// colors (hudTint for HUD accents, fogColor/ambient for lighting, accent for banners).

/**
 * @typedef {object} Biome
 * @property {string} id
 * @property {string} name
 * @property {[string, string]} sky       haze gradient top/bottom (the "air" between you & ground)
 * @property {string} ground              fallback ground color while tiles are generating
 * @property {string} fogColor            atmospheric haze color laid over the ground
 * @property {number} haze                haze strength 0..1 over the ground
 * @property {string} ambient             overall light color (others may tint with it)
 * @property {string} light               key light (top-left) color
 * @property {string} shadow              shadow color
 * @property {string} hudTint             accent color suitable for HUD trims on this biome
 * @property {string} accent              saturated signature color (banners, transitions)
 * @property {string} dark                darkest tone (letterbox / fallback)
 * @property {{hi:string, mid:string, lo:string}} cloud  cumulus tints
 * @property {{low:number, high:number, lowAlpha:number, highAlpha:number, shadow:number,
 *            drift:number, isles?:number}} clouds  coverage (0..1), opacity, drift speed (u/s),
 *            and the chance of a floating island per low-layer cell
 * @property {[string, number]} vignette  edge darkening color & strength
 * @property {{color:string, alpha:number, x:number, y:number}|null} sun  warm glow source
 * @property {'gulls'|'soot'|'storm'|'snow'|'embers'} weather
 * @property {string} music
 * @property {number} seed                noise seed for this biome's ground
 * @property {string} [enemyShotTint]     replaces the default orange enemy-shot glow where the
 *                                        ground itself is orange/red (Furnace lava)
 */

/** @type {Record<string, Biome>} */
export const BIOMES = {
  brassbay: {
    id: 'brassbay',
    name: 'Brassbay Skies',
    sky: ['#ffd9a8', '#f0a878'],
    ground: '#8a9a5c',
    fogColor: '#f6cfa2',
    haze: 0.2,
    ambient: '#ffe2b8',
    light: '#fff1cf',
    shadow: '#4a2f1d',
    hudTint: '#f2d48a',
    accent: '#ffb35c',
    dark: '#2b1d10',
    cloud: { hi: '#fffaf0', mid: '#fbe3c8', lo: '#d9a491' },
    clouds: { low: 0.42, high: 0.22, lowAlpha: 0.92, highAlpha: 0.5, shadow: 0.16, drift: 9 },
    vignette: ['#4a2412', 0.3],
    sun: { color: '#ffd59a', alpha: 0.2, x: 0.08, y: 0.0 },
    weather: 'gulls',
    music: 'brassbay',
    seed: 1301,
  },
  smog: {
    id: 'smog',
    name: 'The Smog Wastes',
    sky: ['#c9b47a', '#7f704a'],
    ground: '#5a5444',
    fogColor: '#b9a46a',
    haze: 0.3,
    ambient: '#d8c48a',
    light: '#efe0a8',
    shadow: '#231d12',
    hudTint: '#d9c27a',
    accent: '#c8a548',
    dark: '#1f1a10',
    cloud: { hi: '#d6c89e', mid: '#9d9070', lo: '#585038' },
    clouds: { low: 0.62, high: 0.28, lowAlpha: 0.8, highAlpha: 0.45, shadow: 0.2, drift: 6 },
    vignette: ['#1c160a', 0.42],
    sun: { color: '#e8d27a', alpha: 0.16, x: 0.15, y: 0.0 },
    weather: 'soot',
    music: 'smog',
    seed: 2711,
  },
  tempest: {
    id: 'tempest',
    name: 'Tempest Reach',
    sky: ['#6a7d92', '#2f3d4f'],
    ground: '#26394a',
    fogColor: '#5d7086',
    haze: 0.24,
    ambient: '#9fb4cc',
    light: '#d4e2f2',
    shadow: '#0c1219',
    hudTint: '#9fd0ff',
    accent: '#7fb4ff',
    dark: '#0f161e',
    cloud: { hi: '#b3c0cf', mid: '#6a7a8d', lo: '#2b3644' },
    clouds: { low: 0.72, high: 0.32, lowAlpha: 0.85, highAlpha: 0.45, shadow: 0.24, drift: 22 },
    vignette: ['#070b12', 0.48],
    sun: null,
    weather: 'storm',
    music: 'tempest',
    seed: 4111,
  },
  aurora: {
    id: 'aurora',
    name: 'The Aurora Drift',
    sky: ['#2a2f72', '#120f3a'],
    ground: '#6e7fb0',
    fogColor: '#3a3f8a',
    haze: 0.22,
    ambient: '#a9b8ff',
    light: '#dfe8ff',
    shadow: '#0a0b24',
    hudTint: '#b8c8ff',
    accent: '#6fffc4',
    dark: '#0b0a22',
    cloud: { hi: '#c8d2f4', mid: '#7a84c0', lo: '#2c2f6a' },
    clouds: {
      low: 0.32,
      high: 0.2,
      lowAlpha: 0.75,
      highAlpha: 0.42,
      shadow: 0.22,
      drift: 7,
      isles: 0.2,
    },
    vignette: ['#05061a', 0.5],
    sun: { color: '#8fffd0', alpha: 0.1, x: 0.5, y: 0.0 },
    weather: 'snow',
    music: 'aurora',
    seed: 5303,
  },
  furnace: {
    id: 'furnace',
    name: 'The Furnace Crown',
    sky: ['#b8432a', '#4a120c'],
    ground: '#2a1510',
    fogColor: '#8a2a18',
    haze: 0.2,
    ambient: '#ff9a5c',
    light: '#ffc28a',
    shadow: '#120504',
    hudTint: '#ffb070',
    accent: '#ff6a2a',
    dark: '#1a0604',
    cloud: { hi: '#a0705c', mid: '#4e2a22', lo: '#c2481e' },
    clouds: { low: 0.5, high: 0.24, lowAlpha: 0.78, highAlpha: 0.4, shadow: 0.26, drift: 12 },
    vignette: ['#1a0300', 0.5],
    sun: { color: '#ff7a3a', alpha: 0.14, x: 0.9, y: 1.0 },
    weather: 'embers',
    music: 'furnace',
    seed: 7919,
    enemyShotTint: '#ff3d8b',
  },
};

/** Canonical biome order (stage order). */
export const BIOME_ORDER = ['brassbay', 'smog', 'tempest', 'aurora', 'furnace'];

/**
 * Normalize any id (including 'title', undefined, or unknown) to a real biome id.
 * @param {string} [id]
 * @returns {string}
 */
export function biomeId(id) {
  return id && BIOMES[id] ? id : 'brassbay';
}

/**
 * Look up a biome; unknown ids fall back to Brassbay.
 * @param {string} [id]
 * @returns {Biome}
 */
export function getBiome(id) {
  return BIOMES[biomeId(id)];
}
