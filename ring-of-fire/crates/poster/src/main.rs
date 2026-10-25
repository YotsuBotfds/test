//! Renders the globe to a PNG with the same code the browser runs.
//!
//!   cargo run --release -p poster -- [out.png] [size] [lon] [lat] [--coast] [--plates] [--solid]

use globe::Globe;
use std::{env, fs::File, io::BufWriter};

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    let flags: Vec<&str> = args.iter().filter(|a| a.starts_with("--")).map(String::as_str).collect();
    let pos: Vec<&str> = args.iter().filter(|a| !a.starts_with("--")).map(String::as_str).collect();
    let out = pos.first().copied().unwrap_or("ring-of-fire.png");
    let size: usize = pos.get(1).map_or(1600, |s| s.parse().unwrap());

    let mut g = Globe::new();
    g.resize(size, size);
    g.yaw = pos.get(2).map_or(-170.0, |s| s.parse().unwrap());
    g.pitch = pos.get(3).map_or(5.0, |s| s.parse().unwrap());
    g.opts.coast = flags.contains(&"--coast");
    g.opts.plates = flags.contains(&"--plates");
    g.opts.xray = !flags.contains(&"--solid");
    let start = std::time::Instant::now();
    g.render();
    let ms = start.elapsed().as_secs_f32() * 1000.0;

    let mut enc = png::Encoder::new(BufWriter::new(File::create(out).unwrap()), size as u32, size as u32);
    enc.set_color(png::ColorType::Rgba);
    enc.set_depth(png::BitDepth::Eight);
    let bytes: Vec<u8> = g.frame.px.iter().flat_map(|p| p.to_le_bytes()).collect();
    enc.write_header().unwrap().write_image_data(&bytes).unwrap();
    println!("{} quakes -> {out} ({size}x{size}, rendered in {ms:.1} ms)", g.visible());
}
