// Clockwork Kraken — tentacles (WP14). Six arms, each a chain of segment parts posed every frame
// from layered sinusoids (idle sway) blended toward an attack pose (aim / stretch / curl).
//
// Damage model: every segment forwards hits into its tentacle's own hp pool (root joint & claw
// ×1.4, armoured middle ×0.8, ×1.4 more while the arm lies exposed after a slam) and 35% of that
// into the body. A tentacle whose pool empties is SEVERED: segments pop root → tip, the body
// takes a 4.5%-of-max-hp jolt, and that arm's attacks are gone for good.
//
// Attacks: slam (0.8 s telegraph line → lunge → line hazard → exposed hold), sweep (follow-up
// from a hold in later phases, telegraphed fan), grab (reach for the player; boost to escape).

import { TAU, clamp, angleDiff, lerp } from '../../core/math.js';
import { Sprites } from '../../gfx/sprites.js';
import { ROOT_ANGLES, SEG_SPR_R } from './kraken-art.js';

export const N_SEG = 11;
export const ROOT_R = 92; // root joints sit on the mantle rim
const SEG_R = [];
const SPACING = [];
for (let i = 0; i < N_SEG; i++) {
  const u = i / (N_SEG - 1);
  SEG_R.push(Math.round(lerp(20, 10, u)));
  SPACING.push(i === 0 ? 0 : lerp(28, 18, u));
}
export const BASE_LEN = SPACING.reduce((a, b) => a + b, 0);
const TIP_EXTRA = 24; // claw reaches past the last segment centre
const TENT_HP = 650; // at the kraken's base hp; scaled with the body's actual maxHp
const FORWARD = 0.3;
const SEVER_BONUS = 0.03;
const GRAB_SPEED = 340;

const FWD = { source: '', owner: null, silent: true, crit: false, element: 'kinetic', fwd: true };

// ---- Segment part def ----------------------------------------------------------------------------

export const SEG_DEF = {
  id: 'krakenArm', name: 'Kraken Tentacle', hp: 1, r: 16, contactDamage: 10, mass: 10,
  xp: 0, cogs: 0, score: 0, manualMove: true, noSeparation: true, noKnockback: true,
  noElite: true, noScore: true, layer: -1, immune: { burn: true, slow: true },
  draw(ctx, e, w) {
    drawSegment(ctx, e, w);
  },
  modifyDamage(e, amount, info, w) {
    hitTentacle(e, amount, info, w);
    return 0;
  },
};

/** Spawn the six arms. Returns the tentacle records (also stored as b.data.tentacles). */
export function createTentacles(b, w) {
  const d = b.data;
  return ROOT_ANGLES.map((base, k) => {
    const T = {
      k, base, segs: [], ids: new Set(), alive: true, dying: false, grow: 1,
      maxHp: Math.max(1, Math.round(TENT_HP * d.k)), hp: 0,
      state: 'idle', st: 0, dur: 0, cd: 1 + k * 0.4,
      ph: w.rng.next() * TAU, curlSign: k % 2 ? 1 : -1,
      w: 0, wT: 0, aim: b.angle + base, stretch: 1, stretchT: 1, curl: 0, curlT: 0,
      rootX: b.x, rootY: b.y, tipX: b.x, tipY: b.y, flash: 0, vuln: 1, hz: null,
      gx: 0, gy: 0, side: 1, said: false, dupT: -1, dupSrc: null, dupOwner: null,
    };
    T.hp = T.maxHp;
    spawnSegments(T, b, w);
    return T;
  });
}

function spawnSegments(T, b, w) {
  T.segs = [];
  T.ids = new Set();
  for (let i = 0; i < N_SEG; i++) {
    const tip = i === N_SEG - 1;
    const e = w.spawnEnemy(SEG_DEF, b.x, b.y, {
      parent: b, rawHp: 1e6, r: SEG_R[i], layer: i === 0 ? 1 : -1,
      contactDamage: tip ? 12 : 0, // idle sway shouldn't chip the player; claws still bite
      data: { T, i, mult: i === 0 || tip ? 1.4 : 0.8 },
    });
    T.segs.push(e);
    T.ids.add(e.id);
  }
}

/**
 * Sprout fresh arms from empty sockets (phase transitions) until `minAlive` arms are up again.
 * New arms unfurl from the socket with `hpFrac` of a full arm's hp. Returns how many grew.
 */
export function regrowTentacles(b, w, minAlive, hpFrac) {
  const d = b.data;
  let alive = d.tentacles.filter((T) => T.alive).length;
  let grown = 0;
  for (const T of d.tentacles) {
    if (alive >= minAlive) break;
    if (T.alive) continue;
    for (const s of T.segs) if (s.alive) w.removeEnemy(s);
    T.alive = true;
    T.dying = false;
    T.grow = 0;
    T.hp = Math.max(1, Math.round(T.maxHp * hpFrac));
    T.state = 'retract';
    T.st = 0;
    T.dur = 2;
    T.w = 0;
    T.wT = 0;
    T.stretch = T.stretchT = 1;
    T.curl = T.curlT = 0;
    T.vuln = 1;
    T.hz = null;
    spawnSegments(T, b, w);
    alive++;
    grown++;
  }
  return grown;
}

// ---- Damage ----------------------------------------------------------------------------------------

function hitTentacle(seg, amount, info, w) {
  const T = seg.data.T;
  const b = seg.parent;
  if (!b || !b.alive || !T.alive) return;
  if (b.invuln) {
    seg.flash = Math.max(seg.flash, 0.35);
    if (!info.silent && w.rng.next() < 0.3) {
      w.sfx('hit_armor', seg.x, seg.y, { vol: 0.4 });
      w.fx.sparks?.(info.x ?? seg.x, info.y ?? seg.y, (info.angle ?? 0) + Math.PI, 3, '#cfd6de', 1);
    }
    return;
  }
  // one hit per projectile / per AoE source per frame on the whole arm
  const proj = info.projectile;
  if (proj) {
    const hs = proj.hitSet;
    for (let i = 0; i < hs.length; i++) if (T.ids.has(hs[i])) return;
  } else {
    if (T.dupT === w.time && T.dupSrc === info.source && T.dupOwner === info.owner) return;
    T.dupT = w.time;
    T.dupSrc = info.source;
    T.dupOwner = info.owner;
  }
  const dmg = amount * seg.data.mult * T.vuln;
  T.hp -= dmg;
  T.flash = 1;
  seg.flash = 1;
  if (!info.silent) {
    w.fx.text?.(seg.x + (w.rng.next() - 0.5) * 10, seg.y - seg.r, String(Math.max(1, Math.round(dmg))), {
      color: info.crit ? '#ffcf4a' : seg.data.mult > 1 ? '#ffd08a' : '#d8d2c4',
      size: info.crit ? 20 : 13, crit: !!info.crit, key: T,
    });
    w.sfx(info.crit ? 'hit_crit' : seg.data.mult > 1 ? 'hit' : 'hit_armor', seg.x, seg.y, { vol: 0.35 });
  }
  // forward into the body — an explosion catching several arms only counts once
  const d = b.data;
  if (proj || d.fwdT !== w.time || d.fwdSrc !== info.source || d.fwdOwner !== info.owner) {
    if (!proj) {
      d.fwdT = w.time;
      d.fwdSrc = info.source;
      d.fwdOwner = info.owner;
    }
    FWD.source = info.source;
    FWD.owner = info.owner;
    FWD.crit = !!info.crit;
    FWD.element = info.element || 'kinetic';
    w.damageEnemy(b, dmg * FORWARD, FWD);
    FWD.owner = null;
  }
  if (T.hp <= 0 && T.alive && b.alive) severTentacle(T, b, w, info);
}

/** Cut an arm off at the root: pops segments outward, jolts the body, removes its attacks. */
export function severTentacle(T, b, w, info) {
  const d = b.data;
  T.alive = false;
  T.dying = true;
  T.hp = 0;
  if (d.grab?.T === T) releaseGrab(b, w, true);
  if (T.hz) T.hz.alive = false;
  const rx = T.rootX;
  const ry = T.rootY;
  w.fx.bigExplosion?.(rx, ry, 0.9, { palette: 'enemy', debris: 'syndicate' });
  w.fx.smoke?.(rx, ry, 2.4, { color: '#1c1426', color1: '#08060c', count: 8, spread: 70, life: 2, alpha: 0.7 });
  w.sfx('explode_large', rx, ry);
  w.shake(0.5);
  w.hitstop(0.08);
  w.floatText(rx, ry - 40, 'TENTACLE SEVERED!', { color: '#ffcf4a', size: 20, life: 1.6, callout: true });
  // reward: a jolt to the body and a little loot at the stump
  w.damageEnemy(b, b.maxHp * SEVER_BONUS, { source: 'sever', owner: info?.owner || null, element: 'kinetic', fwd: true });
  w.spawnXp(rx, ry, 8 * (w.run?.stage?.xpMult ?? 1), 160);
  for (let i = 0; i < 3; i++) w.dropPickup('cog', rx, ry, 1);
  if (w.run) w.run.score += Math.round(400 * (w.run.combo || 1));
  // fling the severed arm outward, popping segment by segment
  const out = Math.atan2(ry - b.y, rx - b.x);
  T.segs.forEach((s, i) => {
    s.data.fvx = Math.cos(out) * (120 + i * 18) + (w.rng.next() - 0.5) * 80;
    s.data.fvy = Math.sin(out) * (120 + i * 18) + (w.rng.next() - 0.5) * 80;
    s.contactDamage = 0;
    w.after(0.06 + i * 0.07, () => {
      if (!s.alive) return;
      s.noDrops = true;
      w.killEnemy(s, { source: 'sever', noCombo: true });
    });
  });
  d.severed = (d.severed || 0) + 1;
  if (!d.saidSever) {
    d.saidSever = true;
    d.tauntQueue?.push(['phase', 2]);
  }
  w.events?.emit?.('boss:part', { boss: b, id: b.type, part: 'tentacle', index: T.k });
}

// ---- Attacks ---------------------------------------------------------------------------------------

/** Reach (from the root) of a fully stretched arm. */
export function reachOf(T, stretch) {
  return BASE_LEN * stretch + TIP_EXTRA;
}

export function isIdle(T) {
  return T.alive && T.state === 'idle' && T.cd <= 0;
}

/** Best idle arm to attack (x, y): the one whose root faces it most. */
export function pickTentacle(b, x, y, maxDist = Infinity) {
  let best = null;
  let bd = Infinity;
  for (const T of b.data.tentacles) {
    if (!isIdle(T)) continue;
    const toP = Math.atan2(y - T.rootY, x - T.rootX);
    const out = b.angle + T.base;
    const diff = Math.abs(angleDiff(out, toP));
    const dist = Math.hypot(x - T.rootX, y - T.rootY);
    if (dist > maxDist) continue;
    if (diff < bd) {
      bd = diff;
      best = T;
    }
  }
  return best;
}

export function startSlam(T, b, w, tx, ty, warn = 0.8) {
  const d = b.data;
  T.state = 'windup';
  T.st = 0;
  T.dur = Math.max(0.6, warn);
  T.aim = Math.atan2(ty - T.rootY, tx - T.rootX);
  const dist = Math.hypot(tx - T.rootX, ty - T.rootY);
  T.slamStretch = clamp((dist + 70 - TIP_EXTRA) / BASE_LEN, 1, 1.95);
  T.wT = 0.75;
  T.stretchT = 0.75;
  T.curlT = 0.9 * T.curlSign;
  const L = reachOf(T, T.slamStretch);
  const ex = T.rootX + Math.cos(T.aim) * L;
  const ey = T.rootY + Math.sin(T.aim) * L;
  w.telegraphLine(T.rootX, T.rootY, ex, ey, 54, T.dur, { color: d.frenzy ? '#ff3d8b' : '#ff4d2e', data: { boss: b, tele: true } });
  w.sfx('wasp_charge', T.rootX, T.rootY, { vol: 0.45, pitch: 0.55 + w.rng.next() * 0.2 });
}

export function startGrab(T, b, w, p) {
  T.state = 'grabWarn';
  T.st = 0;
  T.dur = 0.75;
  T.aim = Math.atan2(p.y - T.rootY, p.x - T.rootX);
  T.wT = 0.55;
  T.stretchT = 1;
  T.curlT = 0;
  w.telegraphLine(T.rootX, T.rootY, p.x, p.y, 34, T.dur, { color: '#ff3d8b', data: { boss: b, tele: true } });
  w.sfx('tesla_hum', T.rootX, T.rootY, { vol: 0.5, pitch: 0.6 });
  b.data.grabCd = 9;
}

function startSweep(T, b, w) {
  T.state = 'sweepWarn';
  T.st = 0;
  T.dur = 0.7;
  T.side = w.rng.chance(0.5) ? 1 : -1;
  const L = reachOf(T, T.slamStretch);
  for (const off of [0.42, 0.84, 1.2]) {
    const a = T.aim + T.side * off;
    w.telegraphLine(T.rootX, T.rootY, T.rootX + Math.cos(a) * L, T.rootY + Math.sin(a) * L, 44, T.dur, {
      color: '#ff7a2f', alpha: 0.7, data: { boss: b, tele: true },
    });
  }
}

function toRetract(T, time = 0.6) {
  T.state = 'retract';
  T.st = 0;
  T.dur = time;
  T.wT = 0;
  T.stretchT = 1;
  T.curlT = 0;
  T.vuln = 1;
}

function slamImpact(T, b, w) {
  const L = reachOf(T, T.slamStretch);
  const ex = T.rootX + Math.cos(T.aim) * L;
  const ey = T.rootY + Math.sin(T.aim) * L;
  w.addHazard({
    shape: 'line', x: T.rootX, y: T.rootY, x2: ex, y2: ey, width: 50, life: 0.22, damage: 22,
    tick: 0.5, owner: b, source: 'enemy', color: '#ffb070',
  });
  w.fx.shockwave?.(ex, ey, 110, '#ffd9a0', 0.4);
  for (let i = 1; i <= 4; i++) {
    const k = i / 4;
    const x = T.rootX + (ex - T.rootX) * k;
    const y = T.rootY + (ey - T.rootY) * k;
    w.fx.smoke?.(x, y, 1.4, { count: 2, spread: 40, life: 1.1, layer: 'low', color: '#8a7a6a' });
    w.fx.debris?.(x, y, 2, 'iron', { speed: 220 });
  }
  w.fx.sparks?.(ex, ey, T.aim + Math.PI, 10, '#ffd28a', 2.2, { speed: 420 });
  w.sfx('mortar_land', ex, ey, { vol: 0.9 });
  w.sfx('explode_medium', ex, ey, { vol: 0.6, pitch: 0.7 });
  w.shake(0.32);
}

// ---- Grab ------------------------------------------------------------------------------------------

/** Let go of a held player. broke = the player boosted free (arm is stunned & exposed). */
export function releaseGrab(b, w, broke) {
  const d = b.data;
  const g = d.grab;
  if (!g) return;
  d.grab = null;
  const T = g.T;
  const p = g.p;
  if (p?.alive) {
    const a = Math.atan2(p.y - b.y, p.x - b.x);
    if (broke) {
      w.fx.steamBurst?.(p.x, p.y, 1.2, 14);
      w.floatText(p.x, p.y - 40, 'BROKE FREE!', { color: '#9fe6ff', size: 18, life: 1.2, callout: true });
      w.sfx('steam_vent', p.x, p.y, { vol: 0.8, pitch: 1.3 });
    } else {
      p.vx = Math.cos(a) * 560;
      p.vy = Math.sin(a) * 560;
      w.damagePlayer(p, 10 * (b.dmgMult ?? 1), { source: 'enemy', owner: b, angle: a });
      w.sfx('explode_small', p.x, p.y);
    }
  }
  if (T?.alive) {
    if (broke) {
      T.state = 'stunned';
      T.st = 0;
      T.dur = 1.3;
      T.wT = 0.35;
      T.stretchT = 0.8;
      T.vuln = 1.6;
      w.fx.sparks?.(T.tipX, T.tipY, 0, 14, '#ff9ad0', TAU, { speed: 300 });
    } else toRetract(T, 0.7);
  }
}

function updateHeld(T, b, dt, w) {
  const d = b.data;
  const g = d.grab;
  const p = g.p;
  g.t += dt;
  if (!p.alive || !T.alive) {
    releaseGrab(b, w, false);
    return;
  }
  if (p.boostT > 0) {
    releaseGrab(b, w, true);
    return;
  }
  // reel in slowly toward the body
  const a = Math.atan2(T.rootY - T.gy, T.rootX - T.gx);
  const dRoot = Math.hypot(T.rootY - T.gy, T.rootX - T.gx);
  if (dRoot > 150) {
    T.gx += Math.cos(a) * 55 * dt;
    T.gy += Math.sin(a) * 55 * dt;
  }
  T.aim = Math.atan2(T.gy - T.rootY, T.gx - T.rootX);
  T.stretchT = clamp((Math.hypot(T.gx - T.rootX, T.gy - T.rootY) - TIP_EXTRA * 0.5) / BASE_LEN, 0.55, 2.2);
  const k = Math.min(1, dt * 14);
  p.x += (T.tipX - p.x) * k;
  p.y += (T.tipY - p.y) * k;
  p.vx *= 0.3;
  p.vy *= 0.3;
  p.slowT = Math.max(p.slowT || 0, 0.2);
  g.tick -= dt;
  if (g.tick <= 0) {
    g.tick = 0.55;
    w.damagePlayer(p, 6 * (b.dmgMult ?? 1), { source: 'enemy', owner: b, angle: a });
    w.fx.sparks?.(p.x, p.y, w.rng.angle(), 4, '#ff9ad0', 1.5, { speed: 200 });
  }
  if (g.t > 1.9) releaseGrab(b, w, false);
}

// ---- Per-frame -------------------------------------------------------------------------------------

/** Advance every arm's state machine and pose its segments. */
export function updateTentacles(b, dt, w, p) {
  const d = b.data;
  for (const T of d.tentacles) {
    if (T.dying) {
      for (const s of T.segs) {
        if (!s.alive) continue;
        s.x += s.data.fvx * dt;
        s.y += s.data.fvy * dt;
        s.data.fvx *= Math.exp(-2 * dt);
        s.data.fvy *= Math.exp(-2 * dt);
        s.angle += dt * 3;
      }
      continue;
    }
    if (!T.alive) continue;
    T.flash = Math.max(0, T.flash - dt * 4);
    if (T.grow < 1) T.grow = Math.min(1, T.grow + dt * 0.6);
    T.cd -= dt;
    T.st += dt;
    stepState(T, b, dt, w, p);
    poseTentacle(T, b, dt, d);
  }
}

function stepState(T, b, dt, w, p) {
  const d = b.data;
  switch (T.state) {
    case 'windup':
      if (T.st >= T.dur) {
        T.state = 'lunge';
        T.st = 0;
        T.dur = 0.13;
        T.wT = 1;
        T.curlT = 0;
        T.stretchT = T.slamStretch;
      }
      break;
    case 'lunge':
      if (T.st >= T.dur) {
        slamImpact(T, b, w);
        T.state = 'hold';
        T.st = 0;
        T.dur = d.frenzy ? 0.45 : 0.75;
        T.vuln = 1.4;
      }
      break;
    case 'hold':
      if (T.st >= T.dur) {
        if (b.phase >= 1 && !d.frenzy && w.rng.chance(0.45)) startSweep(T, b, w);
        else toRetract(T);
      }
      break;
    case 'sweepWarn':
      if (T.st >= T.dur) {
        T.state = 'sweep';
        T.st = 0;
        T.dur = 0.5;
        T.a0 = T.aim;
        const self = T;
        T.hz = w.addHazard({
          shape: 'line', x: T.rootX, y: T.rootY, x2: T.tipX, y2: T.tipY, width: 44, life: 0.55,
          damage: 18, tick: 0.5, owner: b, source: 'enemy', color: '#ffb070',
          update(h) {
            if (!self.alive) {
              h.alive = false;
              return;
            }
            h.x = self.rootX;
            h.y = self.rootY;
            h.x2 = self.tipX;
            h.y2 = self.tipY;
          },
          draw() {},
        });
        w.sfx('steam_vent', T.rootX, T.rootY, { vol: 0.6, pitch: 0.5 });
      }
      break;
    case 'sweep': {
      const k = clamp(T.st / T.dur, 0, 1);
      T.aim = T.a0 + T.side * 1.2 * (k * k * (3 - 2 * k));
      if (Math.random() < 0.5) w.fx.smoke?.(T.tipX, T.tipY, 1, { count: 1, layer: 'low', color: '#8a7a6a' });
      if (T.st >= T.dur) {
        T.hz = null;
        toRetract(T);
      }
      break;
    }
    case 'retract':
    case 'stunned':
      if (T.st >= T.dur) {
        T.state = 'idle';
        T.vuln = 1;
        T.wT = 0;
        T.stretchT = 1;
        T.cd = 0.9;
      }
      break;
    case 'grabWarn':
      T.aim = Math.atan2(p.y - T.rootY, p.x - T.rootX);
      if (T.st >= T.dur) {
        T.state = 'reach';
        T.st = 0;
        T.dur = 1.35;
        T.gx = T.tipX;
        T.gy = T.tipY;
        T.wT = 1;
      }
      break;
    case 'reach': {
      const dx = p.x - T.gx;
      const dy = p.y - T.gy;
      const dist = Math.hypot(dx, dy) || 1;
      const step = Math.min(dist, GRAB_SPEED * b.speedMult * d.rage * dt);
      T.gx += (dx / dist) * step;
      T.gy += (dy / dist) * step;
      // can't reach beyond full stretch
      const rl = Math.hypot(T.gx - T.rootX, T.gy - T.rootY);
      const maxL = BASE_LEN * 2.2;
      if (rl > maxL) {
        T.gx = T.rootX + ((T.gx - T.rootX) / rl) * maxL;
        T.gy = T.rootY + ((T.gy - T.rootY) / rl) * maxL;
      }
      T.aim = Math.atan2(T.gy - T.rootY, T.gx - T.rootX);
      T.stretchT = clamp((Math.min(rl, maxL) - TIP_EXTRA * 0.5) / BASE_LEN, 0.55, 2.2);
      const tip = T.segs[N_SEG - 1];
      if (!d.grab && p.alive && p.iframes <= 0 && Math.hypot(p.x - tip.x, p.y - tip.y) < tip.r + p.hitR + 10) {
        d.grab = { T, p, t: 0, tick: 0.35 };
        T.state = 'held';
        T.st = 0;
        w.floatText(p.x, p.y - 46, 'BOOST TO ESCAPE!', { color: '#ff9ad0', size: 18, life: 1.6, callout: true });
        w.sfx('player_hit', p.x, p.y, { vol: 0.6, pitch: 0.7 });
        w.shake(0.3);
      } else if (T.st >= T.dur) toRetract(T, 0.7);
      break;
    }
    case 'held':
      if (d.grab?.T === T) updateHeld(T, b, dt, w);
      else toRetract(T, 0.6);
      break;
    default:
      break;
  }
}

/** Compute the chain: idle sway (layered sinusoids) blended toward the attack pose. */
function poseTentacle(T, b, dt, d) {
  const lungeRate = T.state === 'lunge' ? 26 : T.state === 'reach' || T.state === 'held' ? 12 : 6;
  const k = Math.min(1, lungeRate * dt);
  T.w += (T.wT - T.w) * k;
  T.stretch += (T.stretchT - T.stretch) * k;
  T.curl += (T.curlT - T.curl) * Math.min(1, 8 * dt);
  const sc = b.scale;
  const out = b.angle + T.base;
  let x = b.x + Math.cos(out) * ROOT_R * sc;
  let y = b.y + Math.sin(out) * ROOT_R * sc;
  T.rootX = x;
  T.rootY = y;
  const t = d.t * d.swayMul;
  const ext = d.extend;
  let th = out;
  const segs = T.segs;
  for (let i = 0; i < N_SEG; i++) {
    const s = segs[i];
    let ang = th;
    if (i > 0) {
      const u = i / (N_SEG - 1);
      const s1 = Math.sin(t * 1.25 + i * 0.55 + T.ph);
      const s2 = Math.sin(t * 2.3 - i * 0.85 + T.ph * 1.7);
      const s3 = Math.sin(d.t * 0.5 + i * 0.3 + T.ph * 0.5);
      th += (0.12 * s1 + 0.07 * s2 + 0.05 * s3) * (0.45 + u) + T.curlSign * 0.03;
      const att = T.aim + T.curl * (u * 1.9 - 0.35) + 0.035 * s2 * (1 - T.w * 0.7);
      ang = th + angleDiff(th, att) * T.w;
      const sp = SPACING[i] * ext * T.grow * (1 + (T.stretch - 1) * T.w) * sc;
      x += Math.cos(ang) * sp;
      y += Math.sin(ang) * sp;
    }
    s.x = x;
    s.y = y;
    s.angle = ang;
    s.scale = sc;
  }
  const tip = segs[N_SEG - 1];
  T.tipX = tip.x + Math.cos(tip.angle) * TIP_EXTRA * 0.6 * sc;
  T.tipY = tip.y + Math.sin(tip.angle) * TIP_EXTRA * 0.6 * sc;
}

// ---- Drawing ---------------------------------------------------------------------------------------

function drawSegment(ctx, e, w) {
  const T = e.data.T;
  const i = e.data.i;
  const sc = (e.r / SEG_SPR_R) * e.scale;
  // armoured cable to the previous segment (skipped once the arm has come apart)
  if (e.alive && i > 0 && !T.dying) {
    const prev = T.segs[i - 1];
    ctx.globalAlpha = e.alpha;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1b1d22';
    ctx.lineWidth = e.r * 1.05 * e.scale;
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(e.x, e.y);
    ctx.stroke();
    ctx.strokeStyle = '#4b5059';
    ctx.lineWidth = e.r * 0.7 * e.scale;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(125,133,144,0.6)';
    ctx.lineWidth = e.r * 0.22 * e.scale;
    ctx.beginPath();
    ctx.moveTo(prev.x - 1.5, prev.y - 1.5);
    ctx.lineTo(e.x - 1.5, e.y - 1.5);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (i === 0) {
    w.drawEnemySprite(ctx, e, 'boss_kraken_joint', 0, e.angle + (w.time * 0.6) * T.curlSign, e.x, e.y, sc);
    // arm health gauge around the root joint
    if (e.alive && T.alive && T.hp < T.maxHp) {
      const f = clamp(T.hp / T.maxHp, 0, 1);
      const r = (e.r + 7) * e.scale;
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = 'rgba(20,12,6,0.7)';
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, TAU);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = f > 0.5 ? '#ffcf4a' : f > 0.25 ? '#ff8a2a' : '#ff3d2e';
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, -Math.PI / 2, -Math.PI / 2 + TAU * f);
      ctx.stroke();
    }
  } else if (i === N_SEG - 1) {
    const clamped = T.state === 'held' || T.state === 'lunge' || T.state === 'hold';
    w.drawEnemySprite(ctx, e, 'boss_kraken_claw', clamped ? 1 : 0, e.angle, e.x, e.y, sc);
  } else {
    w.drawEnemySprite(ctx, e, 'boss_kraken_seg', 0, e.angle, e.x, e.y, sc);
  }
  // live light: grab intent (magenta) / exposed-after-slam (amber pulse)
  if (!e.alive) return;
  let glowK = 0;
  let name = 'boss_kraken_glow';
  if (T.state === 'grabWarn' || T.state === 'reach' || T.state === 'held') {
    if (i === N_SEG - 1 || i === 0) {
      glowK = 0.7 + 0.3 * Math.sin(w.time * 20);
      name = 'boss_kraken_glowP';
    }
  } else if (T.vuln > 1 && (i === 0 || i === N_SEG - 1)) {
    glowK = 0.5 + 0.3 * Math.sin(w.time * 14);
  } else if (T.flash > 0 && i === 0) {
    glowK = T.flash * 0.6;
  }
  if (glowK > 0) {
    const g = Sprites.get(name);
    const r = (e.r * 2.4 + 8) * e.scale;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, glowK) * e.alpha;
    ctx.drawImage(g.img, e.x - r, e.y - r, r * 2, r * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}
