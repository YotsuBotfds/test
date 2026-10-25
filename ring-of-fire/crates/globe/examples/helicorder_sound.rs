//! Writes a spectrogram of the Drum's sound for the M8.8 day at ANMO, to check by
//! eye what the ear would hear: cargo run --release -p globe --example helicorder_sound out.png
use globe::helicorder::{audio, Helicorder};

fn fft(re: &mut [f32], im: &mut [f32]) {
    let n = re.len();
    let mut j = 0;
    for i in 1..n {
        let mut bit = n >> 1;
        while j & bit != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j |= bit;
        if i < j {
            re.swap(i, j);
            im.swap(i, j);
        }
    }
    let mut len = 2;
    while len <= n {
        let ang = -std::f32::consts::TAU / len as f32;
        for start in (0..n).step_by(len) {
            for k in 0..len / 2 {
                let (s, c) = (ang * k as f32).sin_cos();
                let (a, b) = (start + k, start + k + len / 2);
                let (tr, ti) = (re[b] * c - im[b] * s, re[b] * s + im[b] * c);
                re[b] = re[a] - tr;
                im[b] = im[a] - ti;
                re[a] += tr;
                im[a] += ti;
            }
        }
        len <<= 1;
    }
}

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

fn write_png(path: &str, w: usize, h: usize, rgb: &[[u8; 3]]) {
    let mut raw = Vec::new();
    for y in 0..h {
        raw.push(0);
        for p in &rgb[y * w..(y + 1) * w] {
            raw.extend_from_slice(p);
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
    ihdr.extend_from_slice(&[8, 2, 0, 0, 0]);
    chunk(b"IHDR", &ihdr);
    chunk(b"IDAT", &z);
    chunk(b"IEND", &[]);
    std::fs::write(path, out).unwrap();
}

fn main() {
    let out = std::env::args().nth(1).unwrap_or_else(|| "sound.png".into());
    let h = Helicorder::new(0);
    let big = globe::data::world().largest(1, 0.0)[0];
    let t0 = h.seis.event_of(big).unwrap().t0 - 1200.0;
    let rate = 22050.0;
    let c = audio::synth(&h.seis, t0, t0 + 24.0 * 3600.0, 2400.0, rate);
    let l = &c.data[..c.frames];
    let (n, w, ht) = (2048, 900, 300);
    let hop = (c.frames - n) / w;
    let mut img = vec![[0u8; 3]; w * ht];
    let (fmin, fmax) = (20.0f32, 11025.0f32);
    for x in 0..w {
        let mut re: Vec<f32> = (0..n).map(|i| l[x * hop + i] * (0.5 - 0.5 * (std::f32::consts::TAU * i as f32 / n as f32).cos())).collect();
        let mut im = vec![0.0; n];
        fft(&mut re, &mut im);
        for y in 0..ht {
            // Log frequency, low at the bottom.
            let f = fmin * (fmax / fmin).powf(1.0 - y as f32 / (ht - 1) as f32);
            let bin = ((f / rate as f32) * n as f32) as usize;
            // Amplitude of a sinusoid in the Hann window: |X| / (n / 4).
            let p = re[bin].hypot(im[bin]) / (n as f32 * 0.25);
            let db = (20.0 * (p + 1e-9).log10()).clamp(-90.0, 0.0);
            let v = (db + 90.0) / 90.0;
            img[y * w + x] = [(255.0 * v.powf(0.8)) as u8, (230.0 * v.powf(1.6)) as u8, (200.0 * v.powf(3.0)) as u8];
        }
    }
    write_png(&out, w, ht, &img);
    println!("{:.1} s clip, peak {:.3}, rms {:.4} -> {out} (20 Hz bottom, 11 kHz top, log scale)", c.frames as f64 / rate, c.peak, c.rms);
}
