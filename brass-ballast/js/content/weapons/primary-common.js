// Shared plumbing for the primary arsenal (WP17): level tables, stat context, cooldown
// bookkeeping, muzzle positions and the little garnishes every gun shares (shell casings,
// powder smoke, self-recoil). Weapon defs live in primary-guns.js and primary-special.js.

import { Sprites } from '../../gfx/sprites.js';
import * as ShipArt from '../../gfx/art/ships.js';

export const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------
// Level tables

/**
 * Build `base(level)` and `levelDesc(level)` from one table so the numbers and the card text
 * can never drift apart. `steps[i]` describes level i+2: `{desc, apply(b)}` mutating a copy of
 * the L1 base.
 * @param {object} l1 level-1 base numbers
 * @param {string} l1Desc shown for level 1
 * @param {{desc:string, apply:(b:object)=>void}[]} steps levels 2..8
 */
export function levelTable(l1, l1Desc, steps) {
  const cache = [];
  function base(level) {
    const L = Math.max(1, Math.min(steps.length + 1, level | 0 || 1));
    if (cache[L]) return cache[L];
    const b = { ...l1 };
    for (let i = 0; i < L - 1; i++) steps[i].apply(b);
    cache[L] = Object.freeze(b);
    return cache[L];
  }
  function levelDesc(level) {
    const L = level | 0;
    if (L <= 1) return l1Desc;
    return steps[L - 2]?.desc ?? 'Fully calibrated.';
  }
  return { base, levelDesc };
}

// Small mutators for level tables.
export const mul = (key, f) => (b) => {
  b[key] *= f;
};
export const add = (key, n) => (b) => {
  b[key] = (b[key] || 0) + n;
};
export const set = (key, v) => (b) => {
  b[key] = v;
};
export const all = (...fns) => (b) => {
  for (const f of fns) f(b);
};

// ---------------------------------------------------------------------------------------------
// Stat context — everything a weapon needs from player.stats & run.mods, in one reused object.

const SC = {
  dmg: 1,
  rate: 1,
  speed: 1,
  area: 1,
  extra: 0,
  pierce: 0,
  bounce: 0,
  spread: 1,
  explosive: 0,
  burnChance: 0,
  burnDps: 6,
  damage: 1,
};

/**
 * Player multipliers for this frame. NOTE: returns a shared object — read it immediately.
 * Crit, burnChance and explosive-on-hit are applied by the projectile engine (ENGINE.md §2).
 */
export function statCtx(player, world) {
  const s = player.stats || {};
  const mods = world.run?.mods;
  SC.damage = s.damage ?? 1;
  SC.dmg = (s.damage ?? 1) * (mods?.playerDmg ?? 1);
  SC.rate = Math.max(0.05, s.fireRate ?? 1);
  SC.speed = Math.max(0.2, s.projSpeed ?? 1);
  SC.area = Math.max(0.3, s.area ?? 1);
  SC.extra = Math.max(0, Math.round(s.projCount ?? 0));
  SC.pierce = Math.max(0, s.pierce ?? 0);
  SC.bounce = Math.max(0, s.bounce ?? 0);
  SC.spread = Math.max(0.2, s.spread ?? 1);
  SC.explosive = s.explosive ?? 0;
  SC.burnChance = s.burnChance ?? 0;
  SC.burnDps = s.burnDps ?? 6;
  return SC;
}

// ---------------------------------------------------------------------------------------------
// Cooldown & recoil

/**
 * Tick the weapon cooldown and decide how many shots fire this frame. Keeps sub-frame
 * remainder so high fire rates stay accurate, but never banks shots while idle.
 * @returns {number} shots to fire now (0..3)
 */
export function triggerShots(wpn, dt, firing, interval) {
  wpn.cd = (wpn.cd || 0) - dt;
  if (!firing) {
    if (wpn.cd < 0) wpn.cd = 0;
    return 0;
  }
  let n = 0;
  while (wpn.cd <= 0 && n < 3) {
    wpn.cd += interval;
    n++;
  }
  if (wpn.cd < -interval) wpn.cd = 0;
  return n;
}

/** Exponential recoil recovery; `rate` = how fast the barrel springs back (1/s). */
export function decayKick(wpn, dt, rate = 7) {
  wpn.kick = (wpn.kick || 0) * Math.exp(-rate * dt);
  if (wpn.kick < 0.002) wpn.kick = 0;
}

/** Shove the ship backwards (self-recoil). Skipped while boosting so dashes stay crisp. */
export function selfRecoil(player, angle, amount) {
  if (player.boostT > 0 || !amount) return;
  player.vx -= Math.cos(angle) * amount;
  player.vy -= Math.sin(angle) * amount;
}

// ---------------------------------------------------------------------------------------------
// Muzzle geometry

/** Muzzle distance for a turret (from the art's TURRET_MUZZLE table, with fallbacks). */
export function muzzleDist(id, fallback = 28) {
  const t = ShipArt.TURRET_MUZZLE;
  return (t && t[id]) || fallback;
}

/**
 * Muzzle world position into `out` (no allocation). Uses player.mountPos when available.
 * @param {number} [along] extra distance along the barrel
 * @param {number} [side] lateral offset (+ = clockwise/right of the barrel)
 */
export function muzzleAt(player, id, out, along = 0, side = 0) {
  const a = player.aim ?? 0;
  const c = Math.cos(a);
  const s = Math.sin(a);
  if (player.mountPos) player.mountPos(out);
  else {
    out.x = player.x;
    out.y = player.y;
  }
  const d = muzzleDist(id) + along;
  out.x += c * d - s * side;
  out.y += s * d + c * side;
  return out;
}

/** Evenly fanned angle offset for projectile i of n across a total arc. */
export function fan(i, n, arc) {
  return n <= 1 ? 0 : (i / (n - 1) - 0.5) * arc;
}

// ---------------------------------------------------------------------------------------------
// Garnish

const CASING = 'wp_casing';
const CASING_BIG = 'wp_casing_big';
const WAD = 'wp_wad';

function registerArt() {
  if (!Sprites.has(CASING)) {
    Sprites.register(CASING, {
      w: 7,
      h: 3,
      scale: 3,
      draw(ctx) {
        const g = ctx.createLinearGradient(0, 0, 0, 3);
        g.addColorStop(0, '#fff1b8');
        g.addColorStop(0.45, '#e2a93a');
        g.addColorStop(1, '#7a4a14');
        ctx.fillStyle = g;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(0.3, 0.3, 6.4, 2.4, 0.8);
        else ctx.rect(0.3, 0.3, 6.4, 2.4);
        ctx.fill();
        ctx.fillStyle = '#5a3610';
        ctx.fillRect(0.3, 0.3, 0.9, 2.4);
        ctx.strokeStyle = 'rgba(40,20,5,0.8)';
        ctx.lineWidth = 0.35;
        ctx.stroke();
      },
    });
  }
  if (!Sprites.has(CASING_BIG)) {
    Sprites.register(CASING_BIG, {
      w: 12,
      h: 6,
      scale: 3,
      draw(ctx) {
        const g = ctx.createLinearGradient(0, 0, 0, 6);
        g.addColorStop(0, '#fff3c4');
        g.addColorStop(0.4, '#d99a2b');
        g.addColorStop(1, '#6a3c10');
        ctx.fillStyle = g;
        ctx.fillRect(1.2, 0.6, 10.2, 4.8);
        ctx.fillStyle = '#9c6420';
        ctx.fillRect(0.4, 0.2, 1.6, 5.6);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(2.4, 1.2, 8.4, 0.9);
        ctx.strokeStyle = 'rgba(40,20,5,0.85)';
        ctx.lineWidth = 0.45;
        ctx.strokeRect(0.4, 0.2, 11, 5.6);
      },
    });
  }
  if (!Sprites.has(WAD)) {
    // Burning paper wadding from the blunderbuss.
    Sprites.register(WAD, {
      w: 6,
      h: 6,
      scale: 3,
      draw(ctx) {
        ctx.fillStyle = '#e8d7b0';
        ctx.beginPath();
        ctx.moveTo(0.6, 1.2);
        ctx.lineTo(4.8, 0.4);
        ctx.lineTo(5.6, 4.4);
        ctx.lineTo(1.6, 5.6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ff9b2f';
        ctx.fillRect(3.8, 3.4, 1.8, 1.4);
        ctx.strokeStyle = 'rgba(60,30,10,0.8)';
        ctx.lineWidth = 0.4;
        ctx.stroke();
      },
    });
  }
}
registerArt();

/**
 * Eject a spent casing to the right of the barrel; it tumbles, slows and fades.
 * @param {boolean} [big]
 */
export function ejectCasing(world, x, y, aim, big = false) {
  const P = world.particles;
  if (!P?.spawn) return;
  const r = world.rng;
  const side = aim + Math.PI / 2 + (r.next() - 0.5) * 0.7;
  const back = aim + Math.PI;
  const sp = (big ? 120 : 150) + r.next() * 90;
  P.spawn({
    sprite: big ? CASING_BIG : CASING,
    x,
    y,
    vx: Math.cos(side) * sp + Math.cos(back) * 40,
    vy: Math.sin(side) * sp + Math.sin(back) * 40,
    life: 0.55 + r.next() * 0.35,
    size: big ? 12 : 7,
    size1: big ? 9 : 5,
    rot: r.next() * TAU,
    vr: (r.next() < 0.5 ? -1 : 1) * (14 + r.next() * 14),
    drag: 3.2,
    fade: 'late',
    layer: 'normal',
  });
}

/** Burning paper wads thrown out of the blunderbuss mouth. */
export function throwWads(world, x, y, aim, count) {
  const P = world.particles;
  if (!P?.spawn) return;
  const r = world.rng;
  for (let i = 0; i < count; i++) {
    const a = aim + (r.next() - 0.5) * 0.9;
    const sp = 160 + r.next() * 200;
    P.spawn({
      sprite: WAD,
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.5 + r.next() * 0.4,
      size: 6,
      size1: 3,
      rot: r.next() * TAU,
      vr: (r.next() - 0.5) * 30,
      drag: 4,
      fade: 'late',
      layer: 'normal',
    });
  }
}

/** A plain additive dot (glows, sparks, charge motes). */
export function glowDot(world, x, y, vx, vy, life, size, color, color1 = color, size1 = size * 0.3) {
  world.particles?.spawn?.({ x, y, vx, vy, life, size, size1, color, color1, blend: 'add', layer: 'add' });
}

/** Reusable damage-info object for direct weapon damage (arcs, tethers). */
export function hitInfo(player, angle, knockback = 0, element = 'kinetic', crit = false) {
  HI.owner = player;
  HI.angle = angle;
  HI.knockback = knockback;
  HI.element = element;
  HI.crit = crit;
  HI.silent = false;
  HI.source = 'primary';
  HI.x = undefined;
  HI.y = undefined;
  return HI;
}
const HI = { source: 'primary', owner: null, angle: 0, knockback: 0, element: 'kinetic', crit: false, silent: false };
