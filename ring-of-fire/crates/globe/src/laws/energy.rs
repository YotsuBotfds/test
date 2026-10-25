//! Panel C: the energy map. A two-level squarified treemap, magnitude class then
//! quake, each tile's area proportional to radiated energy and its colour the
//! quake's depth. Tiles are cushion-shaded (van Wijk & van de Wetering 1999) into
//! the background once per layout; quakes too small to see are drawn as glowing
//! specks inside their class's dust region, laid out shallow to deep.

use super::plot::{ov, tok, Cache, EMBER, INK};
use super::stats::Budget;
use super::treemap::{Dust, EnergyMap, Rect};
use crate::color::{mix, Rgb};
use crate::data::Quake;
use crate::gfx::{hash, Frame};

#[derive(Default)]
pub struct EnergyView {
    pub frame: Frame,
    pub k: f32,
    pub map: EnergyMap,
    pub area: Rect,
    pub hover: Option<usize>,
    pub hover_dust: Option<usize>,
    pub selected: Option<usize>,
    pub class_hl: Option<usize>,
    pub min_area: f64,
    cache: Cache,
    specks: Vec<Speck>,
}

const GAP: u32 = 0x03050a;
/// Light direction for the cushions (towards the viewer, from the top left).
const LIGHT: [f32; 3] = [-0.19, -0.29, 0.938];

#[derive(Clone, Copy, Default)]
struct Cushion {
    s1x: f32,
    s2x: f32,
    s1y: f32,
    s2y: f32,
}

impl Cushion {
    fn ridge(mut self, r: &Rect, h: f32) -> Self {
        let (x1, x2, y1, y2) = (r.x0 as f32, r.x1 as f32, r.y0 as f32, r.y1 as f32);
        if x2 - x1 > 1e-3 {
            self.s1x += 4.0 * h * (x2 + x1) / (x2 - x1);
            self.s2x -= 4.0 * h / (x2 - x1);
        }
        if y2 - y1 > 1e-3 {
            self.s1y += 4.0 * h * (y2 + y1) / (y2 - y1);
            self.s2y -= 4.0 * h / (y2 - y1);
        }
        self
    }
}

/// One dust speck: position, peak brightness and quake.
#[derive(Clone, Copy)]
struct Speck {
    x: f32,
    y: f32,
    a: f32,
    i: u32,
}

impl EnergyView {
    pub fn new() -> Self {
        let mut v = EnergyView::default();
        v.frame.bloom = 0.0;
        v
    }

    pub fn resize(&mut self, w: usize, h: usize, k: f32) {
        self.frame.resize(w, h);
        self.k = k.max(0.5);
        self.cache.valid = false;
    }

    pub fn layout(&mut self, b: &Budget, depth: &[f32]) {
        let (w, h) = (self.frame.w as f64, self.frame.h as f64);
        self.area = Rect::new(0.0, 0.0, w, h);
        let k = self.k as f64;
        // A tile must be at least ~3.7 CSS px on a side to be drawn as a tile.
        self.min_area = 14.0 * k * k;
        let gap = (2.0 * k).round().max(2.0);
        self.map = EnergyMap::layout(b, depth, self.area, self.min_area, gap);
        // Dust specks carry the same light per unit area as their region as a whole,
        // so dense regions read as an even glow and sparse ones as distinct stars.
        let sigma = 0.6 * self.k;
        let base = 0.13;
        self.specks.clear();
        for d in &self.map.dust {
            let cell = (d.rect.w() * d.rect.h()) as f32 / (d.cols * d.rows) as f32;
            let mean_e = d.energy / d.members.len().max(1) as f64;
            let peak0 = base * cell / (std::f32::consts::TAU * sigma * sigma);
            for (slot, &i) in d.members.iter().enumerate() {
                let (x, y) = Self::speck(d, slot, i);
                let a = (peak0 * (b.energy[i] / mean_e) as f32).min(6.0);
                self.specks.push(Speck { x, y, a, i: i as u32 });
            }
        }
        self.cache.valid = false;
    }

    /// Speck position of dust member `slot` (quake `i`): its grid cell plus a fixed jitter.
    pub fn speck(d: &Dust, slot: usize, i: usize) -> (f32, f32) {
        let (cx, cy) = d.cell(slot);
        let (cw, ch) = (d.rect.w() / d.cols as f64, d.rect.h() / d.rows as f64);
        let jx = (hash(i as u32 * 2 + 1) as f64 - 0.5) * 0.45 * cw;
        let jy = (hash(i as u32 * 2 + 7_777) as f64 - 0.5) * 0.45 * ch;
        ((cx + jx) as f32, (cy + jy) as f32)
    }

    fn paint_bg(&mut self, q: &[Quake], tint: &[Rgb]) {
        let f = &mut self.frame;
        let gap = tok(GAP);
        let gap_px = f.pack(gap);
        f.bg.fill(gap_px);
        let classes: Vec<Cushion> = self.map.classes.iter().map(|r| Cushion::default().ridge(r, 0.32)).collect();
        let half = 0.5;
        let mut cols = Vec::new();
        for t in &self.map.tiles {
            let cu = classes[t.class].ridge(&t.rect, 0.26);
            fill_cushion(f, &t.rect.inset(half), &cu, &Lut::tile(tint[t.quake]), &mut cols);
        }
        for d in &self.map.dust {
            let cu = classes[d.class].ridge(&d.rect, 0.12);
            // A dark ground tinted by the members' mean depth colour.
            let mut acc = [0.0f32; 3];
            for &i in &d.members {
                for (a, c) in acc.iter_mut().zip(tint[i]) {
                    *a += c;
                }
            }
            let n = d.members.len().max(1) as f32;
            let ground = mix(gap, acc.map(|v| v / n), 0.07);
            let lut = Lut::from_fn(|d| ground.map(|v| v * (0.68 + 0.47 * d * d * d)));
            fill_cushion(f, &d.rect.inset(half), &cu, &lut, &mut cols);
        }
        let _ = q;
    }

    /// Draws the map: the tiles, dust and bloom are rendered once per layout and
    /// cached; highlights for hover, selection and a class are drawn over them.
    pub fn render(&mut self, q: &[Quake], tint: &[Rgb]) {
        if !self.cache.restore(&mut self.frame) {
            self.paint_bg(q, tint);
            self.frame.clear();
            let sigma = 0.6 * self.k;
            let f = &mut self.frame;
            for s in &self.specks {
                f.splat(s.x, s.y, sigma, tint[s.i as usize], s.a);
            }
            self.frame.finish();
            self.cache.store(&self.frame);
        }
        self.overlay();
    }

    fn overlay(&mut self) {
        let k = self.k;
        let f = &mut self.frame;
        let (ink, ember) = (ov::rgb(INK), ov::rgb(EMBER));
        let edge = |r: &Rect| (r.x0 as f32, r.y0 as f32, r.x1 as f32, r.y1 as f32);
        if let Some(r) = self.class_hl.and_then(|c| self.map.classes.get(c)) {
            let (x0, y0, x1, y1) = edge(r);
            ov::outline(f, x0, y0, x1, y1, 2.0 * k, ember, 0.9);
        }
        if let Some(d) = self.hover_dust.and_then(|d| self.map.dust.get(d)) {
            let (x0, y0, x1, y1) = edge(&d.rect.inset(0.5));
            ov::outline(f, x0, y0, x1, y1, 1.0 * k, ink, 0.45);
        }
        for (who, strong) in [(self.hover, false), (self.selected, true)] {
            let Some(i) = who else { continue };
            if let Some(t) = self.map.tiles.get(self.map.tile_of[i]) {
                let (x0, y0, x1, y1) = edge(&t.rect.inset(0.5));
                if strong {
                    // A soft halo outside the tile, then a bright rim.
                    ov::outline(f, x0 - 3.0 * k, y0 - 3.0 * k, x1 + 3.0 * k, y1 + 3.0 * k, 3.0 * k, ink, 0.14);
                    ov::outline(f, x0, y0, x1, y1, 1.5 * k, ink, 0.95);
                } else {
                    // A light wash on small tiles; big ones only get the rim.
                    if (x1 - x0) * (y1 - y0) < 40_000.0 * k * k {
                        ov::rect(f, x0, y0, x1, y1, ink, 0.08);
                    }
                    ov::outline(f, x0, y0, x1, y1, 1.0 * k, ink, 0.7);
                }
            } else if let Some(d) = self.map.dust.get(self.map.dust_of[i]) {
                if let Some(slot) = d.members.iter().position(|&m| m == i) {
                    let (sx, sy) = Self::speck(d, slot, i);
                    ov::disc(f, sx, sy, 1.4 * k, ink, if strong { 1.0 } else { 0.8 });
                    ov::circle(f, sx, sy, if strong { 6.5 } else { 5.0 } * k, ink, if strong { 1.0 } else { 0.75 });
                }
            }
        }
    }

    /// Quake under the pointer (tile, or speck within a dust region) and the dust
    /// region it belongs to, if any.
    pub fn pick(&self, x: f32, y: f32) -> (Option<usize>, Option<usize>) {
        let (x, y) = (x as f64, y as f64);
        if let Some(t) = self.map.tiles.iter().find(|t| t.rect.contains(x, y)) {
            return (Some(t.quake), None);
        }
        for (di, d) in self.map.dust.iter().enumerate() {
            if d.rect.contains(x, y) {
                return (d.member_at(x, y), Some(di));
            }
        }
        (None, None)
    }

    /// Where quake `i` is drawn: tile rectangle, or a 1 px box around its speck.
    pub fn where_is(&self, i: usize) -> Option<Rect> {
        if let Some(t) = self.map.tiles.get(*self.map.tile_of.get(i)?) {
            return Some(t.rect);
        }
        let d = self.map.dust.get(self.map.dust_of[i])?;
        let slot = d.members.iter().position(|&m| m == i)?;
        let (sx, sy) = Self::speck(d, slot, i);
        Some(Rect::new(sx as f64 - 0.5, sy as f64 - 0.5, sx as f64 + 0.5, sy as f64 + 0.5))
    }
}

/// Paints a cushion-shaded rectangle into the opaque background. The cushion normal
/// is separable (its x part depends only on x, its y part only on y), so each column
/// and row is computed once; the light cosine then indexes a packed colour table.
/// Edge pixels blend from what is already there by their coverage.
fn fill_cushion(f: &mut Frame, r: &Rect, cu: &Cushion, lut: &Lut, cols: &mut Vec<[f32; 2]>) {
    if r.w() <= 0.0 || r.h() <= 0.0 {
        return;
    }
    let xa = r.x0.floor().max(0.0) as usize;
    let ya = r.y0.floor().max(0.0) as usize;
    let xb = (r.x1.ceil().max(0.0) as usize).min(f.w);
    let yb = (r.y1.ceil().max(0.0) as usize).min(f.h);
    let cover = |p: usize, lo: f64, hi: f64| ((p as f64 + 1.0).min(hi) - (p as f64).max(lo)).clamp(0.0, 1.0) as f32;
    cols.clear();
    cols.extend((xa..xb).map(|x| {
        let nx = -(2.0 * cu.s2x * (x as f32 + 0.5) + cu.s1x);
        [nx * LIGHT[0] + LIGHT[2], nx * nx + 1.0]
    }));
    for y in ya..yb {
        let ny = -(2.0 * cu.s2y * (y as f32 + 0.5) + cu.s1y);
        let (nyl, ny2) = (ny * LIGHT[1], ny * ny);
        let cy = cover(y, r.y0, r.y1);
        let row = &mut f.bg[y * f.w + xa..y * f.w + xb];
        for (k, (o, c)) in row.iter_mut().zip(cols.iter()).enumerate() {
            let d = ((c[0] + nyl) / (c[1] + ny2).sqrt()).max(0.0);
            let idx = ((d * Lut::N as f32) as usize).min(Lut::N);
            let x = xa + k;
            let cov = if cy >= 1.0 && x > xa && x + 1 < xb { 1.0 } else { cy * cover(x, r.x0, r.x1) };
            if cov >= 0.999 {
                *o = lut.px[idx];
            } else if cov > 0.0 {
                let old = unpack(*o);
                *o = pack_lin(mix(old, lut.lin[idx], cov));
            }
        }
    }
}

/// Colour as a function of the light cosine d ∈ [0, 1], packed and linear.
struct Lut {
    px: [u32; Lut::N + 1],
    lin: [Rgb; Lut::N + 1],
}

impl Lut {
    const N: usize = 128;

    fn from_fn(f: impl Fn(f32) -> Rgb) -> Self {
        let lin: [Rgb; Lut::N + 1] = std::array::from_fn(|i| f(i as f32 / Lut::N as f32));
        Lut { px: lin.map(pack_lin), lin }
    }

    /// A tile's colour: the cushion shade (steep, so each tile glows from its centre
    /// like an ember) sets OKLab lightness while the hue and most of the chroma are
    /// kept, so dark parts stay a deep version of the depth colour instead of brown.
    fn tile(c: Rgb) -> Self {
        let [l, a, b] = oklab(c);
        Lut::from_fn(|d| {
            let s = 0.15 + 0.95 * d * d * d;
            let ch = 0.62 + 0.38 * s.min(1.0);
            from_oklab([l * (0.3 + 0.56 * s), a * ch, b * ch])
        })
    }
}

fn pack_lin(c: Rgb) -> u32 {
    let b = |v: f32| (crate::color::to_srgb(v) * 255.0 + 0.5) as u32;
    0xff00_0000 | b(c[0]) | (b(c[1]) << 8) | (b(c[2]) << 16)
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

fn unpack(p: u32) -> Rgb {
    let ch = |s: u32| crate::color::to_linear(((p >> s) & 0xff) as f32 / 255.0);
    [ch(0), ch(8), ch(16)]
}
