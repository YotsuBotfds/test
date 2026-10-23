// WP13 — shared helpers for the Iron Syndicate warships: palette, sprite registration, the
// recurring Syndicate fittings (ember portholes, crimson-banded stacks, armour plating) and the
// runtime helpers that place animated part sprites in hull-local space.

import { Sprites } from '../../gfx/sprites.js';
import {
  TAU,
  alpha,
  glow,
  ink,
  metal,
  polygon,
  porthole,
  rimLight,
  shadeOverlay,
  smokestack,
  propeller,
  rivet,
} from '../../gfx/drawkit.js';

/** Iron Syndicate palette (DESIGN §5: gunmetal, soot, crimson, ember). */
export const SYN = {
  hull: '#4b4f58',
  hullLight: '#7a808b',
  hullDark: '#2a2c31',
  soot: '#141518',
  crimson: '#c0392b',
  crimsonDark: '#7a1d14',
  ember: '#ff7a2f',
  emberHot: '#ffd2a0',
  arc: '#ff4da6', // Syndicate tesla arcs read as enemy fire (magenta), unlike the player's aether
  arcCore: '#ffe0f0',
  ghost: '#c9f2e6',
  ghostDeep: '#5fb8a8',
};

/** Hero-ish render scale for warship art (sprites are cached once, so this is cheap). */
const ART_SCALE = 3;

/**
 * Register a sprite with the warship defaults.
 * @param {string} name
 * @param {number} w @param {number} h
 * @param {(ctx:CanvasRenderingContext2D, w:number, h:number, frame:number)=>void} draw
 * @param {{frames?:number, scale?:number, cx?:number, cy?:number}} [opts]
 */
export function reg(name, w, h, draw, opts = {}) {
  const def = { w, h, frames: opts.frames ?? 1, scale: opts.scale ?? ART_SCALE, draw };
  if (opts.cx !== undefined) def.cx = opts.cx;
  if (opts.cy !== undefined) def.cy = opts.cy;
  Sprites.register(name, def);
}

/** Mirror a polygon across the horizontal line y = cy. */
export const mirrorY = (pts, cy) => pts.map(([x, y]) => [x, cy * 2 - y]);

/** Ember-lit Syndicate porthole (gunmetal rim, furnace glow). */
export function emberPort(ctx, x, y, r, halo = 2.2) {
  porthole(ctx, x, y, r, { glow: true, color: SYN.ember, kind: 'gunmetal', halo });
}

/** Crimson-banded, ember-throated smokestack. */
export function synStack(ctx, x, y, r, opts = {}) {
  smokestack(ctx, x, y, r, 'gunmetal', { band: SYN.crimson, ember: true, soot: r * 2.6, ...opts });
}

/**
 * Angular armour plate from a polygon: material gradient, top-left bevel, shading, ink and
 * optional rivets at the corners.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number[][]} pts
 * @param {string} [kind]
 * @param {{rivets?:boolean, rivetR?:number, ink?:number, hi?:number, lo?:number}} [opts]
 */
export function armor(ctx, pts, kind = 'syndicate', opts = {}) {
  const { rivets = false, rivetR = 0.55, ink: iw = 1, hi = 0.22, lo = 0.35 } = opts;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  polygon(ctx, pts);
  ctx.fillStyle = metal(ctx, x0, y0, x1, y1, kind);
  ctx.fill();
  shadeOverlay(ctx, x0, y0, x1, y1, hi, lo);
  rimLight(ctx, x0, y0, x1, y1, 0.8, 0.4);
  if (iw) ink(ctx, iw);
  if (rivets) {
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    for (const [x, y] of pts) {
      const dx = cx - x;
      const dy = cy - y;
      const d = Math.hypot(dx, dy) || 1;
      rivet(ctx, x + (dx / d) * 1.6, y + (dy / d) * 1.6, rivetR, 'gunmetal');
    }
  }
}

/** Thin painted line along a polyline (trim stripes, deck markings). */
export function trim(ctx, pts, color, width = 1, closed = false) {
  polygon(ctx, pts, closed);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

/**
 * Register an animated propeller disc (frames spin it; later frames are more blurred so the
 * runtime can pick a frame by speed if it likes).
 */
export function regProp(name, r, blades = 3, frames = 4, opts = {}) {
  const size = Math.ceil(r * 2 + 2);
  reg(
    name,
    size,
    size,
    (ctx, w, h, f) => {
      propeller(ctx, w / 2, h / 2, r, blades, (f / frames) * (TAU / blades), {
        kind: opts.kind ?? 'gunmetal',
        hub: opts.hub ?? 'blackiron',
        tip: opts.tip ?? SYN.crimson,
        blur: opts.blur ?? 0.85,
        width: opts.width ?? 0.3,
      });
    },
    { frames }
  );
}

/** Additive glow dot baked in a sprite (lamps, ports). */
export function hotDot(ctx, x, y, r, color = SYN.ember, a = 1) {
  glow(ctx, x, y, r * 3.2, color, 0.55 * a);
  glow(ctx, x, y, r * 1.4, SYN.emberHot, 0.9 * a, { core: 0.25 });
}

/** Soft translucent wash (ghost mist etc.). */
export function wash(ctx, x, y, rx, ry, color, a) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, alpha(color, a));
  g.addColorStop(0.6, alpha(color, a * 0.45));
  g.addColorStop(1, alpha(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// ---- runtime helpers (used every frame; keep allocation-free) ----------------------------------

const _pt = { x: 0, y: 0 };

/**
 * Hull-local (lx, ly) → world position for enemy `e` (rotated by e.angle, scaled by e.scale).
 * Returns a shared scratch object — copy the fields if you need to keep them.
 */
export function local(e, lx, ly, out = _pt) {
  const c = Math.cos(e.angle);
  const s = Math.sin(e.angle);
  const sc = e.scale;
  out.x = e.x + (lx * c - ly * s) * sc;
  out.y = e.y + (lx * s + ly * c) * sc;
  return out;
}

/** Draw a part sprite at hull-local (lx, ly) with an extra rotation. */
export function drawPart(ctx, e, name, lx, ly, rot = 0, frame = 0, a = 1, scaleMul = 1) {
  const p = local(e, lx, ly);
  Sprites.draw(ctx, name, p.x, p.y, e.angle + rot, e.scale * scaleMul, a * e.alpha, frame);
}

/** Hit-flash overlay for a part sprite (so parts flash with the hull). */
export function flashPart(ctx, e, name, lx, ly, rot = 0, frame = 0, scaleMul = 1) {
  if (!(e.flash > 0)) return;
  const p = local(e, lx, ly);
  Sprites.drawFlash(ctx, name, p.x, p.y, e.angle + rot, e.scale * scaleMul, Math.min(1, e.flash) * 0.9 * e.alpha, frame);
}

/**
 * Sprite-shaped soft shadow for defs with a custom draw (the engine falls back to a blob
 * otherwise). Use as `drawShadow: spriteShadow('enemy_x')`.
 */
export function spriteShadow(name, a = 0.28) {
  return (ctx, e, w, ox, oy) => {
    const k = e.dead ? 0.5 : 1;
    const ph = e.phased ? 0.35 : 1;
    Sprites.drawShadow(ctx, name, e.x + ox, e.y + oy, e.angle, e.scale, a * e.alpha * k * ph, e.data?.shadowFrame ?? 0, 3);
  };
}

/**
 * Standard body draw for custom-draw warships: delegates to the engine's default look (elite
 * rim, burn/slow tints, flash) and darkens the hull while it is a falling wreck.
 */
export function drawBody(ctx, e, w, sprite, frame = 0) {
  w.drawEnemySprite(ctx, e, sprite, frame);
  if (e.dead) Sprites.drawTint(ctx, sprite, e.x, e.y, e.angle, e.scale, '#1c120a', 0.55 * e.alpha, frame);
}

/**
 * Soot from the stacks (more, and on fire, when badly damaged). Throttled; only when on screen.
 * @param {number[][]} stacks hull-local stack mouths
 */
export function puffStacks(e, w, dt, stacks, size = 0.8) {
  e.data.smokeT = (e.data.smokeT ?? 0) - dt;
  if (e.data.smokeT > 0) return;
  const hurt = e.hp < e.maxHp * 0.5;
  e.data.smokeT = hurt ? 0.07 : 0.17;
  if (!w.isVisible(e.x, e.y, 140)) return;
  for (let i = 0; i < stacks.length; i++) {
    const p = local(e, stacks[i][0], stacks[i][1]);
    w.fx.smokeTrail?.(p.x, p.y, size, { fire: hurt });
  }
}

/** Living player nearest to e, or null. */
export const target = (w, e) => w.nearestPlayer(e.x, e.y);

/**
 * Staggered secondary explosions along a hull after death (hull-local points, seconds apart).
 * Positions are resolved now, so the wreck drifting doesn't matter.
 */
export function chainBlasts(e, w, pts, gap = 0.12, size = 0.8, sound = 'explode_small') {
  for (let i = 0; i < pts.length; i++) {
    const p = local(e, pts[i][0], pts[i][1]);
    const x = p.x;
    const y = p.y;
    w.after(0.08 + i * gap, (ww) => {
      ww.fx.explosion?.(x, y, size * (0.8 + Math.random() * 0.4));
      ww.fx.debris?.(x, y, 3, 'syndicate');
      ww.sfx(sound, x, y, { vol: 0.7, pitch: 0.9 + Math.random() * 0.25 });
      ww.shake(0.06);
    });
  }
}
