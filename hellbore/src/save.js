// Local persistence for settings, records and unlocks. Storage can be unavailable, so every access is guarded.
const KEY = 'hellbore.save.v1';

const DEFAULTS = {
  settings: {
    master: 0.8,
    music: 0.6,
    sfx: 0.8,
    shake: true,
    aimAssist: true,
    autoFire: false,
    showFps: false,
  },
  records: {
    bestDepth: 0,
    bestScore: 0,
    kills: 0,
    runs: 0,
    bosses: 0,
    wins: 0,
    ore: 0,
    deepestStratum: 0,
  },
  bossKills: [0, 0, 0, 0, 0, 0],
  lastRig: 'mole',
  daily: null,
};

const clone = (o) => JSON.parse(JSON.stringify(o));

export function loadSave() {
  const data = clone(DEFAULTS);
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      Object.assign(data.settings, s.settings || {});
      Object.assign(data.records, s.records || {});
      if (Array.isArray(s.bossKills)) s.bossKills.forEach((v, i) => (data.bossKills[i] = v | 0));
      if (typeof s.lastRig === 'string') data.lastRig = s.lastRig;
      if (s.daily && typeof s.daily.date === 'string') data.daily = s.daily;
    }
  } catch {
    // Private mode or blocked storage: play with defaults.
  }
  return data;
}

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Nothing to do; progress just won't persist.
  }
}

export function rigUnlocked(save, rig) {
  if (!rig.unlock) return true;
  return (save.bossKills[rig.unlock.boss] || 0) > 0;
}
