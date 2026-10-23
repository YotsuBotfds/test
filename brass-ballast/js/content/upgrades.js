// STUB (WP19 replaces) — passives, card rolling and application. DESIGN §2.8, WP19.
import { AUX, EVOLUTIONS } from './weapons/index.js';

const P = (id, name, rarity, maxLevel, apply, descFn) => ({
  id, name, rarity, maxLevel, icon: `icon_${id}`, apply, desc: descFn,
});

export const PASSIVES = {
  plating: P('plating', 'Reinforced Plating', 'common', 5, (s, l) => { s.maxHp += 20 * l; }, () => '+20 max hull'),
  boiler: P('boiler', 'Pressurized Boiler', 'common', 5, (s, l) => { s.steamRegen *= 1 + 0.25 * l; s.steamMax += 20 * l; }, () => '+25% steam regen, +20 steam'),
  rifling: P('rifling', 'Rifled Barrels', 'common', 5, (s, l) => { s.damage *= 1 + 0.12 * l; s.projSpeed *= 1 + 0.1 * l; }, () => '+12% damage, +10% shot speed'),
  quickLoader: P('quickLoader', 'Quick Loader', 'common', 5, (s, l) => { s.fireRate *= 1 + 0.1 * l; }, () => '+10% fire rate'),
  luckyRivet: P('luckyRivet', 'Lucky Rivet', 'common', 5, (s, l) => { s.crit += 0.05 * l; s.critMult += 0.1 * l; }, () => '+5% crit, +10% crit damage'),
  magnet: P('magnet', 'Lodestone Magnet', 'common', 5, (s, l) => { s.pickupRadius *= 1 + 0.35 * l; }, () => '+35% pickup radius'),
  fins: P('fins', 'Aerodynamic Fins', 'common', 5, (s, l) => { s.speed *= 1 + 0.08 * l; s.accel *= 1 + 0.06 * l; }, () => '+8% speed'),
  repairCrew: P('repairCrew', 'Repair Crew', 'common', 5, (s, l) => { s.hpRegen += 0.5 * l; }, () => '+0.5 hull/s'),
  extraBallast: P('extraBallast', 'Extra Ballast', 'common', 3, (s, l) => { s.bombsMax += l; }, () => '+1 bomb'),
  twinBarrels: P('twinBarrels', 'Twin Barrels', 'common', 3, (s, l) => { s.projCount += l; }, () => '+1 projectile'),
  ricochet: P('ricochet', 'Ricochet Rounds', 'common', 3, (s, l) => { s.bounce += l; }, () => '+1 bounce'),
  piercing: P('piercing', 'Armor-Piercing Shot', 'common', 3, (s, l) => { s.pierce += l; }, () => '+1 pierce'),
  incendiary: P('incendiary', 'Incendiary Shells', 'common', 5, (s, l) => { s.burnChance += 0.1 * l; }, () => '+10% burn chance'),
  explosiveTips: P('explosiveTips', 'Explosive Tips', 'common', 5, (s, l) => { s.explosive = 26 + 6 * l; }, () => 'Hits explode'),
  clockwork: P('clockwork', 'Clockwork Precision', 'common', 5, (s, l) => { s.cooldown *= 1 - 0.08 * l; }, () => '-8% aux cooldown'),
  bigBore: P('bigBore', 'Big Bore', 'common', 5, (s, l) => { s.area *= 1 + 0.15 * l; }, () => '+15% area'),
  scavenger: P('scavenger', "Scavenger's Eye", 'common', 5, (s, l) => { s.xpGain *= 1 + 0.15 * l; s.cogGain *= 1 + 0.15 * l; }, () => '+15% XP & cogs'),
  ironHide: P('ironHide', 'Iron Hide', 'common', 3, (s, l) => { s.armor += l; }, () => '+1 armor'),
  aetherShield: P('aetherShield', 'Aether Shield', 'rare', 3, (s, l) => { s.shieldInterval = 20 - 4 * l; }, () => 'Blocks a hit periodically'),
  vengeance: P('vengeance', 'Vengeful Boilers', 'rare', 3, (s, l) => { s.vengeance = l; }, () => 'Retaliate when hit'),
};

export function cardFor(id, player) {
  if (PASSIVES[id]) {
    const d = PASSIVES[id];
    const level = (player?.passiveLevel?.(id) || 0) + 1;
    return { key: `passive:${id}`, kind: 'passive', id, name: d.name, desc: d.desc(level), icon: d.icon, rarity: d.rarity, level, maxLevel: d.maxLevel };
  }
  if (AUX[id]) {
    const d = AUX[id];
    const cur = player?.auxLevel?.(id) || 0;
    return { key: `aux:${id}`, kind: cur ? 'auxLevel' : 'auxNew', id, name: d.name, desc: d.desc, icon: d.icon, rarity: 'rare', level: cur + 1, maxLevel: d.maxLevel };
  }
  if (EVOLUTIONS[id]) {
    const d = EVOLUTIONS[id];
    return { key: `evo:${id}`, kind: 'evolution', id, name: d.name, desc: d.desc, icon: d.icon, rarity: 'legendary', level: 1, maxLevel: 1 };
  }
  return null;
}

/** Roll `count` distinct cards. pool: 'level' | 'refit' | 'crate'. */
export function rollChoices(player, rng, count = 3) {
  const ids = Object.keys(PASSIVES).filter((id) => (player.passiveLevel?.(id) || 0) < PASSIVES[id].maxLevel);
  rng.shuffle(ids);
  const out = ids.slice(0, count).map((id) => cardFor(id, player));
  if (!out.length) out.push({ key: 'repair', kind: 'repair', id: 'repair', name: 'Field Repairs', desc: 'Repair 30% hull', icon: 'icon_heal', rarity: 'common', level: 1, maxLevel: 1 });
  return out;
}

/** Apply a card to the player. */
export function applyChoice(player, card) {
  if (card.kind === 'passive') player.addPassive?.(card.id);
  else if (card.kind === 'auxNew') player.addAux?.(card.id);
  else if (card.kind === 'auxLevel') player.levelAux?.(card.id);
  else if (card.kind === 'repair') player.heal?.(player.stats.maxHp * 0.3);
  player.recomputeStats?.();
}
