// Cloud layers (WP6): pre-rendered soft cumulus variants tinted per biome, placed on a hashed
// grid in layer space so they are stable for any camera position, drifting with the breeze.
// Low clouds (parallax 0.65) cast soft shadows on the ground; high clouds (1.35) sit above the
// action and fade out around the focus point so the player is never hidden.

import { makeCanvas, rand01, hashInt, rgba } from './bg-util.js';
import { RNG } from '../core/rng.js';

const VARIANTS = 8;
const CW = 440; // sprite size in layer units (1 px per unit)
const CH = 300;

const spriteCache = new Map(); // `${biome}|${variant}` → canvas
const shadowCache = new Map(); // variant → canvas

/** Puff layout for a variant (deterministic): a dense cauliflower mass plus rim wisps. */
function puffs(variant) {
  const r = new RNG(9001 + variant * 7919);
  const out = [];
  const elong = r.range(0.8, 1.3);
  // Core: overlapping big puffs along a gently curved spine.
  const spine = r.int(3, 5);
  const bend = r.range(-0.25, 0.25);
  for (let s = 0; s < spine; s++) {
    const u = spine === 1 ? 0 : s / (spine - 1) - 0.5;
    const x = CW / 2 + u * CW * 0.56 * elong;
    const y = CH / 2 + (u * u - 0.08) * CH * bend * 2 + r.range(-8, 8);
    const R = (1 - Math.abs(u) * 0.75) * r.range(72, 88);
    out.push([x, y, R, 1]);
    // Cauliflower bumps around each spine puff, denser on top (they billow upward).
    const bumps = r.int(5, 8);
    for (let b = 0; b < bumps; b++) {
      const a = r.range(Math.PI * 0.85, Math.PI * 2.15);
      const d = R * r.range(0.4, 0.7);
      out.push([x + Math.cos(a) * d * 1.15, y + Math.sin(a) * d * 0.75, R * r.range(0.5, 0.72), 1]);
    }
  }
  // Wisps along the rim (lighter).
  for (let i = 0; i < 9; i++) {
    const a = r.angle();
    out.push([
      CW / 2 + Math.cos(a) * CW * 0.3 * elong * r.range(0.6, 0.95),
      CH / 2 + Math.sin(a) * CH * 0.22 * r.range(0.6, 0.95),
      r.range(24, 40),
      0.45,
    ]);
  }
  return out;
}
const layouts = Array.from({ length: VARIANTS }, (_, i) => puffs(i));

function blob(ctx, x, y, rad, color, a, core = 0.5) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(core, rgba(color, a * 0.8));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
}

/** Tinted cumulus sprite for a biome: soft silhouette, directional light, puff relief. */
export function cloudSprite(biome, variant) {
  const key = `${biome.id}|${variant}`;
  let c = spriteCache.get(key);
  if (c) return c;
  c = makeCanvas(CW, CH);
  const ctx = c.getContext('2d');
  const P = layouts[variant];
  const { hi, mid, lo } = biome.cloud;
  // 1. Silhouette (alpha mass).
  for (const [x, y, r, w] of P) blob(ctx, x, y, r, '#ffffff', 0.85 * w, 0.62);
  // 2. Color it with a top-left → bottom-right light ramp.
  ctx.globalCompositeOperation = 'source-in';
  const g = ctx.createLinearGradient(CW * 0.2, CH * 0.05, CW * 0.75, CH * 0.95);
  g.addColorStop(0, hi);
  g.addColorStop(0.45, mid);
  g.addColorStop(1, lo);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CW, CH);
  // 3. Relief: each puff gets a shaded lower-right belly and a lit upper-left cap.
  ctx.globalCompositeOperation = 'source-atop';
  for (const [x, y, r] of P) blob(ctx, x + r * 0.3, y + r * 0.36, r * 0.8, lo, 0.22);
  for (const [x, y, r] of P) blob(ctx, x - r * 0.2, y - r * 0.28, r * 0.66, hi, 0.4);
  for (const [x, y, r] of P) {
    if (r > 40) blob(ctx, x - r * 0.34, y - r * 0.42, r * 0.34, hi, 0.3);
  }
  ctx.globalCompositeOperation = 'source-over';
  spriteCache.set(key, c);
  return c;
}

/** Soft dark silhouette for cloud shadows (half resolution, it is blurry anyway). */
export function shadowSprite(variant) {
  let c = shadowCache.get(variant);
  if (c) return c;
  c = makeCanvas(CW / 2, CH / 2);
  const ctx = c.getContext('2d');
  ctx.scale(0.5, 0.5);
  for (const [x, y, r, w] of layouts[variant]) blob(ctx, x, y, r * 1.1, '#000000', 0.5 * w);
  shadowCache.set(variant, c);
  return c;
}

/** Render all variants for a biome now (avoids a hitch on first sight). */
export function prewarmClouds(biome) {
  for (let v = 0; v < VARIANTS; v++) {
    cloudSprite(biome, v);
    shadowSprite(v);
  }
}

/**
 * @typedef {object} LayerSpec
 * @property {number} parallax
 * @property {number} scale      sprite scale multiplier vs zoom
 * @property {number} cell       grid cell (layer units)
 * @property {number} salt
 * @property {number} coverage   0..1 chance per cell
 * @property {number} alpha
 * @property {number} drift      u/s
 */

/** Low (behind the action) and high (in front) layers. */
export const LOW = { parallax: 0.65, scale: 0.82, cell: 560, salt: 77 };
export const HIGH = { parallax: 1.35, scale: 1.45, cell: 980, salt: 191 };

/**
 * Draw a cloud layer in device pixels (caller resets the transform to identity).
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} o
 * @param {import('./biomes.js').Biome} o.biome
 * @param {{parallax:number, scale:number, cell:number, salt:number}} o.layer
 * @param {{x:number,y:number,zoom:number,shakeX:number,shakeY:number}} o.cam
 * @param {number} o.W  canvas px
 * @param {number} o.H
 * @param {number} o.dpr
 * @param {number} o.t
 * @param {number} o.alpha      layer alpha (crossfade × biome alpha)
 * @param {number} o.coverage
 * @param {'cloud'|'shadow'} [o.mode]
 * @param {{x:number,y:number}|null} [o.focus]  CSS px
 * @param {number} [o.shadowAlpha]
 * @returns {number} clouds drawn
 */
export function drawCloudLayer(ctx, o) {
  const { layer, cam, W, H, dpr, t, biome } = o;
  const zs = cam.zoom * layer.scale * dpr;
  const drift = biome.clouds.drift;
  const lcx = cam.x * layer.parallax - drift * t;
  const lcy = cam.y * layer.parallax - drift * t * 0.35;
  const shadow = o.mode === 'shadow';
  // Shadows land on the ground far below: shift them down-right (light from the top-left).
  const offX = shadow ? 120 * cam.zoom * dpr : 0;
  const offY = shadow ? 160 * cam.zoom * dpr : 0;
  const cxs = W / 2 + cam.shakeX * dpr * layer.parallax + offX;
  const cys = H / 2 + cam.shakeY * dpr * layer.parallax + offY;
  const maxR = CW * 0.75;
  const hw = W / 2 / zs + maxR;
  const hh = H / 2 / zs + maxR;
  const c0 = Math.floor((lcx - hw) / layer.cell);
  const c1 = Math.floor((lcx + hw) / layer.cell);
  const r0 = Math.floor((lcy - hh) / layer.cell);
  const r1 = Math.floor((lcy + hh) / layer.cell);
  const fx = o.focus ? o.focus.x * dpr : 0;
  const fy = o.focus ? o.focus.y * dpr : 0;
  let drawn = 0;
  for (let cy = r0; cy <= r1; cy++) {
    for (let cx = c0; cx <= c1; cx++) {
      const h = rand01(cx, cy, layer.salt);
      if (h >= o.coverage) continue;
      const lx = (cx + 0.15 + 0.7 * rand01(cx, cy, layer.salt + 1)) * layer.cell;
      const ly = (cy + 0.15 + 0.7 * rand01(cx, cy, layer.salt + 2)) * layer.cell;
      const sc = 0.7 + 0.75 * rand01(cx, cy, layer.salt + 3);
      const variant = hashInt(cx, cy, layer.salt + 4) % VARIANTS;
      const x = (lx - lcx) * zs + cxs;
      const y = (ly - lcy) * zs + cys;
      const w = CW * sc * zs;
      const hgt = CH * sc * zs;
      if (x + w / 2 < 0 || x - w / 2 > W || y + hgt / 2 < 0 || y - hgt / 2 > H) continue;
      let a = o.alpha * (0.72 + 0.28 * rand01(cx, cy, layer.salt + 5));
      if (shadow) a = (o.shadowAlpha ?? 0.18) * o.alpha;
      if (o.focus) {
        // Fade when the focus is under (or near) the cloud body.
        const R = w * 0.32;
        const d = Math.hypot((x - fx) / 1.2, y - fy);
        const k = (d - R * 0.2) / (R * 0.9 + 140 * dpr);
        a *= k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k);
      }
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      const img = shadow ? shadowSprite(variant) : cloudSprite(biome, variant);
      ctx.drawImage(img, x - w / 2, y - hgt / 2, w, hgt);
      drawn++;
    }
  }
  ctx.globalAlpha = 1;
  return drawn;
}
