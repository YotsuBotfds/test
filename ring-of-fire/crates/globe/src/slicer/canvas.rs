//! The Slicer's drawing surface: the shared `Frame` (background + additive light),
//! a quarter-resolution glow buffer, and per-row dirty spans.
//!
//! Every primitive goes through a wrapper here that records the pixels it can touch,
//! so a frame only clears and tonemaps the spans that hold light; everywhere else the
//! output is a straight copy of the background. In this scene that is most of the
//! canvas, which cuts the per-frame cost to a fraction of a full-frame pass.

use crate::color::{to_srgb, Rgb};
use crate::gfx::{Frame, CUTOFF};

pub struct Canvas {
    pub frame: Frame,
    glow: Frame,
    /// Per row, the [x0, x1) span of `frame.light` written since the last `begin`.
    dirty: Vec<[u32; 2]>,
    tone: Vec<u8>,
    row: Vec<f32>,
    cols: Vec<(usize, f32)>,
}

const CLEAN: [u32; 2] = [u32::MAX, 0];

impl Canvas {
    pub fn new() -> Self {
        let tone = (0..4096)
            .map(|i| {
                // Same curve as `Frame::finish`: light v -> sRGB of 1 − e^(−v).
                let x = i as f32 / 4096.0 * 8.0;
                (to_srgb(1.0 - (-x).exp()) * 255.0 + 0.5) as u8
            })
            .collect();
        let mut c = Canvas { frame: Frame::new(1, 1), glow: Frame::new(1, 1), dirty: Vec::new(), tone, row: Vec::new(), cols: Vec::new() };
        c.resize(1, 1);
        c
    }

    pub fn resize(&mut self, w: usize, h: usize) {
        self.frame.resize(w, h);
        self.glow.resize(w.max(1).div_ceil(4), h.max(1).div_ceil(4));
        let (w, h, qw) = (self.frame.w, self.frame.h, self.glow.w);
        // Frame::resize may keep the old buffer when the size is unchanged; start clean.
        self.frame.light.fill(0.0);
        self.dirty = vec![CLEAN; h];
        self.row = vec![0.0; (qw + 1) * 3];
        self.cols = (0..w)
            .map(|x| {
                let fx = ((x as f32 + 0.5) / 4.0 - 0.5).clamp(0.0, (qw - 1) as f32);
                (fx as usize, fx - (fx as usize) as f32)
            })
            .collect();
    }

    pub fn w(&self) -> usize {
        self.frame.w
    }

    pub fn h(&self) -> usize {
        self.frame.h
    }

    /// Start a frame: zero what the last one lit.
    pub fn begin(&mut self) {
        let w = self.frame.w;
        for (y, d) in self.dirty.iter_mut().enumerate() {
            if d[0] < d[1] {
                let (a, b) = (d[0] as usize, d[1] as usize);
                self.frame.light[(y * w + a) * 3..(y * w + b) * 3].fill(0.0);
            }
            *d = CLEAN;
        }
        self.glow.clear();
    }

    /// Record that the rectangle [x0, x1] × [y0, y1] (px) may receive light.
    fn mark(&mut self, x0: f32, y0: f32, x1: f32, y1: f32) {
        let (w, h) = (self.frame.w as f32, self.frame.h as f32);
        if !(x0.is_finite() && y0.is_finite() && x1.is_finite() && y1.is_finite()) {
            return;
        }
        let xa = (x0 - 1.0).floor().clamp(0.0, w) as u32;
        let xb = (x1 + 2.0).ceil().clamp(0.0, w) as u32;
        let ya = (y0 - 1.0).floor().clamp(0.0, h) as usize;
        let yb = (y1 + 2.0).ceil().clamp(0.0, h) as usize;
        if xa >= xb {
            return;
        }
        for d in &mut self.dirty[ya..yb] {
            d[0] = d[0].min(xa);
            d[1] = d[1].max(xb);
        }
    }

    pub fn splat(&mut self, x: f32, y: f32, r: f32, c: Rgb, a: f32) {
        let e = r.max(0.7) * CUTOFF + 1.0;
        self.mark(x - e, y - e, x + e, y + e);
        self.frame.splat(x, y, r, c, a);
    }

    /// Glow splat; position in full-resolution px, radius in quarter-resolution px.
    pub fn glow_splat(&mut self, x: f32, y: f32, rq: f32, c: Rgb, a: f32) {
        let e = (rq.max(0.7) * CUTOFF + 1.5) * 4.0;
        self.mark(x - e, y - e, x + e, y + e);
        self.glow.splat(x / 4.0, y / 4.0, rq, c, a);
    }

    /// Glow line; endpoints in full-resolution px, half-width in quarter px.
    pub fn glow_line(&mut self, a: [f32; 2], b: [f32; 2], hwq: f32, c: Rgb, al: f32) {
        let e = (hwq + 2.0) * 4.0;
        self.mark(a[0].min(b[0]) - e, a[1].min(b[1]) - e, a[0].max(b[0]) + e, a[1].max(b[1]) + e);
        self.glow.thick_line([a[0] / 4.0, a[1] / 4.0], [b[0] / 4.0, b[1] / 4.0], hwq, c, al);
    }

    pub fn line(&mut self, a: [f32; 2], b: [f32; 2], c: Rgb, al: f32) {
        self.mark(a[0].min(b[0]), a[1].min(b[1]), a[0].max(b[0]), a[1].max(b[1]));
        self.frame.line(a, b, c, al);
    }

    pub fn thick_line(&mut self, a: [f32; 2], b: [f32; 2], hw: f32, c: Rgb, al: f32) {
        let e = hw + 1.0;
        self.mark(a[0].min(b[0]) - e, a[1].min(b[1]) - e, a[0].max(b[0]) + e, a[1].max(b[1]) + e);
        self.frame.thick_line(a, b, hw, c, al);
    }

    pub fn disc(&mut self, x: f32, y: f32, r: f32, c: Rgb, al: f32) {
        self.mark(x - r - 1.0, y - r - 1.0, x + r + 1.0, y + r + 1.0);
        self.frame.disc(x, y, r, c, al);
    }

    pub fn circle(&mut self, x: f32, y: f32, r: f32, c: Rgb, al: f32) {
        self.mark(x - r - 1.0, y - r - 1.0, x + r + 1.0, y + r + 1.0);
        self.frame.circle(x, y, r, c, al);
    }

    /// Additive filled parallelogram `o + s·e + t·f` (s, t in 0..1), anti-aliased edges.
    pub fn quad(&mut self, o: [f32; 2], e: [f32; 2], f: [f32; 2], c: Rgb, alpha: f32) {
        let xs = [o[0], o[0] + e[0], o[0] + f[0], o[0] + e[0] + f[0]];
        let ys = [o[1], o[1] + e[1], o[1] + f[1], o[1] + e[1] + f[1]];
        let (xmin, xmax) = (xs.iter().copied().fold(f32::MAX, f32::min), xs.iter().copied().fold(f32::MIN, f32::max));
        let (ymin, ymax) = (ys.iter().copied().fold(f32::MAX, f32::min), ys.iter().copied().fold(f32::MIN, f32::max));
        self.mark(xmin, ymin, xmax, ymax);
        let fr = &mut self.frame;
        let x0 = (xmin.floor().max(0.0)) as usize;
        let x1 = (xmax.ceil().max(0.0) as usize).min(fr.w);
        let y0 = (ymin.floor().max(0.0)) as usize;
        let y1 = (ymax.ceil().max(0.0) as usize).min(fr.h);
        let det = e[0] * f[1] - e[1] * f[0];
        if det.abs() < 1e-6 {
            return;
        }
        let (le, lf) = ((e[0] * e[0] + e[1] * e[1]).sqrt(), (f[0] * f[0] + f[1] * f[1]).sqrt());
        // Extent (px) across each pair of edges, to turn local coordinates into distances.
        let (he, hf) = (det.abs() / lf, det.abs() / le);
        for y in y0..y1 {
            for x in x0..x1 {
                let (px, py) = (x as f32 + 0.5 - o[0], y as f32 + 0.5 - o[1]);
                let s = (px * f[1] - py * f[0]) / det;
                let t = (e[0] * py - e[1] * px) / det;
                let cs = (s * he + 0.5).min((1.0 - s) * he + 0.5).clamp(0.0, 1.0);
                let ct = (t * hf + 0.5).min((1.0 - t) * hf + 0.5).clamp(0.0, 1.0);
                let cov = cs * ct;
                if cov > 0.0 {
                    let i = (y * fr.w + x) * 3;
                    fr.light[i] += c[0] * alpha * cov;
                    fr.light[i + 1] += c[1] * alpha * cov;
                    fr.light[i + 2] += c[2] * alpha * cov;
                }
            }
        }
    }

    /// `px = bg + tone(light + upsampled glow)` over the dirty spans (same tone curve
    /// and white bleed as `Frame::finish`); a copy of the background elsewhere.
    pub fn compose(&mut self) {
        let (w, qw, qh) = (self.frame.w, self.glow.w, self.glow.h);
        let exp = 512.0;
        let tone = &self.tone;
        let glow = &self.glow.light;
        let Frame { light, bg, px, .. } = &mut self.frame;
        for (y, d) in self.dirty.iter().enumerate() {
            let bgs = &bg[y * w..(y + 1) * w];
            let out = &mut px[y * w..(y + 1) * w];
            let (lo, hi) = (d[0] as usize, (d[1] as usize).min(w));
            if lo >= hi {
                out.copy_from_slice(bgs);
                continue;
            }
            out[..lo].copy_from_slice(&bgs[..lo]);
            out[hi..].copy_from_slice(&bgs[hi..]);
            let fy = ((y as f32 + 0.5) / 4.0 - 0.5).clamp(0.0, (qh - 1) as f32);
            let y0 = fy as usize;
            let y1 = (y0 + 1).min(qh - 1);
            let ty = fy - y0 as f32;
            let (qa, qb) = (self.cols[lo].0, (self.cols[hi - 1].0 + 2).min(qw));
            let r0 = &glow[(y0 * qw + qa) * 3..(y0 * qw + qb) * 3];
            let r1 = &glow[(y1 * qw + qa) * 3..(y1 * qw + qb) * 3];
            for ((o, &a), &b) in self.row[qa * 3..qb * 3].iter_mut().zip(r0).zip(r1) {
                *o = a + (b - a) * ty;
            }
            let row = &self.row;
            let light = &light[(y * w + lo) * 3..(y * w + hi) * 3];
            for (((o, l), &bgv), &(a, tx)) in out[lo..hi].iter_mut().zip(light.chunks_exact(3)).zip(&bgs[lo..hi]).zip(&self.cols[lo..hi]) {
                let (ra, rb) = (&row[a * 3..a * 3 + 3], &row[a * 3 + 3..a * 3 + 6]);
                let mut r = l[0] + ra[0] + (rb[0] - ra[0]) * tx;
                let mut g = l[1] + ra[1] + (rb[1] - ra[1]) * tx;
                let mut b = l[2] + ra[2] + (rb[2] - ra[2]) * tx;
                if r.max(g).max(b) * exp < 1.0 {
                    *o = bgv;
                    continue;
                }
                let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                if lum > 0.9 {
                    let over = (lum - 0.9) * 0.5;
                    r += over;
                    g += over;
                    b += over;
                }
                let t = |v: f32| tone[(v * exp).min(4095.0) as usize] as u32;
                let add = |v: u32, sh: u32| (((bgv >> sh) & 0xff) + v).min(255) << sh;
                *o = 0xff00_0000 | add(t(r), 0) | add(t(g), 8) | add(t(b), 16);
            }
        }
    }
}

impl Default for Canvas {
    fn default() -> Self {
        Self::new()
    }
}
