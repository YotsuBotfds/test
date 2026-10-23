// Primary arsenal II (WP17): the specialist pieces — Siege Mortar, Aether Lance, Harpoon Gun.
// Each def follows DESIGN §12 WP17; numbers per DESIGN §2.6. Shared plumbing: primary-common.js.

import { Sprites } from '../../gfx/sprites.js';
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
  glowDot,
  hitInfo,
} from './primary-common.js';

const M = { x: 0, y: 0 };
const M2 = { x: 0, y: 0 };
const NEAR = [];

// =============================================================================================
// Siege Mortar — lobbed shells to the aim point; no collision in flight; burst on landing.
// =============================================================================================

const MORTAR_MIN = 120;
const MORTAR_MAX = 520;

const mortarLv = levelTable(
  { damage: 30, rate: 1.4, speed: 0, count: 1, radius: 70, flight: 1, burn: false, cluster: false, aoe: 70 },
  'Lobbed shells burst on landing: 30 dmg in a 70 radius.',
  [
    { desc: '+20% damage', apply: mul('damage', 1.2) },
    { desc: '+20% blast radius', apply: all(mul('radius', 1.2), mul('aoe', 1.2)) },
    { desc: '+1 shell per salvo', apply: add('count', 1) },
    { desc: '+15% fire rate, −15% flight time', apply: all(mul('rate', 1.15), mul('flight', 0.85)) },
    { desc: 'Incendiary shells: blasts set foes ablaze', apply: set('burn', true) },
    { desc: '+25% damage, +15% blast radius', apply: all(mul('damage', 1.25), mul('radius', 1.15), mul('aoe', 1.15)) },
    { desc: 'Cluster shells: each blast scatters 3 bomblets', apply: set('cluster', true) },
  ],
);

/** Where the mortar is aimed, in world units from the turret (DESIGN WP17 spec). */
function mortarRange(player) {
  const c = player.controls || {};
  let d;
  if (c.aimMode === 'mouse' && c.mouseWorld) {
    muzzleAt(player, 'mortar', M2);
    d =Math.hypot(c.mouseWorld.x - M2.x, c.mouseWorld.y - M2.y);
  } else if ((c.aimMag || 0) > 0.15) {
    d = c.aimMag * MORTAR_MAX;
  } else {
    d = player.aimDist ?? 300; // auto-aim / aim assist tracked distance
  }
  return Math.max(MORTAR_MIN, Math.min(MORTAR_MAX, d || 300));
}

function mortarUpdate(player, wpn, dt, world, input) {
  decayKick(wpn, dt, 4);
  const d = wpn.data;
  const b = mortarLv.base(wpn.level);
  const sc = statCtx(player, world);
  // Smoothed range so the reticle glides rather than jitters.
  const want = mortarRange(player);
  d.range = d.range ? d.range + (want - d.range) * Math.min(1, dt * 14) : want;
  d.radius = b.radius * sc.area + sc.explosive * sc.area * 0.5;
  d.aim = input.angle;
  d.firing = input.firing;
  d.ready = 1 - Math.max(0, Math.min(1, (wpn.cd || 0) * b.rate * sc.rate));
  ensureReticle(player, wpn, world);
  const shots = triggerShots(wpn, dt, input.firing, 1 / (b.rate * sc.rate));
  for (let s = 0; s < shots; s++) mortarSalvo(player, wpn, world, input.angle, b, sc);
}

function mortarSalvo(player, wpn, world, aim, b, sc) {
  const d = wpn.data;
  const rng = world.rng;
  const n = b.count + sc.extra;
  const radius = d.radius;
  muzzleAt(player, 'mortar', M);
  const tx0 = M.x + Math.cos(aim) * d.range;
  const ty0 = M.y + Math.sin(aim) * d.range;
  const dmg = b.damage * sc.dmg;
  const burnRoll = sc.burnChance > 0 && rng.next() < sc.burnChance;
  for (let i = 0; i < n; i++) {
    // Extra shells walk a ring around the aim point (first one dead-centre).
    let tx = tx0;
    let ty = ty0;
    if (i > 0) {
      const a = aim + ((i - 1) / Math.max(1, n - 1)) * TAU + Math.PI / 2;
      const rr = radius * (0.75 + 0.15 * spreadScale(sc));
      tx += Math.cos(a) * rr;
      ty += Math.sin(a) * rr;
    }
    tx += (rng.next() - 0.5) * 14;
    ty += (rng.next() - 0.5) * 14;
    const dist = Math.hypot(tx - M.x, ty - M.y);
    const time = ((0.42 + dist / 900) * b.flight) / sc.speed + i * 0.06;
    const burn = b.burn || burnRoll ? { dps: 8 * sc.dmg, time: 3 } : undefined;
    world.fire({
      team: 'player',
      kind: 'shell',
      x: M.x,
      y: M.y,
      angle: aim,
      r: 7 * sc.area,
      scale: 1.15 * sc.area,
      damage: dmg,
      lob: { tx, ty, time, height: Math.min(260, 70 + dist * 0.42), marker: false },
      explode: {
        radius,
        damage: dmg,
        falloff: 0.35,
        visual: false, // landing visuals are ours (shellLand): sized to read, cheap to draw
        sound: false,
        knockback: radius * 2.4,
        burn,
      },
      spin: (rng.next() < 0.5 ? -1 : 1) * 5,
      glow: '#ffb347',
      glowSize: 2.2,
      owner: player,
      source: 'primary',
      update: shellTrail,
      draw: drawShell,
      onLand: b.cluster ? shellLandCluster : shellLand,
      data: { radius, burn: !!burn, dmg, area: sc.area },
    });
  }
  const fx = world.fx;
  // Mortars fire skyward: a fat upward flash, a thick smoke column, the ship dips.
  fx.muzzle?.(M.x, M.y, aim, 1.35, '#ffcf6b');
  fx.flare?.(M.x, M.y, 40, '#ffe8b0', 0.14);
  fx.smoke?.(M.x, M.y, 0.7, {
    count: 2,
    spread: 40,
    alpha: 0.38,
    life: 1.1,
    vx: player.vx * 0.3,
    vy: player.vy * 0.3 - 20,
    color: '#ece4d8',
    color1: '#b4aa9c',
  });
  fx.ring?.(M.x, M.y, 30, '#fff3c4', 0.22, { width: 2, r0: 8 });
  wpn.kick = 1;
  selfRecoil(player, aim, 30);
  world.shake(0.07);
  world.sfx('fire_mortar', M.x, M.y, { pitch: 0.95 + rng.next() * 0.1 });
}

function spreadScale(sc) {
  return Math.max(0, Math.min(2, sc.spread - 1));
}

/** Shell in flight: smoke & spark trail, thicker at the top of its arc. */
function shellTrail(p, dt, w) {
  p.data.tt = (p.data.tt || 0) - dt;
  if (p.data.tt > 0) return;
  p.data.tt = 0.05;
  const y = p.y - p.z;
  p.data.tn = (p.data.tn || 0) + 1;
  if (p.data.tn & 1) w.fx.smokeTrail?.(p.x, y, 0.32 * (p.data.area || 1), { alpha: 0.3, life: 0.6, fire: p.data.burn });
  glowDot(w, p.x, y, 0, 0, 0.18, 7, '#ffd27a', '#ff6a2a', 1);
}

/** Shell sprite (scaled by height) + a closing gold landing ring at the target. */
function drawShell(ctx, p) {
  const L = p.lob;
  if (!L) return;
  const k = Math.min(1, p.t / L.time);
  const r = p.data.radius || 60;
  // Landing marker: dashed rim + a fill that closes in as the shell drops.
  ctx.globalAlpha = 0.25 + 0.5 * k;
  ctx.strokeStyle = p.data.burn ? '#ff9b4a' : '#ffcf4a';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.lineDashOffset = -p.t * 40;
  ctx.beginPath();
  ctx.arc(L.tx, L.ty, r, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.06 + 0.12 * k;
  ctx.fillStyle = p.data.burn ? '#ff7a2a' : '#ffcf4a';
  ctx.beginPath();
  ctx.arc(L.tx, L.ty, r * (1 - k * 0.85), 0, TAU);
  ctx.arc(L.tx, L.ty, r, 0, TAU, true);
  ctx.fill();
  ctx.globalAlpha = 1;
  const sc = p.scale * (1 + (0.7 * p.z) / Math.max(1, L.height));
  Sprites.draw(ctx, p.sprite, p.x, p.y - p.z, p.rot, sc, p.alpha);
}

function shellLand(p, w) {
  const r = p.data.radius || 60;
  const fx = w.fx;
  fx.explosion?.(p.x, p.y, Math.min(1.5, 0.55 + r / 110), { palette: p.data.burn ? 'fire' : undefined, debris: false });
  fx.shockwave?.(p.x, p.y, r * 1.1, p.data.burn ? '#ffb070' : '#ffd9a0', 0.32);
  fx.ring?.(p.x, p.y, r, '#fff3c4', 0.25, { width: 2, r0: r * 0.6 });
  w.sfx('mortar_land', p.x, p.y, { pitch: 0.9 + w.rng.next() * 0.2 });
  w.shake(0.09 + Math.min(0.08, r / 1500));
  w.fx.smoke?.(p.x, p.y, r / 70, { count: 2, layer: 'low', dark: true, alpha: 0.4, life: 1.5, spread: 40 });
  w.fx.debris?.(p.x, p.y, 2, 'iron', { speed: 200, scale: 0.6 });
  if (p.data.burn) w.fx.embers?.(p.x, p.y, 8, { speed: 150 });
  w.hitstop?.(0.015);
}

function shellLandCluster(p, w) {
  shellLand(p, w);
  const rng = w.rng;
  const r = p.data.radius || 60;
  const owner = p.owner;
  if (!owner) return;
  const base = rng.next() * TAU;
  for (let i = 0; i < 3; i++) {
    const a = base + (i / 3) * TAU + (rng.next() - 0.5) * 0.6;
    const d = r * (0.9 + rng.next() * 0.5);
    const br = r * 0.5;
    w.fire({
      team: 'player',
      kind: 'shell',
      x: p.x,
      y: p.y,
      angle: a,
      r: 4,
      scale: 0.65 * (p.data.area || 1),
      damage: p.data.dmg * 0.4,
      lob: { tx: p.x + Math.cos(a) * d, ty: p.y + Math.sin(a) * d, time: 0.32 + rng.next() * 0.12, height: 50, marker: false },
      explode: {
        radius: br,
        damage: p.data.dmg * 0.4,
        visual: 'small',
        sound: 'explode_small',
        shake: 0.02,
        knockback: br * 2,
        burn: p.data.burn ? { dps: 5, time: 2 } : undefined,
      },
      spin: 12,
      glow: '#ffb347',
      glowSize: 1.8,
      owner,
      source: 'primary',
      crit: p.crit,
      update: shellTrail,
      data: { radius: br, burn: p.data.burn, area: (p.data.area || 1) * 0.6 },
    });
  }
}

// --- Aiming reticle: a persistent, non-colliding player projectile whose draw hook paints the
// target circle where the next salvo will land (the projectile layer is drawn above ships).

function ensureReticle(player, wpn, world) {
  const d = wpn.data;
  const r = d.reticle;
  if (r && r.alive && r.gen === d.reticleGen && r.data?.wpn === wpn) {
    r.data.seen = world.time;
    return;
  }
  const p = world.fire({
    team: 'player',
    kind: 'reticle',
    x: player.x,
    y: player.y,
    speed: 0,
    life: 1e9,
    r: 1,
    damage: 0,
    crit: false,
    glow: null,
    hitEnemies: false,
    hitPlayers: false,
    noExplosive: true,
    noBurnChance: true,
    owner: null, // no owner: not counted as a shot
    source: 'primary:reticle',
    update: reticleUpdate,
    draw: reticleDraw,
    data: { wpn, player, seen: world.time, fade: 0 },
  });
  d.reticle = p;
  d.reticleGen = p?.gen;
}

function reticleUpdate(p, dt, w) {
  const { wpn, player } = p.data;
  // Retire if the weapon was swapped, the ship went down, or we stopped being updated.
  if (!player || !player.alive || player.primary !== wpn || w.time - p.data.seen > 0.25) {
    p.kill();
    return;
  }
  const d = wpn.data;
  const want = d.firing || player.controls?.aimMode === 'mouse' || (player.controls?.aimMag || 0) > 0.15 ? 1 : 0.35;
  p.data.fade += (want - p.data.fade) * Math.min(1, dt * 8);
  muzzleAt(player, 'mortar', M2);
  p.x = M2.x + Math.cos(d.aim) * d.range;
  p.y = M2.y + Math.sin(d.aim) * d.range;
}

function reticleDraw(ctx, p, w) {
  const { wpn } = p.data;
  const d = wpn.data;
  const a = p.data.fade;
  if (a < 0.02) return;
  const r = Math.max(18, d.radius || 70);
  const t = w.time;
  const ready = d.ready ?? 1;
  ctx.translate(p.x, p.y);
  ctx.globalCompositeOperation = 'lighter';
  // Outer rim with 4 rotating gun-sight ticks.
  ctx.globalAlpha = 0.42 * a;
  ctx.strokeStyle = '#ffcf4a';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 0.85 * a;
  ctx.lineWidth = 2.4;
  const rot = t * 0.8;
  for (let i = 0; i < 4; i++) {
    const ang = rot + (i * TAU) / 4;
    ctx.beginPath();
    ctx.arc(0, 0, r, ang - 0.22, ang + 0.22);
    ctx.stroke();
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    ctx.beginPath();
    ctx.moveTo(c * (r - 9), s * (r - 9));
    ctx.lineTo(c * (r + 5), s * (r + 5));
    ctx.stroke();
  }
  // Reload gauge: inner arc fills as the next salvo is ready.
  ctx.globalAlpha = 0.6 * a;
  ctx.strokeStyle = ready >= 1 ? '#fff3c4' : '#ff9b4a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.32, -Math.PI / 2, -Math.PI / 2 + TAU * ready);
  ctx.stroke();
  // Centre pip.
  ctx.globalAlpha = 0.9 * a;
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath();
  ctx.arc(0, 0, 2.5, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

// =============================================================================================
// Aether Lance — infinite-pierce bolts of bottled lightning.
// =============================================================================================

const lanceLv = levelTable(
  { damage: 22, rate: 2.2, speed: 1400, count: 1, arcs: 0, overcharge: false, width: 1 },
  'Infinite-pierce aether bolts: 22 dmg, 2.2 shots/s.',
  [
    { desc: '+20% damage', apply: mul('damage', 1.2) },
    { desc: '+15% fire rate', apply: mul('rate', 1.15) },
    { desc: 'Arc discharge: each hit jumps a spark to 1 nearby foe', apply: add('arcs', 1) },
    { desc: '+25% damage, thicker bolt', apply: all(mul('damage', 1.25), mul('width', 1.25)) },
    { desc: '+1 bolt (twin lance)', apply: add('count', 1) },
    { desc: '+20% fire rate, +15% bolt speed, +1 arc', apply: all(mul('rate', 1.2), mul('speed', 1.15), add('arcs', 1)) },
    { desc: 'Overcharge: every 3rd shot is a massive beam (×2.5 dmg)', apply: set('overcharge', true) },
  ],
);

function lanceUpdate(player, wpn, dt, world, input) {
  decayKick(wpn, dt, 8);
  const d = wpn.data;
  const b = lanceLv.base(wpn.level);
  const sc = statCtx(player, world);
  const interval = 1 / (b.rate * sc.rate);
  const shots = triggerShots(wpn, dt, input.firing, interval);
  for (let s = 0; s < shots; s++) lanceShot(player, wpn, world, input.angle, b, sc);
  // Charging motes gather at the emitter as the next bolt readies.
  d.moteT = (d.moteT || 0) - dt;
  const charge = 1 - Math.max(0, Math.min(1, (wpn.cd || 0) / interval));
  if (d.moteT <= 0) {
    d.moteT = input.firing ? 0.03 : 0.12;
    muzzleAt(player, 'aetherLance', M2, -2);
    const ang = world.rng.next() * TAU;
    const rr = 14 + 10 * (1 - charge);
    const next = b.overcharge && (d.shots || 0) % 3 === 2;
    glowDot(world, M2.x + Math.cos(ang) * rr, M2.y + Math.sin(ang) * rr, -Math.cos(ang) * rr * 4 + player.vx,
      -Math.sin(ang) * rr * 4 + player.vy, 0.2, (next ? 6 : 4) * (0.5 + charge), next ? '#e0fbff' : '#7ff3ff', '#2a8fa8', 1);
  }
}

function lanceShot(player, wpn, world, aim, b, sc) {
  const d = wpn.data;
  const rng = world.rng;
  d.shots = (d.shots || 0) + 1;
  const over = b.overcharge && d.shots % 3 === 0;
  const n = b.count + sc.extra;
  const dmg = b.damage * sc.dmg * (over ? 2.5 : 1);
  const w = b.width * (over ? 2.1 : 1);
  const arcs = b.arcs + sc.bounce + (over ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const side = n > 1 ? (i / (n - 1) - 0.5) * 12 : 0;
    muzzleAt(player, 'aetherLance', M, 0, side);
    const a = aim + fan(i, n, 0.035 * (n - 1) * sc.spread);
    world.fire({
      team: 'player',
      kind: 'lance',
      x: M.x,
      y: M.y,
      angle: a,
      speed: b.speed * sc.speed * (over ? 1.15 : 1),
      r: 5 * w * sc.area,
      scale: w * sc.area,
      damage: dmg,
      life: 0.9,
      pierce: Infinity,
      knockback: over ? 120 : 40,
      element: 'shock',
      owner: player,
      source: 'primary',
      trail: lanceTrail,
      glow: over ? '#c8fbff' : '#7ff3ff',
      glowSize: over ? 3.4 : 2.6,
      onHit: arcs > 0 ? lanceArc : lanceSpark,
      data: { arcs, dmg, over },
    });
    if (over) {
      // A searing beam flash along the first stretch of the shot.
      const len = 520 * sc.speed;
      world.fx.beam?.(M.x, M.y, M.x + Math.cos(a) * len, M.y + Math.sin(a) * len, 10 * sc.area, '#9ff6ff', 0.16);
    }
  }
  muzzleAt(player, 'aetherLance', M);
  const fx = world.fx;
  fx.muzzle?.(M.x, M.y, aim, over ? 1.4 : 0.75, '#7ff3ff');
  fx.flare?.(M.x, M.y, over ? 70 : 34, '#c8fbff', over ? 0.2 : 0.12);
  // Crackle: two short jagged arcs leap from the emitter coils.
  for (let k = 0; k < (over ? 4 : 2); k++) {
    const a = aim + (rng.next() - 0.5) * 1.6;
    const len = 24 + rng.next() * (over ? 50 : 26);
    fx.lightning?.(M.x, M.y, M.x + Math.cos(a) * len, M.y + Math.sin(a) * len, {
      color: '#9ff6ff',
      width: over ? 2.4 : 1.6,
      life: 0.09,
      branches: 1,
      sparks: false,
    });
  }
  if (over) {
    fx.shockwave?.(M.x, M.y, 60, '#7ff3ff', 0.25);
    world.shake(0.1);
    world.flash?.('#bff8ff', 0.06);
  } else world.shake(0.03);
  wpn.kick = over ? 1 : 0.7;
  selfRecoil(player, aim, over ? 45 : 10);
  world.sfx('fire_lance', M.x, M.y, { pitch: over ? 0.75 : 0.95 + rng.next() * 0.12, vol: over ? 1 : 0.8 });
  if (over) world.sfx('tesla_zap', M.x, M.y, { vol: 0.5, pitch: 0.8 });
}

/** Aether streamer: twin cyan wisps that peel off the bolt. */
function lanceTrail(p, w) {
  const back = p.angle + Math.PI;
  const c = Math.cos(back);
  const s = Math.sin(back);
  const over = p.data?.over;
  for (let i = 0; i < (over ? 3 : 2); i++) {
    const side = (w.rng.next() - 0.5) * 6 * p.scale;
    w.particles?.spawn?.({
      x: p.x + c * 10 * p.scale - s * side,
      y: p.y + s * 10 * p.scale + c * side,
      vx: c * 40 + (w.rng.next() - 0.5) * 50,
      vy: s * 40 + (w.rng.next() - 0.5) * 50,
      life: over ? 0.45 : 0.32,
      size: (over ? 9 : 6) * p.scale,
      size1: 1,
      color: i === 0 ? '#e0fbff' : '#7ff3ff',
      color1: '#1f8fa0',
      blend: 'add',
      layer: 'add',
    });
  }
}

function lanceSpark(p, target, w) {
  w.fx.sparks?.(target.x, target.y, p.angle, 3, '#9ff6ff', 1.4, { speed: 300, life: 0.18 });
}

/** Arc discharge: zap the nearest unhit foes near the struck target. */
function lanceArc(p, target, w) {
  lanceSpark(p, target, w);
  let from = target;
  let left = p.data.arcs;
  const owner = p.owner;
  const dmg = p.data.dmg * 0.35;
  const hit = p.hitSet;
  while (left-- > 0) {
    NEAR.length = 0;
    w.queryEnemies(from.x, from.y, 170, NEAR);
    let best = null;
    let bd = Infinity;
    for (let i = 0; i < NEAR.length; i++) {
      const e = NEAR[i];
      if (!e.alive || e === from || e === target || hit.includes(e.id)) continue;
      const dd = (e.x - from.x) ** 2 + (e.y - from.y) ** 2;
      if (dd < bd) {
        bd = dd;
        best = e;
      }
    }
    if (!best) break;
    w.fx.lightning?.(from.x, from.y, best.x, best.y, { color: '#9ff6ff', width: 2, life: 0.14, branches: 1 });
    const info = hitInfo(owner, Math.atan2(best.y - from.y, best.x - from.x), 0, 'shock', false);
    info.small = true;
    w.damageEnemy(best, dmg, info);
    info.small = false;
    // Mark so the bolt and later arcs don't double-dip this foe.
    hit.push(best.id);
    from = best;
  }
  NEAR.length = 0;
}

// =============================================================================================
// Harpoon Gun — barbed harpoons that skewer lines of foes, trailing a chain back to the ship.
// =============================================================================================

const harpoonLv = levelTable(
  { damage: 28, rate: 1.5, speed: 800, count: 1, pierce: 3, knockback: 320, spread: 0.14, tipBurst: false },
  'Barbed harpoons pierce 3 foes: 28 dmg, heavy knockback.',
  [
    { desc: '+20% damage', apply: mul('damage', 1.2) },
    { desc: '+1 pierce', apply: add('pierce', 1) },
    { desc: '+15% fire rate', apply: mul('rate', 1.15) },
    { desc: '+20% damage, +30% knockback', apply: all(mul('damage', 1.2), mul('knockback', 1.3)) },
    { desc: '+1 harpoon per shot', apply: add('count', 1) },
    { desc: '+1 pierce, +15% damage, +15% harpoon speed', apply: all(add('pierce', 1), mul('damage', 1.15), mul('speed', 1.15)) },
    { desc: 'Detonating tips: harpoons burst at the end of their run', apply: set('tipBurst', true) },
  ],
);

function harpoonUpdate(player, wpn, dt, world, input) {
  decayKick(wpn, dt, 5);
  const b = harpoonLv.base(wpn.level);
  const sc = statCtx(player, world);
  const shots = triggerShots(wpn, dt, input.firing, 1 / (b.rate * sc.rate));
  for (let s = 0; s < shots; s++) harpoonShot(player, wpn, world, input.angle, b, sc);
}

function harpoonShot(player, wpn, world, aim, b, sc) {
  const rng = world.rng;
  const n = b.count + sc.extra;
  const dmg = b.damage * sc.dmg;
  const arc = b.spread * sc.spread * (n - 1);
  for (let i = 0; i < n; i++) {
    muzzleAt(player, 'harpoon', M);
    const a = aim + fan(i, n, arc);
    // Live endpoints for the tether: the chain follows ship and harpoon while it lasts.
    const anchor = { x: M.x, y: M.y };
    const tip = { x: M.x, y: M.y };
    world.fire({
      team: 'player',
      kind: 'harpoon',
      x: M.x,
      y: M.y,
      angle: a,
      speed: b.speed * sc.speed,
      drag: 0.6,
      r: 7 * sc.area,
      scale: 1.1 * sc.area,
      damage: dmg,
      life: 0.95,
      pierce: b.pierce + sc.pierce,
      bounce: sc.bounce,
      knockback: b.knockback,
      owner: player,
      source: 'primary',
      trail: 'steam',
      glow: '#ffe2a0',
      glowSize: 1.6,
      update: harpoonFly,
      onHit: harpoonHit,
      explode: b.tipBurst
        ? { radius: 64 * sc.area, damage: dmg * 0.7, falloff: 0.3, visual: 'medium', sound: 'explode_medium', shake: 0.08 }
        : null,
      data: { anchor, tip, player, tether: 0.45 },
    });
    world.fx.chain?.(anchor.x, anchor.y, tip.x, tip.y, { from: anchor, to: tip, life: 0.5, color: '#b8c0c8', link: 7, sag: 0.06 });
  }
  muzzleAt(player, 'harpoon', M);
  const fx = world.fx;
  // Pneumatic launch: a sharp steam blast rather than a powder flash.
  fx.muzzle?.(M.x, M.y, aim, 0.9, '#fff0d0');
  fx.steam?.(M.x, M.y, aim + 2.2, 0.9, { count: 3 });
  fx.steam?.(M.x, M.y, aim - 2.2, 0.9, { count: 3 });
  fx.steam?.(M.x, M.y, aim, 0.7, { count: 2, speed: 1.6 });
  wpn.kick = 1;
  selfRecoil(player, aim, 40);
  world.shake(0.06);
  world.sfx('fire_harpoon', M.x, M.y, { pitch: 0.95 + rng.next() * 0.1 });
}

/** Keep the tether endpoints on the ship's muzzle and the harpoon's tail. */
function harpoonFly(p) {
  const d = p.data;
  const pl = d.player;
  if (pl && pl.alive) muzzleAt(pl, 'harpoon', d.anchor);
  const c = Math.cos(p.angle);
  const s = Math.sin(p.angle);
  d.tip.x = p.x - c * 16 * p.scale;
  d.tip.y = p.y - s * 16 * p.scale;
}

function harpoonHit(p, target, w) {
  // Skewer: metal shrapnel, a heavier thunk, and the impaled ship lurches.
  w.fx.sparks?.(target.x, target.y, p.angle + Math.PI, 6, '#ffe9a8', 1.2, { speed: 360 });
  w.fx.debris?.(target.x, target.y, 2, 'metal', { angle: p.angle, spread: 0.8, speed: 180, scale: 0.6 });
  w.hitstop?.(0.02);
  w.shake(0.04);
  if (target.alive && !target.isBoss && !target.parent) target.flash = 1;
}

// =============================================================================================

export const mortar = {
  id: 'mortar',
  name: 'Siege Mortar',
  desc: 'Lobbed shells that sail over everything and burst on landing.',
  icon: 'icon_mortar',
  turret: 'turret_mortar',
  sfx: 'fire_mortar',
  maxLevel: 8,
  unlock: { cogs: 600 },
  levelDesc: mortarLv.levelDesc,
  base: mortarLv.base,
  update: mortarUpdate,
};

export const aetherLance = {
  id: 'aetherLance',
  name: 'Aether Lance',
  desc: 'Bolts of bottled lightning that pierce every foe in line.',
  icon: 'icon_aetherLance',
  turret: 'turret_aetherLance',
  sfx: 'fire_lance',
  maxLevel: 8,
  unlock: { cogs: 800 },
  levelDesc: lanceLv.levelDesc,
  base: lanceLv.base,
  update: lanceUpdate,
};

export const harpoon = {
  id: 'harpoon',
  name: 'Harpoon Gun',
  desc: 'Heavy barbed harpoons that skewer lines of foes on a chain.',
  icon: 'icon_harpoon',
  turret: 'turret_harpoon',
  sfx: 'fire_harpoon',
  maxLevel: 8,
  unlock: { cogs: 700 },
  levelDesc: harpoonLv.levelDesc,
  base: harpoonLv.base,
  update: harpoonUpdate,
};
