// Weapon glyphs (WP5): primary cannons, auxiliary systems and their legendary evolutions.
// Each glyph paints into a 64-unit box centred on (32,32); the medallion frame is added by
// icons.js. Keep shapes bold — these are read at 40 px on level-up cards.

import {
  TAU, INKC, P, R, body, line, detail, fill, glow, glint, at, cannonball, barrel, wheel,
  explosion, bolt, boltShape, cloud, puffs, speedLines, rocket, mine, drone, saw, sparkle,
} from './icons-kit.js';

const STORM = ['#e6ebf2', '#8f9aab', '#454d5c'];

// ---------------------------------------------------------------------------------------------
// Primary cannons (navy enamel)

function brassCannon(ctx) {
  // carriage
  body(ctx, P.poly([[13, 47], [36, 44], [33, 36], [16, 37]]), 'wood', { d: 1.6 });
  detail(ctx, P.custom((c) => { c.moveTo(16, 41); c.lineTo(34, 40); }), R.wood[2], 1);
  at(ctx, 18, 38, -0.62, 1, (c) => barrel(c, 26, 11.5, 8.5, { kind: 'brass' }));
  wheel(ctx, 24, 44, 7.5);
  // muzzle smoke + flying ball
  puffs(ctx, 41.5, 21.5, 0, 0, 1, 3.6);
  speedLines(ctx, 45.5, 16.5, -0.75, [5, 7, 5], 3.2);
  cannonball(ctx, 47, 15.5, 3.8);
}

function gatling(ctx) {
  at(ctx, 17, 41, -0.66, 1, (c) => {
    // barrel cluster (back to front)
    for (const [y, k] of [[-3.6, 'iron'], [3.6, 'iron'], [0, 'steel']]) {
      body(c, P.rect(8, y - 1.7, 24, 3.4, 1), k, { d: 1, hi: 0.8, out: 1.6 });
      fill(c, P.ellipse(32.2, y, 0.7, 1.1), INKC);
    }
    body(c, P.rect(16, -6.8, 3, 13.6, 1), 'brass', { d: 0.8, hi: 0, out: 1.6 });
    body(c, P.rect(26.5, -6.4, 3, 12.8, 1), 'brass', { d: 0.8, hi: 0, out: 1.6 });
    // housing
    body(c, P.rect(-2, -7.5, 11, 15, 3), 'brass', { d: 1.6, hi: 1.2 });
    detail(c, P.custom((p) => { p.moveTo(1.5, -6.5); p.lineTo(1.5, 6.5); p.moveTo(5, -6.5); p.lineTo(5, 6.5); }), R.brass[2], 0.9);
    // crank handle
    line(c, P.custom((p) => { p.moveTo(3, 7.5); p.lineTo(3, 12); p.lineTo(-3, 12); }), R.iron[1], 1.8, { out: 1 });
    body(c, P.rect(-6.5, 10, 4, 4, 1.4), 'wood', { d: 0.6, hi: 0, out: 1.3 });
  });
  // muzzle flashes along the spin
  for (const [x, y, r] of [[43, 18, 4.4], [47.5, 24, 3.2], [38.5, 14, 2.8]]) explosion(ctx, x, y, r, { n: 6, seed: x | 0, out: 1.2 });
}

function blunderbuss(ctx) {
  at(ctx, 15, 44, -0.62, 1, (c) => {
    // stock
    body(c, P.custom((p) => {
      p.moveTo(-6, -2);
      p.lineTo(10, -3);
      p.lineTo(10, 3.5);
      p.lineTo(-3, 6.5);
      p.quadraticCurveTo(-8, 7, -8, 3);
      p.closePath();
    }), 'wood', { d: 1.4 });
    // trumpet barrel
    body(c, P.custom((p) => {
      p.moveTo(8, -3);
      p.lineTo(22, -3.2);
      p.quadraticCurveTo(27, -4, 29, -8.5);
      p.lineTo(31, -8.5);
      p.lineTo(31, 8.5);
      p.lineTo(29, 8.5);
      p.quadraticCurveTo(27, 4, 22, 3.2);
      p.lineTo(8, 3);
      p.closePath();
    }), 'brass', { d: 1.8, hi: 1.3 });
    body(c, P.rect(13, -4, 2.6, 8, 0.6), 'brass', { d: 0.6, hi: 0, out: 1.4 });
    fill(c, P.ellipse(31.2, 0, 1.4, 6.8), INKC);
    // trigger guard & hammer
    line(c, P.custom((p) => { p.moveTo(4, 3.5); p.quadraticCurveTo(6, 8, 9, 3.5); }), R.brass[1], 1.2, { out: 0.8 });
    body(c, P.poly([[6, -3], [4, -7], [7, -6.5], [9, -3]]), 'iron', { d: 0.5, hi: 0, out: 1.3 });
  });
  // pellet spray
  const mx = 15 + 31 * Math.cos(-0.62);
  const my = 44 + 31 * Math.sin(-0.62);
  glow(ctx, mx + 2, my - 2, 9, '#ffb030', 0.5);
  for (const [a, d, r] of [[-1.25, 9, 2.2], [-0.95, 13, 2.5], [-0.6, 10, 2.4], [-0.3, 13.5, 2.3], [-0.05, 9, 2.1], [-0.62, 16.5, 2]]) {
    cannonball(ctx, mx + Math.cos(a) * d, my + Math.sin(a) * d, r);
  }
}

function mortar(ctx) {
  // trajectory
  line(ctx, P.custom((c) => { c.moveTo(38, 25); c.quadraticCurveTo(45, 4, 52, 26); }), '#fff3c4', 1.5, { out: 0.9, dash: [2.6, 2.6] });
  // block base
  body(ctx, P.rect(14, 40, 36, 10, 2), 'wood', { d: 1.6 });
  body(ctx, P.rect(14, 43.5, 36, 2.6, 0.6), 'iron', { d: 0.6, hi: 0, out: 1.3 });
  // squat barrel
  at(ctx, 30, 40, -1.0, 1, (c) => {
    body(c, P.custom((p) => {
      p.moveTo(-4, -9);
      p.lineTo(15, -7.5);
      p.lineTo(15, 7.5);
      p.lineTo(-4, 9);
      p.quadraticCurveTo(-11, 0, -4, -9);
      p.closePath();
    }), 'iron', { d: 2.2, hi: 1.3 });
    body(c, P.rect(13, -9, 4.2, 18, 1.2), 'brass', { d: 0.8, hi: 0.8, out: 1.8 });
    body(c, P.rect(3, -8.6, 2.6, 17.2, 0.6), 'brass', { d: 0.6, hi: 0, out: 1.4 });
    fill(c, P.ellipse(17.4, 0, 1.6, 6.6), INKC);
  });
  body(ctx, P.circle(29, 41, 4.2), 'brass', { d: 1, hi: 0.8 });
  fill(ctx, P.circle(29, 41, 1.2), INKC);
  // shell at apex with lit fuse
  cannonball(ctx, 44.5, 13.5, 4.4);
  line(ctx, P.custom((c) => { c.moveTo(46.5, 10); c.quadraticCurveTo(48, 7.5, 50, 8); }), '#c9a26a', 1.1, { out: 0.7 });
  sparkle(ctx, 50.5, 8, 2.4, '#ffe08a', { glowColor: '#ff9b2f', out: 0.7 });
}

function aetherLance(ctx) {
  const a = -0.785;
  const ox = 16;
  const oy = 48;
  // beam
  const bx = (t) => ox + Math.cos(a) * t;
  const by = (t) => oy + Math.sin(a) * t;
  glow(ctx, bx(26), by(26), 16, '#33c9c0', 0.55);
  line(ctx, P.custom((c) => { c.moveTo(bx(14), by(14)); c.lineTo(bx(41), by(41)); }), '#7ff3ff', 5.5, { out: 1.6 });
  detail(ctx, P.custom((c) => { c.moveTo(bx(14), by(14)); c.lineTo(bx(42), by(42)); }), '#ffffff', 2);
  // bolt-shaped tip flare
  glow(ctx, bx(42), by(42), 7, '#e8ffff', 0.8);
  sparkle(ctx, bx(42.5), by(42.5), 4.2, '#ffffff', { glowColor: '#7ff3ff', out: 1 });
  at(ctx, ox, oy, a, 1, (c) => {
    // emitter body
    body(c, P.rect(-4, -5, 15, 10, 2), 'brass', { d: 1.6, hi: 1.2 });
    for (const x of [0, 4.5]) body(c, P.rect(x, -5.6, 2.4, 11.2, 0.6), 'copper', { d: 0.5, hi: 0, out: 1.3 });
    // prongs cradling the crystal
    body(c, P.poly([[10, -5], [17, -6.5], [14, -2.5], [10, -2]]), 'brass', { d: 0.6, hi: 0, out: 1.4 });
    body(c, P.poly([[10, 5], [17, 6.5], [14, 2.5], [10, 2]]), 'brass', { d: 0.6, hi: 0, out: 1.4 });
    body(c, P.poly([[9, 0], [13, -3.4], [18, 0], [13, 3.4]]), 'aether', { d: 1, hi: 0.8, out: 1.5 });
  });
  sparkle(ctx, 21, 25, 2.2, '#e8ffff', { glowColor: '#7ff3ff', out: 0.7 });
  sparkle(ctx, 42, 46, 1.8, '#e8ffff', { glowColor: '#7ff3ff', out: 0.6 });
}

function harpoon(ctx) {
  // rope
  line(ctx, P.custom((c) => {
    c.moveTo(16, 47);
    c.bezierCurveTo(12, 56, 26, 56, 30, 48);
    c.bezierCurveTo(33, 42, 44, 44, 47, 50);
  }), '#d8b47a', 2.2, { out: 1, hiColor: '#f6e2b4' });
  detail(ctx, P.custom((c) => {
    c.moveTo(16, 47);
    c.bezierCurveTo(12, 56, 26, 56, 30, 48);
    c.bezierCurveTo(33, 42, 44, 44, 47, 50);
  }), '#7a5420', 0.9, 0.8);
  at(ctx, 15, 48, -0.785, 1, (c) => {
    body(c, P.rect(0, -1.7, 34, 3.4, 1.4), 'wood', { d: 0.8, hi: 0.8 });
    body(c, P.rect(1, -2.6, 3, 5.2, 0.8), 'iron', { d: 0.6, hi: 0, out: 1.4 });
    body(c, P.rect(26, -2.3, 6, 4.6, 0.8), 'iron', { d: 0.6, hi: 0, out: 1.4 });
    // barbed head
    body(c, P.poly([
      [31, -2.2], [33, -2.2], [32, -8.5], [38, -2.6], [45, 0], [38, 2.6], [32, 8.5], [33, 2.2], [31, 2.2],
    ]), 'steel', { d: 1.2, hi: 1 });
    detail(c, P.custom((p) => { p.moveTo(34, 0); p.lineTo(43, 0); }), R.steel[2], 0.9);
  });
  glint(ctx, 41, 22, 1.4);
}

// ---------------------------------------------------------------------------------------------
// Auxiliary systems (verdigris enamel)

function teslaCoil(ctx) {
  // arcs behind
  bolt(ctx, [[32, 18], [24, 18], [21, 24], [14, 25]], { w: 2.2 });
  bolt(ctx, [[32, 18], [41, 16], [43, 22], [51, 22]], { w: 2.2 });
  bolt(ctx, [[30, 20], [22, 30], [17, 34]], { w: 1.6 });
  bolt(ctx, [[34, 20], [42, 28], [47, 33]], { w: 1.6 });
  // base
  body(ctx, P.poly([[20, 50], [44, 50], [41, 44], [23, 44]]), 'brass', { d: 1.4 });
  body(ctx, P.rect(18, 49, 28, 4, 1), 'wood', { d: 0.8, hi: 0.6, out: 1.8 });
  // coil
  body(ctx, P.rect(25.5, 24, 13, 21, 2), 'copper', { d: 2.2, hi: 1.2 });
  for (let y = 26.5; y < 44; y += 2.6) {
    detail(ctx, P.custom((c) => { c.moveTo(25.8, y); c.quadraticCurveTo(32, y + 1.4, 38.2, y); }), R.copper[2], 0.9);
    detail(ctx, P.custom((c) => { c.moveTo(26.5, y - 0.8); c.quadraticCurveTo(30, y + 0.1, 33, y - 0.2); }), R.copper[0], 0.6, 0.7);
  }
  body(ctx, P.rect(24, 22.5, 16, 3, 1), 'brass', { d: 0.6, hi: 0, out: 1.6 });
  // crown sphere
  glow(ctx, 32, 17, 11, '#7ff3ff', 0.75);
  body(ctx, P.circle(32, 17, 5.6), 'brass', { d: 1.4, hi: 1 });
  fill(ctx, P.circle(32, 17, 2.4), '#e8ffff');
  glint(ctx, 30, 15, 1.4);
}

function rocketPods(ctx) {
  const a = -0.785;
  const nx = Math.cos(a + Math.PI / 2);
  const ny = Math.sin(a + Math.PI / 2);
  for (const [o, f] of [[-9, -2], [9, -2], [0, 3]]) {
    at(ctx, 30 + nx * o + Math.cos(a) * f, 34 + ny * o + Math.sin(a) * f, a, 1, (c) =>
      rocket(c, 21, 6.4, { kind: 'brass', nose: 'red' }),
    );
  }
}

function flakTurret(ctx) {
  // bursts
  explosion(ctx, 33, 14.5, 7.5, { seed: 11, n: 9 });
  for (const [x, y] of [[23, 12], [43, 11], [40, 22], [25, 21]]) fill(ctx, P.circle(x, y, 1.1), '#2b1d10');
  // twin barrels
  for (const x of [28, 36]) {
    body(ctx, P.rect(x - 2, 23, 4, 18, 1), 'iron', { d: 1, hi: 0.8, out: 1.8 });
    body(ctx, P.rect(x - 2.7, 22, 5.4, 3, 0.8), 'brass', { d: 0.5, hi: 0, out: 1.4 });
  }
  // dome turret
  body(ctx, P.custom((c) => {
    c.moveTo(18, 47);
    c.arc(32, 47, 14, Math.PI, 0);
    c.closePath();
  }), 'iron', { d: 2.2, hi: 1.3 });
  body(ctx, P.rect(15, 46, 34, 6, 1.6), 'brass', { d: 1, hi: 0.8 });
  for (const x of [20, 26, 32, 38, 44]) fill(ctx, P.circle(x, 49, 0.9), R.brass[2]);
  // vision slit
  body(ctx, P.rect(25, 38, 14, 2.6, 1.2), ['#ffd36b', '#ffb030', '#c06a1a'], { flat: true, out: 1.2 });
}

function clockDrones(ctx) {
  line(ctx, P.ellipse(32, 33, 21, 9, -0.25), '#c9fff0', 1.4, { out: 0.8, dash: [3, 3] });
  drone(ctx, 32, 32, 1.12);
  // tiny satellite drone on the orbit
  drone(ctx, 50, 30, 0.42);
}

function mineLayer(ctx) {
  // chain
  line(ctx, P.custom((c) => { c.moveTo(31, 38); c.quadraticCurveTo(28, 46, 33, 53); }), R.iron[1], 1.6, { out: 0.9, dash: [2, 1.4] });
  mine(ctx, 46, 44, 4.8, { rot: 0.3 });
  mine(ctx, 30, 28, 11.5);
}

function steamVents(ctx) {
  // heat glow
  glow(ctx, 32, 40, 14, '#ff9b2f', 0.4);
  // plumes
  cloud(ctx, 32, 22, [[-7, 4, 6], [0, -2, 7.5], [7, 3, 6], [-2, 9, 6], [5, 10, 4.5]], 'smoke');
  cloud(ctx, 18, 30, [[0, 0, 4.6], [-3, -4, 3.6], [2, 3, 3.6]], 'smoke');
  cloud(ctx, 46, 30, [[0, 0, 4.6], [3, -4, 3.6], [-2, 3, 3.6]], 'smoke');
  // vent grille
  body(ctx, P.rect(16, 39, 32, 13, 2.5), 'iron', { d: 1.8, hi: 1.1 });
  for (let x = 20; x < 46; x += 4.4) body(ctx, P.rect(x, 42, 2.4, 7, 1), ['#ffcf7a', '#ff8a2a', '#b0401a'], { flat: true, out: 1.1 });
  for (const x of [18.5, 45.5]) fill(ctx, P.circle(x, 45.5, 0.9), R.iron[0]);
}

function broadside(ctx) {
  const hull = P.custom((c) => {
    c.moveTo(32, 10);
    c.bezierCurveTo(41, 18, 41, 44, 34, 54);
    c.lineTo(30, 54);
    c.bezierCurveTo(23, 44, 23, 18, 32, 10);
    c.closePath();
  });
  for (const y of [22, 32, 42]) {
    for (const s of [-1, 1]) {
      const x = 32 + s * 8;
      at(ctx, x, y, s < 0 ? Math.PI : 0, 1, (c) => barrel(c, 8, 4.6, 3.8, { kind: 'iron', bands: [0.5], knob: false }));
      explosion(ctx, 32 + s * 17.5, y, 3.1, { seed: y + s * 3, n: 6, out: 1.1 });
    }
  }
  body(ctx, hull, 'wood', { d: 2, hi: 1.2 });
  detail(ctx, P.custom((c) => { c.moveTo(32, 14); c.lineTo(32, 51); }), R.wood[2], 1);
  body(ctx, P.rect(28.5, 26, 7, 12, 2), 'brass', { d: 0.8, hi: 0.6, out: 1.6 });
  fill(ctx, P.circle(32, 18, 1.4), R.brass[1]);
}

function gyroSaws(ctx) {
  for (const [a0, a1] of [[-2.7, -1.6], [0.45, 1.5]]) {
    line(ctx, P.custom((c) => c.arc(32, 32, 21, a0, a1)), '#e8fff8', 1.8, { out: 0.9 });
  }
  // arrow heads on the motion arcs
  for (const a of [-1.6, 1.5]) {
    const x = 32 + Math.cos(a) * 21;
    const y = 32 + Math.sin(a) * 21;
    at(ctx, x, y, a + Math.PI / 2, 1, (c) => body(c, P.poly([[3, 0], [-1.5, -2.6], [-1.5, 2.6]]), 'white', { flat: true, out: 1 }));
  }
  saw(ctx, 32, 32, 16.5, { teeth: 14, rot: 0.2 });
}

// ---------------------------------------------------------------------------------------------
// Evolutions (black enamel, gold glyph, aether halo added by the frame)

function thunderhead(ctx) {
  boltShape(ctx, 31, 39, 13, 'gold');
  at(ctx, 0, 0, 0, 1, (c) => {
    bolt(c, [[20, 26], [16, 34], [19, 35], [14, 44]], { w: 1.6 });
    bolt(c, [[44, 26], [48, 33], [45, 34], [50, 42]], { w: 1.6 });
  });
  cloud(ctx, 32, 22, [[-10, 2, 6.5], [-3, -3, 8], [6, -1, 7], [12, 3, 5.5], [0, 4, 7]], STORM, { hiBelow: 2 });
  // coil rings on the cloud: the dynamo
  detail(ctx, P.custom((c) => { c.moveTo(22, 25); c.quadraticCurveTo(32, 29, 42, 25); }), '#ffcf4a', 1.4);
}

function hellfire(ctx) {
  explosion(ctx, 39, 40, 11.5, { seed: 21, n: 10 });
  const a = 0.85;
  for (const [x, y] of [[26, 23], [36, 19], [20, 34]]) {
    at(ctx, x, y, a, 1, (c) => rocket(c, 15, 5.2, { kind: 'gold', nose: 'crimson', flameScale: 0.7 }));
  }
  sparkle(ctx, 47, 24, 2.4, '#fff6c0', { glowColor: '#ff9b2f', out: 0.7 });
}

function flakStorm(ctx) {
  explosion(ctx, 22, 19, 7.5, { seed: 31, n: 8 });
  explosion(ctx, 43, 17, 8.5, { seed: 32, n: 9 });
  explosion(ctx, 33, 29, 6, { seed: 33, n: 7 });
  for (const x of [28, 36]) {
    at(ctx, x, 43, x < 32 ? -0.25 : 0.25, 1, (c) => {
      body(c, P.rect(-2, -16, 4, 16, 1), 'gold', { d: 1, hi: 0.8, out: 1.8 });
      body(c, P.rect(-2.7, -17, 5.4, 3, 0.8), 'brass', { d: 0.5, hi: 0, out: 1.4 });
    });
  }
  body(ctx, P.custom((c) => { c.moveTo(19, 51); c.arc(32, 51, 13, Math.PI, 0); c.closePath(); }), 'gold', { d: 2, hi: 1.2 });
  body(ctx, P.rect(24.5, 42.5, 15, 2.4, 1.2), ['#e8ffff', '#7ff3ff', '#2ba3a6'], { flat: true, out: 1.1 });
}

function droneArmada(ctx) {
  line(ctx, P.circle(32, 33, 19), '#ffe9a0', 1.2, { out: 0.7, dash: [2.4, 2.8] });
  drone(ctx, 15.5, 22, 0.62, { kind: 'gold' });
  drone(ctx, 48.5, 22, 0.62, { kind: 'gold' });
  drone(ctx, 32, 34, 1.02, { kind: 'gold' });
}

function devilsMinefield(ctx) {
  mine(ctx, 15, 47, 4, { kind: 'blackiron', rot: 0.4 });
  mine(ctx, 50, 46, 4.2, { kind: 'blackiron', rot: 0.1 });
  // horns
  for (const s of [-1, 1]) {
    body(ctx, P.custom((c) => {
      c.moveTo(32 + s * 6, 24);
      c.quadraticCurveTo(32 + s * 14, 21, 32 + s * 15, 11);
      c.quadraticCurveTo(32 + s * 10, 17.5, 32 + s * 2, 21);
      c.closePath();
    }), 'crimson', { d: 1.2, hi: 1 });
  }
  mine(ctx, 32, 32, 12, { kind: 'gold', light: null, spikes: 8, rot: Math.PI / 8 });
  // evil face
  for (const s of [-1, 1]) {
    body(ctx, P.poly([[32 + s * 1.5, 29], [32 + s * 8, 25.5], [32 + s * 7, 31]]), ['#fff6c0', '#ff6a1f', '#a8300c'], { flat: true, out: 1.3 });
    glow(ctx, 32 + s * 5.5, 29, 4, '#ff6a1f', 0.6);
  }
  body(ctx, P.custom((c) => {
    c.moveTo(24, 35);
    c.quadraticCurveTo(32, 43, 40, 35);
    c.quadraticCurveTo(32, 39, 24, 35);
    c.closePath();
  }), ['#ffd36b', '#2b0c06', '#2b0c06'], { flat: true, out: 1.4 });
  for (const x of [27.5, 31, 34.5, 37.5]) {
    fill(ctx, P.poly([[x - 1.2, 36.6], [x + 1.2, 36.6 + (x > 30 && x < 36 ? 0.8 : 0)], [x, 39]]), '#fff6dc');
  }
}

function scaldingNimbus(ctx) {
  glow(ctx, 32, 32, 16, '#ff6a1f', 0.6);
  body(ctx, P.circle(32, 32, 7), ['#fff6c0', '#ff9b2f', '#c0401a'], { d: 1.4, hi: 1 });
  fill(ctx, P.circle(31, 31, 3.4), '#fff6c0');
  // ring of steam clouds circling the core
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU - Math.PI / 2;
    const x = 32 + Math.cos(a) * 16;
    const y = 32 + Math.sin(a) * 16;
    cloud(ctx, x, y, [[0, 0, 5], [Math.cos(a + 1.6) * 4, Math.sin(a + 1.6) * 4, 3.6]], ['#ffffff', '#fff1d0', '#c9a46a'], { out: 1.6 });
  }
  // scalding droplets
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU - Math.PI / 2 + Math.PI / 6;
    const x = 32 + Math.cos(a) * 11.5;
    const y = 32 + Math.sin(a) * 11.5;
    at(ctx, x, y, a + Math.PI / 2, 1, (c) => body(c, P.custom((p) => {
      p.moveTo(0, -3);
      p.quadraticCurveTo(2.2, 0.5, 0, 1.8);
      p.quadraticCurveTo(-2.2, 0.5, 0, -3);
      p.closePath();
    }), 'gold', { d: 0.5, hi: 0, out: 1.1 }));
  }
}

function shipOfTheLine(ctx) {
  // twin envelopes
  body(ctx, P.ellipse(32, 19, 19, 7.5), ['#fff6d8', '#f1d58a', '#a8781c'], { d: 2, hi: 1.3 });
  detail(ctx, P.custom((c) => { c.moveTo(13.5, 19.5); c.quadraticCurveTo(32, 23, 50.5, 19.5); }), '#8c2f2b', 2);
  for (const x of [22, 32, 42]) detail(ctx, P.custom((c) => { c.moveTo(x, 12); c.quadraticCurveTo(x + 1.6, 19, x, 26); }), '#a8781c', 0.8);
  // rigging
  detail(ctx, P.custom((c) => { c.moveTo(20, 25); c.lineTo(18, 32); c.moveTo(44, 25); c.lineTo(46, 32); c.moveTo(32, 26.5); c.lineTo(32, 32); }), INKC, 1);
  // three-deck hull
  body(ctx, P.custom((c) => {
    c.moveTo(10, 31);
    c.lineTo(54, 31);
    c.lineTo(50, 36);
    c.quadraticCurveTo(46, 46, 32, 47);
    c.quadraticCurveTo(18, 46, 14, 36);
    c.closePath();
  }), 'gold', { d: 2, hi: 1.2 });
  detail(ctx, P.custom((c) => { c.moveTo(13, 36); c.lineTo(51, 36); c.moveTo(16, 41); c.lineTo(48, 41); }), '#7a5420', 0.9);
  // gunports firing
  for (const [y, xs] of [[33.6, [17, 23.5, 30, 36.5, 43, 49]], [38.6, [20, 26, 32, 38, 44]]]) {
    for (const x of xs) {
      fill(ctx, P.rect(x - 1.4, y - 1.1, 2.8, 2.2, 0.4), '#2b1006');
      glow(ctx, x, y, 3, '#ff9b2f', 0.6);
      fill(ctx, P.circle(x, y, 0.8), '#fff3c4');
    }
  }
}

function buzzsawHalo(ctx) {
  body(ctx, P.ring(32, 32, 13.5, 18), 'gold', { rule: 'evenodd', d: 1.4, hi: 1 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    fill(ctx, P.circle(32 + Math.cos(a) * 15.75, 32 + Math.sin(a) * 15.75, 0.8), '#7a5420');
  }
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i / 3) * TAU;
    saw(ctx, 32 + Math.cos(a) * 15.75, 32 + Math.sin(a) * 15.75, 8.6, { teeth: 10, rot: a, kind: 'steel', hub: 'gold' });
  }
  sparkle(ctx, 32, 32, 4.4, '#fffbe0', { glowColor: '#7ff3ff', out: 0.9 });
}

export const PRIMARY_GLYPHS = { brassCannon, gatling, blunderbuss, mortar, aetherLance, harpoon };
export const AUX_GLYPHS = {
  teslaCoil, rocketPods, flakTurret, clockDrones, mineLayer, steamVents, broadside, gyroSaws,
};
export const EVOLUTION_GLYPHS = {
  thunderhead, hellfire, flakStorm, droneArmada, devilsMinefield, scaldingNimbus, shipOfTheLine,
  buzzsawHalo,
};
