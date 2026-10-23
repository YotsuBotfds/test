// Tesla Coil & Thunderhead Dynamo (WP18, DESIGN §2.7). Chain lightning from a coil on the
// stern deck; the evolution keeps arcs on every foe in range and calls down storm bursts.

import { Sprites } from '../../gfx/sprites.js';
import {
  TAU, dmgScale, cdScale, areaScale, durScale, extraProj, lv, ready, strike, nearestN, newMark,
  mount, glowAt, crackle, NO_DASH, DASH,
} from './aux-common.js';

const SRC = 'aux:teslaCoil';
const SRC_EVO = 'aux:thunderhead';
const ARC = '#9ff6ff';
const ARC_HOT = '#e8ffff';

// Level tables (index = level − 1).
const INTERVAL = [1.6, 1.6, 1.6, 1.2, 1.2];
const TARGETS = [3, 3, 4, 4, 5];
const CHAIN = [2, 2, 3, 3, 4];
const RANGE = [260, 260, 260, 300, 300];
const DMG = [12, 16, 16, 16, 22];
const OVERCHARGE = [0, 0, 0, 0, 1];
const CHAIN_R = 170;
const CHAIN_FALLOFF = 0.82;

const LEVELS = [
  'Every 1.6 s, zaps up to 3 foes within 260 for 12 shock damage; each arc chains to 2 more.',
  'Damage 12 → 16.',
  '+1 target (4) and +1 chain jump (3).',
  'Recharge 1.6 s → 1.2 s; range 260 → 300.',
  'Overcharge: 5 targets, 4 chain jumps, 22 damage — and shocked foes are slowed 50%.',
];

const PRIMARY = [];
const CHAINQ = [];
const LOPT = { color: ARC, width: 2.6, life: 0.22, branches: 2, from: null, to: null, sparks: true };

/** Spawn a lightning effect; endpoints follow live objects so arcs stick to moving ships. */
function bolt(w, x1, y1, x2, y2, from, to, width, life, branches, color = ARC) {
  LOPT.color = color;
  LOPT.width = width;
  LOPT.life = life;
  LOPT.branches = branches;
  LOPT.from = from && from.alive !== false ? from : null;
  LOPT.to = to && to.alive !== false ? to : null;
  w.fx.lightning?.(x1, y1, x2, y2, LOPT);
  LOPT.from = null;
  LOPT.to = null;
}

/**
 * Arc from `src` to `e`, then hop `jumps` times to the nearest unhit foe within `hopR`.
 * Returns the number of enemies struck.
 */
function chainZap(w, p, src, e, dmg, jumps, hopR, mark, source, slowAmt, slowT, width) {
  e._auxMark = mark;
  strike(w, p, e, dmg, source, 'shock', 40);
  bolt(w, src.x, src.y, e.x, e.y, src, e, width, 0.3, 2);
  w.fx.flare?.(e.x, e.y, 26, ARC, 0.12);
  if (slowAmt) w.applySlow(e, slowAmt, slowT);
  let n = 1;
  let cur = e;
  let cx = e.x;
  let cy = e.y;
  let d = dmg;
  for (let j = 0; j < jumps; j++) {
    nearestN(w, cx, cy, hopR, 1, CHAINQ, mark);
    const nx = CHAINQ[0];
    if (!nx) break;
    nx._auxMark = mark;
    d *= CHAIN_FALLOFF;
    strike(w, p, nx, d, source, 'shock', 30);
    bolt(w, cx, cy, nx.x, nx.y, cur, nx, width * 0.8, 0.2, 1);
    if (slowAmt) w.applySlow(nx, slowAmt, slowT);
    cur = nx;
    cx = nx.x;
    cy = nx.y;
    n++;
  }
  CHAINQ.length = 0;
  return n;
}

function coilPos(p, slot) {
  const d = slot.data;
  if (!d.coil) d.coil = { x: p.x, y: p.y };
  return mount(p, -0.27, 0, d.coil);
}

export const TeslaCoil = {
  maxLevel: 5,
  levelDesc: (level) => lv(LEVELS, level),

  init(p, slot) {
    slot.data.coil = { x: p.x, y: p.y };
    slot.data.flash = 0;
    slot.cd = 0.6;
  },

  update(p, slot, dt, w) {
    const d = slot.data;
    if (d.flash === undefined) TeslaCoil.init(p, slot);
    const i = slot.level;
    const c = coilPos(p, slot);
    d.flash = Math.max(0, (d.flash || 0) - dt * 4);
    if (!ready(slot, dt, lv(INTERVAL, i) * cdScale(p))) return;
    const area = areaScale(p);
    const n = lv(TARGETS, i) + extraProj(p);
    nearestN(w, c.x, c.y, lv(RANGE, i) * area, n, PRIMARY);
    if (!PRIMARY.length) {
      slot.cd = 0.15; // stay charged; re-check shortly
      return;
    }
    const mark = newMark();
    const dmg = lv(DMG, i) * dmgScale(p, w);
    const oc = lv(OVERCHARGE, i);
    for (let k = 0; k < PRIMARY.length; k++) {
      const e = PRIMARY[k];
      if (!e.alive || e._auxMark === mark) continue;
      chainZap(w, p, c, e, dmg, lv(CHAIN, i), CHAIN_R * area, mark, SRC, oc ? 0.5 : 0, 0.8 * durScale(p), 3.4);
    }
    PRIMARY.length = 0;
    d.flash = 1;
    slot.kick = 1;
    w.fx.flare?.(c.x, c.y, 34, ARC, 0.14);
    w.sfx('tesla_zap', c.x, c.y, { vol: 0.75, pitch: 0.92 + w.rng.next() * 0.16 });
  },

  draw(ctx, p, slot, w) {
    const d = slot.data;
    const c = mount(p, -0.27, 0, TMP, true);
    Sprites.draw(ctx, 'aux_tesla', c.x, c.y, p.angle + p.t * 0.4, 1);
    const k = slot.cdMax ? 1 - Math.max(0, slot.cd) / slot.cdMax : 1;
    const pulse = 0.5 + 0.5 * Math.sin(p.t * 9);
    glowAt(ctx, 'aux_glow_aether', c.x, c.y, 8 + 10 * k + 14 * d.flash, 0.25 + 0.35 * k * pulse + 0.5 * d.flash);
    // Static crackle as the coil nears full charge.
    if (k > 0.7 || d.flash > 0.2) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = ARC;
      ctx.lineWidth = 1.1;
      ctx.globalAlpha = 0.5 + 0.5 * Math.random();
      ctx.beginPath();
      const arcs = d.flash > 0.2 ? 4 : 2;
      for (let j = 0; j < arcs; j++) {
        const a = Math.random() * TAU;
        const r = 9 + Math.random() * 9;
        crackle(ctx, c.x, c.y, c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, 4, 2.5);
      }
      ctx.stroke();
    }
  },
};

// ---- Thunderhead Dynamo -----------------------------------------------------------------------

const EVO_RANGE = 340;
const EVO_TICK = 0.3;
const EVO_DMG = 10;
const EVO_CAP = 16; // arcs per tick (perf & readability)
const STORM_EVERY = 3.6;
const STORM_TARGETS = 8;
const STORM_DMG = 46;
const STORM_R = 72;

const ALLQ = [];
const STORM_FX = { palette: 'aether', debris: false, cogs: 0, smoke: false, lowSmoke: false, embers: false };
const TMP = { x: 0, y: 0 };

export const Thunderhead = {
  maxLevel: 1,

  init(p, slot) {
    slot.data.coil = { x: p.x, y: p.y };
    slot.data.tick = 0;
    slot.data.flash = 0;
    slot.data.storm = 0;
    slot.cd = 1.2;
  },

  update(p, slot, dt, w) {
    const d = slot.data;
    if (d.storm === undefined) Thunderhead.init(p, slot);
    const c = coilPos(p, slot);
    const area = areaScale(p);
    const scale = dmgScale(p, w);
    d.flash = Math.max(0, d.flash - dt * 3);
    d.storm = Math.max(0, d.storm - dt * 1.6);

    // Constant arcs to every foe in range.
    d.tick -= dt;
    if (d.tick <= 0) {
      d.tick = EVO_TICK * cdScale(p);
      nearestN(w, c.x, c.y, EVO_RANGE * area, EVO_CAP + extraProj(p) * 2, ALLQ);
      if (ALLQ.length) {
        const mark = newMark();
        for (let k = 0; k < ALLQ.length; k++) {
          const e = ALLQ[k];
          if (!e.alive || e._auxMark === mark) continue;
          chainZap(w, p, c, e, EVO_DMG * scale, 1, 150 * area, mark, SRC_EVO, 0.35, 0.4 * durScale(p), 3);
        }
        d.flash = 1;
        w.sfx('tesla_zap', c.x, c.y, { vol: 0.55, pitch: 0.75 + w.rng.next() * 0.2 });
      }
      ALLQ.length = 0;
    }

    // Periodic storm burst: sky bolts on several foes + an aether shockwave.
    if (!ready(slot, dt, STORM_EVERY * cdScale(p))) return;
    nearestN(w, c.x, c.y, 520 * area, STORM_TARGETS + extraProj(p) * 2, ALLQ);
    if (!ALLQ.length) {
      slot.cd = 0.3;
      return;
    }
    const r = STORM_R * area;
    for (let k = 0; k < ALLQ.length; k++) {
      const e = ALLQ[k];
      const x = e.x;
      const y = e.y;
      if (k === 0) w.weather?.strike?.(x, y, { flash: 0.22, sound: false });
      else bolt(w, x + (w.rng.next() - 0.5) * 120, y - 420, x, y, null, null, 5, 0.32, 3, ARC_HOT);
      w.fx.explosion?.(x, y, 0.8, STORM_FX);
      w.fx.shockwave?.(x, y, r * 1.2, ARC, 0.35);
      w.explode(x, y, r, STORM_DMG * scale, {
        team: 'player', owner: p, source: SRC_EVO, element: 'shock', visual: false, sound: false,
        knockback: 220, falloff: 0.3,
      });
    }
    ALLQ.length = 0;
    w.fx.shockwave?.(c.x, c.y, 260 * area, ARC, 0.5);
    w.fx.flare?.(c.x, c.y, 46, ARC, 0.2);
    w.sfx('thunder', c.x, c.y, { vol: 0.8 });
    w.sfx('tesla_zap', c.x, c.y, { vol: 1, pitch: 0.6 });
    w.shake(0.22);
    d.storm = 1;
    slot.kick = 1;
  },

  draw(ctx, p, slot, w) {
    const d = slot.data;
    const c = mount(p, -0.27, 0, TMP, true);
    const area = areaScale(p);
    const pulse = 0.5 + 0.5 * Math.sin(p.t * 7);
    glowAt(ctx, 'aux_glow_aether', c.x, c.y, 22 + 8 * pulse + 16 * d.storm, 0.22 + 0.12 * d.flash + 0.18 * d.storm);
    Sprites.draw(ctx, 'aux_dynamo', c.x, c.y, p.t * 1.3, 1.05);
    // Orbiting charge motes.
    for (let j = 0; j < 3; j++) {
      const a = p.t * 3.2 + (j * TAU) / 3;
      glowAt(ctx, 'aux_glow_aether', c.x + Math.cos(a) * 22, c.y + Math.sin(a) * 22, 7, 0.8);
    }
    // Range halo: faint dashed ring so players can read the field.
    const R = EVO_RANGE * area;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = ARC;
    ctx.globalAlpha = 0.07 + 0.05 * pulse + 0.15 * d.storm;
    ctx.lineWidth = 2;
    DASH[0] = 14;
    DASH[1] = 18;
    ctx.setLineDash(DASH);
    ctx.lineDashOffset = -p.t * 40;
    ctx.beginPath();
    ctx.arc(p.x, p.y, R, 0, TAU);
    ctx.stroke();
    ctx.setLineDash(NO_DASH);
    // Constant crackle around the globe.
    ctx.globalAlpha = 0.55 + 0.45 * Math.random();
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let j = 0; j < 4; j++) {
      const a = Math.random() * TAU;
      const r = 16 + Math.random() * 18;
      crackle(ctx, c.x, c.y, c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, 5, 3.5);
    }
    ctx.stroke();
    void w;
  },
};
