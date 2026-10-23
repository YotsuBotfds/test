// STUB (WP4 replaces) — particle/FX textures.
import { Sprites } from '../sprites.js';

function soft(name, color, frames = 1) {
  Sprites.register(name, {
    w: 32, h: 32, frames,
    draw(ctx) {
      const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 32, 32);
    },
  });
}
soft('fx_glow', 'rgba(255,255,255,1)');
soft('fx_glow_soft', 'rgba(255,255,255,0.6)');
soft('fx_smoke', 'rgba(120,110,100,0.8)', 3);
soft('fx_spark', 'rgba(255,230,160,1)');
soft('fx_cog', 'rgba(201,151,63,1)');
soft('fx_debris', 'rgba(90,70,50,1)', 4);
soft('fx_shadow', 'rgba(0,0,0,0.9)');
soft('fx_ring', 'rgba(255,255,255,0.8)');
soft('fx_flare', 'rgba(255,255,255,1)');
soft('fx_steam', 'rgba(244,241,234,0.8)');
