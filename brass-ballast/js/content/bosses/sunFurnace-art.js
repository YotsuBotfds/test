// The Sun Furnace (WP16) — sprite art. Registers every `boss_sunFurnace*` sprite on import and
// exports the shared geometry (GEO) that the logic, attacks and renderer all agree on.
//
// Seen from straight above, the furnace is a molten sphere (r = GEO.R) sitting in an equatorial
// gantry ring. Its armour is 7 "orange-peel" wedge plates converging on a brass pole hub; the
// slits between them show the core. Plates are drawn with *pole-bright* shading only (they rotate),
// and a separate non-rotating `shade` overlay supplies the top-left key light so the whole globe
// reads as one lit sphere however the shell is turned.

import { Sprites } from '../../gfx/sprites.js';
import * as K from '../../gfx/drawkit.js';

const TAU = Math.PI * 2;

/** Shared geometry (world units, relative to the boss centre). */
export const GEO = {
  R: 140, // sphere / shell rim
  HUB: 30, // pole hub radius (plates converge here)
  RING_IN: 136,
  RING_OUT: 170,
  PLATES: 7,
  PLATE_HALF: 0.278, // half-angle of a plate (radians) → gaps of ~19.6°
  CHIMNEYS: [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6],
  CHIMNEY_R: 190,
  ARMS: [-Math.PI / 6, Math.PI / 2, (7 * Math.PI) / 6],
  ARM_R: 168,
  ARM_REACH: 74, // pivot → crucible centre
  LAMPS: [-Math.PI / 3, 0, Math.PI / 3, (2 * Math.PI) / 3, Math.PI, (4 * Math.PI) / 3],
  LAMP_R: 163,
};
GEO.STEP = TAU / GEO.PLATES;

const FRAME_SIZE = 440;
const CORE_SIZE = 290;
const CORE_SCALE = 1.6; // px per unit for the shader-baked core (keeps boot render cheap)
const PLATE_IN = GEO.HUB - 1;
const PLATE_OUT = GEO.R + 1;
const PLATE_BX0 = Math.floor(PLATE_IN * Math.cos(GEO.PLATE_HALF)) - 4;
const PLATE_HH = Math.ceil(PLATE_OUT * Math.sin(GEO.PLATE_HALF)) + 5;

/** Colors of the baked glow sprite frames (boss_sunFurnace_glow). */
export const GLOW = { orange: 0, hot: 1, red: 2, cyan: 3, white: 4 };
const GLOW_COLORS = ['#ff7a2f', '#ffe9a8', '#ff3b2a', '#7ff3ff', '#ffffff'];

// ---- helpers ---------------------------------------------------------------------------------

const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
const polar = (r, a) => [Math.cos(a) * r, Math.sin(a) * r];

function annulus(ctx, r0, r1) {
  ctx.beginPath();
  ctx.arc(0, 0, r1, 0, TAU);
  ctx.arc(0, 0, r0, 0, TAU, true);
}

/** Radial trapezoid (buttress / bracket) at angle `a`, lit in world space. */
function buttress(ctx, a, r0, r1, w0, w1, kind) {
  const pts = [
    rot(r0, -w0 / 2, a),
    rot(r1, -w1 / 2, a),
    rot(r1, w1 / 2, a),
    rot(r0, w0 / 2, a),
  ];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  K.polygon(ctx, pts);
  ctx.fillStyle = K.metal(ctx, x0, y0, x1, y1, kind);
  ctx.fill();
  K.rimLight(ctx, x0, y0, x1, y1, 1, 0.35);
  K.ink(ctx, 1);
  // bolts on the corners
  for (const [px, py] of [rot(r0 + 4, -w0 / 2 + 4, a), rot(r0 + 4, w0 / 2 - 4, a), rot(r1 - 4, -w1 / 2 + 4, a), rot(r1 - 4, w1 / 2 - 4, a)]) {
    K.bolt(ctx, px, py, 1.6, 'iron', a);
  }
}

function arcPoints(r, a0, a1, n = 10) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(polar(r, a0 + ((a1 - a0) * i) / n));
  return out;
}

// ---- gantry frame ----------------------------------------------------------------------------

function drawFrame(ctx) {
  const { RING_IN: R0, RING_OUT: R1 } = GEO;
  // Chimney & arm buttresses (under the ring).
  for (const a of GEO.CHIMNEYS) buttress(ctx, a, 150, 212, 30, 40, 'blackiron');
  for (const a of GEO.ARMS) buttress(ctx, a, 150, 186, 34, 42, 'syndicate');

  // Copper steam mains looping round the outside of the ring between the fittings.
  for (let i = 0; i < 3; i++) {
    const a0 = GEO.CHIMNEYS[i] + 0.16;
    const a1 = GEO.ARMS[i] - 0.17;
    K.pipe(ctx, arcPoints(179, a0, a1, 8), 4.2, 'copper', { smooth: true });
    const b0 = GEO.ARMS[i] + 0.17;
    const b1 = GEO.CHIMNEYS[(i + 1) % 3] + (i === 2 ? TAU : 0) - 0.16;
    K.pipe(ctx, arcPoints(181, b0, b1, 8), 3.2, 'brass', { smooth: true });
  }

  // Main equatorial ring.
  annulus(ctx, R0, R1);
  ctx.fillStyle = K.metal(ctx, -R1, -R1, R1, R1, 'syndicate');
  ctx.fill();
  K.shadeOverlay(ctx, -R1, -R1, R1, R1, 0.22, 0.42);
  K.ink(ctx, 1.4);
  // Crimson livery band.
  annulus(ctx, 150.5, 157.5);
  ctx.fillStyle = K.metal(ctx, -158, -158, 158, 158, 'crimson');
  ctx.fill();
  K.shadeOverlay(ctx, -158, -158, 158, 158, 0.25, 0.35);
  K.ink(ctx, 0.7);
  // Segment seams.
  ctx.strokeStyle = 'rgba(14,10,8,0.55)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * TAU + 0.04;
    const [x0, y0] = polar(R0 + 2, a);
    const [x1, y1] = polar(150, a);
    const [x2, y2] = polar(158, a);
    const [x3, y3] = polar(R1 - 1, a);
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.moveTo(x2, y2);
    ctx.lineTo(x3, y3);
  }
  ctx.stroke();
  K.rivetRing(ctx, 0, 0, 143.5, 84, 1.05, 'iron', 0.02);
  K.rivetRing(ctx, 0, 0, 165, 96, 1.05, 'iron');

  // Warning-stripe plaques flanking each arm mount.
  for (const a of GEO.ARMS) {
    for (const s of [-1, 1]) {
      ctx.save();
      const [px, py] = polar(160, a + s * 0.27);
      ctx.translate(px, py);
      ctx.rotate(a + s * 0.27 + Math.PI / 2);
      K.hazardStripes(ctx, -9, -4, 18, 8, { stripe: 2.4 });
      ctx.restore();
    }
  }
  // Lamp housings (lit dynamically).
  for (const a of GEO.LAMPS) {
    const [x, y] = polar(GEO.LAMP_R, a);
    ctx.beginPath();
    ctx.arc(x, y, 5.2, 0, TAU);
    ctx.fillStyle = K.metalRadial(ctx, x, y, 5.2, 'blackiron');
    ctx.fill();
    K.ink(ctx, 0.7);
    ctx.beginPath();
    ctx.arc(x, y, 3.3, 0, TAU);
    ctx.fillStyle = '#5a1a12';
    ctx.fill();
    ctx.strokeStyle = 'rgba(201,151,63,0.85)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(x - 3.3, y);
    ctx.lineTo(x + 3.3, y);
    ctx.stroke();
  }
  // A pair of pressure gauges and vent grilles for steampunk texture.
  for (const [a, v] of [
    [GEO.CHIMNEYS[0] + 0.42, 0.92],
    [GEO.CHIMNEYS[2] - 0.42, 0.85],
  ]) {
    const [x, y] = polar(176, a);
    K.gauge(ctx, x, y, 7, { value: v, redline: true });
  }
  for (const a of [GEO.CHIMNEYS[1] - 0.45, GEO.CHIMNEYS[2] + 0.45, GEO.CHIMNEYS[0] - 0.45]) {
    ctx.save();
    const [x, y] = polar(161, a);
    ctx.translate(x, y);
    ctx.rotate(a);
    K.ventGrille(ctx, -5, -8, 10, 16, { slots: 4, kind: 'iron', glow: '#ff6a1f' });
    ctx.restore();
  }

  // Inner lip where the sphere sits in the ring: dark throat with a molten line.
  annulus(ctx, 133, 138.5);
  ctx.fillStyle = '#120b07';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 136, 0, TAU);
  ctx.strokeStyle = 'rgba(255,122,47,0.55)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Soot.
  ctx.save();
  annulus(ctx, R0, R1 + 30);
  ctx.clip();
  K.grime(ctx, -R1 - 30, -R1 - 30, (R1 + 30) * 2, (R1 + 30) * 2, 0.22, 77, { streaks: 0.1 });
  ctx.restore();

  // Arm trunnions (the arms themselves are separate, animated sprites).
  for (const a of GEO.ARMS) {
    const [x, y] = polar(GEO.ARM_R, a);
    K.dome(ctx, x, y, 11, 'syndicate', { rivets: 10, ring: true });
  }
  // Chimneys.
  for (const a of GEO.CHIMNEYS) {
    const [x, y] = polar(GEO.CHIMNEY_R, a);
    K.smokestack(ctx, x, y, 15, 'blackiron', { band: '#c0392b', ember: true, soot: 30, angle: a });
  }
}

// ---- crucible arm (pivot at the trunnion, reaching along +x) --------------------------------

function drawArm(ctx) {
  const cy = 30;
  // Lattice rails.
  K.cylinder(ctx, 8, cy - 8, 62, cy - 5, 4, 3.4, 'iron', { capStart: true, capEnd: true });
  K.cylinder(ctx, 8, cy + 8, 62, cy + 5, 4, 3.4, 'iron', { capStart: true, capEnd: true });
  ctx.strokeStyle = K.ramp('iron')[2];
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const x0 = 12 + i * 10;
    ctx.moveTo(x0, cy - 7);
    ctx.lineTo(x0 + 10, cy + 6.5);
    ctx.moveTo(x0, cy + 7);
    ctx.lineTo(x0 + 10, cy - 6.5);
  }
  ctx.stroke();
  // Hydraulic ram.
  K.cylinder(ctx, 10, cy, 40, cy, 7, 7, 'copper', { capStart: true });
  K.cylinder(ctx, 40, cy, 58, cy, 3.2, 3.2, 'steel', { capEnd: true });
  K.rivetLine(ctx, 13, cy - 2.3, 37, cy - 2.3, 6, 0.8, 'brass');
  // Hinge.
  K.dome(ctx, 8, cy, 7.5, 'brass', { rivets: 8, ring: false });
  // Crucible bowl.
  const x = 78;
  const r = 19;
  // pour spout
  K.polygon(ctx, [
    [x + r - 4, cy - 6],
    [x + r + 8, cy - 2],
    [x + r + 8, cy + 2],
    [x + r - 4, cy + 6],
  ]);
  ctx.fillStyle = K.metal(ctx, x + r - 4, cy - 6, x + r + 8, cy + 6, 'blackiron');
  ctx.fill();
  K.ink(ctx, 0.9);
  ctx.beginPath();
  ctx.arc(x, cy, r, 0, TAU);
  ctx.fillStyle = K.metalRadial(ctx, x, cy, r, 'blackiron', { spec: 0.3 });
  ctx.fill();
  K.ink(ctx, 1.2);
  // trunnion pins
  K.bolt(ctx, x, cy - r - 1, 3, 'brass');
  K.bolt(ctx, x, cy + r + 1, 3, 'brass');
  // brass rim band
  annulusAt(ctx, x, cy, r - 4.5, r - 1.2);
  ctx.fillStyle = K.metal(ctx, x - r, cy - r, x + r, cy + r, 'brass', { polish: true });
  ctx.fill();
  K.ink(ctx, 0.6);
  K.rivetRing(ctx, x, cy, r - 2.9, 16, 0.7, 'brass');
  // molten surface
  ctx.beginPath();
  ctx.arc(x, cy, r - 5, 0, TAU);
  const g = ctx.createRadialGradient(x - 3, cy - 3, 1, x, cy, r - 5);
  g.addColorStop(0, '#fffbe0');
  g.addColorStop(0.3, '#ffd23f');
  g.addColorStop(0.7, '#ff6a1a');
  g.addColorStop(1, '#8a1c08');
  ctx.fillStyle = g;
  ctx.fill();
  const rnd = K.seeded(41);
  ctx.fillStyle = 'rgba(70,16,6,0.6)';
  for (let i = 0; i < 6; i++) {
    const a = rnd() * TAU;
    const d = rnd() * (r - 9);
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * d, cy + Math.sin(a) * d, 2.2 + rnd() * 2, 1.4 + rnd() * 1.2, rnd() * 3, 0, TAU);
    ctx.fill();
  }
}

function annulusAt(ctx, x, y, r0, r1) {
  ctx.beginPath();
  ctx.arc(x, y, r1, 0, TAU);
  ctx.arc(x, y, r0, 0, TAU, true);
}

// ---- molten core (per-pixel cellular shader over a sphere) ----------------------------------

function rampLUT(stops) {
  const lut = new Uint8ClampedArray(256 * 3);
  const rgb = stops.map(([t, c]) => [t, K.toRgb(c)]);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let j = 0;
    while (j < rgb.length - 2 && t > rgb[j + 1][0]) j++;
    const [t0, c0] = rgb[j];
    const [t1, c1] = rgb[j + 1];
    const k = Math.min(1, Math.max(0, (t - t0) / (t1 - t0 || 1)));
    lut[i * 3] = c0[0] + (c1[0] - c0[0]) * k;
    lut[i * 3 + 1] = c0[1] + (c1[1] - c0[1]) * k;
    lut[i * 3 + 2] = c0[2] + (c1[2] - c0[2]) * k;
  }
  return lut;
}

const LAVA = rampLUT([
  [0, '#1e0402'],
  [0.22, '#5e1006'],
  [0.4, '#a8280c'],
  [0.55, '#e84a12'],
  [0.68, '#ff8a26'],
  [0.8, '#ffc44a'],
  [0.91, '#ffeb9a'],
  [1, '#fffcec'],
]);
const LAVA_HOT = rampLUT([
  [0, '#6a2008'],
  [0.25, '#d0581c'],
  [0.45, '#ffa040'],
  [0.62, '#ffd77a'],
  [0.78, '#fff4cc'],
  [0.9, '#ffffff'],
  [1, '#f0f8ff'],
]);

function spherePoints(seed, n) {
  const rnd = K.seeded(seed);
  const pts = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const u = rnd() * 2 - 1;
    const th = rnd() * TAU;
    const s = Math.sqrt(1 - u * u);
    pts[i * 4] = s * Math.cos(th);
    pts[i * 4 + 1] = s * Math.sin(th);
    pts[i * 4 + 2] = u;
    pts[i * 4 + 3] = 0.78 + rnd() * 0.3; // per-cell brightness
  }
  return pts;
}

/** Rotate unit points around the (tilted) spin axis — animates convection between frames. */
function spun(pts, ang) {
  const out = new Float32Array(pts.length);
  const ax = 0.25;
  const ay = 0.94;
  const az = 0.22;
  const l = Math.hypot(ax, ay, az);
  const ux = ax / l;
  const uy = ay / l;
  const uz = az / l;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  for (let i = 0; i < pts.length; i += 4) {
    const x = pts[i];
    const y = pts[i + 1];
    const z = pts[i + 2];
    const dot = ux * x + uy * y + uz * z;
    out[i] = x * c + (uy * z - uz * y) * s + ux * dot * (1 - c);
    out[i + 1] = y * c + (uz * x - ux * z) * s + uy * dot * (1 - c);
    out[i + 2] = z * c + (ux * y - uy * x) * s + uz * dot * (1 - c);
    out[i + 3] = pts[i + 3];
  }
  return out;
}

const CORE_PTS = spherePoints(9001, 84);

function drawCore(ctx, w, h, frame, hot) {
  const px = Math.round(w * CORE_SCALE);
  const cv = K.scratchCanvas(px, px);
  const R = GEO.R;
  if (!cv) {
    // Fallback: plain gradient sphere.
    K.glow(ctx, w / 2, h / 2, R, hot ? '#fff4cc' : '#ff8a26', 1, { core: 0.6 });
    return;
  }
  const c2 = cv.getContext('2d');
  const img = c2.createImageData(px, px);
  const data = img.data;
  const lut = hot ? LAVA_HOT : LAVA;
  const pts = spun(CORE_PTS, frame * 0.42);
  const n = pts.length;
  const cx = w / 2;
  const unit = 1 / CORE_SCALE;
  // key light (top-left, toward the viewer)
  const lx = -0.42;
  const ly = -0.48;
  const lz = 0.77;
  for (let j = 0; j < px; j++) {
    const wy = (j + 0.5) * unit - cx;
    for (let i = 0; i < px; i++) {
      const wx = (i + 0.5) * unit - cx;
      const rr = Math.hypot(wx, wy) / R;
      const o = (j * px + i) * 4;
      if (rr >= 1.004) {
        data[o + 3] = 0;
        continue;
      }
      const nx = wx / R;
      const ny = wy / R;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      // F1/F2 cellular distance on the sphere surface.
      let d1 = 9;
      let d2 = 9;
      let b1 = 1;
      for (let k = 0; k < n; k += 4) {
        const dx = nx - pts[k];
        const dy = ny - pts[k + 1];
        const dz = nz - pts[k + 2];
        const d = dx * dx + dy * dy + dz * dz;
        if (d < d1) {
          d2 = d1;
          d1 = d;
          b1 = pts[k + 3];
        } else if (d < d2) d2 = d;
      }
      const e = Math.sqrt(d2) - Math.sqrt(d1);
      const crack = 1 - Math.min(1, e / 0.06);
      const crack2 = crack * crack;
      const interior = Math.min(1, Math.sqrt(d1) / 0.3);
      let heat = 0.3 * b1 + 0.66 * crack2 + 0.16 * (1 - interior);
      heat *= 0.6 + 0.4 * nz; // limb darkening
      const lit = Math.max(0, nx * lx + ny * ly + nz * lz);
      heat += 0.12 * lit * lit * lit + 0.08 * nz ** 6;
      if (hot) heat = 0.25 + heat * 0.95;
      const li = Math.max(0, Math.min(255, (heat * 255) | 0)) * 3;
      data[o] = lut[li];
      data[o + 1] = lut[li + 1];
      data[o + 2] = lut[li + 2];
      data[o + 3] = Math.max(0, Math.min(255, ((1.004 - rr) * R * CORE_SCALE) * 255)) | 0;
    }
  }
  c2.putImageData(img, 0, 0);
  ctx.drawImage(cv, 0, 0, w, h);
  // Hot limb rim (thin atmosphere of incandescent gas).
  ctx.save();
  ctx.translate(cx, cx);
  ctx.beginPath();
  ctx.arc(0, 0, R - 0.5, 0, TAU);
  ctx.strokeStyle = hot ? 'rgba(255,250,230,0.55)' : 'rgba(255,170,70,0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

// ---- shell plate (orange-peel wedge, pivot at the sphere centre, facing +x) ------------------

function platePath(ctx) {
  const hw = GEO.PLATE_HALF;
  ctx.beginPath();
  ctx.arc(0, 0, PLATE_OUT, -hw, hw);
  ctx.arc(0, 0, PLATE_IN, hw, -hw, true);
  ctx.closePath();
}

function drawPlate(ctx, w, h, frame) {
  const hw = GEO.PLATE_HALF;
  ctx.save();
  ctx.translate(-PLATE_BX0, PLATE_HH);
  // Body: bright toward the pole, darker toward the equator (sphere curvature).
  platePath(ctx);
  const g = ctx.createRadialGradient(0, 0, PLATE_IN, 0, 0, PLATE_OUT);
  g.addColorStop(0, '#8d949e');
  g.addColorStop(0.35, '#646b75');
  g.addColorStop(0.75, '#3c4149');
  g.addColorStop(1, '#22262c');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // Heat tempering along the slit edges (straw → bronze → purple → blue).
  const tint = [
    ['rgba(214,160,72,0.30)', 14],
    ['rgba(150,82,52,0.30)', 8],
    ['rgba(104,62,138,0.28)', 4.5],
    ['rgba(52,86,160,0.30)', 1.8],
  ];
  for (const [c, lw] of tint) {
    ctx.strokeStyle = c;
    ctx.lineWidth = lw;
    ctx.beginPath();
    for (const s of [-1, 1]) {
      ctx.moveTo(...polar(PLATE_IN, s * hw));
      ctx.lineTo(...polar(PLATE_OUT, s * hw));
    }
    ctx.stroke();
  }
  K.grime(ctx, PLATE_IN - 4, -PLATE_HH, PLATE_OUT - PLATE_IN + 8, PLATE_HH * 2, 0.24, 31, { streaks: 0.2 });
  // Latitude seams.
  for (const r of [72, 108]) {
    ctx.beginPath();
    ctx.arc(0, 0, r, -hw, hw);
    ctx.strokeStyle = 'rgba(12,10,8,0.6)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r + 1.2, -hw, hw);
    ctx.strokeStyle = 'rgba(220,226,234,0.18)';
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }
  // Bronze equator trim band.
  ctx.beginPath();
  ctx.arc(0, 0, PLATE_OUT, -hw, hw);
  ctx.arc(0, 0, 127, hw, -hw, true);
  ctx.closePath();
  ctx.fillStyle = K.metal(ctx, 127, -40, PLATE_OUT, 40, 'bronze');
  ctx.fill();
  K.ink(ctx, 0.8);
  // Crimson stripe just inside the trim.
  ctx.beginPath();
  ctx.arc(0, 0, 124, -hw, hw);
  ctx.arc(0, 0, 119, hw, -hw, true);
  ctx.closePath();
  ctx.fillStyle = 'rgba(176,44,32,0.85)';
  ctx.fill();
  ctx.restore();

  // Rivets along seams and edges.
  const rivRow = (r, inset = 0.035) => {
    const a0 = -hw + inset;
    const a1 = hw - inset;
    const n = Math.max(2, Math.round((r * (a1 - a0)) / 7.5));
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      K.rivet(ctx, Math.cos(a) * r, Math.sin(a) * r, 1.05, 'iron');
    }
  };
  rivRow(134, 0.03);
  rivRow(112);
  rivRow(76);
  for (const s of [-1, 1]) {
    for (let r = 40; r <= 128; r += 9) {
      const a = s * (hw - 5 / r);
      K.rivet(ctx, Math.cos(a) * r, Math.sin(a) * r, 0.9, 'iron');
    }
  }
  // Syndicate cog emblem.
  K.gear(ctx, 92, 0, 10, 9, { kind: 'blackiron', spokes: 0, hole: 0, polish: false });
  ctx.beginPath();
  ctx.arc(92, 0, 4.4, 0, TAU);
  ctx.fillStyle = '#c0392b';
  ctx.fill();
  K.ink(ctx, 0.6);
  // Pole-end bolt.
  K.bolt(ctx, 44, 0, 2.6, 'steel');

  platePath(ctx);
  K.rimLight(ctx, PLATE_IN, -PLATE_HH, PLATE_OUT, PLATE_HH, 1.1, 0.35);
  K.ink(ctx, 1.4);

  if (frame === 1) {
    // Overheated: glowing seams, red-hot edges and fresh cracks.
    ctx.save();
    platePath(ctx);
    ctx.clip();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(255,72,20,0.28)';
    ctx.fillRect(PLATE_IN - 4, -PLATE_HH, PLATE_OUT, PLATE_HH * 2);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,120,40,0.85)';
    ctx.lineWidth = 3;
    platePath(ctx);
    ctx.stroke();
    for (const r of [72, 108]) {
      ctx.beginPath();
      ctx.arc(0, 0, r, -hw, hw);
      ctx.strokeStyle = 'rgba(255,150,60,0.7)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    // Heat fractures: start on a slit edge or seam and wander inward, glowing.
    const rnd = K.seeded(5);
    const cracks = [];
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? 1 : -1;
      let r = 45 + rnd() * 85;
      let a = side * (hw - 0.01);
      const pts = [[Math.cos(a) * r, Math.sin(a) * r]];
      for (let k = 0; k < 6; k++) {
        r += (rnd() - 0.5) * 10;
        a -= side * (0.035 + rnd() * 0.05);
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      cracks.push(pts);
    }
    for (const [col, lw] of [
      ['rgba(255,90,20,0.55)', 3.4],
      ['rgba(255,220,140,0.95)', 1],
    ]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      for (const pts of cracks) {
        K.polygon(ctx, pts, false);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  ctx.restore();
}

// ---- pole hub, cage, lighting overlay, light rays, glows -------------------------------------

function drawHub(ctx, w) {
  const c = w / 2;
  ctx.save();
  ctx.translate(c, c);
  K.dome(ctx, 0, 0, 30, 'blackiron', { rivets: 14, ring: true });
  K.gear(ctx, 0, 0, 22, 14, { kind: 'brass', spokes: 7, rotation: 0.1 });
  ctx.beginPath();
  ctx.arc(0, 0, 8.5, 0, TAU);
  ctx.fillStyle = K.metalRadial(ctx, 0, 0, 8.5, 'syndicate');
  ctx.fill();
  K.ink(ctx, 0.8);
  K.hotOrb(ctx, 0, 0, 5.6, { body: '#ff5a1f', core: '#ffe0a0', rim: '#2a0806', halo: 0 });
  ctx.restore();
}

function drawCage(ctx, w) {
  const c = w / 2;
  ctx.save();
  ctx.translate(c, c);
  const ribs = GEO.PLATES;
  // meridians
  for (let i = 0; i < ribs; i++) {
    const a = (i / ribs) * TAU;
    const [x0, y0] = polar(26, a);
    const [x1, y1] = polar(GEO.R - 2, a);
    K.cylinder(ctx, x0, y0, x1, y1, 5.5, 7, 'blackiron', { ink: 1 });
    for (let r = 40; r < GEO.R - 6; r += 12) K.rivet(ctx, ...polar(r, a), 1, 'iron');
  }
  // latitude rings
  for (const [r, wd] of [
    [72, 4],
    [110, 4.5],
    [GEO.R - 3, 6],
  ]) {
    annulus(ctx, r - wd / 2, r + wd / 2);
    ctx.fillStyle = K.metal(ctx, -r, -r, r, r, 'blackiron');
    ctx.fill();
    K.ink(ctx, 0.8);
    K.rivetRing(ctx, 0, 0, r, Math.round(r / 5), 0.85, 'iron');
  }
  // joints
  for (let i = 0; i < ribs; i++) {
    const a = (i / ribs) * TAU;
    for (const r of [72, 110]) K.bolt(ctx, ...polar(r, a), 3.2, 'brass', a);
  }
  ctx.restore();
}

function drawShade(ctx, w) {
  const c = w / 2;
  const R = GEO.R + 1;
  ctx.save();
  ctx.translate(c, c);
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.clip();
  const g = ctx.createRadialGradient(-50, -56, 4, -18, -20, R * 1.55);
  g.addColorStop(0, 'rgba(255,244,220,0.34)');
  g.addColorStop(0.28, 'rgba(255,240,215,0.06)');
  g.addColorStop(0.5, 'rgba(0,0,0,0)');
  g.addColorStop(0.78, 'rgba(10,6,4,0.32)');
  g.addColorStop(1, 'rgba(10,6,4,0.62)');
  ctx.fillStyle = g;
  ctx.fillRect(-R, -R, R * 2, R * 2);
  const limb = ctx.createRadialGradient(0, 0, R * 0.72, 0, 0, R);
  limb.addColorStop(0, 'rgba(0,0,0,0)');
  limb.addColorStop(1, 'rgba(8,5,3,0.38)');
  ctx.fillStyle = limb;
  ctx.fillRect(-R, -R, R * 2, R * 2);
  ctx.restore();
}

function drawRay(ctx, w, h) {
  const cy = h / 2;
  for (const [spread, a] of [
    [0.24, 0.35],
    [0.15, 0.55],
    [0.07, 0.9],
  ]) {
    ctx.beginPath();
    ctx.moveTo(30, -2 + cy);
    ctx.lineTo(w, -w * spread + cy);
    ctx.lineTo(w, w * spread + cy);
    ctx.lineTo(30, 2 + cy);
    ctx.closePath();
    const g = ctx.createRadialGradient(0, cy, 0, 0, cy, w);
    g.addColorStop(0, 'rgba(255,214,140,0)');
    g.addColorStop(0.42, `rgba(255,210,130,${a * 0.5})`);
    g.addColorStop(0.6, `rgba(255,236,190,${a})`);
    g.addColorStop(0.75, `rgba(255,170,80,${a * 0.5})`);
    g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g;
    ctx.fill();
  }
}

function drawGlow(ctx, w, h, frame) {
  const col = GLOW_COLORS[frame] || GLOW_COLORS[0];
  const c = w / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, K.alpha(col, 1));
  g.addColorStop(0.15, K.alpha(col, 0.8));
  g.addColorStop(0.4, K.alpha(col, 0.3));
  g.addColorStop(0.7, K.alpha(col, 0.08));
  g.addColorStop(1, K.alpha(col, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawShadowSprite(ctx, w) {
  const c = w / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.7)');
  g.addColorStop(0.85, 'rgba(0,0,0,0.3)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, w);
}

// ---- registration ----------------------------------------------------------------------------

Sprites.register('boss_sunFurnace_frame', {
  w: FRAME_SIZE,
  h: FRAME_SIZE,
  draw(ctx, w) {
    ctx.save();
    ctx.translate(w / 2, w / 2);
    drawFrame(ctx);
    ctx.restore();
  },
});

/** Crucible arm: pivot at its trunnion (cx, cy), reaching along +x. */
export const ARM_SPRITE = { w: 106, h: 60, cx: 8, cy: 30 };
Sprites.register('boss_sunFurnace_arm', { ...ARM_SPRITE, draw: (ctx) => drawArm(ctx) });

Sprites.register('boss_sunFurnace_core', {
  w: CORE_SIZE,
  h: CORE_SIZE,
  frames: 3,
  scale: CORE_SCALE,
  draw: (ctx, w, h, frame) => drawCore(ctx, w, h, frame, false),
});
Sprites.register('boss_sunFurnace_coreHot', {
  w: CORE_SIZE,
  h: CORE_SIZE,
  frames: 2,
  scale: CORE_SCALE,
  draw: (ctx, w, h, frame) => drawCore(ctx, w, h, frame * 1.5 + 0.7, true),
});

/** Shell plate: pivot at the sphere centre (outside the bitmap), wedge pointing +x. */
Sprites.register('boss_sunFurnace_plate', {
  w: PLATE_OUT + 6 - PLATE_BX0,
  h: PLATE_HH * 2,
  cx: -PLATE_BX0,
  cy: PLATE_HH,
  frames: 2,
  draw: drawPlate,
});

Sprites.register('boss_sunFurnace_hub', { w: 80, h: 80, draw: (ctx, w) => drawHub(ctx, w) });
Sprites.register('boss_sunFurnace_cage', { w: 292, h: 292, draw: (ctx, w) => drawCage(ctx, w) });
Sprites.register('boss_sunFurnace_shade', { w: 292, h: 292, draw: (ctx, w) => drawShade(ctx, w) });
/** Light shaft leaking from a slit: pivot at the sphere centre, beam along +x. */
Sprites.register('boss_sunFurnace_ray', { w: 250, h: 130, cx: 0, cy: 65, scale: 1, draw: drawRay });
Sprites.register('boss_sunFurnace_glow', { w: 64, h: 64, frames: GLOW_COLORS.length, scale: 1.5, draw: drawGlow });
Sprites.register('boss_sunFurnace_shadow', { w: 64, h: 64, scale: 1, draw: (ctx, w) => drawShadowSprite(ctx, w) });

/**
 * Furnace ordnance, tuned to read over molten-river backdrops: a thick soot-black rim around a
 * white-hot core. Frame 0 = slag (gold/crimson), frame 1 = plasma (magenta).
 */
Sprites.register('boss_sunFurnace_shot', {
  w: 22,
  h: 22,
  frames: 2,
  draw(ctx, w, h, frame) {
    const c = w / 2;
    const body = frame === 1 ? '#ff3d8b' : '#ff5a1a';
    const mid = frame === 1 ? '#ffb0d8' : '#ffd23f';
    K.glow(ctx, c, c, 10.5, body, 0.5);
    ctx.beginPath();
    ctx.arc(c, c, 7.4, 0, TAU);
    ctx.fillStyle = '#160402';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c, c, 5.8, 0, TAU);
    const g = ctx.createRadialGradient(c - 1.2, c - 1.2, 0.4, c, c, 5.8);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.32, '#fff6d8');
    g.addColorStop(0.55, mid);
    g.addColorStop(1, body);
    ctx.fillStyle = g;
    ctx.fill();
    if (frame === 0) {
      ctx.fillStyle = 'rgba(60,12,4,0.55)';
      for (const [x, y, r] of [
        [c + 3, c + 2.4, 1.3],
        [c - 3.2, c + 2.6, 1.1],
        [c + 2.6, c - 3.1, 0.9],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }
    }
  },
});

/** Composite portrait (codex, icons, fallbacks) — the whole furnace, shell closed. */
Sprites.register('boss_sunFurnace', {
  w: 520,
  h: 520,
  scale: 1,
  draw(ctx, w) {
    const c = w / 2;
    const put = (name, x, y, a = 0, frame = 0, alpha = 1, op = 'source-over', sc = 1) => {
      const s = Sprites.get(name, frame);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = op;
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.drawImage(s.img, -s.cx * sc, -s.cy * sc, s.w * sc, s.h * sc);
      ctx.restore();
    };
    put('boss_sunFurnace_glow', c, c, 0, GLOW.orange, 0.55, 'lighter', 8);
    put('boss_sunFurnace_frame', c, c);
    for (const a of GEO.ARMS) {
      put('boss_sunFurnace_arm', c + Math.cos(a) * GEO.ARM_R, c + Math.sin(a) * GEO.ARM_R, a);
    }
    put('boss_sunFurnace_core', c, c);
    for (let i = 0; i < GEO.PLATES; i++) put('boss_sunFurnace_plate', c, c, i * GEO.STEP + 0.2);
    put('boss_sunFurnace_hub', c, c, 0.2);
    put('boss_sunFurnace_shade', c, c);
    for (let i = 0; i < GEO.PLATES; i++) {
      put('boss_sunFurnace_ray', c, c, (i + 0.5) * GEO.STEP + 0.2, 0, 0.55, 'lighter');
    }
  },
});
