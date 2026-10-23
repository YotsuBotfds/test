// FX helper library (WP3) — DESIGN §4.15 & §7. Exported through js/gfx/particles.js.
//
// Turns gameplay moments into layered particles + vector effects + floating text:
//   explosion  = flash flare + light bloom + additive fireball billows + hot core
//                + expanding drifting smoke + spark streaks + embers + spinning debris
//                + brass cogs + shockwave ring, all scaled by `size`.
//   bigExplosion = staged multi-burst over ~0.6 s (see _runTimer).
// Everything goes through Particles.emit() (allocation-free) and is thinned automatically when
// quality is 'low' or the pool is nearly full. See the contract at the top of particles.js.

import { Save } from '../core/storage.js';
import { PF, lowQuality, flashScale, particleScale } from './fx-common.js';
import { TEX, parseColor, lerpRgb, texFrames, prewarmTextures, prewarmRamp } from './fx-textures.js';
import { Effects } from './fx-effects.js';
import { FloatTexts } from './fx-text.js';
import { Sprites } from './sprites.js';

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const rint = (n) => (Math.random() * n) | 0;

const L_LOW = 0;
const L_NORMAL = 1;
const L_ADD = 2;

const GLOW = PF.ADD | PF.TINT;
const SMOKE = PF.TINT | PF.FADEIN | PF.LATE | PF.WIND;

/**
 * Explosion palettes (packed 0xRRGGBB). `opts.palette` picks one; `opts.color` derives one.
 * flash → hot → mid → end is the fireball ramp; smoke/smoke1 the after-smoke.
 */
export const PALETTES = {
  fire: {
    flash: 0xfff4d6, hot: 0xffde80, mid: 0xff8a24, end: 0xc23a16, spark: 0xffc860, spark1: 0xff5a14,
    ember: 0xff8a2a, smoke: 0x8c8278, smoke1: 0x4a443e, ring: 0xffa452,
  },
  enemy: {
    flash: 0xffe6d6, hot: 0xffd2a0, mid: 0xff4d2e, end: 0x8c1a2b, spark: 0xffd2a0, spark1: 0xff3d8b,
    ember: 0xff5a3a, smoke: 0x6e5e62, smoke1: 0x352c30, ring: 0xff6a4a,
  },
  aether: {
    flash: 0xf0ffff, hot: 0xc8fdff, mid: 0x33c9c0, end: 0x1d5a86, spark: 0xd8feff, spark1: 0x33c9c0,
    ember: 0x7ff3ff, smoke: 0x6f8c96, smoke1: 0x3a4a52, ring: 0x7ff3ff, glowy: true,
  },
  brass: {
    flash: 0xfffbe6, hot: 0xfff3c4, mid: 0xffcf4a, end: 0xb4643c, spark: 0xfff3c4, spark1: 0xffb02e,
    ember: 0xffd36b, smoke: 0x8e8270, smoke1: 0x4a4238, ring: 0xffd36b,
  },
  plasma: {
    flash: 0xfff0fa, hot: 0xffc4e4, mid: 0xff3d8b, end: 0x6a1a5a, spark: 0xffd0ea, spark1: 0xff3d8b,
    ember: 0xff6ab0, smoke: 0x6e5a6e, smoke1: 0x382c38, ring: 0xff7ab8, glowy: true,
  },
  steam: {
    flash: 0xffffff, hot: 0xffffff, mid: 0xe8f4ff, end: 0x9fb4c4, spark: 0xffffff, spark1: 0x9fe6ff,
    ember: 0xd8f4ff, smoke: 0xd8d4cc, smoke1: 0x8c8880, ring: 0xe8f8ff,
  },
  toxic: {
    flash: 0xf4ffe0, hot: 0xe2ff9a, mid: 0x9ad93a, end: 0x3d6a1a, spark: 0xeaffb0, spark1: 0x8ad13a,
    ember: 0xb6ff5a, smoke: 0x4f5a3c, smoke1: 0x262c1c, ring: 0xc6ff7a,
  },
};

/**
 * Visual scale for an explosion of nominal `size`: linear up to 1.2, then sub-linear and capped.
 * Gameplay radius is shown by the (cheap, vector) shockwave; fill-rate stays bounded however
 * big the blast — eight bomb-sized blasts used to stall the frame for whole seconds.
 */
export function visualSize(size) {
  return size <= 1.2 ? size : Math.min(2.4, 1.2 + Math.sqrt(size - 1.2) * 0.75);
}

/** Explosion "weight" the FX layer will draw at full detail per ~0.1 s before thinning. */
const BOOM_BUDGET = 6;

const derived = new Map();
function paletteFor(opts) {
  if (!opts) return PALETTES.fire;
  if (opts.color !== undefined) {
    const c = parseColor(opts.color);
    let p = derived.get(c);
    if (!p) {
      p = {
        flash: lerpRgb(c, 0xffffff, 0.85),
        hot: lerpRgb(c, 0xffffff, 0.6),
        mid: c,
        end: lerpRgb(c, 0x000000, 0.45),
        spark: lerpRgb(c, 0xffffff, 0.7),
        spark1: c,
        ember: lerpRgb(c, 0xffffff, 0.25),
        smoke: lerpRgb(lerpRgb(c, 0x5a5550, 0.8), 0x000000, 0.1),
        smoke1: 0x2a2624,
        ring: lerpRgb(c, 0xffffff, 0.4),
      };
      if (derived.size > 64) derived.clear();
      derived.set(c, p);
    }
    return p;
  }
  if (typeof opts.palette === 'object' && opts.palette) return { ...PALETTES.fire, ...opts.palette };
  return PALETTES[opts.palette] || PALETTES.fire;
}

/** Debris kinds → [tex, frame] choices (own 'scrap' sheet: 0 plank 1 plate 2 nut 3 bracket 4 canvas 5 pipe). */
const DEBRIS_KINDS = {
  wood: [0, 0, 0, 4],
  metal: [1, 1, 2, 5],
  iron: [1, 1, 2, 5],
  brass: [3, 3, 2, 5],
  canvas: [4, 4, 0],
  mixed: [0, 1, 2, 3, 4, 5, 0, 1],
  syndicate: [1, 1, 2, 2, 5, 3],
};

export class FX {
  /** @param {import('./particles.js').Particles} particles */
  constructor(particles) {
    this.particles = particles;
    this.p = particles;
    this.effects = new Effects();
    this.floats = new FloatTexts();
    /** Back-compat with the stub: `fx.texts` is the live text list. */
    this.texts = this.floats.list;
    this.timers = [];
    this.time = 0;
    /** Recent explosion load (decays); above BOOM_BUDGET new blasts are thinned. */
    this._boom = 0;
    this._thin = 1;
  }

  /** Total live effects + texts (debug). */
  get count() {
    return this.effects.count + this.floats.count;
  }

  /** Render textures & common tints up front (call once during boot; optional). */
  prewarm() {
    try {
      const c = [];
      for (const k of Object.keys(PALETTES)) {
        const p = PALETTES[k];
        c.push(p.hot, p.mid, p.end, p.smoke, p.spark);
      }
      prewarmTextures(c);
      // the ramps every explosion uses, so the first big fight never hitches on tinting
      for (const k of ['fire', 'enemy']) {
        const p = PALETTES[k];
        prewarmRamp(TEX.steam, p.hot, p.end);
        prewarmRamp(TEX.smoke, p.hot, p.mid);
        prewarmRamp(TEX.smoke, p.smoke, p.smoke1);
        prewarmRamp(TEX.streak, p.spark, p.spark1);
        prewarmRamp(TEX.flare, p.flash, p.mid);
        prewarmRamp(TEX.soft, p.mid, p.end);
      }
      prewarmRamp(TEX.smoke, 0xf0e8dc, 0x9a9088);
      for (let i = 0; i <= 20; i++) this.floats._bitmap(String(i), '#fff3df', 14, 0);
    } catch (err) {
      console.warn('[fx] prewarm failed', err);
    }
  }

  // -------------------------------------------------------------------------------------------
  // frame

  update(dt) {
    if (!(dt > 0)) return;
    this.time += dt;
    this._boom = Math.max(0, this._boom - dt * 40);
    if (this._boom <= BOOM_BUDGET) this._thin = 1;
    const T = this.timers;
    if (T.length) {
      for (let i = 0; i < T.length; ) {
        if (T[i].at <= this.time) {
          const job = T[i];
          T[i] = T[T.length - 1];
          T.pop();
          this._runTimer(job);
        } else i++;
      }
    }
    this.effects.reduceFlashes = flashScale() < 1;
    this.effects.update(dt);
    this.floats.update(dt);
  }

  drawEffects(ctx, renderer) {
    this.effects.draw(ctx, renderer);
  }

  drawTexts(ctx, renderer) {
    this.floats.draw(ctx, renderer);
  }

  clear() {
    this.timers.length = 0;
    this.effects.clear();
    this.floats.clear();
    this.particles.clear();
  }

  // -------------------------------------------------------------------------------------------
  // internals

  /** Scale a nominal spawn count by quality & pool load, with stochastic rounding. */
  _n(k) {
    let q = particleScale() * this._thin;
    const load = this.p.load;
    if (load > 0.9) q *= 0.3;
    else if (load > 0.7) q *= 0.6;
    const v = k * q;
    return Math.floor(v + Math.random());
  }

  _later(delay, kind, x, y, size, opts) {
    if (this.timers.length > 96) return;
    this.timers.push({ at: this.time + delay, kind, x, y, size, opts });
  }

  _runTimer(j) {
    switch (j.kind) {
      case 'explosion':
        this.explosion(j.x, j.y, j.size, j.opts);
        break;
      case 'bigFinale':
        this._bigFinale(j.x, j.y, j.size, j.opts);
        break;
      case 'flare':
        this.flare(j.x, j.y, j.size, j.opts?.color);
        break;
      case 'shock':
        this.shockwave(j.x, j.y, j.size, j.opts?.color, j.opts?.life);
        break;
      default:
    }
  }

  // -------------------------------------------------------------------------------------------
  // explosions

  /**
   * Layered explosion sized by `size` (1 ≈ a skirmisher, 2–3 warships).
   * @param {number} x
   * @param {number} y
   * @param {number} [size]
   * @param {{palette?:string|object, color?:string, ring?:boolean, smoke?:boolean,
   *   debris?:false|string, debrisCount?:number, cogs?:number|boolean, sparks?:boolean,
   *   flash?:boolean, embers?:boolean, lowSmoke?:boolean, rings?:boolean}} [opts]
   *   (rings:false — bigExplosion skips its extra shock rings; world.explode draws its own)
   */
  explosion(x, y, size = 1, opts = {}) {
    const P = this.p;
    const s = visualSize(Math.max(0.15, size));
    const pal = paletteFor(opts);
    const fs = flashScale();
    const sq = Math.sqrt(s);
    // Per-moment budget: a pile-up of blasts in the same instant gets progressively thinner.
    this._boom += s;
    const over = this._boom > BOOM_BUDGET;
    this._thin = over ? Math.max(0.15, BOOM_BUDGET / this._boom) : 1;

    // 1. flash & light bloom (kept modest: additive over a bright sky blows out to white fast)
    if (opts.flash !== false) {
      P.emit(L_ADD, TEX.flare, x, y, 0, 0, 0.06 + 0.03 * sq, 50 * s, 90 * s, pal.flash, pal.mid, 0.75 * fs, GLOW);
      P.ex(0, Math.random() * TAU);
      if (!over) {
        P.emit(L_ADD, TEX.soft, x, y, 0, 0, 0.26 + 0.1 * sq, 90 * s, 150 * s, pal.mid, pal.end, 0.32 * fs, GLOW);
      }
    }
    // 2. fireball body: shaded billows, alpha-blended so the fire keeps its colour on any sky
    for (let i = 0, n = this._n(6 + 7 * s); i < n; i++) {
      const a = Math.random() * TAU;
      const d = Math.random();
      const sp = (25 + 135 * d) * sq;
      const s0 = rnd(14, 22) * s * (1.2 - d * 0.4);
      P.emit(pal.glowy ? L_ADD : L_NORMAL, TEX.steam, x + Math.cos(a) * 4 * s, y + Math.sin(a) * 4 * s, Math.cos(a) * sp,
        Math.sin(a) * sp, rnd(0.34, 0.62) * (0.85 + 0.15 * s), s0, s0 * rnd(1.8, 2.5), pal.hot, pal.end,
        pal.glowy ? 0.8 : 0.95, pal.glowy ? GLOW | PF.LATE : PF.TINT | PF.LATE);
      P.ex(3.4, Math.random() * TAU, rnd(-2, 2), rint(3));
    }
    // 3. incandescent licks on top (additive, short) + white-hot core
    for (let i = 0, n = this._n(3 + 4 * s); i < n; i++) {
      const a = Math.random() * TAU;
      const sp = rnd(20, 120) * sq;
      const s0 = rnd(12, 20) * s;
      P.emit(L_ADD, TEX.smoke, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.16, 0.32), s0, s0 * 1.8, pal.hot,
        pal.mid, 0.7, GLOW);
      P.ex(3, Math.random() * TAU, rnd(-3, 3), rint(3));
    }
    for (let i = 0, n = this._n(1 + s); i < n; i++) {
      P.emit(L_ADD, TEX.glow, x + rnd(-6, 6) * s, y + rnd(-6, 6) * s, 0, 0, rnd(0.1, 0.18), rnd(22, 32) * s,
        rnd(8, 14) * s, 0xffffff, pal.hot, 0.9, GLOW);
    }
    // 4. after-smoke: billows that bloom as the fire dies, then drift with the wind
    if (opts.smoke !== false) {
      for (let i = 0, n = this._n(5 + 6 * s); i < n; i++) {
        const a = Math.random() * TAU;
        const sp = rnd(18, 85) * sq;
        const s0 = rnd(18, 28) * s;
        const shade = rint(3) * 0.15;
        // Lingering after-smoke goes under the ships ('low'): over them it hid the player.
        P.emit(L_LOW, TEX.smoke, x + Math.cos(a) * 8 * s, y + Math.sin(a) * 8 * s, Math.cos(a) * sp,
          Math.sin(a) * sp, rnd(1.2, 2.3) * (0.8 + 0.2 * s), s0, s0 * rnd(2.4, 3.4),
          lerpRgb(pal.smoke, 0x8a7f74, shade), pal.smoke1, rnd(0.45, 0.62), SMOKE);
        P.ex(1.5, Math.random() * TAU, rnd(-0.7, 0.7), rint(3));
      }
      // lingering haze under the ships
      if (opts.lowSmoke !== false && s >= 0.7 && !over && !lowQuality()) {
        for (let i = 0, n = this._n(1 + s); i < n; i++) {
          const s0 = rnd(40, 60) * s;
          P.emit(L_LOW, TEX.smoke, x + rnd(-15, 15) * s, y + rnd(-15, 15) * s, rnd(-12, 12), rnd(-12, 12),
            rnd(2.4, 3.6), s0, s0 * 2.1, pal.smoke, pal.smoke1, 0.38, SMOKE);
          P.ex(0.6, Math.random() * TAU, rnd(-0.25, 0.25), rint(3));
        }
      }
    }
    // 5. spark streaks
    if (opts.sparks !== false) {
      for (let i = 0, n = this._n(10 + 12 * s); i < n; i++) {
        const a = Math.random() * TAU;
        const sp = rnd(220, 640) * sq;
        P.emit(L_ADD, TEX.streak, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.25, 0.6), rnd(2.4, 4.2),
          0.6, pal.spark, pal.spark1, 1, GLOW | PF.STRETCH | PF.SHRINK);
        P.ex(2.6, 0, 0, 0, 0.035);
      }
    }
    // 6. embers
    if (opts.embers !== false) this.embers(x, y, Math.round(3 + 5 * s), { color: pal.ember, speed: 140 * sq });
    // 7. debris & cogs
    if (opts.debris !== false) {
      const kind = typeof opts.debris === 'string' ? opts.debris : 'mixed';
      this.debris(x, y, opts.debrisCount ?? Math.round(2 + 4 * s), kind, { speed: 260 * sq, scale: 0.8 + 0.25 * s });
    }
    const cogs = opts.cogs === true ? Math.round(2 + s) : opts.cogs ?? (s >= 0.9 ? Math.round(s) : 0);
    if (cogs > 0) this.cogs(x, y, cogs, { speed: 240 * sq });
    // 8. shockwave
    if (opts.ring !== false) this.shockwave(x, y, 62 * s, pal.ring, 0.3 + 0.08 * sq, { alpha: 0.7 });
  }

  /** Staged, multi-burst explosion over ~0.6 s for bosses, big warships and ballast bombs. */
  bigExplosion(x, y, size = 1, opts = {}) {
    const s = Math.max(0.3, size);
    const pal = paletteFor(opts);
    const v = visualSize(s);
    this.explosion(x, y, s * 1.5, { ...opts, cogs: Math.round(3 + 2 * v), debrisCount: Math.round(6 + 5 * v) });
    // Extra rings only when not part of a pile-up (or when the caller draws its own wave).
    const extra = opts.rings !== false && this._thin >= 1;
    this.flare(x, y, 150 * v, pal.flash, 0.2);
    if (extra) {
      this.shockwave(x, y, 170 * v, pal.ring, 0.6, { alpha: 0.8 });
      this.ring(x, y, 120 * v, pal.ring, 0.35, { width: 3 * v, r0: 20 * v });
    }
    const subs = this._thin < 1 ? 2 : 4 + Math.round(v);
    for (let i = 0; i < subs; i++) {
      const a = Math.random() * TAU;
      const d = rnd(20, 60) * v;
      this._later(0.07 + (i / subs) * 0.42 + rnd(0, 0.05), 'explosion', x + Math.cos(a) * d, y + Math.sin(a) * d,
        v * rnd(0.5, 0.85), { ...opts, ring: i % 2 === 0, cogs: 0, debris: i % 2 ? false : opts.debris, lowSmoke: false });
    }
    if (extra) this._later(0.3, 'shock', x, y, 230 * v, { color: pal.ring, life: 0.7 });
    this._later(0.58, 'bigFinale', x, y, v, opts);
  }

  _bigFinale(x, y, s, opts) {
    const P = this.p;
    this._boom += s;
    this._thin = this._boom > BOOM_BUDGET ? Math.max(0.15, BOOM_BUDGET / this._boom) : 1;
    const pal = paletteFor(opts);
    const fs = flashScale();
    P.emit(L_ADD, TEX.flare, x, y, 0, 0, 0.16, 110 * s, 220 * s, pal.flash, pal.mid, 0.6 * fs, GLOW);
    P.ex(0, Math.random() * TAU);
    // smoke wall rolling outward
    const n = this._n(10 + 4 * s);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rnd(-0.1, 0.1);
      const sp = rnd(110, 170) * Math.sqrt(s);
      const s0 = rnd(22, 32) * s;
      P.emit(L_LOW, TEX.smoke, x + Math.cos(a) * 30 * s, y + Math.sin(a) * 30 * s, Math.cos(a) * sp,
        Math.sin(a) * sp, rnd(1.4, 2.2), s0, s0 * 2.4, lerpRgb(pal.smoke, 0x9a9088, 0.3), pal.smoke1, 0.38, SMOKE);
      P.ex(1.4, Math.random() * TAU, rnd(-0.5, 0.5), rint(3));
    }
    this.embers(x, y, Math.round(14 + 8 * s), { color: pal.ember, speed: 320 * Math.sqrt(s) });
    this.sparks(x, y, 0, Math.round(16 + 8 * s), pal.spark, TAU, { speed: 700 * Math.sqrt(s), color1: pal.spark1 });
    this.cogs(x, y, Math.round(2 + 2 * s), { speed: 340 });
  }

  /**
   * Gameplay-radius blast: picks explosion vs bigExplosion and adds a shockwave whose radius
   * matches the AoE so players can read it. Handy for world.explode().
   */
  blast(x, y, radius, opts = {}) {
    const size = Math.max(0.4, radius / 70);
    if (radius >= 150 || opts.big) this.bigExplosion(x, y, size * 0.75, opts);
    else this.explosion(x, y, size, { ...opts, ring: false });
    const pal = paletteFor(opts);
    this.shockwave(x, y, radius, pal.ring, 0.35 + radius / 900);
  }

  // -------------------------------------------------------------------------------------------
  // weapons & impacts

  /** Cannon muzzle flash: flame tongue + white core + bloom + smoke puffs + 2 sparks. */
  muzzle(x, y, angle = 0, size = 1, color = '#ffd36b') {
    const P = this.p;
    const c = parseColor(color);
    const fs = flashScale();
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const s = size;
    const len = rnd(34, 44) * s;
    const hot = lerpRgb(c, 0xffffff, 0.55);
    // flame body (alpha-blended so it keeps its colour on bright skies) + additive hot core
    P.emit(L_NORMAL, TEX.muzzle, x + ca * len * 0.45, y + sa * len * 0.45, ca * 40, sa * 40, rnd(0.085, 0.11), len,
      len * 1.25, hot, lerpRgb(c, 0xc8401a, 0.7), 1, PF.TINT);
    P.ex(0, angle);
    P.emit(L_ADD, TEX.muzzle, x + ca * len * 0.3, y + sa * len * 0.3, ca * 40, sa * 40, 0.06, len * 0.7, len * 0.8,
      0xffffff, c, 0.9, GLOW);
    P.ex(0, angle);
    P.emit(L_ADD, TEX.glow, x + ca * 3 * s, y + sa * 3 * s, 0, 0, 0.07, 16 * s, 8 * s, 0xffffff, c, 1, GLOW);
    P.emit(L_ADD, TEX.soft, x, y, 0, 0, 0.11, 46 * s, 70 * s, c, lerpRgb(c, 0xff5a1a, 0.6), 0.3 * fs, GLOW);
    // cannon smoke: forward cone + a little blow-back on the flanks
    for (let i = 0, n = this._n(4 * Math.min(2, s)); i < n; i++) {
      const a = angle + (i === 0 ? Math.PI * 0.5 : i === 1 ? -Math.PI * 0.5 : rnd(-0.4, 0.4));
      const sp = (i < 2 ? rnd(30, 60) : rnd(70, 170)) * s;
      const s0 = rnd(6, 9) * s;
      P.emit(L_NORMAL, TEX.smoke, x + ca * 6 * s, y + sa * 6 * s, Math.cos(a) * sp, Math.sin(a) * sp,
        rnd(0.45, 0.8), s0, s0 * rnd(2.6, 3.6), 0xf0e8dc, 0x9a9088, 0.5, SMOKE);
      P.ex(4.5, Math.random() * TAU, rnd(-1.5, 1.5), rint(3));
    }
    for (let i = 0, n = this._n(2); i < n; i++) {
      const a = angle + rnd(-0.28, 0.28);
      const sp = rnd(320, 520);
      P.emit(L_ADD, TEX.streak, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.08, 0.16), 2.2, 0.5,
        0xffffff, c, 1, GLOW | PF.STRETCH);
      P.ex(5, 0, 0, 0, 0.03);
    }
  }

  /**
   * Spark streaks fanning around `angle` (spread = total cone in radians; TAU = all round).
   * @param {object} [o] {speed, color1, life, size}
   */
  sparks(x, y, angle = 0, count = 6, color = '#ffd36b', spread = 0.6, o = {}) {
    const P = this.p;
    const c = parseColor(color);
    const c1 = o.color1 !== undefined ? parseColor(o.color1) : lerpRgb(c, 0xff4a10, 0.65);
    const spd = o.speed ?? 380;
    const life = o.life ?? 0.32;
    const sz = o.size ?? 2.6;
    for (let i = 0, n = this._n(count); i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const sp = spd * rnd(0.45, 1.1);
      P.emit(L_ADD, TEX.streak, x, y, Math.cos(a) * sp, Math.sin(a) * sp, life * rnd(0.6, 1.3), sz * rnd(0.8, 1.3),
        0.5, c, c1, 1, GLOW | PF.STRETCH | PF.SHRINK);
      P.ex(3.2, 0, 0, 0, 0.032);
    }
  }

  /**
   * Bullet impact. `angle` is the direction the sparks spray (usually back toward the shooter,
   * i.e. projectile heading + PI — same convention as sparks()).
   * Crits add a gold star flare, a ring and extra sparks.
   */
  hitSpark(x, y, angle = 0, crit = false, color) {
    const P = this.p;
    const back = angle;
    const c = color !== undefined ? parseColor(color) : crit ? 0xffcf4a : 0xfff0c0;
    const fs = flashScale();
    P.emit(L_ADD, TEX.glint, x, y, 0, 0, crit ? 0.14 : 0.08, crit ? 30 : 15, crit ? 44 : 8, 0xffffff, c, fs, GLOW);
    P.ex(0, Math.random() * TAU);
    P.emit(L_ADD, TEX.glow, x, y, 0, 0, 0.1, crit ? 34 : 18, crit ? 20 : 10, c, lerpRgb(c, 0xff5a1a, 0.7), 0.7 * fs, GLOW);
    this.sparks(x, y, back, crit ? 9 : 4, c, crit ? 2.4 : 1.5, { speed: crit ? 480 : 340, life: crit ? 0.32 : 0.22 });
    if (crit) {
      this.ring(x, y, 26, 0xffcf4a, 0.22, { width: 2, r0: 6 });
      P.emit(L_ADD, TEX.flare, x, y, 0, 0, 0.18, 40, 70, 0xfffbe6, 0xffb02e, 0.8 * fs, GLOW);
      P.ex(0, Math.PI / 4);
    }
    // a whiff of impact smoke
    if (Math.random() < 0.5) {
      const s0 = rnd(5, 8);
      P.emit(L_NORMAL, TEX.smoke, x, y, Math.cos(back) * 30, Math.sin(back) * 30, rnd(0.35, 0.55), s0, s0 * 2.5,
        0xcfc6b8, 0x6e665e, 0.35, SMOKE);
      P.ex(3, Math.random() * TAU, rnd(-1, 1), rint(3));
    }
  }

  /** Small AoE impact (mortar shell landing, rocket hit) — puff, flash, ring, no debris. */
  impact(x, y, size = 1, color) {
    this.explosion(x, y, size * 0.6, { color, debris: false, cogs: 0, lowSmoke: false, embers: size > 0.8 });
  }

  /** Bright additive flare (+ soft bloom). */
  flare(x, y, size = 40, color = '#fff3c4', life = 0.18) {
    const P = this.p;
    const c = parseColor(color);
    const fs = flashScale();
    P.emit(L_ADD, TEX.flare, x, y, 0, 0, life, size, size * 1.4, 0xffffff, c, fs, GLOW);
    P.ex(0, Math.random() * TAU);
    P.emit(L_ADD, TEX.soft, x, y, 0, 0, life * 1.4, size * 1.2, size * 1.8, c, c, 0.3 * fs, GLOW);
  }

  /** Alias for flare (reads nicer at call sites). */
  flash(x, y, size, color, life) {
    this.flare(x, y, size, color, life);
  }

  /** One glowing dot — projectile trails, sparkles. Cheap; call per frame. */
  trail(x, y, color = '#ffd36b', size = 6, life = 0.22) {
    const c = parseColor(color);
    this.p.emit(L_ADD, TEX.glow, x, y, 0, 0, life, size, size * 0.3, c, lerpRgb(c, 0x000000, 0.4), 0.8, GLOW);
  }

  // -------------------------------------------------------------------------------------------
  // smoke, steam, fire

  /**
   * Smoke puffs. opts: {count, color, color1, life, vx, vy, alpha, spread, layer:'low'|'normal'}
   */
  smoke(x, y, size = 1, opts = {}) {
    const P = this.p;
    const c0 = opts.color !== undefined ? parseColor(opts.color) : opts.dark ? 0x3e3834 : 0x7a7068;
    const c1 = opts.color1 !== undefined ? parseColor(opts.color1) : lerpRgb(c0, 0x000000, 0.45);
    const layer = opts.layer === 'low' ? L_LOW : L_NORMAL;
    const n = this._n(opts.count ?? 2);
    const spread = opts.spread ?? 30;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = Math.random() * spread * size;
      const s0 = rnd(10, 16) * size;
      P.emit(layer, TEX.smoke, x + rnd(-4, 4) * size, y + rnd(-4, 4) * size, (opts.vx || 0) + Math.cos(a) * sp,
        (opts.vy || 0) + Math.sin(a) * sp, (opts.life ?? 1.4) * rnd(0.75, 1.25), s0, s0 * rnd(2.2, 3),
        c0, c1, opts.alpha ?? 0.55, SMOKE);
      P.ex(1.2, Math.random() * TAU, rnd(-0.6, 0.6), rint(3));
    }
  }

  /** Single trailing puff for damaged ships / rockets (call every frame or two). */
  smokeTrail(x, y, size = 1, opts = {}) {
    const P = this.p;
    if (this._n(1) < 1) return;
    const s0 = rnd(7, 11) * size;
    const dark = opts.color !== undefined ? parseColor(opts.color) : Math.random() < 0.35 ? 0x302a26 : 0x5a524a;
    P.emit(L_NORMAL, TEX.smoke, x + rnd(-3, 3) * size, y + rnd(-3, 3) * size, rnd(-14, 14), rnd(-14, 14),
      rnd(1.1, 1.8) * (opts.life ?? 1), s0, s0 * rnd(3.4, 4.6), dark, 0x6e665e, opts.alpha ?? 0.45, SMOKE);
    P.ex(0.8, Math.random() * TAU, rnd(-0.8, 0.8), rint(3));
    if (opts.fire && Math.random() < 0.5) {
      P.emit(L_ADD, TEX.smoke, x, y, rnd(-10, 10), rnd(-10, 10), rnd(0.15, 0.3), 6 * size, 12 * size, 0xffe7a3,
        0xb8301a, 0.8, GLOW);
      P.ex(2, Math.random() * TAU, 0, rint(3));
    }
  }

  /** Steam jet along `angle` (boost puffs, vents, boilers). */
  steam(x, y, angle = 0, size = 1, opts = {}) {
    const P = this.p;
    const spread = opts.spread ?? 0.5;
    for (let i = 0, n = this._n(opts.count ?? 3); i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const sp = rnd(70, 190) * size * (opts.speed ?? 1);
      const s0 = rnd(7, 11) * size;
      P.emit(L_NORMAL, TEX.steam, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.5, 0.9), s0, s0 * rnd(3, 4),
        0xffffff, 0xaab6c0, opts.alpha ?? 0.7, SMOKE);
      P.ex(3.2, Math.random() * TAU, rnd(-1.5, 1.5));
    }
  }

  /** Radial steam burst (boost dash, vent aura pulses). */
  steamBurst(x, y, size = 1, count = 12) {
    const n = this._n(count);
    for (let i = 0; i < n; i++) this.steam(x, y, (i / n) * TAU, size * 0.9, { count: 2, spread: 0.35 });
    this.ring(x, y, 46 * size, '#e8f8ff', 0.3, { width: 2.5, r0: 10, add: false });
  }

  /** Burning: flame licks + soot. Call per frame on burning things (cheap, thinned by load). */
  burn(x, y, size = 1) {
    const P = this.p;
    if (Math.random() < 0.7 && this._n(1)) {
      const s0 = rnd(6, 11) * size;
      P.emit(L_ADD, TEX.smoke, x + rnd(-6, 6) * size, y + rnd(-6, 6) * size, rnd(-12, 12), rnd(-30, -6),
        rnd(0.2, 0.4), s0, s0 * 0.4, 0xffe7a3, 0xd8401f, 0.85, GLOW | PF.WIND);
      P.ex(1, Math.random() * TAU, rnd(-3, 3), rint(3));
    }
    if (Math.random() < 0.18) this.smokeTrail(x, y, size * 0.8);
    if (Math.random() < 0.08) this.embers(x, y, 1, { speed: 60 });
  }

  // -------------------------------------------------------------------------------------------
  // bits & pieces

  /**
   * Spinning wreckage. Top-down: no gravity, drag slows it to a drift.
   * @param {'mixed'|'wood'|'metal'|'iron'|'brass'|'canvas'|'syndicate'} [kind]
   * @param {{speed?:number, angle?:number, spread?:number, scale?:number}} [o]
   */
  debris(x, y, count = 6, kind = 'mixed', o = {}) {
    const P = this.p;
    const frames = DEBRIS_KINDS[kind] || DEBRIS_KINDS.mixed;
    const useSheet = kind === 'mixed' && Sprites.has('fx_debris');
    const sheetFrames = useSheet ? texFrames(TEX.debris) : 0;
    const spd = o.speed ?? 240;
    const sc = o.scale ?? 1;
    for (let i = 0, n = this._n(count); i < n; i++) {
      const a = o.angle !== undefined ? o.angle + (Math.random() - 0.5) * (o.spread ?? 1.2) : Math.random() * TAU;
      const sp = spd * rnd(0.35, 1);
      let tex = TEX.scrap;
      let frame = frames[rint(frames.length)];
      if (useSheet && Math.random() < 0.4) {
        tex = TEX.debris;
        frame = rint(sheetFrames);
      }
      const size = rnd(8, 16) * sc;
      P.emit(L_NORMAL, tex, x + rnd(-6, 6), y + rnd(-6, 6), Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.9, 1.7), size,
        size * 0.85, 0xffffff, 0xffffff, 1, PF.LATE);
      P.ex(2.1, Math.random() * TAU, (Math.random() < 0.5 ? -1 : 1) * rnd(5, 14), frame);
      // wisp of smoke chasing the faster pieces
      if (sp > spd * 0.7 && Math.random() < 0.5) {
        const s0 = rnd(4, 7) * sc;
        P.emit(L_NORMAL, TEX.smoke, x, y, Math.cos(a) * sp * 0.55, Math.sin(a) * sp * 0.55, rnd(0.5, 0.9), s0,
          s0 * 2.6, 0x5a524a, 0x2a2522, 0.4, SMOKE);
        P.ex(2.4, Math.random() * TAU, 0, rint(3));
      }
    }
  }

  /** Flying brass cogs — the signature steampunk death garnish. */
  cogs(x, y, count = 4, o = {}) {
    const P = this.p;
    const spd = o.speed ?? 220;
    for (let i = 0, n = this._n(count); i < n; i++) {
      const a = Math.random() * TAU;
      const sp = spd * rnd(0.45, 1.1);
      const size = rnd(9, 16) * (o.scale ?? 1);
      P.emit(L_NORMAL, TEX.cog, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(1.0, 1.7), size, size * 0.9,
        0xffffff, 0xffffff, 1, PF.LATE);
      P.ex(1.9, Math.random() * TAU, (Math.random() < 0.5 ? -1 : 1) * rnd(4, 11));
    }
    this.p.emit(L_ADD, TEX.glint, x, y, 0, 0, 0.16, 26, 10, 0xfff3c4, 0xffcf4a, flashScale(), GLOW);
  }

  /** Drifting glowing embers. o: {color, speed, life} */
  embers(x, y, count = 6, o = {}) {
    const P = this.p;
    const c = o.color !== undefined ? parseColor(o.color) : 0xff8a2a;
    const spd = o.speed ?? 110;
    for (let i = 0, n = this._n(count); i < n; i++) {
      const a = Math.random() * TAU;
      const sp = spd * rnd(0.2, 1);
      const sz = rnd(3, 6.5);
      P.emit(L_ADD, TEX.glow, x + rnd(-5, 5), y + rnd(-5, 5), Math.cos(a) * sp, Math.sin(a) * sp,
        (o.life ?? 1.3) * rnd(0.6, 1.4), sz, sz * 0.4, lerpRgb(c, 0xffffff, 0.35), lerpRgb(c, 0x801000, 0.5), 1,
        GLOW | PF.FLICKER | PF.WIND);
      P.ex(1.3, 0, 0, 0, 0, rnd(-18, 4));
    }
  }

  /** Twinkling glints (pickup sparkle trails, legendary cards, shiny things). */
  sparkle(x, y, color = '#fff3c4', count = 2, radius = 10) {
    const P = this.p;
    const c = parseColor(color);
    for (let i = 0, n = this._n(count); i < n; i++) {
      const sz = rnd(6, 13);
      P.emit(L_ADD, TEX.glint, x + rnd(-radius, radius), y + rnd(-radius, radius), rnd(-10, 10), rnd(-24, -4),
        rnd(0.35, 0.6), sz, 0.5, 0xffffff, c, 1, GLOW);
      P.ex(0.5, Math.random() * TAU, rnd(-3, 3));
    }
  }

  /** Pickup collected: a quick inward-flash ring + glints. */
  pickup(x, y, color = '#4fe3d0') {
    const c = parseColor(color);
    this.ring(x, y, 22, c, 0.22, { width: 2, r0: 6 });
    this.sparkle(x, y, c, 3, 6);
    this.p.emit(L_ADD, TEX.glow, x, y, 0, 0, 0.16, 26, 8, 0xffffff, c, 0.8, GLOW);
  }

  /** Hull repair: green-brass sparkles spiralling up + soft ring. */
  heal(x, y, size = 1) {
    const P = this.p;
    for (let i = 0, n = this._n(10 * size); i < n; i++) {
      const a = Math.random() * TAU;
      const r = rnd(10, 30) * size;
      P.emit(L_ADD, TEX.glint, x + Math.cos(a) * r, y + Math.sin(a) * r, -Math.sin(a) * 30, Math.cos(a) * 30 - 40,
        rnd(0.5, 0.9), rnd(7, 12), 1, 0xeaffd8, 0x6fe08a, 1, GLOW);
      P.ex(0.8, a);
    }
    this.ring(x, y, 44 * size, '#8dffb0', 0.4, { width: 3, r0: 12 });
  }

  /** Level-up radial burst: aether shockwave, star of streaks, gold ring, rising glints. */
  levelUp(x, y, color = '#4fe3d0') {
    const P = this.p;
    const c = parseColor(color);
    const fs = flashScale();
    this.shockwave(x, y, 220, c, 0.6);
    this.ring(x, y, 120, 0xffcf4a, 0.5, { width: 4, r0: 30 });
    this.flare(x, y, 150, c, 0.3);
    const n = this._n(28);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const sp = rnd(420, 620);
      P.emit(L_ADD, TEX.streak, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.35, 0.5), 4, 1,
        i % 2 ? 0xffffff : 0xfff3c4, i % 2 ? c : 0xffcf4a, fs, GLOW | PF.STRETCH | PF.SHRINK);
      P.ex(3, 0, 0, 0, 0.05);
    }
    this.sparkle(x, y, c, 14, 40);
    this.cogs(x, y, 3, { speed: 260 });
  }

  /** Aether-palette explosion (Aether Lance kills, aether weapons). */
  aetherBurst(x, y, size = 1) {
    this.explosion(x, y, size, { palette: 'aether', debris: false, cogs: 0 });
  }

  // -------------------------------------------------------------------------------------------
  // vector effects

  /** Expanding shockwave (soft thick front + bright edge + heat disc). */
  shockwave(x, y, radius = 120, color = '#ffd9a0', life = 0.4, opts) {
    this.effects.shock(x, y, radius, color ?? '#ffd9a0', life ?? 0.4, opts);
  }

  /**
   * Expanding thin ring from opts.r0 (default 30% of r) to r.
   * opts: {width, r0, add (default true), follow:{x,y}}
   */
  ring(x, y, r = 40, color = '#ffffff', life = 0.35, opts = {}) {
    this.effects.ring(x, y, opts.r0 ?? r * 0.3, r, color ?? '#ffffff', life ?? 0.35, opts.width ?? 3, opts);
  }

  /**
   * Jagged electric arc with branches, drawn as glow + core. Re-jags every `regen` s.
   * opts: {color, width, life, branches, jitter, regen, from:{x,y}, to:{x,y}, sparks}
   */
  lightning(x1, y1, x2, y2, opts = {}) {
    const o = {
      color: opts.color ?? '#9ff6ff',
      width: opts.width ?? 2.6,
      life: opts.life ?? 0.2,
      branches: opts.branches ?? 2,
      jitter: opts.jitter ?? 0.2,
      regen: opts.regen ?? (flashScale() < 1 ? 0 : 0.045),
      from: opts.from,
      to: opts.to,
      glowEnds: opts.glowEnds,
    };
    if (lowQuality()) o.branches = Math.min(o.branches, 1);
    this.effects.lightning(x1, y1, x2, y2, o);
    if (opts.sparks !== false) {
      const a = Math.atan2(y2 - y1, x2 - x1);
      this.sparks(x2, y2, a + Math.PI, 3, o.color, 2.5, { speed: 260, life: 0.2, size: 2 });
    }
  }

  /** Straight energy beam with glow, core and end caps. opts: {from, to, wobble} */
  beam(x1, y1, x2, y2, width = 6, color = '#7ff3ff', life = 0.15, opts) {
    this.effects.beam(x1, y1, x2, y2, width, color, life, opts);
  }

  /** Chain tether (harpoons, grapples). opts: {life, color, link, sag, from, to} */
  chain(x1, y1, x2, y2, opts) {
    this.effects.chain(x1, y1, x2, y2, opts);
  }

  // -------------------------------------------------------------------------------------------
  // text

  /**
   * Floating text. Numeric strings are damage numbers (hidden when the damageNumbers setting is
   * off unless opts.force). opts: {color, size, life, rise, crit, key (merge rapid hits on the
   * same target), callout, force}
   */
  text(x, y, str, opts = {}) {
    const s = String(str);
    const isDamage = opts.damage ?? /^[+-]?\d[\d,.]*!?$/.test(s);
    if (isDamage && !opts.force) {
      try {
        if (Save.settings?.damageNumbers === false) return null;
      } catch {
        /* default on */
      }
    }
    return this.floats.add(x, y, s, opts);
  }
}
