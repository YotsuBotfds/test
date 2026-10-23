// Primary arsenal I (WP17): the powder guns — Brass Cannon, Gatling Repeater, Flak Blunderbuss.
// Each def follows DESIGN §12 WP17; numbers per DESIGN §2.6. Shared plumbing: primary-common.js.

import {
  TAU,
  levelTable,
  mul,
  add,
  set,
  all,
  statCtx,
  triggerShots,
  decayKick,
  selfRecoil,
  muzzleAt,
  fan,
  ejectCasing,
  throwWads,
  glowDot,
} from './primary-common.js';

const M = { x: 0, y: 0 };
const M2 = { x: 0, y: 0 };

// =============================================================================================
// Brass Cannon — the reliable broadside piece. Volleys of fat brass balls.
// =============================================================================================

const cannonLv = levelTable(
  { damage: 14, rate: 4, speed: 720, count: 1, spread: 0.1, r: 6, pierce: 0, knockback: 90, size: 1, battery: false },
  'Reliable brass cannonballs: 14 dmg, 4 shots/s.',
  [
    { desc: '+15% damage', apply: mul('damage', 1.15) },
    { desc: '+1 cannonball per volley', apply: add('count', 1) },
    { desc: '+15% fire rate', apply: mul('rate', 1.15) },
    { desc: '+20% damage, heavier shot (+20% size)', apply: all(mul('damage', 1.2), mul('size', 1.2), mul('r', 1.2)) },
    { desc: '+1 cannonball per volley', apply: add('count', 1) },
    { desc: '+15% fire rate, +1 pierce', apply: all(mul('rate', 1.15), add('pierce', 1)) },
    {
      desc: 'Grand Battery: every 4th volley adds an explosive 32-pounder (×2.5 dmg)',
      apply: set('battery', true),
    },
  ],
);

function cannonUpdate(player, wpn, dt, world, input) {
  decayKick(wpn, dt, 9);
  const b = cannonLv.base(wpn.level);
  const sc = statCtx(player, world);
  const shots = triggerShots(wpn, dt, input.firing, 1 / (b.rate * sc.rate));
  for (let s = 0; s < shots; s++) cannonVolley(player, wpn, world, input.angle, b, sc);
}

function cannonVolley(player, wpn, world, aim, b, sc) {
  const d = wpn.data;
  d.volley = (d.volley || 0) + 1;
  const n = b.count + sc.extra;
  const dmg = b.damage * sc.dmg;
  // Volleys: balls leave side-by-side from the barrel with a slight fan.
  const arc = b.spread * sc.spread * (n - 1);
  for (let i = 0; i < n; i++) {
    const side = n > 1 ? (i / (n - 1) - 0.5) * Math.min(18, 7 * (n - 1)) : 0;
    muzzleAt(player, 'brassCannon', M, 0, side);
    const a = aim + fan(i, n, arc) + (world.rng.next() - 0.5) * 0.02;
    world.fire({
      team: 'player',
      kind: 'ball',
      x: M.x,
      y: M.y,
      angle: a,
      speed: b.speed * sc.speed * (0.97 + world.rng.next() * 0.06),
      r: b.r * sc.area,
      scale: b.size * sc.area,
      damage: dmg,
      life: 1.25,
      pierce: b.pierce + sc.pierce,
      bounce: sc.bounce,
      knockback: b.knockback,
      owner: player,
      source: 'primary',
      trail: 'smoke',
      glow: '#ffcf4a',
      glowSize: 2.2,
    });
  }
  // The 32-pounder: every 4th volley at L8.
  const heavy = b.battery && d.volley % 4 === 0;
  muzzleAt(player, 'brassCannon', M);
  if (heavy) {
    world.fire({
      team: 'player',
      kind: 'ball',
      x: M.x,
      y: M.y,
      angle: aim,
      speed: b.speed * sc.speed * 0.85,
      r: b.r * 1.7 * sc.area,
      scale: b.size * 1.8 * sc.area,
      damage: dmg * 2.5,
      life: 1.4,
      pierce: 1 + b.pierce + sc.pierce,
      bounce: sc.bounce,
      knockback: 320,
      owner: player,
      source: 'primary',
      trail: 'fire',
      glow: '#ff9b2f',
      glowSize: 2.6,
      explode: { radius: 62 * sc.area, damage: dmg * 1.4, falloff: 0.4, visual: 'medium', sound: 'explode_medium', shake: 0.12 },
    });
  }
  const fx = world.fx;
  const big = heavy ? 1.75 : 1 + 0.08 * (n - 1);
  fx.muzzle?.(M.x, M.y, aim, big, heavy ? '#ff9b2f' : '#ffd36b');
  // Powder smoke rolls forward and drifts.
  fx.smoke?.(M.x + Math.cos(aim) * 8, M.y + Math.sin(aim) * 8, 0.45 * big, {
    count: heavy ? 4 : 2,
    vx: Math.cos(aim) * 70 + player.vx * 0.5,
    vy: Math.sin(aim) * 70 + player.vy * 0.5,
    alpha: 0.36,
    life: 0.9,
    color: '#ece4d8',
    color1: '#b4aa9c',
  });
  if (heavy) {
    fx.shockwave?.(M.x, M.y, 46, '#ffd9a0', 0.22);
    fx.embers?.(M.x, M.y, 4, { speed: 160 });
    world.shake(0.16);
    world.zoomPunch?.(0.015);
  } else world.shake(0.035);
  wpn.kick = 1;
  selfRecoil(player, aim, heavy ? 70 : 14);
  world.sfx('fire_cannon', M.x, M.y, { pitch: heavy ? 0.7 : 0.95 + world.rng.next() * 0.1, vol: heavy ? 1 : 0.85 });
}

// =============================================================================================
// Gatling Repeater — spins up from 40% to full rate; barrels glow cherry-red with sustained fire.
// =============================================================================================

const gatlingLv = levelTable(
  { damage: 5, rate: 14, speed: 920, count: 1, spread: 0.08, spinTime: 0.6, pierce: 0, knockback: 22 },
  'Spins up to a hail of slugs: 5 dmg, 14 shots/s at full spin.',
  [
    { desc: '+20% damage', apply: mul('damage', 1.2) },
    { desc: '+15% fire rate', apply: mul('rate', 1.15) },
    { desc: 'Oiled bearings: spin-up 0.6 s → 0.35 s, −30% spread', apply: all(set('spinTime', 0.35), mul('spread', 0.7)) },
    { desc: '+25% damage', apply: mul('damage', 1.25) },
    { desc: 'Armour-piercing slugs: +1 pierce', apply: add('pierce', 1) },
    { desc: '+20% fire rate', apply: mul('rate', 1.2) },
    { desc: 'Twin Repeater: +1 slug per shot', apply: add('count', 1) },
  ],
);

function gatlingUpdate(player, wpn, dt, world, input) {
  const d = wpn.data;
  const b = gatlingLv.base(wpn.level);
  const sc = statCtx(player, world);
  d.spin = d.spin || 0;
  d.heat = d.heat || 0;
  d.rot = (d.rot || 0) + dt * (4 + 40 * d.spin);
  if (input.firing) d.spin = Math.min(1, d.spin + dt / b.spinTime);
  else d.spin = Math.max(0, d.spin - dt / 0.9);
  decayKick(wpn, dt, 16);
  const rate = b.rate * sc.rate * (0.4 + 0.6 * d.spin);
  const shots = triggerShots(wpn, dt, input.firing, 1 / rate);
  for (let s = 0; s < shots; s++) gatlingShot(player, wpn, world, input.angle, b, sc);

  // Heat: builds while firing at speed, bleeds off otherwise. Hot barrels glow and vent steam.
  if (input.firing) d.heat = Math.min(1, d.heat + dt * 0.45 * d.spin);
  else d.heat = Math.max(0, d.heat - dt * 0.7);
  d.glowT = (d.glowT || 0) - dt;
  if (d.heat > 0.15 && d.glowT <= 0) {
    d.glowT = 0.04;
    muzzleAt(player, 'gatling', M2, -6);
    const h = d.heat;
    glowDot(world, M2.x, M2.y, player.vx * 0.8, player.vy * 0.8, 0.09, 8 + 16 * h, h > 0.6 ? '#ffd27a' : '#ff6a2a', '#a01808', 4);
    if (!input.firing && world.rng.next() < 0.35 * h) {
      world.fx.steam?.(M2.x, M2.y, (player.aim ?? 0) - Math.PI / 2, 0.4, { count: 1, alpha: 0.4 });
    }
  }
  // Release from a hot spin: a hiss of venting steam.
  if (d.wasFiring && !input.firing && d.heat > 0.4) {
    muzzleAt(player, 'gatling', M2, -4);
    world.fx.steam?.(M2.x, M2.y, (player.aim ?? 0) + Math.PI * 0.5, 0.7, { count: 4, alpha: 0.55 });
    world.sfx('steam_vent', M2.x, M2.y, { vol: 0.25, pitch: 1.4 });
  }
  d.wasFiring = input.firing;
  // The spinning barrel cluster reads as a faster kick shimmer at full spin.
  if (input.firing && d.spin > 0.2) wpn.kick = Math.max(wpn.kick, 0.15 + 0.12 * Math.sin(d.rot * 3) * d.spin);
}

function gatlingShot(player, wpn, world, aim, b, sc) {
  const d = wpn.data;
  const rng = world.rng;
  const n = b.count + sc.extra;
  // Barrels rotate: alternate the exit point around the cluster.
  d.barrel = ((d.barrel || 0) + 1) % 6;
  const side = Math.sin((d.barrel / 6) * TAU) * 3.2;
  const jit = b.spread * sc.spread * (1.25 - 0.35 * d.spin);
  const dmg = b.damage * sc.dmg;
  for (let i = 0; i < n; i++) {
    const off = n > 1 ? (i / (n - 1) - 0.5) * 8 : 0;
    muzzleAt(player, 'gatling', M, 0, side + off);
    const a = aim + (rng.next() - 0.5) * jit + fan(i, n, 0.06 * (n - 1));
    world.fire({
      team: 'player',
      kind: 'bullet',
      x: M.x,
      y: M.y,
      angle: a,
      speed: b.speed * sc.speed * (0.94 + rng.next() * 0.12),
      r: 4 * sc.area,
      scale: sc.area,
      damage: dmg,
      life: 0.85,
      pierce: b.pierce + sc.pierce,
      bounce: sc.bounce,
      knockback: b.knockback,
      owner: player,
      source: 'primary',
      glow: d.heat > 0.6 ? '#ff9b5a' : '#ffcf4a',
      glowSize: 1.8,
    });
  }
  muzzleAt(player, 'gatling', M, 0, side);
  const fx = world.fx;
  fx.muzzle?.(M.x, M.y, aim + (rng.next() - 0.5) * 0.2, 0.42 + 0.12 * d.spin, d.heat > 0.6 ? '#ffb070' : '#ffd36b');
  if (rng.next() < 0.3) {
    fx.smoke?.(M.x, M.y, 0.22, { count: 1, vx: Math.cos(aim) * 50, vy: Math.sin(aim) * 50, alpha: 0.28, life: 0.6 });
  }
  // Casings spill out of the right-hand ejector on the receiver.
  muzzleAt(player, 'gatling', M2, -18, 5);
  ejectCasing(world, M2.x, M2.y, aim);
  wpn.kick = Math.min(1, (wpn.kick || 0) + 0.32);
  world.shake(0.012);
  selfRecoil(player, aim, 2.2);
  world.sfx('fire_gatling', M.x, M.y, { pitch: 0.85 + 0.3 * d.spin + (rng.next() - 0.5) * 0.06, vol: 0.55 + 0.25 * d.spin });
}

// =============================================================================================
// Flak Blunderbuss — a point-blank storm of pellets that bleed speed and die at short range.
// =============================================================================================

const blunderLv = levelTable(
  { damage: 6, rate: 1.6, speed: 860, count: 6, spread: 0.55, life: 0.45, drag: 3.2, pierce: 0, knockback: 150, burn: false },
  'Point-blank pellet storm: 6 pellets × 6 dmg, huge knockback.',
  [
    { desc: '+2 pellets', apply: add('count', 2) },
    { desc: '+20% damage', apply: mul('damage', 1.2) },
    { desc: '+15% fire rate', apply: mul('rate', 1.15) },
    { desc: '+2 pellets', apply: add('count', 2) },
    { desc: '+25% damage, +20% range', apply: all(mul('damage', 1.25), mul('life', 1.2)) },
    { desc: 'Chain-shot: pellets pierce +1 foe, +15% fire rate', apply: all(add('pierce', 1), mul('rate', 1.15)) },
    { desc: "Dragon's Breath: pellets set foes ablaze", apply: set('burn', true) },
  ],
);

function blunderUpdate(player, wpn, dt, world, input) {
  decayKick(wpn, dt, 5.5);
  const b = blunderLv.base(wpn.level);
  const sc = statCtx(player, world);
  const shots = triggerShots(wpn, dt, input.firing, 1 / (b.rate * sc.rate));
  for (let s = 0; s < shots; s++) blunderBlast(player, wpn, world, input.angle, b, sc);
  // Smouldering muzzle between shots.
  const d = wpn.data;
  d.smT = (d.smT || 0) - dt;
  if (d.hot > 0) {
    d.hot -= dt;
    if (d.smT <= 0) {
      d.smT = 0.09;
      muzzleAt(player, 'blunderbuss', M2, 2);
      world.fx.smokeTrail?.(M2.x, M2.y, 0.3, { alpha: 0.25, life: 0.6 });
    }
  }
}

function blunderBlast(player, wpn, world, aim, b, sc) {
  const rng = world.rng;
  const n = b.count + sc.extra * 2;
  const arc = b.spread * sc.spread;
  const dmg = b.damage * sc.dmg;
  muzzleAt(player, 'blunderbuss', M);
  for (let i = 0; i < n; i++) {
    // Jittered fan: even coverage, never a perfect comb.
    const a = aim + fan(i, n, arc) + (rng.next() - 0.5) * (arc / Math.max(2, n)) * 1.4;
    const sp = b.speed * sc.speed * (0.75 + rng.next() * 0.45);
    world.fire({
      team: 'player',
      kind: 'pellet',
      x: M.x + (rng.next() - 0.5) * 6,
      y: M.y + (rng.next() - 0.5) * 6,
      angle: a,
      speed: sp,
      drag: b.drag,
      minSpeed: 120,
      r: 5 * sc.area,
      scale: (1.1 + rng.next() * 0.35) * sc.area,
      damage: dmg,
      life: b.life * (0.85 + rng.next() * 0.3),
      pierce: b.pierce + sc.pierce,
      bounce: sc.bounce,
      knockback: b.knockback,
      burn: b.burn ? { dps: 7 * sc.dmg, time: 2.5 } : null,
      owner: player,
      source: 'primary',
      trail: b.burn ? 'fire' : 'spark',
      glow: b.burn ? '#ff7a2a' : '#ffcf4a',
      glowSize: 2,
      update: pelletFade,
    });
  }
  const fx = world.fx;
  fx.muzzle?.(M.x, M.y, aim, 1.9, b.burn ? '#ff8a3a' : '#ffd36b');
  fx.flare?.(M.x + Math.cos(aim) * 14, M.y + Math.sin(aim) * 14, 46, '#fff0c0', 0.12);
  fx.sparks?.(M.x, M.y, aim, 10, b.burn ? '#ffb070' : '#ffe9a8', arc * 1.3, { speed: 620, life: 0.26 });
  // A big rolling bank of black-powder smoke.
  fx.smoke?.(M.x + Math.cos(aim) * 18, M.y + Math.sin(aim) * 18, 0.85, {
    count: 4,
    vx: Math.cos(aim) * 120 + player.vx * 0.4,
    vy: Math.sin(aim) * 120 + player.vy * 0.4,
    spread: 70,
    alpha: 0.36,
    life: 0.95,
    color: '#ece4d8',
    color1: '#b4aa9c',
  });
  throwWads(world, M.x, M.y, aim, 3);
  if (b.burn) fx.embers?.(M.x, M.y, 6, { speed: 220 });
  wpn.data.hot = 0.6;
  wpn.kick = 1;
  selfRecoil(player, aim, 95);
  world.shake(0.14);
  world.zoomPunch?.(0.012);
  world.sfx('fire_blunderbuss', M.x, M.y, { pitch: 0.92 + rng.next() * 0.12 });
}

/** Pellets shrink and dim as they bleed speed, so their short reach reads clearly. */
function pelletFade(p) {
  const k = p.t / p.life;
  if (k > 0.55) p.alpha = Math.max(0.15, 1 - (k - 0.55) / 0.45);
}

// =============================================================================================

export const brassCannon = {
  id: 'brassCannon',
  name: 'Brass Cannon',
  desc: 'Reliable brass cannonballs. Calibrate for extra balls per volley.',
  icon: 'icon_brassCannon',
  turret: 'turret_brassCannon',
  sfx: 'fire_cannon',
  maxLevel: 8,
  unlock: null,
  levelDesc: cannonLv.levelDesc,
  base: cannonLv.base,
  update: cannonUpdate,
};

export const gatling = {
  id: 'gatling',
  name: 'Gatling Repeater',
  desc: 'A hail of brass slugs once the barrels spin up. Runs hot.',
  icon: 'icon_gatling',
  turret: 'turret_gatling',
  sfx: 'fire_gatling',
  maxLevel: 8,
  unlock: { cogs: 300 },
  levelDesc: gatlingLv.levelDesc,
  base: gatlingLv.base,
  update: gatlingUpdate,
};

export const blunderbuss = {
  id: 'blunderbuss',
  name: 'Flak Blunderbuss',
  desc: 'Point-blank pellet storm with brutal knockback. Get close.',
  icon: 'icon_blunderbuss',
  turret: 'turret_blunderbuss',
  sfx: 'fire_blunderbuss',
  maxLevel: 8,
  unlock: { cogs: 400 },
  levelDesc: blunderLv.levelDesc,
  base: blunderLv.base,
  update: blunderUpdate,
};
