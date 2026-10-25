//! Per-pixel shading of the glass Earth: analytic ray casts against the glass shell,
//! the molten core, and the cut faces (planes through the centre whose intersection
//! of half-spaces is the removed region). Everything that does not glow (glass,
//! core, cross-section) is painted into the frame's opaque background.

use super::RC;
use crate::color::{hex, mix, Rgb};
use crate::gfx::v3::{self, V};

/// Glass absorption per Earth radius of path.
pub const SIGMA: f32 = 0.42;
/// Frosted cut faces: quakes this far behind a face (Earth radii) fade by 1/e.
pub const FROST: f32 = 0.055;

/// Everything the per-pixel and per-point tests need about one frame.
pub struct View {
    pub w: usize,
    pub h: usize,
    pub eye: V,
    pub right: V,
    pub up: V,
    pub fwd: V,
    /// Focal length in px.
    pub f: f32,
    pub cx: f32,
    pub cy: f32,
    /// Cut planes through the centre; the removed region is where `n.p > 0` for all.
    pub planes: [V; 2],
    pub np: usize,
    ne: [f32; 2],
    oo: f32,
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Hit {
    None,
    Core,
    Face(usize),
}

/// What a ray meets: the first opaque thing, the glass surfaces it crosses before
/// it, and how much glass it travels through.
#[derive(Clone, Copy, Debug)]
pub struct Trace {
    pub hit: Hit,
    pub t: f32,
    pub front: f32,
    pub back: f32,
    pub glass: f32,
    /// Ray parameter of the closest approach to the centre and that distance squared.
    pub tc: f32,
    pub h2: f32,
    pub inside: bool,
}

impl View {
    #[allow(clippy::too_many_arguments)]
    pub fn new(w: usize, h: usize, eye: V, basis: [V; 3], f: f32, planes: [V; 2], np: usize) -> Self {
        let ne = [v3::dot(planes[0], eye), v3::dot(planes[1], eye)];
        View {
            w,
            h,
            eye,
            right: basis[0],
            up: basis[1],
            fwd: basis[2],
            f,
            cx: w as f32 / 2.0,
            cy: h as f32 / 2.0,
            planes,
            np,
            ne,
            oo: v3::dot(eye, eye),
        }
    }

    /// Screen x, y and distance along the view axis; None behind the eye.
    #[inline]
    pub fn project(&self, p: V) -> Option<[f32; 3]> {
        let v = v3::sub(p, self.eye);
        let z = v3::dot(v, self.fwd);
        if z < 1e-3 {
            return None;
        }
        let k = self.f / z;
        Some([self.cx + v3::dot(v, self.right) * k, self.cy - v3::dot(v, self.up) * k, z])
    }

    /// Unnormalised ray direction through a pixel position.
    pub fn ray(&self, x: f32, y: f32) -> V {
        let (rx, ry) = ((x - self.cx) / self.f, (y - self.cy) / self.f);
        [0, 1, 2].map(|i| self.fwd[i] + rx * self.right[i] - ry * self.up[i])
    }

    /// Whether a point is inside the removed region.
    #[inline]
    pub fn removed(&self, p: V) -> bool {
        self.np > 0 && (0..self.np).all(|k| v3::dot(self.planes[k], p) > 0.0)
    }

    /// Parameter interval [lo, hi] along `eye + u d` inside the removed region,
    /// given each plane's `n.d`. Empty when lo >= hi.
    #[inline]
    fn cut_span(&self, nd: [f32; 2]) -> (f32, f32) {
        if self.np == 0 {
            return (f32::INFINITY, f32::NEG_INFINITY);
        }
        let (mut lo, mut hi) = (f32::NEG_INFINITY, f32::INFINITY);
        for k in 0..self.np {
            let (ne, nd) = (self.ne[k], nd[k]);
            if nd.abs() < 1e-9 {
                if ne <= 0.0 {
                    return (f32::INFINITY, f32::NEG_INFINITY);
                }
            } else {
                let u = -ne / nd;
                if nd > 0.0 {
                    lo = lo.max(u);
                } else {
                    hi = hi.min(u);
                }
            }
        }
        (lo, hi)
    }

    /// Which plane bounds the removed span at parameter `u` (the one whose root is u).
    #[inline]
    fn plane_at(&self, nd: [f32; 2], u: f32) -> usize {
        if self.np < 2 {
            return 0;
        }
        let r0 = (self.ne[0] + u * nd[0]).abs();
        let r1 = (self.ne[1] + u * nd[1]).abs();
        if r0 <= r1 { 0 } else { 1 }
    }

    /// Squared distance of the eye from the centre.
    pub fn eye2(&self) -> f32 {
        self.oo
    }

    /// Cast a ray with unit direction d, given `b = eye.d` and `nd = n_k.d`.
    #[inline]
    pub fn trace(&self, b: f32, nd: [f32; 2]) -> Trace {
        let mut tr = Trace {
            hit: Hit::None,
            t: f32::INFINITY,
            front: -1.0,
            back: -1.0,
            glass: 0.0,
            tc: -b,
            h2: self.oo - b * b,
            inside: false,
        };
        let disc = 1.0 - tr.h2;
        if disc <= 0.0 {
            return tr;
        }
        let s = disc.sqrt();
        let (t0, t1) = (-b - s, -b + s);
        if t1 <= 0.0 {
            return tr;
        }
        tr.inside = true;
        let (lo, hi) = self.cut_span(nd);
        let cut = lo < hi;
        let in_cut = |t: f32| cut && t > lo && t < hi;
        // Opaque: the core sphere where it is not cut away...
        let dc = RC * RC - tr.h2;
        if dc > 0.0 {
            let c0 = -b - dc.sqrt();
            if c0 > 0.0 && !in_cut(c0) {
                tr.hit = Hit::Core;
                tr.t = c0;
            }
        }
        // ...and the cut faces, wherever the ray crosses the removed region's
        // boundary inside the ball (core sections included).
        if cut {
            let start = t0.max(0.0);
            if hi > start && hi < t1 && hi < tr.t {
                tr.hit = Hit::Face(self.plane_at(nd, hi));
                tr.t = hi;
            }
            if lo > start && lo < t1 && lo < tr.t {
                tr.hit = Hit::Face(self.plane_at(nd, lo));
                tr.t = lo;
            }
        }
        if t0 > 0.0 && !in_cut(t0) && t0 < tr.t {
            tr.front = t0;
        }
        if tr.hit == Hit::None && !in_cut(t1) {
            tr.back = t1;
        }
        // Glass travelled: [max(t0,0), min(t1, t)] minus the removed span.
        let g0 = t0.max(0.0);
        let g1 = t1.min(tr.t);
        if g1 > g0 {
            let mut len = g1 - g0;
            if cut {
                len -= (hi.min(g1) - lo.max(g0)).max(0.0);
            }
            tr.glass = len;
        }
        tr
    }

    /// Visibility of a point from the eye, 0 (hidden) to 1: the core hides it, the
    /// frosted cut faces fade what lies behind them.
    #[inline]
    pub fn see(&self, p: V) -> f32 {
        let d = v3::sub(p, self.eye);
        let a = v3::dot(d, d);
        let b = v3::dot(self.eye, d);
        let nd = [v3::dot(self.planes[0], d), v3::dot(self.planes[1], d)];
        let (lo, hi) = self.cut_span(nd);
        let dc = b * b - a * (self.oo - RC * RC);
        if dc > 0.0 {
            let s = dc.sqrt();
            let u0 = ((-b - s) / a).max(0.0);
            let u1 = ((-b + s) / a).min(1.0);
            if u0 < u1 && !(lo <= u0 && u1 <= hi) {
                return 0.0;
            }
        }
        if lo >= hi {
            return 1.0;
        }
        let mut last = -1.0f32;
        let mut sheets = 0;
        for u in [lo, hi] {
            if u > 0.0 && u < 1.0 {
                let q = v3::add(self.eye, v3::scale(d, u));
                if v3::dot(q, q) < 1.0 {
                    last = last.max(u);
                    sheets += 1;
                }
            }
        }
        if sheets == 0 {
            return 1.0;
        }
        let dist = (1.0 - last) * a.sqrt();
        0.78f32.powi(sheets) * fexp(-dist / FROST)
    }
}

/// floor() without a libm call (x86-64's baseline has no rounding instruction).
#[inline]
pub fn ffloor(x: f32) -> f32 {
    let i = x as i32 as f32;
    if i > x { i - 1.0 } else { i }
}

/// Fast e^x for x <= 0 (relative error ~1e-4); per-pixel falloffs do not need libm.
#[inline]
pub fn fexp(x: f32) -> f32 {
    let t = x.max(-80.0) * std::f32::consts::LOG2_E;
    let i = ffloor(t);
    let f = t - i;
    let p = 1.0 + f * (0.695_976 + f * (0.224_895 + f * 0.079_440));
    f32::from_bits(((i as i32 + 127) << 23) as u32) * p
}

/// Fast x^p for x > 0 (relative error ~1e-3): sizes and falloffs only.
#[inline]
pub fn fpow(x: f32, p: f32) -> f32 {
    // log2 from the exponent bits plus a quadratic on the mantissa, then exp2.
    let bits = x.max(1e-30).to_bits();
    let e = ((bits >> 23) & 0xff) as f32 - 127.0;
    let m = f32::from_bits((bits & 0x007f_ffff) | 0x3f80_0000);
    let log2 = e + (-0.344_845_4 * m + 2.024_665_5) * m - 1.674_877_6;
    fexp(p * log2 * std::f32::consts::LN_2)
}

/// Fast sine, good to ~1e-3: enough for flowing textures.
#[inline]
pub fn fsin(x: f32) -> f32 {
    use std::f32::consts::{PI, TAU};
    let x = x - TAU * ffloor((x + PI) * (1.0 / TAU));
    let y = 1.273_239_5 * x - 0.405_284_73 * x * x.abs();
    0.225 * (y * y.abs() - y) + y
}

/// Slowly churning texture on (or inside) the core, roughly -1..1.
#[inline]
pub fn churn(p: V, t: f32) -> f32 {
    let (x, y, z) = (p[0] * 4.2, p[1] * 4.2, p[2] * 4.2);
    let w1 = fsin(x * 1.7 + z * 0.9 + t * 0.31 + 1.6 * fsin(y * 2.3 - t * 0.22));
    let w2 = fsin(y * 1.9 - z * 1.1 - t * 0.27 + 1.6 * fsin(x * 2.1 + z * 0.7 + t * 0.17));
    let fine = fsin((x + w2) * 3.1 + (y + w1) * 2.7 + z * 2.3 + t * 0.6);
    (w1 + w2) * 0.34 + fine * 0.26
}

/// Colour lookup table over 0..1, interpolated in OKLab-free linear RGB from stops.
pub struct Ramp {
    lut: Vec<Rgb>,
}

impl Ramp {
    pub fn new(stops: &[(f32, u32)], n: usize) -> Self {
        let lut = (0..n)
            .map(|i| {
                let u = i as f32 / (n - 1) as f32;
                let mut c = hex(stops[stops.len() - 1].1);
                for w in stops.windows(2) {
                    if u <= w[1].0 {
                        let t = ((u - w[0].0) / (w[1].0 - w[0].0)).clamp(0.0, 1.0);
                        let t = t * t * (3.0 - 2.0 * t);
                        c = mix(hex(w[0].1), hex(w[1].1), t);
                        break;
                    }
                }
                c
            })
            .collect();
        Ramp { lut }
    }
    #[inline]
    pub fn at(&self, u: f32) -> Rgb {
        let n = self.lut.len() - 1;
        self.lut[((u * n as f32) as i32).clamp(0, n as i32) as usize]
    }
}

/// Precomputed colours and tables for the background pass.
pub struct Palette {
    pub space: Rgb,
    pub rim: Rgb,
    pub haze: Rgb,
    pub scatter: Rgb,
    pub env: Rgb,
    pub spec: Rgb,
    pub glow: Rgb,
    pub ring: Rgb,
    pub tz: Rgb,
    pub cmb: Rgb,
    pub icb: Rgb,
    pub edge: Rgb,
    pub core: Ramp,
    pub outer: Ramp,
    pub inner: Ramp,
    pub mantle: Ramp,
    /// exp(-SIGMA * len) for len in 0..2.5, 256 steps.
    pub absorb: Vec<f32>,
    /// Linear -> sRGB byte, 4096 steps.
    srgb: Vec<u8>,
}

impl Default for Palette {
    fn default() -> Self {
        Self::new()
    }
}

impl Palette {
    pub fn new() -> Self {
        Palette {
            space: hex(0x04060c),
            rim: hex(0x2a5aa8),
            haze: hex(0x1b3f86),
            scatter: hex(0x10264a),
            env: hex(0x9cc4ff),
            spec: hex(0xfff1dc),
            glow: hex(0xff6a1c),
            ring: hex(0xc9d3e6),
            tz: hex(0x3a3470),
            cmb: hex(0xff9a52),
            icb: hex(0xffe2a0),
            edge: hex(0xbcd6ff),
            // Core surface, dark limb -> hot centre.
            core: Ramp::new(
                &[(0.0, 0x1a0402), (0.3, 0x5c1004), (0.55, 0xa82a06), (0.78, 0xe2571a), (0.92, 0xf78c3a), (1.0, 0xffc27a)],
                256,
            ),
            // Outer core cross-section: liquid iron, swirling.
            outer: Ramp::new(&[(0.0, 0x3a0a03), (0.4, 0x7e1f06), (0.7, 0xbc3e10), (0.9, 0xe26a26), (1.0, 0xf7a050)], 256),
            // Inner core: pale gold, brighter at the centre.
            inner: Ramp::new(&[(0.0, 0xb58a3c), (0.5, 0xd8b56a), (1.0, 0xf6e3b0)], 128),
            // Mantle cross-section by true depth (0..2891 km): cool at the top, hot at the base.
            mantle: Ramp::new(
                &[
                    (0.0, 0x1b2a44),
                    (0.035, 0x172338),
                    (0.142, 0x191c36),
                    (0.228, 0x1f1a38),
                    (0.45, 0x2a1830),
                    (0.75, 0x3a1a20),
                    (0.93, 0x5a2410),
                    (1.0, 0x8a3410),
                ],
                512,
            ),
            absorb: (0..256).map(|i| (-SIGMA * i as f32 / 255.0 * 2.5).exp()).collect(),
            srgb: (0..4096).map(|i| (crate::color::to_srgb(i as f32 / 4095.0) * 255.0 + 0.5) as u8).collect(),
        }
    }

    /// Linear RGB -> packed opaque sRGB.
    #[inline]
    pub fn pack(&self, c: Rgb) -> u32 {
        let b = |v: f32| self.srgb[((v * 4095.0) as i32).clamp(0, 4095) as usize] as u32;
        0xff00_0000 | b(c[0]) | (b(c[1]) << 8) | (b(c[2]) << 16)
    }
    #[inline]
    pub fn absorb(&self, len: f32) -> f32 {
        self.absorb[((len * (255.0 / 2.5)) as i32).clamp(0, 255) as usize]
    }
}
