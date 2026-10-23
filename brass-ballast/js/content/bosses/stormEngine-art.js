// Storm Engine sprites (WP15). A floating tesla tower seen from above: octagonal iron platform,
// rotating brass gear-ring, four truss arms ending in copper coils, a coil-wound dome with a
// glass aether core, and orbiting conductor spheres. Runtime glows are separate additive
// sprites so the pulsing never re-renders the big bitmaps.

import { Sprites } from '../../gfx/sprites.js';
import {
  TAU,
  PAL,
  mix,
  alpha,
  seeded,
  metal,
  metalRadial,
  cylinderGrad,
  polygon,
  ink,
  rimLight,
  shadeOverlay,
  glow,
  rivet,
  rivetRing,
  rivetLine,
  bolt,
  gear,
  plate,
  pipe,
  cylinder,
  ventGrille,
  coil,
  gauge,
  lamp,
  dome,
  grime,
  spike,
  panelLines,
  hazardStripes,
} from '../../gfx/drawkit.js';

export const SE = {
  base: 'boss_stormEngine',
  ring: 'boss_stormEngine_ring',
  arm: 'boss_stormEngine_arm',
  dome: 'boss_stormEngine_dome',
  sphere: 'boss_stormEngine_sphere',
  glow: 'boss_stormEngine_glow',
  glowHot: 'boss_stormEngine_glowHot',
  flare: 'boss_stormEngine_flare',
};

/** Arm sprite pivot is at x = 0; the electrode tip sits this far out (world units). */
export const ARM_TIP = 204;

const oct = (c, r, rot = Math.PI / 8) => {
  const pts = [];
  for (let i = 0; i < 8; i++) pts.push([c + Math.cos(rot + (i * TAU) / 8) * r, c + Math.sin(rot + (i * TAU) / 8) * r]);
  return pts;
};

function addPoly(ctx, pts, reverse = false) {
  const P = reverse ? [...pts].reverse() : pts;
  ctx.moveTo(P[0][0], P[0][1]);
  for (let i = 1; i < P.length; i++) ctx.lineTo(P[i][0], P[i][1]);
  ctx.closePath();
}

// ---- Base platform -----------------------------------------------------------------------------

function drawBase(ctx, w, h, frame) {
  const c = w / 2;
  const R = 128;
  const rnd = seeded(41);
  // Buttress pylons at the eight vertices (under the deck edge), each with a crimson lamp.
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * TAU) / 8;
    ctx.save();
    ctx.translate(c + Math.cos(a) * (R - 4), c + Math.sin(a) * (R - 4));
    ctx.rotate(a);
    plate(ctx, -10, -13, 24, 26, 5, 'syndicate', { rivets: 6, rivetKind: 'iron', bevel: 0.8 });
    hazardStripes(ctx, 6, -9, 6, 18, { a: '#1a1410', b: PAL.syndicate[2], stripe: 2.2 });
    ctx.restore();
    lamp(ctx, c + Math.cos(a) * (R + 9), c + Math.sin(a) * (R + 9), 2.6, '#ff4d2e', { halo: 3.2 });
  }
  // Main octagonal deck.
  polygon(ctx, oct(c, R));
  ctx.fillStyle = metal(ctx, c - R, c - R, c + R, c + R, 'gunmetal');
  ctx.fill();
  rimLight(ctx, c - R, c - R, c + R, c + R, 2, 0.5);
  ink(ctx, 1.6);
  // Crimson/black hazard band around the rim.
  ctx.save();
  ctx.beginPath();
  addPoly(ctx, oct(c, R - 6));
  addPoly(ctx, oct(c, R - 15), true);
  ctx.clip();
  hazardStripes(ctx, c - R, c - R, R * 2, R * 2, { a: '#18120d', b: '#a02a20', stripe: 5, usePath: false, ink: 0 });
  ctx.restore();
  for (const r of [R - 6, R - 15]) {
    polygon(ctx, oct(c, r));
    ink(ctx, 0.9);
  }
  // Deck plating inside the band.
  ctx.save();
  polygon(ctx, oct(c, R - 15));
  ctx.clip();
  panelLines(ctx, c - R, c - R, R * 2, R * 2, 22, 16, { a: 0.4 });
  grime(ctx, c - R, c - R, R * 2, R * 2, 0.45, 7, { color: '#120d0a' });
  ctx.restore();
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * TAU) / 8;
    const a2 = Math.PI / 8 + ((i + 1) * TAU) / 8;
    rivetLine(ctx, c + Math.cos(a) * (R - 3), c + Math.sin(a) * (R - 3), c + Math.cos(a2) * (R - 3), c + Math.sin(a2) * (R - 3), 9, 0.9, 'iron', { skipEnds: true });
  }
  // Radial copper conduits on the diagonals, feeding the outer vents.
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * TAU) / 4;
    const p = (r) => [c + Math.cos(a) * r, c + Math.sin(a) * r];
    pipe(ctx, [p(80), p(104)], 6, 'copper');
    ventGrille(ctx, ...p(104).map((v) => v - 6), 12, 12, { slots: 3, kind: 'iron', glow: '#ff7a2f' });
  }
  // Cardinal machinery: transformer boxes, gauges, domed capacitors.
  for (let i = 0; i < 4; i++) {
    const a = (i * TAU) / 4;
    ctx.save();
    ctx.translate(c + Math.cos(a) * 100, c + Math.sin(a) * 100);
    ctx.rotate(a + Math.PI / 2);
    plate(ctx, -16, -8, 32, 16, 3, 'syndicate', { rivets: 5, rivetKind: 'brass' });
    for (let k = -1; k <= 1; k++) dome(ctx, k * 9, 0, 3.4, 'copper', { rivets: 5 });
    ctx.restore();
  }
  gauge(ctx, c + 70, c - 82, 6, { value: 0.92 });
  gauge(ctx, c - 82, c + 70, 6, { value: 0.35 });
  // Central socket the gear-ring sits in.
  ctx.beginPath();
  ctx.arc(c, c, 84, 0, TAU);
  const g = ctx.createRadialGradient(c, c, 40, c, c, 84);
  g.addColorStop(0, '#0c0d10');
  g.addColorStop(0.8, '#1d2026');
  g.addColorStop(1, '#3a3f47');
  ctx.fillStyle = g;
  ctx.fill();
  ink(ctx, 1.4);
  rivetRing(ctx, c, c, 80, 36, 1, 'brass');
  // inner glow from the core shaft
  glow(ctx, c, c, 70, '#33c9c0', 0.35);

  if (frame === 1) {
    // Battle damage: scorch blooms, torn plating with ember glow, cracks.
    for (let i = 0; i < 7; i++) {
      const a = rnd() * TAU;
      const r = 88 + rnd() * 32;
      const x = c + Math.cos(a) * r;
      const y = c + Math.sin(a) * r;
      glow(ctx, x, y, 16 + rnd() * 14, 'rgba(10,6,4,0.9)', 0.9);
    }
    for (let i = 0; i < 4; i++) {
      const a = 0.4 + i * 1.6 + rnd() * 0.4;
      const x = c + Math.cos(a) * 112;
      const y = c + Math.sin(a) * 112;
      polygon(ctx, [
        [x - 7, y - 4],
        [x + 2, y - 8],
        [x + 8, y + 1],
        [x + 1, y + 7],
        [x - 6, y + 4],
      ]);
      ctx.fillStyle = '#1a0d08';
      ctx.fill();
      ink(ctx, 0.8);
      glow(ctx, x, y, 6, '#ff7a2f', 0.9);
    }
    ctx.strokeStyle = 'rgba(12,8,6,0.85)';
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 6; i++) {
      let a = rnd() * TAU;
      let r = 90;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      for (let k = 0; k < 4; k++) {
        a += (rnd() - 0.5) * 0.25;
        r += 8 + rnd() * 6;
        ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      }
      ctx.stroke();
    }
  }
}

// ---- Rotating gear ring --------------------------------------------------------------------

function drawRing(ctx, w) {
  const c = w / 2;
  gear(ctx, c, c, 86, 40, { kind: 'brass', toothDepth: 6, hole: 58, polish: true, outline: 1.2 });
  rivetRing(ctx, c, c, 66, 24, 1.1, 'brass');
  // Four index plates so the rotation reads.
  for (let i = 0; i < 4; i++) {
    const a = (i * TAU) / 4 + Math.PI / 4;
    ctx.save();
    ctx.translate(c + Math.cos(a) * 71, c + Math.sin(a) * 71);
    ctx.rotate(a);
    plate(ctx, -5, -9, 10, 18, 2, 'oxblood', { rivets: 0, bevel: 0.6 });
    rivet(ctx, 0, -5, 1.2, 'brass');
    rivet(ctx, 0, 5, 1.2, 'brass');
    ctx.restore();
  }
}

// ---- Arm (pivot at x=0, along +x) -----------------------------------------------------------

function drawArm(ctx, w, h) {
  const cy = h / 2;
  // Truss rails.
  for (const s of [-1, 1]) cylinder(ctx, 46, cy + s * 9, 150, cy + s * 7, 5, 4, 'gunmetal', { capEnd: true });
  // Cross bracing.
  ctx.save();
  for (let x = 52; x < 146; x += 16) {
    cylinder(ctx, x, cy - 8.5, x + 8, cy + 8, 2, 2, 'iron');
    cylinder(ctx, x + 8, cy + 8, x + 16, cy - 8, 2, 2, 'iron');
  }
  ctx.restore();
  for (const s of [-1, 1]) rivetLine(ctx, 50, cy + s * 9, 146, cy + s * 7, 8, 0.8, 'brass');
  // Copper bus-bar down the middle.
  cylinder(ctx, 40, cy, 152, cy, 3.4, 3.4, 'copper');
  // Root clamp under the dome.
  plate(ctx, 30, cy - 14, 26, 28, 5, 'syndicate', { rivets: 6, rivetKind: 'brass' });
  hazardStripes(ctx, 50, cy - 12, 5, 24, { a: '#18120d', b: '#a02a20', stripe: 2 });
  // Ceramic insulator stack.
  for (let i = 0; i < 4; i++) {
    const x = 140 + i * 3.4;
    ctx.beginPath();
    ctx.ellipse(x, cy, 2.2, 10 - i * 0.4, 0, 0, TAU);
    ctx.fillStyle = cylinderGrad(ctx, x, cy - 10, x, cy + 10, 'bone');
    ctx.fill();
    ink(ctx, 0.6);
  }
  // The coil.
  coil(ctx, 154, cy, 192, cy, 30, 8, { kind: 'copper', core: 'iron', glow: '#7ff3ff' });
  for (const s of [-1, 1]) cylinder(ctx, 152, cy + s * 15.5, 194, cy + s * 15.5, 2.2, 2.2, 'brass');
  // Electrode ball with lightning rods.
  for (const a of [-0.9, -0.3, 0.3, 0.9]) spike(ctx, ARM_TIP, cy, 13, 2.4, a, 'brass');
  ctx.beginPath();
  ctx.arc(ARM_TIP - 2, cy, 9.5, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, ARM_TIP - 2, cy, 9.5, 'brass', { spec: 0.8 });
  ctx.fill();
  ink(ctx, 1);
  rivetRing(ctx, ARM_TIP - 2, cy, 6.8, 8, 0.6, 'copper');
}

// ---- Dome (rotates with the arms; housings line up with them) -------------------------------

function drawDome(ctx, w, h, frame) {
  const c = w / 2;
  // Arm-root housings.
  for (let i = 0; i < 4; i++) {
    const a = (i * TAU) / 4;
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(a);
    plate(ctx, 26, -15, 40, 30, 7, 'syndicate', { rivets: 6, rivetKind: 'brass', polish: true });
    ctx.fillStyle = PAL.syndicate[2];
    ctx.fillRect(56, -15, 4, 30);
    bolt(ctx, 34, -8, 2.2, 'iron');
    bolt(ctx, 34, 8, 2.2, 'iron');
    ctx.restore();
  }
  // Brass flange.
  ctx.beginPath();
  ctx.arc(c, c, 54, 0, TAU);
  ctx.fillStyle = metal(ctx, c - 54, c - 54, c + 54, c + 54, 'brass', { polish: true });
  ctx.fill();
  rimLight(ctx, c - 54, c - 54, c + 54, c + 54, 1.5, 0.6);
  ink(ctx, 1.4);
  rivetRing(ctx, c, c, 50, 28, 1, 'brass', 0.1);
  // Coil-wound torus: radial copper windings.
  ctx.beginPath();
  ctx.arc(c, c, 46, 0, TAU);
  ctx.fillStyle = '#2a160c';
  ctx.fill();
  const N = 44;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    ctx.save();
    ctx.translate(c + Math.cos(a) * 39.5, c + Math.sin(a) * 39.5);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(0, 0, 7.5, 2.6, 0, 0, TAU);
    const lit = 0.5 + 0.5 * Math.cos(a + Math.PI * 0.75);
    ctx.fillStyle = mix('#6e3a1f', '#f0ad78', lit * 0.85);
    ctx.fill();
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = 'rgba(26,14,6,0.7)';
    ctx.stroke();
    ctx.restore();
  }
  // Glass core dome.
  ctx.beginPath();
  ctx.arc(c, c, 31, 0, TAU);
  ctx.fillStyle = '#16323b';
  ctx.fill();
  ink(ctx, 1.4);
  glow(ctx, c, c, 30, '#7ff3ff', 0.85, { core: 0.15 });
  // Frame ribs over the glass.
  ctx.strokeStyle = metal(ctx, c - 30, c - 30, c + 30, c + 30, 'brass');
  ctx.lineWidth = 2.6;
  for (let i = 0; i < 6; i++) {
    const a = (i * TAU) / 6 + 0.26;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * 11, c + Math.sin(a) * 11);
    ctx.lineTo(c + Math.cos(a) * 30, c + Math.sin(a) * 30);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(c, c, 30, 0, TAU);
  ctx.lineWidth = 3;
  ctx.stroke();
  ink(ctx, 0.8);
  // glass glint
  ctx.beginPath();
  ctx.ellipse(c - 12, c - 13, 9, 4, -0.7, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fill();
  // Lightning-rod crown.
  for (let i = 0; i < 6; i++) spike(ctx, c, c, 15, 3, (i * TAU) / 6, 'brass');
  ctx.beginPath();
  ctx.arc(c, c, 6.5, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, c, c, 6.5, 'brass', { spec: 0.9 });
  ctx.fill();
  ink(ctx, 0.9);
  if (frame === 1) {
    // cracked glass + soot on the flange
    ctx.strokeStyle = 'rgba(230,255,255,0.75)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(c + 6, c - 4);
    ctx.lineTo(c + 16, c - 12);
    ctx.lineTo(c + 22, c - 10);
    ctx.moveTo(c + 16, c - 12);
    ctx.lineTo(c + 19, c - 22);
    ctx.moveTo(c - 8, c + 6);
    ctx.lineTo(c - 18, c + 16);
    ctx.stroke();
    glow(ctx, c + 36, c + 30, 18, 'rgba(8,5,3,0.9)', 0.8);
    glow(ctx, c - 40, c - 20, 14, 'rgba(8,5,3,0.9)', 0.8);
  }
}

// ---- Conductor sphere -----------------------------------------------------------------------

function drawSphere(ctx, w) {
  const c = w / 2;
  glow(ctx, c, c, 36, '#7ff3ff', 0.35);
  // Equatorial brass ring with standoff insulators.
  ctx.beginPath();
  ctx.arc(c, c, 27, 0, TAU);
  ctx.lineWidth = 4;
  ctx.strokeStyle = metal(ctx, c - 27, c - 27, c + 27, c + 27, 'brass', { polish: true });
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(c, c, 29, 0, TAU);
  ink(ctx, 0.8);
  ctx.beginPath();
  ctx.arc(c, c, 25, 0, TAU);
  ink(ctx, 0.8);
  for (let i = 0; i < 6; i++) {
    const a = (i * TAU) / 6;
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * 27, c + Math.sin(a) * 27, 2.2, 0, TAU);
    ctx.fillStyle = metalRadial(ctx, c + Math.cos(a) * 27, c + Math.sin(a) * 27, 2.2, 'bone');
    ctx.fill();
    ink(ctx, 0.5);
  }
  // Copper sphere.
  ctx.beginPath();
  ctx.arc(c, c, 21, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, c, c, 21, 'copper', { spec: 0.75 });
  ctx.fill();
  ink(ctx, 1.2);
  // Meridian bands + aether windows.
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, 21, 0, TAU);
  ctx.clip();
  for (const rot of [0, Math.PI / 2]) {
    ctx.beginPath();
    ctx.ellipse(c, c, 21, 8, rot, 0, TAU);
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = alpha('#c9973f', 0.95);
    ctx.stroke();
  }
  ctx.restore();
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * TAU) / 4;
    const x = c + Math.cos(a) * 12;
    const y = c + Math.sin(a) * 12;
    glow(ctx, x, y, 7, '#7ff3ff', 0.9);
    ctx.beginPath();
    ctx.arc(x, y, 3.4, 0, TAU);
    ctx.fillStyle = '#d8ffff';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#7a5420';
    ctx.stroke();
  }
  shadeOverlay(ctx, c - 21, c - 21, c + 21, c + 21, 0.1, 0.3);
  // Top electrode knob.
  ctx.beginPath();
  ctx.arc(c, c, 6.4, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, c, c, 6.4, 'brass', { spec: 0.9 });
  ctx.fill();
  ink(ctx, 0.8);
  for (let i = 0; i < 4; i++) spike(ctx, c, c, 9.5, 1.8, (i * TAU) / 4 + Math.PI / 4, 'brass');
}

// ---- Register --------------------------------------------------------------------------------

Sprites.register(SE.base, { w: 300, h: 300, frames: 2, draw: drawBase });
Sprites.register(SE.ring, { w: 180, h: 180, draw: drawRing });
Sprites.register(SE.arm, { w: 222, h: 50, cx: 0, cy: 25, draw: drawArm });
Sprites.register(SE.dome, { w: 136, h: 136, frames: 2, draw: drawDome });
Sprites.register(SE.sphere, { w: 72, h: 72, draw: drawSphere });
Sprites.register(SE.glow, {
  w: 128,
  h: 128,
  scale: 1,
  draw: (ctx) => glow(ctx, 64, 64, 64, '#7ff3ff', 1, { core: 0.08 }),
});
Sprites.register(SE.glowHot, {
  w: 128,
  h: 128,
  scale: 1,
  draw: (ctx) => glow(ctx, 64, 64, 64, '#ff5ad0', 1, { core: 0.08 }),
});
Sprites.register(SE.flare, {
  w: 96,
  h: 96,
  scale: 1,
  draw(ctx) {
    glow(ctx, 48, 48, 48, '#bff8ff', 0.8);
    ctx.globalCompositeOperation = 'lighter';
    for (const [rot, len] of [[0, 46], [Math.PI / 2, 46], [Math.PI / 4, 26], [-Math.PI / 4, 26]]) {
      ctx.save();
      ctx.translate(48, 48);
      ctx.rotate(rot);
      const g = ctx.createLinearGradient(-len, 0, len, 0);
      g.addColorStop(0, 'rgba(160,250,255,0)');
      g.addColorStop(0.5, 'rgba(240,255,255,0.95)');
      g.addColorStop(1, 'rgba(160,250,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-len, -1.6, len * 2, 3.2);
      ctx.restore();
    }
  },
});
