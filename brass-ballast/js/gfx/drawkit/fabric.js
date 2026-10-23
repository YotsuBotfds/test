// Drawkit fabric & rigging: gasbag envelopes (with per-pixel baked lighting), balloons, flags,
// fins, stitching, patches, rope, chain. Re-exported by ../drawkit.js — import from there.

import { PAL } from '../../config.js';
import {
  TAU,
  seeded,
  ramp,
  metalRadial,
  roundRect,
  polygon,
  ink,
  shadeOverlay,
  scratchCanvas,
} from './core.js';
import { rivetLine } from './parts.js';

/**
 * Soft contact shadow ("ambient occlusion") around a shape, applied ONLY to pixels already drawn
 * (source-atop), so it darkens what lies beneath/next to the shape but never paints a drop shadow
 * onto empty space. Call before drawing the shape itself.
 * @param {CanvasRenderingContext2D} ctx
 * @param {() => void} pathFn builds the shape's outline path
 * @param {number} [strength] 0..1
 * @param {number} [spread] width of the darkened band in units
 */
export function ambientOcclusion(ctx, pathFn, strength = 0.4, spread = 3) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.lineJoin = 'round';
  for (let i = 3; i >= 1; i--) {
    pathFn();
    ctx.lineWidth = (spread * 2 * i) / 3;
    ctx.strokeStyle = `rgba(20,12,4,${((strength * 0.45) / 1).toFixed(3)})`;
    ctx.stroke();
  }
  ctx.restore();
}

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
 *   gloss: specular strength; decorate: drawn clipped to the bag before lighting (painted art);
 *   occlusion: soft contact darkening cast onto parts already drawn beneath the bag (gondola,
 *   fins, pylons) — only darkens existing pixels, never adds a shadow on empty space.
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
    occlusion = 0.4,
  } = opts;
  const geo = envelopeGeo(cx, cy, len, wid, opts);
  const L = len / 2;
  const W = wid / 2;
  if (occlusion > 0) ambientOcclusion(ctx, () => geo.path(ctx), occlusion, 3.2);
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
      canvasPatch(
        ctx,
        x + Math.cos(a) * d,
        y + Math.sin(a) * d,
        r * (0.22 + rnd() * 0.16),
        r * (0.18 + rnd() * 0.12),
        {
          color: colors[(i + 2) % colors.length],
          rot: rnd() * 1.2 - 0.6,
        }
      );
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

/**
 * Dashed stitching along a polyline (light thread with a dark needle-hole shadow).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number[][]} pts
 * @param {{dash?:number, gap?:number, width?:number, color?:string, closed?:boolean}} [opts]
 */
export function stitching(ctx, pts, opts = {}) {
  const {
    dash = 0.9,
    gap = 0.8,
    width = 0.4,
    color = 'rgba(255,248,230,0.75)',
    closed = false,
  } = opts;
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
  stitching(
    ctx,
    [
      [x0, y0],
      [x1, y1],
    ],
    opts
  );
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
    stitching(
      ctx,
      [
        [-w / 2 + i, -h / 2 + i],
        [w / 2 - i, -h / 2 + i],
        [w / 2 - i, h / 2 - i],
        [-w / 2 + i, h / 2 - i],
      ],
      {
        closed: true,
        dash: 0.6,
        gap: 0.55,
        width: 0.32,
      }
    );
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

/**
 * Waving pennant/flag hoisted at (x, y) (the pole end of the cloth's top edge).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {string[]} [colors] horizontal stripes top → bottom
 * @param {{wave?:number, swallow?:boolean, pennant?:boolean, dir?:number, emblem?:string}} [opts]
 *   dir: +1 (default) flies toward +x, -1 toward -x (streams behind a ship); emblem: colour of a
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
    for (let i = N; i >= 0; i--)
      ctx.lineTo(top[i][0], top[i][1] + ((bot[i][1] - top[i][1]) * (s + 1)) / n);
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

/**
 * Tail/stabiliser fin from a polygon, with spar lines from the root and a painted trailing edge.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number[][]} pts polygon; the first two points are treated as the root edge
 * @param {{fill?:string, edge?:string, spars?:number, kind?:string, ink?:number, rivets?:boolean}} [opts]
 *   edge: colour of a painted band along the outermost edge (pts[2]→pts[3])
 */
export function fin(ctx, pts, opts = {}) {
  const {
    fill = PAL.canvas[1],
    edge = null,
    spars = 3,
    kind = 'brass',
    ink: iw = 1,
    rivets = true,
  } = opts;
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
