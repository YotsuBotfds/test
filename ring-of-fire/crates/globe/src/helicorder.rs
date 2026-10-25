//! Instrument 05 Records: a smoked-paper drum seismograph of the whole catalogue,
//! as one seismic station would have recorded it, and its sound.
//!
//! - `travel`: first-arrival times ray-traced through the iasp91 Earth model;
//! - `seis`: each quake's wave packets at the station, and the background noise;
//! - `drum`: per-column envelopes, cached by line, projected onto a turning drum;
//! - `strip`: the three-year overview and the legend's reference trace;
//! - `audio`: the same seismogram sped up into the audible range.

pub mod audio;
pub mod drum;
pub mod seis;
pub mod strip;
pub mod travel;

use crate::data::world;
use drum::{Drum, CLIP};
use seis::{Seis, STATIONS};
use strip::{Reference, Strip};

pub struct Helicorder {
    pub seis: Seis,
    pub drum: Drum,
    pub strip: Strip,
    pub reference: Reference,
    pub clip: Option<audio::Clip>,
    scratch: Vec<u32>,
}

/// Window statistics: see `Helicorder::stats`.
#[derive(Clone, Copy, Debug, Default)]
pub struct Stats {
    pub t0: f64,
    pub t1: f64,
    /// Catalogued origins inside the window.
    pub catalogued: u32,
    /// Quakes whose strongest wave reached the station inside the window at four
    /// times the background level or more.
    pub recorded: u32,
    /// Of those, how many drove the pen to its stops.
    pub clipped: u32,
    pub loudest: Option<usize>,
    /// Loudest signal over the background (rms) level.
    pub loudest_snr: f32,
}

impl Helicorder {
    pub fn new(station: usize) -> Self {
        let station = station.min(STATIONS.len() - 1);
        let w = world();
        let mut drum = Drum::new(w.epoch, station);
        drum.cursor = w.quakes.last().map_or(0.0, |q| q.t as f64);
        Helicorder { seis: Seis::new(station), drum, strip: Strip::new(), reference: Reference::new(), clip: None, scratch: Vec::new() }
    }

    pub fn set_station(&mut self, station: usize) {
        let station = station.min(STATIONS.len() - 1);
        if station != self.seis.station {
            self.seis = Seis::new(station);
            self.drum.set_station(station);
        }
    }

    /// Renders the drum, computing at most `budget` new lines first; returns how
    /// many visible lines are still missing (render again next frame).
    pub fn render(&mut self, budget: usize) -> usize {
        let pending = self.drum.prepare(&self.seis, budget);
        self.drum.render(&self.seis);
        pending
    }

    pub fn pick(&mut self, x: f32, y: f32) -> Option<usize> {
        self.drum.pick(&self.seis, x, y, &mut self.scratch)
    }

    /// The span of time on the drum's face, clipped to the record.
    pub fn window(&self) -> (f64, f64) {
        let (a, b) = self.drum.face_rows();
        let g = &self.drum.grid;
        let t0 = g.start(a).max(0.0);
        let t1 = g.end(b).min(self.drum.cursor).max(t0);
        (t0, t1)
    }

    pub fn stats(&self) -> Stats {
        let (t0, t1) = self.window();
        let w = world();
        let a = w.quakes.partition_point(|q| (q.t as f64) < t0);
        let b = w.quakes.partition_point(|q| (q.t as f64) < t1);
        let mut s = Stats { t0, t1, catalogued: (b - a) as u32, ..Default::default() };
        let noise = self.seis.noise.base;
        let lo = self.seis.events.partition_point(|e| e.t0 < t0 - 86400.0);
        let hi = self.seis.events.partition_point(|e| e.t0 < t1);
        let mut best = 0.0f32;
        for e in &self.seis.events[lo..hi] {
            if e.peak_t < t0 || e.peak_t >= t1 {
                continue;
            }
            let snr = e.peak / noise;
            if snr >= 4.0 {
                s.recorded += 1;
            }
            if e.peak > CLIP {
                s.clipped += 1;
            }
            if snr > best {
                best = snr;
                s.loudest = Some(e.q as usize);
            }
        }
        s.loudest_snr = best;
        s
    }

    /// Records worth jumping to at this station: 0 the loudest quake, 1 the loudest
    /// deep one (300 km or more), 2 the loudest within 30 degrees.
    pub fn notable(&self, which: u32) -> Option<usize> {
        let ok = |e: &&seis::Event| match which {
            0 => true,
            1 => e.depth >= 300.0,
            _ => e.dist < 30.0,
        };
        self.seis.events.iter().filter(ok).max_by(|a, b| a.peak.total_cmp(&b.peak)).map(|e| e.q as usize)
    }

    /// The UTC day whose loudest signal was weakest (ignoring the first and last day).
    pub fn quiet_day(&self) -> usize {
        let d = &self.seis.day_peak;
        if d.len() < 3 {
            return 0;
        }
        (1..d.len() - 1).min_by(|&a, &b| d[a].total_cmp(&d[b])).unwrap_or(0)
    }
}

#[cfg(target_arch = "wasm32")]
mod exports {
    use super::*;
    use std::cell::RefCell;

    thread_local! {
        static STATE: RefCell<Option<Helicorder>> = const { RefCell::new(None) };
        static BUF: RefCell<Vec<f32>> = const { RefCell::new(Vec::new()) };
        static STATS: RefCell<[f64; 8]> = const { RefCell::new([0.0; 8]) };
    }

    fn with<R>(f: impl FnOnce(&mut Helicorder) -> R) -> R {
        STATE.with(|s| f(s.borrow_mut().get_or_insert_with(|| Helicorder::new(0))))
    }

    /// Builds the station's record (travel-time tables are traced on first use).
    #[no_mangle]
    pub extern "C" fn helicorder_init(station: u32) {
        with(|h| h.set_station(station as usize))
    }

    #[no_mangle]
    pub extern "C" fn helicorder_station(station: u32) {
        with(|h| h.set_station(station as usize))
    }

    #[no_mangle]
    pub extern "C" fn helicorder_station_count() -> u32 {
        STATIONS.len() as u32
    }

    /// Station coordinates: axis 0 latitude, 1 longitude (degrees).
    #[no_mangle]
    pub extern "C" fn helicorder_station_coord(i: u32, axis: u32) -> f64 {
        let s = &STATIONS[(i as usize).min(STATIONS.len() - 1)];
        if axis == 0 {
            s.lat
        } else {
            s.lon
        }
    }

    #[no_mangle]
    pub extern "C" fn helicorder_resize(w: u32, h: u32, k: f32) {
        with(|s| s.drum.resize(w as usize, h as usize, k))
    }

    #[no_mangle]
    pub extern "C" fn helicorder_zoom(z: u32) {
        with(|s| s.drum.set_zoom(z as usize))
    }

    #[no_mangle]
    pub extern "C" fn helicorder_set_center(c: f64) {
        with(|s| s.drum.center = c)
    }

    #[no_mangle]
    pub extern "C" fn helicorder_center() -> f64 {
        with(|s| s.drum.center)
    }

    /// Continuous line coordinate (line index + fraction across) of a time.
    #[no_mangle]
    pub extern "C" fn helicorder_pos_of(t: f64) -> f64 {
        with(|s| s.drum.grid.pos(t))
    }

    /// Start time of line k (seconds since the epoch).
    #[no_mangle]
    pub extern "C" fn helicorder_line_start(k: f64) -> f64 {
        with(|s| s.drum.grid.start(k as i64))
    }

    #[no_mangle]
    pub extern "C" fn helicorder_line_end(k: f64) -> f64 {
        with(|s| s.drum.grid.end(k as i64))
    }

    /// First (axis 0) or last (axis 1) line wholly on the drum's face.
    #[no_mangle]
    pub extern "C" fn helicorder_face(axis: u32) -> f64 {
        with(|s| {
            let (a, b) = s.drum.face_rows();
            (if axis == 0 { a } else { b }) as f64
        })
    }

    /// Screen y (canvas px) of a point `defl` line spacings above line k.
    #[no_mangle]
    pub extern "C" fn helicorder_line_y(k: f64, defl: f32) -> f32 {
        with(|s| s.drum.y_of(k as i64, defl))
    }

    /// Fractional line coordinate under a canvas y (NaN off the drum).
    #[no_mangle]
    pub extern "C" fn helicorder_line_at(y: f32) -> f64 {
        with(|s| s.drum.line_at(y))
    }

    /// Layout: 0 trace left edge, 1 trace width, 2 line spacing, 3 drum radius, 4 centre y (canvas px).
    #[no_mangle]
    pub extern "C" fn helicorder_layout(axis: u32) -> f32 {
        with(|s| match axis {
            0 => s.drum.x0 as f32,
            1 => s.drum.ncol as f32,
            2 => s.drum.sp,
            3 => s.drum.rd,
            _ => s.drum.cy,
        })
    }

    /// The record ends here (the page-wide replay cursor).
    #[no_mangle]
    pub extern "C" fn helicorder_cursor(t: f64) {
        with(|s| s.drum.cursor = t)
    }

    #[no_mangle]
    pub extern "C" fn helicorder_select(i: i32) {
        with(|s| s.drum.selected = (i >= 0).then_some(i as usize))
    }

    #[no_mangle]
    pub extern "C" fn helicorder_hover(i: i32) {
        with(|s| s.drum.hover = (i >= 0).then_some(i as usize))
    }

    /// Listening position (seconds since the epoch); negative hides it.
    #[no_mangle]
    pub extern "C" fn helicorder_playhead(t: f64) {
        with(|s| s.drum.playhead = (t >= 0.0).then_some(t))
    }

    /// Computes at most `budget` missing lines, nearest the front first; returns
    /// how many visible lines are still missing (prepare again next frame).
    #[no_mangle]
    pub extern "C" fn helicorder_prepare(budget: u32) -> u32 {
        with(|s| s.drum.prepare(&s.seis, budget as usize) as u32)
    }

    /// Draws the drum from the lines computed so far.
    #[no_mangle]
    pub extern "C" fn helicorder_render() {
        with(|s| s.drum.render(&s.seis))
    }

    #[no_mangle]
    pub extern "C" fn helicorder_pixels() -> *const u32 {
        with(|s| s.drum.frame.px.as_ptr())
    }

    /// Catalogue index of the quake under a canvas point, or -1.
    #[no_mangle]
    pub extern "C" fn helicorder_pick(x: f32, y: f32) -> i32 {
        with(|s| s.pick(x, y).map_or(-1, |i| i as i32))
    }

    /// Time under a canvas point on the nearest line (NaN off the trace area).
    #[no_mangle]
    pub extern "C" fn helicorder_time_at(x: f32, y: f32) -> f64 {
        with(|s| {
            let l = s.drum.line_at(y);
            if !l.is_finite() || (x as usize) < s.drum.x0 {
                return f64::NAN;
            }
            s.drum.time_at(l.round() as i64, x)
        })
    }

    fn put(v: impl IntoIterator<Item = f32>) -> *const f32 {
        BUF.with(|b| {
            let mut b = b.borrow_mut();
            b.clear();
            b.extend(v);
            b.as_ptr()
        })
    }

    #[no_mangle]
    pub extern "C" fn helicorder_buf_len() -> u32 {
        BUF.with(|b| b.borrow().len() as u32)
    }

    /// Origin marks of the last render: (quake, x, y, magnitude) per mark; length via `helicorder_buf_len`.
    #[no_mangle]
    pub extern "C" fn helicorder_marks() -> *const f32 {
        let m = with(|s| s.drum.marks.clone());
        put(m.iter().flat_map(|m| [m.q as f32, m.x, m.y, m.mag]))
    }

    /// Arrival ticks of the selected quake: (x, y, kind) with kind 0 P, 1 PP, 2 S, 3 R1, 4 R2, 5 origin.
    #[no_mangle]
    pub extern "C" fn helicorder_arrivals() -> *const f32 {
        let a = with(|s| s.drum.arrivals.clone());
        put(a.iter().flat_map(|a| *a))
    }

    /// Stylus position after the last render: axis 0 x, 1 y; NaN when off the drum.
    #[no_mangle]
    pub extern "C" fn helicorder_stylus(axis: u32) -> f32 {
        with(|s| s.drum.stylus.map_or(f32::NAN, |p| p[axis.min(1) as usize]))
    }

    /// Window statistics: [t0, t1, catalogued, recorded, clipped, loudest quake (-1), loudest/background, background rms].
    #[no_mangle]
    pub extern "C" fn helicorder_stats() -> *const f64 {
        let st = with(|s| (s.stats(), s.seis.noise.base));
        STATS.with(|b| {
            let mut b = b.borrow_mut();
            let (s, n) = st;
            *b = [s.t0, s.t1, s.catalogued as f64, s.recorded as f64, s.clipped as f64, s.loudest.map_or(-1.0, |i| i as f64), s.loudest_snr as f64, n as f64];
            b.as_ptr()
        })
    }

    /// Per-quake facts at the current station: 0 distance (deg), 1 back-azimuth, 2 P, 3 S,
    /// 4 R1, 5 R2, 6 PP (s after origin; NaN if absent), 7 peak over background,
    /// 8 P branch, 9 S branch (0 none, 1 direct, 2 core, 3 diffracted), 10 peak time after
    /// origin, 11 seconds the pen spends past its stops.
    #[no_mangle]
    pub extern "C" fn helicorder_event(q: u32, field: u32) -> f64 {
        with(|s| {
            let Some(e) = s.seis.event_of(q as usize) else { return f64::NAN };
            let br = |b: travel::Branch| b as u8 as f64;
            match field {
                0 => e.dist as f64,
                1 => e.baz as f64,
                2 => e.t_p as f64,
                3 => e.t_s as f64,
                4 => e.t_r as f64,
                5 => e.t_r2 as f64,
                6 => e.t_pp as f64,
                7 => (e.peak / s.seis.noise.base) as f64,
                8 => br(e.p_branch),
                9 => br(e.s_branch),
                10 => e.peak_t - e.t0,
                _ => e.clip_s as f64,
            }
        })
    }

    /// The loudest signal that peaked on catalogue day `d`, over the background level.
    #[no_mangle]
    pub extern "C" fn helicorder_day_peak(d: u32) -> f32 {
        with(|s| s.seis.day_peak.get(d as usize).copied().unwrap_or(0.0) / s.seis.noise.base)
    }

    #[no_mangle]
    pub extern "C" fn helicorder_quiet_day() -> u32 {
        with(|s| s.quiet_day() as u32)
    }

    #[no_mangle]
    pub extern "C" fn helicorder_notable(which: u32) -> i32 {
        with(|s| s.notable(which).map_or(-1, |i| i as i32))
    }

    // ---------- overview strip ----------

    #[no_mangle]
    pub extern "C" fn helicorder_ov_resize(w: u32, h: u32) {
        with(|s| s.strip.resize(w as usize, h as usize))
    }

    #[no_mangle]
    pub extern "C" fn helicorder_ov_render(mark: f64) {
        with(|s| {
            let win = s.window();
            let cursor = s.drum.cursor;
            s.strip.render(&s.seis, win, cursor, (mark >= 0.0).then_some(mark));
        })
    }

    #[no_mangle]
    pub extern "C" fn helicorder_ov_pixels() -> *const u32 {
        with(|s| s.strip.px.as_ptr())
    }

    // ---------- legend ----------

    #[no_mangle]
    pub extern "C" fn helicorder_ref_render(w: u32, h: u32, k: f32) {
        with(|s| {
            let st = s.seis.station;
            s.reference.render(st, w as usize, h as usize, k)
        })
    }

    #[no_mangle]
    pub extern "C" fn helicorder_ref_pixels() -> *const u32 {
        with(|s| s.reference.px.as_ptr())
    }

    /// Reference trace: fraction across of 0 P, 1 S, 2 surface waves; 3 its span in seconds.
    #[no_mangle]
    pub extern "C" fn helicorder_ref_arrival(which: u32) -> f32 {
        with(|s| if which == 3 { s.reference.span as f32 } else { s.reference.arrival(which) })
    }

    // ---------- sound ----------

    /// Synthesises [t0, t1] at `speed`× real time and returns the frame count.
    #[no_mangle]
    pub extern "C" fn helicorder_audio(t0: f64, t1: f64, speed: f64, rate: f64) -> u32 {
        with(|s| {
            let c = audio::synth(&s.seis, t0, t1, speed, rate);
            let n = c.frames as u32;
            s.clip = Some(c);
            n
        })
    }

    /// Planar stereo samples of the last clip: left then right.
    #[no_mangle]
    pub extern "C" fn helicorder_audio_ptr() -> *const f32 {
        with(|s| s.clip.as_ref().map_or(std::ptr::null(), |c| c.data.as_ptr()))
    }

    /// 0 peak, 1 rms of the last clip.
    #[no_mangle]
    pub extern "C" fn helicorder_audio_level(which: u32) -> f32 {
        with(|s| s.clip.as_ref().map_or(0.0, |c| if which == 0 { c.peak } else { c.rms }))
    }

    /// Frees the last clip.
    #[no_mangle]
    pub extern "C" fn helicorder_audio_free() {
        with(|s| s.clip = None)
    }
}
