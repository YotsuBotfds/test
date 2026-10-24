// Passives, upgrade cards, card rolling and application (WP19, DESIGN §2.8, ENGINE.md §9–§10).
//
// Card shape (UI + engine contract):
//   {key, kind:'passive'|'auxNew'|'auxLevel'|'primaryLevel'|'evolution'|'repair'|'cogs',
//    id, name, desc, icon, rarity, level, maxLevel, ...extras}
// Extras are informational: `tags`, `synergy` (text), `value` (cogs), `from` (evolution source).
//
// Rolling (rollChoices):
//   1. Build every eligible card for the player (passives below max, aux new/level within the
//      4-slot limit, the primary's next calibration, evolutions whose aux is maxed and whose
//      partner passive is owned).
//   2. Evolutions are always offered first (legendary, "always shown if possible").
//   3. The rest is a weighted draw without replacement: RARITY weight × kind bias × synergy
//      bias × luck (stats.luck shifts weight toward rarer tiers) × bad-luck protection.
//   4. Level-ups guarantee one armament card (aux / calibration) when any exists, so builds
//      grow teeth; crates guarantee one rare+ card; refits only offer rare+ (falling back to
//      the best remaining cards); empty slots fall back to Field Repairs / Salvage Haul.

import { RARITY } from '../config.js';
import { AUX, EVOLUTIONS, PRIMARIES } from './weapons/index.js';

/** Max equipped aux systems (mirrors player.js MAX_AUX; no import to avoid an import cycle). */
const MAX_AUX = 4;
/** Rarity tiers for luck scaling. */
const TIER = { common: 0, rare: 1, epic: 2, legendary: 3 };
/** How strongly luck tilts the draw: weight × (1 + LUCK_TILT·luck)^tier. */
const LUCK_TILT = 3;
/** Bad-luck protection: each offer without a rare+ card boosts rare+ weights by this much. */
const PITY_STEP = 0.15;
const PITY_MAX = 1.5;
/** Kind biases so 18 common passives don't drown out the few armament cards. */
const KIND_BIAS = { passive: 1, auxNew: 1.6, auxLevel: 2.2, primaryLevel: 6, evolution: 1 };
/** Engine-side sanity caps we respect inside passive apply functions. */
export const CAPS = Object.freeze({ crit: 0.75, cooldown: 0.35 });

// ---- Text helpers ---------------------------------------------------------------------------

const num = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(1).replace(/\.0$/, ''));
/** " (total +60)" for levels above 1. */
const total = (level, text) => (level > 1 ? ` (total ${text})` : '');
const clampLv = (level, max) => Math.max(1, Math.min(max, level | 0 || 1));

// ---- Passives -------------------------------------------------------------------------------

/**
 * @typedef {object} PassiveDef
 * @property {string} id
 * @property {string} name
 * @property {'common'|'rare'} rarity
 * @property {number} maxLevel
 * @property {string} icon
 * @property {string[]} tags
 * @property {string} flavor
 * @property {(stats: object, level: number, player?: object) => void} apply
 * @property {(level: number) => string} desc  text for reaching `level` (exact numbers)
 */

/** @returns {PassiveDef} */
function passive(id, name, rarity, maxLevel, tags, flavor, apply, describe) {
  return {
    id, name, rarity, maxLevel, tags, flavor,
    icon: `icon_${id}`,
    apply,
    desc: (level = 1) => describe(clampLv(level, maxLevel)),
  };
}

/** @type {Record<string, PassiveDef>} */
export const PASSIVES = {
  plating: passive('plating', 'Reinforced Plating', 'common', 5, ['defense'],
    'Riveted boiler-plate over every soft spot.',
    (s, l) => { s.maxHp += 20 * l; },
    (l) => `+20 max hull and patch 20 hull now${total(l, `+${20 * l} max hull`)}.`),

  boiler: passive('boiler', 'Pressurized Boiler', 'common', 5, ['mobility'],
    'Rated for twice the pressure. Probably.',
    (s, l) => { s.steamRegen *= 1 + 0.25 * l; s.steamMax += 20 * l; },
    (l) => `+25% steam regen and +20 steam capacity${total(l, `+${25 * l}% regen, +${20 * l} steam`)}.`),

  rifling: passive('rifling', 'Rifled Barrels', 'common', 5, ['offense'],
    'Spiral grooves: the shot spins, the foe spins harder.',
    (s, l) => { s.damage *= 1 + 0.12 * l; s.projSpeed *= 1 + 0.1 * l; },
    (l) => `+12% damage and +10% shot speed${total(l, `+${12 * l}% dmg, +${10 * l}% speed`)}.`),

  quickLoader: passive('quickLoader', 'Quick Loader', 'common', 5, ['offense'],
    'A spring-fed breech and a very nervous loader.',
    (s, l) => { s.fireRate *= 1 + 0.1 * l; },
    (l) => `+10% fire rate${total(l, `+${10 * l}%`)}.`),

  luckyRivet: passive('luckyRivet', 'Lucky Rivet', 'common', 5, ['offense'],
    'Polished by a thousand superstitious thumbs.',
    (s, l) => {
      s.crit = Math.min(CAPS.crit, s.crit + 0.05 * l);
      s.critMult += 0.1 * l;
    },
    (l) => `+5% crit chance and +10% crit damage${total(l, `+${5 * l}% crit, +${10 * l}% crit dmg`)}.`
      + (l === 5 ? ' Crit chance caps at 75%.' : '')),

  magnet: passive('magnet', 'Lodestone Magnet', 'common', 5, ['utility'],
    'Pulls in shards, cogs, and the occasional spanner.',
    (s, l) => { s.pickupRadius *= 1 + 0.35 * l; },
    (l) => `+35% pickup radius${total(l, `+${35 * l}%`)}.`),

  fins: passive('fins', 'Aerodynamic Fins', 'common', 5, ['mobility'],
    'Swept brass fins. Faster, and frankly more handsome.',
    (s, l) => { s.speed *= 1 + 0.08 * l; s.accel *= 1 + 0.06 * l; },
    (l) => `+8% top speed and +6% acceleration${total(l, `+${8 * l}% speed, +${6 * l}% accel`)}.`),

  repairCrew: passive('repairCrew', 'Repair Crew', 'common', 5, ['defense'],
    'Three riggers, two hammers, one song.',
    (s, l) => { s.hpRegen += 0.5 * l; },
    (l) => `Regenerate +0.5 hull per second${total(l, `${num(0.5 * l)} hull/s`)}.`),

  extraBallast: passive('extraBallast', 'Extra Ballast', 'common', 3, ['utility', 'offense'],
    'More sandbags. These ones explode.',
    (s, l) => { s.bombsMax += l; },
    (l) => `+1 ballast bomb capacity (and one bomb now)${total(l, `+${l} bombs`)}.`),

  twinBarrels: passive('twinBarrels', 'Twin Barrels', 'common', 3, ['offense'],
    'Why fire one when the rack holds two?',
    (s, l) => { s.projCount += l; },
    (l) => `+1 projectile per volley: +25% volley damage, shared across the shots${total(l, `+${l} projectiles`)}.`),

  ricochet: passive('ricochet', 'Ricochet Rounds', 'common', 3, ['offense'],
    'Hardened shot that skips off hulls toward the next victim.',
    (s, l) => { s.bounce += l; },
    (l) => `Shots ricochet into one more foe within 300${total(l, `${l} bounce${l > 1 ? 's' : ''}`)}.`),

  piercing: passive('piercing', 'Armor-Piercing Shot', 'common', 3, ['offense'],
    'Tungsten cores punch clean through Syndicate plate.',
    (s, l) => { s.pierce += l; },
    (l) => `Shots pierce +1 more foe${total(l, `+${l} pierce`)}.`),

  incendiary: passive('incendiary', 'Incendiary Shells', 'common', 5, ['offense', 'fire'],
    'Packed with whale-oil and spite.',
    (s, l) => { s.burnChance += 0.12 * l; },
    (l) => `+12% chance on hit to ignite: 6 dps × your damage for 3 s, plus half the hit again as stacking flame${total(l, `${12 * l}% chance`)}.`),

  explosiveTips: passive('explosiveTips', 'Explosive Tips', 'common', 5, ['offense', 'area'],
    'Every cannonball a tiny thunderclap.',
    (s, l) => { s.explosive += 26 + 6 * l; },
    (l) => `Primary hits explode in a ${26 + 6 * l}-radius blast for 35% of the hit's damage`
      + (l > 1 ? ` (+6 radius per level).` : '.')),

  clockwork: passive('clockwork', 'Clockwork Precision', 'common', 5, ['utility'],
    'Escapements tuned to the tick of a chronometer.',
    (s, l) => { s.cooldown = Math.max(CAPS.cooldown, s.cooldown * (1 - 0.08 * l)); },
    (l) => `−8% auxiliary cooldowns${total(l, `−${8 * l}%`)}.`),

  bigBore: passive('bigBore', 'Big Bore', 'common', 5, ['area'],
    'Wider barrels, bigger balls, larger booms.',
    (s, l) => { s.area *= 1 + 0.15 * l; },
    (l) => `+15% blast radius, aura & projectile size${total(l, `+${15 * l}%`)}.`),

  scavenger: passive('scavenger', "Scavenger's Eye", 'common', 5, ['utility'],
    'Spots salvage at a mile. Spots trouble at two.',
    (s, l) => { s.xpGain *= 1 + 0.15 * l; s.cogGain *= 1 + 0.15 * l; },
    (l) => `+15% aether (XP) and cogs gained${total(l, `+${15 * l}%`)}.`),

  ironHide: passive('ironHide', 'Iron Hide', 'common', 3, ['defense'],
    'Cladding thick enough to stop a cannonball. Small ones.',
    (s, l) => { s.armor += l; },
    (l) => `+1 armor: every hit deals 1 less damage (min 1)${total(l, `+${l} armor`)}.`),

  aetherShield: passive('aetherShield', 'Aether Shield', 'rare', 3, ['defense'],
    'A shimmering bubble of bottled sky.',
    (s, l) => {
      const iv = 20 - 4 * l;
      s.shieldInterval = s.shieldInterval > 0 ? Math.min(s.shieldInterval, iv) : iv;
    },
    (l) => `A shield blocks one hit, recharging every ${20 - 4 * l} s`
      + (l > 1 ? ` (was ${24 - 4 * l} s).` : '.')),

  vengeance: passive('vengeance', 'Vengeful Boilers', 'rare', 3, ['offense', 'defense'],
    'Hit us and the boilers answer for us.',
    (s, l) => { s.vengeance += l; },
    (l) => `When hit, vent a ring of ${8 * l} shells dealing 15 damage each`
      + (l > 1 ? ` (+8 shells per level).` : '.')),
};

/** Display order for passives (codex, pause screen). */
export const PASSIVE_ORDER = Object.keys(PASSIVES);

// ---- Synergy lookups (computed lazily so a stub weapons module can't break us) --------------

/** aux id whose evolution needs this passive, or null. */
function auxForPartner(passiveId) {
  for (const id in AUX) if (AUX[id]?.evolvesWith === passiveId) return id;
  return null;
}

/** Is this aux id the source of an evolution the player already owns? */
function auxEvolved(player, auxId) {
  const evo = AUX[auxId]?.evolution;
  return !!(evo && player.hasAux?.(evo));
}

const auxLevelOf = (player, id) => player.auxLevel?.(id) || 0;
const passiveLevelOf = (player, id) => player.passiveLevel?.(id) || player.passives?.[id] || 0;

// ---- Card builders --------------------------------------------------------------------------

function passiveCard(id, player) {
  const d = PASSIVES[id];
  if (!d) return null;
  const cur = passiveLevelOf(player, id);
  if (cur >= d.maxLevel) return null;
  const level = cur + 1;
  let desc = d.desc(level);
  let synergy = '';
  const auxId = auxForPartner(id);
  const evoId = auxId && AUX[auxId]?.evolution;
  if (auxId && evoId && cur === 0 && player?.hasAux?.(auxId) && EVOLUTIONS[evoId]) {
    synergy = `Unlocks ${EVOLUTIONS[evoId].name} with ${AUX[auxId].name} L${AUX[auxId].maxLevel ?? 5}.`;
    desc += ` ⚙ ${synergy}`;
  }
  return {
    key: `passive:${id}`, kind: 'passive', id, name: d.name, desc, icon: d.icon,
    rarity: d.rarity, level, maxLevel: d.maxLevel, tags: d.tags, synergy,
  };
}

function auxCard(id, player) {
  const d = AUX[id];
  if (!d) return null;
  const max = d.maxLevel ?? 5;
  const cur = auxLevelOf(player, id);
  if (cur >= max) return null;
  if (!cur && auxEvolved(player, id)) return null;
  const level = cur + 1;
  let desc = '';
  try {
    desc = typeof d.levelDesc === 'function' ? String(d.levelDesc(level) ?? '') : '';
  } catch {
    desc = '';
  }
  if (!desc) desc = String(d.desc || '');
  let synergy = '';
  const evo = d.evolution && EVOLUTIONS[d.evolution];
  const partner = d.evolvesWith && PASSIVES[d.evolvesWith];
  if (evo && partner) {
    if (level === max) {
      synergy = passiveLevelOf(player, d.evolvesWith) > 0
        ? `Max level — ${evo.name} evolution ready!`
        : `At max level, ${partner.name} evolves it into ${evo.name}.`;
    } else if (level === 1) {
      synergy = `Evolves with ${partner.name}.`;
    }
    if (synergy) desc += ` ⚙ ${synergy}`;
  }
  return {
    key: `aux:${id}`, kind: cur ? 'auxLevel' : 'auxNew', id, name: d.name, desc,
    icon: d.icon || `icon_${id}`, rarity: 'rare', level, maxLevel: max, tags: ['armament'], synergy,
  };
}

function primaryCard(id, player) {
  const d = PRIMARIES[id];
  if (!d) return null;
  const max = d.maxLevel ?? 8;
  const cur = player?.primary?.id === id ? player.primary.level || 1 : 0;
  if (!cur || cur >= max) return null;
  const level = cur + 1;
  let desc = '';
  try {
    desc = typeof d.levelDesc === 'function' ? String(d.levelDesc(level) ?? '') : '';
  } catch {
    desc = '';
  }
  if (!desc) desc = `Recalibrate the ${d.name} to level ${level}.`;
  return {
    key: `prim:${id}`, kind: 'primaryLevel', id, name: `Calibrate: ${d.name}`, desc,
    icon: d.icon || `icon_${id}`, rarity: level >= 7 ? 'epic' : 'rare', level, maxLevel: max,
    tags: ['armament'],
  };
}

function evolutionCard(id, player) {
  const d = EVOLUTIONS[id];
  if (!d) return null;
  if (player?.hasAux?.(id)) return null;
  const from = AUX[d.from];
  return {
    key: `evo:${id}`, kind: 'evolution', id, name: d.name,
    desc: `${d.desc || ''}${from ? ` Replaces ${from.name}.` : ''}`,
    icon: d.icon || `icon_${id}`, rarity: 'legendary', level: 1, maxLevel: 1,
    from: d.from, requires: d.requires, tags: ['armament', 'evolution'],
  };
}

/** Field Repairs: heal 30% hull (and top up steam). */
export function repairCard() {
  return {
    key: 'repair', kind: 'repair', id: 'repair', name: 'Field Repairs',
    desc: 'Patch 30% of your max hull and vent the boilers to full steam.',
    icon: 'icon_heal', rarity: 'common', level: 1, maxLevel: 1, tags: ['supplies'],
  };
}

/** Salvage Haul: +40 cogs into the run purse. */
export function cogsCard(value = 40) {
  return {
    key: 'cogs', kind: 'cogs', id: 'cogs', name: 'Salvage Haul',
    desc: `+${value} cogs for the Workshop.`,
    icon: 'icon_cog', rarity: 'common', level: 1, maxLevel: 1, value, tags: ['supplies'],
  };
}

/**
 * Build the card that would be offered for `id` (passive, aux, evolution, the player's primary,
 * 'repair' or 'cogs'). Returns null when the id is unknown or already maxed / owned.
 * @param {string} id
 * @param {object} [player]
 */
export function cardFor(id, player) {
  if (PASSIVES[id]) return passiveCard(id, player || {});
  if (AUX[id]) return auxCard(id, player || {});
  if (EVOLUTIONS[id]) return evolutionCard(id, player || {});
  if (PRIMARIES[id]) return primaryCard(id, player || { primary: { id, level: 1 } });
  if (id === 'repair') return repairCard();
  if (id === 'cogs') return cogsCard();
  return null;
}

// ---- Eligibility ----------------------------------------------------------------------------

/** True when the player's aux at max level + partner passive owned → evolution available. */
function evolutionEligible(player, evoId) {
  const evo = EVOLUTIONS[evoId];
  if (!evo || player.hasAux?.(evoId)) return false;
  const src = AUX[evo.from];
  if (!src) return false;
  const lv = auxLevelOf(player, evo.from);
  return lv > 0 && lv >= (src.maxLevel ?? 5) && passiveLevelOf(player, evo.requires) >= 1;
}

/**
 * Every card the player could be offered right now (no evolutions; those are separate).
 * @returns {object[]}
 */
function candidateCards(player) {
  const out = [];
  for (const id in PASSIVES) {
    const c = passiveCard(id, player);
    if (c) out.push(c);
  }
  const slotFree = (player.aux?.length ?? 0) < MAX_AUX;
  for (const id in AUX) {
    const owned = player.hasAux?.(id);
    if (!owned && !slotFree) continue;
    const c = auxCard(id, player);
    if (c) out.push(c);
  }
  const pid = player.primary?.id;
  if (pid) {
    const c = primaryCard(pid, player);
    if (c) out.push(c);
  }
  return out;
}

/** Evolution cards the player qualifies for. */
export function eligibleEvolutions(player) {
  const out = [];
  for (const id in EVOLUTIONS) {
    if (evolutionEligible(player, id)) {
      const c = evolutionCard(id, player);
      if (c) out.push(c);
    }
  }
  return out;
}

// ---- Weighting ------------------------------------------------------------------------------

function upgradeState(player) {
  if (!player.upgradeState) player.upgradeState = { dry: 0, offers: 0 };
  return player.upgradeState;
}

/**
 * Draw weight of a card for this player.
 * @param {object} card
 * @param {object} player
 * @param {number} luck stats.luck
 * @param {number} pity bad-luck multiplier for rare+ tiers (≥ 1)
 */
export function cardWeight(card, player, luck = 0, pity = 1) {
  const tier = TIER[card.rarity] ?? 0;
  let w = (RARITY[card.rarity]?.weight ?? 60) * (KIND_BIAS[card.kind] ?? 1);
  w *= Math.pow(1 + LUCK_TILT * Math.max(0, luck), tier);
  if (tier > 0) w *= pity;
  if (card.kind === 'passive') {
    // Partner passive of an owned (not yet evolved) aux: nudge toward evolutions.
    const auxId = auxForPartner(card.id);
    if (auxId && player.hasAux?.(auxId) && passiveLevelOf(player, card.id) === 0) w *= 1.6;
    // Passives the captain already invests in show up a bit more (build coherence).
    if (passiveLevelOf(player, card.id) > 0) w *= 1.2;
  } else if (card.kind === 'auxLevel') {
    // Aux one level from max whose partner is owned → evolution next: tempt the captain.
    const d = AUX[card.id];
    if (d && card.level === (d.maxLevel ?? 5) && passiveLevelOf(player, d.evolvesWith) > 0) w *= 1.5;
  } else if (card.kind === 'auxNew') {
    // Empty racks want filling early; the last slot is a weightier decision.
    const n = player.aux?.length ?? 0;
    w *= n === 0 ? 1.6 : n >= MAX_AUX - 1 ? 0.8 : 1;
  }
  return w;
}

/** Draw one card from `list` (removing it); `filter` narrows the eligible set. */
function drawOne(list, rng, weightOf, filter) {
  const pool = filter ? list.filter(filter) : list;
  if (!pool.length) return null;
  const card = rng.weighted ? rng.weighted(pool, weightOf) : pool[Math.floor(rng.next() * pool.length)];
  const pick = card ?? pool[0];
  list.splice(list.indexOf(pick), 1);
  return pick;
}

const isRarePlus = (c) => (TIER[c.rarity] ?? 0) >= 1;
const isArmament = (c) => c.kind === 'auxNew' || c.kind === 'auxLevel' || c.kind === 'primaryLevel';

// ---- Rolling --------------------------------------------------------------------------------

/**
 * Roll `count` distinct upgrade cards for a player.
 * @param {object} player Player (ENGINE.md §8)
 * @param {{next():number, weighted?:Function}} rng seeded RNG (world.rng)
 * @param {number} [count=3]
 * @param {{pool?:'level'|'refit'|'crate', run?:object, world?:object}} [opts]
 * @returns {object[]} cards (never empty)
 */
export function rollChoices(player, rng, count = 3, opts = {}) {
  const pool = opts.pool || 'level';
  const n = Math.max(1, count | 0 || 3);
  const st = upgradeState(player);
  const luck = player.stats?.luck || 0;
  const pity = Math.min(1 + PITY_MAX, 1 + PITY_STEP * st.dry);
  const weightOf = (c) => cardWeight(c, player, luck, pity);
  const out = [];

  // 1. Evolutions first — legendary and always offered when eligible.
  for (const c of eligibleEvolutions(player)) if (out.length < n) out.push(c);

  let cands = candidateCards(player);

  if (pool === 'refit') {
    // Fine upgrades only: rare+ cards; if the shelf runs dry, the best of what remains.
    const fine = cands.filter(isRarePlus);
    while (out.length < n && fine.length) out.push(drawOne(fine, rng, weightOf));
    cands = cands.filter((c) => !isRarePlus(c));
    while (out.length < n && cands.length) out.push(drawOne(cands, rng, weightOf));
  } else {
    // Crates: one guaranteed rare+ card (if any) before the normal draw.
    if (pool === 'crate' && out.length < n && !out.some(isRarePlus)) {
      const c = drawOne(cands, rng, weightOf, isRarePlus);
      if (c) out.push(c);
    }
    while (out.length < n && cands.length) out.push(drawOne(cands, rng, weightOf));
    // Level-ups: guarantee one armament card (aux / calibration) when any is available.
    if (pool === 'level' && n >= 3 && !out.some((c) => isArmament(c) || c.kind === 'evolution')) {
      const arm = drawOne(cands, rng, weightOf, isArmament);
      if (arm) {
        // Replace the lowest-weight non-evolution card so the offer stays the same size.
        let worst = -1;
        let ww = Infinity;
        out.forEach((c, i) => {
          if (c.kind === 'evolution') return;
          const w = weightOf(c);
          if (w < ww) { ww = w; worst = i; }
        });
        if (worst >= 0) out[worst] = arm;
        else if (out.length < n) out.push(arm);
      }
    }
  }

  // Fallbacks: Field Repairs / Salvage Haul fill an otherwise empty shelf.
  if (out.length < n) {
    const hurt = player.alive !== false && player.hp < (player.stats?.maxHp ?? 100);
    const fill = hurt || !out.length ? [repairCard(), cogsCard()] : [cogsCard(), repairCard()];
    for (const c of fill) if (out.length < n && !out.some((o) => o.key === c.key)) out.push(c);
  }

  // Bad-luck protection bookkeeping.
  st.offers++;
  st.dry = out.some(isRarePlus) ? 0 : st.dry + 1;

  // Stable presentation: legendaries first, then by rarity, otherwise draw order.
  const order = out.map((c, i) => [c, i]);
  order.sort((a, b) => (TIER[b[0].rarity] ?? 0) - (TIER[a[0].rarity] ?? 0) || a[1] - b[1]);
  return order.map((x) => x[0]);
}

// ---- Applying -------------------------------------------------------------------------------

const RARITY_FX = {
  common: '#f2d48a', rare: '#7ff3ff', epic: '#e3a8ff', legendary: '#ffe08a',
};

/** Little celebratory burst around the ship; purely cosmetic, never throws. */
function celebrate(player, card, world) {
  const fx = world?.fx;
  if (!fx || !player) return;
  const col = RARITY_FX[card.rarity] || RARITY_FX.common;
  try {
    fx.ring?.(player.x, player.y, (player.r || 22) * 2.2, col, 0.45);
    if ((TIER[card.rarity] ?? 0) >= 1) fx.sparks?.(player.x, player.y, -Math.PI / 2, 10, col, Math.PI * 2);
    if (card.kind === 'primaryLevel') fx.flare?.(player.x, player.y, 70, col);
  } catch {
    /* cosmetic */
  }
}

/**
 * Apply a card to the player. Handles every card kind through the real Player API and
 * recomputes stats. The engine verifies by kind afterwards and never double-applies.
 * @param {object} player
 * @param {object} card
 * @param {object} [world]
 * @returns {boolean} true if something changed
 */
export function applyChoice(player, card, world) {
  if (!player || !card) return false;
  const w = world || player.world;
  let changed = false;
  switch (card.kind) {
    case 'passive': {
      const d = PASSIVES[card.id];
      const before = passiveLevelOf(player, card.id);
      if (d && before < d.maxLevel) {
        player.addPassive?.(card.id);
        changed = passiveLevelOf(player, card.id) > before;
      }
      break;
    }
    case 'auxNew':
    case 'auxLevel': {
      const before = auxLevelOf(player, card.id);
      if (before > 0) player.levelAux?.(card.id);
      else if ((player.aux?.length ?? 0) < MAX_AUX) player.addAux?.(card.id);
      changed = auxLevelOf(player, card.id) > before;
      break;
    }
    case 'primaryLevel': {
      if (player.primary && player.primary.id === card.id) {
        const before = player.primary.level;
        player.levelPrimary?.();
        changed = player.primary.level > before;
      }
      break;
    }
    case 'evolution': {
      // evolveAux swaps the source aux for the evolution in the same slot.
      if (!player.hasAux?.(card.id)) {
        player.evolveAux?.(card.id);
        changed = !!player.hasAux?.(card.id);
        if (changed) {
          w?.shake?.(0.35);
          w?.flash?.('#ffe08a', 0.25);
          w?.floatText?.(player.x, player.y - 78, 'EVOLVED!', { color: '#ff9b2f', size: 26, life: 1.8, crit: true });
        }
      }
      break;
    }
    case 'repair': {
      const amt = (player.stats?.maxHp ?? 100) * 0.3;
      const before = player.hp;
      if (w?.healPlayer) w.healPlayer(player, amt);
      else player.heal?.(amt);
      if (player.stats) player.steam = player.stats.steamMax;
      changed = player.hp !== before;
      break;
    }
    case 'cogs': {
      const run = w?.run || w?.game?.run;
      if (run) {
        const v = card.value ?? 40;
        run.cogs = (run.cogs || 0) + v;
        changed = true;
        try {
          w.fx?.cogs?.(player.x, player.y, 10);
        } catch {
          /* cosmetic */
        }
        w.floatText?.(player.x, player.y - 78, `+${v} cogs`, { color: '#ffcf4a', size: 18, life: 1.4 });
        w.sfx?.('pickup_cog', player.x, player.y);
      }
      break;
    }
    default:
      break;
  }
  player.recomputeStats?.();
  if (changed && card.kind !== 'evolution') celebrate(player, card, w);
  return changed;
}
