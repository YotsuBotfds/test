// Steampunk drawing kit (WP4) — the shared Canvas 2D vocabulary for every procedural sprite.
//
// Conventions (DESIGN §5):
//  - Coordinates are sprite/world units; sprites face +x; +y is down.
//  - Light comes from the TOP-LEFT: highlights on upper-left edges, shade lower-right.
//    Never bake drop shadows — the engine draws them.
//  - Outline shapes with `ink()` (dark ~1–1.5 u stroke) so they read on any sky.
//  - Everything is deterministic (use `seeded()` instead of Math.random) so cached sprites are
//    identical across sessions.
//  - These run once per sprite render (cached), so clarity beats micro-optimisation, but keep
//    path counts sane.
//
// Most helpers follow the pattern "build path → fill → shade → ink" and leave the context state
// (fillStyle, lineWidth, alpha, composite, clip, dash) as they found it.
//
// Colour strings: hex (#rgb, #rrggbb, #rrggbbaa) or rgb()/rgba(). Named colours are not parsed by
// the colour utils (mix/alpha/lighten/darken).

import { PAL } from '../config.js';

export { PAL };

const TAU = Math.PI * 2;
const INK = 'rgba(26,18,10,0.65)';

// ---------------------------------------------------------------------------------------------
// Colour utilities
// ---------------------------------------------------------------------------------------------

const rgbCache = new Map();

/**
 * Parse a colour into [r, g, b, a] (0–255, alpha 0–1). Cached.
 * @param {string} c hex or rgb()/rgba() colour
 * @returns {number[]}
 */
export function toRgb(c) {
  let v = rgbCache.get(c);
  if (v) return v;
  if (typeof c === 'string' && c[0] === '#') {
    let h = c.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((ch) => ch + ch).join('');
    const n = parseInt(h.slice(0, 6), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255, h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
  } else {
    const m = typeof c === 'string' && c.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const p = m[1].split(',').map((s) => parseFloat(s));
      v = [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    } else {
      v = [128, 128, 128, 1];
    }
  }
  rgbCache.set(c, v);
  return v;
}

/**
 * Linear blend of two colours.
 * @param {string} a
 * @param {string} b
 * @param {number} t 0 → a, 1 → b
 * @returns {string} rgba() string
 */
export function mix(a, b, t) {
  const A = toRgb(a);
  const B = toRgb(b);
  const r = Math.round(A[0] + (B[0] - A[0]) * t);
  const g = Math.round(A[1] + (B[1] - A[1]) * t);
  const bl = Math.round(A[2] + (B[2] - A[2]) * t);
  const al = +(A[3] + (B[3] - A[3]) * t).toFixed(3);
  return `rgba(${r},${g},${bl},${al})`;
}

/** @param {string} c @param {number} t 0..1 toward white */
export const lighten = (c, t) => mix(c, '#ffffff', t);
/** @param {string} c @param {number} t 0..1 toward black */
export const darken = (c, t) => mix(c, '#000000', t);

/**
 * Same colour with its alpha multiplied by `a` (use for gradient fades: fading to a transparent
 * version of the *same* colour avoids grey fringes).
 * @param {string} c
 * @param {number} a
 */
export function alpha(c, a) {
  const [r, g, b, a0] = toRgb(c);
  return `rgba(${r},${g},${b},${+(a0 * a).toFixed(3)})`;
}

/**
 * Deterministic PRNG (mulberry32). `seeded(7)()` → float in [0, 1).
 * @param {number} [seed]
 * @returns {() => number}
 */
export function seeded(seed = 1) {
  let s = (Math.imul(seed | 0 || 1, 2654435761) >>> 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------------------------

/**
 * Material ramps: [highlight, mid, shade, deep]. Any `kind` argument in this module accepts
 * one of these keys (unknown kinds fall back to brass).
 */
export const METALS = {
  brass: ['#f2d48a', '#c9973f', '#7a5420', '#4a3112'],
  gold: ['#fff1b0', '#ffcf4a', '#a8781c', '#5a3d0c'],
  copper: ['#f0ad78', '#b4643c', '#6e3a1f', '#3d1f10'],
  bronze: ['#dcb47e', '#9c6d38', '#5e3d1a', '#33200c'],
  iron: ['#9aa3ad', '#5b626b', '#353a41', '#1f2328'],
  steel: ['#dde3ea', '#8e99a5', '#4d5560', '#262b31'],
  gunmetal: ['#7d8590', '#4b5059', '#2b2f36', '#16181c'],
  blackiron: ['#605a57', '#36312f', '#1f1c1b', '#0e0c0b'],
  wood: ['#b07c47', '#7a4f28', '#4a2f15', '#24170a'],
  darkwood: ['#7a5233', '#4f321b', '#2e1c0d', '#170d05'],
  syndicate: ['#7a808b', '#4b4f58', '#2a2c31', '#141518'],
  oxblood: ['#c95c52', '#8c2f2b', '#5a1b18', '#2e0c0a'],
  crimson: ['#ff7b66', '#c0392b', '#7a1d14', '#3a0c07'],
  navy: ['#6688b0', '#2e4a6b', '#1c2e45', '#0d1724'],
  bone: ['#fffaea', '#e6d8b4', '#ab976b', '#6b5a3a'],
  cream: ['#fffaf0', '#f3e8c9', '#d8c69c', '#9e8a5e'],
  aether: ['#e8ffff', '#7ff3ff', '#33c9c0', '#14625f'],
  glass: ['#cfefff', '#5e93b5', '#2a4d66', '#14283a'],
};

/** @param {string} kind @returns {string[]} the 4-step ramp for a material */
export const ramp = (kind) => METALS[kind] || METALS.brass;

/**
 * Linear material gradient (highlight at x0,y0 → shade at x1,y1). Use top-left → bottom-right.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 * @param {string} [kind] METALS key
 * @param {{polish?:boolean}} [opts] polish adds a secondary specular band (polished brass)
 * @returns {CanvasGradient}
 */
export function metal(ctx, x0, y0, x1, y1, kind = 'brass', opts = {}) {
  const c = ramp(kind);
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, c[0]);
  if (opts.polish) {
    g.addColorStop(0.3, c[1]);
    g.addColorStop(0.52, mix(c[1], c[0], 0.45));
    g.addColorStop(0.7, c[1]);
    g.addColorStop(1, c[2]);
  } else {
    g.addColorStop(0.45, c[1]);
    g.addColorStop(1, c[2]);
  }
  return g;
}

/**
 * Radial material gradient for domes, rivets, spheres: hot spot offset toward the top-left.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} r
 * @param {string} [kind]
 * @param {{spec?:number}} [opts] spec 0..1 strength of the white hot-spot
 */
export function metalRadial(ctx, x, y, r, kind = 'brass', opts = {}) {
  const { spec = 0.5 } = opts;
  const c = ramp(kind);
  const g = ctx.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.05, x, y, r * 1.02);
  g.addColorStop(0, spec > 0 ? mix(c[0], '#ffffff', spec * 0.6) : c[0]);
  g.addColorStop(0.28, c[0]);
  g.addColorStop(0.62, c[1]);
  g.addColorStop(0.9, c[2]);
  g.addColorStop(1, c[3]);
  return g;
}

/**
 * Cylinder gradient measured ACROSS a cylinder (x0,y0 = lit edge → x1,y1 = shaded edge).
 * Gives barrels, pipes, booms and pods a round look.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 * @param {string} [kind]
 */
export function cylinderGrad(ctx, x0, y0, x1, y1, kind = 'brass') {
  const c = ramp(kind);
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, mix(c[1], c[2], 0.35));
  g.addColorStop(0.2, c[0]);
  g.addColorStop(0.3, mix(c[0], '#ffffff', 0.25));
  g.addColorStop(0.42, c[0]);
  g.addColorStop(0.62, c[1]);
  g.addColorStop(0.88, c[2]);
  g.addColorStop(1, c[3]);
  return g;
}

// ---------------------------------------------------------------------------------------------
// Paths & finishing
// ---------------------------------------------------------------------------------------------

/**
 * Begin a rounded-rectangle path (does not fill/stroke).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {number|number[]} [r] corner radius (or per-corner array as in ctx.roundRect)
 */
export function roundRect(ctx, x, y, w, h, r = 4) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else {
    const rr = Math.min(Array.isArray(r) ? r[0] : r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
}

/**
 * Begin a polygon path through `pts` ([[x,y], …]).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number[][]} pts
 * @param {boolean} [close]
 */
export function polygon(ctx, pts, close = true) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    if (i === 0) ctx.moveTo(pts[i][0], pts[i][1]);
    else ctx.lineTo(pts[i][0], pts[i][1]);
  }
  if (close) ctx.closePath();
}

/**
 * Begin a smooth closed (or open) curve through `pts` using quadratic midpoints.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number[][]} pts
 * @param {boolean} [closed]
 */
export function smoothPath(ctx, pts, closed = true) {
  ctx.beginPath();
  const n = pts.length;
  if (n < 3) return polygon(ctx, pts, closed);
  if (closed) {
    const m0 = [(pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2];
    ctx.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % n];
      ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
    }
    ctx.closePath();
  } else {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < n - 1; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
    }
    ctx.lineTo(pts[n - 1][0], pts[n - 1][1]);
  }
}

/**
 * Begin a star path (also used for flares, sparks, explosions).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y
 * @param {number} r outer radius @param {number} ri inner radius
 * @param {number} [points] @param {number} [rot] radians
 */
export function star(ctx, x, y, r, ri, points = 5, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = rot + (i / (points * 2)) * TAU;
    const rr = i % 2 === 0 ? r : ri;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

/**
 * Stroke the current path with the standard dark outline.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} [width] stroke width in units (default 1.2)
 * @param {number} [a] opacity multiplier (default 1 → ~65% ink)
 */
export function ink(ctx, width = 1.2, a = 1) {
  ctx.lineWidth = width;
  ctx.strokeStyle = a === 1 ? INK : `rgba(26,18,10,${(0.65 * a).toFixed(3)})`;
  ctx.stroke();
}

/**
 * Overlay top-left light / bottom-right shade onto the CURRENT PATH (clipped). Call after
 * filling a shape with a flat colour to give it volume. The path is preserved.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x0 @param {number} y0 lit corner
 * @param {number} x1 @param {number} y1 shaded corner
 * @param {number} [hi] white alpha at the lit corner
 * @param {number} [lo] black alpha at the shaded corner
 */
export function shadeOverlay(ctx, x0, y0, x1, y1, hi = 0.22, lo = 0.3) {
  ctx.save();
  ctx.clip();
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, `rgba(255,255,255,${hi})`);
  g.addColorStop(0.45, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${lo})`);
  ctx.fillStyle = g;
  ctx.fillRect(Math.min(x0, x1) - 2, Math.min(y0, y1) - 2, Math.abs(x1 - x0) + 4, Math.abs(y1 - y0) + 4);
  ctx.restore();
}

/**
 * Bright inner rim along the lit (top-left) edges of the CURRENT PATH — sells bevels.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 bounding box
 * @param {number} [width] rim width
 * @param {number} [a] opacity
 * @param {string} [color]
 */
export function rimLight(ctx, x0, y0, x1, y1, width = 1, a = 0.55, color = '#ffffff') {
  ctx.save();
  ctx.clip();
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, alpha(color, a));
  g.addColorStop(0.5, alpha(color, 0));
  ctx.strokeStyle = g;
  ctx.lineWidth = width * 2;
  ctx.stroke();
  ctx.restore();
}

/**
 * Fill + shade + ink the current path in one call.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string|CanvasGradient|CanvasPattern} fill
 * @param {{box?:number[], hi?:number, lo?:number, ink?:number, rim?:number}} [opts]
 *   box = [x0,y0,x1,y1] for shading (omit = no shading); ink = outline width (0 = none);
 *   rim = rim-light width (0 = none)
 */
export function finish(ctx, fill, opts = {}) {
  const { box, hi = 0.2, lo = 0.28, ink: iw = 1.1, rim = 0 } = opts;
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (box) {
    shadeOverlay(ctx, box[0], box[1], box[2], box[3], hi, lo);
    if (rim) rimLight(ctx, box[0], box[1], box[2], box[3], rim, 0.5);
  }
  if (iw) ink(ctx, iw);
}

/**
 * Run `fn` with the context clipped to the path built by `pathFn`.
 * @param {CanvasRenderingContext2D} ctx
 * @param {() => void} pathFn builds a path
 * @param {() => void} fn draws inside the clip
 */
export function withClip(ctx, pathFn, fn) {
  ctx.save();
  pathFn();
  ctx.clip();
  fn();
  ctx.restore();
}

/**
 * Soft radial glow (bake into sprites — never per frame per entity).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} r
 * @param {string} [color]
 * @param {number} [a] opacity
 * @param {{core?:number, blend?:GlobalCompositeOperation}} [opts]
 *   core = fraction of r that stays at full intensity (hard-ish core); blend e.g. 'lighter'
 */
export function glow(ctx, x, y, r, color = '#ffd36b', a = 1, opts = {}) {
  const { core = 0, blend } = opts;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  if (core > 0) g.addColorStop(Math.min(0.95, core), color);
  g.addColorStop(Math.min(0.97, core + (1 - core) * 0.35), alpha(color, 0.45));
  g.addColorStop(1, alpha(color, 0));
  ctx.save();
  ctx.globalAlpha *= a;
  if (blend) ctx.globalCompositeOperation = blend;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/**
 * Elliptical soft glow (streaks, engine wash).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} rx @param {number} ry
 * @param {string} [color] @param {number} [a] @param {number} [rot]
 */
export function glowEllipse(ctx, x, y, rx, ry, color = '#ffd36b', a = 1, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(1, ry / rx);
  glow(ctx, 0, 0, rx, color, a);
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Fasteners
// ---------------------------------------------------------------------------------------------

/**
 * Domed rivet with a top-left glint.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} [r] @param {string} [kind]
 */
export function rivet(ctx, x, y, r = 1.2, kind = 'brass') {
  const c = ramp(kind);
  ctx.beginPath();
  ctx.arc(x + r * 0.15, y + r * 0.2, r * 1.05, 0, TAU);
  ctx.fillStyle = 'rgba(20,12,6,0.45)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = c[2];
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - r * 0.12, y - r * 0.12, r * 0.72, 0, TAU);
  ctx.fillStyle = c[1];
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - r * 0.32, y - r * 0.32, r * 0.36, 0, TAU);
  ctx.fillStyle = c[0];
  ctx.fill();
}

/**
 * Evenly spaced rivets from (x0,y0) to (x1,y1), endpoints included.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 * @param {number} [spacing] @param {number} [r] @param {string} [kind]
 * @param {{skipEnds?:boolean}} [opts]
 */
export function rivetLine(ctx, x0, y0, x1, y1, spacing = 6, r = 1.1, kind = 'brass', opts = {}) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.round(d / spacing));
  const a = opts.skipEnds ? 1 : 0;
  for (let i = a; i <= n - a; i++) rivet(ctx, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, r, kind);
}

/**
 * Rivets around a circle.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} radius
 * @param {number} count @param {number} [r] @param {string} [kind] @param {number} [rot]
 */
export function rivetRing(ctx, x, y, radius, count, r = 0.8, kind = 'brass', rot = 0) {
  for (let i = 0; i < count; i++) {
    const a = rot + (i / count) * TAU;
    rivet(ctx, x + Math.cos(a) * radius, y + Math.sin(a) * radius, r, kind);
  }
}

/**
 * Hex bolt head.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} [r] @param {string} [kind] @param {number} [rot]
 */
export function bolt(ctx, x, y, r = 1.4, kind = 'iron', rot = 0.3) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = rot + (i / 6) * TAU;
    pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
  }
  polygon(ctx, pts);
  ctx.fillStyle = metal(ctx, x - r, y - r, x + r, y + r, kind);
  ctx.fill();
  ink(ctx, Math.max(0.35, r * 0.35));
  ctx.beginPath();
  ctx.arc(x, y, r * 0.42, 0, TAU);
  ctx.fillStyle = ramp(kind)[2];
  ctx.fill();
}

// ---------------------------------------------------------------------------------------------
// Machine parts
// ---------------------------------------------------------------------------------------------

/**
 * Build a gear outline path (trapezoid teeth) — exposed for clipping/silhouettes.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} r outer radius
 * @param {number} teeth @param {number} depth tooth depth @param {number} [rotation]
 * @param {number} [hole] centre hole radius (0 = none; evenodd fill required)
 */
export function gearPath(ctx, x, y, r, teeth, depth, rotation = 0, hole = 0) {
  ctx.beginPath();
  const ri = r - depth;
  const step = TAU / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = rotation + i * step;
    const pts = [
      [a - step * 0.5, ri],
      [a - step * 0.22, ri],
      [a - step * 0.14, r],
      [a + step * 0.14, r],
      [a + step * 0.22, ri],
    ];
    for (let j = 0; j < pts.length; j++) {
      const [aa, rr] = pts[j];
      const px = x + Math.cos(aa) * rr;
      const py = y + Math.sin(aa) * rr;
      if (i === 0 && j === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
  if (hole > 0) {
    ctx.moveTo(x + hole, y);
    ctx.arc(x, y, hole, 0, TAU, true);
  }
}

/**
 * Cog wheel with trapezoid teeth, optional spoked windows, hub and bevel.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} r outer radius
 * @param {number} [teeth]
 * @param {{kind?:string, toothDepth?:number, hole?:number, rotation?:number, spokes?:number,
 *   hub?:boolean, outline?:number, polish?:boolean}} [opts]
 *   spokes: number of lightening windows (0 = solid web); hub: draw raised hub & axle.
 */
export function gear(ctx, x, y, r, teeth = 10, opts = {}) {
  const {
    kind = 'brass',
    toothDepth = r * 0.2,
    hole = r * 0.22,
    rotation = 0,
    spokes = 0,
    hub = spokes > 0,
    outline = Math.max(0.5, Math.min(1.2, r * 0.09)),
    polish = true,
  } = opts;
  const c = ramp(kind);
  gearPath(ctx, x, y, r, teeth, toothDepth, rotation, hole);
  if (spokes > 0) {
    // lightening windows between spokes
    const ro = r - toothDepth - r * 0.14;
    const ri = Math.max(hole + r * 0.12, r * 0.36);
    const span = TAU / spokes;
    for (let i = 0; i < spokes; i++) {
      const a0 = rotation + i * span + span * 0.16;
      const a1 = rotation + (i + 1) * span - span * 0.16;
      ctx.moveTo(x + Math.cos(a0) * ri, y + Math.sin(a0) * ri);
      ctx.arc(x, y, ro, a0, a1);
      ctx.arc(x, y, ri, a1, a0, true);
      ctx.closePath();
    }
  }
  ctx.fillStyle = metal(ctx, x - r, y - r, x + r, y + r, kind, { polish });
  ctx.fill('evenodd');
  ctx.save();
  ctx.clip('evenodd');
  // inner bevel ring
  ctx.beginPath();
  ctx.arc(x, y, r - toothDepth - r * 0.06, 0, TAU);
  ctx.strokeStyle = alpha(c[3], 0.35);
  ctx.lineWidth = r * 0.06;
  ctx.stroke();
  ctx.restore();
  ctx.lineWidth = outline;
  ctx.strokeStyle = INK;
  ctx.stroke();
  if (hub) {
    const hr = Math.max(hole * 1.9, r * 0.3);
    ctx.beginPath();
    ctx.arc(x, y, hr, 0, TAU);
    if (hole > 0) ctx.arc(x, y, hole, 0, TAU, true);
    ctx.fillStyle = metalRadial(ctx, x, y, hr, kind);
    ctx.fill('evenodd');
    ink(ctx, outline * 0.7);
  }
}

/**
 * Brass propeller seen along its axis (top-down rotor / screw disc).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} r radius
 * @param {number} [blades] @param {number} [rot] radians
 * @param {{kind?:string, blur?:number|boolean, hub?:string, tip?:string, width?:number}} [opts]
 *   blur 0..1: motion-blur disc + ghost blades; width = blade chord as a fraction of r
 */
export function propeller(ctx, x, y, r, blades = 3, rot = 0, opts = {}) {
  const { kind = 'brass', hub = 'brass', tip = PAL.oxblood, width = 0.3 } = opts;
  const blur = opts.blur === true ? 1 : +opts.blur || 0;
  const c = ramp(kind);
  if (blur > 0) {
    const g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r);
    g.addColorStop(0, alpha(c[1], 0.1 * blur));
    g.addColorStop(0.75, alpha(c[0], 0.24 * blur));
    g.addColorStop(0.92, alpha(c[2], 0.32 * blur));
    g.addColorStop(1, alpha(c[2], 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    // tip trace ring
    ctx.beginPath();
    ctx.arc(x, y, r * 0.88, 0, TAU);
    ctx.strokeStyle = alpha(tip, 0.28 * blur);
    ctx.lineWidth = r * 0.1;
    ctx.stroke();
  }
  const blade = (a, al, ghost) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.globalAlpha *= al;
    // scimitar blade: leading edge curved, trailing edge straighter
    ctx.beginPath();
    ctx.moveTo(r * 0.12, -r * width * 0.35);
    ctx.bezierCurveTo(r * 0.45, -r * width * 1.15, r * 0.88, -r * width * 0.9, r * 0.97, -r * width * 0.15);
    ctx.quadraticCurveTo(r * 1.0, r * width * 0.2, r * 0.86, r * width * 0.35);
    ctx.bezierCurveTo(r * 0.6, r * width * 0.55, r * 0.3, r * width * 0.4, r * 0.12, r * width * 0.35);
    ctx.closePath();
    ctx.fillStyle = cylinderGrad(ctx, 0, -r * width, 0, r * width * 0.6, kind);
    ctx.fill();
    if (!ghost) {
      ink(ctx, Math.max(0.4, r * 0.06));
      // painted tip
      ctx.save();
      ctx.clip();
      ctx.fillStyle = tip;
      ctx.fillRect(r * 0.8, -r, r * 0.3, r * 2);
      ctx.restore();
    }
    ctx.restore();
  };
  for (let i = 0; i < blades; i++) {
    const a = rot + (i / blades) * TAU;
    if (blur > 0) {
      for (let k = 3; k >= 1; k--) blade(a - k * 0.17, 0.16 * blur, true);
    }
    blade(a, blur > 0 ? 1 - blur * 0.25 : 1, false);
  }
  // hub / spinner
  const hr = r * 0.24;
  ctx.beginPath();
  ctx.arc(x, y, hr, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, x, y, hr, hub);
  ctx.fill();
  ink(ctx, Math.max(0.35, r * 0.05));
  ctx.beginPath();
  ctx.arc(x, y, hr * 0.38, 0, TAU);
  ctx.fillStyle = ramp(hub)[2];
  ctx.fill();
}

/**
 * Brass-rimmed porthole / window with a glint (or a warm/ember glow when lit).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} r outer (rim) radius
 * @param {{glow?:boolean, color?:string, kind?:string, bolts?:number, halo?:number}} [opts]
 *   glow: lit window; color: glass/light colour; halo: glow radius multiplier when lit
 */
export function porthole(ctx, x, y, r, opts = {}) {
  const lit = !!opts.glow;
  const { color = lit ? '#ffcf6a' : '#3a5a6e', kind = 'brass', bolts = r >= 2.5 ? 6 : 0, halo = 2.4 } = opts;
  if (lit) glow(ctx, x, y, r * halo, color, 0.55);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, x, y, r, kind, { spec: 0.3 });
  ctx.fill();
  ink(ctx, Math.max(0.35, r * 0.18));
  const gr = r * 0.66;
  ctx.beginPath();
  ctx.arc(x, y, gr, 0, TAU);
  if (lit) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, gr);
    g.addColorStop(0, lighten(color, 0.75));
    g.addColorStop(0.55, color);
    g.addColorStop(1, darken(color, 0.35));
    ctx.fillStyle = g;
  } else {
    const g = ctx.createLinearGradient(x - gr, y - gr, x + gr, y + gr);
    g.addColorStop(0, lighten(color, 0.35));
    g.addColorStop(0.5, color);
    g.addColorStop(1, darken(color, 0.55));
    ctx.fillStyle = g;
  }
  ctx.fill();
  ctx.lineWidth = Math.max(0.3, r * 0.1);
  ctx.strokeStyle = 'rgba(20,12,6,0.55)';
  ctx.stroke();
  // glint
  ctx.beginPath();
  ctx.arc(x - gr * 0.3, y - gr * 0.3, gr * 0.42, Math.PI * 1.05, Math.PI * 1.6);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = Math.max(0.3, gr * 0.22);
  ctx.stroke();
  for (let i = 0; i < bolts; i++) {
    const a = (i / bolts) * TAU + 0.4;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r * 0.84, y + Math.sin(a) * r * 0.84, Math.max(0.25, r * 0.08), 0, TAU);
    ctx.fillStyle = ramp(kind)[3];
    ctx.fill();
  }
}

/**
 * Tapered cylinder between two points with proper cross-shading (barrels, booms, pods, rods).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 * @param {number} w0 width at start @param {number} [w1] width at end (default w0)
 * @param {string} [kind]
 * @param {{ink?:number, capStart?:boolean, capEnd?:boolean}} [opts] caps = rounded ends
 */
export function cylinder(ctx, x0, y0, x1, y1, w0, w1 = w0, kind = 'brass', opts = {}) {
  const { ink: iw = 0.9, capStart = false, capEnd = false } = opts;
  const len = Math.hypot(x1 - x0, y1 - y0) || 0.001;
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.save();
  ctx.translate(x0, y0);
  ctx.rotate(a);
  ctx.beginPath();
  ctx.moveTo(0, -w0 / 2);
  ctx.lineTo(len, -w1 / 2);
  if (capEnd) ctx.arc(len, 0, w1 / 2, -Math.PI / 2, Math.PI / 2);
  else ctx.lineTo(len, w1 / 2);
  ctx.lineTo(0, w0 / 2);
  if (capStart) ctx.arc(0, 0, w0 / 2, Math.PI / 2, Math.PI * 1.5);
  ctx.closePath();
  // light comes from the top-left in sprite space: choose the lit edge accordingly
  const litTop = Math.cos(a) >= -Math.sin(a) * 0.4;
  const wm = Math.max(w0, w1) / 2;
  ctx.fillStyle = litTop
    ? cylinderGrad(ctx, 0, -wm, 0, wm, kind)
    : cylinderGrad(ctx, 0, wm, 0, -wm, kind);
  ctx.fill();
  if (iw) ink(ctx, iw);
  ctx.restore();
}

/**
 * Pipe along a polyline: dark casing, body, specular line and optional flanges at joints.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number[][]} points [[x,y], …]
 * @param {number} [width]
 * @param {string} [kind]
 * @param {{flanges?:boolean, smooth?:boolean}} [opts]
 */
export function pipe(ctx, points, width = 3, kind = 'copper', opts = {}) {
  if (!points || points.length < 2) return;
  const { flanges = true, smooth = false } = opts;
  const c = ramp(kind);
  const path = () => (smooth ? smoothPath(ctx, points, false) : polygon(ctx, points, false));
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  path();
  ctx.lineWidth = width + 1.3;
  ctx.strokeStyle = 'rgba(26,18,10,0.75)';
  ctx.stroke();
  ctx.lineWidth = width;
  ctx.strokeStyle = c[2];
  ctx.stroke();
  ctx.lineWidth = width * 0.62;
  ctx.strokeStyle = c[1];
  ctx.stroke();
  ctx.translate(-width * 0.14, -width * 0.18);
  ctx.lineWidth = Math.max(0.35, width * 0.22);
  ctx.strokeStyle = alpha(c[0], 0.9);
  ctx.stroke();
  ctx.restore();
  if (flanges) {
    for (let i = 0; i < points.length; i += smooth ? points.length - 1 : 1) {
      const [px, py] = points[i];
      ctx.beginPath();
      ctx.arc(px, py, width * 0.72, 0, TAU);
      ctx.fillStyle = metalRadial(ctx, px, py, width * 0.72, kind);
      ctx.fill();
      ink(ctx, 0.5);
    }
  }
}

/**
 * Riveted metal plate with bevel.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {number} [radius] @param {string} [kind]
 * @param {{rivets?:number, rivetR?:number, rivetKind?:string, inset?:number, ink?:number,
 *   polish?:boolean, bevel?:number}} [opts] rivets = spacing (0 = none)
 */
export function plate(ctx, x, y, w, h, radius = 3, kind = 'iron', opts = {}) {
  const { rivets = 0, rivetR = 0.75, rivetKind = kind, inset = 1.6, ink: iw = 1, polish = false, bevel = 0.9 } = opts;
  roundRect(ctx, x, y, w, h, radius);
  ctx.fillStyle = metal(ctx, x, y, x + w, y + h, kind, { polish });
  ctx.fill();
  if (bevel) rimLight(ctx, x, y, x + w, y + h, bevel, 0.45);
  if (iw) ink(ctx, iw);
  if (rivets > 0) {
    const x0 = x + inset;
    const y0 = y + inset;
    const x1 = x + w - inset;
    const y1 = y + h - inset;
    rivetLine(ctx, x0, y0, x1, y0, rivets, rivetR, rivetKind);
    rivetLine(ctx, x0, y1, x1, y1, rivets, rivetR, rivetKind);
    if (h > inset * 4) {
      rivetLine(ctx, x0, y0, x0, y1, rivets, rivetR, rivetKind, { skipEnds: true });
      rivetLine(ctx, x1, y0, x1, y1, rivets, rivetR, rivetKind, { skipEnds: true });
    }
  }
}

/**
 * Smokestack seen from above: flange, painted band, lip and sooty throat.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} r
 * @param {string} [kind]
 * @param {{band?:string, ember?:boolean, soot?:number, flange?:boolean, angle?:number}} [opts]
 *   ember: hot glow in the throat; soot: streak length drawn toward -x (exhaust wash);
 *   angle: direction the soot streak points (default π = rearward)
 */
export function smokestack(ctx, x, y, r, kind = 'iron', opts = {}) {
  const { band = null, ember = false, soot = r * 1.8, flange = true, angle = Math.PI } = opts;
  if (soot > 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const g = ctx.createLinearGradient(0, 0, soot + r, 0);
    g.addColorStop(0, 'rgba(25,18,12,0.5)');
    g.addColorStop(1, 'rgba(25,18,12,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.9);
    ctx.quadraticCurveTo(soot * 0.6, -r * 1.1, soot + r, 0);
    ctx.quadraticCurveTo(soot * 0.6, r * 1.1, 0, r * 0.9);
    ctx.fill();
    ctx.restore();
  }
  if (flange) {
    ctx.beginPath();
    ctx.arc(x, y, r * 1.28, 0, TAU);
    ctx.fillStyle = metalRadial(ctx, x, y, r * 1.28, kind, { spec: 0.1 });
    ctx.fill();
    ink(ctx, 0.8);
    rivetRing(ctx, x, y, r * 1.14, Math.max(6, Math.round(r * 2)), Math.max(0.35, r * 0.09), kind);
  }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, x, y, r, kind, { spec: 0.35 });
  ctx.fill();
  ink(ctx, 0.9);
  if (band) {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.86, 0, TAU);
    ctx.arc(x, y, r * 0.68, 0, TAU, true);
    ctx.fillStyle = band;
    ctx.fill('evenodd');
    shadeOverlay(ctx, x - r, y - r, x + r, y + r, 0.25, 0.3);
  }
  const ir = r * 0.62;
  ctx.beginPath();
  ctx.arc(x, y, ir, 0, TAU);
  const g = ctx.createRadialGradient(x + ir * 0.2, y + ir * 0.2, 0, x, y, ir);
  if (ember) {
    g.addColorStop(0, '#ffe2a0');
    g.addColorStop(0.35, '#ff7a2f');
    g.addColorStop(0.75, '#5a1608');
    g.addColorStop(1, '#120a06');
  } else {
    g.addColorStop(0, '#0a0705');
    g.addColorStop(0.7, '#1a120c');
    g.addColorStop(1, '#3a2a1e');
  }
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(0.35, r * 0.1);
  ctx.strokeStyle = alpha(ramp(kind)[0], 0.6);
  ctx.beginPath();
  ctx.arc(x, y, ir + r * 0.05, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
}

/**
 * Deterministic soot/grime speckle & streaks inside a rectangle (clip first for odd shapes).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {number} [density] 0..1
 * @param {number} [seed]
 * @param {{color?:string, streaks?:number, blotches?:boolean}} [opts]
 *   streaks: fraction of marks drawn as horizontal (wind-blown) streaks toward -x
 */
export function grime(ctx, x, y, w, h, density = 0.2, seed = 1, opts = {}) {
  const { color = '#1e140a', streaks = 0.35, blotches = true } = opts;
  const rnd = seeded(seed);
  ctx.save();
  const n = Math.floor(w * h * density * 0.03) + 1;
  for (let i = 0; i < n; i++) {
    const px = x + rnd() * w;
    const py = y + rnd() * h;
    const r = 0.25 + rnd() * 0.7;
    ctx.globalAlpha = 0.12 + rnd() * 0.22;
    ctx.fillStyle = color;
    if (rnd() < streaks) {
      ctx.fillRect(px, py, -(2 + rnd() * 6), r * 0.7);
    } else {
      ctx.beginPath();
      ctx.arc(px, py, r, 0, TAU);
      ctx.fill();
    }
  }
  if (blotches) {
    const m = Math.max(1, Math.floor(n / 14));
    for (let i = 0; i < m; i++) {
      const px = x + rnd() * w;
      const py = y + rnd() * h;
      const r = 2 + rnd() * Math.min(w, h) * 0.25;
      ctx.globalAlpha = 0.08 + rnd() * 0.1;
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, color);
      g.addColorStop(1, alpha(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * Muzzle-loading cannon barrel along +x from (x, y) (breech) — cascabel, reinforce rings,
 * muzzle swell and a dark bore face.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y breech centre
 * @param {number} len @param {number} width breech width
 * @param {string} [kind]
 * @param {{taper?:number, bands?:number[], swell?:number, knob?:boolean, bore?:boolean}} [opts]
 *   taper: muzzle width ratio; bands: positions 0..1 of reinforce rings; swell: muzzle ring ratio
 */
export function cannon(ctx, x, y, len, width, kind = 'iron', opts = {}) {
  const { taper = 0.78, bands = [0.18, 0.5], swell = 1.12, knob = true, bore = true } = opts;
  const c = ramp(kind);
  const wEnd = width * taper;
  if (knob) {
    ctx.beginPath();
    ctx.arc(x - width * 0.32, y, width * 0.26, 0, TAU);
    ctx.fillStyle = metalRadial(ctx, x - width * 0.32, y, width * 0.26, kind);
    ctx.fill();
    ink(ctx, 0.6);
    ctx.fillStyle = c[2];
    ctx.fillRect(x - width * 0.28, y - width * 0.1, width * 0.3, width * 0.2);
  }
  // breech dome
  ctx.beginPath();
  ctx.ellipse(x, y, width * 0.28, width / 2, 0, Math.PI / 2, Math.PI * 1.5);
  ctx.lineTo(x + len, y - wEnd / 2);
  ctx.lineTo(x + len, y + wEnd / 2);
  ctx.closePath();
  ctx.fillStyle = cylinderGrad(ctx, 0, y - width / 2, 0, y + width / 2, kind);
  ctx.fill();
  ink(ctx, 0.9);
  const wAt = (t) => width + (wEnd - width) * t;
  for (const b of bands) {
    const bx = x + len * b;
    const bw = wAt(b) * 1.1;
    roundRect(ctx, bx - width * 0.12, y - bw / 2, width * 0.24, bw, width * 0.08);
    ctx.fillStyle = cylinderGrad(ctx, 0, y - bw / 2, 0, y + bw / 2, kind);
    ctx.fill();
    ink(ctx, 0.6);
  }
  // muzzle swell
  const mw = wEnd * swell;
  roundRect(ctx, x + len - width * 0.34, y - mw / 2, width * 0.34, mw, width * 0.1);
  ctx.fillStyle = cylinderGrad(ctx, 0, y - mw / 2, 0, y + mw / 2, kind);
  ctx.fill();
  ink(ctx, 0.7);
  if (bore) {
    ctx.beginPath();
    ctx.ellipse(x + len, y, wEnd * 0.12, wEnd * 0.3, 0, 0, TAU);
    ctx.fillStyle = '#0d0905';
    ctx.fill();
  }
}

/**
 * Waving pennant/flag flying toward -x from a pole at (x, y) (top-left of the cloth).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {string[]} [colors] horizontal stripes top → bottom
 * @param {{wave?:number, swallow?:boolean, pennant?:boolean, dir?:number, emblem?:string}} [opts]
 *   dir: +1 flies toward +x, -1 (default) toward -x (streams behind a ship); emblem: colour of a
 *   small central disc
 */
export function flag(ctx, x, y, w, h, colors = [PAL.oxblood, PAL.canvas[0]], opts = {}) {
  const { wave = h * 0.18, swallow = false, pennant = false, dir = 1, emblem = null } = opts;
  const N = 10;
  const top = [];
  const bot = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const dx = x + dir * w * t;
    const dy = Math.sin(t * Math.PI * 1.6) * wave * t;
    const hh = pennant ? h * (1 - t * 0.85) : h;
    top.push([dx, y + dy + (h - hh) / 2]);
    bot.push([dx, y + dy + (h + hh) / 2]);
  }
  const outline = () => {
    ctx.beginPath();
    ctx.moveTo(top[0][0], top[0][1]);
    for (const p of top) ctx.lineTo(p[0], p[1]);
    if (swallow && !pennant) {
      const e = top[N];
      const f = bot[N];
      ctx.lineTo(e[0] - dir * w * 0.22, (e[1] + f[1]) / 2);
    }
    for (let i = N; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
    ctx.closePath();
  };
  outline();
  ctx.save();
  ctx.clip();
  const n = colors.length;
  for (let s = 0; s < n; s++) {
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const yy = top[i][1] + ((bot[i][1] - top[i][1]) * s) / n;
      if (i === 0) ctx.moveTo(top[i][0], yy);
      else ctx.lineTo(top[i][0], yy);
    }
    for (let i = N; i >= 0; i--) ctx.lineTo(top[i][0], top[i][1] + ((bot[i][1] - top[i][1]) * (s + 1)) / n);
    ctx.closePath();
    ctx.fillStyle = colors[s];
    ctx.fill();
  }
  if (emblem) {
    ctx.beginPath();
    ctx.arc(x + dir * w * 0.3, (top[3][1] + bot[3][1]) / 2, h * 0.24, 0, TAU);
    ctx.fillStyle = emblem;
    ctx.fill();
  }
  // fold shading follows the wave
  for (let i = 0; i < N; i++) {
    const s = Math.cos((i / N) * Math.PI * 1.6);
    ctx.fillStyle = s > 0 ? `rgba(255,255,255,${0.12 * s})` : `rgba(0,0,0,${-0.2 * s})`;
    const xa = top[i][0];
    const xb = top[i + 1][0];
    ctx.fillRect(Math.min(xa, xb), y - wave - h, Math.abs(xb - xa) + 0.2, h * 3 + wave * 2);
  }
  ctx.restore();
  outline();
  ink(ctx, 0.6);
}

// ---------------------------------------------------------------------------------------------
// Envelopes (gasbags)
// ---------------------------------------------------------------------------------------------

/**
 * Geometry of a top-down gasbag of revolution along +x. Pure (no drawing).
 * `t` runs -1 (tail) → +1 (nose); `k` runs -1 (port/top edge) → +1 (starboard/bottom edge).
 * @param {number} cx @param {number} cy @param {number} len @param {number} wid
 * @param {{nose?:number, tail?:number, fullness?:number}} [opts]
 *   nose/tail: profile exponents (2 = elliptical, >2 blunter, <2 pointier);
 *   fullness: 0.5 = elliptical cross-profile, lower = boxier/cylindrical mid-body
 * @returns {{cx:number, cy:number, len:number, wid:number, hw:(t:number)=>number,
 *   x:(t:number)=>number, y:(t:number,k:number)=>number, at:(t:number,k:number)=>number[],
 *   tOf:(x:number)=>number, path:(ctx:CanvasRenderingContext2D, t0?:number, t1?:number)=>void}}
 */
export function envelopeGeo(cx, cy, len, wid, opts = {}) {
  const { nose = 2.4, tail = 1.8, fullness = 0.5 } = opts;
  const L = len / 2;
  const W = wid / 2;
  const hw = (t) => {
    const a = Math.abs(t);
    if (a >= 1) return 0;
    return W * Math.pow(1 - Math.pow(a, t >= 0 ? nose : tail), fullness);
  };
  const x = (t) => cx + t * L;
  const y = (t, k) => cy + k * hw(t);
  const geo = {
    cx,
    cy,
    len,
    wid,
    hw,
    x,
    y,
    at: (t, k) => [x(t), y(t, k)],
    tOf: (px) => (px - cx) / L,
    /** Closed outline path, optionally just the section t0..t1. */
    path(ctx, t0 = -1, t1 = 1) {
      const N = 56;
      ctx.beginPath();
      const ts = [];
      for (let i = 0; i <= N; i++) {
        // sine spacing → dense samples at the rounded ends
        const u = -Math.PI / 2 + (i / N) * Math.PI;
        const t = Math.sin(u);
        if (t >= t0 && t <= t1) ts.push(t);
      }
      if (ts[0] > t0) ts.unshift(t0);
      if (ts[ts.length - 1] < t1) ts.push(t1);
      ts.forEach((t, i) => (i === 0 ? ctx.moveTo(x(t), y(t, -1)) : ctx.lineTo(x(t), y(t, -1))));
      for (let i = ts.length - 1; i >= 0; i--) ctx.lineTo(x(ts[i]), y(ts[i], 1));
      ctx.closePath();
    },
  };
  return geo;
}

/**
 * Path of a band on the envelope surface between meridian offsets k0..k1 over t0..t1 (racing
 * stripes, painted panels, teeth bands).
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<typeof envelopeGeo>} geo
 * @param {number} k0 @param {number} k1 @param {number} [t0] @param {number} [t1]
 */
export function envelopeStripePath(ctx, geo, k0, k1, t0 = -1, t1 = 1) {
  const N = 40;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const t = t0 + ((t1 - t0) * i) / N;
    if (i === 0) ctx.moveTo(geo.x(t), geo.y(t, k0));
    else ctx.lineTo(geo.x(t), geo.y(t, k0));
  }
  for (let i = N; i >= 0; i--) {
    const t = t0 + ((t1 - t0) * i) / N;
    ctx.lineTo(geo.x(t), geo.y(t, k1));
  }
  ctx.closePath();
}

/**
 * Scratch canvas for baked effects (OffscreenCanvas when available).
 * @param {number} w @param {number} h
 * @returns {OffscreenCanvas|HTMLCanvasElement|null}
 */
export function scratchCanvas(w, h) {
  try {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    }
  } catch {
    /* fall through */
  }
  return null;
}

const LIGHT_DIR = (() => {
  const v = [-0.42, -0.62, 0.66];
  const l = Math.hypot(v[0], v[1], v[2]);
  return v.map((c) => c / l);
})();
const HALF_DIR = (() => {
  const v = [LIGHT_DIR[0], LIGHT_DIR[1], LIGHT_DIR[2] + 1];
  const l = Math.hypot(v[0], v[1], v[2]);
  return v.map((c) => c / l);
})();

/**
 * Bake a light/shade overlay for an envelope from its true surface normals (body of revolution
 * with canvas sagging between ribs and gore seams) and draw it over the current clip.
 * Resolution follows the context's current scale, so it is crisp at any SPRITE_SCALE.
 * @returns {boolean} false if no scratch canvas is available
 */
function bakeEnvelopeLight(ctx, geo, { light, quilt, ribs, gores, gloss }) {
  const T = ctx.getTransform ? ctx.getTransform() : { a: 2, b: 0 };
  const res = Math.min(6, Math.max(1, Math.hypot(T.a, T.b)));
  const L = geo.len / 2;
  const x0 = geo.cx - L;
  const y0 = geo.cy - geo.wid / 2;
  const pw = Math.max(1, Math.ceil(geo.len * res));
  const ph = Math.max(1, Math.ceil(geo.wid * res));
  const cv = scratchCanvas(pw, ph);
  const c2 = cv && cv.getContext('2d');
  if (!c2) return false;
  const img = c2.createImageData(pw, ph);
  const d = img.data;
  const [lx, ly, lz] = LIGHT_DIR;
  const [hx, hy, hz] = HALF_DIR;
  const goreW = Math.PI / Math.max(1, gores);
  const e = 0.004;
  for (let i = 0; i < pw; i++) {
    const t = (x0 + (i + 0.5) / res - geo.cx) / L;
    const h = geo.hw(t);
    if (h <= 0.02) continue;
    const dh = (geo.hw(Math.min(0.9999, t + e)) - geo.hw(Math.max(-0.9999, t - e))) / (2 * e * L);
    const u = ribs > 1 ? (((t + 1) / 2) * ribs) % 1 : 0.5;
    const sagX = quilt * 1.3 * Math.cos(Math.PI * u);
    for (let j = 0; j < ph; j++) {
      const k = (y0 + (j + 0.5) / res - geo.cy) / h;
      if (k <= -1 || k >= 1) continue;
      const nz0 = Math.sqrt(1 - k * k);
      const v = ((Math.asin(k) + Math.PI / 2) / goreW) % 1;
      const sg = quilt * 0.8 * Math.cos(Math.PI * v);
      let nx = -dh * nz0 + sagX * nz0;
      let ny = k + sg * nz0;
      let nz = nz0 - sg * k;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      const diff = Math.max(0, nx * lx + ny * ly + nz * lz);
      const sp = Math.max(0, nx * hx + ny * hy + nz * hz);
      const spec = sp * sp * sp * sp;
      const s = 0.42 + 0.78 * diff - 1 + spec * spec * gloss * 0.9;
      const o = (j * pw + i) * 4;
      if (s < 0) {
        d[o] = 28;
        d[o + 1] = 16;
        d[o + 2] = 6;
        d[o + 3] = Math.min(255, -s * light * 255);
      } else {
        d[o] = 255;
        d[o + 1] = 253;
        d[o + 2] = 240;
        d[o + 3] = Math.min(255, s * 1.5 * light * 255);
      }
    }
  }
  c2.putImageData(img, 0, 0);
  ctx.drawImage(cv, x0, y0, pw / res, ph / res);
  return true;
}

/**
 * Top-down canvas gasbag: flat paint → stripes/bands → quilted panels → volumetric light →
 * gore seams with stitching → frame ribs → outline. Returns its geometry so callers can place
 * caps, platforms, patches and rigging on the surface.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx @param {number} cy @param {number} len @param {number} wid
 * @param {{fill?:string, nose?:number, tail?:number, fullness?:number, gores?:number,
 *   ribs?:number, stitch?:boolean, seam?:string, quilt?:number, light?:number, gloss?:number,
 *   outline?:number, shade?:string,
 *   stripes?:{k0:number,k1:number,t0?:number,t1?:number,color:string}[],
 *   bands?:{t0:number,t1:number,color:string}[],
 *   decorate?:(ctx:CanvasRenderingContext2D, geo:object)=>void}} [opts]
 *   gores: number of longitudinal panels (seams converge at nose/tail); ribs: circumferential
 *   frames; quilt: sag shading strength between ribs; light: volumetric shading strength;
 *   gloss: specular strength; decorate: drawn clipped to the bag before lighting (painted art).
 *   Legacy: `shade` is accepted but ignored (lighting is computed).
 */
export function envelope(ctx, cx, cy, len, wid, opts = {}) {
  const {
    fill = PAL.canvas[0],
    gores = 8,
    ribs = 7,
    stitch = true,
    seam = 'rgba(70,48,22,0.32)',
    quilt = 0.16,
    light = 1,
    gloss = 0.4,
    outline = 1.4,
    stripes = [],
    bands = [],
    decorate = null,
  } = opts;
  const geo = envelopeGeo(cx, cy, len, wid, opts);
  const L = len / 2;
  const W = wid / 2;
  geo.path(ctx);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.save();
  geo.path(ctx);
  ctx.clip();

  for (const b of bands) {
    ctx.fillStyle = b.color;
    ctx.fillRect(geo.x(b.t0), cy - W - 1, geo.x(b.t1) - geo.x(b.t0), wid + 2);
  }
  for (const s of stripes) {
    envelopeStripePath(ctx, geo, s.k0, s.k1, s.t0 ?? -1, s.t1 ?? 1);
    ctx.fillStyle = s.color;
    ctx.fill();
  }
  if (decorate) decorate(ctx, geo);

  // quilted panels + volumetric light, baked per pixel from the surface normal
  const ribTs = [];
  for (let i = 1; i < ribs; i++) ribTs.push(-1 + (2 * i) / ribs);
  if (light > 0 && !bakeEnvelopeLight(ctx, geo, { light, quilt, ribs, gores, gloss })) {
    const g = ctx.createLinearGradient(0, cy - W, 0, cy + W);
    g.addColorStop(0, 'rgba(255,255,250,0.1)');
    g.addColorStop(0.25, 'rgba(255,255,250,0.25)');
    g.addColorStop(0.55, 'rgba(40,25,10,0)');
    g.addColorStop(1, 'rgba(30,18,6,0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - L, cy - W, len, wid);
  }

  // gore seams (projected meridians) with stitching
  const ks = [];
  for (let i = 1; i < gores; i++) {
    const phi = -Math.PI / 2 + (i * Math.PI) / gores;
    ks.push(Math.sin(phi));
  }
  const seamPath = (k, off) => {
    ctx.beginPath();
    const N = 40;
    for (let i = 0; i <= N; i++) {
      const t = -0.985 + (1.97 * i) / N;
      const px = geo.x(t);
      const py = geo.y(t, k) + off;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
  };
  for (const k of ks) {
    seamPath(k, 0);
    ctx.strokeStyle = seam;
    ctx.lineWidth = 0.55;
    ctx.stroke();
    if (stitch) {
      seamPath(k, -0.45);
      ctx.setLineDash([0.7, 0.9]);
      ctx.strokeStyle = 'rgba(255,250,235,0.32)';
      ctx.lineWidth = 0.35;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  // circumferential frames — raised ridge: dark line + light line
  for (const t of ribTs) {
    const px = geo.x(t);
    const h = geo.hw(t);
    ctx.beginPath();
    ctx.moveTo(px, cy - h);
    ctx.lineTo(px, cy + h);
    ctx.strokeStyle = 'rgba(60,40,15,0.3)';
    ctx.lineWidth = 0.7;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px - 0.55, cy - h);
    ctx.lineTo(px - 0.55, cy + h);
    ctx.strokeStyle = 'rgba(255,252,240,0.2)';
    ctx.lineWidth = 0.45;
    ctx.stroke();
  }

  ctx.restore();

  geo.path(ctx);
  if (outline) ink(ctx, outline);
  return geo;
}

/**
 * Round balloon seen from directly above (vertical axis): radial gores (patchwork colours),
 * spherical light and a crown valve ring at the top.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} r
 * @param {{colors?:string[], gores?:number, rotation?:number, valve?:boolean, light?:number,
 *   stitch?:boolean, patches?:number, seed?:number}} [opts]
 *   colors cycle per gore (patchwork); patches: number of stitched repair patches
 */
export function balloon(ctx, x, y, r, opts = {}) {
  const {
    colors = [PAL.canvas[0], PAL.canvas[1]],
    gores = 10,
    rotation = 0.2,
    valve = true,
    light = 1,
    stitch = true,
    patches = 0,
    seed = 3,
  } = opts;
  // the crown sits slightly toward the light so the sphere reads as bulging up at us
  const px = x - r * 0.12;
  const py = y - r * 0.14;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.clip();
  for (let i = 0; i < gores; i++) {
    const a0 = rotation + (i / gores) * TAU;
    const a1 = rotation + ((i + 1) / gores) * TAU;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(x + Math.cos(a0) * r * 1.5, y + Math.sin(a0) * r * 1.5);
    ctx.lineTo(x + Math.cos(a1) * r * 1.5, y + Math.sin(a1) * r * 1.5);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
  }
  if (patches > 0) {
    const rnd = seeded(seed);
    for (let i = 0; i < patches; i++) {
      const a = rnd() * TAU;
      const d = r * (0.35 + rnd() * 0.45);
      canvasPatch(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.22 + rnd() * 0.16), r * (0.18 + rnd() * 0.12), {
        color: colors[(i + 2) % colors.length],
        rot: rnd() * 1.2 - 0.6,
      });
    }
  }
  // spherical light
  if (light > 0) {
    const g = ctx.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.05, x, y, r);
    g.addColorStop(0, `rgba(255,255,250,${0.5 * light})`);
    g.addColorStop(0.35, `rgba(255,255,250,${0.12 * light})`);
    g.addColorStop(0.62, 'rgba(40,25,10,0)');
    g.addColorStop(0.88, `rgba(40,25,10,${0.3 * light})`);
    g.addColorStop(1, `rgba(30,18,6,${0.55 * light})`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // radial seams
  for (let i = 0; i < gores; i++) {
    const a = rotation + (i / gores) * TAU;
    const ex = x + Math.cos(a) * r;
    const ey = y + Math.sin(a) * r;
    const mx = (px + ex) / 2 + Math.cos(a + Math.PI / 2) * r * 0.04;
    const my = (py + ey) / 2 + Math.sin(a + Math.PI / 2) * r * 0.04;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.quadraticCurveTo(mx, my, ex, ey);
    ctx.strokeStyle = 'rgba(60,40,15,0.4)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
    if (stitch) {
      ctx.setLineDash([0.6, 0.8]);
      ctx.strokeStyle = 'rgba(255,250,235,0.35)';
      ctx.lineWidth = 0.3;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ink(ctx, 1.2);
  if (valve) {
    const vr = Math.max(1.4, r * 0.16);
    ctx.beginPath();
    ctx.arc(px, py, vr, 0, TAU);
    ctx.fillStyle = metalRadial(ctx, px, py, vr, 'brass');
    ctx.fill();
    ink(ctx, 0.6);
    ctx.beginPath();
    ctx.arc(px, py, vr * 0.45, 0, TAU);
    ctx.fillStyle = '#3a2a16';
    ctx.fill();
  }
}

// ---------------------------------------------------------------------------------------------
// Fabric, rope, rigging
// ---------------------------------------------------------------------------------------------

/**
 * Dashed stitching along a polyline (light thread with a dark needle-hole shadow).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number[][]} pts
 * @param {{dash?:number, gap?:number, width?:number, color?:string, closed?:boolean}} [opts]
 */
export function stitching(ctx, pts, opts = {}) {
  const { dash = 0.9, gap = 0.8, width = 0.4, color = 'rgba(255,248,230,0.75)', closed = false } = opts;
  ctx.save();
  ctx.setLineDash([dash, gap]);
  ctx.lineCap = 'butt';
  polygon(ctx, pts, closed);
  ctx.translate(0.2, 0.25);
  ctx.strokeStyle = 'rgba(30,18,6,0.4)';
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.translate(-0.2, -0.25);
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.restore();
}

/**
 * Straight stitched seam.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 * @param {object} [opts] see stitching()
 */
export function stitchLine(ctx, x0, y0, x1, y1, opts) {
  stitching(ctx, [[x0, y0], [x1, y1]], opts);
}

/**
 * Sewn-on fabric repair patch centred at (x, y), slightly rotated, with stitched border.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {{color?:string, rot?:number, stitch?:boolean, pattern?:'plain'|'ticking'|'check'}} [opts]
 */
export function canvasPatch(ctx, x, y, w, h, opts = {}) {
  const { color = '#d9c08e', rot = 0.1, stitch = true, pattern = 'plain' } = opts;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  roundRect(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) * 0.12);
  ctx.fillStyle = color;
  ctx.fill();
  if (pattern !== 'plain') {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(46,74,107,0.45)';
    const s = Math.max(1, Math.min(w, h) / 5);
    for (let i = -w; i < w; i += s * 2) ctx.fillRect(-w / 2 + i, -h / 2, s * 0.6, h);
    if (pattern === 'check') {
      ctx.fillStyle = 'rgba(140,47,43,0.35)';
      for (let i = -h; i < h; i += s * 2) ctx.fillRect(-w / 2, -h / 2 + i, w, s * 0.6);
    }
    ctx.restore();
  }
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = 'rgba(50,32,12,0.6)';
  ctx.stroke();
  if (stitch && w > 2.5 && h > 2.5) {
    const i = 0.75;
    stitching(ctx, [[-w / 2 + i, -h / 2 + i], [w / 2 - i, -h / 2 + i], [w / 2 - i, h / 2 - i], [-w / 2 + i, h / 2 - i]], {
      closed: true,
      dash: 0.6,
      gap: 0.55,
      width: 0.32,
    });
  }
  ctx.restore();
}

/**
 * Twisted rope (with optional sag) between two points.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 * @param {number} [width]
 * @param {{sag?:number, color?:string}} [opts] sag: perpendicular bow in units (+ = toward +y)
 */
export function ropeLine(ctx, x0, y0, x1, y1, width = 1, opts = {}) {
  const { sag = 0, color = '#b8935a' } = opts;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2 + sag;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(mx, my, x1, y1);
  };
  ctx.save();
  ctx.lineCap = 'round';
  path();
  ctx.strokeStyle = 'rgba(26,18,10,0.7)';
  ctx.lineWidth = width + 0.6;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.setLineDash([width * 0.45, width * 0.75]);
  ctx.lineCap = 'butt';
  ctx.strokeStyle = 'rgba(255,240,200,0.45)';
  ctx.lineWidth = width * 0.6;
  ctx.stroke();
  ctx.restore();
}

/**
 * Thin taut rigging wire / stay.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 * @param {{width?:number, color?:string}} [opts]
 */
export function rigging(ctx, x0, y0, x1, y1, opts = {}) {
  const { width = 0.4, color = 'rgba(40,26,12,0.75)' } = opts;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

/**
 * Chain of alternating flat / edge-on links.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 * @param {number} [link] link length @param {string} [kind]
 */
export function chain(ctx, x0, y0, x1, y1, link = 2.4, kind = 'iron') {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.round(d / (link * 0.75)));
  const a = Math.atan2(y1 - y0, x1 - x0);
  const c = ramp(kind);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    ctx.save();
    ctx.translate(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    ctx.rotate(a);
    ctx.beginPath();
    if (i % 2 === 0) {
      ctx.ellipse(0, 0, link / 2, link * 0.3, 0, 0, TAU);
      ctx.lineWidth = link * 0.2;
      ctx.strokeStyle = 'rgba(20,14,8,0.8)';
      ctx.stroke();
      ctx.lineWidth = link * 0.12;
      ctx.strokeStyle = c[1];
      ctx.stroke();
    } else {
      ctx.rect(-link / 2, -link * 0.08, link, link * 0.16);
      ctx.fillStyle = c[0];
      ctx.fill();
      ink(ctx, 0.3);
    }
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Panels, markings, ornaments
// ---------------------------------------------------------------------------------------------

/**
 * Louvred vent grille on a small plate.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {{slots?:number, kind?:string, vertical?:boolean, radius?:number, glow?:string}} [opts]
 *   vertical: slots run vertically (across x); glow: colour seen through the slots (e.g. furnace)
 */
export function ventGrille(ctx, x, y, w, h, opts = {}) {
  const { slots = 4, kind = 'iron', vertical = false, radius = 1, glow: hot = null } = opts;
  plate(ctx, x, y, w, h, radius, kind, { ink: 0.7, bevel: 0.6 });
  const pad = Math.min(w, h) * 0.18;
  for (let i = 0; i < slots; i++) {
    if (vertical) {
      const sw = (w - pad * 2) / slots;
      const sx = x + pad + sw * i + sw * 0.2;
      ctx.fillStyle = hot || 'rgba(12,8,4,0.85)';
      ctx.fillRect(sx, y + pad, sw * 0.55, h - pad * 2);
      ctx.fillStyle = alpha(ramp(kind)[0], 0.6);
      ctx.fillRect(sx + sw * 0.55, y + pad, sw * 0.14, h - pad * 2);
    } else {
      const sh = (h - pad * 2) / slots;
      const sy = y + pad + sh * i + sh * 0.2;
      ctx.fillStyle = hot || 'rgba(12,8,4,0.85)';
      ctx.fillRect(x + pad, sy, w - pad * 2, sh * 0.55);
      ctx.fillStyle = alpha(ramp(kind)[0], 0.6);
      ctx.fillRect(x + pad, sy + sh * 0.55, w - pad * 2, sh * 0.14);
    }
  }
}

/**
 * Diagonal warning stripes clipped to a rectangle (or pass `path` to clip to the current path).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {{a?:string, b?:string, stripe?:number, angle?:number, usePath?:boolean, ink?:number}} [opts]
 *   usePath: clip to the caller's current path instead of the rectangle
 */
export function hazardStripes(ctx, x, y, w, h, opts = {}) {
  const { a = '#211a12', b = '#e8b923', stripe = 3, angle = Math.PI / 4, usePath = false, ink: iw = 0.8 } = opts;
  ctx.save();
  if (!usePath) {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
  }
  ctx.clip();
  ctx.fillStyle = b;
  ctx.fillRect(x, y, w, h);
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(angle);
  ctx.fillStyle = a;
  const R = Math.hypot(w, h);
  for (let s = -R; s < R; s += stripe * 2) ctx.fillRect(s, -R, stripe, R * 2);
  ctx.restore();
  if (!usePath && iw) {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ink(ctx, iw);
  }
}

/**
 * Riveted metal strap from (x0,y0) to (x1,y1).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 * @param {number} width @param {string} [kind]
 * @param {{rivets?:number, rivetR?:number, curved?:boolean, rows?:1|2, ink?:number}} [opts]
 *   curved: lighting varies along the strap as if wrapped over a gasbag (lit at the start);
 *   rows: 1 = centre row of rivets, 2 = a row along each edge
 */
export function rivetedBand(ctx, x0, y0, x1, y1, width, kind = 'iron', opts = {}) {
  const { rivets = 4, rivetR = Math.min(0.85, width * 0.16), curved = false, rows = 2, ink: iw = 0.9 } = opts;
  const len = Math.hypot(x1 - x0, y1 - y0);
  const a = Math.atan2(y1 - y0, x1 - x0);
  const c = ramp(kind);
  ctx.save();
  ctx.translate(x0, y0);
  ctx.rotate(a);
  ctx.beginPath();
  ctx.rect(0, -width / 2, len, width);
  if (curved) {
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, c[1]);
    g.addColorStop(0.16, c[0]);
    g.addColorStop(0.32, mix(c[0], c[1], 0.4));
    g.addColorStop(0.6, c[1]);
    g.addColorStop(0.86, c[2]);
    g.addColorStop(1, c[3]);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = cylinderGrad(ctx, 0, -width / 2, 0, width / 2, kind);
  }
  ctx.fill();
  // edge bevels
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(0, -width / 2, len, Math.min(0.5, width * 0.12));
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, width / 2 - Math.min(0.5, width * 0.12), len, Math.min(0.5, width * 0.12));
  if (iw) {
    ctx.beginPath();
    ctx.rect(0, -width / 2, len, width);
    ink(ctx, iw);
  }
  if (rivets > 0) {
    const ys = rows === 2 ? [-width * 0.27, width * 0.27] : [0];
    for (const yy of ys) rivetLine(ctx, rivets * 0.5, yy, len - rivets * 0.5, yy, rivets, rivetR, kind);
  }
  ctx.restore();
}

/**
 * Engraved name-plate with lettering.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y centre
 * @param {number} w @param {number} h
 * @param {string} text
 * @param {{kind?:string, color?:string, rot?:number, font?:string}} [opts]
 */
export function nameplate(ctx, x, y, w, h, text, opts = {}) {
  const { kind = 'brass', color = '#3a2410', rot = 0, font = 'Georgia, "Times New Roman", serif' } = opts;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  plate(ctx, -w / 2, -h / 2, w, h, h * 0.35, kind, { ink: 0.6, polish: true, bevel: 0.4 });
  rivet(ctx, -w / 2 + h * 0.42, 0, h * 0.16, kind);
  rivet(ctx, w / 2 - h * 0.42, 0, h * 0.16, kind);
  ctx.font = `bold ${h * 0.62}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const maxW = w - h * 1.2;
  const tw = ctx.measureText(text).width;
  if (tw > maxW) ctx.scale(maxW / tw, 1);
  ctx.fillStyle = 'rgba(255,245,210,0.5)';
  ctx.fillText(text, 0.15, h * 0.06 + 0.15);
  ctx.fillStyle = color;
  ctx.fillText(text, 0, h * 0.06);
  ctx.restore();
}

/**
 * Heraldic medallion: brass rim + emblem.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} r
 * @param {{emblem?:'cog'|'wings'|'skull'|'anchor'|'bolt', field?:string, kind?:string,
 *   color?:string}} [opts] field: inner disc colour; color: emblem colour
 */
export function crest(ctx, x, y, r, opts = {}) {
  const { emblem = 'cog', field = PAL.oxblood, kind = 'brass', color = '#f2d48a' } = opts;
  if (emblem === 'wings') {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + s * r * 0.6, y - r * 0.3);
      ctx.quadraticCurveTo(x + s * r * 1.9, y - r * 1.0, x + s * r * 2.0, y - r * 0.2);
      ctx.quadraticCurveTo(x + s * r * 1.5, y - r * 0.15, x + s * r * 1.7, y + r * 0.2);
      ctx.quadraticCurveTo(x + s * r * 1.2, y + r * 0.2, x + s * r * 1.3, y + r * 0.55);
      ctx.quadraticCurveTo(x + s * r * 0.9, y + r * 0.45, x + s * r * 0.6, y + r * 0.4);
      ctx.closePath();
      ctx.fillStyle = metal(ctx, x - r * 2, y - r, x + r * 2, y + r, kind, { polish: true });
      ctx.fill();
      ink(ctx, 0.5);
    }
  }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, x, y, r, kind);
  ctx.fill();
  ink(ctx, 0.6);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.74, 0, TAU);
  ctx.fillStyle = field;
  ctx.fill();
  shadeOverlay(ctx, x - r, y - r, x + r, y + r, 0.2, 0.35);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  const s = r * 0.5;
  if (emblem === 'cog' || emblem === 'wings') {
    gearPath(ctx, x, y, s, 8, s * 0.28, 0, s * 0.35);
    ctx.fill('evenodd');
  } else if (emblem === 'skull') {
    ctx.beginPath();
    ctx.arc(x, y - s * 0.15, s * 0.62, Math.PI * 0.85, Math.PI * 2.15);
    ctx.lineTo(x + s * 0.4, y + s * 0.55);
    ctx.lineTo(x - s * 0.4, y + s * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = field;
    ctx.beginPath();
    ctx.arc(x - s * 0.24, y - s * 0.1, s * 0.17, 0, TAU);
    ctx.arc(x + s * 0.24, y - s * 0.1, s * 0.17, 0, TAU);
    ctx.fill();
    ctx.fillRect(x - s * 0.05, y + s * 0.12, s * 0.1, s * 0.18);
  } else if (emblem === 'anchor') {
    ctx.lineWidth = s * 0.2;
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.7);
    ctx.lineTo(x, y + s * 0.6);
    ctx.moveTo(x - s * 0.4, y - s * 0.35);
    ctx.lineTo(x + s * 0.4, y - s * 0.35);
    ctx.moveTo(x - s * 0.6, y + s * 0.1);
    ctx.quadraticCurveTo(x - s * 0.5, y + s * 0.65, x, y + s * 0.6);
    ctx.quadraticCurveTo(x + s * 0.5, y + s * 0.65, x + s * 0.6, y + s * 0.1);
    ctx.stroke();
  } else if (emblem === 'bolt') {
    polygon(ctx, [
      [x + s * 0.15, y - s * 0.8],
      [x - s * 0.45, y + s * 0.1],
      [x - s * 0.02, y + s * 0.1],
      [x - s * 0.18, y + s * 0.8],
      [x + s * 0.45, y - s * 0.12],
      [x + s * 0.03, y - s * 0.12],
    ]);
    ctx.fill();
  }
}

/**
 * Tail/stabiliser fin from a polygon, with spar lines from the root and a painted trailing edge.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number[][]} pts polygon; the first two points are treated as the root edge
 * @param {{fill?:string, edge?:string, spars?:number, kind?:string, ink?:number, rivets?:boolean}} [opts]
 *   edge: colour of a painted band along the outermost edge (pts[2]→pts[3])
 */
export function fin(ctx, pts, opts = {}) {
  const { fill = PAL.canvas[1], edge = null, spars = 3, kind = 'brass', ink: iw = 1, rivets = true } = opts;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [px, py] of pts) {
    x0 = Math.min(x0, px);
    y0 = Math.min(y0, py);
    x1 = Math.max(x1, px);
    y1 = Math.max(y1, py);
  }
  polygon(ctx, pts);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.save();
  ctx.clip();
  if (edge && pts.length >= 4) {
    const [ax, ay] = pts[2];
    const [bx, by] = pts[3];
    const nx = -(by - ay);
    const ny = bx - ax;
    const nl = Math.hypot(nx, ny) || 1;
    const cxp = (x0 + x1) / 2;
    const cyp = (y0 + y1) / 2;
    // push the band inward (toward the fin centre)
    const sgn = (cxp - ax) * nx + (cyp - ay) * ny > 0 ? 1 : -1;
    const d = Math.min(x1 - x0, y1 - y0) * 0.32;
    polygon(ctx, [
      [ax, ay],
      [bx, by],
      [bx + (sgn * nx * d) / nl, by + (sgn * ny * d) / nl],
      [ax + (sgn * nx * d) / nl, ay + (sgn * ny * d) / nl],
    ]);
    ctx.fillStyle = edge;
    ctx.fill();
  }
  // spars fan from the root to the outer edge
  const [r0, r1] = [pts[0], pts[1]];
  const outer = pts.slice(2);
  for (let i = 1; i <= spars; i++) {
    const t = i / (spars + 1);
    const rx = r0[0] + (r1[0] - r0[0]) * t;
    const ry = r0[1] + (r1[1] - r0[1]) * t;
    const oi = Math.min(outer.length - 1, Math.floor(t * outer.length));
    const ox = outer[oi][0];
    const oy = outer[oi][1];
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(ox, oy);
    ctx.strokeStyle = 'rgba(60,40,15,0.35)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
  ctx.restore();
  polygon(ctx, pts);
  shadeOverlay(ctx, x0, y0, x1, y1, 0.22, 0.3);
  if (iw) ink(ctx, iw);
  if (rivets) rivetLine(ctx, r0[0], r0[1], r1[0], r1[1], 3.2, 0.55, kind);
}

/**
 * Wound copper coil (top-down) along a segment with an iron core.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 * @param {number} width @param {number} [turns]
 * @param {{kind?:string, core?:string, glow?:string}} [opts] glow: aether glow between windings
 */
export function coil(ctx, x0, y0, x1, y1, width, turns = 8, opts = {}) {
  const { kind = 'copper', core = 'iron', glow: gc = null } = opts;
  const len = Math.hypot(x1 - x0, y1 - y0);
  const a = Math.atan2(y1 - y0, x1 - x0);
  cylinder(ctx, x0, y0, x1, y1, width * 0.6, width * 0.6, core, { ink: 0.6 });
  ctx.save();
  ctx.translate(x0, y0);
  ctx.rotate(a);
  if (gc) glowEllipse(ctx, len / 2, 0, len * 0.65, width * 0.9, gc, 0.6);
  const c = ramp(kind);
  const step = len / turns;
  for (let i = 0; i < turns; i++) {
    const cx = step * (i + 0.5);
    ctx.beginPath();
    ctx.ellipse(cx, 0, step * 0.42, width / 2, 0, 0, TAU);
    const g = ctx.createLinearGradient(0, -width / 2, 0, width / 2);
    g.addColorStop(0, c[2]);
    g.addColorStop(0.22, c[0]);
    g.addColorStop(0.5, c[1]);
    g.addColorStop(1, c[3]);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 0.35;
    ctx.strokeStyle = 'rgba(26,14,6,0.7)';
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Faceted crystal (aether shard). Elongated hexagonal gem pointing along `rot`.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} r half-length
 * @param {{color?:string, light?:string, dark?:string, rot?:number, width?:number,
 *   glow?:number, ink?:number}} [opts] width: half-width as fraction of r; glow: halo radius
 *   multiplier (0 = none)
 */
export function crystal(ctx, x, y, r, opts = {}) {
  const { color = PAL.aether[1], light = '#e8ffff', dark = '#0f5c5a', rot = -Math.PI / 2, width = 0.55, glow: gr = 0, ink: iw = 0.7 } = opts;
  if (gr > 0) glow(ctx, x, y, r * gr, color, 0.55);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const w = r * width;
  // outline points: tip, upper shoulder, upper heel, butt, lower heel, lower shoulder
  const P = [
    [r, 0],
    [r * 0.35, -w],
    [-r * 0.55, -w * 0.8],
    [-r, 0],
    [-r * 0.55, w * 0.8],
    [r * 0.35, w],
  ];
  const C = [r * 0.05, -w * 0.12];
  const facetCols = [lighten(color, 0.55), lighten(color, 0.2), mix(color, dark, 0.35), mix(color, dark, 0.6), color, lighten(color, 0.35)];
  for (let i = 0; i < 6; i++) {
    const p = P[i];
    const q = P[(i + 1) % 6];
    polygon(ctx, [C, p, q]);
    ctx.fillStyle = facetCols[i];
    ctx.fill();
    ctx.lineWidth = 0.25;
    ctx.strokeStyle = alpha(light, 0.5);
    ctx.stroke();
  }
  polygon(ctx, P);
  if (iw) ink(ctx, iw);
  // sparkle
  ctx.fillStyle = alpha(light, 0.95);
  star(ctx, r * 0.25, -w * 0.4, r * 0.22, r * 0.05, 4, 0);
  ctx.fill();
  ctx.restore();
}

/**
 * Pressure gauge: brass bezel, cream dial, ticks, red needle.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} r
 * @param {{value?:number, kind?:string, face?:string, redline?:boolean}} [opts] value 0..1
 */
export function gauge(ctx, x, y, r, opts = {}) {
  const { value = 0.7, kind = 'brass', face = '#f3ead2', redline = true } = opts;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, x, y, r, kind);
  ctx.fill();
  ink(ctx, Math.max(0.35, r * 0.12));
  ctx.beginPath();
  ctx.arc(x, y, r * 0.74, 0, TAU);
  ctx.fillStyle = face;
  ctx.fill();
  const a0 = Math.PI * 0.75;
  const a1 = Math.PI * 2.25;
  if (redline) {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.6, a0 + (a1 - a0) * 0.78, a1);
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = r * 0.14;
    ctx.stroke();
  }
  ctx.strokeStyle = '#2b1d10';
  ctx.lineWidth = Math.max(0.2, r * 0.06);
  for (let i = 0; i <= 6; i++) {
    const a = a0 + ((a1 - a0) * i) / 6;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5);
    ctx.lineTo(x + Math.cos(a) * r * 0.68, y + Math.sin(a) * r * 0.68);
    ctx.stroke();
  }
  const na = a0 + (a1 - a0) * value;
  ctx.beginPath();
  ctx.moveTo(x - Math.cos(na) * r * 0.12, y - Math.sin(na) * r * 0.12);
  ctx.lineTo(x + Math.cos(na) * r * 0.62, y + Math.sin(na) * r * 0.62);
  ctx.strokeStyle = '#a3241a';
  ctx.lineWidth = Math.max(0.3, r * 0.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.12, 0, TAU);
  ctx.fillStyle = '#2b1d10';
  ctx.fill();
  // glass glint
  ctx.beginPath();
  ctx.arc(x, y, r * 0.66, Math.PI * 1.1, Math.PI * 1.55);
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = r * 0.1;
  ctx.stroke();
}

/**
 * Iron spike (triangle) from base (x, y) pointing along `angle`.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} len @param {number} width
 * @param {number} [angle] @param {string} [kind]
 */
export function spike(ctx, x, y, len, width, angle = 0, kind = 'blackiron') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  polygon(ctx, [
    [0, -width / 2],
    [len, 0],
    [0, width / 2],
  ]);
  ctx.fillStyle = cylinderGrad(ctx, 0, -width / 2, 0, width / 2, kind);
  ctx.fill();
  ink(ctx, 0.55);
  ctx.restore();
}

/**
 * Bone with knobbed ends (trophies, ribs). A curved rib if `bend` ≠ 0.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 * @param {number} width
 * @param {{bend?:number, knobs?:boolean, color?:string}} [opts] bend: perpendicular bow
 */
export function bone(ctx, x0, y0, x1, y1, width, opts = {}) {
  const { bend = 0, knobs = true, color = METALS.bone[1] } = opts;
  const len = Math.hypot(x1 - x0, y1 - y0);
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.save();
  ctx.translate(x0, y0);
  ctx.rotate(a);
  const shaft = () => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len / 2, bend * 2, len, 0);
  };
  ctx.lineCap = 'round';
  shaft();
  ctx.strokeStyle = 'rgba(26,18,10,0.7)';
  ctx.lineWidth = width + 1;
  ctx.stroke();
  if (knobs) {
    for (const ex of [0, len]) {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(ex, s * width * 0.38, width * 0.55, 0, TAU);
        ctx.fillStyle = 'rgba(26,18,10,0.7)';
        ctx.fill();
      }
    }
  }
  shaft();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  if (knobs) {
    for (const ex of [0, len]) {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(ex, s * width * 0.38, width * 0.45, 0, TAU);
        ctx.fillStyle = color;
        ctx.fill();
      }
    }
  }
  ctx.translate(0, -width * 0.18);
  shaft();
  ctx.strokeStyle = 'rgba(255,255,245,0.6)';
  ctx.lineWidth = width * 0.3;
  ctx.stroke();
  ctx.restore();
}

/**
 * Lamp / signal light: halo, bright lens and brass cage.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} r
 * @param {string} [color] @param {{halo?:number, cage?:boolean}} [opts]
 */
export function lamp(ctx, x, y, r, color = '#ffcf6a', opts = {}) {
  const { halo = 3, cage = true } = opts;
  if (halo > 0) glow(ctx, x, y, r * halo, color, 0.6);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.4, lighten(color, 0.4));
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  ctx.fill();
  ink(ctx, Math.max(0.3, r * 0.2));
  if (cage) {
    ctx.strokeStyle = alpha(METALS.brass[2], 0.9);
    ctx.lineWidth = Math.max(0.25, r * 0.16);
    ctx.beginPath();
    ctx.moveTo(x - r, y);
    ctx.lineTo(x + r, y);
    ctx.moveTo(x, y - r);
    ctx.lineTo(x, y + r);
    ctx.stroke();
  }
}

/**
 * Metal dome / hatch seen from above.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} r
 * @param {string} [kind] @param {{rivets?:number, ring?:boolean}} [opts]
 */
export function dome(ctx, x, y, r, kind = 'brass', opts = {}) {
  const { rivets = 0, ring = true } = opts;
  if (ring) {
    ctx.beginPath();
    ctx.arc(x, y, r * 1.18, 0, TAU);
    ctx.fillStyle = ramp(kind)[2];
    ctx.fill();
    ink(ctx, 0.6);
  }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, x, y, r, kind, { spec: 0.6 });
  ctx.fill();
  ink(ctx, 0.6);
  if (rivets) rivetRing(ctx, x, y, r * 1.09, rivets, Math.max(0.3, r * 0.08), kind);
}

/**
 * Wooden deck with planks running along x, nail heads and an optional rounded outline.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {{radius?:number|number[], plank?:number, kind?:string, seed?:number, ink?:number}} [opts]
 */
export function deck(ctx, x, y, w, h, opts = {}) {
  const { radius = 2, plank = 2.2, kind = 'wood', seed = 5, ink: iw = 1 } = opts;
  const c = ramp(kind);
  const rnd = seeded(seed);
  roundRect(ctx, x, y, w, h, radius);
  ctx.fillStyle = c[1];
  ctx.fill();
  ctx.save();
  ctx.clip();
  for (let py = y, row = 0; py < y + h; py += plank, row++) {
    let px = x - rnd() * 12;
    while (px < x + w) {
      const L = 8 + rnd() * 10;
      ctx.fillStyle = mix(c[1], rnd() < 0.5 ? c[0] : c[2], rnd() * 0.45);
      ctx.fillRect(px, py, L, plank);
      ctx.fillStyle = 'rgba(20,12,4,0.45)';
      ctx.fillRect(px + L - 0.25, py, 0.25, plank);
      px += L;
    }
    ctx.fillStyle = 'rgba(20,12,4,0.45)';
    ctx.fillRect(x, py + plank - 0.3, w, 0.3);
  }
  ctx.restore();
  roundRect(ctx, x, y, w, h, radius);
  shadeOverlay(ctx, x, y, x + w, y + h, 0.18, 0.3);
  if (iw) ink(ctx, iw);
}

/**
 * Deck railing along a polyline: thin brass rail with stanchion posts.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number[][]} pts
 * @param {{post?:number, kind?:string, closed?:boolean}} [opts] post spacing
 */
export function railing(ctx, pts, opts = {}) {
  const { post = 3, kind = 'brass', closed = false } = opts;
  const c = ramp(kind);
  polygon(ctx, pts, closed);
  ctx.strokeStyle = 'rgba(26,18,10,0.7)';
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.strokeStyle = c[0];
  ctx.lineWidth = 0.45;
  ctx.stroke();
  const segs = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < segs; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % pts.length];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / post));
    for (let j = 0; j < n; j++) {
      const t = j / n;
      ctx.beginPath();
      ctx.arc(ax + (bx - ax) * t, ay + (by - ay) * t, 0.45, 0, TAU);
      ctx.fillStyle = c[1];
      ctx.fill();
    }
  }
}

/**
 * Streamlined engine nacelle / pod along +x centred at (x, y): capsule body with cross-shading,
 * painted band, intake grille at the nose and an exhaust collar at the tail.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} len @param {number} wid
 * @param {{kind?:string, band?:string, nose?:string, exhaust?:boolean, glow?:string}} [opts]
 *   nose: material of the nose cone; glow: colour of the hot exhaust ring
 */
export function nacelle(ctx, x, y, len, wid, opts = {}) {
  const { kind = 'brass', band = null, nose = 'copper', exhaust = true, glow: hot = '#ff9a3c' } = opts;
  const x0 = x - len / 2;
  const x1 = x + len / 2;
  ctx.beginPath();
  ctx.moveTo(x0 + wid * 0.3, y - wid / 2);
  ctx.lineTo(x1 - wid * 0.6, y - wid / 2);
  ctx.quadraticCurveTo(x1 + wid * 0.1, y - wid * 0.45, x1, y);
  ctx.quadraticCurveTo(x1 + wid * 0.1, y + wid * 0.45, x1 - wid * 0.6, y + wid / 2);
  ctx.lineTo(x0 + wid * 0.3, y + wid / 2);
  ctx.quadraticCurveTo(x0 - wid * 0.05, y, x0 + wid * 0.3, y - wid / 2);
  ctx.closePath();
  ctx.fillStyle = cylinderGrad(ctx, 0, y - wid / 2, 0, y + wid / 2, kind);
  ctx.fill();
  ctx.save();
  ctx.clip();
  // nose cone
  ctx.fillStyle = cylinderGrad(ctx, 0, y - wid / 2, 0, y + wid / 2, nose);
  ctx.fillRect(x1 - wid * 0.75, y - wid, wid, wid * 2);
  if (band) {
    ctx.fillStyle = band;
    ctx.fillRect(x0 + len * 0.42, y - wid, len * 0.12, wid * 2);
    shadeOverlay(ctx, 0, y - wid / 2, 0, y + wid / 2, 0.15, 0.4);
  }
  // panel seams
  ctx.fillStyle = 'rgba(26,18,10,0.35)';
  ctx.fillRect(x0 + len * 0.3, y - wid, 0.35, wid * 2);
  ctx.fillRect(x1 - wid * 0.75, y - wid, 0.35, wid * 2);
  ctx.restore();
  ink(ctx, 0.9);
  if (exhaust) {
    ctx.beginPath();
    ctx.ellipse(x0 + wid * 0.25, y, wid * 0.16, wid * 0.36, 0, 0, TAU);
    ctx.fillStyle = '#1a0f08';
    ctx.fill();
    if (hot) glowEllipse(ctx, x0 + wid * 0.2, y, wid * 0.5, wid * 0.35, hot, 0.5);
  }
  rivetLine(ctx, x0 + len * 0.36, y - wid * 0.3, x0 + len * 0.36, y + wid * 0.3, wid * 0.3, Math.max(0.3, wid * 0.07), kind);
}

/**
 * Turret ring mount (barbette) at (x, y): dark race, bolted brass ring and a shaded turntable.
 * Enemy/boss turrets can share it.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} r outer radius
 * @param {{kind?:string, table?:string, bolts?:number}} [opts] table = turntable material
 */
export function ringMount(ctx, x, y, r, opts = {}) {
  const { kind = 'brass', table = 'iron', bolts = 10 } = opts;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = metal(ctx, x - r, y - r, x + r, y + r, kind, { polish: true });
  ctx.fill();
  ink(ctx, 1);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.8, 0, TAU);
  ctx.fillStyle = 'rgba(20,12,6,0.85)';
  ctx.fill();
  rivetRing(ctx, x, y, r * 0.9, bolts, Math.max(0.35, r * 0.065), kind, 0.3);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.72, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, x, y, r * 0.72, table, { spec: 0.25 });
  ctx.fill();
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = 'rgba(26,18,10,0.6)';
  ctx.stroke();
}

/**
 * Small skull (front view) — trophies, pirate crests.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} r
 * @param {{color?:string, eyes?:string, horns?:boolean, rot?:number}} [opts]
 */
export function skull(ctx, x, y, r, opts = {}) {
  const { color = METALS.bone[1], eyes = '#1a0c06', horns = false, rot = 0 } = opts;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  if (horns) {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * r * 0.6, -r * 0.4);
      ctx.quadraticCurveTo(s * r * 1.5, -r * 0.6, s * r * 1.45, -r * 1.35);
      ctx.quadraticCurveTo(s * r * 1.1, -r * 0.75, s * r * 0.45, -r * 0.75);
      ctx.closePath();
      ctx.fillStyle = cylinderGrad(ctx, 0, -r * 1.3, 0, -r * 0.4, 'bone');
      ctx.fill();
      ink(ctx, 0.5);
    }
  }
  ctx.beginPath();
  ctx.arc(0, -r * 0.15, r * 0.82, Math.PI * 0.82, Math.PI * 2.18);
  ctx.lineTo(r * 0.45, r * 0.75);
  ctx.lineTo(-r * 0.45, r * 0.75);
  ctx.closePath();
  ctx.fillStyle = metalRadial(ctx, 0, 0, r, 'bone', { spec: 0.2 });
  ctx.fill();
  ink(ctx, Math.max(0.35, r * 0.12));
  ctx.fillStyle = eyes;
  ctx.beginPath();
  ctx.ellipse(-r * 0.33, -r * 0.08, r * 0.24, r * 0.27, 0.2, 0, TAU);
  ctx.ellipse(r * 0.33, -r * 0.08, r * 0.24, r * 0.27, -0.2, 0, TAU);
  ctx.fill();
  polygon(ctx, [
    [0, r * 0.18],
    [-r * 0.1, r * 0.36],
    [r * 0.1, r * 0.36],
  ]);
  ctx.fill();
  ctx.strokeStyle = eyes;
  ctx.lineWidth = Math.max(0.2, r * 0.07);
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * r * 0.16, r * 0.5);
    ctx.lineTo(i * r * 0.16, r * 0.75);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Faint grid of panel lines inside the current clip (sheet-metal / plating detail).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {number} [cw] cell width @param {number} [ch] cell height
 * @param {{stagger?:boolean, a?:number}} [opts] stagger: brick-offset rows
 */
export function panelLines(ctx, x, y, w, h, cw = 8, ch = 6, opts = {}) {
  const { stagger = true, a = 0.35 } = opts;
  ctx.save();
  ctx.lineWidth = 0.4;
  for (let row = 0, py = y; py <= y + h; row++, py += ch) {
    ctx.strokeStyle = `rgba(20,12,6,${a})`;
    ctx.beginPath();
    ctx.moveTo(x, py);
    ctx.lineTo(x + w, py);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${a * 0.4})`;
    ctx.beginPath();
    ctx.moveTo(x, py + 0.45);
    ctx.lineTo(x + w, py + 0.45);
    ctx.stroke();
    const off = stagger && row % 2 ? cw / 2 : 0;
    for (let px = x + off; px <= x + w; px += cw) {
      ctx.strokeStyle = `rgba(20,12,6,${a})`;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px, py + ch);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Hot, readable enemy-fire bullet body: dark rim → saturated body → white-hot core (DESIGN §1).
 * Shared by ordnance and any content that wants bespoke enemy shots.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} r
 * @param {{body?:string, core?:string, rim?:string, halo?:number}} [opts] halo: glow radius ×r
 */
export function hotOrb(ctx, x, y, r, opts = {}) {
  const { body = PAL.enemyFire[0], core = PAL.enemyFire[1], rim = '#3a0806', halo = 1.7 } = opts;
  if (halo > 0) glow(ctx, x, y, r * halo, body, 0.55);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = rim;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.8, 0, TAU);
  const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, 0, x, y, r * 0.8);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, core);
  g.addColorStop(0.7, body);
  g.addColorStop(1, darken(body, 0.25));
  ctx.fillStyle = g;
  ctx.fill();
}
