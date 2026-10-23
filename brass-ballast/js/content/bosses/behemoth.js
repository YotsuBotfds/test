// Admiral Vex's Behemoth — The Admiral's Fist (WP15, stage 4 boss). DESIGN §2.11, ENGINE.md §7.
//
// A ~470×210 carrier-battleship cruising alongside the player. The main body is untargetable;
// invisible hull/lift-bag hitbox parts forward every hit to it (so shots land anywhere on the
// long silhouette). Destructible parts: two deck cannons and the launch bay. The bridge is the
// weak point — while its shutters are open (phase-timed) it forwards hits at ×2.
//
// Phases (b.phase): 0 deck-cannon volleys + ornithopter launches + broadside rake · 1 (<60%)
// mortar barrages + bullet walls with gaps · 2 (<25%) FLAGSHIP ABLAZE: everything, faster, plus
// a telegraphed desperate ram.

import { bossHp } from './tuning.js';
import { Sprites } from '../../gfx/sprites.js';
import { TAU, clamp, angleDiff } from '../../core/math.js';
import { ENEMIES } from '../enemies/index.js';
import { BH, GEO } from './behemoth-art.js';
import * as K from './stormEngine-kit.js';

const BASE_HP = 5200;
const CANNON_HP = 380;
const BAY_HP = 320;
const P2 = 0.6;
const P3 = 0.25;
const RED = '#ff4d2e';
const GOLD = '#ffcf4a';
const MARGIN = { x: 250, y: 150 };
const MARGIN_OUT = { x: 140, y: 50 };
const NO_FIRE = new Set(['enter', 'phase', 'ramAim', 'ram']);

const _p = { x: 0, y: 0 };
const _q = { x: 0, y: 0 };
const _t = {};

/** World position of a hull-local point. */
function at(b, lx, ly, out = _p) {
  return K.toWorld(b, lx, ly, out);
}

/** Player position in hull-local coordinates. */
function toLocal(b, x, y, out = _q) {
  const c = Math.cos(b.angle);
  const s = Math.sin(b.angle);
  const dx = x - b.x;
  const dy = y - b.y;
  out.x = c * dx + s * dy;
  out.y = -s * dx + c * dy;
  return out;
}

function placeParts(b) {
  const D = b.data;
  for (const e of D.placed) {
    if (!e.alive) continue;
    at(b, e.data.lx, e.data.ly, e);
    if (!e.data.turret) e.angle = b.angle;
  }
}

// ---- Parts --------------------------------------------------------------------------------

const HULL_DEF = {
  id: 'behemothHull',
  name: "Behemoth's Hull",
  hp: 1,
  r: 50,
  manualMove: true,
  noSeparation: true,
  noKnockback: true,
  noScore: true,
  shareDamage: true,
  contactDamage: 22,
  immune: { burn: true, slow: true }, // burns/slows would tick once per hitbox
  shadow: false,
  alt: 0,
  layer: 0,
  draw() {},
};

const BAY_DEF = {
  id: 'behemothBay',
  name: 'Launch Bay',
  hp: BAY_HP,
  r: 26,
  manualMove: true,
  noSeparation: true,
  noKnockback: true,
  noContact: true,
  shareDamage: 0.3,
  shadow: false,
  alt: 0,
  layer: 0,
  xp: 6,
  cogs: 4,
  score: 500,
  draw() {},
  onDeath(e, w, info) {
    const b = e.parent;
    if (info?.source === 'parent' || !b?.alive) return;
    const D = b.data;
    D.bayDead = true;
    D.launchQ = 0;
    w.fx.bigExplosion?.(e.x, e.y, 1.1);
    w.fx.debris?.(e.x, e.y, 10, 'metal');
    w.sfx('explode_large', e.x, e.y);
    w.shake(0.4);
    w.hitstop(0.06);
    w.floatText(e.x, e.y - 30, 'LAUNCH BAY WRECKED!', { color: GOLD, size: 17, life: 1.4, crit: true });
  },
};

const BRIDGE_DEF = {
  id: 'behemothBridge',
  name: "Vex's Bridge",
  hp: 1,
  r: 30,
  manualMove: true,
  noSeparation: true,
  noKnockback: true,
  noContact: true,
  shareDamage: true,
  alt: 1.25,
  layer: 0,
  update(e, dt, w) {
    const b = e.parent;
    if (!b?.alive) return;
    const D = b.data;
    // Weak point: forwarded hits are multiplied while the shutters are open.
    e.dmgTakenMult = 1 + clamp(D.shutter, 0, 1);
    e.data.txt = (e.data.txt || 0) - dt;
    if (e.flash > 0.95 && D.shutter > 0.5) {
      e.flash = 0.94; // consume the "just hit" marker
      if (e.data.txt <= 0) {
        e.data.txt = 0.35;
        w.floatText(e.x + (w.rng.next() - 0.5) * 30, e.y - 34, 'WEAK POINT ×2', { color: GOLD, size: 15, life: 0.7, crit: true });
        w.fx.sparks?.(e.x, e.y, w.rng.angle(), 6, GOLD, TAU, { speed: 260 });
      }
    }
  },
  draw(ctx, e, w) {
    const b = e.parent;
    if (!b) return;
    const D = b.data;
    drawBridge(ctx, b, w, e.x, e.y, b.angle, e.scale, e.alpha, e);
    if (b.alive && D.shutter > 0.5) {
      const pulse = 0.5 + 0.5 * Math.sin(w.time * 8);
      ctx.globalAlpha = (0.35 + 0.4 * pulse) * D.shutter;
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([9, 6]);
      ctx.lineDashOffset = -w.time * 30;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 40 + pulse * 4, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  },
};

function drawBridge(ctx, b, w, x, y, ang, s, a, part) {
  const D = b.data;
  const frame = Math.round(clamp(D.shutter, 0, 1) * 3);
  if (part) w.drawEnemySprite(ctx, part, BH.bridge, frame, ang, x, y, s);
  else Sprites.draw(ctx, BH.bridge, x, y, ang, s, a, frame);
  // Vex's flag streams aft from the pole.
  const c = Math.cos(ang);
  const sn = Math.sin(ang);
  const [fx, fy] = GEO.flagPole;
  const px = x + (c * fx - sn * fy) * s;
  const py = y + (sn * fx + c * fy) * s;
  const ff = ((w.time * 9) | 0) % 6;
  Sprites.draw(ctx, BH.flag, px, py, ang + Math.PI + Math.sin(w.time * 1.7) * 0.15, s, a, ff);
  if (D.ablaze || !b.alive) Sprites.drawTint(ctx, BH.flag, px, py, ang + Math.PI, s, '#ff8a2a', 0.35 + 0.2 * Math.sin(w.time * 17), ff);
}

const CANNON_DEF = {
  id: 'behemothCannon',
  name: 'Deck Cannon',
  hp: CANNON_HP,
  r: 24,
  manualMove: true,
  noSeparation: true,
  noKnockback: true,
  noContact: true,
  shareDamage: 0.3,
  alt: 1.3,
  layer: 0,
  xp: 6,
  cogs: 4,
  score: 500,
  update(e, dt, w) {
    const b = e.parent;
    if (!b?.alive) return;
    const D = b.data;
    const d = e.data;
    const p = K.targetPlayer(w, b);
    d.kick = Math.max(0, (d.kick || 0) - dt * 5);
    if (!p) return;
    const want = Math.atan2(p.y - e.y, p.x - e.x);
    const turn = d.burst > 0 ? 0.6 : 2.2;
    d.aim += clamp(angleDiff(d.aim, want), -turn * dt, turn * dt);
    e.angle = d.aim;
    if (e.hp < e.maxHp * 0.5) {
      d.fx = (d.fx || 0) - dt;
      if (d.fx <= 0) {
        d.fx = 0.12;
        w.fx.smokeTrail?.(e.x, e.y, 0.9, { fire: e.hp < e.maxHp * 0.25 });
      }
    }
    if (NO_FIRE.has(D.state)) {
      d.aimT = 0;
      d.burst = 0;
      return;
    }
    if (d.aimT > 0) {
      d.aimT -= dt;
      if (d.aimT <= 0) {
        d.burst = b.phase >= 2 ? 4 : 3;
        d.bt = 0;
      }
    } else if (d.burst > 0) {
      d.bt -= dt;
      if (d.bt <= 0) {
        d.bt = 0.13;
        d.burst--;
        d.barrel = d.barrel ? 0 : 1;
        const side = d.barrel ? 6 : -6;
        const c = Math.cos(d.aim);
        const s = Math.sin(d.aim);
        const mx = e.x + c * 52 - s * side;
        const my = e.y + s * 52 + c * side;
        w.fire({ team: 'enemy', kind: 'shell', x: mx, y: my, angle: d.aim + (w.rng.next() - 0.5) * 0.08, speed: 255, r: 7, damage: 12, life: 5, owner: b });
        w.fx.muzzle?.(mx, my, d.aim, 1.1, '#ffb070');
        w.sfx('enemy_cannon', mx, my, { vol: 0.7 });
        d.kick = 1;
      }
    } else {
      d.cd -= dt * b.fireRateMult;
      if (d.cd <= 0) {
        d.cd = [2.9, 2.5, 1.9][b.phase] + w.rng.next() * 0.6;
        d.aimT = 0.7;
      }
    }
  },
  draw(ctx, e, w) {
    const d = e.data;
    if (e.alive && d.aimT > 0) {
      // Laser rangefinder sight while laying the gun.
      const k = 1 - d.aimT / 0.7;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = RED;
      ctx.globalAlpha = 0.25 + 0.5 * k * (0.6 + 0.4 * Math.sin(w.time * 40));
      ctx.lineWidth = 1.6;
      ctx.setLineDash([12, 8]);
      ctx.lineDashOffset = -w.time * 120;
      ctx.beginPath();
      ctx.moveTo(e.x + Math.cos(d.aim) * 50, e.y + Math.sin(d.aim) * 50);
      ctx.lineTo(e.x + Math.cos(d.aim) * 720, e.y + Math.sin(d.aim) * 720);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    const kick = (d.kick || 0) * 4;
    w.drawEnemySprite(ctx, e, BH.cannon, 0, d.aim, e.x - Math.cos(d.aim) * kick, e.y - Math.sin(d.aim) * kick, e.scale);
    if (!e.alive) Sprites.drawTint(ctx, BH.cannon, e.x, e.y, d.aim, e.scale, '#140c08', 0.6 * e.alpha);
  },
  onDeath(e, w, info) {
    const b = e.parent;
    if (info?.source === 'parent' || !b) return;
    // Fling the turret off its barbette as a tumbling wreck; leave a burning crater behind.
    const a = w.rng.angle();
    e.vx = Math.cos(a) * 260;
    e.vy = Math.sin(a) * 260;
    if (!b.alive) return;
    b.data.cannonDead[e.data.i] = true;
    w.fx.bigExplosion?.(e.x, e.y, 1.1);
    w.fx.debris?.(e.x, e.y, 12, 'metal');
    w.fx.cogs?.(e.x, e.y, 6);
    w.sfx('explode_large', e.x, e.y);
    w.shake(0.45);
    w.hitstop(0.07);
    w.floatText(e.x, e.y - 34, 'DECK GUN DESTROYED!', { color: GOLD, size: 17, life: 1.4, crit: true });
  },
};

// ---- Attacks ------------------------------------------------------------------------------

function teleK(b) {
  return b.phase >= 2 ? 0.86 : 1;
}

/** Broadside rake: alternating lanes of shot from the gun ports facing the player. */
function atkRake(b, w, p) {
  const D = b.data;
  D.state = 'rake';
  const loc = toLocal(b, p.x, p.y);
  const side = loc.y >= 0 ? 1 : -1;
  const vols = b.phase >= 2 ? [0, 1, 0] : [0, 1];
  const tele = 0.78 * teleK(b);
  const spacing = 0.78 * teleK(b);
  vols.forEach((par, vi) => {
    w.after(vi * spacing, () => {
      if (!b.alive || D.state !== 'rake') return;
      const n = Math.cos(b.angle + side * Math.PI / 2);
      const m = Math.sin(b.angle + side * Math.PI / 2);
      GEO.portX.forEach((lx, i) => {
        if (i % 2 !== par) return;
        const o = at(b, lx, side * GEO.portY);
        K.track(b, w.telegraphLine(o.x, o.y, o.x + n * 600, o.y + m * 600, 16, tele, { color: RED }));
        D.portGlow[i + (side > 0 ? GEO.portX.length : 0)] = 1;
      });
      w.after(tele, () => {
        if (!b.alive || D.state !== 'rake') return;
        GEO.portX.forEach((lx, i) => {
          if (i % 2 !== par) return;
          for (let k = 0; k < 3; k++) {
            w.after(k * 0.085, () => {
              if (!b.alive) return;
              const o = at(b, lx, side * (GEO.portY + 4));
              const ang = b.angle + side * Math.PI / 2;
              w.fire({ team: 'enemy', kind: 'orb', x: o.x, y: o.y, angle: ang, speed: 235, r: 7, damage: 12, life: 4.5, owner: b });
              if (k === 0) w.fx.muzzle?.(o.x, o.y, ang, 0.8, '#ffb070');
            });
          }
        });
        w.sfx('broadside_fire', b.x, b.y, { vol: 1 });
        w.sfx('enemy_cannon', b.x, b.y, { vol: 0.8, pitch: 0.8 });
        w.shake(0.18);
      });
    });
  });
  D.dur = vols.length * spacing + tele + 0.9;
  w.sfx('ui_toggle', b.x, b.y, { pitch: 0.6, vol: 0.8 });
}

/** Synchronised salvo from both deck guns (phase-0 filler). */
function atkSalvo(b, w) {
  const D = b.data;
  D.state = 'salvo';
  D.dur = 1.6;
  for (const c of D.cannons) {
    if (!c.alive) continue;
    c.data.aimT = 0.75;
    c.data.burst = 0;
  }
}

/** Mortar barrage: lobbed shells from the stern pits onto telegraphed circles. */
function atkMortar(b, w, p) {
  const D = b.data;
  D.state = 'mortar';
  const pats = ['bracket', 'creep', 'scatter'];
  let pat = pats[(w.rng.next() * pats.length) | 0];
  if (pat === D.lastPattern) pat = pats[(pats.indexOf(pat) + 1) % pats.length];
  D.lastPattern = pat;
  const tgts = [];
  const lead = 0.6;
  const px = p.x + (p.vx || 0) * lead;
  const py = p.y + (p.vy || 0) * lead;
  if (pat === 'bracket') {
    tgts.push([px, py]);
    const rot = w.rng.angle();
    for (let i = 0; i < 5; i++) tgts.push([px + Math.cos(rot + (i * TAU) / 5) * 150, py + Math.sin(rot + (i * TAU) / 5) * 150]);
  } else if (pat === 'creep') {
    const a = Math.atan2(p.y - b.y, p.x - b.x);
    for (let i = 0; i < 8; i++) tgts.push([b.x + Math.cos(a) * (170 + i * 90), b.y + Math.sin(a) * (170 + i * 90)]);
  } else {
    tgts.push([px, py]);
    for (let i = 0; i < 8; i++) {
      const a = w.rng.angle();
      const d = 80 + w.rng.next() * 220;
      tgts.push([p.x + Math.cos(a) * d, p.y + Math.sin(a) * d]);
    }
  }
  const waves = b.phase >= 2 ? 2 : 1;
  for (let wv = 0; wv < waves; wv++) {
    tgts.forEach(([tx, ty], i) => {
      w.after(wv * 1.3 + i * 0.14, () => {
        if (!b.alive || D.state !== 'mortar') return;
        const ox = wv ? (w.rng.next() - 0.5) * 120 : 0;
        const oy = wv ? (w.rng.next() - 0.5) * 120 : 0;
        lob(b, w, i % 2, tx + ox, ty + oy);
      });
    });
  }
  D.dur = waves * 1.3 + tgts.length * 0.14 + 1.6;
  if (!D.mortarSaid) {
    D.mortarSaid = true;
    K.sayTaunt(b, w, 'phase', 0, undefined, true);
  }
}

function lob(b, w, pit, tx, ty) {
  const [lx, ly] = GEO.mortars[pit];
  const o = at(b, lx, ly);
  const d = Math.hypot(tx - o.x, ty - o.y);
  const time = Math.max(0.95, (1.15 + d / 1500) * teleK(b));
  K.track(b, w.telegraphCircle(tx, ty, 64, time, { color: RED }));
  w.fire({
    team: 'enemy',
    kind: 'mortar',
    x: o.x,
    y: o.y,
    speed: d / time,
    r: 9,
    damage: 22,
    owner: b,
    lob: { tx, ty, time, height: 170 + d * 0.15, marker: false },
    explode: { radius: 64, damage: 22, visual: 'medium' },
    trail: 'smoke',
  });
  w.fx.muzzle?.(o.x, o.y, b.angle - Math.PI / 2, 1, '#ffb070');
  w.fx.smoke?.(o.x, o.y, 0.8, { count: 2 });
  w.sfx('enemy_flak', o.x, o.y, { vol: 0.7, pitch: 0.7 });
  w.sfx('mortar_whistle', tx, ty, { vol: 0.5, delay: Math.max(0, time - 0.6) });
}

/** Sweeping bullet walls with a gap that shifts each wall. */
function atkWalls(b, w) {
  const D = b.data;
  D.state = 'walls';
  const n = b.phase >= 2 ? 4 : 3;
  const gap = b.phase >= 2 ? 0.92 : 1.08;
  D.gapOff = (w.rng.next() - 0.5) * 400;
  for (let i = 0; i < n; i++) {
    w.after(i * gap, () => {
      if (b.alive && D.state === 'walls') fireWall(b, w);
    });
  }
  D.dur = n * gap + 1.2;
  if (!D.wallSaid) {
    D.wallSaid = true;
    K.sayTaunt(b, w, 'phase', 1, undefined, true);
  }
}

function fireWall(b, w) {
  const D = b.data;
  const p = K.targetPlayer(w, b);
  if (!p) return;
  const a = Math.atan2(p.y - b.y, p.x - b.x);
  const nx = -Math.sin(a);
  const ny = Math.cos(a);
  const ox = b.x + Math.cos(a) * 95;
  const oy = b.y + Math.sin(a) * 95;
  const g = D.gapOff;
  const sh = (140 + w.rng.next() * 110) * w.rng.sign();
  D.gapOff = clamp(g + sh, -330, 330);
  if (Math.abs(D.gapOff - g) < 120) D.gapOff = clamp(g - sh, -330, 330);
  for (let off = -540; off <= 540; off += 30) {
    const dg = Math.abs(off - g);
    if (dg < 58) continue;
    // The two shots flanking the gap are oversized "gate posts" so the opening reads at a glance.
    const post = dg < 88;
    w.fire({
      team: 'enemy',
      kind: 'orb',
      x: ox + nx * off,
      y: oy + ny * off,
      angle: a,
      speed: 175,
      r: 7,
      scale: post ? 1.7 : 1,
      glowSize: post ? 4.5 : undefined,
      damage: 11,
      life: 6.5,
      owner: b,
    });
  }
  w.fx.beam?.(ox - nx * 540, oy - ny * 540, ox + nx * 540, oy + ny * 540, 5, '#ff8a3a', 0.16);
  // a bright marker at the gap so it reads instantly
  w.fx.flare?.(ox + nx * g, oy + ny * g, 70, GOLD, 0.3);
  w.sfx('broadside_fire', b.x, b.y, { vol: 0.9, pitch: 0.9 });
  w.shake(0.12);
}

/** Desperate ram: turn on the player behind a wide telegraph, then charge. */
function atkRam(b, w) {
  const D = b.data;
  D.state = 'ramAim';
  D.st = 0;
  D.dur = 1.45;
  D.lock = 0.55;
  D.ramToken = (D.ramToken || 0) + 1;
  const token = D.ramToken;
  K.track(
    b,
    w.addHazard({
      shape: 'line',
      telegraph: true,
      life: D.dur,
      width: 150,
      color: RED,
      update(h) {
        if (!b.alive || D.ramToken !== token) {
          h.alive = false;
          return;
        }
        const c = Math.cos(b.angle);
        const s = Math.sin(b.angle);
        h.x = b.x + c * 150;
        h.y = b.y + s * 150;
        h.x2 = b.x + c * 1250;
        h.y2 = b.y + s * 1250;
      },
    })
  );
  w.sfx('boss_warning', b.x, b.y, { vol: 0.6, pitch: 1.2 });
  w.floatText(b.x, b.y - 120, 'RAMMING SPEED!', { color: RED, size: 22, life: 1.4, crit: true });
}

// ---- Launches & shutters ------------------------------------------------------------------

function minionsAlive(D) {
  let n = 0;
  for (const m of D.minions) if (m.alive) n++;
  return n;
}

function launchTick(b, w, dt) {
  const D = b.data;
  D.bay += ((D.bayTarget || 0) - D.bay) * Math.min(1, dt * 4);
  if (D.bayDead) {
    D.bayTarget = 0;
    return;
  }
  if (D.launchQ > 0) {
    D.launchDelay -= dt;
    if (D.bay > 0.85 && D.launchDelay <= 0) {
      D.launchDelay = 0.42;
      D.launchQ--;
      launchOne(b, w);
      if (D.launchQ <= 0) w.after(0.6, () => (D.bayTarget = 0));
    }
    return;
  }
  if (NO_FIRE.has(D.state)) return;
  D.launchT -= dt * b.fireRateMult;
  if (D.launchT > 0) return;
  D.launchT = [11, 15, 12][b.phase] + w.rng.next() * 3;
  const cap = b.phase >= 2 ? 6 : 5;
  const room = cap - minionsAlive(D);
  if (room <= 0) return;
  D.launchQ = Math.min(room, b.phase >= 2 ? 4 : 3);
  D.launchDelay = 0.75;
  D.bayTarget = 1;
  const o = at(b, GEO.bay[0], GEO.bay[1]);
  w.sfx('carrier_launch', o.x, o.y);
  w.fx.steam?.(o.x, o.y, b.angle - Math.PI / 2, 1.2, { count: 5 });
}

function launchOne(b, w) {
  const D = b.data;
  const type = ENEMIES.ornithopter ? 'ornithopter' : 'gyroScout';
  const o = at(b, GEO.bay[0] + 20, GEO.bay[1]);
  const c = Math.cos(b.angle);
  const s = Math.sin(b.angle);
  const e = w.spawnEnemy(type, o.x, o.y, { angle: b.angle, vx: c * 320, vy: s * 320, cogs: 0 });
  if (e) D.minions.push(e);
  const tip = at(b, 104, GEO.bay[1], _q);
  w.fx.beam?.(o.x, o.y, tip.x, tip.y, 3, '#ffe0a0', 0.18);
  w.fx.steam?.(o.x, o.y, b.angle + Math.PI, 1, { count: 4 });
  w.fx.sparks?.(tip.x, tip.y, b.angle, 6, GOLD, 0.6, { speed: 380 });
  w.sfx('boost', o.x, o.y, { pitch: 0.7, vol: 0.6 });
  if (D.minions.length > 24) D.minions = D.minions.filter((m) => m.alive);
}

function shutterTick(b, w, dt) {
  const D = b.data;
  D.shutT -= dt;
  if (D.shutT <= 0) {
    D.shutOpen = !D.shutOpen;
    const closed = [7, 6, 4][b.phase];
    const open = [3, 3.5, 4][b.phase];
    D.shutT = D.shutOpen ? open : closed;
    const br = D.bridge;
    if (br?.alive) {
      w.sfx('hit_armor', br.x, br.y, { pitch: 0.5, vol: 0.9 });
      if (D.shutOpen) {
        w.floatText(br.x, br.y - 46, 'BRIDGE EXPOSED!', { color: GOLD, size: 18, life: 1.3, crit: true });
        w.fx.ring?.(br.x, br.y, 60, GOLD, 0.4, { width: 3, r0: 20 });
      }
    }
  }
  D.shutter += ((D.shutOpen ? 1 : 0) - D.shutter) * Math.min(1, dt * 5);
}

// ---- Phase control & scheduling -----------------------------------------------------------

function enterPhase(b, w, n) {
  const D = b.data;
  K.phaseShift(b, w, n, {
    text: n === 1 ? 'BATTLE STATIONS' : 'FLAGSHIP ABLAZE',
    sub: n === 1 ? 'Mortar crews & wall-guns manned — find the gaps!' : 'The Admiral’s Fist comes for you — watch for the ram!',
    color: n === 2 ? '#ffb070' : '#ffe0a0',
    invuln: 1.7,
  });
  D.state = 'phase';
  D.st = 0;
  D.shutOpen = true;
  D.shutT = 3.2;
  for (let i = 0; i < 6; i++) {
    w.after(i * 0.12, () => {
      if (!b.alive) return;
      const o = at(b, -190 + i * 75, (w.rng.next() - 0.5) * 70);
      w.fx.explosion?.(o.x, o.y, 1.1);
      w.sfx('explode_medium', o.x, o.y, { vol: 0.6 });
    });
  }
  if (n === 2) {
    D.ablaze = true;
    K.sayTaunt(b, w, 'phase', 2);
  } else {
    D.mortarSaid = true;
    K.sayTaunt(b, w, 'phase', 0);
  }
}

function pickAttack(b, w) {
  const D = b.data;
  let m;
  if (b.phase === 0) m = { rake: 2.2, salvo: 1 };
  else if (b.phase === 1) m = { mortar: 3, walls: 3, rake: 1 };
  else m = { mortar: 2, walls: 2, rake: 1.4, ram: D.sinceRam >= 2 ? 7 : 1 };
  if (m[D.last]) m[D.last] *= 0.15;
  return w.rng.weightedKey(m);
}

function startAttack(b, w, kind, p) {
  const D = b.data;
  D.last = kind;
  D.sinceRam = kind === 'ram' ? 0 : (D.sinceRam || 0) + 1;
  D.st = 0;
  if (kind === 'rake') atkRake(b, w, p);
  else if (kind === 'salvo') atkSalvo(b, w);
  else if (kind === 'mortar') atkMortar(b, w, p);
  else if (kind === 'walls') atkWalls(b, w);
  else if (kind === 'ram') atkRam(b, w);
}

function idle(b, cool) {
  const D = b.data;
  D.state = 'idle';
  D.st = 0;
  D.cool = cool;
}

function setRamContact(b, on) {
  for (const h of b.data.hull) h.contactDamage = (on ? 46 : 22) * h.dmgMult;
}

function runState(b, w, dt, p) {
  const D = b.data;
  const cools = [2.4, 1.7, 1.2];
  switch (D.state) {
    case 'enter':
      if (D.st > 1.6 && !D.introSaid) {
        D.introSaid = true;
        K.sayTaunt(b, w, 'intro');
      }
      if (D.st >= 3.4) {
        D.entering = false;
        b.invuln = false;
        D.launchT = 1.2;
        w.sfx('boss_roar', b.x, b.y, { pitch: 0.8, vol: 0.8 });
        w.shake(0.3);
        idle(b, 1.5);
      }
      break;
    case 'phase':
      if (D.st >= 1.7) idle(b, 0.6);
      break;
    case 'idle':
      D.cool -= dt * b.fireRateMult;
      if (D.cool <= 0 && p) startAttack(b, w, pickAttack(b, w), p);
      break;
    case 'rake':
    case 'salvo':
    case 'mortar':
    case 'walls':
      if (D.st >= D.dur) idle(b, cools[b.phase]);
      break;
    case 'ramAim': {
      if (p && D.st < D.dur - D.lock) {
        const want = Math.atan2(p.y - b.y, p.x - b.x);
        b.angle += clamp(angleDiff(b.angle, want), -2.1 * dt, 2.1 * dt);
      }
      b.vx *= Math.exp(-3 * dt);
      b.vy *= Math.exp(-3 * dt);
      D.engine = Math.min(1, D.engine + dt * 1.5);
      if (D.st >= D.dur) {
        D.state = 'ram';
        D.st = 0;
        D.dur = 1.5;
        setRamContact(b, true);
        w.sfx('boss_roar', b.x, b.y, { pitch: 1.2, vol: 0.7 });
        w.sfx('boost', b.x, b.y, { pitch: 0.5 });
        w.shake(0.4);
        w.zoomPunch(0.05);
      }
      break;
    }
    case 'ram': {
      const sp = Math.min(560, 140 + D.st * 1700) * b.speedMult;
      b.vx = Math.cos(b.angle) * sp;
      b.vy = Math.sin(b.angle) * sp;
      D.trailT = (D.trailT || 0) - dt;
      if (D.trailT <= 0) {
        D.trailT = 0.04;
        for (const [lx, ly] of GEO.props) {
          const o = at(b, lx, ly);
          w.fx.smokeTrail?.(o.x, o.y, 1.6, { fire: true });
        }
        const bow = at(b, 236, (w.rng.next() - 0.5) * 30);
        w.fx.sparks?.(bow.x, bow.y, b.angle + Math.PI + (w.rng.next() - 0.5), 2, GOLD, 0.8, { speed: 320 });
      }
      if (D.st >= D.dur) {
        D.state = 'ramRecover';
        D.st = 0;
        setRamContact(b, false);
      }
      break;
    }
    case 'ramRecover':
      b.vx *= Math.exp(-1.6 * dt);
      b.vy *= Math.exp(-1.6 * dt);
      b.angle += clamp(angleDiff(b.angle, 0), -0.9 * dt, 0.9 * dt);
      D.engine = Math.max(0, D.engine - dt);
      if (D.st >= 2.2 && Math.abs(angleDiff(b.angle, 0)) < 0.1) idle(b, cools[2]);
      break;
    default:
      idle(b, 1);
  }
}

// ---- Movement ------------------------------------------------------------------------------

function move(b, w, dt, p) {
  const D = b.data;
  if (D.state === 'ram' || D.state === 'ramRecover' || D.state === 'ramAim') {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    return;
  }
  if (!p) return;
  const dy = b.y - p.y;
  if (Math.abs(dy) > 90) D.side = dy < 0 ? -1 : 1;
  if (D.state === 'enter') D.side = -1;
  const tgt = K.clampToView(w, p.x + Math.sin(D.t * 0.17) * 170, p.y + D.side * 255, MARGIN, _t);
  let max = 105;
  if (D.state === 'enter') max = 230;
  else if (D.state === 'rake' || D.state === 'mortar') max = 18;
  const d = Math.hypot(p.x - b.x, p.y - b.y);
  if (d > 720) max = Math.max(max, 360);
  else if (D.state !== 'enter' && K.outsideView(w, b.x, b.y, MARGIN_OUT)) max = Math.max(max, 290);
  max *= b.speedMult;
  // Track the anchor: a speed-limited proportional term plus the player's own velocity, so a
  // kiting player can't drag the ship out of frame (hold states only follow loosely).
  const ff = D.state === 'rake' || D.state === 'mortar' ? 0.3 : 0.9;
  let dvx = (tgt.x - b.x) * 1.5;
  let dvy = (tgt.y - b.y) * 1.5;
  const m = Math.hypot(dvx, dvy);
  if (m > max) {
    dvx *= max / m;
    dvy *= max / m;
  }
  dvx += (p.vx || 0) * ff;
  dvy += (p.vy || 0) * ff;
  const k = Math.min(1, dt * 1.5);
  b.vx += (dvx - b.vx) * k;
  b.vy += (dvy - b.vy) * k;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  // Gentle yaw into the drift, never far off the cruise heading.
  const yaw = clamp(b.vy / 900, -0.09, 0.09) + Math.sin(D.t * 0.4) * 0.025;
  b.angle += clamp(angleDiff(b.angle, yaw), -0.6 * dt, 0.6 * dt);
}

// ---- Damage states -------------------------------------------------------------------------

const BREACHES = [
  [-150, 38],
  [-40, -30],
  [120, 22],
  [60, -40],
];
const FIRES = [
  [-190, -20],
  [-140, 30],
  [-95, -35],
  [-60, 5],
  [-20, -25],
  [30, 35],
  [70, -15],
  [130, -30],
  [170, 10],
  [-120, 80],
  [40, -80],
];

function damageFx(b, w, dt) {
  const D = b.data;
  const f = b.hp / b.maxHp;
  D.stackT -= dt;
  if (D.stackT <= 0) {
    D.stackT = f < 0.5 ? 0.09 : 0.16;
    const [lx, ly] = GEO.stacks[(w.rng.next() * GEO.stacks.length) | 0];
    const o = at(b, lx, ly);
    w.fx.smoke?.(o.x, o.y, f < 0.5 ? 1.1 : 0.7, { dark: f < 0.5, count: 1, vx: -Math.cos(b.angle) * 40, vy: -Math.sin(b.angle) * 40 });
    if (D.ablaze) w.fx.embers?.(o.x, o.y, 2);
  }
  D.fxT -= dt;
  if (D.fxT <= 0 && f < 0.5) {
    D.fxT = D.ablaze ? 0.05 : 0.11;
    const pts = D.ablaze ? FIRES : BREACHES;
    const [lx, ly] = pts[(w.rng.next() * pts.length) | 0];
    const o = at(b, lx, ly);
    w.fx.smokeTrail?.(o.x, o.y, 1.4, { fire: D.ablaze || f < P3 });
    if (D.ablaze) w.fx.burn?.(o.x, o.y, 1.2);
    if (w.rng.next() < 0.15) w.fx.sparks?.(o.x, o.y, w.rng.angle(), 5, '#ffe08a', 1.2, { speed: 240 });
  }
  if (D.ablaze) {
    D.popT -= dt;
    if (D.popT <= 0) {
      D.popT = 0.6 + w.rng.next() * 0.6;
      const [lx, ly] = FIRES[(w.rng.next() * FIRES.length) | 0];
      const o = at(b, lx, ly);
      w.fx.explosion?.(o.x, o.y, 0.6, { debris: 'metal', debrisCount: 3 });
      w.sfx('explode_small', o.x, o.y, { vol: 0.4 });
    }
  }
}

// ---- Drawing -------------------------------------------------------------------------------

const JAG = (() => {
  const pts = [];
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let y = -112; y <= 112; y += 14) pts.push([GEO.splitX + (rnd() - 0.5) * 22, y]);
  return pts;
})();

function drawProps(ctx, b, w, s) {
  const t = w.time * (18 + (b.data.engine || 0) * 14);
  const list = [...GEO.props, ...GEO.envProps];
  for (let i = 0; i < list.length; i++) {
    const [lx, ly] = list[i];
    const big = i < GEO.props.length;
    const len = big ? 1 : 0.7;
    ctx.save();
    ctx.translate(lx * s, ly * s);
    ctx.globalAlpha = 0.22 * b.alpha;
    ctx.fillStyle = '#9aa3ad';
    ctx.beginPath();
    ctx.ellipse(0, 0, 4 * s, 22 * len * s, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = b.alpha;
    const k = Math.cos(t + i * 1.3);
    K.drawStretched(ctx, BH.blade, 0, 0, 0, s, Math.max(0.08, Math.abs(k)) * len * s, 1);
    K.drawStretched(ctx, BH.blade, 0, 0, 0, s, Math.max(0.08, Math.abs(Math.sin(t + i * 1.3))) * len * s, 0.8);
    Sprites.draw(ctx, BH.hub, 0, 0, 0, s * (big ? 1 : 0.8), b.alpha);
    ctx.restore();
  }
}

function drawDoors(ctx, b, w, s) {
  const D = b.data;
  const [bx, by] = GEO.bay;
  const half = GEO.bayW / 2;
  const open = D.bayDead ? 0 : D.bay;
  const slide = open * (half - 2);
  const bay = D.bayPart;
  for (const dir of [-1, 1]) {
    const x = (bx + dir * (half / 2 + slide)) * s;
    Sprites.draw(ctx, BH.door, x, by * s, 0, s, b.alpha);
    if (bay?.flash > 0) Sprites.drawFlash(ctx, BH.door, x, by * s, 0, s, Math.min(1, bay.flash) * 0.8);
  }
  if (open > 0.3) {
    ctx.globalCompositeOperation = 'lighter';
    Sprites.draw(ctx, BH.glow, bx * s, by * s, 0, 0.6 * open * s, 0.6);
    ctx.globalCompositeOperation = 'source-over';
  }
}

function drawCraters(ctx, b, s) {
  const D = b.data;
  GEO.cannons.forEach(([lx, ly], i) => {
    if (D.cannonDead[i]) Sprites.draw(ctx, BH.crater, lx * s, ly * s, i * 1.7, s * 0.9, b.alpha);
  });
  if (D.bayDead) Sprites.draw(ctx, BH.crater, GEO.bay[0] * s, GEO.bay[1] * s, 0.4, s * 1.2, b.alpha);
}

function drawGlows(ctx, b, w, s) {
  const D = b.data;
  ctx.globalCompositeOperation = 'lighter';
  const nP = GEO.portX.length;
  for (let i = 0; i < nP * 2; i++) {
    const g = D.portGlow[i];
    if (g <= 0.02) continue;
    const side = i >= nP ? 1 : -1;
    const lx = GEO.portX[i % nP];
    Sprites.draw(ctx, BH.glow, lx * s, side * (GEO.portY + 2) * s, 0, (0.25 + 0.25 * g) * s, g);
  }
  const eng = 0.35 + 0.65 * (D.engine || 0) + 0.1 * Math.sin(w.time * 13);
  for (const [lx, ly] of GEO.props) Sprites.draw(ctx, BH.glow, (lx + 8) * s, ly * s, 0, 0.35 * eng * s, 0.8 * b.alpha);
  ctx.globalCompositeOperation = 'source-over';
}

function drawWreck(ctx, b, w) {
  const D = b.data;
  const td = w.time - (D.deadT ?? w.time);
  const k = clamp((td - 0.3) / 1.6, 0, 1);
  const split = 1 - (1 - k) ** 2;
  const s = b.scale;
  const a = b.alpha;
  const img = Sprites.get(BH.hull);
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.angle);
  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.translate(dir * split * 34 * s, -dir * split * 12 * s);
    ctx.rotate(dir * split * 0.2);
    ctx.beginPath();
    if (dir < 0) {
      ctx.moveTo(-300 * s, -130 * s);
      for (const [x, y] of JAG) ctx.lineTo(x * s, y * s);
      ctx.lineTo(-300 * s, 130 * s);
    } else {
      ctx.moveTo(300 * s, -130 * s);
      for (const [x, y] of JAG) ctx.lineTo(x * s, y * s);
      ctx.lineTo(300 * s, 130 * s);
    }
    ctx.closePath();
    ctx.clip();
    ctx.globalAlpha = a;
    ctx.drawImage(img.img, -img.cx * s, -img.cy * s, img.w * s, img.h * s);
    drawCraters(ctx, b, s);
    if (dir > 0) {
      const [bx, by] = GEO.bridge;
      drawBridge(ctx, b, w, bx * s, by * s, 0, s, a, null);
      if (!D.cannonDead[0]) Sprites.draw(ctx, BH.cannon, GEO.cannons[0][0] * s, GEO.cannons[0][1] * s, 0.4, s, a);
    } else if (!D.cannonDead[1]) {
      Sprites.draw(ctx, BH.cannon, GEO.cannons[1][0] * s, GEO.cannons[1][1] * s, 2.6, s, a);
    }
    Sprites.drawTint(ctx, BH.hull, 0, 0, 0, s, '#120a06', (0.35 + 0.35 * split) * a);
    ctx.restore();
  }
  // glowing break edges
  if (split > 0.02) {
    ctx.globalCompositeOperation = 'lighter';
    for (const dir of [-1, 1]) {
      ctx.save();
      ctx.translate(dir * split * 34 * s, -dir * split * 12 * s);
      ctx.rotate(dir * split * 0.2);
      ctx.beginPath();
      JAG.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s)));
      ctx.strokeStyle = '#ff7a2f';
      ctx.globalAlpha = 0.7 * a * (0.7 + 0.3 * Math.sin(w.time * 20 + dir));
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}

// ---- Boss def ---------------------------------------------------------------------------------

export default {
  id: 'behemoth',
  name: "Admiral Vex's Behemoth",
  title: "The Admiral's Fist",
  boss: true,
  stage: 4,
  music: 'boss',
  zoom: 0.8, // camera base zoom for the fight: a 470-unit carrier (onBossSpawn reads def.zoom)
  frameR: 210, // camera boss-framing radius (the whole carrier)
  hp: bossHp('behemoth', BASE_HP), // × campaign toughness (tuning.js)
  hudPhases: [P2, P3],
  r: 150,
  speed: 75,
  contactDamage: 0,
  noContact: true,
  mass: 120,
  xp: 85,
  cogs: 75,
  score: 8000,
  sprite: BH.hull,
  alt: 1.35,
  layer: -1,
  manualMove: true,
  noSeparation: true,
  noKnockback: true,

  init(b, w) {
    b.untargetable = true; // hits land on the hull parts, which forward them here
    const D = b.data;
    Object.assign(D, {
      t: 0,
      st: 0,
      state: 'enter',
      entering: true,
      cool: 2,
      dur: 0,
      side: -1,
      shutter: 0,
      shutOpen: false,
      shutT: 7,
      bay: 0,
      bayTarget: 0,
      bayDead: false,
      launchT: 99,
      launchQ: 0,
      launchDelay: 0,
      engine: 0,
      fxT: 0,
      stackT: 0,
      popT: 1,
      sinceRam: 0,
      ablaze: false,
      cannonDead: [false, false],
      portGlow: new Float32Array(GEO.portX.length * 2),
      minions: [],
      hz: [],
      hull: [],
      cannons: [],
      placed: [],
    });
    const add = (def, lx, ly, opts = {}) => {
      const e = w.spawnEnemy(def, b.x, b.y, { parent: b, ...opts, data: { lx, ly, ...(opts.data || {}) } });
      D.placed.push(e);
      return e;
    };
    for (const lx of [-170, -85, 0, 85, 170]) D.hull.push(add(HULL_DEF, lx, 0, { rawHp: 1, r: 52 }));
    D.hull.push(add(HULL_DEF, 208, 0, { rawHp: 1, r: 28 }));
    for (const s of [-1, 1]) for (const lx of [-120, -10, 100]) D.hull.push(add(HULL_DEF, lx, s * GEO.envY, { rawHp: 1, r: 25 }));
    GEO.cannons.forEach(([lx, ly], i) => {
      const c = add(CANNON_DEF, lx, ly, { rawHp: K.partHp(b, BASE_HP, CANNON_HP), data: { i, turret: true, aim: 0, cd: 1.6 + i * 1.3, aimT: 0, burst: 0 } });
      D.cannons.push(c);
    });
    D.bayPart = add(BAY_DEF, GEO.bay[0], GEO.bay[1], { rawHp: K.partHp(b, BASE_HP, BAY_HP) });
    D.bridge = add(BRIDGE_DEF, GEO.bridge[0], GEO.bridge[1], { rawHp: 1 });
    K.spawnTalker(w, b);
    placeParts(b);
  },

  intro(b, w) {
    const D = b.data;
    // Steam in from the left edge, alongside and above the player.
    const v = w.viewRect(0);
    const p = K.targetPlayer(w, b);
    b.x = v.x0 - 300;
    b.y = p ? p.y - 250 : (v.y0 + v.y1) / 2 - 200;
    b.vx = 200;
    b.angle = 0;
    D.state = 'enter';
    D.entering = true;
    D.st = 0;
    b.invuln = true;
    placeParts(b);
  },

  update(b, dt, w) {
    const D = b.data;
    D.t += dt;
    D.st += dt;
    const p = K.targetPlayer(w, b);
    K.tickInvuln(b, dt);
    if (!D.entering) {
      const f = b.hp / b.maxHp;
      if (b.phase < 2 && f <= P3) enterPhase(b, w, 2);
      else if (b.phase < 1 && f <= P2) enterPhase(b, w, 1);
    }
    move(b, w, dt, p);
    runState(b, w, dt, p);
    placeParts(b);
    if (!D.entering) {
      launchTick(b, w, dt);
      shutterTick(b, w, dt);
    }
    for (let i = 0; i < D.portGlow.length; i++) if (D.portGlow[i] > 0) D.portGlow[i] = Math.max(0, D.portGlow[i] - dt * 1.1);
    if (D.state !== 'ramAim' && D.state !== 'ram') D.engine = Math.max(0, D.engine - dt * 0.5);
    damageFx(b, w, dt);
    D.pruneT = (D.pruneT ?? 1) - dt;
    if (D.pruneT <= 0) {
      D.pruneT = 1;
      K.pruneHazards(b);
    }
  },

  draw(ctx, b, w) {
    if (!b.alive) {
      drawWreck(ctx, b, w);
      return;
    }
    const s = b.scale;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);
    drawProps(ctx, b, w, s);
    ctx.restore();
    w.drawEnemySprite(ctx, b, BH.hull, 0, b.angle, b.x, b.y, s);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);
    drawCraters(ctx, b, s);
    drawDoors(ctx, b, w, s);
    drawGlows(ctx, b, w, s);
    ctx.restore();
  },

  /** Every hit arrives through a part; count each shot/blast once however many parts it hit. */
  modifyDamage(b, amt, info, w) {
    return K.ledger(b, amt, info, w);
  },

  drawShadow(ctx, b, w, ox, oy) {
    Sprites.drawShadow(ctx, BH.hull, b.x + ox, b.y + oy, b.angle, b.scale, 0.3 * b.alpha, 0, 5);
  },

  /** Debug/test hook: force an attack ('rake'|'salvo'|'mortar'|'walls'|'ram'|'launch'). */
  debugAttack(b, w, kind) {
    const p = K.targetPlayer(w, b);
    if (!p || !b.alive) return false;
    if (kind === 'launch') {
      b.data.launchT = 0;
      return 'launch';
    }
    K.cancelHazards(b);
    setRamContact(b, false);
    startAttack(b, w, kind, p);
    return b.data.state;
  },

  onDeath(b, w) {
    const D = b.data;
    D.deadT = w.time;
    K.cancelHazards(b);
    K.sayTaunt(b, w, 'death', undefined, 5);
    // The hull wreck draws its own bridge/cannons on the split halves; drop the live parts
    // silently so they don't become separate wrecks (the comms talker stays for the line).
    for (const part of b.parts || []) if (part !== D.talker && part.alive) w.removeEnemy(part);
    for (const m of D.minions) if (m.alive) m.fleeing = true;
    b.vx *= 0.2;
    b.vy *= 0.2;
    w.slowmo(0.3, 2.2);
    w.flash('#ffe0b0', 0.3);
    // Explosions ripple stern → bow; the keel snaps at the third.
    for (let i = 0; i < 9; i++) {
      w.after(0.08 + i * 0.2, () => {
        const o = at(b, -200 + i * 52, (w.rng.next() - 0.5) * 80);
        w.fx.bigExplosion?.(o.x, o.y, 0.75 + w.rng.next() * 0.5);
        w.fx.debris?.(o.x, o.y, 6, 'metal');
        w.fx.cogs?.(o.x, o.y, 5, { speed: 360 });
        w.sfx('explode_large', o.x, o.y, { vol: 0.8 });
        w.shake(0.3);
        if (i === 3) {
          const c = at(b, GEO.splitX, 0);
          w.fx.bigExplosion?.(c.x, c.y, 1.5);
          w.fx.shockwave?.(c.x, c.y, 520, '#ffd9a0', 0.7);
          w.sfx('explode_huge', c.x, c.y);
          w.shake(0.7);
          w.hitstop(0.1);
        }
      });
    }
    w.after(0.55, () => {
      for (const sd of [-1, 1]) {
        const o = at(b, -10, sd * GEO.envY);
        w.fx.explosion?.(o.x, o.y, 1.6, { debris: 'canvas', debrisCount: 10 });
        w.fx.smoke?.(o.x, o.y, 2.2, { count: 6, dark: true });
        w.sfx('explode_medium', o.x, o.y);
      }
    });
    w.after(1.85, () => {
      w.fx.cogs?.(b.x, b.y, 30, { speed: 520 });
      w.fx.sparks?.(b.x, b.y, 0, 30, GOLD, TAU, { speed: 700 });
      w.fx.embers?.(b.x, b.y, 30, { speed: 300 });
    });
  },
};
