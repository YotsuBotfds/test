// STUB (WP4 replaces/extends) — steampunk drawing primitives shared by all art.
// API is a contract (DESIGN §12 WP4); these simple versions keep callers working meanwhile.

import { PAL } from '../config.js';

export { PAL };

const METALS = {
  brass: PAL.brass,
  gold: ['#fff1b0', '#ffcf4a', '#a8781c', '#5a3d0c'],
  copper: [PAL.copper[0], PAL.copper[1], PAL.copper[2], '#3d1f10'],
  iron: PAL.iron,
  steel: ['#d6dde4', '#8e99a5', '#4d5560', '#262b31'],
  wood: [PAL.wood[0], PAL.wood[1], PAL.wood[2], '#24170a'],
  syndicate: ['#7a808b', PAL.syndicate[0], PAL.syndicate[1], '#141518'],
};

/** Linear metal gradient (highlight top-left → shade bottom-right). */
export function metal(ctx, x0, y0, x1, y1, kind = 'brass') {
  const c = METALS[kind] || METALS.brass;
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, c[0]);
  g.addColorStop(0.45, c[1]);
  g.addColorStop(1, c[2]);
  return g;
}

export function roundRect(ctx, x, y, w, h, r = 4) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

export function ink(ctx, width = 1.2) {
  ctx.lineWidth = width;
  ctx.strokeStyle = 'rgba(26,18,10,0.65)';
  ctx.stroke();
}

export function rivet(ctx, x, y, r = 1.2, kind = 'brass') {
  const c = METALS[kind] || METALS.brass;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = c[2];
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = c[0];
  ctx.fill();
}

export function rivetLine(ctx, x0, y0, x1, y1, spacing = 6, r = 1.1, kind = 'brass') {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.floor(d / spacing));
  for (let i = 0; i <= n; i++) rivet(ctx, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, r, kind);
}

export function gear(ctx, x, y, r, teeth = 10, opts = {}) {
  const { kind = 'brass', toothDepth = r * 0.22, hole = r * 0.3, rotation = 0 } = opts;
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = rotation + (i / (teeth * 2)) * Math.PI * 2;
    const a1 = rotation + ((i + 1) / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r - toothDepth;
    ctx.lineTo(x + Math.cos(a0) * rr, y + Math.sin(a0) * rr);
    ctx.lineTo(x + Math.cos(a1) * rr, y + Math.sin(a1) * rr);
  }
  ctx.closePath();
  if (hole > 0) {
    ctx.moveTo(x + hole, y);
    ctx.arc(x, y, hole, 0, Math.PI * 2, true);
  }
  ctx.fillStyle = metal(ctx, x - r, y - r, x + r, y + r, kind);
  ctx.fill('evenodd');
  ink(ctx, 1);
}

/** Top-down gasbag: elongated rounded body along +x centered at (cx, cy). */
export function envelope(ctx, cx, cy, len, wid, opts = {}) {
  const { fill = PAL.canvas[0], shade = PAL.canvas[2], ribs = 6 } = opts;
  const g = ctx.createLinearGradient(cx, cy - wid / 2, cx, cy + wid / 2);
  g.addColorStop(0, fill);
  g.addColorStop(1, shade);
  ctx.beginPath();
  ctx.ellipse(cx, cy, len / 2, wid / 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ink(ctx, 1.4);
  ctx.strokeStyle = 'rgba(80,60,30,0.35)';
  ctx.lineWidth = 0.8;
  for (let i = 1; i < ribs; i++) {
    const x = cx - len / 2 + (len * i) / ribs;
    const t = (x - cx) / (len / 2);
    const hh = (wid / 2) * Math.sqrt(Math.max(0, 1 - t * t));
    ctx.beginPath();
    ctx.moveTo(x, cy - hh);
    ctx.lineTo(x, cy + hh);
    ctx.stroke();
  }
}

export function propeller(ctx, x, y, r, blades = 3, rot = 0, opts = {}) {
  const { kind = 'brass', blur = false } = opts;
  if (blur) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(220,210,180,0.25)';
    ctx.fill();
  }
  for (let i = 0; i < blades; i++) {
    const a = rot + (i / blades) * Math.PI * 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(r * 0.5, 0, r * 0.5, r * 0.16, 0, 0, Math.PI * 2);
    ctx.fillStyle = metal(ctx, 0, -r * 0.2, r, r * 0.2, kind);
    ctx.fill();
    ink(ctx, 0.8);
    ctx.restore();
  }
  rivet(ctx, x, y, r * 0.18, kind);
}

export function porthole(ctx, x, y, r, opts = {}) {
  const { glow: lit = false, color = lit ? '#ffcf6a' : '#3a5a6e' } = opts;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = metal(ctx, x - r, y - r, x + r, y + r, 'brass');
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.65, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

export function pipe(ctx, points, width = 3, kind = 'copper') {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.lineWidth = width + 1.5;
  ctx.strokeStyle = 'rgba(26,18,10,0.7)';
  ctx.stroke();
  ctx.lineWidth = width;
  ctx.strokeStyle = (METALS[kind] || METALS.copper)[1];
  ctx.stroke();
}

export function plate(ctx, x, y, w, h, radius = 3, kind = 'iron') {
  roundRect(ctx, x, y, w, h, radius);
  ctx.fillStyle = metal(ctx, x, y, x + w, y + h, kind);
  ctx.fill();
  ink(ctx, 1);
}

export function smokestack(ctx, x, y, r, kind = 'iron') {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = metal(ctx, x - r, y - r, x + r, y + r, kind);
  ctx.fill();
  ink(ctx, 1);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.65, 0, Math.PI * 2);
  ctx.fillStyle = '#120d08';
  ctx.fill();
}

export function glow(ctx, x, y, r, color = '#ffd36b', alpha = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function grime(ctx, x, y, w, h, density = 0.2, seed = 1) {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  ctx.save();
  ctx.fillStyle = 'rgba(30,20,10,0.25)';
  const n = Math.floor(w * h * density * 0.02);
  for (let i = 0; i < n; i++) ctx.fillRect(x + rnd() * w, y + rnd() * h, 0.8, 0.8);
  ctx.restore();
}

export function cannon(ctx, x, y, len, width, kind = 'iron') {
  plate(ctx, x, y - width / 2, len, width, width / 3, kind);
  ctx.beginPath();
  ctx.arc(x + len, y, width * 0.32, 0, Math.PI * 2);
  ctx.fillStyle = '#120d08';
  ctx.fill();
}

export function flag(ctx, x, y, w, h, colors = [PAL.oxblood, PAL.canvas[0]]) {
  ctx.fillStyle = colors[0];
  ctx.fillRect(x, y, w, h / 2);
  ctx.fillStyle = colors[1] || colors[0];
  ctx.fillRect(x, y + h / 2, w, h / 2);
}
