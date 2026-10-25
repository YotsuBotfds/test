//! Instrument 01, the surface: an orthographic globe of the whole catalogue.
//! Other instruments reuse it (several independent instances can exist) and draw
//! their own marks on it through `overlays`.

use crate::color::{depth_color, hex, mix, Rgb};
use crate::data::{world, World};
use crate::gfx::{hash, smoothstep, v3, Frame};
use crate::DAY;

#[derive(Clone, Copy, Default)]
pub struct Opts {
    pub coast: bool,
    pub plates: bool,
    /// Draw quakes on the far hemisphere, faintly, through the globe.
    pub xray: bool,
    /// Shock rings around big quakes; only meaningful while the replay runs.
    pub rings: bool,
}

#[derive(Clone, Copy)]
pub enum Shape {
    /// Great-circle arc between two unit vectors.
    Arc([f32; 3], [f32; 3]),
    /// Small circle: centre and angular radius in radians.
    Circle([f32; 3], f32),
    /// A glowing dot of the given radius in px.
    Point([f32; 3], f32),
}

#[derive(Clone, Copy)]
pub struct Overlay {
    pub shape: Shape,
    pub color: Rgb,
    pub alpha: f32,
    /// Line width in px (arcs and circles).
    pub width: f32,
}

/// Screen-space size of a quake's core, in px, before the per-view scale.
pub fn quake_radius(mag: f32) -> f32 {
    1.05 * 1.33f32.powf(mag - 4.5)
}

pub struct Globe {
    pub world: &'static World,
    pub frame: Frame,
    bg_key: (usize, usize, u32),
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
    /// Multiplies every quake's brightness (instruments that draw their own
    /// marks on top dim the catalogue with this).
    pub quake_gain: f32,
    pub overlays: Vec<Overlay>,
}

impl Default for Globe {
    fn default() -> Self {
        Self::new()
    }
}

impl Globe {
    pub fn new() -> Self {
        let world = world();
        let to_unit = |ls: &Vec<Vec<[f32; 2]>>| -> Vec<Vec<[f32; 3]>> {
            ls.iter().map(|l| l.iter().map(|p| v3::from_latlon(p[0], p[1])).collect()).collect()
        };
        let mut graticule = Vec::new();
        for lat in (-60..=60).step_by(30) {
            graticule.push((0..=180).map(|i| v3::from_latlon(lat as f32, i as f32 * 2.0)).collect());
        }
        for lon in (0..360).step_by(30) {
            graticule.push((0..=80).map(|i| v3::from_latlon(-80.0 + i as f32 * 2.0, lon as f32)).collect());
        }
        let mut frame = Frame::new(1, 1);
        frame.bloom = 0.22;
        Globe {
            unit: world.quakes.iter().map(|q| v3::from_latlon(q.lat, q.lon)).collect(),
            tint: world.quakes.iter().map(|q| depth_color(q.depth)).collect(),
            size: world.quakes.iter().map(|q| [quake_radius(q.mag), 0.55 * 1.25f32.powf(q.mag - 4.5)]).collect(),
            screen: vec![[0.0, 0.0, -1.0]; world.quakes.len()],
            coast: to_unit(&world.coast),
            plates: to_unit(&world.plates),
            cursor: world.quakes.last().map_or(0.0, |q| q.t as f32),
            world,
            frame,
            bg_key: (0, 0, 0),
            graticule,
            yaw: -170.0,
            pitch: 5.0,
            zoom: 1.0,
            opts: Opts { xray: true, ..Opts::default() },
            highlight: None,
            quake_gain: 1.0,
            overlays: Vec::new(),
        }
    }

    pub fn resize(&mut self, w: usize, h: usize) {
        self.frame.resize(w, h);
        self.bg_key = (0, 0, 0);
    }

    pub fn radius(&self) -> f32 {
        0.46 * self.frame.w.min(self.frame.h) as f32 * self.zoom
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

    /// Screen position (x, y px) and facing (z > 0 is the near side) of a unit vector.
    pub fn project(&self, p: [f32; 3]) -> [f32; 3] {
        let b = self.basis();
        let r = self.radius();
        let (cx, cy) = (self.frame.w as f32 / 2.0, self.frame.h as f32 / 2.0);
        [cx + r * v3::dot(p, b[0]), cy - r * v3::dot(p, b[1]), v3::dot(p, b[2])]
    }

    /// The point on the near hemisphere under a screen pixel, if any.
    pub fn unproject(&self, x: f32, y: f32) -> Option<[f32; 3]> {
        let b = self.basis();
        let r = self.radius();
        let nx = (x - self.frame.w as f32 / 2.0) / r;
        let ny = -(y - self.frame.h as f32 / 2.0) / r;
        let d2 = nx * nx + ny * ny;
        if d2 > 1.0 {
            return None;
        }
        let nz = (1.0 - d2).sqrt();
        Some(v3::norm([0, 1, 2].map(|k| nx * b[0][k] + ny * b[1][k] + nz * b[2][k])))
    }

    /// Number of quakes at or before the cursor (the catalogue is time-sorted).
    pub fn visible(&self) -> usize {
        self.world.quakes.partition_point(|q| q.t as f32 <= self.cursor)
    }

    fn build_bg(&mut self) {
        let r = self.radius();
        let key = (self.frame.w, self.frame.h, r.to_bits());
        if key == self.bg_key {
            return;
        }
        self.bg_key = key;
        let (w, h) = (self.frame.w, self.frame.h);
        let (cx, cy) = (w as f32 / 2.0, h as f32 / 2.0);
        let space = hex(0x04060c);
        let (deep, lit) = (hex(0x070b16), hex(0x182540));
        let rim = hex(0x2a5aa8);
        let haze = hex(0x1b3f86);
        let sun = v3::norm([-0.45, 0.55, 0.70]);
        // Half-vector for a faint specular glint, viewer along +z.
        let half = v3::norm(v3::add(sun, [0.0, 0.0, 1.0]));
        let star_density = 0.0016;
        self.frame.paint_bg(|x, y| {
            let nx = (x as f32 + 0.5 - cx) / r;
            let ny = -(y as f32 + 0.5 - cy) / r;
            let d = (nx * nx + ny * ny).sqrt();
            let mut c = space;
            // Stars: sparse single pixels, a few warm, a few blue.
            let hs = hash((x as u32).wrapping_mul(7919) ^ (y as u32).wrapping_mul(104_729));
            if hs < star_density {
                let k = hash(hs.to_bits()).powi(3) * 0.35 + 0.02;
                let tint = match (hs * 1e5) as u32 % 3 {
                    0 => [1.0, 0.85, 0.7],
                    1 => [0.75, 0.85, 1.0],
                    _ => [1.0, 1.0, 1.0],
                };
                c = v3::add(c, v3::scale(tint, k));
            }
            // Atmosphere: a tight bright rim plus a wide faint haze.
            if d > 1.0 {
                let t1 = (d - 1.0) / 0.018;
                let t2 = (d - 1.0) / 0.11;
                c = v3::add(c, v3::scale(rim, 0.30 * (-t1 * t1).exp()));
                c = v3::add(c, v3::scale(haze, 0.10 * (-t2).exp()));
            }
            let cover = ((1.0 - d) * r + 0.5).clamp(0.0, 1.0);
            if cover > 0.0 {
                let z = (1.0 - (d * d).min(1.0)).sqrt();
                let n = [nx, ny, z];
                let lam = v3::dot(n, sun).max(0.0);
                let lam = lam * lam.sqrt();
                let fres = (1.0 - z).powi(3);
                let spec = v3::dot(n, half).max(0.0).powi(80) * 0.02;
                let ocean = mix(mix(deep, lit, lam), rim, 0.55 * fres);
                let ocean = v3::add(ocean, [spec * 0.8, spec * 0.9, spec]);
                c = mix(c, ocean, cover);
            }
            c
        });
    }

    fn polylines(f: &mut Frame, lines: &[Vec<[f32; 3]>], b: &[[f32; 3]; 3], o: (f32, f32, f32), c: Rgb, a: f32, width: f32) {
        let (cx, cy, r) = o;
        for l in lines {
            let mut prev: Option<([f32; 2], f32)> = None;
            for &p in l {
                let z = v3::dot(p, b[2]);
                let s = [cx + r * v3::dot(p, b[0]), cy - r * v3::dot(p, b[1])];
                if let Some((ps, pz)) = prev {
                    if z > 0.0 && pz > 0.0 {
                        let fade = a * smoothstep(0.0, 0.25, z.min(pz));
                        if width > 1.0 {
                            f.thick_line(ps, s, width / 2.0, c, fade);
                        } else {
                            f.line(ps, s, c, fade);
                        }
                    }
                }
                prev = Some((s, z));
            }
        }
    }

    /// Points along a small circle of angular radius `theta` around `p`.
    fn small_circle(p: [f32; 3], theta: f32, n: usize) -> Vec<[f32; 3]> {
        let helper = if p[2].abs() < 0.9 { [0.0, 0.0, 1.0] } else { [1.0, 0.0, 0.0] };
        let t1 = v3::norm(v3::cross(p, helper));
        let t2 = v3::cross(p, t1);
        let (ct, st) = (theta.cos(), theta.sin());
        (0..=n)
            .map(|i| {
                let f = i as f32 / n as f32 * std::f32::consts::TAU;
                [0, 1, 2].map(|k| ct * p[k] + st * (f.cos() * t1[k] + f.sin() * t2[k]))
            })
            .collect()
    }

    pub fn render(&mut self) {
        self.build_bg();
        self.frame.clear();
        let b = self.basis();
        let r = self.radius();
        let o = (self.frame.w as f32 / 2.0, self.frame.h as f32 / 2.0, r);
        let s = (r / 450.0).powf(0.6);
        let n = self.visible();
        let f = &mut self.frame;

        Self::polylines(f, &self.graticule, &b, o, hex(0x1a2436), 0.5, 1.0);
        if self.opts.coast {
            Self::polylines(f, &self.coast, &b, o, hex(0x6a83a3), 0.6, 1.0);
        }
        if self.opts.plates {
            Self::polylines(f, &self.plates, &b, o, hex(0x3fb8b0), 0.65, 1.0);
        }

        let cool = hex(0x6f8fd8);
        let gain = self.quake_gain;
        for i in 0..n {
            let q = self.world.quakes[i];
            let p = self.unit[i];
            let z = v3::dot(p, b[2]);
            let (sx, sy) = (o.0 + r * v3::dot(p, b[0]), o.1 - r * v3::dot(p, b[1]));
            self.screen[i] = [sx, sy, z];
            if gain <= 0.0 || (z <= 0.0 && !self.opts.xray) {
                continue;
            }
            let age = self.cursor - q.t as f32;
            // Fresh quakes flare, then settle to an ember over a few weeks.
            let flash = if age < 25.0 * DAY { 1.0 + 3.5 * (-age / (3.0 * DAY)).exp() } else { 1.0 };
            let [rad, a] = self.size[i];
            let rad = rad * s;
            let mut a = a * flash * gain;
            if z > 0.0 {
                let c = self.tint[i];
                f.splat(sx, sy, rad, c, a);
                if q.mag >= 6.0 {
                    f.splat(sx, sy, rad * 3.2, c, a * 0.10);
                }
                if self.opts.rings && q.mag >= 6.0 {
                    let life = 5.0 * DAY * 1.6f32.powf(q.mag - 6.0);
                    let prog = age / life;
                    if prog < 1.0 {
                        let theta = s * (8.0 + 70.0 * prog) * 1.5f32.powf(q.mag - 6.0) / r;
                        let ring = Self::small_circle(p, theta, 64);
                        Self::polylines(f, &[ring], &b, o, mix(c, [1.0; 3], 0.4), 0.9 * (1.0 - prog).powi(2), 1.0);
                    }
                }
            } else {
                a *= 0.11 * smoothstep(0.0, -0.3, z);
                f.splat(sx, sy, rad * 0.9, mix(self.tint[i], cool, 0.6), a);
            }
        }
        for sc in &mut self.screen[n..] {
            sc[2] = -1.0;
        }

        for ov in &self.overlays {
            match ov.shape {
                Shape::Arc(a, c) => {
                    let steps = ((v3::angle(a, c).to_degrees()) as usize + 2).min(400);
                    let pts: Vec<[f32; 3]> = (0..=steps).map(|k| v3::slerp(a, c, k as f32 / steps as f32)).collect();
                    Self::polylines(f, &[pts], &b, o, ov.color, ov.alpha, ov.width);
                }
                Shape::Circle(c, theta) => {
                    let ring = Self::small_circle(c, theta, 96);
                    Self::polylines(f, &[ring], &b, o, ov.color, ov.alpha, ov.width);
                }
                Shape::Point(p, size) => {
                    let z = v3::dot(p, b[2]);
                    if z > 0.0 {
                        let (sx, sy) = (o.0 + r * v3::dot(p, b[0]), o.1 - r * v3::dot(p, b[1]));
                        f.splat(sx, sy, size, ov.color, ov.alpha * smoothstep(0.0, 0.2, z));
                    }
                }
            }
        }

        if let Some(i) = self.highlight.filter(|&i| i < n) {
            let theta = (quake_radius(self.world.quakes[i].mag) * s * 3.0 + 7.0) / r;
            let ring = Self::small_circle(self.unit[i], theta, 64);
            Self::polylines(f, &[ring], &b, o, [1.0, 0.97, 0.9], 1.2, 1.0);
        }
        f.finish();
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
}
