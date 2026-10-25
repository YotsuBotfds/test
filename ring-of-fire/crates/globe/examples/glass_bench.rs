//! Times frames of the glass Earth at ~1 megapixel, phase by phase:
//!   cargo run --release -p globe --example glass_bench
use globe::glass::Glass;
use std::time::Instant;

const PHASES: [&str; 5] = ["background", "stars+lines", "quakes", "labels", "bloom+tone"];

fn run(g: &mut Glass, label: &str, frames: usize, mut step: impl FnMut(&mut Glass, usize)) -> f64 {
    let mut acc = [0f64; 5];
    let t = Instant::now();
    for k in 0..frames {
        step(g, k);
        let mut last = Instant::now();
        g.render_timed(&mut |p| {
            let now = Instant::now();
            acc[p] += (now - last).as_secs_f64() * 1000.0;
            last = now;
        });
    }
    let total = t.elapsed().as_secs_f64() * 1000.0 / frames as f64;
    let parts: Vec<String> = PHASES.iter().zip(acc).map(|(n, v)| format!("{n} {:.2}", v / frames as f64)).collect();
    println!("{label:<36} {total:6.2} ms/frame  ({})", parts.join(", "));
    total
}

fn main() {
    let mut g = Glass::new();
    let (w, h): (usize, usize) = std::env::var("SIZE").ok().and_then(|s| s.split_once('x').map(|(a, b)| (a.parse().unwrap(), b.parse().unwrap()))).unwrap_or((1150, 870));
    g.resize(w, h);
    if let Ok(b) = std::env::var("BLOOM") {
        g.frame.bloom = b.parse().unwrap();
    }
    println!("glass Earth {w}x{h} ({:.2} MP), exaggeration x{}", (w * h) as f64 / 1e6, g.exag);
    let n = 20;
    let mut worst: f64 = 0.0;
    for k in 0..=g.slabs.len() {
        g.preset(k, 0.0);
        g.render();
        let name = if k == 0 { "whole planet".to_string() } else { g.slabs[k - 1].name.to_string() };
        worst = worst.max(run(&mut g, &format!("{name}, orbiting"), n, |g, _| {
            g.tick(1.0 / 60.0, true, true);
        }));
        if k == 0 {
            g.cut_on = false;
            run(&mut g, "whole planet, no cut, orbiting", n, |g, _| {
                g.tick(1.0 / 60.0, true, true);
            });
            g.cut_on = true;
            run(&mut g, "whole planet, still, core churning", n, |g, _| {
                g.tick(1.0 / 60.0, false, true);
            });
            run(&mut g, "whole planet, still, replay running", n, |g, i| {
                g.cursor = (i as f32 * 86400.0 * 30.0) % 9.0e7;
            });
        }
    }
    println!("worst orbiting frame: {worst:.2} ms");
}
