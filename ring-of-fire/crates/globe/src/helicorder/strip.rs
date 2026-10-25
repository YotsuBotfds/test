//! Two small companions to the drum: the three-year overview strip (the loudest
//! signal each day, on a log scale) and the legend's reference trace.

use super::drum::{RowMaker, Row, Zoom, CLIP};
use super::seis::Seis;
use crate::color::{hex, pack, to_srgb};
use crate::gfx::hash;

/// Overview: one bar per pixel column, transparent elsewhere so the page shows through.
pub struct Strip {
    pub w: usize,
    pub h: usize,
    pub px: Vec<u32>,
}

impl Strip {
    pub fn new() -> Self {
        Strip { w: 0, h: 0, px: Vec::new() }
    }

    pub fn resize(&mut self, w: usize, h: usize) {
        self.w = w.max(1);
        self.h = h.max(1);
        self.px = vec![0; self.w * self.h];
    }

    /// `window` and `cursor` in seconds since the epoch; `mark` is a selected quake's time.
    pub fn render(&mut self, seis: &Seis, window: (f64, f64), cursor: f64, mark: Option<f64>) {
        let (w, h) = (self.w, self.h);
        self.px.fill(0);
        let days = seis.day_peak.len().max(1);
        let floor = seis.noise.base;
        let top = seis.day_peak.iter().copied().fold(floor * 2.0, f32::max);
        let scale = (1.0 + top / floor).log10();
        let (c_in, c_out, c_future) = (pack(hex(0xece6d9), 0.95), pack(hex(0x8a93a6), 0.75), pack(hex(0x3a4358), 0.8));
        let usable = h as f32 - 2.0;
        let (wa, wb) = ((window.0 / 86400.0) / days as f64, (window.1 / 86400.0) / days as f64);
        for x in 0..w {
            let d0 = x * days / w;
            let d1 = ((x + 1) * days / w).max(d0 + 1).min(days);
            let v = seis.day_peak[d0..d1].iter().copied().fold(0.0, f32::max);
            // Log scale, squared, so ordinary days sit low and the great quakes tower.
            let lv = ((1.0 + v / floor).log10() / scale).clamp(0.0, 1.0).powi(2);
            let hh = (usable * lv).max(1.0);
            let u = (x as f64 + 0.5) / w as f64;
            let col = if (d0 as f64) * 86400.0 > cursor {
                c_future
            } else if u >= wa && u <= wb {
                c_in
            } else {
                c_out
            };
            let full = hh.floor() as usize;
            for k in 0..full.min(h) {
                self.px[(h - 1 - k) * w + x] = col;
            }
            let frac = hh - full as f32;
            if frac > 0.0 && full < h {
                let a = ((col >> 24) as f32 * frac) as u32;
                self.px[(h - 1 - full) * w + x] = (col & 0x00ff_ffff) | (a << 24);
            }
        }
        // The drum's window: an ember bracket.
        let ember = pack(hex(0xffb35c), 1.0);
        let wash = pack(hex(0xffb35c), 0.13);
        let xa = ((wa * w as f64).floor().max(0.0) as usize).min(w - 1);
        let xb = ((wb * w as f64).ceil() as usize).clamp(xa + 3, w);
        for x in xa..xb {
            for y in 0..h {
                let p = &mut self.px[y * w + x];
                if *p >> 24 == 0 {
                    *p = wash;
                }
            }
            self.px[x] = ember;
            self.px[w + x] = ember;
        }
        for y in 0..h {
            self.px[y * w + xa] = ember;
            self.px[y * w + xb - 1] = ember;
        }
        let vline = |px: &mut Vec<u32>, t: f64, c: u32| {
            let x = (((t / 86400.0) / days as f64) * w as f64) as usize;
            if x < w {
                for y in 0..h {
                    px[y * w + x] = c;
                }
            }
        };
        if cursor < (days as f64) * 86400.0 {
            vline(&mut self.px, cursor, pack(hex(0xfff2d6), 1.0));
        }
        if let Some(t) = mark {
            vline(&mut self.px, t, pack(hex(0xffb35c), 1.0));
        }
    }
}

impl Default for Strip {
    fn default() -> Self {
        Self::new()
    }
}

/// The legend's reference trace: a flat strip of smoked paper with one line on it.
pub struct Reference {
    pub w: usize,
    pub h: usize,
    pub px: Vec<u32>,
    pub seis: Option<Seis>,
    pub span: f64,
}

impl Reference {
    pub fn new() -> Self {
        Reference { w: 0, h: 0, px: Vec::new(), seis: None, span: 3000.0 }
    }

    pub fn render(&mut self, station: usize, w: usize, h: usize, k: f32) {
        let (w, h) = (w.max(8), h.max(8));
        self.w = w;
        self.h = h;
        self.px = vec![0; w * h];
        let seis = Seis::reference(station, 60.0, 6.0, 20.0);
        let z = Zoom { span: self.span, months: false, nominal: 1.0, mark: (60.0, 2.0, 0.12), big: (0.0, 0.0, 0.0), mark_mag: 9.0, gain: 1.0 };
        let mut row = Row::empty();
        RowMaker::default().compute(&seis, 0, 0.0, self.span, self.span, w, &z, &mut row);
        let sp = h as f32 / (2.0 * CLIP + 0.6);
        let cy = h as f32 * 0.5;
        let mut ink = vec![0.0f32; w * h];
        let hw = 0.55 * k;
        for c in 0..row.valid {
            let ya = cy - row.hi[c] * sp - hw;
            let yb = cy - row.lo[c] * sp + hw;
            let stria = 0.45 + 0.5 * hash((c as u32).wrapping_mul(0x9e37_79b9));
            let a = 1.0 - row.dens[c] * (1.0 - stria);
            for y in (ya.floor().max(0.0) as usize)..(yb.ceil() as usize).min(h) {
                let cov = ((y as f32 + 1.0).min(yb) - (y as f32).max(ya)).clamp(0.0, 1.0);
                ink[y * w + c] += a * cov;
            }
        }
        let soot = hex(0x17130f);
        let paper = hex(0xf3e8d4);
        for y in 0..h {
            let v = 1.0 - 0.35 * ((y as f32 + 0.5) / h as f32 * 2.0 - 1.0).powi(2);
            for x in 0..w {
                let g = 0.85 + 0.3 * hash((x as u32).wrapping_mul(0x27d4_eb2f) ^ (y as u32).wrapping_mul(0x1656_67b1));
                let cov = 1.0 - (-ink[y * w + x] * 1.7).exp();
                let c = [0, 1, 2].map(|i| soot[i] * g * v * (1.0 - cov) + paper[i] * cov * (0.6 + 0.4 * v));
                let b = |q: f32| (to_srgb(q) * 255.0 + 0.5) as u32;
                self.px[y * w + x] = 0xff00_0000 | b(c[0]) | (b(c[1]) << 8) | (b(c[2]) << 16);
            }
        }
        self.seis = Some(seis);
    }

    /// Where an arrival falls across the reference (0..1); NaN if absent.
    pub fn arrival(&self, which: u32) -> f32 {
        let Some(s) = &self.seis else { return f32::NAN };
        let e = &s.events[0];
        let dt = match which {
            0 => e.t_p,
            1 => e.t_s,
            2 => e.t_r,
            _ => f32::NAN,
        };
        ((e.t0 + dt as f64) / self.span) as f32
    }
}

impl Default for Reference {
    fn default() -> Self {
        Self::new()
    }
}
