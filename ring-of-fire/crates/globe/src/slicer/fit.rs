//! Profile geometry, band selection and the robust Wadati–Benioff fit.
//!
//! Everything here works in the true geometry of a sphere of radius `R_EARTH`:
//! a profile is a great-circle arc from A to B, a quake is located by its
//! along-track distance (km on the surface, from A) and its across-track distance
//! (km, positive to the left of A→B), and the slab is fitted in the plane of the
//! great circle, where a hypocentre at along-angle θ and depth d sits at radius
//! R − d. Distances in that plane are real kilometres, so the fitted dip is the
//! real angle between the slab and the local horizontal.

use crate::data::{world, World};
use crate::gfx::{hash, v3};
use std::sync::OnceLock;

pub const R_EARTH: f32 = 6371.0;
/// Quakes at or below this depth count as slab (intermediate and deep) events.
/// Shallower ones are mostly crust and plate-interface quakes.
pub const SLAB_MIN_DEPTH: f32 = 70.0;
/// Fewest slab-depth quakes we try to fit a slab to.
pub const MIN_DEEP: usize = 12;

type V = [f32; 3];

/// Unit vector of every quake epicentre, built once.
pub fn units() -> &'static [V] {
    static U: OnceLock<Vec<V>> = OnceLock::new();
    U.get_or_init(|| world().quakes.iter().map(|q| v3::from_latlon(q.lat, q.lon)).collect())
}

/// A profile: endpoints A and B (lat, lon in degrees) and the band half-width in km.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Profile {
    pub a: [f32; 2],
    pub b: [f32; 2],
    pub half_width: f32,
}

/// The great circle through a profile, with an orthonormal frame:
/// `a` (towards A), `e2` (90° ahead of A towards B) and the pole `n`.
#[derive(Clone, Copy, Debug)]
pub struct Geom {
    pub a: V,
    pub e2: V,
    pub n: V,
    /// Angular length, radians.
    pub delta: f32,
    /// Length on the surface, km.
    pub length: f32,
}

impl Geom {
    pub fn new(p: &Profile) -> Geom {
        let a = v3::from_latlon(p.a[0], p.a[1]);
        let b = v3::from_latlon(p.b[0], p.b[1]);
        let mut n = v3::cross(a, b);
        if v3::len(n) < 1e-6 {
            // A and B coincide (or are antipodal): any great circle through A will do.
            n = v3::cross(a, if a[2].abs() < 0.9 { [0.0, 0.0, 1.0] } else { [1.0, 0.0, 0.0] });
        }
        let n = v3::norm(n);
        let e2 = v3::cross(n, a);
        let delta = v3::angle(a, b);
        Geom { a, e2, n, delta, length: delta * R_EARTH }
    }

    /// (along km from A, across km, positive to the left of A→B) of a unit vector.
    #[inline]
    pub fn locate(&self, p: V) -> (f32, f32) {
        let s = v3::dot(p, self.n).clamp(-1.0, 1.0);
        let along = v3::dot(p, self.e2).atan2(v3::dot(p, self.a));
        (along * R_EARTH, s.asin() * R_EARTH)
    }

    /// Unit vector at profile coordinates (km).
    pub fn point(&self, along: f32, across: f32) -> V {
        let (t, c) = (along / R_EARTH, across / R_EARTH);
        let g = v3::add(v3::scale(self.a, t.cos()), v3::scale(self.e2, t.sin()));
        v3::norm(v3::add(v3::scale(g, c.cos()), v3::scale(self.n, c.sin())))
    }

    /// Unit tangent of the great circle (towards B) at `along` km.
    pub fn tangent(&self, along: f32) -> V {
        let t = along / R_EARTH;
        v3::add(v3::scale(self.a, -t.sin()), v3::scale(self.e2, t.cos()))
    }

    /// Bearing of the profile at `along` km, degrees clockwise from north.
    pub fn azimuth(&self, along: f32) -> f32 {
        bearing(self.point(along, 0.0), self.tangent(along))
    }
}

/// Bearing of tangent direction `t` at point `p`, degrees clockwise from north, 0..360.
pub fn bearing(p: V, t: V) -> f32 {
    let east = if p[2].abs() > 0.999_999 { [0.0, 1.0, 0.0] } else { v3::norm(v3::cross([0.0, 0.0, 1.0], p)) };
    let north = v3::cross(p, east);
    let az = v3::dot(t, east).atan2(v3::dot(t, north)).to_degrees();
    if az < 0.0 {
        az + 360.0
    } else {
        az
    }
}

/// One quake inside a profile's band.
#[derive(Clone, Copy, Debug)]
pub struct BandQuake {
    /// Index into the catalogue.
    pub i: u32,
    pub t: u32,
    pub along: f32,
    pub across: f32,
    pub depth: f32,
    pub mag: f32,
}

/// Every quake within `half_width` km of the arc A→B (and between its ends), in catalogue
/// (time) order. About a millisecond for the whole catalogue.
pub fn collect_band(world: &World, g: &Geom, half_width: f32, out: &mut Vec<BandQuake>) {
    out.clear();
    let sw = (half_width / R_EARTH).sin();
    let (a, e2, n) = (g.a, g.e2, g.n);
    for (i, (p, q)) in units().iter().zip(&world.quakes).enumerate() {
        let s = v3::dot(*p, n);
        if s.abs() > sw {
            continue;
        }
        let along = v3::dot(*p, e2).atan2(v3::dot(*p, a)) * R_EARTH;
        if !(0.0..=g.length).contains(&along) {
            continue;
        }
        out.push(BandQuake { i: i as u32, t: q.t, along, across: s.asin() * R_EARTH, depth: q.depth, mag: q.mag });
    }
}

// ---------- the cross-section plane ----------

/// Cartesian coordinates in the plane of the great circle, in km: X along the
/// tangent at along-angle `theta_ref`, Z down from that tangent point. The
/// Earth's centre is at (0, R).
#[inline]
fn to_plane(along: f32, depth: f32, theta_ref: f32) -> [f32; 2] {
    let t = along / R_EARTH - theta_ref;
    let r = R_EARTH - depth;
    [r * t.sin(), R_EARTH - r * t.cos()]
}

#[inline]
fn from_plane(p: [f32; 2], theta_ref: f32) -> (f32, f32) {
    let (x, y) = (p[0], R_EARTH - p[1]);
    ((theta_ref + x.atan2(y)) * R_EARTH, R_EARTH - (x * x + y * y).sqrt())
}

/// Unit vector pointing down (towards the centre) at a plane point.
#[inline]
fn down(p: [f32; 2]) -> [f32; 2] {
    let (dx, dz) = (-p[0], R_EARTH - p[1]);
    let l = (dx * dx + dz * dz).sqrt().max(1e-6);
    [dx / l, dz / l]
}

#[inline]
fn dot2(a: [f32; 2], b: [f32; 2]) -> f32 {
    a[0] * b[0] + a[1] * b[1]
}

/// Angle in degrees between a direction and the local horizontal at `p`.
#[inline]
fn dip_at(p: [f32; 2], t: [f32; 2]) -> f32 {
    let l = (t[0] * t[0] + t[1] * t[1]).sqrt().max(1e-9);
    (dot2([t[0] / l, t[1] / l], down(p)).abs().min(1.0)).asin().to_degrees()
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Model {
    Line,
    /// A quadratic about the fitted line, for slabs that steepen or flatten with depth.
    Curve,
}

/// A fitted Wadati–Benioff zone.
#[derive(Clone, Debug)]
pub struct Slab {
    pub model: Model,
    /// Quakes at or below `SLAB_MIN_DEPTH` in the band (the fit's input).
    pub n_deep: usize,
    /// Of those, how many lie within the inlier distance of the fit.
    pub inliers: usize,
    /// Mean dip, degrees: the chord from the shallowest to the deepest inlier,
    /// measured against the local horizontal at its midpoint.
    pub dip: f32,
    /// Formal 1σ uncertainty of the dip, degrees.
    pub dip_err: f32,
    /// Local dip at the shallow and deep ends of the fitted zone, degrees.
    pub dip_top: f32,
    pub dip_bottom: f32,
    /// Depth range of the inliers, km.
    pub top_depth: f32,
    pub max_depth: f32,
    /// Along-profile distance (km from A) where the zone, extended updip along its
    /// tangent, reaches the surface.
    pub intercept: Option<f32>,
    /// RMS distance of the inliers from the fit, km (measured perpendicular to it).
    pub scatter: f32,
    /// True when the slab deepens towards B.
    pub toward_b: bool,
    /// Inlier distance used, km.
    pub tau: f32,
    theta_ref: f32,
    c: [f32; 2],
    dir: [f32; 2],
    nrm: [f32; 2],
    q: [f32; 3],
    u0: f32,
    u1: f32,
}

impl Slab {
    fn plane_at(&self, u: f32) -> [f32; 2] {
        let v = self.q[0] + self.q[1] * u + self.q[2] * u * u;
        [self.c[0] + u * self.dir[0] + v * self.nrm[0], self.c[1] + u * self.dir[1] + v * self.nrm[1]]
    }
    fn plane_tangent(&self, u: f32) -> [f32; 2] {
        let dv = self.q[1] + 2.0 * self.q[2] * u;
        [self.dir[0] + dv * self.nrm[0], self.dir[1] + dv * self.nrm[1]]
    }
    /// (along km, depth km) of the fitted zone at fraction `f` (0 = shallowest inlier,
    /// 1 = deepest).
    pub fn at(&self, f: f32) -> (f32, f32) {
        from_plane(self.plane_at(self.u0 + (self.u1 - self.u0) * f), self.theta_ref)
    }
    /// Local dip at fraction `f`, degrees.
    pub fn dip_at(&self, f: f32) -> f32 {
        let u = self.u0 + (self.u1 - self.u0) * f;
        dip_at(self.plane_at(u), self.plane_tangent(u))
    }
    /// Unit down-dip tangent at fraction `f`, as (d along km, d depth km) per km.
    pub fn tangent_at(&self, f: f32) -> (f32, f32) {
        let u = self.u0 + (self.u1 - self.u0) * f;
        let p = self.plane_at(u);
        let t = self.plane_tangent(u);
        let l = (t[0] * t[0] + t[1] * t[1]).sqrt().max(1e-9);
        let (t, dn) = ([t[0] / l, t[1] / l], down(p));
        // Split into local horizontal (towards B) and local down.
        let horiz = [dn[1], -dn[0]];
        (dot2(t, horiz), dot2(t, dn))
    }
    /// Perpendicular distance (km) of a hypocentre from the fitted zone.
    pub fn distance(&self, along: f32, depth: f32) -> f32 {
        let p = to_plane(along, depth, self.theta_ref);
        let (u, v) = (dot2([p[0] - self.c[0], p[1] - self.c[1]], self.dir), dot2([p[0] - self.c[0], p[1] - self.c[1]], self.nrm));
        // Distance to the quadratic, measured across the line frame: close enough
        // for the gentle curvatures we accept.
        (v - (self.q[0] + self.q[1] * u + self.q[2] * u * u)).abs() / (1.0 + (self.q[1] + 2.0 * self.q[2] * u).powi(2)).sqrt()
    }
    /// The surface point the zone reaches when extended updip from its shallowest
    /// inlier along the local tangent: (along km, depth 0).
    fn surface_hit(&self) -> Option<(f32, f32)> {
        let p = self.plane_at(self.u0);
        let t = self.plane_tangent(self.u0);
        let l = (t[0] * t[0] + t[1] * t[1]).sqrt().max(1e-9);
        let up = [-t[0] / l, -t[1] / l];
        // |p + s·up − C|² = R², C = (0, R).
        let d = [p[0], p[1] - R_EARTH];
        let b = dot2(d, up);
        let c = dot2(d, d) - R_EARTH * R_EARTH;
        let disc = b * b - c;
        if disc < 0.0 {
            return None;
        }
        let s = -b - disc.sqrt();
        let s = if s >= 0.0 { s } else { -b + disc.sqrt() };
        if !(0.0..=3000.0).contains(&s) {
            return None;
        }
        Some(from_plane([p[0] + s * up[0], p[1] + s * up[1]], self.theta_ref))
    }
}

/// Why a band has no fitted slab.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NoSlab {
    /// Fewer than `MIN_DEEP` quakes at slab depth.
    TooFewDeep,
    /// Enough deep quakes, but no dipping zone explains them.
    Scattered,
}

#[derive(Clone, Debug)]
pub enum SlabResult {
    Fit(Box<Slab>),
    None { n: usize, n_deep: usize, why: NoSlab },
}

impl SlabResult {
    pub fn slab(&self) -> Option<&Slab> {
        match self {
            SlabResult::Fit(s) => Some(s),
            SlabResult::None { .. } => None,
        }
    }
}

fn median(v: &mut [f32]) -> f32 {
    if v.is_empty() {
        return 0.0;
    }
    let m = v.len() / 2;
    let (_, x, _) = v.select_nth_unstable_by(m, |a, b| a.total_cmp(b));
    *x
}

/// Weighted principal axis: centroid and unit direction (pointing down, +Z).
fn weighted_axis(p: &[[f32; 2]], w: &[f32]) -> Option<([f32; 2], [f32; 2])> {
    let (mut sw, mut sx, mut sz) = (0.0f64, 0.0f64, 0.0f64);
    for (q, &wi) in p.iter().zip(w) {
        sw += wi as f64;
        sx += (wi * q[0]) as f64;
        sz += (wi * q[1]) as f64;
    }
    if sw <= 1e-9 {
        return None;
    }
    let (cx, cz) = (sx / sw, sz / sw);
    let (mut xx, mut zz, mut xz) = (0.0f64, 0.0f64, 0.0f64);
    for (q, &wi) in p.iter().zip(w) {
        let (dx, dz) = (q[0] as f64 - cx, q[1] as f64 - cz);
        xx += wi as f64 * dx * dx;
        zz += wi as f64 * dz * dz;
        xz += wi as f64 * dx * dz;
    }
    let ang = 0.5 * (2.0 * xz).atan2(xx - zz);
    let mut d = [ang.cos() as f32, ang.sin() as f32];
    if d[1] < 0.0 || (d[1] == 0.0 && d[0] < 0.0) {
        d = [-d[0], -d[1]];
    }
    Some(([cx as f32, cz as f32], d))
}

/// Tukey biweight.
#[inline]
fn biweight(r: f32, c: f32) -> f32 {
    let u = r / c;
    if u.abs() >= 1.0 {
        0.0
    } else {
        let t = 1.0 - u * u;
        t * t
    }
}

/// Robust scale of residuals (normalised MAD), ignoring gross outliers.
fn robust_sigma(res: &[f32], scratch: &mut Vec<f32>, cap: f32) -> f32 {
    scratch.clear();
    scratch.extend(res.iter().map(|r| r.abs()).filter(|r| *r < cap));
    if scratch.len() < 3 {
        return cap / 3.0;
    }
    1.4826 * median(scratch)
}

/// Inlier distance: a quake belongs to the zone when it is this close to the fit.
fn inlier_tau(sigma: f32) -> f32 {
    (2.5 * sigma).clamp(15.0, 40.0)
}

/// Fit a Wadati–Benioff zone to the slab-depth quakes of a band.
///
/// 1. Hypocentres at or below `SLAB_MIN_DEPTH` go into the true cross-section plane.
/// 2. RANSAC over point pairs (deterministic, at most 700 hypotheses) finds the dipping
///    line (dip ≥ 10°) with the most support within 25 km.
/// 3. Iteratively reweighted orthogonal regression (Tukey biweight, scale from the MAD)
///    refines it.
/// 4. A quadratic about that line is tried with the same weights; it is kept only
///    when it cuts the robust scatter by 12 % or more, keeps 90 % of the line's
///    inliers (and at least 40), changes the dip by 8° or more from top to bottom,
///    dips 15° or more at both ends, and bends no tighter than a 250 km radius.
/// 5. No slab is reported with fewer than `MIN_DEEP` slab-depth quakes, fewer than
///    10 inliers, or a zone spanning less than 80 km of depth.
pub fn fit_slab(band: &[BandQuake]) -> SlabResult {
    let n = band.len();
    let deep: Vec<&BandQuake> = band.iter().filter(|q| q.depth >= SLAB_MIN_DEPTH).collect();
    let n_deep = deep.len();
    if n_deep < MIN_DEEP {
        return SlabResult::None { n, n_deep, why: NoSlab::TooFewDeep };
    }
    let theta_ref = deep.iter().map(|q| q.along).sum::<f32>() / n_deep as f32 / R_EARTH;
    let pts: Vec<[f32; 2]> = deep.iter().map(|q| to_plane(q.along, q.depth, theta_ref)).collect();
    let scattered = SlabResult::None { n, n_deep, why: NoSlab::Scattered };

    // ---- RANSAC ----
    let tau0 = 25.0f32;
    let stride = n_deep.div_ceil(600);
    let sample: Vec<[f32; 2]> = pts.iter().step_by(stride).copied().collect();
    let mut best: Option<(f32, [f32; 2], [f32; 2])> = None;
    let consider = |i: usize, j: usize, best: &mut Option<(f32, [f32; 2], [f32; 2])>| {
        let (p, q) = (pts[i], pts[j]);
        let d = [q[0] - p[0], q[1] - p[1]];
        let l = (d[0] * d[0] + d[1] * d[1]).sqrt();
        if l < 50.0 {
            return;
        }
        let mut dir = [d[0] / l, d[1] / l];
        if dir[1] < 0.0 {
            dir = [-dir[0], -dir[1]];
        }
        let mid = [(p[0] + q[0]) * 0.5, (p[1] + q[1]) * 0.5];
        if dip_at(mid, dir) < 10.0 {
            return;
        }
        let nrm = [-dir[1], dir[0]];
        let mut score = 0.0;
        for s in &sample {
            let r = (s[0] - p[0]) * nrm[0] + (s[1] - p[1]) * nrm[1];
            let u = r / tau0;
            if u.abs() < 1.0 {
                score += 1.0 - u * u;
            }
        }
        if best.is_none_or(|b| score > b.0) {
            *best = Some((score, p, dir));
        }
    };
    if n_deep <= 38 {
        for i in 0..n_deep {
            for j in i + 1..n_deep {
                consider(i, j, &mut best);
            }
        }
    } else {
        for k in 0..700u32 {
            let i = (hash(k.wrapping_mul(2).wrapping_add(0x51ab)) * n_deep as f32) as usize % n_deep;
            let j = (hash(k.wrapping_mul(2).wrapping_add(0x9e37_79b9)) * n_deep as f32) as usize % n_deep;
            if i != j {
                consider(i, j, &mut best);
            }
        }
    }
    let Some((_, mut c, mut dir)) = best else {
        return scattered;
    };

    // ---- IRLS orthogonal regression ----
    let mut res = vec![0.0f32; n_deep];
    let mut w = vec![1.0f32; n_deep];
    let mut scratch = Vec::with_capacity(n_deep);
    let mut sigma = 20.0f32;
    for it in 0..12 {
        let nrm = [-dir[1], dir[0]];
        for (r, p) in res.iter_mut().zip(&pts) {
            *r = (p[0] - c[0]) * nrm[0] + (p[1] - c[1]) * nrm[1];
        }
        sigma = robust_sigma(&res, &mut scratch, if it == 0 { 60.0 } else { 6.0 * sigma.max(5.0) }).max(5.0);
        let cut = 4.685 * sigma;
        for (wi, r) in w.iter_mut().zip(&res) {
            *wi = biweight(*r, cut);
        }
        match weighted_axis(&pts, &w) {
            Some((c2, d2)) => {
                c = c2;
                dir = d2;
            }
            None => return scattered,
        }
    }
    let nrm = [-dir[1], dir[0]];
    for (r, p) in res.iter_mut().zip(&pts) {
        *r = (p[0] - c[0]) * nrm[0] + (p[1] - c[1]) * nrm[1];
    }
    let us: Vec<f32> = pts.iter().map(|p| (p[0] - c[0]) * dir[0] + (p[1] - c[1]) * dir[1]).collect();
    let tau = inlier_tau(sigma);

    // ---- quadratic about the line ----
    let line_q = [0.0f32; 3];
    let quad = fit_quadratic(&us, &pts, c, dir, sigma);

    let evaluate = |q: [f32; 3]| -> (usize, f32, f32, f32) {
        // (inliers, rms of inliers, u0, u1)
        let (mut k, mut ss, mut u0, mut u1) = (0usize, 0.0f32, f32::MAX, f32::MIN);
        for (p, &u) in pts.iter().zip(&us) {
            let v = (p[0] - c[0]) * nrm[0] + (p[1] - c[1]) * nrm[1];
            let r = (v - (q[0] + q[1] * u + q[2] * u * u)) / (1.0 + (q[1] + 2.0 * q[2] * u).powi(2)).sqrt();
            if r.abs() <= tau {
                k += 1;
                ss += r * r;
                u0 = u0.min(u);
                u1 = u1.max(u);
            }
        }
        (k, if k > 0 { (ss / k as f32).sqrt() } else { f32::MAX }, u0, u1)
    };
    let (k_line, rms_line, lu0, lu1) = evaluate(line_q);
    let mut chosen = (Model::Line, line_q, k_line, rms_line, lu0, lu1);
    if let Some((q, sig_q)) = quad {
        let (k_q, rms_q, qu0, qu1) = evaluate(q);
        if k_q >= 40 && sig_q <= 0.88 * sigma && k_q * 10 >= k_line * 9 {
            let probe = Slab {
                model: Model::Curve,
                n_deep,
                inliers: k_q,
                dip: 0.0,
                dip_err: 0.0,
                dip_top: 0.0,
                dip_bottom: 0.0,
                top_depth: 0.0,
                max_depth: 0.0,
                intercept: None,
                scatter: rms_q,
                toward_b: dir[0] > 0.0,
                tau,
                theta_ref,
                c,
                dir,
                nrm,
                q,
                u0: qu0,
                u1: qu1,
            };
            let (top, bottom) = (probe.dip_at(0.0), probe.dip_at(1.0));
            if (bottom - top).abs() >= 8.0 && top.min(bottom) >= 15.0 {
                chosen = (Model::Curve, q, k_q, rms_q, qu0, qu1);
            }
        }
    }
    let (model, q, inliers, scatter, u0, u1) = chosen;
    if inliers < 10 || u1 - u0 < 60.0 {
        return scattered;
    }
    let mut slab = Slab {
        model,
        n_deep,
        inliers,
        dip: 0.0,
        dip_err: 0.0,
        dip_top: 0.0,
        dip_bottom: 0.0,
        top_depth: 0.0,
        max_depth: 0.0,
        intercept: None,
        scatter,
        toward_b: true,
        tau,
        theta_ref,
        c,
        dir,
        nrm,
        q,
        u0,
        u1,
    };
    // Depth range of the inliers.
    let (mut top, mut bot, mut suu, mut su, mut k) = (f32::MAX, f32::MIN, 0.0f32, 0.0f32, 0.0f32);
    for (dq, &u) in deep.iter().zip(&us) {
        if slab.distance(dq.along, dq.depth) <= tau {
            top = top.min(dq.depth);
            bot = bot.max(dq.depth);
            su += u;
            suu += u * u;
            k += 1.0;
        }
    }
    let (a0, d0) = slab.at(0.0);
    let (a1, d1) = slab.at(1.0);
    if bot - top < 80.0 || d1 - d0 < 50.0 {
        return scattered;
    }
    slab.top_depth = top;
    slab.max_depth = bot;
    let p0 = to_plane(a0, d0, theta_ref);
    let p1 = to_plane(a1, d1, theta_ref);
    let mid = [(p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5];
    slab.dip = dip_at(mid, [p1[0] - p0[0], p1[1] - p0[1]]);
    slab.dip_top = slab.dip_at(0.0);
    slab.dip_bottom = slab.dip_at(1.0);
    slab.toward_b = a1 > a0;
    let spread = (suu - su * su / k.max(1.0)).max(1.0);
    slab.dip_err = (scatter / spread.sqrt()).to_degrees() * if model == Model::Curve { 1.5 } else { 1.0 };
    slab.intercept = slab.surface_hit().map(|(along, _)| along);
    SlabResult::Fit(Box::new(slab))
}

/// IRLS fit of v = q0 + q1·u + q2·u² in the line's frame. Returns the coefficients and
/// the robust scale of the residuals.
fn fit_quadratic(us: &[f32], pts: &[[f32; 2]], c: [f32; 2], dir: [f32; 2], sigma0: f32) -> Option<([f32; 3], f32)> {
    let nrm = [-dir[1], dir[0]];
    let vs: Vec<f32> = pts.iter().map(|p| (p[0] - c[0]) * nrm[0] + (p[1] - c[1]) * nrm[1]).collect();
    let s = 1.0 / 500.0; // scale u for conditioning
    let mut q = [0.0f64; 3];
    let mut sigma = sigma0;
    let mut res = vec![0.0f32; us.len()];
    let mut scratch = Vec::with_capacity(us.len());
    for _ in 0..8 {
        for ((r, &u), &v) in res.iter_mut().zip(us).zip(&vs) {
            let x = (u * s) as f64;
            *r = v - (q[0] + q[1] * x + q[2] * x * x) as f32;
        }
        sigma = robust_sigma(&res, &mut scratch, 6.0 * sigma.max(5.0)).max(4.0);
        let cut = 4.685 * sigma;
        let mut m = [[0.0f64; 3]; 3];
        let mut rhs = [0.0f64; 3];
        for ((&r, &u), &v) in res.iter().zip(us).zip(&vs) {
            let w = biweight(r, cut) as f64;
            if w == 0.0 {
                continue;
            }
            let x = (u * s) as f64;
            let b = [1.0, x, x * x];
            for i in 0..3 {
                for j in 0..3 {
                    m[i][j] += w * b[i] * b[j];
                }
                rhs[i] += w * b[i] * v as f64;
            }
        }
        q = solve3(m, rhs)?;
    }
    for ((r, &u), &v) in res.iter_mut().zip(us).zip(&vs) {
        let x = (u * s) as f64;
        *r = v - (q[0] + q[1] * x + q[2] * x * x) as f32;
    }
    let sigma = robust_sigma(&res, &mut scratch, 6.0 * sigma.max(5.0)).max(4.0);
    // Back to unscaled u. Reject curvature radii under ~250 km (not a slab shape).
    let qq = [q[0] as f32, (q[1] * s as f64) as f32, (q[2] * (s * s) as f64) as f32];
    if (2.0 * qq[2]).abs() > 1.0 / 250.0 {
        return None;
    }
    Some((qq, sigma))
}

fn solve3(m: [[f64; 3]; 3], r: [f64; 3]) -> Option<[f64; 3]> {
    let det = |a: [[f64; 3]; 3]| {
        a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0])
            + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0])
    };
    let d = det(m);
    if d.abs() < 1e-12 {
        return None;
    }
    let mut out = [0.0; 3];
    for (k, o) in out.iter_mut().enumerate() {
        let mut a = m;
        for i in 0..3 {
            a[i][k] = r[i];
        }
        *o = det(a) / d;
    }
    Some(out)
}

// ---------- slice through a quake ----------

/// Strike of the seismicity around quake `i` and a profile across it.
#[derive(Clone, Copy, Debug)]
pub struct Auto {
    pub profile: Profile,
    /// Strike (bearing of the long axis of nearby epicentres), degrees 0..180.
    pub strike: f32,
    /// How elongated the epicentre cloud is: 1 − λ_minor/λ_major (0 round, 1 a line).
    pub elongation: f32,
    /// Quakes used for the estimate.
    pub neighbours: usize,
}

/// A profile centred on quake `i`, cut perpendicular to the local trend.
///
/// The trend is the major axis (PCA) of the epicentres within `radius` km. The cut is
/// oriented so depth increases from A to B (the correlation of depth with distance
/// along the cut), so A sits on the ocean side of a subduction zone.
pub fn auto_profile(world: &World, i: usize, radius: f32, half_width: f32) -> Auto {
    let u = units();
    let p0 = u[i];
    let q0 = world.quakes[i];
    let east = if p0[2].abs() > 0.9999 { [0.0, 1.0, 0.0] } else { v3::norm(v3::cross([0.0, 0.0, 1.0], p0)) };
    let north = v3::cross(p0, east);
    let cosr = (radius / R_EARTH).cos();
    let mut pts: Vec<([f32; 2], f32)> = Vec::new();
    for (p, q) in u.iter().zip(&world.quakes) {
        let c = v3::dot(*p, p0);
        if c < cosr {
            continue;
        }
        // Azimuthal equidistant coordinates, km.
        let ang = v3::angle(*p, p0);
        let (e, nn) = (v3::dot(*p, east), v3::dot(*p, north));
        let h = (e * e + nn * nn).sqrt().max(1e-9);
        pts.push(([e / h * ang * R_EARTH, nn / h * ang * R_EARTH], q.depth));
    }
    let k = pts.len().max(1) as f32;
    let (mx, my) = pts.iter().fold((0.0, 0.0), |a, (p, _)| (a.0 + p[0] / k, a.1 + p[1] / k));
    let (mut xx, mut yy, mut xy) = (0.0f32, 0.0f32, 0.0f32);
    for (p, _) in &pts {
        let (dx, dy) = (p[0] - mx, p[1] - my);
        xx += dx * dx;
        yy += dy * dy;
        xy += dx * dy;
    }
    let ang = 0.5 * (2.0 * xy).atan2(xx - yy);
    let major = [ang.cos(), ang.sin()]; // (east, north)
    let tr = xx + yy;
    let det = xx * yy - xy * xy;
    let disc = ((tr * tr / 4.0 - det).max(0.0)).sqrt();
    let (l1, l2) = (tr / 2.0 + disc, (tr / 2.0 - disc).max(0.0));
    let elongation = if l1 > 0.0 { 1.0 - l2 / l1 } else { 0.0 };
    let mut across = [-major[1], major[0]];
    // Orient so that depth grows along the cut.
    let md = pts.iter().map(|(_, d)| d).sum::<f32>() / k;
    let cov: f32 = pts.iter().map(|(p, d)| (p[0] * across[0] + p[1] * across[1]) * (d - md)).sum();
    if cov < 0.0 {
        across = [-across[0], -across[1]];
    }
    let mut strike = major[0].atan2(major[1]).to_degrees();
    if strike < 0.0 {
        strike += 180.0;
    }
    if strike >= 180.0 {
        strike -= 180.0;
    }
    let t = v3::norm(v3::add(v3::scale(east, across[0]), v3::scale(north, across[1])));
    let half = (350.0 + q0.depth).clamp(450.0, 950.0) / R_EARTH;
    let a = v3::add(v3::scale(p0, half.cos()), v3::scale(t, -half.sin()));
    let b = v3::add(v3::scale(p0, half.cos()), v3::scale(t, half.sin()));
    let (la, lo) = v3::to_latlon(a);
    let (lb, lob) = v3::to_latlon(b);
    Auto { profile: Profile { a: [la, lo], b: [lb, lob], half_width }, strike, elongation, neighbours: pts.len() }
}

// ---------- moving a profile ----------

fn rotate(p: V, axis: V, ang: f32) -> V {
    // Rodrigues.
    let (s, c) = ang.sin_cos();
    let k = axis;
    let kxp = v3::cross(k, p);
    let kdp = v3::dot(k, p);
    v3::norm([0, 1, 2].map(|i| p[i] * c + kxp[i] * s + k[i] * kdp * (1.0 - c)))
}

fn latlon(p: V) -> [f32; 2] {
    let (la, lo) = v3::to_latlon(p);
    [la, lo]
}

/// Slide a profile sideways by `km` (positive = to the left of A→B), keeping its shape.
pub fn shift(p: &Profile, km: f32) -> Profile {
    let g = Geom::new(p);
    let mid = g.length / 2.0;
    let axis = g.tangent(mid);
    // Rotating about the mid tangent moves the midpoint towards the pole n.
    let ang = -km / R_EARTH;
    let a = rotate(v3::from_latlon(p.a[0], p.a[1]), axis, ang);
    let b = rotate(v3::from_latlon(p.b[0], p.b[1]), axis, ang);
    Profile { a: latlon(a), b: latlon(b), ..*p }
}

/// Move a profile rigidly by the rotation that carries `from` to `to` (lat, lon).
pub fn carry(p: &Profile, from: [f32; 2], to: [f32; 2]) -> Profile {
    let f = v3::from_latlon(from[0], from[1]);
    let t = v3::from_latlon(to[0], to[1]);
    let ax = v3::cross(f, t);
    if v3::len(ax) < 1e-7 {
        return *p;
    }
    let ang = v3::angle(f, t);
    let ax = v3::norm(ax);
    let a = rotate(v3::from_latlon(p.a[0], p.a[1]), ax, ang);
    let b = rotate(v3::from_latlon(p.b[0], p.b[1]), ax, ang);
    Profile { a: latlon(a), b: latlon(b), ..*p }
}

/// Where the profile crosses polylines (lat/lon vertices): along-track km of each crossing.
pub fn crossings(g: &Geom, lines: &[Vec<V>], out: &mut Vec<f32>) {
    out.clear();
    for l in lines {
        for w in l.windows(2) {
            let (p, q) = (w[0], w[1]);
            let (sp, sq) = (v3::dot(p, g.n), v3::dot(q, g.n));
            if (sp > 0.0) == (sq > 0.0) || v3::dot(p, q) < 0.995 {
                continue;
            }
            let t = sp / (sp - sq);
            let x = v3::norm([0, 1, 2].map(|k| p[k] + (q[k] - p[k]) * t));
            let along = v3::dot(x, g.e2).atan2(v3::dot(x, g.a)) * R_EARTH;
            if (0.0..=g.length).contains(&along) {
                out.push(along);
            }
        }
    }
    out.sort_by(|a, b| a.total_cmp(b));
}

/// Plate boundaries as unit-vector polylines, built once.
pub fn plate_lines() -> &'static [Vec<V>] {
    static P: OnceLock<Vec<Vec<V>>> = OnceLock::new();
    P.get_or_init(|| world().plates.iter().map(|l| l.iter().map(|p| v3::from_latlon(p[0], p[1])).collect()).collect())
}
