// Vector world-space effects for FX (WP3): shockwaves, rings, lightning arcs, beams and chain
// tethers. Few in number but large on screen, so they are drawn as paths/textures rather than
// particles. Owned and advanced by FX (fx.update → effects.update, fx.drawEffects → draw).

import { TEX, texTinted, texImage, parseColor, toRgb15, lerpRgb } from './fx-textures.js';
import { Quality } from './quality.js';

const TAU = Math.PI * 2;
const MAX_EFFECTS = 160;
/** Live lightning cap (evolved Tesla builds fire 16+ arcs at once); the most faded go first. */
const MAX_LIGHTNING = 24;
/**
 * The widest, faintest lightning glow stroke (alpha 0.16) is ~40% of a bolt's raster cost: it
 * is drawn only at the high tier and while at most this many bolts are alive.
 */
const LIGHTNING_GLOW_MAX = 12;
/** Past this many live shockwaves their additive heat discs are skipped (fill-rate). */
const SHOCK_DISC_MAX = 6;

export const EK = { RING: 0, SHOCK: 1, LIGHTNING: 2, BEAM: 3, CHAIN: 4 };

const rnd = (a, b) => a + Math.random() * (b - a);
const easeOut = (u) => 1 - (1 - u) * (1 - u) * (1 - u);

/** A followed object that has died ends the effect early. */
const gone = (o) => !!o && (o.dead === true || o.alive === false);

/** Endpoint readers: effects may follow live objects ({x, y}) given as opts.from / opts.to. */
function ex1(e) {
  return e.from ? e.from.x : e.x1;
}
function ey1(e) {
  return e.from ? e.from.y : e.y1;
}
function ex2(e) {
  return e.to ? e.to.x : e.x2;
}
function ey2(e) {
  return e.to ? e.to.y : e.y2;
}

/**
 * Midpoint-displacement bolt from (x1,y1) to (x2,y2) into a flat [x,y,x,y…] array.
 * @returns {number[]}
 */
function boltPoints(x1, y1, x2, y2, jitter, minSeg) {
  let pts = [x1, y1, x2, y2];
  const len = Math.hypot(x2 - x1, y2 - y1);
  let disp = len * jitter;
  let seg = len;
  let guard = 0;
  while (seg > minSeg && guard++ < 7) {
    const next = [pts[0], pts[1]];
    for (let i = 0; i < pts.length - 2; i += 2) {
      const ax = pts[i];
      const ay = pts[i + 1];
      const bx = pts[i + 2];
      const by = pts[i + 3];
      const dx = bx - ax;
      const dy = by - ay;
      const l = Math.hypot(dx, dy) || 1;
      const off = (Math.random() * 2 - 1) * disp;
      next.push((ax + bx) / 2 + (-dy / l) * off, (ay + by) / 2 + (dx / l) * off, bx, by);
    }
    pts = next;
    disp *= 0.52;
    seg /= 2;
  }
  return pts;
}

export class Effects {
  constructor() {
    /** @type {object[]} */
    this.list = [];
    this.reduceFlashes = false;
    /** Per-frame load switches, set by draw() (see LIGHTNING_GLOW_MAX / SHOCK_DISC_MAX). */
    this._boltGlow = true;
    this._shockDisc = true;
  }

  get count() {
    return this.list.length;
  }

  _push(e) {
    if (this.list.length >= MAX_EFFECTS) this.list.shift();
    e.t = 0;
    this.list.push(e);
    return e;
  }

  ring(x, y, r0, r1, color, life, width, opts) {
    return this._push({
      k: EK.RING,
      x,
      y,
      r0,
      r1,
      c: parseColor(color),
      life,
      width,
      add: opts?.add !== false,
      follow: opts?.follow || null,
    });
  }

  shock(x, y, radius, color, life, opts) {
    return this._push({
      k: EK.SHOCK,
      x,
      y,
      r0: radius * (opts?.r0 ?? 0.12),
      r1: radius,
      c: parseColor(color),
      life,
      width: opts?.width ?? Math.max(3, radius * 0.07),
      alpha: opts?.alpha ?? 1,
    });
  }

  lightning(x1, y1, x2, y2, o) {
    this._capLightning();
    const e = this._push({
      k: EK.LIGHTNING,
      x1,
      y1,
      x2,
      y2,
      from: o.from || null,
      to: o.to || null,
      c: parseColor(o.color),
      width: o.width,
      life: o.life,
      branches: o.branches,
      jitter: o.jitter,
      regen: o.regen,
      next: 0,
      lines: null,
      glowEnds: o.glowEnds !== false,
    });
    this._regenBolt(e);
    return e;
  }

  beam(x1, y1, x2, y2, width, color, life, o) {
    return this._push({
      k: EK.BEAM,
      x1,
      y1,
      x2,
      y2,
      from: o?.from || null,
      to: o?.to || null,
      width,
      c: parseColor(color),
      life,
      wobble: o?.wobble ?? 0,
    });
  }

  chain(x1, y1, x2, y2, o) {
    return this._push({
      k: EK.CHAIN,
      x1,
      y1,
      x2,
      y2,
      from: o?.from || null,
      to: o?.to || null,
      life: o?.life ?? 0.25,
      c: parseColor(o?.color ?? '#9aa3ad'),
      link: o?.link ?? 7,
      sag: o?.sag ?? 0.08,
    });
  }

  /** Make room under MAX_LIGHTNING by dropping the most faded live bolt. */
  _capLightning() {
    const L = this.list;
    let n = 0;
    let oldest = -1;
    let oldestU = -1;
    for (let i = 0; i < L.length; i++) {
      const e = L[i];
      if (e.k !== EK.LIGHTNING) continue;
      n++;
      const u = e.t / e.life;
      if (u > oldestU) {
        oldestU = u;
        oldest = i;
      }
    }
    if (n >= MAX_LIGHTNING && oldest >= 0) L.splice(oldest, 1);
  }

  _regenBolt(e) {
    const x1 = ex1(e);
    const y1 = ey1(e);
    const x2 = ex2(e);
    const y2 = ey2(e);
    const len = Math.hypot(x2 - x1, y2 - y1);
    const main = boltPoints(x1, y1, x2, y2, e.jitter, Math.max(6, len / 22));
    const lines = [main];
    const nPts = main.length / 2;
    const ang = Math.atan2(y2 - y1, x2 - x1);
    for (let b = 0; b < e.branches && nPts > 4; b++) {
      const idx = (((0.15 + Math.random() * 0.6) * (nPts - 1)) | 0) * 2;
      const bx = main[idx];
      const by = main[idx + 1];
      const bl = len * rnd(0.18, 0.4);
      const ba = ang + (Math.random() < 0.5 ? -1 : 1) * rnd(0.35, 0.95);
      const br = boltPoints(bx, by, bx + Math.cos(ba) * bl, by + Math.sin(ba) * bl, e.jitter * 1.2, 6);
      lines.push(br);
      // occasional twig off the branch
      if (Math.random() < 0.45 && br.length > 8) {
        const j = (((br.length / 2) * 0.5) | 0) * 2;
        const ta = ba + rnd(-0.9, 0.9);
        const tl = bl * 0.45;
        lines.push(
          boltPoints(br[j], br[j + 1], br[j] + Math.cos(ta) * tl, br[j + 1] + Math.sin(ta) * tl, 0.3, 5)
        );
      }
    }
    e.lines = lines;
  }

  update(dt) {
    const L = this.list;
    let n = L.length;
    for (let i = 0; i < n; ) {
      const e = L[i];
      e.t += dt;
      if (e.t >= e.life || gone(e.from) || gone(e.to)) {
        L[i] = L[n - 1];
        n--;
        continue;
      }
      if (e.k === EK.LIGHTNING && e.regen > 0) {
        e.next -= dt;
        if (e.next <= 0) {
          e.next = e.regen;
          this._regenBolt(e);
        }
      }
      i++;
    }
    L.length = n;
  }

  /** Draw in world space (caller has the world transform applied). */
  draw(ctx, renderer) {
    if (!this.list.length) return;
    const prevAlpha = ctx.globalAlpha;
    const prevComp = ctx.globalCompositeOperation;
    const prevCap = ctx.lineCap;
    const prevJoin = ctx.lineJoin;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    let bolts = 0;
    let shocks = 0;
    for (const e of this.list) {
      if (e.k === EK.LIGHTNING) bolts++;
      else if (e.k === EK.SHOCK) shocks++;
    }
    this._boltGlow = bolts <= LIGHTNING_GLOW_MAX && Quality.tier >= 2;
    this._shockDisc = shocks <= SHOCK_DISC_MAX;
    for (const e of this.list) {
      const u = Math.min(1, e.t / e.life);
      switch (e.k) {
        case EK.RING:
          this._drawRing(ctx, e, u);
          break;
        case EK.SHOCK:
          this._drawShock(ctx, e, u);
          break;
        case EK.LIGHTNING:
          this._drawLightning(ctx, e, u);
          break;
        case EK.BEAM:
          this._drawBeam(ctx, e, u);
          break;
        case EK.CHAIN:
          this._drawChain(ctx, e, u);
          break;
        default:
      }
    }
    ctx.globalAlpha = prevAlpha;
    ctx.globalCompositeOperation = prevComp;
    ctx.lineCap = prevCap;
    ctx.lineJoin = prevJoin;
  }

  _drawRing(ctx, e, u) {
    const x = e.follow ? e.follow.x : e.x;
    const y = e.follow ? e.follow.y : e.y;
    const r = e.r0 + (e.r1 - e.r0) * easeOut(u);
    const a = (1 - u) * (1 - u * 0.5);
    ctx.globalCompositeOperation = e.add ? 'lighter' : 'source-over';
    // soft halo (texture ring sits at 0.89 of its radius)
    const R = r / 0.89;
    ctx.globalAlpha = a * 0.4;
    ctx.drawImage(texTinted(TEX.ring, 0, toRgb15(e.c)), x - R, y - R, R * 2, R * 2);
    // crisp line
    ctx.globalAlpha = a * 0.75;
    ctx.strokeStyle = cssOf(lerpRgb(e.c, 0xffffff, 0.25));
    ctx.lineWidth = Math.max(0.5, e.width * (1 - u * 0.7));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
  }

  _drawShock(ctx, e, u) {
    const k = easeOut(u);
    const r = e.r0 + (e.r1 - e.r0) * k;
    const a = e.alpha * (1 - u) ** 1.3;
    ctx.globalCompositeOperation = 'lighter';
    // heat disc (skipped for very wide waves: a screen-sized additive fill for little gain)
    if (u < 0.4 && e.r1 < 260 && this._shockDisc) {
      const hr = r * 0.8;
      ctx.globalAlpha = a * (0.4 - u) * 0.45;
      ctx.drawImage(texTinted(TEX.soft, 0, toRgb15(e.c)), e.x - hr, e.y - hr, hr * 2, hr * 2);
    }
    // thick soft front
    const R = r / 0.91;
    ctx.globalAlpha = a * 0.38;
    ctx.drawImage(texTinted(TEX.shock, 0, toRgb15(e.c)), e.x - R, e.y - R, R * 2, R * 2);
    // bright leading edge
    ctx.globalAlpha = a * 0.45;
    ctx.strokeStyle = cssOf(lerpRgb(e.c, 0xffffff, 0.3));
    ctx.lineWidth = Math.max(0.6, e.width * 0.3 * (1 - u));
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, 0, TAU);
    ctx.stroke();
    // trailing secondary ring
    const r2 = r * 0.72;
    ctx.globalAlpha = a * 0.35;
    ctx.lineWidth = Math.max(0.5, e.width * 0.3 * (1 - u));
    ctx.strokeStyle = cssOf(e.c);
    ctx.beginPath();
    ctx.arc(e.x, e.y, r2, 0, TAU);
    ctx.stroke();
  }

  _strokePolyline(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke();
  }

  _drawLightning(ctx, e, u) {
    let a = (1 - u) ** 0.6;
    if (!this.reduceFlashes) a *= 0.7 + 0.3 * Math.random();
    else a *= 0.6;
    // re-anchor to followed endpoints between regenerations
    const lines = e.lines;
    if (!lines) return;
    if (e.from || e.to) {
      const main = lines[0];
      main[0] = ex1(e);
      main[1] = ey1(e);
      main[main.length - 2] = ex2(e);
      main[main.length - 1] = ey2(e);
    }
    ctx.globalCompositeOperation = 'lighter';
    const css = cssOf(e.c);
    const coreCss = cssOf(lerpRgb(e.c, 0xffffff, 0.85));
    for (let li = 0; li < lines.length; li++) {
      const w = e.width * (li === 0 ? 1 : 0.55);
      const pts = lines[li];
      ctx.strokeStyle = css;
      if (this._boltGlow) {
        ctx.globalAlpha = a * 0.16;
        ctx.lineWidth = w * 6;
        this._strokePolyline(ctx, pts);
      }
      ctx.globalAlpha = a * 0.45;
      ctx.lineWidth = w * 2.4;
      this._strokePolyline(ctx, pts);
      ctx.strokeStyle = coreCss;
      ctx.globalAlpha = a;
      ctx.lineWidth = w * 0.8;
      this._strokePolyline(ctx, pts);
    }
    if (e.glowEnds) {
      const img = texTinted(TEX.glow, 0, toRgb15(e.c));
      const gs = e.width * 14;
      ctx.globalAlpha = a * 0.8;
      ctx.drawImage(img, ex1(e) - gs / 2, ey1(e) - gs / 2, gs, gs);
      ctx.drawImage(img, ex2(e) - gs / 2, ey2(e) - gs / 2, gs, gs);
      const cs = e.width * 5;
      ctx.globalAlpha = a;
      const core = texImage(TEX.core, 0);
      ctx.drawImage(core, ex2(e) - cs / 2, ey2(e) - cs / 2, cs, cs);
    }
  }

  _drawBeam(ctx, e, u) {
    const x1 = ex1(e);
    const y1 = ey1(e);
    const x2 = ex2(e);
    const y2 = ey2(e);
    const a = (1 - u) ** 0.7;
    const w = e.width * (1 - u * 0.75) * (1 + (e.wobble ? Math.sin(e.t * 60) * e.wobble : 0));
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = cssOf(e.c);
    ctx.globalAlpha = a * 0.22;
    ctx.lineWidth = w * 3.2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.globalAlpha = a * 0.6;
    ctx.lineWidth = w * 1.4;
    ctx.stroke();
    ctx.strokeStyle = cssOf(lerpRgb(e.c, 0xffffff, 0.85));
    ctx.globalAlpha = a;
    ctx.lineWidth = w * 0.45;
    ctx.stroke();
    const img = texTinted(TEX.glow, 0, toRgb15(e.c));
    const gs = w * 5;
    ctx.globalAlpha = a * 0.9;
    ctx.drawImage(img, x1 - gs / 2, y1 - gs / 2, gs, gs);
    ctx.drawImage(img, x2 - gs * 0.4, y2 - gs * 0.4, gs * 0.8, gs * 0.8);
  }

  _drawChain(ctx, e, u) {
    const x1 = ex1(e);
    const y1 = ey1(e);
    const x2 = ex2(e);
    const y2 = ey2(e);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 2) return;
    const nx = -dy / len;
    const ny = dx / len;
    const ang = Math.atan2(dy, dx);
    const a = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
    const links = Math.max(2, Math.floor(len / e.link));
    const sag = len * e.sag * Math.sin(e.t * 9) * 0.5;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a;
    const lit = cssOf(lerpRgb(e.c, 0xffffff, 0.35));
    const dark = 'rgba(26,18,10,0.9)';
    for (let i = 0; i <= links; i++) {
      const f = i / links;
      const bow = Math.sin(f * Math.PI) * sag;
      const px = x1 + dx * f + nx * bow;
      const py = y1 + dy * f + ny * bow;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(ang);
      if (i % 2 === 0) {
        ctx.beginPath();
        ctx.ellipse(0, 0, e.link * 0.62, e.link * 0.34, 0, 0, TAU);
        ctx.lineWidth = 2.6;
        ctx.strokeStyle = dark;
        ctx.stroke();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = lit;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(-e.link * 0.6, 0);
        ctx.lineTo(e.link * 0.6, 0);
        ctx.lineWidth = 3;
        ctx.strokeStyle = dark;
        ctx.stroke();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = cssOf(e.c);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  clear() {
    this.list.length = 0;
  }
}

const cssCache = new Map();
function cssOf(rgb) {
  let s = cssCache.get(rgb);
  if (!s) {
    s = `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`;
    if (cssCache.size > 256) cssCache.clear();
    cssCache.set(rgb, s);
  }
  return s;
}
