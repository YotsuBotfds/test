//! Times the Drum and optionally writes PNGs of it:
//!   cargo run --release -p globe --example helicorder_bench [out_dir]
use globe::helicorder::{audio, Helicorder};
use std::time::Instant;

fn crc32(data: &[u8]) -> u32 {
    let mut c = 0xffff_ffffu32;
    for &b in data {
        c ^= b as u32;
        for _ in 0..8 {
            c = if c & 1 != 0 { 0xedb8_8320 ^ (c >> 1) } else { c >> 1 };
        }
    }
    !c
}

/// Minimal PNG writer (stored deflate blocks), enough for inspection shots.
fn write_png(path: &str, w: usize, h: usize, px: &[u32]) {
    let mut raw = Vec::with_capacity((w * 4 + 1) * h);
    for y in 0..h {
        raw.push(0);
        for &p in &px[y * w..(y + 1) * w] {
            raw.extend_from_slice(&p.to_le_bytes());
        }
    }
    let mut z = vec![0x78, 0x01];
    let (mut a, mut b) = (1u32, 0u32);
    for &v in &raw {
        a = (a + v as u32) % 65521;
        b = (b + a) % 65521;
    }
    let chunks: Vec<&[u8]> = raw.chunks(65535).collect();
    for (i, c) in chunks.iter().enumerate() {
        z.push((i + 1 == chunks.len()) as u8);
        z.extend_from_slice(&(c.len() as u16).to_le_bytes());
        z.extend_from_slice(&(!(c.len() as u16)).to_le_bytes());
        z.extend_from_slice(c);
    }
    z.extend_from_slice(&((b << 16) | a).to_be_bytes());
    let mut out = vec![0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
    let mut chunk = |kind: &[u8], data: &[u8]| {
        out.extend_from_slice(&(data.len() as u32).to_be_bytes());
        let mut body = kind.to_vec();
        body.extend_from_slice(data);
        out.extend_from_slice(&body);
        out.extend_from_slice(&crc32(&body).to_be_bytes());
    };
    let mut ihdr = Vec::new();
    ihdr.extend_from_slice(&(w as u32).to_be_bytes());
    ihdr.extend_from_slice(&(h as u32).to_be_bytes());
    ihdr.extend_from_slice(&[8, 6, 0, 0, 0]);
    chunk(b"IHDR", &ihdr);
    chunk(b"IDAT", &z);
    chunk(b"IEND", &[]);
    std::fs::write(path, out).unwrap();
}

fn main() {
    let dir = std::env::args().nth(1);
    let t = Instant::now();
    let mut h = Helicorder::new(0);
    println!("station record built in {:.1} ms (includes travel-time tables)", t.elapsed().as_secs_f64() * 1e3);
    let t = Instant::now();
    h.set_station(1);
    println!("station switch in {:.1} ms", t.elapsed().as_secs_f64() * 1e3);
    h.set_station(0);
    let (w, ht) = (1180, 860);
    h.drum.resize(w, ht, 1.0);
    let main = globe::data::world().largest(1, 0.0)[0];
    let t_main = globe::data::world().quakes[main].t as f64;
    let quiet = h.quiet_day() as f64 * 86400.0;
    let deep = h.notable(1).unwrap();
    let t_deep = globe::data::world().quakes[deep].t as f64;
    let cases: [(&str, usize, f64); 7] = [
        ("day-mainshock", 1, t_main),
        ("day-quiet", 1, quiet + 12.0 * 3600.0),
        ("hour-mainshock-p", 0, t_main + 600.0),
        ("hour-deep", 0, t_deep + 700.0),
        ("week", 2, t_main),
        ("month", 3, t_main),
        ("years", 4, t_main),
    ];
    for (name, z, t0) in cases {
        h.drum.set_zoom(z);
        let g = h.drum.grid;
        // Put the moment a few lines below the top of the face.
        let half = (h.drum.rd * globe::helicorder::drum::THETA_V / h.drum.sp) as f64;
        h.drum.center = g.pos(t0).floor() + (half - 3.0).max(0.0).min(half * 0.6);
        if name.starts_with("hour") || name == "day-quiet" {
            h.drum.center = g.pos(t0).floor();
        }
        let tc = Instant::now();
        h.drum.warm(&h.seis);
        let rows_ms = tc.elapsed().as_secs_f64() * 1e3;
        h.render(usize::MAX);
        let n = 10;
        let tc = Instant::now();
        for i in 0..n {
            h.drum.center += if i % 2 == 0 { 0.37 } else { -0.37 };
            h.render(usize::MAX);
        }
        let ms = tc.elapsed().as_secs_f64() * 1e3 / n as f64;
        let tm = h.drum.timings.map(|v| v * 1e3);
        println!("{name:18} {}x{}: rows {rows_ms:6.1} ms, frame {ms:5.2} ms (traces {:.2}, compose {:.2}, overlays {:.2})", w, ht, tm[0], tm[1], tm[2]);
        if let Some(d) = &dir {
            h.drum.selected = if name == "day-mainshock" { Some(main) } else { None };
            h.render(usize::MAX);
            write_png(&format!("{d}/{name}.png"), w, ht, &h.drum.frame.px);
            h.drum.selected = None;
        }
    }
    // Audio: a day of record at 2400x is 36 s.
    for (name, t0, speed) in [("mainshock day", t_main - 3600.0, 2400.0), ("quiet day", quiet, 2400.0), ("week", t_main - 86400.0, 14400.0)] {
        let tc = Instant::now();
        let c = audio::synth(&h.seis, t0, t0 + 86400.0, speed, 22050.0);
        println!(
            "audio {name:14}: {:.1} s clip in {:.1} ms, peak {:.3}, rms {:.4}",
            c.frames as f64 / 22050.0,
            tc.elapsed().as_secs_f64() * 1e3,
            c.peak,
            c.rms
        );
    }
    if let Some(d) = &dir {
        h.strip.resize(1180, 40);
        h.strip.render(&h.seis, (t_main - 43200.0, t_main + 43200.0), h.drum.cursor, Some(t_main));
        write_png(&format!("{d}/strip.png"), 1180, 40, &h.strip.px);
        h.reference.render(0, 560, 120, 2.0);
        write_png(&format!("{d}/reference.png"), 560, 120, &h.reference.px);
    }
}
