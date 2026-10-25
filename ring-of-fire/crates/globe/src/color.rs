//! Colour helpers: sRGB <-> linear, OKLab interpolation, and the depth ramp.

pub type Rgb = [f32; 3];

pub fn to_linear(c: f32) -> f32 {
    if c <= 0.04045 {
        c / 12.92
    } else {
        ((c + 0.055) / 1.055).powf(2.4)
    }
}

pub fn to_srgb(c: f32) -> f32 {
    let c = c.clamp(0.0, 1.0);
    if c <= 0.0031308 {
        c * 12.92
    } else {
        1.055 * c.powf(1.0 / 2.4) - 0.055
    }
}

/// 0xRRGGBB -> linear RGB.
pub fn hex(h: u32) -> Rgb {
    let ch = |s: u32| to_linear(((h >> s) & 0xff) as f32 / 255.0);
    [ch(16), ch(8), ch(0)]
}

fn oklab(c: Rgb) -> Rgb {
    let l = (0.412_221_46 * c[0] + 0.536_332_55 * c[1] + 0.051_445_995 * c[2]).cbrt();
    let m = (0.211_903_5 * c[0] + 0.680_699_5 * c[1] + 0.107_396_96 * c[2]).cbrt();
    let s = (0.088_302_46 * c[0] + 0.281_718_85 * c[1] + 0.629_978_7 * c[2]).cbrt();
    [
        0.210_454_26 * l + 0.793_617_8 * m - 0.004_072_047 * s,
        1.977_998_5 * l - 2.428_592_2 * m + 0.450_593_7 * s,
        0.025_904_037 * l + 0.782_771_77 * m - 0.808_675_77 * s,
    ]
}

fn from_oklab(c: Rgb) -> Rgb {
    let l = (c[0] + 0.396_337_78 * c[1] + 0.215_803_76 * c[2]).powi(3);
    let m = (c[0] - 0.105_561_346 * c[1] - 0.063_854_17 * c[2]).powi(3);
    let s = (c[0] - 0.089_484_18 * c[1] - 1.291_485_5 * c[2]).powi(3);
    [
        (4.076_741_7 * l - 3.307_711_6 * m + 0.230_969_94 * s).max(0.0),
        (-1.268_438 * l + 2.609_757_4 * m - 0.341_319_38 * s).max(0.0),
        (-0.004_196_086 * l - 0.703_418_6 * m + 1.707_614_7 * s).max(0.0),
    ]
}

/// Most quakes sit in the top 35 km, so depth is placed on a log scale:
/// 0 km -> 0.0, 70 km -> 0.42, 300 km -> 0.77, 700 km -> 1.0.
pub fn depth_pos(km: f32) -> f32 {
    ((1.0 + km.max(0.0) / 20.0).ln() / 36f32.ln()).min(1.0)
}

/// Shallow sand-gold, through orange and rose, to deep violet. Lightness falls
/// monotonically, so the ramp still reads as "deeper" without the hue.
/// The page's CSS legend uses the same stops.
pub const DEPTH_STOPS: [(f32, u32); 4] = [(0.0, 0xffd27a), (70.0, 0xff8a4c), (300.0, 0xe8467c), (700.0, 0x8b6cff)];

pub fn depth_color(km: f32) -> Rgb {
    let u = depth_pos(km);
    for w in DEPTH_STOPS.windows(2) {
        let (u0, u1) = (depth_pos(w[0].0), depth_pos(w[1].0));
        if u <= u1 {
            let t = ((u - u0) / (u1 - u0)).clamp(0.0, 1.0);
            let (a, b) = (oklab(hex(w[0].1)), oklab(hex(w[1].1)));
            return from_oklab([0, 1, 2].map(|i| a[i] + (b[i] - a[i]) * t));
        }
    }
    hex(DEPTH_STOPS[3].1)
}

pub fn mix(a: Rgb, b: Rgb, t: f32) -> Rgb {
    [0, 1, 2].map(|i| a[i] + (b[i] - a[i]) * t)
}

/// Linear RGB + alpha -> little-endian RGBA, the byte order canvas ImageData wants.
pub fn pack(c: Rgb, a: f32) -> u32 {
    let b = |v: f32| (to_srgb(v) * 255.0 + 0.5) as u32;
    (b(c[0])) | (b(c[1]) << 8) | (b(c[2]) << 16) | (((a.clamp(0.0, 1.0) * 255.0 + 0.5) as u32) << 24)
}
