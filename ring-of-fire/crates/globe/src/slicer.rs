//! Instrument 03 Slabs: the Slab Slicer.
//!
//! A vertical slice through the Earth along a great-circle arc A→B, drawn at true
//! curvature and true scale (no vertical exaggeration): the surface is an arc of
//! the planet's circumference and every hypocentre within ±W km of the arc sits at
//! its real depth. A robust fit through the intermediate and deep quakes traces the
//! Wadati–Benioff zone and measures its dip (see `fit`).
//!
//! Rendering keeps per-frame work small:
//! - the background (mantle shading, depth and distance grid, 410/660 km and
//!   core–mantle boundaries, sea level) is painted analytically per pixel, and only
//!   when the wedge's shape changes (canvas size, profile length, depth range);
//! - quakes and the fit are additive splats and lines in the shared `Frame`;
//! - glow goes into a quarter-resolution buffer and is upsampled while tonemapping,
//!   in place of the shared bloom pass (cheaper for this scene);
//! - every primitive records the rows and columns it touched, so a frame only clears
//!   and tonemaps those spans and copies the background everywhere else (`canvas`).

mod canvas;
mod fit;

pub use canvas::Canvas;

pub use fit::{
    auto_profile, bearing, carry, collect_band, crossings, fit_slab, plate_lines, shift, units, Auto, BandQuake,
    Geom, Model, NoSlab, Profile, Slab, SlabResult, MIN_DEEP, R_EARTH, SLAB_MIN_DEPTH,
};

use crate::color::{depth_color, hex, Rgb};
use crate::data::{world, World};
use crate::gfx::{hash, v3};
use crate::globe::quake_radius;
use crate::DAY;

/// Depth of the core–mantle boundary, km (PREM).
pub const CMB: f32 = 2891.0;
/// Depth shown by default: just below the deepest earthquakes.
pub const DEPTH_UPPER: f32 = 800.0;
/// Depth shown in the whole-mantle view: a band of outer core under the CMB.
pub const DEPTH_CORE: f32 = 3150.0;

/// A named profile, chosen so its band holds a clear slab in this catalogue
/// (checked by `tests/slicer.rs`).
#[derive(Clone, Copy, Debug)]
pub struct Preset {
    pub id: &'static str,
    pub name: &'static str,
    pub profile: Profile,
}

const fn preset(id: &'static str, name: &'static str, a: [f32; 2], b: [f32; 2], half_width: f32) -> Preset {
    Preset { id, name, profile: Profile { a, b, half_width } }
}

/// A is always on the ocean side, so the slab deepens towards B.
pub const PRESETS: [Preset; 7] = [
    preset("tonga", "Tonga", [-21.2, -172.4], [-19.3, 179.6], 100.0),
    preset("japan", "Northeast Japan", [39.6, 145.6], [43.4, 131.4], 200.0),
    preset("andes", "Central Andes", [-22.0, -72.6], [-22.0, -61.6], 100.0),
    preset("kuril", "Kuril Islands", [46.3, 156.2], [50.9, 145.9], 150.0),
    preset("mariana", "Mariana", [19.0, 149.0], [19.0, 141.6], 100.0),
    preset("hindukush", "Hindu Kush", [34.4, 71.9], [38.6, 69.9], 100.0),
    preset("sumatra", "Southern Sumatra", [-5.6, 99.3], [-1.0, 104.2], 200.0),
];

/// Indices into `Slicer::stats`, mirrored by the page script.
pub mod stat {
    pub const VISIBLE: usize = 0;
    pub const BAND_TOTAL: usize = 1;
    pub const DEEP: usize = 2;
    /// 0 too few deep quakes, 1 deep quakes but no coherent zone, 2 line, 3 curve.
    pub const FIT: usize = 3;
    pub const DIP: usize = 4;
    pub const DIP_ERR: usize = 5;
    pub const DIP_TOP: usize = 6;
    pub const DIP_BOTTOM: usize = 7;
    pub const TOP_DEPTH: usize = 8;
    pub const MAX_DEPTH: usize = 9;
    pub const INTERCEPT: usize = 10;
    pub const SCATTER: usize = 11;
    pub const INLIERS: usize = 12;
    pub const LENGTH: usize = 13;
    pub const AZIMUTH: usize = 14;
    pub const TOWARD_B: usize = 15;
    pub const DEEPEST: usize = 16;
    pub const K: usize = 17;
    pub const DIP_LABEL_X: usize = 18;
    pub const DIP_LABEL_Y: usize = 19;
    pub const END_LABEL_X: usize = 20;
    pub const END_LABEL_Y: usize = 21;
    pub const DIST_STEP: usize = 22;
    pub const DEPTH_STEP: usize = 23;
    pub const DEPTH_MAX: usize = 24;
    pub const SHALLOW: usize = 25;
    pub const HALF_WIDTH: usize = 26;
    pub const DIP_AZIMUTH: usize = 27;
    pub const SELECTED_IN_BAND: usize = 28;
    pub const SELECTED_ACROSS: usize = 29;
    pub const HIST_MAX: usize = 30;
    pub const GRID_STEP: usize = 31;
    /// 0 when the dip label runs rightwards from its anchor, 1 leftwards.
    pub const DIP_LABEL_ALIGN: usize = 32;
    /// Along-track km and depth of the fitted zone's shallow and deep ends.
    pub const FIT_ALONG0: usize = 33;
    pub const FIT_DEPTH0: usize = 34;
    pub const FIT_ALONG1: usize = 35;
    pub const FIT_DEPTH1: usize = 36;
    pub const N: usize = 37;
}

/// How the cross-section maps onto the canvas. The Earth's centre is at
/// (`cx`, `cy`) px; along-track distance becomes angle, depth becomes radius.
#[derive(Clone, Copy, Debug, Default)]
pub struct Layout {
    /// Pixels per km (the same both ways: true scale).
    pub k: f32,
    pub cx: f32,
    pub cy: f32,
    /// Half the profile's angular length, radians.
    pub half: f32,
    pub dmax: f32,
    /// Whether the depth histogram is drawn beside the wedge.
    pub hist: bool,
}

impl Layout {
    /// Canvas position of (along km, depth km).
    #[inline]
    pub fn xy(&self, along: f32, depth: f32) -> [f32; 2] {
        let phi = along / R_EARTH - self.half;
        let rho = (R_EARTH - depth) * self.k;
        [self.cx + rho * phi.sin(), self.cy - rho * phi.cos()]
    }
    /// (along km, depth km) under a canvas position.
    pub fn inverse(&self, x: f32, y: f32) -> (f32, f32) {
        let (dx, dy) = (x - self.cx, self.cy - y);
        ((dx.atan2(dy) + self.half) * R_EARTH, R_EARTH - (dx * dx + dy * dy).sqrt() / self.k)
    }
    /// Unit vector pointing up (away from the centre) at a canvas point.
    fn up(&self, p: [f32; 2]) -> [f32; 2] {
        let (dx, dy) = (p[0] - self.cx, p[1] - self.cy);
        let l = (dx * dx + dy * dy).sqrt().max(1e-6);
        [dx / l, dy / l]
    }
}

#[inline]
fn clamp01(v: f32) -> f32 {
    v.clamp(0.0, 1.0)
}

#[inline]
fn srgb255(h: u32) -> [f32; 3] {
    [((h >> 16) & 0xff) as f32, ((h >> 8) & 0xff) as f32, (h & 0xff) as f32]
}

/// Mantle shading by depth (sRGB hex). Steps at 410 and 660 km mark the transition
/// zone; the outer core below 2891 km is lit warm, like the glass instrument's core.
const SHADE: [(f32, u32); 12] = [
    (0.0, 0x232b40),
    (35.0, 0x1b2237),
    (120.0, 0x161d31),
    (410.0, 0x121a2c),
    (410.5, 0x141832),
    (660.0, 0x11152c),
    (660.5, 0x0f1427),
    (1400.0, 0x0d1222),
    (2600.0, 0x0b0f1d),
    (2891.0, 0x0a0d1a),
    (2891.5, 0x4a2a14),
    (3300.0, 0x5c3416),
];

fn shade_at(d: f32) -> [f32; 3] {
    for w in SHADE.windows(2) {
        if d <= w[1].0 {
            let t = clamp01((d - w[0].0) / (w[1].0 - w[0].0));
            let (a, b) = (srgb255(w[0].1), srgb255(w[1].1));
            return [0, 1, 2].map(|i| a[i] + (b[i] - a[i]) * t);
        }
    }
    srgb255(SHADE[SHADE.len() - 1].1)
}

const LUT_KM: usize = 3300;

pub struct Slicer {
    pub world: &'static World,
    /// Background, light and glow layers; `cv.frame.px` is the finished image.
    pub cv: Canvas,
    pub profile: Profile,
    pub geom: Geom,
    /// Quakes in the band, time order.
    pub band: Vec<BandQuake>,
    tint: Vec<Rgb>,
    /// How many of `band` are at or before the cursor.
    pub visible: usize,
    pub slab: SlabResult,
    fit_for: Option<usize>,
    pub cursor: f32,
    pub depth_max: f32,
    pub selected: Option<usize>,
    pub hover: Option<usize>,
    /// Canvas pixels per CSS pixel (sizes of text margins, lines and dots follow it).
    pub ui: f32,
    pub lay: Layout,
    bg_key: [u32; 5],
    /// Per visible band quake: canvas x, y and core radius from the last render.
    pub screen: Vec<[f32; 3]>,
    /// Along-track km where the profile crosses a plate boundary.
    pub plates_x: Vec<f32>,
    pub stats: [f32; stat::N],
    hist: Vec<u32>,
    shade: Vec<[f32; 3]>,
    /// Background colour by radius (1/8 px steps) and side-face shading by distance.
    radial: Vec<[f32; 3]>,
    radial_fx: Vec<[u32; 3]>,
    side: Vec<[f32; 2]>,
    /// 64×64 tile of dither offsets in [0, 256) (1/256ths of a level).
    dither_fx: Vec<u32>,
}

impl Default for Slicer {
    fn default() -> Self {
        Self::new()
    }
}

impl Slicer {
    pub fn new() -> Self {
        let world = world();
        let profile = PRESETS[0].profile;
        let mut s = Slicer {
            world,
            cv: Canvas::new(),
            profile,
            geom: Geom::new(&profile),
            band: Vec::new(),
            tint: Vec::new(),
            visible: 0,
            slab: SlabResult::None { n: 0, n_deep: 0, why: NoSlab::TooFewDeep },
            fit_for: None,
            cursor: world.quakes.last().map_or(0.0, |q| q.t as f32),
            depth_max: DEPTH_UPPER,
            selected: None,
            hover: None,
            ui: 1.0,
            lay: Layout::default(),
            bg_key: [0; 5],
            screen: Vec::new(),
            plates_x: Vec::new(),
            stats: [0.0; stat::N],
            hist: Vec::new(),
            shade: (0..=LUT_KM).map(|d| shade_at(d as f32)).collect(),
            radial: Vec::new(),
            radial_fx: Vec::new(),
            side: Vec::new(),
            dither_fx: (0..64 * 64u32).map(|i| (hash(i.wrapping_mul(0x9e37_79b9) ^ 0x5bd1_e995) * 256.0) as u32).collect(),
        };
        s.set_profile(profile);
        s
    }

    pub fn resize(&mut self, w: usize, h: usize, ui: f32) {
        self.cv.resize(w, h);
        self.ui = ui.clamp(0.25, 4.0);
        self.bg_key = [0; 5];
    }

    /// Profiles shorter than this are stretched to it (a slice needs some width).
    pub const MIN_LENGTH: f32 = 60.0;

    pub fn set_profile(&mut self, mut p: Profile) {
        p.half_width = p.half_width.clamp(10.0, 1000.0);
        let mut g = Geom::new(&p);
        if g.length < Self::MIN_LENGTH {
            let mid = g.point(g.length / 2.0, 0.0);
            let t = g.tangent(g.length / 2.0);
            let h = Self::MIN_LENGTH / 2.0 / R_EARTH;
            let a = v3::add(v3::scale(mid, h.cos()), v3::scale(t, -h.sin()));
            let b = v3::add(v3::scale(mid, h.cos()), v3::scale(t, h.sin()));
            let (la, lo) = v3::to_latlon(a);
            let (lb, lob) = v3::to_latlon(b);
            p.a = [la, lo];
            p.b = [lb, lob];
            g = Geom::new(&p);
        }
        self.profile = p;
        self.geom = g;
        collect_band(self.world, &g, p.half_width, &mut self.band);
        self.tint.clear();
        self.tint.extend(self.band.iter().map(|q| depth_color(q.depth)));
        crossings(&g, plate_lines(), &mut self.plates_x);
        // Polylines that share a vertex on the line report the crossing twice.
        self.plates_x.dedup_by(|a, b| (*a - *b).abs() < 2.0);
        self.fit_for = None;
        self.refresh();
    }

    pub fn set_cursor(&mut self, t: f32) {
        self.cursor = t;
        self.refresh();
    }

    pub fn set_depth(&mut self, km: f32) {
        self.depth_max = km.clamp(300.0, DEPTH_CORE);
    }

    /// Re-derive the visible prefix and, when it changed, the fit and the stats.
    fn refresh(&mut self) {
        let c = self.cursor;
        self.visible = self.band.partition_point(|q| q.t as f32 <= c);
        if self.fit_for != Some(self.visible) {
            self.slab = fit_slab(&self.band[..self.visible]);
            self.fit_for = Some(self.visible);
        }
        self.fill_stats();
    }

    fn fill_stats(&mut self) {
        use stat::*;
        let s = &mut self.stats;
        let vis = &self.band[..self.visible];
        s[VISIBLE] = vis.len() as f32;
        s[BAND_TOTAL] = self.band.len() as f32;
        s[DEEP] = vis.iter().filter(|q| q.depth >= SLAB_MIN_DEPTH).count() as f32;
        s[SHALLOW] = s[VISIBLE] - s[DEEP];
        s[DEEPEST] = vis.iter().map(|q| q.depth).fold(0.0, f32::max);
        s[LENGTH] = self.geom.length;
        s[AZIMUTH] = self.geom.azimuth(0.0);
        s[HALF_WIDTH] = self.profile.half_width;
        for k in [DIP, DIP_ERR, DIP_TOP, DIP_BOTTOM, TOP_DEPTH, MAX_DEPTH, INTERCEPT, SCATTER, INLIERS, DIP_AZIMUTH, FIT_ALONG0, FIT_DEPTH0, FIT_ALONG1, FIT_DEPTH1] {
            s[k] = f32::NAN;
        }
        match &self.slab {
            SlabResult::None { why, .. } => {
                s[FIT] = if *why == NoSlab::TooFewDeep { 0.0 } else { 1.0 };
            }
            SlabResult::Fit(sl) => {
                s[FIT] = if sl.model == Model::Line { 2.0 } else { 3.0 };
                s[DIP] = sl.dip;
                s[DIP_ERR] = sl.dip_err;
                s[DIP_TOP] = sl.dip_top;
                s[DIP_BOTTOM] = sl.dip_bottom;
                s[TOP_DEPTH] = sl.top_depth;
                s[MAX_DEPTH] = sl.max_depth;
                s[INTERCEPT] = sl.intercept.unwrap_or(f32::NAN);
                s[SCATTER] = sl.scatter;
                s[INLIERS] = sl.inliers as f32;
                s[TOWARD_B] = if sl.toward_b { 1.0 } else { 0.0 };
                let (mid, _) = sl.at(0.5);
                let az = self.geom.azimuth(mid.clamp(0.0, self.geom.length));
                s[DIP_AZIMUTH] = if sl.toward_b { az } else { (az + 180.0) % 360.0 };
                (s[FIT_ALONG0], s[FIT_DEPTH0]) = sl.at(0.0);
                (s[FIT_ALONG1], s[FIT_DEPTH1]) = sl.at(1.0);
            }
        }
        s[SELECTED_IN_BAND] = 0.0;
        s[SELECTED_ACROSS] = f32::NAN;
        if let Some(i) = self.selected {
            if let Some(q) = self.band[..self.visible].iter().find(|q| q.i as usize == i) {
                s[SELECTED_IN_BAND] = 1.0;
                s[SELECTED_ACROSS] = q.across;
            } else if let Some(p) = units().get(i) {
                let (along, across) = self.geom.locate(*p);
                s[SELECTED_ACROSS] = if (0.0..=self.geom.length).contains(&along) { across } else { f32::INFINITY };
            }
        }
    }

    pub fn set_marks(&mut self, selected: Option<usize>, hover: Option<usize>) {
        self.selected = selected.filter(|&i| i < self.world.quakes.len());
        self.hover = hover.filter(|&i| i < self.world.quakes.len());
        self.fill_stats();
    }

    fn layout(&self) -> Layout {
        let (w, h, ui) = (self.cv.frame.w as f32, self.cv.frame.h as f32, self.ui);
        let narrow = w / ui < 560.0;
        let hist = !narrow;
        let (ml, mr, mt, mb) = if narrow { (48.0, 12.0, 54.0, 30.0) } else { (56.0, 84.0, 62.0, 40.0) };
        let (ml, mr, mt, mb) = (ml * ui, mr * ui, mt * ui, mb * ui);
        let half = (self.geom.delta / 2.0).max(1e-4);
        let dmax = self.depth_max;
        let rin = R_EARTH - dmax;
        let xmax = if half <= std::f32::consts::FRAC_PI_2 { R_EARTH * half.sin() } else { R_EARTH };
        let bottom = if half <= std::f32::consts::FRAC_PI_2 { rin * half.cos() } else { R_EARTH * half.cos() };
        let (aw, ah) = ((w - ml - mr).max(10.0), (h - mt - mb).max(10.0));
        let k = (aw / (2.0 * xmax)).min(ah / (R_EARTH - bottom));
        let extra = ah - k * (R_EARTH - bottom);
        Layout { k, cx: (ml + aw / 2.0).round(), cy: mt + extra * 0.42 + k * R_EARTH, half, dmax, hist }
    }

    /// Distance between labelled ticks along the surface, km.
    fn dist_step(&self, k: f32) -> f32 {
        let min = 74.0 * self.ui;
        [50.0, 100.0, 200.0, 250.0, 500.0, 1000.0, 2000.0, 5000.0].into_iter().find(|s| s * k >= min).unwrap_or(10000.0)
    }

    /// Depth between gridlines and between depth labels, km.
    fn depth_steps(&self, k: f32) -> (f32, f32) {
        let grid = if 100.0 * k >= 7.0 * self.ui { 100.0 } else { 500.0 };
        let label = [100.0, 200.0, 500.0, 1000.0].into_iter().find(|s| s * k >= 48.0 * self.ui).unwrap_or(1000.0);
        (grid, label.max(grid))
    }

    fn build_bg(&mut self) {
        let lay = self.layout();
        let key = [
            self.cv.frame.w as u32,
            self.cv.frame.h as u32,
            self.geom.delta.to_bits(),
            self.depth_max.to_bits(),
            self.ui.to_bits(),
        ];
        self.lay = lay;
        if key == self.bg_key {
            return;
        }
        self.bg_key = key;
        let (w, h, ui) = (self.cv.frame.w, self.cv.frame.h, self.ui);
        let Layout { k, cx, cy, half, dmax, .. } = lay;
        let (sh, ch) = half.sin_cos();
        let rk = R_EARTH * k;
        let rin = (R_EARTH - dmax) * k;
        let outside = srgb255(0x070a13);
        let packo = pack255(outside, 0.0);
        let packo_fx = outside.map(|v| (v * 256.0) as u32);
        let (grid, _) = self.depth_steps(k);
        // Fade the cut at the bottom of the wedge: the mantle carries on below.
        let fade_px = (dmax * 0.07 * k).max(8.0 * ui);
        let haze_px = 64.0 * ui;

        // 1. Everything that depends on the radius alone goes into a table indexed by
        //    r² (no square root per pixel), fine enough for 1/8 px steps in radius, from
        //    the bottom of the wedge to `haze_px` above the surface.
        let rmin = (rin - 1.0).max(0.0);
        let rmax = rk + haze_px;
        let (rmin2, rmax2) = (rmin * rmin, rmax * rmax);
        let mut step2 = 2.0 * rmin.max(32.0) / 8.0;
        step2 = step2.max((rmax2 - rmin2) / 200_000.0);
        let inv_step2 = 1.0 / step2;
        let n = ((rmax2 - rmin2) * inv_step2).ceil() as usize + 2;
        let haze = srgb255(0x2a5aa8);
        let sea = srgb255(0x8fb4e0);
        let teal = srgb255(0x3fb8b0);
        let ember = srgb255(0xffb35c);
        let grid_c = srgb255(0x8a96ad);
        self.radial.clear();
        self.radial.extend((0..n).map(|j| {
            let r = (rmin2 + j as f32 * step2).sqrt();
            let above = r - rk;
            let hz = 0.30 * (-above.max(0.0) / (11.0 * ui)).exp();
            let sky = [0, 1, 2].map(|i| outside[i] + (haze[i] - outside[i]) * hz);
            if above >= 0.5 {
                return sky;
            }
            let depth = R_EARTH - r / k;
            let mut c = self.shade[(depth.clamp(0.0, LUT_KM as f32)) as usize];
            let g = depth / grid;
            let gd = (g - g.round()).abs() * grid * k;
            if depth > grid * 0.5 {
                let l = clamp01(0.6 * ui - gd + 0.5) * 9.0 / 255.0;
                for i in 0..3 {
                    c[i] += l * grid_c[i];
                }
            }
            for (dd, col, a) in [(410.0, teal, 0.30), (660.0, teal, 0.30), (CMB, ember, 0.55)] {
                if dd < dmax {
                    let l = clamp01(0.8 * ui - (depth - dd).abs() * k + 0.5) * a;
                    for i in 0..3 {
                        c[i] += (col[i] - c[i]) * l;
                    }
                }
            }
            let sl = clamp01(0.9 * ui + above + 0.5) * 0.55;
            for i in 0..3 {
                c[i] += (sea[i] - c[i]) * sl;
            }
            let top = clamp01(0.5 - above);
            let fade = clamp01((r - rin) / fade_px);
            [0, 1, 2].map(|i| sky[i] * (1.0 - top) + (outside[i] + (c[i] - outside[i]) * fade) * top)
        }));
        // The same in 8.8 fixed point for the fast path.
        self.radial_fx.clear();
        self.radial_fx.extend(self.radial.iter().map(|c| c.map(|v| (v.clamp(0.0, 254.99) * 256.0) as u32)));
        // Inner shadow along the cut faces and a hairline rim on them, by distance (1/4 px).
        let side_px = 64.0 * ui;
        let ns = (side_px * 4.0) as usize + 1;
        self.side.clear();
        self.side.extend((0..ns).map(|j| {
            let s = j as f32 / 4.0;
            let occl = 1.0 - 0.22 * (-s / (16.0 * ui)).exp();
            let rim = 16.0 * (-s / (0.9 * ui)).exp() / 255.0;
            [occl, rim]
        }));

        // 2. Per pixel. Each row only visits the span that can be inside the wedge or its
        //    haze; most of those pixels take the integer path (table + dither).
        let (radial, radial_fx, sidet, dither) = (&self.radial, &self.radial_fx, &self.side, &self.dither_fx);
        let rin2 = (rin - 0.5).max(0.0).powi(2);
        let rk2 = rk * rk;
        let bg = &mut self.cv.frame.bg;
        let haze_side = 10.0 * ui;
        let nmax = n - 1;
        // The layout puts the centre on a pixel boundary, so columns cx + i and cx − 1 − i
        // mirror each other: same radius, same distance from the nearer side face.
        let cxi = cx as isize;
        for y in 0..h {
            let row = &mut bg[y * w..(y + 1) * w];
            let dy = cy - (y as f32 + 0.5);
            // Half-width of the span from the circle of radius rmax and the side half-planes.
            let rr = rmax2 - dy * dy;
            let mut hi = if rr > 0.0 { rr.sqrt() } else { -1.0 };
            if ch > 1e-6 {
                hi = hi.min((haze_side + dy * sh) / ch);
            } else if dy * sh < -haze_side {
                hi = -1.0;
            }
            if hi < 0.0 {
                row.fill(packo);
                continue;
            }
            let span = (hi + 1.0).ceil() as isize;
            let x0 = (cxi - span).clamp(0, w as isize) as usize;
            let x1 = (cxi + span).clamp(0, w as isize) as usize;
            row[..x0].fill(packo);
            row[x1..].fill(packo);
            let dith = &dither[(y & 63) * 64..(y & 63) * 64 + 64];
            let dy2 = dy * dy;
            let dysh = dy * sh;
            let mut put = |x: isize, v: Result<[u32; 3], [f32; 3]>| {
                if x < x0 as isize || x >= x1 as isize {
                    return;
                }
                let x = x as usize;
                let d = dith[x & 63];
                row[x] = match v {
                    Ok(c) => 0xff00_0000 | ((c[0] + d) >> 8) | (((c[1] + d) >> 8) << 8) | (((c[2] + d) >> 8) << 16),
                    Err(c) => pack255(c, d as f32 / 256.0),
                };
            };
            for i in 0..span {
                let dx = i as f32 + 0.5;
                let r2 = dx * dx + dy2;
                let v = if r2 >= rmax2 || r2 < rin2 {
                    Ok(packo_fx)
                } else {
                    let j = (((r2 - rmin2) * inv_step2) as usize).min(nmax);
                    // Distance from the nearer side face (the same for both mirrored columns).
                    let side = dysh - dx * ch;
                    if side >= side_px || (side >= 0.0 && r2 > rk2) {
                        Ok(radial_fx[j])
                    } else if side < -haze_side {
                        Ok(packo_fx)
                    } else {
                        let mut c = radial[j];
                        if r2 > rk2 {
                            // Haze: fade out past the ends of the arc.
                            let f = clamp01((side + haze_side) / haze_side);
                            for i in 0..3 {
                                c[i] = outside[i] + (c[i] - outside[i]) * f;
                            }
                        } else {
                            let [occl, rim] = sidet[((side.max(0.0)) * 4.0) as usize];
                            let cov = clamp01(side + 0.5);
                            for i in 0..3 {
                                let v = c[i] * occl + rim * grid_c[i];
                                c[i] = outside[i] + (v - outside[i]) * cov;
                            }
                        }
                        Err(c)
                    }
                };
                put(cxi + i, v);
                put(cxi - 1 - i, v);
            }
        }

        // 3. Radial lines: faint distance gridlines inside, ticks above the surface.
        let dstep = self.dist_step(k);
        let minor = dstep / 2.0;
        let n_minor = (self.geom.length / minor).floor() as i32;
        let tick = 7.0 * ui;
        for j in 0..=n_minor {
            let along = j as f32 * minor;
            let major = j % 2 == 0;
            let phi = along / R_EARTH - half;
            let (s, c) = phi.sin_cos();
            let at = |rr: f32| [cx + rr * s, cy - rr * c];
            let len = if major { tick } else { tick * 0.55 };
            bg_line(&mut self.cv.frame.bg, w, h, at(rk + 1.0 * ui), at(rk + len + 1.0 * ui), grid_c, if major { 0.5 } else { 0.32 }, None);
            if major && j > 0 && along < self.geom.length - 1.0 {
                bg_line(&mut self.cv.frame.bg, w, h, at(rk - 1.0), at(rin), grid_c, 0.035, Some((cx, cy, rin, fade_px)));
            }
        }
    }

    /// Dot size scale: CSS-pixel sizes, a little larger on bigger canvases.
    fn dot_scale(&self) -> f32 {
        let css = (self.cv.frame.w.min(self.cv.frame.h) as f32 / self.ui).max(100.0);
        1.35 * self.ui * (css / 640.0).powf(0.45)
    }

    pub fn render(&mut self) {
        self.build_bg();
        self.cv.begin();
        let lay = self.lay;
        let dist_step = self.dist_step(lay.k);
        let (grid, depth_step) = self.depth_steps(lay.k);
        {
            use stat::*;
            self.stats[K] = lay.k;
            self.stats[DIST_STEP] = dist_step;
            self.stats[DEPTH_STEP] = depth_step;
            self.stats[GRID_STEP] = grid;
            self.stats[DEPTH_MAX] = lay.dmax;
            for k in [DIP_LABEL_X, DIP_LABEL_Y, END_LABEL_X, END_LABEL_Y] {
                self.stats[k] = f32::NAN;
            }
        }
        self.draw_hist();
        self.draw_plates();
        self.draw_fit();
        self.draw_quakes();
        self.draw_marks();
        self.cv.compose();
    }

    fn draw_hist(&mut self) {
        let lay = self.lay;
        self.stats[stat::HIST_MAX] = 0.0;
        if !lay.hist {
            return;
        }
        let bin = if lay.dmax > 1000.0 { 50.0 } else { 25.0 };
        let nb = (lay.dmax / bin).ceil() as usize;
        self.hist.clear();
        self.hist.resize(nb, 0);
        for q in &self.band[..self.visible] {
            let b = ((q.depth / bin) as usize).min(nb - 1);
            self.hist[b] += 1;
        }
        // Skip the top bin when scaling: the shallow pile-up would flatten the rest.
        let max = self.hist.iter().skip(1).copied().max().unwrap_or(0).max(1);
        self.stats[stat::HIST_MAX] = max as f32;
        let ui = self.ui;
        let (sh, ch) = lay.half.sin_cos();
        // Outward along the local horizontal at the right edge.
        let out = [ch, sh];
        let len = 56.0 * ui;
        let length = self.geom.length;
        for (b, &n) in self.hist.iter().enumerate() {
            if n == 0 {
                continue;
            }
            let d0 = b as f32 * bin;
            let d1 = (d0 + bin).min(lay.dmax);
            let p0 = lay.xy(length, d0);
            let p1 = lay.xy(length, d1);
            let gap = 8.0 * ui;
            let l = (len * (n as f32 / max as f32).sqrt()).min(len * 1.15);
            let c = depth_color((d0 + d1) / 2.0);
            // Thin quad: base along the edge (inset a little), length outward.
            let inset = 0.16;
            let a = [p0[0] + (p1[0] - p0[0]) * inset + out[0] * gap, p0[1] + (p1[1] - p0[1]) * inset + out[1] * gap];
            let e = [(p1[0] - p0[0]) * (1.0 - 2.0 * inset), (p1[1] - p0[1]) * (1.0 - 2.0 * inset)];
            self.cv.quad(a, e, [out[0] * l, out[1] * l], c, 0.022);
        }
    }

    fn draw_plates(&mut self) {
        let lay = self.lay;
        let ui = self.ui;
        let teal = hex(0x3fb8b0);
        for &x in &self.plates_x {
            let p = lay.xy(x, 0.0);
            let up = lay.up(p);
            let a = [p[0] + up[0] * 2.5 * ui, p[1] + up[1] * 2.5 * ui];
            let b = [p[0] + up[0] * 13.0 * ui, p[1] + up[1] * 13.0 * ui];
            self.cv.thick_line(a, b, 0.8 * ui, teal, 0.5);
            // A small chevron pointing down at the boundary.
            let side = [-up[1], up[0]];
            for s in [-1.0, 1.0] {
                let c = [a[0] + side[0] * s * 4.0 * ui + up[0] * 4.0 * ui, a[1] + side[1] * s * 4.0 * ui + up[1] * 4.0 * ui];
                self.cv.thick_line(c, a, 0.7 * ui, teal, 0.45);
            }
        }
    }

    fn draw_fit(&mut self) {
        let lay = self.lay;
        let ui = self.ui;
        let Some(sl) = self.slab.slab() else {
            return;
        };
        let n = 64;
        let pts: Vec<[f32; 2]> = (0..=n)
            .map(|j| {
                let (a, d) = sl.at(j as f32 / n as f32);
                lay.xy(a, d)
            })
            .collect();
        let warm = hex(0xfff1dc);
        let ember = hex(0xffb35c);
        // The seismic zone: a soft ridge of width ±scatter in the glow layer.
        let sig_q = (sl.scatter * lay.k / 4.0).max(0.9);
        let mut acc = 0.0f32;
        let step = (sig_q * 0.6).max(0.5) * 4.0;
        for w in pts.windows(2) {
            let (a, b) = (w[0], w[1]);
            let seg = ((b[0] - a[0]).powi(2) + (b[1] - a[1]).powi(2)).sqrt();
            let mut t = acc;
            while t < seg {
                let f = t / seg;
                let x = a[0] + (b[0] - a[0]) * f;
                let y = a[1] + (b[1] - a[1]) * f;
                self.cv.glow_splat(x, y, sig_q, ember, 0.008 * step / (sig_q * 4.0));
                t += step;
            }
            acc = t - seg;
        }
        // The fitted curve.
        for w in pts.windows(2) {
            self.cv.thick_line(w[0], w[1], 0.8 * ui, warm, 0.3);
            self.cv.glow_line(w[0], w[1], 0.9, ember, 0.02);
        }
        // Updip extension to the surface, dashed, kept inside the section.
        if let Some(x0) = sl.intercept {
            let top = pts[0];
            let s = lay.xy(x0, 0.0);
            let (dx, dy) = (s[0] - top[0], s[1] - top[1]);
            let l = (dx * dx + dy * dy).sqrt();
            let length = self.geom.length;
            let inside = |p: [f32; 2]| (0.0..=length).contains(&lay.inverse(p[0], p[1]).0);
            if l > 1.0 {
                let (dash, gap) = (6.0 * ui, 5.0 * ui);
                let mut t = 0.0;
                while t < l {
                    let t1 = (t + dash).min(l);
                    let a = [top[0] + dx * t / l, top[1] + dy * t / l];
                    let b = [top[0] + dx * t1 / l, top[1] + dy * t1 / l];
                    if !(inside(a) && inside(b)) {
                        break;
                    }
                    self.cv.thick_line(a, b, 0.7 * ui, warm, 0.28);
                    t += dash + gap;
                }
                if inside(s) {
                    let up = lay.up(s);
                    self.cv.disc(s[0] - up[0] * 0.5, s[1] - up[1] * 0.5, 2.2 * ui, ember, 0.8);
                }
            }
        }
        // Deep end: a short cross-tick, and where the label goes.
        let end = pts[n];
        let td = [end[0] - pts[n - 1][0], end[1] - pts[n - 1][1]];
        let tl = (td[0] * td[0] + td[1] * td[1]).sqrt().max(1e-6);
        let tdir = [td[0] / tl, td[1] / tl];
        let perp = [-tdir[1], tdir[0]];
        let e0 = [end[0] - perp[0] * 6.0 * ui, end[1] - perp[1] * 6.0 * ui];
        let e1 = [end[0] + perp[0] * 6.0 * ui, end[1] + perp[1] * 6.0 * ui];
        self.cv.thick_line(e0, e1, 0.8 * ui, warm, 0.5);
        let lab = [end[0] + tdir[0] * 14.0 * ui, end[1] + tdir[1] * 14.0 * ui];
        self.stats[stat::END_LABEL_X] = lab[0];
        self.stats[stat::END_LABEL_Y] = lab[1];

        // Protractor at the middle of the zone: the local horizontal (towards the side
        // the slab deepens to) and an arc down to the slab.
        let m = pts[n / 2];
        let sd = [pts[n / 2 + 1][0] - pts[n / 2 - 1][0], pts[n / 2 + 1][1] - pts[n / 2 - 1][1]];
        let sdl = (sd[0] * sd[0] + sd[1] * sd[1]).sqrt().max(1e-6);
        let sdir = [sd[0] / sdl, sd[1] / sdl];
        let up = lay.up(m);
        let mut hz = [-up[1], up[0]]; // towards B
        if hz[0] * sdir[0] + hz[1] * sdir[1] < 0.0 {
            hz = [-hz[0], -hz[1]];
        }
        let ink = hex(0xece6d9);
        let rl = 58.0 * ui;
        let (dash, gap) = (4.0 * ui, 4.0 * ui);
        let mut t = 4.0 * ui;
        while t < rl {
            let t1 = (t + dash).min(rl);
            self.cv.line([m[0] + hz[0] * t, m[1] + hz[1] * t], [m[0] + hz[0] * t1, m[1] + hz[1] * t1], ink, 0.35);
            t += dash + gap;
        }
        let ra = 34.0 * ui;
        let a0 = hz[1].atan2(hz[0]);
        let mut a1 = sdir[1].atan2(sdir[0]);
        while a1 - a0 > std::f32::consts::PI {
            a1 -= std::f32::consts::TAU;
        }
        while a0 - a1 > std::f32::consts::PI {
            a1 += std::f32::consts::TAU;
        }
        let segs = 20;
        let mut prev = [m[0] + ra * a0.cos(), m[1] + ra * a0.sin()];
        for j in 1..=segs {
            let a = a0 + (a1 - a0) * j as f32 / segs as f32;
            let p = [m[0] + ra * a.cos(), m[1] + ra * a.sin()];
            self.cv.thick_line(prev, p, 0.6 * ui, ink, 0.32);
            prev = p;
        }
        self.cv.disc(m[0], m[1], 2.0 * ui, warm, 0.7);
        // The label sits above the reference ray, running away from the slab.
        self.stats[stat::DIP_LABEL_X] = m[0] + hz[0] * 12.0 * ui + up[0] * 9.0 * ui;
        self.stats[stat::DIP_LABEL_Y] = m[1] + hz[1] * 12.0 * ui + up[1] * 9.0 * ui;
        self.stats[stat::DIP_LABEL_ALIGN] = if hz[0] >= 0.0 { 0.0 } else { 1.0 };
    }

    fn draw_quakes(&mut self) {
        let lay = self.lay;
        let s = self.dot_scale();
        let hw = self.profile.half_width.max(1.0);
        let cursor = self.cursor;
        self.screen.clear();
        for (bq, &c) in self.band[..self.visible].iter().zip(&self.tint) {
            let p = lay.xy(bq.along, bq.depth);
            let u = bq.across / hw;
            let fade = 1.0 - 0.72 * u * u;
            let age = cursor - bq.t as f32;
            let flash = if age < 25.0 * DAY { 1.0 + 3.0 * (-age / (3.0 * DAY)).exp() } else { 1.0 };
            let rad = quake_radius(bq.mag) * s * (0.8 + 0.2 * fade);
            // Shallow quakes (crust and plate interface) are dimmed a little so the
            // slab-depth ones carry the picture.
            let shallow = if bq.depth < SLAB_MIN_DEPTH { 0.62 } else { 1.0 };
            let a = 0.5 * 1.25f32.powf(bq.mag - 4.5) * fade * flash * shallow;
            self.cv.splat(p[0], p[1], rad, c, a);
            self.cv.glow_splat(p[0], p[1], (rad * 0.75).max(0.8), c, a * 0.07 * shallow);
            if bq.mag >= 6.0 {
                self.cv.glow_splat(p[0], p[1], rad * 1.6, c, a * 0.05);
            }
            self.screen.push([p[0], p[1], rad]);
        }
    }

    fn draw_marks(&mut self) {
        let ui = self.ui;
        let lay = self.lay;
        let hover = self.hover.filter(|&i| Some(i) != self.selected);
        for (which, alpha, selected) in [(hover, 0.55f32, false), (self.selected, 1.1, true)] {
            let Some(i) = which else { continue };
            let Some(j) = self.band[..self.visible].iter().position(|q| q.i as usize == i) else { continue };
            let [x, y, r] = self.screen[j];
            let ring = r * 2.2 + 5.0 * ui;
            self.cv.circle(x, y, ring, [1.0, 0.97, 0.9], alpha);
            if selected {
                // Drop a dashed line up to the epicentre on the surface.
                let q = self.band[j];
                let s = lay.xy(q.along, 0.0);
                let (dx, dy) = (s[0] - x, s[1] - y);
                let l = (dx * dx + dy * dy).sqrt();
                let mut t = ring + 2.0 * ui;
                while t < l {
                    let t1 = (t + 3.0 * ui).min(l);
                    self.cv.line([x + dx * t / l, y + dy * t / l], [x + dx * t1 / l, y + dy * t1 / l], [1.0, 0.97, 0.9], 0.3);
                    t += 7.0 * ui;
                }
            }
        }
    }

    /// Nearest drawn quake to a canvas point, favouring big ones.
    pub fn pick(&self, x: f32, y: f32, reach: f32) -> Option<usize> {
        let mut best = None;
        let mut best_score = f32::MAX;
        for (q, s) in self.band[..self.visible.min(self.screen.len())].iter().zip(&self.screen) {
            let d = ((s[0] - x).powi(2) + (s[1] - y).powi(2)).sqrt();
            if d > reach + s[2] * 2.0 {
                continue;
            }
            let score = d - (q.mag - 4.5) * 1.5 * self.ui - (1.0 - (q.across / self.profile.half_width).abs()) * 2.0 * self.ui;
            if score < best_score {
                best_score = score;
                best = Some(q.i as usize);
            }
        }
        best
    }
}

/// Packs sRGB values in 0..255 with a dither offset in [0, 1) (floor of v + d is an
/// unbiased rounding that breaks up banding in the dark gradients).
#[inline]
fn pack255(c: [f32; 3], d: f32) -> u32 {
    let q = |v: f32| (v + d).clamp(0.0, 255.0) as u32;
    0xff00_0000 | q(c[0]) | (q(c[1]) << 8) | (q(c[2]) << 16)
}

/// Anti-aliased 1 px line blended into an opaque sRGB buffer. `fade` = (cx, cy, r0,
/// width): alpha ramps up from radius r0 over `width` px (the wedge's bottom fade).
#[allow(clippy::too_many_arguments)]
fn bg_line(bg: &mut [u32], w: usize, h: usize, a: [f32; 2], b: [f32; 2], col: [f32; 3], alpha: f32, fade: Option<(f32, f32, f32, f32)>) {
    let steep = (b[1] - a[1]).abs() > (b[0] - a[0]).abs();
    let (mut p, mut q) = if steep { ([a[1], a[0]], [b[1], b[0]]) } else { (a, b) };
    if p[0] > q[0] {
        std::mem::swap(&mut p, &mut q);
    }
    let span = q[0] - p[0];
    let grad = if span < 1e-4 { 0.0 } else { (q[1] - p[1]) / span };
    let limit = if steep { h } else { w } as f32;
    let start = (p[0] - 0.5).round().max(0.0) as i32;
    let end = (q[0] - 0.5).round().min(limit - 1.0) as i32;
    for i in start..=end {
        let yy = p[1] + grad * (i as f32 + 0.5 - p[0]) - 0.5;
        let fy = yy.floor();
        let f = yy - fy;
        for (v, cov) in [(fy as i32, 1.0 - f), (fy as i32 + 1, f)] {
            let (x, y) = if steep { (v, i) } else { (i, v) };
            if x < 0 || y < 0 || x as usize >= w || y as usize >= h {
                continue;
            }
            let mut al = alpha * cov;
            if let Some((cx, cy, r0, fw)) = fade {
                let r = ((x as f32 + 0.5 - cx).powi(2) + (y as f32 + 0.5 - cy).powi(2)).sqrt();
                al *= clamp01((r - r0) / fw);
            }
            let px = &mut bg[y as usize * w + x as usize];
            let c = [(*px & 0xff) as f32, ((*px >> 8) & 0xff) as f32, ((*px >> 16) & 0xff) as f32];
            *px = pack255([0, 1, 2].map(|k| c[k] + (col[k] - c[k]) * al), 0.5);
        }
    }
}

/// The fit of a preset over the whole catalogue.
pub fn preset_fit(k: usize) -> SlabResult {
    let p = PRESETS[k].profile;
    let mut band = Vec::new();
    collect_band(world(), &Geom::new(&p), p.half_width, &mut band);
    fit_slab(&band)
}

/// What the page says about a profile, over the whole catalogue (indices as in the
/// page's `PF`): 0 dip, 1 deepest fitting quake, 2 quakes at slab depth, 3 of those
/// fitting, 4 band quakes 500 km or deeper, 5 deepest band quake, 6 band quakes,
/// 7–8 the largest depth gap between slab-depth quakes (top, bottom), 9 shallowest
/// fitting quake, 10 how far the fitted zone runs along the profile (km). NaN where
/// there is no fit.
pub fn profile_stats(p: &Profile) -> [f32; 11] {
    let mut band = Vec::new();
    collect_band(world(), &Geom::new(p), p.half_width, &mut band);
    let mut deep: Vec<f32> = band.iter().map(|q| q.depth).filter(|&d| d >= SLAB_MIN_DEPTH).collect();
    deep.sort_by(f32::total_cmp);
    let gap = deep.windows(2).map(|w| (w[0], w[1])).max_by(|a, b| (a.1 - a.0).total_cmp(&(b.1 - b.0))).unwrap_or((f32::NAN, f32::NAN));
    let mut out = [f32::NAN; 11];
    out[2] = deep.len() as f32;
    out[4] = band.iter().filter(|q| q.depth >= 500.0).count() as f32;
    out[5] = band.iter().map(|q| q.depth).fold(0.0, f32::max);
    out[6] = band.len() as f32;
    out[7] = gap.0;
    out[8] = gap.1;
    if let SlabResult::Fit(s) = fit_slab(&band) {
        out[0] = s.dip;
        out[1] = s.max_depth;
        out[3] = s.inliers as f32;
        out[9] = s.top_depth;
        out[10] = (s.at(1.0).0 - s.at(0.0).0).abs();
    }
    out
}

/// `profile_stats` for preset `k`.
pub fn preset_stats(k: usize) -> [f32; 11] {
    profile_stats(&PRESETS[k].profile)
}

#[cfg(target_arch = "wasm32")]
mod exports {
    use super::*;
    use std::cell::RefCell;

    thread_local! {
        static S: RefCell<Option<Slicer>> = const { RefCell::new(None) };
        static PRESET_STATS: RefCell<Vec<[f32; 11]>> = const { RefCell::new(Vec::new()) };
    }

    fn with<R>(f: impl FnOnce(&mut Slicer) -> R) -> R {
        S.with(|s| f(s.borrow_mut().get_or_insert_with(Slicer::new)))
    }

    #[no_mangle]
    pub extern "C" fn slicer_init() {
        with(|_| ())
    }

    /// Canvas size in px and canvas px per CSS px.
    #[no_mangle]
    pub extern "C" fn slicer_resize(w: u32, h: u32, ui: f32) {
        with(|s| s.resize(w as usize, h as usize, ui))
    }

    /// Sets the profile; returns how many quakes are in its band.
    #[no_mangle]
    pub extern "C" fn slicer_profile(lat1: f32, lon1: f32, lat2: f32, lon2: f32, half_width: f32) -> u32 {
        with(|s| {
            s.set_profile(Profile { a: [lat1, lon1], b: [lat2, lon2], half_width });
            s.band.len() as u32
        })
    }

    /// Current endpoints: 0 lat A, 1 lon A, 2 lat B, 3 lon B, 4 half-width.
    #[no_mangle]
    pub extern "C" fn slicer_end(k: u32) -> f32 {
        with(|s| match k {
            0 => s.profile.a[0],
            1 => s.profile.a[1],
            2 => s.profile.b[0],
            3 => s.profile.b[1],
            _ => s.profile.half_width,
        })
    }

    /// Lat (axis 0) or lon (axis 1) of a point given in profile coordinates (km).
    #[no_mangle]
    pub extern "C" fn slicer_geo(along: f32, across: f32, axis: u32) -> f32 {
        with(|s| {
            let (la, lo) = v3::to_latlon(s.geom.point(along, across));
            if axis == 0 {
                la
            } else {
                lo
            }
        })
    }

    /// Slides the profile sideways by `km` (positive: to the left of A→B).
    #[no_mangle]
    pub extern "C" fn slicer_shift(km: f32) {
        with(|s| {
            let p = shift(&s.profile, km);
            s.set_profile(p)
        })
    }

    /// Moves the profile rigidly so the point `from` lands on `to`.
    #[no_mangle]
    pub extern "C" fn slicer_carry(lat1: f32, lon1: f32, lat2: f32, lon2: f32) {
        with(|s| {
            let p = carry(&s.profile, [lat1, lon1], [lat2, lon2]);
            s.set_profile(p)
        })
    }

    /// Profile across the local trend through quake `i`. Returns the elongation of
    /// the nearby epicentre cloud ×1000 (how well defined the trend is).
    #[no_mangle]
    pub extern "C" fn slicer_auto(i: u32) -> u32 {
        with(|s| {
            let a = auto_profile(s.world, i as usize, 300.0, s.profile.half_width);
            s.set_profile(a.profile);
            (a.elongation * 1000.0) as u32
        })
    }

    #[no_mangle]
    pub extern "C" fn slicer_depth(km: f32) {
        with(|s| s.set_depth(km))
    }

    #[no_mangle]
    pub extern "C" fn slicer_cursor(t: f32) {
        with(|s| s.set_cursor(t))
    }

    /// Selected and hovered quake (−1 for none).
    #[no_mangle]
    pub extern "C" fn slicer_marks(selected: i32, hover: i32) {
        with(|s| s.set_marks((selected >= 0).then_some(selected as usize), (hover >= 0).then_some(hover as usize)))
    }

    /// Renders; returns how many band quakes are drawn.
    #[no_mangle]
    pub extern "C" fn slicer_render() -> u32 {
        with(|s| {
            s.render();
            s.visible as u32
        })
    }

    #[no_mangle]
    pub extern "C" fn slicer_pixels() -> *const u32 {
        with(|s| s.cv.frame.px.as_ptr())
    }

    #[no_mangle]
    pub extern "C" fn slicer_pick(x: f32, y: f32, reach: f32) -> i32 {
        with(|s| s.pick(x, y, reach).map_or(-1, |i| i as i32))
    }

    /// Canvas position of (along km, depth km) in the last layout: axis 0 x, 1 y.
    #[no_mangle]
    pub extern "C" fn slicer_xy(along: f32, depth: f32, axis: u32) -> f32 {
        with(|s| s.lay.xy(along, depth)[axis as usize & 1])
    }

    /// (along km, axis 0) or (depth km, axis 1) under a canvas position.
    #[no_mangle]
    pub extern "C" fn slicer_at(x: f32, y: f32, axis: u32) -> f32 {
        with(|s| {
            let (a, d) = s.lay.inverse(x, y);
            if axis == 0 {
                a
            } else {
                d
            }
        })
    }

    /// One of `stat::*`.
    #[no_mangle]
    pub extern "C" fn slicer_stat(k: u32) -> f32 {
        with(|s| s.stats.get(k as usize).copied().unwrap_or(f32::NAN))
    }

    /// Where quake `i` sits relative to the profile: axis 0 along-track km from A,
    /// 1 across-track km (positive to the left of A→B).
    #[no_mangle]
    pub extern "C" fn slicer_locate(i: u32, axis: u32) -> f32 {
        with(|s| match units().get(i as usize) {
            Some(p) => {
                let (a, c) = s.geom.locate(*p);
                if axis == 0 {
                    a
                } else {
                    c
                }
            }
            None => f32::NAN,
        })
    }

    #[no_mangle]
    pub extern "C" fn slicer_crossings() -> u32 {
        with(|s| s.plates_x.len() as u32)
    }

    #[no_mangle]
    pub extern "C" fn slicer_crossing(k: u32) -> f32 {
        with(|s| s.plates_x.get(k as usize).copied().unwrap_or(f32::NAN))
    }

    #[no_mangle]
    pub extern "C" fn slicer_presets() -> u32 {
        PRESETS.len() as u32
    }

    #[no_mangle]
    pub extern "C" fn slicer_preset_name_ptr(k: u32) -> *const u8 {
        PRESETS[k as usize % PRESETS.len()].name.as_ptr()
    }

    #[no_mangle]
    pub extern "C" fn slicer_preset_name_len(k: u32) -> u32 {
        PRESETS[k as usize % PRESETS.len()].name.len() as u32
    }

    #[no_mangle]
    pub extern "C" fn slicer_preset_id_ptr(k: u32) -> *const u8 {
        PRESETS[k as usize % PRESETS.len()].id.as_ptr()
    }

    #[no_mangle]
    pub extern "C" fn slicer_preset_id_len(k: u32) -> u32 {
        PRESETS[k as usize % PRESETS.len()].id.len() as u32
    }

    /// Preset geometry: 0 lat A, 1 lon A, 2 lat B, 3 lon B, 4 half-width.
    #[no_mangle]
    pub extern "C" fn slicer_preset(k: u32, field: u32) -> f32 {
        let p = PRESETS[k as usize % PRESETS.len()].profile;
        match field {
            0 => p.a[0],
            1 => p.a[1],
            2 => p.b[0],
            3 => p.b[1],
            _ => p.half_width,
        }
    }

    /// One of `profile_stats` for any profile, without touching the current one.
    #[no_mangle]
    pub extern "C" fn slicer_profile_fit(lat1: f32, lon1: f32, lat2: f32, lon2: f32, half_width: f32, field: u32) -> f32 {
        let st = profile_stats(&Profile { a: [lat1, lon1], b: [lat2, lon2], half_width });
        st.get(field as usize).copied().unwrap_or(f32::NAN)
    }

    /// One of `preset_stats(k)`, computed once for all presets.
    #[no_mangle]
    pub extern "C" fn slicer_preset_fit(k: u32, field: u32) -> f32 {
        PRESET_STATS.with(|c| {
            let mut c = c.borrow_mut();
            if c.is_empty() {
                c.extend((0..PRESETS.len()).map(preset_stats));
            }
            c.get(k as usize).and_then(|v| v.get(field as usize)).copied().unwrap_or(f32::NAN)
        })
    }
}
