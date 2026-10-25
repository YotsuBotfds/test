//! The quakes-per-day strip under the surface globe, drawn into its own RGBA buffer
//! (transparent where there are no bars, so the page shows through).

use crate::color::{hex, pack};
use crate::data::World;

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
