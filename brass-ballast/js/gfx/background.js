// STUB (WP6 replaces) — parallax backdrop. API: DESIGN §4.16.
import { BIOMES } from './biomes.js';

export class Background {
  constructor(renderer) {
    this.renderer = renderer;
    this.biome = BIOMES.brassbay;
  }
  setBiome(id) {
    this.biome = BIOMES[id] || BIOMES.brassbay;
  }
  update() {}
  drawBack(ctx, renderer) {
    renderer.applyScreen(ctx);
    const g = ctx.createLinearGradient(0, 0, 0, renderer.cssH);
    g.addColorStop(0, this.biome.sky[0]);
    g.addColorStop(1, this.biome.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, renderer.cssW, renderer.cssH);
    // Parallax dot grid so motion reads even with the stub.
    const cam = renderer.camera;
    const step = 140;
    const par = 0.5;
    const ox = (((-cam.x * par * cam.zoom) % step) + step) % step;
    const oy = (((-cam.y * par * cam.zoom) % step) + step) % step;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let x = ox; x < renderer.cssW; x += step) {
      for (let y = oy; y < renderer.cssH; y += step) ctx.fillRect(x, y, 3, 3);
    }
  }
  drawFront() {}
}
