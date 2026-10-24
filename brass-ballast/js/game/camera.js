// Camera rig: smoothed follow with aim/velocity lead, co-op framing (zoom out to fit every
// living player), boss framing (lean toward the nearest live boss and zoom out — within
// limits — so player and boss share the screen; a dying boss stays framed through its death
// show), trauma-based shake (scaled by
// Save.settings.shake; the player's own fire is capped so hits stand out), a directional recoil
// kick channel and zoom punches. Writes renderer.camera {x, y, zoomMul, shakeX, shakeY}.

import { Save } from '../core/storage.js';
import { clamp, damp, valueNoise } from '../core/math.js';

/**
 * Boss framing may zoom out to this fraction of the fight's base zoom, never further. Low
 * enough that a player kiting a big boss (kraken, ~650 u away) still sees its core above the
 * bottom HUD; MIN_ZOOM_MUL below remains the absolute readability floor.
 */
const BOSS_MIN_FIT = 0.7;
/** Absolute floor for the gameplay zoom multiplier (sprites stay readable on phones). */
const MIN_ZOOM_MUL = 0.6;
/** Keep players at least this far (screen px) inside the view edge while leaning to a boss. */
const EDGE_X = 170;
const EDGE_Y = 140;
/** Shake from the player's own guns & blasts (`shake(x, true)`) is scaled by OWN_SCALE and can
 *  only lift trauma to OWN_CAP (~3.5 px), so incoming hits (uncapped) still read as danger. */
const OWN_SCALE = 0.6;
const OWN_CAP = 0.4;
/** Directional recoil kick: px offset opposite the shot, decaying in ~80 ms; |kick| ≤ KICK_MAX. */
const KICK_DECAY = 30;
const KICK_MAX = 4;

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
    /** Boss-death hold {target, until (world seconds)}: see holdFocus(). */
    this.hold = null;
    this.kickX = 0;
    this.kickY = 0;
  }

  /**
   * Keep framing `target` — a boss that just died, i.e. its wreck and death show — as if it
   * were still a live boss until world time `until`, instead of snapping back to the player.
   */
  holdFocus(target, until) {
    this.hold = target && !target.def?.noFrame ? { target, until } : null;
  }

  /**
   * Add shake trauma (0..1, squared for falloff). `own` = the player's own fire/blasts/kills:
   * scaled down and capped (OWN_CAP) so it never drowns out the shake of being hit.
   */
  shake(amount, own = false) {
    if (!own) this.trauma = Math.min(1, this.trauma + amount);
    else if (this.trauma < OWN_CAP) this.trauma = Math.min(OWN_CAP, this.trauma + amount * OWN_SCALE);
  }

  /** Recoil kick: shove the view `px` screen pixels away from `angle` (the shot direction). */
  kick(angle, px) {
    const s = Math.min(1, Save.settings.shake ?? 1);
    if (!(s > 0)) return;
    this.kickX -= Math.cos(angle) * px * s;
    this.kickY -= Math.sin(angle) * px * s;
    const m = Math.hypot(this.kickX, this.kickY);
    if (m > KICK_MAX) {
      this.kickX *= KICK_MAX / m;
      this.kickY *= KICK_MAX / m;
    }
  }

  /** Positive = zoom in briefly, negative = zoom out. Follows the shake setting (0 = none). */
  zoomPunch(amount) {
    const scale = Math.min(1, Save.settings.shake ?? 1);
    this.punch = clamp(this.punch + amount * scale, -0.4, 0.4);
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
   * @param {number} [now] world time (expires the boss-death hold)
   */
  update(dt, players, bosses, now = 0) {
    this.t += dt;
    if (this.hold && !(now < this.hold.until)) this.hold = null;
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
      const boss = this.hold?.target || pickBoss(bosses, tx, ty);
      this.bossK = damp(this.bossK, boss ? 1 : 0, 2, dt);
      if (boss) {
        this.bossX = boss.x;
        this.bossY = boss.y;
      }
      if (this.bossK > 0.01) {
        const br = boss ? Math.min(300, boss.def?.frameR ?? (boss.r || 80) * 0.75) * (boss.scale || 1) : 0;
        const ux0 = Math.min(minX, this.bossX - br);
        const ux1 = Math.max(maxX, this.bossX + br);
        const uy0 = Math.min(minY, this.bossY - br);
        const uy1 = Math.max(maxY, this.bossY + br);
        // Usable screen: minus the HUD bands (portrait phones stack instruments 300+ px deep).
        // Capped so small/portrait screens (HUD 400 px deep, translucent touch sticks) still keep
        // ~40% of the height for the fight; the edge margins shrink with the screen too.
        const edgeX = Math.min(EDGE_X, r.cssW * 0.16);
        const edgeY = Math.min(EDGE_Y, r.cssH * 0.14);
        const eTop = Math.max(edgeY, Math.min((this.insets?.top || 0) + 40, r.cssH * 0.36));
        const eBot = Math.max(edgeY * 0.7, Math.min((this.insets?.bottom || 0) + 40, r.cssH * 0.22));
        const usableH = Math.max(120, r.cssH - eTop - eBot);
        const z = c.baseZoom * this.baseZoomMul;
        const fitB = clamp(Math.min(r.cssW / (z * (ux1 - ux0) + 2 * edgeX), usableH / (z * (uy1 - uy0))), BOSS_MIN_FIT, 1);
        const k = this.bossK;
        fitMul = Math.min(fitMul, 1 - (1 - fitB) * k);
        // Aim for the middle of player(s) + boss (centred in the usable band), but never push a
        // player past the safe edges: screen y of a player must stay within [eTop, H - eBot].
        const zf = c.baseZoom * Math.max(MIN_ZOOM_MUL, this.baseZoomMul * fitMul);
        const hx = Math.max(0, (r.cssW / 2 - edgeX) / zf);
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
    const kd = Math.exp(-KICK_DECAY * dt);
    this.kickX *= kd;
    this.kickY *= kd;
    if (Math.abs(this.kickX) + Math.abs(this.kickY) > 0.05) {
      c.shakeX += this.kickX;
      c.shakeY += this.kickY;
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
