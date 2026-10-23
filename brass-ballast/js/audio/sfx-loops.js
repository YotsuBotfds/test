// WP7 — continuous loops. Each entry: (ctx, out, o) => {pitch(p, time), stop(time)}.
// The engine wraps them with a volume/fade gain; here we only build the sound and expose a pitch
// control. Every source is started immediately and stopped by stop().
import { noiseBuffer, wave, clamp } from './synth.js';

/** Looping noise source. */
function noiseSrc(ctx, color, rate = 1) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx, color);
  s.loop = true;
  s.playbackRate.value = rate;
  return s;
}

function bq(ctx, type, f, q = 0.7) {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  return b;
}

function g(ctx, v) {
  const n = ctx.createGain();
  n.gain.value = v;
  return n;
}

function lfo(ctx, rate, type = 'sine') {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = rate;
  return o;
}

/** Fade-in master for a loop so starts never click. */
function fadeIn(ctx, out, t, secs = 0.15) {
  const n = ctx.createGain();
  n.gain.setValueAtTime(0, t);
  n.gain.linearRampToValueAtTime(1, t + secs);
  n.connect(out);
  return n;
}

/** Helper that tracks sources so stop() can end them all. */
function bag(t) {
  const list = [];
  return {
    add(...s) {
      for (const n of s) {
        // Buffer sources start at a random offset so repeated loops never phase identically.
        if ('buffer' in n) n.start(t, Math.random());
        else n.start(t);
        list.push(n);
      }
    },
    stop(at) {
      for (const n of list) {
        try {
          n.stop(at);
        } catch {
          /* already stopped */
        }
      }
    },
  };
}

const smooth = (param, v, t, tc = 0.08) => param.setTargetAtTime(v, t, tc);

export const LOOPS = {
  /** Chugging steam engine: pulsing filtered noise + a low saw ~45 Hz; rate follows pitch. */
  engine_hum(ctx, out, o) {
    const t = o.t;
    const p0 = o.pitch ?? 1;
    const root = fadeIn(ctx, out, t, 0.3);
    const b = bag(t);

    // Drone: low saw + sub sine, gently low-passed.
    const drone = g(ctx, 0.32);
    const lp = bq(ctx, 'lowpass', 160 + 60 * p0, 0.9);
    drone.connect(lp).connect(root);
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.value = 45 * p0;
    const sub = ctx.createOscillator();
    sub.frequency.value = 45 * p0 * 0.5;
    const subG = g(ctx, 0.6);
    saw.connect(drone);
    sub.connect(subG).connect(drone);

    // Chuff pulses: sawtooth LFO (inverted) gives a sharp attack and linear decay per stroke.
    const rate = 3.4;
    const chug = lfo(ctx, rate * p0, 'sawtooth');
    const depth = g(ctx, -0.5);
    const pulse = g(ctx, 0.5);
    chug.connect(depth).connect(pulse.gain);
    const chNoise = noiseSrc(ctx, 'pink');
    const chBp = bq(ctx, 'bandpass', 520 * p0, 1.1);
    const chLvl = g(ctx, 0.85);
    chNoise.connect(chBp).connect(pulse).connect(chLvl).connect(root);
    // The drone also breathes with the pistons a little.
    const breathe = g(ctx, 0.12);
    chug.connect(breathe).connect(drone.gain);

    // Faint valve-gear ticking (crackle through a narrow band), high and quiet.
    const tick = noiseSrc(ctx, 'crackle', 1.4);
    const tickBp = bq(ctx, 'bandpass', 3200, 2);
    tick.connect(tickBp).connect(g(ctx, 0.25)).connect(root);

    b.add(saw, sub, chug, chNoise, tick);
    return {
      pitch(p, at) {
        p = clamp(p, 0.2, 4);
        smooth(saw.frequency, 45 * p, at);
        smooth(sub.frequency, 22.5 * p, at);
        smooth(chug.frequency, rate * p, at, 0.15);
        smooth(chBp.frequency, 520 * p, at);
        smooth(lp.frequency, 160 + 60 * p, at);
      },
      stop: (at) => b.stop(at),
    };
  },

  /** Howling high-altitude wind with slow gusts and a faint rigging whistle. */
  wind_loop(ctx, out, o) {
    const t = o.t;
    const p0 = o.pitch ?? 1;
    const root = fadeIn(ctx, out, t, 1.2);
    const b = bag(t);

    const body = noiseSrc(ctx, 'pink', 0.8);
    const bp = bq(ctx, 'bandpass', 520 * p0, 0.6);
    const gust = g(ctx, 0.55);
    body.connect(bp).connect(gust).connect(root);
    const sweep = lfo(ctx, 0.11);
    const sweepD = g(ctx, 260);
    sweep.connect(sweepD).connect(bp.frequency);
    const gustL = lfo(ctx, 0.067);
    const gustD = g(ctx, 0.35);
    gustL.connect(gustD).connect(gust.gain);

    const rumble = noiseSrc(ctx, 'brown');
    rumble.connect(bq(ctx, 'lowpass', 180)).connect(g(ctx, 0.45)).connect(root);

    // Rigging whistle: narrow band that wanders.
    const wh = noiseSrc(ctx, 'white');
    const whBp = bq(ctx, 'bandpass', 1250 * p0, 14);
    const whG = g(ctx, 0.12);
    wh.connect(whBp).connect(whG).connect(root);
    const whL = lfo(ctx, 0.05);
    const whD = g(ctx, 180);
    whL.connect(whD).connect(whBp.frequency);
    const whA = lfo(ctx, 0.09);
    const whAD = g(ctx, 0.1);
    whA.connect(whAD).connect(whG.gain);

    b.add(body, sweep, gustL, rumble, wh, whL, whA);
    return {
      pitch(p, at) {
        smooth(bp.frequency, 520 * p, at, 0.4);
        smooth(whBp.frequency, 1250 * p, at, 0.4);
      },
      stop: (at) => b.stop(at),
    };
  },

  /** Rain on canvas and deck: fine hiss + dense droplets + heavier drips. */
  rain_loop(ctx, out, o) {
    const t = o.t;
    const p0 = o.pitch ?? 1;
    // Slow swell in intensity.
    const lvl = g(ctx, 1);
    lvl.connect(out);
    const sw = lfo(ctx, 0.04);
    const swD = g(ctx, 0.15);
    sw.connect(swD).connect(lvl.gain);
    const root = fadeIn(ctx, lvl, t, 1);
    const b = bag(t);

    const hissN = noiseSrc(ctx, 'pink');
    const hp = bq(ctx, 'highpass', 900);
    const lp = bq(ctx, 'lowpass', 7000 * p0);
    hissN.connect(hp).connect(lp).connect(g(ctx, 0.28)).connect(root);

    const drops = noiseSrc(ctx, 'patter');
    const dHp = bq(ctx, 'highpass', 1800 * p0);
    drops.connect(dHp).connect(g(ctx, 0.9)).connect(root);

    const heavy = noiseSrc(ctx, 'patter', 0.45);
    const hBp = bq(ctx, 'bandpass', 700 * p0, 1.2);
    heavy.connect(hBp).connect(g(ctx, 0.8)).connect(root);

    b.add(hissN, drops, heavy, sw);
    return {
      pitch(p, at) {
        smooth(lp.frequency, 7000 * p, at, 0.3);
        smooth(dHp.frequency, 1800 * p, at, 0.3);
        smooth(hBp.frequency, 700 * p, at, 0.3);
      },
      stop: (at) => b.stop(at),
    };
  },

  /** Aether lance charging: rising whine with growing vibrato and crystalline fizz. */
  lance_charge(ctx, out, o) {
    const t = o.t;
    const p0 = o.pitch ?? 1;
    const root = fadeIn(ctx, out, t, 0.05);
    const b = bag(t);
    const rise = o.rise ?? 1.3;

    const whine = ctx.createOscillator();
    whine.frequency.setValueAtTime(220 * p0, t);
    whine.frequency.exponentialRampToValueAtTime(1500 * p0, t + rise);
    const wG = g(ctx, 0.22);
    whine.connect(wG).connect(root);

    const edge = ctx.createOscillator();
    edge.type = 'sawtooth';
    edge.frequency.setValueAtTime(110 * p0, t);
    edge.frequency.exponentialRampToValueAtTime(750 * p0, t + rise);
    const eBp = bq(ctx, 'bandpass', 1800, 4);
    edge.connect(eBp).connect(g(ctx, 0.12)).connect(root);

    // Vibrato that grows as the charge builds.
    const vib = lfo(ctx, 7);
    const vibD = ctx.createGain();
    vibD.gain.setValueAtTime(0, t);
    vibD.gain.linearRampToValueAtTime(35, t + rise);
    vib.connect(vibD);
    vibD.connect(whine.detune);
    vibD.connect(edge.detune);

    const fizz = noiseSrc(ctx, 'hiss');
    const fHp = bq(ctx, 'highpass', 6000);
    const fG = ctx.createGain();
    fG.gain.setValueAtTime(0.0, t);
    fG.gain.linearRampToValueAtTime(0.14, t + rise);
    fizz.connect(fHp).connect(fG).connect(root);

    b.add(whine, edge, vib, fizz);
    return {
      pitch(p, at) {
        // Only steer after the initial rise so the charge-up always plays.
        const when = Math.max(at, t + rise);
        whine.frequency.setTargetAtTime(1500 * p, when, 0.1);
        edge.frequency.setTargetAtTime(750 * p, when, 0.1);
      },
      stop: (at) => b.stop(at),
    };
  },

  /** Spinning buzz-saw: toothy saw buzz with a grinding high whine. */
  saw_whirr(ctx, out, o) {
    const t = o.t;
    const p0 = o.pitch ?? 1;
    const root = fadeIn(ctx, out, t, 0.2);
    const b = bag(t);

    const s1 = ctx.createOscillator();
    s1.type = 'sawtooth';
    s1.frequency.value = 96 * p0;
    const s2 = ctx.createOscillator();
    s2.setPeriodicWave(wave(ctx, 'reed'));
    s2.frequency.value = 193 * p0;
    const bp = bq(ctx, 'bandpass', 1500 * p0, 2.2);
    const teeth = g(ctx, 0.6);
    s1.connect(bp);
    s2.connect(bp);
    bp.connect(teeth).connect(g(ctx, 0.35)).connect(root);
    // Teeth: amplitude flutter.
    const am = lfo(ctx, 24 * p0, 'square');
    const amD = g(ctx, 0.35);
    am.connect(amD).connect(teeth.gain);

    const whine = ctx.createOscillator();
    whine.frequency.value = 2350 * p0;
    whine.connect(g(ctx, 0.035)).connect(root);

    const grind = noiseSrc(ctx, 'white');
    const gBp = bq(ctx, 'bandpass', 4200 * p0, 3);
    grind.connect(gBp).connect(g(ctx, 0.12)).connect(root);

    b.add(s1, s2, am, whine, grind);
    return {
      pitch(p, at) {
        smooth(s1.frequency, 96 * p, at);
        smooth(s2.frequency, 193 * p, at);
        smooth(bp.frequency, 1500 * p, at);
        smooth(am.frequency, 24 * p, at);
        smooth(whine.frequency, 2350 * p, at);
        smooth(gBp.frequency, 4200 * p, at);
      },
      stop: (at) => b.stop(at),
    };
  },
};
