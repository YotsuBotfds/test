// Renders every registered sprite (art + content modules) in a labelled grid.
import '../../js/gfx/art/index.js';
import '../../js/content/enemies/index.js';
import '../../js/content/bosses/index.js';
import '../../js/content/weapons/index.js';
import { Sprites } from '../../js/gfx/sprites.js';

const q = new URLSearchParams(location.search);
const filters = (q.get('filter') || '').split(',').filter(Boolean);
const scale = Number(q.get('scale') || 1.5);
const showFrames = q.get('frames') !== '0';
if (q.get('bg')) document.body.style.background = q.get('bg');

const names = Sprites.list()
  .filter((n) => !filters.length || filters.some((f) => n.startsWith(f)))
  .sort();
const grid = document.getElementById('grid');
document.getElementById('count').textContent = `${names.length} sprites`;

for (const name of names) {
  const frames = showFrames ? Sprites.frames(name) : 1;
  for (let f = 0; f < frames; f++) {
    const s = Sprites.get(name, f);
    const c = document.createElement('canvas');
    const pad = 8;
    c.width = Math.ceil(s.w * scale + pad * 2);
    c.height = Math.ceil(s.h * scale + pad * 2);
    const ctx = c.getContext('2d');
    ctx.drawImage(s.img, pad, pad, s.w * scale, s.h * scale);
    ctx.strokeStyle = 'rgba(255,80,80,.7)';
    ctx.beginPath();
    ctx.arc(pad + s.cx * scale, pad + s.cy * scale, 2, 0, Math.PI * 2);
    ctx.stroke();
    const fig = document.createElement('figure');
    const cap = document.createElement('figcaption');
    cap.textContent = `${name}${frames > 1 ? ` [${f}]` : ''} ${s.w}×${s.h}`;
    fig.append(c, cap);
    grid.append(fig);
  }
}
console.log(`[test] gallery rendered ${names.length} sprites`);
