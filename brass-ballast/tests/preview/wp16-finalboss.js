// WP16 preview: every Sun Furnace sprite (?mode=sprites, default) or the assembled boss in each
// visual state (?mode=states) rendered by the real draw code with a fake world.
import '../../js/gfx/art/index.js';
import { Sprites } from '../../js/gfx/sprites.js';
import '../../js/content/bosses/sunFurnace-art.js';

const q = new URLSearchParams(location.search);
const scale = Number(q.get('scale') || 1);
const grid = document.getElementById('grid');

function fig(canvas, label) {
  const f = document.createElement('figure');
  const c = document.createElement('figcaption');
  c.textContent = label;
  f.append(canvas, c);
  grid.append(f);
}

async function sprites() {
  for (const name of Sprites.list().filter((n) => n.startsWith('boss_sunFurnace')).sort()) {
    for (let fr = 0; fr < Sprites.frames(name); fr++) {
      const s = Sprites.get(name, fr);
      const c = document.createElement('canvas');
      c.width = Math.ceil(s.w * scale) + 8;
      c.height = Math.ceil(s.h * scale) + 8;
      const ctx = c.getContext('2d');
      ctx.drawImage(s.img, 4, 4, s.w * scale, s.h * scale);
      fig(c, `${name}[${fr}] ${s.w}x${s.h}`);
    }
  }
}

async function states() {
  const mod = await import('../../js/content/bosses/sunFurnace-render.js');
  const list = (q.get('states') || 'shell,vent,shatter,exposed,hot,nova,dying').split(',');
  for (const st of list) {
    const c = document.createElement('canvas');
    c.width = 620;
    c.height = 620;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#5a2a16';
    ctx.fillRect(0, 0, 620, 620);
    mod.previewState?.(ctx, st, 310, 310);
    fig(c, st);
  }
}

(q.get('mode') === 'states' ? states() : sprites()).then(() => {
  document.title += ' ready';
});
