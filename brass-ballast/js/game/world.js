// The World (DESIGN §4.3): every live entity plus the API that content code talks to.
// Update order and render order follow DESIGN §4.2. See docs/ENGINE.md for the cheat-sheet.

import { Save } from '../core/storage.js';
import { SHADOW_OFFSET, BURN_HEAT_TAU } from '../config.js';
import { TAU, angleDiff, clamp } from '../core/math.js';
import { RNG } from '../core/rng.js';
import { SpatialHash } from '../core/spatial.js';
import { ENEMIES } from '../content/enemies/index.js';
import { BOSSES } from '../content/bosses/index.js';
import { ProjectileSystem } from './projectiles.js';
import { PickupSystem } from './pickups.js';
import { HazardSystem } from './hazards.js';
import { Player } from './player.js';
import {
  createEnemy,
  resolveDef,
  updateEnemies,
  drawEnemies,
  drawEnemyShadows,
  drawWrecks,
  updateWrecks,
  drawEnemySprite,
  addWreck,
} from './enemies.js';

const NO_INFO = Object.freeze({});
const NO_FOCUS = Object.freeze([]);
const RINGLESS = Object.freeze({ rings: false });
/**
 * Small blasts (explosive rounds, flak) fire many times a second with a big build: no debris
 * or embers, which were most of their particles (and their overdraw) while adding little.
 */
const SMALL_BLAST = Object.freeze({ debris: false, embers: false, lowSmoke: false });
const SIZE_FX = { small: 0.05, medium: 0.15, large: 0.35, huge: 0.6 };
/** Armory Crates are a treat, not a flood (balance pass): a set-piece (forced) elite drops one
 *  CRATE_FORCED of the time, a randomly rolled elite CRATE_RANDOM (Elite Hunt raises it); each
 *  crate already found this stage (run.stageCrates; an Endless leg counts as a stage) scales the
 *  chance by CRATE_DECAY, and a wave gives at most CRATE_CAP (run.waveCrates, reset by the
 *  director at wave start). */
const CRATE_FORCED = 0.45;
const CRATE_RANDOM = 0.1;
const CRATE_DECAY = 0.6;
const CRATE_CAP = 1;
const CHAIN_CALLOUTS = {
  10: 'Hot Barrels!', 25: 'Brass Fury!', 50: 'Terror of the Skies!', 100: 'Legend of the Clouds!',
  200: 'The Syndicate Trembles!',
};

export class World {
  /**
   * @param {any} game
   * @param {{run:any, seed?:number}} opts
   */
  constructor(game, opts = {}) {
    this.game = game;
    this.run = opts.run || null;
    this.rng = new RNG(opts.seed ?? this.run?.seed ?? undefined);
    this.events = game.events;
    this.fx = game.fx;
    this.particles = game.particles;
    this.renderer = game.renderer;
    this.weather = game.weather;
    this.input = game.input;
    this.audio = game.audio;
    this.director = null;
    this.time = 0;
    this.dt = 0;

    /** @type {Player[]} */
    this.players = [];
    this.enemies = [];
    this.bosses = [];
    this.pBullets = [];
    this.eBullets = [];
    this.pickups = [];
    this.hazards = [];
    this.wrecks = [];
    this.timers = [];

    this.spatial = new SpatialHash(128);
    this.projectiles = new ProjectileSystem(this);
    this.pickupSys = new PickupSystem(this);
    this.hazardSys = new HazardSystem(this);

    // Reused info objects for hot paths (copy them if you need to keep one).
    this._hitInfo = { source: '', crit: false, knockback: 0, angle: 0, owner: null, element: 'kinetic' };
    this._pHitInfo = { source: 'bullet', owner: null, angle: 0, element: 'kinetic', scaled: true };
    this._contactInfo = { source: 'contact', owner: null, angle: 0, scaled: true };
    this._burnInfo = { source: 'burn', element: 'fire', owner: null, small: true, noCombo: false };
    this._drawView = { x0: 0, y0: 0, x1: 0, y1: 0, w: 0, h: 0 };
    this._vr = { x0: 0, y0: 0, x1: 0, y1: 0, w: 0, h: 0 };
    this._wind = { x: 0, y: 0 };
    this._q = [];
    this._sfxOpts = { vol: 1, pitch: 1, x: 0, y: 0 };
    this._warnedTypes = new Set();
    this._errors = new Set();
    /** Run-owned sound loops: key → {h, step, vol} (see loopSfx). */
    this._loops = new Map();
    this._step = 0;
    this._loopsMuted = false;
  }

  // ---- Players -------------------------------------------------------------------------------

  /** Create and add a player. opts: {hull, weapon, x, y}. */
  addPlayer(opts = {}) {
    const index = this.players.length;
    const p = new Player(this, index, opts);
    this.players.push(p);
    return p;
  }

  alivePlayerCount() {
    let n = 0;
    for (let i = 0; i < this.players.length; i++) if (this.players[i].alive) n++;
    return n;
  }

  /** Nearest living player (optionally within maxDist). */
  nearestPlayer(x, y, maxDist = Infinity) {
    let best = null;
    let bd = maxDist * maxDist;
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (!p.alive) continue;
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  /** A random living player (seeded). */
  randomPlayer() {
    const n = this.alivePlayerCount();
    if (!n) return null;
    let k = (this.rng.next() * n) | 0;
    for (const p of this.players) if (p.alive && k-- === 0) return p;
    return null;
  }

  /** Heal a player; shows a green number. Returns hp gained. */
  healPlayer(p, amount) {
    if (!p || !p.alive || !(amount > 0)) return 0;
    const gained = Math.min(p.stats.maxHp - p.hp, amount);
    p.hp += gained;
    if (gained >= 1) {
      this.floatText(p.x, p.y - 34, `+${Math.round(gained)}`, { color: '#7dff8a', size: 16 });
      if (this.fx.heal) this.fx.heal(p.x, p.y, 1);
      else this.fx.sparks?.(p.x, p.y, -Math.PI / 2, 6, '#9dff9a', TAU);
    }
    return gained;
  }

  /**
   * Damage a player. Respects i-frames, god mode, aether shield, armor, mods.
   * `amount` is a BASE number, scaled like fire/addHazard/explode: × (info.dmgMult ??
   * info.owner.dmgMult) when the owner is an enemy. Engine paths that already scaled
   * (projectiles, hazards, explosions, contact) pass `info.scaled = true`.
   * @returns {boolean} true when the hit was consumed (damage dealt or shield popped)
   */
  damagePlayer(p, amount, info = NO_INFO) {
    if (!p || !p.alive || p.god) return false;
    if (!info.scaled) {
      const o = info.owner;
      amount *= info.dmgMult ?? (o && o.team === 'enemy' ? (o.dmgMult ?? 1) : 1);
    }
    if (p.iframes > 0 && !info.ignoreIframes) return false;
    if (p.shieldReady) {
      p.shieldReady = false;
      p.shieldT = 0;
      p.iframes = 0.5;
      this.sfx('shield_block', p.x, p.y);
      this.fx.shockwave?.(p.x, p.y, 90, '#7ff3ff', 0.35);
      this.floatText(p.x, p.y - 40, 'Blocked!', { color: '#7ff3ff', size: 15 });
      return true;
    }
    const run = this.run;
    let dmg = amount * (run?.mods?.playerDmgTaken ?? 1) - p.stats.armor;
    dmg = Math.max(1, dmg);
    p.hp -= dmg;
    p.iframes = 0.6;
    p.flash = 1;
    p.lastHitT = this.time;
    if (run) {
      run.damageTaken += dmg;
      run.chain = 0;
      run.combo = 1;
      run.comboTimer = 0;
    }
    this.shake(0.3 + Math.min(0.4, dmg / 50));
    this.hitstop(0.1);
    this.flash('#ff3b2a', 0.16);
    this.sfx('player_hit', p.x, p.y);
    this.input?.vibrate?.(0.6, 180, p.index);
    const a = info.angle ?? 0;
    this.fx.sparks?.(p.x, p.y, a + Math.PI, 10, '#ffd36b', 1.6);
    this.fx.debris?.(p.x, p.y, 3, 'wood');
    this.floatText(p.x, p.y - 30, `-${Math.round(dmg)}`, { color: '#ff5b4a', size: 18 });
    this.events.emit('player:hit', { player: p, amount: dmg, info });
    try {
      p.onHurt(dmg, info);
    } catch (err) {
      this.contentError('player:onHurt', err);
    }
    if (p.hp <= 0) this.playerDown(p);
    return true;
  }

  /** Player at 0 hull: emergency balloon revive, else wreck. */
  playerDown(p) {
    if (!p.alive) return;
    if (p.revivesLeft > 0) {
      p.revivesLeft--;
      this.revivePlayer(p, 0.3, 'Emergency Balloon!');
      return;
    }
    p.alive = false;
    p.hp = 0;
    p.deadT = 0;
    p.boostT = 0;
    this.fx.bigExplosion?.(p.x, p.y, 1.3);
    this.fx.debris?.(p.x, p.y, 14, 'wood');
    this.fx.cogs?.(p.x, p.y, 10);
    this.sfx('explode_large', p.x, p.y);
    this.shake(1);
    this.hitstop(0.15);
    this.flash('#ff6a3d', 0.3);
    this.input?.vibrate?.(1, 400, p.index);
    this.events.emit('player:dead', { player: p });
    if (this.alivePlayerCount() === 0) this.game?.onAllPlayersDown?.();
  }

  /** Bring a player back with `frac` of max hull. */
  revivePlayer(p, frac = 0.4, text = 'Back in the fight!') {
    p.alive = true;
    p.deadT = 0;
    p.hp = Math.max(1, p.stats.maxHp * frac);
    p.iframes = 2.5;
    p.steam = p.stats.steamMax;
    this.clearEnemyBullets(p.x, p.y, 320);
    this.fx.shockwave?.(p.x, p.y, 220, '#ffe08a', 0.6);
    this.fx.flare?.(p.x, p.y, 120, '#fff3c4');
    this.floatText(p.x, p.y - 44, text, { color: '#ffe08a', size: 18, life: 1.4 });
    this.sfx('revive', p.x, p.y);
    this.events.emit('player:revive', { player: p });
  }

  // ---- Enemies -------------------------------------------------------------------------------

  /**
   * Spawn an enemy by id (ENEMIES / BOSSES) or from an inline def.
   * opts: {elite, hp, rawHp, hpMult, angle, vx, vy, parent, data, noDrops, wave, boss, invuln,
   *        untargetable, scale, sprite, layer, alt, xp, cogs, dmgMult, speedMult, fireRateMult}
   */
  spawnEnemy(typeOrDef, x, y, opts = NO_INFO) {
    const def = resolveDef(this, typeOrDef, ENEMIES, BOSSES);
    const e = createEnemy(this, def, x, y, opts);
    this.enemies.push(e);
    if (e.isBoss) this.bosses.push(e);
    if (def.init) {
      try {
        def.init(e, this);
      } catch (err) {
        this.contentError(`enemy:${e.type}:init`, err);
      }
    }
    this.events.emit('enemy:spawn', { enemy: e });
    return e;
  }

  /**
   * Spawn a boss from BOSSES (intro banner, music, zoom punch, events).
   * Default position: just above the top edge of the view.
   */
  spawnBoss(id, opts = {}) {
    const def = typeof id === 'string' ? BOSSES[id] : id;
    if (!def) {
      console.warn(`[world] unknown boss "${id}"`);
      return null;
    }
    const v = this.viewRect(0);
    const x = opts.x ?? (v.x0 + v.x1) / 2;
    const y = opts.y ?? v.y0 - (def.r ?? 80) - 60;
    const e = this.spawnEnemy(def, x, y, { ...opts, boss: true });
    if (this.game?.music) this.game.music(def.music || 'boss', 1.2);
    else this.audio?.music?.(def.music || 'boss', { fade: 1.2 });
    this.zoomPunch(0.12);
    this.shake(0.35);
    this.announce(def.name || def.id, def.title || '', { kind: 'boss', time: 3.2 });
    this.sfx('boss_roar', x, y);
    if (def.intro) {
      try {
        def.intro(e, this);
      } catch (err) {
        this.contentError(`boss:${def.id}:intro`, err);
      }
    }
    this.game?.onBossSpawn?.(e);
    this.events.emit('boss:spawn', { boss: e, id: def.id });
    return e;
  }

  /** Announce a boss phase change (event, sfx, shake, optional banner text). */
  bossPhase(boss, phase, opts = {}) {
    if (!boss || boss.phase === phase) return;
    boss.phase = phase;
    this.sfx('boss_phase', boss.x, boss.y);
    this.shake(0.45);
    this.zoomPunch(0.06);
    if (opts.text) this.announce(opts.text, opts.sub || '', { kind: 'warning', time: 1.8 });
    this.events.emit('boss:phase', { boss, id: boss.type, phase });
  }

  /**
   * Damage an enemy. Handles shareDamage parts, invuln, armored elites, dmgTakenMult,
   * def.modifyDamage, knockback, numbers, sfx, events, def.onHit and death.
   * @returns {number} damage actually dealt
   */
  damageEnemy(e, amount, info = NO_INFO) {
    if (!e || !e.alive || !(amount > 0)) return 0;
    const def = e.def;
    if (e.invuln) {
      e.flash = Math.max(e.flash, 0.35);
      if (!info.silent && this.rng.next() < 0.3) {
        this.sfx('hit_armor', e.x, e.y, { vol: 0.5 });
        this.fx.sparks?.(info.x ?? e.x, info.y ?? e.y, (info.angle ?? 0) + Math.PI, 3, '#cfd6de', 1);
      }
      return 0;
    }
    if (def.shareDamage && e.parent) {
      e.flash = 1;
      const parent = e.parent;
      if (def.shareDamage === true) {
        if (!parent.alive) return 0;
        return this.damageEnemy(parent, amount * e.dmgTakenMult * e.vulnMult, info);
      }
      if (parent.alive) this.damageEnemy(parent, amount * def.shareDamage, { ...info, silent: true });
    }
    // dmgTakenMult belongs to the enemy's own logic (weak points…); vulnMult to player debuffs.
    let amt = amount * e.dmgTakenMult * e.vulnMult;
    let armored = false;
    if (e.elite === 'armored' && e.hp > e.maxHp * 0.5) {
      amt *= 0.5;
      armored = true;
    }
    if (def.modifyDamage) {
      try {
        const m = def.modifyDamage(e, amt, info, this);
        if (typeof m === 'number') amt = m;
      } catch (err) {
        this.contentError(`enemy:${e.type}:modifyDamage`, err);
      }
    }
    if (!(amt > 0)) return 0;
    const dealt = Math.min(amt, e.hp);
    e.hp -= amt;
    // Big hulls flash softer so sustained fire doesn't bleach them white.
    e.flash = e.isBoss || e.r > 40 ? Math.max(e.flash, 0.5) : 1;
    if (info.knockback && !e.isBoss && !e.parent && !def.noKnockback) {
      const kb = (info.knockback * (info.owner?.stats?.knockback ?? 1)) / Math.max(0.2, e.mass);
      const a = info.angle ?? 0;
      e.kbx += Math.cos(a) * kb;
      e.kby += Math.sin(a) * kb;
    }
    const run = this.run;
    if (run && (!info.owner || info.owner.isPlayer)) run.damageDealt += dealt;
    if (!info.silent) {
      this._damageNumber(e, amt, info);
      if (armored && this.rng.next() < 0.4) this.sfx('hit_armor', e.x, e.y, { vol: 0.5 });
      else this.sfx(info.crit ? 'hit_crit' : 'hit', e.x, e.y, { vol: info.small ? 0.25 : 0.5 });
    }
    this.events.emit('enemy:hit', { enemy: e, amount: dealt, crit: !!info.crit, info });
    if (def.onHit) {
      try {
        def.onHit(e, dealt, info, this);
      } catch (err) {
        this.contentError(`enemy:${e.type}:onHit`, err);
      }
    }
    if (e.hp <= 0 && e.alive) this.killEnemy(e, info);
    return dealt;
  }

  _damageNumber(e, amt, info) {
    if (Save.settings.damageNumbers === false) return;
    e._numAcc = (e._numAcc || 0) + amt;
    const now = this.time;
    const due = info.crit || e.hp <= 0 || now - (e._numT ?? -1) >= 0.09;
    if (!due) return;
    const v = e._numAcc;
    e._numAcc = 0;
    e._numT = now;
    const n = v >= 1 ? Math.round(v) : Math.round(v * 10) / 10;
    if (n <= 0) return;
    const ox = (this.rng.next() - 0.5) * e.r;
    const color = info.crit ? '#ffcf4a' : info.element === 'fire' ? '#ff9b4a' : info.element === 'shock' ? '#9ff3ff' : '#fff3df';
    this.fx.text?.(e.x + ox, e.y - e.r * 0.6, String(n), {
      color,
      size: info.crit ? 22 : info.small ? 11 : 14 + Math.min(6, v / 20),
      crit: !!info.crit,
      life: info.crit ? 0.9 : 0.65,
    });
  }

  /** Kill an enemy: hooks, drops, fx, combo/score, codex, events. */
  killEnemy(e, info = NO_INFO) {
    if (!e || !e.alive) return;
    e.alive = false;
    e.dead = true;
    if (e.hp > 0) e.hp = 0;
    const def = e.def;
    const run = this.run;
    if (def.onDeath) {
      try {
        def.onDeath(e, this, info);
      } catch (err) {
        this.contentError(`enemy:${e.type}:onDeath`, err);
      }
    }
    const isMainBoss = e.isBoss && !e.parent;
    // Parts die with their parent (no drops).
    if (e.parts) {
      for (const part of e.parts) {
        if (!part.alive) continue;
        part.noDrops = true;
        this.killEnemy(part, { source: 'parent', quiet: true });
        if (isMainBoss) addWreck(this, part, 2.4);
      }
    }
    if (isMainBoss) this._bossDeath(e);
    else if (!info.quiet) this._deathFx(e);
    if (!e.noDrops && !info.noDrops && !isMainBoss) this.dropLoot(e);

    const counts = !e.parent && !def.noScore;
    if (run && counts) {
      run.kills++;
      if (e.elite) run.elitesKilled++;
      if (!info.noCombo) {
        run.chain++;
        run.comboTimer = 2.5;
        run.combo = Math.min(5, 1 + 0.1 * run.chain);
        if (run.chain > run.bestCombo) run.bestCombo = run.chain;
        if (run.chain >= 5 && run.chain % 5 === 0) this.events.emit('combo', { value: run.combo, chain: run.chain });
        const callout = CHAIN_CALLOUTS[run.chain];
        if (callout) {
          const p = info.owner?.isPlayer ? info.owner : this.players[0];
          if (p) this.floatText(p.x, p.y - 64, `${callout} ×${run.chain}`, { color: '#ffcf4a', size: 22, life: 1.4, crit: true });
          this.sfx('upgrade_pick', p?.x, p?.y, { pitch: 1.3, vol: 0.6 });
        }
      }
      run.score += Math.round(e.score * run.combo);
      const kb = (run.killsByType ||= {});
      if (!kb[e.type]) Save.discover(isMainBoss ? 'bosses' : 'enemies', e.type);
      kb[e.type] = (kb[e.type] || 0) + 1;
      if (info.owner?.isPlayer) info.owner.kills++;
    } else if (run && e.parent && !info.quiet && def.score) {
      run.score += Math.round(def.score * run.combo); // destructible boss parts
    }
    const volatile = e.elite === 'volatile' || def.volatile || (run?.mods?.volatileAll && !e.isBoss && !e.parent);
    if (volatile) {
      const big = e.elite === 'volatile' || def.volatile;
      this.warnExplode(e.x, e.y, big ? 90 : Math.max(60, e.r * 2.4), big ? 22 : 14, big ? 0.45 : 0.55, {
        team: 'enemy',
        owner: e,
        visual: 'medium',
      });
    }
    this.events.emit('enemy:killed', { enemy: e, info, player: info.owner?.isPlayer ? info.owner : null });
    if (isMainBoss) {
      const i = this.bosses.indexOf(e);
      if (i >= 0) this.bosses.splice(i, 1);
      if (run) run.bossKills++;
      this.game?.onBossKilled?.(e);
      this.events.emit('boss:killed', { boss: e, id: e.type });
    }
  }

  /** Remove an enemy silently (no drops, no events). */
  removeEnemy(e) {
    if (!e) return;
    e.alive = false;
    e.dead = true;
    if (e.parts) for (const p of e.parts) if (p.alive) this.removeEnemy(p);
    const i = this.bosses.indexOf(e);
    if (i >= 0) this.bosses.splice(i, 1);
  }

  _deathFx(e) {
    const r = e.r * e.scale;
    const x = e.x;
    const y = e.y;
    const fx = this.fx;
    if (r < 22) {
      fx.explosion?.(x, y, 0.55 + r / 32);
      fx.debris?.(x, y, 3, 'metal');
      this.sfx('explode_small', x, y);
      this.shake(0.06, true);
    } else if (r < 36) {
      fx.explosion?.(x, y, r / 22);
      fx.debris?.(x, y, 6, 'metal');
      fx.cogs?.(x, y, 3);
      this.sfx('explode_medium', x, y);
      this.shake(0.16, true);
      this.hitstop(0.03);
    } else {
      fx.bigExplosion?.(x, y, r / 42);
      fx.shockwave?.(x, y, r * 3, '#ffcf8a', 0.45);
      fx.debris?.(x, y, 10, 'metal');
      fx.cogs?.(x, y, 6);
      this.sfx('explode_large', x, y);
      this.shake(0.32);
      this.hitstop(0.06);
      addWreck(this, e, 0.9);
    }
    if (e.elite) {
      fx.flare?.(x, y, 90, '#ffe08a');
      this.hitstop(0.05);
    }
  }

  _bossDeath(e) {
    const def = e.def;
    this.slowmo(0.3, 1.6);
    this.zoomPunch(0.18);
    this.shake(0.9);
    this.flash('#fff3c4', 0.5);
    this.hitstop(0.12);
    this.sfx('boss_death', e.x, e.y);
    // Keep the camera on the wreck until the final blast (t 2.25) has played out.
    this.game?.camera?.holdFocus?.(e, this.time + 2.6);
    addWreck(this, e, 2.4);
    const r = e.r * e.scale;
    for (let i = 0; i < 12; i++) {
      this.after(0.12 + i * 0.17, () => {
        const a = this.rng.angle();
        const d = this.rng.next() * r * 0.9;
        const x = e.x + Math.cos(a) * d;
        const y = e.y + Math.sin(a) * d;
        this.fx.explosion?.(x, y, 1 + this.rng.next());
        this.fx.debris?.(x, y, 4, 'metal');
        this.sfx('explode_medium', x, y, { vol: 0.8 });
        this.shake(0.22);
      });
    }
    this.after(2.25, () => {
      const x = e.x;
      const y = e.y;
      this.fx.bigExplosion?.(x, y, 2.6);
      this.fx.shockwave?.(x, y, 480, '#fff3c4', 0.8);
      this.fx.cogs?.(x, y, 30);
      this.fx.debris?.(x, y, 24, 'metal');
      this.sfx('explode_huge', x, y);
      this.shake(1);
      this.flash('#fff8e0', 0.6);
      this.zoomPunch(-0.1);
      if (e.noDrops) return;
      const run = this.run;
      const mods = run?.mods || {};
      const cogs = (def.cogs ?? 40) * (mods.cogs ?? 1) * Math.max(1, run?.bossHpMult ?? 1);
      let n = Math.round(cogs);
      let pieces = 0;
      while (n > 0 && pieces < 60) {
        const v = n >= 10 ? 10 : 1;
        this.pickupSys.spawn('cog', x, y, v, { speed: 150 + this.rng.next() * 380, delay: 0.6 });
        n -= v;
        pieces++;
      }
      this.spawnXp(x, y, (def.xp ?? 50) * (run?.stage?.xpMult ?? 1) * (mods.xp ?? 1), 300);
      this.dropPickup('repair', x - 30, y);
      this.dropPickup('repair', x + 30, y);
      this.dropPickup('bomb', x, y + 30);
    });
  }

  /** Standard loot for a regular enemy. */
  dropLoot(e) {
    const run = this.run;
    const mods = run?.mods || {};
    const stage = run?.stage || {};
    const x = e.x;
    const y = e.y;
    const rng = this.rng;
    this.spawnXp(x, y, e.xp * (stage.xpMult ?? 1) * (mods.xp ?? 1));
    const c = e.cogs * (mods.cogs ?? 1);
    let n = Math.floor(c) + (rng.next() < c - Math.floor(c) ? 1 : 0);
    while (n > 0) {
      const v = n >= 10 ? 10 : 1;
      this.pickupSys.spawn('cog', x, y, v);
      n -= v;
    }
    const lowHp = this.players.some((p) => p.alive && p.hp < p.stats.maxHp * 0.35);
    if (rng.next() < (e.elite ? 0.08 : 0.012) * (lowHp ? 2 : 1)) this.dropPickup('repair', x, y);
    if (rng.next() < (e.elite ? 0.06 : 0.012)) this.dropPickup('steam', x, y);
    if (rng.next() < (e.elite ? 0.05 : 0.006) * (mods.bombDrops ?? 1)) this.dropPickup('bomb', x, y);
    if (e.elite && run) {
      const hunt = (mods.eliteChance ?? 0) > 0;
      const cap = CRATE_CAP + (hunt ? 1 : 0);
      if (run.crateStage !== run.stageIndex) {
        run.crateStage = run.stageIndex;
        run.stageCrates = 0;
      }
      const p = (e.forcedElite ? CRATE_FORCED : CRATE_RANDOM * (hunt ? 2 : 1)) * CRATE_DECAY ** run.stageCrates;
      if ((run.waveCrates ?? 0) < cap && rng.next() < p) {
        run.waveCrates = (run.waveCrates ?? 0) + 1;
        run.stageCrates++;
        this.dropPickup('crate', x, y);
      }
    }
  }

  /** Scatter `total` XP as shards (25 / 5 / remainder). */
  spawnXp(x, y, total, speed) {
    let v = total;
    let pieces = 0;
    const opts = speed ? { speed: speed * (0.4 + this.rng.next() * 0.8) } : undefined;
    while (v >= 25 && pieces < 16) {
      this.pickupSys.spawn('xp', x, y, 25, opts);
      v -= 25;
      pieces++;
    }
    while (v >= 5 && pieces < 24) {
      this.pickupSys.spawn('xp', x, y, 5, opts);
      v -= 5;
      pieces++;
    }
    while (v >= 1 && pieces < 30) {
      this.pickupSys.spawn('xp', x, y, 1, opts);
      v -= 1;
      pieces++;
    }
    if (v > 0.05) this.pickupSys.spawn('xp', x, y, v, opts);
  }

  /** Spawn a pickup. type: xp | cog | repair | steam | bomb | crate. */
  dropPickup(type, x, y, value = 1, opts) {
    return this.pickupSys.spawn(type, x, y, value, opts);
  }

  /** Fly XP & cogs (or everything) to players. */
  vacuumPickups(all = false) {
    this.pickupSys.vacuum(all);
  }

  /** Burn: {dps, t}; refreshes duration, keeps the stronger dps. */
  applyBurn(e, dps, time = 3, owner = null, heat = 0) {
    if (!e?.alive || e.def.immune?.burn) return;
    if (!e.burn) e.burn = { dps, t: time, tick: 0.3, owner, heat: 0 };
    else {
      e.burn.dps = Math.max(e.burn.dps, dps);
      e.burn.t = Math.max(e.burn.t, time);
      if (owner) e.burn.owner = owner;
    }
    // Stacking part (Incendiary Shells): `heat` total damage, burned off with BURN_HEAT_TAU decay,
    // so every ignition counts — the bonus scales with hit size and fire rate.
    if (heat > 0) e.burn.heat = (e.burn.heat || 0) + heat / BURN_HEAT_TAU;
  }

  /** Slow: fraction of velocity removed (bosses take half). */
  applySlow(e, amt, time = 1.5) {
    if (!e?.alive || e.def.immune?.slow) return;
    const a = clamp(e.isBoss || e.parent ? amt * 0.5 : amt, 0, 0.8);
    if (!e.slow) e.slow = { amt: a, t: time };
    else {
      e.slow.amt = Math.max(e.slow.amt, a);
      e.slow.t = Math.max(e.slow.t, time);
    }
  }

  /** Nearest targetable enemy, optionally within maxDist and passing filter(e). */
  nearestEnemy(x, y, maxDist = Infinity, filter) {
    let best = null;
    let bd = maxDist * maxDist;
    if (maxDist <= 600) {
      const q = this._q;
      q.length = 0;
      this.spatial.query(x, y, maxDist, q);
      for (let i = 0; i < q.length; i++) {
        const e = q[i];
        if (!e.alive || e.untargetable || e.phased || e.fleeing) continue;
        if (filter && !filter(e)) continue;
        const d = (e.x - x) ** 2 + (e.y - y) ** 2;
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      return best;
    }
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.alive || e.untargetable || e.phased || e.fleeing) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d >= bd) continue;
      if (filter && !filter(e)) continue;
      bd = d;
      best = e;
    }
    return best;
  }

  /** Best enemy within `maxAngle` of `angle` from (x, y) — used by aim assist. */
  enemyNearAngle(x, y, angle, maxAngle, maxDist) {
    let best = null;
    let bs = Infinity;
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.alive || e.untargetable || e.phased) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d = Math.hypot(dx, dy);
      if (d > maxDist) continue;
      const da = Math.abs(angleDiff(angle, Math.atan2(dy, dx)));
      if (da > maxAngle) continue;
      const score = da * 500 + d * 0.4;
      if (score < bs) {
        bs = score;
        best = e;
      }
    }
    return best;
  }

  /** Living, targetable enemies overlapping the circle (spatial hash). */
  queryEnemies(x, y, r, out = []) {
    const start = out.length;
    this.spatial.query(x, y, r, out);
    let j = start;
    for (let i = start; i < out.length; i++) {
      const e = out[i];
      if (e.alive && !e.untargetable && !e.phased) out[j++] = e;
    }
    out.length = j;
    return out;
  }

  /** Count living enemies (optionally matching filter). */
  countEnemies(filter) {
    let n = 0;
    for (const e of this.enemies) if (e.alive && (!filter || filter(e))) n++;
    return n;
  }

  /** Kill every non-boss enemy (or all with `bosses`). */
  killAllEnemies(bosses = false) {
    for (const e of [...this.enemies]) {
      if (!e.alive || e.parent) continue;
      if (e.isBoss && !bosses) continue;
      this.killEnemy(e, { source: 'debug', noCombo: true });
    }
  }

  // ---- Projectiles, hazards, explosions --------------------------------------------------------

  /** Fire a projectile (DESIGN §4.5). */
  fire(opts) {
    return this.projectiles.spawn(opts);
  }

  /** Add a hazard (DESIGN §4.7). */
  addHazard(h) {
    return this.hazardSys.add(h);
  }

  /** Warning-only circle; opts: {color, onDone(world, h), follow, team, data}. */
  telegraphCircle(x, y, r, time, opts = {}) {
    const cb = opts.onDone;
    return this.hazardSys.add({
      x, y, r, shape: 'circle', life: time, telegraph: true, color: opts.color,
      team: opts.team || 'enemy', follow: opts.follow, ox: opts.ox, oy: opts.oy, alpha: opts.alpha,
      data: opts.data, onDone: cb ? (h, w) => cb(w, h) : null,
    });
  }

  /** Warning-only line of `width`; opts as telegraphCircle. */
  telegraphLine(x1, y1, x2, y2, width, time, opts = {}) {
    const cb = opts.onDone;
    return this.hazardSys.add({
      x: x1, y: y1, x2, y2, width, shape: 'line', life: time, telegraph: true, color: opts.color,
      team: opts.team || 'enemy', follow: opts.follow, alpha: opts.alpha, data: opts.data,
      onDone: cb ? (h, w) => cb(w, h) : null,
    });
  }

  /** Telegraph a circle for `delay` seconds, then explode there. Returns the telegraph. */
  warnExplode(x, y, radius, damage, delay = 0.8, opts = {}) {
    return this.telegraphCircle(x, y, radius, delay, {
      color: opts.color || (opts.team === 'player' ? '#ffcf4a' : '#ff4d2e'),
      team: opts.team,
      onDone: (w) => w.explode(x, y, radius, damage, opts),
    });
  }

  /**
   * Area damage + visuals. opts: {team:'player'|'enemy'|'all', owner, source, knockback,
   * falloff (0..1, default .35), visual:'small'|'medium'|'large'|'huge'|false, sound|false,
   * shake, clearBullets, burn:{dps,time}, crit (multiplier), dmgMult, element}
   * Enemy-team damage is scaled by (opts.dmgMult ?? owner.dmgMult).
   * @returns {number} enemies hit
   */
  explode(x, y, radius, damage, opts = NO_INFO) {
    const owner = opts.owner || null;
    const team = opts.team || (owner && owner.team === 'enemy' ? 'enemy' : 'player');
    const falloff = opts.falloff ?? 0.35;
    let hits = 0;
    if (team === 'player' || team === 'all') {
      const q = this.queryEnemies(x, y, radius, []);
      const mult = opts.crit && opts.crit > 1 ? opts.crit : 1;
      for (let i = 0; i < q.length; i++) {
        const e = q[i];
        if (!e.alive) continue;
        const d = Math.max(0, Math.hypot(e.x - x, e.y - y) - e.r);
        const k = 1 - falloff * clamp(d / radius, 0, 1);
        this.damageEnemy(e, damage * k * mult, {
          source: opts.source || 'explosion',
          owner,
          knockback: opts.knockback ?? radius * 1.6,
          angle: Math.atan2(e.y - y, e.x - x),
          element: opts.element || 'fire',
          crit: mult > 1,
        });
        if (opts.burn) this.applyBurn(e, opts.burn.dps, opts.burn.time ?? 3, owner);
        hits++;
      }
    }
    if (team === 'enemy' || team === 'all') {
      const dmg = damage * (opts.dmgMult ?? owner?.dmgMult ?? 1);
      for (const p of this.players) {
        if (!p.alive) continue;
        const d = Math.hypot(p.x - x, p.y - y);
        if (d > radius + p.hitR) continue;
        const k = 1 - falloff * clamp(d / radius, 0, 1);
        this.damagePlayer(p, dmg * k, { source: opts.source || 'explosion', owner, angle: Math.atan2(p.y - y, p.x - x), scaled: true });
        if (opts.knockback !== 0) {
          const kb = (opts.knockback ?? 260) / Math.max(1, d);
          p.vx += (p.x - x) * kb;
          p.vy += (p.y - y) * kb;
        }
      }
    }
    // Visuals & sound.
    const size = opts.visual ?? (radius < 40 ? 'small' : radius < 90 ? 'medium' : radius < 150 ? 'large' : 'huge');
    if (size) {
      const fx = this.fx;
      if (size === 'small') fx.explosion?.(x, y, clamp(radius / 40, 0.4, 1), SMALL_BLAST);
      else if (size === 'medium') {
        fx.explosion?.(x, y, radius / 40);
        fx.shockwave?.(x, y, radius * 1.1, '#ffcf8a', 0.3);
      } else {
        // One radius-matched wave reads the AoE; the blast's own extra rings would be overdraw.
        fx.bigExplosion?.(x, y, radius / (size === 'huge' ? 90 : 110), RINGLESS);
        fx.shockwave?.(x, y, radius * 1.1, '#fff3c4', 0.45);
        if (size === 'huge') this.flash('#ffe8b0', 0.25);
      }
      const snd = opts.sound ?? `explode_${size}`;
      if (snd) this.sfx(snd, x, y);
      this.shake(opts.shake ?? SIZE_FX[size] ?? 0.1, team === 'player');
    } else if (opts.shake) this.shake(opts.shake, team === 'player');
    if (opts.clearBullets) this.clearEnemyBullets(x, y, radius, opts.clearBullets === 'xp');
    return hits;
  }

  /** Remove enemy bullets within r of (x, y) (Infinity = all). Optionally turn some to XP. */
  clearEnemyBullets(x, y, r = Infinity, toXp = false) {
    const list = this.eBullets;
    const r2 = r * r;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.alive || p.dead) continue;
      if (r !== Infinity && (p.x - x) ** 2 + (p.y - y) ** 2 > r2) continue;
      p.dead = true;
      p._explodeOnKill = false;
      n++;
      if (n <= 60) this.fx.hitSpark?.(p.x, p.y, 0, false);
      if (toXp && n % 4 === 0) this.pickupSys.spawn('xp', p.x, p.y, 1, { speed: 30 });
    }
    return n;
  }

  // ---- Feel & presentation -------------------------------------------------------------------

  /** Camera shake. `own` = from the player's own guns/blasts/kills (scaled & capped). */
  shake(trauma, own = false) {
    this.game?.camera?.shake(trauma, own);
  }

  /** Directional recoil kick of the view, `px` screen pixels opposite `angle`. */
  kick(angle, px) {
    this.game?.camera?.kick?.(angle, px);
  }

  hitstop(seconds) {
    this.game?.hitstop?.(seconds);
  }

  slowmo(scale, seconds) {
    this.game?.slowmo?.(scale, seconds);
  }

  zoomPunch(amount) {
    this.game?.camera?.zoomPunch(amount);
  }

  /** Full-screen color flash (capped when reduced flashing is on). */
  flash(color, a) {
    this.game?.screenFlash?.(color, a);
  }

  get reducedFlash() {
    return Save.settings.flashes === false;
  }

  /** Positional sound (pan/attenuation relative to the listener = camera). */
  sfx(name, x, y, opts) {
    const a = this.audio;
    if (!a?.play) return;
    const o = this._sfxOpts;
    o.vol = opts?.vol ?? 1;
    o.pitch = opts?.pitch ?? 1;
    o.delay = opts?.delay ?? 0;
    o.x = x;
    o.y = y;
    try {
      a.play(name, x === undefined ? { vol: o.vol, pitch: o.pitch, delay: o.delay } : o);
    } catch (err) {
      this.contentError(`sfx:${name}`, err);
    }
  }

  /**
   * Keep a positional sound loop (audio.loop name) alive while `on` is true. Call every update
   * with the same `key`; a loop not refreshed for a simulated step stops by itself, all loops
   * go silent while the sim is halted (pause, level-up) and stop when the run ends — content
   * never has to clean up (lance charge whine, saw whirr…).
   * @param {string} key unique per owner (e.g. `saw:${player.index}`)
   * @param {string} name loop name (audio.loop)
   * @param {boolean} on
   * @param {{vol?:number, pitch?:number, x?:number, y?:number}} [o]
   */
  loopSfx(key, name, on, o) {
    let L = this._loops.get(key);
    if (!on) {
      if (L) {
        this._loops.delete(key);
        try {
          L.h.stop(0.12);
        } catch {
          /* ignore */
        }
      }
      return;
    }
    const vol = o?.vol ?? 1;
    if (!L) {
      let h = null;
      try {
        h = this.audio?.loop?.(name, { vol: this._loopsMuted ? 0 : vol, pitch: o?.pitch ?? 1, x: o?.x, y: o?.y });
      } catch (err) {
        this.contentError(`loop:${name}`, err);
      }
      if (!h) return;
      L = { h, step: this._step, vol };
      this._loops.set(key, L);
    }
    L.step = this._step;
    L.vol = vol;
    if (!this._loopsMuted) {
      try {
        L.h.set?.({ vol, pitch: o?.pitch, x: o?.x, y: o?.y });
      } catch {
        /* ignore */
      }
    }
  }

  /** Stop every run-owned loop now (run end, teardown). */
  stopLoops() {
    for (const k of [...this._loops.keys()]) this.loopSfx(k, '', false);
  }

  /** Per frame from the game: silence loops while the sim is halted, reap stale ones. */
  syncLoops(active) {
    if (!this._loops.size) return;
    if (!active) {
      if (!this._loopsMuted) {
        this._loopsMuted = true;
        for (const L of this._loops.values()) L.h.set?.({ vol: 0 });
      }
      return;
    }
    if (this._loopsMuted) {
      this._loopsMuted = false;
      for (const L of this._loops.values()) L.h.set?.({ vol: L.vol });
    }
    for (const [k, L] of this._loops) {
      if (this._step - L.step > 1) this.loopSfx(k, '', false);
    }
  }

  /** Floating text in world space (fx.text). */
  floatText(x, y, text, opts = {}) {
    if (opts.callout && this.renderer) {
      // Callouts (boss hints, taunts) are anchored above big bosses; keep them inside the view
      // and below the HUD's boss bar instead of half-hidden under the instruments.
      // Clamp by the label's estimated half-width (not just its centre) so long lines never
      // run off the screen edge or under the radar.
      const v = this.renderer.viewRect(0, this._vr);
      const zk = Math.max(1, 1 / Math.max(0.1, this.renderer.camera?.zoom || 1));
      const hw = Math.min(v.w * 0.46, String(text).length * (opts.size || 14) * 0.29 * zk);
      const mx = Math.max(v.w * 0.06 + hw, v.w * 0.12);
      x = mx * 2 < v.w ? clamp(x, v.x0 + mx, v.x1 - mx) : (v.x0 + v.x1) / 2;
      y = clamp(y, v.y0 + v.h * 0.28, v.y1 - v.h * 0.14);
    }
    this.fx.text?.(x, y, text, opts);
  }

  /** HUD banner passthrough. */
  announce(title, sub = '', opts = {}) {
    this.game?.hud?.announce?.(title, sub, opts);
  }

  isVisible(x, y, margin = 0) {
    const v = this.renderer.viewRect(margin, this._vr);
    return x >= v.x0 && x <= v.x1 && y >= v.y0 && y <= v.y1;
  }

  /** Visible world rect grown by margin (fresh object). */
  viewRect(margin = 0) {
    return this.renderer.viewRect(margin, {});
  }

  /** A point just outside the view (margin beyond the edge), along `angle` from center. */
  offscreenPoint(margin = 80, angle) {
    const v = this.renderer.viewRect(margin, this._vr);
    const a = angle ?? this.rng.angle();
    const cx = (v.x0 + v.x1) / 2;
    const cy = (v.y0 + v.y1) / 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const hw = v.w / 2;
    const hh = v.h / 2;
    const t = Math.min(Math.abs(dx) > 1e-6 ? hw / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? hh / Math.abs(dy) : Infinity);
    return { x: cx + dx * t, y: cy + dy * t };
  }

  /** Current wind acceleration {x,y}: weather gusts + the Gale modifier. */
  get wind() {
    const w = this._wind;
    const ww = this.weather?.wind;
    w.x = ww?.x || 0;
    w.y = ww?.y || 0;
    const g = this.run?.mods?.wind || 0;
    if (g) {
      const a = this.time * 0.07 + (this.run.seed % 100);
      const gust = 0.75 + 0.25 * Math.sin(this.time * 0.9);
      w.x += Math.cos(a) * 140 * g * gust;
      w.y += Math.sin(a) * 140 * g * gust;
    }
    return w;
  }

  /** Run `fn(world)` after `delay` simulated seconds (affected by slow-mo/pause). */
  after(delay, fn) {
    this.timers.push({ at: this.time + delay, fn });
  }

  /** Default enemy renderer, for content `def.draw` to reuse. */
  drawEnemySprite(ctx, e, sprite, frame, angle, x, y, scale) {
    drawEnemySprite(this, ctx, e, sprite ?? e.sprite, frame ?? e.frame, angle ?? e.angle, x ?? e.x, y ?? e.y, scale ?? e.scale);
  }

  /** Log a content error once per key (content must never crash the engine). */
  contentError(key, err) {
    if (this._errors.has(key)) return;
    this._errors.add(key);
    console.error(`[world] ${key} threw`, err);
  }

  // ---- Frame ---------------------------------------------------------------------------------

  update(dt) {
    this.dt = dt;
    this.time += dt;
    this._step++;
    const run = this.run;
    if (run) run.time += dt;

    // Spatial hash of last frame's positions (queries during this frame read it).
    const sp = this.spatial;
    sp.clear();
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) if (list[i].alive) sp.insert(list[i]);

    for (let i = 0; i < this.players.length; i++) this.players[i].update(dt, this.input);
    if (this.players.length > 1) this._leash(dt);
    updateEnemies(this, dt);
    this.projectiles.updateList(this.pBullets, dt);
    this.projectiles.updateList(this.eBullets, dt);
    this.hazardSys.update(dt);
    this.pickupSys.update(dt);
    updateWrecks(this, dt);

    // Timers (may schedule more timers).
    const T = this.timers;
    for (let i = T.length - 1; i >= 0; i--) {
      if (i >= T.length) continue;
      const tm = T[i];
      if (this.time < tm.at) continue;
      T[i] = T[T.length - 1];
      T.pop();
      try {
        tm.fn(this);
      } catch (err) {
        this.contentError('timer', err);
      }
    }

    try {
      this.director?.update(dt);
    } catch (err) {
      this.contentError('director', err);
    }

    if (run && run.comboTimer > 0) {
      run.comboTimer -= dt;
      if (run.comboTimer <= 0) {
        run.chain = 0;
        run.combo = 1;
      }
    }

    const pw = this.particles.wind;
    if (pw) {
      const wind = this.wind;
      pw.x = wind.x;
      pw.y = wind.y;
    }
    this.particles.update(dt);
    this.fx.update(dt);
  }

  /**
   * World-space render (DESIGN §4.2 "[world transform]" block).
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx, renderer) {
    renderer.applyWorld(ctx);
    renderer.viewRect(140, this._drawView);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // Shadows.
    drawEnemyShadows(this, ctx, renderer);
    for (const p of this.players) p.drawShadow(ctx, SHADOW_OFFSET.x * p.alt, SHADOW_OFFSET.y * p.alt);

    this.hazardSys.draw(ctx);

    renderer.applyWorld(ctx);
    this._particles(ctx, renderer, 'low');

    renderer.applyWorld(ctx);
    this.pickupSys.draw(ctx, renderer);

    drawWrecks(this, ctx);
    drawEnemies(this, ctx);

    for (const p of this.players) {
      ctx.save();
      try {
        p.draw(ctx, this);
      } catch (err) {
        this.contentError('player:draw', err);
      }
      ctx.restore();
    }

    this.projectiles.draw(ctx, this.pBullets, renderer);

    // Smoke & debris over a living ship fade out so the player never vanishes in the murk.
    const foc = this._focusPts || (this._focusPts = []);
    foc.length = 0;
    for (const p of this.players) if (p.alive) foc.push(p);
    this.particles.focus = foc;
    renderer.applyWorld(ctx);
    this._particles(ctx, renderer, 'normal');
    this.particles.focus = NO_FOCUS;
    renderer.applyWorld(ctx);
    ctx.globalCompositeOperation = 'lighter';
    this._particles(ctx, renderer, 'add');
    ctx.globalCompositeOperation = 'source-over';
    renderer.applyWorld(ctx);
    ctx.globalAlpha = 1;
    try {
      this.fx.drawEffects?.(ctx, renderer);
    } catch (err) {
      this.contentError('fx:drawEffects', err);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // Player locator above the murk (busier screen → stronger), under enemy fire.
    const busy = clamp((this.particles.count - 250) / 900, 0, 1);
    const loc = 0.35 + 0.65 * Math.max(busy, this.bosses.length ? 0.6 : 0);
    renderer.applyWorld(ctx);
    for (const p of this.players) p.drawLocator(ctx, loc);

    this.projectiles.draw(ctx, this.eBullets, renderer);

    renderer.applyWorld(ctx);
    ctx.globalAlpha = 1;
    if (Save.settings.damageNumbers !== false || this.fx.texts?.length) {
      try {
        this.fx.drawTexts?.(ctx, renderer);
      } catch (err) {
        this.contentError('fx:drawTexts', err);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  /** Co-op: keep living players inside what the camera can frame at its widest zoom. */
  _leash(dt) {
    let n = 0;
    let cx = 0;
    let cy = 0;
    for (const p of this.players) {
      if (!p.alive) continue;
      cx += p.x;
      cy += p.y;
      n++;
    }
    if (n < 2) return;
    cx /= n;
    cy /= n;
    const r = this.renderer;
    const z = r.camera.baseZoom * 0.55;
    const hx = Math.max(200, r.cssW / 2 / z - 130);
    const hy = Math.max(160, r.cssH / 2 / z - 110);
    for (const p of this.players) {
      if (!p.alive) continue;
      const dx = p.x - cx;
      const dy = p.y - cy;
      const k = Math.hypot(dx / hx, dy / hy);
      if (k <= 1) continue;
      const tx = cx + dx / k;
      const ty = cy + dy / k;
      const s = Math.min(1, dt * 10);
      p.x += (tx - p.x) * s;
      p.y += (ty - p.y) * s;
      // Remove the outward velocity component.
      const l = Math.hypot(dx, dy) || 1;
      const out = (p.vx * dx + p.vy * dy) / l;
      if (out > 0) {
        p.vx -= (dx / l) * out;
        p.vy -= (dy / l) * out;
      }
    }
  }

  _particles(ctx, renderer, layer) {
    try {
      this.particles.draw(ctx, renderer, layer);
    } catch (err) {
      this.contentError(`particles:${layer}`, err);
    }
  }

  /** Release references (called when a run ends). */
  destroy() {
    this.stopLoops();
    this.players.length = 0;
    this.enemies.length = 0;
    this.bosses.length = 0;
    this.pBullets.length = 0;
    this.eBullets.length = 0;
    this.pickups.length = 0;
    this.hazards.length = 0;
    this.wrecks.length = 0;
    this.timers.length = 0;
    this.spatial.clear();
  }
}

