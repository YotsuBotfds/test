// Graphics quality tiers + the automatic quality governor (DESIGN §8).
//
// Save.settings.quality is 'auto' (default), 'high' or 'low'. 'high'/'low' pin a tier; 'auto'
// starts at high and lets the governor step down when gameplay (or the title attract scene)
// runs slowly (smoothed fps < 45 for 4 s) and back up when it is comfortably fast again.
// Everything that scales with quality reads `Quality.tier` / `Quality.cfg` live, so a change
// applies on the next frame; consumers that must rebuild something (DPR, background tiles)
// listen for 'quality:change'.
// A `quality=auto|high|medium|low` URL flag overrides the saved setting (tests/benchmarks).

import { Save } from '../core/storage.js';
import { events } from '../core/events.js';
import { FLAGS } from '../config.js';

/**
 * Tier table. dpr = canvas DPR cap; particles = spawn-count scale; cap = particle-pool fraction;
 * smoothing = best ctx.imageSmoothingQuality (SwiftShader/phones pay a lot for 'high'; the
 *   renderer only uses 'medium' when sprites are strongly downscaled, see renderer.js);
 * bg = backdrop detail (2 full, 1 merged overlay + no cloud shadows, 0 also half-res tiles).
 */
export const TIERS = [
  { id: 'low', dpr: 1, particles: 0.45, cap: 0.35, smoothing: 'low', bg: 0, weather: 0.5 },
  { id: 'medium', dpr: 1.5, particles: 0.7, cap: 0.6, smoothing: 'low', bg: 1, weather: 0.75 },
  { id: 'high', dpr: 2, particles: 1, cap: 1, smoothing: 'medium', bg: 2, weather: 1 },
];

const DOWN_FPS = 45;
const DOWN_SECS = 4;
const UP_FPS = 57;
const UP_SECS = 10;
/** After a menu/pause/level-up card: skip this long before timing again (resume hitches). */
const RESUME_SETTLE = 0.5;
/** A step-up that stays out of the slow zone this long has held (clears the failure flag). */
const HOLD_SECS = 20;

class QualityGovernor {
  constructor() {
    /** Governor tier while the setting is 'auto' (0 low … 2 high). */
    this.autoTier = 2;
    /** Smoothed gameplay fps (EMA over ~1 s). */
    this.fps = 60;
    /**
     * Display refresh estimate: the highest ~1 s average frame rate seen over all frames (menus
     * are cheap, so they run at vsync). 0 until measured. A 50 Hz display (TVs, some laptops)
     * lowers the step-up threshold, which 57 fps would otherwise make unreachable. Only a peak
     * that sits on 50 counts: a 60 Hz device that never beats 55 fps must not step up at 52.
     */
    this.refresh = 0;
    this._rate = 60;
    this._seen = 0;
    this._slowT = 0;
    this._fastT = 0;
    this._heldT = 0;
    this._settle = 0;
    this._resume = 0;
    /** Failed step-ups per tier: each one doubles the wait before trying that tier again. */
    this._fails = [0, 0, 0];
    this._lastDropFrom = -1;
    this._lastTier = this.tier;
  }

  /** 'auto' | 'high' | 'low' (URL flag wins over the saved setting). */
  get setting() {
    const f = FLAGS.quality;
    if (f === 'high' || f === 'low' || f === 'medium' || f === 'auto') return f;
    const s = Save.settings?.quality;
    return s === 'high' || s === 'low' ? s : 'auto';
  }

  /** Effective tier index 0..2. */
  get tier() {
    const s = this.setting;
    if (s === 'high') return 2;
    if (s === 'low') return 0;
    if (s === 'medium') return 1;
    return this.autoTier;
  }

  /** Effective tier config (see TIERS). */
  get cfg() {
    return TIERS[this.tier];
  }

  get low() {
    return this.tier === 0;
  }

  /** Re-check after a settings change; emits 'quality:change' if the effective tier moved. */
  sync() {
    if (this.setting !== 'auto') {
      this._slowT = 0;
      this._fastT = 0;
    }
    this._emitIfChanged('setting');
  }

  /**
   * Feed one real frame. `active` = gameplay is running (title/menus/pauses don't count).
   * @param {number} rawDt real seconds since the last frame
   * @param {boolean} active
   */
  sample(rawDt, active) {
    if (!(rawDt > 0) || rawDt > 0.5) return;
    const inst = 1 / rawDt;
    const k = Math.min(1, rawDt * 1.5);
    this._rate += (inst - this._rate) * k;
    this._seen += rawDt;
    if (this._seen > 3 && this._rate > this.refresh) this.refresh = Math.min(240, this._rate);
    if (this.setting !== 'auto') {
      this._slowT = 0;
      this._fastT = 0;
      return;
    }
    if (!active) {
      // Menus, pauses, level-up cards: freeze the timers and the fps average rather than
      // resetting them. Late in a run cards come every few seconds, and a reset each time
      // meant a tier dropped during one spike could never step back up.
      this._resume = RESUME_SETTLE;
      return;
    }
    if (this._resume > 0) {
      this._resume -= rawDt;
      return;
    }
    this.fps += (inst - this.fps) * k;
    if (this._settle > 0) {
      // Just changed tier (canvas resize, tile repaint): let the numbers settle first.
      this._settle -= rawDt;
      return;
    }
    const upFps = Math.abs(this.refresh - 50) < 1.5 ? 47.5 : UP_FPS;
    if (this.fps < DOWN_FPS) {
      this._slowT += rawDt;
      this._fastT = 0;
    } else {
      this._slowT = Math.max(0, this._slowT - rawDt * 0.5);
      this._fastT = this.fps > upFps ? this._fastT + rawDt : Math.max(0, this._fastT - rawDt);
      this._heldT += rawDt;
    }
    if (this._slowT >= DOWN_SECS && this.autoTier > 0) {
      // A step-up that immediately turns slow again counts as a failure for that tier.
      if (this._lastDropFrom === -2) this._fails[this.autoTier] = Math.min(4, this._fails[this.autoTier] + 1);
      this._lastDropFrom = this.autoTier;
      this.autoTier--;
      this._changed('slow');
    } else if (this.autoTier < 2 && this._fastT >= UP_SECS * 2 ** this._fails[this.autoTier + 1]) {
      this.autoTier++;
      this._lastDropFrom = -2;
      this._changed('fast');
    } else if (this._lastDropFrom === -2 && this._heldT > HOLD_SECS) {
      this._lastDropFrom = -1; // the step-up held (a drop much later is not its failure)
    }
  }

  /** Back to the top tier (e.g. a fresh device/benchmark); keeps the failure memory. */
  reset() {
    this.autoTier = 2;
    this._slowT = 0;
    this._fastT = 0;
    this._emitIfChanged('reset');
  }

  _changed(reason) {
    this._slowT = 0;
    this._fastT = 0;
    this._heldT = 0;
    this._settle = 1.5;
    this.fps = 50;
    this._emitIfChanged(reason);
  }

  _emitIfChanged(reason) {
    const t = this.tier;
    if (t === this._lastTier) return;
    this._lastTier = t;
    events.emit('quality:change', { tier: t, id: TIERS[t].id, reason });
  }
}

/** Singleton governor. */
export const Quality = new QualityGovernor();
