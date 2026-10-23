// Pickups (WP4): aether shards (XP), brass cogs (currency), repair kit, steam canister, ballast
// bomb and the armory crate. Glows are baked in; the engine bobs and pulses them.

import { Sprites } from '../sprites.js';
import {
  PAL, glow, crystal, gear, metal, metalRadial, cylinderGrad, cylinder, ink, polygon, roundRect,
  rivet, star, gauge, deck, alpha, mix, crest,
} from '../drawkit.js';

const TAU = Math.PI * 2;

function reg(name, w, h, draw) {
  Sprites.register(name, { w, h, scale: 3, draw });
}

/** Little four-point twinkle. */
function twinkle(ctx, x, y, r, color = '#ffffff') {
  star(ctx, x, y, r, r * 0.22, 4, 0);
  ctx.fillStyle = color;
  ctx.fill();
}

reg('pk_xp', 14, 14, (ctx) => {
  glow(ctx, 7, 7, 7, PAL.xp, 0.75);
  crystal(ctx, 7, 7.2, 5.6, { color: '#4fe3d0', dark: '#0b4f4a', rot: -Math.PI / 2, width: 0.56, ink: 0.6 });
  twinkle(ctx, 9.6, 3.6, 1.6);
});

reg('pk_xp_big', 22, 22, (ctx) => {
  glow(ctx, 11, 11, 11, PAL.xp, 0.8);
  crystal(ctx, 6.6, 13, 4.6, { color: '#3fd3c4', dark: '#0b4f4a', rot: -Math.PI / 2 - 0.55, width: 0.55, ink: 0.55 });
  crystal(ctx, 15.6, 13.2, 4.2, { color: '#3fd3c4', dark: '#0b4f4a', rot: -Math.PI / 2 + 0.6, width: 0.55, ink: 0.55 });
  crystal(ctx, 11, 10.4, 8, { color: '#5ff0de', dark: '#0b4f4a', rot: -Math.PI / 2, width: 0.52, ink: 0.7 });
  twinkle(ctx, 14.4, 4.6, 2.2);
  twinkle(ctx, 5, 8.4, 1.2);
});

reg('pk_cog', 14, 14, (ctx) => {
  glow(ctx, 7, 7, 7, PAL.gold, 0.45);
  gear(ctx, 7, 7, 5.6, 8, { kind: 'gold', toothDepth: 1.4, hole: 1.2, outline: 0.6, polish: true });
  ctx.beginPath();
  ctx.arc(7, 7, 2.7, 0, TAU);
  ctx.lineWidth = 0.4;
  ctx.strokeStyle = 'rgba(90,61,12,0.75)';
  ctx.stroke();
  twinkle(ctx, 4.4, 4.2, 1.4);
});

reg('pk_cog_big', 22, 22, (ctx) => {
  glow(ctx, 11, 11, 11, PAL.gold, 0.55);
  gear(ctx, 11, 11, 9.2, 12, { kind: 'gold', toothDepth: 1.8, hole: 1.6, spokes: 5, hub: true, outline: 0.8, polish: true });
  // ruby set in the hub
  ctx.beginPath();
  ctx.arc(11, 11, 1.2, 0, TAU);
  ctx.fillStyle = '#d23a3a';
  ctx.fill();
  twinkle(ctx, 6.4, 5.4, 2);
  twinkle(ctx, 16.2, 15.6, 1.1);
});

reg('pk_repair', 22, 22, (ctx) => {
  const c = 11;
  glow(ctx, c, c, 11, '#ff9a8a', 0.5);
  // medallion
  ctx.beginPath();
  ctx.arc(c, c, 7.8, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, c, c, 7.8, 'brass');
  ctx.fill();
  ink(ctx, 0.8);
  ctx.beginPath();
  ctx.arc(c, c, 6.2, 0, TAU);
  ctx.fillStyle = '#fbf5e6';
  ctx.fill();
  polygon(ctx, [
    [c - 1.6, c - 4.6], [c + 1.6, c - 4.6], [c + 1.6, c - 1.6], [c + 4.6, c - 1.6], [c + 4.6, c + 1.6],
    [c + 1.6, c + 1.6], [c + 1.6, c + 4.6], [c - 1.6, c + 4.6], [c - 1.6, c + 1.6], [c - 4.6, c + 1.6],
    [c - 4.6, c - 1.6], [c - 1.6, c - 1.6],
  ]);
  ctx.fillStyle = '#d23a2a';
  ctx.fill();
  ink(ctx, 0.4);
  // crossed wrench & spanner over the medallion
  const tool = (a, open) => {
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(a);
    roundRect(ctx, -8, -0.9, 16, 1.8, 0.8);
    ctx.fillStyle = cylinderGrad(ctx, 0, -0.9, 0, 0.9, 'steel');
    ctx.fill();
    ink(ctx, 0.5);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(s * 8.4, 0, 2.3, 0, TAU);
      if (open) {
        ctx.moveTo(s * 8.4 + s * 3, -1);
        ctx.lineTo(s * 8.4, -0.8);
        ctx.lineTo(s * 8.4, 0.8);
        ctx.lineTo(s * 8.4 + s * 3, 1);
      } else {
        ctx.moveTo(s * 8.4 + 1, 0);
        ctx.arc(s * 8.4, 0, 1, 0, TAU, true);
      }
      ctx.fillStyle = metal(ctx, s * 8.4 - 2, -2, s * 8.4 + 2, 2, 'steel', { polish: true });
      ctx.fill('evenodd');
      ink(ctx, 0.45);
    }
    ctx.restore();
  };
  tool(Math.PI / 4, true);
  tool(-Math.PI / 4, false);
  twinkle(ctx, 5, 4.6, 1.6);
});

reg('pk_steam', 20, 22, (ctx) => {
  glow(ctx, 10, 12, 10, PAL.steamGauge, 0.6);
  // steam wisp from the valve
  for (const [x, y, r] of [[13.5, 2.6, 1.8], [15.6, 1.6, 1.4], [11.6, 1.8, 1.2]]) {
    glow(ctx, x, y, r * 1.8, '#ffffff', 0.85);
  }
  // canister body (side view, vertical)
  roundRect(ctx, 4.6, 5.6, 10.8, 14.6, 4);
  ctx.fillStyle = cylinderGrad(ctx, 4.6, 0, 15.4, 0, 'copper');
  ctx.fill();
  ink(ctx, 0.8);
  for (const y of [8.6, 17]) {
    roundRect(ctx, 4.2, y - 0.8, 11.6, 1.6, 0.6);
    ctx.fillStyle = cylinderGrad(ctx, 4.2, 0, 15.8, 0, 'brass');
    ctx.fill();
    ink(ctx, 0.45);
  }
  // valve & neck
  roundRect(ctx, 8.4, 3.4, 3.2, 2.6, 0.6);
  ctx.fillStyle = cylinderGrad(ctx, 8.4, 0, 11.6, 0, 'brass');
  ctx.fill();
  ink(ctx, 0.45);
  ctx.beginPath();
  ctx.ellipse(10, 3.2, 3, 0.9, 0, 0, TAU);
  ctx.fillStyle = PAL.oxblood;
  ctx.fill();
  ink(ctx, 0.4);
  gauge(ctx, 10, 12.8, 3.2, { value: 0.85 });
  // aether frost glint
  ctx.fillStyle = alpha('#ffffff', 0.55);
  ctx.fillRect(6, 9.8, 0.7, 5.6);
});

reg('pk_bomb', 20, 20, (ctx) => {
  glow(ctx, 10, 11, 10, '#ff9a3c', 0.5);
  ctx.beginPath();
  ctx.arc(9.4, 11.6, 6.6, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, 9.4, 11.6, 6.6, 'blackiron', { spec: 0.8 });
  ctx.fill();
  ink(ctx, 0.9);
  ctx.save();
  ctx.clip();
  for (const y of [9.2, 13.8]) {
    ctx.fillStyle = cylinderGrad(ctx, 0, y - 0.7, 0, y + 0.7, 'brass');
    ctx.fillRect(2, y - 0.75, 15, 1.5);
  }
  ctx.restore();
  // neck & fuse
  roundRect(ctx, 11.6, 4.2, 3.4, 2.8, 0.6);
  ctx.save();
  ctx.translate(13.3, 5.6);
  ctx.rotate(0.6);
  ctx.translate(-13.3, -5.6);
  roundRect(ctx, 11.6, 4.2, 3.4, 2.8, 0.6);
  ctx.fillStyle = cylinderGrad(ctx, 11.6, 0, 15, 0, 'brass');
  ctx.fill();
  ink(ctx, 0.45);
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(14.4, 4.4);
  ctx.quadraticCurveTo(16.2, 2.6, 15.6, 1.6);
  ctx.strokeStyle = '#4a3416';
  ctx.lineWidth = 0.7;
  ctx.stroke();
  glow(ctx, 15.6, 1.8, 2.6, '#ffcf4a', 1);
  twinkle(ctx, 15.6, 1.8, 1.8, '#fff3c4');
  twinkle(ctx, 6.6, 9, 1.2);
});

reg('pk_crate', 24, 24, (ctx) => {
  const x = 3;
  const y = 3;
  const s = 18;
  glow(ctx, 12, 12, 12, PAL.gold, 0.55);
  deck(ctx, x, y, s, s, { radius: 1.2, plank: 3.6, kind: 'wood', seed: 12, ink: 0 });
  // glowing seams leaking aether-gold light
  ctx.save();
  roundRect(ctx, x, y, s, s, 1.2);
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  for (const yy of [y + 6, y + 12]) {
    const g = ctx.createLinearGradient(0, yy - 1.4, 0, yy + 1.4);
    g.addColorStop(0, 'rgba(255,207,74,0)');
    g.addColorStop(0.5, 'rgba(255,230,140,0.95)');
    g.addColorStop(1, 'rgba(255,207,74,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, yy - 1.4, s, 2.8);
  }
  ctx.restore();
  // cross-brace
  ctx.save();
  roundRect(ctx, x, y, s, s, 1.2);
  ctx.clip();
  ctx.translate(12, 12);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = metal(ctx, -13, -2, 13, 2, 'wood', { polish: true });
  ctx.fillRect(-13, -1.6, 26, 3.2);
  ctx.strokeStyle = 'rgba(30,18,6,0.6)';
  ctx.lineWidth = 0.4;
  ctx.strokeRect(-13, -1.6, 26, 3.2);
  ctx.restore();
  roundRect(ctx, x, y, s, s, 1.2);
  ink(ctx, 1);
  // brass corners
  for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + s, y, -1, 1], [x, y + s, 1, -1], [x + s, y + s, -1, -1]]) {
    polygon(ctx, [[cx, cy], [cx + sx * 5, cy], [cx + sx * 5, cy + sy * 1.6], [cx + sx * 1.6, cy + sy * 1.6], [cx + sx * 1.6, cy + sy * 5], [cx, cy + sy * 5]]);
    ctx.fillStyle = metal(ctx, cx - 2, cy - 2, cx + 4, cy + 4, 'brass', { polish: true });
    ctx.fill();
    ink(ctx, 0.5);
    rivet(ctx, cx + sx * 0.9, cy + sy * 0.9, 0.45);
  }
  // stencilled crest
  crest(ctx, 12, 12, 3.4, { emblem: 'cog', field: PAL.oxblood, kind: 'gold', color: '#ffe8a8' });
  twinkle(ctx, 19.5, 4.6, 2);
  void mix;
});

// expose a list for debugging/preview tools
export const PICKUP_SPRITES = ['pk_xp', 'pk_xp_big', 'pk_cog', 'pk_cog_big', 'pk_repair', 'pk_steam', 'pk_bomb', 'pk_crate'];
void cylinder;
