// Shared helpers for auxiliary systems (WP18): stat scaling, crit-aware direct damage, target
// selection without allocations, hull-mounted hardware placement, cooldown bookkeeping and a
// few additive draw helpers. Every aux behavior file imports from here.

import { Sprites } from '../../gfx/sprites.js';

export const TAU = Math.PI * 2;

// ---- Stats -------------------------------------------------------------------------------------

/** Final damage multiplier for player-owned aux damage (stats.damage × run.mods.playerDmg). */
export function dmgScale(p, w) {
  return (p.stats?.damage ?? 1) * (w.run?.mods?.playerDmg ?? 1);
}

/** Interval multiplier (stats.cooldown, engine clamps ≥ .2). */
export function cdScale(p) {
  return p.stats?.cooldown ?? 1;
}

/** Radius / scale multiplier (stats.area). */
export function areaScale(p) {
  return p.stats?.area ?? 1;
}

/** Duration multiplier (slows, lingering fields, mine lifetimes). */
export function durScale(p) {
  return p.stats?.duration ?? 1;
}

/** Extra projectiles from Twin Barrels etc. */
export function extraProj(p) {
  return Math.max(0, Math.round(p.stats?.projCount ?? 0));
}

/** Level table lookup (1-based level, clamped). */
export function lv(table, level) {
  return table[Math.max(0, Math.min(table.length - 1, (level | 0) - 1))];
}

/**
 * Cooldown tick: counts `slot.cd` down and returns true when it fires (re-arming to `secs`).
 * Publishes `slot.cdMax` so the HUD can draw a cooldown sweep.
 */
export function ready(slot, dt, secs) {
  slot.cdMax = secs;
  if (slot.cd > secs) slot.cd = secs; // cooldown stat improved mid-countdown
  slot.cd -= dt;
  if (slot.cd > 0) return false;
  slot.cd = secs;
  return true;
}

// ---- Damage ------------------------------------------------------------------------------------

const HIT = {
  source: '',
  crit: false,
  knockback: 0,
  angle: 0,
  owner: null,
  element: 'kinetic',
  silent: false,
  small: false,
  noCombo: false,
  projectile: null,
  x: 0,
  y: 0,
};

/** Roll a crit for a direct (non-projectile) aux hit; returns the multiplier (1 = no crit). */
export function critRoll(p, w) {
  const st = p.stats;
  return st && w.rng.next() < (st.crit || 0) ? st.critMult || 1.75 : 1;
}

/**
 * Direct damage to an enemy from an aux (rolls crit from the owner's stats). The engine scales
 * knockback by owner.stats.knockback.
 * @returns {number} damage dealt
 */
export function strike(w, p, e, amount, source, element = 'kinetic', knockback = 0, angle, small = false) {
  if (!e || !e.alive) return 0;
  const mult = critRoll(p, w);
  HIT.source = source;
  HIT.crit = mult > 1;
  HIT.knockback = knockback;
  HIT.angle = angle ?? Math.atan2(e.y - p.y, e.x - p.x);
  HIT.owner = p;
  HIT.element = element;
  HIT.small = small && mult === 1;
  HIT.silent = false;
  HIT.noCombo = false;
  HIT.x = e.x;
  HIT.y = e.y;
  const dealt = w.damageEnemy(e, amount * mult, HIT);
  HIT.owner = null;
  return dealt;
}

/**
 * Explosion owned by the player with a crit roll. Visuals come from boom() (size-capped) rather
 * than the engine's radius-scaled ones: aux blasts are frequent and often chain, and the stock
 * large/huge explosions are far too fill-rate heavy at that rate. opts.visual === false = silent.
 */
export function blast(w, p, x, y, radius, damage, source, opts) {
  const o = EXP;
  o.team = 'player';
  o.owner = p;
  o.source = source;
  o.falloff = opts?.falloff ?? 0.35;
  o.knockback = opts?.knockback ?? radius * 1.6;
  o.shake = opts?.shake ?? 0;
  o.burn = opts?.burn ?? undefined;
  o.element = opts?.element ?? 'fire';
  const c = critRoll(p, w);
  o.crit = c > 1 ? c : undefined;
  const n = w.explode(x, y, radius, damage, o);
  o.owner = null;
  o.burn = undefined;
  if (opts?.visual !== false) boom(w, x, y, radius, opts?.palette, opts?.sound, opts?.big);
  return n;
}
const EXP = {
  team: 'player', owner: null, source: '', falloff: 0.35, knockback: 0, visual: false,
  sound: false, shake: 0, burn: undefined, element: 'fire', crit: undefined,
};

const BOOM = { palette: 'fire', debris: false, cogs: 0, lowSmoke: false, ring: false, embers: true, smoke: false };
const PUFF = { count: 2, alpha: 0.32, life: 1.1, spread: 26 };

/**
 * Size-capped explosion visual + a shockwave that matches the gameplay radius (so the AoE still
 * reads) + sound. `sound` false = none, undefined = picked by radius.
 */
export function boom(w, x, y, radius, palette = 'fire', sound, big = false) {
  const fx = w.fx;
  const s = Math.max(0.35, Math.min(big ? 1.35 : 1.1, radius / 70));
  BOOM.palette = palette || 'fire';
  BOOM.debris = big ? 'metal' : false;
  BOOM.debrisCount = 3;
  fx.explosion?.(x, y, s, BOOM);
  // Light after-smoke (the stock billows are big dark discs that pile up under chained blasts).
  fx.smoke?.(x, y, 0.45 + s * 0.35, PUFF);
  fx.shockwave?.(x, y, radius * 1.1, palette === 'aether' ? '#7ff3ff' : '#ffd9a0', 0.32);
  if (sound !== false) w.sfx(sound || (radius >= 70 ? 'explode_medium' : 'explode_small'), x, y, SFX);
}
const SFX = { vol: 0.8 };

// ---- Targeting ---------------------------------------------------------------------------------

const Q = [];

/**
 * Fill `out` with up to `n` nearest targetable enemies within `r` of (x, y), nearest first.
 * Enemies whose `_auxMark === mark` are skipped (pass mark 0 to skip nothing).
 */
export function nearestN(w, x, y, r, n, out, mark = 0) {
  out.length = 0;
  if (n <= 0) return out;
  Q.length = 0;
  w.queryEnemies(x, y, r, Q);
  for (let i = 0; i < Q.length; i++) {
    const e = Q[i];
    if (e.fleeing || (mark && e._auxMark === mark)) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const d = dx * dx + dy * dy;
    const rr = r + e.r * 0.5; // big hulls count once half their body is inside
    if (d > rr * rr) continue;
    e._auxD = d;
    // Insertion into a short sorted list (n is small).
    let j = out.length;
    if (j >= n && d >= out[j - 1]._auxD) continue;
    if (j < n) out.push(e);
    else j = n - 1;
    while (j > 0 && out[j - 1]._auxD > d) {
      out[j] = out[j - 1];
      j--;
    }
    out[j] = e;
  }
  Q.length = 0;
  return out;
}

/** All targetable enemies within r (unsorted) into `out`. */
export function inRange(w, x, y, r, out) {
  out.length = 0;
  w.queryEnemies(x, y, r, out); // body-overlap test is done by the spatial hash
  let j = 0;
  for (let i = 0; i < out.length; i++) {
    const e = out[i];
    if (!e.fleeing) out[j++] = e;
  }
  out.length = j;
  return out;
}

let markSeq = 1;
/** Fresh mark id for nearestN exclusion within one volley/zap. */
export function newMark() {
  markSeq = (markSeq + 1) % 1e9 || 1;
  return markSeq;
}

// ---- Hull geometry -----------------------------------------------------------------------------

const dims = new Map();
/** Hull sprite size {w, h} (cached per sprite name). */
export function hullDims(p) {
  const name = p.hull?.sprite || 'hull_dauntless';
  let d = dims.get(name);
  if (!d) {
    const s = Sprites.get(name);
    d = { w: s.w || 96, h: s.h || 48 };
    dims.set(name, d);
  }
  return d;
}

/** The same visual bob the player renderer applies to the hull. */
export function bob(p) {
  return Math.sin(p.t * 2.3 + p.index) * 2.2;
}

/**
 * World position of a hull-relative mount given as fractions of the hull sprite size
 * (fx along the keel, +fy = starboard). `withBob` adds the render bob (draw hooks).
 */
export function mount(p, fx, fy, out, withBob = false) {
  const d = hullDims(p);
  const lx = fx * d.w;
  const ly = fy * d.h;
  const c = Math.cos(p.angle);
  const s = Math.sin(p.angle);
  out.x = p.x + lx * c - ly * s;
  out.y = p.y + lx * s + ly * c + (withBob ? bob(p) : 0);
  return out;
}

// ---- Drawing -----------------------------------------------------------------------------------

/** Additive soft glow using one of the aux glow sprites (see aux-art.js). */
export function glowAt(ctx, sprite, x, y, radius, alpha) {
  if (alpha <= 0.01 || radius <= 0.5) return;
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  Sprites.draw(ctx, sprite, x, y, 0, radius / 16, alpha);
  ctx.globalCompositeOperation = prev;
}

/** Jagged mini-arc drawn directly (no allocation); caller sets stroke style & composite. */
export function crackle(ctx, x1, y1, x2, y2, segs, jit) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  ctx.moveTo(x1, y1);
  for (let i = 1; i < segs; i++) {
    const k = i / segs;
    const o = (Math.random() - 0.5) * 2 * jit;
    ctx.lineTo(x1 + dx * k + nx * o, y1 + dy * k + ny * o);
  }
  ctx.lineTo(x2, y2);
}

/** Is (x, y) inside the current view (with margin)? Uses the world's per-frame draw view. */
export function onScreen(w, x, y, m = 60) {
  const v = w._drawView;
  if (!v || !(v.x1 > v.x0)) return true;
  return x > v.x0 - m && x < v.x1 + m && y > v.y0 - m && y < v.y1 + m;
}
