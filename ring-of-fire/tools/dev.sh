#!/usr/bin/env bash
# Rebuild and refresh the dev server's copy (serve-dev.sh must be running).
set -euo pipefail
cd "$(dirname "$0")/.."
./build-web.sh >/dev/null
mkdir -p dist/dev
cp dist/globe.wasm dist/poster.png dist/dev/
{ printf '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui}img{max-width:100%%}[hidden]{display:none!important}</style></head><body>'; cat dist/index.html; printf '</body></html>'; } > dist/dev/index.html
echo "rebuilt dist/ and dist/dev/"
