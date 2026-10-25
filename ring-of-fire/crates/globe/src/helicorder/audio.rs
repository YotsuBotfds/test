//! Sonification: the same synthetic seismogram, played faster.
//!
//! Speeding a record up by a factor S multiplies every frequency by S, so the
//! 6.5 s microseism, 1 s P waves and 20 s surface waves land in the audible range
//! (at S = 2400 they become 370 Hz, 2.4 kHz and 120 Hz). Partials that would land
//! above the audio band are faded out instead of aliasing. The mix is then
//! band-limited, gently compressed (a great quake is thousands of times louder
//! than the background), normalised and faded in and out, so it never clicks.

use super::seis::{sin_turns, Packet, Seis, HISS, MICRO_HZ, PRIMARY_HZ};
use crate::gfx::smoothstep;

/// Level the background (its median envelope) is brought to at most.
const BACKGROUND: f32 = 0.08;

/// Longest clip, seconds of audio.
pub const MAX_SECONDS: f64 = 60.0;

pub struct Clip {
    /// Planar stereo: left then right, `frames` samples each.
    pub data: Vec<f32>,
    pub frames: usize,
    pub peak: f32,
    pub rms: f32,
}

/// Gain for a partial at `f_audio` Hz: fade out near the top of the band, and
/// below 18 Hz where it would be felt rather than heard.
#[inline]
fn band_gain(f_audio: f32, rate: f32) -> f32 {
    (1.0 - smoothstep(0.30, 0.42, f_audio / rate)) * smoothstep(9.0, 24.0, f_audio)
}

struct Biquad {
    b: [f32; 3],
    a: [f32; 2],
    z: [f32; 2],
}

impl Biquad {
    /// RBJ cookbook low/high-pass, Q = 0.707.
    fn new(f: f32, rate: f32, high: bool) -> Self {
        let w = std::f32::consts::TAU * f / rate;
        let (s, c) = w.sin_cos();
        let al = s / (2.0 * std::f32::consts::FRAC_1_SQRT_2);
        let a0 = 1.0 + al;
        let (b0, b1) = if high { ((1.0 + c) / 2.0, -(1.0 + c)) } else { ((1.0 - c) / 2.0, 1.0 - c) };
        Biquad { b: [b0 / a0, b1 / a0, b0 / a0], a: [-2.0 * c / a0, (1.0 - al) / a0], z: [0.0; 2] }
    }
    #[inline]
    fn run(&mut self, x: f32) -> f32 {
        let y = self.b[0] * x + self.z[0];
        self.z[0] = self.b[1] * x - self.a[0] * y + self.z[1];
        self.z[1] = self.b[2] * x - self.a[1] * y;
        y
    }
}

/// Adds one wave packet into the stereo buffers. Each packet is synthesised at
/// the lowest rate its highest partial allows (up to 8 times below the output
/// rate) and interpolated up, so cost follows bandwidth: a 20 s surface wave
/// that plays at 120 Hz costs an eighth of a 1 s P wave playing at 2.4 kHz.
/// Where audio samples sit in seismic time, and how fast the record plays.
struct Timebase {
    /// Seismic time of sample 0, seconds since the epoch.
    t0: f64,
    /// Seismic seconds per audio sample.
    ds: f64,
    speed: f32,
    rate: f32,
}

fn add_packet(p: &Packet, tb: &Timebase, l: &mut [f32], r: &mut [f32], tmp: &mut Vec<f32>) {
    let Timebase { t0, ds, speed, rate } = *tb;
    let n = l.len();
    let start = ((p.on - t0) / ds).ceil().max(0.0) as usize;
    let stop = (((p.on + p.len as f64 - t0) / ds).floor().max(0.0) as usize + 1).min(n);
    if start >= stop {
        return;
    }
    let parts = p.partials();
    let mut f_hi = 0.0f32;
    let mut any = false;
    for &(m, _) in parts {
        any |= band_gain(m * p.f0 * speed, rate).max(band_gain(m * p.f1 * speed, rate)) > 0.0;
        f_hi = f_hi.max(m * p.f0.max(p.f1) * speed);
    }
    if !any {
        return;
    }
    // Keep every partial below 10% of the reduced rate, where cubic
    // interpolation leaves its images far below the background.
    let d = ((rate * 0.1 / f_hi.max(1.0)) as usize).clamp(1, 8);
    // One extra sample before and two after, for cubic (Catmull-Rom) interpolation.
    let count = (stop - 1 - start) / d + 4;
    let dx = ds * d as f64;
    synth_packet(p, t0 + start as f64 * ds - p.on - dx, dx, count, speed, rate, tmp);
    let theta = (p.pan.clamp(-1.0, 1.0) + 1.0) * std::f32::consts::FRAC_PI_4;
    let (gl, gr) = (theta.cos(), theta.sin());
    if d == 1 {
        for (i, &v) in (start..stop).zip(tmp[1..].iter()) {
            l[i] += v * gl;
            r[i] += v * gr;
        }
    } else {
        let inv = 1.0 / d as f32;
        for i in start..stop {
            let k = i - start;
            let (j, t) = (k / d, (k % d) as f32 * inv);
            let (p0, p1, p2, p3) = (tmp[j], tmp[j + 1], tmp[j + 2], tmp[j + 3]);
            let v = p1 + 0.5 * t * (p2 - p0 + t * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3 + t * (3.0 * (p1 - p2) + p3 - p0)));
            l[i] += v * gl;
            r[i] += v * gr;
        }
    }
}

/// Mono samples of one packet at x0, x0 + dx, ... (seconds after its onset). The
/// envelope's exponentials are advanced by multiplication; each partial's phase is
/// computed exactly every `B` samples and advanced by rotation in between.
fn synth_packet(p: &Packet, x0: f64, dx: f64, count: usize, speed: f32, rate: f32, out: &mut Vec<f32>) {
    const B: usize = 16;
    out.clear();
    out.resize(count, 0.0);
    let parts = p.partials();
    let np = parts.len();
    let dxf = dx as f32;
    let xof = |j: usize| (x0 + j as f64 * dx) as f32;
    let k_rise = (-dxf / p.rise).exp();
    let k_dec = (-dxf / p.decay).exp();
    let xs = xof(0);
    let mut e_rise = (-xs.max(0.0) / p.rise).exp();
    let mut e_dec = if xs > p.hold { (-(xs - p.hold) / p.decay).exp() } else { 1.0 };
    // Per partial: the carrier's cycles (exact, unwrapped) and the phase offset.
    let mut off0 = [0.0f32; 4];
    let mut off1 = [0.0f32; 4];
    p.offsets(xs, &mut off0);
    let mut c0 = p.cycles(xs);
    let mut b0 = 0;
    while b0 < count {
        let b1 = (b0 + B).min(count);
        let len = b1 - b0;
        let x1 = xof(b1);
        p.offsets(x1, &mut off1);
        let c1 = p.cycles(x1);
        let buf = &mut out[b0..b1];
        let f = p.freq(xof(b0));
        for k in 0..np {
            let (m, wt) = parts[k];
            let g = band_gain(m * f * speed, rate) * wt;
            if g > 0.0 {
                // The advance over the block, exactly: no wrapping, so it may span many cycles.
                let d = m * (c1 - c0) + (off1[k] - off0[k]);
                let step = d / len as f32;
                let ph = m * c0 + off0[k];
                let (mut s, mut c) = (sin_turns(ph), sin_turns(ph + 0.25));
                let (ss, cs) = (sin_turns(step), sin_turns(step + 0.25));
                for v in buf.iter_mut() {
                    *v += g * s;
                    let ns = s * cs + c * ss;
                    c = c * cs - s * ss;
                    s = ns;
                }
            }
        }
        for (j, v) in buf.iter_mut().enumerate() {
            let x = xof(b0 + j);
            let a = if x < 0.0 { 0.0 } else { 1.0 - e_rise };
            if x >= 0.0 {
                e_rise *= k_rise;
            }
            let dcy = if x > p.hold {
                let v = e_dec;
                e_dec *= k_dec;
                v
            } else {
                1.0
            };
            let gg = if p.g0 < 1.0 { p.g0 + (1.0 - p.g0) * (x / p.chirp).clamp(0.0, 1.0) } else { 1.0 };
            *v *= p.amp * a * gg * dcy;
        }
        off0 = off1;
        c0 = c1;
        b0 = b1;
    }
}

/// Synthesises [t0, t1] of the station's record at `speed` times real time.
pub fn synth(seis: &Seis, t0: f64, t1: f64, speed: f64, rate: f64) -> Clip {
    let speed = speed.max(1.0);
    let frames = (((t1 - t0).max(0.0) / speed) * rate).min(MAX_SECONDS * rate) as usize;
    if frames < 16 {
        return Clip { data: vec![0.0; frames * 2], frames, peak: 0.0, rms: 0.0 };
    }
    let t1 = t0 + frames as f64 / rate * speed;
    let ds = speed / rate;
    let (sp, rt) = (speed as f32, rate as f32);
    let mut l = vec![0.0f32; frames];
    let mut r = vec![0.0f32; frames];
    let nz = &seis.noise;

    // Background: microseism, primary microseism and hiss.
    let gm = band_gain((MICRO_HZ * 1.24) as f32 * sp, rt).max(band_gain((MICRO_HZ * 0.8) as f32 * sp, rt));
    let gp = band_gain(PRIMARY_HZ as f32 * sp, rt);
    let gh = 1.0 - smoothstep(0.3, 0.42, 1.5 * sp / rt);
    nz.fill(t0, ds, gm, gp, &mut l);
    let block = 256;
    let h = gh * HISS * 0.6;
    for b0 in (0..frames).step_by(block) {
        let b1 = (b0 + block).min(frames);
        let a0 = nz.amp(t0 + b0 as f64 * ds);
        let a1 = nz.amp(t0 + b1 as f64 * ds);
        for i in b0..b1 {
            let a = a0 + (a1 - a0) * ((i - b0) as f32 / block as f32);
            let v = l[i];
            l[i] = a * (v + h * nz.hiss(i as u64, 1));
            r[i] = a * (v + h * nz.hiss(i as u64, 2));
        }
    }

    // Quakes.
    let mut act = Vec::new();
    let mut tmp = Vec::new();
    let tb = Timebase { t0, ds, speed: sp, rate: rt };
    seis.active(t0, t1, &mut act);
    for &ei in &act {
        let e = &seis.events[ei as usize];
        for p in seis.packets_of(e) {
            add_packet(p, &tb, &mut l, &mut r, &mut tmp);
        }
    }

    // Band-limit: rumble below hearing out, a gentle top-end roll-off.
    for ch in [&mut l, &mut r] {
        let mut hp = Biquad::new(22.0, rt, true);
        let mut lp = Biquad::new(6000.0, rt, false);
        for v in ch.iter_mut() {
            *v = lp.run(hp.run(*v));
        }
    }

    // Compressor: a zero-lag envelope (forward and backward peak followers),
    // then 3:1 above a threshold set from the background level.
    let mut env: Vec<f32> = l.iter().zip(&r).map(|(a, b)| a.abs().max(b.abs())).collect();
    let att = (-1.0 / (0.004 * rt)).exp();
    let rel = (-1.0 / (0.15 * rt)).exp();
    let follow = |src: &[f32], rev: bool| {
        let mut e = 0.0f32;
        let n = src.len();
        let mut out = vec![0.0f32; n];
        for j in 0..n {
            let i = if rev { n - 1 - j } else { j };
            let x = src[i];
            let k = if x > e { att } else { rel };
            e = x + (e - x) * k;
            out[i] = e;
        }
        out
    };
    let fwd = follow(&env, false);
    let bwd = follow(&env, true);
    for (i, v) in env.iter_mut().enumerate() {
        *v = fwd[i].max(bwd[i]);
    }
    let mut sorted: Vec<f32> = env.iter().step_by(64).copied().collect();
    sorted.sort_by(f32::total_cmp);
    let median = sorted[sorted.len() / 2].max(1e-9);
    let thr = median * 3.0;
    let ratio = 3.0f32;
    // The envelope is smooth, so the gain is computed every 16 samples and interpolated.
    let gain_at = |e: f32| if e > thr { (e / thr).powf(1.0 / ratio - 1.0) } else { 1.0 };
    let mut g0 = gain_at(env[0]);
    for b0 in (0..frames).step_by(16) {
        let b1 = (b0 + 16).min(frames);
        let g1 = gain_at(env[b1 - 1]);
        let step = (g1 - g0) / (b1 - b0) as f32;
        for (j, i) in (b0..b1).enumerate() {
            let g = g0 + step * j as f32;
            l[i] *= g;
            r[i] *= g;
        }
        g0 = g1;
    }

    // Normalise the loudest moment to 0.89, but never lift the background above a
    // fixed level, so a quiet day sounds quiet. Then fade in over 20 ms and out over 80 ms.
    let peak = l.iter().chain(&r).fold(0.0f32, |m, v| m.max(v.abs())).max(1e-12);
    let gain = (0.89 / peak).min(BACKGROUND / median);
    let fin = (0.02 * rate) as usize;
    let fout = (0.08 * rate) as usize;
    let mut sum2 = 0.0f64;
    let mut pk = 0.0f32;
    for i in 0..frames {
        let mut g = gain;
        if i < fin {
            g *= (i as f32 / fin as f32).powi(2);
        }
        if i + fout > frames {
            let u = (frames - i) as f32 / fout as f32;
            g *= u * u;
        }
        l[i] *= g;
        r[i] *= g;
        sum2 += (l[i] as f64).powi(2) + (r[i] as f64).powi(2);
        pk = pk.max(l[i].abs()).max(r[i].abs());
    }
    let rms = (sum2 / (2 * frames) as f64).sqrt() as f32;
    let mut data = l;
    data.extend_from_slice(&r);
    Clip { data, frames, peak: pk, rms }
}
