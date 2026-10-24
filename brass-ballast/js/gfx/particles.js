// Particles & FX (WP3) — DESIGN §4.15, §7.
//
// CONTRACT
// --------
//   const particles = new Particles(5000);   const fx = new FX(particles);
//   world.update(dt):  particles.update(dt); fx.update(dt);    // every *simulated* frame
//                      (fx.update advances delayed bursts, effects (rings/arcs/beams) & texts)
//   render, inside the world transform (renderer.applyWorld()), per DESIGN §4.2:
//     particles.draw(ctx, renderer, 'low')       // under pickups/ships (lingering smoke, scorch)
//     particles.draw(ctx, renderer, 'normal')    // smoke, debris, cogs (alpha blended)
//     particles.draw(ctx, renderer, 'add')       // fire, sparks, glows (additive 'lighter')
//     fx.drawEffects(ctx, renderer)              // shockwaves, rings, lightning, beams, chains
//     fx.drawTexts(ctx, renderer)                // damage numbers & callouts
//   Draw calls read the current ctx transform (ctx.getTransform()) and restore it, alpha and
//   composite op afterwards, so they work under any world transform. `renderer` is optional
//   (used for off-screen culling and zoom-aware text size).
//   Optional: `particles.wind = world.wind` (or write .x/.y) — smoke/steam/embers drift with it.
//
// Particle spec for spawn(p) (DESIGN §4.15) — all optional except x, y, life:
//   {x, y, vx, vy, life, size (diameter, world units), size1 (end size), color, color1 (end
//    colour, CSS string or 0xRRGGBB int; rgba() alpha is honoured), alpha, drag (1/s),
//    grav (y accel), rot, vr, sprite (any registered Sprites name), frame, tint (tint a sprite
//    by color), tex ('glow'|'soft'|'core'|'smoke'|'steam'|'streak'|'glint'|'flare'|'ring'|
//    'shock'|'muzzle'|'cog'|'debris'|'scrap'), stretch (streak length per unit speed),
//    align (rotate to velocity), fade ('linear'|'late'|'flicker'), fadeIn, wind,
//    blend:'normal'|'add', layer:'low'|'normal'|'add' (default: 'add' if blend add else 'normal')}
//
// Storage is struct-of-arrays (typed arrays) per layer with swap-remove; drawing is batched with
// one setTransform + drawImage per particle (no save/restore). Colour over life uses a small
// cache of tinted textures (fx-textures.js). The quality tier (gfx/quality.js: setting or auto
// governor) scales the cap, every FX spawn count and the largest drawn particle;
// Save.settings.flashes === false dims flares/flashes and stops strobing. `particles.focus`
// (living players) fades alpha-blended particles right over a ship so it never vanishes in smoke.

import { PF, LAYER_IDX } from './fx-common.js';
import { Quality } from './quality.js';
import {
  TEX,
  texImage,
  texTinted,
  texForSprite,
  isTintable,
  isSpinless,
  parseColor,
  parseAlpha,
  lerpRgb15,
} from './fx-textures.js';

export { FX } from './fx.js';
export { PF, LAYER, lowQuality, flashScale } from './fx-common.js';

class Pool {
  constructor(n) {
    this.cap = n;
    this.n = 0;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.t = new Float32Array(n);
    this.life = new Float32Array(n);
    this.s0 = new Float32Array(n);
    this.s1 = new Float32Array(n);
    this.a = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.rot = new Float32Array(n);
    this.vr = new Float32Array(n);
    this.stretch = new Float32Array(n);
    this.c0 = new Int32Array(n);
    this.c1 = new Int32Array(n);
    this.tex = new Uint16Array(n);
    this.frame = new Uint8Array(n);
    this.flags = new Uint16Array(n);
  }

  /** Move particle j into slot i. */
  copy(i, j) {
    this.x[i] = this.x[j];
    this.y[i] = this.y[j];
    this.vx[i] = this.vx[j];
    this.vy[i] = this.vy[j];
    this.t[i] = this.t[j];
    this.life[i] = this.life[j];
    this.s0[i] = this.s0[j];
    this.s1[i] = this.s1[j];
    this.a[i] = this.a[j];
    this.drag[i] = this.drag[j];
    this.grav[i] = this.grav[j];
    this.rot[i] = this.rot[j];
    this.vr[i] = this.vr[j];
    this.stretch[i] = this.stretch[j];
    this.c0[i] = this.c0[j];
    this.c1[i] = this.c1[j];
    this.tex[i] = this.tex[j];
    this.frame[i] = this.frame[j];
    this.flags[i] = this.flags[j];
  }
}

const TEX_BY_NAME = TEX;
const VIEW = { x0: 0, y0: 0, x1: 0, y1: 0, w: 0, h: 0 };
/** Largest drawn particle (world units). Huge soft sprites are pure fill-rate. */
const MAX_DRAW_SIZE = [150, 210, 260];
/** Radius around a player inside which 'normal'-layer smoke/debris fades (ship stays readable). */
const CLEAR_R = 70;
/**
 * Per-frame fill budget (all layers), in full-screen equivalents of particle overdraw, per tier.
 * Past it, big particles are thinned (every 2nd, then 3 of 4): a pile-up of bomb-sized blasts
 * stays a pile-up instead of a slideshow. Small sparks/debris are never thinned.
 */
const FILL_BUDGET = [1.5, 2.5, 3.5];
/**
 * Per-frame drawn-count budget (all layers so far), per tier. Past it, every 2nd small
 * 'normal'-layer particle (smoke wisps, debris) is skipped: thousands of tiny blits are what a
 * boss fight's particle cost is made of, and halving the far-too-many still reads the same.
 */
const COUNT_BUDGET = [400, 800, 1400];
/**
 * Arbitrary rotation forces the rasterizer's general affine sampler (~2-4x a scale-only blit).
 * Spinless textures (soft smoke/steam/glows) are mirrored instead of rotated below the high
 * tier, and at high while a busy layer holds more than SPIN_ON live particles (until it falls
 * under SPIN_OFF: hysteresis so puffs don't flip back and forth at the threshold).
 */
const SPIN_ON = 450;
const SPIN_OFF = 300;

export class Particles {
  /** @param {number} [max] hard cap (scaled down by the quality tier) */
  constructor(max = 5000) {
    this.max = Math.max(64, max | 0);
    this.pools = [new Pool(this.max), new Pool(this.max), new Pool(this.max)];
    this.wind = { x: 0, y: 0 };
    /** Pool/index of the most recent emit(), for ex(). */
    this._lp = null;
    this._li = -1;
    this.drawn = 0;
    /** Points (players) to keep clear of 'normal'-layer particles: [{x, y}]. */
    this.focus = [];
    /** Overdraw accumulated this frame (device px², see FILL_BUDGET). */
    this._fill = 0;
    /** Particles drawn so far this frame, all layers (see COUNT_BUDGET). */
    this._count = 0;
    /** Per layer: spinless textures are mirrored instead of rotated (see SPIN_ON). */
    this._flip = [false, false, false];
  }

  /** Live particle count over all layers. */
  get count() {
    return this.pools[0].n + this.pools[1].n + this.pools[2].n;
  }

  /** Effective cap (quality-tier aware). */
  get cap() {
    return Math.max(64, (this.max * Quality.cfg.cap) | 0);
  }

  /** 0..1 how full the system is; FX helpers thin out spawns as this approaches 1. */
  get load() {
    return this.count / this.cap;
  }

  /**
   * Low-level, allocation-free emitter used by FX helpers. Returns the slot index or -1.
   * Optional extras for the same particle can be set right after with ex().
   */
  emit(layer, tex, x, y, vx, vy, life, s0, s1, c0, c1, alpha, flags) {
    const pool = this.pools[layer];
    let i;
    if (this.count >= this.cap) {
      // Full: recycle a random live particle of this layer so fresh effects still read.
      if (pool.n === 0) {
        this._li = -1;
        return -1;
      }
      i = (Math.random() * pool.n) | 0;
    } else {
      i = pool.n++;
    }
    pool.x[i] = x;
    pool.y[i] = y;
    pool.vx[i] = vx;
    pool.vy[i] = vy;
    pool.t[i] = 0;
    pool.life[i] = life > 0.001 ? life : 0.001;
    pool.s0[i] = s0;
    pool.s1[i] = s1;
    pool.c0[i] = c0;
    pool.c1[i] = c1;
    pool.a[i] = alpha;
    pool.flags[i] = flags;
    pool.tex[i] = tex;
    pool.frame[i] = 0;
    pool.drag[i] = 0;
    pool.grav[i] = 0;
    pool.rot[i] = 0;
    pool.vr[i] = 0;
    pool.stretch[i] = 0;
    this._lp = pool;
    this._li = i;
    return i;
  }

  /** Extras for the particle just emitted (no-op if that emit was dropped). */
  ex(drag = 0, rot = 0, vr = 0, frame = 0, stretch = 0, grav = 0) {
    const i = this._li;
    if (i < 0) return;
    const p = this._lp;
    p.drag[i] = drag;
    p.rot[i] = rot;
    p.vr[i] = vr;
    p.frame[i] = frame;
    p.stretch[i] = stretch;
    p.grav[i] = grav;
  }

  /**
   * Spawn from a spec object (DESIGN §4.15). Returns true if spawned.
   * @param {object} p
   */
  spawn(p) {
    if (!p) return false;
    const blendAdd = p.blend === 'add' || (p.blend === undefined && p.layer === 'add');
    const layer = p.layer ? LAYER_IDX(p.layer) : blendAdd ? 2 : 1;
    let tex;
    let flags = 0;
    if (p.sprite) {
      tex = texForSprite(p.sprite);
      if (p.tint) flags |= PF.TINT;
    } else {
      tex = TEX_BY_NAME[p.tex] ?? TEX.glow;
      if (isTintable(tex)) flags |= PF.TINT;
    }
    if (blendAdd) flags |= PF.ADD;
    if (p.stretch) flags |= PF.STRETCH;
    if (p.align) flags |= PF.ALIGN;
    if (p.fadeIn) flags |= PF.FADEIN;
    if (p.wind) flags |= PF.WIND;
    if (p.fade === 'late') flags |= PF.LATE;
    else if (p.fade === 'flicker') flags |= PF.FLICKER;
    const c0 = parseColor(p.color ?? 0xffffff);
    const c1 = p.color1 !== undefined ? parseColor(p.color1) : c0;
    const alpha = (p.alpha ?? 1) * parseAlpha(p.color);
    const size = p.size ?? 4;
    const i = this.emit(
      layer,
      tex,
      p.x || 0,
      p.y || 0,
      p.vx || 0,
      p.vy || 0,
      p.life ?? 0.5,
      size,
      p.size1 ?? size,
      c0,
      c1,
      alpha,
      flags
    );
    if (i < 0) return false;
    this.ex(p.drag || 0, p.rot || 0, p.vr || 0, p.frame || 0, p.stretch || 0, p.grav || 0);
    return true;
  }

  /** Advance every particle. Swap-remove keeps the arrays dense. */
  update(dt) {
    if (!(dt > 0)) return;
    const wx = this.wind?.x || 0;
    const wy = this.wind?.y || 0;
    for (let L = 0; L < 3; L++) {
      const P = this.pools[L];
      const { x, y, vx, vy, t, life, drag, grav, rot, vr, flags } = P;
      let n = P.n;
      for (let i = 0; i < n; ) {
        const tt = t[i] + dt;
        if (tt >= life[i]) {
          n--;
          if (i !== n) P.copy(i, n);
          continue;
        }
        t[i] = tt;
        const d = drag[i];
        if (d > 0) {
          const k = 1 / (1 + d * dt);
          vx[i] *= k;
          vy[i] *= k;
          vr[i] *= 1 / (1 + d * 0.5 * dt);
        }
        if (grav[i] !== 0) vy[i] += grav[i] * dt;
        if (flags[i] & PF.WIND) {
          vx[i] += wx * dt;
          vy[i] += wy * dt;
        }
        x[i] += vx[i] * dt;
        y[i] += vy[i] * dt;
        rot[i] += vr[i] * dt;
        i++;
      }
      P.n = n;
    }
  }

  /**
   * Draw one layer. Must be called inside the world transform.
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} [renderer]
   * @param {'low'|'normal'|'add'} [layer]
   */
  draw(ctx, renderer, layer = 'normal') {
    const L = LAYER_IDX(layer);
    // 'low' is drawn first each frame: the fill budget restarts there.
    if (L === 0) {
      this._fill = 0;
      this._count = 0;
    }
    const P = this.pools[L];
    if (Quality.tier < 2) this._flip[L] = true;
    else if (P.n > SPIN_ON) this._flip[L] = true;
    else if (P.n < SPIN_OFF) this._flip[L] = false;
    if (!P.n) return;
    const flip = this._flip[L];
    const m = ctx.getTransform();
    const ma = m.a;
    const mb = m.b;
    const mc = m.c;
    const md = m.d;
    const me = m.e;
    const mf = m.f;
    const prevAlpha = ctx.globalAlpha;
    const prevComp = ctx.globalCompositeOperation;
    let cull = false;
    if (renderer?.viewRect) {
      renderer.viewRect(0, VIEW);
      cull = true;
    }
    let add = L === 2;
    ctx.globalCompositeOperation = add ? 'lighter' : 'source-over';
    const maxSize = MAX_DRAW_SIZE[Quality.tier];
    // Players to keep visible through the alpha-blended layer (smoke, debris over the hull).
    const foc = L === 1 ? this.focus : null;
    const nf = foc ? foc.length : 0;
    const { x, y, vx, vy, t, life, s0, s1, a, rot, stretch, c0, c1, tex, frame, flags } = P;
    let drawn = 0;
    // Fill budget in device px² (world size² × scale²); `big` = a particle worth thinning.
    const cvs = ctx.canvas;
    const screenPx = (cvs?.width || 1280) * (cvs?.height || 720);
    const k2 = ma * ma + mb * mb;
    const budget = FILL_BUDGET[Quality.tier] * screenPx;
    const big = screenPx * 0.0015;
    let fill = this._fill || 0;
    const countBudget = L === 1 ? COUNT_BUDGET[Quality.tier] - this._count : Infinity;
    for (let i = 0, n = P.n; i < n; i++) {
      const u = t[i] / life[i];
      const f = flags[i];
      // size: grow with ease-out, shrink linearly (or late for SHRINK)
      const sa = s0[i];
      const sb = s1[i];
      let size;
      if (sb === sa) size = sa;
      else if (sb > sa) size = sa + (sb - sa) * (1 - (1 - u) * (1 - u));
      else if (f & PF.SHRINK) size = sa + (sb - sa) * u * u;
      else size = sa + (sb - sa) * u;
      if (size <= 0.05) continue;
      if (size > maxSize) size = maxSize;
      const px = x[i];
      const py = y[i];
      if (cull) {
        const r = size * 2 + stretch[i] * 400;
        if (px + r < VIEW.x0 || px - r > VIEW.x1 || py + r < VIEW.y0 || py - r > VIEW.y1) continue;
      }
      // alpha over life
      let al = a[i];
      if (f & PF.LATE) al *= u < 0.45 ? 1 : 1 - ((u - 0.45) / 0.55) ** 1.5;
      else al *= 1 - u;
      if (f & PF.FADEIN && u < 0.15) al *= u / 0.15;
      if (f & PF.FLICKER) al *= 0.6 + 0.4 * Math.sin(t[i] * 37 + i * 1.7);
      if (nf && !(f & PF.ADD)) {
        for (let k = 0; k < nf; k++) {
          const q = foc[k];
          const rr = CLEAR_R + size * 0.3;
          const dx = px - q.x;
          const dy = py - q.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < rr * rr) al *= 0.2 + 0.8 * (d2 / (rr * rr));
        }
      }
      if (al <= 0.004) continue;
      if (al > 1) al = 1;
      const area = size * size * k2;
      if (fill > budget && area > big && (fill > budget * 2 ? (i & 3) !== 0 : (i & 1) !== 0)) continue;
      if (drawn > countBudget && area <= big && (i & 1) !== 0) continue;
      fill += area;
      const id = tex[i];
      // colour over life in 8 steps: smooth enough, and bounds the tinted-texture variants
      const img =
        f & PF.TINT ? texTinted(id, frame[i], lerpRgb15(c0[i], c1[i], ((u * 8 + 0.5) | 0) * 0.125)) : texImage(id, frame[i]);
      const iw = img.width;
      const ih = img.height;
      const asp = iw / ih;
      let sx;
      let sy;
      let ang;
      if (f & PF.STRETCH) {
        const sp = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
        sx = size * asp + sp * stretch[i];
        sy = size;
        ang = Math.atan2(vy[i], vx[i]);
      } else {
        if (asp >= 1) {
          sx = size;
          sy = size / asp;
        } else {
          sx = size * asp;
          sy = size;
        }
        if (f & PF.ALIGN) ang = Math.atan2(vy[i], vx[i]) + rot[i];
        else if (flip && rot[i] !== 0 && isSpinless(id)) {
          // Mirror per particle instead (bits from its fixed life/size: stable over its life).
          const h = (life[i] * 1000 + s1[i] * 7) | 0;
          if (h & 1) sx = -sx;
          if (h & 2) sy = -sy;
          ang = 0;
        } else ang = rot[i];
      }
      const wantAdd = (f & PF.ADD) !== 0;
      if (wantAdd !== add) {
        add = wantAdd;
        ctx.globalCompositeOperation = add ? 'lighter' : 'source-over';
      }
      ctx.globalAlpha = prevAlpha * al;
      if (ang === 0) {
        ctx.setTransform(ma * sx, mb * sx, mc * sy, md * sy, ma * px + mc * py + me, mb * px + md * py + mf);
      } else {
        const cs = Math.cos(ang);
        const sn = Math.sin(ang);
        // world · translate(px,py) · rotate(ang) · scale(sx,sy)
        const l00 = cs * sx;
        const l01 = sn * sx;
        const l10 = -sn * sy;
        const l11 = cs * sy;
        ctx.setTransform(
          ma * l00 + mc * l01,
          mb * l00 + md * l01,
          ma * l10 + mc * l11,
          mb * l10 + md * l11,
          ma * px + mc * py + me,
          mb * px + md * py + mf
        );
      }
      ctx.drawImage(img, -0.5, -0.5, 1, 1);
      drawn++;
    }
    ctx.setTransform(m);
    ctx.globalAlpha = prevAlpha;
    ctx.globalCompositeOperation = prevComp;
    this.drawn = drawn;
    this._fill = fill;
    this._count += drawn;
  }

  clear() {
    for (const P of this.pools) P.n = 0;
    this._li = -1;
  }
}
