//! C-ABI exports shared by every instrument: the catalogue, the surface globe
//! (any number of instances, addressed by handle) and the daily timeline.
//! Instruments add their own exports in their own modules.

use crate::color::Rgb;
use crate::data::world;
use crate::globe::{Overlay, Shape};
use crate::gfx::v3;
use crate::{Globe, Opts, Timeline};
use std::cell::RefCell;

thread_local! {
    static GLOBES: RefCell<Vec<Globe>> = const { RefCell::new(Vec::new()) };
    static TIMELINE: RefCell<Option<Timeline>> = const { RefCell::new(None) };
    static CATALOG: RefCell<Vec<f32>> = const { RefCell::new(Vec::new()) };
    static LARGEST: RefCell<Vec<u32>> = const { RefCell::new(Vec::new()) };
}

fn rgb(c: u32) -> Rgb {
    crate::color::hex(c)
}

// ---------- catalogue ----------

#[no_mangle]
pub extern "C" fn count() -> u32 {
    world().quakes.len() as u32
}

#[no_mangle]
pub extern "C" fn epoch() -> u32 {
    world().epoch
}

/// Packed f32 table, 5 per quake: t (s since epoch), lat, lon, depth (km), mag.
/// Time-sorted. `t` as f32 is good to ~8 s; use `q_t` for exact seconds.
#[no_mangle]
pub extern "C" fn catalog() -> *const f32 {
    CATALOG.with(|c| {
        let mut c = c.borrow_mut();
        if c.is_empty() {
            for q in &world().quakes {
                c.extend([q.t as f32, q.lat, q.lon, q.depth, q.mag]);
            }
        }
        c.as_ptr()
    })
}

#[no_mangle]
pub extern "C" fn q_t(i: u32) -> u32 {
    world().quakes[i as usize].t
}

#[no_mangle]
pub extern "C" fn place_ptr(i: u32) -> *const u8 {
    world().places[i as usize].as_ptr()
}

#[no_mangle]
pub extern "C" fn place_len(i: u32) -> u32 {
    world().places[i as usize].len() as u32
}

/// Writes the `n` largest quakes (>= `gap_days` apart) and returns a pointer;
/// read `largest_len()` u32s from it.
#[no_mangle]
pub extern "C" fn largest(n: u32, gap_days: f32) -> *const u32 {
    LARGEST.with(|l| {
        let mut l = l.borrow_mut();
        *l = world().largest(n as usize, gap_days).into_iter().map(|i| i as u32).collect();
        l.as_ptr()
    })
}

#[no_mangle]
pub extern "C" fn largest_len() -> u32 {
    LARGEST.with(|l| l.borrow().len() as u32)
}

// ---------- globes ----------

fn globe<R>(h: u32, f: impl FnOnce(&mut Globe) -> R) -> R {
    GLOBES.with(|g| f(&mut g.borrow_mut()[h as usize]))
}

/// Creates a globe and returns its handle.
#[no_mangle]
pub extern "C" fn globe_new() -> u32 {
    GLOBES.with(|g| {
        let mut g = g.borrow_mut();
        g.push(Globe::new());
        g.len() as u32 - 1
    })
}

#[no_mangle]
pub extern "C" fn globe_resize(h: u32, w: u32, ht: u32) {
    globe(h, |g| g.resize(w as usize, ht as usize))
}

#[no_mangle]
pub extern "C" fn globe_view(h: u32, yaw: f32, pitch: f32, zoom: f32) {
    globe(h, |g| {
        g.yaw = yaw;
        g.pitch = pitch;
        g.zoom = zoom;
    })
}

#[no_mangle]
pub extern "C" fn globe_cursor(h: u32, t: f32) {
    globe(h, |g| g.cursor = t)
}

/// Bit 0 coastlines, 1 plate boundaries, 2 see-through, 3 shock rings.
#[no_mangle]
pub extern "C" fn globe_flags(h: u32, bits: u32) {
    globe(h, |g| {
        g.opts = Opts { coast: bits & 1 != 0, plates: bits & 2 != 0, xray: bits & 4 != 0, rings: bits & 8 != 0 }
    })
}

#[no_mangle]
pub extern "C" fn globe_highlight(h: u32, i: i32) {
    globe(h, |g| g.highlight = (i >= 0).then_some(i as usize))
}

/// Brightness multiplier for the catalogue's dots (0 hides them).
#[no_mangle]
pub extern "C" fn globe_gain(h: u32, gain: f32) {
    globe(h, |g| g.quake_gain = gain)
}

#[no_mangle]
pub extern "C" fn globe_bloom(h: u32, strength: f32) {
    globe(h, |g| g.frame.bloom = strength)
}

/// Renders and returns how many quakes are at or before the cursor.
#[no_mangle]
pub extern "C" fn globe_render(h: u32) -> u32 {
    globe(h, |g| {
        g.render();
        g.visible() as u32
    })
}

#[no_mangle]
pub extern "C" fn globe_pixels(h: u32) -> *const u32 {
    globe(h, |g| g.frame.px.as_ptr())
}

#[no_mangle]
pub extern "C" fn globe_pick(h: u32, x: f32, y: f32, reach: f32) -> i32 {
    globe(h, |g| g.pick(x, y, reach).map_or(-1, |i| i as i32))
}

/// Where quake `i` landed in the last render: axis 0 = x, 1 = y (canvas px),
/// 2 = z (z <= 0 means behind the globe or not yet visible).
#[no_mangle]
pub extern "C" fn globe_screen(h: u32, i: u32, axis: u32) -> f32 {
    globe(h, |g| g.screen[i as usize][axis as usize])
}

/// Projects any lat/lon with the current view: axis 0 = x, 1 = y, 2 = z (> 0 near side).
#[no_mangle]
pub extern "C" fn globe_project(h: u32, lat: f32, lon: f32, axis: u32) -> f32 {
    globe(h, |g| g.project(v3::from_latlon(lat, lon))[axis as usize])
}

/// Lat (axis 0) or lon (axis 1) under a canvas pixel; NaN off the globe.
#[no_mangle]
pub extern "C" fn globe_unproject(h: u32, x: f32, y: f32, axis: u32) -> f32 {
    globe(h, |g| match g.unproject(x, y) {
        Some(p) => {
            let (lat, lon) = v3::to_latlon(p);
            if axis == 0 { lat } else { lon }
        }
        None => f32::NAN,
    })
}

#[no_mangle]
pub extern "C" fn globe_overlay_clear(h: u32) {
    globe(h, |g| g.overlays.clear())
}

/// Great-circle arc, colour as 0xRRGGBB.
#[no_mangle]
pub extern "C" fn globe_overlay_arc(h: u32, lat1: f32, lon1: f32, lat2: f32, lon2: f32, color: u32, alpha: f32, width: f32) {
    let shape = Shape::Arc(v3::from_latlon(lat1, lon1), v3::from_latlon(lat2, lon2));
    globe(h, |g| g.overlays.push(Overlay { shape, color: rgb(color), alpha, width }))
}

/// Small circle of `radius_deg` (great-circle degrees) around a point.
#[no_mangle]
pub extern "C" fn globe_overlay_circle(h: u32, lat: f32, lon: f32, radius_deg: f32, color: u32, alpha: f32, width: f32) {
    let shape = Shape::Circle(v3::from_latlon(lat, lon), radius_deg.to_radians());
    globe(h, |g| g.overlays.push(Overlay { shape, color: rgb(color), alpha, width }))
}

/// Glowing dot of `size` px.
#[no_mangle]
pub extern "C" fn globe_overlay_point(h: u32, lat: f32, lon: f32, size: f32, color: u32, alpha: f32) {
    let shape = Shape::Point(v3::from_latlon(lat, lon), size);
    globe(h, |g| g.overlays.push(Overlay { shape, color: rgb(color), alpha, width: 1.0 }))
}

// ---------- timeline ----------

fn timeline<R>(f: impl FnOnce(&mut Timeline) -> R) -> R {
    TIMELINE.with(|t| f(t.borrow_mut().get_or_insert_with(|| Timeline::new(world()))))
}

#[no_mangle]
pub extern "C" fn n_days() -> u32 {
    timeline(|t| t.days.len() as u32)
}

#[no_mangle]
pub extern "C" fn day_count(d: u32) -> u32 {
    timeline(|t| t.days.get(d as usize).copied().unwrap_or(0))
}

#[no_mangle]
pub extern "C" fn day_max() -> u32 {
    timeline(|t| t.max)
}

/// Height fraction the timeline uses for a daily count (for axis labels).
#[no_mangle]
pub extern "C" fn tl_level(count: f32) -> f32 {
    timeline(|t| t.level(count))
}

#[no_mangle]
pub extern "C" fn tl_resize(w: u32, h: u32) {
    timeline(|t| t.resize(w as usize, h as usize))
}

#[no_mangle]
pub extern "C" fn tl_render(cursor_t: f32, hover_day: f32) {
    timeline(|t| t.render(cursor_t / crate::DAY, hover_day))
}

#[no_mangle]
pub extern "C" fn tl_pixels() -> *const u32 {
    timeline(|t| t.px.as_ptr())
}
