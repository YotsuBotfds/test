// STUB (WP20 replaces) — game modes, modifiers, generators. DESIGN §2.2.
import { RNG, dateSeed } from '../core/rng.js';

const M = (id, name, desc, apply) => ({ id, name, desc, apply });

export const MODIFIERS = {
  gale: M('gale', 'Gale Force', 'Howling winds push everything about.', (m) => { m.wind = 1; }),
  glassCannon: M('glassCannon', 'Glass Cannon', 'Deal double damage. Take double damage.', (m) => { m.playerDmg *= 2; m.playerDmgTaken *= 2; }),
  swarm: M('swarm', 'The Swarm', 'Many more foes, each more fragile.', (m) => { m.spawnRate *= 1.5; m.enemyHp *= 0.6; }),
  volatile: M('volatile', 'Volatile Skies', 'Every enemy explodes when destroyed.', (m) => { m.volatileAll = true; }),
  fog: M('fog', 'Pea-Souper', 'Thick fog limits your sight.', (m) => { m.fog = true; }),
  ironclad: M('ironclad', 'Ironclad Armada', 'Tougher foes, richer aether.', (m) => { m.enemyHp *= 1.6; m.xp *= 1.5; }),
  speedDemon: M('speedDemon', 'Speed Demons', 'Everything moves faster.', (m) => { m.enemySpeed *= 1.25; m.enemyBulletSpeed *= 1.25; }),
  richSkies: M('richSkies', 'Rich Skies', 'Double cogs, deadlier foes.', (m) => { m.cogs *= 2; m.enemyDmg *= 1.2; }),
  lowBallast: M('lowBallast', 'Low Ballast', 'Start without bombs; bombs drop often.', (m) => { m.startBombs = 0; m.bombDrops *= 3; }),
  eliteHunt: M('eliteHunt', 'Elite Hunt', 'Elites everywhere.', (m) => { m.eliteChance += 0.25; }),
};

export function dailySeed(date = new Date()) {
  return dateSeed(date);
}

export const MODES = {
  campaign: { id: 'campaign', name: 'The Grand Voyage', desc: 'Five stages. Five bosses. One airship.', icon: 'icon_mode_campaign', stages: () => [0, 1, 2, 3, 4], unlocked: () => true },
  endless: {
    id: 'endless', name: 'Endless Gale', desc: 'Survive as long as you can.', icon: 'icon_mode_endless', endless: true, unlocked: () => true,
    makeWave(index) {
      return { duration: 30, maxAlive: 40 + index * 2, groups: [{ type: 'gyroScout', count: 8 + index * 2, start: 0, every: 1, batch: 2, formation: 'ring' }], trickle: { pool: { gyroScout: 3, gunboat: 1 }, every: 2.5 } };
    },
    bossFor(index) {
      return index > 0 && index % 5 === 0 ? ['ironMatriarch', 'kraken', 'stormEngine', 'behemoth', 'sunFurnace'][(index / 5 - 1) % 5] : null;
    },
    biomeFor(index) {
      return ['brassbay', 'smog', 'tempest', 'aurora', 'furnace'][Math.floor(index / 5) % 5];
    },
  },
  daily: {
    id: 'daily', name: 'Daily Squall', desc: 'A new seeded voyage every day.', icon: 'icon_mode_daily', unlocked: () => true,
    seed: (date) => dailySeed(date),
    modifiers(seed) {
      const r = new RNG(seed);
      return r.shuffle(Object.keys(MODIFIERS)).slice(0, 2);
    },
    stages(seed) {
      return new RNG(seed ^ 0x9e3779b9).shuffle([0, 1, 2, 3, 4]);
    },
  },
  bossRush: { id: 'bossRush', name: 'Gauntlet of Iron', desc: 'Every boss, back to back.', icon: 'icon_mode_bossRush', bosses: ['ironMatriarch', 'kraken', 'stormEngine', 'behemoth', 'sunFurnace'], unlocked: (save) => (save?.stats?.wins || 0) > 0 },
};
export const MODE_ORDER = ['campaign', 'endless', 'daily', 'bossRush'];
