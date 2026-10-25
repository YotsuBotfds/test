//! Prints the grid solver against ray theory at every 5 degrees, for P, S, PKIKP and PKP:
//!   cargo run --release -p globe --example waves_table -- [depth km]   (WAVES_TIMING=1 for stage times)
use globe::waves::rays::Curves;
use globe::waves::solve::*;
fn main() {
    let depth: f64 = std::env::args().nth(1).map_or(0.0, |s| s.parse().unwrap());
    let g = grid();
    println!("grid {} rings x {} = {} nodes; cmb ring {} icb ring {}", g.r.len(), g.nt, g.len(), g.j_cmb, g.j_icb);
    let t = std::time::Instant::now();
    let sol = solve(depth);
    println!("solve depth {depth}: {:.1} ms, {} pops; info {:?}", t.elapsed().as_secs_f64() * 1000.0, sol.pops, sol.info);
    let c = Curves::new(depth);
    println!("  delta |   P fmm   ray    err  amp |   S fmm   ray    err  amp | PKIKP fmm ray amp | PKP fmm ray amp");
    for d in (0..=36).map(|k| k as f64 * 5.0) {
        let r = d.to_radians();
        let (tp, ap) = sol.surface(F_P, d);
        let (ts, as_) = sol.surface(F_S, d);
        let (tk, ak) = sol.surface(F_PKIKP, d);
        let (tq, aq) = sol.surface(F_PKP, d);
        let rp = Curves::first(&c.p, r).unwrap_or(f64::NAN);
        let rs = Curves::first(&c.s, r).unwrap_or(f64::NAN);
        let rk = Curves::first(&c.pkikp, r).unwrap_or(f64::NAN);
        let rq = Curves::first(&c.pkp, r).unwrap_or(f64::NAN);
        println!(
            "  {d:5.1} | {tp:7.1} {rp:7.1} {:6.2} {ap:.5} | {ts:7.1} {rs:7.1} {:6.2} {as_:.5} | {tk:7.1} {rk:7.1} {ak:.5} | {tq:7.1} {rq:7.1} {aq:.5}",
            tp - rp,
            ts - rs
        );
    }
}
