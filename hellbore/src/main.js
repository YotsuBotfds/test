// Boot: canvas sizing, main loop, screen flow, saving, and PWA plumbing.
import { Input } from './input.js';
import { audio } from './audio.js';
import { buildTileArt } from './gfx.js';
import { loadSave, writeSave } from './save.js';
import { RIGS, WEAPON_IDS } from './data.js';
import { Game } from './game.js';
import { TitleScreen, PlayScreen, ForgeScreen, GameOverScreen, VictoryScreen, PauseScreen } from './screens.js';
import { touchButtons } from './hud.js';
import { drawText } from './font.js';
import { pick } from './util.js';

class App {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.save = loadSave();
    this.settings = this.save.settings;
    this.input = new Input(canvas);
    this.audioReady = false;
    this.input.onActivity = () => {
      audio.init();
      if (!this.audioReady && audio.ctx) {
        this.audioReady = true;
        this.applySettings();
      }
    };
    this.deferredInstall = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstall = e;
    });
    window.addEventListener('appinstalled', () => (this.deferredInstall = null));
    this.game = null;
    this.attract = null;
    this.fps = 60;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    if (window.ResizeObserver && canvas.parentElement) new window.ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.screen instanceof PlayScreen && !this.game?.player.dead) this.setScreen(new PauseScreen(this));
        audio.suspend();
      } else audio.resume();
    });
    buildTileArt();
    this.newAttract();
    this.setScreen(new TitleScreen(this));
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  resize() {
    const stage = this.canvas.parentElement;
    const vw = stage?.clientWidth || window.innerWidth;
    const vh = stage?.clientHeight || window.innerHeight;
    const short = Math.min(vw, vh);
    const target = short < 500 ? 300 : 340;
    const scale = short / target;
    this.W = Math.max(200, Math.round(vw / scale));
    this.H = Math.max(200, Math.round(vh / scale));
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.canvas.style.width = `${vw}px`;
    this.canvas.style.height = `${vh}px`;
    this.ctx.imageSmoothingEnabled = false;
    this.input.W = this.W;
    this.input.H = this.H;
    this.input.buttons = touchButtons(this.W, this.H);
    this.game?.resize(this.W, this.H);
    this.attract?.resize(this.W, this.H);
  }

  applySettings() {
    const s = this.settings;
    audio.setVolumes({ master: s.master, music: s.music, sfx: s.sfx });
  }

  setScreen(s) {
    this.screen = s;
    this.input.gameplay = !!s.gameplay;
    this.canvas.style.cursor = s.gameplay ? 'none' : 'default';
    s.enter?.();
  }

  newAttract() {
    const rig = pick(RIGS);
    this.attract = new Game(this, { attract: true, rig });
    const p = this.attract.player;
    p.weapon = pick(WEAPON_IDS.filter((w) => w !== 'rail'));
    p.wlevels[p.weapon] = 3;
  }

  startRun(rig, opts = {}) {
    audio.play('select');
    const tutorial = this.save.records.runs < 3;
    this.save.records.runs++;
    writeSave(this.save);
    const seed = opts.daily ? dailySeed() : undefined;
    this.game = new Game(this, { rig, seed, daily: !!opts.daily, tutorial });
    this.setScreen(new PlayScreen(this));
  }

  openForge(game) {
    this.setScreen(new ForgeScreen(this, game));
  }

  showVictory(game) {
    this.setScreen(new VictoryScreen(this, game));
  }

  onBossDefeated(idx, game) {
    const before = this.save.bossKills[idx] || 0;
    this.save.bossKills[idx] = before + 1;
    if (before === 0) {
      const rig = RIGS.find((r) => r.unlock && r.unlock.boss === idx);
      if (rig) {
        game.unlockedRig = rig.name;
        game.showBanner('NEW RIG UNLOCKED', rig.name, [160, 255, 140], 3);
      }
    }
    if (idx === 5) this.save.records.wins++;
    writeSave(this.save);
  }

  onStratum() {}

  finishRun(game) {
    if (game.recorded) return game.recorded;
    const s = game.summary();
    const r = this.save.records;
    const flags = { score: s.score > r.bestScore, depth: s.depth > r.bestDepth, unlocked: game.unlockedRig };
    r.bestScore = Math.max(r.bestScore, s.score);
    r.bestDepth = Math.max(r.bestDepth, s.depth);
    r.kills += s.kills;
    r.ore += s.ore;
    r.bosses += s.bosses;
    r.deepestStratum = Math.max(r.deepestStratum, s.stratum);
    if (game.daily) {
      const today = todayKey();
      const d = this.save.daily;
      if (!d || d.date !== today || s.score > d.score) {
        flags.daily = true;
        this.save.daily = { date: today, score: s.score, depth: s.depth };
      }
      flags.isDaily = true;
    }
    writeSave(this.save);
    game.recorded = { s, flags };
    return game.recorded;
  }

  gameOver(game) {
    const { s, flags } = this.finishRun(game);
    this.setScreen(new GameOverScreen(this, s, flags));
  }

  today() {
    return todayKey();
  }

  canInstall() {
    return !!this.deferredInstall;
  }

  async install() {
    const d = this.deferredInstall;
    if (!d) return;
    this.deferredInstall = null;
    try {
      await d.prompt();
    } catch {
      // The browser declined to show the prompt.
    }
  }

  hint() {
    const m = this.input.mode;
    if (m === 'touch') return 'TAP TO SELECT';
    if (m === 'pad') return 'D-PAD + A TO SELECT';
    return 'ARROWS + ENTER, OR CLICK';
  }

  frame(t) {
    requestAnimationFrame((tt) => this.frame(tt));
    const dt = Math.min(0.05, Math.max(0, (t - this.last) / 1000));
    this.last = t;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
    this.input.gameplay = !!this.screen.gameplay;
    this.input.poll();
    try {
      this.screen.update(dt, this.input);
      this.screen.render(this.ctx);
    } catch (err) {
      console.error(err);
    }
    if (this.settings.showFps) drawText(this.ctx, `${Math.round(this.fps)} FPS`, 4, this.H - 10, { color: '#8f8' });
    this.input.endFrame();
  }
}

export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dailySeed() {
  let h = 2166136261;
  for (const ch of `hellbore:${todayKey()}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function boot() {
  const canvas = document.getElementById('game');
  const app = new App(canvas);
  window.hellbore = app;
  try {
    const installable = document.querySelector('link[rel="manifest"]');
    if (installable && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  } catch {
    // Sandboxed frames refuse service workers; offline support is a bonus.
  }
  return app;
}


boot();
