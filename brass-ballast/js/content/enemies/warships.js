// WP13 — Enemies: warships of the Iron Syndicate (DESIGN §2.10).
//
//   carrier      Zeppelin Carrier   slow crossing; launches 3 gyroScouts every 4 s from a deck hatch
//   teslaBuoy    Tesla Buoy         linked pairs; a magenta arc between partners hurts (8/tick)
//   frigate      Ironclad Frigate   turns broadside; gunport glow telegraph; 5-ball volleys
//   ornithopter  Ornithopter Ace    strafes mid-range; aimed 4-shot bursts; sidesteps player shots
//   steamWraith  Steam Wraith       2 s phased → materialises near the player → 12-bullet ring
//   mortarBarge  Mortar Barge       keeps far; lobs telegraphed mortar shells at the player
//
// Files: behaviours in warships-hulls.js / warships-craft.js, sprites in warships-art-*.js,
// shared palette & runtime helpers in warships-kit.js. Sprites: 'enemy_<id>' (+ '_<part>').

import { HULL_DEFS } from './warships-hulls.js';
import { CRAFT_DEFS } from './warships-craft.js';

/** @type {Record<string, any>} */
export const WARSHIPS = {
  carrier: HULL_DEFS.carrier,
  teslaBuoy: CRAFT_DEFS.teslaBuoy,
  frigate: HULL_DEFS.frigate,
  ornithopter: CRAFT_DEFS.ornithopter,
  steamWraith: CRAFT_DEFS.steamWraith,
  mortarBarge: HULL_DEFS.mortarBarge,
};
