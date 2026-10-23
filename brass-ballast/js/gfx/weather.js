// Weather overlays, wind & lightning (WP6, DESIGN §4.16). Screen space, drawn after the high
// clouds (§4.2). Each biome has one weather system (bg-weather.js); switching biomes crossfades
// the systems by weight. Tempest gusts drive `wind` (accel in u/s², read by world.wind);
// `strike()` draws a lightning bolt to a world point with a flash and thunder.

import { BIOMES, biomeId } from './biomes.js';
import { makeSystem } from './bg-weather.js';
import { makeBolt, drawBolt, boltRng } from './bg-lightning.js';
import { audio } from '../audio/audio.js';
import { Save } from '../core/storage.js';

const BOLT_LIFE = 0.45;

function settings() {
  try {
    return Save.settings || {};
  } catch {
    return {};
  }
}

export class Weather {
  /** @param {import('./renderer.js').Renderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    /** Current wind acceleration (u/s²). Mutated in place; safe to keep a reference. */
    this.wind = { x: 0, y: 0 };
    /** Screen flash level 0..1 (lightning). */
    this.flash = 0;
    this.intensity = 1;
    this.biome = 'brassbay';
    this.kind = 'gulls';
    this.time = 0;
    /** @type {Record<string, {sys:any, w:number, target:number}>} */
    this.systems = {};
    this.fadeRate = 0;
    this.bolts = [];
    this._cam = null;
    this._env = {
      W: 1,
      H: 1,
      t: 0,
      dx: 0,
      dy: 0,
      intensity: 1,
      q: 1,
      zoom: 1,
      dpr: 1,
      mild: false,
      host: this,
    };
    this.setBiome('brassbay', 0);
  }

  /**
   * Switch weather to a biome's kind; `fade` seconds crossfades. Unknown ids → Brassbay.
   * @param {string} id
   * @param {number} [fade]
   */
  setBiome(id, fade = 0) {
    const b = BIOMES[biomeId(id)];
    this.biome = b.id;
    this.kind = b.weather;
    if (!this.systems[this.kind]) {
      const sys = makeSystem(this.kind);
      if (sys) this.systems[this.kind] = { sys, w: 0, target: 1 };
    }
    for (const [k, s] of Object.entries(this.systems)) {
      s.target = k === this.kind ? 1 : 0;
      if (fade <= 0) s.w = s.target;
    }
    this.fadeRate = fade > 0 ? 1 / fade : 0;
  }

  /** Scale weather strength (particles, gust force, lightning frequency). 0..2, default 1. */
  setIntensity(v) {
    this.intensity = Math.max(0, Math.min(2, Number(v) || 0));
  }

  /**
   * @param {number} dt
   * @param {import('./renderer.js').Renderer} [renderer]
   * @param {any} [world]  unused today; accepted per §4.2
   */
  update(dt, renderer = this.renderer, world = null) {
    void world;
    this.time += dt;
    const env = this._env;
    const cam = renderer.camera;
    env.W = renderer.cssW;
    env.H = renderer.cssH;
    env.t = this.time;
    env.zoom = cam.zoom;
    env.dpr = renderer.dpr;
    env.intensity = this.intensity;
    const st = settings();
    env.q = st.quality === 'low' ? 0.5 : 1;
    env.mild = st.flashes === false;
    // Camera motion in screen px, so particles drift with the world. Big jumps = teleport.
    if (this._cam) {
      env.dx = (cam.x - this._cam.x) * cam.zoom;
      env.dy = (cam.y - this._cam.y) * cam.zoom;
      if (Math.abs(env.dx) > 400 || Math.abs(env.dy) > 400) env.dx = env.dy = 0;
    } else {
      this._cam = { x: 0, y: 0 };
      env.dx = env.dy = 0;
    }
    this._cam.x = cam.x;
    this._cam.y = cam.y;

    let wx = 0;
    let wy = 0;
    for (const s of Object.values(this.systems)) {
      if (s.w !== s.target) {
        const step = this.fadeRate > 0 ? this.fadeRate * dt : 1;
        s.w = s.w < s.target ? Math.min(s.target, s.w + step) : Math.max(s.target, s.w - step);
      }
      if (s.w <= 0) continue;
      try {
        s.sys.update(dt, env, s.w, this);
      } catch (err) {
        console.error('[weather] update failed', err);
        s.w = s.target = 0;
      }
      if (s.sys.windX !== undefined) {
        wx += s.sys.windX * s.w;
        wy += s.sys.windY * s.w;
      }
    }
    this.wind.x = wx * this.intensity;
    this.wind.y = wy * this.intensity;

    this.flash = Math.max(0, this.flash - dt * (env.mild ? 1.6 : 2.6));
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t += dt;
      if (b.t >= b.life) this.bolts.splice(i, 1);
    }
  }

  /** @param {CanvasRenderingContext2D} ctx */
  draw(ctx, renderer = this.renderer) {
    const env = this._env;
    renderer.applyScreen(ctx);
    ctx.globalCompositeOperation = 'source-over';
    for (const s of Object.values(this.systems)) {
      if (s.w <= 0.005) continue;
      try {
        s.sys.draw(ctx, env, s.w);
      } catch (err) {
        console.error('[weather] draw failed', err);
        s.w = s.target = 0;
      }
      renderer.applyScreen(ctx);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.bolts.length) {
      ctx.globalCompositeOperation = 'lighter';
      const p = { x: 0, y: 0 };
      for (const b of this.bolts) {
        const u = b.t / b.life;
        const base = (1 - u) ** 1.4;
        const flick = env.mild ? 0.85 : u < 0.08 ? 1 : u < 0.15 ? 0.3 : u < 0.24 ? 1 : 0.75;
        let x1 = b.sx;
        let y1 = b.sy;
        if (b.world) {
          renderer.worldToScreen(b.wx, b.wy, p);
          x1 = p.x;
          y1 = p.y;
        }
        drawBolt(ctx, b.shape, x1 + b.ox, -40, x1, y1, base * flick * b.alpha, b.color, b.width);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    if (this.flash > 0.004) {
      ctx.globalAlpha = Math.min(1, this.flash) * (env.mild ? 0.22 : 0.55);
      ctx.fillStyle = '#dde8ff';
      ctx.fillRect(0, 0, env.W, env.H);
      ctx.globalAlpha = 1;
    }
  }

  /**
   * Lightning strike: a jagged bolt from the top of the screen down to world point (x, y),
   * a screen flash (mild & strobe-free with Save.settings.flashes === false) and thunder.
   * @param {number} x  world x
   * @param {number} y  world y
   * @param {{color?:string, width?:number, flash?:number, sound?:boolean, vol?:number,
   *          branches?:number, life?:number, delay?:number}} [opts]
   */
  strike(x, y, opts = {}) {
    const bolt = this._bolt(opts);
    bolt.world = true;
    bolt.wx = x;
    bolt.wy = y;
    this.bolts.push(bolt);
    return bolt;
  }

  /** Ambient bolt to a fixed screen point (CSS px). */
  _screenBolt(sx, sy, opts = {}) {
    const bolt = this._bolt(opts);
    bolt.sx = sx;
    bolt.sy = sy;
    bolt.alpha = 0.75;
    this.bolts.push(bolt);
    return bolt;
  }

  _bolt(opts) {
    const mild = settings().flashes === false;
    const shape = makeBolt(opts.branches ?? boltRng.int(2, 4), boltRng);
    const f = opts.flash ?? 0.9;
    this.flash = Math.max(this.flash, mild ? Math.min(0.3, f) : f);
    if (opts.sound !== false) this._thunder(opts.delay ?? 0, opts.vol ?? 1);
    if (this.bolts.length > 8) this.bolts.shift();
    return {
      shape,
      t: 0,
      life: opts.life ?? BOLT_LIFE,
      world: false,
      wx: 0,
      wy: 0,
      sx: 0,
      sy: 0,
      ox: boltRng.range(-240, 240),
      color: opts.color || '#9cc4ff',
      width: opts.width ?? 1,
      alpha: 1,
    };
  }

  _thunder(delay = 0, vol = 1) {
    try {
      if (typeof audio?.play === 'function')
        audio.play('thunder', { vol, delay, pitch: boltRng.range(0.85, 1.1) });
    } catch {
      /* audio is optional */
    }
  }
}
