//! Renders the three Laws panels to PPM files plus their JSON descriptions, for
//! checking layouts without a browser:
//!   cargo run --release -p globe --example laws_preview -- <out-dir> [k] [main-quake]
use globe::laws::{Laws, CHART_ENERGY, CHART_GR, CHART_OMORI};
use std::io::Write;

fn write_ppm(path: &str, w: usize, h: usize, px: &[u32]) {
    let mut f = std::io::BufWriter::new(std::fs::File::create(path).unwrap());
    write!(f, "P6\n{w} {h}\n255\n").unwrap();
    for p in px {
        f.write_all(&[(p & 0xff) as u8, ((p >> 8) & 0xff) as u8, ((p >> 16) & 0xff) as u8]).unwrap();
    }
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let dir = args.first().cloned().unwrap_or_else(|| ".".into());
    let k: f32 = args.get(1).map_or(1.0, |s| s.parse().unwrap());
    let t = std::time::Instant::now();
    let mut l = Laws::new();
    println!("init {:.1} ms", t.elapsed().as_secs_f64() * 1e3);
    if let Some(m) = args.get(2) {
        let t = std::time::Instant::now();
        let st = l.set_sequence(m.parse().unwrap());
        println!("sequence {m}: {st:?} in {:.1} ms", t.elapsed().as_secs_f64() * 1e3);
    }
    let sizes = [(CHART_GR, 620.0, 430.0), (CHART_OMORI, 620.0, 430.0), (CHART_ENERGY, 950.0, 580.0)];
    for (chart, w, h) in sizes {
        let (pw, ph) = ((w * k) as usize, (h * k) as usize);
        l.resize(chart, pw, ph, k);
        let t = std::time::Instant::now();
        l.render(chart);
        let ms = t.elapsed().as_secs_f64() * 1e3;
        let f = l.frame(chart);
        write_ppm(&format!("{dir}/laws-{chart}.ppm"), f.w, f.h, &f.px);
        std::fs::write(format!("{dir}/laws-{chart}.json"), l.info(chart)).unwrap();
        println!("chart {chart}: {pw}x{ph} rendered in {ms:.2} ms");
    }
}
