//! Renders the Slab Slicer cross-section to a PNG natively, for checking the look of
//! every preset without a browser.
//!
//!   cargo run --release -p globe --example slicer_shot -- <out-dir> [w] [h] [ui] [--core]
//!
//! Writes `<out-dir>/slicer-<preset>.png` for every preset.

use globe::slicer::{Slicer, DEPTH_CORE, PRESETS};
use std::io::Write;

fn crc32(data: &[u8], mut c: u32) -> u32 {
    for &b in data {
        c ^= b as u32;
        for _ in 0..8 {
            c = if c & 1 != 0 { 0xedb8_8320 ^ (c >> 1) } else { c >> 1 };
        }
    }
    c
}

/// Minimal PNG: RGBA8, zlib with stored (uncompressed) blocks.
fn png(path: &str, w: usize, h: usize, px: &[u32]) {
    let mut raw = Vec::with_capacity((w * 4 + 1) * h);
    for y in 0..h {
        raw.push(0);
        for p in &px[y * w..(y + 1) * w] {
            raw.extend_from_slice(&p.to_le_bytes());
        }
    }
    let mut z = vec![0x78, 0x01];
    for (k, chunk) in raw.chunks(65535).enumerate() {
        let last = (k + 1) * 65535 >= raw.len();
        z.push(last as u8);
        z.extend_from_slice(&(chunk.len() as u16).to_le_bytes());
        z.extend_from_slice(&(!(chunk.len() as u16)).to_le_bytes());
        z.extend_from_slice(chunk);
    }
    let (mut a, mut b) = (1u32, 0u32);
    for &v in &raw {
        a = (a + v as u32) % 65521;
        b = (b + a) % 65521;
    }
    z.extend_from_slice(&((b << 16) | a).to_be_bytes());
    let mut out = b"\x89PNG\r\n\x1a\n".to_vec();
    let mut chunk = |kind: &[u8], data: &[u8]| {
        out.extend_from_slice(&(data.len() as u32).to_be_bytes());
        let mut body = kind.to_vec();
        body.extend_from_slice(data);
        out.extend_from_slice(&body);
        out.extend_from_slice(&(!crc32(&body, 0xffff_ffff)).to_be_bytes());
    };
    let mut ihdr = Vec::new();
    ihdr.extend_from_slice(&(w as u32).to_be_bytes());
    ihdr.extend_from_slice(&(h as u32).to_be_bytes());
    ihdr.extend_from_slice(&[8, 6, 0, 0, 0]);
    chunk(b"IHDR", &ihdr);
    chunk(b"IDAT", &z);
    chunk(b"IEND", &[]);
    std::fs::File::create(path).unwrap().write_all(&out).unwrap();
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let dir = args.first().map_or(".", String::as_str);
    let num = |i: usize, d: f32| args.get(i).and_then(|s| s.parse().ok()).unwrap_or(d);
    let (w, h, ui) = (num(1, 960.0) as usize, num(2, 680.0) as usize, num(3, 1.0));
    let core = args.iter().any(|a| a == "--core");
    let mut s = Slicer::new();
    s.resize(w, h, ui);
    if core {
        s.set_depth(DEPTH_CORE);
    }
    for p in PRESETS {
        s.set_profile(p.profile);
        let t = std::time::Instant::now();
        s.render();
        let ms = t.elapsed().as_secs_f64() * 1000.0;
        let path = format!("{dir}/slicer-{}.png", p.id);
        png(&path, w, h, &s.cv.frame.px);
        println!("{:<18} {path} ({ms:.1} ms, {} quakes)", p.name, s.visible);
    }
}
