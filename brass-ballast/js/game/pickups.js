// Pickups (DESIGN §2.13): aether shards (xp), cogs, repair, steam, bomb, crate.
// Pop out with velocity, bob, get magnetized within the collector's pickupRadius, collected
// within player.r + 10. XP & cogs vacuum to players at wave clear; XP merges past 400 shards.

import { Sprites } from '../gfx/sprites.js';
import { TAU } from '../core/math.js';

const LIFETIME = { xp: 60, cog: 45, repair: 30, steam: 30, bomb: 40, crate: 90 };

/** Sprite name for a pickup type/value. */
export function pickupSprite(type, value) {
  switch (type) {
    case 'xp':
      return value >= 5 ? 'pk_xp_big' : 'pk_xp';
    case 'cog':
      return value >= 10 ? 'pk_cog_big' : 'pk_cog';
    default:
      return `pk_${type}`;
  }
}

export class Pickup {
  constructor() {
    this.alive = false;
  }
}

export class PickupSystem {
  /** @param {import('./world.js').World} world */
  constructor(world) {
    this.world = world;
    this.pool = [];
    this.mergeT = 0;
    this.sparkT = 0;
  }

  /**
   * Spawn a pickup with a little pop velocity.
   * @param {'xp'|'cog'|'repair'|'steam'|'bomb'|'crate'} type
   * @returns {Pickup}
   */
  spawn(type, x, y, value = 1, opts = {}) {
    const w = this.world;
    const p = this.pool.pop() || new Pickup();
    const a = opts.angle ?? w.rng.angle();
    const sp = opts.speed ?? 40 + w.rng.next() * 120;
    p.type = type;
    p.value = value;
    p.x = x;
    p.y = y;
    p.vx = Math.cos(a) * sp;
    p.vy = Math.sin(a) * sp;
    p.t = 0;
    p.life = LIFETIME[type] ?? 40;
    p.alive = true;
    p.magnet = null; // player it's flying to
    p.mspeed = 0;
    p.phase = w.rng.next() * TAU;
    p.r = type === 'crate' ? 16 : value >= 5 ? 9 : 6;
    p.sprite = pickupSprite(type, value);
    p._s = null;
    p.scale = type === 'xp' && value >= 25 ? 1.45 : 1;
    p.delay = opts.delay ?? 0.25; // can't be collected for a moment (pop reads better)
    w.pickups.push(p);
    return p;
  }

  /** Fly every xp/cog (or all, when `all`) to the nearest living player. */
  vacuum(all = false) {
    const w = this.world;
    for (const p of w.pickups) {
      if (!p.alive) continue;
      if (!all && p.type !== 'xp' && p.type !== 'cog') continue;
      const pl = w.nearestPlayer(p.x, p.y);
      if (pl) {
        p.magnet = pl;
        p.mspeed = Math.max(p.mspeed, 500);
        p.delay = 0;
        p.life = Math.max(p.life, p.t + 10);
      }
    }
  }

  update(dt) {
    const w = this.world;
    const list = w.pickups;
    const players = w.players;
    this.mergeT -= dt;
    if (this.mergeT <= 0) {
      this.mergeT = 1;
      this._merge();
    }
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      if (p.alive) this._step(p, dt, w, players);
      if (!p.alive) {
        list[i] = list[list.length - 1];
        list.pop();
        p.magnet = null;
        if (this.pool.length < 1000) this.pool.push(p);
      }
    }
  }

  _step(p, dt, w, players) {
    p.t += dt;
    if (p.delay > 0) p.delay -= dt;
    if (p.t > p.life && !p.magnet) {
      p.alive = false;
      return;
    }
    // Find a magnet: any living player within pickupRadius.
    if (!p.magnet || !p.magnet.alive) {
      p.magnet = null;
      for (let j = 0; j < players.length; j++) {
        const pl = players[j];
        if (!pl.alive) continue;
        const rad = pl.stats.pickupRadius + pl.r;
        const dx = pl.x - p.x;
        const dy = pl.y - p.y;
        if (dx * dx + dy * dy < rad * rad) {
          p.magnet = pl;
          p.mspeed = Math.max(p.mspeed, 120);
          break;
        }
      }
    }
    if (p.magnet && p.delay <= 0) {
      const pl = p.magnet;
      const dx = pl.x - p.x;
      const dy = pl.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      p.mspeed = Math.min(1600, p.mspeed + 1400 * dt);
      const sp = p.mspeed + Math.hypot(pl.vx, pl.vy);
      p.vx = (dx / d) * sp;
      p.vy = (dy / d) * sp;
      if (d < pl.r + 10 + p.r) {
        this.collect(p, pl);
        return;
      }
    } else {
      const k = Math.exp(-3 * dt);
      p.vx *= k;
      p.vy *= k;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  /** Apply a pickup's effect to `pl`. */
  collect(p, pl) {
    const w = this.world;
    const run = w.run;
    const g = w.game;
    p.alive = false;
    let value = p.value;
    switch (p.type) {
      case 'xp':
        value = p.value * pl.stats.xpGain;
        g?.addXp?.(value);
        w.sfx('pickup_xp', p.x, p.y, { vol: 0.5, pitch: 0.9 + Math.min(0.6, run ? (run.xp / run.xpNext) * 0.6 : 0) });
        break;
      case 'cog': {
        value = p.value * pl.stats.cogGain;
        if (run) {
          run.cogFrac = (run.cogFrac || 0) + value;
          const whole = Math.floor(run.cogFrac);
          run.cogFrac -= whole;
          run.cogs += whole;
        }
        w.sfx('pickup_cog', p.x, p.y, { vol: 0.55 });
        break;
      }
      case 'repair':
        value = pl.stats.maxHp * 0.25;
        w.healPlayer(pl, value);
        w.sfx('pickup_repair', p.x, p.y);
        break;
      case 'steam':
        pl.steam = pl.stats.steamMax;
        w.floatText(pl.x, pl.y - 40, 'Steam!', { color: '#9fe6ff', size: 15 });
        w.sfx('pickup_steam', p.x, p.y);
        break;
      case 'bomb':
        if (pl.bombs < pl.stats.bombsMax) {
          pl.bombs++;
          w.floatText(pl.x, pl.y - 40, '+1 Bomb', { color: '#ffcf4a', size: 15 });
        } else if (run) {
          run.score += 250;
          w.floatText(pl.x, pl.y - 40, '+250', { color: '#ffcf4a', size: 14 });
        }
        w.sfx('pickup_bomb', p.x, p.y);
        break;
      case 'crate':
        w.sfx('pickup_crate', p.x, p.y);
        w.fx.shockwave?.(p.x, p.y, 80, '#ffcf4a', 0.4);
        g?.openCrate?.(pl);
        break;
      default:
        break;
    }
    if (run) run.pickups++;
    if (p.type === 'xp' || p.type === 'cog') {
      if (p.value >= 5 || Math.random() < 0.35) w.fx.pickup?.(p.x, p.y, p.type === 'xp' ? '#4fe3d0' : '#ffcf4a');
    } else {
      w.fx.flare?.(p.x, p.y, 30, '#fff3c4');
      w.fx.pickup?.(p.x, p.y, p.type === 'repair' ? '#7dff8a' : p.type === 'steam' ? '#9fe6ff' : '#ffcf4a');
    }
    w.events.emit('pickup:collect', { player: pl, type: p.type, value });
  }

  /** Merge XP shards when too many are on the field (keeps perf & readability). */
  _merge() {
    const w = this.world;
    const list = w.pickups;
    let n = 0;
    for (let i = 0; i < list.length; i++) if (list[i].type === 'xp' && list[i].alive) n++;
    if (n <= 400) return;
    // Bucket into 160-unit cells and fold each cell into its first shard.
    const cells = new Map();
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.type !== 'xp' || !p.alive || p.magnet) continue;
      const k = Math.floor(p.x / 160) * 100003 + Math.floor(p.y / 160);
      const first = cells.get(k);
      if (!first) {
        cells.set(k, p);
        continue;
      }
      first.value += p.value;
      first.life = Math.max(first.life, p.life);
      p.alive = false;
    }
    for (const p of cells.values()) {
      p.sprite = pickupSprite('xp', p.value);
      p._s = null;
      p.scale = p.value >= 25 ? 1.45 : 1;
      p.r = p.value >= 5 ? 9 : 6;
    }
  }

  /** @param {CanvasRenderingContext2D} ctx */
  draw(ctx, renderer) {
    const w = this.world;
    const list = w.pickups;
    if (!list.length) return;
    const v = w._drawView;
    const t = w.time;
    const shadow = Sprites.get('fx_shadow');
    // Shadows.
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.alive || p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1) continue;
      renderer.blit(ctx, shadow, p.x + 7, p.y + 9, 0, (p.r * 2.2 * p.scale) / 32, 0.22);
    }
    // Glints (additive) for shards & crates.
    const glow = Sprites.has('fx_glow') ? Sprites.get('fx_glow') : null;
    if (glow) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (!p.alive || p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1) continue;
        if (p.type !== 'xp' && p.type !== 'crate' && p.type !== 'repair') continue;
        const bob = Math.sin(t * 4 + p.phase) * 2.5;
        const a = 0.25 + 0.15 * Math.sin(t * 6 + p.phase);
        renderer.blit(ctx, glow, p.x, p.y + bob - 3, 0, (p.r * 3.4 * p.scale) / 32, a);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.alive || p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1) continue;
      if (!p._s) p._s = Sprites.get(p.sprite);
      const bob = Math.sin(t * 4 + p.phase) * 2.5;
      const fade = p.life - p.t < 4 && !p.magnet ? (Math.sin(p.t * 20) > 0 ? 0.35 : 1) : 1;
      const rot = p.type === 'cog' ? t * 1.5 + p.phase : p.type === 'xp' ? Math.sin(t * 2 + p.phase) * 0.3 : 0;
      const pop = p.t < 0.2 ? 0.6 + p.t * 2 : 1;
      renderer.blit(ctx, p._s, p.x, p.y + bob - 3, rot, p.scale * pop, fade);
    }
    renderer.applyWorld(ctx);
    ctx.globalAlpha = 1;
  }
}
