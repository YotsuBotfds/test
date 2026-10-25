# Ring of Fire

Three years of magnitude 4.5+ earthquakes (23,320 of them, from the USGS catalogue) drawn on a
globe that has no map. The quakes trace the plate boundaries by themselves. Colour shows depth,
so you can see slabs of ocean floor sinking under Tonga, Japan and the Andes.

Everything visual is done by a dependency-free Rust software renderer: orthographic projection,
gaussian splats, anti-aliased lines, and an HDR tonemap. The same code runs natively (to write
PNGs) and in the browser (compiled to `wasm32-unknown-unknown`, ~1.1 MB with the data baked in).

```
crates/prep    raw USGS CSV + GeoJSON  ->  compact binaries in data/
crates/globe   the renderer + timeline; C-ABI exports for the browser (src/wasm.rs)
crates/poster  renders a PNG with the same code
web/           the page: JS only handles input and blits Rust's pixel buffer to a canvas
```

```sh
./fetch-data.sh                                   # refresh data-raw/ from USGS (optional)
cargo run --release -p prep                       # rebuild data/
cargo run --release -p poster -- out.png 2000 -170 5 --plates
cargo test --release -p globe
./build-web.sh                                    # dist/: index.html + globe.wasm + poster.png
```

Data: USGS ANSS ComCat; Natural Earth 1:110m coastlines; Bird (2003) PB2002 plate boundaries.
