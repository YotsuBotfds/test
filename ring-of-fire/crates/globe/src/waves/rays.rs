//! Ray theory through the same spherical model: an independent check on the grid
//! solver, and the source of the ray paths the cross-section draws.
//!
//! The model is cut into thin shells. Inside each shell the speed is taken to follow
//! v = a r^(1-b) (Bullen's law), which makes the travel-time and distance integrals
//! exact in closed form. With eta = r / v and ray parameter p (s/rad):
//!   delta = (1/b) [acos(p/eta)]   and   T = (1/b) [sqrt(eta^2 - p^2)]
//! evaluated between the shell's top and bottom (or the turning point, where eta = p).

use super::model::{speed, Wave, NODES, R_CMB, R_EARTH, R_ICB};
use std::f64::consts::PI;
use std::sync::OnceLock;

#[derive(Clone, Copy, Debug)]
struct Shell {
    r_top: f64,
    r_bot: f64,
    eta_top: f64,
    eta_bot: f64,
    b: f64,
}

impl Shell {
    fn new(r_top: f64, r_bot: f64, v_top: f64, v_bot: f64) -> Self {
        let (eta_top, eta_bot) = (r_top / v_top, r_bot / v_bot);
        let b = (eta_top / eta_bot).ln() / (r_top / r_bot).ln();
        Shell { r_top, r_bot, eta_top, eta_bot, b }
    }
    /// eta at a radius inside the shell.
    fn eta(&self, r: f64) -> f64 {
        self.eta_top * (r / self.r_top).powf(self.b)
    }
    /// Radius where eta = p (the ray turns), for eta_bot <= p <= eta_top.
    fn turn(&self, p: f64) -> f64 {
        self.r_top * (p / self.eta_top).powf(1.0 / self.b)
    }
    /// Distance (rad) and time (s) between two radii inside the shell, both with eta >= p.
    fn span(&self, p: f64, e_hi: f64, e_lo: f64, r_hi: f64, r_lo: f64) -> (f64, f64) {
        if self.b.abs() < 1e-9 {
            // eta constant: the integrals reduce to logarithms.
            let q = (e_hi * e_hi - p * p).max(1e-12).sqrt();
            let l = (r_hi / r_lo).ln();
            return (p / q * l, e_hi * e_hi / q * l);
        }
        let ac = |e: f64| (p / e).clamp(-1.0, 1.0).acos();
        let sq = |e: f64| (e * e - p * p).max(0.0).sqrt();
        ((ac(e_hi) - ac(e_lo)) / self.b, (sq(e_hi) - sq(e_lo)) / self.b)
    }
}

pub struct Shells {
    p: Vec<Shell>,
    s: Vec<Shell>,
}

/// Shells no thicker than this, km.
const MAX_SHELL: f64 = 8.0;

fn build(wave: Wave) -> Vec<Shell> {
    let mut out = Vec::new();
    for w in NODES.windows(2) {
        let (a, b) = (w[0], w[1]);
        if a.0 == b.0 {
            continue;
        }
        let n = ((b.0 - a.0) / MAX_SHELL).ceil().max(1.0) as usize;
        for k in 0..n {
            let d0 = a.0 + (b.0 - a.0) * k as f64 / n as f64;
            let d1 = a.0 + (b.0 - a.0) * (k + 1) as f64 / n as f64;
            let pick = |n: (f64, f64, f64)| if wave == Wave::P { n.1 } else { n.2 };
            let v = |d: f64| pick(a) + (pick(b) - pick(a)) * (d - a.0) / (b.0 - a.0);
            let (r_top, r_bot) = (R_EARTH - d0, (R_EARTH - d1).max(1e-3));
            if pick(a) <= 0.0 || pick(b) <= 0.0 {
                // A fluid shell for S: marks the barrier.
                out.push(Shell { r_top, r_bot, eta_top: f64::INFINITY, eta_bot: f64::INFINITY, b: f64::NAN });
            } else {
                out.push(Shell::new(r_top, r_bot, v(d0), v(d1)));
            }
        }
    }
    out
}

pub fn shells() -> &'static Shells {
    static S: OnceLock<Shells> = OnceLock::new();
    S.get_or_init(|| Shells { p: build(Wave::P), s: build(Wave::S) })
}

/// Which way a ray left the source and where it went.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    /// Left upwards; reached the surface without turning.
    Up,
    /// Turned in the crust or mantle: P or S.
    Mantle,
    /// Crossed the core-mantle boundary and turned in the liquid outer core: PKP.
    OuterCore,
    /// Turned in the inner core: PKIKP.
    InnerCore,
    /// Met a boundary it cannot cross (S at the liquid core, or a P ray too shallow for the inner core).
    Blocked,
}

#[derive(Clone, Copy, Debug)]
pub struct Ray {
    pub p: f64,
    pub kind: Kind,
    /// Epicentral distance, rad, and travel time to the surface, s.
    pub delta: f64,
    pub time: f64,
    /// Deepest radius reached.
    pub r_turn: f64,
}

impl Shells {
    fn of(&self, w: Wave) -> &[Shell] {
        if w == Wave::P {
            &self.p
        } else {
            &self.s
        }
    }

    /// eta = r / v at the source radius.
    pub fn eta_at(&self, w: Wave, r: f64) -> f64 {
        r / speed(w, R_EARTH - r, false)
    }

    /// Walks a ray from the surface down. Calls `f(r, delta, time)` at every shell
    /// boundary below `r_from` (and at the turning point). Returns the deepest radius, the
    /// distance and time from `r_from` to there, and why it stopped.
    pub fn descend(&self, w: Wave, p: f64, r_from: f64, f: impl FnMut(f64, f64, f64)) -> (f64, f64, f64, Kind) {
        self.descend_with(w, p, r_from, 0.0, f)
    }

    /// As `descend`, but when `step` > 0 also reports points inside shells so that no
    /// two consecutive points are more than `step` rad apart (for drawing).
    pub fn descend_with(&self, w: Wave, p: f64, r_from: f64, step: f64, mut f: impl FnMut(f64, f64, f64)) -> (f64, f64, f64, Kind) {
        let (mut d, mut t) = (0.0, 0.0);
        for s in self.of(w) {
            if s.r_bot >= r_from {
                continue;
            }
            if !s.b.is_finite() {
                return (s.r_top.min(r_from), d, t, Kind::Blocked);
            }
            let (r_hi, e_hi) = if s.r_top > r_from { (r_from, s.eta(r_from)) } else { (s.r_top, s.eta_top) };
            if e_hi < p {
                // A jump in speed made the ray horizontal at the boundary.
                return (r_hi, d, t, Kind::Blocked);
            }
            if s.eta_bot <= p {
                let r_t = s.turn(p).clamp(s.r_bot, r_hi);
                let (dd, dt) = s.span(p, e_hi, p, r_hi, r_t);
                if step > 0.0 && dd > step {
                    // Dense towards the turning point, where the ray runs flat.
                    let n = ((dd / step).ceil() as usize).clamp(2, 96);
                    for m in 1..n {
                        let u = 1.0 - m as f64 / n as f64;
                        let r = r_t + (r_hi - r_t) * u * u;
                        let (a, b) = s.span(p, e_hi, s.eta(r).max(p), r_hi, r);
                        f(r, d + a, t + b);
                    }
                }
                d += dd;
                t += dt;
                f(r_t, d, t);
                let kind = if r_t > R_CMB + 1e-6 {
                    Kind::Mantle
                } else if r_t > R_ICB + 1e-6 {
                    Kind::OuterCore
                } else {
                    Kind::InnerCore
                };
                return (r_t, d, t, kind);
            }
            let (dd, dt) = s.span(p, e_hi, s.eta_bot, r_hi, s.r_bot);
            if step > 0.0 && dd > step {
                let n = ((dd / step).ceil() as usize).min(96);
                for m in 1..n {
                    let r = r_hi + (s.r_bot - r_hi) * m as f64 / n as f64;
                    let (a, b) = s.span(p, e_hi, s.eta(r), r_hi, r);
                    f(r, d + a, t + b);
                }
            }
            d += dd;
            t += dt;
            f(s.r_bot, d, t);
        }
        // Straight through the centre (p = 0).
        (0.0, d + PI / 2.0, t, Kind::InnerCore)
    }

    /// Distance and time between the surface and radius `r` for an upgoing ray.
    pub fn above(&self, w: Wave, p: f64, r: f64) -> (f64, f64) {
        let (mut d, mut t) = (0.0, 0.0);
        for s in self.of(w) {
            if s.r_top <= r {
                break;
            }
            let r_lo = s.r_bot.max(r);
            let e_lo = if r_lo > s.r_bot { s.eta(r_lo) } else { s.eta_bot };
            let (dd, dt) = s.span(p, s.eta_top, e_lo, s.r_top, r_lo);
            d += dd;
            t += dt;
        }
        (d, t)
    }

    /// A ray leaving a source at depth `depth` km with ray parameter `p` s/rad, going down
    /// (`down`) or up. Delta and time are to the surface.
    pub fn shoot(&self, w: Wave, depth: f64, p: f64, down: bool) -> Ray {
        let r_s = R_EARTH - depth;
        let (d_up, t_up) = self.above(w, p, r_s);
        if !down {
            return Ray { p, kind: Kind::Up, delta: d_up, time: t_up, r_turn: r_s };
        }
        let (r_turn, d, t, kind) = self.descend(w, p, r_s, |_, _, _| {});
        Ray { p, kind, delta: 2.0 * d + d_up, time: 2.0 * t + t_up, r_turn }
    }

    /// The ray's path as (radius km, angle from the source rad) points, source to surface.
    /// Blocked rays stop where they are blocked.
    pub fn path(&self, w: Wave, depth: f64, p: f64, down: bool, out: &mut Vec<[f32; 3]>) {
        out.clear();
        let r_s = R_EARTH - depth;
        out.push([r_s as f32, 0.0, 0.0]);
        let mut theta_turn = 0.0;
        let mut t_turn = 0.0;
        if down {
            let mut pts = Vec::new();
            let (_, d, t, k) = self.descend_with(w, p, r_s, 0.006, |r, d, t| pts.push([r as f32, d as f32, t as f32]));
            for &q in &pts {
                out.push(q);
            }
            theta_turn = d;
            t_turn = t;
            if k == Kind::Blocked {
                return;
            }
            // Back up, mirrored about the turning point.
            for q in pts.iter().rev().skip(1) {
                out.push([q[0], (2.0 * d - q[1] as f64) as f32, (2.0 * t - q[2] as f64) as f32]);
            }
            out.push([r_s as f32, (2.0 * d) as f32, (2.0 * t) as f32]);
        }
        // From the source radius up to the surface.
        let (base_d, base_t) = if down { (2.0 * theta_turn, 2.0 * t_turn) } else { (0.0, 0.0) };
        let mut layers: Vec<(f64, f64, f64)> = Vec::new();
        let (mut d, mut t) = (0.0, 0.0);
        for s in self.of(w).iter().rev() {
            if s.r_top <= r_s {
                continue;
            }
            let r_lo = s.r_bot.max(r_s);
            let e_lo = if r_lo > s.r_bot { s.eta(r_lo) } else { s.eta_bot };
            let (dd, dt) = s.span(p, s.eta_top, e_lo, s.r_top, r_lo);
            d += dd;
            t += dt;
            layers.push((s.r_top, d, t));
        }
        for (r, dd, tt) in layers {
            out.push([r as f32, (base_d + dd) as f32, (base_t + tt) as f32]);
        }
    }
}

impl Shells {
    /// Ray parameter of the earliest ray of one kind that reaches `delta` rad, from a
    /// source at `depth`, by sampling then bisection. `range` bounds p.
    pub fn find_ray(&self, w: Wave, depth: f64, delta: f64, kind: Kind, range: (f64, f64)) -> Option<(f64, f64)> {
        let n = 72;
        let (lo, hi) = range;
        let rays: Vec<Ray> = (0..=n).map(|k| self.shoot(w, depth, lo + (hi - lo) * (k as f64 + 0.5) / (n as f64 + 1.0), true)).collect();
        let mut best: Option<(f64, f64)> = None;
        for pair in rays.windows(2) {
            let (a, b) = (pair[0], pair[1]);
            if a.kind != kind || b.kind != kind {
                continue;
            }
            let (dmin, dmax) = (a.delta.min(b.delta), a.delta.max(b.delta));
            if delta < dmin || delta > dmax {
                continue;
            }
            // Bisection on p between the two samples.
            let (mut pa, mut pb) = (a.p, b.p);
            let up = b.delta > a.delta;
            let mut ray = a;
            for _ in 0..32 {
                let pm = 0.5 * (pa + pb);
                ray = self.shoot(w, depth, pm, true);
                if (ray.delta < delta) == up {
                    pa = pm;
                } else {
                    pb = pm;
                }
            }
            if ray.kind == kind && best.is_none_or(|b| ray.time < b.1) {
                best = Some((ray.p, ray.time));
            }
        }
        best
    }
}

/// One branch sample of a travel-time curve.
#[derive(Clone, Copy, Debug)]
pub struct Sample {
    pub delta: f64,
    pub time: f64,
    pub p: f64,
}

/// Families of rays, sorted by ray parameter.
pub struct Curves {
    /// P and S that turn in the mantle, plus the upgoing rays (for deep sources).
    pub p: Vec<Sample>,
    pub s: Vec<Sample>,
    /// PKP that turns in the outer core, and PKIKP through the inner core.
    pub pkp: Vec<Sample>,
    pub pkikp: Vec<Sample>,
    /// Ray parameter that grazes the core (mantle side), P and S.
    pub p_graze: f64,
    pub s_graze: f64,
    /// Distance (rad) at which the P and S rays that graze the core reach the surface.
    pub p_shadow: f64,
    pub s_shadow: f64,
    /// Angle at which the grazing P and S rays touch the core.
    pub p_touch: f64,
    pub s_touch: f64,
}

impl Curves {
    pub fn new(depth: f64) -> Self {
        let sh = shells();
        let r_s = R_EARTH - depth;
        let p_graze = R_CMB / speed(Wave::P, R_EARTH - R_CMB, false);
        let s_graze = R_CMB / speed(Wave::S, R_EARTH - R_CMB, false);
        let mantle = |w: Wave, graze: f64| -> Vec<Sample> {
            let top = sh.eta_at(w, r_s);
            let n = 1600;
            let mut v = Vec::with_capacity(2 * n);
            // Downgoing: from grazing the core up to horizontal at the source. Rays
            // reflected at a jump in speed are left out; a NaN sample breaks the branch.
            for k in 0..=n {
                let p = graze + (top - graze) * (k as f64 + 1e-6) / (n as f64 + 2e-6);
                let ray = sh.shoot(w, depth, p, true);
                if ray.kind == Kind::Mantle {
                    v.push(Sample { delta: ray.delta, time: ray.time, p });
                } else if v.last().is_some_and(|s| !s.delta.is_nan()) {
                    v.push(Sample { delta: f64::NAN, time: f64::NAN, p });
                }
            }
            v.push(Sample { delta: f64::NAN, time: f64::NAN, p: top });
            // Upgoing: horizontal back to vertical.
            for k in 0..=n / 4 {
                let p = top * (1.0 - k as f64 / (n / 4) as f64) * (1.0 - 1e-9);
                let ray = sh.shoot(w, depth, p, false);
                v.push(Sample { delta: ray.delta, time: ray.time, p });
            }
            v
        };
        let core = |kind: Kind| -> Vec<Sample> {
            let n = 1500;
            let mut v = Vec::new();
            for k in 0..n {
                let p = p_graze * (k as f64 + 0.5) / n as f64;
                let ray = sh.shoot(Wave::P, depth, p, true);
                if ray.kind == kind {
                    v.push(Sample { delta: ray.delta, time: ray.time, p });
                }
            }
            v
        };
        let graze = |w: Wave, p: f64| {
            let ray = sh.shoot(w, depth, p * (1.0 + 1e-9), true);
            let mut touch = 0.0;
            sh.descend(w, p * (1.0 + 1e-9), r_s, |_, d, _| touch = d);
            (ray.delta, touch)
        };
        let (p_shadow, p_touch) = graze(Wave::P, p_graze);
        let (s_shadow, s_touch) = graze(Wave::S, s_graze);
        Curves {
            p: mantle(Wave::P, p_graze),
            s: mantle(Wave::S, s_graze),
            pkp: core(Kind::OuterCore),
            pkikp: core(Kind::InnerCore),
            p_graze,
            s_graze,
            p_shadow,
            s_shadow,
            p_touch,
            s_touch,
        }
    }

    /// Earliest time on a branch family at `delta` rad (None if no ray reaches it).
    pub fn first(samples: &[Sample], delta: f64) -> Option<f64> {
        let mut best: Option<f64> = None;
        for w in samples.windows(2) {
            let (a, b) = (w[0], w[1]);
            let (lo, hi) = if a.delta < b.delta { (a, b) } else { (b, a) };
            if !(delta >= lo.delta && delta <= hi.delta) || hi.delta - lo.delta > 0.05 {
                continue;
            }
            let u = if hi.delta > lo.delta { (delta - lo.delta) / (hi.delta - lo.delta) } else { 0.0 };
            let t = lo.time + (hi.time - lo.time) * u;
            best = Some(best.map_or(t, |b: f64| b.min(t)));
        }
        best
    }

    /// Smallest distance a family reaches (rad).
    pub fn min_delta(samples: &[Sample]) -> f64 {
        samples.iter().map(|s| s.delta).filter(|d| d.is_finite()).fold(f64::INFINITY, f64::min)
    }
}
