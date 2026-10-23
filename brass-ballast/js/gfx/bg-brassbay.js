// Brassbay ground painter (WP6): dawn-lit coastline seen from high altitude — turquoise
// shallows & deep sea with wave lines, sandy beaches, harbor towns with piers & moored boats,
// patchwork fields with hedgerows, woods, winding roads, villages and windmills.

import {
  TILE, A, fnoise, sampleField, fieldAt, blitField, strokeContour, forCells, cellRng,
  rand01, rgb, ramp, putRamp, putMix, grainCanvas, touchesTile,
} from './bg-util.js';
import { house, tree, boat, pier } from './bg-props.js';

const SEED = 1301;
const SEA = 0.47;
const BEACH = 0.0055;
const S = 1 / 2300;

/** Land height in ~[0,1); below SEA is water. Domain-warped for ragged, natural coasts. */
export function elev(x, y) {
  // Offset so the run's origin sits on an interesting stretch of coast.
  x += 1800;
  y -= 900;
  const wx = fnoise(x * S * 2.3 + 3.1, y * S * 2.3 - 7.7, 3, SEED + 1) - 0.5;
  const wy = fnoise(x * S * 2.3 - 5.3, y * S * 2.3 + 1.9, 3, SEED + 2) - 0.5;
  return fnoise(x * S + wx * 1.2, y * S + wy * 1.2, 5, SEED);
}

const moist = (x, y) => fnoise(x / 1100, y / 1100, 3, SEED + 5);
const woods = (x, y) => fnoise(x / 420 + 40, y / 420, 4, SEED + 9);

const LAND = ramp([
  [0.0, '#aa9d60'],
  [0.35, '#949a58'],
  [0.6, '#7d9652'],
  [1.0, '#68884b'],
]);
const SEA_RAMP = ramp([
  [0.0, '#93d4c0'],
  [0.12, '#62b5b0'],
  [0.35, '#3d8fa0'],
  [0.7, '#2c6f8c'],
  [1.0, '#25587a'],
]);
const SAND = rgb('#ead39a');
const WET_SAND = rgb('#c9b884');

const CROPS = [
  ['#d9b85c', 5], // wheat
  ['#cfa64c', 3], // barley
  ['#86a855', 5], // young green
  ['#6b9149', 3], // pasture
  ['#8d6c45', 3, 'plough'], // ploughed earth
  ['#a99c62', 2], // fallow
  ['#d9c552', 0.8], // rapeseed
  ['#a294ae', 0.4], // lavender
  ['#b5c06a', 2], // hay
];
const CROP_TOTAL = CROPS.reduce((s, c) => s + c[1], 0);
function pickCrop(r) {
  let v = r.next() * CROP_TOTAL;
  for (const c of CROPS) if ((v -= c[1]) <= 0) return c;
  return CROPS[0];
}

const ROOFS = ['#b85a3c', '#a4472f', '#c26a44', '#6b7280', '#c6a15b', '#9a5b3e', '#b85a3c'];
const VC = 560; // village grid

/** Deterministic village for a grid cell, or null. */
function villageAt(cx, cy) {
  if (rand01(cx, cy, SEED + 21) > 0.72) return null;
  const x = (cx + 0.5 + (rand01(cx, cy, SEED + 22) - 0.5) * 0.6) * VC;
  const y = (cy + 0.5 + (rand01(cx, cy, SEED + 23) - 0.5) * 0.6) * VC;
  const e = elev(x, y);
  if (e < SEA + 0.01) return null;
  const big = rand01(cx, cy, SEED + 24);
  const size = big > 0.9 ? 2 : big > 0.45 ? 1 : 0;
  return { cx, cy, x, y, e, size, harbor: e < SEA + 0.045 };
}

/**
 * Paint one ground tile. Generator: yields between phases so the cache can spread work.
 * @param {CanvasRenderingContext2D} ctx  tile context in ground coordinates
 * @param {import('./bg-util.js').Anchors} anchors
 */
export function* paint(ctx, X0, Y0, anchors) {
  const E = sampleField(X0, Y0, 8, 3, elev);
  const M = sampleField(X0, Y0, 16, 2, moist);
  const W = sampleField(X0, Y0, 8, 3, woods);
  yield;

  // 1. Land base with soft hill shading.
  const n = E.n;
  const ed = E.data;
  blitField(ctx, E, (k, i, j, px, p) => {
    const m = fieldAt(M, E.x0 + i * E.cell, E.y0 + j * E.cell);
    putRamp(px, p, LAND, m);
    const gx = ed[Math.min(k + 1, ed.length - 1)] - ed[Math.max(k - 1, 0)];
    const gy = ed[Math.min(k + n, ed.length - 1)] - ed[Math.max(k - n, 0)];
    const sh = Math.max(-1, Math.min(1, -(gx + gy) * 90));
    const lift = (ed[k] - SEA) * 0.6;
    const f = 1 + sh * 0.12 + lift;
    px[p] *= f;
    px[p + 1] *= f;
    px[p + 2] *= f * 0.98;
  });
  yield;

  // 2. Patchwork fields with hedgerows.
  const FC = 118;
  forCells(X0, Y0, FC, FC, (cx, cy) => {
    const r = cellRng(cx, cy, SEED + 31);
    const x = (cx + 0.5) * FC + r.range(-18, 18);
    const y = (cy + 0.5) * FC + r.range(-18, 18);
    if (!touchesTile(X0, Y0, x, y, FC)) return;
    const e = elev(x, y);
    if (e < SEA + 0.012 || woods(x, y) > 0.6 || r.next() < 0.1) return;
    const ang = (fnoise(cx * 0.21, cy * 0.21, 2, SEED + 33) - 0.5) * 2.2 + r.range(-0.12, 0.12);
    const hw = FC * r.range(0.5, 0.62);
    const hh = FC * r.range(0.46, 0.6);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    const strips = r.int(1, 4);
    let sx = -hw;
    for (let s = 0; s < strips; s++) {
      const sw = s === strips - 1 ? hw - sx : ((hw * 2) / strips) * r.range(0.7, 1.3);
      const crop = pickCrop(r);
      ctx.fillStyle = crop[0];
      ctx.globalAlpha = r.range(0.82, 1);
      ctx.fillRect(sx + 1, -hh + 1, sw - 2, hh * 2 - 2);
      ctx.globalAlpha = 1;
      // Texture: furrows or mowing lines.
      ctx.strokeStyle = crop[2] ? 'rgba(60,38,18,0.35)' : 'rgba(255,240,190,0.16)';
      ctx.lineWidth = crop[2] ? 1 : 0.8;
      ctx.beginPath();
      const step = crop[2] ? 3.2 : 5.5;
      for (let fx = sx + 3; fx < sx + sw - 2; fx += step) {
        ctx.moveTo(fx, -hh + 2);
        ctx.lineTo(fx, hh - 2);
      }
      ctx.stroke();
      // Hedge.
      ctx.strokeStyle = 'rgba(52,74,32,0.75)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx + 0.5, -hh + 0.5, sw - 1, hh * 2 - 1);
      sx += sw;
    }
    // Hedgerow trees along the borders.
    const nt = r.int(2, 7);
    for (let t = 0; t < nt; t++) {
      const side = r.int(0, 3);
      const u = r.range(-1, 1);
      const tx = side < 2 ? u * hw : side === 2 ? -hw : hw;
      const ty = side < 2 ? (side === 0 ? -hh : hh) : u * hh;
      tree(ctx, tx, ty, r.range(2.2, 3.6), '#4d6e33', '#6f9446', { height: 2.5 });
    }
    ctx.restore();
    // The odd windmill on a field corner.
    if (r.next() < 0.06) {
      const mx = x + hw * 0.8;
      const my = y - hh * 0.8;
      if (elev(mx, my) > SEA + 0.01) {
        tree(ctx, mx, my, 3.6, '#d8c9a8', '#f2e6c8', { height: 6, shadow: 'rgba(30,20,10,0.4)' });
        anchors.add(A.MILL, mx, my, 1, r.next());
      }
    }
  });
  yield;

  // 3. Woods & lone trees.
  const TC = 10;
  forCells(X0, Y0, TC, 8, (cx, cy) => {
    const x = (cx + 0.5 + (rand01(cx, cy, SEED + 41) - 0.5) * 0.9) * TC;
    const y = (cy + 0.5 + (rand01(cx, cy, SEED + 42) - 0.5) * 0.9) * TC;
    const w = fieldAt(W, x, y);
    const p = (w - 0.62) * 10;
    const v = rand01(cx, cy, SEED + 43);
    if (v > p && v > 0.012) return;
    if (fieldAt(E, x, y) < SEA + 0.01) return;
    const dark = rand01(cx, cy, SEED + 44);
    const col = dark < 0.5 ? '#3f6130' : dark < 0.8 ? '#4b6f35' : '#5b7d3a';
    tree(ctx, x, y, 3 + v * 3 + (p > 1 ? 1 : 0), col, '#76994a', { height: 3.5 });
  });
  yield;

  // 4. Roads between villages, then the villages themselves.
  const villages = [];
  const cmin = Math.floor((X0 - VC * 1.6) / VC);
  const cmax = Math.floor((X0 + TILE + VC * 1.6) / VC);
  const rmin = Math.floor((Y0 - VC * 1.6) / VC);
  const rmax = Math.floor((Y0 + TILE + VC * 1.6) / VC);
  for (let cy = rmin; cy <= rmax; cy++) {
    for (let cx = cmin; cx <= cmax; cx++) {
      const v = villageAt(cx, cy);
      if (v) villages.push(v);
    }
  }
  const byCell = new Map(villages.map((v) => [`${v.cx},${v.cy}`, v]));
  const roads = [];
  for (const v of villages) {
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1]]) {
      if (dx && dy && rand01(v.cx, v.cy, SEED + 25) > 0.3) continue;
      const w = byCell.get(`${v.cx + dx},${v.cy + dy}`);
      if (!w) continue;
      let ok = true;
      for (let s = 1; s < 6 && ok; s++) {
        const t = s / 6;
        if (elev(v.x + (w.x - v.x) * t, v.y + (w.y - v.y) * t) < SEA + 0.006) ok = false;
      }
      if (!ok) continue;
      const bend = (rand01(v.cx * 7 + dx, v.cy * 7 + dy, SEED + 26) - 0.5) * 0.5;
      const mx = (v.x + w.x) / 2 - (w.y - v.y) * bend;
      const my = (v.y + w.y) / 2 + (w.x - v.x) * bend;
      roads.push([v.x, v.y, mx, my, w.x, w.y]);
    }
  }
  const roadPath = () => {
    ctx.beginPath();
    for (const r of roads) {
      ctx.moveTo(r[0], r[1]);
      ctx.quadraticCurveTo(r[2], r[3], r[4], r[5]);
    }
  };
  roadPath();
  ctx.strokeStyle = 'rgba(92,70,40,0.55)';
  ctx.lineWidth = 4.4;
  ctx.stroke();
  ctx.strokeStyle = '#dcc18a';
  ctx.lineWidth = 2.6;
  ctx.stroke();
  ctx.setLineDash([3, 5]);
  ctx.strokeStyle = 'rgba(140,110,60,0.35)';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.setLineDash([]);
  yield;

  for (const v of villages) {
    if (!touchesTile(X0, Y0, v.x, v.y, 120)) continue;
    drawVillage(ctx, v, anchors);
  }
  yield;

  // 5. The sea, laid over everything with a soft beach edge.
  blitField(ctx, E, (k, i, j, px, p) => {
    const e = ed[k];
    if (e > SEA + BEACH + 0.004) {
      px[p + 3] = 0;
      return;
    }
    if (e >= SEA) {
      const t = (e - SEA) / BEACH;
      putMix(px, p, WET_SAND, SAND, t, 255 * Math.min(1, (SEA + BEACH + 0.004 - e) / 0.004));
      return;
    }
    putRamp(px, p, SEA_RAMP, (SEA - e) / 0.11);
  });
  // Wave lines & inked coast — the "illustrated map" look.
  strokeContour(ctx, E, SEA - 0.006, '#e9fff6', 1.6, 0.55);
  strokeContour(ctx, E, SEA - 0.018, '#dff8f0', 1.1, 0.3);
  strokeContour(ctx, E, SEA - 0.036, '#d6f2ee', 0.9, 0.16);
  strokeContour(ctx, E, SEA - 0.07, '#cfe8ea', 0.8, 0.1);
  strokeContour(ctx, E, SEA, '#4a3420', 1.3, 0.55);
  strokeContour(ctx, E, SEA + BEACH, '#7d6a3e', 0.7, 0.3);
  yield;

  // 6. Harbors: piers & moored boats.
  for (const v of villages) {
    if (!v.harbor || !touchesTile(X0, Y0, v.x, v.y, 260)) continue;
    drawHarbor(ctx, v, anchors);
  }

  // 7. Ships under sail, fishing boats and sea glints.
  const SC = 300;
  forCells(X0, Y0, SC, 80, (cx, cy) => {
    const r = cellRng(cx, cy, SEED + 61);
    for (let g = 0; g < 7; g++) {
      const gx = (cx + r.next()) * SC;
      const gy = (cy + r.next()) * SC;
      if (elev(gx, gy) < SEA - 0.012) anchors.add(A.GLINT, gx, gy, r.range(0.6, 1.3), r.next());
    }
    if (r.next() > 0.38) return;
    const x = (cx + r.range(0.2, 0.8)) * SC;
    const y = (cy + r.range(0.2, 0.8)) * SC;
    if (!touchesTile(X0, Y0, x, y, 60)) return;
    const e = elev(x, y);
    if (e > SEA - 0.015) return;
    const deep = e < SEA - 0.05;
    const len = deep ? r.range(14, 24) : r.range(7, 11);
    const ang = r.range(-Math.PI, Math.PI);
    const steam = deep && r.next() < 0.3;
    const sail = steam ? null : r.next() < 0.15 ? '#b5523f' : '#f5ecd6';
    boat(ctx, x, y, ang, len, deep ? '#5a3a22' : '#7a5533', sail, deep ? 1 : 0.5);
    if (steam) anchors.add(A.STEAM, x - Math.cos(ang) * len * 0.05, y - Math.sin(ang) * len * 0.05, 0.6, r.next());
  });

  // 8. Paper grain over the whole tile.
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = ctx.createPattern(grainCanvas(3), 'repeat');
  ctx.fillRect(X0, Y0, TILE, TILE);
  ctx.globalAlpha = 1;
}

function drawVillage(ctx, v, anchors) {
  const r = cellRng(v.cx, v.cy, SEED + 71);
  const count = [r.int(12, 18), r.int(26, 38), r.int(48, 66)][v.size];
  const spread = [28, 44, 62][v.size];
  const ang = r.range(0, Math.PI);
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  // Village green & a few trees.
  ctx.fillStyle = 'rgba(120,150,80,0.6)';
  ctx.beginPath();
  ctx.ellipse(v.x, v.y, spread * 0.45, spread * 0.32, ang, 0, Math.PI * 2);
  ctx.fill();
  // Streets: two crossing lanes.
  ctx.strokeStyle = 'rgba(210,186,130,0.85)';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(v.x - ca * spread * 1.2, v.y - sa * spread * 1.2);
  ctx.lineTo(v.x + ca * spread * 1.2, v.y + sa * spread * 1.2);
  ctx.moveTo(v.x + sa * spread, v.y - ca * spread);
  ctx.lineTo(v.x - sa * spread, v.y + ca * spread);
  ctx.stroke();
  for (let i = 0; i < count; i++) {
    // Houses line the lanes: pick a lane, a distance along it, and a side.
    const lane = r.next() < 0.6;
    const d = r.range(-1, 1) * spread * (lane ? 1.15 : 0.9);
    const side = (r.next() < 0.5 ? -1 : 1) * r.range(5.5, 9 + v.size * 3);
    const lx = lane ? d : side;
    const ly = lane ? side : d;
    const hx = v.x + lx * ca - ly * sa;
    const hy = v.y + lx * sa + ly * ca;
    if (elev(hx, hy) < SEA + 0.007) continue;
    const w = r.range(7, 11);
    const h = r.range(4.6, 6.4);
    house(ctx, hx, hy, w, h, lane ? ang : ang + Math.PI / 2, ROOFS[r.int(0, ROOFS.length - 1)]);
    if (r.next() < 0.12) anchors.add(A.STEAM, hx, hy, 0.35, r.next());
  }
  // Church with a square tower.
  if (v.size > 0) {
    const cx = v.x + sa * 9;
    const cy = v.y - ca * 9;
    house(ctx, cx, cy, 13, 6, ang, '#7b6f6a', { height: 3.5 });
    house(ctx, cx - ca * 8, cy - sa * 8, 5, 5, ang, '#5d5a5e', { height: 7 });
  }
  for (let i = 0; i < 4 + v.size * 3; i++) {
    const a = r.angle();
    const d = r.range(0.6, 1.3) * spread;
    tree(ctx, v.x + Math.cos(a) * d, v.y + Math.sin(a) * d, r.range(2.5, 3.8), '#4a6c33', '#6f9446');
  }
}

function drawHarbor(ctx, v, anchors) {
  // Walk downhill to the shore.
  const h = 6;
  const gx = elev(v.x + h, v.y) - elev(v.x - h, v.y);
  const gy = elev(v.x, v.y + h) - elev(v.x, v.y - h);
  const gl = Math.hypot(gx, gy) || 1;
  const dx = -gx / gl;
  const dy = -gy / gl;
  let sx = v.x;
  let sy = v.y;
  let found = false;
  for (let s = 0; s < 60; s++) {
    sx += dx * 4;
    sy += dy * 4;
    if (elev(sx, sy) < SEA) {
      found = true;
      break;
    }
  }
  if (!found) return;
  const r = cellRng(v.cx, v.cy, SEED + 81);
  const tx = -dy;
  const ty = dx;
  // Stone quay along the shore.
  ctx.strokeStyle = '#a49a86';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sx - tx * 30 - dx * 3, sy - ty * 30 - dy * 3);
  ctx.lineTo(sx + tx * 30 - dx * 3, sy + ty * 30 - dy * 3);
  ctx.stroke();
  const piers = r.int(2, 4);
  for (let i = 0; i < piers; i++) {
    const off = (i / (piers - 1 || 1) - 0.5) * 48;
    const L = r.range(20, 38);
    const px0 = sx + tx * off - dx * 3;
    const py0 = sy + ty * off - dy * 3;
    const px1 = px0 + dx * L;
    const py1 = py0 + dy * L;
    pier(ctx, px0, py0, px1, py1, 3);
    const ang = Math.atan2(dy, dx);
    for (let b = 0; b < 2; b++) {
      if (r.next() < 0.3) continue;
      const along = r.range(0.35, 0.9) * L;
      const sd = b ? 4.5 : -4.5;
      const bx = px0 + dx * along + tx * sd;
      const by = py0 + dy * along + ty * sd;
      if (elev(bx, by) > SEA - 0.002) continue;
      boat(ctx, bx, by, ang + (r.next() < 0.5 ? 0 : Math.PI), r.range(8, 13), '#6a4628', r.next() < 0.7 ? '#efe4cc' : null, 0);
    }
  }
  // Lighthouse at the harbor mouth.
  if (r.next() < 0.6) {
    const lx = sx + tx * 34 + dx * 10;
    const ly = sy + ty * 34 + dy * 10;
    house(ctx, lx, ly, 5, 5, 0, '#e8e0d0', { height: 9 });
    ctx.fillStyle = '#b5523f';
    ctx.beginPath();
    ctx.arc(lx, ly, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // Big steamer at anchor in the roads.
  if (r.next() < 0.5) {
    const bx = sx + dx * 60 + tx * r.range(-30, 30);
    const by = sy + dy * 60 + ty * r.range(-30, 30);
    if (elev(bx, by) < SEA - 0.01) {
      const a = Math.atan2(ty, tx) + r.range(-0.3, 0.3);
      boat(ctx, bx, by, a, 26, '#3d3434', null, 0);
      anchors.add(A.STEAM, bx - Math.cos(a) * 1.3, by - Math.sin(a) * 1.3, 0.8, r.next());
    }
  }
}
