// WP7 — combat SFX: weapons, auxiliaries, impacts & explosions, enemy ordnance, player events.
// Each entry is (ctx, out, o) => endTime, where o = {t, pitch, ...caller opts}. They accept any
// BaseAudioContext so the preview can render them offline.
import {
  RATIOS, note, rand, pick, osc, noise, partials, fm, thump, brass, click, hiss, repeat, gain,
  panner, filter, drive,
} from './synth.js';

const P = (o) => o.pitch ?? 1;

/** Shared cannon body: sub thump + noise crack + boom tail + short metallic ring. */
function cannon(ctx, out, t, p, o = {}) {
  const size = o.size ?? 1;
  const dark = o.dark ?? 1;
  let end = thump(ctx, out, { t, f: 150 * p / size, f2: 42 * p, d: 0.26 * size, vol: 0.62 });
  // Crack — the muzzle report.
  noise(ctx, out, {
    t,
    d: 0.05,
    vol: 0.42 / dark,
    filter: [{ type: 'highpass', f: 900 }, { type: 'lowpass', f: 7000 / dark }],
  });
  // Boom body with a closing low-pass sweep.
  end = Math.max(
    end,
    noise(ctx, out, {
      t,
      color: 'pink',
      a: 0.004,
      d: 0.38 * size,
      vol: 0.5,
      filter: { type: 'lowpass', f: 2400 / dark, f2: 160, glide: 0.3 * size, q: 0.7 },
    })
  );
  if (o.ring !== 0) {
    partials(ctx, out, {
      t: t + 0.004,
      f: 380 * p * (o.ring ?? 1),
      ratios: RATIOS.plate,
      d: 0.22,
      vol: 0.075 / dark,
      fall: 0.5,
    });
  }
  return end;
}

/** Explosion layers shared by every size. s = 0 (small) .. 3 (huge). */
function explosion(ctx, out, t, p, s) {
  const dur = [0.32, 0.6, 1.1, 1.9][s];
  const sub = [0.55, 0.62, 0.68, 0.72][s];
  let end = thump(ctx, out, {
    t,
    f: [130, 95, 75, 60][s] * p,
    f2: [42, 34, 28, 22][s] * p,
    glide: [0.12, 0.2, 0.35, 0.6][s],
    d: dur * 0.8,
    vol: sub,
  });
  // Initial crack.
  noise(ctx, out, { t, d: 0.03 + s * 0.015, vol: 0.32, filter: { type: 'highpass', f: 1200 } });
  // Body: pink noise, low-pass sweeping shut; driven a little for grit on larger sizes.
  const bodyOut = s >= 2 ? drive(ctx, 0.25) : null;
  if (bodyOut) bodyOut.connect(out);
  end = Math.max(
    end,
    noise(ctx, bodyOut || out, {
      t,
      color: 'pink',
      a: 0.003,
      d: dur,
      vol: [0.5, 0.55, 0.5, 0.48][s],
      filter: { type: 'lowpass', f: 4200 * p, f2: 140, glide: dur * 0.7, q: 0.8 },
      rate: 1 - s * 0.12,
    })
  );
  // Rumble tail (brown noise) for medium+.
  if (s >= 1) {
    end = Math.max(
      end,
      noise(ctx, out, {
        t: t + 0.02,
        color: 'brown',
        a: 0.04,
        d: dur * 1.3,
        vol: 0.35 + s * 0.07,
        filter: { type: 'lowpass', f: 420, f2: 90, glide: dur * 1.2 },
      })
    );
  }
  // Debris: crackle + random metallic tinks.
  noise(ctx, out, {
    t: t + 0.03,
    color: 'crackle',
    a: 0.01,
    d: dur * 0.9,
    vol: 0.4 + s * 0.08,
    filter: { type: 'bandpass', f: 2600, q: 0.7 },
  });
  const tinks = [0, 1, 3, 6][s];
  for (let i = 0; i < tinks; i++) {
    partials(ctx, out, {
      t: t + rand(0.12, dur * 0.8),
      f: rand(900, 2600),
      ratios: RATIOS.tink,
      d: rand(0.08, 0.2),
      vol: rand(0.03, 0.07),
    });
  }
  return end;
}

/** Electrical crackle: n bandpassed noise bursts scattered over `span` seconds. */
function crackle(ctx, out, t, n, span, vol, fLo = 1400, fHi = 6000) {
  let end = t;
  for (let i = 0; i < n; i++) {
    const ti = t + Math.pow(Math.random(), 1.3) * span;
    end = Math.max(
      end,
      noise(ctx, out, {
        t: ti,
        d: rand(0.008, 0.035),
        vol: vol * rand(0.5, 1),
        filter: { type: 'bandpass', f: rand(fLo, fHi), q: rand(2, 8) },
        pan: rand(-0.3, 0.3),
      })
    );
  }
  return end;
}

export const COMBAT = {
  // ---- Primary weapons -------------------------------------------------------------------
  fire_cannon(ctx, out, o) {
    return cannon(ctx, out, o.t, P(o));
  },

  fire_gatling(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    noise(ctx, out, { t, d: 0.025, vol: 0.5, filter: { type: 'bandpass', f: 3200 * p, q: 1.6 } });
    osc(ctx, out, { t, type: 'square', f: 1100 * p, f2: 300, d: 0.018, vol: 0.08 });
    // Mechanism click a hair later — the bolt cycling.
    click(ctx, out, { t: t + 0.012, f: 5200 * p, vol: 0.12, d: 0.008 });
    return thump(ctx, out, { t, f: 190 * p, f2: 70, d: 0.06, vol: 0.4 });
  },

  fire_blunderbuss(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    let end = thump(ctx, out, { t, f: 110 * p, f2: 32, d: 0.42, vol: 0.7, glide: 0.15 });
    // Wide: two decorrelated boom layers panned hard.
    for (const pan of [-0.75, 0.75]) {
      end = Math.max(
        end,
        noise(ctx, out, {
          t: t + (pan > 0 ? 0.006 : 0),
          color: 'pink',
          d: 0.5,
          vol: 0.34,
          pan,
          filter: { type: 'lowpass', f: 3000, f2: 220, glide: 0.4 },
        })
      );
    }
    // Scattershot rattle.
    noise(ctx, out, {
      t: t + 0.015,
      color: 'crackle',
      d: 0.3,
      vol: 0.5,
      filter: { type: 'highpass', f: 1800 },
    });
    noise(ctx, out, { t, d: 0.06, vol: 0.3, filter: { type: 'highpass', f: 1500 } });
    return end;
  },

  fire_mortar(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    // Hollow tube "thoonk": resonant pitch drop + tube-mode bandpassed noise.
    osc(ctx, out, { t, f: 280 * p, f2: 140 * p, glide: 0.09, d: 0.2, vol: 0.4 });
    osc(ctx, out, { t, type: 'triangle', f: 560 * p, f2: 300 * p, glide: 0.06, d: 0.07, vol: 0.12 });
    noise(ctx, out, { t, d: 0.14, vol: 0.5, filter: { type: 'bandpass', f: 420 * p, q: 5 } });
    let end = thump(ctx, out, { t, f: 90 * p, f2: 38, d: 0.22, vol: 0.5 });
    // Shell leaving: soft air whoosh.
    end = Math.max(
      end,
      noise(ctx, out, {
        t: t + 0.05,
        a: 0.05,
        d: 0.25,
        vol: 0.1,
        filter: { type: 'bandpass', f: 900, f2: 2400, q: 1.5 },
      })
    );
    return end;
  },

  fire_lance(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    // Zappy rising sine with a sawtooth edge.
    osc(ctx, out, { t, f: 260 * p, f2: 2600 * p, glide: 0.13, d: 0.28, vol: 0.26 });
    osc(ctx, out, {
      t,
      type: 'sawtooth',
      f: 130 * p,
      f2: 1300 * p,
      glide: 0.13,
      d: 0.2,
      vol: 0.1,
      filter: { type: 'bandpass', f: 800, f2: 5000, q: 3 },
    });
    noise(ctx, out, { t, d: 0.08, vol: 0.18, filter: { type: 'highpass', f: 3000 } });
    // Crystalline shimmer: scattered high glass partials.
    let end = t;
    const tones = [note('E7'), note('B6'), note('G#7'), note('E8'), note('C#7')];
    for (let i = 0; i < 5; i++) {
      end = Math.max(
        end,
        partials(ctx, out, {
          t: t + 0.05 + i * 0.035 + rand(0, 0.02),
          f: tones[i] * p * rand(0.995, 1.005),
          ratios: RATIOS.bar,
          d: 0.35,
          vol: 0.045,
        })
      );
    }
    return end;
  },

  fire_harpoon(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    // Chunk: heavy spring release.
    thump(ctx, out, { t, f: 200 * p, f2: 60, d: 0.1, vol: 0.55 });
    noise(ctx, out, { t, d: 0.06, vol: 0.4, filter: { type: 'lowpass', f: 1600 } });
    click(ctx, out, { t, f: 2200, vol: 0.25 });
    // Wire twang: plucked saw with closing filter & a sag in pitch.
    let end = osc(ctx, out, {
      t: t + 0.02,
      type: 'sawtooth',
      f: 118 * p,
      f2: 98 * p,
      glide: 0.5,
      a: 0.002,
      d: 0.55,
      vol: 0.2,
      vib: { rate: 9, depth: 25 },
      filter: { type: 'lowpass', f: 3800, f2: 300, glide: 0.45, q: 6 },
    });
    end = Math.max(
      end,
      osc(ctx, out, { t: t + 0.02, type: 'triangle', f: 236 * p, f2: 200 * p, d: 0.35, vol: 0.08 })
    );
    return end;
  },

  // ---- Auxiliary systems -----------------------------------------------------------------
  tesla_zap(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    let end = crackle(ctx, out, t, 7, 0.16, 0.42, 1500 * p, 6500 * p);
    // Arc buzz underneath.
    end = Math.max(
      end,
      fm(ctx, out, {
        t,
        f: 120 * p,
        ratio: 2.01,
        index: 9,
        index2: 3,
        d: 0.16,
        vol: 0.13,
        type: 'sawtooth',
        filter: { type: 'highpass', f: 700 },
      })
    );
    return end;
  },

  rocket_launch(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    click(ctx, out, { t, f: 1800, vol: 0.2 });
    thump(ctx, out, { t, f: 160 * p, f2: 60, d: 0.12, vol: 0.35 });
    let end = noise(ctx, out, {
      t: t + 0.01,
      a: 0.03,
      d: 0.5,
      vol: 0.36,
      filter: { type: 'bandpass', f: 500 * p, f2: 3200 * p, glide: 0.4, q: 1.2 },
    });
    end = Math.max(
      end,
      noise(ctx, out, {
        t: t + 0.02,
        color: 'crackle',
        a: 0.02,
        d: 0.45,
        vol: 0.35,
        filter: { type: 'highpass', f: 2500 },
      })
    );
    return end;
  },

  flak_fire(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    thump(ctx, out, { t, f: 240 * p, f2: 90, d: 0.08, vol: 0.5 });
    noise(ctx, out, { t, d: 0.05, vol: 0.4, filter: { type: 'highpass', f: 2200 } });
    return noise(ctx, out, {
      t,
      color: 'pink',
      d: 0.16,
      vol: 0.3,
      filter: { type: 'lowpass', f: 2600, f2: 400 },
    });
  },

  drone_fire(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    click(ctx, out, { t, f: 4200 * p, vol: 0.08, d: 0.008 });
    return osc(ctx, out, {
      t,
      type: 'square',
      f: 1500 * p,
      f2: 620 * p,
      d: 0.06,
      vol: 0.1,
      filter: { type: 'lowpass', f: 3500 },
    });
  },

  mine_drop(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    thump(ctx, out, { t, f: 150 * p, f2: 70, d: 0.14, vol: 0.45 });
    let end = partials(ctx, out, { t, f: 520 * p, ratios: RATIOS.plate, d: 0.25, vol: 0.12 });
    // Chain links rattling out.
    end = Math.max(
      end,
      repeat(4, t + 0.05, 0.035, (i, ti) =>
        click(ctx, out, { t: ti, f: rand(2500, 4200), vol: 0.12 - i * 0.02 })
      , 0.01)
    );
    // Armed: tiny ping.
    return Math.max(end, osc(ctx, out, { t: t + 0.22, f: 2400 * p, d: 0.12, vol: 0.06 }));
  },

  steam_vent(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    thump(ctx, out, { t, f: 110 * p, f2: 50, d: 0.18, vol: 0.3 });
    return hiss(ctx, out, {
      t,
      a: 0.025,
      hold: 0.22,
      d: 0.45,
      vol: 0.34,
      f: 4200 * p,
      f2: 2200 * p,
      whistle: 1750 * p,
      whistle2: 1500 * p,
    });
  },

  broadside_fire(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    const n = 5;
    let end = t;
    for (let i = 0; i < n; i++) {
      const pan = -0.8 + (1.6 * i) / (n - 1);
      const g = panner(ctx, gain(ctx, out, 0.62), pan);
      end = Math.max(end, cannon(ctx, g, t + i * 0.065 + rand(0, 0.015), p * rand(0.92, 1.06)));
    }
    return end;
  },

  saw_hit(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    fm(ctx, out, {
      t,
      f: 1700 * p,
      f2: 1400 * p,
      ratio: 1.47,
      index: 4,
      index2: 1,
      d: 0.14,
      vol: 0.12,
      type: 'sawtooth',
      filter: { type: 'bandpass', f: 3000, q: 1.2 },
    });
    noise(ctx, out, { t, d: 0.11, vol: 0.32, filter: { type: 'bandpass', f: 3600 * p, q: 2.5 } });
    return partials(ctx, out, { t, f: 1300 * p, ratios: RATIOS.tink, d: 0.15, vol: 0.08 });
  },

  // ---- Player ------------------------------------------------------------------------------
  boost(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    thump(ctx, out, { t, f: 95 * p, f2: 45, d: 0.25, vol: 0.4 });
    let end = noise(ctx, out, {
      t,
      color: 'hiss',
      a: 0.03,
      d: 0.5,
      vol: 0.4,
      filter: [
        { type: 'highpass', f: 600 },
        { type: 'bandpass', f: 900 * p, f2: 4200 * p, glide: 0.18, q: 1.1 },
      ],
    });
    // Pipe chirp — the safety valve popping.
    end = Math.max(
      end,
      osc(ctx, out, {
        t: t + 0.02,
        wave: 'whistle',
        f: 1300 * p,
        f2: 2100 * p,
        glide: 0.12,
        a: 0.02,
        d: 0.2,
        vol: 0.07,
      })
    );
    return end;
  },

  bomb_drop(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    // Latch clank.
    partials(ctx, out, { t, f: 330 * p, ratios: RATIOS.plate, d: 0.3, vol: 0.16 });
    click(ctx, out, { t, f: 2000, vol: 0.3 });
    // Falling whistle.
    osc(ctx, out, {
      t: t + 0.08,
      wave: 'whistle',
      f: 2100 * p,
      f2: 620 * p,
      glide: 0.75,
      a: 0.08,
      d: 0.7,
      vol: 0.12,
      vib: { rate: 7, depth: 10 },
    });
    // Big low whump as it detonates beneath the ship.
    const end = thump(ctx, out, { t: t + 0.8, f: 85 * p, f2: 25, d: 0.7, vol: 0.7, glide: 0.4 });
    noise(ctx, out, {
      t: t + 0.8,
      color: 'brown',
      a: 0.02,
      d: 0.8,
      vol: 0.45,
      filter: { type: 'lowpass', f: 600, f2: 90 },
    });
    return end;
  },

  player_hit(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    // Heavy hull clang.
    let end = partials(ctx, out, {
      t,
      f: 170 * p,
      ratios: RATIOS.plate,
      amps: [1, 0.8, 0.7, 0.5, 0.45, 0.3, 0.2],
      d: 0.75,
      vol: 0.32,
      fall: 0.3,
      spread: 12,
    });
    // Crunch: driven noise.
    const dr = drive(ctx, 0.8);
    dr.connect(gain(ctx, out, 0.5));
    noise(ctx, dr, {
      t,
      color: 'crackle',
      d: 0.2,
      vol: 0.9,
      filter: { type: 'lowpass', f: 2800, f2: 500 },
    });
    noise(ctx, out, { t, d: 0.12, vol: 0.32, filter: { type: 'bandpass', f: 1400, q: 0.8 } });
    end = Math.max(end, thump(ctx, out, { t, f: 110 * p, f2: 36, d: 0.3, vol: 0.62 }));
    return end;
  },

  player_low(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    // Heartbeat thumps + double pressure-gauge pip.
    thump(ctx, out, { t, f: 70 * p, f2: 40, d: 0.16, vol: 0.55 });
    thump(ctx, out, { t: t + 0.2, f: 62 * p, f2: 36, d: 0.2, vol: 0.45 });
    osc(ctx, out, { t: t + 0.02, wave: 'whistle', f: 1240 * p, d: 0.09, hold: 0.04, vol: 0.12 });
    return osc(ctx, out, {
      t: t + 0.22,
      wave: 'whistle',
      f: 1240 * p,
      d: 0.12,
      hold: 0.04,
      vol: 0.12,
    });
  },

  shield_block(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    noise(ctx, out, { t, d: 0.03, vol: 0.25, filter: { type: 'highpass', f: 4000 } });
    fm(ctx, out, { t, f: 880 * p, f2: 660 * p, ratio: 3.01, index: 2.5, index2: 0.2, d: 0.35, vol: 0.12 });
    return partials(ctx, out, { t, f: 1180 * p, ratios: RATIOS.bar, d: 0.5, vol: 0.18 });
  },

  revive(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    // Organ swell C major rising into a bright bell.
    let end = t;
    const chord = ['C4', 'G4', 'C5', 'E5', 'G5'];
    chord.forEach((n, i) => {
      end = Math.max(
        end,
        osc(ctx, out, {
          t: t + i * 0.06,
          wave: 'organ',
          f: note(n) * p,
          a: 0.35,
          hold: 0.35,
          d: 0.7,
          vol: 0.06,
          pan: (i - 2) * 0.25,
        })
      );
    });
    hiss(ctx, out, { t, a: 0.3, hold: 0.1, d: 0.4, vol: 0.12, f: 2500, f2: 6000 });
    end = Math.max(
      end,
      partials(ctx, out, { t: t + 0.55, f: note('C6') * p, ratios: RATIOS.bell, d: 1.2, vol: 0.14 })
    );
    return end;
  },

  upgrade_pick(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    click(ctx, out, { t, f: 2600, vol: 0.25 });
    click(ctx, out, { t: t + 0.04, f: 1800, vol: 0.2 });
    let end = t;
    for (const [n, pan] of [['C4', -0.3], ['E4', 0], ['G4', 0.3], ['C5', 0]]) {
      end = Math.max(
        end,
        brass(ctx, out, { t: t + 0.05, f: note(n) * p, a: 0.02, hold: 0.08, d: 0.3, vol: 0.06, pan })
      );
    }
    return Math.max(
      end,
      partials(ctx, out, { t: t + 0.06, f: note('G6') * p, ratios: RATIOS.bar, d: 0.4, vol: 0.06 })
    );
  },

  evolve(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    // Wind-up: rising steam + gears ratcheting, then a triumphant bell + chord.
    hiss(ctx, out, { t, a: 0.6, hold: 0.1, d: 0.3, vol: 0.2, f: 800, f2: 6000, whistle: 900, whistle2: 2200 });
    repeat(10, t, 0.06, (i, ti) => click(ctx, out, { t: ti, f: 1800 + i * 220, vol: 0.12 + i * 0.008 }));
    const arp = ['C5', 'E5', 'G5', 'C6', 'E6', 'G6'];
    arp.forEach((n, i) => {
      partials(ctx, out, { t: t + 0.12 + i * 0.07, f: note(n) * p, ratios: RATIOS.tine, d: 0.4, vol: 0.07 });
    });
    const hit = t + 0.68;
    thump(ctx, out, { t: hit, f: 90 * p, f2: 40, d: 0.4, vol: 0.5 });
    let end = partials(ctx, out, { t: hit, f: note('C5') * p, ratios: RATIOS.bell, d: 1.6, vol: 0.18 });
    for (const [n, pan] of [['C4', -0.4], ['G4', 0.4], ['C5', -0.1], ['E5', 0.15], ['G5', 0]]) {
      end = Math.max(
        end,
        brass(ctx, out, { t: hit, f: note(n) * p, a: 0.04, hold: 0.5, d: 0.6, vol: 0.05, vib: true, pan })
      );
    }
    return end;
  },

  // ---- Impacts -------------------------------------------------------------------------------
  hit(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    noise(ctx, out, { t, d: 0.012, vol: 0.22, filter: { type: 'highpass', f: 4500 } });
    return partials(ctx, out, {
      t,
      f: rand(2100, 2700) * p,
      ratios: RATIOS.tink,
      d: 0.075,
      vol: 0.2,
      fall: 0.6,
    });
  },

  hit_crit(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    noise(ctx, out, { t, d: 0.02, vol: 0.28, filter: { type: 'highpass', f: 3500 } });
    thump(ctx, out, { t, f: 260 * p, f2: 120, d: 0.06, vol: 0.25 });
    partials(ctx, out, { t, f: 2600 * p, ratios: RATIOS.tink, d: 0.12, vol: 0.18 });
    // Bright bell-like ring an octave+fifth up.
    return partials(ctx, out, { t: t + 0.008, f: 3900 * p, ratios: RATIOS.bar, d: 0.32, vol: 0.14 });
  },

  hit_armor(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    noise(ctx, out, { t, d: 0.04, vol: 0.3, filter: { type: 'bandpass', f: 1300 * p, q: 1.5 } });
    thump(ctx, out, { t, f: 220 * p, f2: 110, d: 0.06, vol: 0.25 });
    return partials(ctx, out, {
      t,
      f: rand(480, 560) * p,
      ratios: RATIOS.plate,
      d: 0.14,
      vol: 0.17,
      fall: 0.7,
    });
  },

  explode_small(ctx, out, o) {
    return explosion(ctx, out, o.t, P(o), 0);
  },
  explode_medium(ctx, out, o) {
    return explosion(ctx, out, o.t, P(o), 1);
  },
  explode_large(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    let end = explosion(ctx, out, t, p, 2);
    // Secondary pop, off to one side.
    end = Math.max(end, explosion(ctx, panner(ctx, gain(ctx, out, 0.45), pick([-0.5, 0.5])), t + 0.18, p * 1.2, 0));
    return end;
  },
  explode_huge(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    let end = explosion(ctx, out, t, p, 3);
    // Chain of secondary detonations spreading outward.
    for (let i = 0; i < 3; i++) {
      const g = panner(ctx, gain(ctx, out, 0.42 - i * 0.07), rand(-0.7, 0.7));
      end = Math.max(end, explosion(ctx, g, t + 0.2 + i * rand(0.18, 0.3), p * rand(0.9, 1.3), i === 0 ? 1 : 0));
    }
    // Hull metal groaning apart.
    fm(ctx, out, {
      t: t + 0.3,
      f: 140 * p,
      f2: 70 * p,
      ratio: 1.41,
      index: 3,
      index2: 1,
      a: 0.2,
      d: 1.2,
      vol: 0.1,
      type: 'sawtooth',
      filter: { type: 'lowpass', f: 900 },
    });
    return end;
  },

  mortar_land(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    // Dull crump: low-passed only, no bright crack.
    let end = thump(ctx, out, { t, f: 75 * p, f2: 30, d: 0.4, vol: 0.65, glide: 0.2 });
    end = Math.max(
      end,
      noise(ctx, out, {
        t,
        color: 'pink',
        a: 0.006,
        d: 0.5,
        vol: 0.55,
        filter: { type: 'lowpass', f: 900 * p, f2: 140, glide: 0.4 },
      })
    );
    noise(ctx, out, {
      t: t + 0.05,
      color: 'patter',
      a: 0.02,
      d: 0.45,
      vol: 0.5,
      filter: { type: 'lowpass', f: 2200 },
    });
    return end;
  },

  burn(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    noise(ctx, out, {
      t,
      color: 'brown',
      a: 0.06,
      d: 0.35,
      vol: 0.3,
      filter: { type: 'lowpass', f: 700 * p },
    });
    return noise(ctx, out, {
      t,
      color: 'crackle',
      a: 0.02,
      d: 0.35,
      vol: 0.55,
      filter: { type: 'bandpass', f: 2400 * p, q: 0.8 },
    });
  },

  // ---- Enemy ordnance ----------------------------------------------------------------------
  enemy_shot(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    noise(ctx, out, { t, d: 0.04, vol: 0.3, filter: { type: 'bandpass', f: 1800 * p, q: 1.5 } });
    return osc(ctx, out, {
      t,
      type: 'square',
      f: 720 * p,
      f2: 260 * p,
      d: 0.06,
      vol: 0.08,
      filter: { type: 'lowpass', f: 2200 },
    });
  },

  enemy_cannon(ctx, out, o) {
    return cannon(ctx, out, o.t, P(o) * 0.78, { dark: 1.6, ring: 0.8, size: 1.1 });
  },

  enemy_flak(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    thump(ctx, out, { t, f: 300 * p, f2: 120, d: 0.08, vol: 0.38 });
    return noise(ctx, out, {
      t,
      d: 0.1,
      vol: 0.35,
      filter: { type: 'bandpass', f: 1100 * p, q: 1.2 },
    });
  },

  enemy_zap(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    crackle(ctx, out, t, 4, 0.1, 0.25, 1200, 4000);
    return osc(ctx, out, {
      t,
      type: 'sawtooth',
      f: 1300 * p,
      f2: 280 * p,
      d: 0.16,
      vol: 0.12,
      filter: { type: 'bandpass', f: 1600, q: 2 },
    });
  },

  wasp_charge(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    // Rising angry buzz: saw with fast amplitude flutter.
    const am = ctx.createGain();
    am.gain.value = 0.5;
    am.connect(out);
    const l = ctx.createOscillator();
    l.frequency.setValueAtTime(28, t);
    l.frequency.linearRampToValueAtTime(55, t + 0.55);
    const lg = ctx.createGain();
    lg.gain.value = 0.5;
    l.connect(lg).connect(am.gain);
    l.start(t);
    l.stop(t + 0.65);
    return osc(ctx, am, {
      t,
      type: 'sawtooth',
      f: 85 * p,
      f2: 270 * p,
      glide: 0.5,
      a: 0.12,
      hold: 0.3,
      d: 0.18,
      vol: 0.32,
      filter: { type: 'bandpass', f: 600, f2: 2000, q: 1.5 },
    });
  },

  wraith_phase(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    hiss(ctx, out, { t, a: 0.2, hold: 0.05, d: 0.35, vol: 0.1, f: 3000, f2: 1200 });
    let end = t;
    for (const det of [-14, 0, 13]) {
      end = Math.max(
        end,
        fm(ctx, out, {
          t,
          f: 620 * p * Math.pow(2, det / 1200),
          f2: 310 * p,
          ratio: 0.5,
          index: 1.5,
          index2: 4,
          a: 0.22,
          d: 0.45,
          vol: 0.07,
        })
      );
    }
    return end;
  },

  mortar_whistle(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    noise(ctx, out, {
      t,
      a: 0.2,
      hold: 0.6,
      d: 0.3,
      vol: 0.06,
      filter: { type: 'bandpass', f: 2400 * p, f2: 800 * p, glide: 1.1, q: 6 },
    });
    return osc(ctx, out, {
      t,
      wave: 'whistle',
      f: 2300 * p,
      f2: 700 * p,
      glide: 1.1,
      a: 0.25,
      hold: 0.55,
      d: 0.3,
      vol: 0.14,
      vib: { rate: 8, depth: 12 },
    });
  },

  carrier_launch(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    partials(ctx, out, { t, f: 260 * p, ratios: RATIOS.plate, d: 0.3, vol: 0.14 });
    click(ctx, out, { t, f: 1600, vol: 0.3 });
    hiss(ctx, out, { t: t + 0.03, a: 0.02, hold: 0.05, d: 0.2, vol: 0.2, f: 3500 });
    // Small propeller spinning up.
    const am = gain(ctx, out, 0.5);
    const l = ctx.createOscillator();
    l.frequency.setValueAtTime(12, t);
    l.frequency.exponentialRampToValueAtTime(40, t + 0.6);
    const lg = ctx.createGain();
    lg.gain.value = 0.45;
    l.connect(lg).connect(am.gain);
    l.start(t);
    l.stop(t + 0.75);
    return osc(ctx, am, {
      t: t + 0.05,
      type: 'sawtooth',
      f: 70 * p,
      f2: 160 * p,
      a: 0.15,
      hold: 0.2,
      d: 0.3,
      vol: 0.2,
      filter: { type: 'lowpass', f: 900 },
    });
  },

  tesla_hum(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    const bp = filter(ctx, out, { type: 'bandpass', f: 400, q: 1.2 });
    osc(ctx, bp, { t, type: 'sawtooth', f: 100 * p, a: 0.3, hold: 0.3, d: 0.35, vol: 0.28 });
    osc(ctx, bp, { t, type: 'sawtooth', f: 200.7 * p, a: 0.3, hold: 0.3, d: 0.35, vol: 0.14 });
    return Math.max(t + 0.95, crackle(ctx, out, t + 0.25, 6, 0.6, 0.18, 2000, 7000));
  },
};
