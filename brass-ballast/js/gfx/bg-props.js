// Tiny map props for the ground tiles (WP6): houses, trees, boats, chimneys, piers, towers.
// Drawn in ground units into tile canvases; seen from high altitude so they stay small and
// simple. Light comes from the top-left: highlights up-left, shadows cast down-right.

import { mixHex, rgba } from './bg-util.js';

const shadeCache = new Map();
/** Cached [lit, base, dark] variants of a roof color. */
export function shades(hex) {
  let s = shadeCache.get(hex);
  if (!s) {
    s = [mixHex(hex, '#fff6e0', 0.28), hex, mixHex(hex, '#120a04', 0.32)];
    shadeCache.set(hex, s);
  }
  return s;
}

/** Shadow direction per unit of height (matches the top-left light of the sprites). */
export const SHADOW_DX = 0.75;
export const SHADOW_DY = 1;

/**
 * Gabled house seen from above: lit & shaded roof halves, ridge, shadow, ink rim.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} ang  rotation (radians)
 * @param {{height?:number, snow?:boolean, shadow?:string, ink?:number}} [o]
 */
export function house(ctx, x, y, w, h, ang, roof, o = {}) {
  const ht = o.height ?? 2.2;
  const [lit, base, dark] = o.snow ? ['#c4d0f6', '#8e9ccc', '#4a5590'] : shades(roof);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  // Shadow: offset in world space, so undo rotation for the offset.
  const ca = Math.cos(-ang);
  const sa = Math.sin(-ang);
  const sx = (SHADOW_DX * ca - SHADOW_DY * sa) * ht;
  const sy = (SHADOW_DX * sa + SHADOW_DY * ca) * ht;
  ctx.fillStyle = o.shadow || 'rgba(20,12,6,0.38)';
  ctx.fillRect(-w / 2 + sx, -h / 2 + sy, w, h);
  // Roof halves split along the long axis (ridge). The half facing up-left is lit.
  const horiz = w >= h;
  const litFirst = horiz ? Math.sin(ang) <= 0.2 : Math.cos(ang) >= -0.2;
  ctx.fillStyle = litFirst ? lit : dark;
  if (horiz) ctx.fillRect(-w / 2, -h / 2, w, h / 2);
  else ctx.fillRect(-w / 2, -h / 2, w / 2, h);
  ctx.fillStyle = litFirst ? dark : lit;
  if (horiz) ctx.fillRect(-w / 2, 0, w, h / 2);
  else ctx.fillRect(0, -h / 2, w / 2, h);
  ctx.fillStyle = base;
  if (horiz) ctx.fillRect(-w / 2, -0.35, w, 0.7);
  else ctx.fillRect(-0.35, -h / 2, 0.7, h);
  if (o.ink !== 0) {
    ctx.strokeStyle = 'rgba(26,18,10,0.55)';
    ctx.lineWidth = o.ink ?? 0.6;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
  }
  ctx.restore();
}

/** Flat-roofed block (factories, warehouses) with optional skylight stripes. */
export function flatRoof(ctx, x, y, w, h, color, o = {}) {
  const ht = o.height ?? 3;
  ctx.fillStyle = o.shadow || 'rgba(15,10,5,0.42)';
  ctx.fillRect(x + SHADOW_DX * ht, y + SHADOW_DY * ht, w, h);
  const [lit, base, dark] = shades(color);
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  // Parapet: lit top/left, dark bottom/right.
  ctx.fillStyle = lit;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillStyle = dark;
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x + w - 1, y, 1, h);
  if (o.stripes) {
    // Sawtooth factory roof: alternating glazing (lit) & slope (dark) bands.
    const n = o.stripes;
    const vertical = o.vertical;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      ctx.fillStyle = o.glass || 'rgba(190,200,190,0.35)';
      if (vertical) ctx.fillRect(x + 2 + (w - 4) * (i / n), y + 2, ((w - 4) / n) * 0.35, h - 4);
      else ctx.fillRect(x + 2, y + 2 + (h - 4) * (i / n), w - 4, ((h - 4) / n) * 0.35);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      if (vertical) ctx.fillRect(x + 2 + (w - 4) * t, y + 2, 0.7, h - 4);
      else ctx.fillRect(x + 2, y + 2 + (h - 4) * t, w - 4, 0.7);
    }
  }
  if (o.ink !== 0) {
    ctx.strokeStyle = 'rgba(20,14,8,0.6)';
    ctx.lineWidth = 0.6;
    ctx.strokeRect(x, y, w, h);
  }
}

/** Round tree crown with shadow and highlight. */
export function tree(ctx, x, y, r, color, hi, o = {}) {
  const ht = o.height ?? r * 0.9;
  ctx.fillStyle = o.shadow || 'rgba(16,22,8,0.35)';
  ctx.beginPath();
  ctx.arc(x + SHADOW_DX * ht, y + SHADOW_DY * ht, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hi;
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.32, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Small sailing ship / boat. `len` ≈ hull length. `sail` color or null for steamers.
 * Draws a fan-shaped wake behind it when `wake` > 0.
 */
export function boat(ctx, x, y, ang, len, hull, sail, wake = 0, o = {}) {
  const w = len * 0.34;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  if (wake > 0) {
    ctx.strokeStyle = o.wakeColor || 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    const L = len * 2.6 * wake;
    ctx.moveTo(-len * 0.3, -w * 0.4);
    ctx.quadraticCurveTo(-len * 0.3 - L * 0.5, -w * 0.6, -len * 0.3 - L, -w * 1.8 * wake - w);
    ctx.moveTo(-len * 0.3, w * 0.4);
    ctx.quadraticCurveTo(-len * 0.3 - L * 0.5, w * 0.6, -len * 0.3 - L, w * 1.8 * wake + w);
    ctx.stroke();
    ctx.fillStyle = o.wakeColor || 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(-len * 0.45, 0, len * 0.3, w * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Shadow on the water.
  ctx.fillStyle = 'rgba(0,10,20,0.3)';
  hullPath(ctx, len, w, 1.2, 1.2);
  ctx.fill();
  const [lit, base, dark] = shades(hull);
  ctx.fillStyle = base;
  hullPath(ctx, len, w, 0, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,12,6,0.7)';
  ctx.lineWidth = 0.55;
  ctx.stroke();
  ctx.fillStyle = dark;
  ctx.fillRect(-len * 0.32, -w * 0.18, len * 0.62, w * 0.36);
  ctx.fillStyle = lit;
  ctx.fillRect(-len * 0.32, -w * 0.38, len * 0.55, w * 0.14);
  if (sail) {
    ctx.fillStyle = sail;
    ctx.strokeStyle = 'rgba(40,30,20,0.45)';
    ctx.lineWidth = 0.4;
    const masts = len > 16 ? 2 : 1;
    for (let m = 0; m < masts; m++) {
      const mx = masts === 1 ? len * 0.02 : -len * 0.16 + m * len * 0.32;
      ctx.beginPath();
      ctx.moveTo(mx - len * 0.06, -w * 1.15);
      ctx.quadraticCurveTo(mx + len * 0.12, 0, mx - len * 0.06, w * 1.15);
      ctx.lineTo(mx - len * 0.1, w * 1.1);
      ctx.quadraticCurveTo(mx + len * 0.04, 0, mx - len * 0.1, -w * 1.1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else {
    // Steamer funnel.
    ctx.fillStyle = '#3a2a22';
    ctx.beginPath();
    ctx.arc(-len * 0.05, 0, w * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8c2f2b';
    ctx.beginPath();
    ctx.arc(-len * 0.05, 0, w * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function hullPath(ctx, len, w, dx, dy) {
  ctx.beginPath();
  ctx.moveTo(len * 0.5 + dx, dy);
  ctx.quadraticCurveTo(len * 0.2 + dx, -w * 0.62 + dy, -len * 0.38 + dx, -w * 0.48 + dy);
  ctx.lineTo(-len * 0.5 + dx, -w * 0.3 + dy);
  ctx.lineTo(-len * 0.5 + dx, w * 0.3 + dy);
  ctx.lineTo(-len * 0.38 + dx, w * 0.48 + dy);
  ctx.quadraticCurveTo(len * 0.2 + dx, w * 0.62 + dy, len * 0.5 + dx, dy);
  ctx.closePath();
}

/** Brick chimney stack seen from above: long cast shadow, rim, sooty mouth. */
export function chimney(ctx, x, y, r, o = {}) {
  const ht = o.height ?? 10;
  ctx.strokeStyle = o.shadow || 'rgba(10,6,2,0.38)';
  ctx.lineWidth = r * 1.9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + SHADOW_DX * ht, y + SHADOW_DY * ht);
  ctx.stroke();
  const brick = o.color || '#8a4a32';
  const [lit, base, dark] = shades(brick);
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(x + 0.4, y + 0.5, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = lit;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(x, y, r - 0.4, Math.PI * 0.9, Math.PI * 1.7);
  ctx.stroke();
  ctx.fillStyle = o.mouth || '#1a1008';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.58, 0, Math.PI * 2);
  ctx.fill();
  if (o.glow) {
    ctx.fillStyle = o.glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.36, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Round tank / gas holder (or dome) with a lit crown, guide frame and radial ribs. */
export function tank(ctx, x, y, r, color, o = {}) {
  const ht = o.height ?? r * 0.6;
  ctx.fillStyle = 'rgba(10,6,2,0.42)';
  ctx.beginPath();
  ctx.arc(x + SHADOW_DX * ht, y + SHADOW_DY * ht, r, 0, Math.PI * 2);
  ctx.fill();
  const [lit, base, dark] = shades(color);
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.05, x, y, r * 0.95);
  g.addColorStop(0, lit);
  g.addColorStop(0.55, base);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,14,8,0.7)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  const ribs = o.ribs ?? 12;
  ctx.strokeStyle = 'rgba(20,14,8,0.35)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let i = 0; i < ribs; i++) {
    const a = (i / ribs) * Math.PI * 2;
    ctx.moveTo(x + Math.cos(a) * r * 0.22, y + Math.sin(a) * r * 0.22);
    ctx.lineTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.2, 0, Math.PI * 2);
  ctx.fill();
  // Guide-frame posts around gas holders.
  if (o.frame !== false && r > 9) {
    ctx.fillStyle = '#2a2622';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.fillRect(x + Math.cos(a) * (r + 1.5) - 1, y + Math.sin(a) * (r + 1.5) - 1, 2, 2);
    }
  }
}

/** Wooden pier from (x0,y0) to (x1,y1) with posts. */
export function pier(ctx, x0, y0, x1, y1, width = 3.2) {
  ctx.lineCap = 'butt';
  ctx.strokeStyle = 'rgba(0,15,25,0.35)';
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0 + 1.2, y0 + 1.6);
  ctx.lineTo(x1 + 1.2, y1 + 1.6);
  ctx.stroke();
  ctx.strokeStyle = '#7a5530';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,230,180,0.35)';
  ctx.lineWidth = width * 0.3;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.lineCap = 'round';
}

/** Dashed track of short ties across a path (railways, fences). Call after stroking rails. */
export function ties(ctx, x0, y0, x1, y1, spacing, half, color) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L;
  const ny = dx / L;
  ctx.strokeStyle = color;
  ctx.beginPath();
  for (let s = 0; s <= L; s += spacing) {
    const x = x0 + (dx * s) / L;
    const y = y0 + (dy * s) / L;
    ctx.moveTo(x - nx * half, y - ny * half);
    ctx.lineTo(x + nx * half, y + ny * half);
  }
  ctx.stroke();
}

/** Soft circular glow painted into a tile (baked light pools). */
export function bakedGlow(ctx, x, y, r, color, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(0.45, rgba(color, a * 0.4));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
