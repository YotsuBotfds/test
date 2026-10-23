// Drawkit core: colour utilities, materials/gradients, path helpers, outline & lighting
// finishers and glows. Re-exported by ../drawkit.js — import from there.

/** 2π. */
export const TAU = Math.PI * 2;

/** Standard outline colour (DESIGN §5: #1a120a at ~65%). */
export const INK = 'rgba(26,18,10,0.65)';

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
    v = [
      (n >> 16) & 255,
      (n >> 8) & 255,
      n & 255,
      h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    ];
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
  let s = Math.imul(seed | 0 || 1, 2654435761) >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
  ctx.fillRect(
    Math.min(x0, x1) - 2,
    Math.min(y0, y1) - 2,
    Math.abs(x1 - x0) + 4,
    Math.abs(y1 - y0) + 4
  );
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
