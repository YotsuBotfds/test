//! Puts the solver stages together for one source depth.

use super::fmm::{amplitude, source_seeds, Field, Grid, Marcher, Side, Stage};
use super::model::{speed, Wave, R_CMB, R_EARTH, R_ICB};
use super::rays::{shells, Kind};
use std::sync::OnceLock;

/// Field indices in `Solution::fields`.
pub const F_P: usize = 0;
pub const F_S: usize = 1;
/// P inside the whole core (through the inner core where that is faster).
pub const F_CORE: usize = 2;
/// P inside the liquid outer core only (the inner core masked out).
pub const F_OUTER: usize = 3;
/// The core waves carried back up into the mantle: through the inner core (PKIKP),
/// and through the outer core only (PKP).
pub const F_PKIKP: usize = 4;
pub const F_PKP: usize = 5;
pub const N_FIELDS: usize = 6;

/// Attenuation time constants, s. Shear waves lose energy faster (Q_S is roughly 4/9 of Q_P).
pub const TAU_P: f64 = 1600.0;
pub const TAU_S: f64 = 720.0;

/// Angular nodes over half the plane, and ring spacing in the mantle and core (km).
pub const NT: usize = 541;
pub const DR_MANTLE: f64 = 12.0;
pub const DR_CORE: f64 = 14.0;
/// The exit stages extend this many degrees short of the first exit point.
pub const EXIT_MARGIN: f64 = 14.0;

pub fn grid() -> &'static Grid {
    static G: OnceLock<Grid> = OnceLock::new();
    G.get_or_init(|| Grid::new(NT, DR_MANTLE, DR_CORE))
}

/// Shadow-zone geometry from ray theory, degrees.
#[derive(Clone, Copy, Debug, Default)]
pub struct Info {
    /// Distance where the P and S rays that graze the core reach the surface.
    pub p_shadow: f64,
    pub s_shadow: f64,
    /// Where those grazing rays touch the core.
    pub p_touch: f64,
    pub s_touch: f64,
    /// Nearest distance PKP (outer core only) reaches: the far edge of the P shadow.
    pub pkp_min: f64,
    /// Nearest distance PKIKP reaches.
    pub pkikp_min: f64,
    /// Smallest angle at which a core ray leaves the core.
    pub exit_min: f64,
}

/// A ray that crosses the core: where it enters and leaves, and when.
#[derive(Clone, Copy, Debug)]
pub struct CoreRay {
    pub p: f64,
    /// Take-off angle from straight down, rad.
    pub phi: f64,
    pub th_in: f64,
    pub t_in: f64,
    pub th_out: f64,
    pub t_out: f64,
    /// Epicentral distance (rad) and time at the surface.
    pub delta: f64,
    pub time: f64,
}

/// Rays through the core for one source depth: PKIKP (turning in the inner core) and
/// PKP (turning in the outer core), each sorted by ray parameter.
pub struct CoreRays {
    pub pkikp: Vec<CoreRay>,
    pub pkp: Vec<CoreRay>,
}

impl CoreRays {
    pub fn new(depth: f64) -> Self {
        let sh = shells();
        let r_s = R_EARTH - depth;
        let eta_s = sh.eta_at(Wave::P, r_s);
        let p_graze = R_CMB / speed(Wave::P, R_EARTH - R_CMB, false);
        let eta_ic = R_ICB / speed(Wave::P, R_EARTH - R_ICB, true);
        let eta_oc = R_ICB / speed(Wave::P, R_EARTH - R_ICB, false);
        let trace = |p: f64, want: Kind| -> Option<CoreRay> {
            let (mut th_in, mut t_in) = (f64::NAN, f64::NAN);
            let (_, d_turn, t_turn, kind) = sh.descend(Wave::P, p, r_s, |r, d, t| {
                if th_in.is_nan() && r <= R_CMB + 1e-6 {
                    th_in = d;
                    t_in = t;
                }
            });
            if kind != want || th_in.is_nan() {
                return None;
            }
            let (d_up, t_up) = sh.above(Wave::P, p, r_s);
            Some(CoreRay {
                p,
                phi: (p / eta_s).min(1.0).asin(),
                th_in,
                t_in,
                th_out: 2.0 * d_turn - th_in,
                t_out: 2.0 * t_turn - t_in,
                delta: 2.0 * d_turn + d_up,
                time: 2.0 * t_turn + t_up,
            })
        };
        let n = 260;
        // Dense where the exit point moves fastest: near the ends of each family.
        let pkikp = (0..n)
            .filter_map(|k| {
                let u = (k as f64 + 0.5) / n as f64;
                trace(eta_ic * (1.0 - (1.0 - u) * (1.0 - u)), Kind::InnerCore)
            })
            .collect();
        let pkp = (0..n)
            .filter_map(|k| {
                let u = (k as f64 + 0.5) / n as f64;
                let w = 0.5 - 0.5 * (std::f64::consts::PI * u).cos();
                trace(eta_oc + (p_graze - eta_oc) * w, Kind::OuterCore)
            })
            .collect();
        CoreRays { pkikp, pkp }
    }

    /// Seeds on the core-mantle boundary ring where a family leaves the core: the
    /// earliest exit time at each node, with its take-off angle.
    pub fn exit_seeds(family: &[CoreRay], g: &Grid) -> Vec<(usize, usize, f32, f32)> {
        let mut best = vec![(f32::INFINITY, 0.0f32); g.nt];
        for w in family.windows(2) {
            let (a, b) = (w[0], w[1]);
            if (a.th_out - b.th_out).abs() > 3f64.to_radians() {
                continue;
            }
            let (lo, hi) = (a.th_out.min(b.th_out), a.th_out.max(b.th_out));
            let i0 = (lo / g.dth).ceil().max(0.0) as usize;
            let i1 = ((hi / g.dth).floor() as usize).min(g.nt - 1);
            for (i, slot) in best.iter_mut().enumerate().take(i1 + 1).skip(i0) {
                let th = i as f64 * g.dth;
                let u = if hi > lo { (th - a.th_out) / (b.th_out - a.th_out) } else { 0.0 };
                let t = (a.t_out + (b.t_out - a.t_out) * u) as f32;
                if t < slot.0 {
                    *slot = (t, (a.phi + (b.phi - a.phi) * u) as f32);
                }
            }
        }
        best.iter()
            .enumerate()
            .filter(|(_, b)| b.0.is_finite())
            .map(|(i, b)| (g.j_cmb, i, b.0, b.1))
            .collect()
    }
}

impl Info {
    pub fn new(depth: f64, core: &CoreRays) -> Self {
        let sh = shells();
        let r_s = R_EARTH - depth;
        let graze = |w: Wave| {
            let p = R_CMB / speed(w, R_EARTH - R_CMB, false) * (1.0 + 1e-9);
            let ray = sh.shoot(w, depth, p, true);
            let mut touch = 0.0;
            sh.descend(w, p, r_s, |_, d, _| touch = d);
            (ray.delta.to_degrees(), touch.to_degrees())
        };
        let (p_shadow, p_touch) = graze(Wave::P);
        let (s_shadow, s_touch) = graze(Wave::S);
        let min_delta = |f: &[CoreRay]| f.iter().map(|r| r.delta).fold(f64::INFINITY, f64::min).to_degrees();
        let exit_min = core.pkikp.iter().chain(&core.pkp).map(|r| r.th_out).fold(f64::INFINITY, f64::min).to_degrees();
        Info { p_shadow, s_shadow, p_touch, s_touch, pkp_min: min_delta(&core.pkp), pkikp_min: min_delta(&core.pkikp), exit_min }
    }
}

pub struct Solution {
    pub depth: f64,
    pub fields: Vec<Field>,
    pub info: Info,
    /// Wall time of the solve, ms (0 when not measured).
    pub ms: f64,
    pub pops: usize,
}

fn mantle_side(r: f64) -> Side {
    if (r - R_CMB).abs() < 1e-6 {
        Side::Above
    } else {
        Side::Mean
    }
}
fn core_side(r: f64) -> Side {
    if (r - R_CMB).abs() < 1e-6 {
        Side::Below
    } else {
        Side::Mean
    }
}
fn outer_side(r: f64) -> Side {
    if (r - R_CMB).abs() < 1e-6 {
        Side::Below
    } else if (r - R_ICB).abs() < 1e-6 {
        Side::Above
    } else {
        Side::Mean
    }
}

/// Runs the stages one at a time, so the page can stay responsive while it solves.
pub struct Solver {
    depth: f64,
    stage: usize,
    m: Marcher,
    core_rays: Option<CoreRays>,
    info: Info,
    fields: Vec<Field>,
}

impl Solver {
    /// Rays, P, S, whole core, outer core, PKIKP exit, PKP exit, amplitudes.
    pub const STAGES: usize = 8;

    pub fn new(depth: f64) -> Self {
        Solver { depth: depth.clamp(0.0, 700.0), stage: 0, m: Marcher::new(), core_rays: None, info: Info::default(), fields: Vec::new() }
    }

    pub fn depth(&self) -> f64 {
        self.depth
    }

    /// Stages left to run.
    pub fn remaining(&self) -> usize {
        Self::STAGES - self.stage
    }

    /// Runs the next stage. Returns true when all are done.
    pub fn step(&mut self) -> bool {
        let g = grid();
        let nt = g.nt;
        let depth = self.depth;
        let radius = 3.0 * (R_EARTH * g.dth).max(DR_MANTLE);
        let mantle = |wave, seeds, i0| Stage { wave, j0: g.j_cmb, j1: g.j_top, i0, i1: nt - 1, side: mantle_side, seeds };
        // The core is lit only where direct rays reach it; beyond the grazing point the
        // mantle field is a diffracted wave, which must not feed the core.
        let lit = |p: &Field, info: &Info| -> Vec<(usize, usize, f32, f32)> {
            let i_touch = ((info.p_touch.to_radians() / g.dth).round() as usize).min(nt - 1);
            (0..=i_touch)
                .filter_map(|i| {
                    let k = p.idx(g.j_cmb, i)?;
                    p.t[k].is_finite().then(|| (g.j_cmb, i, p.t[k], p.phi[k]))
                })
                .collect()
        };
        // The core waves leave the core where ray theory says they do. (Seeding from
        // the core field itself would let a wave diffracted at the core's shadow edge
        // overtake PKIKP between 115 and 145 degrees.)
        let i_exit = (((self.info.exit_min - EXIT_MARGIN).max(0.0).to_radians() / g.dth).floor() as usize).min(nt - 2);
        match self.stage {
            0 => {
                let cr = CoreRays::new(depth);
                self.info = Info::new(depth, &cr);
                self.core_rays = Some(cr);
            }
            1 => {
                let f = self.m.march(g, &mantle(Wave::P, source_seeds(g, Wave::P, depth, radius), 0));
                self.fields.push(f);
            }
            2 => {
                let f = self.m.march(g, &mantle(Wave::S, source_seeds(g, Wave::S, depth, radius), 0));
                self.fields.push(f);
            }
            3 => {
                let seeds = lit(&self.fields[F_P], &self.info);
                let f = self.m.march(g, &Stage { wave: Wave::P, j0: 0, j1: g.j_cmb, i0: 0, i1: nt - 1, side: core_side, seeds });
                self.fields.push(f);
            }
            4 => {
                let seeds = lit(&self.fields[F_P], &self.info);
                let f = self.m.march(g, &Stage { wave: Wave::P, j0: g.j_icb, j1: g.j_cmb, i0: 0, i1: nt - 1, side: outer_side, seeds });
                self.fields.push(f);
            }
            5 | 6 => {
                let cr = self.core_rays.as_ref().unwrap();
                let fam = if self.stage == 5 { &cr.pkikp } else { &cr.pkp };
                let f = self.m.march(g, &mantle(Wave::P, CoreRays::exit_seeds(fam, g), i_exit));
                self.fields.push(f);
            }
            7 => {
                for (k, f) in self.fields.iter_mut().enumerate() {
                    amplitude(g, f, if k == F_S { TAU_S } else { TAU_P });
                    if k == F_P || k == F_S {
                        diffraction_fade(g, f, if k == F_P { Wave::P } else { Wave::S }, depth);
                    }
                    // The take-off angles are no longer needed.
                    f.phi = Vec::new();
                }
            }
            _ => {}
        }
        self.stage = (self.stage + 1).min(Self::STAGES);
        self.stage == Self::STAGES
    }

    pub fn finish(self) -> Solution {
        Solution { depth: self.depth, fields: self.fields, info: self.info, ms: 0.0, pops: self.m.pops }
    }
}

/// Behind the core, direct waves arrive only by diffraction round it, and fade fast.
/// Ray density alone leaves a faint residue there, which focusing near the antipode
/// would brighten; this applies the decay explicitly: e-fold per `DIFF_DECAY` degrees
/// beyond the ray that grazes the core.
pub const DIFF_DECAY: f64 = 6.0;

fn diffraction_fade(g: &Grid, f: &mut Field, wave: Wave, depth: f64) {
    let sh = shells();
    let p = R_CMB / speed(wave, R_EARTH - R_CMB, false) * (1.0 + 1e-9);
    let mut pts = Vec::new();
    sh.path(wave, depth, p, true, &mut pts);
    // The upgoing half of the grazing ray: angle against radius, radius increasing.
    let turn = pts.iter().enumerate().min_by(|a, b| a.1[0].total_cmp(&b.1[0])).map_or(0, |(k, _)| k);
    let up: Vec<(f64, f64)> = pts[turn..].iter().map(|q| (q[0] as f64, q[1] as f64)).collect();
    let edge = |r: f64| -> f64 {
        let k = up.partition_point(|q| q.0 < r);
        if k == 0 {
            return up[0].1;
        }
        if k >= up.len() {
            return up[up.len() - 1].1;
        }
        let (a, b) = (up[k - 1], up[k]);
        a.1 + (b.1 - a.1) * (r - a.0) / (b.0 - a.0).max(1e-9)
    };
    let w = f.width();
    for j in f.j0..=f.j1 {
        let th_g = edge(g.r[j]);
        for i in f.i0..=f.i1 {
            let past = i as f64 * g.dth - th_g;
            if past > 0.0 {
                f.amp[(j - f.j0) * w + (i - f.i0)] *= (-past.to_degrees() / DIFF_DECAY).exp() as f32;
            }
        }
    }
}

/// Milliseconds from an arbitrary origin (native only; wasm has no clock here).
pub fn now_ms() -> f64 {
    #[cfg(not(target_arch = "wasm32"))]
    {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now().duration_since(UNIX_EPOCH).map_or(0.0, |d| d.as_secs_f64() * 1000.0)
    }
    #[cfg(target_arch = "wasm32")]
    {
        0.0
    }
}

/// Solves every stage for a source at `depth` km.
pub fn solve(depth: f64) -> Solution {
    let t0 = now_ms();
    let mut s = Solver::new(depth);
    let mut last = t0;
    let names = ["rays", "P", "S", "core", "outer", "PKIKP exit", "PKP exit", "amplitude"];
    let timing = std::env::var("WAVES_TIMING").is_ok();
    loop {
        let k = s.stage;
        let done = s.step();
        if timing {
            let now = now_ms();
            eprintln!("  {:>10}: {:6.1} ms", names[k], now - last);
            last = now;
        }
        if done {
            break;
        }
    }
    let mut sol = s.finish();
    sol.ms = now_ms() - t0;
    sol
}

/// Phases a listener can hear first among the P-type waves.
pub const PH_P: u32 = 0;
pub const PH_PDIFF: u32 = 1;
pub const PH_PKIKP: u32 = 2;
pub const PH_PKP: u32 = 3;
pub const PH_NONE: u32 = 4;

impl Solution {
    /// Time and amplitude of a field at the surface, `delta` degrees from the source
    /// (linear between angular nodes). Infinite time where the field does not reach.
    pub fn surface(&self, field: usize, delta: f64) -> (f64, f64) {
        let g = grid();
        let f = &self.fields[field];
        let x = (delta.clamp(0.0, 180.0).to_radians() / g.dth).min((g.nt - 1) as f64);
        let i = (x.floor() as usize).min(g.nt - 2);
        let u = x - i as f64;
        let (a, b) = (f.at(g.j_top, i) as f64, f.at(g.j_top, i + 1) as f64);
        let (pa, pb) = (f.amp_at(g.j_top, i) as f64, f.amp_at(g.j_top, i + 1) as f64);
        if !a.is_finite() || !b.is_finite() {
            return (if u < 0.5 { a } else { b }, 0.0);
        }
        (a + (b - a) * u, pa + (pb - pa) * u)
    }

    /// The first P-type wave a listener `delta` degrees away records, and when:
    /// direct P, P diffracted round the core (faint), PKIKP through the inner core
    /// (faint, inside the shadow zone), or PKP beyond the shadow.
    pub fn first_p(&self, delta: f64) -> (u32, f64) {
        let i = &self.info;
        if delta <= i.p_shadow {
            (PH_P, self.surface(F_P, delta).0)
        } else if delta < i.pkikp_min {
            (PH_PDIFF, self.surface(F_P, delta).0)
        } else {
            let a = self.surface(F_PKIKP, delta).0;
            if delta < i.pkp_min {
                (PH_PKIKP, a)
            } else {
                (PH_PKP, a.min(self.surface(F_PKP, delta).0))
            }
        }
    }

    /// Angle (degrees from the source) where field `f`'s front crosses the ring at
    /// radius `r` km at time `t`, scanning from `from` towards `to` degrees; NaN if it
    /// does not cross there, or is fainter than `a_min` (1/km).
    pub fn front_on_ring(&self, f: usize, r: f64, t: f64, a_min: f64, from: f64, to: f64) -> f64 {
        let g = grid();
        let Some(field) = self.fields.get(f) else { return f64::NAN };
        let j = (g.ring_at(r).round() as usize).clamp(field.j0, field.j1);
        let idx = |d: f64| ((d.clamp(0.0, 180.0).to_radians() / g.dth).round() as usize).clamp(field.i0, field.i1);
        let (i0, i1) = (idx(from), idx(to));
        let step: i64 = if i1 >= i0 { 1 } else { -1 };
        let mut i = i0 as i64;
        let mut prev: Option<(i64, f64)> = None;
        while (step > 0 && i <= i1 as i64) || (step < 0 && i >= i1 as i64) {
            let ti = field.at(j, i as usize) as f64;
            if ti.is_finite() {
                if let Some((ip, tp)) = prev {
                    if (tp - t) * (ti - t) <= 0.0 && tp != ti {
                        let a = field.amp_at(j, ip as usize).min(field.amp_at(j, i as usize)) as f64;
                        if a < a_min {
                            return f64::NAN;
                        }
                        let u = (t - tp) / (ti - tp);
                        return ((ip as f64 + (i - ip) as f64 * u) * g.dth).to_degrees();
                    }
                }
                prev = Some((i, ti));
            } else {
                prev = None;
            }
            i += step;
        }
        f64::NAN
    }

    /// Direct S arrival time, or infinity in the S shadow.
    pub fn first_s(&self, delta: f64) -> f64 {
        if delta <= self.info.s_shadow {
            self.surface(F_S, delta).0
        } else {
            f64::INFINITY
        }
    }
}
