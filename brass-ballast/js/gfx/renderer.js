// Canvas, DPR handling and the camera transform (DESIGN §4.13). Camera behavior (follow,
// shake, zoom punch) is driven by game code writing to `renderer.camera`.

import { REF_W, REF_H } from '../config.js';
import { clamp } from '../core/math.js';

/**
 * World scale (device px per world unit) below which a 'medium' smoothing tier really uses
 * 'medium'. Sprites are baked at SPRITE_SCALE 2 (small craft 3), so mipmaps only pay off for
 * strong downscales; above this, bilinear 'low' looks the same and software rasterizers draw
 * every scaled/rotated image ~3.5x faster.
 */
const MEDIUM_BELOW = 0.75;

export class Renderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.dpr = 1;
    this.maxDpr = 2;
    /**
     * Tier smoothing quality ('low' | 'medium'; 'high' is very costly in software/phone
     * rasterizers). `ctxSmoothing` is what the main canvas uses right now (see MEDIUM_BELOW).
     */
    this.smoothing = 'medium';
    this.ctxSmoothing = 'low';
    this.cssW = 1;
    this.cssH = 1;
    this.camera = { x: 0, y: 0, zoom: 1, baseZoom: 1, zoomMul: 1, shakeX: 0, shakeY: 0 };
    /** Last world transform [scale, tx, ty] in device px (set by applyWorld). WP1 extension. */
    this.wm = [1, 0, 0];
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    window.visualViewport?.addEventListener('resize', this._onResize);
    this.resize();
  }

  setMaxDpr(v) {
    this.maxDpr = v;
    this.resize();
  }

  /** Set the image smoothing quality used for every drawImage on the main canvas. */
  setSmoothing(q) {
    this.smoothing = q;
    this._syncSmoothing();
  }

  /** Pick the main canvas smoothing for the tier and the current world scale. */
  _syncSmoothing(force = false) {
    const q = this.smoothing !== 'low' && this.camera.zoom * this.dpr < MEDIUM_BELOW ? this.smoothing : 'low';
    if (q === this.ctxSmoothing && !force) return;
    this.ctxSmoothing = q;
    this.ctx.imageSmoothingQuality = q;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width || window.innerWidth));
    const h = Math.max(1, Math.round(rect.height || window.innerHeight));
    this.dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    this.cssW = w;
    this.cssH = h;
    const pw = Math.round(w * this.dpr);
    const ph = Math.round(h * this.dpr);
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
    this.camera.baseZoom = clamp(Math.sqrt((w * h) / (REF_W * REF_H)), 0.5, 2);
    this.camera.zoom = this.camera.baseZoom * this.camera.zoomMul;
    // A canvas resize resets the context state: re-apply smoothing unconditionally.
    this.ctx.imageSmoothingEnabled = true;
    this._syncSmoothing(true);
  }

  updateZoom() {
    this.camera.zoom = this.camera.baseZoom * this.camera.zoomMul;
    this._syncSmoothing();
  }

  /** Screen-space transform: 1 unit = 1 CSS px. */
  applyScreen(ctx = this.ctx) {
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /** World-space transform centered on the camera (including shake). */
  applyWorld(ctx = this.ctx) {
    const c = this.camera;
    const z = c.zoom * this.dpr;
    const tx = (this.cssW / 2 + c.shakeX) * this.dpr - c.x * z;
    const ty = (this.cssH / 2 + c.shakeY) * this.dpr - c.y * z;
    this.wm[0] = z;
    this.wm[1] = tx;
    this.wm[2] = ty;
    ctx.setTransform(z, 0, 0, z, tx, ty);
  }

  /**
   * Fast sprite draw in world space without save/restore (WP1 extension). Uses the transform
   * captured by the last applyWorld(); leaves ctx.globalAlpha at `alpha` and the transform
   * rotated — call applyWorld(ctx) after a batch before regular drawing.
   * @param {CanvasRenderingContext2D} ctx
   * @param {{img:CanvasImageSource,w:number,h:number,cx:number,cy:number}} s from Sprites.get
   */
  blit(ctx, s, x, y, angle = 0, scale = 1, alpha = 1) {
    const m = this.wm;
    const z = m[0];
    const px = m[1] + x * z;
    const py = m[2] + y * z;
    if (angle) {
      const c = Math.cos(angle) * z;
      const sn = Math.sin(angle) * z;
      ctx.setTransform(c, sn, -sn, c, px, py);
    } else {
      ctx.setTransform(z, 0, 0, z, px, py);
    }
    ctx.globalAlpha = alpha;
    ctx.drawImage(s.img, -s.cx * scale, -s.cy * scale, s.w * scale, s.h * scale);
  }

  worldToScreen(x, y, out = { x: 0, y: 0 }) {
    const c = this.camera;
    out.x = (x - c.x) * c.zoom + this.cssW / 2 + c.shakeX;
    out.y = (y - c.y) * c.zoom + this.cssH / 2 + c.shakeY;
    return out;
  }

  screenToWorld(sx, sy, out = { x: 0, y: 0 }) {
    const c = this.camera;
    out.x = (sx - this.cssW / 2 - c.shakeX) / c.zoom + c.x;
    out.y = (sy - this.cssH / 2 - c.shakeY) / c.zoom + c.y;
    return out;
  }

  /** Visible world rectangle, grown by `margin` world units. */
  viewRect(margin = 0, out = {}) {
    const c = this.camera;
    const hw = this.cssW / 2 / c.zoom + margin;
    const hh = this.cssH / 2 / c.zoom + margin;
    out.x0 = c.x - hw;
    out.y0 = c.y - hh;
    out.x1 = c.x + hw;
    out.y1 = c.y + hh;
    out.w = hw * 2;
    out.h = hh * 2;
    return out;
  }

  clear(color = '#1b130b') {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
