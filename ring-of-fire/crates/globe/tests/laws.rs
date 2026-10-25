//! Tests for instrument 06 Laws: the estimators recover known parameters from
//! synthetic catalogues, the treemap tiles its rectangle exactly, the energy shares
//! add up, and the instrument renders at any size.

use globe::laws::stats::{self, fit_omori, omori_integral, Budget, Hist};
use globe::laws::treemap::{squarify, EnergyMap, Rect};
use globe::laws::{Laws, SeqStatus, CHART_ENERGY, CHART_GR, CHART_OMORI};

/// xorshift64* -> uniform (0, 1).
struct Rng(u64);
impl Rng {
    fn next(&mut self) -> f64 {
        self.0 ^= self.0 >> 12;
        self.0 ^= self.0 << 25;
        self.0 ^= self.0 >> 27;
        let v = self.0.wrapping_mul(0x2545_f491_4f6c_dd1d);
        ((v >> 11) as f64 + 0.5) / (1u64 << 53) as f64
    }
}

/// Gutenberg–Richter magnitudes: continuous above `m_lo`, exponential with slope b,
/// reported to 0.1 like the catalogue.
fn gr_sample(n: usize, b: f64, m_lo: f64, seed: u64) -> Vec<f32> {
    let mut r = Rng(seed);
    let beta = b * std::f64::consts::LN_10;
    (0..n).map(|_| ((m_lo - r.next().ln() / beta) * 10.0).round() as f32 / 10.0).collect()
}

#[test]
fn b_value_recovers_a_synthetic_gutenberg_richter_sample() {
    for (b_true, seed) in [(1.0, 7), (0.8, 11), (1.3, 13)] {
        // Continuous magnitudes from Mc - ΔM/2, so binned values start at Mc = 4.5.
        let mags = gr_sample(20_000, b_true, 4.45, seed);
        let h = Hist::new(mags.iter().copied());
        let bv = h.b_value(45).unwrap();
        assert_eq!(bv.n, 20_000);
        assert!((bv.b - b_true).abs() < 3.0 * bv.sigma, "b = {} ± {} for true {b_true}", bv.b, bv.sigma);
        // Shi & Bolt and Aki agree for a pure exponential sample.
        assert!((bv.sigma / bv.sigma_aki - 1.0).abs() < 0.1);
        // The line passes through N(≥Mc) and predicts the tail.
        assert!((bv.n_at_least(4.5) - 20_000.0).abs() < 1e-6);
        let n6 = h.cum(60) as f64;
        assert!((bv.n_at_least(6.0) - n6).abs() < 4.0 * n6.sqrt() + 3.0);
    }
}

#[test]
fn completeness_finds_a_catalogue_that_is_incomplete_below_its_floor() {
    // True b = 1 from M3.5; detection probability is a cumulative normal centred on
    // M4.6 (sd 0.15), so the catalogue is complete only from about M4.9.
    let mut r = Rng(99);
    let raw = gr_sample(400_000, 1.0, 3.45, 5);
    let mags: Vec<f32> = raw
        .into_iter()
        .filter(|&m| {
            let z = (m as f64 - 4.6) / 0.15;
            let p = 0.5 * (1.0 + erf(z / std::f64::consts::SQRT_2));
            r.next() < p
        })
        .collect();
    let h = Hist::new(mags.iter().copied());
    let c = h.completeness().unwrap();
    let mc = stats::mag(c.chosen);
    assert!((4.7..=5.1).contains(&mc), "Mc {mc}, maxc {}", stats::mag(c.maxc));
    let bv = h.b_value(c.chosen).unwrap();
    assert!((bv.b - 1.0).abs() < 0.06, "b at Mc = {}", bv.b);
    // Fitting from the floor instead is biased low: the method matters.
    assert!(h.b_value(h.lo().unwrap()).unwrap().b < 0.8);
}

fn erf(x: f64) -> f64 {
    // Abramowitz & Stegun 7.1.26.
    let t = 1.0 / (1.0 + 0.327_591_1 * x.abs());
    let y = 1.0 - (((((1.061_405_429 * t - 1.453_152_027) * t) + 1.421_413_741) * t - 0.284_496_736) * t + 0.254_829_592) * t * (-x * x).exp();
    y.copysign(x)
}

/// Event times of an Omori–Utsu process K/(c+t)^p on (0, t_end], by inverting the
/// integrated rate at the arrival times of a unit-rate Poisson process.
fn omori_sample(k: f64, c: f64, p: f64, t_end: f64, rng: &mut Rng) -> Vec<f64> {
    let total = k * omori_integral(c, p, 0.0, t_end);
    let mut u = 0.0;
    let mut out = Vec::new();
    loop {
        u -= rng.next().ln();
        if u >= total {
            break;
        }
        let t = (c.powf(1.0 - p) + u * (1.0 - p) / k).powf(1.0 / (1.0 - p)) - c;
        out.push(t.clamp(1e-9, t_end));
    }
    out
}

#[test]
fn omori_fit_recovers_p_c_and_k_from_synthetic_aftershocks() {
    let (k, c, p, t_end) = (120.0, 0.06, 1.08, 180.0);
    let mut rng = Rng(2025);
    let times = omori_sample(k, c, p, t_end, &mut rng);
    assert!(times.len() > 500);
    let f = fit_omori(&times, t_end, &[], 0.0).unwrap();
    assert!((f.p - p).abs() < 3.0 * f.sp, "p = {} ± {}", f.p, f.sp);
    assert!((f.c - c).abs() < 3.0 * f.sc, "c = {} ± {}", f.c, f.sc);
    assert!((f.k - k).abs() < 3.0 * f.sk, "K = {} ± {}", f.k, f.sk);
    assert!(f.sp > 0.0 && f.sp < 0.1);
    // The true model passes the residual test.
    assert!(f.ks_p > 0.01, "KS p = {}", f.ks_p);
    // Expected count over the window matches the number of events (a property of the MLE).
    assert!((f.expected(0.0, t_end, &[], 0.0) - times.len() as f64).abs() < 1.0);
}

#[test]
fn omori_fit_separates_a_secondary_sequence() {
    let (k, c, p, t_end, tj, kj) = (100.0, 0.05, 1.05, 180.0, 50.0, 25.0);
    let mut rng = Rng(77);
    let mut times = omori_sample(k, c, p, t_end, &mut rng);
    times.extend(omori_sample(kj, c, p, t_end - tj, &mut rng).into_iter().map(|t| t + tj));
    times.sort_by(|a, b| a.total_cmp(b));
    let full = fit_omori(&times, t_end, &[tj], 0.0).unwrap();
    assert!((full.p - p).abs() < 3.0 * full.sp, "p = {} ± {}", full.p, full.sp);
    assert!((full.kj[0] - kj).abs() < 3.0 * full.skj[0], "Kj = {} ± {}", full.kj[0], full.skj[0]);
    // Ignoring the restart biases p low and fits much worse.
    let single = fit_omori(&times, t_end, &[], 0.0).unwrap();
    assert!(single.p < full.p);
    assert!(single.aic - full.aic > 20.0, "ΔAIC {}", single.aic - full.aic);
}

#[test]
fn squarified_tiles_cover_the_rectangle_exactly_without_overlap() {
    let mut r = Rng(3);
    let mut vals: Vec<f64> = (0..400).map(|_| (-r.next().ln()).powi(4) + 1e-4).collect();
    vals.sort_by(|a, b| b.total_cmp(a));
    let rect = Rect::new(10.0, 20.0, 970.0, 600.0);
    let tiles = squarify(&vals, rect);
    assert_eq!(tiles.len(), vals.len());
    let total: f64 = vals.iter().sum();
    let area: f64 = tiles.iter().map(Rect::area).sum();
    assert!((area - rect.area()).abs() < 1e-6 * rect.area());
    for (t, v) in tiles.iter().zip(&vals) {
        assert!((t.area() / rect.area() - v / total).abs() < 1e-9, "tile not proportional");
        assert!(t.x0 >= rect.x0 - 1e-9 && t.x1 <= rect.x1 + 1e-9 && t.y0 >= rect.y0 - 1e-9 && t.y1 <= rect.y1 + 1e-9);
    }
    for i in 0..tiles.len() {
        for j in i + 1..tiles.len() {
            assert!(tiles[i].overlap(&tiles[j]) < 1e-9, "tiles {i} and {j} overlap");
        }
    }
    // Squarified: no sliver worse than 1:12 for this distribution.
    let worst = tiles.iter().map(|t| (t.w() / t.h()).max(t.h() / t.w())).fold(0.0, f64::max);
    assert!(worst < 12.0, "worst aspect {worst}");
}

#[test]
fn energy_map_places_every_quake_once_and_tiles_do_not_overlap() {
    let w = globe::data::world();
    let b = Budget::new(&w.quakes);
    let depth: Vec<f32> = w.quakes.iter().map(|q| q.depth).collect();
    let rect = Rect::new(0.0, 0.0, 1200.0, 700.0);
    let m = EnergyMap::layout(&b, &depth, rect, 14.0, 2.0);
    let mut regions: Vec<Rect> = m.tiles.iter().map(|t| t.rect).collect();
    regions.extend(m.dust.iter().map(|d| d.rect));
    let mut placed = 0;
    for i in 0..w.quakes.len() {
        let (t, d) = (m.tile_of[i] != usize::MAX, m.dust_of[i] != usize::MAX);
        assert!(t ^ d, "quake {i} must be a tile or dust, not both or neither");
        placed += 1;
    }
    assert_eq!(placed, w.quakes.len());
    assert_eq!(m.tiles.len() + m.dust.iter().map(|d| d.members.len()).sum::<usize>(), w.quakes.len());
    for r in &regions {
        assert!(r.x0 >= -1e-9 && r.y0 >= -1e-9 && r.x1 <= 1200.0 + 1e-9 && r.y1 <= 700.0 + 1e-9);
    }
    // Sort by x so the overlap check stays fast.
    regions.sort_by(|a, b| a.x0.total_cmp(&b.x0));
    for i in 0..regions.len() {
        for j in i + 1..regions.len() {
            if regions[j].x0 >= regions[i].x1 {
                break;
            }
            assert!(regions[i].overlap(&regions[j]) < 1e-6, "regions overlap");
        }
    }
    // Within a class, tile areas stay proportional to energy.
    let c0 = &m.tiles[0];
    for t in m.tiles.iter().filter(|t| t.class == c0.class) {
        let ratio = (t.rect.area() / c0.rect.area()) / (b.energy[t.quake] / b.energy[c0.quake]);
        assert!((ratio - 1.0).abs() < 1e-6);
    }
    // Every tile drawn is big enough to see; the dust grid holds each member once.
    assert!(m.tiles.iter().all(|t| t.rect.area() >= 14.0 * 0.95));
    for d in &m.dust {
        assert!(d.cols * d.rows >= d.members.len());
        let (x, y) = d.cell(0);
        assert_eq!(d.member_at(x, y), Some(d.members[0]));
    }
}

#[test]
fn energy_shares_add_up() {
    let w = globe::data::world();
    let b = Budget::new(&w.quakes);
    let total: f64 = b.energy.iter().sum();
    assert!((total / b.total - 1.0).abs() < 1e-12);
    let classes: f64 = b.classes.iter().map(|c| c.energy / b.total).sum();
    assert!((classes - 1.0).abs() < 1e-12, "class shares sum to {classes}");
    assert_eq!(b.classes.iter().map(|c| c.members.len()).sum::<usize>(), w.quakes.len());
    // The smallest 90% and the largest 10% partition the catalogue.
    let n = w.quakes.len();
    let big: f64 = b.order[..n - b.small90_n].iter().map(|&i| b.energy[i]).sum::<f64>() / b.total;
    assert!((big + b.small90 - 1.0).abs() < 1e-12);
    assert!(b.top1 <= b.top10 && b.top10 <= 1.0);
    // This catalogue: the M8.8 released about two thirds of everything.
    assert!((0.6..0.7).contains(&b.top1), "top1 {}", b.top1);
    assert!(b.small90 < 0.02);
    // Energy is monotonic in magnitude, so the order is by magnitude.
    assert!(b.order.windows(2).all(|p| w.quakes[p[0]].mag >= w.quakes[p[1]].mag));
}

#[test]
fn the_catalogue_fits_match_the_published_figures() {
    let l = Laws::new();
    // Panel A: Mc and b for the whole catalogue.
    assert!((l.gr.fit.mc - 4.7).abs() < 1e-9);
    assert!((l.gr.fit.b - 1.149).abs() < 0.002 && l.gr.fit.sigma < 0.015);
    // Panel B: Kamchatka, two restarts, p near 1, Båth gap 1.0.
    let s = &l.om.seq;
    assert_eq!(s.main, l.default_main);
    assert!((s.radius_km - 565.0).abs() < 1.0);
    assert_eq!(s.secondary.len(), 2);
    let f = l.om.fit.as_ref().unwrap();
    assert!((f.p - 1.03).abs() < 0.02 && f.sp < 0.05, "p = {} ± {}", f.p, f.sp);
    let largest = l.world.quakes[s.largest.unwrap()].mag;
    assert!((s.m0 - largest as f64 - 1.0).abs() < 0.05);
    let single = l.om.single.as_ref().unwrap();
    assert!(single.aic - f.aic > 100.0);
}

#[test]
fn sequences_degrade_gracefully() {
    let mut l = Laws::new();
    let q = &l.world.quakes;
    let small = q.iter().position(|x| x.mag < 6.0).unwrap();
    assert_eq!(l.set_sequence(small), SeqStatus::NotLarge);
    assert_eq!(l.om.seq.main, l.default_main, "a small quake leaves the sequence alone");
    // Every M7+ quake either fits or reports too few aftershocks, and renders.
    l.resize(CHART_OMORI, 300, 260, 1.0);
    let mut fitted = 0;
    for (i, x) in q.iter().enumerate() {
        if x.mag >= 7.0 {
            let st = l.set_sequence(i);
            assert_ne!(st, SeqStatus::NotLarge);
            if st == SeqStatus::Fitted {
                fitted += 1;
                let f = l.om.fit.as_ref().unwrap();
                assert!(f.p.is_finite() && f.c > 0.0 && f.k > 0.0);
            } else {
                assert!(l.om.seq.times.len() < stats::MIN_FIT);
            }
            l.render(CHART_OMORI);
            assert!(!l.info(CHART_OMORI).contains("NaN"));
        }
    }
    assert!(fitted >= 5);
}

#[test]
fn renders_and_picks_at_any_size() {
    let mut l = Laws::new();
    for (w, h, k) in [(16, 16, 1.0), (390, 420, 2.0), (1300, 700, 1.0)] {
        for chart in [CHART_GR, CHART_OMORI, CHART_ENERGY] {
            l.resize(chart, w, h, k);
            l.render(chart);
            for (x, y) in [(-1.0, -1.0), (0.0, 0.0), (w as f32 / 2.0, h as f32 / 2.0), (w as f32 - 1.0, h as f32 - 1.0)] {
                l.hover(chart, x, y);
                l.render(chart);
            }
            let info = l.info(chart);
            assert!(info.starts_with('{') && info.ends_with('}'));
            assert_eq!(info.matches('{').count(), info.matches('}').count());
            assert!(!info.contains("NaN") && !info.contains("inf"));
        }
    }
    // The centre of the big tile is the M8.8.
    l.resize(CHART_ENERGY, 1000, 600, 1.0);
    l.render(CHART_ENERGY);
    let r = l.energy_rect(l.default_main).unwrap();
    let i = l.hover(CHART_ENERGY, ((r.x0 + r.x1) / 2.0) as f32, ((r.y0 + r.y1) / 2.0) as f32);
    assert_eq!(i as usize, l.default_main);
    // Every subset and cutoff can be fitted and drawn.
    for s in 0..4 {
        for mc in [None, Some(45), Some(52), Some(70)] {
            l.set_gr(s, mc);
            l.render(CHART_GR);
        }
    }
}
