// WP4 art preview: a gallery of just the WP4 sprites, plus an in-game-scale "scene" that composes
// hulls + props + turrets + shadows on a sky backdrop, with ordnance and pickups at 1×.
import '../../js/gfx/art/ships.js';
import '../../js/gfx/art/ordnance.js';
import '../../js/gfx/art/pickups.js';
import '../../js/gfx/art/fxtex.js';
import { HULL_MOUNTS } from '../../js/gfx/art/ships.js';
import { Sprites } from '../../js/gfx/sprites.js';

const q = new URLSearchParams(location.search);
const view = q.get('view') || 'gallery';
const filters = (q.get('filter') || '').split(',').filter(Boolean);
const scale = Number(q.get('scale') || 2);
const bg = q.get('bg');
const showDot = q.get('dot') !== '0';
const grid = document.getElementById('grid');
if (bg) document.body.style.background = bg;

function gallery() {
  const names = Sprites.list()
    .filter((n) => !filters.length || filters.some((f) => n.startsWith(f)))
    .sort();
  document.getElementById('count').textContent = `${names.length} sprites`;
  for (const name of names) {
    const frames = Sprites.frames(name);
    for (let f = 0; f < frames; f++) {
      const s = Sprites.get(name, f);
      const c = document.createElement('canvas');
      const pad = 6;
      c.width = Math.ceil(s.w * scale + pad * 2);
      c.height = Math.ceil(s.h * scale + pad * 2);
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(s.img, pad, pad, s.w * scale, s.h * scale);
      if (showDot) {
        ctx.strokeStyle = 'rgba(255,60,60,.8)';
        ctx.beginPath();
        ctx.arc(pad + s.cx * scale, pad + s.cy * scale, 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      const fig = document.createElement('figure');
      const cap = document.createElement('figcaption');
      cap.textContent = `${name}${frames > 1 ? ` [${f}]` : ''} ${s.w}×${s.h}`;
      fig.append(c, cap);
      grid.append(fig);
    }
  }
}

function drawShip(ctx, hull, turret, x, y, angle, aim, sc, frame) {
  // engine-style shadow (alt 0.5): cached blurred silhouette offset down-right
  Sprites.drawShadow(ctx, `hull_${hull}`, x + 26 * 0.5 * sc, y + 34 * 0.5 * sc, angle, sc, 0.3);
  Sprites.draw(ctx, `hull_${hull}`, x, y, angle, sc);
  const m = HULL_MOUNTS[hull];
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  for (const [px, py] of m.props) {
    Sprites.draw(
      ctx,
      'prop',
      x + (px * ca - py * sa) * sc,
      y + (px * sa + py * ca) * sc,
      angle,
      sc,
      1,
      frame
    );
  }
  const [tx, ty] = m.turret;
  Sprites.draw(
    ctx,
    `turret_${turret}`,
    x + (tx * ca - ty * sa) * sc,
    y + (tx * sa + ty * ca) * sc,
    aim,
    sc
  );
}

function scene() {
  document.getElementById('count').textContent = 'scene';
  const W = Math.min(innerWidth - 20, 1900);
  const H = 1500;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  grid.append(c);
  const ctx = c.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, bg || '#f2c98f');
  sky.addColorStop(1, bg || '#e9b07a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  // a few faint ground features for contrast checks
  ctx.fillStyle = 'rgba(120,150,110,0.35)';
  ctx.fillRect(0, 520, W, 160);
  ctx.fillStyle = 'rgba(70,110,140,0.35)';
  ctx.fillRect(0, 900, W, 160);
  ctx.font = '14px Georgia';
  ctx.fillStyle = '#2b1d10';
  const hulls = Object.keys(HULL_MOUNTS);
  const turrets = ['brassCannon', 'gatling', 'blunderbuss', 'mortar', 'aetherLance', 'harpoon'];
  // row 1: 1× in-game scale, several headings
  ctx.fillText('1× (in-game)', 10, 20);
  hulls.forEach((h, i) => {
    drawShip(ctx, h, turrets[i % 6], 90 + i * 170, 90, 0, -0.5, 1, i % 4);
    drawShip(ctx, h, turrets[(i + 2) % 6], 90 + i * 170, 220, -0.7, 0.9, 1, (i + 1) % 4);
    drawShip(ctx, h, turrets[(i + 4) % 6], 90 + i * 170, 350, 2.4, 3.0, 1, (i + 2) % 4);
  });
  // row 2: 2× zoom
  ctx.fillText('2×', 10, 460);
  hulls.forEach((h, i) => {
    const x = 130 + (i % 3) * 330;
    const y = 560 + Math.floor(i / 3) * 190;
    drawShip(ctx, h, turrets[i % 6], x, y, 0, 0.35, 2, i % 4);
  });
  // ordnance & pickups at 1× and 2×
  const small = Sprites.list()
    .filter((n) => /^(pb_|eb_|pk_)/.test(n))
    .sort();
  ctx.fillText('ordnance & pickups 1× / 2×', 10, 960);
  small.forEach((n, i) => {
    const x = 30 + (i % 30) * 46;
    const yb = 1000 + Math.floor(i / 30) * 60;
    Sprites.draw(ctx, n, x, yb, 0, 1, 1, 0);
  });
  small.forEach((n, i) => {
    const x = 40 + (i % 18) * 78;
    const yb = 1180 + Math.floor(i / 18) * 90;
    Sprites.draw(ctx, n, x, yb, 0, 2, 1, 0);
    ctx.font = '10px Georgia';
    ctx.fillText(n, x - 24, yb + 36);
  });
  // a cluster of enemy fire over a busy patch to judge readability
  ctx.fillText('readability: enemy fire vs player fire', 1100, 460);
  const eb = small.filter((n) => n.startsWith('eb_'));
  const pb = small.filter((n) => n.startsWith('pb_'));
  for (let i = 0; i < 40; i++) {
    const n = eb[i % eb.length];
    Sprites.draw(ctx, n, 1120 + (i % 8) * 34, 500 + Math.floor(i / 8) * 34, i * 0.4, 1);
  }
  for (let i = 0; i < 40; i++) {
    const n = pb[i % pb.length];
    Sprites.draw(ctx, n, 1420 + (i % 8) * 38, 500 + Math.floor(i / 8) * 34, -i * 0.3, 1, 1, i % 2);
  }
}

if (view === 'scene') scene();
else gallery();
console.log(`[test] wp4 preview rendered (${view})`);
