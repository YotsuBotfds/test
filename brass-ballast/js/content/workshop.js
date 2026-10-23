// STUB (WP19 replaces) — persistent Workshop upgrades. DESIGN §2.9.
const W = (id, name, maxLevel, base, apply, desc) => ({ id, name, maxLevel, base, icon: `icon_ws_${id}`, apply, desc });

export const WORKSHOP = [
  W('hullPlating', 'Hull Plating', 5, 60, (s, l) => { s.maxHp += 10 * l; }, () => '+10 max hull per level'),
  W('engines', 'Engine Tuning', 5, 60, (s, l) => { s.speed *= 1 + 0.04 * l; }, () => '+4% speed per level'),
  W('gunnery', 'Gunnery School', 5, 80, (s, l) => { s.damage *= 1 + 0.05 * l; }, () => '+5% damage per level'),
  W('boilerworks', 'Boilerworks', 5, 50, (s, l) => { s.steamRegen *= 1 + 0.1 * l; }, () => '+10% steam regen per level'),
  W('magnetics', 'Magnetics', 3, 40, (s, l) => { s.pickupRadius *= 1 + 0.1 * l; }, () => '+10% pickup radius per level'),
  W('salvage', 'Salvage Rights', 5, 70, (s, l) => { s.cogGain *= 1 + 0.1 * l; }, () => '+10% cogs per level'),
  W('ballastRack', 'Ballast Rack', 2, 200, (s, l) => { s.bombsMax += l; }, () => '+1 bomb per level'),
  W('rerolls', 'Fortune Teller', 3, 150, (s, l) => { s.rerolls += l; }, () => '+1 reroll per run'),
  W('emergencyBalloon', 'Emergency Balloon', 1, 600, (s, l) => { s.revives += l; }, () => 'Revive once per run'),
  W('fortune', 'Horseshoe Charm', 3, 120, (s, l) => { s.luck += 0.05 * l; }, () => '+5% luck per level'),
  W('armorPlate', 'Armor Plate', 2, 300, (s, l) => { s.armor += l; }, () => '+1 armor per level'),
  W('aetherAttunement', 'Aether Attunement', 5, 70, (s, l) => { s.xpGain *= 1 + 0.08 * l; }, () => '+8% XP per level'),
];

export const workshopCost = (item, level) => Math.round(item.base * (level + 1) ** 1.6);

export function applyWorkshop(stats, levels = {}) {
  for (const item of WORKSHOP) {
    const l = levels[item.id] || 0;
    if (l > 0) item.apply(stats, l);
  }
}
