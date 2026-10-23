// Skirmisher art (WP12) — Iron Syndicate light craft. Top-down, facing +x, light from the
// top-left, dark outlines, no baked drop shadows (the engine/defs draw them).
//
// Palette: gunmetal hulls, crimson trim & canvas, sooty stacks, ember-glowing ports. Every
// silhouette is built to read at a glance next to the cream/brass player ships:
//   gyroScout   — compact arrowhead pod under a big spinning 2-blade rotor disc
//   kiteBomber  — wide swept crimson bat-kite with a bomb rack and streaming tails
//   balloonMine — round, spiked, with a blinking red crown lamp
//   gunboat     — catamaran: armoured boat hull slung between two dark gasbags, triple turret
//   clockWasp   — insect: ember eyes, striped abdomen, stinger, flickering wings
//   flakIsland  — big floating rock fortress with a twin-barrel flak gun
//
// Sprites (all registered here):
//   enemy_gyroScout, enemy_gyroScout_rotor
//   enemy_kiteBomber, enemy_kiteBomber_prop, enemy_kiteBomber_bomb
//   enemy_balloonMine, enemy_balloonMine_lamp, enemy_balloonMine_glow
//   enemy_gunboat, enemy_gunboat_turret, enemy_gunboat_prop, enemy_gunboat_glow
//   enemy_clockWasp, enemy_clockWasp_wings (3 frames), enemy_clockWasp_eyes
//   enemy_flakIsland, enemy_flakIsland_turret, enemy_flakIsland_chunk (4 frames)

import { Sprites } from '../../gfx/sprites.js';
import {
  METALS,
  TAU,
  alpha,
  mix,
  seeded,
  metal,
  metalRadial,
  cylinderGrad,
  roundRect,
  polygon,
  smoothPath,
  ink,
  shadeOverlay,
  rimLight,
  withClip,
  glow,
  rivet,
  rivetLine,
  rivetRing,
  bolt,
  gear,
  propeller,
  porthole,
  cylinder,
  plate,
  smokestack,
  grime,
  cannon,
  ventGrille,
  hazardStripes,
  rivetedBand,
  spike,
  lamp,
  dome,
  deck,
  railing,
  nacelle,
  ringMount,
  panelLines,
  envelope,
  balloon,
  canvasPatch,
  chain,
  flag,
  fin,
} from '../../gfx/drawkit.js';

/** Iron Syndicate colours. */
export const SYN = {
  hull: METALS.syndicate,
  crimson: METALS.crimson,
  ember: '#ff7a2f',
  emberHot: '#ffd2a0',
  red: '#ff3b2a',
  soot: '#1c1714',
  canvasDark: '#3a3d44',
};

const ART_SCALE = 3; // small craft: render sharper than the default SPRITE_SCALE

/** Sprite metrics (world units) — shared with the behaviour module for part placement. */
export const ART = {
  gyroScout: { w: 34, h: 34, rotor: [-1, 0], rotorR: 17 },
  kiteBomber: {
    w: 54,
    h: 50,
    prop: [-19.5, 0],
    // bomb rack slots (body-local), released in order
    bombs: [
      [-4, -7.5],
      [-4, 7.5],
      [4, -7],
      [4, 7],
    ],
    // wingtip trailing points for the kite tails
    tails: [
      [-20.5, -10],
      [-20.5, 10],
    ],
  },
  balloonMine: { w: 46, h: 46, lamp: [-1.3, -1.5] },
  gunboat: {
    w: 68,
    h: 52,
    turret: [11, 0],
    turretMuzzle: 16.5,
    props: [
      [-24, -16.5],
      [-24, 16.5],
    ],
    stacks: [
      [-13, -3.6],
      [-13, 3.6],
    ],
  },
  clockWasp: { w: 34, h: 30, eyes: [8.4, 0] },
  flakIsland: {
    w: 104,
    h: 104,
    turret: [4, 0],
    turretMuzzle: 31,
    stack: [-17, -15],
  },
};

const reg = (name, def) => Sprites.register(name, { scale: ART_SCALE, ...def });

/** Flat polygon fill + volume shading + ink in one go. */
function solid(ctx, pts, fill, box, opts = {}) {
  polygon(ctx, pts);
  ctx.fillStyle = fill;
  ctx.fill();
  if (box) shadeOverlay(ctx, box[0], box[1], box[2], box[3], opts.hi ?? 0.2, opts.lo ?? 0.32);
  if (opts.rim) {
    polygon(ctx, pts);
    rimLight(ctx, box[0], box[1], box[2], box[3], opts.rim, 0.35);
  }
  polygon(ctx, pts);
  ink(ctx, opts.ink ?? 1);
}

const mirror = (pts, cy) => pts.map(([x, y]) => [x, cy * 2 - y]);

/** Ember-lit glass (cockpits, eyes): deep red rim → hot core → white glint. */
function emberGlass(ctx, x, y, rx, ry, opts = {}) {
  const { halo = 0, rot = 0 } = opts;
  if (halo) glow(ctx, x, y, Math.max(rx, ry) * halo, SYN.ember, 0.45);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  const g = ctx.createRadialGradient(rx * 0.15, ry * 0.1, 0, 0, 0, Math.max(rx, ry));
  g.addColorStop(0, '#ffe6b8');
  g.addColorStop(0.35, '#ff8a3a');
  g.addColorStop(0.75, '#a3260f');
  g.addColorStop(1, '#3a0c07');
  ctx.fillStyle = g;
  ctx.fill();
  ink(ctx, 0.6);
  ctx.beginPath();
  ctx.ellipse(-rx * 0.35, -ry * 0.38, rx * 0.32, ry * 0.2, -0.5, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fill();
  ctx.restore();
}

// =============================================================================================
// Gyro Scout — arrowhead pod, twin stub guns, crimson nose chevron, rotor mast.
// =============================================================================================

function drawGyroScout(ctx, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  // tail boom & tail planes
  cylinder(ctx, cx - 4, cy, 4.5, cy, 2.6, 1.6, 'gunmetal', { capEnd: true });
  const tp = [
    [9.5, cy - 0.6],
    [4.2, cy - 6.8],
    [2.2, cy - 6.6],
    [4.4, cy - 0.6],
  ];
  for (const pts of [tp, mirror(tp, cy)]) solid(ctx, pts, SYN.crimson[1], [2, cy - 7, 10, cy + 7], { ink: 0.7 });
  // tiny tail rotor
  ctx.beginPath();
  ctx.ellipse(3.6, cy, 0.9, 3.4, 0, 0, TAU);
  ctx.fillStyle = alpha(METALS.iron[1], 0.55);
  ctx.fill();
  ink(ctx, 0.4, 0.6);

  // stub wings with gun pods
  const wing = [
    [cx + 3, cy - 4],
    [cx - 2, cy - 11.5],
    [cx - 5.5, cy - 11.5],
    [cx - 5, cy - 4],
  ];
  for (const s of [-1, 1]) {
    const pts = s < 0 ? wing : mirror(wing, cy);
    solid(ctx, pts, metal(ctx, cx - 6, cy - 12, cx + 4, cy + 12, 'syndicate'), null, { ink: 0.8 });
    cannon(ctx, cx - 4.5, cy + s * 10.2, 12, 2.2, 'blackiron', { bands: [0.3], swell: 1.15, knob: false });
    rivet(ctx, cx - 3.3, cy + s * 7, 0.45, 'iron');
  }

  // main pod — angular, armoured
  const pod = [
    [cx + 12.5, cy],
    [cx + 8, cy - 5.6],
    [cx - 1, cy - 7.2],
    [cx - 7.5, cy - 4.2],
    [cx - 7.5, cy + 4.2],
    [cx - 1, cy + 7.2],
    [cx + 8, cy + 5.6],
  ];
  polygon(ctx, pod);
  ctx.fillStyle = metal(ctx, cx - 8, cy - 7, cx + 12, cy + 7, 'syndicate');
  ctx.fill();
  withClip(
    ctx,
    () => polygon(ctx, pod),
    () => {
      panelLines(ctx, cx - 8, cy - 8, 21, 16, 5, 4, { stagger: true, a: 0.18 });
      grime(ctx, cx - 8, cy - 8, 12, 16, 0.45, 5, { color: SYN.soot, streaks: 0.6 });
      // crimson nose chevron
      polygon(ctx, [
        [cx + 13, cy],
        [cx + 8, cy - 6],
        [cx + 5.8, cy - 5.6],
        [cx + 9.6, cy],
        [cx + 5.8, cy + 5.6],
        [cx + 8, cy + 6],
      ]);
      ctx.fillStyle = SYN.crimson[1];
      ctx.fill();
      ctx.fillStyle = alpha(SYN.crimson[0], 0.55);
      ctx.fillRect(cx + 6, cy - 5.8, 4, 1);
    }
  );
  polygon(ctx, pod);
  shadeOverlay(ctx, cx - 8, cy - 7, cx + 12, cy + 7, 0.22, 0.34);
  polygon(ctx, pod);
  rimLight(ctx, cx - 8, cy - 7, cx + 12, cy + 7, 0.8, 0.4);
  polygon(ctx, pod);
  ink(ctx, 1);
  // cockpit — ember glass
  emberGlass(ctx, cx + 5.2, cy, 3.1, 2.5, { halo: 1.6 });
  // engine grille & rivets
  ventGrille(ctx, cx - 6.8, cy - 2.4, 3, 4.8, { slots: 3, kind: 'gunmetal', vertical: true, glow: SYN.ember });
  rivetLine(ctx, cx - 0.5, cy - 6.4, cx + 7.4, cy - 5, 2.6, 0.38, 'iron');
  rivetLine(ctx, cx - 0.5, cy + 6.4, cx + 7.4, cy + 5, 2.6, 0.38, 'iron');
  // rotor mast collar (the rotor sprite sits on top of it)
  dome(ctx, cx - 1, cy, 2.2, 'gunmetal', { rivets: 6 });
}

function drawGyroRotor(ctx, w, h) {
  propeller(ctx, w / 2, h / 2, w / 2 - 0.5, 2, 0.4, {
    kind: 'gunmetal',
    hub: 'iron',
    tip: SYN.crimson[1],
    blur: 0.5,
    width: 0.1,
  });
}

// =============================================================================================
// Kite Bomber — swept crimson bat-kite, iron spars, gunmetal nacelle with a pusher prop.
// =============================================================================================

function drawKiteBomber(ctx, w, h) {
  const cy = h / 2;
  const nx = 50; // nose
  const hub = [30, cy];
  // Bat-kite: battens radiate from the hub to these tips (port side, front → rear).
  const tips = [
    [17, 2.2],
    [9.5, 8.2],
    [6, 15.6],
    [8.6, cy - 2.6],
  ];
  const tipsS = tips.map(([x, y]) => [x, h - y]);
  const scallop = (a, b) => {
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    ctx.quadraticCurveTo(mx + (hub[0] - mx) * 0.3, my + (hub[1] - my) * 0.3, b[0], b[1]);
  };
  const sailPath = () => {
    ctx.beginPath();
    ctx.moveTo(nx - 3, cy);
    ctx.quadraticCurveTo(33, 4.5, tips[0][0], tips[0][1]);
    for (let i = 1; i < tips.length; i++) scallop(tips[i - 1], tips[i]);
    scallop(tips[tips.length - 1], tipsS[tipsS.length - 1]);
    for (let i = tipsS.length - 1; i > 0; i--) scallop(tipsS[i], tipsS[i - 1]);
    ctx.quadraticCurveTo(33, h - 4.5, nx - 3, cy);
    ctx.closePath();
  };
  sailPath();
  ctx.fillStyle = metal(ctx, 6, 2, 46, h - 2, 'crimson');
  ctx.fill();
  withClip(ctx, sailPath, () => {
    // alternate darker gores between battens
    const all = [[nx + 4, cy - 14], ...tips, ...tipsS.slice().reverse(), [nx + 4, cy + 14]];
    for (let i = 0; i < all.length - 1; i++) {
      if (i % 2 === 0) continue;
      polygon(ctx, [hub, all[i], all[i + 1]]);
      ctx.fillStyle = alpha(SYN.crimson[3], 0.55);
      ctx.fill();
    }
    // black syndicate chevron across the sail
    ctx.beginPath();
    ctx.moveTo(41, cy);
    ctx.lineTo(24, 0);
    ctx.lineTo(20.5, 0);
    ctx.lineTo(37.5, cy);
    ctx.lineTo(20.5, h);
    ctx.lineTo(24, h);
    ctx.closePath();
    ctx.fillStyle = alpha('#141210', 0.85);
    ctx.fill();
    grime(ctx, 4, 0, 24, h, 0.5, 17, { color: SYN.soot, streaks: 0.8 });
    canvasPatch(ctx, 15, cy - 11, 4.2, 3, { color: '#9e3a2e', rot: 0.3 });
    canvasPatch(ctx, 19, cy + 14, 3.6, 2.8, { color: '#a8442f', rot: -0.2 });
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.3;
    for (let i = -50; i < 60; i += 2.2) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 30, h);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
  sailPath();
  shadeOverlay(ctx, 6, 2, 46, h - 2, 0.2, 0.32);
  sailPath();
  ink(ctx, 1.1);
  // battens (iron) and leading-edge spars (gunmetal)
  for (const t of [...tips, ...tipsS]) cylinder(ctx, hub[0], hub[1], t[0], t[1], 1, 0.7, 'iron', { ink: 0.45, capEnd: true });
  cylinder(ctx, nx - 3, cy - 0.6, tips[0][0], tips[0][1], 1.5, 1.1, 'gunmetal', { capEnd: true });
  cylinder(ctx, nx - 3, cy + 0.6, tipsS[0][0], tipsS[0][1], 1.5, 1.1, 'gunmetal', { capEnd: true });
  for (const t of [...tips, ...tipsS]) bolt(ctx, t[0], t[1], 0.75, 'iron');
  // bomb bays (bombs are a runtime overlay so they can be released)
  for (const [bx, by] of ART.kiteBomber.bombs) {
    roundRect(ctx, 27 + bx - 4.2, cy + by - 2.6, 8.4, 5.2, 1.6);
    ctx.fillStyle = metal(ctx, 22, cy - 10, 36, cy + 10, 'gunmetal');
    ctx.fill();
    ink(ctx, 0.6);
    ctx.fillStyle = 'rgba(12,8,6,0.85)';
    ctx.fillRect(27 + bx - 3.3, cy + by - 1.8, 6.6, 3.6);
  }
  // fuselage nacelle
  nacelle(ctx, 31, cy, 32, 5.6, { kind: 'syndicate', band: SYN.crimson[1], nose: 'iron', glow: SYN.ember });
  lamp(ctx, nx + 0.4, cy, 1.1, '#ff5a2a', { halo: 3.2, cage: false });
  emberGlass(ctx, 40, cy, 2.1, 1.5);
  // tail outrigger to the pusher prop
  cylinder(ctx, 16, cy, 8, cy, 2, 1.5, 'gunmetal', { capEnd: true });
}

function drawKiteProp(ctx, w, h) {
  propeller(ctx, w / 2, h / 2, w / 2 - 0.4, 3, 0.2, { kind: 'iron', hub: 'gunmetal', tip: SYN.crimson[1], blur: 0.85 });
}

/** Syndicate aerial bomb (faces +x): black iron body, cross tail fins, crimson band, fuse cap. */
function drawBomb(ctx, w, h) {
  const y = h / 2;
  // tail fins
  polygon(ctx, [
    [3.6, y - 0.7],
    [1, y - 3.2],
    [0.4, y - 3.2],
    [1.4, y],
    [0.4, y + 3.2],
    [1, y + 3.2],
    [3.6, y + 0.7],
  ]);
  ctx.fillStyle = cylinderGrad(ctx, 0, y - 3.2, 0, y + 3.2, 'gunmetal');
  ctx.fill();
  ink(ctx, 0.4);
  ctx.beginPath();
  ctx.ellipse(5.4, y, 3.4, 2.7, 0, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, 5.4, y, 3.4, 'blackiron', { spec: 0.6 });
  ctx.fill();
  ink(ctx, 0.5);
  ctx.fillStyle = alpha(SYN.crimson[1], 0.95);
  ctx.fillRect(4.1, y - 2.55, 1.1, 5.1);
  ctx.beginPath();
  ctx.arc(8.6, y, 0.75, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, 8.6, y, 0.75, 'brass');
  ctx.fill();
}

// =============================================================================================
// Balloon Mine — spiked contact mine hanging under a small dark/crimson balloon.
// =============================================================================================

function drawBalloonMine(ctx, w, h) {
  const x = w / 2;
  const y = h / 2;
  // contact horns (mine body below the balloon)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + 0.2;
    const major = i % 2 === 0;
    const r0 = 12.4;
    const len = major ? 8.4 : 4.6;
    spike(ctx, x + Math.cos(a) * r0, y + Math.sin(a) * r0, len, major ? 3.4 : 2.4, a, 'blackiron');
    if (major) {
      const tx = x + Math.cos(a) * (r0 + len - 1.2);
      const ty = y + Math.sin(a) * (r0 + len - 1.2);
      ctx.beginPath();
      ctx.arc(tx, ty, 1.15, 0, TAU);
      ctx.fillStyle = metalRadial(ctx, tx, ty, 1.15, 'copper', { spec: 0.6 });
      ctx.fill();
      ink(ctx, 0.35);
    }
  }
  // mine shell rim with crimson/black hazard band
  ctx.beginPath();
  ctx.arc(x, y, 14.2, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, x, y, 14.2, 'syndicate', { spec: 0.25 });
  ctx.fill();
  ink(ctx, 1);
  withClip(
    ctx,
    () => {
      ctx.beginPath();
      ctx.arc(x, y, 13.4, 0, TAU);
      ctx.arc(x, y, 11.6, 0, TAU, true);
    },
    () => {
      ctx.save();
      ctx.translate(x, y);
      for (let i = 0; i < 24; i++) {
        ctx.rotate(TAU / 24);
        ctx.fillStyle = i % 2 ? SYN.crimson[1] : '#17130f';
        ctx.fillRect(10, -1.7, 5, 3.4);
      }
      ctx.restore();
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, TAU);
      shadeOverlay(ctx, x - 14, y - 14, x + 14, y + 14, 0.2, 0.4);
    }
  );
  rivetRing(ctx, x, y, 14.6, 16, 0.42, 'iron', 0.1);
  // the balloon — dark gunmetal & crimson gores
  balloon(ctx, x, y, 10.8, {
    colors: [SYN.canvasDark, SYN.crimson[2], SYN.canvasDark, '#5a1b18'],
    gores: 8,
    rotation: 0.4,
    patches: 1,
    seed: 41,
  });
  // net cords over the balloon
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 10.8, 0, TAU);
  ctx.clip();
  ctx.strokeStyle = 'rgba(20,14,10,0.55)';
  ctx.lineWidth = 0.35;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.1;
    ctx.beginPath();
    ctx.moveTo(x - 1.3, y - 1.5);
    ctx.quadraticCurveTo(x + Math.cos(a + 0.3) * 7, y + Math.sin(a + 0.3) * 7, x + Math.cos(a) * 11, y + Math.sin(a) * 11);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(x - 0.6, y - 0.7, 6.8, 0, TAU);
  ctx.stroke();
  ctx.restore();
  // crown lamp (unlit) — the lit lens is a runtime overlay
  const [lx, ly] = ART.balloonMine.lamp;
  ctx.beginPath();
  ctx.arc(x + lx, y + ly, 2.6, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, x + lx, y + ly, 2.6, 'gunmetal', { spec: 0.4 });
  ctx.fill();
  ink(ctx, 0.5);
  ctx.beginPath();
  ctx.arc(x + lx, y + ly, 1.6, 0, TAU);
  ctx.fillStyle = '#4a0f0a';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + lx - 0.5, y + ly - 0.5, 0.6, 0, TAU);
  ctx.fillStyle = 'rgba(255,200,180,0.6)';
  ctx.fill();
}

function drawMineLamp(ctx, w, h) {
  lamp(ctx, w / 2, h / 2, 1.8, '#ff3b2a', { halo: 3.4, cage: true });
}

function drawRedGlow(ctx, w, h) {
  glow(ctx, w / 2, h / 2, w / 2, '#ff3b2a', 1, { core: 0.12 });
}

function drawEmberGlow(ctx, w, h) {
  glow(ctx, w / 2, h / 2, w / 2, '#ff8a3a', 1, { core: 0.15 });
}

// =============================================================================================
// Pirate Gunboat — armoured hull between twin gasbags, stacks aft, skull pennant.
// =============================================================================================

function drawGunboat(ctx, w, h) {
  const cy = h / 2;
  const cx = w / 2;
  const by = 16.5; // gasbag offset
  // outrigger struts (under the bags)
  for (const s of [-1, 1]) {
    for (const x of [cx - 8, cx + 7]) {
      rivetedBand(ctx, x, cy + s * 5, x - 1, cy + s * (by - 2), 2.6, 'gunmetal', { rivets: 2.4, rivetR: 0.38 });
    }
  }
  // twin gasbags
  for (const s of [-1, 1]) {
    const gy = cy + s * by;
    // tail fins on the bag
    const ft = [
      [cx - 17, gy - s * 3.2],
      [cx - 25.5, gy - s * 7.5],
      [cx - 28, gy - s * 7.2],
      [cx - 24, gy - s * 2.4],
    ];
    fin(ctx, ft, { fill: SYN.crimson[1], edge: SYN.hull[3], spars: 2, kind: 'iron' });
    envelope(ctx, cx + 1, gy, 48, 12.5, {
      fill: SYN.canvasDark,
      nose: 2.2,
      tail: 1.6,
      gores: 4,
      ribs: 7,
      quilt: 0.2,
      gloss: 0.25,
      stripes: [{ k0: -0.22, k1: 0.22, t0: -0.9, t1: 0.86, color: SYN.crimson[1] }],
      bands: [{ t0: 0.72, t1: 0.78, color: '#17130f' }],
      decorate(c, g) {
        grime(c, g.x(-1), gy - 7, 22, 14, 0.6, 7 + s, { color: SYN.soot, streaks: 0.8 });
      },
    });
    // iron nose cap on each bag
    ctx.beginPath();
    ctx.arc(cx + 23.5, gy, 1.6, 0, TAU);
    ctx.fillStyle = metalRadial(ctx, cx + 23.5, gy, 1.6, 'iron', { spec: 0.5 });
    ctx.fill();
    ink(ctx, 0.5);
    // engine pod at the bag's tail (prop is a runtime overlay)
    cylinder(ctx, cx - 19, gy, cx - 24.5, gy, 2.8, 2, 'syndicate', { capEnd: true });
  }

  // central armoured hull — boat shape, ram bow
  const hull = [
    [cx + 31, cy],
    [cx + 22, cy - 6.6],
    [cx - 14, cy - 7.4],
    [cx - 21, cy - 5.4],
    [cx - 22.5, cy],
    [cx - 21, cy + 5.4],
    [cx - 14, cy + 7.4],
    [cx + 22, cy + 6.6],
  ];
  polygon(ctx, hull);
  ctx.fillStyle = metal(ctx, cx - 22, cy - 8, cx + 30, cy + 8, 'syndicate');
  ctx.fill();
  ink(ctx, 1.2);
  // deck inset (dark planks)
  const deckPts = [
    [cx + 24.5, cy],
    [cx + 19.5, cy - 4.6],
    [cx - 13, cy - 5.4],
    [cx - 18.5, cy - 3.8],
    [cx - 19.5, cy],
    [cx - 18.5, cy + 3.8],
    [cx - 13, cy + 5.4],
    [cx + 19.5, cy + 4.6],
  ];
  withClip(
    ctx,
    () => polygon(ctx, deckPts),
    () => {
      deck(ctx, cx - 22, cy - 7, 48, 14, { kind: 'darkwood', plank: 1.6, ink: 0, seed: 9 });
      grime(ctx, cx - 22, cy - 7, 24, 14, 0.5, 13, { color: SYN.soot, streaks: 0.7 });
    }
  );
  polygon(ctx, deckPts);
  ctx.lineWidth = 0.6;
  ctx.strokeStyle = 'rgba(16,10,6,0.7)';
  ctx.stroke();
  // crimson gunwale stripe
  ctx.save();
  polygon(ctx, hull);
  ctx.clip();
  polygon(ctx, hull);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = SYN.crimson[1];
  ctx.stroke();
  polygon(ctx, hull);
  shadeOverlay(ctx, cx - 22, cy - 8, cx + 30, cy + 8, 0.16, 0.28);
  ctx.restore();
  polygon(ctx, hull);
  ink(ctx, 1.2);
  // bow armour & ram
  plate(ctx, cx + 15, cy - 4.2, 7, 8.4, 1.2, 'gunmetal', { rivets: 2.6, rivetR: 0.38, ink: 0.7 });
  spike(ctx, cx + 29, cy, 6, 3.4, 0, 'steel');
  // aft cabin / boiler house with ember ports
  plate(ctx, cx - 9, cy - 4.6, 11, 9.2, 1.6, 'syndicate', { rivets: 3, rivetR: 0.4, ink: 0.9 });
  for (const s of [-1, 1]) porthole(ctx, cx - 3.5, cy + s * 2.6, 1.05, { glow: true, color: SYN.ember, kind: 'iron', halo: 2.2 });
  ventGrille(ctx, cx - 8, cy - 1.4, 3, 2.8, { slots: 2, kind: 'gunmetal', glow: SYN.ember });
  // smokestacks
  for (const [sx, sy] of ART.gunboat.stacks) {
    smokestack(ctx, cx + sx, cy + sy, 2.4, 'gunmetal', { band: SYN.crimson[1], ember: true, soot: 6 });
  }
  // turret barbette (turret is a runtime overlay)
  ringMount(ctx, cx + ART.gunboat.turret[0], cy, 6.4, { kind: 'gunmetal', table: 'iron', bolts: 9 });
  // stern lamp & pirate pennant
  lamp(ctx, cx - 21.5, cy, 0.9, SYN.ember, { halo: 3, cage: false });
  flag(ctx, cx - 20.5, cy - 1.6, 9, 4.6, ['#141210', '#1f1a16'], { dir: -1, wave: 0.9, swallow: true, emblem: '#e6d8b4' });
  rivetLine(ctx, cx - 12, cy - 6.1, cx + 12, cy - 5.8, 3, 0.36, 'iron');
  rivetLine(ctx, cx - 12, cy + 6.1, cx + 12, cy + 5.8, 3, 0.36, 'iron');
}

/** Triple-barrel turret, pivot at (9, h/2). */
function drawGunboatTurret(ctx, w, h) {
  const px = 9;
  const cy = h / 2;
  for (const dy of [-2.7, 0, 2.7]) {
    cannon(ctx, px + 2, cy + dy, 14.5, 2.4, 'blackiron', { taper: 0.82, bands: [0.25, 0.6], swell: 1.2, knob: false });
  }
  // armoured mantlet
  const sh = [
    [px + 6.5, cy - 5.6],
    [px + 3, cy - 6.8],
    [px - 4.5, cy - 5.6],
    [px - 6, cy],
    [px - 4.5, cy + 5.6],
    [px + 3, cy + 6.8],
    [px + 6.5, cy + 5.6],
  ];
  solid(ctx, sh, metal(ctx, px - 6, cy - 7, px + 7, cy + 7, 'syndicate'), [px - 6, cy - 7, px + 7, cy + 7], { rim: 0.6, ink: 1 });
  ctx.fillStyle = SYN.crimson[1];
  ctx.fillRect(px + 4.6, cy - 5.4, 1.2, 10.8);
  ctx.beginPath();
  ctx.rect(px + 4.6, cy - 5.4, 1.2, 10.8);
  ink(ctx, 0.4);
  dome(ctx, px - 1.2, cy, 2.4, 'gunmetal', { rivets: 5 });
  rivetLine(ctx, px - 3.8, cy - 4.6, px + 2.4, cy - 5.6, 2.2, 0.36, 'iron');
  rivetLine(ctx, px - 3.8, cy + 4.6, px + 2.4, cy + 5.6, 2.2, 0.36, 'iron');
}

function drawGunboatProp(ctx, w, h) {
  propeller(ctx, w / 2, h / 2, w / 2 - 0.4, 3, 0.5, { kind: 'gunmetal', hub: 'iron', tip: SYN.crimson[1], blur: 0.85 });
}

// =============================================================================================
// Clockwork Wasp — ember eyes, gunmetal thorax with exposed gear & wind-up key, striped
// abdomen, steel stinger. Wings are a separate 3-frame overlay.
// =============================================================================================

function drawClockWasp(ctx, w, h) {
  const cy = h / 2;
  const tx = 17; // thorax centre
  // legs (iron, jointed), drawn first so the body overlaps them
  ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    for (const [bx, kx, ky, fx, fy] of [
      [tx + 2.4, tx + 5, 6.2, tx + 8.4, 8.6],
      [tx, tx - 0.6, 7.6, tx + 0.8, 11.6],
      [tx - 2.4, tx - 5.6, 7, tx - 6.4, 10.8],
    ]) {
      ctx.beginPath();
      ctx.moveTo(bx, cy + s * 2);
      ctx.lineTo(kx, cy + s * ky);
      ctx.lineTo(fx, cy + s * fy);
      ctx.strokeStyle = 'rgba(16,12,10,0.85)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.strokeStyle = METALS.gunmetal[1];
      ctx.lineWidth = 0.75;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(kx, cy + s * ky, 0.6, 0, TAU);
      ctx.fillStyle = METALS.brass[1];
      ctx.fill();
    }
  }
  // stinger
  spike(ctx, 4.6, cy, -4.4, 2.2, 0, 'steel');
  // abdomen — tapered teardrop with crimson/black segments
  const abd = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const x = 4 + t * 11.5;
    const hw = 5.3 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.75);
    abd.push([x, cy - hw]);
  }
  const abdPts = [...abd, ...mirror(abd, cy).reverse()];
  smoothPath(ctx, abdPts);
  ctx.fillStyle = '#17130f';
  ctx.fill();
  withClip(
    ctx,
    () => smoothPath(ctx, abdPts),
    () => {
      for (let i = 0; i < 4; i++) {
        const x = 5.2 + i * 2.7;
        ctx.beginPath();
        ctx.moveTo(x, cy - 6);
        ctx.quadraticCurveTo(x + 1.2, cy, x, cy + 6);
        ctx.lineTo(x + 1.5, cy + 6);
        ctx.quadraticCurveTo(x + 2.7, cy, x + 1.5, cy - 6);
        ctx.closePath();
        ctx.fillStyle = SYN.crimson[1];
        ctx.fill();
      }
      // overlapping plate seams
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 0.35;
      for (let i = 0; i < 5; i++) {
        const x = 6.7 + i * 2.7;
        ctx.beginPath();
        ctx.moveTo(x, cy - 6);
        ctx.quadraticCurveTo(x + 1.2, cy, x, cy + 6);
        ctx.stroke();
      }
    }
  );
  smoothPath(ctx, abdPts);
  ctx.fillStyle = metalRadial(ctx, 9, cy - 2, 9, 'syndicate', { spec: 0.4 });
  ctx.globalAlpha = 0.35;
  ctx.fill();
  ctx.globalAlpha = 1;
  smoothPath(ctx, abdPts);
  shadeOverlay(ctx, 4, cy - 5.5, 16, cy + 5.5, 0.25, 0.35);
  smoothPath(ctx, abdPts);
  ink(ctx, 0.9);
  // waist
  cylinder(ctx, 14.6, cy, 16, cy, 2.2, 2.2, 'iron', { ink: 0.5 });
  // thorax — gunmetal shell with a window onto a brass gear
  ctx.beginPath();
  ctx.ellipse(tx, cy, 4.6, 4.1, 0, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, tx, cy, 4.6, 'syndicate', { spec: 0.45 });
  ctx.fill();
  ink(ctx, 0.9);
  gear(ctx, tx - 0.2, cy, 2.6, 9, { kind: 'brass', toothDepth: 0.6, spokes: 3, hub: true, outline: 0.5 });
  // wind-up key: shaft + bow seen from above
  cylinder(ctx, tx - 3.6, cy, tx - 6.4, cy, 0.9, 0.9, 'brass', { ink: 0.4 });
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(tx - 7, cy + s * 2.2, 1.1, 2.2, 0, 0, TAU);
    ctx.fillStyle = metal(ctx, tx - 8, cy - 4, tx - 6, cy + 4, 'brass', { polish: true });
    ctx.fill();
    ink(ctx, 0.45);
    ctx.beginPath();
    ctx.ellipse(tx - 7, cy + s * 2.2, 0.45, 1.3, 0, 0, TAU);
    ctx.fillStyle = 'rgba(16,10,6,0.85)';
    ctx.fill();
  }
  // head
  const hx = tx + 7;
  ctx.beginPath();
  ctx.ellipse(hx, cy, 3.4, 3.8, 0, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, hx, cy, 3.8, 'gunmetal', { spec: 0.5 });
  ctx.fill();
  ink(ctx, 0.8);
  // mandibles
  for (const s of [-1, 1]) {
    polygon(ctx, [
      [hx + 2.6, cy + s * 0.9],
      [hx + 6.4, cy + s * 2.2],
      [hx + 7.2, cy + s * 0.4],
      [hx + 5.6, cy + s * 1.2],
    ]);
    ctx.fillStyle = cylinderGrad(ctx, 0, cy + s * 0.4, 0, cy + s * 2.4, 'steel');
    ctx.fill();
    ink(ctx, 0.45);
  }
  // antennae
  ctx.strokeStyle = 'rgba(20,14,10,0.85)';
  ctx.lineWidth = 0.5;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(hx + 1.6, cy + s * 2);
    ctx.quadraticCurveTo(hx + 5, cy + s * 6.5, hx + 9.6, cy + s * 6.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(hx + 9.6, cy + s * 6.6, 0.55, 0, TAU);
    ctx.fillStyle = METALS.brass[1];
    ctx.fill();
  }
  // compound eyes (base: dim; the lit eyes are a runtime overlay that flares on the charge)
  for (const s of [-1, 1]) emberGlass(ctx, hx + 1, cy + s * 2.3, 1.9, 1.5, { rot: s * 0.4 });
}

/** Wings: frame 0 spread, 1 mid, 2 swept — flicked through every frame for a buzzing blur. */
function drawWaspWings(ctx, w, h, frame) {
  const cy = h / 2;
  const ax = 17.5; // wing root on the thorax
  const spreads = [1.05, 0.72, 0.42];
  const sp = spreads[frame] ?? 0.72;
  const wingPair = (len, wid, base, a) => {
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(ax, cy + s * 1.2);
      ctx.rotate(Math.PI + s * -a); // point rearward, spread outward
      ctx.scale(1, s);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(len * 0.3, -wid * 1.2, len * 0.9, -wid * 0.9, len, -wid * 0.1);
      ctx.bezierCurveTo(len * 0.92, wid * 0.4, len * 0.4, wid * 0.55, 0, 0);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, `rgba(255,190,140,${0.5 * base})`);
      g.addColorStop(1, `rgba(220,226,235,${0.28 * base})`);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = `rgba(40,26,18,${0.75 * base})`;
      ctx.lineWidth = 0.45;
      ctx.stroke();
      // brass veins
      ctx.strokeStyle = `rgba(201,151,63,${0.75 * base})`;
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      ctx.moveTo(0.5, -0.2);
      ctx.quadraticCurveTo(len * 0.5, -wid * 0.75, len * 0.96, -wid * 0.12);
      ctx.moveTo(len * 0.3, -wid * 0.5);
      ctx.lineTo(len * 0.55, wid * 0.25);
      ctx.moveTo(len * 0.6, -wid * 0.65);
      ctx.lineTo(len * 0.78, wid * 0.2);
      ctx.stroke();
      ctx.restore();
    }
  };
  // hind wings under, forewings over
  wingPair(10.5, 3.2, 0.8, sp + 0.3);
  wingPair(14, 4, 1, sp);
}

/** Lit compound eyes overlay (additive). */
function drawWaspEyes(ctx, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  for (const s of [-1, 1]) {
    glow(ctx, cx, cy + s * 2.3, 4.5, '#ff6a2a', 0.8);
    glow(ctx, cx, cy + s * 2.3, 1.8, '#ffe6b8', 1);
  }
}

// =============================================================================================
// Flak Battery — floating rock with an iron fortification and a twin-barrel flak gun.
// =============================================================================================

/** Irregular rock outline (deterministic). */
function rockOutline(cx, cy, r, n, seed, rough = 0.16) {
  const rnd = seeded(seed);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (rnd() - 0.5) * 0.25;
    const rr = r * (1 - rough + rnd() * rough * 2) * (i % 3 === 0 ? 0.93 : 1);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.94]);
  }
  return pts;
}

const ROCK = {
  top: ['#a39079', '#7c6a56', '#57493b', '#2f271f'],
  cliff: '#3b3128',
  moss: '#6f7240',
};

function drawRock(ctx, pts, box, seed, opts = {}) {
  // cliff skirt: the rock's flank visible below its top surface (offset down-right)
  const skirt = pts.map(([x, y]) => [x + 1.6, y + 2.6]);
  polygon(ctx, skirt);
  ctx.fillStyle = ROCK.cliff;
  ctx.fill();
  ink(ctx, 1.2);
  polygon(ctx, pts);
  ctx.fillStyle = metal(ctx, box[0], box[1], box[2], box[3], 'bronze');
  ctx.fill();
  withClip(
    ctx,
    () => polygon(ctx, pts),
    () => {
      const g = ctx.createLinearGradient(box[0], box[1], box[2], box[3]);
      g.addColorStop(0, ROCK.top[0]);
      g.addColorStop(0.45, ROCK.top[1]);
      g.addColorStop(1, ROCK.top[2]);
      ctx.fillStyle = g;
      ctx.fillRect(box[0] - 4, box[1] - 4, box[2] - box[0] + 8, box[3] - box[1] + 8);
      const rnd = seeded(seed);
      // strata / cracks
      ctx.strokeStyle = 'rgba(30,22,16,0.45)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < (opts.cracks ?? 10); i++) {
        let x = box[0] + rnd() * (box[2] - box[0]);
        let y = box[1] + rnd() * (box[3] - box[1]);
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
          x += (rnd() - 0.3) * 7;
          y += (rnd() - 0.5) * 5;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // lit facets
      for (let i = 0; i < (opts.facets ?? 8); i++) {
        const x = box[0] + rnd() * (box[2] - box[0]);
        const y = box[1] + rnd() * (box[3] - box[1]);
        const s = 2 + rnd() * 5;
        polygon(ctx, [
          [x, y],
          [x + s, y - s * 0.4],
          [x + s * 0.7, y + s * 0.6],
        ]);
        ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,240,215,0.14)' : 'rgba(20,14,10,0.16)';
        ctx.fill();
      }
      // moss & dry grass tufts
      for (let i = 0; i < (opts.moss ?? 10); i++) {
        const x = box[0] + rnd() * (box[2] - box[0]);
        const y = box[1] + rnd() * (box[3] - box[1]);
        ctx.beginPath();
        ctx.ellipse(x, y, 1.5 + rnd() * 2.6, 1 + rnd() * 1.6, rnd() * 3, 0, TAU);
        ctx.fillStyle = alpha(mix(ROCK.moss, '#8b8a4c', rnd()), 0.7);
        ctx.fill();
      }
      grime(ctx, box[0], box[1], box[2] - box[0], box[3] - box[1], 0.25, seed + 3, { color: '#2a2018', blotches: true });
    }
  );
  polygon(ctx, pts);
  shadeOverlay(ctx, box[0], box[1], box[2], box[3], 0.18, 0.34);
  polygon(ctx, pts);
  rimLight(ctx, box[0], box[1], box[2], box[3], 1, 0.3, '#fff2d8');
  polygon(ctx, pts);
  ink(ctx, 1.2);
}

function drawFlakIsland(ctx, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  // anchor chains dangling from the rim (drawn first, they hang beneath)
  chain(ctx, cx - 30, cy + 26, cx - 40, cy + 44, 2.2, 'iron');
  chain(ctx, cx + 33, cy + 22, cx + 46, cy + 36, 2.2, 'iron');
  const pts = rockOutline(cx, cy, 44, 22, 77, 0.12);
  drawRock(ctx, pts, [cx - 46, cy - 44, cx + 46, cy + 44], 23, { cracks: 14, facets: 14, moss: 16 });
  // a smaller outcrop fused onto the main rock
  const out = rockOutline(cx - 30, cy - 26, 13, 11, 12, 0.18);
  drawRock(ctx, out, [cx - 44, cy - 40, cx - 16, cy - 12], 31, { cracks: 3, facets: 3, moss: 3 });

  // iron emplacement — octagonal plated platform
  const oct = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + TAU / 16;
    oct.push([cx + 4 + Math.cos(a) * 22, cy + Math.sin(a) * 22]);
  }
  polygon(ctx, oct);
  ctx.fillStyle = metal(ctx, cx - 18, cy - 22, cx + 26, cy + 22, 'syndicate');
  ctx.fill();
  withClip(
    ctx,
    () => polygon(ctx, oct),
    () => {
      panelLines(ctx, cx - 20, cy - 24, 48, 48, 7, 7, { a: 0.22 });
      grime(ctx, cx - 20, cy - 24, 48, 48, 0.35, 61, { color: SYN.soot, blotches: true });
      // hazard band around the rim
      ctx.save();
      polygon(ctx, oct);
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = SYN.crimson[1];
      ctx.stroke();
      ctx.restore();
    }
  );
  polygon(ctx, oct);
  shadeOverlay(ctx, cx - 18, cy - 22, cx + 26, cy + 22, 0.2, 0.3);
  polygon(ctx, oct);
  ink(ctx, 1.2);
  for (const [x, y] of oct) rivet(ctx, cx + 4 + (x - cx - 4) * 0.9, cy + (y - cy) * 0.9, 0.7, 'iron');
  railing(ctx, [...oct.map(([x, y]) => [cx + 4 + (x - cx - 4) * 1.04, cy + (y - cy) * 1.04])], {
    post: 6,
    kind: 'gunmetal',
    closed: true,
  });

  // sandbag berm on the exposed flank
  const rnd = seeded(5);
  for (let i = 0; i < 9; i++) {
    const a = 1.9 + i * 0.16;
    const x = cx + 4 + Math.cos(a) * 28;
    const y = cy + Math.sin(a) * 28;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI / 2 + (rnd() - 0.5) * 0.3);
    roundRect(ctx, -3, -1.8, 6, 3.6, 1.6);
    ctx.fillStyle = metal(ctx, -3, -2, 3, 2, 'bronze');
    ctx.fill();
    ctx.fillStyle = 'rgba(150,130,80,0.45)';
    ctx.fill();
    ink(ctx, 0.6);
    ctx.restore();
  }
  // ammo crates
  for (const [x, y, r] of [
    [cx - 26, cy + 14, 0.2],
    [cx - 31, cy + 8, -0.3],
    [cx - 22, cy + 21, 0.5],
  ]) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(r);
    roundRect(ctx, -3.4, -2.6, 6.8, 5.2, 0.6);
    ctx.fillStyle = metal(ctx, -3, -3, 3, 3, 'wood');
    ctx.fill();
    ink(ctx, 0.7);
    ctx.strokeStyle = 'rgba(30,18,8,0.6)';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(-3.4, -2.6);
    ctx.lineTo(3.4, 2.6);
    ctx.moveTo(3.4, -2.6);
    ctx.lineTo(-3.4, 2.6);
    ctx.stroke();
    ctx.fillStyle = SYN.crimson[1];
    ctx.fillRect(-1, -2.6, 2, 5.2);
    ctx.restore();
  }
  // boiler & sooty stack
  const [sx, sy] = ART.flakIsland.stack;
  plate(ctx, cx + sx - 6, cy + sy - 4, 9, 9, 2, 'gunmetal', { rivets: 3, rivetR: 0.4, ink: 0.8 });
  smokestack(ctx, cx + sx, cy + sy, 3.4, 'gunmetal', { band: SYN.crimson[1], ember: true, soot: 9 });
  // searchlight & syndicate banner
  lamp(ctx, cx + 24, cy + 17, 1.6, '#ffd2a0', { halo: 3, cage: true });
  flag(ctx, cx + 22, cy - 22, 12, 6, [SYN.crimson[1], '#17130f', SYN.crimson[1]], { dir: -1, wave: 1, emblem: '#ff7a2f' });
  // gun pit — barbette for the turret overlay
  ringMount(ctx, cx + ART.flakIsland.turret[0], cy + ART.flakIsland.turret[1], 13.5, {
    kind: 'gunmetal',
    table: 'iron',
    bolts: 14,
  });
  hazardStripes(ctx, cx + 4 - 2, cy + 15.6, 12, 3, { stripe: 2, a: '#e0a92c', b: '#17130f' });
}

/** Twin-barrel flak gun, pivot at (16, h/2). */
function drawFlakTurret(ctx, w, h) {
  const px = 16;
  const cy = h / 2;
  // barrels with muzzle brakes
  for (const s of [-1, 1]) {
    const y = cy + s * 3.4;
    cylinder(ctx, px + 4, y, px + 29, y, 2.6, 2.1, 'blackiron', { ink: 0.8 });
    // recoil sleeve
    cylinder(ctx, px + 4, y, px + 13, y, 3.4, 3.2, 'gunmetal', { ink: 0.8 });
    // muzzle brake
    roundRect(ctx, px + 28, y - 1.9, 4.6, 3.8, 0.6);
    ctx.fillStyle = cylinderGrad(ctx, 0, y - 1.9, 0, y + 1.9, 'iron');
    ctx.fill();
    ink(ctx, 0.6);
    ctx.fillStyle = 'rgba(10,6,4,0.9)';
    ctx.fillRect(px + 29.3, y - 1.9, 0.7, 3.8);
    ctx.fillRect(px + 31, y - 1.9, 0.7, 3.8);
  }
  // gun shield — angular, crimson edged
  const sh = [
    [px + 7, cy - 10],
    [px + 2, cy - 12],
    [px - 10, cy - 10],
    [px - 13, cy],
    [px - 10, cy + 10],
    [px + 2, cy + 12],
    [px + 7, cy + 10],
    [px + 9, cy],
  ];
  polygon(ctx, sh);
  ctx.fillStyle = metal(ctx, px - 13, cy - 12, px + 9, cy + 12, 'syndicate');
  ctx.fill();
  withClip(
    ctx,
    () => polygon(ctx, sh),
    () => {
      grime(ctx, px - 14, cy - 12, 24, 24, 0.4, 88, { color: SYN.soot, streaks: 0.6 });
      ctx.save();
      polygon(ctx, sh);
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = SYN.crimson[1];
      ctx.stroke();
      ctx.restore();
    }
  );
  polygon(ctx, sh);
  shadeOverlay(ctx, px - 13, cy - 12, px + 9, cy + 12, 0.24, 0.34);
  polygon(ctx, sh);
  rimLight(ctx, px - 13, cy - 12, px + 9, cy + 12, 0.8, 0.4);
  polygon(ctx, sh);
  ink(ctx, 1.1);
  // breech block, sight, gunner hatch
  plate(ctx, px - 7, cy - 5, 9, 10, 1.4, 'gunmetal', { rivets: 3, rivetR: 0.4, ink: 0.8 });
  dome(ctx, px - 8.5, cy - 6.2, 2, 'iron', { rivets: 5 });
  emberGlass(ctx, px + 4.6, cy - 7.2, 1.3, 1, { halo: 2 });
  ventGrille(ctx, px - 11, cy + 2.5, 3.2, 5, { slots: 3, kind: 'gunmetal', vertical: true, glow: SYN.ember });
  rivetLine(ctx, px - 9.4, cy - 9, px + 1.6, cy - 10.6, 2.6, 0.42, 'iron');
  rivetLine(ctx, px - 9.4, cy + 9, px + 1.6, cy + 10.6, 2.6, 0.42, 'iron');
}

/** Rock debris chunks (4 variants) for the crumble. */
function drawChunk(ctx, w, h, frame) {
  const pts = rockOutline(w / 2, h / 2, w / 2 - 2.2, 7 + frame, 200 + frame * 13, 0.28);
  drawRock(ctx, pts, [1, 1, w - 1, h - 1], 300 + frame, { cracks: 2, facets: 3, moss: frame % 2 });
}

// =============================================================================================
// Registration
// =============================================================================================

const G = ART;
reg('enemy_gyroScout', { w: G.gyroScout.w, h: G.gyroScout.h, draw: drawGyroScout });
reg('enemy_gyroScout_rotor', { w: 36, h: 36, draw: drawGyroRotor });

reg('enemy_kiteBomber', { w: G.kiteBomber.w, h: G.kiteBomber.h, draw: drawKiteBomber });
reg('enemy_kiteBomber_prop', { w: 13, h: 13, draw: drawKiteProp });
reg('enemy_kiteBomber_bomb', { w: 10, h: 8, cx: 5.4, cy: 4, draw: drawBomb });

reg('enemy_balloonMine', { w: G.balloonMine.w, h: G.balloonMine.h, draw: drawBalloonMine });
reg('enemy_balloonMine_lamp', { w: 14, h: 14, draw: drawMineLamp });
reg('enemy_balloonMine_glow', { w: 64, h: 64, scale: 1, draw: drawRedGlow });

reg('enemy_gunboat', { w: G.gunboat.w, h: G.gunboat.h, draw: drawGunboat });
reg('enemy_gunboat_turret', { w: 28, h: 16, cx: 9, cy: 8, draw: drawGunboatTurret });
reg('enemy_gunboat_prop', { w: 12, h: 12, draw: drawGunboatProp });
reg('enemy_gunboat_glow', { w: 48, h: 48, scale: 1, draw: drawEmberGlow });

reg('enemy_clockWasp', { w: G.clockWasp.w, h: G.clockWasp.h, draw: drawClockWasp });
reg('enemy_clockWasp_wings', { w: G.clockWasp.w, h: G.clockWasp.h, frames: 3, draw: drawWaspWings });
reg('enemy_clockWasp_eyes', { w: 12, h: 14, draw: drawWaspEyes });

reg('enemy_flakIsland', { w: G.flakIsland.w, h: G.flakIsland.h, scale: 2.5, draw: drawFlakIsland });
reg('enemy_flakIsland_turret', { w: 50, h: 28, cx: 16, cy: 14, draw: drawFlakTurret });
reg('enemy_flakIsland_chunk', { w: 22, h: 22, frames: 4, scale: 2, draw: drawChunk });

