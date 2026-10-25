#!/usr/bin/env bash
# Builds the publishable page into dist/: index.html, globe.wasm, and a still
# poster.png the page shows if a browser refuses to run WebAssembly.
set -euo pipefail
cd "$(dirname "$0")"
[ -f data/quakes.bin ] || cargo run --release -q -p prep
cargo build --release -q -p globe --target wasm32-unknown-unknown
mkdir -p dist
cp web/index.html dist/index.html
cp target/wasm32-unknown-unknown/release/globe.wasm dist/globe.wasm
cargo run --release -q -p poster -- dist/poster.png 720
ls -la dist
