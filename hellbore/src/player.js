// The borer: a tracked dig-tank with a spinning drill bit and an independent turret.
import { TILE, WORLD_W, WEAPONS, WEAPON_IDS, MAX_WEAPON_LEVEL, POWERS, T } from './data.js';
import { clamp, damp, turnToward, rgb, shade, TAU } from './util.js';
import { fireWeapon } from './combat.js';
import { audio } from './audio.js';

export class Player {
  constructor(game, rig) {
    this.game = game;
    this.rig = rig;
    this.x = (WORLD_W * TILE) / 2;
    this.y = -10;
    this.r = 7;
    this.vx = 0;
    this.vy = 0;
    this.heading = Math.PI / 2;
    this.aim = Math.PI / 2;
    this.up = { hull: 0, drill: 0, rate: 0, dmg: 0, speed: 0, magnet: 0, bombs: 0, dash: 0, armor: 0 };
    this.pacts = new Set();
    this.weapon = rig.weapon;
    this.wlevels = {};
    for (const id of WEAPON_IDS) this.wlevels[id] = 1;
    this.powers = { overdrive: 0, aegis: 0, frenzy: 0, magnet: 0 };
    this.aegisHits = 0;
    this.dashCd = 0;
    this.dashT = 0;
    this.dashDx = 0;
    this.dashDy = 1;
    this.inv = 0;
    this.fireCd = 0;
    this.drilling = 0;
    this.drillHard = 0;
    this.spin = 0;
    this.tread = 0;
    this.recoil = 0;
    this.muzzle = 0;
    this.hurtFlash = 0;
    this.dead = false;
    this.ore = 0;
    this.oreTotal = 0;
    this.trailT = 0;
    this.liquidT = 0;
    this.recalc();
    this.hp = this.maxHp;
    this.bombs = this.maxBombs;
  }

  get wlevel() {
    return this.wlevels[this.weapon];
  }

  weaponName() {
    return WEAPONS[this.weapon].name;
  }

  recalc() {
    const u = this.up;
    const P = this.pacts;
    const rig = this.rig;
    const oldMax = this.maxHp || 0;
    this.maxHp = Math.round((rig.hp + 25 * u.hull) * (P.has('wrath') ? 0.75 : 1));
    if (oldMax && this.hp > this.maxHp) this.hp = this.maxHp;
    this.maxBombs = 2 + u.bombs;
    this.stats = {
      speed: rig.speed * (1 + 0.08 * u.speed) * (P.has('haste') ? 1.2 : 1) * (P.has('iron') ? 0.88 : 1),
      drill: rig.drill * (1 + 0.35 * u.drill),
      rate: (1 + 0.15 * u.rate) * (P.has('haste') ? 1.2 : 1),
      dmg: (1 + 0.15 * u.dmg) * (P.has('wrath') ? 1.45 : 1),
      magnet: 46 * (1 + 0.5 * u.magnet),
      taken: (1 - rig.armor) * (1 - 0.08 * u.armor) * (P.has('iron') ? 0.7 : 1),
      dashCd: rig.dashCd * (1 - 0.2 * u.dash),
      ore: P.has('greed') ? 1.6 : 1,
      fireproof: !!rig.fireproof || P.has('cinder'),
      burn: P.has('cinder'),
      killHeal: P.has('blood') ? 2 : 0,
    };
  }

  heal(n) {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }

  giveWeapon(id) {
    if (id === this.weapon) {
      if (this.wlevels[id] < MAX_WEAPON_LEVEL) this.wlevels[id]++;
    } else {
      this.weapon = id;
    }
    return this.wlevels[id];
  }

  givePower(id) {
    this.powers[id] = POWERS[id].dur;
    if (id === 'aegis') this.aegisHits = 3;
  }

  /** Apply damage. opts.dot = continuous damage that ignores i-frames. Returns true if it landed. */
  hurt(amount, opts = {}) {
    const g = this.game;
    if (this.dead || g.attract || !(amount > 0)) return false;
    if (opts.dot) {
      this.hp -= amount * this.stats.taken;
      this.hurtFlash = Math.max(this.hurtFlash, 0.08);
      if (this.hp <= 0) g.playerDied();
      return true;
    }
    if (this.inv > 0 || this.dashT > 0) return false;
    if (this.aegisHits > 0 && this.powers.aegis > 0) {
      this.aegisHits--;
      if (this.aegisHits <= 0) this.powers.aegis = 0;
      this.inv = 0.6;
      audio.play('shield');
      g.particles.ring(this.x, this.y, 6, 26, [120, 210, 255], 0.35);
      return false;
    }
    this.hp -= amount * this.stats.taken;
    this.inv = 0.75;
    this.hurtFlash = 0.3;
    g.shake(0.45);
    g.hitstop(0.05);
    g.flashScreen([255, 40, 30], 0.25);
    audio.play('hurt');
    if (g.app.input.mode === 'touch') navigator.vibrate?.(45);
    g.particles.sparks(this.x, this.y, [255, 180, 80], 10, 150);
    g.stats.damageTaken += amount;
    if (this.hp <= 0) g.playerDied();
    return true;
  }

  update(dt, inp) {
    const g = this.game;
    const S = this.stats;
    for (const k of Object.keys(this.powers)) this.powers[k] = Math.max(0, this.powers[k] - dt);
    this.inv = Math.max(0, this.inv - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.muzzle = Math.max(0, this.muzzle - dt);
    this.recoil = Math.max(0, this.recoil - dt * 40);

    // ---- aiming
    let wantFire = inp.fire;
    if (inp.aimMode === 'mouse') {
      if (inp.pointerSeen) this.aim = Math.atan2(inp.pointerWorldY - this.y, inp.pointerWorldX - this.x);
    } else if (inp.aimMode === 'keys' || inp.aimMode === 'stick' || inp.aimMode === 'touch') {
      let a = Math.atan2(inp.aim.y, inp.aim.x);
      if (inp.aimMode !== 'keys' && g.settings.aimAssist) a = g.aimAssist(this.x, this.y, a);
      this.aim = a;
    }
    if (!wantFire && g.settings.autoFire && inp.aimMode === 'touch-idle') {
      const t = g.nearestTarget(this.x, this.y, 190);
      if (t) {
        this.aim = Math.atan2(t.y - this.y, t.x - this.x);
        wantFire = true;
      }
    }

    // ---- movement
    const mvx = inp.move.x;
    const mvy = inp.move.y;
    const moving = mvx * mvx + mvy * mvy > 0.01;
    let speed = S.speed;
    const under = g.world.typeAt(this.x, this.y);
    if (under === T.LIQUID) {
      const liq = g.sdef.liquid;
      speed *= liq.slow;
      if (liq.dmg && !(S.fireproof && liq.hot)) {
        this.hurt(liq.dmg * dt, { dot: true });
        this.liquidT += dt;
        if (this.liquidT > 0.1) {
          this.liquidT = 0;
          g.particles.embers(this.x, this.y, g.sdef.colors.liquid, 2, 30);
        }
      }
    }

    if (inp.dash && this.dashCd <= 0 && !this.dead) {
      let dx = mvx;
      let dy = mvy;
      if (!moving) {
        dx = Math.cos(this.heading);
        dy = Math.sin(this.heading);
      }
      const l = Math.hypot(dx, dy) || 1;
      this.dashDx = dx / l;
      this.dashDy = dy / l;
      this.dashT = 0.17;
      this.dashCd = S.dashCd;
      this.inv = Math.max(this.inv, 0.28);
      this.heading = Math.atan2(this.dashDy, this.dashDx);
      audio.play('dash');
      g.particles.ring(this.x, this.y, 4, 16, [255, 200, 120], 0.25, 2);
    }

    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vx = this.dashDx * 330;
      this.vy = this.dashDy * 330;
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = 0.03;
        g.particles.spawn({ kind: 'ghost', x: this.x, y: this.y, rot: this.heading, size: 9, color: this.rig.color, life: 0.25, drag: 0 });
      }
    } else {
      const k = damp(moving ? 14 : 10, dt);
      this.vx += (mvx * speed - this.vx) * k;
      this.vy += (mvy * speed - this.vy) * k;
    }
    if (moving && this.dashT <= 0) this.heading = turnToward(this.heading, Math.atan2(mvy, mvx), 10 * dt);

    const ox = this.x;
    const oy = this.y;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    g.world.collide(this);
    this.x = clamp(this.x, TILE, WORLD_W * TILE - TILE);
    const moved = Math.hypot(this.x - ox, this.y - oy);
    this.tread += moved * 0.6;

    // ---- drilling
    this.drilling = Math.max(0, this.drilling - dt * 5);
    this.spin += dt * (4 + this.drilling * 26);
    if ((moving || this.dashT > 0) && !this.dead) {
      const h = this.heading;
      const tipX = this.x + Math.cos(h) * (this.r + 5);
      const tipY = this.y + Math.sin(h) * (this.r + 5);
      const power = S.drill * (this.powers.frenzy > 0 ? 3 : 1) * (this.dashT > 0 ? 2.5 : 1);
      const hard = g.world.grind(tipX, tipY, 8.5, power * dt);
      if (hard) {
        this.drilling = 1;
        this.drillHard = hard;
        g.shake(hard > 50 ? 0.05 : 0.025);
        if (Math.random() < dt * 30) {
          const col = g.tileColorAt(tipX + Math.cos(h) * 4, tipY + Math.sin(h) * 4);
          g.particles.debris(tipX, tipY, col, 1, 80);
          if (Math.random() < 0.5) g.particles.sparks(tipX, tipY, [255, 210, 120], 1, 110, h + Math.PI, 1.2);
        }
      }
      // Ram anything at the drill tip.
      const ram = (this.rig.ram || 1) * (this.powers.frenzy > 0 ? 3 : 1) * (this.dashT > 0 ? 2 : 1);
      g.ramAt(tipX, tipY, 9, 34 * ram * dt);
    }
    audio.setDrill(this.drilling, this.drillHard);

    // Tread marks on open floor.
    if (moved > 0.4 && Math.random() < 0.25 && under !== T.LIQUID) {
      const h = this.heading;
      const px = -Math.sin(h);
      const py = Math.cos(h);
      g.world.decal(this.x, this.y, (c) => {
        c.fillStyle = 'rgba(0,0,0,0.12)';
        c.fillRect(Math.round(this.x + px * 6 - 1), Math.round(this.y + py * 6 - 1), 2, 2);
        c.fillRect(Math.round(this.x - px * 6 - 1), Math.round(this.y - py * 6 - 1), 2, 2);
      });
    }

    // ---- shooting
    this.fireCd -= dt;
    if (wantFire && !this.dead) {
      if (this.fireCd <= 0) {
        fireWeapon(g, this);
        const w = WEAPONS[this.weapon];
        let rate = w.rate * S.rate * (this.powers.overdrive > 0 ? 2 : 1);
        if (this.weapon === 'rail') rate *= 1 + 0.1 * (this.wlevel - 1);
        this.fireCd += 1 / rate;
        if (this.fireCd < 0) this.fireCd = 0;
      }
    } else if (this.fireCd < 0) this.fireCd = 0;

    if (inp.bomb && this.bombs > 0 && !this.dead) {
      this.bombs--;
      g.throwCharge(this);
    }

    // Exhaust smoke.
    if (Math.random() < dt * (6 + this.drilling * 10)) {
      const bx = this.x - Math.cos(this.heading) * 10;
      const by = this.y - Math.sin(this.heading) * 10;
      g.particles.smoke(bx, by, 1, [40, 36, 34], 3);
    }
  }

  draw(ctx) {
    if (this.dead) return;
    const g = this.game;
    if (this.inv > 0 && this.hurtFlash <= 0 && Math.floor(g.time * 20) % 2 === 0 && this.dashT <= 0) {
      ctx.globalAlpha = 0.45;
    }
    const flash = this.hurtFlash > 0.2;
    const col = (c) => (flash ? '#fff' : rgb(c));
    const body = this.rig.color;
    const trim = this.rig.trim;
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y));

    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(1, 2, 11, 9, 0, 0, TAU);
    ctx.fill();

    ctx.rotate(this.heading);
    // Treads.
    ctx.fillStyle = col([30, 27, 26]);
    ctx.fillRect(-9, -8.5, 17, 4.5);
    ctx.fillRect(-9, 4, 17, 4.5);
    ctx.fillStyle = col([84, 78, 70]);
    const off = this.tread % 3;
    for (let i = -9 + off; i < 8; i += 3) {
      ctx.fillRect(i, -8.5, 1, 4.5);
      ctx.fillRect(i, 4, 1, 4.5);
    }
    // Drill bit.
    ctx.fillStyle = col([150, 150, 162]);
    ctx.beginPath();
    ctx.moveTo(6, -6.5);
    ctx.lineTo(16, 0);
    ctx.lineTo(6, 6.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = col([210, 212, 222]);
    ctx.beginPath();
    ctx.moveTo(6, -6.5);
    ctx.lineTo(16, 0);
    ctx.lineTo(6, -1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = col([70, 70, 80]);
    ctx.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      const u = (k / 3 + this.spin * 0.25) % 1;
      const x = 6 + u * 9;
      const hw = 6.5 * (1 - u / 1.05);
      ctx.beginPath();
      ctx.moveTo(x, -hw);
      ctx.lineTo(x + 2, hw);
      ctx.stroke();
    }
    // Hull.
    ctx.fillStyle = col(shade(body, 0.55));
    ctx.fillRect(-9, -5.5, 16, 11);
    ctx.fillStyle = col(body);
    ctx.fillRect(-8, -5, 14, 10);
    ctx.fillStyle = col(shade(body, 1.25));
    ctx.fillRect(-8, -5, 14, 2);
    ctx.fillStyle = col(trim);
    ctx.fillRect(-7, -1, 4, 2);
    ctx.fillRect(3, -4, 2, 8);
    // Hazard stripes on the nose.
    ctx.fillStyle = col([30, 26, 24]);
    for (let i = -4; i < 5; i += 3) ctx.fillRect(5, i, 1, 1.5);
    // Exhausts.
    ctx.fillStyle = col([50, 46, 44]);
    ctx.fillRect(-11, -4, 3, 2);
    ctx.fillRect(-11, 2, 3, 2);
    ctx.restore();

    // Turret.
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y));
    ctx.rotate(this.aim);
    ctx.translate(-this.recoil, 0);
    this.drawBarrel(ctx, col);
    ctx.fillStyle = col(shade(body, 0.6));
    ctx.beginPath();
    ctx.arc(-1, 0, 4.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = col(shade(body, 1.15));
    ctx.beginPath();
    ctx.arc(-1, 0, 3.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = col(trim);
    ctx.fillRect(-2, -1, 2, 2);
    ctx.restore();
    ctx.globalAlpha = 1;

    // Aegis bubble.
    if (this.powers.aegis > 0 && this.aegisHits > 0) {
      ctx.strokeStyle = `rgba(120,210,255,${0.35 + 0.15 * Math.sin(g.time * 8)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 14, 0, TAU);
      ctx.stroke();
    }
  }

  drawBarrel(ctx, col) {
    const w = this.weapon;
    const lvl = this.wlevel;
    const steel = col([66, 66, 74]);
    const dark = col([36, 36, 42]);
    const accent = col(WEAPONS[w].color);
    switch (w) {
      case 'rivet': {
        const n = lvl >= 5 ? 3 : lvl >= 3 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const o = (i - (n - 1) / 2) * 2.6;
          ctx.fillStyle = steel;
          ctx.fillRect(0, o - 1, 10, 2);
          ctx.fillStyle = accent;
          ctx.fillRect(9, o - 1, 1, 2);
        }
        break;
      }
      case 'scatter':
        ctx.fillStyle = steel;
        ctx.fillRect(0, -2.5, 9, 5);
        ctx.fillStyle = dark;
        ctx.fillRect(8, -2, 2, 4);
        ctx.fillStyle = accent;
        ctx.fillRect(3, -2.5, 1, 5);
        break;
      case 'torch':
        ctx.fillStyle = steel;
        ctx.fillRect(0, -1.5, 8, 3);
        ctx.fillStyle = accent;
        ctx.fillRect(8, -2, 2, 4);
        ctx.fillStyle = col([255, 140, 60]);
        ctx.fillRect(-5, -4, 3, 2);
        break;
      case 'arc':
        ctx.fillStyle = steel;
        ctx.fillRect(0, -1, 10, 2);
        ctx.fillStyle = accent;
        for (let i = 2; i < 10; i += 3) ctx.fillRect(i, -2.5, 1.5, 5);
        break;
      case 'rail':
        ctx.fillStyle = steel;
        ctx.fillRect(0, -2.5, 13, 1.5);
        ctx.fillRect(0, 1, 13, 1.5);
        ctx.fillStyle = accent;
        ctx.fillRect(2, -1, 10, 2);
        break;
      case 'rocket':
        ctx.fillStyle = steel;
        ctx.fillRect(-1, -4, 8, 8);
        ctx.fillStyle = dark;
        ctx.fillRect(6, -3, 2, 2);
        ctx.fillRect(6, 1, 2, 2);
        ctx.fillStyle = accent;
        ctx.fillRect(1, -4, 2, 8);
        break;
      case 'saw':
        ctx.fillStyle = steel;
        ctx.fillRect(0, -1, 6, 2);
        ctx.save();
        ctx.translate(8, 0);
        ctx.rotate(this.game.time * 20);
        ctx.fillStyle = accent;
        for (let i = 0; i < 6; i++) {
          ctx.rotate(TAU / 6);
          ctx.fillRect(0, -1, 4, 2);
        }
        ctx.restore();
        break;
      default:
        break;
    }
  }

  drawGlow(ctx, glowFn) {
    if (this.dead) return;
    if (this.muzzle > 0) {
      const mx = this.x + Math.cos(this.aim) * 12;
      const my = this.y + Math.sin(this.aim) * 12;
      glowFn(ctx, mx, my, 12, WEAPONS[this.weapon].color, this.muzzle / 0.06);
    }
    // Headlamps.
    const h = this.heading;
    glowFn(ctx, this.x + Math.cos(h) * 6, this.y + Math.sin(h) * 6, 6, [255, 240, 200], 0.5);
    if (this.drilling > 0.2) {
      glowFn(ctx, this.x + Math.cos(h) * 15, this.y + Math.sin(h) * 15, 10, [255, 180, 90], this.drilling * 0.6);
    }
    if (this.powers.frenzy > 0) glowFn(ctx, this.x, this.y, 22, [255, 90, 60], 0.35 + 0.15 * Math.sin(this.game.time * 12));
    if (this.powers.overdrive > 0) glowFn(ctx, this.x, this.y, 18, [255, 200, 60], 0.25);
  }
}
