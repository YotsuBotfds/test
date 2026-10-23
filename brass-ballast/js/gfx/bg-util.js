// Shared helpers for the procedural backdrop (WP6): offscreen canvases, integer hashing,
// sampled noise fields with marching-squares contours, color math and soft sprites.
// Everything here is deterministic so ground tiles are seamless for any camera position.

import { RNG } from '../core/rng.js';
import { clamp01 } from '../core/math.js';

/** Ground tile size in ground units (DESIGN §4.16). */
export const TILE = 512;

/**
 * Create an offscreen canvas (OffscreenCanvas when available, else a detached DOM canvas).
 * @param {number} w
 * @param {number} h
 */
export function makeCanvas(w, h) {
  w = Math.max(1, Math.ceil(w));
  h = Math.max(1, Math.ceil(h));
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      const c = new OffscreenCanvas(w, h);
      if (c.getContext('2d')) return c;
    } catch {
      /* fall through to DOM canvas */
    }
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// ---------------------------------------------------------------------------------------------
// Hashing

/** 32-bit integer hash of (x, y, salt). */
export function hashInt(x, y, salt = 0) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Deterministic float in [0,1) for (x, y, salt). */
export function rand01(x, y, salt = 0) {
  return hashInt(x, y, salt) / 4294967296;
}

/** Seeded RNG for a grid cell; use for every per-feature random choice. */
export function cellRng(cx, cy, salt = 0) {
  return new RNG(hashInt(cx, cy, salt) || 1);
}

/**
 * Visit every grid cell of size `size` whose area may touch the tile [X0, X0+TILE) grown by
 * `margin` ground units.
 * @param {(cx:number, cy:number)=>void} fn
 */
export function forCells(X0, Y0, size, margin, fn) {
  const c0 = Math.floor((X0 - margin) / size);
  const c1 = Math.floor((X0 + TILE + margin) / size);
  const r0 = Math.floor((Y0 - margin) / size);
  const r1 = Math.floor((Y0 + TILE + margin) / size);
  for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) fn(cx, cy);
}

/** True when the box (x, y, ±r) touches the tile grown by `pad`. */
export function touchesTile(X0, Y0, x, y, r, pad = 0) {
  return x + r > X0 - pad && x - r < X0 + TILE + pad && y + r > Y0 - pad && y - r < Y0 + TILE + pad;
}

// ---------------------------------------------------------------------------------------------
// Fast value noise (local copy of the math.js idea, tuned for many samples per tile)

function h2(x, y, s) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0,1). */
export function vnoise(x, y, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let u = x - xi;
  let v = y - yi;
  u = u * u * (3 - 2 * u);
  v = v * v * (3 - 2 * v);
  const a = h2(xi, yi, seed);
  const b = h2(xi + 1, yi, seed);
  const c = h2(xi, yi + 1, seed);
  const d = h2(xi + 1, yi + 1, seed);
  const top = a + (b - a) * u;
  return top + (c + (d - c) * u - top) * v;
}

/** Fractal value noise, normalized to ~[0,1). */
export function fnoise(x, y, octaves = 4, seed = 0) {
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += vnoise(x, y, seed + i * 31) * amp;
    norm += amp;
    amp *= 0.5;
    // Rotate-ish & scale between octaves to hide the lattice.
    const nx = x * 1.62 + y * 1.18;
    y = y * 1.62 - x * 1.18;
    x = nx + 17.3;
  }
  return sum / norm;
}

/** Ridged fractal noise (sharp crests) in ~[0,1). */
export function ridged(x, y, octaves = 5, seed = 0) {
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  let weight = 1;
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(vnoise(x, y, seed + i * 41) * 2 - 1);
    n *= n * weight;
    weight = clamp01(n * 1.6);
    sum += n * amp;
    norm += amp;
    amp *= 0.5;
    const nx = x * 1.75 + y * 1.05;
    y = y * 1.75 - x * 1.05;
    x = nx + 9.1;
  }
  return sum / norm;
}

// ---------------------------------------------------------------------------------------------
// Sampled fields

/**
 * @typedef {object} Field
 * @property {number} n       samples per side
 * @property {number} cell    spacing in ground units
 * @property {number} x0      ground x of sample (0,0)
 * @property {number} y0
 * @property {Float32Array} data
 */

/**
 * Sample `fn(x, y)` on a regular grid covering the tile plus `margin` cells on every side.
 * Samples at shared tile edges hit identical coordinates, so neighbours match exactly.
 * @returns {Field}
 */
export function sampleField(X0, Y0, cell, margin, fn) {
  const n = Math.round(TILE / cell) + 1 + margin * 2;
  const data = new Float32Array(n * n);
  const x0 = X0 - margin * cell;
  const y0 = Y0 - margin * cell;
  let k = 0;
  for (let j = 0; j < n; j++) {
    const y = y0 + j * cell;
    for (let i = 0; i < n; i++) data[k++] = fn(x0 + i * cell, y);
  }
  return { n, cell, x0, y0, data };
}

/** Bilinear lookup into a field at ground coords (clamped to the field). */
export function fieldAt(f, x, y) {
  let fx = (x - f.x0) / f.cell;
  let fy = (y - f.y0) / f.cell;
  fx = fx < 0 ? 0 : fx > f.n - 1.001 ? f.n - 1.001 : fx;
  fy = fy < 0 ? 0 : fy > f.n - 1.001 ? f.n - 1.001 : fy;
  const i = fx | 0;
  const j = fy | 0;
  const u = fx - i;
  const v = fy - j;
  const d = f.data;
  const k = j * f.n + i;
  const top = d[k] + (d[k + 1] - d[k]) * u;
  const bot = d[k + f.n] + (d[k + f.n + 1] - d[k + f.n]) * u;
  return top + (bot - top) * v;
}

const scratch = new Map();
function scratchCanvas(n) {
  let s = scratch.get(n);
  if (!s) {
    const c = makeCanvas(n, n);
    const ctx = c.getContext('2d');
    s = { c, ctx, img: ctx.createImageData(n, n) };
    scratch.set(n, s);
  }
  return s;
}

/**
 * Colorize a field per sample and draw it (bilinear-upscaled) into a tile context that uses
 * ground coordinates. `shade(k, i, j, px, p)` writes RGBA bytes into `px[p..p+3]` for sample
 * index `k`; read neighbours from your fields for hillshading.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Field} f
 * @param {(k:number, i:number, j:number, px:Uint8ClampedArray, p:number)=>void} shade
 */
export function blitField(ctx, f, shade) {
  const s = scratchCanvas(f.n);
  const px = s.img.data;
  const n = f.n;
  let p = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      shade(j * n + i, i, j, px, p);
      p += 4;
    }
  }
  s.ctx.putImageData(s.img, 0, 0);
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(s.c, f.x0 - f.cell / 2, f.y0 - f.cell / 2, n * f.cell, n * f.cell);
  ctx.imageSmoothingEnabled = prev;
}

// Marching squares segment table: corner bits a=1 (top-left), b=2, c=4 (bottom-right), d=8;
// edges 0 top, 1 right, 2 bottom, 3 left.
const SEG = [
  [], [0, 3], [0, 1], [1, 3], [1, 2], [0, 1, 2, 3], [0, 2], [2, 3],
  [2, 3], [0, 2], [0, 3, 1, 2], [1, 2], [1, 3], [0, 1], [0, 3], [],
];

/**
 * Append iso-line segments of `f` at `level` to the current path of `ctx` (call beginPath
 * first, stroke after). Segments are emitted per cell; round caps hide the joins.
 */
export function contour(ctx, f, level) {
  const n = f.n;
  const d = f.data;
  const c = f.cell;
  const ex = [0, 0, 0, 0];
  const ey = [0, 0, 0, 0];
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const k = j * n + i;
      const va = d[k];
      const vb = d[k + 1];
      const vc = d[k + n + 1];
      const vd = d[k + n];
      const idx = (va > level ? 1 : 0) | (vb > level ? 2 : 0) | (vc > level ? 4 : 0) | (vd > level ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const seg = SEG[idx];
      const x = f.x0 + i * c;
      const y = f.y0 + j * c;
      for (let s = 0; s < seg.length; s++) {
        const e = seg[s];
        if (e === 0) {
          ex[0] = x + ((level - va) / (vb - va)) * c;
          ey[0] = y;
        } else if (e === 1) {
          ex[1] = x + c;
          ey[1] = y + ((level - vb) / (vc - vb)) * c;
        } else if (e === 2) {
          ex[2] = x + ((level - vd) / (vc - vd)) * c;
          ey[2] = y + c;
        } else {
          ex[3] = x;
          ey[3] = y + ((level - va) / (vd - va)) * c;
        }
      }
      for (let s = 0; s < seg.length; s += 2) {
        ctx.moveTo(ex[seg[s]], ey[seg[s]]);
        ctx.lineTo(ex[seg[s + 1]], ey[seg[s + 1]]);
      }
    }
  }
}

/** Stroke a contour in one call. */
export function strokeContour(ctx, f, level, color, width, alpha = 1) {
  ctx.beginPath();
  contour(ctx, f, level);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------------------------
// Color

const rgbCache = new Map();
/** '#rrggbb' → [r, g, b] (cached). */
export function rgb(hex) {
  let c = rgbCache.get(hex);
  if (!c) {
    const h = hex.replace('#', '');
    const v = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
    c = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    rgbCache.set(hex, c);
  }
  return c;
}

/** CSS rgba() string from hex + alpha. */
export function rgba(hex, a) {
  const c = rgb(hex);
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

/** Mix two hex colors → hex. */
export function mixHex(a, b, t) {
  const A = rgb(a);
  const B = rgb(b);
  const r = Math.round(A[0] + (B[0] - A[0]) * t);
  const g = Math.round(A[1] + (B[1] - A[1]) * t);
  const bl = Math.round(A[2] + (B[2] - A[2]) * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

/** Write a mix of two rgb triplets into px[p..p+3]. */
export function putMix(px, p, A, B, t, alpha = 255) {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  px[p] = A[0] + (B[0] - A[0]) * t;
  px[p + 1] = A[1] + (B[1] - A[1]) * t;
  px[p + 2] = A[2] + (B[2] - A[2]) * t;
  px[p + 3] = alpha;
}

/** Sample a gradient of rgb stops ([[t, rgb], ...] sorted) into px. */
export function putRamp(px, p, stops, t, alpha = 255) {
  if (t <= stops[0][0]) return putMix(px, p, stops[0][1], stops[0][1], 0, alpha);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const a = stops[i - 1];
      const b = stops[i];
      return putMix(px, p, a[1], b[1], (t - a[0]) / (b[0] - a[0]), alpha);
    }
  }
  const l = stops[stops.length - 1][1];
  return putMix(px, p, l, l, 0, alpha);
}

/** Build a ramp from [[t, '#hex'], ...]. */
export function ramp(stops) {
  return stops.map(([t, c]) => [t, rgb(c)]);
}

// ---------------------------------------------------------------------------------------------
// Soft sprites (cached)

const spriteCache = new Map();

/**
 * Radial soft dot sprite, `size` px square. `stops` = [[t, alpha], ...] along the radius.
 * @returns {HTMLCanvasElement|OffscreenCanvas}
 */
export function softDot(size, color, stops = [[0, 1], [0.35, 0.6], [1, 0]]) {
  const key = `dot|${size}|${color}|${stops.join(';')}`;
  let c = spriteCache.get(key);
  if (c) return c;
  c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  for (const [t, a] of stops) g.addColorStop(t, rgba(color, a));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  spriteCache.set(key, c);
  return c;
}

/** Cache an arbitrary sprite by key. */
export function cachedSprite(key, w, h, draw) {
  let c = spriteCache.get(key);
  if (c) return c;
  c = makeCanvas(w, h);
  draw(c.getContext('2d'), w, h);
  spriteCache.set(key, c);
  return c;
}

/** Tileable speckle grain (256²), used as a pattern for ground texture. */
export function grainCanvas(seed = 7) {
  return cachedSprite(`grain|${seed}`, 256, 256, (ctx) => {
    const img = ctx.createImageData(256, 256);
    const px = img.data;
    const r = new RNG(seed);
    for (let p = 0; p < px.length; p += 4) {
      const v = r.next();
      const dark = v < 0.5;
      px[p] = px[p + 1] = px[p + 2] = dark ? 0 : 255;
      px[p + 3] = Math.abs(v - 0.5) * 2 * 90 * r.next();
    }
    ctx.putImageData(img, 0, 0);
  });
}

// ---------------------------------------------------------------------------------------------
// Animated anchors: painters record spots (chimneys, sea glints, lit windows…) that the
// background animates every frame. Only anchors inside the tile proper are kept, so features
// that straddle a seam are registered exactly once.

/** Anchor type codes (see bg-anim.js for how each is drawn). */
export const A = {
  GLINT: 0, // sea sparkle (size = scale)
  SMOKE: 1, // chimney smoke column (size = puff scale, seed picks tint: <0.5 grey, else dark)
  WINDOW: 2, // warm lit window twinkle
  LAVA: 3, // molten river glow pulse
  POOL: 4, // slag pool pulse
  CAP: 5, // storm whitecap shimmer
  BEACON: 6, // lighthouse sweeping beam
  MILL: 7, // windmill sails turning
  FURNACE: 8, // foundry mouth flicker
  EMBERSMOKE: 9, // ember-lit dark smoke (furnace stacks)
  STEAM: 10, // white steam plume (aurora/brassbay village chimneys, harbor steamers)
};

export class Anchors {
  constructor(X0, Y0) {
    this.X0 = X0;
    this.Y0 = Y0;
    this.list = [];
  }
  /** Record an animated spot at ground (x, y). */
  add(type, x, y, size = 1, seed = 0) {
    if (x < this.X0 || y < this.Y0 || x >= this.X0 + TILE || y >= this.Y0 + TILE) return;
    this.list.push(type, x, y, size, seed);
  }
  /** Packed [type, x, y, size, seed]* array. */
  finish() {
    return new Float32Array(this.list);
  }
}
