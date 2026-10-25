//! Ring of Fire: a software renderer that draws three years of earthquakes on an
//! orthographic globe. No GPU, no dependencies; every pixel is computed here, then
//! either written to a PNG (the `poster` binary) or blitted to a canvas (wasm).

pub mod color;
pub mod data;
#[cfg(target_arch = "wasm32")]
mod wasm;

use color::{depth_color, hex, mix, pack, Rgb};
use data::World;

pub const DAY: f32 = 86400.0;
/// Splats are cut off this many standard deviations out (the kernel is 4% there).
const CUTOFF: f32 = 2.5;

#[derive(Clone, Copy, Default)]
pub struct Opts {
    pub coast: bool,
    pub plates: bool,
    /// Draw quakes on the far hemisphere, faintly, through the globe.
    pub xray: bool,
    /// Shock rings around big quakes; only meaningful while the replay runs.
    pub rings: bool,
}

/// Additive HDR light buffer plus the primitives that draw into it.
struct Light {
    w: usize,
    h: usize,
    buf: Vec<f32>,
    gauss: [f32; 257],
}

impl Light {
    #[inline]
    fn add(&mut self, x: i32, y: i32, c: Rgb, a: f32) {
        if x < 0 || y < 0 || x as usize >= self.w || y as usize >= self.h {
            return;
        }
        let i = (y as usize * self.w + x as usize) * 3;
        self.buf[i] += c[0] * a;
        self.buf[i + 1] += c[1] * a;
        self.buf[i + 2] += c[2] * a;
    }

    /// Gaussian splat with standard deviation `r` px, cut off at 2.5σ.
    fn splat(&mut self, sx: f32, sy: f32, r: f32, c: Rgb, a: f32) {
        let r = r.max(0.7);
        let ext = r * CUTOFF;
        let x0 = (sx - ext).round().max(0.0) as usize;
        let y0 = (sy - ext).round().max(0.0) as usize;
        let x1 = ((sx + ext).round().max(0.0) as usize).min(self.w);
        let y1 = ((sy + ext).round().max(0.0) as usize).min(self.h);
        if x0 >= x1 || y0 >= y1 {
            return;
        }
        let k = 256.0 / (CUTOFF * CUTOFF) / (r * r);
        let c = c.map(|v| v * a);
        for y in y0..y1 {
            let dy = y as f32 + 0.5 - sy;
            let row = &mut self.buf[(y * self.w + x0) * 3..(y * self.w + x1) * 3];
            for (j, px) in row.chunks_exact_mut(3).enumerate() {
                let dx = (x0 + j) as f32 + 0.5 - sx;
                let d = (dx * dx + dy * dy) * k;
                if d < 256.0 {
                    let g = self.gauss[d as usize];
                    px[0] += c[0] * g;
                    px[1] += c[1] * g;
                    px[2] += c[2] * g;
                }
            }
        }
    }

    /// Anti-aliased line (Xiaolin Wu), additive.
    fn line(&mut self, a: [f32; 2], b: [f32; 2], c: Rgb, alpha: f32) {
        let steep = (b[1] - a[1]).abs() > (b[0] - a[0]).abs();
        let (mut p, mut q) = if steep { ([a[1], a[0]], [b[1], b[0]]) } else { (a, b) };
        if p[0] > q[0] {
            std::mem::swap(&mut p, &mut q);
        }
        let span = q[0] - p[0];
        if span > 8000.0 {
            return;
        }
        let grad = if span < 1e-4 { 0.0 } else { (q[1] - p[1]) / span };
        for i in (p[0] - 0.5).round() as i32..=(q[0] - 0.5).round() as i32 {
            let y = p[1] + grad * (i as f32 + 0.5 - p[0]) - 0.5;
            let fy = y.floor();
            let f = y - fy;
            let (u, v) = (i, fy as i32);
            if steep {
                self.add(v, u, c, alpha * (1.0 - f));
                self.add(v + 1, u, c, alpha * f);
            } else {
                self.add(u, v, c, alpha * (1.0 - f));
                self.add(u, v + 1, c, alpha * f);
            }
        }
    }
}

fn unit(lat: f32, lon: f32) -> [f32; 3] {
    let (la, lo) = (lat.to_radians(), lon.to_radians());
    [la.cos() * lo.cos(), la.cos() * lo.sin(), la.sin()]
}

fn dot(a: [f32; 3], b: [f32; 3]) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

fn smoothstep(e0: f32, e1: f32, x: f32) -> f32 {
    let t = ((x - e0) / (e1 - e0)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// Screen-space size of a quake's core, in px, before the per-view scale.
pub fn quake_radius(mag: f32) -> f32 {
    1.05 * 1.33f32.powf(mag - 4.5)
}

pub struct Globe {
    pub world: World,
    pub w: usize,
    pub h: usize,
    /// Final RGBA pixels, ready for `ImageData` or a PNG encoder.
    pub px: Vec<u32>,
    light: Light,
    bg: Vec<u32>,
    bg_key: (usize, usize, u32),
    tone: Vec<u8>,
    unit: Vec<[f32; 3]>,
    tint: Vec<Rgb>,
    /// Per quake: core radius before view scale, and peak brightness.
    size: Vec<[f32; 2]>,
    /// Per quake from the last render: screen x, y and depth-into-screen z
    /// (z <= 0 means it was hidden or behind the globe).
    pub screen: Vec<[f32; 3]>,
    coast: Vec<Vec<[f32; 3]>>,
    plates: Vec<Vec<[f32; 3]>>,
    graticule: Vec<Vec<[f32; 3]>>,
    /// Longitude and latitude at the centre of the disc, degrees.
    pub yaw: f32,
    pub pitch: f32,
    pub zoom: f32,
    /// Seconds since the epoch; quakes after it are not drawn.
    pub cursor: f32,
    pub opts: Opts,
    pub highlight: Option<usize>,
}

impl Globe {
    pub fn new() -> Self {
        let world = data::load();
        let to_unit = |ls: &Vec<Vec<[f32; 2]>>| -> Vec<Vec<[f32; 3]>> {
            ls.iter().map(|l| l.iter().map(|p| unit(p[0], p[1])).collect()).collect()
        };
        let mut graticule = Vec::new();
        for lat in (-60..=60).step_by(30) {
            graticule.push((0..=180).map(|i| unit(lat as f32, i as f32 * 2.0)).collect());
        }
        for lon in (0..360).step_by(30) {
            graticule.push((0..=80).map(|i| unit(-80.0 + i as f32 * 2.0, lon as f32)).collect());
        }
        let mut gauss = [0.0; 257];
        for (i, g) in gauss.iter_mut().enumerate() {
            *g = (-(i as f32 * CUTOFF * CUTOFF / 256.0) / 2.0).exp();
        }
        // HDR light -> display: soft exponential shoulder, then sRGB encode.
        let tone = (0..4096)
            .map(|i| {
                let x = i as f32 / 4096.0 * 8.0;
                (color::to_srgb(1.0 - (-x).exp()) * 255.0 + 0.5) as u8
            })
            .collect();
        let n = world.quakes.len();
        Globe {
            unit: world.quakes.iter().map(|q| unit(q.lat, q.lon)).collect(),
            tint: world.quakes.iter().map(|q| depth_color(q.depth)).collect(),
            size: world.quakes.iter().map(|q| [quake_radius(q.mag), 0.55 * 1.25f32.powf(q.mag - 4.5)]).collect(),
            screen: vec![[0.0; 3]; n],
            coast: to_unit(&world.coast),
            plates: to_unit(&world.plates),
            cursor: world.quakes.last().map_or(0.0, |q| q.t as f32),
            world,
            graticule,
            w: 0,
            h: 0,
            px: Vec::new(),
            light: Light { w: 0, h: 0, buf: Vec::new(), gauss },
            bg: Vec::new(),
            bg_key: (0, 0, 0),
            tone,
            yaw: -170.0,
            pitch: 5.0,
            zoom: 1.0,
            opts: Opts { xray: true, ..Opts::default() },
            highlight: None,
        }
    }

    pub fn resize(&mut self, w: usize, h: usize) {
        self.w = w;
        self.h = h;
        self.px = vec![0; w * h];
        self.light = Light { w, h, buf: vec![0.0; w * h * 3], gauss: self.light.gauss };
    }

    pub fn radius(&self) -> f32 {
        0.46 * self.w.min(self.h) as f32 * self.zoom
    }

    /// Camera basis in ECEF: east, north, forward (towards the viewer).
    fn basis(&self) -> [[f32; 3]; 3] {
        let (p, l) = (self.pitch.to_radians(), self.yaw.to_radians());
        [
            [-l.sin(), l.cos(), 0.0],
            [-p.sin() * l.cos(), -p.sin() * l.sin(), p.cos()],
            [p.cos() * l.cos(), p.cos() * l.sin(), p.sin()],
        ]
    }

    /// Number of quakes at or before the cursor (the catalogue is time-sorted).
    pub fn visible(&self) -> usize {
        self.world.quakes.partition_point(|q| q.t as f32 <= self.cursor)
    }

    fn build_bg(&mut self) {
        let r = self.radius();
        let key = (self.w, self.h, r.to_bits());
        if key == self.bg_key {
            return;
        }
        self.bg_key = key;
        let (cx, cy) = (self.w as f32 / 2.0, self.h as f32 / 2.0);
        let space = hex(0x05070d);
        let (deep, lit) = (hex(0x080c17), hex(0x172338));
        let rim = hex(0x2a4f8f);
        let sun = {
            let l = [-0.45f32, 0.55, 0.70];
            let n = dot(l, l).sqrt();
            l.map(|v| v / n)
        };
        self.bg = vec![0; self.w * self.h];
        let srgb: Vec<u8> = (0..4096).map(|i| (color::to_srgb(i as f32 / 4095.0) * 255.0 + 0.5) as u8).collect();
        for y in 0..self.h {
            for x in 0..self.w {
                let nx = (x as f32 + 0.5 - cx) / r;
                let ny = -(y as f32 + 0.5 - cy) / r;
                let d = (nx * nx + ny * ny).sqrt();
                // Thin atmosphere outside the limb.
                let t = ((d - 1.0) / 0.05).max(0.0);
                let mut c = mix(space, rim, 0.22 * (-t * t).exp());
                let cover = ((1.0 - d) * r + 0.5).clamp(0.0, 1.0);
                if cover > 0.0 {
                    let z = (1.0 - (d * d).min(1.0)).sqrt();
                    let lam = dot([nx, ny, z], sun).max(0.0);
                    let lam = lam * lam.sqrt();
                    let fres = (1.0 - z).powi(3);
                    let ocean = mix(mix(deep, lit, lam), rim, 0.55 * fres);
                    c = mix(c, ocean, cover);
                }
                let b = |v: f32| srgb[((v * 4095.0) as usize).min(4095)] as u32;
                self.bg[y * self.w + x] = 0xff00_0000 | b(c[0]) | (b(c[1]) << 8) | (b(c[2]) << 16);
            }
        }
    }

    fn polylines(light: &mut Light, lines: &[Vec<[f32; 3]>], b: &[[f32; 3]; 3], o: (f32, f32, f32), c: Rgb, a: f32) {
        let (cx, cy, r) = o;
        for l in lines {
            let mut prev: Option<([f32; 2], f32)> = None;
            for &p in l {
                let z = dot(p, b[2]);
                let s = [cx + r * dot(p, b[0]), cy - r * dot(p, b[1])];
                if let Some((ps, pz)) = prev {
                    if z > 0.0 && pz > 0.0 {
                        light.line(ps, s, c, a * smoothstep(0.0, 0.25, z.min(pz)));
                    }
                }
                prev = Some((s, z));
            }
        }
    }

    /// Small circle of angular radius `theta` around unit vector `p`, on the sphere.
    fn ring(light: &mut Light, p: [f32; 3], theta: f32, b: &[[f32; 3]; 3], o: (f32, f32, f32), c: Rgb, a: f32) {
        let helper = if p[2].abs() < 0.9 { [0.0, 0.0, 1.0] } else { [1.0, 0.0, 0.0] };
        let cross = |u: [f32; 3], v: [f32; 3]| [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        let t1 = {
            let t = cross(p, helper);
            let n = dot(t, t).sqrt();
            t.map(|v| v / n)
        };
        let t2 = cross(p, t1);
        let (ct, st) = (theta.cos(), theta.sin());
        let pts: Vec<[f32; 3]> = (0..=64)
            .map(|i| {
                let f = i as f32 / 64.0 * std::f32::consts::TAU;
                [0, 1, 2].map(|k| ct * p[k] + st * (f.cos() * t1[k] + f.sin() * t2[k]))
            })
            .collect();
        Self::polylines(light, &[pts], b, o, c, a);
    }

    pub fn render(&mut self) {
        self.build_bg();
        self.light.buf.fill(0.0);
        let b = self.basis();
        let r = self.radius();
        let o = (self.w as f32 / 2.0, self.h as f32 / 2.0, r);
        let s = (r / 450.0).powf(0.6);
        let n = self.visible();
        let light = &mut self.light;

        Self::polylines(light, &self.graticule, &b, o, hex(0x1a2436), 0.55);
        if self.opts.coast {
            Self::polylines(light, &self.coast, &b, o, hex(0x5f7591), 0.55);
        }
        if self.opts.plates {
            Self::polylines(light, &self.plates, &b, o, hex(0x3fb8b0), 0.6);
        }

        let cool = hex(0x6f8fd8);
        for i in 0..n {
            let q = self.world.quakes[i];
            let p = self.unit[i];
            let z = dot(p, b[2]);
            let (sx, sy) = (o.0 + r * dot(p, b[0]), o.1 - r * dot(p, b[1]));
            self.screen[i] = [sx, sy, z];
            if z <= 0.0 && !self.opts.xray {
                continue;
            }
            let age = self.cursor - q.t as f32;
            // Fresh quakes flare, then settle to an ember over a few weeks.
            let flash = if age < 25.0 * DAY { 1.0 + 3.5 * (-age / (3.0 * DAY)).exp() } else { 1.0 };
            let [rad, a] = self.size[i];
            let rad = rad * s;
            let mut a = a * flash;
            if z > 0.0 {
                let c = self.tint[i];
                light.splat(sx, sy, rad, c, a);
                if q.mag >= 6.0 {
                    light.splat(sx, sy, rad * 3.2, c, a * 0.10);
                }
                if self.opts.rings && q.mag >= 6.0 {
                    let life = 5.0 * DAY * 1.6f32.powf(q.mag - 6.0);
                    let prog = age / life;
                    if prog < 1.0 {
                        let theta = s * (8.0 + 70.0 * prog) * 1.5f32.powf(q.mag - 6.0) / r;
                        Self::ring(light, p, theta, &b, o, mix(c, [1.0; 3], 0.4), 0.9 * (1.0 - prog).powi(2));
                    }
                }
            } else {
                a *= 0.11 * smoothstep(0.0, -0.3, z);
                light.splat(sx, sy, rad * 0.9, mix(self.tint[i], cool, 0.6), a);
            }
        }
        for i in n..self.screen.len() {
            self.screen[i][2] = -1.0;
        }
        if let Some(i) = self.highlight.filter(|&i| i < n) {
            let theta = (quake_radius(self.world.quakes[i].mag) * s * 3.0 + 7.0) / r;
            Self::ring(light, self.unit[i], theta, &b, o, [1.0, 0.97, 0.9], 1.2);
        }

        // Tonemap. Bright clusters bleed into white, the way an overexposed
        // photo of embers does.
        let tone = &self.tone;
        for ((out, l), &bg) in self.px.iter_mut().zip(self.light.buf.chunks_exact(3)).zip(&self.bg) {
            if l[0] + l[1] + l[2] <= 0.0 {
                *out = bg;
                continue;
            }
            let lum = 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
            let over = (lum - 0.9).max(0.0) * 0.5;
            let ch = |k: usize| {
                let v = tone[(((l[k] + over) * 512.0) as usize).min(4095)] as u32;
                (((bg >> (8 * k)) & 0xff) + v).min(255) << (8 * k)
            };
            *out = 0xff00_0000 | ch(0) | ch(1) | ch(2);
        }
    }

    /// Nearest drawn front-side quake to a screen point, favouring big ones.
    pub fn pick(&self, x: f32, y: f32, reach: f32) -> Option<usize> {
        let s = (self.radius() / 450.0).powf(0.6);
        let mut best = None;
        let mut best_score = f32::MAX;
        for i in 0..self.visible() {
            let [sx, sy, z] = self.screen[i];
            if z <= 0.0 {
                continue;
            }
            let mag = self.world.quakes[i].mag;
            let d = ((sx - x).powi(2) + (sy - y).powi(2)).sqrt();
            if d > reach + quake_radius(mag) * s * 2.0 {
                continue;
            }
            let score = d - (mag - 4.5) * 1.5 * s;
            if score < best_score {
                best_score = score;
                best = Some(i);
            }
        }
        best
    }

    /// Indices of the `n` largest quakes, at least `gap_days` apart in time.
    pub fn largest(&self, n: usize, gap_days: f32) -> Vec<usize> {
        let q = &self.world.quakes;
        let mut idx: Vec<usize> = (0..q.len()).collect();
        idx.sort_by(|&a, &b| q[b].mag.total_cmp(&q[a].mag).then(q[a].t.cmp(&q[b].t)));
        let mut out: Vec<usize> = Vec::new();
        for i in idx {
            if out.len() == n {
                break;
            }
            if out.iter().all(|&j| (q[i].t as f32 - q[j].t as f32).abs() >= gap_days * DAY) {
                out.push(i);
            }
        }
        out
    }
}

impl Default for Globe {
    fn default() -> Self {
        Self::new()
    }
}

/// Quakes-per-day strip under the globe, drawn into its own RGBA buffer.
pub struct Timeline {
    pub w: usize,
    pub h: usize,
    pub px: Vec<u32>,
    pub days: Vec<u32>,
    pub max: u32,
}

impl Timeline {
    pub fn new(world: &World) -> Self {
        let last = world.quakes.last().map_or(0, |q| q.t);
        let mut days = vec![0u32; (last / 86400 + 1) as usize];
        for q in &world.quakes {
            days[(q.t / 86400) as usize] += 1;
        }
        let max = days.iter().copied().max().unwrap_or(1);
        Timeline { w: 0, h: 0, px: Vec::new(), days, max }
    }

    pub fn resize(&mut self, w: usize, h: usize) {
        self.w = w;
        self.h = h;
        self.px = vec![0; w * h];
    }

    /// Height fraction for a daily count. Square-root scale, so ordinary days
    /// stay readable next to an aftershock storm.
    pub fn level(&self, count: f32) -> f32 {
        (count / self.max as f32).sqrt()
    }

    pub fn render(&mut self, cursor_day: f32, hover_day: f32) {
        let (w, h) = (self.w, self.h);
        if w == 0 || h == 0 {
            return;
        }
        self.px.fill(0);
        let n = self.days.len() as f32;
        let top = 2.0;
        let usable = h as f32 - top;
        let played = pack(hex(0xffb35c), 1.0);
        let future = pack(hex(0x3a4358), 1.0);
        let grid = pack(hex(0x8a96ad), 0.16);
        for g in [50.0, 200.0] {
            if g <= self.max as f32 {
                let y = (h as f32 - usable * self.level(g)).round() as usize;
                for x in (0..w).step_by(3) {
                    self.px[y.min(h - 1) * w + x] = grid;
                }
            }
        }
        for x in 0..w {
            let d0 = (x as f32 / w as f32 * n) as usize;
            let d1 = (((x + 1) as f32 / w as f32 * n).ceil() as usize).max(d0 + 1).min(self.days.len());
            let v = self.days[d0..d1].iter().copied().max().unwrap_or(0);
            let hh = usable * self.level(v as f32);
            let col = if (d0 as f32) <= cursor_day { played } else { future };
            let full = hh.floor() as usize;
            for k in 0..full.min(h) {
                self.px[(h - 1 - k) * w + x] = col;
            }
            let frac = hh - full as f32;
            if frac > 0.0 && full < h {
                let a = ((col >> 24) as f32 * frac) as u32;
                self.px[(h - 1 - full) * w + x] = (col & 0x00ff_ffff) | (a << 24);
            }
        }
        let mut vline = |day: f32, c: u32| {
            if day >= 0.0 {
                let x = ((day / n) * w as f32) as usize;
                for y in 0..h {
                    self.px[y * w + x.min(w - 1)] = c;
                }
            }
        };
        vline(hover_day, pack(hex(0xc9d3e6), 0.55));
        vline(cursor_day, pack(hex(0xfff2d6), 1.0));
    }
}
