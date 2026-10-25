//! The shared software rasteriser every instrument draws with.
//!
//! A `Frame` has three layers:
//! - `bg`: an opaque sRGB background the view paints when its geometry changes
//!   (sky, a shaded sphere, a cross-section of the mantle...);
//! - `light`: an additive HDR buffer in linear RGB that is cleared every frame and
//!   receives everything that glows (quakes, lines, wavefronts);
//! - `px`: the output, `bg + tonemap(light + bloom(light))`, as little-endian RGBA
//!   ready for canvas `ImageData` or a PNG encoder.
//!
//! Everything is single-threaded and allocation-free per frame.

use crate::color::{to_srgb, Rgb};

/// Splats are cut off this many standard deviations out (the kernel is 4% there).
pub const CUTOFF: f32 = 2.5;

pub struct Frame {
    pub w: usize,
    pub h: usize,
    pub light: Vec<f32>,
    pub bg: Vec<u32>,
    pub px: Vec<u32>,
    /// Bloom strength; 0 disables the pass.
    pub bloom: f32,
    /// Multiplies light before tonemapping.
    pub exposure: f32,
    gauss: [f32; 257],
    tone: Vec<u8>,
    srgb: Vec<u8>,
    // Bloom pyramid: quarter and eighth resolution, linear RGB.
    q: Level,
    e: Level,
    tmp: Vec<f32>,
    /// One vertically interpolated quarter-res row, and per-column (index, weight).
    row: Vec<f32>,
    cols: Vec<(usize, f32)>,
}

#[derive(Default)]
struct Level {
    w: usize,
    h: usize,
    buf: Vec<f32>,
}

impl Default for Frame {
    fn default() -> Self {
        Self::new(1, 1)
    }
}

impl Frame {
    pub fn new(w: usize, h: usize) -> Self {
        let mut gauss = [0.0; 257];
        for (i, g) in gauss.iter_mut().enumerate() {
            *g = (-(i as f32 * CUTOFF * CUTOFF / 256.0) / 2.0).exp();
        }
        // HDR -> display: soft exponential shoulder, then sRGB encode.
        let tone = (0..4096)
            .map(|i| {
                let x = i as f32 / 4096.0 * 8.0;
                (to_srgb(1.0 - (-x).exp()) * 255.0 + 0.5) as u8
            })
            .collect();
        let srgb = (0..4096).map(|i| (to_srgb(i as f32 / 4095.0) * 255.0 + 0.5) as u8).collect();
        let mut f = Frame {
            w: 0,
            h: 0,
            light: Vec::new(),
            bg: Vec::new(),
            px: Vec::new(),
            bloom: 0.0,
            exposure: 1.0,
            gauss,
            tone,
            srgb,
            q: Level::default(),
            e: Level::default(),
            tmp: Vec::new(),
            row: Vec::new(),
            cols: Vec::new(),
        };
        f.resize(w, h);
        f
    }

    pub fn resize(&mut self, w: usize, h: usize) {
        let (w, h) = (w.max(1), h.max(1));
        if (w, h) == (self.w, self.h) {
            return;
        }
        self.w = w;
        self.h = h;
        self.light = vec![0.0; w * h * 3];
        self.bg = vec![0xff00_0000; w * h];
        self.px = vec![0xff00_0000; w * h];
        let (qw, qh) = (w.div_ceil(4), h.div_ceil(4));
        self.q = Level { w: qw, h: qh, buf: vec![0.0; qw * qh * 3] };
        let (ew, eh) = (qw.div_ceil(2), qh.div_ceil(2));
        self.e = Level { w: ew, h: eh, buf: vec![0.0; ew * eh * 3] };
        self.tmp = vec![0.0; qw * qh * 3];
        // One extra entry so `a + 1` is always in range.
        self.row = vec![0.0; (qw + 1) * 3];
        self.cols = (0..w)
            .map(|x| {
                let fx = ((x as f32 + 0.5) / 4.0 - 0.5).clamp(0.0, (qw - 1) as f32);
                (fx as usize, fx - (fx as usize) as f32)
            })
            .collect();
    }

    /// Start a new frame: clears the light layer, keeps the background.
    pub fn clear(&mut self) {
        self.light.fill(0.0);
    }

    /// Linear RGB -> packed opaque sRGB, via a lookup table (fast enough for full-frame fills).
    #[inline]
    pub fn pack(&self, c: Rgb) -> u32 {
        let b = |v: f32| self.srgb[((v * 4095.0) as usize).min(4095)] as u32;
        0xff00_0000 | b(c[0]) | (b(c[1]) << 8) | (b(c[2]) << 16)
    }

    /// Repaint the whole background from a per-pixel function returning linear RGB.
    pub fn paint_bg(&mut self, mut f: impl FnMut(usize, usize) -> Rgb) {
        for y in 0..self.h {
            for x in 0..self.w {
                let c = f(x, y);
                self.bg[y * self.w + x] = self.pack(c);
            }
        }
    }

    /// Additive single pixel.
    #[inline]
    pub fn add(&mut self, x: i32, y: i32, c: Rgb, a: f32) {
        if x < 0 || y < 0 || x as usize >= self.w || y as usize >= self.h {
            return;
        }
        let i = (y as usize * self.w + x as usize) * 3;
        self.light[i] += c[0] * a;
        self.light[i + 1] += c[1] * a;
        self.light[i + 2] += c[2] * a;
    }

    /// Gaussian splat with standard deviation `r` px, cut off at 2.5σ. `a` is the peak.
    pub fn splat(&mut self, sx: f32, sy: f32, r: f32, c: Rgb, a: f32) {
        let r = r.max(0.7);
        let ext = r * CUTOFF;
        let x0 = (sx - ext).round().max(0.0) as usize;
        let y0 = (sy - ext).round().max(0.0) as usize;
        let x1 = ((sx + ext).round().max(0.0) as usize).min(self.w);
        let y1 = ((sy + ext).round().max(0.0) as usize).min(self.h);
        if x0 >= x1 || y0 >= y1 {
            return;
        }
        let k = 256.0 / (CUTOFF * CUTOFF) / (r * r);
        let c = c.map(|v| v * a);
        for y in y0..y1 {
            let dy = y as f32 + 0.5 - sy;
            let row = &mut self.light[(y * self.w + x0) * 3..(y * self.w + x1) * 3];
            for (j, px) in row.chunks_exact_mut(3).enumerate() {
                let dx = (x0 + j) as f32 + 0.5 - sx;
                let d = (dx * dx + dy * dy) * k;
                if d < 256.0 {
                    let g = self.gauss[d as usize];
                    px[0] += c[0] * g;
                    px[1] += c[1] * g;
                    px[2] += c[2] * g;
                }
            }
        }
    }

    /// Anti-aliased 1px line (Xiaolin Wu), additive.
    pub fn line(&mut self, a: [f32; 2], b: [f32; 2], c: Rgb, alpha: f32) {
        if !(a[0].is_finite() && a[1].is_finite() && b[0].is_finite() && b[1].is_finite()) {
            return;
        }
        let steep = (b[1] - a[1]).abs() > (b[0] - a[0]).abs();
        let (mut p, mut q) = if steep { ([a[1], a[0]], [b[1], b[0]]) } else { (a, b) };
        if p[0] > q[0] {
            std::mem::swap(&mut p, &mut q);
        }
        // Clip the major axis to the frame so huge off-screen segments cost nothing.
        let limit = if steep { self.h } else { self.w } as f32;
        let span = q[0] - p[0];
        let grad = if span < 1e-4 { 0.0 } else { (q[1] - p[1]) / span };
        let start = ((p[0] - 0.5).round()).max(0.0) as i32;
        let end = ((q[0] - 0.5).round()).min(limit) as i32;
        for i in start..=end {
            let y = p[1] + grad * (i as f32 + 0.5 - p[0]) - 0.5;
            let fy = y.floor();
            let f = y - fy;
            let (u, v) = (i, fy as i32);
            if steep {
                self.add(v, u, c, alpha * (1.0 - f));
                self.add(v + 1, u, c, alpha * f);
            } else {
                self.add(u, v, c, alpha * (1.0 - f));
                self.add(u, v + 1, c, alpha * f);
            }
        }
    }

    /// Thick anti-aliased line: a capsule of half-width `hw` px, additive.
    pub fn thick_line(&mut self, a: [f32; 2], b: [f32; 2], hw: f32, c: Rgb, alpha: f32) {
        if hw <= 0.75 {
            return self.line(a, b, c, alpha);
        }
        let x0 = (a[0].min(b[0]) - hw - 1.0).floor().max(0.0) as usize;
        let y0 = (a[1].min(b[1]) - hw - 1.0).floor().max(0.0) as usize;
        let x1 = ((a[0].max(b[0]) + hw + 1.0).ceil().max(0.0) as usize).min(self.w);
        let y1 = ((a[1].max(b[1]) + hw + 1.0).ceil().max(0.0) as usize).min(self.h);
        let (dx, dy) = (b[0] - a[0], b[1] - a[1]);
        let len2 = (dx * dx + dy * dy).max(1e-6);
        for y in y0..y1 {
            for x in x0..x1 {
                let (px, py) = (x as f32 + 0.5 - a[0], y as f32 + 0.5 - a[1]);
                let t = ((px * dx + py * dy) / len2).clamp(0.0, 1.0);
                let (ex, ey) = (px - dx * t, py - dy * t);
                let d = (ex * ex + ey * ey).sqrt();
                let cov = (hw + 0.5 - d).clamp(0.0, 1.0);
                if cov > 0.0 {
                    let i = (y * self.w + x) * 3;
                    self.light[i] += c[0] * alpha * cov;
                    self.light[i + 1] += c[1] * alpha * cov;
                    self.light[i + 2] += c[2] * alpha * cov;
                }
            }
        }
    }

    /// Screen-space circle outline, additive.
    pub fn circle(&mut self, cx: f32, cy: f32, r: f32, c: Rgb, alpha: f32) {
        let n = ((r * 0.75) as usize).clamp(12, 256);
        let mut prev = [cx + r, cy];
        for i in 1..=n {
            let t = i as f32 / n as f32 * std::f32::consts::TAU;
            let p = [cx + r * t.cos(), cy + r * t.sin()];
            self.line(prev, p, c, alpha);
            prev = p;
        }
    }

    /// Anti-aliased filled disc, additive.
    pub fn disc(&mut self, cx: f32, cy: f32, r: f32, c: Rgb, alpha: f32) {
        let x0 = (cx - r - 1.0).floor().max(0.0) as usize;
        let y0 = (cy - r - 1.0).floor().max(0.0) as usize;
        let x1 = ((cx + r + 1.0).ceil().max(0.0) as usize).min(self.w);
        let y1 = ((cy + r + 1.0).ceil().max(0.0) as usize).min(self.h);
        for y in y0..y1 {
            for x in x0..x1 {
                let d = ((x as f32 + 0.5 - cx).powi(2) + (y as f32 + 0.5 - cy).powi(2)).sqrt();
                let cov = (r + 0.5 - d).clamp(0.0, 1.0);
                if cov > 0.0 {
                    let i = (y * self.w + x) * 3;
                    self.light[i] += c[0] * alpha * cov;
                    self.light[i + 1] += c[1] * alpha * cov;
                    self.light[i + 2] += c[2] * alpha * cov;
                }
            }
        }
    }

    /// Additive axis-aligned rectangle with fractional edge coverage.
    pub fn rect(&mut self, x0: f32, y0: f32, x1: f32, y1: f32, c: Rgb, alpha: f32) {
        let xa = x0.floor().max(0.0) as usize;
        let ya = y0.floor().max(0.0) as usize;
        let xb = (x1.ceil().max(0.0) as usize).min(self.w);
        let yb = (y1.ceil().max(0.0) as usize).min(self.h);
        for y in ya..yb {
            let cy = ((y as f32 + 1.0).min(y1) - (y as f32).max(y0)).clamp(0.0, 1.0);
            for x in xa..xb {
                let cx = ((x as f32 + 1.0).min(x1) - (x as f32).max(x0)).clamp(0.0, 1.0);
                let a = alpha * cx * cy;
                let i = (y * self.w + x) * 3;
                self.light[i] += c[0] * a;
                self.light[i + 1] += c[1] * a;
                self.light[i + 2] += c[2] * a;
            }
        }
    }

    /// Bloom, then tonemap `light` over `bg` into `px`.
    pub fn finish(&mut self) {
        let bloom = self.bloom;
        if bloom > 0.0 {
            self.build_bloom();
        }
        let (w, h) = (self.w, self.h);
        let exp = self.exposure * 512.0;
        let (qw, qh) = (self.q.w, self.q.h);
        let tone = &self.tone;
        for y in 0..h {
            // Vertically interpolate one quarter-res bloom row, then lerp along it.
            if bloom > 0.0 {
                let fy = ((y as f32 + 0.5) / 4.0 - 0.5).clamp(0.0, (qh - 1) as f32);
                let y0 = fy as usize;
                let y1 = (y0 + 1).min(qh - 1);
                let ty = fy - y0 as f32;
                let r0 = &self.q.buf[y0 * qw * 3..(y0 + 1) * qw * 3];
                let r1 = &self.q.buf[y1 * qw * 3..(y1 + 1) * qw * 3];
                for ((o, &a), &b) in self.row.iter_mut().zip(r0).zip(r1) {
                    *o = (a + (b - a) * ty) * bloom;
                }
            }
            let row = &self.row;
            let light = &self.light[y * w * 3..(y + 1) * w * 3];
            let bgs = &self.bg[y * w..(y + 1) * w];
            let out = &mut self.px[y * w..(y + 1) * w];
            for (x, ((o, l), &bg)) in out.iter_mut().zip(light.chunks_exact(3)).zip(bgs).enumerate() {
                let (mut r, mut g, mut b) = (l[0], l[1], l[2]);
                if bloom > 0.0 {
                    let (a, tx) = self.cols[x];
                    let (ra, rb) = (&row[a * 3..a * 3 + 3], &row[a * 3 + 3..a * 3 + 6]);
                    r += ra[0] + (rb[0] - ra[0]) * tx;
                    g += ra[1] + (rb[1] - ra[1]) * tx;
                    b += ra[2] + (rb[2] - ra[2]) * tx;
                }
                // Below one LUT step nothing would change; keep the background.
                if r.max(g).max(b) * exp < 1.0 {
                    *o = bg;
                    continue;
                }
                // Bright clusters bleed into white, like overexposed embers.
                let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                if lum > 0.9 {
                    let over = (lum - 0.9) * 0.5;
                    r += over;
                    g += over;
                    b += over;
                }
                let t = |v: f32| tone[(v * exp).min(4095.0) as usize] as u32;
                let add = |v: u32, sh: u32| (((bg >> sh) & 0xff) + v).min(255) << sh;
                *o = 0xff00_0000 | add(t(r), 0) | add(t(g), 8) | add(t(b), 16);
            }
        }
    }

    fn build_bloom(&mut self) {
        let (w, h) = (self.w, self.h);
        // Light -> quarter res (4x4 box average), a row of blocks at a time.
        let q = &mut self.q;
        q.buf.fill(0.0);
        for y in 0..h {
            let dst = &mut q.buf[(y / 4) * q.w * 3..(y / 4 + 1) * q.w * 3];
            let src = &self.light[y * w * 3..(y + 1) * w * 3];
            for (d, block) in dst.chunks_exact_mut(3).zip(src.chunks(12)) {
                for p in block.chunks_exact(3) {
                    d[0] += p[0];
                    d[1] += p[1];
                    d[2] += p[2];
                }
            }
        }
        for v in q.buf.iter_mut() {
            *v *= 1.0 / 16.0;
        }
        blur(&mut q.buf, &mut self.tmp, q.w, q.h, &[0.227, 0.194, 0.121, 0.054, 0.016]);
        // Quarter -> eighth, blur wider, then add back for a long soft tail.
        let e = &mut self.e;
        e.buf.fill(0.0);
        for y in 0..q.h {
            for x in 0..q.w {
                let i = (y * q.w + x) * 3;
                let j = ((y / 2) * e.w + x / 2) * 3;
                for k in 0..3 {
                    e.buf[j + k] += q.buf[i + k] * 0.25;
                }
            }
        }
        let tmp = &mut self.tmp[..e.w * e.h * 3];
        blur(&mut e.buf, tmp, e.w, e.h, &[0.16, 0.148, 0.117, 0.08, 0.047, 0.024, 0.01]);
        // Bilinear upsample back to quarter res (nearest would show 8px blocks).
        for y in 0..q.h {
            let fy = ((y as f32 + 0.5) / 2.0 - 0.5).clamp(0.0, (e.h - 1) as f32);
            let (y0, ty) = (fy as usize, fy - (fy as usize) as f32);
            let y1 = (y0 + 1).min(e.h - 1);
            for x in 0..q.w {
                let fx = ((x as f32 + 0.5) / 2.0 - 0.5).clamp(0.0, (e.w - 1) as f32);
                let (x0, tx) = (fx as usize, fx - (fx as usize) as f32);
                let x1 = (x0 + 1).min(e.w - 1);
                let i = (y * q.w + x) * 3;
                for k in 0..3 {
                    let at = |yy: usize, xx: usize| e.buf[(yy * e.w + xx) * 3 + k];
                    let top = at(y0, x0) + (at(y0, x1) - at(y0, x0)) * tx;
                    let bot = at(y1, x0) + (at(y1, x1) - at(y1, x0)) * tx;
                    q.buf[i + k] += (top + (bot - top) * ty) * 0.9;
                }
            }
        }
    }
}

/// Separable symmetric blur; `k[0]` is the centre tap. Edges clamp.
fn blur(buf: &mut [f32], tmp: &mut [f32], w: usize, h: usize, k: &[f32]) {
    // Horizontal: buf -> tmp.
    for y in 0..h {
        let src = &buf[y * w * 3..(y + 1) * w * 3];
        let dst = &mut tmp[y * w * 3..(y + 1) * w * 3];
        for x in 0..w {
            let mut acc = [src[x * 3] * k[0], src[x * 3 + 1] * k[0], src[x * 3 + 2] * k[0]];
            for (t, &wgt) in k.iter().enumerate().skip(1) {
                let l = x.saturating_sub(t) * 3;
                let rr = (x + t).min(w - 1) * 3;
                acc[0] += (src[l] + src[rr]) * wgt;
                acc[1] += (src[l + 1] + src[rr + 1]) * wgt;
                acc[2] += (src[l + 2] + src[rr + 2]) * wgt;
            }
            dst[x * 3..x * 3 + 3].copy_from_slice(&acc);
        }
    }
    // Vertical: tmp -> buf, a whole row at a time so the inner loop is contiguous.
    let stride = w * 3;
    for y in 0..h {
        let dst = &mut buf[y * stride..(y + 1) * stride];
        let c = &tmp[y * stride..(y + 1) * stride];
        for (d, &v) in dst.iter_mut().zip(c) {
            *d = v * k[0];
        }
        for (t, &wgt) in k.iter().enumerate().skip(1) {
            let up = &tmp[y.saturating_sub(t) * stride..][..stride];
            let dn = &tmp[(y + t).min(h - 1) * stride..][..stride];
            for ((d, &a), &b) in dst.iter_mut().zip(up).zip(dn) {
                *d += (a + b) * wgt;
            }
        }
    }
}

/// 3-vector helpers shared by the instruments.
pub mod v3 {
    pub type V = [f32; 3];
    pub fn dot(a: V, b: V) -> f32 {
        a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
    }
    pub fn cross(a: V, b: V) -> V {
        [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
    }
    pub fn add(a: V, b: V) -> V {
        [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
    }
    pub fn sub(a: V, b: V) -> V {
        [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
    }
    pub fn scale(a: V, k: f32) -> V {
        [a[0] * k, a[1] * k, a[2] * k]
    }
    pub fn len(a: V) -> f32 {
        dot(a, a).sqrt()
    }
    pub fn norm(a: V) -> V {
        let l = len(a).max(1e-12);
        scale(a, 1.0 / l)
    }
    /// Unit vector in Earth-centred coordinates: x towards (0°, 0°), y towards (0°, 90°E), z north.
    pub fn from_latlon(lat: f32, lon: f32) -> V {
        let (la, lo) = (lat.to_radians(), lon.to_radians());
        [la.cos() * lo.cos(), la.cos() * lo.sin(), la.sin()]
    }
    pub fn to_latlon(v: V) -> (f32, f32) {
        let v = norm(v);
        (v[2].clamp(-1.0, 1.0).asin().to_degrees(), v[1].atan2(v[0]).to_degrees())
    }
    /// Great-circle angle between two unit vectors, radians.
    pub fn angle(a: V, b: V) -> f32 {
        len(cross(a, b)).atan2(dot(a, b))
    }
    /// Spherical interpolation between unit vectors.
    pub fn slerp(a: V, b: V, t: f32) -> V {
        let w = angle(a, b);
        if w < 1e-6 {
            return a;
        }
        let s = w.sin();
        add(scale(a, ((1.0 - t) * w).sin() / s), scale(b, (t * w).sin() / s))
    }
}

pub fn smoothstep(e0: f32, e1: f32, x: f32) -> f32 {
    let t = ((x - e0) / (e1 - e0)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// Cheap deterministic hash -> [0, 1), for star fields and noise.
pub fn hash(mut x: u32) -> f32 {
    x ^= x >> 16;
    x = x.wrapping_mul(0x7feb_352d);
    x ^= x >> 15;
    x = x.wrapping_mul(0x846c_a68b);
    x ^= x >> 16;
    (x >> 8) as f32 / (1u32 << 24) as f32
}
