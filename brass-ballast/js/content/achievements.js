// Achievements: the Hall of Honours (DESIGN §2.14, §4.9, §4.12; WP21).
//
// AchievementTracker is a passive listener on the engine's event bus. It keeps small per-run and
// per-wave flags (reset on run:start / wave:start / stage:start), checks thresholds against the
// run object and the banked lifetime stats, and unlocks medals into Save.data.achievements.
//
// Lifetime counters the engine does not keep itself (ballast-bomb kills, per-titan defeats) live
// in Save.data.achProgress. storage.js merges unknown keys and saveNow() serialises the whole
// object, so this persists without a schema change there.

import { events } from '../core/events.js';
import { Save } from '../core/storage.js';
import { audio } from '../audio/audio.js';
import { WORKSHOP } from './workshop.js';
import { HULL_ORDER } from './hulls.js';
import { AUX, EVOLUTIONS, PRIMARIES } from './weapons/index.js';

/**
 * Medal catalogue, in cabinet order. `secret` medals show as "?" until earned.
 * @type {ReadonlyArray<{id:string, name:string, desc:string, icon:string,
 *   tier:'bronze'|'silver'|'gold', group:string, secret?:boolean}>}
 */
export const ACHIEVEMENTS = [
  // ---- Progression
  { id: 'firstBlood', group: 'progression', name: 'First Blood', desc: 'Down your first Syndicate craft.', icon: 'icon_skull', tier: 'bronze' },
  { id: 'scrapper', group: 'progression', name: 'Scrapper', desc: 'Sink 100 Syndicate craft across all your voyages.', icon: 'icon_cog', tier: 'bronze' },
  { id: 'fleetBreaker', group: 'progression', name: 'Fleet Breaker', desc: 'Sink 1,000 Syndicate craft across all your voyages.', icon: 'icon_cog', tier: 'silver' },
  { id: 'ironTide', group: 'progression', name: 'Iron Tide', desc: 'Sink 10,000 Syndicate craft. The Syndicate is running short of scrap.', icon: 'icon_trophy', tier: 'gold' },
  { id: 'matriarch', group: 'progression', name: 'Sink the Matriarch', desc: 'Defeat the Iron Matriarch, Flagship of the Syndicate.', icon: 'icon_boss', tier: 'silver' },
  { id: 'fiveCaptains', group: 'progression', name: 'Scourge of the Syndicate', desc: 'Defeat all five Syndicate titans, across any number of voyages.', icon: 'icon_boss', tier: 'gold' },
  { id: 'stormFront', group: 'progression', name: 'Into the Storm', desc: 'Reach stage 3 of a voyage.', icon: 'icon_wave', tier: 'bronze' },
  { id: 'grandVoyage', group: 'progression', name: 'The Grand Voyage', desc: 'Complete the campaign.', icon: 'icon_medal_gold', tier: 'gold' },

  // ---- Skill
  { id: 'untouchedWave', group: 'skill', name: 'Not a Scratch', desc: 'Clear a wave without taking a single hit.', icon: 'icon_heal', tier: 'silver' },
  { id: 'comboFive', group: 'skill', name: 'Five-Fold Fury', desc: 'Chain your kills up to a ×5 combo.', icon: 'icon_xp', tier: 'silver' },
  { id: 'deadeye', group: 'skill', name: 'Deadeye', desc: 'Land 50 critical hits in a single voyage.', icon: 'icon_star', tier: 'silver' },
  { id: 'bossNoBomb', group: 'skill', name: 'Ballast Unspent', desc: 'Defeat a titan without dropping a single ballast bomb.', icon: 'icon_bomb', tier: 'gold' },
  { id: 'flawlessDawn', group: 'skill', name: 'Flawless Dawn', desc: 'Win stage 1 without taking damage.', icon: 'icon_clock', tier: 'gold' },
  { id: 'trophyHunter', group: 'skill', name: 'Elite Hunter', desc: 'Bring down 10 elite craft in a single voyage.', icon: 'icon_crate', tier: 'bronze' },

  // ---- Build
  { id: 'masterwork', group: 'build', name: 'Masterwork', desc: 'Evolve an auxiliary system into its legendary form.', icon: 'icon_steam', tier: 'silver' },
  { id: 'overengineered', group: 'build', name: 'Overengineered', desc: 'Max an auxiliary system out to level 5.', icon: 'icon_cog', tier: 'silver' },
  { id: 'fullRigging', group: 'build', name: 'Full Rigging', desc: 'Have four auxiliary systems armed at once.', icon: 'icon_heal', tier: 'bronze' },
  { id: 'calibrated', group: 'build', name: 'Calibrated to the Hair', desc: 'Calibrate your primary cannon to its maximum level.', icon: 'icon_star', tier: 'silver' },
  { id: 'ascendant', group: 'build', name: 'Ascendant', desc: 'Reach level 20 in a single voyage.', icon: 'icon_xp', tier: 'gold' },

  // ---- Economy
  { id: 'cogHoarder', group: 'economy', name: 'Cog Hoarder', desc: 'Bank 1,000 cogs in total.', icon: 'icon_cog', tier: 'bronze' },
  { id: 'tinkeringHands', group: 'economy', name: 'Tinkering Hands', desc: 'Buy 10 Workshop upgrade levels.', icon: 'icon_steam', tier: 'silver' },
  { id: 'shipwright', group: 'economy', name: 'Master Shipwright', desc: 'Max out every Workshop upgrade.', icon: 'icon_trophy', tier: 'gold' },
  { id: 'fullHangar', group: 'economy', name: 'Full Hangar', desc: 'Unlock every hull in the Hangar.', icon: 'icon_medal_silver', tier: 'silver' },

  // ---- Modes
  { id: 'gale', group: 'modes', name: 'Gale Warden', desc: 'Reach wave 10 of the Endless Gale.', icon: 'icon_wave', tier: 'silver' },
  { id: 'eyeOfGale', group: 'modes', name: 'Eye of the Gale', desc: 'Reach wave 20 of the Endless Gale.', icon: 'icon_wave', tier: 'gold' },
  { id: 'squallChaser', group: 'modes', name: 'Squall Chaser', desc: 'Win a Daily Squall.', icon: 'icon_clock', tier: 'silver' },
  { id: 'doubleSquall', group: 'modes', name: 'Squall Season', desc: 'Win the Daily Squall on 3 different days.', icon: 'icon_medal_silver', tier: 'silver' },
  { id: 'gauntlet', group: 'modes', name: 'Gauntlet Cleared', desc: 'Clear the Gauntlet of Iron: all five titans, back to back.', icon: 'icon_boss', tier: 'gold' },

  // ---- Secret fun ones
  { id: 'ominousOmen', group: 'secret', name: 'Ill Omen', desc: 'Lose a voyage within 20 seconds of casting off.', icon: 'icon_skull', tier: 'bronze', secret: true },
  { id: 'coldFeet', group: 'secret', name: 'Cold Feet', desc: 'Abandon a voyage within 10 seconds of casting off.', icon: 'icon_clock', tier: 'bronze', secret: true },
  { id: 'folly', group: 'secret', name: 'Folly Proven', desc: "Win a voyage with The Tinker's Folly.", icon: 'icon_medal_gold', tier: 'gold', secret: true },
  { id: 'shockAndBallast', group: 'secret', name: 'Shock and Ballast', desc: 'Bring down 100 Syndicate craft with ballast bombs.', icon: 'icon_bomb', tier: 'silver', secret: true },
];

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

const BOSS_IDS = ['ironMatriarch', 'kraken', 'stormEngine', 'behemoth', 'sunFurnace'];

/** Lifetime kill milestones, ascending. */
const KILL_MILESTONES = [
  [1, 'firstBlood'],
  [100, 'scrapper'],
  [1000, 'fleetBreaker'],
  [10000, 'ironTide'],
];

const GOAL = {
  stormStage: 3,
  bombKills: 100,
  elites: 10,
  crits: 50,
  level: 20,
  comboChain: 40, // run.bestCombo counts chained kills; ×5 multiplier is reached at 40
  comboMult: 5,
  auxSlots: 4,
  auxMax: 5,
  primaryMax: 8,
  cogs: 1000,
  workshopLevels: 10,
  endlessWaves: 10,
  endlessWavesLong: 20,
  squallDays: 3,
  loseWithin: 20,
  abandonWithin: 10,
};

// ---- Persistent helpers ----------------------------------------------------------------------

function progress() {
  const p = (Save.data.achProgress ||= {});
  if (typeof p.bombKills !== 'number') p.bombKills = 0;
  if (!p.bosses || typeof p.bosses !== 'object') p.bosses = {};
  if (!Array.isArray(p.dailyWins)) p.dailyWins = [];
  return p;
}

/**
 * Distinct days with a Daily Squall victory. Tracked in achProgress because the daily highscore
 * table keeps only the best-scoring run per day (a higher-scoring loss can replace a win there);
 * the table is still read so wins banked before this counter existed are counted too.
 */
function dailyWinDays() {
  const days = new Set(progress().dailyWins);
  for (const [day, e] of Object.entries(Save.data.highscores?.daily || {})) if (e?.victory) days.add(String(e.day ?? day));
  return days.size;
}

/** Kills banked at run end, plus the live run's kills while it is still in progress. */
function lifetimeKills(run) {
  const banked = Save.data.stats?.kills || 0;
  return banked + (run && !run.over ? run.kills || 0 : 0);
}

/** Campaign-shaped runs, where a "stage" is a real stage (the Gauntlet's stages are single titans). */
function isVoyage(run) {
  return run.mode === 'campaign' || run.mode === 'daily';
}

function bossDefeated(id) {
  // The codex counts kills per type, so it also covers titans defeated before this tracker existed.
  return (progress().bosses[id] || 0) > 0 || (Save.data.codex?.bosses?.[id] || 0) > 0;
}

function unlockedCount() {
  const got = Save.data.achievements || {};
  let n = 0;
  for (const a of ACHIEVEMENTS) if (got[a.id]) n++;
  return n;
}

/**
 * Medal progress for the title screen and results.
 * @returns {{unlocked:number, total:number}}
 */
export function achievementProgress() {
  return { unlocked: unlockedCount(), total: ACHIEVEMENTS.length };
}

// ---- Tracker ---------------------------------------------------------------------------------

export class AchievementTracker {
  /** @param {any} game */
  constructor(game) {
    this.game = game;
    /** Per-run flags: {run, waveHit, stageHit, crits}. Rebuilt whenever the run changes. */
    /** @type {null | {run:any, waveHit:boolean, stageHit:boolean, crits:number}} */
    this.rs = null;
    /** Run's bombsUsed when each titan spawned, so a titan can be checked for bomb use. */
    /** @type {WeakMap<object, number>} */
    this.bossBombs = new WeakMap();
    /** Medals recovered silently at construction; announced once the title screen shows. */
    this.recovered = 0;
    this._unsubs = [];

    const on = (name, fn) => this._unsubs.push(events.on(name, fn));
    on('run:start', (d) => this._onRunStart(d));
    on('run:end', (d) => this._onRunEnd(d));
    on('wave:start', (d) => this._onWaveStart(d));
    on('wave:clear', (d) => this._onWaveClear(d));
    on('stage:start', (d) => this._onStageStart(d));
    on('stage:clear', (d) => this._onStageClear(d));
    on('boss:spawn', (d) => this._onBossSpawn(d));
    on('boss:killed', (d) => this._onBossKilled(d));
    on('enemy:killed', (d) => this._onEnemyKilled(d));
    on('enemy:hit', (d) => this._onEnemyHit(d));
    on('player:hit', (d) => this._onPlayerHit(d));
    on('combo', (d) => this._onCombo(d));
    on('levelup', (d) => this._onLevelUp(d));
    on('upgrade:take', (d) => this._onUpgradeTake(d));
    on('ui:screen', () => this._onScreen());
    // Hangar purchases unlock the economy medals on the spot (not on the next screen change).
    on('workshop:buy', () => this._checkEconomy(false));
    on('hangar:unlock', () => this._checkEconomy(false));

    this._retroactive();
  }

  /** Unsubscribe from every event. Safe to call more than once. */
  destroy() {
    for (const off of this._unsubs.splice(0)) off?.();
    this.rs = null;
  }

  /**
   * Grant a medal. Returns true if it was newly unlocked.
   * Unless `quiet`, it also emits achievement:unlock, shows a toast and plays the chime.
   * @param {string} id
   * @param {{quiet?: boolean}} [opts]
   */
  unlock(id, opts = {}) {
    const def = BY_ID.get(id);
    if (!def) return false;
    const store = (Save.data.achievements ||= {});
    if (store[id]) return false;
    store[id] = Date.now();
    Save.save();
    if (opts.quiet) return true;
    events.emit('achievement:unlock', { achievement: def });
    try {
      this.game?.ui?.toast?.(def.name, { icon: def.icon, kind: 'achievement' });
    } catch {
      /* toast is cosmetic */
    }
    // audio.js also listens for achievement:unlock; the same-name throttle makes this duplicate
    // call a no-op, and it keeps the chime working if that listener is ever removed.
    try {
      audio.play('achievement');
    } catch {
      /* audio is optional */
    }
    return true;
  }

  // ---- Per-run state ---------------------------------------------------------------------

  _run() {
    return this.rs?.run || this.game?.run || null;
  }

  /** Flags for `run`, creating them if the tracker missed its run:start. */
  _state(run) {
    if (!run) return null;
    if (!this.rs || this.rs.run !== run) {
      this.rs = { run, waveHit: false, stageHit: false, crits: 0 };
    }
    return this.rs;
  }

  _onRunStart({ run } = {}) {
    if (run) this.rs = { run, waveHit: false, stageHit: false, crits: 0 };
  }

  _onRunEnd({ run, victory, summary } = {}) {
    if (!run) return;
    const s = summary || run.summary || {};
    if (victory) {
      if (run.mode === 'campaign') this.unlock('grandVoyage');
      if (run.mode === 'daily') {
        this.unlock('squallChaser');
        const p = progress();
        if (run.day != null && !p.dailyWins.includes(String(run.day))) {
          p.dailyWins.push(String(run.day));
          Save.save();
        }
        if (dailyWinDays() >= GOAL.squallDays) this.unlock('doubleSquall');
      }
      if (run.mode === 'bossRush') this.unlock('gauntlet');
      if (run.hull === 'tinker') this.unlock('folly');
    } else if (s.abandoned) {
      if ((run.time || 0) < GOAL.abandonWithin) this.unlock('coldFeet');
    } else if ((run.time || 0) < GOAL.loseWithin) {
      this.unlock('ominousOmen');
    }
    this._checkLifetime(false);
    this._checkEconomy(false);
    if (this.rs?.run === run) this.rs = null;
  }

  // ---- Waves, stages, bosses ---------------------------------------------------------------

  _onWaveStart({ run } = {}) {
    const rs = this._state(run);
    if (!rs) return;
    rs.waveHit = false;
    if (run.mode === 'endless') this._checkEndlessWave(run.wave);
  }

  _checkEndlessWave(wave) {
    if ((wave || 0) >= GOAL.endlessWaves) this.unlock('gale');
    if ((wave || 0) >= GOAL.endlessWavesLong) this.unlock('eyeOfGale');
  }

  _onWaveClear({ run } = {}) {
    const rs = this._state(run);
    if (rs && !rs.waveHit) this.unlock('untouchedWave');
  }

  _onStageStart({ run, index } = {}) {
    const rs = this._state(run);
    if (!rs) return;
    if (index === 0) rs.stageHit = false;
    if (isVoyage(run) && (run.stageReached || 0) >= GOAL.stormStage) this.unlock('stormFront');
  }

  _onStageClear({ run, index } = {}) {
    const rs = this._state(run);
    if (!rs) return;
    if (index === 0 && isVoyage(run) && !rs.stageHit) this.unlock('flawlessDawn');
  }

  _onBossSpawn({ boss } = {}) {
    const run = this._run();
    if (run && boss) this.bossBombs.set(boss, run.bombsUsed || 0);
    // Every 5th Endless wave is a titan wave, which starts without a wave:start.
    if (run?.mode === 'endless' && !boss?.parent) this._checkEndlessWave(run.endlessWave);
  }

  _onBossKilled({ boss, id } = {}) {
    const run = this._run();
    const base = boss ? this.bossBombs.get(boss) : undefined;
    if (run && base !== undefined && (run.bombsUsed || 0) === base) this.unlock('bossNoBomb');
    if (id === 'ironMatriarch') this.unlock('matriarch');
    if (BOSS_IDS.includes(id)) {
      const p = progress();
      p.bosses[id] = (p.bosses[id] || 0) + 1;
      Save.save();
    }
    if (BOSS_IDS.every(bossDefeated)) this.unlock('fiveCaptains');
  }

  // ---- Combat ----------------------------------------------------------------------------

  _onEnemyKilled({ enemy, info } = {}) {
    if (!enemy || enemy.parent) return; // destructible boss parts don't count as kills
    const run = this._run();
    if (!run) return;
    const total = lifetimeKills(run);
    for (const [goal, id] of KILL_MILESTONES) if (total >= goal) this.unlock(id);
    if (info?.source === 'bomb') {
      const p = progress();
      p.bombKills++;
      Save.save();
      if (p.bombKills >= GOAL.bombKills) this.unlock('shockAndBallast');
    }
    if (enemy.elite && (run.elitesKilled || 0) >= GOAL.elites) this.unlock('trophyHunter');
  }

  _onEnemyHit({ crit, info } = {}) {
    // Silent hits are a boss part's damage share forwarded to its parent: the same crit, twice.
    if (!crit || info?.silent) return;
    const rs = this.rs;
    if (!rs || rs.run.over) return;
    if (++rs.crits >= GOAL.crits) this.unlock('deadeye');
  }

  _onPlayerHit({ amount } = {}) {
    if (!(amount > 0)) return;
    const rs = this.rs;
    if (!rs || rs.run.over) return;
    rs.waveHit = true;
    rs.stageHit = true;
  }

  _onCombo({ value } = {}) {
    if (value >= GOAL.comboMult - 0.01) this.unlock('comboFive');
  }

  _onLevelUp({ level } = {}) {
    if (level >= GOAL.level) this.unlock('ascendant');
  }

  _onUpgradeTake({ player, card } = {}) {
    if (card?.kind === 'evolution') this.unlock('masterwork');
    if (!player) return;
    const aux = player.aux || [];
    if (aux.length >= GOAL.auxSlots) this.unlock('fullRigging');
    const maxOf = (id) => AUX[id]?.maxLevel ?? EVOLUTIONS[id]?.maxLevel ?? GOAL.auxMax;
    if (aux.some((a) => a && a.level >= maxOf(a.id))) this.unlock('overengineered');
    const pr = player.primary;
    if (pr && pr.level >= (PRIMARIES[pr.id]?.maxLevel ?? GOAL.primaryMax)) this.unlock('calibrated');
  }

  // ---- Lifetime & economy (checked at boot, on screen changes and at run end) -------------

  /** Medals whose evidence is in the banked stats or highscore tables. Idempotent. */
  _checkLifetime(quiet) {
    const st = Save.data.stats || {};
    const kills = lifetimeKills(null);
    for (const [goal, id] of KILL_MILESTONES) if (kills >= goal) this.unlock(id, { quiet });
    if ((st.maxStage || 0) >= GOAL.stormStage) this.unlock('stormFront', { quiet });
    if ((st.bestEndlessWave || 0) >= GOAL.endlessWaves) this.unlock('gale', { quiet });
    if ((st.bestEndlessWave || 0) >= GOAL.endlessWavesLong) this.unlock('eyeOfGale', { quiet });
    if ((st.bestCombo || 0) >= GOAL.comboChain) this.unlock('comboFive', { quiet });
    if ((progress().bombKills || 0) >= GOAL.bombKills) this.unlock('shockAndBallast', { quiet });
    if (bossDefeated('ironMatriarch')) this.unlock('matriarch', { quiet });
    if (BOSS_IDS.every(bossDefeated)) this.unlock('fiveCaptains', { quiet });

    const hs = Save.data.highscores || {};
    const daily = Object.values(hs.daily || {});
    for (const e of hs.campaign || []) {
      if (!e) continue;
      if (e.victory) this.unlock('grandVoyage', { quiet });
      if (e.victory && e.hull === 'tinker') this.unlock('folly', { quiet });
      if ((e.level || 0) >= GOAL.level) this.unlock('ascendant', { quiet });
    }
    for (const e of hs.bossRush || []) if (e?.victory) this.unlock('gauntlet', { quiet });
    for (const e of hs.endless || []) if ((e?.level || 0) >= GOAL.level) this.unlock('ascendant', { quiet });
    if (daily.some((e) => e?.victory) || progress().dailyWins.length) this.unlock('squallChaser', { quiet });
    if (dailyWinDays() >= GOAL.squallDays) this.unlock('doubleSquall', { quiet });
  }

  /** Cogs, Workshop and hangar medals. Cheap, so it also runs on every screen change. */
  _checkEconomy(quiet) {
    const meta = Save.data.meta || {};
    if ((meta.totalCogs || 0) >= GOAL.cogs) this.unlock('cogHoarder', { quiet });
    const levels = meta.workshop || {};
    let bought = 0;
    let maxed = 0;
    for (const item of WORKSHOP) {
      const lv = Math.min(item.maxLevel, Math.max(0, Math.floor(Number(levels[item.id]) || 0)));
      bought += lv;
      if (lv >= item.maxLevel) maxed++;
    }
    if (bought >= GOAL.workshopLevels) this.unlock('tinkeringHands', { quiet });
    if (WORKSHOP.length && maxed === WORKSHOP.length) this.unlock('shipwright', { quiet });
    const hulls = meta.unlockedHulls || [];
    if (HULL_ORDER.every((id) => hulls.includes(id))) this.unlock('fullHangar', { quiet });
  }

  _retroactive() {
    const before = unlockedCount();
    this._checkLifetime(true);
    this._checkEconomy(true);
    this.recovered = unlockedCount() - before;
  }

  _onScreen() {
    if (this.recovered > 0) {
      const n = this.recovered;
      this.recovered = 0;
      try {
        this.game?.ui?.toast?.(`${n} medal${n === 1 ? '' : 's'} recovered from your logbook`, {
          icon: 'icon_medal_gold',
          kind: 'info',
        });
      } catch {
        /* cosmetic */
      }
    }
    this._checkEconomy(false);
  }
}
