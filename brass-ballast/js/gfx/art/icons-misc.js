// Workshop, mode and generic glyphs (WP5).
//   Workshop glyphs sit on a dark wood plaque (bright metals read best).
//   Mode glyphs are bold emblems on a coloured enamel field (`field` per mode).
//   Generic glyphs are free-standing objects for HUD/UI chrome (no frame).

import {
  TAU, INKC, P, R, body, line, detail, fill, glow, glint, at, cannonball, cloud, speedLines,
  horseshoe, hammer, watch, dial, sparkle, cog, rivet, airship, bigStar, barrel, boltShape,
} from './icons-kit.js';

// ---------------------------------------------------------------------------------------------
// Workshop (wood plaque)

function hullPlating(ctx) {
  // gondola hull side with riveted plates
  const hull = P.custom((c) => {
    c.moveTo(12, 24);
    c.lineTo(52, 24);
    c.lineTo(48, 34);
    c.quadraticCurveTo(42, 46, 32, 46);
    c.quadraticCurveTo(22, 46, 16, 34);
    c.closePath();
  });
  body(ctx, hull, 'steel', { d: 2.2, hi: 1.4 });
  ctx.save();
  hull(ctx);
  ctx.clip();
  for (const x of [22, 32, 42]) detail(ctx, P.custom((c) => { c.moveTo(x, 24); c.lineTo(x + (x - 32) * 0.15, 47); }), R.steel[2], 1);
  detail(ctx, P.custom((c) => { c.moveTo(12, 34); c.lineTo(52, 34); }), R.steel[2], 1);
  ctx.restore();
  for (const [y, w] of [[27, 38], [37, 28]]) {
    for (let x = 32 - w / 2 + 2; x <= 32 + w / 2 - 2; x += 4.5) rivet(ctx, x, y, 0.95, 'brass');
  }
  body(ctx, P.rect(10, 20.5, 44, 4.5, 1.2), 'brass', { d: 0.8, hi: 0.8 });
  // fresh plate being riveted on
  at(ctx, 41, 15, 0.2, 1, (c) => body(c, P.rect(-7, -5, 14, 10, 1.4), 'brass', { d: 1, hi: 0.9 }));
  sparkle(ctx, 49, 11, 2.6, '#fff6c0', { glowColor: '#ffcf4a' });
  rivet(ctx, 36, 13, 1.1, 'iron');
  rivet(ctx, 45, 16, 1.1, 'iron');
}

function engines(ctx) {
  // motion arcs
  for (const [a0, a1] of [[-2.5, -1.3], [0.6, 1.8]]) {
    line(ctx, P.custom((c) => c.arc(32, 32, 21, a0, a1)), '#ffe9b0', 1.6, { out: 0.8 });
  }
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i / 3) * TAU + 0.25;
    at(ctx, 32, 32, a, 1, (c) => {
      body(c, P.custom((p) => {
        p.moveTo(3, -2);
        p.quadraticCurveTo(12, -7.5, 19, -4.5);
        p.quadraticCurveTo(20.5, 0, 18, 3);
        p.quadraticCurveTo(10, 4.5, 3, 2);
        p.closePath();
      }), 'brass', { d: 1.4, hi: 1.1 });
      body(c, P.custom((p) => {
        p.moveTo(15.6, -5.6);
        p.quadraticCurveTo(20.5, -5, 19.6, 0);
        p.quadraticCurveTo(19, 2.4, 17.4, 3.1);
        p.closePath();
      }), 'oxblood', { d: 0.4, hi: 0, out: 1.2 });
    });
  }
  body(ctx, P.circle(32, 32, 5.4), 'copper', { d: 1.2, hi: 1 });
  fill(ctx, P.circle(32, 32, 1.8), INKC);
}

function gunnery(ctx) {
  for (const [x, y] of [[20, 45], [32, 45], [44, 45], [26, 34.5], [38, 34.5], [32, 24]]) cannonball(ctx, x, y, 6.2);
  sparkle(ctx, 44, 18, 2.8, '#fff6c0', { glowColor: '#ffcf4a' });
  body(ctx, P.rect(12, 50, 40, 4, 1), 'brass', { d: 0.6, hi: 0.6, out: 1.6 });
}

function boilerworks(ctx) {
  // feed pipes
  line(ctx, P.custom((c) => { c.moveTo(10, 47); c.lineTo(20, 47); }), R.copper[1], 4.6, { out: 1.4, hiColor: R.copper[0] });
  line(ctx, P.custom((c) => { c.moveTo(44, 47); c.lineTo(54, 47); }), R.copper[1], 4.6, { out: 1.4, hiColor: R.copper[0] });
  body(ctx, P.rect(18, 43, 28, 8, 2), 'brass', { d: 1, hi: 0.8 });
  dial(ctx, 32, 29, 15, 0.9);
  cloud(ctx, 50, 17, [[0, 0, 3.6], [3, -3, 2.8]], 'smoke', { out: 1.4 });
}

function magnetics(ctx) {
  // electromagnet: U core with copper windings
  at(ctx, 32, 22, 0, 1, (c) => horseshoe(c, 1.05, { ramp: 'iron', tips: 'steel' }));
  for (const s of [-1, 1]) {
    body(ctx, P.rect(32 + s * 8 - 4.6, 21, 9.2, 9, 1.4), 'copper', { d: 1, hi: 0.8, out: 1.6 });
    for (let y = 23; y < 30; y += 2) detail(ctx, P.custom((c) => { c.moveTo(32 + s * 8 - 4.4, y); c.lineTo(32 + s * 8 + 4.4, y + 0.6); }), R.copper[2], 0.8);
  }
  // arc between the poles + pulled cog
  glow(ctx, 32, 40, 9, '#7ff3ff', 0.7);
  line(ctx, P.custom((c) => { c.moveTo(23, 38); c.lineTo(27, 41); c.lineTo(30, 37.5); c.lineTo(34, 41.5); c.lineTo(37, 38); c.lineTo(41, 38.5); }), '#bff9ff', 1.6, { out: 1 });
  cog(ctx, 32, 49, 5.8, 9, { out: 1.4 });
}

function salvage(ctx) {
  // crane cable + hook hauling a cog out of the scrap
  line(ctx, P.custom((c) => { c.moveTo(32, 8); c.lineTo(32, 20); }), R.iron[1], 1.8, { out: 1, dash: [2.2, 1.2] });
  body(ctx, P.rect(28.5, 18, 7, 5, 1.2), 'brass', { d: 0.8, hi: 0, out: 1.6 });
  line(ctx, P.custom((c) => {
    c.moveTo(32, 23);
    c.lineTo(32, 27);
    c.arc(28.5, 28, 3.6, -0.2, Math.PI * 0.95);
  }), R.steel[1], 2.6, { out: 1.2 });
  cog(ctx, 33, 41, 11, 11, { rot: 0.2, spokes: 5, hole: 2.6 });
  // scrap
  body(ctx, P.poly([[10, 54], [15, 47], [21, 50], [19, 54]]), 'iron', { d: 0.6, hi: 0, out: 1.4 });
  body(ctx, P.poly([[45, 54], [48, 46], [55, 49], [54, 54]]), 'copper', { d: 0.6, hi: 0, out: 1.4 });
}

function ballastRack(ctx) {
  body(ctx, P.rect(10, 15, 44, 5, 1.4), 'brass', { d: 0.8, hi: 0.8 });
  for (const x of [12.5, 51.5]) rivet(ctx, x, 17.5, 1.2, 'iron');
  for (const x of [20, 32, 44]) {
    line(ctx, P.custom((c) => { c.moveTo(x, 20); c.lineTo(x, 27); }), R.iron[1], 1.8, { out: 0.9 });
    body(ctx, P.rect(x - 3, 26, 6, 3.4, 1), 'brass', { d: 0.5, hi: 0, out: 1.4 });
    cannonball(ctx, x, 38, 8, 'blackiron');
    body(ctx, P.rect(x - 1.5, 44.6, 3, 5, 0.6), 'red', { d: 0.4, hi: 0, out: 1.2 });
  }
}

function rerolls(ctx) {
  const die = (x, y, a, pips, kind) =>
    at(ctx, x, y, a, 1, (c) => {
      body(c, P.rect(-9.5, -9.5, 19, 19, 4), kind, { d: 2, hi: 1.3 });
      for (const [px, py] of pips) fill(c, P.circle(px, py, 2), '#2b1d10');
    });
  die(23, 37, -0.3, [[-5, -5], [0, 0], [5, 5]], 'bone');
  die(41, 26, 0.35, [[-5, -5], [5, -5], [-5, 5], [5, 5], [0, 0]], 'bone');
  // reroll arrow
  line(ctx, P.custom((c) => c.arc(32, 32, 19.5, 1.4, 2.6)), '#ffcf4a', 2, { out: 1 });
  at(ctx, 32 + Math.cos(2.6) * 19.5, 32 + Math.sin(2.6) * 19.5, 2.6 + Math.PI / 2, 1, (c) =>
    body(c, P.poly([[4, 0], [-1.6, -3.4], [-1.6, 3.4]]), 'gold', { flat: true, out: 1.1 }),
  );
}

function emergencyBalloon(ctx) {
  // ropes
  detail(ctx, P.custom((c) => { c.moveTo(22, 34); c.lineTo(27, 44); c.moveTo(42, 34); c.lineTo(37, 44); }), '#e8d4a8', 1.2);
  // basket
  body(ctx, P.custom((c) => { c.moveTo(25, 43); c.lineTo(39, 43); c.lineTo(37, 52); c.lineTo(27, 52); c.closePath(); }), 'wood', { d: 1, hi: 0.8 });
  detail(ctx, P.custom((c) => { c.moveTo(26, 47); c.lineTo(38, 47); }), R.wood[2], 1);
  // striped balloon
  const env = P.custom((c) => {
    c.moveTo(32, 10);
    c.bezierCurveTo(47, 10, 49, 27, 40, 35);
    c.lineTo(24, 35);
    c.bezierCurveTo(15, 27, 17, 10, 32, 10);
    c.closePath();
  });
  body(ctx, env, 'cream', { d: 2.2, hi: 1.4 });
  ctx.save();
  env(ctx);
  ctx.clip();
  for (const [x0, x1] of [[-7, -2.5], [2.5, 7]]) {
    fill(ctx, P.custom((c) => {
      c.moveTo(32 + x0 * 0.4, 9);
      c.quadraticCurveTo(32 + x0 * 2.6, 22, 32 + x0 * 1.1, 36);
      c.lineTo(32 + x1 * 1.1, 36);
      c.quadraticCurveTo(32 + x1 * 2.6, 22, 32 + x1 * 0.4, 9);
      c.closePath();
    }), R.red[1], 0.9);
  }
  ctx.restore();
  env(ctx);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = INKC;
  ctx.stroke();
  // red cross badge
  body(ctx, P.circle(32, 22, 5.4), 'white', { d: 0.8, hi: 0, out: 1.4 });
  fill(ctx, P.rect(30.6, 18.4, 2.8, 7.2, 0.4), R.red[1]);
  fill(ctx, P.rect(28.4, 20.6, 7.2, 2.8, 0.4), R.red[1]);
}

function fortune(ctx) {
  at(ctx, 32, 30, Math.PI, 1.15, (c) => horseshoe(c, 1, { ramp: 'gold', tips: 'gold' }));
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.15 + (i / 6) * 0.7);
    fill(ctx, P.circle(32 + Math.cos(a) * 9.8, 30 + Math.sin(a) * 9.8, 0.9), '#7a5420');
  }
  sparkle(ctx, 15, 16, 3.4, '#fff6c0', { glowColor: '#ffcf4a' });
  sparkle(ctx, 49, 14, 2.6, '#fff6c0', { glowColor: '#ffcf4a' });
  sparkle(ctx, 50, 46, 2.2, '#fff6c0', { glowColor: '#ffcf4a' });
}

function armorPlate(ctx) {
  // anvil
  body(ctx, P.custom((c) => {
    c.moveTo(10, 34);
    c.quadraticCurveTo(14, 34, 18, 36);
    c.lineTo(48, 36);
    c.lineTo(48, 41);
    c.lineTo(41, 42);
    c.lineTo(41, 47);
    c.lineTo(47, 52);
    c.lineTo(19, 52);
    c.lineTo(25, 47);
    c.lineTo(25, 42);
    c.quadraticCurveTo(16, 41, 10, 34);
    c.closePath();
  }), 'blackiron', { d: 1.8, hi: 1.2 });
  // glowing plate on the anvil
  glow(ctx, 34, 32, 12, '#ff8a2a', 0.6);
  body(ctx, P.rect(21, 29, 25, 6, 1.4), ['#fff6b0', '#ff9b2f', '#c0401a'], { d: 1, hi: 0.8 });
  // hammer mid-strike
  at(ctx, 41, 17, 0.9, 1, (c) => hammer(c, 22));
  for (const [x, y] of [[23, 23], [18, 27], [30, 22]]) sparkle(ctx, x, y, 2, '#fff3c4', { glowColor: '#ff9b2f', out: 0.6 });
}

function aetherAttunement(ctx) {
  // resonance rings
  for (const r of [9, 13, 17]) {
    line(ctx, P.custom((c) => c.arc(32, 26, r, Math.PI * 1.15, Math.PI * 1.85)), '#7ff3ff', 1.3, { out: 0.7 });
  }
  glow(ctx, 32, 22, 12, '#7ff3ff', 0.6);
  // tuning fork
  body(ctx, P.custom((c) => {
    c.moveTo(25, 14);
    c.lineTo(28.4, 14);
    c.lineTo(28.4, 32);
    c.quadraticCurveTo(32, 35, 35.6, 32);
    c.lineTo(35.6, 14);
    c.lineTo(39, 14);
    c.lineTo(39, 32);
    c.quadraticCurveTo(39, 39, 33.8, 40);
    c.lineTo(33.8, 52);
    c.lineTo(30.2, 52);
    c.lineTo(30.2, 40);
    c.quadraticCurveTo(25, 39, 25, 32);
    c.closePath();
  }), 'brass', { d: 1.4, hi: 1.1 });
  body(ctx, P.poly([[32, 18], [35, 23], [32, 29], [29, 23]]), 'aether', { d: 0.8, hi: 0.6, out: 1.4 });
  body(ctx, P.rect(28.5, 47, 7, 7, 1.6), 'wood', { d: 0.6, hi: 0, out: 1.5 });
}

export const WORKSHOP_GLYPHS = {
  hullPlating, engines, gunnery, boilerworks, magnetics, salvage, ballastRack, rerolls,
  emergencyBalloon, fortune, armorPlate, aetherAttunement,
};

// ---------------------------------------------------------------------------------------------
// Modes (emblems)

function compassRose(ctx, x, y, r) {
  body(ctx, P.star(x, y, r * 0.75, r * 0.2, 4, Math.PI / 4), 'bronze', { d: 0.8, hi: 0, out: 1.4 });
  body(ctx, P.star(x, y, r, r * 0.2, 4, -Math.PI / 2), 'gold', { d: 1.2, hi: 0.8, out: 1.6 });
  fill(ctx, P.poly([[x, y - r], [x + r * 0.2, y], [x, y]]), '#fff6c0', 0.8);
}

function campaign(ctx) {
  compassRose(ctx, 32, 32, 21);
  airship(ctx, 33, 31, 1.05, { env: 'canvas', trim: 'oxblood' });
}

function endless(ctx) {
  // infinity loop of brass pipe with gale swirls
  const inf = P.custom((c) => {
    c.moveTo(32, 32);
    c.bezierCurveTo(38, 22, 52, 22, 52, 32);
    c.bezierCurveTo(52, 42, 38, 42, 32, 32);
    c.bezierCurveTo(26, 22, 12, 22, 12, 32);
    c.bezierCurveTo(12, 42, 26, 42, 32, 32);
  });
  line(ctx, inf, R.brass[1], 5.4, { out: 1.6, hiColor: R.brass[0] });
  for (const [x, y] of [[27, 16], [41, 49]]) {
    cloud(ctx, x, y, [[-3, 0.5, 2.6], [0, -1, 3.4], [3.2, 0.6, 2.4]], 'smoke', { out: 1.3 });
  }
  airship(ctx, 32, 31, 0.5, { env: 'canvas', trim: 'oxblood' });
}

function daily(ctx) {
  // calendar sheet
  body(ctx, P.rect(15, 16, 34, 34, 3), 'cream', { d: 1.8, hi: 1.2 });
  body(ctx, P.rect(15, 16, 34, 9, [3, 3, 0, 0]), 'red', { d: 1, hi: 0.7 });
  for (const x of [22, 42]) body(ctx, P.rect(x - 1.5, 12, 3, 7, 1.4), 'brass', { d: 0.5, hi: 0, out: 1.3 });
  // sun + storm cloud in the page
  glow(ctx, 27, 34, 8, '#ffcf4a', 0.6);
  body(ctx, P.star(27, 34, 8, 5, 10, 0), 'gold', { d: 0.8, hi: 0, out: 1.3 });
  body(ctx, P.circle(27, 34, 4.6), 'gold', { d: 1, hi: 0.7, out: 1.3 });
  cloud(ctx, 36.5, 39, [[-4, 1, 4], [0, -2, 5], [5, 1, 3.8], [1, 3, 4]], ['#ffffff', '#c3cad4', '#6e7888'], { out: 1.6 });
  boltShape(ctx, 37, 47, 4.4, 'gold', { out: 1.3 });
}

function bossRush(ctx) {
  for (const s of [-1, 1]) {
    at(ctx, 32 - s * 14, 46, s > 0 ? -0.78 : Math.PI + 0.78, 1, (c) => barrel(c, 34, 8, 6.5, { kind: 'iron', bands: [0.35, 0.65] }));
  }
  // iron skull with crimson eyes
  body(ctx, P.custom((c) => {
    c.moveTo(20, 30);
    c.bezierCurveTo(20, 14, 44, 14, 44, 30);
    c.quadraticCurveTo(44, 36, 40, 38);
    c.lineTo(39, 44);
    c.lineTo(25, 44);
    c.lineTo(24, 38);
    c.quadraticCurveTo(20, 36, 20, 30);
    c.closePath();
  }), 'steel', { d: 2.2, hi: 1.4 });
  for (const s of [-1, 1]) {
    body(ctx, P.custom((c) => { c.ellipse(32 + s * 5.6, 30, 4.4, 3.6, s * 0.3, 0, TAU); }), ['#3a0a06', '#1a0604', '#000000'], { flat: true, out: 1.2 });
    glow(ctx, 32 + s * 5.6, 30, 5, '#ff3d2a', 0.8);
    fill(ctx, P.circle(32 + s * 5.6, 30, 1.6), '#ffd2a0');
  }
  body(ctx, P.poly([[32, 34], [34, 38], [30, 38]]), ['#1a0604', '#1a0604', '#1a0604'], { flat: true, out: 1 });
  for (const x of [27.5, 30.5, 33.5, 36.5]) detail(ctx, P.custom((c) => { c.moveTo(x, 40); c.lineTo(x, 44); }), INKC, 1);
  for (const x of [23, 41]) rivet(ctx, x, 24, 1.1, 'iron');
  // crown spikes
  for (const x of [25, 32, 39]) body(ctx, P.poly([[x - 2.6, 18 + Math.abs(x - 32) * 0.15], [x, 10 + Math.abs(x - 32) * 0.3], [x + 2.6, 18 + Math.abs(x - 32) * 0.15]]), 'crimson', { d: 0.6, hi: 0, out: 1.4 });
}

export const MODE_GLYPHS = {
  campaign: { field: ['#d0605a', '#7a2420', '#2e0c0a'], glyph: campaign },
  endless: { field: ['#6ab4c4', '#24566a', '#0c2230'], glyph: endless },
  daily: { field: ['#ffbf70', '#b0561e', '#401808'], glyph: daily },
  bossRush: { field: ['#6e5c5c', '#2a1c1c', '#0c0606'], glyph: bossRush },
};

// ---------------------------------------------------------------------------------------------
// Generic (free-standing)

function gCog(ctx) {
  cog(ctx, 32, 32, 25, 12, { spokes: 5, hole: 4.6, rot: 0.1 });
  glint(ctx, 22, 17, 3.2);
}

function gXp(ctx) {
  glow(ctx, 32, 32, 28, '#33c9c0', 0.55);
  const pts = [[32, 6], [45, 22], [40, 50], [32, 58], [24, 50], [19, 22]];
  body(ctx, P.poly(pts), 'aether', { d: 2.4, hi: 1.5 });
  fill(ctx, P.poly([[32, 6], [32, 58], [24, 50], [19, 22]]), '#ffffff', 0.25);
  detail(ctx, P.custom((c) => { c.moveTo(19, 22); c.lineTo(32, 28); c.lineTo(45, 22); c.moveTo(32, 28); c.lineTo(32, 58); }), '#14625f', 1.1, 0.7);
  sparkle(ctx, 26, 18, 4, '#ffffff', { glowColor: '#7ff3ff', out: 0.8 });
}

function gSkull(ctx) {
  body(ctx, P.custom((c) => {
    c.moveTo(13, 30);
    c.bezierCurveTo(13, 6, 51, 6, 51, 30);
    c.quadraticCurveTo(51, 38, 45, 41);
    c.lineTo(44, 50);
    c.quadraticCurveTo(32, 55, 20, 50);
    c.lineTo(19, 41);
    c.quadraticCurveTo(13, 38, 13, 30);
    c.closePath();
  }), 'bone', { d: 2.4, hi: 1.6 });
  for (const s of [-1, 1]) body(ctx, P.ellipse(32 + s * 8.5, 31, 6.4, 5.8, s * 0.25), ['#2b1d10', '#1a120a', '#000000'], { flat: true, out: 1.2 });
  body(ctx, P.poly([[32, 37], [35.5, 43], [28.5, 43]]), ['#1a120a', '#1a120a', '#1a120a'], { flat: true, out: 1 });
  for (const x of [25, 29.6, 34.4, 39]) detail(ctx, P.custom((c) => { c.moveTo(x, 45.5); c.lineTo(x, 51.5); }), INKC, 1.4);
  detail(ctx, P.custom((c) => { c.moveTo(38, 12); c.lineTo(35, 18); c.lineTo(38, 21); }), R.bone[2], 1.2);
}

function gBomb(ctx) {
  // fuse + spark
  line(ctx, P.custom((c) => { c.moveTo(39, 18); c.quadraticCurveTo(44, 9, 52, 11); }), '#d8b47a', 2.2, { out: 1 });
  glow(ctx, 52, 11, 9, '#ff9b2f', 0.8);
  sparkle(ctx, 52, 11, 5.5, '#fff6c0', { glowColor: '#ffb030' });
  body(ctx, P.rect(33, 15, 10, 8, 2), 'brass', { d: 0.8, hi: 0.7 });
  body(ctx, P.circle(29, 37, 20), 'blackiron', { d: 3.2, hi: 2 });
  glint(ctx, 20, 27, 5, 2.8);
  detail(ctx, P.custom((c) => c.arc(29, 37, 15, Math.PI * 0.1, Math.PI * 0.5)), '#6f6a66', 1.6, 0.6);
}

function gSteam(ctx) {
  cloud(ctx, 32, 34, [[-13, 6, 9], [-4, -4, 12], [10, -1, 10], [15, 9, 7.5], [2, 9, 10]], ['#ffffff', '#e2f6ff', '#86b9d4']);
  for (const [x, y] of [[17, 13], [47, 15]]) cloud(ctx, x, y, [[0, 0, 3.2]], ['#ffffff', '#e2f6ff', '#86b9d4'], { out: 1.4 });
}

function gHull(ctx) {
  airship(ctx, 35, 30, 1.32, { env: 'canvas', trim: 'oxblood' });
}

function gLock(ctx) {
  line(ctx, P.custom((c) => { c.moveTo(21, 30); c.lineTo(21, 21); c.arc(32, 21, 11, Math.PI, 0); c.lineTo(43, 30); }), R.steel[1], 5, { out: 1.8, hiColor: R.steel[0] });
  body(ctx, P.rect(13, 28, 38, 28, 5), 'brass', { d: 2.4, hi: 1.5 });
  for (const [x, y] of [[17, 32], [47, 32], [17, 52], [47, 52]]) rivet(ctx, x, y, 1.3, 'brass');
  body(ctx, P.custom((c) => {
    c.arc(32, 39, 4, Math.PI * 0.75, Math.PI * 2.25);
    c.lineTo(34.5, 49);
    c.lineTo(29.5, 49);
    c.closePath();
  }), ['#2b1d10', '#1a120a', '#000000'], { flat: true, out: 1 });
}

function gStar(ctx) {
  glow(ctx, 32, 33, 26, '#ffcf4a', 0.45);
  bigStar(ctx, 32, 34, 26);
}

function gClock(ctx) {
  watch(ctx, 32, 36, 21, { h1: -0.33, h2: 0.0 });
}

function gTrophy(ctx) {
  // handles
  for (const s of [-1, 1]) {
    line(ctx, P.custom((c) => { c.moveTo(32 + s * 11, 15); c.bezierCurveTo(32 + s * 23, 14, 32 + s * 22, 30, 32 + s * 9, 33); }), R.gold[1], 3.4, { out: 1.4, hiColor: R.gold[0] });
  }
  body(ctx, P.custom((c) => {
    c.moveTo(16, 10);
    c.lineTo(48, 10);
    c.quadraticCurveTo(48, 34, 35, 38);
    c.lineTo(35, 44);
    c.lineTo(29, 44);
    c.lineTo(29, 38);
    c.quadraticCurveTo(16, 34, 16, 10);
    c.closePath();
  }), 'gold', { d: 2.4, hi: 1.5 });
  body(ctx, P.rect(22, 44, 20, 5, 1.4), 'gold', { d: 0.8, hi: 0.6 });
  body(ctx, P.rect(18, 49, 28, 7, 1.6), 'darkwood', { d: 1, hi: 0.7 });
  fill(ctx, P.rect(26, 51, 12, 3, 0.6), R.gold[1]);
  bigStar(ctx, 32, 22, 6.4);
}

function gReroll(ctx) {
  for (const [a0, a1] of [[-2.8, -0.35], [0.34, 2.8]]) {
    line(ctx, P.custom((c) => c.arc(32, 32, 17, a0, a1)), R.brass[1], 6, { out: 1.8, hiColor: R.brass[0] });
    const x = 32 + Math.cos(a1) * 17;
    const y = 32 + Math.sin(a1) * 17;
    at(ctx, x, y, a1 + Math.PI / 2, 1, (c) => body(c, P.poly([[7, 0], [-2, -7], [-2, 7]]), 'brass', { d: 1, hi: 0, out: 1.8 }));
  }
}

function gHeal(ctx) {
  body(ctx, P.circle(32, 32, 25), 'brass', { d: 2, hi: 1.4 });
  body(ctx, P.circle(32, 32, 20), 'white', { d: 1.6, hi: 0, out: 1.4 });
  body(ctx, P.custom((c) => {
    c.moveTo(27, 15);
    c.lineTo(37, 15);
    c.lineTo(37, 27);
    c.lineTo(49, 27);
    c.lineTo(49, 37);
    c.lineTo(37, 37);
    c.lineTo(37, 49);
    c.lineTo(27, 49);
    c.lineTo(27, 37);
    c.lineTo(15, 37);
    c.lineTo(15, 27);
    c.lineTo(27, 27);
    c.closePath();
  }), 'red', { d: 1.8, hi: 1.2 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8;
    rivet(ctx, 32 + Math.cos(a) * 22.5, 32 + Math.sin(a) * 22.5, 1.1, 'brass');
  }
}

function gCrate(ctx) {
  body(ctx, P.rect(9, 11, 46, 44, 2.5), 'wood', { d: 2.4, hi: 1.5 });
  for (const y of [22, 33, 44]) detail(ctx, P.custom((c) => { c.moveTo(10, y); c.lineTo(54, y); }), R.wood[2], 1.2);
  // diagonal brace
  body(ctx, P.poly([[13, 47], [17, 51], [51, 19], [47, 15]]), 'darkwood', { d: 0.8, hi: 0.6, out: 1.6 });
  for (const [x, y, sx, sy] of [[9, 11, 1, 1], [55, 11, -1, 1], [9, 55, 1, -1], [55, 55, -1, -1]]) {
    body(ctx, P.poly([[x, y], [x + sx * 10, y], [x + sx * 10, y + sy * 3.4], [x + sx * 3.4, y + sy * 3.4], [x + sx * 3.4, y + sy * 10], [x, y + sy * 10]]), 'brass', { d: 0.6, hi: 0, out: 1.4 });
    rivet(ctx, x + sx * 1.9, y + sy * 1.9, 1, 'brass');
  }
  body(ctx, P.circle(32, 33, 6), 'brass', { d: 0.8, hi: 0.6 });
  cog(ctx, 32, 33, 4.4, 8, { out: 1 });
}

function medal(kind, ribbon) {
  return (ctx) => {
    // ribbon
    body(ctx, P.poly([[17, 4], [29, 4], [37, 30], [27, 30]]), ribbon[0], { d: 1, hi: 0.8 });
    body(ctx, P.poly([[47, 4], [35, 4], [27, 30], [37, 30]]), ribbon[1], { d: 1, hi: 0.8 });
    fill(ctx, P.poly([[22, 4], [25, 4], [33, 30], [30, 30]]), '#fff6dc', 0.7);
    body(ctx, P.rect(25, 27, 14, 6, 1.6), kind, { d: 0.6, hi: 0.5 });
    // disc
    body(ctx, P.circle(32, 44, 16), kind, { d: 2.2, hi: 1.4 });
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      fill(ctx, P.circle(32 + Math.cos(a) * 13.6, 44 + Math.sin(a) * 13.6, 0.55), R[kind][2]);
    }
    body(ctx, P.star(32, 45, 9, 4.2, 5), kind, { d: 1.2, hi: 0.9, out: 1.6 });
    glint(ctx, 24, 36, 2.8);
  };
}

function gBoss(ctx) {
  // horned syndicate helm with ember eyes
  for (const s of [-1, 1]) {
    body(ctx, P.custom((c) => {
      c.moveTo(32 + s * 13, 22);
      c.quadraticCurveTo(32 + s * 27, 18, 32 + s * 26, 4);
      c.quadraticCurveTo(32 + s * 20, 14, 32 + s * 9, 16);
      c.closePath();
    }), 'crimson', { d: 1.4, hi: 1 });
  }
  body(ctx, P.custom((c) => {
    c.moveTo(14, 26);
    c.bezierCurveTo(14, 8, 50, 8, 50, 26);
    c.lineTo(50, 40);
    c.lineTo(42, 56);
    c.lineTo(22, 56);
    c.lineTo(14, 40);
    c.closePath();
  }), 'iron', { d: 2.4, hi: 1.5 });
  body(ctx, P.rect(29.5, 12, 5, 34, 1), 'blackiron', { d: 0.6, hi: 0.5, out: 1.4 });
  for (const s of [-1, 1]) {
    body(ctx, P.poly([[32 + s * 3.5, 30], [32 + s * 14, 25], [32 + s * 13, 33]]), ['#fff6c0', '#ff6a1f', '#a8300c'], { flat: true, out: 1.4 });
    glow(ctx, 32 + s * 9, 29.5, 7, '#ff4d2e', 0.7);
  }
  for (const x of [24, 28, 36, 40]) detail(ctx, P.custom((c) => { c.moveTo(x, 42); c.lineTo(x, 52); }), INKC, 1.6);
  for (const [x, y] of [[18, 28], [46, 28], [20, 40], [44, 40]]) rivet(ctx, x, y, 1.3, 'iron');
}

function gWave(ctx) {
  speedLines(ctx, 56, 26, 0, [8, 12, 7], 6, '#ffffff');
  line(ctx, P.custom((c) => { c.moveTo(14, 8); c.lineTo(14, 58); }), R.wood[1], 3.4, { out: 1.4 });
  body(ctx, P.circle(14, 7, 3), 'brass', { d: 0.6, hi: 0, out: 1.4 });
  const flag = P.custom((c) => {
    c.moveTo(15.5, 11);
    c.quadraticCurveTo(30, 6, 40, 13);
    c.quadraticCurveTo(46, 17, 54, 22);
    c.quadraticCurveTo(40, 26, 30, 30);
    c.quadraticCurveTo(22, 33, 15.5, 36);
    c.closePath();
  });
  body(ctx, flag, 'crimson', { d: 2, hi: 1.3 });
  body(ctx, P.star(29, 22, 5.6, 2.6, 5), 'gold', { d: 0.6, hi: 0, out: 1.3 });
}

function gPause(ctx) {
  for (const x of [15, 37]) {
    body(ctx, P.rect(x, 12, 12, 40, 3), 'brass', { d: 2, hi: 1.4 });
    for (const y of [17, 47]) rivet(ctx, x + 6, y, 1.3, 'brass');
  }
}

export const GENERIC_GLYPHS = {
  cog: gCog,
  xp: gXp,
  skull: gSkull,
  bomb: gBomb,
  steam: gSteam,
  hull: gHull,
  lock: gLock,
  star: gStar,
  clock: gClock,
  trophy: gTrophy,
  reroll: gReroll,
  heal: gHeal,
  crate: gCrate,
  medal_bronze: medal('bronze', ['oxblood', 'red']),
  medal_silver: medal('steel', ['navy', 'navy']),
  medal_gold: medal('gold', ['red', 'oxblood']),
  boss: gBoss,
  wave: gWave,
  pause: gPause,
};
