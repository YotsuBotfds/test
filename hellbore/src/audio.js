// Every sound in the game is synthesized here with WebAudio: effects, the drill loop,
// and a procedural metal-ish step sequencer that writes a theme for each stratum.
import { mulberry32, clamp } from './util.js';

const SCALES = {
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  phrygianDominant: [0, 1, 4, 5, 7, 8, 10],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volumes = { master: 0.8, music: 0.6, sfx: 0.8 };
    this.last = new Map();
    this.track = null;
    this.trackName = '';
    this.intensity = 0;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.beatListeners = [];
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);

    // Shared delay for the lead line.
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.27;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const dl = ctx.createBiquadFilter();
    dl.type = 'lowpass';
    dl.frequency.value = 2400;
    this.delay.connect(dl).connect(fb).connect(this.delay);
    dl.connect(this.musicBus);

    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.dist = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 4.5);
    }
    this.dist.curve = curve;
    this.distCurve = curve;

    this.buildDrill();
    this.applyVolumes();
    this.timer = setInterval(() => this.schedule(), 25);
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  setVolumes(v) {
    Object.assign(this.volumes, v);
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.volumes.music * 0.55, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx * 0.9, t, 0.05);
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // ------------------------------------------------------------ building blocks

  env(g, t, a, peak, dec, sus = 0.0001, rel = 0) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus), t + a + dec);
    if (rel) g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec + rel);
  }

  osc(type, freq, t, dur, out, opts = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t + (opts.slide ?? dur));
    if (opts.detune) o.detune.value = opts.detune;
    const g = ctx.createGain();
    this.env(g, t, opts.a ?? 0.002, opts.vol ?? 0.3, dur, 0.0001);
    let node = o;
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = opts.filter.type || 'lowpass';
      f.frequency.setValueAtTime(opts.filter.f, t);
      if (opts.filter.to) f.frequency.exponentialRampToValueAtTime(opts.filter.to, t + dur);
      f.Q.value = opts.filter.q ?? 1;
      node.connect(f);
      node = f;
    }
    node.connect(g).connect(out);
    o.start(t);
    o.stop(t + (opts.a ?? 0.002) + dur + 0.05);
    return o;
  }

  noiseHit(t, dur, out, opts = {}) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    s.playbackRate.value = opts.rate ?? 1;
    const f = ctx.createBiquadFilter();
    f.type = opts.type || 'lowpass';
    f.frequency.setValueAtTime(opts.f ?? 2000, t);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    f.Q.value = opts.q ?? 0.8;
    const g = ctx.createGain();
    this.env(g, t, opts.a ?? 0.002, opts.vol ?? 0.3, dur);
    s.connect(f).connect(g).connect(out);
    const off = Math.random() * 0.8;
    s.start(t, off);
    s.stop(t + dur + 0.08);
  }

  panner(pan) {
    if (!pan || !this.ctx.createStereoPanner) return this.sfxBus;
    const p = this.ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    p.connect(this.sfxBus);
    return p;
  }

  // ------------------------------------------------------------ sound effects

  /** Play a named effect. opts: vol, pitch, pan. Rate limited per name. */
  play(name, opts = {}) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    const gap = RATE_LIMIT[name] ?? 0.03;
    const last = this.last.get(name) ?? -1;
    if (now - last < gap) return;
    this.last.set(name, now);
    const fn = SFX[name];
    if (fn) fn(this, now, this.panner(opts.pan), opts.pitch ?? 1, opts.vol ?? 1);
  }

  buildDrill() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 500;
    bp.Q.value = 1.4;
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.value = 52;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 23;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 9;
    lfo.connect(lfoGain).connect(saw.frequency);
    const sawGain = ctx.createGain();
    sawGain.gain.value = 0.35;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    saw.connect(sawGain).connect(lp);
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(bp).connect(g);
    lp.connect(g);
    g.connect(this.sfxBus);
    src.start();
    saw.start();
    lfo.start();
    this.drill = { g, bp, saw, lfo };

    // Cave-in rumble loop.
    const rs = ctx.createBufferSource();
    rs.buffer = this.noise;
    rs.loop = true;
    rs.playbackRate.value = 0.5;
    const rlp = ctx.createBiquadFilter();
    rlp.type = 'lowpass';
    rlp.frequency.value = 140;
    const rg = ctx.createGain();
    rg.gain.value = 0;
    rs.connect(rlp).connect(rg).connect(this.sfxBus);
    rs.start();
    this.rumble = rg;
  }

  setDrill(level, hardness = 10) {
    if (!this.drill) return;
    const t = this.ctx.currentTime;
    this.drill.g.gain.setTargetAtTime(level * 0.2, t, 0.04);
    const f = 380 + Math.min(hardness, 40) * 22;
    this.drill.bp.frequency.setTargetAtTime(f, t, 0.05);
    this.drill.saw.frequency.setTargetAtTime(44 + Math.min(hardness, 40) * 0.9, t, 0.05);
  }

  setRumble(level) {
    if (!this.rumble) return;
    this.rumble.gain.setTargetAtTime(clamp(level, 0, 1) * 0.55, this.ctx.currentTime, 0.1);
  }

  // ------------------------------------------------------------ music

  /** name: 'title' | 'forge' | 'stratum' | 'boss' | 'victory' | 'none' */
  music(name, stratumMusic) {
    const key = `${name}:${stratumMusic ? stratumMusic.seed : ''}`;
    if (key === this.trackName) return;
    this.trackName = key;
    this.track = name === 'none' ? null : composeTrack(name, stratumMusic);
    this.step = 0;
    if (this.ctx) this.nextTime = this.ctx.currentTime + 0.08;
  }

  setIntensity(v) {
    this.intensity = clamp(v, 0, 1);
  }

  onBeat(fn) {
    this.beatListeners.push(fn);
  }

  schedule() {
    if (!this.ready || !this.track) return;
    const ctx = this.ctx;
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.playStep(this.track, this.step, this.nextTime);
      const spb = 60 / this.track.tempo / 4;
      this.nextTime += spb;
      this.step++;
    }
  }

  playStep(tr, step, t) {
    const out = this.musicBus;
    const len = tr.steps;
    const s = step % len;
    const bar = Math.floor(step / len) % tr.prog.length;
    const chord = tr.prog[bar];
    const I = this.intensity;
    const spb = 60 / tr.tempo / 4;

    if (s % 4 === 0) {
      const beatTime = (t - this.ctx.currentTime) * 1000;
      for (const fn of this.beatListeners) setTimeout(() => fn(s / 4), Math.max(0, beatTime));
    }

    // Drums.
    const kick = tr.kick[s] || (I > 0.75 && tr.kickFill[s]);
    if (kick) this.kick(t, out, tr.kind === 'title' ? 0.55 : 0.8);
    if (tr.snare[s] && (I > 0.2 || tr.kind === 'boss')) this.snare(t, out);
    if (tr.hat[s] && (tr.kind !== 'title' || I > 0.5)) {
      this.noiseHit(t, s % 4 === 2 ? 0.07 : 0.03, out, { type: 'highpass', f: 7500, vol: s % 4 === 2 ? 0.1 : 0.06 });
    }
    if (tr.anvil && tr.anvil[s]) {
      this.osc('square', 1240, t, 0.25, out, { vol: 0.05, filter: { type: 'bandpass', f: 2400, q: 6 } });
      this.osc('square', 1873, t, 0.3, out, { vol: 0.035 });
    }

    // Bass: distorted detuned saws.
    const bn = tr.bass[s];
    if (bn !== null && bn !== undefined) {
      const midi = tr.root + chord + bn;
      this.bassNote(t, midi, tr.palmMute[s] ? spb * 0.8 : spb * 1.8, out, tr.kind === 'title' ? 0.12 : 0.17);
    }

    // Lead arpeggio when things heat up.
    const ln = tr.lead[s];
    if (ln !== null && ln !== undefined && (I > 0.45 || tr.kind === 'boss' || tr.kind === 'forge' || tr.kind === 'victory')) {
      const midi = tr.root + 24 + chord + ln;
      const g = this.ctx.createGain();
      g.connect(out);
      g.connect(this.delay);
      this.osc(tr.leadWave, mtof(midi), t, spb * 1.6, g, {
        vol: tr.kind === 'forge' ? 0.06 : 0.055,
        filter: { f: 3200, q: 2 },
      });
    }

    // Pad drone on bar starts.
    if (s === 0 && tr.pad) {
      const dur = spb * len;
      for (const iv of [0, 7, 12]) {
        this.osc('sawtooth', mtof(tr.root + 12 + chord + iv), t, dur, out, {
          a: dur * 0.3,
          vol: 0.022,
          filter: { f: 500, to: 1400, q: 3 },
          detune: (iv - 4) * 3,
        });
      }
    }
    if (tr.bell && tr.bell[s] !== undefined && tr.bell[s] !== null) {
      this.bellNote(t, tr.root + 36 + chord + tr.bell[s], out, 0.05);
    }
  }

  kick(t, out, vol = 0.8) {
    this.osc('sine', 155, t, 0.22, out, { to: 38, slide: 0.12, vol });
    this.noiseHit(t, 0.02, out, { f: 3000, vol: 0.08 });
  }

  snare(t, out) {
    this.noiseHit(t, 0.16, out, { type: 'highpass', f: 1300, vol: 0.22 });
    this.osc('triangle', 190, t, 0.08, out, { to: 120, vol: 0.18 });
  }

  bassNote(t, midi, dur, out, vol) {
    const ctx = this.ctx;
    const f = mtof(midi);
    const g = ctx.createGain();
    this.env(g, t, 0.004, vol, dur, 0.0001);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1600, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + dur);
    lp.Q.value = 4;
    const sh = ctx.createWaveShaper();
    sh.curve = this.distCurve;
    for (const det of [-9, 9]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(sh);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = f / 2;
    const sg = ctx.createGain();
    sg.gain.value = 0.6;
    sub.connect(sg).connect(g);
    sub.start(t);
    sub.stop(t + dur + 0.05);
    sh.connect(lp).connect(g).connect(out);
  }

  bellNote(t, midi, out, vol) {
    const f = mtof(midi);
    for (const [ratio, v, d] of [
      [1, 1, 2.2],
      [2.76, 0.4, 1.2],
      [5.4, 0.2, 0.6],
      [0.5, 0.5, 2.6],
    ]) {
      this.osc('sine', f * ratio, t, d, out, { vol: vol * v });
    }
  }
}

// ------------------------------------------------------------ track composition

function composeTrack(kind, sm) {
  const r = mulberry32((sm?.seed ?? 5) * 31 + kind.length * 101);
  const scale = SCALES[sm?.scale ?? 'phrygian'];
  const deg = (i) => {
    const o = Math.floor(i / scale.length);
    return scale[((i % scale.length) + scale.length) % scale.length] + o * 12;
  };
  const steps = 16;
  const tr = {
    kind,
    steps,
    root: sm?.root ?? 40,
    tempo: sm?.tempo ?? 110,
    leadWave: 'square',
    bass: new Array(steps).fill(null),
    palmMute: new Array(steps).fill(false),
    lead: new Array(steps).fill(null),
    kick: new Array(steps).fill(false),
    kickFill: new Array(steps).fill(false),
    snare: new Array(steps).fill(false),
    hat: new Array(steps).fill(false),
    prog: [0, 0, deg(5) - 12, deg(1)],
    pad: false,
  };

  if (kind === 'title') {
    tr.tempo = 68;
    tr.root = 38;
    tr.pad = true;
    tr.prog = [0, 1, -4, -2];
    tr.kick = tr.kick.map((_, i) => i === 0 || i === 3);
    tr.bass = tr.bass.map((_, i) => (i === 0 ? 0 : null));
    tr.bell = new Array(steps).fill(null);
    tr.bell[0] = 7;
    tr.bell[6] = 3;
    tr.bell[10] = 1;
    return tr;
  }

  if (kind === 'forge') {
    tr.tempo = 84;
    tr.root = 45;
    tr.pad = true;
    tr.leadWave = 'triangle';
    tr.prog = [0, deg(5) - 12, deg(3) - 12, deg(4) - 12];
    tr.anvil = tr.kick.map((_, i) => i === 0 || i === 8 || i === 11);
    const arp = [0, deg(2), deg(4), 12, deg(4), deg(2)];
    for (let i = 0; i < steps; i += 2) tr.lead[i] = arp[(i / 2) % arp.length];
    tr.bass = tr.bass.map((_, i) => (i % 8 === 0 ? -12 : null));
    return tr;
  }

  if (kind === 'victory') {
    tr.tempo = 96;
    tr.root = 43;
    tr.pad = true;
    tr.prog = [0, deg(5) - 12, deg(3) - 12, deg(4) - 12];
    tr.leadWave = 'triangle';
    const mel = [0, deg(2), deg(4), deg(7), deg(4), deg(2)];
    for (let i = 0; i < steps; i += 2) tr.lead[i] = mel[(i / 2) % mel.length];
    tr.kick = tr.kick.map((_, i) => i % 8 === 0);
    tr.snare = tr.snare.map((_, i) => i % 8 === 4);
    tr.hat = tr.hat.map((_, i) => i % 2 === 0);
    tr.bass = tr.bass.map((_, i) => (i % 4 === 0 ? 0 : null));
    return tr;
  }

  const boss = kind === 'boss';
  if (boss) tr.tempo = Math.round(tr.tempo * 1.22);

  // Chugging bass riff: root-heavy with occasional flat-second stabs.
  const riffNotes = [0, 0, 0, deg(1), 0, deg(2) - 12 + 12, deg(4) - 12, deg(6) - 12];
  for (let i = 0; i < steps; i++) {
    const p = r();
    if (i % 4 === 0 || p < (boss ? 0.75 : 0.55)) {
      tr.bass[i] = p < 0.72 ? 0 : riffNotes[(r() * riffNotes.length) | 0];
      tr.palmMute[i] = r() < 0.7;
    }
  }
  tr.bass[0] = 0;

  // Drums.
  for (let i = 0; i < steps; i++) {
    tr.kick[i] = i % 8 === 0 || (r() < 0.22 && i % 2 === 0);
    tr.kickFill[i] = i % 2 === 1 || boss;
    tr.snare[i] = i % 8 === 4;
    tr.hat[i] = i % 2 === 0;
  }
  if (boss) {
    tr.kick = tr.kick.map((_, i) => i % 2 === 0);
    tr.snare = tr.snare.map((_, i) => i % 4 === 2);
  }

  // Lead motif: a falling, chromatic-flavoured arpeggio.
  const motif = [];
  let cur = 7 + ((r() * 4) | 0);
  for (let i = 0; i < 8; i++) {
    motif.push(deg(cur) - 12);
    cur += r() < 0.6 ? -1 : r() < 0.5 ? 2 : -2;
  }
  for (let i = 0; i < steps; i++) {
    if (i % 2 === 0 || boss) tr.lead[i] = motif[(i >> 1) % motif.length];
    if (r() < 0.18) tr.lead[i] = null;
  }
  tr.leadWave = boss ? 'sawtooth' : 'square';
  return tr;
}

// ------------------------------------------------------------ effect recipes

const RATE_LIMIT = {
  rivet: 0.045,
  flame: 0.07,
  hit: 0.035,
  break: 0.05,
  ore: 0.05,
  eshoot: 0.06,
  spark: 0.05,
  step: 0.1,
};

const SFX = {
  rivet(a, t, out, p, v) {
    a.osc('square', 820 * p, t, 0.05, out, { to: 260 * p, vol: 0.13 * v, filter: { f: 3200 } });
    a.noiseHit(t, 0.035, out, { type: 'highpass', f: 2500, vol: 0.12 * v });
  },
  scatter(a, t, out, p, v) {
    a.noiseHit(t, 0.22, out, { f: 2600 * p, to: 300, vol: 0.4 * v });
    a.osc('sine', 120 * p, t, 0.16, out, { to: 45, vol: 0.4 * v });
  },
  flame(a, t, out, p, v) {
    a.noiseHit(t, 0.1, out, { type: 'bandpass', f: 900 * p, q: 0.6, vol: 0.14 * v });
  },
  arc(a, t, out, p, v) {
    a.osc('sawtooth', 1400 * p, t, 0.05, out, { to: 200, vol: 0.09 * v, filter: { type: 'highpass', f: 600 } });
    a.osc('sawtooth', 1800 * p, t + 0.04, 0.07, out, { to: 300, vol: 0.08 * v, filter: { type: 'highpass', f: 600 } });
    a.noiseHit(t, 0.08, out, { type: 'highpass', f: 4000, vol: 0.12 * v });
  },
  rail(a, t, out, p, v) {
    a.osc('sawtooth', 2200 * p, t, 0.35, out, { to: 90, vol: 0.18 * v, filter: { f: 5000, to: 400 } });
    a.noiseHit(t, 0.3, out, { f: 6000, to: 500, vol: 0.25 * v });
    a.osc('sine', 70, t, 0.3, out, { to: 30, vol: 0.35 * v });
  },
  rocket(a, t, out, p, v) {
    a.noiseHit(t, 0.28, out, { type: 'bandpass', f: 500 * p, to: 2400, q: 2, vol: 0.25 * v });
  },
  saw(a, t, out, p, v) {
    a.osc('square', 1500 * p, t, 0.2, out, { vol: 0.05 * v, filter: { type: 'bandpass', f: 3000, q: 4 } });
    a.osc('square', 1530 * p, t, 0.2, out, { vol: 0.05 * v });
    a.noiseHit(t, 0.05, out, { type: 'highpass', f: 3000, vol: 0.1 * v });
  },
  hit(a, t, out, p, v) {
    a.noiseHit(t, 0.04, out, { type: 'highpass', f: 1800 * p, vol: 0.16 * v });
    a.osc('square', 300 * p, t, 0.03, out, { to: 120, vol: 0.06 * v });
  },
  clang(a, t, out, p, v) {
    a.osc('square', 900 * p, t, 0.12, out, { vol: 0.06 * v, filter: { type: 'bandpass', f: 1800, q: 5 } });
    a.osc('triangle', 1350 * p, t, 0.16, out, { vol: 0.05 * v });
  },
  kill(a, t, out, p, v) {
    a.noiseHit(t, 0.18, out, { f: 1800 * p, to: 200, vol: 0.32 * v });
    a.osc('square', 240 * p, t, 0.14, out, { to: 50, vol: 0.12 * v, filter: { f: 1200 } });
  },
  splat(a, t, out, p, v) {
    a.noiseHit(t, 0.14, out, { f: 900 * p, to: 150, vol: 0.3 * v, rate: 0.6 });
    a.osc('sine', 180 * p, t, 0.1, out, { to: 60, vol: 0.2 * v });
  },
  explode(a, t, out, p, v) {
    a.noiseHit(t, 0.7, out, { f: 3200 * p, to: 80, vol: 0.7 * v, rate: 0.7 });
    a.osc('sine', 90 * p, t, 0.6, out, { to: 24, vol: 0.7 * v });
    a.osc('sawtooth', 60 * p, t, 0.25, out, { to: 30, vol: 0.15 * v, filter: { f: 300 } });
  },
  bigexplode(a, t, out, p, v) {
    a.noiseHit(t, 1.6, out, { f: 2400 * p, to: 50, vol: 0.9 * v, rate: 0.5 });
    a.osc('sine', 70 * p, t, 1.4, out, { to: 18, vol: 0.9 * v });
  },
  hurt(a, t, out, p, v) {
    a.osc('sawtooth', 160 * p, t, 0.25, out, { to: 60, vol: 0.3 * v, filter: { f: 900 } });
    a.noiseHit(t, 0.2, out, { f: 1500, to: 300, vol: 0.35 * v });
  },
  shield(a, t, out, p, v) {
    a.osc('triangle', 600 * p, t, 0.3, out, { to: 1400, vol: 0.18 * v });
    a.osc('sine', 1200 * p, t, 0.25, out, { to: 2000, vol: 0.1 * v });
  },
  ore(a, t, out, p, v) {
    a.osc('square', 1046 * p, t, 0.05, out, { vol: 0.07 * v, filter: { f: 4000 } });
    a.osc('square', 1568 * p, t + 0.045, 0.07, out, { vol: 0.07 * v, filter: { f: 4000 } });
  },
  heal(a, t, out, p, v) {
    [523, 659, 784, 1046].forEach((f, i) => a.osc('triangle', f * p, t + i * 0.05, 0.12, out, { vol: 0.12 * v }));
  },
  power(a, t, out, p, v) {
    [392, 523, 659, 784, 1046, 1318].forEach((f, i) =>
      a.osc('square', f * p, t + i * 0.04, 0.09, out, { vol: 0.07 * v, filter: { f: 3500 } })
    );
  },
  weapon(a, t, out, p, v) {
    a.osc('sawtooth', 220 * p, t, 0.12, out, { to: 880, vol: 0.12 * v, filter: { f: 2500 } });
    [659, 880, 1318].forEach((f, i) => a.osc('square', f * p, t + 0.1 + i * 0.06, 0.1, out, { vol: 0.07 * v }));
  },
  dash(a, t, out, p, v) {
    a.noiseHit(t, 0.22, out, { type: 'bandpass', f: 600 * p, to: 3000, q: 1.5, vol: 0.3 * v });
  },
  throw(a, t, out, p, v) {
    a.osc('square', 300 * p, t, 0.06, out, { to: 600, vol: 0.08 * v });
  },
  break(a, t, out, p, v) {
    a.noiseHit(t, 0.08, out, { f: 1200 * p, to: 250, vol: 0.2 * v, rate: 0.8 });
  },
  crate(a, t, out, p, v) {
    a.noiseHit(t, 0.12, out, { f: 1600, to: 300, vol: 0.3 * v });
    a.osc('triangle', 220 * p, t, 0.1, out, { to: 110, vol: 0.2 * v });
  },
  eshoot(a, t, out, p, v) {
    a.osc('triangle', 520 * p, t, 0.08, out, { to: 260, vol: 0.06 * v });
  },
  fireball(a, t, out, p, v) {
    a.noiseHit(t, 0.2, out, { type: 'bandpass', f: 400 * p, to: 1200, q: 1, vol: 0.18 * v });
  },
  charge(a, t, out, p, v) {
    a.osc('sawtooth', 120 * p, t, 0.6, out, { to: 900, a: 0.4, vol: 0.08 * v, filter: { f: 1800 } });
  },
  laser(a, t, out, p, v) {
    a.osc('sawtooth', 110 * p, t, 0.6, out, { vol: 0.12 * v, filter: { type: 'bandpass', f: 900, q: 3 } });
    a.osc('square', 220.5 * p, t, 0.6, out, { vol: 0.06 * v, filter: { f: 1600 } });
  },
  roar(a, t, out, p, v) {
    a.osc('sawtooth', 90 * p, t, 1.4, out, { to: 40, a: 0.1, vol: 0.35 * v, filter: { f: 700, to: 200, q: 3 } });
    a.osc('sawtooth', 93 * p, t, 1.4, out, { to: 41, a: 0.1, vol: 0.3 * v, filter: { f: 700, to: 200, q: 3 } });
    a.noiseHit(t, 1.2, out, { f: 900, to: 120, vol: 0.4 * v, a: 0.1, rate: 0.4 });
  },
  heartbeat(a, t, out, p, v) {
    a.osc('sine', 60 * p, t, 0.18, out, { to: 35, vol: 0.6 * v });
    a.osc('sine', 55 * p, t + 0.2, 0.22, out, { to: 30, vol: 0.45 * v });
  },
  stratum(a, t, out, p, v) {
    a.bellNote(t, 50, out, 0.22 * v);
    a.bellNote(t + 0.02, 57, out, 0.12 * v);
    a.osc('sine', 46, t, 2.5, out, { vol: 0.35 * v });
  },
  sealbreak(a, t, out, p, v) {
    a.noiseHit(t, 1.2, out, { f: 1600, to: 60, vol: 0.7 * v, rate: 0.5 });
    a.bellNote(t + 0.1, 45, out, 0.25 * v);
  },
  ui(a, t, out, p, v) {
    a.osc('square', 660 * p, t, 0.04, out, { vol: 0.06 * v, filter: { f: 3000 } });
  },
  select(a, t, out, p, v) {
    a.osc('square', 523 * p, t, 0.06, out, { vol: 0.08 * v, filter: { f: 3000 } });
    a.osc('square', 784 * p, t + 0.06, 0.1, out, { vol: 0.08 * v, filter: { f: 3000 } });
  },
  back(a, t, out, p, v) {
    a.osc('square', 440 * p, t, 0.06, out, { to: 300, vol: 0.07 * v, filter: { f: 2500 } });
  },
  buy(a, t, out, p, v) {
    a.osc('square', 880 * p, t, 0.05, out, { vol: 0.08 * v });
    a.osc('square', 1320 * p, t + 0.05, 0.12, out, { vol: 0.08 * v });
    a.noiseHit(t, 0.1, out, { type: 'highpass', f: 5000, vol: 0.08 * v });
  },
  deny(a, t, out, p, v) {
    a.osc('square', 150 * p, t, 0.15, out, { vol: 0.1 * v, filter: { f: 900 } });
  },
  gameover(a, t, out, p, v) {
    [392, 349, 311, 262, 196].forEach((f, i) =>
      a.osc('sawtooth', f * p, t + i * 0.22, 0.4, out, { vol: 0.12 * v, filter: { f: 1400 } })
    );
  },
  victory(a, t, out, p, v) {
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) =>
      a.osc('square', f * p, t + i * 0.12, 0.2, out, { vol: 0.08 * v, filter: { f: 3500 } })
    );
  },
  emerge(a, t, out, p, v) {
    a.noiseHit(t, 0.3, out, { f: 600 * p, to: 150, vol: 0.18 * v, rate: 0.5 });
  },
  warn(a, t, out, p, v) {
    a.osc('square', 880 * p, t, 0.08, out, { vol: 0.07 * v });
    a.osc('square', 880 * p, t + 0.14, 0.08, out, { vol: 0.07 * v });
  },
  slam(a, t, out, p, v) {
    a.osc('sine', 80 * p, t, 0.5, out, { to: 28, vol: 0.8 * v });
    a.noiseHit(t, 0.4, out, { f: 1200, to: 100, vol: 0.5 * v, rate: 0.5 });
  },
  teleport(a, t, out, p, v) {
    a.osc('sine', 200 * p, t, 0.2, out, { to: 1600, vol: 0.12 * v });
  },
};

export const audio = new AudioEngine();
