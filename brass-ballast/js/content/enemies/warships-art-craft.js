// WP13 — art for the smaller Iron Syndicate craft: Tesla Buoy, Ornithopter Ace and Steam Wraith.
// Top-down, facing +x, light from the top-left, dark outlines, no baked drop shadow.

import {
  TAU,
  alpha,
  cannon,
  chain,
  cylinder,
  cylinderGrad,
  deck,
  dome,
  flag,
  glow,
  glowEllipse,
  grime,
  ink,
  metal,
  metalRadial,
  polygon,
  rivet,
  rivetRing,
  rivetedBand,
  seeded,
  shadeOverlay,
  skull,
  smoothPath,
  ventGrille,
  bone,
} from '../../gfx/drawkit.js';
import { SYN, reg, armor, emberPort, synStack, hotDot, wash } from './warships-kit.js';

// =============================================================================================
// Tesla Buoy — a floating iron mine-buoy crowned by a tesla toroid; three stabiliser vanes,
// ceramic insulator stacks, crimson band. Pairs throw a magenta arc between them.
// =============================================================================================

export const BUOY = { w: 46, h: 46 };

function drawBuoy(ctx, w, h) {
  const x = w / 2;
  const y = h / 2;
  // stabiliser vanes
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.35;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const P = (r, o) => [x + c * r - s * o, y + s * r + c * o];
    armor(ctx, [P(11, -4.6), P(21.5, -2.4), P(22.5, 0.6), P(13, 4.2)], 'gunmetal', { ink: 1, hi: 0.2, lo: 0.4 });
    polygon(ctx, [P(19.2, -2.9), P(21.5, -2.4), P(22.5, 0.6), P(20.4, 1.2)]);
    ctx.fillStyle = SYN.crimson;
    ctx.fill();
    ink(ctx, 0.5);
    rivet(ctx, ...P(15, -0.6), 0.5, 'gunmetal');
  }
  // float hull
  ctx.beginPath();
  ctx.arc(x, y, 15, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, x, y, 15, 'syndicate', { spec: 0.35 });
  ctx.fill();
  ink(ctx, 1.3);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 15, 0, TAU);
  ctx.clip();
  grime(ctx, x - 15, y - 15, 30, 30, 0.35, 18, { color: '#0e0f12' });
  ctx.restore();
  // crimson band
  ctx.beginPath();
  ctx.arc(x, y, 13.4, 0, TAU);
  ctx.arc(x, y, 11.8, 0, TAU, true);
  ctx.fillStyle = SYN.crimson;
  ctx.fill('evenodd');
  ctx.beginPath();
  ctx.arc(x, y, 13.4, 0, TAU);
  shadeOverlay(ctx, x - 14, y - 14, x + 14, y + 14, 0.2, 0.35);
  rivetRing(ctx, x, y, 14.3, 18, 0.42, 'gunmetal');
  // insulator stacks
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.35 + Math.PI / 3;
    const ix = x + Math.cos(a) * 9.3;
    const iy = y + Math.sin(a) * 9.3;
    for (const [r, k] of [
      [2.5, '#cdbf9c'],
      [1.8, '#efe6cc'],
      [1.1, '#fffaf0'],
    ]) {
      ctx.beginPath();
      ctx.arc(ix - (2.5 - r) * 0.25, iy - (2.5 - r) * 0.25, r, 0, TAU);
      ctx.fillStyle = k;
      ctx.fill();
      ink(ctx, 0.4);
    }
  }
  // toroid (polished steel doughnut) with copper windings
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, 6.4, 0, TAU);
  ctx.strokeStyle = metal(ctx, x - 8, y - 8, x + 8, y + 8, 'steel', { polish: true });
  ctx.stroke();
  ctx.lineWidth = 0.45;
  ctx.strokeStyle = 'rgba(180,100,60,0.85)';
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * 4.6, y + Math.sin(a) * 4.6);
    ctx.lineTo(x + Math.cos(a) * 8.2, y + Math.sin(a) * 8.2);
    ctx.stroke();
  }
  for (const r of [4.4, 8.4]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ink(ctx, 0.7);
  }
  ctx.beginPath();
  ctx.arc(x, y, 6.4, Math.PI * 1.05, Math.PI * 1.55);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 0.9;
  ctx.stroke();
  // charged well + terminal sphere
  ctx.beginPath();
  ctx.arc(x, y, 4.3, 0, TAU);
  const g = ctx.createRadialGradient(x, y, 0, x, y, 4.3);
  g.addColorStop(0, '#ffd0ea');
  g.addColorStop(0.45, SYN.arc);
  g.addColorStop(1, '#3a0a24');
  ctx.fillStyle = g;
  ctx.fill();
  glow(ctx, x, y, 9, SYN.arc, 0.45);
  ctx.beginPath();
  ctx.arc(x, y, 1.9, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, x, y, 1.9, 'steel', { spec: 0.8 });
  ctx.fill();
  ink(ctx, 0.4);
}

/** Crackling glow overlay for the toroid (draw additively). */
function drawBuoyGlow(ctx, w, h, f) {
  const x = w / 2;
  const y = h / 2;
  glow(ctx, x, y, 12 + (f % 2) * 2, SYN.arc, 0.7);
  glow(ctx, x, y, 4, SYN.arcCore, 0.9, { core: 0.3 });
  const rnd = seeded(101 + f * 7);
  for (let i = 0; i < 3; i++) {
    const a = rnd() * TAU;
    const r1 = 15 + rnd() * 6;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6);
    const n = 4;
    for (let k = 1; k <= n; k++) {
      const rr = 6 + ((r1 - 6) * k) / n;
      const aa = a + (rnd() - 0.5) * 0.7;
      ctx.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr);
    }
    ctx.strokeStyle = alpha(SYN.arc, 0.75);
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.strokeStyle = SYN.arcCore;
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
}

reg('enemy_teslaBuoy', BUOY.w, BUOY.h, drawBuoy);
reg('enemy_teslaBuoy_glow', BUOY.w, BUOY.h, drawBuoyGlow, { frames: 4 });

// =============================================================================================
// Ornithopter Ace — a needle-nosed flapping flyer with crimson bat-wing membranes on iron ribs,
// a glowing canopy, twin nose guns and a fanned tail. Four wing-beat frames.
// =============================================================================================

export const ORNI = { w: 52, h: 52, frames: 4, spans: [1, 0.8, 0.52, 0.8] };

function drawWing(ctx, cy, side, span, light) {
  const s = side;
  const Y = (o) => cy + s * o;
  const sh = [28, Y(3)];
  const lead = [33, Y(3 + 11 * span)];
  const tip = [24, Y(3 + 22 * span)];
  const sc1 = [14, Y(3 + 17 * span)];
  const sc1i = [17, Y(3 + 13.5 * span)];
  const sc2 = [10, Y(3 + 9.5 * span)];
  const sc2i = [14, Y(3 + 7 * span)];
  const root = [15, Y(2.4)];
  // membrane
  ctx.beginPath();
  ctx.moveTo(sh[0], sh[1]);
  ctx.quadraticCurveTo(lead[0], lead[1], tip[0], tip[1]);
  ctx.quadraticCurveTo(sc1i[0] + 2, sc1i[1] + s * 2, sc1[0], sc1[1]);
  ctx.quadraticCurveTo(sc2i[0] + 1, sc2i[1] + s * 1, sc2[0], sc2[1]);
  ctx.quadraticCurveTo(sc2i[0], sc2i[1] - s * 2, root[0], root[1]);
  ctx.closePath();
  const g = ctx.createLinearGradient(sh[0], sh[1], tip[0], tip[1]);
  g.addColorStop(0, '#6a6e78');
  g.addColorStop(0.55, '#474b54');
  g.addColorStop(1, '#2a2c32');
  ctx.fillStyle = g;
  ctx.fill();
  // membrane folds, darker as the wing tilts away from the light
  ctx.save();
  ctx.clip();
  // crimson war-paint along the scalloped trailing edge
  ctx.beginPath();
  ctx.moveTo(tip[0], tip[1]);
  ctx.quadraticCurveTo(sc1i[0] + 2, sc1i[1] + s * 2, sc1[0], sc1[1]);
  ctx.quadraticCurveTo(sc2i[0] + 1, sc2i[1] + s * 1, sc2[0], sc2[1]);
  ctx.quadraticCurveTo(sc2i[0], sc2i[1] - s * 2, root[0], root[1]);
  ctx.strokeStyle = SYN.crimson;
  ctx.lineWidth = 5;
  ctx.stroke();
  // canvas panel seams between the ribs
  ctx.strokeStyle = 'rgba(15,12,10,0.35)';
  ctx.lineWidth = 0.4;
  for (const k of [0.33, 0.66]) {
    ctx.beginPath();
    ctx.moveTo(sh[0], sh[1]);
    ctx.lineTo(tip[0] + (sc2[0] - tip[0]) * k, tip[1] + (sc2[1] - tip[1]) * k);
    ctx.stroke();
  }
  ctx.fillStyle = `rgba(10,4,4,${(0.55 - light * 0.5).toFixed(3)})`;
  ctx.fillRect(0, 0, 60, 60);
  if (s < 0) {
    const hl = ctx.createLinearGradient(sh[0], sh[1], tip[0], tip[1]);
    hl.addColorStop(0, `rgba(255,220,200,${(0.25 * light).toFixed(3)})`);
    hl.addColorStop(1, 'rgba(255,220,200,0)');
    ctx.fillStyle = hl;
    ctx.fillRect(0, 0, 60, 60);
  }
  ctx.restore();
  ink(ctx, 0.9);
  // iron finger ribs
  const ribs = [tip, sc1, sc2];
  for (const p of ribs) cylinder(ctx, sh[0] - 1, sh[1], p[0], p[1], 1.1, 0.5, 'gunmetal');
  // leading-edge spar
  ctx.beginPath();
  ctx.moveTo(sh[0], sh[1]);
  ctx.quadraticCurveTo(lead[0], lead[1], tip[0], tip[1]);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = metal(ctx, tip[0], tip[1] - 6, sh[0], sh[1] + 6, 'gunmetal');
  ctx.stroke();
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = 'rgba(20,12,8,0.7)';
  ctx.stroke();
  // brass claw at the tip
  rivet(ctx, tip[0], tip[1], 0.8, 'brass');
}

function drawOrnithopter(ctx, w, h, f) {
  const cy = h / 2;
  const span = ORNI.spans[f];
  const light = 0.35 + 0.65 * span;
  // tail fan
  for (let i = -2; i <= 2; i++) {
    const a = Math.PI + i * 0.32;
    const bx = 11;
    const len = 10 - Math.abs(i) * 1.2;
    const tx = bx + Math.cos(a) * len;
    const ty = cy + Math.sin(a) * len;
    const px = -Math.sin(a) * 1.7;
    const py = Math.cos(a) * 1.7;
    polygon(ctx, [
      [bx + px * 0.4, cy + py * 0.4],
      [tx + px, ty + py],
      [tx + Math.cos(a) * 1.4, ty + Math.sin(a) * 1.4],
      [tx - px, ty - py],
      [bx - px * 0.4, cy - py * 0.4],
    ]);
    ctx.fillStyle = i % 2 === 0 ? SYN.crimson : '#3e424a';
    ctx.fill();
    ink(ctx, 0.6);
  }
  // wings (bottom wing first so the lit top wing overlaps)
  drawWing(ctx, cy, 1, span, light * 0.85);
  drawWing(ctx, cy, -1, span, light);
  // twin nose guns
  for (const s of [-1, 1]) cannon(ctx, 34, cy + s * 3.4, 12, 1.6, 'blackiron', { bands: [0.5], knob: false, taper: 0.8 });
  // fuselage
  const body = [
    [49, cy],
    [44, cy - 2.6],
    [34, cy - 4.4],
    [22, cy - 4],
    [12, cy - 2.4],
    [7, cy],
    [12, cy + 2.4],
    [22, cy + 4],
    [34, cy + 4.4],
    [44, cy + 2.6],
  ];
  smoothPath(ctx, body);
  ctx.fillStyle = cylinderGrad(ctx, 0, cy - 4.4, 0, cy + 4.4, 'syndicate');
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = cylinderGrad(ctx, 0, cy - 4.4, 0, cy + 4.4, 'crimson');
  ctx.fillRect(42, cy - 5, 8, 10);
  ctx.fillStyle = 'rgba(10,8,8,0.55)';
  ctx.fillRect(41.6, cy - 5, 0.5, 10);
  ctx.fillRect(26, cy - 5, 0.4, 10);
  ctx.restore();
  smoothPath(ctx, body);
  ink(ctx, 1.1);
  // canopy with a goggled pilot lit by the instruments
  ctx.beginPath();
  ctx.ellipse(34, cy, 4.2, 2.6, 0, 0, TAU);
  const cg = ctx.createRadialGradient(33, cy - 1, 0, 34, cy, 4.2);
  cg.addColorStop(0, '#ffcf9a');
  cg.addColorStop(0.45, '#c2502a');
  cg.addColorStop(1, '#2a0e08');
  ctx.fillStyle = cg;
  ctx.fill();
  ink(ctx, 0.7);
  ctx.beginPath();
  ctx.ellipse(33, cy - 0.9, 2.4, 0.8, -0.1, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();
  glowEllipse(ctx, 34, cy, 6, 3.6, SYN.ember, 0.3);
  // engine hump with stack and vents
  ctx.beginPath();
  ctx.ellipse(21, cy, 4.6, 3, 0, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, 21, cy, 4.6, 'gunmetal', { spec: 0.3 });
  ctx.fill();
  ink(ctx, 0.6);
  synStack(ctx, 20, cy, 1.6, { soot: 5, flange: false });
  for (const s of [-1, 1]) rivet(ctx, 25, cy + s * 2.2, 0.45, 'gunmetal');
}

reg('enemy_ornithopter', ORNI.w, ORNI.h, drawOrnithopter, { frames: ORNI.frames });

// =============================================================================================
// Steam Wraith — a burned-out ghost ship: charred hull with bone ribs showing through, spectral
// tattered sails, chains trailing, a skull figurehead with ember eyes.
// =============================================================================================

export const WRAITH = { w: 72, h: 54 };

function wraithHull(cy) {
  return [
    [68, cy],
    [58, cy - 8.5],
    [42, cy - 12.5],
    [17, cy - 12],
    [8, cy - 9],
    [4.5, cy - 4],
    [4.5, cy + 4],
    [8, cy + 9],
    [17, cy + 12],
    [42, cy + 12.5],
    [58, cy + 8.5],
  ];
}

function drawWraith(ctx, w, h) {
  const cy = h / 2;
  const hull = wraithHull(cy);
  // spectral mist the wreck rides on
  wash(ctx, 36, cy, 35, 25, SYN.ghost, 0.2);
  wash(ctx, 20, cy, 20, 15, SYN.ghostDeep, 0.18);
  // trailing chains
  chain(ctx, 8, cy - 7, 1.5, cy - 13, 1.7, 'iron');
  chain(ctx, 8, cy + 7, 2, cy + 15, 1.7, 'iron');

  // charred hull
  smoothPath(ctx, hull);
  const hg = ctx.createLinearGradient(4, cy - 13, 40, cy + 16);
  hg.addColorStop(0, '#4a3c34');
  hg.addColorStop(0.5, '#2a211d');
  hg.addColorStop(1, '#120d0b');
  ctx.fillStyle = hg;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // planking strakes along the hull
  ctx.strokeStyle = 'rgba(8,4,2,0.55)';
  ctx.lineWidth = 0.45;
  for (let k = -11; k <= 11; k += 2.2) {
    ctx.beginPath();
    ctx.moveTo(4, cy + k);
    ctx.quadraticCurveTo(40, cy + k * 1.08, 68, cy + k * 0.2);
    ctx.stroke();
  }
  grime(ctx, 4, cy - 13, 64, 26, 0.7, 66, { color: '#060404', streaks: 0.5 });
  // burn-through holes revealing bone ribs & ghost-light
  const holes = [
    [30, cy - 10.5, 5, 3.2],
    [50, cy + 8.6, 4.2, 2.8],
    [14, cy + 8.8, 3.6, 2.4],
  ];
  for (const [hx, hy, hw, hh] of holes) {
    const rnd = seeded(hx * 13);
    const pts = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      const k = 0.65 + rnd() * 0.5;
      pts.push([hx + Math.cos(a) * hw * k, hy + Math.sin(a) * hh * k]);
    }
    polygon(ctx, pts);
    ctx.fillStyle = '#0d1514';
    ctx.fill();
    ctx.save();
    ctx.clip();
    glow(ctx, hx, hy, hw * 1.4, SYN.ghost, 0.55);
    for (let rx = hx - hw; rx <= hx + hw; rx += 2.2) bone(ctx, rx, hy - hh - 1, rx + 0.3, hy + hh + 1, 0.9, { knobs: false, color: '#d8ccaa' });
    ctx.restore();
    polygon(ctx, pts);
    ctx.strokeStyle = 'rgba(255,120,60,0.55)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
  shadeOverlay(ctx, 4, cy - 13, 68, cy + 13, 0.12, 0.45);
  ctx.restore();
  smoothPath(ctx, hull);
  ink(ctx, 1.4);

  // the deck, with missing planks showing the glow below
  const deckPts = [
    [60, cy],
    [52, cy - 6],
    [40, cy - 9.2],
    [18, cy - 9],
    [10, cy - 6.5],
    [8, cy],
    [10, cy + 6.5],
    [18, cy + 9],
    [40, cy + 9.2],
    [52, cy + 6],
  ];
  ctx.save();
  smoothPath(ctx, deckPts);
  ctx.clip();
  deck(ctx, 6, cy - 10, 56, 20, { plank: 2.2, kind: 'darkwood', seed: 9, ink: 0, radius: 0 });
  ctx.fillStyle = 'rgba(14,10,10,0.62)';
  ctx.fillRect(6, cy - 10, 56, 20);
  const rnd = seeded(5);
  for (let i = 0; i < 6; i++) {
    const gx = 14 + rnd() * 40;
    const gy = cy - 8 + Math.floor(rnd() * 7) * 2.2;
    const gl = 3 + rnd() * 6;
    ctx.fillStyle = '#0b1211';
    ctx.fillRect(gx, gy, gl, 1.5);
    glowEllipse(ctx, gx + gl / 2, gy + 0.75, gl * 0.8, 1.8, SYN.ghost, 0.35);
  }
  ctx.restore();
  smoothPath(ctx, deckPts);
  ink(ctx, 0.8);
  // corroded iron straps
  for (const x of [22, 46]) rivetedBand(ctx, x, cy - 11.5, x + 1, cy + 11.5, 1.8, 'blackiron', { rivets: 3 });

  // masts with tattered spectral sails (yards across the beam, cloth billowing aft)
  for (const [mx, span, seed] of [
    [45, 17, 3],
    [25, 19, 8],
  ]) {
    const r2 = seeded(seed);
    const top = cy - span;
    const bot = cy + span;
    // ragged trailing edge: long tattered tongues streaming aft
    const pts = [[mx + 1, top]];
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const y = top + ((bot - top) * i) / steps;
      const belly = Math.sin((i / steps) * Math.PI);
      const tongue = i % 2 === 0 ? 2 + r2() * 6 : r2() * 1.5;
      pts.push([mx - 2 - belly * 5 - tongue, y + (r2() - 0.5) * 1.2]);
    }
    pts.push([mx + 1, bot]);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    // holes (evenodd)
    for (let k = 0; k < 4; k++) {
      const hx = mx - 2.5 - r2() * 4;
      const hy = top + 3 + r2() * (bot - top - 6);
      const hr = 0.7 + r2() * 1.3;
      ctx.moveTo(hx + hr, hy);
      ctx.arc(hx, hy, hr, 0, TAU);
    }
    const sg = ctx.createLinearGradient(mx + 1, 0, mx - 14, 0);
    sg.addColorStop(0, 'rgba(236,255,248,0.92)');
    sg.addColorStop(0.5, 'rgba(178,236,218,0.7)');
    sg.addColorStop(1, 'rgba(120,205,186,0.35)');
    ctx.fillStyle = sg;
    ctx.fill('evenodd');
    ctx.lineWidth = 0.45;
    ctx.strokeStyle = 'rgba(200,255,240,0.5)';
    ctx.stroke();
    // sail seams
    ctx.strokeStyle = 'rgba(60,100,92,0.35)';
    ctx.lineWidth = 0.4;
    for (let y = top + 4; y < bot; y += 4.5) {
      ctx.beginPath();
      ctx.moveTo(mx, y);
      ctx.lineTo(mx - 7, y);
      ctx.stroke();
    }
    cylinder(ctx, mx + 1, top - 0.5, mx + 1, bot + 0.5, 1.4, 1.4, 'darkwood', { capStart: true, capEnd: true });
    dome(ctx, mx + 1, cy, 2.3, 'blackiron', { rivets: 5 });
  }

  // aft cabin with ember-lit stern windows
  armor(ctx, [
    [16, cy - 6],
    [10, cy - 5],
    [7.5, cy],
    [10, cy + 5],
    [16, cy + 6],
  ], 'blackiron', { ink: 0.8 });
  for (const s of [-1, 0, 1]) emberPort(ctx, 9.2, cy + s * 2.8, 0.75, 2.4);
  // ember lanterns on the quarters & bow
  for (const [lx, ly] of [
    [12, cy - 10.5],
    [12, cy + 10.5],
    [58, cy - 5.5],
  ]) hotDot(ctx, lx, ly, 0.8, '#ff5a2a');
  ventGrille(ctx, 33, cy - 2, 4, 4, { slots: 2, kind: 'blackiron', glow: SYN.ghost });
  // figurehead
  skull(ctx, 64, cy, 3.6, { color: '#e6d8b4', eyes: '#ff5a2a', rot: Math.PI / 2 });
  // tattered Syndicate pennant at the stern
  flag(ctx, 5, cy - 1.5, 7, 3, [SYN.crimsonDark, '#1a1a1a'], { dir: -1, wave: 1.2, swallow: true });
}

/** Ghost aura for the phased shimmer (draw additively). */
function drawWraithAura(ctx, w, h) {
  glowEllipse(ctx, w / 2, h / 2, w * 0.48, h * 0.44, SYN.ghost, 0.5);
  glowEllipse(ctx, w / 2, h / 2, w * 0.3, h * 0.26, '#ffffff', 0.25);
}

reg('enemy_steamWraith', WRAITH.w, WRAITH.h, drawWraith);
reg('enemy_steamWraith_aura', 92, 72, drawWraithAura);
