// Game modes, run modifiers, Endless generator, Daily Squall seeding, Gauntlet order (WP20).
// DESIGN §2.2, §4.8; engine semantics: docs/ENGINE.md §11.

import { RNG, dateSeed } from '../core/rng.js';
import { ENEMIES } from './enemies/index.js';
import { STAGES, G, groupEnd } from './stages.js';

const BOSS_CYCLE = ['ironMatriarch', 'kraken', 'stormEngine', 'behemoth', 'sunFurnace'];
const BIOME_CYCLE = ['brassbay', 'smog', 'tempest', 'aurora', 'furnace'];

// =============================================================================================
// Modifiers (Daily Squall; also usable via ?mods=a,b). Each mutates run.mods (DESIGN §2.2).
// kind: 'bane' (harder), 'boon' (easier), 'gamble' (both) — for UI tinting.
// =============================================================================================

const M = (id, name, desc, kind, icon, apply) => ({ id, name, desc, kind, icon, apply });

/** @type {Record<string, {id:string, name:string, desc:string, kind:string, icon:string, apply:(mods:any)=>void}>} */
export const MODIFIERS = {
  gale: M('gale', 'Gale Force', 'A howling crosswind shoves every hull about. Trim your sails.',
    'bane', 'icon_steam', (m) => { m.wind = Math.max(m.wind || 0, 1); }),
  glassCannon: M('glassCannon', 'Glass Cannon', 'Your guns hit twice as hard. So does everything else.',
    'gamble', 'icon_star', (m) => { m.playerDmg *= 2; m.playerDmgTaken *= 2; }),
  swarm: M('swarm', 'The Swarm', 'Half again as many foes, each one flimsier.',
    'gamble', 'icon_wave', (m) => { m.spawnRate *= 1.5; m.enemyHp *= 0.6; }),
  volatile: M('volatile', 'Volatile Skies', 'Every Syndicate hull bursts when it goes down. Mind the blast.',
    'bane', 'icon_bomb', (m) => { m.volatileAll = true; }),
  fog: M('fog', 'Pea-Souper', 'A thick yellow fog swallows the edges of the sky.',
    'bane', 'icon_steam', (m) => { m.fog = true; }),
  ironclad: M('ironclad', 'Ironclad Armada', 'Enemy hulls are 60% tougher, but shed 50% more aether.',
    'gamble', 'icon_hull', (m) => { m.enemyHp *= 1.6; m.xp *= 1.5; }),
  speedDemon: M('speedDemon', 'Speed Demons', 'Overdriven boilers: enemies and their shot fly 25% faster.',
    'bane', 'icon_clock', (m) => { m.enemySpeed *= 1.25; m.enemyBulletSpeed *= 1.25; }),
  richSkies: M('richSkies', 'Rich Skies', 'Double cogs from every wreck — but the guards hit 20% harder.',
    'gamble', 'icon_cog', (m) => { m.cogs *= 2; m.enemyDmg *= 1.2; }),
  lowBallast: M('lowBallast', 'Low Ballast', 'Launch with empty bomb racks; ballast drops three times as often.',
    'gamble', 'icon_bomb', (m) => { m.startBombs = 0; m.bombDrops *= 3; }),
  eliteHunt: M('eliteHunt', 'Elite Hunt', 'Gold-rimmed aces everywhere (+25% elite chance). Crates galore.',
    'gamble', 'icon_crate', (m) => { m.eliteChance += 0.25; }),
};

/** Pairs that never roll together in the Daily Squall (they cancel out or stack absurdly). */
const INCOMPATIBLE = [
  ['swarm', 'ironclad'],
  ['glassCannon', 'richSkies'],
  ['fog', 'volatile'],
];
const clash = (a, b) => INCOMPATIBLE.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

// =============================================================================================
// Daily Squall
// =============================================================================================

/** Seed for a calendar day (UTC) — identical for every player that day. */
export function dailySeed(date = new Date()) {
  return dateSeed(date);
}

/** 'YYYY-MM-DD' (UTC) for the given day — handy as a highscore key. */
export function dailyKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/** Two compatible modifier ids for a seed. */
function dailyModifiers(seed) {
  const r = new RNG((seed ^ 0x5bd1e995) >>> 0);
  const ids = r.shuffle(Object.keys(MODIFIERS));
  const first = ids[0];
  const second = ids.slice(1).find((id) => !clash(first, id));
  return second ? [first, second] : [first];
}

/**
 * Five stage indexes for a seed. The first four skies are shuffled (any order is possible, but
 * the voyage always opens in Brassbay or the Smog Wastes so a fresh hull never meets stage-4 iron
 * first, and it is never the plain campaign order); the Furnace Crown always stays the finale —
 * the Sun Furnace is the last boss.
 */
function dailyStages(seed) {
  const n = STAGES.length;
  if (n < 2) return [0];
  const r = new RNG((seed ^ 0x9e3779b9) >>> 0);
  const last = n - 1;
  const base = Array.from({ length: last }, (_, i) => i);
  let order = base;
  for (let tries = 0; tries < 24; tries++) {
    order = r.shuffle(base.slice());
    const plain = order.every((v, i) => v === i);
    if (order[0] <= 1 && !plain) break;
  }
  order.push(last);
  return order;
}

// =============================================================================================
// Endless Gale — generated waves
// =============================================================================================

/** Wave at which each enemy joins the Endless pool (aligned to the biome legs of 5 waves). */
const UNLOCK = {
  gyroScout: 1, gunboat: 2, kiteBomber: 3, balloonMine: 4,
  clockWasp: 6, flakIsland: 7, carrier: 8,
  teslaBuoy: 11, frigate: 12, ornithopter: 13,
  steamWraith: 16, mortarBarge: 17,
};

/** Threat cost per enemy (≈ how much it eats from the wave budget). */
const COST = {
  gyroScout: 1, balloonMine: 1, clockWasp: 2, kiteBomber: 2.5, teslaBuoy: 3, gunboat: 4,
  ornithopter: 5, steamWraith: 5, flakIsland: 7, mortarBarge: 8, frigate: 10, carrier: 12,
};

/** Biggest batch & biggest single group per type, and preferred formations. */
const SHAPE = {
  gyroScout: { batch: 12, max: 30, forms: ['ring', 'cluster', 'edge', 'behind'] },
  balloonMine: { batch: 14, max: 28, forms: ['ring', 'cluster'] },
  clockWasp: { batch: 10, max: 24, forms: ['cluster', 'ring', 'flank'] },
  kiteBomber: { batch: 6, max: 12, forms: ['line', 'flank'] },
  teslaBuoy: { batch: 6, max: 12, forms: ['pair'] },
  gunboat: { batch: 4, max: 10, forms: ['pair', 'flank', 'edge'] },
  ornithopter: { batch: 4, max: 8, forms: ['flank', 'edge', 'front'] },
  steamWraith: { batch: 6, max: 10, forms: ['cluster', 'ring', 'edge'] },
  flakIsland: { batch: 2, max: 3, forms: ['edge', 'flank'] },
  mortarBarge: { batch: 2, max: 3, forms: ['flank', 'front'] },
  frigate: { batch: 2, max: 3, forms: ['front', 'flank'] },
  carrier: { batch: 1, max: 2, forms: ['front', 'flank', 'behind'] },
};

/** Per-wave cap for the heavies (they're slow to kill and fill the screen with fire). */
function heavyCap(type, i) {
  switch (type) {
    case 'carrier': return Math.min(4, 1 + Math.floor((i - 8) / 10));
    case 'frigate': return Math.min(5, 2 + Math.floor((i - 12) / 8));
    case 'mortarBarge': return Math.min(5, 2 + Math.floor((i - 17) / 8));
    case 'flakIsland': return Math.min(5, 2 + Math.floor((i - 7) / 10));
    case 'ornithopter': return Math.min(10, 4 + Math.floor((i - 13) / 5));
    case 'steamWraith': return Math.min(14, 6 + Math.floor((i - 16) / 4));
    default: return 60;
  }
}

/** Light units suitable for the trickle. */
const TRICKLE_W = { gyroScout: 3, clockWasp: 1.2, kiteBomber: 0.8, balloonMine: 0.8, gunboat: 0.6, steamWraith: 0.4, ornithopter: 0.3 };

/** Native enemies get extra weight in their home biome. */
const NATIVE = {
  brassbay: ['gyroScout', 'kiteBomber', 'balloonMine', 'gunboat'],
  smog: ['clockWasp', 'flakIsland', 'carrier'],
  tempest: ['teslaBuoy', 'frigate', 'ornithopter'],
  aurora: ['steamWraith', 'mortarBarge'],
  furnace: ['frigate', 'mortarBarge', 'carrier', 'ornithopter', 'steamWraith', 'flakIsland'],
};

const MIXED_NAMES = {
  brassbay: ['Syndicate Patrol', 'Raiders Aloft', 'Harbor Skirmish', 'Brass Tacks', 'Morning Raid'],
  smog: ['Soot & Iron', 'Chimney Sweep', 'Factory Shift', 'Smoke Screen', 'Night Shift'],
  tempest: ['Squall Line', 'Thunderhead', 'Rough Weather', 'Storm Front', 'Crosswinds'],
  aurora: ['Cold Front', 'Polar Patrol', 'Starlit Raid', 'Frostbite', 'Northern Lights'],
  furnace: ['Into the Forge', 'Slag Run', 'White Heat', 'Bellows Blast', 'Crucible'],
};

/** Total wave budget (threat units) for endless wave i (1-based). */
export function endlessBudget(i) {
  const k = Math.max(0, i - 1);
  return Math.min(320, 22 + 6 * k + 0.08 * k * k);
}

const known = (t) => !Object.keys(ENEMIES).length || !!ENEMIES[t];
const unlockedTypes = (i) => Object.keys(UNLOCK).filter((t) => UNLOCK[t] <= i && known(t));

/**
 * Set-piece themes. `feature(ctx)` adds the star groups and returns nothing; the generator fills
 * the rest of the budget with a mix. `min` = first wave it can appear.
 */
const THEMES = [
  { id: 'scoutSwarm', name: 'Scout Swarm', min: 1, w: 1, feature: (c) => c.spend('gyroScout', 0.6, 'ring') },
  { id: 'gunline', name: 'Gunboat Line', min: 3, w: 0.8, feature: (c) => c.spend('gunboat', 0.5, 'pair') },
  { id: 'kiteRuns', name: 'Kite-Bomber Runs', min: 3, w: 0.8, feature: (c) => c.spend('kiteBomber', 0.5, 'line') },
  { id: 'mineField', name: 'Mine Field', min: 4, w: 1, feature: (c) => {
    c.spend('balloonMine', 0.3, 'ring', 0.5);
    c.spend('balloonMine', 0.25, 'ring', 0.15);
  } },
  { id: 'waspSwarm', name: 'Wasp Swarm', min: 6, w: 1.2, feature: (c) => c.spend('clockWasp', 0.6, 'ring') },
  { id: 'flakAlley', name: 'Flak Alley', min: 8, w: 0.6, feature: (c) => c.spend('flakIsland', 0.4, 'edge') },
  { id: 'carrierWave', name: 'Carrier Wave', min: 9, w: 1, feature: (c) => c.spend('carrier', 0.5, 'flank') },
  { id: 'eliteSquadron', name: 'Elite Squadron', min: 9, w: 0.9, feature: (c) => c.eliteSquad(0.45) },
  { id: 'teslaGauntlet', name: 'Tesla Gauntlet', min: 11, w: 1.2, feature: (c) => c.spend('teslaBuoy', 0.5, 'pair') },
  { id: 'ironcladLine', name: 'Ironclad Line', min: 13, w: 0.9, feature: (c) => c.spend('frigate', 0.45, 'flank') },
  { id: 'aceSquadron', name: 'Ace Squadron', min: 14, w: 0.9, feature: (c) => c.spend('ornithopter', 0.5, 'flank') },
  { id: 'wraithFog', name: 'Wraith Fog', min: 16, w: 1.2, feature: (c) => {
    c.spend('steamWraith', 0.45, 'ring');
    c.spend('balloonMine', 0.12, 'cluster');
  } },
  { id: 'bombardment', name: 'Bombardment', min: 18, w: 0.9, feature: (c) => {
    c.spend('mortarBarge', 0.3, 'flank');
    c.spend('flakIsland', 0.2, 'edge');
  } },
];

const DEBUT_NAMES = {
  gunboat: 'Gunboats Sighted', kiteBomber: 'Kites on the Wind', balloonMine: 'Balloons Aloft',
  clockWasp: 'The Hive Stirs', flakIsland: 'Flak Batteries', carrier: 'Carrier Wave',
  teslaBuoy: 'Lightning Rods', frigate: 'Ironclads', ornithopter: 'Aces High',
  steamWraith: 'Phantoms', mortarBarge: 'Mortar Line',
};

/**
 * Build one endless wave (ENGINE §11 format). Deterministic for a given rng state.
 * @param {number} i 1-based endless wave number
 * @param {RNG} rng
 * @param {any} [run]
 */
export function makeEndlessWave(i, rng, run) {
  i = Math.max(1, Math.floor(i) || 1);
  rng = rng || new RNG(i * 7919);
  const biome = biomeFor(i);
  const types = unlockedTypes(i);
  if (!types.length) types.push('gyroScout');
  const duration = Math.min(45, 34 + i * 0.5);
  const maxAlive = Math.min(90, 40 + i * 2);
  const budget = endlessBudget(i);
  const groups = [];
  const used = {};
  let left = budget;
  // Slots: start times spread across the wave so the pressure is continuous.
  const lastStart = duration - 5;
  let slot = 0;
  const nextStart = () => {
    const t = slot === 0 ? 0.5 + rng.next() * 1.5 : Math.min(lastStart, 3 + (slot - 1) * 4.2 + rng.next() * 2.5);
    slot++;
    return Math.round(t * 10) / 10;
  };
  const eliteAffix = () => {
    if (i < 14) return true;
    return rng.pick([true, 'armored', 'overclocked', 'volatile']);
  };

  /** Add groups of `type` worth `frac` of the budget; `when` (0..1) pins the start time. */
  const add = (type, frac, form, when, elite) => {
    if (!types.includes(type)) return 0;
    const cost = COST[type] || 3;
    const shape = SHAPE[type] || { batch: 2, max: 6, forms: ['edge'] };
    const cap = Math.min(shape.max, heavyCap(type, i) - (used[type] || 0));
    let count = Math.min(cap, Math.max(1, Math.round((budget * frac) / cost)));
    if (type === 'teslaBuoy' && count % 2) count = count > 1 ? count - 1 : 2;
    if (count < 1 || cost * count > left + cost * 2) return 0;
    let formation = form || rng.pick(shape.forms);
    if (formation === 'pair' && count < 2) formation = 'flank';
    // Rings & lines look best spawned all at once; others come in batches.
    let batch = formation === 'ring' || formation === 'line' ? count : Math.ceil(count / rng.int(1, 3));
    batch = Math.max(1, Math.min(batch, shape.batch, maxAlive - 4));
    if (formation === 'pair' && batch % 2) batch = batch + 1 <= Math.min(count, shape.batch) ? batch + 1 : Math.max(2, batch - 1);
    const batches = Math.ceil(count / batch);
    const start = when !== undefined ? Math.round(when * lastStart * 10) / 10 : nextStart();
    const window = Math.max(0, lastStart - start);
    const every = batches > 1 ? Math.max(1, Math.min(8, window / (batches - 1))) : 1;
    const g = G(type, count, start, Math.round(every * 10) / 10, batch, formation, elite);
    if (groupEnd(g) > duration - 2) g.every = Math.max(0.5, (duration - 2 - start) / Math.max(1, batches - 1));
    groups.push(g);
    used[type] = (used[type] || 0) + count;
    left -= cost * count;
    return count;
  };

  const ctx = {
    spend: (type, frac, form, when) => add(type, frac, form, when),
    eliteSquad: (frac) => {
      const pool = types.filter((t) => COST[t] >= 2 && COST[t] <= 10 && t !== 'balloonMine' && t !== 'teslaBuoy');
      const picks = rng.shuffle(pool.slice()).slice(0, Math.min(3, pool.length));
      for (const t of picks) {
        const n = Math.max(1, Math.min(4, Math.round((budget * frac) / picks.length / (COST[t] * 2.5))));
        const shape = SHAPE[t];
        const g = G(t, n, nextStart(), 1, n, rng.pick(shape.forms.filter((f) => f !== 'pair')) || 'flank', eliteAffix());
        if (g.batch > shape.batch) g.batch = shape.batch;
        const batches = Math.ceil(n / g.batch);
        g.every = batches > 1 ? Math.max(1, Math.min(8, (lastStart - g.start) / (batches - 1))) : 1;
        groups.push(g);
        used[t] = (used[t] || 0) + n;
        left -= COST[t] * 2.5 * n;
      }
    },
  };

  // ---- pick a theme -------------------------------------------------------------------------
  const st = run ? (run.endlessGen = run.endlessGen || { last: null }) : { last: null };
  const debut = types.find((t) => UNLOCK[t] === i && t !== 'gyroScout');
  let name;
  let setPiece = false;
  if (debut) {
    // Showcase: the newcomer is the star, introduced in two waves of its own.
    name = DEBUT_NAMES[debut] || 'New Contact';
    add(debut, 0.18, undefined, 0.02);
    add(debut, 0.22, undefined, 0.55);
    st.last = `debut:${debut}`;
  } else {
    const preBoss = i % 5 === 4;
    const avail = THEMES.filter((t) => i >= t.min && t.id !== st.last && themeOk(t, types));
    let theme = null;
    if (preBoss && i >= 9 && avail.some((t) => t.id === 'eliteSquadron') && rng.chance(0.5)) {
      theme = avail.find((t) => t.id === 'eliteSquadron');
    } else if (i > 1 && rng.chance(Math.min(0.75, 0.4 + i * 0.015))) {
      theme = rng.weighted(avail, (t) => t.w * (NATIVE[biome]?.includes(THEME_STAR[t.id]) ? 1.6 : 1));
    }
    if (theme) {
      theme.feature(ctx);
      name = theme.name;
      setPiece = true;
      st.last = theme.id;
    } else {
      name = preBoss ? 'Gathering Storm' : rng.pick(MIXED_NAMES[biome] || MIXED_NAMES.brassbay);
      st.last = 'mixed';
    }
  }

  // ---- opening punch: a ring of fodder so the wave starts with action -------------------------
  if (slot === 0 || rng.chance(0.6)) {
    const fodder = types.includes('clockWasp') && rng.chance(0.35) ? 'clockWasp' : 'gyroScout';
    add(fodder, Math.min(0.25, 10 / budget + 0.08), 'ring', 0);
  }

  // ---- fill the rest of the budget with a weighted mix ----------------------------------------
  const weights = {};
  for (const t of types) {
    let w = 1 / Math.sqrt(COST[t] || 3);
    if (NATIVE[biome]?.includes(t)) w *= 2;
    // Fresh arrivals show up more for a few waves, then settle.
    if (i - UNLOCK[t] < 4) w *= 1.5;
    weights[t] = w;
  }
  let guard = 0;
  while (left > budget * 0.12 && guard++ < 12) {
    const t = rng.weightedKey(weights);
    if (!t) break;
    if ((used[t] || 0) >= heavyCap(t, i)) {
      delete weights[t];
      if (!Object.keys(weights).length) break;
      continue;
    }
    const got = add(t, rng.range(0.08, 0.2), undefined, undefined, i >= 9 && rng.chance(Math.min(0.35, i * 0.012)) ? eliteAffix() : undefined);
    if (!got) delete weights[t];
    if (!Object.keys(weights).length) break;
  }

  // Elites rise: past wave 20 every wave also brings a lone elite heavy.
  if (i >= 20) {
    const heavy = types.filter((t) => COST[t] >= 7 && (used[t] || 0) < heavyCap(t, i));
    if (heavy.length) {
      const t = rng.pick(heavy);
      groups.push(G(t, 1, Math.round(lastStart * 0.6), 1, 1, rng.pick(SHAPE[t].forms), eliteAffix()));
    }
  }

  groups.sort((a, b) => a.start - b.start);
  const pool = {};
  for (const t of types) if (TRICKLE_W[t]) pool[t] = TRICKLE_W[t] * (NATIVE[biome]?.includes(t) ? 1.5 : 1);
  return {
    name,
    duration,
    maxAlive,
    groups,
    trickle: { pool, every: Math.max(1.5, 3.2 - i * 0.045) },
    setPiece,
    budget: Math.round(budget),
  };
}

/** The enemy each theme is built around (theme needs it unlocked; native biome boost). */
const THEME_STAR = {
  scoutSwarm: 'gyroScout', gunline: 'gunboat', kiteRuns: 'kiteBomber', mineField: 'balloonMine',
  waspSwarm: 'clockWasp', flakAlley: 'flakIsland', carrierWave: 'carrier', teslaGauntlet: 'teslaBuoy',
  ironcladLine: 'frigate', aceSquadron: 'ornithopter', wraithFog: 'steamWraith', bombardment: 'mortarBarge',
};

function themeOk(theme, types) {
  const need = THEME_STAR[theme.id];
  return !need || types.includes(need);
}

/** Endless boss for wave `i`, or null. Every 5th wave; the five bosses cycle. */
export function bossFor(i) {
  return i > 0 && i % 5 === 0 ? BOSS_CYCLE[(i / 5 - 1) % BOSS_CYCLE.length] : null;
}

/** Biome for endless wave `i`: one 5-wave leg per biome, changing after each boss. */
export function biomeFor(i) {
  return BIOME_CYCLE[Math.floor(Math.max(0, i - 1) / 5) % BIOME_CYCLE.length];
}

/** Stage def for endless wave `i`: biome look + scaling that keeps climbing forever. */
function endlessStage(i) {
  const biome = biomeFor(i);
  const base = STAGES.find((s) => s.biome === biome || s.id === biome) || STAGES[0];
  const k = Math.max(0, i - 1);
  const leg = Math.floor(k / 5) + 1;
  return {
    ...base,
    waves: [],
    boss: null,
    subtitle: `Endless Gale — leg ${leg}`,
    hpMult: 1 + 0.12 * k + 0.0045 * k * k,
    dmgMult: Math.min(3.2, 1 + 0.03 * k),
    xpMult: 1 + 0.05 * k,
    eliteChance: Math.min(0.35, 0.02 + 0.0065 * k),
    // Keeps climbing with the waves instead of resetting with the biome cycle every 25 waves.
    fireRate: Math.max(base.fireRate ?? 1, Math.min(1.45, 1 + 0.018 * k)),
    leg,
  };
}

/** Endless boss hp multiplier: gentle within the first cycle, then a big step per full cycle. */
function endlessBossHp(i) {
  const n = Math.max(1, Math.floor(i / 5)); // boss number, 1-based
  const cycle = Math.floor((n - 1) / BOSS_CYCLE.length);
  return (1 + 0.05 * (n - 1)) * (1 + 1.2 * cycle);
}

// =============================================================================================
// Modes
// =============================================================================================

export const MODES = {
  campaign: {
    id: 'campaign',
    name: 'The Grand Voyage',
    desc: 'Five stages, five bosses, one airship. Sail from Brassbay to the Furnace Crown.',
    tagline: 'The campaign',
    icon: 'icon_mode_campaign',
    rules: ['5 stages of 5 waves', 'A boss ends every stage', 'Refit between stages'],
    stages: () => STAGES.map((_, i) => i),
    unlocked: () => true,
  },

  endless: {
    id: 'endless',
    name: 'Endless Gale',
    desc: 'Generated waves forever. A boss every fifth wave, a new sky after each one.',
    tagline: 'How far can you sail?',
    icon: 'icon_mode_endless',
    endless: true,
    rules: ['Waves grow without end', 'Boss every 5th wave', 'Bosses return stronger each cycle'],
    unlocked: () => true,
    makeWave: (index, rng, run) => makeEndlessWave(index, rng, run),
    bossFor,
    biomeFor,
    stageFor: (index) => endlessStage(index),
    bossHpMult: (index) => endlessBossHp(index),
  },

  daily: {
    id: 'daily',
    name: 'Daily Squall',
    desc: 'One seeded voyage a day: the five skies in a new order, two twists, one best score.',
    tagline: 'Same storm for everyone',
    icon: 'icon_mode_daily',
    rules: ['Shuffled stage order', '2 modifiers', 'One local best per day'],
    unlocked: () => true,
    seed: (date = new Date()) => dailySeed(date),
    key: (date = new Date()) => dailyKey(date),
    modifiers: (seed) => dailyModifiers(seed >>> 0),
    stages: (seed) => dailyStages(seed >>> 0),
    /** Everything about one day's squall (UI convenience). */
    describe(date = new Date()) {
      const seed = dailySeed(date);
      const mods = dailyModifiers(seed);
      return {
        seed, key: dailyKey(date), modifiers: mods,
        modifierDefs: mods.map((id) => MODIFIERS[id]).filter(Boolean),
        stages: dailyStages(seed),
      };
    },
  },

  bossRush: {
    id: 'bossRush',
    name: 'Gauntlet of Iron',
    desc: 'All five bosses back to back, with a refit between each. No waves, no mercy.',
    tagline: 'Unlocked by finishing the Grand Voyage',
    icon: 'icon_mode_bossRush',
    rules: ['5 bosses in a row', 'Refit after each', 'Boss hulls trimmed for a fresh ship'],
    bosses: BOSS_CYCLE.slice(),
    // No waves means few level-ups (start at L8, ~1 level per titan) and no Armory Crates: bosses
    // are trimmed against their campaign toughness (tuning.js, balanced for full-campaign builds)
    // so each fight runs ~2–3 min (measured with the autopilot).
    bossHpMult: (i) => [0.6, 0.55, 0.37, 0.18, 0.15][i] ?? 0.15,
    /** The engine grants these level-up picks at run start (game.startRun). */
    startLevel: 8,
    // Set by game.endRun on a campaign victory (a Daily Squall win does not count).
    unlocked: (save) => !!save?.unlocks?.bossRush,
  },
};

export const MODE_ORDER = ['campaign', 'endless', 'daily', 'bossRush'];
