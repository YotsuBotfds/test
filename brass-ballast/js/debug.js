// Debug flags & window.BB (DESIGN §10). URL flags:
//   debug=1 autostart=1 autopilot=1 mode= hull= weapon= stage=N wave=N boss=<id> seed=N god=1
//   mute=1 level=N aux=a,b passives=a,b[:lvl] speed=N
// window.BB (debug=1): {game, world, Sprites, audio, events, Save, debug:{…}}.

import { FLAGS, flag } from './config.js';
import { Save } from './core/storage.js';
import { events } from './core/events.js';
import { Sprites } from './gfx/sprites.js';
import { ENEMIES, ENEMY_ORDER } from './content/enemies/index.js';
import { BOSSES, BOSS_ORDER } from './content/bosses/index.js';
import { PRIMARIES, AUX, EVOLUTIONS } from './content/weapons/index.js';
import { PASSIVES, cardFor } from './content/upgrades.js';
import { xpForLevel } from './game/game.js';
import { createBrain, autoPickCard, enableAutopilot } from './autopilot.js';
import { Quality } from './gfx/quality.js';

const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
const list = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);

/**
 * Wire URL flags and (with debug=1) window.BB. Call after the Game is constructed.
 * @param {any} game
 * @param {{audio?:any}} [deps]
 */
export function initDebug(game, deps = {}) {
  if (FLAGS.speed) game.timeScale = Math.max(0.05, num(FLAGS.speed, 1));
  if (flag('god')) game.god = true;
  if (flag('autopilot')) {
    enableAutopilot(game, { restart: flag('autostart'), skill: FLAGS.botskill ? num(FLAGS.botskill, 1) : undefined });
  }
  // Re-apply loadout flags on every run started from autostart (incl. restarts).
  if (flag('autostart')) {
    events.on('run:start', () => queueMicrotask(() => applyLoadoutFlags(game)));
  }
  const debug = makeDebugApi(game);
  game.debug = debug;
  if (flag('debug')) {
    window.BB = {
      game,
      get world() {
        return game.world;
      },
      get run() {
        return game.run;
      },
      Sprites,
      audio: deps.audio ?? game.audio,
      events,
      Save,
      ENEMIES,
      BOSSES,
      PRIMARIES,
      AUX,
      EVOLUTIONS,
      PASSIVES,
      Quality,
      debug,
    };
    console.info('[debug] window.BB ready — try BB.debug.report()');
  }
  return debug;
}

/** Start a run from URL flags (autostart=1). */
export function autostartRun(game) {
  const opts = {
    mode: FLAGS.mode,
    hull: FLAGS.hull,
    weapon: FLAGS.weapon,
    seed: FLAGS.seed !== undefined ? num(FLAGS.seed, undefined) : undefined,
    stage: FLAGS.stage ? Math.max(0, num(FLAGS.stage, 1) - 1) : undefined,
    wave: FLAGS.wave ? Math.max(0, num(FLAGS.wave, 1) - 1) : undefined,
    boss: FLAGS.boss && FLAGS.boss !== '1' ? FLAGS.boss : undefined,
    modifiers: FLAGS.mods ? list(FLAGS.mods) : undefined,
  };
  return game.startRun(opts);
}

/** level=N, aux=a,b, passives=a,b[:lvl] */
export function applyLoadoutFlags(game) {
  const p = game.world?.players?.[0];
  if (!p) return;
  for (const id of list(FLAGS.aux)) {
    const [aid, lv] = id.split(':');
    if (EVOLUTIONS[aid]) p.evolveAux(aid);
    else {
      p.addAux(aid);
      for (let i = 1; i < num(lv, 1); i++) p.levelAux(aid);
    }
  }
  for (const id of list(FLAGS.passives)) {
    const [pid, lv] = id.split(':');
    for (let i = 0; i < num(lv, 1); i++) p.addPassive(pid);
  }
  const lvl = num(FLAGS.level, 1);
  if (lvl > 1) game.debug?.level(lvl - 1, { silent: true });
  if (game.god) p.god = true;
}

function makeDebugApi(game) {
  const P = () => game.world?.players?.[0];
  const api = {
    /** Spawn n enemies around player 1 (ring at 420 u, or opts.x/y). */
    spawn(type = 'gyroScout', n = 1, opts = {}) {
      const w = game.world;
      const p = P();
      if (!w || !p) return [];
      const out = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
        const d = opts.dist ?? 420;
        out.push(w.spawnEnemy(type, opts.x ?? p.x + Math.cos(a) * d, opts.y ?? p.y + Math.sin(a) * d, opts));
      }
      return out.length;
    },
    boss(id = 'ironMatriarch') {
      game.director?.forceBoss(id);
      return !!game.world?.bosses.length;
    },
    stage(n = 1) {
      game.director?.gotoStage(Math.max(0, n - 1));
    },
    wave(n = 1) {
      game.director?.gotoWave(Math.max(0, n - 1));
    },
    skipWave() {
      game.director?.skipWave();
    },
    god(on = true) {
      game.god = !!on;
      for (const p of game.world?.players || []) p.god = !!on;
      return game.god;
    },
    /** Give a passive / aux / evolution / primary (switches weapon) / card id. */
    give(id) {
      const p = P();
      if (!p) return false;
      if (PRIMARIES[id] && p.primary.id !== id) {
        p.primary = { id, level: 1, cd: 0, kick: 0, data: {} };
        p.recomputeStats();
        return 'primary';
      }
      if (PRIMARIES[id]) {
        p.levelPrimary();
        return 'primaryLevel';
      }
      if (EVOLUTIONS[id]) return !!p.evolveAux(id);
      let card = null;
      try {
        card = cardFor(id, p);
      } catch {
        card = null;
      }
      if (card) {
        game.applyCard(p, card);
        return card.kind;
      }
      if (AUX[id]) return !!p.addAux(id);
      if (PASSIVES[id]) return p.addPassive(id);
      return false;
    },
    /** Instantly gain n levels, auto-picking cards (no UI). */
    level(n = 1, opts = {}) {
      const p = P();
      const run = game.run;
      if (!p || !run) return 0;
      for (let i = 0; i < n; i++) {
        const cards = game.rollCards(p, 'level', 3 + (p.stats.extraChoices || 0));
        const card = autoPickCard(cards, { player: p });
        if (card) {
          if (opts.silent) {
            const ft = game.world.floatText;
            game.world.floatText = () => {};
            game.applyCard(p, card);
            game.world.floatText = ft;
          } else game.applyCard(p, card);
        }
        run.level++;
        run.xpNext = xpForLevel(run.level);
      }
      return run.level;
    },
    xp(n = 10) {
      game.addXp(n);
    },
    heal() {
      for (const p of game.world?.players || []) {
        if (!p.alive) game.world.revivePlayer(p, 1);
        else p.hp = p.stats.maxHp;
      }
    },
    killAll(bosses = false) {
      game.world?.killAllEnemies(bosses);
    },
    killBoss() {
      for (const b of [...(game.world?.bosses || [])]) game.world.killEnemy(b, { source: 'debug' });
    },
    win() {
      game.victory();
    },
    lose() {
      const w = game.world;
      if (!w) return;
      game.god = false;
      for (const p of w.players) {
        p.god = false;
        p.revivesLeft = 0;
        if (p.alive) w.playerDown(p);
      }
    },
    timeScale(s = 1) {
      game.timeScale = Math.max(0.05, s);
      return game.timeScale;
    },
    /** Simulated co-op: P2 driven by an autopilot brain. */
    addPlayer(opts = {}) {
      return game.addCoopPlayer(null, { brain: createBrain(), autoPick: autoPickCard, ...opts })?.index ?? null;
    },
    autopilot(on = true) {
      const p = P();
      if (!p) return;
      p.brain = on ? createBrain() : null;
      p.autoPick = on ? autoPickCard : null;
      game.autopilot = !!on;
    },
    setting(key, value) {
      Save.setSetting(key, value);
      return Save.settings[key];
    },
    enemies: () => ENEMY_ORDER.slice(),
    bosses: () => BOSS_ORDER.slice(),
    report() {
      const w = game.world;
      const run = game.run;
      const pl = (p) => ({
        index: p.index,
        alive: p.alive,
        hp: Math.round(p.hp),
        maxHp: p.stats.maxHp,
        x: Math.round(p.x),
        y: Math.round(p.y),
        steam: Math.round(p.steam),
        bombs: p.bombs,
        primary: `${p.primary.id}:${p.primary.level}`,
        aux: p.aux.map((a) => `${a.id}:${a.level}`),
        passives: { ...p.passives },
        kills: p.kills,
        bot: !!p.brain,
      });
      const errors = [...game._errors, ...(w ? w._errors : [])];
      return {
        state: game.state,
        fps: Math.round(game.fps),
        frameMs: Math.round(game.loop.frameMs * 10) / 10,
        quality: `${Quality.setting}:${Quality.cfg.id}`,
        enemies: w?.enemies.length ?? 0,
        pBullets: w?.pBullets.length ?? 0,
        eBullets: w?.eBullets.length ?? 0,
        pickups: w?.pickups.length ?? 0,
        hazards: w?.hazards.length ?? 0,
        particles: game.particles?.count ?? 0,
        director: game.director?.state ?? null,
        run: run
          ? {
              mode: run.mode,
              seed: run.seed,
              stage: run.stageIndex + 1,
              stageId: run.stage?.id,
              wave: run.wave,
              waveCount: run.waveCount,
              level: run.level,
              xp: Math.floor(run.xp),
              xpNext: run.xpNext,
              score: run.score,
              kills: run.kills,
              bossKills: run.bossKills,
              elitesKilled: run.elitesKilled,
              cogs: run.cogs,
              combo: Math.round(run.combo * 10) / 10,
              bestCombo: run.bestCombo,
              time: Math.round(run.time),
              damageTaken: Math.round(run.damageTaken),
              upgrades: run.upgrades.length,
              modifiers: run.modifiers,
              over: run.over,
              victory: run.victory,
            }
          : null,
        player: w?.players[0] ? pl(w.players[0]) : null,
        players: w ? w.players.map(pl) : [],
        bosses: w ? w.bosses.map((b) => ({ id: b.type, hp: Math.round(b.hp), maxHp: b.maxHp, phase: b.phase })) : [],
        errors,
      };
    },
  };
  return api;
}
