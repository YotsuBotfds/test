// Skirmisher enemies (WP12) — the Iron Syndicate's light craft (DESIGN §2.10).
//
//   gyroScout   swarming rotor pods: chase with a shared sine weave + boids separation, lunge
//   kiteBomber  flights of bat-kites: line-abreast strafing runs, fused carpet bombs (1.2 s)
//   balloonMine drifting spiked mine: blinks faster as you near it, arms (0.55 s) → blast that
//               hurts everyone (team 'all') and chain-detonates other mines
//   gunboat     orbits at staggered ranges, turret charges (glow) → 3-shot spread every 2 s
//   clockWasp   hover → 0.5 s red dash line → 520 u/s dash with afterimages → recover
//   flakIsland  floating rock fort: target reticle → flak shell → 8-shard burst; crumbles
//
// Numbers are stage-1 baselines; the engine scales hp/damage per stage. Every behaviour honours
// e.speedMult (AI helpers or explicit multiply) and e.fireRateMult (AI.cooldown or explicit).
// Art lives in ./skirmishers-art.js (sprites + part offsets).

import { Sprites } from '../../gfx/sprites.js';
import * as AI from '../../game/ai.js';
import * as Haz from '../../game/hazards.js';
import { TAU, clamp, angleDiff } from '../../core/math.js';
import { ART } from './skirmishers-art.js';

// ---------------------------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------------------------

const _pt = { x: 0, y: 0 };
const _q = [];

/** Body-local (lx, ly) → world, written into a shared scratch point (copy if you keep it). */
function local(e, lx, ly, angle = e.angle, out = _pt) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const k = e.scale;
  out.x = e.x + (c * lx - s * ly) * k;
  out.y = e.y + (s * lx + c * ly) * k;
  return out;
}

const rnd = (w, a, b) => a + (w.rng?.next?.() ?? Math.random()) * (b - a);

/** Sprite-silhouette shadow for defs with a custom draw (engine would fall back to a blob). */
function spriteShadow(ctx, e, sprite, ox, oy, angle = e.angle, a = 0.28, scale = e.scale) {
  Sprites.drawTint(ctx, sprite, e.x + ox, e.y + oy, angle, scale, '#000000', a * e.alpha);
}

/** Visible (with margin) — enemies never open fire from off-screen. */
const onScreen = (w, e, m = 30) => w.isVisible(e.x, e.y, m);

/** Counter-based particle emitter: true roughly every `every` seconds. */
function tick(e, key, every, dt) {
  const d = e.data;
  d[key] = (d[key] ?? Math.random() * every) - dt;
  if (d[key] > 0) return false;
  d[key] += every;
  if (d[key] < 0) d[key] = every;
  return true;
}

/** Ember-orange muzzle bloom (additive) for charging guns. */
function drawChargeGlow(ctx, x, y, k, size) {
  if (k <= 0) return;
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  Sprites.draw(ctx, 'enemy_gunboat_glow', x, y, 0, (size * (0.35 + 0.65 * k)) / 48, 0.35 + 0.6 * k);
  ctx.globalCompositeOperation = prev;
}

// ---------------------------------------------------------------------------------------------
// Gyro Scout
// ---------------------------------------------------------------------------------------------

const gyroScout = {
  id: 'gyroScout',
  name: 'Gyro Scout',
  hp: 10,
  r: 14,
  speed: 150,
  contactDamage: 10,
  mass: 0.6,
  xp: 1,
  cogs: 0.25,
  score: 10,
  sprite: 'enemy_gyroScout',
  alt: 1,

  init(e, w) {
    const d = e.data;
    d.rot = rnd(w, 0, TAU);
    // Scouts spawned in the same half-second share a weave phase → the swarm ripples together.
    d.phase = ((Math.floor(w.time * 2) * 1.7) % TAU) + rnd(w, -0.45, 0.45);
    d.weaveF = rnd(w, 0.32, 0.46);
    d.lunge = 0;
    d.lungeCd = rnd(w, 1.2, 3);
  },

  update(e, dt, w) {
    const d = e.data;
    const sp = this.speed;
    d.rot += dt * 30;
    const p = w.nearestPlayer(e.x, e.y);
    if (!p) {
      AI.accelTo(e, e.vx * 0.5, e.vy * 0.5, 200, dt);
      return;
    }
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    // Weave fades out on the final approach so they actually connect.
    const amp = dist > 220 ? 0.8 : dist > 110 ? 0.45 : 0.1;
    const a = Math.atan2(dy, dx) + Math.sin(e.t * TAU * d.weaveF + d.phase) * amp;
    let boost = 1;
    d.lungeCd -= dt;
    if (d.lunge > 0) {
      d.lunge -= dt;
      boost = 1.8;
    } else if (dist < 170 && d.lungeCd <= 0) {
      d.lunge = 0.45;
      d.lungeCd = rnd(w, 2.2, 3.2);
      if (onScreen(w, e)) {
        w.fx.steam?.(e.x - Math.cos(e.angle) * 10, e.y - Math.sin(e.angle) * 10, e.angle + Math.PI, 0.45, { count: 2 });
      }
    }
    let vx = Math.cos(a) * sp * boost;
    let vy = Math.sin(a) * sp * boost;
    // Boids-style separation among scouts: the swarm spreads into a loose net.
    _q.length = 0;
    w.queryEnemies(e.x, e.y, 38, _q);
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < _q.length; i++) {
      const o = _q[i];
      if (o === e || o.type !== e.type) continue;
      const ox = e.x - o.x;
      const oy = e.y - o.y;
      const od = Math.hypot(ox, oy) || 1;
      const k = (38 - od) / 38;
      sx += (ox / od) * k;
      sy += (oy / od) * k;
    }
    vx += sx * sp * 1.1;
    vy += sy * sp * 1.1;
    AI.accelTo(e, vx * e.speedMult, vy * e.speedMult, 520 * e.speedMult, dt);
    AI.faceVelocity(e, 7, dt);
    if (tick(e, 'puff', 0.38, dt) && onScreen(w, e)) {
      const t = local(e, -15, 0);
      w.fx.smokeTrail?.(t.x, t.y, 0.3, { alpha: 0.3, life: 0.6 });
    }
  },

  draw(ctx, e, w) {
    w.drawEnemySprite(ctx, e);
    const [rx, ry] = ART.gyroScout.rotor;
    const h = local(e, rx, ry);
    // Rotor spins faster while lunging; slight translucency sells the blur.
    Sprites.draw(ctx, 'enemy_gyroScout_rotor', h.x, h.y, e.data.rot * (e.data.lunge > 0 ? 1.4 : 1), e.scale, 0.85 * e.alpha);
  },

  drawShadow(ctx, e, w, ox, oy) {
    spriteShadow(ctx, e, 'enemy_gyroScout', ox, oy);
    const h = local(e, ART.gyroScout.rotor[0], 0);
    Sprites.drawTint(ctx, 'enemy_gyroScout_rotor', h.x + ox, h.y + oy, e.data.rot, e.scale, '#000000', 0.16 * e.alpha);
  },
};

// ---------------------------------------------------------------------------------------------
// Kite Bomber — flights fly line-abreast strafing runs and carpet the player's path.
// ---------------------------------------------------------------------------------------------

const BOMB = { fuse: 1.2, radius: 60, damage: 16, fall: 0.28 };
let lastFlight = null; // flight being assembled during the current spawn frame

function newFlight(e) {
  return { members: [e], state: 'approach', t: 0, turnDir: 1, heading: e.angle };
}

/** Fuse-ring telegraph with the falling/ticking bomb drawn on top. */
function drawBombHazard(ctx, h, w) {
  const k = Math.min(1, h.t / h.life);
  ctx.save();
  Haz.drawWarning?.(ctx, h, w);
  ctx.restore();
  // Fuse burning down: bright arc that shrinks clockwise.
  const rem = 1 - k;
  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = k > 0.75 && Math.sin(h.t * 50) > 0 ? '#fff3c4' : '#ffb347';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.r * 0.42, -Math.PI / 2, -Math.PI / 2 + rem * TAU);
  ctx.stroke();
  const d = h.data;
  const fall = Math.min(1, h.t / BOMB.fall);
  const bx = d.sx + (h.x - d.sx) * fall;
  const by = d.sy + (h.y - d.sy) * fall;
  const sc = 1.6 - 0.6 * fall;
  if (fall >= 1) {
    // ticking wobble + fuse spark
    const wob = Math.sin(h.t * 30) * 0.12 * k;
    Sprites.draw(ctx, 'enemy_kiteBomber_bomb', bx, by, d.spin + wob, 1.15, 1);
    ctx.globalCompositeOperation = 'lighter';
    const fl = 0.7 + 0.3 * Math.sin(h.t * 60);
    Sprites.draw(ctx, 'enemy_gunboat_glow', bx + 1, by - 3.5, 0, (10 + 8 * k) / 48 * fl, 0.9);
    ctx.globalCompositeOperation = 'source-over';
  } else {
    Sprites.draw(ctx, 'enemy_kiteBomber_bomb', bx, by, d.spin + h.t * 9, sc * 1.15, 1);
  }
}

function dropBomb(w, e, x, y) {
  const dmgMult = e.dmgMult;
  w.addHazard({
    x,
    y,
    r: BOMB.radius,
    shape: 'circle',
    telegraph: true,
    life: BOMB.fuse,
    color: '#ff5a2a',
    data: { sx: e.x, sy: e.y, spin: rnd(w, 0, TAU), spark: 0 },
    draw: drawBombHazard,
    update(h, dt, ww) {
      if (h.t < BOMB.fall) return;
      h.data.spark -= dt;
      if (h.data.spark <= 0) {
        h.data.spark = 0.05;
        ww.fx.trail?.(h.x + 1 + rnd(ww, -1.5, 1.5), h.y - 4, '#ffd27a', 5, 0.25);
      }
    },
    onDone(h, ww) {
      ww.explode(h.x, h.y, BOMB.radius, BOMB.damage, { team: 'enemy', dmgMult, source: 'enemy', visual: 'medium' });
      ww.fx.debris?.(h.x, h.y, 3, 'iron');
    },
  });
  w.sfx('bomb_whistle', e.x, e.y, { vol: 0.6 });
}

const kiteBomber = {
  id: 'kiteBomber',
  name: 'Kite Bomber',
  hp: 18,
  r: 20,
  speed: 170,
  contactDamage: 10,
  mass: 0.8,
  xp: 2,
  cogs: 0.45,
  score: 20,
  sprite: 'enemy_kiteBomber',
  alt: 1.25,

  init(e, w) {
    const d = e.data;
    d.prop = rnd(w, 0, TAU);
    d.bombs = ART.kiteBomber.bombs.length;
    d.reload = 0;
    d.dropCd = 0;
    // Join the flight being formed this frame if we spawned beside it (director 'line' waves).
    const lf = lastFlight;
    if (lf && lf.world === w && lf.time === w.time && lf.flight.members.length < 7) {
      const lead = lf.flight.members[0];
      if (Math.hypot(lead.x - e.x, lead.y - e.y) < 70 * lf.flight.members.length + 60) {
        lf.flight.members.push(e);
        d.flight = lf.flight;
        return;
      }
    }
    d.flight = newFlight(e);
    lastFlight = { world: w, time: w.time, flight: d.flight };
  },

  update(e, dt, w) {
    const d = e.data;
    d.prop += dt * 36;
    const f = d.flight;
    if (f.members.some((m) => !m.alive)) f.members = f.members.filter((m) => m.alive);
    if (!f.members.includes(e)) f.members.unshift(e);
    const lead = f.members[0];
    const p = w.nearestPlayer(lead.x, lead.y);
    if (lead === e) this.stepFlight(f, e, p, dt, w);
    else this.holdSlot(f, e, lead, dt);

    // Bombing — every member carpets independently while on a run near the player.
    if (p && f.state === 'run') {
      d.dropCd -= dt * e.fireRateMult;
      const dist = Math.hypot(p.x - e.x, p.y - e.y);
      if (dist < 210 && d.dropCd <= 0 && d.bombs > 0 && onScreen(w, e)) {
        d.dropCd = 0.4;
        d.bombs--;
        const slot = ART.kiteBomber.bombs[d.bombs];
        const s = local(e, slot[0], slot[1]);
        // Bombs carry the bomber's momentum a little way forward.
        dropBomb(w, e, s.x + e.vx * 0.22 + rnd(w, -8, 8), s.y + e.vy * 0.22 + rnd(w, -8, 8));
      }
    } else if (d.bombs < ART.kiteBomber.bombs.length) {
      d.reload += dt * e.fireRateMult;
      if (d.reload >= 1.5) {
        d.reload = 0;
        d.bombs++;
      }
    }
    if (tick(e, 'wash', 0.22, dt) && onScreen(w, e)) {
      const t = local(e, ART.kiteBomber.prop[0] - 3, 0);
      w.fx.smokeTrail?.(t.x, t.y, 0.28, { alpha: 0.25, life: 0.5 });
    }
  },

  /** Leader: approach → straight run over the player → banked turn → approach … */
  stepFlight(f, e, p, dt, w) {
    f.t += dt;
    const sp = this.speed;
    if (!p) {
      AI.steerToward(e, e.x + Math.cos(e.angle) * 100, e.y + Math.sin(e.angle) * 100, sp, 0, dt);
      f.heading = e.angle;
      return;
    }
    const toP = Math.atan2(p.y - e.y, p.x - e.x);
    const dist = Math.hypot(p.x - e.x, p.y - e.y);
    if (f.state === 'approach') {
      // Lead the target so the line crosses where the player is heading.
      const tx = p.x + (p.vx || 0) * 0.45;
      const ty = p.y + (p.vy || 0) * 0.45;
      AI.steerToward(e, tx, ty, sp, 1.6, dt);
      if ((dist < 400 && Math.abs(angleDiff(e.angle, toP)) < 0.28) || dist < 170) {
        f.state = 'run';
        f.t = 0;
        w.sfx('steam_vent', e.x, e.y, { vol: 0.35, pitch: 1.5 });
      }
    } else if (f.state === 'run') {
      const v = sp * 1.18 * e.speedMult;
      e.vx = Math.cos(e.angle) * v;
      e.vy = Math.sin(e.angle) * v;
      const along = (p.x - e.x) * Math.cos(e.angle) + (p.y - e.y) * Math.sin(e.angle);
      if (along < -280 || f.t > 6) {
        f.state = 'turn';
        f.t = 0;
        const cross = Math.cos(e.angle) * (p.y - e.y) - Math.sin(e.angle) * (p.x - e.x);
        f.turnDir = cross >= 0 ? 1 : -1;
      }
    } else {
      // Banked turn back toward the fight.
      e.angle += f.turnDir * 2.0 * e.speedMult * dt;
      const v = sp * e.speedMult;
      e.vx = Math.cos(e.angle) * v;
      e.vy = Math.sin(e.angle) * v;
      if (f.t > 0.7 && Math.abs(angleDiff(e.angle, toP)) < 0.5) {
        f.state = 'approach';
        f.t = 0;
      }
    }
    f.heading = e.angle;
  },

  /** Wingmen hold a line-abreast slot beside the leader (slight echelon). */
  holdSlot(f, e, lead, dt) {
    const i = f.members.indexOf(e);
    const k = Math.ceil(i / 2);
    const side = i % 2 ? 1 : -1;
    const h = f.heading;
    const c = Math.cos(h);
    const s = Math.sin(h);
    const lat = side * k * 50;
    const back = k * 12;
    const sx = lead.x - s * lat - c * back;
    const sy = lead.y + c * lat - s * back;
    const max = this.speed * 1.5 * e.speedMult;
    let vx = lead.vx + (sx - e.x) * 2.4;
    let vy = lead.vy + (sy - e.y) * 2.4;
    const l = Math.hypot(vx, vy);
    if (l > max) {
      vx = (vx / l) * max;
      vy = (vy / l) * max;
    }
    AI.accelTo(e, vx, vy, 720 * e.speedMult, dt);
    AI.faceToward(e, Math.hypot(sx - e.x, sy - e.y) > 90 ? Math.atan2(e.vy, e.vx) : h, 4, dt);
  },

  draw(ctx, e, w) {
    const d = e.data;
    // Kite tails: two crimson ribbons streaming from the wingtips.
    const c = Math.cos(e.angle);
    const s = Math.sin(e.angle);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [tx, ty] of ART.kiteBomber.tails) {
      const r = local(e, tx, ty);
      const x0 = r.x;
      const y0 = r.y;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      for (let i = 1; i <= 5; i++) {
        const back = i * 4.4 * e.scale;
        const wv = Math.sin(e.t * 10 - i * 1.1 + ty) * i * 0.75 * e.scale;
        ctx.lineTo(x0 - c * back - s * wv, y0 - s * back + c * wv);
      }
      ctx.globalAlpha = 0.8 * e.alpha;
      ctx.strokeStyle = 'rgba(20,12,8,0.85)';
      ctx.lineWidth = 2.2 * e.scale;
      ctx.stroke();
      ctx.strokeStyle = '#c0392b';
      ctx.lineWidth = 1.1 * e.scale;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    w.drawEnemySprite(ctx, e);
    // Bombs still on the rack.
    const slots = ART.kiteBomber.bombs;
    for (let i = 0; i < d.bombs && i < slots.length; i++) {
      const b = local(e, slots[i][0], slots[i][1]);
      Sprites.draw(ctx, 'enemy_kiteBomber_bomb', b.x, b.y, e.angle, e.scale, e.alpha);
    }
    const pr = local(e, ART.kiteBomber.prop[0], ART.kiteBomber.prop[1]);
    Sprites.draw(ctx, 'enemy_kiteBomber_prop', pr.x, pr.y, d.prop, e.scale, 0.95 * e.alpha);
  },

  drawShadow(ctx, e, w, ox, oy) {
    spriteShadow(ctx, e, 'enemy_kiteBomber', ox, oy, e.angle, 0.24);
  },

  onRecycle(e) {
    // A recycled member leaves its flight and starts a fresh approach on its own.
    const f = e.data.flight;
    if (f) f.members = f.members.filter((m) => m !== e);
    e.data.flight = newFlight(e);
  },
};

// ---------------------------------------------------------------------------------------------
// Balloon Mine
// ---------------------------------------------------------------------------------------------

const MINE = { radius: 80, damage: 26, trigger: 60, arm: 0.55, chain: 0.12 };

/** Detonate a mine at its position: hurts players AND enemies (team 'all'), chains. */
function mineBlast(w, e) {
  const x = e.x;
  const y = e.y;
  w.explode(x, y, MINE.radius, MINE.damage, {
    team: 'all',
    owner: e,
    source: 'mine',
    visual: 'medium',
    knockback: 240,
  });
  // Keep the blast lethal to tougher later-stage craft: top up enemy damage by stage hp scaling.
  const hpMult = w.run?.stage?.hpMult ?? 1;
  if (hpMult > 1) {
    w.explode(x, y, MINE.radius, MINE.damage * (hpMult - 1), {
      team: 'player',
      owner: e,
      source: 'mine',
      visual: false,
      sound: false,
      knockback: 0,
    });
  }
  const fx = w.fx;
  fx.flare?.(x, y, 120, '#ff6a3a');
  fx.ring?.(x, y, MINE.radius, '#ff3b2a', 0.35, { width: 4 });
  fx.debris?.(x, y, 6, 'syndicate');
  fx.embers?.(x, y, 10);
  fx.sparks?.(x, y, 0, 10, '#ffb347', TAU);
}

const balloonMine = {
  id: 'balloonMine',
  name: 'Balloon Mine',
  hp: 8,
  r: 18,
  speed: 40,
  contactDamage: 0,
  noContact: true,
  mass: 0.7,
  xp: 1,
  cogs: 0.3,
  score: 15,
  sprite: 'enemy_balloonMine',
  alt: 0.8,

  init(e, w) {
    e.angle = rnd(w, 0, TAU);
    e.data.spin = rnd(w, -0.35, 0.35);
    e.data.bob = rnd(w, 0, TAU);
    e.data.near = 0;
  },

  update(e, dt, w) {
    const d = e.data;
    e.angle += d.spin * dt;
    const p = w.nearestPlayer(e.x, e.y);
    const wind = w.wind;
    if (p) AI.seek(e, p.x, p.y, this.speed, 45, dt);
    else AI.accelTo(e, 0, 0, 30, dt);
    // Balloons ride the wind.
    e.vx += (wind?.x || 0) * 0.35 * dt;
    e.vy += (wind?.y || 0) * 0.35 * dt;
    const dist = p ? Math.hypot(p.x - e.x, p.y - e.y) : Infinity;
    d.near = clamp(1 - (dist - MINE.trigger) / 260, 0, 1);
    if (e.state === 'arm') {
      e.timer -= dt;
      if (e.timer <= 0) {
        d.detonated = true;
        if (d.tele) d.tele.alive = false;
        w.removeEnemy(e); // self-detonation: no loot, no score
        mineBlast(w, e);
      }
      return;
    }
    if (p && dist < MINE.trigger + p.r * 0.5) {
      e.state = 'arm';
      e.timer = MINE.arm;
      d.tele = w.telegraphCircle(e.x, e.y, MINE.radius, MINE.arm, { follow: e, color: '#ff3b2a' });
      w.sfx('mine_arm', e.x, e.y, { vol: 0.75 });
    }
  },

  onDeath(e, w, info) {
    const d = e.data;
    if (d.detonated) return;
    d.detonated = true;
    if (d.tele) d.tele.alive = false;
    if (info?.source === 'debug') return;
    const x = e.x;
    const y = e.y;
    if (info?.source === 'mine') {
      // Chain reaction: a short ripple delay so cascades read as a sequence of pops.
      const ghost = { x, y, dmgMult: e.dmgMult, team: 'enemy', alive: false };
      w.after(MINE.chain, (ww) => mineBlast(ww, ghost));
    } else {
      mineBlast(w, e);
    }
  },

  draw(ctx, e, w) {
    const d = e.data;
    const sc = e.scale * (1 + 0.035 * Math.sin(e.t * 2.4 + d.bob));
    w.drawEnemySprite(ctx, e, undefined, undefined, undefined, undefined, undefined, sc);
    // Crown lamp: lazy blink far away, urgent near the player, strobing when armed.
    let on;
    let glowA = 0;
    if (e.state === 'arm') {
      const k = 1 - e.timer / MINE.arm;
      on = Math.sin(e.t * (40 + 50 * k)) > -0.2;
      glowA = 0.35 + 0.55 * k;
    } else {
      const period = 1.3 - d.near * 1.0;
      on = (e.t + d.bob) % period < 0.12 + d.near * 0.08;
    }
    const [lx, ly] = ART.balloonMine.lamp;
    const l = local(e, lx, ly, e.angle);
    if (glowA > 0) {
      ctx.globalCompositeOperation = 'lighter';
      const k = 1 - e.timer / MINE.arm;
      Sprites.draw(ctx, 'enemy_balloonMine_glow', e.x, e.y, 0, (0.9 + 0.7 * k) * e.scale, glowA * (on ? 1 : 0.6));
      ctx.globalCompositeOperation = 'source-over';
    }
    if (on) Sprites.draw(ctx, 'enemy_balloonMine_lamp', l.x, l.y, 0, e.scale, e.alpha);
  },

  drawShadow(ctx, e, w, ox, oy) {
    spriteShadow(ctx, e, 'enemy_balloonMine', ox, oy, e.angle, 0.22);
  },
};

// ---------------------------------------------------------------------------------------------
// Pirate Gunboat
// ---------------------------------------------------------------------------------------------

const GUN = { every: 1.7, charge: 0.4, speed: 230, damage: 10, arc: 0.36 };
const RINGS = [300, 365, 430];

const gunboat = {
  id: 'gunboat',
  name: 'Pirate Gunboat',
  hp: 40,
  r: 26,
  speed: 110,
  contactDamage: 14,
  mass: 2,
  xp: 4,
  cogs: 1,
  score: 40,
  sprite: 'enemy_gunboat',
  alt: 1.15,

  init(e, w) {
    const d = e.data;
    d.aim = e.angle;
    d.dir = e.id % 2 ? 1 : -1;
    d.ring = RINGS[e.id % RINGS.length];
    d.flipT = rnd(w, 6, 10);
    d.prop = rnd(w, 0, TAU);
    d.kick = 0;
    d.charge = 0;
  },

  update(e, dt, w) {
    const d = e.data;
    d.prop += dt * 32;
    d.kick = Math.max(0, d.kick - dt * 5);
    const p = w.nearestPlayer(e.x, e.y);
    if (!p) {
      AI.accelTo(e, 0, 0, 60, dt);
      return;
    }
    // Staggered orbit: each boat owns a ring; periodically reverses and changes lane.
    d.flipT -= dt;
    if (d.flipT <= 0) {
      d.flipT = rnd(w, 7, 11);
      d.dir = -d.dir;
      d.ring = RINGS[(RINGS.indexOf(d.ring) + 1) % RINGS.length];
    }
    AI.orbit(e, p.x, p.y, d.ring, this.speed, d.dir, dt);
    AI.faceVelocity(e, 2.4, dt, 15);
    // Turret tracks with lead, independent of the hull.
    const t = local(e, ART.gunboat.turret[0], ART.gunboat.turret[1]);
    const tx = t.x;
    const ty = t.y;
    const want = AI.aimAngle(t, p, GUN.speed);
    d.aim += clamp(angleDiff(d.aim, want), -3 * dt, 3 * dt);
    const dist = Math.hypot(p.x - e.x, p.y - e.y);
    if (e.state === 'charge') {
      e.timer -= dt * e.fireRateMult;
      d.charge = 1 - Math.max(0, e.timer) / GUN.charge;
      if (e.timer <= 0) {
        e.state = '';
        d.charge = 0;
        this.fire(e, w, tx, ty);
      }
    } else if (AI.cooldown(e, 'gun', GUN.every, dt) && dist < 640 && onScreen(w, e, -10)) {
      e.state = 'charge';
      e.timer = GUN.charge;
    }
    // Sooty stacks — thicker when damaged.
    const hurt = e.hp < e.maxHp * 0.5;
    if (tick(e, 'smoke', hurt ? 0.09 : 0.18, dt) && onScreen(w, e, 60)) {
      const st = ART.gunboat.stacks[(e.t * 7) & 1];
      const s = local(e, st[0], st[1]);
      w.fx.smoke?.(s.x, s.y, hurt ? 0.45 : 0.32, {
        count: 1,
        dark: true,
        life: 1.1,
        spread: 6,
        vx: -Math.cos(e.angle) * 30,
        vy: -Math.sin(e.angle) * 30,
        alpha: 0.4,
      });
      if (hurt) w.fx.smokeTrail?.(e.x, e.y, 0.5, { fire: true });
    }
  },

  fire(e, w, tx, ty) {
    const a = e.data.aim;
    const m = ART.gunboat.turretMuzzle;
    const mx = tx + Math.cos(a) * m;
    const my = ty + Math.sin(a) * m;
    AI.fireSpread(w, e, a, 3, GUN.arc, { kind: 'orb', speed: GUN.speed, r: 7, damage: GUN.damage, life: 4, x: mx, y: my });
    w.fx.muzzle?.(mx, my, a, 0.85, '#ff8a3a');
    w.fx.smoke?.(mx, my, 0.4, { count: 2, life: 0.7, vx: Math.cos(a) * 40, vy: Math.sin(a) * 40, alpha: 0.4 });
    w.sfx('enemy_cannon', mx, my, { vol: 0.8 });
    e.data.kick = 1;
    e.kbx -= Math.cos(a) * 35;
    e.kby -= Math.sin(a) * 35;
  },

  draw(ctx, e, w) {
    const d = e.data;
    for (const [px, py] of ART.gunboat.props) {
      const p = local(e, px, py);
      Sprites.draw(ctx, 'enemy_gunboat_prop', p.x, p.y, d.prop * (py < 0 ? 1 : -1), e.scale, 0.95 * e.alpha);
    }
    w.drawEnemySprite(ctx, e);
    const t = local(e, ART.gunboat.turret[0], ART.gunboat.turret[1]);
    const rk = d.kick * d.kick * 2.6 * e.scale;
    const tx = t.x - Math.cos(d.aim) * rk;
    const ty = t.y - Math.sin(d.aim) * rk;
    w.drawEnemySprite(ctx, e, 'enemy_gunboat_turret', 0, d.aim, tx, ty);
    if (d.charge > 0) {
      const m = ART.gunboat.turretMuzzle * e.scale;
      drawChargeGlow(ctx, tx + Math.cos(d.aim) * m, ty + Math.sin(d.aim) * m, d.charge, 30);
    }
  },

  drawShadow(ctx, e, w, ox, oy) {
    spriteShadow(ctx, e, 'enemy_gunboat', ox, oy);
  },
};

// ---------------------------------------------------------------------------------------------
// Clockwork Wasp
// ---------------------------------------------------------------------------------------------

const WASP = { dash: 520, tele: 0.5, recover: 0.55, hover: 230 };

const clockWasp = {
  id: 'clockWasp',
  name: 'Clockwork Wasp',
  hp: 14,
  r: 12,
  speed: 120,
  contactDamage: 12,
  mass: 0.5,
  xp: 2,
  cogs: 0.4,
  score: 25,
  sprite: 'enemy_clockWasp',
  alt: 0.9,

  init(e, w) {
    e.state = 'approach';
    e.timer = rnd(w, 0.9, 1.7);
    e.data.side = rnd(w, -1, 1);
    e.data.trail = [];
    e.data.trailT = 0;
    e.data.eyes = 0;
  },

  update(e, dt, w) {
    const d = e.data;
    const p = w.nearestPlayer(e.x, e.y);
    d.eyes = Math.max(0, d.eyes - dt * 2.5);
    if (!p) {
      AI.accelTo(e, 0, 0, 300, dt);
      return;
    }
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    switch (e.state) {
      case 'aim': {
        AI.accelTo(e, 0, 0, 1400, dt);
        d.eyes = 1;
        e.timer -= dt;
        if (e.timer <= 0) {
          e.state = 'dash';
          e.timer = d.dashT;
          d.trail.length = 0;
          w.sfx('wasp_dash', e.x, e.y, { vol: 0.7 });
          w.fx.steam?.(e.x, e.y, e.angle + Math.PI, 0.6, { count: 4 });
        }
        break;
      }
      case 'dash': {
        const v = WASP.dash * e.speedMult;
        e.vx = Math.cos(d.dashA) * v;
        e.vy = Math.sin(d.dashA) * v;
        e.angle = d.dashA;
        d.eyes = 1;
        d.trailT -= dt;
        if (d.trailT <= 0) {
          d.trailT = 0.035;
          d.trail.push({ x: e.x, y: e.y, t: e.t });
          if (d.trail.length > 5) d.trail.shift();
          if (onScreen(w, e)) w.fx.trail?.(e.x, e.y, '#ff6a2a', 9, 0.22);
        }
        e.timer -= dt;
        if (e.timer <= 0) {
          e.state = 'recover';
          e.timer = WASP.recover;
        }
        break;
      }
      case 'recover': {
        AI.accelTo(e, 0, 0, 900, dt);
        AI.faceToward(e, Math.atan2(dy, dx), 5, dt);
        e.timer -= dt;
        if (e.timer <= 0) {
          e.state = 'approach';
          e.timer = rnd(w, 1.0, 1.7);
          d.side = rnd(w, -1, 1);
        }
        break;
      }
      default: {
        // Hover at striking distance on a drifting bearing, buzzing about.
        const bearing = Math.atan2(-dy, -dx) + d.side * 0.5 + Math.sin(e.t * 0.9) * 0.4;
        const hx = p.x + Math.cos(bearing) * WASP.hover;
        const hy = p.y + Math.sin(bearing) * WASP.hover;
        AI.seek(e, hx, hy, this.speed * 1.4, 520, dt);
        const j = 260 * e.speedMult * dt;
        e.vx += rnd(w, -j, j);
        e.vy += rnd(w, -j, j);
        AI.faceToward(e, Math.atan2(dy, dx), 6, dt);
        e.timer -= dt * e.fireRateMult;
        if (e.timer <= 0 && dist < 470 && onScreen(w, e, -20)) this.startAim(e, w, p, dist);
      }
    }
    // Trail fades out after the dash.
    if (e.state !== 'dash' && d.trail.length && e.t - d.trail[0].t > 0.25) d.trail.shift();
  },

  startAim(e, w, p, dist) {
    const d = e.data;
    const a = AI.aimAngle(e, p, 1100); // slight lead: punishes standing still, not strafing
    const len = clamp(dist + 150, 230, 470);
    d.dashA = a;
    d.dashT = len / (WASP.dash * e.speedMult);
    e.angle = a;
    e.state = 'aim';
    e.timer = WASP.tele;
    d.tele = w.telegraphLine(e.x, e.y, e.x + Math.cos(a) * len, e.y + Math.sin(a) * len, e.r * 2 + 10, WASP.tele, {
      color: '#ff2a2a',
    });
    w.sfx('wasp_charge', e.x, e.y);
  },

  onDeath(e) {
    if (e.data.tele) e.data.tele.alive = false;
    e.data.tele = null;
  },

  onContact(e, p, w) {
    if (e.state === 'dash') {
      w.fx.sparks?.(p.x, p.y, e.angle + Math.PI, 8, '#ffb347', 1.2);
      e.state = 'recover';
      e.timer = WASP.recover;
    }
  },

  draw(ctx, e, w) {
    const d = e.data;
    // Dash afterimages (additive ember ghosts).
    if (d.trail.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < d.trail.length; i++) {
        const g = d.trail[i];
        const age = e.t - g.t;
        const a = Math.max(0, 0.42 - age * 1.5) * ((i + 1) / d.trail.length);
        if (a > 0.01) Sprites.drawTint(ctx, 'enemy_clockWasp', g.x, g.y, d.dashA ?? e.angle, e.scale, '#ff6a2a', a);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // Shiver while charging.
    let x = e.x;
    let y = e.y;
    if (e.state === 'aim') {
      x += Math.sin(e.t * 97) * 1.4;
      y += Math.cos(e.t * 83) * 1.4;
    }
    w.drawEnemySprite(ctx, e, undefined, 0, e.angle, x, y);
    const wf = Math.floor(e.t * 45) % 3;
    Sprites.draw(ctx, 'enemy_clockWasp_wings', x, y, e.angle, e.scale, 0.9 * e.alpha, wf);
    const eyes = e.state === 'aim' ? 0.6 + 0.4 * Math.sin(e.t * 40) : Math.max(0.3 + 0.1 * Math.sin(e.t * 6 + e.id), d.eyes);
    if (eyes > 0.02) {
      const c = local(e, ART.clockWasp.eyes[0], ART.clockWasp.eyes[1]);
      ctx.globalCompositeOperation = 'lighter';
      Sprites.draw(ctx, 'enemy_clockWasp_eyes', c.x + x - e.x, c.y + y - e.y, e.angle, e.scale * 1.1, eyes * e.alpha);
      ctx.globalCompositeOperation = 'source-over';
    }
  },

  drawShadow(ctx, e, w, ox, oy) {
    spriteShadow(ctx, e, 'enemy_clockWasp', ox, oy, e.angle, 0.24);
  },
};

// ---------------------------------------------------------------------------------------------
// Flak Battery
// ---------------------------------------------------------------------------------------------

const FLAK = { every: 3.2, lock: 0.55, shell: 300, shards: 8, shardSpeed: 175, marker: 58 };

/** Target reticle: default warning disc + closing corner brackets + centre cross. */
function drawFlakMarker(ctx, h, w) {
  ctx.save();
  Haz.drawWarning?.(ctx, h, w);
  ctx.restore();
  const k = Math.min(1, h.t / h.life);
  const r = h.r * (1.25 - 0.3 * k);
  const rot = h.t * 1.6;
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = k > 0.8 && Math.sin(h.t * 45) > 0 ? '#fff3c4' : '#ff6a3a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = rot + (i * Math.PI) / 2;
    ctx.moveTo(h.x + Math.cos(a - 0.3) * r, h.y + Math.sin(a - 0.3) * r);
    ctx.arc(h.x, h.y, r, a - 0.3, a + 0.3);
  }
  ctx.stroke();
  ctx.lineWidth = 2;
  const c = 7 + 4 * (1 - k);
  ctx.beginPath();
  ctx.moveTo(h.x - c, h.y - c);
  ctx.lineTo(h.x + c, h.y + c);
  ctx.moveTo(h.x + c, h.y - c);
  ctx.lineTo(h.x - c, h.y + c);
  ctx.stroke();
}

/** Shell burst: flak puff + ring of shards that "hurts at the target point". */
function flakBurst(w, e, x, y) {
  w.fx.explosion?.(x, y, 0.7, { debris: false });
  w.fx.flare?.(x, y, 70, '#ffb070');
  w.fx.smoke?.(x, y, 0.9, { count: 3, dark: true, life: 1.4 });
  w.sfx('enemy_flak', x, y);
  AI.fireRing(w, x, y, FLAK.shards, rnd(w, 0, TAU), {
    owner: e,
    kind: 'needle',
    speed: FLAK.shardSpeed,
    r: 5,
    damage: 8,
    life: 1.5,
    drag: 0.35,
    minSpeed: 90,
  });
}

/** Wedges for the crumble wreck (local angles). */
const CRUMBLE = [0, 1.15, 2.4, 3.55, 4.9].map((a, i) => ({ a0: a, a1: [1.15, 2.4, 3.55, 4.9, TAU][i], spin: [0.6, -0.8, 0.4, -0.5, 0.9][i] }));

const flakIsland = {
  id: 'flakIsland',
  name: 'Flak Battery',
  hp: 90,
  r: 40,
  speed: 15,
  contactDamage: 18,
  mass: 8,
  xp: 6,
  cogs: 1.6,
  score: 60,
  sprite: 'enemy_flakIsland',
  alt: 1.6,
  layer: -1, // big, low & slow: other craft fly over it

  init(e, w) {
    const d = e.data;
    e.angle = rnd(w, 0, TAU);
    d.spin = rnd(w, -0.05, 0.05);
    d.aim = rnd(w, 0, TAU);
    d.kick = 0;
    d.s0 = e.scale;
    d.bob = rnd(w, 0, TAU);
    d.barrel = 1;
  },

  update(e, dt, w) {
    const d = e.data;
    e.angle += d.spin * dt;
    d.kick = Math.max(0, d.kick - dt * 2.2);
    const p = w.nearestPlayer(e.x, e.y);
    if (!p) {
      AI.accelTo(e, 0, 0, 20, dt);
      return;
    }
    AI.keepRange(e, p, 300, 520, this.speed, dt);
    const t = local(e, ART.flakIsland.turret[0], ART.flakIsland.turret[1]);
    const tx = t.x;
    const ty = t.y;
    const goal = e.state === 'lock' ? Math.atan2(d.ty - ty, d.tx - tx) : AI.aimAngle(t, p);
    d.aim += clamp(angleDiff(d.aim, goal), -1.5 * dt, 1.5 * dt);
    const dist = Math.hypot(p.x - e.x, p.y - e.y);
    if (e.state === 'lock') {
      e.timer -= dt * e.fireRateMult;
      if (e.timer <= 0) {
        e.state = '';
        this.fire(e, w, tx, ty);
      }
    } else if (AI.cooldown(e, 'flak', FLAK.every, dt) && dist < 720 && onScreen(w, e, 20)) {
      this.startLock(e, w, p, tx, ty);
    }
    // Ambient: boiler smoke, pebbles crumbling off the rim.
    if (onScreen(w, e, 80)) {
      if (tick(e, 'smoke', 0.24, dt)) {
        const s = local(e, ART.flakIsland.stack[0], ART.flakIsland.stack[1]);
        w.fx.smoke?.(s.x, s.y, 0.4, { count: 1, dark: true, life: 1.6, spread: 8, alpha: 0.45 });
      }
      if (tick(e, 'pebble', 0.5, dt)) this.pebble(e, w, 4 + Math.random() * 3, 0.9);
    }
  },

  startLock(e, w, p, tx, ty) {
    const d = e.data;
    // Predict where the player will be when the shell arrives; clamp to the gun's reach.
    let px = p.x + (p.vx || 0) * 0.7;
    let py = p.y + (p.vy || 0) * 0.7;
    const dx = px - tx;
    const dy = py - ty;
    const dd = Math.hypot(dx, dy) || 1;
    if (dd > 600) {
      px = tx + (dx / dd) * 600;
      py = ty + (dy / dd) * 600;
    }
    d.tx = px;
    d.ty = py;
    const lock = FLAK.lock / Math.max(0.2, e.fireRateMult);
    const travel = Math.hypot(px - tx, py - ty) / (FLAK.shell * (w.run?.mods?.enemyBulletSpeed ?? 1));
    d.marker = w.addHazard({
      x: px,
      y: py,
      r: FLAK.marker,
      telegraph: true,
      life: lock + travel + 0.05,
      color: '#ff4d2e',
      draw: drawFlakMarker,
    });
    e.state = 'lock';
    e.timer = FLAK.lock;
  },

  fire(e, w, tx, ty) {
    const d = e.data;
    const a = Math.atan2(d.ty - ty, d.tx - tx);
    d.barrel = -d.barrel;
    const m = ART.flakIsland.turretMuzzle * e.scale;
    const off = 3.4 * d.barrel * e.scale;
    const mx = tx + Math.cos(a) * m - Math.sin(a) * off;
    const my = ty + Math.sin(a) * m + Math.cos(a) * off;
    const sx = mx;
    const sy = my;
    const gx = d.tx;
    const gy = d.ty;
    const range2 = (gx - sx) ** 2 + (gy - sy) ** 2;
    const marker = d.marker;
    d.marker = null;
    let burst = false;
    const pop = (ww, x, y) => {
      if (burst) return;
      burst = true;
      if (marker) marker.alive = false;
      flakBurst(ww, e, x, y);
    };
    const shell = w.fire({
      team: 'enemy',
      owner: e,
      source: 'enemy',
      kind: 'flak',
      x: mx,
      y: my,
      angle: a,
      speed: FLAK.shell,
      r: 8,
      damage: 12,
      life: Math.sqrt(range2) / (FLAK.shell * 0.6) + 0.5,
      trail: 'smoke',
      spin: 9,
      update(pr, dt, ww) {
        if ((pr.x - sx) ** 2 + (pr.y - sy) ** 2 >= range2) {
          pop(ww, gx, gy);
          pr.kill();
        }
      },
      onHit(pr, target, ww) {
        pop(ww, pr.x, pr.y);
      },
      onExpire(pr, ww) {
        pop(ww, pr.x, pr.y);
      },
    });
    if (marker && shell) {
      // A ballast bomb (or anything else) can wipe the shell without onExpire: drop the reticle.
      const gen = shell.gen;
      marker.update = (h) => {
        if (!shell.alive || shell.dead || shell.gen !== gen) h.alive = false;
      };
    }
    w.fx.muzzle?.(mx, my, a, 1.3, '#ff8a3a');
    w.fx.smoke?.(mx, my, 0.7, { count: 3, life: 1, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, alpha: 0.5 });
    w.sfx('enemy_cannon', mx, my, { pitch: 0.75 });
    w.shake(0.05);
    d.kick = 1;
  },

  /** A rock fragment drifting down off the island (shrinks = falling away from the camera). */
  pebble(e, w, size, life, speed = 25, ang) {
    const a = ang ?? Math.random() * TAU;
    const rr = e.r * (0.6 + Math.random() * 0.45) * e.scale;
    const sp = speed * (0.5 + Math.random());
    w.particles?.spawn?.({
      x: e.x + Math.cos(a) * rr,
      y: e.y + Math.sin(a) * rr,
      vx: Math.cos(a) * sp + 8,
      vy: Math.sin(a) * sp + 22,
      life: life * (0.7 + Math.random() * 0.6),
      size,
      size1: size * 0.25,
      sprite: 'enemy_flakIsland_chunk',
      frame: (Math.random() * 4) | 0,
      rot: Math.random() * TAU,
      vr: (Math.random() - 0.5) * 6,
      drag: 0.6,
      layer: 'low',
    });
  },

  onDeath(e, w) {
    if (e.data.marker) e.data.marker.alive = false;
    // Crumble: big boulders tumble away, a cloud of dust, the gun flung off its mount.
    for (let i = 0; i < 12; i++) this.pebble(e, w, 9 + Math.random() * 10, 1.4, 90, (i / 12) * TAU + Math.random() * 0.4);
    for (let i = 0; i < 10; i++) this.pebble(e, w, 4 + Math.random() * 4, 1, 140);
    w.fx.smoke?.(e.x, e.y, 2.2, { count: 8, color: '#8a7a66', color1: '#3b3128', life: 1.8, spread: 60, alpha: 0.6 });
    w.fx.debris?.(e.x, e.y, 6, 'iron');
    const a = e.data.aim;
    w.particles?.spawn?.({
      x: e.x,
      y: e.y,
      vx: Math.cos(a + 2) * 120,
      vy: Math.sin(a + 2) * 120,
      life: 1.2,
      size: 40,
      size1: 14,
      sprite: 'enemy_flakIsland_turret',
      rot: a,
      vr: 5,
      drag: 1.2,
    });
    w.sfx('explode_large', e.x, e.y, { pitch: 0.7, vol: 0.7, delay: 0.12 });
  },

  draw(ctx, e, w) {
    const d = e.data;
    if (e.dead) {
      this.drawCrumble(ctx, e);
      return;
    }
    const sc = e.scale * (1 + 0.012 * Math.sin(e.t * 1.3 + d.bob));
    w.drawEnemySprite(ctx, e, undefined, undefined, undefined, undefined, undefined, sc);
    const t = local(e, ART.flakIsland.turret[0], ART.flakIsland.turret[1]);
    const rk = d.kick * d.kick * 5 * e.scale;
    const tx = t.x - Math.cos(d.aim) * rk;
    const ty = t.y - Math.sin(d.aim) * rk;
    w.drawEnemySprite(ctx, e, 'enemy_flakIsland_turret', 0, d.aim, tx, ty);
    if (e.state === 'lock') {
      const k = 1 - Math.max(0, e.timer) / FLAK.lock;
      const m = ART.flakIsland.turretMuzzle * e.scale;
      const ox = -Math.sin(d.aim) * 3.4 * -d.barrel * e.scale;
      const oy = Math.cos(d.aim) * 3.4 * -d.barrel * e.scale;
      drawChargeGlow(ctx, tx + Math.cos(d.aim) * m + ox, ty + Math.sin(d.aim) * m + oy, k, 34);
    }
  },

  /** Wreck draw (engine shrinks e.scale over 0.9 s): the rock splits into drifting wedges. */
  drawCrumble(ctx, e) {
    const s0 = e.data.s0 || 1;
    const k = clamp((1 - e.scale / s0) / 0.45, 0, 1);
    const R = 64 * s0;
    for (const wd of CRUMBLE) {
      const mid = (wd.a0 + wd.a1) / 2;
      const off = k * 34 * s0;
      ctx.save();
      ctx.translate(e.x + Math.cos(mid + e.angle) * off, e.y + Math.sin(mid + e.angle) * off);
      ctx.rotate(e.angle + wd.spin * k);
      ctx.beginPath();
      ctx.moveTo(Math.cos(mid) * 4, Math.sin(mid) * 4);
      ctx.lineTo(Math.cos(wd.a0) * R, Math.sin(wd.a0) * R);
      ctx.lineTo(Math.cos(mid) * R * 1.1, Math.sin(mid) * R * 1.1);
      ctx.lineTo(Math.cos(wd.a1) * R, Math.sin(wd.a1) * R);
      ctx.closePath();
      ctx.clip();
      const sc = e.scale * (1 - 0.2 * k);
      Sprites.draw(ctx, 'enemy_flakIsland', 0, 0, 0, sc, e.alpha);
      Sprites.drawTint(ctx, 'enemy_flakIsland', 0, 0, 0, sc, '#1c120a', (0.25 + 0.55 * k) * e.alpha);
      ctx.restore();
    }
  },

  drawShadow(ctx, e, w, ox, oy) {
    spriteShadow(ctx, e, 'enemy_flakIsland', ox, oy, e.angle, 0.26);
  },
};

/** @type {Record<string, any>} */
export const SKIRMISHERS = { gyroScout, kiteBomber, balloonMine, gunboat, clockWasp, flakIsland };
