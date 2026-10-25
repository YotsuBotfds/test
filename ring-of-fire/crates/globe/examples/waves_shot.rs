//! Renders the cross-section natively at a few times and writes PPM files:
//!   cargo run --release -p globe --example waves_shot -- <out-prefix> [depth] [size] [t1 t2 ...]
//! RAYDOTS=1 overlays exact ray-theory P wavefront points (left half); AMPMAP=1 also
//! writes each field's display amplitude.
use globe::waves::model::{Wave, R_EARTH};
use globe::waves::rays::{shells, Kind};
use globe::waves::section::{Listener, Section};
use globe::waves::solve::{solve, F_P, F_S};
use std::io::Write;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let prefix = args.first().cloned().unwrap_or("waves".into());
    let depth: f64 = args.get(1).map_or(35.0, |s| s.parse().unwrap());
    let size: usize = args.get(2).map_or(900, |s| s.parse().unwrap());
    let times: Vec<f32> = if args.len() > 3 { args[3..].iter().map(|s| s.parse().unwrap()).collect() } else { vec![240.0, 540.0, 960.0] };
    let t0 = std::time::Instant::now();
    let sol = solve(depth);
    println!("solve {:.1} ms", t0.elapsed().as_secs_f64() * 1000.0);
    let mut sec = Section::new();
    sec.resize(size, size);
    let listeners: Vec<Listener> = [(22.0, 1.0), (60.0, 1.0), (85.0, -1.0), (118.0, 1.0), (132.0, -1.0), (150.0, -1.0)]
        .iter()
        .map(|&(d, side)| {
            let (p, _) = sol.surface(F_P, d as f64);
            let (s, _) = sol.surface(F_S, d as f64);
            Listener { delta: d, side, p: p as f32, s: if d < 99.0 { s as f32 } else { f32::INFINITY }, hot: d == 60.0 }
        })
        .collect();
    sec.set_listeners(&listeners);
    let t0 = std::time::Instant::now();
    sec.prepare(&sol);
    println!("prepare {:.1} ms", t0.elapsed().as_secs_f64() * 1000.0);
    if std::env::var("AMPMAP").is_ok() {
        for f in 0..6 {
            let (tt, aa) = sec.debug_field(f);
            let name = format!("{prefix}-amp{f}.ppm");
            let mut o = std::io::BufWriter::new(std::fs::File::create(&name).unwrap());
            write!(o, "P6\n{} {}\n255\n", size, size).unwrap();
            for k in 0..size * size {
                let a = aa[k];
                let c = if tt[k] != u16::MAX && (tt[k] as u32 % 1200) < 25 { 160 } else { 0 };
                o.write_all(&[a, a, a.max(c)]).unwrap();
            }
        }
    }
    for &t in &times {
        let t0 = std::time::Instant::now();
        sec.render(t);
        let t1 = std::time::Instant::now();
        for _ in 0..4 {
            sec.render(t);
        }
        println!(
            "render t={t}: first {:.2} ms, then {:.2} ms",
            (t1 - t0).as_secs_f64() * 1000.0,
            t1.elapsed().as_secs_f64() * 250.0
        );
        if std::env::var("RAYDOTS").is_ok() {
            let sh = shells();
            let eta = sh.eta_at(Wave::P, R_EARTH - depth);
            let mut pts = Vec::new();
            for k in 0..1200 {
                let phi = (k as f64 + 0.5) / 1200.0 * std::f64::consts::FRAC_PI_2;
                let p = eta * phi.sin();
                let ray = sh.shoot(Wave::P, depth, p, true);
                if ray.kind == Kind::Blocked {
                    continue;
                }
                sh.path(Wave::P, depth, p, true, &mut pts);
                for w in pts.windows(2) {
                    if w[0][2] <= t && w[1][2] > t {
                        let u = (t - w[0][2]) / (w[1][2] - w[0][2]);
                        let q = sec.to_screen(w[0][0] + (w[1][0] - w[0][0]) * u, w[0][1] + (w[1][1] - w[0][1]) * u, -1.0);
                        let (x, y) = (q[0] as usize, q[1] as usize);
                        if x < size && y < size {
                            sec.frame.px[y * size + x] = if ray.kind == Kind::Mantle { 0xff00ff00 } else { 0xffffffff };
                        }
                    }
                }
            }
        }
        let name = format!("{prefix}-{}.ppm", t as u32);
        let mut f = std::io::BufWriter::new(std::fs::File::create(&name).unwrap());
        write!(f, "P6\n{} {}\n255\n", size, size).unwrap();
        for p in &sec.frame.px {
            f.write_all(&[(p & 0xff) as u8, ((p >> 8) & 0xff) as u8, ((p >> 16) & 0xff) as u8]).unwrap();
        }
    }
}
