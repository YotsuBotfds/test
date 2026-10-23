// WP13 — art for the big Iron Syndicate hulls: Zeppelin Carrier, Ironclad Frigate and Mortar
// Barge. Top-down, facing +x, light from the top-left, dark outlines, no baked drop shadow.
// Animated bits (props, rotors, hatch, gunport glow, mortar) are separate part sprites that the
// behaviours in warships.js draw on top of the hull.

import {
  TAU,
  alpha,
  ambientOcclusion,
  balloon,
  cannon,
  crest,
  cylinder,
  cylinderGrad,
  dome,
  envelope,
  envelopeGeo,
  fin,
  glow,
  glowEllipse,
  grime,
  hazardStripes,
  ink,
  lamp,
  metal,
  metalRadial,
  nacelle,
  panelLines,
  pipe,
  polygon,
  propeller,
  rigging,
  ringMount,
  rivet,
  rivetLine,
  rivetRing,
  rivetedBand,
  roundRect,
  seeded,
  shadeOverlay,
  ventGrille,
  chain,
} from '../../gfx/drawkit.js';
import { SYN, reg, regProp, mirrorY, emberPort, synStack, armor, trim, hotDot } from './warships-kit.js';

// =============================================================================================
// Zeppelin Carrier — a sooty gunmetal dreadnought-zeppelin with a dorsal flight deck and a
// launch hatch amidships; four engine pods on outriggers; crimson war-stripes.
// =============================================================================================

export const CARRIER = {
  w: 116,
  h: 80,
  hatch: [-8, 0], // hull-local launch hatch centre
  props: [
    [-30, -31],
    [-30, 31],
    [4, -31],
    [4, 31],
  ],
  stacks: [
    [-22, -12],
    [-22, 12],
  ],
  guns: [
    [26, -15],
    [26, 15],
  ],
};

/** The launch hatch: frame 0 closed … frame 4 fully open. Shared by hull art & part sprite. */
function drawHatch(ctx, x, y, open) {
  const hw = 9;
  const hh = 7;
  // recessed coaming with hazard stripes
  roundRect(ctx, x - hw - 2, y - hh - 2, (hw + 2) * 2, (hh + 2) * 2, 2.5);
  ctx.fillStyle = '#1b1c20';
  ctx.fill();
  ink(ctx, 0.9);
  ctx.save();
  roundRect(ctx, x - hw - 2, y - hh - 2, (hw + 2) * 2, (hh + 2) * 2, 2.5);
  ctx.clip();
  hazardStripes(ctx, x - hw - 2, y - hh - 2, (hw + 2) * 2, (hh + 2) * 2, {
    a: '#1a1612',
    b: '#d9a12a',
    stripe: 2.2,
    ink: 0,
  });
  ctx.restore();
  // shaft
  roundRect(ctx, x - hw, y - hh, hw * 2, hh * 2, 1.5);
  const g = ctx.createRadialGradient(x, y, 0, x, y, hw * 1.2);
  g.addColorStop(0, open > 0 ? '#ffb070' : '#2a1a10');
  g.addColorStop(0.35, open > 0 ? '#b8401a' : '#1a100a');
  g.addColorStop(1, '#0c0807');
  ctx.fillStyle = g;
  ctx.fill();
  if (open > 0) {
    glow(ctx, x, y, hw * 1.4 * open, SYN.ember, 0.45 * open, { blend: 'lighter' });
    // launch cradle rails
    ctx.strokeStyle = 'rgba(255,190,120,0.55)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(x - hw + 2, y - 2.5);
    ctx.lineTo(x + hw - 2, y - 2.5);
    ctx.moveTo(x - hw + 2, y + 2.5);
    ctx.lineTo(x + hw - 2, y + 2.5);
    ctx.stroke();
  }
  // two sliding doors (split along the centreline, retracting sideways)
  const doorH = hh * (1 - open);
  for (const s of [-1, 1]) {
    if (doorH <= 0.2) continue;
    const y0 = s < 0 ? y - hh : y + hh - doorH;
    roundRect(ctx, x - hw, y0, hw * 2, doorH, 0.8);
    ctx.fillStyle = metal(ctx, x - hw, y0, x + hw, y0 + doorH, 'gunmetal');
    ctx.fill();
    ink(ctx, 0.6);
    // door ribs
    ctx.strokeStyle = 'rgba(20,14,10,0.55)';
    ctx.lineWidth = 0.4;
    for (let k = -hw + 3; k < hw; k += 3) {
      ctx.beginPath();
      ctx.moveTo(x + k, y0 + 0.5);
      ctx.lineTo(x + k, y0 + doorH - 0.5);
      ctx.stroke();
    }
    // crimson leading edge
    ctx.fillStyle = SYN.crimson;
    const ey = s < 0 ? y0 + doorH - 0.9 : y0;
    ctx.fillRect(x - hw + 0.5, ey, hw * 2 - 1, 0.9);
  }
}

function drawCarrier(ctx, w, h) {
  const cx = 60;
  const cy = h / 2;
  const E = { nose: 2.3, tail: 1.55, fullness: 0.4 };
  const geo = envelopeGeo(cx, cy, 104, 50, E);

  // --- outriggers & engine pods (beneath the bag) ---
  for (const s of [-1, 1]) {
    for (const nx of [40, 74]) {
      cylinder(ctx, nx + 3, cy + s * 16, nx + 1, cy + s * 31, 2.6, 2, 'gunmetal');
      rivetedBand(ctx, nx - 6, cy + s * 18, nx - 2, cy + s * 30, 1.4, 'blackiron', { rivets: 3 });
      nacelle(ctx, nx, cy + s * 31, 19, 7.4, {
        kind: 'gunmetal',
        band: SYN.crimson,
        nose: 'blackiron',
        glow: SYN.ember,
      });
    }
  }

  // --- angular tail fins (cruciform: two planes + the rudder) ---
  const finTop = [geo.at(-0.52, -0.82), geo.at(-0.88, -0.62), [2.5, cy - 30], [17, cy - 33]];
  for (const pts of [finTop, mirrorY(finTop, cy)]) {
    fin(ctx, pts, { fill: '#3e424a', edge: SYN.crimson, spars: 3, kind: 'gunmetal', rivets: true });
  }

  // --- the armoured gasbag ---
  envelope(ctx, cx, cy, 104, 50, {
    ...E,
    fill: '#4d525b',
    gores: 10,
    ribs: 10,
    stitch: false,
    seam: 'rgba(8,8,12,0.5)',
    quilt: 0.06,
    gloss: 0.22,
    outline: 1.5,
    stripes: [
      { k0: -0.8, k1: -0.66, t0: -0.86, t1: 0.82, color: SYN.crimson },
      { k0: 0.66, k1: 0.8, t0: -0.86, t1: 0.82, color: SYN.crimson },
      { k0: -0.86, k1: -0.83, t0: -0.84, t1: 0.8, color: '#1a1b1f' },
      { k0: 0.83, k1: 0.86, t0: -0.84, t1: 0.8, color: '#1a1b1f' },
    ],
    bands: [
      { t0: 0.7, t1: 0.76, color: SYN.crimson },
      { t0: -0.7, t1: -0.66, color: '#1e1f24' },
    ],
    decorate(c, g) {
      // soot wash streaming aft + oily grime
      grime(c, g.x(-1), cy - 26, 104, 52, 0.55, 31, { color: '#0e0f12', streaks: 0.7 });
      const sg = c.createLinearGradient(g.x(-1), 0, g.x(0.2), 0);
      sg.addColorStop(0, 'rgba(10,10,12,0.45)');
      sg.addColorStop(1, 'rgba(10,10,12,0)');
      c.fillStyle = sg;
      c.fillRect(g.x(-1), cy - 26, 70, 52);
      // riveted armour panels on the shoulders
      const rnd = seeded(46);
      for (const s of [-1, 1]) {
        for (let t = -0.45; t < 0.6; t += 0.21) {
          const [px, py] = g.at(t + 0.1, s * 0.47);
          c.fillStyle = rnd() < 0.5 ? 'rgba(25,27,32,0.35)' : 'rgba(120,128,140,0.18)';
          c.fillRect(px - 9, py - 4.5, 19, 9);
          c.strokeStyle = 'rgba(10,10,12,0.5)';
          c.lineWidth = 0.4;
          c.strokeRect(px - 9, py - 4.5, 19, 9);
        }
      }
    },
  });

  // circumferential armour straps over the bag
  for (const t of [-0.62, -0.3, 0.38, 0.62]) {
    const x = geo.x(t);
    const hw = geo.hw(t);
    rivetedBand(ctx, x, cy - hw + 0.6, x, cy + hw - 0.6, 2.6, 'gunmetal', {
      curved: true,
      rivets: 3.2,
      rows: 2,
    });
  }

  // rows of ember portholes along the flanks
  for (const s of [-1, 1]) {
    for (let t = -0.42; t <= 0.56; t += 0.14) emberPort(ctx, ...geo.at(t, s * 0.6), 1.05, 2);
  }

  // --- armoured ram nose cap ---
  ctx.save();
  geo.path(ctx, 0.8, 1);
  ctx.fillStyle = metalRadial(ctx, geo.x(0.88), cy - 8, 18, 'blackiron', { spec: 0.4 });
  ctx.fill();
  shadeOverlay(ctx, geo.x(0.8), cy - 20, geo.x(1), cy + 20, 0.18, 0.4);
  ink(ctx, 1);
  ctx.restore();
  for (let k = -0.84; k <= 0.85; k += 0.21) rivet(ctx, geo.x(0.805) + 0.8, geo.y(0.805, k), 0.5, 'gunmetal');
  // nose spikes
  for (const s of [-1, 1]) {
    polygon(ctx, [
      [geo.x(0.9), cy + s * 6],
      [geo.x(1) + 4, cy + s * 4.5],
      [geo.x(0.92), cy + s * 3],
    ]);
    ctx.fillStyle = metal(ctx, geo.x(0.9), cy - 6, geo.x(1) + 4, cy + 6, 'steel');
    ctx.fill();
    ink(ctx, 0.6);
  }
  lamp(ctx, geo.x(0.96), cy, 1.5, '#ff4d2e', { halo: 3 });

  // --- dorsal flight deck ---
  const deckPts = [
    [22, cy - 7],
    [30, cy - 10],
    [86, cy - 9],
    [93, cy - 6],
    [93, cy + 6],
    [86, cy + 9],
    [30, cy + 10],
    [22, cy + 7],
  ];
  ambientOcclusion(ctx, () => polygon(ctx, deckPts), 0.5, 2.4);
  armor(ctx, deckPts, 'blackiron', { ink: 1.1, hi: 0.16, lo: 0.3 });
  ctx.save();
  polygon(ctx, deckPts);
  ctx.clip();
  panelLines(ctx, 22, cy - 10, 72, 20, 7, 5, { a: 0.35 });
  // aft ramp hazard chevrons
  hazardStripes(ctx, 22, cy - 10, 7, 20, { a: '#141414', b: '#c0392b', stripe: 2, ink: 0 });
  // runway centreline dashes + edge lines
  ctx.fillStyle = 'rgba(232,222,200,0.6)';
  for (let x = 62; x < 84; x += 5) ctx.fillRect(x, cy - 0.45, 2.6, 0.9);
  ctx.restore();
  trim(ctx, [[30, cy - 8.4], [86, cy - 7.6]], SYN.crimson, 0.9);
  trim(ctx, [[30, cy + 8.4], [86, cy + 7.6]], SYN.crimson, 0.9);
  // deck edge lights
  for (let x = 34; x <= 82; x += 8) {
    hotDot(ctx, x, cy - 8, 0.45, SYN.ember, 0.8);
    hotDot(ctx, x, cy + 8, 0.45, SYN.ember, 0.8);
  }

  // launch hatch (closed) — the animated part sprite sits exactly on top of this
  drawHatch(ctx, w / 2 + CARRIER.hatch[0], cy + CARRIER.hatch[1], 0);

  // stacks flanking the aft deck
  for (const [sx, sy] of CARRIER.stacks) synStack(ctx, w / 2 + sx, cy + sy, 3.2);
  ventGrille(ctx, 33, cy - 3, 6, 6, { slots: 3, kind: 'gunmetal', vertical: true, glow: SYN.ember });

  // --- armoured bridge tower near the bow ---
  const br = [
    [70, cy - 6],
    [80, cy - 7.5],
    [87, cy - 4],
    [87, cy + 4],
    [80, cy + 7.5],
    [70, cy + 6],
  ];
  ambientOcclusion(ctx, () => polygon(ctx, br), 0.45, 2);
  armor(ctx, br, 'syndicate', { rivets: true, ink: 1 });
  // slit windows glowing ember
  ctx.fillStyle = '#ff9a4a';
  for (const s of [-1, 1]) {
    polygon(ctx, [
      [81, cy + s * 5.6],
      [86, cy + s * 3],
      [86, cy + s * 2.2],
      [81, cy + s * 4.6],
    ]);
    ctx.fill();
  }
  glowEllipse(ctx, 84, cy, 4, 6, SYN.ember, 0.35);
  dome(ctx, 76, cy, 2.6, 'gunmetal', { rivets: 6 });
  crest(ctx, 76, cy, 1.9, { emblem: 'cog', field: SYN.crimson, kind: 'gunmetal', color: '#1a1a1a' });
  // twin defence guns on the bow shoulders
  for (const [gx, gy] of CARRIER.guns) {
    ringMount(ctx, w / 2 + gx, cy + gy, 3.4, { kind: 'gunmetal', table: 'blackiron', bolts: 6 });
    cannon(ctx, w / 2 + gx, cy + gy, 7, 1.8, 'blackiron', { bands: [0.5], knob: false });
  }

  // antenna mast & rigging to the fins
  for (const s of [-1, 1]) rigging(ctx, 28, cy + s * 7, 12, cy + s * 27, { width: 0.35, color: 'rgba(20,16,12,0.7)' });
}

reg('enemy_carrier', CARRIER.w, CARRIER.h, drawCarrier);
reg(
  'enemy_carrier_hatch',
  24,
  20,
  (ctx, w, h, f) => drawHatch(ctx, w / 2, h / 2, f / 4),
  { frames: 5 }
);
regProp('enemy_carrier_prop', 6.2, 3, 4);

// =============================================================================================
// Ironclad Frigate — an angular flying ironclad held up by two lift rotors, with five gunports
// down each broadside, twin crimson-banded stacks and a conning tower.
// =============================================================================================

export const FRIGATE = {
  w: 94,
  h: 58,
  ports: [-22, -12.5, -3, 6.5, 16], // hull-local x of the 5 gunports (each side)
  portY: 16.2, // |y| of the gun muzzles
  rotors: [
    [-23, 0, 12.5],
    [20, 0, 12.5],
  ],
  props: [
    [-46, -7.5],
    [-46, 7.5],
  ],
  stacks: [
    [-2, -6.5],
    [-2, 6.5],
  ],
};

function frigateHull(cy) {
  return [
    [92, cy],
    [80, cy - 8.5],
    [64, cy - 14.5],
    [18, cy - 14.5],
    [9, cy - 12],
    [4, cy - 7],
    [4, cy + 7],
    [9, cy + 12],
    [18, cy + 14.5],
    [64, cy + 14.5],
    [80, cy + 8.5],
  ];
}

function drawFrigate(ctx, w, h) {
  const cy = h / 2;
  const ox = w / 2;
  const hull = frigateHull(cy);

  // --- broadside guns (barrels run out through the ports, drawn under the hull edge) ---
  for (const s of [-1, 1]) {
    for (const px of FRIGATE.ports) {
      const x = ox + px;
      ctx.save();
      ctx.translate(x, cy + s * 12.5);
      ctx.rotate(s * Math.PI / 2);
      cannon(ctx, 0, 0, 7.2, 2.4, 'blackiron', { bands: [0.35, 0.8], taper: 0.85, knob: false });
      ctx.restore();
    }
  }

  // --- hull ---
  ambientOcclusion(ctx, () => polygon(ctx, hull), 0.4, 2);
  armor(ctx, hull, 'syndicate', { ink: 1.4, hi: 0.25, lo: 0.38 });
  ctx.save();
  polygon(ctx, hull);
  ctx.clip();
  grime(ctx, 4, cy - 15, 88, 30, 0.45, 77, { color: '#101114', streaks: 0.8 });
  // armour belt plates along the waterline
  ctx.strokeStyle = 'rgba(12,12,16,0.55)';
  ctx.lineWidth = 0.45;
  for (let x = 14; x < 80; x += 7.5) {
    ctx.beginPath();
    ctx.moveTo(x, cy - 15);
    ctx.lineTo(x + 1.5, cy - 11);
    ctx.moveTo(x, cy + 15);
    ctx.lineTo(x + 1.5, cy + 11);
    ctx.stroke();
  }
  ctx.restore();
  // crimson gunwale trim + black boot-top
  const inner = [
    [87, cy],
    [78, cy - 6.6],
    [63, cy - 11.6],
    [19, cy - 11.6],
    [11, cy - 9.6],
    [7.5, cy - 5.5],
    [7.5, cy + 5.5],
    [11, cy + 9.6],
    [19, cy + 11.6],
    [63, cy + 11.6],
    [78, cy + 6.6],
  ];
  trim(ctx, inner, SYN.crimson, 1.5, true);
  trim(ctx, inner, 'rgba(10,8,8,0.6)', 0.4, true);

  // --- armoured casemate deck ---
  const deckPts = [
    [80, cy],
    [74, cy - 5],
    [62, cy - 10],
    [20, cy - 10],
    [12, cy - 7],
    [12, cy + 7],
    [20, cy + 10],
    [62, cy + 10],
    [74, cy + 5],
  ];
  armor(ctx, deckPts, 'blackiron', { ink: 0.9, hi: 0.15, lo: 0.25 });
  ctx.save();
  polygon(ctx, deckPts);
  ctx.clip();
  panelLines(ctx, 12, cy - 10, 70, 20, 6, 4, { a: 0.32 });
  ctx.restore();
  // gunport hatches (crimson frames, dark mouths) at the hull edge
  for (const s of [-1, 1]) {
    for (const px of FRIGATE.ports) {
      const x = ox + px;
      const y = cy + s * 12.8;
      roundRect(ctx, x - 2.1, y - 1.4, 4.2, 2.8, 0.5);
      ctx.fillStyle = SYN.crimsonDark;
      ctx.fill();
      ink(ctx, 0.5);
      ctx.fillStyle = '#0b0807';
      ctx.fillRect(x - 1.3, y - 0.8, 2.6, 1.6);
    }
    rivetLine(ctx, 22, cy + s * 9.2, 70, cy + s * 9.2, 4, 0.42, 'gunmetal');
  }

  // --- rotor masts (the blades are animated part sprites) ---
  for (const [rx, ry] of FRIGATE.rotors) {
    const x = ox + rx;
    const y = cy + ry;
    ambientOcclusion(ctx, () => {
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, TAU);
    }, 0.4, 1.6);
    ringMount(ctx, x, y, 5, { kind: 'gunmetal', table: 'syndicate', bolts: 8 });
    dome(ctx, x, y, 2.4, 'blackiron', { rivets: 5 });
    // rotor guard struts
    for (const s of [-1, 1]) cylinder(ctx, x - 3, y + s * 3.5, x - 7, y + s * 9.5, 1.2, 0.9, 'gunmetal');
  }

  // --- stacks amidships ---
  for (const [sx, sy] of FRIGATE.stacks) synStack(ctx, ox + sx, cy + sy, 3.4);
  pipe(ctx, [[ox - 8, cy - 3], [ox - 12, cy - 3], [ox - 12, cy + 3], [ox - 8, cy + 3]], 1.2, 'copper', { flanges: true });

  // --- conning tower near the bow ---
  const tower = [
    [ox + 30, cy - 5],
    [ox + 36, cy - 3.2],
    [ox + 38, cy],
    [ox + 36, cy + 3.2],
    [ox + 30, cy + 5],
    [ox + 28, cy],
  ];
  armor(ctx, tower, 'gunmetal', { ink: 1, rivets: true, rivetR: 0.4 });
  ctx.fillStyle = '#ff9a4a';
  ctx.fillRect(ox + 35.2, cy - 2.2, 0.9, 4.4);
  glowEllipse(ctx, ox + 36, cy, 2.5, 4, SYN.ember, 0.4);
  // ram prow plate & bow spike
  polygon(ctx, [
    [92, cy],
    [84, cy - 4.5],
    [84, cy + 4.5],
  ]);
  ctx.fillStyle = metal(ctx, 84, cy - 4.5, 92, cy + 4.5, 'steel');
  ctx.fill();
  ink(ctx, 0.7);
  cannon(ctx, ox + 26, cy, 9, 2.6, 'blackiron', { bands: [0.4], knob: true });
  // stern: rudder gallery, lamps, Syndicate ensign plate
  rivetLine(ctx, 6, cy - 6, 6, cy + 6, 3, 0.45, 'gunmetal');
  lamp(ctx, 7, cy - 9.5, 0.9, '#ff4d2e', { halo: 3 });
  lamp(ctx, 7, cy + 9.5, 0.9, '#ff4d2e', { halo: 3 });
  crest(ctx, 15, cy, 2.6, { emblem: 'cog', field: SYN.crimson, kind: 'gunmetal', color: '#1a1a1a' });
  // stern prop shafts
  for (const [px, py] of FRIGATE.props) cylinder(ctx, ox + px + 6, cy + py, ox + px + 1, cy + py, 1.6, 1.2, 'gunmetal');
}

/** Gunport glow overlay: frame 0 = port side (−y), frame 1 = starboard (+y). Additive. */
function drawFrigateGlow(ctx, w, h, f) {
  const cy = h / 2;
  const s = f === 0 ? -1 : 1;
  for (const px of FRIGATE.ports) {
    const x = w / 2 + px;
    const y = cy + s * 12.8;
    glow(ctx, x, y + s * 2, 6.5, SYN.ember, 0.75);
    glow(ctx, x, y, 2.6, SYN.emberHot, 1, { core: 0.3 });
  }
}

/** Lift rotor blades (2-bladed, long), frames spin through 180°. */
function drawRotor(ctx, w, h, f) {
  const r = 12.5;
  propeller(ctx, w / 2, h / 2, r, 2, (f / 6) * Math.PI, {
    kind: 'gunmetal',
    hub: 'blackiron',
    tip: SYN.crimson,
    blur: 0.95,
    width: 0.16,
  });
}

reg('enemy_frigate', FRIGATE.w, FRIGATE.h, drawFrigate);
reg('enemy_frigate_glow', FRIGATE.w, FRIGATE.h, drawFrigateGlow, { frames: 2 });
reg('enemy_frigate_rotor', 27, 27, drawRotor, { frames: 6 });
regProp('enemy_frigate_prop', 4.4, 3, 4);

// =============================================================================================
// Mortar Barge — a squat armoured barge slung between four war-balloons, shell racks on deck
// and a monstrous trainable mortar amidships.
// =============================================================================================

export const BARGE = {
  w: 86,
  h: 70,
  mortar: [2, 0], // hull-local mortar trunnion
  balloons: [
    [-21, -26],
    [-21, 26],
    [19, -26],
    [19, 26],
  ],
  props: [
    [-42, -9],
    [-42, 9],
  ],
  stacks: [[-30, 0]],
};

function bargeHull(cy) {
  return [
    [82, cy - 9],
    [82, cy + 9],
    [74, cy + 18],
    [12, cy + 18],
    [5, cy + 12],
    [5, cy - 12],
    [12, cy - 18],
    [74, cy - 18],
  ];
}

function drawBarge(ctx, w, h) {
  const cy = h / 2;
  const ox = w / 2;

  // --- balloon outriggers (beams + chains) & the balloons themselves ---
  for (const [bx, by] of BARGE.balloons) {
    const x = ox + bx;
    const y = cy + by;
    const s = Math.sign(by);
    rivetedBand(ctx, x, cy + s * 12, x, y - s * 3, 2.2, 'gunmetal', { rivets: 3 });
    chain(ctx, x - 5, cy + s * 16, x - 3, y - s * 4, 1.6, 'iron');
  }
  for (const [bx, by] of BARGE.balloons) {
    balloon(ctx, ox + bx, cy + by, 8.6, {
      colors: ['#4f545d', '#3a3d44', SYN.crimson, '#3a3d44'],
      gores: 8,
      rotation: bx * 0.1,
      patches: 1,
      seed: Math.round(bx * 3 + by),
    });
    rivetRing(ctx, ox + bx, cy + by, 8.1, 10, 0.4, 'gunmetal');
  }

  // --- hull ---
  const hull = bargeHull(cy);
  ambientOcclusion(ctx, () => polygon(ctx, hull), 0.4, 2.2);
  armor(ctx, hull, 'syndicate', { ink: 1.4, rivets: true, rivetR: 0.6 });
  ctx.save();
  polygon(ctx, hull);
  ctx.clip();
  grime(ctx, 5, cy - 18, 78, 36, 0.5, 88, { color: '#0f1013', streaks: 0.7 });
  // bow hazard plating
  hazardStripes(ctx, 74, cy - 18, 9, 36, { a: '#141414', b: SYN.crimson, stripe: 2.6, ink: 0 });
  ctx.restore();
  // deck well
  const deckPts = [
    [72, cy - 13],
    [72, cy + 13],
    [14, cy + 13],
    [10, cy + 9],
    [10, cy - 9],
    [14, cy - 13],
  ];
  armor(ctx, deckPts, 'blackiron', { ink: 0.9, hi: 0.12, lo: 0.22 });
  ctx.save();
  polygon(ctx, deckPts);
  ctx.clip();
  panelLines(ctx, 10, cy - 13, 62, 26, 7, 5.2, { a: 0.3 });
  ctx.restore();
  trim(ctx, [[14, cy - 15.6], [72, cy - 15.6]], SYN.crimson, 1.4);
  trim(ctx, [[14, cy + 15.6], [72, cy + 15.6]], SYN.crimson, 1.4);

  // --- shell racks: rows of fused shells, noses up ---
  const shellRow = (x0, y0, nx, ny) => {
    roundRect(ctx, x0 - 2.2, y0 - 2.2, nx * 3.6 + 0.8, ny * 3.6 + 0.8, 0.8);
    ctx.fillStyle = '#1a1b1f';
    ctx.fill();
    ink(ctx, 0.6);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const x = x0 + i * 3.6;
        const y = y0 + j * 3.6;
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, TAU);
        ctx.fillStyle = metalRadial(ctx, x, y, 1.5, 'blackiron', { spec: 0.5 });
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, 0.6, 0, TAU);
        ctx.fillStyle = (i + j) % 3 === 0 ? SYN.crimson : '#c9973f';
        ctx.fill();
      }
    }
  };
  shellRow(18, cy - 10.5, 3, 2);
  shellRow(18, cy + 7, 3, 2);
  shellRow(62, cy - 10.5, 2, 2);
  shellRow(62, cy + 7, 2, 2);

  // --- the mortar pit (turret drawn as a part on top) ---
  const mx = ox + BARGE.mortar[0];
  ambientOcclusion(ctx, () => {
    ctx.beginPath();
    ctx.arc(mx, cy, 13, 0, TAU);
  }, 0.5, 2.4);
  ringMount(ctx, mx, cy, 13, { kind: 'gunmetal', table: 'blackiron', bolts: 14 });
  ctx.save();
  ctx.beginPath();
  ctx.arc(mx, cy, 13, 0, TAU);
  ctx.arc(mx, cy, 10.5, 0, TAU, true);
  ctx.clip('evenodd');
  hazardStripes(ctx, mx - 13, cy - 13, 26, 26, { a: '#151515', b: '#d9a12a', stripe: 2.2, ink: 0 });
  ctx.restore();
  drawMortar(ctx, mx, cy, 0, 0);

  // --- stack, vents, bridge ---
  for (const [sx, sy] of BARGE.stacks) synStack(ctx, ox + sx, cy + sy, 4.6);
  ventGrille(ctx, 20, cy - 2.5, 5, 5, { slots: 3, kind: 'gunmetal', vertical: true, glow: SYN.ember });
  const cab = [
    [66, cy - 5],
    [72, cy - 4],
    [74, cy],
    [72, cy + 4],
    [66, cy + 5],
  ];
  armor(ctx, cab, 'gunmetal', { ink: 0.9, rivets: true, rivetR: 0.4 });
  emberPort(ctx, 71, cy - 2, 0.8, 2);
  emberPort(ctx, 71, cy + 2, 0.8, 2);
  // rangefinder bar
  cylinder(ctx, 68, cy - 7.5, 68, cy + 7.5, 1.3, 1.3, 'gunmetal', { capStart: true, capEnd: true });
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(68, cy + s * 7.5, 0.9, 0, TAU);
    ctx.fillStyle = '#ff6a3a';
    ctx.fill();
  }
  // stern prop shafts
  for (const [px, py] of BARGE.props) cylinder(ctx, ox + px + 7, cy + py, ox + px + 1, cy + py, 1.8, 1.3, 'gunmetal');
  lamp(ctx, 80, cy - 13, 0.9, '#ff4d2e', { halo: 3 });
  lamp(ctx, 80, cy + 13, 0.9, '#ff4d2e', { halo: 3 });
}

/**
 * The mortar seen from above at elevation: stubby fat barrel tilted toward +x, wide bore.
 * heat 0..1 (glowing bore), recoil 0..1 (barrel pulled back).
 */
function drawMortar(ctx, x, y, heat, recoil) {
  const back = recoil * 3;
  // trunnion cradle
  roundRect(ctx, x - 7, y - 8.5, 10, 17, 2);
  ctx.fillStyle = metal(ctx, x - 7, y - 8.5, x + 3, y + 8.5, 'gunmetal');
  ctx.fill();
  ink(ctx, 0.9);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(x - 2, y + s * 7.2, 1.5, 0, TAU);
    ctx.fillStyle = metalRadial(ctx, x - 2, y + s * 7.2, 1.5, 'steel');
    ctx.fill();
    ink(ctx, 0.5);
  }
  // barrel: fat cylinder rising toward +x
  const bx0 = x - 5 - back;
  const bx1 = x + 7 - back;
  ctx.beginPath();
  ctx.moveTo(bx0, y - 5.4);
  ctx.lineTo(bx1, y - 6.6);
  ctx.lineTo(bx1, y + 6.6);
  ctx.lineTo(bx0, y + 5.4);
  ctx.closePath();
  ctx.fillStyle = cylinderGrad(ctx, 0, y - 6.6, 0, y + 6.6, 'blackiron');
  ctx.fill();
  ink(ctx, 1);
  // reinforce bands
  for (const t of [0.25, 0.6]) {
    const bx = bx0 + (bx1 - bx0) * t;
    const hw = 5.4 + 1.2 * t + 0.5;
    roundRect(ctx, bx - 0.9, y - hw, 1.8, hw * 2, 0.6);
    ctx.fillStyle = cylinderGrad(ctx, 0, y - hw, 0, y + hw, 'gunmetal');
    ctx.fill();
    ink(ctx, 0.4);
  }
  ctx.fillStyle = SYN.crimson;
  ctx.fillRect(bx0 + 2.2, y - 5.6, 1.3, 11.2);
  // muzzle face (ellipse, we look down the tilted bore)
  ctx.beginPath();
  ctx.ellipse(bx1, y, 3.3, 7, 0, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, bx1 - 1, y - 2, 7, 'gunmetal', { spec: 0.3 });
  ctx.fill();
  ink(ctx, 0.9);
  ctx.beginPath();
  ctx.ellipse(bx1 + 0.3, y, 2.3, 5.2, 0, 0, TAU);
  const g = ctx.createRadialGradient(bx1 + 0.6, y, 0, bx1, y, 5.4);
  if (heat > 0) {
    g.addColorStop(0, alpha('#fff0c8', heat));
    g.addColorStop(0.35, alpha('#ff7a2f', 0.4 + heat * 0.6));
    g.addColorStop(1, '#2a0c05');
  } else {
    g.addColorStop(0, '#2a1810');
    g.addColorStop(1, '#070504');
  }
  ctx.fillStyle = g;
  ctx.fill();
  if (heat > 0) glow(ctx, bx1 + 1, y, 9 * heat, SYN.ember, 0.6 * heat);
}

reg('enemy_mortarBarge', BARGE.w, BARGE.h, drawBarge);
// frames: 0 cold, 1 warm, 2 hot, 3 hot + recoiled
reg(
  'enemy_mortarBarge_mortar',
  32,
  24,
  (ctx, w, h, f) => drawMortar(ctx, 13, h / 2, [0, 0.45, 1, 1][f], f === 3 ? 1 : 0),
  { frames: 4, cx: 13, cy: 12 }
);
regProp('enemy_mortarBarge_prop', 5, 3, 4);

