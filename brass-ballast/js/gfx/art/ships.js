// STUB (WP4 replaces) — player hulls, propellers, turrets.
import { Sprites } from '../sprites.js';
import { envelope, propeller, cannon } from '../drawkit.js';

const HULLS = { dauntless: [96, 48], cormorant: [104, 38], bulwark: [116, 66], tinker: [86, 64], bane: [112, 52] };
for (const [id, [w, h]] of Object.entries(HULLS)) {
  Sprites.register(`hull_${id}`, { w, h, draw: (ctx) => envelope(ctx, w / 2, h / 2, w - 4, h - 8) });
}
Sprites.register('prop', { w: 20, h: 20, frames: 4, draw: (ctx, w, h, f) => propeller(ctx, 10, 10, 9, 3, f * 0.5) });
for (const id of ['brassCannon', 'gatling', 'blunderbuss', 'mortar', 'aetherLance', 'harpoon']) {
  Sprites.register(`turret_${id}`, { w: 44, h: 22, cx: 12, cy: 11, draw: (ctx) => cannon(ctx, 4, 11, 36, 10, 'brass') });
}
