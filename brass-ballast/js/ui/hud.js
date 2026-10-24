// Canvas HUD (WP22, DESIGN §4.11): brass gauges, score odometer & combo ring, stage plaque,
// Aether bar, loadout sockets, boss bars, radar, off-screen pointers, announcements, FPS and the
// co-op mini panels. Screen space, scaled by uiScale and safe-area aware.
//
// Parts live in hud-kit.js (cache, painters, sparks), hud-player.js (hull/steam/bombs/cogs,
// loadout, XP, mini panels), hud-top.js (score, plaque, FPS, reticle), hud-boss.js (boss bars,
// pointers, radar) and hud-banner.js (announcements). Static brass is pre-rendered to cached
// canvases that rebuild on resize / DPR / scale change; the per-frame budget is well under 1 ms.

import { events } from '../core/events.js';
import { Save } from '../core/storage.js';
import { MODES } from '../content/modes.js';
import {
  clamp,
  approach,
  LayerCache,
  SafeArea,
  HudSparks,
  groupDigits,
  glowDot,
  textLayer,
  TAU,
} from './hud-kit.js';
import {
  PANEL,
  SLOT,
  MINI,
  makePlayerView,
  updatePlayerView,
  drawPlayerPanel,
  drawLoadout,
  drawXpBar,
  drawMiniPanel,
} from './hud-player.js';
import { SCORE, PLAQUE, drawScore, drawPlaque, plaqueInfo, drawFps, drawReticle } from './hud-top.js';
import {
  RADAR_R,
  makeBossView,
  updateBossView,
  bossPhaseMark,
  drawBossBar,
  drawPointers,
  drawRadar,
} from './hud-boss.js';
import { bannerVariant, drawBanner, updateBanner } from './hud-banner.js';

const LOADOUT_W = SLOT + 12 + 4 * (SLOT + 6) - 6;
const XP_H = 16;
const MAX_POINTERS = 10;
const EMPTY = Object.freeze([]);

export class HUD {
  /** @param {*} game */
  constructor(game) {
    this.game = game;
    this.cache = new LayerCache();
    this.tcache = new LayerCache(240); // text layers (values churn; kept apart from brass)
    this.safe = new SafeArea();
    this.sparks = new HudSparks(140);
    this.s = 1;
    this.dpr = 1;
    this.t = 0;
    this.W = 0;
    this.H = 0;
    this.L = null; // layout
    this._layoutKey = '';
    this._safeT = 0;
    this.pv = [];
    this.bossViews = new Map();
    this.banners = [];
    this.banner = null;
    this.perf = { ms: 0 };
    this._strs = new Map();
    this._plaque = { top: '', main: '', segs: 1, done: 0, frac: 0, bossNext: false };
    this._pt = { x: 0, y: 0 };
    this._vr = {};
    this._ptrs = [];
    this._ptrPool = [];
    this._elites = [];
    this.bossLabel = 'BOSS FIGHT';
    this.bannerY = 0;
    this.modeName = '';
    this.reducedFlash = false;
    this._cursorHidden = false;
    this._run = null;
    this.run = this._freshRunState(null);
    this.xp = { shown: 1, flashT: 0, popT: 0, spin: 0, spinV: 0 };
    this._subscribe();
    try {
      window.addEventListener('resize', () => {
        this._safeT = 0;
      });
      window.addEventListener('orientationchange', () => {
        this._safeT = 0;
      });
    } catch {
      /* no window */
    }
  }

  // ---- public API (DESIGN §4.11) --------------------------------------------------------------

  /**
   * Queue an announcement banner.
   * @param {string} title
   * @param {string} [sub]
   * @param {{kind?:'wave'|'boss'|'stage'|'warning'|'clear', time?:number}} [opts]
   */
  announce(title, sub = '', opts = {}) {
    const kind = opts.kind || 'wave';
    const b = {
      title: String(title ?? ''),
      sub: String(sub ?? ''),
      kind,
      variant: bannerVariant(title, kind),
      time: Math.max(1, +opts.time || 2.5),
      t: 0,
    };
    const cur = this.banners[0];
    // Hurry the current banner off so the new one isn't late (phase alerts never pre-empt a
    // full-screen warning/boss card though — they wait their turn).
    if (cur && cur.t < cur.time - 0.4) {
      const big = cur.variant === 'warning' || cur.variant === 'boss';
      if (!(big && b.variant === 'alert')) cur.time = Math.max(cur.t + 0.4, Math.min(cur.time, cur.t + 0.4));
    }
    this.banners.push(b);
    if (this.banners.length > 4) this.banners.splice(1, 1);
    this.banner = this.banners[0];
  }

  /** True while an announcement banner is up (ui.js holds plain toasts so they don't cover it). */
  get bannerActive() {
    return this.banners.length > 0;
  }

  /** @param {number} dt real seconds */
  update(dt) {
    const g = this.game;
    this.t += dt;
    // Banners & sparks hold while the sim is halted by a menu (pause, level-up/refit cards).
    const paused = g.state === 'paused' || g.state === 'levelup' || g.state === 'refit';
    if (this._cursorHidden && g.state !== 'playing') this._setCursor(false, g.renderer);
    if (g.run !== this._run) this._resetRun(false);
    const run = g.run;
    const world = g.world;
    if (!run || !world) return;
    this.reducedFlash = Save.settings?.flashes === false;
    this.modeName = MODES[run.mode]?.name || '';

    // banners advance in real time except while a menu halts the sim
    if (!paused && this.banners.length) {
      const b = this.banners[0];
      b.t += dt;
      updateBanner(this, b, dt);
      if (b.t >= b.time) this.banners.shift();
      this.banner = this.banners[0] || null;
    }
    this.sparks.update(paused ? 0 : dt);

    // players
    const players = world.players || EMPTY;
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      let v = this.pv[i];
      if (!v || v.player !== p) {
        v = this.pv[i] = makePlayerView(p);
        v.player = p;
      }
      updatePlayerView(v, p, dt, this);
    }
    this.pv.length = players.length;

    // score / combo / cogs
    const R = this.run;
    const diff = run.score - R.score;
    if (diff < 0 || diff < 0.5) R.score = run.score;
    else R.score = Math.min(run.score, approach(R.score, run.score, 7, dt) + dt * 20);
    if (run.score > R.lastScore) R.scorePopT = Math.min(1, R.scorePopT + 0.35);
    R.lastScore = run.score;
    R.scorePopT = Math.max(0, R.scorePopT - dt * 3);
    if (run.chain > R.chainPrev) {
      R.flareT = 1;
      R.breakT = 0;
    } else if (run.chain === 0 && R.chainPrev >= 3) {
      R.breakT = 1;
      R.breakText = `×${R.comboShown.toFixed(1)}`;
    }
    R.chainPrev = run.chain;
    if (run.chain > 0) R.chainShown = run.chain;
    R.comboShown = run.chain > 0 ? approach(R.comboShown, run.combo, 14, dt) : R.comboShown;
    R.comboVis = approach(R.comboVis, run.chain > 0 ? 1 : 0, run.chain > 0 ? 14 : 5, dt);
    R.flareT = Math.max(0, R.flareT - dt * 3.2);
    R.bigFlareT = Math.max(0, R.bigFlareT - dt * 1.8);
    R.breakT = Math.max(0, R.breakT - dt * 1.6);
    if (run.cogs > R.cogsPrev) {
      R.cogPopT = 1;
      R.cogSpinV = Math.min(30, R.cogSpinV + 9);
    }
    R.cogsPrev = run.cogs;
    R.cogPopT = Math.max(0, R.cogPopT - dt * 3.5);
    R.cogSpin = (R.cogSpin + R.cogSpinV * dt) % TAU;
    R.cogSpinV *= Math.exp(-3 * dt);

    // aether: continuous "level + fraction" so the fill rolls over on level-up
    const X = this.xp;
    const target = run.level + clamp(run.xp / Math.max(1, run.xpNext), 0, 0.999);
    if (target < X.shown - 0.5 || target > X.shown + 2.5) X.shown = target; // new run / debug jump
    else {
      const before = Math.floor(X.shown);
      X.shown = Math.min(target, X.shown + Math.max((target - X.shown) * Math.min(1, dt * 6), dt * 0.15));
      if (Math.floor(X.shown) > before) this._levelFlash();
    }
    X.flashT = Math.max(0, X.flashT - dt * 1.4);
    X.popT = Math.max(0, X.popT - dt * 2);
    X.spin += X.spinV * dt;
    X.spinV *= Math.exp(-2.5 * dt);

    // bosses (views linger briefly after death for the "DESTROYED" fade)
    const bosses = world.bosses || EMPTY;
    for (const b of bosses) {
      if (b && !this.bossViews.has(b)) this.bossViews.set(b, makeBossView(b));
    }
    for (const [b, v] of this.bossViews) {
      updateBossView(v, dt);
      const gone = !bosses.includes(b) || !b.alive;
      if (gone && v.deadT <= 0) v.deadT = 0.0001;
      if (v.deadT > 1.5) this.bossViews.delete(b);
    }
  }

  /** @param {CanvasRenderingContext2D} ctx @param {*} renderer */
  draw(ctx, renderer) {
    const t0 = performance.now();
    const g = this.game;
    const run = g.run;
    const world = g.world;
    if (!run || !world) return;
    this._layout(renderer);
    const L = this.L;
    const s = this.s;
    ctx.save();
    renderer.applyScreen(ctx);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    this._sharedLayers();
    const players = world.players || EMPTY;
    const p0 = players[0];
    const focus = p0 || renderer.camera;

    // off-screen pointers sit underneath the instruments
    this._collectPointers(world, focus);
    if (this._ptrs.length) {
      let rect = L.ptrRect;
      if (this.bossViews.size) {
        // keep pointers clear of the boss bars
        const r2 = this._ptrRect2 || (this._ptrRect2 = { x0: 0, y0: 0, x1: 0, y1: 0 });
        r2.x0 = rect.x0;
        r2.x1 = rect.x1;
        r2.y1 = rect.y1;
        const bb = L.boss.y + (64 + (this.bossViews.size - 1) * 48) * s;
        r2.y0 = Math.min(Math.max(rect.y0, bb), this.H * 0.45);
        rect = r2;
      }
      drawPointers(this, ctx, this._ptrs, rect, renderer);
    }

    // boss bars
    let bossBottom = 0;
    if (this.bossViews.size) {
      let y = L.boss.y;
      let first = true;
      for (const v of this.bossViews.values()) {
        const w = first ? L.boss.w : L.boss.w * 0.72;
        const h = drawBossBar(this, ctx, v, L.boss.x, y, w, !first);
        y += (h + 6) * s;
        first = false;
      }
      bossBottom = y;
    }
    this._bossBottom = bossBottom;

    drawPlaque(this, ctx, g, run, L.plaque.x, L.plaque.y);
    if (p0) {
      const v = this.pv[0];
      if (v) {
        drawPlayerPanel(this, ctx, p0, v, run, L.panel.x, L.panel.y);
        drawLoadout(this, ctx, p0, v, L.loadout.x, L.loadout.y);
      }
    }
    drawXpBar(this, ctx, run, L.xp.x, L.xp.y, L.xp.w);
    drawScore(this, ctx, run, L.score.x, L.score.y);
    drawRadar(this, ctx, world, renderer, focus, L.radar.x, L.radar.y);
    for (let i = 1; i < players.length; i++) {
      const v = this.pv[i];
      if (!v) continue;
      const slot = L.mini[i - 1];
      if (slot) drawMiniPanel(this, ctx, players[i], v, slot.x, slot.y);
    }
    if (Save.settings?.showFps) drawFps(this, ctx, g, L.fps.x, L.fps.y);

    // announcements (held, and hidden, while card picks are up: they'd show through the cards)
    const b = g.state === 'levelup' || g.state === 'refit' ? null : this.banners[0];
    if (b) {
      let y = L.bannerY;
      // Phase alerts dock right under the boss bar: mid-screen they covered the boss itself
      // (the camera frames it there) during its phase change.
      if (bossBottom && b.variant === 'alert') y = bossBottom + 36 * s;
      else if (bossBottom && b.variant !== 'warning') y = Math.max(y, bossBottom + 60 * s);
      y = Math.min(y, this.H * 0.55);
      this.bannerY = y;
      drawBanner(this, ctx, b, this.W, this.H, y);
    }

    // sparks (CSS px space)
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.sparks.draw(ctx, this.dot, this.puff);

    this._reticle(ctx, renderer, p0);
    ctx.restore();
    const ms = performance.now() - t0;
    this.perf.ms = this.perf.ms * 0.95 + ms * 0.05;
  }

  /**
   * Screen space the instruments cover (CSS px from the top / bottom edge), for the camera's
   * boss framing so the ship isn't parked under the boss bar. Null before the first layout.
   */
  safeInsets() {
    const L = this.L;
    if (!L) return null;
    const ins = this._ins || (this._ins = { top: 0, bottom: 0 });
    ins.top = Math.max(L.topBand || 0, this._bossBottom || 0);
    ins.bottom = Math.max(0, this.H - (L.bottomBand ?? this.H));
    return ins;
  }

  // ---- helpers used by the parts ------------------------------------------------------------

  /** Set the UI transform: origin at CSS (x, y), 1 unit = uiScale·k CSS px. */
  at(ctx, x, y, k = 1) {
    const z = this.dpr * this.s * k;
    ctx.setTransform(z, 0, 0, z, x * this.dpr, y * this.dpr);
  }

  /** Cached value → string (avoids per-frame string churn). */
  str(key, value, group = false) {
    let e = this._strs.get(key);
    if (!e) this._strs.set(key, (e = { v: undefined, s: '' }));
    if (e.v !== value) {
      e.v = value;
      e.s = group ? groupDigits(value) : String(value);
    }
    return e.s;
  }

  /** Cached engraved text layer (see hud-kit textLayer). */
  txt(text, opts) {
    return textLayer(this.tcache, text, opts);
  }

  plaqueInfo(run, st) {
    return plaqueInfo(this, this.game, run, st);
  }

  onBoostPuff(p) {
    if (p.index !== 0 || !this.L) return;
    const s = this.s;
    const x = this.L.panel.x + PANEL.dialX * s;
    const y = this.L.panel.y + (PANEL.dialY + PANEL.dialR) * s;
    for (let i = 0; i < 6; i++) {
      this.sparks.spawn({
        x: x + (Math.random() - 0.5) * 20 * s,
        y,
        vx: (Math.random() - 0.5) * 60,
        vy: 30 + Math.random() * 40,
        life: 0.7 + Math.random() * 0.4,
        size: (9 + Math.random() * 6) * s,
        kind: 'puff',
        drag: 2,
        grav: -30,
      });
    }
  }

  // ---- internals ----------------------------------------------------------------------------

  _freshRunState(run) {
    return {
      score: run?.score || 0,
      lastScore: run?.score || 0,
      scorePopT: 0,
      comboShown: run?.combo || 1,
      comboVis: 0,
      chainPrev: run?.chain || 0,
      chainShown: run?.chain || 0,
      flareT: 0,
      bigFlareT: 0,
      breakT: 0,
      breakText: '',
      cogsPrev: run?.cogs || 0,
      cogPopT: 0,
      cogSpin: 0,
      cogSpinV: 0,
    };
  }

  _resetRun(clearBanners) {
    const run = this.game.run;
    this._run = run;
    this.run = this._freshRunState(run);
    this.pv.length = 0;
    this.bossViews.clear();
    this.xp.shown = run ? run.level + clamp(run.xp / Math.max(1, run.xpNext), 0, 0.999) : 1;
    this.xp.flashT = this.xp.popT = 0;
    if (clearBanners) {
      this.banners.length = 0;
      this.banner = null;
    }
  }

  _subscribe() {
    const on = (name, fn) => {
      try {
        events.on(name, (d) => {
          try {
            fn(d || {});
          } catch (err) {
            if (!this._evErr) console.error('[hud] event handler failed', name, err);
            this._evErr = true;
          }
        });
      } catch {
        /* events unavailable */
      }
    };
    on('run:start', () => this._resetRun(true));
    on('player:hit', (d) => {
      const v = this.pv[d.player?.index ?? 0];
      if (v) v.hitT = 1;
    });
    on('combo', () => {
      const R = this.run;
      R.bigFlareT = 1;
      if (this.L) {
        const x = this.L.score.x - 22 * this.s;
        const y = this.L.score.y + (SCORE.h + 22) * this.s;
        this.sparks.burst(x, y, 18, '#ffcf4a', 260, { grav: 260, size: 2.8 * this.s });
      }
    });
    on('boss:phase', (d) => {
      const v = this.bossViews.get(d.boss);
      if (v) bossPhaseMark(v);
    });
  }

  _levelFlash() {
    const X = this.xp;
    X.flashT = 1;
    X.popT = 1;
    X.spinV = 14;
    if (!this.L) return;
    const s = this.s;
    const { x, y, w } = this.L.xp;
    for (let i = 0; i < 26; i++) {
      const px = x + (22 + Math.random() * (w - 22)) * s;
      this.sparks.spawn({
        x: px,
        y: y + XP_H * 0.5 * s,
        vx: (Math.random() - 0.5) * 60,
        vy: -60 - Math.random() * 160,
        life: 0.6 + Math.random() * 0.5,
        size: (2 + Math.random() * 2) * s,
        color: Math.random() < 0.5 ? '#7ff3ff' : '#e8ffff',
        grav: 140,
        drag: 1.5,
      });
    }
    this.sparks.burst(x + 21 * s, y + 8 * s, 16, '#b8fff6', 220, { grav: 120, size: 3 * s });
  }

  _sharedLayers() {
    const c = this.cache;
    this.dot = c.get('dot', 16, 16, (x) => glowDot(x, 8, 8, 8, 'rgba(255,236,170,1)'));
    this.dotGold = c.get('dotGold', 32, 32, (x) => glowDot(x, 16, 16, 16, 'rgba(255,200,80,0.9)'));
    this.dotAether = c.get('dotAether', 32, 32, (x) => glowDot(x, 16, 16, 16, 'rgba(127,243,255,0.95)'));
    this.dotRed = c.get('dotRed', 32, 32, (x) => glowDot(x, 16, 16, 16, 'rgba(255,60,30,0.9)'));
    this.puff = c.get('puff', 32, 32, (x) => glowDot(x, 16, 16, 16, 'rgba(244,241,234,0.95)'));
    this.shimmer = c.get('shimmer', 60, 20, (x) => {
      const gr = x.createLinearGradient(0, 0, 60, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.5, 'rgba(255,255,255,0.85)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr;
      x.fillRect(0, 0, 60, 20);
    });
  }

  /** Recompute positions when the screen, scale, device or player count changes. */
  _layout(r) {
    this._safeT -= 1;
    if (this._safeT <= 0) {
      this.safe.read();
      this._safeT = 120;
    }
    const W = r.cssW;
    const H = r.cssH;
    const dpr = r.dpr;
    const touch = this.game.input?.lastDevice === 'touch';
    const np = this.game.world?.players?.length || 1;
    const sa = this.safe;
    const key = `${W}|${H}|${dpr}|${touch}|${np}|${sa.l}|${sa.r}|${sa.t}|${sa.b}`;
    if (key === this._layoutKey && this.L) return;
    this._layoutKey = key;
    this.W = W;
    this.H = H;
    this.dpr = dpr;
    const s = clamp(Math.min(W, H) / 720, 0.7, 1.35);
    this.s = s;
    this.cache.setPx(s * dpr);
    this.tcache.setPx(s * dpr);
    const m = 10 * s;
    const gap = 12 * s;
    const left = sa.l + (touch ? Math.max(66, m) : m);
    const top = sa.t + m;
    const right = W - sa.r - m;
    const bottom = H - sa.b - m;
    const panelW = PANEL.w * s;
    const panelH = PANEL.h * s;
    const radarD = RADAR_R * 2 * s;
    const scoreW = SCORE.w * s;
    const plaqueW = PLAQUE.w * s;
    const plaqueH = PLAQUE.h * s;
    const scoreRightWide = right - radarD - 8 * s;
    const wide = left + panelW + gap + plaqueW + gap + scoreW + 8 * s + radarD <= right;
    const L = {
      panel: { x: left, y: top },
      radar: { x: right - radarD / 2, y: top + radarD / 2 },
      score: { x: 0, y: top },
      plaque: { x: 0, y: top },
      boss: { x: W / 2, y: 0, w: 400 },
      loadout: { x: left, y: 0 },
      xp: { x: 0, y: 0, w: 300 },
      mini: [],
      fps: { x: right, y: 0 },
      ptrRect: { x0: 0, y0: 0, x1: 0, y1: 0 },
      bannerY: H * 0.3,
    };
    let topBand;
    let rightColBottom;
    if (wide) {
      L.score.x = scoreRightWide;
      const scoreLeft = scoreRightWide - scoreW;
      const panelRight = left + panelW;
      const lo = panelRight + gap + plaqueW / 2;
      const hi = scoreLeft - gap - plaqueW / 2;
      L.plaque.x = clamp(W / 2, lo, Math.max(lo, hi));
      const avail = (scoreLeft - panelRight - gap * 2) / s;
      if (avail >= 300) {
        L.boss.x = (panelRight + scoreLeft) / 2;
        L.boss.y = top + plaqueH + 8 * s;
        L.boss.w = Math.min(620, avail);
      } else {
        L.boss.x = W / 2;
        L.boss.y = top + Math.max(panelH, plaqueH, radarD, (SCORE.h + 46) * s) + 10 * s;
        L.boss.w = Math.min(620, (right - left) / s - 40);
      }
      topBand = top + Math.max(panelH, plaqueH, radarD, (SCORE.h + 46) * s);
      rightColBottom = top + Math.max(radarD, (SCORE.h + 46) * s);
    } else {
      // narrow / portrait: panel + radar on row 1, plaque under the panel, score under radar
      L.score.x = right;
      L.score.y = top + radarD + 6 * s;
      L.plaque.x = left + plaqueW / 2;
      L.plaque.y = top + panelH + 2 * s;
      topBand = Math.max(L.plaque.y + plaqueH, L.score.y + (SCORE.h + 46) * s);
      rightColBottom = L.score.y + (SCORE.h + 46) * s;
      L.boss.x = W / 2;
      L.boss.y = topBand + 8 * s;
      L.boss.w = Math.min(620, (right - left) / s - 40);
    }

    // bottom: XP bar, loadout, co-op panels
    const xpH = XP_H * s;
    let bottomBand = bottom;
    if (!touch) {
      L.xp.x = left;
      L.xp.y = bottom - xpH - 4 * s;
      L.xp.w = (right - left) / s;
      L.loadout.x = left + 4 * s;
      L.loadout.y = L.xp.y - (SLOT + 10) * s;
      for (let i = 0; i < 3; i++) {
        L.mini.push({ x: right - (MINI.w + 4) * s - i * (MINI.w + 8) * s, y: L.xp.y - (MINI.h + 10) * s });
      }
      bottomBand = L.loadout.y;
      // mini panels must not collide with the loadout row
      L.mini = L.mini.filter((p) => p.x > left + (LOADOUT_W + 16) * s);
      if (np > 1 && L.mini.length < np - 1) {
        L.mini = [];
        for (let i = 0; i < 3; i++) L.mini.push({ x: right - (MINI.w + 4) * s, y: L.loadout.y - (MINI.h + 8) * s * (i + 1) });
      }
    } else {
      // touch: bottom corners belong to the sticks (mirrors input/touch.js layout)
      const R = clamp(Math.min(W, H) * 0.14, 50, 74);
      const inset = clamp(W * 0.15, R + 30, 220);
      const inner = W - 2 * (inset + R + 16);
      // loadout: under the panel (wide) or beside the score column under the plaque (narrow)
      L.loadout.x = left;
      if (wide) {
        L.loadout.y = top + panelH + 2 * s;
      } else {
        L.loadout.y = L.plaque.y + plaqueH + 4 * s;
        if (left + (LOADOUT_W + 8) * s > right - scoreW) L.loadout.y = topBand + 4 * s;
        topBand = Math.max(topBand, L.loadout.y + (SLOT + 4) * s);
      }
      // co-op panels stack down the right column under the score
      for (let i = 0; i < 3; i++) L.mini.push({ x: right - (MINI.w + 4) * s, y: rightColBottom + 6 * s + i * (MINI.h + 6) * s });
      if (np > 1) {
        const minisBottom = rightColBottom + 6 * s + (np - 1) * (MINI.h + 6) * s;
        rightColBottom = minisBottom;
        if (!wide) topBand = Math.max(topBand, minisBottom);
      }
      if (inner / s >= 240) {
        const w = Math.min(inner, 620 * s);
        L.xp.x = W / 2 - w / 2;
        L.xp.y = bottom - xpH - 4 * s;
        L.xp.w = w / s;
        bottomBand = L.xp.y;
      } else {
        // portrait: the Aether bar tucks under the top cluster
        L.xp.x = left;
        L.xp.y = topBand + 6 * s;
        L.xp.w = (right - left) / s;
        topBand = L.xp.y + (xpH + 8) * s;
        bottomBand = H - sa.b - R * 2 - 90;
      }
      if (!wide) L.boss.y = topBand + 8 * s;
      if (wide) {
        // the loadout sits under the panel on the left: keep the centre boss bar clear of it
        const loadRight = L.loadout.x + LOADOUT_W * s;
        if (L.boss.x - (L.boss.w / 2) * s < loadRight + gap && L.boss.y < L.loadout.y + SLOT * s) {
          L.boss.w = Math.max(240, Math.min(L.boss.w, ((right - loadRight - gap) / s - 20)));
          L.boss.x = Math.max(L.boss.x, loadRight + gap + (L.boss.w / 2) * s);
        }
        topBand = Math.max(topBand, L.loadout.y + SLOT * s);
      }
    }
    if (touch) {
      // right column is crowded on phones: the FPS meter sits bottom-centre between the sticks
      L.fps.x = W / 2 + 43 * s;
      L.fps.y = L.xp.y > H * 0.5 ? L.xp.y - 26 * s : bottom - 20 * s;
    } else {
      L.fps.y = rightColBottom + 4 * s;
    }
    L.ptrRect.x0 = sa.l + 30 * s;
    L.ptrRect.x1 = W - sa.r - 30 * s;
    L.ptrRect.y0 = Math.min(topBand + 26 * s, H * 0.42);
    L.ptrRect.y1 = Math.max(bottomBand - 26 * s, H * 0.58);
    L.bannerY = clamp(Math.max(H * 0.3, topBand + 70 * s), 0, H * 0.5);
    L.topBand = topBand;
    L.bottomBand = bottomBand;
    this.L = L;
  }

  _collectPointers(world, focus) {
    const out = this._ptrs;
    const pool = this._ptrPool;
    while (out.length) pool.push(out.pop());
    const add = (kind, x, y, dist, r = 0) => {
      if (out.length >= MAX_POINTERS) return;
      const it = pool.pop() || {};
      it.kind = kind;
      it.x = x;
      it.y = y;
      it.dist = dist;
      it.r = r;
      out.push(it);
    };
    const fx = focus.x;
    const fy = focus.y;
    for (const b of world.bosses || EMPTY) {
      if (b.alive) add('boss', b.x, b.y, Math.hypot(b.x - fx, b.y - fy), b.r || 80);
    }
    // nearest few elites
    const el = this._elites;
    el.length = 0;
    for (const e of world.enemies || EMPTY) {
      if (e.alive && e.elite && !e.parent && !e.isBoss) el.push(e);
    }
    if (el.length > 5) el.sort((a, b) => (a.x - fx) ** 2 + (a.y - fy) ** 2 - ((b.x - fx) ** 2 + (b.y - fy) ** 2));
    for (let i = 0; i < Math.min(5, el.length); i++) add('elite', el[i].x, el[i].y, 0, el[i].r || 0);
    let crates = 0;
    for (const p of world.pickups || EMPTY) {
      if (crates >= 3) break;
      if (p.alive && p.type === 'crate') {
        add('crate', p.x, p.y, 0, 16);
        crates++;
      }
    }
  }

  _reticle(ctx, renderer, p) {
    const g = this.game;
    const dev = g.input?.lastDevice;
    let show = false;
    if (p && p.alive && g.state === 'playing' && !g.ui?.isOpen) {
      const c = p.controls;
      if (dev === 'kbm' && c?.mouseWorld && c.aimMode === 'mouse') {
        const pt = renderer.worldToScreen(c.mouseWorld.x, c.mouseWorld.y, this._pt);
        drawReticle(this, ctx, pt.x, pt.y, !!p.firing, false);
        show = true;
      } else if (dev === 'pad' && c && c.aimMag > 0.2) {
        const d = p.aimDist || 200;
        const pt = renderer.worldToScreen(p.x + Math.cos(p.aim) * d, p.y + Math.sin(p.aim) * d, this._pt);
        drawReticle(this, ctx, pt.x, pt.y, !!p.firing, true);
      }
    }
    // the brass sight replaces the OS cursor over the playfield
    if (show !== this._cursorHidden) this._setCursor(show, renderer);
  }

  _setCursor(hidden, renderer) {
    this._cursorHidden = hidden;
    try {
      if (renderer?.canvas?.style) renderer.canvas.style.cursor = hidden ? 'none' : '';
    } catch {
      /* ignore */
    }
  }
}
