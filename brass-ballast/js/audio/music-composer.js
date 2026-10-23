// WP8 — the composer: walks a track's form section by section and turns its data (progressions,
// written themes, step patterns) into one bar of note events at a time. Written themes are
// varied on every repeat (passing tones, neighbours, dotted rhythms, scalar runs, turns, echoes)
// and `improv` sections invent fresh melodies from the theme's rhythmic cells over their own
// progression, so a loop never plays back identically. Pure JS (no WebAudio).

import {
  makeKey, parseProg, parseLine, chordAt, patBar, voiceChord, fitAcc, isChordTone, nearPc,
  rng, hash, pick, clamp, mod, barLen,
} from './music-theory.js';

/** Drum pattern chars → [velocity, variant, roll]. */
const DRUM = {
  X: [1], x: [0.8], o: [0.58], '.': [0.32], O: [0.8, 'open'], R: [0.95, null, true],
  r: [0.6, null, true], h: [0.72, 'h'], H: [1, 'h'], m: [0.72, 'm'], M: [1, 'm'], l: [0.72, 'l'],
  L: [1, 'l'], v: [0.75, 'v'], V: [1, 'v'],
};

/** Phrase arc over 4 bars: lean in, swell into bar 3, relax on the cadence. */
const PHRASE = [0.94, 1, 1.06, 0.9];

/** Velocity accents: downbeat, beat, off-beat — shaped by the phrase arc. */
function accent(x, at) {
  const arc = PHRASE[x.b % 4];
  if (at === 0) return arc;
  if (at % x.sub === 0) return 0.86 * arc;
  return 0.74 * arc;
}

/** Choose this bar's pattern from tiers / fills / alternatives. */
function choosePat(p, x) {
  let pat = null;
  if (x.last && p.turn && x.si >= (p.turnMin ?? 0)) pat = p.turn;
  else if (x.last && p.fill && x.si >= (p.fillMin ?? 0.35) && x.s.bars > 1) pat = p.fill;
  else if (x.phraseEnd && !x.last && p.fill4 && x.si >= (p.fill4Min ?? 0.72)) pat = p.fill4;
  else {
    const t = p.pats;
    if (typeof t === 'string' || Array.isArray(t)) pat = t;
    else if (t) pat = (x.si >= 0.75 && t.hi) || (x.si >= 0.42 && t.mid) || t.lo || t.mid || t.hi;
  }
  if (Array.isArray(pat)) pat = pat[Math.floor(x.r() * pat.length) % pat.length];
  return pat;
}

// ---- Part generators --------------------------------------------------------------------------

const GEN = {
  /** The section's written / varied / improvised theme. */
  melody(c, p, x, ev) {
    const bars = p.src === 'ctr' ? x.s.ctr : x.s.mel;
    const notes = bars?.[x.b];
    if (!notes) return;
    const key = x.s.key;
    const tonic = key.tonicNear(p.reg ?? 62);
    for (const n of notes) {
      if (n.rest) continue;
      const midi = key.midi(tonic, n.d, n.acc) + (p.tr || 0);
      ev.push({
        at: n.at, len: n.len * (p.legato ?? 0.92), ch: p.ch, midi, lead: true,
        vel: (p.vel ?? 0.9) * accent(x, n.at) * (n.v ?? 1) * (0.94 + x.r() * 0.1),
      });
    }
  },

  /** Algorithmic counter-melody: 'harmony' (3rds/6ths under the theme), 'fill', or 'line'. */
  counter(c, p, x, ev, st) {
    const key = x.s.key;
    const style = p.style || 'harmony';
    if (style === 'line') return counterLine(p, x, ev, st);
    const notes = x.s.mel?.[x.b];
    if (!notes) return;
    const tonic = key.tonicNear(p.reg ?? 62);
    if (style === 'harmony') {
      for (const n of notes) {
        if (n.rest) continue;
        const chord = chordAt(x.chords, n.at);
        const strong = n.at % x.sub === 0;
        let d = n.d - 2;
        let acc = fitAcc(key, tonic, d, chord);
        if (strong && !isChordTone(key, tonic, d, acc, chord)) {
          for (const k of [3, 4, 5]) {
            const a2 = fitAcc(key, tonic, n.d - k, chord);
            if (isChordTone(key, tonic, n.d - k, a2, chord)) {
              d = n.d - k;
              acc = a2;
              break;
            }
          }
        }
        ev.push({
          at: n.at, len: n.len * (p.legato ?? 0.9), ch: p.ch, midi: key.midi(tonic, d, acc) + (p.tr || 0),
          vel: (p.vel ?? 0.7) * accent(x, n.at),
        });
      }
      return;
    }
    // 'fill': answer the theme with chord-tone figures wherever it holds a long note or rests.
    const rate = p.rate || (x.sub === 3 ? 1 : x.sub / 2);
    const lo = p.lo ?? 60;
    const hi = p.hi ?? 84;
    const up = (x.b + x.s.pass) % 2 === 0;
    for (const n of notes) {
      const hs = n.at + (n.rest ? 0 : x.sub);
      const he = n.at + n.len;
      if (he - hs < rate * 2) continue;
      const chord = chordAt(x.chords, hs);
      const tones = [];
      for (let m = lo; m <= hi; m++) if (chord.has[m % 12]) tones.push(m);
      if (!tones.length) continue;
      let i = up ? Math.floor(tones.length * 0.3) : Math.floor(tones.length * 0.7);
      let k = 0;
      for (let at = hs; at < he - 0.01 && k < (p.max ?? 6); at += rate, k++) {
        ev.push({ at, len: rate * 0.85, ch: p.ch, midi: tones[clamp(i, 0, tones.length - 1)], vel: (p.vel ?? 0.6) * (k ? 0.85 : 1) });
        i += up ? 1 : -1;
      }
    }
  },

  /** Bass from chord-tone step patterns: 1 3 5 7 8 0 b 2 4 6 s d a (approach) _ (hold). */
  bass(c, p, x, ev) {
    const pat = choosePat(p, x);
    if (!pat) return;
    for (const e of patBar(pat, x.b, x.steps)) {
      const chord = chordAt(x.chords, e.at);
      const root = nearPc(p.reg ?? 40, chord.bass ?? chord.root);
      let midi = root;
      switch (e.c) {
        case '3': midi = root + (chord.iv[1] ?? 4); break;
        case '5': midi = root + (chord.iv[2] ?? 7); break;
        case '7': midi = root + (chord.iv[3] ?? 12); break;
        case '8': midi = root + 12; break;
        case '0': midi = root - 12; break;
        case 'b': midi = root + 10; break;
        case '2': midi = root + 2; break;
        case '4': midi = root + 5; break;
        case '6': midi = root + ((chord.iv[1] ?? 4) === 3 ? 8 : 9); break;
        case 's': midi = root + 1; break;
        case 'd': midi = root - 1; break;
        case 'f': midi = root - 5; break;
        case 'a': {
          let nxt = x.next;
          for (const c2 of x.chords) if (c2.at > e.at) { nxt = c2.chord; break; }
          const nr = nearPc(root, nxt.root);
          midi = nr === root ? root - 5 : nr + (nr > root ? -1 : 1);
          break;
        }
        default: break;
      }
      ev.push({
        at: e.at, len: e.len * (p.legato ?? 0.85), ch: p.ch, midi: midi + (p.tr || 0),
        vel: (p.vel ?? 0.9) * accent(x, e.at) * (0.95 + x.r() * 0.08),
      });
    }
  },

  /** Block chords from a hit pattern (X x o . accents, _ sustain), voice-led. */
  chords(c, p, x, ev, st) {
    const pat = choosePat(p, x);
    if (!pat) return;
    const [lo, hi] = p.range || [55, 72];
    for (const e of patBar(pat, x.b, x.steps)) {
      const chord = chordAt(x.chords, e.at);
      if (st.chord !== chord) {
        st.v = voiceChord(chord, st.v, p.n || 3, lo, hi);
        st.chord = chord;
      }
      const vel = (p.vel ?? 0.7) * (DRUM[e.c]?.[0] ?? 0.8);
      const strum = p.strum || 0;
      st.v.forEach((m, k) => {
        ev.push({ at: e.at + k * strum, len: e.len * (p.legato ?? 0.9) - k * strum, ch: p.ch, midi: m + (p.tr || 0), vel: vel * (k ? 0.88 : 1), soft: true });
      });
    }
  },

  /** Arpeggio: digits index the voiced chord (wrapping up by octaves). */
  arp(c, p, x, ev, st) {
    const pat = choosePat(p, x);
    if (!pat) return;
    const [lo, hi] = p.range || [60, 84];
    const n = p.n || 3;
    for (const e of patBar(pat, x.b, x.steps)) {
      const idx = e.c.charCodeAt(0) - 48;
      if (idx < 0 || idx > 9) continue;
      const chord = chordAt(x.chords, e.at);
      if (st.chord !== chord) {
        st.v = voiceChord(chord, st.v, n, lo, hi);
        st.chord = chord;
      }
      const midi = st.v[idx % n] + 12 * Math.floor(idx / n);
      ev.push({
        at: e.at, len: e.len * (p.legato ?? 0.9), ch: p.ch, midi: midi + (p.tr || 0), soft: true,
        vel: (p.vel ?? 0.6) * accent(x, e.at) * (0.92 + x.r() * 0.12),
      });
    }
  },

  /** Percussion step patterns; `tuned` drums (timpani) follow the chord root, 'v' = fifth. */
  drum(c, p, x, ev) {
    const pat = choosePat(p, x);
    if (!pat) return;
    for (const e of patBar(pat, x.b, x.steps)) {
      const d = DRUM[e.c];
      if (!d) continue;
      let midi = p.midi ?? 0;
      if (p.tuned) {
        const chord = chordAt(x.chords, e.at);
        midi = nearPc(p.reg ?? 45, chord.root);
        if (d[1] === 'v') midi -= 5;
      }
      ev.push({
        at: e.at, len: e.len, ch: p.ch, midi, v: d[1] || null, roll: !!d[2],
        vel: (p.vel ?? 0.9) * d[0] * (0.93 + x.r() * 0.1),
      });
    }
  },

  /** Random sparkles drawn from the chord in a high register. */
  sparkle(c, p, x, ev) {
    const [lo, hi] = p.range || [84, 98];
    const res = p.res || 1;
    for (let at = 0; at < x.steps; at += res) {
      if (x.r() >= (p.p ?? 0.1)) continue;
      const chord = chordAt(x.chords, at);
      const tones = [];
      for (let m = lo; m <= hi; m++) if (chord.has[m % 12]) tones.push(m);
      if (!tones.length) continue;
      ev.push({ at, len: p.len ?? 2, ch: p.ch, midi: pick(x.r, tones), vel: (p.vel ?? 0.6) * (0.55 + x.r() * 0.45) });
    }
  },

  /** One-off accents: section start/end, every N bars (bells, whistles, crashes, stabs). */
  hit(c, p, x, ev, st) {
    const when = p.when || 'start';
    const ok = (when === 'start' && x.b === 0) || (when === 'end' && x.last) || (when === 'every' && x.b % (p.every || 4) === 0) ||
      (when === 'phrase' && x.b % 4 === 0);
    if (!ok || x.r() > (p.p ?? 1)) return;
    const chord = chordAt(x.chords, p.step || 0);
    const vel = p.vel ?? 0.8;
    if (p.chord) {
      st.v = voiceChord(chord, st.v, p.n || 3, p.range?.[0] ?? 60, p.range?.[1] ?? 76);
      for (const m of st.v) ev.push({ at: p.step || 0, len: p.len ?? x.steps, ch: p.ch, midi: m, vel });
      return;
    }
    let midi = p.midi;
    if (midi == null) {
      const key = x.s.key;
      midi = p.deg != null ? key.midi(key.tonicNear(p.reg ?? 72), p.deg, 0) : nearPc(p.reg ?? 72, chord.root);
    }
    ev.push({ at: p.step || 0, len: p.len ?? x.steps, ch: p.ch, midi, vel, v: p.v || null, roll: !!p.roll });
  },
};

/** Guide-tone counter line: 3rds & 7ths voice-led smoothly, one or two notes per chord. */
function counterLine(p, x, ev, st) {
  const lo = p.lo ?? 55;
  const hi = p.hi ?? 72;
  const segs = x.chords;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const end = i + 1 < segs.length ? segs[i + 1].at : x.steps;
    const chord = seg.chord;
    const want = [chord.iv[1] ?? 4, chord.iv[3] ?? chord.iv[2] ?? 7];
    const cands = [];
    for (let m = lo; m <= hi; m++) {
      const iv = mod(m - chord.root, 12);
      if (want.includes(iv)) cands.push(m);
    }
    if (!cands.length) continue;
    const prev = st.prev ?? (lo + hi) / 2;
    cands.sort((a, b) => Math.abs(a - prev) - Math.abs(b - prev) || a - b);
    let m = cands[0];
    if (m === st.prev && cands[1] != null && x.r() < 0.35) m = cands[1];
    const len = end - seg.at;
    const split = len >= x.steps && x.r() < 0.4 + x.si * 0.3;
    if (split) {
      const h = Math.round(len / 2 / x.sub) * x.sub || Math.floor(len / 2);
      ev.push({ at: seg.at, len: h * 0.97, ch: p.ch, midi: m + (p.tr || 0), vel: p.vel ?? 0.7 });
      const tones = [];
      for (let q = m - 5; q <= m + 5; q++) if (q !== m && chord.has[mod(q, 12)]) tones.push(q);
      const m2 = tones.length ? pick(x.r, tones) : m;
      ev.push({ at: seg.at + h, len: (len - h) * 0.97, ch: p.ch, midi: m2 + (p.tr || 0), vel: (p.vel ?? 0.7) * 0.9 });
      st.prev = m2;
    } else {
      ev.push({ at: seg.at, len: len * 0.97, ch: p.ch, midi: m + (p.tr || 0), vel: p.vel ?? 0.7 });
      st.prev = m;
    }
  }
}

/**
 * Comping yields to the tune: drop chord/arp notes that would start a semitone (or minor 9th)
 * against a melody note that is sounding at that moment (e.g. a stab under a passing tone).
 */
function yieldToLead(ev) {
  const leads = ev.filter((e) => e.lead);
  if (!leads.length) return;
  for (let i = ev.length - 1; i >= 0; i--) {
    const e = ev[i];
    if (!e.soft) continue;
    for (const l of leads) {
      if (e.at < l.at || e.at >= l.at + l.len) continue;
      const iv = Math.abs(e.midi - l.midi) % 12;
      if (iv === 1 || iv === 11) {
        ev.splice(i, 1);
        break;
      }
    }
  }
}

// ---- Theme variation ---------------------------------------------------------------------------

const cloneBar = (bar) => bar.map((n) => ({ ...n }));
const sounding = (n) => n && !n.rest;

const OPS = {
  passing(notes, r) {
    const idx = [];
    for (let i = 0; i < notes.length - 1; i++) {
      const a = notes[i];
      const b = notes[i + 1];
      if (sounding(a) && sounding(b) && Math.abs(b.d - a.d) === 2 && a.len >= 2 && a.len % 2 === 0) idx.push(i);
    }
    if (!idx.length) return null;
    const i = pick(r, idx);
    const a = notes[i];
    const h = a.len / 2;
    const p = { at: a.at + h, len: h, d: a.d + Math.sign(notes[i + 1].d - a.d), acc: 0, gen: true };
    a.len = h;
    notes.splice(i + 1, 0, p);
    return notes;
  },
  neighbor(notes, r) {
    const idx = notes.map((n, i) => (sounding(n) && n.len >= 4 ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) return null;
    const i = pick(r, idx);
    const a = notes[i];
    const L = a.len;
    const h = Math.floor(L / 2);
    const q = Math.max(1, Math.floor(h / 2));
    const dir = r() < 0.65 ? 1 : -1;
    a.len = L - h;
    const add = [{ at: a.at + a.len, len: q, d: a.d + dir, acc: 0, gen: true }];
    if (h - q > 0) add.push({ at: a.at + a.len + q, len: h - q, d: a.d, acc: a.acc });
    notes.splice(i + 1, 0, ...add);
    return notes;
  },
  dotted(notes, r) {
    const idx = [];
    for (let i = 0; i < notes.length - 1; i++) {
      const a = notes[i];
      const b = notes[i + 1];
      if (sounding(a) && sounding(b) && a.len === b.len && a.len >= 2 && a.len % 2 === 0) idx.push(i);
    }
    if (!idx.length) return null;
    const i = pick(r, idx);
    const a = notes[i];
    const b = notes[i + 1];
    const h = a.len / 2;
    a.len += h;
    b.at += h;
    b.len -= h;
    return notes;
  },
  run(notes, r) {
    const idx = [];
    for (let i = 0; i < notes.length - 1; i++) {
      const a = notes[i];
      const b = notes[i + 1];
      const k = sounding(a) && sounding(b) ? Math.abs(b.d - a.d) : 0;
      if (k >= 3 && k <= 5 && a.len >= k) idx.push(i);
    }
    if (!idx.length) return null;
    const i = pick(r, idx);
    const a = notes[i];
    const b = notes[i + 1];
    const k = Math.abs(b.d - a.d);
    const dir = Math.sign(b.d - a.d);
    const keep = a.len - (k - 1);
    a.len = keep;
    const add = [];
    for (let j = 1; j < k; j++) add.push({ at: a.at + keep + (j - 1), len: 1, d: a.d + dir * j, acc: 0, gen: true, v: 0.85 });
    notes.splice(i + 1, 0, ...add);
    return notes;
  },
  turn(notes, r) {
    const idx = notes.map((n, i) => (sounding(n) && n.len >= 5 ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) return null;
    const i = pick(r, idx);
    const a = notes[i];
    const L = a.len;
    a.len = L - 3;
    notes.splice(i + 1, 0,
      { at: a.at + L - 3, len: 1, d: a.d + 1, acc: 0, gen: true, v: 0.85 },
      { at: a.at + L - 2, len: 1, d: a.d, acc: a.acc, v: 0.85 },
      { at: a.at + L - 1, len: 1, d: a.d - 1, acc: 0, gen: true, v: 0.85 });
    return notes;
  },
  approach(notes, r) {
    // Last step of a note becomes a step-wise approach (or anticipation) of the next note.
    const idx = [];
    for (let i = 0; i < notes.length - 1; i++) {
      const a = notes[i];
      const b = notes[i + 1];
      if (sounding(a) && sounding(b) && a.len >= 2 && b.d !== a.d) idx.push(i);
    }
    if (!idx.length) return null;
    const i = pick(r, idx);
    const a = notes[i];
    const b = notes[i + 1];
    a.len -= 1;
    const d = r() < 0.3 ? b.d : b.d + (b.d > a.d ? -1 : 1);
    notes.splice(i + 1, 0, { at: a.at + a.len, len: 1, d, acc: 0, gen: true, v: 0.82 });
    return notes;
  },
  leap(notes, r) {
    // Octave-up grace on a held note: the "music hall" flourish.
    const idx = notes.map((n, i) => (sounding(n) && n.len >= 3 ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) return null;
    const a = notes[pick(r, idx)];
    const h = Math.ceil(a.len / 2);
    // Low notes leap up the octave; high ones fall back a fourth so the line stays in range.
    const d = a.d <= 3 ? a.d + (r() < 0.6 ? 7 : 2) : a.d - (r() < 0.5 ? 3 : 2);
    const tail = { at: a.at + h, len: a.len - h, d, acc: d === a.d + 7 ? a.acc : 0, gen: true, v: 0.8 };
    a.len = h;
    notes.splice(notes.indexOf(a) + 1, 0, tail);
    return notes;
  },
  echo(notes, r) {
    const idx = [];
    for (let i = 1; i < notes.length; i++) if (notes[i].rest && notes[i].len >= 2 && sounding(notes[i - 1])) idx.push(i);
    if (!idx.length) return null;
    const i = pick(r, idx);
    const prev = notes[i - 1];
    const rs = notes[i];
    const d = prev.d <= 3 && r() < 0.5 ? prev.d + 7 : prev.d + (r() < 0.5 ? 2 : -2);
    notes[i] = { at: rs.at, len: Math.min(rs.len, 2), d, acc: 0, gen: true, v: 0.6 };
    if (rs.len > 2) notes.splice(i + 1, 0, { at: rs.at + 2, len: rs.len - 2, rest: true });
    return notes;
  },
};
const OP_NAMES = Object.keys(OPS);

function vary(bars, r, amt, key, chords) {
  const tonic = key.tonicNear(60);
  return bars.map((bar, bi) => {
    const notes = cloneBar(bar);
    if (bi === bars.length - 1 || r() > amt) return notes;
    // One ornament, sometimes two on later passes.
    const count = r() < amt * 0.4 ? 2 : 1;
    for (let k = 0; k < count; k++) {
      const order = OP_NAMES.slice().sort(() => r() - 0.5);
      for (const op of order) {
        if (OPS[op](notes, r)) break;
      }
    }
    const ch = chords[bi];
    if (ch) for (const n of notes) if (n.gen) n.acc = fitAcc(key, tonic, n.d, chordAt(ch, n.at));
    return notes;
  });
}

/** Snap a diatonic index to the nearest chord tone (searching outward, preferring `dir`). */
function snapChord(key, tonic, d, chord, dir, lo, hi, avoid = null) {
  for (const k of [0, dir, -dir, 2 * dir, -2 * dir, 3 * dir, -3 * dir]) {
    const q = d + k;
    if (q < lo || q > hi || q === avoid) continue;
    const acc = fitAcc(key, tonic, q, chord);
    if (isChordTone(key, tonic, q, acc, chord)) return { d: q, acc };
  }
  return { d, acc: fitAcc(key, tonic, d, chord) };
}

/** Invent a theme over `chords` from the rhythmic cells of written themes. */
function improvise(def, sd, key, chords, r, sub) {
  const from = sd.improv?.from || Object.keys(def.sections).filter((k) => def.sections[k].mel);
  const cells = [];
  const ds = [];
  for (const id of from) {
    const mel = def.sections[id]?.mel;
    if (!mel) continue;
    for (const bar of parseLine(mel)) {
      const s = bar.filter(sounding);
      for (const n of s) ds.push(n.d);
      if (s.length >= 2) cells.push(bar);
    }
  }
  if (!cells.length) return null;
  const lo = Math.min(...ds) + (sd.improv?.shift || 0);
  const hi = Math.max(...ds) + (sd.improv?.shift || 0);
  const tonic = key.tonicNear(60);
  let prev = Math.round((lo + hi) / 2);
  let dir = r() < 0.5 ? -1 : 1;
  const bars = [];
  for (let b = 0; b < chords.length; b++) {
    const ch = chords[b];
    let notes;
    if (b % 2 === 1 && bars[b - 1] && r() < 0.55) {
      // Sequence: repeat the previous bar moved by the chord-root motion, then re-fit.
      let shift = ch[0].chord.deg - chords[b - 1][0].chord.deg;
      if (shift > 3) shift -= 7;
      if (shift < -3) shift += 7;
      notes = bars[b - 1].map((n) => (n.rest ? { ...n } : { ...n, d: clamp(n.d + shift, lo, hi), gen: true }));
      for (const n of notes) {
        if (n.rest) continue;
        const chord = chordAt(ch, n.at);
        if (n.at % sub === 0) Object.assign(n, snapChord(key, tonic, n.d, chord, 1, lo, hi));
        else n.acc = fitAcc(key, tonic, n.d, chord);
        prev = n.d;
      }
    } else {
      notes = pick(r, cells).map((n) => ({ at: n.at, len: n.len, rest: !!n.rest }));
      for (const n of notes) {
        if (n.rest) continue;
        const chord = chordAt(ch, n.at);
        if (prev >= hi - 1) dir = -1;
        else if (prev <= lo + 1) dir = 1;
        else if (r() < 0.28) dir = -dir;
        if (n.at % sub === 0 || n.len >= sub) {
          const s = snapChord(key, tonic, prev + dir * (r() < 0.5 ? 1 : 2), chord, dir, lo, hi, r() < 0.8 ? prev : null);
          n.d = s.d;
          n.acc = s.acc;
        } else {
          n.d = clamp(prev + dir * (r() < 0.82 ? 1 : 2), lo, hi);
          n.acc = fitAcc(key, tonic, n.d, chord);
        }
        n.gen = true;
        prev = n.d;
      }
    }
    bars.push(notes);
  }
  // Cadence: land the last sounding note on the final chord's root, held to the bar end.
  const last = bars[bars.length - 1];
  const fin = [...last].reverse().find(sounding);
  if (fin) {
    const chord = chordAt(chords[chords.length - 1], fin.at);
    for (const k of [0, -1, 1, -2, 2, -3, 3, -4, 4]) {
      const q = fin.d + k;
      const acc = fitAcc(key, tonic, q, chord);
      if (mod(key.midi(tonic, q, acc), 12) === chord.root) {
        fin.d = q;
        fin.acc = acc;
        break;
      }
    }
  }
  return bars;
}

// ---- Composer ---------------------------------------------------------------------------------

export class Composer {
  /**
   * @param {object} def track definition (music-tracks.js)
   * @param {number} seed
   */
  constructor(def, seed = 1) {
    this.def = def;
    this.seed = seed >>> 0;
    this.sub = def.sub;
    this.steps = def.beats * def.sub;
    this.intro = def.form?.intro || [];
    this.loop = def.form?.loop || Object.keys(def.sections);
    this.ip = 0;
    this.lp = 0;
    this.passes = {};
    this.state = def.parts.map(() => ({}));
    this.sec = null;
    this.secBar = 0;
    this.bars = 0;
  }

  _nextId(peek = false) {
    if (this.ip < this.intro.length) {
      const id = this.intro[this.ip];
      if (!peek) this.ip++;
      return id;
    }
    const id = this.loop[this.lp % this.loop.length];
    if (!peek) this.lp++;
    return id;
  }

  _key(sd, pass = 0) {
    // `lift`: every other pass the section modulates up (the shanty-chorus key change).
    const shift = sd.lift && pass % 2 === 1 ? sd.lift : 0;
    return makeKey(sd.key || this.def.key, sd.mode || this.def.mode, shift);
  }

  _enter(id) {
    const def = this.def;
    const sd = def.sections[id];
    const pass = (this.passes[id] = (this.passes[id] ?? -1) + 1);
    const key = this._key(sd, pass);
    const progStr = pass % 2 === 1 && sd.prog2 ? sd.prog2 : sd.prog;
    const chords = parseProg(progStr, key, def.beats, def.sub);
    const r = rng(this.seed ^ hash(id) ^ Math.imul(pass + 1, 0x9e3779b1));
    let mel = null;
    if (sd.mel) {
      mel = parseLine(sd.mel);
      if (pass > 0 && sd.vary !== 0) mel = vary(mel, r, Math.min(0.9, (sd.vary ?? 0.55) + 0.12 * (pass - 1)), key, chords);
    } else if (sd.improv) {
      mel = improvise(def, sd, key, chords, r, def.sub);
    }
    const tempo = sd.tempo || def.tempo;
    this.sec = {
      id, sd, pass, key, chords, mel, bars: chords.length,
      ctr: sd.ctr ? parseLine(sd.ctr) : null,
      stepDur: 60 / tempo / def.sub,
    };
    this.secBar = 0;
  }

  _peekChord() {
    const id = this._nextId(true);
    const sd = this.def.sections[id];
    const key = this._key(sd, (this.passes[id] ?? -1) + 1);
    return parseProg(sd.prog, key, this.def.beats, this.def.sub)[0][0].chord;
  }

  /** Current position, for debugging / the preview page. */
  where() {
    return { section: this.sec?.id ?? null, bar: this.secBar, pass: this.sec?.pass ?? 0, bars: this.bars };
  }

  /**
   * Compose the next bar.
   * @param {number} si smoothed effective intensity 0..1
   * @returns {{dur: number, ev: object[], sec: string, bar: number, energy: number}}
   */
  nextBar(si) {
    if (!this.sec || this.secBar >= this.sec.bars) this._enter(this._nextId());
    const s = this.sec;
    const b = this.secBar;
    const r = rng(this.seed ^ hash(s.id) ^ Math.imul(s.pass + 1, 977) ^ Math.imul(this.bars + 1, 0x85ebca6b));
    const x = {
      s, b, si, r, sub: this.sub, steps: this.steps,
      last: b === s.bars - 1,
      phraseEnd: b % 4 === 3,
      chords: s.chords[b],
      next: b + 1 < s.bars ? s.chords[b + 1][0].chord : this._peekChord(),
    };
    const ev = [];
    const parts = this.def.parts;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.only && !p.only.includes(s.id)) continue;
      if (p.not && p.not.includes(s.id)) continue;
      if (s.sd.mute && s.sd.mute.includes(p.ch)) continue;
      if (p.minI != null && si < p.minI) continue;
      if (p.maxI != null && si > p.maxI) continue;
      GEN[p.gen]?.(this, p, x, ev, this.state[i]);
    }
    yieldToLead(ev);
    const sd = s.stepDur;
    const swing = this.def.swing || 0;
    for (const e of ev) {
      let at = e.at;
      if (swing && Number.isInteger(at) && at % 2 === 1) at += swing;
      e.t = Math.max(0, at * sd + (r() - 0.5) * 0.006);
      e.d = Math.max(0.03, e.len * sd);
    }
    this.secBar++;
    this.bars++;
    return { dur: this.steps * sd, ev, sec: s.id, bar: b, energy: s.sd.energy || 0 };
  }
}

/** Validate a track's written lines (bar lengths) — used by the preview check & node tests. */
export function lintTrack(def) {
  const steps = def.beats * def.sub;
  const out = [];
  for (const [id, sd] of Object.entries(def.sections)) {
    const nbars = String(sd.prog).trim().split(/\s+/).length;
    for (const k of ['mel', 'ctr']) {
      if (!sd[k]) continue;
      const bars = parseLine(sd[k]);
      if (bars.length !== nbars) out.push(`${id}.${k}: ${bars.length} bars vs ${nbars} chords`);
      bars.forEach((bar, i) => {
        const L = barLen(bar);
        if (L !== steps) out.push(`${id}.${k} bar ${i + 1}: ${L} steps (want ${steps})`);
      });
    }
  }
  return out;
}
