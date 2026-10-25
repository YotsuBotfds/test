//! C-ABI exports for the browser. The page owns the camera and the clock;
//! Rust owns the data and every pixel. Buffers are handed over as pointers
//! into linear memory, which JS wraps in typed arrays.

use crate::{Globe, Opts, Timeline, DAY};
use std::cell::RefCell;

struct App {
    globe: Globe,
    timeline: Timeline,
    largest: Vec<u32>,
}

thread_local! {
    static APP: RefCell<Option<App>> = const { RefCell::new(None) };
}

fn with<R>(f: impl FnOnce(&mut App) -> R) -> R {
    APP.with(|a| f(a.borrow_mut().as_mut().expect("init() first")))
}

#[no_mangle]
pub extern "C" fn init() -> u32 {
    let globe = Globe::new();
    let timeline = Timeline::new(&globe.world);
    let n = globe.world.quakes.len() as u32;
    APP.with(|a| *a.borrow_mut() = Some(App { globe, timeline, largest: Vec::new() }));
    n
}

#[no_mangle]
pub extern "C" fn resize(w: u32, h: u32) {
    with(|a| a.globe.resize(w as usize, h as usize))
}

#[no_mangle]
pub extern "C" fn set_view(yaw: f32, pitch: f32, zoom: f32) {
    with(|a| {
        a.globe.yaw = yaw;
        a.globe.pitch = pitch;
        a.globe.zoom = zoom;
    })
}

#[no_mangle]
pub extern "C" fn set_cursor(t: f32) {
    with(|a| a.globe.cursor = t)
}

/// Bit 0 coastlines, 1 plate boundaries, 2 see-through, 3 shock rings.
#[no_mangle]
pub extern "C" fn set_flags(bits: u32) {
    with(|a| {
        a.globe.opts = Opts {
            coast: bits & 1 != 0,
            plates: bits & 2 != 0,
            xray: bits & 4 != 0,
            rings: bits & 8 != 0,
        }
    })
}

#[no_mangle]
pub extern "C" fn set_highlight(i: i32) {
    with(|a| a.globe.highlight = (i >= 0).then_some(i as usize))
}

#[no_mangle]
pub extern "C" fn render() -> u32 {
    with(|a| {
        a.globe.render();
        a.globe.visible() as u32
    })
}

#[no_mangle]
pub extern "C" fn pixels() -> *const u32 {
    with(|a| a.globe.px.as_ptr())
}

#[no_mangle]
pub extern "C" fn pick(x: f32, y: f32, reach: f32) -> i32 {
    with(|a| a.globe.pick(x, y, reach).map_or(-1, |i| i as i32))
}

#[no_mangle]
pub extern "C" fn epoch() -> u32 {
    with(|a| a.globe.world.epoch)
}

#[no_mangle]
pub extern "C" fn count() -> u32 {
    with(|a| a.globe.world.quakes.len() as u32)
}

#[no_mangle]
pub extern "C" fn q_t(i: u32) -> u32 {
    with(|a| a.globe.world.quakes[i as usize].t)
}

#[no_mangle]
pub extern "C" fn q_lat(i: u32) -> f32 {
    with(|a| a.globe.world.quakes[i as usize].lat)
}

#[no_mangle]
pub extern "C" fn q_lon(i: u32) -> f32 {
    with(|a| a.globe.world.quakes[i as usize].lon)
}

#[no_mangle]
pub extern "C" fn q_depth(i: u32) -> f32 {
    with(|a| a.globe.world.quakes[i as usize].depth)
}

#[no_mangle]
pub extern "C" fn q_mag(i: u32) -> f32 {
    with(|a| a.globe.world.quakes[i as usize].mag)
}

#[no_mangle]
pub extern "C" fn place_ptr(i: u32) -> *const u8 {
    with(|a| a.globe.world.places[i as usize].as_ptr())
}

#[no_mangle]
pub extern "C" fn place_len(i: u32) -> u32 {
    with(|a| a.globe.world.places[i as usize].len() as u32)
}

/// Writes the `n` largest quakes (>= `gap_days` apart) and returns a pointer;
/// read `largest_len()` u32s from it.
#[no_mangle]
pub extern "C" fn largest(n: u32, gap_days: f32) -> *const u32 {
    with(|a| {
        a.largest = a.globe.largest(n as usize, gap_days).into_iter().map(|i| i as u32).collect();
        a.largest.as_ptr()
    })
}

#[no_mangle]
pub extern "C" fn largest_len() -> u32 {
    with(|a| a.largest.len() as u32)
}

#[no_mangle]
pub extern "C" fn n_days() -> u32 {
    with(|a| a.timeline.days.len() as u32)
}

#[no_mangle]
pub extern "C" fn day_count(d: u32) -> u32 {
    with(|a| a.timeline.days.get(d as usize).copied().unwrap_or(0))
}

#[no_mangle]
pub extern "C" fn day_max() -> u32 {
    with(|a| a.timeline.max)
}

/// Height fraction the timeline uses for a given daily count (for axis labels).
#[no_mangle]
pub extern "C" fn tl_level(count: f32) -> f32 {
    with(|a| a.timeline.level(count))
}

#[no_mangle]
pub extern "C" fn tl_resize(w: u32, h: u32) {
    with(|a| a.timeline.resize(w as usize, h as usize))
}

#[no_mangle]
pub extern "C" fn tl_render(hover_day: f32) {
    with(|a| {
        let cursor_day = a.globe.cursor / DAY;
        a.timeline.render(cursor_day, hover_day)
    })
}

#[no_mangle]
pub extern "C" fn tl_pixels() -> *const u32 {
    with(|a| a.timeline.px.as_ptr())
}

/// Where quake `i` landed in the last render: x, y in canvas px and z
/// (z <= 0 means it is behind the globe or not yet visible).
#[no_mangle]
pub extern "C" fn q_screen(i: u32, axis: u32) -> f32 {
    with(|a| a.globe.screen[i as usize][axis as usize])
}
