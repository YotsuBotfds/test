// Rocket Pods & Hellfire Barrage (WP18, DESIGN §2.7). Flank pods ripple-fire homing rockets
// with smoke-and-flame trails; each rocket bursts on impact. Hellfire launches 8-rocket
// spirals with big incendiary blasts that leave burning patches behind.

import { Sprites } from '../../gfx/sprites.js';
import {
  dmgScale, cdScale, areaScale, durScale, extraProj, lv, ready, nearestN, mount, glowAt, boom,
} from './aux-common.js';

const SRC = 'aux:rocketPods';
const SRC_EVO = 'aux:hellfire';

const INTERVAL = [2.5, 2.5, 2.5, 1.9, 1.9];
const COUNT = [2, 3, 3, 4, 4];
const DMG = [16, 16, 22, 22, 26];
const AOE = [40, 40, 50, 50, 56];
const CLUSTER = [0, 0, 0, 0, 3];

const LEVELS = [
  'Every 2.5 s, launches 2 homing rockets (16 damage, blast radius 40).',
  '+1 rocket per volley (3).',
  'Damage 16 → 22; blast radius 40 → 50.',
  'Reload 2.5 s → 1.9 s; +1 rocket per volley (4).',
  'Cluster warheads: every blast scatters 3 bomblets; damage 22 → 26.',
];

const POD_FX = 0.27;
const POD_FY = 0.56;
const RIPPLE = 0.09;
const RIPPLE_EVO = 0.045;

const TGT = [];
const TMP = { x: 0, y: 0 };
const SMOKE = { alpha: 0.42, fire: true, life: 0.85 };
const SMOKE_BIG = { alpha: 0.5, fire: true, life: 1.1 };

function rocketTrail(p, w) {
  const a = Math.atan2(p.vy, p.vx);
  const bx = p.x - Math.cos(a) * 10 * p.scale;
  const by = p.y - Math.sin(a) * 10 * p.scale;
  const big = p.source === SRC_EVO;
  w.fx.trail?.(bx, by, big ? '#ff7a2f' : '#ffb347', 9 * p.scale, 0.12);
  // Smoke on every other trail tick keeps the overdraw sane with many rockets aloft.
  p._auxTrail = (p._auxTrail | 0) + 1;
  if (p._auxTrail & 1) w.fx.smokeTrail?.(bx, by, (big ? 0.5 : 0.38) * p.scale, big ? SMOKE_BIG : SMOKE);
}

// Reused fire options (world.fire copies scalars; explode/burn objects are read-only here).
const EXPL = { radius: 40, damage: 16, falloff: 0.4, visual: false, sound: false, shake: 0.04, knockback: 90 };
const EXPL_EVO = {
  radius: 80, damage: 30, falloff: 0.3, visual: false, sound: false, shake: 0.09,
  knockback: 200, burn: { dps: 10, time: 3 },
};
const ROCKET = {
  team: 'player', kind: 'rocket', x: 0, y: 0, angle: 0, speed: 240, accel: 1100, maxSpeed: 700,
  homing: 6.5, homingDelay: 0.12, homingRange: 650, target: null, r: 6, damage: 8, life: 2.4,
  owner: null, source: SRC, explode: EXPL, trail: rocketTrail, glow: '#ffb347', glowSize: 2.4,
  scale: 1, knockback: 40, onHit: null, onExpire: null,
};

/** Rocket impact/expiry: capped visual burst, then cluster bomblets at L5. */
function rocketBurst(p, w) {
  const r = p.explode?.radius ?? 40;
  boom(w, p.x, p.y, r, 'fire', r >= 52 ? 'explode_medium' : 'explode_small');
  if (!p.data?.cluster) return;
  const n = p.data.cluster;
  const owner = p.owner;
  const area = owner ? areaScale(owner) : 1;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + w.rng.next() * 1.2;
    w.fire({
      team: 'player', kind: 'pellet', x: p.x, y: p.y, angle: a, speed: 190 + w.rng.next() * 90,
      drag: 3.5, life: 0.28 + w.rng.next() * 0.1, hitEnemies: false, damage: 0, owner,
      source: SRC, glow: '#ffcf4a', glowSize: 3, scale: 1.1, trail: 'spark',
      explode: { radius: 28 * area, damage: p.data.cluster2, falloff: 0.3, visual: 'small', sound: false, shake: 0, knockback: 60 },
    });
  }
  w.sfx('explode_small', p.x, p.y, { vol: 0.6, delay: 0.3 });
}

function hellPatch(p, w) {
  const d = p.data;
  boom(w, p.x, p.y, p.explode?.radius ?? 80, 'fire', 'explode_medium', true);
  const slot = d?.slot;
  if (!slot || slot.data.patches >= 14) return;
  const owner = p.owner;
  slot.data.patches++;
  const area = owner ? areaScale(owner) : 1;
  w.addHazard({
    x: p.x, y: p.y, r: 40 * area, life: 1.8 * (owner ? durScale(owner) : 1), team: 'player',
    damage: d.patchDmg, tick: 0.35, owner, source: SRC_EVO, element: 'fire',
    burn: { dps: d.patchDmg * 0.8, time: 1.5 }, draw: drawPatch, update: patchFx, onDone: patchDone,
    data: { slot, fx: 0, seed: w.rng.next() * 10 },
  });
}

function rocketHit(p, target, w) {
  rocketBurst(p, w);
}

function hellHit(p, target, w) {
  hellPatch(p, w);
}

function patchFx(h, dt, w) {
  h.data.fx -= dt;
  if (h.data.fx <= 0) {
    h.data.fx = 0.13;
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * h.r * 0.8;
    w.fx.burn?.(h.x + Math.cos(a) * r, h.y + Math.sin(a) * r, 0.8 + h.r / 80);
  }
}

function patchDone(h) {
  const s = h.data.slot;
  if (s?.data) s.data.patches = Math.max(0, s.data.patches - 1);
}

function drawPatch(ctx, h) {
  const k = h.t / Math.max(0.01, h.life);
  const fade = Math.min(1, (1 - k) * 4) * Math.min(1, h.t * 6);
  const flick = 0.75 + 0.25 * Math.sin(h.t * 23 + h.data.seed) * Math.sin(h.t * 7.3);
  // scorched ground
  ctx.globalAlpha = 0.28 * fade;
  ctx.fillStyle = '#2a1408';
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.r * 0.95, 0, Math.PI * 2);
  ctx.fill();
  glowAt(ctx, 'aux_glow_fire', h.x, h.y, h.r * 1.25, 0.55 * fade * flick);
  glowAt(ctx, 'aux_glow_gold', h.x, h.y, h.r * 0.5, 0.35 * fade * flick);
}

function launch(p, slot, w, evo) {
  const d = slot.data;
  const area = areaScale(p);
  const side = d.side;
  d.side = -d.side;
  const m = mount(p, evo ? POD_FX - 0.02 : POD_FX, (evo ? 0.6 : POD_FY) * side, TMP);
  const k = d.fired++;
  const t = TGT[k % Math.max(1, TGT.length)] || null;
  const o = ROCKET;
  o.x = m.x + Math.cos(p.angle) * 6;
  o.y = m.y + Math.sin(p.angle) * 6;
  // Kick out sideways-forward from the pod, then curl onto the target.
  const fan = evo ? 0.35 + ((k % 4) / 3) * 0.9 : 0.9;
  o.angle = p.angle + side * fan + (w.rng.next() - 0.5) * 0.25;
  o.speed = evo ? 300 : 240;
  o.maxSpeed = (evo ? 780 : 700) * (p.stats.projSpeed ?? 1);
  o.homing = evo ? 7.5 : 6.5;
  o.target = t && t.alive ? t : null;
  o.owner = p;
  o.source = evo ? SRC_EVO : SRC;
  o.explode = evo ? EXPL_EVO : EXPL;
  o.damage = d.direct;
  o.scale = (evo ? 1.3 : 1) * Math.sqrt(area);
  o.r = 6 * o.scale;
  o.glow = evo ? '#ff7a2f' : '#ffb347';
  o.onHit = evo ? hellHit : rocketHit;
  o.onExpire = evo ? hellPatch : rocketBurst;
  o.data = evo ? { slot, patchDmg: d.patchDmg } : d.cluster ? { cluster: d.cluster, cluster2: d.clusterDmg } : null;
  w.fire(o);
  o.owner = null;
  o.target = null;
  o.data = null;
  d.kick[side > 0 ? 1 : 0] = 1;
  w.fx.muzzle?.(m.x, m.y, p.angle + side * 1.2, evo ? 0.7 : 0.5, '#ffb347');
  w.fx.smoke?.(m.x, m.y, evo ? 0.6 : 0.4, { count: 1, alpha: 0.4 });
  w.sfx('rocket_launch', m.x, m.y, { vol: evo ? 0.7 : 0.6, pitch: 0.9 + w.rng.next() * 0.25 });
}

function makeData(slot) {
  slot.data.side = 1;
  slot.data.queue = 0;
  slot.data.qT = 0;
  slot.data.fired = 0;
  slot.data.kick = [0, 0];
  slot.data.empty = 0;
  slot.data.patches = 0;
  slot.cd = 0.8;
}

function tickVolley(p, slot, dt, w, evo) {
  const d = slot.data;
  d.kick[0] = Math.max(0, d.kick[0] - dt * 5);
  d.kick[1] = Math.max(0, d.kick[1] - dt * 5);
  d.empty = Math.max(0, d.empty - dt);
  if (d.queue > 0) {
    d.qT -= dt;
    while (d.queue > 0 && d.qT <= 0) {
      d.qT += evo ? RIPPLE_EVO : RIPPLE;
      d.queue--;
      launch(p, slot, w, evo);
      if (!d.queue) d.empty = slot.cdMax * 0.45;
    }
    return true;
  }
  return false;
}

export const RocketPods = {
  maxLevel: 5,
  levelDesc: (level) => lv(LEVELS, level),

  init(p, slot) {
    makeData(slot);
  },

  update(p, slot, dt, w) {
    if (tickVolley(p, slot, dt, w, false)) return;
    const i = slot.level;
    if (!ready(slot, dt, lv(INTERVAL, i) * cdScale(p))) return;
    const n = lv(COUNT, i) + extraProj(p);
    nearestN(w, p.x, p.y, 640, n, TGT);
    if (!TGT.length) {
      slot.cd = 0.2;
      return;
    }
    const d = slot.data;
    const area = areaScale(p);
    const sc = dmgScale(p, w);
    const dmg = lv(DMG, i) * sc;
    EXPL.radius = lv(AOE, i) * area;
    EXPL.damage = dmg;
    d.direct = dmg * 0.5; // blast does the heavy lifting
    d.cluster = lv(CLUSTER, i);
    d.clusterDmg = dmg * 0.4;
    d.queue = n;
    d.qT = 0;
    d.fired = 0;
    tickVolley(p, slot, 0, w, false);
  },

  draw(ctx, p, slot) {
    drawPods(ctx, p, slot, 'aux_pod', POD_FX, POD_FY, 1);
  },
};

function drawPods(ctx, p, slot, sprite, fx, fy, scale) {
  const d = slot.data;
  for (let s = 0; s < 2; s++) {
    const side = s ? 1 : -1;
    const m = mount(p, fx, fy * side, TMP, true);
    const kick = d.kick[s];
    const x = m.x - Math.cos(p.angle) * kick * 3;
    const y = m.y - Math.sin(p.angle) * kick * 3;
    const frame = d.empty > 0 || kick > 0.2 || d.queue > 0 ? 1 : 0;
    Sprites.draw(ctx, sprite, x, y, p.angle, scale, 1, frame);
    if (kick > 0.05) {
      const bx = x - Math.cos(p.angle) * 8;
      const by = y - Math.sin(p.angle) * 8;
      glowAt(ctx, 'aux_glow_fire', bx, by, 10 * kick * scale, 0.8 * kick);
    }
  }
}

// ---- Hellfire Barrage -------------------------------------------------------------------------

const EVO_INTERVAL = 1.8;
const EVO_COUNT = 8;
const EVO_DMG = 30;
const EVO_AOE = 82;

export const Hellfire = {
  maxLevel: 1,

  init(p, slot) {
    makeData(slot);
    slot.cd = 0.5;
  },

  update(p, slot, dt, w) {
    if (tickVolley(p, slot, dt, w, true)) return;
    if (!ready(slot, dt, EVO_INTERVAL * cdScale(p))) return;
    const n = EVO_COUNT + extraProj(p) * 2;
    nearestN(w, p.x, p.y, 760, n, TGT);
    if (!TGT.length) {
      slot.cd = 0.2;
      return;
    }
    const d = slot.data;
    const area = areaScale(p);
    const sc = dmgScale(p, w);
    EXPL_EVO.radius = EVO_AOE * area;
    EXPL_EVO.damage = EVO_DMG * sc;
    EXPL_EVO.burn.dps = 10 * sc;
    EXPL_EVO.burn.time = 3 * durScale(p);
    d.direct = EVO_DMG * sc * 0.4;
    d.patchDmg = 6 * sc;
    d.queue = n;
    d.qT = 0;
    d.fired = 0;
    w.shake(0.12);
    tickVolley(p, slot, 0, w, true);
  },

  draw(ctx, p, slot) {
    const d = slot.data;
    drawPods(ctx, p, slot, 'aux_pod_hell', POD_FX - 0.02, 0.6, 1);
    // Heat shimmer on the pods while reloading.
    const heat = slot.cdMax ? Math.max(0, slot.cd) / slot.cdMax : 0;
    if (heat > 0.05 && !d.queue) {
      for (let s = -1; s <= 1; s += 2) {
        const m = mount(p, POD_FX - 0.06, 0.6 * s, TMP, true);
        glowAt(ctx, 'aux_glow_fire', m.x, m.y, 12, 0.35 * heat * (0.7 + 0.3 * Math.sin(p.t * 20)));
      }
    }
  },
};
