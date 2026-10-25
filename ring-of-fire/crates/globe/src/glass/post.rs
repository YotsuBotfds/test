//! Bloom and tonemap for the glass view, `px = bg + tone(light + bloom)`, arranged
//! so the cost follows what is on screen rather than the pixel count:
//!
//! - the bloom pyramid is built from a quarter-resolution glow buffer the quakes
//!   splat into directly, so the full-resolution light is never downsampled;
//! - `base = bg + tone(bloom)` is formed at half resolution (both layers are
//!   smooth) and upsampled with packed 8-bit arithmetic;
//! - the float light buffer is read (and cleared) only in the 8x8 tiles that
//!   something was drawn into; there `tone(light + bloom) - tone(bloom)` is added
//!   to the base, which is exactly `bg + tone(light + bloom)` again.

use crate::color::to_srgb;

/// Tile size for the sparse light buffer, px.
pub const TILE: usize = 8;

const M: u32 = 0x00ff_00ff;

#[derive(Default)]
pub struct Post {
    w: usize,
    h: usize,
    q: Level,
    e: Level,
    s: Level,
    tmp: Vec<f32>,
    /// Bloom tonemapped to packed sRGB at quarter resolution, and base at half.
    qtone: Vec<u32>,
    base: Vec<u32>,
    hw: usize,
    hh: usize,
    /// One vertically interpolated row of float bloom (for lit tiles), and each
    /// full-res column's left bloom texel and weight.
    brow: Vec<f32>,
    cols: Vec<(u32, f32)>,
    /// Two horizontally upsampled rows in 16-bit lanes, for the half- and the
    /// full-resolution passes.
    hrows: [Lanes; 2],
    frows: [Lanes; 2],
    pub tone: Vec<u8>,
}

#[derive(Default)]
struct Lanes {
    rb: Vec<u32>,
    ga: Vec<u32>,
    row: usize,
}

/// Two source texels and the first one's weight in quarters (1 or 3).
#[derive(Clone, Copy)]
struct Tap {
    a: u32,
    b: u32,
    w: u32,
}

#[derive(Default)]
struct Level {
    w: usize,
    h: usize,
    buf: Vec<f32>,
}

impl Level {
    fn new(w: usize, h: usize) -> Self {
        Level { w, h, buf: vec![0.0; w * h * 3] }
    }
}

/// Gaussian, sigma ~2 texels, centre tap first.
const K4: [f32; 5] = [0.2270, 0.1945, 0.1216, 0.0540, 0.0162];
/// Gaussian, sigma ~1 texel.
const K2: [f32; 3] = [0.4026, 0.2442, 0.0545];

/// Saturating per-byte add of two packed RGBA values (alpha forced opaque).
#[inline]
pub fn add_sat(a: u32, b: u32) -> u32 {
    let rb = (a & M) + (b & M);
    let ga = ((a >> 8) & M) + ((b >> 8) & M);
    let rb = (rb | ((rb & 0x0100_0100) - ((rb & 0x0100_0100) >> 8))) & M;
    let ga = (ga | ((ga & 0x0100_0100) - ((ga & 0x0100_0100) >> 8))) & M;
    rb | (ga << 8) | 0xff00_0000
}

/// For a 2x upsample: the texel at or left of output `x` and the one after it,
/// with the first one's weight in quarters (1 or 3).
fn tap2(x: usize, n: usize) -> Tap {
    let m = x / 2;
    let (a, b, w) = if x.is_multiple_of(2) { (m.saturating_sub(1), m, 1) } else { (m, m + 1, 3) };
    Tap { a: a.min(n - 1) as u32, b: b.min(n - 1) as u32, w }
}

/// Horizontal 2x upsample of a packed row into 16-bit lanes (weights in
/// quarters, so each lane holds up to 4 x 255).
fn hup(src: &[u32], rb: &mut [u32], ga: &mut [u32]) {
    let n = src.len();
    for (m, (orb, oga)) in rb.chunks_mut(2).zip(ga.chunks_mut(2)).enumerate() {
        let (l, c, r) = (src[m.saturating_sub(1).min(n - 1)], src[m.min(n - 1)], src[(m + 1).min(n - 1)]);
        orb[0] = (l & M) + (c & M) * 3;
        oga[0] = ((l >> 8) & M) + ((c >> 8) & M) * 3;
        if orb.len() > 1 {
            orb[1] = (c & M) * 3 + (r & M);
            oga[1] = ((c >> 8) & M) * 3 + ((r >> 8) & M);
        }
    }
}

/// Make sure source rows `a` and `b` are upsampled into the two-slot cache;
/// returns their slots.
fn rows(cache: &mut [Lanes; 2], src: &[u32], n: usize, a: usize, b: usize) -> (usize, usize) {
    for need in [a, b] {
        if cache[0].row != need && cache[1].row != need {
            let slot = if cache[0].row == a || cache[0].row == b { 1 } else { 0 };
            let l = &mut cache[slot];
            hup(&src[need * n..(need + 1) * n], &mut l.rb, &mut l.ga);
            l.row = need;
        }
    }
    let slot = |r: usize| if cache[0].row == r { 0 } else { 1 };
    (slot(a), slot(b))
}

impl Post {
    pub fn resize(&mut self, w: usize, h: usize) {
        if (w, h) == (self.w, self.h) {
            return;
        }
        self.w = w;
        self.h = h;
        let (qw, qh) = (w.div_ceil(4), h.div_ceil(4));
        let (ew, eh) = (qw.div_ceil(2), qh.div_ceil(2));
        let (sw, sh) = (ew.div_ceil(2), eh.div_ceil(2));
        self.q = Level::new(qw, qh);
        self.e = Level::new(ew, eh);
        self.s = Level::new(sw, sh);
        self.tmp = vec![0.0; qw * qh * 3];
        self.qtone = vec![0; qw * qh];
        self.hw = w.div_ceil(2);
        self.hh = h.div_ceil(2);
        self.base = vec![0; self.hw * self.hh];
        self.brow = vec![0.0; (qw + 1) * 3];
        let lanes = |n: usize| Lanes { rb: vec![0; n], ga: vec![0; n], row: usize::MAX };
        self.hrows = [lanes(self.hw), lanes(self.hw)];
        self.frows = [lanes(w), lanes(w)];
        self.cols = (0..w)
            .map(|x| {
                let fx = ((x as f32 + 0.5) / 4.0 - 0.5).clamp(0.0, (qw - 1) as f32);
                (fx as u32, fx - fx.floor())
            })
            .collect();
        if self.tone.is_empty() {
            self.tone = (0..4096)
                .map(|i| {
                    let x = i as f32 / 4096.0 * 8.0;
                    (to_srgb(1.0 - (-x).exp()) * 255.0 + 0.5) as u8
                })
                .collect();
        }
    }

    /// Size of the quarter-resolution glow buffer the caller splats into.
    pub fn quarter(&self) -> (usize, usize) {
        (self.q.w, self.q.h)
    }

    /// Display value (0..255) the tonemap gives a linear HDR value.
    #[inline]
    pub fn t(&self, v: f32) -> u32 {
        self.tone[((v * 512.0) as i32).clamp(0, 4095) as usize] as u32
    }

    /// Bloom at quarter resolution (linear, already scaled by `strength`).
    fn build(&mut self, glow: &[f32], strength: f32) {
        self.q.buf.copy_from_slice(glow);
        down2(&self.q, &mut self.e);
        down2(&self.e, &mut self.s);
        blur(&mut self.s, &mut self.tmp, &K4);
        blur(&mut self.e, &mut self.tmp, &K4);
        add_up2(&self.s, &mut self.e, 1.0);
        blur(&mut self.q, &mut self.tmp, &K2);
        // Tight glow from the quarter level plus the wide tail from below.
        for v in self.q.buf.iter_mut() {
            *v *= 0.55 * strength;
        }
        add_up2(&self.e, &mut self.q, 0.6 * strength);
    }

    /// Compose a frame. `half` is the background at half resolution, `light` the
    /// full-res HDR layer (only tiles flagged in `tiles` are read, then cleared
    /// along with their flags), `glow` the quarter-res light that feeds the bloom.
    #[allow(clippy::too_many_arguments)]
    pub fn compose(&mut self, half: &[u32], light: &mut [f32], tiles: &mut [u8], glow: &[f32], px: &mut [u32], bloom: f32, exposure: f32) {
        let (w, h, hw, hh) = (self.w, self.h, self.hw, self.hh);
        let (qw, qh) = (self.q.w, self.q.h);
        if bloom > 0.0 {
            self.build(glow, bloom * exposure);
        } else {
            self.q.buf.fill(0.0);
        }
        // Bloom -> packed sRGB at quarter resolution.
        for (o, c) in self.qtone.iter_mut().zip(self.q.buf.chunks_exact(3)) {
            let t = |v: f32| self.tone[((v * 512.0) as i32).clamp(0, 4095) as usize] as u32;
            *o = t(c[0]) | (t(c[1]) << 8) | (t(c[2]) << 16);
        }
        // base = bg + tone(bloom), at half resolution.
        self.hrows.iter_mut().for_each(|l| l.row = usize::MAX);
        for hy in 0..hh {
            let t = tap2(hy, qh);
            let (sa, sb) = rows(&mut self.hrows, &self.qtone, qw, t.a as usize, t.b as usize);
            let (la, lb) = (&self.hrows[sa], &self.hrows[sb]);
            let hrow = &half[hy * hw..(hy + 1) * hw];
            let out = &mut self.base[hy * hw..(hy + 1) * hw];
            let wa = t.w;
            let wb = 4 - wa;
            for (((((o, &bg), &a1), &a2), &b1), &b2) in out.iter_mut().zip(hrow).zip(&la.rb).zip(&la.ga).zip(&lb.rb).zip(&lb.ga) {
                let r = ((a1 * wa + b1 * wb + 0x0008_0008) >> 4) & M;
                let g = ((a2 * wa + b2 * wb + 0x0008_0008) >> 4) & M;
                *o = add_sat(bg, r | (g << 8));
            }
        }
        // Full resolution: upsampled base, plus the light where something was drawn.
        let tw = w.div_ceil(TILE);
        let exp = exposure * 512.0;
        self.frows.iter_mut().for_each(|l| l.row = usize::MAX);
        for y in 0..h {
            let t = tap2(y, hh);
            let (sa, sb) = rows(&mut self.frows, &self.base, hw, t.a as usize, t.b as usize);
            let (la, lb) = (&self.frows[sa], &self.frows[sb]);
            let out = &mut px[y * w..(y + 1) * w];
            let wa = t.w;
            let wb = 4 - wa;
            for ((((o, &a1), &a2), &b1), &b2) in out.iter_mut().zip(&la.rb).zip(&la.ga).zip(&lb.rb).zip(&lb.ga) {
                let r = ((a1 * wa + b1 * wb + 0x0008_0008) >> 4) & M;
                let g = ((a2 * wa + b2 * wb + 0x0008_0008) >> 4) & M;
                *o = r | (g << 8) | 0xff00_0000;
            }
            let trow = &tiles[(y / TILE) * tw..(y / TILE + 1) * tw];
            if !trow.iter().any(|&t| t != 0) {
                continue;
            }
            let lrow = &mut light[y * w * 3..(y + 1) * w * 3];
            let mut brow_ready = bloom <= 0.0;
            for (ti, &flag) in trow.iter().enumerate() {
                if flag == 0 {
                    continue;
                }
                let x0 = ti * TILE;
                let x1 = (x0 + TILE).min(w);
                let ls = &mut lrow[x0 * 3..x1 * 3];
                // Most of a lit tile is dark: one vectorisable max, then clear and move on.
                if ls.iter().fold(0.0f32, |m, &v| m.max(v)) * exp < 1.0 {
                    ls.fill(0.0);
                    continue;
                }
                if !brow_ready {
                    // The bloom row, interpolated once per row and only when needed.
                    brow_ready = true;
                    let fy = ((y as f32 + 0.5) / 4.0 - 0.5).clamp(0.0, (qh - 1) as f32);
                    let y0 = fy as usize;
                    let y1 = (y0 + 1).min(qh - 1);
                    let ty = fy - y0 as f32;
                    let r0 = &self.q.buf[y0 * qw * 3..(y0 + 1) * qw * 3];
                    let r1 = &self.q.buf[y1 * qw * 3..(y1 + 1) * qw * 3];
                    for ((o, &a), &b) in self.brow.iter_mut().zip(r0).zip(r1) {
                        *o = a + (b - a) * ty;
                    }
                    let n = self.brow.len();
                    self.brow.copy_within(n - 6..n - 3, n - 3);
                }
                for ((o, l), &(a, tx)) in out[x0..x1].iter_mut().zip(ls.chunks_exact_mut(3)).zip(&self.cols[x0..x1]) {
                    let (mut r, mut g, mut b) = (l[0], l[1], l[2]);
                    if r.max(g).max(b) * exp < 1.0 {
                        if r != 0.0 || g != 0.0 || b != 0.0 {
                            l.fill(0.0);
                        }
                        continue;
                    }
                    l.fill(0.0);
                    let (mut br, mut bg, mut bb) = (0.0, 0.0, 0.0);
                    if bloom > 0.0 {
                        let a = a as usize * 3;
                        let (p, q) = (&self.brow[a..a + 3], &self.brow[a + 3..a + 6]);
                        br = p[0] + (q[0] - p[0]) * tx;
                        bg = p[1] + (q[1] - p[1]) * tx;
                        bb = p[2] + (q[2] - p[2]) * tx;
                    }
                    r = r * exposure + br;
                    g = g * exposure + bg;
                    b = b * exposure + bb;
                    // Bright clusters bleed into white, like overexposed embers.
                    let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                    if lum > 0.9 {
                        let over = (lum - 0.9) * 0.5;
                        r += over;
                        g += over;
                        b += over;
                    }
                    let d = |v: f32, under: f32| self.t(v).saturating_sub(self.t(under));
                    let add = d(r, br) | (d(g, bg) << 8) | (d(b, bb) << 16);
                    *o = add_sat(*o, add);
                }
            }
        }
        tiles.fill(0);
    }
}

fn down2(src: &Level, dst: &mut Level) {
    dst.buf.fill(0.0);
    for y in 0..src.h {
        let drow = &mut dst.buf[(y / 2) * dst.w * 3..(y / 2 + 1) * dst.w * 3];
        let srow = &src.buf[y * src.w * 3..(y + 1) * src.w * 3];
        for (x, p) in srow.chunks_exact(3).enumerate() {
            let d = &mut drow[(x / 2) * 3..(x / 2) * 3 + 3];
            d[0] += p[0] * 0.25;
            d[1] += p[1] * 0.25;
            d[2] += p[2] * 0.25;
        }
    }
}

/// dst += bilinear_upsample(src) * k, where dst is twice src's size (rounded up).
fn add_up2(src: &Level, dst: &mut Level, k: f32) {
    for y in 0..dst.h {
        let ty = tap2(y, src.h);
        let wy = ty.w as f32 * 0.25;
        let r0 = &src.buf[ty.a as usize * src.w * 3..][..src.w * 3];
        let r1 = &src.buf[ty.b as usize * src.w * 3..][..src.w * 3];
        let drow = &mut dst.buf[y * dst.w * 3..(y + 1) * dst.w * 3];
        for (x, d) in drow.chunks_exact_mut(3).enumerate() {
            let tx = tap2(x, src.w);
            let wx = tx.w as f32 * 0.25;
            let (a, b) = (tx.a as usize * 3, tx.b as usize * 3);
            for c in 0..3 {
                let top = r0[b + c] + (r0[a + c] - r0[b + c]) * wx;
                let bot = r1[b + c] + (r1[a + c] - r1[b + c]) * wx;
                d[c] += (bot + (top - bot) * wy) * k;
            }
        }
    }
}

/// Separable symmetric blur with clamped edges; `k[0]` is the centre tap.
fn blur(l: &mut Level, tmp: &mut Vec<f32>, k: &[f32]) {
    let (w, h) = (l.w, l.h);
    if tmp.len() < w * h * 3 {
        tmp.resize(w * h * 3, 0.0);
    }
    let r = k.len() - 1;
    // Horizontal: buf -> tmp. Edges clamp; the interior needs no checks.
    for y in 0..h {
        let src = &l.buf[y * w * 3..(y + 1) * w * 3];
        let dst = &mut tmp[y * w * 3..(y + 1) * w * 3];
        let tap = |x: usize, c: usize| -> f32 {
            let mut acc = src[x * 3 + c] * k[0];
            for (t, &wgt) in k.iter().enumerate().skip(1) {
                acc += (src[x.saturating_sub(t) * 3 + c] + src[(x + t).min(w - 1) * 3 + c]) * wgt;
            }
            acc
        };
        for x in (0..w.min(r)).chain(w.saturating_sub(r).max(r)..w) {
            for c in 0..3 {
                dst[x * 3 + c] = tap(x, c);
            }
        }
        if w > 2 * r {
            let n = (w - 2 * r) * 3;
            let mid = &mut dst[r * 3..r * 3 + n];
            for (i, o) in mid.iter_mut().enumerate() {
                *o = src[r * 3 + i] * k[0];
            }
            for (t, &wgt) in k.iter().enumerate().skip(1) {
                let lo = &src[(r - t) * 3..(r - t) * 3 + n];
                let hi = &src[(r + t) * 3..(r + t) * 3 + n];
                for ((o, &a), &b) in mid.iter_mut().zip(lo).zip(hi) {
                    *o += (a + b) * wgt;
                }
            }
        }
    }
    // Vertical: tmp -> buf, whole rows so the inner loop is contiguous.
    let stride = w * 3;
    for y in 0..h {
        let dst = &mut l.buf[y * stride..(y + 1) * stride];
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saturating_add_clamps_each_byte() {
        assert_eq!(add_sat(0xff10_20f0, 0x0020_3020) & 0x00ff_ffff, 0x0030_50ff);
        assert_eq!(add_sat(0, 0) >> 24, 0xff);
        assert_eq!(add_sat(0xff80_8080, 0xff80_8080) & 0x00ff_ffff, 0x00ff_ffff);
    }
}
