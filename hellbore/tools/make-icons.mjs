// Renders Hellbore's PWA icons with headless Chromium and writes them to ../icons.
// Usage (from the hellbore folder): node tools/make-icons.mjs   (needs the `playwright` package)
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
mkdirSync(out, { recursive: true });

// Runs inside the page: paints the icon onto a canvas and returns a PNG data URL.
function paint(size, maskable) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const S = size / 512;
  ctx.scale(S, S);

  // Background: the descent, layer by layer.
  const bg = ctx.createLinearGradient(0, 0, 0, 512);
  bg.addColorStop(0, '#3a0c08');
  bg.addColorStop(1, '#0a0203');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 512);
  const bands = ['#5a3a22', '#3a3e4c', '#3a1a14', '#6a6650', '#7a2416', '#5a0e18'];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  bands.forEach((col, i) => {
    const y0 = 150 + i * 62;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, 512);
    ctx.lineTo(0, y0);
    for (let x = 0; x <= 512; x += 32) ctx.lineTo(x, y0 + (rnd() - 0.5) * 22);
    ctx.lineTo(512, 512);
    ctx.fill();
  });
  const vg = ctx.createRadialGradient(256, 300, 60, 256, 300, 360);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, 512, 512);

  ctx.save();
  if (maskable) {
    ctx.translate(256, 256);
    ctx.scale(0.74, 0.74);
    ctx.translate(-256, -256);
  }

  // Hellfire at the drill tip.
  const glow = ctx.createRadialGradient(256, 440, 0, 256, 440, 170);
  glow.addColorStop(0, 'rgba(255,230,140,0.95)');
  glow.addColorStop(0.25, 'rgba(255,120,40,0.7)');
  glow.addColorStop(1, 'rgba(255,40,10,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-300, -300, 1112, 1112);
  ctx.strokeStyle = 'rgba(255,210,120,0.9)';
  ctx.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    const a = Math.PI * (0.05 + rnd() * 0.9);
    const r0 = 30 + rnd() * 30;
    const r1 = r0 + 30 + rnd() * 70;
    ctx.lineWidth = 3 + rnd() * 4;
    ctx.beginPath();
    ctx.moveTo(256 + Math.cos(a) * r0, 440 + Math.sin(a) * r0 * 0.4 - 30);
    ctx.lineTo(256 + Math.cos(a) * r1, 440 + Math.sin(a) * r1 * 0.4 - 30 - r1 * 0.3);
    ctx.stroke();
  }

  // Drill cone.
  const top = 170;
  const tip = 452;
  const half = 118;
  const steel = ctx.createLinearGradient(256 - half, 0, 256 + half, 0);
  steel.addColorStop(0, '#f2f2f8');
  steel.addColorStop(0.45, '#b8bac6');
  steel.addColorStop(1, '#4a4c58');
  ctx.fillStyle = steel;
  ctx.beginPath();
  ctx.moveTo(256 - half, top);
  ctx.lineTo(256 + half, top);
  ctx.lineTo(256, tip);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(30,30,40,0.75)';
  ctx.lineWidth = 14;
  for (let k = 0; k < 6; k++) {
    const y = top + 20 + k * 48;
    ctx.beginPath();
    ctx.moveTo(256 - half, y);
    ctx.lineTo(256 + half, y + 46);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = '#1a1014';
  ctx.lineWidth = 10;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(256 - half, top);
  ctx.lineTo(256 + half, top);
  ctx.lineTo(256, tip);
  ctx.closePath();
  ctx.stroke();

  // Borer body with hazard stripes.
  const bx = 256 - 150;
  const by = 62;
  const bw = 300;
  const bh = 112;
  ctx.fillStyle = '#1a1014';
  ctx.beginPath();
  ctx.roundRect(bx - 6, by - 6, bw + 12, bh + 12, 22);
  ctx.fill();
  ctx.fillStyle = '#dcac3a';
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 18);
  ctx.fill();
  ctx.fillStyle = '#f6d470';
  ctx.fillRect(bx + 12, by + 8, bw - 24, 14);
  ctx.save();
  ctx.beginPath();
  ctx.rect(bx, by + bh - 40, bw, 32);
  ctx.clip();
  ctx.fillStyle = '#1a1014';
  for (let x = bx - 40; x < bx + bw + 40; x += 44) {
    ctx.beginPath();
    ctx.moveTo(x, by + bh - 8);
    ctx.lineTo(x + 22, by + bh - 8);
    ctx.lineTo(x + 54, by + bh - 40);
    ctx.lineTo(x + 32, by + bh - 40);
    ctx.fill();
  }
  ctx.restore();
  // Turret eye.
  ctx.fillStyle = '#1a1014';
  ctx.beginPath();
  ctx.arc(256, by + 46, 30, 0, Math.PI * 2);
  ctx.fill();
  const eye = ctx.createRadialGradient(256, by + 46, 2, 256, by + 46, 22);
  eye.addColorStop(0, '#fff6d0');
  eye.addColorStop(0.4, '#ff9a3a');
  eye.addColorStop(1, '#b0200c');
  ctx.fillStyle = eye;
  ctx.beginPath();
  ctx.arc(256, by + 46, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  return c.toDataURL('image/png');
}

const browser = await chromium.launch();
const page = await browser.newPage();
const jobs = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
  ['favicon-32.png', 32, false],
];
for (const [name, size, maskable] of jobs) {
  const url = await page.evaluate(`(${paint})(${size}, ${maskable})`);
  writeFileSync(join(out, name), Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote', name);
}
await browser.close();
