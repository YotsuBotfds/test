// WP8 — music theory toolkit for the generative score: keys & modes, roman-numeral chords,
// the compact melody/pattern notations used by music-tracks.js, chord voicing and seeded RNG.
// Pure functions, no WebAudio — importable from node for validation.

/** Pitch classes. */
export const PC = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8,
  A: 9, 'A#': 10, Bb: 10, B: 11,
};

/** Scale step tables (semitones above the tonic). */
export const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
};

export const mod = (a, n) => ((a % n) + n) % n;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---- Seeded randomness ------------------------------------------------------------------------

/** FNV-1a string hash → uint32. */
export function hash(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 → () => [0,1). */
export function rng(seed) {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];

// ---- Keys -------------------------------------------------------------------------------------

/**
 * Key context. `d` is a diatonic index (0 = tonic, 7 = tonic an octave up, -1 = leading tone below).
 * @param {string} key e.g. 'D', 'Bb'
 * @param {string} mode key of MODES
 */
export function makeKey(key, mode = 'major') {
  const pc = PC[key] ?? 0;
  const scale = MODES[mode] || MODES.major;
  const inScale = new Array(12).fill(false);
  for (const s of scale) inScale[(pc + s) % 12] = true;
  return {
    pc,
    mode,
    scale,
    inScale,
    /** Midi of the tonic closest to `reg`. */
    tonicNear(reg) {
      let m = reg - mod(reg - pc, 12);
      if (reg - m > 6) m += 12;
      return m;
    },
    /** Midi for diatonic index `d` (+ chromatic `acc`) relative to `tonic` midi. */
    midi(tonic, d, acc = 0) {
      return tonic + 12 * Math.floor(d / 7) + scale[mod(d, 7)] + acc;
    },
    /** Nearest diatonic index (and accidental) for a midi note, relative to `tonic`. */
    dOf(tonic, m) {
      const rel = m - tonic;
      const oct = Math.floor(rel / 12);
      const r = mod(rel, 12);
      let i = 6;
      while (i > 0 && scale[i] > r) i--;
      return { d: oct * 7 + i, acc: r - scale[i] };
    },
  };
}

/** Nearest midi with pitch class `pc` to `reg` (ties go down). */
export function nearPc(reg, pc) {
  let m = reg - mod(reg - pc, 12);
  if (reg - m > 6) m += 12;
  return m;
}

// ---- Chords -----------------------------------------------------------------------------------

const RN = /^([b#]?)(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(°|o|ø|\+)?(maj7|7|sus4|sus2|6|add9)?$/;
const RN_IDX = { i: 0, ii: 1, iii: 2, iv: 3, v: 4, vi: 5, vii: 6 };
const chordCache = new Map();

/**
 * Roman numeral → chord. Uppercase major, lowercase minor, ° dim, ø half-dim, + aug, b/# root
 * alteration relative to the mode's degree, suffixes 7 maj7 sus4 sus2 6 add9.
 * Roots come from the *mode's* scale, so in minor `III`=relative major, `V`=major dominant.
 */
export function parseChord(sym, key) {
  const ck = `${sym}|${key.pc}|${key.mode}`;
  const hit = chordCache.get(ck);
  if (hit) return hit;
  const m = RN.exec(sym);
  let out;
  if (!m) {
    out = { sym, deg: 0, root: key.pc, iv: [0, 4, 7], has: pcsMask(key.pc, [0, 4, 7]) };
  } else {
    const upper = m[2] === m[2].toUpperCase();
    const deg = RN_IDX[m[2].toLowerCase()];
    const acc = m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0;
    const root = mod(key.pc + key.scale[deg] + acc, 12);
    let iv;
    const q = m[3];
    if (q === '°' || q === 'o') iv = [0, 3, 6];
    else if (q === 'ø') iv = [0, 3, 6, 10];
    else if (q === '+') iv = [0, 4, 8];
    else iv = upper ? [0, 4, 7] : [0, 3, 7];
    const ext = m[4];
    if (ext === '7') iv = iv.length > 3 ? iv : [...iv, q === '°' || q === 'o' ? 9 : 10];
    else if (ext === 'maj7') iv = [...iv, 11];
    else if (ext === 'sus4') iv = [0, 5, 7];
    else if (ext === 'sus2') iv = [0, 2, 7];
    else if (ext === '6') iv = [...iv, 9];
    else if (ext === 'add9') iv = [...iv, 2];
    out = { sym, deg, root, iv, has: pcsMask(root, iv) };
  }
  chordCache.set(ck, out);
  return out;
}

function pcsMask(root, iv) {
  const has = new Array(12).fill(false);
  for (const i of iv) has[(root + i) % 12] = true;
  return has;
}

/**
 * Parse a progression: bars separated by whitespace, chords inside a bar separated by ','
 * (equal split, snapped to beats). Returns [[{at, chord}]] per bar.
 */
export function parseProg(str, key, beats, sub) {
  const steps = beats * sub;
  return String(str)
    .trim()
    .split(/\s+/)
    .map((bar) => {
      const syms = bar.split(',');
      return syms.map((s, i) => ({
        at: Math.round((i * beats) / syms.length) * sub,
        chord: parseChord(s, key),
        steps,
      }));
    });
}

/** Chord active at `at` (steps) within a bar's chord list. */
export function chordAt(list, at) {
  let c = list[0];
  for (let i = 1; i < list.length; i++) if (list[i].at <= at) c = list[i];
  return c.chord;
}

// ---- Notations --------------------------------------------------------------------------------

const TOK = /^(-|_|([#b]?)([1-7])([',]*))(?::(\d+(?:\.\d+)?))?$/;
const lineCache = new Map();

/**
 * Melody line: bars separated by '|', tokens `[#b]deg[',]:len` (deg 1..7, ' up an octave,
 * , down an octave, len in steps — omitted len repeats the previous one), `-:len` rest,
 * `_:len` extends the previous note. Returns bars of {at, len, d, acc} / {at, len, rest}.
 */
export function parseLine(str) {
  const hit = lineCache.get(str);
  if (hit) return hit;
  let lastLen = 1;
  const bars = String(str)
    .split('|')
    .map((bs) => {
      const notes = [];
      let at = 0;
      for (const tok of bs.trim().split(/\s+/).filter(Boolean)) {
        const m = TOK.exec(tok);
        if (!m) continue;
        const len = m[5] ? Number(m[5]) : lastLen;
        lastLen = len;
        if (m[1] === '-') notes.push({ at, len, rest: true });
        else if (m[1] === '_') {
          const prev = notes[notes.length - 1];
          if (prev) prev.len += len;
        } else {
          const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
          const oct = (m[4].match(/'/g) || []).length - (m[4].match(/,/g) || []).length;
          notes.push({ at, len, d: Number(m[3]) - 1 + 7 * oct, acc });
        }
        at += len;
      }
      return notes;
    });
  lineCache.set(str, bars);
  return bars;
}

/** Total length (steps) of a parsed bar. */
export const barLen = (notes) => notes.reduce((s, n) => Math.max(s, n.at + n.len), 0);

const patCache = new Map();

/**
 * Step pattern: one char per step, spaces and '|' ignored, '-' rest, '_' extends the previous
 * event. Returns {len, ev: [{at, c, len}]}.
 */
export function parsePat(str) {
  const hit = patCache.get(str);
  if (hit) return hit;
  const s = String(str).replace(/[\s|]/g, '');
  const ev = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '-') continue;
    if (c === '_') {
      const prev = ev[ev.length - 1];
      if (prev && prev.at + prev.len === i) prev.len++;
      continue;
    }
    ev.push({ at: i, c, len: 1 });
  }
  const out = { len: s.length || 1, ev };
  patCache.set(str, out);
  return out;
}

/** Events of a (possibly multi-bar or shorter-than-bar) pattern that fall in bar `bar`. */
export function patBar(str, bar, steps) {
  const p = parsePat(str);
  const out = [];
  if (p.len >= steps) {
    const bars = Math.max(1, Math.round(p.len / steps));
    const off = (bar % bars) * steps;
    for (const e of p.ev) if (e.at >= off && e.at < off + steps) out.push({ at: e.at - off, c: e.c, len: e.len });
  } else {
    for (let k = 0; k * p.len < steps; k++) {
      for (const e of p.ev) {
        const at = e.at + k * p.len;
        if (at < steps) out.push({ at, c: e.c, len: e.len });
      }
    }
  }
  return out;
}

// ---- Voicing ----------------------------------------------------------------------------------

/**
 * Close-position voicing of `n` notes inside [lo, hi] nearest to `prev` (smooth voice leading).
 * Prefers keeping the third.
 */
export function voiceChord(chord, prev, n, lo, hi) {
  let best = null;
  let bestScore = Infinity;
  const third = (chord.root + (chord.iv[1] ?? 4)) % 12;
  const center = (lo + hi) / 2;
  for (let m = lo; m <= hi; m++) {
    if (!chord.has[m % 12]) continue;
    const v = [m];
    let x = m;
    while (v.length < n) {
      x++;
      if (chord.has[x % 12]) v.push(x);
    }
    if (v[v.length - 1] > hi + 2) break;
    let score = 0;
    if (prev && prev.length === n) for (let i = 0; i < n; i++) score += Math.abs(v[i] - prev[i]);
    else score = Math.abs((v[0] + v[n - 1]) / 2 - center) * 1.5;
    if (!v.some((q) => q % 12 === third)) score += 7;
    if (!v.some((q) => q % 12 === chord.root)) score += 3;
    if (score < bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return best || [nearPc(center, chord.root)];
}

/**
 * Snap an accidental so a scale tone that clashes with a chromatic chord tone (e.g. C against
 * an A-major chord in D minor) becomes that chord tone. Returns the accidental to use.
 */
export function fitAcc(key, tonic, d, chord) {
  const m = key.midi(tonic, d, 0);
  const pc = mod(m, 12);
  if (chord.has[pc]) return 0;
  const up = (pc + 1) % 12;
  const dn = (pc + 11) % 12;
  if (chord.has[up] && !key.inScale[up]) return 1;
  if (chord.has[dn] && !key.inScale[dn]) return -1;
  return 0;
}

/** Is diatonic index d (with acc) a chord tone? */
export function isChordTone(key, tonic, d, acc, chord) {
  return chord.has[mod(key.midi(tonic, d, acc), 12)];
}
