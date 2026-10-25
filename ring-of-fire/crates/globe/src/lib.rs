//! Ring of Fire: a software-rendered seismology observatory. Six instruments share
//! one catalogue (three years of M4.5+ earthquakes) and one rasteriser (`gfx`).
//! No GPU and no dependencies: every pixel is computed here, then written to a PNG
//! (the `poster` binary) or handed to a canvas through the wasm exports.
//!
//! Each instrument module owns its state and, on wasm32, its own `#[no_mangle]`
//! exports, prefixed with the instrument's name.

pub mod color;
pub mod data;
pub mod gfx;
pub mod globe;
pub mod timeline;

pub mod glass;
pub mod helicorder;
pub mod laws;
pub mod slicer;
pub mod waves;

#[cfg(target_arch = "wasm32")]
mod exports;

pub use globe::{Globe, Opts};
pub use timeline::Timeline;

pub const DAY: f32 = 86400.0;
