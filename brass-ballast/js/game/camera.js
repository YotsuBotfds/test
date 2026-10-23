// Camera rig: smoothed follow with aim/velocity lead, co-op framing (zoom out to fit every
// living player), boss framing (lean toward the nearest live boss and zoom out — within
// limits — so player and boss share the screen), trauma-based shake (scaled by
// Save.settings.shake) and zoom punches. Writes renderer.camera {x, y, zoomMul, shakeX, shakeY}.

import { Save } from '../core/storage.js';
import { clamp, damp, valueNoise } from '../core/math.js';

/** Boss framing may zoom out to this fraction of the fight's base zoom, never further. */
const BOSS_MIN_FIT = 0.78;
/** Absolute floor for the gameplay zoom multiplier (sprites stay readable on phones). */
const MIN_ZOOM_MUL = 0.6;
/** Keep players at least this far (screen px) inside the view edge while leaning to a boss. */
const EDGE_X = 170;
const EDGE_Y = 140;

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
    this.bossX = 0;
    this.bossY = 0;
    /** HUD-covered screen bands {top, bottom} in CSS px (set by the game each frame). */
    this.insets = null;
    /** 0..1 how much boss framing is applied (eases in/out). */
    this.bossK = 0;
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
   * @param {any[]} [bosses] live main boss bodies (world.bosses)
   */
  update(dt, players, bosses) {
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
        const aimLead = clamp((p.aimDist || 200) * 0.22, 30, 120) * (1 - 0.6 * this.bossK);
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
      // Boss framing: lean toward the boss and zoom out so both stay on screen.
      const boss = pickBoss(bosses, tx, ty);
      this.bossK = damp(this.bossK, boss ? 1 : 0, 2, dt);
      if (boss) {
        this.bossX = boss.x;
        this.bossY = boss.y;
      }
      if (this.bossK > 0.01) {
        const br = boss ? Math.min(280, (boss.r || 80) * (boss.scale || 1)) * 0.75 : 0;
        const ux0 = Math.min(minX, this.bossX - br);
        const ux1 = Math.max(maxX, this.bossX + br);
        const uy0 = Math.min(minY, this.bossY - br);
        const uy1 = Math.max(maxY, this.bossY + br);
        // Usable screen: minus the HUD bands (portrait phones stack instruments 300+ px deep).
        const eTop = Math.max(EDGE_Y, (this.insets?.top || 0) + 50);
        const eBot = Math.max(EDGE_Y * 0.7, (this.insets?.bottom || 0) + 40);
        const usableH = Math.max(120, r.cssH - eTop - eBot);
        const z = c.baseZoom * this.baseZoomMul;
        const fitB = clamp(Math.min(r.cssW / (z * (ux1 - ux0 + 2 * EDGE_X)), usableH / (z * (uy1 - uy0))), BOSS_MIN_FIT, 1);
        const k = this.bossK;
        fitMul = Math.min(fitMul, 1 - (1 - fitB) * k);
        // Aim for the middle of player(s) + boss (centred in the usable band), but never push a
        // player past the safe edges: screen y of a player must stay within [eTop, H - eBot].
        const zf = c.baseZoom * Math.max(MIN_ZOOM_MUL, this.baseZoomMul * fitMul);
        const hx = Math.max(0, r.cssW / 2 / zf - EDGE_X);
        const mx = clamp((ux0 + ux1) / 2, maxX - hx, minX + hx);
        const bandShift = (eTop - eBot) / 2 / zf; // centre of the usable band vs screen centre
        const yLo = maxY - (r.cssH / 2 - eBot) / zf;
        const yHi = minY + (r.cssH / 2 - eTop) / zf;
        const my = yLo <= yHi ? clamp((uy0 + uy1) / 2 - bandShift, yLo, yHi) : (yLo + yHi) / 2;
        tx += (mx - tx) * k * 0.85;
        ty += (my - ty) * k * 0.85;
      }
    }
    this.focusX = damp(this.focusX, tx, 6, dt);
    this.focusY = damp(this.focusY, ty, 6, dt);
    c.x = this.focusX;
    c.y = this.focusY;

    // Zoom: gameplay base × co-op fit × punch.
    this.punch = damp(this.punch, 0, 4, dt);
    this.zoomMul = damp(this.zoomMul, Math.max(MIN_ZOOM_MUL, this.baseZoomMul * fitMul), 2.5, dt);
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

/** Nearest live main boss to (x, y) that is worth framing (null if none). */
function pickBoss(bosses, x, y) {
  if (!bosses || !bosses.length) return null;
  let best = null;
  let bd = Infinity;
  for (const b of bosses) {
    if (!b.alive || b.dead || b.def?.noFrame) continue;
    const d = (b.x - x) ** 2 + (b.y - y) ** 2;
    // Far away (still sailing in from a distance): don't yank the camera across the map.
    if (d > 2600 * 2600) continue;
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}
