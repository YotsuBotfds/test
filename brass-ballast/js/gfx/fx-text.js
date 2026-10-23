// Floating combat text for FX (WP3): damage numbers & callouts.
//
// Each distinct (string, colour, size, style) is rasterised once into a small bitmap with a
// dark ink outline and cached (LRU), so hundreds of numbers per second cost one drawImage each.
// Motion: pop-in with overshoot, rise with ease-out and a little sideways drift, fade at the end.
// Crits: gold gradient, larger, '!' suffix, extra punch and a brief wobble.

import { FONT_BODY, FONT_DISPLAY } from '../config.js';

const RS = 3; // bitmap pixels per world unit (stays crisp at zoom 1.5 on DPR 2)
const CACHE_CAP = 220;
const MAX_TEXTS = 140;

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      const c = new OffscreenCanvas(w, h);
      if (c.getContext('2d')) return c;
    } catch {
      /* fall through */
    }
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

let measureCtx = null;

function shade(hex, k) {
  // k>0 lighten toward white, k<0 darken toward black
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  let r = (v >> 16) & 255;
  let g = (v >> 8) & 255;
  let b = v & 255;
  if (k > 0) {
    r += (255 - r) * k;
    g += (255 - g) * k;
    b += (255 - b) * k;
  } else {
    r *= 1 + k;
    g *= 1 + k;
    b *= 1 + k;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

/**
 * Rasterise one label. Returns {img, w, h} with w/h in world units.
 * style: 0 normal, 1 crit, 2 callout (display font, wider tracking)
 */
function rasterise(str, color, size, style) {
  const px = Math.max(6, Math.round(size * RS));
  const font =
    style === 2 ? `bold ${px}px ${FONT_DISPLAY}` : `${style === 1 ? 900 : 'bold'} ${px}px ${FONT_BODY}`;
  if (!measureCtx) measureCtx = makeCanvas(4, 4).getContext('2d');
  measureCtx.font = font;
  const tw = Math.ceil(measureCtx.measureText(str).width);
  const outline = Math.max(2, Math.round(px * (style === 1 ? 0.24 : 0.2)));
  const pad = outline + 4;
  const w = tw + pad * 2;
  const h = Math.ceil(px * 1.35) + pad * 2;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const cx = w / 2;
  const cy = h / 2 + px * 0.04;
  // drop shadow (offset bottom-right, light from top-left)
  ctx.fillStyle = 'rgba(10,6,3,0.55)';
  ctx.strokeStyle = 'rgba(10,6,3,0.55)';
  ctx.lineWidth = outline;
  ctx.strokeText(str, cx + px * 0.06, cy + px * 0.08);
  // ink outline
  ctx.strokeStyle = '#1a120a';
  ctx.lineWidth = outline;
  ctx.strokeText(str, cx, cy);
  // fill
  let fill;
  if (style === 1) {
    fill = ctx.createLinearGradient(0, cy - px * 0.5, 0, cy + px * 0.5);
    fill.addColorStop(0, '#fffbe6');
    fill.addColorStop(0.38, '#ffe27a');
    fill.addColorStop(0.62, color);
    fill.addColorStop(1, '#c8701a');
  } else {
    fill = ctx.createLinearGradient(0, cy - px * 0.5, 0, cy + px * 0.5);
    fill.addColorStop(0, shade(color, 0.45));
    fill.addColorStop(0.55, color);
    fill.addColorStop(1, shade(color, -0.25));
  }
  ctx.fillStyle = fill;
  ctx.fillText(str, cx, cy);
  if (style === 1) {
    // thin bright engraving line across the top half
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(0, cy - px * 0.42, w, px * 0.12);
    ctx.globalCompositeOperation = 'source-over';
  }
  return { img: c, w: w / RS, h: h / RS };
}

const NUMERIC = /^[+-]?\d[\d,.]*!?$/;

export class FloatTexts {
  constructor() {
    /** @type {object[]} */
    this.list = [];
    /** @type {Map<string, {img:CanvasImageSource,w:number,h:number}>} */
    this.cache = new Map();
    this.minScreenSize = 0.85; // keep labels legible when the camera zooms far out
  }

  get count() {
    return this.list.length;
  }

  _bitmap(str, color, size, style) {
    const key = `${str}|${color}|${size}|${style}`;
    let b = this.cache.get(key);
    if (b) {
      // refresh LRU position
      this.cache.delete(key);
      this.cache.set(key, b);
      return b;
    }
    b = rasterise(str, color, size, style);
    if (this.cache.size >= CACHE_CAP) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, b);
    return b;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {string|number} str
   * @param {{color?:string, size?:number, life?:number, rise?:number, crit?:boolean,
   *   key?:any, callout?:boolean, vx?:number}} [o]
   */
  add(x, y, str, o = {}) {
    const crit = !!o.crit;
    let s = String(str);
    const numeric = NUMERIC.test(s);
    // Merge rapid hits on the same target into one growing number.
    if (o.key !== undefined && numeric) {
      for (const t of this.list) {
        if (t.key === o.key && t.t < 0.4 && t.crit === crit && t.value !== null) {
          t.value += parseFloat(s.replace(/[,!]/g, '')) || 0;
          t.str = formatNum(t.value) + (crit ? '!' : '');
          t.t = 0.04;
          t.punch = 1;
          t.bmp = null;
          return t;
        }
      }
    }
    if (crit && !s.endsWith('!')) s += '!';
    const callout = !!o.callout || (!numeric && o.callout !== false && s.length > 4);
    const size = Math.round(o.size || (crit ? 20 : 14));
    if (this.list.length >= MAX_TEXTS) this.list.shift();
    const t = {
      x: x + (Math.random() - 0.5) * 8,
      y: y - 4,
      vx: o.vx ?? (Math.random() - 0.5) * (crit ? 30 : 22),
      rise: o.rise ?? (callout ? 26 : crit ? 48 : 36),
      str: s,
      value: numeric && o.key !== undefined ? parseFloat(s.replace(/[,!]/g, '')) || 0 : null,
      key: o.key,
      color: o.color || (crit ? '#ffcf4a' : '#fff3dc'),
      size,
      style: callout ? 2 : crit ? 1 : 0,
      life: o.life || (callout ? 1.4 : crit ? 1.0 : 0.75),
      crit,
      punch: 0,
      t: 0,
      bmp: null,
      y0: 0,
    };
    t.y0 = t.y;
    this.list.push(t);
    return t;
  }

  update(dt) {
    const L = this.list;
    let n = L.length;
    for (let i = 0; i < n; ) {
      const t = L[i];
      t.t += dt;
      if (t.t >= t.life) {
        L.splice(i, 1);
        n--;
        continue;
      }
      t.x += t.vx * dt;
      t.vx *= 1 / (1 + 3 * dt);
      if (t.punch > 0) t.punch = Math.max(0, t.punch - dt * 5);
      i++;
    }
  }

  draw(ctx, renderer) {
    const L = this.list;
    if (!L.length) return;
    const m = ctx.getTransform();
    const prevAlpha = ctx.globalAlpha;
    const prevComp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'source-over';
    const zoom = renderer?.camera?.zoom || 1;
    const zk = zoom < this.minScreenSize ? this.minScreenSize / zoom : 1;
    for (const t of L) {
      const u = t.t / t.life;
      const pop = 1 - Math.exp(-t.t * 32);
      const over = (t.crit ? 0.95 : 0.5) * Math.exp(-t.t * (t.crit ? 7 : 10));
      const sc = (pop * (1 + over) + t.punch * 0.35) * zk;
      if (sc <= 0.01) continue;
      const rise = 1 - (1 - Math.min(1, u * 1.6)) ** 3;
      const y = t.y0 - t.rise * rise;
      const al = u < 0.62 ? 1 : 1 - (u - 0.62) / 0.38;
      if (!t.bmp) t.bmp = this._bitmap(t.str, t.color, t.size, t.style);
      const b = t.bmp;
      const rot = t.crit ? Math.sin(t.t * 38) * 0.16 * Math.exp(-t.t * 7) : 0;
      const cs = Math.cos(rot) * sc;
      const sn = Math.sin(rot) * sc;
      ctx.setTransform(
        m.a * cs + m.c * sn,
        m.b * cs + m.d * sn,
        -m.a * sn + m.c * cs,
        -m.b * sn + m.d * cs,
        m.a * t.x + m.c * y + m.e,
        m.b * t.x + m.d * y + m.f
      );
      ctx.globalAlpha = prevAlpha * al;
      ctx.drawImage(b.img, -b.w / 2, -b.h / 2, b.w, b.h);
    }
    ctx.setTransform(m);
    ctx.globalAlpha = prevAlpha;
    ctx.globalCompositeOperation = prevComp;
  }

  clear() {
    this.list.length = 0;
  }
}

function formatNum(v) {
  const r = Math.round(v);
  return Math.abs(r - v) < 0.05 ? String(r) : v.toFixed(1);
}
