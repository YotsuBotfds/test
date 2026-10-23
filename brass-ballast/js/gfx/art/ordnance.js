// Projectiles (WP4). All face +x. Player fire = brass / gold / aether-cyan; enemy fire = hot
// red / orange / magenta with a white-hot core and a dark rim so it reads above any backdrop
// (DESIGN §1). Glows are baked in; nothing here is drawn per frame.

import { Sprites } from '../sprites.js';
import {
  PAL, glow, glowEllipse, metal, metalRadial, cylinderGrad, ink, polygon, smoothPath, star, rivet,
  rivetRing, gear, gearPath, crystal, hotOrb, spike, propeller, alpha, lighten, darken, seeded,
  cylinder, ropeLine,
} from '../drawkit.js';

const TAU = Math.PI * 2;
const GOLD = PAL.playerFire[0];
const GOLD_HOT = PAL.playerFire[1];
const AETHER = PAL.aether[0];
const E_RED = PAL.enemyFire[0];
const E_CORE = PAL.enemyFire[1];
const E_MAG = PAL.enemyFire[2];
const E_RIM = '#2e0604';

function reg(name, w, h, draw, extra = {}) {
  Sprites.register(name, { w, h, ...extra, draw });
}

// =============================================================================================
// Player ordnance
// =============================================================================================

reg('pb_ball', 14, 14, (ctx) => {
  glow(ctx, 7, 7, 7, GOLD, 0.55);
  ctx.beginPath();
  ctx.arc(7, 7, 4.7, 0, TAU);
  ctx.fillStyle = '#2a1a08';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(7, 7, 4, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, 7, 7, 4, 'gold', { spec: 1 });
  ctx.fill();
  ctx.beginPath();
  ctx.arc(5.6, 5.6, 1.2, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fill();
});

reg('pb_bullet', 10, 6, (ctx) => {
  const g = ctx.createLinearGradient(0, 0, 7, 0);
  g.addColorStop(0, alpha(GOLD, 0));
  g.addColorStop(1, alpha(GOLD_HOT, 0.9));
  ctx.fillStyle = g;
  polygon(ctx, [[0, 3], [6, 1.5], [6, 4.5]]);
  ctx.fill();
  glowEllipse(ctx, 6.5, 3, 4, 2.6, GOLD, 0.5);
  ctx.beginPath();
  ctx.moveTo(4, 1.3);
  ctx.lineTo(7.4, 1.3);
  ctx.quadraticCurveTo(10, 1.5, 9.8, 3);
  ctx.quadraticCurveTo(10, 4.5, 7.4, 4.7);
  ctx.lineTo(4, 4.7);
  ctx.closePath();
  ctx.fillStyle = cylinderGrad(ctx, 0, 1.3, 0, 4.7, 'gold');
  ctx.fill();
  ink(ctx, 0.5);
  ctx.fillStyle = 'rgba(255,255,240,0.9)';
  ctx.fillRect(5, 2, 3.5, 0.6);
});

reg('pb_pellet', 8, 8, (ctx) => {
  glow(ctx, 4, 4, 4, GOLD, 0.7);
  ctx.beginPath();
  ctx.arc(4, 4, 2.2, 0, TAU);
  ctx.fillStyle = '#4a2c08';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(4, 4, 1.7, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, 4, 4, 1.7, 'gold', { spec: 1 });
  ctx.fill();
});

reg('pb_shell', 16, 12, (ctx) => {
  glow(ctx, 8, 6, 7.5, GOLD, 0.4);
  // ogive shell body pointing +x
  ctx.beginPath();
  ctx.moveTo(2.4, 2.6);
  ctx.lineTo(9.5, 2.6);
  ctx.quadraticCurveTo(14.6, 3.2, 15, 6);
  ctx.quadraticCurveTo(14.6, 8.8, 9.5, 9.4);
  ctx.lineTo(2.4, 9.4);
  ctx.quadraticCurveTo(1.6, 6, 2.4, 2.6);
  ctx.closePath();
  ctx.fillStyle = cylinderGrad(ctx, 0, 2.6, 0, 9.4, 'brass');
  ctx.fill();
  ink(ctx, 0.7);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = cylinderGrad(ctx, 0, 2.6, 0, 9.4, 'copper');
  ctx.fillRect(4.2, 2, 1.6, 8);
  ctx.fillStyle = cylinderGrad(ctx, 0, 2.6, 0, 9.4, 'oxblood');
  ctx.fillRect(13.2, 2, 3, 8);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(1.8, 6, 1, 0, TAU);
  ctx.fillStyle = GOLD_HOT;
  ctx.fill();
});

reg('pb_lance', 36, 8, (ctx) => {
  glowEllipse(ctx, 20, 4, 17, 4, AETHER, 0.6);
  // tapered bolt
  ctx.beginPath();
  ctx.moveTo(1, 4);
  ctx.lineTo(28, 1.6);
  ctx.quadraticCurveTo(35.6, 2, 35.6, 4);
  ctx.quadraticCurveTo(35.6, 6, 28, 6.4);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, 36, 0);
  g.addColorStop(0, alpha(PAL.aether[1], 0));
  g.addColorStop(0.35, alpha(PAL.aether[1], 0.85));
  g.addColorStop(1, AETHER);
  ctx.fillStyle = g;
  ctx.fill();
  // white-hot core
  ctx.beginPath();
  ctx.moveTo(8, 4);
  ctx.lineTo(29, 3);
  ctx.quadraticCurveTo(34, 3.2, 34, 4);
  ctx.quadraticCurveTo(34, 4.8, 29, 5);
  ctx.closePath();
  ctx.fillStyle = '#f2ffff';
  ctx.fill();
  // ring pulses along the bolt
  for (const x of [13, 20, 26]) {
    ctx.beginPath();
    ctx.ellipse(x, 4, 0.7, 2.5, 0, 0, TAU);
    ctx.strokeStyle = alpha('#ffffff', 0.55);
    ctx.lineWidth = 0.4;
    ctx.stroke();
  }
  glow(ctx, 33, 4, 4, '#ffffff', 0.7);
});

reg('pb_harpoon', 40, 10, (ctx) => {
  glowEllipse(ctx, 22, 5, 18, 4, GOLD, 0.3);
  ropeLine(ctx, 0.3, 5.6, 4.5, 5, 0.8, { sag: 0.6 });
  // fletching vanes
  for (const s of [-1, 1]) {
    polygon(ctx, [[4, 5], [9, 5 + s * 0.8], [6, 5 + s * 3.6], [3, 5 + s * 3.4]]);
    ctx.fillStyle = metal(ctx, 3, 1, 9, 9, 'brass', { polish: true });
    ctx.fill();
    ink(ctx, 0.45);
  }
  cylinder(ctx, 4, 5, 30, 5, 1.8, 1.8, 'wood', { ink: 0.5 });
  ctx.fillStyle = metal(ctx, 28, 3.6, 31, 6.4, 'brass', { polish: true });
  ctx.fillRect(27.6, 3.8, 2.2, 2.4);
  polygon(ctx, [
    [39.6, 5],
    [34.4, 2.9],
    [35.4, 4.1],
    [31.4, 1.2],
    [32.6, 4.1],
    [29.8, 4.1],
    [29.8, 5.9],
    [32.6, 5.9],
    [31.4, 8.8],
    [35.4, 5.9],
    [34.4, 7.1],
  ]);
  ctx.fillStyle = metal(ctx, 30, 1, 40, 9, 'steel', { polish: true });
  ctx.fill();
  ink(ctx, 0.5);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillRect(32, 4.6, 6, 0.4);
});

reg('pb_rocket', 24, 10, (ctx) => {
  // exhaust flame
  glowEllipse(ctx, 4, 5, 5, 3.5, '#ffb347', 0.8);
  ctx.beginPath();
  ctx.moveTo(7, 3.4);
  ctx.quadraticCurveTo(2, 3.6, 0.2, 5);
  ctx.quadraticCurveTo(2, 6.4, 7, 6.6);
  ctx.closePath();
  const f = ctx.createLinearGradient(0, 0, 7, 0);
  f.addColorStop(0, 'rgba(255,140,40,0)');
  f.addColorStop(0.5, '#ffb347');
  f.addColorStop(1, '#fff3c4');
  ctx.fillStyle = f;
  ctx.fill();
  // fins
  for (const s of [-1, 1]) {
    polygon(ctx, [[6.2, 5 + s * 1.6], [11, 5 + s * 1.8], [8.6, 5 + s * 4.4], [5.6, 5 + s * 4.4]]);
    ctx.fillStyle = metal(ctx, 5, 0, 11, 10, 'oxblood');
    ctx.fill();
    ink(ctx, 0.45);
  }
  // body & nose
  cylinder(ctx, 6.5, 5, 18.5, 5, 4.2, 4.2, 'brass', { ink: 0.55 });
  ctx.beginPath();
  ctx.moveTo(18.2, 2.9);
  ctx.quadraticCurveTo(23.6, 3.4, 23.8, 5);
  ctx.quadraticCurveTo(23.6, 6.6, 18.2, 7.1);
  ctx.closePath();
  ctx.fillStyle = cylinderGrad(ctx, 0, 2.9, 0, 7.1, 'copper');
  ctx.fill();
  ink(ctx, 0.5);
  ctx.fillStyle = cylinderGrad(ctx, 0, 2.9, 0, 7.1, 'oxblood');
  ctx.fillRect(12.4, 2.95, 1.4, 4.1);
  rivet(ctx, 15.5, 4.2, 0.35, 'brass');
});

reg('pb_mine', 20, 20, (ctx) => {
  const c = 10;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8;
    spike(ctx, c + Math.cos(a) * 5, c + Math.sin(a) * 5, 4.4, 2.2, a, 'iron');
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * 9.1, c + Math.sin(a) * 9.1, 0.6, 0, TAU);
    ctx.fillStyle = '#f2d48a';
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(c, c, 6.2, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, c, c, 6.2, 'brass', { spec: 0.7 });
  ctx.fill();
  ink(ctx, 0.8);
  ctx.beginPath();
  ctx.arc(c, c, 4.6, 0, TAU);
  ctx.strokeStyle = 'rgba(74,49,18,0.6)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
  rivetRing(ctx, c, c, 4.6, 8, 0.38, 'brass', 0.2);
  glow(ctx, c, c, 4.5, '#ff5a3a', 0.85);
  ctx.beginPath();
  ctx.arc(c, c, 1.6, 0, TAU);
  ctx.fillStyle = '#ff6a4a';
  ctx.fill();
  ink(ctx, 0.4);
  ctx.beginPath();
  ctx.arc(c - 0.5, c - 0.5, 0.6, 0, TAU);
  ctx.fillStyle = '#ffe0c8';
  ctx.fill();
});

/** Player ballast bomb (dropped by the player; facing +x = nose). */
reg('pb_bomb', 22, 22, (ctx) => {
  const c = 11;
  glow(ctx, c + 1, c, 11, GOLD, 0.35);
  // box tail fins at -x
  for (const s of [-1, 1]) {
    polygon(ctx, [[c - 4, c + s * 1.4], [c - 9.6, c + s * 2.2], [c - 10.2, c + s * 5.6], [c - 6.2, c + s * 5.2]]);
    ctx.fillStyle = metal(ctx, 0, 0, 22, 22, 'brass');
    ctx.fill();
    ink(ctx, 0.5);
  }
  ctx.fillStyle = metal(ctx, 0, 0, 22, 22, 'brass');
  ctx.fillRect(c - 10.4, c - 5.8, 1.2, 11.6);
  // body
  ctx.beginPath();
  ctx.ellipse(c + 1, c, 7.6, 6.6, 0, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, c + 1, c, 7.6, 'blackiron', { spec: 0.6 });
  ctx.fill();
  ink(ctx, 0.9);
  // brass bands
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(c + 1, c, 7.6, 6.6, 0, 0, TAU);
  ctx.clip();
  for (const x of [c - 2.4, c + 3.6]) {
    ctx.fillStyle = cylinderGrad(ctx, x, 0, x + 1.6, 0, 'brass');
    ctx.fillRect(x, c - 7, 1.6, 14);
  }
  ctx.restore();
  rivet(ctx, c - 1.6, c - 4.4, 0.4);
  rivet(ctx, c + 4.4, c - 4.2, 0.4);
  // fuse + spark at the nose
  ctx.beginPath();
  ctx.moveTo(c + 8, c);
  ctx.quadraticCurveTo(c + 9.5, c - 1.5, c + 9.8, c - 2.8);
  ctx.strokeStyle = '#3a2a16';
  ctx.lineWidth = 0.7;
  ctx.stroke();
  glow(ctx, c + 9.8, c - 2.8, 3, '#ffcf4a', 0.9);
  star(ctx, c + 9.8, c - 2.8, 1.8, 0.5, 4, 0.3);
  ctx.fillStyle = '#fff3c4';
  ctx.fill();
});

reg('pb_saw', 28, 28, (ctx) => {
  const c = 14;
  const R = 13;
  // faint motion ring
  ctx.beginPath();
  ctx.arc(c, c, R - 0.5, 0, TAU);
  ctx.strokeStyle = alpha(GOLD_HOT, 0.25);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // hooked teeth
  const T = 14;
  ctx.beginPath();
  for (let i = 0; i < T; i++) {
    const a0 = (i / T) * TAU;
    const a1 = ((i + 0.62) / T) * TAU;
    const a2 = ((i + 1) / T) * TAU;
    const p = (a, r) => [c + Math.cos(a) * r, c + Math.sin(a) * r];
    const [x0, y0] = p(a0, R - 3);
    const [x1, y1] = p(a1, R);
    const [x2, y2] = p(a2, R - 3);
    if (i === 0) ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x1 + (x2 - x1) * 0.15, y1 + (y2 - y1) * 0.15);
    ctx.lineTo(x2, y2);
  }
  ctx.closePath();
  ctx.fillStyle = metal(ctx, 0, 0, 28, 28, 'steel', { polish: true });
  ctx.fill();
  ink(ctx, 0.8);
  // disc body with expansion slots
  ctx.beginPath();
  ctx.arc(c, c, R - 3.4, 0, TAU);
  ctx.fillStyle = metal(ctx, 2, 2, 26, 26, 'steel', { polish: true });
  ctx.fill();
  ctx.lineWidth = 0.4;
  ctx.strokeStyle = 'rgba(30,30,36,0.6)';
  ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    ctx.beginPath();
    ctx.arc(c, c, 7.2, a, a + 0.5);
    ctx.strokeStyle = 'rgba(20,20,26,0.7)';
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }
  // gold hub
  gear(ctx, c, c, 4.2, 8, { kind: 'gold', hole: 1.1, toothDepth: 0.9, outline: 0.5 });
  // edge glint
  ctx.beginPath();
  ctx.arc(c, c, R - 3.8, Math.PI * 1.05, Math.PI * 1.45);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 0.7;
  ctx.stroke();
});

reg('pb_flak', 10, 10, (ctx) => {
  glow(ctx, 5, 5, 5, GOLD, 0.7);
  polygon(ctx, [[8.6, 5], [6, 2.2], [2.6, 3], [1.6, 5.6], [3.6, 7.8], [6.6, 7.6]]);
  ctx.fillStyle = metal(ctx, 1.5, 2, 8.5, 8, 'gold', { polish: true });
  ctx.fill();
  ink(ctx, 0.5);
  ctx.beginPath();
  ctx.arc(5, 4.8, 1.1, 0, TAU);
  ctx.fillStyle = GOLD_HOT;
  ctx.fill();
});

reg('pb_spark', 12, 12, (ctx) => {
  glow(ctx, 6, 6, 6, AETHER, 0.85);
  const rnd = seeded(77);
  ctx.strokeStyle = '#e8ffff';
  ctx.lineWidth = 0.7;
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + rnd() * 0.5;
    ctx.beginPath();
    ctx.moveTo(6, 6);
    let x = 6;
    let y = 6;
    for (let s = 1; s <= 3; s++) {
      const r = s * 1.75;
      const aa = a + (rnd() - 0.5) * 0.9;
      x = 6 + Math.cos(aa) * r;
      y = 6 + Math.sin(aa) * r;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  glow(ctx, 6, 6, 2.6, '#ffffff', 1, { core: 0.4 });
});

/** Clockwork drone: brass body, gun, aether eye; frames spin the rotor. */
reg(
  'pb_drone',
  26,
  26,
  (ctx, w, h, frame) => {
    const c = 13;
    // outrigger arms
    for (const s of [-1, 1]) {
      cylinder(ctx, c - 2, c + s * 3, c - 6, c + s * 8.5, 1.4, 1.2, 'brass', { ink: 0.45 });
      ctx.beginPath();
      ctx.arc(c - 6, c + s * 8.5, 1.6, 0, TAU);
      ctx.fillStyle = metalRadial(ctx, c - 6, c + s * 8.5, 1.6, 'copper');
      ctx.fill();
      ink(ctx, 0.4);
    }
    // gun barrel
    cylinder(ctx, c + 3, c, c + 11.5, c, 2, 1.7, 'iron', { ink: 0.45 });
    // body
    gear(ctx, c, c, 6.8, 12, { kind: 'brass', toothDepth: 1, hole: 0, outline: 0.6 });
    ctx.beginPath();
    ctx.arc(c, c, 5, 0, TAU);
    ctx.fillStyle = metalRadial(ctx, c, c, 5, 'brass', { spec: 0.6 });
    ctx.fill();
    ink(ctx, 0.5);
    // aether eye
    glow(ctx, c + 3.4, c, 3, AETHER, 0.9);
    ctx.beginPath();
    ctx.arc(c + 3.4, c, 1.3, 0, TAU);
    ctx.fillStyle = '#e8ffff';
    ctx.fill();
    ink(ctx, 0.35);
    // rotor
    propeller(ctx, c - 0.8, c, 7.6, 2, frame * (Math.PI / 2) + 0.4, { blur: 0.7, kind: 'brass', width: 0.24 });
    void h;
    void w;
  },
  { frames: 2 }
);

// =============================================================================================
// Enemy ordnance — the hot family
// =============================================================================================

reg('eb_orb', 16, 16, (ctx) => {
  hotOrb(ctx, 8, 8, 5.4, { body: E_RED, core: E_CORE, rim: E_RIM, halo: 1.48 });
});

reg('eb_shell', 18, 12, (ctx) => {
  glowEllipse(ctx, 9, 6, 9, 6, E_RED, 0.55);
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(2.2, 2.4);
    ctx.lineTo(10.5, 2.4);
    ctx.quadraticCurveTo(17, 3, 17.2, 6);
    ctx.quadraticCurveTo(17, 9, 10.5, 9.6);
    ctx.lineTo(2.2, 9.6);
    ctx.quadraticCurveTo(1.2, 6, 2.2, 2.4);
    ctx.closePath();
  };
  body();
  ctx.fillStyle = E_RIM;
  ctx.fill();
  ctx.save();
  ctx.translate(1, 6);
  ctx.scale(0.86, 0.72);
  ctx.translate(-1, -6);
  body();
  ctx.restore();
  const g = ctx.createLinearGradient(2, 0, 17, 0);
  g.addColorStop(0, darken(E_RED, 0.1));
  g.addColorStop(0.6, '#ff7a2f');
  g.addColorStop(1, E_CORE);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(11.2, 5.6, 4.2, 1.3, 0, 0, TAU);
  ctx.fillStyle = '#fff6ea';
  ctx.fill();
});

reg('eb_needle', 20, 6, (ctx) => {
  glowEllipse(ctx, 10, 3, 10, 3, E_MAG, 0.55);
  polygon(ctx, [[19.6, 3], [6, 0.7], [0.6, 3], [6, 5.3]]);
  ctx.fillStyle = '#2e0418';
  ctx.fill();
  polygon(ctx, [[18.2, 3], [6.4, 1.5], [2.2, 3], [6.4, 4.5]]);
  const g = ctx.createLinearGradient(2, 0, 18, 0);
  g.addColorStop(0, darken(E_MAG, 0.2));
  g.addColorStop(1, '#ff8fc0');
  ctx.fillStyle = g;
  ctx.fill();
  polygon(ctx, [[16.5, 3], [7, 2.4], [5, 3], [7, 3.6]]);
  ctx.fillStyle = '#fff0f7';
  ctx.fill();
});

reg('eb_spark', 14, 14, (ctx) => {
  glow(ctx, 7, 7, 7, E_MAG, 0.75);
  const rnd = seeded(31);
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + rnd() * 0.6;
    ctx.beginPath();
    ctx.moveTo(7, 7);
    for (let s = 1; s <= 3; s++) {
      const r = s * 2;
      const aa = a + (rnd() - 0.5) * 1;
      ctx.lineTo(7 + Math.cos(aa) * r, 7 + Math.sin(aa) * r);
    }
    ctx.strokeStyle = '#3a0620';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.strokeStyle = '#ffc2dd';
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
  hotOrb(ctx, 7, 7, 3.3, { body: E_MAG, core: '#ffd6ea', rim: '#2e0418', halo: 0 });
});

reg('eb_slag', 18, 18, (ctx) => {
  glow(ctx, 9, 9, 9, '#ff7a2f', 0.6);
  const rnd = seeded(13);
  const pts = [];
  const N = 11;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    const r = 5.4 + rnd() * 1.6 + (Math.cos(a) < -0.6 ? -0.8 : 0);
    pts.push([9 + Math.cos(a) * r * 1.08, 9 + Math.sin(a) * r]);
  }
  smoothPath(ctx, pts);
  ctx.fillStyle = '#2a0a04';
  ctx.fill();
  ctx.save();
  ctx.translate(9, 9);
  ctx.scale(0.82, 0.82);
  ctx.translate(-9, -9);
  smoothPath(ctx, pts);
  ctx.restore();
  const g = ctx.createRadialGradient(9.5, 8.5, 0.5, 9, 9, 6.5);
  g.addColorStop(0, '#fffbe0');
  g.addColorStop(0.3, '#ffd23f');
  g.addColorStop(0.65, '#ff7a1f');
  g.addColorStop(1, '#c42a10');
  ctx.fillStyle = g;
  ctx.fill();
  // dark crust plates with glowing cracks between them
  ctx.fillStyle = 'rgba(60,16,6,0.75)';
  for (const [x, y, r] of [[5.6, 11, 1.7], [12.4, 12.2, 1.5], [6.6, 6, 1.2], [12.6, 6.2, 1.1]]) {
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.2, r, 0.4, 0, TAU);
    ctx.fill();
  }
});

reg('eb_flak', 12, 12, (ctx) => {
  glow(ctx, 6, 6, 6, '#ff7a2f', 0.7);
  polygon(ctx, [[11, 6], [7.4, 2], [3.2, 2.6], [1, 6.4], [3.8, 9.8], [8, 9.4]]);
  ctx.fillStyle = E_RIM;
  ctx.fill();
  polygon(ctx, [[9.6, 6], [7, 3.2], [3.8, 3.6], [2.4, 6.3], [4.4, 8.6], [7.6, 8.3]]);
  const g = ctx.createRadialGradient(6, 6, 0, 6, 6, 4.4);
  g.addColorStop(0, '#fffbe8');
  g.addColorStop(0.4, '#ffc06a');
  g.addColorStop(1, '#ff5a1f');
  ctx.fillStyle = g;
  ctx.fill();
});

reg('eb_mortar', 20, 20, (ctx) => {
  const c = 10;
  // hot warning halo ring
  glow(ctx, c, c, 10, E_RED, 0.6);
  ctx.beginPath();
  ctx.arc(c, c, 8.4, 0, TAU);
  ctx.strokeStyle = alpha('#ff6a3a', 0.8);
  ctx.lineWidth = 1;
  ctx.stroke();
  // fins at the tail (-x)
  for (const s of [-1, 1]) {
    polygon(ctx, [[c - 3, c + s * 1.2], [c - 7.6, c + s * 2], [c - 8, c + s * 4.8], [c - 4.6, c + s * 4.4]]);
    ctx.fillStyle = metal(ctx, 0, 0, 20, 20, 'syndicate');
    ctx.fill();
    ink(ctx, 0.5);
  }
  ctx.beginPath();
  ctx.arc(c + 0.5, c, 5.6, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, c + 0.5, c, 5.6, 'gunmetal', { spec: 0.4 });
  ctx.fill();
  ink(ctx, 0.9);
  // glowing crimson band and fuse
  ctx.save();
  ctx.beginPath();
  ctx.arc(c + 0.5, c, 5.6, 0, TAU);
  ctx.clip();
  ctx.fillStyle = '#ff4d2e';
  ctx.fillRect(c - 0.4, c - 6, 1.6, 12);
  ctx.restore();
  glow(ctx, c + 5, c, 3.2, '#ffd2a0', 1);
  ctx.beginPath();
  ctx.arc(c + 5, c, 1.2, 0, TAU);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
});

reg('eb_bomb', 22, 22, (ctx) => {
  const c = 11;
  glow(ctx, c, c, 11, E_RED, 0.55);
  ctx.beginPath();
  ctx.arc(c, c, 7.4, 0, TAU);
  ctx.fillStyle = E_RIM;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(c, c, 6.6, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, c, c, 6.6, 'syndicate', { spec: 0.5 });
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = PAL.syndicate[2];
  for (const x of [c - 3.6, c + 1.8]) ctx.fillRect(x, c - 7, 1.8, 14);
  ctx.restore();
  rivetRing(ctx, c, c, 4.6, 8, 0.35, 'iron');
  // pulsing fuse eye
  glow(ctx, c, c, 4.5, '#ff3d2a', 1);
  ctx.beginPath();
  ctx.arc(c, c, 1.9, 0, TAU);
  ctx.fillStyle = '#ffd2a0';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(c, c, 0.9, 0, TAU);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
});

// keep helper imports tidy for future additions
void [lighten, gearPath, crystal];
