//! Times the Laws instrument: cargo run --release -p globe --example laws_bench
//! One-off work (fits, layouts) is timed separately from the frames: a "redraw" is a
//! full render after the data changed (moving Mc, a new sequence, a new layout),
//! a "hover" frame restores the cached pixels and draws the highlight.
use globe::laws::{Laws, CHART_ENERGY, CHART_GR, CHART_OMORI};
use std::time::Instant;

fn ms(t: Instant) -> f64 {
    t.elapsed().as_secs_f64() * 1e3
}

fn main() {
    let t = Instant::now();
    let mut l = Laws::new();
    println!("init (catalogue stats, GR fits, Kamchatka Omori fit, energy budget): {:.1} ms", ms(t));
    let t = Instant::now();
    for s in 0..4 {
        l.set_gr(s, None);
    }
    l.set_gr(0, None);
    println!("GR refit, all four depth bands: {:.2} ms", ms(t));
    let big: Vec<usize> = l.world.largest(8, 60.0);
    let t = Instant::now();
    for &i in &big {
        l.set_sequence(i);
    }
    println!("Omori refit, {} sequences: {:.1} ms each", big.len(), ms(t) / big.len() as f64);
    l.set_sequence(l.default_main);

    for (chart, name, w, h) in [(CHART_GR, "Gutenberg–Richter", 1000, 1000), (CHART_OMORI, "Omori–Utsu", 1000, 1000), (CHART_ENERGY, "energy map", 1250, 800)] {
        let t = Instant::now();
        l.resize(chart, w, h, 2.0);
        let layout = ms(t);
        let t = Instant::now();
        l.render(chart);
        let first = ms(t);
        // Redraws after a data change, with the buffers already in memory.
        let n = 10;
        let mut redraw = 0.0;
        for k in 0..n {
            match chart {
                CHART_GR => l.set_gr(0, Some(46 + k % 6)),
                CHART_OMORI => {
                    l.set_sequence(big[k % 2]);
                }
                _ => l.resize(chart, w, h, 2.0),
            }
            let t = Instant::now();
            l.render(chart);
            redraw += ms(t);
        }
        let n_hover = 40;
        let t = Instant::now();
        for k in 0..n_hover {
            // Move the hover so each frame redraws something different.
            l.hover(chart, 100.0 + k as f32 * 23.0, 200.0 + k as f32 * 13.0);
            l.render(chart);
        }
        let hover = ms(t) / n_hover as f64;
        println!(
            "{name} {w}x{h}: layout {layout:.1} ms, first frame {first:.1} ms (page faults included), redraw {:.2} ms, hover frame {hover:.2} ms",
            redraw / n as f64
        );
    }
}
