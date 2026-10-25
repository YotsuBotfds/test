//! Renders the glass Earth's presets to PNGs for visual checks:
//!   cargo run --release -p globe --example glass_shots -- <out-dir> [w] [h] [exag]
//! Writes preset-0.png (whole planet) .. preset-5.png, plus nocut-0.png.
use globe::glass::Glass;
use std::io::Write;

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

/// Minimal PNG writer: RGBA8, zlib "stored" blocks (no compression, no dependencies).
fn png(path: &str, w: usize, h: usize, px: &[u32]) {
    let mut raw = Vec::with_capacity(h * (w * 4 + 1));
    for y in 0..h {
        raw.push(0u8);
        for &p in &px[y * w..(y + 1) * w] {
            raw.extend_from_slice(&p.to_le_bytes());
        }
    }
    let mut z = vec![0x78, 0x01];
    for (i, chunk) in raw.chunks(65535).enumerate() {
        let last = (i + 1) * 65535 >= raw.len();
        z.push(last as u8);
        let n = chunk.len() as u16;
        z.extend_from_slice(&n.to_le_bytes());
        z.extend_from_slice(&(!n).to_le_bytes());
        z.extend_from_slice(chunk);
    }
    let (mut a, mut b) = (1u32, 0u32);
    for &v in &raw {
        a = (a + v as u32) % 65521;
        b = (b + a) % 65521;
    }
    z.extend_from_slice(&((b << 16) | a).to_be_bytes());
    let mut out = vec![0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
    let mut chunk = |kind: &[u8], data: &[u8]| {
        out.extend_from_slice(&(data.len() as u32).to_be_bytes());
        let mut c = kind.to_vec();
        c.extend_from_slice(data);
        out.extend_from_slice(&c);
        out.extend_from_slice(&crc32(&c).to_be_bytes());
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
    let dir = args.first().map_or("glass-shots", String::as_str);
    let w: usize = args.get(1).map_or(960, |s| s.parse().unwrap());
    let h: usize = args.get(2).map_or(720, |s| s.parse().unwrap());
    let exag: f32 = args.get(3).map_or(4.0, |s| s.parse().unwrap());
    std::fs::create_dir_all(dir).unwrap();
    let mut g = Glass::new();
    g.resize(w, h);
    g.set_exag(exag);
    g.time = 3.0;
    for k in 0..=g.slabs.len() {
        g.preset(k, 0.0);
        let t = std::time::Instant::now();
        g.render();
        let ms = t.elapsed().as_secs_f64() * 1000.0;
        let path = format!("{dir}/preset-{k}.png");
        png(&path, w, h, &g.frame.px);
        let name = if k == 0 { "Whole planet" } else { g.slabs[k - 1].name };
        println!("{path}: {name}, {} quakes drawn, {ms:.1} ms", g.stats.shown);
    }
    // Mid-flight from the whole planet to Tonga: the cut turns and opens.
    for (name, t) in [("flight-a", 0.7), ("flight-b", 1.2), ("flight-c", 1.7)] {
        g.preset(0, 0.0);
        g.render();
        g.preset(1, 2.4);
        let mut done = 0.0;
        while done < t {
            g.tick(1.0 / 30.0, false, true);
            done += 1.0 / 30.0;
        }
        g.render();
        png(&format!("{dir}/{name}.png"), w, h, &g.frame.px);
    }
    g.preset(0, 0.0);
    g.cut_on = false;
    g.render();
    png(&format!("{dir}/nocut-0.png"), w, h, &g.frame.px);
    g.preset(1, 0.0);
    g.render();
    png(&format!("{dir}/nocut-1.png"), w, h, &g.frame.px);
}
