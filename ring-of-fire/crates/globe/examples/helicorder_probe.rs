//! Prints catalogue facts and travel times the Drum's copy depends on:
//! cargo run --release -p globe --example helicorder_probe
use globe::helicorder::travel::{tables, Wave};
fn main() {
    let t0 = std::time::Instant::now();
    let tt = tables();
    println!("tables built in {:.1} ms", t0.elapsed().as_secs_f64() * 1000.0);
    for h in [0.0, 35.0, 600.0] {
        println!("depth {h}");
        for d in [0.5, 1.0, 2.0, 5.0, 10.0, 15.0, 20.0, 25.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 95.0, 100.0, 110.0, 120.0, 130.0, 140.0, 145.0, 150.0, 160.0, 170.0, 180.0] {
            let p = tt.first(Wave::P, d, h);
            let s = tt.first(Wave::S, d, h);
            println!(
                "  {d:5.1}  P {:7.1} s ({:?}, p {:.2}, pP+{:.1}, to {:.0})  S {:7.1} s ({:?})  S-P {:.1}",
                p.t, p.branch, p.p, p.depth_delay, p.takeoff, s.t, s.branch, s.t - p.t
            );
        }
    }
    let w = globe::data::world();
    println!("epoch {} n {}", w.epoch, w.quakes.len());
    for &i in &w.largest(8, 0.0) {
        let q = w.quakes[i];
        println!("{i} M{} t={} lat {} lon {} depth {} {}", q.mag, q.t, q.lat, q.lon, q.depth, w.places[i]);
    }
    let mut d: Vec<usize> = (0..w.quakes.len()).filter(|&i| w.quakes[i].depth > 300.0).collect();
    d.sort_by(|&a, &b| w.quakes[b].mag.total_cmp(&w.quakes[a].mag));
    for &i in d.iter().take(3) {
        let q = w.quakes[i];
        println!("deep {i} M{} depth {} {}", q.mag, q.depth, w.places[i]);
    }
}
