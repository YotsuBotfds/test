//! Scratch tool for tuning profiles: cargo run --release -p globe --example slicer_probe -- lat1 lon1 lat2 lon2 [halfwidth]
use globe::data::world;
use globe::slicer::*;

fn main() {
    let a: Vec<f32> = std::env::args().skip(1).map(|s| s.parse().unwrap()).collect();
    let p = Profile { a: [a[0], a[1]], b: [a[2], a[3]], half_width: *a.get(4).unwrap_or(&100.0) };
    let w = world();
    let g = Geom::new(&p);
    let mut band = Vec::new();
    collect_band(w, &g, p.half_width, &mut band);
    let deep = band.iter().filter(|q| q.depth >= 70.0).count();
    println!("len {:.0} km az {:.0}  band {} deep {}", g.length, g.azimuth(0.0), band.len(), deep);
    // depth histogram vs along
    let mut grid = vec![vec![0u32; 30]; 15];
    for q in &band {
        let r = ((q.depth / 50.0) as usize).min(14);
        let c = ((q.along / g.length * 29.99) as usize).min(29);
        grid[r][c] += 1;
    }
    for (r, row) in grid.iter().enumerate() {
        let s: String = row.iter().map(|&v| match v { 0 => '.', 1 => ':', 2..=4 => 'o', 5..=15 => 'O', _ => '#' }).collect();
        println!("{:4} {}", r * 50, s);
    }
    match fit_slab(&band) {
        SlabResult::Fit(s) => {
            println!(
                "{:?} dip {:.1} ±{:.1} (top {:.1} bottom {:.1}) depth {:.0}-{:.0} inliers {}/{} scatter {:.1} tau {:.0} intercept {:?} toward_b {}",
                s.model, s.dip, s.dip_err, s.dip_top, s.dip_bottom, s.top_depth, s.max_depth, s.inliers, s.n_deep, s.scatter, s.tau, s.intercept.map(|v| v.round()), s.toward_b
            );
            let (a0, d0) = s.at(0.0);
            let (a1, d1) = s.at(1.0);
            println!("  from ({a0:.0} km, {d0:.0}) to ({a1:.0} km, {d1:.0})");
        }
        SlabResult::None { n, n_deep, why } => println!("no slab: n {n} deep {n_deep} {why:?}"),
    }
    let mut cr = Vec::new();
    crossings(&g, plate_lines(), &mut cr);
    println!("plate boundary crossings: {:?}", cr.iter().map(|v| v.round()).collect::<Vec<_>>());
}
