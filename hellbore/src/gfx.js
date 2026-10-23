// Procedural art: tile textures per stratum, crack overlays, light stamps and glow sprites.
import { STRATA, T, TILE } from './data.js';
import { makeCanvas, mulberry32, valueNoise, clamp, shade, rgb, add } from './util.js';

export const VARIANTS = 4;
let tileAtlas = null; // [stratum][type][variant] -> canvas
let floorAtlas = null; // [stratum][variant]
let cracks = null;
const glowCache = new Map();
let lightStamp = null;
let coneStamp = null;

function texture(seed, fn) {
  const [c, ctx] = makeCanvas(TILE, TILE);
  const img = ctx.createImageData(TILE, TILE);
  const r = mulberry32(seed);
  const set = (x, y, col, a = 255) => {
    if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
    const i = (y * TILE + x) * 4;
    img.data[i] = clamp(col[0], 0, 255);
    img.data[i + 1] = clamp(col[1], 0, 255);
    img.data[i + 2] = clamp(col[2], 0, 255);
    img.data[i + 3] = a;
  };
  const get = (x, y) => {
    const i = (clamp(y, 0, TILE - 1) * TILE + clamp(x, 0, TILE - 1)) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2]];
  };
  fn({ r, set, get, seed });
  ctx.putImageData(img, 0, 0);
  return c;
}

function fillSoft(t, base) {
  const off = t.seed * 7.13;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const blot = valueNoise(x * 0.35 + off, y * 0.35 + off, 3);
      t.set(x, y, shade(base, 0.8 + t.r() * 0.22 + blot * 0.2));
    }
  }
  for (let i = 0; i < 7; i++) t.set((t.r() * 16) | 0, (t.r() * 16) | 0, shade(base, 0.6));
  for (let i = 0; i < 3; i++) {
    const x = (t.r() * 15) | 0;
    const y = (t.r() * 15) | 0;
    t.set(x, y, shade(base, 1.3));
    t.set(x + 1, y, shade(base, 1.15));
    t.set(x, y + 1, shade(base, 0.85));
  }
}

function fillMed(t, base) {
  const off = t.seed * 3.7;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const wob = valueNoise(x * 0.25 + off, y * 0.25, 5) * 2.4;
      const band = Math.sin((y + off) * 0.85 + wob) * 0.09;
      t.set(x, y, shade(base, 0.92 + band + t.r() * 0.1));
    }
  }
  for (let i = 0; i < 2; i++) {
    const y = 2 + ((t.r() * 12) | 0);
    const x0 = (t.r() * 10) | 0;
    const len = 3 + ((t.r() * 6) | 0);
    for (let x = x0; x < x0 + len; x++) t.set(x, y, shade(base, 0.72));
  }
}

function fillHard(t, base) {
  const pts = [];
  for (let i = 0; i < 5; i++) pts.push([t.r() * 16, t.r() * 16, 0.82 + t.r() * 0.3]);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      let d1 = 1e9;
      let d2 = 1e9;
      let best = pts[0];
      for (const p of pts) {
        const d = Math.hypot(p[0] - x, p[1] - y);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          best = p;
        } else if (d < d2) d2 = d;
      }
      if (d2 - d1 < 1.1) t.set(x, y, shade(base, 0.52));
      else {
        const lit = (best[0] - x + best[1] - y) * 0.018;
        t.set(x, y, shade(base, best[2] + lit + t.r() * 0.06));
      }
    }
  }
}

function fillWall(t, base) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const hatch = (x + y) % 5 === 0 ? 0.75 : 1;
      t.set(x, y, shade(base, (0.85 + t.r() * 0.25) * hatch));
    }
  }
  for (let i = 0; i < 2; i++) t.set((t.r() * 16) | 0, (t.r() * 16) | 0, shade(base, 2.2));
}

function nuggets(t, col, count, gem) {
  for (let i = 0; i < count; i++) {
    const cx = 2 + ((t.r() * 11) | 0);
    const cy = 2 + ((t.r() * 11) | 0);
    if (gem) {
      const rad = 2 + (t.r() < 0.5 ? 1 : 0);
      for (let y = -rad; y <= rad; y++) {
        for (let x = -rad; x <= rad; x++) {
          if (Math.abs(x) + Math.abs(y) > rad) continue;
          const f = x + y < 0 ? 1.25 : x + y === 0 ? 1 : 0.7;
          t.set(cx + x, cy + y, shade(col, f));
        }
      }
      t.set(cx - 1, cy - 1, add(col, 90));
      t.set(cx + rad, cy + 1, shade(col, 0.35));
    } else {
      const cells = [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
        [-1, 0],
        [0, -1],
      ];
      for (const [x, y] of cells) if (t.r() < 0.8) t.set(cx + x, cy + y, shade(col, 0.85 + t.r() * 0.3));
      t.set(cx, cy, add(col, 70));
      t.set(cx + 2, cy + 1, shade(col, 0.4));
      t.set(cx + 1, cy + 2, shade(col, 0.4));
    }
  }
}

function fillCrystal(t, base, col) {
  fillHard(t, shade(base, 0.6));
  const n = 2 + ((t.r() * 2) | 0);
  for (let i = 0; i < n; i++) {
    const bx = 3 + ((t.r() * 10) | 0);
    const by = 9 + ((t.r() * 6) | 0);
    const len = 6 + ((t.r() * 5) | 0);
    const lean = t.r() * 0.8 - 0.4;
    for (let s = 0; s < len; s++) {
      const w = Math.max(0, Math.round((1 - s / len) * 2));
      const x = Math.round(bx + lean * s);
      const y = by - s;
      const f = 0.7 + (s / len) * 0.6;
      for (let k = -w; k <= w; k++) t.set(x + k, y, k < 0 ? shade(col, f * 1.2) : shade(col, f * 0.85));
    }
    t.set(Math.round(bx + lean * (len - 1)), by - len + 1, [255, 255, 255]);
  }
}

function fillLiquid(t, col, v) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const w = Math.sin(x * 0.7 + y * 0.45 + v * 1.7) + Math.sin(y * 0.9 - x * 0.2 + v);
      let c = shade(col, 0.82 + t.r() * 0.08);
      if (w > 1.3) c = shade(col, 1.25);
      else if (w < -1.2) c = shade(col, 0.68);
      t.set(x, y, c);
    }
  }
}

function fillCrate(t) {
  const wood = [128, 84, 44];
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const plank = y % 5 === 0 ? 0.6 : 1;
      t.set(x, y, shade(wood, (0.86 + t.r() * 0.18) * plank));
    }
  }
  const metal = [150, 156, 166];
  for (let i = 0; i < 16; i++) {
    t.set(i, 0, shade(metal, 0.7));
    t.set(i, 15, shade(metal, 0.5));
    t.set(0, i, shade(metal, 0.7));
    t.set(15, i, shade(metal, 0.5));
  }
  for (const [x, y] of [
    [1, 1],
    [14, 1],
    [1, 14],
    [14, 14],
  ]) {
    t.set(x, y, metal);
  }
  // Yellow hazard emblem: a stubby cross.
  const y0 = [255, 200, 40];
  for (let i = 5; i <= 10; i++) {
    t.set(i, 7, y0);
    t.set(i, 8, shade(y0, 0.8));
    t.set(7, i, y0);
    t.set(8, i, shade(y0, 0.8));
  }
}

function fillGas(t, base) {
  fillSoft(t, base);
  const g = [196, 206, 70];
  for (let y = 2; y < 14; y++) {
    for (let x = 2; x < 14; x++) {
      const d = Math.hypot(x - 7.5, (y - 7.5) * 1.15);
      if (d < 5.6) t.set(x, y, shade(g, 0.75 + t.r() * 0.2 + (d < 3 ? 0.15 : 0)));
      else if (d < 6.4) t.set(x, y, shade(g, 0.4));
    }
  }
  for (let i = 0; i < 4; i++) {
    const x = 4 + ((t.r() * 7) | 0);
    const y = 4 + ((t.r() * 7) | 0);
    t.set(x, y, [240, 255, 160]);
    t.set(x + 1, y + 1, shade(g, 0.55));
  }
}

function fillSeal(t, col) {
  const metal = [44, 32, 38];
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) t.set(x, y, shade(metal, 0.8 + t.r() * 0.3));
  }
  for (let x = 0; x < TILE; x++) {
    t.set(x, 7, shade(col, 0.9));
    t.set(x, 8, shade(col, 0.6));
    if (x % 4 === 1) {
      t.set(x, 6, shade(col, 0.7));
      t.set(x, 9, shade(col, 0.5));
    }
  }
  t.set(2, 2, [120, 110, 120]);
  t.set(13, 2, [120, 110, 120]);
  t.set(2, 13, [120, 110, 120]);
  t.set(13, 13, [120, 110, 120]);
}

function fillGrass(t, dirt, grass) {
  fillSoft(t, dirt);
  for (let x = 0; x < TILE; x++) {
    const h = 3 + ((t.r() * 4) | 0);
    for (let y = 0; y < h; y++) t.set(x, y, shade(grass, 0.75 + t.r() * 0.45 - y * 0.05));
    t.set(x, h, shade(dirt, 0.6));
  }
}

function fillFloor(t, base) {
  const off = t.seed * 1.37;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const blot = valueNoise(x * 0.2 + off, y * 0.2 + off, 9);
      t.set(x, y, shade(base, 0.82 + blot * 0.3 + t.r() * 0.08));
    }
  }
  for (let i = 0; i < 3; i++) {
    const x = (t.r() * 15) | 0;
    const y = (t.r() * 15) | 0;
    t.set(x, y, shade(base, 1.5));
    t.set(x + 1, y + 1, shade(base, 0.6));
  }
}

export function buildTileArt() {
  tileAtlas = [];
  floorAtlas = [];
  STRATA.forEach((s, si) => {
    const c = s.colors;
    const byType = [];
    for (let type = 0; type <= T.GRASS; type++) {
      const vars = [];
      for (let v = 0; v < VARIANTS; v++) {
        const seed = si * 1000 + type * 37 + v * 7 + 1;
        vars.push(
          texture(seed, (t) => {
            switch (type) {
              case T.SOFT:
                return fillSoft(t, c.soft);
              case T.MED:
                return fillMed(t, c.med);
              case T.HARD:
                return fillHard(t, c.hard);
              case T.WALL:
                return fillWall(t, c.wall);
              case T.ORE1:
                fillMed(t, c.med);
                return nuggets(t, c.ore1, 3 + (v % 2), false);
              case T.ORE2:
                fillHard(t, c.hard);
                return nuggets(t, c.ore2, 2, true);
              case T.CRYSTAL:
                return fillCrystal(t, c.hard, c.crystal);
              case T.LIQUID:
                return fillLiquid(t, c.liquid, v);
              case T.CRATE:
                return fillCrate(t);
              case T.GAS:
                return fillGas(t, c.soft);
              case T.SEAL:
                return fillSeal(t, c.seal);
              case T.GRASS:
                return fillGrass(t, c.soft, c.grass || [80, 140, 60]);
              default:
                return fillFloor(t, c.floor);
            }
          })
        );
      }
      byType.push(vars);
    }
    tileAtlas.push(byType);
    const floors = [];
    for (let v = 0; v < VARIANTS; v++) floors.push(texture(si * 1000 + 900 + v, (t) => fillFloor(t, c.floor)));
    floorAtlas.push(floors);
  });

  cracks = [];
  for (let stage = 0; stage < 4; stage++) {
    const [c, ctx] = makeCanvas(TILE, TILE);
    const r = mulberry32(99 + stage);
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    const lines = 2 + stage * 2;
    for (let i = 0; i < lines; i++) {
      let x = 8;
      let y = 8;
      const a = r() * Math.PI * 2;
      const steps = 3 + stage * 2;
      for (let s = 0; s < steps; s++) {
        x += Math.cos(a + (r() - 0.5) * 1.6) * 1.4;
        y += Math.sin(a + (r() - 0.5) * 1.6) * 1.4;
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    }
    if (stage === 3) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, 0, TILE, TILE);
    }
    cracks.push(c);
  }

  lightStamp = makeRadial(128, [
    [0, 'rgba(255,255,255,1)'],
    [0.35, 'rgba(255,255,255,0.75)'],
    [0.7, 'rgba(255,255,255,0.25)'],
    [1, 'rgba(255,255,255,0)'],
  ]);

  const [cone, cctx] = makeCanvas(256, 256);
  const grad = cctx.createRadialGradient(0, 128, 0, 0, 128, 256);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  cctx.fillStyle = grad;
  cctx.beginPath();
  cctx.moveTo(0, 128);
  cctx.arc(0, 128, 256, -0.42, 0.42);
  cctx.closePath();
  cctx.fill();
  coneStamp = cone;
}

function makeRadial(size, stops) {
  const [c, ctx] = makeCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

export const tileTex = (s, type, v) => tileAtlas[s % STRATA.length][type][v];
export const floorTex = (s, v) => floorAtlas[s % STRATA.length][v];
export const crackTex = (stage) => cracks[clamp(stage, 0, 3)];
export const getLightStamp = () => lightStamp;
export const getConeStamp = () => coneStamp;

export function tileColor(s, type) {
  const c = STRATA[s % STRATA.length].colors;
  switch (type) {
    case T.SOFT:
    case T.GAS:
      return c.soft;
    case T.MED:
      return c.med;
    case T.HARD:
      return c.hard;
    case T.ORE1:
      return c.ore1;
    case T.ORE2:
      return c.ore2;
    case T.CRYSTAL:
      return c.crystal;
    case T.LIQUID:
      return c.liquid;
    case T.CRATE:
      return [128, 84, 44];
    case T.GRASS:
      return c.grass || [80, 140, 60];
    case T.SEAL:
      return c.seal;
    default:
      return c.wall;
  }
}

/** A soft radial glow in the given color, for additive ('lighter') drawing. */
export function glow(color) {
  const key = color.join(',');
  let g = glowCache.get(key);
  if (!g) {
    g = makeRadial(64, [
      [0, rgb(color, 1)],
      [0.25, rgb(color, 0.55)],
      [0.6, rgb(color, 0.15)],
      [1, rgb(color, 0)],
    ]);
    glowCache.set(key, g);
  }
  return g;
}

export function drawGlow(ctx, x, y, radius, color, alpha = 1) {
  if (alpha <= 0) return;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * Math.min(1, alpha);
  ctx.drawImage(glow(color), x - radius, y - radius, radius * 2, radius * 2);
  ctx.globalAlpha = prev;
}

export function makeVignette(w, h) {
  const [c, ctx] = makeCanvas(w, h);
  const r = Math.hypot(w, h) / 2;
  const g = ctx.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return c;
}
