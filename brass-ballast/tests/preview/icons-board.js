// WP5 preview: every icon_* sprite through Sprites.iconURL (the path the DOM UI uses), grouped by
// category, at a chosen pixel size (?px=40|64|96) on dark or parchment (?light=1).
import { Sprites } from '../../js/gfx/sprites.js';
import { ICON_CATEGORIES } from '../../js/gfx/art/icons.js';

const q = new URLSearchParams(location.search);
const px = Number(q.get('px') || 64);
const filter = q.get('filter') || 'icon_';
if (q.get('light')) document.body.classList.add('light');
document.body.style.setProperty('--cell', `${Math.max(64, px + 12)}px`);

const order = ['primary', 'aux', 'evolution', 'passive', 'workshop', 'mode', 'generic'];
const groups = new Map(order.map((k) => [k, []]));
for (const name of Sprites.list()) {
  if (!name.startsWith(filter)) continue;
  const cat = ICON_CATEGORIES[name] || 'other';
  if (!groups.has(cat)) groups.set(cat, []);
  groups.get(cat).push(name);
}
const board = document.getElementById('board');
let total = 0;
for (const [cat, names] of groups) {
  if (!names.length) continue;
  const h = document.createElement('h2');
  h.textContent = `${cat} (${names.length})`;
  const row = document.createElement('div');
  row.className = 'row';
  for (const name of names) {
    const fig = document.createElement('figure');
    const img = document.createElement('img');
    img.src = Sprites.iconURL(name, Math.round(px * (devicePixelRatio || 1)));
    img.width = px;
    img.height = px;
    const cap = document.createElement('figcaption');
    cap.textContent = name.replace(/^icon_/, '');
    fig.append(img, cap);
    row.append(fig);
    total++;
  }
  board.append(h, row);
}
console.log(`[test] icon board rendered ${total} icons at ${px}px`);
