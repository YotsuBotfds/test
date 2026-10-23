// Drawkit parts: fasteners, machinery and fittings (rivets, gears, props, pipes, cannons,
// stacks, gauges, nacelles, turret rings…). Re-exported by ../drawkit.js — import from there.

import { PAL } from '../../config.js';
import {
  TAU,
  INK,
  mix,
  lighten,
  darken,
  alpha,
  seeded,
  METALS,
  ramp,
  metal,
  metalRadial,
  cylinderGrad,
  roundRect,
  polygon,
  smoothPath,
  ink,
  shadeOverlay,
  rimLight,
  glow,
  glowEllipse,
} from './core.js';

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
  for (let i = a; i <= n - a; i++)
    rivet(ctx, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, r, kind);
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
  gearPath(ctx, x, y, r, teeth, toothDepth, rotation, hole);
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
    ctx.bezierCurveTo(
      r * 0.45,
      -r * width * 1.15,
      r * 0.88,
      -r * width * 0.9,
      r * 0.97,
      -r * width * 0.15
    );
    ctx.quadraticCurveTo(r * 1.0, r * width * 0.2, r * 0.86, r * width * 0.35);
    ctx.bezierCurveTo(
      r * 0.6,
      r * width * 0.55,
      r * 0.3,
      r * width * 0.4,
      r * 0.12,
      r * width * 0.35
    );
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
  const {
    color = lit ? '#ffcf6a' : '#3a5a6e',
    kind = 'brass',
    bolts = r >= 2.5 ? 6 : 0,
    halo = 2.4,
  } = opts;
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
    ctx.arc(
      x + Math.cos(a) * r * 0.84,
      y + Math.sin(a) * r * 0.84,
      Math.max(0.25, r * 0.08),
      0,
      TAU
    );
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
  const {
    rivets = 0,
    rivetR = 0.75,
    rivetKind = kind,
    inset = 1.6,
    ink: iw = 1,
    polish = false,
    bevel = 0.9,
  } = opts;
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
  const {
    a = '#211a12',
    b = '#e8b923',
    stripe = 3,
    angle = Math.PI / 4,
    usePath = false,
    ink: iw = 0.8,
  } = opts;
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
  const {
    rivets = 4,
    rivetR = Math.min(0.85, width * 0.16),
    curved = false,
    rows = 2,
    ink: iw = 0.9,
  } = opts;
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
    for (const yy of ys)
      rivetLine(ctx, rivets * 0.5, yy, len - rivets * 0.5, yy, rivets, rivetR, kind);
  }
  ctx.restore();
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
  const {
    kind = 'brass',
    band = null,
    nose = 'copper',
    exhaust = true,
    glow: hot = '#ff9a3c',
  } = opts;
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
  rivetLine(
    ctx,
    x0 + len * 0.36,
    y - wid * 0.3,
    x0 + len * 0.36,
    y + wid * 0.3,
    wid * 0.3,
    Math.max(0.3, wid * 0.07),
    kind
  );
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
