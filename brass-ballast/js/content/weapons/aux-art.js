// Procedural sprites for auxiliary hardware (WP18): hull-mounted coils, flak mounts, rocket
// pods, flank guns, mines, saws and soft additive textures. Registered once at import and baked
// by the sprite cache; nothing here runs per frame. Sprites face +x (DESIGN §4.14).

import { Sprites } from '../../gfx/sprites.js';
import {
  PAL,
  alpha,
  cylinder,
  cylinderGrad,
  dome,
  gear,
  glow,
  ink,
  metal,
  metalRadial,
  plate,
  polygon,
  ringMount,
  rivet,
  rivetRing,
  spike,
  cannon,
  hazardStripes,
} from '../../gfx/drawkit.js';

const TAU = Math.PI * 2;
const AETHER = PAL.aether?.[0] || '#7ff3ff';
const AETHER2 = PAL.aether?.[1] || '#33c9c0';

function reg(name, w, h, draw, extra = {}) {
  Sprites.register(name, { w, h, ...extra, draw });
}

// ---- Soft additive glows (white core → color → transparent) -------------------------------------

function glowTex(name, color, core = '#ffffff') {
  reg(
    name,
    32,
    32,
    (ctx) => {
      const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, core);
      g.addColorStop(0.16, color);
      g.addColorStop(0.42, alpha(color, 0.42));
      g.addColorStop(0.72, alpha(color, 0.1));
      g.addColorStop(1, alpha(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 32, 32);
    },
    { scale: 2 }
  );
}
glowTex('aux_glow_aether', AETHER);
glowTex('aux_glow_gold', '#ffcf4a', '#fff6d8');
glowTex('aux_glow_fire', '#ff8a2a', '#fff0c0');
glowTex('aux_glow_red', '#ff3d2e', '#ffd0c0');
glowTex('aux_glow_steam', '#e8f6ff', '#ffffff');

// ---- Steam ring texture (white; tinted only by alpha) ------------------------------------------

/** Soft donut with swirl streaks; drawn scaled to the aura radius (128 units ≈ radius 64). */
reg(
  'aux_steam_ring',
  128,
  128,
  (ctx) => {
    const c = 64;
    const g = ctx.createRadialGradient(c, c, 0, c, c, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.05)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.10)');
    g.addColorStop(0.78, 'rgba(255,255,255,0.42)');
    g.addColorStop(0.9, 'rgba(255,255,255,0.30)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    // Swirling wisps: deterministic arcs of varying radius & thickness.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    ctx.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const r = 26 + rnd() * 36;
      const a0 = rnd() * TAU;
      const span = 0.5 + rnd() * 1.1;
      ctx.beginPath();
      ctx.arc(c, c, r, a0, a0 + span);
      ctx.strokeStyle = `rgba(255,255,255,${(0.12 + rnd() * 0.22).toFixed(3)})`;
      ctx.lineWidth = 1.5 + rnd() * 4.5;
      ctx.stroke();
    }
    // Puffy clumps around the rim.
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU + rnd() * 0.3;
      const r = 50 + rnd() * 8;
      const x = c + Math.cos(a) * r;
      const y = c + Math.sin(a) * r;
      const pr = 5 + rnd() * 6;
      const pg = ctx.createRadialGradient(x, y, 0, x, y, pr);
      pg.addColorStop(0, 'rgba(255,255,255,0.35)');
      pg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(x, y, pr, 0, TAU);
      ctx.fill();
    }
  },
  { scale: 2 }
);

// ---- Tesla coil & Thunderhead dynamo (top-down) -------------------------------------------------

function coilRings(ctx, c, rs, width) {
  for (const r of rs) {
    ctx.beginPath();
    ctx.arc(c, c, r, 0, TAU);
    ctx.strokeStyle = '#3a1c0c';
    ctx.lineWidth = width + 0.8;
    ctx.stroke();
    const g = ctx.createLinearGradient(c - r, c - r, c + r, c + r);
    g.addColorStop(0, '#ffd2a8');
    g.addColorStop(0.35, '#e39a62');
    g.addColorStop(0.75, '#b4643c');
    g.addColorStop(1, '#6e3a1f');
    ctx.strokeStyle = g;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

reg('aux_tesla', 22, 22, (ctx) => {
  const c = 11;
  ringMount(ctx, c, c, 9.6, { kind: 'brass', table: 'iron', bolts: 8 });
  coilRings(ctx, c, [7.4, 5.6, 3.9], 1.3);
  // insulator prongs
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU - Math.PI / 2;
    cylinder(ctx, c + Math.cos(a) * 3, c + Math.sin(a) * 3, c + Math.cos(a) * 8.6, c + Math.sin(a) * 8.6, 1.1, 0.8, 'bone', { ink: 0.35 });
  }
  glow(ctx, c, c, 6, AETHER, 0.55);
  ctx.beginPath();
  ctx.arc(c, c, 2.9, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, c, c, 2.9, 'brass', { spec: 0.8 });
  ctx.fill();
  ink(ctx, 0.5);
  ctx.beginPath();
  ctx.arc(c - 0.8, c - 0.8, 0.9, 0, TAU);
  ctx.fillStyle = '#fffbe6';
  ctx.fill();
});

reg('aux_dynamo', 32, 32, (ctx) => {
  const c = 16;
  ringMount(ctx, c, c, 14, { kind: 'gold', table: 'blackiron', bolts: 12 });
  // four lightning-rod prongs with aether lamps
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const x1 = c + Math.cos(a) * 14.5;
    const y1 = c + Math.sin(a) * 14.5;
    cylinder(ctx, c + Math.cos(a) * 5, c + Math.sin(a) * 5, x1, y1, 2, 1.2, 'copper', { ink: 0.45 });
    glow(ctx, x1, y1, 3.4, AETHER, 0.9);
    ctx.beginPath();
    ctx.arc(x1, y1, 1.3, 0, TAU);
    ctx.fillStyle = '#e8ffff';
    ctx.fill();
    ink(ctx, 0.35);
  }
  coilRings(ctx, c, [10.5, 8.6, 6.8], 1.5);
  // glass storm-globe
  glow(ctx, c, c, 9, AETHER, 0.8);
  ctx.beginPath();
  ctx.arc(c, c, 5.2, 0, TAU);
  const g = ctx.createRadialGradient(c - 1.6, c - 1.6, 0.5, c, c, 5.2);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, '#c8fdff');
  g.addColorStop(1, alpha(AETHER2, 0.85));
  ctx.fillStyle = g;
  ctx.fill();
  ink(ctx, 0.6);
  // little bolt etched in the globe
  polygon(ctx, [
    [c + 0.6, c - 3.4],
    [c - 1.6, c + 0.4],
    [c + 0.2, c + 0.4],
    [c - 0.8, c + 3.4],
    [c + 1.8, c - 0.6],
    [c, c - 0.6],
  ]);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
});

// ---- Flak mounts (pivot at the turntable) ------------------------------------------------------

reg(
  'aux_flak',
  26,
  16,
  (ctx) => {
    const cx = 8;
    const cy = 8;
    ringMount(ctx, cx, cy, 7, { kind: 'brass', table: 'iron', bolts: 7 });
    for (const s of [-1, 1]) {
      cylinder(ctx, cx + 2, cy + s * 2.6, cx + 16.5, cy + s * 2.6, 2.4, 2, 'iron', { ink: 0.5 });
      // perforated jacket band & muzzle brake
      cylinder(ctx, cx + 9, cy + s * 2.6, cx + 11, cy + s * 2.6, 3, 3, 'brass', { ink: 0.4 });
      cylinder(ctx, cx + 15.2, cy + s * 2.6, cx + 17.4, cy + s * 2.6, 3.1, 3.1, 'gunmetal', { ink: 0.45 });
    }
    // armoured cupola with gunner's slit
    dome(ctx, cx, cy, 4.6, 'iron', { rivets: 6 });
    ctx.fillStyle = '#140d07';
    ctx.fillRect(cx + 1.4, cy - 1.8, 1.2, 3.6);
    glow(ctx, cx + 2, cy, 1.6, '#ffcf6a', 0.6);
  },
  { cx: 8, cy: 8 }
);

reg(
  'aux_flak_heavy',
  32,
  20,
  (ctx) => {
    const cx = 10;
    const cy = 10;
    ringMount(ctx, cx, cy, 9, { kind: 'gold', table: 'blackiron', bolts: 10 });
    for (const oy of [-4.6, -1.6, 1.6, 4.6]) {
      cylinder(ctx, cx + 2, cy + oy, cx + 20, cy + oy, 2.3, 1.9, 'blackiron', { ink: 0.45 });
      cylinder(ctx, cx + 18.8, cy + oy, cx + 21, cy + oy, 2.8, 2.8, 'gold', { ink: 0.4 });
    }
    cylinder(ctx, cx + 10, cy - 6.4, cx + 10, cy + 6.4, 2.2, 2.2, 'gold', { ink: 0.45 });
    dome(ctx, cx, cy, 5.8, 'gunmetal', { rivets: 8 });
    ctx.fillStyle = '#140d07';
    ctx.fillRect(cx + 2, cy - 2.4, 1.4, 4.8);
    glow(ctx, cx + 2.6, cy, 2.4, '#ffb347', 0.8);
    gear(ctx, cx - 1.6, cy, 2.2, 8, { kind: 'gold', hole: 0.6, toothDepth: 0.6, outline: 0.4 });
  },
  { cx: 10, cy: 10 }
);

// ---- Rocket pods (frame 0 loaded, frame 1 empty) -----------------------------------------------

function podBody(ctx, w, h, tubes, kind, loaded, hot) {
  plate(ctx, 1, 1, w - 4, h - 2, 2.4, kind, { ink: 0.8, bevel: 0.7 });
  const rows = tubes.length;
  for (let i = 0; i < rows; i++) {
    const ty = tubes[i];
    cylinder(ctx, 3, ty, w - 1.2, ty, 3.2, 3.2, 'gunmetal', { ink: 0.45 });
    ctx.beginPath();
    ctx.ellipse(w - 1.2, ty, 0.9, 1.5, 0, 0, TAU);
    ctx.fillStyle = '#0d0905';
    ctx.fill();
    if (loaded) {
      ctx.beginPath();
      ctx.ellipse(w - 1.3, ty, 1.2, 1.3, 0, 0, TAU);
      ctx.fillStyle = metalRadial(ctx, w - 1.6, ty, 1.4, hot ? 'crimson' : 'oxblood', { spec: 0.8 });
      ctx.fill();
      ink(ctx, 0.3);
    }
  }
  rivet(ctx, 3, 2.6, 0.45);
  rivet(ctx, 3, h - 2.6, 0.45);
  if (hot) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(2, h / 2 - 0.9, 5, 1.8);
    ctx.clip();
    hazardStripes(ctx, 2, h / 2 - 0.9, 5, 1.8, { stripe: 0.8, ink: 0 });
    ctx.restore();
  }
}

reg('aux_pod', 18, 12, (ctx, w, h, frame) => podBody(ctx, w, h, [3.8, 8.2], 'bronze', frame === 0, false), {
  frames: 2,
  cx: 7,
  cy: 6,
});
reg('aux_pod_hell', 22, 16, (ctx, w, h, frame) => podBody(ctx, w, h, [3.4, 6.5, 9.5, 12.6], 'blackiron', frame === 0, true), {
  frames: 2,
  cx: 8,
  cy: 8,
});

// ---- Flank guns (pivot at the breech) ----------------------------------------------------------

reg(
  'aux_gun',
  17,
  8,
  (ctx) => {
    plate(ctx, 0.5, 1, 5.5, 6, 1.2, 'wood', { ink: 0.6 });
    cannon(ctx, 3.2, 4, 13, 5, 'iron', { bands: [0.2, 0.55], taper: 0.8 });
  },
  { cx: 3, cy: 4 }
);

reg(
  'aux_gun_heavy',
  22,
  10,
  (ctx) => {
    plate(ctx, 0.5, 1, 7, 8, 1.4, 'darkwood', { ink: 0.7 });
    cannon(ctx, 4.2, 5, 17, 6.6, 'blackiron', { bands: [0.16, 0.42, 0.7], taper: 0.82 });
    for (const x of [4.2 + 17 * 0.16, 4.2 + 17 * 0.7]) {
      ctx.fillStyle = cylinderGrad(ctx, 0, 1.6, 0, 8.4, 'gold');
      ctx.fillRect(x - 0.7, 1.7, 1.4, 6.6);
    }
  },
  { cx: 4, cy: 5 }
);

// ---- Mine chute (stern) ------------------------------------------------------------------------

reg('aux_chute', 14, 12, (ctx) => {
  plate(ctx, 1, 1, 12, 10, 2, 'iron', { ink: 0.8, bevel: 0.6 });
  ctx.save();
  ctx.beginPath();
  ctx.rect(2.2, 2.2, 3, 7.6);
  ctx.clip();
  hazardStripes(ctx, 2.2, 2.2, 3, 7.6, { stripe: 1.1, ink: 0 });
  ctx.restore();
  ctx.beginPath();
  ctx.arc(8.4, 6, 3, 0, TAU);
  ctx.fillStyle = '#120c06';
  ctx.fill();
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = metal(ctx, 5, 3, 12, 9, 'brass');
  ctx.stroke();
  rivetRing(ctx, 8.4, 6, 3.9, 6, 0.35, 'brass');
});

// ---- Devil's mine (spiky black with red runes) -------------------------------------------------

reg('aux_devil_mine', 24, 24, (ctx) => {
  const c = 12;
  glow(ctx, c, c, 12, '#ff3d2e', 0.35);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    spike(ctx, c + Math.cos(a) * 5.6, c + Math.sin(a) * 5.6, 5.4, 2.4, a, 'blackiron');
  }
  ctx.beginPath();
  ctx.arc(c, c, 7, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, c, c, 7, 'blackiron', { spec: 0.5 });
  ctx.fill();
  ink(ctx, 0.9);
  // rune ring
  ctx.beginPath();
  ctx.arc(c, c, 4.9, 0, TAU);
  ctx.strokeStyle = 'rgba(255,61,46,0.85)';
  ctx.lineWidth = 0.7;
  ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.2;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * 4.2, c + Math.sin(a) * 4.2);
    ctx.lineTo(c + Math.cos(a + 0.35) * 5.8, c + Math.sin(a + 0.35) * 5.8);
    ctx.strokeStyle = '#ff6a4a';
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
  rivetRing(ctx, c, c, 6.2, 10, 0.35, 'gold', 0.1);
  glow(ctx, c, c, 3.6, '#ff3d2e', 0.95);
  ctx.beginPath();
  ctx.arc(c, c, 1.5, 0, TAU);
  ctx.fillStyle = '#ffd0c0';
  ctx.fill();
});

// ---- Grand buzzsaw (gold-toothed, aether hub) --------------------------------------------------

reg('aux_halo_saw', 48, 48, (ctx) => {
  const c = 24;
  const R = 23;
  ctx.beginPath();
  ctx.arc(c, c, R - 0.5, 0, TAU);
  ctx.strokeStyle = 'rgba(255,207,74,0.3)';
  ctx.lineWidth = 2;
  ctx.stroke();
  const T = 20;
  ctx.beginPath();
  for (let i = 0; i < T; i++) {
    const a0 = (i / T) * TAU;
    const a1 = ((i + 0.6) / T) * TAU;
    const a2 = ((i + 1) / T) * TAU;
    const r0 = R - 5;
    const x0 = c + Math.cos(a0) * r0;
    const y0 = c + Math.sin(a0) * r0;
    const x1 = c + Math.cos(a1) * R;
    const y1 = c + Math.sin(a1) * R;
    const x2 = c + Math.cos(a2) * r0;
    const y2 = c + Math.sin(a2) * r0;
    if (i === 0) ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x1 + (x2 - x1) * 0.18, y1 + (y2 - y1) * 0.18);
    ctx.lineTo(x2, y2);
  }
  ctx.closePath();
  ctx.fillStyle = metal(ctx, 0, 0, 48, 48, 'gold', { polish: true });
  ctx.fill();
  ink(ctx, 1);
  ctx.beginPath();
  ctx.arc(c, c, R - 5.6, 0, TAU);
  ctx.fillStyle = metal(ctx, 4, 4, 44, 44, 'steel', { polish: true });
  ctx.fill();
  ink(ctx, 0.7);
  // lightening windows
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.4;
    ctx.beginPath();
    ctx.arc(c, c, 12.5, a, a + 0.75);
    ctx.arc(c, c, 8.4, a + 0.75, a, true);
    ctx.closePath();
    ctx.fillStyle = 'rgba(16,14,20,0.85)';
    ctx.fill();
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = 'rgba(255,240,200,0.4)';
    ctx.stroke();
  }
  gear(ctx, c, c, 7, 10, { kind: 'gold', hole: 0, toothDepth: 1.3, outline: 0.6 });
  glow(ctx, c, c, 5.5, AETHER, 0.9);
  ctx.beginPath();
  ctx.arc(c, c, 2.4, 0, TAU);
  ctx.fillStyle = '#e8ffff';
  ctx.fill();
  ink(ctx, 0.45);
  ctx.beginPath();
  ctx.arc(c, c, R - 6.2, Math.PI * 1.05, Math.PI * 1.5);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1;
  ctx.stroke();
});
