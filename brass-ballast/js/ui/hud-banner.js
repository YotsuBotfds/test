// HUD announcements (WP22): wave plaques that slide in, gilded "cleared" ribbons, full-width
// stage title cards (with a sunburst for victory), the hazard-striped boss WARNING, compact
// phase alerts and the boss name reveal. Driven by HUD.announce(title, sub, {kind, time}).

import { roundRect, INK, skull } from '../gfx/drawkit.js';
import {
  TAU,
  clamp,
  blitText,
  LayerCache,
  brassPanel,
  rivets,
  cog,
  stripes,
  easeOutBack,
  easeOutCubic,
  easeInCubic,
  smooth,
} from './hud-kit.js';

const IN = 0.45;
const OUT = 0.4;

/** Map an announce() call to a visual variant. */
export function bannerVariant(title, kind) {
  const t = String(title || '').toLowerCase();
  if (kind === 'warning') return t === 'warning' || t.startsWith('warning') ? 'warning' : 'alert';
  if (kind === 'boss') return 'boss';
  if (kind === 'stage') return t.includes('victory') ? 'victory' : 'stage';
  if (kind === 'clear') return 'clear';
  if (kind === 'refit') return 'clear';
  return 'wave';
}

/** Envelope helpers: 0→1 entrance, 1→0 exit. */
function phases(b) {
  const tin = clamp(b.t / IN, 0, 1);
  const tout = clamp((b.time - b.t) / OUT, 0, 1);
  return [tin, tout];
}

/**
 * Draw the active banner.
 * @param {*} H HUD
 * @param {{title:string, sub:string, kind:string, variant:string, t:number, time:number}} b
 * @param {number} W @param {number} Hh CSS size
 * @param {number} yAnchor CSS px where the banner centre goes
 */
export function drawBanner(H, ctx, b, W, Hh, yAnchor) {
  switch (b.variant) {
    case 'warning':
      return drawWarning(H, ctx, b, W, yAnchor);
    case 'alert':
      return drawAlert(H, ctx, b, W, yAnchor);
    case 'boss':
      return drawBossName(H, ctx, b, W, yAnchor);
    case 'stage':
    case 'victory':
      return drawStage(H, ctx, b, W, yAnchor);
    case 'clear':
      return drawClear(H, ctx, b, W, yAnchor);
    default:
      return drawWave(H, ctx, b, W, yAnchor);
  }
}

// ---- wave: brass plaque slides in from the left, out to the right ---------------------------

function drawWave(H, ctx, b, W, y) {
  const [tin, tout] = phases(b);
  const s = H.s;
  const pw = 360;
  const ph = 74;
  const travel = W / s / 2 + pw;
  const off = (1 - easeOutBack(tin, 1.2)) * -travel + easeInCubic(1 - tout) * travel;
  H.at(ctx, W / 2 + off * s, y);
  const L = H.cache.get('banWave', pw, ph, (c) => {
    brassPanel(c, 0, 0, pw, ph, { r: 12, rim: 5, well: '#1b120a' });
    rivets(c, 40, 3, pw - 40, 3, 10, 1);
    rivets(c, 40, ph - 3, pw - 40, ph - 3, 10, 1);
    c.strokeStyle = 'rgba(201,151,63,0.45)';
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(60, ph * 0.62);
    c.lineTo(pw - 60, ph * 0.62);
    c.stroke();
  }, 4);
  // spinning gears at the ends (behind the plaque)
  const gl = gearLayer(H, 26, 12);
  const rot = H.t * 1.6 + off * 0.02;
  for (const sx of [-1, 1]) {
    ctx.save();
    ctx.translate(sx * (pw / 2 - 4), 0);
    ctx.rotate(rot * sx);
    LayerCache.draw(ctx, gl, -26, -26);
    ctx.restore();
  }
  LayerCache.draw(ctx, L, -pw / 2, -ph / 2);
  const tl = H.txt(b.title.toUpperCase(), { size: 30, ls: 4, color: '#fff3c4', shadow: 'rgba(0,0,0,0.9)', dy: 2, maxW: pw - 90 });
  blitText(ctx, tl, 0, -8);
  if (b.sub) {
    const sl = H.txt(b.sub, { size: 13, kind: 'b', weight: 'normal', style: 'italic', ls: 0.5, color: 'rgba(242,212,138,0.95)', maxW: pw - 90 });
    blitText(ctx, sl, 0, 22);
  }
}

function gearLayer(H, r, teeth) {
  return H.cache.get(`gear${r}_${teeth}`, r * 2, r * 2, (c) => cog(c, r, r, r - 1, teeth), 2);
}

// ---- clear: gilded ribbon with a light sweep -----------------------------------------------

function drawClear(H, ctx, b, W, y) {
  const [tin, tout] = phases(b);
  const rw = 380;
  const rh = 56;
  const k = 0.6 + 0.4 * easeOutBack(tin, 2);
  H.at(ctx, W / 2, y - (1 - tout) * 30 * H.s, k);
  ctx.globalAlpha = Math.min(tin * 2, tout);
  const L = H.cache.get('banRibbon', rw, rh, (c) => {
    // notched tails
    for (const sx of [-1, 1]) {
      const x0 = sx < 0 ? 0 : rw;
      c.beginPath();
      c.moveTo(x0 - sx * 70, 10);
      c.lineTo(x0 + sx * 6, 10);
      c.lineTo(x0 - sx * 10, rh / 2 + 4);
      c.lineTo(x0 + sx * 6, rh - 2);
      c.lineTo(x0 - sx * 70, rh - 2);
      c.closePath();
      c.fillStyle = '#8a5a1c';
      c.fill();
      c.lineWidth = 1.2;
      c.strokeStyle = INK;
      c.stroke();
    }
    roundRect(c, 30, 2, rw - 60, rh - 10, 6);
    const g = c.createLinearGradient(0, 2, 0, rh - 8);
    g.addColorStop(0, '#fff0b8');
    g.addColorStop(0.35, '#f2c25a');
    g.addColorStop(0.7, '#c98f2e');
    g.addColorStop(1, '#8a5a1c');
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 1.4;
    c.strokeStyle = INK;
    c.stroke();
    c.strokeStyle = 'rgba(90,50,10,0.55)';
    c.setLineDash([3, 3]);
    roundRect(c, 36, 6, rw - 72, rh - 18, 4);
    c.stroke();
    c.setLineDash([]);
  }, 4);
  LayerCache.draw(ctx, L, -rw / 2, -rh / 2);
  // light sweep
  const sweep = ((b.t * 1.4) % 1.6) - 0.3;
  if (sweep > 0 && sweep < 1) {
    ctx.save();
    roundRect(ctx, -rw / 2 + 30, -rh / 2 + 2, rw - 60, rh - 10, 6);
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= 0.7;
    const sx = -rw / 2 + 30 + (rw - 60) * sweep;
    ctx.drawImage(H.shimmer.img, sx - 30, -rh / 2, 60, rh);
    ctx.restore();
  }
  // dark ink stamped into the gold, with a pale lower lip
  const tl = H.txt(b.title.toUpperCase(), { size: 24, ls: 3, color: '#3a2208', shadow: 'rgba(255,248,220,0.6)', dy: 1.2, maxW: rw - 90 });
  blitText(ctx, tl, 0, -3.2);
  if (b.sub) {
    const bonus = /^\+\d/.test(b.sub);
    const pop = 1 + 0.4 * (1 - clamp((b.t - 0.25) / 0.3, 0, 1));
    const sl = bonus
      ? H.txt(b.sub, { size: 18, kind: 'm', color: '#ffe08a', shadow: 'rgba(0,0,0,0.9)', dy: 1.6 })
      : H.txt(b.sub, { size: 13, kind: 'b', weight: 'normal', style: 'italic', color: '#fff3c4', shadow: 'rgba(0,0,0,0.9)', dy: 1.4, maxW: rw });
    blitText(ctx, sl, 0, rh / 2 + 14, 'center', pop);
  }
  ctx.globalAlpha = 1;
}

// ---- stage title card (and victory) ----------------------------------------------------------

function drawStage(H, ctx, b, W, y) {
  const [tin, tout] = phases(b);
  const s = H.s;
  const a = Math.min(smooth(tin), smooth(tout));
  const bandH = 130;
  const ww = W / s;
  H.at(ctx, 0, y);
  ctx.globalAlpha = a;
  const band = H.cache.get(`banBand${Math.round(ww)}`, ww, bandH, (c) => {
    const g = c.createLinearGradient(0, 0, ww, 0);
    g.addColorStop(0, 'rgba(20,12,5,0)');
    g.addColorStop(0.18, 'rgba(20,12,5,0.78)');
    g.addColorStop(0.82, 'rgba(20,12,5,0.78)');
    g.addColorStop(1, 'rgba(20,12,5,0)');
    c.fillStyle = g;
    c.fillRect(0, 10, ww, bandH - 20);
    for (const ry of [10, bandH - 13]) {
      const rg = c.createLinearGradient(0, 0, ww, 0);
      rg.addColorStop(0, 'rgba(201,151,63,0)');
      rg.addColorStop(0.2, '#c9973f');
      rg.addColorStop(0.5, '#f2d48a');
      rg.addColorStop(0.8, '#c9973f');
      rg.addColorStop(1, 'rgba(201,151,63,0)');
      c.fillStyle = rg;
      c.fillRect(0, ry, ww, 3);
      c.fillStyle = 'rgba(10,6,2,0.7)';
      c.fillRect(ww * 0.15, ry + 3, ww * 0.7, 1);
    }
  });
  const open = easeOutCubic(tin);
  ctx.save();
  ctx.translate(0, -bandH / 2);
  ctx.translate(ww / 2, bandH / 2);
  ctx.scale(1, 0.15 + 0.85 * open);
  ctx.translate(-ww / 2, -bandH / 2);
  LayerCache.draw(ctx, band, 0, 0);
  ctx.restore();
  const victory = b.variant === 'victory';
  if (victory) {
    const rays = H.cache.get('banRays', 360, 360, (c) => {
      for (let i = 0; i < 18; i++) {
        const a0 = (i / 18) * TAU;
        const g = c.createRadialGradient(180, 180, 10, 180, 180, 180);
        g.addColorStop(0, 'rgba(255,190,80,0.7)');
        g.addColorStop(0.6, 'rgba(255,170,60,0.2)');
        g.addColorStop(1, 'rgba(255,170,60,0)');
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(180, 180);
        c.arc(180, 180, 180, a0, a0 + TAU / 36);
        c.closePath();
        c.fill();
      }
    });
    ctx.save();
    ctx.translate(ww / 2, 0);
    ctx.rotate(H.t * 0.3);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a * 0.45;
    const rk = 0.6 + 0.6 * open;
    LayerCache.draw(ctx, rays, -180 * rk, -180 * rk, rk);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a;
  }
  // title settles in: slight zoom-out while the band opens
  const title = b.title.toUpperCase();
  const tl = H.txt(title, { size: victory ? 50 : 42, ls: 5, color: victory ? '#ffe08a' : '#fff3c4', shadow: 'rgba(0,0,0,0.95)', dy: 2.5, maxW: ww - 140 });
  const tz = 1 + 0.18 * (1 - easeOutCubic(tin));
  blitText(ctx, tl, ww / 2, -10, 'center', tz);
  const tw = tl.w * tz;
  const fs = tl.h / 1.45;
  // gear ornaments flanking the title
  const gl = gearLayer(H, 15, 10);
  for (const sx of [-1, 1]) {
    ctx.save();
    ctx.translate(ww / 2 + sx * (tw / 2 + 30), -10);
    ctx.rotate(H.t * sx * 1.2);
    LayerCache.draw(ctx, gl, -15, -15);
    ctx.restore();
  }
  if (b.sub) {
    ctx.globalAlpha = a * clamp((b.t - 0.25) / 0.4, 0, 1);
    const sl = H.txt(b.sub, { size: 15, kind: 'b', weight: 'normal', style: 'italic', ls: 1, color: 'rgba(242,212,138,0.95)', maxW: ww - 80 });
    blitText(ctx, sl, ww / 2, fs * 0.5 + 16);
  }
  ctx.globalAlpha = 1;
}

/** Per-frame banner side effects (sparks), called from HUD.update with real dt. */
export function updateBanner(H, b, dt) {
  if (b.variant !== 'victory' || b.t > b.time - 0.5 || !H.L) return;
  b.acc = (b.acc || 0) + dt * 30;
  const s = H.s;
  while (b.acc >= 1) {
    b.acc -= 1;
    const x = H.W / 2 + (Math.random() - 0.5) * H.W * 0.6;
    H.sparks.burst(x, (H.bannerY || H.H * 0.3) - 40 * s, 1, Math.random() < 0.5 ? '#ffcf4a' : '#fff3c4', 160, {
      grav: 140,
      life: 1.3,
      size: 3 * s,
    });
  }
}

// ---- boss WARNING: hazard bands, flashing text, beacons ---------------------------------------

function drawWarning(H, ctx, b, W, y) {
  const [tin, tout] = phases(b);
  const s = H.s;
  const ww = W / s;
  const open = Math.min(easeOutCubic(tin), easeOutCubic(tout));
  const bandH = 118;
  H.at(ctx, 0, y);
  // red edge pulse
  const pulse = 0.5 + 0.5 * Math.sin(b.t * TAU * 1.6);
  const reduced = H.reducedFlash;
  // central dark band
  ctx.save();
  ctx.scale(1, open);
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = '#140604';
  ctx.fillRect(0, -bandH / 2, ww, bandH);
  ctx.globalAlpha = 1;
  // scrolling hazard stripes, top and bottom
  const tile = H.cache.get('hazTile', 64, 20, (c) => {
    stripes(c, 0, 0, 64, 20, 16, '#1d1508', '#e8b923');
    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.fillRect(0, 0, 64, 3);
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(0, 17, 64, 3);
  });
  const sp = (b.t * 70) % 64;
  for (const [yy, dir] of [[-bandH / 2 - 20, 1], [bandH / 2, -1]]) {
    for (let x = -64; x < ww + 64; x += 64) LayerCache.draw(ctx, tile, x + sp * dir, yy);
    ctx.fillStyle = INK;
    ctx.fillRect(0, yy - 1, ww, 1.5);
    ctx.fillRect(0, yy + 20, ww, 1.5);
  }
  ctx.restore();
  if (open < 0.3) return;
  // beacons
  for (const sx of [-1, 1]) {
    const bx = ww / 2 + sx * Math.min(ww * 0.36, 260);
    const lamp = H.cache.get('beacon', 34, 34, (c) => {
      c.beginPath();
      c.arc(17, 17, 13, 0, TAU);
      c.fillStyle = '#5a1b18';
      c.fill();
      c.lineWidth = 2;
      c.strokeStyle = '#c9973f';
      c.stroke();
      c.beginPath();
      c.arc(17, 17, 8, 0, TAU);
      c.fillStyle = '#ff3a20';
      c.fill();
    }, 2);
    LayerCache.draw(ctx, lamp, bx - 17, -17);
    ctx.save();
    ctx.translate(bx, 0);
    ctx.rotate(b.t * 7 * sx);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.65;
    const beam = H.cache.get('beam', 140, 40, (c) => {
      const g = c.createLinearGradient(0, 0, 140, 0);
      g.addColorStop(0, 'rgba(255,80,40,0.9)');
      g.addColorStop(1, 'rgba(255,80,40,0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(0, 20);
      c.lineTo(140, 0);
      c.lineTo(140, 40);
      c.closePath();
      c.fill();
    });
    LayerCache.draw(ctx, beam, 0, -20);
    ctx.rotate(Math.PI);
    LayerCache.draw(ctx, beam, 0, -20);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  // WARNING text
  const on = reduced ? 1 : Math.sin(b.t * TAU * 2.4) > -0.35 ? 1 : 0.35;
  const wl = H.txt('WARNING', { size: 52, ls: 10, color: '#ff3a20', shadow: 'rgba(0,0,0,0.95)', dy: 3, maxW: Math.min(ww - 60, 2 * Math.min(ww * 0.36, 260) - 70) });
  ctx.globalAlpha = on;
  if (!reduced) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = on * 0.5 * pulse;
    ctx.drawImage(H.dotRed.img, ww / 2 - 200, -70, 400, 120);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = on;
  }
  blitText(ctx, wl, ww / 2, -14);
  ctx.globalAlpha = 1;
  if (b.sub) {
    const sl = H.txt(b.sub.toUpperCase(), { size: 16, ls: 2, color: '#ffd9c8', shadow: 'rgba(0,0,0,0.95)', dy: 1.5, maxW: ww - 80 });
    blitText(ctx, sl, ww / 2, 30);
  }
}

// ---- compact alert (boss phase lines etc.) --------------------------------------------------

function drawAlert(H, ctx, b, W, y) {
  const [tin, tout] = phases(b);
  const pw = 380;
  const ph = 56;
  const shake = tin < 1 ? Math.sin(b.t * 80) * 5 * (1 - tin) : 0;
  const k = 0.8 + 0.2 * easeOutBack(tin, 2.5);
  H.at(ctx, W / 2 + shake * H.s, y, k);
  ctx.globalAlpha = Math.min(tin * 3, tout);
  const L = H.cache.get('banAlert', pw, ph, (c) => {
    roundRect(c, 0, 0, pw, ph, 8);
    c.save();
    c.clip();
    stripes(c, 0, 0, pw, ph, 18, '#1d1508', '#d9a520');
    c.restore();
    roundRect(c, 0, 0, pw, ph, 8);
    c.lineWidth = 1.4;
    c.strokeStyle = INK;
    c.stroke();
    brassPanel(c, 9, 7, pw - 18, ph - 14, { kind: 'crimson', r: 6, rim: 2.5, well: '#1a0605', rivets: false });
  }, 3);
  LayerCache.draw(ctx, L, -pw / 2, -ph / 2);
  const tl = H.txt(b.title.toUpperCase(), { size: b.sub ? 17 : 20, ls: 2, color: '#ffb090', shadow: 'rgba(0,0,0,0.9)', dy: 1.6, maxW: pw - 50 });
  blitText(ctx, tl, 0, b.sub ? -6 : 0);
  if (b.sub) {
    const sl = H.txt(b.sub, { size: 10, kind: 'b', weight: 'normal', style: 'italic', color: '#f3e8c9', maxW: pw - 50 });
    blitText(ctx, sl, 0, 13);
  }
  ctx.globalAlpha = 1;
}

// ---- boss name reveal ------------------------------------------------------------------------

function drawBossName(H, ctx, b, W, y) {
  const [tin, tout] = phases(b);
  const s = H.s;
  const ww = W / s;
  const a = Math.min(smooth(tin), smooth(tout));
  H.at(ctx, 0, y);
  ctx.globalAlpha = a;
  const band = H.cache.get(`banBoss${Math.round(ww)}`, ww, 120, (c) => {
    const g = c.createLinearGradient(0, 0, ww, 0);
    g.addColorStop(0, 'rgba(26,4,2,0)');
    g.addColorStop(0.2, 'rgba(26,4,2,0.85)');
    g.addColorStop(0.8, 'rgba(26,4,2,0.85)');
    g.addColorStop(1, 'rgba(26,4,2,0)');
    c.fillStyle = g;
    c.fillRect(0, 8, ww, 104);
    for (const ry of [8, 109]) {
      const rg = c.createLinearGradient(0, 0, ww, 0);
      rg.addColorStop(0, 'rgba(192,57,43,0)');
      rg.addColorStop(0.3, '#c0392b');
      rg.addColorStop(0.5, '#ff7a5a');
      rg.addColorStop(0.7, '#c0392b');
      rg.addColorStop(1, 'rgba(192,57,43,0)');
      c.fillStyle = rg;
      c.fillRect(0, ry, ww, 3);
    }
  });
  LayerCache.draw(ctx, band, 0, -60);
  const title = b.title.toUpperCase();
  const zoom = 1 + 0.35 * (1 - easeOutCubic(tin));
  const tl = H.txt(title, { size: 42, ls: 6, color: '#ffe6d8', shadow: 'rgba(0,0,0,0.95)', dy: 3, maxW: ww - 120 });
  blitText(ctx, tl, ww / 2, -12, 'center', zoom);
  const tw = tl.w;
  if (tin < 1) {
    // white-hot flash on the reveal
    const fl = H.txt(title, { size: 42, ls: 6, color: '#ffffff', shadow: null, dy: 3, maxW: ww - 120 });
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a * (1 - tin);
    blitText(ctx, fl, ww / 2, -12, 'center', zoom);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a;
  }
  if (b.sub) {
    ctx.globalAlpha = a * clamp((b.t - 0.35) / 0.4, 0, 1);
    const sl = H.txt(b.sub, { size: 16, kind: 'b', weight: 'normal', style: 'italic', ls: 1, color: '#ffcf4a', maxW: ww - 160 });
    const sw = sl.w;
    blitText(ctx, sl, ww / 2, 28);
    const sk = H.cache.get('banSkull', 20, 20, (c) => skull(c, 10, 10, 8), 2);
    for (const sx of [-1, 1]) LayerCache.draw(ctx, sk, ww / 2 + sx * (sw / 2 + 18) - 10, 18);
  }
  // crimson rule under the name grows outward
  const gw = Math.min(tw * zoom + 40, ww - 60) * easeOutCubic(tin);
  ctx.globalAlpha = a;
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(ww / 2 - gw / 2, 12, gw, 1.5);
  ctx.globalAlpha = 1;
}
