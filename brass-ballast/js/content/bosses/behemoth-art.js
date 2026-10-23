// Admiral Vex's Behemoth sprites (WP15). A long carrier-battleship seen from above, facing +x:
// armoured gunmetal hull with crimson trim and a black-iron ram, twin outrigger lift-bags,
// flight deck with catapult track and launch bay (doors are runtime sprites), smokestacks,
// mortar pits, broadside gun ports, the bridge island (separate sprite with shutter frames) and
// Vex's flag (separate waving frames). Deck cannons are their own turret sprite.

import { Sprites } from '../../gfx/sprites.js';
import {
  TAU,
  PAL,
  mix,
  seeded,
  metal,
  metalRadial,
  cylinderGrad,
  polygon,
  roundRect,
  ink,
  rimLight,
  glow,
  rivet,
  rivetLine,
  rivetRing,
  bolt,
  plate,
  cylinder,
  ventGrille,
  smokestack,
  grime,
  ringMount,
  deck,
  lamp,
  dome,
  hazardStripes,
  panelLines,
  envelope,
  fin,
  rigging,
  crest,
  nameplate,
  gear,
} from '../../gfx/drawkit.js';

export const BH = {
  hull: 'boss_behemoth',
  bridge: 'boss_behemoth_bridge',
  cannon: 'boss_behemoth_cannon',
  flag: 'boss_behemoth_flag',
  door: 'boss_behemoth_door',
  blade: 'boss_behemoth_blade',
  hub: 'boss_behemoth_hub',
  glow: 'boss_behemoth_glow',
  crater: 'boss_behemoth_crater',
};

/** Hull-local layout (x forward, y starboard; origin = sprite centre). Shared with the logic. */
export const GEO = {
  W: 470,
  H: 214,
  bridge: [62, 29],
  flagPole: [-30, -9], // relative to the bridge centre (bridge-local)
  cannons: [
    [150, 0],
    [-110, 29],
  ],
  bay: [-122, -20],
  bayW: 56,
  bayH: 36,
  stacks: [
    [-56, 30],
    [-31, 30],
    [-6, 30],
  ],
  mortars: [
    [-186, 29],
    [-159, 29],
  ],
  portX: [-190, -160, -130, -100, -70, -40, -10, 20, 50, 80, 110],
  portY: 50,
  props: [
    [-224, -28],
    [-224, 0],
    [-224, 28],
  ],
  envProps: [
    [-183, -80],
    [-183, 80],
  ],
  envY: 80,
  /** Break line for the death split (x of the keel crack). */
  splitX: 12,
};

const HULL = [
  [-215, -40],
  [-210, -48],
  [-200, -51],
  [110, -51],
  [160, -42],
  [200, -24],
  [222, -8],
  [233, 0],
];
/** Full closed hull outline (local coords). */
export const HULL_PTS = [...HULL, ...HULL.slice(0, -1).reverse().map(([x, y]) => [x, -y])];

function P(cx, cy, pts) {
  return pts.map(([x, y]) => [cx + x, cy + y]);
}

// ---- Hull ------------------------------------------------------------------------------------

function drawHull(ctx, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const rnd = seeded(77);
  // Struts & rigging out to the lift-bags.
  for (const s of [-1, 1]) {
    for (const x of [-120, -20, 80]) {
      cylinder(ctx, cx + x, cy + s * 44, cx + x + 6, cy + s * 66, 5, 4, 'gunmetal', { capEnd: true });
      rigging(ctx, cx + x - 22, cy + s * 48, cx + x - 6, cy + s * 64, { width: 0.5 });
      rigging(ctx, cx + x + 22, cy + s * 48, cx + x + 14, cy + s * 64, { width: 0.5 });
    }
  }
  // Twin lift-bags (sooty Syndicate canvas, crimson spine stripe).
  for (const s of [-1, 1]) {
    const ey = cy + s * GEO.envY;
    const ex = cx - 8;
    for (const fs of [-1, 1]) {
      fin(
        ctx,
        [
          [ex - 140, ey + fs * 6],
          [ex - 168, ey + fs * 7],
          [ex - 178, ey + fs * 20],
          [ex - 158, ey + fs * 21],
        ],
        { fill: '#55524d', edge: PAL.syndicate[2], spars: 2, kind: 'iron' }
      );
    }
    envelope(ctx, ex, ey, 336, 44, {
      fill: '#67625a',
      nose: 2.2,
      tail: 1.6,
      gores: 6,
      ribs: 11,
      gloss: 0.25,
      stripes: [
        { k0: -0.14, k1: 0.14, t0: -0.9, t1: 0.9, color: '#8c2f2b' },
        { k0: -0.2, k1: -0.16, t0: -0.88, t1: 0.88, color: '#1d1b1a' },
        { k0: 0.16, k1: 0.2, t0: -0.88, t1: 0.88, color: '#1d1b1a' },
      ],
      bands: [
        { t0: 0.8, t1: 0.86, color: '#2b2a29' },
        { t0: -0.78, t1: -0.73, color: '#2b2a29' },
      ],
      decorate(c, g) {
        grime(c, g.x(-1), ey - 22, 120, 44, 0.55, 3 + s, { color: '#1a1410' });
        grime(c, g.x(0.2), ey - 22, 120, 44, 0.3, 9 + s, { color: '#1a1410' });
      },
    });
    // nose caps
    ctx.beginPath();
    ctx.arc(ex + 166, ey, 4, 0, TAU);
    ctx.fillStyle = metalRadial(ctx, ex + 166, ey, 4, 'gunmetal');
    ctx.fill();
    ink(ctx, 0.7);
  }

  // Stern engine stubs (props are runtime).
  for (const [x, y] of GEO.props) {
    cylinder(ctx, cx + x + 14, cy + y, cx + x + 2, cy + y, 9, 6, 'gunmetal', { capEnd: true });
    glow(ctx, cx + x + 2, cy + y, 7, '#ff7a2f', 0.6);
  }

  // Hull body.
  const hull = P(cx, cy, HULL_PTS);
  polygon(ctx, hull);
  ctx.fillStyle = metal(ctx, cx - 215, cy - 51, cx + 120, cy + 60, 'gunmetal');
  ctx.fill();
  ctx.save();
  polygon(ctx, hull);
  ctx.clip();
  panelLines(ctx, cx - 220, cy - 55, 460, 110, 26, 12, { a: 0.35 });
  grime(ctx, cx - 220, cy - 55, 460, 110, 0.35, 21, { color: '#100c09' });
  // crimson trim inside the edge
  polygon(ctx, hull);
  ctx.lineWidth = 9;
  ctx.strokeStyle = '#7a1d14';
  ctx.stroke();
  polygon(ctx, hull);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#c0392b';
  ctx.stroke();
  ctx.restore();
  polygon(ctx, hull);
  rimLight(ctx, cx - 215, cy - 51, cx + 233, cy + 51, 1.6, 0.4);
  ink(ctx, 1.8);
  // Black-iron ram prow.
  polygon(
    ctx,
    P(cx, cy, [
      [192, -30],
      [222, -8],
      [240, 0],
      [222, 8],
      [192, 30],
      [204, 0],
    ])
  );
  ctx.fillStyle = metal(ctx, cx + 192, cy - 30, cx + 240, cy + 30, 'blackiron', { polish: true });
  ctx.fill();
  ink(ctx, 1.2);
  rivetLine(ctx, cx + 196, cy - 26, cx + 236, cy, 6, 0.9, 'iron');
  rivetLine(ctx, cx + 196, cy + 26, cx + 236, cy, 6, 0.9, 'iron');

  // Flight deck (port side).
  deck(ctx, cx - 206, cy - 47, 314, 53, { plank: 3.4, kind: 'darkwood', seed: 9, radius: 4, ink: 1.2 });
  hazardStripes(ctx, cx - 206, cy - 47, 8, 53, { a: '#1a1410', b: '#e8b923', stripe: 3 });
  // arresting wires
  ctx.strokeStyle = 'rgba(200,205,212,0.7)';
  ctx.lineWidth = 0.7;
  for (const x of [-188, -180, -172]) {
    ctx.beginPath();
    ctx.moveTo(cx + x, cy - 45);
    ctx.lineTo(cx + x, cy + 4);
    ctx.stroke();
  }
  // catapult track
  for (const yy of [-23, -17]) {
    ctx.beginPath();
    ctx.moveTo(cx - 90, cy + yy);
    ctx.lineTo(cx + 102, cy + yy);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = '#2a2c31';
    ctx.stroke();
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = '#b8c0c8';
    ctx.stroke();
  }
  plate(ctx, cx + 88, cy - 26, 12, 12, 2, 'steel', { ink: 0.6 });
  // painted deck markings: chevrons toward the bow, numbers, edge lamps
  ctx.fillStyle = 'rgba(240,230,200,0.75)';
  for (let i = 0; i < 4; i++) {
    const x = cx + 24 + i * 16;
    polygon(ctx, [
      [x, cy - 40],
      [x + 7, cy - 36],
      [x, cy - 32],
      [x + 3, cy - 36],
    ]);
    ctx.fill();
  }
  ctx.save();
  ctx.translate(cx - 60, cy - 6);
  ctx.font = 'bold 10px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(240,230,200,0.7)';
  ctx.fillText('IV', 0, 0);
  ctx.restore();
  for (let x = -196; x <= 100; x += 24) {
    lamp(ctx, cx + x, cy - 45, 1.1, '#ffcf6a', { halo: 2.4, cage: false });
    lamp(ctx, cx + x, cy + 4, 1.1, '#ffcf6a', { halo: 2.4, cage: false });
  }
  crest(ctx, cx + 40, cy - 6, 9, { emblem: 'skull', field: PAL.oxblood, kind: 'gold' });

  // Launch bay pit (doors drawn at runtime).
  const [bx, by] = GEO.bay;
  const bw = GEO.bayW;
  const bh = GEO.bayH;
  plate(ctx, cx + bx - bw / 2 - 5, cy + by - bh / 2 - 5, bw + 10, bh + 10, 4, 'syndicate', { rivets: 6 });
  hazardStripes(ctx, cx + bx - bw / 2 - 3, cy + by - bh / 2 - 3, bw + 6, bh + 6, { a: '#1a1410', b: '#e8b923', stripe: 2.4, ink: 0 });
  roundRect(ctx, cx + bx - bw / 2, cy + by - bh / 2, bw, bh, 2);
  const hg = ctx.createLinearGradient(0, cy + by - bh / 2, 0, cy + by + bh / 2);
  hg.addColorStop(0, '#07080a');
  hg.addColorStop(1, '#1c1814');
  ctx.fillStyle = hg;
  ctx.fill();
  ink(ctx, 1);
  for (let i = 0; i < 4; i++) glow(ctx, cx + bx - 20 + i * 13, cy + by + 12, 5, '#ffb050', 0.55);
  // parked ornithopter silhouette
  ctx.fillStyle = 'rgba(60,62,68,0.9)';
  polygon(ctx, P(cx, cy, [
    [bx + 14, by],
    [bx - 2, by - 12],
    [bx - 6, by - 3],
    [bx - 14, by],
    [bx - 6, by + 3],
    [bx - 2, by + 12],
  ]));
  ctx.fill();

  // Starboard machinery strip.
  plate(ctx, cx - 210, cy + 9, 300, 38, 5, 'syndicate', { rivets: 9, rivetKind: 'iron', bevel: 0.5 });
  ctx.save();
  roundRect(ctx, cx - 210, cy + 9, 300, 38, 5);
  ctx.clip();
  panelLines(ctx, cx - 210, cy + 9, 300, 38, 18, 10, { a: 0.3 });
  ctx.restore();
  // mortar pits
  for (const [x, y] of GEO.mortars) {
    ringMount(ctx, cx + x, cy + y, 12, { kind: 'iron', table: 'gunmetal', bolts: 8 });
    ctx.beginPath();
    ctx.arc(cx + x + 1, cy + y, 6.5, 0, TAU);
    ctx.fillStyle = metalRadial(ctx, cx + x + 1, cy + y, 6.5, 'blackiron');
    ctx.fill();
    ink(ctx, 0.8);
    ctx.beginPath();
    ctx.arc(cx + x + 1.5, cy + y, 3.6, 0, TAU);
    ctx.fillStyle = '#050403';
    ctx.fill();
    glow(ctx, cx + x + 1.5, cy + y, 3, '#ff7a2f', 0.5);
  }
  // aft cannon barbette
  ringMount(ctx, cx + GEO.cannons[1][0], cy + GEO.cannons[1][1], 19, { kind: 'brass', table: 'iron', bolts: 12 });
  // smokestacks
  for (const [x, y] of GEO.stacks) {
    smokestack(ctx, cx + x, cy + y, 9.5, 'iron', { band: PAL.syndicate[2], ember: true, soot: 16, angle: Math.PI });
  }
  // island footing
  plate(ctx, cx + 20, cy + 8, 86, 42, 6, 'gunmetal', { rivets: 7, rivetKind: 'brass', polish: true });
  ventGrille(ctx, cx + 90, cy + 36, 12, 8, { slots: 3, kind: 'iron', glow: '#ff7a2f' });
  // fore cannon barbette
  ringMount(ctx, cx + GEO.cannons[0][0], cy + GEO.cannons[0][1], 21, { kind: 'brass', table: 'iron', bolts: 12 });
  // anchor & chain locker on the bow
  for (const s of [-1, 1]) {
    dome(ctx, cx + 182, cy + s * 20, 4, 'iron', { rivets: 6 });
    bolt(ctx, cx + 172, cy + s * 26, 2, 'iron');
  }
  nameplate(ctx, cx + 128, cy + 33, 36, 8, 'BEHEMOTH', { kind: 'brass', color: '#3a1210' });

  // Broadside gun ports along both flanks.
  for (const s of [-1, 1]) {
    for (const x of GEO.portX) {
      const y = cy + s * (GEO.portY - 1.5);
      roundRect(ctx, cx + x - 5, y - 2.4, 10, 4.8, 1.4);
      ctx.fillStyle = metal(ctx, cx + x - 5, y - 2.4, cx + x + 5, y + 2.4, 'brass');
      ctx.fill();
      ink(ctx, 0.6);
      ctx.fillStyle = '#0b0807';
      ctx.fillRect(cx + x - 3.4, y - 1.2, 6.8, 2.4);
      glow(ctx, cx + x, y, 3.4, '#ff6a2a', 0.5);
    }
  }
  // stern plating rivets & lamps
  rivetLine(ctx, cx - 212, cy - 38, cx - 212, cy + 38, 6, 0.9, 'iron');
  lamp(ctx, cx - 206, cy - 44, 1.8, '#ff4d2e', { halo: 3 });
  lamp(ctx, cx - 206, cy + 44, 1.8, '#7dff8a', { halo: 3 });
  // scuffs
  for (let i = 0; i < 12; i++) {
    const x = cx - 200 + rnd() * 380;
    const y = cy - 45 + rnd() * 90;
    ctx.fillStyle = `rgba(10,8,6,${0.08 + rnd() * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 4 + rnd() * 8, 2 + rnd() * 3, rnd() * 3, 0, TAU);
    ctx.fill();
  }
}

// ---- Bridge island (frames 0 closed → 3 open) -------------------------------------------------

function drawBridge(ctx, w, h, frame) {
  const cx = w / 2;
  const cy = h / 2;
  const open = frame / 3;
  // lower tier
  plate(ctx, cx - 38, cy - 17, 76, 34, 6, 'syndicate', { rivets: 7, rivetKind: 'brass', polish: true });
  ctx.fillStyle = PAL.syndicate[2];
  ctx.fillRect(cx - 38, cy + 12, 76, 3);
  // upper tier / wheelhouse
  plate(ctx, cx - 20, cy - 12, 46, 24, 7, 'gunmetal', { rivets: 6, rivetKind: 'iron', polish: true });
  // wheelhouse windows: front strip and both sides
  const wins = [];
  for (let i = 0; i < 4; i++) wins.push([cx + 21, cy - 7.5 + i * 5, 3.4, 3.6, 0]);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) wins.push([cx - 12 + i * 8, cy + s * 9.5, 5.6, 2.8, 1]);
  for (const [x, y, ww, hh] of wins) {
    ctx.fillStyle = '#0c0a08';
    ctx.fillRect(x - ww / 2 - 0.6, y - hh / 2 - 0.6, ww + 1.2, hh + 1.2);
    if (open > 0) {
      ctx.fillStyle = mix('#3a2a12', '#ffd36b', open);
      ctx.fillRect(x - ww / 2, y - hh / 2, ww, hh);
      if (open > 0.6) glow(ctx, x, y, 6, '#ffb84a', 0.35 * open);
    }
    // iron shutter slats slide shut from the top
    const cover = 1 - open;
    if (cover > 0) {
      ctx.fillStyle = '#4b5059';
      ctx.fillRect(x - ww / 2, y - hh / 2, ww, hh * cover);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (let k = 0; k < 3; k++) ctx.fillRect(x - ww / 2, y - hh / 2 + k * 1.2, ww, 0.35 * cover);
    }
  }
  // Vex's silhouette at the front window when open
  if (open > 0.6) {
    ctx.fillStyle = 'rgba(15,10,6,0.85)';
    ctx.beginPath();
    ctx.arc(cx + 15, cy, 2.4, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 15, cy - 0.5, 4.4, 1.3, 0, Math.PI, TAU);
    ctx.fill();
  }
  // roof gear: rangefinder, aerial mast, searchlight, speaking horns
  cylinder(ctx, cx - 6, cy - 9, cx - 6, cy + 9, 3, 3, 'brass', { capStart: true, capEnd: true });
  dome(ctx, cx + 4, cy, 4.4, 'brass', { rivets: 6 });
  lamp(ctx, cx + 12, cy - 6, 2, '#fff3c4', { halo: 2.4 });
  gear(ctx, cx - 14, cy + 4, 4, 8, { kind: 'brass', hole: 1.2 });
  ctx.beginPath();
  ctx.arc(cx - 14, cy - 5, 3, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, cx - 14, cy - 5, 3, 'iron');
  ctx.fill();
  ink(ctx, 0.6);
  // flag pole step at the rear
  const [fx, fy] = GEO.flagPole;
  ctx.beginPath();
  ctx.arc(cx + fx, cy + fy, 2.2, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, cx + fx, cy + fy, 2.2, 'gold');
  ctx.fill();
  ink(ctx, 0.5);
}

// ---- Deck cannon turret (pivot at the ring centre) ------------------------------------------

function drawCannon(ctx, w, h) {
  const cx = 22;
  const cy = h / 2;
  for (const s of [-1, 1]) {
    cylinder(ctx, cx + 4, cy + s * 6, cx + 46, cy + s * 6, 6.4, 5, 'gunmetal', { capEnd: false });
    ctx.save();
    ctx.translate(cx + 46, cy + s * 6);
    roundRect(ctx, 0, -3.8, 8, 7.6, 1.6);
    ctx.fillStyle = cylinderGrad(ctx, 0, -3.8, 0, 3.8, 'blackiron');
    ctx.fill();
    ink(ctx, 0.7);
    ctx.fillStyle = '#050403';
    ctx.beginPath();
    ctx.arc(8, 0, 1.8, 0, TAU);
    ctx.fill();
    ctx.restore();
    rivetLine(ctx, cx + 22, cy + s * 6 - 3, cx + 22, cy + s * 6 + 3, 3, 0.5, 'brass');
    ctx.fillStyle = PAL.syndicate[2];
    ctx.fillRect(cx + 30, cy + s * 6 - 3.2, 2.2, 6.4);
  }
  // armoured turret house
  polygon(ctx, [
    [cx - 16, cy - 13],
    [cx + 10, cy - 15],
    [cx + 20, cy - 8],
    [cx + 20, cy + 8],
    [cx + 10, cy + 15],
    [cx - 16, cy + 13],
    [cx - 19, cy],
  ]);
  ctx.fillStyle = metal(ctx, cx - 19, cy - 15, cx + 20, cy + 15, 'syndicate', { polish: true });
  ctx.fill();
  rimLight(ctx, cx - 19, cy - 15, cx + 20, cy + 15, 1.2, 0.5);
  ink(ctx, 1.1);
  ctx.fillStyle = PAL.syndicate[2];
  ctx.fillRect(cx - 14, cy - 2, 26, 4);
  rivetLine(ctx, cx - 14, cy - 10, cx + 10, cy - 12, 5, 0.65, 'brass');
  rivetLine(ctx, cx - 14, cy + 10, cx + 10, cy + 12, 5, 0.65, 'brass');
  dome(ctx, cx - 7, cy - 6, 3.2, 'brass', { rivets: 5 });
  ventGrille(ctx, cx - 15, cy + 3, 7, 7, { slots: 3, kind: 'iron' });
}

// ---- Vex's flag (6 waving frames, pole at x = 2) --------------------------------------------

function drawFlag(ctx, w, h, frame) {
  const x0 = 2;
  const y0 = 3;
  const fw = 36;
  const fh = 22;
  const ph = (frame / 6) * TAU;
  const N = 14;
  const top = [];
  const bot = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const off = Math.sin(ph + u * 5.2) * 2.6 * u;
    top.push([x0 + u * fw, y0 + off]);
    bot.push([x0 + u * fw * (1 - 0.06 * u), y0 + fh + off * 1.1]);
  }
  const pts = [...top, ...bot.reverse()];
  polygon(ctx, pts);
  const g = ctx.createLinearGradient(x0, 0, x0 + fw, 0);
  for (let i = 0; i <= 6; i++) {
    const shade = 0.5 + 0.5 * Math.sin(ph + (i / 6) * 5.2);
    g.addColorStop(i / 6, mix('#7a1d14', '#d84a3a', shade));
  }
  ctx.fillStyle = g;
  ctx.fill();
  ink(ctx, 0.8);
  // black border band + gold cog emblem
  ctx.save();
  polygon(ctx, pts);
  ctx.clip();
  ctx.strokeStyle = 'rgba(20,10,8,0.9)';
  ctx.lineWidth = 3;
  polygon(ctx, pts);
  ctx.stroke();
  const ex = x0 + fw * 0.45;
  const ey = y0 + fh / 2 + Math.sin(ph + 0.45 * 5.2) * 2.6 * 0.45;
  gear(ctx, ex, ey, 6.4, 9, { kind: 'gold', hole: 0, toothDepth: 1.6 });
  ctx.fillStyle = '#1a0d08';
  ctx.beginPath();
  ctx.arc(ex, ey - 0.6, 2.4, 0, TAU);
  ctx.fill();
  ctx.fillRect(ex - 1.4, ey + 1, 2.8, 1.6);
  ctx.restore();
  // pole knob
  ctx.beginPath();
  ctx.arc(x0, y0, 1.8, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, x0, y0, 1.8, 'gold');
  ctx.fill();
  ink(ctx, 0.4);
}

// ---- Small runtime pieces ------------------------------------------------------------------

function drawDoor(ctx, w, h) {
  plate(ctx, 0.5, 0.5, w - 1, h - 1, 2, 'syndicate', { rivets: 5, rivetKind: 'iron' });
  hazardStripes(ctx, 2, h - 6, w - 4, 4, { a: '#1a1410', b: '#e8b923', stripe: 1.8, ink: 0.4 });
  for (let y = 6; y < h - 8; y += 5) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(3, y, w - 6, 0.6);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(3, y + 0.6, w - 6, 0.4);
  }
}

function drawBlade(ctx, w, h) {
  const cx = w / 2;
  roundRect(ctx, cx - 2.2, 1, 4.4, h - 2, 2);
  ctx.fillStyle = cylinderGrad(ctx, cx - 2.2, 0, cx + 2.2, 0, 'iron');
  ctx.fill();
  ink(ctx, 0.6);
  ctx.fillStyle = PAL.syndicate[2];
  ctx.fillRect(cx - 2.2, 1.5, 4.4, 4);
  ctx.fillRect(cx - 2.2, h - 5.5, 4.4, 4);
}

function drawHub(ctx, w) {
  const c = w / 2;
  ctx.beginPath();
  ctx.arc(c, c, 5.5, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, c, c, 5.5, 'brass', { spec: 0.7 });
  ctx.fill();
  ink(ctx, 0.7);
  rivetRing(ctx, c, c, 3.6, 5, 0.5, 'iron');
}

function drawCrater(ctx, w) {
  const c = w / 2;
  const rnd = seeded(5);
  glow(ctx, c, c, 24, 'rgba(8,5,3,0.95)', 1);
  const pts = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const r = 11 + rnd() * 6;
    pts.push([c + Math.cos(a) * r, c + Math.sin(a) * r]);
  }
  polygon(ctx, pts);
  ctx.fillStyle = '#120c09';
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = '#5b626b';
  ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const a = rnd() * TAU;
    ctx.save();
    ctx.translate(c + Math.cos(a) * 14, c + Math.sin(a) * 14);
    ctx.rotate(a);
    polygon(ctx, [
      [0, -2],
      [7, -1],
      [8, 1.5],
      [0, 2],
    ]);
    ctx.fillStyle = metal(ctx, 0, -2, 8, 2, 'gunmetal');
    ctx.fill();
    ink(ctx, 0.5);
    ctx.restore();
  }
  glow(ctx, c, c, 9, '#ff7a2f', 0.8);
  rivet(ctx, c - 6, c + 3, 1, 'iron');
}

Sprites.register(BH.hull, { w: GEO.W, h: GEO.H, draw: drawHull });
Sprites.register(BH.bridge, { w: 84, h: 44, frames: 4, draw: drawBridge });
Sprites.register(BH.cannon, { w: 80, h: 36, cx: 22, cy: 18, draw: drawCannon });
Sprites.register(BH.flag, { w: 42, h: 30, cx: 2, cy: 3, frames: 6, draw: drawFlag });
Sprites.register(BH.door, { w: 28, h: 36, draw: drawDoor });
Sprites.register(BH.blade, { w: 8, h: 46, draw: drawBlade });
Sprites.register(BH.hub, { w: 14, h: 14, draw: drawHub });
Sprites.register(BH.crater, { w: 48, h: 48, draw: drawCrater });
Sprites.register(BH.glow, {
  w: 64,
  h: 64,
  scale: 1,
  draw: (ctx) => glow(ctx, 32, 32, 32, '#ff8a3a', 1, { core: 0.1 }),
});
