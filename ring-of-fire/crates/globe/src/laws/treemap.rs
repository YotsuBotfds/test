//! Squarified treemap layout (Bruls, Huizing & van Wijk 2000) and the two-level
//! energy map built from it: magnitude classes, then one tile per quake, with
//! every tile too small to see merged into one "dust" region per class.

use super::stats::Budget;

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Rect {
    pub x0: f64,
    pub y0: f64,
    pub x1: f64,
    pub y1: f64,
}

impl Rect {
    pub fn new(x0: f64, y0: f64, x1: f64, y1: f64) -> Self {
        Rect { x0, y0, x1, y1 }
    }
    pub fn w(&self) -> f64 {
        self.x1 - self.x0
    }
    pub fn h(&self) -> f64 {
        self.y1 - self.y0
    }
    pub fn area(&self) -> f64 {
        self.w().max(0.0) * self.h().max(0.0)
    }
    pub fn contains(&self, x: f64, y: f64) -> bool {
        x >= self.x0 && x < self.x1 && y >= self.y0 && y < self.y1
    }
    pub fn inset(&self, d: f64) -> Rect {
        let dx = d.min(self.w() / 2.0);
        let dy = d.min(self.h() / 2.0);
        Rect::new(self.x0 + dx, self.y0 + dy, self.x1 - dx, self.y1 - dy)
    }
    /// Area of the intersection with another rectangle.
    pub fn overlap(&self, o: &Rect) -> f64 {
        let w = self.x1.min(o.x1) - self.x0.max(o.x0);
        let h = self.y1.min(o.y1) - self.y0.max(o.y0);
        w.max(0.0) * h.max(0.0)
    }
}

/// Worst aspect ratio of a row with total area `sum`, extreme areas `min`/`max`,
/// laid along a side of length `side`.
fn worst(sum: f64, min: f64, max: f64, side: f64) -> f64 {
    let (s2, w2) = (sum * sum, side * side);
    (w2 * max / s2).max(s2 / (w2 * min))
}

/// Lays `values` (sorted largest first, all > 0) into `r`; rectangle i has area
/// proportional to values[i] and the rectangles tile `r` exactly.
pub fn squarify(values: &[f64], r: Rect) -> Vec<Rect> {
    let mut out = Vec::with_capacity(values.len());
    let total: f64 = values.iter().sum();
    if values.is_empty() || total <= 0.0 || r.area() <= 0.0 {
        out.resize(values.len(), Rect::new(r.x0, r.y0, r.x0, r.y0));
        return out;
    }
    let scale = r.area() / total;
    let mut rest = r;
    let n = values.len();
    let mut i = 0;
    while i < n {
        let side = rest.w().min(rest.h());
        let (mut j, mut sum, mut lo, mut hi, mut cur) = (i, 0.0, f64::INFINITY, 0.0f64, f64::INFINITY);
        while j < n {
            let a = values[j] * scale;
            let (ns, nlo, nhi) = (sum + a, lo.min(a), hi.max(a));
            let w = worst(ns, nlo, nhi, side);
            if j > i && w > cur {
                break;
            }
            (sum, lo, hi, cur) = (ns, nlo, nhi, w);
            j += 1;
        }
        let last_row = j == n;
        if rest.w() >= rest.h() {
            // A column at the left edge.
            let x1 = if last_row { rest.x1 } else { rest.x0 + sum / rest.h() };
            let mut y = rest.y0;
            for (k, v) in values.iter().enumerate().take(j).skip(i) {
                // The last tile of a row ends exactly on the edge, so rounding never leaves a gap.
                let y1 = if k + 1 == j { rest.y1 } else { y + v * scale / (x1 - rest.x0) };
                out.push(Rect::new(rest.x0, y, x1, y1));
                y = y1;
            }
            rest.x0 = x1;
        } else {
            // A row along the top edge.
            let y1 = if last_row { rest.y1 } else { rest.y0 + sum / rest.w() };
            let mut x = rest.x0;
            for (k, v) in values.iter().enumerate().take(j).skip(i) {
                let x1 = if k + 1 == j { rest.x1 } else { x + v * scale / (y1 - rest.y0) };
                out.push(Rect::new(x, rest.y0, x1, y1));
                x = x1;
            }
            rest.y0 = y1;
        }
        i = j;
    }
    out
}

/// One quake drawn as its own tile.
#[derive(Clone, Copy, Debug)]
pub struct Tile {
    pub quake: usize,
    pub class: usize,
    pub rect: Rect,
}

/// The quakes of one class too small to draw, merged into one region.
#[derive(Clone, Debug)]
pub struct Dust {
    pub class: usize,
    pub rect: Rect,
    /// Members sorted shallow to deep: the order their specks are laid out in.
    pub members: Vec<usize>,
    pub energy: f64,
    /// Speck grid: columns and rows.
    pub cols: usize,
    pub rows: usize,
}

impl Dust {
    /// Centre of the grid cell holding member `k` (rows run left to right, then back).
    pub fn cell(&self, k: usize) -> (f64, f64) {
        let (row, mut col) = (k / self.cols, k % self.cols);
        if row % 2 == 1 {
            col = self.cols - 1 - col;
        }
        let (cw, ch) = (self.rect.w() / self.cols as f64, self.rect.h() / self.rows as f64);
        (self.rect.x0 + (col as f64 + 0.5) * cw, self.rect.y0 + (row as f64 + 0.5) * ch)
    }

    /// Member whose cell is under a point inside the region.
    pub fn member_at(&self, x: f64, y: f64) -> Option<usize> {
        if !self.rect.contains(x, y) || self.members.is_empty() {
            return None;
        }
        let col = (((x - self.rect.x0) / self.rect.w() * self.cols as f64) as usize).min(self.cols - 1);
        let row = (((y - self.rect.y0) / self.rect.h() * self.rows as f64) as usize).min(self.rows - 1);
        let col = if row % 2 == 1 { self.cols - 1 - col } else { col };
        Some(self.members[(row * self.cols + col).min(self.members.len() - 1)])
    }
}

#[derive(Clone, Debug, Default)]
pub struct EnergyMap {
    pub classes: Vec<Rect>,
    pub tiles: Vec<Tile>,
    pub dust: Vec<Dust>,
    /// Tile index of each quake drawn as a tile, or usize::MAX.
    pub tile_of: Vec<usize>,
    /// Dust region of each quake merged into dust, or usize::MAX.
    pub dust_of: Vec<usize>,
}

impl EnergyMap {
    /// Two-level layout of the budget in `r`. Quakes whose tile would be smaller than
    /// `min_area` (px²) are merged into their class's dust; `class_gap` px separates
    /// classes (tiles keep exact areas within a class).
    pub fn layout(b: &Budget, depth: &[f32], r: Rect, min_area: f64, class_gap: f64) -> Self {
        let n = b.energy.len();
        let mut m = EnergyMap { tile_of: vec![usize::MAX; n], dust_of: vec![usize::MAX; n], ..Default::default() };
        let class_e: Vec<f64> = b.classes.iter().map(|c| c.energy).collect();
        m.classes = squarify(&class_e, r);
        for (ci, (c, cr)) in b.classes.iter().zip(m.classes.clone()).enumerate() {
            let inner = cr.inset(class_gap / 2.0);
            let s = inner.area() / c.energy.max(f64::MIN_POSITIVE);
            // Members are sorted largest first, so the visible ones are a prefix.
            let cut = c.members.iter().position(|&i| b.energy[i] * s < min_area).unwrap_or(c.members.len());
            let (big, small) = c.members.split_at(cut);
            let dust_e: f64 = small.iter().rev().map(|&i| b.energy[i]).sum();
            // Items: visible quakes, plus one dust item, sorted by size.
            let mut items: Vec<(f64, Option<usize>)> = big.iter().map(|&i| (b.energy[i], Some(i))).collect();
            if !small.is_empty() {
                items.push((dust_e, None));
            }
            items.sort_by(|a, b2| b2.0.total_cmp(&a.0));
            let vals: Vec<f64> = items.iter().map(|x| x.0).collect();
            let rects = squarify(&vals, inner);
            for (&(e, who), rect) in items.iter().zip(rects) {
                match who {
                    Some(i) => {
                        m.tile_of[i] = m.tiles.len();
                        m.tiles.push(Tile { quake: i, class: ci, rect });
                    }
                    None => {
                        let mut members = small.to_vec();
                        members.sort_by(|&a, &b2| depth[a].total_cmp(&depth[b2]).then(a.cmp(&b2)));
                        let k = members.len().max(1);
                        let aspect = (rect.w() / rect.h().max(1e-9)).max(1e-3);
                        let cols = ((k as f64 * aspect).sqrt().ceil() as usize).clamp(1, k);
                        let rows = k.div_ceil(cols);
                        for &i in &members {
                            m.dust_of[i] = m.dust.len();
                        }
                        m.dust.push(Dust { class: ci, rect, members, energy: e, cols, rows });
                    }
                }
            }
        }
        m
    }
}
