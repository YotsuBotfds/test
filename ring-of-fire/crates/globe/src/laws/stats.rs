//! The statistics behind the three laws, written as plain functions on slices so
//! the tests can feed them synthetic catalogues.
//!
//! - Gutenberg–Richter: binned magnitude histogram, the Aki (1965) maximum-likelihood
//!   b-value with Utsu's half-bin correction, the Shi & Bolt (1982) standard error,
//!   and three completeness estimators (maximum curvature, goodness of fit, b-value
//!   stability).
//! - Omori–Utsu: aftershock selection by a space–time window, and a maximum-likelihood
//!   fit (Ogata 1983) of n(t) = μ + K/(c+t)^p plus secondary sequences, with standard
//!   errors from the observed information matrix and a residual Kolmogorov–Smirnov test.
//! - Energy: the radiated-energy budget (log E = 1.5 M + 4.8) and its shares.

use crate::data::{Quake, World};

/// Catalogue magnitudes are reported to 0.1.
pub const DM: f64 = 0.1;
/// Number of 0.1 bins from M0.0 to M10.0.
pub const NB: usize = 101;
/// Smallest sample a b-value is reported for.
pub const MIN_B: u32 = 50;

#[inline]
pub fn bin(m: f32) -> usize {
    ((m as f64 / DM).round().max(0.0) as usize).min(NB - 1)
}

#[inline]
pub fn mag(k: usize) -> f64 {
    k as f64 * DM
}

// ---------------------------------------------------------------- Gutenberg–Richter

/// Counts per 0.1 magnitude bin.
#[derive(Clone)]
pub struct Hist {
    pub n: [u32; NB],
}

#[derive(Clone, Copy, Debug)]
pub struct BValue {
    /// Bin index of the cutoff, and the cutoff magnitude itself.
    pub kc: usize,
    pub mc: f64,
    /// Quakes at or above the cutoff.
    pub n: u32,
    pub b: f64,
    /// Shi & Bolt (1982) standard error.
    pub sigma: f64,
    /// Aki (1965) error b / sqrt(n), for comparison.
    pub sigma_aki: f64,
    /// log10 N(≥M) = a − b M, anchored so the line passes through N(≥Mc).
    pub a: f64,
    pub mean: f64,
}

impl BValue {
    /// Expected number of quakes at or above magnitude `m` (binned).
    pub fn n_at_least(&self, m: f64) -> f64 {
        10f64.powf(self.a - self.b * m)
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Completeness {
    /// Maximum curvature: the most populated bin (Wiemer & Wyss 2000).
    pub maxc: usize,
    /// Goodness of fit: first cutoff whose GR line explains ≥ 95% (else ≥ 90%) of the
    /// cumulative counts, with the score and the level reached.
    pub gft: Option<(usize, f64, u8)>,
    /// Best goodness-of-fit score anywhere, for the notes.
    pub gft_best: (usize, f64),
    /// b-value stability (Cao & Gao 2002, as modified by Woessner & Wiemer 2005).
    pub mbs: Option<usize>,
    /// The cutoff used: the most conservative (largest) of MAXC + 0.2, GFT and MBS.
    pub chosen: usize,
}

impl Hist {
    pub fn new<I: IntoIterator<Item = f32>>(mags: I) -> Self {
        let mut n = [0u32; NB];
        for m in mags {
            n[bin(m)] += 1;
        }
        Hist { n }
    }

    pub fn total(&self) -> u32 {
        self.n.iter().sum()
    }

    /// N(≥ bin k).
    pub fn cum(&self, k: usize) -> u32 {
        self.n[k.min(NB)..].iter().sum()
    }

    pub fn lo(&self) -> Option<usize> {
        self.n.iter().position(|&c| c > 0)
    }

    pub fn hi(&self) -> Option<usize> {
        self.n.iter().rposition(|&c| c > 0)
    }

    /// Aki–Utsu maximum-likelihood b-value for magnitudes ≥ mag(kc).
    pub fn b_value(&self, kc: usize) -> Option<BValue> {
        let hi = self.hi()?;
        if kc > hi {
            return None;
        }
        let (mut n, mut s) = (0f64, 0f64);
        for k in kc..=hi {
            n += self.n[k] as f64;
            s += self.n[k] as f64 * mag(k);
        }
        if n < 2.0 {
            return None;
        }
        let mean = s / n;
        let mc = mag(kc);
        let denom = mean - (mc - DM / 2.0);
        if denom <= 0.0 {
            return None;
        }
        let b = std::f64::consts::LOG10_E / denom;
        let ss: f64 = (kc..=hi).map(|k| self.n[k] as f64 * (mag(k) - mean).powi(2)).sum();
        let sigma = 2.30 * b * b * (ss / (n * (n - 1.0))).sqrt();
        Some(BValue { kc, mc, n: n as u32, b, sigma, sigma_aki: b / n.sqrt(), a: n.log10() + b * mc, mean })
    }

    /// b-value at every cutoff that still has at least `min_n` quakes.
    pub fn b_curve(&self, min_n: u32) -> Vec<BValue> {
        let Some(lo) = self.lo() else { return Vec::new() };
        (lo..NB).map_while(|k| self.b_value(k).filter(|b| b.n >= min_n)).collect()
    }

    /// Most populated bin (first one on ties).
    pub fn maxc(&self) -> Option<usize> {
        let max = *self.n.iter().max()?;
        (max > 0).then(|| self.n.iter().position(|&c| c == max).unwrap())
    }

    /// Wiemer & Wyss (2000) goodness of fit, in percent: 100 − 100 Σ|Bᵢ − Sᵢ| / Σ Bᵢ over
    /// bins ≥ Mc, with Bᵢ and Sᵢ the observed and predicted cumulative counts.
    pub fn gft(&self, kc: usize) -> Option<f64> {
        let bv = self.b_value(kc)?;
        let hi = self.hi()?;
        let (mut num, mut den) = (0.0, 0.0);
        let mut cum = 0f64;
        for k in (kc..=hi).rev() {
            cum += self.n[k] as f64;
            num += (cum - bv.n_at_least(mag(k))).abs();
            den += cum;
        }
        Some(100.0 - 100.0 * num / den)
    }

    pub fn completeness(&self) -> Option<Completeness> {
        let maxc = self.maxc()?;
        let curve: Vec<(usize, BValue)> =
            (maxc..NB).map_while(|k| self.b_value(k).filter(|b| b.n >= MIN_B).map(|b| (k, b))).collect();
        let scores: Vec<(usize, f64)> = curve.iter().filter_map(|&(k, _)| self.gft(k).map(|r| (k, r))).collect();
        let first = |lvl: f64| scores.iter().find(|s| s.1 >= lvl).copied();
        let gft = first(95.0).map(|(k, r)| (k, r, 95)).or_else(|| first(90.0).map(|(k, r)| (k, r, 90)));
        let gft_best = scores.iter().copied().fold((maxc, f64::NEG_INFINITY), |a, s| if s.1 > a.1 { s } else { a });
        // MBS: the first cutoff where the mean of b over the next 0.5 magnitude units
        // agrees with b itself to within its own standard error.
        let mbs = curve.windows(6).find(|w| {
            let bave = w.iter().map(|x| x.1.b).sum::<f64>() / 6.0;
            (bave - w[0].1.b).abs() <= w[0].1.sigma
        });
        let mbs = mbs.map(|w| w[0].0);
        let last = curve.last().map_or(maxc, |c| c.0);
        let mut chosen = (maxc + 2).min(last);
        for k in [gft.map(|g| g.0), mbs].into_iter().flatten() {
            chosen = chosen.max(k);
        }
        Some(Completeness { maxc, gft, gft_best, mbs, chosen })
    }
}

// ---------------------------------------------------------------- Omori–Utsu

pub const DAY_S: f64 = 86_400.0;
/// Longest aftershock window, days.
pub const MAX_DAYS: f64 = 180.0;
/// Fewest aftershocks above Mc a fit is attempted with.
pub const MIN_FIT: usize = 30;
/// Earliest time drawn on the rate chart, days (10^-2.5 d ≈ 4.6 min).
pub const T_MIN: f64 = 0.003_162_277_660_168_379_5;

pub fn distance_km(lat1: f32, lon1: f32, lat2: f32, lon2: f32) -> f64 {
    let (p1, p2) = ((lat1 as f64).to_radians(), (lat2 as f64).to_radians());
    let dp = p2 - p1;
    let dl = ((lon2 - lon1) as f64).to_radians();
    let h = (dp / 2.0).sin().powi(2) + p1.cos() * p2.cos() * (dl / 2.0).sin().powi(2);
    2.0 * 6371.0 * h.sqrt().min(1.0).asin()
}

/// Subsurface rupture length, km (Wells & Coppersmith 1994, all slip types:
/// log10 L = −2.44 + 0.59 M).
pub fn rupture_length_km(m: f64) -> f64 {
    10f64.powf(-2.44 + 0.59 * m)
}

/// Aftershock search radius around the epicentre: one rupture length, so the zone
/// is covered wherever along the rupture the epicentre sits; at least 50 km, which
/// is a few times the location error of a global catalogue.
pub fn aftershock_radius_km(m: f64) -> f64 {
    rupture_length_km(m).max(50.0)
}

/// Aftershocks of one mainshock.
#[derive(Clone, Debug, Default)]
pub struct Sequence {
    pub main: usize,
    pub m0: f64,
    pub radius_km: f64,
    /// Window length, days after the mainshock.
    pub window: f64,
    /// A later quake at least as large inside the zone that ended the window early.
    pub cut_by: Option<usize>,
    /// The window was shortened by the end of the catalogue.
    pub at_end: bool,
    /// Magnitude cutoff for the rate fit.
    pub mc: f64,
    /// Every quake in the zone and window, any magnitude (time order).
    pub events: Vec<usize>,
    /// Days after the mainshock of events with M ≥ mc (sorted).
    pub times: Vec<f64>,
    pub largest: Option<usize>,
    /// A larger, earlier quake whose own zone and window contain this mainshock.
    pub parent: Option<usize>,
    /// Background rate, per day (median of 30-day counts away from the sequence).
    pub mu: f64,
    pub mu_windows: usize,
    /// Counts above mc within R/2, R and 2R over the same window.
    pub radius_check: [usize; 3],
    /// Large aftershocks given their own Omori term.
    pub secondary: Vec<usize>,
    pub sec_times: Vec<f64>,
}

pub fn sequence(q: &[Quake], main: usize, mc: f64) -> Sequence {
    let m = q[main];
    let m0 = m.mag as f64;
    let r = aftershock_radius_km(m0);
    let t0 = m.t as f64;
    let last = q.last().map_or(t0, |x| x.t as f64);
    let mut window = MAX_DAYS.min((last - t0) / DAY_S);
    let at_end = window < MAX_DAYS;
    let mut cut_by = None;
    let dist = |j: usize| distance_km(m.lat, m.lon, q[j].lat, q[j].lon);
    for (j, x) in q.iter().enumerate().skip(main + 1) {
        let dt = (x.t as f64 - t0) / DAY_S;
        if dt > window {
            break;
        }
        if x.mag >= m.mag && dist(j) <= r {
            window = dt;
            cut_by = Some(j);
            break;
        }
    }
    let kc = bin(mc as f32);
    let mut s = Sequence { main, m0, radius_km: r, window, cut_by, at_end: at_end && cut_by.is_none(), mc, ..Default::default() };
    for (j, x) in q.iter().enumerate().skip(main + 1) {
        let dt = (x.t as f64 - t0) / DAY_S;
        if dt > window || Some(j) == cut_by {
            break;
        }
        if dt <= 0.0 {
            continue;
        }
        let d = dist(j);
        let above = bin(x.mag) >= kc;
        if above {
            for (slot, f) in s.radius_check.iter_mut().zip([0.5, 1.0, 2.0]) {
                if d <= r * f {
                    *slot += 1;
                }
            }
        }
        if d <= r {
            s.events.push(j);
            if above {
                s.times.push(dt);
            }
        }
    }
    s.largest = s.events.iter().copied().max_by(|&a, &b| q[a].mag.total_cmp(&q[b].mag).then(q[b].t.cmp(&q[a].t)));
    let floor = (m0 - 1.5).max(7.0) as f32;
    let mut sec: Vec<usize> = s
        .events
        .iter()
        .copied()
        .filter(|&j| q[j].mag >= floor - 1e-4 && (q[j].t as f64 - t0) / DAY_S >= 1.0)
        .collect();
    sec.sort_by(|&a, &b| q[b].mag.total_cmp(&q[a].mag));
    sec.truncate(3);
    sec.sort_unstable();
    s.sec_times = sec.iter().map(|&j| (q[j].t as f64 - t0) / DAY_S).collect();
    s.secondary = sec;
    // Is this quake itself inside the zone and window of a bigger, earlier one?
    s.parent = (0..main)
        .rev()
        .take_while(|&i| (t0 - q[i].t as f64) / DAY_S <= MAX_DAYS)
        .filter(|&i| q[i].mag > m.mag && distance_km(q[i].lat, q[i].lon, m.lat, m.lon) <= aftershock_radius_km(q[i].mag as f64))
        .max_by(|&a, &b| q[a].mag.total_cmp(&q[b].mag));
    // Background: median count in 30-day windows that avoid the sequence (before the
    // last 30 days, or more than a year after), within the same zone.
    let w = 30.0 * DAY_S;
    let (before, after) = (t0 - w, t0 + 365.0 * DAY_S);
    let nwin = ((last + 1.0) / w).floor() as usize;
    let mut counts: Vec<u32> = Vec::new();
    let mut ok = vec![false; nwin];
    for (k, slot) in ok.iter_mut().enumerate() {
        let (a, b) = (k as f64 * w, (k + 1) as f64 * w);
        *slot = b <= before || a >= after;
    }
    let mut c = vec![0u32; nwin];
    for x in q {
        let k = (x.t as f64 / w) as usize;
        if k < nwin && ok[k] && bin(x.mag) >= kc && distance_km(m.lat, m.lon, x.lat, x.lon) <= r {
            c[k] += 1;
        }
    }
    for (k, &v) in c.iter().enumerate() {
        if ok[k] {
            counts.push(v);
        }
    }
    s.mu_windows = counts.len();
    if !counts.is_empty() {
        counts.sort_unstable();
        let n = counts.len();
        s.mu = (counts[(n - 1) / 2] + counts[n / 2]) as f64 / 2.0 / 30.0;
    }
    s
}

/// ∫ₐᵇ (c + s)^−p ds.
#[inline]
pub fn omori_integral(c: f64, p: f64, a: f64, b: f64) -> f64 {
    if b <= a {
        return 0.0;
    }
    if (p - 1.0).abs() < 1e-7 {
        ((c + b) / (c + a)).ln()
    } else {
        ((c + b).powf(1.0 - p) - (c + a).powf(1.0 - p)) / (1.0 - p)
    }
}

#[derive(Clone, Debug, Default)]
pub struct OmoriFit {
    pub k: f64,
    pub c: f64,
    pub p: f64,
    /// Productivity of each secondary sequence.
    pub kj: Vec<f64>,
    pub sk: f64,
    pub sc: f64,
    pub sp: f64,
    pub skj: Vec<f64>,
    pub nll: f64,
    pub aic: f64,
    pub n: usize,
    /// Kolmogorov–Smirnov test of the transformed times against uniform.
    pub ks_d: f64,
    pub ks_p: f64,
}

impl OmoriFit {
    /// Model rate at `t` days, per day.
    pub fn rate(&self, t: f64, sec: &[f64], mu: f64) -> f64 {
        let mut r = mu + self.k * (self.c + t).powf(-self.p);
        for (&kj, &tj) in self.kj.iter().zip(sec) {
            if t > tj {
                r += kj * (self.c + t - tj).powf(-self.p);
            }
        }
        r
    }

    /// Expected number of events between `a` and `b` days.
    pub fn expected(&self, a: f64, b: f64, sec: &[f64], mu: f64) -> f64 {
        let mut e = mu * (b - a) + self.k * omori_integral(self.c, self.p, a, b);
        for (&kj, &tj) in self.kj.iter().zip(sec) {
            if b > tj {
                e += kj * omori_integral(self.c, self.p, (a - tj).max(0.0), b - tj);
            }
        }
        e
    }
}

/// Negative log-likelihood of the Omori–Utsu point process with fixed background `mu`
/// and secondary sequences at `sec`, in parameters θ = (ln K, ln c, p, ln K₁, …).
pub fn omori_nll(th: &[f64], times: &[f64], t_end: f64, sec: &[f64], mu: f64) -> f64 {
    let (k, c, p) = (th[0].exp(), th[1].exp(), th[2]);
    if !(0.2..=3.0).contains(&p) || !(1e-6..=20.0).contains(&c) || !k.is_finite() {
        return 1e300;
    }
    let kj: [f64; 3] = std::array::from_fn(|j| th.get(3 + j).map_or(0.0, |v| v.exp()));
    let mut s = 0.0;
    for &t in times {
        let mut lam = mu + k * (-p * (c + t).ln()).exp();
        for (j, &tj) in sec.iter().enumerate() {
            if t > tj {
                lam += kj[j] * (-p * (c + t - tj).ln()).exp();
            }
        }
        s += lam.ln();
    }
    let mut integ = mu * t_end + k * omori_integral(c, p, 0.0, t_end);
    for (j, &tj) in sec.iter().enumerate() {
        integ += kj[j] * omori_integral(c, p, 0.0, t_end - tj);
    }
    let v = integ - s;
    if v.is_finite() {
        v
    } else {
        1e300
    }
}

/// Nelder–Mead simplex minimiser (standard coefficients), with one restart.
pub fn nelder_mead(f: &mut dyn FnMut(&[f64]) -> f64, x0: &[f64], step: &[f64], iters: usize) -> (Vec<f64>, f64) {
    let mut best = (x0.to_vec(), f(x0));
    for _ in 0..2 {
        best = simplex(f, &best.0, step, iters);
    }
    best
}

fn simplex(f: &mut dyn FnMut(&[f64]) -> f64, x0: &[f64], step: &[f64], iters: usize) -> (Vec<f64>, f64) {
    let n = x0.len();
    let mut pts: Vec<Vec<f64>> = vec![x0.to_vec()];
    for i in 0..n {
        let mut y = x0.to_vec();
        y[i] += step[i];
        pts.push(y);
    }
    let mut vals: Vec<f64> = pts.iter().map(|p| f(p)).collect();
    let mut order: Vec<usize> = (0..=n).collect();
    for _ in 0..iters {
        order.sort_by(|&a, &b| vals[a].total_cmp(&vals[b]));
        let (lo, hi, nh) = (order[0], order[n], order[n - 1]);
        if (vals[hi] - vals[lo]).abs() <= 1e-10 * (1.0 + vals[lo].abs()) {
            break;
        }
        let cen: Vec<f64> = (0..n).map(|i| order[..n].iter().map(|&k| pts[k][i]).sum::<f64>() / n as f64).collect();
        let at = |t: f64| -> Vec<f64> { (0..n).map(|i| cen[i] + t * (pts[hi][i] - cen[i])).collect() };
        let xr = at(-1.0);
        let fr = f(&xr);
        if fr < vals[lo] {
            let xe = at(-2.0);
            let fe = f(&xe);
            if fe < fr {
                pts[hi] = xe;
                vals[hi] = fe;
            } else {
                pts[hi] = xr;
                vals[hi] = fr;
            }
        } else if fr < vals[nh] {
            pts[hi] = xr;
            vals[hi] = fr;
        } else {
            let xc = if fr < vals[hi] { at(-0.5) } else { at(0.5) };
            let fc = f(&xc);
            if fc < vals[hi].min(fr) {
                pts[hi] = xc;
                vals[hi] = fc;
            } else {
                let x_lo = pts[lo].clone();
                for k in 0..=n {
                    if k != lo {
                        for i in 0..n {
                            pts[k][i] = x_lo[i] + 0.5 * (pts[k][i] - x_lo[i]);
                        }
                        vals[k] = f(&pts[k]);
                    }
                }
            }
        }
    }
    let lo = (0..=n).min_by(|&a, &b| vals[a].total_cmp(&vals[b])).unwrap();
    (pts[lo].clone(), vals[lo])
}

/// Inverse of a small symmetric matrix by Gauss–Jordan elimination with partial pivoting.
pub fn invert(a: &[Vec<f64>]) -> Option<Vec<Vec<f64>>> {
    let n = a.len();
    let mut m: Vec<Vec<f64>> = a.to_vec();
    let mut inv: Vec<Vec<f64>> = (0..n).map(|i| (0..n).map(|j| if i == j { 1.0 } else { 0.0 }).collect()).collect();
    for col in 0..n {
        let piv = (col..n).max_by(|&x, &y| m[x][col].abs().total_cmp(&m[y][col].abs()))?;
        if m[piv][col].abs() < 1e-300 {
            return None;
        }
        m.swap(col, piv);
        inv.swap(col, piv);
        let d = m[col][col];
        for j in 0..n {
            m[col][j] /= d;
            inv[col][j] /= d;
        }
        for r in 0..n {
            if r != col {
                let f = m[r][col];
                if f != 0.0 {
                    for j in 0..n {
                        m[r][j] -= f * m[col][j];
                        inv[r][j] -= f * inv[col][j];
                    }
                }
            }
        }
    }
    Some(inv)
}

/// Kolmogorov distribution tail Q(λ) = 2 Σ (−1)^(j−1) exp(−2 j² λ²).
fn kolmogorov_q(lambda: f64) -> f64 {
    if lambda < 0.2 {
        return 1.0;
    }
    let mut s = 0.0;
    for j in 1..=100 {
        let term = 2.0 * if j % 2 == 1 { 1.0 } else { -1.0 } * (-2.0 * (j * j) as f64 * lambda * lambda).exp();
        s += term;
        if term.abs() < 1e-12 {
            break;
        }
    }
    s.clamp(0.0, 1.0)
}

/// Maximum-likelihood Omori–Utsu fit on event times (days, sorted, all in (0, t_end]).
/// `sec` are the start times of secondary sequences, each with its own K and the
/// shared c and p. Returns None when there are too few events.
pub fn fit_omori(times: &[f64], t_end: f64, sec: &[f64], mu: f64) -> Option<OmoriFit> {
    let n = times.len();
    if n < 8 || t_end <= 0.0 {
        return None;
    }
    let sum_ln = |c: f64| times.iter().map(|&t| (c + t).ln()).sum::<f64>();
    // Coarse profile-likelihood grid for the single law (K at its conditional optimum).
    let mut start = (f64::INFINITY, 0.0, 0.0, 0.0);
    for i in 0..=22 {
        let c = 10f64.powf(-4.0 + i as f64 * 0.2);
        let sl = sum_ln(c);
        for j in 0..=30 {
            let p = 0.5 + j as f64 * 0.05;
            let k = n as f64 / omori_integral(c, p, 0.0, t_end);
            let v = k * omori_integral(c, p, 0.0, t_end) - n as f64 * k.ln() + p * sl;
            if v < start.0 {
                start = (v, k, c, p);
            }
        }
    }
    let x0 = [start.1.ln(), start.2.ln(), start.3];
    let (x1, v1) = nelder_mead(&mut |th| omori_nll(th, times, t_end, &[], mu), &x0, &[0.3, 0.5, 0.08], 3000);
    let (theta, nll) = if sec.is_empty() {
        (x1, v1)
    } else {
        let mut x = x1.clone();
        for &tj in sec {
            // Seed each secondary with the share of events in its first ten days.
            let early = times.iter().filter(|&&t| t > tj && t <= tj + 10.0).count().max(1) as f64;
            let base = x1[0].exp() * omori_integral(x1[1].exp(), x1[2], tj, tj + 10.0);
            let extra = (early - base).max(early * 0.2);
            x.push((extra / omori_integral(x1[1].exp(), x1[2], 0.0, 10.0)).max(1e-3).ln());
        }
        let step: Vec<f64> = (0..x.len()).map(|i| if i == 2 { 0.08 } else { 0.4 }).collect();
        let (xf, v) = nelder_mead(&mut |th| omori_nll(th, times, t_end, sec, mu), &x, &step, 6000);
        (xf, v)
    };
    let d = theta.len();
    // Observed information: numerical Hessian of the NLL in θ.
    let h = 1e-3;
    let f = |x: &[f64]| omori_nll(x, times, t_end, sec, mu);
    let mut hess = vec![vec![0.0; d]; d];
    let f0 = f(&theta);
    for i in 0..d {
        for j in i..d {
            let e = |di: f64, dj: f64| {
                let mut y = theta.clone();
                y[i] += di;
                y[j] += dj;
                f(&y)
            };
            let v = if i == j {
                (e(h, 0.0) - 2.0 * f0 + e(-h, 0.0)) / (h * h)
            } else {
                (e(h, h) - e(h, -h) - e(-h, h) + e(-h, -h)) / (4.0 * h * h)
            };
            hess[i][j] = v;
            hess[j][i] = v;
        }
    }
    let cov = invert(&hess);
    let sd = |i: usize| -> f64 {
        cov.as_ref().map_or(f64::NAN, |c| if c[i][i] > 0.0 { c[i][i].sqrt() } else { f64::NAN })
    };
    let (k, c, p) = (theta[0].exp(), theta[1].exp(), theta[2]);
    let kj: Vec<f64> = theta[3..].iter().map(|v| v.exp()).collect();
    let skj: Vec<f64> = (3..d).map(|i| kj[i - 3] * sd(i)).collect();
    let mut fit = OmoriFit {
        k,
        c,
        p,
        sk: k * sd(0),
        sc: c * sd(1),
        sp: sd(2),
        kj,
        skj,
        nll,
        aic: 2.0 * nll + 2.0 * d as f64,
        n,
        ks_d: 0.0,
        ks_p: 1.0,
    };
    // Residual analysis (Ogata 1988): under the model the transformed times
    // Λ(tᵢ)/Λ(T) are uniform on [0, 1].
    let total = fit.expected(0.0, t_end, sec, mu);
    let mut dmax = 0f64;
    for (i, &t) in times.iter().enumerate() {
        let u = fit.expected(0.0, t, sec, mu) / total;
        dmax = dmax.max((i + 1) as f64 / n as f64 - u).max(u - i as f64 / n as f64);
    }
    let sn = (n as f64).sqrt();
    fit.ks_d = dmax;
    fit.ks_p = kolmogorov_q((sn + 0.12 + 0.11 / sn) * dmax);
    Some(fit)
}

/// Log-spaced rate bins: edges from T_MIN, `per_decade` per decade, last edge at t_end.
pub fn log_bins(t_end: f64, per_decade: usize) -> Vec<f64> {
    let mut e = vec![T_MIN];
    let step = 1.0 / per_decade as f64;
    let mut k = 1;
    loop {
        let v = T_MIN * 10f64.powf(k as f64 * step);
        if v >= t_end * 0.999 {
            break;
        }
        e.push(v);
        k += 1;
    }
    if t_end > T_MIN {
        // Merge a sliver of a last bin into its neighbour.
        if e.len() > 1 && (t_end / e[e.len() - 1]).log10() < 0.4 * step {
            e.pop();
        }
        e.push(t_end);
    }
    e
}

/// Gehrels (1986) approximate 1σ Poisson limits for an observed count.
pub fn poisson_limits(n: u32) -> (f64, f64) {
    let x = n as f64;
    let up = x + 1.0 + (x + 0.75).sqrt();
    let lo = if n == 0 { 0.0 } else { x * (1.0 - 1.0 / (9.0 * x) - 1.0 / (3.0 * x.sqrt())).powi(3) };
    (lo, up)
}

// ---------------------------------------------------------------- energy

#[derive(Clone, Debug)]
pub struct EnergyClass {
    /// Lowest and highest magnitude present in the class.
    pub lo: f32,
    pub hi: f32,
    /// Whole-magnitude floor (4 for M4.5–4.9, ...).
    pub unit: i32,
    /// Members, largest energy first.
    pub members: Vec<usize>,
    pub energy: f64,
}

#[derive(Clone, Debug)]
pub struct Budget {
    pub energy: Vec<f64>,
    pub total: f64,
    /// Quake indices by energy, largest first (ties: earlier first).
    pub order: Vec<usize>,
    pub top1: f64,
    pub top10: f64,
    /// Share of the smallest 90% of quakes, how many that is, and the largest magnitude among them.
    pub small90: f64,
    pub small90_n: usize,
    pub small90_max: f32,
    pub classes: Vec<EnergyClass>,
}

impl Budget {
    pub fn new(q: &[Quake]) -> Self {
        let energy: Vec<f64> = q.iter().map(|x| World::energy(x.mag)).collect();
        let mut order: Vec<usize> = (0..q.len()).collect();
        order.sort_by(|&a, &b| energy[b].total_cmp(&energy[a]).then(a.cmp(&b)));
        // Sum smallest first, so the total does not lose the dust to rounding.
        let total: f64 = order.iter().rev().map(|&i| energy[i]).sum();
        let share = |it: &[usize]| it.iter().rev().map(|&i| energy[i]).sum::<f64>() / total;
        let n = q.len();
        let n90 = n * 9 / 10;
        let small = &order[n - n90..];
        let mut classes: Vec<EnergyClass> = Vec::new();
        for &i in &order {
            let unit = (bin(q[i].mag) / 10) as i32;
            match classes.iter_mut().find(|c| c.unit == unit) {
                Some(c) => {
                    c.members.push(i);
                    c.lo = c.lo.min(q[i].mag);
                    c.hi = c.hi.max(q[i].mag);
                }
                None => classes.push(EnergyClass { lo: q[i].mag, hi: q[i].mag, unit, members: vec![i], energy: 0.0 }),
            }
        }
        for c in &mut classes {
            c.energy = c.members.iter().rev().map(|&i| energy[i]).sum();
        }
        classes.sort_by_key(|c| std::cmp::Reverse(c.unit));
        Budget {
            top1: share(&order[..n.min(1)]),
            top10: share(&order[..n.min(10)]),
            small90: share(small),
            small90_n: n90,
            small90_max: small.first().map_or(0.0, |&i| q[i].mag),
            total,
            order,
            energy,
            classes,
        }
    }
}
