// Camera rig: smoothed follow with aim/velocity lead, co-op framing (zoom out to fit every
// living player), trauma-based shake (scaled by Save.settings.shake) and zoom punches.
// Writes renderer.camera {x, y, zoomMul, shakeX, shakeY}.

import { Save } from '../core/storage.js';
import { clamp, damp, valueNoise } from '../core/math.js';

export class CameraRig {
  /** @param {import('../gfx/renderer.js').Renderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    this.trauma = 0;
    this.punch = 0;
    this.zoomMul = 1;
    /** Gameplay zoom target (e.g. 0.9 during boss fights). */
    this.baseZoomMul = 1;
    this.t = 0;
    this.leadX = 0;
    this.leadY = 0;
    this.focusX = 0;
    this.focusY = 0;
    /** Optional override focus point {x,y} (cinematics). */
    this.override = null;
  }

  /** Add shake trauma (0..1, squared for falloff). */
  shake(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Positive = zoom in briefly, negative = zoom out. */
  zoomPunch(amount) {
    this.punch = clamp(this.punch + amount, -0.4, 0.4);
  }

  snap(x, y) {
    const c = this.renderer.camera;
    c.x = x;
    c.y = y;
    this.focusX = x;
    this.focusY = y;
    this.leadX = 0;
    this.leadY = 0;
  }

  /**
   * @param {number} dt real (unscaled) seconds
   * @param {any[]} players
   */
  update(dt, players) {
    this.t += dt;
    const r = this.renderer;
    const c = r.camera;
    // Focus: average of living players (fall back to everyone).
    let n = 0;
    let sx = 0;
    let sy = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let any = false;
    for (const p of players) if (p.alive) any = true;
    for (const p of players) {
      if (any && !p.alive) continue;
      sx += p.x;
      sy += p.y;
      n++;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    let tx = c.x;
    let ty = c.y;
    let fitMul = 1;
    if (this.override) {
      tx = this.override.x;
      ty = this.override.y;
    } else if (n > 0) {
      tx = sx / n;
      ty = sy / n;
      if (n === 1) {
        // Lead toward aim (mouse distance-scaled) and travel direction.
        let p = players[0];
        for (const q of players) {
          if (q.alive) {
            p = q;
            break;
          }
        }
        const aimLead = clamp((p.aimDist || 200) * 0.22, 30, 120);
        const lx = Math.cos(p.aim) * aimLead + p.vx * 0.22;
        const ly = Math.sin(p.aim) * aimLead + p.vy * 0.22;
        this.leadX = damp(this.leadX, lx, 3, dt);
        this.leadY = damp(this.leadY, ly, 3, dt);
      } else {
        this.leadX = damp(this.leadX, 0, 3, dt);
        this.leadY = damp(this.leadY, 0, 3, dt);
        // Co-op: zoom out so everyone fits with a margin.
        const spanX = maxX - minX + 380;
        const spanY = maxY - minY + 300;
        const z = c.baseZoom * this.baseZoomMul;
        fitMul = Math.min(1, r.cssW / (z * spanX), r.cssH / (z * spanY));
        fitMul = clamp(fitMul, 0.55, 1);
      }
      tx += this.leadX;
      ty += this.leadY;
    }
    this.focusX = damp(this.focusX, tx, 6, dt);
    this.focusY = damp(this.focusY, ty, 6, dt);
    c.x = this.focusX;
    c.y = this.focusY;

    // Zoom: gameplay base × co-op fit × punch.
    this.punch = damp(this.punch, 0, 4, dt);
    this.zoomMul = damp(this.zoomMul, this.baseZoomMul * fitMul, 2.5, dt);
    c.zoomMul = this.zoomMul * (1 + this.punch);
    r.updateZoom();

    // Trauma shake (Perlin-ish noise so it rolls rather than jitters).
    this.trauma = Math.max(0, this.trauma - dt * 1.3);
    const scale = Save.settings.shake ?? 1;
    const amt = this.trauma * this.trauma * 22 * scale;
    if (amt > 0.01) {
      const t = this.t * 28;
      c.shakeX = (valueNoise(t, 0.5, 11) * 2 - 1) * amt;
      c.shakeY = (valueNoise(0.5, t, 23) * 2 - 1) * amt;
    } else {
      c.shakeX = 0;
      c.shakeY = 0;
    }
  }
}
