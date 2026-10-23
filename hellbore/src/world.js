// The diggable world: a tall grid of tiles generated chunk by chunk as the borer descends.
import {
  TILE,
  WORLD_W,
  CHUNK_H,
  T,
  TILE_INFO,
  STRATUM_LEN,
  ARENA_H,
  SEAL_H,
  STRATA,
  stratumDef,
  stratumIndexOfRow,
} from './data.js';
import { tileTex, floorTex, crackTex, VARIANTS } from './gfx.js';
import { hash2, valueNoise, fbm, clamp, makeCanvas } from './util.js';

const W = WORLD_W;
const SOLID = TILE_INFO.map((t) => t.solid);
const MAXHP = TILE_INFO.map((t) => t.hp);
const FLOW_H = 52;

export const isSolidType = (t) => SOLID[t];

// Arena geometry relative to the stratum: flat seal floor, domed ceiling.
const ARENA_RX = 19.5;
const ARENA_RY = 17;
const ARENA_CY = STRATUM_LEN - SEAL_H - 14; // local row of the ellipse center

export function arenaInfo(si) {
  const base = si * STRATUM_LEN;
  return {
    top: base + Math.floor(ARENA_CY - ARENA_RY),
    centerRow: base + ARENA_CY - 4,
    seal: base + STRATUM_LEN - SEAL_H,
    bottom: base + STRATUM_LEN,
  };
}

export class World {
  constructor(game, seed) {
    this.game = game;
    this.seed = seed;
    this.chunks = [];
    this.damaged = new Map();
    this.flow = new Int16Array(W * FLOW_H);
    this.flowOy = 0;
    this.flowReady = false;
    this.version = 0;
  }

  chunk(cy) {
    let c = this.chunks[cy];
    if (!c) {
      c = this.generate(cy);
      this.chunks[cy] = c;
      this.game?.onChunkGenerated?.(cy, c);
    }
    return c;
  }

  get(tx, ty) {
    if (tx < 0 || tx >= W) return T.WALL;
    if (ty < 0) return T.AIR;
    const c = this.chunk(ty >> 4);
    return c.tiles[(ty & 15) * W + tx];
  }

  palAt(tx, ty) {
    if (ty < 0) return 0;
    const c = this.chunk(ty >> 4);
    return c.pal[(ty & 15) * W + clamp(tx, 0, W - 1)];
  }

  isSolid(tx, ty) {
    return SOLID[this.get(tx, ty)];
  }

  solidAt(x, y) {
    return SOLID[this.get(Math.floor(x / TILE), Math.floor(y / TILE))];
  }

  typeAt(x, y) {
    return this.get(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  // ---------------------------------------------------------------- generation

  generate(cy) {
    const n = W * CHUNK_H;
    const c = {
      cy,
      tiles: new Uint8Array(n),
      hp: new Float32Array(n),
      pal: new Uint8Array(n),
      canvas: null,
      ctx: null,
    };
    for (let ly = 0; ly < CHUNK_H; ly++) {
      const ty = cy * CHUNK_H + ly;
      const si = stratumIndexOfRow(ty);
      for (let tx = 0; tx < W; tx++) {
        const i = ly * W + tx;
        const type = this.genTile(tx, ty, si);
        c.tiles[i] = type;
        c.hp[i] = MAXHP[type];
        c.pal[i] = si % STRATA.length;
      }
    }
    return c;
  }

  genTile(tx, ty, si) {
    const def = stratumDef(si);
    const seed = this.seed + si * 7919;
    const edgeL = 1 + ((valueNoise(ty * 0.17, 0, this.seed + 5) * 2.6) | 0);
    const edgeR = 1 + ((valueNoise(ty * 0.17, 9, this.seed + 6) * 2.6) | 0);
    if (tx < edgeL || tx >= W - edgeR) return T.WALL;

    const local = ty - si * STRATUM_LEN;
    if (local >= STRATUM_LEN - SEAL_H) return T.SEAL;

    if (local >= STRATUM_LEN - SEAL_H - ARENA_H) {
      const a = this.arenaTile(tx, local, si, seed);
      if (a >= 0) return a;
    }

    if (ty === 0) return T.GRASS;
    if (ty < 3) return T.SOFT;

    // Just below a broken seal, give the player a short solid lip before the caves.
    const fresh = si > 0 && local < 5;

    const n = fbm(tx * 0.085, ty * 0.11, seed, 3);
    const worm = Math.abs(fbm(tx * 0.04, ty * 0.045, seed + 99, 2) - 0.5);
    const cave = !fresh && ty > 9 && (n > def.cave || worm < 0.016);

    if (cave) {
      if (fbm(tx * 0.12, ty * 0.12, seed + 50, 2) > def.liquidChance) return T.LIQUID;
      return T.AIR;
    }

    if (hash2(tx, ty, seed + 2) < 0.0013 && ty > 12) return T.CRATE;
    if (n > def.cave - 0.05 && hash2(tx, ty, seed + 1) < 0.035) return T.CRYSTAL;
    if (ty > 14 && valueNoise(tx * 0.35, ty * 0.35, seed + 500) > def.gas && hash2(tx, ty, seed + 4) < 0.6) return T.GAS;
    if (valueNoise(tx * 0.3, ty * 0.3, seed + 400) > 0.87 && hash2(tx, ty, seed + 3) < 0.45) return T.ORE2;
    if (valueNoise(tx * 0.22, ty * 0.22, seed + 300) > 0.8) return T.ORE1;

    const h = fbm(tx * 0.07, ty * 0.07, seed + 200, 2) + (local / STRATUM_LEN) * 0.12;
    if (h < 0.45) return T.SOFT;
    if (h < 0.6) return T.MED;
    return T.HARD;
  }

  arenaTile(tx, local, si, seed) {
    const dx = (tx + 0.5 - W / 2) / ARENA_RX;
    const dy = (local + 0.5 - ARENA_CY) / ARENA_RY;
    const wob = (valueNoise(tx * 0.3, local * 0.3, seed + 77) - 0.5) * 0.25;
    const d = dx * dx + dy * dy + wob;
    if (d >= 1) {
      if (d < 1.25 && hash2(tx, local, seed + 8) < 0.12) return T.ORE2;
      return -1;
    }
    const cx = W / 2;
    const ax = tx + 0.5 - cx;
    const ay = local + 0.5 - ARENA_CY;
    const boss = stratumDef(si).boss;
    const near = (px, py, r) => (ax - px) ** 2 + (ay - py) ** 2 < r * r;
    switch (boss) {
      case 'colossus':
        for (const [px, py] of [
          [-10, -5],
          [10, -5],
          [-11, 6],
          [11, 6],
        ]) {
          if (near(px, py, 1.9)) return T.HARD;
        }
        break;
      case 'magmaw':
        for (const [px, py, r] of [
          [-10, 5, 4.2],
          [10, 5, 4.2],
          [0, 2, 3.6],
          [-14, -3, 2.6],
          [14, -3, 2.6],
        ]) {
          if (near(px, py, r)) return T.LIQUID;
        }
        break;
      case 'ossuarch':
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + 0.5;
          if (near(Math.cos(a) * 12, Math.sin(a) * 9, 1.4)) return T.MED;
        }
        break;
      case 'gatekeeper':
        if (Math.abs(ax) > 14 && ay > -2) return T.LIQUID;
        break;
      case 'heart':
        if (near(-12, 7, 3) || near(12, 7, 3)) return T.LIQUID;
        break;
      default:
        if (hash2(tx, local, seed + 13) < 0.025) return T.SOFT;
    }
    return T.AIR;
  }

  // ---------------------------------------------------------------- mutation

  set(tx, ty, type) {
    if (tx < 0 || tx >= W || ty < 0) return;
    const c = this.chunk(ty >> 4);
    const i = (ty & 15) * W + tx;
    c.tiles[i] = type;
    c.hp[i] = MAXHP[type];
    this.damaged.delete(ty * W + tx);
    this.version++;
    this.redrawAround(tx, ty);
  }

  /** Damage a tile; returns true when it broke. */
  damage(tx, ty, amount) {
    if (tx < 0 || tx >= W || ty < 0 || amount <= 0) return false;
    const c = this.chunk(ty >> 4);
    const i = (ty & 15) * W + tx;
    const type = c.tiles[i];
    if (!SOLID[type] || TILE_INFO[type].indestructible) return false;
    c.hp[i] -= amount;
    if (c.hp[i] <= 0) {
      const pal = c.pal[i];
      c.tiles[i] = T.AIR;
      c.hp[i] = 0;
      this.damaged.delete(ty * W + tx);
      this.version++;
      this.redrawAround(tx, ty);
      this.game?.onTileBroken?.(tx, ty, type, pal);
      return true;
    }
    this.damaged.set(ty * W + tx, c.hp[i] / MAXHP[type]);
    return false;
  }

  /** Damage every destructible tile in a circle. */
  blast(x, y, radius, power) {
    const r = radius + TILE;
    const x0 = Math.floor((x - r) / TILE);
    const x1 = Math.floor((x + r) / TILE);
    const y0 = Math.floor((y - r) / TILE);
    const y1 = Math.floor((y + r) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const d = Math.hypot((tx + 0.5) * TILE - x, (ty + 0.5) * TILE - y);
        if (d > radius + 6) continue;
        this.damage(tx, ty, power * (1 - (d / (radius + 6)) * 0.6));
      }
    }
  }

  /** Silently hollow out a pocket (no drops), e.g. where a creature bursts out of the rock. */
  carve(x, y, radius) {
    const x0 = Math.floor((x - radius) / TILE);
    const x1 = Math.floor((x + radius) / TILE);
    const y0 = Math.floor((y - radius) / TILE);
    const y1 = Math.floor((y + radius) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const type = this.get(tx, ty);
        if (!SOLID[type] || TILE_INFO[type].indestructible || type === T.CRATE) continue;
        if (Math.hypot((tx + 0.5) * TILE - x, (ty + 0.5) * TILE - y) > radius + 4) continue;
        this.set(tx, ty, T.AIR);
      }
    }
  }

  /** Damage tiles overlapping a small circle (used by the drill). Returns hardness touched (0 = nothing). */
  grind(x, y, radius, amount) {
    let touched = 0;
    const x0 = Math.floor((x - radius) / TILE);
    const x1 = Math.floor((x + radius) / TILE);
    const y0 = Math.floor((y - radius) / TILE);
    const y1 = Math.floor((y + radius) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const type = this.get(tx, ty);
        if (!SOLID[type]) continue;
        const cx = clamp(x, tx * TILE, tx * TILE + TILE);
        const cy = clamp(y, ty * TILE, ty * TILE + TILE);
        if ((cx - x) ** 2 + (cy - y) ** 2 > radius * radius) continue;
        touched = Math.max(touched, TILE_INFO[type].indestructible ? 99 : MAXHP[type]);
        this.damage(tx, ty, amount);
      }
    }
    return touched;
  }

  // ---------------------------------------------------------------- physics queries

  /** Push a circle entity {x, y, r} out of solid tiles. Returns true if it touched anything. */
  collide(e) {
    let hit = false;
    for (let pass = 0; pass < 2; pass++) {
      const r = e.r;
      const x0 = Math.floor((e.x - r) / TILE);
      const x1 = Math.floor((e.x + r) / TILE);
      const y0 = Math.floor((e.y - r) / TILE);
      const y1 = Math.floor((e.y + r) / TILE);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if (!SOLID[this.get(tx, ty)]) continue;
          const rx = tx * TILE;
          const ry = ty * TILE;
          const cx = clamp(e.x, rx, rx + TILE);
          const cy = clamp(e.y, ry, ry + TILE);
          const dx = e.x - cx;
          const dy = e.y - cy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r * r) continue;
          hit = true;
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2);
            e.x += (dx / d) * (r - d);
            e.y += (dy / d) * (r - d);
          } else {
            const l = e.x - rx;
            const rr = rx + TILE - e.x;
            const t = e.y - ry;
            const b = ry + TILE - e.y;
            const m = Math.min(l, rr, t, b);
            if (m === l) e.x = rx - r;
            else if (m === rr) e.x = rx + TILE + r;
            else if (m === t) e.y = ry - r;
            else e.y = ry + TILE + r;
          }
        }
      }
    }
    return hit;
  }

  los(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.ceil(d / 6);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.solidAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
    }
    return true;
  }

  /** Distance along a ray until the first solid tile, up to maxLen. */
  raycast(x, y, angle, maxLen) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    for (let d = 0; d < maxLen; d += 3) {
      if (this.solidAt(x + dx * d, y + dy * d)) return d;
    }
    return maxLen;
  }

  // ---------------------------------------------------------------- flow field (enemy pathing)

  updateFlow(px, py) {
    const ptx = clamp(Math.floor(px / TILE), 0, W - 1);
    const pty = Math.floor(py / TILE);
    const oy = pty - (FLOW_H >> 1);
    this.flowOy = oy;
    const f = this.flow;
    f.fill(-1);
    const queue = new Int32Array(W * FLOW_H);
    let qh = 0;
    let qt = 0;
    const start = (pty - oy) * W + ptx;
    f[start] = 0;
    queue[qt++] = start;
    while (qh < qt) {
      const idx = queue[qh++];
      const lx = idx % W;
      const ly = (idx / W) | 0;
      const nd = f[idx] + 1;
      for (let k = 0; k < 4; k++) {
        const nx = lx + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const ny = ly + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || nx >= W || ny < 0 || ny >= FLOW_H) continue;
        const ni = ny * W + nx;
        if (f[ni] !== -1) continue;
        if (SOLID[this.get(nx, ny + oy)]) {
          f[ni] = -2;
          continue;
        }
        f[ni] = nd;
        queue[qt++] = ni;
      }
    }
    this.flowReady = true;
  }

  flowAt(tx, ty) {
    const ly = ty - this.flowOy;
    if (!this.flowReady || tx < 0 || tx >= W || ly < 0 || ly >= FLOW_H) return -1;
    return this.flow[ly * W + tx];
  }

  /** Next waypoint toward the player for something standing at (x, y), or null when unreachable. */
  flowStep(x, y) {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    const d = this.flowAt(tx, ty);
    if (d < 0) return null;
    if (d === 0) return { x: this.game.player.x, y: this.game.player.y };
    let best = d;
    let bx = 0;
    let by = 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const v = this.flowAt(tx + ox, ty + oy);
        if (v < 0 || v >= best) continue;
        if (ox && oy && (this.flowAt(tx + ox, ty) < 0 || this.flowAt(tx, ty + oy) < 0)) continue;
        best = v;
        bx = ox;
        by = oy;
      }
    }
    if (best === d) return null;
    return { x: (tx + bx + 0.5) * TILE, y: (ty + by + 0.5) * TILE };
  }

  // ---------------------------------------------------------------- rendering

  redrawAround(tx, ty) {
    for (let y = ty - 1; y <= ty + 1; y++) {
      if (y < 0) continue;
      const c = this.chunks[y >> 4];
      if (!c || !c.canvas) continue;
      for (let x = tx - 1; x <= tx + 1; x++) {
        if (x < 0 || x >= W) continue;
        this.drawTile(c, x, y & 15);
      }
    }
  }

  renderChunk(c) {
    if (!c.canvas) [c.canvas, c.ctx] = makeCanvas(W * TILE, CHUNK_H * TILE);
    for (let ly = 0; ly < CHUNK_H; ly++) for (let lx = 0; lx < W; lx++) this.drawTile(c, lx, ly);
  }

  drawTile(c, lx, ly) {
    const ctx = c.ctx;
    const tx = lx;
    const ty = c.cy * CHUNK_H + ly;
    const i = ly * W + lx;
    const type = c.tiles[i];
    const pal = c.pal[i];
    const x = lx * TILE;
    const y = ly * TILE;
    const v = (hash2(tx, ty, 77) * VARIANTS) | 0;
    const above = SOLID[this.get(tx, ty - 1)];
    const below = SOLID[this.get(tx, ty + 1)];
    const left = SOLID[this.get(tx - 1, ty)];
    const right = SOLID[this.get(tx + 1, ty)];
    if (SOLID[type]) {
      ctx.drawImage(tileTex(pal, type, v), x, y);
      if (!below) {
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        ctx.fillRect(x, y + TILE - 4, TILE, 4);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(x, y + TILE - 1, TILE, 1);
      }
      if (!above) {
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(x, y, TILE, 1);
      }
      if (!left) {
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(x, y, 1, TILE);
      }
      if (!right) {
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(x + TILE - 1, y, 1, TILE);
      }
    } else {
      ctx.drawImage(type === T.LIQUID ? tileTex(pal, T.LIQUID, v) : floorTex(pal, v), x, y);
      if (above) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(x, y, TILE, 3);
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(x, y + 3, TILE, 3);
      }
      if (left) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(x, y, 3, TILE);
      }
      if (right) {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(x + TILE - 2, y, 2, TILE);
      }
      if (below && type !== T.LIQUID) {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(x, y + TILE - 1, TILE, 1);
      }
    }
  }

  /** Paint a decal (scorch, splat, tread) straight into the cached chunk art. */
  decal(x, y, fn) {
    const cy = Math.floor(y / (CHUNK_H * TILE));
    for (const k of [cy - 1, cy, cy + 1]) {
      const c = this.chunks[k];
      if (!c || !c.canvas) continue;
      c.ctx.save();
      c.ctx.translate(0, -k * CHUNK_H * TILE);
      fn(c.ctx);
      c.ctx.restore();
    }
  }

  draw(ctx, camX, camY, vw, vh) {
    const ch = CHUNK_H * TILE;
    const c0 = Math.max(0, Math.floor(camY / ch));
    const c1 = Math.floor((camY + vh) / ch);
    for (let k = c0; k <= c1; k++) {
      const c = this.chunk(k);
      if (!c.canvas) this.renderChunk(c);
      ctx.drawImage(c.canvas, Math.round(-camX), Math.round(k * ch - camY));
    }
    // Crack overlays on damaged tiles.
    const ty0 = Math.floor(camY / TILE) - 1;
    const ty1 = Math.floor((camY + vh) / TILE) + 1;
    for (const [key, frac] of this.damaged) {
      const ty = Math.floor(key / W);
      if (ty < ty0 || ty > ty1) continue;
      const tx = key % W;
      const stage = Math.floor((1 - frac) * 4);
      ctx.drawImage(crackTex(stage), Math.round(tx * TILE - camX), Math.round(ty * TILE - camY));
    }
  }

  /** Free cached chunk art far above the cave-in. */
  prune(aboveY) {
    const limit = Math.floor(aboveY / (CHUNK_H * TILE)) - 2;
    for (let k = 0; k < limit; k++) {
      const c = this.chunks[k];
      if (c && c.canvas) {
        c.canvas = null;
        c.ctx = null;
      }
    }
    for (const key of this.damaged.keys()) {
      if (Math.floor(key / W) * TILE < aboveY - 200) this.damaged.delete(key);
    }
  }
}
