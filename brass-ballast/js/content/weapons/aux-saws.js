// Gyro-Saws & Grand Buzzsaw Halo (WP18, DESIGN §2.7). Gyroscopically stabilised buzzsaws orbit
// the ship, shredding anything they touch (0.4 s per-foe cooldown) with sparks and knockback.
// The Halo is a ring of giant gold-toothed saws that breathes in and out like a bellows.

import { Sprites } from '../../gfx/sprites.js';
import {
  TAU, dmgScale, cdScale, areaScale, extraProj, lv, strike, glowAt, onScreen, NO_DASH, DASH,
} from './aux-common.js';

const SRC = 'aux:gyroSaws';
const SRC_EVO = 'aux:buzzsawHalo';

const COUNT = [2, 2, 3, 3, 4];
const DMG = [10, 14, 14, 14, 18];
const SPIN = [3.2, 3.2, 3.2, 4.2, 4.2];
const SIZE = [1, 1, 1, 1.25, 1.25];

const LEVELS = [
  '2 gyro-saws orbit at radius 110, shredding foes for 10 per hit (0.4 s per-foe cooldown).',
  'Damage 10 → 14.',
  '+1 saw (3).',
  'Saws orbit 30% faster and grow 25% larger.',
  '+1 saw (4); damage 14 → 18.',
];

const HIT_CD = 0.4;
const ORBIT_R = 110;
const MAX_SAWS = 14;
const Q = [];

function sawList(slot, n) {
  const list = slot.data.saws || (slot.data.saws = []);
  while (list.length < n) list.push({ x: 0, y: 0, hit: 0, a: 0 });
  if (list.length > n) list.length = n;
  return list;
}

/** Saw contact damage with a per-enemy cooldown (Map enemy → next allowed time). */
function cut(p, slot, w, s, rad, dmg, kb, src, cd, big) {
  const hits = slot.data.hits;
  Q.length = 0;
  w.queryEnemies(s.x, s.y, rad, Q);
  for (let i = 0; i < Q.length; i++) {
    const e = Q[i];
    const next = hits.get(e);
    if (next !== undefined && w.time < next) continue;
    hits.set(e, w.time + cd);
    // Knock outward from the ship, nudged along the spin.
    const a = Math.atan2(e.y - p.y, e.x - p.x) + 0.5;
    strike(w, p, e, dmg, src, 'kinetic', kb, a);
    const ix = (s.x + e.x) * 0.5;
    const iy = (s.y + e.y) * 0.5;
    w.fx.sparks?.(ix, iy, a + Math.PI / 2, big ? 9 : 5, '#ffe9a8', 1.6, SPARK);
    if (big) w.fx.hitSpark?.(ix, iy, a, false, '#ffcf4a');
    w.sfx('saw_hit', ix, iy, { vol: big ? 0.6 : 0.45, pitch: (big ? 0.8 : 1) + Math.random() * 0.2 });
    s.hit = 1;
  }
  Q.length = 0;
}
const SPARK = { speed: 420, life: 0.25 };

/** Drop stale cooldown entries (dead foes, long-expired times). */
function prune(slot, w) {
  const hits = slot.data.hits;
  for (const [e, t] of hits) if (!e.alive || t < w.time - 1) hits.delete(e);
}

function initData(slot) {
  slot.data.saws = [];
  slot.data.hits = new Map();
  slot.data.spin = 0;
  slot.data.prune = 2;
  slot.data.t = 0;
}

export const GyroSaws = {
  maxLevel: 5,
  levelDesc: (level) => lv(LEVELS, level),

  init(p, slot) {
    initData(slot);
  },

  update(p, slot, dt, w) {
    const d = slot.data;
    if (!d.hits) initData(slot);
    const i = slot.level;
    const area = areaScale(p);
    const n = Math.min(MAX_SAWS, lv(COUNT, i) + extraProj(p));
    const list = sawList(slot, n);
    d.spin += dt * lv(SPIN, i) / Math.max(0.6, cdScale(p)) ** 0.5;
    const R = ORBIT_R * area;
    const scale = lv(SIZE, i) * Math.sqrt(area);
    const rad = 12.5 * scale;
    const dmg = lv(DMG, i) * dmgScale(p, w);
    slot.cdMax = 0;
    slot.cd = 0;
    w.loopSfx?.(`saw:${p.index}`, 'saw_whirr', true, { vol: 0.1 + 0.03 * i, pitch: 0.85 + 0.06 * i, x: p.x, y: p.y });
    for (let k = 0; k < list.length; k++) {
      const s = list[k];
      s.a = d.spin + (k / list.length) * TAU;
      s.x = p.x + Math.cos(s.a) * R;
      s.y = p.y + Math.sin(s.a) * R;
      s.hit = Math.max(0, s.hit - dt * 6);
      cut(p, slot, w, s, rad, dmg, 140, SRC, HIT_CD, false);
    }
    d.prune -= dt;
    if (d.prune <= 0) {
      d.prune = 2;
      prune(slot, w);
    }
  },

  draw(ctx, p, slot, w) {
    const d = slot.data;
    const list = d.saws;
    if (!list || !list.length) return;
    const i = slot.level;
    const area = areaScale(p);
    const R = ORBIT_R * area;
    const scale = lv(SIZE, i) * Math.sqrt(area);
    // Orbit track.
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, R, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
    const rot = w.time * 22;
    for (let k = 0; k < list.length; k++) {
      const s = list[k];
      if (!onScreen(w, s.x, s.y)) continue;
      // Motion ghosts trailing along the orbit.
      for (let g = 2; g >= 1; g--) {
        const a = s.a - g * 0.16;
        Sprites.draw(ctx, 'pb_saw', p.x + Math.cos(a) * R, p.y + Math.sin(a) * R, rot - g, scale, 0.14 / g);
      }
      Sprites.draw(ctx, 'pb_saw', s.x, s.y, rot, scale, 1);
      if (s.hit > 0) glowAt(ctx, 'aux_glow_gold', s.x, s.y, 14 * scale, 0.6 * s.hit);
    }
  },
};

// ---- Grand Buzzsaw Halo -------------------------------------------------------------------------

const EVO_COUNT = 8;
const EVO_DMG = 28;
const EVO_CD = 0.3;
const R_MIN = 92;
const R_MAX = 240;
const BREATH = 4.2;

function haloRadius(d, area) {
  const k = 0.5 - 0.5 * Math.cos((d.t / BREATH) * TAU);
  return (R_MIN + (R_MAX - R_MIN) * k) * area;
}

export const BuzzsawHalo = {
  maxLevel: 1,

  init(p, slot) {
    initData(slot);
    slot.data.peak = false;
  },

  update(p, slot, dt, w) {
    const d = slot.data;
    if (!d.hits) initData(slot);
    const area = areaScale(p);
    const n = Math.min(MAX_SAWS, EVO_COUNT + extraProj(p));
    const list = sawList(slot, n);
    d.t += dt / Math.max(0.5, cdScale(p)) ** 0.5;
    const R = haloRadius(d, area);
    const k = (R / area - R_MIN) / (R_MAX - R_MIN);
    // Spin harder when contracted (conservation of angular momentum, roughly).
    d.spin += dt * (1.6 + 2.4 * (1 - k));
    const scale = 1.25 * Math.sqrt(area);
    const rad = 21 * scale;
    const dmg = EVO_DMG * dmgScale(p, w);
    slot.cdMax = BREATH;
    w.loopSfx?.(`saw:${p.index}`, 'saw_whirr', true, { vol: 0.24, pitch: 0.8 + 0.5 * (1 - k), x: p.x, y: p.y });
    slot.cd = BREATH - (d.t % BREATH);
    for (let j = 0; j < list.length; j++) {
      const s = list[j];
      s.a = d.spin + (j / list.length) * TAU;
      s.x = p.x + Math.cos(s.a) * R;
      s.y = p.y + Math.sin(s.a) * R;
      s.hit = Math.max(0, s.hit - dt * 5);
      cut(p, slot, w, s, rad, dmg, 260, SRC_EVO, EVO_CD, true);
    }
    // Full extension: a spark ring and a whirr.
    const peak = k > 0.985;
    if (peak && !d.peak) {
      w.fx.ring?.(p.x, p.y, R + 30, '#ffcf4a', 0.45, { width: 4 });
      for (let j = 0; j < list.length; j++) w.fx.sparks?.(list[j].x, list[j].y, list[j].a, 6, '#ffe9a8', 1.2, SPARK);
      w.sfx('saw_hit', p.x, p.y, { vol: 0.7, pitch: 0.6 });
    }
    d.peak = peak;
    d.prune -= dt;
    if (d.prune <= 0) {
      d.prune = 2;
      prune(slot, w);
    }
  },

  drawUnder(ctx, p, slot) {
    const d = slot.data;
    const R = haloRadius(d, areaScale(p));
    // Brass guide-ring linking the saws, with an aether glow inside.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = '#7ff3ff';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, R, 0, TAU);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#c9973f';
    ctx.lineWidth = 2.5;
    DASH[0] = 10;
    DASH[1] = 6;
    ctx.setLineDash(DASH);
    ctx.lineDashOffset = -d.spin * R * 0.5;
    ctx.stroke();
    ctx.setLineDash(NO_DASH);
    ctx.globalAlpha = 1;
  },

  draw(ctx, p, slot, w) {
    const d = slot.data;
    const list = d.saws;
    if (!list || !list.length) return;
    const area = areaScale(p);
    const R = haloRadius(d, area);
    const scale = 1.25 * Math.sqrt(area);
    const rot = w.time * 16;
    for (let j = 0; j < list.length; j++) {
      const s = list[j];
      if (!onScreen(w, s.x, s.y, 80)) continue;
      for (let g = 2; g >= 1; g--) {
        const a = s.a - g * 0.12;
        Sprites.draw(ctx, 'aux_halo_saw', p.x + Math.cos(a) * R, p.y + Math.sin(a) * R, rot - g * 0.7, scale, 0.13 / g);
      }
      glowAt(ctx, 'aux_glow_gold', s.x, s.y, 26 * scale, 0.18 + 0.5 * s.hit);
      Sprites.draw(ctx, 'aux_halo_saw', s.x, s.y, rot, scale, 1);
    }
  },
};
