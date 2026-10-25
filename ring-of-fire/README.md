# Ring of Fire

A seismology observatory in six instruments, built on three years of magnitude 4.5+
earthquakes (23,320 of them, Oct 2023 – Oct 2026, from the USGS catalogue). Every pixel
is computed by a dependency-free Rust software renderer compiled to WebAssembly: no
WebGL, no chart library. JavaScript only handles input, layout and text.

| # | Instrument | What it does |
|---|---|---|
| 01 | **Surface** | A globe with no map: the quakes trace the plate boundaries. Bloom, stars, replay with shock rings, a quakes-per-day timeline. |
| 02 | **Glass Earth** | A ray-traced glass planet with a molten core and a quarter cut away; every quake hangs at its true (stretched) depth, so sinking slabs appear as curtains. Slab presets fly along the trench. |
| 03 | **Slab Slicer** | Cut a great-circle cross-section anywhere at true curvature and scale; the slab's dip is fitted with RANSAC + Tukey-biweight orthogonal regression (Tonga 60°, Mariana 81°, NE Japan 24°). |
| 04 | **Through the Planet** | P and S waves from a real quake, solved by fast marching through a simplified ak135 Earth; shadow zones, PKP and PKIKP emerge from the physics. Arrival fronts on a globe and at 12 cities. Matches iasp91 tables within 1.4%. |
| 05 | **The Drum** | A smoked-paper helicorder of the whole catalogue at a real IU station, from synthetic seismograms (ray-traced iasp91 arrivals, P/PP/pP/S/Rayleigh packets, microseism). Press Listen to hear it. |
| 06 | **Laws** | Gutenberg–Richter (b = 1.15 ± 0.01, Mc 4.7), Omori–Utsu for the M8.8 Kamchatka sequence (p = 1.03 ± 0.02), Båth's law, and an energy treemap: the M8.8 alone released 65.8% of the energy. |

Selecting a quake in any instrument selects it everywhere: the waves re-solve for its
depth, the drum turns to its day, the laws refit its aftershocks, the slicer cuts through it.

```
crates/prep    raw USGS CSV + GeoJSON  ->  compact binaries in data/
crates/globe   gfx.rs (shared rasteriser: splats, AA lines, bloom, tonemap), globe.rs,
               and one module per instrument with its own wasm exports
crates/poster  renders the surface globe to a PNG with the same code
web/           shell.html (runtime + surface) and views/<instrument>.{html,css,js}
```

```sh
./fetch-data.sh                                   # refresh data-raw/ from USGS (optional)
cargo run --release -p prep                       # rebuild data/
cargo test --release -p globe                     # 51 tests: physics, fits, rendering
cargo run --release -p poster -- out.png 2000 -170 5 --plates
./build-web.sh                                    # dist/: index.html + globe.wasm + poster.png
./serve-dev.sh 8765 & node tools/shot.js waves out.png 1440 900 8765
```

See `ARCHITECTURE.md` for how the instruments plug into the shared renderer and runtime.

Data: USGS ANSS ComCat; Natural Earth 1:110m coastlines; Bird (2003) PB2002 plate
boundaries. Earth models: ak135 (Kennett, Engdahl & Buland 1995), iasp91 (Kennett &
Engdahl 1991), PREM (Dziewonski & Anderson 1981).
