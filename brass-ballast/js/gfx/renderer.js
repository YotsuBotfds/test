// Canvas, DPR handling and the camera transform (DESIGN §4.13). Camera behavior (follow,
// shake, zoom punch) is driven by game code writing to `renderer.camera`.

import { REF_W, REF_H } from '../config.js';
import { clamp } from '../core/math.js';

export class Renderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.dpr = 1;
    this.maxDpr = 2;
    this.cssW = 1;
    this.cssH = 1;
    this.camera = { x: 0, y: 0, zoom: 1, baseZoom: 1, zoomMul: 1, shakeX: 0, shakeY: 0 };
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    window.visualViewport?.addEventListener('resize', this._onResize);
    this.resize();
  }

  setMaxDpr(v) {
    this.maxDpr = v;
    this.resize();
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
    this.updateZoom();
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
  }

  updateZoom() {
    this.camera.zoom = this.camera.baseZoom * this.camera.zoomMul;
  }

  /** Screen-space transform: 1 unit = 1 CSS px. */
  applyScreen(ctx = this.ctx) {
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /** World-space transform centered on the camera (including shake). */
  applyWorld(ctx = this.ctx) {
    const c = this.camera;
    const z = c.zoom * this.dpr;
    ctx.setTransform(
      z,
      0,
      0,
      z,
      (this.cssW / 2 + c.shakeX) * this.dpr - c.x * z,
      (this.cssH / 2 + c.shakeY) * this.dpr - c.y * z
    );
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
