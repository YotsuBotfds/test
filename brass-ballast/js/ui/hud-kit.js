// HUD toolkit (WP22): cached layers, brass frame painters, fonts, odometer digits, safe-area
// probe and a tiny screen-space spark system. Everything here is shared by the hud-*.js parts.
//
// Units: HUD parts draw in "UI units" under a transform of (dpr · uiScale). Cached layers are
// rendered at that same pixel density so they blit 1:1 and stay crisp on any screen.

import { FONT_DISPLAY, FONT_BODY, FONT_MONO } from '../config.js';
import {
  metal,
  metalRadial,
  roundRect,
  rivet,
  ink,
  gear as dkGear,
  INK,
} from '../gfx/drawkit.js';

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
/** Frame-rate independent exponential approach. */
export const approach = (cur, target, rate, dt) => target + (cur - target) * Math.exp(-rate * dt);
export const easeOutCubic = (t) => 1 - (1 - t) ** 3;
export const easeInCubic = (t) => t * t * t;
export const easeOutBack = (t, k = 1.70158) => 1 + (k + 1) * (t - 1) ** 3 + k * (t - 1) ** 2;
export const smooth = (t) => t * t * (3 - 2 * t);

// ---- fonts --------------------------------------------------------------------------------

const fontCache = new Map();
/**
 * Cached CSS font string. kind: 'd' display, 'b' body, 'm' mono.
 * @param {number} size UI units (the transform scales it)
 */
export function font(size, kind = 'd', weight = 'bold', style = '') {
  const key = `${kind}${size}${weight}${style}`;
  let f = fontCache.get(key);
  if (!f) {
    const fam = kind === 'm' ? FONT_MONO : kind === 'b' ? FONT_BODY : FONT_DISPLAY;
    f = `${style ? `${style} ` : ''}${weight} ${size}px ${fam}`;
    fontCache.set(key, f);
  }
  return f;
}

const HAS_LS = typeof CanvasRenderingContext2D !== 'undefined' &&
  'letterSpacing' in CanvasRenderingContext2D.prototype;

/** Set letter spacing where supported (Chrome/Safari 17+); silently ignored elsewhere. */
export function spacing(ctx, px) {
  if (HAS_LS) ctx.letterSpacing = px ? `${px}px` : '0px';
}

/** Draw text with a 1-unit dark drop + optional glow colour underneath (engraved look). */
export function engraved(ctx, text, x, y, color = '#fff3c4', shadow = 'rgba(20,10,4,0.85)', dy = 1.2) {
  ctx.fillStyle = shadow;
  ctx.fillText(text, x, y + dy);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** Fit text into maxW by shrinking the font (returns the size used). */
export function fitFont(ctx, text, size, maxW, kind = 'd', weight = 'bold', style = '') {
  let s = size;
  ctx.font = font(s, kind, weight, style);
  const w = ctx.measureText(text).width;
  if (w > maxW && w > 0) {
    s = Math.max(6, Math.floor(size * (maxW / w)));
    ctx.font = font(s, kind, weight, style);
  }
  return s;
}

// ---- cached layers ------------------------------------------------------------------------

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

/**
 * Pre-rendered static layers keyed by string. `px` = device pixels per UI unit; changing it
 * (resize / DPR / uiScale change) drops the whole cache so everything re-renders crisply.
 */
export class LayerCache {
  constructor() {
    this.map = new Map();
    this.px = 1;
  }

  setPx(px) {
    if (Math.abs(px - this.px) < 1e-3) return;
    this.px = px;
    this.map.clear();
  }

  /**
   * @param {string} key
   * @param {number} w UI units
   * @param {number} h UI units
   * @param {(ctx:CanvasRenderingContext2D, w:number, h:number)=>void} draw in UI units
   * @param {number} [pad] extra margin (UI units) on every side for glows / ink
   * @returns {{img:HTMLCanvasElement, w:number, h:number, pad:number}}
   */
  get(key, w, h, draw, pad = 0) {
    let L = this.map.get(key);
    if (L) return L;
    const px = this.px;
    const c = makeCanvas(Math.ceil((w + pad * 2) * px), Math.ceil((h + pad * 2) * px));
    const ctx = c.getContext('2d');
    ctx.setTransform(px, 0, 0, px, pad * px, pad * px);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    try {
      draw(ctx, w, h);
    } catch (err) {
      console.error(`[hud] layer "${key}" failed`, err);
    }
    L = { img: c, w, h, pad };
    // Keep the cache bounded (keys that include live values like maxHp may churn).
    if (this.map.size > 160) this.map.delete(this.map.keys().next().value);
    this.map.set(key, L);
    return L;
  }

  /** Blit a layer with its top-left at (x, y) UI units. */
  static draw(ctx, L, x, y, scale = 1) {
    const p = L.pad;
    ctx.drawImage(L.img, x - p * scale, y - p * scale, (L.w + p * 2) * scale, (L.h + p * 2) * scale);
  }
}

// ---- brass painters (used inside cached layers) ------------------------------------------

/**
 * Brass-framed panel: ink outline, polished brass rim, dark inset well, rivets.
 * @param {{kind?:string, well?:string|CanvasGradient|null, rim?:number, r?:number,
 *          rivets?:boolean, rivetR?:number, wellAlpha?:number}} [o]
 */
export function brassPanel(ctx, x, y, w, h, o = {}) {
  const { kind = 'brass', well = '#1d140b', rim = 3, r = 6, rivets = true, rivetR = 1.5, wellAlpha = 0.92 } = o;
  // soft drop shadow
  roundRect(ctx, x + 1.5, y + 2.5, w, h, r);
  ctx.fillStyle = 'rgba(10,6,2,0.38)';
  ctx.fill();
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = metal(ctx, x, y, x + w * 0.4, y + h * 1.6, kind, { polish: true });
  ctx.fill();
  ink(ctx, 1.2);
  // bevel highlight along the top-left edge
  roundRect(ctx, x + 0.9, y + 0.9, w - 1.8, h - 1.8, Math.max(1, r - 1));
  ctx.strokeStyle = 'rgba(255,246,214,0.45)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  if (well) {
    const ir = Math.max(1, r - rim * 0.6);
    roundRect(ctx, x + rim, y + rim, w - rim * 2, h - rim * 2, ir);
    ctx.globalAlpha = wellAlpha;
    ctx.fillStyle = well;
    ctx.fill();
    ctx.globalAlpha = 1;
    // inner shadow: dark top edge, light bottom lip
    ctx.save();
    ctx.clip();
    const g = ctx.createLinearGradient(0, y + rim, 0, y + h - rim);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.25, 'rgba(0,0,0,0)');
    g.addColorStop(0.85, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(255,220,150,0.12)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    roundRect(ctx, x + rim, y + rim, w - rim * 2, h - rim * 2, ir);
    ctx.strokeStyle = 'rgba(20,12,4,0.9)';
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }
  if (rivets) {
    const q = rim * 0.5 + 0.4;
    if (h >= 14) {
      rivet(ctx, x + q + 1.2, y + q + 1.2, rivetR, kind);
      rivet(ctx, x + w - q - 1.2, y + q + 1.2, rivetR, kind);
      rivet(ctx, x + q + 1.2, y + h - q - 1.2, rivetR, kind);
      rivet(ctx, x + w - q - 1.2, y + h - q - 1.2, rivetR, kind);
    }
  }
}

/** Row of rivets along a line (inside cached layers). */
export function rivets(ctx, x0, y0, x1, y1, n, r = 1.2, kind = 'brass') {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    rivet(ctx, lerp(x0, x1, t), lerp(y0, y1, t), r, kind);
  }
}

/** Brass cog (for ornaments). */
export function cog(ctx, x, y, r, teeth = 10, kind = 'brass', rotation = 0) {
  dkGear(ctx, x, y, r, teeth, { kind, rotation, spokes: r > 7 ? 5 : 0, hole: r * 0.22 });
}

/** Radial brass disc (bezels, badges). */
export function brassDisc(ctx, x, y, r, kind = 'brass') {
  ctx.beginPath();
  ctx.arc(x + 1, y + 2, r, 0, TAU);
  ctx.fillStyle = 'rgba(10,6,2,0.38)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, x, y, r, kind);
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

/** Glass sheen highlight for round gauges (top-left crescent). */
export function glassSheen(ctx, x, y, r, a = 0.35) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.clip();
  const g = ctx.createLinearGradient(x - r, y - r, x + r * 0.4, y + r * 0.4);
  g.addColorStop(0, `rgba(255,255,255,${a})`);
  g.addColorStop(0.45, `rgba(255,255,255,${a * 0.25})`);
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x - r * 0.25, y - r * 0.35, r * 0.95, r * 0.6, -0.6, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Soft additive dot texture (white), tinted at draw time via globalAlpha + composite. */
export function glowDot(ctx, x, y, r, color, a = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = a;
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

/** Diagonal hazard stripes filling the rect (cached tiles use this). */
export function stripes(ctx, x, y, w, h, period = 16, a = '#1d1508', b = '#e8b923') {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = b;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = a;
  ctx.beginPath();
  for (let s = x - h; s < x + w + h; s += period) {
    ctx.moveTo(s, y + h);
    ctx.lineTo(s + h, y);
    ctx.lineTo(s + h + period / 2, y);
    ctx.lineTo(s + period / 2, y + h);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}

// ---- odometer digits ----------------------------------------------------------------------

/**
 * Vertical strip "0123456789" + a trailing "0" so any rolling position p ∈ [0,10) maps to a
 * single source window [p, p+1] cells — one drawImage per digit.
 */
export function digitStrip(cache, key, cw, ch, size, color, glow) {
  return cache.get(key, cw, ch * 11, (ctx) => {
    ctx.font = font(size, 'm', 'bold');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 10; i++) {
      const d = String(i % 10);
      const y = ch * i + ch / 2 + 1;
      if (glow) {
        ctx.fillStyle = glow;
        ctx.fillText(d, cw / 2, y + 1.3);
      }
      ctx.fillStyle = color;
      ctx.fillText(d, cw / 2, y);
    }
  });
}

/**
 * Draw a mechanical odometer for a (fractional) value. Right-aligned at x.
 * @returns {number} width drawn (UI units)
 */
export function drawOdometer(ctx, strip, value, x, y, cw, ch, minDigits = 6, dimAlpha = 0.28) {
  const v = Math.max(0, value);
  const whole = Math.floor(v);
  const len = Math.max(minDigits, String(whole).length);
  const img = strip.img;
  const px = img.width / strip.w; // pixels per unit in the strip
  const sw = cw * px;
  const sh = ch * px;
  let pow = 1;
  const real = String(whole).length;
  for (let i = 0; i < len; i++) {
    let p;
    if (i === 0) {
      p = v % 10;
    } else {
      const lower = v % pow;
      const carry = Math.max(0, lower - (pow - 1));
      p = (Math.floor(v / pow) % 10) + carry;
    }
    if (p >= 10) p -= 10;
    const dx = x - (i + 1) * cw;
    ctx.globalAlpha = i >= real && whole > 0 ? dimAlpha : i >= real && i > 0 ? dimAlpha : 1;
    ctx.drawImage(img, 0, p * sh, sw, sh, dx, y, cw, ch);
    pow *= 10;
  }
  ctx.globalAlpha = 1;
  return len * cw;
}

// ---- safe area ------------------------------------------------------------------------------

/** Reads env(safe-area-inset-*) via a hidden probe element. */
export class SafeArea {
  constructor() {
    this.l = this.r = this.t = this.b = 0;
    this.el = null;
    this.read();
  }

  read() {
    try {
      if (!this.el) {
        const el = document.createElement('div');
        el.setAttribute('aria-hidden', 'true');
        el.style.cssText =
          'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
          'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) ' +
          'env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);';
        document.body.appendChild(el);
        this.el = el;
      }
      const cs = getComputedStyle(this.el);
      this.t = parseFloat(cs.paddingTop) || 0;
      this.r = parseFloat(cs.paddingRight) || 0;
      this.b = parseFloat(cs.paddingBottom) || 0;
      this.l = parseFloat(cs.paddingLeft) || 0;
    } catch {
      /* no DOM */
    }
  }
}

// ---- screen-space sparks ------------------------------------------------------------------

/** Tiny pooled spark/puff system for HUD juice (screen CSS px). */
export class HudSparks {
  constructor(max = 120) {
    this.max = max;
    this.list = [];
    this.pool = [];
  }

  /**
   * @param {{x:number,y:number,vx?:number,vy?:number,life?:number,size?:number,color?:string,
   *          grav?:number,drag?:number,kind?:'spark'|'puff'|'star'}} o
   */
  spawn(o) {
    if (this.list.length >= this.max) return;
    const p = this.pool.pop() || {};
    p.x = o.x;
    p.y = o.y;
    p.vx = o.vx || 0;
    p.vy = o.vy || 0;
    p.life = p.max = o.life || 0.6;
    p.size = o.size || 3;
    p.color = o.color || '#ffcf4a';
    p.grav = o.grav || 0;
    p.drag = o.drag ?? 2;
    p.kind = o.kind || 'spark';
    this.list.push(p);
  }

  burst(x, y, n, color, speed = 160, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = (opts.angle ?? 0) + (opts.spread ?? TAU) * (Math.random() - 0.5);
      const sp = speed * (0.35 + Math.random() * 0.65);
      this.spawn({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: (opts.life ?? 0.6) * (0.6 + Math.random() * 0.6),
        size: (opts.size ?? 2.5) * (0.6 + Math.random() * 0.8),
        color,
        grav: opts.grav ?? 220,
        drag: opts.drag ?? 2.5,
        kind: opts.kind || 'spark',
      });
    }
  }

  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) {
        L[i] = L[L.length - 1];
        L.pop();
        this.pool.push(p);
        continue;
      }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy = p.vy * d + p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  /** Draw in CSS px (caller sets the plain dpr transform). */
  draw(ctx, dot, puff) {
    const L = this.list;
    if (!L.length) return;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      if (p.kind === 'puff') continue;
      const k = p.life / p.max;
      const s = p.size * (0.5 + k);
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.drawImage(dot.img, p.x - s * 2, p.y - s * 2, s * 4, s * 4);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      if (p.kind !== 'puff') continue;
      const k = p.life / p.max;
      const s = p.size * (1.8 - k);
      ctx.globalAlpha = k * 0.55;
      ctx.drawImage(puff.img, p.x - s, p.y - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
  }
}

/** Format an integer with thin thousands separators (cached by value by the caller). */
export function groupDigits(n) {
  const s = String(Math.max(0, Math.floor(n)));
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i && (s.length - i) % 3 === 0) out += ',';
    out += s[i];
  }
  return out;
}
