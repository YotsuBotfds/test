// Clockwork Kraken — procedural art (WP14). Registers every 'boss_kraken*' sprite and exports the
// body geometry used by kraken.js / kraken-tentacles.js.
//
// The body is radially symmetric (seen from above): a riveted gunmetal dome ringed by
// verdigris-copper mantle plates, ember portholes, and a great iris socket in the middle. Six
// tentacle sockets sit under the mantle at 30° + k·60°. Sprites face +x like everything else.

import { Sprites } from '../../gfx/sprites.js';
import {
  TAU, metal, metalRadial, cylinderGrad, polygon, ink, shadeOverlay, rimLight, glow, rivet,
  rivetRing, gear, porthole, pipe, smokestack, grime, ringMount, seeded, dome,
  ambientOcclusion, spike, bolt, lamp,
} from '../../gfx/drawkit.js';

export const BODY_SIZE = 240;
export const BODY_R = 92; // hit radius
export const ROOT_R = 80; // tentacle sockets (under the mantle)
export const ROOT_ANGLES = [0, 1, 2, 3, 4, 5].map((k) => (Math.PI / 6) + (k * Math.PI) / 3);
export const SEG_SPR_R = 20; // segment sprites are drawn for r = 20 and scaled per segment
export const VENTS = [
  { a: 0.0, r: 56 },
  { a: (TAU * 1) / 3, r: 56 },
  { a: (TAU * 2) / 3, r: 56 },
];
export const PORTHOLES = 10;

const PATINA = '#3f8f80';

// ---- Body ----------------------------------------------------------------------------------------

function mantlePlate(ctx, c, a, r0, r1, half, seed) {
  // one overlapping scale of the mantle skirt (copper with verdigris)
  const pts = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const t = -half + (2 * half * i) / n;
    const bulge = Math.cos((t / half) * (Math.PI / 2));
    const rr = r1 + bulge * 7;
    pts.push([c + Math.cos(a + t) * rr, c + Math.sin(a + t) * rr]);
  }
  pts.push([c + Math.cos(a + half * 0.8) * r0, c + Math.sin(a + half * 0.8) * r0]);
  pts.push([c + Math.cos(a - half * 0.8) * r0, c + Math.sin(a - half * 0.8) * r0]);
  polygon(ctx, pts);
  const x0 = c + Math.cos(a) * r0;
  const y0 = c + Math.sin(a) * r0;
  ctx.fillStyle = metal(ctx, x0 - 30, y0 - 30, x0 + 30, y0 + 30, 'copper');
  ctx.fill();
  ctx.save();
  ctx.clip();
  // verdigris bloom on the outer edge
  const g = ctx.createRadialGradient(c, c, r0, c, c, r1 + 8);
  g.addColorStop(0, 'rgba(63,143,128,0)');
  g.addColorStop(0.55, 'rgba(63,143,128,0.55)');
  g.addColorStop(1, 'rgba(31,74,68,0.9)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, BODY_SIZE, BODY_SIZE);
  grime(ctx, x0 - 30, y0 - 30, 60, 60, 0.5, seed, { color: '#10241f', streaks: 0.2 });
  ctx.restore();
  polygon(ctx, pts);
  shadeOverlay(ctx, c - r1, c - r1, c + r1, c + r1, 0.22, 0.32);
  polygon(ctx, pts);
  ink(ctx, 1.1);
  // rivet row along the plate root
  for (let i = -2; i <= 2; i++) {
    const t = a + (i / 2) * half * 0.6;
    rivet(ctx, c + Math.cos(t) * (r0 + 6), c + Math.sin(t) * (r0 + 6), 0.8, 'bronze');
  }
}

function drawBody(ctx) {
  const c = BODY_SIZE / 2;
  // Mantle skirt: 12 plates, back row first (offset by half a plate).
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU;
    mantlePlate(ctx, c, a, 70, 104, TAU / 22, 10 + k);
  }
  for (let k = 0; k < 12; k++) {
    const a = ((k + 0.5) / 12) * TAU;
    mantlePlate(ctx, c, a, 66, 98, TAU / 26, 40 + k);
  }
  // tentacle socket collars peeking out between the plates
  for (const a of [0, 1, 2, 3, 4, 5].map((k) => Math.PI / 6 + (k * Math.PI) / 3)) {
    const x = c + Math.cos(a) * 92;
    const y = c + Math.sin(a) * 92;
    ringMount(ctx, x, y, 11, { kind: 'bronze', table: 'blackiron', bolts: 8 });
    glow(ctx, x, y, 8, '#ff8a2a', 0.7);
    lamp(ctx, x, y, 2.6, '#ffb347', { halo: 2, cage: false });
  }

  // Main dome.
  ambientOcclusion(ctx, () => {
    ctx.beginPath();
    ctx.arc(c, c, 76, 0, TAU);
  }, 0.6, 5);
  ctx.beginPath();
  ctx.arc(c, c, 76, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, c, c, 76, 'gunmetal', { spec: 0.35 });
  ctx.fill();
  ctx.save();
  ctx.clip();
  // riveted gore seams
  ctx.strokeStyle = 'rgba(12,10,8,0.55)';
  ctx.lineWidth = 1;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * 36, c + Math.sin(a) * 36);
    ctx.lineTo(c + Math.cos(a) * 78, c + Math.sin(a) * 78);
    ctx.stroke();
  }
  // verdigris drips
  const rnd = seeded(5);
  for (let i = 0; i < 18; i++) {
    const a = rnd() * TAU;
    const r = 40 + rnd() * 34;
    glow(ctx, c + Math.cos(a) * r, c + Math.sin(a) * r, 6 + rnd() * 10, PATINA, 0.35);
  }
  grime(ctx, c - 76, c - 76, 152, 152, 0.5, 23, { color: '#0c0a08', streaks: 0.1 });
  ctx.restore();
  ctx.beginPath();
  ctx.arc(c, c, 76, 0, TAU);
  rimLight(ctx, c - 76, c - 76, c + 76, c + 76, 1.4, 0.45);
  ctx.beginPath();
  ctx.arc(c, c, 76, 0, TAU);
  ink(ctx, 1.5);
  rivetRing(ctx, c, c, 72, 40, 0.9, 'gunmetal', 0.1);

  // crimson band
  ctx.beginPath();
  ctx.arc(c, c, 64, 0, TAU);
  ctx.arc(c, c, 60, 0, TAU, true);
  ctx.fillStyle = '#9a2a20';
  ctx.fill('evenodd');
  ctx.beginPath();
  ctx.arc(c, c, 64, 0, TAU);
  ink(ctx, 0.6);

  // porthole ring + copper pipes between them
  for (let k = 0; k < PORTHOLES; k++) {
    const a = (k / PORTHOLES) * TAU + 0.15;
    const a2 = a + TAU / PORTHOLES / 2;
    pipe(ctx, [
      [c + Math.cos(a2) * 40, c + Math.sin(a2) * 40],
      [c + Math.cos(a2) * 58, c + Math.sin(a2) * 58],
    ], 2.4, 'copper', { flanges: true });
  }
  for (let k = 0; k < PORTHOLES; k++) {
    const a = (k / PORTHOLES) * TAU + 0.15;
    porthole(ctx, c + Math.cos(a) * 52, c + Math.sin(a) * 52, 5.2, { glow: true, color: '#ffae42', halo: 1.9, kind: 'brass', bolts: 6 });
  }
  // vent stacks
  for (const v of VENTS) {
    smokestack(ctx, c + Math.cos(v.a + 0.32) * 66, c + Math.sin(v.a + 0.32) * 66, 4.4, 'blackiron', { soot: 0, ember: true });
  }

  // eye socket: brass collar with aperture bolts
  ctx.beginPath();
  ctx.arc(c, c, 40, 0, TAU);
  ctx.fillStyle = metal(ctx, c - 40, c - 40, c + 40, c + 40, 'brass', { polish: true });
  ctx.fill();
  ink(ctx, 1.2);
  gear(ctx, c, c, 38, 28, { kind: 'brass', toothDepth: 3, hole: 30, outline: 0.8 });
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU;
    bolt(ctx, c + Math.cos(a) * 33, c + Math.sin(a) * 33, 1.6, 'bronze', a);
  }
  ctx.beginPath();
  ctx.arc(c, c, 30, 0, TAU);
  ctx.fillStyle = '#0a0606';
  ctx.fill();
  ink(ctx, 1);
}

function drawCracks(ctx) {
  const c = BODY_SIZE / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, 104, 0, TAU);
  ctx.clip();
  const rnd = seeded(77);
  for (let i = 0; i < 9; i++) {
    const a = rnd() * TAU;
    const r = 40 + rnd() * 50;
    glow(ctx, c + Math.cos(a) * r, c + Math.sin(a) * r, 14 + rnd() * 14, '#0d0805', 0.7);
  }
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    let a = rnd() * TAU;
    let r = 42 + rnd() * 10;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    for (let s = 0; s < 6; s++) {
      a += (rnd() - 0.5) * 0.3;
      r += 5 + rnd() * 6;
      ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    }
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#0a0605';
    ctx.stroke();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = '#ff7a2f';
    ctx.stroke();
  }
  ctx.restore();
}

function drawEye(ctx) {
  // the iris (pupil is drawn live): ember fibres radiating around a dark centre, brass aperture
  const c = 40;
  const g = ctx.createRadialGradient(c, c, 4, c, c, 30);
  g.addColorStop(0, '#fff2c0');
  g.addColorStop(0.18, '#ffb347');
  g.addColorStop(0.5, '#ff5a1f');
  g.addColorStop(0.85, '#8c1a12');
  g.addColorStop(1, '#2a0806');
  ctx.beginPath();
  ctx.arc(c, c, 30, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  const rnd = seeded(3);
  ctx.lineCap = 'round';
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * TAU + rnd() * 0.05;
    const r0 = 9 + rnd() * 3;
    const r1 = 22 + rnd() * 7;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
    ctx.lineTo(c + Math.cos(a + 0.05) * r1, c + Math.sin(a + 0.05) * r1);
    ctx.lineWidth = 0.6 + rnd() * 0.8;
    ctx.strokeStyle = rnd() < 0.5 ? 'rgba(255,230,160,0.55)' : 'rgba(120,20,10,0.5)';
    ctx.stroke();
  }
  // clockwork aperture ring
  gear(ctx, c, c, 31, 36, { kind: 'bronze', toothDepth: 1.6, hole: 28.5, outline: 0.6 });
  // specular
  ctx.beginPath();
  ctx.ellipse(c - 10, c - 12, 7, 4, -0.6, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();
}

// ---- Tentacle pieces -------------------------------------------------------------------------------

function drawSegment(ctx) {
  // 44×44, centre (22,22), r = 20, tentacle runs along x. Banded armour ring seen from above.
  const c = 22;
  ctx.beginPath();
  ctx.ellipse(c, c, 15, 20, 0, 0, TAU);
  ctx.fillStyle = cylinderGrad(ctx, 0, c - 20, 0, c + 20, 'gunmetal');
  ctx.fill();
  ink(ctx, 1.1);
  // verdigris top plate
  ctx.beginPath();
  ctx.ellipse(c + 1, c, 10, 15, 0, 0, TAU);
  ctx.fillStyle = metal(ctx, c - 10, c - 15, c + 10, c + 15, 'copper');
  ctx.fill();
  ctx.save();
  ctx.clip();
  const g = ctx.createLinearGradient(c, c - 15, c, c + 15);
  g.addColorStop(0, 'rgba(63,143,128,0.25)');
  g.addColorStop(1, 'rgba(31,74,68,0.85)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 44, 44);
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(c + 1, c, 10, 15, 0, 0, TAU);
  ink(ctx, 0.7);
  // spine ridge & rivets
  spike(ctx, c - 6, c, 14, 5, 0, 'blackiron');
  for (const s of [-1, 1]) {
    rivet(ctx, c - 9, c + s * 13, 0.9, 'bronze');
    rivet(ctx, c + 9, c + s * 13, 0.9, 'bronze');
    rivet(ctx, c, c + s * 17, 0.9, 'bronze');
  }
  // joint light
  glow(ctx, c + 4, c, 6, '#ffae42', 0.7);
  lamp(ctx, c + 4, c, 1.6, '#ffcf6a', { halo: 0, cage: false });
}

function drawJoint(ctx) {
  // 52×52 root joint: a geared collar with a glowing heart (r ≈ 22 at sprite scale)
  const c = 26;
  gear(ctx, c, c, 23, 14, { kind: 'bronze', toothDepth: 3.5, spokes: 0, hub: false, outline: 1 });
  ctx.beginPath();
  ctx.arc(c, c, 16, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, c, c, 16, 'gunmetal', { spec: 0.4 });
  ctx.fill();
  ink(ctx, 1);
  rivetRing(ctx, c, c, 13, 10, 0.9, 'brass', 0.2);
  glow(ctx, c, c, 11, '#ff8a2a', 0.9);
  ctx.beginPath();
  ctx.arc(c, c, 6, 0, TAU);
  ctx.fillStyle = '#ffd28a';
  ctx.fill();
  ink(ctx, 0.6);
}

function drawClaw(ctx, w, h, frame) {
  // 64×48, pivot (18,24) = segment centre; hook pincers reach toward +x. frame 1 = clamped.
  const cx = 18;
  const cy = 24;
  const open = frame === 0 ? 1 : 0;
  // wrist
  ctx.beginPath();
  ctx.ellipse(cx, cy, 13, 16, 0, 0, TAU);
  ctx.fillStyle = cylinderGrad(ctx, 0, cy - 16, 0, cy + 16, 'gunmetal');
  ctx.fill();
  ink(ctx, 1);
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(cx + 6, cy + s * 5);
    ctx.rotate(s * (-0.06 + 0.55 * open));
    // curved hook pincer
    ctx.beginPath();
    ctx.moveTo(0, -s * 6);
    ctx.quadraticCurveTo(22, -s * 12, 38, -s * 2);
    ctx.quadraticCurveTo(40, s * 2, 34, s * 4);
    ctx.quadraticCurveTo(24, -s * 3, 4, s * 5);
    ctx.closePath();
    ctx.fillStyle = cylinderGrad(ctx, 0, -8, 0, 8, 'blackiron');
    ctx.fill();
    ink(ctx, 1);
    // serrated inner edge
    for (let i = 0; i < 4; i++) {
      spike(ctx, 12 + i * 6, s * (1 - i * 0.3), 4, 3, s * Math.PI / 2, 'steel');
    }
    rivet(ctx, 6, 0, 1.2, 'brass');
    ctx.restore();
  }
  // knuckle hub & ember eye
  dome(ctx, cx + 4, cy, 6, 'bronze', { rivets: 6 });
  glow(ctx, cx + 4, cy, 7, '#ff3d8b', 0.5);
  lamp(ctx, cx + 4, cy, 2, '#ff6ab0', { halo: 0, cage: false });
}

function drawStump(ctx) {
  const c = 20;
  ringMount(ctx, c, c, 14, { kind: 'bronze', table: 'blackiron', bolts: 8 });
  const rnd = seeded(8);
  for (let i = 0; i < 6; i++) {
    const a = rnd() * TAU;
    pipe(ctx, [[c, c], [c + Math.cos(a) * (10 + rnd() * 8), c + Math.sin(a) * (10 + rnd() * 8)]], 1.6, i % 2 ? 'copper' : 'iron', { flanges: false });
  }
  glow(ctx, c, c, 10, '#ff6a2a', 0.8);
  glow(ctx, c, c, 4, '#fff0c8', 0.8);
}

function drawInk(ctx) {
  // lobbed ink bomb: dark bladder with a magenta sheen (still readable as enemy fire)
  const c = 12;
  glow(ctx, c, c, 12, '#ff3d8b', 0.55);
  ctx.beginPath();
  ctx.arc(c, c, 7.5, 0, TAU);
  const g = ctx.createRadialGradient(c - 2.5, c - 2.5, 0.5, c, c, 7.5);
  g.addColorStop(0, '#d48ad8');
  g.addColorStop(0.35, '#4a2058');
  g.addColorStop(1, '#120818');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = '#ff3d8b';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(c - 2.6, c - 2.8, 1.6, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fill();
}

function drawCloud(ctx) {
  // soft blotchy ink-smog disc (tinted & rotated at draw time)
  const c = 64;
  const rnd = seeded(31);
  for (let i = 0; i < 22; i++) {
    const a = rnd() * TAU;
    const r = rnd() * 34;
    const s = 18 + rnd() * 22;
    const x = c + Math.cos(a) * r;
    const y = c + Math.sin(a) * r;
    const g = ctx.createRadialGradient(x, y, 0, x, y, s);
    g.addColorStop(0, 'rgba(24,14,30,0.55)');
    g.addColorStop(0.6, 'rgba(30,18,38,0.3)');
    g.addColorStop(1, 'rgba(30,18,38,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, s, 0, TAU);
    ctx.fill();
  }
  // faint violet sheen swirls
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const r = 16 + i * 10;
    ctx.beginPath();
    ctx.arc(c, c, r, i * 1.3, i * 1.3 + 1.6);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(150,70,170,0.22)';
    ctx.stroke();
  }
}

function drawGlow(color) {
  return (ctx) => {
    glow(ctx, 32, 32, 32, color, 1, { core: 0.08 });
    glow(ctx, 32, 32, 11, '#fff2d8', 0.8);
  };
}

let registered = false;

/** Register every Clockwork Kraken sprite (idempotent). */
export function registerKrakenArt() {
  if (registered) return;
  registered = true;
  Sprites.register('boss_kraken', { w: BODY_SIZE, h: BODY_SIZE, draw: drawBody });
  Sprites.register('boss_kraken_cracks', { w: BODY_SIZE, h: BODY_SIZE, draw: drawCracks });
  Sprites.register('boss_kraken_eye', { w: 80, h: 80, draw: drawEye });
  Sprites.register('boss_kraken_seg', { w: 44, h: 44, draw: drawSegment });
  Sprites.register('boss_kraken_joint', { w: 52, h: 52, draw: drawJoint });
  Sprites.register('boss_kraken_claw', { w: 64, h: 48, cx: 18, cy: 24, frames: 2, draw: drawClaw });
  Sprites.register('boss_kraken_stump', { w: 40, h: 40, draw: drawStump });
  Sprites.register('boss_kraken_ink', { w: 24, h: 24, draw: drawInk });
  Sprites.register('boss_kraken_cloud', { w: 128, h: 128, draw: drawCloud });
  Sprites.register('boss_kraken_glow', { w: 64, h: 64, draw: drawGlow('#ff7a2f') });
  Sprites.register('boss_kraken_glowP', { w: 64, h: 64, draw: drawGlow('#ff3d8b') });
}

