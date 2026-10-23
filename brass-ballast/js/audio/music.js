// WP8 — generative steampunk score. API (DESIGN §4.17):
//   const m = new Music({ ctx, out });  m.play(track, { fade = 1.5 });  m.stop(fade);
//   m.setIntensity(0..1);  m.renderAhead(seconds)  (OfflineAudioContext testing)
//
// Architecture
//   Music ─ owns the shared mix: performers ─► input ─► glue compressor ─► master ─► out
//                                             reverb send ─► convolver ──┘
//   Performer ─ one per playing track: a Composer (music-composer.js) writes one bar of note
//     events at a time from the track data (music-tracks.js); a lookahead scheduler (setInterval
//     ~25 ms, notes queued ~0.15 s ahead on ctx.currentTime) hands due events to the synth voices
//     (music-instruments.js). Each mixer channel is   voice ─► vol(+tremolo) ─► pan ─► layer gate
//     ─► dry/reverb/echo, and the gate gains crossfade (~2 s) when intensity moves a layer.
//   Track changes crossfade performers; the outgoing one keeps playing under its fade, then is
//   disposed. Nothing here throws: every public method is guarded.

import { TRACKS, TRACK_NAMES } from './music-tracks.js';
import { Composer } from './music-composer.js';
import { VOICES, ROLL_RATE, resources, reverbImpulse } from './music-instruments.js';
import { smoothstep, clamp, hash } from './music-theory.js';

/** Layer weight vs effective intensity. */
const LAYERS = {
  core: () => 1,
  drums: (e) => smoothstep(0.2, 0.5, e),
  counter: (e) => smoothstep(0.55, 0.85, e),
  full: (e) => smoothstep(0.78, 1, e),
  calm: (e) => 1 - smoothstep(0.45, 0.8, e),
};
const LAYER_TC = 0.6; // setTargetAtTime constant → ~95 % in 1.8 s
const LOOKAHEAD = 0.15; // seconds of notes queued ahead of the audio clock
const TICK_MS = 25;
const MASTER = 0.62;
const REVERB_RETURN = 0.55;

const warned = new Set();
function warn(tag, err) {
  if (warned.has(tag)) return;
  warned.add(tag);
  try {
    console.warn(`[music] ${tag}:`, err?.message || err);
  } catch {
    /* ignore */
  }
}

/** One track being performed (or fading out). */
class Performer {
  constructor(music, name, def, start, fadeIn, seed) {
    const ctx = music.ctx;
    this.m = music;
    this.ctx = ctx;
    this.name = name;
    this.def = def;
    this.comp = new Composer(def, seed);
    this.res = resources(ctx);
    this.nextBar = start;
    this.q = [];
    this.qh = 0;
    this.notes = 0;
    this.energy = 0;
    this.si = null;
    this.endAt = Infinity;
    this.dead = false;
    this.level = def.gain ?? 1;
    this.wetLevel = def.reverb ?? 1;
    this.where = null;
    this.ls = {};
    this.byLayer = {};
    this.nodes = [];
    this.lfos = [];

    const now = ctx.currentTime;
    this.bus = ctx.createGain();
    this.wet = ctx.createGain();
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = def.warmth ?? 8000;
    this.tone.Q.value = 0.5;
    this.bus.connect(this.tone).connect(music.input);
    this.wet.connect(music.reverb);
    this.nodes.push(this.bus, this.wet, this.tone);
    this._ramp(this.bus.gain, 0, this.level, now, start, fadeIn);
    this._ramp(this.wet.gain, 0, this.wetLevel, now, start, fadeIn);

    if (def.echo) {
      const e = def.echo;
      this.echoIn = ctx.createGain();
      const dl = ctx.createDelay(2);
      dl.delayTime.value = clamp((e.beats ?? 0.75) * (60 / def.tempo), 0.05, 1.9);
      const fb = ctx.createGain();
      fb.gain.value = clamp(e.fb ?? 0.3, 0, 0.8);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = e.tone ?? 3000;
      this.echoIn.connect(dl).connect(lp).connect(fb).connect(dl);
      lp.connect(this.bus);
      this.nodes.push(this.echoIn, dl, fb, lp);
    }

    const eff = this._eff(music.intensity);
    this.ch = {};
    for (const [k, c] of Object.entries(def.ch)) this.ch[k] = this._channel(c, eff, now);
    this.I = music.intensity;
  }

  _ramp(p, from, to, now, start, fade) {
    p.setValueAtTime(from, now);
    p.setValueAtTime(from, start);
    p.linearRampToValueAtTime(to, start + Math.max(0.01, fade));
  }

  _channel(c, eff, now) {
    const ctx = this.ctx;
    const layer = LAYERS[c.layer] ? c.layer : 'core';
    const w = LAYERS[layer](eff);
    if (!this.ls[layer]) this.ls[layer] = { from: w, to: w, t0: now };
    (this.byLayer[layer] ||= []).push(null);
    const input = ctx.createGain();
    input.gain.value = c.vol;
    let pan = null;
    if (c.pan && ctx.createStereoPanner) {
      pan = ctx.createStereoPanner();
      pan.pan.value = clamp(c.pan, -1, 1);
    }
    const gate = ctx.createGain();
    gate.gain.value = w;
    (pan ? input.connect(pan).connect(gate) : input.connect(gate)).connect(this.bus);
    this.nodes.push(input, gate);
    if (pan) this.nodes.push(pan);
    if (c.rev) {
      const s = ctx.createGain();
      s.gain.value = c.rev;
      gate.connect(s).connect(this.wet);
      this.nodes.push(s);
    }
    if (c.echo && this.echoIn) {
      const s = ctx.createGain();
      s.gain.value = c.echo;
      gate.connect(s).connect(this.echoIn);
      this.nodes.push(s);
    }
    const chan = { def: c, input, gate, layer, opt: c.opt || {}, vib: null };
    if (c.trem) {
      const [rate, depth] = c.trem;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rate;
      const lg = ctx.createGain();
      lg.gain.value = c.vol * depth * 0.5;
      input.gain.value = c.vol * (1 - depth * 0.5);
      lfo.connect(lg).connect(input.gain);
      lfo.start(now);
      this.lfos.push(lfo);
      this.nodes.push(lg);
    }
    if (c.vib) {
      const [rate, cents] = c.vib;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rate;
      const vg = ctx.createGain();
      vg.gain.value = cents;
      lfo.connect(vg);
      lfo.start(now);
      this.lfos.push(lfo);
      this.nodes.push(vg);
      chan.vib = vg;
    }
    const list = this.byLayer[layer];
    list[list.length - 1] = chan;
    return chan;
  }

  _eff(I = this.I) {
    const floor = this.def.floor ?? 0;
    return clamp(floor + (1 - floor) * I + this.energy, 0, 1);
  }

  _est(st, t) {
    if (t <= st.t0) return st.from;
    return st.to + (st.from - st.to) * Math.exp(-(t - st.t0) / LAYER_TC);
  }

  _setLayer(layer, target, when) {
    const st = this.ls[layer];
    if (!st || Math.abs(st.to - target) < 0.004) return;
    const cur = this._est(st, when);
    st.from = cur;
    st.to = target;
    st.t0 = when;
    for (const ch of this.byLayer[layer]) {
      const g = ch.gate.gain;
      g.cancelScheduledValues(when);
      g.setValueAtTime(cur, when);
      g.setTargetAtTime(target, when, LAYER_TC);
    }
  }

  _applyLayers(when) {
    const eff = this._eff();
    for (const layer of Object.keys(this.ls)) this._setLayer(layer, LAYERS[layer](eff), when);
  }

  setIntensity(I, now) {
    this.I = I;
    this._applyLayers(now);
  }

  _audible(layer, t) {
    const st = this.ls[layer];
    return !st || st.to > 0.003 || this._est(st, t) > 0.003;
  }

  /** Compose bars and play every queued event due before `horizon`. */
  pump(horizon, now) {
    if (this.dead) return;
    const limit = Math.min(horizon, this.endAt);
    let guard = 0;
    while (this.nextBar < limit && guard++ < 16) {
      // Main thread stalled past a whole bar: rejoin the clock rather than cram notes.
      if (this.nextBar < now - 0.25) this.nextBar = now + 0.03;
      const eff = this._eff();
      this.si = this.si == null ? eff : this.si + (eff - this.si) * 0.5;
      const bar = this.comp.nextBar(this.si);
      if (bar.energy !== this.energy) {
        this.energy = bar.energy;
        this._applyLayers(Math.max(now, this.nextBar));
      }
      const pend = this.qh ? this.q.slice(this.qh) : this.q;
      for (const e of bar.ev) {
        e.t += this.nextBar;
        pend.push(e);
      }
      pend.sort((a, b) => a.t - b.t);
      this.q = pend;
      this.qh = 0;
      this.where = { section: bar.sec, bar: bar.bar, start: this.nextBar };
      this.nextBar += bar.dur;
    }
    const q = this.q;
    while (this.qh < q.length) {
      const e = q[this.qh];
      if (e.t >= limit) break;
      this.qh++;
      if (e.t < now - 0.05) continue; // too late to be musical — drop it
      this._play(e, Math.max(e.t, now));
    }
    if (this.qh > 512) {
      this.q = q.slice(this.qh);
      this.qh = 0;
    }
  }

  _play(e, t) {
    const ch = this.ch[e.ch];
    if (!ch || !this._audible(ch.layer, t)) return;
    const voice = VOICES[ch.def.inst];
    if (!voice) return;
    try {
      if (e.roll) {
        const rate = ROLL_RATE[ch.def.inst] || 16;
        const n = Math.max(2, Math.floor(e.d * rate));
        for (let i = 0; i < n; i++) {
          const k = i / (n - 1);
          voice(this.res, t + i / rate, e.midi, 0.05, e.vel * (0.3 + 0.7 * k * k), ch, e.v);
        }
        this.notes += n;
      } else {
        voice(this.res, t, e.midi, e.d, e.vel, ch, e.v);
        this.notes++;
      }
      this.m.onNote?.(this.name, e.ch, ch.def.inst, e.midi, t, e.d, e.vel, ch.layer);
    } catch (err) {
      warn(`voice:${ch.def.inst}`, err);
    }
  }

  fadeOut(now, fade) {
    const f = Math.max(0.02, fade);
    this.endAt = now + f;
    for (const g of [this.bus.gain, this.wet.gain]) {
      const v = g.value;
      g.cancelScheduledValues(now);
      g.setValueAtTime(v, now);
      g.linearRampToValueAtTime(0, now + f);
    }
  }

  fadeIn(now, fade) {
    this.endAt = Infinity;
    const f = Math.max(0.02, fade);
    for (const [g, to] of [[this.bus.gain, this.level], [this.wet.gain, this.wetLevel]]) {
      const v = g.value;
      g.cancelScheduledValues(now);
      g.setValueAtTime(v, now);
      g.linearRampToValueAtTime(to, now + f);
    }
  }

  dispose() {
    if (this.dead) return;
    this.dead = true;
    for (const l of this.lfos) {
      try {
        l.stop();
      } catch {
        /* ignore */
      }
    }
    for (const n of [...this.lfos, ...this.nodes]) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.q = [];
    this.ch = {};
  }
}

export class Music {
  /**
   * @param {{ctx: BaseAudioContext, out?: AudioNode}} opts
   */
  constructor({ ctx, out } = {}) {
    this.ctx = ctx || null;
    this.out = out || ctx?.destination || null;
    this.intensity = 0;
    this.track = null;
    this.cur = null;
    this.dying = [];
    this._timer = null;
    this._ahead = LOOKAHEAD;
    this._lastWall = 0;
    this._ok = false;
    /** Optional observer (preview / visualisers): (track, channel, inst, midi, t, dur, vel, layer). */
    this.onNote = null;
    this.offline = !!ctx && typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
    if (!this.ctx || !this.out) return;
    try {
      this._build();
      this._ok = true;
    } catch (err) {
      warn('build', err);
    }
  }

  /** Every track name this player knows. */
  static get tracks() {
    return TRACK_NAMES.slice();
  }

  _build() {
    const ctx = this.ctx;
    this.input = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 2.5;
    comp.attack.value = 0.012;
    comp.release.value = 0.3;
    this.master = ctx.createGain();
    this.master.gain.value = MASTER;
    this.input.connect(comp).connect(this.master).connect(this.out);
    this.reverb = ctx.createGain();
    try {
      const conv = ctx.createConvolver();
      conv.buffer = reverbImpulse(ctx);
      const ret = ctx.createGain();
      ret.gain.value = REVERB_RETURN;
      this.reverb.connect(conv).connect(ret).connect(comp);
    } catch (err) {
      warn('reverb', err);
    }
    this.compressor = comp;
  }

  /**
   * Crossfade to `track` (same track → keeps playing; null → stop).
   * @param {string|null} track
   * @param {{fade?: number, seed?: number, restart?: boolean}} [opts]
   */
  play(track, opts = {}) {
    try {
      if (track == null) return this.stop(opts?.fade);
      if (!this._ok || this.ctx.state === 'closed') return;
      const def = TRACKS[track];
      if (!def) {
        warn(`unknown track ${track}`, 'ignored');
        return;
      }
      const fade = Math.max(0, Number.isFinite(opts?.fade) ? opts.fade : 1.5);
      if (this.cur && this.cur.name === track && !opts?.restart) return;
      const now = this.ctx.currentTime;
      const had = !!this.cur;
      if (this.cur) {
        this.cur.fadeOut(now, fade);
        this.dying.push(this.cur);
        this.cur = null;
      }
      const i = opts?.restart ? -1 : this.dying.findIndex((p) => p.name === track && !p.dead);
      if (i >= 0) {
        // Coming back to a track that is still fading out: swell it back instead of restarting.
        this.cur = this.dying.splice(i, 1)[0];
        this.cur.fadeIn(now, Math.max(0.3, fade * 0.7));
        this.cur.setIntensity(this.intensity, now);
      } else {
        const seed = opts?.seed ?? (this.offline ? hash(track) : (Math.random() * 4294967296) >>> 0);
        const fadeIn = def.stinger ? 0.02 : had ? Math.max(0.05, fade * 0.7) : 0.04;
        this.cur = new Performer(this, track, def, now + 0.05, fadeIn, seed);
      }
      this.track = track;
      this._startTimer();
      if (!this.offline) this._tick();
    } catch (err) {
      warn(`play:${track}`, err);
    }
  }

  /** Fade out and stop. */
  stop(fade = 1.5) {
    try {
      this.track = null;
      if (!this._ok || !this.cur) return;
      const f = Math.max(0, Number.isFinite(fade) ? fade : 1.5);
      this.cur.fadeOut(this.ctx.currentTime, f);
      this.dying.push(this.cur);
      this.cur = null;
    } catch (err) {
      warn('stop', err);
    }
  }

  /** Musical intensity 0..1 → layers crossfade over ~2 s. */
  setIntensity(v) {
    try {
      const x = Number(v);
      this.intensity = Number.isFinite(x) ? clamp(x, 0, 1) : 0;
      if (!this._ok) return;
      const now = this.ctx.currentTime;
      this.cur?.setIntensity(this.intensity, now);
      for (const p of this.dying) p.setIntensity(this.intensity, now);
    } catch (err) {
      warn('intensity', err);
    }
  }

  /**
   * Synchronously schedule everything up to currentTime + seconds (no timers) — for
   * OfflineAudioContext renders. Returns the number of notes scheduled so far.
   */
  renderAhead(seconds = 1) {
    try {
      if (!this._ok) return 0;
      const now = this.ctx.currentTime;
      this._pump(now + Math.max(0, Number(seconds) || 0), now);
    } catch (err) {
      warn('renderAhead', err);
    }
    return this.noteCount;
  }

  /** Total notes scheduled by the current track. */
  get noteCount() {
    return this.cur?.notes ?? 0;
  }

  /** Debug snapshot: track, form position, intensity, layer levels. */
  info() {
    const p = this.cur;
    const out = { track: this.track, intensity: this.intensity, dying: this.dying.length, notes: p?.notes ?? 0 };
    if (p) {
      out.section = p.where?.section ?? null;
      out.bar = p.where?.bar ?? 0;
      out.effective = +p._eff().toFixed(3);
      out.tempo = p.def.tempo;
      out.layers = {};
      const t = this.ctx.currentTime;
      for (const [k, st] of Object.entries(p.ls)) out.layers[k] = +p._est(st, t).toFixed(3);
    }
    return out;
  }

  /** Stop everything immediately and release the graph. */
  dispose() {
    this._stopTimer();
    for (const p of [this.cur, ...this.dying]) p?.dispose();
    this.cur = null;
    this.dying = [];
    try {
      this.master?.disconnect();
    } catch {
      /* ignore */
    }
    this._ok = false;
  }

  _pump(horizon, now) {
    this.cur?.pump(horizon, now);
    for (const p of this.dying) p.pump(horizon, now);
  }

  _tick() {
    try {
      const ctx = this.ctx;
      if (!ctx || ctx.state === 'closed') return this._stopTimer();
      const now = ctx.currentTime;
      // Widen the lookahead after main-thread hitches so a janky frame doesn't punch holes.
      const wall = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const gap = this._lastWall ? (wall - this._lastWall) / 1000 : TICK_MS / 1000;
      this._lastWall = wall;
      this._ahead = clamp(Math.max(this._ahead * 0.995, gap < 2 ? gap * 1.5 : 0), LOOKAHEAD, 0.5);
      this._pump(now + this._ahead, now);
      if (this.dying.length) {
        this.dying = this.dying.filter((p) => {
          if (now <= p.endAt + 0.2) return true;
          p.dispose();
          return false;
        });
      }
      if (!this.cur && !this.dying.length) this._stopTimer();
    } catch (err) {
      warn('tick', err);
    }
  }

  _startTimer() {
    if (this._timer || this.offline) return;
    this._lastWall = 0;
    this._timer = setInterval(() => this._tick(), TICK_MS);
  }

  _stopTimer() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }
}

export { TRACK_NAMES };
