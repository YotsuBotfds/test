// WP6 preview: pans the real Renderer camera in a slow circle over each biome's backdrop and
// weather, with a test airship + sample bullets at the centre to judge readability.
//
// Query: ?biome=<id>  ?all=1 (cycle every 4 s with crossfades)  ?zoom=<mul>  ?speed=<mul>
//        ?t=<start seconds>  ?clean=1 (hide HUD)  ?strike=1 (periodic lightning on the ship)
//        ?still=1 (no camera motion)  ?intensity=<v>  ?quality=low  ?fade=<s>
//        ?cx=&cy= (centre of the camera circle, world units)  ?clouds=1 (cloud/isle sprite sheet)
import { Sprites } from '../../js/gfx/sprites.js';
import { Renderer } from '../../js/gfx/renderer.js';
import { Background } from '../../js/gfx/background.js';
import { Weather } from '../../js/gfx/weather.js';
import { BIOMES, BIOME_ORDER } from '../../js/gfx/biomes.js';
import { Save } from '../../js/core/storage.js';

// Ship/bullet art is optional (another package may be mid-edit): never let it break the preview.
try {
  await import('../../js/gfx/art/index.js');
} catch (err) {
  console.warn('[test] art not available, using fallback ship', err?.message);
}

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
if (q.get('clean') === '1') document.body.classList.add('clean');
if (q.get('quality')) Save.settings.quality = q.get('quality');
if (q.get('flashes') === '0') Save.settings.flashes = false;

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
renderer.camera.zoomMul = num('zoom', 1);
renderer.updateZoom();
const bg = new Background(renderer);
const weather = new Weather(renderer);
const cycle = q.get('all') === '1';
const fade = num('fade', 2.5);
let biomeIdx = Math.max(0, BIOME_ORDER.indexOf(q.get('biome') || 'brassbay'));
let cycleT = 0;
const setBiome = (i, f) => {
  biomeIdx = (i + BIOME_ORDER.length) % BIOME_ORDER.length;
  bg.setBiome(BIOME_ORDER[biomeIdx], f);
  weather.setBiome(BIOME_ORDER[biomeIdx], f);
  for (const b of bar.children) b.classList.toggle('on', b.dataset.id === BIOME_ORDER[biomeIdx]);
};
if (q.has('intensity')) weather.setIntensity(num('intensity', 1));

// Buttons.
const bar = document.getElementById('bar');
for (const id of BIOME_ORDER) {
  const b = document.createElement('button');
  b.textContent = BIOMES[id].name;
  b.dataset.id = id;
  b.onclick = () => setBiome(BIOME_ORDER.indexOf(id), fade);
  bar.append(b);
}
const strikeBtn = document.createElement('button');
strikeBtn.textContent = '⚡ Strike';
strikeBtn.onclick = () => weather.strike(renderer.camera.x + 120, renderer.camera.y - 40);
bar.append(strikeBtn);
setBiome(biomeIdx, 0);

// Test ship fallback when the hull art isn't registered yet.
if (!Sprites.has('hull_dauntless')) {
  Sprites.register('hull_dauntless', {
    w: 96,
    h: 48,
    draw(ctx) {
      ctx.fillStyle = '#f3e8c9';
      ctx.strokeStyle = '#1a120a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(48, 24, 44, 17, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#c9973f';
      ctx.fillRect(30, 18, 34, 12);
      ctx.strokeRect(30, 18, 34, 12);
      ctx.fillStyle = '#8c2f2b';
      ctx.fillRect(8, 21, 12, 6);
    },
  });
}

const stats = { back: 0, front: 0, wx: 0, total: 0, fps: 60, maxTotal: 0, samples: 0, sum: 0 };
let t = num('t', 0);
const speed = num('speed', 1);
const still = q.get('still') === '1';
let last = performance.now();
let angle = 0;
const R = 900;
let strikeT = 2;

function drawTestEntities(ctx, now) {
  const cam = renderer.camera;
  renderer.applyWorld(ctx);
  const x = cam.x;
  const y = cam.y + Math.sin(now / 600) * 4;
  // Shadow.
  if (Sprites.has('fx_shadow')) Sprites.draw(ctx, 'fx_shadow', x + 26, y + 34, 0, 2, 0.28);
  else {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(x + 26, y + 34, 46, 20, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  Sprites.draw(ctx, 'hull_dauntless', x, y, angle, 1);
  // Sample bullets: enemy fire (hot, dark rim) & player fire (brass).
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + now / 1400;
    const bx = x + Math.cos(a) * 170;
    const by = y + Math.sin(a) * 120;
    if (Sprites.has('eb_orb')) Sprites.draw(ctx, 'eb_orb', bx, by, a, 1);
    else {
      ctx.fillStyle = '#3a0a04';
      ctx.beginPath();
      ctx.arc(bx, by, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff4d2e';
      ctx.beginPath();
      ctx.arc(bx, by, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd2a0';
      ctx.beginPath();
      ctx.arc(bx, by, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (let i = 0; i < 4; i++) {
    const bx = x + 70 + i * 40;
    const by = y - 10;
    if (Sprites.has('pb_ball')) Sprites.draw(ctx, 'pb_ball', bx, by, 0, 1);
    else {
      ctx.fillStyle = '#ffd36b';
      ctx.beginPath();
      ctx.arc(bx, by, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ?clouds=1 — inspect every cloud variant of the current biome (sprite QA).
let cloudMod = null;
import('../../js/gfx/bg-clouds.js').then((m) => (cloudMod = m));
function drawCloudSheet(ctx) {
  if (!cloudMod) return;
  ctx.setTransform(renderer.dpr, 0, 0, renderer.dpr, 0, 0);
  for (let v = 0; v < 8; v++) {
    const img = cloudMod.cloudSprite(bg.biome, v);
    const w = renderer.cssW / 4;
    const h = (w * img.height) / img.width;
    ctx.drawImage(img, (v % 4) * w, 80 + Math.floor(v / 4) * h, w, h);
  }
  if (isleMod) {
    for (let v = 0; v < isleMod.ISLE_VARIANTS; v++) {
      const img = isleMod.isleSprite(v);
      const w = renderer.cssW / 4;
      ctx.drawImage(
        img,
        v * w,
        renderer.cssH - (w * img.height) / img.width,
        w,
        (w * img.height) / img.width
      );
    }
  }
}
let isleMod = null;
import('../../js/gfx/bg-isles.js').then((m) => (isleMod = m));

const hud = document.getElementById('hud');
let hudT = 0;

function frame(nowMs) {
  const rdt = Math.min(0.05, (nowMs - last) / 1000);
  last = nowMs;
  const dt = rdt * speed;
  t += dt;
  const cam = renderer.camera;
  if (!still) {
    const w = 0.11;
    const nx = num('cx', 0) + Math.cos(t * w) * R;
    const ny = num('cy', 0) + Math.sin(t * w) * R * 0.7;
    angle = Math.atan2(ny - cam.y, nx - cam.x) || angle;
    cam.x = nx;
    cam.y = ny;
  }
  if (cycle) {
    cycleT += dt;
    if (cycleT >= 4) {
      cycleT = 0;
      setBiome(biomeIdx + 1, fade);
    }
  }
  if (q.get('strike') === '1' && (strikeT -= dt) <= 0) {
    strikeT = 2.5;
    weather.strike(cam.x + 140, cam.y - 60);
  }
  bg.update(dt);
  weather.update(dt, renderer, null);
  renderer.clear();
  const ctx = renderer.ctx;
  const t0 = performance.now();
  bg.drawBack(ctx, renderer);
  const t1 = performance.now();
  drawTestEntities(ctx, nowMs);
  renderer.applyScreen(ctx);
  const t2 = performance.now();
  const focus = { x: renderer.cssW / 2, y: renderer.cssH / 2 };
  bg.drawFront(ctx, renderer, focus);
  const t3 = performance.now();
  weather.draw(ctx, renderer);
  const t4 = performance.now();
  if (q.get('clouds') === '1') drawCloudSheet(ctx);
  const k = 0.05;
  stats.back += (t1 - t0 - stats.back) * k;
  stats.front += (t3 - t2 - stats.front) * k;
  stats.wx += (t4 - t3 - stats.wx) * k;
  const total = t1 - t0 + (t4 - t2);
  stats.total += (total - stats.total) * k;
  stats.fps += (1 / Math.max(rdt, 1e-3) - stats.fps) * k;
  if (bg.stats.pending === 0 && t > 1) {
    stats.samples++;
    stats.sum += total;
    stats.maxTotal = Math.max(stats.maxTotal, total);
  }
  hudT -= rdt;
  if (hudT <= 0) {
    hudT = 0.25;
    hud.textContent =
      `${bg.biome.name}${bg.prevBiome ? ` ← ${bg.prevBiome.name} (${(bg.blend * 100) | 0}%)` : ''}\n` +
      `back ${stats.back.toFixed(2)} ms  front ${stats.front.toFixed(2)} ms  weather ${stats.wx.toFixed(2)} ms\n` +
      `total ${stats.total.toFixed(2)} ms/frame   fps ${stats.fps.toFixed(0)}\n` +
      `tiles ${bg.tiles.size}  pending ${bg.stats.pending}  gen avg ${bg.stats.avgGenMs.toFixed(1)} ms` +
      `  last ${bg.stats.lastGenMs.toFixed(1)} ms\n` +
      `wind ${weather.wind.x.toFixed(0)},${weather.wind.y.toFixed(0)}  flash ${weather.flash.toFixed(2)}  zoom ${cam.zoom.toFixed(2)}`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.BD = {
  bg,
  weather,
  renderer,
  stats,
  setBiome: (id, f = 0) => setBiome(BIOME_ORDER.indexOf(id), f),
  report: () => ({
    biome: bg.id,
    tiles: bg.tiles.size,
    gen: { ...bg.stats },
    avgMs: stats.samples ? +(stats.sum / stats.samples).toFixed(3) : null,
    maxMs: +stats.maxTotal.toFixed(3),
    emaMs: +stats.total.toFixed(3),
    fps: +stats.fps.toFixed(1),
    back: +stats.back.toFixed(3),
    front: +stats.front.toFixed(3),
    weather: +stats.wx.toFixed(3),
  }),
};
console.log('[test] backdrops preview ready');
