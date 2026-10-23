// FX textures (WP4) for particles & effects. Neutral (white/grey) unless noted so the particle
// system can tint them or draw them additively. fx_cog and fx_debris are coloured.

import { Sprites } from '../sprites.js';
import {
  gear,
  metal,
  cylinderGrad,
  ink,
  polygon,
  roundRect,
  star,
  seeded,
  rivet,
  bolt,
} from '../drawkit.js';

const TAU = Math.PI * 2;

function radial(ctx, x, y, r, stops) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

// --- glows ------------------------------------------------------------------------------------
Sprites.register('fx_glow', {
  w: 32,
  h: 32,
  scale: 3,
  draw(ctx) {
    radial(ctx, 16, 16, 16, [
      [0, 'rgba(255,255,255,1)'],
      [0.18, 'rgba(255,255,255,0.95)'],
      [0.32, 'rgba(255,255,255,0.55)'],
      [0.55, 'rgba(255,255,255,0.2)'],
      [0.8, 'rgba(255,255,255,0.05)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
  },
});

Sprites.register('fx_glow_soft', {
  w: 32,
  h: 32,
  scale: 3,
  draw(ctx) {
    // approximately gaussian falloff
    const stops = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      stops.push([t, `rgba(255,255,255,${(Math.exp(-t * t * 4.5) * (1 - t) * 0.85).toFixed(3)})`]);
    }
    radial(ctx, 16, 16, 16, stops);
  },
});

// --- smoke: three puffy, soft-edged light-grey clouds ------------------------------------------
Sprites.register('fx_smoke', {
  w: 32,
  h: 32,
  frames: 3,
  scale: 3,
  draw(ctx, w, h, frame) {
    const rnd = seeded(101 + frame * 17);
    const blobs = [];
    const n = 6 + frame;
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU;
      const d = rnd() * 6.5;
      blobs.push([16 + Math.cos(a) * d, 16 + Math.sin(a) * d, 5 + rnd() * 4.5]);
    }
    // body
    for (const [x, y, r] of blobs) {
      radial(ctx, x, y, r * 1.35, [
        [0, 'rgba(236,234,230,0.7)'],
        [0.55, 'rgba(226,224,220,0.5)'],
        [1, 'rgba(220,218,214,0)'],
      ]);
    }
    // volume: lit top-left lobes, shaded lower-right
    ctx.globalCompositeOperation = 'source-atop';
    const g = ctx.createLinearGradient(6, 6, 26, 26);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(110,104,98,0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    for (const [x, y, r] of blobs) {
      radial(ctx, x - r * 0.3, y - r * 0.3, r * 0.7, [
        [0, 'rgba(255,255,255,0.35)'],
        [1, 'rgba(255,255,255,0)'],
      ]);
    }
    ctx.globalCompositeOperation = 'source-over';
  },
});

Sprites.register('fx_steam', {
  w: 32,
  h: 32,
  scale: 3,
  draw(ctx) {
    // wispy: stretched, overlapping soft lobes with a denser heart
    const rnd = seeded(7);
    for (let i = 0; i < 11; i++) {
      const a = rnd() * TAU;
      const d = rnd() * 8;
      const r = 3 + rnd() * 4.5;
      ctx.save();
      ctx.translate(16 + Math.cos(a) * d * 1.1, 16 + Math.sin(a) * d * 0.75);
      ctx.rotate(rnd() * 0.8 - 0.4);
      ctx.scale(1.6, 0.75);
      radial(ctx, 0, 0, r, [
        [0, 'rgba(255,255,255,0.32)'],
        [0.55, 'rgba(255,255,255,0.14)'],
        [1, 'rgba(255,255,255,0)'],
      ]);
      ctx.restore();
    }
    radial(ctx, 16, 16, 7, [
      [0, 'rgba(255,255,255,0.35)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
  },
});

// --- spark streak (along +x) ------------------------------------------------------------------
Sprites.register('fx_spark', {
  w: 32,
  h: 8,
  scale: 3,
  draw(ctx) {
    ctx.save();
    ctx.translate(16, 4);
    ctx.scale(1, 0.25);
    radial(ctx, 6, 0, 16, [
      [0, 'rgba(255,255,255,0.7)'],
      [0.5, 'rgba(255,255,255,0.18)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(0.5, 4);
    ctx.quadraticCurveTo(22, 2.6, 31, 4);
    ctx.quadraticCurveTo(22, 5.4, 0.5, 4);
    const g = ctx.createLinearGradient(0, 0, 32, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = g;
    ctx.fill();
  },
});

// --- coloured bits ----------------------------------------------------------------------------
Sprites.register('fx_cog', {
  w: 12,
  h: 12,
  scale: 3,
  draw(ctx) {
    gear(ctx, 6, 6, 5.4, 8, {
      kind: 'brass',
      toothDepth: 1.3,
      hole: 1.3,
      outline: 0.55,
      polish: true,
    });
  },
});

Sprites.register('fx_debris', {
  w: 12,
  h: 12,
  frames: 4,
  scale: 3,
  draw(ctx, w, h, frame) {
    if (frame === 0) {
      // splintered plank
      polygon(ctx, [
        [1, 4.4],
        [9.5, 3.6],
        [11, 5],
        [10, 6.2],
        [11.2, 7.6],
        [1.6, 8],
      ]);
      ctx.fillStyle = metal(ctx, 1, 3, 11, 8, 'wood');
      ctx.fill();
      ink(ctx, 0.6);
      ctx.strokeStyle = 'rgba(40,22,8,0.6)';
      ctx.lineWidth = 0.35;
      for (const y of [5.2, 6.6]) {
        ctx.beginPath();
        ctx.moveTo(2, y);
        ctx.lineTo(9, y - 0.3);
        ctx.stroke();
      }
      rivet(ctx, 3, 6, 0.5, 'iron');
    } else if (frame === 1) {
      // bent iron plate shard with rivets
      polygon(ctx, [
        [1.4, 2.4],
        [8.6, 1.4],
        [10.8, 5.2],
        [8.4, 10.4],
        [3.6, 9],
        [2.4, 6.2],
      ]);
      ctx.fillStyle = metal(ctx, 1, 1, 11, 11, 'iron', { polish: true });
      ctx.fill();
      ink(ctx, 0.6);
      rivet(ctx, 3.6, 3.6, 0.55, 'iron');
      rivet(ctx, 7.6, 3, 0.55, 'iron');
      ctx.fillStyle = 'rgba(140,47,43,0.7)';
      ctx.fillRect(3.4, 6.8, 5, 1);
    } else if (frame === 2) {
      // bolt with nut
      roundRect(ctx, 2, 5.1, 7.6, 1.8, 0.5);
      ctx.fillStyle = cylinderGrad(ctx, 0, 5.1, 0, 6.9, 'steel');
      ctx.fill();
      ink(ctx, 0.45);
      ctx.strokeStyle = 'rgba(30,30,36,0.5)';
      ctx.lineWidth = 0.3;
      for (let x = 5; x < 9.5; x += 0.8) {
        ctx.beginPath();
        ctx.moveTo(x, 5.2);
        ctx.lineTo(x + 0.4, 6.8);
        ctx.stroke();
      }
      bolt(ctx, 2.2, 6, 2.4, 'iron', 0);
    } else {
      // broken gear fragment: a wedge of a spoked wheel with a jagged break
      const wedge = [
        [1, 1],
        [11.6, 2.6],
        [8.4, 5.2],
        [10.4, 7.4],
        [6.6, 8.6],
        [5.8, 11.4],
        [1.6, 11.4],
      ];
      ctx.save();
      polygon(ctx, wedge);
      ctx.clip();
      gear(ctx, 1.5, 1.5, 10.4, 14, {
        kind: 'brass',
        toothDepth: 1.7,
        hole: 2.2,
        spokes: 4,
        outline: 0.6,
      });
      ctx.restore();
      ctx.save();
      polygon(ctx, wedge);
      ctx.clip();
      polygon(ctx, wedge.slice(1, 6), false);
      ctx.strokeStyle = 'rgba(26,18,10,0.7)';
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.restore();
    }
  },
});

// --- shadow: soft black ellipse (alpha ≈ 0.9 at the centre) -----------------------------------
Sprites.register('fx_shadow', {
  w: 48,
  h: 32,
  scale: 2,
  draw(ctx) {
    ctx.save();
    ctx.translate(24, 16);
    ctx.scale(1, 32 / 48);
    radial(ctx, 0, 0, 24, [
      [0, 'rgba(0,0,0,0.9)'],
      [0.45, 'rgba(0,0,0,0.78)'],
      [0.75, 'rgba(0,0,0,0.38)'],
      [1, 'rgba(0,0,0,0)'],
    ]);
    ctx.restore();
  },
});

// --- ring & flare ---------------------------------------------------------------------------------
Sprites.register('fx_ring', {
  w: 64,
  h: 64,
  scale: 2,
  draw(ctx) {
    const g = ctx.createRadialGradient(32, 32, 24, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.35)');
    g.addColorStop(0.78, 'rgba(255,255,255,1)');
    g.addColorStop(0.9, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(32, 32, 32, 0, TAU);
    ctx.fill();
  },
});

Sprites.register('fx_flare', {
  w: 48,
  h: 48,
  scale: 2,
  draw(ctx) {
    radial(ctx, 24, 24, 14, [
      [0, 'rgba(255,255,255,1)'],
      [0.3, 'rgba(255,255,255,0.6)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    // long and short rays
    for (const [len, wid, rot] of [
      [24, 2.2, 0],
      [15, 1.6, Math.PI / 4],
    ]) {
      star(ctx, 24, 24, len, wid, 4, rot);
      const g = ctx.createRadialGradient(24, 24, 0, 24, 24, len);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fill();
    }
    radial(ctx, 24, 24, 4, [
      [0, 'rgba(255,255,255,1)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
  },
});

// --- extras (beyond the DESIGN contract; free for WP3 & content to use) ------------------------

/** Directional muzzle flash cone along +x, neutral white (tint gold/cyan/red as needed). */
Sprites.register('fx_muzzle', {
  w: 32,
  h: 20,
  scale: 3,
  draw(ctx) {
    radial(ctx, 6, 10, 7, [
      [0, 'rgba(255,255,255,1)'],
      [0.5, 'rgba(255,255,255,0.6)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    // main tongue + two side jets
    for (const [len, wid, ang, a] of [
      [30, 4.2, 0, 1],
      [15, 2.4, -0.55, 0.75],
      [15, 2.4, 0.55, 0.75],
    ]) {
      ctx.save();
      ctx.translate(3, 10);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(0, -wid);
      ctx.quadraticCurveTo(len * 0.5, -wid * 0.9, len, 0);
      ctx.quadraticCurveTo(len * 0.5, wid * 0.9, 0, wid);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(0.55, `rgba(255,255,255,${a * 0.55})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
    }
  },
});

/** Coloured fireball puffs (3 frames) — hot core, orange body, sooty rim. Draw additively or not. */
Sprites.register('fx_fire', {
  w: 32,
  h: 32,
  frames: 3,
  scale: 3,
  draw(ctx, w, h, frame) {
    const rnd = seeded(303 + frame * 29);
    const blobs = [];
    for (let i = 0; i < 6 + frame; i++) {
      const a = rnd() * TAU;
      const d = rnd() * 6;
      blobs.push([16 + Math.cos(a) * d, 16 + Math.sin(a) * d, 5 + rnd() * 4]);
    }
    for (const [x, y, r] of blobs) {
      radial(ctx, x, y, r * 1.45, [
        [0, 'rgba(255,140,40,0.9)'],
        [0.6, 'rgba(200,60,20,0.55)'],
        [1, 'rgba(60,20,10,0)'],
      ]);
    }
    for (const [x, y, r] of blobs) {
      radial(ctx, x - r * 0.15, y - r * 0.2, r * 0.8, [
        [0, 'rgba(255,250,210,0.95)'],
        [0.45, 'rgba(255,205,90,0.6)'],
        [1, 'rgba(255,150,40,0)'],
      ]);
    }
  },
});

/** Scorch mark decal for the ground layer (dark, soft, ragged). */
Sprites.register('fx_scorch', {
  w: 48,
  h: 48,
  scale: 2,
  draw(ctx) {
    const rnd = seeded(55);
    radial(ctx, 24, 24, 22, [
      [0, 'rgba(10,6,4,0.7)'],
      [0.6, 'rgba(20,12,6,0.45)'],
      [1, 'rgba(20,12,6,0)'],
    ]);
    // blast rays: tapered soot wedges fading outward
    for (let i = 0; i < 16; i++) {
      const a = rnd() * TAU;
      const len = 14 + rnd() * 9;
      const w = 1.2 + rnd() * 1.8;
      ctx.save();
      ctx.translate(24, 24);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(4, -w);
      ctx.lineTo(len, 0);
      ctx.lineTo(4, w);
      ctx.closePath();
      const g = ctx.createLinearGradient(4, 0, len, 0);
      g.addColorStop(0, 'rgba(15,9,5,0.5)');
      g.addColorStop(1, 'rgba(15,9,5,0)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
    }
  },
});

/** Aether shard fragment (coloured teal) for XP bursts and lance impacts. */
Sprites.register('fx_shard', {
  w: 10,
  h: 10,
  scale: 3,
  draw(ctx) {
    polygon(ctx, [
      [9.4, 5],
      [5.4, 2],
      [1, 4.2],
      [3.4, 8.2],
    ]);
    const g = ctx.createLinearGradient(1, 2, 9, 8);
    g.addColorStop(0, '#e8ffff');
    g.addColorStop(0.5, '#4fe3d0');
    g.addColorStop(1, '#127a72');
    ctx.fillStyle = g;
    ctx.fill();
    ink(ctx, 0.45);
  },
});
