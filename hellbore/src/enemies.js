// Every creature between the surface and the Pit. Behaviour + procedural drawing per type.
import { ENEMIES } from './data.js';
import { rand, TAU, rgb, shade, damp, dist, angleTo, chance, turnToward } from './util.js';
import { EShot, Beam, fanOfShots, ringOfShots, Shockwave } from './combat.js';
import { drawGlow } from './gfx.js';
import { audio } from './audio.js';

export class Enemy {
  constructor(g, type, x, y, opts = {}) {
    const d = ENEMIES[type];
    this.g = g;
    this.type = type;
    this.def = d;
    this.x = x;
    this.y = y;
    this.r = d.r;
    this.vx = 0;
    this.vy = 0;
    this.hp = this.maxHp = d.hp * g.enemyHpMult();
    this.speed = d.speed * (1 + g.loop * 0.12) * rand(0.9, 1.1);
    this.t = rand(10);
    this.timer = rand(0.8, 2.2);
    this.state = 'move';
    this.flash = 0;
    this.dead = false;
    this.dormant = !!opts.dormant;
    this.emerge = opts.emerge ? 0.6 : 0;
    this.face = rand(TAU);
    this.burn = 0;
    this.trail = [];
    this.inRock = false;
    this.ghosted = false;
    this.alpha = 1;
    this.seed = rand(1000);
    if (type === 'golem') {
      this.shape = [];
      for (let i = 0; i < 9; i++) this.shape.push(rand(0.8, 1.15));
    }
    if (opts.wallAngle !== undefined) this.face = opts.wallAngle;
  }

  get active() {
    return !this.dormant && this.emerge <= 0;
  }

  update(dt) {
    const g = this.g;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    if (this.burn > 0) {
      this.burn -= dt;
      this.hp -= 5 * dt;
      if (Math.random() < dt * 12) g.particles.embers(this.x, this.y, [255, 140, 40], 1, 20);
      if (this.hp <= 0) {
        g.killEnemy(this);
        return;
      }
    }
    const p = g.player;
    const dP = dist(this.x, this.y, p.x, p.y);
    if (this.dormant) {
      if (dP < 210) this.dormant = false;
      else return;
    }
    if (this.emerge > 0) {
      this.emerge -= dt;
      if (Math.random() < dt * 20) g.particles.debris(this.x, this.y, g.tileColorAt(this.x, this.y + 8), 1, 50);
      return;
    }
    if (p.dead) {
      this.vx *= 0.9;
      this.vy *= 0.9;
    }
    const B = BEHAVIOR[this.type];
    B.update(this, g, dt, dP);
    this.inRock = g.world.solidAt(this.x, this.y);
  }

  draw(ctx) {
    const sc = this.emerge > 0 ? 1 - this.emerge / 0.6 : 1;
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y));
    if (sc < 1) ctx.scale(sc, sc);
    ctx.globalAlpha = this.alpha * (this.inRock && this.def.move !== 'fly' ? 0.45 : 1);
    // Ground shadow.
    if (this.def.move !== 'wall') {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(1, 2, this.r * 1.05, this.r * 0.8, 0, 0, TAU);
      ctx.fill();
    }
    const lit = (c, a) => rgb([c[0] * 0.3 + 178, c[1] * 0.3 + 178, c[2] * 0.3 + 178], a);
    BEHAVIOR[this.type].draw(this, ctx, this.flash > 0 ? lit : (c, a) => rgb(c, a));
    ctx.restore();
  }

  drawGlow(ctx) {
    if (this.emerge > 0) return;
    const B = BEHAVIOR[this.type];
    if (B.glow) B.glow(this, ctx);
  }
}

// ------------------------------------------------------------ movement helpers

function steer(e, tx, ty, speed, dt, accel = 8) {
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const k = damp(accel, dt);
  e.vx += ((dx / d) * speed - e.vx) * k;
  e.vy += ((dy / d) * speed - e.vy) * k;
}

function walkSeek(e, g, dt, dP, mul = 1) {
  const p = g.player;
  let tx = p.x;
  let ty = p.y;
  e.digging = false;
  if (!(dP < 180 && g.world.los(e.x, e.y, p.x, p.y))) {
    const step = g.world.flowStep(e.x, e.y);
    if (step) {
      tx = step.x;
      ty = step.y;
    } else e.digging = true;
  }
  steer(e, tx, ty, e.speed * mul * (e.digging ? 0.55 : 1), dt);
  moveWalk(e, g, dt);
}

function moveWalk(e, g, dt) {
  e.x += e.vx * dt;
  e.y += e.vy * dt;
  if (e.vx * e.vx + e.vy * e.vy > 4) e.face = turnToward(e.face, Math.atan2(e.vy, e.vx), 10 * dt);
  const hit = g.world.collide(e);
  if (hit && e.def.dig) {
    const a = e.face;
    const touched = g.world.grind(e.x + Math.cos(a) * (e.r + 3), e.y + Math.sin(a) * (e.r + 3), 5, e.def.dig * dt);
    if (touched && Math.random() < dt * 8) {
      g.particles.debris(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, g.tileColorAt(e.x + Math.cos(a) * (e.r + 4), e.y + Math.sin(a) * (e.r + 4)), 1, 50);
    }
  }
}

function moveFree(e, dt) {
  e.x += e.vx * dt;
  e.y += e.vy * dt;
  if (e.vx * e.vx + e.vy * e.vy > 4) e.face = Math.atan2(e.vy, e.vx);
}

function pushTrail(e, spacing = 3, max = 14) {
  const last = e.trail[0];
  if (!last || Math.hypot(last.x - e.x, last.y - e.y) >= spacing) {
    e.trail.unshift({ x: e.x, y: e.y });
    if (e.trail.length > max) e.trail.pop();
  }
}

const eshot = (g, o) => g.addEShot(new EShot(o));
const aimAt = (e, g) => angleTo(e.x, e.y, g.player.x, g.player.y);

// ------------------------------------------------------------ drawing helpers

function legs(ctx, C, col, n, len, spread, t, phase = 0, w = 1) {
  ctx.strokeStyle = C(col);
  ctx.lineWidth = w;
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < n; i++) {
      const base = (i - (n - 1) / 2) * spread;
      const swing = Math.sin(t * 18 + i * 1.7 + phase + (side > 0 ? Math.PI : 0)) * 1.6;
      ctx.beginPath();
      ctx.moveTo(base, 0);
      ctx.lineTo(base + swing, side * len * 0.7);
      ctx.lineTo(base + swing * 1.5 + (i - (n - 1) / 2) * 1.5, side * len);
      ctx.stroke();
    }
  }
}

// ------------------------------------------------------------ behaviours

const BEHAVIOR = {
  grub: {
    update(e, g, dt) {
      const p = g.player;
      const wig = Math.sin(e.t * 5 + e.seed) * 0.8;
      const a = aimAt(e, g) + wig;
      steer(e, e.x + Math.cos(a) * 50, e.y + Math.sin(a) * 50, e.speed, dt, 4);
      moveFree(e, dt);
      pushTrail(e, 3, 12);
      if (g.world.solidAt(e.x, e.y) && Math.random() < dt * 6) g.particles.debris(e.x, e.y, g.tileColorAt(e.x, e.y), 1, 30);
      void p;
    },
    draw(e, ctx, C) {
      const segs = [9, 6, 3];
      for (let i = 0; i < segs.length; i++) {
        const tp = e.trail[segs[i]];
        if (!tp) continue;
        const rr = e.r * (0.85 - i * 0.12);
        ctx.fillStyle = C(i % 2 ? [190, 140, 124] : [214, 166, 148]);
        ctx.beginPath();
        ctx.arc(tp.x - e.x, tp.y - e.y, rr, 0, TAU);
        ctx.fill();
      }
      ctx.rotate(e.face);
      ctx.fillStyle = C([226, 180, 160]);
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C([160, 110, 96]);
      ctx.fillRect(-2, -e.r + 1, 1, e.r * 2 - 2);
      ctx.fillStyle = C([60, 30, 24]);
      ctx.fillRect(e.r - 2, -3, 3, 2);
      ctx.fillRect(e.r - 2, 1, 3, 2);
    },
  },

  beetle: {
    update(e, g, dt, dP) {
      e.timer -= dt;
      if (e.state === 'move') {
        walkSeek(e, g, dt, dP);
        if (e.timer <= 0 && dP < 120 && g.world.los(e.x, e.y, g.player.x, g.player.y)) {
          e.state = 'wind';
          e.timer = 0.45;
          e.chargeA = aimAt(e, g);
        }
      } else if (e.state === 'wind') {
        e.vx *= 0.8;
        e.vy *= 0.8;
        e.face = turnToward(e.face, e.chargeA, 8 * dt);
        if (e.timer <= 0) {
          e.state = 'charge';
          e.timer = 0.55;
          audio.play('dash', { pan: g.panOf(e.x), pitch: 0.7, vol: 0.5 });
        }
      } else if (e.state === 'charge') {
        e.vx = Math.cos(e.chargeA) * e.speed * 3.4;
        e.vy = Math.sin(e.chargeA) * e.speed * 3.4;
        moveWalk(e, g, dt);
        g.world.grind(e.x + Math.cos(e.chargeA) * (e.r + 3), e.y + Math.sin(e.chargeA) * (e.r + 3), 6, 30 * dt);
        if (e.timer <= 0) {
          e.state = 'move';
          e.timer = rand(1.4, 2.4);
        }
      }
    },
    draw(e, ctx, C) {
      ctx.rotate(e.face);
      const sh = e.state === 'wind' ? Math.sin(e.t * 60) * 0.8 : 0;
      ctx.translate(sh, 0);
      legs(ctx, C, [40, 34, 30], 3, 8, 3.5, e.state === 'move' || e.state === 'charge' ? e.t : 0);
      ctx.fillStyle = C([36, 52, 44]);
      ctx.beginPath();
      ctx.ellipse(0, 0, 8, 6, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C([72, 112, 86]);
      ctx.beginPath();
      ctx.ellipse(-1, -2, 6, 3, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C([20, 26, 22]);
      ctx.fillRect(-7, -0.5, 13, 1);
      ctx.fillStyle = C([30, 26, 22]);
      ctx.beginPath();
      ctx.arc(7, 0, 3, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C([200, 190, 150]);
      ctx.fillRect(9, -3, 3, 1);
      ctx.fillRect(9, 2, 3, 1);
    },
    glow(e, ctx) {
      const a = e.face;
      drawGlow(ctx, e.x + Math.cos(a) * 8, e.y + Math.sin(a) * 8, 4, e.state === 'wind' ? [255, 60, 30] : [255, 200, 80], 0.6);
    },
  },

  bat: {
    update(e, g, dt) {
      const p = g.player;
      const a = aimAt(e, g) + Math.sin(e.t * 3 + e.seed) * 1.1;
      const swoop = Math.sin(e.t * 2 + e.seed) > 0.6 ? 1.6 : 1;
      steer(e, e.x + Math.cos(a) * 40, e.y + Math.sin(a) * 40, e.speed * swoop, dt, 5);
      moveFree(e, dt);
      void p;
    },
    draw(e, ctx, C) {
      const flap = Math.sin(e.t * 28);
      const span = 6 + flap * 3;
      ctx.fillStyle = C([54, 38, 58]);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-span, -2 - flap * 2);
      ctx.lineTo(-span * 0.6, 2);
      ctx.lineTo(-2, 1);
      ctx.moveTo(0, 0);
      ctx.lineTo(span, -2 - flap * 2);
      ctx.lineTo(span * 0.6, 2);
      ctx.lineTo(2, 1);
      ctx.fill();
      ctx.fillStyle = C([80, 58, 84]);
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, TAU);
      ctx.fill();
      ctx.fillRect(-2, -4, 1, 2);
      ctx.fillRect(1, -4, 1, 2);
    },
    glow(e, ctx) {
      drawGlow(ctx, e.x, e.y - 0.5, 4, [255, 40, 40], 0.7);
    },
  },

  spitter: {
    update(e, g, dt, dP) {
      e.timer -= dt;
      const p = g.player;
      if (e.timer < 0.5) e.charging = true;
      if (e.timer <= 0) {
        e.charging = false;
        e.timer = rand(1.8, 2.6);
        if (dP < 230 && g.world.los(e.x + Math.cos(e.face) * 10, e.y + Math.sin(e.face) * 10, p.x, p.y)) {
          const a = aimAt(e, g);
          const kind = g.sdef.liquid.hot ? 'fire' : g.stratum % 6 === 3 ? 'ghost' : 'spore';
          fanOfShots(g, e.x + Math.cos(a) * 6, e.y + Math.sin(a) * 6, a, 3, 0.45, 95 + g.loop * 10, { kind, r: 3, dmg: 10, ghost: true, life: 3 });
          audio.play('eshoot', { pan: g.panOf(e.x) });
        }
      }
    },
    draw(e, ctx, C) {
      const open = e.charging ? 1 + Math.sin(e.t * 30) * 0.2 : 0.4;
      ctx.rotate(e.t * 0.6);
      ctx.fillStyle = C([110, 60, 90]);
      for (let i = 0; i < 5; i++) {
        ctx.rotate(TAU / 5);
        ctx.beginPath();
        ctx.moveTo(2, -3);
        ctx.lineTo(10, 0);
        ctx.lineTo(2, 3);
        ctx.fill();
      }
      ctx.fillStyle = C([150, 90, 120]);
      ctx.beginPath();
      ctx.arc(0, 0, 5.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C([30, 10, 20]);
      ctx.beginPath();
      ctx.arc(0, 0, 2 + open * 1.8, 0, TAU);
      ctx.fill();
    },
    glow(e, ctx, g) {
      drawGlow(ctx, e.x, e.y, e.charging ? 12 : 6, [180, 255, 90], e.charging ? 0.8 : 0.4);
      void g;
    },
  },

  crawler: {
    update(e, g, dt, dP) {
      e.timer -= dt;
      if (e.state === 'leap') {
        moveWalk(e, g, dt);
        if (e.timer <= 0) {
          e.state = 'move';
          e.timer = rand(1, 1.8);
        }
        return;
      }
      walkSeek(e, g, dt, dP);
      if (e.timer <= 0 && dP < 95 && g.world.los(e.x, e.y, g.player.x, g.player.y)) {
        const a = aimAt(e, g);
        e.vx = Math.cos(a) * e.speed * 2.6;
        e.vy = Math.sin(a) * e.speed * 2.6;
        e.state = 'leap';
        e.timer = 0.28;
      }
    },
    draw(e, ctx, C) {
      ctx.rotate(e.face);
      legs(ctx, C, [50, 36, 40], 4, 8, 2.4, e.t * 1.4);
      ctx.fillStyle = C([70, 46, 52]);
      ctx.beginPath();
      ctx.arc(-3, 0, 4.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C([96, 64, 70]);
      ctx.beginPath();
      ctx.arc(2.5, 0, 3, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C([140, 40, 40]);
      ctx.fillRect(-5, -1, 3, 2);
    },
    glow(e, ctx) {
      drawGlow(ctx, e.x + Math.cos(e.face) * 4, e.y + Math.sin(e.face) * 4, 4, [255, 30, 30], 0.8);
    },
  },

  golem: {
    update(e, g, dt, dP) {
      e.timer -= dt;
      if (e.state === 'throw') {
        e.vx *= 0.85;
        e.vy *= 0.85;
        if (e.timer <= 0) {
          const a = aimAt(e, g);
          eshot(g, {
            kind: 'rock',
            x: e.x + Math.cos(a) * 12,
            y: e.y + Math.sin(a) * 12,
            vx: Math.cos(a) * 120,
            vy: Math.sin(a) * 120,
            r: 5,
            dmg: 18,
            life: 2.5,
            color: g.sdef.colors.hard,
            onDie: (gg, s) => {
              ringOfShots(gg, s.x - s.vx * 0.02, s.y - s.vy * 0.02, 6, 90, { kind: 'shard', r: 2, dmg: 8, life: 1.2 }, rand(TAU));
              gg.particles.debris(s.x, s.y, gg.sdef.colors.hard, 6, 60);
            },
          });
          audio.play('throw', { pan: g.panOf(e.x), pitch: 0.5 });
          e.state = 'move';
          e.timer = rand(2.6, 3.6);
        }
        return;
      }
      walkSeek(e, g, dt, dP);
      if (e.timer <= 0 && dP < 220 && g.world.los(e.x, e.y, g.player.x, g.player.y)) {
        e.state = 'throw';
        e.timer = 0.6;
      }
    },
    draw(e, ctx, C, g) {
      const col = e.g.sdef.colors.hard;
      ctx.rotate(e.face);
      const sw = Math.sin(e.t * 5) * 2;
      ctx.fillStyle = C(shade(col, 0.8));
      ctx.beginPath();
      ctx.arc(2 + sw, -10, 4, 0, TAU);
      ctx.arc(2 - sw, 10, 4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C(shade(col, 1.1));
      ctx.beginPath();
      e.shape.forEach((s, i) => {
        const a = (i / e.shape.length) * TAU;
        ctx.lineTo(Math.cos(a) * e.r * s, Math.sin(a) * e.r * s);
      });
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = C(shade(col, 0.55));
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-6, -4);
      ctx.lineTo(-1, 0);
      ctx.lineTo(-5, 5);
      ctx.moveTo(3, -6);
      ctx.lineTo(1, -2);
      ctx.stroke();
      void g;
    },
    glow(e, ctx) {
      const c = e.g.sdef.colors.crystal;
      drawGlow(ctx, e.x, e.y, e.state === 'throw' ? 16 : 9, c, 0.7);
      drawGlow(ctx, e.x + Math.cos(e.face) * 6, e.y + Math.sin(e.face) * 6, 4, [255, 255, 255], 0.8);
    },
  },

  slime: {
    update(e, g, dt, dP) {
      e.timer -= dt;
      if (e.state === 'hop') {
        moveWalk(e, g, dt);
        e.vx *= 0.97;
        e.vy *= 0.97;
        if (e.timer <= 0) {
          e.state = 'move';
          e.timer = rand(0.4, 0.8);
        }
      } else {
        e.vx *= 0.8;
        e.vy *= 0.8;
        moveWalk(e, g, dt);
        if (e.timer <= 0) {
          const step = dP < 180 && g.world.los(e.x, e.y, g.player.x, g.player.y) ? null : g.world.flowStep(e.x, e.y);
          const tx = step ? step.x : g.player.x;
          const ty = step ? step.y : g.player.y;
          const a = angleTo(e.x, e.y, tx, ty);
          e.vx = Math.cos(a) * e.speed * 3;
          e.vy = Math.sin(a) * e.speed * 3;
          e.state = 'hop';
          e.timer = 0.35;
        }
      }
    },
    draw(e, ctx, C) {
      const hop = e.state === 'hop' ? Math.sin((1 - e.timer / 0.35) * Math.PI) : 0;
      const wob = Math.sin(e.t * 9) * 0.06;
      const sx = 1 + wob - hop * 0.15;
      const sy = 1 - wob + hop * 0.25;
      ctx.scale(sx, sy);
      ctx.translate(0, -hop * 4);
      ctx.fillStyle = C([150, 40, 16]);
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C([230, 90, 30]);
      ctx.beginPath();
      ctx.arc(-1, -1, e.r * 0.75, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C([255, 200, 90]);
      ctx.fillRect(-e.r * 0.4, -e.r * 0.4, 2, 2);
      ctx.fillStyle = C([40, 10, 4]);
      ctx.fillRect(-3, 0, 2, 2);
      ctx.fillRect(2, 0, 2, 2);
    },
    glow(e, ctx) {
      drawGlow(ctx, e.x, e.y, e.r * 2.4, [255, 110, 30], 0.6);
    },
  },

  salamander: {
    update(e, g, dt, dP) {
      e.timer -= dt;
      const p = g.player;
      const los = dP < 200 && g.world.los(e.x, e.y, p.x, p.y);
      if (los && dP < 110) {
        const a = aimAt(e, g) + Math.PI / 2 * (Math.sin(e.seed) > 0 ? 1 : -1);
        steer(e, e.x + Math.cos(a) * 40 - Math.cos(aimAt(e, g)) * 20, e.y + Math.sin(a) * 40 - Math.sin(aimAt(e, g)) * 20, e.speed, dt, 6);
        moveWalk(e, g, dt);
      } else walkSeek(e, g, dt, dP);
      pushTrail(e, 2.5, 12);
      if (e.timer <= 0) {
        e.timer = rand(1.6, 2.3);
        if (los) {
          fanOfShots(g, e.x, e.y, aimAt(e, g), 3, 0.35, 120 + g.loop * 10, { kind: 'fire', r: 3, dmg: 11 });
          audio.play('fireball', { pan: g.panOf(e.x) });
        }
      }
    },
    draw(e, ctx, C) {
      for (let i = e.trail.length - 1; i >= 1; i -= 2) {
        const tp = e.trail[i];
        const rr = Math.max(1, e.r * (1 - i / 14));
        ctx.fillStyle = C(i % 4 === 1 ? [190, 70, 30] : [220, 96, 40]);
        ctx.beginPath();
        ctx.arc(tp.x - e.x, tp.y - e.y, rr, 0, TAU);
        ctx.fill();
      }
      ctx.rotate(e.face);
      legs(ctx, C, [150, 50, 24], 2, 7, 6, e.t);
      ctx.fillStyle = C([230, 100, 40]);
      ctx.beginPath();
      ctx.ellipse(0, 0, 7, 4.5, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C([60, 20, 10]);
      ctx.fillRect(-3, -2, 2, 2);
      ctx.fillRect(1, 1, 2, 2);
      ctx.fillStyle = C([240, 120, 50]);
      ctx.beginPath();
      ctx.ellipse(6, 0, 3.5, 3, 0, 0, TAU);
      ctx.fill();
    },
    glow(e, ctx) {
      drawGlow(ctx, e.x, e.y, 10, [255, 120, 40], 0.45);
      drawGlow(ctx, e.x + Math.cos(e.face) * 7, e.y + Math.sin(e.face) * 7, 3, [255, 255, 120], 0.9);
    },
  },

  skeleton: {
    update(e, g, dt, dP) {
      e.timer -= dt;
      walkSeek(e, g, dt, dP, dP < 70 ? 0.4 : 1);
      if (e.timer <= 0) {
        e.timer = rand(2, 2.8);
        if (dP < 210 && g.world.los(e.x, e.y, g.player.x, g.player.y)) {
          const a = aimAt(e, g);
          eshot(g, { kind: 'bone', x: e.x, y: e.y, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, r: 3, dmg: 12, life: 2 });
          audio.play('throw', { pan: g.panOf(e.x) });
        }
      }
    },
    draw(e, ctx, C) {
      ctx.rotate(e.face);
      const sw = Math.sin(e.t * 10) * 2;
      ctx.strokeStyle = C([210, 204, 180]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-1, -4);
      ctx.lineTo(4 + sw, -8);
      ctx.moveTo(-1, 4);
      ctx.lineTo(4 - sw, 8);
      ctx.stroke();
      ctx.fillStyle = C([190, 184, 160]);
      ctx.fillRect(-7, -4, 6, 8);
      ctx.fillStyle = C([60, 56, 48]);
      for (let i = -3; i < 4; i += 2) ctx.fillRect(-6, i, 4, 1);
      ctx.fillStyle = C([226, 220, 196]);
      ctx.beginPath();
      ctx.arc(2, 0, 4.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C([30, 30, 26]);
      ctx.fillRect(3, -2.5, 2, 2);
      ctx.fillRect(3, 0.5, 2, 2);
    },
    glow(e, ctx) {
      drawGlow(ctx, e.x + Math.cos(e.face) * 3, e.y + Math.sin(e.face) * 3, 5, [120, 255, 150], 0.8);
    },
  },

  wraith: {
    update(e, g, dt, dP) {
      e.timer -= dt;
      if (e.state === 'move') {
        e.alpha = Math.min(0.85, e.alpha + dt * 2);
        e.ghosted = false;
        const a = aimAt(e, g) + Math.sin(e.t * 2) * 0.5;
        steer(e, e.x + Math.cos(a) * 30, e.y + Math.sin(a) * 30, e.speed, dt, 3);
        if (e.timer <= 0) {
          e.state = 'fade';
          e.timer = 1.6;
        }
      } else {
        e.alpha = Math.max(0.12, e.alpha - dt * 3);
        e.ghosted = e.alpha < 0.3;
        const a = aimAt(e, g) + 1.2;
        steer(e, e.x + Math.cos(a) * 30, e.y + Math.sin(a) * 30, e.speed * 1.8, dt, 3);
        if (e.timer <= 0) {
          e.state = 'move';
          e.timer = rand(2.5, 3.5);
          if (dP < 220) {
            ringOfShots(g, e.x, e.y, 8, 70 + g.loop * 8, { kind: 'ghost', r: 3, dmg: 10, ghost: true, life: 3.5 }, rand(TAU));
            audio.play('teleport', { pan: g.panOf(e.x), pitch: 0.6 });
          }
        }
      }
      moveFree(e, dt);
    },
    draw(e, ctx, C) {
      const t = e.t;
      ctx.fillStyle = C([110, 190, 160], 0.9);
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.quadraticCurveTo(7, -7, 7, 2);
      for (let i = 0; i <= 4; i++) {
        const x = 7 - i * 3.5;
        ctx.lineTo(x, 7 + Math.sin(t * 8 + i * 2) * 2.5);
      }
      ctx.quadraticCurveTo(-7, -7, 0, -9);
      ctx.fill();
      ctx.fillStyle = C([20, 30, 28]);
      ctx.beginPath();
      ctx.ellipse(0, -3, 4, 3.5, 0, 0, TAU);
      ctx.fill();
    },
    glow(e, ctx) {
      drawGlow(ctx, e.x - 1.5, e.y - 3, 3, [140, 255, 190], e.alpha);
      drawGlow(ctx, e.x + 1.5, e.y - 3, 3, [140, 255, 190], e.alpha);
      drawGlow(ctx, e.x, e.y, 14, [80, 255, 170], e.alpha * 0.25);
    },
  },

  imp: {
    update(e, g, dt, dP) {
      e.timer -= dt;
      const p = g.player;
      if (e.state === 'move') {
        e.alpha = Math.min(1, e.alpha + dt * 4);
        e.ghosted = false;
        const want = 110;
        const a = aimAt(e, g);
        const orbit = a + Math.PI / 2;
        const rad = (dP - want) * 0.03;
        steer(e, e.x + Math.cos(a) * rad * 30 + Math.cos(orbit) * 30, e.y + Math.sin(a) * rad * 30 + Math.sin(orbit) * 30, e.speed, dt, 4);
        moveFree(e, dt);
        if (e.timer <= 0) {
          if (dP < 240) {
            fanOfShots(g, e.x, e.y, a, 5, 0.9, 110 + g.loop * 10, { kind: 'fire', r: 3, dmg: 10, ghost: true, life: 3 });
            audio.play('fireball', { pan: g.panOf(e.x) });
          }
          e.state = 'out';
          e.timer = 0.35;
        }
      } else if (e.state === 'out') {
        e.alpha = Math.max(0, e.alpha - dt * 4);
        e.ghosted = true;
        if (e.timer <= 0) {
          const a = rand(TAU);
          const d = rand(90, 140);
          g.particles.embers(e.x, e.y, [255, 80, 40], 6, 50);
          e.x = p.x + Math.cos(a) * d;
          e.y = p.y + Math.sin(a) * d;
          audio.play('teleport', { pan: g.panOf(e.x) });
          g.particles.embers(e.x, e.y, [255, 80, 40], 6, 50);
          e.state = 'move';
          e.timer = rand(1.8, 2.6);
        }
      }
    },
    draw(e, ctx, C) {
      const flap = Math.sin(e.t * 22) * 2;
      ctx.fillStyle = C([90, 20, 26]);
      ctx.beginPath();
      ctx.moveTo(-2, 0);
      ctx.lineTo(-9, -4 - flap);
      ctx.lineTo(-7, 2);
      ctx.moveTo(2, 0);
      ctx.lineTo(9, -4 - flap);
      ctx.lineTo(7, 2);
      ctx.fill();
      ctx.strokeStyle = C([160, 30, 30]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 4);
      ctx.quadraticCurveTo(4, 9, 1, 11);
      ctx.stroke();
      ctx.fillStyle = C([200, 44, 40]);
      ctx.beginPath();
      ctx.arc(0, 0, 4.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C([240, 220, 200]);
      ctx.beginPath();
      ctx.moveTo(-3, -3);
      ctx.lineTo(-4, -7);
      ctx.lineTo(-1, -4);
      ctx.moveTo(3, -3);
      ctx.lineTo(4, -7);
      ctx.lineTo(1, -4);
      ctx.fill();
    },
    glow(e, ctx) {
      drawGlow(ctx, e.x - 1.5, e.y - 1, 3, [255, 230, 60], e.alpha);
      drawGlow(ctx, e.x + 1.5, e.y - 1, 3, [255, 230, 60], e.alpha);
    },
  },

  hound: {
    update(e, g, dt, dP) {
      e.timer -= dt;
      if (e.state === 'crouch') {
        e.vx *= 0.8;
        e.vy *= 0.8;
        e.face = turnToward(e.face, e.lungeA, 10 * dt);
        if (e.timer <= 0) {
          e.state = 'lunge';
          e.timer = 0.4;
          audio.play('dash', { pan: g.panOf(e.x), pitch: 0.6, vol: 0.6 });
        }
        return;
      }
      if (e.state === 'lunge') {
        e.vx = Math.cos(e.lungeA) * e.speed * 3;
        e.vy = Math.sin(e.lungeA) * e.speed * 3;
        moveWalk(e, g, dt);
        g.world.grind(e.x + Math.cos(e.lungeA) * (e.r + 3), e.y + Math.sin(e.lungeA) * (e.r + 3), 6, 35 * dt);
        if (Math.random() < 0.5) g.particles.embers(e.x, e.y, [255, 120, 40], 1, 20);
        if (e.timer <= 0) {
          e.state = 'move';
          e.timer = rand(1.2, 2);
        }
        return;
      }
      walkSeek(e, g, dt, dP);
      if (e.timer <= 0 && dP < 150 && g.world.los(e.x, e.y, g.player.x, g.player.y)) {
        e.state = 'crouch';
        e.timer = 0.35;
        e.lungeA = aimAt(e, g);
      }
    },
    draw(e, ctx, C) {
      ctx.rotate(e.face);
      const run = e.state === 'crouch' ? 0 : e.t * 1.6;
      legs(ctx, C, [60, 18, 18], 2, 7, 8, run, 0, 1.5);
      ctx.fillStyle = C([96, 26, 26]);
      ctx.beginPath();
      ctx.ellipse(-1, 0, 8, 4.5, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C([120, 34, 30]);
      ctx.beginPath();
      ctx.ellipse(7, 0, 4, 3.4, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C([40, 10, 10]);
      ctx.fillRect(-12, -0.5, 4, 1);
      ctx.fillStyle = C([230, 220, 200]);
      ctx.fillRect(10, -2, 2, 1);
      ctx.fillRect(10, 1, 2, 1);
    },
    glow(e, ctx) {
      const c = Math.cos(e.face);
      const s = Math.sin(e.face);
      for (let i = 0; i < 3; i++) {
        drawGlow(ctx, e.x - c * (i * 3 - 2) + rand(-1, 1), e.y - s * (i * 3 - 2) + rand(-1, 1), 5, [255, 120, 30], 0.45);
      }
      drawGlow(ctx, e.x + c * 8, e.y + s * 8, 4, e.state === 'crouch' ? [255, 255, 255] : [255, 220, 60], 0.9);
    },
  },

  eye: {
    update(e, g, dt, dP) {
      e.timer -= dt;
      const p = g.player;
      const want = 140;
      const a = aimAt(e, g);
      const rad = dP - want;
      steer(e, e.x + Math.cos(a) * rad + Math.cos(a + 1.6) * 20, e.y + Math.sin(a) * rad + Math.sin(a + 1.6) * 20, e.speed, dt, 2);
      moveFree(e, dt);
      e.look = a;
      if (e.timer <= 0) {
        e.timer = rand(3.2, 4.2);
        if (dP < 260) {
          e.lasering = 1.3;
          g.addHazard(
            new Beam({
              x: e.x,
              y: e.y,
              angle: a,
              len: 300,
              width: 6,
              warn: 0.85,
              active: 0.4,
              track: 1.6,
              dmg: 16,
              walls: true,
              color: [255, 50, 80],
              follow: () => (e.dead ? null : { x: e.x, y: e.y }),
            })
          );
          audio.play('charge', { pan: g.panOf(e.x) });
        }
      }
      if (e.lasering > 0) e.lasering -= dt;
      void p;
    },
    draw(e, ctx, C) {
      const blink = Math.sin(e.t * 1.3 + e.seed) > 0.97 ? 0.2 : 1;
      ctx.fillStyle = C([120, 30, 40]);
      ctx.beginPath();
      ctx.arc(0, 0, e.r + 1, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.scale(1, blink);
      ctx.fillStyle = C([232, 222, 212]);
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = C([200, 60, 60]);
      ctx.lineWidth = 0.7;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + e.seed;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * e.r, Math.sin(a) * e.r);
        ctx.lineTo(Math.cos(a + 0.3) * e.r * 0.5, Math.sin(a + 0.3) * e.r * 0.5);
        ctx.stroke();
      }
      const la = e.look ?? 0;
      ctx.fillStyle = C([200, 40, 50]);
      ctx.beginPath();
      ctx.arc(Math.cos(la) * 3.5, Math.sin(la) * 3.5, 4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C([10, 0, 0]);
      ctx.beginPath();
      ctx.arc(Math.cos(la) * 4.2, Math.sin(la) * 4.2, e.lasering > 0 ? 1 : 2, 0, TAU);
      ctx.fill();
      ctx.restore();
    },
    glow(e, ctx) {
      const la = e.look ?? 0;
      drawGlow(ctx, e.x + Math.cos(la) * 4, e.y + Math.sin(la) * 4, e.lasering > 0 ? 14 : 6, [255, 50, 70], 0.7);
    },
  },

  demon: {
    update(e, g, dt, dP) {
      e.timer -= dt;
      const p = g.player;
      if (e.state === 'slam') {
        e.vx *= 0.8;
        e.vy *= 0.8;
        moveFree(e, dt);
        if (e.timer <= 0) {
          g.addHazard(new Shockwave({ x: e.x, y: e.y, max: 120, speed: 140, dmg: 18, color: [255, 120, 60] }));
          ringOfShots(g, e.x, e.y, 12, 90, { kind: 'fire', r: 3, dmg: 12, ghost: true, life: 2.5 }, rand(TAU));
          g.shake(0.3);
          audio.play('slam', { pan: g.panOf(e.x) });
          e.state = 'move';
          e.timer = rand(2.6, 3.4);
        }
        return;
      }
      const a = aimAt(e, g);
      steer(e, p.x, p.y, e.speed * (dP < 80 ? 0.4 : 1), dt, 3);
      moveFree(e, dt);
      e.face = a;
      g.world.grind(e.x + Math.cos(a) * 6, e.y + Math.sin(a) * 6, 13, 45 * dt);
      if (e.timer <= 0 && dP < 200) {
        if (chance(0.5)) {
          e.state = 'slam';
          e.timer = 0.7;
          audio.play('roar', { pan: g.panOf(e.x), pitch: 1.6, vol: 0.5 });
        } else {
          fanOfShots(g, e.x, e.y, a, 5, 0.8, 115, { kind: 'fire', r: 3.5, dmg: 13, ghost: true, life: 3 });
          audio.play('fireball', { pan: g.panOf(e.x), pitch: 0.7 });
          e.timer = rand(1.8, 2.6);
        }
      }
    },
    draw(e, ctx, C) {
      ctx.rotate(e.face);
      const sl = e.state === 'slam' ? Math.sin(e.t * 40) : 0;
      const arm = Math.sin(e.t * 4) * 2;
      ctx.fillStyle = C([90, 14, 22]);
      ctx.beginPath();
      ctx.arc(4 + arm, -12 - sl, 5, 0, TAU);
      ctx.arc(4 - arm, 12 + sl, 5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C([120, 20, 30]);
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C([150, 34, 40]);
      ctx.beginPath();
      ctx.arc(-1, -2, e.r * 0.7, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C([226, 214, 190]);
      ctx.beginPath();
      ctx.moveTo(4, -6);
      ctx.quadraticCurveTo(10, -14, 16, -10);
      ctx.lineTo(8, -4);
      ctx.moveTo(4, 6);
      ctx.quadraticCurveTo(10, 14, 16, 10);
      ctx.lineTo(8, 4);
      ctx.fill();
      ctx.fillStyle = C([30, 4, 6]);
      ctx.fillRect(6, -4, 4, 8);
    },
    glow(e, ctx) {
      const c = Math.cos(e.face);
      const s = Math.sin(e.face);
      drawGlow(ctx, e.x + c * 8, e.y + s * 8, e.state === 'slam' ? 16 : 8, [255, 120, 30], 0.8);
      drawGlow(ctx, e.x + c * 5 - s * 4, e.y + s * 5 + c * 4, 3, [255, 255, 80], 1);
      drawGlow(ctx, e.x + c * 5 + s * 4, e.y + s * 5 - c * 4, 3, [255, 255, 80], 1);
    },
  },
};

BEHAVIOR.slimelet = BEHAVIOR.slime;

