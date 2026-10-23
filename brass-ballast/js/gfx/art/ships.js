// Player airship hulls (WP4). Top-down, facing +x, light from the top-left, no baked shadow.
// Each hull has a distinct silhouette that reads at ~96 px. Props and turrets are separate
// sprites (see turrets.js) drawn by the engine at HULL_MOUNTS.

import { Sprites } from '../sprites.js';
import {
  PAL, envelope, envelopeGeo, envelopeStripePath, fin, nacelle, cylinder, rivet,
  rivetLine, rivetRing, rivetedBand, nameplate, flag, porthole, ventGrille, dome, deck, railing,
  rigging, ropeLine, grime, smokestack, plate, gear, balloon, coil, gauge, lamp, spike, bone, skull,
  hazardStripes, metal, metalRadial, cylinderGrad, ink, polygon, roundRect, shadeOverlay, glow,
  pipe, crest, canvasPatch, mix, alpha, cannon, smoothPath, chain, stitching,
} from '../drawkit.js';
import './turrets.js';

const TAU = Math.PI * 2;

/**
 * Mount points per hull, relative to the sprite CENTRE in world units (sprite faces +x).
 * `props`: where the engine draws the animated 'prop' sprite; `turret`: turret pivot.
 */
export const HULL_MOUNTS = {
  dauntless: { props: [[-10, -20.5], [-10, 20.5]], turret: [6, 0] },
  cormorant: { props: [[-19, -13.5], [-19, 13.5]], turret: [8, 0] },
  bulwark: { props: [[-45, -21], [-45, 21]], turret: [18, 0] },
  tinker: { props: [[-24, -21], [24, -21], [-24, 21], [24, 21]], turret: [14, 0] },
  bane: { props: [[-16, -18.5], [-16, 18.5]], turret: [10, 0] },
};

/** Sprite sizes (contract, DESIGN §12 WP4). */
export const HULL_SIZES = {
  dauntless: [96, 48],
  cormorant: [104, 38],
  bulwark: [116, 66],
  tinker: [86, 64],
  bane: [112, 52],
};

const HULL_SCALE = 3; // hero art: render a little sharper than the default SPRITE_SCALE

function registerHull(id, draw) {
  const [w, h] = HULL_SIZES[id];
  Sprites.register(`hull_${id}`, { w, h, scale: HULL_SCALE, draw: (ctx) => draw(ctx, w, h) });
}

/** Mirror a polygon across y = cy. */
const mirrorY = (pts, cy) => pts.map(([x, y]) => [x, cy * 2 - y]);

/** Dorsal gun platform under a turret: deck disc, brass coaming, railing posts. */
function gunDeck(ctx, x, y, r, opts = {}) {
  const { kind = 'brass', wood = true, rivets = 12 } = opts;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = metal(ctx, x - r, y - r, x + r, y + r, kind, { polish: true });
  ctx.fill();
  ink(ctx, 1);
  if (wood) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.84, 0, TAU);
    ctx.clip();
    deck(ctx, x - r, y - r, r * 2, r * 2, { radius: 0, plank: 1.8, ink: 0, seed: Math.round(x * 7) });
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.84, 0, TAU);
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = 'rgba(26,18,10,0.6)';
    ctx.stroke();
  }
  rivetRing(ctx, x, y, r * 0.92, rivets, 0.45, kind);
}

// ---------------------------------------------------------------------------------------------
// The Dauntless — classic cream gasbag, oxblood stripe, brass nose cap, gondola keel peeking
// out, cruciform tail, side engine nacelles, name-plate.
// ---------------------------------------------------------------------------------------------

function drawDauntless(ctx, w, h) {
  const cy = h / 2;
  const E = { nose: 2.6, tail: 1.7, fullness: 0.5 };
  const geo = envelopeGeo(50, cy, 80, 34, E);

  // --- engine outriggers & nacelles (below the bag) ---
  for (const s of [-1, 1]) {
    const ny = cy + s * 20.5;
    cylinder(ctx, 50, cy + s * 12, 46, ny, 2.2, 1.8, 'brass');
    cylinder(ctx, 40, cy + s * 12, 42, ny, 1.6, 1.4, 'iron');
    nacelle(ctx, 45, ny, 15, 5.6, { kind: 'brass', band: PAL.oxblood, nose: 'copper' });
  }

  // --- horizontal tail fins (cruciform: these two + the rudder) ---
  const finTop = [geo.at(-0.46, -0.78), geo.at(-0.93, -0.55), [7, 2.6], [17.5, 2.2]];
  for (const pts of [finTop, mirrorY(finTop, cy)]) {
    fin(ctx, pts, { fill: PAL.canvas[0], edge: PAL.oxblood, spars: 3 });
  }

  // --- gondola keel: only its brass gunwales peek out beyond the bag ---
  const gondola = [];
  const gx0 = 27;
  const gx1 = 75;
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const x = gx0 + (gx1 - gx0) * t;
    const hw = 15 + 5.2 * Math.sin(Math.PI * Math.pow(t, 0.85));
    gondola.push([x, cy - hw]);
  }
  const gPts = [...gondola, ...mirrorY(gondola, cy).reverse()];
  smoothPath(ctx, gPts);
  ctx.fillStyle = metal(ctx, gx0, cy - 20, gx1, cy + 20, 'wood');
  ctx.fill();
  ink(ctx, 1.1);
  smoothPath(ctx, gPts);
  ctx.save();
  ctx.clip();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = metal(ctx, gx0, cy - 20, gx1, cy + 20, 'brass', { polish: true });
  smoothPath(ctx, gPts);
  ctx.stroke();
  ctx.restore();
  // lit windows along the gunwales
  for (const s of [-1, 1]) {
    for (let x = 36; x <= 66; x += 6) {
      const t = (x - gx0) / (gx1 - gx0);
      const hw = 15 + 5.2 * Math.sin(Math.PI * Math.pow(t, 0.85));
      porthole(ctx, x, cy + s * (hw - 1.4), 0.95, { glow: true, halo: 2 });
    }
  }

  // --- the envelope ---
  envelope(ctx, 50, cy, 80, 34, {
    ...E,
    fill: '#f1e4c2',
    gores: 8,
    ribs: 8,
    stripes: [
      { k0: -0.74, k1: -0.56, t0: -0.88, t1: 0.84, color: PAL.oxblood },
      { k0: 0.56, k1: 0.74, t0: -0.88, t1: 0.84, color: PAL.oxblood },
      { k0: -0.8, k1: -0.77, t0: -0.85, t1: 0.82, color: '#c9973f' },
      { k0: 0.77, k1: 0.8, t0: -0.85, t1: 0.82, color: '#c9973f' },
    ],
    bands: [{ t0: 0.74, t1: 0.79, color: PAL.oxblood }],
    decorate(c, g) {
      grime(c, g.x(-1), cy - 17, 26, 34, 0.5, 11, { color: '#3a2a18' });
      // a couple of honest repairs
      canvasPatch(c, g.x(-0.12), g.y(-0.12, 0.42), 5, 3.6, { color: '#e2cfa2', rot: 0.15 });
      canvasPatch(c, g.x(0.42), g.y(0.42, -0.36), 4, 3, { color: '#dcc697', rot: -0.2 });
    },
  });

  // rigging stays from the bag's equator down to the gunwales
  for (const s of [-1, 1]) {
    for (const t of [-0.45, -0.25, -0.05, 0.15, 0.35, 0.5]) {
      const [ex, ey] = geo.at(t, s * 0.97);
      const x = ex + 2;
      const tt = (x - gx0) / (gx1 - gx0);
      const hw = 15 + 5.2 * Math.sin(Math.PI * Math.pow(Math.max(0, Math.min(1, tt)), 0.85));
      rigging(ctx, ex, ey, x, cy + s * (hw - 0.4), { width: 0.35 });
    }
    // stays out to the nacelles
    const [ax, ay] = geo.at(-0.05, s * 0.99);
    rigging(ctx, ax, ay, 49, cy + s * 19.2, { width: 0.35 });
    const [bx, by] = geo.at(-0.3, s * 0.99);
    rigging(ctx, bx, by, 40, cy + s * 19.4, { width: 0.35 });
  }

  // --- brass nose cap ---
  ctx.save();
  geo.path(ctx, 0.86, 1);
  ctx.fillStyle = metalRadial(ctx, geo.x(0.9), cy - 6, 14, 'brass', { spec: 0.6 });
  ctx.fill();
  ink(ctx, 0.9);
  ctx.restore();
  for (let k = -0.8; k <= 0.81; k += 0.2) rivet(ctx, geo.x(0.865) + 0.6, geo.y(0.865, k), 0.45);
  ctx.beginPath();
  ctx.arc(geo.x(1) - 0.6, cy, 1.3, 0, TAU);
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = '#7a5420';
  ctx.stroke();

  // --- rudder (vertical fin seen edge-on) + ensign ---
  const rx0 = geo.x(-0.42);
  polygon(ctx, [
    [rx0, cy - 0.9],
    [3.2, cy - 1.7],
    [2.2, cy],
    [3.2, cy + 1.7],
    [rx0, cy + 0.9],
  ]);
  ctx.fillStyle = cylinderGrad(ctx, 0, cy - 1.7, 0, cy + 1.7, 'oxblood');
  ctx.fill();
  ink(ctx, 0.8);
  rivetLine(ctx, rx0 - 2, cy, 6, cy, 3.5, 0.4, 'brass');
  flag(ctx, 9.5, cy - 4.4, 7.5, 3.8, [PAL.oxblood, PAL.canvas[0], PAL.navy], { dir: -1, wave: 0.8, swallow: true });

  // --- dorsal fittings ---
  nameplate(ctx, 36.5, cy, 11.5, 3.4, 'DAUNTLESS');
  ventGrille(ctx, 67.5, cy - 2.6, 5.2, 5.2, { slots: 3, kind: 'brass', vertical: true });
  dome(ctx, 76.5, cy, 1.7, 'brass', { rivets: 6 });
  gunDeck(ctx, 54, cy, 10.5);
}

// ---------------------------------------------------------------------------------------------
// The Cormorant — slim racing zeppelin, navy & cream racing stripes, swept fins, twin pods.
// ---------------------------------------------------------------------------------------------

function drawCormorant(ctx, w, h) {
  const cy = h / 2;
  const E = { nose: 1.75, tail: 1.45, fullness: 0.5 };
  const geo = envelopeGeo(55, cy, 90, 22, E);

  // pylons + pods
  for (const s of [-1, 1]) {
    const py = cy + s * 13.5;
    polygon(ctx, [geo.at(0.02, s * 0.8), geo.at(-0.16, s * 0.8), [37, py], [46, py]]);
    ctx.fillStyle = metal(ctx, 35, cy - 15, 60, cy + 15, 'navy');
    ctx.fill();
    ink(ctx, 0.8);
    nacelle(ctx, 44, py, 22, 6.4, { kind: 'brass', band: PAL.navy, nose: 'brass', glow: '#ffb347' });
    // racing stripe on the pod
    ctx.fillStyle = alpha(PAL.canvas[0], 0.85);
    ctx.fillRect(38, py - 0.4, 14, 0.8);
  }

  // swept fins
  const finTop = [geo.at(-0.48, -0.72), geo.at(-0.93, -0.5), [4.5, 1.4], [13.5, 1.2]];
  for (const pts of [finTop, mirrorY(finTop, cy)]) {
    fin(ctx, pts, { fill: PAL.navy, edge: PAL.canvas[0], spars: 2, kind: 'brass' });
  }

  envelope(ctx, 55, cy, 90, 22, {
    ...E,
    fill: '#f4e9cc',
    gores: 6,
    ribs: 9,
    quilt: 0.12,
    stripes: [
      { k0: -0.4, k1: -0.16, t0: -0.97, t1: 0.9, color: PAL.navy },
      { k0: 0.16, k1: 0.4, t0: -0.97, t1: 0.9, color: PAL.navy },
      { k0: -0.5, k1: -0.45, t0: -0.92, t1: 0.86, color: PAL.oxblood },
      { k0: 0.45, k1: 0.5, t0: -0.92, t1: 0.86, color: PAL.oxblood },
    ],
    decorate(c, g) {
      // speed chevrons at the tail
      for (let i = 0; i < 3; i++) {
        const t = -0.8 + i * 0.09;
        c.beginPath();
        c.moveTo(g.x(t), g.y(t, -1));
        c.lineTo(g.x(t + 0.05), cy);
        c.lineTo(g.x(t), g.y(t, 1));
        c.lineTo(g.x(t + 0.03), g.y(t, 1));
        c.lineTo(g.x(t + 0.08), cy);
        c.lineTo(g.x(t + 0.03), g.y(t, -1));
        c.closePath();
        c.fillStyle = alpha(PAL.navy, 0.85);
        c.fill();
      }
      grime(c, g.x(-1), cy - 11, 18, 22, 0.35, 21, { color: '#3a2a18' });
    },
  });

  // polished brass nose with needle
  geo.path(ctx, 0.84, 1);
  ctx.fillStyle = metalRadial(ctx, geo.x(0.88), cy - 4, 10, 'brass', { spec: 0.7 });
  ctx.fill();
  ink(ctx, 0.8);
  cylinder(ctx, geo.x(1) - 1, cy, 103.5, cy, 1.6, 0.4, 'steel', { ink: 0.5 });
  for (let k = -0.7; k <= 0.71; k += 0.35) rivet(ctx, geo.x(0.845) + 0.5, geo.y(0.845, k), 0.4);

  // racing roundel with number
  const rx = geo.x(0.56);
  ctx.beginPath();
  ctx.arc(rx, cy, 4.2, 0, TAU);
  ctx.fillStyle = PAL.navy;
  ctx.fill();
  ink(ctx, 0.6);
  ctx.beginPath();
  ctx.arc(rx, cy, 3.3, 0, TAU);
  ctx.fillStyle = '#fbf3df';
  ctx.fill();
  ctx.save();
  ctx.translate(rx, cy + 0.2);
  ctx.font = 'bold 5px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PAL.oxblood;
  ctx.fillText('7', 0, 0.2);
  ctx.restore();
  shadeOverlay(ctx, rx - 4, cy - 4, rx + 4, cy + 4, 0.15, 0.25);

  // rudder
  const rx0 = geo.x(-0.46);
  polygon(ctx, [
    [rx0, cy - 0.7],
    [2.2, cy - 1.3],
    [1.4, cy],
    [2.2, cy + 1.3],
    [rx0, cy + 0.7],
  ]);
  ctx.fillStyle = cylinderGrad(ctx, 0, cy - 1.3, 0, cy + 1.3, 'navy');
  ctx.fill();
  ink(ctx, 0.7);
  ctx.fillStyle = PAL.canvas[0];
  ctx.fillRect(4, cy - 0.25, rx0 - 6, 0.5);

  // little glass cockpit blister behind the gun ring
  ctx.beginPath();
  ctx.ellipse(46.5, cy, 3.4, 2.4, 0, 0, TAU);
  ctx.fillStyle = metal(ctx, 43, cy - 2.4, 50, cy + 2.4, 'brass');
  ctx.fill();
  ink(ctx, 0.6);
  ctx.beginPath();
  ctx.ellipse(46.7, cy, 2.6, 1.7, 0, 0, TAU);
  const g = ctx.createLinearGradient(44, cy - 2, 49, cy + 2);
  g.addColorStop(0, '#d8f4ff');
  g.addColorStop(0.4, '#5e93b5');
  g.addColorStop(1, '#1b3347');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(45.2, cy - 1);
  ctx.lineTo(47.5, cy - 1.3);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 0.4;
  ctx.stroke();

  gunDeck(ctx, 60, cy, 9.6, { rivets: 10 });
}

// ---------------------------------------------------------------------------------------------
// The Bulwark — wide iron-clad, riveted armour bands, side sponsons with cannons, two stacks.
// ---------------------------------------------------------------------------------------------

function drawBulwark(ctx, w, h) {
  const cy = h / 2;
  const E = { nose: 3.2, tail: 2.1, fullness: 0.4 };
  const geo = envelopeGeo(60, cy, 100, 46, E);

  // stern outriggers carrying the screws
  for (const s of [-1, 1]) {
    const py = cy + s * 21;
    cylinder(ctx, 30, cy + s * 14, 14, py, 3, 2.4, 'iron');
    cylinder(ctx, 22, cy + s * 6, 14, py, 2.2, 2, 'gunmetal');
    ctx.beginPath();
    ctx.arc(13, py, 4.4, 0, TAU);
    ctx.fillStyle = metalRadial(ctx, 13, py, 4.4, 'iron');
    ctx.fill();
    ink(ctx, 0.9);
    rivetRing(ctx, 13, py, 3.4, 8, 0.4, 'brass');
  }

  // armoured stub fins
  const finTop = [geo.at(-0.55, -0.82), geo.at(-0.9, -0.6), [9, 7], [20, 5.5]];
  for (const pts of [finTop, mirrorY(finTop, cy)]) {
    fin(ctx, pts, { fill: '#5b626b', edge: PAL.oxblood, spars: 2, kind: 'iron' });
  }

  // sponsons with broadside guns (under the bag; they hang off the keel)
  for (const s of [-1, 1]) {
    for (const sx of [42, 74]) {
      const y0 = cy + s * 19;
      const y1 = cy + s * 29.5;
      const top = Math.min(y0, y1);
      // barrels first, so the casemate overlaps their breeches
      for (const bx of [sx - 3.2, sx + 3.2]) {
        ctx.save();
        ctx.translate(bx, cy + s * 27);
        ctx.rotate(s * Math.PI / 2);
        cannon(ctx, 0, 0, 5, 2.8, 'gunmetal', { bands: [0.45], knob: false, taper: 0.85 });
        ctx.restore();
      }
      polygon(ctx, [
        [sx - 7.5, y0],
        [sx + 7.5, y0],
        [sx + 6, y1],
        [sx - 6, y1],
      ]);
      ctx.fillStyle = metal(ctx, sx - 7, top, sx + 7, top + 10.5, 'iron');
      ctx.fill();
      shadeOverlay(ctx, sx - 7, top, sx + 7, top + 10.5, 0.2, 0.3);
      ink(ctx, 1);
      ctx.fillStyle = PAL.oxblood;
      ctx.fillRect(sx - 6.2, y1 - s * 1.8 - 0.6, 12.4, 1.2);
      rivetLine(ctx, sx - 5.4, cy + s * 21.5, sx + 5.4, cy + s * 21.5, 2.7, 0.45, 'brass');
      porthole(ctx, sx, cy + s * 24.6, 1.1, { glow: true, color: '#ffc45e', halo: 2.2 });
    }
  }

  envelope(ctx, 60, cy, 100, 46, {
    ...E,
    fill: '#c7b58a',
    gores: 10,
    ribs: 7,
    quilt: 0.1,
    gloss: 0.25,
    stripes: [{ k0: -0.14, k1: 0.14, t0: -0.92, t1: 0.95, color: '#8c7b58' }],
    decorate(c, g) {
      grime(c, g.x(-1), cy - 23, 100, 46, 0.4, 31, { color: '#2a1e12' });
      // armour bands wrapping the gasbag
      for (const t of [-0.66, -0.38, -0.1, 0.18, 0.46]) {
        const x = g.x(t);
        const hw = g.hw(t);
        rivetedBand(c, x, cy - hw - 1, x, cy + hw + 1, 6, 'iron', { curved: true, rivets: 3.2, rows: 2 });
      }
      // dorsal spine
      rivetedBand(c, g.x(-0.95), cy, g.x(0.72), cy, 5, 'gunmetal', { rivets: 4, rows: 2 });
      // armoured nose cap
      g.path(c, 0.7, 1);
      c.fillStyle = metal(c, g.x(0.7), cy - 23, g.x(1), cy + 23, 'iron', { polish: true });
      c.fill();
      ink(c, 0.9);
      for (let k = -0.9; k <= 0.91; k += 0.15) rivet(c, g.x(0.71) + 0.9, g.y(0.71, k), 0.55, 'iron');
      for (let k = -0.75; k <= 0.76; k += 0.25) rivet(c, g.x(0.86), g.y(0.86, k), 0.5, 'iron');
    },
  });

  // ram prow with warning stripes
  polygon(ctx, [
    [geo.x(0.96), cy - 9],
    [w - 1.2, cy - 2.4],
    [w - 0.6, cy],
    [w - 1.2, cy + 2.4],
    [geo.x(0.96), cy + 9],
  ]);
  ctx.fillStyle = metal(ctx, geo.x(0.96), cy - 9, w, cy + 9, 'gunmetal');
  ctx.fill();
  ink(ctx, 1);
  hazardStripes(ctx, geo.x(0.96) - 1, cy - 9, 7, 18, { usePath: false, stripe: 1.6, ink: 0.6 });

  // stacks & deck furniture
  for (const s of [-1, 1]) smokestack(ctx, 36, cy + s * 9.5, 4.6, 'iron', { band: PAL.oxblood, soot: 12 });
  ventGrille(ctx, 50, cy - 4.5, 7, 9, { slots: 4, kind: 'iron', vertical: true });
  ventGrille(ctx, 92, cy - 6.5, 6, 4.5, { slots: 2, kind: 'iron' });
  ventGrille(ctx, 92, cy + 2, 6, 4.5, { slots: 2, kind: 'iron' });
  dome(ctx, 24, cy, 2.4, 'iron', { rivets: 6 });

  // armoured barbette
  ctx.beginPath();
  ctx.arc(78, cy, 12, 0, TAU);
  ctx.fillStyle = metal(ctx, 66, cy - 12, 90, cy + 12, 'gunmetal', { polish: true });
  ctx.fill();
  ink(ctx, 1.1);
  rivetRing(ctx, 78, cy, 11, 16, 0.55, 'iron');
  ctx.beginPath();
  ctx.arc(78, cy, 10, 0, TAU);
  ctx.lineWidth = 0.6;
  ctx.strokeStyle = PAL.oxblood;
  ctx.stroke();
}

// ---------------------------------------------------------------------------------------------
// The Tinker's Folly — round gyrocraft: brass drum, patchwork balloon, four rotor booms,
// tesla coils, gauges and a giant wind-up key.
// ---------------------------------------------------------------------------------------------

function drawTinker(ctx, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const hubs = HULL_MOUNTS.tinker.props.map(([x, y]) => [cx + x, cy + y]);

  // rotor booms: twin-rod trusses
  for (const [hx, hy] of hubs) {
    const a = Math.atan2(hy - cy, hx - cx);
    const nx = -Math.sin(a) * 1.6;
    const ny = Math.cos(a) * 1.6;
    const sx = cx + Math.cos(a) * 14;
    const sy = cy + Math.sin(a) * 14;
    cylinder(ctx, sx + nx, sy + ny, hx + nx * 0.5, hy + ny * 0.5, 1.4, 1.2, 'brass', { ink: 0.5 });
    cylinder(ctx, sx - nx, sy - ny, hx - nx * 0.5, hy - ny * 0.5, 1.4, 1.2, 'brass', { ink: 0.5 });
    for (let t = 0.15; t < 0.95; t += 0.2) {
      const px = sx + (hx - sx) * t;
      const py = sy + (hy - sy) * t;
      const q = (t * 10) % 2 < 1 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(px + nx * q, py + ny * q);
      ctx.lineTo(px + (hx - sx) * 0.2 - nx * q, py + (hy - sy) * 0.2 - ny * q);
      ctx.strokeStyle = 'rgba(122,84,32,0.95)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
    // motor housing
    ctx.beginPath();
    ctx.arc(hx, hy, 4.6, 0, TAU);
    ctx.fillStyle = metalRadial(ctx, hx, hy, 4.6, 'copper');
    ctx.fill();
    ink(ctx, 0.9);
    rivetRing(ctx, hx, hy, 3.7, 8, 0.38, 'brass');
  }

  // wind-up key at the stern
  cylinder(ctx, cx - 18, cy, cx - 31, cy, 2.4, 2.4, 'brass', { ink: 0.7 });
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx - 34.5, cy + s * 4.4, 3.6, 4.6, s * 0.25, 0, TAU);
    ctx.ellipse(cx - 34.5, cy + s * 4.4, 1.6, 2.2, s * 0.25, 0, TAU, true);
    ctx.fillStyle = metal(ctx, cx - 39, cy - 9, cx - 30, cy + 9, 'brass', { polish: true });
    ctx.fill('evenodd');
    ink(ctx, 0.8);
  }
  roundRect(ctx, cx - 33, cy - 2, 3.4, 4, 0.8);
  ctx.fillStyle = metal(ctx, cx - 33, cy - 2, cx - 29.6, cy + 2, 'brass');
  ctx.fill();
  ink(ctx, 0.6);

  // the drum: a great ring gear around a riveted deck
  gear(ctx, cx, cy, 21, 30, { kind: 'brass', toothDepth: 2, hole: 0, polish: true, outline: 1 });
  ctx.beginPath();
  ctx.arc(cx, cy, 18.4, 0, TAU);
  ctx.fillStyle = metal(ctx, cx - 18, cy - 18, cx + 18, cy + 18, 'bronze');
  ctx.fill();
  ink(ctx, 0.8);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, 16.6, 0, TAU);
  ctx.clip();
  deck(ctx, cx - 17, cy - 17, 34, 34, { radius: 0, plank: 2, ink: 0, seed: 41 });
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, 16.6, 0, TAU);
  ink(ctx, 0.6);
  rivetRing(ctx, cx, cy, 17.5, 28, 0.42, 'brass');

  // cow-catcher / bumper at the bow
  ctx.beginPath();
  ctx.arc(cx, cy, 22.6, -0.55, 0.55);
  ctx.arc(cx, cy, 20.6, 0.55, -0.55, true);
  ctx.closePath();
  ctx.fillStyle = metal(ctx, cx + 18, cy - 12, cx + 23, cy + 12, 'copper');
  ctx.fill();
  ink(ctx, 0.7);
  for (let a = -0.45; a <= 0.46; a += 0.15) {
    rivet(ctx, cx + Math.cos(a) * 21.6, cy + Math.sin(a) * 21.6, 0.4, 'brass');
  }

  // headlamps
  for (const s of [-1, 1]) {
    const lx = cx + Math.cos(s * 0.78) * 16;
    const ly = cy + Math.sin(s * 0.78) * 16;
    cylinder(ctx, lx - 2.5, ly, lx + 1.8, ly, 3.2, 3.8, 'brass', { ink: 0.6 });
    lamp(ctx, lx + 2.2, ly, 1.5, '#fff0b0', { halo: 2.6, cage: false });
  }

  // tesla coils (seen from above: stacked copper rings and an aether ball)
  for (const s of [-1, 1]) {
    const tx = cx - 15;
    const ty = cy + s * 15.5;
    pipe(ctx, [[tx + 3, ty], [cx - 4, cy + s * 11]], 1.3, 'copper', { flanges: false });
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(tx, ty, 4.4 - i * 0.8, 0, TAU);
      ctx.fillStyle = i % 2 ? '#8a4a24' : metal(ctx, tx - 4, ty - 4, tx + 4, ty + 4, 'copper');
      ctx.fill();
      ctx.lineWidth = 0.4;
      ctx.strokeStyle = 'rgba(26,14,6,0.8)';
      ctx.stroke();
    }
    glow(ctx, tx, ty, 6, PAL.aether[0], 0.7);
    ctx.beginPath();
    ctx.arc(tx, ty, 1.6, 0, TAU);
    ctx.fillStyle = '#eaffff';
    ctx.fill();
    ink(ctx, 0.4);
  }

  // patchwork balloon
  balloon(ctx, cx - 6, cy, 14.2, {
    colors: ['#efe2bf', '#b8463c', '#e3c06a', '#3f5f86', '#e7d6ae', '#9a6b45'],
    gores: 12,
    patches: 4,
    seed: 9,
  });
  // net lines holding it down
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.5;
    rigging(ctx, cx - 6 + Math.cos(a) * 13.8, cy + Math.sin(a) * 13.8, cx - 6 + Math.cos(a) * 16.5, cy + Math.sin(a) * 16.5, { width: 0.45 });
  }

  // gauges & valve wheel on the foredeck
  gauge(ctx, cx + 11, cy - 11.5, 2.4, { value: 0.82 });
  gauge(ctx, cx + 11, cy + 11.5, 2.4, { value: 0.4 });
  gear(ctx, cx - 5, cy + 18.8, 1.8, 6, { kind: 'iron', hole: 0.5 });
}

// ---------------------------------------------------------------------------------------------
// The Leviathan's Bane — dark hunter: black & oxblood bag, shark-mouth, harpoon prow, iron
// spikes, a cage of trophy whale-ribs, bat-wing fins.
// ---------------------------------------------------------------------------------------------

function drawBane(ctx, w, h) {
  const cy = h / 2;
  const E = { nose: 1.55, tail: 1.6, fullness: 0.52 };
  const geo = envelopeGeo(56, cy, 84, 34, E);

  // pylons + dark engine pods
  for (const s of [-1, 1]) {
    const py = cy + s * 18.5;
    polygon(ctx, [geo.at(-0.02, s * 0.85), geo.at(-0.2, s * 0.85), [40, py], [48, py]]);
    ctx.fillStyle = metal(ctx, 38, cy - 19, 58, cy + 19, 'blackiron');
    ctx.fill();
    ink(ctx, 0.8);
    nacelle(ctx, 47, py, 17, 5.6, { kind: 'blackiron', band: PAL.oxblood, nose: 'iron', glow: '#ff5a2a' });
    spike(ctx, 55.2, py, 4, 2, 0, 'iron');
    lamp(ctx, 47, py + s * 2.9, 0.8, '#ff3b2a', { halo: 3, cage: false });
  }

  // bat-wing fins
  const finTop = [geo.at(-0.42, -0.72), geo.at(-0.93, -0.5), [3.5, 4.5], [8.5, 1.3], [13, 5], [18, 1.6], [24, 6.5]];
  for (const pts of [finTop, mirrorY(finTop, cy)]) {
    fin(ctx, pts, { fill: '#4a1618', edge: null, spars: 3, kind: 'iron' });
    // spar tips are iron claws
    for (const p of [pts[3], pts[5]]) {
      ctx.beginPath();
      ctx.arc(p[0], p[1], 0.8, 0, TAU);
      ctx.fillStyle = '#2a2624';
      ctx.fill();
    }
  }

  // flank spikes (under the bag edge so they emerge from it)
  for (const s of [-1, 1]) {
    for (const t of [-0.62, -0.42, 0.2, 0.4, 0.6]) {
      const [x, y] = geo.at(t, s * 0.9);
      spike(ctx, x, y, 5 + (t > 0 ? 0.6 : 0), 2.6, s * (Math.PI / 2 + 0.35), 'iron');
    }
  }

  envelope(ctx, 56, cy, 84, 34, {
    ...E,
    fill: '#2b2427',
    gores: 8,
    ribs: 7,
    seam: 'rgba(0,0,0,0.45)',
    quilt: 0.2,
    gloss: 0.55,
    light: 0.85,
    stitch: false,
    stripes: [
      { k0: -0.24, k1: 0.24, t0: -0.94, t1: 0.95, color: '#7a2624' },
      { k0: -0.3, k1: -0.26, t0: -0.9, t1: 0.92, color: '#a8893e' },
      { k0: 0.26, k1: 0.3, t0: -0.9, t1: 0.92, color: '#a8893e' },
    ],
    decorate(c, g) {
      // shark mouth along each flank near the nose
      for (const s of [-1, 1]) {
        envelopeStripePath(c, g, s * 0.48, s * 0.86, 0.34, 0.9);
        c.fillStyle = '#3d0606';
        c.fill();
        const N = 7;
        for (let i = 0; i < N; i++) {
          const t0 = 0.36 + (i / N) * 0.52;
          const t1 = 0.36 + ((i + 1) / N) * 0.52;
          const tm = (t0 + t1) / 2;
          polygon(c, [
            [g.x(t0), g.y(t0, s * 0.5)],
            [g.x(t1), g.y(t1, s * 0.5)],
            [g.x(tm), g.y(tm, s * 0.72)],
          ]);
          c.fillStyle = '#efe4c8';
          c.fill();
          polygon(c, [
            [g.x(t0 + 0.035), g.y(t0, s * 0.84)],
            [g.x(t1 + 0.035), g.y(t1, s * 0.84)],
            [g.x(tm + 0.035), g.y(tm, s * 0.64)],
          ]);
          c.fill();
        }
        // a glowing eye
        const [ex, ey] = g.at(0.82, s * 0.36);
        glow(c, ex, ey, 3, '#ff3d2a', 0.9);
        c.beginPath();
        c.arc(ex, ey, 1, 0, TAU);
        c.fillStyle = '#ffd2a0';
        c.fill();
      }
      grime(c, g.x(-1), cy - 17, 84, 34, 0.25, 51, { color: '#000000' });
    },
  });

  // trophy ribs (whale bones) lashed over the bag
  for (const t of [-0.56, -0.32, -0.08]) {
    const x = geo.x(t);
    const hw = geo.hw(t);
    bone(ctx, x + 2.2, cy - hw - 1.5, x + 2.2, cy + hw + 1.5, 2, { bend: -2.4, knobs: true });
    for (const s of [-1, 1]) {
      const yy = cy + s * (hw * 0.62);
      ctx.fillStyle = '#5a3d1e';
      ctx.fillRect(x - 0.4, yy - 0.7, 3.4, 1.4);
      ctx.fillStyle = 'rgba(255,230,180,0.35)';
      ctx.fillRect(x - 0.4, yy - 0.7, 3.4, 0.4);
    }
  }

  // harpoon prow
  const nx = geo.x(1);
  cylinder(ctx, nx - 9, cy, w - 7, cy, 2.2, 1.8, 'iron', { ink: 0.7 });
  ropeLine(ctx, nx - 4, cy - 1.2, nx + 4, cy + 1.2, 0.8, { sag: 0.8 });
  polygon(ctx, [
    [w - 0.4, cy],
    [w - 7, cy - 3.4],
    [w - 5.4, cy - 1.1],
    [w - 9.5, cy - 1.1],
    [w - 9.5, cy + 1.1],
    [w - 5.4, cy + 1.1],
    [w - 7, cy + 3.4],
  ]);
  ctx.fillStyle = metal(ctx, w - 10, cy - 3.4, w, cy + 3.4, 'steel', { polish: true });
  ctx.fill();
  ink(ctx, 0.7);
  ctx.beginPath();
  ctx.moveTo(w - 9, cy - 0.3);
  ctx.lineTo(w - 1.4, cy - 0.15);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 0.35;
  ctx.stroke();
  skull(ctx, nx - 5.5, cy, 3.4, { horns: true, rot: Math.PI / 2 });

  // rudder: black blade with a spine of spikes and a tattered ensign
  const rx0 = geo.x(-0.42);
  polygon(ctx, [
    [rx0, cy - 0.9],
    [2.4, cy - 1.8],
    [1, cy],
    [2.4, cy + 1.8],
    [rx0, cy + 0.9],
  ]);
  ctx.fillStyle = cylinderGrad(ctx, 0, cy - 1.8, 0, cy + 1.8, 'blackiron');
  ctx.fill();
  ink(ctx, 0.8);
  for (let x = rx0 - 3; x > 6; x -= 4.5) spike(ctx, x, cy, 3.4, 1.6, Math.PI, 'iron');
  flag(ctx, 10.5, cy - 4.6, 8, 4.2, ['#151112', '#151112'], { dir: -1, wave: 1, swallow: true, emblem: '#d9ccb0' });

  // gun deck in blackened iron
  gunDeck(ctx, 66, cy, 10.2, { kind: 'bronze', rivets: 10 });
  ctx.beginPath();
  ctx.arc(66, cy, 10.2, 0, TAU);
  ctx.lineWidth = 0.6;
  ctx.strokeStyle = PAL.oxblood;
  ctx.stroke();
}

registerHull('dauntless', drawDauntless);
registerHull('cormorant', drawCormorant);
registerHull('bulwark', drawBulwark);
registerHull('tinker', drawTinker);
registerHull('bane', drawBane);

// Unused-import guard for helpers kept available to hull authors.
void [rivetLine, railing, coil, crest, chain, stitching, plate, roundRect];
