// Projectile engine (DESIGN §4.5). `world.fire(opts)` → ProjectileSystem.spawn. Implements:
// pierce (per-projectile hit set), bounce (retarget nearest other enemy within 300), homing,
// lobbed arcs (no collision until landing, ground shadow, landing marker for enemy lobs),
// explode, burn, slow, drag/accel/maxSpeed, sine wave, trails, crits, hooks, swept collision.
//
// Engine-level player stats (applied here so weapons don't have to):
//   • stats.burnChance — every player projectile hit rolls it → burn (stats.burnDps × damage, 3 s)
//   • stats.explosive  — hits from source 'primary' burst for 35% damage, radius explosive × area
// Enemy shots: damage × owner.dmgMult (or opts.dmgMult), speed × run.mods.enemyBulletSpeed.

import { Sprites } from '../gfx/sprites.js';
import { TAU, distToSegment2 } from '../core/math.js';

let nextId = 1;
const PI = Math.PI;

/** A pooled projectile. Fields mirror DESIGN §4.5. */
export class Projectile {
  constructor() {
    this.id = 0;
    this.gen = 0;
    this.hitSet = [];
    this.data = null;
    this.alive = false;
  }

  /** Mark for removal on the next update. `explode=true` also triggers its explosion. */
  kill(explode = false) {
    this.dead = true;
    this._explodeOnKill = explode;
  }
}

const glowCache = new Map();
/** Soft additive glow sprite for a color (cached). */
function glowSprite(color) {
  let s = glowCache.get(color);
  if (s) return s;
  const size = 64;
  const c =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(size, size)
      : Object.assign(document.createElement('canvas'), { width: size, height: size });
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, color);
  grd.addColorStop(0.35, color);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = 0.9;
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  // Hot white center keeps the core readable.
  const g2 = g.createRadialGradient(32, 32, 0, 32, 32, 12);
  g2.addColorStop(0, 'rgba(255,255,255,0.55)');
  g2.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = g2;
  g.fillRect(0, 0, size, size);
  s = { img: c, w: 32, h: 32, cx: 16, cy: 16 };
  glowCache.set(color, s);
  return s;
}

const TRAIL_EVERY = { smoke: 0.03, spark: 0.025, aether: 0.02, steam: 0.04, fire: 0.03 };

export class ProjectileSystem {
  /** @param {import('./world.js').World} world */
  constructor(world) {
    this.world = world;
    /** @type {Projectile[]} */
    this.pool = [];
    this._near = [];
  }

  /**
   * Create a projectile. See DESIGN §4.5 / docs/ENGINE.md for options.
   * @param {object} o
   * @returns {Projectile}
   */
  spawn(o) {
    const w = this.world;
    const p = this.pool.pop() || new Projectile();
    const owner = o.owner || null;
    const team = o.team || (owner && owner.team === 'enemy' ? 'enemy' : 'player');
    p.id = nextId++;
    p.gen++;
    p.alive = true;
    p.dead = false;
    p._explodeOnKill = false;
    p.team = team;
    p.kind = o.kind || (team === 'player' ? 'ball' : 'orb');
    p.sprite = o.sprite || (team === 'player' ? 'pb_' : 'eb_') + p.kind;
    p.frame = o.frame || 0;
    p._s = null;
    p._sf = -1;
    p.x = o.x ?? 0;
    p.y = o.y ?? 0;
    p.r = o.r ?? 5;
    p.owner = owner;
    p.source = o.source || (team === 'player' ? 'primary' : 'enemy');
    p.element = o.element || 'kinetic';
    let speed = o.speed;
    let angle = o.angle;
    if (o.vx !== undefined || o.vy !== undefined) {
      const vx = o.vx || 0;
      const vy = o.vy || 0;
      if (speed === undefined) speed = Math.hypot(vx, vy);
      if (angle === undefined) angle = Math.atan2(vy, vx);
    }
    speed = speed ?? 400;
    angle = angle ?? 0;
    let damage = o.damage ?? 10;
    p.dmgMult = 1;
    if (team === 'enemy') {
      const mult = o.dmgMult ?? (owner && owner.dmgMult) ?? 1;
      p.dmgMult = mult;
      damage *= mult;
      if (!o.noSpeedMod) speed *= w.run?.mods?.enemyBulletSpeed ?? 1;
    }
    p.damage = damage;
    p.speed = speed;
    p.angle = angle;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.t = 0;
    p.life = o.range && speed > 0 ? o.range / speed : (o.life ?? 2);
    p.pierce = o.pierce ?? 0;
    p.pierceLeft = p.pierce;
    p.bounce = o.bounce ?? 0;
    p.bounceLeft = p.bounce;
    p.drag = o.drag ?? 0;
    p.accel = o.accel ?? 0;
    p.maxSpeed = o.maxSpeed ?? Infinity;
    p.minSpeed = o.minSpeed ?? 0;
    p.homing = o.homing ?? 0;
    p.homingRange = o.homingRange ?? 400;
    p.homingDelay = o.homingDelay ?? 0;
    p.target = o.target || null;
    p._retarget = 0;
    p.explode = o.explode || null;
    p.burn = o.burn || null;
    p.slow = o.slow || null;
    p.knockback = o.knockback ?? 60;
    p.scale = o.scale ?? 1;
    p.spin = o.spin ?? 0;
    p.rot = o.rot ?? angle;
    p.alpha = o.alpha ?? 1;
    p.trail = o.trail || null;
    p.trailT = 0;
    p.glow = o.glow === undefined ? (team === 'enemy' ? '#ff5a2a' : null) : o.glow;
    p.glowSize = o.glowSize ?? 3.2;
    p.wave = o.wave || null;
    p.noExplosive = !!o.noExplosive;
    p.noBurnChance = !!o.noBurnChance;
    p.hitPlayers = o.hitPlayers ?? team === 'enemy';
    p.hitEnemies = o.hitEnemies ?? team === 'player';
    p.onHit = o.onHit || null;
    p.onExpire = o.onExpire || null;
    p.onLand = o.onLand || null;
    p.update = o.update || null;
    p.draw = o.draw || null;
    p.data = o.data || {};
    p.hitSet.length = 0;
    p.z = 0;
    // Crit is rolled once per projectile.
    if (o.crit !== undefined) p.crit = !!o.crit;
    else p.crit = team === 'player' && owner?.stats ? w.rng.next() < owner.stats.crit : false;
    // Wave motion integrates a base position and offsets perpendicular to travel.
    if (p.wave) {
      p.bx = p.x;
      p.by = p.y;
      p.wavePhase = p.wave.phase ?? 0;
    }
    // Lobbed arc: straight ground track from start to target, height parabola, no collision.
    if (o.lob) {
      const L = o.lob;
      const tx = L.tx ?? p.x + Math.cos(angle) * 300;
      const ty = L.ty ?? p.y + Math.sin(angle) * 300;
      const d = Math.hypot(tx - p.x, ty - p.y);
      const time = Math.max(0.15, L.time ?? d / Math.max(60, speed));
      p.lob = {
        sx: p.x,
        sy: p.y,
        tx,
        ty,
        time,
        height: L.height ?? Math.min(160, 40 + d * 0.35),
        marker: L.marker ?? team === 'enemy',
      };
      p.life = time;
      p.vx = (tx - p.x) / time;
      p.vy = (ty - p.y) / time;
      p.angle = Math.atan2(p.vy, p.vx);
    } else {
      p.lob = null;
    }
    if (team === 'player') {
      w.pBullets.push(p);
      if (owner?.isPlayer && w.run) w.run.shotsFired++;
    } else {
      w.eBullets.push(p);
    }
    return p;
  }

  /** Update one list (pBullets or eBullets). */
  updateList(list, dt) {
    const w = this.world;
    const cam = w.renderer.camera;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      if (p.alive && !p.dead) this._step(p, dt, w);
      if (p.alive && !p.dead) {
        // Cull stray shots far from the action.
        const dx = p.x - cam.x;
        const dy = p.y - cam.y;
        if (dx * dx + dy * dy > 2200 * 2200) p.dead = true;
      }
      if (p.dead && p.alive) this._finish(p, p._explodeOnKill, w);
      if (!p.alive) {
        list[i] = list[list.length - 1];
        list.pop();
        p.owner = null;
        p.target = null;
        p.data = null;
        if (this.pool.length < 2000) this.pool.push(p);
      }
    }
  }

  _step(p, dt, w) {
    p.t += dt;
    if (p.spin) p.rot += p.spin * dt;
    if (p.update) {
      p.update(p, dt, w);
      if (p.dead || !p.alive) return;
    }

    if (p.lob) {
      const L = p.lob;
      const k = Math.min(1, p.t / L.time);
      p.x = L.sx + (L.tx - L.sx) * k;
      p.y = L.sy + (L.ty - L.sy) * k;
      p.z = L.height * 4 * k * (1 - k);
      if (k >= 1) this._land(p, w);
      return;
    }

    // Speed shaping.
    if (p.accel || p.drag) {
      let sp = p.speed + p.accel * dt;
      if (p.drag) sp *= Math.exp(-p.drag * dt);
      if (sp > p.maxSpeed) sp = p.maxSpeed;
      if (sp < p.minSpeed) sp = p.minSpeed;
      p.speed = sp;
      p.vx = Math.cos(p.angle) * sp;
      p.vy = Math.sin(p.angle) * sp;
    }

    // Homing: turn velocity toward a target at `homing` rad/s.
    if (p.homing && p.t >= p.homingDelay) {
      p._retarget -= dt;
      let tgt = p.target;
      if (!tgt || !tgt.alive || p._retarget <= 0) {
        p._retarget = 0.2;
        tgt =
          p.team === 'player'
            ? w.nearestEnemy(p.x, p.y, p.homingRange)
            : w.nearestPlayer(p.x, p.y, p.homingRange);
        p.target = tgt;
      }
      if (tgt) {
        const want = Math.atan2(tgt.y - p.y, tgt.x - p.x);
        let d = want - p.angle;
        d -= Math.round(d / TAU) * TAU;
        const step = p.homing * dt;
        p.angle += d > step ? step : d < -step ? -step : d;
        p.vx = Math.cos(p.angle) * p.speed;
        p.vy = Math.sin(p.angle) * p.speed;
      }
    }

    const x0 = p.x;
    const y0 = p.y;
    if (p.wave) {
      p.bx += p.vx * dt;
      p.by += p.vy * dt;
      const off = Math.sin(p.t * p.wave.freq * TAU + p.wavePhase) * p.wave.amp;
      const s = p.speed || 1;
      p.x = p.bx + (-p.vy / s) * off;
      p.y = p.by + (p.vx / s) * off;
    } else {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    if (p.trail) this._trail(p, dt, w);

    if (p.t >= p.life) {
      p.dead = true;
      this._finish(p, !p.explode || p.explode.onExpire !== false, w, true);
      return;
    }

    if (p.hitEnemies) this._collideEnemies(p, x0, y0, w);
    if (!p.alive || p.dead) return;
    if (p.hitPlayers) this._collidePlayers(p, w);
  }

  _collideEnemies(p, x0, y0, w) {
    const near = this._near;
    near.length = 0;
    const sx = p.x - x0;
    const sy = p.y - y0;
    const segLen = Math.hypot(sx, sy);
    const swept = segLen > p.r;
    if (swept) {
      w.spatial.query(x0 + sx / 2, y0 + sy / 2, p.r * p.scale + segLen / 2, near);
    } else {
      w.spatial.query(p.x, p.y, p.r * p.scale, near);
    }
    if (!near.length) return;
    // Sort by distance from the start point so pierce order is sensible.
    if (near.length > 1) {
      for (let i = 0; i < near.length; i++) {
        const e = near[i];
        e._pd = (e.x - x0) * (e.x - x0) + (e.y - y0) * (e.y - y0);
      }
      near.sort(byPd);
    }
    const pr = p.r * p.scale;
    for (let i = 0; i < near.length; i++) {
      const e = near[i];
      if (!e.alive || e.untargetable || e.noHit || e.phased) continue;
      if (p.hitSet.length && p.hitSet.includes(e.id)) continue;
      const rr = pr + e.r;
      if (swept) {
        if (distToSegment2(e.x, e.y, x0, y0, p.x, p.y) > rr * rr) continue;
      } else {
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        if (dx * dx + dy * dy > rr * rr) continue;
      }
      this._hitEnemy(p, e, w);
      p.hitSet.push(e.id);
      if (p.pierceLeft > 0) {
        p.pierceLeft--;
        continue;
      }
      if (p.bounceLeft > 0) {
        p.bounceLeft--;
        this._bounce(p, e, w);
        return;
      }
      p.dead = true;
      this._finish(p, true, w);
      return;
    }
  }

  _hitEnemy(p, e, w) {
    const owner = p.owner;
    const st = owner?.isPlayer ? owner.stats : null;
    let dmg = p.damage;
    if (p.crit) dmg *= st?.critMult ?? 1.75;
    const ang = Math.atan2(p.vy, p.vx);
    // Snap the impact point onto the target rim for sparks.
    const ix = e.x - Math.cos(ang) * e.r * 0.8;
    const iy = e.y - Math.sin(ang) * e.r * 0.8;
    const info = w._hitInfo;
    info.source = p.source;
    info.crit = p.crit;
    info.knockback = p.knockback;
    info.angle = ang;
    info.owner = owner;
    info.element = p.element;
    info.projectile = p;
    info.silent = false;
    info.noCombo = false;
    info.x = ix;
    info.y = iy;
    w.damageEnemy(e, dmg, info);
    info.projectile = null;
    info.owner = null;
    if (p.burn) w.applyBurn(e, p.burn.dps, p.burn.time ?? 3);
    if (st && !p.noBurnChance && st.burnChance > 0 && w.rng.next() < st.burnChance) {
      w.applyBurn(e, st.burnDps * st.damage, 3);
    }
    if (p.slow) w.applySlow(e, p.slow.amt ?? 0.3, p.slow.time ?? 1.5);
    if (st && st.explosive > 0 && p.source === 'primary' && !p.noExplosive) {
      w.explode(ix, iy, st.explosive * st.area, dmg * 0.35, {
        team: 'player',
        owner,
        source: 'explosive',
        visual: 'small',
        sound: 'explode_small',
        shake: 0,
        noCrit: true,
      });
    }
    w.fx.hitSpark?.(ix, iy, ang + PI, p.crit);
    if (p.onHit) p.onHit(p, e, w);
  }

  _bounce(p, e, w) {
    const near = this._near;
    near.length = 0;
    w.spatial.query(p.x, p.y, 300, near);
    let best = null;
    let bd = Infinity;
    for (let i = 0; i < near.length; i++) {
      const o = near[i];
      if (o === e || !o.alive || o.untargetable || o.phased) continue;
      const d = (o.x - p.x) ** 2 + (o.y - p.y) ** 2;
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    const a = best
      ? Math.atan2(best.y - p.y, best.x - p.x)
      : Math.atan2(p.vy, p.vx) + PI + (w.rng.next() - 0.5) * 1.2;
    p.angle = a;
    p.vx = Math.cos(a) * p.speed;
    p.vy = Math.sin(a) * p.speed;
    if (p.wave) {
      p.bx = p.x;
      p.by = p.y;
    }
    p.hitSet.length = 0;
    p.hitSet.push(e.id);
    p.life = p.t + Math.max(p.life - p.t, 0.6);
    w.fx.sparks?.(p.x, p.y, a, 4, '#ffe9a8', 0.8);
  }

  _collidePlayers(p, w) {
    const players = w.players;
    const pr = p.r * p.scale;
    for (let i = 0; i < players.length; i++) {
      const pl = players[i];
      if (!pl.alive) continue;
      const rr = pr + pl.hitR;
      const dx = pl.x - p.x;
      const dy = pl.y - p.y;
      if (dx * dx + dy * dy > rr * rr) continue;
      if (p.hitSet.length && p.hitSet.includes(-pl.index - 1)) continue;
      const info = w._pHitInfo;
      info.source = p.source;
      info.owner = p.owner;
      info.angle = Math.atan2(p.vy, p.vx);
      info.projectile = p;
      info.element = p.element;
      const landed = w.damagePlayer(pl, p.damage, info);
      info.projectile = null;
      info.owner = null;
      if (!landed) continue; // i-frames: shots pass through a boosting ship
      if (p.slow) pl.slowT = Math.max(pl.slowT, p.slow.time ?? 1);
      if (p.onHit) p.onHit(p, pl, w);
      if (p.pierceLeft > 0) {
        p.pierceLeft--;
        p.hitSet.push(-pl.index - 1);
        continue;
      }
      p.dead = true;
      this._finish(p, true, w);
      return;
    }
  }

  _land(p, w) {
    p.dead = true;
    p.z = 0;
    if (p.onLand) p.onLand(p, w);
    if (p.explode) {
      this._explode(p, w);
    } else if (!p.onLand) {
      // Plain lobbed shot: direct impact damage where it lands.
      if (p.team === 'player') {
        const near = this._near;
        near.length = 0;
        w.spatial.query(p.x, p.y, p.r * p.scale + 8, near);
        for (let i = 0; i < near.length; i++) {
          if (near[i].alive && !near[i].untargetable) this._hitEnemy(p, near[i], w);
        }
      } else {
        this._collidePlayers(p, w);
      }
      w.fx.smoke?.(p.x, p.y, 0.6);
    }
    p.alive = false;
  }

  _explode(p, w) {
    const ex = p.explode;
    const st = p.owner?.isPlayer ? p.owner.stats : null;
    const radius = ex.radius ?? 50;
    // p.damage is already scaled for enemy shots; an explicit ex.damage is scaled by explode().
    const enemy = p.team === 'enemy';
    w.explode(p.x, p.y, radius, ex.damage ?? p.damage, {
      dmgMult: enemy ? (ex.damage !== undefined ? p.dmgMult : 1) : undefined,
      team: p.team === 'enemy' ? (ex.team ?? 'enemy') : (ex.team ?? 'player'),
      owner: p.owner,
      source: p.source,
      falloff: ex.falloff,
      knockback: ex.knockback,
      visual: ex.visual,
      sound: ex.sound,
      shake: ex.shake,
      burn: ex.burn,
      clearBullets: ex.clearBullets,
      crit: p.crit && st ? st.critMult : undefined,
    });
  }

  /** Projectile ends: hooks + optional explosion. */
  _finish(p, allowExplode, w, expired = false) {
    if (!p.alive) return;
    p.alive = false;
    if (p.lob && !expired) {
      // Killed in flight: just fizzle.
      return;
    }
    if (expired && p.onExpire) p.onExpire(p, w);
    if (allowExplode && p.explode) this._explode(p, w);
  }

  _trail(p, dt, w) {
    p.trailT -= dt;
    if (p.trailT > 0) return;
    const tr = p.trail;
    if (typeof tr === 'function') {
      p.trailT = 0.03;
      tr(p, w);
      return;
    }
    p.trailT = TRAIL_EVERY[tr] ?? 0.03;
    const fx = w.fx;
    const back = p.angle + PI;
    switch (tr) {
      case 'smoke':
        fx.smokeTrail?.(p.x, p.y, 0.5 * p.scale);
        break;
      case 'steam':
        fx.steam?.(p.x, p.y, back, 0.5 * p.scale);
        break;
      case 'fire':
        fx.embers?.(p.x, p.y, 1);
        break;
      case 'aether':
        w.particles.spawn({
          x: p.x,
          y: p.y,
          vx: Math.cos(back) * 30 + (Math.random() - 0.5) * 30,
          vy: Math.sin(back) * 30 + (Math.random() - 0.5) * 30,
          life: 0.3,
          size: 7 * p.scale,
          size1: 1,
          color: '#7ff3ff',
          color1: '#33c9c0',
          blend: 'add',
          layer: 'add',
        });
        break;
      case 'spark':
      default:
        w.particles.spawn({
          x: p.x,
          y: p.y,
          vx: Math.cos(back) * 60 + (Math.random() - 0.5) * 60,
          vy: Math.sin(back) * 60 + (Math.random() - 0.5) * 60,
          life: 0.22,
          size: 3.5 * p.scale,
          size1: 0.5,
          color: p.team === 'enemy' ? '#ffb070' : '#fff3c4',
          color1: p.team === 'enemy' ? '#ff4d2e' : '#ffcf4a',
          blend: 'add',
          layer: 'add',
        });
    }
  }

  /**
   * Draw a projectile list. Additive glow pass first, then sprites, then custom draws.
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx, list, renderer) {
    if (!list.length) return;
    const w = this.world;
    const view = w._drawView;
    const x0 = view.x0;
    const y0 = view.y0;
    const x1 = view.x1;
    const y1 = view.y1;
    // Lob markers & ground shadows (world transform, plain paths).
    renderer.applyWorld(ctx);
    let anyLob = false;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.lob) {
        anyLob = true;
        break;
      }
    }
    if (anyLob) {
      const shadow = Sprites.get('fx_shadow');
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (!p.lob || !p.alive) continue;
        const L = p.lob;
        if (L.marker) {
          const k = Math.min(1, p.t / L.time);
          const rr = p.explode?.radius ?? 28;
          renderer.applyWorld(ctx);
          ctx.globalAlpha = 0.35 + 0.45 * k;
          ctx.strokeStyle = '#ff4d2e';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(L.tx, L.ty, rr, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 0.18 * k;
          ctx.fillStyle = '#ff4d2e';
          ctx.beginPath();
          ctx.arc(L.tx, L.ty, rr * k, 0, TAU);
          ctx.fill();
        }
        const sh = (p.r * p.scale * 2.4) / 32;
        renderer.blit(ctx, shadow, p.x + p.z * 0.25, p.y + p.z * 0.3, 0, sh * (1 - p.z / (L.height * 2.2)), 0.3);
      }
    }
    // Glow pass.
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.glow || !p.alive) continue;
      const py = p.y - p.z;
      if (p.x < x0 || p.x > x1 || py < y0 || py > y1) continue;
      const gs = glowSprite(p.glow);
      const pulse = 1 + 0.12 * Math.sin(p.t * 18 + p.id);
      renderer.blit(ctx, gs, p.x, py, 0, ((p.r * p.scale * p.glowSize) / 16) * pulse, 0.55 * p.alpha);
    }
    ctx.globalCompositeOperation = 'source-over';
    // Sprite pass.
    let custom = false;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.alive) continue;
      if (p.draw) {
        custom = true;
        continue;
      }
      const py = p.y - p.z;
      if (p.x < x0 || p.x > x1 || py < y0 || py > y1) continue;
      if (p._sf !== p.frame || !p._s) {
        p._s = Sprites.get(p.sprite, p.frame);
        p._sf = p.frame;
      }
      let sc = p.scale;
      if (p.lob) sc *= 1 + (0.6 * p.z) / Math.max(1, p.lob.height);
      renderer.blit(ctx, p._s, p.x, py, p.spin ? p.rot : p.angle, sc, p.alpha);
    }
    renderer.applyWorld(ctx);
    ctx.globalAlpha = 1;
    if (custom) {
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (!p.alive || !p.draw) continue;
        ctx.save();
        try {
          p.draw(ctx, p, w);
        } catch (err) {
          warnDraw(p, err);
          p.draw = null;
        }
        ctx.restore();
      }
    }
  }
}

function byPd(a, b) {
  return a._pd - b._pd;
}

const warnedDraw = new Set();
function warnDraw(p, err) {
  if (warnedDraw.has(p.source)) return;
  warnedDraw.add(p.source);
  console.error(`[projectiles] custom draw failed (${p.source}/${p.kind})`, err);
}
