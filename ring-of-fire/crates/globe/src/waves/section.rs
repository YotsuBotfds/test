//! The cross-section: Earth cut through the source and the centre, with the solved
//! travel-time fields shown as glowing wavefronts.
//!
//! Each solved field is resampled once per size or source into per-pixel arrival
//! times (u16, 1/20 s) and amplitudes (u8). A frame then only compares those against
//! the clock, tile by tile, skipping tiles no front or wake is crossing, and composites
//! the result over a background painted once. There is no full-frame bloom pass: the
//! glow is part of the pulse shape, which is defined in time, so its width follows the
//! local wave speed.
//!
//! Layout: the source is at the top. Ray paths for P are drawn on the right half and
//! for S on the left, like the classic textbook figure; the fronts are symmetric.

use super::model::{layer_at, speed, Wave, R_CMB, R_EARTH, R_ICB};
use super::rays::{shells, Kind};
use super::solve::{grid, Info, Solution, F_CORE, F_OUTER, F_PKIKP, F_PKP, F_S, N_FIELDS};
use crate::color::{hex, mix, to_srgb, Rgb};
use crate::gfx::{hash, smoothstep, v3, Frame};

/// Time quantum of the per-pixel caches, s.
pub const TQ: f32 = 0.05;
const NONE: u16 = u16::MAX;
const TILE: usize = 16;
/// Pulse table: LEAD quanta ahead of the front (a faint halo), then crest, ripples, wake.
const LEAD: usize = 80;
const TRAIL_S: f32 = 130.0;
const LUT_LEN: usize = LEAD + (TRAIL_S / TQ) as usize;
/// Amplitude (1/km) shown at full brightness, per wave type, and the decades of
/// dynamic range below it before a front fades out.
const A_REF_P: f32 = 3.0e-4;
const A_REF_S: f32 = 1.2e-4;
const DECADES: f32 = 2.3;

/// A listener on the surface, as the page gives it.
#[derive(Clone, Copy, Default, PartialEq)]
pub struct Listener {
    /// Epicentral distance, degrees; side -1 (left half) or 1 (right half).
    pub delta: f32,
    pub side: f32,
    /// First P-type and S arrival times, s (infinite if none).
    pub p: f32,
    pub s: f32,
    pub hot: bool,
}

/// A listener's two rays, in screen px with the time each point is reached.
#[derive(Clone, Default)]
struct Track {
    l: Listener,
    p_path: Vec<[f32; 3]>,
    s_path: Vec<[f32; 3]>,
}

#[derive(Clone, Copy, PartialEq)]
pub struct Opts {
    pub rays: bool,
    pub fronts_p: bool,
    pub fronts_s: bool,
}

impl Default for Opts {
    fn default() -> Self {
        Opts { rays: true, fronts_p: true, fronts_s: true }
    }
}

pub struct Section {
    pub frame: Frame,
    pub cx: f32,
    pub cy: f32,
    /// Earth's radius in px.
    pub rad: f32,
    t: Vec<Vec<u16>>,
    a: Vec<Vec<u8>>,
    /// Per tile and field: (earliest, latest) arrival in quanta, NONE if absent.
    tiles: Vec<[(u16, u16); N_FIELDS]>,
    tw: usize,
    th: usize,
    lut_p: Vec<f32>,
    lut_s: Vec<f32>,
    tone: Vec<u8>,
    key: (usize, usize, u64, bool),
    pub opts: Opts,
    info: Info,
    pub depth: f32,
    /// Earth's radius as a fraction of the smaller canvas side.
    pub disc: f32,
    /// Time spent in the last prepare: resample, background, listener rays (ms, native only).
    pub prep_ms: [f64; 3],
    listeners: Vec<Listener>,
    tracks: Vec<Track>,
    tracks_key: (usize, usize, u64, usize),
    // Per-frame tile buffers.
    bp: Vec<f32>,
    bs: Vec<f32>,
    /// Bounding boxes of what was drawn in `frame.light` this frame and the last.
    dirty: [i32; 4],
    prev_dirty: [i32; 4],
}

impl Default for Section {
    fn default() -> Self {
        Self::new()
    }
}

/// Brightness of a front `tau` seconds after it passed (negative: before it arrives).
/// `k` stretches it in time so it keeps about the same width in pixels at any size.
fn pulse(tau: f32, k: f32) -> f32 {
    let x = tau / k;
    let crest = (-((x - 1.0) / 1.05).powi(2)).exp();
    let halo = 0.10 * (-(x - 1.0).abs() / 2.0).exp();
    if x < 1.0 {
        return crest + halo;
    }
    // One echo behind the crest, then a smooth glow that dies away.
    let echo = 0.32 * (-((x - 7.0) / 1.7).powi(2)).exp();
    let wake = 0.11 * (-(x - 1.0) / 28.0).exp() * smoothstep(0.0, 4.0, x - 1.0);
    let fade = 1.0 - smoothstep(TRAIL_S * 0.6, TRAIL_S, tau);
    (crest + halo + echo + wake) * fade
}

impl Section {
    pub fn new() -> Self {
        let tone = (0..4096)
            .map(|i| {
                let x = i as f32 / 4096.0 * 8.0;
                (to_srgb(1.0 - (-x).exp()) * 255.0 + 0.5) as u8
            })
            .collect();
        Section {
            frame: Frame::new(1, 1),
            cx: 0.0,
            cy: 0.0,
            rad: 1.0,
            t: vec![Vec::new(); N_FIELDS],
            a: vec![Vec::new(); N_FIELDS],
            tiles: Vec::new(),
            tw: 0,
            th: 0,
            lut_p: Vec::new(),
            lut_s: Vec::new(),
            tone,
            key: (0, 0, 0, false),
            opts: Opts::default(),
            info: Info::default(),
            depth: 0.0,
            disc: 0.41,
            prep_ms: [0.0; 3],
            listeners: Vec::new(),
            tracks: Vec::new(),
            tracks_key: (0, 0, 0, 0),
            bp: vec![0.0; TILE * TILE],
            bs: vec![0.0; TILE * TILE],
            dirty: [0; 4],
            prev_dirty: [0; 4],
        }
    }

    pub fn resize(&mut self, w: usize, h: usize) {
        self.frame.resize(w, h);
        let (w, h) = (self.frame.w, self.frame.h);
        self.cx = w as f32 / 2.0;
        self.cy = h as f32 / 2.0;
        self.rad = self.disc * w.min(h) as f32;
        self.key.0 = 0;
        self.frame.light.fill(0.0);
        self.dirty = [0; 4];
        self.prev_dirty = [0; 4];
    }

    /// Screen position of (radius km, angle from the source rad, side).
    pub fn to_screen(&self, r: f32, th: f32, side: f32) -> [f32; 2] {
        let k = self.rad * r / R_EARTH as f32;
        [self.cx + side * k * th.sin(), self.cy - k * th.cos()]
    }

    /// (radius km, angle from the source rad) under a pixel.
    pub fn from_screen(&self, x: f32, y: f32) -> (f32, f32) {
        let (dx, dy) = (x - self.cx, y - self.cy);
        let r = (dx * dx + dy * dy).sqrt() / self.rad * R_EARTH as f32;
        (r, dx.abs().atan2(-dy))
    }

    /// Rebuilds the per-pixel caches and the background for a solution, if needed.
    pub fn prepare(&mut self, sol: &Solution) {
        let key = (self.frame.w, self.frame.h, sol.depth.to_bits(), self.opts.rays);
        if key != self.key {
            let resampled = (key.0, key.1, key.2) != (self.key.0, self.key.1, self.key.2);
            self.key = key;
            self.depth = sol.depth as f32;
            self.info = sol.info;
            let t0 = super::solve::now_ms();
            if resampled {
                let k = (360.0 / self.rad).clamp(0.55, 2.0);
                self.lut_p = (0..LUT_LEN).map(|i| pulse((i as f32 - LEAD as f32) * TQ, k)).collect();
                self.lut_s = (0..LUT_LEN).map(|i| pulse((i as f32 - LEAD as f32) * TQ, k * 1.6)).collect();
                self.sample(sol);
            }
            let t1 = super::solve::now_ms();
            self.paint_bg();
            self.prep_ms[0] = t1 - t0;
            self.prep_ms[1] = super::solve::now_ms() - t1;
        }
        let tk = (self.frame.w, self.frame.h, sol.depth.to_bits(), self.listeners.len());
        if tk != self.tracks_key {
            self.tracks_key = tk;
            let t0 = super::solve::now_ms();
            self.build_tracks();
            self.prep_ms[2] = super::solve::now_ms() - t0;
        } else {
            // Times and highlights can change without the geometry changing.
            for (tr, l) in self.tracks.iter_mut().zip(&self.listeners) {
                tr.l = *l;
            }
        }
    }

    /// Replaces the listeners. Their ray paths are traced on the next `prepare`.
    pub fn set_listeners(&mut self, ls: &[Listener]) {
        let geometry_changed = ls.len() != self.listeners.len()
            || ls.iter().zip(&self.listeners).any(|(a, b)| a.delta != b.delta || a.side != b.side || a.p.is_finite() != b.p.is_finite());
        self.listeners = ls.to_vec();
        if geometry_changed {
            self.tracks_key.3 = usize::MAX;
        }
    }

    fn sample(&mut self, sol: &Solution) {
        let g = grid();
        let (w, h) = (self.frame.w, self.frame.h);
        for f in 0..N_FIELDS {
            self.t[f].clear();
            self.t[f].resize(w * h, NONE);
            self.a[f].clear();
            self.a[f].resize(w * h, 0);
        }
        self.tw = w.div_ceil(TILE);
        self.th = h.div_ceil(TILE);
        self.tiles = vec![[(NONE, 0); N_FIELDS]; self.tw * self.th];
        let jt = g.r.len() - 1;
        // Ring index as a function of radius, tabulated finely.
        let lut_n = 4096;
        let ring_lut: Vec<f32> = (0..=lut_n).map(|k| g.ring_at(R_EARTH * k as f64 / lut_n as f64) as f32).collect();
        let inv_dth = (1.0 / g.dth) as f32;
        let fields = &sol.fields;
        // Display brightness per grid node, on a log scale: a front at the reference
        // amplitude is full brightness, DECADES weaker is dark.
        let disp: Vec<Vec<f32>> = fields
            .iter()
            .enumerate()
            .map(|(f, field)| {
                let aref = if f == F_S { A_REF_S } else { A_REF_P };
                field
                    .amp
                    .iter()
                    .zip(&field.t)
                    .map(|(&a, &t)| if t.is_finite() && a > 0.0 { (1.0 + (a / aref).log10() / DECADES).clamp(0.0, 1.0) } else { 0.0 })
                    .collect()
            })
            .collect();
        let (cx, cy, rad) = (self.cx, self.cy, self.rad);
        let km = R_EARTH as f32 / rad;
        for y in 0..h {
            let dy = y as f32 + 0.5 - cy;
            for x in 0..w {
                let dx = x as f32 + 0.5 - cx;
                let r = (dx * dx + dy * dy).sqrt() * km;
                if r > R_EARTH as f32 {
                    continue;
                }
                let th = fast_atan2(dx.abs(), -dy);
                let q = r / R_EARTH as f32 * lut_n as f32;
                let qi = (q as usize).min(lut_n - 1);
                let fj = ring_lut[qi] + (ring_lut[qi + 1] - ring_lut[qi]) * (q - qi as f32);
                let fi = (th * inv_dth).min((g.nt - 1) as f32);
                let j = (fj as usize).min(jt - 1);
                let i = (fi as usize).min(g.nt - 2);
                let (u, v) = (fj - j as f32, fi - i as f32);
                let wts = [(1.0 - u) * (1.0 - v), (1.0 - u) * v, u * (1.0 - v), u * v];
                let k = y * w + x;
                let mut tv = [f32::INFINITY; N_FIELDS];
                let mut av = [0.0f32; N_FIELDS];
                for (f, field) in fields.iter().enumerate() {
                    if j + 1 < field.j0 || j > field.j1 || i + 1 < field.i0 || i > field.i1 {
                        continue;
                    }
                    let fw = field.width();
                    let (mut tt, mut ww, mut aa) = (0.0, 0.0, 0.0);
                    for (q, (dj, di)) in [(0, 0), (0, 1), (1, 0), (1, 1)].into_iter().enumerate() {
                        let (a, b) = (j + dj, i + di);
                        if a < field.j0 || a > field.j1 || b < field.i0 || b > field.i1 || wts[q] <= 0.0 {
                            continue;
                        }
                        let idx = (a - field.j0) * fw + (b - field.i0);
                        let tq = field.t[idx];
                        if tq.is_finite() {
                            tt += tq * wts[q];
                            aa += disp[f][idx] * wts[q];
                            ww += wts[q];
                        }
                    }
                    // Only where most of the stencil is inside the field's domain.
                    if ww > 0.55 {
                        tv[f] = tt / ww;
                        av[f] = aa / ww;
                    }
                }
                // The whole-core and outer-core fields are one wave until the inner
                // core splits them: draw the whole-core copy only where it runs ahead.
                if tv[F_CORE].is_finite() && tv[F_OUTER].is_finite() {
                    av[F_CORE] *= smoothstep(1.5, 4.0, tv[F_OUTER] - tv[F_CORE]);
                }
                let ti = (y / TILE) * self.tw + x / TILE;
                for f in 0..N_FIELDS {
                    let d = av[f];
                    if d > 0.01 && tv[f].is_finite() {
                        let tq = ((tv[f] / TQ).round() as u32).min(NONE as u32 - 1) as u16;
                        self.t[f][k] = tq;
                        self.a[f][k] = (d * d.sqrt() * 255.0).round() as u8;
                        let e = &mut self.tiles[ti][f];
                        e.0 = e.0.min(tq);
                        e.1 = e.1.max(tq);
                    }
                }
            }
        }
    }

    /// The textbook ray fan: P rays on the right half, S rays on the left.
    fn fan(&self) -> Vec<(u8, Vec<[f32; 2]>)> {
        let sh = shells();
        let depth = self.depth as f64;
        let r_s = R_EARTH - depth;
        let mut pts = Vec::new();
        let mut fan = Vec::new();
        let info = self.info;
        for (wave, side) in [(Wave::P, 1.0f32), (Wave::S, -1.0)] {
            let eta_s = sh.eta_at(wave, r_s);
            // Take-off angle of the ray that grazes the core.
            let touch = if wave == Wave::P { info.p_touch } else { info.s_touch };
            let _ = touch;
            let graze = R_CMB / speed(wave, R_EARTH - R_CMB, false);
            let phi_g = (graze / eta_s).min(1.0).asin().to_degrees();
            let mut phis: Vec<f64> = Vec::new();
            // Mantle rays every 3.5 degrees of take-off, denser just above grazing.
            let mut a = phi_g + 0.35;
            while a < 86.0 {
                phis.push(a);
                a += if a < phi_g + 6.0 { 1.4 } else { 3.5 };
            }
            // Rays that meet the core: every 1.6 degrees.
            let mut a = 0.8;
            while a < phi_g {
                phis.push(a);
                a += 1.6;
            }
            for phi in phis {
                let p = eta_s * phi.to_radians().sin();
                let ray = sh.shoot(wave, depth, p, true);
                if ray.kind == Kind::Blocked && wave == Wave::P {
                    continue;
                }
                sh.path(wave, depth, p, true, &mut pts);
                let fam = match (wave, ray.kind) {
                    (Wave::S, Kind::Blocked) => 4,
                    (Wave::S, _) => 1,
                    (_, Kind::OuterCore) => 2,
                    (_, Kind::InnerCore) => 3,
                    _ => 0,
                };
                // Rays that would wrap past the antipode stop at the far side of the plane.
                let line = pts
                    .iter()
                    .take_while(|q| q[1] <= std::f32::consts::PI + 0.02)
                    .map(|q| self.to_screen(q[0], q[1], side))
                    .collect();
                fan.push((fam, line));
            }
        }
        fan
    }

    fn paint_bg(&mut self) {
        let (w, h) = (self.frame.w, self.frame.h);
        let (cx, cy, rad) = (self.cx, self.cy, self.rad);
        let s = (rad / 380.0).max(0.6);
        // Lines first, into a light buffer we composite into the background.
        self.frame.light.fill(0.0);
        let ember = hex(0xffb35c);
        let teal = hex(0x3fb8b0);
        let gold = hex(0xffd27a);
        let ink = hex(0x6b7489);
        if self.opts.rays {
            for (fam, line) in self.fan() {
                let (c, a) = match fam {
                    0 => (ember, 0.06),
                    1 => (teal, 0.07),
                    2 => (gold, 0.045),
                    3 => (mix(gold, [1.0; 3], 0.3), 0.05),
                    _ => (teal, 0.06),
                };
                for seg in line.windows(2) {
                    self.frame.line(seg[0], seg[1], c, a);
                }
                // A blocked S ray ends in a small mark on the core.
                if fam == 4 {
                    if let Some(&end) = line.last() {
                        self.frame.splat(end[0], end[1], 1.2 * s, teal, 0.35);
                    }
                }
            }
        }
        // Degree ticks around the rim, both halves.
        for deg in (0..=180).step_by(10) {
            for side in [-1.0f32, 1.0] {
                let th = (deg as f32).to_radians();
                let len = if deg % 30 == 0 { 0.022 } else { 0.011 };
                let a = self.to_screen(R_EARTH as f32 * 1.01, th, side);
                let b = self.to_screen(R_EARTH as f32 * (1.01 + len), th, side);
                self.frame.line(a, b, ink, if deg % 30 == 0 { 0.7 } else { 0.4 });
            }
        }
        // Shadow zones as arcs outside the rim: P on the right, S on the left.
        let arc = |f: &mut Frame, from: f32, to: f32, side: f32, r: f32, c: Rgb, a: f32, hw: f32| {
            let n = ((to - from).abs() * 2.0).ceil().max(2.0) as usize;
            let mut prev = None;
            for k in 0..=n {
                let th = (from + (to - from) * k as f32 / n as f32).to_radians();
                let p = [cx + side * r * th.sin(), cy - r * th.cos()];
                if let Some(q) = prev {
                    f.thick_line(q, p, hw, c, a);
                }
                prev = Some(p);
            }
        };
        let info = self.info;
        let r_arc = rad * 1.05;
        arc(&mut self.frame, info.p_shadow as f32, info.pkp_min as f32, 1.0, r_arc, ember, 0.55, 1.6 * s);
        arc(&mut self.frame, info.s_shadow as f32, 180.0, -1.0, r_arc, teal, 0.55, 1.6 * s);
        // End caps.
        for (d, side, c) in [(info.p_shadow, 1.0, ember), (info.pkp_min, 1.0, ember), (info.s_shadow, -1.0, teal)] {
            let th = (d as f32).to_radians();
            let a = [cx + side * (r_arc - 4.0 * s) * th.sin(), cy - (r_arc - 4.0 * s) * th.cos()];
            let b = [cx + side * (r_arc + 4.0 * s) * th.sin(), cy - (r_arc + 4.0 * s) * th.cos()];
            self.frame.line(a, b, c, 0.8);
        }

        let space = hex(0x04060c);
        let iface: Vec<f32> = [R_EARTH - 410.0, R_EARTH - 660.0].iter().map(|&r| r as f32 / R_EARTH as f32).collect();
        let (cmb, icb) = (R_CMB as f32 / R_EARTH as f32, R_ICB as f32 / R_EARTH as f32);
        let px_km = R_EARTH as f32 / rad;
        let light = std::mem::take(&mut self.frame.light);
        let lut_n = 2048usize;
        let rock_lut: Vec<Rgb> = (0..=lut_n).map(|k| layer_color(R_EARTH as f32 * k as f32 / lut_n as f32)).collect();
        self.frame.paint_bg(|x, y| {
            let (fx, fy) = (x as f32 + 0.5 - cx, y as f32 + 0.5 - cy);
            let d = (fx * fx + fy * fy).sqrt() / rad;
            let mut c = space;
            let hs = hash((x as u32).wrapping_mul(7919) ^ (y as u32).wrapping_mul(104_729));
            if hs < 0.0012 && d > 1.12 {
                c = v3::add(c, [0.06, 0.065, 0.08].map(|v| v * hash(hs.to_bits()).powi(2)));
            }
            if d > 1.0 && d < 1.3 {
                // Atmosphere-like rim: a tight glow plus a short haze (negligible past 1.3 R).
                let t = (d - 1.0) * rad / 3.0;
                c = v3::add(c, hex(0x1b2a4a).map(|v| v * 0.30 * (-t * t).exp()));
                c = v3::add(c, hex(0x14203a).map(|v| v * 0.22 * (-(d - 1.0) / 0.05).exp()));
            }
            let cover = ((1.0 - d) * rad + 0.5).clamp(0.0, 1.0);
            if cover > 0.0 {
                let depth = (1.0 - d.min(1.0)) * R_EARTH as f32;
                let mut rock = rock_lut[((depth / R_EARTH as f32 * lut_n as f32) as usize).min(lut_n)];
                if depth > 2891.5 && depth < 5153.5 {
                    // Slow swirls in the liquid outer core.
                    let ang = fx.atan2(-fy);
                    let sw = (ang * 7.0 + d * 38.0).sin() * (ang * 3.0 - d * 21.0).cos();
                    rock = rock.map(|v| v * (1.0 + 0.07 * sw));
                }
                c = mix(c, rock, cover);
                let line = |at: f32, wpx: f32| (1.0 - ((d - at) * rad).abs() / wpx).max(0.0);
                let ln = 0.045 * line(iface[0], 0.9) + 0.055 * line(iface[1], 0.9);
                let core = 0.16 * line(cmb, 1.1) + 0.10 * line(icb, 1.0);
                c = v3::add(c, [ln * 0.55, ln * 0.65, ln * 0.85]);
                c = v3::add(c, [core, core * 0.72, core * 0.45]);
                // The crust: a thin bright skin (35 km is only a few pixels).
                let crust = smoothstep(35.0 + px_km, 35.0, depth) * 0.10;
                c = v3::add(c, [crust * 0.9, crust * 0.82, crust * 0.7]);
            }
            let l = &light[(y * w + x) * 3..(y * w + x) * 3 + 3];
            if l[0] + l[1] + l[2] > 0.0 {
                // Soft-clip the line light so crossings do not burn out.
                c = v3::add(c, [l[0], l[1], l[2]].map(|v| 0.5 * v / (0.5 + v)));
            }
            c
        });
        self.frame.light = light;
        self.frame.light.fill(0.0);
        self.dirty = [0; 4];
        self.prev_dirty = [0; 4];
        let _ = h;
    }

    fn build_tracks(&mut self) {
        let sh = shells();
        let depth = self.depth as f64;
        let r_s = R_EARTH - depth;
        let info = self.info;
        let mut pts = Vec::new();
        let mut tracks = Vec::with_capacity(self.listeners.len());
        let to_px = |sec: &Section, pts: &[[f32; 3]], side: f32| -> Vec<[f32; 3]> {
            pts.iter()
                .map(|q| {
                    let p = sec.to_screen(q[0], q[1], side);
                    [p[0], p[1], q[2]]
                })
                .collect()
        };
        for l in &self.listeners {
            let delta = (l.delta as f64).to_radians();
            let mut tr = Track { l: *l, ..Default::default() };
            // P: the direct ray, a diffracted path round the core, or a core phase.
            let eta_p = sh.eta_at(Wave::P, r_s);
            let g_p = R_CMB / speed(Wave::P, R_EARTH - R_CMB, false);
            if (l.delta as f64) <= info.p_shadow {
                if let Some((p, _)) = sh.find_ray(Wave::P, depth, delta, Kind::Mantle, (g_p * (1.0 + 1e-7), eta_p * (1.0 - 1e-7))) {
                    sh.path(Wave::P, depth, p, true, &mut pts);
                    tr.p_path = to_px(self, &pts, l.side);
                }
            } else if (l.delta as f64) < info.pkikp_min {
                tr.p_path = to_px(self, &diffracted(Wave::P, depth, l.delta as f64, &info), l.side);
            } else {
                let eta_ic = R_ICB / speed(Wave::P, R_EARTH - R_ICB, true);
                let eta_oc = R_ICB / speed(Wave::P, R_EARTH - R_ICB, false);
                let a = sh.find_ray(Wave::P, depth, delta, Kind::InnerCore, (1e-6, eta_ic * (1.0 - 1e-7)));
                let b = sh.find_ray(Wave::P, depth, delta, Kind::OuterCore, (eta_oc * (1.0 + 1e-7), g_p * (1.0 - 1e-7)));
                let best = match (a, b) {
                    (Some(a), Some(b)) => Some(if a.1 <= b.1 { a } else { b }),
                    (x, None) | (None, x) => x,
                };
                if let Some((p, _)) = best {
                    sh.path(Wave::P, depth, p, true, &mut pts);
                    tr.p_path = to_px(self, &pts, l.side);
                }
            }
            if (l.delta as f64) <= info.s_shadow {
                let eta_s = sh.eta_at(Wave::S, r_s);
                let g_s = R_CMB / speed(Wave::S, R_EARTH - R_CMB, false);
                if let Some((p, _)) = sh.find_ray(Wave::S, depth, delta, Kind::Mantle, (g_s * (1.0 + 1e-7), eta_s * (1.0 - 1e-7))) {
                    sh.path(Wave::S, depth, p, true, &mut pts);
                    tr.s_path = to_px(self, &pts, l.side);
                }
            }
            tracks.push(tr);
        }
        self.tracks = tracks;
    }

    /// Renders the frame at `t` seconds after the origin time.
    pub fn render(&mut self, t: f32) {
        let (w, h) = (self.frame.w, self.frame.h);
        // Clear what the last two frames drew (the light layer only holds sprites).
        for d in [self.prev_dirty, self.dirty] {
            clear_rect(&mut self.frame.light, w, h, d);
        }
        self.prev_dirty = self.dirty;
        self.dirty = [i32::MAX, i32::MAX, i32::MIN, i32::MIN];
        self.draw_tracks(t);
        self.draw_sprites(t);
        self.composite(t);
    }

    fn mark(&mut self, x: f32, y: f32, r: f32) {
        let d = &mut self.dirty;
        d[0] = d[0].min((x - r).floor() as i32);
        d[1] = d[1].min((y - r).floor() as i32);
        d[2] = d[2].max((x + r).ceil() as i32 + 1);
        d[3] = d[3].max((y + r).ceil() as i32 + 1);
    }

    fn draw_tracks(&mut self, t: f32) {
        let s = (self.rad / 380.0).max(0.6);
        let tracks = std::mem::take(&mut self.tracks);
        for tr in &tracks {
            for (path, c, show) in [(&tr.p_path, hex(0xffb35c), self.opts.fronts_p), (&tr.s_path, hex(0x3fb8b0), self.opts.fronts_s)] {
                if path.len() < 2 || !show {
                    continue;
                }
                let hot = tr.l.hot;
                // The part of the ray the wave has already travelled, fading with age.
                let base = if hot { 0.55 } else { 0.13 };
                let mut head = None;
                for seg in path.windows(2) {
                    let (a, b) = (seg[0], seg[1]);
                    if a[2] > t {
                        break;
                    }
                    let mut end = [b[0], b[1]];
                    if b[2] > t {
                        let u = (t - a[2]) / (b[2] - a[2]).max(1e-6);
                        end = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
                        head = Some(end);
                    }
                    let age = t - a[2];
                    let alpha = base * (0.45 + 0.55 * (-age / 160.0).exp());
                    self.mark(a[0], a[1], 2.0);
                    self.mark(end[0], end[1], 2.0);
                    if hot {
                        self.frame.thick_line([a[0], a[1]], end, 0.9 * s, c, alpha);
                    } else {
                        self.frame.line([a[0], a[1]], end, c, alpha);
                    }
                }
                if hot && head.is_none() && path[0][2] > t {
                    // Not left yet: preview the whole path faintly.
                    for seg in path.windows(2) {
                        self.frame.line([seg[0][0], seg[0][1]], [seg[1][0], seg[1][1]], c, 0.12);
                        self.mark(seg[0][0], seg[0][1], 1.0);
                    }
                }
                if let Some(p) = head {
                    self.mark(p[0], p[1], 8.0 * s);
                    self.frame.splat(p[0], p[1], 1.6 * s, mix(c, [1.0; 3], 0.5), if hot { 1.4 } else { 0.8 });
                }
            }
        }
        self.tracks = tracks;
    }

    fn draw_sprites(&mut self, t: f32) {
        let s = (self.rad / 380.0).max(0.6);
        let ember = hex(0xffb35c);
        let teal = hex(0x3fb8b0);
        let white = [1.0, 0.96, 0.9];
        // The source: a star at its depth, flaring at the origin time.
        let src = self.to_screen(R_EARTH as f32 - self.depth, 0.0, 1.0);
        let flare = 1.0 + 5.0 * (-t.max(0.0) / 20.0).exp();
        self.mark(src[0], src[1], 34.0 * s);
        let f = &mut self.frame;
        f.splat(src[0], src[1], 2.0 * s, white, 1.5);
        f.splat(src[0], src[1], 6.5 * s, ember, 0.22 * flare);
        let spike = 13.0 * s * flare.sqrt();
        for (dx, dy) in [(1.0f32, 0.0f32), (0.0, 1.0)] {
            f.line([src[0] - dx * spike, src[1] - dy * spike], [src[0] + dx * spike, src[1] + dy * spike], white, 0.32);
        }
        // Listeners on the rim: dim until P arrives, ember after P, teal after S.
        let ls = self.listeners.clone();
        for l in &ls {
            let th = l.delta.to_radians();
            let p = self.to_screen(R_EARTH as f32 * 1.004, th, l.side);
            let q = self.to_screen(R_EARTH as f32 * 1.068, th, l.side);
            self.mark(p[0], p[1], 26.0 * s);
            self.mark(q[0], q[1], 8.0 * s);
            let (since_p, since_s) = (t - l.p, t - l.s);
            let (mut c, mut a) = (hex(0x8a93a8), 0.55);
            let mut glow = 0.0;
            let mut gc = ember;
            if since_p >= 0.0 {
                c = ember;
                a = 1.0;
                glow = (-since_p / 30.0).exp();
            }
            if since_s >= 0.0 {
                c = mix(ember, teal, 0.8);
                glow = (-since_s / 30.0).exp();
                gc = teal;
            }
            if l.hot {
                a *= 1.5;
            }
            let f = &mut self.frame;
            f.thick_line(p, q, 0.6 * s, c, a);
            f.splat(q[0], q[1], 1.5 * s, c, a);
            if glow > 0.01 {
                f.splat(p[0], p[1], 10.0 * s, gc, 0.45 * glow);
                f.splat(p[0], p[1], 2.2 * s, white, glow);
            }
        }
    }

    fn composite(&mut self, t: f32) {
        let (w, h) = (self.frame.w, self.frame.h);
        let tu = (t / TQ).round() as i32;
        let ember = hex(0xffb35c);
        let teal = hex(0x3fb8b0);
        let (gp, gs) = (2.1f32, 2.3f32);
        let d = self.dirty;
        let show = [self.opts.fronts_p, self.opts.fronts_s];
        for ty in 0..self.th {
            for tx in 0..self.tw {
                let (x0, y0) = (tx * TILE, ty * TILE);
                let (x1, y1) = ((x0 + TILE).min(w), (y0 + TILE).min(h));
                let tile = self.tiles[ty * self.tw + tx];
                let mut any = false;
                for (f, &(lo, hi)) in tile.iter().enumerate() {
                    let fam = (f == F_S) as usize;
                    if lo == NONE || !show[fam] {
                        continue;
                    }
                    // Skip if the front has not reached this tile or its wake has passed.
                    if tu + (LEAD as i32) < lo as i32 || tu - hi as i32 >= (LUT_LEN - LEAD) as i32 {
                        continue;
                    }
                    if !any {
                        self.bp.fill(0.0);
                        self.bs.fill(0.0);
                        any = true;
                    }
                    let (lut, buf) = if fam == 1 { (&self.lut_s, &mut self.bs) } else { (&self.lut_p, &mut self.bp) };
                    let (tf, af) = (&self.t[f], &self.a[f]);
                    for y in y0..y1 {
                        let row = y * w;
                        let brow = (y - y0) * TILE - x0;
                        for x in x0..x1 {
                            let tt = tf[row + x];
                            if tt == NONE {
                                continue;
                            }
                            let dd = tu - tt as i32 + LEAD as i32;
                            if dd >= 0 && (dd as usize) < LUT_LEN {
                                buf[brow + x] += af[row + x] as f32 * lut[dd as usize];
                            }
                        }
                    }
                }
                let sprite = !(x1 as i32 <= d[0] || x0 as i32 >= d[2] || y1 as i32 <= d[1] || y0 as i32 >= d[3]);
                for y in y0..y1 {
                    let row = y * w;
                    if !any && !sprite {
                        self.frame.px[row + x0..row + x1].copy_from_slice(&self.frame.bg[row + x0..row + x1]);
                        continue;
                    }
                    let brow = (y - y0) * TILE;
                    for x in x0..x1 {
                        let k = row + x;
                        let (vp, vs) = if any {
                            (self.bp[brow + x - x0] * (gp / 255.0), self.bs[brow + x - x0] * (gs / 255.0))
                        } else {
                            (0.0, 0.0)
                        };
                        let l = &self.frame.light[k * 3..k * 3 + 3];
                        let mut r = l[0] + vp * ember[0] + vs * teal[0];
                        let mut g = l[1] + vp * ember[1] + vs * teal[1];
                        let mut b = l[2] + vp * ember[2] + vs * teal[2];
                        let bg = self.frame.bg[k];
                        if r.max(g).max(b) < 0.002 {
                            self.frame.px[k] = bg;
                            continue;
                        }
                        // Bright crests bleed towards white, like hot metal.
                        let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                        if lum > 0.8 {
                            let over = (lum - 0.8) * 0.45;
                            r += over;
                            g += over;
                            b += over;
                        }
                        let tone = &self.tone;
                        let tc = |v: f32| tone[(v * 512.0).min(4095.0) as usize] as u32;
                        let add = |v: u32, sh: u32| (((bg >> sh) & 0xff) + v).min(255) << sh;
                        self.frame.px[k] = 0xff00_0000 | add(tc(r), 0) | add(tc(g), 8) | add(tc(b), 16);
                    }
                }
            }
        }
    }

    /// Arrival time of field `f` at a pixel, s (NaN if none or too faint to draw).
    pub fn probe(&self, f: usize, x: usize, y: usize) -> f32 {
        let (w, h) = (self.frame.w, self.frame.h);
        if f >= N_FIELDS || x >= w || y >= h || self.t[f].is_empty() {
            return f32::NAN;
        }
        let t = self.t[f][y * w + x];
        if t == NONE {
            f32::NAN
        } else {
            t as f32 * TQ
        }
    }

    /// Per-pixel display amplitude (0-255) and time (quanta) of a field, for debugging.
    pub fn debug_field(&self, f: usize) -> (&[u16], &[u8]) {
        (&self.t[f], &self.a[f])
    }

    pub fn pkikp_field() -> usize {
        F_PKIKP
    }
    pub fn pkp_field() -> usize {
        F_PKP
    }
}

/// The diffracted path to a listener in the shadow: the grazing ray down to the core,
/// along the core's surface, and the grazing ray back up. Points are (r, theta, t).
pub fn diffracted(w: Wave, depth: f64, delta_deg: f64, info: &Info) -> Vec<[f32; 3]> {
    let sh = shells();
    let r_s = R_EARTH - depth;
    let graze = R_CMB / speed(w, R_EARTH - R_CMB, false) * (1.0 + 1e-7);
    let mut down = Vec::new();
    let (_, d_touch, t_touch, _) = sh.descend_with(w, graze, r_s, 0.006, |r, d, t| down.push([r as f32, d as f32, t as f32]));
    let (d_up, t_up) = sh.above(w, graze, r_s);
    let mut out = vec![[r_s as f32, 0.0, 0.0]];
    out.extend_from_slice(&down);
    // Along the core at the speed just above it.
    let v = speed(w, R_EARTH - R_CMB, false);
    let shadow = info.p_shadow.to_radians();
    let creep = (delta_deg.to_radians() - shadow).max(0.0);
    let n = (creep.to_degrees().ceil() as usize).max(1);
    for k in 1..=n {
        let a = creep * k as f64 / n as f64;
        out.push([R_CMB as f32, (d_touch + a) as f32, (t_touch + a * R_CMB / v) as f32]);
    }
    let (th0, t0) = (d_touch + creep, t_touch + creep * R_CMB / v);
    for q in down.iter().rev().skip(1) {
        out.push([q[0], (th0 + d_touch - q[1] as f64) as f32, (t0 + t_touch - q[2] as f64) as f32]);
    }
    out.push([r_s as f32, (th0 + d_touch) as f32, (t0 + t_touch) as f32]);
    out.push([R_EARTH as f32, (th0 + d_touch + d_up) as f32, (t0 + t_touch + t_up) as f32]);
    out
}

/// atan2 to about 1e-5 rad, without a call into software libm (slow on wasm).
pub fn fast_atan2(y: f32, x: f32) -> f32 {
    let (ax, ay) = (x.abs(), y.abs());
    let a = ax.min(ay) / ax.max(ay).max(1e-30);
    let s = a * a;
    let mut r = ((-0.046_496_475 * s + 0.159_314_22) * s - 0.327_622_76) * s * a + a;
    if ay > ax {
        r = std::f32::consts::FRAC_PI_2 - r;
    }
    if x < 0.0 {
        r = std::f32::consts::PI - r;
    }
    if y < 0.0 {
        -r
    } else {
        r
    }
}

fn clear_rect(light: &mut [f32], w: usize, h: usize, d: [i32; 4]) {
    let (x0, y0) = (d[0].max(0) as usize, d[1].max(0) as usize);
    let (x1, y1) = ((d[2].max(0) as usize).min(w), (d[3].max(0) as usize).min(h));
    if x0 >= x1 || y0 >= y1 {
        return;
    }
    for y in y0..y1 {
        light[(y * w + x0) * 3..(y * w + x1) * 3].fill(0.0);
    }
}

/// Rock colour by layer, brightening with P speed, linear RGB.
pub fn layer_color(depth: f32) -> Rgb {
    let vp = speed(Wave::P, depth as f64, true) as f32;
    let l = layer_at(depth as f64);
    match l {
        0..=3 => {
            // Mantle: cold slate at the top, warming towards the core.
            let u = depth / 2891.5;
            let base = mix(hex(0x0c1322), hex(0x181524), u.powf(1.3));
            let k = 0.78 + 0.32 * (vp - 8.0) / 5.7;
            let tz = if l == 2 { 1.07 } else { 1.0 };
            base.map(|v| v * k * tz)
        }
        4 => {
            // Liquid iron: dim and warm, brighter with depth.
            let u = (depth - 2891.5) / (5153.5 - 2891.5);
            mix(hex(0x1e0f0a), hex(0x2a140b), u)
        }
        _ => {
            // Solid inner core: paler and hotter.
            let u = (depth - 5153.5) / 1217.5;
            mix(hex(0x2e2418), hex(0x3a2e1c), u)
        }
    }
}
