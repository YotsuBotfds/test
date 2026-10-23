#!/usr/bin/env node
// Renders icons/icon.svg into the PWA / favicon PNGs with headless Chromium (WP5).
//
//   node brass-ballast/tools/gen-icons.cjs
//
// Outputs (names are a contract with manifest.webmanifest / index.html, WP10):
//   icons/icon-192.png           192×192  "any"      rounded tile, transparent corners
//   icons/icon-512.png           512×512  "any"
//   icons/icon-maskable-512.png  512×512  "maskable" full-bleed sky, art inside the 80% safe zone
//   icons/apple-touch-icon.png   180×180  opaque square (iOS rounds it itself)
//   icons/favicon-32.png          32×32   rounded tile
//
// The SVG must keep `<rect id="bg" … rx="96">` and `<g id="art">`: variants rewrite them.

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    const root = execSync('npm root -g').toString().trim();
    return require(path.join(root, 'playwright'));
  }
}

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'icons', 'icon.svg');
const OUT = path.join(ROOT, 'icons');

/** @param {string} svg @param {{square?:boolean, safe?:number}} o */
function variant(svg, o = {}) {
  let s = svg;
  if (o.square) s = s.replace(/(<rect id="bg"[^>]*?)rx="[\d.]+"/, '$1rx="0"');
  if (o.safe) {
    const k = o.safe;
    s = s.replace('<g id="art">', `<g id="art" transform="translate(256 256) scale(${k}) translate(-256 -256)">`);
  }
  return s;
}

const TARGETS = [
  { file: 'icon-192.png', size: 192, opts: {} },
  { file: 'icon-512.png', size: 512, opts: {} },
  { file: 'icon-maskable-512.png', size: 512, opts: { square: true, safe: 0.8 } },
  { file: 'apple-touch-icon.png', size: 180, opts: { square: true, safe: 0.9 }, opaque: true },
  { file: 'favicon-32.png', size: 32, opts: {} },
];

(async () => {
  const svg = fs.readFileSync(SRC, 'utf8');
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
    for (const t of TARGETS) {
      const body = variant(svg, t.opts).replace(/<svg([^>]*?)width="512" height="512"/, `<svg$1width="${t.size}" height="${t.size}"`);
      const bg = t.opaque ? '#1b130b' : 'transparent';
      await page.setViewportSize({ width: t.size, height: t.size });
      await page.setContent(
        `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:${bg};overflow:hidden}` +
          `svg{display:block}</style></head><body>${body}</body></html>`,
      );
      const file = path.join(OUT, t.file);
      await page.screenshot({
        path: file,
        omitBackground: !t.opaque,
        clip: { x: 0, y: 0, width: t.size, height: t.size },
      });
      console.log(`wrote icons/${t.file} (${t.size}×${t.size}${t.opaque ? ', opaque' : ''})`);
    }
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
