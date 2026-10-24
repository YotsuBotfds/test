#!/usr/bin/env node
// Renders Neon Harbor Run to an MP4 (or to still frames) with headless Chromium and ffmpeg.
//
//   node render.mjs --out neon-harbor.mp4                 full 48 s run, 1080p60 with soundtrack
//   node render.mjs --stills 0,9,16,24,31.6,36 --out shots   PNG stills at those times
//
// Options: --width 1920 --height 1080 --fps 60 --seconds 48 --subframes 1 --crf 18 --workers 2
// The scene is deterministic in time, so frames can be rendered in any order and in parallel.

import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const W = Number(arg('width', 1920));
const H = Number(arg('height', 1080));
const FPS = Number(arg('fps', 60));
const SECONDS = Number(arg('seconds', 48));
const SUBFRAMES = Number(arg('subframes', 1));
const CRF = arg('crf', '18');
const WORKERS = Number(arg('workers', 2));
const STILLS = arg('stills', null);
const OUT = path.resolve(arg('out', STILLS ? 'stills' : 'neon-harbor.mp4'));
const FRAMES_DIR = path.resolve(arg('frames', `${OUT}.frames`));
const START = Number(arg('start', 0));
const WITH_TITLE = argv.includes('--with-title');

// Serve this folder, and answer the three.js CDN URLs from a local install when there is one.
let threeRoot = null;
for (const base of [here, process.cwd()]) {
  try { threeRoot = path.dirname(createRequire(path.join(base, 'x.js')).resolve('three/package.json')); break; } catch {}
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const file = path.join(here, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(here) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') || file.endsWith('.mjs') ? 'text/javascript' : 'application/octet-stream';
  res.writeHead(200, { 'content-type': type });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'],
  ...(proxy ? { proxy: { server: proxy, bypass: '127.0.0.1,localhost' } } : {}),
});

async function openPage() {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[page:${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  if (threeRoot) {
    await page.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.*)$/, (route) => {
      const rel = route.request().url().replace(/^.*\/npm\/three@[^/]+\//, '');
      const file = path.join(threeRoot, rel);
      if (!fs.existsSync(file)) return route.abort();
      route.fulfill({ path: file, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } });
    });
  }
  await page.goto(`${origin}/index.html?render&w=${W}&h=${H}`);
  await page.waitForFunction(() => window.__ready !== undefined, null, { timeout: 120000 });
  await page.evaluate(() => window.__ready);
  return page;
}

// Title card in, end fade out; the interactive page shows its title in HTML instead.
const titleAt = (t) => Math.min(1, Math.max(0, (t - 0.5) / 0.8)) * (1 - Math.min(1, Math.max(0, (t - 4.2) / 0.9)));
const fadeAt = (t) => Math.min(1, t / 0.6) * Math.min(1, Math.max(0, (SECONDS - t) / 1.5));

async function grab(page, t, opts) {
  const url = await page.evaluate(([tt, o]) => {
    window.__frame(tt, o);
    return document.getElementById('stage').toDataURL('image/png');
  }, [t, opts]);
  return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
}

const t0 = Date.now();
if (STILLS) {
  fs.mkdirSync(OUT, { recursive: true });
  const page = await openPage();
  for (const t of STILLS.split(',').map(Number)) {
    const s = Date.now();
    const png = await grab(page, t, { title: WITH_TITLE ? titleAt(t) : 0, fade: WITH_TITLE ? fadeAt(t) : 1, subframes: SUBFRAMES, shutter: 0.5 / FPS });
    const file = path.join(OUT, `still-${t.toFixed(2).padStart(6, '0')}.png`);
    fs.writeFileSync(file, png);
    console.log(`${file}  (${Date.now() - s} ms)`);
  }
} else {
  fs.mkdirSync(FRAMES_DIR, { recursive: true });
  const total = Math.round(SECONDS * FPS);
  const todo = [];
  for (let i = Math.round(START * FPS); i < total; i++) {
    if (!fs.existsSync(path.join(FRAMES_DIR, `f${String(i).padStart(5, '0')}.png`))) todo.push(i);
  }
  console.log(`rendering ${todo.length} of ${total} frames at ${W}x${H}, ${FPS} fps, ${SUBFRAMES} subframe(s), ${WORKERS} worker(s)`);
  let done = 0;
  const worker = async (k) => {
    const page = await openPage();
    for (let j = k; j < todo.length; j += WORKERS) {
      const i = todo[j];
      const t = i / FPS;
      const png = await grab(page, t, { title: titleAt(t), fade: fadeAt(t), subframes: SUBFRAMES, shutter: 0.5 / FPS });
      fs.writeFileSync(path.join(FRAMES_DIR, `f${String(i).padStart(5, '0')}.png`), png);
      done++;
      if (done % 30 === 0) {
        const el = (Date.now() - t0) / 1000;
        console.log(`${done}/${todo.length} frames, ${(el / done).toFixed(2)} s/frame, eta ${((todo.length - done) * el / done / 60).toFixed(1)} min`);
      }
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, (_, k) => worker(k)));

  const wav = `${OUT}.wav`;
  const page = await openPage();
  const b64 = await page.evaluate(([s]) => window.__soundtrack(s, 1.5), [SECONDS]);
  fs.writeFileSync(wav, Buffer.from(b64, 'base64'));
  console.log(`soundtrack written to ${wav}`);

  await new Promise((resolve, reject) => {
    const first = Math.round(START * FPS);
    const ff = spawn('ffmpeg', [
      '-y', '-framerate', String(FPS), '-start_number', String(first), '-i', path.join(FRAMES_DIR, 'f%05d.png'),
      '-ss', String(START), '-i', wav,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', CRF, '-pix_fmt', 'yuv420p', '-profile:v', 'high',
      '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', OUT,
    ], { stdio: 'inherit' });
    ff.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))));
  });
  console.log(`video written to ${OUT}`);
}
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await browser.close();
server.close();
