// Particle textures for js/gfx/particles.js (WP3).
//
// Every logical texture has an id (TEX.*). Where WP4 registers a matching `fx_*` sprite
// (js/gfx/art/fxtex.js) that sprite is used; otherwise we paint our own once into an offscreen
// canvas. Tintable textures are re-coloured through a small cache keyed by a 15-bit quantized
// colour, so colour-over-life costs one Map lookup per particle and no per-frame compositing.

import { Sprites } from './sprites.js';
import { RNG } from '../core/rng.js';

const TAU = Math.PI * 2;

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      const c = new OffscreenCanvas(w, h);
      if (c.getContext('2d')) return c;
    } catch {
      /* fall back to DOM canvas */
    }
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// ---------------------------------------------------------------------------------------------
// Own painters. Each paints into a `px`×`py` canvas (pixels). Greyscale/white where tintable.

function radial(ctx, cx, cy, r, stops) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
}

const W = (a) => `rgba(255,255,255,${a})`;

function paintGlow(ctx, s) {
  radial(ctx, s / 2, s / 2, s / 2, [
    [0, W(1)],
    [0.18, W(0.82)],
    [0.42, W(0.36)],
    [0.68, W(0.1)],
    [1, W(0)],
  ]);
}

function paintSoft(ctx, s) {
  radial(ctx, s / 2, s / 2, s / 2, [
    [0, W(0.55)],
    [0.35, W(0.3)],
    [0.7, W(0.08)],
    [1, W(0)],
  ]);
}

function paintCore(ctx, s) {
  radial(ctx, s / 2, s / 2, s / 2, [
    [0, W(1)],
    [0.16, W(1)],
    [0.3, W(0.55)],
    [0.55, W(0.12)],
    [1, W(0)],
  ]);
}

/** Lumpy billow made of shaded blobs lit from the top-left, then softened at the rim. */
function paintPuff(ctx, s, frame, bright) {
  const rng = new RNG(1013 + frame * 7919 + (bright ? 31 : 0));
  const c = s / 2;
  const blobs = 7 + frame * 2;
  for (let i = 0; i < blobs; i++) {
    const a = rng.angle();
    const d = rng.range(0, s * 0.2);
    const r = rng.range(s * 0.16, s * 0.27) * (i === 0 ? 1.25 : 1);
    const x = c + Math.cos(a) * d;
    const y = c + Math.sin(a) * d;
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r);
    const hi = bright ? 255 : 236;
    const mid = bright ? 228 : 178;
    const lo = bright ? 196 : 118;
    g.addColorStop(0, `rgba(${hi},${hi},${hi},0.9)`);
    g.addColorStop(0.45, `rgba(${mid},${mid},${mid},0.75)`);
    g.addColorStop(0.75, `rgba(${lo},${lo},${lo},0.3)`);
    g.addColorStop(1, `rgba(${lo},${lo},${lo},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  // soft rim so stacked puffs never show hard circle edges
  ctx.globalCompositeOperation = 'destination-in';
  radial(ctx, c, c, c, [
    [0, W(1)],
    [0.4, W(0.85)],
    [0.75, W(0.3)],
    [1, W(0)],
  ]);
  ctx.globalCompositeOperation = 'source-over';
}

/** 4:1 streak, hot centre line; drawn stretched along velocity. */
function paintStreak(ctx, w, h) {
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(w / 2, h / 2);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, W(1));
  g.addColorStop(0.3, W(0.85));
  g.addColorStop(0.6, W(0.3));
  g.addColorStop(1, W(0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function paintFlare(ctx, s) {
  const c = s / 2;
  radial(ctx, c, c, c * 0.62, [
    [0, W(1)],
    [0.25, W(0.7)],
    [0.6, W(0.18)],
    [1, W(0)],
  ]);
  ctx.globalCompositeOperation = 'lighter';
  const ray = (ang, len, wid, a) => {
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(ang);
    const g = ctx.createLinearGradient(-len, 0, len, 0);
    g.addColorStop(0, W(0));
    g.addColorStop(0.5, W(a));
    g.addColorStop(1, W(0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-len, 0);
    ctx.quadraticCurveTo(0, -wid, len, 0);
    ctx.quadraticCurveTo(0, wid, -len, 0);
    ctx.fill();
    ctx.restore();
  };
  ray(0, c, s * 0.035, 0.95);
  ray(Math.PI / 2, c * 0.92, s * 0.03, 0.85);
  ray(Math.PI / 4, c * 0.55, s * 0.02, 0.5);
  ray(-Math.PI / 4, c * 0.55, s * 0.02, 0.5);
  radial(ctx, c, c, c * 0.18, [
    [0, W(1)],
    [1, W(0)],
  ]);
  ctx.globalCompositeOperation = 'source-over';
}

function paintRing(ctx, s) {
  radial(ctx, s / 2, s / 2, s / 2, [
    [0, W(0)],
    [0.7, W(0)],
    [0.84, W(0.9)],
    [0.89, W(1)],
    [0.94, W(0.45)],
    [1, W(0)],
  ]);
}

function paintShock(ctx, s) {
  radial(ctx, s / 2, s / 2, s / 2, [
    [0, W(0)],
    [0.45, W(0.04)],
    [0.7, W(0.22)],
    [0.86, W(0.9)],
    [0.91, W(1)],
    [0.96, W(0.3)],
    [1, W(0)],
  ]);
}

/** Flame tongue facing +x, used for muzzle flashes (tinted; a white core is layered on top). */
function paintMuzzle(ctx, w, h) {
  const cy = h / 2;
  const g = ctx.createRadialGradient(w * 0.18, cy, 0, w * 0.18, cy, w * 0.8);
  g.addColorStop(0, W(1));
  g.addColorStop(0.25, W(0.9));
  g.addColorStop(0.6, W(0.45));
  g.addColorStop(1, W(0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(w * 0.02, cy);
  ctx.bezierCurveTo(w * 0.05, cy - h * 0.48, w * 0.55, cy - h * 0.42, w * 0.98, cy);
  ctx.bezierCurveTo(w * 0.55, cy + h * 0.42, w * 0.05, cy + h * 0.48, w * 0.02, cy);
  ctx.fill();
  // side lobes give the classic cannon "cross" flash
  ctx.globalCompositeOperation = 'lighter';
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(w * 0.12, cy);
    ctx.quadraticCurveTo(w * 0.3, cy + sgn * h * 0.15, w * 0.34, cy + sgn * h * 0.48);
    ctx.quadraticCurveTo(w * 0.2, cy + sgn * h * 0.12, w * 0.12, cy);
    ctx.fillStyle = W(0.35);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** Brass cog lit from the top-left (not tinted). */
function paintCog(ctx, s) {
  const c = s / 2;
  const teeth = 9;
  const ro = s * 0.46;
  const ri = s * 0.36;
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * TAU;
    const a1 = ((i + 1) / (teeth * 2)) * TAU;
    const r = i % 2 === 0 ? ro : ri;
    const inset = i % 2 === 0 ? 0.12 : 0;
    ctx.lineTo(c + Math.cos(a0 + inset) * r, c + Math.sin(a0 + inset) * r);
    ctx.lineTo(c + Math.cos(a1 - inset) * r, c + Math.sin(a1 - inset) * r);
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, s, s);
  g.addColorStop(0, '#fbe3a0');
  g.addColorStop(0.45, '#c9973f');
  g.addColorStop(1, '#6a4818');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = s * 0.045;
  ctx.strokeStyle = 'rgba(26,18,10,0.85)';
  ctx.stroke();
  // recessed web + spokes
  ctx.beginPath();
  ctx.arc(c, c, s * 0.26, 0, TAU);
  ctx.fillStyle = '#8a6224';
  ctx.fill();
  ctx.fillStyle = '#d9ab52';
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate((i / 4) * TAU + 0.4);
    ctx.fillRect(-s * 0.04, 0, s * 0.08, s * 0.26);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(c, c, s * 0.12, 0, TAU);
  ctx.fillStyle = '#e8c47a';
  ctx.fill();
  ctx.lineWidth = s * 0.03;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(c, c, s * 0.05, 0, TAU);
  ctx.fillStyle = '#1a120a';
  ctx.fill();
  // specular glint, top-left
  ctx.beginPath();
  ctx.arc(c - s * 0.16, c - s * 0.2, s * 0.06, 0, TAU);
  ctx.fillStyle = 'rgba(255,248,220,0.7)';
  ctx.fill();
}

const INK = 'rgba(26,18,10,0.85)';

/** Debris frames: 0 plank, 1 iron plate, 2 hex nut, 3 brass bracket, 4 canvas scrap, 5 pipe. */
function paintDebris(ctx, s, frame) {
  const c = s / 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = s * 0.045;
  ctx.strokeStyle = INK;
  switch (frame) {
    case 0: {
      // splintered plank with grain and nails
      ctx.beginPath();
      ctx.moveTo(s * 0.08, c - s * 0.12);
      ctx.lineTo(s * 0.78, c - s * 0.14);
      ctx.lineTo(s * 0.86, c - s * 0.06);
      ctx.lineTo(s * 0.8, c - s * 0.01);
      ctx.lineTo(s * 0.94, c + s * 0.05);
      ctx.lineTo(s * 0.76, c + s * 0.13);
      ctx.lineTo(s * 0.12, c + s * 0.12);
      ctx.lineTo(s * 0.04, c + s * 0.02);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, c - s * 0.14, 0, c + s * 0.14);
      g.addColorStop(0, '#c08a50');
      g.addColorStop(0.5, '#a0703e');
      g.addColorStop(1, '#5f3c1d');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = s * 0.018;
      ctx.strokeStyle = 'rgba(63,40,18,0.7)';
      for (const dy of [-0.06, 0.0, 0.06]) {
        ctx.beginPath();
        ctx.moveTo(s * 0.14, c + s * dy);
        ctx.bezierCurveTo(s * 0.35, c + s * (dy + 0.02), s * 0.5, c + s * (dy - 0.02), s * 0.72, c + s * dy);
        ctx.stroke();
      }
      ctx.fillStyle = '#5b626b';
      for (const x of [0.2, 0.62]) {
        ctx.beginPath();
        ctx.arc(s * x, c, s * 0.03, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 1: {
      // bent riveted iron plate
      ctx.beginPath();
      ctx.moveTo(s * 0.18, s * 0.22);
      ctx.lineTo(s * 0.74, s * 0.16);
      ctx.lineTo(s * 0.84, s * 0.48);
      ctx.lineTo(s * 0.7, s * 0.82);
      ctx.lineTo(s * 0.46, s * 0.7);
      ctx.lineTo(s * 0.22, s * 0.8);
      ctx.closePath();
      const g = ctx.createLinearGradient(s * 0.1, s * 0.1, s * 0.9, s * 0.9);
      g.addColorStop(0, '#b6bec7');
      g.addColorStop(0.5, '#6b737c');
      g.addColorStop(1, '#2f343a');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = s * 0.025;
      ctx.beginPath();
      ctx.moveTo(s * 0.24, s * 0.27);
      ctx.lineTo(s * 0.7, s * 0.22);
      ctx.stroke();
      ctx.fillStyle = '#c9973f';
      for (const [x, y] of [[0.3, 0.32], [0.62, 0.29], [0.68, 0.62], [0.32, 0.68]]) {
        ctx.beginPath();
        ctx.arc(s * x, s * y, s * 0.035, 0, TAU);
        ctx.fill();
      }
      // scorch
      radial(ctx, s * 0.55, s * 0.55, s * 0.22, [[0, 'rgba(20,14,10,0.55)'], [1, 'rgba(20,14,10,0)']]);
      break;
    }
    case 2: {
      // hex nut
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + Math.PI / 6;
        ctx.lineTo(c + Math.cos(a) * s * 0.34, c + Math.sin(a) * s * 0.34);
      }
      ctx.closePath();
      const g = ctx.createLinearGradient(0, 0, s, s);
      g.addColorStop(0, '#d5dbe1');
      g.addColorStop(0.5, '#7d858e');
      g.addColorStop(1, '#353a41');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(c, c, s * 0.14, 0, TAU);
      ctx.fillStyle = '#1f2328';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = s * 0.025;
      ctx.beginPath();
      ctx.arc(c, c, s * 0.2, Math.PI * 0.9, Math.PI * 1.6);
      ctx.stroke();
      break;
    }
    case 3: {
      // brass L-bracket
      ctx.beginPath();
      ctx.moveTo(s * 0.2, s * 0.2);
      ctx.lineTo(s * 0.4, s * 0.2);
      ctx.lineTo(s * 0.4, s * 0.6);
      ctx.lineTo(s * 0.82, s * 0.6);
      ctx.lineTo(s * 0.82, s * 0.8);
      ctx.lineTo(s * 0.2, s * 0.8);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, 0, s, s);
      g.addColorStop(0, '#f2d48a');
      g.addColorStop(0.5, '#c9973f');
      g.addColorStop(1, '#6a4818');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#4a3112';
      for (const [x, y] of [[0.3, 0.32], [0.3, 0.7], [0.7, 0.7]]) {
        ctx.beginPath();
        ctx.arc(s * x, s * y, s * 0.04, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 4: {
      // torn canvas scrap with stitching
      ctx.beginPath();
      ctx.moveTo(s * 0.12, s * 0.3);
      ctx.lineTo(s * 0.45, s * 0.16);
      ctx.lineTo(s * 0.88, s * 0.34);
      ctx.lineTo(s * 0.72, s * 0.52);
      ctx.lineTo(s * 0.8, s * 0.78);
      ctx.lineTo(s * 0.5, s * 0.66);
      ctx.lineTo(s * 0.24, s * 0.84);
      ctx.lineTo(s * 0.3, s * 0.56);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, 0, s, s);
      g.addColorStop(0, '#f8efd6');
      g.addColorStop(0.6, '#d8c69c');
      g.addColorStop(1, '#8e7a50');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([s * 0.04, s * 0.035]);
      ctx.strokeStyle = 'rgba(140,47,43,0.85)';
      ctx.lineWidth = s * 0.022;
      ctx.beginPath();
      ctx.moveTo(s * 0.22, s * 0.36);
      ctx.lineTo(s * 0.72, s * 0.4);
      ctx.stroke();
      ctx.setLineDash([]);
      radial(ctx, s * 0.6, s * 0.62, s * 0.18, [[0, 'rgba(30,20,10,0.5)'], [1, 'rgba(30,20,10,0)']]);
      break;
    }
    default: {
      // copper pipe stub
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(-0.5);
      const g = ctx.createLinearGradient(0, -s * 0.12, 0, s * 0.12);
      g.addColorStop(0, '#f0b483');
      g.addColorStop(0.45, '#b4643c');
      g.addColorStop(1, '#5a2e17');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.rect(-s * 0.34, -s * 0.11, s * 0.68, s * 0.22);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#7a5420';
      ctx.fillRect(-s * 0.4, -s * 0.15, s * 0.1, s * 0.3);
      ctx.strokeRect(-s * 0.4, -s * 0.15, s * 0.1, s * 0.3);
      ctx.beginPath();
      ctx.ellipse(s * 0.34, 0, s * 0.04, s * 0.11, 0, 0, TAU);
      ctx.fillStyle = '#2a160a';
      ctx.fill();
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Registry

/**
 * @typedef {{name:string, sprite?:string, w:number, h:number, frames:number, tint:boolean,
 *   paint:(ctx:CanvasRenderingContext2D, w:number, h:number, frame:number)=>void}} TexDef
 */
/** @type {TexDef[]} */
const DEFS = [];
const byName = new Map();

function def(name, d) {
  const id = DEFS.length;
  DEFS.push({ name, w: 64, h: 64, frames: 1, tint: true, ...d });
  byName.set(name, id);
  return id;
}

/** Logical texture ids (stable small integers). */
export const TEX = {
  glow: def('glow', { sprite: 'fx_glow', paint: (c, w) => paintGlow(c, w) }),
  soft: def('soft', { sprite: 'fx_glow_soft', paint: (c, w) => paintSoft(c, w) }),
  core: def('core', { w: 32, h: 32, paint: (c, w) => paintCore(c, w) }),
  smoke: def('smoke', { sprite: 'fx_smoke', frames: 3, paint: (c, w, h, f) => paintPuff(c, w, f, false) }),
  steam: def('steam', { sprite: 'fx_steam', paint: (c, w) => paintPuff(c, w, 1, true) }),
  streak: def('streak', { w: 64, h: 16, paint: (c, w, h) => paintStreak(c, w, h) }),
  glint: def('glint', { sprite: 'fx_spark', w: 32, h: 32, paint: (c, w) => paintFlare(c, w) }),
  flare: def('flare', { sprite: 'fx_flare', w: 128, h: 128, paint: (c, w) => paintFlare(c, w) }),
  ring: def('ring', { sprite: 'fx_ring', w: 128, h: 128, paint: (c, w) => paintRing(c, w) }),
  shock: def('shock', { w: 128, h: 128, paint: (c, w) => paintShock(c, w) }),
  muzzle: def('muzzle', { w: 64, h: 32, paint: (c, w, h) => paintMuzzle(c, w, h) }),
  cog: def('cog', { sprite: 'fx_cog', tint: false, paint: (c, w) => paintCog(c, w) }),
  debris: def('debris', { sprite: 'fx_debris', frames: 4, tint: false, paint: (c, w, h, f) => paintDebris(c, w, f) }),
  scrap: def('scrap', { frames: 6, tint: false, paint: (c, w, h, f) => paintDebris(c, w, f) }),
};

/** Aspect ratio (w/h) of the own texture; sprites report their own. */
export function texAspect(id) {
  const d = DEFS[id];
  return d.w / d.h;
}

export function texFrames(id) {
  const d = DEFS[id];
  if (d.sprite && !preferOwn && Sprites.has(d.sprite)) return Sprites.frames(d.sprite);
  return d.frames;
}

export function isTintable(id) {
  return DEFS[id].tint;
}

let preferOwn = false;
/** Force our own painted textures even when fx_* sprites exist (preview comparison). */
export function setPreferOwnTextures(v) {
  preferOwn = !!v;
  resetTextures();
}

const baseCache = []; // id*16+frame -> CanvasImageSource
const tintCache = new Map(); // numeric key -> canvas
const TINT_CAP = 900;
/** Counters for profiling (preview page / debug). */
export const texStats = { tints: 0, flushes: 0, byTex: {} };

/**
 * Register an arbitrary sprite (from `p.sprite`) as a texture so the pool can store it as an
 * integer. Sprite textures are drawn untinted unless the particle asks for `tint:true`.
 */
export function texForSprite(name) {
  let id = byName.get(`sprite:${name}`);
  if (id === undefined) {
    if (DEFS.length >= 1000) return TEX.glow;
    id = def(`sprite:${name}`, { sprite: name, tint: true, own: false, paint: null });
    byName.set(`sprite:${name}`, id);
  }
  return id;
}

/** Base (untinted) image for a texture frame. */
export function texImage(id, frame = 0) {
  const k = id * 16 + (frame & 15);
  let img = baseCache[k];
  if (img) return img;
  const d = DEFS[id];
  if (d.sprite && (!preferOwn || !d.paint) && Sprites.has(d.sprite)) {
    const n = Sprites.frames(d.sprite);
    img = Sprites.get(d.sprite, frame % n).img;
  } else if (d.paint) {
    const c = makeCanvas(d.w, d.h);
    const ctx = c.getContext('2d');
    try {
      d.paint(ctx, d.w, d.h, frame % d.frames);
    } catch (err) {
      console.error(`[fx] texture paint failed: ${d.name}`, err);
    }
    img = c;
  } else {
    img = Sprites.get(d.sprite, frame).img; // placeholder from Sprites
  }
  baseCache[k] = img;
  return img;
}

/**
 * Tinted variant of a texture. `rgb15` = 5 bits per channel (r<<10|g<<5|b).
 * Uses luminosity → multiply → destination-in so shaded textures keep their lighting.
 */
export function texTinted(id, frame, rgb15) {
  // 4 bits per channel is plenty for soft particles and keeps the variant set small
  rgb15 &= 0x7bde;
  const key = ((id * 16 + (frame & 15)) << 15) | rgb15;
  let c = tintCache.get(key);
  if (c) return c;
  const src = texImage(id, frame);
  const w = src.width;
  const h = src.height;
  c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const r = ((rgb15 >> 10) & 31) * 8.226;
  const g = ((rgb15 >> 5) & 31) * 8.226;
  const b = (rgb15 & 31) * 8.226;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'luminosity';
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(src, 0, 0);
  texStats.tints++;
  texStats.byTex[DEFS[id].name] = (texStats.byTex[DEFS[id].name] || 0) + 1;
  if (tintCache.size >= TINT_CAP) {
    tintCache.clear();
    texStats.flushes++;
  }
  tintCache.set(key, c);
  return c;
}

/** Drop every cached texture (after Sprites.purge or a texture preference change). */
export function resetTextures() {
  baseCache.length = 0;
  tintCache.clear();
}

/** Pre-render the common textures + their most used tints so the first explosion never hitches. */
export function prewarmTextures(colors = []) {
  for (let id = 0; id < DEFS.length; id++) {
    if (!DEFS[id].paint && !DEFS[id].sprite) continue;
    const n = DEFS[id].frames;
    for (let f = 0; f < n; f++) texImage(id, f);
  }
  for (const rgb of colors) {
    const q = toRgb15(rgb);
    for (const id of [TEX.glow, TEX.smoke, TEX.streak, TEX.soft]) texTinted(id, 0, q);
  }
}

/** Pre-tint the 9 colour-over-life steps of a ramp for every frame of a texture. */
export function prewarmRamp(id, c0, c1) {
  const frames = DEFS[id].frames;
  for (let f = 0; f < frames; f++) {
    for (let k = 0; k <= 8; k++) texTinted(id, f, lerpRgb15(c0, c1, k * 0.125));
  }
}

// ---------------------------------------------------------------------------------------------
// Colour helpers (packed 0xRRGGBB integers)

const parsed = new Map();
let parseCtx = null;

/** Parse a CSS colour (or pass through an int) to 0xRRGGBB. Cached. */
export function parseColor(c) {
  if (typeof c === 'number') return c & 0xffffff;
  if (!c) return 0xffffff;
  let v = parsed.get(c);
  if (v !== undefined) return v;
  v = 0xffffff;
  const s = String(c).trim();
  let m;
  if ((m = /^#([0-9a-f]{3})$/i.exec(s))) {
    const [r, g, b] = m[1].split('').map((h) => parseInt(h + h, 16));
    v = (r << 16) | (g << 8) | b;
  } else if ((m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s))) {
    v = parseInt(m[1], 16);
  } else if ((m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s))) {
    v = ((+m[1] & 255) << 16) | ((+m[2] & 255) << 8) | (+m[3] & 255);
  } else {
    try {
      if (!parseCtx) parseCtx = makeCanvas(1, 1).getContext('2d');
      parseCtx.fillStyle = '#ffffff';
      parseCtx.fillStyle = s;
      const n = String(parseCtx.fillStyle);
      if (n[0] === '#') v = parseInt(n.slice(1, 7), 16);
      else if ((m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(n))) {
        v = ((+m[1] & 255) << 16) | ((+m[2] & 255) << 8) | (+m[3] & 255);
      }
    } catch {
      /* keep white */
    }
  }
  if (parsed.size > 512) parsed.clear();
  parsed.set(c, v);
  return v;
}

/** Alpha encoded in an rgba()/#rrggbbaa colour, else 1. */
export function parseAlpha(c) {
  if (typeof c !== 'string') return 1;
  let m = /^rgba\([^)]*,\s*([\d.]+)\s*\)$/i.exec(c);
  if (m) return Math.max(0, Math.min(1, +m[1]));
  m = /^#[0-9a-f]{6}([0-9a-f]{2})$/i.exec(c);
  if (m) return parseInt(m[1], 16) / 255;
  return 1;
}

export function toRgb15(rgb) {
  return (((rgb >> 19) & 31) << 10) | (((rgb >> 11) & 31) << 5) | ((rgb >> 3) & 31);
}

/** Lerp two packed colours and quantize to rgb15 in one step (hot path). */
export function lerpRgb15(a, b, t) {
  if (a === b || t <= 0) return toRgb15(a);
  if (t >= 1) return toRgb15(b);
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const r = ar + (((b >> 16) & 255) - ar) * t;
  const g = ag + (((b >> 8) & 255) - ag) * t;
  const bl = ab + ((b & 255) - ab) * t;
  return ((r >> 3) << 10) | ((g >> 3) << 5) | (bl >> 3);
}

export function rgbCss(rgb, a = 1) {
  return `rgba(${(rgb >> 16) & 255},${(rgb >> 8) & 255},${rgb & 255},${a})`;
}

export function lerpRgb(a, b, t) {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  return (
    ((ar + (((b >> 16) & 255) - ar) * t) << 16) |
    ((ag + (((b >> 8) & 255) - ag) * t) << 8) |
    (ab + ((b & 255) - ab) * t)
  );
}
