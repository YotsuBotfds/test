// Parallax world backdrop (WP6, DESIGN §2.12, §4.16).
//
// Layers, back to front (drawBack, screen space):
//   ground tiles (parallax 0.35) → animated ground details → atmospheric haze → sun glow →
//   low-cloud shadows → low clouds (0.65) → vignette
// drawFront: high clouds (1.35), faded around the focus point.
//
// Ground tiles are 512-unit squares painted procedurally by bg-<biome>.js painters into
// offscreen canvases, kept in an LRU cache. Painters are generators that yield between phases,
// so tile work is spread over frames under a time budget; visible tiles are prioritized and
// the ring around the view is prefetched while the player flies.

import { BIOMES, BIOME_ORDER, biomeId } from './biomes.js';
import { TILE, Anchors, makeCanvas, cachedSprite, rgba } from './bg-util.js';
import { PAINTERS } from './bg-terrain.js';
import { drawAnchors } from './bg-anim.js';
import {
  drawCloudLayer,
  prewarmClouds,
  cloudSprite,
  shadowSprite,
  CLOUD_VARIANTS,
  LOW,
  HIGH,
} from './bg-clouds.js';
import { Quality } from './quality.js';

export const GROUND_PARALLAX = 0.35;
const MAX_TILES = 40;
const FALLBACK_BUDGET_MS = 10; // when visible tiles are missing
const PREFETCH_BUDGET_MS = 3.5;
const MAX_TILES_PER_FRAME = 2;
/** Visible ground still missing: extra budget per missing tile (capped), flat fill shows meanwhile. */
const FALLBACK_PER_TILE_MS = 3;
const FALLBACK_MAX_MS = 22;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Backdrop detail for the effective quality tier (gfx/quality.js): 2 = full, 1 = merged
 * haze/vignette overlay and no cloud shadows, 0 = also half-resolution tiles and sparse anims.
 */
function quality() {
  return Quality.cfg.bg;
}

const ANIM_DETAIL = [0.4, 0.7, 1];

export class Background {
  /** @param {import('./renderer.js').Renderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    this.id = 'brassbay';
    /** Current biome palette (DESIGN §4.16). */
    this.biome = BIOMES.brassbay;
    this.prevBiome = null;
    this.fadeT = 1;
    this.fadeDur = 0;
    this.hold = 0; // seconds spent waiting for new-biome tiles before a crossfade starts
    this.time = 0;
    this.frame = 0;
    this.quality = quality();
    this.res = this.quality === 0 ? 0.5 : 1;
    /** @type {Map<string, any>} LRU: insertion order = recency */
    this.tiles = new Map();
    /**
     * Ready tiles from before a resolution change, keyed like `tiles`. They stand in for their
     * key until the re-painted tile is ready, so a quality step never flashes flat ground.
     * @type {Map<string, any>}
     */
    this.stale = new Map();
    this.pool = [];
    this.job = null;
    /** Smoke drift direction (unit). */
    this.windX = 0.94;
    this.windY = -0.34;
    this.stats = { generated: 0, lastGenMs: 0, avgGenMs: 0, maxStepMs: 0, pending: 0 };
    this._map = { s: 1, ox: 0, oy: 0, W: 1, H: 1, windX: 0, windY: 0 };
    this._want = [];
    /**
     * Zoom the view is about to reach (e.g. a boss fight's zoom-out), set by the game. The
     * prefetch ring covers that wider view so the zoom-out never reveals unpainted ground.
     */
    this.zoomHint = 0;
    prewarmClouds(this.biome);
  }

  /** Blend 0..1 of the current biome over the previous one. */
  get blend() {
    if (!this.prevBiome || this.fadeDur <= 0) return 1;
    const t = Math.min(1, this.fadeT / this.fadeDur);
    return t * t * (3 - 2 * t);
  }

  /**
   * Switch biome. `fade` seconds crossfades from the current look; 0 switches instantly
   * (and synchronously paints the visible ground so there is never a blank frame).
   * Unknown ids (e.g. 'title') map to Brassbay.
   */
  setBiome(id, fade = 0) {
    const nid = biomeId(id);
    // Already there (or already fading towards it): keep going.
    if (nid === this.id) return;
    if (this.prevBiome && nid === this.prevBiome.id && fade > 0) {
      // Reversing a fade mid-way: swap ends and continue from the current mix.
      const tl = this.fadeDur > 0 ? Math.min(1, this.fadeT / this.fadeDur) : 1;
      [this.prevBiome, this.biome] = [this.biome, this.prevBiome];
      this.id = nid;
      this.fadeDur = fade;
      this.fadeT = (1 - tl) * fade;
      this.hold = 0;
      return;
    }
    // Mid-fade to a third biome: the dominant look becomes the base we fade from.
    if (!this.prevBiome || this.blend >= 0.5) this.prevBiome = this.biome;
    this.id = nid;
    this.biome = BIOMES[nid];
    this.fadeT = 0;
    this.fadeDur = Math.max(0, fade);
    this.hold = 0;
    if (this.fadeDur <= 0) {
      prewarmClouds(this.biome);
      this.prevBiome = null;
      this.fadeT = 1;
      this.pregenerate(true);
    }
  }

  /**
   * Paint the tiles around the camera for the current biome. `sync` paints the visible set
   * immediately; otherwise they are queued (with a raised budget) for the next frames.
   */
  pregenerate(sync = false) {
    const want = this._wanted(this.id, 0);
    if (!sync) return;
    for (const w of want) {
      if (!w.visible) continue;
      const tile = this._ensure(this.id, w.tx, w.ty);
      while (!tile.ready) this._step(tile);
    }
  }

  /** True when every visible tile of the current biome is painted. */
  isReady() {
    for (const w of this._wanted(this.id, 0)) {
      if (!w.visible) continue;
      const t = this.tiles.get(this._key(this.id, w.tx, w.ty));
      if (!t || !t.ready) return false;
    }
    return true;
  }

  update(dt) {
    this.time += dt;
    const q = quality();
    if (q !== this.quality) {
      this.quality = q;
      const res = q === 0 ? 0.5 : 1;
      if (res !== this.res) {
        this.res = res;
        this.purge(true);
      }
    }
    if (this.prevBiome) {
      // Hold the crossfade (briefly) until the incoming ground is painted.
      if (this.fadeT === 0 && this.hold < 1.2 && !this.isReady()) {
        this.hold += dt;
      } else {
        this.fadeT += dt;
        if (this.fadeT >= this.fadeDur) {
          this.prevBiome = null;
          this.fadeT = 1;
          this.fadeDur = 0;
        }
      }
    }
    this._schedule();
  }

  /**
   * Drop every cached tile (e.g. after a quality change). `keepStale` keeps the ready ones as
   * stand-ins (drawn scaled) until their replacements at the new resolution are painted.
   */
  purge(keepStale = false) {
    this.stale.clear();
    if (keepStale) for (const [key, t] of this.tiles) if (t.ready) this.stale.set(key, t);
    this.tiles.clear();
    this.pool.length = 0;
    this.job = null;
  }

  /** Ready tile for a key: the current one, else a pre-resolution-change stand-in. */
  _readyTile(key) {
    const t = this.tiles.get(key);
    if (t && t.ready) return t;
    return this.stale.size ? this.stale.get(key) || null : null;
  }

  // --- Tile cache --------------------------------------------------------------------------

  _key(id, tx, ty) {
    return `${id}:${tx},${ty}`;
  }

  /** Tiles wanted for biome `id`: visible ones first (by distance), then the prefetch ring. */
  _wanted(id, ring = 0.5) {
    const r = this.renderer;
    const cam = r.camera;
    const gx = cam.x * GROUND_PARALLAX;
    const gy = cam.y * GROUND_PARALLAX;
    const hw = r.cssW / 2 / cam.zoom;
    const hh = r.cssH / 2 / cam.zoom;
    // Prefetch extent: the wider of the current view and the hinted one.
    const zp = this.zoomHint > 0 && ring > 0 ? Math.min(cam.zoom, this.zoomHint) : cam.zoom;
    const pw = r.cssW / 2 / zp;
    const ph = r.cssH / 2 / zp;
    const out = this._want;
    const pool = this._wantPool || (this._wantPool = []);
    out.length = 0;
    const pad = TILE * ring;
    const tx0 = Math.floor((gx - pw - pad) / TILE);
    const tx1 = Math.floor((gx + pw + pad) / TILE);
    const ty0 = Math.floor((gy - ph - pad) / TILE);
    const ty1 = Math.floor((gy + ph + pad) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const x0 = tx * TILE;
        const y0 = ty * TILE;
        const visible = x0 < gx + hw && x0 + TILE > gx - hw && y0 < gy + hh && y0 + TILE > gy - hh;
        const d = Math.hypot(x0 + TILE / 2 - gx, y0 + TILE / 2 - gy);
        const w = pool[out.length] || (pool[out.length] = { tx: 0, ty: 0, visible: false, d: 0 });
        w.tx = tx;
        w.ty = ty;
        w.visible = visible;
        w.d = d;
        out.push(w);
      }
    }
    out.sort((a, b) => (a.visible === b.visible ? a.d - b.d : a.visible ? -1 : 1));
    if (ring > 0 && id === this.id) this._wantN = out.length;
    return out;
  }

  /** Number of ground tiles currently on screen (no allocation, no shared state). */
  _viewCount() {
    const r = this.renderer;
    const cam = r.camera;
    const gx = cam.x * GROUND_PARALLAX;
    const gy = cam.y * GROUND_PARALLAX;
    const hw = r.cssW / 2 / cam.zoom;
    const hh = r.cssH / 2 / cam.zoom;
    const nx = Math.floor((gx + hw) / TILE) - Math.floor((gx - hw) / TILE) + 1;
    const ny = Math.floor((gy + hh) / TILE) - Math.floor((gy - hh) / TILE) + 1;
    return nx * ny;
  }

  _ensure(id, tx, ty) {
    const key = this._key(id, tx, ty);
    let tile = this.tiles.get(key);
    if (tile) {
      this.tiles.delete(key);
      this.tiles.set(key, tile);
      tile.used = this.frame;
      return tile;
    }
    const px = Math.round(TILE * this.res);
    let canvas = this.pool.pop();
    if (!canvas || canvas.width !== px) canvas = makeCanvas(px, px);
    const ctx = canvas.getContext('2d');
    const X0 = tx * TILE;
    const Y0 = ty * TILE;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = BIOMES[id].ground;
    ctx.fillRect(0, 0, px, px);
    ctx.setTransform(this.res, 0, 0, this.res, -X0 * this.res, -Y0 * this.res);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const anchors = new Anchors(X0, Y0);
    const painter = PAINTERS[id] || PAINTERS.brassbay;
    tile = {
      key,
      id,
      tx,
      ty,
      canvas,
      ctx,
      anchors,
      list: null,
      ready: false,
      used: this.frame,
      gen: painter.paint(ctx, X0, Y0, anchors),
      ms: 0,
    };
    this.tiles.set(key, tile);
    this._evict();
    return tile;
  }

  /** Run one phase of a tile's painter. */
  _step(tile) {
    const t0 = now();
    let done = true;
    try {
      done = tile.gen.next().done;
    } catch (err) {
      console.error(`[background] tile ${tile.key} failed`, err);
      done = true;
    }
    const dtm = now() - t0;
    tile.ms += dtm;
    if (dtm > this.stats.maxStepMs) this.stats.maxStepMs = dtm;
    if (done) {
      tile.ready = true;
      this.stale.delete(tile.key);
      tile.list = tile.anchors.finish();
      tile.gen = null;
      tile.anchors = null;
      tile.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.stats.generated++;
      this.stats.lastGenMs = tile.ms;
      this.stats.avgGenMs +=
        (tile.ms - this.stats.avgGenMs) * (this.stats.generated === 1 ? 1 : 0.1);
    }
    return done;
  }

  _evict() {
    // Zoomed far out (e.g. a boss intro) more tiles are on screen: grow the cap so the
    // prefetch ring doesn't thrash, but never below the ~40-tile budget.
    const view = this._viewCount();
    const cap = Math.max(MAX_TILES, view * (this.prevBiome ? 2 : 1) + 12, (this._wantN || 0) + 8);
    if (this.tiles.size <= cap) return;
    for (const [key, t] of this.tiles) {
      if (this.tiles.size <= cap) break;
      if (t.used >= this.frame - 1) continue; // in use right now
      this.tiles.delete(key);
      if (this.job === t) this.job = null;
      if (this.pool.length < 4) this.pool.push(t.canvas);
    }
  }

  /** Spend this frame's tile budget: visible tiles of both fading biomes, then prefetch. */
  _schedule() {
    const ids = this.prevBiome ? [this.id, this.prevBiome.id] : [this.id];
    let budget = PREFETCH_BUDGET_MS;
    let target = null;
    let pending = 0;
    let missing = 0;
    for (const id of ids) {
      for (const w of this._wanted(id, id === this.id ? 0.55 : 0)) {
        const t = this.tiles.get(this._key(id, w.tx, w.ty));
        if (t && t.ready) {
          t.used = this.frame;
          continue;
        }
        pending++;
        if (w.visible) missing++;
        if (!target) target = { id, w };
      }
    }
    // Visible holes (flat fill) cost more the more of them there are: a sudden zoom-out shows
    // several at once, so the budget grows with their count to close them within a few frames.
    if (missing) budget = Math.min(FALLBACK_MAX_MS, FALLBACK_BUDGET_MS + FALLBACK_PER_TILE_MS * (missing - 1));
    if (this.prevBiome && this.fadeT === 0) budget = Math.max(budget, FALLBACK_BUDGET_MS);
    this.stats.pending = pending;
    // Everything wanted is painted at the current resolution: stand-ins are no longer needed.
    if (!pending && this.stale.size) this.stale.clear();
    if (!target) {
      // Idle: pre-render cloud sprites for every biome, one per frame, so a later biome
      // switch never stalls on them.
      if (this._cloudQueue === undefined) {
        this._cloudQueue = [];
        for (const id of BIOME_ORDER)
          for (let v = 0; v < CLOUD_VARIANTS; v++) this._cloudQueue.push([id, v]);
      }
      const job = this._cloudQueue.pop();
      if (job) {
        cloudSprite(BIOMES[job[0]], job[1]);
        shadowSprite(job[1]);
      }
      return;
    }
    const t0 = now();
    let finished = 0;
    const maxTiles = missing > 2 ? MAX_TILES_PER_FRAME + 1 : MAX_TILES_PER_FRAME;
    while (now() - t0 < budget && finished < maxTiles) {
      if (!this.job || this.job.ready || !this.tiles.has(this.job.key)) {
        const next = this._nextJob(ids);
        if (!next) break;
        this.job = next;
      }
      if (this._step(this.job)) finished++;
    }
  }

  _nextJob(ids) {
    for (const id of ids) {
      for (const w of this._wanted(id, id === this.id ? 0.55 : 0)) {
        const key = this._key(id, w.tx, w.ty);
        const t = this.tiles.get(key);
        if (t && t.ready) continue;
        return t || this._ensure(id, w.tx, w.ty);
      }
    }
    return null;
  }

  // --- Drawing -------------------------------------------------------------------------------

  /** Screen-space backdrop behind the world (DESIGN §4.2). */
  drawBack(ctx, renderer = this.renderer) {
    this.frame++;
    const W = renderer.canvas.width;
    const H = renderer.canvas.height;
    const cam = renderer.camera;
    const dpr = renderer.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const a = this.blend;
    const prev = this.prevBiome;

    // First frame for a biome: paint synchronously so we never flash an empty ground.
    if (!this._warm) {
      this._warm = true;
      this.pregenerate(true);
    }

    if (prev) this._drawGround(ctx, renderer, prev.id, 1);
    this._drawGround(ctx, renderer, this.id, prev ? a : 1);

    const detail = ANIM_DETAIL[this.quality] ?? 1;
    const full = this.quality >= 2;
    if (prev) this._drawAnims(ctx, renderer, prev.id, 1 - a, detail);
    this._drawAnims(ctx, renderer, this.id, prev ? a : 1, detail);

    if (full) {
      if (prev) this._drawAtmosphere(ctx, W, H, prev, 1 - a);
      this._drawAtmosphere(ctx, W, H, this.biome, prev ? a : 1);
    } else if (this.quality === 1) {
      // Medium: keep the sun glow; haze is folded into the single overlay pass below.
      if (prev) this._drawSun(ctx, W, H, prev, 1 - a);
      this._drawSun(ctx, W, H, this.biome, prev ? a : 1);
    }

    const clouds = (b, alpha, mode) =>
      drawCloudLayer(ctx, {
        biome: b,
        layer: LOW,
        cam,
        W,
        H,
        dpr,
        t: this.time,
        mode,
        alpha: alpha * b.clouds.lowAlpha,
        coverage: b.clouds.low,
        shadowAlpha: b.clouds.shadow,
        isles: b.clouds.isles || 0,
      });
    if (full) {
      if (prev) clouds(prev, 1 - a, 'shadow');
      clouds(this.biome, prev ? a : 1, 'shadow');
    }
    if (prev) clouds(prev, 1 - a, 'cloud');
    clouds(this.biome, prev ? a : 1, 'cloud');

    if (full) {
      if (prev) this._drawVignette(ctx, W, H, prev, 1 - a);
      this._drawVignette(ctx, W, H, this.biome, prev ? a : 1);
    } else {
      // Cheaper paths: haze + vignette baked into one low-res overlay = one full-screen pass.
      if (prev) this._drawOverlay(ctx, W, H, prev, 1 - a);
      this._drawOverlay(ctx, W, H, this.biome, prev ? a : 1);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    renderer.applyScreen(ctx);
  }

  /**
   * High clouds above the action. `focus` = screen point (CSS px) to keep clear, or null.
   * @param {{x:number,y:number}|null} [focus]
   */
  drawFront(ctx, renderer = this.renderer, focus = null) {
    const W = renderer.canvas.width;
    const H = renderer.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    const a = this.blend;
    const draw = (b, alpha) =>
      drawCloudLayer(ctx, {
        biome: b,
        layer: HIGH,
        cam: renderer.camera,
        W,
        H,
        dpr: renderer.dpr,
        t: this.time,
        alpha: alpha * b.clouds.highAlpha,
        coverage: b.clouds.high,
        focus,
      });
    if (this.prevBiome) draw(this.prevBiome, 1 - a);
    draw(this.biome, this.prevBiome ? a : 1);
    ctx.globalAlpha = 1;
    renderer.applyScreen(ctx);
  }

  _groundMap(renderer) {
    const cam = renderer.camera;
    const dpr = renderer.dpr;
    const s = cam.zoom * dpr;
    const m = this._map;
    m.s = s;
    m.W = renderer.canvas.width;
    m.H = renderer.canvas.height;
    m.ox = m.W / 2 + cam.shakeX * dpr * GROUND_PARALLAX - cam.x * GROUND_PARALLAX * s;
    m.oy = m.H / 2 + cam.shakeY * dpr * GROUND_PARALLAX - cam.y * GROUND_PARALLAX * s;
    m.windX = this.windX;
    m.windY = this.windY;
    return m;
  }

  _drawGround(ctx, renderer, id, alpha) {
    if (alpha <= 0.002) return;
    const m = this._groundMap(renderer);
    const s = m.s;
    const tx0 = Math.floor(-m.ox / s / TILE);
    const tx1 = Math.floor((m.W - m.ox) / s / TILE);
    const ty0 = Math.floor(-m.oy / s / TILE);
    const ty1 = Math.floor((m.H - m.oy) / s / TILE);
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    const fallback = BIOMES[id].ground;
    const ov = alpha >= 1 ? 1 : 0;
    for (let ty = ty0; ty <= ty1; ty++) {
      const y0 = Math.floor(ty * TILE * s + m.oy);
      const y1 = Math.floor((ty + 1) * TILE * s + m.oy);
      for (let tx = tx0; tx <= tx1; tx++) {
        const x0 = Math.floor(tx * TILE * s + m.ox);
        const x1 = Math.floor((tx + 1) * TILE * s + m.ox);
        const key = this._key(id, tx, ty);
        const tile = this._readyTile(key);
        // Integer rects that share edges exactly; when opaque, a 1 px overlap also hides any
        // resampling seam (skipped while fading — overlapping translucent tiles would show).
        if (tile && tile.ready) {
          tile.used = this.frame;
          ctx.drawImage(tile.canvas, x0, y0, x1 - x0 + ov, y1 - y0 + ov);
        } else {
          ctx.fillStyle = fallback;
          ctx.fillRect(x0, y0, x1 - x0 + ov, y1 - y0 + ov);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  _drawAnims(ctx, renderer, id, alpha, detail) {
    if (alpha <= 0.01) return;
    const m = this._groundMap(renderer);
    const s = m.s;
    const tx0 = Math.floor((-m.ox - 140 * s) / s / TILE);
    const tx1 = Math.floor((m.W - m.ox + 140 * s) / s / TILE);
    const ty0 = Math.floor((-m.oy - 140 * s) / s / TILE);
    const ty1 = Math.floor((m.H - m.oy + 140 * s) / s / TILE);
    for (const pass of ['add', 'normal']) {
      ctx.globalCompositeOperation = pass === 'add' ? 'lighter' : 'source-over';
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          const tile = this._readyTile(this._key(id, tx, ty));
          if (!tile || !tile.list.length) continue;
          drawAnchors(ctx, tile.list, this.time, m, pass, alpha, detail);
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  /** Haze between ground and clouds (depth), plus the biome's light source glow. */
  _drawAtmosphere(ctx, W, H, b, alpha) {
    if (alpha <= 0.01) return;
    const g = ctx.createLinearGradient(0, 0, W * 0.25, H);
    g.addColorStop(0, rgba(b.sky[0], b.haze * 1.15));
    g.addColorStop(1, rgba(b.sky[1], b.haze * 0.8));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (b.sun) {
      const sx = b.sun.x * W;
      const sy = b.sun.y * H;
      const R = Math.max(W, H) * 0.95;
      const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, R);
      sg.addColorStop(0, rgba(b.sun.color, b.sun.alpha));
      sg.addColorStop(0.4, rgba(b.sun.color, b.sun.alpha * 0.35));
      sg.addColorStop(1, rgba(b.sun.color, 0));
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  /** Sun glow alone (medium tier). */
  _drawSun(ctx, W, H, b, alpha) {
    if (alpha <= 0.01 || !b.sun) return;
    const sx = b.sun.x * W;
    const sy = b.sun.y * H;
    const R = Math.max(W, H) * 0.95;
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, R);
    sg.addColorStop(0, rgba(b.sun.color, b.sun.alpha));
    sg.addColorStop(0.4, rgba(b.sun.color, b.sun.alpha * 0.35));
    sg.addColorStop(1, rgba(b.sun.color, 0));
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  /** Haze gradient + vignette pre-composited into one small canvas, stretched over the screen. */
  _drawOverlay(ctx, W, H, b, alpha) {
    if (alpha <= 0.01) return;
    const ow = Math.max(32, Math.min(320, Math.round(W / 4)));
    const oh = Math.max(18, Math.round((ow * H) / W));
    const [color, strength] = b.vignette;
    const img = cachedSprite(`ovl|${b.id}|${ow}x${oh}`, ow, oh, (c) => {
      const g = c.createLinearGradient(0, 0, ow * 0.25, oh);
      g.addColorStop(0, rgba(b.sky[0], b.haze * 1.15));
      g.addColorStop(1, rgba(b.sky[1], b.haze * 0.8));
      c.fillStyle = g;
      c.fillRect(0, 0, ow, oh);
      const R = Math.max(ow, oh) * 0.71;
      const v = c.createRadialGradient(ow / 2, oh / 2, R * 0.33, ow / 2, oh / 2, R);
      v.addColorStop(0, rgba(color, 0));
      v.addColorStop(0.55, rgba(color, 0.35 * strength));
      v.addColorStop(1, rgba(color, strength));
      c.fillStyle = v;
      c.fillRect(0, 0, ow, oh);
    });
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  _drawVignette(ctx, W, H, b, alpha) {
    if (alpha <= 0.01) return;
    const [color, strength] = b.vignette;
    const img = cachedSprite(`vig|${color}`, 256, 256, (c) => {
      const g = c.createRadialGradient(128, 128, 60, 128, 128, 182);
      g.addColorStop(0, rgba(color, 0));
      g.addColorStop(0.55, rgba(color, 0.35));
      g.addColorStop(1, rgba(color, 1));
      c.fillStyle = g;
      c.fillRect(0, 0, 256, 256);
    });
    ctx.globalAlpha = alpha * strength;
    ctx.drawImage(img, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}
