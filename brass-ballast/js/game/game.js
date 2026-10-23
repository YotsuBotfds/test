// Game: state machine, run lifecycle and the frame (DESIGN §2.1, §4.2, §4.8, §4.10, §4.11).
//
// States: boot | title | playing | paused | levelup | refit | transition | gameover | victory.
// The simulation runs in 'playing' & 'transition' (and during the slow-mo ending before
// results). Level-ups, refits and crates queue "choices" that pause the sim and open
// ui.showLevelUp; co-op players pick in turn.

import { Save } from '../core/storage.js';
import { events } from '../core/events.js';
import { MAX_DT, flag } from '../config.js';
import { clamp } from '../core/math.js';
import { HULLS } from '../content/hulls.js';
import { PRIMARIES } from '../content/weapons/index.js';
import { MODES, MODIFIERS, dailySeed } from '../content/modes.js';
import { STAGES } from '../content/stages.js';
import { BOSSES } from '../content/bosses/index.js';
import { rollChoices, applyChoice } from '../content/upgrades.js';
import { Loop } from '../core/loop.js';
import { World } from './world.js';
import { Director } from './director.js';
import { CameraRig } from './camera.js';
import { Attract } from './attract.js';

/** Default run modifiers (DESIGN §2.2). */
export function defaultMods() {
  return {
    enemyHp: 1, enemyDmg: 1, enemySpeed: 1, enemyBulletSpeed: 1, playerDmg: 1, playerDmgTaken: 1,
    spawnRate: 1, eliteChance: 0, xp: 1, cogs: 1, wind: 0, volatileAll: false, fog: false,
    bombDrops: 1, startBombs: null,
  };
}

/** XP needed to go from `level` to level + 1. */
export function xpForLevel(level) {
  const l = level - 1;
  return Math.round(6 + l * 7 + l * l * 0.9);
}

const SIM_STATES = new Set(['playing', 'transition']);

const REPAIR_CARD = {
  key: 'repair', kind: 'repair', id: 'repair', name: 'Field Repairs', desc: 'Repair 30% of your hull.',
  icon: 'icon_heal', rarity: 'common', level: 1, maxLevel: 1,
};
const COGS_CARD = {
  key: 'cogs', kind: 'cogs', id: 'cogs', name: 'Salvage Haul', desc: '+40 cogs for the Workshop.',
  icon: 'icon_cog', rarity: 'common', level: 1, maxLevel: 1, value: 40,
};

export class Game {
  /**
   * @param {object} deps
   * @param {import('../gfx/renderer.js').Renderer} deps.renderer
   * @param {any} deps.input
   * @param {any} deps.audio
   * @param {any} deps.background
   * @param {any} deps.weather
   * @param {any} deps.particles
   * @param {any} deps.fx
   */
  constructor(deps) {
    this.renderer = deps.renderer;
    this.input = deps.input;
    this.audio = deps.audio;
    this.background = deps.background;
    this.weather = deps.weather;
    this.particles = deps.particles;
    this.fx = deps.fx;
    this.events = events;
    /** @type {any} */
    this.hud = null;
    /** @type {any} */
    this.ui = null;
    this.state = 'boot';
    this.world = null;
    this.run = null;
    this.director = null;
    this.camera = new CameraRig(this.renderer);
    this.attract = new Attract(this);
    this.loop = new Loop((dt) => this.frame(dt));

    this.timeScale = 1; // debug speed
    this.slowScale = 1;
    this.slowT = 0;
    this.hitstopT = 0;
    this.flashColor = '#ffffff';
    this.flashA = 0;
    this.frameNo = 0;
    this.realTime = 0;
    this.pendingLevels = 0;
    this.choiceQueue = [];
    /** Active card choice: {req, player, cards, pick(card), reroll()} */
    this.choice = null;
    this.refitCb = null;
    this.resumeState = 'playing';
    this.pausedFrom = 'playing';
    this.ending = null;
    this.lastRunOpts = null;
    this.hum = null;
    this.currentBiome = null;
    this.god = false;
    this.autopilot = false;
    this._stateFrame = -1;
    this._errors = new Set();
    this._vig = null;

    events.on('settings:change', () => this.applySettings());
    events.on('achievement:unlock', ({ achievement } = {}) => {
      if (this.run && achievement) this.run.achievements.push(achievement.id ?? achievement);
    });
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          if (!this.autopilot) this.pause();
          this.audio?.suspend?.();
        } else {
          this.audio?.resume?.();
        }
      });
      window.addEventListener('blur', () => {
        if (!this.autopilot) this.pause();
      });
    }
  }

  get fps() {
    return this.loop.fps;
  }

  /** True while the world simulates. */
  get simulating() {
    return SIM_STATES.has(this.state) || (this.ending && !this.ending.shown);
  }

  // ---- Boot & title ------------------------------------------------------------------------

  /** Start the frame loop and show the title (call once after prewarm). */
  boot() {
    this.applySettings();
    this.toTitle();
    this.loop.start();
  }

  toTitle() {
    this.state = 'title';
    this._stateFrame = this.frameNo;
    this.attract.start();
    this.particles.clear?.();
    this.fx.clear?.();
    this._setBiome('brassbay', 0);
    this.weather.setBiome?.('brassbay', 0);
    this._music('title', 1.5);
    this.input?.setGameplayActive?.(false);
    this.ui?.show?.('title');
  }

  // ---- Settings ----------------------------------------------------------------------------

  applySettings() {
    const s = Save.settings;
    try {
      this.audio?.setVolumes?.({ master: flag('mute') ? 0 : s.master, music: s.music, sfx: s.sfx });
    } catch (err) {
      this._err('audio.setVolumes', err);
    }
    this.input?.setTouchLayout?.({ leftHanded: !!s.leftHanded, opacity: s.touchOpacity });
    const low = s.quality === 'low';
    const dpr = low ? 1.25 : 2;
    if (this.renderer.maxDpr !== dpr) this.renderer.setMaxDpr(dpr);
    // Particles read Save.settings.quality themselves (low halves the cap); optional hook.
    this.particles?.setQuality?.(s.quality);
    this.weather?.setReducedFlash?.(s.flashes === false);
  }

  // ---- Runs --------------------------------------------------------------------------------

  /**
   * Start a run.
   * @param {{mode?:string, hull?:string, weapon?:string, seed?:number, modifiers?:string[],
   *          stage?:number, wave?:number, boss?:string}} [opts] stage/wave are 0-based positions
   */
  startRun(opts = {}) {
    if (this.world) this._teardown();
    const mode = MODES[opts.mode] ? opts.mode : 'campaign';
    const modeDef = MODES[mode];
    const hull = HULLS[opts.hull] ? opts.hull : Save.meta.hull in HULLS ? Save.meta.hull : 'dauntless';
    const weapon = PRIMARIES[opts.weapon] ? opts.weapon : PRIMARIES[Save.meta.weapon] ? Save.meta.weapon : 'brassCannon';
    const day = new Date().toISOString().slice(0, 10);
    let seed = opts.seed;
    if (mode === 'daily') seed = modeDef.seed?.(new Date()) ?? dailySeed(new Date());
    if (seed === undefined || seed === null || Number.isNaN(Number(seed))) seed = (Math.random() * 2 ** 32) >>> 0;
    seed = Number(seed) >>> 0;
    let modifiers = opts.modifiers || [];
    if (mode === 'daily' && !opts.modifiers) modifiers = modeDef.modifiers?.(seed) || [];
    const mods = defaultMods();
    for (const id of modifiers) {
      try {
        MODIFIERS[id]?.apply(mods);
      } catch (err) {
        this._err(`modifier:${id}`, err);
      }
    }
    let stageOrder = [0, 1, 2, 3, 4].slice(0, STAGES.length);
    try {
      stageOrder = modeDef.stages?.(seed) || stageOrder;
    } catch (err) {
      this._err('mode.stages', err);
    }
    this.lastRunOpts = { ...opts, mode, hull, weapon, seed: opts.seed, modifiers: opts.modifiers };
    Save.meta.hull = hull;
    Save.meta.weapon = weapon;

    /** Run object (DESIGN §4.10). */
    const run = {
      mode, seed, day, modifiers, mods, hull, weapon,
      stageIndex: 0, stageOrder, stage: STAGES[stageOrder[0]] || STAGES[0],
      wave: 0, waveCount: 0, director: 'intro', time: 0,
      score: 0, combo: 1, chain: 0, comboTimer: 0, bestCombo: 0,
      xp: 0, level: 1, xpNext: xpForLevel(1), cogs: 0, cogFrac: 0,
      kills: 0, bossKills: 0, elitesKilled: 0, damageDealt: 0, damageTaken: 0,
      shotsFired: 0, bombsUsed: 0, boosts: 0, pickups: 0, upgrades: [], achievements: [],
      killsByType: {}, over: false, victory: false, bossHpMult: 1, endlessWave: 0,
      stageReached: 1, enemyFireRate: 1,
    };
    this.run = run;
    const world = new World(this, { run, seed });
    this.world = world;
    this.director = new Director(this, world);
    world.director = this.director;

    this.particles.clear?.();
    this.fx.clear?.();
    this.pendingLevels = 0;
    this.choiceQueue.length = 0;
    this.choice = null;
    this.refitCb = null;
    this.ending = null;
    this.slowScale = 1;
    this.slowT = 0;
    this.hitstopT = 0;
    this.flashA = 0;
    this.camera.baseZoomMul = 1;
    this.camera.trauma = 0;
    this.camera.punch = 0;

    const p = world.addPlayer({ hull, weapon, x: 0, y: 0 });
    this.setupPlayer(p);
    if (this.god) p.god = true;
    this.camera.snap(p.x, p.y);
    Save.discover('weapons', weapon);

    this.ui?.hide?.();
    this.input?.setGameplayActive?.(true);
    this.state = 'playing';
    this._stateFrame = this.frameNo;
    this._startHum();
    events.emit('run:start', { run });
    this.director.start({ stage: opts.stage, wave: opts.wave, boss: opts.boss });
    // Announce active modifiers (Daily Squall etc.).
    modifiers.forEach((id, i) => {
      const m = MODIFIERS[id];
      if (!m) return;
      setTimeout(() => {
        if (this.run === run) this.ui?.toast?.(`${m.name} — ${m.desc}`, { kind: 'warning', icon: 'icon_star', time: 4.5 });
      }, 1200 + i * 700);
    });
    Save.save();
    return run;
  }

  /** Apply hull perks & starting loadout to a fresh player. */
  setupPlayer(p) {
    const hull = p.hull;
    for (const id of hull.startAux || []) p.addAux(id);
    for (const [id, lv] of Object.entries(hull.startPassives || {})) {
      for (let i = 0; i < lv; i++) p.addPassive(id);
    }
    p.recomputeStats();
    p.hp = p.stats.maxHp;
    p.steam = p.stats.steamMax;
    p.bombs = this.run?.mods?.startBombs ?? p.stats.bombsMax;
    p.revivesLeft = p.stats.revives;
    p.rerolls = p.stats.rerolls;
  }

  /** Drop-in co-op: add a player bound to `padIndex`. */
  addCoopPlayer(padIndex, opts = {}) {
    const w = this.world;
    if (!w || w.players.length >= 4) return null;
    const lead = w.players[0];
    const p = w.addPlayer({
      hull: opts.hull || this.run.hull,
      weapon: opts.weapon || this.run.weapon,
      x: (lead?.x ?? 0) + 60,
      y: (lead?.y ?? 0) + 60,
    });
    this.setupPlayer(p);
    p.iframes = 2;
    if (this.god) p.god = true;
    if (padIndex !== undefined && padIndex !== null) {
      p.padIndex = padIndex;
      this.input?.bindPlayer?.(p.index, padIndex);
    }
    if (opts.brain) p.brain = opts.brain;
    if (opts.autoPick) p.autoPick = opts.autoPick;
    w.fx.shockwave?.(p.x, p.y, 140, p.color, 0.5);
    w.sfx('revive', p.x, p.y);
    this.hud?.announce?.(`Captain ${p.index + 1} joins!`, 'All hands to the guns', { kind: 'clear', time: 2 });
    events.emit('player:join', { player: p });
    return p;
  }

  restart() {
    const opts = { ...(this.lastRunOpts || {}) };
    this.startRun(opts);
  }

  quitToTitle() {
    if (this.run && !this.run.over) this.endRun(false, { abandon: true });
    this._teardown();
    this.toTitle();
  }

  _teardown() {
    this._stopHum();
    this.world?.destroy();
    this.world = null;
    this.director = null;
    this.choice = null;
    this.choiceQueue.length = 0;
    this.refitCb = null;
    this.ending = null;
    this.slowScale = 1;
    this.hitstopT = 0;
    this.flashA = 0;
  }

  // ---- Pause -------------------------------------------------------------------------------

  pause() {
    if (!SIM_STATES.has(this.state) || this.ending) return;
    this.pausedFrom = this.state;
    this.state = 'paused';
    this._stateFrame = this.frameNo;
    this.input?.setGameplayActive?.(false);
    this.hum?.set?.({ vol: 0 });
    this.audio?.duck?.(0.5, 0.4);
    this.ui?.show?.('pause');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = this.pausedFrom || 'playing';
    this._stateFrame = this.frameNo;
    this.ui?.hide?.();
    this.input?.setGameplayActive?.(true);
  }

  togglePause() {
    if (this.state === 'paused') this.resume();
    else this.pause();
  }

  // ---- XP, level-ups & choices -------------------------------------------------------------

  /** Add team XP (already multiplied by the collector's xpGain). */
  addXp(v) {
    const run = this.run;
    if (!run || run.over) return;
    run.xp += v;
    let guard = 0;
    while (run.xp >= run.xpNext && guard++ < 50) {
      run.xp -= run.xpNext;
      run.level++;
      run.xpNext = xpForLevel(run.level);
      this.pendingLevels++;
      events.emit('levelup', { run, level: run.level });
    }
  }

  /** Armory crate → bonus pick for that player. */
  openCrate(player) {
    this.choiceQueue.push({ kind: 'crate', player });
  }

  /** Called by the director after a boss: heal, revive, refit picks, then cb(). */
  beginRefit(cb) {
    const w = this.world;
    this.refitCb = cb;
    for (const p of w.players) {
      if (!p.alive) w.revivePlayer(p, 0.4, 'Patched up!');
      else w.healPlayer(p, p.stats.maxHp * 0.4);
    }
    for (const p of w.players) if (p.alive) this.choiceQueue.push({ kind: 'refit', player: p });
    if (!this.choiceQueue.length) this._finishRefit();
  }

  _finishRefit() {
    const cb = this.refitCb;
    this.refitCb = null;
    this.state = 'transition';
    this._stateFrame = this.frameNo;
    this.input?.setGameplayActive?.(true);
    cb?.();
  }

  _canOpenChoice() {
    const st = this.state;
    return (SIM_STATES.has(st) || st === 'refit' || st === 'levelup') && !this.ending && !this.choice;
  }

  _processChoices() {
    if (!this.run || this.ending) return;
    if (this.pendingLevels > 0 && !this.choice) {
      const living = this.world.players.filter((p) => p.alive);
      for (let i = 0; i < this.pendingLevels; i++) {
        for (const p of living) this.choiceQueue.push({ kind: 'level', player: p });
      }
      this.pendingLevels = 0;
    }
    if (this.choice || !this.choiceQueue.length || !this._canOpenChoice()) {
      if (!this.choice && !this.choiceQueue.length && this.state === 'refit' && this.refitCb) this._finishRefit();
      else if (!this.choice && !this.choiceQueue.length && this.state === 'levelup') {
        this.state = this.resumeState === 'transition' ? 'transition' : 'playing';
        this.input?.setGameplayActive?.(true);
      }
      return;
    }
    const req = this.choiceQueue.shift();
    if (!req.player?.alive) return;
    this._openChoice(req);
  }

  rollCards(player, kind, count) {
    let cards = [];
    try {
      cards = rollChoices(player, this.world.rng, count, { pool: kind, run: this.run, world: this.world }) || [];
    } catch (err) {
      this._err('rollChoices', err);
    }
    cards = cards.filter(Boolean);
    if (!cards.length) cards = [{ ...REPAIR_CARD }, { ...COGS_CARD }];
    return cards;
  }

  _openChoice(req) {
    const p = req.player;
    const run = this.run;
    const w = this.world;
    if (SIM_STATES.has(this.state)) this.resumeState = this.state;
    this.state = req.kind === 'refit' ? 'refit' : 'levelup';
    this._stateFrame = this.frameNo;
    this.input?.setGameplayActive?.(false);
    const extra = p.stats.extraChoices || 0;
    const count = req.kind === 'crate' ? 3 : 3 + extra;
    const cards = this.rollCards(p, req.kind, count);
    const titles = {
      level: ['Level Up!', `Aether level ${run.level}`],
      refit: ['Refit', 'Choose a fine upgrade — hull repaired 40%'],
      crate: ['Armory Crate', 'A bonus upgrade from the Syndicate stores'],
    };
    const [title, subtitle] = titles[req.kind] || titles.level;
    const choice = {
      req,
      player: p,
      cards,
      title,
      subtitle,
      autoT: 0.7,
      pick: (card) => this._pick(choice, card),
      reroll: () => this._reroll(choice),
    };
    this.choice = choice;
    if (req.kind === 'level') {
      w.sfx('level_up', p.x, p.y);
      if (w.fx.levelUp) w.fx.levelUp(p.x, p.y, '#4fe3d0');
      else w.fx.shockwave?.(p.x, p.y, 200, '#7ff3ff', 0.6);
    } else if (req.kind === 'refit') {
      w.sfx('upgrade_pick', p.x, p.y);
    }
    this.hum?.set?.({ vol: 0 });
    if (this.ui?.showLevelUp) {
      try {
        this.ui.showLevelUp({
          title,
          subtitle,
          kind: req.kind,
          cards,
          rerolls: p.rerolls,
          player: p,
          onPick: (card) => choice.pick(card),
          onReroll: () => choice.reroll(),
        });
      } catch (err) {
        this._err('ui.showLevelUp', err);
        choice.pick(cards[0]);
      }
    } else {
      choice.pick(cards[0]);
    }
  }

  _reroll(choice) {
    const p = choice.player;
    if (this.choice !== choice || p.rerolls <= 0) return choice.cards;
    p.rerolls--;
    const count = choice.req.kind === 'crate' ? 3 : 3 + (p.stats.extraChoices || 0);
    choice.cards = this.rollCards(p, choice.req.kind, count);
    this.world.sfx('ui_card');
    return choice.cards;
  }

  _pick(choice, card) {
    if (this.choice !== choice) return;
    this.choice = null;
    if (card) this.applyCard(choice.player, card);
    if (this.ui?.isOpen) this.ui.hide?.();
    this.world.sfx('upgrade_pick');
    // More choices queued? They open next frame. Otherwise return to play.
    if (this.choiceQueue.length) return;
    if (this.refitCb) {
      this._finishRefit();
      return;
    }
    this.state = this.resumeState === 'transition' ? 'transition' : 'playing';
    this._stateFrame = this.frameNo;
    this.input?.setGameplayActive?.(true);
  }

  /**
   * Apply a card robustly: content applyChoice first, then verify and fall back per kind.
   */
  applyCard(p, card) {
    const run = this.run;
    const before = {
      passive: p.passiveLevel(card.id),
      aux: p.auxLevel(card.id),
      prim: p.primary.level,
      hp: p.hp,
      cogs: run.cogs,
    };
    try {
      applyChoice(p, card, this.world);
    } catch (err) {
      this._err('applyChoice', err);
    }
    switch (card.kind) {
      case 'passive':
        if (p.passiveLevel(card.id) === before.passive) p.addPassive(card.id);
        break;
      case 'auxNew':
      case 'auxLevel':
        if (p.auxLevel(card.id) === before.aux) {
          if (p.hasAux(card.id)) p.levelAux(card.id);
          else p.addAux(card.id);
        }
        break;
      case 'primaryLevel':
        if (p.primary.level === before.prim) p.levelPrimary();
        break;
      case 'evolution':
        if (!p.hasAux(card.id)) p.evolveAux(card.id);
        break;
      case 'repair':
        if (p.hp === before.hp) this.world.healPlayer(p, p.stats.maxHp * 0.3);
        break;
      case 'cogs':
        if (run.cogs === before.cogs) run.cogs += card.value ?? 40;
        break;
      default:
        break;
    }
    p.recomputeStats();
    run.upgrades.push(card.key || `${card.kind}:${card.id}`);
    this.world.floatText(p.x, p.y - 50, card.name || card.id, { color: '#ffe08a', size: 18, life: 1.4 });
    events.emit('upgrade:take', { player: p, card });
  }

  // ---- Stage hooks (called by the director) ------------------------------------------------

  _setBiome(id, fade) {
    if (this.currentBiome === id) return;
    this.currentBiome = id;
    try {
      this.background.setBiome?.(id, fade);
    } catch (err) {
      this._err('background.setBiome', err);
    }
  }

  onStageStart(stage, info = {}) {
    if (!stage) return;
    this._setBiome(stage.biome || stage.id, info.first ? 0 : 3);
    this.weather.setBiome?.(stage.biome || stage.id, info.first ? 0 : 3);
    this.camera.baseZoomMul = 1;
    if (!info.silent) {
      this._music(stage.music || stage.biome, 1.5);
      if (this._announced !== stage) {
        const label = info.endless ? 'Endless Gale' : info.bossRush ? `Gauntlet ${info.index + 1}` : `Stage ${info.index + 1}`;
        this.hud?.announce?.(stage.name || label, `${label} — ${stage.subtitle || ''}`, { kind: 'stage', time: 3 });
      }
      this._announced = null;
    }
  }

  onTransition(next, index) {
    if (!next) return;
    this.state = 'transition';
    this._stateFrame = this.frameNo;
    this._setBiome(next.biome || next.id, 3);
    this.weather.setBiome?.(next.biome || next.id, 3);
    this.camera.baseZoomMul = 1;
    this._music(next.music || next.biome, 3);
    const run = this.run;
    const label = run?.mode === 'endless' ? 'Endless Gale' : run?.mode === 'bossRush' ? `Gauntlet ${index + 1}` : `Stage ${index + 1}`;
    if (!(run?.mode === 'endless' && next.biome === run.stage?.biome)) {
      this.hud?.announce?.(next.name || label, `${label} — ${next.subtitle || 'Full steam ahead'}`, { kind: 'stage', time: 3.4 });
      this._announced = next;
    }
  }

  /** Switch music unless that track is already playing (null stops). */
  music(track, fade = 1.5) {
    this._music(track, fade);
  }

  _music(track, fade = 1.5) {
    if (this._track === track) return;
    this._track = track;
    try {
      this.audio?.music?.(track, { fade });
    } catch (err) {
      this._err('audio.music', err);
    }
  }

  onWaveClear() {
    const w = this.world;
    if (!w) return;
    if (w.alivePlayerCount() > 0) {
      for (const p of w.players) if (!p.alive) w.revivePlayer(p, 0.4);
    }
  }

  onBossSpawn() {
    this.camera.baseZoomMul = 0.88;
  }

  // ---- Endings -----------------------------------------------------------------------------

  onAllPlayersDown() {
    if (this.ending) return;
    this.state = 'gameover';
    this._stateFrame = this.frameNo;
    this.ending = { victory: false, t: 0, dur: 2.4, shown: false };
    this.slowmo(0.25, 2);
    this.choiceQueue.length = 0;
    this.choice = null;
    this._stopHum();
    this._music('gameover', 0.8);
    this.world.sfx('game_over');
    this.input?.setGameplayActive?.(false);
  }

  victory() {
    if (this.ending) return;
    this.state = 'victory';
    this._stateFrame = this.frameNo;
    this.ending = { victory: true, t: 0, dur: 3.5, shown: false };
    this.slowmo(0.5, 1.5);
    this.choiceQueue.length = 0;
    this._stopHum();
    this._music('victory', 0.8);
    this.world.sfx('victory');
    this.hud?.announce?.('Victory!', 'The Iron Syndicate is broken', { kind: 'stage', time: 4 });
    this.world.vacuumPickups(true);
    for (const p of this.world.players) p.god = true;
  }

  _updateEnding(dt) {
    const e = this.ending;
    if (!e || e.shown) return;
    e.t += dt;
    if (e.t < e.dur) return;
    e.shown = true;
    const summary = this.endRun(e.victory);
    this.input?.setGameplayActive?.(false);
    try {
      this.ui?.showResults?.(summary, {
        onRetry: () => this.restart(),
        onMenu: () => this.quitToTitle(),
      });
    } catch (err) {
      this._err('ui.showResults', err);
    }
  }

  /**
   * Finish the run: bank cogs, stats, highscores, codex, unlocks. Returns the summary.
   * @param {boolean} victory
   * @param {{abandon?:boolean}} [opts]
   */
  endRun(victory, opts = {}) {
    const run = this.run;
    if (!run) return null;
    if (run.over) return run.summary;
    run.over = true;
    run.victory = victory;
    const unlocks = [];
    const meta = Save.meta;
    const st = Save.data.stats;
    meta.cogs += run.cogs;
    meta.totalCogs = (meta.totalCogs || 0) + run.cogs;
    st.runs++;
    if (victory) st.wins++;
    else if (!opts.abandon) st.deaths++;
    st.kills += run.kills;
    st.bossKills += run.bossKills;
    st.playTime += run.time;
    st.bestCombo = Math.max(st.bestCombo, run.bestCombo);
    st.maxStage = Math.max(st.maxStage, run.mode === 'campaign' || run.mode === 'daily' ? run.stageReached : 0);
    st.cogsEarned += run.cogs;
    if (run.mode === 'endless') st.bestEndlessWave = Math.max(st.bestEndlessWave, run.endlessWave || run.wave);
    const prevBest = st.bestScore;
    st.bestScore = Math.max(st.bestScore, run.score);

    let rank = -1;
    if (run.score > 0) {
      rank = Save.addHighscore(run.mode, {
        score: run.score, date: Date.now(), day: run.day, hull: run.hull, weapon: run.weapon,
        stage: run.stageReached, wave: run.wave, level: run.level, time: Math.round(run.time),
        victory, kills: run.kills, seed: run.seed, modifiers: run.modifiers,
      });
    }
    const newHighScore = run.score > 0 && (rank === 0 || run.score > prevBest);

    if (run.stageReached >= 3 && (run.mode === 'campaign' || run.mode === 'daily') && Save.unlock('hull', 'tinker')) {
      unlocks.push(`${HULLS.tinker?.name || "The Tinker's Folly"} hull unlocked!`);
    }
    if (victory && run.mode === 'campaign') {
      if (Save.unlock('hull', 'bane')) unlocks.push(`${HULLS.bane?.name || "The Leviathan's Bane"} hull unlocked!`);
      if (st.wins === 1) unlocks.push(`${MODES.bossRush?.name || 'Gauntlet of Iron'} mode unlocked!`);
    }
    // Codex: first kill was recorded live; add the remaining counts now.
    for (const [type, n] of Object.entries(run.killsByType || {})) {
      if (n > 1) Save.discover(BOSSES[type] ? 'bosses' : 'enemies', type, n - 1);
    }
    Save.saveNow();
    const summary = {
      victory, mode: run.mode, score: run.score, time: run.time, kills: run.kills,
      bossKills: run.bossKills, stageReached: run.stageReached, wave: run.wave, level: run.level,
      cogsEarned: run.cogs, bestCombo: run.bestCombo, damageDealt: Math.round(run.damageDealt),
      damageTaken: Math.round(run.damageTaken), newHighScore, achievements: [...run.achievements],
      unlocks, rank, elitesKilled: run.elitesKilled, shotsFired: run.shotsFired,
      bombsUsed: run.bombsUsed, boosts: run.boosts, hull: run.hull, weapon: run.weapon,
      modifiers: run.modifiers, abandoned: !!opts.abandon, upgrades: [...run.upgrades],
    };
    run.summary = summary;
    events.emit('run:end', { run, victory, summary });
    return summary;
  }

  // ---- Feel ------------------------------------------------------------------------------

  hitstop(seconds) {
    this.hitstopT = Math.max(this.hitstopT, Math.min(0.2, seconds));
  }

  slowmo(scale, seconds) {
    this.slowScale = Math.min(this.slowScale, scale);
    this.slowT = Math.max(this.slowT, seconds);
  }

  screenFlash(color, a) {
    const cap = Save.settings.flashes === false ? 0.15 : 0.6;
    this.flashColor = color;
    this.flashA = Math.min(cap, Math.max(this.flashA, a));
  }

  _startHum() {
    this._stopHum();
    try {
      this.hum = this.audio?.loop?.('engine_hum', { vol: 0.2 }) || null;
    } catch (err) {
      this._err('audio.loop', err);
    }
  }

  _stopHum() {
    try {
      this.hum?.stop?.(0.5);
    } catch {
      /* ignore */
    }
    this.hum = null;
  }

  // ---- Frame -------------------------------------------------------------------------------

  frame(rawDt) {
    this.frameNo++;
    this.realTime += rawDt;
    const dt = Math.min(rawDt, MAX_DT);
    this._try('input.update', () => this.input?.update?.(dt));
    this._try('ui.update', () => this.ui?.update?.(dt));
    this._handleGlobalInput();

    if (this.simulating && this.world) {
      if (this.hitstopT > 0) {
        this.hitstopT -= dt;
      } else {
        let sim = dt * this.timeScale * this.slowScale;
        let guard = 0;
        while (sim > 1e-6 && guard++ < 8) {
          const step = Math.min(sim, MAX_DT);
          this.world.update(step);
          sim -= step;
          if (!this.simulating) break;
        }
      }
    } else if (this.ending?.shown && this.world) {
      // Behind the results screen: let smoke & sparks settle instead of freezing mid-blast.
      this._try('particles.update', () => {
        this.particles.update(dt * 0.5);
        this.fx.update(dt * 0.5);
      });
    }
    if (this.slowT > 0) {
      this.slowT -= dt;
    } else if (this.slowScale < 1) {
      this.slowScale = Math.min(1, this.slowScale + dt * 1.5);
    }
    this.flashA = Math.max(0, this.flashA - dt * 2.5);

    if (this.world) {
      // A stage transition ends when the director moves on to the next intro.
      if (this.state === 'transition' && this.director && this.director.state !== 'transition') {
        this.state = 'playing';
      }
      this._processChoices();
      this._autoPick(dt);
      this._updateEnding(dt);
      this.camera.update(dt, this.world.players);
    } else if (this.state === 'title') {
      this.attract.update(dt);
    }

    this._try('background.update', () => this.background.update?.(dt));
    this._try('weather.update', () => this.weather.update?.(dt, this.renderer, this.world));
    this._try('hud.update', () => this.hud?.update?.(dt));
    this._audioFrame(dt);
    this._touchStatus();
    this.render();
  }

  _handleGlobalInput() {
    const input = this.input;
    if (!input || this._stateFrame === this.frameNo) return;
    if (SIM_STATES.has(this.state) && !this.ending) {
      let pause = false;
      const n = this.world ? Math.max(1, this.world.players.length) : 1;
      for (let i = 0; i < n; i++) {
        const p = this.world?.players[i];
        if (p?.brain) continue;
        if (input.controls?.(i)?.pause) pause = true;
      }
      if (pause) this.pause();
      const pad = input.joinRequested?.();
      if (pad !== null && pad !== undefined && this.world && this.world.players.length < 4) {
        const bound = this.world.players.some((p) => p.padIndex === pad && p.index > 0);
        if (!bound) this.addCoopPlayer(pad);
      }
    } else if (this.state === 'paused' && !this.ui?.isOpen) {
      if (input.controls?.(0)?.pause) this.resume();
    }
  }

  _autoPick(dt) {
    const c = this.choice;
    if (!c || !c.player.autoPick) return;
    c.autoT -= dt;
    if (c.autoT > 0) return;
    let card = null;
    try {
      card = c.player.autoPick(c.cards, c);
    } catch (err) {
      this._err('autoPick', err);
    }
    if (this.choice !== c) return; // autoPick may have rerolled/picked itself
    c.pick(card || c.cards[0]);
  }

  /** Boost charge & bomb count hints on the touch buttons. */
  _touchStatus() {
    const inp = this.input;
    if (!inp?.setTouchStatus) return;
    const p = this.world?.players?.[0];
    if (!p || !this.simulating) {
      if (this._touchShown) inp.setTouchStatus({ boost: -1 });
      this._touchShown = false;
      return;
    }
    this._touchShown = true;
    const st = this._ts || (this._ts = { boost: 0, bombs: 0, bombsMax: 0 });
    st.boost = clamp(p.steam / Math.max(1, p.stats.boostCost), 0, 1);
    st.bombs = p.bombs;
    st.bombsMax = p.stats.bombsMax;
    inp.setTouchStatus(st);
  }

  _audioFrame(dt) {
    const a = this.audio;
    if (!a) return;
    const cam = this.renderer.camera;
    this._try('audio.setListener', () => a.setListener?.(cam.x, cam.y));
    const w = this.world;
    if (w && this.simulating) {
      const p = w.players[0];
      if (p && this.hum) {
        const k = clamp(Math.hypot(p.vx, p.vy) / Math.max(1, p.stats.speed), 0, 2);
        this._try('hum', () => this.hum.set?.({ vol: p.alive ? 0.14 + 0.12 * Math.min(1, k) : 0, pitch: 0.75 + 0.45 * Math.min(1.6, k) }));
      }
      // Intensity from pressure near the players.
      this._intT = (this._intT || 0) - dt;
      if (this._intT <= 0) {
        this._intT = 0.5;
        let near = 0;
        const lead = w.players[0];
        if (lead) {
          for (const e of w.enemies) {
            if (e.alive && Math.abs(e.x - lead.x) < 900 && Math.abs(e.y - lead.y) < 700) near++;
          }
        }
        const boss = w.bosses.length ? 0.45 : 0;
        const val = clamp(near / 40 + boss + w.eBullets.length / 400, 0, 1);
        this._try('audio.setIntensity', () => a.setIntensity?.(val));
      }
    }
  }

  // ---- Render ------------------------------------------------------------------------------

  render() {
    const r = this.renderer;
    const ctx = r.ctx;
    r.clear('#1b130b');
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this._try('background.drawBack', () => this.background.drawBack?.(ctx, r));
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    let focus = null;
    if (this.world && this.state !== 'title') {
      this._try('world.draw', () => this.world.draw(ctx, r));
      const p = this.world.players[0];
      if (p) focus = r.worldToScreen(p.x, p.y, this._focus || (this._focus = { x: 0, y: 0 }));
    } else {
      this._try('attract.draw', () => this.attract.draw(ctx, r));
    }
    r.applyScreen(ctx);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this._try('background.drawFront', () => this.background.drawFront?.(ctx, r, focus));
    r.applyScreen(ctx);
    ctx.globalAlpha = 1;
    this._try('weather.draw', () => this.weather.draw?.(ctx, r));
    r.applyScreen(ctx);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (this.world && this.state !== 'title') this._post(ctx, r, focus);
    if (this.run && this.state !== 'title') {
      this._try('hud.draw', () => this.hud?.draw?.(ctx, r));
      r.applyScreen(ctx);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    this._try('input.drawOverlay', () => this.input?.drawOverlay?.(ctx, r));
  }

  /** Post effects in screen space: fog modifier, low-hull vignette, screen flash. */
  _post(ctx, r, focus) {
    const W = r.cssW;
    const H = r.cssH;
    const run = this.run;
    if (run?.mods?.fog) {
      const fx = focus?.x ?? W / 2;
      const fy = focus?.y ?? H / 2;
      const g = ctx.createRadialGradient(fx, fy, Math.min(W, H) * 0.14, fx, fy, Math.max(W, H) * 0.55);
      g.addColorStop(0, 'rgba(126,118,104,0.08)');
      g.addColorStop(0.45, 'rgba(122,114,100,0.62)');
      g.addColorStop(1, 'rgba(104,98,88,0.97)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    const p = this.world.players[0];
    if (p && p.alive && p.hp < p.stats.maxHp * 0.25) {
      const pulse = 0.3 + 0.2 * Math.sin(this.realTime * 5);
      const v = this._vignette(W, H);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (this.flashA > 0.01) {
      ctx.globalAlpha = this.flashA;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (this.ending && !this.ending.victory) {
      // Fade toward sepia on defeat.
      const k = clamp(this.ending.t / this.ending.dur, 0, 1);
      ctx.globalAlpha = 0.45 * k;
      ctx.fillStyle = '#2b1a0c';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  _vignette(W, H) {
    const key = `${W}x${H}`;
    if (this._vig?.key === key) return this._vig.g;
    const ctx = this.renderer.ctx;
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.55);
    g.addColorStop(0, 'rgba(160,20,10,0)');
    g.addColorStop(1, 'rgba(170,22,12,0.95)');
    this._vig = { key, g };
    return g;
  }

  _try(key, fn) {
    try {
      fn();
    } catch (err) {
      this._err(key, err);
    }
  }

  _err(key, err) {
    if (this._errors.has(key)) return;
    this._errors.add(key);
    console.error(`[game] ${key} failed`, err);
  }
}

