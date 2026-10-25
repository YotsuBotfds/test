//! Panel A: the Gutenberg–Richter plot. Cumulative counts N(≥M) as dots, the
//! per-bin histogram n(M) as thin columns, the maximum-likelihood line from Mc, and
//! underneath, on the same magnitude axis, the b-value each cutoff would give.

use super::plot::*;
use super::stats::{mag, BValue, Completeness, Hist};
use crate::color::{mix, Rgb};
use crate::gfx::Frame;

/// What the panel shows: one depth subset at one cutoff.
#[derive(Clone)]
pub struct GrData {
    pub hist: Hist,
    pub comp: Completeness,
    pub curve: Vec<BValue>,
    pub fit: BValue,
    pub color: Rgb,
}

#[derive(Default)]
pub struct GrView {
    pub frame: Frame,
    pub k: f32,
    pub main: Plot,
    pub strip: Plot,
    pub x: Axis,
    pub y: Axis,
    pub yb: Axis,
    pub xt: Vec<Tick>,
    pub yt: Vec<Tick>,
    pub ybt: Vec<Tick>,
    /// Bin under the pointer (main plot), 1000 + bin in the b strip, or -1.
    pub hover: i32,
    bg_key: (usize, usize, u32, usize, u32, u32),
    cache: Cache,
    stroke: Stroke,
}

impl GrView {
    pub fn new() -> Self {
        let mut v = GrView { hover: -1, ..Default::default() };
        v.frame.bloom = 0.0;
        v
    }

    pub fn resize(&mut self, w: usize, h: usize, k: f32) {
        self.frame.resize(w, h);
        self.stroke.resize(w, h);
        self.k = k.max(0.5);
        self.bg_key = (0, 0, 0, 0, 0, 0);
        self.cache.valid = false;
    }

    /// Recomputes plot rectangles, axes and ticks for the data.
    pub fn layout(&mut self, d: &GrData) {
        let k = self.k;
        let (w, h) = (self.frame.w as f32, self.frame.h as f32);
        let total = d.hist.total().max(1) as f64;
        let top = total * 2.2;
        let decades = top.log10().floor() as i32;
        let left = ((super::plot::decade_label(decades).len() as f32 * CHAR_W + 12.0) * k).round();
        let (right, top_m, bottom, gap) = (14.0 * k, 24.0 * k, 26.0 * k, 30.0 * k);
        let usable = (h - top_m - bottom - gap).max(40.0);
        let strip_h = (usable * 0.27).clamp(54.0 * k, 130.0 * k).min(usable * 0.4);
        let main_h = usable - strip_h;
        // Plots keep a positive size even on a tiny canvas (they may then overflow it).
        let x1 = (w - right).max(left + 40.0);
        self.main = Plot { x0: left, y0: top_m, x1, y1: top_m + main_h };
        let sy0 = top_m + main_h + gap;
        self.strip = Plot { x0: left, y0: sy0, x1, y1: sy0 + strip_h };
        let hi = d.hist.hi().map_or(9.0, |k| mag(k) + 0.2).max(9.0);
        self.x = Axis::lin(4.4, hi, self.main.x0, self.main.x1);
        self.y = Axis::log(0.5, top, self.main.y1, self.main.y0);
        let (mut blo, mut bhi) = (1.0f64, 1.0f64);
        for b in &d.curve {
            blo = blo.min(b.b - b.sigma);
            bhi = bhi.max(b.b + b.sigma);
        }
        let (blo, bhi) = (((blo - 0.04) * 10.0).floor() / 10.0, ((bhi + 0.04) * 10.0).ceil() / 10.0);
        self.yb = Axis::lin(blo, bhi.max(blo + 0.2), self.strip.y1, self.strip.y0);

        let cw = CHAR_W * k;
        let mut xs = Vec::new();
        let mut m = 4.5;
        while m <= hi + 1e-9 {
            let pri = if ((m * 2.0f64).round() as i32) % 2 == 0 { 0 } else { 1 };
            xs.push((self.x.px(m), format!("{m:.1}"), pri));
            m += 0.5;
        }
        self.xt = cull(xs, cw, 10.0 * k, 0.0, false);
        let lh = 14.0 * k;
        self.yt = cull((0..=decades).map(|e| (self.y.px(10f64.powi(e)), decade_label(e), 0)).collect(), cw, 2.0 * k, lh, true);
        let step = if bhi - blo > 0.41 { 0.2 } else { 0.1 };
        let mut bs = Vec::new();
        let mut v = (blo / step).ceil() * step;
        while v <= bhi + 1e-9 {
            bs.push((self.yb.px(v), format!("{v:.1}"), if (v - 1.0).abs() < 1e-6 { 0 } else { 1 }));
            v += step;
        }
        self.ybt = cull(bs, cw, 2.0 * k, lh, true);
        self.bg_key = (0, 0, 0, 0, 0, 0);
        self.cache.valid = false;
    }

    fn paint_bg(&mut self, d: &GrData) {
        let key = (self.frame.w, self.frame.h, self.k.to_bits(), d.fit.kc, d.hist.total(), (self.yb.lo * 100.0 + self.yb.hi * 1e4) as u32);
        if key == self.bg_key {
            return;
        }
        self.bg_key = key;
        let f = &mut self.frame;
        let t = self.k.round().max(1.0);
        bg_fill(f, tok(WELL));
        let xmc = self.x.px(d.fit.mc - 0.05);
        for p in [self.main, self.strip] {
            bg_rect(f, p.x0, p.y0, xmc.max(p.x0), p.y1, tok(WASH));
        }
        for tk in &self.yt {
            bg_hline(f, self.main.x0, self.main.x1, tk.px, t, tok(GRID));
        }
        for tk in &self.ybt {
            bg_hline(f, self.strip.x0, self.strip.x1, tk.px, t, tok(GRID));
        }
        for m in 5..=9 {
            let x = self.x.px(m as f64);
            if x < self.main.x1 {
                bg_vline(f, x, self.main.y0, self.main.y1, t, tok(GRID));
                bg_vline(f, x, self.strip.y0, self.strip.y1, t, tok(GRID));
            }
        }
        // The textbook b = 1, as a reference rule in the strip.
        if (self.yb.lo..=self.yb.hi).contains(&1.0) {
            bg_hline(f, self.strip.x0, self.strip.x1, self.yb.px(1.0), t, tok(AXIS));
        }
        // Histogram: thin, crisp columns in the background (context for the dots).
        let (lo, hi) = (d.hist.lo().unwrap_or(0), d.hist.hi().unwrap_or(0));
        let spacing = self.x.px(4.6) - self.x.px(4.5);
        let half = (spacing * 0.2).clamp(1.0 * self.k, 3.5 * self.k);
        let well = tok(WELL);
        for b in lo..=hi {
            let n = d.hist.n[b];
            if n == 0 {
                continue;
            }
            let cx = self.x.px(mag(b));
            let c = mix(well, tok(TEAL), if b >= d.fit.kc { 0.42 } else { 0.22 });
            bg_rect(f, cx - half, self.y.px(n as f64), cx + half, self.main.y1, c);
        }
        bg_hline(f, self.main.x0, self.main.x1, self.main.y1, t, tok(AXIS));
        bg_hline(f, self.strip.x0, self.strip.x1, self.strip.y1, t, tok(AXIS));
    }

    /// Draws the panel. The static content is rendered once per data or size change
    /// and cached; hover and selection are drawn over the cached pixels.
    pub fn render(&mut self, d: &GrData, selected_mag: Option<f32>) {
        if !self.cache.restore(&mut self.frame) {
            self.render_base(d);
            self.cache.store(&self.frame);
        }
        self.overlay(d, selected_mag);
    }

    fn render_base(&mut self, d: &GrData) {
        self.paint_bg(d);
        let k = self.k;
        self.frame.clear();
        let (main, strip) = (self.main, self.strip);
        let (x, y, yb) = (self.x, self.y, self.yb);
        let hi = d.hist.hi().unwrap_or(0);
        let lo = d.hist.lo().unwrap_or(0);
        let kc = d.fit.kc;

        // Fit line: a soft glow, then the line itself; solid from Mc down to N = 0.5,
        // faint below Mc.
        let ember = tok(EMBER);
        let fit = d.fit;
        let m_end = ((fit.a - (0.5f64).log10()) / fit.b).min(x.hi);
        let pts = |m0: f64, m1: f64| -> Vec<[f32; 2]> {
            let n = 48;
            (0..=n)
                .map(|i| {
                    let m = m0 + (m1 - m0) * i as f64 / n as f64;
                    [x.px(m), y.px(fit.n_at_least(m))]
                })
                .collect()
        };
        let solid = pts(fit.mc, m_end);
        self.stroke.glow(&solid, 7.0 * k);
        self.stroke.flush(&mut self.frame, ember, 0.16);
        self.stroke.polyline(&pts(4.45, fit.mc), 0.5 * k);
        self.stroke.flush(&mut self.frame, ember, 0.32);
        self.stroke.polyline(&solid, 1.0 * k);
        self.stroke.flush(&mut self.frame, ember, 1.25);
        let f = &mut self.frame;

        // Cumulative counts, each with a faint halo.
        let ink3 = tok(INK3);
        for b in lo..=hi {
            if d.hist.n[b] == 0 {
                continue;
            }
            let (px, py) = (x.px(mag(b)), y.px(d.hist.cum(b) as f64));
            if b >= kc {
                f.splat(px, py, 3.2 * k, d.color, 0.07);
                dot(f, px, py, 3.0 * k, 1.6 * k, d.color, 1.5);
            } else {
                dot(f, px, py, 2.6 * k, 1.4 * k, ink3, 1.2);
            }
        }

        // The cutoff in use.
        let xmc = x.px(fit.mc - 0.05);
        f.line([xmc, main.y0], [xmc, main.y1], ember, 0.55);
        f.line([xmc, strip.y0], [xmc, strip.y1], ember, 0.55);

        // b at each cutoff, ±1σ.
        let ink2 = tok(INK2);
        for bv in &d.curve {
            let px = x.px(bv.mc);
            let (ya, yb2) = (yb.px(bv.b - bv.sigma), yb.px(bv.b + bv.sigma));
            let chosen = bv.kc == kc;
            let c = if chosen { ember } else { ink2 };
            f.line([px, ya.min(strip.y1)], [px, yb2.max(strip.y0)], c, if chosen { 1.0 } else { 0.55 });
            let py = yb.px(bv.b).clamp(strip.y0, strip.y1);
            if chosen {
                f.splat(px, py, 4.0 * k, c, 0.12);
            }
            dot(f, px, py, if chosen { 3.4 * k } else { 2.3 * k }, 1.2 * k, c, if chosen { 1.6 } else { 0.9 });
        }
        self.frame.finish();
    }

    fn overlay(&mut self, d: &GrData, selected_mag: Option<f32>) {
        let k = self.k;
        let (main, strip, x, y, yb) = (self.main, self.strip, self.x, self.y, self.yb);
        let f = &mut self.frame;
        let ink = ov::rgb(INK);
        // Selected quake from anywhere on the page.
        if let Some(m) = selected_mag {
            let b = super::stats::bin(m);
            let px = x.px(mag(b));
            ov::line(f, [px, main.y0], [px, main.y1], ink, 0.22);
            if d.hist.n[b] > 0 {
                ov::circle(f, px, y.px(d.hist.cum(b) as f64), 6.5 * k, ink, 0.9);
            }
        }
        // Hover crosshair.
        if self.hover >= 0 {
            let b = (self.hover % 1000) as usize;
            let px = x.px(mag(b));
            ov::line(f, [px, main.y0], [px, main.y1], ink, 0.2);
            ov::line(f, [px, strip.y0], [px, strip.y1], ink, 0.2);
            if b < super::stats::NB && d.hist.n[b] > 0 {
                ov::circle(f, px, y.px(d.hist.cum(b) as f64), 6.0 * k, ink, 0.8);
            }
            if let Some(bv) = d.curve.iter().find(|c| c.kc == b) {
                ov::circle(f, px, yb.px(bv.b).clamp(strip.y0, strip.y1), 5.5 * k, ink, 0.8);
            }
        }
    }

    /// Bin nearest the pointer: main plot -> bin, b strip -> 1000 + bin, else -1.
    pub fn pick(&self, d: &GrData, px: f32, py: f32) -> i32 {
        let (Some(lo), Some(hi)) = (d.hist.lo(), d.hist.hi()) else { return -1 };
        let slack = 8.0 * self.k;
        let inside = |p: &Plot| px >= p.x0 - slack && px <= p.x1 + slack && py >= p.y0 - slack && py <= p.y1 + slack;
        let b = ((self.x.val(px) * 10.0).round() as i64).clamp(lo as i64, hi as i64) as usize;
        if inside(&self.main) {
            // Snap to the nearest bin that has quakes.
            let near = (lo..=hi).filter(|&k| d.hist.n[k] > 0).min_by_key(|&k| (k as i64 - b as i64).abs());
            return near.map_or(-1, |k| k as i32);
        }
        if inside(&self.strip) {
            let near = d.curve.iter().min_by_key(|c| (c.kc as i64 - b as i64).abs());
            return near.map_or(-1, |c| 1000 + c.kc as i32);
        }
        -1
    }
}
