// The six wardens of the descent. Each boss is a state machine with timed attack patterns.
import { TILE, WORLD_W, stratumDef } from './data.js';
import { arenaInfo } from './world.js';
import { rand, TAU, rgb, shade, clamp, dist, angleTo, damp, turnToward, chance, pick } from './util.js';
import { EShot, Beam, Telegraph, Shockwave, FirePool, rockFall, ringOfShots, fanOfShots } from './combat.js';
import { Enemy } from './enemies.js';
import { drawGlow } from './gfx.js';
import { audio } from './audio.js';

const BASE_HP = { wyrm: 1000, colossus: 1600, magmaw: 2000, ossuarch: 2400, gatekeeper: 2900, heart: 3800 };

class Boss {
  constructor(g, si) {
    this.g = g;
    this.si = si;
    this.loop = g.loop;
    this.def = stratumDef(si);
    this.name = this.def.bossName;
    this.title = this.def.bossTitle;
    const A = arenaInfo(si);
    this.arena = {
      cx: (WORLD_W * TILE) / 2,
      cy: (A.centerRow + 2) * TILE,
      rx: 17 * TILE,
      ry: 13 * TILE,
      top: (A.top + 3) * TILE,
      floor: A.seal * TILE - TILE,
    };
    this.x = this.arena.cx;
    this.y = this.arena.cy - 40;
    this.maxHp = this.hp = BASE_HP[this.def.boss] * (1 + this.loop * 0.7);
    this.alive = true;
    this.t = 0;
    this.phase = 0;
    this.flash = 0;
    this.flashCd = 0;
    this.intro = 2.2;
    this.stagger = 0;
    this.busy = 1.2;
    this.parts = [];
    this.events = [];
    this.attackIdx = 0;
    this.bspd = 1 + this.loop * 0.12;
  }

  get frac() {
    return Math.max(0, this.hp / this.maxHp);
  }

  after(sec, fn) {
    this.events.push({ t: this.t + sec, fn });
  }

  part(x, y, r, mult = 1, contact = 18, extra = {}) {
    return { x, y, r, mult, contact, ref: this, ...extra };
  }

  hitTest(x, y, r) {
    if (this.intro > 0 || this.stagger > 0 || !this.alive) return null;
    for (const p of this.parts) {
      if (p.shield) continue;
      const rr = p.r + r;
      if ((p.x - x) ** 2 + (p.y - y) ** 2 < rr * rr) return p;
    }
    return null;
  }

  takeDamage(amount, part) {
    if (this.intro > 0 || this.stagger > 0 || !this.alive) return 0;
    const dmg = amount * (part ? part.mult : 1);
    this.hp -= dmg;
    if (this.flashCd <= 0) {
      this.flash = 0.05;
      this.flashCd = 0.14;
    }
    const f = this.frac;
    const np = f < 0.33 ? 2 : f < 0.66 ? 1 : 0;
    if (np > this.phase && this.hp > 0) {
      this.phase = np;
      this.stagger = 1.0;
      this.events.length = 0;
      this.busy = 1.4;
      audio.play('roar', { pan: this.g.panOf(this.x) });
      this.g.shake(0.7);
      this.g.particles.ring(this.x, this.y, 10, 120, [255, 255, 255], 0.5, 3);
      this.g.clearEShots(this.x, this.y, 400);
      this.onPhase?.(np);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.events.length = 0;
      this.g.bossDefeated(this);
    }
    return dmg;
  }

  update(dt) {
    const g = this.g;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.flashCd -= dt;
    if (this.intro > 0) {
      this.intro -= dt;
      this.updateIntro?.(dt);
      this.syncParts();
      return;
    }
    if (this.stagger > 0) {
      this.stagger -= dt;
      this.syncParts();
      return;
    }
    for (let i = this.events.length - 1; i >= 0; i--) {
      const ev = this.events[i];
      if (this.t >= ev.t) {
        this.events.splice(i, 1);
        if (this.alive) ev.fn();
      }
    }
    if (!this.alive) return;
    this.think(dt);
    this.busy -= dt;
    if (this.busy <= 0 && !g.player.dead) this.attack();
    this.syncParts();
    const p = g.player;
    for (const part of this.parts) {
      if (!part.contact || part.shield) continue;
      const rr = part.r + p.r * 0.7;
      if ((part.x - p.x) ** 2 + (part.y - p.y) ** 2 < rr * rr) p.hurt(part.contact);
    }
  }

  clampArena(margin = 30) {
    const A = this.arena;
    this.x = clamp(this.x, A.cx - A.rx + margin, A.cx + A.rx - margin);
    this.y = clamp(this.y, A.top + margin, A.floor - margin);
  }

  shot(o) {
    const s = new EShot(o);
    s.vx *= this.bspd;
    s.vy *= this.bspd;
    this.g.addEShot(s);
    return s;
  }

  ring(x, y, n, speed, opts, offset = 0) {
    ringOfShots(this.g, x, y, n, speed * this.bspd, opts, offset);
  }

  fan(x, y, a, n, arc, speed, opts) {
    fanOfShots(this.g, x, y, a, n, arc, speed * this.bspd, opts);
  }

  aim(x = this.x, y = this.y) {
    return angleTo(x, y, this.g.player.x, this.g.player.y);
  }

  summon(type, n, maxAlive = 8) {
    const g = this.g;
    if (g.enemies.length >= maxAlive) return;
    for (let i = 0; i < n; i++) {
      const a = rand(TAU);
      const x = this.arena.cx + Math.cos(a) * rand(80, this.arena.rx - 20);
      const y = clamp(this.arena.cy + Math.sin(a) * rand(40, this.arena.ry - 10), this.arena.top + 20, this.arena.floor - 20);
      const e = new Enemy(g, type, x, y, { emerge: true });
      g.enemies.push(e);
      g.particles.smoke(x, y, 4, [50, 40, 40], 5);
    }
    audio.play('emerge', { pan: g.panOf(this.x) });
  }

  C(c, a) {
    return this.flash > 0 ? rgb([c[0] * 0.4 + 153, c[1] * 0.4 + 153, c[2] * 0.4 + 153], a) : rgb(c, a);
  }

  // Overridden per boss.
  syncParts() {}
  think() {}
  attack() {}
  draw() {}
  drawGlow() {}
}

// ====================================================================== 1. MOTHER WYRM

class Wyrm extends Boss {
  constructor(g, si) {
    super(g, si);
    this.y = this.arena.top - 30;
    this.x = this.arena.cx;
    this.vx = 0;
    this.vy = 120;
    this.angle = Math.PI / 2;
    this.speed = 70;
    this.mode = 'hunt';
    this.modeT = 3;
    this.segments = [];
    this.path = [];
    for (let i = 0; i < 200; i++) this.path.push({ x: this.x, y: this.y - i * 2 });
    this.segCount = 16;
    this.buried = 0;
  }

  updateIntro(dt) {
    this.y += 90 * dt;
    this.angle = Math.PI / 2;
    this.trailStep();
    this.g.world.grind(this.x, this.y, 16, 300 * dt);
    if (Math.random() < dt * 20) this.g.particles.debris(this.x + rand(-10, 10), this.y + rand(-10, 10), this.g.sdef.colors.soft, 2, 90);
  }

  trailStep() {
    const last = this.path[0];
    const d = Math.hypot(this.x - last.x, this.y - last.y);
    if (d >= 2) {
      this.path.unshift({ x: this.x, y: this.y });
      if (this.path.length > 220) this.path.pop();
    }
  }

  think(dt) {
    const g = this.g;
    const p = g.player;
    this.modeT -= dt;
    const fast = 1 + this.phase * 0.25;
    if (this.mode === 'hunt') {
      const want = this.aim() + Math.sin(this.t * 2.2) * 0.9;
      this.angle = turnToward(this.angle, want, 2.4 * fast * dt);
      this.speed = 70 * fast;
    } else if (this.mode === 'wind') {
      this.speed = 20;
      this.angle = turnToward(this.angle, this.aim(), 5 * dt);
      if (this.modeT <= 0) {
        this.mode = 'lunge';
        this.modeT = 0.85;
        audio.play('roar', { pan: g.panOf(this.x), pitch: 1.4, vol: 0.6 });
      }
    } else if (this.mode === 'lunge') {
      this.speed = 260;
      if (this.modeT <= 0) {
        this.mode = 'hunt';
        this.modeT = 2;
      }
    } else if (this.mode === 'burrow') {
      this.buried = Math.min(1, this.buried + dt * 3);
      this.speed = 150;
      this.angle = turnToward(this.angle, this.aim() + Math.sin(this.t * 3), 3 * dt);
      if (this.modeT <= 0) {
        this.mode = 'erupt';
        this.modeT = 0.9;
        const tx = p.x;
        const ty = p.y;
        g.addHazard(
          new Telegraph({
            x: tx,
            y: ty,
            r: 26,
            time: 0.85,
            color: [255, 160, 90],
            onDone: () => {
              this.x = tx;
              this.y = ty;
              this.buried = 0;
              g.addHazard(new Shockwave({ x: tx, y: ty, max: 130, speed: 170, dmg: 16 }));
              this.ring(tx, ty, 14, 85, { kind: 'spore', r: 3, dmg: 10, ghost: true, life: 3 }, rand(TAU));
              g.world.blast(tx, ty, 26, 80);
              g.shake(0.6);
              audio.play('slam', { pan: g.panOf(tx) });
              const pp = g.player;
              if (dist(pp.x, pp.y, tx, ty) < 26) pp.hurt(22);
            },
          })
        );
      }
    } else if (this.mode === 'erupt') {
      this.speed = 0;
      if (this.modeT <= 0) {
        this.mode = 'hunt';
        this.modeT = 2;
      }
    }
    if (this.mode !== 'erupt') {
      this.x += Math.cos(this.angle) * this.speed * dt;
      this.y += Math.sin(this.angle) * this.speed * dt;
    }
    // Stay inside the arena bowl by curving back toward the middle.
    const A = this.arena;
    if (Math.abs(this.x - A.cx) > A.rx - 20 || this.y < A.top + 10 || this.y > A.floor - 20) {
      this.angle = turnToward(this.angle, angleTo(this.x, this.y, A.cx, A.cy), 5 * dt);
    }
    this.clampArena(14);
    this.trailStep();
    if (this.buried < 0.5) g.world.grind(this.x + Math.cos(this.angle) * 8, this.y + Math.sin(this.angle) * 8, 14, 120 * dt);
    this.segCount = 6 + Math.ceil(10 * this.frac);
    if (this.buried > 0.5 && Math.random() < dt * 30) g.particles.debris(this.x, this.y, g.sdef.colors.soft, 2, 70);
    if (this.mode !== 'burrow') this.buried = Math.max(0, this.buried - dt * 3);
  }

  attack() {
    const g = this.g;
    const list = this.phase === 0 ? ['lunge', 'volley', 'lunge', 'spit'] : this.phase === 1 ? ['lunge', 'rings', 'spit', 'burrow'] : ['burrow', 'rings', 'lunge', 'spit', 'burrow'];
    const a = list[this.attackIdx++ % list.length];
    if (a === 'lunge') {
      this.mode = 'wind';
      this.modeT = 0.6;
      this.busy = 2.4;
    } else if (a === 'volley') {
      this.busy = 2.2;
      for (let k = 0; k < 2; k++) {
        this.after(k * 0.6, () => {
          this.segPositions().forEach((s, i) => {
            const side = (i + k) % 2 ? 1 : -1;
            const a2 = s.a + (Math.PI / 2) * side;
            this.shot({ kind: 'spore', x: s.x, y: s.y, vx: Math.cos(a2) * 80, vy: Math.sin(a2) * 80, r: 3, dmg: 10, ghost: true, life: 3.2 });
          });
          audio.play('eshoot', { pan: g.panOf(this.x), pitch: 0.7 });
        });
      }
    } else if (a === 'spit') {
      this.busy = 1.8;
      for (let k = 0; k < 3; k++) {
        this.after(k * 0.25, () => {
          this.fan(this.x, this.y, this.aim(), 5 + this.phase * 2, 0.9, 130, { kind: 'spore', r: 3.5, dmg: 12, ghost: true, life: 3 });
          audio.play('fireball', { pan: g.panOf(this.x), pitch: 0.6 });
        });
      }
    } else if (a === 'rings') {
      this.busy = 2.6;
      const segs = this.segPositions();
      segs.forEach((s, i) => {
        if (i % 3) return;
        this.after(i * 0.08, () => this.ring(s.x, s.y, 8, 70, { kind: 'spore', r: 3, dmg: 10, ghost: true, life: 3 }, rand(TAU)));
      });
    } else if (a === 'burrow') {
      this.mode = 'burrow';
      this.modeT = 1.6;
      this.busy = 3.6;
      audio.play('emerge', { pan: g.panOf(this.x), vol: 1.5 });
    }
  }

  segPositions() {
    const out = [];
    for (let i = 1; i <= this.segCount; i++) {
      const idx = Math.min(this.path.length - 2, i * 5);
      const p = this.path[idx];
      const q = this.path[idx + 1];
      out.push({ x: p.x, y: p.y, a: Math.atan2(p.y - q.y, p.x - q.x), r: 11 - (i / 16) * 5 });
    }
    return out;
  }

  syncParts() {
    const segs = this.segPositions();
    const buried = this.buried > 0.5;
    this.parts = [this.part(this.x, this.y, 13, 1.4, 20, { shield: buried })];
    for (const s of segs) this.parts.push(this.part(s.x, s.y, s.r, 0.6, 12, { shield: buried }));
  }

  draw(ctx) {
    const segs = this.segPositions();
    ctx.globalAlpha = 1 - this.buried * 0.75;
    for (let i = segs.length - 1; i >= 0; i--) {
      const s = segs[i];
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.a);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.arc(2, 3, s.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = this.C([120, 84, 70]);
      ctx.fillRect(-2, -s.r - 3, 3, s.r * 2 + 6);
      ctx.fillStyle = this.C(i % 2 ? [168, 124, 100] : [186, 140, 112]);
      ctx.beginPath();
      ctx.arc(0, 0, s.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = this.C([96, 64, 52]);
      ctx.beginPath();
      ctx.ellipse(-1, 0, s.r * 0.5, s.r * 0.85, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    const open = this.mode === 'wind' || this.mode === 'lunge' ? 1 : 0.4 + Math.sin(this.t * 6) * 0.2;
    ctx.fillStyle = this.C([70, 40, 30]);
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.rotate(side * open * 0.5);
      ctx.beginPath();
      ctx.moveTo(6, side * 4);
      ctx.quadraticCurveTo(20, side * 12, 22, side * 2);
      ctx.lineTo(10, side * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = this.C([200, 150, 120]);
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.C([150, 104, 86]);
    ctx.beginPath();
    ctx.arc(-3, 0, 9, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.C([40, 16, 14]);
    ctx.beginPath();
    ctx.arc(8, 0, 4 + open * 2, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawGlow(ctx) {
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    const hot = this.mode === 'wind' ? [255, 60, 30] : [255, 210, 120];
    for (const k of [-1, 1]) {
      drawGlow(ctx, this.x + c * 5 - s * 6 * k, this.y + s * 5 + c * 6 * k, 4, hot, 1 - this.buried * 0.7);
    }
    if (this.mode === 'wind') drawGlow(ctx, this.x + c * 10, this.y + s * 10, 18, [255, 120, 60], 0.6);
  }
}

// ====================================================================== 2. THE COLOSSUS

class Colossus extends Boss {
  constructor(g, si) {
    super(g, si);
    this.y = this.arena.top + 40;
    this.shape = Array.from({ length: 14 }, () => rand(0.85, 1.12));
    this.fists = [
      { x: this.x - 34, y: this.y + 8, tx: 0, ty: 0, state: 'idle', t: 0, side: -1 },
      { x: this.x + 34, y: this.y + 8, tx: 0, ty: 0, state: 'idle', t: 0, side: 1 },
    ];
    this.fistIdx = 0;
    this.coreOpen = 0;
  }

  updateIntro(dt) {
    this.g.shake(0.1);
    if (Math.random() < dt * 15) rockFall(this.g, this.arena.cx + rand(-200, 200), this.arena.cy + rand(-100, 120), 0.6, 0);
    this.moveFists(dt);
    void dt;
  }

  moveFists(dt) {
    const p = this.g.player;
    for (const f of this.fists) {
      if (f.state === 'idle') {
        const hx = this.x + f.side * 34 + Math.sin(this.t * 2 + f.side) * 4;
        const hy = this.y + 10 + Math.cos(this.t * 2 + f.side) * 4;
        f.x += (hx - f.x) * damp(6, dt);
        f.y += (hy - f.y) * damp(6, dt);
      } else if (f.state === 'raise') {
        f.t -= dt;
        f.tx += (p.x - f.tx) * damp(this.phase >= 1 ? 2.2 : 1.5, dt);
        f.ty += (p.y - f.ty) * damp(this.phase >= 1 ? 2.2 : 1.5, dt);
        f.x += (f.tx - f.x) * damp(5, dt);
        f.y += (f.ty - 26 - f.y) * damp(5, dt);
        if (f.t <= 0) {
          f.state = 'slam';
          f.t = 0.12;
        }
      } else if (f.state === 'slam') {
        f.t -= dt;
        f.y += (f.ty - f.y) * damp(30, dt);
        f.x += (f.tx - f.x) * damp(30, dt);
        if (f.t <= 0) {
          f.state = 'rest';
          f.t = 0.7;
          this.slamAt(f.tx, f.ty);
        }
      } else if (f.state === 'rest') {
        f.t -= dt;
        if (f.t <= 0) f.state = 'idle';
      }
    }
  }

  slamAt(x, y) {
    const g = this.g;
    g.shake(0.6);
    audio.play('slam', { pan: g.panOf(x) });
    g.addHazard(new Shockwave({ x, y, max: 110 + this.phase * 30, speed: 150, dmg: 16, color: [255, 220, 170] }));
    this.ring(x, y, 10 + this.phase * 4, 95, { kind: 'shard', r: 2.5, dmg: 10, life: 2 }, rand(TAU));
    g.particles.debris(x, y, g.sdef.colors.hard, 14, 120);
    g.world.blast(x, y, 20, 60);
    const p = g.player;
    if (dist(p.x, p.y, x, y) < 20) p.hurt(24);
  }

  think(dt) {
    const p = this.g.player;
    const wantY = clamp(p.y - 70, this.arena.top + 30, this.arena.floor - 80);
    this.x += clamp(p.x - this.x, -1, 1) * 22 * dt;
    this.y += clamp(wantY - this.y, -1, 1) * 18 * dt;
    this.clampArena(40);
    this.moveFists(dt);
    this.coreOpen = Math.max(0, this.coreOpen - dt);
  }

  attack() {
    const g = this.g;
    const list =
      this.phase === 0 ? ['slam', 'boulder', 'slam', 'slam'] : this.phase === 1 ? ['slam', 'rain', 'boulder', 'slam', 'slam'] : ['beams', 'slam', 'rain', 'slam', 'boulder', 'slam'];
    const a = list[this.attackIdx++ % list.length];
    if (a === 'slam') {
      const f = this.fists[this.fistIdx++ % 2];
      if (f.state !== 'idle') {
        this.busy = 0.3;
        return;
      }
      f.state = 'raise';
      f.t = this.phase >= 2 ? 0.75 : 1.0;
      f.tx = g.player.x;
      f.ty = g.player.y;
      this.busy = this.phase >= 1 ? 0.9 : 1.4;
    } else if (a === 'boulder') {
      this.coreOpen = 1.2;
      this.busy = 1.6;
      audio.play('charge', { pan: g.panOf(this.x), pitch: 0.5 });
      this.after(0.6, () => {
        const n = 1 + this.phase;
        for (let i = 0; i < n; i++) {
          const ang = this.aim() + (i - (n - 1) / 2) * 0.5;
          this.shot({
            kind: 'rock',
            x: this.x,
            y: this.y,
            vx: Math.cos(ang) * 130,
            vy: Math.sin(ang) * 130,
            r: 8,
            dmg: 22,
            life: 2,
            ghost: true,
            color: g.sdef.colors.hard,
            onDie: (gg, s) => {
              ringOfShots(gg, s.x, s.y, 8, 100, { kind: 'shard', r: 2.5, dmg: 10, life: 1.6 }, rand(TAU));
              gg.particles.debris(s.x, s.y, gg.sdef.colors.hard, 10, 90);
              audio.play('break', { pitch: 0.5 });
            },
          });
        }
        audio.play('throw', { pitch: 0.4 });
      });
    } else if (a === 'rain') {
      this.busy = 2.4;
      audio.play('roar', { pan: g.panOf(this.x), pitch: 0.8, vol: 0.6 });
      const n = 7 + this.phase * 2;
      for (let i = 0; i < n; i++) {
        this.after(i * 0.12, () => {
          const p = g.player;
          const x = i % 3 === 0 ? p.x + rand(-10, 10) : this.arena.cx + rand(-this.arena.rx + 20, this.arena.rx - 20);
          const y = i % 3 === 0 ? p.y + rand(-10, 10) : this.arena.cy + rand(-this.arena.ry + 30, this.arena.ry);
          rockFall(g, x, y, 1.0, 20);
        });
      }
    } else if (a === 'beams') {
      this.coreOpen = 3.2;
      this.busy = 3.4;
      audio.play('charge', { pan: g.panOf(this.x) });
      const base = rand(TAU);
      for (let i = 0; i < 3; i++) {
        g.addHazard(
          new Beam({
            x: this.x,
            y: this.y,
            angle: base + (i / 3) * TAU,
            len: 380,
            width: 7,
            warn: 1.0,
            active: 2.1,
            rot: 0.55 * (this.attackIdx % 2 ? 1 : -1),
            dmg: 18,
            color: g.sdef.colors.crystal,
            follow: () => (this.alive ? { x: this.x, y: this.y } : null),
          })
        );
      }
    }
  }

  syncParts() {
    this.parts = [
      this.part(this.x, this.y, 9, this.coreOpen > 0 ? 2 : 1.2, 20),
      this.part(this.x, this.y, 22, 0.5, 20),
      ...this.fists.map((f) => this.part(f.x, f.y, 10, 0.4, f.state === 'slam' ? 26 : 14)),
    ];
  }

  draw(ctx) {
    const col = this.g.sdef.colors.hard;
    for (const f of this.fists) {
      if (f.state === 'raise') {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(f.tx, f.ty, 12, 9, 0, 0, TAU);
        ctx.fill();
      }
    }
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(3, 6, 26, 20, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.C(shade(col, 0.7));
    ctx.beginPath();
    this.shape.forEach((s, i) => {
      const a = (i / this.shape.length) * TAU;
      ctx.lineTo(Math.cos(a) * 24 * s, Math.sin(a) * 22 * s);
    });
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = this.C(shade(col, 1.1));
    ctx.beginPath();
    this.shape.forEach((s, i) => {
      const a = (i / this.shape.length) * TAU;
      ctx.lineTo(Math.cos(a) * 20 * s - 2, Math.sin(a) * 18 * s - 3);
    });
    ctx.closePath();
    ctx.fill();
    // Shoulders / brow plates.
    ctx.fillStyle = this.C(shade(col, 0.85));
    ctx.fillRect(-18, -14, 12, 6);
    ctx.fillRect(6, -14, 12, 6);
    // Core housing.
    const open = Math.min(1, this.coreOpen * 3);
    ctx.fillStyle = this.C([20, 18, 24]);
    ctx.beginPath();
    ctx.ellipse(0, 2, 8 + open * 3, 6 + open * 4, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.C(this.g.sdef.colors.crystal);
    ctx.beginPath();
    ctx.moveTo(0, -4 - open * 3);
    ctx.lineTo(5 + open, 2);
    ctx.lineTo(0, 8 + open * 3);
    ctx.lineTo(-5 - open, 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = this.C(shade(col, 0.45));
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-16, 4);
    ctx.lineTo(-10, 8);
    ctx.lineTo(-12, 14);
    ctx.moveTo(14, -4);
    ctx.lineTo(10, 6);
    ctx.stroke();
    ctx.restore();
    for (const f of this.fists) {
      const s = f.state === 'raise' ? 1.25 : 1;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.scale(s, s);
      ctx.fillStyle = this.C(shade(col, 0.8));
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, TAU);
      ctx.fill();
      ctx.fillStyle = this.C(shade(col, 1.15));
      ctx.beginPath();
      ctx.arc(-1.5, -1.5, 7.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = this.C(shade(col, 0.55));
      for (let k = -1; k <= 1; k++) ctx.fillRect(k * 4 - 1, -8, 2, 5);
      ctx.restore();
    }
  }

  drawGlow(ctx) {
    const c = this.g.sdef.colors.crystal;
    drawGlow(ctx, this.x, this.y + 2, 16 + this.coreOpen * 10, c, 0.6 + 0.2 * Math.sin(this.t * 6));
    drawGlow(ctx, this.x - 7, this.y - 10, 4, [255, 255, 255], 0.9);
    drawGlow(ctx, this.x + 7, this.y - 10, 4, [255, 255, 255], 0.9);
  }
}

// ====================================================================== 3. MAGMAW

class Magmaw extends Boss {
  constructor(g, si) {
    super(g, si);
    const A = this.arena;
    const cyRow = arenaInfo(si).seal - 14;
    this.pools = [
      [-10, 5],
      [10, 5],
      [0, 2],
      [-14, -3],
      [14, -3],
    ].map(([px, py]) => ({ x: A.cx + px * TILE, y: (cyRow + py) * TILE }));
    this.pool = this.pools[2];
    this.x = this.pool.x;
    this.y = this.pool.y;
    this.state = 'emerge';
    this.stateT = 2.2;
    this.rise = 0;
    this.jaw = 0;
    this.spiralA = 0;
  }

  updateIntro(dt) {
    this.rise = Math.min(1, this.rise + dt * 0.6);
    if (Math.random() < dt * 30) this.g.particles.embers(this.x + rand(-20, 20), this.y + rand(-10, 10), [255, 140, 40], 2, 60);
  }

  think(dt) {
    const g = this.g;
    this.stateT -= dt;
    this.jaw = Math.max(0, this.jaw - dt * 2);
    if (this.state === 'dive') {
      this.rise = Math.max(0, this.rise - dt * 2.2);
      if (this.stateT <= 0) {
        const choices = this.pools.filter((p) => p !== this.pool);
        const p = g.player;
        choices.sort((a, b) => dist(a.x, a.y, p.x, p.y) - dist(b.x, b.y, p.x, p.y));
        this.pool = this.phase >= 1 && chance(0.6) ? choices[0] : pick(choices);
        this.x = this.pool.x;
        this.y = this.pool.y;
        this.state = 'emerge';
        this.stateT = 0.8;
        audio.play('emerge', { pan: g.panOf(this.x), pitch: 0.6, vol: 1.5 });
      }
    } else if (this.state === 'emerge') {
      this.rise = Math.min(1, this.rise + dt * 1.6);
      if (Math.random() < dt * 25) g.particles.embers(this.x + rand(-14, 14), this.y + rand(-8, 8), [255, 140, 40], 2, 70);
      if (this.stateT <= 0) {
        this.state = 'up';
        this.stateT = 4.5 - this.phase * 0.6;
        this.busy = 0.3;
        g.addHazard(new Shockwave({ x: this.x, y: this.y, max: 90, speed: 140, dmg: 14, color: [255, 140, 40] }));
      }
    } else if (this.state === 'up') {
      if (this.stateT <= 0) {
        this.state = 'dive';
        this.stateT = 1.1;
        this.events.length = 0;
        g.particles.embers(this.x, this.y, [255, 140, 40], 12, 80);
      }
    }
    if (Math.random() < dt * 4) g.particles.embers(this.x + rand(-10, 10), this.y, [255, 120, 30], 1, 20);
  }

  attack() {
    if (this.state !== 'up') {
      this.busy = 0.2;
      return;
    }
    const g = this.g;
    const list = this.phase === 0 ? ['spiral', 'spit'] : this.phase === 1 ? ['spit', 'geyser', 'spiral'] : ['geyser', 'spiral', 'spit', 'flood'];
    const a = list[this.attackIdx++ % list.length];
    this.jaw = 1;
    if (a === 'spiral') {
      this.busy = 2.6;
      const arms = 2 + this.phase;
      const dir = this.attackIdx % 2 ? 1 : -1;
      for (let i = 0; i < 22; i++) {
        this.after(i * 0.1, () => {
          this.spiralA += 0.32 * dir;
          for (let k = 0; k < arms; k++) {
            const ang = this.spiralA + (k / arms) * TAU;
            this.shot({ kind: 'fire', x: this.x, y: this.y, vx: Math.cos(ang) * 105, vy: Math.sin(ang) * 105, r: 3.5, dmg: 12, ghost: true, life: 3.2 });
          }
          if (i % 3 === 0) audio.play('fireball', { pan: g.panOf(this.x), pitch: 0.8, vol: 0.7 });
        });
      }
    } else if (a === 'spit') {
      this.busy = 2.2;
      const n = 3 + this.phase;
      for (let i = 0; i < n; i++) {
        this.after(i * 0.25, () => {
          const p = g.player;
          const tx = p.x + rand(-30, 30) + p.vx * 0.5;
          const ty = p.y + rand(-30, 30) + p.vy * 0.5;
          audio.play('throw', { pitch: 0.4, pan: g.panOf(this.x) });
          g.addHazard(
            new Telegraph({
              x: tx,
              y: ty,
              r: 18,
              time: 1.0,
              color: [255, 120, 30],
              onDone: (gg) => {
                gg.addHazard(new FirePool({ x: tx, y: ty, r: 18, life: 4 + this.phase, dps: 22 }));
                this.ring(tx, ty, 6, 70, { kind: 'fire', r: 3, dmg: 10, ghost: true, life: 1.6 }, rand(TAU));
                const pp = gg.player;
                if (dist(pp.x, pp.y, tx, ty) < 18) pp.hurt(16);
                gg.shake(0.2);
                audio.play('explode', { pan: gg.panOf(tx), vol: 0.4, pitch: 1.4 });
              },
            })
          );
          this.shot({ kind: 'fire', x: this.x, y: this.y, vx: tx - this.x, vy: ty - this.y, r: 5, dmg: 0, ghost: true, life: 0.95, harmless: true });
        });
      }
    } else if (a === 'geyser') {
      this.busy = 2.4;
      for (let i = 0; i < 4 + this.phase; i++) {
        this.after(i * 0.35, () => {
          const p = g.player;
          const tx = p.x;
          const ty = p.y;
          g.addHazard(
            new Telegraph({
              x: tx,
              y: ty,
              r: 15,
              time: 0.7,
              color: [255, 200, 60],
              onDone: (gg) => {
                gg.particles.flash(tx, ty, 40, [255, 180, 60], 0.3);
                gg.particles.embers(tx, ty, [255, 180, 60], 14, 100);
                this.ring(tx, ty, 8, 90, { kind: 'ember', r: 2.5, dmg: 10, ghost: true, life: 1.4 }, rand(TAU));
                const pp = gg.player;
                if (dist(pp.x, pp.y, tx, ty) < 16) pp.hurt(20);
                audio.play('fireball', { pan: gg.panOf(tx) });
              },
            })
          );
        });
      }
    } else if (a === 'flood') {
      this.busy = 3;
      for (let w = 0; w < 4; w++) {
        this.after(w * 0.5, () => this.ring(this.x, this.y, 18, 80, { kind: 'fire', r: 3, dmg: 12, ghost: true, life: 4 }, w * 0.17));
      }
      audio.play('roar', { pan: g.panOf(this.x), pitch: 0.7 });
    }
  }

  syncParts() {
    const up = this.state === 'up' || (this.state === 'emerge' && this.rise > 0.6);
    this.parts = up ? [this.part(this.x, this.y - 10 * this.rise, 17, 1, 22)] : [];
  }

  draw(ctx) {
    const r = this.rise;
    if (r <= 0.02) return;
    const y = this.y - 10 * r;
    ctx.save();
    ctx.globalAlpha = Math.min(1, r * 1.5);
    // Neck rising out of the pool.
    for (let i = 3; i >= 1; i--) {
      ctx.fillStyle = this.C([90, 24, 10]);
      ctx.beginPath();
      ctx.arc(this.x + Math.sin(this.t * 2 + i) * 2, this.y + i * 4 - 2, 12 * r + i, 0, TAU);
      ctx.fill();
    }
    ctx.translate(this.x, y);
    ctx.scale(r, r);
    ctx.fillStyle = this.C([60, 18, 10]);
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.C([96, 30, 14]);
    ctx.beginPath();
    ctx.arc(-2, -3, 14, 0, TAU);
    ctx.fill();
    // Crust plates.
    ctx.fillStyle = this.C([40, 12, 8]);
    ctx.fillRect(-12, -10, 8, 4);
    ctx.fillRect(4, -12, 9, 4);
    ctx.fillRect(-4, -16, 7, 3);
    // Jaw.
    const j = this.jaw * 6 + Math.sin(this.t * 4) * 1;
    ctx.fillStyle = this.C([30, 8, 4]);
    ctx.beginPath();
    ctx.ellipse(0, 8, 11, 3 + j, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.C([240, 220, 190]);
    for (let k = -8; k <= 8; k += 4) {
      ctx.beginPath();
      ctx.moveTo(k - 1.5, 8 - 3 - j * 0.6);
      ctx.lineTo(k + 1.5, 8 - 3 - j * 0.6);
      ctx.lineTo(k, 8 - j * 0.2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawGlow(ctx) {
    const r = this.rise;
    drawGlow(ctx, this.pool.x, this.pool.y, 40, [255, 110, 30], 0.3 + 0.2 * (1 - r) * Math.abs(Math.sin(this.t * 5)));
    if (r <= 0.05) return;
    const y = this.y - 10 * r;
    drawGlow(ctx, this.x - 7 * r, y - 4 * r, 5, [255, 240, 80], r);
    drawGlow(ctx, this.x + 7 * r, y - 4 * r, 5, [255, 240, 80], r);
    drawGlow(ctx, this.x, y + 8 * r, 10 + this.jaw * 12, [255, 140, 40], r * (0.5 + this.jaw * 0.5));
    // Glowing cracks.
    drawGlow(ctx, this.x - 8 * r, y + 2, 5, [255, 90, 20], 0.5 * r);
    drawGlow(ctx, this.x + 9 * r, y - 1, 5, [255, 90, 20], 0.5 * r);
  }
}

// ====================================================================== 4. THE OSSUARCH

class Ossuarch extends Boss {
  constructor(g, si) {
    super(g, si);
    this.y = this.arena.top + 50;
    this.bones = [];
    for (let i = 0; i < 8; i++) this.bones.push({ hp: 40, regrow: 0, a: 0 });
    this.orbit = 0;
    this.jaw = 0;
    this.spin = 0.9;
    this.spiralA = 0;
  }

  onPhase(np) {
    if (np === 2) for (let i = 0; i < 4; i++) this.bones.push({ hp: 40, regrow: 0, a: 0, outer: true });
  }

  updateIntro(dt) {
    this.orbit += dt * 3;
  }

  think(dt) {
    const p = this.g.player;
    const tx = p.x + Math.sin(this.t * 0.7) * 60;
    const ty = clamp(p.y - 110, this.arena.top + 40, this.arena.floor - 60);
    this.x += (tx - this.x) * damp(0.8, dt);
    this.y += (ty - this.y) * damp(0.8, dt);
    this.clampArena(40);
    this.orbit += dt * this.spin * (1 + this.phase * 0.3);
    this.jaw = Math.max(0, this.jaw - dt * 2);
    for (const b of this.bones) {
      if (b.hp <= 0) {
        b.regrow -= dt;
        if (b.regrow <= 0) b.hp = 40;
      }
    }
  }

  attack() {
    const g = this.g;
    const list = this.phase === 0 ? ['spears', 'cross', 'spears'] : this.phase === 1 ? ['cross', 'summon', 'spears', 'cross'] : ['spiral', 'cross', 'spears', 'summon', 'spiral'];
    const a = list[this.attackIdx++ % list.length];
    this.jaw = 1;
    if (a === 'spears') {
      this.busy = 1.8;
      for (let i = 0; i < 3; i++) {
        this.after(i * 0.3, () => {
          this.fan(this.x, this.y + 8, this.aim(), 7 + this.phase * 2, 1.1, 150, { kind: 'bone', r: 3, dmg: 12, ghost: true, life: 3 });
          audio.play('throw', { pan: g.panOf(this.x), pitch: 0.8 });
        });
      }
    } else if (a === 'cross') {
      this.busy = 3.6;
      const n = this.phase >= 1 ? 6 : 4;
      const base = this.aim() + Math.PI / n;
      const dir = this.attackIdx % 2 ? 1 : -1;
      audio.play('charge', { pan: g.panOf(this.x) });
      for (let i = 0; i < n; i++) {
        g.addHazard(
          new Beam({
            x: this.x,
            y: this.y,
            angle: base + (i / n) * TAU,
            len: 420,
            width: 7,
            warn: 1.1,
            active: 2.2,
            rot: (0.5 + this.phase * 0.1) * dir,
            dmg: 18,
            color: [120, 255, 170],
            follow: () => (this.alive ? { x: this.x, y: this.y } : null),
          })
        );
      }
    } else if (a === 'summon') {
      this.busy = 1.6;
      this.summon('skeleton', 3, 7);
      audio.play('roar', { pan: g.panOf(this.x), pitch: 1.2, vol: 0.5 });
    } else if (a === 'spiral') {
      this.busy = 3;
      for (let i = 0; i < 30; i++) {
        this.after(i * 0.09, () => {
          this.spiralA += 0.27;
          for (let k = 0; k < 3; k++) {
            const ang = this.spiralA + (k / 3) * TAU;
            const ang2 = -this.spiralA + (k / 3) * TAU + 0.5;
            this.shot({ kind: 'ghost', x: this.x, y: this.y, vx: Math.cos(ang) * 95, vy: Math.sin(ang) * 95, r: 3, dmg: 10, ghost: true, life: 4 });
            if (i % 2) this.shot({ kind: 'ghost', x: this.x, y: this.y, vx: Math.cos(ang2) * 70, vy: Math.sin(ang2) * 70, r: 3, dmg: 10, ghost: true, life: 4 });
          }
        });
      }
    }
  }

  bonePos(i) {
    const b = this.bones[i];
    const inner = this.bones.filter((x) => !x.outer).length;
    const outer = this.bones.length - inner;
    if (b.outer) {
      const k = i - inner;
      const a = -this.orbit * 1.3 + (k / outer) * TAU;
      return { x: this.x + Math.cos(a) * 50, y: this.y + Math.sin(a) * 50, a };
    }
    const a = this.orbit + (i / inner) * TAU;
    return { x: this.x + Math.cos(a) * 34, y: this.y + Math.sin(a) * 34, a };
  }

  syncParts() {
    this.parts = [this.part(this.x, this.y, 18, 1, 20)];
    this.bones.forEach((b, i) => {
      if (b.hp <= 0) return;
      const p = this.bonePos(i);
      this.parts.unshift(this.part(p.x, p.y, 7, 0, 14, { bone: b }));
    });
  }

  takeDamage(amount, part) {
    if (part && part.bone) {
      if (this.intro > 0 || this.stagger > 0) return 0;
      part.bone.hp -= amount;
      this.g.particles.sparks(part.x, part.y, [230, 225, 200], 2, 80);
      if (part.bone.hp <= 0) {
        part.bone.regrow = 6;
        this.g.particles.debris(part.x, part.y, [220, 214, 190], 8, 90);
        audio.play('break', { pan: this.g.panOf(part.x), pitch: 1.4 });
      }
      return 0;
    }
    return super.takeDamage(amount, part);
  }

  draw(ctx) {
    this.bones.forEach((b, i) => {
      if (b.hp <= 0) return;
      const p = this.bonePos(i);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a + Math.PI / 2);
      ctx.fillStyle = this.C([214, 208, 184]);
      ctx.fillRect(-6, -1.5, 12, 3);
      ctx.beginPath();
      ctx.arc(-6, -1.5, 2, 0, TAU);
      ctx.arc(-6, 1.5, 2, 0, TAU);
      ctx.arc(6, -1.5, 2, 0, TAU);
      ctx.arc(6, 1.5, 2, 0, TAU);
      ctx.fill();
      ctx.restore();
    });
    ctx.save();
    ctx.translate(this.x, this.y + Math.sin(this.t * 2) * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(4, 26, 18, 6, 0, 0, TAU);
    ctx.fill();
    // Crown of spikes.
    ctx.fillStyle = this.C([150, 140, 110]);
    for (let k = -3; k <= 3; k++) {
      ctx.beginPath();
      ctx.moveTo(k * 5 - 3, -14);
      ctx.lineTo(k * 5, -24 - (k % 2 ? 0 : 4));
      ctx.lineTo(k * 5 + 3, -14);
      ctx.fill();
    }
    ctx.fillStyle = this.C([226, 220, 196]);
    ctx.beginPath();
    ctx.arc(0, -2, 18, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.C([200, 192, 166]);
    ctx.fillRect(-11, 10, 22, 8 + this.jaw * 5);
    ctx.fillStyle = this.C([30, 28, 24]);
    for (let k = -9; k <= 7; k += 4) ctx.fillRect(k, 10, 2, 4);
    ctx.fillRect(-11, 15 + this.jaw * 5, 22, 1);
    ctx.beginPath();
    ctx.ellipse(-7, -2, 5, 6, 0, 0, TAU);
    ctx.ellipse(7, -2, 5, 6, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.lineTo(-2, 8);
    ctx.lineTo(2, 8);
    ctx.fill();
    ctx.strokeStyle = this.C([150, 140, 120]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(4, -18);
    ctx.lineTo(1, -12);
    ctx.lineTo(4, -8);
    ctx.stroke();
    ctx.restore();
  }

  drawGlow(ctx) {
    const y = this.y + Math.sin(this.t * 2) * 2 - 2;
    const pulse = 0.7 + 0.3 * Math.sin(this.t * 5);
    drawGlow(ctx, this.x - 7, y, 6, [120, 255, 170], pulse);
    drawGlow(ctx, this.x + 7, y, 6, [120, 255, 170], pulse);
    drawGlow(ctx, this.x, y + 14, 8 + this.jaw * 10, [80, 255, 160], 0.3 + this.jaw * 0.5);
  }
}

// ====================================================================== 5. THE GATEKEEPER

class Gatekeeper extends Boss {
  constructor(g, si) {
    super(g, si);
    this.y = this.arena.top + 36;
    this.homeY = this.y;
    this.hands = [
      { x: this.x - 60, y: this.y + 30, side: -1, state: 'idle', t: 0, tx: 0, ty: 0 },
      { x: this.x + 60, y: this.y + 30, side: 1, state: 'idle', t: 0, tx: 0, ty: 0 },
    ];
    this.mouth = 0;
    this.eyesHot = 0;
    this.handIdx = 0;
  }

  updateIntro(dt) {
    this.g.shake(0.08);
    this.moveHands(dt);
  }

  moveHands(dt) {
    for (const h of this.hands) {
      if (h.state === 'idle') {
        const hx = this.x + h.side * 62 + Math.sin(this.t * 1.5 + h.side) * 6;
        const hy = this.y + 34 + Math.cos(this.t * 1.8 + h.side) * 6;
        h.x += (hx - h.x) * damp(4, dt);
        h.y += (hy - h.y) * damp(4, dt);
      } else if (h.state === 'reach') {
        h.t -= dt;
        const p = this.g.player;
        h.tx += (p.x - h.tx) * damp(2.5, dt);
        h.ty += (p.y - h.ty) * damp(2.5, dt);
        h.x += (h.tx - h.x) * damp(6, dt);
        h.y += (h.ty - 30 - h.y) * damp(6, dt);
        if (h.t <= 0) {
          h.state = 'slam';
          h.t = 0.1;
        }
      } else if (h.state === 'slam') {
        h.t -= dt;
        h.x += (h.tx - h.x) * damp(30, dt);
        h.y += (h.ty - h.y) * damp(30, dt);
        if (h.t <= 0) {
          h.state = 'rest';
          h.t = 0.6;
          const g = this.g;
          g.shake(0.55);
          audio.play('slam', { pan: g.panOf(h.tx) });
          g.addHazard(new Shockwave({ x: h.tx, y: h.ty, max: 120, speed: 160, dmg: 16, color: [255, 120, 60] }));
          g.addHazard(new FirePool({ x: h.tx, y: h.ty, r: 20, life: 3, dps: 20 }));
          this.ring(h.tx, h.ty, 12, 90, { kind: 'fire', r: 3, dmg: 11, ghost: true, life: 2.2 }, rand(TAU));
          const p = g.player;
          if (dist(p.x, p.y, h.tx, h.ty) < 20) p.hurt(24);
        }
      } else if (h.state === 'rest') {
        h.t -= dt;
        if (h.t <= 0) h.state = 'idle';
      }
    }
  }

  think(dt) {
    const p = this.g.player;
    this.x += (clamp(p.x, this.arena.cx - 150, this.arena.cx + 150) - this.x) * damp(0.6, dt);
    this.y = this.homeY + Math.sin(this.t * 0.8) * 6;
    this.mouth = Math.max(0, this.mouth - dt * 1.5);
    this.eyesHot = Math.max(0, this.eyesHot - dt);
    this.moveHands(dt);
  }

  attack() {
    const g = this.g;
    const list =
      this.phase === 0 ? ['breath', 'slam', 'wall', 'slam'] : this.phase === 1 ? ['slam', 'breath', 'imps', 'wall', 'slam'] : ['eyes', 'slam', 'wall', 'breath', 'imps', 'slam'];
    const a = list[this.attackIdx++ % list.length];
    if (a === 'breath') {
      this.busy = 2.8;
      this.mouth = 2.4;
      audio.play('roar', { pan: g.panOf(this.x), pitch: 0.9 });
      let ang = this.aim(this.x, this.y + 14) - 0.7;
      const sweep = 1.4 / 26;
      for (let i = 0; i < 26; i++) {
        this.after(0.3 + i * 0.07, () => {
          ang += sweep;
          for (const off of [-0.08, 0.08]) {
            const s = rand(130, 170);
            this.shot({ kind: 'fire', x: this.x, y: this.y + 16, vx: Math.cos(ang + off) * s, vy: Math.sin(ang + off) * s, r: 3.5, dmg: 12, ghost: true, life: 3 });
          }
          if (i % 4 === 0) audio.play('fireball', { pan: g.panOf(this.x), vol: 0.6 });
        });
      }
    } else if (a === 'slam') {
      const h = this.hands[this.handIdx++ % 2];
      if (h.state !== 'idle') {
        this.busy = 0.3;
        return;
      }
      h.state = 'reach';
      h.t = this.phase >= 2 ? 0.7 : 0.95;
      h.tx = g.player.x;
      h.ty = g.player.y;
      this.busy = this.phase >= 1 ? 1.0 : 1.4;
    } else if (a === 'wall') {
      this.busy = 3.4;
      audio.play('warn');
      const A = this.arena;
      for (let row = 0; row < 3; row++) {
        this.after(row * 0.9, () => {
          const gaps = [rand(-A.rx + 60, A.rx - 60)];
          if (this.phase < 2) gaps.push(rand(-A.rx + 60, A.rx - 60));
          for (let x = -A.rx; x <= A.rx; x += 13) {
            if (gaps.some((gx) => Math.abs(x - gx) < 26)) continue;
            this.shot({ kind: 'fire', x: A.cx + x, y: A.top + 4, vx: 0, vy: 75 + this.phase * 10, r: 4, dmg: 14, ghost: true, life: 7, delay: 0.25 });
          }
          audio.play('fireball', { pan: 0, pitch: 0.6 });
        });
      }
    } else if (a === 'imps') {
      this.busy = 1.5;
      this.summon('imp', 2, 6);
    } else if (a === 'eyes') {
      this.busy = 2.6;
      this.eyesHot = 2.4;
      audio.play('charge', { pan: g.panOf(this.x) });
      for (const k of [-1, 1]) {
        g.addHazard(
          new Beam({
            x: this.x + k * 10,
            y: this.y - 6,
            angle: this.aim(),
            len: 420,
            width: 6,
            warn: 0.9,
            active: 1.3,
            track: 1.4,
            dmg: 18,
            color: [255, 220, 60],
            follow: () => (this.alive ? { x: this.x + k * 10, y: this.y - 6 } : null),
          })
        );
      }
    }
  }

  syncParts() {
    this.parts = [
      this.part(this.x - 10, this.y - 6, 5, this.eyesHot > 0 ? 2.2 : 1.4, 0),
      this.part(this.x + 10, this.y - 6, 5, this.eyesHot > 0 ? 2.2 : 1.4, 0),
      this.part(this.x, this.y, 26, 1, 24),
      ...this.hands.map((h) => this.part(h.x, h.y, 11, 0.45, h.state === 'slam' ? 28 : 14)),
    ];
  }

  draw(ctx) {
    for (const h of this.hands) {
      if (h.state === 'reach') {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(h.tx, h.ty, 14, 10, 0, 0, TAU);
        ctx.fill();
      }
    }
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(4, 26, 30, 8, 0, 0, TAU);
    ctx.fill();
    // Horns.
    ctx.fillStyle = this.C([40, 24, 22]);
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(k * 14, -16);
      ctx.quadraticCurveTo(k * 46, -30, k * 44, -58);
      ctx.quadraticCurveTo(k * 36, -34, k * 22, -10);
      ctx.fill();
    }
    ctx.fillStyle = this.C([110, 20, 24]);
    ctx.beginPath();
    ctx.ellipse(0, 0, 27, 26, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.C([150, 32, 34]);
    ctx.beginPath();
    ctx.ellipse(-2, -4, 22, 20, 0, 0, TAU);
    ctx.fill();
    // Brow ridge.
    ctx.fillStyle = this.C([80, 14, 18]);
    ctx.beginPath();
    ctx.moveTo(-20, -12);
    ctx.lineTo(0, -4);
    ctx.lineTo(20, -12);
    ctx.lineTo(20, -8);
    ctx.lineTo(0, 0);
    ctx.lineTo(-20, -8);
    ctx.fill();
    ctx.fillStyle = this.C([20, 4, 4]);
    ctx.fillRect(-14, -8, 8, 4);
    ctx.fillRect(6, -8, 8, 4);
    // Mouth.
    const m = Math.min(1, this.mouth) * 7;
    ctx.fillStyle = this.C([30, 4, 6]);
    ctx.beginPath();
    ctx.ellipse(0, 13, 13, 3 + m, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.C([236, 226, 200]);
    for (let k = -10; k <= 10; k += 5) {
      ctx.beginPath();
      ctx.moveTo(k - 2, 13 - 3 - m);
      ctx.lineTo(k + 2, 13 - 3 - m);
      ctx.lineTo(k, 13 - m * 0.3);
      ctx.fill();
    }
    ctx.restore();
    for (const h of this.hands) {
      const s = h.state === 'reach' ? 1.25 : 1;
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.scale(s, s);
      ctx.fillStyle = this.C([100, 18, 22]);
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, TAU);
      ctx.fill();
      ctx.fillStyle = this.C([226, 214, 190]);
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.moveTo(k * 6 - 2, 6);
        ctx.lineTo(k * 7, 15);
        ctx.lineTo(k * 6 + 2, 6);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawGlow(ctx) {
    const hot = this.eyesHot > 0 ? 1 : 0.6;
    drawGlow(ctx, this.x - 10, this.y - 6, 7 + hot * 6, [255, 220, 60], hot);
    drawGlow(ctx, this.x + 10, this.y - 6, 7 + hot * 6, [255, 220, 60], hot);
    if (this.mouth > 0) drawGlow(ctx, this.x, this.y + 14, 20, [255, 120, 30], Math.min(1, this.mouth));
    for (const h of this.hands) drawGlow(ctx, h.x, h.y, 10, [255, 80, 40], 0.25);
  }
}

// ====================================================================== 6. THE ABYSSAL HEART

class Heart extends Boss {
  constructor(g, si) {
    super(g, si);
    this.y = this.arena.cy - 20;
    this.beatT = 1;
    this.beat = 0;
    this.spiralA = 0;
    this.eyeOpen = 0;
    this.anchors = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + 0.3;
      this.anchors.push({ x: this.arena.cx + Math.cos(a) * (this.arena.rx + 20), y: this.y + Math.sin(a) * (this.arena.ry + 30) });
    }
  }

  onPhase(np) {
    if (np === 2) this.eyeOpen = 0.01;
  }

  think(dt) {
    const g = this.g;
    const period = this.phase === 0 ? 1.25 : this.phase === 1 ? 0.95 : 0.7;
    this.beatT -= dt;
    this.beat = Math.max(0, this.beat - dt * 3);
    if (this.eyeOpen > 0) this.eyeOpen = Math.min(1, this.eyeOpen + dt);
    if (this.beatT <= 0) {
      this.beatT = period;
      this.beat = 1;
      audio.play('heartbeat', { pan: g.panOf(this.x) });
      g.shake(0.12);
      g.pulse = 1;
      const n = 12 + this.phase * 4;
      this.ring(this.x, this.y, n, 70 + this.phase * 10, { kind: 'blood', r: 3.5, dmg: 12, ghost: true, life: 5 }, (this.t * 0.37) % TAU);
    }
    this.x = this.arena.cx + Math.sin(this.t * 0.4) * 30;
  }

  attack() {
    const g = this.g;
    const list =
      this.phase === 0 ? ['spiral', 'clots', 'spiral'] : this.phase === 1 ? ['veins', 'clots', 'eyes', 'spiral'] : ['flower', 'veins', 'clots', 'flower', 'eyes'];
    const a = list[this.attackIdx++ % list.length];
    if (a === 'spiral') {
      this.busy = 3.2;
      const dir = this.attackIdx % 2 ? 1 : -1;
      for (let i = 0; i < 30; i++) {
        this.after(i * 0.09, () => {
          this.spiralA += 0.25 * dir;
          for (let k = 0; k < 3; k++) {
            const ang = this.spiralA + (k / 3) * TAU;
            this.shot({ kind: 'blood', x: this.x, y: this.y, vx: Math.cos(ang) * 100, vy: Math.sin(ang) * 100, r: 3, dmg: 11, ghost: true, life: 4 });
          }
        });
      }
    } else if (a === 'clots') {
      this.busy = 2.2;
      for (let i = 0; i < 4 + this.phase; i++) {
        const ang = (i / (4 + this.phase)) * TAU;
        this.shot({ kind: 'blood', x: this.x, y: this.y, vx: Math.cos(ang) * 60, vy: Math.sin(ang) * 60, r: 6, dmg: 16, homing: 1.3, ghost: true, life: 5, accel: 25, maxSpeed: 130 });
      }
      audio.play('splat', { pan: g.panOf(this.x) });
    } else if (a === 'veins') {
      this.busy = 3.4;
      audio.play('charge', { pan: g.panOf(this.x) });
      const n = 4 + (this.phase >= 2 ? 1 : 0);
      const base = this.aim() + Math.PI / n;
      for (let i = 0; i < n; i++) {
        g.addHazard(
          new Beam({
            x: this.x,
            y: this.y,
            angle: base + (i / n) * TAU,
            len: 420,
            width: 8,
            warn: 1.1,
            active: 2.2,
            rot: 0.45 * (this.attackIdx % 2 ? 1 : -1),
            dmg: 18,
            color: [255, 30, 60],
            follow: () => (this.alive ? { x: this.x, y: this.y } : null),
          })
        );
      }
    } else if (a === 'eyes') {
      this.busy = 1.4;
      this.summon('eye', 2, 5);
    } else if (a === 'flower') {
      this.busy = 3.4;
      for (let w = 0; w < 6; w++) {
        this.after(w * 0.45, () => {
          const n = 10;
          for (let i = 0; i < n; i++) {
            const ang = (i / n) * TAU + w * 0.3;
            for (const turn of [0.9, -0.9]) {
              this.shot({ kind: 'blood', x: this.x, y: this.y, vx: Math.cos(ang) * 90, vy: Math.sin(ang) * 90, r: 3, dmg: 11, ghost: true, life: 4, turn });
            }
          }
          audio.play('eshoot', { pan: g.panOf(this.x), pitch: 0.5 });
        });
      }
    }
  }

  syncParts() {
    const s = 1 + this.beat * 0.12;
    this.parts = [this.part(this.x, this.y, 26 * s, this.eyeOpen > 0.5 ? 1.6 : 1, 26)];
  }

  draw(ctx) {
    const g = this.g;
    const s = 1 + this.beat * 0.12;
    // Veins tethering the heart to the walls.
    for (const a of this.anchors) {
      ctx.strokeStyle = this.C([90, 6, 18]);
      ctx.lineWidth = 5 + this.beat * 2;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      const mx = (this.x + a.x) / 2 + Math.sin(this.t + a.x) * 20;
      const my = (this.y + a.y) / 2 + Math.cos(this.t + a.y) * 20;
      ctx.quadraticCurveTo(mx, my, a.x, a.y);
      ctx.stroke();
      ctx.strokeStyle = this.C([160, 20, 40]);
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(s, s);
    // Arteries.
    ctx.fillStyle = this.C([110, 14, 30]);
    ctx.fillRect(-12, -36, 8, 16);
    ctx.fillRect(2, -40, 9, 20);
    ctx.fillRect(13, -30, 6, 12);
    ctx.fillStyle = this.C([60, 4, 14]);
    ctx.fillRect(-11, -37, 6, 3);
    ctx.fillRect(3, -41, 7, 3);
    // Body.
    ctx.fillStyle = this.C([120, 8, 26]);
    ctx.beginPath();
    ctx.moveTo(0, 28);
    ctx.bezierCurveTo(-34, 6, -30, -26, -10, -22);
    ctx.bezierCurveTo(-2, -20, 0, -14, 0, -12);
    ctx.bezierCurveTo(2, -20, 12, -26, 22, -20);
    ctx.bezierCurveTo(34, -10, 24, 12, 0, 28);
    ctx.fill();
    ctx.fillStyle = this.C([170, 24, 44]);
    ctx.beginPath();
    ctx.ellipse(-8, -6, 12, 14, -0.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.C([220, 80, 90]);
    ctx.fillRect(-12, -14, 4, 3);
    ctx.strokeStyle = this.C([70, 0, 16]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(4, -10);
    ctx.quadraticCurveTo(10, 0, 4, 14);
    ctx.moveTo(-14, 4);
    ctx.quadraticCurveTo(-6, 10, -2, 20);
    ctx.stroke();
    if (this.eyeOpen > 0) {
      const o = this.eyeOpen;
      ctx.fillStyle = this.C([240, 230, 200]);
      ctx.beginPath();
      ctx.ellipse(2, 2, 10, 7 * o, 0, 0, TAU);
      ctx.fill();
      const la = angleTo(this.x, this.y, g.player.x, g.player.y);
      ctx.fillStyle = this.C([200, 20, 40]);
      ctx.beginPath();
      ctx.arc(2 + Math.cos(la) * 3, 2 + Math.sin(la) * 2 * o, 4 * o, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.fillRect(1 + Math.cos(la) * 3, -1 + Math.sin(la) * 2 * o, 2, 6 * o);
    }
    ctx.restore();
  }

  drawGlow(ctx) {
    drawGlow(ctx, this.x, this.y, 50 + this.beat * 30, [255, 20, 50], 0.35 + this.beat * 0.4);
    if (this.eyeOpen > 0) drawGlow(ctx, this.x + 2, this.y + 2, 12, [255, 60, 60], this.eyeOpen);
  }
}

const BOSSES = { wyrm: Wyrm, colossus: Colossus, magmaw: Magmaw, ossuarch: Ossuarch, gatekeeper: Gatekeeper, heart: Heart };

export function makeBoss(g, si) {
  const Cls = BOSSES[stratumDef(si).boss];
  return new Cls(g, si);
}

