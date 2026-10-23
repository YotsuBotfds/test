// STUB (WP20 replaces) — 5 stages with short placeholder waves. Format: DESIGN §4.8.
const W = (duration, count) => ({
  duration, maxAlive: 40,
  groups: [{ type: 'gyroScout', count, start: 0, every: 1.2, batch: 2, formation: 'edge' }],
  trickle: { pool: { gyroScout: 3, gunboat: 1 }, every: 3 },
});

const S = (id, name, subtitle, music, boss, i) => ({
  id, name, subtitle, biome: id, music, boss,
  hpMult: [1, 1.7, 2.6, 3.7, 5][i], dmgMult: [1, 1.15, 1.3, 1.5, 1.7][i],
  xpMult: [1, 1.2, 1.4, 1.6, 1.8][i], eliteChance: [0.02, 0.04, 0.06, 0.08, 0.12][i],
  waves: [W(15, 8), W(15, 10)],
});

export const STAGES = [
  S('brassbay', 'Brassbay Skies', 'Dawn over the harbor', 'brassbay', 'ironMatriarch', 0),
  S('smog', 'The Smog Wastes', 'Where the chimneys never sleep', 'smog', 'kraken', 1),
  S('tempest', 'Tempest Reach', 'Ride the lightning', 'tempest', 'stormEngine', 2),
  S('aurora', 'The Aurora Drift', 'Cold stars, colder iron', 'aurora', 'behemoth', 3),
  S('furnace', 'The Furnace Crown', 'Heart of the Syndicate', 'furnace', 'sunFurnace', 4),
];
