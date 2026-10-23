// STUB (WP4 replaces) — pickups.
import { Sprites } from '../sprites.js';

const P = { xp: '#4fe3d0', xp_big: '#4fe3d0', cog: '#c9973f', cog_big: '#f2d48a', repair: '#d8452f', steam: '#9fe6ff', bomb: '#353a41', crate: '#a0703e' };
for (const [id, color] of Object.entries(P)) {
  const s = id.endsWith('_big') || id === 'crate' ? 24 : 14;
  Sprites.register(`pk_${id}`, {
    w: s, h: s,
    draw(ctx) {
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s / 2 - 1, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    },
  });
}
