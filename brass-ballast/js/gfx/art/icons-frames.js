// Icon frames (WP5): the brass medallions, workshop plaques and mode emblems that every glyph
// sits in, plus `stamp()` which composites a glyph as raised relief (drop shadow onto the
// enamel, lit emboss edge, optional aether halo). Category is read from the field tint; rarity
// belongs to the UI card frame, not the icon.

import { metal } from '../drawkit.js';
import { TAU, C, INKC, P, R, rng, rivet, glow, fill, detail, body, sparkle } from './icons-kit.js';

function makeCanvas(w, h) {
  try {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  } catch {
    /* fall through */
  }
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function silhouette(src, color) {
  const s = makeCanvas(src.width, src.height);
  const g = s.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, s.width, s.height);
  return s;
}

/**
 * Draw a glyph on its own layer, then composite it with relief effects (baked once per icon).
 * @param {CanvasRenderingContext2D} ctx sprite context (already scaled to icon units)
 * @param {(ctx:CanvasRenderingContext2D)=>void} draw glyph painter (64-unit box)
 * @param {{shadow?:number, shadowColor?:string, emboss?:number, embossColor?:string,
 *   halo?:string, haloA?:number, haloR?:number}} [o]
 */
export function stamp(ctx, draw, o = {}) {
  const src = ctx.canvas;
  const layer = src && typeof ctx.getTransform === 'function' ? makeCanvas(src.width, src.height) : null;
  if (!layer) {
    draw(ctx);
    return;
  }
  const g = layer.getContext('2d');
  g.setTransform(ctx.getTransform());
  g.lineJoin = 'round';
  g.lineCap = 'round';
  draw(g);
  const k = ctx.getTransform().a || 1;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (o.halo) {
    const s = silhouette(layer, o.halo);
    ctx.globalCompositeOperation = 'lighter';
    const hr = o.haloR ?? 3.4;
    for (const [rad, a] of [[hr, 0.09], [hr * 0.55, 0.16]]) {
      ctx.globalAlpha = a * (o.haloA ?? 1);
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * TAU;
        ctx.drawImage(s, Math.cos(ang) * rad * k, Math.sin(ang) * rad * k);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  if (o.shadow) {
    const s = silhouette(layer, o.shadowColor || '#000000');
    ctx.globalAlpha = o.shadow * 0.45;
    ctx.drawImage(s, 2.2 * k, 3 * k);
    ctx.globalAlpha = o.shadow;
    ctx.drawImage(s, 1.2 * k, 1.7 * k);
  }
  if (o.emboss) {
    const s = silhouette(layer, o.embossColor || '#ffffff');
    ctx.globalAlpha = o.emboss;
    ctx.drawImage(s, -0.8 * k, -0.8 * k);
  }
  ctx.globalAlpha = 1;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Round medallions

/** Field styles per category. field = [centre, mid, edge]. */
export const FIELDS = {
  primary: {
    field: ['#5b86b8', '#2a4c78', '#0e1c33'],
    rose: 'rgba(170,205,255,0.13)',
    rim: 'brass',
    shadow: 0.6,
    emboss: 0.16,
  },
  aux: {
    field: ['#5fd0b6', '#23806f', '#0a3a33'],
    rose: 'rgba(190,255,235,0.14)',
    rim: 'brass',
    shadow: 0.55,
    emboss: 0.16,
    patina: true,
  },
  passive: {
    field: ['#fff6df', '#efdcae', '#bf9f63'],
    rose: 'rgba(120,78,30,0.16)',
    rim: 'brass',
    shadow: 0.4,
    shadowColor: '#4a2e10',
    emboss: 0,
  },
  evolution: {
    field: ['#3b3631', '#16120f', '#040302'],
    rose: 'rgba(255,207,74,0.10)',
    rim: 'gold',
    shadow: 0.7,
    emboss: 0.12,
    embossColor: '#ffe9a0',
    halo: '#7ff3ff',
  },
};

const RIM_R = 31;
const FIELD_R = 25.2;

function rimDisc(ctx, kind, rivets, gems) {
  // outer disc
  ctx.beginPath();
  ctx.arc(C, C, RIM_R, 0, TAU);
  ctx.fillStyle = metal(ctx, C - RIM_R, C - RIM_R, C + RIM_R, C + RIM_R, kind, { polish: true });
  ctx.fill();
  // outer bevel: bright upper-left lip, dark lower-right
  const bev = ctx.createLinearGradient(C - RIM_R, C - RIM_R, C + RIM_R, C + RIM_R);
  bev.addColorStop(0, 'rgba(255,255,255,0.75)');
  bev.addColorStop(0.45, 'rgba(255,255,255,0)');
  bev.addColorStop(0.55, 'rgba(0,0,0,0)');
  bev.addColorStop(1, 'rgba(40,20,0,0.6)');
  ctx.beginPath();
  ctx.arc(C, C, RIM_R - 1.1, 0, TAU);
  ctx.strokeStyle = bev;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  // engraved channel lines
  detail(ctx, P.circle(C, C, RIM_R - 2.4), 'rgba(60,34,8,0.45)', 0.5);
  detail(ctx, P.circle(C, C, FIELD_R + 1.9), 'rgba(60,34,8,0.35)', 0.5);
  // knurling ticks on the outer lip
  ctx.save();
  ctx.strokeStyle = 'rgba(60,34,8,0.35)';
  ctx.lineWidth = 0.45;
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * TAU;
    ctx.beginPath();
    ctx.moveTo(C + Math.cos(a) * (RIM_R - 0.3), C + Math.sin(a) * (RIM_R - 0.3));
    ctx.lineTo(C + Math.cos(a) * (RIM_R - 1.5), C + Math.sin(a) * (RIM_R - 1.5));
    ctx.stroke();
  }
  ctx.restore();
  // tiny rivets
  for (let i = 0; i < rivets; i++) {
    const a = -Math.PI / 2 + (i / rivets) * TAU + Math.PI / rivets;
    if (gems && i % 2 === 0) continue;
    rivet(ctx, C + Math.cos(a) * 28.2, C + Math.sin(a) * 28.2, 1.15, kind === 'gold' ? 'gold' : 'brass');
  }
  if (gems) {
    for (let i = 0; i < rivets; i += 2) {
      const a = -Math.PI / 2 + (i / rivets) * TAU + Math.PI / rivets;
      const x = C + Math.cos(a) * 28.2;
      const y = C + Math.sin(a) * 28.2;
      glow(ctx, x, y, 3.2, '#7ff3ff', 0.7);
      body(ctx, P.circle(x, y, 1.35), R.aether, { d: 0.5, hi: 0, out: 0.7 });
      fill(ctx, P.circle(x - 0.4, y - 0.4, 0.45), '#ffffff');
    }
  }
  // outer ink
  ctx.beginPath();
  ctx.arc(C, C, RIM_R - 0.4, 0, TAU);
  ctx.strokeStyle = INKC;
  ctx.lineWidth = 1.3;
  ctx.stroke();
}

function enamelField(ctx, st) {
  const [c0, c1, c2] = st.field;
  // inner wall of the recess: lit lower-right, shaded upper-left
  const wall = ctx.createLinearGradient(C - FIELD_R, C - FIELD_R, C + FIELD_R, C + FIELD_R);
  wall.addColorStop(0, 'rgba(30,16,4,0.85)');
  wall.addColorStop(0.5, 'rgba(30,16,4,0.2)');
  wall.addColorStop(1, 'rgba(255,240,200,0.7)');
  ctx.beginPath();
  ctx.arc(C, C, FIELD_R + 1, 0, TAU);
  ctx.fillStyle = wall;
  ctx.fill();
  const g = ctx.createRadialGradient(C - 6, C - 7, 2, C, C, FIELD_R);
  g.addColorStop(0, c0);
  g.addColorStop(0.55, c1);
  g.addColorStop(1, c2);
  ctx.beginPath();
  ctx.arc(C, C, FIELD_R, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // guilloché rosette (engine turning)
  ctx.strokeStyle = st.rose;
  ctx.lineWidth = 0.45;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    ctx.beginPath();
    ctx.arc(C + Math.cos(a) * 9, C + Math.sin(a) * 9, 13.5, 0, TAU);
    ctx.stroke();
  }
  for (const r of [19.5, 22.5]) {
    ctx.beginPath();
    ctx.arc(C, C, r, 0, TAU);
    ctx.stroke();
  }
  if (st.patina) {
    // verdigris blooms
    const rnd = rng(17);
    for (let i = 0; i < 14; i++) {
      const a = rnd() * TAU;
      const d = 14 + rnd() * 10;
      glow(ctx, C + Math.cos(a) * d, C + Math.sin(a) * d, 2 + rnd() * 3.5, '#8fffd8', 0.12);
    }
  }
  // recess shadow cast by the rim (upper-left)
  ctx.beginPath();
  ctx.rect(0, 0, 64, 64);
  ctx.arc(C + 1.6, C + 2.1, FIELD_R, 0, TAU, true);
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.fill('evenodd');
  ctx.restore();
}

function glassSheen(ctx, a = 0.16) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(C, C, FIELD_R, 0, TAU);
  ctx.clip();
  const g = ctx.createLinearGradient(C - 20, C - 22, C + 4, C + 6);
  g.addColorStop(0, `rgba(255,255,255,${a})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.ellipse(C - 7, C - 9, 20, 12, -0.7, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

function aetherRing(ctx) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [w, a] of [[5, 0.12], [3, 0.22], [1.4, 0.7]]) {
    ctx.beginPath();
    ctx.arc(C, C, FIELD_R - 1.4, 0, TAU);
    ctx.strokeStyle = `rgba(127,243,255,${a})`;
    ctx.lineWidth = w;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(C, C, FIELD_R - 1.4, 0, TAU);
  ctx.strokeStyle = 'rgba(232,255,255,0.75)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.restore();
}

/**
 * Round brass medallion with an enamel field.
 * @param {CanvasRenderingContext2D} ctx
 * @param {'primary'|'aux'|'passive'|'evolution'} cat
 * @param {(ctx:CanvasRenderingContext2D)=>void} glyph
 */
export function medallion(ctx, cat, glyph) {
  const st = FIELDS[cat] || FIELDS.primary;
  const evo = cat === 'evolution';
  rimDisc(ctx, st.rim, evo ? 16 : 8, evo);
  enamelField(ctx, st);
  if (evo) {
    aetherRing(ctx);
    // radiating gold rays behind the glyph
    ctx.save();
    ctx.beginPath();
    ctx.arc(C, C, FIELD_R - 2, 0, TAU);
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      ctx.beginPath();
      ctx.moveTo(C, C);
      ctx.arc(C, C, FIELD_R, a - 0.07, a + 0.07);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,207,74,0.07)';
      ctx.fill();
    }
    glow(ctx, C, C, 20, '#ffcf4a', 0.18);
    ctx.restore();
  }
  stamp(ctx, glyph, {
    shadow: st.shadow,
    shadowColor: st.shadowColor,
    emboss: st.emboss,
    embossColor: st.embossColor,
    halo: st.halo,
    haloA: 0.55,
    haloR: 2.6,
  });
  glassSheen(ctx, cat === 'passive' ? 0.3 : 0.16);
  if (evo) {
    sparkle(ctx, C + 17, C - 16, 3.2, '#fffbe0', { glowColor: '#7ff3ff', out: 0.8 });
    sparkle(ctx, C - 18, C + 15, 2.2, '#fffbe0', { glowColor: '#7ff3ff', out: 0.7 });
  }
}

// ---------------------------------------------------------------------------------------------
// Workshop plaque: square-ish riveted wood panel in a brass frame.

export function plaque(ctx, glyph) {
  const x0 = 3;
  const s = 58;
  // brass frame
  ctx.beginPath();
  ctx.roundRect(x0, x0, s, s, 9);
  ctx.fillStyle = metal(ctx, x0, x0, x0 + s, x0 + s, 'brass', { polish: true });
  ctx.fill();
  const bev = ctx.createLinearGradient(x0, x0, x0 + s, x0 + s);
  bev.addColorStop(0, 'rgba(255,255,255,0.7)');
  bev.addColorStop(0.45, 'rgba(255,255,255,0)');
  bev.addColorStop(0.55, 'rgba(0,0,0,0)');
  bev.addColorStop(1, 'rgba(40,20,0,0.6)');
  ctx.beginPath();
  ctx.roundRect(x0 + 0.9, x0 + 0.9, s - 1.8, s - 1.8, 8);
  ctx.strokeStyle = bev;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // recess wall
  const i0 = 9;
  const is = 46;
  const wall = ctx.createLinearGradient(i0, i0, i0 + is, i0 + is);
  wall.addColorStop(0, 'rgba(30,16,4,0.85)');
  wall.addColorStop(1, 'rgba(255,240,200,0.65)');
  ctx.beginPath();
  ctx.roundRect(i0 - 1, i0 - 1, is + 2, is + 2, 5);
  ctx.fillStyle = wall;
  ctx.fill();
  // wood panel
  ctx.beginPath();
  ctx.roundRect(i0, i0, is, is, 4);
  const wg = ctx.createLinearGradient(i0, i0, i0 + is, i0 + is);
  wg.addColorStop(0, '#8a5a32');
  wg.addColorStop(0.5, '#6a4224');
  wg.addColorStop(1, '#3f2612');
  ctx.fillStyle = wg;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // grain
  const rnd = rng(42);
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 16; i++) {
    const y = i0 + 1 + i * 3 + rnd() * 1.4;
    ctx.beginPath();
    ctx.moveTo(i0, y);
    for (let x = i0; x <= i0 + is; x += 6) ctx.lineTo(x, y + Math.sin(x * 0.18 + i * 1.7) * 0.9 + rnd() * 0.4);
    ctx.strokeStyle = i % 3 ? 'rgba(30,14,4,0.28)' : 'rgba(220,160,100,0.18)';
    ctx.stroke();
  }
  // a knot
  ctx.beginPath();
  ctx.ellipse(i0 + 36, i0 + 39, 3.2, 1.4, 0.1, 0, TAU);
  ctx.strokeStyle = 'rgba(30,14,4,0.35)';
  ctx.stroke();
  // plank seam
  ctx.beginPath();
  ctx.moveTo(i0, i0 + is / 2 + 0.5);
  ctx.lineTo(i0 + is, i0 + is / 2 + 0.5);
  ctx.strokeStyle = 'rgba(20,10,2,0.3)';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  // recess shadow
  ctx.beginPath();
  ctx.rect(0, 0, 64, 64);
  ctx.roundRect(i0 + 1.5, i0 + 2, is, is, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fill('evenodd');
  ctx.restore();
  // corner brackets + rivets
  for (const [cx, cy, sx, sy] of [[x0, x0, 1, 1], [x0 + s, x0, -1, 1], [x0, x0 + s, 1, -1], [x0 + s, x0 + s, -1, -1]]) {
    ctx.beginPath();
    ctx.moveTo(cx + sx * 2, cy + sy * 2);
    ctx.lineTo(cx + sx * 14, cy + sy * 2);
    ctx.lineTo(cx + sx * 14, cy + sy * 5);
    ctx.lineTo(cx + sx * 5, cy + sy * 5);
    ctx.lineTo(cx + sx * 5, cy + sy * 14);
    ctx.lineTo(cx + sx * 2, cy + sy * 14);
    ctx.closePath();
    ctx.fillStyle = metal(ctx, cx, cy, cx + sx * 14, cy + sy * 14, 'bronze');
    ctx.fill();
    ctx.strokeStyle = 'rgba(26,18,10,0.6)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
    rivet(ctx, cx + sx * 3.6, cy + sy * 3.6, 1.35, 'brass');
  }
  for (const [x, y] of [[C, x0 + 3], [C, x0 + s - 3], [x0 + 3, C], [x0 + s - 3, C]]) rivet(ctx, x, y, 1.05, 'brass');
  ctx.beginPath();
  ctx.roundRect(x0 + 0.4, x0 + 0.4, s - 0.8, s - 0.8, 8.6);
  ctx.strokeStyle = INKC;
  ctx.lineWidth = 1.3;
  ctx.stroke();
  stamp(ctx, glyph, { shadow: 0.6, emboss: 0.12, embossColor: '#ffd9a0' });
}

// ---------------------------------------------------------------------------------------------
// Mode emblem: cog-toothed brass ring, enamel field, bold glyph, crown of rivets.

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string[]} field [centre, mid, edge]
 * @param {(ctx:CanvasRenderingContext2D)=>void} glyph
 */
export function emblem(ctx, field, glyph) {
  const teeth = 18;
  const ro = 31.5;
  const ri = 28;
  const step = TAU / teeth;
  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a = i * step - Math.PI / 2;
    const pts = [
      [a - step * 0.5, ri],
      [a - step * 0.24, ri],
      [a - step * 0.15, ro],
      [a + step * 0.15, ro],
      [a + step * 0.24, ri],
    ];
    pts.forEach(([aa, rr], j) => {
      const x = C + Math.cos(aa) * rr;
      const y = C + Math.sin(aa) * rr;
      if (!i && !j) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
  }
  ctx.closePath();
  ctx.fillStyle = metal(ctx, 0, 0, 64, 64, 'bronze', { polish: true });
  ctx.fill();
  ctx.strokeStyle = INKC;
  ctx.lineWidth = 1.3;
  ctx.stroke();
  // brass ring
  ctx.beginPath();
  ctx.arc(C, C, 28.4, 0, TAU);
  ctx.fillStyle = metal(ctx, 0, 0, 64, 64, 'brass', { polish: true });
  ctx.fill();
  ctx.strokeStyle = INKC;
  ctx.lineWidth = 1;
  ctx.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + Math.PI / 12;
    rivet(ctx, C + Math.cos(a) * 26.2, C + Math.sin(a) * 26.2, 1.1, 'brass');
  }
  const st = { field, rose: 'rgba(255,230,180,0.12)' };
  // smaller field than medallions
  ctx.save();
  const wall = ctx.createLinearGradient(C - 24, C - 24, C + 24, C + 24);
  wall.addColorStop(0, 'rgba(30,16,4,0.85)');
  wall.addColorStop(1, 'rgba(255,240,200,0.7)');
  ctx.beginPath();
  ctx.arc(C, C, 24.4, 0, TAU);
  ctx.fillStyle = wall;
  ctx.fill();
  const g = ctx.createRadialGradient(C - 5, C - 6, 2, C, C, 23.6);
  g.addColorStop(0, st.field[0]);
  g.addColorStop(0.55, st.field[1]);
  g.addColorStop(1, st.field[2]);
  ctx.beginPath();
  ctx.arc(C, C, 23.6, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  // sunburst
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    ctx.beginPath();
    ctx.moveTo(C, C);
    ctx.arc(C, C, 26, a - 0.06, a + 0.06);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,230,170,0.08)';
    ctx.fill();
  }
  ctx.beginPath();
  ctx.rect(0, 0, 64, 64);
  ctx.arc(C + 1.6, C + 2, 23.6, 0, TAU, true);
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.fill('evenodd');
  ctx.restore();
  stamp(ctx, glyph, { shadow: 0.6, emboss: 0.14 });
  ctx.save();
  ctx.beginPath();
  ctx.arc(C, C, 23.6, 0, TAU);
  ctx.clip();
  const sh = ctx.createLinearGradient(C - 18, C - 20, C + 4, C + 4);
  sh.addColorStop(0, 'rgba(255,255,255,0.16)');
  sh.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.ellipse(C - 7, C - 9, 19, 11, -0.7, 0, TAU);
  ctx.fillStyle = sh;
  ctx.fill();
  ctx.restore();
}

/** Free-standing icon (generic HUD/UI glyphs): no frame, just the inked object. */
export function bare(ctx, glyph) {
  stamp(ctx, glyph, { shadow: 0.35 });
}
