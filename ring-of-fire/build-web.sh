#!/usr/bin/env bash
# Builds the publishable page into dist/: index.html (shell + every instrument's
# html/css/js inlined), globe.wasm, and a still poster.png the page shows if a
# browser refuses to run WebAssembly.
set -euo pipefail
cd "$(dirname "$0")"
VIEWS="glass slicer waves helicorder laws"
[ -f data/quakes.bin ] || cargo run --release -q -p prep
cargo build --release -q -p globe --target wasm32-unknown-unknown
mkdir -p dist
: > dist/.views.css; : > dist/.views.html; : > dist/.views.js
for v in $VIEWS; do
  cat "web/views/$v.css" >> dist/.views.css; echo >> dist/.views.css
  cat "web/views/$v.html" >> dist/.views.html; echo >> dist/.views.html
  cat "web/views/$v.js" >> dist/.views.js; echo >> dist/.views.js
done
sed -e '/@VIEWS_CSS@/{r dist/.views.css' -e 'd' -e '}' \
    -e '/@VIEWS_HTML@/{r dist/.views.html' -e 'd' -e '}' \
    -e '/@VIEWS_JS@/{r dist/.views.js' -e 'd' -e '}' web/shell.html > dist/index.html
rm dist/.views.*
cp target/wasm32-unknown-unknown/release/globe.wasm dist/globe.wasm
[ -f dist/poster.png ] || cargo run --release -q -p poster -- dist/poster.png 720
ls -la dist
