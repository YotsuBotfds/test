// Wave director (DESIGN §4.8). Drives a run through stages → waves → boss → refit →
// transition, plus Endless (generated waves, periodic bosses, biome cycling) and Boss Rush.
//
// States: intro → wave → breather → … → bossWarning → boss → bossDown → refit → transition →
// (next stage intro) … → victory. `run.director` mirrors the state for the HUD.

import { TAU } from '../core/math.js';
import { STAGES } from '../content/stages.js';
import { MODES } from '../content/modes.js';
import { ENEMIES } from '../content/enemies/index.js';
import { BOSSES } from '../content/bosses/index.js';

const INTRO_TIME = 3;
const BREATHER_TIME = 3;
const WARNING_TIME = 3;
const BOSS_DOWN_TIME = 3.6;
const TRANSITION_TIME = 3.5;
const LEFTOVER_GRACE = 25;

let waveToken = 1;

export class Director {
  /**
   * @param {any} game
   * @param {import('./world.js').World} world
   */
  constructor(game, world) {
    this.game = game;
    this.world = world;
    this.run = world.run;
    this.state = 'idle';
    this.t = 0;
    this.wave = null;
    this.waveIndex = 0;
    this.boss = null;
    this.bossId = null;
    this.mode = MODES[this.run.mode] || MODES.campaign || {};
    this.endless = !!(this.mode.endless || this.run.mode === 'endless');
    this.bossRush = this.run.mode === 'bossRush';
    this._warned = new Set();
    this._pts = [];
  }

  /** Begin the run. opts: {stage (0-based position), wave (0-based), boss (id)}. */
  start(opts = {}) {
    const run = this.run;
    if (this.endless) {
      run.endlessWave = Math.max(1, (opts.wave ?? 0) + 1);
      run.stageIndex = 0;
      this._setEndlessStage(run.endlessWave, true);
    } else if (this.bossRush) {
      run.stageIndex = Math.min(opts.stage ?? 0, this._bossList().length - 1);
      this._setBossRushStage(run.stageIndex, true);
    } else {
      run.stageIndex = Math.min(opts.stage ?? 0, run.stageOrder.length - 1);
      this._setStage(run.stageIndex, true);
    }
    if (opts.boss) {
      this._startBoss(opts.boss);
      return;
    }
    this.waveIndex = this.endless ? run.endlessWave - 1 : opts.wave ?? 0;
    this._enter('intro');
  }

  // ---- Stage setup -------------------------------------------------------------------------

  _stageDef(pos) {
    const idx = this.run.stageOrder[pos] ?? pos;
    return STAGES[idx] || STAGES[0];
  }

  _setStage(pos, first = false) {
    const run = this.run;
    const stage = this._stageDef(pos);
    run.stageIndex = pos;
    run.stage = stage;
    run.wave = 0;
    run.waveCount = stage.waves?.length || 0;
    run.stageReached = Math.max(run.stageReached || 0, pos + 1);
    this.game.onStageStart?.(stage, { first, index: pos });
    this.world.events.emit('stage:start', { run, stage, index: pos });
  }

  _bossList() {
    return this.mode.bosses || ['ironMatriarch', 'kraken', 'stormEngine', 'behemoth', 'sunFurnace'];
  }

  _setBossRushStage(i, first = false) {
    const run = this.run;
    const id = this._bossList()[i];
    const stage = STAGES.find((s) => s.boss === id) || STAGES[i % STAGES.length] || STAGES[0];
    run.stageIndex = i;
    run.stage = stage;
    run.wave = 0;
    run.waveCount = 0;
    run.bossHpMult = this.mode.bossHpMult?.(i, run) ?? 1;
    run.stageReached = Math.max(run.stageReached || 0, i + 1);
    this.game.onStageStart?.(stage, { first, index: i, bossRush: true });
    this.world.events.emit('stage:start', { run, stage, index: i });
  }

  _endlessStage(index) {
    const m = this.mode;
    const custom = m.stageFor?.(index, this.run);
    if (custom) return custom;
    const biome = m.biomeFor?.(index) ?? 'brassbay';
    const base = STAGES.find((s) => s.biome === biome || s.id === biome) || STAGES[0];
    const k = index - 1;
    return {
      ...base,
      hpMult: 1 + 0.16 * k + 0.004 * k * k,
      dmgMult: 1 + 0.035 * k,
      xpMult: 1 + 0.06 * k,
      eliteChance: Math.min(0.3, 0.02 + 0.006 * k),
      boss: null,
    };
  }

  _setEndlessStage(index, first = false) {
    const run = this.run;
    const stage = this._endlessStage(index);
    const changed = !run.stage || run.stage.biome !== stage.biome;
    run.stage = stage;
    run.waveCount = 0;
    if (changed || first) {
      this.game.onStageStart?.(stage, { first, index: run.stageIndex, endless: true });
      this.world.events.emit('stage:start', { run, stage, index: run.stageIndex });
    }
  }

  // ---- State machine -----------------------------------------------------------------------

  _enter(state) {
    this.state = state;
    this.t = 0;
    this.run.director = state;
    const w = this.world;
    const run = this.run;
    switch (state) {
      case 'intro':
        break;
      case 'breather':
        w.vacuumPickups();
        break;
      case 'bossWarning': {
        const id = this._pendingBoss();
        const def = BOSSES[id];
        w.announce('WARNING', def ? `${def.name || id} approaches` : 'Something huge approaches', {
          kind: 'warning',
          time: WARNING_TIME,
        });
        w.sfx('boss_warning');
        this.game.music?.(null, 2);
        // Leftover small fry scatter before the boss arrives.
        for (const e of w.enemies) if (e.alive && !e.isBoss && !e.parent) e.fleeing = true;
        break;
      }
      case 'bossDown':
        w.clearEnemyBullets(w.renderer.camera.x, w.renderer.camera.y, Infinity);
        for (const e of w.enemies) if (e.alive && !e.isBoss && !e.parent) e.fleeing = true;
        break;
      case 'victory':
        this.game.victory?.();
        break;
      case 'transition': {
        run.director = 'transition';
        break;
      }
      default:
        break;
    }
  }

  update(dt) {
    this.t += dt;
    const run = this.run;
    switch (this.state) {
      case 'intro':
        if (this.t >= (this._introTime ?? INTRO_TIME)) {
          this._introTime = null;
          if (this.bossRush) this._enter('bossWarning');
          else this._startWave(this.waveIndex);
        }
        break;
      case 'wave':
        this._updateWave(dt);
        break;
      case 'breather':
        if (this.t >= BREATHER_TIME) this._afterBreather();
        break;
      case 'bossWarning':
        if (this.t >= (this.bossRush ? 2 : WARNING_TIME)) this._startBoss(this._pendingBoss());
        break;
      case 'boss':
        if (!this.world.bosses.length) this._enter('bossDown');
        break;
      case 'bossDown':
        if (this.t >= BOSS_DOWN_TIME) this._afterBoss();
        break;
      case 'transition':
        if (this.t >= TRANSITION_TIME) this._afterTransition();
        break;
      default:
        break;
    }
    if (run) run.director = this.state;
  }

  _pendingBoss() {
    if (this.bossId) return this.bossId;
    const run = this.run;
    if (this.endless) return this.mode.bossFor?.(run.endlessWave) || 'ironMatriarch';
    if (this.bossRush) return this._bossList()[run.stageIndex];
    return run.stage?.boss || 'ironMatriarch';
  }

  _startBoss(id) {
    const w = this.world;
    const run = this.run;
    this.bossId = id;
    if (this.endless) {
      run.bossHpMult = this.mode.bossHpMult?.(run.endlessWave, run) ?? 1 + 0.35 * Math.floor((run.endlessWave - 1) / 5);
    }
    this.boss = w.spawnBoss(id);
    this._enter('boss');
    if (!this.boss) this._enter('bossDown');
  }

  _afterBoss() {
    const run = this.run;
    const w = this.world;
    this.bossId = null;
    this.boss = null;
    w.vacuumPickups();
    w.events.emit('stage:clear', { run, stage: run.stage, index: run.stageIndex });
    const last = this.endless
      ? false
      : this.bossRush
        ? run.stageIndex >= this._bossList().length - 1
        : run.stageIndex >= run.stageOrder.length - 1;
    if (last) {
      this._enter('victory');
      return;
    }
    w.sfx('stage_clear');
    w.announce(this.endless ? 'Boss Defeated' : 'Stage Clear', 'Refit at the floating dock', { kind: 'clear', time: 2.4 });
    this._enter('refit');
    this.game.beginRefit?.(() => this.afterRefit());
  }

  /** Called by the game when the refit choices are done. */
  afterRefit() {
    const run = this.run;
    this._enter('transition');
    if (this.endless) {
      run.endlessWave++;
      const next = this._endlessStage(run.endlessWave);
      this.game.onTransition?.(next, run.stageIndex + 1);
    } else if (this.bossRush) {
      const i = run.stageIndex + 1;
      const id = this._bossList()[i];
      const next = STAGES.find((s) => s.boss === id) || STAGES[i % STAGES.length];
      this.game.onTransition?.(next, i);
    } else {
      this.game.onTransition?.(this._stageDef(run.stageIndex + 1), run.stageIndex + 1);
    }
  }

  _afterTransition() {
    const run = this.run;
    this._introTime = 1.2;
    if (this.endless) {
      run.stageIndex++;
      this._setEndlessStage(run.endlessWave, false);
      this.waveIndex = run.endlessWave - 1;
    } else if (this.bossRush) {
      this._setBossRushStage(run.stageIndex + 1);
    } else {
      this._setStage(run.stageIndex + 1);
      this.waveIndex = 0;
    }
    this._enter('intro');
  }

  _afterBreather() {
    const run = this.run;
    if (this.endless) {
      run.endlessWave++;
      this._setEndlessStage(run.endlessWave);
      if (this.mode.bossFor?.(run.endlessWave)) {
        this._enter('bossWarning');
        return;
      }
      this._startWave(run.endlessWave - 1);
      return;
    }
    const next = this.waveIndex + 1;
    if (next < (run.stage.waves?.length || 0)) this._startWave(next);
    else this._enter('bossWarning');
  }

  // ---- Waves -------------------------------------------------------------------------------

  _waveDef(index) {
    const run = this.run;
    if (this.endless) {
      try {
        return this.mode.makeWave?.(index + 1, this.world.rng, run) || fallbackWave(index);
      } catch (err) {
        this.world.contentError('endless:makeWave', err);
        return fallbackWave(index);
      }
    }
    return run.stage.waves?.[index] || fallbackWave(index);
  }

  _startWave(index) {
    const run = this.run;
    const w = this.world;
    const def = this._waveDef(index);
    this.waveIndex = index;
    if (this.endless) {
      run.wave = run.endlessWave;
    } else {
      run.wave = index + 1;
    }
    const mods = run.mods;
    const spawnRate = mods.spawnRate ?? 1;
    this.wave = {
      def,
      token: waveToken++,
      t: 0,
      duration: def.duration ?? 40,
      maxAlive: Math.round((def.maxAlive ?? 45) * Math.min(1.5, spawnRate)),
      groups: (def.groups || []).map((g) => ({
        g,
        count: Math.max(1, Math.round((g.count ?? 1) * spawnRate)),
        spawned: 0,
        next: g.start ?? 0,
      })),
      trickleT: def.trickle ? (def.trickle.every ?? 3) / spawnRate : Infinity,
      fled: false,
    };
    this._enter('wave');
    const label = this.endless ? `Wave ${run.endlessWave}` : `Wave ${index + 1}`;
    const sub = def.name || (this.endless ? 'Endless Gale' : index + 1 === run.waveCount ? 'Final wave' : run.stage?.name || '');
    w.announce(label, sub, { kind: 'wave', time: 1.8 });
    w.sfx('wave_start');
    w.events.emit('wave:start', { run, wave: run.wave, index });
  }

  /**
   * Wave progress for the HUD: {t, duration, spawned, total, alive, frac} or null between waves.
   * frac blends time and kills so the bar fills smoothly and completes on wave clear.
   */
  get progress() {
    const W = this.wave;
    if (!W || this.state !== 'wave') return null;
    let spawned = 0;
    let total = 0;
    for (const G of W.groups) {
      spawned += G.spawned;
      total += G.count;
    }
    const alive = this.aliveInWave();
    const tf = Math.min(1, W.t / Math.max(1, W.duration));
    const kf = total ? Math.min(1, (spawned - alive) / total) : tf;
    return { t: W.t, duration: W.duration, spawned, total, alive, frac: Math.min(0.99, tf * 0.5 + kf * 0.5) };
  }

  /** Number of living (non-fleeing) enemies from the current wave. */
  aliveInWave() {
    const tok = this.wave?.token;
    let n = 0;
    for (const e of this.world.enemies) if (e.alive && e.wave === tok && !e.fleeing) n++;
    return n;
  }

  _updateWave(dt) {
    const W = this.wave;
    if (!W) return;
    const w = this.world;
    const run = this.run;
    W.t += dt;
    let alive = this.aliveInWave();
    let scheduleDone = true;
    for (const G of W.groups) {
      if (G.spawned >= G.count) continue;
      scheduleDone = false;
      if (W.t < G.next) continue;
      const batch = Math.min(G.g.batch ?? 1, G.count - G.spawned);
      if (alive + batch > W.maxAlive) {
        G.next = W.t + 0.5;
        continue;
      }
      const n = this._spawnGroup(G.g, batch, W.token);
      G.spawned += batch;
      alive += n;
      G.next += G.g.every ?? 1;
      if (G.next < W.t) G.next = W.t + (G.g.every ?? 1) * 0.5;
    }
    // Trickle.
    const tr = W.def.trickle;
    if (tr && W.t < W.duration) {
      W.trickleT -= dt;
      if (W.trickleT <= 0) {
        W.trickleT = (tr.every ?? 3) / (run.mods.spawnRate ?? 1);
        if (alive < W.maxAlive) {
          const type = this._pickTrickle(tr.pool);
          if (type) {
            this._spawnAt('edge', type, 1, W.token, false);
            alive++;
          }
        }
      }
    }
    if (W.t < W.duration) scheduleDone = false;
    if (scheduleDone && alive === 0) {
      this._waveClear();
      return;
    }
    if (W.t >= W.duration + LEFTOVER_GRACE && !W.fled) {
      W.fled = true;
      for (const e of w.enemies) if (e.alive && e.wave === W.token) e.fleeing = true;
      // Unspawned groups are abandoned.
      for (const G of W.groups) G.spawned = G.count;
    }
  }

  _pickTrickle(pool) {
    if (!pool) return null;
    const ok = {};
    let any = false;
    for (const k in pool) {
      if (ENEMIES[k]) {
        ok[k] = pool[k];
        any = true;
      } else if (!this._warned.has(k)) {
        this._warned.add(k);
        console.warn(`[director] trickle type "${k}" not registered (skipped)`);
      }
    }
    return any ? this.world.rng.weightedKey(ok) : null;
  }

  _waveClear() {
    const w = this.world;
    const run = this.run;
    w.events.emit('wave:clear', { run, wave: run.wave, index: this.waveIndex });
    const bonus = 100 * run.wave * (run.stageIndex + 1);
    run.score += bonus;
    w.sfx('wave_clear');
    w.announce('Wave Cleared', `+${bonus}`, { kind: 'clear', time: 1.6 });
    this.game.onWaveClear?.();
    this.wave = null;
    this._enter('breather');
  }

  // ---- Formations --------------------------------------------------------------------------

  _spawnGroup(g, n, token) {
    const forceElite = g.elite === true || typeof g.elite === 'string' ? g.elite : null;
    return this._spawnAt(g.formation || 'edge', g.type, n, token, forceElite, g);
  }

  /**
   * Spawn n enemies of `type` in a formation around a random living player.
   * @returns {number} spawned
   */
  _spawnAt(formation, type, n, token, forceElite, g) {
    const w = this.world;
    const run = this.run;
    const rng = w.rng;
    const def = ENEMIES[type];
    const r = def?.r ?? 20;
    const target = w.randomPlayer() || w.players[0];
    if (!target) return 0;
    const pts = this.formation(formation, n, r, target);
    const chance = (run.stage?.eliteChance ?? 0) + (run.mods.eliteChance ?? 0);
    const made = [];
    for (let i = 0; i < pts.length; i++) {
      const pt = pts[i];
      let elite = forceElite;
      if (!elite && !def?.noElite && rng.next() < chance) elite = true;
      const e = w.spawnEnemy(type, pt.x, pt.y, {
        wave: token,
        elite,
        angle: Math.atan2(target.y - pt.y, target.x - pt.x),
        data: g?.data,
      });
      made.push(e);
    }
    if (formation === 'pair') {
      for (let i = 0; i + 1 < made.length; i += 2) {
        made[i].partner = made[i + 1];
        made[i + 1].partner = made[i];
        made[i].data.partner = made[i + 1];
        made[i + 1].data.partner = made[i];
      }
    }
    return made.length;
  }

  /**
   * Formation points (all just outside the view). Public for content/debug use.
   * formation: edge | ring | line | cluster | flank | pair | front | behind
   */
  formation(formation, n, r, target) {
    const w = this.world;
    const rng = w.rng;
    const pts = [];
    const margin = 50 + r;
    const heading = Math.hypot(target.vx, target.vy) > 40 ? Math.atan2(target.vy, target.vx) : rng.angle();
    switch (formation) {
      case 'ring': {
        const v = w.viewRect(0);
        const rad = Math.hypot(v.w, v.h) / 2 + margin * 0.5;
        const off = rng.angle();
        for (let i = 0; i < n; i++) {
          const a = off + (i / n) * TAU;
          pts.push({ x: target.x + Math.cos(a) * rad, y: target.y + Math.sin(a) * rad });
        }
        break;
      }
      case 'line': {
        const a = rng.angle();
        const c = w.offscreenPoint(margin, a);
        const px = -Math.sin(a);
        const py = Math.cos(a);
        const gap = Math.max(48, r * 2.4);
        for (let i = 0; i < n; i++) {
          const o = (i - (n - 1) / 2) * gap;
          pts.push({ x: c.x + px * o, y: c.y + py * o });
        }
        break;
      }
      case 'cluster':
      case 'front':
      case 'behind': {
        const a = formation === 'front' ? heading + (rng.next() - 0.5) * 0.6 : formation === 'behind' ? heading + Math.PI : rng.angle();
        const c = w.offscreenPoint(margin + 30, a);
        const spread = 20 + Math.sqrt(n) * r * 0.9;
        for (let i = 0; i < n; i++) {
          const aa = rng.angle();
          const d = Math.sqrt(rng.next()) * spread;
          pts.push({ x: c.x + Math.cos(aa) * d + Math.cos(a) * d * 0.5, y: c.y + Math.sin(aa) * d + Math.sin(a) * d * 0.5 });
        }
        break;
      }
      case 'flank': {
        const sides = [heading + Math.PI / 2, heading - Math.PI / 2];
        for (let i = 0; i < n; i++) {
          const a = sides[i % 2];
          const c = w.offscreenPoint(margin, a + (rng.next() - 0.5) * 0.3);
          const k = Math.floor(i / 2);
          pts.push({ x: c.x + Math.cos(a) * k * r * 1.2 + (rng.next() - 0.5) * 40, y: c.y + Math.sin(a) * k * r * 1.2 + (rng.next() - 0.5) * 40 });
        }
        break;
      }
      case 'pair': {
        for (let i = 0; i < n; i += 2) {
          const a = rng.angle();
          const c = w.offscreenPoint(margin, a);
          const px = -Math.sin(a) * 75;
          const py = Math.cos(a) * 75;
          pts.push({ x: c.x - px, y: c.y - py });
          if (i + 1 < n) pts.push({ x: c.x + px, y: c.y + py });
        }
        break;
      }
      case 'edge':
      default: {
        for (let i = 0; i < n; i++) {
          // Bias spawns ahead of travel so the fight comes to you.
          const a = rng.next() < 0.45 ? heading + (rng.next() - 0.5) * 2 : rng.angle();
          const p = w.offscreenPoint(margin, a);
          pts.push(p);
        }
      }
    }
    return pts;
  }

  // ---- Debug / external control ------------------------------------------------------------

  /** Jump straight to a boss fight. */
  forceBoss(id) {
    for (const e of this.world.enemies) if (e.alive && !e.isBoss && !e.parent) e.fleeing = true;
    this.wave = null;
    this._startBoss(id || this._pendingBoss());
  }

  /** Jump to stage position `pos` (0-based) at wave 0. */
  gotoStage(pos) {
    const w = this.world;
    for (const e of [...w.enemies]) w.removeEnemy(e);
    w.clearEnemyBullets(0, 0, Infinity);
    this.wave = null;
    if (this.endless) {
      this.run.endlessWave = pos * 5 + 1;
      this._setEndlessStage(this.run.endlessWave, true);
      this.waveIndex = this.run.endlessWave - 1;
    } else if (this.bossRush) this._setBossRushStage(Math.min(pos, this._bossList().length - 1), true);
    else {
      this._setStage(Math.min(pos, this.run.stageOrder.length - 1), true);
      this.waveIndex = 0;
    }
    this._introTime = 1;
    this._enter('intro');
  }

  /** Start wave `index` (0-based) of the current stage. */
  gotoWave(index) {
    for (const e of this.world.enemies) if (e.alive && !e.isBoss && !e.parent) e.fleeing = true;
    if (this.endless) this.run.endlessWave = index + 1;
    this._startWave(index);
  }

  /** End the current wave now (debug). */
  skipWave() {
    if (this.state !== 'wave') return;
    for (const e of this.world.enemies) if (e.alive && e.wave === this.wave?.token) e.fleeing = true;
    this._waveClear();
  }
}

function fallbackWave(index) {
  return {
    duration: 30,
    maxAlive: 40,
    groups: [{ type: 'gyroScout', count: 8 + index * 2, start: 0, every: 1.2, batch: 2, formation: 'edge' }],
    trickle: { pool: { gyroScout: 3 }, every: 3 },
  };
}
