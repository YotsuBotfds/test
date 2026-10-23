// WP7 — interface, pickup and game-flow SFX (brass clicks, typewriter, bells, fanfares, stingers).
// Same contract as sfx-combat.js: (ctx, out, o) => endTime.
import {
  RATIOS, note, rand, osc, noise, partials, fm, thump, brass, click, hiss, repeat, gain, filter,
  drive,
} from './synth.js';

const P = (o) => o.pitch ?? 1;

/** Music-box tine (sine + inharmonic overtone, quick decay). */
function tine(ctx, out, t, f, vol = 0.1, d = 0.6) {
  return partials(ctx, out, {
    t,
    f,
    ratios: RATIOS.tine,
    amps: [1, 0.35, 0.08],
    d,
    fall: 2.5,
    vol,
  });
}

/** Ship's bell strike: inharmonic partials with a long hum tail and a clapper transient. */
function bell(ctx, out, t, f, vol = 0.2, d = 2.6) {
  noise(ctx, out, { t, d: 0.015, vol: vol * 0.8, filter: { type: 'bandpass', f: f * 3, q: 1.5 } });
  return partials(ctx, out, {
    t,
    f,
    ratios: RATIOS.bell,
    amps: [0.55, 1, 0.6, 0.35, 0.5, 0.25, 0.2, 0.15, 0.1],
    d,
    fall: 0.28,
    vol,
    spread: 3,
  });
}

/** Timpani-ish hit for fanfares. */
function timp(ctx, out, t, f, vol = 0.35) {
  noise(ctx, out, { t, d: 0.05, vol: vol * 0.4, filter: { type: 'lowpass', f: 1200 } });
  return osc(ctx, out, { t, f: f * 1.15, f2: f, glide: 0.05, d: 0.6, vol });
}

/** Play a list of [time, noteName, dur, vol?] brass notes. */
function line(ctx, out, t, p, notes, opts = {}) {
  let end = t;
  for (const [dt, n, dur, v] of notes) {
    end = Math.max(
      end,
      brass(ctx, out, {
        t: t + dt,
        f: note(n) * p,
        a: opts.a ?? 0.025,
        hold: Math.max(0.02, dur - 0.08),
        d: opts.d ?? 0.18,
        vol: v ?? opts.vol ?? 0.12,
        bright: opts.bright ?? 5,
        vib: dur > 0.4,
        wave: opts.wave,
        pan: opts.pan,
        bend: opts.bend,
      })
    );
  }
  return end;
}

export const UI = {
  // ---- Interface ---------------------------------------------------------------------------
  ui_move(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    click(ctx, out, { t, f: 3400 * p, vol: 0.16, d: 0.012 });
    return partials(ctx, out, { t, f: 2400 * p, ratios: RATIOS.tink, d: 0.05, vol: 0.05 });
  },

  ui_select(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    // Lever latch: two clicks, then a small brass ding.
    click(ctx, out, { t, f: 2600 * p, vol: 0.22 });
    click(ctx, out, { t: t + 0.035, f: 1700 * p, vol: 0.18 });
    return partials(ctx, out, {
      t: t + 0.04,
      f: note('G6') * p,
      ratios: RATIOS.bar,
      d: 0.45,
      vol: 0.13,
    });
  },

  ui_back(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    click(ctx, out, { t, f: 2200 * p, vol: 0.18 });
    osc(ctx, out, { t: t + 0.02, type: 'triangle', f: 900 * p, f2: 480 * p, d: 0.08, vol: 0.12 });
    return noise(ctx, out, {
      t: t + 0.03,
      d: 0.06,
      vol: 0.12,
      filter: { type: 'lowpass', f: 1200 },
    });
  },

  ui_error(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    // Dissonant reed buzz, twice, plus a dull clank.
    let end = t;
    for (const dt of [0, 0.12]) {
      for (const f of [174, 185]) {
        end = Math.max(
          end,
          osc(ctx, out, {
            t: t + dt,
            wave: 'reed',
            f: f * p,
            a: 0.005,
            hold: 0.05,
            d: 0.06,
            vol: 0.08,
            filter: { type: 'lowpass', f: 1400 },
          })
        );
      }
    }
    partials(ctx, out, { t, f: 330 * p, ratios: RATIOS.plate, d: 0.15, vol: 0.07 });
    return end;
  },

  ui_card(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    // Paper flick + snap onto the table.
    noise(ctx, out, {
      t,
      a: 0.01,
      d: 0.08,
      vol: 0.22,
      filter: { type: 'bandpass', f: 2200 * p, f2: 5200 * p, q: 1.4 },
    });
    return click(ctx, out, { t: t + 0.07, f: 1500 * p, vol: 0.2, q: 1.2 });
  },

  ui_buy(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    // Cash register: key clatter, drawer bell, coins.
    repeat(3, t, 0.04, (i, ti) => click(ctx, out, { t: ti, f: 2800 - i * 300, vol: 0.18 }));
    thump(ctx, out, { t: t + 0.13, f: 160, f2: 70, d: 0.1, vol: 0.25 });
    let end = bell(ctx, out, t + 0.14, note('C7') * p, 0.1, 0.8);
    for (let i = 0; i < 4; i++) {
      end = Math.max(
        end,
        partials(ctx, out, {
          t: t + 0.22 + i * 0.05 + rand(0, 0.02),
          f: rand(2600, 3800),
          ratios: RATIOS.tink,
          d: 0.12,
          vol: 0.06,
        })
      );
    }
    return end;
  },

  ui_unlock(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    // Key turning in a brass lock, latch clack, then a rising music-box triad.
    repeat(4, t, 0.03, (i, ti) => click(ctx, out, { t: ti, f: 3000 + i * 200, vol: 0.1 }));
    click(ctx, out, { t: t + 0.15, f: 1300, vol: 0.3 });
    thump(ctx, out, { t: t + 0.15, f: 200, f2: 90, d: 0.08, vol: 0.25 });
    let end = t;
    ['E6', 'G#6', 'B6', 'E7'].forEach((n, i) => {
      end = Math.max(end, tine(ctx, out, t + 0.25 + i * 0.08, note(n) * p, 0.1, 0.6));
    });
    return end;
  },

  ui_toggle(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    click(ctx, out, { t, f: 3600 * p, vol: 0.16 });
    click(ctx, out, { t: t + 0.028, f: 2000 * p, vol: 0.2 });
    return fm(ctx, out, { t: t + 0.03, f: 700 * p, f2: 500 * p, ratio: 2.7, index: 1.2, d: 0.08, vol: 0.05 });
  },

  /** Extra: a typewriter key (for typed-out captions). */
  ui_type(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    noise(ctx, out, { t, d: 0.02, vol: 0.2, filter: { type: 'bandpass', f: 3400 * p * rand(0.9, 1.1), q: 2 } });
    return thump(ctx, out, { t: t + 0.006, f: 260 * p, f2: 140, d: 0.035, vol: 0.18 });
  },

  /** Extra: typewriter carriage-return bell. */
  ui_ding(ctx, out, o) {
    return bell(ctx, out, o.t, note('A6') * P(o), 0.12, 0.9);
  },

  // ---- Pickups -----------------------------------------------------------------------------
  pickup_xp(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    return partials(ctx, out, {
      t,
      f: 1760 * p,
      ratios: RATIOS.bar,
      amps: [1, 0.25, 0.06, 0],
      d: 0.09,
      vol: 0.13,
      a: 0.002,
    });
  },

  pickup_cog(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    partials(ctx, out, { t, f: 2350 * p, ratios: RATIOS.tink, d: 0.14, vol: 0.13 });
    return partials(ctx, out, { t: t + 0.045, f: 3150 * p, ratios: RATIOS.tink, d: 0.2, vol: 0.12 });
  },

  pickup_repair(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    repeat(3, t, 0.045, (i, ti) => click(ctx, out, { t: ti, f: 2000 + i * 400, vol: 0.18 }));
    let end = t;
    ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => {
      end = Math.max(
        end,
        osc(ctx, out, { t: t + 0.12 + i * 0.06, wave: 'organ', f: note(n) * p, a: 0.02, d: 0.4, vol: 0.06 })
      );
    });
    return end;
  },

  pickup_steam(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    return hiss(ctx, out, {
      t,
      a: 0.02,
      hold: 0.06,
      d: 0.25,
      vol: 0.22,
      f: 2500 * p,
      f2: 5500 * p,
      whistle: 1400 * p,
      whistle2: 2300 * p,
    });
  },

  pickup_bomb(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    thump(ctx, out, { t, f: 130 * p, f2: 60, d: 0.18, vol: 0.45 });
    partials(ctx, out, { t, f: 300 * p, ratios: RATIOS.plate, d: 0.25, vol: 0.12 });
    // Fuse sizzle.
    return noise(ctx, out, {
      t: t + 0.08,
      color: 'crackle',
      a: 0.02,
      hold: 0.15,
      d: 0.2,
      vol: 0.4,
      filter: { type: 'highpass', f: 3000 },
    });
  },

  pickup_crate(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    // Wooden crate thump + latch + sparkle.
    thump(ctx, out, { t, f: 180 * p, f2: 90, d: 0.12, vol: 0.4 });
    noise(ctx, out, { t, d: 0.08, vol: 0.25, filter: { type: 'bandpass', f: 700, q: 2 } });
    click(ctx, out, { t: t + 0.08, f: 2400, vol: 0.2 });
    let end = t;
    ['G6', 'D7', 'G7'].forEach((n, i) => {
      end = Math.max(end, tine(ctx, out, t + 0.14 + i * 0.05, note(n) * p, 0.06, 0.3));
    });
    return end;
  },

  // ---- Progression -------------------------------------------------------------------------
  level_up(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    // Ascending music-box arpeggio (C major add9), soft pad underneath.
    const arp = ['C6', 'E6', 'G6', 'D7', 'E7', 'G7', 'C8'];
    let end = t;
    arp.forEach((n, i) => {
      end = Math.max(end, tine(ctx, out, t + i * 0.065, note(n) * p, 0.11 - i * 0.005, 0.7));
    });
    end = Math.max(
      end,
      osc(ctx, out, { t, wave: 'organ', f: note('C5') * p, a: 0.1, hold: 0.3, d: 0.5, vol: 0.05 })
    );
    osc(ctx, out, { t, wave: 'organ', f: note('G4') * p, a: 0.1, hold: 0.3, d: 0.5, vol: 0.04 });
    return end;
  },

  achievement(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    let end = t;
    ['C6', 'G6', 'E7', 'C7'].forEach((n, i) => {
      end = Math.max(
        end,
        partials(ctx, out, { t: t + i * 0.09, f: note(n) * p, ratios: RATIOS.bar, d: 0.9, vol: 0.12 })
      );
    });
    hiss(ctx, out, { t, a: 0.05, d: 0.4, hold: 0, vol: 0.05, f: 8000, hp: 5000 });
    return end;
  },

  // ---- Flow --------------------------------------------------------------------------------
  wave_start(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    // Ship's bell struck twice ("two bells").
    bell(ctx, out, t, note('E5') * p, 0.2, 2.4);
    return bell(ctx, out, t + 0.42, note('E5') * p * 1.002, 0.18, 2.6);
  },

  wave_clear(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    timp(ctx, out, t + 0.33, note('C3') * p, 0.25);
    const a = line(ctx, out, t, p, [
      [0, 'G4', 0.09],
      [0.1, 'C5', 0.09],
      [0.2, 'E5', 0.09],
      [0.32, 'G5', 0.55, 0.13],
    ]);
    const b = line(ctx, out, t, p, [[0.32, 'C5', 0.55, 0.08], [0.32, 'E4', 0.55, 0.07]], {
      bright: 3.5,
    });
    return Math.max(a, b);
  },

  boss_warning(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    // Klaxon "awooga" alternating with a steam whistle shriek, ~3 s.
    let end = t;
    for (let i = 0; i < 6; i++) {
      const ti = t + i * 0.5;
      if (i % 2 === 0) {
        for (const det of [-8, 9]) {
          osc(ctx, out, {
            t: ti,
            wave: 'reed',
            f: 210 * p,
            f2: 330 * p,
            glide: 0.3,
            a: 0.03,
            hold: 0.28,
            d: 0.12,
            vol: 0.1,
            detune: det,
            filter: { type: 'lowpass', f: 2200, q: 2 },
          });
        }
        end = ti + 0.45;
      } else {
        end = Math.max(
          end,
          hiss(ctx, out, {
            t: ti,
            a: 0.04,
            hold: 0.3,
            d: 0.12,
            vol: 0.14,
            f: 3000,
            hp: 2000,
            whistle: 1180 * p,
            whistle2: 1120 * p,
          })
        );
        osc(ctx, out, {
          t: ti,
          wave: 'whistle',
          f: 1180 * p * 1.5,
          f2: 1120 * p * 1.5,
          a: 0.05,
          hold: 0.3,
          d: 0.12,
          vol: 0.07,
          vib: { rate: 6, depth: 15 },
        });
      }
    }
    return end;
  },

  boss_roar(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    // Low detuned saws diving in pitch through a driven low-pass.
    const dr = drive(ctx, 0.4);
    const lp = filter(ctx, gain(ctx, out, 0.55), { type: 'lowpass', f: 900, f2: 260, glide: 1.6, q: 3, t });
    dr.connect(lp);
    let end = t;
    for (const det of [-22, 0, 17, 1203]) {
      end = Math.max(
        end,
        osc(ctx, dr, {
          t,
          type: 'sawtooth',
          f: 82 * p,
          f2: 34 * p,
          glide: 1.6,
          a: 0.12,
          hold: 0.7,
          d: 0.9,
          vol: det > 1000 ? 0.12 : 0.22,
          detune: det,
          vib: { rate: 7, depth: 30, delay: 0.3 },
        })
      );
    }
    // Metallic groan (FM, slow index swell).
    fm(ctx, out, {
      t: t + 0.1,
      f: 160 * p,
      f2: 95 * p,
      ratio: 1.414,
      index: 1,
      index2: 6,
      a: 0.3,
      hold: 0.5,
      d: 0.8,
      vol: 0.08,
      filter: { type: 'bandpass', f: 500, q: 1 },
    });
    noise(ctx, out, {
      t,
      color: 'brown',
      a: 0.1,
      hold: 0.6,
      d: 0.9,
      vol: 0.4,
      filter: { type: 'lowpass', f: 300 },
    });
    return end;
  },

  boss_phase(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    // Gear shift: heavy clank, steam blast, dissonant low brass stab.
    partials(ctx, out, { t, f: 140 * p, ratios: RATIOS.plate, d: 0.7, vol: 0.25, spread: 10 });
    thump(ctx, out, { t, f: 100 * p, f2: 35, d: 0.4, vol: 0.6 });
    hiss(ctx, out, { t: t + 0.08, a: 0.02, hold: 0.25, d: 0.4, vol: 0.28, f: 3000, f2: 1800 });
    let end = t;
    for (const n of ['C2', 'F#2', 'C3']) {
      end = Math.max(
        end,
        brass(ctx, out, { t: t + 0.05, f: note(n) * p, a: 0.04, hold: 0.45, d: 0.5, vol: 0.09, bright: 3 })
      );
    }
    return end;
  },

  boss_death(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    // Huge blast, a long metal groan down, then a funeral bell toll.
    thump(ctx, out, { t, f: 60 * p, f2: 20, d: 1.4, vol: 0.7, glide: 0.8 });
    noise(ctx, out, { t, d: 0.05, vol: 0.32, filter: { type: 'highpass', f: 1000 } });
    noise(ctx, out, {
      t,
      color: 'pink',
      d: 1.4,
      vol: 0.5,
      filter: { type: 'lowpass', f: 3800, f2: 120, glide: 1.0 },
    });
    noise(ctx, out, {
      t: t + 0.05,
      color: 'brown',
      a: 0.08,
      d: 2.4,
      vol: 0.45,
      filter: { type: 'lowpass', f: 400, f2: 70, glide: 2 },
    });
    noise(ctx, out, { t: t + 0.05, color: 'crackle', a: 0.05, d: 1.6, vol: 0.5, filter: { type: 'bandpass', f: 2000, q: 0.7 } });
    fm(ctx, out, {
      t: t + 0.2,
      f: 120 * p,
      f2: 40 * p,
      ratio: 1.41,
      index: 4,
      index2: 0.5,
      a: 0.2,
      hold: 0.3,
      d: 1.6,
      vol: 0.1,
      type: 'sawtooth',
      filter: { type: 'lowpass', f: 1000 },
    });
    return bell(ctx, out, t + 0.9, note('A3') * p, 0.2, 2.8);
  },

  stage_clear(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    timp(ctx, out, t, note('G2') * p, 0.3);
    timp(ctx, out, t + 0.48, note('C3') * p, 0.35);
    line(ctx, out, t, p, [
      [0, 'G4', 0.12],
      [0.16, 'G4', 0.12],
      [0.32, 'G4', 0.12],
      [0.48, 'C5', 0.9, 0.14],
    ]);
    line(ctx, out, t, p, [[0.48, 'E4', 0.9, 0.08], [0.48, 'G4', 0.9, 0.08], [0.48, 'C4', 0.9, 0.07]], {
      bright: 3.5,
    });
    return bell(ctx, out, t + 0.5, note('C6') * p, 0.1, 1.4);
  },

  game_over(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    // Descending tuba: wah-wah-wah-waaah.
    const notes = [
      [0, 'G2', 0.32],
      [0.42, 'F#2', 0.32],
      [0.84, 'F2', 0.32],
      [1.26, 'E2', 1.1],
    ];
    let end = t;
    for (const [dt, n, dur] of notes) {
      end = Math.max(
        end,
        brass(ctx, out, {
          t: t + dt,
          f: note(n) * p,
          wave: 'tuba',
          a: 0.06,
          hold: dur - 0.1,
          d: 0.25,
          vol: 0.3,
          bright: 3,
          vib: dur > 0.5,
          bend: 0.6,
        })
      );
    }
    return end;
  },

  victory(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    // Brass fanfare: triplet pickup, then a big C major chord with timpani roll.
    const b = 0.13;
    line(ctx, out, t, p, [
      [0, 'C5', b * 0.9],
      [b, 'C5', b * 0.9],
      [b * 2, 'C5', b * 0.9],
      [b * 3, 'G5', b * 2.8, 0.14],
      [b * 6, 'E5', b * 0.9],
      [b * 7, 'G5', b * 0.9],
      [b * 8, 'C6', 1.1, 0.14],
    ]);
    line(ctx, out, t, p, [
      [0, 'E4', b * 0.9, 0.07],
      [b, 'E4', b * 0.9, 0.07],
      [b * 2, 'E4', b * 0.9, 0.07],
      [b * 3, 'B4', b * 2.8, 0.07],
      [b * 8, 'G4', 1.1, 0.08],
      [b * 8, 'E5', 1.1, 0.07],
      [b * 8, 'C4', 1.1, 0.08],
    ], { bright: 3.5 });
    timp(ctx, out, t + b * 3, note('G2') * p, 0.28);
    repeat(6, t + b * 7, 0.035, (i, ti) => timp(ctx, out, ti, note('C3') * p, 0.12 + i * 0.03));
    return bell(ctx, out, t + b * 8, note('C6') * p, 0.1, 1.2);
  },

  thunder(ctx, out, o) {
    const t = o.t;
    const p = P(o);
    const near = o.near ?? Math.random() < 0.4;
    if (near) {
      noise(ctx, out, { t, d: 0.12, vol: 0.32, filter: { type: 'highpass', f: 1500 } });
      noise(ctx, out, { t: t + 0.06, color: 'crackle', d: 0.4, vol: 0.5, filter: { type: 'highpass', f: 900 } });
    }
    // Rolling rumble: several overlapping low-passed swells.
    let end = t;
    for (let i = 0; i < 4; i++) {
      const ti = t + (near ? 0.05 : 0.2) + i * rand(0.25, 0.55);
      end = Math.max(
        end,
        noise(ctx, out, {
          t: ti,
          color: 'brown',
          a: rand(0.05, 0.25),
          hold: rand(0.1, 0.4),
          d: rand(0.8, 1.6),
          vol: (0.45 - i * 0.06) * (near ? 1 : 0.8),
          filter: { type: 'lowpass', f: rand(250, 550) * p, f2: 90, glide: 1.5 },
        })
      );
    }
    return end;
  },
};
