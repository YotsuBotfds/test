// STUB (WP6 replaces) — weather overlays & wind. API: DESIGN §4.16.
export class Weather {
  constructor(renderer) {
    this.renderer = renderer;
    this.wind = { x: 0, y: 0 };
    this.flash = 0;
  }
  setBiome() {}
  setIntensity() {}
  update(dt) {
    this.flash = Math.max(0, this.flash - dt * 3);
  }
  strike() {
    this.flash = 1;
  }
  draw() {}
}
