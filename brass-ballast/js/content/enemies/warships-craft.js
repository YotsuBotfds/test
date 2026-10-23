// WP13 — behaviours for the smaller Iron Syndicate craft: Tesla Buoy (linked pairs with a lethal
// arc), Ornithopter Ace (strafing, burst-firing, shot-dodging flyer) and Steam Wraith (phasing
// ghost ship). Art lives in warships-art-craft.js.

import { Sprites } from '../../gfx/sprites.js';
import * as AI from '../../game/ai.js';
import { TAU, clamp, distToSegment2 } from '../../core/math.js';
import './warships-art-craft.js';
import { SYN, local, spriteShadow, drawBody, target } from './warships-kit.js';

// =============================================================================================
// Tesla Buoy
// =============================================================================================

const ARC_DAMAGE = 8; // per tick (DESIGN §2.10)
const ARC_TICK = 0.25;
const ARC_WARMUP = 0.7; // s of harmless crackle before a fresh arc goes live
const ARC_MAX = 520; // arcs snap beyond this
const PAIR_GAP = 180; // preferred spacing while sweeping the player

const partnerOf = (e) => {
  const o = e.partner || e.data.partner;
  return o && o.alive ? o : null;
};

function link(a, b) {
  a.partner = b;
  b.partner = a;
  a.data.partner = b;
  b.data.partner = a;
}

/** A lone buoy (debug spawn, edge formation…) launches its own partner nearby. */
function spawnPartner(e, w) {
  const a = w.rng.angle();
  const x = e.x + Math.cos(a) * 150;
  const y = e.y + Math.sin(a) * 150;
  const o = w.spawnEnemy('teslaBuoy', x, y, {
    wave: e.wave,
    elite: e.elite || undefined,
    data: { partnerChecked: true },
  });
  if (!o) return;
  link(e, o);
  w.fx.lightning?.(e.x, e.y, o.x, o.y, { color: SYN.arc, width: 1.6, life: 0.25, branches: 1, sparks: false });
}

/** Draw for the arc hazard: crackling warm-up, then a hot magenta glow under the fx bolts. */
function drawArc(ctx, h, w) {
  const a = h.data.a;
  const b = h.data.b;
  if (!a || !b) return;
  if (!w.isVisible(a.x, a.y, 260) && !w.isVisible(b.x, b.y, 260)) return;
  const warm = h.t < h.delay;
  const k = warm ? h.t / h.delay : 1;
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  if (warm) {
    ctx.setLineDash([6, 9]);
    ctx.lineDashOffset = -h.t * 90;
    ctx.globalAlpha = (0.25 + 0.5 * k) * (0.6 + 0.4 * Math.sin(h.t * 50));
    ctx.strokeStyle = SYN.arc;
    ctx.lineWidth = 2 + 3 * k;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    const pulse = 0.75 + 0.25 * Math.sin(h.t * 31);
    ctx.globalAlpha = 0.16 * pulse;
    ctx.strokeStyle = SYN.arc;
    ctx.lineWidth = h.width * 1.8;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.globalAlpha = 0.3 * pulse;
    ctx.lineWidth = h.width * 0.7;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function arcUpdate(h, dt, w) {
  const a = h.data.a;
  const b = h.data.b;
  if (!a.alive || !b.alive || Math.hypot(b.x - a.x, b.y - a.y) > ARC_MAX) {
    h.alive = false;
    if (a.alive && b.alive) {
      // stretched too far: the arc snaps with a spit of sparks at both terminals
      w.fx.sparks?.(a.x, a.y, Math.atan2(b.y - a.y, b.x - a.x), 5, SYN.arc, 1);
      w.fx.sparks?.(b.x, b.y, Math.atan2(a.y - b.y, a.x - b.x), 5, SYN.arc, 1);
    }
    return;
  }
  h.x = a.x;
  h.y = a.y;
  h.x2 = b.x;
  h.y2 = b.y;
  if (h.t < h.delay) return;
  const vis = w.isVisible(a.x, a.y, 200) || w.isVisible(b.x, b.y, 200);
  h.data.boltT -= dt;
  if (h.data.boltT <= 0 && vis) {
    h.data.boltT = 0.11;
    w.fx.lightning?.(a.x, a.y, b.x, b.y, {
      color: SYN.arc,
      width: 2.8,
      life: 0.16,
      branches: 2,
      jitter: 0.16,
      from: a,
      to: b,
      sparks: false,
    });
  }
  h.data.humT -= dt;
  if (h.data.humT <= 0 && vis) {
    h.data.humT = 1.05;
    w.sfx('tesla_hum', (a.x + b.x) / 2, (a.y + b.y) / 2, { vol: 0.55 });
  }
}

function arcHit(h, target, w) {
  // a visible zap from the nearer terminal into the victim
  const a = h.data.a;
  const b = h.data.b;
  const src = Math.hypot(a.x - target.x, a.y - target.y) < Math.hypot(b.x - target.x, b.y - target.y) ? a : b;
  w.fx.lightning?.(src.x, src.y, target.x, target.y, { color: SYN.arc, width: 2, life: 0.18, branches: 1 });
  w.sfx('enemy_zap', target.x, target.y, { vol: 0.7 });
}

function makeArc(e, o, w) {
  return w.addHazard({
    shape: 'line',
    x: e.x,
    y: e.y,
    x2: o.x,
    y2: o.y,
    width: 18,
    damage: ARC_DAMAGE,
    tick: ARC_TICK,
    delay: ARC_WARMUP,
    life: 1e9,
    team: 'enemy',
    owner: e,
    source: 'enemy',
    element: 'shock',
    color: SYN.arc,
    data: { a: e, b: o, boltT: 0, humT: 0, keepLine: false },
    update: arcUpdate,
    draw: drawArc,
    onHit: arcHit,
  });
}

const teslaBuoy = {
  id: 'teslaBuoy',
  name: 'Tesla Buoy',
  hp: 50,
  r: 18,
  speed: 30,
  contactDamage: 12,
  mass: 2.5,
  xp: 3,
  cogs: 0.8,
  score: 60,
  sprite: 'enemy_teslaBuoy',
  alt: 0.9,
  drawShadow: spriteShadow('enemy_teslaBuoy'),

  init(e, w) {
    e.data.spin = w.rng.chance(0.5) ? 1 : -1;
    e.data.charge = 0;
    e.data.orient = w.rng.angle();
    e.state = 'linked';
  },

  update(e, dt, w) {
    const d = e.data;
    // Pair formations link partners right after spawn (before the first update). Anything
    // else — debug spawns, edge/ring formations — gets a partner launched here.
    if (!d.partnerChecked) {
      d.partnerChecked = true;
      if (!partnerOf(e)) spawnPartner(e, w);
    }
    e.angle += d.spin * 0.7 * dt;
    const p = target(w, e);
    if (!p) return;
    const o = partnerOf(e);
    const leader = !o || e.id < o.id;
    const far = Math.hypot(p.x - e.x, p.y - e.y) > 650;
    const catchup = far ? 3.5 : 1;

    if (o) {
      // Both buoys share the leader's sweep orientation; each holds its end of a line through
      // the player, so the arc slowly scythes across the area.
      if (leader) d.orient += d.spin * 0.32 * dt;
      const ang = (leader ? d.orient : o.data.orient) + Math.PI / 2;
      const sgn = leader ? -1 : 1;
      const tx = p.x + Math.cos(ang) * sgn * (PAIR_GAP / 2);
      const ty = p.y + Math.sin(ang) * sgn * (PAIR_GAP / 2);
      AI.seek(e, tx, ty, this.speed * catchup, 40 * catchup, dt);
      if (leader && (!d.arc || !d.arc.alive) && Math.hypot(o.x - e.x, o.y - e.y) < ARC_MAX * 0.92) {
        d.arc = makeArc(e, o, w);
        w.sfx('enemy_zap', e.x, e.y, { vol: 0.4, pitch: 0.7 });
      }
      d.charge = Math.max(0, d.charge - dt);
    } else {
      // Widowed: overcharged — creeps after the player and discharges spark rings.
      if (e.state !== 'lone') {
        e.state = 'lone';
        d.zapT = 1.2;
        e.speedMult *= 1.6;
      }
      AI.seek(e, p.x, p.y, this.speed * catchup, 60, dt);
      d.zapT -= dt * e.fireRateMult;
      d.charge = clamp(1 - d.zapT / 0.6, 0, 1);
      if (d.zapT <= 0) {
        d.zapT = 2.6;
        if (Math.hypot(p.x - e.x, p.y - e.y) < 520) {
          AI.fireRing(w, e.x, e.y, 8, w.rng.angle(), {
            owner: e,
            kind: 'spark',
            speed: 165,
            r: 6,
            damage: 9,
            element: 'shock',
          });
          for (let i = 0; i < 3; i++) {
            const a = w.rng.angle();
            w.fx.lightning?.(e.x, e.y, e.x + Math.cos(a) * 70, e.y + Math.sin(a) * 70, {
              color: SYN.arc,
              width: 1.8,
              life: 0.18,
              branches: 1,
            });
          }
          w.sfx('enemy_zap', e.x, e.y, { vol: 0.8 });
        }
      }
    }
  },

  draw(ctx, e, w) {
    drawBody(ctx, e, w, 'enemy_teslaBuoy');
    if (e.dead) return;
    const o = partnerOf(e);
    const base = o ? 0.55 : 0.4;
    const a = clamp(base + 0.25 * Math.sin(e.t * 9 + e.id) + e.data.charge * 0.6, 0, 1);
    ctx.globalCompositeOperation = 'lighter';
    Sprites.draw(ctx, 'enemy_teslaBuoy_glow', e.x, e.y, e.angle, e.scale * (1 + e.data.charge * 0.3), a * e.alpha, ((e.t * 14) | 0) & 3);
    ctx.globalCompositeOperation = 'source-over';
  },

  onDeath(e, w) {
    w.fx.shockwave?.(e.x, e.y, 110, SYN.arc, 0.4);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + w.rng.next();
      const r = w.rng.range(60, 120);
      w.fx.lightning?.(e.x, e.y, e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, {
        color: SYN.arc,
        width: 2.2,
        life: 0.25,
        branches: 1,
      });
    }
    w.fx.sparks?.(e.x, e.y, 0, 12, SYN.arc, TAU);
    w.sfx('enemy_zap', e.x, e.y, { vol: 0.9, pitch: 0.8 });
    const o = partnerOf(e);
    if (o) {
      // the dying buoy dumps its charge into its partner
      w.fx.lightning?.(e.x, e.y, o.x, o.y, { color: SYN.arc, width: 4, life: 0.35, branches: 3 });
      o.flash = 1;
      o.data.charge = 1;
    }
  },
};

// =============================================================================================
// Ornithopter Ace
// =============================================================================================

const BURST_EVERY = 2.6;
const DODGE_CD = 0.75;

/** Look for a player shot about to hit; returns the sidestep heading or null. */
function threatDodge(e, w) {
  const list = w.pBullets;
  const rr = e.r + 26;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (!b.alive || b.lob) continue;
    const rx = e.x - b.x;
    const ry = e.y - b.y;
    if (rx * rx + ry * ry > 170 * 170) continue;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp < 1 || rx * b.vx + ry * b.vy <= 0) continue; // moving away
    const ahead = 0.35 * sp; // where the shot will be shortly
    const ex = b.x + (b.vx / sp) * ahead;
    const ey = b.y + (b.vy / sp) * ahead;
    if (distToSegment2(e.x, e.y, b.x, b.y, ex, ey) > rr * rr) continue;
    // step perpendicular to the shot, away from its line
    const cross = b.vx * ry - b.vy * rx;
    const s = cross >= 0 ? 1 : -1;
    return Math.atan2(b.vy, b.vx) + s * (Math.PI / 2);
  }
  return null;
}

const ornithopter = {
  id: 'ornithopter',
  name: 'Ornithopter Ace',
  hp: 45,
  r: 18,
  speed: 260,
  contactDamage: 14,
  mass: 1,
  xp: 6,
  cogs: 1.5,
  score: 130,
  sprite: 'enemy_ornithopter',
  alt: 1.4,

  init(e, w) {
    e.state = 'strafe';
    e.data.flap = w.rng.next() * 4;
    e.data.flapRate = 13;
    e.data.dodgeCd = 0.5;
    e.data.scanT = 0;
    e.data.flipT = w.rng.range(2, 4);
    e.data.strafeDir = w.rng.chance(0.5) ? 1 : -1;
  },

  update(e, dt, w) {
    const d = e.data;
    const p = target(w, e);
    d.flap += dt * d.flapRate;
    d.flapRate += (13 - d.flapRate) * Math.min(1, dt * 3);
    e.frame = (d.flap | 0) & 3;
    if (!p) return;

    d.flipT -= dt;
    if (d.flipT <= 0) {
      d.flipT = w.rng.range(2, 4.2);
      d.strafeDir = -d.strafeDir;
    }
    const dist = AI.keepRange(e, p, 220, 330, this.speed, dt, d.strafeDir);

    // --- evasive sidestep when a player shot is about to connect ---
    d.dodgeCd -= dt;
    d.scanT -= dt;
    if (d.dodgeCd <= 0 && d.scanT <= 0 && e.state !== 'burst') {
      d.scanT = 0.06;
      const h = threatDodge(e, w);
      if (h !== null) {
        d.dodgeCd = DODGE_CD / Math.max(0.5, e.fireRateMult);
        if (w.rng.chance(0.78)) {
          const kick = 430 * e.speedMult;
          e.vx += Math.cos(h) * kick;
          e.vy += Math.sin(h) * kick;
          d.flapRate = 30;
          d.dodges = (d.dodges || 0) + 1;
          if (w.isVisible(e.x, e.y, 40)) {
            w.fx.steam?.(e.x, e.y, h + Math.PI, 0.55, { count: 2 });
            w.sfx('steam_vent', e.x, e.y, { vol: 0.25, pitch: 1.7 });
          }
        }
      }
    }

    // --- aimed 4-shot bursts ---
    if (e.state === 'strafe') {
      AI.faceVelocity(e, 7, dt, 30);
      if (AI.cooldown(e, 'burstCd', BURST_EVERY, dt) && dist < 520) {
        AI.setState(e, 'aim', 0.38);
        d.shots = 4;
      }
    } else if (e.state === 'aim') {
      AI.faceToward(e, AI.aimAngle(e, p, 330), 9, dt);
      if (AI.timerDone(e, dt)) {
        AI.setState(e, 'burst', 0);
        const m = local(e, 22, 0);
        w.fx.flare?.(m.x, m.y, 26, '#ffb070');
      }
    } else if (e.state === 'burst') {
      AI.faceToward(e, AI.aimAngle(e, p, 330), 6, dt);
      e.timer -= dt * e.fireRateMult;
      if (e.timer <= 0) {
        e.timer = 0.085;
        const side = d.shots % 2 ? 3.4 : -3.4;
        const m = local(e, 24, side);
        AI.fireAimed(w, e, p, {
          x: m.x,
          y: m.y,
          kind: 'needle',
          speed: 330,
          r: 5,
          damage: 9,
          lead: true,
          jitter: 0.07,
        });
        w.fx.muzzle?.(m.x, m.y, e.angle, 0.45, '#ffb070');
        w.sfx('enemy_shot', m.x, m.y, { vol: 0.55, pitch: 1.35 });
        if (--d.shots <= 0) e.state = 'strafe';
      }
    }
  },

  onDeath(e, w) {
    w.fx.debris?.(e.x, e.y, 5, 'canvas', { speed: 220 });
    w.fx.sparks?.(e.x, e.y, e.angle, 8, '#ffb070', 1.2);
    w.fx.smoke?.(e.x, e.y, 0.8, { dark: true, count: 2 });
  },
};

// =============================================================================================
// Steam Wraith
// =============================================================================================

const PHASE_TIME = 2; // invulnerable & untargetable (DESIGN §2.10)
const FORM_TIME = 0.55; // materialising (still intangible) — the ring telegraph
const SOLID_TIME = 2.4; // vulnerable window
const FADE_TIME = 0.45;
const RING_COUNT = 12;

function setPhased(e, on) {
  e.phased = on;
  e.invuln = on;
  e.untargetable = on;
}

/** Pick where to materialise: a ring around the player, roughly on our side. */
function pickDest(e, w, p) {
  const base = Math.atan2(e.y - p.y, e.x - p.x);
  const a = base + w.rng.range(-1.3, 1.3);
  const r = w.rng.range(150, 210);
  e.data.ox = Math.cos(a) * r;
  e.data.oy = Math.sin(a) * r;
}

const steamWraith = {
  id: 'steamWraith',
  name: 'Steam Wraith',
  hp: 60,
  r: 28,
  speed: 140,
  contactDamage: 16,
  mass: 2,
  xp: 6,
  cogs: 1.5,
  score: 150,
  sprite: 'enemy_steamWraith',
  alt: 1.15,
  drawShadow: spriteShadow('enemy_steamWraith', 0.22),

  init(e, w) {
    e.data.vis = 0;
    e.data.wispT = 0;
    e.data.ox = 0;
    e.data.oy = 0;
    setPhased(e, true);
    AI.setState(e, 'phase', PHASE_TIME * 0.6);
    const p = target(w, e);
    if (p) pickDest(e, w, p);
  },

  update(e, dt, w) {
    const d = e.data;
    const p = target(w, e);
    if (!p) return;
    const tx = p.x + d.ox;
    const ty = p.y + d.oy;

    if (e.state === 'phase') {
      d.vis = Math.max(0, d.vis - dt * 3);
      AI.seek(e, tx, ty, this.speed * 1.8, 700, dt);
      AI.faceVelocity(e, 4, dt, 20);
      d.wispT -= dt;
      if (d.wispT <= 0 && w.isVisible(e.x, e.y, 60)) {
        d.wispT = 0.09;
        w.fx.steam?.(e.x - Math.cos(e.angle) * 20, e.y - Math.sin(e.angle) * 20, e.angle + Math.PI, 0.5, {
          count: 1,
          alpha: 0.35,
          speed: 0.5,
        });
      }
      if (AI.timerDone(e, dt)) {
        // too far to glide? slip through the steam and appear there
        if (Math.hypot(tx - e.x, ty - e.y) > 70) {
          w.fx.steamBurst?.(e.x, e.y, 0.8, 8);
          e.x = tx;
          e.y = ty;
        }
        e.vx *= 0.2;
        e.vy *= 0.2;
        AI.setState(e, 'form', FORM_TIME / Math.max(0.5, e.fireRateMult));
        e.angle = Math.atan2(p.y - e.y, p.x - e.x);
        w.sfx('wraith_phase', e.x, e.y);
        w.fx.steamBurst?.(e.x, e.y, 1.1, 12);
        w.telegraphCircle(e.x, e.y, 64, e.timer, { color: '#ff3d8b', follow: e });
      }
    } else if (e.state === 'form') {
      d.vis = Math.min(1, d.vis + dt / FORM_TIME);
      AI.accelTo(e, 0, 0, 400, dt);
      AI.faceToward(e, Math.atan2(p.y - e.y, p.x - e.x), 3, dt);
      if (AI.timerDone(e, dt)) {
        setPhased(e, false);
        d.vis = 1;
        const off = w.rng.angle();
        AI.fireRing(w, e.x, e.y, RING_COUNT, off, { owner: e, kind: 'orb', speed: 185, r: 7, damage: 11 });
        if (e.elite || w.run?.stageIndex >= 4) {
          // a second, offset ring for the nastier ones
          w.after(0.28, (ww) => {
            if (e.alive) {
              AI.fireRing(ww, e.x, e.y, RING_COUNT, off + Math.PI / RING_COUNT, {
                owner: e,
                kind: 'orb',
                speed: 150,
                r: 7,
                damage: 11,
              });
            }
          });
        }
        w.fx.shockwave?.(e.x, e.y, 120, SYN.ghost, 0.4);
        w.fx.steamBurst?.(e.x, e.y, 1.3, 14);
        w.sfx('enemy_shot', e.x, e.y, { vol: 0.8, pitch: 0.7 });
        if (w.isVisible(e.x, e.y, 0)) w.shake(0.07);
        AI.setState(e, 'solid', SOLID_TIME);
      }
    } else if (e.state === 'solid') {
      AI.keepRange(e, p, 150, 260, 45, dt);
      AI.faceToward(e, Math.atan2(p.y - e.y, p.x - e.x), 1.5, dt);
      if (AI.timerDone(e, dt)) {
        AI.setState(e, 'fade', FADE_TIME);
        w.sfx('wraith_phase', e.x, e.y, { vol: 0.6, pitch: 0.75 });
      }
    } else if (e.state === 'fade') {
      d.vis = Math.max(0, d.vis - dt / FADE_TIME);
      AI.accelTo(e, 0, 0, 200, dt);
      if (AI.timerDone(e, dt)) {
        setPhased(e, true);
        pickDest(e, w, p);
        AI.setState(e, 'phase', PHASE_TIME);
        w.fx.steamBurst?.(e.x, e.y, 0.9, 10);
      }
    }
  },

  draw(ctx, e, w) {
    const d = e.data;
    const x = e.x;
    const y = e.y;
    const t = e.t;
    const vis = e.dead ? 1 : d.vis;
    const ghost = 1 - vis;
    // spectral aura (additive) — strongest while phased
    ctx.globalCompositeOperation = 'lighter';
    Sprites.draw(ctx, 'enemy_steamWraith_aura', x, y, e.angle, e.scale * (1 + 0.05 * Math.sin(t * 5)), (0.18 + 0.4 * ghost) * e.alpha);
    ctx.globalCompositeOperation = 'source-over';
    if (ghost > 0.02 && !e.dead) {
      // shimmering after-images
      const a = 0.14 * ghost * e.alpha;
      Sprites.drawTint(ctx, 'enemy_steamWraith', x + Math.sin(t * 9) * 4, y + Math.cos(t * 7) * 3, e.angle, e.scale * 1.04, SYN.ghost, a);
      Sprites.drawTint(ctx, 'enemy_steamWraith', x - Math.sin(t * 8 + 1) * 4, y - Math.cos(t * 11) * 3, e.angle, e.scale * 0.98, '#e8fffa', a);
    }
    if (vis >= 0.999 || e.dead) {
      drawBody(ctx, e, w, 'enemy_steamWraith');
    } else {
      // translucent body (the engine would dim phased enemies to 0.35 anyway)
      const a = (0.3 + 0.7 * vis * vis) * e.alpha;
      if (e.elite) Sprites.drawOutline(ctx, 'enemy_steamWraith', x, y, e.angle, e.scale, '#ffcf4a', 0.6 * a);
      Sprites.draw(ctx, 'enemy_steamWraith', x, y, e.angle, e.scale, a);
      Sprites.drawTint(ctx, 'enemy_steamWraith', x, y, e.angle, e.scale, SYN.ghost, (0.12 + 0.08 * Math.sin(t * 13)) * ghost * e.alpha);
    }
  },

  onDeath(e, w) {
    w.fx.steamBurst?.(e.x, e.y, 1.6, 18);
    w.fx.shockwave?.(e.x, e.y, 160, SYN.ghost, 0.5);
    w.fx.embers?.(e.x, e.y, 10, { color: '#ff5a2a', speed: 140 });
    w.fx.debris?.(e.x, e.y, 6, 'wood', { speed: 200 });
    w.sfx('wraith_phase', e.x, e.y, { pitch: 0.55 });
  },
};

/** Exported for the aggregator. */
export const CRAFT_DEFS = { teslaBuoy, ornithopter, steamWraith };
