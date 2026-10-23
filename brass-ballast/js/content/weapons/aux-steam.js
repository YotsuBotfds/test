// Scalding Vents & Scalding Nimbus (WP18, DESIGN §2.7). The hull vents superheated steam into a
// swirling ring that scalds and slows anything inside. The Nimbus is a vast rolling cloud with
// erupting geysers that also shreds armour: foes inside take +25% damage from every source.

import { Sprites } from '../../gfx/sprites.js';
import {
  TAU, dmgScale, cdScale, areaScale, durScale, lv, ready, strike, inRange, nearestN, glowAt, blast,
} from './aux-common.js';

const SRC = 'aux:steamVents';
const SRC_EVO = 'aux:scaldingNimbus';

const RADIUS = [90, 105, 105, 120, 120];
const DPS = [10, 10, 14, 14, 20];
const SLOW = [0.2, 0.2, 0.2, 0.3, 0.3];
const BLOWOUT = [0, 0, 0, 0, 1];

const LEVELS = [
  'A swirling ring of scalding steam (radius 90) deals 10 damage/s and slows foes 20%.',
  'Aura radius 90 → 105.',
  'Damage 10 → 14/s.',
  'Radius 105 → 120; slow 20% → 30%.',
  'Boiler blowout: every 3 s the vents erupt for a triple tick with knockback; 20 damage/s.',
];

const TICK = 0.25;
const BLOWOUT_EVERY = 3;
const Q = [];
const PUFF = { count: 1, spread: 0.3, alpha: 0.5, speed: 0.6 };
const PUFF_BIG = { count: 2, spread: 0.4, alpha: 0.55, speed: 0.8 };

function aura(p, slot, w, R, dps, slow, src, kb, mult) {
  inRange(w, p.x, p.y, R, Q);
  const dmg = dps * TICK * dmgScale(p, w) * mult;
  const slowT = 0.6 * durScale(p);
  for (let i = 0; i < Q.length; i++) {
    const e = Q[i];
    if (!e.alive) continue;
    const a = Math.atan2(e.y - p.y, e.x - p.x);
    strike(w, p, e, dmg, src, 'steam', kb, a, true);
    if (slow) w.applySlow(e, slow, slowT);
  }
  const n = Q.length;
  Q.length = 0;
  return n;
}

/** Steam puffs swirling off the ring edge (throttled; cheap). */
function puffs(p, d, dt, w, R, rate, big) {
  d.puff -= dt;
  while (d.puff <= 0) {
    d.puff += rate;
    const a = Math.random() * TAU;
    const r = R * (0.75 + Math.random() * 0.3);
    const x = p.x + Math.cos(a) * r;
    const y = p.y + Math.sin(a) * r;
    // Tangential jet = swirl.
    w.fx.steam?.(x, y, a + Math.PI / 2 + (Math.random() - 0.5) * 0.4, big ? 0.75 : 0.5, big ? PUFF_BIG : PUFF);
  }
}

function drawRing(ctx, p, R, alphaA, alphaB, t, warm) {
  const s = (R / 54) * 1.02;
  // Faint scald tint over the whole area so the zone reads at a glance.
  ctx.globalAlpha = warm ? 0.1 : 0.07;
  ctx.fillStyle = warm ? '#ffe2cc' : '#eef8ff';
  ctx.beginPath();
  ctx.arc(p.x, p.y, R, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  if (warm) glowAt(ctx, 'aux_glow_fire', p.x, p.y, R * 0.85, 0.12 + 0.04 * Math.sin(t * 2.3));
  Sprites.draw(ctx, 'aux_steam_ring', p.x, p.y, t * 0.55, s, alphaA);
  Sprites.draw(ctx, 'aux_steam_ring', p.x, p.y, -t * 0.85 + 1.3, s * 0.93, alphaB);
  // A crisp rim so the danger edge reads on bright skies.
  ctx.globalAlpha = 0.32 + 0.1 * Math.sin(t * 4);
  ctx.strokeStyle = warm ? '#ffe6d0' : '#f4f1ea';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([R * 0.18, R * 0.12]);
  ctx.lineDashOffset = -t * 30;
  ctx.beginPath();
  ctx.arc(p.x, p.y, R, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

export const SteamVents = {
  maxLevel: 5,
  levelDesc: (level) => lv(LEVELS, level),

  init(p, slot) {
    const d = slot.data;
    d.tick = 0;
    d.puff = 0;
    d.sfx = 0;
    d.blow = BLOWOUT_EVERY;
    d.pulse = 0;
  },

  update(p, slot, dt, w) {
    const d = slot.data;
    const i = slot.level;
    const R = lv(RADIUS, i) * areaScale(p);
    d.pulse = Math.max(0, d.pulse - dt * 2.2);
    d.sfx -= dt;
    puffs(p, d, dt, w, R, 0.07, false);
    if (lv(BLOWOUT, i)) {
      d.blow -= dt;
      slot.cdMax = BLOWOUT_EVERY * cdScale(p);
      slot.cd = Math.max(0, d.blow);
      if (d.blow <= 0) {
        d.blow = BLOWOUT_EVERY * cdScale(p);
        d.pulse = 1;
        aura(p, slot, w, R * 1.1, lv(DPS, i), lv(SLOW, i) + 0.1, SRC, 260, 3);
        w.fx.steamBurst?.(p.x, p.y, R / 60, 16);
        w.sfx('steam_vent', p.x, p.y, { vol: 0.9, pitch: 0.8 });
      }
    } else {
      slot.cdMax = 0;
      slot.cd = 0;
    }
    d.tick -= dt;
    if (d.tick > 0) return;
    d.tick += TICK;
    const hit = aura(p, slot, w, R, lv(DPS, i), lv(SLOW, i), SRC, 0, 1);
    if (d.sfx <= 0 && (hit || d.sfx < -4)) {
      d.sfx = hit ? 1.4 : 0;
      w.sfx('steam_vent', p.x, p.y, { vol: hit ? 0.5 : 0.25, pitch: 0.9 + Math.random() * 0.2 });
    }
  },

  drawUnder(ctx, p, slot) {
    const d = slot.data;
    const R = lv(RADIUS, slot.level) * areaScale(p);
    drawRing(ctx, p, R, 0.6, 0.42, p.t, false);
    if (d.pulse > 0) {
      ctx.globalAlpha = d.pulse * 0.5;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6 * d.pulse;
      ctx.beginPath();
      ctx.arc(p.x, p.y, R * (1.25 - 0.25 * d.pulse), 0, TAU);
      ctx.stroke();
    }
  },
};

// ---- Scalding Nimbus -----------------------------------------------------------------------------

const EVO_R = 195;
const EVO_DPS = 28;
const EVO_SLOW = 0.4;
const SHRED = 1.25;
const GEYSER_EVERY = 0.85;
const GEYSER_DMG = 34;
const GEYSER_R = 56;

let shredTick = 1;
const GEYSER_FX = { palette: 'steam', debris: false, cogs: 0, smoke: false, lowSmoke: false, embers: false };

/** Armor shred: multiply dmgTakenMult while inside; restore when they leave or on remove. */
function shred(p, slot, w, R) {
  const d = slot.data;
  const list = d.shred;
  const tick = ++shredTick;
  inRange(w, p.x, p.y, R, Q);
  for (let i = 0; i < Q.length; i++) {
    const e = Q[i];
    e._auxShredT = tick;
    if (!e._auxShred) {
      e._auxShred = true;
      e.dmgTakenMult = (e.dmgTakenMult ?? 1) * SHRED;
      list.push(e);
    }
  }
  Q.length = 0;
  let j = 0;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.alive && e._auxShredT === tick) {
      list[j++] = e;
      continue;
    }
    unshred(e);
  }
  list.length = j;
}

function unshred(e) {
  if (!e._auxShred) return;
  e._auxShred = false;
  e.dmgTakenMult = (e.dmgTakenMult ?? SHRED) / SHRED;
}

export const ScaldingNimbus = {
  maxLevel: 1,

  init(p, slot) {
    const d = slot.data;
    d.tick = 0;
    d.puff = 0;
    d.sfx = 0;
    d.shred = [];
    d.flare = 0;
    slot.cd = 0.5;
  },

  update(p, slot, dt, w) {
    const d = slot.data;
    const area = areaScale(p);
    const R = EVO_R * area;
    d.flare = Math.max(0, d.flare - dt * 3);
    d.sfx -= dt;
    puffs(p, d, dt, w, R, 0.03, true);
    d.tick -= dt;
    if (d.tick <= 0) {
      d.tick += TICK;
      shred(p, slot, w, R);
      const hit = aura(p, slot, w, R, EVO_DPS, EVO_SLOW, SRC_EVO, 0, 1);
      if (d.sfx <= 0 && hit) {
        d.sfx = 1.1;
        w.sfx('steam_vent', p.x, p.y, { vol: 0.65, pitch: 0.7 + Math.random() * 0.2 });
      }
    }
    // Geysers erupt under foes inside the cloud.
    if (!ready(slot, dt, GEYSER_EVERY * cdScale(p))) return;
    nearestN(w, p.x, p.y, R, 6, Q);
    if (!Q.length) {
      Q.length = 0;
      return;
    }
    const e = Q[(Math.random() * Q.length) | 0];
    Q.length = 0;
    const r = GEYSER_R * area;
    blast(w, p, e.x, e.y, r, GEYSER_DMG * dmgScale(p, w), SRC_EVO, {
      visual: false, sound: false, element: 'steam', knockback: 200, falloff: 0.2,
    });
    w.fx.steamBurst?.(e.x, e.y, r / 45, 14);
    w.fx.explosion?.(e.x, e.y, 0.6, GEYSER_FX);
    w.sfx('steam_vent', e.x, e.y, { vol: 0.6, pitch: 1.3 });
    d.flare = 1;
  },

  drawUnder(ctx, p, slot) {
    const d = slot.data;
    const R = EVO_R * areaScale(p);
    drawRing(ctx, p, R, 0.62 + 0.2 * d.flare, 0.45, p.t, true);
    drawRing(ctx, p, R * 0.62, 0.3, 0.22, -p.t * 1.4, true);
  },

  draw(ctx, p, slot) {
    // Cracked-armour markers on shredded foes.
    const list = slot.data.shred;
    if (!list || !list.length) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = '#ff8a5a';
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.45 + 0.2 * Math.sin(p.t * 8);
    ctx.beginPath();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.alive) continue;
      const r = e.r + 6;
      const a0 = p.t * 2 + i;
      for (let k = 0; k < 3; k++) {
        const a = a0 + (k * TAU) / 3;
        ctx.moveTo(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r);
        ctx.arc(e.x, e.y, r, a, a + 1.1);
      }
    }
    ctx.stroke();
  },

  remove(p, slot) {
    const list = slot.data.shred || [];
    for (let i = 0; i < list.length; i++) unshred(list[i]);
    list.length = 0;
  },
};

