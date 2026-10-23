// HUD player gauges (WP22): hull bar, steam pressure dial, bombs, cogs, aux/primary sockets,
// Aether XP bar and the co-op mini panels. Static brass is cached (LayerCache); per-frame work
// is a handful of rects, arcs and blits.

import { Sprites } from '../gfx/sprites.js';
import { metalRadial, roundRect, rivet, ink, INK } from '../gfx/drawkit.js';
import { PRIMARIES, AUX, EVOLUTIONS } from '../content/weapons/index.js';
import {
  TAU,
  clamp,
  approach,
  font,
  spacing,
  engraved,
  LayerCache,
  brassPanel,
  brassDisc,
  glassSheen,
  rivets,
  cog,
  easeOutBack,
} from './hud-kit.js';

const MAX_AUX = 4;
const DIAL_A0 = Math.PI * 0.75;
const DIAL_SWEEP = Math.PI * 1.5;

/** Panel geometry (UI units). */
export const PANEL = { w: 306, h: 80, dialX: 40, dialY: 40, dialR: 36, barX: 60, barY: 8, barW: 244, barH: 28 };
export const SLOT = 46;
export const MINI = { w: 170, h: 50 };

// ---- per-player view state --------------------------------------------------------------------

export function makePlayerView(p) {
  return {
    hpShown: p?.hp ?? 0,
    hpLag: p?.hp ?? 0,
    lagHold: 0,
    hitT: 0,
    healT: 0,
    needle: 1,
    needleV: 0,
    bombs: p?.bombs ?? 0,
    bombGoneT: 0,
    bombGoneIdx: -1,
    bombPopT: 0,
    steamPrev: p?.steam ?? 0,
    cd: new Map(), // slot id → {max, prev, readyT, kickV}
    downT: 0,
    shieldWas: false,
    shieldT: 0,
  };
}

export function updatePlayerView(pv, p, dt, H) {
  const s = p.stats || {};
  const maxHp = Math.max(1, s.maxHp || 1);
  const hp = clamp(p.hp, 0, maxHp);
  if (hp > pv.hpShown + 0.5) pv.healT = 1;
  pv.hpShown = hp < pv.hpShown ? hp : approach(pv.hpShown, hp, 6, dt);
  if (hp < pv.hpLag - 0.01) {
    pv.lagHold -= dt;
    if (pv.lagHold <= 0) pv.hpLag = Math.max(hp, pv.hpLag - maxHp * 0.6 * dt - (pv.hpLag - hp) * 2.2 * dt);
  } else {
    pv.hpLag = hp;
    pv.lagHold = 0;
  }
  pv.hitT = Math.max(0, pv.hitT - dt * 2.2);
  pv.healT = Math.max(0, pv.healT - dt * 1.6);

  // Spring needle with overshoot; trembles at full pressure.
  const steamMax = Math.max(1, s.steamMax || 100);
  let target = clamp(p.steam / steamMax, 0, 1);
  if (target > 0.985) target += Math.sin(H.t * 41) * 0.006 + Math.sin(H.t * 17) * 0.004;
  pv.needleV += ((target - pv.needle) * 170 - pv.needleV * 15) * dt;
  pv.needle += pv.needleV * dt;
  if (p.steam < pv.steamPrev - (s.boostCost || 30) * 0.6) H.onBoostPuff?.(p);
  pv.steamPrev = p.steam;

  if (p.bombs < pv.bombs) {
    pv.bombGoneIdx = p.bombs;
    pv.bombGoneT = 1;
  } else if (p.bombs > pv.bombs) {
    pv.bombPopT = 1;
  }
  pv.bombs = p.bombs;
  pv.bombGoneT = Math.max(0, pv.bombGoneT - dt * 2.5);
  pv.bombPopT = Math.max(0, pv.bombPopT - dt * 3);

  pv.downT = p.alive ? 0 : pv.downT + dt;
  if (p.shieldReady && !pv.shieldWas) pv.shieldT = 1;
  pv.shieldWas = !!p.shieldReady;
  pv.shieldT = Math.max(0, pv.shieldT - dt * 2);

  for (const slot of p.aux || []) {
    let c = pv.cd.get(slot.id);
    if (!c) pv.cd.set(slot.id, (c = { max: 0, prev: slot.cd || 0, readyT: 0, kick: 0 }));
    const cd = +slot.cd || 0;
    const explicit = slot.cdMax ?? slot.period ?? slot.data?.cdMax ?? slot.data?.period;
    if (explicit > 0) c.max = explicit;
    else if (cd > c.prev + 0.02) c.max = cd;
    if (c.prev > 0.001 && cd <= 0.001) c.readyT = 1;
    c.prev = cd;
    c.readyT = Math.max(0, c.readyT - dt * 3);
    c.kick = Math.max(c.kick * Math.exp(-10 * dt), +slot.kick || 0);
  }
}

// ---- gradients (created once per context) -----------------------------------------------------

let grads = null;
function G(ctx) {
  if (grads && grads.ctx === ctx) return grads;
  const hull = ctx.createLinearGradient(0, PANEL.barY + 6, 0, PANEL.barY + PANEL.barH - 6);
  hull.addColorStop(0, '#ff8a6a');
  hull.addColorStop(0.35, '#e0442c');
  hull.addColorStop(0.7, '#a8231a');
  hull.addColorStop(1, '#6e130e');
  const hullLow = ctx.createLinearGradient(0, PANEL.barY + 6, 0, PANEL.barY + PANEL.barH - 6);
  hullLow.addColorStop(0, '#ffd0a0');
  hullLow.addColorStop(0.4, '#ff5a2a');
  hullLow.addColorStop(1, '#8c1a10');
  const xp = ctx.createLinearGradient(0, 3, 0, 13);
  xp.addColorStop(0, '#d8fffb');
  xp.addColorStop(0.3, '#6ff0e0');
  xp.addColorStop(0.75, '#22a89f');
  xp.addColorStop(1, '#0f5c58');
  const mini = ctx.createLinearGradient(0, 0, 0, 8);
  mini.addColorStop(0, '#ff8a6a');
  mini.addColorStop(1, '#8c1a10');
  const steam = ctx.createLinearGradient(0, 0, 0, 4);
  steam.addColorStop(0, '#e6fbff');
  steam.addColorStop(1, '#4fb8d8');
  grads = { ctx, hull, hullLow, xp, mini, steam };
  return grads;
}

// ---- cached layers ------------------------------------------------------------------------

function hullFrame(H) {
  const { barW, barH } = PANEL;
  return H.cache.get('hullFrame', barW, barH, (c) => {
    brassPanel(c, 0, 0, barW, barH, { r: 7, rim: 4, well: '#22110c', rivets: false });
    rivets(c, 26, 2.2, barW - 8, 2.2, 9, 1.05);
    rivets(c, 26, barH - 2.2, barW - 8, barH - 2.2, 9, 1.05);
    rivet(c, barW - 2.4, barH / 2, 1.3);
  }, 3);
}

/** Glass + segment ticks over the hull fill (depends on maxHp). */
function hullGlass(H, maxHp) {
  const { barW, barH } = PANEL;
  const step = maxHp > 400 ? 100 : maxHp > 200 ? 50 : 25;
  return H.cache.get(`hullGlass${maxHp}`, barW, barH, (c) => {
    const x0 = 22;
    const x1 = barW - 5;
    const y0 = 5;
    const y1 = barH - 5;
    c.strokeStyle = 'rgba(15,6,3,0.6)';
    c.lineWidth = 1.1;
    c.beginPath();
    for (let v = step; v < maxHp - 1; v += step) {
      const x = x0 + (x1 - x0) * (v / maxHp);
      const big = v % (step * 4) === 0;
      c.moveTo(x, big ? y0 : y0 + (y1 - y0) * 0.45);
      c.lineTo(x, y1);
    }
    c.stroke();
    const g = c.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, 'rgba(255,255,255,0.42)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.07)');
    g.addColorStop(0.55, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.25)');
    c.fillStyle = g;
    roundRect(c, x0, y0, x1 - x0, y1 - y0, 3);
    c.fill();
  });
}

function dialFace(H, cost) {
  const R = PANEL.dialR;
  const key = `dial${Math.round(cost * 100)}`;
  return H.cache.get(key, R * 2, R * 2, (c) => {
    const cx = R;
    const cy = R;
    brassDisc(c, cx, cy, R);
    // knurled bezel ticks
    c.strokeStyle = 'rgba(40,24,8,0.55)';
    c.lineWidth = 0.8;
    c.beginPath();
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU;
      c.moveTo(cx + Math.cos(a) * (R - 0.5), cy + Math.sin(a) * (R - 0.5));
      c.lineTo(cx + Math.cos(a) * (R - 2.6), cy + Math.sin(a) * (R - 2.6));
    }
    c.stroke();
    const fr = R - 6;
    c.beginPath();
    c.arc(cx, cy, fr + 1.2, 0, TAU);
    c.fillStyle = '#3a2410';
    c.fill();
    const face = c.createRadialGradient(cx - fr * 0.3, cy - fr * 0.35, 1, cx, cy, fr);
    face.addColorStop(0, '#fffaf0');
    face.addColorStop(0.7, '#efe2bf');
    face.addColorStop(1, '#c9b17e');
    c.beginPath();
    c.arc(cx, cy, fr, 0, TAU);
    c.fillStyle = face;
    c.fill();
    // insufficient-pressure zone (below one boost)
    const ac = DIAL_A0 + DIAL_SWEEP * cost;
    c.beginPath();
    c.arc(cx, cy, fr - 2, DIAL_A0, ac);
    c.arc(cx, cy, fr - 7, ac, DIAL_A0, true);
    c.closePath();
    c.fillStyle = 'rgba(192,57,43,0.55)';
    c.fill();
    // ready zone
    c.beginPath();
    c.arc(cx, cy, fr - 2, ac, DIAL_A0 + DIAL_SWEEP);
    c.arc(cx, cy, fr - 4.2, DIAL_A0 + DIAL_SWEEP, ac, true);
    c.closePath();
    c.fillStyle = 'rgba(51,150,170,0.6)';
    c.fill();
    // scale ticks
    c.strokeStyle = '#2b1a0c';
    for (let i = 0; i <= 20; i++) {
      const a = DIAL_A0 + (DIAL_SWEEP * i) / 20;
      const major = i % 5 === 0;
      c.lineWidth = major ? 1.3 : 0.6;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * (fr - 1.5), cy + Math.sin(a) * (fr - 1.5));
      c.lineTo(cx + Math.cos(a) * (fr - (major ? 7.5 : 4.5)), cy + Math.sin(a) * (fr - (major ? 7.5 : 4.5)));
      c.stroke();
    }
    // boost-cost marker: aether triangle pointing inward
    const tx = cx + Math.cos(ac) * (fr + 0.5);
    const ty = cy + Math.sin(ac) * (fr + 0.5);
    c.save();
    c.translate(tx, ty);
    c.rotate(ac);
    c.beginPath();
    c.moveTo(-5.5, 0);
    c.lineTo(1.5, -3.2);
    c.lineTo(1.5, 3.2);
    c.closePath();
    c.fillStyle = '#7ff3ff';
    c.fill();
    c.lineWidth = 0.8;
    c.strokeStyle = INK;
    c.stroke();
    c.restore();
    // labels
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = font(5.6, 'd');
    spacing(c, 1);
    c.fillStyle = '#5a3a18';
    c.fillText('STEAM', cx, cy - fr * 0.42);
    spacing(c, 0);
    c.font = font(4.6, 'b', 'bold', 'italic');
    c.fillStyle = '#7a5420';
    c.fillText('psi', cx, cy + fr * 0.7);
  }, 2);
}

function dialGlass(H) {
  const R = PANEL.dialR;
  return H.cache.get('dialGlass', R * 2, R * 2, (c) => {
    const fr = R - 6;
    glassSheen(c, R, R, fr, 0.5);
    c.beginPath();
    c.arc(R, R, fr, 0, TAU);
    c.strokeStyle = 'rgba(30,18,6,0.8)';
    c.lineWidth = 1;
    c.stroke();
    rivet(c, R, R, 3.2, 'brass');
    for (const a of [-0.8, 0.8, Math.PI - 0.8, Math.PI + 0.8]) rivet(c, R + Math.cos(a) * (R - 3), R + Math.sin(a) * (R - 3), 1.2);
  });
}

function bombRail(H, n) {
  const w = 12 + n * 22;
  return H.cache.get(`rail${n}`, w, 24, (c) => {
    brassPanel(c, 0, 0, w, 24, { r: 12, rim: 2.6, well: '#1a1209', rivets: false, wellAlpha: 0.8 });
  }, 3);
}

function cogPlate(H) {
  return H.cache.get('cogPlate', 92, 24, (c) => {
    brassPanel(c, 0, 0, 92, 24, { r: 12, rim: 2.6, well: '#1a1209', rivets: false, wellAlpha: 0.8 });
  }, 3);
}

function slotFrame(H, kind) {
  return H.cache.get(`slot_${kind}`, SLOT, SLOT, (c) => {
    const k = kind === 'evo' ? 'gold' : kind === 'primary' ? 'copper' : 'brass';
    brassPanel(c, 0, 0, SLOT, SLOT, { kind: k, r: 8, rim: 3.5, well: kind === 'empty' ? '#120c06' : '#20160c', rivetR: 1.2 });
    if (kind === 'evo') {
      c.strokeStyle = 'rgba(255,224,138,0.9)';
      c.lineWidth = 1;
      roundRect(c, 4.5, 4.5, SLOT - 9, SLOT - 9, 5);
      c.stroke();
    }
  }, 3);
}

/** Icon pre-scaled into its own layer (crisp downsample once, cheap blit after). */
function iconLayer(H, name, size) {
  return H.cache.get(`ico_${name}_${size}`, size, size, (c) => {
    if (Sprites.has(name)) {
      const s = Sprites.get(name);
      const k = size / Math.max(s.w, s.h);
      c.imageSmoothingQuality = 'high';
      c.drawImage(s.img, (size - s.w * k) / 2, (size - s.h * k) / 2, s.w * k, s.h * k);
    } else {
      cog(c, size / 2, size / 2, size * 0.4, 9);
    }
  });
}

/** Sprite (pickup) icon layer, e.g. pk_bomb / pk_cog. */
export function spriteIcon(H, name, size, fallback) {
  return H.cache.get(`spr_${name}_${size}`, size, size, (c) => {
    if (Sprites.has(name)) {
      const s = Sprites.get(name);
      const k = size / Math.max(s.w, s.h);
      c.drawImage(s.img, (size - s.w * k) / 2, (size - s.h * k) / 2, s.w * k, s.h * k);
    } else {
      fallback?.(c, size);
    }
  });
}

function bombFallback(c, size) {
  const r = size * 0.36;
  c.beginPath();
  c.arc(size / 2, size / 2 + 1, r, 0, TAU);
  c.fillStyle = metalRadial(c, size / 2, size / 2 + 1, r, 'gunmetal');
  c.fill();
  ink(c, 1);
  c.fillStyle = '#c9973f';
  c.fillRect(size / 2 - 2, size / 2 - r - 2, 4, 4);
}

function cogFallback(c, size) {
  cog(c, size / 2, size / 2, size * 0.42, 10);
}

// ---- drawing --------------------------------------------------------------------------------

/**
 * Main player panel: steam dial + hull bar + bombs + cogs.
 * @param {*} H HUD
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x CSS px (top-left)
 * @param {number} y
 */
export function drawPlayerPanel(H, ctx, p, pv, run, x, y) {
  const s = p.stats || {};
  const maxHp = Math.max(1, Math.round(s.maxHp || 1));
  const shake = pv.hitT > 0 ? Math.sin(H.t * 90) * 3 * pv.hitT : 0;
  H.at(ctx, x + shake * H.s, y);
  const g = G(ctx);
  const { barX, barY, barW, barH } = PANEL;

  // ---- hull bar
  LayerCache.draw(ctx, hullFrame(H), barX, barY);
  const fx0 = barX + 22;
  const fw = barW - 27;
  const fy = barY + 5;
  const fh = barH - 10;
  const hpK = clamp(pv.hpShown / maxHp, 0, 1);
  const lagK = clamp(pv.hpLag / maxHp, 0, 1);
  const low = p.alive && p.hp < maxHp * 0.25;
  if (lagK > hpK) {
    ctx.fillStyle = pv.lagHold > 0 ? '#fff6dc' : '#ffd38a';
    ctx.fillRect(fx0 + fw * hpK, fy, fw * (lagK - hpK), fh);
  }
  if (hpK > 0) {
    ctx.fillStyle = low ? g.hullLow : g.hull;
    ctx.fillRect(fx0, fy, fw * hpK, fh);
    if (low) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.25 + 0.25 * Math.sin(H.t * 9);
      ctx.fillStyle = '#ff6a3a';
      ctx.fillRect(fx0, fy, fw * hpK, fh);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    if (pv.healT > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = pv.healT * 0.7;
      ctx.fillStyle = '#7dff9a';
      ctx.fillRect(fx0, fy, fw * hpK, fh);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }
  if (pv.hitT > 0) {
    ctx.globalAlpha = pv.hitT * 0.6;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(fx0, fy, fw, fh);
    ctx.globalAlpha = 1;
  }
  LayerCache.draw(ctx, hullGlass(H, maxHp), barX, barY);
  // readout
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  const hpTxt = H.str('hp' + p.index, Math.ceil(p.hp));
  ctx.font = font(9, 'b');
  engraved(ctx, `/ ${maxHp}`, barX + barW - 9, barY + barH / 2 + 1, '#f6e7c2');
  const w2 = ctx.measureText(`/ ${maxHp}`).width;
  ctx.font = font(14, 'm');
  engraved(ctx, hpTxt, barX + barW - 12 - w2, barY + barH / 2 + 1, low ? '#ffe0b0' : '#fff6dc');
  ctx.textAlign = 'left';
  ctx.font = font(8, 'd');
  spacing(ctx, 1.5);
  engraved(ctx, 'HULL', fx0 + 5, barY + barH / 2 + 1, low ? '#ffb3a0' : 'rgba(255,236,200,0.85)');
  spacing(ctx, 0);

  // ---- row 2: bombs + cogs (+ shield / balloon)
  const rowY = barY + barH + 6;
  const bmax = Math.max(0, Math.min(8, s.bombsMax | 0));
  let rx = barX + 22;
  if (bmax > 0) {
    const rail = bombRail(H, bmax);
    LayerCache.draw(ctx, rail, rx, rowY);
    const bi = spriteIcon(H, 'pk_bomb', 20, bombFallback);
    for (let i = 0; i < bmax; i++) {
      const cx = rx + 6 + i * 22;
      const have = i < p.bombs;
      let k = 1;
      let a = have ? 1 : 0.22;
      if (have && i === p.bombs - 1 && pv.bombPopT > 0) k = 1 + 0.5 * pv.bombPopT;
      if (!have && i === pv.bombGoneIdx && pv.bombGoneT > 0) {
        k = 1 + 0.8 * (1 - pv.bombGoneT);
        a = Math.max(a, pv.bombGoneT);
      }
      ctx.globalAlpha = a;
      LayerCache.draw(ctx, bi, cx + 11 - 10 * k, rowY + 12 - 10 * k, k);
    }
    ctx.globalAlpha = 1;
    rx += 12 + bmax * 22 + 6;
  }
  // aether shield & emergency balloon pips
  if (s.shieldInterval > 0) {
    const ready = !!p.shieldReady;
    const cx = rx + 10;
    const cy = rowY + 12;
    ctx.beginPath();
    ctx.arc(cx, cy, 8 + pv.shieldT * 4, 0, TAU);
    ctx.fillStyle = ready ? 'rgba(127,243,255,0.35)' : 'rgba(60,80,90,0.35)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = ready ? '#7ff3ff' : '#5b626b';
    ctx.stroke();
    if (!ready && s.shieldInterval > 0) {
      const k = clamp((p.shieldT || 0) / s.shieldInterval, 0, 1);
      ctx.beginPath();
      ctx.arc(cx, cy, 8, -Math.PI / 2, -Math.PI / 2 + TAU * k);
      ctx.strokeStyle = '#33c9c0';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    rx += 22;
  }
  if ((p.revivesLeft || 0) > 0) {
    const cx = rx + 9;
    const cy = rowY + 11;
    ctx.beginPath();
    ctx.ellipse(cx, cy - 2, 6.5, 7.5, 0, 0, TAU);
    ctx.fillStyle = '#e6d8b4';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = '#8c2f2b';
    ctx.fillRect(cx - 6, cy - 3, 12, 2.4);
    ctx.strokeStyle = '#3f2812';
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy + 4);
    ctx.lineTo(cx - 2, cy + 9);
    ctx.moveTo(cx + 4, cy + 4);
    ctx.lineTo(cx + 2, cy + 9);
    ctx.stroke();
    ctx.fillStyle = '#7a5420';
    ctx.fillRect(cx - 2.5, cy + 8.5, 5, 3);
    rx += 22;
  }
  // cogs (primary player only; the run shares one purse)
  if (p.index === 0 && run) {
    const cx = PANEL.barX + barW - 92;
    const cp = cogPlate(H);
    LayerCache.draw(ctx, cp, cx, rowY);
    const pop = H.run.cogPopT;
    const ci = spriteIcon(H, 'pk_cog', 22, cogFallback);
    ctx.save();
    ctx.translate(cx + 13, rowY + 12);
    ctx.rotate(H.run.cogSpin);
    const k = 1 + pop * 0.35;
    ctx.drawImage(ci.img, -11 * k, -11 * k, 22 * k, 22 * k);
    ctx.restore();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = font(12 + pop * 3, 'm');
    engraved(ctx, H.str('cogs', run.cogs, true), cx + 85, rowY + 12.5, pop > 0.05 ? '#fff3c4' : '#f2d48a');
  }

  // ---- steam dial (drawn last: overlaps the bar's end cap)
  const R = PANEL.dialR;
  const dx = PANEL.dialX - R;
  const dy = PANEL.dialY - R;
  const cost = clamp((s.boostCost || 30) / Math.max(1, s.steamMax || 100), 0.02, 1);
  LayerCache.draw(ctx, dialFace(H, cost), dx, dy);
  const ready = p.steam >= (s.boostCost || 30);
  // digital readout
  ctx.textAlign = 'center';
  ctx.font = font(7.5, 'm');
  ctx.fillStyle = ready ? '#2b1a0c' : '#8c2f2b';
  ctx.fillText(H.str('st' + p.index, Math.floor(p.steam)), PANEL.dialX, PANEL.dialY + 11);
  // needle
  const na = DIAL_A0 + DIAL_SWEEP * clamp(pv.needle, -0.03, 1.04);
  ctx.save();
  ctx.translate(PANEL.dialX, PANEL.dialY);
  ctx.rotate(na);
  ctx.beginPath();
  ctx.moveTo(-7, -2.4);
  ctx.lineTo(R - 10, -0.6);
  ctx.lineTo(R - 8, 0);
  ctx.lineTo(R - 10, 0.6);
  ctx.lineTo(-7, 2.4);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.translate(1, 1.5);
  ctx.fill();
  ctx.translate(-1, -1.5);
  ctx.fillStyle = '#9b1d14';
  ctx.fill();
  ctx.lineWidth = 0.6;
  ctx.strokeStyle = '#2a0805';
  ctx.stroke();
  ctx.restore();
  LayerCache.draw(ctx, dialGlass(H), dx, dy);
  // ready lamp
  const lx = PANEL.dialX;
  const ly = PANEL.dialY + 22.5;
  ctx.beginPath();
  ctx.arc(lx, ly, 3.2, 0, TAU);
  ctx.fillStyle = ready ? '#7dffb0' : (Math.sin(H.t * 10) > 0 ? '#ff5a3a' : '#7a1d14');
  ctx.fill();
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = INK;
  ctx.stroke();
  if (ready) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(H.dot.img, lx - 9, ly - 9, 18, 18);
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---- down overlay
  if (!p.alive) {
    ctx.globalAlpha = clamp(pv.downT * 3, 0, 0.75);
    ctx.fillStyle = '#140a05';
    roundRect(ctx, 0, 0, PANEL.w, PANEL.h - 8, 10);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.font = font(15, 'd');
    spacing(ctx, 3);
    engraved(ctx, 'SHIP DOWN', PANEL.w / 2, 26, '#ff8a6a');
    spacing(ctx, 0);
    ctx.font = font(9, 'b', 'normal', 'italic');
    engraved(ctx, 'Your crew will patch her up at wave end', PANEL.w / 2, 46, '#f3e8c9');
  }
}

/**
 * Primary + aux sockets with level pips and cooldown sweeps. Horizontal row.
 * @returns {number} width in UI units
 */
export function drawLoadout(H, ctx, p, pv, x, y) {
  H.at(ctx, x, y);
  let cx = 0;
  const prim = PRIMARIES[p.primary?.id];
  if (prim) {
    drawSlot(H, ctx, cx, 0, 'primary', prim.icon || `icon_${prim.id}`, p.primary.level || 1, prim.maxLevel || 8, null, p.primary.kick || 0);
    cx += SLOT + 12;
  }
  for (let i = 0; i < MAX_AUX; i++) {
    const slot = p.aux?.[i];
    if (!slot) {
      ctx.globalAlpha = 0.4;
      LayerCache.draw(ctx, slotFrame(H, 'empty'), cx, 0);
      ctx.globalAlpha = 1;
      cx += SLOT + 6;
      continue;
    }
    const evo = EVOLUTIONS[slot.id];
    const def = evo || AUX[slot.id];
    const c = pv.cd.get(slot.id);
    drawSlot(H, ctx, cx, 0, evo ? 'evo' : 'aux', def?.icon || `icon_${slot.id}`, slot.level || 1, def?.maxLevel ?? 5, c, c?.kick || 0, slot);
    cx += SLOT + 6;
  }
  return cx - 6;
}

function drawSlot(H, ctx, x, y, kind, icon, level, maxLevel, cd, kick, slot) {
  LayerCache.draw(ctx, slotFrame(H, kind), x, y);
  const k = 1 + 0.12 * clamp(kick, 0, 1);
  const isz = SLOT - 12;
  const L = iconLayer(H, icon, isz);
  const ox = x + SLOT / 2 - (isz * k) / 2;
  const oy = y + SLOT / 2 - 2 - (isz * k) / 2;
  if (kind === 'evo') {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.45 + 0.25 * Math.sin(H.t * 3);
    ctx.drawImage(H.dotGold.img, x - 8, y - 8, SLOT + 16, SLOT + 16);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  LayerCache.draw(ctx, L, ox, oy, k);
  // cooldown sweep
  if (cd && cd.max > 0.05 && slot && slot.cd > 0.001) {
    const frac = clamp(slot.cd / cd.max, 0, 1);
    const cxp = x + SLOT / 2;
    const cyp = y + SLOT / 2 - 2;
    const a0 = -Math.PI / 2;
    ctx.save();
    roundRect(ctx, x + 4, y + 4, SLOT - 8, SLOT - 12, 5);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(cxp, cyp);
    ctx.arc(cxp, cyp, SLOT, a0, a0 + TAU * frac);
    ctx.closePath();
    ctx.fillStyle = 'rgba(12,7,2,0.62)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,224,150,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cxp, cyp);
    ctx.lineTo(cxp + Math.cos(a0 + TAU * frac) * SLOT, cyp + Math.sin(a0 + TAU * frac) * SLOT);
    ctx.stroke();
    ctx.restore();
  }
  if (cd && cd.readyT > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = cd.readyT * 0.8;
    ctx.fillStyle = '#fff3c4';
    roundRect(ctx, x + 4, y + 4, SLOT - 8, SLOT - 8, 5);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  // level pips
  const n = Math.min(8, Math.max(1, maxLevel));
  if (kind === 'evo' || n <= 1) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(6.5, 'd');
    spacing(ctx, 1);
    engraved(ctx, 'EVO', x + SLOT / 2, y + SLOT - 6.5, '#ffe08a');
    spacing(ctx, 0);
    return;
  }
  const gap = n > 5 ? 4.6 : 6.4;
  const r = n > 5 ? 1.6 : 2;
  const px0 = x + SLOT / 2 - ((n - 1) * gap) / 2;
  const py = y + SLOT - 6.5;
  ctx.fillStyle = 'rgba(10,6,2,0.85)';
  roundRect(ctx, px0 - r - 2, py - r - 1.5, (n - 1) * gap + r * 2 + 4, r * 2 + 3, r + 1.5);
  ctx.fill();
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc(px0 + i * gap, py, r, 0, TAU);
    ctx.fillStyle = i < level ? (kind === 'primary' ? '#ffb070' : '#ffd36b') : '#3a2a18';
    ctx.fill();
  }
}

/**
 * Aether XP bar with level badge.
 * @param {number} w total width in UI units
 */
export function drawXpBar(H, ctx, run, x, y, w) {
  const xs = H.xp;
  H.at(ctx, x, y);
  const h = 16;
  const bx = 30;
  const bw = w - bx;
  const frame = H.cache.get(`xpFrame${Math.round(w)}`, bw, h, (c) => {
    brassPanel(c, 0, 0, bw, h, { r: 8, rim: 3, well: '#07201f', rivets: false });
    const n = Math.max(2, Math.floor(bw / 70));
    rivets(c, 22, 1.6, bw - 10, 1.6, n, 0.9);
    rivets(c, 22, h - 1.6, bw - 10, h - 1.6, n, 0.9);
  }, 3);
  LayerCache.draw(ctx, frame, bx, 0);
  const fx0 = bx + 16;
  const fw = bw - 20;
  const k = clamp(xs.shown % 1, 0, 1);
  const g = G(ctx);
  if (k > 0) {
    ctx.save();
    ctx.translate(0, 0);
    ctx.fillStyle = g.xp;
    ctx.fillRect(fx0, 3, fw * k, h - 6);
    // travelling shimmer
    ctx.beginPath();
    ctx.rect(fx0, 3, fw * k, h - 6);
    ctx.clip();
    const sx = fx0 + ((H.t * 140) % (fw + 120)) - 60;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    ctx.drawImage(H.shimmer.img, sx - 30, 3, 60, h - 6);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    // bright leading edge
    ctx.fillStyle = 'rgba(230,255,255,0.85)';
    ctx.fillRect(fx0 + fw * k - 1.5, 3, 1.5, h - 6);
  }
  const glass = H.cache.get(`xpGlass${Math.round(w)}`, bw, h, (c) => {
    c.strokeStyle = 'rgba(0,20,20,0.55)';
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 1; i < 10; i++) {
      const xx = 16 + ((bw - 20) * i) / 10;
      c.moveTo(xx, i === 5 ? 3 : 7);
      c.lineTo(xx, h - 3);
    }
    c.stroke();
    const gg = c.createLinearGradient(0, 3, 0, h - 3);
    gg.addColorStop(0, 'rgba(255,255,255,0.4)');
    gg.addColorStop(0.45, 'rgba(255,255,255,0.05)');
    gg.addColorStop(0.5, 'rgba(255,255,255,0)');
    c.fillStyle = gg;
    c.fillRect(16, 3, bw - 20, h - 6);
  });
  LayerCache.draw(ctx, glass, bx, 0);
  if (xs.flashT > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = xs.flashT;
    ctx.fillStyle = '#b8fff6';
    roundRect(ctx, bx + 2, 2, bw - 4, h - 4, 6);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  // labels
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = font(7, 'd');
  spacing(ctx, 2);
  engraved(ctx, 'AETHER', fx0 + 14, h / 2 + 0.5, 'rgba(225,255,250,0.9)', 'rgba(0,20,20,0.9)', 1);
  spacing(ctx, 0);
  ctx.textAlign = 'right';
  ctx.font = font(8, 'm');
  engraved(ctx, H.str('xpTxt', `${Math.floor(run.xp)} / ${run.xpNext}`), bx + bw - 8, h / 2 + 0.5, 'rgba(225,255,250,0.9)', 'rgba(0,20,20,0.9)', 1);

  // level badge (cog medallion)
  const badge = H.cache.get('xpBadge', 44, 44, (c) => {
    cog(c, 22, 22, 21, 14, 'brass');
    c.beginPath();
    c.arc(22, 22, 13.5, 0, TAU);
    c.fillStyle = metalRadial(c, 22, 22, 13.5, 'aether', { spec: 0.2 });
    c.fill();
    c.fillStyle = 'rgba(4,40,40,0.55)';
    c.fill();
    c.lineWidth = 1.2;
    c.strokeStyle = INK;
    c.stroke();
    glassSheen(c, 22, 22, 13.5, 0.45);
  }, 3);
  const pop = xs.popT;
  const bk = 1 + 0.35 * easeOutBack(clamp(pop, 0, 1)) * pop;
  const spin = xs.spin;
  ctx.save();
  ctx.translate(21, h / 2);
  ctx.scale(bk, bk);
  ctx.save();
  ctx.rotate(spin);
  LayerCache.draw(ctx, badge, -22, -22);
  ctx.restore();
  if (xs.flashT > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = xs.flashT;
    ctx.drawImage(H.dotAether.img, -34, -34, 68, 68);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.textAlign = 'center';
  ctx.font = font(6, 'd');
  ctx.fillStyle = 'rgba(200,255,250,0.85)';
  ctx.fillText('LV', 0, -6.5);
  const lvl = Math.floor(xs.shown);
  ctx.font = font(lvl >= 100 ? 9 : 12, 'm');
  engraved(ctx, H.str('lvl', lvl), 0, 3.5, '#eafffd', 'rgba(0,30,30,0.9)', 1);
  ctx.restore();
}

/** Compact co-op panel. */
export function drawMiniPanel(H, ctx, p, pv, x, y) {
  H.at(ctx, x, y);
  const { w, h } = MINI;
  const frame = H.cache.get('mini', w, h, (c) => {
    brassPanel(c, 0, 0, w, h, { r: 8, rim: 3, well: '#1d140b' });
  }, 3);
  LayerCache.draw(ctx, frame, 0, 0);
  const s = p.stats || {};
  const col = p.color || '#7ff3ff';
  // player badge
  ctx.beginPath();
  ctx.arc(20, h / 2, 12, 0, TAU);
  ctx.fillStyle = metalRadial(ctx, 20, h / 2, 12, 'brass');
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(20, h / 2, 8.5, 0, TAU);
  ctx.fillStyle = col;
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(9, 'd');
  ctx.fillStyle = '#1a120a';
  ctx.fillText(`P${p.index + 1}`, 20, h / 2 + 0.5);
  const g = G(ctx);
  const bx = 38;
  const bw = w - bx - 10;
  // hull
  const maxHp = Math.max(1, s.maxHp || 1);
  const hk = clamp(pv.hpShown / maxHp, 0, 1);
  const lk = clamp(pv.hpLag / maxHp, 0, 1);
  ctx.fillStyle = '#0d0805';
  roundRect(ctx, bx, 9, bw, 10, 3);
  ctx.fill();
  if (lk > hk) {
    ctx.fillStyle = '#fff0c8';
    ctx.fillRect(bx + 1 + (bw - 2) * hk, 10, (bw - 2) * (lk - hk), 8);
  }
  ctx.save();
  ctx.translate(bx + 1, 10);
  ctx.fillStyle = g.mini;
  ctx.fillRect(0, 0, (bw - 2) * hk, 8);
  ctx.restore();
  // steam
  const sk = clamp(p.steam / Math.max(1, s.steamMax || 100), 0, 1);
  ctx.fillStyle = '#0d0805';
  roundRect(ctx, bx, 22, bw, 6, 2);
  ctx.fill();
  ctx.save();
  ctx.translate(bx + 1, 23);
  ctx.fillStyle = g.steam;
  ctx.fillRect(0, 0, (bw - 2) * sk, 4);
  ctx.restore();
  const ck = clamp((s.boostCost || 30) / Math.max(1, s.steamMax || 100), 0, 1);
  ctx.fillStyle = '#7ff3ff';
  ctx.fillRect(bx + 1 + (bw - 2) * ck - 0.5, 21, 1.2, 8);
  // bombs as pips + aux count
  for (let i = 0; i < Math.min(8, s.bombsMax || 0); i++) {
    ctx.beginPath();
    ctx.arc(bx + 4 + i * 9, 38, 3.2, 0, TAU);
    ctx.fillStyle = i < p.bombs ? '#3a3f47' : 'rgba(58,63,71,0.3)';
    ctx.fill();
    if (i < p.bombs) {
      ctx.strokeStyle = '#c9973f';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  let ax = bx + bw - 12;
  for (let i = (p.aux?.length || 0) - 1; i >= 0; i--) {
    const slot = p.aux[i];
    const def = EVOLUTIONS[slot.id] || AUX[slot.id];
    const L = iconLayer(H, def?.icon || `icon_${slot.id}`, 13);
    LayerCache.draw(ctx, L, ax, 32);
    ax -= 14;
  }
  if (!p.alive) {
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = '#140a05';
    roundRect(ctx, 3, 3, w - 6, h - 6, 6);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.font = font(11, 'd');
    spacing(ctx, 2);
    engraved(ctx, 'DOWN', w / 2 + 10, h / 2 - 4, '#ff8a6a');
    spacing(ctx, 0);
    ctx.font = font(7, 'b', 'normal', 'italic');
    engraved(ctx, 'revives at wave end', w / 2 + 10, h / 2 + 9, '#f3e8c9');
  }
}

