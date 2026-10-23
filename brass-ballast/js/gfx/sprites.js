// Procedural sprite registry & cache (DESIGN §4.14). Art modules register draw functions;
// sprites render lazily to offscreen canvases at SPRITE_SCALE and are reused every frame.

import { SPRITE_SCALE } from '../config.js';

const defs = new Map();
const cache = new Map(); // `${name}#${frame}` -> sprite
const flashCache = new Map(); // white silhouettes
const tintCache = new Map(); // `${key}|${color}`
const outlineCache = new Map();
const iconCache = new Map();
const warned = new Set();

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      const c = new OffscreenCanvas(w, h);
      // toDataURL is unavailable on OffscreenCanvas; icons use a DOM canvas instead.
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

function domCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function placeholderDef(name) {
  return {
    w: 32,
    h: 32,
    cx: 16,
    cy: 16,
    frames: 1,
    scale: SPRITE_SCALE,
    draw(ctx) {
      ctx.fillStyle = '#c9973f';
      ctx.strokeStyle = '#1a120a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(16, 16, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#1a120a';
      ctx.font = 'bold 16px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name.startsWith('icon_') ? '✦' : '?', 16, 17);
    },
  };
}

function render(name, def, frame) {
  const scale = def.scale || SPRITE_SCALE;
  const pw = Math.max(1, Math.ceil(def.w * scale));
  const ph = Math.max(1, Math.ceil(def.h * scale));
  const canvas = makeCanvas(pw, ph);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  try {
    def.draw(ctx, def.w, def.h, frame);
  } catch (err) {
    console.error(`[sprites] draw failed for "${name}" frame ${frame}`, err);
  }
  return { img: canvas, w: def.w, h: def.h, cx: def.cx ?? def.w / 2, cy: def.cy ?? def.h / 2 };
}

function silhouette(src, color) {
  const c = makeCanvas(src.img.width, src.img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(src.img, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return { img: c, w: src.w, h: src.h, cx: src.cx, cy: src.cy };
}

function blit(ctx, s, x, y, angle, scale, alpha) {
  if (alpha <= 0) return;
  const prevAlpha = ctx.globalAlpha;
  ctx.save();
  ctx.translate(x, y);
  if (angle) ctx.rotate(angle);
  ctx.globalAlpha = prevAlpha * alpha;
  ctx.drawImage(s.img, -s.cx * scale, -s.cy * scale, s.w * scale, s.h * scale);
  ctx.restore();
}

export const Sprites = {
  /**
   * Register a sprite. `draw(ctx, w, h, frame)` draws in world units, origin top-left,
   * facing +x. Re-registering replaces the def and invalidates caches.
   * @param {string} name
   * @param {{w:number,h:number,cx?:number,cy?:number,frames?:number,scale?:number,
   *          draw:(ctx:CanvasRenderingContext2D,w:number,h:number,frame:number)=>void}} def
   */
  register(name, def) {
    defs.set(name, { frames: 1, ...def });
    for (const store of [cache, flashCache, outlineCache]) {
      for (const k of store.keys()) if (k.startsWith(`${name}#`)) store.delete(k);
    }
    for (const k of tintCache.keys()) if (k.startsWith(`${name}#`)) tintCache.delete(k);
    for (const k of iconCache.keys()) if (k.startsWith(`${name}@`)) iconCache.delete(k);
  },

  has(name) {
    return defs.has(name);
  },

  def(name) {
    return defs.get(name);
  },

  list() {
    return [...defs.keys()];
  },

  frames(name) {
    return defs.get(name)?.frames || 1;
  },

  /** @returns {{img: CanvasImageSource, w:number, h:number, cx:number, cy:number}} */
  get(name, frame = 0) {
    let def = defs.get(name);
    if (!def) {
      if (!warned.has(name)) {
        warned.add(name);
        console.warn(`[sprites] missing sprite "${name}" — using placeholder`);
      }
      def = placeholderDef(name);
      defs.set(name, def);
    }
    const f = def.frames > 1 ? ((frame % def.frames) + def.frames) % def.frames | 0 : 0;
    const key = `${name}#${f}`;
    let s = cache.get(key);
    if (!s) {
      s = render(name, def, f);
      cache.set(key, s);
    }
    return s;
  },

  draw(ctx, name, x, y, angle = 0, scale = 1, alpha = 1, frame = 0) {
    blit(ctx, this.get(name, frame), x, y, angle, scale, alpha);
  },

  /** White silhouette overlay (hit flash). */
  drawFlash(ctx, name, x, y, angle = 0, scale = 1, amount = 1, frame = 0) {
    if (amount <= 0) return;
    const base = this.get(name, frame);
    const key = `${name}#${frame}`;
    let s = flashCache.get(key);
    if (!s) flashCache.set(key, (s = silhouette(base, '#ffffff')));
    blit(ctx, s, x, y, angle, scale, Math.min(1, amount));
  },

  /** Solid-color silhouette overlay (freeze, burn, elite tint…). */
  drawTint(ctx, name, x, y, angle = 0, scale = 1, color = '#ff0000', amount = 0.5, frame = 0) {
    if (amount <= 0) return;
    const base = this.get(name, frame);
    const key = `${name}#${frame}|${color}`;
    let s = tintCache.get(key);
    if (!s) tintCache.set(key, (s = silhouette(base, color)));
    blit(ctx, s, x, y, angle, scale, Math.min(1, amount));
  },

  /** Soft colored rim around the sprite (elite aura, selection). Draw *before* the sprite. */
  drawOutline(ctx, name, x, y, angle = 0, scale = 1, color = '#ffcf4a', alpha = 1, frame = 0) {
    if (alpha <= 0) return;
    const base = this.get(name, frame);
    const key = `${name}#${frame}|${color}`;
    let s = outlineCache.get(key);
    if (!s) {
      const pad = 6;
      const sc = base.img.width / base.w;
      const sil = silhouette(base, color);
      const c = makeCanvas(base.img.width + pad * 2 * sc, base.img.height + pad * 2 * sc);
      const octx = c.getContext('2d');
      const steps = 12;
      octx.globalAlpha = 0.35;
      for (const rad of [pad * 0.45, pad * 0.8]) {
        for (let i = 0; i < steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          octx.drawImage(sil.img, pad * sc + Math.cos(a) * rad * sc, pad * sc + Math.sin(a) * rad * sc);
        }
      }
      s = { img: c, w: base.w + pad * 2, h: base.h + pad * 2, cx: base.cx + pad, cy: base.cy + pad };
      outlineCache.set(key, s);
    }
    blit(ctx, s, x, y, angle, scale, alpha);
  },

  /**
   * Data URL of a sprite fitted into a square icon (for DOM <img>).
   * @param {string} name
   * @param {number} [px]
   */
  iconURL(name, px = 64, frame = 0) {
    const key = `${name}@${px}#${frame}`;
    let url = iconCache.get(key);
    if (url) return url;
    const s = this.get(name, frame);
    const c = domCanvas(px, px);
    const ctx = c.getContext('2d');
    const fit = Math.min(px / s.w, px / s.h);
    const dw = s.w * fit;
    const dh = s.h * fit;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(s.img, (px - dw) / 2, (px - dh) / 2, dw, dh);
    try {
      url = c.toDataURL('image/png');
    } catch {
      url = '';
    }
    iconCache.set(key, url);
    return url;
  },

  /**
   * Render every registered sprite (all frames) so gameplay never hitches.
   * @param {(done:number,total:number)=>void} [onProgress]
   */
  async prewarm(onProgress) {
    const jobs = [];
    for (const [name, def] of defs) for (let f = 0; f < (def.frames || 1); f++) jobs.push([name, f]);
    let last = performance.now();
    for (let i = 0; i < jobs.length; i++) {
      this.get(jobs[i][0], jobs[i][1]);
      if (performance.now() - last > 12) {
        onProgress?.(i + 1, jobs.length);
        await new Promise((r) => setTimeout(r, 0));
        last = performance.now();
      }
    }
    onProgress?.(jobs.length, jobs.length);
  },

  /** Drop rendered caches (e.g. after a quality change). Defs stay registered. */
  purge() {
    cache.clear();
    flashCache.clear();
    tintCache.clear();
    outlineCache.clear();
    iconCache.clear();
  },
};
