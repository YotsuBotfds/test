// Smog Wastes ground painter (WP6): a dense, soot-stained factory city seen from above —
// a slanted street grid of tenement blocks, sawtooth-roofed mills, gasworks and coal yards,
// rail corridors with sidings, a murky canal with stone embankments, bridges and barges, and
// forests of chimneys whose smoke columns are animated by bg-anim.js.

import {
  TILE,
  A,
  fnoise,
  sampleField,
  blitField,
  strokeContour,
  cellRng,
  rand01,
  rgb,
  putMix,
  grainCanvas,
  fieldAt,
  isoDistance,
  isoDistanceAt,
} from './bg-util.js';
import { house, flatRoof, chimney, tank, ties, tree, bakedGlow } from './bg-props.js';

const SEED = 2711;
const ANG = -0.24; // city grid rotation
const CA = Math.cos(ANG);
const SA = Math.sin(ANG);
const B = 96; // block pitch
const ST = 10; // street width
const AVE = 5; // every Nth line is an avenue
const RAIL = 7; // every Nth u-line is a rail corridor
const CANAL_D = 15; // canal half-width (ground units)

/** Canal field: the canal runs where this is near 0.5. */
export function canalField(x, y) {
  const wx = fnoise(x / 2200 + 5, y / 2200, 2, SEED + 7) - 0.5;
  return fnoise(x / 1250 + wx * 0.9, y / 1250 - wx * 0.6, 3, SEED + 3);
}
const district = (x, y) => fnoise(x / 1100 + 9, y / 1100 - 3, 3, SEED + 11);
const grime = (x, y) => fnoise(x / 160, y / 160, 3, SEED + 13);

const toU = (x, y) => x * CA + y * SA;
const toV = (x, y) => -x * SA + y * CA;
const toX = (u, v) => u * CA - v * SA;
const toY = (u, v) => u * SA + v * CA;

const ROOFS = ['#5d6068', '#6b4a3a', '#7a5a46', '#4a4743', '#6a6458', '#5a4c42', '#73685a'];
const FACT = ['#5a5550', '#4f4a44', '#62574a', '#56524a'];
const BASE_DARK = rgb('#3d3a31');
const BASE_LIGHT = rgb('#5e594b');
const WATER = rgb('#3f4a37');
const WATER_HI = rgb('#5c6648');

/** True when (x, y) lies within the canal (grown by `pad` ground units). */
function inCanal(x, y, pad = 0) {
  return isoDistanceAt(canalField, x, y, 0.5) < CANAL_D + pad;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./bg-util.js').Anchors} anchors
 */
export function* paint(ctx, X0, Y0, anchors) {
  const G = sampleField(X0, Y0, 16, 2, grime);
  const C = sampleField(X0, Y0, 8, 3, canalField);
  const CD = isoDistance(C, 0.5);
  yield;

  // 1. Cobbles & soot.
  blitField(ctx, G, (k, i, j, px, p) =>
    putMix(px, p, BASE_DARK, BASE_LIGHT, G.data[k] * 1.4 - 0.25)
  );

  // Block range in grid space (u, v), covering the tile corners plus a block of margin.
  const us = [toU(X0, Y0), toU(X0 + TILE, Y0), toU(X0, Y0 + TILE), toU(X0 + TILE, Y0 + TILE)];
  const vs = [toV(X0, Y0), toV(X0 + TILE, Y0), toV(X0, Y0 + TILE), toV(X0 + TILE, Y0 + TILE)];
  const bu0 = Math.floor(Math.min(...us) / B) - 1;
  const bu1 = Math.floor(Math.max(...us) / B) + 1;
  const bv0 = Math.floor(Math.min(...vs) / B) - 1;
  const bv1 = Math.floor(Math.max(...vs) / B) + 1;

  ctx.save();
  ctx.rotate(ANG);
  // 2. Rail corridors (gravel beds) along every RAIL-th u-line.
  for (let bu = bu0; bu <= bu1; bu++) {
    if (((bu % RAIL) + RAIL) % RAIL !== 0) continue;
    const u = bu * B - ST / 2;
    ctx.fillStyle = '#5a5244';
    ctx.fillRect(u - 12, bv0 * B, 24, (bv1 - bv0 + 1) * B);
    ctx.strokeStyle = 'rgba(30,24,18,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(u - 12, bv0 * B, 24, (bv1 - bv0 + 1) * B);
  }
  yield;

  // 3. City blocks.
  for (let bv = bv0; bv <= bv1; bv++) {
    for (let bu = bu0; bu <= bu1; bu++) {
      drawBlock(ctx, bu, bv, anchors);
    }
    if ((bv - bv0) % 2 === 1) yield;
  }
  yield;

  // 4. Rails on top of the gravel (tracks, ties).
  for (let bu = bu0; bu <= bu1; bu++) {
    if (((bu % RAIL) + RAIL) % RAIL !== 0) continue;
    const u = bu * B - ST / 2;
    const v0 = bv0 * B;
    const v1 = (bv1 + 1) * B;
    for (const off of [-6, 6]) {
      ties(ctx, u + off, v0, u + off, v1, 3, 3.2, 'rgba(58,40,26,0.85)');
      ctx.strokeStyle = '#8e8a84';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(u + off - 1.6, v0);
      ctx.lineTo(u + off - 1.6, v1);
      ctx.moveTo(u + off + 1.6, v0);
      ctx.lineTo(u + off + 1.6, v1);
      ctx.stroke();
    }
    // A goods train somewhere along the line.
    const r = cellRng(bu, 0, SEED + 91);
    if (r.next() < 0.7) {
      const start = (Math.floor((bv0 * B) / 900) + r.int(0, 1)) * 900 + r.range(0, 400);
      const cars = r.int(6, 14);
      const off = r.next() < 0.5 ? -6 : 6;
      for (let c = 0; c < cars; c++) {
        const v = start + c * 13;
        const col = c === 0 ? '#2a2826' : ['#6b3b2a', '#5a5a5a', '#3b3a36', '#7a5a3a'][r.int(0, 3)];
        flatRoof(ctx, u + off - 3.4, v, 6.8, 11.5, col, { height: 2, ink: 0.5 });
        if (c === 0) anchors.add(A.STEAM, toX(u + off, v + 2), toY(u + off, v + 2), 0.45, r.next());
      }
    }
  }
  ctx.restore();
  yield;

  // 5. The canal cuts through everything: water, embankments, bridges & barges.
  const cd = CD.data;
  blitField(ctx, CD, (k, i, j, px, p) => {
    const d = cd[k];
    if (d > CANAL_D + 3) {
      px[p + 3] = 0;
      return;
    }
    const edge = Math.min(1, (CANAL_D + 3 - d) / 6);
    putMix(px, p, WATER_HI, WATER, 1 - d / CANAL_D, 255 * edge);
  });
  strokeContour(ctx, CD, CANAL_D, '#a59c88', 2.6, 0.95);
  strokeContour(ctx, CD, CANAL_D - 2.5, '#202419', 0.9, 0.55);
  strokeContour(ctx, CD, CANAL_D * 0.35, '#7c8664', 0.6, 0.22);
  drawBridges(ctx, X0, Y0, bu0, bu1, bv0, bv1);
  drawBarges(ctx, X0, Y0, C, CD);
  yield;

  // 6. Soot blooms & grain.
  const r = cellRng(Math.floor(X0 / TILE), Math.floor(Y0 / TILE), SEED + 99);
  for (let i = 0; i < 5; i++) {
    bakedGlow(ctx, X0 + r.range(0, TILE), Y0 + r.range(0, TILE), r.range(60, 160), '#14100a', 0.22);
  }
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = ctx.createPattern(grainCanvas(11), 'repeat');
  ctx.fillRect(X0, Y0, TILE, TILE);
  ctx.globalAlpha = 1;
}

/** Street width of the line before index `i` (avenues are wider). */
function streetW(i) {
  return ((i % AVE) + AVE) % AVE === 0 ? ST * 1.8 : ST;
}

function drawBlock(ctx, bu, bv, anchors) {
  const railL = ((bu % RAIL) + RAIL) % RAIL === 0;
  const pl = railL ? 14 : streetW(bu) / 2;
  const pr = (((bu + 1) % RAIL) + RAIL) % RAIL === 0 ? 14 : streetW(bu + 1) / 2;
  const pt = streetW(bv) / 2;
  const pb = streetW(bv + 1) / 2;
  const u = bu * B - ST / 2 + pl;
  const v = bv * B - ST / 2 + pt;
  const w = B - pl - pr;
  const h = B - pt - pb;
  const cx = toX(u + w / 2, v + h / 2);
  const cy = toY(u + w / 2, v + h / 2);
  const r = cellRng(bu, bv, SEED + 21);
  // Pavement kerb.
  ctx.fillStyle = '#6f6a5c';
  ctx.fillRect(u - 1.5, v - 1.5, w + 3, h + 3);
  ctx.fillStyle = '#3a372f';
  ctx.fillRect(u, v, w, h);
  if (inCanal(cx, cy, 10)) return; // embankment lots: left as paved quays
  const d = district(cx, cy);
  const roll = r.next();
  if (d > 0.52 || (d > 0.4 && roll < 0.45)) {
    const kind = r.next();
    if (kind < 0.1) gasworks(ctx, u, v, w, h, r, anchors);
    else if (kind < 0.2) coalYard(ctx, u, v, w, h, r, anchors);
    else if (kind < 0.32) warehouses(ctx, u, v, w, h, r);
    else factory(ctx, u, v, w, h, r, anchors);
  } else if (roll < 0.04) {
    domedHall(ctx, u, v, w, h, r);
  } else if (roll < 0.08) {
    // A sooty little park.
    ctx.fillStyle = '#4c5638';
    ctx.fillRect(u + 2, v + 2, w - 4, h - 4);
    for (let i = 0; i < 8; i++) {
      tree(ctx, u + r.range(6, w - 6), v + r.range(6, h - 6), r.range(3, 5), '#3f4a2e', '#5a6640');
    }
  } else {
    tenements(ctx, u, v, w, h, r, anchors);
  }
}

function addSmoke(anchors, u, v, size, r, dark) {
  anchors.add(A.SMOKE, toX(u, v), toY(u, v), size, dark ? 0.5 + r.next() * 0.5 : r.next() * 0.5);
}

function tenements(ctx, u, v, w, h, r, anchors) {
  const depth = r.range(19, 25);
  // Courtyard: back yards split by walls, with sheds and privies.
  const iw = w - depth * 2;
  const ih = h - depth * 2;
  ctx.fillStyle = '#4a4537';
  ctx.fillRect(u + depth, v + depth, iw, ih);
  ctx.strokeStyle = 'rgba(30,24,16,0.55)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let x = u + depth + r.range(6, 10); x < u + w - depth - 3; x += r.range(7, 11)) {
    ctx.moveTo(x, v + depth);
    ctx.lineTo(x, v + depth + ih * 0.42);
    ctx.moveTo(x, v + h - depth);
    ctx.lineTo(x, v + h - depth - ih * 0.42);
  }
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    flatRoof(
      ctx,
      u + depth + r.range(1, iw - 6),
      v + depth + r.range(1, ih - 6),
      r.range(3, 6),
      r.range(3, 5),
      r.next() < 0.5 ? '#5a4c42' : '#4f4a44',
      { height: 1.5, ink: 0.4 }
    );
  }
  const roofBase = ROOFS[r.int(0, ROOFS.length - 1)];
  const row = (x0, y0, len, horiz) => {
    let s = 0;
    while (s < len - 4) {
      const L = Math.min(len - s, r.range(9, 18));
      const roof = r.next() < 0.7 ? roofBase : ROOFS[r.int(0, ROOFS.length - 1)];
      const hx = horiz ? x0 + s + L / 2 : x0 + depth / 2;
      const hy = horiz ? y0 + depth / 2 : y0 + s + L / 2;
      house(ctx, hx, hy, horiz ? L - 0.6 : depth - 1, horiz ? depth - 1 : L - 0.6, 0, roof, {
        height: 4,
      });
      if (r.next() < 0.35) {
        const ox = horiz ? hx + r.range(-L / 3, L / 3) : hx + r.range(-3, 3);
        const oy = horiz ? hy + r.range(-3, 3) : hy + r.range(-L / 3, L / 3);
        ctx.fillStyle = '#5a3a2a';
        ctx.fillRect(ox - 1.2, oy - 1.2, 2.4, 2.4);
        ctx.fillStyle = '#1a120a';
        ctx.fillRect(ox - 0.6, oy - 0.6, 1.2, 1.2);
      }
      s += L;
    }
  };
  row(u, v, w, true);
  row(u, v + h - depth, w, true);
  row(u, v + depth, h - depth * 2, false);
  row(u + w - depth, v + depth, h - depth * 2, false);
  // Laundry lines & sheds in the courtyard.
  if (r.next() < 0.6) {
    flatRoof(ctx, u + depth + 3, v + depth + 3, r.range(6, 12), r.range(5, 9), '#4f4a44', {
      height: 2,
    });
  }
  if (r.next() < 0.15) addSmoke(anchors, u + depth / 2, v + depth / 2, 0.5, r, false);
}

function warehouses(ctx, u, v, w, h, r) {
  const n = r.int(2, 3);
  const vertical = r.next() < 0.5;
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const col = ['#6b4a3a', '#5d6068', '#73685a'][r.int(0, 2)];
    if (vertical)
      house(ctx, u + w * (t0 + 0.5 / n), v + h / 2, w / n - 3, h - 6, 0, col, { height: 5 });
    else house(ctx, u + w / 2, v + h * (t0 + 0.5 / n), w - 6, h / n - 3, 0, col, { height: 5 });
  }
}

function domedHall(ctx, u, v, w, h, r) {
  // Civic landmark: colonnaded hall with a verdigris dome and a clock tower.
  flatRoof(ctx, u + 4, v + 4, w - 8, h - 8, '#8a7f6c', { height: 6 });
  const cx = u + w / 2;
  const cy = v + h / 2;
  tank(ctx, cx, cy, Math.min(w, h) * 0.3, '#5f8f7a', { height: 10, ribs: 12 });
  ctx.fillStyle = '#c9973f';
  ctx.beginPath();
  ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
  ctx.fill();
  house(ctx, u + 12, v + 12, 9, 9, 0, '#6b4a3a', { height: 16 });
  void r;
}

function factory(ctx, u, v, w, h, r, anchors) {
  const split = r.next() < 0.5;
  const halls = split ? 2 : 1;
  for (let i = 0; i < halls; i++) {
    const hw = split ? w / 2 - 2 : w - 4;
    const x = u + 2 + i * (w / 2);
    const vertical = r.next() < 0.5;
    const col = FACT[r.int(0, FACT.length - 1)];
    flatRoof(ctx, x, v + 2, hw, h * r.range(0.55, 0.8), col, {
      height: 6,
      stripes: r.int(4, 8),
      vertical,
      glass: 'rgba(170,180,160,0.32)',
    });
  }
  // Lean-to sheds along the bottom.
  flatRoof(ctx, u + 3, v + h - 16, w * r.range(0.3, 0.6), 12, '#6b4a3a', { height: 3 });
  // Chimney stacks.
  const n = r.int(1, 4);
  for (let i = 0; i < n; i++) {
    const cu = u + r.range(8, w - 8);
    const cv = v + h - r.range(6, 22);
    const rad = r.range(3.2, 5.2);
    chimney(ctx, cu, cv, rad, {
      height: 18 + rad * 3,
      color: r.next() < 0.6 ? '#7a4030' : '#5a5550',
    });
    addSmoke(anchors, cu, cv, 0.9 + rad * 0.08, r, r.next() < 0.6);
  }
  if (r.next() < 0.5)
    anchors.add(
      A.FURNACE,
      toX(u + w * 0.5, v + h * 0.4),
      toY(u + w * 0.5, v + h * 0.4),
      0.5,
      r.next()
    );
}

function gasworks(ctx, u, v, w, h, r, anchors) {
  ctx.fillStyle = '#3f3b31';
  ctx.fillRect(u + 1, v + 1, w - 2, h - 2);
  const n = r.int(1, 3);
  const rad = Math.min(w, h) / (n === 1 ? 2.6 : 4.2);
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? u + w / 2 : u + rad + 3 + (i % 2) * (w - rad * 2 - 6);
    const y =
      n === 1
        ? v + h / 2
        : v +
          rad +
          3 +
          Math.floor(i / 2) * (h - rad * 2 - 6) +
          (n === 2 ? (h - rad * 2 - 6) * 0.5 * i : 0);
    tank(ctx, x, y, rad, r.next() < 0.5 ? '#7a5a46' : '#6b6a66', { height: rad * 0.7, ribs: 16 });
  }
  if (n < 3) {
    flatRoof(ctx, u + w - 22, v + h - 18, 18, 14, '#5d6068', { height: 4 });
    chimney(ctx, u + w - 10, v + h - 22, 3, { height: 14 });
    addSmoke(anchors, u + w - 10, v + h - 22, 0.8, r, false);
  }
}

function coalYard(ctx, u, v, w, h, r, anchors) {
  ctx.fillStyle = '#2a2622';
  ctx.fillRect(u + 1, v + 1, w - 2, h - 2);
  // Coal heaps.
  for (let i = 0; i < 6; i++) {
    const x = u + r.range(10, w - 10);
    const y = v + r.range(10, h - 10);
    const rad = r.range(5, 11);
    const g = ctx.createRadialGradient(x - rad * 0.3, y - rad * 0.3, 0, x, y, rad);
    g.addColorStop(0, '#4a4642');
    g.addColorStop(1, '#151311');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  // Crates & a gantry crane.
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = ['#7a5a3a', '#6e4723', '#8a6a42'][r.int(0, 2)];
    ctx.fillRect(u + r.range(4, w - 8), v + r.range(4, h - 8), 3.5, 3.5);
  }
  const cu = u + r.range(15, w - 15);
  ctx.strokeStyle = '#8c2f2b';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cu, v + 4);
  ctx.lineTo(cu, v + h - 4);
  ctx.moveTo(cu + 8, v + 4);
  ctx.lineTo(cu + 8, v + h - 4);
  ctx.stroke();
  ctx.lineWidth = 0.8;
  ties(ctx, cu, v + 4, cu, v + h - 4, 5, 0, '#000');
  flatRoof(ctx, cu - 2, v + r.range(10, h - 20), 12, 6, '#c9973f', { height: 8, ink: 0.5 });
  if (r.next() < 0.5) addSmoke(anchors, u + w - 8, v + 8, 0.6, r, true);
}

function drawBridges(ctx, X0, Y0, bu0, bu1, bv0, bv1) {
  // Avenues (both directions) bridge the canal: walk each avenue centre-line and draw a deck
  // over every stretch that crosses water.
  ctx.lineCap = 'butt';
  const lines = [];
  for (let bu = bu0; bu <= bu1; bu++) {
    if (((bu % AVE) + AVE) % AVE === 0 || ((bu % RAIL) + RAIL) % RAIL === 0)
      lines.push(['u', bu * B - ST / 2, bv0 * B, (bv1 + 1) * B]);
  }
  for (let bv = bv0; bv <= bv1; bv++) {
    if (((bv % AVE) + AVE) % AVE === 0) lines.push(['v', bv * B - ST / 2, bu0 * B, (bu1 + 1) * B]);
  }
  for (const [axis, c, s0, s1] of lines) {
    let runStart = null;
    for (let s = s0; s <= s1 + 3; s += 3) {
      const u = axis === 'u' ? c : s;
      const v = axis === 'u' ? s : c;
      const x = toX(u, v);
      const y = toY(u, v);
      const wet =
        s <= s1 &&
        x > X0 - 40 &&
        x < X0 + TILE + 40 &&
        y > Y0 - 40 &&
        y < Y0 + TILE + 40 &&
        inCanal(x, y, 4);
      if (wet && runStart === null) runStart = s;
      if (!wet && runStart !== null) {
        const a = runStart - 4;
        const b = s + 1;
        const p0 = axis === 'u' ? [toX(c, a), toY(c, a)] : [toX(a, c), toY(a, c)];
        const p1 = axis === 'u' ? [toX(c, b), toY(c, b)] : [toX(b, c), toY(b, c)];
        ctx.strokeStyle = 'rgba(10,12,6,0.45)';
        ctx.lineWidth = 15;
        ctx.beginPath();
        ctx.moveTo(p0[0] + 2, p0[1] + 3);
        ctx.lineTo(p1[0] + 2, p1[1] + 3);
        ctx.stroke();
        ctx.strokeStyle = '#7d766a';
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p1[0], p1[1]);
        ctx.stroke();
        ctx.strokeStyle = '#a49c8a';
        ctx.lineWidth = 10;
        ctx.stroke();
        ctx.strokeStyle = '#5e594b';
        ctx.lineWidth = 7;
        ctx.stroke();
        runStart = null;
      }
    }
  }
  ctx.lineCap = 'round';
}

function drawBarges(ctx, X0, Y0, C, CD) {
  const cell = 140;
  for (let cy = Math.floor(Y0 / cell); cy <= Math.floor((Y0 + TILE) / cell); cy++) {
    for (let cx = Math.floor(X0 / cell); cx <= Math.floor((X0 + TILE) / cell); cx++) {
      if (rand01(cx, cy, SEED + 51) > 0.7) continue;
      const x = (cx + rand01(cx, cy, SEED + 52)) * cell;
      const y = (cy + rand01(cx, cy, SEED + 53)) * cell;
      if (fieldAt(CD, x, y) > CANAL_D * 0.4) continue;
      // Align with the canal: perpendicular to the field gradient.
      const gx = fieldAt(C, x + 4, y) - fieldAt(C, x - 4, y);
      const gy = fieldAt(C, x, y + 4) - fieldAt(C, x, y - 4);
      const ang = Math.atan2(gx, -gy);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.fillStyle = 'rgba(10,12,6,0.4)';
      ctx.fillRect(-11, -2.4, 24, 6);
      ctx.fillStyle = '#3a2a1e';
      ctx.fillRect(-12, -3, 24, 6);
      ctx.fillStyle = '#1e1a16';
      ctx.fillRect(-9, -2, 15, 4);
      ctx.fillStyle = '#6e4723';
      ctx.fillRect(7, -2.4, 4, 4.8);
      ctx.restore();
    }
  }
}
