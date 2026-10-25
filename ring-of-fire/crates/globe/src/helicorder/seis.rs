//! Synthetic seismograms: what the vertical seismometer at one station would have
//! recorded from every quake in the catalogue.
//!
//! Each quake sends a handful of wave packets to the station (P, PP, the depth
//! phase pP, S, and the Rayleigh wave on its first four passes round the Earth,
//! R1 to R4). A packet is an analytic envelope (sharp onset, a plateau as long as
//! the rupture, an exponential coda) times a band-limited carrier (a few
//! partials whose phases wander slowly, which reads and sounds like filtered
//! noise rather than a tone). Nothing is sampled ahead of time: the drum asks for
//! envelopes where it is zoomed out and for samples where it is zoomed in, and
//! the audio asks for samples, all from the same formulas.

use super::travel::{distance_azimuth, tables, Arrival, Branch, Wave, KM_PER_DEG};
use crate::data::world;
use crate::gfx::hash;

pub struct Station {
    pub code: &'static str,
    pub lat: f64,
    pub lon: f64,
    /// Typical microseism level, in line spacings (rms).
    pub noise: f32,
    pub south: bool,
}

/// IRIS/USGS Global Seismographic Network (IU) stations, coordinates from FDSN station metadata.
pub const STATIONS: [Station; 5] = [
    Station { code: "ANMO", lat: 34.9459, lon: -106.4572, noise: 0.026, south: false },
    Station { code: "KONO", lat: 59.6491, lon: 9.5982, noise: 0.040, south: false },
    Station { code: "CTAO", lat: -20.0882, lon: 146.2545, noise: 0.030, south: true },
    Station { code: "COLA", lat: 64.8736, lon: -147.8616, noise: 0.035, south: false },
    Station { code: "HRV", lat: 42.5064, lon: -71.5583, noise: 0.038, south: false },
];

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum Kind {
    P = 0,
    PP = 1,
    DepthP = 2,
    S = 3,
    R1 = 4,
    R2 = 5,
    R3 = 6,
    R4 = 7,
}

/// Body-wave partials (relative frequency, weight) and Rayleigh-wave partials.
const BODY: [(f32, f32); 4] = [(1.0, 0.52), (1.37, 0.36), (0.71, 0.34), (1.83, 0.2)];
const SURF: [(f32, f32); 2] = [(1.0, 0.86), (2.03, 0.18)];

#[derive(Clone, Copy, Debug)]
pub struct Packet {
    /// Onset, seconds since the catalogue epoch.
    pub on: f64,
    /// Peak amplitude, in line spacings of the drum.
    pub amp: f32,
    /// Onset time constant, seconds.
    pub rise: f32,
    /// Seconds at full strength: the rupture duration, plus the dispersed train.
    pub hold: f32,
    /// Coda e-folding time, seconds.
    pub decay: f32,
    /// Seconds until the packet falls below the cut-off.
    pub len: f32,
    /// Where the envelope peaks: the end of the plateau, or a little later when the
    /// onset is slow, at rise·ln(1 + decay/rise).
    pub xpk: f32,
    /// Relative strength at onset, growing linearly to 1 over `chirp` seconds.
    pub g0: f32,
    /// Carrier frequency sweeps from f0 to f1 (Hz) over `chirp` seconds.
    pub f0: f32,
    pub f1: f32,
    pub chirp: f32,
    /// Phase wander of the partials, radians.
    pub jit: f32,
    pub seed: u32,
    /// Stereo position from the back-azimuth: -1 west (left) .. 1 east (right).
    pub pan: f32,
    pub kind: Kind,
}

/// Floor by truncating cast (a libm call is slow on baseline x86-64); |x| < 2^31.
#[inline]
pub fn ffloor(x: f32) -> f32 {
    let i = x as i32 as f32;
    if i > x {
        i - 1.0
    } else {
        i
    }
}

#[inline]
pub fn ffloor64(x: f64) -> f64 {
    let i = x as i64 as f64;
    if i > x {
        i - 1.0
    } else {
        i
    }
}

/// sin(2π u) for u in cycles; a folded odd polynomial, |error| < 2e-4.
#[inline]
pub fn sin_turns(u: f32) -> f32 {
    let mut r = u - (u as i32 as f32);
    if r > 0.5 {
        r -= 1.0;
    } else if r < -0.5 {
        r += 1.0;
    }
    if r > 0.25 {
        r = 0.5 - r;
    } else if r < -0.25 {
        r = -0.5 - r;
    }
    let x = r * std::f32::consts::TAU;
    let x2 = x * x;
    x * (1.0 - x2 * (1.0 / 6.0 - x2 * (1.0 / 120.0 - x2 / 5040.0)))
}

/// Smooth value noise in [-1, 1] along one axis.
#[inline]
pub fn vnoise(x: f32, seed: u32) -> f32 {
    let i = ffloor(x);
    let f = x - i;
    let i = i as i32 as u32;
    let a = hash(i.wrapping_mul(0x9e37_79b9) ^ seed);
    let b = hash(i.wrapping_add(1).wrapping_mul(0x9e37_79b9) ^ seed);
    let s = f * f * (3.0 - 2.0 * f);
    2.0 * (a + (b - a) * s) - 1.0
}

/// Value noise for large coordinates (absolute times), split in f64 first.
#[inline]
pub fn vnoise64(x: f64, seed: u32) -> f32 {
    let i = ffloor64(x);
    let f = (x - i) as f32;
    let i = i as i64 as u32;
    let a = hash(i.wrapping_mul(0x9e37_79b9) ^ seed);
    let b = hash(i.wrapping_add(1).wrapping_mul(0x9e37_79b9) ^ seed);
    let s = f * f * (3.0 - 2.0 * f);
    2.0 * (a + (b - a) * s) - 1.0
}

impl Packet {
    pub fn surface(&self) -> bool {
        self.kind as u8 >= Kind::R1 as u8
    }

    /// Envelope (0..1) at `x` seconds after onset.
    #[inline]
    pub fn env(&self, x: f32) -> f32 {
        if !(0.0..=self.len).contains(&x) {
            return 0.0;
        }
        let a = 1.0 - (-x / self.rise).exp();
        let g = if self.g0 < 1.0 { self.g0 + (1.0 - self.g0) * (x / self.chirp).min(1.0) } else { 1.0 };
        let d = if x > self.hold { (-(x - self.hold) / self.decay).exp() } else { 1.0 };
        a * g * d
    }

    /// Largest envelope value over [xa, xb]: it rises to `xpk`, then decays.
    #[inline]
    pub fn env_max(&self, xa: f32, xb: f32) -> f32 {
        let (xa, xb) = (xa.max(0.0), xb.min(self.len));
        if xa > xb {
            return 0.0;
        }
        self.env(self.xpk.clamp(xa, xb))
    }

    #[inline]
    pub fn freq(&self, x: f32) -> f32 {
        if self.chirp > 0.0 {
            self.f0 + (self.f1 - self.f0) * (x / self.chirp).clamp(0.0, 1.0)
        } else {
            self.f0
        }
    }

    /// Carrier phase in cycles: the integral of `freq`.
    #[inline]
    pub fn cycles(&self, x: f32) -> f32 {
        if self.chirp > 0.0 {
            let k = (self.f1 - self.f0) / self.chirp;
            if x < self.chirp {
                x * (self.f0 + 0.5 * k * x)
            } else {
                self.chirp * (self.f0 + 0.5 * k * self.chirp) + self.f1 * (x - self.chirp)
            }
        } else {
            self.f0 * x
        }
    }

    pub fn partials(&self) -> &'static [(f32, f32)] {
        if self.surface() {
            &SURF
        } else {
            &BODY
        }
    }

    /// Per-partial phase offsets (cycles) at `x`: the fixed phase plus the slow wander.
    #[inline]
    pub fn offsets(&self, x: f32, out: &mut [f32; 4]) {
        let r = x * self.f0 * 0.5;
        for (k, o) in out.iter_mut().enumerate().take(self.partials().len()) {
            let sk = self.seed.wrapping_add(k as u32 * 0x632b_e5ab);
            *o = hash(sk) + self.jit * (1.0 / std::f32::consts::TAU) * vnoise(r + k as f32 * 31.7, sk);
        }
    }

    /// Carrier at `x`, roughly unit peak.
    #[inline]
    pub fn carrier(&self, x: f32) -> f32 {
        let c = self.cycles(x);
        let r = x * self.f0 * 0.5;
        let mut s = 0.0;
        for (k, &(m, w)) in self.partials().iter().enumerate() {
            let sk = self.seed.wrapping_add(k as u32 * 0x632b_e5ab);
            let ph = hash(sk) + self.jit * (1.0 / std::f32::consts::TAU) * vnoise(r + k as f32 * 31.7, sk);
            s += w * sin_turns(m * c + ph);
        }
        s
    }

    #[inline]
    pub fn sample(&self, x: f32) -> f32 {
        let e = self.env(x);
        if e == 0.0 {
            return 0.0;
        }
        self.amp * e * self.carrier(x)
    }
}

/// Background noise: the ocean microseism (a band near 6.5 s period, swelling with
/// storms and the season), the weaker 14 s primary microseism, and a little
/// high-frequency hiss.
pub struct Noise {
    pub base: f32,
    south: bool,
    seed: u32,
    f: [f64; 5],
    ph: [f32; 5],
    /// Day of year at the epoch.
    doy0: f64,
}

const MICRO: [(f64, f32); 5] = [(0.80, 0.35), (0.91, 0.55), (1.0, 0.60), (1.10, 0.50), (1.24, 0.30)];
/// rms of the partial sum above, so `sample` comes out at unit rms.
const MICRO_RMS: f32 = 0.75;
pub const MICRO_HZ: f64 = 0.155;
pub const PRIMARY_HZ: f64 = 0.068;
/// High-frequency hiss, relative to the microseism base level.
pub const HISS: f32 = 0.16;

impl Noise {
    pub fn new(station: usize, epoch: u32) -> Self {
        let st = &STATIONS[station];
        let seed = hash(0x51ed_0000 + station as u32 * 7919).to_bits();
        let mut f = [0.0; 5];
        let mut ph = [0.0; 5];
        for k in 0..5 {
            f[k] = MICRO_HZ * MICRO[k].0 * (1.0 + 0.03 * (hash(seed ^ (k as u32 + 1)) as f64 - 0.5));
            ph[k] = hash(seed.wrapping_add(k as u32 * 977));
        }
        let days = (epoch / 86400) as i64;
        let (y, _, _) = civil_from_days(days);
        let doy0 = (days - days_from_civil(y, 1, 1)) as f64;
        Noise { base: st.noise, south: st.south, seed, f, ph, doy0 }
    }

    /// rms microseism level at `t`, line spacings.
    #[inline]
    pub fn amp(&self, t: f64) -> f32 {
        let doy = (self.doy0 + t / 86400.0).rem_euclid(365.2422);
        let peak = if self.south { 191.0 } else { 10.0 };
        let season = 1.0 + 0.38 * ((doy - peak) / 365.2422 * std::f64::consts::TAU).cos() as f32;
        let storm = (0.55 * vnoise64(t / (1.6 * 86400.0), self.seed) + 0.25 * vnoise64(t / 25_000.0, self.seed ^ 0xabc)).exp();
        self.base * season * storm
    }

    /// The microseism band (unit rms; multiply by `amp`).
    #[inline]
    pub fn micro(&self, t: f64) -> f32 {
        let mut s = 0.0;
        let r = t * 0.04;
        for (k, &(_, w)) in MICRO.iter().enumerate() {
            let u = self.f[k] * t;
            let c = (u - u as i64 as f64) as f32;
            let j = vnoise64(r + k as f64 * 17.3, self.seed.wrapping_add(k as u32)) * 0.36;
            s += w * sin_turns(c + self.ph[k] + j);
        }
        s * (1.0 / MICRO_RMS)
    }

    /// The primary microseism (unit rms; multiply by `amp`, it is weaker).
    #[inline]
    pub fn primary(&self, t: f64) -> f32 {
        let u = PRIMARY_HZ * t;
        let c = (u - u as i64 as f64) as f32;
        let j = vnoise64(t * 0.02, self.seed ^ 0x77) * 0.3;
        std::f32::consts::SQRT_2 * sin_turns(c + j)
    }

    /// `gm`·micro + `gp`·0.3·primary at t0, t0 + ds, ... The phase of each partial
    /// is evaluated exactly every `B` samples and advanced by rotation in between
    /// (its wander is smooth over far longer than a block), which is several
    /// times cheaper than evaluating `micro` per sample.
    pub fn fill(&self, t0: f64, ds: f64, gm: f32, gp: f32, out: &mut [f32]) {
        const B: usize = 32;
        let n = out.len();
        out.fill(0.0);
        // Phase of partial k (5 = primary) at time t, in cycles: the steady part
        // (fraction of f·t plus a fixed offset) and the slow wander, kept apart so
        // a block's advance is known exactly rather than modulo one cycle.
        let phase = |k: usize, t: f64| -> (f32, f32) {
            if k < 5 {
                let u = self.f[k] * t;
                ((u - u as i64 as f64) as f32 + self.ph[k], vnoise64(t * 0.04 + k as f64 * 17.3, self.seed.wrapping_add(k as u32)) * 0.36)
            } else {
                let u = PRIMARY_HZ * t;
                ((u - u as i64 as f64) as f32, vnoise64(t * 0.02, self.seed ^ 0x77) * 0.3)
            }
        };
        let gains: [f32; 6] = [0, 1, 2, 3, 4, 5].map(|k| if k < 5 { gm * MICRO[k].1 / MICRO_RMS } else { gp * 0.3 * std::f32::consts::SQRT_2 });
        for (k, &g) in gains.iter().enumerate() {
            if g == 0.0 {
                continue;
            }
            let fk = if k < 5 { self.f[k] } else { PRIMARY_HZ };
            let mut p0 = phase(k, t0);
            let mut b0 = 0;
            while b0 < n {
                let b1 = (b0 + B).min(n);
                let p1 = phase(k, t0 + b1 as f64 * ds);
                // Steady advance (exact, fractional part only matters) plus the wander.
                let adv = fk * ds * (b1 - b0) as f64;
                let d = (adv - adv as i64 as f64) as f32 + (p1.1 - p0.1);
                let step = d / (b1 - b0) as f32;
                let ph = p0.0 + p0.1;
                if fk * ds > 0.45 {
                    // Faster than the audio band anyway: evaluate exactly.
                    for (i, o) in out.iter_mut().enumerate().take(b1).skip(b0) {
                        let q = phase(k, t0 + i as f64 * ds);
                        *o += g * sin_turns(q.0 + q.1);
                    }
                } else {
                    let (mut s, mut c) = (sin_turns(ph), sin_turns(ph + 0.25));
                    let (ss, cs) = (sin_turns(step), sin_turns(step + 0.25));
                    for o in &mut out[b0..b1] {
                        *o += g * s;
                        let ns = s * cs + c * ss;
                        c = c * cs - s * ss;
                        s = ns;
                    }
                }
                p0 = p1;
                b0 = b1;
            }
        }
    }

    /// White hiss sample (unit rms) for audio, from a sample index.
    #[inline]
    pub fn hiss(&self, i: u64, ch: u32) -> f32 {
        let h = hash((i as u32) ^ (((i >> 32) as u32).wrapping_mul(0x85eb_ca6b)) ^ self.seed ^ ch.wrapping_mul(0x27d4_eb2f));
        (h - 0.5) * 3.464
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Event {
    /// Index into the catalogue.
    pub q: u32,
    pub t0: f64,
    pub dist: f32,
    pub baz: f32,
    pub depth: f32,
    pub mag: f32,
    /// Largest packet amplitude, line spacings, and when that packet peaks.
    pub peak: f32,
    pub peak_t: f64,
    /// After this the record is back to background.
    pub end: f64,
    pub first: u32,
    pub count: u8,
    /// Arrivals after the origin, seconds (NaN when the wave is missing).
    pub t_p: f32,
    pub t_pp: f32,
    pub t_s: f32,
    pub t_r: f32,
    pub t_r2: f32,
    pub p_branch: Branch,
    pub s_branch: Branch,
    /// Seconds the pen spends past its stops (at full magnification).
    pub clip_s: f32,
}

/// Events that last longer than this are tracked separately for window queries.
const SHORT: f64 = 4.0 * 3600.0;

pub struct Seis {
    pub station: usize,
    pub noise: Noise,
    pub events: Vec<Event>,
    pub packets: Vec<Packet>,
    long: Vec<u32>,
    /// Per catalogue day: the largest packet amplitude that peaked that day.
    pub day_peak: Vec<f32>,
}

/// Total length covered by a set of intervals (overlaps counted once).
fn union_len(v: &mut [(f64, f64)]) -> f64 {
    v.sort_by(|a, b| a.0.total_cmp(&b.0));
    let (mut total, mut cur) = (0.0, None::<(f64, f64)>);
    for &(a, b) in v.iter() {
        cur = match cur {
            Some((ca, cb)) if a <= cb => Some((ca, cb.max(b))),
            Some((ca, cb)) => {
                total += cb - ca;
                Some((a, b))
            }
            None => Some((a, b)),
        };
    }
    total + cur.map_or(0.0, |(a, b)| b - a)
}

/// Rupture duration, seconds: about 5.5 s at M6, ×√10 per magnitude unit.
pub fn rupture_s(mag: f32) -> f32 {
    5.5 * 10f32.powf(0.5 * (mag - 6.0))
}

/// The pen's stops, in line spacings (the drum draws with the same value).
pub const CLIP_LINES: f32 = 2.6;

/// Gains: peak amplitude, in line spacings, at magnitude 6 and 60 degrees.
pub const GAIN_P: f32 = 0.9;
pub const GAIN_S: f32 = 1.2;
pub const GAIN_R: f32 = 1.8;
/// Packets are followed until they fade to this fraction of the station's noise
/// (and dropped if they never reach it): below it they vanish into the background
/// on the drum and under it in the sound.
const CUTOFF: f32 = 0.4;

/// P amplitude relative to 60 degrees, along the direct branch.
fn p_law(d: f32) -> f32 {
    let d = d.max(1.0);
    if d >= 20.0 {
        (d / 60.0).powf(-1.5)
    } else {
        (20.0f32 / 60.0).powf(-1.5) * (d / 20.0).powf(-1.8)
    }
}

fn body_law(a: &Arrival, d: f32, core_gain: f32) -> f32 {
    match a.branch {
        Branch::Direct => p_law(d),
        Branch::Diffracted => p_law(98.0) * 10f32.powf(-(d - 98.0).max(0.0) / 22.0),
        Branch::Core => core_gain * p_law(98.0) * (1.0 + 2.5 * (-((d - 145.0) / 3.5).powi(2)).exp()),
        Branch::None => 0.0,
    }
}

/// Surface-wave amplitude along a path of `deg` degrees, relative to 60 degrees: the
/// Prague formula (amplitude ∝ Δ^-1.66), as used for the surface-wave magnitude.
fn r_law(deg: f32) -> f32 {
    (deg.max(2.5) / 60.0).powf(-1.66)
}

pub struct Source {
    pub t0: f64,
    pub lat: f64,
    pub lon: f64,
    pub depth: f32,
    pub mag: f32,
    pub q: u32,
}

impl Seis {
    pub fn new(station: usize) -> Self {
        let w = world();
        let sources: Vec<Source> = w
            .quakes
            .iter()
            .enumerate()
            .map(|(i, q)| Source { t0: q.t as f64, lat: q.lat as f64, lon: q.lon as f64, depth: q.depth, mag: q.mag, q: i as u32 })
            .collect();
        let days = w.quakes.last().map_or(1, |q| q.t as usize / 86400 + 1);
        Self::from_sources(station, &sources, days)
    }

    /// A record of one hypothetical quake `dist` degrees away, for the legend.
    pub fn reference(station: usize, dist: f64, mag: f32, depth: f32) -> Self {
        let st = &STATIONS[station];
        // Walk `dist` degrees due north (or south) of the station.
        let lat = if st.lat + dist <= 89.0 { st.lat + dist } else { st.lat - dist };
        let src = Source { t0: 120.0, lat, lon: st.lon, depth, mag, q: u32::MAX };
        Self::from_sources(station, &[src], 1)
    }

    pub fn from_sources(station: usize, sources: &[Source], days: usize) -> Self {
        let st = &STATIONS[station];
        let noise = Noise::new(station, world().epoch);
        let tt = tables();
        let cut = CUTOFF * noise.base;
        let mut events = Vec::with_capacity(sources.len());
        let mut packets = Vec::with_capacity(sources.len() * 6);
        let mut long = Vec::new();
        let mut day_peak = vec![0.0f32; days.max(1)];
        for src in sources {
            let (dist, back_az) = distance_azimuth(st.lat, st.lon, src.lat, src.lon);
            let (d, h, m) = (dist as f32, src.depth.max(0.0), src.mag);
            let dur = rupture_s(m);
            // Body waves saturate above magnitude 6, 20 s surface waves above 7.5.
            let mb = if m < 6.0 { m } else { 6.0 + 0.6 * (m - 6.0) };
            let ms = if m < 7.5 { m } else { 7.5 + 0.6 * (m - 7.5) };
            let near = (-d / 5.0).exp();
            let soften = 1.0 / (1.0 + 0.12 * (m - 5.0).max(0.0));
            let pan = (back_az.to_radians().sin() as f32) * 0.85;
            let seed0 = hash(src.q.wrapping_mul(0x2c1b_3c6d) ^ (station as u32 * 0x297a_2d39)).to_bits();
            let first = packets.len() as u32;
            let mut push = |kind: Kind, on_rel: f32, amp: f32, rise: f32, hold: f32, decay: f32, f: (f32, f32, f32), g0: f32, jit: f32| {
                if amp.is_nan() || amp <= cut || !on_rel.is_finite() {
                    return;
                }
                let len = hold + decay * (amp / cut).ln() + 4.0 * rise;
                packets.push(Packet {
                    on: src.t0 + on_rel as f64,
                    amp,
                    rise,
                    hold,
                    decay,
                    len,
                    xpk: hold.max(rise * (1.0 + decay / rise).ln()),
                    g0,
                    f0: f.0,
                    f1: f.1,
                    chirp: f.2,
                    jit,
                    seed: seed0 ^ hash(kind as u32 + 1).to_bits(),
                    pan,
                    kind,
                });
            };

            let ap = tt.first(Wave::P, d, h);
            let asw = tt.first(Wave::S, d, h);
            let fp = 1.0 * (1.0 + 2.0 * near) * soften;
            let fs = 0.2 * (1.0 + 2.5 * near) * soften;
            let body = GAIN_P * 10f32.powf(mb - 6.0);
            let a_p = body * body_law(&ap, d, 0.45);
            let p_decay = 10.0 + 2.2 * dur + 0.08 * d;
            push(Kind::P, ap.t, a_p, 0.12 + 0.12 * dur, dur, p_decay, (fp, fp, 0.0), 1.0, 3.0);
            // Depth phase: the P wave that first went up and bounced off the surface.
            if h > 45.0 && ap.depth_delay > 1.0 {
                push(Kind::DepthP, ap.t + ap.depth_delay, 0.6 * a_p, 0.12 + 0.12 * dur, dur, p_decay, (fp, fp, 0.0), 1.0, 3.0);
            }
            // PP: P reflected once off the surface half way; strong beyond the shadow zone.
            let mut t_pp = f32::NAN;
            if d >= 30.0 {
                let half = tt.first(Wave::P, d / 2.0, h).t + tt.first(Wave::P, d / 2.0, 0.0).t;
                t_pp = half;
                push(Kind::PP, half, 0.5 * body * p_law(d.min(98.0)), 0.3 + 0.15 * dur, dur, p_decay * 1.2, (fp * 0.8, fp * 0.8, 0.0), 1.0, 3.0);
            }
            let a_s = GAIN_S * 10f32.powf(mb - 6.0) * body_law(&asw, d, 0.35);
            push(Kind::S, asw.t, a_s, 0.5 + 0.2 * dur, dur, 25.0 + 3.0 * dur + 0.1 * d, (fs, fs, 0.0), 1.0, 3.0);

            // Rayleigh waves, R1..R4: the short way round, the long way, and again.
            // Shallow sources excite 20 s Rayleigh waves fully; below ~30 km it falls off fast.
            let depth_factor = (-(h - 30.0).max(0.0) / 55.0).exp().max(0.015);
            let a_r = GAIN_R * 10f32.powf(ms - 6.0) * depth_factor;
            let mut t_r = f32::NAN;
            let mut t_r2 = f32::NAN;
            for n in 1..=4u32 {
                let path = if n % 2 == 1 { 360.0 * ((n - 1) / 2) as f32 + d } else { 360.0 * (n / 2) as f32 - d };
                let km = path * KM_PER_DEG as f32;
                let (u_fast, u_slow) = if n == 1 { (4.05, 3.05) } else { (4.05, 3.25) };
                let on = km / u_fast;
                let chirp = (km / u_slow - on).max(1.0);
                let (p0, p1) = if n == 1 {
                    let k = (-d / 8.0).exp();
                    (42.0 - 22.0 * k, 15.0 - 8.0 * k)
                } else {
                    (75.0, 30.0)
                };
                let amp = a_r * r_law(path) * 0.6f32.powi(n as i32 - 1);
                let kind = [Kind::R1, Kind::R2, Kind::R3, Kind::R4][n as usize - 1];
                let decay = if n == 1 { 220.0 + 2.2 * dur + 0.01 * km } else { 400.0 + 2.5 * dur };
                if n == 1 {
                    t_r = on;
                } else if n == 2 {
                    t_r2 = on;
                }
                push(kind, on, amp, 12.0 + 0.002 * km, chirp + dur, decay, (1.0 / p0, 1.0 / p1, chirp), 0.35, 0.5);
            }

            let count = (packets.len() as u32 - first) as u8;
            let ps = &packets[first as usize..];
            let (mut peak, mut peak_t, mut end) = (0.0f32, src.t0, src.t0);
            let mut spans: Vec<(f64, f64)> = Vec::new();
            for p in ps {
                if p.amp > CLIP_LINES {
                    // Above the stops from the onset until the coda decays below them.
                    let above = p.hold + p.decay * (p.amp / CLIP_LINES).ln();
                    spans.push((p.on, p.on + above as f64));
                }
                if p.amp > peak {
                    peak = p.amp;
                    peak_t = p.on + p.xpk as f64;
                }
                end = end.max(p.on + p.len as f64);
            }
            let ev = Event {
                q: src.q,
                t0: src.t0,
                dist: d,
                baz: back_az as f32,
                depth: h,
                mag: m,
                peak,
                peak_t,
                end,
                first,
                count,
                t_p: ap.t,
                t_pp,
                t_s: asw.t,
                t_r,
                t_r2,
                p_branch: ap.branch,
                s_branch: asw.branch,
                clip_s: union_len(&mut spans) as f32,
            };
            if end - src.t0 > SHORT {
                long.push(events.len() as u32);
            }
            let day = (peak_t / 86400.0).floor();
            if day >= 0.0 && (day as usize) < day_peak.len() {
                let dp = &mut day_peak[day as usize];
                *dp = dp.max(peak);
            }
            events.push(ev);
        }
        Seis { station, noise, events, packets, long, day_peak }
    }

    pub fn packets_of(&self, e: &Event) -> &[Packet] {
        &self.packets[e.first as usize..e.first as usize + e.count as usize]
    }

    /// Events whose record overlaps [a, b], in time order.
    pub fn active(&self, a: f64, b: f64, out: &mut Vec<u32>) {
        out.clear();
        for &i in &self.long {
            let e = &self.events[i as usize];
            if e.t0 < a - SHORT && e.end >= a && e.t0 <= b {
                out.push(i);
            }
        }
        let lo = self.events.partition_point(|e| e.t0 < a - SHORT);
        let hi = self.events.partition_point(|e| e.t0 <= b);
        for i in lo..hi {
            let e = &self.events[i];
            if e.end >= a && e.count > 0 {
                out.push(i as u32);
            }
        }
    }

    /// The event index whose record is strongest at `t`, and that strength.
    pub fn strongest_at(&self, t: f64, halfwidth: f64, scratch: &mut Vec<u32>) -> Option<(usize, f32)> {
        self.active(t - halfwidth, t + halfwidth, scratch);
        let mut best = None;
        let mut best_a = 0.0f32;
        for &i in scratch.iter() {
            let e = &self.events[i as usize];
            let mut a = 0.0f32;
            for p in self.packets_of(e) {
                let x0 = (t - halfwidth - p.on) as f32;
                let x1 = (t + halfwidth - p.on) as f32;
                a = a.max(p.amp * p.env_max(x0, x1));
            }
            if a > best_a {
                best_a = a;
                best = Some(i as usize);
            }
        }
        best.map(|i| (i, best_a))
    }

    /// Event for a catalogue index (events are in catalogue order for the real station).
    pub fn event_of(&self, q: usize) -> Option<&Event> {
        self.events.get(q).filter(|e| e.q as usize == q)
    }
}

// ---------- civil dates (Howard Hinnant's algorithms) ----------

pub fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (m as i64 + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d as i64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

pub fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}
