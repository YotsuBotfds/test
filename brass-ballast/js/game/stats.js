// Player stat block (DESIGN §4.4 "Stats") and the rebuild pipeline:
//   defaults → hull.base → workshop → passives → aux/primary stat hooks → run hooks → clamps.
// Every stat is either additive (starts at 0) or multiplicative (starts at 1); content code
// mutates the block in its `apply(stats, level)` and never stores derived values elsewhere.

import { Save } from '../core/storage.js';
import { applyWorkshop } from '../content/workshop.js';
import { PASSIVES } from '../content/upgrades.js';
import { AUX, EVOLUTIONS, PRIMARIES } from '../content/weapons/index.js';

/** Default stats. Keep in sync with DESIGN §4.4 and docs/ENGINE.md. */
export const DEFAULT_STATS = Object.freeze({
  maxHp: 100,
  armor: 0,
  speed: 240,
  accel: 1500,
  steamMax: 100,
  steamRegen: 14,
  boostCost: 30,
  bombsMax: 2,
  pickupRadius: 90,
  hpRegen: 0,
  damage: 1,
  fireRate: 1,
  projSpeed: 1,
  projCount: 0,
  spread: 1,
  pierce: 0,
  bounce: 0,
  crit: 0.05,
  critMult: 1.75,
  area: 1,
  duration: 1,
  cooldown: 1,
  knockback: 1,
  luck: 0,
  xpGain: 1,
  cogGain: 1,
  burnChance: 0,
  burnDps: 6,
  explosive: 0,
  shieldInterval: 0,
  vengeance: 0,
  rerolls: 0,
  extraChoices: 0,
  revives: 0,
});

/** Fresh mutable copy of the defaults. */
export function defaultStats() {
  return { ...DEFAULT_STATS };
}

/**
 * Rebuild a player's stats from scratch.
 * @param {import('./player.js').Player} player
 * @param {object} [opts]
 * @param {Record<string, number>} [opts.workshop] workshop levels (default: Save.meta.workshop)
 * @returns {Record<string, number>}
 */
export function computeStats(player, opts = {}) {
  const s = defaultStats();
  const base = player.hull?.base;
  if (base) {
    for (const k in base) {
      if (typeof base[k] === 'number') s[k] = base[k];
    }
  }
  try {
    applyWorkshop(s, opts.workshop ?? Save.meta.workshop ?? {});
  } catch (err) {
    warnOnce('workshop', err);
  }
  for (const id in player.passives) {
    const lv = player.passives[id];
    const def = PASSIVES[id];
    if (!def || !lv) continue;
    try {
      def.apply?.(s, lv, player);
    } catch (err) {
      warnOnce(`passive:${id}`, err);
    }
  }
  // Optional stat hooks on weapons: `stats(stats, level, player)`.
  for (const slot of player.aux) {
    const def = AUX[slot.id] || EVOLUTIONS[slot.id];
    if (def?.stats) {
      try {
        def.stats(s, slot.level, player);
      } catch (err) {
        warnOnce(`auxstats:${slot.id}`, err);
      }
    }
  }
  const pdef = PRIMARIES[player.primary?.id];
  if (pdef?.stats) {
    try {
      pdef.stats(s, player.primary.level, player);
    } catch (err) {
      warnOnce(`primstats:${pdef.id}`, err);
    }
  }
  // Debug / temporary bonuses: {key: add} and {key: mult}.
  if (player.bonusAdd) for (const k in player.bonusAdd) s[k] = (s[k] || 0) + player.bonusAdd[k];
  if (player.bonusMul) for (const k in player.bonusMul) s[k] = (s[k] ?? 1) * player.bonusMul[k];
  player.world?.run?.statHook?.(s, player);
  return clampStats(s);
}

/** Keep stats in sane ranges so content bugs can't break the game. */
export function clampStats(s) {
  s.maxHp = Math.max(1, Math.round(s.maxHp));
  s.armor = Math.max(0, s.armor);
  s.speed = Math.max(60, s.speed);
  s.accel = Math.max(200, s.accel);
  s.steamMax = Math.max(10, s.steamMax);
  s.boostCost = Math.max(1, s.boostCost);
  s.bombsMax = Math.max(0, Math.round(s.bombsMax));
  s.crit = Math.min(1, Math.max(0, s.crit));
  s.critMult = Math.max(1, s.critMult);
  s.cooldown = Math.max(0.2, s.cooldown);
  s.fireRate = Math.max(0.1, s.fireRate);
  s.area = Math.max(0.2, s.area);
  s.projCount = Math.max(0, Math.round(s.projCount));
  s.pierce = Math.max(0, s.pierce);
  s.bounce = Math.max(0, Math.round(s.bounce));
  s.burnChance = Math.min(1, Math.max(0, s.burnChance));
  s.extraChoices = Math.max(0, Math.round(s.extraChoices));
  return s;
}

const warned = new Set();
function warnOnce(key, err) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[stats] ${key} failed`, err);
}
