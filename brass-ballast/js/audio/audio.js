// WP7 — audio engine facade (DESIGN §4.17). One AudioContext, created lazily on init()/unlock().
//
//   voices ─► voiceGain ─► panner ─► sfxBus ─┬──────────────────────┐
//                                            └─► reverb send ─► IR ─┤
//   Music (WP8) ─────────────────► musicBus ─► duck ──────────────────► master ─► comp ─► limiter ─► out
//
// Every public method is safe to call at any time: before unlock it silently does nothing (loops
// and music requests are remembered and start on unlock), and nothing ever throws.
import { SFX, LOOPS, sfxMeta } from './sfx.js';
import { Music } from './music.js';
import { Save } from '../core/storage.js';
import { events } from '../core/events.js';

const MAX_VOICES = 24;
const PAN_RANGE = 600; // world units for full left/right
const FALLOFF_START = 900; // beyond this distance sounds attenuate…
const FALLOFF_SPAN = 1100; // …reaching the floor this much further out
const FALLOFF_MIN = 0.15;
const REVERB_SEND = 0.14;

/** Per-biome ambience beds: [loop, vol, pitch]. Unknown biomes get a light breeze. */
const AMBIENCE = {
  brassbay: [['wind_loop', 0.22, 0.9]],
  smog: [['wind_loop', 0.18, 0.7]],
  tempest: [['wind_loop', 0.4, 1.25], ['rain_loop', 0.55, 1]],
  aurora: [['wind_loop', 0.32, 1.35]],
  furnace: [['wind_loop', 0.16, 0.6]],
  default: [['wind_loop', 0.2, 1]],
};
const MENU_SCREENS = new Set(['title', 'hangar', 'modes', 'workshop', 'codex', 'credits']);

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

function urlFlag(k) {
  try {
    const q = new URLSearchParams(globalThis.location?.search || '');
    return q.has(k) && q.get(k) !== '0';
  } catch {
    return false;
  }
}

/** Stereo impulse response: short pre-delay, dense exponentially decaying, darkening tail. */
function makeImpulse(ctx, seconds = 1.7, decay = 3.2) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  const pre = Math.floor(sr * 0.018);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const x = (i - pre) / (len - pre);
      // One-pole low-pass whose cutoff falls over time → the tail gets darker, like air.
      const k = 0.55 + 0.4 * x;
      lp = lp * k + (Math.random() * 2 - 1) * (1 - k);
      d[i] = lp * Math.pow(1 - x, decay) * 2.2;
    }
  }
  return buf;
}

/** A loop request. Lives before unlock too, and starts itself once audio is live. */
class LoopHandle {
  constructor(engine, name, opts) {
    this.engine = engine;
    this.name = name;
    this.vol = num(opts?.vol, 1);
    this.pitch = num(opts?.pitch, 1);
    this.pan = num(opts?.pan, 0);
    this.x = opts?.x;
    this.y = opts?.y;
    this.opts = opts || {};
    this.stopped = false;
    this.def = null;
    this.gain = null;
    this.panner = null;
  }

  _target() {
    let vol = this.vol;
    let pan = this.pan;
    if (typeof this.x === 'number' && typeof this.y === 'number') {
      const r = this.engine._spatial(this.x, this.y);
      vol *= r.att;
      pan = r.pan;
    }
    return { vol: Math.max(0, vol), pan };
  }

  _start() {
    if (this.def || this.stopped) return;
    const eng = this.engine;
    const ctx = eng.ctx;
    const make = LOOPS[this.name];
    if (!make || !ctx) return;
    const t = ctx.currentTime + 0.01;
    const { vol, pan } = this._target();
    this.gain = ctx.createGain();
    this.gain.gain.value = vol;
    const bus = this.opts.bus === 'music' ? eng.musicBus : eng.sfxBus;
    if (ctx.createStereoPanner) {
      this.panner = ctx.createStereoPanner();
      this.panner.pan.value = clamp(pan, -1, 1);
      this.gain.connect(this.panner).connect(bus);
    } else {
      this.gain.connect(bus);
    }
    this.def = make(ctx, this.gain, { ...this.opts, t, pitch: this.pitch });
  }

  /**
   * Update volume / pitch (and optional pan or world position).
   * @param {{vol?: number, pitch?: number, pan?: number, x?: number, y?: number}} o
   */
  set(o) {
    try {
      if (!o || this.stopped) return;
      if (o.vol !== undefined) this.vol = num(o.vol, this.vol);
      if (o.pitch !== undefined) this.pitch = num(o.pitch, this.pitch);
      if (o.pan !== undefined) this.pan = num(o.pan, this.pan);
      if (o.x !== undefined) this.x = o.x;
      if (o.y !== undefined) this.y = o.y;
      if (!this.def) return;
      // Callers update every frame; only schedule automation when something audibly changed so
      // AudioParam event lists stay short.
      const now = this.engine.ctx.currentTime;
      const { vol, pan } = this._target();
      const ap = this._applied || (this._applied = { vol: -1, pan: 9, pitch: -1 });
      if (Math.abs(vol - ap.vol) > 0.003) {
        this.gain.gain.setTargetAtTime(vol, now, 0.06);
        ap.vol = vol;
      }
      if (this.panner && Math.abs(pan - ap.pan) > 0.01) {
        this.panner.pan.setTargetAtTime(clamp(pan, -1, 1), now, 0.06);
        ap.pan = pan;
      }
      if (Math.abs(this.pitch - ap.pitch) > 0.004) {
        this.def.pitch?.(this.pitch, now);
        ap.pitch = this.pitch;
      }
    } catch {
      /* never throw from audio */
    }
  }

  /** Fade out over `fade` seconds and release. */
  stop(fade = 0.3) {
    if (this.stopped) return;
    this.stopped = true;
    this.engine._loops.delete(this);
    try {
      if (!this.def) return;
      const ctx = this.engine.ctx;
      const now = ctx.currentTime;
      const f = Math.max(0.01, num(fade, 0.3));
      const g = this.gain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + f);
      this.def.stop?.(now + f + 0.05);
      const gain = this.gain;
      const pan = this.panner;
      setTimeout(() => {
        try {
          gain.disconnect();
          pan?.disconnect();
        } catch {
          /* ignore */
        }
      }, (f + 0.2) * 1000);
    } catch {
      /* never throw from audio */
    }
  }

  get playing() {
    return !!this.def && !this.stopped;
  }
}

class AudioEngine {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.musicDuck = null;
    this.compressor = null;
    this.limiter = null;
    this.reverb = null;
    this.musicPlayer = null;
    this.analyser = null;
    this.listener = { x: 0, y: 0 };
    this.unlocked = false;
    this.currentTrack = null;
    this.intensity = 0;
    this.volumes = { master: 0.8, music: 0.6, sfx: 0.8 };
    this._voices = [];
    this._last = new Map();
    this._loops = new Set();
    this._trackOpts = null;
    this._playingTrack = undefined;
    this._suspended = false;
    this._hidden = false;
    this._wired = false;
    this._warned = new Set();
    this._duckUntil = 0;
    this._duckLevel = 1;
    this._stats = { played: 0, throttled: 0, stolen: 0, dropped: 0 };
    this._ambience = null;
    this._ambienceLoops = [];
    this._wire();
  }

  // ---- Lifecycle -----------------------------------------------------------------------------

  /** Create the AudioContext and mixer graph (idempotent). Returns the context or null. */
  init() {
    if (this.ctx) return this.ctx;
    try {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return null;
      let ctx;
      try {
        ctx = new AC({ latencyHint: 'interactive' });
      } catch {
        ctx = new AC();
      }
      this.ctx = ctx;
      this._build(ctx);
      this._applySettings();
      try {
        this.musicPlayer = new Music({ ctx, out: this.musicBus });
        this.musicPlayer?.setIntensity?.(this.intensity);
      } catch (err) {
        this._warn('music', err);
        this.musicPlayer = null;
      }
      ctx.onstatechange = () => {
        if (ctx.state === 'running' && this.unlocked) this._startPending();
      };
      return ctx;
    } catch (err) {
      this._warn('init', err);
      this.ctx = null;
      return null;
    }
  }

  /** Call from a user gesture: resumes the context and starts anything that was waiting. */
  unlock() {
    try {
      const ctx = this.init();
      if (!ctx) return;
      this.unlocked = true;
      if (ctx.state !== 'running' && !this._hidden && !this._suspended) {
        const p = ctx.resume();
        p?.then?.(() => this._startPending(), () => {});
      }
      // iOS Safari only truly unlocks once a buffer is played inside the gesture.
      if (!this._primed) {
        this._primed = true;
        const src = ctx.createBufferSource();
        src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        src.connect(ctx.destination);
        src.start(0);
      }
      this._startPending();
    } catch (err) {
      this._warn('unlock', err);
    }
  }

  _build(ctx) {
    this.master = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.musicDuck = ctx.createGain();

    // Gentle glue compressor, then a fast brick-wall-ish limiter to catch stacked explosions.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.006;
    comp.release.value = 0.22;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -3;
    lim.knee.value = 0;
    lim.ratio.value = 20;
    lim.attack.value = 0.001;
    lim.release.value = 0.08;
    this.compressor = comp;
    this.limiter = lim;

    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.musicDuck).connect(this.master);
    this.master.connect(comp).connect(lim).connect(ctx.destination);

    // Airy reverb send so explosions & bells bloom across the sky. One convolver total.
    try {
      const rev = ctx.createConvolver();
      rev.buffer = makeImpulse(ctx);
      const send = ctx.createGain();
      send.gain.value = REVERB_SEND;
      const ret = ctx.createGain();
      ret.gain.value = 0.9;
      this.sfxBus.connect(send).connect(rev).connect(ret).connect(this.master);
      this.reverb = rev;
      this.reverbSend = send;
    } catch (err) {
      this._warn('reverb', err);
    }
  }

  _live() {
    return this.unlocked && !!this.ctx && this.ctx.state === 'running';
  }

  _startPending() {
    if (!this._live()) return;
    for (const h of this._loops) {
      try {
        h._start();
      } catch (err) {
        this._warn(`loop:${h.name}`, err);
      }
    }
    if (this._playingTrack !== this.currentTrack) this._applyMusic();
  }

  _wire() {
    if (this._wired) return;
    this._wired = true;
    try {
      events.on('settings:change', () => this._applySettings());
      // Gameplay hooks that no other module owns. Same-name throttling makes a duplicate call
      // from elsewhere harmless.
      events.on('achievement:unlock', () => this.play('achievement'));
      events.on('stage:start', (e) => this.ambience(e?.stage?.biome || e?.stage?.id || 'default'));
      events.on('run:end', () => this.ambience(null, 3));
      events.on('ui:screen', (e) => {
        if (MENU_SCREENS.has(e?.name)) this.ambience(null, 1.5);
      });
    } catch {
      /* events optional */
    }
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => {
      this._hidden = document.hidden;
      if (!this.ctx) return;
      try {
        if (document.hidden) this.ctx.suspend?.().catch?.(() => {});
        else if (!this._suspended && this.unlocked) this.ctx.resume?.().catch?.(() => {});
      } catch {
        /* ignore */
      }
    });
    // Fallback unlock on the first real gesture, in case nobody wires input → audio.unlock().
    const gesture = () => {
      for (const ev of ['pointerdown', 'keydown', 'touchend', 'mousedown']) {
        window.removeEventListener(ev, gesture, true);
      }
      this.unlock();
    };
    if (typeof window !== 'undefined') {
      for (const ev of ['pointerdown', 'keydown', 'touchend', 'mousedown']) {
        window.addEventListener(ev, gesture, { capture: true, passive: true });
      }
    }
  }

  // ---- Volumes -------------------------------------------------------------------------------

  _applySettings() {
    try {
      const s = Save.settings || {};
      this.setVolumes({
        master: urlFlag('mute') ? 0 : num(s.master, this.volumes.master),
        music: num(s.music, this.volumes.music),
        sfx: num(s.sfx, this.volumes.sfx),
      });
    } catch {
      /* storage optional */
    }
  }

  /**
   * Set bus volumes (0..1 each). Missing keys keep their value.
   * @param {{master?: number, music?: number, sfx?: number}} v
   */
  setVolumes(v = {}) {
    try {
      const vol = this.volumes;
      if (v.master !== undefined) vol.master = clamp(num(v.master, vol.master), 0, 1);
      if (v.music !== undefined) vol.music = clamp(num(v.music, vol.music), 0, 1);
      if (v.sfx !== undefined) vol.sfx = clamp(num(v.sfx, vol.sfx), 0, 1);
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      // Squared-ish taper: sliders feel even, and the bottom of the range is truly quiet.
      const taper = (x) => x * (0.35 + 0.65 * x);
      this.master.gain.setTargetAtTime(taper(vol.master), now, 0.03);
      this.musicBus.gain.setTargetAtTime(taper(vol.music), now, 0.03);
      this.sfxBus.gain.setTargetAtTime(taper(vol.sfx), now, 0.03);
    } catch (err) {
      this._warn('volumes', err);
    }
  }

  // ---- One-shots -----------------------------------------------------------------------------

  /** Listener position (camera center) for positional sounds. */
  setListener(x, y) {
    if (typeof x === 'number' && Number.isFinite(x)) this.listener.x = x;
    if (typeof y === 'number' && Number.isFinite(y)) this.listener.y = y;
  }

  _spatial(x, y) {
    const dx = x - this.listener.x;
    const dy = y - this.listener.y;
    const pan = clamp(dx / PAN_RANGE, -1, 1);
    const d = Math.hypot(dx, dy);
    const att = d <= FALLOFF_START ? 1 : Math.max(FALLOFF_MIN, 1 - (d - FALLOFF_START) / FALLOFF_SPAN);
    return { pan, att };
  }

  /**
   * Play a one-shot SFX.
   * @param {string} name  any key of SFX (DESIGN §4.17)
   * @param {{vol?: number, pitch?: number, pan?: number, x?: number, y?: number,
   *   delay?: number, exact?: boolean}} [opts]  exact: skip the random pitch jitter.
   * @returns {boolean} whether a voice started
   */
  play(name, opts) {
    try {
      return this._play(name, opts || {});
    } catch (err) {
      this._warn(`play:${name}`, err);
      return false;
    }
  }

  _play(name, o) {
    if (!this._live()) return false;
    const fn = SFX[name];
    if (!fn) {
      this._warn(`unknown sfx "${name}"`);
      return false;
    }
    const ctx = this.ctx;
    const meta = sfxMeta(name);
    const now = ctx.currentTime;
    const t = now + 0.004 + clamp(num(o.delay, 0), 0, 10);

    const last = this._last.get(name);
    if (last !== undefined && Math.abs(t - last) < meta.gap) {
      this._stats.throttled++;
      return false;
    }

    let vol = num(o.vol, 1) * meta.gain;
    let pan = clamp(num(o.pan, 0), -1, 1);
    if (typeof o.x === 'number' && typeof o.y === 'number' && Number.isFinite(o.x + o.y)) {
      const r = this._spatial(o.x, o.y);
      pan = r.pan;
      vol *= r.att;
    }
    if (!(vol > 0.002)) return false;

    // Voice management: per-name cap, then the global cap.
    this._prune(now);
    const voices = this._voices;
    let same = 0;
    let oldestSame = -1;
    for (let i = 0; i < voices.length; i++) {
      if (voices[i].name === name) {
        same++;
        if (oldestSame < 0) oldestSame = i;
      }
    }
    if (same >= meta.max) {
      // Steal the oldest instance only once it has had its attack heard; otherwise drop the
      // newcomer so rapid-fire sounds don't chop each other into clicks.
      if (now - voices[oldestSame].start < 0.06) {
        this._stats.dropped++;
        return false;
      }
      this._kill(oldestSame, now);
    }
    if (voices.length >= MAX_VOICES) {
      let victim = -1;
      for (let i = 0; i < voices.length; i++) {
        if (voices[i].prio <= meta.prio) {
          victim = i;
          break;
        }
      }
      if (victim < 0) {
        this._stats.dropped++;
        return false;
      }
      this._kill(victim, now);
    }

    const jitter = o.exact ? 0 : meta.jitter;
    const pitch = clamp(num(o.pitch, 1), 0.1, 8) * (1 + (Math.random() * 2 - 1) * jitter);
    const vg = ctx.createGain();
    vg.gain.value = vol;
    let tail = vg;
    if (pan !== 0 && ctx.createStereoPanner) {
      const pn = ctx.createStereoPanner();
      pn.pan.value = pan;
      vg.connect(pn);
      tail = pn;
    }
    tail.connect(this.sfxBus);
    const end = fn(ctx, vg, { ...o, t, pitch, vol: 1 });
    const dur = Number.isFinite(end) ? Math.max(0.05, end - t) : 2;
    voices.push({ name, prio: meta.prio, start: t, end: t + dur + 0.05, gain: vg, tail });
    this._last.set(name, t);
    this._stats.played++;
    if (meta.duck && vol > 0.25) this.duck(meta.duck * Math.min(1, vol), meta.duckTime);
    return true;
  }

  _prune(now) {
    const v = this._voices;
    let w = 0;
    for (let i = 0; i < v.length; i++) {
      const voice = v[i];
      if (voice.end > now) v[w++] = voice;
      else this._release(voice);
    }
    v.length = w;
  }

  _release(voice) {
    try {
      voice.tail.disconnect();
      if (voice.tail !== voice.gain) voice.gain.disconnect();
    } catch {
      /* ignore */
    }
  }

  _kill(index, now) {
    const voice = this._voices[index];
    if (!voice) return;
    this._voices.splice(index, 1);
    this._stats.stolen++;
    try {
      const g = voice.gain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + 0.025);
      setTimeout(() => this._release(voice), 60);
    } catch {
      /* ignore */
    }
  }

  // ---- Loops ---------------------------------------------------------------------------------

  /**
   * Start a continuous loop (engine_hum, wind_loop, rain_loop, lance_charge, saw_whirr).
   * Safe before unlock: the handle starts itself once audio is live.
   * @param {string} name
   * @param {{vol?: number, pitch?: number, pan?: number, x?: number, y?: number,
   *   bus?: 'sfx'|'music'}} [opts]
   * @returns {{set(o: {vol?: number, pitch?: number, pan?: number, x?: number, y?: number}): void,
   *   stop(fade?: number): void, readonly playing: boolean}}
   */
  loop(name, opts) {
    const h = new LoopHandle(this, name, opts);
    try {
      if (!LOOPS[name]) {
        this._warn(`unknown loop "${name}"`);
        h.stopped = true;
        return h;
      }
      this._loops.add(h);
      if (this._live()) h._start();
    } catch (err) {
      this._warn(`loop:${name}`, err);
    }
    return h;
  }

  /** Stop every loop (e.g. when leaving a run). */
  stopLoops(fade = 0.3) {
    for (const h of [...this._loops]) h.stop(fade);
  }

  /**
   * Switch the ambience bed (wind / rain loops) for a biome; null fades it out.
   * Driven automatically by stage:start / run:end / menu screens.
   * @param {string|null} biome
   * @param {number} [fade]
   */
  ambience(biome, fade = 2) {
    try {
      if (biome === this._ambience) return;
      this._ambience = biome;
      for (const h of this._ambienceLoops) h.stop(fade);
      this._ambienceLoops = [];
      if (!biome) return;
      for (const [name, vol, pitch] of AMBIENCE[biome] || AMBIENCE.default) {
        this._ambienceLoops.push(this.loop(name, { vol, pitch }));
      }
    } catch (err) {
      this._warn('ambience', err);
    }
  }

  // ---- Music ---------------------------------------------------------------------------------

  /**
   * Switch music track (null stops). Remembered until audio unlocks.
   * @param {string|null} track
   * @param {{fade?: number, restart?: boolean}} [opts]
   */
  music(track, opts) {
    try {
      const same = track === this.currentTrack && this._playingTrack === track;
      this.currentTrack = track ?? null;
      this._trackOpts = opts || {};
      if (same && !opts?.restart) return;
      if (this._live()) this._applyMusic();
    } catch (err) {
      this._warn('music', err);
    }
  }

  _applyMusic() {
    const p = this.musicPlayer;
    const track = this.currentTrack;
    this._playingTrack = track;
    if (!p) return;
    try {
      if (track == null) p.stop?.(num(this._trackOpts?.fade, 1));
      else p.play?.(track, { fade: 1, ...this._trackOpts });
    } catch (err) {
      this._warn(`music:${track}`, err);
    }
  }

  /** Musical intensity 0..1 (WP8 crossfades layers). */
  setIntensity(v) {
    this.intensity = clamp(num(v, 0), 0, 1);
    try {
      this.musicPlayer?.setIntensity?.(this.intensity);
    } catch (err) {
      this._warn('intensity', err);
    }
  }

  /**
   * Dip the music bus by `amount` (0..1) for `seconds`, then recover. Overlapping ducks keep the
   * deepest level and the latest end time.
   */
  duck(amount = 0.5, seconds = 0.5) {
    try {
      if (!this.ctx || !this.musicDuck) return;
      const now = this.ctx.currentTime;
      let level = 1 - clamp(num(amount, 0.5), 0, 1);
      const active = now < this._duckUntil;
      if (active) level = Math.min(level, this._duckLevel);
      const until = Math.max(now + Math.max(0.05, num(seconds, 0.5)), active ? this._duckUntil : 0);
      this._duckLevel = level;
      this._duckUntil = until;
      const g = this.musicDuck.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(level, now + 0.06);
      g.setValueAtTime(level, until);
      g.linearRampToValueAtTime(1, until + 0.6);
    } catch (err) {
      this._warn('duck', err);
    }
  }

  // ---- Suspend / resume ------------------------------------------------------------------------

  suspend() {
    this._suspended = true;
    try {
      this.ctx?.suspend?.()?.catch?.(() => {});
    } catch {
      /* ignore */
    }
  }

  resume() {
    this._suspended = false;
    try {
      if (this.ctx && this.unlocked && !this._hidden) {
        this.ctx.resume?.()?.then?.(() => this._startPending(), () => {});
      }
    } catch {
      /* ignore */
    }
  }

  // ---- Introspection (debug / preview) ---------------------------------------------------------

  /** Does a one-shot or loop with this name exist? */
  has(name) {
    return !!(SFX[name] || LOOPS[name]);
  }

  /** Lazily created analyser tapped off the limiter (for visualizers). */
  getAnalyser() {
    if (!this.ctx) return null;
    if (!this.analyser) {
      try {
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 2048;
        this.limiter.connect(this.analyser);
      } catch {
        return null;
      }
    }
    return this.analyser;
  }

  stats() {
    if (this.ctx) this._prune(this.ctx.currentTime);
    return {
      state: this.ctx?.state ?? 'none',
      unlocked: this.unlocked,
      voices: this._voices.length,
      loops: this._loops.size,
      ambience: this._ambience,
      track: this.currentTrack,
      intensity: this.intensity,
      ...this._stats,
    };
  }

  _warn(what, err) {
    if (this._warned.has(what)) return;
    this._warned.add(what);
    try {
      console.warn(`[audio] ${what}`, err?.message ?? err ?? '');
    } catch {
      /* ignore */
    }
  }
}

/** The game's single audio engine. */
export const audio = new AudioEngine();
