// WP7 — tiny synthesis toolkit shared by every SFX. All helpers take any BaseAudioContext
// (realtime or OfflineAudioContext) plus an output node and a start time, schedule their nodes,
// and return the time at which they fall silent. Nothing here keeps references to nodes, so
// finished voices are garbage-collected by the browser.

/** Inharmonic partial ratios for struck objects. */
export const RATIOS = {
  // Church / ship's bell: hum, prime, minor third, fifth, nominal, + upper partials.
  bell: [0.5, 1, 1.183, 1.506, 2, 2.514, 2.662, 3.011, 4.166],
  // Free-free bar modes (glass, music-box tines, small chimes).
  bar: [1, 2.756, 5.404, 8.933],
  // Thick steel plate / hull.
  plate: [1, 1.59, 2.14, 2.3, 2.65, 2.92, 3.16],
  // Small brass fitting tink.
  tink: [1, 2.32, 4.25, 6.63],
  // Music-box tine: fundamental + strong inharmonic overtone.
  tine: [1, 4.2, 9.1],
};

/** Equal-tempered note → Hz. `n` is semitones from A4 (440 Hz). */
export const hz = (n) => 440 * Math.pow(2, n / 12);

/** Note name (e.g. 'C5', 'F#3', 'Bb2') → Hz. */
export function note(name) {
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(name);
  if (!m) return 440;
  const base = { c: -9, d: -7, e: -5, f: -4, g: -2, a: 0, b: 2 }[m[1].toLowerCase()];
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return hz(base + acc + (Number(m[3]) - 4) * 12);
}

export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const EPS = 0.0001;

// ---- Cached per-context resources ----------------------------------------------------------

const stores = new WeakMap();
function store(ctx) {
  let s = stores.get(ctx);
  if (!s) stores.set(ctx, (s = new Map()));
  return s;
}

/** Deterministic xorshift so noise buffers are identical run to run (stable offline checks). */
function prng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/**
 * Cached mono noise buffer. Colors: white, pink, brown, crackle (sparse popping impulses, fire &
 * debris), patter (dense soft droplets, rain), hiss (bright, steam).
 * @param {BaseAudioContext} ctx
 * @param {string} [color]
 * @returns {AudioBuffer}
 */
export function noiseBuffer(ctx, color = 'white') {
  const s = store(ctx);
  const key = `noise:${color}`;
  let buf = s.get(key);
  if (buf) return buf;
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * (color === 'crackle' || color === 'patter' ? 3 : 2));
  buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const r = prng(0x9e3779b9 ^ color.length * 7919);
  if (color === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = r() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    }
  } else if (color === 'brown') {
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (r() * 2 - 1)) / 1.02;
      d[i] = last;
    }
  } else if (color === 'crackle' || color === 'patter') {
    // Random impulses, each a few ms of decaying noise. Rate per second differs per color.
    const rate = color === 'crackle' ? 55 : 520;
    const decay = color === 'crackle' ? 0.0025 : 0.0012;
    const p = rate / sr;
    let env = 0;
    let amp = 0;
    const k = Math.exp(-1 / (decay * sr));
    for (let i = 0; i < len; i++) {
      if (r() < p) {
        amp = color === 'crackle' ? 0.25 + r() * 0.75 : 0.1 + Math.pow(r(), 3) * 0.9;
        env = 1;
      }
      env *= k;
      d[i] = (r() * 2 - 1) * env * amp;
    }
  } else {
    for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
    if (color === 'hiss') {
      // First-difference = bright, airy noise.
      let prev = 0;
      for (let i = 0; i < len; i++) {
        const v = d[i];
        d[i] = v - prev * 0.85;
        prev = v;
      }
    }
  }
  // Normalize so every color has the same peak: callers can reason about levels.
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
  // Remove DC (brown noise drifts) and scale.
  let mean = 0;
  for (let i = 0; i < len; i++) mean += d[i];
  mean /= len;
  const g = peak > 0 ? 0.98 / (peak + Math.abs(mean)) : 1;
  for (let i = 0; i < len; i++) d[i] = (d[i] - mean) * g;
  s.set(key, buf);
  return buf;
}

/** Cached WaveShaper curve: soft-clip drive (amount 0..1+). */
export function drive(ctx, amount = 0.5) {
  const s = store(ctx);
  const key = `drive:${amount.toFixed(2)}`;
  let curve = s.get(key);
  if (!curve) {
    const n = 1024;
    curve = new Float32Array(n);
    const k = 1 + amount * 30;
    const norm = Math.tanh(k);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(k * x) / norm;
    }
    s.set(key, curve);
  }
  const ws = ctx.createWaveShaper();
  ws.curve = curve;
  ws.oversample = '2x';
  return ws;
}

/** Cached PeriodicWave for reedy accordion / organ timbres. */
export function wave(ctx, kind) {
  const s = store(ctx);
  const key = `wave:${kind}`;
  let w = s.get(key);
  if (w) return w;
  const amps = {
    organ: [0, 1, 0.55, 0.0, 0.32, 0, 0.18, 0, 0.12],
    reed: [0, 1, 0.8, 0.6, 0.5, 0.42, 0.36, 0.3, 0.25, 0.2, 0.16],
    tuba: [0, 1, 0.7, 0.35, 0.18, 0.08, 0.04],
    whistle: [0, 1, 0.08, 0.03],
  }[kind] || [0, 1];
  const real = new Float32Array(amps.length);
  const imag = Float32Array.from(amps);
  w = ctx.createPeriodicWave(real, imag);
  s.set(key, w);
  return w;
}

// ---- Graph helpers -------------------------------------------------------------------------

/** Gain node connected to `out`. */
export function gain(ctx, out, v = 1) {
  const g = ctx.createGain();
  g.gain.value = v;
  g.connect(out);
  return g;
}

/** Stereo panner (falls back to a plain gain when unsupported) connected to `out`. */
export function panner(ctx, out, pan = 0) {
  if (!ctx.createStereoPanner) return gain(ctx, out, 1);
  const p = ctx.createStereoPanner();
  p.pan.value = clamp(pan, -1, 1);
  p.connect(out);
  return p;
}

/**
 * Biquad filter feeding `out`, optional sweep f → f2 over `glide` seconds.
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} out
 * @param {{type?: BiquadFilterType, f: number, f2?: number, q?: number, glide?: number,
 *   t?: number, lin?: boolean, gain?: number}} o
 */
export function filter(ctx, out, o) {
  const f = ctx.createBiquadFilter();
  f.type = o.type || 'lowpass';
  const t = o.t ?? 0;
  f.frequency.setValueAtTime(clamp(o.f, 10, 20000), t);
  if (o.f2 !== undefined) {
    const end = t + (o.glide ?? 0.2);
    if (o.lin) f.frequency.linearRampToValueAtTime(clamp(o.f2, 10, 20000), end);
    else f.frequency.exponentialRampToValueAtTime(clamp(o.f2, 10, 20000), end);
  }
  if (o.q !== undefined) f.Q.value = o.q;
  if (o.gain !== undefined) f.gain.value = o.gain;
  f.connect(out);
  return f;
}

/** Chain of filters (array of specs) ending at `out`. Returns the head node. */
function chain(ctx, out, specs, t, dur) {
  let head = out;
  const list = Array.isArray(specs) ? specs : [specs];
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    head = filter(ctx, head, { glide: dur, ...s, t });
  }
  return head;
}

/**
 * Percussive amplitude envelope on a GainNode: 0 → peak in `a`, hold, exp decay over `d`.
 * Returns the end time.
 */
export function perc(param, t, peak, a = 0.002, d = 0.2, hold = 0) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + a);
  if (hold > 0) param.setValueAtTime(peak, t + a + hold);
  const end = t + a + hold + d;
  param.exponentialRampToValueAtTime(EPS, end);
  param.setValueAtTime(0, end + 0.005);
  return end;
}

/**
 * Oscillator voice.
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} out
 * @param {{t:number, f:number, f2?:number, glide?:number, lin?:boolean, type?:OscillatorType,
 *   wave?:string, a?:number, d?:number, hold?:number, vol?:number, detune?:number,
 *   vib?:{rate:number, depth:number, delay?:number}, filter?:object|object[], pan?:number}} o
 */
export function osc(ctx, out, o) {
  const t = o.t;
  const a = o.a ?? 0.003;
  const d = o.d ?? 0.2;
  const hold = o.hold ?? 0;
  const total = a + hold + d;
  let dest = o.pan !== undefined ? panner(ctx, out, o.pan) : out;
  const g = ctx.createGain();
  const end = perc(g.gain, t, o.vol ?? 0.3, a, d, hold);
  g.connect(dest);
  dest = o.filter ? chain(ctx, g, o.filter, t, total) : g;
  const s = ctx.createOscillator();
  if (o.wave) s.setPeriodicWave(wave(ctx, o.wave));
  else s.type = o.type || 'sine';
  s.frequency.setValueAtTime(o.f, t);
  if (o.f2 !== undefined) {
    const ge = t + (o.glide ?? total);
    if (o.lin) s.frequency.linearRampToValueAtTime(o.f2, ge);
    else s.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), ge);
  }
  if (o.detune) s.detune.value = o.detune;
  if (o.vib) {
    const l = ctx.createOscillator();
    l.frequency.value = o.vib.rate;
    const lg = ctx.createGain();
    const vd = o.vib.delay ?? 0;
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(0, t + vd);
    lg.gain.linearRampToValueAtTime(o.vib.depth, t + vd + 0.15);
    l.connect(lg).connect(s.detune);
    l.start(t);
    l.stop(end + 0.02);
  }
  s.connect(dest);
  s.start(t);
  s.stop(end + 0.02);
  return end;
}

/**
 * Filtered noise burst.
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} out
 * @param {{t:number, color?:string, a?:number, d?:number, hold?:number, vol?:number,
 *   filter?:object|object[], rate?:number, rate2?:number, pan?:number}} o
 */
export function noise(ctx, out, o) {
  const t = o.t;
  const a = o.a ?? 0.002;
  const d = o.d ?? 0.2;
  const hold = o.hold ?? 0;
  const total = a + hold + d;
  const dest = o.pan !== undefined ? panner(ctx, out, o.pan) : out;
  const g = ctx.createGain();
  const end = perc(g.gain, t, o.vol ?? 0.3, a, d, hold);
  g.connect(dest);
  const head = o.filter ? chain(ctx, g, o.filter, t, total) : g;
  const src = ctx.createBufferSource();
  const buf = noiseBuffer(ctx, o.color || 'white');
  src.buffer = buf;
  src.loop = true;
  src.playbackRate.setValueAtTime(o.rate ?? 1, t);
  if (o.rate2 !== undefined) src.playbackRate.exponentialRampToValueAtTime(o.rate2, t + total);
  src.connect(head);
  src.start(t, Math.random() * (buf.duration - 0.1));
  src.stop(end + 0.02);
  return end;
}

/**
 * Struck object: a bank of sine partials with individual decays (upper partials die faster).
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} out
 * @param {{t:number, f:number, ratios?:number[], amps?:number[], d?:number, a?:number,
 *   vol?:number, fall?:number, spread?:number, detune?:number}} o
 *   fall: how much faster each successive partial decays; spread: random detune in cents.
 */
export function partials(ctx, out, o) {
  const t = o.t;
  const ratios = o.ratios || RATIOS.tink;
  const amps = o.amps;
  const d = o.d ?? 0.3;
  const fall = o.fall ?? 0.35;
  const vol = o.vol ?? 0.2;
  const a = o.a ?? 0.001;
  const spread = o.spread ?? 4;
  let end = t;
  let norm = 0;
  for (let i = 0; i < ratios.length; i++) norm += amps ? amps[i] ?? 0 : 1 / (1 + i * 0.6);
  for (let i = 0; i < ratios.length; i++) {
    const amp = (amps ? amps[i] ?? 0 : 1 / (1 + i * 0.6)) / norm;
    if (amp <= 0) continue;
    const f = o.f * ratios[i];
    if (f > 18000) continue;
    const e = osc(ctx, out, {
      t,
      f,
      a,
      d: d / (1 + i * fall),
      vol: vol * amp,
      detune: (o.detune ?? 0) + (Math.random() * 2 - 1) * spread,
    });
    if (e > end) end = e;
  }
  return end;
}

/**
 * Two-operator FM tone (metallic groans, bells, zaps).
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} out
 * @param {{t:number, f:number, f2?:number, ratio?:number, index?:number, index2?:number,
 *   a?:number, d?:number, hold?:number, vol?:number, type?:OscillatorType,
 *   filter?:object|object[]}} o
 */
export function fm(ctx, out, o) {
  const t = o.t;
  const a = o.a ?? 0.003;
  const d = o.d ?? 0.3;
  const hold = o.hold ?? 0;
  const total = a + hold + d;
  const g = ctx.createGain();
  const end = perc(g.gain, t, o.vol ?? 0.25, a, d, hold);
  g.connect(out);
  const head = o.filter ? chain(ctx, g, o.filter, t, total) : g;
  const c = ctx.createOscillator();
  c.type = o.type || 'sine';
  const m = ctx.createOscillator();
  const ratio = o.ratio ?? 1.4;
  const mg = ctx.createGain();
  const f2 = o.f2 ?? o.f;
  c.frequency.setValueAtTime(o.f, t);
  m.frequency.setValueAtTime(o.f * ratio, t);
  if (f2 !== o.f) {
    c.frequency.exponentialRampToValueAtTime(f2, t + total);
    m.frequency.exponentialRampToValueAtTime(f2 * ratio, t + total);
  }
  const i1 = (o.index ?? 2) * o.f * ratio;
  const i2 = (o.index2 ?? o.index ?? 2) * f2 * ratio;
  mg.gain.setValueAtTime(i1, t);
  mg.gain.linearRampToValueAtTime(i2, t + total);
  m.connect(mg).connect(c.frequency);
  c.connect(head);
  c.start(t);
  m.start(t);
  c.stop(end + 0.02);
  m.stop(end + 0.02);
  return end;
}

/**
 * Low "thump": sine with a fast downward pitch dive (kick drums, cannon bodies, sub booms).
 */
export function thump(ctx, out, o) {
  return osc(ctx, out, {
    t: o.t,
    type: 'sine',
    f: o.f ?? 120,
    f2: o.f2 ?? 40,
    glide: o.glide ?? Math.min(0.12, (o.d ?? 0.3) * 0.5),
    a: o.a ?? 0.002,
    d: o.d ?? 0.3,
    vol: o.vol ?? 0.6,
  });
}

/**
 * Brass voice: detuned saw pair through a low-pass whose cutoff "blats" open then settles.
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} out
 * @param {{t:number, f:number, d?:number, hold?:number, a?:number, vol?:number,
 *   bright?:number, vib?:boolean, bend?:number, pan?:number, wave?:string}} o
 *   bend: start this many semitones flat and scoop up (brass "fall-in").
 */
export function brass(ctx, out, o) {
  const t = o.t;
  const a = o.a ?? 0.03;
  const hold = o.hold ?? 0.1;
  const d = o.d ?? 0.25;
  const total = a + hold + d;
  const bright = o.bright ?? 5;
  const dest = o.pan !== undefined ? panner(ctx, out, o.pan) : out;
  const g = ctx.createGain();
  // Brass swells slightly through the hold rather than a flat sustain.
  const peak = o.vol ?? 0.2;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.linearRampToValueAtTime(peak * 0.82, t + a + 0.06);
  g.gain.linearRampToValueAtTime(peak * 0.9, t + a + hold);
  const end = t + total;
  g.gain.exponentialRampToValueAtTime(EPS, end);
  g.gain.setValueAtTime(0, end + 0.005);
  g.connect(dest);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 1.2;
  const f = o.f;
  lp.frequency.setValueAtTime(f * 1.2, t);
  lp.frequency.exponentialRampToValueAtTime(Math.min(16000, f * bright * 1.4), t + a + 0.02);
  lp.frequency.exponentialRampToValueAtTime(Math.min(16000, f * bright * 0.7), t + a + hold);
  lp.frequency.exponentialRampToValueAtTime(Math.max(40, f * 1.1), end);
  lp.connect(g);
  const det = [-7, 6];
  for (const cents of det) {
    const s = ctx.createOscillator();
    if (o.wave) s.setPeriodicWave(wave(ctx, o.wave));
    else s.type = 'sawtooth';
    const f0 = o.bend ? f * Math.pow(2, -o.bend / 12) : f;
    s.frequency.setValueAtTime(f0, t);
    if (o.bend) s.frequency.exponentialRampToValueAtTime(f, t + a + 0.05);
    s.detune.value = cents;
    if (o.vib && total > 0.3) {
      const l = ctx.createOscillator();
      l.frequency.value = 5.2;
      const lg = ctx.createGain();
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(0, t + 0.15);
      lg.gain.linearRampToValueAtTime(14, t + Math.min(total, 0.5));
      l.connect(lg).connect(s.detune);
      l.start(t);
      l.stop(end + 0.02);
    }
    s.connect(lp);
    s.start(t);
    s.stop(end + 0.02);
  }
  return end;
}

/** Short mechanical click (brass switch, ratchet, typewriter key). */
export function click(ctx, out, o) {
  const t = o.t;
  const f = o.f ?? 3000;
  const vol = o.vol ?? 0.25;
  noise(ctx, out, {
    t,
    d: o.d ?? 0.018,
    vol,
    filter: { type: 'bandpass', f, q: o.q ?? 2.5 },
    pan: o.pan,
  });
  return osc(ctx, out, {
    t,
    type: 'triangle',
    f: f * 0.42,
    f2: f * 0.22,
    d: (o.d ?? 0.018) * 1.6,
    vol: vol * 0.45,
  });
}

/** Steam hiss with an optional pitched pipe whistle. */
export function hiss(ctx, out, o) {
  const t = o.t;
  const a = o.a ?? 0.03;
  const hold = o.hold ?? 0.1;
  const d = o.d ?? 0.3;
  let end = noise(ctx, out, {
    t,
    color: 'hiss',
    a,
    hold,
    d,
    vol: o.vol ?? 0.25,
    filter: [
      { type: 'highpass', f: o.hp ?? 1400 },
      { type: 'bandpass', f: o.f ?? 4000, f2: o.f2 ?? o.f ?? 4000, q: o.q ?? 0.9 },
    ],
    pan: o.pan,
  });
  if (o.whistle) {
    end = Math.max(
      end,
      osc(ctx, out, {
        t,
        wave: 'whistle',
        f: o.whistle,
        f2: o.whistle2 ?? o.whistle,
        a: a * 1.5,
        hold,
        d: d * 0.8,
        vol: (o.vol ?? 0.25) * 0.25,
        vib: { rate: 6.5, depth: 18 },
      })
    );
  }
  return end;
}

/** Repeat `fn(i, time)` n times spaced `gap` apart (with optional jitter); returns last end. */
export function repeat(n, t, gap, fn, jitter = 0) {
  let end = t;
  for (let i = 0; i < n; i++) {
    const ti = t + i * gap + (jitter ? Math.random() * jitter : 0);
    const e = fn(i, ti);
    if (typeof e === 'number' && e > end) end = e;
  }
  return end;
}
