// STUB (WP4 replaces) — player (pb_*) and enemy (eb_*) projectiles.
import { Sprites } from '../sprites.js';

function orb(name, r, core, rim) {
  const s = r * 2 + 4;
  Sprites.register(name, {
    w: s, h: s,
    draw(ctx) {
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, r, 0, Math.PI * 2);
      ctx.fillStyle = rim;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, r * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = core;
      ctx.fill();
    },
  });
}
for (const n of ['ball', 'bullet', 'pellet', 'shell', 'lance', 'harpoon', 'rocket', 'mine', 'bomb', 'saw', 'flak', 'spark', 'drone']) {
  orb(`pb_${n}`, 6, '#fff3c4', '#c9973f');
}
for (const n of ['orb', 'shell', 'needle', 'spark', 'slag', 'flak', 'mortar', 'bomb']) {
  orb(`eb_${n}`, 7, '#ffd2a0', '#ff4d2e');
}
