// Floating islands (WP6) for the Aurora Drift's low layer: chunks of snowy rock adrift in the
// night air with a few pines and a cottage whose window glows. Rendered once per variant;
// placed by the cloud layer (bg-clouds.js) in cells beyond the cloud coverage.

import { makeCanvas, softDot } from './bg-util.js';
import { RNG } from '../core/rng.js';

export const ISLE_W = 260;
export const ISLE_H = 200;
export const ISLE_VARIANTS = 4;

const cache = new Map();

function outline(r, cx, cy, R, squash) {
  const pts = [];
  const n = 48;
  const ph = r.angle();
  const ph2 = r.angle();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k =
      0.8 +
      0.13 * Math.sin(a * 2 + ph) +
      0.08 * Math.sin(a * 5 + ph2) +
      0.03 * Math.sin(a * 11 + ph);
    pts.push([cx + Math.cos(a) * R * k, cy + Math.sin(a) * R * k * squash]);
  }
  return pts;
}

/** Smooth closed path through the outline (midpoint quadratic curves). */
function poly(ctx, pts, dx = 0, dy = 0, s = 1, cx = 0, cy = 0) {
  const P = pts.map(([x, y]) => [cx + (x - cx) * s + dx, cy + (y - cy) * s + dy]);
  const n = P.length;
  ctx.beginPath();
  ctx.moveTo((P[n - 1][0] + P[0][0]) / 2, (P[n - 1][1] + P[0][1]) / 2);
  for (let i = 0; i < n; i++) {
    const a = P[i];
    const b = P[(i + 1) % n];
    ctx.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  ctx.closePath();
}

/** Island sprite (or its shadow silhouette). */
export function isleSprite(variant, shadow = false) {
  const key = `${variant}|${shadow}`;
  let c = cache.get(key);
  if (c) return c;
  c = makeCanvas(ISLE_W, ISLE_H);
  const ctx = c.getContext('2d');
  const r = new RNG(777 + variant * 131);
  const cx = ISLE_W / 2;
  const cy = ISLE_H / 2;
  const pts = outline(r, cx, cy, 82, r.range(0.6, 0.8));
  if (shadow) {
    ctx.fillStyle = '#000';
    poly(ctx, pts);
    ctx.fill();
    cache.set(key, c);
    return c;
  }
  // Rocky flanks: the underside tapers away down-right (implied depth), dark and craggy.
  for (let i = 9; i >= 1; i--) {
    const t = i / 9;
    ctx.fillStyle = t > 0.6 ? '#080a1c' : t > 0.3 ? '#151936' : '#232854';
    poly(ctx, pts, i * 1.9, i * 2.6, 1 - i * 0.045, cx, cy);
    ctx.fill();
  }
  // Crags on the flank.
  ctx.strokeStyle = 'rgba(70,80,140,0.5)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    const a = r.range(-0.4, 1.9);
    const R = 74 + r.range(-6, 4);
    const x = cx + Math.cos(a) * R;
    const y = cy + Math.sin(a) * R * 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + r.range(3, 9), y + r.range(5, 14));
    ctx.stroke();
  }
  // Snowy top: moonlit dome, brightest up-left, falling off toward the rim.
  const g = ctx.createRadialGradient(cx - 34, cy - 26, 6, cx, cy, 96);
  g.addColorStop(0, '#c8d3f6');
  g.addColorStop(0.45, '#8b98d0');
  g.addColorStop(0.8, '#55609e');
  g.addColorStop(1, '#353d78');
  ctx.fillStyle = g;
  poly(ctx, pts);
  ctx.fill();
  ctx.strokeStyle = 'rgba(8,10,30,0.75)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  // Snow lip catching the light along the top-left edge.
  ctx.save();
  poly(ctx, pts);
  ctx.clip();
  ctx.strokeStyle = 'rgba(225,235,255,0.5)';
  ctx.lineWidth = 3;
  poly(ctx, pts, 1.5, 2);
  ctx.stroke();
  ctx.restore();
  // Exposed rock patches.
  for (let i = 0; i < 6; i++) {
    const a = r.angle();
    const d = r.range(20, 60);
    ctx.fillStyle = 'rgba(30,34,76,0.45)';
    ctx.beginPath();
    ctx.ellipse(
      cx + Math.cos(a) * d,
      cy + Math.sin(a) * d * 0.6,
      r.range(5, 11),
      r.range(3, 6),
      r.angle(),
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
  // Pines.
  for (let i = 0; i < r.int(8, 16); i++) {
    const a = r.angle();
    const d = r.range(10, 55);
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d * 0.6;
    const s = r.range(3.5, 6);
    ctx.fillStyle = 'rgba(4,6,24,0.45)';
    ctx.beginPath();
    ctx.arc(x + s, y + s * 1.2, s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f1a2c';
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const aa = (k / 10) * Math.PI * 2;
      const rr = k % 2 ? s * 0.55 : s;
      ctx.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7d8cc4';
    ctx.beginPath();
    ctx.arc(x - s * 0.25, y - s * 0.3, s * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Cottage with a lit window.
  const hx = cx + r.range(-20, 20);
  const hy = cy + r.range(-12, 12);
  ctx.fillStyle = 'rgba(6,8,30,0.5)';
  ctx.fillRect(hx - 7 + 3, hy - 5 + 4, 14, 10);
  ctx.fillStyle = '#c4d0f6';
  ctx.fillRect(hx - 7, hy - 5, 14, 5);
  ctx.fillStyle = '#5a66a6';
  ctx.fillRect(hx - 7, hy, 14, 5);
  ctx.strokeStyle = 'rgba(8,10,30,0.7)';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(hx - 7, hy - 5, 14, 10);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(
    softDot(64, '#ff9a3a', [
      [0, 0.75],
      [0.3, 0.35],
      [1, 0],
    ]),
    hx - 22,
    hy - 18,
    64,
    56
  );
  ctx.drawImage(
    softDot(16, '#fff0b0', [
      [0, 1],
      [1, 0],
    ]),
    hx + 2,
    hy + 3,
    10,
    10
  );
  ctx.globalCompositeOperation = 'source-over';
  cache.set(key, c);
  return c;
}
