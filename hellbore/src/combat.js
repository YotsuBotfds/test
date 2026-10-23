// Weapons, projectiles, pickups and boss hazards.
import { TILE, WEAPONS, POWERS, T } from './data.js';
import { rand, TAU, rgb, shade, turnToward, clamp, dist2 } from './util.js';
import { isSolidType } from './world.js';
import { drawGlow } from './gfx.js';
import { drawText } from './font.js';
import { audio } from './audio.js';

// ============================================================ player weapons

export function fireWeapon(g, p) {
  const id = p.weapon;
  const lvl = p.wlevel;
  const w = WEAPONS[id];
  const a = p.aim;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const mx = p.x + ca * 11;
  const my = p.y + sa * 11;
  const dmul = p.stats.dmg * (1 + 0.18 * (lvl - 1));
  const burn = p.stats.burn;
  const pan = g.panOf(p.x);
  p.muzzle = 0.06;

  switch (id) {
    case 'rivet': {
      const n = lvl >= 5 ? 3 : lvl >= 3 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const o = (i - (n - 1) / 2) * 3;
        const sp = a + rand(-0.045, 0.045);
        g.addShot(
          new Shot({
            kind: 'rivet',
            x: mx - sa * o,
            y: my + ca * o,
            vx: Math.cos(sp) * w.speed,
            vy: Math.sin(sp) * w.speed,
            r: 2,
            dmg: w.dmg * dmul,
            life: 0.8,
            terrain: 1.8,
            color: w.color,
            burn,
          })
        );
      }
      p.recoil = 1.5;
      g.particles.spawn({
        kind: 'shell',
        x: p.x,
        y: p.y,
        vx: -sa * rand(40, 70) + rand(-10, 10),
        vy: ca * rand(40, 70) + rand(-10, 10),
        vr: rand(-20, 20),
        life: 0.5,
        color: [214, 170, 70],
        drag: 6,
      });
      audio.play('rivet', { pan, pitch: rand(0.92, 1.08) });
      break;
    }
    case 'scatter': {
      const n = 5 + lvl;
      for (let i = 0; i < n; i++) {
        const sp = a + rand(-0.42, 0.42);
        const s = w.speed * rand(0.7, 1.1);
        g.addShot(
          new Shot({
            kind: 'pellet',
            x: mx,
            y: my,
            vx: Math.cos(sp) * s,
            vy: Math.sin(sp) * s,
            r: 2,
            dmg: w.dmg * dmul,
            life: rand(0.24, 0.36) + lvl * 0.01,
            terrain: 3.5,
            color: w.color,
            burn,
          })
        );
      }
      p.recoil = 4;
      p.vx -= ca * 40;
      p.vy -= sa * 40;
      g.shake(0.12);
      g.particles.smoke(mx, my, 2, [80, 70, 60], 3);
      audio.play('scatter', { pan, pitch: rand(0.9, 1.1) });
      break;
    }
    case 'torch': {
      const sp = a + rand(-0.13, 0.13);
      const s = w.speed * rand(0.85, 1.15);
      g.addShot(
        new Shot({
          kind: 'flame',
          x: mx,
          y: my,
          vx: Math.cos(sp) * s + p.vx * 0.5,
          vy: Math.sin(sp) * s + p.vy * 0.5,
          r: 3,
          rMax: 9 + lvl,
          dmg: w.dmg * dmul,
          life: 0.36 + lvl * 0.035,
          terrain: 2.6,
          pierce: 99,
          color: w.color,
          burn: true,
          drag: 1.5,
        })
      );
      audio.play('flame', { pan, pitch: rand(0.8, 1.2) });
      break;
    }
    case 'arc': {
      const range = 120 + lvl * 10;
      const chains = 1 + Math.ceil(lvl / 2);
      let from = { x: mx, y: my };
      let dmg = w.dmg * dmul;
      const hit = new Set();
      let target = g.findArcTarget(from.x, from.y, a, range, 0.75, hit);
      if (!target) {
        const len = g.world.raycast(mx, my, a, 70);
        const ex = mx + ca * len;
        const ey = my + sa * len;
        g.particles.bolt(mx, my, ex, ey, w.color, 1.5, 0.08, 4);
        if (len < 70) {
          const tx = Math.floor((ex + ca * 2) / TILE);
          const ty = Math.floor((ey + sa * 2) / TILE);
          g.world.damage(tx, ty, 4);
          g.particles.sparks(ex, ey, w.color, 3, 90);
        }
      }
      for (let i = 0; i <= chains && target; i++) {
        g.particles.bolt(from.x, from.y, target.x, target.y, w.color, 2, 0.12, 5);
        g.particles.flash(target.x, target.y, 14, w.color, 0.12);
        g.hitTarget(target, dmg, (target.x - from.x) * 0.5, (target.y - from.y) * 0.5, { burn });
        hit.add(target.ref || target);
        from = target;
        dmg *= 0.8;
        target = g.findArcTarget(from.x, from.y, null, 90, 0, hit);
      }
      audio.play('arc', { pan, pitch: rand(0.9, 1.15) });
      break;
    }
    case 'rail': {
      g.addShot(
        new Shot({
          kind: 'rail',
          x: mx,
          y: my,
          vx: ca * w.speed,
          vy: sa * w.speed,
          r: 3,
          dmg: w.dmg * dmul,
          life: 0.5,
          terrain: 22 + lvl * 4,
          tpierce: 4 + lvl,
          pierce: 99,
          color: w.color,
          burn,
        })
      );
      p.recoil = 6;
      p.vx -= ca * 90;
      p.vy -= sa * 90;
      g.shake(0.3);
      g.particles.flash(mx, my, 22, w.color, 0.15);
      g.particles.sparks(mx, my, w.color, 6, 160, a, 0.5);
      audio.play('rail', { pan });
      break;
    }
    case 'rocket': {
      const n = lvl >= 5 ? 3 : lvl >= 3 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const sp = a + (i - (n - 1) / 2) * 0.35 + rand(-0.05, 0.05);
        g.addShot(
          new Shot({
            kind: 'rocket',
            x: mx,
            y: my,
            vx: Math.cos(sp) * w.speed,
            vy: Math.sin(sp) * w.speed,
            r: 2.5,
            dmg: w.dmg * dmul,
            life: 1.7,
            terrain: 26,
            blast: 24 + lvl * 2,
            homing: 4,
            color: w.color,
            burn,
          })
        );
      }
      p.recoil = 3;
      audio.play('rocket', { pan, pitch: rand(0.9, 1.1) });
      break;
    }
    case 'saw': {
      g.addShot(
        new Shot({
          kind: 'saw',
          x: mx,
          y: my,
          vx: ca * w.speed,
          vy: sa * w.speed,
          r: 4 + lvl * 0.4,
          dmg: w.dmg * dmul,
          life: 2.2,
          terrain: 5,
          bounces: 3 + lvl,
          pierce: 99,
          rehit: 0.25,
          color: w.color,
          burn,
        })
      );
      p.recoil = 2;
      audio.play('saw', { pan, pitch: rand(0.95, 1.05) });
      break;
    }
    default:
      break;
  }
}

// ============================================================ player projectiles

export class Shot {
  constructor(o) {
    this.kind = 'rivet';
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.r = 2;
    this.dmg = 5;
    this.life = 1;
    this.pierce = 0;
    this.tpierce = 0;
    this.terrain = 1;
    this.bounces = 0;
    this.blast = 0;
    this.homing = 0;
    this.drag = 0;
    this.color = [255, 255, 255];
    this.hits = null;
    this.t = 0;
    this.spin = rand(TAU);
    Object.assign(this, o);
    this.maxLife = this.life;
    this.lastTile = -1;
  }

  update(g, dt) {
    this.t += dt;
    this.life -= dt;
    if (this.life <= 0) {
      this.expire(g);
      return false;
    }
    if (this.drag) {
      const k = Math.exp(-this.drag * dt);
      this.vx *= k;
      this.vy *= k;
    }
    if (this.kind === 'flame') this.r = Math.min(this.rMax, this.r + dt * 26);
    if (this.kind === 'saw') this.spin += dt * 30;
    if (this.rehit && this.hits && this.t % this.rehit < dt) this.hits.clear();
    if (this.homing) {
      const tgt = g.nearestTarget(this.x, this.y, 170);
      if (tgt) {
        const cur = Math.atan2(this.vy, this.vx);
        const want = Math.atan2(tgt.y - this.y, tgt.x - this.x);
        const na = turnToward(cur, want, this.homing * dt);
        const sp = Math.min(330, Math.hypot(this.vx, this.vy) + 260 * dt);
        this.vx = Math.cos(na) * sp;
        this.vy = Math.sin(na) * sp;
      }
    }
    if (this.kind === 'rocket' && Math.random() < 0.6) g.particles.smoke(this.x, this.y, 1, [70, 64, 60], 2.5);

    const sp = Math.hypot(this.vx, this.vy);
    const steps = Math.max(1, Math.ceil((sp * dt) / 5));
    const sdt = dt / steps;
    for (let s = 0; s < steps; s++) {
      const nx = this.x + this.vx * sdt;
      const ny = this.y + this.vy * sdt;
      const tx = Math.floor(nx / TILE);
      const ty = Math.floor(ny / TILE);
      const type = g.world.get(tx, ty);
      if (isSolidType(type)) {
        if (this.kind === 'saw' || this.kind === 'bomb') {
          const hx = g.world.solidAt(nx, this.y);
          const hy = g.world.solidAt(this.x, ny);
          if (hx) this.vx = -this.vx;
          if (hy) this.vy = -this.vy;
          if (!hx && !hy) {
            this.vx = -this.vx;
            this.vy = -this.vy;
          }
          if (this.kind === 'saw') {
            g.world.damage(tx, ty, this.terrain);
            g.particles.sparks(nx, ny, [255, 230, 160], 4, 120);
            audio.play('clang', { pan: g.panOf(nx), pitch: rand(0.9, 1.2), vol: 0.6 });
            this.bounces--;
            if (this.bounces < 0) return false;
          } else {
            this.vx *= 0.4;
            this.vy *= 0.4;
          }
          break;
        }
        const key = ty * 1000 + tx;
        if (key !== this.lastTile) {
          this.lastTile = key;
          g.world.damage(tx, ty, this.terrain);
          g.impactFx(nx, ny, tx, ty, type, this.kind === 'flame' ? 0.3 : 1);
          if (this.kind === 'rail' && this.tpierce > 0) {
            this.tpierce--;
            this.x = nx;
            this.y = ny;
            continue;
          }
        } else if (this.kind === 'rail') {
          this.x = nx;
          this.y = ny;
          continue;
        }
        if (this.blast) g.explode(nx, ny, this.blast, this.dmg, { terrain: this.terrain, color: this.color, small: true });
        if (this.kind === 'flame') {
          this.vx *= 0.2;
          this.vy *= 0.2;
          this.life = Math.min(this.life, 0.08);
          return true;
        }
        return false;
      }
      this.x = nx;
      this.y = ny;
      if (this.kind === 'bomb') continue;
      if (this.hitTargets(g)) return false;
    }
    if (this.kind === 'bomb' && g.enemyNear(this.x, this.y, 10)) {
      this.expire(g);
      return false;
    }
    return true;
  }

  hitTargets(g) {
    for (const e of g.enemies) {
      if (e.dead || e.ghosted) continue;
      const rr = e.r + this.r;
      const dx = e.x - this.x;
      const dy = e.y - this.y;
      if (dx > rr || dx < -rr || dy > rr || dy < -rr || dx * dx + dy * dy > rr * rr) continue;
      if (this.hits && this.hits.has(e)) continue;
      g.damageEnemy(e, this.dmg, this.vx, this.vy, this);
      if (this.blast) {
        g.explode(this.x, this.y, this.blast, this.dmg, { terrain: this.terrain, color: this.color, small: true });
        return true;
      }
      if (this.pierce > 0) {
        this.pierce--;
        (this.hits ||= new Set()).add(e);
        continue;
      }
      return true;
    }
    const b = g.boss;
    if (b && b.alive) {
      const part = b.hitTest(this.x, this.y, this.r);
      if (part && !(this.hits && this.hits.has(b))) {
        g.damageBoss(part, this.dmg, this);
        if (this.blast) {
          g.explode(this.x, this.y, this.blast, this.dmg * 0.5, { terrain: this.terrain, color: this.color, small: true, noBoss: true });
          return true;
        }
        if (this.pierce > 0) {
          this.pierce--;
          (this.hits ||= new Set()).add(b);
          return false;
        }
        return true;
      }
    }
    return false;
  }

  expire(g) {
    if (this.kind === 'rocket') g.explode(this.x, this.y, this.blast, this.dmg, { terrain: this.terrain, color: this.color, small: true });
    if (this.kind === 'bomb') {
      g.explode(this.x, this.y, 58, 95, { terrain: 70, color: [255, 160, 60], clearBullets: 95, big: true });
    }
  }

  draw(ctx, g) {
    const x = this.x;
    const y = this.y;
    switch (this.kind) {
      case 'rivet': {
        const a = Math.atan2(this.vy, this.vx);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a);
        ctx.fillStyle = '#fff6d0';
        ctx.fillRect(-3, -1, 5, 2);
        ctx.restore();
        break;
      }
      case 'pellet':
        ctx.fillStyle = '#ffe0a0';
        ctx.fillRect(x - 1, y - 1, 2, 2);
        break;
      case 'rail': {
        ctx.strokeStyle = '#eafffa';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - this.vx * 0.025, y - this.vy * 0.025);
        ctx.lineTo(x, y);
        ctx.stroke();
        break;
      }
      case 'rocket': {
        const a = Math.atan2(this.vy, this.vx);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a);
        ctx.fillStyle = '#d8d8e0';
        ctx.fillRect(-3, -1.5, 6, 3);
        ctx.fillStyle = '#ff5040';
        ctx.fillRect(2, -1.5, 2, 3);
        ctx.restore();
        break;
      }
      case 'saw': {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(this.spin);
        ctx.fillStyle = '#c8ccd6';
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a0 = (i / 8) * TAU;
          ctx.lineTo(Math.cos(a0) * (this.r + 1.5), Math.sin(a0) * (this.r + 1.5));
          ctx.lineTo(Math.cos(a0 + 0.4) * this.r * 0.7, Math.sin(a0 + 0.4) * this.r * 0.7);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#50545e';
        ctx.fillRect(-1, -1, 2, 2);
        ctx.restore();
        break;
      }
      case 'bomb': {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(this.t * 8);
        ctx.fillStyle = '#b02020';
        ctx.fillRect(-3, -1.5, 6, 3);
        ctx.fillStyle = '#f0e0c0';
        ctx.fillRect(-1, -1.5, 1, 3);
        ctx.restore();
        break;
      }
      default:
        break;
    }
  }

  drawGlow(ctx) {
    switch (this.kind) {
      case 'flame': {
        const f = this.life / this.maxLife;
        const c = f > 0.7 ? [140, 200, 255] : f > 0.4 ? [255, 160, 60] : [200, 60, 20];
        drawGlow(ctx, this.x, this.y, this.r * 1.8, c, Math.min(1, f * 1.6));
        break;
      }
      case 'rail':
        drawGlow(ctx, this.x, this.y, 14, this.color, 0.9);
        break;
      case 'rocket':
        drawGlow(ctx, this.x - this.vx * 0.02, this.y - this.vy * 0.02, 9, [255, 150, 60], 0.9);
        break;
      case 'bomb':
        if (Math.floor(this.t * 12) % 2 === 0) drawGlow(ctx, this.x, this.y, 10, [255, 80, 40], 1);
        break;
      case 'saw':
        drawGlow(ctx, this.x, this.y, this.r * 2, [200, 220, 255], 0.35);
        break;
      default:
        drawGlow(ctx, this.x, this.y, 6, this.color, 0.7);
    }
  }
}

// ============================================================ enemy projectiles

const ESHOT_STYLE = {
  orb: { color: [255, 90, 200], core: '#ffe0f4' },
  fire: { color: [255, 120, 30], core: '#fff0b0' },
  spore: { color: [140, 255, 80], core: '#efffd0' },
  bone: { color: [230, 225, 200], core: '#ffffff' },
  rock: { color: [160, 140, 120], core: '#d8c8b0' },
  ghost: { color: [120, 255, 200], core: '#e0fff4' },
  blood: { color: [255, 30, 50], core: '#ffc0c8' },
  shard: { color: [140, 220, 255], core: '#f0fbff' },
  ember: { color: [255, 200, 60], core: '#fffbe0' },
};

export class EShot {
  constructor(o) {
    this.kind = 'orb';
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.r = 3;
    this.dmg = 10;
    this.life = 5;
    this.ghost = false;
    this.accel = 0;
    this.maxSpeed = 400;
    this.minSpeed = 20;
    this.turn = 0;
    this.homing = 0;
    this.delay = 0;
    this.t = 0;
    this.spin = 0;
    this.onDie = null;
    Object.assign(this, o);
    const st = ESHOT_STYLE[this.kind] || ESHOT_STYLE.orb;
    this.color = this.color || st.color;
    this.core = st.core;
  }

  update(g, dt) {
    if (this.delay > 0) {
      this.delay -= dt;
      return true;
    }
    this.t += dt;
    this.life -= dt;
    if (this.life <= 0) {
      if (this.onDie) this.onDie(g, this);
      return false;
    }
    if (this.turn || this.accel || this.homing) {
      let a = Math.atan2(this.vy, this.vx);
      let sp = Math.hypot(this.vx, this.vy);
      if (this.turn) a += this.turn * dt;
      if (this.homing && !g.player.dead) a = turnToward(a, Math.atan2(g.player.y - this.y, g.player.x - this.x), this.homing * dt);
      if (this.accel) sp = clamp(sp + this.accel * dt, this.minSpeed, this.maxSpeed);
      this.vx = Math.cos(a) * sp;
      this.vy = Math.sin(a) * sp;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.spin += dt * 12;
    if (!this.ghost && g.world.solidAt(this.x, this.y)) {
      g.particles.sparks(this.x, this.y, this.color, 3, 70);
      if (this.onDie) this.onDie(g, this);
      return false;
    }
    const p = g.player;
    if (!this.harmless && !p.dead && p.inv <= 0 && p.dashT <= 0) {
      const rr = this.r + p.r * 0.6;
      if (dist2(this.x, this.y, p.x, p.y) < rr * rr) {
        p.hurt(this.dmg);
        g.particles.flash(this.x, this.y, 12, this.color, 0.1);
        return false;
      }
    }
    if (this.kind === 'fire' && Math.random() < 0.3) g.particles.embers(this.x, this.y, [255, 140, 40], 1, 15);
    return true;
  }

  draw(ctx) {
    if (this.delay > 0) return;
    const x = this.x;
    const y = this.y;
    if (this.kind === 'bone') {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(this.spin);
      ctx.fillStyle = this.core;
      ctx.fillRect(-4, -1, 8, 2);
      ctx.fillRect(-5, -2, 2, 4);
      ctx.fillRect(3, -2, 2, 4);
      ctx.restore();
      return;
    }
    if (this.kind === 'rock') {
      ctx.fillStyle = rgb(shade(this.color, 0.6));
      ctx.beginPath();
      ctx.arc(x, y, this.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgb(this.color);
      ctx.beginPath();
      ctx.arc(x - 1, y - 1, this.r - 1.5, 0, TAU);
      ctx.fill();
      return;
    }
    ctx.fillStyle = rgb(this.color);
    ctx.beginPath();
    ctx.arc(x, y, this.r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.core;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1, this.r * 0.55), 0, TAU);
    ctx.fill();
  }

  drawGlow(ctx) {
    if (this.delay > 0) {
      if (this.delay < 0.3) drawGlow(ctx, this.x, this.y, 6, this.color, (0.3 - this.delay) * 2);
      return;
    }
    drawGlow(ctx, this.x, this.y, this.r * 3.2, this.color, this.kind === 'rock' ? 0.15 : 0.75);
  }
}

// ============================================================ pickups

export class Pickup {
  constructor(kind, x, y, o = {}) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    const a = rand(TAU);
    const s = rand(20, 80);
    this.vx = Math.cos(a) * s;
    this.vy = Math.sin(a) * s;
    this.t = rand(10);
    this.life = kind === 'ore' ? 30 : 25;
    this.r = 3;
    this.value = 1;
    this.color = [255, 200, 80];
    Object.assign(this, o);
  }

  get magnetic() {
    return this.kind === 'ore' || this.kind === 'health' || this.kind === 'bomb';
  }

  draw(ctx, g) {
    if (this.life < 4 && Math.floor(this.life * 8) % 2 === 0) return;
    const x = Math.round(this.x);
    const y = Math.round(this.y + Math.sin(this.t * 4) * (this.kind === 'ore' ? 0 : 1.5));
    switch (this.kind) {
      case 'ore': {
        const s = this.value >= 8 ? 3 : 2;
        ctx.fillStyle = rgb(shade(this.color, 0.55));
        ctx.fillRect(x - s / 2 + 1, y - s / 2 + 1, s, s);
        ctx.fillStyle = rgb(this.color);
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
        if (Math.floor(this.t * 3) % 4 === 0) {
          ctx.fillStyle = '#fff';
          ctx.fillRect(x - s / 2, y - s / 2, 1, 1);
        }
        break;
      }
      case 'health':
        ctx.fillStyle = '#e8e2d8';
        ctx.fillRect(x - 4, y - 4, 8, 8);
        ctx.fillStyle = '#d02828';
        ctx.fillRect(x - 1, y - 3, 2, 6);
        ctx.fillRect(x - 3, y - 1, 6, 2);
        break;
      case 'bomb':
        ctx.fillStyle = '#b82020';
        ctx.fillRect(x - 4, y - 2, 3, 6);
        ctx.fillRect(x - 1, y - 2, 3, 6);
        ctx.fillRect(x + 2, y - 2, 3, 6);
        ctx.fillStyle = '#e8d8b0';
        ctx.fillRect(x - 4, y, 9, 1);
        break;
      case 'weapon': {
        const c = WEAPONS[this.weapon].color;
        ctx.fillStyle = '#2a2420';
        ctx.fillRect(x - 6, y - 5, 12, 10);
        ctx.fillStyle = rgb(c);
        ctx.fillRect(x - 5, y - 4, 10, 8);
        ctx.fillStyle = '#2a2420';
        ctx.fillRect(x - 3, y - 1, 6, 2);
        const lvl = this.weapon === g.player.weapon ? 'LV UP' : WEAPONS[this.weapon].name;
        drawText(ctx, lvl, x, y - 14, { color: rgb(c), align: 'center' });
        break;
      }
      case 'power': {
        const c = POWERS[this.power].color;
        ctx.fillStyle = rgb(shade(c, 0.5));
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = rgb(c);
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, TAU);
        ctx.fill();
        drawText(ctx, POWERS[this.power].name[0], x, y - 3, { color: '#1a1010', align: 'center', shadow: false });
        drawText(ctx, POWERS[this.power].name, x, y - 14, { color: rgb(c), align: 'center' });
        break;
      }
      default:
        break;
    }
  }

  drawGlow(ctx) {
    const c = this.kind === 'weapon' ? WEAPONS[this.weapon].color : this.kind === 'power' ? POWERS[this.power].color : this.kind === 'health' ? [255, 80, 80] : this.kind === 'bomb' ? [255, 120, 60] : this.color;
    const r = this.kind === 'ore' ? 5 + Math.min(this.value, 10) * 0.4 : 14;
    drawGlow(ctx, this.x, this.y, r, c, this.kind === 'ore' ? 0.5 : 0.45 + 0.2 * Math.sin(this.t * 5));
  }
}

// ============================================================ hazards

export class Beam {
  constructor(o) {
    this.x = 0;
    this.y = 0;
    this.angle = 0;
    this.len = 420;
    this.width = 8;
    this.warn = 0.8;
    this.active = 0.5;
    this.rot = 0;
    this.track = 0;
    this.color = [255, 60, 60];
    this.dmg = 18;
    this.walls = false;
    this.follow = null;
    this.t = 0;
    this.curLen = 0;
    this.fired = false;
    Object.assign(this, o);
    this.curLen = this.len;
  }

  update(g, dt) {
    this.t += dt;
    if (this.follow) {
      const f = this.follow(this);
      if (!f) return false;
      this.x = f.x;
      this.y = f.y;
      if (f.angle !== undefined) this.angle = f.angle;
    }
    const p = g.player;
    if (this.t < this.warn && this.track) {
      this.angle = turnToward(this.angle, Math.atan2(p.y - this.y, p.x - this.x), this.track * dt);
    }
    this.angle += this.rot * dt;
    this.curLen = this.walls ? g.world.raycast(this.x, this.y, this.angle, this.len) : this.len;
    if (this.t >= this.warn) {
      if (!this.fired) {
        this.fired = true;
        audio.play('laser', { pan: g.panOf(this.x) });
        g.shake(0.15);
      }
      // Distance from the player to the beam segment.
      const dx = Math.cos(this.angle);
      const dy = Math.sin(this.angle);
      const px = p.x - this.x;
      const py = p.y - this.y;
      const along = clamp(px * dx + py * dy, 0, this.curLen);
      const ox = px - dx * along;
      const oy = py - dy * along;
      if (ox * ox + oy * oy < (this.width / 2 + p.r * 0.5) ** 2) p.hurt(this.dmg);
      if (Math.random() < 0.5) {
        const ex = this.x + dx * this.curLen;
        const ey = this.y + dy * this.curLen;
        if (this.curLen < this.len) g.particles.sparks(ex, ey, this.color, 1, 90);
      }
    }
    return this.t < this.warn + this.active;
  }

  drawGlow(ctx, g) {
    const ex = this.x + Math.cos(this.angle) * this.curLen;
    const ey = this.y + Math.sin(this.angle) * this.curLen;
    ctx.lineCap = 'round';
    if (this.t < this.warn) {
      const a = 0.25 + 0.35 * Math.abs(Math.sin(this.t * 22));
      ctx.strokeStyle = rgb(this.color, a);
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.lineDashOffset = -g.time * 40;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      const k = this.t - this.warn;
      const fade = Math.min(1, k * 12, (this.active - k) * 8);
      ctx.strokeStyle = rgb(this.color, 0.5 * fade);
      ctx.lineWidth = this.width * 1.8 * fade;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.strokeStyle = rgb([255, 240, 230], fade);
      ctx.lineWidth = this.width * 0.5 * fade;
      ctx.stroke();
      drawGlow(ctx, ex, ey, this.width * 2, this.color, fade);
    }
    ctx.lineCap = 'butt';
  }
}

export class Telegraph {
  constructor(o) {
    this.x = 0;
    this.y = 0;
    this.r = 20;
    this.time = 1;
    this.t = 0;
    this.color = [255, 80, 40];
    this.onDone = null;
    Object.assign(this, o);
  }

  update(g, dt) {
    this.t += dt;
    if (this.t >= this.time) {
      if (this.onDone) this.onDone(g, this);
      return false;
    }
    return true;
  }

  drawGlow(ctx, g) {
    const f = this.t / this.time;
    ctx.strokeStyle = rgb(this.color, 0.4 + 0.4 * Math.abs(Math.sin(g.time * 18)));
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = rgb(this.color, 0.18);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * f, 0, TAU);
    ctx.fill();
  }
}

export class Shockwave {
  constructor(o) {
    this.x = 0;
    this.y = 0;
    this.r = 4;
    this.max = 140;
    this.speed = 160;
    this.width = 7;
    this.dmg = 16;
    this.color = [255, 200, 140];
    this.hit = false;
    Object.assign(this, o);
  }

  update(g, dt) {
    this.r += this.speed * dt;
    const p = g.player;
    if (!this.hit) {
      const d = Math.hypot(p.x - this.x, p.y - this.y);
      if (Math.abs(d - this.r) < this.width / 2 + p.r * 0.5) {
        if (p.hurt(this.dmg)) this.hit = true;
      }
    }
    return this.r < this.max;
  }

  drawGlow(ctx) {
    const f = 1 - this.r / this.max;
    ctx.strokeStyle = rgb(this.color, 0.7 * f + 0.2);
    ctx.lineWidth = this.width * (0.5 + f * 0.5);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, TAU);
    ctx.stroke();
  }
}

export class FirePool {
  constructor(o) {
    this.x = 0;
    this.y = 0;
    this.r = 16;
    this.life = 4;
    this.dps = 18;
    this.color = [255, 110, 30];
    this.t = 0;
    Object.assign(this, o);
    this.max = this.life;
  }

  update(g, dt) {
    this.t += dt;
    this.life -= dt;
    const p = g.player;
    const grow = Math.min(1, this.t * 4);
    if (!(p.stats.fireproof && this.color[0] > 200) && dist2(p.x, p.y, this.x, this.y) < (this.r * grow) ** 2) {
      p.hurt(this.dps * dt, { dot: true });
    }
    if (Math.random() < dt * 10) {
      const a = rand(TAU);
      const d = rand(this.r);
      g.particles.embers(this.x + Math.cos(a) * d, this.y + Math.sin(a) * d, this.color, 1, 20);
    }
    return this.life > 0;
  }

  drawGlow(ctx, g) {
    const f = Math.min(1, this.life, this.t * 4);
    ctx.fillStyle = rgb(this.color, 0.22 * f);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, TAU);
    ctx.fill();
    drawGlow(ctx, this.x, this.y, this.r * 1.4, this.color, (0.4 + 0.1 * Math.sin(g.time * 9 + this.x)) * f);
  }
}

/** Falling rock: telegraphs, slams down, and leaves a fresh rock tile as cover. */
export function rockFall(g, x, y, delay = 1.0, dmg = 20) {
  g.addHazard(
    new Telegraph({
      x,
      y,
      r: 13,
      time: delay,
      color: [255, 170, 90],
      onDone(gg) {
        gg.shake(0.25);
        audio.play('slam', { pan: gg.panOf(x), vol: 0.5 });
        gg.particles.debris(x, y, gg.sdef.colors.hard, 10, 90);
        gg.particles.smoke(x, y, 4, [60, 50, 44], 6);
        const p = gg.player;
        if (dist2(p.x, p.y, x, y) < 16 * 16) p.hurt(dmg);
        const tx = Math.floor(x / TILE);
        const ty = Math.floor(y / TILE);
        if (gg.world.get(tx, ty) === T.AIR && dist2(p.x, p.y, (tx + 0.5) * TILE, (ty + 0.5) * TILE) > 20 * 20) {
          gg.world.set(tx, ty, T.HARD);
        }
      },
    })
  );
}

export function ringOfShots(g, x, y, n, speed, opts = {}, offset = 0) {
  for (let i = 0; i < n; i++) {
    const a = offset + (i / n) * TAU;
    g.addEShot(new EShot({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, ...opts }));
  }
}

export function fanOfShots(g, x, y, angle, n, arc, speed, opts = {}) {
  for (let i = 0; i < n; i++) {
    const a = n === 1 ? angle : angle - arc / 2 + (arc * i) / (n - 1);
    g.addEShot(new EShot({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, ...opts }));
  }
}

