# Ring of Fire: how the observatory fits together

One page, six instruments, one Rust crate compiled to one wasm module. Every pixel of
every instrument is computed in Rust (`crates/globe`) and copied to a `<canvas>` as a
finished RGBA buffer. JavaScript only handles input, layout and text.

| # | Instrument | Section id | View id | Rust module | Web files |
|---|---|---|---|---|---|
| 01 | Surface (globe, timeline) | `surface` | `surface` | `globe.rs`, `timeline.rs` | `web/shell.html` |
| 02 | Interior: Glass Earth | `interior` | `glass` | `glass.rs` | `web/views/glass.{html,css,js}` |
| 03 | Slabs: Slab Slicer | `slabs` | `slicer` | `slicer.rs` | `web/views/slicer.*` |
| 04 | Waves: Through the Planet | `waves` | `waves` | `waves.rs` | `web/views/waves.*` |
| 05 | Records: The Drum | `records` | `helicorder` | `helicorder.rs` | `web/views/helicorder.*` |
| 06 | Laws | `laws` | `laws` | `laws.rs` | `web/views/laws.*` |

`./build-web.sh` inlines `web/views/*.{css,html,js}` into `web/shell.html` (markers
`@VIEWS_CSS@`, `@VIEWS_HTML@`, `@VIEWS_JS@`, in the order glass, slicer, waves,
helicorder, laws) and writes `dist/index.html` + `dist/globe.wasm`.

## Ownership

Instrument modules own exactly: `crates/globe/src/<module>.rs` (plus optional private
submodules under `crates/globe/src/<module>/`), `crates/globe/tests/<module>.rs`,
`crates/globe/examples/<module>_*.rs`, and `web/views/<view>.{html,css,js}`.
Shared files (`gfx.rs`, `globe.rs`, `color.rs`, `data.rs`, `exports.rs`, `lib.rs`,
`timeline.rs`, `web/shell.html`, scripts) are maintained by the integrator. If an
instrument needs something from them, it implements a local version in its own module
and says so in its hand-off note.

## Rust side

```rust
use crate::data::{world, World, Quake};   // world(): &'static World, decoded once
use crate::gfx::{Frame, v3, smoothstep, hash, CUTOFF};
use crate::color::{depth_color, depth_pos, hex, mix, pack, to_linear, to_srgb, Rgb};
use crate::globe::quake_radius;            // px radius used for a magnitude on the globe
use crate::DAY;                            // 86400.0
```

- `World { epoch: u32 (unix s), quakes: Vec<Quake> (time-sorted), places: Vec<&str>, coast, plates }`;
  `Quake { t: u32 (s since epoch), lat, lon, depth (km), mag }`; `world().largest(n, gap_days)`;
  `World::energy(mag) -> f64` joules.
- `Frame` (gfx.rs): `new(w,h)`, `resize`, `clear()` (zero the light layer), `paint_bg(|x,y| Rgb)`
  (opaque background, linear RGB in; repaint only when geometry changes), additive primitives
  into the HDR `light` layer in linear RGB: `add`, `splat(x,y,sigma_px,c,peak)`, `line`,
  `thick_line(a,b,half_width,c,a)`, `circle`, `disc`, `rect`; then `finish()` runs bloom
  (`frame.bloom`, 0 = off, the globe uses 0.22) and tonemaps into `frame.px` (RGBA, little-endian u32).
  `frame.bg` is plain `Vec<u32>` sRGB if you want to paint it directly (`frame.pack(rgb)`).
- Colour: depth ramp `depth_color(km)` (same stops as CSS `--d0/--d70/--d300/--d700`).
  Accent ember `0xffb35c`, teal `0x3fb8b0`, ink `0xece6d9`. Background space `0x04060c`/`0x05070d`.
- Exports: inside your module, `#[cfg(target_arch = "wasm32")] mod exports { ... }` with
  `#[no_mangle] pub extern "C" fn <view>_<name>(...)`, state in a `thread_local!`
  `RefCell<Option<YourState>>`. Return buffers as `*const u32` / `*const f32` plus a length
  getter. Only scalar arguments (u32, i32, f32, f64).
- The surface globe can be instantiated again for your own canvas through the shared
  exports (`globe_new`, `globe_resize`, `globe_view`, `globe_cursor`, `globe_flags`,
  `globe_gain`, `globe_bloom`, `globe_render`, `globe_pixels`, `globe_pick`, `globe_project`,
  `globe_unproject`, `globe_overlay_clear/arc/circle/point`). See `exports.rs`.
- No new crate dependencies in `crates/globe`. Single-threaded. No allocation per frame
  if you can avoid it. `cargo clippy` clean. Tests in `crates/globe/tests/<module>.rs`.
- Budget: a frame at ~1 megapixel should take under ~12 ms natively in this container
  (`cargo run --release -p globe --example <module>_bench`); expensive one-off work
  (solvers, layouts) runs on parameter change, not per frame.

## JS side (`ROF` runtime, defined in `web/shell.html`)

```js
(() => {
  const R = ROF;
  R.view({
    id: "glass",                  // matches <section data-view="glass">
    init() { /* once, the first time the chapter nears the viewport; R.W is ready */ },
    frame(dt, now) { /* every animation frame while the chapter is near the viewport */ },
  });
})();
```

- `R.W` wasm exports · `R.n`, `R.epoch`, `R.nDays`, `R.tEnd` · `R.cat` Float32Array, 5 per quake
  (t, lat, lon, depth, mag) · `R.q(i)` → `{i,t,lat,lon,depth,mag}` · `R.place(i)`, `R.shortPlace(s)`,
  `R.largest(k, gapDays)`, `R.indexAt(t)`.
- Shared state `R.state = { cursor, playing, speed, selected }`; events `R.on("select", (i, from))`,
  `R.on("cursor", t)`, `R.on("play", bool)`; `R.select(i, viewId)`, `R.setCursor(t, viewId)`, `R.play(bool)`.
  The selected quake is the page-wide "current quake"; instruments that need a source
  (waves, slicer) should follow it when it is set.
- Canvas: `R.fit(canvas, maxPx, scale)` → `{pw, ph, k, cw, ch, changed}` (call on resize; call your
  `<view>_resize` when `changed`) · `R.blit(ctx, ptr, w, h)` · `R.sized(el, fn)` · `R.local(canvas, e)`
  → canvas px · `R.pointer(el, {down, up, drag(dx,dy), pinch(ratio), tap(e), hover(e), leave})` ·
  `R.wheel(el, factor => ...)` (Ctrl/Cmd+wheel zoom; plain wheel scrolls the page and shows a hint).
- `R.perf("02 Interior", ms, w, h)` after each render: feeds the live render-budget table.
- Formatting: `R.fmtDate(t, withTime)`, `R.fmtDuration(s)`, `R.num(v, digits)`, `R.coord`, `R.band(km)`,
  `R.depthCss(km)`, `R.esc`, `R.tipHTML(i)` + `R.placeTip(tipEl, x, y, html)` for the standard quake tooltip.
- **Wasm memory can grow during any call and detach old views.** Always call the export that
  returns a pointer first, then wrap `R.W.memory.buffer`.
- Render only when something changed (dirty flag) or while animating. Adapt resolution if
  your frames run long (see the surface view's `adapt()`).

## HTML / CSS

```html
<section class="chapter" id="interior" data-view="glass" aria-label="02 Interior">
  <header class="ch-head">
    <div><p class="ch-num">02 Interior</p><h2 class="ch-title">Glass Earth</h2></div>
    <p class="ch-lede">…</p>
  </header>
  <div class="ch-body">
    <div class="ch-stage"><canvas class="view" id="glass-canvas"></canvas> …overlays… </div>
    <aside class="ch-side"> <section>…</section> … </aside>
  </div>
  <p class="ch-foot">…method note / sources…</p>
</section>
```

Shared classes: `.eyebrow`, `.btn` / `.btn.primary`, `.seg` (buttons with `aria-pressed`),
`.chip` (`aria-pressed`, `--chip` colour), `.field` + `input[type=range]` + `output`, `.stats` / `.stat`
(`<b>` number + `<span>` label), `.ramp` + `.ramp-ticks`, `.prose`, `.list`, `.tip`, `.mark`
(text over a canvas), `.hint`, `.toast`. Tokens: `--void --rail --well --rule --rule-2 --ink
--ink-2 --ink-3 --ember --teal --d0 --d70 --d300 --d700`, fonts `--f-display` (Big Shoulders
Display), `--f-body` (IBM Plex Sans), `--f-data` (Martian Mono), sizes `--t-2xs … --t-hero`.

Rules: prefix every element id with the view id (`glass-…`); scope every CSS selector under
the section id (`#interior …`); colours only from tokens; one dark theme; works at 390 px wide
with no horizontal page scroll (the shell collapses `.ch-head`/`.ch-body` to one column under
900 px; the stage becomes roughly square); visible focus; respect `prefers-reduced-motion`.

Copy: plain, specific, short sentences, active voice. No em-dash asides, no "not X but Y",
no colon reveals. Every number shown is computed from the catalogue or cited.

## Checking your work

```sh
cargo test --release -p globe && cargo clippy --release -p globe
./build-web.sh && ./serve-dev.sh 87xx &         # use your own port
tools/dev.sh                                     # rebuild + refresh the served copy
node tools/shot.js <section-id> out.png 1440 900 87xx 3000
node tools/shot.js <section-id> out-m.png 390 844 87xx 3000
```
