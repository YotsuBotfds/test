// UI icons (WP5, DESIGN §12): 64×64 brass medallions with enamel glyphs, registered as
// `icon_<id>` sprites. Rendered at 3× (192 px) so DOM icons stay crisp up to ~128 px.
//
// Frames by category (rarity is shown by the UI card frame, never by the icon):
//   primaries   navy enamel medallion          icon_<primaryId>
//   auxiliaries verdigris enamel medallion     icon_<auxId>
//   evolutions  black enamel, gold rim, aether halo + glyph glow   icon_<evolutionId>
//   passives    warm parchment medallion       icon_<passiveId>
//   workshop    riveted wood plaque in brass   icon_ws_<workshopId>
//   modes       cog-toothed emblem             icon_mode_<modeId>
//   generic     free-standing inked object     icon_cog, icon_xp, …
//
// Glyph painters live in icons-arms.js / icons-passives.js / icons-misc.js; the shared paint kit
// in icons-kit.js and the frames in icons-frames.js.

import { Sprites } from '../sprites.js';
import { medallion, plaque, emblem, bare } from './icons-frames.js';
import { PRIMARY_GLYPHS, AUX_GLYPHS, EVOLUTION_GLYPHS } from './icons-arms.js';
import { PASSIVE_GLYPHS } from './icons-passives.js';
import { WORKSHOP_GLYPHS, MODE_GLYPHS, GENERIC_GLYPHS } from './icons-misc.js';

/** Pixels per icon unit: 64 u → 192 px source (UI shows icons at 32–128 px). */
export const ICON_SCALE = 3;
export const ICON_SIZE = 64;

function reg(name, draw) {
  Sprites.register(name, { w: ICON_SIZE, h: ICON_SIZE, scale: ICON_SCALE, draw });
}

/** Category of every registered icon id → used by previews and the UI if it wants it. */
export const ICON_CATEGORIES = {};

function regSet(glyphs, cat, prefix, frame) {
  for (const [id, glyph] of Object.entries(glyphs)) {
    const name = `${prefix}${id}`;
    ICON_CATEGORIES[name] = cat;
    reg(name, (ctx) => frame(ctx, glyph));
  }
}

regSet(PRIMARY_GLYPHS, 'primary', 'icon_', (ctx, g) => medallion(ctx, 'primary', g));
regSet(AUX_GLYPHS, 'aux', 'icon_', (ctx, g) => medallion(ctx, 'aux', g));
regSet(EVOLUTION_GLYPHS, 'evolution', 'icon_', (ctx, g) => medallion(ctx, 'evolution', g));
regSet(PASSIVE_GLYPHS, 'passive', 'icon_', (ctx, g) => medallion(ctx, 'passive', g));
regSet(WORKSHOP_GLYPHS, 'workshop', 'icon_ws_', plaque);
for (const [id, m] of Object.entries(MODE_GLYPHS)) {
  const name = `icon_mode_${id}`;
  ICON_CATEGORIES[name] = 'mode';
  reg(name, (ctx) => emblem(ctx, m.field, m.glyph));
}
regSet(GENERIC_GLYPHS, 'generic', 'icon_', bare);
