// Aurora Drift ground painter (WP6): moonlit snowy mountains at night seen from high above —
// ridged peaks with hill shading and faint topographic lines, frozen lakes with cracked ice,
// snow-laden pine forests on the slopes, and valley villages whose windows glow warm
// (animated twinkle via bg-anim.js) linked by trodden lantern-lit paths.

import {
  A, fnoise, pridged, sampleField, makeField, fillRows, blitField, strokeContour, forCells,
  cellRng, rand01, rgb,
  ramp, putRamp, grainCanvas, touchesTile, fieldAt, TILE,
} from './bg-util.js';
import { house, bakedGlow } from './bg-props.js';

const SEED = 5303;
const LAKE = 0.27;
const VALLEY = 0.45;

/** Mountain height in ~[0.1, 0.9]: sharp ridges over broad massifs. */
export function height(x, y) {
  x += 700;
  y += 300;
  return pridged(x / 900, y / 900, 6, SEED) * 0.75 + fnoise(x / 2400, y / 2400, 2, SEED + 3) * 0.4;
}
const forest = (x, y) => fnoise(x / 300 - 11, y / 300 + 4, 4, SEED + 7);
/** Pine cover 0..~0.4: forests cling to the lower slopes above the valley floors. */
function forestCover(f, h) {
  if (h < LAKE + 0.01 || h > 0.66) return 0;
  const band = 1 - Math.abs(h - 0.47) / 0.19;
  return Math.max(0, f - 0.5 + band * 0.12) * (band > 0 ? 1 : 0);
}
const FOREST = rgb('#121a30');

const SNOW_LIT = rgb('#c9d5ff');
const SNOW_SHADE = rgb('#0d1236');
const BASE = ramp([
  [0.0, '#222a5e'],
  [0.3, '#323d80'],
  [0.6, '#4c5aa4'],
  [1.0, '#8f9cda'],
]);
const ICE = ramp([
  [0.0, '#4f86b4'],
  [0.5, '#336796'],
  [1.0, '#244c7c'],
]);

const VC = 520;
function villageAt(cx, cy) {
  if (rand01(cx, cy, SEED + 21) > 0.8) return null;
  // Try a few spots in the cell, keep the first that sits in a valley (not on a lake).
  for (let i = 0; i < 6; i++) {
    const x = (cx + 0.15 + 0.7 * rand01(cx, cy, SEED + 22 + i * 2)) * VC;
    const y = (cy + 0.15 + 0.7 * rand01(cx, cy, SEED + 23 + i * 2)) * VC;
    const h = height(x, y);
    if (h > LAKE + 0.03 && h < VALLEY) return { cx, cy, x, y, size: rand01(cx, cy, SEED + 25) > 0.6 ? 1 : 0 };
  }
  return null;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./bg-util.js').Anchors} anchors
 */
export function* paint(ctx, X0, Y0, anchors) {
  const H = makeField(X0, Y0, 4, 5);
  for (let j = 0; j < H.n; j += 48) {
    fillRows(H, height, j, j + 48);
    yield;
  }
  const F = sampleField(X0, Y0, 8, 3, forest);

  // 1. Moonlit snowfields with hill shading (light from the top-left).
  const n = H.n;
  const hd = H.data;
  blitField(ctx, H, (k, i, j, px, p) => {
    const h = hd[k];
    const gx = hd[Math.min(k + 1, hd.length - 1)] - hd[Math.max(k - 1, 0)];
    const gy = hd[Math.min(k + n, hd.length - 1)] - hd[Math.max(k - n, 0)];
    putRamp(px, p, BASE, (h - 0.3) / 0.55);
    const sh = Math.max(-1, Math.min(1, -(gx + gy) * 60));
    const t = sh > 0 ? sh * 0.62 * h : 0;
    const d = sh < 0 ? -sh * 0.7 : 0;
    px[p] += (SNOW_LIT[0] - px[p]) * t + (SNOW_SHADE[0] - px[p]) * d;
    px[p + 1] += (SNOW_LIT[1] - px[p + 1]) * t + (SNOW_SHADE[1] - px[p + 1]) * d;
    px[p + 2] += (SNOW_LIT[2] - px[p + 2]) * t + (SNOW_SHADE[2] - px[p + 2]) * d;
    // Dark forest floor under the pines.
    const fo = forestCover(fieldAt(F, H.x0 + i * H.cell, H.y0 + j * H.cell), h);
    if (fo > 0) {
      const q = Math.min(0.8, fo * 3);
      px[p] += (FOREST[0] - px[p]) * q;
      px[p + 1] += (FOREST[1] - px[p + 1]) * q;
      px[p + 2] += (FOREST[2] - px[p + 2]) * q;
    }
  });
  // Faint topographic lines on the heights.
  ctx.lineWidth = 0.8;
  for (const lv of [0.56, 0.64, 0.72, 0.8, 0.88]) strokeContour(ctx, H, lv, '#080b26', 0.8, 0.2);
  yield;

  // 2. Frozen lakes.
  blitField(ctx, H, (k, i, j, px, p) => {
    const h = hd[k];
    if (h > LAKE + 0.004) {
      px[p + 3] = 0;
      return;
    }
    putRamp(px, p, ICE, (LAKE - h) / 0.08, 255 * Math.min(1, (LAKE + 0.004 - h) / 0.004));
  });
  strokeContour(ctx, H, LAKE, '#b9d4ff', 1.6, 0.7);
  strokeContour(ctx, H, LAKE - 0.012, '#9fc2f0', 0.8, 0.3);
  // Cracks across the ice.
  ctx.strokeStyle = 'rgba(190,220,255,0.45)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  forCells(X0, Y0, 48, 20, (cx, cy) => {
    const r = cellRng(cx, cy, SEED + 31);
    let x = (cx + r.next()) * 48;
    let y = (cy + r.next()) * 48;
    if (fieldAt(H, x, y) > LAKE - 0.01) return;
    let a = r.angle();
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      a += r.range(-0.7, 0.7);
      x += Math.cos(a) * r.range(4, 10);
      y += Math.sin(a) * r.range(4, 10);
      if (fieldAt(H, x, y) > LAKE - 0.004) break;
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
  yield;

  // 3. Snow-laden pines on the lower slopes (in bands, yielding between them).
  const PC = 7;
  const c0 = Math.floor((X0 - 6) / PC);
  const c1 = Math.floor((X0 + TILE + 6) / PC);
  const r0 = Math.floor((Y0 - 6) / PC);
  const r1 = Math.floor((Y0 + TILE + 6) / PC);
  for (let cy = r0; cy <= r1; cy++) {
    for (let cx = c0; cx <= c1; cx++) {
      const x = (cx + 0.5 + (rand01(cx, cy, SEED + 41) - 0.5) * 0.9) * PC;
      const y = (cy + 0.5 + (rand01(cx, cy, SEED + 42) - 0.5) * 0.9) * PC;
      const h = fieldAt(H, x, y);
      if (h < LAKE + 0.008) continue;
      const fo = forestCover(fieldAt(F, x, y), h);
      const v = rand01(cx, cy, SEED + 43);
      if (v > fo * 2.6 && v > 0.006) continue;
      pine(ctx, x, y, 3.2 + v * 3.2);
    }
    if ((cy - r0) % 24 === 23) yield;
  }
  yield;

  // 4. Villages, paths and lanterns.
  const villages = [];
  for (let cy = Math.floor((Y0 - VC) / VC); cy <= Math.floor((Y0 + TILE + VC) / VC); cy++) {
    for (let cx = Math.floor((X0 - VC) / VC); cx <= Math.floor((X0 + TILE + VC) / VC); cx++) {
      const v = villageAt(cx, cy);
      if (v) villages.push(v);
    }
  }
  const byCell = new Map(villages.map((v) => [`${v.cx},${v.cy}`, v]));
  ctx.setLineDash([]);
  for (const v of villages) {
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const w = byCell.get(`${v.cx + dx},${v.cy + dy}`);
      if (!w) continue;
      // Paths wind along the valley: route through the lower of two candidate midpoints.
      const mx0 = (v.x + w.x) / 2 + (w.y - v.y) * 0.25;
      const my0 = (v.y + w.y) / 2 - (w.x - v.x) * 0.25;
      const mx1 = (v.x + w.x) / 2 - (w.y - v.y) * 0.25;
      const my1 = (v.y + w.y) / 2 + (w.x - v.x) * 0.25;
      const low = height(mx0, my0) < height(mx1, my1);
      const mx = low ? mx0 : mx1;
      const my = low ? my0 : my1;
      if (height(mx, my) > 0.58) continue;
      ctx.strokeStyle = 'rgba(8,10,40,0.45)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(v.x, v.y);
      ctx.quadraticCurveTo(mx, my, w.x, w.y);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(150,165,225,0.75)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      // Lanterns along the way.
      const r = cellRng(v.cx * 3 + dx, v.cy * 3 + dy, SEED + 51);
      for (let s = 0.12; s < 0.9; s += r.range(0.08, 0.16)) {
        const it = 1 - s;
        const lx = it * it * v.x + 2 * it * s * mx + s * s * w.x;
        const ly = it * it * v.y + 2 * it * s * my + s * s * w.y;
        if (touchesTile(X0, Y0, lx, ly, 20)) bakedGlow(ctx, lx, ly, 7, '#ffcf7a', 0.35);
        anchors.add(A.WINDOW, lx, ly, 0.45, r.next());
      }
    }
  }
  yield;
  for (const v of villages) {
    if (!touchesTile(X0, Y0, v.x, v.y, 90)) continue;
    drawVillage(ctx, v, anchors);
  }

  ctx.globalAlpha = 0.3;
  ctx.fillStyle = ctx.createPattern(grainCanvas(23), 'repeat');
  ctx.fillRect(X0, Y0, TILE, TILE);
  ctx.globalAlpha = 1;
}

function pine(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(4,6,24,0.45)';
  ctx.beginPath();
  ctx.arc(x + r * 0.9, y + r * 1.2, r, 0, Math.PI * 2);
  ctx.fill();
  // Star-shaped crown seen from above.
  ctx.fillStyle = '#0f1a2c';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const rr = i % 2 ? r * 0.55 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#56659c';
  ctx.beginPath();
  ctx.arc(x - r * 0.25, y - r * 0.3, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

function drawVillage(ctx, v, anchors) {
  const r = cellRng(v.cx, v.cy, SEED + 71);
  const count = v.size ? r.int(24, 34) : r.int(12, 18);
  const spread = v.size ? 52 : 34;
  // Warm light pooled on the snow.
  bakedGlow(ctx, v.x, v.y, spread * 1.7, '#ff9f45', 0.32);
  // Square & well.
  ctx.fillStyle = 'rgba(150,165,220,0.9)';
  ctx.beginPath();
  ctx.arc(v.x, v.y, 7, 0, Math.PI * 2);
  ctx.fill();
  const ang = r.range(0, Math.PI);
  for (let i = 0; i < count; i++) {
    const a = r.angle();
    const d = r.range(9, spread);
    const hx = v.x + Math.cos(a) * d;
    const hy = v.y + Math.sin(a) * d;
    const h = height(hx, hy);
    if (h < LAKE + 0.006 || h > 0.56) continue;
    const w = r.range(6, 9.5);
    const hh = r.range(4.2, 6);
    house(ctx, hx, hy, w, hh, ang + (r.next() < 0.5 ? 0 : Math.PI / 2), '#e6eeff', {
      snow: true, height: 2.4, shadow: 'rgba(14,16,50,0.45)',
    });
    // Window glow spilling onto the snow, plus an animated twinkle.
    const wx = hx + r.range(-2, 2) + 3;
    const wy = hy + r.range(-2, 2) + 3.5;
    bakedGlow(ctx, wx, wy, 6, '#ffb347', 0.5);
    if (r.next() < 0.7) anchors.add(A.WINDOW, wx, wy, r.range(0.55, 0.9), r.next());
    if (r.next() < 0.15) anchors.add(A.STEAM, hx, hy, 0.35, r.next());
  }
  // Chapel with a steeple.
  if (v.size) {
    house(ctx, v.x + 14, v.y - 10, 12, 6, ang, '#e6eeff', { snow: true, height: 4, shadow: 'rgba(14,16,50,0.45)' });
    house(ctx, v.x + 14 - Math.cos(ang) * 8, v.y - 10 - Math.sin(ang) * 8, 4.5, 4.5, ang, '#e6eeff', {
      snow: true, height: 9, shadow: 'rgba(14,16,50,0.45)',
    });
    anchors.add(A.WINDOW, v.x + 14, v.y - 6, 1, r.next());
  }
  for (let i = 0; i < 6; i++) {
    const a = r.angle();
    const d = r.range(1, 1.5) * spread;
    pine(ctx, v.x + Math.cos(a) * d, v.y + Math.sin(a) * d, r.range(2.6, 4));
  }
}
