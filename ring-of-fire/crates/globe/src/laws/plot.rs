//! Chart plumbing shared by the three panels: axis mappings, crisp hairlines painted
//! straight into the background layer, a stroke mask so long polylines stay even
//! (overlapping capsules would bead at every joint in the additive light layer),
//! knockout rings around dots, and greedy tick-label culling.

use crate::color::{hex, Rgb};
use crate::gfx::Frame;

pub const WELL: u32 = 0x070a13;
pub const GRID: u32 = 0x121928;
pub const AXIS: u32 = 0x232c42;
pub const WASH: u32 = 0x0a0e1a;
pub const INK: u32 = 0xece6d9;
pub const INK2: u32 = 0xa5adbf;
pub const INK3: u32 = 0x6b7489;
pub const EMBER: u32 = 0xffb35c;
pub const TEAL: u32 = 0x3fb8b0;

/// Monospace advance of the label font (Martian Mono at 11 px), CSS px per character.
pub const CHAR_W: f32 = 7.3;

#[derive(Clone, Copy, Debug, Default)]
pub struct Axis {
    pub lo: f64,
    pub hi: f64,
    pub p0: f32,
    pub p1: f32,
    pub log: bool,
}

impl Axis {
    pub fn lin(lo: f64, hi: f64, p0: f32, p1: f32) -> Self {
        Axis { lo, hi, p0, p1, log: false }
    }
    pub fn log(lo: f64, hi: f64, p0: f32, p1: f32) -> Self {
        Axis { lo, hi, p0, p1, log: true }
    }
    fn t(&self, v: f64) -> f64 {
        if self.log {
            v.max(1e-300).log10()
        } else {
            v
        }
    }
    /// Data value -> pixel.
    pub fn px(&self, v: f64) -> f32 {
        let (a, b) = (self.t(self.lo), self.t(self.hi));
        self.p0 + (self.p1 - self.p0) * ((self.t(v) - a) / (b - a)) as f32
    }
    /// Pixel -> data value.
    pub fn val(&self, px: f32) -> f64 {
        let (a, b) = (self.t(self.lo), self.t(self.hi));
        let x = a + ((px - self.p0) / (self.p1 - self.p0)) as f64 * (b - a);
        if self.log {
            10f64.powf(x)
        } else {
            x
        }
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Plot {
    pub x0: f32,
    pub y0: f32,
    pub x1: f32,
    pub y1: f32,
}

impl Plot {
    pub fn contains(&self, x: f32, y: f32) -> bool {
        x >= self.x0 && x <= self.x1 && y >= self.y0 && y <= self.y1
    }
}

#[derive(Clone, Debug)]
pub struct Tick {
    pub px: f32,
    pub label: String,
}

/// Keeps candidate labels (pixel, text, priority: lower is more important) whose boxes
/// do not collide, most important first. `char_w` and `gap` are in canvas px;
/// `vertical` measures height (one line) instead of text width.
pub fn cull(mut cands: Vec<(f32, String, u8)>, char_w: f32, gap: f32, line_h: f32, vertical: bool) -> Vec<Tick> {
    cands.sort_by(|a, b| a.2.cmp(&b.2).then(a.0.total_cmp(&b.0)));
    let mut kept: Vec<(f32, f32, Tick)> = Vec::new();
    for (px, label, _) in cands {
        let half = if vertical { line_h / 2.0 } else { label.chars().count() as f32 * char_w / 2.0 };
        let (a, b) = (px - half, px + half);
        if kept.iter().all(|k| b + gap <= k.0 || a >= k.1 + gap) {
            kept.push((a, b, Tick { px, label }));
        }
    }
    let mut out: Vec<Tick> = kept.into_iter().map(|k| k.2).collect();
    out.sort_by(|a, b| a.px.total_cmp(&b.px));
    out
}

pub fn bg_fill(f: &mut Frame, c: Rgb) {
    let v = f.pack(c);
    f.bg.fill(v);
}

/// Opaque rectangle in the background, snapped to whole pixels.
pub fn bg_rect(f: &mut Frame, x0: f32, y0: f32, x1: f32, y1: f32, c: Rgb) {
    let v = f.pack(c);
    let (w, h) = (f.w as i32, f.h as i32);
    let xa = (x0.round() as i32).clamp(0, w);
    let xb = (x1.round() as i32).clamp(0, w);
    let ya = (y0.round() as i32).clamp(0, h);
    let yb = (y1.round() as i32).clamp(0, h);
    for y in ya..yb {
        let row = y as usize * f.w;
        f.bg[row + xa as usize..row + xb as usize].fill(v);
    }
}

/// Horizontal hairline `t` px thick centred on y.
pub fn bg_hline(f: &mut Frame, x0: f32, x1: f32, y: f32, t: f32, c: Rgb) {
    let ya = (y - t / 2.0).round();
    bg_rect(f, x0, ya, x1, ya + t.max(1.0).round(), c);
}

pub fn bg_vline(f: &mut Frame, x: f32, y0: f32, y1: f32, t: f32, c: Rgb) {
    let xa = (x - t / 2.0).round();
    bg_rect(f, xa, y0, xa + t.max(1.0).round(), y1, c);
}

/// Multiplies the light layer by (1 − coverage) of a disc: the "surface ring" that
/// keeps a dot legible where it sits on a line.
pub fn knockout(f: &mut Frame, cx: f32, cy: f32, r: f32) {
    let x0 = (cx - r - 1.0).floor().max(0.0) as usize;
    let y0 = (cy - r - 1.0).floor().max(0.0) as usize;
    let x1 = ((cx + r + 1.0).ceil().max(0.0) as usize).min(f.w);
    let y1 = ((cy + r + 1.0).ceil().max(0.0) as usize).min(f.h);
    for y in y0..y1 {
        for x in x0..x1 {
            let d = ((x as f32 + 0.5 - cx).powi(2) + (y as f32 + 0.5 - cy).powi(2)).sqrt();
            let cov = (r + 0.5 - d).clamp(0.0, 1.0);
            if cov > 0.0 {
                let i = (y * f.w + x) * 3;
                for v in &mut f.light[i..i + 3] {
                    *v *= 1.0 - cov;
                }
            }
        }
    }
}

/// A dot with a knocked-out ring of `ring` px around it.
pub fn dot(f: &mut Frame, cx: f32, cy: f32, r: f32, ring: f32, c: Rgb, a: f32) {
    if ring > 0.0 {
        knockout(f, cx, cy, r + ring);
    }
    f.disc(cx, cy, r, c, a);
}

/// Coverage mask for strokes: segments are max-blended into it, then the mask is
/// added to the light layer once, so joints are not counted twice.
#[derive(Default)]
pub struct Stroke {
    mask: Vec<f32>,
    w: usize,
    h: usize,
    bb: [usize; 4],
}

impl Stroke {
    pub fn resize(&mut self, w: usize, h: usize) {
        if (w, h) != (self.w, self.h) {
            self.w = w;
            self.h = h;
            self.mask = vec![0.0; w * h];
        }
        self.bb = [usize::MAX, usize::MAX, 0, 0];
    }

    pub fn segment(&mut self, a: [f32; 2], b: [f32; 2], hw: f32) {
        self.seg(a, b, hw, false)
    }

    /// A soft stroke: coverage falls off quadratically to zero at `hw`, for glows.
    pub fn glow(&mut self, pts: &[[f32; 2]], hw: f32) {
        for w in pts.windows(2) {
            self.seg(w[0], w[1], hw, true);
        }
    }

    fn seg(&mut self, a: [f32; 2], b: [f32; 2], hw: f32, soft: bool) {
        if !(a[0].is_finite() && a[1].is_finite() && b[0].is_finite() && b[1].is_finite()) || self.w == 0 {
            return;
        }
        let x0 = (a[0].min(b[0]) - hw - 1.0).floor().max(0.0) as usize;
        let y0 = (a[1].min(b[1]) - hw - 1.0).floor().max(0.0) as usize;
        let x1 = ((a[0].max(b[0]) + hw + 1.0).ceil().max(0.0) as usize).min(self.w);
        let y1 = ((a[1].max(b[1]) + hw + 1.0).ceil().max(0.0) as usize).min(self.h);
        if x0 >= x1 || y0 >= y1 {
            return;
        }
        self.bb = [self.bb[0].min(x0), self.bb[1].min(y0), self.bb[2].max(x1), self.bb[3].max(y1)];
        let (dx, dy) = (b[0] - a[0], b[1] - a[1]);
        let len2 = (dx * dx + dy * dy).max(1e-6);
        for y in y0..y1 {
            let row = &mut self.mask[y * self.w..(y + 1) * self.w];
            for (x, m) in row.iter_mut().enumerate().take(x1).skip(x0) {
                let (px, py) = (x as f32 + 0.5 - a[0], y as f32 + 0.5 - a[1]);
                let t = ((px * dx + py * dy) / len2).clamp(0.0, 1.0);
                let (ex, ey) = (px - dx * t, py - dy * t);
                let d = (ex * ex + ey * ey).sqrt();
                let cov = if soft {
                    let u = (1.0 - d / hw).max(0.0);
                    u * u
                } else {
                    (hw + 0.5 - d).clamp(0.0, 1.0)
                };
                if cov > *m {
                    *m = cov;
                }
            }
        }
    }

    pub fn polyline(&mut self, pts: &[[f32; 2]], hw: f32) {
        for w in pts.windows(2) {
            self.segment(w[0], w[1], hw);
        }
    }

    /// Adds the mask to the light layer in colour `c` × `alpha`, then clears it.
    pub fn flush(&mut self, f: &mut Frame, c: Rgb, alpha: f32) {
        let [x0, y0, x1, y1] = self.bb;
        if x0 >= x1 || y0 >= y1 || self.w != f.w || self.h != f.h {
            self.bb = [usize::MAX, usize::MAX, 0, 0];
            return;
        }
        let c = c.map(|v| v * alpha);
        for y in y0..y1 {
            let m = &mut self.mask[y * self.w + x0..y * self.w + x1];
            let l = &mut f.light[(y * f.w + x0) * 3..(y * f.w + x1) * 3];
            for (mv, px) in m.iter_mut().zip(l.chunks_exact_mut(3)) {
                if *mv > 0.0 {
                    px[0] += c[0] * *mv;
                    px[1] += c[1] * *mv;
                    px[2] += c[2] * *mv;
                    *mv = 0.0;
                }
            }
        }
        self.bb = [usize::MAX, usize::MAX, 0, 0];
    }
}

/// Linear RGB of a token colour.
pub fn tok(c: u32) -> Rgb {
    hex(c)
}

/// "1", "10", "1,000", "10,000"; "0.1", "0.01" for decades.
pub fn decade_label(e: i32) -> String {
    if e < 0 {
        format!("{:.*}", (-e) as usize, 10f64.powi(e))
    } else {
        let v = 10u64.pow(e as u32);
        let s = v.to_string();
        let mut out = String::new();
        for (i, ch) in s.chars().enumerate() {
            if i > 0 && (s.len() - i).is_multiple_of(3) {
                out.push(',');
            }
            out.push(ch);
        }
        out
    }
}

/// Minimal JSON writer helpers.
pub fn jnum(out: &mut String, v: f64) {
    use std::fmt::Write;
    if !v.is_finite() {
        out.push_str("null");
    } else if v == v.trunc() && v.abs() < 1e15 {
        let _ = write!(out, "{}", v as i64);
    } else {
        let _ = write!(out, "{v:.7e}");
    }
}

pub fn jstr(out: &mut String, s: &str) {
    out.push('"');
    for ch in s.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            c if (c as u32) < 0x20 => out.push(' '),
            c => out.push(c),
        }
    }
    out.push('"');
}

pub fn jticks(out: &mut String, name: &str, ticks: &[Tick]) {
    jstr(out, name);
    out.push_str(":[");
    for (i, t) in ticks.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push('[');
        jnum(out, t.px as f64);
        out.push(',');
        jstr(out, &t.label);
        out.push(']');
    }
    out.push(']');
}

/// Marks that change on hover or selection are drawn straight into the finished
/// pixels of a cached frame (additively, in display space, no bloom), so moving the
/// pointer costs a copy of the cached frame plus a few hundred pixels.
pub mod ov {
    use crate::gfx::Frame;

    /// 0xRRGGBB -> display-space channel values 0..255.
    pub fn rgb(c: u32) -> [f32; 3] {
        [((c >> 16) & 0xff) as f32, ((c >> 8) & 0xff) as f32, (c & 0xff) as f32]
    }

    #[inline]
    pub fn add(f: &mut Frame, x: i32, y: i32, c: [f32; 3], a: f32) {
        if x < 0 || y < 0 || x as usize >= f.w || y as usize >= f.h || a <= 0.0 {
            return;
        }
        let i = y as usize * f.w + x as usize;
        let p = f.px[i];
        let ch = |s: u32, v: f32| ((((p >> s) & 0xff) as f32 + v * a).min(255.0) as u32) << s;
        f.px[i] = 0xff00_0000 | ch(0, c[0]) | ch(8, c[1]) | ch(16, c[2]);
    }

    /// Anti-aliased 1 px line (Xiaolin Wu).
    pub fn line(f: &mut Frame, a: [f32; 2], b: [f32; 2], c: [f32; 3], alpha: f32) {
        if !(a[0].is_finite() && a[1].is_finite() && b[0].is_finite() && b[1].is_finite()) {
            return;
        }
        let steep = (b[1] - a[1]).abs() > (b[0] - a[0]).abs();
        let (mut p, mut q) = if steep { ([a[1], a[0]], [b[1], b[0]]) } else { (a, b) };
        if p[0] > q[0] {
            std::mem::swap(&mut p, &mut q);
        }
        let limit = if steep { f.h } else { f.w } as f32;
        let span = q[0] - p[0];
        let grad = if span < 1e-4 { 0.0 } else { (q[1] - p[1]) / span };
        let start = ((p[0] - 0.5).round()).max(0.0) as i32;
        let end = ((q[0] - 0.5).round()).min(limit) as i32;
        for i in start..=end {
            let y = p[1] + grad * (i as f32 + 0.5 - p[0]) - 0.5;
            let fy = y.floor();
            let t = y - fy;
            let v = fy as i32;
            if steep {
                add(f, v, i, c, alpha * (1.0 - t));
                add(f, v + 1, i, c, alpha * t);
            } else {
                add(f, i, v, c, alpha * (1.0 - t));
                add(f, i, v + 1, c, alpha * t);
            }
        }
    }

    pub fn circle(f: &mut Frame, cx: f32, cy: f32, r: f32, c: [f32; 3], alpha: f32) {
        let n = ((r * 0.75) as usize).clamp(16, 256);
        let mut prev = [cx + r, cy];
        for i in 1..=n {
            let t = i as f32 / n as f32 * std::f32::consts::TAU;
            let p = [cx + r * t.cos(), cy + r * t.sin()];
            line(f, prev, p, c, alpha);
            prev = p;
        }
    }

    /// Filled rectangle with fractional edge coverage.
    pub fn rect(f: &mut Frame, x0: f32, y0: f32, x1: f32, y1: f32, c: [f32; 3], alpha: f32) {
        let xa = x0.floor().max(0.0) as i32;
        let ya = y0.floor().max(0.0) as i32;
        let xb = (x1.ceil().max(0.0) as i32).min(f.w as i32);
        let yb = (y1.ceil().max(0.0) as i32).min(f.h as i32);
        for y in ya..yb {
            let cy = ((y as f32 + 1.0).min(y1) - (y as f32).max(y0)).clamp(0.0, 1.0);
            for x in xa..xb {
                let cx = ((x as f32 + 1.0).min(x1) - (x as f32).max(x0)).clamp(0.0, 1.0);
                add(f, x, y, c, alpha * cx * cy);
            }
        }
    }

    /// Rectangle outline `w` px wide, drawn inside the rectangle.
    #[allow(clippy::too_many_arguments)]
    pub fn outline(f: &mut Frame, x0: f32, y0: f32, x1: f32, y1: f32, w: f32, c: [f32; 3], alpha: f32) {
        let w = w.max(1.0).min((x1 - x0) / 2.0).min((y1 - y0) / 2.0);
        rect(f, x0, y0, x1, y0 + w, c, alpha);
        rect(f, x0, y1 - w, x1, y1, c, alpha);
        rect(f, x0, y0 + w, x0 + w, y1 - w, c, alpha);
        rect(f, x1 - w, y0 + w, x1, y1 - w, c, alpha);
    }

    pub fn disc(f: &mut Frame, cx: f32, cy: f32, r: f32, c: [f32; 3], alpha: f32) {
        let (x0, y0) = ((cx - r - 1.0).floor() as i32, (cy - r - 1.0).floor() as i32);
        let (x1, y1) = ((cx + r + 1.0).ceil() as i32, (cy + r + 1.0).ceil() as i32);
        for y in y0..y1 {
            for x in x0..x1 {
                let d = ((x as f32 + 0.5 - cx).powi(2) + (y as f32 + 0.5 - cy).powi(2)).sqrt();
                add(f, x, y, c, alpha * (r + 0.5 - d).clamp(0.0, 1.0));
            }
        }
    }
}

/// The finished pixels of a frame's static content, restored before each overlay.
#[derive(Default)]
pub struct Cache {
    px: Vec<u32>,
    pub valid: bool,
}

impl Cache {
    /// Restores the cached frame into `f.px`; false when it must be re-rendered.
    pub fn restore(&self, f: &mut Frame) -> bool {
        if self.valid && self.px.len() == f.px.len() {
            f.px.copy_from_slice(&self.px);
            true
        } else {
            false
        }
    }
    pub fn store(&mut self, f: &Frame) {
        self.px.clear();
        self.px.extend_from_slice(&f.px);
        self.valid = true;
    }
}
