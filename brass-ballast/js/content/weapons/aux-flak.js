// Flak Turret & Flak Storm (WP18, DESIGN §2.7). A sponson-mounted twin-barrel flak gun swivels
// to lead the nearest foe and lobs proximity-fused shells that burst into black flak clouds
// (and shrapnel at higher levels). Flak Storm mounts heavy quad cannons on both flanks.

import { Sprites } from '../../gfx/sprites.js';
import { angleDiff, rotateToward } from '../../core/math.js';
import { dmgScale, cdScale, areaScale, extraProj, lv, nearestN, mount, glowAt } from './aux-common.js';

const SRC = 'aux:flakTurret';
const SRC_EVO = 'aux:flakStorm';

const RATE = [3, 3, 4, 4, 5];
const DMG = [6, 8, 8, 8, 11];
const RANGE = [420, 420, 480, 480, 520];
const BURST = [30, 30, 30, 40, 40];
const SHARDS = [0, 0, 0, 4, 4];

const LEVELS = [
  'A flank flak gun auto-aims at the nearest foe within 420 and fires 3 proximity-fused shells/s (6 damage bursts).',
  'Burst damage 6 → 8.',
  'Rate 3 → 4 shells/s; range 420 → 480.',
  'Bursts grow 33% and scatter 4 shrapnel shards.',
  'Rate 4 → 5 shells/s; damage 8 → 11; range 520.',
];

const FX_X = -0.3;
const FX_Y = 0.6;
const SHELL_SPEED = 640;
const TURN = 14;

const TGT = [];
const TMP = { x: 0, y: 0 };
const PUFF = { count: 2, alpha: 0.42, color: '#3a3430', color1: '#6e665e', life: 0.8, spread: 14 };
const PUFF_BIG = { count: 3, alpha: 0.45, color: '#3a3430', color1: '#6e665e', life: 0.9, spread: 22 };
const MIN_RANGE = 70; // flak is for mid range; point-blank bursts would smother the ship
const BOOM = { palette: 'brass', debris: false, cogs: 0, smoke: false, lowSmoke: false };

function flakBurst(p, w) {
  const d = p.data;
  if (!d || d.burst) return;
  d.burst = true;
  const big = d.big;
  const s = p.explode?.radius ? p.explode.radius / 34 : 1;
  w.fx.explosion?.(p.x, p.y, (big ? 0.55 : 0.36) * s, BOOM);
  w.fx.smoke?.(p.x, p.y, (big ? 0.55 : 0.4) * s, big ? PUFF_BIG : PUFF);
  if (big) w.fx.shockwave?.(p.x, p.y, p.explode.radius * 1.15, '#ffd9a0', 0.25);
  if (Math.random() < (big ? 0.5 : 0.3)) w.sfx('explode_small', p.x, p.y, { vol: big ? 0.45 : 0.28, pitch: 1.4 });
  const n = d.shards;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.8;
    w.fire({
      team: 'player', kind: 'spark', x: p.x, y: p.y, angle: a, speed: 380 + Math.random() * 120,
      drag: 2, life: 0.2, r: 3, scale: 0.6, damage: d.shardDmg, owner: p.owner, source: p.source,
      glow: '#ffcf4a', glowSize: 2, knockback: 20, noBurnChance: true,
    });
  }
}

function flakProx(p, dt, w) {
  if (p.t < 0.05) return;
  if (w.nearestEnemy(p.x, p.y, p.data.prox)) {
    flakBurst(p, w);
    p.kill(true);
  }
}

function flakHit(p, target, w) {
  flakBurst(p, w);
}

function fireShell(p, slot, w, tur, m, e, evo, stats) {
  const area = areaScale(p);
  const speed = SHELL_SPEED * (p.stats.projSpeed ?? 1) * (evo ? 1.1 : 1);
  const dist = Math.hypot(e.x - m.x, e.y - m.y);
  const life = Math.min(dist / speed + 0.08, stats.range / speed);
  const n = 1 + extraProj(p);
  for (let k = 0; k < n; k++) {
    const off = n > 1 ? (k / (n - 1) - 0.5) * 0.22 : 0;
    const a = tur.aim + off + (Math.random() - 0.5) * 0.05;
    const side = tur.barrel ? 1 : -1;
    tur.barrel = !tur.barrel;
    const bo = (evo ? 3 : 2.6) * side;
    const bx = m.x + Math.cos(tur.aim) * (evo ? 20 : 16) - Math.sin(tur.aim) * bo;
    const by = m.y + Math.sin(tur.aim) * (evo ? 20 : 16) + Math.cos(tur.aim) * bo;
    w.fire({
      team: 'player', kind: 'flak', x: bx, y: by, angle: a, speed, life, r: 5,
      scale: (evo ? 1.35 : 1) * Math.sqrt(area), damage: stats.dmg * 0.5, owner: p,
      source: evo ? SRC_EVO : SRC, glow: '#ffcf4a', glowSize: 2.4, knockback: 30,
      explode: { radius: stats.burst * area, damage: stats.dmg, falloff: 0.3, visual: false, sound: false, shake: 0, knockback: 80 },
      update: flakProx, onHit: flakHit, onExpire: flakBurst,
      data: { prox: Math.max(18, stats.burst * area * 0.55), shards: stats.shards, shardDmg: stats.dmg * 0.35, big: evo, burst: false },
    });
    if (k === 0) w.fx.muzzle?.(bx, by, tur.aim, evo ? 0.42 : 0.3, '#ffd36b');
  }
  tur.kick = 1;
  w.sfx('flak_fire', m.x, m.y, { vol: evo ? 0.55 : 0.45, pitch: 0.95 + Math.random() * 0.15 });
}

const ST = { rate: 3, dmg: 6, range: 420, burst: 30, shards: 0 };

function updateTurrets(p, slot, dt, w, evo) {
  const d = slot.data;
  const st = ST;
  const sc = dmgScale(p, w);
  if (evo) {
    st.rate = 6.5;
    st.dmg = 12 * sc;
    st.range = 580;
    st.burst = 56;
    st.shards = 6;
  } else {
    const i = slot.level;
    st.rate = lv(RATE, i);
    st.dmg = lv(DMG, i) * sc;
    st.range = lv(RANGE, i);
    st.burst = lv(BURST, i);
    st.shards = lv(SHARDS, i);
  }
  const interval = (cdScale(p) / (st.rate * (p.stats.fireRate ?? 1)));
  slot.cdMax = interval;
  const turrets = d.turrets;
  const mx = turrets[0];
  nearestN(w, p.x, p.y, st.range, turrets.length + 4, TGT);
  // Drop targets hugging the hull (TGT is sorted nearest-first; keep at least one).
  let skip = 0;
  while (skip < TGT.length - 1 && TGT[skip]._auxD < MIN_RANGE * MIN_RANGE) skip++;
  for (let t = 0; t < turrets.length; t++) {
    const tur = turrets[t];
    const m = mount(p, FX_X, FX_Y * tur.side, TMP);
    tur.kick = Math.max(0, tur.kick - dt * 7);
    tur.cd -= dt;
    const e = TGT.length ? TGT[Math.min(skip + t, TGT.length - 1)] : null;
    if (!e) {
      // Idle: settle facing outward from the flank.
      tur.aim = rotateToward(tur.aim, p.angle + tur.side * 1.2, 3 * dt);
      continue;
    }
    // Lead the target by its velocity.
    const dist = Math.hypot(e.x - m.x, e.y - m.y);
    const tt = dist / SHELL_SPEED;
    const want = Math.atan2(e.y + (e.vy || 0) * tt - m.y, e.x + (e.vx || 0) * tt - m.x);
    tur.aim = rotateToward(tur.aim, want, TURN * dt);
    if (tur.cd <= 0 && Math.abs(angleDiff(tur.aim, want)) < 0.3) {
      tur.cd = interval;
      fireShell(p, slot, w, tur, m, e, evo, st);
    }
  }
  slot.cd = Math.max(0, mx.cd);
  TGT.length = 0;
}

function makeTurrets(p, slot, n) {
  slot.data.turrets = [];
  for (let i = 0; i < n; i++) {
    const side = i === 0 ? 1 : -1;
    slot.data.turrets.push({ side, aim: p.angle + side * 1.2, cd: 0.3 + i * 0.07, kick: 0, barrel: false });
  }
}

function drawTurrets(ctx, p, slot, sprite) {
  const turrets = slot.data.turrets;
  if (!turrets) return;
  for (let t = 0; t < turrets.length; t++) {
    const tur = turrets[t];
    const m = mount(p, FX_X, FX_Y * tur.side, TMP, true);
    const k = tur.kick * 2.5;
    Sprites.draw(ctx, sprite, m.x - Math.cos(tur.aim) * k, m.y - Math.sin(tur.aim) * k, tur.aim, 1);
    if (tur.kick > 0.4) {
      const r = sprite === 'aux_flak' ? 17 : 21;
      glowAt(ctx, 'aux_glow_gold', m.x + Math.cos(tur.aim) * r, m.y + Math.sin(tur.aim) * r, 9 * tur.kick, 0.7 * tur.kick);
    }
  }
}

export const FlakTurret = {
  maxLevel: 5,
  levelDesc: (level) => lv(LEVELS, level),

  init(p, slot) {
    makeTurrets(p, slot, 1);
  },

  update(p, slot, dt, w) {
    if (!slot.data.turrets) makeTurrets(p, slot, 1);
    updateTurrets(p, slot, dt, w, false);
  },

  draw(ctx, p, slot) {
    drawTurrets(ctx, p, slot, 'aux_flak');
  },
};

export const FlakStorm = {
  maxLevel: 1,

  init(p, slot) {
    makeTurrets(p, slot, 2);
  },

  update(p, slot, dt, w) {
    if (!slot.data.turrets) makeTurrets(p, slot, 2);
    updateTurrets(p, slot, dt, w, true);
  },

  draw(ctx, p, slot) {
    drawTurrets(ctx, p, slot, 'aux_flak_heavy');
  },
};
