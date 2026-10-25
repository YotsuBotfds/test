//! Instrument 04 Waves: the travel-time solver against standard tables and against
//! ray theory through the same model, plus the shadow zones and the renderers.
//!
//!   cargo test --release -p globe --test waves -- --nocapture   (prints the tables)

use globe::waves::model::{speed, Wave, R_CMB, R_EARTH, R_ICB};
use globe::waves::rays::Curves;
use globe::waves::section::{Listener, Section};
use globe::waves::solve::{grid, solve, Solution, Solver, F_P, F_PKIKP, F_PKP, F_S, PH_P, PH_PDIFF, PH_PKIKP, PH_PKP};
use std::sync::OnceLock;

/// First-arrival times for a surface source (iasp91 tables, rounded): phase, degrees, seconds.
const REFERENCE: [(&str, f64, f64); 5] = [("P", 30.0, 370.0), ("P", 60.0, 600.0), ("P", 90.0, 780.0), ("S", 30.0, 670.0), ("S", 60.0, 1090.0)];

fn surface_source() -> &'static (Solution, Curves) {
    static S: OnceLock<(Solution, Curves)> = OnceLock::new();
    S.get_or_init(|| (solve(0.0), Curves::new(0.0)))
}

#[test]
fn grid_solver_matches_the_reference_tables() {
    let (sol, curves) = surface_source();
    println!("phase  dist   solver    rays  iasp91   error");
    for &(ph, d, reference) in &REFERENCE {
        let field = if ph == "P" { F_P } else { F_S };
        let t = sol.surface(field, d).0;
        let ray = Curves::first(if ph == "P" { &curves.p } else { &curves.s }, d.to_radians()).unwrap();
        let err = (t - reference) / reference * 100.0;
        println!("{ph:>5} {d:5.0}° {t:7.1} s {ray:7.1} {reference:7.0} {err:+6.2}%");
        assert!(err.abs() < 2.0, "{ph} at {d}°: {t:.1} s vs {reference} s");
    }
}

#[test]
fn grid_solver_agrees_with_ray_theory() {
    // Same model, two methods: fast marching on the grid, and exact integrals along rays.
    let (sol, curves) = surface_source();
    let mut worst: f64 = 0.0;
    for d in (10..=95).step_by(5) {
        let d = d as f64;
        for (field, fam) in [(F_P, &curves.p), (F_S, &curves.s)] {
            let t = sol.surface(field, d).0;
            let r = Curves::first(fam, d.to_radians()).unwrap();
            worst = worst.max((t - r).abs());
        }
    }
    println!("worst P/S difference, 10-95°: {worst:.2} s");
    assert!(worst < 1.0, "worst difference {worst:.2} s");
    // Through the inner core (PKIKP), well past where it begins.
    for d in [125.0f64, 140.0, 155.0, 170.0] {
        let t = sol.surface(F_PKIKP, d).0;
        let r = Curves::first(&curves.pkikp, d.to_radians()).unwrap();
        println!("PKIKP {d}°: solver {t:.1} s, rays {r:.1} s");
        assert!((t - r).abs() < 1.0);
    }
    // PKP near the caustic, where it is strongest.
    for d in [146.0f64, 150.0] {
        let t = sol.surface(F_PKP, d).0;
        let r = Curves::first(&curves.pkp, d.to_radians()).unwrap();
        assert!((t - r).abs() < 1.0, "PKP {d}°: {t:.1} vs {r:.1}");
    }
}

#[test]
fn ray_theory_matches_the_reference_tables() {
    let (_, curves) = surface_source();
    for &(ph, d, reference) in &REFERENCE {
        let t = Curves::first(if ph == "P" { &curves.p } else { &curves.s }, d.to_radians()).unwrap();
        assert!(((t - reference) / reference).abs() < 0.02, "{ph} {d}: {t}");
    }
}

#[test]
fn the_core_casts_shadows() {
    let (sol, _) = surface_source();
    let i = sol.info;
    println!("{i:?}");
    // Direct P and S graze the core near 100 degrees; PKP comes back near 143; Lehmann's
    // PKIKP reaches into the shadow from about 115.
    assert!((97.0..102.0).contains(&i.p_shadow), "{}", i.p_shadow);
    assert!((97.0..102.0).contains(&i.s_shadow), "{}", i.s_shadow);
    assert!((141.0..147.0).contains(&i.pkp_min), "{}", i.pkp_min);
    assert!((110.0..121.0).contains(&i.pkikp_min), "{}", i.pkikp_min);
    // The ray density makes the shadows dark: compare with direct arrivals at 70 degrees.
    let lit_p = sol.surface(F_P, 70.0).1;
    let lit_s = sol.surface(F_S, 70.0).1;
    for d in [125.0, 150.0, 175.0] {
        assert!(sol.surface(F_P, d).1 < 0.02 * lit_p, "P at {d}");
        assert!(sol.surface(F_S, d).1 < 0.02 * lit_s, "S at {d}");
    }
    // Beyond the shadow, PKP near its caustic is strong again.
    assert!(sol.surface(F_PKP, 146.0).1 > 0.5 * lit_p);
    // No S anywhere in the core: the S field stops at the core-mantle boundary.
    let g = grid();
    assert_eq!(sol.fields[F_S].j0, g.j_cmb);
    assert!(speed(Wave::S, R_EARTH - (R_CMB + R_ICB) / 2.0, true) == 0.0);
}

#[test]
fn listeners_hear_the_right_phase() {
    let (sol, _) = surface_source();
    let i = sol.info;
    assert_eq!(sol.first_p(40.0).0, PH_P);
    assert_eq!(sol.first_p(i.p_shadow + 3.0).0, PH_PDIFF);
    assert_eq!(sol.first_p((i.pkikp_min + i.pkp_min) / 2.0).0, PH_PKIKP);
    assert_eq!(sol.first_p(160.0).0, PH_PKP);
    assert!(sol.first_s(i.s_shadow + 1.0).is_infinite());
    assert!(sol.first_s(i.s_shadow - 1.0).is_finite());
    // Times increase with distance within each phase.
    let mut last = 0.0;
    for d in (5..=95).step_by(5) {
        let t = sol.first_p(d as f64).1;
        assert!(t > last);
        last = t;
    }
}

#[test]
fn deeper_sources_arrive_sooner() {
    let (shallow, _) = surface_source();
    let deep = solve(600.0);
    let rays = Curves::new(600.0);
    for d in [30.0, 60.0, 90.0] {
        let (a, b) = (shallow.surface(F_P, d).0, deep.surface(F_P, d).0);
        let r = Curves::first(&rays.p, d.to_radians()).unwrap();
        println!("P at {d}°: surface source {a:.1} s, 600 km source {b:.1} s (rays {r:.1} s)");
        assert!(b < a - 30.0);
        assert!((b - r).abs() < 1.5);
    }
}

#[test]
fn stepwise_solve_matches_one_shot() {
    let mut s = Solver::new(35.0);
    let mut steps = 0;
    while !s.step() {
        steps += 1;
        assert!(steps < 20);
    }
    let a = s.finish();
    let b = solve(35.0);
    for f in [F_P, F_S, F_PKIKP, F_PKP] {
        for d in [20.0, 80.0, 150.0] {
            let (x, y) = (a.surface(f, d).0, b.surface(f, d).0);
            assert!(x == y || (x.is_infinite() && y.is_infinite()));
        }
    }
}

#[test]
fn cross_section_renders_at_any_time_and_size() {
    let (sol, _) = surface_source();
    let mut sec = Section::new();
    let ls: Vec<Listener> = [(25.0, 1.0), (105.0, -1.0), (118.0, 1.0), (150.0, -1.0)]
        .iter()
        .enumerate()
        .map(|(k, &(d, side))| {
            let (_, p) = sol.first_p(d);
            Listener { delta: d as f32, side, p: p as f32, s: sol.first_s(d) as f32, hot: k == 1 }
        })
        .collect();
    sec.set_listeners(&ls);
    for (w, h) in [(160, 120), (300, 300), (411, 233)] {
        sec.resize(w, h);
        sec.prepare(sol);
        for t in [0.0, 30.0, 400.0, 900.0, 1200.0, 1500.0, 4000.0] {
            sec.render(t);
        }
        // Something is drawn: the background differs from the frame mid-propagation.
        sec.render(500.0);
        assert!(sec.frame.px.iter().zip(&sec.frame.bg).any(|(a, b)| a != b));
    }
}
