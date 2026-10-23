// Stages & hand-tuned waves (WP20). Format: DESIGN §4.8, engine semantics: docs/ENGINE.md §11.
//
// Each stage = 5 waves (~35–45 s) → boss. Pacing rules used throughout:
//  - A wave's groups are scheduled so the last batch lands ≥ ~4 s before `duration`, so a wave
//    ends shortly after its timer once the sky is clear (the director also force-ends it 25 s
//    after `duration` — nothing can stall).
//  - Every new enemy gets a showcase wave where it is the star, then joins the mix.
//  - Set-pieces ('Mine Field', 'Wasp Swarm', 'Carrier Wave', 'Tesla Gauntlet', 'Elite Squadron',
//    'Wraith Fog') are flagged `setPiece` and announced by name (the director shows `wave.name`).
//  - `batch` is always ≤ `maxAlive` (a bigger batch could never spawn). `validateStages()` checks
//    this and more; the preview page tests/preview/stages-timeline.html renders every schedule.

/** Enemy ids the stages may reference (DESIGN §2.10). */
export const ENEMY_IDS = [
  'gyroScout', 'kiteBomber', 'balloonMine', 'gunboat', 'clockWasp', 'flakIsland',
  'carrier', 'teslaBuoy', 'frigate', 'ornithopter', 'steamWraith', 'mortarBarge',
];

/** Per-stage scaling (DESIGN §2.10; mid stages nudged up in integration play-tests so foes live
 *  long enough to shoot back — the player's build snowballs fastest through stages 2–4). */
const HP_MULT = [1, 1.75, 2.9, 4.1, 5.2];
const DMG_MULT = [1, 1.15, 1.3, 1.5, 1.7];
const XP_MULT = [1, 1.2, 1.4, 1.6, 1.8];
const ELITE_CHANCE = [0.02, 0.04, 0.06, 0.08, 0.12];
/** Regular enemies shoot faster in later stages (run.enemyFireRate; bosses are exempt). */
const FIRE_RATE = [1, 1.1, 1.22, 1.3, 1.35];

/**
 * Spawn group helper.
 * @param {string} type enemy id
 * @param {number} count total to spawn (× run.mods.spawnRate)
 * @param {number} at first spawn time (s into the wave)
 * @param {number} every seconds between batches
 * @param {number} batch enemies per batch (spawned together in one formation)
 * @param {string} [formation] edge | ring | line | cluster | flank | pair | front | behind
 * @param {boolean|string} [elite] force elites: true | 'armored' | 'overclocked' | 'volatile'
 */
export function G(type, count, at, every, batch, formation = 'edge', elite) {
  const g = { type, count, start: at, every, batch, formation };
  if (elite) g.elite = elite;
  return g;
}

/**
 * Wave helper.
 * @param {string} name announced under "Wave N"
 * @param {number} duration seconds of scheduled spawning
 * @param {number} maxAlive concurrency cap for this wave
 * @param {object[]} groups G(...) entries
 * @param {Record<string, number>|null} pool trickle weights (null = no trickle)
 * @param {number} [every] trickle interval
 * @param {{setPiece?: boolean, desc?: string}} [extra]
 */
export function W(name, duration, maxAlive, groups, pool, every = 3, extra = {}) {
  const w = { name, duration, maxAlive, groups };
  if (pool) w.trickle = { pool, every };
  return Object.assign(w, extra);
}

const SET = (desc) => ({ setPiece: true, desc });
const D = (desc) => ({ desc });

// ---------------------------------------------------------------------------------------------
// Stage 1 — Brassbay Skies. Gentle onboarding: scouts → gunboats → mines → kites → mixed.
// ---------------------------------------------------------------------------------------------
const BRASSBAY_WAVES = [
  W('Scouting Party', 35, 40, [
    G('gyroScout', 3, 1.5, 4, 3, 'front'),
    G('gyroScout', 8, 8, 3, 2, 'edge'),
    G('gyroScout', 10, 18, 4, 5, 'ring'),
    G('gyroScout', 6, 28, 1, 6, 'cluster'),
  ], { gyroScout: 1 }, 3.5, D('A handful of gyro scouts test your guns.')),

  W('Gunboat Picket', 38, 45, [
    G('gunboat', 1, 2, 1, 1, 'front'),
    G('gyroScout', 8, 4, 4, 4, 'cluster'),
    G('gunboat', 2, 11, 1, 2, 'flank'),
    G('gyroScout', 10, 16, 3, 2, 'edge'),
    G('gunboat', 4, 22, 3, 2, 'edge'),
    G('gyroScout', 8, 29, 1, 8, 'ring'),
  ], { gyroScout: 3, gunboat: 0.6 }, 3, D('Pirate gunboats hold their range and lob three-shot spreads.')),

  W('Mine Field', 40, 45, [
    G('balloonMine', 10, 2, 1, 10, 'ring'),
    G('gyroScout', 6, 7, 4, 2, 'edge'),
    G('balloonMine', 12, 12, 4, 4, 'cluster'),
    G('gunboat', 3, 17, 5, 1, 'edge'),
    G('balloonMine', 14, 27, 1, 14, 'ring'),
    G('gyroScout', 6, 31, 2, 3, 'behind'),
  ], { balloonMine: 2, gyroScout: 2 }, 3, SET('Drifting balloon mines close in from every side — shoot a lane through.')),

  W('Kite-Bomber Runs', 40, 45, [
    G('kiteBomber', 3, 2, 1, 3, 'line'),
    G('gyroScout', 6, 6, 4, 3, 'cluster'),
    G('kiteBomber', 4, 12, 4, 2, 'flank'),
    G('gunboat', 3, 14, 7, 1, 'edge'),
    G('kiteBomber', 5, 24, 1, 5, 'line'),
    G('balloonMine', 6, 28, 1, 6, 'ring'),
    G('kiteBomber', 4, 32, 2, 2, 'flank'),
  ], { gyroScout: 3, kiteBomber: 1 }, 3, D('Kite bombers strafe across the sky, salting your path with fused bombs.')),

  W('Harbor Blockade', 45, 60, [
    G('gyroScout', 12, 0.5, 1, 12, 'ring'),
    G('gunboat', 6, 5, 6, 2, 'flank'),
    G('balloonMine', 8, 10, 8, 4, 'cluster'),
    G('kiteBomber', 6, 15, 9, 3, 'line'),
    G('gunboat', 1, 24, 1, 1, 'front', true),
    G('gyroScout', 12, 30, 3, 6, 'ring'),
    G('kiteBomber', 4, 36, 1, 4, 'flank'),
  ], { gyroScout: 4, kiteBomber: 1, balloonMine: 1, gunboat: 0.5 }, 2.4,
  D('Everything Brassbay can throw at you — and a gold-rimmed gunboat captain.')),
];

// ---------------------------------------------------------------------------------------------
// Stage 2 — The Smog Wastes. Introduces clockWasp, flakIsland, carrier.
// ---------------------------------------------------------------------------------------------
const SMOG_WAVES = [
  W('Clockwork Wasps', 38, 50, [
    G('clockWasp', 3, 2, 1, 3, 'cluster'),
    G('gyroScout', 8, 5, 4, 4, 'edge'),
    G('clockWasp', 4, 12, 3, 2, 'flank'),
    G('gunboat', 2, 17, 1, 2, 'pair'),
    G('clockWasp', 6, 24, 1, 6, 'ring'),
    G('gyroScout', 8, 29, 2, 4, 'cluster'),
  ], { gyroScout: 3, clockWasp: 1 }, 3, D('Wasps paint a red line before they dash — sidestep, then punish.')),

  W('Flak Batteries', 40, 50, [
    G('flakIsland', 1, 2, 1, 1, 'front'),
    G('gyroScout', 8, 4, 4, 4, 'cluster'),
    G('clockWasp', 4, 10, 6, 2, 'edge'),
    G('flakIsland', 2, 16, 1, 2, 'flank'),
    G('kiteBomber', 4, 21, 5, 2, 'line'),
    G('gunboat', 2, 27, 3, 1, 'edge'),
    G('gyroScout', 10, 31, 1, 10, 'ring'),
  ], { gyroScout: 3, clockWasp: 1, gunboat: 0.5 }, 3,
  D('Floating rock batteries burst flak where you stand. Keep moving.')),

  W('Wasp Swarm', 40, 60, [
    G('clockWasp', 8, 1.5, 1, 8, 'ring'),
    G('clockWasp', 10, 9, 3, 5, 'cluster'),
    G('gyroScout', 10, 13, 4, 5, 'edge'),
    G('clockWasp', 12, 21, 1, 12, 'ring'),
    G('balloonMine', 8, 26, 1, 8, 'cluster'),
    G('clockWasp', 8, 31, 2, 4, 'flank'),
  ], { clockWasp: 3, gyroScout: 2 }, 2.5, SET('A clockwork hive breaks open — dozens of dashing stingers.')),

  W('Carrier Wave', 42, 65, [
    G('carrier', 1, 2, 1, 1, 'front'),
    G('gunboat', 2, 5, 1, 2, 'flank'),
    G('kiteBomber', 4, 12, 6, 2, 'line'),
    G('carrier', 2, 18, 1, 2, 'flank'),
    G('clockWasp', 6, 24, 4, 3, 'cluster'),
    G('flakIsland', 1, 28, 1, 1, 'behind'),
    G('gyroScout', 8, 33, 1, 8, 'ring'),
  ], { gyroScout: 2, gunboat: 0.6 }, 3.5,
  SET('Zeppelin carriers lumber through, spilling scouts from their hangars.')),

  W('Smokestack Siege', 45, 65, [
    G('gyroScout', 12, 0.5, 1, 12, 'ring'),
    G('flakIsland', 2, 4, 14, 1, 'edge'),
    G('clockWasp', 8, 8, 6, 4, 'cluster'),
    G('carrier', 1, 14, 1, 1, 'front'),
    G('gunboat', 4, 18, 6, 2, 'pair'),
    G('clockWasp', 3, 26, 1, 3, 'flank', 'overclocked'),
    G('balloonMine', 10, 30, 1, 10, 'ring'),
    G('kiteBomber', 6, 34, 2, 3, 'line'),
  ], { gyroScout: 3, clockWasp: 1.5, kiteBomber: 1, gunboat: 0.6 }, 2.2,
  D('The whole factory fleet lifts off, led by overclocked wasp aces.')),
];

// ---------------------------------------------------------------------------------------------
// Stage 3 — Tempest Reach. Introduces teslaBuoy, frigate, ornithopter.
// ---------------------------------------------------------------------------------------------
const TEMPEST_WAVES = [
  W('Lightning Rods', 38, 55, [
    G('teslaBuoy', 2, 2, 1, 2, 'pair'),
    G('gyroScout', 10, 4, 4, 5, 'edge'),
    G('teslaBuoy', 4, 13, 1, 4, 'pair'),
    G('gunboat', 3, 18, 4, 1, 'edge'),
    G('clockWasp', 6, 23, 4, 3, 'cluster'),
    G('teslaBuoy', 4, 28, 1, 4, 'pair'),
    G('gyroScout', 8, 32, 1, 8, 'ring'),
  ], { gyroScout: 3, clockWasp: 1 }, 3, D('Linked Tesla buoys stretch crackling arcs across the sky — never fly between them.')),

  W('Ironclad Frigates', 40, 55, [
    G('frigate', 1, 2, 1, 1, 'front'),
    G('gyroScout', 10, 5, 4, 5, 'cluster'),
    G('kiteBomber', 4, 10, 6, 2, 'line'),
    G('frigate', 2, 17, 1, 2, 'flank'),
    G('teslaBuoy', 2, 22, 1, 2, 'pair'),
    G('gunboat', 4, 26, 3, 2, 'edge'),
    G('clockWasp', 6, 31, 1, 6, 'ring'),
  ], { gyroScout: 3, gunboat: 1, kiteBomber: 0.6 }, 3,
  D('Frigates turn broadside to unleash five-ball volleys. Get under their guns.')),

  W('Ornithopter Aces', 40, 55, [
    G('ornithopter', 2, 2, 1, 2, 'front'),
    G('gyroScout', 8, 5, 5, 4, 'edge'),
    G('ornithopter', 4, 12, 4, 2, 'flank'),
    G('clockWasp', 8, 17, 5, 4, 'cluster'),
    G('ornithopter', 4, 26, 1, 4, 'ring'),
    G('flakIsland', 1, 30, 1, 1, 'edge'),
    G('gyroScout', 8, 33, 1, 8, 'ring'),
  ], { gyroScout: 3, clockWasp: 1, ornithopter: 0.3 }, 3,
  D('Fast, cocky aces that sidestep your shots. Lead your aim.')),

  W('Tesla Gauntlet', 42, 65, [
    G('teslaBuoy', 6, 1.5, 1, 6, 'pair'),
    G('gyroScout', 10, 4, 4, 5, 'cluster'),
    G('teslaBuoy', 6, 11, 4, 2, 'pair'),
    G('ornithopter', 3, 15, 5, 1, 'edge'),
    G('teslaBuoy', 8, 23, 1, 8, 'pair'),
    G('balloonMine', 10, 27, 1, 10, 'ring'),
    G('clockWasp', 6, 32, 2, 3, 'flank'),
  ], { gyroScout: 3, teslaBuoy: 0.6, clockWasp: 1 }, 3,
  SET('A lattice of lightning closes in. Thread the arcs or cut the buoys down.')),

  W('Storm Fleet', 45, 75, [
    G('gyroScout', 14, 0.5, 1, 14, 'ring'),
    G('frigate', 2, 4, 14, 1, 'front'),
    G('ornithopter', 4, 8, 6, 2, 'flank'),
    G('teslaBuoy', 4, 12, 10, 2, 'pair'),
    G('carrier', 1, 16, 1, 1, 'edge'),
    G('frigate', 1, 22, 1, 1, 'behind', 'armored'),
    G('clockWasp', 10, 26, 4, 5, 'cluster'),
    G('kiteBomber', 6, 34, 1, 6, 'line'),
  ], { gyroScout: 3, clockWasp: 1.2, ornithopter: 0.5, gunboat: 1 }, 2.2,
  D('The Syndicate storm fleet, flagged by an armored ironclad.')),
];

// ---------------------------------------------------------------------------------------------
// Stage 4 — The Aurora Drift. Introduces steamWraith, mortarBarge.
// ---------------------------------------------------------------------------------------------
const AURORA_WAVES = [
  W('Phantoms in the Snow', 40, 60, [
    G('steamWraith', 2, 2, 1, 2, 'cluster'),
    G('gyroScout', 10, 5, 4, 5, 'edge'),
    G('steamWraith', 4, 13, 4, 2, 'flank'),
    G('clockWasp', 6, 18, 5, 3, 'cluster'),
    G('steamWraith', 6, 26, 1, 6, 'ring'),
    G('gunboat', 3, 30, 2, 1, 'edge'),
    G('gyroScout', 10, 34, 1, 10, 'ring'),
  ], { gyroScout: 3, clockWasp: 1, steamWraith: 0.3 }, 3,
  D('Steam wraiths phase out, then rematerialize beside you with a ring of shot.')),

  W('Mortar Line', 40, 60, [
    G('mortarBarge', 1, 2, 1, 1, 'front'),
    G('gunboat', 4, 4, 5, 2, 'pair'),
    G('kiteBomber', 6, 9, 6, 3, 'line'),
    G('mortarBarge', 2, 16, 1, 2, 'flank'),
    G('gyroScout', 12, 20, 4, 6, 'cluster'),
    G('mortarBarge', 2, 28, 1, 2, 'line'),
    G('ornithopter', 3, 32, 1, 3, 'flank'),
  ], { gyroScout: 3, gunboat: 1, kiteBomber: 0.8 }, 3,
  D('Distant barges lob shells at where you are — so be somewhere else.')),

  W('Elite Squadron', 42, 60, [
    G('gyroScout', 12, 1, 6, 6, 'ring'),
    G('ornithopter', 4, 4, 1, 4, 'flank', 'overclocked'),
    G('gunboat', 3, 12, 1, 3, 'flank', 'armored'),
    G('clockWasp', 8, 17, 4, 4, 'cluster'),
    G('frigate', 1, 22, 1, 1, 'front', 'volatile'),
    G('steamWraith', 2, 27, 1, 2, 'cluster', true),
    G('gyroScout', 10, 33, 1, 10, 'ring'),
  ], { gyroScout: 3, clockWasp: 1 }, 3,
  SET('The Admiral’s honour guard: gold-rimmed aces, each one carrying an Armory Crate.')),

  W('Wraith Fog', 42, 70, [
    G('steamWraith', 4, 1.5, 1, 4, 'ring'),
    G('balloonMine', 12, 4, 1, 12, 'ring'),
    G('steamWraith', 6, 11, 4, 2, 'edge'),
    G('clockWasp', 8, 15, 6, 4, 'cluster'),
    G('steamWraith', 6, 24, 1, 6, 'ring'),
    G('mortarBarge', 1, 27, 1, 1, 'behind'),
    G('balloonMine', 10, 30, 1, 10, 'cluster'),
    G('steamWraith', 4, 34, 1, 4, 'flank'),
  ], { steamWraith: 1, balloonMine: 2, gyroScout: 2 }, 2.6,
  SET('Freezing fog rolls in. Phantoms everywhere, mines in the murk.')),

  W('Aurora Armada', 45, 80, [
    G('gyroScout', 14, 0.5, 1, 14, 'ring'),
    G('mortarBarge', 2, 3, 12, 1, 'edge'),
    G('frigate', 2, 7, 12, 1, 'flank'),
    G('steamWraith', 6, 10, 6, 2, 'cluster'),
    G('ornithopter', 4, 14, 8, 2, 'flank'),
    G('carrier', 1, 18, 1, 1, 'front'),
    G('teslaBuoy', 4, 22, 1, 4, 'pair'),
    G('flakIsland', 2, 26, 1, 2, 'flank'),
    G('clockWasp', 12, 30, 2, 6, 'ring'),
  ], { gyroScout: 3, clockWasp: 1.2, steamWraith: 0.6, gunboat: 1, kiteBomber: 0.8 }, 2.2,
  D('Under the aurora the Behemoth’s escort fleet forms up. All of it.')),
];

// ---------------------------------------------------------------------------------------------
// Stage 5 — The Furnace Crown. Everything, bigger, with many more elites.
// ---------------------------------------------------------------------------------------------
const FURNACE_WAVES = [
  W('Foundry Picket', 40, 70, [
    G('gyroScout', 12, 1, 1, 12, 'ring'),
    G('gunboat', 4, 4, 1, 4, 'flank', 'armored'),
    G('clockWasp', 10, 8, 5, 5, 'cluster'),
    G('ornithopter', 4, 14, 6, 2, 'edge'),
    G('flakIsland', 2, 20, 1, 2, 'flank'),
    G('steamWraith', 4, 25, 4, 2, 'cluster'),
    G('kiteBomber', 6, 30, 1, 6, 'line'),
    G('gyroScout', 12, 34, 1, 12, 'ring'),
  ], { gyroScout: 3, clockWasp: 1.2, gunboat: 1, kiteBomber: 0.8, ornithopter: 0.4 }, 2.2,
  D('Pickets of the Furnace Crown. Expect armour on everything.')),

  W('Molten Carrier Wave', 42, 80, [
    G('carrier', 2, 2, 1, 2, 'flank'),
    G('flakIsland', 2, 6, 10, 1, 'edge'),
    G('gunboat', 4, 9, 6, 2, 'pair'),
    G('carrier', 1, 16, 1, 1, 'front', 'armored'),
    G('clockWasp', 10, 20, 4, 5, 'cluster'),
    G('mortarBarge', 2, 25, 1, 2, 'flank'),
    G('carrier', 1, 29, 1, 1, 'behind'),
    G('ornithopter', 4, 33, 1, 4, 'ring'),
  ], { gyroScout: 3, gunboat: 1, kiteBomber: 1 }, 2.6,
  SET('Four carriers in convoy. The sky fills with scouts.')),

  W('Hornets & Haunts', 42, 85, [
    G('clockWasp', 12, 1.5, 1, 12, 'ring'),
    G('steamWraith', 4, 5, 1, 4, 'cluster'),
    G('clockWasp', 12, 10, 4, 4, 'flank'),
    G('steamWraith', 6, 17, 5, 3, 'edge'),
    G('balloonMine', 14, 22, 1, 14, 'ring'),
    G('clockWasp', 16, 27, 1, 16, 'ring'),
    G('steamWraith', 4, 32, 1, 4, 'ring', 'overclocked'),
    G('clockWasp', 8, 35, 1, 8, 'cluster', 'volatile'),
  ], { clockWasp: 3, steamWraith: 1, gyroScout: 2 }, 2.2,
  SET('A wasp swarm and a wraith fog at once. The hive has gone mad.')),

  W('Grand Battery', 44, 80, [
    G('frigate', 2, 2, 1, 2, 'flank'),
    G('mortarBarge', 2, 5, 1, 2, 'front'),
    G('teslaBuoy', 6, 8, 8, 2, 'pair'),
    G('flakIsland', 3, 12, 6, 1, 'edge'),
    G('gyroScout', 14, 15, 5, 7, 'cluster'),
    G('frigate', 2, 22, 1, 2, 'pair', 'armored'),
    G('mortarBarge', 2, 27, 1, 2, 'flank'),
    G('ornithopter', 6, 31, 2, 3, 'flank'),
    G('kiteBomber', 6, 35, 1, 6, 'line'),
  ], { gyroScout: 3, gunboat: 1.2, kiteBomber: 1 }, 2.4,
  SET('Every gun in the Syndicate arsenal, laid in one bombardment line.')),

  W('Crown of Iron', 45, 90, [
    G('gyroScout', 16, 0.5, 1, 16, 'ring'),
    G('ornithopter', 4, 3, 1, 4, 'flank', 'overclocked'),
    G('frigate', 1, 7, 1, 1, 'front', 'armored'),
    G('carrier', 1, 10, 1, 1, 'behind'),
    G('steamWraith', 6, 13, 5, 3, 'cluster', true),
    G('teslaBuoy', 4, 17, 1, 4, 'pair'),
    G('mortarBarge', 2, 21, 1, 2, 'flank', 'volatile'),
    G('clockWasp', 14, 24, 3, 7, 'ring'),
    G('gunboat', 4, 29, 1, 4, 'pair', 'armored'),
    G('balloonMine', 12, 32, 1, 12, 'ring'),
    G('kiteBomber', 8, 35, 1, 8, 'line'),
  ], { gyroScout: 3, clockWasp: 1.5, steamWraith: 0.6, ornithopter: 0.5, gunboat: 1 }, 2,
  SET('The Syndicate’s last line: elites of every class guard the Sun Furnace.')),
];

// ---------------------------------------------------------------------------------------------
// Stage definitions
// ---------------------------------------------------------------------------------------------

function stage(i, def) {
  return {
    biome: def.id,
    music: def.id,
    hpMult: HP_MULT[i],
    dmgMult: DMG_MULT[i],
    xpMult: XP_MULT[i],
    eliteChance: ELITE_CHANCE[i],
    fireRate: FIRE_RATE[i],
    number: i + 1,
    ...def,
  };
}

/** The five campaign stages (DESIGN §2.12). Stage id = biome id. */
export const STAGES = [
  stage(0, {
    id: 'brassbay', name: 'Brassbay Skies', subtitle: 'Dawn over the harbor',
    boss: 'ironMatriarch', weather: 'gulls', accent: '#f2c14e',
    newEnemies: ['gyroScout', 'gunboat', 'balloonMine', 'kiteBomber'],
    blurb: 'Syndicate raiders over the patchwork fields of home. Learn the wind; learn your guns.',
    waves: BRASSBAY_WAVES,
  }),
  stage(1, {
    id: 'smog', name: 'The Smog Wastes', subtitle: 'Where the chimneys never sleep',
    boss: 'kraken', weather: 'soot', accent: '#a8a060',
    newEnemies: ['clockWasp', 'flakIsland', 'carrier'],
    blurb: 'A factory city that never sleeps, belching soot and clockwork wasps.',
    waves: SMOG_WAVES,
  }),
  stage(2, {
    id: 'tempest', name: 'Tempest Reach', subtitle: 'Ride the lightning',
    boss: 'stormEngine', weather: 'storm', accent: '#7fb4e6',
    newEnemies: ['teslaBuoy', 'frigate', 'ornithopter'],
    blurb: 'Storm-wracked straits where the Syndicate tests its Tesla engines. Gusts push hard.',
    waves: TEMPEST_WAVES,
  }),
  stage(3, {
    id: 'aurora', name: 'The Aurora Drift', subtitle: 'Cold stars, colder iron',
    boss: 'behemoth', weather: 'snow', accent: '#b48cff',
    newEnemies: ['steamWraith', 'mortarBarge'],
    blurb: 'Above the snowbound peaks, under ribbons of light, Admiral Vex is waiting.',
    waves: AURORA_WAVES,
  }),
  stage(4, {
    id: 'furnace', name: 'The Furnace Crown', subtitle: 'Heart of the Syndicate',
    boss: 'sunFurnace', music: 'furnace', weather: 'embers', accent: '#ff6a2a',
    newEnemies: [],
    blurb: 'Molten rivers, roaring foundries and every warship the Syndicate has left.',
    waves: FURNACE_WAVES,
  }),
];

/** @param {string} id */
export function stageById(id) {
  return STAGES.find((s) => s.id === id || s.biome === id) || null;
}

/** Time (s into the wave) at which a group's final batch is scheduled. */
export function groupEnd(g) {
  const batches = Math.ceil((g.count ?? 1) / Math.max(1, g.batch ?? 1));
  return (g.start ?? 0) + (g.every ?? 1) * Math.max(0, batches - 1);
}

/**
 * Sanity-check a wave def. Returns a list of problems (empty = fine). Used by the preview page
 * and by the endless generator's self-test; cheap enough to run at startup in debug builds.
 * @param {any} wave
 * @param {string[]} [known] valid enemy ids
 */
export function validateWave(wave, known = ENEMY_IDS) {
  const out = [];
  if (!wave || !Array.isArray(wave.groups)) return ['no groups'];
  if (!(wave.duration > 0)) out.push('duration must be > 0');
  if (!(wave.maxAlive > 0)) out.push('maxAlive must be > 0');
  for (const g of wave.groups) {
    if (!known.includes(g.type)) out.push(`unknown type ${g.type}`);
    if (!(g.count >= 1)) out.push(`${g.type}: count < 1`);
    if (!(g.batch >= 1)) out.push(`${g.type}: batch < 1`);
    if (g.batch > wave.maxAlive) out.push(`${g.type}: batch ${g.batch} > maxAlive ${wave.maxAlive}`);
    if (groupEnd(g) > wave.duration) out.push(`${g.type}: schedule ends at ${groupEnd(g)}s > duration`);
    if (g.formation === 'pair' && g.batch % 2) out.push(`${g.type}: pair batch should be even`);
  }
  for (const k in wave.trickle?.pool || {}) if (!known.includes(k)) out.push(`unknown trickle ${k}`);
  return out;
}

/** Validate every stage; returns {stageId: problems[]} for stages with problems. */
export function validateStages() {
  const bad = {};
  STAGES.forEach((s) => {
    const probs = [];
    if (s.waves.length !== 5) probs.push(`${s.waves.length} waves (expected 5)`);
    s.waves.forEach((w, i) => validateWave(w).forEach((p) => probs.push(`wave ${i + 1}: ${p}`)));
    if (probs.length) bad[s.id] = probs;
  });
  return bad;
}
