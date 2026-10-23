// requestAnimationFrame driver with frame-delta clamping and an FPS meter (DESIGN §4.1).
// The loop knows nothing about the game: it hands the real frame delta (seconds, clamped to
// 0.25 s so a backgrounded tab never produces a giant step) to `tick(dt, now)`.

/**
 * @typedef {(dt: number, now: number) => void} TickFn
 */
export class Loop {
  /** @param {TickFn} tick */
  constructor(tick) {
    this.tick = tick;
    this.running = false;
    this.last = 0;
    this.raf = 0;
    /** Smoothed frames per second (updated twice a second). */
    this.fps = 60;
    /** Smoothed frame time in ms. */
    this.frameMs = 16.7;
    this._acc = 0;
    this._frames = 0;
    this._frame = (now) => this._step(now);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this._frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  _step(now) {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this._frame);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.25) dt = 0.25;
    this._acc += dt;
    this._frames++;
    if (this._acc >= 0.5) {
      this.fps = this._frames / this._acc;
      this.frameMs = (this._acc / this._frames) * 1000;
      this._acc = 0;
      this._frames = 0;
    }
    try {
      this.tick(dt, now);
    } catch (err) {
      // Never let one bad frame kill the loop; surface it once per message.
      const msg = String(err?.stack || err);
      if (msg !== this._lastErr) {
        this._lastErr = msg;
        console.error('[loop] frame threw', err);
      }
    }
  }
}
