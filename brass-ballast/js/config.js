// Global constants shared by every module. See docs/DESIGN.md §4–§5.

export const GAME_TITLE = 'Brass & Ballast';
export const VERSION = '1.0.0';

/** Reference viewport used for area-preserving camera zoom. */
export const REF_W = 1280;
export const REF_H = 720;

/** Largest simulation step (seconds); longer frames are clamped. */
export const MAX_DT = 1 / 30;

/** Offscreen sprite resolution multiplier (pixels per world unit). */
export const SPRITE_SCALE = 2;

/** Shadow offset per unit of entity altitude (light from the top-left). */
export const SHADOW_OFFSET = { x: 26, y: 34 };

export const STORAGE_KEY = 'brass-ballast.v1';

export const FONT_DISPLAY =
  '"Copperplate", "Copperplate Gothic Bold", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif';
export const FONT_BODY = '"Palatino Linotype", "Book Antiqua", Palatino, "URW Palladio L", Georgia, serif';
export const FONT_MONO = '"Courier New", Courier, ui-monospace, monospace';

/** Shared palette (DESIGN §5). */
export const PAL = {
  brass: ['#f2d48a', '#c9973f', '#7a5420', '#4a3112'],
  copper: ['#e39a62', '#b4643c', '#6e3a1f'],
  iron: ['#9aa3ad', '#5b626b', '#353a41', '#1f2328'],
  wood: ['#a0703e', '#6e4723', '#3f2812'],
  canvas: ['#f3e8c9', '#d8c69c', '#9e8a5e'],
  oxblood: '#8c2f2b',
  navy: '#2e4a6b',
  aether: ['#7ff3ff', '#33c9c0'],
  syndicate: ['#4b4f58', '#2a2c31', '#c0392b', '#ff7a2f'],
  steam: '#f4f1ea',
  enemyFire: ['#ff4d2e', '#ffd2a0', '#ff3d8b'],
  playerFire: ['#ffd36b', '#fff3c4'],
  ink: '#1a120a',
  parchment: ['#f1e3c0', '#d9c49a', '#2b1d10'],
  gold: '#ffcf4a',
  hp: '#d8452f',
  steamGauge: '#9fe6ff',
  xp: '#4fe3d0',
};

export const RARITY = {
  common: { name: 'Common', color: '#c9973f', glow: '#f2d48a', weight: 60 },
  rare: { name: 'Rare', color: '#33c9c0', glow: '#7ff3ff', weight: 30 },
  epic: { name: 'Epic', color: '#b05bd6', glow: '#e3a8ff', weight: 9 },
  legendary: { name: 'Legendary', color: '#ff9b2f', glow: '#ffe08a', weight: 100 },
};

/** Parse URL flags once (DESIGN §10). */
export const FLAGS = (() => {
  const out = {};
  try {
    const p = new URLSearchParams(location.search);
    for (const [k, v] of p) out[k] = v === '' ? '1' : v;
  } catch {
    /* non-browser */
  }
  return out;
})();

export const flag = (name) => FLAGS[name] !== undefined && FLAGS[name] !== '0';
