// Player turrets (one per primary cannon) and the animated propeller (WP4).
// Turrets: 44×22, pivot at the ring-mount centre (12, 11), barrel along +x. The engine rotates
// them to the aim angle and may offset them backwards for recoil (`wpn.kick`).

import { Sprites } from '../sprites.js';
import {
  PAL, ringMount, cannon, cylinder, coil, crystal, glow, glowEllipse, metal, metalRadial,
  cylinderGrad, ink, polygon, roundRect, rivet, rivetLine, propeller, ropeLine, plate, alpha,
  smoothPath, bolt, mix,
} from '../drawkit.js';

const TAU = Math.PI * 2;
const TW = 44;
const TH = 22;
const PX = 12;
const PY = 11;
const TURRET_SCALE = 3;

function registerTurret(id, draw) {
  Sprites.register(`turret_${id}`, {
    w: TW,
    h: TH,
    cx: PX,
    cy: PY,
    scale: TURRET_SCALE,
    draw: (ctx) => draw(ctx),
  });
}

/** Trunnion pin seen from above. */
function trunnion(ctx, x, y, r = 1.3, kind = 'brass') {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, x, y, r, kind);
  ctx.fill();
  ink(ctx, 0.5);
}

// --- Brass Cannon: classic flared muzzle-loader on a carriage --------------------------------
registerTurret('brassCannon', (ctx) => {
  ringMount(ctx, PX, PY, 9, { kind: 'brass', table: 'iron' });
  // carriage cheeks
  for (const s of [-1, 1]) {
    roundRect(ctx, 6.5, PY + s * 4.4 - 1.3, 12.5, 2.6, 0.8);
    ctx.fillStyle = metal(ctx, 6, PY - 6, 19, PY + 6, 'wood');
    ctx.fill();
    ink(ctx, 0.6);
    rivet(ctx, 8.2, PY + s * 4.4, 0.45, 'brass');
    rivet(ctx, 17.4, PY + s * 4.4, 0.45, 'brass');
  }
  cannon(ctx, 9.5, PY, 31.5, 7.4, 'brass', { bands: [0.13, 0.42, 0.7], taper: 0.7, swell: 1.25 });
  for (const s of [-1, 1]) trunnion(ctx, 14, PY + s * 4, 1.25);
  // touch-hole & sight
  ctx.beginPath();
  ctx.arc(11.2, PY, 0.5, 0, TAU);
  ctx.fillStyle = '#1a0f06';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(37.5, PY);
  ctx.lineTo(39.5, PY);
  ctx.strokeStyle = '#4a3112';
  ctx.lineWidth = 0.6;
  ctx.stroke();
});

// --- Gatling Repeater: rotary barrel cluster, rotor housing, ammo drum --------------------------
registerTurret('gatling', (ctx) => {
  ringMount(ctx, PX, PY, 9, { kind: 'brass', table: 'gunmetal' });
  // ammo drum + feed chute on the starboard side
  roundRect(ctx, 5, PY + 3.2, 9, 6.2, 1.4);
  ctx.fillStyle = cylinderGrad(ctx, 5, 0, 14, 0, 'copper');
  ctx.fill();
  ink(ctx, 0.6);
  for (let x = 6.5; x < 14; x += 1.8) {
    ctx.fillStyle = 'rgba(30,14,6,0.45)';
    ctx.fillRect(x, PY + 3.4, 0.4, 5.8);
  }
  polygon(ctx, [[12.5, PY + 4], [17.5, PY + 2.6], [17.5, PY + 4.6], [13.5, PY + 6.4]]);
  ctx.fillStyle = metal(ctx, 12, PY + 2, 18, PY + 7, 'brass');
  ctx.fill();
  ink(ctx, 0.5);
  // barrels (three visible of six), back to front so the centre one sits on top
  for (const dy of [-3.1, 3.1, 0]) {
    cylinder(ctx, 17, PY + dy, 42.5, PY + dy, 2.5, 2.3, dy === 0 ? 'steel' : 'iron', { ink: 0.55 });
    ctx.beginPath();
    ctx.arc(42.4, PY + dy, 0.75, 0, TAU);
    ctx.fillStyle = '#0d0905';
    ctx.fill();
  }
  // clamps
  for (const [x, wdt] of [[27, 1.6], [37.5, 2]]) {
    roundRect(ctx, x, PY - 5.2, wdt, 10.4, 0.6);
    ctx.fillStyle = cylinderGrad(ctx, 0, PY - 5.2, 0, PY + 5.2, 'brass');
    ctx.fill();
    ink(ctx, 0.5);
  }
  // rotor housing with gear teeth
  roundRect(ctx, 9, PY - 5.6, 10, 11.2, 2);
  ctx.fillStyle = cylinderGrad(ctx, 0, PY - 5.6, 0, PY + 5.6, 'brass');
  ctx.fill();
  ink(ctx, 0.8);
  for (let y = PY - 4.8; y <= PY + 4.9; y += 1.6) {
    ctx.fillStyle = 'rgba(40,24,8,0.55)';
    ctx.fillRect(18.2, y - 0.35, 1.4, 0.7);
  }
  ctx.fillStyle = 'rgba(40,24,8,0.4)';
  ctx.fillRect(12.5, PY - 5.5, 0.5, 11);
  // crank handle at the back
  cylinder(ctx, 9, PY - 1, 5, PY - 4.5, 1, 1, 'iron', { ink: 0.4 });
  ctx.beginPath();
  ctx.arc(5, PY - 4.6, 1, 0, TAU);
  ctx.fillStyle = PAL.oxblood;
  ctx.fill();
  ink(ctx, 0.4);
});

// --- Flak Blunderbuss: bell-mouthed brass trumpet on a wooden stock ---------------------------
registerTurret('blunderbuss', (ctx) => {
  ringMount(ctx, PX, PY, 9, { kind: 'brass', table: 'iron' });
  // stock
  smoothPath(ctx, [[3, PY - 2.4], [8, PY - 3.4], [15, PY - 2.4], [15, PY + 2.4], [8, PY + 3.4], [3, PY + 2.4]]);
  ctx.fillStyle = metal(ctx, 3, PY - 3, 15, PY + 3, 'wood', { polish: true });
  ctx.fill();
  ink(ctx, 0.7);
  ctx.fillStyle = metal(ctx, 2.6, PY - 3, 4.4, PY + 3, 'brass');
  ctx.fillRect(2.6, PY - 2.6, 1.6, 5.2);
  // flared barrel
  const top = [];
  const N = 18;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = 12 + t * 29.5;
    const hw = 2.6 + 0.0 * t + Math.pow(t, 3.2) * 5.4;
    top.push([x, PY - hw]);
  }
  const pts = [...top, ...top.map(([x, y]) => [x, PY * 2 - y]).reverse()];
  polygon(ctx, pts);
  ctx.fillStyle = cylinderGrad(ctx, 0, PY - 8, 0, PY + 8, 'brass');
  ctx.fill();
  ink(ctx, 0.8);
  // reinforcing rings
  for (const x of [16, 22, 28]) {
    const t = (x - 12) / 29.5;
    const hw = 2.6 + Math.pow(t, 3.2) * 5.4 + 0.45;
    roundRect(ctx, x - 0.8, PY - hw, 1.6, hw * 2, 0.5);
    ctx.fillStyle = cylinderGrad(ctx, 0, PY - hw, 0, PY + hw, 'copper');
    ctx.fill();
    ink(ctx, 0.45);
  }
  // bell rim & dark mouth
  ctx.beginPath();
  ctx.ellipse(41.2, PY, 1.9, 8.1, 0, 0, TAU);
  ctx.fillStyle = metal(ctx, 39, PY - 8, 43, PY + 8, 'brass', { polish: true });
  ctx.fill();
  ink(ctx, 0.6);
  ctx.beginPath();
  ctx.ellipse(41.6, PY + 0.3, 1.1, 6.6, 0, 0, TAU);
  const g = ctx.createLinearGradient(41, PY - 6, 41, PY + 6);
  g.addColorStop(0, '#000000');
  g.addColorStop(0.7, '#21130a');
  g.addColorStop(1, '#5a3a18');
  ctx.fillStyle = g;
  ctx.fill();
  for (const s of [-1, 1]) trunnion(ctx, 14.5, PY + s * 3.2, 1.05);
});

// --- Siege Mortar: stubby wide tube tilted skyward on a riveted bed ---------------------------
registerTurret('mortar', (ctx) => {
  ringMount(ctx, PX, PY, 9.6, { kind: 'brass', table: 'iron', bolts: 12 });
  plate(ctx, 5, PY - 6.6, 15, 13.2, 2, 'iron', { rivets: 3.4, rivetR: 0.45, rivetKind: 'brass', ink: 0.8 });
  // tube body, wide and short
  polygon(ctx, [
    [11, PY - 6.2],
    [27, PY - 6.6],
    [27, PY + 6.6],
    [11, PY + 6.2],
  ]);
  ctx.fillStyle = cylinderGrad(ctx, 0, PY - 6.6, 0, PY + 6.6, 'gunmetal');
  ctx.fill();
  ink(ctx, 0.9);
  for (const x of [14, 21]) {
    roundRect(ctx, x - 1, PY - 7.1, 2, 14.2, 0.7);
    ctx.fillStyle = cylinderGrad(ctx, 0, PY - 7, 0, PY + 7, 'brass');
    ctx.fill();
    ink(ctx, 0.5);
  }
  // muzzle: seen obliquely because the tube points up
  ctx.beginPath();
  ctx.ellipse(28.5, PY, 5.2, 7.6, 0, 0, TAU);
  ctx.fillStyle = metal(ctx, 23, PY - 8, 34, PY + 8, 'brass', { polish: true });
  ctx.fill();
  ink(ctx, 0.9);
  ctx.beginPath();
  ctx.ellipse(28.9, PY + 0.2, 3.8, 5.9, 0, 0, TAU);
  const g = ctx.createRadialGradient(28, PY - 2, 0.5, 29, PY, 6);
  g.addColorStop(0, '#3a2a1e');
  g.addColorStop(0.6, '#140c07');
  g.addColorStop(1, '#000000');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(28.9, PY + 0.2, 3.8, 5.9, 0, Math.PI * 0.9, Math.PI * 1.55);
  ctx.strokeStyle = 'rgba(255,240,200,0.45)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
  for (const s of [-1, 1]) trunnion(ctx, 13, PY + s * 7.2, 1.5, 'iron');
  bolt(ctx, 7, PY - 4.4, 0.8, 'iron');
  bolt(ctx, 7, PY + 4.4, 0.8, 'iron');
});

// --- Aether Lance: coil-wrapped emitter with a glowing crystal between focusing prongs --------
registerTurret('aetherLance', (ctx) => {
  ringMount(ctx, PX, PY, 9, { kind: 'brass', table: 'steel' });
  // capacitor canisters
  for (const s of [-1, 1]) {
    cylinder(ctx, 5.5, PY + s * 5, 15.5, PY + s * 5, 3.4, 3.4, 'copper', { capStart: true, capEnd: true, ink: 0.6 });
    ctx.fillStyle = alpha(PAL.aether[0], 0.9);
    ctx.fillRect(9.5, PY + s * 5 - 0.5, 2.2, 1);
  }
  plate(ctx, 7, PY - 3.4, 11, 6.8, 1.4, 'brass', { ink: 0.7, polish: true });
  // core rod and windings
  cylinder(ctx, 16, PY, 37, PY, 3, 2.6, 'steel', { ink: 0.6 });
  coil(ctx, 18.5, PY, 33, PY, 7, 7, { kind: 'copper', core: 'iron', glow: PAL.aether[0] });
  // focusing prongs
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(33, PY + s * 2.6);
    ctx.quadraticCurveTo(38, PY + s * 5.6, 42.5, PY + s * 2.2);
    ctx.lineTo(42, PY + s * 1.4);
    ctx.quadraticCurveTo(38, PY + s * 3.9, 33.5, PY + s * 1.4);
    ctx.closePath();
    ctx.fillStyle = metal(ctx, 33, PY - 6, 43, PY + 6, 'brass', { polish: true });
    ctx.fill();
    ink(ctx, 0.5);
  }
  glow(ctx, 39, PY, 8, PAL.aether[0], 0.8, { core: 0.12 });
  crystal(ctx, 39, PY, 3.6, { rot: 0, width: 0.5, color: PAL.aether[0], ink: 0.45 });
  glowEllipse(ctx, 39.5, PY, 4.5, 1.2, '#ffffff', 0.7);
});

// --- Harpoon Gun: rail launcher, loaded barbed harpoon, cable drum ----------------------------
registerTurret('harpoon', (ctx) => {
  ringMount(ctx, PX, PY, 9, { kind: 'brass', table: 'iron' });
  // cable drum on the starboard quarter
  roundRect(ctx, 4.2, PY + 3.3, 10, 6.4, 1.2);
  ctx.fillStyle = cylinderGrad(ctx, 4, 0, 14, 0, 'iron');
  ctx.fill();
  ink(ctx, 0.6);
  ctx.save();
  roundRect(ctx, 5.4, PY + 3.7, 7.6, 5.6, 0.6);
  ctx.clip();
  for (let x = 5; x < 13.5; x += 1.15) {
    ctx.fillStyle = mix('#b8935a', '#6e4a22', (x % 2.3) / 2.3);
    ctx.fillRect(x, PY + 3.6, 1.1, 6);
    ctx.fillStyle = 'rgba(30,18,6,0.5)';
    ctx.fillRect(x + 0.95, PY + 3.6, 0.2, 6);
  }
  ctx.restore();
  // rails & ties
  for (const s of [-1, 1]) cylinder(ctx, 9, PY + s * 2.7, 35, PY + s * 2.7, 1.7, 1.5, 'iron', { ink: 0.5 });
  for (const x of [14, 22, 30]) {
    roundRect(ctx, x - 0.7, PY - 3.8, 1.4, 7.6, 0.4);
    ctx.fillStyle = metal(ctx, x - 1, PY - 4, x + 1, PY + 4, 'brass');
    ctx.fill();
    ink(ctx, 0.4);
  }
  // cable from drum to the harpoon's tail ring
  ropeLine(ctx, 11.5, PY + 4.5, 8.4, PY, 0.75, { sag: -1.2 });
  // harpoon shaft
  cylinder(ctx, 8, PY, 35.5, PY, 1.7, 1.7, 'wood', { ink: 0.5 });
  ctx.beginPath();
  ctx.arc(8, PY, 1.1, 0, TAU);
  ctx.lineWidth = 0.55;
  ctx.strokeStyle = '#c9973f';
  ctx.stroke();
  roundRect(ctx, 33.6, PY - 1.4, 2.4, 2.8, 0.4);
  ctx.fillStyle = metal(ctx, 33, PY - 1.5, 36, PY + 1.5, 'brass', { polish: true });
  ctx.fill();
  ink(ctx, 0.4);
  // barbed head
  polygon(ctx, [
    [43.6, PY],
    [38.6, PY - 2.1],
    [39.6, PY - 0.9],
    [36.2, PY - 3.6],
    [37.4, PY - 0.9],
    [35.8, PY - 0.9],
    [35.8, PY + 0.9],
    [37.4, PY + 0.9],
    [36.2, PY + 3.6],
    [39.6, PY + 0.9],
    [38.6, PY + 2.1],
  ]);
  ctx.fillStyle = metal(ctx, 36, PY - 3.6, 44, PY + 3.6, 'steel', { polish: true });
  ctx.fill();
  ink(ctx, 0.55);
  rivetLine(ctx, 15, PY - 5.4, 15, PY + 5.4, 10.8, 0.45, 'brass');
});

// --- Propeller: 4 motion-blurred frames covering a 120° cycle of a 3-blade screw -------------
Sprites.register('prop', {
  w: 20,
  h: 20,
  frames: 4,
  scale: 3,
  draw(ctx, w, h, frame) {
    propeller(ctx, 10, 10, 9.6, 3, (frame * (TAU / 3)) / 4, { blur: 0.85, kind: 'brass', tip: PAL.oxblood });
  },
});
