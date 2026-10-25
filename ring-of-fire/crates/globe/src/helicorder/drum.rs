//! The drum: rows of trace scratched into soot, wrapped round a cylinder.
//!
//! A row is never synthesised at full rate. For each pixel column the row cache
//! holds the lowest and highest point the stylus reached in that column's slice
//! of time. Waves too fast to resolve at the current zoom (shorter than a few
//! columns per cycle) contribute their analytic envelope as a band; slower ones
//! are sampled four times per column. Rows are keyed by index, so turning the
//! drum only computes the rows that come into view.

use super::seis::{civil_from_days, days_from_civil, Seis, HISS, MICRO_HZ, PRIMARY_HZ};
use crate::color::{hex, to_srgb, Rgb};
use crate::gfx::{hash, smoothstep, Frame};

/// Where the pen hits its stops, in line spacings either side of the line.
pub const CLIP: f32 = super::seis::CLIP_LINES;
/// Samples per column for waves slow enough to draw as a line.
const SUB: usize = 4;
/// Half of the drum's face that is visible, radians from the front.
pub const THETA_V: f32 = 0.9;

#[derive(Clone, Copy, Debug)]
pub struct Zoom {
    /// Seconds across one line.
    pub span: f64,
    /// Lines are calendar months (span is then 31 days and short months end early).
    pub months: bool,
    /// Lines on the drum's face when there is room.
    pub nominal: f32,
    /// Time marks: (every s, length s, height in line spacings), small and large.
    pub mark: (f64, f64, f32),
    pub big: (f64, f64, f32),
    /// Smallest magnitude whose origin time gets an ember mark.
    pub mark_mag: f32,
    /// Pen magnification: turned down on the long zooms so a line stays legible.
    pub gain: f32,
}

pub const ZOOMS: [Zoom; 5] = [
    Zoom { span: 120.0, months: false, nominal: 30.0, mark: (60.0, 2.0, 0.1), big: (3600.0, 4.0, 0.2), mark_mag: 4.5, gain: 1.0 },
    Zoom { span: 3600.0, months: false, nominal: 24.0, mark: (60.0, 2.0, 0.08), big: (3600.0, 6.0, 0.18), mark_mag: 5.8, gain: 1.0 },
    Zoom { span: 21600.0, months: false, nominal: 28.0, mark: (3600.0, 30.0, 0.1), big: (86400.0, 60.0, 0.2), mark_mag: 6.3, gain: 0.7 },
    Zoom { span: 86400.0, months: false, nominal: 31.0, mark: (3600.0, 60.0, 0.08), big: (86400.0, 120.0, 0.18), mark_mag: 6.5, gain: 0.5 },
    Zoom { span: 31.0 * 86400.0, months: true, nominal: 37.0, mark: (86400.0, 600.0, 0.09), big: (0.0, 0.0, 0.0), mark_mag: 7.0, gain: 0.3 },
];

pub struct Row {
    pub k: i64,
    pub t0: f64,
    pub dt: f64,
    /// Columns before the line ends (short months end early).
    pub valid: usize,
    pub lo: Vec<f32>,
    pub hi: Vec<f32>,
    /// How much of the column's span is an unresolved band (0 = a clean line).
    pub dens: Vec<f32>,
    used: u64,
}

impl Row {
    pub fn empty() -> Self {
        Row { k: 0, t0: 0.0, dt: 1.0, valid: 0, lo: Vec::new(), hi: Vec::new(), dens: Vec::new(), used: 0 }
    }
}

/// Scratch space for computing rows.
#[derive(Default)]
pub struct RowMaker {
    smp: Vec<f32>,
    band2: Vec<f32>,
    mark: Vec<f32>,
    act: Vec<u32>,
}

#[inline]
fn softclip(d: f32, c: f32) -> f32 {
    let a = d.abs();
    let k = 0.82 * c;
    if a <= k {
        d
    } else {
        let u = (a - k) / (c - k);
        (k + (c - k) * u / (1.0 + u)).copysign(d)
    }
}

impl RowMaker {
    /// Fills `row` with the pen's reach per column over [t0, t0 + span).
    #[allow(clippy::too_many_arguments)]
    pub fn compute(&mut self, seis: &Seis, k: i64, t0: f64, span: f64, valid_end: f64, ncol: usize, z: &Zoom, row: &mut Row) {
        let dt = span / ncol as f64;
        let valid = (((valid_end - t0) / dt).ceil().max(0.0) as usize).min(ncol);
        let ns = ncol * SUB + 1;
        self.smp.clear();
        self.smp.resize(ns, 0.0);
        self.band2.clear();
        self.band2.resize(ncol, 0.0);
        self.mark.clear();
        self.mark.resize(ncol, 0.0);
        row.k = k;
        row.t0 = t0;
        row.dt = dt;
        row.valid = valid;
        for v in [&mut row.lo, &mut row.hi, &mut row.dens] {
            v.clear();
            v.resize(ncol, 0.0);
        }
        if valid == 0 {
            return;
        }
        let dts = dt / SUB as f64;
        let noise = &seis.noise;
        // Background: sampled where its period spans several columns, else a band.
        let wm = smoothstep(1.6, 4.0, (1.0 / (MICRO_HZ * 1.24) / dt) as f32);
        let wp = smoothstep(1.6, 4.0, (1.0 / PRIMARY_HZ / dt) as f32);
        let pf = |cycles: f64| (1.2 + 0.28 * (1.0 + 2.0 * cycles).ln()).min(2.4) as f32;
        let (pf_m, pf_p) = (pf(MICRO_HZ * dt), pf(PRIMARY_HZ * dt));
        for c in 0..valid {
            let tc = t0 + (c as f64 + 0.5) * dt;
            let a = noise.amp(tc);
            let bm = (1.0 - wm) * a * pf_m;
            let bp = (1.0 - wp) * a * 0.3 * pf_p;
            let bh = a * HISS * 2.0;
            self.band2[c] = bm * bm + bp * bp + bh * bh;
            if wm > 0.0 || wp > 0.0 {
                let last = if c + 1 == valid { SUB } else { SUB - 1 };
                for s in 0..=last {
                    let t = t0 + (c * SUB + s) as f64 * dts;
                    let mut v = 0.0;
                    if wm > 0.0 {
                        v += wm * noise.micro(t);
                    }
                    if wp > 0.0 {
                        v += wp * 0.3 * noise.primary(t);
                    }
                    self.smp[c * SUB + s] = a * v;
                }
            }
        }
        // Quakes.
        let t1 = t0 + valid as f64 * dt;
        seis.active(t0, t1, &mut self.act);
        for &ei in &self.act {
            let e = &seis.events[ei as usize];
            for p in seis.packets_of(e) {
                let end = p.on + p.len as f64;
                if end < t0 || p.on > t1 {
                    continue;
                }
                let c0 = (((p.on - t0) / dt).floor().max(0.0)) as usize;
                let c1 = (((end - t0) / dt).ceil() as usize).min(valid);
                let m_hi = if p.surface() { 2.03 } else { 1.83 };
                let parts = p.partials();
                let mut off = [0.0f32; 4];
                for c in c0..c1 {
                    let xa = (t0 + c as f64 * dt - p.on) as f32;
                    let xb = xa + dt as f32;
                    let f = p.freq((xa + 0.5 * dt as f32).max(0.0)) * m_hi;
                    let w = smoothstep(1.6, 4.0, 1.0 / (f * dt as f32));
                    if w < 1.0 {
                        let b = (1.0 - w) * p.amp * p.env_max(xa, xb);
                        self.band2[c] += b * b;
                    }
                    if w > 0.0 {
                        // Envelope from the column's edges, phase wander from its middle:
                        // both change little across one column.
                        let (ea, eb) = (p.env(xa), p.env(xb));
                        if ea == 0.0 && eb == 0.0 && (xb < 0.0 || xa > p.len) {
                            continue;
                        }
                        p.offsets(xa + 0.5 * dt as f32, &mut off);
                        let last = if c + 1 == valid { SUB } else { SUB - 1 };
                        let g = w * p.amp;
                        for s in 0..=last {
                            let u = s as f32 / SUB as f32;
                            let x = xa + u * dt as f32;
                            let e = ea + (eb - ea) * u;
                            let cyc = p.cycles(x);
                            let mut v = 0.0;
                            for (k, &(m, wt)) in parts.iter().enumerate() {
                                v += wt * crate::helicorder::seis::sin_turns(m * cyc + off[k]);
                            }
                            self.smp[c * SUB + s] += g * e * v;
                        }
                    }
                }
            }
        }
        // Time marks: the pen kicks up for a moment every minute (or hour, or day).
        for (spec, is_big) in [(z.mark, false), (z.big, true)] {
            let (every, len, h) = spec;
            if every <= 0.0 {
                continue;
            }
            let mut m = (t0 / every).ceil() * every;
            while m < t1 {
                let skip = !is_big && z.big.0 > 0.0 && (m / z.big.0).fract().abs() < 1e-9;
                if !skip {
                    let cs = (m - t0) / dt;
                    let ce = (m + len - t0) / dt;
                    if ce - cs >= 2.0 {
                        let j0 = (cs * SUB as f64).ceil() as usize;
                        let j1 = ((ce * SUB as f64).floor() as usize).min(valid * SUB);
                        for v in &mut self.smp[j0..=j1.max(j0)] {
                            *v += h;
                        }
                    } else {
                        let c = (cs as usize).min(valid - 1);
                        self.mark[c] = self.mark[c].max(h);
                    }
                }
                m += every;
            }
        }
        // Reach per column, with ragged band edges and the pen's stops.
        let rseed = (k as u32).wrapping_mul(0x9e37_79b9) ^ (z.span as u32);
        let gain = z.gain;
        for c in 0..valid {
            let s = &self.smp[c * SUB..=c * SUB + SUB];
            let (mut mn, mut mx) = (s[0], s[0]);
            for &v in &s[1..] {
                mn = mn.min(v);
                mx = mx.max(v);
            }
            let (mn, mx) = (mn * gain, mx * gain);
            let hc = hash(rseed ^ (c as u32).wrapping_mul(0x85eb_ca6b));
            let rag = 0.7 + 0.6 * hc;
            let b = self.band2[c].sqrt() * rag * gain;
            let mut lo = mn - b;
            let mut hi = mx + b;
            if self.mark[c] > 0.0 {
                hi = hi.max(0.5 * (mn + mx) + 0.5 * b + self.mark[c]);
            }
            // The stops are not perfectly even: a slow wobble plus a little chatter.
            let wob = crate::helicorder::seis::vnoise(c as f32 / 23.0, rseed ^ 0x5bd1);
            let stop = CLIP * (0.9 + 0.06 * wob + 0.04 * hash(hc.to_bits()));
            let mut dens = b / (b + 0.5 * (mx - mn) + 0.012);
            if mx - mn > 3.2 * stop || lo < -1.6 * stop || hi > 1.6 * stop {
                // Driven far past the stops: the pen hammers between them.
                lo = -stop;
                hi = stop;
                dens = 0.9;
            } else {
                lo = softclip(lo, stop);
                hi = softclip(hi, stop);
            }
            row.lo[c] = lo;
            row.hi[c] = hi;
            row.dens[c] = dens;
        }
    }
}

/// A row-time grid: fixed-length lines from the epoch, or calendar months.
#[derive(Clone, Copy)]
pub struct Grid {
    pub z: Zoom,
    epoch_days: i64,
    /// Month index (year * 12 + month - 1) of the epoch's month.
    m0: i64,
}

impl Grid {
    pub fn new(z: Zoom, epoch: u32) -> Self {
        let epoch_days = (epoch / 86400) as i64;
        let (y, m, _) = civil_from_days(epoch_days);
        Grid { z, epoch_days, m0: y * 12 + m as i64 - 1 }
    }
    pub fn start(&self, k: i64) -> f64 {
        if self.z.months {
            let mi = self.m0 + k;
            let (y, m) = (mi.div_euclid(12), mi.rem_euclid(12) as u32 + 1);
            (days_from_civil(y, m, 1) - self.epoch_days) as f64 * 86400.0
        } else {
            k as f64 * self.z.span
        }
    }
    /// End of the record on line k (the next line's start).
    pub fn end(&self, k: i64) -> f64 {
        if self.z.months {
            self.start(k + 1)
        } else {
            (k + 1) as f64 * self.z.span
        }
    }
    /// Line holding time t, and the fraction of the line's width it sits at.
    pub fn locate(&self, t: f64) -> (i64, f64) {
        let k = if self.z.months {
            let (y, m, _) = civil_from_days(self.epoch_days + (t / 86400.0).floor() as i64);
            y * 12 + m as i64 - 1 - self.m0
        } else {
            (t / self.z.span).floor() as i64
        };
        (k, (t - self.start(k)) / self.z.span)
    }
    /// Continuous line coordinate of a time (k + fraction across).
    pub fn pos(&self, t: f64) -> f64 {
        let (k, f) = self.locate(t);
        k as f64 + f
    }
}

/// Ember origin marks and arrival ticks the page labels in HTML.
#[derive(Clone, Copy, Default)]
pub struct Mark {
    pub q: u32,
    pub x: f32,
    pub y: f32,
    pub mag: f32,
}

pub struct Drum {
    pub frame: Frame,
    ink: Vec<f32>,
    tile: Vec<u32>,
    strokes: Vec<f32>,
    pub grid: Grid,
    pub zoom: usize,
    /// Line at the front of the drum (fractional: the drum turns smoothly).
    pub center: f64,
    /// Device pixels per CSS pixel.
    pub k: f32,
    pub cursor: f64,
    pub selected: Option<usize>,
    pub hover: Option<usize>,
    pub playhead: Option<f64>,
    rows: Vec<Row>,
    maker: RowMaker,
    tick: u64,
    epoch: u32,
    station: usize,
    // Geometry of the last layout.
    pub rd: f32,
    pub cy: f32,
    pub sp: f32,
    pub x0: usize,
    pub ncol: usize,
    shade: Vec<f32>,
    luts: Vec<[u32; 256]>,
    cov: Vec<u8>,
    pub marks: Vec<Mark>,
    /// Selected quake's arrivals: (x, y, kind) in device px; kind 0 P, 1 PP, 2 S, 3 R1, 4 R2, 5 origin.
    pub arrivals: Vec<[f32; 3]>,
    /// Stylus position (x, y) when it is on the drum.
    pub stylus: Option<[f32; 2]>,
    /// Seconds spent on traces, compositing and overlays in the last render (native only).
    pub timings: [f64; 3],
}

#[cfg(not(target_arch = "wasm32"))]
fn clock() -> f64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0.0, |d| d.as_secs_f64())
}

#[cfg(target_arch = "wasm32")]
fn clock() -> f64 {
    0.0
}

/// Stroke texture for bands where the pen swings many times within a column.
const SW: usize = 128;
const SH: usize = 64;

fn stroke_tile() -> Vec<f32> {
    let mut t = vec![0.0f32; SW * SH];
    for i in 0..170u32 {
        let h = |k: u32| hash(i.wrapping_mul(0x9e37_79b9) ^ k.wrapping_mul(0x85eb_ca6b));
        let (x0, y0) = (h(1) * SW as f32, h(2) * SH as f32);
        let len = 10.0 + 44.0 * h(3);
        let dx = (h(4) - 0.5) * 9.0;
        let a = 0.5 + 0.5 * h(5);
        let steps = (len * 2.0) as usize;
        for st in 0..steps {
            let u = st as f32 / steps as f32;
            let (x, y) = (x0 + dx * u, y0 + len * u);
            let (xi, fx) = (x.floor(), x - x.floor());
            for (xx, wgt) in [(xi, 1.0 - fx), (xi + 1.0, fx)] {
                let xw = (xx as i32).rem_euclid(SW as i32) as usize;
                let yw = (y as i32).rem_euclid(SH as i32) as usize;
                let v = &mut t[yw * SW + xw];
                *v = v.max(a * wgt);
            }
        }
    }
    for v in &mut t {
        *v = (0.05 + *v).min(1.0);
    }
    t
}

const TW: usize = 1024;
const TH: usize = 512;
/// Scratched paper: warm white.
const PAPER: u32 = 0xf3e8d4;

fn soot_tile(frame: &Frame) -> Vec<u32> {
    // Periodic value noise on a lattice of `cell` texels.
    let vn2 = |x: usize, y: usize, cell: usize, seed: u32| -> f32 {
        let (px, py) = (TW / cell, TH / cell);
        let (fx, fy) = (x as f32 / cell as f32, y as f32 / cell as f32);
        let (ix, iy) = (fx.floor() as usize, fy.floor() as usize);
        let (tx, ty) = (fx - ix as f32, fy - iy as f32);
        let (sx, sy) = (tx * tx * (3.0 - 2.0 * tx), ty * ty * (3.0 - 2.0 * ty));
        let g = |a: usize, b: usize| hash(((a % px) as u32).wrapping_mul(73_856_093) ^ ((b % py) as u32).wrapping_mul(19_349_663) ^ seed);
        let top = g(ix, iy) + (g(ix + 1, iy) - g(ix, iy)) * sx;
        let bot = g(ix, iy + 1) + (g(ix + 1, iy + 1) - g(ix, iy + 1)) * sx;
        top + (bot - top) * sy
    };
    let base = hex(0x1d1916);
    let thin = hex(0x3a2c22);
    let mut out = vec![0u32; TW * TH];
    for y in 0..TH {
        for x in 0..TW {
            let blot = vn2(x, y, 128, 11) * 0.65 + vn2(x, y, 64, 12) * 0.35;
            let mid = vn2(x, y, 16, 13);
            // Streaks along the direction the paper turned through the smoke.
            let streak = vn2(x, y / 32, 4, 14);
            let grain = hash((x as u32).wrapping_mul(0x27d4_eb2f) ^ (y as u32).wrapping_mul(0x1656_67b1));
            let f = (0.8 + 0.4 * blot) * (0.94 + 0.12 * mid) * (0.92 + 0.1 * streak + 0.22 * (grain - 0.5));
            // Where the soot lies thin the brown paper shows through a little.
            let wisp = smoothstep(0.72, 0.95, blot) * 0.3;
            let c: Rgb = [0, 1, 2].map(|i| (base[i] + (thin[i] - base[i]) * wisp) * f);
            out[y * TW + x] = frame.pack(c);
        }
    }
    out
}

impl Drum {
    pub fn new(epoch: u32, station: usize) -> Self {
        let frame = Frame::new(1, 1);
        let tile = soot_tile(&frame);
        let strokes = stroke_tile();
        // Ink coverage: overlapping scratches saturate towards bare paper.
        let cov = (0..1024).map(|i| ((1.0 - (-(i as f32 / 256.0) * 1.35).exp()) * 255.0 + 0.5) as u8).collect();
        Drum {
            frame,
            ink: Vec::new(),
            tile,
            strokes,
            grid: Grid::new(ZOOMS[1], epoch),
            zoom: 1,
            center: 0.0,
            k: 1.0,
            cursor: f64::MAX,
            selected: None,
            hover: None,
            playhead: None,
            rows: Vec::new(),
            maker: RowMaker::default(),
            tick: 0,
            epoch,
            station,
            rd: 1.0,
            cy: 0.0,
            sp: 1.0,
            x0: 0,
            ncol: 1,
            shade: Vec::new(),
            luts: Vec::new(),
            cov,
            marks: Vec::new(),
            arrivals: Vec::new(),
            stylus: None,
            timings: [0.0; 3],
        }
    }

    pub fn resize(&mut self, w: usize, h: usize, k: f32) {
        self.frame.resize(w, h);
        self.k = k.max(0.5);
        self.ink = vec![0.0; self.frame.w * self.frame.h];
        self.layout();
    }

    pub fn set_station(&mut self, station: usize) {
        self.station = station;
        self.rows.clear();
    }

    /// Switches zoom, keeping the moment at the front of the drum in place.
    pub fn set_zoom(&mut self, z: usize) {
        let z = z.min(ZOOMS.len() - 1);
        if z == self.zoom {
            return;
        }
        let t = self.time_at_center();
        self.zoom = z;
        self.grid = Grid::new(ZOOMS[z], self.epoch);
        self.rows.clear();
        self.layout();
        self.center = self.grid.pos(t).floor();
    }

    pub fn time_at_center(&self) -> f64 {
        let k = self.center.round() as i64;
        let g = &self.grid;
        0.5 * (g.start(k) + (g.start(k) + g.z.span).min(g.end(k)))
    }

    fn layout(&mut self) {
        let (w, h) = (self.frame.w, self.frame.h);
        let k = self.k;
        let rd = (h as f32 * 0.5) / THETA_V.sin();
        let arc = 2.0 * rd * THETA_V;
        let nominal = ZOOMS[self.zoom].nominal;
        let sp = (arc / nominal).max(15.0 * k);
        let x0 = (60.0 * k).round() as usize;
        let x1 = w.saturating_sub((14.0 * k).round() as usize).max(x0 + 16);
        let ncol = x1 - x0;
        if ncol != self.ncol {
            self.rows.clear();
        }
        self.rd = rd;
        self.cy = h as f32 * 0.5;
        self.sp = sp;
        self.x0 = x0;
        self.ncol = ncol;
        // Light falls from above and in front; the drum darkens as it curves away.
        self.shade = (0..h)
            .map(|y| {
                let s = ((y as f32 + 0.5 - self.cy) / rd).clamp(-1.0, 1.0);
                let th = s.asin();
                let lam = (th + 0.25).cos().max(0.0).powf(2.2);
                let edge = 1.0 - 0.6 * smoothstep(0.5 * THETA_V, THETA_V * 1.02, th.abs());
                (0.1 + 0.9 * lam) * edge
            })
            .collect();
        // One lookup per shade level: bare paper at each coverage.
        let paper = hex(PAPER);
        self.luts = (0..32)
            .map(|lv| {
                let s = (lv as f32 + 0.5) / 32.0 * 1.1;
                let mut lut = [0u32; 256];
                for (c, e) in lut.iter_mut().enumerate() {
                    let a = c as f32 / 255.0 * s;
                    let b = |v: f32| (to_srgb(v * a) * 255.0 + 0.5) as u32;
                    *e = b(paper[0]) | (b(paper[1]) << 8) | (b(paper[2]) << 16);
                }
                lut
            })
            .collect();
    }

    /// Lines whose trace may reach the visible face.
    pub fn visible_rows(&self) -> (i64, i64) {
        let half = (self.rd * THETA_V / self.sp) as f64 + CLIP as f64 + 1.0;
        ((self.center - half).floor() as i64, (self.center + half).ceil() as i64)
    }

    /// Lines entirely on the face (for the window the page reports and plays).
    pub fn face_rows(&self) -> (i64, i64) {
        let half = (self.rd * THETA_V / self.sp) as f64 - 0.5;
        ((self.center - half).ceil() as i64, (self.center + half).floor() as i64)
    }

    /// Screen y of a point `defl` line spacings above line k.
    #[inline]
    pub fn y_of(&self, k: i64, defl: f32) -> f32 {
        let th = (((k as f64 - self.center) as f32) * self.sp - defl * self.sp) / self.rd;
        self.cy + self.rd * th.clamp(-1.55, 1.55).sin()
    }

    pub fn x_of(&self, frac: f64) -> f32 {
        self.x0 as f32 + (frac * self.ncol as f64) as f32
    }

    /// Fractional line coordinate under a screen y (NaN off the drum).
    pub fn line_at(&self, y: f32) -> f64 {
        let s = (y - self.cy) / self.rd;
        if s.abs() >= 1.0 {
            return f64::NAN;
        }
        self.center + (s.asin() * self.rd / self.sp) as f64
    }

    pub fn time_at(&self, k: i64, x: f32) -> f64 {
        self.grid.start(k) + ((x - self.x0 as f32) / self.ncol as f32) as f64 * self.grid.z.span
    }

    fn ensure_row(&mut self, seis: &Seis, k: i64) -> usize {
        self.tick += 1;
        if let Some(i) = self.rows.iter().position(|r| r.k == k) {
            self.rows[i].used = self.tick;
            return i;
        }
        let i = if self.rows.len() < 240 {
            self.rows.push(Row::empty());
            self.rows.len() - 1
        } else {
            (0..self.rows.len()).min_by_key(|&i| self.rows[i].used).unwrap()
        };
        let g = self.grid;
        let mut row = std::mem::replace(&mut self.rows[i], Row::empty());
        self.maker.compute(seis, k, g.start(k), g.z.span, g.end(k), self.ncol, &g.z, &mut row);
        row.used = self.tick;
        self.rows[i] = row;
        i
    }

    /// Computes up to `budget` missing rows, nearest the front of the drum first.
    /// Returns how many visible rows are still missing.
    pub fn prepare(&mut self, seis: &Seis, budget: usize) -> usize {
        let (a, b) = self.visible_rows();
        let mut need: Vec<i64> = (a..=b).filter(|k| !self.rows.iter().any(|r| r.k == *k)).collect();
        need.sort_by(|x, y| (*x as f64 - self.center).abs().total_cmp(&(*y as f64 - self.center).abs()));
        let n = need.len();
        for &k in need.iter().take(budget) {
            self.ensure_row(seis, k);
        }
        n.saturating_sub(budget)
    }

    /// Precomputes every row the face shows (used before timing a frame).
    pub fn warm(&mut self, seis: &Seis) {
        let (a, b) = self.visible_rows();
        for k in a..=b {
            self.ensure_row(seis, k);
        }
    }

    pub fn render(&mut self, seis: &Seis) {
        let (w, h) = (self.frame.w, self.frame.h);
        if w < 2 || h < 2 {
            return;
        }
        let t_start = clock();
        self.ink.fill(0.0);
        let (ra, rb) = self.visible_rows();
        let hw = 0.42 * self.k;
        let sp_rd = self.sp / self.rd;
        let cursor = self.cursor;
        let mut stylus = None;
        for k in ra..=rb {
            let th0 = ((k as f64 - self.center) as f32) * sp_rd;
            if th0.abs() > THETA_V + CLIP * sp_rd + 0.05 {
                continue;
            }
            let Some(ri) = self.rows.iter().position(|r| r.k == k) else { continue };
            self.tick += 1;
            self.rows[ri].used = self.tick;
            let row = &self.rows[ri];
            let (s0, c0) = th0.clamp(-1.55, 1.55).sin_cos();
            let (rd, cy) = (self.rd, self.cy);
            // Second-order expansion of cy + rd·sin(θ0 + δ) about the line.
            let y_at = |d: f32| {
                let dl = -d * sp_rd;
                cy + rd * (s0 + c0 * dl - 0.5 * s0 * dl * dl)
            };
            let rseed = (k as u32).wrapping_mul(0x2545_f491);
            for c in 0..row.valid {
                let tc = row.t0 + c as f64 * row.dt;
                if tc > cursor {
                    if stylus.is_none() && c > 0 {
                        let mid = 0.5 * (row.lo[c - 1] + row.hi[c - 1]);
                        stylus = Some([(self.x0 + c) as f32, y_at(mid)]);
                    }
                    break;
                }
                let ya = y_at(row.hi[c]) - hw;
                let yb = y_at(row.lo[c]) + hw;
                if yb < 0.0 || ya > h as f32 {
                    continue;
                }
                let dens = row.dens[c];
                let stria = 0.55 + 0.45 * hash(rseed ^ (c as u32).wrapping_mul(0x9e37_79b9));
                let line = 0.88 * (1.0 - dens);
                // A narrow band of background fuzz reads quieter than a quake's wide scribble.
                let width = smoothstep(0.15, 1.6, row.hi[c] - row.lo[c]);
                let band = dens * (0.42 + 0.4 * width) * stria;
                let x = self.x0 + c;
                let y0 = ya.floor().max(0.0) as usize;
                let y1 = (yb.ceil() as usize).min(h);
                let srow = (x + (rseed as usize & 127)) & (SW - 1);
                let soff = (rseed >> 8) as usize;
                if y1 <= y0 {
                    continue;
                }
                // Partial coverage only at the two end pixels; the run between is full.
                let cov0 = ((y0 as f32 + 1.0).min(yb) - ya.max(y0 as f32)).clamp(0.0, 1.0);
                let cov1 = (yb - (y1 as f32 - 1.0).max(ya)).clamp(0.0, 1.0);
                let ink = &mut self.ink;
                if band > 0.02 {
                    let st = &self.strokes;
                    let tex = |y: usize| st[((y + soff) & (SH - 1)) * SW + srow];
                    ink[y0 * w + x] += (line + band * tex(y0)) * cov0;
                    for y in y0 + 1..y1.saturating_sub(1) {
                        ink[y * w + x] += line + band * tex(y);
                    }
                    if y1 - 1 > y0 {
                        ink[(y1 - 1) * w + x] += (line + band * tex(y1 - 1)) * cov1;
                    }
                } else {
                    ink[y0 * w + x] += line * cov0;
                    for y in y0 + 1..y1.saturating_sub(1) {
                        ink[y * w + x] += line;
                    }
                    if y1 - 1 > y0 {
                        ink[(y1 - 1) * w + x] += line * cov1;
                    }
                }
            }
        }
        self.stylus = stylus;
        let t_ink = clock();
        self.compose();
        let t_comp = clock();
        self.overlays(seis);
        let t_end = clock();
        self.timings = [t_ink - t_start, t_comp - t_ink, t_end - t_comp];
    }

    fn compose(&mut self) {
        let (w, h) = (self.frame.w, self.frame.h);
        let sheen = hex(0x4a4036);
        // Horizontal vignette towards the drum's ends.
        let sx: Vec<u32> = (0..w)
            .map(|x| {
                let u = ((x as f32 + 0.5) / w as f32 * 2.0 - 1.0).abs();
                ((1.0 - 0.3 * smoothstep(0.82, 1.0, u)) * 256.0) as u32
            })
            .collect();
        let shift = self.center * self.sp as f64;
        for y in 0..h {
            let sy = self.shade[y];
            let s = ((y as f32 + 0.5 - self.cy) / self.rd).clamp(-1.0, 1.0);
            let th = s.asin();
            let v = (th * self.rd) as f64 + shift;
            let ty = (v.rem_euclid(TH as f64)) as usize % TH;
            let trow = &self.tile[ty * TW..(ty + 1) * TW];
            // Varnish sheen: a soft highlight band above the front line.
            let g = 0.045 * (-((th + 0.38) / 0.22).powi(2)).exp() + 0.02 * (-((th + 0.38) / 0.05).powi(2)).exp();
            let sh = |i: usize| (to_srgb(sheen[i] * g) * 255.0) as u32;
            let (shr, shg, shb) = (sh(0), sh(1), sh(2));
            let s8 = (sy * 256.0) as u32;
            let lut = &self.luts[((sy / 1.1 * 32.0) as usize).min(31)];
            let ink = &self.ink[y * w..(y + 1) * w];
            let out = &mut self.frame.px[y * w..(y + 1) * w];
            // Soot channels stay far below 255 even with the sheen added, so red and
            // blue share one multiply in separate 16-bit lanes and nothing clamps.
            let sheen_px = 0xff00_0000 | shr | (shg << 8) | (shb << 16);
            for (x, (o, &i)) in out.iter_mut().zip(ink).enumerate() {
                let t = trow[x & (TW - 1)];
                let s = (s8 * sx[x]) >> 8;
                let bg = ((((t & 0x00ff_00ff) * s) >> 8) & 0x00ff_00ff) + ((((t & 0x0000_ff00) * s) >> 8) & 0x0000_ff00) + sheen_px;
                if i <= 0.0 {
                    *o = bg;
                    continue;
                }
                let cv = self.cov[((i * 256.0) as usize).min(1023)] as u32;
                let p = lut[cv as usize];
                let keep = 255 - cv;
                let ch = |sh: u32| (((((bg >> sh) & 0xff) * keep) >> 8) + ((p >> sh) & 0xff)).min(255) << sh;
                *o = 0xff00_0000 | ch(0) | ch(8) | ch(16);
            }
        }
    }

    /// Additive glow straight into the output (sRGB bytes, saturating).
    fn glow(&mut self, cx: f32, cy: f32, sigma: f32, c: Rgb, peak: f32) {
        let (w, h) = (self.frame.w as i32, self.frame.h as i32);
        let r = (sigma * 2.6).ceil() as i32;
        let (ix, iy) = (cx as i32, cy as i32);
        let k = 1.0 / (2.0 * sigma * sigma);
        for y in (iy - r).max(0)..(iy + r + 1).min(h) {
            for x in (ix - r).max(0)..(ix + r + 1).min(w) {
                let d2 = (x as f32 + 0.5 - cx).powi(2) + (y as f32 + 0.5 - cy).powi(2);
                let g = peak * (-d2 * k).exp();
                if g < 0.004 {
                    continue;
                }
                let p = &mut self.frame.px[(y * w + x) as usize];
                let add = |v: u32, sh: u32, ch: f32| {
                    let cur = ((v >> sh) & 0xff) as f32 / 255.0;
                    let lin = crate::color::to_linear(cur) + ch * g;
                    ((to_srgb(lin) * 255.0 + 0.5) as u32).min(255) << sh
                };
                *p = 0xff00_0000 | add(*p, 0, c[0]) | add(*p, 8, c[1]) | add(*p, 16, c[2]);
            }
        }
    }

    /// Anti-aliased vertical bar, alpha-blended into the output.
    fn bar(&mut self, x: f32, ya: f32, yb: f32, half: f32, color: u32, alpha: f32) {
        let (w, h) = (self.frame.w as i32, self.frame.h as i32);
        let (ya, yb) = (ya.min(yb), ya.max(yb));
        let cr = [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
        for yi in (ya.floor() as i32).max(0)..(yb.ceil() as i32).min(h) {
            let cy = ((yi as f32 + 1.0).min(yb) - (yi as f32).max(ya)).clamp(0.0, 1.0);
            for xi in ((x - half - 1.0).floor() as i32).max(0)..((x + half + 1.0).ceil() as i32).min(w) {
                let cx = ((xi as f32 + 1.0).min(x + half) - (xi as f32).max(x - half)).clamp(0.0, 1.0);
                let a = (alpha * cx * cy * 256.0) as u32;
                if a == 0 {
                    continue;
                }
                let p = &mut self.frame.px[(yi * w + xi) as usize];
                let mix = |v: u32, sh: u32, c: u32| ((((v >> sh) & 0xff) * (256 - a) + c * a) >> 8) << sh;
                *p = 0xff00_0000 | mix(*p, 0, cr[0]) | mix(*p, 8, cr[1]) | mix(*p, 16, cr[2]);
            }
        }
    }

    fn on_face(&self, y: f32) -> bool {
        let s = (y - self.cy) / self.rd;
        s.abs() < THETA_V.sin() * 0.995
    }

    fn overlays(&mut self, seis: &Seis) {
        let k = self.k;
        let z = self.grid.z;
        let (ra, rb) = self.visible_rows();
        let (t_lo, t_hi) = (self.grid.start(ra), self.grid.end(rb));
        // Ember marks at the catalogued origin times of the larger quakes.
        self.marks.clear();
        let w = crate::data::world();
        let a = w.quakes.partition_point(|q| (q.t as f64) < t_lo);
        let b = w.quakes.partition_point(|q| (q.t as f64) < t_hi);
        for i in a..b {
            let q = &w.quakes[i];
            let t = q.t as f64;
            let sel = self.selected == Some(i) || self.hover == Some(i);
            if (q.mag < z.mark_mag && !sel) || t > self.cursor {
                continue;
            }
            let (row, f) = self.grid.locate(t);
            if f >= 1.0 {
                continue;
            }
            let y = self.y_of(row, 0.46);
            if !self.on_face(y) {
                continue;
            }
            self.marks.push(Mark { q: i as u32, x: self.x_of(f), y, mag: q.mag });
        }
        self.marks.sort_by(|a, b| b.mag.total_cmp(&a.mag));
        self.marks.truncate(48);
        let ember = hex(0xffb35c);
        let marks = self.marks.clone();
        for m in marks.iter().rev() {
            let (row, _) = self.grid.locate(w.quakes[m.q as usize].t as f64);
            let ya = self.y_of(row, 0.62);
            let yb = self.y_of(row, 0.24);
            let big = ((m.mag - 5.5) / 3.0).clamp(0.0, 1.0);
            self.bar(m.x, ya, yb, 0.6 * k + 0.5 * big * k, 0xffb35c, 0.95);
            self.glow(m.x, ya, (2.0 + 3.0 * big) * k, ember, 0.05 + 0.12 * big);
        }
        // The selected (or hovered) quake: its arrivals, labelled by the page.
        self.arrivals.clear();
        for (qi, strong) in [(self.hover, false), (self.selected, true)] {
            let Some(qi) = qi else { continue };
            let Some(e) = seis.event_of(qi) else { continue };
            let e = *e;
            let alpha = if strong { 1.0 } else { 0.6 };
            let list = [(e.t_p, 0, 0xffb35c), (e.t_pp, 1, 0xffb35c), (e.t_s, 2, 0x3fb8b0), (e.t_r, 3, 0xe8467c), (e.t_r2, 4, 0xe8467c)];
            for (dt, kind, col) in list {
                if !dt.is_finite() || (kind == 4 && e.peak < 0.0) {
                    continue;
                }
                let t = e.t0 + dt as f64;
                if t > self.cursor || t < t_lo || t >= t_hi {
                    continue;
                }
                let (row, f) = self.grid.locate(t);
                if f >= 1.0 {
                    continue;
                }
                let x = self.x_of(f);
                let ya = self.y_of(row, -0.22);
                let yb = self.y_of(row, -0.6);
                if !self.on_face(ya) {
                    continue;
                }
                self.bar(x, ya, yb, 0.75 * k, col, 0.95 * alpha);
                if strong {
                    self.arrivals.push([x, yb, kind as f32]);
                }
            }
            let (row, f) = self.grid.locate(e.t0);
            if strong && f < 1.0 && e.t0 <= self.cursor {
                let y = self.y_of(row, 0.62);
                if self.on_face(y) {
                    let x = self.x_of(f);
                    self.glow(x, y, 5.0 * k, ember, 0.35);
                    self.arrivals.push([x, y, 5.0]);
                }
            }
        }
        // The stylus resting at the end of the record.
        if let Some([x, y]) = self.stylus {
            if self.on_face(y) {
                self.glow(x, y, 9.0 * k, hex(0xffc98a), 0.16);
                self.glow(x, y, 2.2 * k, hex(0xfff1dc), 0.9);
            }
        }
        // Playhead while listening.
        if let Some(t) = self.playhead {
            let (row, f) = self.grid.locate(t);
            if f < 1.0 {
                let x = self.x_of(f);
                let ya = self.y_of(row, 0.8);
                let yb = self.y_of(row, -0.8);
                if self.on_face(0.5 * (ya + yb)) {
                    self.bar(x, ya, yb, 0.8 * k, 0xffb35c, 0.9);
                    self.glow(x, 0.5 * (ya + yb), 7.0 * k, ember, 0.22);
                }
            }
        }
    }

    /// Catalogue index of the quake that drew the trace under (x, y), if any.
    pub fn pick(&self, seis: &Seis, x: f32, y: f32, scratch: &mut Vec<u32>) -> Option<usize> {
        let reach = 10.0 * self.k;
        let w = crate::data::world();
        for m in &self.marks {
            if (m.x - x).abs() < reach && (m.y - y).abs() < reach * 1.4 {
                return Some(m.q as usize);
            }
        }
        if (x as usize) < self.x0 || x as usize >= self.x0 + self.ncol {
            return None;
        }
        let lf = self.line_at(y);
        if !lf.is_finite() {
            return None;
        }
        let dt = self.grid.z.span / self.ncol as f64;
        let mut best: Option<(usize, f32)> = None;
        for r in (lf.round() as i64 - 3)..=(lf.round() as i64 + 3) {
            let t = self.time_at(r, x);
            if t > self.cursor || t >= self.grid.end(r) || t < 0.0 {
                continue;
            }
            if let Some((ei, a)) = seis.strongest_at(t, dt * 2.0, scratch) {
                let reach = (a * 1.1).min(CLIP) + 0.25;
                let off = (lf - r as f64).abs() as f32;
                let score = a / (1.0 + off);
                if off <= reach && a > 2.5 * seis.noise.base && best.is_none_or(|b| score > b.1) {
                    best = Some((ei, score));
                }
            }
        }
        best.map(|(ei, _)| seis.events[ei].q as usize).filter(|&q| q < w.quakes.len())
    }
}
