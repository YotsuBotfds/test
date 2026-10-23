// Tempest Reach ground painter (WP6): a dark, heaving storm sea seen from above — long swell
// bands driven by the gale, spindrift streaks and whitecaps, jagged rocky islets ringed with
// surf, sea stacks, lighthouses with sweeping beams, storm-tossed ships and the odd wreck.

import {
  TILE,
  A,
  fnoise,
  sampleField,
  blitField,
  strokeContour,
  forCells,
  cellRng,
  rgb,
  ramp,
  putRamp,
  grainCanvas,
  touchesTile,
  fieldAt,
} from './bg-util.js';
import { house, boat } from './bg-props.js';

const SEED = 4111;
const T = 0.712; // islet threshold (~5% of the sea is rock)
const WIND = -0.42; // prevailing wind direction (radians) — swells run across it
const WX = Math.cos(WIND);
const WY = Math.sin(WIND);

/** Islet height: sparse clusters of rocks in open water. */
export function isle(x, y) {
  const cluster = fnoise(x / 2200 + 3, y / 2200 - 8, 2, SEED + 1) - 0.5;
  return fnoise(x / 300, y / 300, 5, SEED) + cluster * 0.22;
}

/** High-frequency crag detail for rock texture. */
const crag = (x, y) => fnoise(x / 26, y / 26, 3, SEED + 9);

/** Swell: long crests perpendicular to the wind. */
function swell(x, y) {
  const u = x * WX + y * WY; // along wind
  const v = -x * WY + y * WX; // along crest
  return fnoise(u / 90, v / 520, 3, SEED + 5) * 0.65 + fnoise(x / 900, y / 900, 2, SEED + 6) * 0.35;
}

const SEA = ramp([
  [0.0, '#16222e'],
  [0.35, '#1d2d3c'],
  [0.6, '#26394b'],
  [0.8, '#30485b'],
  [1.0, '#3d5a6c'],
]);
const SHALLOW = rgb('#3a6468');
const ROCK = ramp([
  [0.0, '#2b2a2b'],
  [0.3, '#45433f'],
  [0.55, '#5c5a52'],
  [0.75, '#56603f'],
  [1.0, '#6c7650'],
]);

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./bg-util.js').Anchors} anchors
 */
export function* paint(ctx, X0, Y0, anchors) {
  const S = sampleField(X0, Y0, 8, 3, swell);
  yield;
  const E = sampleField(X0, Y0, 4, 6, isle);
  const K = sampleField(X0, Y0, 4, 6, crag);
  yield;

  // 1. Storm sea: swell bands, darker troughs, teal shallows around the rocks.
  const sd = S.data;
  const ed = E.data;
  blitField(ctx, S, (k, i, j, px, p) => {
    const v = (sd[k] - 0.3) / 0.45;
    putRamp(px, p, SEA, v);
    const e = fieldAt(E, S.x0 + i * S.cell, S.y0 + j * S.cell);
    if (e > T - 0.09) {
      const t = Math.min(1, (e - (T - 0.09)) / 0.09) * 0.75;
      px[p] += (SHALLOW[0] - px[p]) * t;
      px[p + 1] += (SHALLOW[1] - px[p + 1]) * t;
      px[p + 2] += (SHALLOW[2] - px[p + 2]) * t;
    }
  });
  // Swell crest lines.
  strokeContour(ctx, S, 0.62, '#9fb8c8', 1.2, 0.16);
  strokeContour(ctx, S, 0.55, '#9fb8c8', 0.8, 0.08);
  yield;

  // 2. Spindrift streaks (long, faint, along the wind) & whitecaps on the crests.
  const rT = cellRng(Math.floor(X0 / TILE), Math.floor(Y0 / TILE), SEED + 31);
  ctx.strokeStyle = 'rgba(220,235,245,0.09)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  forCells(X0, Y0, 64, 80, (cx, cy) => {
    const r = cellRng(cx, cy, SEED + 33);
    if (r.next() > 0.45) return;
    const x = (cx + r.next()) * 64;
    const y = (cy + r.next()) * 64;
    const L = r.range(40, 120);
    ctx.moveTo(x, y);
    ctx.lineTo(x + WX * L, y + WY * L);
  });
  ctx.stroke();
  const caps = [new Path2D(), new Path2D(), new Path2D()];
  forCells(X0, Y0, 18, 12, (cx, cy) => {
    const r = cellRng(cx, cy, SEED + 35);
    const x = (cx + r.next()) * 18;
    const y = (cy + r.next()) * 18;
    const sv = fieldAt(S, x, y);
    if (r.next() > (sv - 0.45) * 2.2) return;
    if (fieldAt(E, x, y) > T - 0.01) return;
    const L = r.range(1.5, 5);
    const path = caps[r.int(0, 2)];
    // Broken foam dash lying along the crest.
    path.moveTo(x - WY * L, y + WX * L);
    path.lineTo(x + WY * L, y - WX * L);
  });
  ctx.lineWidth = 0.9;
  ['rgba(235,245,250,0.55)', 'rgba(235,245,250,0.35)', 'rgba(235,245,250,0.2)'].forEach((c, i) => {
    ctx.strokeStyle = c;
    ctx.stroke(caps[i]);
  });
  // Animated whitecaps.
  for (let i = 0; i < 26; i++) {
    const x = X0 + rT.range(0, TILE);
    const y = Y0 + rT.range(0, TILE);
    if (fieldAt(E, x, y) < T - 0.02) anchors.add(A.CAP, x, y, rT.range(0.6, 1.2), rT.next());
  }
  yield;

  // 3. Rocky islets with hill shading.
  const n = E.n;
  blitField(ctx, E, (k, i, j, px, p) => {
    const e = ed[k];
    if (e < T - 0.004) {
      px[p + 3] = 0;
      return;
    }
    const gx = ed[Math.min(k + 1, ed.length - 1)] - ed[Math.max(k - 1, 0)];
    const gy = ed[Math.min(k + n, ed.length - 1)] - ed[Math.max(k - n, 0)];
    const h = (e - T) / 0.08 + (K.data[k] - 0.5) * 0.9;
    putRamp(px, p, ROCK, h);
    const kx = K.data[Math.min(k + 1, ed.length - 1)] - K.data[Math.max(k - 1, 0)];
    const ky = K.data[Math.min(k + n, ed.length - 1)] - K.data[Math.max(k - n, 0)];
    const sh = Math.max(-1, Math.min(1, -(gx + gy) * 22 - (kx + ky) * 5));
    const f = 1 + sh * 0.5;
    px[p] *= f;
    px[p + 1] *= f;
    px[p + 2] *= f;
    px[p + 3] = 255 * Math.min(1, (e - (T - 0.004)) / 0.004);
  });
  // Ink edge, then surf rings breaking against the rock.
  strokeContour(ctx, E, T, '#0b1016', 1.6, 0.7);
  strokeContour(ctx, E, T - 0.005, '#f2f8fb', 2.4, 0.85);
  strokeContour(ctx, E, T - 0.014, '#e6f0f6', 1.5, 0.45);
  strokeContour(ctx, E, T - 0.03, '#d6e4ee', 1.1, 0.22);
  strokeContour(ctx, E, T - 0.052, '#c8d8e4', 0.9, 0.1);
  // Cliff relief lines on the bigger islands.
  strokeContour(ctx, E, T + 0.035, '#1c1b1a', 0.8, 0.35);
  strokeContour(ctx, E, T + 0.07, '#1c1b1a', 0.7, 0.3);
  yield;

  // 4. Sea stacks just offshore: little clusters of rock with broken surf on the windward side.
  forCells(X0, Y0, 56, 12, (cx, cy) => {
    const r = cellRng(cx, cy, SEED + 41);
    const x = (cx + r.next()) * 56;
    const y = (cy + r.next()) * 56;
    const e = fieldAt(E, x, y);
    if (e < T - 0.035 || e > T - 0.008 || r.next() > 0.3) return;
    const n = r.int(1, 3);
    for (let i = 0; i < n; i++) {
      const sx = x + r.range(-4, 4);
      const sy = y + r.range(-4, 4);
      const rad = r.range(1.4, 3.2);
      // Surf: a partial arc facing into the wind.
      ctx.strokeStyle = 'rgba(235,244,250,0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      const a0 = WIND + Math.PI;
      ctx.arc(sx, sy, rad + 1.5, a0 - 1.2, a0 + 1.2);
      ctx.stroke();
      ctx.fillStyle = '#34322f';
      ctx.beginPath();
      ctx.moveTo(sx + rad, sy);
      for (let k = 1; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const rr = rad * r.range(0.7, 1.15);
        ctx.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#5c5a52';
      ctx.beginPath();
      ctx.arc(sx - rad * 0.3, sy - rad * 0.3, rad * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // 5. Lighthouses on island summits.
  const LC = 760;
  forCells(X0, Y0, LC, 60, (cx, cy) => {
    const r = cellRng(cx, cy, SEED + 51);
    let best = -1;
    let bx = 0;
    let by = 0;
    for (let i = 0; i < 18; i++) {
      const x = (cx + r.range(0.1, 0.9)) * LC;
      const y = (cy + r.range(0.1, 0.9)) * LC;
      const e = isle(x, y);
      if (e > best) {
        best = e;
        bx = x;
        by = y;
      }
    }
    if (best < T + 0.03 || !touchesTile(X0, Y0, bx, by, 40)) return;
    lighthouse(ctx, bx, by, r);
    anchors.add(A.BEACON, bx, by, 1, r.next());
  });

  // 6. Storm-tossed ships and wrecks.
  const SC = 420;
  forCells(X0, Y0, SC, 80, (cx, cy) => {
    const r = cellRng(cx, cy, SEED + 61);
    if (r.next() > 0.32) return;
    const x = (cx + r.range(0.2, 0.8)) * SC;
    const y = (cy + r.range(0.2, 0.8)) * SC;
    if (!touchesTile(X0, Y0, x, y, 70)) return;
    const e = isle(x, y);
    if (e > T - 0.012 && e < T + 0.02 && r.next() < 0.6) {
      wreck(ctx, x, y, r.angle(), r);
      return;
    }
    if (e > T - 0.04) return;
    const ang = WIND + r.range(-1.1, 1.1) + (r.next() < 0.3 ? Math.PI : 0);
    const steam = r.next() < 0.35;
    boat(
      ctx,
      x,
      y,
      ang,
      r.range(14, 22),
      steam ? '#2f2a28' : '#4a3424',
      steam ? null : '#cfc8b4',
      1.3,
      {
        wakeColor: 'rgba(230,240,248,0.45)',
      }
    );
    if (steam) anchors.add(A.STEAM, x, y, 0.7, r.next());
  });

  ctx.globalAlpha = 0.35;
  ctx.fillStyle = ctx.createPattern(grainCanvas(17), 'repeat');
  ctx.fillRect(X0, Y0, TILE, TILE);
  ctx.globalAlpha = 1;
}

function lighthouse(ctx, x, y, r) {
  // Keeper's cottage & path.
  const a = r.angle();
  const hx = x + Math.cos(a) * 14;
  const hy = y + Math.sin(a) * 14;
  ctx.strokeStyle = 'rgba(200,190,160,0.6)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  house(ctx, hx, hy, 9, 5.5, a, '#7a3a2e', { height: 3 });
  // Tower: long shadow, striped drum, lantern gallery.
  ctx.strokeStyle = 'rgba(5,8,12,0.5)';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 16, y + 21);
  ctx.stroke();
  ctx.fillStyle = '#e9e4d8';
  ctx.beginPath();
  ctx.arc(x, y, 5.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#a63a2c';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#1a120a';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.arc(x, y, 5.6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#2a2622';
  ctx.beginPath();
  ctx.arc(x, y, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffe9a0';
  ctx.beginPath();
  ctx.arc(x, y, 1.6, 0, Math.PI * 2);
  ctx.fill();
}

function wreck(ctx, x, y, ang, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = 'rgba(230,240,248,0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 16, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3a2a1e';
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(4, -4);
  ctx.lineTo(-9, -3.5);
  ctx.lineTo(-6, 0.5);
  ctx.lineTo(-10, 3.5);
  ctx.lineTo(4, 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#1a120a';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.strokeStyle = '#6e4723';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let i = -6; i < 8; i += 2.5) {
    ctx.moveTo(i, -3.4);
    ctx.lineTo(i + 0.5, 3.4);
  }
  ctx.moveTo(-2, 0);
  ctx.lineTo(r.range(10, 16), r.range(-8, 8));
  ctx.stroke();
  ctx.restore();
}
