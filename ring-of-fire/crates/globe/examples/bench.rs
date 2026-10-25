//! Times a frame of the surface globe: cargo run --release -p globe --example bench
use std::time::Instant;
fn main() {
    let mut g = globe::Globe::new();
    g.resize(1000, 1000);
    g.render();
    for bloom in [0.0, 0.55] {
        g.frame.bloom = bloom;
        let t = Instant::now();
        for k in 0..20 {
            g.yaw = -170.0 + k as f32;
            g.render();
        }
        println!("surface globe 1000x1000, bloom {bloom}: {:.2} ms/frame", t.elapsed().as_secs_f64() * 1000.0 / 20.0);
    }
}
