// Persistent Workshop upgrades (WP19, DESIGN §2.9). Bought with banked cogs in the hangar,
// applied to every run by game/stats.js via applyWorkshop(stats, Save.meta.workshop).
// Cost of buying level L+1 from level L: round(base × (L+1)^1.6).
//
// Item shape: {id, name, maxLevel, base, icon:'icon_ws_<id>', category, flavor,
//              apply(stats, level), desc(level) -> text describing the total at `level`,
//              per (number per level), stat (stat key)}.

/**
 * @typedef {object} WorkshopItem
 * @property {string} id
 * @property {string} name
 * @property {number} maxLevel
 * @property {number} base
 * @property {string} icon
 * @property {'hull'|'guns'|'engine'|'fortune'} category
 * @property {string} flavor
 * @property {(stats: object, level: number) => void} apply
 * @property {(level: number) => string} desc
 */

const clampLv = (l, max) => Math.max(0, Math.min(max, Math.floor(Number(l) || 0)));

/** @returns {WorkshopItem} */
function W(id, name, category, maxLevel, base, flavor, apply, describe) {
  return {
    id, name, category, maxLevel, base, flavor,
    icon: `icon_ws_${id}`,
    apply,
    desc: (level = 1) => {
      const l = Math.max(1, clampLv(level, maxLevel));
      return describe(l) + (maxLevel > 1 ? ` (level ${l}/${maxLevel})` : '');
    },
  };
}

/** @type {WorkshopItem[]} */
export const WORKSHOP = [
  W('hullPlating', 'Hull Plating', 'hull', 5, 60, 'Fresh boiler-plate, riveted at the yards.',
    (s, l) => { s.maxHp += 10 * l; },
    (l) => `+${10 * l} max hull on every voyage (+10 per level).`),
  W('engines', 'Engine Tuning', 'engine', 5, 60, 'Polished pistons and a lighter flywheel.',
    (s, l) => { s.speed *= 1 + 0.04 * l; },
    (l) => `+${4 * l}% top speed (+4% per level).`),
  W('gunnery', 'Gunnery School', 'guns', 5, 80, 'Drills at dawn until the crew loads in their sleep.',
    (s, l) => { s.damage *= 1 + 0.05 * l; },
    (l) => `+${5 * l}% damage for all weapons (+5% per level).`),
  W('boilerworks', 'Boilerworks', 'engine', 5, 50, 'Copper firebox, triple-riveted seams.',
    (s, l) => { s.steamRegen *= 1 + 0.1 * l; },
    (l) => `+${10 * l}% steam regeneration (+10% per level).`),
  W('magnetics', 'Magnetics', 'fortune', 3, 40, 'A lodestone keel draws in salvage.',
    (s, l) => { s.pickupRadius *= 1 + 0.1 * l; },
    (l) => `+${10 * l}% pickup radius (+10% per level).`),
  W('salvage', 'Salvage Rights', 'fortune', 5, 70, 'Paperwork says it is yours now.',
    (s, l) => { s.cogGain *= 1 + 0.1 * l; },
    (l) => `+${10 * l}% cogs collected (+10% per level).`),
  W('ballastRack', 'Ballast Rack', 'guns', 2, 200, 'Another hook for another very heavy sandbag.',
    (s, l) => { s.bombsMax += l; },
    (l) => `+${l} ballast bomb${l > 1 ? 's' : ''} carried (+1 per level).`),
  W('rerolls', 'Fortune Teller', 'fortune', 3, 150, 'Madame Zelda reads the cards. Then reshuffles.',
    (s, l) => { s.rerolls += l; },
    (l) => `${l} card reroll${l > 1 ? 's' : ''} per voyage (+1 per level).`),
  W('emergencyBalloon', 'Emergency Balloon', 'hull', 1, 600, 'A spare gasbag folded under the keel.',
    (s, l) => { s.revives += l; },
    () => 'Once per voyage, when the hull fails, inflate and limp back at 30% hull.'),
  W('fortune', 'Horseshoe Charm', 'fortune', 3, 120, 'Nailed above the wheel, points up.',
    (s, l) => { s.luck += 0.05 * l; },
    (l) => `+${5 * l}% luck: rarer upgrade cards appear more often (+5% per level).`),
  W('armorPlate', 'Armor Plate', 'hull', 2, 300, 'Proper Syndicate plate, liberated.',
    (s, l) => { s.armor += l; },
    (l) => `+${l} armor: every hit deals ${l} less damage (min 1).`),
  W('aetherAttunement', 'Aether Attunement', 'fortune', 5, 70, 'Tuning forks hum to the shards.',
    (s, l) => { s.xpGain *= 1 + 0.08 * l; },
    (l) => `+${8 * l}% aether (XP) gained (+8% per level).`),
];

/** Items by id. */
export const WORKSHOP_BY_ID = Object.fromEntries(WORKSHOP.map((it) => [it.id, it]));

/**
 * Cost to buy the next level when the item is at `level` (0-based current level).
 * @param {WorkshopItem|string} item item or id
 * @param {number} level current level
 * @returns {number} cogs (callers check maxLevel; unknown items cost Infinity)
 */
export function workshopCost(item, level) {
  const it = typeof item === 'string' ? WORKSHOP_BY_ID[item] : item;
  if (!it) return Infinity;
  const l = Math.max(0, Math.floor(Number(level) || 0));
  return Math.round(it.base * (l + 1) ** 1.6);
}

/** Total cogs needed to master every Workshop item from scratch. */
export function workshopTotalCost() {
  let sum = 0;
  for (const it of WORKSHOP) for (let l = 0; l < it.maxLevel; l++) sum += workshopCost(it, l);
  return sum;
}

/**
 * Apply purchased Workshop levels to a stat block. Levels are clamped to each item's max and
 * junk values (from an old or edited save) are ignored.
 * @param {object} stats mutable stat block
 * @param {Record<string, number>} [levels] Save.meta.workshop
 * @returns {object} stats
 */
export function applyWorkshop(stats, levels = {}) {
  if (!stats || !levels) return stats;
  for (const item of WORKSHOP) {
    const l = clampLv(levels[item.id], item.maxLevel);
    if (l > 0) item.apply(stats, l);
  }
  return stats;
}

/** Short summary lines of every active Workshop bonus (results / pause screens). */
export function workshopSummary(levels = {}) {
  const out = [];
  for (const item of WORKSHOP) {
    const l = clampLv(levels?.[item.id], item.maxLevel);
    if (l > 0) out.push(`${item.name}: ${item.desc(l)}`);
  }
  return out;
}
