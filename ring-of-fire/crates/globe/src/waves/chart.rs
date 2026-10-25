//! Travel-time chart: when each wave reaches the surface, against distance from the
//! source. The curves are the grid solver's surface arrivals, drawn brighter where
//! the wave is stronger, so the shadow zones show as gaps.

use super::section::Listener;
use super::solve::{grid, Solution, F_P, F_PKIKP, F_PKP, F_S};
use crate::color::{hex, mix};
use crate::gfx::{smoothstep, Frame};

/// Time span shown, s.
pub const T_MAX: f32 = 1500.0;

/// Reference first-arrival times for a surface source (iasp91 tables, rounded):
/// (phase 0 = P / 1 = S, distance deg, time s).
pub const REFERENCE: [(u8, f32, f32); 5] = [(0, 30.0, 370.0), (0, 60.0, 600.0), (0, 90.0, 780.0), (1, 30.0, 670.0), (1, 60.0, 1090.0)];

pub struct Chart {
    pub frame: Frame,
    /// Plot rectangle in px: left, top, right, bottom.
    pub rect: [f32; 4],
    key: (usize, usize, u64),
    /// Per curve: colour family (0 P, 1 S) and points (x, y, brightness).
    curves: Vec<(u8, Vec<[f32; 3]>)>,
    shallow: bool,
    /// Canvas pixels per CSS pixel.
    k: f32,
}

impl Default for Chart {
    fn default() -> Self {
        Self::new()
    }
}

impl Chart {
    pub fn new() -> Self {
        Chart { frame: Frame::new(1, 1), rect: [0.0; 4], key: (0, 0, 0), curves: Vec::new(), shallow: true, k: 1.0 }
    }

    /// `k` is canvas pixels per CSS pixel: the margins hold HTML axis labels.
    pub fn resize(&mut self, w: usize, h: usize, k: f32) {
        self.frame.resize(w, h);
        let (w, h) = (self.frame.w as f32, self.frame.h as f32);
        self.k = k.clamp(0.5, 4.0);
        let s = self.k;
        self.rect = [54.0 * s, 10.0 * s, w - 14.0 * s, h - 24.0 * s];
        self.key = (0, 0, 0);
    }

    pub fn x(&self, delta: f32) -> f32 {
        self.rect[0] + (self.rect[2] - self.rect[0]) * delta / 180.0
    }
    pub fn y(&self, t: f32) -> f32 {
        self.rect[3] - (self.rect[3] - self.rect[1]) * t / T_MAX
    }

    pub fn prepare(&mut self, sol: &Solution) {
        let key = (self.frame.w, self.frame.h, sol.depth.to_bits());
        if key == self.key {
            return;
        }
        self.key = key;
        self.shallow = sol.depth < 70.0;
        let g = grid();
        let info = sol.info;
        let disp = |a: f32, aref: f32| (1.0 + (a / aref).max(1e-12).log10() / 2.3).clamp(0.0, 1.0);
        let mut curves = Vec::new();
        for (field, fam, aref, from) in [
            (F_P, 0u8, 3.0e-4f32, 0.0f64),
            (F_S, 1, 1.2e-4, 0.0),
            (F_PKIKP, 0, 3.0e-4, info.pkikp_min - 1.0),
            (F_PKP, 0, 3.0e-4, info.pkp_min - 6.0),
        ] {
            let mut pts = Vec::new();
            for i in 0..g.nt {
                let d = (i as f64 * g.dth).to_degrees();
                if d < from {
                    continue;
                }
                let (t, a) = sol.surface(field, d);
                if !t.is_finite() || t as f32 > T_MAX * 1.02 {
                    if pts.len() > 1 {
                        curves.push((fam, std::mem::take(&mut pts)));
                    }
                    pts.clear();
                    continue;
                }
                // Surface amplitudes fall off steeply near the source; lift them so
                // the curve reads, and keep the shadows dark.
                let b = disp(a as f32 * 6.0, aref).powf(0.8);
                pts.push([self.x(d as f32), self.y(t as f32), b]);
            }
            if pts.len() > 1 {
                curves.push((fam, pts));
            }
        }
        self.curves = curves;
        self.paint_bg(sol);
    }

    fn paint_bg(&mut self, sol: &Solution) {
        let info = sol.info;
        let [x0, y0, x1, y1] = self.rect;
        let (px0, px1) = (self.x(info.p_shadow as f32), self.x(info.pkp_min as f32));
        let sx0 = self.x(info.s_shadow as f32);
        let well = hex(0x070a13);
        let ember = hex(0xffb35c);
        let teal = hex(0x3fb8b0);
        let grid_c = hex(0x1a2236);
        let ys: Vec<f32> = (0..=25).step_by(5).map(|m| self.y(m as f32 * 60.0)).collect();
        let xs: Vec<f32> = (0..=180).step_by(30).map(|d| self.x(d as f32)).collect();
        self.frame.paint_bg(|x, y| {
            let (fx, fy) = (x as f32 + 0.5, y as f32 + 0.5);
            let mut c = well;
            let inside = fx >= x0 && fx <= x1 && fy >= y0 && fy <= y1;
            if inside {
                // Shadow zones: P (ember) and S (teal) as faint bands, S hatched.
                if fx >= px0 && fx <= px1 {
                    c = mix(c, ember, 0.035);
                }
                if fx >= sx0 && ((fx + fy) as i32).rem_euclid(7) == 0 {
                    c = mix(c, teal, 0.10);
                }
                for &gy in &ys {
                    if (fy - gy).abs() < 0.5 {
                        c = mix(c, grid_c, 0.9);
                    }
                }
                for &gx in &xs {
                    if (fx - gx).abs() < 0.5 {
                        c = mix(c, grid_c, 0.9);
                    }
                }
            }
            // Axes.
            if ((fy - y1).abs() < 0.6 && fx >= x0 && fx <= x1) || ((fx - x0).abs() < 0.6 && fy >= y0 && fy <= y1) {
                c = hex(0x2a3550);
            }
            c
        });
    }

    pub fn render(&mut self, t: f32, listeners: &[Listener], hover: f32) {
        let f = &mut self.frame;
        f.clear();
        let s = self.k;
        let ember = hex(0xffb35c);
        let teal = hex(0x3fb8b0);
        let white = [1.0, 0.96, 0.9];
        let [x0, y0, x1, y1] = self.rect;
        // Reference points from the iasp91 tables (surface source only).
        if self.shallow {
            for &(ph, d, tt) in &REFERENCE {
                let (x, y) = (x0 + (x1 - x0) * d / 180.0, y1 - (y1 - y0) * tt / T_MAX);
                let c = if ph == 0 { ember } else { teal };
                let k = 3.5 * s;
                f.line([x - k, y], [x + k, y], mix(c, white, 0.5), 0.75);
                f.line([x, y - k], [x, y + k], mix(c, white, 0.5), 0.75);
            }
        }
        let yt = y1 - (y1 - y0) * t / T_MAX;
        for (fam, pts) in &self.curves {
            let c = if *fam == 0 { ember } else { teal };
            for seg in pts.windows(2) {
                let (a, b) = (seg[0], seg[1]);
                let bright = 0.5 * (a[2] + b[2]);
                if bright < 0.02 {
                    continue;
                }
                // Drawn brighter once the clock has passed that arrival.
                let past = if a[1] >= yt { 1.0 } else { 0.38 };
                f.thick_line([a[0], a[1]], [b[0], b[1]], 0.9 * s, c, bright * past * 0.85);
            }
        }
        // The clock: a horizontal line, with a dot wherever a front is at the surface.
        if t > 0.0 && t < T_MAX {
            f.line([x0, yt], [x1, yt], white, 0.5);
            for (fam, pts) in &self.curves {
                let c = if *fam == 0 { ember } else { teal };
                for seg in pts.windows(2) {
                    let (a, b) = (seg[0], seg[1]);
                    if (a[1] - yt) * (b[1] - yt) <= 0.0 && a[1] != b[1] {
                        let u = (yt - a[1]) / (b[1] - a[1]);
                        let br = a[2] + (b[2] - a[2]) * u;
                        if br > 0.05 {
                            let x = a[0] + (b[0] - a[0]) * u;
                            f.splat(x, yt, 2.2 * s, mix(c, white, 0.35), 0.6 + 0.8 * br);
                        }
                    }
                }
            }
        }
        // Listeners: a tick on the distance axis and a dot at each arrival.
        for l in listeners {
            let x = x0 + (x1 - x0) * l.delta / 180.0;
            let a = if l.hot { 1.0 } else { 0.45 };
            f.line([x, y1 + 1.0], [x, y1 + 5.0 * s], white, a);
            for (tt, c) in [(l.p, ember), (l.s, teal)] {
                if tt.is_finite() && tt < T_MAX {
                    let y = y1 - (y1 - y0) * tt / T_MAX;
                    let on = smoothstep(-1.0, 1.0, t - tt);
                    f.circle(x, y, 2.6 * s, c, 0.5 + 0.4 * a);
                    if on > 0.0 {
                        f.disc(x, y, 2.0 * s, mix(c, white, 0.3), on * (0.6 + 0.4 * a));
                    }
                    if l.hot {
                        f.circle(x, y, 5.0 * s, white, 0.6);
                    }
                }
            }
        }
        if hover >= 0.0 {
            let x = x0 + (x1 - x0) * hover.min(180.0) / 180.0;
            f.line([x, y0], [x, y1], white, 0.35);
        }
        f.finish();
    }
}
