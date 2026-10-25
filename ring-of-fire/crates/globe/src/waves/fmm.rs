//! Fast marching (Sethian 1996) for the eikonal equation |grad T| = 1/v on a polar
//! grid in the plane through the source and Earth's centre.
//!
//! - The grid is (radius, angle from the source), angle 0..pi: the other half of the
//!   plane is the mirror image. Rings sit exactly on every discontinuity, so the
//!   core-mantle boundary is a grid line instead of a staircase.
//! - Updates are second order where the two upwind nodes along an axis lie in the same
//!   uniform segment, first order otherwise.
//! - With the time, each node carries the take-off angle of the ray that reached it
//!   (it is constant along rays, so it is advected upwind in the same order). Its
//!   gradient across the front is the ray density, which gives geometric spreading and
//!   makes the shadow zones dark by themselves.
//! - Later arrivals come from multi-stage marching (Rawlinson & Sambridge 2004): the
//!   mantle stage stops at the core, a core stage restarts from the illuminated part of
//!   the boundary, and a third stage carries the core wave back up into the mantle.

use super::model::{discontinuities, speed, Wave, R_CMB, R_EARTH, R_ICB};
use std::cmp::Reverse;
use std::collections::BinaryHeap;

pub struct Grid {
    /// Ring radii in km, ascending; ring 0 is the innermost.
    pub r: Vec<f64>,
    /// Angular nodes over [0, pi].
    pub nt: usize,
    pub dth: f64,
    pub j_icb: usize,
    pub j_cmb: usize,
    pub j_top: usize,
    /// Ring lies on a discontinuity.
    pub iface: Vec<bool>,
}

impl Grid {
    /// `nt` angular nodes; `dr_mantle` and `dr_core` target ring spacings in km.
    pub fn new(nt: usize, dr_mantle: f64, dr_core: f64) -> Self {
        let mut r = Vec::new();
        // Inner core: rings at (k + 1/2) h so the innermost pair straddles the centre
        // at the same spacing, and the boundary is a ring.
        let n_ic = (R_ICB / dr_core).round().max(2.0) as usize;
        let h = R_ICB / (n_ic as f64 + 0.5);
        for k in 0..=n_ic {
            r.push((k as f64 + 0.5) * h);
        }
        let mut bounds: Vec<f64> = discontinuities().iter().map(|d| R_EARTH - d).filter(|&x| x > R_ICB + 1.0).collect();
        bounds.sort_by(f64::total_cmp);
        bounds.push(R_EARTH);
        let mut a = R_ICB;
        for &b in &bounds {
            let target = if b <= R_CMB + 1.0 {
                dr_core
            } else if b > R_EARTH - 36.0 {
                5.0
            } else {
                dr_mantle
            };
            let m = ((b - a) / target).ceil().max(1.0) as usize;
            for k in 1..=m {
                r.push(a + (b - a) * k as f64 / m as f64);
            }
            a = b;
        }
        let find = |x: f64| r.iter().position(|&v| (v - x).abs() < 1e-6).unwrap();
        let iface_r: Vec<f64> = discontinuities().iter().map(|d| R_EARTH - d).collect();
        let iface = r.iter().map(|&v| iface_r.iter().any(|&x| (x - v).abs() < 1e-6)).collect();
        Grid {
            j_icb: find(R_ICB),
            j_cmb: find(R_CMB),
            j_top: r.len() - 1,
            nt,
            dth: std::f64::consts::PI / (nt - 1) as f64,
            iface,
            r,
        }
    }

    pub fn len(&self) -> usize {
        self.r.len() * self.nt
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Fractional ring index for a radius (for interpolation).
    pub fn ring_at(&self, r: f64) -> f64 {
        let n = self.r.len();
        if r <= self.r[0] {
            return 0.0;
        }
        if r >= self.r[n - 1] {
            return (n - 1) as f64;
        }
        let j = self.r.partition_point(|&v| v <= r) - 1;
        j as f64 + (r - self.r[j]) / (self.r[j + 1] - self.r[j])
    }
}

/// Which side's speed a ring on a discontinuity takes.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Side {
    /// The shallower side (away from the centre).
    Above,
    Below,
    /// Mean slowness of the two sides.
    Mean,
}

/// A solved field over a box of rings [j0, j1] and angles [i0, i1].
#[derive(Clone, Default)]
pub struct Field {
    pub j0: usize,
    pub j1: usize,
    pub i0: usize,
    pub i1: usize,
    /// Travel time, s (infinite where nothing arrived).
    pub t: Vec<f32>,
    /// Take-off angle at the source of the ray that arrived, rad from straight down.
    pub phi: Vec<f32>,
    /// Relative amplitude (ray-theory spreading and attenuation), filled by `amplitude`.
    pub amp: Vec<f32>,
}

impl Field {
    #[inline]
    pub fn idx(&self, j: usize, i: usize) -> Option<usize> {
        (j >= self.j0 && j <= self.j1 && i >= self.i0 && i <= self.i1)
            .then(|| (j - self.j0) * (self.i1 - self.i0 + 1) + (i - self.i0))
    }
    pub fn at(&self, j: usize, i: usize) -> f32 {
        self.idx(j, i).map_or(f32::INFINITY, |k| self.t[k])
    }
    pub fn amp_at(&self, j: usize, i: usize) -> f32 {
        self.idx(j, i).map_or(0.0, |k| self.amp[k])
    }
    pub fn width(&self) -> usize {
        self.i1 - self.i0 + 1
    }
}

pub struct Stage {
    pub wave: Wave,
    pub j0: usize,
    pub j1: usize,
    pub i0: usize,
    pub i1: usize,
    /// Side used by each ring that sits on a discontinuity.
    pub side: fn(f64) -> Side,
    /// (ring, angle index, time, take-off angle).
    pub seeds: Vec<(usize, usize, f32, f32)>,
}

/// Priority queue for the narrow band: far-future entries go into buckets of width
/// `W` seconds (unsorted, O(1)); only the current bucket is kept in a binary heap. The
/// order is exact, because a new time is never earlier than the last one accepted.
#[derive(Default)]
struct Queue {
    buckets: Vec<Vec<u64>>,
    cur: usize,
    heap: BinaryHeap<Reverse<u64>>,
}

impl Queue {
    const W: f32 = 0.6;
    fn clear(&mut self) {
        for b in &mut self.buckets {
            b.clear();
        }
        self.cur = 0;
        self.heap.clear();
    }
    #[inline]
    fn push(&mut self, t: f32, k: usize) {
        let key = ((t.to_bits() as u64) << 32) | k as u64;
        let b = (t / Self::W) as usize;
        if b <= self.cur {
            self.heap.push(Reverse(key));
        } else {
            if b >= self.buckets.len() {
                self.buckets.resize_with(b + 64, Vec::new);
            }
            self.buckets[b].push(key);
        }
    }
    #[inline]
    fn pop(&mut self) -> Option<u64> {
        loop {
            if let Some(Reverse(k)) = self.heap.pop() {
                return Some(k);
            }
            // Advance to the next non-empty bucket and heapify it.
            loop {
                self.cur += 1;
                if self.cur >= self.buckets.len() {
                    return None;
                }
                if !self.buckets[self.cur].is_empty() {
                    break;
                }
            }
            let b = std::mem::take(&mut self.buckets[self.cur]);
            let mut v = std::mem::take(&mut self.heap).into_vec();
            v.clear();
            v.extend(b.iter().map(|&k| Reverse(k)));
            self.heap = BinaryHeap::from(v);
            // Keep the bucket's allocation for reuse.
            let mut b = b;
            b.clear();
            self.buckets[self.cur] = b;
        }
    }
}

/// Reusable work buffers, in a padded layout: two ghost columns at each end of every
/// ring mirror the symmetry axis (angles 0 and pi), and two ghost rings inside ring 0
/// mirror the rings across the centre. A node's accepted time lives in `ta` (infinite
/// until accepted, and outside the stage), so an update reads its neighbours without
/// any state or bounds checks.
#[derive(Default)]
pub struct Marcher {
    t: Vec<f32>,
    ta: Vec<f32>,
    phi: Vec<f32>,
    state: Vec<u8>,
    queue: Queue,
    pub pops: usize,
}

const FAR: u8 = 0;
const TRIAL: u8 = 1;
const DONE: u8 = 2;
const FROZEN: u8 = 4;
const BLOCKED: u8 = 8;
const PAD: usize = 2;

/// Per-ring constants for one stage.
struct Rings {
    s: Vec<f32>,
    /// 1/h^2 inward, outward, and along the ring.
    in2: Vec<f32>,
    out2: Vec<f32>,
    ang2: Vec<f32>,
    /// Second order allowed inward / outward from ring j.
    uni_in: Vec<bool>,
    uni_out: Vec<bool>,
}

impl Marcher {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn march(&mut self, g: &Grid, st: &Stage) -> Field {
        let (nr, nt) = (g.r.len(), g.nt);
        let stride = nt + 2 * PAD;
        let n = (nr + 2 * PAD) * stride;
        let at = |j: usize, i: usize| (j + PAD) * stride + i + PAD;
        self.t.clear();
        self.t.resize(n, f32::INFINITY);
        self.ta.clear();
        self.ta.resize(n, f32::INFINITY);
        self.phi.clear();
        self.phi.resize(n, 0.0);
        self.state.clear();
        self.state.resize(n, BLOCKED);
        for j in st.j0..=st.j1 {
            let k = at(j, st.i0);
            self.state[k..=k + (st.i1 - st.i0)].fill(FAR);
        }
        self.queue.clear();

        let slow: Vec<f64> = g
            .r
            .iter()
            .enumerate()
            .map(|(j, &r)| {
                let d = R_EARTH - r;
                let v = |below| speed(st.wave, d, below);
                if !g.iface[j] {
                    1.0 / v(false)
                } else {
                    match (st.side)(r) {
                        Side::Above => 1.0 / v(false),
                        Side::Below => 1.0 / v(true),
                        Side::Mean => 0.5 * (1.0 / v(false) + 1.0 / v(true)),
                    }
                }
            })
            .collect();
        // Position along a radial line through the centre: ring j at +r_j, and the
        // rings across the centre (j = -1, -2) at -r_0, -r_1.
        let pos = |j: i64| if j >= 0 { g.r[j as usize] } else { -g.r[(-j - 1) as usize] };
        let iface = |j: i64| j >= 0 && (j as usize) < nr && g.iface[j as usize];
        let uniform = |a: i64, b: i64, c: i64| {
            let (h1, h2) = (pos(a) - pos(b), pos(b) - pos(c));
            (h1 - h2).abs() < 1e-3 * h1.abs()
        };
        let rings = Rings {
            s: slow.iter().map(|&v| v as f32).collect(),
            in2: (0..nr as i64).map(|j| (1.0 / (pos(j) - pos(j - 1)).powi(2)) as f32).collect(),
            out2: (0..nr).map(|j| if j + 1 < nr { (1.0 / (g.r[j + 1] - g.r[j]).powi(2)) as f32 } else { 0.0 }).collect(),
            ang2: g.r.iter().map(|&r| (1.0 / (r * g.dth).powi(2)) as f32).collect(),
            uni_in: (0..nr as i64).map(|j| uniform(j, j - 1, j - 2) && !iface(j - 1)).collect(),
            uni_out: (0..nr as i64).map(|j| (j as usize) + 2 < nr && uniform(j + 2, j + 1, j) && !iface(j + 1)).collect(),
        };
        let crosses = st.j0 == 0;

        for &(j, i, t, phi) in &st.seeds {
            if j < st.j0 || j > st.j1 || i < st.i0 || i > st.i1 {
                continue;
            }
            let k = at(j, i);
            if t < self.t[k] {
                self.t[k] = t;
                self.phi[k] = phi;
                self.state[k] = TRIAL | FROZEN;
                self.queue.push(t, k);
            }
        }

        let mut pops = 0;
        while let Some(key) = self.queue.pop() {
            let k = (key & 0xffff_ffff) as usize;
            if self.state[k] & DONE != 0 || self.t[k].to_bits() != (key >> 32) as u32 {
                continue;
            }
            pops += 1;
            self.state[k] |= DONE;
            let tk = self.t[k];
            self.ta[k] = tk;
            let row = (k / stride) as u32 as usize;
            let (j, i) = (row - PAD, k - row * stride - PAD);
            // Keep the ghosts in step with the nodes they mirror. A mirrored ray leaves
            // the source on the other side, so its take-off angle changes sign.
            let ghost = |g: usize, me: &mut Self| {
                me.ta[g] = tk;
                me.phi[g] = -me.phi[k];
            };
            if i == 1 || i == 2 {
                ghost(at(j, 0) - i, self);
            }
            if i + 2 == nt || i + 3 == nt {
                ghost(at(j, nt - 1) + (nt - 1 - i), self);
            }
            let mut across = usize::MAX;
            if crosses && j <= 1 {
                // Ring 0 and 1 seen from across the centre: ghost rings -1 and -2.
                ghost((PAD - 1 - j) * stride + (nt - 1 - i) + PAD, self);
                if j == 0 {
                    across = at(0, nt - 1 - i);
                }
            }
            for m in [k - stride, k + stride, k - 1, k + 1, across] {
                if m == usize::MAX || self.state[m] & (DONE | FROZEN | BLOCKED) != 0 {
                    continue;
                }
                let mrow = (m / stride) as u32 as usize;
                let (tn, ph) = self.solve(&rings, m, mrow - PAD, stride);
                if tn < self.t[m] {
                    self.t[m] = tn;
                    self.phi[m] = ph;
                    self.state[m] = TRIAL;
                    self.queue.push(tn, m);
                }
            }
        }
        self.pops += pops;

        let w = st.i1 - st.i0 + 1;
        let mut f = Field { j0: st.j0, j1: st.j1, i0: st.i0, i1: st.i1, ..Default::default() };
        f.t = Vec::with_capacity((st.j1 - st.j0 + 1) * w);
        f.phi = Vec::with_capacity(f.t.capacity());
        for j in st.j0..=st.j1 {
            let k = at(j, st.i0);
            f.t.extend_from_slice(&self.t[k..k + w]);
            f.phi.extend_from_slice(&self.phi[k..k + w]);
        }
        f
    }

    /// Upwind update of node `k` (ring `j`) from its accepted neighbours, with the
    /// take-off angle advected along the characteristic. Second order along an axis
    /// when the next node out is accepted, earlier, and evenly spaced.
    #[inline]
    fn solve(&self, rg: &Rings, k: usize, j: usize, stride: usize) -> (f32, f32) {
        let ta = &self.ta;
        let sl = rg.s[j];
        // Radial axis.
        let (ti, to) = (ta[k - stride], ta[k + stride]);
        let (mut ar, mut br, t1r, pr) = if ti <= to {
            let mut a = rg.in2[j];
            let mut b = ti;
            if rg.uni_in[j] {
                let t2 = ta[k - 2 * stride];
                if t2 <= ti {
                    a *= 2.25;
                    b = (4.0 * ti - t2) / 3.0;
                }
            }
            (a, b, ti, self.phi[k - stride])
        } else {
            let mut a = rg.out2[j];
            let mut b = to;
            if rg.uni_out[j] {
                let t2 = ta[k + 2 * stride];
                if t2 <= to {
                    a *= 2.25;
                    b = (4.0 * to - t2) / 3.0;
                }
            }
            (a, b, to, self.phi[k + stride])
        };
        // Angular axis.
        let (tl, tr) = (ta[k - 1], ta[k + 1]);
        let a0 = rg.ang2[j];
        let (mut aa, mut ba, t1a, pa) = if tl <= tr {
            let t2 = ta[k - 2];
            if t2 <= tl {
                (a0 * 2.25, (4.0 * tl - t2) / 3.0, tl, self.phi[k - 1])
            } else {
                (a0, tl, tl, self.phi[k - 1])
            }
        } else {
            let t2 = ta[k + 2];
            if t2 <= tr {
                (a0 * 2.25, (4.0 * tr - t2) / 3.0, tr, self.phi[k + 1])
            } else {
                (a0, tr, tr, self.phi[k + 1])
            }
        };
        if !t1r.is_finite() {
            ar = 0.0;
            br = 0.0;
        }
        if !t1a.is_finite() {
            aa = 0.0;
            ba = 0.0;
        }
        if ar == 0.0 && aa == 0.0 {
            return (f32::INFINITY, 0.0);
        }
        // Both axes: a_r (T - b_r)^2 + a_a (T - b_a)^2 = s^2, solved for T relative to
        // the earlier of the two so that f32 keeps its precision.
        if ar > 0.0 && aa > 0.0 {
            let m = br.min(ba);
            let (dr, da) = (br - m, ba - m);
            let sa = ar + aa;
            let sb = ar * dr + aa * da;
            let sc = ar * dr * dr + aa * da * da - sl * sl;
            let disc = sb * sb - sa * sc;
            if disc >= 0.0 {
                let x = (sb + disc.sqrt()) / sa;
                if x >= dr.max(da) {
                    let (wr, wa) = ((x - dr) * ar, (x - da) * aa);
                    let ws = wr + wa;
                    let phi = if ws > 0.0 { (wr * pr + wa * pa) / ws } else { pr };
                    return (m + x, phi);
                }
            }
        }
        // One axis: whichever gives the earlier time.
        let xr = if ar > 0.0 { br + sl / ar.sqrt() } else { f32::INFINITY };
        let xa = if aa > 0.0 { ba + sl / aa.sqrt() } else { f32::INFINITY };
        if xr <= xa {
            (xr, pr)
        } else {
            (xa, pa)
        }
    }
}

/// Exact-enough times around the source: straight rays through the layered speeds,
/// for every node within `radius` km. Returns (ring, angle index, time, take-off angle).
pub fn source_seeds(g: &Grid, wave: Wave, depth: f64, radius: f64) -> Vec<(usize, usize, f32, f32)> {
    let rs = R_EARTH - depth;
    let mut out = Vec::new();
    let imax = ((radius / rs) / g.dth).ceil() as usize + 1;
    for (j, &r) in g.r.iter().enumerate() {
        if (r - rs).abs() > radius {
            continue;
        }
        for i in 0..=imax.min(g.nt - 1) {
            let th = i as f64 * g.dth;
            let (x, y) = (r * th.sin(), r * th.cos() - rs);
            let rho = (x * x + y * y).sqrt();
            if rho > radius {
                continue;
            }
            // Mean slowness along the chord, by the midpoint rule.
            let n = 24;
            let mut sum = 0.0;
            for k in 0..n {
                let u = (k as f64 + 0.5) / n as f64;
                let (px, py) = (x * u, rs + y * u);
                let rr = (px * px + py * py).sqrt();
                sum += 1.0 / speed(wave, (R_EARTH - rr).max(0.0), false);
            }
            let t = rho * sum / n as f64;
            let phi = if rho < 1e-9 { 0.0 } else { x.atan2(-y) };
            out.push((j, i, t as f32, phi as f32));
        }
    }
    out
}

/// Fills `f.amp`: geometric spreading from the ray density across the front, for a
/// point source in an axially symmetric Earth,
///   A^2 ~ sin(phi) |grad phi| / (r sin theta),
/// times an attenuation factor exp(-T / tau). Gradients use the smaller one-sided
/// difference (minmod), so jumps where two branches meet do not flare.
pub fn amplitude(g: &Grid, f: &mut Field, tau: f64) {
    let w = f.width();
    let h = f.j1 - f.j0 + 1;
    let mut amp = vec![0.0f32; f.t.len()];
    #[inline]
    fn minmod(a: f32, b: f32) -> f32 {
        if a * b <= 0.0 {
            0.0
        } else if a.abs() < b.abs() {
            a
        } else {
            b
        }
    }
    let eps = 0.08f32;
    // Per column: 1 / (sin theta + eps), and a fade at a cut edge of the box (the exit
    // stages start part-way round, where nothing physical begins).
    let fade_cols = (8f64.to_radians() / g.dth) as f32;
    let col: Vec<(f32, f32)> = (0..w)
        .map(|ii| {
            let th = ((f.i0 + ii) as f64 * g.dth) as f32;
            let fade = if f.i0 > 0 { crate::gfx::smoothstep(0.0, fade_cols, ii as f32) } else { 1.0 };
            (1.0 / (th.sin() + eps), fade)
        })
        .collect();
    let inv_tau = (1.0 / tau) as f32;
    let (t, phi) = (&f.t, &f.phi);
    for jj in 0..h {
        let j = f.j0 + jj;
        let r = g.r[j] as f32;
        let inv_dn = if jj > 0 { 1.0 / (r - g.r[j - 1] as f32) } else { 0.0 };
        let inv_up = if jj + 1 < h { 1.0 / (g.r[j + 1] as f32 - r) } else { 0.0 };
        let inv_ht = 1.0 / (r * g.dth as f32);
        let inv_r = 1.0 / r;
        let row = jj * w;
        for (ii, &(inv_sin, fade)) in col.iter().enumerate() {
            let k = row + ii;
            let tk = t[k];
            if !tk.is_finite() {
                continue;
            }
            let p0 = phi[k];
            let dn = (jj > 0 && t[k - w].is_finite()).then(|| (p0 - phi[k - w]) * inv_dn);
            let up = (jj + 1 < h && t[k + w].is_finite()).then(|| (phi[k + w] - p0) * inv_up);
            let gr = match (dn, up) {
                (Some(a), Some(b)) => minmod(a, b),
                (Some(a), None) | (None, Some(a)) => a,
                _ => 0.0,
            };
            let lf = (ii > 0 && t[k - 1].is_finite()).then(|| (p0 - phi[k - 1]) * inv_ht);
            let rt = (ii + 1 < w && t[k + 1].is_finite()).then(|| (phi[k + 1] - p0) * inv_ht);
            let gt = match (lf, rt) {
                (Some(a), Some(b)) => minmod(a, b),
                (Some(a), None) | (None, Some(a)) => a,
                _ => 0.0,
            };
            let grad = (gr * gr + gt * gt).sqrt();
            let a2 = (p0.sin().abs() + eps) * grad * inv_sin * inv_r;
            amp[k] = a2.sqrt() * (-tk * inv_tau).exp() * fade;
        }
        // On the symmetry axis the advected take-off angle is an average of both
        // sides, so the gradient there and one column in reads too small: take the
        // value from the third column in.
        if f.i0 == 0 && w > 3 {
            amp[row] = amp[row + 2];
            amp[row + 1] = amp[row + 2];
        }
        if f.i1 == g.nt - 1 && w > 3 {
            amp[row + w - 1] = amp[row + w - 3];
            amp[row + w - 2] = amp[row + w - 3];
        }
    }
    f.amp = amp;
}
