// Primary cannons (WP17, DESIGN §2.6 / §12). Six turret guns, each calibrated L1..8 by
// "Calibrate" cards. Contract per def:
//   {id, name, desc, icon, turret, sfx, maxLevel: 8, unlock: {cogs}|null, levelDesc(level),
//    base(level) -> {damage, rate, speed, count, spread, …}, update(player, wpn, dt, world, input)}
// `input = {firing, angle}`. Weapons own their cooldown (wpn.cd), spin-up/heat (wpn.data),
// recoil (wpn.kick 0..1, read by the turret renderer), muzzle fx and sfx, and call world.fire.
// Engine applies crit, stats.burnChance and stats.explosive on hit (docs/ENGINE.md §2);
// weapons apply damage, fireRate, projSpeed, projCount, spread, pierce, bounce, area.
//
// Implementation is split by family:
//   primary-common.js   level tables, stat context, cooldown, muzzle geometry, casings
//   primary-guns.js     brassCannon, gatling, blunderbuss
//   primary-special.js  mortar, aetherLance, harpoon

import { brassCannon, gatling, blunderbuss } from './primary-guns.js';
import { mortar, aetherLance, harpoon } from './primary-special.js';

/** @type {Record<string, object>} */
export const PRIMARIES = { brassCannon, gatling, blunderbuss, mortar, aetherLance, harpoon };

/** Display / unlock order (hangar, codex). */
export const PRIMARY_ORDER = ['brassCannon', 'gatling', 'blunderbuss', 'mortar', 'aetherLance', 'harpoon'];
