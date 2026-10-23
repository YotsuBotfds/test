// WP8 — synth voices for the generative score. Each voice is a small function
//   voice(res, t, midi, dur, vel, chan, variant)
// that schedules a handful of nodes into `chan.input` starting at `t` and cleans them up
// (disconnect) when its last source ends. `chan.vib` (optional) is a shared vibrato LFO that
// voices may connect to oscillator detune; `chan.opt` carries per-channel tone options.
// Shared buffers/waves are cached per context so nothing large is rebuilt per note.

import { mtof, clamp } from './music-theory.js';

const RES = new WeakMap();
const EPS = 0.0001;

/** Per-context shared resources (noise buffer, periodic waves, reverb impulse). */
export function resources(ctx) {
  let r = RES.get(ctx);
  if (r) return r;
  r = { ctx, noise: makeNoise(ctx, 1.5), waves: {}, impulse: null };
  r.waves.organ = wave(ctx, [0, 1, 0.62, 0.34, 0.36, 0.05, 0.2, 0.02, 0.14, 0, 0.05]);
  r.waves.organSoft = wave(ctx, [0, 1, 0.3, 0.1, 0.06]);
  r.waves.flute = wave(ctx, [0, 1, 0.14, 0.08, 0.03]);
  r.waves.reed = wave(ctx, [0, 1, 0.75, 0.55, 0.42, 0.35, 0.25, 0.2, 0.14, 0.1, 0.07]);
  RES.set(ctx, r);
  return r;
}

function wave(ctx, amps) {
  const imag = Float32Array.from(amps);
  const real = new Float32Array(amps.length);
  return ctx.createPeriodicWave(real, imag);
}

function makeNoise(ctx, secs) {
  const n = Math.floor(ctx.sampleRate * secs);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let s = 0x2468ace1;
  for (let i = 0; i < n; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    d[i] = ((s >>> 0) / 4294967296) * 2 - 1;
  }
  return buf;
}

/** Stereo reverb impulse: exponentially decaying noise with a soft pre-delay and darkening tail. */
export function reverbImpulse(ctx, secs = 1.9) {
  const r = resources(ctx);
  if (r.impulse) return r.impulse;
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * secs);
  const buf = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let s = ch ? 0x51ed2701 : 0x1b873593;
    let lp = 0;
    const pre = Math.floor(sr * 0.018);
    for (let i = pre; i < n; i++) {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      const x = ((s >>> 0) / 4294967296) * 2 - 1;
      const k = (i - pre) / (n - pre);
      // Low-pass that closes over time: the tail gets darker, like a big wooden hold.
      const a = 0.65 - 0.5 * k;
      lp += a * (x - lp);
      d[i] = lp * Math.pow(1 - k, 2.4) * 0.6;
    }
  }
  r.impulse = buf;
  return buf;
}

// ---- Helpers ----------------------------------------------------------------------------------

function osc(ctx, type, freq, t) {
  const o = ctx.createOscillator();
  if (typeof type === 'string') o.type = type;
  else o.setPeriodicWave(type);
  o.frequency.setValueAtTime(freq, t);
  o.start(t);
  return o;
}

function noiseSrc(r, t) {
  const s = r.ctx.createBufferSource();
  s.buffer = r.noise;
  s.loop = true;
  // Pseudo-random offset so consecutive hits don't phase identically.
  s.start(t, ((t * 7919.31) % 1) * (r.noise.duration - 0.05));
  return s;
}

function gain(ctx, v = 0) {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}

function filter(ctx, type, f, q = 0.7) {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  return b;
}

/** Disconnect everything when `src` ends (and detach shared vibrato). */
function done(src, nodes, chan, vibbed) {
  src.onended = () => {
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch {
        /* already gone */
      }
    }
    if (vibbed && chan?.vib) {
      for (const o of vibbed) {
        try {
          chan.vib.disconnect(o.detune);
        } catch {
          /* ignore */
        }
      }
    }
  };
}

/** Sustained ADSR. Returns the time the voice is silent. */
function adsr(p, t, peak, a, d, s, end, rel) {
  end = Math.max(end, t + a + 0.012);
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  if (s !== 1) p.setTargetAtTime(peak * s, t + a, d);
  p.setTargetAtTime(0, end, rel * 0.32);
  return end + rel * 1.6;
}

/** Percussive: fast attack then exponential decay. */
function perc(p, t, peak, a, dec) {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(Math.max(peak, EPS * 2), t + a);
  p.exponentialRampToValueAtTime(EPS, t + a + dec);
  return t + a + dec + 0.02;
}

const vibrate = (chan, o) => {
  if (chan?.vib) chan.vib.connect(o.detune);
};

// ---- Melodic voices ---------------------------------------------------------------------------

/** Music box: sine tine + inharmonic overtone, fast decay, tiny fixed per-pitch detune. */
function musicbox(r, t, midi, dur, vel, chan) {
  const ctx = r.ctx;
  const f = mtof(midi) * Math.pow(2, (((midi * 37) % 7) - 3) * 0.0006);
  const dec = clamp(2.1 - (midi - 72) * 0.045, 0.45, 2.6) * (chan.opt.decay ?? 1);
  const o1 = osc(ctx, 'sine', f, t);
  const o2 = osc(ctx, 'sine', f * 4.2, t);
  const g1 = gain(ctx);
  const g2 = gain(ctx);
  const end = perc(g1.gain, t, vel * 0.42, 0.003, dec);
  perc(g2.gain, t, vel * 0.11, 0.002, 0.16);
  o1.connect(g1).connect(chan.input);
  o2.connect(g2).connect(chan.input);
  o1.stop(end);
  o2.stop(t + 0.2);
  done(o1, [o1, o2, g1, g2]);
}

/** Glockenspiel: bar modes 1 : 2.76 : 5.4, bright strike, long ring. */
function glock(r, t, midi, dur, vel, chan) {
  const ctx = r.ctx;
  const f = mtof(midi);
  const o1 = osc(ctx, 'sine', f, t);
  const o2 = osc(ctx, 'sine', f * 2.756, t);
  const o3 = osc(ctx, 'sine', f * 5.404, t);
  const g1 = gain(ctx);
  const g2 = gain(ctx);
  const end = perc(g1.gain, t, vel * 0.36, 0.0015, 1.5);
  perc(g2.gain, t, vel * 0.12, 0.001, 0.3);
  o1.connect(g1).connect(chan.input);
  o2.connect(g2);
  o3.connect(g2);
  g2.connect(chan.input);
  o1.stop(end);
  o2.stop(t + 0.35);
  o3.stop(t + 0.35);
  done(o1, [o1, o2, o3, g1, g2]);
}

/** Accordion: detuned saw + square reed pair through a warm low-pass (tremolo is per channel). */
function accordion(r, t, midi, dur, vel, chan) {
  const ctx = r.ctx;
  const f = mtof(midi);
  const det = chan.opt.detune ?? 9;
  const a = osc(ctx, 'sawtooth', f, t);
  a.detune.value = det;
  const b = osc(ctx, 'square', f, t);
  b.detune.value = -det;
  const bg = gain(ctx, 0.42);
  const lp = filter(ctx, 'lowpass', Math.min(1500 + 1900 * vel * (chan.opt.bright ?? 1), f * 9), 0.9);
  const g = gain(ctx);
  const end = adsr(g.gain, t, vel * 0.26, 0.028, 0.25, 0.82, t + dur, 0.07);
  a.connect(lp);
  b.connect(bg).connect(lp);
  lp.connect(g).connect(chan.input);
  a.stop(end);
  b.stop(end);
  done(a, [a, b, bg, lp, g]);
}

/** Brass section: two detuned saws, filter envelope "blat", optional scoop; shared vibrato. */
function brass(r, t, midi, dur, vel, chan) {
  const ctx = r.ctx;
  const f = mtof(midi);
  const o = chan.opt;
  const atk = o.atk ?? (dur < 0.18 ? 0.018 : 0.04);
  const a = osc(ctx, 'sawtooth', f, t);
  const b = osc(ctx, 'sawtooth', f, t);
  a.detune.value = 6;
  b.detune.value = -6;
  if (o.scoop) {
    a.frequency.setValueAtTime(f * 0.96, t);
    a.frequency.exponentialRampToValueAtTime(f, t + 0.06);
  }
  vibrate(chan, a);
  vibrate(chan, b);
  const lp = filter(ctx, 'lowpass', f, o.q ?? 1.6);
  const bright = o.bright ?? 1;
  const top = Math.min(f * (2.2 + 4.5 * vel * bright), 7500);
  const hold = Math.min(f * (1.6 + 2.6 * vel * bright), 6000);
  lp.frequency.setValueAtTime(f * 1.05, t);
  lp.frequency.linearRampToValueAtTime(top, t + atk * 1.6);
  lp.frequency.setTargetAtTime(hold, t + atk * 1.6, 0.14);
  const g = gain(ctx);
  const end = adsr(g.gain, t, vel * 0.2, atk, 0.2, 0.78, t + dur, o.rel ?? 0.11);
  lp.frequency.setTargetAtTime(f, t + Math.max(dur, atk + 0.012), 0.06);
  a.connect(lp);
  b.connect(lp);
  lp.connect(g).connect(chan.input);
  a.stop(end);
  b.stop(end);
  done(a, [a, b, lp, g], chan, [a, b]);
}

/** Tuba / oompah bass: saw + sine body through a closing low-pass. */
function tuba(r, t, midi, dur, vel, chan) {
  const ctx = r.ctx;
  const f = mtof(midi);
  const a = osc(ctx, 'sawtooth', f, t);
  const s = osc(ctx, 'sine', f, t);
  const soft = chan.opt.soft ? 0.55 : 1;
  const lp = filter(ctx, 'lowpass', f * 2, 1.1);
  lp.frequency.setValueAtTime(f * 1.5, t);
  lp.frequency.linearRampToValueAtTime(Math.min(f * (3 + 4 * vel * soft), 2200), t + 0.03);
  lp.frequency.setTargetAtTime(f * 2.1, t + 0.03, 0.09);
  const sg = gain(ctx, 0.7);
  const g = gain(ctx);
  const end = adsr(g.gain, t, vel * 0.3, 0.018, 0.12, 0.72, t + dur, 0.07);
  a.connect(lp).connect(g);
  s.connect(sg).connect(g);
  g.connect(chan.input);
  a.stop(end);
  s.stop(end);
  done(a, [a, s, lp, sg, g]);
}

/** Pizzicato: plucked saw with a fast-closing filter. */
function pizz(r, t, midi, dur, vel, chan) {
  const ctx = r.ctx;
  const f = mtof(midi);
  const a = osc(ctx, 'sawtooth', f, t);
  const lp = filter(ctx, 'lowpass', 4000, 1.2);
  lp.frequency.setValueAtTime(Math.min(f * 12, 6000), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(f * 1.2, 120), t + 0.18);
  const g = gain(ctx);
  const dec = clamp(0.55 - (midi - 48) * 0.006, 0.18, 0.6);
  const end = perc(g.gain, t, vel * 0.42, 0.004, dec);
  a.connect(lp).connect(g).connect(chan.input);
  a.stop(end);
  done(a, [a, lp, g]);
}

/** String ensemble: two detuned saws, soft attack (tremolo is the channel LFO). */
function strings(r, t, midi, dur, vel, chan) {
  const ctx = r.ctx;
  const f = mtof(midi);
  const o = chan.opt;
  const a = osc(ctx, 'sawtooth', f, t);
  const b = osc(ctx, 'sawtooth', f, t);
  a.detune.value = 9;
  b.detune.value = -8;
  vibrate(chan, a);
  const lp = filter(ctx, 'lowpass', Math.min(1500 + 1600 * vel * (o.bright ?? 1), f * 10), 0.5);
  const g = gain(ctx);
  const end = adsr(g.gain, t, vel * 0.13, o.atk ?? 0.12, 0.3, 0.9, t + dur, o.rel ?? 0.35);
  a.connect(lp);
  b.connect(lp);
  lp.connect(g).connect(chan.input);
  a.stop(end);
  b.stop(end);
  done(a, [a, b, lp, g], chan, [a]);
}

/** Pipe organ: additive drawbar wave + slightly detuned chorus rank. */
function organ(r, t, midi, dur, vel, chan) {
  const ctx = r.ctx;
  const f = mtof(midi);
  const w = chan.opt.soft ? r.waves.organSoft : r.waves.organ;
  const a = osc(ctx, w, f, t);
  const b = osc(ctx, w, f, t);
  b.detune.value = chan.opt.chorus ?? 7;
  const bg = gain(ctx, 0.55);
  const g = gain(ctx);
  const end = adsr(g.gain, t, vel * 0.15, chan.opt.atk ?? 0.018, 0.2, 0.92, t + dur, chan.opt.rel ?? 0.12);
  a.connect(g);
  b.connect(bg).connect(g);
  g.connect(chan.input);
  a.stop(end);
  b.stop(end);
  done(a, [a, b, bg, g]);
}

/** Flute / ocarina: soft additive wave, breathy chiff on the attack, shared vibrato. */
function flute(r, t, midi, dur, vel, chan) {
  const ctx = r.ctx;
  const f = mtof(midi);
  const a = osc(ctx, r.waves.flute, f, t);
  vibrate(chan, a);
  const g = gain(ctx);
  const end = adsr(g.gain, t, vel * 0.26, chan.opt.atk ?? 0.06, 0.3, 0.85, t + dur, 0.14);
  a.connect(g).connect(chan.input);
  const n = noiseSrc(r, t);
  const bp = filter(ctx, 'bandpass', Math.min(f * 2, 9000), 2.5);
  const ng = gain(ctx);
  perc(ng.gain, t, vel * 0.07, 0.01, 0.07);
  n.connect(bp).connect(ng).connect(chan.input);
  n.stop(t + 0.1);
  a.stop(end);
  done(a, [a, g, n, bp, ng], chan, [a]);
}

/** Steam whistle: two-chime triangle pair gliding up to pitch, plus breath noise. */
function whistle(r, t, midi, dur, vel, chan) {
  const ctx = r.ctx;
  const f = mtof(midi);
  const a = osc(ctx, 'triangle', f * 0.9, t);
  const b = osc(ctx, 'triangle', f * 1.26 * 0.9, t);
  a.frequency.exponentialRampToValueAtTime(f, t + 0.14);
  b.frequency.exponentialRampToValueAtTime(f * 1.26, t + 0.14);
  vibrate(chan, a);
  const g = gain(ctx);
  const end = adsr(g.gain, t, vel * 0.16, 0.06, 0.4, 0.85, t + dur, 0.28);
  const n = noiseSrc(r, t);
  const bp = filter(ctx, 'bandpass', f * 1.1, 5);
  const ng = gain(ctx, vel * 0.5);
  a.connect(g);
  b.connect(g);
  n.connect(bp).connect(ng).connect(g);
  g.connect(chan.input);
  a.stop(end);
  b.stop(end);
  n.stop(end);
  done(a, [a, b, g, n, bp, ng], chan, [a]);
}

/** Ship's bell: hum / prime / tierce / quint / nominal partials with independent decays. */
const BELL = [
  [0.5, 0.32, 2.6],
  [1, 0.5, 2.1],
  [1.183, 0.24, 1.4],
  [1.506, 0.16, 1.0],
  [2.0, 0.18, 0.8],
  [2.66, 0.1, 0.45],
];
function bell(r, t, midi, dur, vel, chan) {
  const ctx = r.ctx;
  const f = mtof(midi);
  const nodes = [];
  let first = null;
  let last = t;
  for (const [ratio, amp, dec] of BELL) {
    const o = osc(ctx, 'sine', f * ratio, t);
    const g = gain(ctx);
    const e = perc(g.gain, t, vel * amp * 0.5, 0.002, dec);
    o.connect(g).connect(chan.input);
    o.stop(e);
    nodes.push(o, g);
    if (e > last) {
      last = e;
      first = o;
    }
  }
  done(first, nodes);
}

// ---- Percussion -------------------------------------------------------------------------------

function kick(r, t, midi, dur, vel, chan) {
  const ctx = r.ctx;
  const tune = chan.opt.tune ?? 1;
  const o = osc(ctx, 'sine', 150 * tune, t);
  o.frequency.exponentialRampToValueAtTime(46 * tune, t + 0.09);
  const g = gain(ctx);
  const end = perc(g.gain, t, vel * 0.62, 0.002, chan.opt.decay ?? 0.36);
  o.connect(g).connect(chan.input);
  o.stop(end);
  done(o, [o, g]);
}

function snare(r, t, midi, dur, vel, chan) {
  const ctx = r.ctx;
  const brush = chan.opt.brush;
  const n = noiseSrc(r, t);
  const f = brush ? filter(ctx, 'bandpass', 3200, 0.6) : filter(ctx, 'highpass', 1400, 0.7);
  const ng = gain(ctx);
  const end = perc(ng.gain, t, vel * (brush ? 0.22 : 0.34), brush ? 0.012 : 0.001, brush ? 0.2 : 0.15);
  n.connect(f).connect(ng).connect(chan.input);
  n.stop(end);
  const nodes = [n, f, ng];
  if (!brush) {
    const o = osc(ctx, 'triangle', 190, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.06);
    const og = gain(ctx);
    perc(og.gain, t, vel * 0.28, 0.001, 0.07);
    o.connect(og).connect(chan.input);
    o.stop(t + 0.1);
    nodes.push(o, og);
  }
  done(n, nodes);
}

function hat(r, t, midi, dur, vel, chan, v) {
  const ctx = r.ctx;
  const open = v === 'open';
  const n = noiseSrc(r, t);
  const f = chan.opt.shaker ? filter(ctx, 'bandpass', 6200, 1.1) : filter(ctx, 'highpass', 7200, 0.6);
  const g = gain(ctx);
  const end = perc(g.gain, t, vel * 0.17, chan.opt.shaker ? 0.014 : 0.001, open ? 0.3 : chan.opt.shaker ? 0.06 : 0.045);
  n.connect(f).connect(g).connect(chan.input);
  n.stop(end);
  done(n, [n, f, g]);
}

/** Clockwork tick/tock: short sine blip (variant 'h' = tick, 'l' = tock). */
function tick(r, t, midi, dur, vel, chan, v) {
  const ctx = r.ctx;
  const f = v === 'l' ? 1650 : v === 'm' ? 2100 : 2700;
  const o = osc(ctx, 'sine', f, t);
  o.frequency.exponentialRampToValueAtTime(f * 0.82, t + 0.02);
  const g = gain(ctx);
  const end = perc(g.gain, t, vel * 0.3, 0.0008, 0.028);
  o.connect(g).connect(chan.input);
  o.stop(end);
  done(o, [o, g]);
}

/** Piston / steam valve: band-passed noise chuff. Variant 'open' = long hiss. */
function hiss(r, t, midi, dur, vel, chan, v) {
  const ctx = r.ctx;
  const n = noiseSrc(r, t);
  const bp = filter(ctx, 'bandpass', chan.opt.freq ?? 2300, 0.9);
  const g = gain(ctx);
  const end = perc(g.gain, t, vel * 0.3, 0.012, v === 'open' ? 0.38 : 0.11);
  n.connect(bp).connect(g).connect(chan.input);
  n.stop(end);
  done(n, [n, bp, g]);
}

/** Anvil clank: FM metallic partials + strike click. Variants h/m/l shift the pitch. */
function anvil(r, t, midi, dur, vel, chan, v) {
  const ctx = r.ctx;
  const f = (chan.opt.freq ?? 540) * (v === 'h' ? 1.5 : v === 'l' ? 0.72 : 1);
  const m = osc(ctx, 'sine', f * 1.41, t);
  const mg = gain(ctx);
  mg.gain.setValueAtTime(f * 2.4, t);
  mg.gain.exponentialRampToValueAtTime(f * 0.12, t + 0.35);
  const c1 = osc(ctx, 'sine', f, t);
  const c2 = osc(ctx, 'sine', f * 2.76, t);
  m.connect(mg);
  mg.connect(c1.frequency);
  mg.connect(c2.frequency);
  const g = gain(ctx);
  const end = perc(g.gain, t, vel * 0.2, 0.001, chan.opt.decay ?? 0.8);
  c1.connect(g);
  c2.connect(g);
  g.connect(chan.input);
  const n = noiseSrc(r, t);
  const hp = filter(ctx, 'highpass', 3200, 0.7);
  const ng = gain(ctx);
  perc(ng.gain, t, vel * 0.22, 0.0005, 0.025);
  n.connect(hp).connect(ng).connect(chan.input);
  n.stop(t + 0.05);
  m.stop(end);
  c1.stop(end);
  c2.stop(end);
  done(c1, [m, mg, c1, c2, g, n, hp, ng]);
}

/** Timpani: tuned sine with a settling pitch, fifth partial and mallet thump. */
function timpani(r, t, midi, dur, vel, chan) {
  const ctx = r.ctx;
  const f = mtof(midi);
  const o1 = osc(ctx, 'sine', f * 1.02, t);
  o1.frequency.exponentialRampToValueAtTime(f, t + 0.12);
  const o2 = osc(ctx, 'sine', f * 1.505, t);
  const g1 = gain(ctx);
  const g2 = gain(ctx);
  const end = perc(g1.gain, t, vel * 0.5, 0.004, chan.opt.decay ?? 1.3);
  perc(g2.gain, t, vel * 0.14, 0.004, 0.45);
  const n = noiseSrc(r, t);
  const lp = filter(ctx, 'lowpass', 380, 0.7);
  const ng = gain(ctx);
  perc(ng.gain, t, vel * 0.35, 0.001, 0.07);
  o1.connect(g1).connect(chan.input);
  o2.connect(g2).connect(chan.input);
  n.connect(lp).connect(ng).connect(chan.input);
  n.stop(t + 0.1);
  o1.stop(end);
  o2.stop(t + 0.5);
  done(o1, [o1, o2, g1, g2, n, lp, ng]);
}

/** War drum / tom: pitch-dropping sine + low thud. Variants h/m/l or a midi pitch. */
function tom(r, t, midi, dur, vel, chan, v) {
  const ctx = r.ctx;
  const f = v === 'h' ? 150 : v === 'm' ? 108 : v === 'l' ? 74 : mtof(midi || 45);
  const o = osc(ctx, 'sine', f * 1.7, t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.11);
  const g = gain(ctx);
  const end = perc(g.gain, t, vel * 0.7, 0.002, chan.opt.decay ?? 0.5);
  const n = noiseSrc(r, t);
  const lp = filter(ctx, 'lowpass', 600, 0.8);
  const ng = gain(ctx);
  perc(ng.gain, t, vel * 0.3, 0.001, 0.06);
  o.connect(g).connect(chan.input);
  n.connect(lp).connect(ng).connect(chan.input);
  n.stop(t + 0.09);
  o.stop(end);
  done(o, [o, g, n, lp, ng]);
}

/** Crash / suspended cymbal swell. */
function crash(r, t, midi, dur, vel, chan) {
  const ctx = r.ctx;
  const n = noiseSrc(r, t);
  const hp = filter(ctx, 'highpass', 4600, 0.5);
  const pk = filter(ctx, 'peaking', 8200, 2);
  pk.gain.value = 6;
  const g = gain(ctx);
  const end = perc(g.gain, t, vel * 0.18, 0.003, chan.opt.decay ?? 1.7);
  n.connect(hp).connect(pk).connect(g).connect(chan.input);
  n.stop(end);
  done(n, [n, hp, pk, g]);
}

/** All voices by instrument name. */
export const VOICES = {
  musicbox, glock, accordion, brass, tuba, pizz, strings, organ, flute, whistle, bell,
  kick, snare, hat, tick, hiss, anvil, timpani, tom, crash,
};

/** Roll rate (hits/sec) per percussion voice. */
export const ROLL_RATE = { snare: 24, timpani: 15, tom: 13, tick: 20, hat: 22, kick: 12, anvil: 10 };
