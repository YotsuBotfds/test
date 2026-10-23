// Drawkit ornaments: name-plates, crests, crystals, bones, skulls and the shared hot enemy-fire
// orb. Re-exported by ../drawkit.js — import from there.

import { PAL } from '../../config.js';
import {
  TAU,
  mix,
  lighten,
  darken,
  alpha,
  METALS,
  metal,
  metalRadial,
  cylinderGrad,
  polygon,
  star,
  ink,
  shadeOverlay,
  glow,
} from './core.js';
import { rivet, gearPath, plate } from './parts.js';

/**
 * Engraved name-plate with lettering.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y centre
 * @param {number} w @param {number} h
 * @param {string} text
 * @param {{kind?:string, color?:string, rot?:number, font?:string}} [opts]
 */
export function nameplate(ctx, x, y, w, h, text, opts = {}) {
  const {
    kind = 'brass',
    color = '#3a2410',
    rot = 0,
    font = 'Georgia, "Times New Roman", serif',
  } = opts;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  plate(ctx, -w / 2, -h / 2, w, h, h * 0.35, kind, { ink: 0.6, polish: true, bevel: 0.4 });
  rivet(ctx, -w / 2 + h * 0.42, 0, h * 0.16, kind);
  rivet(ctx, w / 2 - h * 0.42, 0, h * 0.16, kind);
  ctx.font = `bold ${h * 0.62}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const maxW = w - h * 1.2;
  const tw = ctx.measureText(text).width;
  if (tw > maxW) ctx.scale(maxW / tw, 1);
  ctx.fillStyle = 'rgba(255,245,210,0.5)';
  ctx.fillText(text, 0.15, h * 0.06 + 0.15);
  ctx.fillStyle = color;
  ctx.fillText(text, 0, h * 0.06);
  ctx.restore();
}

/**
 * Heraldic medallion: brass rim + emblem.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} r
 * @param {{emblem?:'cog'|'wings'|'skull'|'anchor'|'bolt', field?:string, kind?:string,
 *   color?:string}} [opts] field: inner disc colour; color: emblem colour
 */
export function crest(ctx, x, y, r, opts = {}) {
  const { emblem = 'cog', field = PAL.oxblood, kind = 'brass', color = '#f2d48a' } = opts;
  if (emblem === 'wings') {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + s * r * 0.6, y - r * 0.3);
      ctx.quadraticCurveTo(x + s * r * 1.9, y - r * 1.0, x + s * r * 2.0, y - r * 0.2);
      ctx.quadraticCurveTo(x + s * r * 1.5, y - r * 0.15, x + s * r * 1.7, y + r * 0.2);
      ctx.quadraticCurveTo(x + s * r * 1.2, y + r * 0.2, x + s * r * 1.3, y + r * 0.55);
      ctx.quadraticCurveTo(x + s * r * 0.9, y + r * 0.45, x + s * r * 0.6, y + r * 0.4);
      ctx.closePath();
      ctx.fillStyle = metal(ctx, x - r * 2, y - r, x + r * 2, y + r, kind, { polish: true });
      ctx.fill();
      ink(ctx, 0.5);
    }
  }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, x, y, r, kind);
  ctx.fill();
  ink(ctx, 0.6);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.74, 0, TAU);
  ctx.fillStyle = field;
  ctx.fill();
  shadeOverlay(ctx, x - r, y - r, x + r, y + r, 0.2, 0.35);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  const s = r * 0.5;
  if (emblem === 'cog' || emblem === 'wings') {
    gearPath(ctx, x, y, s, 8, s * 0.28, 0, s * 0.35);
    ctx.fill('evenodd');
  } else if (emblem === 'skull') {
    ctx.beginPath();
    ctx.arc(x, y - s * 0.15, s * 0.62, Math.PI * 0.85, Math.PI * 2.15);
    ctx.lineTo(x + s * 0.4, y + s * 0.55);
    ctx.lineTo(x - s * 0.4, y + s * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = field;
    ctx.beginPath();
    ctx.arc(x - s * 0.24, y - s * 0.1, s * 0.17, 0, TAU);
    ctx.arc(x + s * 0.24, y - s * 0.1, s * 0.17, 0, TAU);
    ctx.fill();
    ctx.fillRect(x - s * 0.05, y + s * 0.12, s * 0.1, s * 0.18);
  } else if (emblem === 'anchor') {
    ctx.lineWidth = s * 0.2;
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.7);
    ctx.lineTo(x, y + s * 0.6);
    ctx.moveTo(x - s * 0.4, y - s * 0.35);
    ctx.lineTo(x + s * 0.4, y - s * 0.35);
    ctx.moveTo(x - s * 0.6, y + s * 0.1);
    ctx.quadraticCurveTo(x - s * 0.5, y + s * 0.65, x, y + s * 0.6);
    ctx.quadraticCurveTo(x + s * 0.5, y + s * 0.65, x + s * 0.6, y + s * 0.1);
    ctx.stroke();
  } else if (emblem === 'bolt') {
    polygon(ctx, [
      [x + s * 0.15, y - s * 0.8],
      [x - s * 0.45, y + s * 0.1],
      [x - s * 0.02, y + s * 0.1],
      [x - s * 0.18, y + s * 0.8],
      [x + s * 0.45, y - s * 0.12],
      [x + s * 0.03, y - s * 0.12],
    ]);
    ctx.fill();
  }
}

/**
 * Faceted crystal (aether shard). Elongated hexagonal gem pointing along `rot`.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} r half-length
 * @param {{color?:string, light?:string, dark?:string, rot?:number, width?:number,
 *   glow?:number, ink?:number}} [opts] width: half-width as fraction of r; glow: halo radius
 *   multiplier (0 = none)
 */
export function crystal(ctx, x, y, r, opts = {}) {
  const {
    color = PAL.aether[1],
    light = '#e8ffff',
    dark = '#0f5c5a',
    rot = -Math.PI / 2,
    width = 0.55,
    glow: gr = 0,
    ink: iw = 0.7,
  } = opts;
  if (gr > 0) glow(ctx, x, y, r * gr, color, 0.55);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const w = r * width;
  // outline points: tip, upper shoulder, upper heel, butt, lower heel, lower shoulder
  const P = [
    [r, 0],
    [r * 0.35, -w],
    [-r * 0.55, -w * 0.8],
    [-r, 0],
    [-r * 0.55, w * 0.8],
    [r * 0.35, w],
  ];
  const C = [r * 0.05, -w * 0.12];
  const facetCols = [
    lighten(color, 0.55),
    lighten(color, 0.2),
    mix(color, dark, 0.35),
    mix(color, dark, 0.6),
    color,
    lighten(color, 0.35),
  ];
  for (let i = 0; i < 6; i++) {
    const p = P[i];
    const q = P[(i + 1) % 6];
    polygon(ctx, [C, p, q]);
    ctx.fillStyle = facetCols[i];
    ctx.fill();
    ctx.lineWidth = 0.25;
    ctx.strokeStyle = alpha(light, 0.5);
    ctx.stroke();
  }
  polygon(ctx, P);
  if (iw) ink(ctx, iw);
  // sparkle
  ctx.fillStyle = alpha(light, 0.95);
  star(ctx, r * 0.25, -w * 0.4, r * 0.22, r * 0.05, 4, 0);
  ctx.fill();
  ctx.restore();
}

/**
 * Bone with knobbed ends (trophies, ribs). A curved rib if `bend` ≠ 0.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 * @param {number} width
 * @param {{bend?:number, knobs?:boolean, color?:string}} [opts] bend: perpendicular bow
 */
export function bone(ctx, x0, y0, x1, y1, width, opts = {}) {
  const { bend = 0, knobs = true, color = METALS.bone[1] } = opts;
  const len = Math.hypot(x1 - x0, y1 - y0);
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.save();
  ctx.translate(x0, y0);
  ctx.rotate(a);
  const shaft = () => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len / 2, bend * 2, len, 0);
  };
  ctx.lineCap = 'round';
  shaft();
  ctx.strokeStyle = 'rgba(26,18,10,0.7)';
  ctx.lineWidth = width + 1;
  ctx.stroke();
  if (knobs) {
    for (const ex of [0, len]) {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(ex, s * width * 0.38, width * 0.55, 0, TAU);
        ctx.fillStyle = 'rgba(26,18,10,0.7)';
        ctx.fill();
      }
    }
  }
  shaft();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  if (knobs) {
    for (const ex of [0, len]) {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(ex, s * width * 0.38, width * 0.45, 0, TAU);
        ctx.fillStyle = color;
        ctx.fill();
      }
    }
  }
  ctx.translate(0, -width * 0.18);
  shaft();
  ctx.strokeStyle = 'rgba(255,255,245,0.6)';
  ctx.lineWidth = width * 0.3;
  ctx.stroke();
  ctx.restore();
}

/**
 * Small skull (front view) — trophies, pirate crests.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} r
 * @param {{color?:string, eyes?:string, horns?:boolean, rot?:number}} [opts]
 */
export function skull(ctx, x, y, r, opts = {}) {
  const { color = METALS.bone[1], eyes = '#1a0c06', horns = false, rot = 0 } = opts;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  if (horns) {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * r * 0.6, -r * 0.4);
      ctx.quadraticCurveTo(s * r * 1.5, -r * 0.6, s * r * 1.45, -r * 1.35);
      ctx.quadraticCurveTo(s * r * 1.1, -r * 0.75, s * r * 0.45, -r * 0.75);
      ctx.closePath();
      ctx.fillStyle = cylinderGrad(ctx, 0, -r * 1.3, 0, -r * 0.4, 'bone');
      ctx.fill();
      ink(ctx, 0.5);
    }
  }
  ctx.beginPath();
  ctx.arc(0, -r * 0.15, r * 0.82, Math.PI * 0.82, Math.PI * 2.18);
  ctx.lineTo(r * 0.45, r * 0.75);
  ctx.lineTo(-r * 0.45, r * 0.75);
  ctx.closePath();
  const sg = ctx.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.05, 0, 0, r);
  sg.addColorStop(0, lighten(color, 0.6));
  sg.addColorStop(0.5, color);
  sg.addColorStop(1, darken(color, 0.4));
  ctx.fillStyle = sg;
  ctx.fill();
  ink(ctx, Math.max(0.35, r * 0.12));
  ctx.fillStyle = eyes;
  ctx.beginPath();
  ctx.ellipse(-r * 0.33, -r * 0.08, r * 0.24, r * 0.27, 0.2, 0, TAU);
  ctx.ellipse(r * 0.33, -r * 0.08, r * 0.24, r * 0.27, -0.2, 0, TAU);
  ctx.fill();
  polygon(ctx, [
    [0, r * 0.18],
    [-r * 0.1, r * 0.36],
    [r * 0.1, r * 0.36],
  ]);
  ctx.fill();
  ctx.strokeStyle = eyes;
  ctx.lineWidth = Math.max(0.2, r * 0.07);
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * r * 0.16, r * 0.5);
    ctx.lineTo(i * r * 0.16, r * 0.75);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Hot, readable enemy-fire bullet body: dark rim → saturated body → white-hot core (DESIGN §1).
 * Shared by ordnance and any content that wants bespoke enemy shots.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} r
 * @param {{body?:string, core?:string, rim?:string, halo?:number}} [opts] halo: glow radius ×r
 */
export function hotOrb(ctx, x, y, r, opts = {}) {
  const { body = PAL.enemyFire[0], core = PAL.enemyFire[1], rim = '#3a0806', halo = 1.7 } = opts;
  if (halo > 0) glow(ctx, x, y, r * halo, body, 0.55);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = rim;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.8, 0, TAU);
  const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, 0, x, y, r * 0.8);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, core);
  g.addColorStop(0.7, body);
  g.addColorStop(1, darken(body, 0.25));
  ctx.fillStyle = g;
  ctx.fill();
}
