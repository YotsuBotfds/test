//! Panel B: aftershock rate against time since the mainshock, both on log scales.
//! Rates in log-spaced bins with Poisson error bars, the fitted Omori–Utsu model
//! (with its secondary sequences), the background rate, and underneath, on the same
//! time axis, every aftershock's magnitude, for Båth's law.

use super::plot::*;
use super::stats::{poisson_limits, OmoriFit, Sequence, DAY_S, T_MIN};
use crate::color::Rgb;
use crate::data::Quake;
use crate::gfx::Frame;

#[derive(Clone, Default)]
pub struct OmoriData {
    pub seq: Sequence,
    /// Fit with secondary sequences when there are any, else the single law.
    pub fit: Option<OmoriFit>,
    /// The single law, kept for comparison when secondaries were modelled.
    pub single: Option<OmoriFit>,
    pub edges: Vec<f64>,
    pub counts: Vec<u32>,
    /// Events above Mc earlier than the first bin.
    pub early: usize,
}

impl OmoriData {
    pub fn new(seq: Sequence, fit: Option<OmoriFit>, single: Option<OmoriFit>) -> Self {
        let edges = super::stats::log_bins(seq.window.max(T_MIN * 2.0), 4);
        let mut counts = vec![0u32; edges.len().saturating_sub(1)];
        let mut early = 0;
        for &t in &seq.times {
            if t < edges[0] {
                early += 1;
                continue;
            }
            let k = edges.partition_point(|&e| e <= t).saturating_sub(1).min(counts.len().saturating_sub(1));
            if let Some(c) = counts.get_mut(k) {
                *c += 1;
            }
        }
        OmoriData { seq, fit, single, edges, counts, early }
    }

    pub fn rate(&self, t: f64) -> Option<f64> {
        self.fit.as_ref().map(|f| f.rate(t, &self.seq.sec_times, self.seq.mu))
    }
}

#[derive(Default)]
pub struct OmoriView {
    pub frame: Frame,
    pub k: f32,
    pub main: Plot,
    pub strip: Plot,
    pub x: Axis,
    pub y: Axis,
    pub ym: Axis,
    pub xt: Vec<Tick>,
    pub yt: Vec<Tick>,
    pub ymt: Vec<Tick>,
    /// Bin under the pointer, 1000 + event slot in the strip, or -1.
    pub hover: i32,
    bg_key: (usize, usize, u32, usize, u32),
    stroke: Stroke,
    cache: Cache,
}

const HUMAN: [(f64, &str, u8); 9] = [
    (10.0 / 1440.0, "10 min", 2),
    (1.0 / 24.0, "1 h", 1),
    (6.0 / 24.0, "6 h", 3),
    (1.0, "1 day", 0),
    (7.0, "1 week", 2),
    (30.44, "1 month", 1),
    (91.31, "3 months", 3),
    (182.62, "6 months", 2),
    (365.25, "1 year", 1),
];

impl OmoriView {
    pub fn new() -> Self {
        let mut v = OmoriView { hover: -1, ..Default::default() };
        v.frame.bloom = 0.0;
        v
    }

    pub fn resize(&mut self, w: usize, h: usize, k: f32) {
        self.frame.resize(w, h);
        self.stroke.resize(w, h);
        self.k = k.max(0.5);
        self.bg_key = (0, 0, 0, 0, 0);
        self.cache.valid = false;
    }

    pub fn layout(&mut self, d: &OmoriData, q: &[Quake]) {
        let k = self.k;
        let (w, h) = (self.frame.w as f32, self.frame.h as f32);
        let x_hi = d.seq.window.max(T_MIN * 30.0);
        // Rate range from the data, its error bars, the model and the background.
        let (mut lo, mut hi) = (f64::INFINITY, 0f64);
        for (i, &n) in d.counts.iter().enumerate() {
            if n > 0 {
                let wd = d.edges[i + 1] - d.edges[i];
                let (a, b) = poisson_limits(n);
                lo = lo.min(a / wd);
                hi = hi.max(b / wd);
            }
        }
        if let Some(r0) = d.rate(T_MIN) {
            hi = hi.max(r0);
            lo = lo.min(d.rate(x_hi).unwrap_or(r0));
        }
        if d.seq.mu > 0.0 {
            lo = lo.min(d.seq.mu);
        }
        if !lo.is_finite() || hi <= 0.0 {
            (lo, hi) = (0.01, 10.0);
        }
        let (e0, e1) = ((lo * 0.7).log10().floor() as i32, (hi * 1.4).log10().ceil() as i32);
        let e1 = e1.max(e0 + 2);
        let left = ((decade_label(e0).len().max(decade_label(e1).len()) as f32 * CHAR_W + 12.0) * k).round();
        let (right, top_m, bottom, gap) = (14.0 * k, 24.0 * k, 26.0 * k, 30.0 * k);
        let usable = (h - top_m - bottom - gap).max(40.0);
        let strip_h = (usable * 0.27).clamp(54.0 * k, 130.0 * k).min(usable * 0.4);
        let main_h = usable - strip_h;
        // Plots keep a positive size even on a tiny canvas (they may then overflow it).
        let x1 = (w - right).max(left + 40.0);
        self.main = Plot { x0: left, y0: top_m, x1, y1: top_m + main_h };
        let sy0 = top_m + main_h + gap;
        self.strip = Plot { x0: left, y0: sy0, x1, y1: sy0 + strip_h };
        self.x = Axis::log(T_MIN, x_hi, self.main.x0, self.main.x1);
        self.y = Axis::log(10f64.powi(e0), 10f64.powi(e1), self.main.y1, self.main.y0);
        let mlo = d
            .seq
            .events
            .iter()
            .map(|&j| q[j].mag as f64)
            .fold(d.seq.mc, f64::min)
            .min(4.5);
        self.ym = Axis::lin(mlo - 0.15, d.seq.m0 + 0.35, self.strip.y1, self.strip.y0);

        let cw = CHAR_W * k;
        let mut xs: Vec<(f32, String, u8)> = HUMAN
            .iter()
            .filter(|h| h.0 >= T_MIN * 1.05 && h.0 <= x_hi * 1.0001)
            .map(|h| (self.x.px(h.0), h.1.to_string(), h.2))
            .collect();
        // Label the end of the window unless a round tick already sits there.
        if !HUMAN.iter().any(|h| h.0 <= x_hi * 1.0001 && (h.0 / x_hi).log10().abs() < 0.08) && x_hi >= 1.0 {
            xs.push((self.x.px(x_hi), format!("{:.0} days", x_hi), 1));
        }
        self.xt = cull(xs, cw, 12.0 * k, 0.0, false);
        let lh = 14.0 * k;
        self.yt = cull((e0..=e1).map(|e| (self.y.px(10f64.powi(e)), decade_label(e), 0)).collect(), cw, 2.0 * k, lh, true);
        let ms: Vec<(f32, String, u8)> = (4..=9)
            .map(|m| m as f64)
            .filter(|&m| m >= self.ym.lo && m <= self.ym.hi)
            .map(|m| (self.ym.px(m), format!("{m:.0}"), 0))
            .collect();
        self.ymt = cull(ms, cw, 2.0 * k, lh, true);
        self.bg_key = (0, 0, 0, 0, 0);
        self.cache.valid = false;
    }

    fn paint_bg(&mut self, d: &OmoriData) {
        let key = (self.frame.w, self.frame.h, self.k.to_bits(), d.seq.main, d.seq.times.len() as u32);
        if key == self.bg_key {
            return;
        }
        self.bg_key = key;
        let f = &mut self.frame;
        let t = self.k.round().max(1.0);
        bg_fill(f, tok(WELL));
        for tk in &self.yt {
            bg_hline(f, self.main.x0, self.main.x1, tk.px, t, tok(GRID));
        }
        for tk in &self.ymt {
            bg_hline(f, self.strip.x0, self.strip.x1, tk.px, t, tok(GRID));
        }
        for tk in &self.xt {
            bg_vline(f, tk.px, self.main.y0, self.main.y1, t, tok(GRID));
            bg_vline(f, tk.px, self.strip.y0, self.strip.y1, t, tok(GRID));
        }
        bg_hline(f, self.main.x0, self.main.x1, self.main.y1, t, tok(AXIS));
        bg_hline(f, self.strip.x0, self.strip.x1, self.strip.y1, t, tok(AXIS));
    }

    fn curve(&self, fit: &OmoriFit, sec: &[f64], mu: f64) -> Vec<[f32; 2]> {
        let (lo, hi) = (self.x.lo, self.x.hi.min(self.x.hi));
        let n = ((self.main.x1 - self.main.x0) / (1.5 * self.k)).clamp(60.0, 900.0) as usize;
        let mut ts: Vec<f64> = (0..=n).map(|i| lo * (hi / lo).powf(i as f64 / n as f64)).collect();
        for &tj in sec {
            ts.push(tj * (1.0 - 1e-9));
            for e in -8..=8 {
                ts.push(tj + fit.c * 10f64.powf(e as f64 * 0.25));
            }
        }
        ts.retain(|&t| t >= lo && t <= hi);
        ts.sort_by(|a, b| a.total_cmp(b));
        let (y0, y1) = (self.main.y0, self.main.y1);
        ts.iter().map(|&t| [self.x.px(t), self.y.px(fit.rate(t, sec, mu)).clamp(y0, y1)]).collect()
    }

    /// Draws the panel: cached static content, then the hover marks over it.
    pub fn render(&mut self, d: &OmoriData, q: &[Quake], tint: &[Rgb]) {
        if !self.cache.restore(&mut self.frame) {
            self.render_base(d, q, tint);
            self.cache.store(&self.frame);
        }
        self.overlay(d, q);
    }

    fn render_base(&mut self, d: &OmoriData, q: &[Quake], tint: &[Rgb]) {
        self.paint_bg(d);
        let k = self.k;
        self.frame.clear();
        let (main, strip, x, y, ym) = (self.main, self.strip, self.x, self.y, self.ym);
        let s = &d.seq;
        let t0 = q[s.main].t as f64;

        // Secondary sequences as faint vertical guides.
        let ink3 = tok(INK3);
        for &tj in &s.sec_times {
            let px = x.px(tj);
            self.frame.line([px, main.y0], [px, main.y1], ink3, 0.55);
            self.frame.line([px, strip.y0], [px, strip.y1], ink3, 0.55);
        }
        // Background rate.
        if s.mu > 0.0 && s.mu >= y.lo {
            let py = y.px(s.mu);
            self.frame.line([main.x0, py], [main.x1, py], tok(TEAL), 0.85);
        }
        // Single law for comparison, then the fitted model with a soft glow.
        if let (Some(single), false) = (&d.single, s.sec_times.is_empty()) {
            let pts = self.curve(single, &[], s.mu);
            self.stroke.polyline(&pts, 0.55 * k);
            self.stroke.flush(&mut self.frame, tok(INK2), 0.45);
        }
        if let Some(fit) = &d.fit {
            let pts = self.curve(fit, &s.sec_times, s.mu);
            self.stroke.glow(&pts, 7.0 * k);
            self.stroke.flush(&mut self.frame, tok(EMBER), 0.16);
            self.stroke.polyline(&pts, 1.0 * k);
            self.stroke.flush(&mut self.frame, tok(EMBER), 1.25);
            if fit.c > x.lo && fit.c < x.hi {
                let px = x.px(fit.c);
                let py = y.px(fit.rate(fit.c, &s.sec_times, s.mu)).clamp(main.y0, main.y1);
                self.frame.line([px, py + 6.0 * k], [px, main.y1], tok(EMBER), 0.4);
            }
        }
        let f = &mut self.frame;
        // Binned rates with Gehrels 1σ limits.
        let ink = tok(INK);
        for (i, &n) in d.counts.iter().enumerate() {
            if n == 0 {
                continue;
            }
            let (a, b) = (d.edges[i], d.edges[i + 1]);
            let wd = b - a;
            let tc = (a * b).sqrt();
            let (lo, up) = poisson_limits(n);
            let px = x.px(tc);
            let (ya, yb) = (y.px((lo / wd).max(y.lo)), y.px(up / wd));
            f.line([px, ya.clamp(main.y0, main.y1)], [px, yb.clamp(main.y0, main.y1)], tok(INK2), 0.8);
            let py = y.px(n as f64 / wd).clamp(main.y0, main.y1);
            f.splat(px, py, 3.2 * k, ink, 0.07);
            dot(f, px, py, 3.0 * k, 1.6 * k, ink, 1.5);
        }

        // Magnitude–time strip.
        let pm = ym.px(s.m0);
        f.line([strip.x0, pm], [strip.x1, pm], tok(INK2), 0.6);
        let bath = s.m0 - 1.2;
        if bath > ym.lo {
            let pb = ym.px(bath);
            f.line([strip.x0, pb], [strip.x1, pb], tok(TEAL), 0.75);
        }
        let kc = super::stats::bin(s.mc as f32);
        for &j in &s.events {
            let e = q[j];
            let t = (e.t as f64 - t0) / DAY_S;
            if t < x.lo {
                continue;
            }
            let r = (1.0 + (e.mag - 4.5).max(0.0) * 0.9) * k;
            let a = if super::stats::bin(e.mag) >= kc { 0.55 } else { 0.22 };
            f.disc(x.px(t), ym.px(e.mag as f64), r, tint[j], a);
        }
        if let Some(j) = s.largest {
            let t = (q[j].t as f64 - t0) / DAY_S;
            if t >= x.lo {
                let (px, py) = (x.px(t), ym.px(q[j].mag as f64));
                f.splat(px, py, 5.0 * k, tok(EMBER), 0.12);
                f.circle(px, py, 7.0 * k, tok(EMBER), 1.1);
            }
        }
        self.frame.finish();
    }

    fn overlay(&mut self, d: &OmoriData, q: &[Quake]) {
        let k = self.k;
        let (main, strip, x, y, ym) = (self.main, self.strip, self.x, self.y, self.ym);
        let f = &mut self.frame;
        let ink = ov::rgb(INK);
        if self.hover >= 1000 {
            if let Some(&j) = d.seq.events.get((self.hover - 1000) as usize) {
                let t = ((q[j].t as f64 - q[d.seq.main].t as f64) / DAY_S).max(x.lo);
                ov::circle(f, x.px(t), ym.px(q[j].mag as f64), 6.0 * k, ink, 0.9);
            }
        } else if self.hover >= 0 {
            let i = self.hover as usize;
            if i + 1 < d.edges.len() {
                let tc = (d.edges[i] * d.edges[i + 1]).sqrt();
                let px = x.px(tc);
                ov::line(f, [px, main.y0], [px, main.y1], ink, 0.2);
                ov::line(f, [px, strip.y0], [px, strip.y1], ink, 0.2);
                let n = d.counts[i];
                if n > 0 {
                    let py = y.px(n as f64 / (d.edges[i + 1] - d.edges[i])).clamp(main.y0, main.y1);
                    ov::circle(f, px, py, 6.0 * k, ink, 0.8);
                }
            }
        }
    }

    /// Bin under the pointer (main plot), 1000 + event slot (strip), or -1.
    pub fn pick(&self, d: &OmoriData, q: &[Quake], px: f32, py: f32) -> i32 {
        let slack = 8.0 * self.k;
        let inside = |p: &Plot| px >= p.x0 - slack && px <= p.x1 + slack && py >= p.y0 - slack && py <= p.y1 + slack;
        if inside(&self.main) {
            let t = self.x.val(px.clamp(self.main.x0, self.main.x1));
            let best = (0..d.counts.len()).filter(|&i| d.counts[i] > 0).min_by(|&a, &b| {
                let da = ((d.edges[a] * d.edges[a + 1]).sqrt() / t).ln().abs();
                let db = ((d.edges[b] * d.edges[b + 1]).sqrt() / t).ln().abs();
                da.total_cmp(&db)
            });
            return best.map_or(-1, |i| i as i32);
        }
        if inside(&self.strip) {
            let t0 = q[d.seq.main].t as f64;
            let reach = 14.0 * self.k;
            let mut best = (-1, reach * reach);
            for (slot, &j) in d.seq.events.iter().enumerate() {
                let t = ((q[j].t as f64 - t0) / DAY_S).max(self.x.lo);
                let (ex, ey) = (self.x.px(t), self.ym.px(q[j].mag as f64));
                // Favour larger quakes slightly so they win ties in crowded spots.
                let dd = (ex - px).powi(2) + (ey - py).powi(2) - (q[j].mag - 4.5).max(0.0) * 6.0 * self.k;
                if dd < best.1 {
                    best = (1000 + slot as i32, dd);
                }
            }
            return best.0;
        }
        -1
    }
}
