//! Times the waves instrument: cargo run --release -p globe --example waves_bench
//! - the travel-time solve for three source depths (stage by stage with WAVES_TIMING=1),
//! - resampling the fields for a ~1 megapixel cross-section,
//! - cross-section frames at several times, the chart, and ray tracing for listeners.
use globe::waves::chart::Chart;
use globe::waves::section::{Listener, Section};
use globe::waves::solve::{solve, F_P, F_S};
use std::time::Instant;

fn ms(t: Instant) -> f64 {
    t.elapsed().as_secs_f64() * 1000.0
}

fn main() {
    let only_solve = std::env::args().any(|a| a == "--solve");
    let mut best = f64::MAX;
    for depth in [35.0, 35.0, 120.0, 600.0] {
        let t = Instant::now();
        let sol = solve(depth);
        let e = ms(t);
        best = best.min(e);
        println!("solve depth {depth:>5} km: {e:6.1} ms ({} node updates)", sol.pops);
    }
    println!("solve best: {best:.1} ms");
    if only_solve {
        return;
    }
    let sol = solve(35.0);
    let mut sec = Section::new();
    sec.resize(1150, 1000);
    let ls: Vec<Listener> = [22.0, 45.0, 75.0, 110.0, 119.0, 145.0]
        .iter()
        .enumerate()
        .map(|(k, &d)| Listener {
            delta: d,
            side: if k % 2 == 0 { 1.0 } else { -1.0 },
            p: sol.surface(F_P, d as f64).0 as f32,
            s: sol.first_s(d as f64) as f32,
            hot: k == 2,
        })
        .collect();
    sec.set_listeners(&ls);
    let t = Instant::now();
    sec.prepare(&sol);
    println!(
        "cross-section prepare 1150x1000: {:.1} ms (resample {:.1}, background and ray fan {:.1}, listener rays {:.1})",
        ms(t),
        sec.prep_ms[0],
        sec.prep_ms[1],
        sec.prep_ms[2]
    );
    let mut worst: f64 = 0.0;
    let mut sum = 0.0;
    let times: Vec<f32> = (0..=50).map(|k| k as f32 * 30.0).collect();
    for &tt in &times {
        let t = Instant::now();
        sec.render(tt);
        let e = ms(t);
        worst = worst.max(e);
        sum += e;
    }
    println!("cross-section frame 1150x1000: mean {:.2} ms, worst {:.2} ms over 0-25 min", sum / times.len() as f64, worst);
    let mut ch = Chart::new();
    ch.resize(900, 270, 1.0);
    ch.prepare(&sol);
    let t = Instant::now();
    for k in 0..20 {
        ch.render(k as f32 * 60.0, &ls, -1.0);
    }
    println!("chart frame 900x270: {:.2} ms", ms(t) / 20.0);
    let _ = F_S;
}
