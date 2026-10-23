// Ground painter registry (WP6): biome id → module exporting `*paint(ctx, X0, Y0, anchors)`.
import * as brassbay from './bg-brassbay.js';
import * as smog from './bg-smog.js';
import * as tempest from './bg-tempest.js';

/** @type {Record<string, {paint: (ctx: CanvasRenderingContext2D, X0: number, Y0: number,
 *   anchors: import('./bg-util.js').Anchors) => Generator}>} */
export const PAINTERS = { brassbay, smog, tempest };
