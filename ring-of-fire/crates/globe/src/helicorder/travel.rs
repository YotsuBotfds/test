//! First-arrival travel times, ray-traced through the iasp91 reference Earth
//! (Kennett & Engdahl 1991).
//!
//! The Earth is cut into thin spherical shells of constant velocity. Inside one,
//! a ray is a straight chord whose distance from the centre is `b = p·v` (Snell's
//! law for a sphere, `p = r sin i / v`), so its length and the angle it sweeps
//! are exact. Summing shells for a sweep of ray parameters `p` gives Δ(p) and
//! T(p) for every branch (crust, mantle, core); the earliest time at each
//! distance is kept. Rays that reach the core-mantle boundary at grazing
//! incidence are continued along it as diffracted waves, which fills the
//! shadow zone the way Pdiff and Sdiff do.

pub const R_EARTH: f64 = 6371.0;
pub const R_CMB: f64 = 3482.0;
pub const R_ICB: f64 = 1217.1;
/// Kilometres per degree of arc along the surface.
pub const KM_PER_DEG: f64 = R_EARTH * std::f64::consts::PI / 180.0;

/// iasp91 P and S velocity (km/s) at radius `r` km. S is 0 in the outer core.
pub fn iasp91(r: f64) -> (f64, f64) {
    let x = r / R_EARTH;
    let d = R_EARTH - r;
    let (x2, x3) = (x * x, x * x * x);
    if d < 20.0 {
        (5.8, 3.36)
    } else if d < 35.0 {
        (6.5, 3.75)
    } else if d < 120.0 {
        (8.78541 - 0.74953 * x, 6.706231 - 2.248585 * x)
    } else if d < 210.0 {
        (25.41389 - 17.69722 * x, 5.75020 - 1.27420 * x)
    } else if d < 410.0 {
        (30.78765 - 23.25415 * x, 15.24213 - 11.08552 * x)
    } else if d < 660.0 {
        (29.38896 - 21.40656 * x, 17.70732 - 13.50652 * x)
    } else if d < 760.0 {
        (25.96984 - 16.93412 * x, 20.76890 - 16.53147 * x)
    } else if d < 2740.0 {
        (
            25.1486 - 41.1538 * x + 51.9932 * x2 - 26.6083 * x3,
            12.9303 - 21.2590 * x + 27.8988 * x2 - 14.1080 * x3,
        )
    } else if d < 2889.0 {
        (14.49470 - 1.47089 * x, 8.16616 - 1.58206 * x)
    } else if d < 5153.9 {
        (10.03904 + 3.75665 * x - 13.67046 * x2, 0.0)
    } else {
        (11.24094 - 4.09689 * x2, 3.56454 - 3.45241 * x2)
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Wave {
    P,
    /// S in the crust and mantle; it converts to P in the liquid core (SKS).
    S,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum Branch {
    #[default]
    None,
    /// Turned in the crust or mantle (or went straight up from a deep source).
    Direct,
    /// Crossed the core (PKP, PKIKP, SKS).
    Core,
    /// Crept along the core-mantle boundary into the shadow zone (Pdiff, Sdiff).
    Diffracted,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Arrival {
    /// Seconds after the origin time.
    pub t: f32,
    /// Ray parameter, s per degree (the slope of the travel-time curve).
    pub p: f32,
    pub branch: Branch,
    /// Extra time of the surface reflection (pP − P, sS − S), seconds.
    pub depth_delay: f32,
    /// Take-off angle at the source from straight down, degrees.
    pub takeoff: f32,
}

struct Shell {
    r_hi: f64,
    r_lo: f64,
    v: f64,
}

/// Distances in the table, every `STEP` degrees from 0 to 180.
pub const STEP: f32 = 0.5;
const N_DIST: usize = (180.0 / STEP) as usize + 1;
/// Source depths the table is traced for; others interpolate linearly.
pub const DEPTHS: [f32; 6] = [0.0, 35.0, 100.0, 250.0, 450.0, 700.0];

pub struct Tables {
    /// [wave][depth] -> (mantle and diffracted arrivals, core arrivals), by distance.
    rows: [Vec<(Vec<Arrival>, Vec<Arrival>)>; 2],
}

fn shells(wave: Wave, rs: f64) -> (Vec<Shell>, usize) {
    // Discontinuities, then subdivide each interval.
    let edges = [R_EARTH, 6351.0, 6336.0, 6251.0, 6161.0, 5961.0, 5711.0, 5611.0, 3631.0, R_CMB, R_ICB, 0.0];
    let mut radii: Vec<f64> = Vec::new();
    for w in edges.windows(2) {
        let (a, b) = (w[0], w[1]);
        let step = if a > 5611.0 { 30.0 } else if a > R_CMB { 110.0 } else { 160.0 };
        let n = ((a - b) / step).ceil().max(1.0) as usize;
        for k in 0..n {
            radii.push(a - (a - b) * k as f64 / n as f64);
        }
    }
    radii.push(0.0);
    // The source sits exactly on a shell boundary.
    if !radii.iter().any(|&r| (r - rs).abs() < 1e-6) {
        radii.push(rs);
        radii.sort_by(|a, b| b.total_cmp(a));
    }
    let src = radii.iter().position(|&r| (r - rs).abs() < 1e-6).unwrap();
    let out = radii
        .windows(2)
        .map(|w| {
            let mid = 0.5 * (w[0] + w[1]);
            let (vp, vs) = iasp91(mid);
            let v = match wave {
                Wave::P => vp,
                Wave::S if vs > 0.0 && mid < R_ICB => vp, // SKIKS: P through the inner core too
                Wave::S if vs > 0.0 => vs,
                Wave::S => vp,
            };
            Shell { r_hi: w[0], r_lo: w[1], v }
        })
        .collect();
    (out, src)
}

/// One down-going ray: (Δ radians, T seconds, reached the core, τ of the leg above the source).
fn trace(p: f64, sh: &[Shell], src: usize) -> Option<(f64, f64, bool, f64)> {
    let (mut delta, mut t, mut tau_up) = (0.0, 0.0, 0.0);
    let mut core = false;
    for (i, s) in sh.iter().enumerate() {
        let b = p * s.v;
        if b >= s.r_hi {
            // Cannot enter: the ray turned (reflected) at the top of this shell.
            if i <= src {
                return None;
            }
            return Some((delta, t, core, tau_up));
        }
        let mult = if i < src { 1.0 } else { 2.0 };
        let psi_hi = (s.r_hi * s.r_hi - b * b).sqrt().atan2(b);
        let len_hi = (s.r_hi * s.r_hi - b * b).sqrt();
        let turning = b >= s.r_lo;
        let (dpsi, len) = if turning {
            (psi_hi, len_hi)
        } else {
            let l = (s.r_lo * s.r_lo - b * b).sqrt();
            (psi_hi - l.atan2(b), len_hi - l)
        };
        if i < src {
            tau_up += len / s.v - p * dpsi;
        }
        delta += mult * dpsi;
        t += mult * len / s.v;
        if s.r_lo < R_CMB {
            core = true;
        }
        if turning {
            return Some((delta, t, core, tau_up));
        }
    }
    Some((delta, t, core, tau_up))
}

/// Up-going ray from a buried source straight to the surface.
fn trace_up(p: f64, sh: &[Shell], src: usize) -> Option<(f64, f64)> {
    let (mut delta, mut t) = (0.0, 0.0);
    for s in &sh[..src] {
        let b = p * s.v;
        if b >= s.r_lo {
            return None;
        }
        let a = (s.r_hi * s.r_hi - b * b).sqrt();
        let l = (s.r_lo * s.r_lo - b * b).sqrt();
        delta += a.atan2(b) - l.atan2(b);
        t += (a - l) / s.v;
    }
    Some((delta, t))
}

struct Sample {
    p: f64,
    d: f64,
    t: f64,
    core: bool,
    tau: f64,
}

fn build(wave: Wave, depth: f64) -> (Vec<Arrival>, Vec<Arrival>) {
    let rs = R_EARTH - depth;
    let (sh, src) = shells(wave, rs);
    let v_src = sh[src].v;
    let v_above = if src > 0 { sh[src - 1].v } else { v_src };
    let pmax = rs / v_src * (1.0 - 1e-9);
    let empty = vec![Arrival { t: f32::INFINITY, ..Default::default() }; N_DIST];
    let (mut mantle, mut core) = (empty.clone(), empty);
    let deg = 180.0 / std::f64::consts::PI;
    let takeoff = |p: f64| ((p * v_src / rs).clamp(-1.0, 1.0).asin() * deg) as f32;

    // Adaptive sweep of p: bisect wherever neighbouring rays land far apart.
    let eval = |p: f64| trace(p, &sh, src).map(|(d, t, core, tau)| Sample { p, d: d * deg, t, core, tau });
    let n0 = 240;
    // Uniform in take-off angle, which crowds rays where Δ changes fastest.
    let ray = |i: usize, n: usize, top: f64| top * (std::f64::consts::FRAC_PI_2 * i as f64 / n as f64).sin();
    let mut samples: Vec<Sample> = (0..=n0).filter_map(|i| eval(ray(i, n0, pmax))).collect();
    for _ in 0..9 {
        let mut add = Vec::new();
        for w in samples.windows(2) {
            let gap = (w[1].d - w[0].d).abs();
            if gap > 1.0 && w[1].p - w[0].p > pmax * 1e-6 {
                if let Some(s) = eval(0.5 * (w[0].p + w[1].p)) {
                    add.push(s);
                }
            }
        }
        if add.is_empty() {
            break;
        }
        samples.extend(add);
        samples.sort_by(|a, b| a.p.total_cmp(&b.p));
    }

    let fill = |table: &mut Vec<Arrival>, a: (f64, f64, f64), b: (f64, f64, f64), branch: Branch, tau: f64, to: f32| {
        // Fold distances beyond 180 degrees back (the ray came round the far side).
        let fold = |d: f64| if d > 180.0 { 360.0 - d } else { d };
        let (da, db) = (fold(a.0), fold(b.0));
        if (a.0 > 180.0) != (b.0 > 180.0) || (db - da).abs() > 2.5 {
            return;
        }
        let (lo, hi) = if da <= db { (da, db) } else { (db, da) };
        let i0 = (lo / STEP as f64).ceil() as usize;
        let i1 = ((hi / STEP as f64).floor() as usize).min(N_DIST - 1);
        for (i, cell) in table.iter_mut().enumerate().take(i1 + 1).skip(i0) {
            let d = i as f64 * STEP as f64;
            let f = if (db - da).abs() < 1e-9 { 0.0 } else { (d - da) / (db - da) };
            let t = a.1 + (b.1 - a.1) * f;
            if (t as f32) < cell.t {
                let p = (a.2 + (b.2 - a.2) * f) / deg;
                *cell = Arrival { t: t as f32, p: p as f32, branch, depth_delay: (2.0 * tau) as f32, takeoff: to };
            }
        }
    };
    for w in samples.windows(2) {
        let (a, b) = (&w[0], &w[1]);
        if a.core != b.core {
            continue;
        }
        let (table, branch) = if a.core { (&mut core, Branch::Core) } else { (&mut mantle, Branch::Direct) };
        fill(table, (a.d, a.t, a.p), (b.d, b.t, b.p), branch, 0.5 * (a.tau + b.tau), takeoff(0.5 * (a.p + b.p)));
    }
    // Up-going rays from a buried source: first arrivals close to the epicentre.
    if src > 0 {
        let pup = rs / v_above * (1.0 - 1e-9);
        let up: Vec<(f64, f64, f64)> =
            (0..=160).filter_map(|i| { let p = ray(i, 160, pup.min(pmax)); trace_up(p, &sh, src).map(|(d, t)| (d * deg, t, p)) }).collect();
        for w in up.windows(2) {
            fill(&mut mantle, w[0], w[1], Branch::Direct, 0.0, 180.0 - takeoff(0.5 * (w[0].2 + w[1].2)));
        }
    }
    // Diffraction along the core-mantle boundary from the grazing ray onwards.
    let cmb = sh.iter().position(|s| s.r_lo < R_CMB + 1e-6).unwrap();
    let p_graze = R_CMB / sh[cmb - 1].v;
    if let Some((d, t, _, tau)) = trace(p_graze * (1.0 + 1e-7), &sh, src) {
        let (d0, t0) = (d * deg, t);
        let slow = p_graze / deg;
        for (i, cell) in mantle.iter_mut().enumerate() {
            let dd = i as f64 * STEP as f64;
            if dd > d0 {
                let t = t0 + slow * (dd - d0);
                if (t as f32) < cell.t {
                    *cell = Arrival { t: t as f32, p: slow as f32, branch: Branch::Diffracted, depth_delay: (2.0 * tau) as f32, takeoff: takeoff(p_graze) };
                }
            }
        }
    }
    // Close pinholes left between samples; core phases stay absent where no ray lands.
    for table in [&mut mantle, &mut core] {
        for i in 1..N_DIST - 1 {
            if !table[i].t.is_finite() && table[i - 1].t.is_finite() && table[i + 1].t.is_finite() {
                let (a, b) = (table[i - 1], table[i + 1]);
                table[i] = Arrival { t: 0.5 * (a.t + b.t), p: 0.5 * (a.p + b.p), ..a };
            }
        }
    }
    (mantle, core)
}

impl Tables {
    pub fn new() -> Self {
        let rows = [Wave::P, Wave::S].map(|w| DEPTHS.iter().map(|&d| build(w, d as f64)).collect());
        Tables { rows }
    }

    /// The arrival a seismogram shows first at `dist` degrees from a source `depth`
    /// km deep: the direct wave out to the shadow zone, then whichever of the
    /// diffracted wave and the core phase comes first, and the core phase alone
    /// beyond 140 degrees, where diffracted energy has died away.
    pub fn first(&self, wave: Wave, dist: f32, depth: f32) -> Arrival {
        let m = self.lookup(wave, dist, depth, false);
        let c = self.lookup(wave, dist, depth, true);
        if !c.t.is_finite() || m.branch == Branch::Direct {
            return m;
        }
        if dist >= 140.0 || c.t < m.t {
            c
        } else {
            m
        }
    }

    fn lookup(&self, wave: Wave, dist: f32, depth: f32, core: bool) -> Arrival {
        let rows = &self.rows[wave as usize];
        let depth = depth.clamp(0.0, DEPTHS[DEPTHS.len() - 1]);
        let j = DEPTHS.iter().rposition(|&d| d <= depth).unwrap().min(DEPTHS.len() - 2);
        let fz = (depth - DEPTHS[j]) / (DEPTHS[j + 1] - DEPTHS[j]);
        let u = (dist.clamp(0.0, 180.0) / STEP).min((N_DIST - 1) as f32 - 1e-3);
        let i = u as usize;
        let fx = u - i as f32;
        let at = |r: &(Vec<Arrival>, Vec<Arrival>)| {
            let r = if core { &r.1 } else { &r.0 };
            let (a, b) = (r[i], r[i + 1]);
            // Off the end of a branch: take the side that exists.
            let (a, b) = match (a.t.is_finite(), b.t.is_finite()) {
                (true, false) => (a, a),
                (false, true) => (b, b),
                _ => (a, b),
            };
            let lerp = |x: f32, y: f32| lerp_finite(x, y, fx);
            Arrival {
                t: lerp(a.t, b.t),
                p: lerp(a.p, b.p),
                branch: if fx < 0.5 { a.branch } else { b.branch },
                depth_delay: lerp(a.depth_delay, b.depth_delay),
                takeoff: lerp(a.takeoff, b.takeoff),
            }
        };
        let (a, b) = (at(&rows[j]), at(&rows[j + 1]));
        let (a, b) = match (a.t.is_finite(), b.t.is_finite()) {
            (true, false) => (a, a),
            (false, true) => (b, b),
            _ => (a, b),
        };
        let lerp = |x: f32, y: f32| lerp_finite(x, y, fz);
        Arrival {
            t: lerp(a.t, b.t),
            p: lerp(a.p, b.p),
            branch: if fz < 0.5 { a.branch } else { b.branch },
            depth_delay: lerp(a.depth_delay, b.depth_delay),
            takeoff: lerp(a.takeoff, b.takeoff),
        }
    }
}

/// Linear interpolation that never mixes a missing (infinite) value into a real one.
fn lerp_finite(x: f32, y: f32, f: f32) -> f32 {
    match (x.is_finite(), y.is_finite()) {
        (true, true) => x + (y - x) * f,
        (true, false) => x,
        (false, true) => y,
        _ => f32::INFINITY,
    }
}

impl Default for Tables {
    fn default() -> Self {
        Self::new()
    }
}

static TABLES: std::sync::OnceLock<Tables> = std::sync::OnceLock::new();

/// The traced tables, built once (about 20 ms natively).
pub fn tables() -> &'static Tables {
    TABLES.get_or_init(Tables::new)
}

/// Geocentric great-circle distance (degrees) and back-azimuth (degrees clockwise
/// from north, as seen from the station looking towards the source).
pub fn distance_azimuth(st_lat: f64, st_lon: f64, ev_lat: f64, ev_lon: f64) -> (f64, f64) {
    // Geographic -> geocentric latitude (WGS84 flattening), as seismic distances use.
    let gc = |lat: f64| ((1.0 - 0.006_694_38) * lat.to_radians().tan()).atan();
    let (a1, a2) = (gc(st_lat), gc(ev_lat));
    let dl = (ev_lon - st_lon).to_radians();
    let (s1, c1, s2, c2) = (a1.sin(), a1.cos(), a2.sin(), a2.cos());
    let x = c1 * s2 - s1 * c2 * dl.cos();
    let y = c2 * dl.sin();
    let z = s1 * s2 + c1 * c2 * dl.cos();
    let dist = (x * x + y * y).sqrt().atan2(z).to_degrees();
    let back_az = y.atan2(x).to_degrees().rem_euclid(360.0);
    (dist, back_az)
}
