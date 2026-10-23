// Furnace Crown ground painter (WP6): the Syndicate's volcanic heartland seen from above —
// black basalt split by glowing fissures, braided rivers of molten iron with cooling crust
// plates, bubbling slag pools, and iron foundries (sheds, crucibles, pipes, stacks) hugging
// the lava banks. bg-anim.js pulses the lava, pools, furnace mouths and ember smoke.

import {
  TILE,
  A,
  fnoise,
  sampleField,
  makeField,
  fillRows,
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
  isoDistance,
  isoDistanceAt,
} from './bg-util.js';
import { flatRoof, chimney, tank, bakedGlow } from './bg-props.js';

const SEED = 7919;
const LAVA_D = 10; // half-width of the molten channel (ground units, before width variation)
const GLOW_D = 70; // how far the heat glow reaches onto the rock

/** River field: lava flows where this is near 0.5. */
export function river(x, y) {
  const wx = fnoise(x / 1800 + 2, y / 1800, 2, SEED + 1) - 0.5;
  const wy = fnoise(x / 1800, y / 1800 - 6, 2, SEED + 2) - 0.5;
  const main = fnoise(x / 1500 + wx * 1.4, y / 1500 + wy * 1.4, 4, SEED);
  // Braided tributaries: a second, finer network merged in by taking the nearer channel.
  const trib = fnoise(x / 700 - wy, y / 700 + wx, 3, SEED + 3);
  // Unsigned merge (0.5 + nearest-channel value) so there is no jump where the two networks
  // hand over — a signed merge would draw phantom channels along that seam.
  return 0.5 + Math.min(Math.abs(main - 0.5), Math.abs(trib - 0.5) * 1.7);
}
/** River width multiplier: channels swell and narrow along their course. */
const widthMul = (x, y) => 0.7 + 0.75 * fnoise(x / 520 + 3, y / 520, 2, SEED + 13);

/**
 * Approximate distance (ground units, width-normalized) to the nearest lava channel centre:
 * |f − ½| / |∇f|. Unlike thresholding the raw field, this keeps channels a constant width
 * instead of ballooning into lakes where the noise is flat.
 */
export function riverDist(x, y) {
  return isoDistanceAt(river, x, y, 0.5) / widthMul(x, y);
}

const rock = (x, y) => fnoise(x / 180, y / 180, 4, SEED + 5);
const crust = (x, y) => fnoise(x / 58, y / 58, 3, SEED + 7);
const pools = (x, y) => fnoise(x / 230 + 7, y / 230 - 3, 3, SEED + 9);
const fissure = (x, y) => fnoise(x / 70, y / 70, 3, SEED + 11);

const ROCK = ramp([
  [0.0, '#0b0706'],
  [0.4, '#151010'],
  [0.7, '#241a17'],
  [1.0, '#382a24'],
]);
const LAVA = ramp([
  [0.0, '#ffe590'],
  [0.25, '#ffc04a'],
  [0.55, '#ff8a24'],
  [0.85, '#f05a14'],
  [1.0, '#b8300c'],
]);
const CRUST = rgb('#2a120a');
const GLOW = rgb('#8a2a0e');
const SLAG = ramp([
  [0.0, '#5a1a0c'],
  [0.4, '#c8401a'],
  [0.75, '#ff8a2a'],
  [1.0, '#ffb458'],
]);

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./bg-util.js').Anchors} anchors
 */
export function* paint(ctx, X0, Y0, anchors) {
  const R = makeField(X0, Y0, 4, 6);
  for (let j = 0; j < R.n; j += 50) {
    fillRows(R, river, j, j + 50);
    yield;
  }
  const D = isoDistance(R, 0.5, widthMul);
  yield;
  const K = makeField(X0, Y0, 4, 6);
  for (let j = 0; j < K.n; j += 70) {
    fillRows(K, crust, j, j + 70);
    yield;
  }
  const S = sampleField(X0, Y0, 8, 3, rock);
  const P = sampleField(X0, Y0, 8, 3, pools);
  yield;

  // 1. Basalt with relief, warmed by nearby lava.
  const sd = S.data;
  const n = S.n;
  blitField(ctx, S, (k, i, j, px, p) => {
    const gx = sd[Math.min(k + 1, sd.length - 1)] - sd[Math.max(k - 1, 0)];
    const gy = sd[Math.min(k + n, sd.length - 1)] - sd[Math.max(k - n, 0)];
    putRamp(px, p, ROCK, sd[k] * 1.3 - 0.15);
    const f = 1 + Math.max(-0.6, Math.min(0.8, -(gx + gy) * 12));
    px[p] *= f;
    px[p + 1] *= f;
    px[p + 2] *= f;
    const d = fieldAt(D, S.x0 + i * S.cell, S.y0 + j * S.cell);
    if (d < GLOW_D) {
      const t = (1 - d / GLOW_D) ** 2 * 0.85;
      px[p] += (GLOW[0] - px[p]) * t;
      px[p + 1] += (GLOW[1] - px[p + 1]) * t;
      px[p + 2] += (GLOW[2] - px[p + 2]) * t;
    }
  });
  // Glowing fissure network in the rock.
  const Fz = sampleField(X0, Y0, 8, 3, fissure);
  ctx.globalCompositeOperation = 'lighter';
  strokeContour(ctx, Fz, 0.5, '#ff4a12', 3, 0.12);
  strokeContour(ctx, Fz, 0.5, '#ffa040', 0.8, 0.32);
  ctx.globalCompositeOperation = 'source-over';
  strokeContour(ctx, S, 0.62, '#06030a', 0.8, 0.35);
  yield;

  // 2. Slag pools.
  const pd = P.data;
  blitField(ctx, P, (k, i, j, px, p) => {
    const v = pd[k];
    if (v < 0.762) {
      px[p + 3] = 0;
      return;
    }
    putRamp(px, p, SLAG, (v - 0.767) / 0.07, 255 * Math.min(1, (v - 0.762) / 0.008));
  });
  strokeContour(ctx, P, 0.767, '#1a0804', 2, 0.85);
  strokeContour(ctx, P, 0.752, '#ff5a1a', 1, 0.3);
  const rT = cellRng(Math.floor(X0 / TILE), Math.floor(Y0 / TILE), SEED + 21);
  let poolCount = 0;
  for (let i = 0; i < 60 && poolCount < 6; i++) {
    const x = X0 + rT.range(0, TILE);
    const y = Y0 + rT.range(0, TILE);
    if (fieldAt(P, x, y) > 0.785) {
      anchors.add(A.POOL, x, y, rT.range(0.8, 1.3), rT.next());
      poolCount++;
    }
  }
  yield;

  // 3. Molten rivers with drifting crust plates.
  const dd = D.data;
  const kd = K.data;
  blitField(ctx, D, (k, i, j, px, p) => {
    const d = dd[k];
    if (d > LAVA_D + 2) {
      px[p + 3] = 0;
      return;
    }
    const t = d / LAVA_D;
    putRamp(px, p, LAVA, t * 0.85 + (kd[k] - 0.5) * 0.5);
    // Cooled crust islands, more of them towards the banks.
    const c = kd[k] + t * 0.2;
    if (c > 0.6) {
      const q = Math.min(0.92, (c - 0.6) / 0.12);
      px[p] += (CRUST[0] - px[p]) * q;
      px[p + 1] += (CRUST[1] - px[p + 1]) * q;
      px[p + 2] += (CRUST[2] - px[p + 2]) * q;
    }
    px[p + 3] = 255 * Math.min(1, (LAVA_D + 2 - d) / 4);
  });
  strokeContour(ctx, D, LAVA_D, '#1a0804', 1.8, 0.85);
  strokeContour(ctx, D, LAVA_D + 7, '#ff6a1a', 1, 0.22);
  for (let i = 0, c = 0; i < 80 && c < 12; i++) {
    const x = X0 + rT.range(0, TILE);
    const y = Y0 + rT.range(0, TILE);
    if (fieldAt(D, x, y) < LAVA_D * 0.6) {
      anchors.add(A.LAVA, x, y, rT.range(0.7, 1.2), rT.next());
      c++;
    }
  }
  yield;

  // 4. Foundries along the banks.
  const FC = 150;
  forCells(X0, Y0, FC, FC, (cx, cy) => {
    const r = cellRng(cx, cy, SEED + 31);
    const x = (cx + r.range(0.2, 0.8)) * FC;
    const y = (cy + r.range(0.2, 0.8)) * FC;
    if (!touchesTile(X0, Y0, x, y, 90)) return;
    const d = riverDist(x, y);
    if (d < LAVA_D + 50 || d > 140 || pools(x, y) > 0.68 || r.next() < 0.25) return;
    foundry(ctx, x, y, r, anchors);
  });

  ctx.globalAlpha = 0.4;
  ctx.fillStyle = ctx.createPattern(grainCanvas(29), 'repeat');
  ctx.fillRect(X0, Y0, TILE, TILE);
  ctx.globalAlpha = 1;
}

function foundry(ctx, x, y, r, anchors) {
  const ang = r.range(-0.5, 0.5);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  // Yard: compacted ash with rails.
  ctx.fillStyle = '#2a201c';
  ctx.fillRect(-46, -34, 92, 68);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(-46, -34, 92, 68);
  ctx.strokeStyle = '#5b4a40';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(-46, 26);
  ctx.lineTo(46, 26);
  ctx.moveTo(-46, 29);
  ctx.lineTo(46, 29);
  ctx.stroke();
  // Main casting hall with a glowing roof vent.
  flatRoof(ctx, -40, -28, 50, 32, '#3a3434', {
    height: 7,
    stripes: 5,
    vertical: true,
    glass: 'rgba(255,120,40,0.35)',
  });
  bakedGlow(ctx, -15, -12, 26, '#ff6a1a', 0.35);
  anchors.add(A.FURNACE, ...rot(x, y, ang, -15, -12), 1.2, r.next());
  // Crucibles.
  for (let i = 0; i < 2; i++) {
    const tx = 22 + i * 13;
    const ty = -18;
    tank(ctx, tx, ty, 5.5, '#4a3a34', { height: 5, ribs: 8, frame: false });
    ctx.fillStyle = '#ffb040';
    ctx.beginPath();
    ctx.arc(tx, ty, 2.6, 0, Math.PI * 2);
    ctx.fill();
    anchors.add(A.FURNACE, ...rot(x, y, ang, tx, ty), 0.6, r.next());
  }
  // Ore sheds and copper pipes.
  flatRoof(ctx, 14, -4, 28, 16, '#5a2e22', { height: 4 });
  ctx.strokeStyle = '#b4643c';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(10, -18);
  ctx.lineTo(10, 8);
  ctx.lineTo(-30, 8);
  ctx.lineTo(-30, 20);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,220,160,0.4)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
  // Stacks belching ember-lit smoke.
  const stacks = r.int(2, 3);
  for (let i = 0; i < stacks; i++) {
    const sx = -36 + i * 16;
    const sy = 14 + r.range(-2, 4);
    chimney(ctx, sx, sy, 4.2, { height: 24, color: '#3a2a26', glow: '#ff7a2a' });
    anchors.add(A.EMBERSMOKE, ...rot(x, y, ang, sx, sy), 1, r.next());
  }
  ctx.restore();
}

/** Local foundry coords → ground coords. */
function rot(x, y, ang, lx, ly) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return [x + lx * c - ly * s, y + lx * s + ly * c];
}
