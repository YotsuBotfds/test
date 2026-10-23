// Player hulls (WP19, DESIGN §2.5). Perks are expressed purely as data the engine already
// understands (ENGINE.md §9): `base` numbers *replace* the stat defaults (so multiplicative perks
// are written as the multiplied value, e.g. Cormorant steamRegen 14 × 1.2 = 16.8), `startAux`
// is equipped at launch and `startPassives` {id: level} are granted at launch.
//
// Unlock shapes (read by the hangar): null (free) · {cogs:n} · {stage:n} (reach stage n) ·
// {win:true} (win the campaign). Extra fields (`traits`, `role`, `difficulty`, `color`, `tip`)
// are presentational and optional for consumers.

/** Stat defaults the hull bases are compared against (keep in sync with game/stats.js). */
const DEF = { maxHp: 100, speed: 240, armor: 0, boostCost: 30, steamRegen: 14, damage: 1 };

/**
 * @typedef {object} HullDef
 * @property {string} id
 * @property {string} name
 * @property {string} title
 * @property {string} sprite
 * @property {string} desc
 * @property {string} perk          one-line perk summary (hangar)
 * @property {string[]} traits      bullet list of every deviation from the defaults
 * @property {string} role
 * @property {1|2|3} difficulty     1 = forgiving … 3 = demanding
 * @property {string} color         accent colour for UI chrome
 * @property {Record<string, number>} base
 * @property {string[]} startAux
 * @property {Record<string, number>} startPassives
 * @property {null|{cogs?:number, stage?:number, win?:boolean}} unlock
 * @property {string} tip
 */

/** @returns {HullDef} */
function hull(def) {
  const traits = def.traits || [];
  const b = def.base;
  // Auto-derive numeric trait lines so the text always matches the numbers.
  const auto = [];
  if (b.maxHp !== undefined && b.maxHp !== DEF.maxHp) auto.push(`${b.maxHp} hull (${signed(b.maxHp - DEF.maxHp)})`);
  if (b.speed !== undefined && b.speed !== DEF.speed) auto.push(`${b.speed} top speed (${signed(b.speed - DEF.speed)})`);
  if (b.armor) auto.push(`${b.armor} armor — every hit deals ${b.armor} less`);
  if (b.boostCost !== undefined && b.boostCost !== DEF.boostCost) auto.push(`Boost costs ${b.boostCost} steam (default ${DEF.boostCost})`);
  if (b.steamRegen !== undefined && b.steamRegen !== DEF.steamRegen) {
    auto.push(`${signed(Math.round((b.steamRegen / DEF.steamRegen - 1) * 100))}% steam regen`);
  }
  if (b.damage !== undefined && b.damage !== DEF.damage) auto.push(`${signed(Math.round((b.damage - 1) * 100))}% damage`);
  if (b.pierce) auto.push(`Every shot pierces +${b.pierce}`);
  if (b.extraChoices) auto.push(`${3 + b.extraChoices} upgrade cards per level-up`);
  return { startAux: [], startPassives: {}, unlock: null, ...def, traits: [...auto, ...traits] };
}

function signed(n) {
  return n > 0 ? `+${n}` : String(n);
}

/** @type {Record<string, HullDef>} */
export const HULLS = {
  dauntless: hull({
    id: 'dauntless',
    name: 'The Dauntless',
    title: 'Guild Cutter',
    sprite: 'hull_dauntless',
    desc: 'A balanced Free Skies cutter. Forgiving, dependable, and ready for any loadout.',
    perk: 'Balanced — no weaknesses, no crutches.',
    role: 'All-rounder',
    difficulty: 1,
    color: '#c9973f',
    base: { maxHp: 100, speed: 240 },
    traits: ['Standard steam, boost and bomb racks'],
    tip: 'The best hull for learning enemy patterns: every build works on her.',
  }),

  cormorant: hull({
    id: 'cormorant',
    name: 'The Cormorant',
    title: 'Racing Zeppelin',
    sprite: 'hull_cormorant',
    desc: 'Lean and quick, all fins and steam lungs. Cheap boosts, thin plating.',
    perk: 'Starts with Aerodynamic Fins; +20% steam regen; boosts cost 20.',
    role: 'Skirmisher',
    difficulty: 2,
    color: '#33c9c0',
    base: { maxHp: 70, speed: 290, boostCost: 20, steamRegen: 16.8 },
    startPassives: { fins: 1 },
    unlock: { cogs: 500 },
    tip: 'Boost through bullet walls — i-frames are cheap on her. Never trade hits.',
  }),

  bulwark: hull({
    id: 'bulwark',
    name: 'The Bulwark',
    title: 'Armored Airship',
    sprite: 'hull_bulwark',
    desc: 'A flying fortress. Slow to turn, armored to the gunwales, bristling with cannon.',
    perk: 'Starts with a Broadside Battery; 2 armor.',
    role: 'Brawler',
    difficulty: 1,
    color: '#8c2f2b',
    base: { maxHp: 160, armor: 2, speed: 200 },
    startAux: ['broadside'],
    unlock: { cogs: 1200 },
    tip: 'Armor shrugs off scout chip-damage. Turn your flank to the swarm and let the broadside talk.',
  }),

  tinker: hull({
    id: 'tinker',
    name: "The Tinker's Folly",
    title: 'Experimental Gyrocraft',
    sprite: 'hull_tinker',
    desc: 'An inventor’s fever dream. More choices, more gadgets, more things to go wrong.',
    perk: '+1 card choice (4 per level-up); starts with Clockwork Drones.',
    role: 'Builder',
    difficulty: 2,
    color: '#b05bd6',
    base: { maxHp: 90, speed: 235, extraChoices: 1 },
    startAux: ['clockDrones'],
    unlock: { stage: 3 },
    tip: 'The fourth card makes evolutions far easier to chase — plan your partner passives early.',
  }),

  bane: hull({
    id: 'bane',
    name: "The Leviathan's Bane",
    title: 'Monster Hunter',
    sprite: 'hull_bane',
    desc: 'Built to kill dreadnoughts. Hits harder, and every round punches through.',
    perk: '+15% damage; harpoon-style piercing (+1 pierce on every shot).',
    role: 'Boss hunter',
    difficulty: 3,
    color: '#ff9b2f',
    base: { maxHp: 120, speed: 250, damage: 1.15, pierce: 1 },
    unlock: { win: true },
    tip: 'Pierce stacks with Armor-Piercing Shot — line enemies up and skewer whole formations.',
  }),
};

/** Hangar / codex display order. */
export const HULL_ORDER = ['dauntless', 'cormorant', 'bulwark', 'tinker', 'bane'];
