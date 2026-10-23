// Persistent save data in localStorage (DESIGN §4.12). Survives missing/blocked storage.

import { STORAGE_KEY } from '../config.js';
import { events } from './events.js';

export function defaultSave() {
  return {
    version: 1,
    settings: {
      master: 0.8,
      music: 0.6,
      sfx: 0.8,
      shake: 1,
      flashes: true,
      damageNumbers: true,
      autoFire: false,
      aimAssist: true,
      showFps: false,
      leftHanded: false,
      touchOpacity: 0.55,
      haptics: true,
      quality: 'high',
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
    achievements: {},
    tutorialSeen: false,
  };
}

/** Deep-merge saved values over defaults so new fields appear after updates. */
function merge(base, saved) {
  if (saved === null || typeof saved !== 'object' || Array.isArray(saved)) return saved ?? base;
  const out = Array.isArray(base) ? [] : { ...base };
  for (const k of Object.keys(saved)) {
    const b = base?.[k];
    const s = saved[k];
    out[k] =
      b && typeof b === 'object' && !Array.isArray(b) && s && typeof s === 'object' && !Array.isArray(s)
        ? merge(b, s)
        : s;
  }
  return out;
}

function readRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

class SaveStore {
  constructor() {
    this.data = merge(defaultSave(), readRaw() || {});
    this._timer = 0;
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
