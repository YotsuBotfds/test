// Lightning bolts for Weather (WP6). A bolt is generated once in normalized form (fractions of
// its length) and re-projected every frame, so it stays pinned to its world target while the
// camera moves. Drawn additively in three strokes (halo, body, core) plus an impact glow.

import { RNG } from '../core/rng.js';
import { softDot } from './bg-util.js';

const SEGS = 16;

/**
 * Build a jagged bolt shape: main channel + forks, as normalized offsets.
 * @param {number} branches
 * @param {RNG} r
 */
export function makeBolt(branches, r) {
  // Main channel by midpoint displacement: positions along (u) & sideways offsets (d), both
  // as fractions of the bolt length.
  const d = new Float32Array(SEGS + 1);
  const step = (lo, hi, amp) => {
    if (hi - lo < 2) return;
    const mid = (lo + hi) >> 1;
    d[mid] = (d[lo] + d[hi]) / 2 + r.range(-amp, amp);
    step(lo, mid, amp * 0.55);
    step(mid, hi, amp * 0.55);
  };
  step(0, SEGS, 0.14);
  const forks = [];
  for (let b = 0; b < branches; b++) {
    const at = r.int(3, SEGS - 4);
    const side = r.sign();
    const len = r.range(0.12, 0.3);
    const n = 6;
    const pts = new Float32Array((n + 1) * 2);
    let a = side * r.range(0.35, 0.9);
    let u = 0;
    let v = 0;
    for (let i = 1; i <= n; i++) {
      a += r.range(-0.45, 0.45);
      u += Math.cos(a) * (len / n);
      v += Math.sin(a) * (len / n);
      pts[i * 2] = u;
      pts[i * 2 + 1] = v;
    }
    forks.push({ at, pts, w: r.range(0.45, 0.7) });
  }
  return { d, forks };
}

const P = new Float32Array((SEGS + 1) * 2);

/**
 * Draw a bolt from (x0,y0) to (x1,y1) (CSS px) with alpha `a`.
 * @param {CanvasRenderingContext2D} ctx  in screen transform
 */
export function drawBolt(ctx, shape, x0, y0, x1, y1, a, color, width = 1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L;
  const ny = dx / L;
  for (let i = 0; i <= SEGS; i++) {
    const u = i / SEGS;
    const off = shape.d[i] * L;
    P[i * 2] = x0 + dx * u + nx * off;
    P[i * 2 + 1] = y0 + dy * u + ny * off;
  }
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(P[0], P[1]);
    for (let i = 1; i <= SEGS; i++) ctx.lineTo(P[i * 2], P[i * 2 + 1]);
    for (const f of shape.forks) {
      const bx = P[f.at * 2];
      const by = P[f.at * 2 + 1];
      ctx.moveTo(bx, by);
      for (let i = 1; i < f.pts.length / 2; i++) {
        const u = f.pts[i * 2] * L;
        const v = f.pts[i * 2 + 1] * L;
        ctx.lineTo(bx + (dx / L) * u + nx * v, by + (dy / L) * u + ny * v);
      }
    }
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  path();
  ctx.globalAlpha = a * 0.22;
  ctx.strokeStyle = color;
  ctx.lineWidth = 12 * width;
  ctx.stroke();
  ctx.globalAlpha = a * 0.5;
  ctx.lineWidth = 4.5 * width;
  ctx.stroke();
  ctx.globalAlpha = a;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.8 * width;
  ctx.stroke();
  // Impact & cloud-base glows.
  const g = softDot(128, color, [[0, 1], [0.25, 0.5], [1, 0]]);
  const R = 70 * width;
  ctx.globalAlpha = a * 0.85;
  ctx.drawImage(g, x1 - R, y1 - R, R * 2, R * 2);
  ctx.globalAlpha = a * 0.5;
  ctx.drawImage(g, x0 - R * 1.6, y0 - R * 0.8, R * 3.2, R * 1.6);
  ctx.globalAlpha = 1;
}

/** Shared cosmetic RNG for bolt shapes. */
export const boltRng = new RNG(0xb017);
