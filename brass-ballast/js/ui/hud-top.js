// HUD top row (WP22): score odometer with combo ring, stage/wave plaque with segmented wave
// progress, FPS meter and the mouse/gamepad reticle.

import { metalRadial, roundRect, INK, skull } from '../gfx/drawkit.js';
import {
  TAU,
  clamp,
  font,
  spacing,
  engraved,
  LayerCache,
  brassPanel,
  rivets,
  digitStrip,
  drawOdometer,
  easeOutBack,
  blitText,
} from './hud-kit.js';

export const SCORE = { w: 184, h: 46 };
export const PLAQUE = { w: 224, h: 54 };

const DIG_W = 12.6;
const DIG_H = 22;

// ---- score & combo ----------------------------------------------------------------------------

/**
 * Score plaque + combo ring. Anchored at its top-RIGHT corner (x, y) in CSS px.
 * @returns {number} height drawn in UI units
 */
export function drawScore(H, ctx, run, xRight, y) {
  const R = H.run;
  H.at(ctx, xRight - SCORE.w * H.s, y);
  const { w, h } = SCORE;
  const frame = H.cache.get(`scoreFrame${H.modeName}`, w, h, (c) => {
    brassPanel(c, 0, 0, w, h, { r: 8, rim: 4, well: '#140d07' });
    rivets(c, 30, h - 2.2, w - 30, h - 2.2, 6, 0.9);
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.font = font(7, 'd');
    spacing(c, 2.5);
    engraved(c, 'SCORE', 10, 11.5, 'rgba(242,212,138,0.9)');
    spacing(c, 0);
    if (H.modeName) {
      c.textAlign = 'right';
      c.font = font(6.5, 'b', 'normal', 'italic');
      c.fillStyle = 'rgba(242,212,138,0.55)';
      c.fillText(H.modeName, w - 10, 11.5);
    }
    roundRect(c, 7, 17, w - 14, DIG_H + 1, 3);
    c.fillStyle = '#060402';
    c.fill();
  }, 3);
  LayerCache.draw(ctx, frame, 0, 0);
  // odometer drums (each source window maps exactly onto its cell: no clip needed)
  const strip = digitStrip(H.cache, 'digits', DIG_W, DIG_H, 19, '#fff3c4', 'rgba(0,0,0,0.85)');
  drawOdometer(ctx, strip, R.score, w - 9, 17.5, DIG_W, DIG_H, 9);
  const pop = R.scorePopT;
  if (pop > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = pop * 0.35;
    ctx.fillStyle = '#ffcf4a';
    ctx.fillRect(7, 17, w - 14, DIG_H + 1);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  // drum shading + separators
  const glass = H.cache.get('scoreGlass', w - 14, DIG_H + 1, (c) => {
    const gr = c.createLinearGradient(0, 0, 0, DIG_H + 1);
    gr.addColorStop(0, 'rgba(0,0,0,0.85)');
    gr.addColorStop(0.28, 'rgba(0,0,0,0)');
    gr.addColorStop(0.42, 'rgba(255,240,200,0.08)');
    gr.addColorStop(0.72, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.85)');
    c.fillStyle = gr;
    c.fillRect(0, 0, w - 14, DIG_H + 1);
    c.fillStyle = 'rgba(80,52,20,0.55)';
    for (let i = 1; i < 9; i++) c.fillRect(w - 16 - i * DIG_W - 0.4, 1, 0.8, DIG_H - 1);
  });
  LayerCache.draw(ctx, glass, 7, 17);

  // ---- combo row
  const vis = R.comboVis;
  if (vis <= 0.01 && R.breakT <= 0) return h;
  const cy = h + 22;
  const ringX = w - 22;
  ctx.globalAlpha = clamp(vis, 0, 1);
  const flare = R.flareT;
  const big = R.bigFlareT;
  if (flare > 0 || big > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp(Math.max(flare * 0.8, big), 0, 1) * vis;
    const gs = 44 + big * 50;
    ctx.drawImage(H.dotGold.img, ringX - gs, cy - gs, gs * 2, gs * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = clamp(vis, 0, 1);
  }
  const ring = H.cache.get('comboRing', 40, 40, (c) => {
    c.beginPath();
    c.arc(20, 20, 19, 0, TAU);
    c.fillStyle = metalRadial(c, 20, 20, 19, 'brass');
    c.fill();
    c.lineWidth = 1.2;
    c.strokeStyle = INK;
    c.stroke();
    c.beginPath();
    c.arc(20, 20, 14.5, 0, TAU);
    c.fillStyle = '#1a0f07';
    c.fill();
    c.stroke();
  }, 2);
  const rk = 1 + 0.22 * flare + 0.3 * big;
  LayerCache.draw(ctx, ring, ringX - 20 * rk, cy - 20 * rk, rk);
  const tk = clamp(run.comboTimer / 2.5, 0, 1);
  if (run.chain > 0 && tk > 0) {
    ctx.beginPath();
    ctx.arc(ringX, cy, 16.6 * rk, -Math.PI / 2, -Math.PI / 2 + TAU * tk);
    ctx.lineWidth = 3.2 * rk;
    ctx.strokeStyle = tk < 0.3 ? (Math.sin(H.t * 30) > 0 ? '#ff5a3a' : '#ffb070') : '#ffcf4a';
    ctx.stroke();
  }
  // chain count in the ring
  ctx.textAlign = 'center';
  ctx.font = font(run.chain >= 100 ? 9 : 11, 'm');
  engraved(ctx, H.str('chain', R.chainShown), ringX, cy + 0.5, '#fff3c4');
  // multiplier text
  const mult = R.comboShown;
  const col = mult >= 4.5 ? '#ff6ad5' : mult >= 3 ? '#ff9b2f' : mult >= 2 ? '#ffcf4a' : '#fff3c4';
  const mk = 1 + 0.35 * easeOutBack(clamp(flare, 0, 1)) * flare + 0.4 * big;
  ctx.save();
  ctx.translate(ringX - 26, cy + 1);
  ctx.scale(mk, mk);
  ctx.textAlign = 'right';
  ctx.font = font(20, 'd');
  engraved(ctx, H.str('mult', `×${mult.toFixed(1)}`), 0, 0, col, 'rgba(10,5,2,0.9)', 1.6);
  ctx.restore();
  blitText(ctx, H.txt('CHAIN', { size: 6.5, ls: 2, color: 'rgba(242,212,138,0.75)' }), ringX - 26, cy + 15, 'right');
  ctx.globalAlpha = 1;
  if (R.breakT > 0) {
    // the multiplier "shatters": red ghost falls away
    const k = R.breakT;
    ctx.globalAlpha = k;
    ctx.textAlign = 'right';
    ctx.font = font(18, 'd');
    engraved(ctx, R.breakText, ringX - 26, cy + (1 - k) * 26, '#ff5a3a');
    ctx.globalAlpha = 1;
  }
  return h + 44;
}

// ---- stage / wave plaque --------------------------------------------------------------------

/**
 * Stage plaque centred at x (CSS px), top y.
 */
export function drawPlaque(H, ctx, game, run, xCenter, y) {
  const { w, h } = PLAQUE;
  H.at(ctx, xCenter - (w / 2) * H.s, y);
  const frame = H.cache.get('plaque', w, h, (c) => {
    brassPanel(c, 0, 0, w, h, { r: 9, rim: 4, well: '#1a120a' });
    // engraved divider
    c.strokeStyle = 'rgba(201,151,63,0.35)';
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(16, 17.5);
    c.lineTo(w - 16, 17.5);
    c.stroke();
  }, 3);
  LayerCache.draw(ctx, frame, 0, 0);
  const d = game.director;
  const st = d?.state || run.director || '';
  const P = H.plaqueInfo(run, st);
  blitText(ctx, H.txt(P.top, { size: 7.5, ls: 1.8, color: 'rgba(242,212,138,0.9)', maxW: w - 30 }), w / 2, 11);
  const warn = st === 'bossWarning' || st === 'boss';
  const col = warn ? (Math.sin(H.t * 6) > -0.2 ? '#ff6a4a' : '#ffb090') : '#fff3c4';
  blitText(ctx, H.txt(P.main, { size: 15, ls: 1, color: col, maxW: w - 40 }), w / 2, 28.5);

  // segmented progress bar
  const segs = P.segs;
  const bx = 14;
  const bw = w - 28 - 16;
  const by = h - 15;
  const bh = 7;
  ctx.fillStyle = '#080503';
  roundRect(ctx, bx - 1.5, by - 1.5, bw + 3, bh + 3, 3);
  ctx.fill();
  const gap = 2;
  const sw = (bw - gap * (segs - 1)) / segs;
  for (let i = 0; i < segs; i++) {
    const sx = bx + i * (sw + gap);
    const k = i < P.done ? 1 : i === P.done ? P.frac : 0;
    ctx.fillStyle = '#2a1d10';
    ctx.fillRect(sx, by, sw, bh);
    if (k > 0) {
      ctx.fillStyle = i < P.done ? '#c9973f' : '#ffcf4a';
      ctx.fillRect(sx, by, sw * k, bh);
      ctx.fillStyle = 'rgba(255,250,220,0.45)';
      ctx.fillRect(sx, by, sw * k, 2);
    }
    if (i === P.done && P.frac > 0 && P.frac < 1) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(H.t * 8);
      ctx.fillStyle = '#fff3c4';
      ctx.fillRect(sx + sw * k - 1.5, by, 1.5, bh);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  // boss skull cap
  const sk = H.cache.get('plaqueSkull', 18, 18, (c) => {
    c.beginPath();
    c.arc(9, 9, 8.5, 0, TAU);
    c.fillStyle = metalRadial(c, 9, 9, 8.5, 'crimson');
    c.fill();
    c.lineWidth = 1;
    c.strokeStyle = INK;
    c.stroke();
    skull(c, 9, 9.4, 5.2);
  }, 2);
  const pulse = P.bossNext ? 1 + 0.12 * Math.sin(H.t * 7) : 1;
  ctx.globalAlpha = P.bossNext || warn ? 1 : 0.65;
  LayerCache.draw(ctx, sk, w - 21 - 9 * (pulse - 1), by + bh / 2 - 9 * pulse, pulse);
  ctx.globalAlpha = 1;
}

/** Text + progress for the plaque. */
export function plaqueInfo(H, game, run, st) {
  const mode = run.mode;
  const stage = run.stage || {};
  const idx = run.stageIndex || 0;
  const name = (stage.name || '').toUpperCase();
  let top;
  if (mode === 'endless') top = `ENDLESS GALE · ${name}`;
  else if (mode === 'bossRush') top = `GAUNTLET ${idx + 1} / ${run.stageOrder?.length || 5}`;
  else if (mode === 'daily') top = `DAILY SQUALL · STAGE ${idx + 1}`;
  else top = `STAGE ${idx + 1} · ${name}`;
  const info = H._plaque;
  info.top = top;
  let segs = Math.max(1, run.waveCount || 0);
  let done = Math.max(0, (run.wave || 1) - 1);
  let frac = 0;
  if (mode === 'endless') {
    const ew = run.endlessWave || run.wave || 1;
    segs = 5;
    done = (ew - 1) % 5;
  }
  const prog = game.director?.progress;
  let main;
  switch (st) {
    case 'intro':
      main = 'PREPARE';
      done = mode === 'endless' ? done : 0;
      break;
    case 'wave':
      main = mode === 'endless' ? `WAVE ${run.endlessWave || run.wave}` : `WAVE ${run.wave} / ${run.waveCount}`;
      frac = prog ? clamp(prog.frac, 0, 1) : 0;
      break;
    case 'breather':
      main = 'WAVE CLEARED';
      frac = 1;
      break;
    case 'bossWarning':
      main = 'BOSS INBOUND';
      done = segs;
      break;
    case 'boss':
      main = H.bossLabel || 'BOSS';
      done = segs;
      break;
    case 'bossDown':
      main = 'BOSS DOWN';
      done = segs;
      break;
    case 'refit':
      main = 'REFIT';
      done = segs;
      break;
    case 'transition':
      main = 'UNDER WAY';
      done = 0;
      break;
    case 'victory':
      main = 'VICTORY';
      done = segs;
      break;
    default:
      main = run.wave ? `WAVE ${run.wave}` : 'ALOFT';
  }
  if (mode === 'bossRush') {
    segs = 1;
    done = st === 'boss' || st === 'bossWarning' ? 0 : st === 'bossDown' || st === 'refit' ? 1 : 0;
    frac = 0;
  }
  info.main = main;
  info.segs = segs;
  info.done = Math.min(done, segs);
  info.frac = frac;
  info.bossNext = st === 'wave' && (mode === 'endless' ? done === 4 : run.wave === run.waveCount && !!stage.boss);
  return info;
}

// ---- FPS ----------------------------------------------------------------------------------

export function drawFps(H, ctx, game, xRight, y) {
  H.at(ctx, xRight - 86 * H.s, y);
  const fps = Math.round(game.fps || 0);
  ctx.fillStyle = 'rgba(10,6,2,0.7)';
  roundRect(ctx, 0, 0, 86, 18, 5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(201,151,63,0.7)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = font(10, 'm');
  ctx.fillStyle = fps >= 55 ? '#9dff9a' : fps >= 40 ? '#ffd36b' : '#ff7a5a';
  ctx.fillText(H.str('fps', `${fps} FPS`), 7, 9.5);
  ctx.textAlign = 'right';
  ctx.font = font(7, 'm');
  ctx.fillStyle = 'rgba(242,212,138,0.75)';
  ctx.fillText(H.str('hudms', `hud ${H.perf.ms.toFixed(2)}`), 82, 9.5);
}

// ---- reticle --------------------------------------------------------------------------------

/** Brass gun-sight at the aim point (mouse cursor or stick aim). */
export function drawReticle(H, ctx, sx, sy, firing, pad) {
  H.at(ctx, sx, sy);
  const t = H.t;
  const k = firing ? 0.86 : 1;
  const L = H.cache.get(pad ? 'reticlePad' : 'reticle', 40, 40, (c) => {
    const cx = 20;
    const cy = 20;
    c.lineWidth = 3.4;
    c.strokeStyle = 'rgba(20,10,4,0.7)';
    c.beginPath();
    c.arc(cx, cy, 11, 0, TAU);
    c.stroke();
    c.lineWidth = 1.6;
    c.strokeStyle = pad ? '#7ff3ff' : '#ffd36b';
    c.beginPath();
    c.arc(cx, cy, 11, 0, TAU);
    c.stroke();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const x0 = cx + Math.cos(a) * 6;
      const y0 = cy + Math.sin(a) * 6;
      const x1 = cx + Math.cos(a) * 16;
      const y1 = cy + Math.sin(a) * 16;
      c.lineWidth = 3.4;
      c.strokeStyle = 'rgba(20,10,4,0.7)';
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.stroke();
      c.lineWidth = 1.6;
      c.strokeStyle = pad ? '#7ff3ff' : '#fff3c4';
      c.stroke();
    }
    c.fillStyle = '#ff5a3a';
    c.beginPath();
    c.arc(cx, cy, 1.6, 0, TAU);
    c.fill();
  }, 2);
  ctx.rotate(firing ? t * 3 : 0);
  ctx.globalAlpha = pad ? 0.65 : 0.95;
  LayerCache.draw(ctx, L, -20 * k, -20 * k, k);
  ctx.globalAlpha = 1;
}
