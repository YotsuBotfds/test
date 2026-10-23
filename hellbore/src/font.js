// Hand-drawn 5x7 bitmap font. Glyphs are trimmed to their lit columns so the
// text is proportional; digits keep full width so counters do not jitter.
import { makeCanvas } from './util.js';

const G = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.....', '..#..'],
  ',': ['.....', '.....', '.....', '.....', '.....', '..#..', '.#...'],
  ':': ['.....', '..#..', '.....', '.....', '.....', '..#..', '.....'],
  ';': ['.....', '..#..', '.....', '.....', '.....', '..#..', '.#...'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  "'": ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
  '"': ['.#.#.', '.#.#.', '.....', '.....', '.....', '.....', '.....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '[': ['.###.', '.#...', '.#...', '.#...', '.#...', '.#...', '.###.'],
  ']': ['.###.', '...#.', '...#.', '...#.', '...#.', '...#.', '.###.'],
  '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
  '>': ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
  '<': ['...#.', '..#..', '.#...', '#....', '.#...', '..#..', '...#.'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
  '#': ['.#.#.', '#####', '.#.#.', '.#.#.', '.#.#.', '#####', '.#.#.'],
  _: ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  // Icons mapped onto otherwise unused characters.
  '^': ['..#..', '.###.', '#####', '..#..', '..#..', '..#..', '..#..'], // up arrow
  '~': ['..#..', '..#..', '..#..', '..#..', '#####', '.###.', '..#..'], // down arrow
  '@': ['.....', '.###.', '##.##', '#.###', '#####', '.###.', '.....'], // ore nugget
  '&': ['.##.#', '#..#.', '..#..', '.###.', '#####', '#####', '.###.'], // charge/bomb
  '$': ['.#.#.', '#####', '#####', '#####', '.###.', '..#..', '.....'], // heart
  '|': ['..#..', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
};

const GH = 7;
const glyphs = new Map(); // char -> {sx, w}
let atlas = null;
const tinted = new Map();

function build() {
  const chars = Object.keys(G);
  const [c, ctx] = makeCanvas(chars.length * 6, GH);
  let x = 0;
  for (const ch of chars) {
    const rows = G[ch];
    let minC = 5;
    let maxC = -1;
    for (const row of rows) {
      for (let i = 0; i < 5; i++) {
        if (row[i] === '#') {
          minC = Math.min(minC, i);
          maxC = Math.max(maxC, i);
        }
      }
    }
    const fixed = /[0-9]/.test(ch);
    if (fixed || maxC < 0) {
      minC = 0;
      maxC = 4;
    }
    const w = maxC - minC + 1;
    ctx.fillStyle = '#fff';
    rows.forEach((row, ry) => {
      for (let i = minC; i <= maxC; i++) if (row[i] === '#') ctx.fillRect(x + i - minC, ry, 1, 1);
    });
    glyphs.set(ch, { sx: x, w });
    x += w + 1;
  }
  atlas = c;
}

function atlasFor(color) {
  let a = tinted.get(color);
  if (!a) {
    if (!atlas) build();
    const [c, ctx] = makeCanvas(atlas.width, atlas.height);
    ctx.drawImage(atlas, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, c.width, c.height);
    a = c;
    tinted.set(color, a);
  }
  return a;
}

export function textWidth(str, scale = 1) {
  if (!atlas) build();
  let w = 0;
  for (const ch of String(str).toUpperCase()) {
    if (ch === ' ') w += 3;
    else w += (glyphs.get(ch)?.w ?? 3) + 1;
  }
  return Math.max(0, w - 1) * scale;
}

export const LINE_H = GH;

/**
 * Draw pixel text. opts: color, scale, align ('left'|'center'|'right'), shadow (color or false), alpha
 */
export function drawText(ctx, str, x, y, opts = {}) {
  const scale = opts.scale ?? 1;
  const color = opts.color ?? '#fff';
  const align = opts.align ?? 'left';
  const s = String(str).toUpperCase();
  let w = textWidth(s, scale);
  let sx = x;
  if (align === 'center') sx = x - w / 2;
  else if (align === 'right') sx = x - w;
  sx = Math.round(sx);
  const sy = Math.round(y);
  const prevAlpha = ctx.globalAlpha;
  if (opts.alpha !== undefined) ctx.globalAlpha = prevAlpha * opts.alpha;
  if (opts.shadow !== false) {
    blit(ctx, s, sx + scale, sy + scale, scale, opts.shadow || 'rgba(0,0,0,0.85)');
  }
  w = blit(ctx, s, sx, sy, scale, color);
  ctx.globalAlpha = prevAlpha;
  return w;
}

function blit(ctx, s, x, y, scale, color) {
  const a = atlasFor(color);
  let cx = x;
  for (const ch of s) {
    if (ch === ' ') {
      cx += 3 * scale;
      continue;
    }
    const g = glyphs.get(ch);
    if (!g) {
      cx += 4 * scale;
      continue;
    }
    ctx.drawImage(a, g.sx, 0, g.w, GH, cx, y, g.w * scale, GH * scale);
    cx += (g.w + 1) * scale;
  }
  return cx - x;
}

/** Wrap text into lines that fit maxWidth (in pixels at the given scale). */
export function wrapText(str, maxWidth, scale = 1) {
  const words = String(str).toUpperCase().split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (textWidth(test, scale) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** Big logo text with a vertical gradient fill and dark outline, rendered once to a canvas. */
export function renderLogo(str, scale, stops, outline = '#120404') {
  const w = textWidth(str, scale) + scale * 4;
  const h = GH * scale + scale * 5;
  const [c, ctx] = makeCanvas(w, h);
  const [m, mctx] = makeCanvas(w, h);
  blit(mctx, str.toUpperCase(), scale * 2, scale * 2, scale, '#fff');
  mctx.globalCompositeOperation = 'source-in';
  const grad = mctx.createLinearGradient(0, scale * 2, 0, scale * 2 + GH * scale);
  stops.forEach(([o, col]) => grad.addColorStop(o, col));
  mctx.fillStyle = grad;
  mctx.fillRect(0, 0, w, h);
  const [o, octx] = makeCanvas(w, h);
  blit(octx, str.toUpperCase(), scale * 2, scale * 2, scale, outline);
  const r = Math.max(1, Math.round(scale / 3));
  // Deep drop shadow, then a tight outline, then the gradient face.
  for (let d = 1; d <= scale; d++) ctx.drawImage(o, d >> 1, d);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) ctx.drawImage(o, dx, dy);
  }
  ctx.drawImage(m, 0, 0);
  // Engraved highlight on the top row of every glyph pixel band.
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(0, scale * 2, w, Math.max(1, scale >> 1));
  ctx.fillStyle = 'rgba(80,0,0,0.25)';
  for (let y = scale * 2 + scale; y < h; y += scale * 2) ctx.fillRect(0, y, w, Math.max(1, scale >> 2));
  return c;
}
