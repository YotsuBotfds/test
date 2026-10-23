// Animated ground details (WP6). Ground tiles are static bitmaps; the painters record anchor
// spots (see `A` in bg-util.js) and this module animates them every frame, statelessly — each
// effect is a pure function of (time, anchor seed), so there is nothing to update or pool.

import { A, softDot, cachedSprite, rgba } from './bg-util.js';

const TAU = Math.PI * 2;
const fract = (v) => v - Math.floor(v);

// --- Sprites ---------------------------------------------------------------------------------

const SPR = {
  get glint() {
    return cachedSprite('a|glint', 32, 32, (ctx) => {
      const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, 'rgba(255,255,240,1)');
      g.addColorStop(0.2, 'rgba(255,240,200,0.5)');
      g.addColorStop(1, 'rgba(255,230,180,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = 'rgba(255,255,245,0.9)';
      ctx.beginPath();
      ctx.moveTo(16, 1);
      ctx.lineTo(17.2, 14.8);
      ctx.lineTo(31, 16);
      ctx.lineTo(17.2, 17.2);
      ctx.lineTo(16, 31);
      ctx.lineTo(14.8, 17.2);
      ctx.lineTo(1, 16);
      ctx.lineTo(14.8, 14.8);
      ctx.closePath();
      ctx.fill();
    });
  },
  get smoke() {
    return puff('a|smoke', '#5d5446', '#8f8672');
  },
  get smokeDark() {
    return puff('a|smokeDark', '#2a231c', '#4f453a');
  },
  get steam() {
    return puff('a|steam', '#d8d4cc', '#ffffff');
  },
  get emberSmoke() {
    return puff('a|emberSmoke', '#1c1210', '#5a2c1c');
  },
  get warm() {
    return softDot(32, '#ffb347', [[0, 1], [0.18, 0.85], [0.45, 0.25], [1, 0]]);
  },
  get warmCore() {
    return softDot(16, '#fff2b0', [[0, 1], [0.5, 0.5], [1, 0]]);
  },
  get lava() {
    return softDot(128, '#ff7a1e', [[0, 0.9], [0.3, 0.45], [0.7, 0.1], [1, 0]]);
  },
  get lavaHot() {
    return softDot(64, '#ffd36b', [[0, 1], [0.4, 0.35], [1, 0]]);
  },
  get pool() {
    return softDot(96, '#ff4a1a', [[0, 0.95], [0.35, 0.5], [1, 0]]);
  },
  get cap() {
    return cachedSprite('a|cap', 48, 24, (ctx) => {
      // Foam smear: bright broken crest with a soft wash behind it.
      const g = ctx.createRadialGradient(24, 12, 0, 24, 12, 22);
      g.addColorStop(0, 'rgba(235,245,252,0.55)');
      g.addColorStop(1, 'rgba(235,245,252,0)');
      ctx.fillStyle = g;
      ctx.save();
      ctx.scale(1, 0.5);
      ctx.fillRect(0, 0, 48, 48);
      ctx.restore();
      ctx.strokeStyle = 'rgba(245,250,255,0.95)';
      ctx.lineCap = 'round';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(8, 13);
      ctx.lineTo(19, 11);
      ctx.moveTo(23, 10.5);
      ctx.lineTo(38, 12);
      ctx.stroke();
    });
  },
  get beam() {
    return cachedSprite('a|beam', 256, 96, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 256, 0);
      g.addColorStop(0, 'rgba(255,240,170,0.9)');
      g.addColorStop(0.4, 'rgba(255,230,150,0.35)');
      g.addColorStop(1, 'rgba(255,220,140,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 48);
      ctx.lineTo(256, 0);
      ctx.lineTo(256, 96);
      ctx.closePath();
      ctx.fill();
    });
  },
  get sails() {
    return cachedSprite('a|sails', 32, 32, (ctx) => {
      ctx.translate(16, 16);
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.fillStyle = 'rgba(30,20,10,0.35)';
        ctx.fillRect(2, -1.2, 14, 4.5);
        ctx.fillStyle = '#f3e8c9';
        ctx.fillRect(1.5, -2.2, 13.5, 4);
        ctx.strokeStyle = '#6e4723';
        ctx.lineWidth = 1;
        ctx.strokeRect(1.5, -2.2, 13.5, 4);
      }
      ctx.fillStyle = '#4a3112';
      ctx.beginPath();
      ctx.arc(0, 0, 2.2, 0, TAU);
      ctx.fill();
    });
  },
};

function puff(key, dark, light) {
  return cachedSprite(key, 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(26, 26, 2, 32, 32, 32);
    g.addColorStop(0, rgba(light, 0.95));
    g.addColorStop(0.45, rgba(dark, 0.7));
    g.addColorStop(1, rgba(dark, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
}

// --- Drawing ---------------------------------------------------------------------------------

/**
 * @typedef {object} GroundMap  ground unit → device px:  dev = g * s + o
 * @property {number} s
 * @property {number} ox
 * @property {number} oy
 * @property {number} W   canvas width (device px)
 * @property {number} H
 * @property {number} windX  smoke drift direction (unit)
 * @property {number} windY
 */

/**
 * Draw one pass of a tile's anchors. Pass 'add' = glows (lighter), 'normal' = smoke & co.
 * Caller sets globalCompositeOperation for the pass; this sets globalAlpha per item.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Float32Array} list
 * @param {number} t      seconds
 * @param {GroundMap} m
 * @param {'add'|'normal'} pass
 * @param {number} alpha  layer alpha (crossfade)
 * @param {number} [detail] 0..1 quality (fewer smoke puffs when low)
 */
export function drawAnchors(ctx, list, t, m, pass, alpha, detail = 1) {
  const s = m.s;
  const add = pass === 'add';
  for (let i = 0; i < list.length; i += 5) {
    const type = list[i];
    const isAdd =
      type === A.GLINT || type === A.WINDOW || type === A.LAVA || type === A.POOL ||
      type === A.BEACON || type === A.FURNACE;
    if (isAdd !== add) continue;
    const x = list[i + 1] * s + m.ox;
    const y = list[i + 2] * s + m.oy;
    const size = list[i + 3];
    const seed = list[i + 4];
    const pad = 140 * s;
    if (x < -pad || y < -pad || x > m.W + pad || y > m.H + pad) continue;
    switch (type) {
      case A.GLINT: {
        const ph = Math.sin(t * (1.6 + seed) + seed * 60);
        const a = ph > 0.55 ? ((ph - 0.55) / 0.45) ** 2 : 0;
        if (a <= 0.01) break;
        const r = (5 + 5 * a) * size * s;
        ctx.globalAlpha = a * alpha * 0.9;
        ctx.drawImage(SPR.glint, x - r, y - r, r * 2, r * 2);
        break;
      }
      case A.WINDOW: {
        const flick = 0.65 + 0.25 * Math.sin(t * (0.7 + seed * 2) + seed * 40) +
          0.1 * Math.sin(t * 7.3 + seed * 13);
        const off = fract(seed * 7.13 + Math.floor(t / 9 + seed * 3) * 0.37) < 0.08 ? 0.15 : 1;
        const r = 7 * size * s;
        ctx.globalAlpha = Math.max(0, flick * off * alpha);
        ctx.drawImage(SPR.warm, x - r, y - r, r * 2, r * 2);
        const c = 2.2 * size * s;
        ctx.drawImage(SPR.warmCore, x - c, y - c, c * 2, c * 2);
        break;
      }
      case A.LAVA: {
        const p = 0.55 + 0.3 * Math.sin(t * 1.3 + seed * 30) + 0.15 * Math.sin(t * 3.1 + seed * 11);
        const r = 46 * size * s * (0.9 + 0.1 * p);
        ctx.globalAlpha = Math.max(0, p * alpha * 0.55);
        ctx.drawImage(SPR.lava, x - r, y - r, r * 2, r * 2);
        const h = r * 0.35;
        ctx.globalAlpha = Math.max(0, p * p * alpha * 0.5);
        ctx.drawImage(SPR.lavaHot, x - h, y - h, h * 2, h * 2);
        break;
      }
      case A.POOL: {
        const p = 0.5 + 0.5 * Math.sin(t * 0.9 + seed * 20);
        const r = 26 * size * s * (0.85 + 0.25 * p);
        ctx.globalAlpha = (0.35 + 0.45 * p) * alpha;
        ctx.drawImage(SPR.pool, x - r, y - r, r * 2, r * 2);
        break;
      }
      case A.FURNACE: {
        const p = 0.6 + 0.25 * Math.sin(t * 9 + seed * 50) + 0.15 * Math.sin(t * 2.3 + seed * 9);
        const r = 14 * size * s;
        ctx.globalAlpha = Math.max(0, p * alpha);
        ctx.drawImage(SPR.lavaHot, x - r, y - r, r * 2, r * 2);
        break;
      }
      case A.BEACON: {
        const ang = t * 1.1 + seed * TAU;
        const L = 150 * size * s;
        const w = 56 * size * s;
        const c = Math.cos(ang);
        const sn = Math.sin(ang);
        ctx.globalAlpha = 0.5 * alpha;
        ctx.setTransform(c * (L / 256), sn * (L / 256), -sn * (w / 96), c * (w / 96), x, y);
        ctx.drawImage(SPR.beam, 0, -48);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const r = 9 * s;
        ctx.globalAlpha = (0.8 + 0.2 * Math.sin(t * 5)) * alpha;
        ctx.drawImage(SPR.lavaHot, x - r, y - r, r * 2, r * 2);
        break;
      }
      case A.MILL: {
        const ang = t * (0.8 + seed * 0.6) + seed * TAU;
        const r = 9 * size * s;
        const c = Math.cos(ang) * (r / 16);
        const sn = Math.sin(ang) * (r / 16);
        ctx.globalAlpha = alpha;
        ctx.setTransform(c, sn, -sn, c, x, y);
        ctx.drawImage(SPR.sails, -16, -16);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        break;
      }
      case A.CAP: {
        const ph = Math.sin(t * (0.9 + seed * 0.8) + seed * 40);
        if (ph < 0.1) break;
        const a = ph < 0.4 ? (ph - 0.1) / 0.3 : 1 - (ph - 0.4) * 0.6;
        const drift = fract(t * 0.05 + seed) * 10 * s;
        const k = (size * s) / 2.4;
        // Crest lies across the wind.
        ctx.globalAlpha = a * alpha * 0.75;
        ctx.setTransform(-m.windY * k, m.windX * k, -m.windX * k * 0.6, -m.windY * k * 0.6,
          x + drift * m.windX, y + drift * m.windY);
        ctx.drawImage(SPR.cap, -24, -12);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        break;
      }
      case A.SMOKE:
      case A.EMBERSMOKE:
      case A.STEAM: {
        const img = type === A.STEAM ? SPR.steam : type === A.EMBERSMOKE ? SPR.emberSmoke :
          seed < 0.5 ? SPR.smoke : SPR.smokeDark;
        const steam = type === A.STEAM;
        const puffs = steam ? 3 : detail > 0.5 ? 5 : 3;
        const rate = steam ? 0.32 : 0.11;
        const reach = (steam ? 34 : 130) * size;
        const grow = (steam ? 12 : 40) * size;
        const base = steam ? 0.5 : 0.72;
        for (let k = 0; k < puffs; k++) {
          const u = fract(t * rate + seed * 3.7 + k / puffs);
          const sway = Math.sin(t * 0.6 + seed * 20 + u * 3) * 6 * size * u;
          const px = x + (m.windX * reach * u - m.windY * sway) * s;
          const py = y + (m.windY * reach * u + m.windX * sway) * s;
          const r = (3 + grow * Math.sqrt(u)) * s;
          const fadeIn = u < 0.12 ? u / 0.12 : 1;
          ctx.globalAlpha = fadeIn * (1 - u) * base * alpha;
          ctx.drawImage(img, px - r, py - r, r * 2, r * 2);
        }
        if (type === A.EMBERSMOKE) {
          const r = 8 * size * s;
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = (0.5 + 0.3 * Math.sin(t * 6 + seed * 9)) * alpha;
          ctx.drawImage(SPR.warm, x - r, y - r, r * 2, r * 2);
          ctx.globalCompositeOperation = 'source-over';
        }
        break;
      }
      default:
        break;
    }
  }
}
