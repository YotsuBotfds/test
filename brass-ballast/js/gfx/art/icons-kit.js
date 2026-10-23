// Icon painting kit (WP5). Shared vocabulary for the 64×64 UI icons: bold cel-shaded "relief"
// shapes with a thick ink outline (legible at 40 px), plus reusable glyph parts (shells,
// cannonballs, flames, bolts, clouds, bursts…). Glyphs draw in a 64-unit box centred on (32,32)
// and should stay inside a radius of ~21 so they sit on the medallion field.
//
// Only drawkit names documented in DESIGN §12 WP4 are imported; everything else is local.

import { gear as dkGear, glow as dkGlow, rivet as dkRivet } from '../drawkit.js';

export const TAU = Math.PI * 2;
export const C = 32; // icon centre
export const INKC = '#1a120a';
export const OUT = 2.2; // glyph outline width (≈1.4 px at 40 px display)

/**
 * Colour ramps [highlight, mid, shade]. Tuned brighter than the world palette: icons sit on
 * dark enamel and must pop at small sizes.
 */
export const R = {
  brass: ['#fff0b8', '#e2b155', '#8f6324'],
  gold: ['#fff7cc', '#ffcf4a', '#b07c18'],
  bronze: ['#f0c48c', '#b07a3e', '#664018'],
  copper: ['#ffc39a', '#cc7444', '#7a3c1c'],
  steel: ['#f4f8fc', '#a9b4c0', '#5a6470'],
  iron: ['#b8c0c9', '#6c747e', '#363c44'],
  blackiron: ['#6f6a66', '#3e3936', '#1c1917'],
  wood: ['#d9a066', '#9c6634', '#5a3818'],
  darkwood: ['#9c6c44', '#674126', '#341f0e'],
  red: ['#ff9b80', '#d63e2a', '#7e1c12'],
  oxblood: ['#d86a5e', '#9c3430', '#561714'],
  fire: ['#fff6b0', '#ffb030', '#d4521a'],
  green: ['#b8ef8a', '#58a63c', '#28561c'],
  aether: ['#effffe', '#7ff3ff', '#2ba3a6'],
  teal: ['#9ff2e6', '#33b9a8', '#17675d'],
  cream: ['#fffdf4', '#f1e4c2', '#b9a479'],
  bone: ['#fffaea', '#e3d4ad', '#a08c62'],
  navy: ['#87a8d0', '#365a84', '#1a2d47'],
  canvas: ['#fffaf0', '#efe0bb', '#b5a072'],
  smoke: ['#ffffff', '#d9dde2', '#8f98a3'],
  purple: ['#e6b8ff', '#9a5ad0', '#4e2470'],
  crimson: ['#ff8a70', '#e0402c', '#861c10'],
  white: ['#ffffff', '#f6f2e8', '#c9c0ac'],
};

/** @param {string|string[]} r ramp key or explicit ramp */
const rampOf = (r) => (typeof r === 'string' ? R[r] || R.brass : r);

// ---------------------------------------------------------------------------------------------
// Path builders: each returns a re-callable `(ctx) => void` that begins and builds a path, so
// `body()` can replay it for fill, cel-shade, highlight and outline passes.

export const P = {
  circle: (x, y, r) => (ctx) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
  },
  ellipse: (x, y, rx, ry, rot = 0) => (ctx) => {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
  },
  rect: (x, y, w, h, r = 0) => (ctx) => {
    ctx.beginPath();
    if (r > 0 && ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  },
  poly: (pts) => (ctx) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  },
  /** Closed smooth curve through points (quadratic midpoints). */
  smooth: (pts) => (ctx) => {
    ctx.beginPath();
    const n = pts.length;
    ctx.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % n];
      ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
    }
    ctx.closePath();
  },
  ring: (x, y, r0, r1) => (ctx) => {
    ctx.beginPath();
    ctx.arc(x, y, r1, 0, TAU);
    ctx.moveTo(x + r0, y);
    ctx.arc(x, y, r0, 0, TAU, true);
  },
  star: (x, y, r, ri, n = 5, rot = -Math.PI / 2) => (ctx) => {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = rot + (i / (n * 2)) * TAU;
      const rr = i % 2 ? ri : r;
      if (i) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  },
  /** Jagged starburst with seeded irregular spikes (explosions, flak). */
  burst: (x, y, r, ri, n = 9, seed = 1) => (ctx) => {
    const rnd = rng(seed);
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * TAU + (rnd() - 0.5) * 0.25;
      const rr = i % 2 ? ri * (0.85 + rnd() * 0.3) : r * (0.78 + rnd() * 0.22);
      if (i) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  },
  /** Arbitrary builder: fn(ctx) draws sub-paths after a beginPath. */
  custom: (fn) => (ctx) => {
    ctx.beginPath();
    fn(ctx);
  },
  /** Transform another path builder (translate → rotate → scale). */
  xf: (path, x, y, rot = 0, sx = 1, sy = sx) => (ctx) => {
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    path(ctx);
    ctx.restore(); // the built path survives restore (paths are not part of state)
  },
};

/** Tiny deterministic PRNG. */
export function rng(seed = 1) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------
// Painters

/**
 * Cel-shaded relief shape: shade base, mid tone shifted up-left (leaves a shade crescent on the
 * lower-right), an inset highlight line on the upper-left, then a thick ink outline.
 * @param {CanvasRenderingContext2D} ctx
 * @param {(ctx:CanvasRenderingContext2D)=>void} path re-callable path builder
 * @param {string|string[]} ramp R key or [hi, mid, shade]
 * @param {{out?:number, d?:number, hi?:number, rule?:CanvasFillRule, flat?:boolean,
 *   sheen?:boolean}} [o] d = shade depth; hi = highlight width (0 none); out = outline width
 */
export function body(ctx, path, ramp, o = {}) {
  const r = rampOf(ramp);
  const { out = OUT, d = 2, hi = 1.5, rule = 'nonzero', flat = false, sheen = false } = o;
  ctx.save();
  path(ctx);
  ctx.fillStyle = flat ? r[1] : r[2];
  ctx.fill(rule);
  if (!flat) {
    ctx.clip(rule);
    ctx.save();
    ctx.translate(-d * 0.75, -d);
    path(ctx);
    ctx.fillStyle = r[1];
    ctx.fill(rule);
    ctx.restore();
    if (hi > 0) {
      ctx.save();
      ctx.translate(d * 0.6 + 0.4, d * 0.6 + 0.4);
      path(ctx);
      ctx.strokeStyle = r[0];
      ctx.lineWidth = hi;
      ctx.stroke();
      ctx.restore();
    }
    if (sheen) {
      // soft specular wash for glassy / polished parts
      const g = ctx.createLinearGradient(0, 0, 64, 64);
      g.addColorStop(0.25, 'rgba(255,255,255,0.28)');
      g.addColorStop(0.45, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    }
  }
  ctx.restore();
  if (out > 0) {
    path(ctx);
    ctx.lineWidth = out;
    ctx.strokeStyle = INKC;
    ctx.stroke();
  }
}

/**
 * Inked stroke: dark under-stroke then coloured stroke (lines, arcs, bolts, ropes).
 * @param {CanvasRenderingContext2D} ctx
 * @param {(ctx:CanvasRenderingContext2D)=>void} path open or closed path builder
 * @param {string} color
 * @param {number} w coloured width
 * @param {{out?:number, cap?:CanvasLineCap, dash?:number[], hiColor?:string}} [o]
 */
export function line(ctx, path, color, w, o = {}) {
  const { out = OUT * 0.8, cap = 'round', dash = null, hiColor = null } = o;
  ctx.save();
  ctx.lineCap = cap;
  ctx.lineJoin = 'round';
  if (dash) ctx.setLineDash(dash);
  path(ctx);
  if (out > 0) {
    ctx.strokeStyle = INKC;
    ctx.lineWidth = w + out * 2;
    ctx.stroke();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
  if (hiColor) {
    ctx.translate(-w * 0.18, -w * 0.18);
    path(ctx);
    ctx.strokeStyle = hiColor;
    ctx.lineWidth = w * 0.35;
    ctx.stroke();
  }
  ctx.restore();
}

/** Plain stroke without outline (engraving detail on top of bodies). */
export function detail(ctx, path, color = INKC, w = 1.2, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  path(ctx);
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
  ctx.restore();
}

/** Plain fill (no outline). */
export function fill(ctx, path, color, alpha = 1, rule = 'nonzero') {
  ctx.save();
  ctx.globalAlpha *= alpha;
  path(ctx);
  ctx.fillStyle = color;
  ctx.fill(rule);
  ctx.restore();
}

/** Soft additive glow (baked once). */
export function glow(ctx, x, y, r, color, a = 1) {
  dkGlow(ctx, x, y, r, color, a, { blend: 'lighter' });
}

/** Specular glint: small white lens/ellipse highlight. */
export function glint(ctx, x, y, rx, ry = rx * 0.55, rot = -0.7, a = 0.85) {
  fill(ctx, P.ellipse(x, y, rx, ry, rot), '#ffffff', a);
}

/** Four-point sparkle star (legendary / lucky accents). */
export function sparkle(ctx, x, y, r, color = '#fffbe0', o = {}) {
  const path = P.custom((c) => {
    const k = r * 0.22;
    c.moveTo(x, y - r);
    c.quadraticCurveTo(x + k, y - k, x + r, y);
    c.quadraticCurveTo(x + k, y + k, x, y + r);
    c.quadraticCurveTo(x - k, y + k, x - r, y);
    c.quadraticCurveTo(x - k, y - k, x, y - r);
    c.closePath();
  });
  if (o.glow !== false) glow(ctx, x, y, r * 1.4, o.glowColor || color, 0.55);
  body(ctx, path, [color, color, color], { flat: true, out: o.out ?? 1.2 });
}

export function rivet(ctx, x, y, r = 1.4, kind = 'brass') {
  dkRivet(ctx, x, y, r, kind);
}

/** Drawkit gear wrapped with a heavy icon outline. */
export function cog(ctx, x, y, r, teeth = 10, o = {}) {
  const { kind = 'brass', rot = 0, spokes = 0, hole = r * 0.3, out = OUT } = o;
  ctx.save();
  // heavy outline first: an oversized dark gear silhouette behind
  ctx.lineJoin = 'round';
  gearOutline(ctx, x, y, r, teeth, r * 0.24, rot, out);
  dkGear(ctx, x, y, r, teeth, { kind, rotation: rot, spokes, hole, toothDepth: r * 0.24, outline: 0.8 });
  ctx.restore();
}

function gearOutline(ctx, x, y, r, teeth, depth, rot, out) {
  const ri = r - depth;
  const step = TAU / teeth;
  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a = rot + i * step;
    const pts = [
      [a - step * 0.5, ri],
      [a - step * 0.22, ri],
      [a - step * 0.14, r],
      [a + step * 0.14, r],
      [a + step * 0.22, ri],
    ];
    pts.forEach(([aa, rr], j) => {
      const px = x + Math.cos(aa) * rr;
      const py = y + Math.sin(aa) * rr;
      if (i === 0 && j === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
  }
  ctx.closePath();
  ctx.strokeStyle = INKC;
  ctx.lineWidth = out * 2;
  ctx.stroke();
}

// ---------------------------------------------------------------------------------------------
// Reusable glyph parts. Most take a local frame: draw at origin facing +x, then place via
// `at(ctx, x, y, rot, s, fn)`.

/** Run fn inside a translated/rotated/scaled frame. */
export function at(ctx, x, y, rot, s, fn) {
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (s !== 1) ctx.scale(s, s);
  fn(ctx);
  ctx.restore();
}

/** Iron cannonball with glint. */
export function cannonball(ctx, x, y, r, kind = 'iron') {
  body(ctx, P.circle(x, y, r), kind, { d: Math.max(1, r * 0.35), hi: Math.max(0.8, r * 0.18) });
  glint(ctx, x - r * 0.35, y - r * 0.38, r * 0.3);
}

/** Artillery shell / bullet, local frame: base at x=-len/2, nose at +len/2. */
export function shell(ctx, len, wid, o = {}) {
  const { kind = 'brass', tip = 'copper', band = 'red' } = o;
  const h = wid / 2;
  const x0 = -len / 2;
  const xs = len * 0.08; // start of ogive
  body(ctx, P.rect(x0, -h, xs - x0 + 1, wid, 1), kind, { d: 1.6, hi: 1.2 });
  body(
    ctx,
    P.custom((c) => {
      c.moveTo(xs, -h);
      c.quadraticCurveTo(len / 2 - len * 0.05, -h * 0.9, len / 2, 0);
      c.quadraticCurveTo(len / 2 - len * 0.05, h * 0.9, xs, h);
      c.closePath();
    }),
    tip,
    { d: 1.6, hi: 1.2 },
  );
  if (band) body(ctx, P.rect(xs - 2.2, -h - 0.4, 3, wid + 0.8, 0.6), band, { d: 0.8, hi: 0, out: 1.4 });
  body(ctx, P.rect(x0 - 1.2, -h - 1, 2.6, wid + 2, 0.8), kind, { d: 0.8, hi: 0, out: 1.6 });
}

/** Teardrop flame pointing -y, base at (x,y). size = height. */
export function flame(ctx, x, y, size, o = {}) {
  const { lean = 0, colors = R.fire, inner = true, seed = 3 } = o;
  const w = size * 0.42;
  const tipX = x + lean * size;
  const path = P.custom((c) => {
    c.moveTo(x, y);
    c.bezierCurveTo(x - w * 1.25, y - size * 0.05, x - w * 0.9, y - size * 0.55, tipX - w * 0.15, y - size * 0.72);
    c.quadraticCurveTo(tipX - w * 0.1, y - size * 0.9, tipX, y - size);
    c.quadraticCurveTo(x + w * 0.35, y - size * 0.62, x + w * 0.62, y - size * 0.58);
    c.bezierCurveTo(x + w * 0.9, y - size * 0.32, x + w * 1.2, y - size * 0.05, x, y);
    c.closePath();
  });
  void seed;
  glow(ctx, x, y - size * 0.4, size * 0.75, colors[1], 0.45);
  body(ctx, path, [colors[0], colors[1], colors[2]], { d: size * 0.08, hi: 0, out: OUT * 0.85 });
  if (inner) {
    const s = size * 0.55;
    const wi = w * 0.55;
    fill(
      ctx,
      P.custom((c) => {
        c.moveTo(x, y - size * 0.06);
        c.bezierCurveTo(x - wi, y - s * 0.1, x - wi * 0.6, y - s * 0.6, tipX * 0.3 + x * 0.7, y - s);
        c.bezierCurveTo(x + wi * 0.5, y - s * 0.55, x + wi, y - s * 0.1, x, y - size * 0.06);
        c.closePath();
      }),
      colors[0],
    );
  }
}

/** Zig-zag lightning bolt path through points, inked & glowing. */
export function bolt(ctx, pts, o = {}) {
  const { color = '#bff9ff', core = '#ffffff', w = 3.2, glowColor = '#7ff3ff' } = o;
  const path = P.custom((c) => pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))));
  for (const [x, y] of pts) glow(ctx, x, y, w * 2.6, glowColor, 0.25);
  line(ctx, path, color, w, { out: 1.6 });
  detail(ctx, path, core, w * 0.38);
}

/** Classic big lightning-bolt silhouette (filled), roughly within ±s. */
export function boltShape(ctx, x, y, s, ramp = 'gold', o = {}) {
  const path = P.xf(
    P.poly([
      [0.15, -1],
      [-0.5, 0.12],
      [-0.02, 0.12],
      [-0.2, 1],
      [0.52, -0.2],
      [0.06, -0.2],
      [0.38, -1],
    ]),
    x,
    y,
    o.rot || 0,
    s,
  );
  body(ctx, path, ramp, { d: 1.6, hi: 1.2, out: o.out ?? OUT });
}

/** Puffy cloud from overlapping circles. lobes: [[dx,dy,r]…] relative to (x,y). */
export function cloud(ctx, x, y, lobes, ramp = 'smoke', o = {}) {
  const path = P.custom((c) => {
    for (const [dx, dy, r] of lobes) {
      c.moveTo(x + dx + r, y + dy);
      c.arc(x + dx, y + dy, r, 0, TAU);
    }
  });
  // union outline: stroke all circles thick first, then fill all → only outer silhouette inks
  ctx.save();
  path(ctx);
  ctx.strokeStyle = INKC;
  ctx.lineWidth = (o.out ?? OUT) * 2;
  ctx.stroke();
  ctx.restore();
  body(ctx, path, ramp, { out: 0, d: o.d ?? 2.2, hi: 0 });
  // top-left puff highlights
  if (o.hi !== false) {
    const r = rampOf(ramp);
    for (const [dx, dy, rr] of lobes) {
      if (dy > (o.hiBelow ?? 1)) continue;
      fill(ctx, P.circle(x + dx - rr * 0.3, y + dy - rr * 0.32, rr * 0.42), r[0], 0.7);
    }
  }
}

/** Explosion / flak burst: layered jagged stars. */
export function explosion(ctx, x, y, r, o = {}) {
  const { seed = 5, n = 9, colors = ['#fff6c0', '#ffc338', '#ff6a1f'] } = o;
  glow(ctx, x, y, r * 1.5, colors[2], 0.55);
  body(ctx, P.burst(x, y, r, r * 0.55, n, seed), [colors[2], colors[2], colors[2]], {
    flat: true,
    out: o.out ?? OUT,
  });
  fill(ctx, P.burst(x, y, r * 0.72, r * 0.42, n, seed + 1), colors[1]);
  fill(ctx, P.burst(x, y, r * 0.42, r * 0.26, Math.max(5, n - 2), seed + 2), colors[0]);
}

/** Smoke puff trail: shrinking circles along a direction. */
export function puffs(ctx, x, y, dx, dy, n = 3, r0 = 3.5, ramp = 'smoke') {
  for (let i = n - 1; i >= 0; i--) {
    const k = i / Math.max(1, n - 1);
    const rr = r0 * (1 - k * 0.45);
    cloud(ctx, x + dx * i, y + dy * i, [[0, 0, rr]], ramp, { out: 1.4, d: rr * 0.35 });
  }
}

/** Motion/speed lines (short inked dashes) parallel to angle a. */
export function speedLines(ctx, x, y, a, lens, gap = 4, color = '#fff3c4') {
  const nx = -Math.sin(a);
  const ny = Math.cos(a);
  lens.forEach((L, i) => {
    const o = (i - (lens.length - 1) / 2) * gap;
    const sx = x + nx * o;
    const sy = y + ny * o;
    line(
      ctx,
      P.custom((c) => {
        c.moveTo(sx, sy);
        c.lineTo(sx - Math.cos(a) * L, sy - Math.sin(a) * L);
      }),
      color,
      1.6,
      { out: 1.1 },
    );
  });
}

/** Spoked wooden wheel (cannon carriages). */
export function wheel(ctx, x, y, r, kind = 'wood') {
  body(ctx, P.ring(x, y, r * 0.62, r), kind, { rule: 'evenodd', d: 1.4, hi: 1 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    line(
      ctx,
      P.custom((c) => {
        c.moveTo(x, y);
        c.lineTo(x + Math.cos(a) * r * 0.66, y + Math.sin(a) * r * 0.66);
      }),
      rampOf(kind)[1],
      1.4,
      { out: 0.7 },
    );
  }
  body(ctx, P.circle(x, y, r * 0.3), 'brass', { d: 0.8, hi: 0, out: 1.4 });
}

/** Cannon barrel in local frame: breech at x=0, muzzle at x=len. */
export function barrel(ctx, len, w0, w1, o = {}) {
  const { kind = 'brass', bands = [0.3, 0.62], bore = true, knob = true } = o;
  const h0 = w0 / 2;
  const h1 = w1 / 2;
  body(
    ctx,
    P.poly([
      [0, -h0],
      [len, -h1],
      [len, h1],
      [0, h0],
    ]),
    kind,
    { d: Math.max(1.2, w0 * 0.22), hi: 1.3 },
  );
  for (const t of bands) {
    const hh = h0 + (h1 - h0) * t + 0.9;
    body(ctx, P.rect(len * t - 1.3, -hh, 2.6, hh * 2, 0.6), kind, { d: 0.8, hi: 0, out: 1.4 });
  }
  // muzzle swell
  body(ctx, P.rect(len - 3, -h1 - 1.4, 3.6, w1 + 2.8, 1), kind, { d: 1, hi: 0.8, out: 1.8 });
  if (bore) fill(ctx, P.ellipse(len + 0.4, 0, 0.9, h1 * 0.62), INKC);
  if (knob) body(ctx, P.circle(-1.6, 0, h0 * 0.55), kind, { d: 0.8, hi: 0, out: 1.6 });
}

/** Hexagon path. */
export function hexPath(x, y, r, rot = Math.PI / 6) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = rot + (i / 6) * TAU;
    pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
  }
  return P.poly(pts);
}

/** Heater-shield path centred at (x,y), width w, height h. */
export function shieldPath(x, y, w, h) {
  return P.custom((c) => {
    const t = y - h / 2;
    c.moveTo(x - w / 2, t);
    c.quadraticCurveTo(x, t - h * 0.08, x + w / 2, t);
    c.lineTo(x + w / 2, t + h * 0.42);
    c.quadraticCurveTo(x + w * 0.42, t + h * 0.82, x, t + h);
    c.quadraticCurveTo(x - w * 0.42, t + h * 0.82, x - w / 2, t + h * 0.42);
    c.closePath();
  });
}

/** Small round naval mine with spikes (used by mines & devil's minefield). */
export function mine(ctx, x, y, r, o = {}) {
  const { kind = 'iron', spikes = 8, light = '#ff4d2e' } = o;
  for (let i = 0; i < spikes; i++) {
    const a = (i / spikes) * TAU + (o.rot || 0);
    const cx = Math.cos(a);
    const cy = Math.sin(a);
    body(
      ctx,
      P.poly([
        [x + cx * r * 0.8 - cy * r * 0.2, y + cy * r * 0.8 + cx * r * 0.2],
        [x + cx * (r + r * 0.42), y + cy * (r + r * 0.42)],
        [x + cx * r * 0.8 + cy * r * 0.2, y + cy * r * 0.8 - cx * r * 0.2],
      ]),
      kind,
      { d: 0.6, hi: 0, out: 1.5 },
    );
    fill(ctx, P.circle(x + cx * (r + r * 0.42), y + cy * (r + r * 0.42), r * 0.1), rampOf(kind)[0]);
  }
  body(ctx, P.circle(x, y, r), kind, { d: r * 0.3, hi: 1.2 });
  fill(ctx, P.ellipse(x, y, r * 0.98, r * 0.18), INKC, 0.35);
  if (light) {
    glow(ctx, x, y - r * 0.45, r * 0.9, light, 0.7);
    body(ctx, P.circle(x, y - r * 0.45, r * 0.2), [light, light, light], { flat: true, out: 1 });
  }
  glint(ctx, x - r * 0.42, y - r * 0.4, r * 0.24);
}

/** Wind-up clockwork drone (top view): disc body, rotor, wind-up key, eye. */
export function drone(ctx, x, y, s, o = {}) {
  const { kind = 'brass', eye = '#7ff3ff' } = o;
  at(ctx, x, y, 0, s, (c) => {
    // rotor blur
    fill(c, P.ellipse(0, -9.5, 9, 2.4), '#ffffff', 0.35);
    line(c, P.custom((p) => { p.moveTo(-8, -9.5); p.lineTo(8, -9.5); }), '#e8e2d0', 1.6, { out: 0.9 });
    line(c, P.custom((p) => { p.moveTo(0, -9.5); p.lineTo(0, -5); }), R.iron[1], 1.6, { out: 0.9 });
    // side guns
    body(c, P.rect(-11, -1.2, 4, 3, 0.8), 'iron', { d: 0.6, hi: 0, out: 1.4 });
    body(c, P.rect(7, -1.2, 4, 3, 0.8), 'iron', { d: 0.6, hi: 0, out: 1.4 });
    body(c, P.circle(0, 0, 7.5), kind, { d: 2, hi: 1.2 });
    fill(c, P.ellipse(0, 3.3, 6.6, 1.6), INKC, 0.25);
    // eye
    body(c, P.circle(0, 0.5, 3.4), 'iron', { d: 0.8, hi: 0, out: 1.4 });
    glow(c, 0, 0.5, 4.5, eye, 0.6);
    fill(c, P.circle(0, 0.5, 2), eye);
    fill(c, P.circle(-0.6, -0.1, 0.7), '#ffffff');
    // wind-up key
    line(c, P.custom((p) => { p.moveTo(0, 7); p.lineTo(0, 10.5); }), R.brass[1], 1.6, { out: 0.9 });
    body(c, P.custom((p) => {
      p.ellipse(-2.4, 12, 2.4, 1.6, 0, 0, TAU);
      p.moveTo(4.8, 12);
      p.ellipse(2.4, 12, 2.4, 1.6, 0, 0, TAU);
    }), kind, { d: 0.6, hi: 0, out: 1.4 });
  });
}

/** Sawblade disc. */
export function saw(ctx, x, y, r, o = {}) {
  const { teeth = 12, rot = 0, kind = 'steel', hub = 'brass' } = o;
  const path = P.custom((c) => {
    for (let i = 0; i < teeth; i++) {
      const a0 = rot + (i / teeth) * TAU;
      const a1 = rot + ((i + 0.62) / teeth) * TAU;
      const a2 = rot + ((i + 1) / teeth) * TAU;
      const p0 = [x + Math.cos(a0) * r * 0.78, y + Math.sin(a0) * r * 0.78];
      const p1 = [x + Math.cos(a1) * r, y + Math.sin(a1) * r];
      const p2 = [x + Math.cos(a2) * r * 0.78, y + Math.sin(a2) * r * 0.78];
      if (i === 0) c.moveTo(p0[0], p0[1]);
      c.lineTo(p1[0], p1[1]);
      c.lineTo(p2[0], p2[1]);
    }
    c.closePath();
  });
  body(ctx, path, kind, { d: Math.max(1, r * 0.12), hi: 1.1 });
  detail(ctx, P.circle(x, y, r * 0.58), rampOf(kind)[2], 1, 0.8);
  // radial cut slots
  for (let i = 0; i < 4; i++) {
    const a = rot + (i / 4) * TAU + 0.4;
    detail(
      ctx,
      P.custom((c) => {
        c.moveTo(x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.3);
        c.lineTo(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55);
      }),
      INKC,
      Math.max(0.8, r * 0.08),
      0.55,
    );
  }
  body(ctx, P.circle(x, y, r * 0.28), hub, { d: Math.max(0.6, r * 0.08), hi: 0, out: 1.6 });
  fill(ctx, P.circle(x, y, r * 0.09), INKC);
  glint(ctx, x - r * 0.4, y - r * 0.45, r * 0.22);
}

/** Rocket in local frame pointing +x, centred at origin. */
export function rocket(ctx, len, wid, o = {}) {
  const { kind = 'brass', nose = 'red', flameOn = true, flameScale = 1 } = o;
  const h = wid / 2;
  const x0 = -len / 2;
  if (flameOn) {
    at(ctx, x0 - 0.5, 0, Math.PI / 2, 1, (c) => flame(c, 0, 0, len * 0.55 * flameScale, { inner: true }));
  }
  // fins
  body(ctx, P.poly([[x0 + 1, -h], [x0 - 2.6, -h - 3.4], [x0 + 5, -h]]), 'red', { d: 0.6, hi: 0, out: 1.5 });
  body(ctx, P.poly([[x0 + 1, h], [x0 - 2.6, h + 3.4], [x0 + 5, h]]), 'red', { d: 0.6, hi: 0, out: 1.5 });
  body(ctx, P.rect(x0, -h, len * 0.68, wid, 1), kind, { d: Math.max(1, wid * 0.25), hi: 1 });
  body(
    ctx,
    P.custom((c) => {
      const xs = x0 + len * 0.66;
      c.moveTo(xs, -h);
      c.quadraticCurveTo(len / 2 - 1, -h, len / 2, 0);
      c.quadraticCurveTo(len / 2 - 1, h, xs, h);
      c.closePath();
    }),
    nose,
    { d: 1, hi: 0.8 },
  );
}

/** Horseshoe magnet (opening downward by default) in local frame centred on origin. */
export function horseshoe(ctx, s, o = {}) {
  const { ramp = 'red', tips = 'steel' } = o;
  const ro = 11 * s;
  const ri = 5 * s;
  const leg = 9 * s;
  const path = P.custom((c) => {
    c.moveTo(-ro, leg * 0.2);
    c.arc(0, 0, ro, Math.PI, 0);
    c.lineTo(ro, leg);
    c.lineTo(ri, leg);
    c.lineTo(ri, 0);
    c.arc(0, 0, ri, 0, Math.PI, true);
    c.lineTo(-ri, leg);
    c.lineTo(-ro, leg);
    c.closePath();
  });
  body(ctx, path, ramp, { d: 2, hi: 1.4 });
  body(ctx, P.rect(-ro, leg - 0.2, ro - ri, 5 * s, 0.6), tips, { d: 1, hi: 0.8 });
  body(ctx, P.rect(ri, leg - 0.2, ro - ri, 5 * s, 0.6), tips, { d: 1, hi: 0.8 });
}

/** Wrench in local frame along +x, length L. */
export function wrench(ctx, L, o = {}) {
  const { kind = 'steel', w = 4.2 } = o;
  const hr = w * 1.25;
  const path = P.custom((c) => {
    c.moveTo(-L / 2 + hr * 0.7, -w / 2);
    c.lineTo(L / 2 - hr * 0.7, -w / 2);
    // open jaw head at +x
    c.arc(L / 2, 0, hr, Math.PI * 1.15, Math.PI * 1.72);
    c.lineTo(L / 2 + hr * 0.25, -hr * 0.4);
    c.lineTo(L / 2 + hr * 0.25, hr * 0.4);
    c.lineTo(L / 2 + Math.cos(Math.PI * 0.28) * hr, Math.sin(Math.PI * 0.28) * hr);
    c.arc(L / 2, 0, hr, Math.PI * 0.28, Math.PI * 0.85);
    c.lineTo(-L / 2 + hr * 0.7, w / 2);
    // ring head at -x
    c.arc(-L / 2, 0, hr, Math.PI * 0.15, Math.PI * 1.85);
    c.closePath();
    c.moveTo(-L / 2 + hr * 0.45, 0);
    c.arc(-L / 2, 0, hr * 0.45, 0, TAU, true);
  });
  body(ctx, path, kind, { d: 1.4, hi: 1.1, rule: 'evenodd' });
}

/** Hammer in local frame: handle along +x from origin, head at x=L. */
export function hammer(ctx, L, o = {}) {
  const { head = 'iron', handle = 'wood' } = o;
  body(ctx, P.rect(-L / 2, -1.9, L, 3.8, 1.6), handle, { d: 1, hi: 0.9 });
  body(ctx, P.rect(-L / 2 - 1, -2.4, 4, 4.8, 0.8), 'brass', { d: 0.6, hi: 0, out: 1.4 });
  body(
    ctx,
    P.poly([
      [L / 2 - 4, -8],
      [L / 2 + 4, -7],
      [L / 2 + 4, 7],
      [L / 2 - 4, 8],
    ]),
    head,
    { d: 1.6, hi: 1.1 },
  );
}

/** Four-leaf clover centred at (x,y). */
export function clover(ctx, x, y, s, ramp = 'green') {
  const leaf = (a) =>
    P.xf(
      P.custom((c) => {
        c.moveTo(0, 0);
        c.bezierCurveTo(-5, -2, -6, -8, -2.6, -9);
        c.quadraticCurveTo(0, -9.4, 0, -7);
        c.quadraticCurveTo(0, -9.4, 2.6, -9);
        c.bezierCurveTo(6, -8, 5, -2, 0, 0);
        c.closePath();
      }),
      x,
      y,
      a,
      s,
    );
  line(ctx, P.custom((c) => { c.moveTo(x, y); c.quadraticCurveTo(x + 2 * s, y + 6 * s, x + 6 * s, y + 9 * s); }), rampOf(ramp)[2], 1.8 * s, { out: 1 });
  for (let i = 0; i < 4; i++) body(ctx, leaf(Math.PI / 4 + (i * Math.PI) / 2), ramp, { d: 1.1, hi: 0.9, out: 1.6 });
  fill(ctx, P.circle(x, y, 1.3 * s), rampOf(ramp)[2]);
}

/** Pocket-watch / clock face. */
export function watch(ctx, x, y, r, o = {}) {
  const { kind = 'brass', face = '#fff6dc', h1 = -0.9, h2 = 0.6, crown = true } = o;
  if (crown) {
    body(ctx, P.rect(x - 2.4, y - r - 4.6, 4.8, 4, 1), kind, { d: 0.8, hi: 0, out: 1.6 });
    body(ctx, P.ring(x, y - r - 6.4, 1.4, 3.2), kind, { rule: 'evenodd', d: 0.6, hi: 0, out: 1.4 });
  }
  body(ctx, P.circle(x, y, r), kind, { d: 1.8, hi: 1.3 });
  body(ctx, P.circle(x, y, r * 0.78), [face, face, '#d9c9a0'], { d: 1.2, hi: 0, out: 1.4 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const r0 = i % 3 ? r * 0.64 : r * 0.56;
    detail(
      ctx,
      P.custom((c) => {
        c.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
        c.lineTo(x + Math.cos(a) * r * 0.72, y + Math.sin(a) * r * 0.72);
      }),
      '#3a2a18',
      i % 3 ? 0.8 : 1.4,
    );
  }
  const hand = (a, len, w) =>
    detail(
      ctx,
      P.custom((c) => {
        c.moveTo(x, y);
        c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      }),
      '#2b1d10',
      w,
    );
  hand(h1 * Math.PI - Math.PI / 2, r * 0.42, 2);
  hand(h2 * Math.PI - Math.PI / 2, r * 0.6, 1.4);
  fill(ctx, P.circle(x, y, 1.4), '#8c2f2b');
  // crystal glint
  detail(ctx, P.custom((c) => c.arc(x, y, r * 0.66, Math.PI * 1.1, Math.PI * 1.45)), '#ffffff', 1.2, 0.8);
}

/** Pressure gauge dial (bold version for icons). value 0..1 */
export function dial(ctx, x, y, r, value = 0.8, kind = 'brass') {
  body(ctx, P.circle(x, y, r), kind, { d: 1.8, hi: 1.3 });
  body(ctx, P.circle(x, y, r * 0.76), ['#fffaf0', '#fbf1d8', '#d9c9a0'], { d: 1, hi: 0, out: 1.4 });
  const a0 = Math.PI * 0.75;
  const a1 = Math.PI * 2.25;
  detail(ctx, P.custom((c) => c.arc(x, y, r * 0.58, a0 + (a1 - a0) * 0.72, a1)), '#c0392b', r * 0.16);
  for (let i = 0; i <= 6; i++) {
    const a = a0 + ((a1 - a0) * i) / 6;
    detail(
      ctx,
      P.custom((c) => {
        c.moveTo(x + Math.cos(a) * r * 0.46, y + Math.sin(a) * r * 0.46);
        c.lineTo(x + Math.cos(a) * r * 0.66, y + Math.sin(a) * r * 0.66);
      }),
      '#2b1d10',
      Math.max(0.8, r * 0.08),
    );
  }
  const na = a0 + (a1 - a0) * value;
  line(
    ctx,
    P.custom((c) => {
      c.moveTo(x - Math.cos(na) * r * 0.14, y - Math.sin(na) * r * 0.14);
      c.lineTo(x + Math.cos(na) * r * 0.64, y + Math.sin(na) * r * 0.64);
    }),
    '#c0392b',
    Math.max(1.2, r * 0.12),
    { out: 0.8 },
  );
  fill(ctx, P.circle(x, y, r * 0.13), '#2b1d10');
  detail(ctx, P.custom((c) => c.arc(x, y, r * 0.66, Math.PI * 1.1, Math.PI * 1.5)), '#ffffff', r * 0.08, 0.7);
}

/** Bold airship side silhouette (envelope + gondola + fin + prop), facing +x, centred. */
export function airship(ctx, x, y, s, o = {}) {
  const { env = 'canvas', trim = 'oxblood', gondola = 'brass', prop = true } = o;
  at(ctx, x, y, o.rot || 0, s, (c) => {
    // tail fins
    body(c, P.poly([[-13, -2], [-19, -9], [-15, -9], [-8, -3]]), trim, { d: 0.8, hi: 0, out: 1.6 });
    body(c, P.poly([[-13, 2], [-19, 9], [-15, 9], [-8, 3]]), trim, { d: 0.8, hi: 0, out: 1.6 });
    // rigging
    detail(c, P.custom((p) => { p.moveTo(-5, 4); p.lineTo(-3, 9); p.moveTo(5, 4); p.lineTo(3, 9); }), INKC, 1);
    // gondola
    body(c, P.custom((p) => {
      p.moveTo(-7, 8.5);
      p.lineTo(7, 8.5);
      p.quadraticCurveTo(6, 13, 0, 13);
      p.quadraticCurveTo(-6, 13, -7, 8.5);
      p.closePath();
    }), gondola, { d: 1, hi: 0.8, out: 1.8 });
    fill(c, P.circle(-3, 10.6, 0.9), '#2b1d10');
    fill(c, P.circle(0.5, 10.6, 0.9), '#2b1d10');
    fill(c, P.circle(4, 10.6, 0.9), '#2b1d10');
    // envelope
    body(c, P.ellipse(0, 0, 16, 7), env, { d: 2, hi: 1.4 });
    detail(c, P.custom((p) => { p.moveTo(-15, 0.5); p.quadraticCurveTo(0, 2.6, 15, 0.5); }), rampOf(trim)[1], 2.2);
    for (const k of [-8, 0, 8]) {
      detail(c, P.custom((p) => { p.moveTo(k, -6.6); p.quadraticCurveTo(k + 1.5, 0, k, 6.6); }), rampOf(env)[2], 0.8);
    }
    if (prop) {
      body(c, P.rect(-21, -1, 4, 2, 0.6), 'iron', { d: 0.4, hi: 0, out: 1.2 });
      body(c, P.ellipse(-22, 0, 1.6, 5.5), 'brass', { d: 0.6, hi: 0, out: 1.4 });
    }
  });
}

/** Five-point star medal glyph helper. */
export function bigStar(ctx, x, y, r, ramp = 'gold') {
  body(ctx, P.star(x, y, r, r * 0.46, 5), ramp, { d: r * 0.12, hi: 1.2 });
  detail(ctx, P.star(x, y, r * 0.55, r * 0.26, 5), rampOf(ramp)[0], 1, 0.6);
}
