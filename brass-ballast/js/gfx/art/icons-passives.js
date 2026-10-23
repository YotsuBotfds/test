// Passive upgrade glyphs (WP5) — painted onto the warm parchment medallion. Strong ink
// outlines carry the contrast on the light field; colour carries the identity.

import {
  TAU, INKC, P, R, body, line, detail, fill, glow, glint, at, barrel, explosion, flame,
  shell, speedLines, horseshoe, wrench, hammer, clover, watch, dial, hexPath,
  shieldPath, sparkle, cog, rivet, puffs,
} from './icons-kit.js';

function plating(ctx) {
  // three overlapping armour plates, fish-scale style
  const plate = (x, y, w, h, k) => {
    body(ctx, P.custom((c) => {
      c.moveTo(x - w / 2, y - h / 2);
      c.lineTo(x + w / 2, y - h / 2);
      c.lineTo(x + w / 2, y + h * 0.15);
      c.quadraticCurveTo(x, y + h * 0.75, x - w / 2, y + h * 0.15);
      c.closePath();
    }), k, { d: 1.8, hi: 1.3 });
  };
  plate(32, 41, 30, 14, 'iron');
  plate(32, 31, 32, 14, 'steel');
  plate(32, 21, 34, 14, 'steel');
  for (const [y, n, w] of [[17, 5, 30], [27, 5, 28], [37, 4, 26]]) {
    for (let i = 0; i < n; i++) rivet(ctx, 32 - w / 2 + 2 + (i * (w - 4)) / (n - 1), y, 1.2, 'brass');
  }
  // health badge
  body(ctx, P.circle(46, 46, 6.5), 'red', { d: 1.2, hi: 1 });
  fill(ctx, P.rect(45, 42, 2, 8, 0.4), '#ffffff');
  fill(ctx, P.rect(42, 45, 8, 2, 0.4), '#ffffff');
}

function boiler(ctx) {
  puffs(ctx, 40, 13, 5, -1.2, 2, 4.2);
  // tank
  body(ctx, P.custom((c) => {
    c.moveTo(19, 50);
    c.lineTo(19, 24);
    c.quadraticCurveTo(19, 15, 32, 15);
    c.quadraticCurveTo(45, 15, 45, 24);
    c.lineTo(45, 50);
    c.closePath();
  }), 'copper', { d: 2.4, hi: 1.5 });
  for (const y of [25, 44]) {
    body(ctx, P.rect(18, y - 1.6, 28, 3.2, 1), 'brass', { d: 0.6, hi: 0, out: 1.5 });
    for (let x = 21; x < 45; x += 4.5) fill(ctx, P.circle(x, y, 0.8), R.brass[2]);
  }
  body(ctx, P.rect(16, 49, 32, 4, 1.2), 'iron', { d: 0.8, hi: 0.6, out: 1.8 });
  // valve stack
  body(ctx, P.rect(37, 12, 5, 6, 1), 'brass', { d: 0.6, hi: 0, out: 1.5 });
  dial(ctx, 32, 34.5, 7, 0.86);
}

function rifling(ctx) {
  body(ctx, P.circle(31, 31, 17), 'steel', { d: 2, hi: 1.4 });
  body(ctx, P.circle(31, 31, 13.5), 'iron', { d: 0, hi: 0, out: 1.4, flat: true });
  fill(ctx, P.circle(31, 31, 10.5), '#1f1a16');
  // spiral lands & grooves
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    detail(ctx, P.custom((c) => {
      for (let t = 0; t <= 1.0001; t += 0.1) {
        const r = 13.2 - t * 9.5;
        const aa = a + t * 1.9;
        const x = 31 + Math.cos(aa) * r;
        const y = 31 + Math.sin(aa) * r;
        if (t === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
    }), '#c6d0db', 1.8, 0.9);
  }
  fill(ctx, P.circle(31, 31, 3.6), '#0b0807');
  glint(ctx, 23, 21, 3);
  // spinning bullet
  at(ctx, 46, 47, -0.785, 1, (c) => shell(c, 14, 6.2, { kind: 'brass', tip: 'copper', band: null }));
  for (const a of [0.5, 2.6]) {
    line(ctx, P.custom((c) => c.arc(46, 47, 8.4, a, a + 1.1)), '#7a5420', 1.2, { out: 0.6 });
  }
}

function quickLoader(ctx) {
  speedLines(ctx, 19, 38, 0, [8, 11, 8], 6, '#7a5420');
  // stripper clip
  body(ctx, P.rect(22, 42, 26, 5, 1.2), 'iron', { d: 0.8, hi: 0.7 });
  for (const x of [26, 33, 40]) {
    at(ctx, x + 2, 29, -Math.PI / 2 + 0.12, 1, (c) => shell(c, 26, 6.2, { kind: 'brass', tip: 'copper', band: 'red' }));
  }
  // clock-hand arrow: faster
  body(ctx, P.poly([[47, 14], [53, 18], [47, 22]]), 'red', { d: 0.6, hi: 0, out: 1.4 });
}

function luckyRivet(ctx) {
  sparkle(ctx, 49, 15, 3.6, '#fff6c0', { glowColor: '#ffcf4a' });
  sparkle(ctx, 14, 44, 2.6, '#fff6c0', { glowColor: '#ffcf4a' });
  // rivet seen at an angle: shank + dome
  body(ctx, P.rect(28, 40, 8, 12, 1.4), 'bronze', { d: 1.2, hi: 0.8 });
  body(ctx, P.ellipse(32, 33, 17, 13), 'brass', { d: 2.4, hi: 1.6 });
  fill(ctx, P.ellipse(32, 38, 15, 5.5), R.brass[2], 0.35);
  glint(ctx, 24, 26, 4, 2);
  clover(ctx, 32, 30.5, 0.95, 'green');
}

function magnet(ctx) {
  // pull lines
  for (const r of [6, 10]) {
    line(ctx, P.custom((c) => c.arc(32, 42, r + 8, 0.35 * Math.PI, 0.65 * Math.PI)), '#33b9a8', 1.3, { out: 0.6, dash: [2, 2] });
  }
  at(ctx, 32, 23, 0, 1, (c) => horseshoe(c, 1.05, { ramp: 'red', tips: 'steel' }));
  // attracted shards & cog
  for (const [x, y, s] of [[22, 48, 1], [42, 50, 0.85], [32, 54, 0.7]]) {
    body(ctx, P.poly([[x, y - 4 * s], [x + 2.6 * s, y], [x, y + 4 * s], [x - 2.6 * s, y]]), 'teal', { d: 0.6, hi: 0, out: 1.2 });
  }
  cog(ctx, 47, 41, 4.2, 8, { out: 1.4 });
}

function fins(ctx) {
  speedLines(ctx, 53, 33, 0, [6, 9, 6], 4.6, '#7a5420');
  body(ctx, P.custom((c) => {
    c.moveTo(14, 46);
    c.lineTo(22, 14);
    c.quadraticCurveTo(34, 16, 44, 30);
    c.lineTo(48, 46);
    c.closePath();
  }), 'canvas', { d: 2, hi: 1.4 });
  // oxblood stripes
  fill(ctx, P.poly([[20.4, 21], [33, 22.6], [38.6, 27.4], [18.6, 28]]), R.oxblood[1]);
  fill(ctx, P.poly([[17.4, 33], [41.4, 33], [43.4, 38], [16.2, 38]]), R.oxblood[1]);
  // spars
  for (const x of [26, 36]) detail(ctx, P.custom((c) => { c.moveTo(x - 6, 46); c.lineTo(x - 3, 17 + (x - 26)); }), R.canvas[2], 0.9);
  body(ctx, P.custom((c) => {
    c.moveTo(14, 46);
    c.lineTo(48, 46);
    c.lineTo(46, 51);
    c.lineTo(16, 51);
    c.closePath();
  }), 'brass', { d: 1, hi: 0.8 });
  for (const x of [20, 28, 36, 44]) fill(ctx, P.circle(x, 48.5, 0.9), R.brass[2]);
}

function repairCrew(ctx) {
  at(ctx, 32, 32, Math.PI / 4, 1, (c) => hammer(c, 32));
  at(ctx, 32, 32, -Math.PI / 4, 1, (c) => wrench(c, 30, { w: 4.6 }));
  sparkle(ctx, 47, 47, 2.8, '#fff6c0', { glowColor: '#ffcf4a' });
}

function extraBallast(ctx) {
  // sandbag
  body(ctx, P.custom((c) => {
    c.moveTo(24, 24);
    c.quadraticCurveTo(12, 30, 13, 44);
    c.quadraticCurveTo(14, 52, 27, 52);
    c.quadraticCurveTo(40, 52, 40, 43);
    c.quadraticCurveTo(39, 30, 30, 24);
    c.closePath();
  }), 'canvas', { d: 2.2, hi: 1.3 });
  body(ctx, P.custom((c) => {
    c.moveTo(24, 24);
    c.lineTo(20, 15);
    c.lineTo(27, 19);
    c.lineTo(34, 15);
    c.lineTo(30, 24);
    c.closePath();
  }), 'canvas', { d: 1, hi: 0.8 });
  line(ctx, P.custom((c) => { c.moveTo(22.5, 24.5); c.quadraticCurveTo(27, 26.5, 31.5, 24.5); }), '#c9a26a', 1.6, { out: 0.8 });
  detail(ctx, P.custom((c) => { c.moveTo(19, 38); c.lineTo(23, 41); c.moveTo(29, 44); c.lineTo(33, 47); }), R.canvas[2], 1);
  // iron weight with plus
  body(ctx, P.ring(44, 27, 2, 4.4), 'iron', { rule: 'evenodd', d: 0.8, hi: 0, out: 1.6 });
  body(ctx, P.poly([[37, 50], [51, 50], [48, 31], [40, 31]]), 'blackiron', { d: 1.8, hi: 1.1 });
  fill(ctx, P.rect(42.6, 36.5, 2.8, 9, 0.5), R.brass[1]);
  fill(ctx, P.rect(39.5, 39.6, 9, 2.8, 0.5), R.brass[1]);
}

function twinBarrels(ctx) {
  at(ctx, 13, 42, -0.62, 1, (c) => {
    for (const y of [-4.8, 4.8]) at(c, 0, y, 0, 1, (cc) => barrel(cc, 30, 8, 6.6, { kind: 'brass', bands: [0.4], knob: false }));
    body(c, P.rect(5, -10, 5, 20, 1.6), 'iron', { d: 0.8, hi: 0.6, out: 1.8 });
    body(c, P.rect(22, -9.4, 3, 18.8, 1), 'iron', { d: 0.6, hi: 0, out: 1.6 });
  });
  explosion(ctx, 45, 18, 4.2, { seed: 7, n: 7, out: 1.3 });
  explosion(ctx, 38.5, 13, 3, { seed: 8, n: 6, out: 1.1 });
}

function ricochet(ctx) {
  // deflector plate
  at(ctx, 30, 47, -0.12, 1, (c) => {
    body(c, P.rect(-16, -3, 32, 6, 1.4), 'iron', { d: 1.2, hi: 1 });
    for (const x of [-12, -4, 4, 12]) rivet(c, x, 0, 1.1, 'brass');
  });
  // bounce path
  line(ctx, P.custom((c) => { c.moveTo(13, 17); c.lineTo(29, 42); c.lineTo(42, 22); }), '#7a5420', 1.4, { out: 0, dash: [2.6, 2.4] });
  explosion(ctx, 29, 42, 4.6, { seed: 4, n: 7, out: 1.2 });
  at(ctx, 45, 17, -0.98, 1, (c) => shell(c, 15, 6.4, { kind: 'brass', tip: 'steel', band: null }));
}

function piercing(ctx) {
  // armour plate (side-on), punched through
  body(ctx, P.rect(27, 12, 10, 40, 2), 'iron', { d: 1.8, hi: 1.2 });
  for (const y of [16, 48]) rivet(ctx, 32, y, 1.3, 'brass');
  // shards flying off the exit side
  for (const [x, y, a] of [[44, 24, -0.6], [47, 33, 0.1], [43, 40, 0.8]]) {
    at(ctx, x, y, a, 1, (c) => body(c, P.poly([[-2, -1.6], [2.4, 0], [-2, 1.6]]), 'steel', { d: 0.4, hi: 0, out: 1.1 }));
  }
  // cracked hole
  body(ctx, P.burst(32, 32, 7, 4, 7, 9), ['#2b1d10', '#2b1d10', '#2b1d10'], { flat: true, out: 1.2 });
  // AP shell through it
  at(ctx, 33, 32, 0, 1, (c) => shell(c, 30, 7, { kind: 'brass', tip: 'steel', band: 'red' }));
  speedLines(ctx, 15, 32, 0, [5, 7, 5], 3.4, '#7a5420');
}

function incendiary(ctx) {
  flame(ctx, 25, 41, 22, { lean: -0.12 });
  flame(ctx, 37, 40, 14, { lean: 0.1 });
  at(ctx, 33, 41, -0.62, 1, (c) => shell(c, 26, 9, { kind: 'brass', tip: 'copper', band: 'red' }));
  for (const [x, y] of [[16, 22], [47, 26], [43, 16]]) fill(ctx, P.circle(x, y, 1.2), '#ff6a1f');
}

function explosiveTips(ctx) {
  explosion(ctx, 42, 22, 11, { seed: 13, n: 10 });
  at(ctx, 25, 39, -0.62, 1, (c) => shell(c, 26, 9, { kind: 'brass', tip: 'red', band: 'brass' }));
  for (const [x, y] of [[51, 37], [27, 12], [54, 14]]) fill(ctx, P.circle(x, y, 1.3), '#2b1d10');
}

function clockwork(ctx) {
  cog(ctx, 44, 44, 10, 10, { rot: 0.15, spokes: 4, hole: 2.2 });
  cog(ctx, 18, 19, 6.5, 8, { rot: 0.3, kind: 'copper', hole: 1.6 });
  watch(ctx, 30, 33, 14.5, { h1: -0.35, h2: 0.25 });
}

function bigBore(ctx) {
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    at(ctx, 32 + Math.cos(a) * 20, 32 + Math.sin(a) * 20, a, 1, (c) =>
      body(c, P.poly([[3.6, 0], [-2.4, -4], [-1, 0], [-2.4, 4]]), 'red', { d: 0.6, hi: 0, out: 1.3 }),
    );
  }
  body(ctx, P.circle(32, 32, 17), 'brass', { d: 2.2, hi: 1.6 });
  detail(ctx, P.circle(32, 32, 14.5), R.brass[2], 1, 0.7);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    rivet(ctx, 32 + Math.cos(a) * 15.6, 32 + Math.sin(a) * 15.6, 0.9, 'brass');
  }
  body(ctx, P.circle(32, 32, 11), ['#4a3a2a', '#1f1610', '#0b0705'], { d: 0, hi: 0, out: 1.6, flat: true });
  const g = ctx.createRadialGradient(34, 34, 1, 32, 32, 11);
  g.addColorStop(0, '#000000');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  fill(ctx, P.circle(32, 32, 10), g);
  detail(ctx, P.custom((c) => c.arc(32, 32, 9.6, Math.PI * 0.1, Math.PI * 0.6)), '#8a6a44', 1.4, 0.8);
  glint(ctx, 23, 22, 3);
}

function scavenger(ctx) {
  // eye
  body(ctx, P.custom((c) => {
    c.moveTo(11, 30);
    c.quadraticCurveTo(28, 14, 45, 30);
    c.quadraticCurveTo(28, 46, 11, 30);
    c.closePath();
  }), 'white', { d: 1.4, hi: 0 });
  body(ctx, P.circle(28, 30, 7.2), 'teal', { d: 1.4, hi: 0, out: 1.4 });
  fill(ctx, P.circle(28, 30, 3.4), '#0b1a18');
  glint(ctx, 26, 28, 1.6, 1.2);
  // brow lashes
  detail(ctx, P.custom((c) => { c.moveTo(16, 21); c.lineTo(14, 18); c.moveTo(23, 18.6); c.lineTo(22.5, 15); c.moveTo(31, 18.4); c.lineTo(32, 15); }), INKC, 1.4);
  // monocle chain
  line(ctx, P.custom((c) => { c.moveTo(42, 39); c.bezierCurveTo(46, 50, 36, 55, 30, 52); }), R.gold[1], 1.2, { out: 0.8, dash: [2, 1] });
  // monocle ring over the eye
  ctx.save();
  fill(ctx, P.circle(29, 30, 12), '#bfefff', 0.18);
  ctx.restore();
  body(ctx, P.ring(29, 30, 11, 14), 'gold', { rule: 'evenodd', d: 1.4, hi: 1 });
  detail(ctx, P.custom((c) => c.arc(29, 30, 9, Math.PI * 1.1, Math.PI * 1.5)), '#ffffff', 1.6, 0.8);
  sparkle(ctx, 45, 46, 3, '#fff6c0', { glowColor: '#ffcf4a' });
}

function ironHide(ctx) {
  body(ctx, shieldPath(32, 32, 32, 38), 'blackiron', { d: 2.4, hi: 1.5 });
  body(ctx, shieldPath(32, 32.5, 24, 29), 'iron', { d: 1.6, hi: 1.1 });
  // cross bands
  fill(ctx, P.rect(29.5, 18, 5, 29, 0.6), R.iron[2]);
  fill(ctx, P.rect(20, 27.5, 24, 5, 0.6), R.iron[2]);
  body(ctx, P.circle(32, 30, 5), 'steel', { d: 1.2, hi: 0.9 });
  for (const [x, y] of [[20, 17.5], [44, 17.5], [17.5, 30], [46.5, 30], [32, 49]]) rivet(ctx, x, y, 1.4, 'steel');
}

function aetherShield(ctx) {
  glow(ctx, 32, 32, 24, '#33c9c0', 0.55);
  body(ctx, hexPath(32, 32, 19.5, 0), 'brass', { d: 1.6, hi: 1.2 });
  body(ctx, hexPath(32, 32, 15.5, 0), 'aether', { d: 2.2, hi: 1.4, out: 1.6 });
  // honeycomb lattice
  for (const [x, y] of [[32, 32], [32, 23.5], [32, 40.5], [24.6, 27.8], [39.4, 27.8], [24.6, 36.2], [39.4, 36.2]]) {
    detail(ctx, hexPath(x, y, 4.8, 0), '#e8ffff', 0.8, 0.7);
  }
  fill(ctx, hexPath(32, 32, 4.2, 0), '#ffffff', 0.85);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    rivet(ctx, 32 + Math.cos(a) * 17.6, 32 + Math.sin(a) * 17.6, 1, 'brass');
  }
  sparkle(ctx, 45, 17, 3, '#e8ffff', { glowColor: '#7ff3ff' });
}

function vengeance(ctx) {
  // flames erupting behind
  flame(ctx, 20, 30, 17, { lean: -0.25 });
  flame(ctx, 44, 30, 17, { lean: 0.25 });
  flame(ctx, 32, 22, 15, {});
  // round boiler
  body(ctx, P.circle(32, 37, 14.5), 'copper', { d: 2.4, hi: 1.5 });
  body(ctx, P.rect(17, 34.5, 30, 3.6, 1), 'brass', { d: 0.6, hi: 0, out: 1.5 });
  // angry furnace eyes
  for (const s of [-1, 1]) {
    body(ctx, P.poly([[32 + s * 2, 30], [32 + s * 9.5, 27], [32 + s * 8, 32.4]]), ['#fff6c0', '#ffb030', '#d4521a'], { flat: true, out: 1.4 });
  }
  // grated mouth
  body(ctx, P.rect(24.5, 41, 15, 6.4, 2), ['#fff3a0', '#ff8a2a', '#b0401a'], { d: 1, hi: 0, out: 1.5 });
  for (const x of [28.5, 32, 35.5]) fill(ctx, P.rect(x - 0.6, 41, 1.2, 6.4), '#3a1a0a');
  for (const a of [0.5, 1.6, 2.6]) {
    rivet(ctx, 32 + Math.cos(a) * 12.2, 37 + Math.sin(a) * 12.2, 1, 'brass');
  }
}

export const PASSIVE_GLYPHS = {
  plating, boiler, rifling, quickLoader, luckyRivet, magnet, fins, repairCrew, extraBallast,
  twinBarrels, ricochet, piercing, incendiary, explosiveTips, clockwork, bigBore, scavenger,
  ironHide, aetherShield, vengeance,
};
