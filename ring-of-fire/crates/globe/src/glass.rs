//! Instrument 02 Interior, "Glass Earth": a perspective view into a see-through
//! planet with every quake at its depth, so subducting slabs hang into the mantle
//! as glowing curtains.
//!
//! - The shell is clear glass (fresnel rim, faint absorption along each ray).
//! - The core-mantle boundary (r = 3480 km) is an opaque, molten, limb-darkened
//!   sphere; quakes behind it are hidden with an exact ray-sphere test.
//! - An optional cut removes a region bounded by planes through the centre (a
//!   quarter wedge for the whole planet, a half for a dip section through a slab).
//!   The cut faces are shaded as a cross-section of the mantle and are frosted:
//!   quakes close behind a face show through, distant ones fade.
//! - Depths are stretched near the surface by a factor `k` with a Möbius map that
//!   keeps the core-mantle boundary at its true radius (see [`stretch`]).

mod cam;
mod post;
mod shade;

pub use cam::{Cam, Pose};
pub use shade::{Hit, View};

use crate::color::{depth_color, depth_pos, hex, mix, Rgb};
use crate::data::{world, World};
use crate::gfx::{hash, smoothstep, v3, v3::V, Frame, CUTOFF};
use crate::globe::quake_radius;
use crate::DAY;
use post::{Post, TILE};
use shade::{churn, fexp, fpow, Palette};

pub const R_KM: f32 = 6371.0;
/// Depth of the core-mantle boundary, km.
pub const CMB_KM: f32 = 2891.0;
/// Core-mantle boundary and inner-core boundary radii, in Earth radii.
pub const RC: f32 = 3480.0 / R_KM;
pub const RIC: f32 = 1221.0 / R_KM;
/// Vertical field of view (on the shorter side of the canvas), degrees.
pub const FOV: f32 = 32.0;
/// Depths ringed on the cut faces: the two mantle discontinuities...
pub const RINGS_KM: [f32; 2] = [410.0, 660.0];
/// ...and fainter guides above them.
pub const GUIDES_KM: [f32; 3] = [100.0, 200.0, 300.0];
/// Label slots: 100, 200, 300, 410 and 660 km, the core-mantle boundary, the inner core.
pub const LABELS: usize = 7;

/// Displayed depth (km) for a true depth `km` with exaggeration `k`.
///
/// `k * d / (1 + (k - 1) d / 2891)`: slope `k` at the surface, exactly the true
/// depth when `k = 1`, and it maps the core-mantle boundary onto itself for every
/// `k`, so stretched slabs never reach the core. At k = 4, 100 km shows as 362 km,
/// 410 km as 1,150 km and 670 km as 1,600 km.
pub fn stretch(k: f32, km: f32) -> f32 {
    k * km / (1.0 + (k - 1.0) * km / CMB_KM)
}

/// Inverse of [`stretch`]: true depth for a displayed depth.
pub fn unstretch(k: f32, shown: f32) -> f32 {
    shown / (k - (k - 1.0) * shown / CMB_KM)
}

/// Radius (Earth radii) at which a quake `km` deep is drawn.
pub fn radius_at(k: f32, km: f32) -> f32 {
    1.0 - stretch(k, km) / R_KM
}

/// A subduction zone worth flying to: a lat/lon box (lon0 > lon1 wraps the
/// antimeridian) and the place along it where the dip section is cut.
pub struct Region {
    pub name: &'static str,
    pub lat: [f32; 2],
    pub lon: [f32; 2],
    /// Section centre, lat and lon.
    pub at: [f32; 2],
    /// Look along the trench from the end where the slab dips to the right (1)
    /// or to the left (-1); picked so the busier end is behind the cut.
    pub look: f32,
}

pub const REGIONS: [Region; 5] = [
    Region { name: "Tonga–Kermadec", lat: [-38.0, -14.0], lon: [172.0, -172.0], at: [-21.0, -176.0], look: 1.0 },
    // From the Japan end: the Kamchatka aftershocks of July 2025 then sit behind the cut.
    Region { name: "Japan–Kuril–Kamchatka", lat: [35.0, 60.0], lon: [128.0, 166.0], at: [44.0, 147.0], look: -1.0 },
    Region { name: "Central Andes", lat: [-30.0, -12.0], lon: [-76.0, -60.0], at: [-22.0, -68.0], look: 1.0 },
    Region { name: "Izu–Bonin–Mariana", lat: [10.0, 35.0], lon: [136.0, 149.0], at: [28.0, 140.0], look: 1.0 },
    Region { name: "Hindu Kush", lat: [35.0, 38.5], lon: [68.0, 73.0], at: [36.5, 70.8], look: 1.0 },
];

/// Quakes within this distance (km) of a section centre set the local strike.
const LOCAL_KM: f32 = 700.0;
/// Half-width (km along strike) of the swath whose dip is reported.
pub const SWATH_KM: f32 = 150.0;

impl Region {
    pub fn contains(&self, lat: f32, lon: f32) -> bool {
        let inlon = if self.lon[0] > self.lon[1] {
            lon >= self.lon[0] || lon <= self.lon[1]
        } else {
            lon >= self.lon[0] && lon <= self.lon[1]
        };
        lat >= self.lat[0] && lat <= self.lat[1] && inlon
    }
}

/// Geometry and counts of one region's seismicity, computed from the catalogue.
pub struct Slab {
    pub name: &'static str,
    /// Quakes in the region (catalogue indices).
    pub idx: Vec<u32>,
    /// Section centre, and unit tangents there: along the trench, and across it
    /// towards increasing depth (the way the slab dips).
    pub centre: V,
    pub strike: V,
    pub dip: V,
    pub deep300: usize,
    pub deepest: usize,
    /// Dip of the quakes below 70 km within `SWATH_KM` of the section (principal
    /// axis of depth against distance across the trench), degrees.
    pub dip_deg: f32,
    /// Compass azimuths of the strike and the dip direction, degrees.
    pub strike_az: f32,
    pub dip_az: f32,
}

fn azimuth(at: V, dir: V) -> f32 {
    let east = v3::norm(v3::cross([0.0, 0.0, 1.0], at));
    let north = v3::cross(at, east);
    v3::dot(dir, east).atan2(v3::dot(dir, north)).to_degrees().rem_euclid(360.0)
}

/// Angle (degrees from horizontal) of the principal axis of a 2D point cloud.
fn principal_dip(pts: &[[f32; 2]]) -> f32 {
    if pts.len() < 12 {
        return f32::NAN;
    }
    let n = pts.len() as f32;
    let mx = pts.iter().map(|p| p[0]).sum::<f32>() / n;
    let my = pts.iter().map(|p| p[1]).sum::<f32>() / n;
    let (mut sxx, mut sxy, mut syy) = (0.0, 0.0, 0.0);
    for p in pts {
        let (x, y) = (p[0] - mx, p[1] - my);
        sxx += x * x;
        sxy += x * y;
        syy += y * y;
    }
    let th = 0.5 * (2.0 * sxy).atan2(sxx - syy);
    th.sin().abs().atan2(th.cos().abs()).to_degrees()
}

/// Dip of a slab in one section: the principal axis of depth against distance
/// across the trench, for the quakes below 70 km (at or before `cursor`) within
/// `half_km` of the plane through the centre with normal `n`. NaN if fewer than 12.
pub fn section_dip(world: &World, idx: &[u32], n: V, dip: V, half_km: f32, cursor: f32) -> f32 {
    let pts: Vec<[f32; 2]> = idx
        .iter()
        .filter_map(|&i| {
            let q = world.quakes[i as usize];
            let u = v3::from_latlon(q.lat, q.lon);
            (q.depth >= 70.0 && q.t as f32 <= cursor && (v3::dot(u, n) * R_KM).abs() < half_km).then(|| [v3::dot(u, dip) * R_KM, q.depth])
        })
        .collect();
    principal_dip(&pts)
}

impl Slab {
    pub fn new(world: &World, r: &Region) -> Self {
        let q = &world.quakes;
        let idx: Vec<u32> = (0..q.len() as u32).filter(|&i| r.contains(q[i as usize].lat, q[i as usize].lon)).collect();
        let centre = v3::from_latlon(r.at[0], r.at[1]);
        let east = v3::norm(v3::cross([0.0, 0.0, 1.0], centre));
        let north = v3::cross(centre, east);
        // Epicentres near the section centre, in km on the tangent plane.
        let local: Vec<(u32, [f32; 2])> = idx
            .iter()
            .filter_map(|&i| {
                let u = v3::from_latlon(q[i as usize].lat, q[i as usize].lon);
                (v3::angle(u, centre) * R_KM < LOCAL_KM).then(|| (i, [v3::dot(u, east) * R_KM, v3::dot(u, north) * R_KM]))
            })
            .collect();
        // Their principal horizontal axis is the strike of the trench.
        let n = local.len().max(1) as f32;
        let (mx, my) = (local.iter().map(|p| p.1[0]).sum::<f32>() / n, local.iter().map(|p| p.1[1]).sum::<f32>() / n);
        let (mut sxx, mut sxy, mut syy) = (0.0f32, 0.0f32, 0.0f32);
        for (_, p) in &local {
            let (x, y) = (p[0] - mx, p[1] - my);
            sxx += x * x;
            sxy += x * y;
            syy += y * y;
        }
        let th = 0.5 * (2.0 * sxy).atan2(sxx - syy);
        let (se, sn) = (th.cos(), th.sin());
        // Across the strike, signed so quakes get deeper that way.
        let (mut ae, mut an) = (-sn, se);
        let deep: Vec<(f32, f32, f32)> = local
            .iter()
            .filter(|(i, _)| q[*i as usize].depth >= 70.0)
            .map(|(i, p)| (p[0] * ae + p[1] * an, p[0] * se + p[1] * sn, q[*i as usize].depth))
            .collect();
        let m = deep.len().max(1) as f32;
        let (ma, md) = (deep.iter().map(|p| p.0).sum::<f32>() / m, deep.iter().map(|p| p.2).sum::<f32>() / m);
        let flip = deep.iter().map(|p| (p.0 - ma) * (p.2 - md)).sum::<f32>() < 0.0;
        if flip {
            ae = -ae;
            an = -an;
        }
        let dip = v3::norm(v3::add(v3::scale(east, ae), v3::scale(north, an)));
        // Strike oriented so the slab dips to the right when looking along it.
        let strike = v3::cross(dip, centre);
        let deepest = idx.iter().copied().max_by(|&a, &b| q[a as usize].depth.total_cmp(&q[b as usize].depth)).unwrap_or(0) as usize;
        Slab {
            name: r.name,
            deep300: idx.iter().filter(|&&i| q[i as usize].depth >= 300.0).count(),
            deepest,
            dip_deg: section_dip(world, &idx, strike, dip, SWATH_KM, f32::MAX),
            strike_az: azimuth(centre, strike),
            dip_az: azimuth(centre, dip),
            idx,
            centre,
            strike,
            dip,
        }
    }
}

/// The cut: the wedge of `2 * half` radians around `centre` (a unit vector at
/// right angles to `hinge`), hinged on the axis `hinge` through the centre of
/// the Earth. With `half` = 90 degrees it is half the planet, the side of the
/// plane through the hinge that `centre` points to: a single cross-section.
/// Every cut being a wedge lets a flight turn and open it smoothly.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Cut {
    pub hinge: V,
    pub centre: V,
    pub half: f32,
}

impl Cut {
    pub fn lerp(a: &Cut, b: &Cut, t: f32) -> Cut {
        let hinge = cam::slerp(a.hinge, b.hinge, t);
        let c = cam::slerp(a.centre, b.centre, t);
        let c = v3::sub(c, v3::scale(hinge, v3::dot(c, hinge)));
        let centre = if v3::len(c) < 1e-4 { cam::perp(hinge) } else { v3::norm(c) };
        Cut { hinge, centre, half: a.half + (b.half - a.half) * t }
    }

    /// Whether this cut is a single plane.
    pub fn is_slice(&self) -> bool {
        self.half > std::f32::consts::FRAC_PI_2 - 1e-3
    }
}

#[derive(Clone, Copy, Default)]
pub struct Stats {
    pub shown: usize,
    pub deep300: usize,
    pub deepest: Option<usize>,
}

pub const COAST: u32 = 1;
pub const PLATES: u32 = 2;
pub const GRATICULE: u32 = 4;

/// Longitude at the middle of the whole-planet wedge: the western Pacific, where
/// most of the deep slabs are.
pub const HOME_LON: f32 = 172.0;

pub struct Glass {
    pub world: &'static World,
    pub frame: Frame,
    /// Quarter-resolution copy of the glowing things, for bloom.
    glow: Frame,
    post: Post,
    pal: Palette,
    pub cam: Cam,
    pub exag: f32,
    /// Seconds since the epoch; later quakes are not drawn.
    pub cursor: f32,
    /// Animation clock (s) for the churning core.
    pub time: f32,
    pub cut_on: bool,
    pub cut: Cut,
    /// A cut changing shape during a flight: from, to.
    cut_anim: Option<(Cut, Cut)>,
    /// Turns the cut about its hinge, radians.
    pub sweep: f32,
    pub flags: u32,
    pub selected: Option<usize>,
    pub hover: Option<usize>,
    /// Brightness of the quakes.
    pub gain: f32,
    /// 0 whole planet, 1.. the slab in `slabs[preset - 1]`.
    pub preset: usize,
    unit: Vec<V>,
    pos: Vec<V>,
    tint: Vec<Rgb>,
    /// Per quake: core radius (px, before the view scale) and peak brightness.
    size: Vec<[f32; 2]>,
    /// Per quake: 1 inside the current preset's region, less outside it.
    focus: Vec<f32>,
    /// Per quake from the last render: screen x, y and drawn weight (0 = not drawn).
    pub screen: Vec<[f32; 3]>,
    pub stats: Stats,
    stars: Vec<(V, f32, Rgb)>,
    coast: Vec<Vec<V>>,
    plates: Vec<Vec<V>>,
    graticule: Vec<Vec<V>>,
    pub slabs: Vec<Slab>,
    /// The background, shaded at half resolution (upsampled in `Post::compose`),
    /// and what each texel's ray met (for adaptive sampling).
    half: Vec<u32>,
    cls: Vec<u8>,
    hw: usize,
    hh: usize,
    /// Which 16x16 tiles of `frame.light` were drawn into this frame.
    tiles: Vec<u8>,
    tw: usize,
    th: usize,
    gauss: Vec<f32>,
    /// Stars of this frame: x, y, brightness, tint (added after the tonemap).
    star_px: Vec<(f32, f32, f32, Rgb)>,
    /// This frame's splats, sorted by screen row before drawing so the writes
    /// into the light buffer stay in cache; and the counting-sort buckets.
    splats: Vec<Splat>,
    sorted: Vec<Splat>,
    buckets: Vec<u32>,
    bg_key: Vec<u32>,
    bg_time: f32,
    /// Label anchors on the cut faces (x, y, visible), in `LABELS` order.
    pub labels: [[f32; 3]; LABELS],
}

impl Default for Glass {
    fn default() -> Self {
        Self::new()
    }
}

impl Glass {
    pub fn new() -> Self {
        let world = world();
        let to_unit = |ls: &Vec<Vec<[f32; 2]>>| -> Vec<Vec<V>> {
            ls.iter().map(|l| l.iter().map(|p| v3::from_latlon(p[0], p[1])).collect()).collect()
        };
        let mut graticule = Vec::new();
        for lat in (-60..=60).step_by(30) {
            graticule.push((0..=120).map(|i| v3::from_latlon(lat as f32, i as f32 * 3.0)).collect());
        }
        for lon in (0..360).step_by(30) {
            graticule.push((0..=60).map(|i| v3::from_latlon(-90.0 + i as f32 * 3.0, lon as f32)).collect());
        }
        let stars = (0..1600u32)
            .map(|i| {
                let u = hash(i.wrapping_mul(2_654_435_761)) * 2.0 - 1.0;
                let ph = hash(i.wrapping_mul(40_503).wrapping_add(17)) * std::f32::consts::TAU;
                let s = (1.0 - u * u).sqrt();
                let dir = [s * ph.cos(), s * ph.sin(), u];
                let k = hash(i ^ 0x9e37_79b9);
                let b = 0.012 + 0.3 * k.powi(7);
                let tint = match i % 3 {
                    0 => [1.0, 0.86, 0.72],
                    1 => [0.75, 0.85, 1.0],
                    _ => [1.0, 1.0, 1.0],
                };
                (dir, b, tint)
            })
            .collect();
        let unit: Vec<V> = world.quakes.iter().map(|q| v3::from_latlon(q.lat, q.lon)).collect();
        let slabs = REGIONS.iter().map(|r| Slab::new(world, r)).collect();
        let mut frame = Frame::new(1, 1);
        frame.bloom = 0.3;
        let n = world.quakes.len();
        let mut g = Glass {
            world,
            frame,
            glow: Frame::new(1, 1),
            post: Post::default(),
            pal: Palette::new(),
            cam: Cam::new(Pose { target: [0.0; 3], axis: [0.0, 0.0, 1.0], back: [1.0, 0.0, 0.0], dist: 4.3 }),
            exag: 4.0,
            cursor: world.quakes.last().map_or(0.0, |q| q.t as f32),
            time: 0.0,
            cut_on: true,
            cut: Cut { hinge: [0.0, 0.0, 1.0], centre: [1.0, 0.0, 0.0], half: 0.25 * std::f32::consts::PI },
            cut_anim: None,
            sweep: 0.0,
            flags: GRATICULE,
            selected: None,
            hover: None,
            gain: 1.0,
            preset: 0,
            pos: unit.clone(),
            tint: world.quakes.iter().map(|q| depth_color(q.depth)).collect(),
            // Deep quakes are drawn a little brighter: their colours are darker by
            // design, and they are what this view is about.
            size: world
                .quakes
                .iter()
                .map(|q| [quake_radius(q.mag), 0.4 * 1.25f32.powf(q.mag - 4.5) * (0.6 + 0.8 * depth_pos(q.depth))])
                .collect(),
            focus: vec![1.0; n],
            screen: vec![[0.0; 3]; n],
            stats: Stats::default(),
            stars,
            coast: to_unit(&world.coast),
            plates: to_unit(&world.plates),
            graticule,
            slabs,
            half: Vec::new(),
            cls: Vec::new(),
            hw: 0,
            hh: 0,
            tiles: Vec::new(),
            tw: 0,
            th: 0,
            gauss: (0..257).map(|i| (-(i as f32 * CUTOFF * CUTOFF / 256.0) / 2.0).exp()).collect(),
            star_px: Vec::new(),
            splats: Vec::new(),
            sorted: Vec::new(),
            buckets: Vec::new(),
            bg_key: Vec::new(),
            bg_time: 0.0,
            labels: [[0.0; 3]; LABELS],
            unit,
        };
        g.set_exag(4.0);
        g.preset(0, 0.0);
        g
    }

    pub fn resize(&mut self, w: usize, h: usize) {
        self.frame.resize(w, h);
        let (w, h) = (self.frame.w, self.frame.h);
        self.post.resize(w, h);
        let (qw, qh) = self.post.quarter();
        self.glow.resize(qw, qh);
        self.hw = w.div_ceil(2);
        self.hh = h.div_ceil(2);
        self.half = vec![0xff00_0000; self.hw * self.hh];
        self.cls = vec![0; self.hw * self.hh];
        self.tw = w.div_ceil(TILE);
        self.th = h.div_ceil(TILE);
        self.tiles = vec![0; self.tw * self.th];
        self.bg_key.clear();
    }

    /// Focal length in px for the current canvas.
    pub fn focal(&self) -> f32 {
        0.5 * self.frame.w.min(self.frame.h) as f32 / (FOV.to_radians() * 0.5).tan()
    }

    /// Distance at which the whole planet fills ~84% of the shorter side.
    pub fn fit_dist() -> f32 {
        let t = 0.84 * (FOV.to_radians() * 0.5).tan();
        1.0 / t.atan().sin()
    }

    pub fn set_exag(&mut self, k: f32) {
        self.exag = k.clamp(1.0, 10.0);
        let k = self.exag;
        for (p, (u, q)) in self.pos.iter_mut().zip(self.unit.iter().zip(&self.world.quakes)) {
            *p = v3::scale(*u, radius_at(k, q.depth));
        }
    }

    /// Planes of the removed region for the current cut and sweep.
    pub fn planes(&self) -> ([V; 2], usize) {
        if !self.cut_on {
            return ([[0.0; 3]; 2], 0);
        }
        let Cut { hinge, centre, half } = self.cut;
        let c = cam::rotate(centre, hinge, self.sweep);
        if self.cut.is_slice() {
            return ([c, [0.0; 3]], 1);
        }
        let f1 = cam::rotate(c, hinge, -half);
        let f2 = cam::rotate(c, hinge, half);
        ([v3::norm(v3::cross(hinge, f1)), v3::norm(v3::scale(v3::cross(hinge, f2), -1.0))], 2)
    }

    pub fn view(&self) -> View {
        let pose = self.cam.pose;
        let (planes, np) = self.planes();
        View::new(self.frame.w, self.frame.h, pose.eye(), pose.basis(), self.focal(), planes, np)
    }

    /// Pose and cut for preset `k`: 0 is the whole planet, 1.. the slabs in `REGIONS`.
    pub fn preset_pose(&self, k: usize) -> (Pose, Cut) {
        if k == 0 || k > self.slabs.len() {
            // Look into the wedge from one side, so one face is a backdrop for the
            // western Pacific slabs and the other is seen edge-on.
            let back = v3::from_latlon(12.0, HOME_LON + 30.0);
            let pose = Pose { target: [0.0; 3], axis: [0.0, 0.0, 1.0], back, dist: Self::fit_dist() };
            let cut = Cut { hinge: [0.0, 0.0, 1.0], centre: v3::from_latlon(0.0, HOME_LON), half: 0.25 * std::f32::consts::PI };
            return (pose, cut);
        }
        let s = &self.slabs[k - 1];
        // Pivot on the middle of the slab near the section: the mean position of
        // the quakes below 70 km within 300 km of it along the trench, raised a
        // little so the surface stays in the picture.
        let mut c = [0.0; 3];
        let mut n = 0.0;
        for &i in &s.idx {
            let u = self.unit[i as usize];
            if self.world.quakes[i as usize].depth >= 70.0 && (v3::dot(u, s.strike) * R_KM).abs() < 300.0 && v3::dot(u, s.centre) > 0.9 {
                c = v3::add(c, self.pos[i as usize]);
                n += 1.0;
            }
        }
        let mid = if n > 0.0 { v3::scale(c, 1.0 / n) } else { v3::scale(s.centre, radius_at(self.exag, 100.0)) };
        let up = v3::norm(mid);
        let target = v3::scale(up, (v3::len(mid) + 1.0) * 0.5);
        let look = REGIONS[k - 1].look;
        let strike = v3::scale(v3::norm(v3::sub(s.strike, v3::scale(up, v3::dot(s.strike, up)))), look);
        let dip = v3::scale(v3::cross(up, strike), look);
        // Frame the dip section: the spread across the view of the quakes within
        // 500 km of it along the trench.
        let mut ds: Vec<f32> = s
            .idx
            .iter()
            .filter(|&&i| (v3::dot(self.unit[i as usize], s.strike) * R_KM).abs() < 500.0)
            .map(|&i| {
                let d = v3::sub(self.pos[i as usize], target);
                let along = v3::dot(d, strike);
                v3::len(v3::sub(d, v3::scale(strike, along)))
            })
            .collect();
        ds.sort_by(f32::total_cmp);
        let r90 = ds.get(ds.len() * 9 / 10).copied().unwrap_or(0.1).max(0.07);
        let dist = (r90 * 1.3 / (FOV.to_radians() * 0.5).tan()).clamp(0.5, 2.6);
        // Look along the trench, a little from the ocean side and from above.
        let (el, az) = (12f32.to_radians(), 15f32.to_radians());
        let back = v3::norm(v3::add(
            v3::add(v3::scale(strike, el.cos() * az.cos()), v3::scale(dip, -el.cos() * az.sin())),
            v3::scale(up, el.sin()),
        ));
        let pose = Pose { target, axis: up, back, dist };
        // The slice is the slab's own section plane (through the centre, along the dip).
        let cut = Cut { hinge: s.dip, centre: v3::scale(s.strike, look), half: std::f32::consts::FRAC_PI_2 };
        (pose, cut)
    }

    /// Fly to a preset over `dur` seconds (0 jumps).
    pub fn preset(&mut self, k: usize, dur: f32) {
        let k = if k > self.slabs.len() { 0 } else { k };
        let (pose, cut) = self.preset_pose(k);
        self.preset = k;
        // Fold the current sweep into the cut, so the animation starts from what is on screen.
        let from = Cut { centre: cam::rotate(self.cut.centre, self.cut.hinge, self.sweep), ..self.cut };
        self.sweep = 0.0;
        self.cut = if dur > 0.0 { from } else { cut };
        self.cut_anim = (dur > 0.0).then_some((from, cut));
        self.cam.min_dist = if k == 0 { 1.5 } else { 0.35 };
        // The idle sway is small enough that the cut keeps facing the viewer.
        self.cam.sway_amp = if k == 0 { 0.2 } else { 0.22 };
        if k == 0 {
            self.focus.fill(1.0);
        } else {
            self.focus.fill(0.2);
            for &i in &self.slabs[k - 1].idx {
                self.focus[i as usize] = 1.0;
            }
        }
        self.cam.fly_to(pose, dur);
    }

    /// Advance animations. Returns true when the camera moved.
    pub fn tick(&mut self, dt: f32, auto: bool, animate: bool) -> bool {
        self.cam.sway = self.cut_on;
        if animate {
            self.time += dt;
        }
        let moved = self.cam.tick(dt, auto);
        if let Some((a, b)) = self.cut_anim {
            match self.cam.progress() {
                Some(t) => self.cut = Cut::lerp(&a, &b, t),
                None => {
                    self.cut = b;
                    self.cut_anim = None;
                }
            }
            return true;
        }
        moved
    }

    /// Number of quakes at or before the cursor.
    pub fn visible(&self) -> usize {
        self.world.quakes.partition_point(|q| q.t as f32 <= self.cursor)
    }

    fn key(&self, view: &View) -> Vec<u32> {
        let p = self.cam.pose;
        let mut k: Vec<u32> = [p.target, p.axis, p.back].iter().flatten().map(|v| v.to_bits()).collect();
        k.extend([p.dist.to_bits(), view.w as u32, view.h as u32, self.exag.to_bits(), view.np as u32]);
        k.extend(view.planes.iter().flatten().map(|v| v.to_bits()));
        k
    }

    /// Screen rectangle that holds the core and its glow (x0, y0, x1, y1).
    fn core_rect(&self, view: &View) -> (usize, usize, usize, usize) {
        let (w, h) = (view.w, view.h);
        let r = RC + 0.04;
        let z = v3::dot(v3::sub([0.0; 3], view.eye), view.fwd);
        if z < r + 0.05 {
            return (0, 0, w, h);
        }
        let Some([sx, sy, _]) = view.project([0.0; 3]) else { return (0, 0, w, h) };
        let rad = view.f * r / (z * z - r * r).sqrt() * 1.3 + 6.0;
        let cl = |v: f32, m: usize| (v.max(0.0) as usize).min(m);
        (cl(sx - rad, w), cl(sy - rad, h), cl(sx + rad + 1.0, w), cl(sy + rad + 1.0, h))
    }

    /// Shade glass, core and cut faces into the half-resolution background.
    /// Skipped when nothing changed; only the core is redone when only its churn moved.
    fn paint(&mut self, view: &View) {
        let key = self.key(view);
        let same = key == self.bg_key;
        if same && self.time == self.bg_time {
            return;
        }
        let (w, h) = (view.w, view.h);
        let (x0, y0, x1, y1) = if same { self.core_rect(view) } else { (0, 0, w, h) };
        self.bg_key = key;
        self.bg_time = self.time;
        if x0 >= x1 || y0 >= y1 {
            return;
        }
        let (hw, hh) = (self.hw, self.hh);
        let hx0 = (x0 / 2).saturating_sub(1);
        let hy0 = (y0 / 2).saturating_sub(1);
        let hx1 = (x1.div_ceil(2) + 1).min(hw);
        let hy1 = (y1.div_ceil(2) + 1).min(hh);
        // Key light for the glass: upper left, in front.
        let light = v3::norm(v3::add(v3::add(v3::scale(view.right, -0.55), v3::scale(view.up, 0.65)), v3::scale(view.fwd, -0.55)));
        let ctx = Ctx {
            k: self.exag,
            time: self.time,
            light,
            face_light: [0, 1].map(|i| 0.8 + 0.3 * v3::dot(view.planes[i], light).abs()),
            // World size of one half-res texel at the limb, for anti-aliasing it.
            fp: 2.0 * (view.eye2() - 1.0).max(1e-4).sqrt() / view.f,
            halo: [0; HALO_N],
            space: self.pal.pack(self.pal.space),
        };
        let mut ctx = ctx;
        let pal = &self.pal;
        for (i, o) in ctx.halo.iter_mut().enumerate() {
            let h = (1.0 + (HALO_H2 - 1.0) * (i as f32 + 0.5) / HALO_N as f32).sqrt();
            let mut c = halo(pal, h - 1.0);
            // The limb, anti-aliased over one texel.
            let cover = 0.5 - (h - 1.0) / ctx.fp;
            if cover > 0.0 {
                let rim = v3::add(v3::scale(pal.env, 0.3), v3::scale(pal.rim, 0.22));
                c = mix(c, rim, cover.min(1.0));
            }
            *o = pal.pack(c);
        }
        // Adaptive sampling: shade every other texel, then fill the ones between
        // by interpolation where their neighbours agree (same surface, similar
        // colour), and shade them only where they do not.
        let hx0 = hx0 & !1;
        let hy0 = hy0 & !1;
        let shade = |hx: usize, hy: usize| -> (u32, u8) {
            let d = view.ray(2.0 * hx as f32 + 1.0, 2.0 * hy as f32 + 1.0);
            let dn = v3::scale(d, 1.0 / v3::len(d));
            let nd = [v3::dot(view.planes[0], dn), v3::dot(view.planes[1], dn)];
            shade_pixel(view, pal, &ctx, dn, v3::dot(view.eye, dn), nd)
        };
        let (nx, ny) = ((hx1 - hx0) / 2 + 1, (hy1 - hy0) / 2 + 1);
        let px = |k: usize| (hx0 + 2 * k).min(hx1 - 1);
        let py = |k: usize| (hy0 + 2 * k).min(hy1 - 1);
        let (half, cls) = (&mut self.half, &mut self.cls);
        for ky in 0..ny {
            let y = py(ky);
            for kx in 0..nx {
                let x = px(kx);
                let (c, k) = shade(x, y);
                half[y * hw + x] = c;
                cls[y * hw + x] = k;
            }
        }
        // In-between texels: interpolate where the shaded neighbours agree.
        for ky in 0..ny {
            let y = py(ky);
            let row = y * hw;
            for kx in 0..nx.saturating_sub(1) {
                let (xa, xb) = (px(kx), px(kx + 1));
                if xb - xa == 2 {
                    let (ia, ib) = (row + xa, row + xb);
                    let i = ia + 1;
                    if half[ia] == half[ib] && cls[ia] == cls[ib] {
                        half[i] = half[ia];
                        cls[i] = cls[ia];
                    } else if cls[ia] == cls[ib] && near(half[ia], half[ib]) {
                        half[i] = avg2(half[ia], half[ib]);
                        cls[i] = cls[ia];
                    } else {
                        (half[i], cls[i]) = shade(xa + 1, y);
                    }
                }
            }
        }
        for ky in 0..ny.saturating_sub(1) {
            let (ya, yb) = (py(ky), py(ky + 1));
            if yb - ya != 2 {
                continue;
            }
            let y = ya + 1;
            for kx in 0..nx {
                let xa = px(kx);
                // Straight below a shaded texel: blend up and down.
                let (iu, id, i) = (ya * hw + xa, yb * hw + xa, y * hw + xa);
                if half[iu] == half[id] && cls[iu] == cls[id] {
                    half[i] = half[iu];
                    cls[i] = cls[iu];
                } else if cls[iu] == cls[id] && near(half[iu], half[id]) {
                    half[i] = avg2(half[iu], half[id]);
                    cls[i] = cls[iu];
                } else {
                    (half[i], cls[i]) = shade(xa, y);
                }
                // Diagonal: blend the four corners.
                if kx + 1 < nx && px(kx + 1) - xa == 2 {
                    let (a, b, c, d) = (ya * hw + xa, ya * hw + xa + 2, yb * hw + xa, yb * hw + xa + 2);
                    let i = y * hw + xa + 1;
                    let k = cls[a];
                    let (ca, cb, cc, cd) = (half[a], half[b], half[c], half[d]);
                    let same = k == cls[b] && k == cls[c] && k == cls[d];
                    if same && ca == cb && ca == cc && ca == cd {
                        half[i] = ca;
                        cls[i] = k;
                    } else if same && near(ca, cd) && near(cb, cc) {
                        half[i] = avg4(ca, cb, cc, cd);
                        cls[i] = k;
                    } else {
                        (half[i], cls[i]) = shade(xa + 1, y);
                    }
                }
            }
        }
    }

    pub fn render(&mut self) {
        self.render_timed(&mut |_| {});
    }

    /// Render, calling `lap(phase)` after each phase (background, stars and lines,
    /// quakes and marks, labels, bloom and tonemap) so benches can time them.
    pub fn render_timed(&mut self, lap: &mut dyn FnMut(usize)) {
        let view = self.view();
        self.paint(&view);
        lap(0);
        // `frame.light` was cleared by the previous compose, tile by tile.
        self.glow.clear();
        self.draw_stars(&view);
        if self.flags & GRATICULE != 0 {
            self.shell_lines(&view, 0, hex(0x5a7bb0), 0.13, 0.05);
        }
        if self.flags & COAST != 0 {
            self.shell_lines(&view, 1, hex(0x8aa4c8), 0.4, 0.1);
        }
        if self.flags & PLATES != 0 {
            self.shell_lines(&view, 2, hex(0x3fb8b0), 0.45, 0.12);
        }
        self.face_rings(&view);
        lap(1);
        self.draw_quakes(&view);
        self.draw_marks(&view);
        lap(2);
        self.place_labels(&view);
        lap(3);
        let f = &mut self.frame;
        self.post.compose(&self.half, &mut f.light, &mut self.tiles, &self.glow.light, &mut f.px, f.bloom, f.exposure);
        self.add_stars();
        lap(4);
    }

    /// Stars at infinity: hidden by the core and the cut faces, dimmed by the glass.
    fn draw_stars(&mut self, view: &View) {
        let (w, h) = (view.w as f32, view.h as f32);
        self.star_px.clear();
        for &(dir, b, tint) in &self.stars {
            let z = v3::dot(dir, view.fwd);
            if z < 0.2 {
                continue;
            }
            let sx = view.cx + view.f * v3::dot(dir, view.right) / z;
            let sy = view.cy - view.f * v3::dot(dir, view.up) / z;
            if sx < 1.0 || sy < 1.0 || sx >= w - 1.0 || sy >= h - 1.0 {
                continue;
            }
            let nd = [v3::dot(view.planes[0], dir), v3::dot(view.planes[1], dir)];
            let tr = view.trace(v3::dot(view.eye, dir), nd);
            if tr.hit != Hit::None {
                continue;
            }
            self.star_px.push((sx, sy, b * self.pal.absorb(tr.glass), tint));
        }
    }

    /// Stars go on after the tonemap: single bilinear pixels, no bloom.
    fn add_stars(&mut self) {
        let w = self.frame.w;
        for &(sx, sy, a, tint) in &self.star_px {
            let (fx, fy) = (sx - 0.5, sy - 0.5);
            let (ix, iy) = (fx as usize, fy as usize);
            let (tx, ty) = (fx - ix as f32, fy - iy as f32);
            for (dx, dy, k) in [(0, 0, (1.0 - tx) * (1.0 - ty)), (1, 0, tx * (1.0 - ty)), (0, 1, (1.0 - tx) * ty), (1, 1, tx * ty)] {
                let v = a * k;
                let c = self.post.t(v * tint[0]) | (self.post.t(v * tint[1]) << 8) | (self.post.t(v * tint[2]) << 16);
                let i = (iy + dy) * w + ix + dx;
                self.frame.px[i] = post::add_sat(self.frame.px[i], c);
            }
        }
    }

    /// Lines on the glass shell: 0 graticule, 1 coastlines, 2 plate boundaries.
    fn shell_lines(&mut self, view: &View, which: usize, c: Rgb, front: f32, back: f32) {
        let set = match which {
            0 => &self.graticule,
            1 => &self.coast,
            _ => &self.plates,
        };
        let mut f = Canvas { f: &mut self.frame, tiles: &mut self.tiles, tw: self.tw, gauss: &self.gauss };
        for l in set {
            let mut prev: Option<([f32; 2], f32)> = None;
            for &p in l {
                let mut cur = None;
                if !view.removed(p) {
                    if let Some([sx, sy, _]) = view.project(p) {
                        let facing = v3::dot(p, view.eye) - 1.0;
                        let a = if facing > 0.0 {
                            front * (0.35 + 0.65 * smoothstep(0.0, 0.6, facing))
                        } else {
                            back * view.see(v3::scale(p, 0.999))
                        };
                        if a > 0.003 {
                            cur = Some(([sx, sy], a));
                        }
                    }
                }
                if let (Some((ps, pa)), Some((cs, ca))) = (prev, cur) {
                    f.line(ps, cs, c, pa.min(ca));
                }
                prev = cur;
            }
        }
    }

    /// Crisp rings on the cut faces (410 and 660 km, the core-mantle and inner-core
    /// boundaries, the cut edge of the glass) and the wedge's hinge.
    fn face_rings(&mut self, view: &View) {
        if view.np == 0 {
            return;
        }
        let k = self.exag;
        let pal = &self.pal;
        // The fainter depth guides only in a slab's section, where they make an axis.
        let guide = if self.preset > 0 { 0.06 } else { 0.0 };
        let rings = [
            (radius_at(k, GUIDES_KM[0]), pal.ring, guide),
            (radius_at(k, GUIDES_KM[1]), pal.ring, guide),
            (radius_at(k, GUIDES_KM[2]), pal.ring, guide),
            (radius_at(k, RINGS_KM[0]), pal.ring, 0.14),
            (radius_at(k, RINGS_KM[1]), pal.ring, 0.18),
            (RC, pal.cmb, 0.5),
            (RIC, pal.icb, 0.45),
            (1.0, pal.edge, 0.4),
        ];
        let mut cv = Canvas { f: &mut self.frame, tiles: &mut self.tiles, tw: self.tw, gauss: &self.gauss };
        let poly = |cv: &mut Canvas, pts: &mut dyn Iterator<Item = V>, c: Rgb, alpha: f32, face: Option<usize>| {
            let mut prev: Option<([f32; 2], f32)> = None;
            for p in pts {
                let on_face = face.is_none_or(|pi| (0..view.np).all(|o| o == pi || v3::dot(view.planes[o], p) >= 0.0));
                let mut cur = None;
                if on_face {
                    let q = v3::add(p, v3::scale(v3::sub(view.eye, p), 0.003));
                    let vis = view.see(q);
                    if vis > 0.01 {
                        if let Some([sx, sy, _]) = view.project(p) {
                            cur = Some(([sx, sy], alpha * vis));
                        }
                    }
                }
                if let (Some((ps, pa)), Some((cs, ca))) = (prev, cur) {
                    cv.line(ps, cs, c, pa.min(ca));
                }
                prev = cur;
            }
        };
        for pi in 0..view.np {
            let n = view.planes[pi];
            let fa = if v3::dot(n, view.eye) > 0.0 { 1.0 } else { 0.3 };
            let u = cam::perp(n);
            let v = v3::cross(n, u);
            for &(r, c, alpha) in rings.iter().filter(|r| r.2 > 0.0) {
                let steps = 220;
                let mut pts = (0..=steps).map(|j| {
                    let th = j as f32 / steps as f32 * std::f32::consts::TAU;
                    v3::scale(v3::add(v3::scale(u, th.cos()), v3::scale(v, th.sin())), r)
                });
                poly(&mut cv, &mut pts, c, alpha * fa, Some(pi));
            }
        }
        if view.np == 2 {
            let axis = v3::norm(v3::cross(view.planes[0], view.planes[1]));
            let mut pts = (0..=60).map(|j| v3::scale(axis, j as f32 / 30.0 - 1.0));
            poly(&mut cv, &mut pts, pal.edge, 0.22, None);
        }
    }

    fn draw_quakes(&mut self, view: &View) {
        let n = self.visible();
        let (w, h) = (view.w as f32, view.h as f32);
        let eye_r = v3::len(view.eye);
        let (near, far) = ((eye_r - 1.0).max(0.0), eye_r + 1.0);
        // In a dip section, quakes far in front of the face fade so the section reads.
        let section = (self.preset > 0 && view.np == 1).then_some(view.planes[0]);
        let mut st = Stats::default();
        let mut deepest = -1.0f32;
        let g = &mut self.glow;
        let gauss = &self.gauss;
        self.splats.clear();
        for i in 0..n {
            self.screen[i][2] = 0.0;
            let p = self.pos[i];
            let Some([sx, sy, z]) = view.project(p) else { continue };
            if sx < -40.0 || sy < -40.0 || sx > w + 40.0 || sy > h + 40.0 {
                continue;
            }
            let vis = view.see(p);
            if vis <= 0.004 {
                continue;
            }
            let q = self.world.quakes[i];
            let age = self.cursor - q.t as f32;
            // Fresh quakes flare, then settle to an ember over a few weeks.
            let flash = if age < 25.0 * DAY { 1.0 + 3.5 * fexp(-age / (3.0 * DAY)) } else { 1.0 };
            // Depth cue: the far side of the planet is dimmer.
            let u = ((v3::len(v3::sub(p, view.eye)) - near) / (far - near)).clamp(0.0, 1.0);
            let mut wgt = vis * (1.0 - 0.6 * smoothstep(0.3, 1.0, u)) * self.focus[i];
            if let Some(n) = section {
                wgt *= 1.0 - 0.92 * smoothstep(0.02, 0.1, v3::dot(n, p));
            }
            if wgt <= 0.004 {
                continue;
            }
            let s = fpow(view.f / z / 450.0, 0.35).min(1.7);
            let [rad, peak] = self.size[i];
            let rad = (rad * s).min(6.0);
            let a = peak * flash * wgt * self.gain / s.max(1.0).sqrt();
            let c = self.tint[i];
            self.splats.push(Splat { x: sx, y: sy, r: rad, a, c });
            // The same light at quarter resolution feeds the bloom. A splat's energy
            // is about 2 pi r^2 a; a quarter-res texel averages 16 pixels.
            let e = a * rad * rad * (std::f32::consts::TAU / 16.0);
            glow_point(g, sx * 0.25, sy * 0.25, c, e);
            if q.mag >= 6.0 {
                // A wide halo for the big ones, at quarter resolution only.
                let rq = rad * 0.8;
                splat_into(&mut g.light, g.w, g.h, gauss, sx * 0.25, sy * 0.25, rq.max(0.7), c, a * 0.12 * (rq * rq) / rq.max(0.7).powi(2));
            }
            self.screen[i] = [sx, sy, wgt];
            if wgt > 0.12 && sx >= 0.0 && sy >= 0.0 && sx < w && sy < h {
                st.shown += 1;
                if q.depth >= 300.0 {
                    st.deep300 += 1;
                }
                if q.depth > deepest {
                    deepest = q.depth;
                    st.deepest = Some(i);
                }
            }
        }
        for sc in &mut self.screen[n..] {
            sc[2] = 0.0;
        }
        self.stats = st;
        // Counting sort by tile row, then splat top to bottom.
        let rows = self.th.max(1);
        self.buckets.clear();
        self.buckets.resize(rows + 1, 0);
        let row = |s: &Splat| ((s.y.max(0.0) as usize) / TILE).min(rows - 1);
        for s in &self.splats {
            self.buckets[row(s) + 1] += 1;
        }
        for k in 1..=rows {
            self.buckets[k] += self.buckets[k - 1];
        }
        self.sorted.clear();
        self.sorted.resize(self.splats.len(), Splat::default());
        for s in &self.splats {
            let b = &mut self.buckets[row(s)];
            self.sorted[*b as usize] = *s;
            *b += 1;
        }
        let mut f = Canvas { f: &mut self.frame, tiles: &mut self.tiles, tw: self.tw, gauss: &self.gauss };
        for s in &self.sorted {
            f.splat(s.x, s.y, s.r, s.c, s.a);
        }
    }

    /// Selection ring, hover ring, and a plumb line from the selected quake up to its epicentre.
    fn draw_marks(&mut self, view: &View) {
        let n = self.visible();
        let ink = [1.0, 0.97, 0.9];
        let mut cv = Canvas { f: &mut self.frame, tiles: &mut self.tiles, tw: self.tw, gauss: &self.gauss };
        for (sel, alpha) in [(self.hover, 0.6), (self.selected, 1.2)] {
            let Some(i) = sel.filter(|&i| i < n) else { continue };
            let p = self.pos[i];
            let Some([sx, sy, z]) = view.project(p) else { continue };
            let s = fpow(view.f / z / 450.0, 0.35).min(1.7);
            let r = (quake_radius(self.world.quakes[i].mag) * s).min(6.0) * 2.6 + 7.0;
            let hidden = self.screen[i][2] <= 0.0;
            let a = if hidden { alpha * 0.35 } else { alpha };
            cv.circle(sx, sy, r, ink, a);
            if sel == self.selected {
                if let Some([ex, ey, _]) = view.project(self.unit[i]) {
                    let (dx, dy) = (ex - sx, ey - sy);
                    let len = (dx * dx + dy * dy).sqrt();
                    if len > r + 2.0 {
                        let k0 = r / len;
                        cv.line([sx + dx * k0, sy + dy * k0], [ex, ey], ink, 0.5 * a);
                        cv.disc(ex, ey, 1.6, ink, 0.6 * a);
                    }
                }
            }
        }
    }

    /// Anchors for the depth labels on the cut faces. For the whole planet, the
    /// top-most visible point of each ring (they stack along the hinge); in a dip
    /// section, the left-most one, so the labels make a depth axis.
    fn place_labels(&mut self, view: &View) {
        self.labels = [[0.0; 3]; LABELS];
        if view.np == 0 {
            return;
        }
        let k = self.exag;
        let axis = self.preset > 0;
        let r = |km: f32| radius_at(k, km);
        let radii = [r(GUIDES_KM[0]), r(GUIDES_KM[1]), r(GUIDES_KM[2]), r(RINGS_KM[0]), r(RINGS_KM[1]), RC, RIC];
        for (slot, &r) in radii.iter().enumerate() {
            if !axis && slot < 3 {
                continue;
            }
            let mut best: Option<[f32; 2]> = None;
            for pi in 0..view.np {
                let n = view.planes[pi];
                // Only faces seen from the open side.
                if v3::dot(n, view.eye) <= 0.0 {
                    continue;
                }
                let u = cam::perp(n);
                let v = v3::cross(n, u);
                for j in 0..360 {
                    let th = j as f32 / 360.0 * std::f32::consts::TAU;
                    let p = v3::scale(v3::add(v3::scale(u, th.cos()), v3::scale(v, th.sin())), r);
                    if (0..view.np).any(|o| o != pi && v3::dot(view.planes[o], p) < 0.0) {
                        continue;
                    }
                    let q = v3::add(p, v3::scale(v3::sub(view.eye, p), 0.003));
                    if view.see(q) < 0.95 {
                        continue;
                    }
                    let Some([sx, sy, _]) = view.project(p) else { continue };
                    if sx < 40.0 || sx > view.w as f32 - 40.0 || sy < 16.0 || sy > view.h as f32 - 16.0 {
                        continue;
                    }
                    if axis && sx < 46.0 {
                        continue;
                    }
                    if best.is_none_or(|b| if axis { sx < b[0] } else { sy < b[1] }) {
                        best = Some([sx, sy]);
                    }
                }
            }
            if let Some([x, y]) = best {
                self.labels[slot] = [x, y, 1.0];
            }
        }
    }

    /// Nearest drawn quake to a screen point, favouring big and bright ones.
    pub fn pick(&self, x: f32, y: f32, reach: f32) -> Option<usize> {
        let mut best = None;
        let mut best_score = f32::MAX;
        for i in 0..self.visible() {
            let [sx, sy, wgt] = self.screen[i];
            if wgt < 0.12 {
                continue;
            }
            let mag = self.world.quakes[i].mag;
            let d = ((sx - x).powi(2) + (sy - y).powi(2)).sqrt();
            if d > reach + quake_radius(mag) * 2.0 {
                continue;
            }
            let score = d - (mag - 4.5) * 1.5 - wgt * 2.0;
            if score < best_score {
                best_score = score;
                best = Some(i);
            }
        }
        best
    }

    /// Dip of the quakes below 70 km within `half_km` of the current slice, degrees
    /// (NaN for the whole-planet cut or when fewer than 12 quakes qualify).
    pub fn slice_dip(&self, half_km: f32) -> f32 {
        if self.preset == 0 || !self.cut.is_slice() {
            return f32::NAN;
        }
        let s = &self.slabs[self.preset - 1];
        let n = cam::rotate(self.cut.centre, self.cut.hinge, self.sweep);
        section_dip(self.world, &s.idx, n, s.dip, half_km, self.cursor)
    }
}

/// Whether two packed colours are within a few levels on every channel.
#[inline]
fn near(a: u32, b: u32) -> bool {
    // Per channel |a - b| <= 5 levels plus 1/16 of the level: errors in bright
    // areas are harder to see.
    let ok = |sh: u32| {
        let (x, y) = (((a >> sh) & 0xff) as i32, ((b >> sh) & 0xff) as i32);
        (x - y).abs() <= 5 + ((x + y) >> 5)
    };
    ok(0) && ok(8) && ok(16)
}

#[inline]
fn avg2(a: u32, b: u32) -> u32 {
    let rb = ((a & 0x00ff_00ff) + (b & 0x00ff_00ff) + 0x0001_0001) >> 1;
    let ga = (((a >> 8) & 0x00ff_00ff) + ((b >> 8) & 0x00ff_00ff) + 0x0001_0001) >> 1;
    (rb & 0x00ff_00ff) | ((ga & 0x00ff_00ff) << 8) | 0xff00_0000
}

#[inline]
fn avg4(a: u32, b: u32, c: u32, d: u32) -> u32 {
    let m = 0x00ff_00ff;
    let rb = ((a & m) + (b & m) + (c & m) + (d & m) + 0x0002_0002) >> 2;
    let ga = (((a >> 8) & m) + ((b >> 8) & m) + ((c >> 8) & m) + ((d >> 8) & m) + 0x0002_0002) >> 2;
    (rb & m) | ((ga & m) << 8) | 0xff00_0000
}

/// One quake's splat for this frame.
#[derive(Clone, Copy, Default)]
struct Splat {
    x: f32,
    y: f32,
    r: f32,
    a: f32,
    c: Rgb,
}

/// Per-frame constants for the background shader.
struct Ctx {
    k: f32,
    time: f32,
    light: V,
    face_light: [f32; 2],
    fp: f32,
    /// Packed colour outside the glass by squared ray distance from the centre,
    /// over [1, HALO_H2] (limb anti-aliasing included), and plain space.
    halo: [u32; HALO_N],
    space: u32,
}

const HALO_N: usize = 1024;
const HALO_H2: f32 = 2.6;

/// The light layer and its tile flags: every draw marks the tiles it touches, so
/// the tonemap only reads (and clears) those.
struct Canvas<'a> {
    f: &'a mut Frame,
    tiles: &'a mut [u8],
    tw: usize,
    gauss: &'a [f32],
}

impl Canvas<'_> {
    fn mark(&mut self, x0: f32, y0: f32, x1: f32, y1: f32) {
        let (w, h) = (self.f.w as f32, self.f.h as f32);
        if !(x0 <= x1 && y0 <= y1) || x1 < 0.0 || y1 < 0.0 || x0 >= w || y0 >= h {
            return;
        }
        let tx0 = x0.max(0.0) as usize / TILE;
        let tx1 = x1.min(w - 1.0) as usize / TILE;
        let ty0 = y0.max(0.0) as usize / TILE;
        let ty1 = y1.min(h - 1.0) as usize / TILE;
        for ty in ty0..=ty1 {
            self.tiles[ty * self.tw + tx0..=ty * self.tw + tx1].fill(1);
        }
    }

    fn splat(&mut self, sx: f32, sy: f32, r: f32, c: Rgb, a: f32) {
        let ext = r.max(0.7) * CUTOFF + 1.0;
        self.mark(sx - ext, sy - ext, sx + ext, sy + ext);
        splat_into(&mut self.f.light, self.f.w, self.f.h, self.gauss, sx, sy, r, c, a);
    }

    fn line(&mut self, a: [f32; 2], b: [f32; 2], c: Rgb, alpha: f32) {
        self.mark(a[0].min(b[0]) - 2.0, a[1].min(b[1]) - 2.0, a[0].max(b[0]) + 2.0, a[1].max(b[1]) + 2.0);
        self.f.line(a, b, c, alpha);
    }

    fn circle(&mut self, cx: f32, cy: f32, r: f32, c: Rgb, alpha: f32) {
        self.mark(cx - r - 2.0, cy - r - 2.0, cx + r + 2.0, cy + r + 2.0);
        self.f.circle(cx, cy, r, c, alpha);
    }

    fn disc(&mut self, cx: f32, cy: f32, r: f32, c: Rgb, alpha: f32) {
        self.mark(cx - r - 2.0, cy - r - 2.0, cx + r + 2.0, cy + r + 2.0);
        self.f.disc(cx, cy, r, c, alpha);
    }
}

/// Add light `e` to the glow buffer at a point, split bilinearly over four texels.
#[inline]
fn glow_point(g: &mut Frame, x: f32, y: f32, c: Rgb, e: f32) {
    let (fx, fy) = (x - 0.5, y - 0.5);
    if fx < 0.0 || fy < 0.0 {
        return;
    }
    let (ix, iy) = (fx as usize, fy as usize);
    if ix + 1 >= g.w || iy + 1 >= g.h {
        return;
    }
    let (tx, ty) = (fx - ix as f32, fy - iy as f32);
    let w = g.w;
    for (dx, dy, k) in [(0, 0, (1.0 - tx) * (1.0 - ty)), (1, 0, tx * (1.0 - ty)), (0, 1, (1.0 - tx) * ty), (1, 1, tx * ty)] {
        let i = ((iy + dy) * w + ix + dx) * 3;
        let k = k * e;
        g.light[i] += c[0] * k;
        g.light[i + 1] += c[1] * k;
        g.light[i + 2] += c[2] * k;
    }
}

/// Gaussian splat (sigma `r` px, peak `a`) into an RGB float buffer, over a
/// square of +-2.2 sigma. The kernel is separable, so each pixel costs one
/// multiply per channel: g(x, y) = g(x) g(y).
#[allow(clippy::too_many_arguments)]
#[inline]
fn splat_into(light: &mut [f32], w: usize, h: usize, gauss: &[f32], sx: f32, sy: f32, r: f32, c: Rgb, a: f32) {
    const MAX: usize = 64;
    let r = r.max(0.7);
    let ext = r * 2.2;
    let x0 = ((sx - ext + 0.5) as i32).max(0);
    let y0 = ((sy - ext + 0.5) as i32).max(0);
    let x1 = ((sx + ext + 0.5) as i32).min(w as i32).min(x0 + MAX as i32);
    let y1 = ((sy + ext + 0.5) as i32).min(h as i32);
    if x0 >= x1 || y0 >= y1 {
        return;
    }
    let (x0, y0, x1, y1) = (x0 as usize, y0 as usize, x1 as usize, y1 as usize);
    // `gauss` is indexed by (d / sigma)^2 * 256 / CUTOFF^2.
    let k = 256.0 / (CUTOFF * CUTOFF) / (r * r);
    let g = |d: f32| gauss[((d * d * k) as i32).min(256) as usize];
    let n = x1 - x0;
    let mut gx = [0.0f32; MAX];
    for (i, v) in gx[..n].iter_mut().enumerate() {
        *v = g((x0 + i) as f32 + 0.5 - sx);
    }
    for y in y0..y1 {
        let gy = g(y as f32 + 0.5 - sy) * a;
        let (cr, cg, cb) = (c[0] * gy, c[1] * gy, c[2] * gy);
        let row = &mut light[(y * w + x0) * 3..(y * w + x1) * 3];
        for (px, &gx) in row.chunks_exact_mut(3).zip(&gx[..n]) {
            px[0] += cr * gx;
            px[1] += cg * gx;
            px[2] += cb * gx;
        }
    }
}

/// Atmosphere-like halo just outside the glass, `e` Earth radii beyond the limb.
#[inline]
fn halo(pal: &Palette, e: f32) -> Rgb {
    let t1 = e * (1.0 / 0.016);
    let c = v3::add(pal.space, v3::scale(pal.rim, 0.30 * fexp(-t1 * t1)));
    v3::add(c, v3::scale(pal.haze, 0.09 * fexp(-e * 10.0)))
}

/// Packed colour of one background sample, for a unit ray `dn` with
/// `b = eye.dn` and `nd = n_k.dn`.
#[inline]
fn shade_pixel(view: &View, pal: &Palette, ctx: &Ctx, dn: V, b: f32, nd: [f32; 2]) -> (u32, u8) {
    let tr = view.trace(b, nd);
    if !tr.inside {
        if tr.tc <= 0.0 || tr.h2 >= HALO_H2 {
            return (ctx.space, 0);
        }
        let i = ((tr.h2 - 1.0) * (HALO_N as f32 / (HALO_H2 - 1.0))) as i32;
        return (ctx.halo[i.clamp(0, HALO_N as i32 - 1) as usize], 0);
    }
    let mut class = match tr.hit {
        Hit::None => 1,
        Hit::Core => 2,
        Hit::Face(fi) => 3 + fi as u8,
    };
    if tr.front > 0.0 {
        class |= 0x80;
    }
    let mut c = match tr.hit {
        Hit::None => pal.space,
        Hit::Core => {
            let p = v3::add(view.eye, v3::scale(dn, tr.t));
            let n = v3::scale(p, 1.0 / RC);
            let mu = (-v3::dot(n, dn)).clamp(0.0, 1.0);
            let tex = churn(n, ctx.time);
            // Limb darkening, like a star: the edge is cooler and dimmer.
            let heat = mu.sqrt().sqrt() * (0.8 + 0.2 * tex) + 0.04 * tex;
            let rim = 1.0 - mu;
            let rim2 = rim * rim;
            v3::add(pal.core.at(heat * 0.94), v3::scale(pal.glow, 0.08 * rim2 * rim2))
        }
        Hit::Face(fi) => {
            let p = v3::add(view.eye, v3::scale(dn, tr.t));
            let rho = v3::len(p);
            class |= if rho < RIC { 0x10 } else if rho < RC { 0x20 } else { 0 };
            if rho < RIC {
                pal.inner.at(1.0 - rho / RIC)
            } else if rho < RC {
                let tex = churn(v3::scale(p, 1.35 / RC), ctx.time * 1.3);
                let hot = 1.0 - (rho - RIC) / (RC - RIC);
                pal.outer.at(0.36 + 0.24 * tex + 0.34 * hot * hot)
            } else {
                let km = unstretch(ctx.k, (1.0 - rho) * R_KM);
                let mut c = pal.mantle.at(km / CMB_KM);
                if (RINGS_KM[0]..=RINGS_KM[1]).contains(&km) {
                    c = mix(c, pal.tz, 0.16);
                }
                c = v3::scale(c, ctx.face_light[fi]);
                v3::add(c, v3::scale(pal.glow, 0.14 * fexp(-(rho - RC) * (1.0 / 0.045))))
            }
        }
    };
    if tr.glass > 0.0 {
        let t = pal.absorb(tr.glass);
        c = v3::add(v3::scale(c, t), v3::scale(pal.scatter, 1.0 - t));
        // The hot core lights the glass around it.
        if tr.h2 < 0.81 && tr.tc > 0.0 && tr.tc < tr.t && !view.removed(v3::add(view.eye, v3::scale(dn, tr.tc))) {
            let h = tr.h2.max(0.0).sqrt();
            c = v3::add(c, v3::scale(pal.glow, 0.07 * fexp(-(h - RC).max(0.0) * (1.0 / 0.07))));
        }
    }
    if tr.back > 0.0 {
        let p = v3::add(view.eye, v3::scale(dn, tr.back));
        let m = 1.0 - v3::dot(p, dn).abs();
        let m2 = m * m;
        c = v3::add(c, v3::scale(pal.env, 0.05 * m2 * m2));
    }
    if tr.front > 0.0 {
        let n = v3::add(view.eye, v3::scale(dn, tr.front));
        let mu = (-v3::dot(n, dn)).clamp(0.0, 1.0);
        let m = 1.0 - mu;
        let m2 = m * m;
        let fres = 0.04 + 0.96 * m2 * m2 * m;
        let r = v3::sub(dn, v3::scale(n, 2.0 * v3::dot(dn, n)));
        let sky = 0.25 + 0.75 * (0.5 + 0.5 * v3::dot(r, view.up)).clamp(0.0, 1.0);
        let rl = v3::dot(r, ctx.light).max(0.0);
        let rl2 = rl * rl;
        let rl8 = rl2 * rl2 * rl2 * rl2;
        let spec = rl8 * rl8 * rl8 * rl8 * 0.9 + rl8 * 0.03;
        c = v3::add(v3::scale(c, 1.0 - fres), v3::scale(pal.env, fres * sky * 0.55));
        c = v3::add(c, v3::scale(pal.spec, spec));
        // A thin bright rim, like the surface globe's atmosphere.
        c = v3::add(c, v3::scale(pal.rim, 0.22 * m2 * m2 * m2));
        // The limb, anti-aliased over one texel.
        let cover = 0.5 + (1.0 - tr.h2.sqrt()) / ctx.fp;
        if cover < 1.0 {
            c = mix(halo(pal, 0.0), c, cover.max(0.0));
            class |= 0x40;
        }
    }
    (pal.pack(c), class)
}

#[cfg(target_arch = "wasm32")]
mod exports {
    use super::*;
    use std::cell::RefCell;

    thread_local! {
        static GLASS: RefCell<Option<Glass>> = const { RefCell::new(None) };
    }

    fn with<R>(f: impl FnOnce(&mut Glass) -> R) -> R {
        GLASS.with(|g| f(g.borrow_mut().get_or_insert_with(Glass::new)))
    }

    #[no_mangle]
    pub extern "C" fn glass_resize(w: u32, h: u32) {
        with(|g| g.resize(w as usize, h as usize))
    }

    /// Advance the camera and the core's churn by `dt` s. Returns 1 when the camera moved.
    #[no_mangle]
    pub extern "C" fn glass_tick(dt: f32, auto: u32, animate: u32) -> u32 {
        with(|g| g.tick(dt, auto != 0, animate != 0) as u32)
    }

    /// 1 while a preset flight is running.
    #[no_mangle]
    pub extern "C" fn glass_flying() -> u32 {
        with(|g| g.cam.flying() as u32)
    }

    /// Drag: turn about the view's axis and tilt, radians.
    #[no_mangle]
    pub extern "C" fn glass_orbit(dyaw: f32, dpitch: f32) {
        with(|g| g.cam.orbit(dyaw, dpitch))
    }

    /// Release after a drag with this angular velocity (rad/s); it decays.
    #[no_mangle]
    pub extern "C" fn glass_fling(vyaw: f32, vpitch: f32) {
        with(|g| g.cam.fling(vyaw, vpitch))
    }

    /// Zoom by a factor (> 1 moves closer).
    #[no_mangle]
    pub extern "C" fn glass_zoom(f: f32) {
        with(|g| g.cam.zoom(f))
    }

    /// Fly to preset k (0 whole planet, 1..=5 slabs) over `dur` seconds.
    #[no_mangle]
    pub extern "C" fn glass_preset(k: u32, dur: f32) {
        with(|g| g.preset(k as usize, dur))
    }

    /// Depth exaggeration, 1 to 10.
    #[no_mangle]
    pub extern "C" fn glass_exag(k: f32) {
        with(|g| g.set_exag(k))
    }

    #[no_mangle]
    pub extern "C" fn glass_cut(on: u32) {
        with(|g| g.cut_on = on != 0)
    }

    /// Turn the cut about its hinge, radians.
    #[no_mangle]
    pub extern "C" fn glass_sweep(rad: f32) {
        with(|g| g.sweep = rad)
    }

    /// Bit 0 coastlines, 1 plate boundaries, 2 graticule.
    #[no_mangle]
    pub extern "C" fn glass_flags(bits: u32) {
        with(|g| g.flags = bits)
    }

    #[no_mangle]
    pub extern "C" fn glass_cursor(t: f32) {
        with(|g| g.cursor = t)
    }

    /// Selected and hovered quake (-1 for none).
    #[no_mangle]
    pub extern "C" fn glass_highlight(selected: i32, hover: i32) {
        with(|g| {
            g.selected = (selected >= 0).then_some(selected as usize);
            g.hover = (hover >= 0 && hover != selected).then_some(hover as usize);
        })
    }

    /// Renders; returns how many quakes are drawn on screen.
    #[no_mangle]
    pub extern "C" fn glass_render() -> u32 {
        with(|g| {
            g.render();
            g.stats.shown as u32
        })
    }

    #[no_mangle]
    pub extern "C" fn glass_pixels() -> *const u32 {
        with(|g| g.frame.px.as_ptr())
    }

    #[no_mangle]
    pub extern "C" fn glass_pick(x: f32, y: f32, reach: f32) -> i32 {
        with(|g| g.pick(x, y, reach).map_or(-1, |i| i as i32))
    }

    /// Where quake i landed in the last render: axis 0 = x, 1 = y, 2 = weight (0 = not drawn).
    #[no_mangle]
    pub extern "C" fn glass_screen(i: u32, axis: u32) -> f32 {
        with(|g| g.screen.get(i as usize).map_or(0.0, |s| s[axis as usize % 3]))
    }

    /// Stats of the last render: 0 quakes drawn, 1 of them 300 km or deeper,
    /// 2 index of the deepest drawn (-1 none).
    #[no_mangle]
    pub extern "C" fn glass_stat(what: u32) -> f32 {
        with(|g| match what {
            0 => g.stats.shown as f32,
            1 => g.stats.deep300 as f32,
            _ => g.stats.deepest.map_or(-1.0, |i| i as f32),
        })
    }

    /// Depth-label anchor `slot` (0..7: 100, 200, 300, 410, 660 km, core-mantle
    /// boundary, inner core): axis 0 x, 1 y, 2 visible.
    #[no_mangle]
    pub extern "C" fn glass_label(slot: u32, axis: u32) -> f32 {
        with(|g| g.labels[slot as usize % LABELS][axis as usize % 3])
    }

    /// Displayed depth (km) for a true depth at the current exaggeration.
    #[no_mangle]
    pub extern "C" fn glass_stretch(km: f32) -> f32 {
        with(|g| stretch(g.exag, km))
    }

    /// Per-slab facts, slab 0..5: 0 quakes, 1 deeper than 300 km, 2 deepest quake index,
    /// 3 mean dip below 70 km (deg), 4 strike azimuth, 5 dip azimuth, 6 centre lat, 7 centre lon.
    #[no_mangle]
    pub extern "C" fn glass_slab(k: u32, what: u32) -> f32 {
        with(|g| {
            let Some(s) = g.slabs.get(k as usize) else { return f32::NAN };
            let (lat, lon) = v3::to_latlon(s.centre);
            match what {
                0 => s.idx.len() as f32,
                1 => s.deep300 as f32,
                2 => s.deepest as f32,
                3 => s.dip_deg,
                4 => s.strike_az,
                5 => s.dip_az,
                6 => lat,
                _ => lon,
            }
        })
    }

    /// Dip of the quakes below 70 km within `half_km` of the current slice (NaN if unknown).
    #[no_mangle]
    pub extern "C" fn glass_slice_dip(half_km: f32) -> f32 {
        with(|g| g.slice_dip(half_km))
    }
}
