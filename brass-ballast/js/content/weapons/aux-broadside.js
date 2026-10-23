// Broadside Battery & Ship of the Line (WP18, DESIGN §2.7). Rows of flank guns ripple-fire
// cannonballs perpendicular to the hull, bow to stern, with recoil, muzzle flame and gunsmoke.
// Ship of the Line fires full 5-gun broadsides every second, and every fourth is double-shotted.

import { Sprites } from '../../gfx/sprites.js';
import {
  dmgScale, cdScale, areaScale, extraProj, lv, ready, decayKick, hullDims, bob, glowAt, onScreen,
} from './aux-common.js';

const SRC = 'aux:broadside';
const SRC_EVO = 'aux:shipOfTheLine';

const INTERVAL = [2, 2, 2, 1.6, 1.6];
const PER_SIDE = [3, 3, 4, 4, 5];
const DMG = [14, 18, 18, 18, 18];
const PIERCE = [0, 0, 0, 1, 1];
const SHELLS = [0, 0, 0, 0, 1];

const LEVELS = [
  'Every 2 s, fires 3 cannonballs from each flank, perpendicular to your hull (14 damage).',
  'Damage 14 → 18.',
  '+1 gun per side (4).',
  'Reload 2 s → 1.6 s; balls pierce 1 foe.',
  '+1 gun per side (5); explosive shells burst on impact (radius 34).',
];

const MAX_GUNS = 10;
const RIPPLE = 0.05;
const RANGE = 560;
const FLANK = 0.4;
const TMP = { x: 0, y: 0 };
const SMOKE = { count: 1, alpha: 0.38, life: 0.9, spread: 10, vx: 0, vy: 0, color: '#efe8dc', color1: '#b8b0a4' };

function ballTrail(p, w) {
  if (Math.random() < 0.3) w.fx.smokeTrail?.(p.x, p.y, 0.3 * p.scale, TRAIL);
}
const TRAIL = { alpha: 0.25, life: 0.6 };

const BALL = {
  team: 'player', kind: 'ball', x: 0, y: 0, angle: 0, speed: 680, r: 6, damage: 14, life: 0.8,
  pierce: 0, owner: null, source: SRC, scale: 1, knockback: 120, trail: ballTrail,
  glow: '#ffcf8a', glowSize: 2.2, explode: null,
};
/** Per-volley shell spec (balls in flight keep a reference, so never mutate a live one). */
function shellSpec(radius, damage, evo) {
  return { radius, damage, falloff: 0.3, visual: 'small', sound: 'explode_small', shake: evo ? 0.03 : 0.02, onExpire: false, knockback: evo ? 160 : 120 };
}

/** Hull-local x positions (fraction of length) of the guns in a row of `n`. */
function gunX(i, n, evo) {
  const span = Math.min(evo ? 0.46 : 0.38, 0.085 * (n - 1) + 0.02);
  return n > 1 ? -span / 2 + (span * i) / (n - 1) + 0.02 : 0.02;
}

function gunPos(p, i, n, side, evo, out, withBob) {
  const d = hullDims(p);
  const lx = gunX(i, n, evo) * d.w;
  const ly = FLANK * d.h * side;
  const c = Math.cos(p.angle);
  const s = Math.sin(p.angle);
  out.x = p.x + lx * c - ly * s;
  out.y = p.y + lx * s + ly * c + (withBob ? bob(p) : 0);
  return out;
}

function fireGun(p, slot, w, i, n, side, evo, pass) {
  const d = slot.data;
  const g = gunPos(p, i, n, side, evo, TMP, false);
  const out = p.angle + (side * Math.PI) / 2;
  const area = areaScale(p);
  const len = (evo ? 18 : 13) * 1;
  const mx = g.x + Math.cos(out) * len;
  const my = g.y + Math.sin(out) * len;
  const o = BALL;
  o.x = mx;
  o.y = my;
  // Second pass of a double-shotted broadside fans out a little.
  const fan = pass ? (i / Math.max(1, n - 1) - 0.5) * 0.3 : 0;
  o.angle = out + fan + (w.rng.next() - 0.5) * 0.05;
  o.speed = (evo ? 760 : 680) * (p.stats.projSpeed ?? 1);
  o.life = (RANGE * (evo ? 1.2 : 1)) / o.speed;
  o.scale = (evo ? 1.35 : 1) * Math.sqrt(area);
  o.r = 6 * o.scale;
  o.damage = d.dmg;
  o.pierce = d.pierce;
  o.owner = p;
  o.source = evo ? SRC_EVO : SRC;
  o.explode = d.shell || null;
  o.knockback = evo ? 170 : 120;
  w.fire(o);
  o.owner = null;
  d.kick[(side > 0 ? MAX_GUNS : 0) + i] = 1;
  if (onScreen(w, mx, my)) {
    w.fx.muzzle?.(mx, my, out, evo ? 0.8 : 0.62);
    // A puff of white gunsmoke from every other port, blown clear of the hull.
    if ((i & 1) === 0) {
      SMOKE.vx = Math.cos(out) * 110 + p.vx * 0.6;
      SMOKE.vy = Math.sin(out) * 110 + p.vy * 0.6;
      w.fx.smoke?.(mx + Math.cos(out) * 10, my + Math.sin(out) * 10, evo ? 0.5 : 0.4, SMOKE);
    }
  }
}

function startVolley(p, slot, w, evo, n, passes) {
  const d = slot.data;
  d.n = n;
  d.idx = 0;
  d.total = n * passes;
  d.rT = 0;
  d.volleys = (d.volleys || 0) + 1;
  slot.kick = 1;
  w.sfx('broadside_fire', p.x, p.y, { vol: evo ? 1 : 0.85, pitch: 0.95 + w.rng.next() * 0.1 });
  if (passes > 1) w.sfx('broadside_fire', p.x, p.y, { vol: 0.9, pitch: 0.8, delay: n * RIPPLE });
  w.shake(evo ? (passes > 1 ? 0.2 : 0.12) : 0.06);
}

function stepVolley(p, slot, dt, w, evo) {
  const d = slot.data;
  decayKick(slot, dt);
  for (let k = 0; k < d.kick.length; k++) if (d.kick[k] > 0) d.kick[k] = Math.max(0, d.kick[k] - dt * 5);
  if (d.idx >= d.total) return false;
  d.rT -= dt;
  while (d.idx < d.total && d.rT <= 0) {
    d.rT += RIPPLE;
    const pass = (d.idx / d.n) | 0;
    const i = d.idx % d.n;
    fireGun(p, slot, w, i, d.n, 1, evo, pass);
    fireGun(p, slot, w, i, d.n, -1, evo, pass);
    d.idx++;
  }
  return true;
}

function initData(slot) {
  const d = slot.data;
  d.kick = new Array(MAX_GUNS * 2).fill(0);
  d.idx = 0;
  d.total = 0;
  d.n = 3;
  d.rT = 0;
  d.volleys = 0;
  slot.cd = 0.8;
}

function drawGuns(ctx, p, slot, n, sprite, evo) {
  const d = slot.data;
  for (let s = 0; s < 2; s++) {
    const side = s ? 1 : -1;
    const out = p.angle + (side * Math.PI) / 2;
    const c = Math.cos(out);
    const sn = Math.sin(out);
    for (let i = 0; i < n; i++) {
      const g = gunPos(p, i, n, side, evo, TMP, true);
      const k = d.kick[(side > 0 ? MAX_GUNS : 0) + i] || 0;
      const rx = g.x - c * k * 4;
      const ry = g.y - sn * k * 4;
      Sprites.draw(ctx, sprite, rx, ry, out, evo ? 0.92 : 0.85);
      if (k > 0.35) {
        const L = evo ? 20 : 15;
        glowAt(ctx, 'aux_glow_fire', rx + c * L, ry + sn * L, (evo ? 12 : 9) * k, 0.8 * k);
      }
    }
  }
}

export const Broadside = {
  maxLevel: 5,
  levelDesc: (level) => lv(LEVELS, level),

  init(p, slot) {
    initData(slot);
  },

  update(p, slot, dt, w) {
    if (!slot.data.kick) initData(slot);
    const d = slot.data;
    if (stepVolley(p, slot, dt, w, false)) return;
    const i = slot.level;
    if (!ready(slot, dt, lv(INTERVAL, i) * cdScale(p))) return;
    // Hold fire with nobody about — but stay loaded.
    if (!w.nearestEnemy(p.x, p.y, RANGE + 60)) {
      slot.cd = 0.15;
      return;
    }
    const sc = dmgScale(p, w);
    d.dmg = lv(DMG, i) * sc;
    d.pierce = lv(PIERCE, i);
    d.shell = lv(SHELLS, i) ? shellSpec(34 * areaScale(p), d.dmg * 0.5, false) : null;
    startVolley(p, slot, w, false, Math.min(MAX_GUNS, lv(PER_SIDE, i) + extraProj(p)), 1);
    stepVolley(p, slot, 0, w, false);
  },

  draw(ctx, p, slot) {
    const n = Math.min(MAX_GUNS, lv(PER_SIDE, slot.level) + extraProj(p));
    drawGuns(ctx, p, slot, n, 'aux_gun', false);
  },
};

// ---- Ship of the Line ---------------------------------------------------------------------------

const EVO_INTERVAL = 1;
const EVO_PER_SIDE = 5;
const EVO_DMG = 26;

export const ShipOfTheLine = {
  maxLevel: 1,

  init(p, slot) {
    initData(slot);
    slot.cd = 0.4;
  },

  update(p, slot, dt, w) {
    if (!slot.data.kick) initData(slot);
    const d = slot.data;
    if (stepVolley(p, slot, dt, w, true)) return;
    if (!ready(slot, dt, EVO_INTERVAL * cdScale(p))) return;
    if (!w.nearestEnemy(p.x, p.y, RANGE * 1.2 + 60)) {
      slot.cd = 0.12;
      return;
    }
    d.dmg = EVO_DMG * dmgScale(p, w);
    d.pierce = 2;
    d.shell = shellSpec(46 * areaScale(p), d.dmg * 0.6, true);
    const grand = ((d.volleys + 1) % 4) === 0;
    startVolley(p, slot, w, true, Math.min(MAX_GUNS, EVO_PER_SIDE + extraProj(p)), grand ? 2 : 1);
    if (grand) {
      w.fx.ring?.(p.x, p.y, 90, '#ffcf8a', 0.35, { width: 3 });
      w.floatText(p.x, p.y - 44, 'FULL BROADSIDE!', { color: '#ffcf4a', size: 14, life: 0.8 });
    }
    stepVolley(p, slot, 0, w, true);
  },

  draw(ctx, p, slot) {
    const n = Math.min(MAX_GUNS, EVO_PER_SIDE + extraProj(p));
    drawGuns(ctx, p, slot, n, 'aux_gun_heavy', true);
  },
};
