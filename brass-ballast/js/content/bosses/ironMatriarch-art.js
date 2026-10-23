// Iron Matriarch — procedural art (WP14). Registers every 'boss_ironMatriarch*' sprite and
// exports the hull geometry the behaviour module (ironMatriarch.js) uses to place turrets,
// gunports, stacks, the scout hatch and the hitbox chain.
//
// All geometry is in hull-local units: origin = hull centre, +x = bow, +y = starboard.
// The hull sprite is 400×200 with its pivot at the centre, so local (x, y) maps 1:1.

import { Sprites } from '../../gfx/sprites.js';
import {
  TAU, metal, cylinderGrad, roundRect, polygon, ink, shadeOverlay, rimLight,
  glow, rivet, rivetLine, rivetRing, gear, porthole, cylinder, pipe, plate, smokestack, grime,
  cannon, ventGrille, hazardStripes, gauge, lamp, dome, deck, railing, nacelle,
  ringMount, panelLines, chain, flag, crest, nameplate, seeded, mix,
  ambientOcclusion, spike,
} from '../../gfx/drawkit.js';

// ---- Geometry (shared with the behaviour module) ----------------------------------------------

export const HULL_W = 420;
export const HULL_H = 200;
const STERN = -184;
const BOW = 192;
const BEAM = 82;

/** Half-width of the hull at local x (0 outside the hull). */
export function hullHalfWidth(x) {
  if (x < STERN || x > BOW) return 0;
  if (x < -160) return 68 + 14 * Math.sin(((x - STERN) / 24) * (Math.PI / 2));
  if (x <= 30) return BEAM;
  const u = (x - 30) / (BOW - 30);
  return BEAM * Math.pow(Math.max(0, 1 - Math.pow(u, 2.2)), 0.8);
}

/** Four deck turrets (fore pair, aft pair). */
export const TURRET_MOUNTS = [
  { x: 82, y: -38 },
  { x: 82, y: 38 },
  { x: -132, y: -40 },
  { x: -132, y: 40 },
];
/** Broadside gunport x positions (one row per flank). */
export const PORT_XS = [-150, -108, -66, -24, 18, 60];
/** Smokestacks along the centreline (bow → stern). */
export const STACKS = [
  { x: 40, y: 0, r: 13 },
  { x: 8, y: 0, r: 13 },
  { x: -24, y: 0, r: 13 },
];
export const HATCH = { x: 120, y: 0, w: 30, h: 24 };
export const CORE = { x: 8, y: 0 };
export const BRIDGE = { x: -72, y: 0 };
/** Circles approximating the hull for bullets (x, r). */
export const HITBOXES = [
  { x: -150, r: 74 },
  { x: -88, r: 80 },
  { x: -26, r: 80 },
  { x: 36, r: 78 },
  { x: 100, r: 62 },
  { x: 150, r: 40 },
  { x: 180, r: 20 },
];
/** Spots that catch fire as the hull takes damage (ordered by when they ignite). */
export const FIRE_SPOTS = [
  { x: -60, y: -52 },
  { x: 58, y: 44 },
  { x: -150, y: 10 },
  { x: 140, y: -14 },
  { x: -10, y: 58 },
  { x: 24, y: -60 },
  { x: -110, y: 50 },
  { x: 96, y: 4 },
];

// ---- Hull paths ---------------------------------------------------------------------------------

function hullPoints(inset = 0) {
  const pts = [];
  const N = 64;
  for (let i = 0; i <= N; i++) {
    const x = STERN + inset * 0.6 + ((BOW - inset * 1.4 - STERN - inset * 0.6) * i) / N;
    pts.push([x, -Math.max(0, hullHalfWidth(x) - inset)]);
  }
  for (let i = N; i >= 0; i--) {
    const x = STERN + inset * 0.6 + ((BOW - inset * 1.4 - STERN - inset * 0.6) * i) / N;
    pts.push([x, Math.max(0, hullHalfWidth(x) - inset)]);
  }
  return pts;
}

function hullPath(ctx, inset = 0) {
  polygon(ctx, hullPoints(inset));
}

// ---- Hull sprite ----------------------------------------------------------------------------

function drawHull(ctx) {
  ctx.save();
  ctx.translate(HULL_W / 2, HULL_H / 2);

  // Stern engine nacelles on outriggers (under the hull edge).
  for (const s of [-1, 1]) {
    nacelle(ctx, -190, s * 44, 34, 16, { kind: 'gunmetal', band: '#c0392b', nose: 'iron', glow: '#ff7a2f' });
  }
  // Ram spike at the bow.
  spike(ctx, BOW - 8, 0, 14, 16, 0, 'blackiron');
  polygon(ctx, [
    [BOW - 30, -9],
    [BOW + 6, 0],
    [BOW - 30, 9],
  ]);
  ctx.fillStyle = cylinderGrad(ctx, 0, -9, 0, 9, 'crimson');
  ctx.fill();
  ink(ctx, 1);

  // Gunport casemates & barrels poking out of both flanks (drawn first: the hull overlaps them).
  for (const s of [-1, 1]) {
    for (const px of PORT_XS) {
      const hy = hullHalfWidth(px);
      ctx.save();
      ctx.translate(px, s * (hy - 4));
      ctx.rotate(s * Math.PI / 2);
      cannon(ctx, 0, 0, 16, 8, 'blackiron', { taper: 0.82, bands: [0.35], knob: false });
      ctx.restore();
    }
  }

  // --- Outer hull: riveted iron, darker armour belt at the waterline.
  ambientOcclusion(ctx, () => hullPath(ctx, 0), 0.4, 3);
  hullPath(ctx, 0);
  ctx.fillStyle = metal(ctx, STERN, -BEAM, BOW, BEAM, 'syndicate');
  ctx.fill();
  ctx.save();
  hullPath(ctx, 0);
  ctx.clip();
  // armour belt (stroke the outline wide, keep the inner half)
  hullPath(ctx, 0);
  ctx.lineWidth = 26;
  ctx.strokeStyle = '#24262b';
  ctx.stroke();
  hullPath(ctx, 0);
  ctx.lineWidth = 24;
  ctx.strokeStyle = metal(ctx, STERN, -BEAM, BOW, BEAM, 'gunmetal');
  ctx.stroke();
  // belt plate seams
  ctx.strokeStyle = 'rgba(10,8,6,0.55)';
  ctx.lineWidth = 0.8;
  for (let x = STERN + 16; x < BOW - 10; x += 22) {
    const hy = hullHalfWidth(x);
    ctx.beginPath();
    ctx.moveTo(x, -hy);
    ctx.lineTo(x + 2, -hy + 12);
    ctx.moveTo(x, hy);
    ctx.lineTo(x + 2, hy - 12);
    ctx.stroke();
  }
  grime(ctx, STERN, -BEAM, BOW - STERN, BEAM * 2, 0.35, 41, { color: '#120c08', streaks: 0.6 });
  ctx.restore();
  hullPath(ctx, 0);
  shadeOverlay(ctx, STERN, -BEAM, BOW, BEAM, 0.2, 0.35);
  rimLight(ctx, STERN, -BEAM, BOW, BEAM, 1.2, 0.5);
  hullPath(ctx, 0);
  ink(ctx, 1.6);

  // rivet rows along the belt
  for (const s of [-1, 1]) {
    for (let x = STERN + 8; x < BOW - 12; x += 5.5) {
      const hy = hullHalfWidth(x);
      if (hy < 14) continue;
      rivet(ctx, x, s * (hy - 3.5), 0.75, 'gunmetal');
      rivet(ctx, x + 2.7, s * (hy - 10), 0.65, 'gunmetal');
    }
  }

  // --- Crimson sheer stripe
  hullPath(ctx, 13);
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = '#7a1d14';
  ctx.stroke();
  hullPath(ctx, 13);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#c0392b';
  ctx.stroke();

  // --- Steel deck
  const deckPath = () => hullPath(ctx, 16);
  deckPath();
  ctx.fillStyle = metal(ctx, STERN, -BEAM, BOW, BEAM, 'iron');
  ctx.fill();
  ctx.save();
  deckPath();
  ctx.clip();
  panelLines(ctx, STERN, -BEAM, BOW - STERN, BEAM * 2, 18, 11, { a: 0.32 });
  // teak walkways either side of the superstructure
  for (const s of [-1, 1]) {
    deck(ctx, -170, s > 0 ? 50 : -62, 220, 12, { radius: 0, plank: 2, kind: 'darkwood', seed: s > 0 ? 3 : 9, ink: 0.6 });
  }
  grime(ctx, STERN, -BEAM, BOW - STERN, BEAM * 2, 0.5, 7, { color: '#1a120a', streaks: 0.7 });
  ctx.restore();
  deckPath();
  shadeOverlay(ctx, STERN, -BEAM, BOW, BEAM, 0.16, 0.3);
  deckPath();
  ink(ctx, 1);
  // deck-edge railing
  railing(ctx, hullPoints(19), { post: 6, kind: 'iron', closed: true });

  // --- Bow: crest, anchor chains, hatch frame
  crest(ctx, 158, 0, 13, { emblem: 'skull', field: '#7a1d14', kind: 'brass', color: '#f2d48a' });
  for (const s of [-1, 1]) {
    chain(ctx, 150, s * 20, 176, s * 6, 3, 'iron');
    dome(ctx, 146, s * 22, 3.4, 'gunmetal', { rivets: 6 });
  }
  hatchFrame(ctx, HATCH.x, HATCH.y);

  // --- Funnel casing & smokestacks
  ambientOcclusion(ctx, () => roundRect(ctx, -44, -26, 104, 52, 18), 0.5, 4);
  plate(ctx, -44, -26, 104, 52, 18, 'syndicate', { rivets: 5, rivetR: 0.7, polish: false });
  ventGrille(ctx, -36, -20, 10, 14, { slots: 4, kind: 'gunmetal', vertical: true, glow: '#5a1608' });
  ventGrille(ctx, -36, 6, 10, 14, { slots: 4, kind: 'gunmetal', vertical: true, glow: '#5a1608' });
  // boiler steam pipes along the casing
  for (const s of [-1, 1]) {
    pipe(ctx, [[-40, s * 30], [10, s * 30], [52, s * 30], [64, s * 22]], 3.2, 'copper');
  }
  for (const st of STACKS) {
    smokestack(ctx, st.x, st.y, st.r, 'gunmetal', { band: '#c0392b', ember: true, soot: 30 });
  }

  // --- Turret barbettes (turrets are separate parts drawn on top)
  for (const m of TURRET_MOUNTS) {
    ambientOcclusion(ctx, () => {
      ctx.beginPath();
      ctx.arc(m.x, m.y, 23, 0, TAU);
    }, 0.5, 4);
    ringMount(ctx, m.x, m.y, 23, { kind: 'gunmetal', table: 'blackiron', bolts: 14 });
    hazardArc(ctx, m.x, m.y, 25.5);
  }

  // --- Bridge tower (stepped superstructure)
  drawBridge(ctx, BRIDGE.x, BRIDGE.y);

  // --- Stern: lifeboats, flagstaff, stern lamp
  for (const s of [-1, 1]) {
    lifeboat(ctx, -168, s * 52);
    lamp(ctx, -180, s * 30, 2.4, '#ff6a3a', { halo: 3 });
  }
  dome(ctx, -170, 0, 6, 'gunmetal', { rivets: 8 });
  flag(ctx, -176, -4, 22, 12, ['#2a2c31', '#c0392b', '#2a2c31'], { dir: -1, wave: 2.2, emblem: '#f2d48a' });
  nameplate(ctx, -100, 66, 44, 7, 'MATRIARCH', { kind: 'brass' });

  // lit ember portholes along the flanks between the ports
  for (const s of [-1, 1]) {
    for (let i = 0; i < PORT_XS.length - 1; i++) {
      const x = (PORT_XS[i] + PORT_XS[i + 1]) / 2;
      porthole(ctx, x, s * (hullHalfWidth(x) - 7), 2.2, { glow: true, color: '#ff7a2f', halo: 2.6, kind: 'gunmetal' });
    }
  }
  // gunport lids (dark openings with brass rims)
  for (const s of [-1, 1]) {
    for (const px of PORT_XS) {
      const hy = hullHalfWidth(px);
      roundRect(ctx, px - 6, s > 0 ? hy - 9 : -hy + 1, 12, 8, 2);
      ctx.fillStyle = '#120c08';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#c9973f';
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Yellow/black hazard ring around a barbette. */
function hazardArc(ctx, x, y, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r + 2.6, 0, TAU);
  ctx.arc(x, y, r, 0, TAU, true);
  hazardStripes(ctx, x - r - 4, y - r - 4, r * 2 + 8, r * 2 + 8, { usePath: true, stripe: 2.2, a: '#1b1612', b: '#c9973f' });
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, r + 2.6, 0, TAU);
  ink(ctx, 0.6);
}

/** Scout-launch hatch frame + shaft (doors are drawn live on top). */
function hatchFrame(ctx, x, y) {
  const w = HATCH.w;
  const h = HATCH.h;
  roundRect(ctx, x - w / 2 - 4, y - h / 2 - 4, w + 8, h + 8, 3);
  hazardStripes(ctx, x - w / 2 - 4, y - h / 2 - 4, w + 8, h + 8, { usePath: true, stripe: 2.5 });
  roundRect(ctx, x - w / 2 - 4, y - h / 2 - 4, w + 8, h + 8, 3);
  ink(ctx, 0.9);
  roundRect(ctx, x - w / 2, y - h / 2, w, h, 2);
  const g = ctx.createRadialGradient(x, y, 1, x, y, w * 0.7);
  g.addColorStop(0, '#3a1a0c');
  g.addColorStop(1, '#0a0605');
  ctx.fillStyle = g;
  ctx.fill();
  // launch rail lights inside the shaft
  for (let i = 0; i < 4; i++) {
    lamp(ctx, x - w / 2 + 5 + i * 6.5, y - h / 2 + 3, 0.9, '#ff7a2f', { halo: 2.5, cage: false });
    lamp(ctx, x - w / 2 + 5 + i * 6.5, y + h / 2 - 3, 0.9, '#ff7a2f', { halo: 2.5, cage: false });
  }
}

function lifeboat(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.ellipse(0, 0, 10, 4.2, 0, 0, TAU);
  ctx.fillStyle = metal(ctx, -10, -4, 10, 4, 'wood');
  ctx.fill();
  ink(ctx, 0.7);
  ctx.beginPath();
  ctx.ellipse(0, 0, 8.4, 3, 0, 0, TAU);
  ctx.fillStyle = metal(ctx, -8, -3, 8, 3, 'cream');
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,40,20,0.5)';
  ctx.lineWidth = 0.4;
  for (let i = -6; i <= 6; i += 3) {
    ctx.beginPath();
    ctx.moveTo(i, -3);
    ctx.lineTo(i, 3);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBridge(ctx, x, y) {
  // tier 1: armoured base
  ambientOcclusion(ctx, () => roundRect(ctx, x - 30, y - 36, 60, 72, 8), 0.55, 5);
  plate(ctx, x - 30, y - 36, 60, 72, 8, 'syndicate', { rivets: 5, rivetR: 0.75 });
  // crimson banding
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(x - 30 + 3, y - 36 + 9, 54, 2.4);
  ctx.fillRect(x - 30 + 3, y + 36 - 11.4, 54, 2.4);
  // tier 2
  ambientOcclusion(ctx, () => roundRect(ctx, x - 20, y - 26, 44, 52, 6), 0.55, 4);
  plate(ctx, x - 20, y - 26, 44, 52, 6, 'gunmetal', { rivets: 4.5, rivetR: 0.6, polish: true });
  // bridge windows (ember-lit) wrapping the forward face
  for (let i = 0; i < 6; i++) {
    const wy = y - 20 + i * 8;
    porthole(ctx, x + 19, wy, 2.3, { glow: true, color: '#ffb347', halo: 2.2, kind: 'brass' });
  }
  // tier 3: wheelhouse roof with compass & gauges
  ambientOcclusion(ctx, () => roundRect(ctx, x - 12, y - 16, 26, 32, 5), 0.5, 3);
  plate(ctx, x - 12, y - 16, 26, 32, 5, 'blackiron', { rivets: 4, rivetR: 0.55 });
  gauge(ctx, x + 1, y - 7, 4.2, { value: 0.86 });
  gauge(ctx, x + 1, y + 7, 4.2, { value: 0.55 });
  // mast with yardarm & searchlight
  cylinder(ctx, x - 22, y - 30, x - 22, y + 30, 2.2, 2.2, 'iron', { capStart: true, capEnd: true });
  dome(ctx, x - 22, y, 4, 'brass', { rivets: 6 });
  lamp(ctx, x - 22, y - 30, 2.2, '#fff2c0', { halo: 2.5 });
  lamp(ctx, x - 22, y + 30, 2.2, '#ff5a3a', { halo: 2.5 });
  // speaking-tube vents
  dome(ctx, x - 8, y - 22, 2.6, 'brass', { rivets: 0 });
  dome(ctx, x - 8, y + 22, 2.6, 'brass', { rivets: 0 });
}

// ---- Turret ------------------------------------------------------------------------------------

function drawTurret(ctx) {
  // pivot at (20, 22): gunhouse centre; twin barrels toward +x
  const cx = 20;
  const cy = 22;
  for (const s of [-1, 1]) {
    cannon(ctx, cx + 6, cy + s * 6.5, 30, 7.5, 'blackiron', { taper: 0.74, bands: [0.25, 0.62], swell: 1.18 });
  }
  // gunhouse: rounded rear, faceted front
  ctx.beginPath();
  ctx.moveTo(cx + 15, cy - 13);
  ctx.lineTo(cx + 18, cy - 6);
  ctx.lineTo(cx + 18, cy + 6);
  ctx.lineTo(cx + 15, cy + 13);
  ctx.arc(cx, cy, 17, Math.asin(13 / 17), TAU - Math.asin(13 / 17));
  ctx.closePath();
  ctx.fillStyle = metal(ctx, cx - 17, cy - 17, cx + 18, cy + 17, 'syndicate');
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(cx - 18, cy - 3, 34, 6);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(cx - 18, cy + 2, 34, 1);
  grime(ctx, cx - 18, cy - 18, 36, 36, 0.6, 77, { color: '#140c06' });
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(cx + 15, cy - 13);
  ctx.lineTo(cx + 18, cy - 6);
  ctx.lineTo(cx + 18, cy + 6);
  ctx.lineTo(cx + 15, cy + 13);
  ctx.arc(cx, cy, 17, Math.asin(13 / 17), TAU - Math.asin(13 / 17));
  ctx.closePath();
  shadeOverlay(ctx, cx - 17, cy - 17, cx + 18, cy + 17, 0.28, 0.35);
  ctx.beginPath();
  ctx.moveTo(cx + 15, cy - 13);
  ctx.lineTo(cx + 18, cy - 6);
  ctx.lineTo(cx + 18, cy + 6);
  ctx.lineTo(cx + 15, cy + 13);
  ctx.arc(cx, cy, 17, Math.asin(13 / 17), TAU - Math.asin(13 / 17));
  ctx.closePath();
  ink(ctx, 1.3);
  rivetRing(ctx, cx, cy, 14.5, 16, 0.6, 'gunmetal', 0.2);
  // commander's cupola & rangefinder
  dome(ctx, cx - 5, cy - 7, 4, 'gunmetal', { rivets: 6 });
  cylinder(ctx, cx - 10, cy + 9, cx + 8, cy + 9, 3, 3, 'brass', { capStart: true, capEnd: true });
  porthole(ctx, cx + 9, cy + 9, 1.8, { glow: true, color: '#ff7a2f', halo: 2 });
  // vision slit
  ctx.fillStyle = '#120a06';
  ctx.fillRect(cx + 13, cy - 5, 2, 10);
  glow(ctx, cx + 14, cy, 4, '#ff7a2f', 0.6);
}

function drawTurretWreck(ctx) {
  const c = 24;
  ringMount(ctx, c, c, 21, { kind: 'gunmetal', table: 'blackiron', bolts: 12 });
  const rnd = seeded(13);
  // torn plates
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + rnd() * 0.5;
    const r0 = 5 + rnd() * 4;
    const r1 = 12 + rnd() * 6;
    polygon(ctx, [
      [c + Math.cos(a) * r0, c + Math.sin(a) * r0],
      [c + Math.cos(a + 0.35) * r1, c + Math.sin(a + 0.35) * r1],
      [c + Math.cos(a + 0.55) * (r0 + 3), c + Math.sin(a + 0.55) * (r0 + 3)],
    ]);
    ctx.fillStyle = mix('#3a3d44', '#120c08', rnd() * 0.6);
    ctx.fill();
    ink(ctx, 0.6);
  }
  // scorch & glowing embers in the pit
  glow(ctx, c, c, 14, '#1a0c06', 0.9);
  glow(ctx, c + 2, c + 1, 7, '#ff6a2a', 0.8);
  glow(ctx, c - 3, c - 2, 3, '#ffd28a', 0.8);
  // snapped barrel stub
  cylinder(ctx, c + 2, c - 4, c + 14, c - 9, 5, 4, 'blackiron', { capEnd: false });
  ctx.beginPath();
  ctx.ellipse(c + 14, c - 9, 1.6, 2.4, -0.4, 0, TAU);
  ctx.fillStyle = '#0a0605';
  ctx.fill();
}

function drawHatchDoor(ctx) {
  // one sliding door leaf, 16×26 (pivot centre)
  plate(ctx, 1, 1, 14, 24, 1.5, 'gunmetal', { rivets: 4, rivetR: 0.5, polish: true });
  hazardStripes(ctx, 2, 10, 12, 6, { stripe: 2, ink: 0.4 });
}

function drawCore(ctx) {
  // exposed boiler room: torn deck edges ringing a furnace grate (120×64, centre pivot)
  ctx.save();
  ctx.translate(60, 32);
  const rnd = seeded(29);
  const pts = [];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU;
    const rx = 52 + (rnd() - 0.5) * 10;
    const ry = 26 + (rnd() - 0.5) * 6;
    pts.push([Math.cos(a) * rx, Math.sin(a) * ry]);
  }
  polygon(ctx, pts);
  ctx.fillStyle = '#140a06';
  ctx.fill();
  // jagged bent plate rim
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#4b4f58';
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#ff7a2f';
  ctx.stroke();
  // furnace glow & grate
  glow(ctx, 0, 0, 46, '#ff5a1a', 0.85, { core: 0.2 });
  glow(ctx, 0, 0, 24, '#ffd28a', 0.8);
  ctx.save();
  polygon(ctx, pts);
  ctx.clip();
  ctx.strokeStyle = 'rgba(30,14,6,0.9)';
  ctx.lineWidth = 2.2;
  for (let x = -48; x <= 48; x += 7) {
    ctx.beginPath();
    ctx.moveTo(x, -30);
    ctx.lineTo(x, 30);
    ctx.stroke();
  }
  ctx.lineWidth = 1.4;
  for (let y = -24; y <= 24; y += 9) {
    ctx.beginPath();
    ctx.moveTo(-56, y);
    ctx.lineTo(56, y);
    ctx.stroke();
  }
  ctx.restore();
  // boiler drums either side
  for (const s of [-1, 1]) {
    cylinder(ctx, -34, s * 13, 34, s * 13, 9, 9, 'copper', { capStart: true, capEnd: true });
    rivetLine(ctx, -28, s * 13, 28, s * 13, 6, 0.6, 'copper');
  }
  gear(ctx, 0, 0, 9, 10, { kind: 'brass', spokes: 4, hub: true });
  ctx.restore();
}

function drawScorch(ctx) {
  // damage decal over the whole hull (alpha-ramped by the boss as it takes damage)
  ctx.save();
  ctx.translate(HULL_W / 2, HULL_H / 2);
  hullPath(ctx, 2);
  ctx.clip();
  const rnd = seeded(91);
  for (let i = 0; i < 26; i++) {
    const x = STERN + 20 + rnd() * (BOW - STERN - 50);
    const hy = hullHalfWidth(x) - 6;
    const y = (rnd() * 2 - 1) * hy;
    const r = 8 + rnd() * 16;
    glow(ctx, x, y, r * 1.6, '#0d0805', 0.65);
  }
  for (let i = 0; i < 9; i++) {
    const x = STERN + 30 + rnd() * (BOW - STERN - 70);
    const hy = hullHalfWidth(x) - 10;
    const y = (rnd() * 2 - 1) * hy;
    const r = 3 + rnd() * 4;
    // shell hole: torn petals around a dark breach with a hot rim
    const pts = [];
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * TAU;
      const rr = r * (k % 2 ? 1.9 : 1.1) * (0.8 + rnd() * 0.4);
      pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
    }
    polygon(ctx, pts);
    ctx.fillStyle = '#6a6f78';
    ctx.fill();
    ink(ctx, 0.6);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = '#080404';
    ctx.fill();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = '#ff6a2a';
    ctx.stroke();
  }
  ctx.restore();
}

function drawGlow(ctx) {
  glow(ctx, 32, 32, 32, '#ff6a2a', 1, { core: 0.08 });
  glow(ctx, 32, 32, 12, '#fff0c8', 0.9);
}

let registered = false;

/** Register every Iron Matriarch sprite (idempotent). */
export function registerMatriarchArt() {
  if (registered) return;
  registered = true;
  Sprites.register('boss_ironMatriarch', { w: HULL_W, h: HULL_H, draw: drawHull });
  Sprites.register('boss_ironMatriarch_turret', { w: 60, h: 44, cx: 20, cy: 22, draw: drawTurret });
  Sprites.register('boss_ironMatriarch_turretWreck', { w: 48, h: 48, draw: drawTurretWreck });
  Sprites.register('boss_ironMatriarch_hatchDoor', { w: 16, h: 26, draw: drawHatchDoor });
  Sprites.register('boss_ironMatriarch_core', { w: 120, h: 64, draw: drawCore });
  Sprites.register('boss_ironMatriarch_scorch', { w: HULL_W, h: HULL_H, draw: drawScorch });
  Sprites.register('boss_ironMatriarch_glow', { w: 64, h: 64, draw: drawGlow });
}

