// Persistent save data in localStorage (DESIGN §4.12). Survives missing/blocked storage.

import { STORAGE_KEY } from '../config.js';
import { events } from './events.js';

/** OS-level "reduce motion": a fresh save starts with shake & flashes off (players can re-enable). */
function prefersReducedMotion() {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function defaultSave() {
  const calm = prefersReducedMotion();
  return {
    version: 3,
    settings: {
      master: 0.8,
      music: 0.6,
      sfx: 0.8,
      shake: calm ? 0 : 1,
      flashes: !calm,
      damageNumbers: true,
      autoFire: false,
      aimAssist: true,
      showFps: false,
      leftHanded: false,
      touchOpacity: 0.55,
      haptics: true,
      quality: 'auto',
    },
    meta: {
      cogs: 0,
      totalCogs: 0,
      workshop: {},
      unlockedHulls: ['dauntless'],
      unlockedWeapons: ['brassCannon'],
      hull: 'dauntless',
      weapon: 'brassCannon',
    },
    codex: { enemies: {}, bosses: {}, weapons: {}, upgrades: {} },
    stats: {
      runs: 0,
      wins: 0,
      /** Grand Voyage (campaign) victories only; `wins` counts every mode. */
      campaignWins: 0,
      kills: 0,
      bossKills: 0,
      deaths: 0,
      playTime: 0,
      bestScore: 0,
      bestCombo: 0,
      maxStage: 0,
      cogsEarned: 0,
      bestEndlessWave: 0,
    },
    highscores: { campaign: [], endless: [], bossRush: [], daily: {} },
    /** Milestone unlocks that are not hull/cannon lists (e.g. bossRush: Grand Voyage won). */
    unlocks: {},
    achievements: {},
    achProgress: { bombKills: 0, bosses: {} },
    tutorialSeen: false,
  };
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Deep-merge saved values over defaults so new fields appear after updates. A saved value whose
 * type doesn't match its default (old build, hand-edited or damaged save) keeps the default;
 * keys the defaults lack pass through as saved. `bad` counts the values dropped.
 */
function merge(base, saved, bad = { n: 0 }) {
  if (!isObj(saved)) {
    if (saved !== null && saved !== undefined) bad.n++;
    return base;
  }
  const out = { ...base };
  for (const k of Object.keys(saved)) {
    const b = base[k];
    const s = saved[k];
    let ok = true;
    if (isObj(b)) ok = isObj(s);
    else if (Array.isArray(b)) ok = Array.isArray(s);
    else if (typeof b === 'number') ok = Number.isFinite(s);
    else if (b !== null && b !== undefined) ok = typeof s === typeof b;
    if (!ok) bad.n++;
    out[k] = !ok ? b : isObj(b) ? merge(b, s, bad) : s;
  }
  return out;
}

function readRaw() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

class SaveStore {
  constructor() {
    this._timer = 0;
    /** True when the stored save was damaged and (partly) reset at load. */
    this.repaired = false;
    const raw = readRaw();
    const bad = { n: 0 };
    try {
      let saved = null;
      try {
        saved = raw ? JSON.parse(raw) : null;
      } catch {
        bad.n++;
      }
      this.data = merge(defaultSave(), saved, bad);
      this._migrate();
    } catch (err) {
      console.error('[save] load failed, starting fresh', err);
      bad.n++;
      this.data = defaultSave();
    }
    if (bad.n && raw) {
      // Keep the damaged original so progress can be recovered by hand.
      this.repaired = true;
      console.warn(`[save] repaired ${bad.n} damaged value(s); original kept as ${STORAGE_KEY}.corrupt-*`);
      try {
        localStorage.setItem(`${STORAGE_KEY}.corrupt-${Date.now()}`, raw);
      } catch {
        /* storage full or blocked */
      }
    }
  }

  /** Upgrade older saves in place. */
  _migrate() {
    const d = this.data;
    if (!(d.version >= 2)) {
      // v1 stored the old default quality 'high'; 'auto' (governed) is the new default.
      if (d.settings.quality === 'high') d.settings.quality = 'auto';
      d.achProgress ||= { bombKills: 0, bosses: {} };
      d.version = 2;
    }
    if (!(d.version >= 3)) {
      // v2 unlocked the Gauntlet / Bane on any victory (Daily too): players who already had one
      // keep the Gauntlet; campaign wins are recounted from the records board.
      const camp = (d.highscores?.campaign || []).filter((e) => e?.victory).length;
      d.stats.campaignWins = Math.max(d.stats.campaignWins || 0, camp);
      if ((d.stats.wins || 0) > 0) d.unlocks.bossRush = true;
      d.version = 3;
    }
  }

  get settings() {
    return this.data.settings;
  }

  get meta() {
    return this.data.meta;
  }

  /** Debounced persist. */
  save() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.saveNow(), 250);
  }

  saveNow() {
    clearTimeout(this._timer);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      /* storage full or blocked: keep playing */
    }
  }

  reset() {
    this.data = defaultSave();
    this.saveNow();
    events.emit('settings:change', { settings: this.data.settings });
  }

  /** Update settings and broadcast. */
  setSetting(key, value) {
    this.data.settings[key] = value;
    this.save();
    events.emit('settings:change', { settings: this.data.settings });
  }

  /**
   * Insert a score into a mode's table (top 10, descending).
   * @returns {number} rank (0-based) or -1 if it didn't place
   */
  addHighscore(mode, entry) {
    if (mode === 'daily') {
      const key = entry.day;
      const prev = this.data.highscores.daily[key];
      if (!prev || entry.score > prev.score) {
        this.data.highscores.daily[key] = entry;
        this.save();
        return 0;
      }
      return -1;
    }
    const list = (this.data.highscores[mode] ||= []);
    list.push(entry);
    list.sort((a, b) => b.score - a.score);
    const rank = list.indexOf(entry);
    list.length = Math.min(list.length, 10);
    this.save();
    return rank < 10 ? rank : -1;
  }

  /** Unlock a hull or weapon id. kind: 'hull' | 'weapon'. Returns true if newly unlocked. */
  unlock(kind, id) {
    const list = kind === 'hull' ? this.data.meta.unlockedHulls : this.data.meta.unlockedWeapons;
    if (list.includes(id)) return false;
    list.push(id);
    this.save();
    return true;
  }

  isUnlocked(kind, id) {
    const list = kind === 'hull' ? this.data.meta.unlockedHulls : this.data.meta.unlockedWeapons;
    return list.includes(id);
  }

  /** Mark a codex entry discovered. section: enemies|bosses|weapons|upgrades. */
  discover(section, id, inc = 1) {
    const sec = (this.data.codex[section] ||= {});
    const isNew = !sec[id];
    sec[id] = (sec[id] || 0) + inc;
    this.save();
    return isNew;
  }
}

export const Save = new SaveStore();

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => Save.saveNow());
}
