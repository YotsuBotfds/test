// STUB (WP8 replaces) — generative music. API: DESIGN §4.17.
export class Music {
  /** @param {{ctx: AudioContext, out: AudioNode}} opts */
  constructor({ ctx, out } = {}) {
    this.ctx = ctx;
    this.out = out;
    this.track = null;
    this.intensity = 0;
  }
  play(track) {
    this.track = track;
  }
  stop() {
    this.track = null;
  }
  setIntensity(v) {
    this.intensity = v;
  }
}
