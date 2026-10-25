//! Times the Slab Slicer: cargo run --release -p globe --example slicer_bench
//!
//! "drag" frames change the profile length every frame (band, fit and background all
//! rebuilt); "steady" frames only move the time cursor (quakes and fit redrawn).
use globe::slicer::{Profile, Slicer, PRESETS};
use std::time::Instant;

fn main() {
    let mut s = Slicer::new();
    s.resize(1000, 1000, 1.0);
    let base = PRESETS[0].profile;
    s.set_profile(base);
    s.render();
    let n = 30;

    let t = Instant::now();
    for k in 0..n {
        s.set_cursor(s.cursor - k as f32);
        s.render();
    }
    println!("slicer 1000x1000 steady:   {:.2} ms/frame", t.elapsed().as_secs_f64() * 1000.0 / n as f64);

    let t = Instant::now();
    for k in 0..n {
        let p = Profile { b: [base.b[0], base.b[1] - 0.05 * k as f32], ..base };
        s.set_profile(p);
        s.render();
    }
    println!("slicer 1000x1000 drag:     {:.2} ms/frame", t.elapsed().as_secs_f64() * 1000.0 / n as f64);

    let t = Instant::now();
    for k in 0..n {
        let p = Profile { b: [base.b[0], base.b[1] - 0.05 * k as f32], ..base };
        s.set_profile(p);
    }
    println!("  of which band + fit:     {:.2} ms", t.elapsed().as_secs_f64() * 1000.0 / n as f64);

    for p in PRESETS {
        s.set_profile(p.profile);
        s.render();
        let t = Instant::now();
        for _ in 0..10 {
            s.render();
        }
        println!("  {:<18} steady {:.2} ms", p.name, t.elapsed().as_secs_f64() * 1000.0 / 10.0);
    }
}
