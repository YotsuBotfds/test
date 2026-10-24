// WP13 — behaviours for the big Iron Syndicate hulls: Zeppelin Carrier, Ironclad Frigate and
// Mortar Barge (DESIGN §2.10). Art lives in warships-art-hulls.js.

import * as AI from '../../game/ai.js';
import { clamp, angleDiff, wrapAngle } from '../../core/math.js';
import { SKIRMISHERS } from './skirmishers.js';
import { CARRIER, FRIGATE, BARGE } from './warships-art-hulls.js';
import {
  local,
  drawPart,
  flashPart,
  spriteShadow,
  drawBody,
  puffStacks,
  target,
  chainBlasts,
} from './warships-kit.js';

const LAUNCH_EVERY = 4; // s between carrier launches (DESIGN §2.10)
const LAUNCH_COUNT = 3;
const MAX_ESCORT = 9; // living launched scouts per carrier

// =============================================================================================
// Zeppelin Carrier
// =============================================================================================

/** Pick a crossing course that passes near (not through) the player. */
function plotCourse(e, w, p) {
  // aim beside the player so the hull sails past (it is a carrier, not a ram)
  const a = Math.atan2(p.y - e.y, p.x - e.x);
  const off = (w.rng.chance(0.5) ? 1 : -1) * w.rng.range(170, 300);
  const tx = p.x - Math.sin(a) * off;
  const ty = p.y + Math.cos(a) * off;
  e.data.course = Math.atan2(ty - e.y, tx - e.x);
  e.data.legT = 0;
}

function launchScout(e, w) {
  const side = (e.data.side = -(e.data.side || 1));
  const p = local(e, CARRIER.hatch[0], CARRIER.hatch[1]);
  const x = p.x;
  const y = p.y;
  const la = e.angle + side * (Math.PI / 2) + w.rng.range(-0.35, 0.35);
  w.fx.steam?.(x, y, la, 0.9, { count: 4 });
  w.fx.sparks?.(x, y, la, 4, '#ffb070', 0.6);
  w.sfx('carrier_launch', x, y, { vol: 0.8, pitch: 0.95 + w.rng.next() * 0.15 });
  if (!SKIRMISHERS?.gyroScout) return null; // skirmishers not ready: launch nothing
  const s = w.spawnEnemy('gyroScout', x, y, {
    wave: e.wave,
    angle: la,
    xp: 0.5,
    cogs: 0,
    data: { launchedBy: e.id },
  });
  if (!s) return null;
  // shove it off the deck; knockback decays on its own, so this works with any scout AI
  s.kbx += Math.cos(la) * 300 + e.vx;
  s.kby += Math.sin(la) * 300 + e.vy;
  // lift-off: grows from deck scale to full size (timers, so it finishes even if we die)
  s.scale = 0.5;
  s.alt = 0.25;
  for (let k = 1; k <= 5; k++) {
    w.after(k * 0.11, () => {
      if (!s.alive) return;
      s.scale = 0.5 + 0.1 * k;
      s.alt = 0.25 + 0.15 * k;
    });
  }
  e.data.kids.push(s);
  return s;
}

const carrier = {
  id: 'carrier',
  name: 'Zeppelin Carrier',
  hp: 160,
  r: 46,
  speed: 50,
  contactDamage: 20,
  mass: 7,
  xp: 10,
  cogs: 3,
  score: 220,
  sprite: 'enemy_carrier',
  alt: 1.5,
  drawShadow: spriteShadow('enemy_carrier'),

  init(e, w) {
    e.data.hatch = 0; // 0 closed … 1 open
    e.data.hatchGoal = 0;
    e.data.queue = 0;
    e.data.launchT = 0;
    e.data.kids = [];
    e.data.course = null;
    e.state = 'cruise';
    const p = target(w, e);
    if (p) {
      plotCourse(e, w, p);
      e.angle = e.data.course;
    }
  },

  update(e, dt, w) {
    const p = target(w, e);
    const d = e.data;
    if (p) {
      if (d.course === null) plotCourse(e, w, p);
      d.legT += dt;
      // Once well past the player (and off screen), swing round for another pass.
      const cx = Math.cos(d.course);
      const cy = Math.sin(d.course);
      const ahead = (e.x - p.x) * cx + (e.y - p.y) * cy;
      const far = Math.hypot(p.x - e.x, p.y - e.y);
      if ((ahead > 650 && !w.isVisible(e.x, e.y, e.r)) || far > 1500 || d.legT > 40) plotCourse(e, w, p);
    }
    AI.faceToward(e, d.course ?? e.angle, 0.22, dt);
    const sp = this.speed * e.speedMult;
    AI.accelTo(e, Math.cos(e.angle) * sp, Math.sin(e.angle) * sp, 40, dt);

    // --- launch cycle: hatch opens → three scouts → hatch closes ---
    if (d.queue <= 0 && p && AI.cooldown(e, 'launchCd', LAUNCH_EVERY, dt)) {
      d.kids = d.kids.filter((k) => k.alive);
      const near = Math.hypot(p.x - e.x, p.y - e.y) < 950 && w.isVisible(e.x, e.y, 220);
      if (near && d.kids.length < MAX_ESCORT) {
        d.queue = Math.min(LAUNCH_COUNT, MAX_ESCORT - d.kids.length);
        d.hatchGoal = 1;
        d.launchT = 0.5;
        const hp = local(e, CARRIER.hatch[0], CARRIER.hatch[1]);
        w.fx.steam?.(hp.x, hp.y, e.angle + Math.PI, 0.7, { count: 3 });
        w.sfx('hit_armor', hp.x, hp.y, { vol: 0.35, pitch: 0.6 });
      }
    }
    if (d.queue > 0) {
      d.launchT -= dt * e.fireRateMult;
      if (d.launchT <= 0 && d.hatch > 0.9) {
        launchScout(e, w);
        d.queue--;
        d.launchT = 0.24;
        if (d.queue <= 0) d.closeT = 0.45;
      }
    } else if (d.closeT > 0) {
      d.closeT -= dt;
      if (d.closeT <= 0) d.hatchGoal = 0;
    }
    const hs = 2.6 * dt;
    d.hatch += clamp(d.hatchGoal - d.hatch, -hs, hs);

    // --- bow defence guns ---
    if (p && AI.cooldown(e, 'gunCd', 2.8, dt)) {
      const dist = Math.hypot(p.x - e.x, p.y - e.y);
      if (dist < 560) {
        for (let i = 0; i < CARRIER.guns.length; i++) {
          const g = local(e, CARRIER.guns[i][0] + 7, CARRIER.guns[i][1]);
          const gx = g.x;
          const gy = g.y;
          w.after(i * 0.16, (ww) => {
            if (!e.alive) return;
            AI.fireAimed(ww, e, p, { x: gx, y: gy, kind: 'orb', speed: 210, r: 6, damage: 9, lead: true, jitter: 0.1 });
            ww.fx.muzzle?.(gx, gy, Math.atan2(p.y - gy, p.x - gx), 0.6, '#ff9a4a');
            ww.sfx('enemy_shot', gx, gy, { vol: 0.6 });
          });
        }
      }
    }
    puffStacks(e, w, dt, CARRIER.stacks, 0.9);
  },

  draw(ctx, e, w) {
    drawBody(ctx, e, w, 'enemy_carrier');
    const pf = e.dead ? 0 : ((e.t * 22) | 0) & 3;
    for (let i = 0; i < CARRIER.props.length; i++) {
      drawPart(ctx, e, 'enemy_carrier_prop', CARRIER.props[i][0] - 10, CARRIER.props[i][1], 0, pf);
    }
    const hf = Math.round(e.data.hatch * 4);
    if (hf > 0 && !e.dead) {
      drawPart(ctx, e, 'enemy_carrier_hatch', CARRIER.hatch[0], CARRIER.hatch[1], 0, hf);
      flashPart(ctx, e, 'enemy_carrier_hatch', CARRIER.hatch[0], CARRIER.hatch[1], 0, hf);
    }
  },

  onRecycle(e) {
    e.data.course = null;
  },

  onDeath(e, w) {
    // the gasbag goes up in a rolling chain of blasts from tail to nose
    chainBlasts(e, w, [[-40, -10], [-18, 14], [4, -12], [22, 10], [40, 0]], 0.13, 1.1, 'explode_medium');
    w.fx.shockwave?.(e.x, e.y, 230, '#ffb070', 0.6);
    w.fx.debris?.(e.x, e.y, 10, 'syndicate', { speed: 320 });
    w.fx.smoke?.(e.x, e.y, 2.2, { dark: true, count: 6 });
    w.zoomPunch?.(0.04);
  },
};

// =============================================================================================
// Ironclad Frigate
// =============================================================================================

const BROADSIDE_EVERY = 3.4;
const AIM_TIME = 0.9; // gunport glow / telegraph before the volley

/** +1 if the player is to starboard (+y hull-local), −1 to port. */
function sideOf(e, p) {
  const c = Math.cos(e.angle);
  const s = Math.sin(e.angle);
  return (p.y - e.y) * c - (p.x - e.x) * s >= 0 ? 1 : -1;
}

function fireBroadside(e, w, p) {
  const side = e.data.side;
  const normal = e.angle + side * (Math.PI / 2);
  const ports = FRIGATE.ports;
  for (let i = 0; i < ports.length; i++) {
    // ripple from bow to stern
    const idx = ports.length - 1 - i;
    w.after(i * 0.075, (ww) => {
      if (!e.alive) return;
      const m = local(e, ports[idx], side * (FRIGATE.portY + 2));
      const mx = m.x;
      const my = m.y;
      // converge a little toward the player, but it is still a broadside
      const toP = Math.atan2(p.y - my, p.x - mx);
      const a = normal + clamp(angleDiff(normal, toP), -0.22, 0.22);
      ww.fire({
        team: 'enemy',
        owner: e,
        source: 'enemy',
        kind: 'shell',
        x: mx,
        y: my,
        angle: a,
        speed: 245,
        r: 7,
        damage: 12,
        life: 4.5,
      });
      ww.fx.muzzle?.(mx, my, a, 0.9, '#ff9a4a');
      ww.fx.smoke?.(mx, my, 0.7, { vx: Math.cos(a) * 40, vy: Math.sin(a) * 40, count: 1 });
      ww.sfx('enemy_cannon', mx, my, { vol: 0.55, pitch: 0.9 + i * 0.04 });
      e.kbx -= Math.cos(normal) * 14;
      e.kby -= Math.sin(normal) * 14;
    });
  }
  if (w.isVisible(e.x, e.y, 0)) w.shake(0.08);
}

const frigate = {
  id: 'frigate',
  name: 'Ironclad Frigate',
  hp: 140,
  r: 36,
  speed: 70,
  contactDamage: 18,
  mass: 5,
  xp: 10,
  cogs: 3,
  score: 220,
  sprite: 'enemy_frigate',
  alt: 1.25,
  drawShadow: spriteShadow('enemy_frigate'),

  init(e) {
    e.state = 'sail';
    e.data.side = 1;
    e.data.glow = 0;
  },

  update(e, dt, w) {
    const p = target(w, e);
    const d = e.data;
    if (!p) return;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const dist = Math.hypot(dx, dy);
    const toP = Math.atan2(dy, dx);
    const busy = e.state !== 'sail';
    if (!busy) d.side = sideOf(e, p);
    // Present the broadside: steer perpendicular to the line to the player, nudged in/out to
    // hold ~260–420.
    const radial = dist > 420 ? 0.65 : dist < 260 ? -0.65 : 0;
    const want = toP - d.side * (Math.PI / 2) + d.side * radial;
    AI.faceToward(e, dist > 900 ? toP : want, busy ? 0.25 : 0.85, dt);
    const sp = this.speed * e.speedMult * (busy ? 0.45 : 1);
    AI.accelTo(e, Math.cos(e.angle) * sp, Math.sin(e.angle) * sp, 70, dt);

    if (e.state === 'sail') {
      d.glow = Math.max(0, d.glow - dt * 3);
      const lined = Math.abs(angleDiff(e.angle + d.side * (Math.PI / 2), toP)) < 0.6;
      if (AI.cooldown(e, 'volley', BROADSIDE_EVERY, dt) || d.ready) {
        d.ready = true;
        if (lined && dist < 620) {
          d.ready = false;
          AI.setState(e, 'aim', AIM_TIME / Math.min(1.25, e.fireRateMult)); // telegraph shrinks ≤ 20%
          w.sfx('hit_armor', e.x, e.y, { vol: 0.4, pitch: 0.55 }); // gunport shutters clank open
          for (let i = 0; i < FRIGATE.ports.length; i++) {
            const m = local(e, FRIGATE.ports[i], d.side * (FRIGATE.portY + 2));
            const a = e.angle + d.side * (Math.PI / 2);
            w.telegraphLine(m.x, m.y, m.x + Math.cos(a) * 340, m.y + Math.sin(a) * 340, 10, e.timer, {
              follow: e,
              ox: m.x - e.x,
              oy: m.y - e.y,
              alpha: 0.55,
            });
          }
        }
      }
      // bow chaser when the player sits dead ahead
      if (Math.abs(angleDiff(e.angle, toP)) < 0.45 && dist < 520 && AI.cooldown(e, 'chaser', 2.2, dt)) {
        const m = local(e, 36, 0);
        AI.fireAimed(w, e, p, { x: m.x, y: m.y, kind: 'orb', speed: 230, r: 7, damage: 10, lead: true });
        w.fx.muzzle?.(m.x, m.y, e.angle, 0.7, '#ff9a4a');
        w.sfx('enemy_shot', m.x, m.y, { vol: 0.7, pitch: 0.8 });
      }
    } else if (e.state === 'aim') {
      d.glow = Math.min(1, d.glow + dt / Math.max(0.2, AIM_TIME / Math.min(1.25, e.fireRateMult)));
      if (AI.timerDone(e, dt)) {
        fireBroadside(e, w, p);
        AI.setState(e, 'reload', 0.6);
      }
    } else if (AI.timerDone(e, dt)) {
      e.state = 'sail';
    }
    puffStacks(e, w, dt, FRIGATE.stacks, 0.8);
  },

  draw(ctx, e, w) {
    drawBody(ctx, e, w, 'enemy_frigate');
    const d = e.data;
    if (d.glow > 0.01 && !e.dead) {
      const flick = 0.75 + 0.25 * Math.sin(e.t * 40);
      ctx.globalCompositeOperation = 'lighter';
      drawPart(ctx, e, 'enemy_frigate_glow', 0, 0, 0, d.side < 0 ? 0 : 1, d.glow * flick);
      ctx.globalCompositeOperation = 'source-over';
    }
    const rf = e.dead ? 0 : ((e.t * 20) | 0) % 6;
    for (let i = 0; i < FRIGATE.rotors.length; i++) {
      const r = FRIGATE.rotors[i];
      drawPart(ctx, e, 'enemy_frigate_rotor', r[0], r[1], i ? 0.6 : 0, rf, 0.92);
    }
    const pf = e.dead ? 0 : ((e.t * 24) | 0) & 3;
    for (let i = 0; i < FRIGATE.props.length; i++) {
      drawPart(ctx, e, 'enemy_frigate_prop', FRIGATE.props[i][0], FRIGATE.props[i][1], 0, pf);
    }
  },

  onDeath(e, w) {
    // the magazine cooks off along the gun deck
    chainBlasts(e, w, [[-28, 8], [-10, -9], [6, 9], [22, -6], [34, 0]], 0.1, 0.9, 'explode_small');
    w.fx.debris?.(e.x, e.y, 8, 'syndicate', { speed: 300 });
    w.fx.cogs?.(e.x, e.y, 4);
  },
};

// =============================================================================================
// Mortar Barge
// =============================================================================================

const MORTAR_EVERY = 3.6;
const SHELL_TIME = 1.5; // flight time = telegraph time
const SHELL_RADIUS = 72;

function lobShell(e, w, tx, ty, delay) {
  w.after(delay, (ww) => {
    if (!e.alive) return;
    const m = local(e, BARGE.mortar[0] + 9, 0);
    const mx = m.x;
    const my = m.y;
    ww.telegraphCircle(tx, ty, SHELL_RADIUS, SHELL_TIME, { color: '#ff4d2e' });
    ww.fire({
      team: 'enemy',
      owner: e,
      source: 'enemy',
      kind: 'mortar',
      x: mx,
      y: my,
      r: 9,
      damage: 20,
      lob: { tx, ty, time: SHELL_TIME, height: 190, marker: false },
      explode: { radius: SHELL_RADIUS, visual: 'medium', shake: 0.12 },
      trail: 'smoke',
      spin: 6,
    });
    const a = Math.atan2(ty - my, tx - mx);
    ww.fx.muzzle?.(mx, my, a, 1.5, '#ff9a4a');
    ww.fx.smoke?.(mx, my, 1.3, { count: 4, dark: true });
    ww.fx.shockwave?.(mx, my, 60, '#ffcf8a', 0.25);
    ww.sfx('enemy_cannon', mx, my, { vol: 0.9, pitch: 0.55 });
    ww.sfx('mortar_whistle', tx, ty, { vol: 0.8, delay: 0.45 });
    if (ww.isVisible(mx, my, 0)) ww.shake(0.1);
    e.data.recoil = 0.22;
    e.kbx -= Math.cos(a) * 30;
    e.kby -= Math.sin(a) * 30;
  });
}

const mortarBarge = {
  id: 'mortarBarge',
  name: 'Mortar Barge',
  hp: 110,
  r: 34,
  speed: 60,
  contactDamage: 18,
  mass: 5,
  xp: 8,
  cogs: 2.5,
  score: 180,
  sprite: 'enemy_mortarBarge',
  alt: 1.3,
  drawShadow: spriteShadow('enemy_mortarBarge'),

  init(e) {
    e.state = 'idle';
    e.data.aim = e.angle;
    e.data.heat = 0;
    e.data.recoil = 0;
    e.data.volleys = 0;
  },

  update(e, dt, w) {
    const p = target(w, e);
    const d = e.data;
    if (!p) return;
    const dist = AI.keepRange(e, p, 440, 600, this.speed, dt);
    AI.faceVelocity(e, 0.9, dt, 8);
    // train the mortar on the player
    const toP = Math.atan2(p.y - e.y, p.x - e.x);
    const da = angleDiff(d.aim, toP);
    d.aim = wrapAngle(d.aim + clamp(da, -2 * dt, 2 * dt));
    d.recoil = Math.max(0, d.recoil - dt);

    if (e.state === 'idle') {
      d.heat = Math.max(0, d.heat - dt * 1.5);
      if (AI.cooldown(e, 'mortarCd', MORTAR_EVERY, dt) && dist < 820) {
        AI.setState(e, 'load', 0.7 / e.fireRateMult);
        const m = local(e, BARGE.mortar[0], 0);
        w.fx.steam?.(m.x, m.y, e.angle + Math.PI, 0.6, { count: 2 });
      }
    } else if (e.state === 'load') {
      d.heat = Math.min(1, d.heat + dt * 2);
      if (AI.timerDone(e, dt)) {
        d.volleys++;
        // lead a little: where the player is heading, not where they'll surely be
        const tx = p.x + (p.vx || 0) * SHELL_TIME * 0.45;
        const ty = p.y + (p.vy || 0) * SHELL_TIME * 0.45;
        lobShell(e, w, tx, ty, 0);
        // every third volley (always for elites) brackets the player with two more shells
        if (d.volleys % 3 === 0 || e.elite) {
          const a = Math.atan2(ty - e.y, tx - e.x) + Math.PI / 2;
          const off = 120;
          lobShell(e, w, tx + Math.cos(a) * off, ty + Math.sin(a) * off, 0.28);
          lobShell(e, w, tx - Math.cos(a) * off, ty - Math.sin(a) * off, 0.56);
        }
        AI.setState(e, 'idle', 0);
      }
    }
    puffStacks(e, w, dt, BARGE.stacks, 1.1);
  },

  draw(ctx, e, w) {
    drawBody(ctx, e, w, 'enemy_mortarBarge');
    const d = e.data;
    const pf = e.dead ? 0 : ((e.t * 20) | 0) & 3;
    for (let i = 0; i < BARGE.props.length; i++) {
      drawPart(ctx, e, 'enemy_mortarBarge_prop', BARGE.props[i][0], BARGE.props[i][1], 0, pf);
    }
    const mf = d.recoil > 0 ? 3 : d.heat > 0.6 ? 2 : d.heat > 0.15 ? 1 : 0;
    const rot = (d.aim ?? e.angle) - e.angle;
    drawPart(ctx, e, 'enemy_mortarBarge_mortar', BARGE.mortar[0], BARGE.mortar[1], rot, mf);
    flashPart(ctx, e, 'enemy_mortarBarge_mortar', BARGE.mortar[0], BARGE.mortar[1], rot, mf);
  },

  onDeath(e, w) {
    // the shell racks go up
    chainBlasts(e, w, [[-22, -9], [-22, 9], [20, -9], [20, 9], [2, 0]], 0.11, 0.85, 'explode_small');
    w.fx.debris?.(e.x, e.y, 7, 'syndicate', { speed: 280 });
    for (let i = 0; i < 4; i++) w.fx.embers?.(e.x + w.rng.range(-20, 20), e.y + w.rng.range(-20, 20), 4, { speed: 180 });
    // balloons tear loose
    w.fx.debris?.(e.x, e.y, 4, 'canvas', { speed: 160 });
  },
};

/** Exported for the aggregator. */
export const HULL_DEFS = { carrier, frigate, mortarBarge };
