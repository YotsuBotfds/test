// HUD threat displays (WP22): boss health bars (phase markers, part pips, lag bar), off-screen
// pointers for bosses / elites / armory crates, and the brass radar scope with rotating sweep.

import { Sprites } from '../gfx/sprites.js';
import { metal, roundRect, rivet, INK, skull } from '../gfx/drawkit.js';
import {
  TAU,
  clamp,
  approach,
  font,
  spacing,
  engraved,
  fitFont,
  LayerCache,
  brassPanel,
  brassDisc,
  glassSheen,
  rivets,
  easeOutCubic,
} from './hud-kit.js';

export const RADAR_R = 55;
const RADAR_RANGE = 1700;
const DEFAULT_PHASES = [2 / 3, 1 / 3];

// ---- boss view state --------------------------------------------------------------------------

export function makeBossView(b) {
  const def = b.def || {};
  let marks = def.phases ?? def.phaseAt ?? def.hudPhases ?? DEFAULT_PHASES;
  if (!Array.isArray(marks)) marks = DEFAULT_PHASES;
  return {
    boss: b,
    shown: 0,
    lag: 1,
    hold: 0,
    prev: b.hp,
    hitT: 0,
    enterT: 0,
    deadT: 0,
    phaseFlashT: 0,
    marks: marks.filter((m) => m > 0.02 && m < 0.98).slice(0, 6),
    name: def.name || b.name || b.type || 'Boss',
    title: def.title || '',
  };
}

export function updateBossView(v, dt) {
  const b = v.boss;
  const k = b.maxHp > 0 ? clamp(b.hp / b.maxHp, 0, 1) : 0;
  v.enterT = Math.min(1, v.enterT + dt / 1.4);
  // Intro: bar charges up from empty, then tracks hp.
  const target = Math.min(k, easeOutCubic(v.enterT));
  if (v.enterT < 1) v.shown = target;
  else v.shown = target < v.shown ? target : approach(v.shown, target, 8, dt);
  if (b.hp < v.prev - 0.01) {
    v.hitT = 1;
    if (v.hold <= 0) v.hold = 0.5;
  }
  v.prev = b.hp;
  if (v.lag > v.shown) {
    v.hold -= dt;
    if (v.hold <= 0) v.lag = Math.max(v.shown, v.lag - dt * (0.25 + (v.lag - v.shown) * 2));
  } else {
    v.lag = v.shown;
  }
  v.hitT = Math.max(0, v.hitT - dt * 6);
  v.phaseFlashT = Math.max(0, v.phaseFlashT - dt * 1.5);
  if (!b.alive || b.dead) v.deadT += dt;
}

/** Record an actual phase change: flash and add a marker at the current hp if none is near. */
export function bossPhaseMark(v) {
  const b = v.boss;
  const k = b.maxHp > 0 ? clamp(b.hp / b.maxHp, 0, 1) : 0;
  v.phaseFlashT = 1;
  if (k > 0.02 && k < 0.98 && !v.marks.some((m) => Math.abs(m - k) < 0.06)) v.marks.push(k);
}

// ---- boss bar ---------------------------------------------------------------------------------

/**
 * @param {number} xCenter CSS px
 * @param {number} y top CSS px
 * @param {number} w bar width in UI units
 * @returns {number} height in UI units
 */
export function drawBossBar(H, ctx, v, xCenter, y, w, small) {
  const b = v.boss;
  const fade = v.deadT > 0 ? clamp(1 - (v.deadT - 0.8) / 0.6, 0, 1) : 1;
  if (fade <= 0) return 0;
  const slide = easeOutCubic(clamp(v.enterT * 2.2, 0, 1));
  const bh = small ? 16 : 22;
  const nameH = small ? 13 : 19;
  const totalH = nameH + bh + 14;
  H.at(ctx, xCenter - (w / 2) * H.s, y - (1 - slide) * 30 * H.s);
  ctx.globalAlpha = fade * slide;
  // name & title
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  const name = v.name.toUpperCase();
  spacing(ctx, small ? 1.5 : 3);
  const ns = fitFont(ctx, name, small ? 10 : 15, w * (v.title ? 0.62 : 0.95), 'd');
  const nw = ctx.measureText(name).width;
  let tw = 0;
  if (v.title && !small) {
    ctx.font = font(9.5, 'b', 'normal', 'italic');
    spacing(ctx, 0.5);
    tw = ctx.measureText(`— ${v.title}`).width + 8;
  }
  const x0 = w / 2 - (nw + tw) / 2;
  // dark backing so the name reads over bright skies and dark hulls alike
  ctx.fillStyle = 'rgba(16,8,4,0.55)';
  roundRect(ctx, x0 - 12, nameH - 4 - ns * 0.95, nw + tw + 24, ns * 1.25, ns * 0.6);
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.font = font(ns, 'd');
  spacing(ctx, small ? 1.5 : 3);
  const pf = v.phaseFlashT;
  engraved(ctx, name, x0, nameH - 4, pf > 0 ? '#ffffff' : '#ffd9c8', 'rgba(10,2,0,0.9)', 1.5);
  if (tw) {
    ctx.font = font(9.5, 'b', 'normal', 'italic');
    spacing(ctx, 0.5);
    engraved(ctx, `— ${v.title}`, x0 + nw + 8, nameH - 4, 'rgba(242,212,138,0.9)');
  }
  spacing(ctx, 0);

  // frame
  const by = nameH;
  const frame = H.cache.get(`bossFrame${Math.round(w)}_${bh}`, w, bh, (c) => {
    brassPanel(c, 0, 0, w, bh, { kind: 'iron', r: bh / 2.4, rim: 4, well: '#1a0605', rivets: false });
    const n = Math.max(3, Math.floor(w / 46));
    rivets(c, bh, 2, w - bh, 2, n, 0.95, 'brass');
    rivets(c, bh, bh - 2, w - bh, bh - 2, n, 0.95, 'brass');
    // crimson end caps
    for (const ex of [0, w - 10]) {
      roundRect(c, ex, 2, 10, bh - 4, 3);
      c.fillStyle = metal(c, ex, 2, ex + 10, bh, 'crimson');
      c.fill();
      c.lineWidth = 0.8;
      c.strokeStyle = INK;
      c.stroke();
    }
  }, 4);
  LayerCache.draw(ctx, frame, 0, by);
  const fx = 12;
  const fw = w - 24;
  const fy = by + 4;
  const fh = bh - 8;
  if (v.lag > v.shown) {
    ctx.fillStyle = v.hold > 0 ? '#ffffff' : '#ffe2cf';
    ctx.fillRect(fx + fw * v.shown, fy, fw * (v.lag - v.shown), fh);
  }
  const grad = bossGrad(ctx, fy, fh);
  if (v.shown > 0) {
    ctx.fillStyle = grad;
    ctx.fillRect(fx, fy, fw * v.shown, fh);
    const enraged = v.shown < 0.25 && b.alive;
    if (enraged || v.hitT > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade * (enraged ? 0.25 + 0.2 * Math.sin(H.t * 10) : 0) + v.hitT * 0.35;
      ctx.fillStyle = '#ff7a2f';
      ctx.fillRect(fx, fy, fw * v.shown, fh);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = fade;
    }
    // leading spark
    ctx.fillStyle = '#ffe9c4';
    ctx.fillRect(fx + fw * v.shown - 1.5, fy, 1.5, fh);
  }
  // sheen
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(fx, fy, fw, fh * 0.35);
  // phase markers
  for (const m of v.marks) {
    const mx = fx + fw * m;
    const passed = v.shown < m;
    ctx.fillStyle = passed ? 'rgba(40,20,10,0.9)' : '#1a0a05';
    ctx.fillRect(mx - 1, fy, 2, fh);
    ctx.beginPath();
    ctx.moveTo(mx, by - 3.5);
    ctx.lineTo(mx + 3.5, by + 0.5);
    ctx.lineTo(mx, by + 4.5);
    ctx.lineTo(mx - 3.5, by + 0.5);
    ctx.closePath();
    ctx.fillStyle = passed ? '#5b4630' : '#ffcf4a';
    ctx.fill();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
  if (pf > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = pf * fade;
    ctx.fillStyle = '#ffd36b';
    roundRect(ctx, 2, by + 2, w - 4, bh - 4, bh / 3);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = fade;
  }
  // skull medallion on the left end
  const med = H.cache.get(`bossMed${bh}`, bh + 10, bh + 10, (c) => {
    const r = (bh + 10) / 2;
    brassDisc(c, r, r, r - 0.5, 'crimson');
    c.beginPath();
    c.arc(r, r, r - 4, 0, TAU);
    c.fillStyle = '#1a0605';
    c.fill();
    skull(c, r, r + 0.5, r * 0.55);
  }, 2);
  const mr = (bh + 10) / 2;
  const mp = 1 + v.hitT * 0.12;
  LayerCache.draw(ctx, med, -mr * mp - 4, by + bh / 2 - mr * mp, mp);
  // percent readout on the right
  if (!small) {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = font(9, 'm');
    engraved(ctx, H.str(`bp${b.id}`, `${Math.ceil(v.shown * 100)}%`), w - 14, by + bh / 2 + 0.5, '#fff0e0');
  }
  // destructible part pips
  const parts = b.parts;
  if (parts && parts.length) {
    let n = 0;
    let px = 16;
    const py = by + bh + 6;
    for (let i = 0; i < parts.length && n < 14; i++) {
      const p = parts[i];
      const sd = p.def?.shareDamage;
      if (sd === true || !(p.maxHp > 1) || p.def?.hudHide) continue;
      n++;
      const alive = p.alive && !p.dead;
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, TAU);
      ctx.fillStyle = alive ? '#2a0d08' : '#120806';
      ctx.fill();
      if (alive) {
        const k = clamp(p.hp / p.maxHp, 0, 1);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.arc(px, py, 4, -Math.PI / 2, -Math.PI / 2 + TAU * k);
        ctx.closePath();
        ctx.fillStyle = '#ff7a4a';
        ctx.fill();
      } else {
        ctx.strokeStyle = '#7a5420';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(px - 2.5, py - 2.5);
        ctx.lineTo(px + 2.5, py + 2.5);
        ctx.moveTo(px + 2.5, py - 2.5);
        ctx.lineTo(px - 2.5, py + 2.5);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, TAU);
      ctx.lineWidth = 1;
      ctx.strokeStyle = alive ? '#c9973f' : '#4a3112';
      ctx.stroke();
      px += 11;
    }
  }
  if (v.deadT > 0) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(small ? 10 : 14, 'd');
    spacing(ctx, 4);
    engraved(ctx, 'DESTROYED', w / 2, by + bh / 2 + 0.5, '#ffcf4a');
    spacing(ctx, 0);
  }
  ctx.globalAlpha = 1;
  return totalH;
}

let bossG = null;
function bossGrad(ctx, fy, fh) {
  if (bossG && bossG.ctx === ctx && bossG.fy === fy && bossG.fh === fh) return bossG.g;
  const g = ctx.createLinearGradient(0, fy, 0, fy + fh);
  g.addColorStop(0, '#ff9a7a');
  g.addColorStop(0.3, '#e0352a');
  g.addColorStop(0.75, '#8c1a14');
  g.addColorStop(1, '#4a0a08');
  bossG = { ctx, fy, fh, g };
  return g;
}

// ---- off-screen pointers ----------------------------------------------------------------------

/**
 * Draw pointers for off-screen targets. `list` is filled by the HUD: {kind, x, y, dist, scale}.
 * rect = inset screen rectangle in CSS px.
 */
export function drawPointers(H, ctx, list, rect, r) {
  const cx = (rect.x0 + rect.x1) / 2;
  const cy = (rect.y0 + rect.y1) / 2;
  const pt = H._pt;
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    r.worldToScreen(it.x, it.y, pt);
    if (pt.x > rect.x0 && pt.x < rect.x1 && pt.y > rect.y0 && pt.y < rect.y1) continue;
    const dx = pt.x - cx;
    const dy = pt.y - cy;
    if (!dx && !dy) continue;
    const hw = (rect.x1 - rect.x0) / 2;
    const hh = (rect.y1 - rect.y0) / 2;
    const k = Math.min(Math.abs(hw / (dx || 1e-6)), Math.abs(hh / (dy || 1e-6)));
    const ex = cx + dx * k;
    const ey = cy + dy * k;
    const ang = Math.atan2(dy, dx);
    const boss = it.kind === 'boss';
    const pulse = 1 + 0.08 * Math.sin(H.t * (boss ? 8 : 5) + i);
    const sc = (boss ? 1.25 : it.kind === 'crate' ? 0.85 : 0.8) * pulse;
    H.at(ctx, ex, ey);
    ctx.scale(sc, sc);
    // arrow tip
    ctx.save();
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(25, 0);
    ctx.lineTo(13, -8.5);
    ctx.lineTo(13, 8.5);
    ctx.closePath();
    ctx.fillStyle = boss ? '#ff4d2e' : it.kind === 'elite' ? '#ffcf4a' : '#f2d48a';
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();
    const badge = pointerBadge(H, it.kind);
    LayerCache.draw(ctx, badge, -15, -15);
    if (boss) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = font(8.5, 'm');
      const ly = ey > cy ? -24 : 25;
      engraved(ctx, H.str(`pd${i}`, `${Math.round(it.dist / 10)}m`), 0, ly, '#ffd9c8');
    }
  }
}

function pointerBadge(H, kind) {
  return H.cache.get(`ptr_${kind}`, 30, 30, (c) => {
    const k = kind === 'boss' ? 'crimson' : kind === 'elite' ? 'gold' : 'brass';
    brassDisc(c, 15, 15, 13.5, k);
    c.beginPath();
    c.arc(15, 15, 10, 0, TAU);
    c.fillStyle = kind === 'boss' ? '#1a0605' : '#1a120a';
    c.fill();
    if (kind === 'boss') skull(c, 15, 15.5, 6.5);
    else if (kind === 'elite') {
      c.fillStyle = '#ffcf4a';
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? 3 : 7;
        c.lineTo(15 + Math.cos(a) * rr, 15 + Math.sin(a) * rr);
      }
      c.closePath();
      c.fill();
    } else if (Sprites.has('pk_crate')) {
      const s = Sprites.get('pk_crate');
      const q = 15 / Math.max(s.w, s.h);
      c.drawImage(s.img, 15 - (s.w * q) / 2, 15 - (s.h * q) / 2, s.w * q, s.h * q);
    } else {
      c.fillStyle = '#a0703e';
      c.fillRect(9, 9, 12, 12);
    }
    glassSheen(c, 15, 15, 10, 0.3);
  }, 2);
}

// ---- radar --------------------------------------------------------------------------------------

function radarFace(H) {
  const R = RADAR_R;
  return H.cache.get('radarFace', R * 2, R * 2, (c) => {
    brassDisc(c, R, R, R);
    // bezel graduation
    c.strokeStyle = 'rgba(40,24,8,0.6)';
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * TAU;
      const big = i % 6 === 0;
      c.lineWidth = big ? 1.1 : 0.6;
      c.beginPath();
      c.moveTo(R + Math.cos(a) * (R - 1), R + Math.sin(a) * (R - 1));
      c.lineTo(R + Math.cos(a) * (R - (big ? 4.5 : 3)), R + Math.sin(a) * (R - (big ? 4.5 : 3)));
      c.stroke();
    }
    const rr = R - 7;
    c.beginPath();
    c.arc(R, R, rr + 1.5, 0, TAU);
    c.fillStyle = '#1a1006';
    c.fill();
    const g = c.createRadialGradient(R, R, 2, R, R, rr);
    g.addColorStop(0, '#16352a');
    g.addColorStop(0.7, '#0c231b');
    g.addColorStop(1, '#04100b');
    c.beginPath();
    c.arc(R, R, rr, 0, TAU);
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = 'rgba(120,255,190,0.16)';
    c.lineWidth = 0.8;
    for (const f of [1 / 3, 2 / 3]) {
      c.beginPath();
      c.arc(R, R, rr * f, 0, TAU);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(R - rr, R);
    c.lineTo(R + rr, R);
    c.moveTo(R, R - rr);
    c.lineTo(R, R + rr);
    c.stroke();
    c.strokeStyle = 'rgba(120,255,190,0.08)';
    c.beginPath();
    c.moveTo(R - rr * 0.7, R - rr * 0.7);
    c.lineTo(R + rr * 0.7, R + rr * 0.7);
    c.moveTo(R + rr * 0.7, R - rr * 0.7);
    c.lineTo(R - rr * 0.7, R + rr * 0.7);
    c.stroke();
    // north tab
    c.fillStyle = '#c0392b';
    c.beginPath();
    c.moveTo(R, 1.5);
    c.lineTo(R + 4, 7);
    c.lineTo(R - 4, 7);
    c.closePath();
    c.fill();
    c.lineWidth = 0.7;
    c.strokeStyle = INK;
    c.stroke();
  }, 3);
}

function radarGlass(H) {
  const R = RADAR_R;
  return H.cache.get('radarGlass', R * 2, R * 2, (c) => {
    const rr = R - 7;
    // CRT vignette
    const g = c.createRadialGradient(R, R, rr * 0.6, R, R, rr);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.beginPath();
    c.arc(R, R, rr, 0, TAU);
    c.fillStyle = g;
    c.fill();
    glassSheen(c, R, R, rr, 0.28);
    c.beginPath();
    c.arc(R, R, rr, 0, TAU);
    c.lineWidth = 1.2;
    c.strokeStyle = 'rgba(10,6,2,0.9)';
    c.stroke();
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      rivet(c, R + Math.cos(a) * (R - 3.4), R + Math.sin(a) * (R - 3.4), 1.4);
    }
  });
}

function radarSweep(H) {
  const R = RADAR_R - 7;
  return H.cache.get('radarSweep', R * 2, R * 2, (c) => {
    // trailing wedge: brightest at angle 0, fading counter-clockwise
    const steps = 36;
    const span = Math.PI * 0.55;
    for (let i = 0; i < steps; i++) {
      const a1 = -(i / steps) * span;
      const a0 = -((i + 1) / steps) * span;
      c.beginPath();
      c.moveTo(R, R);
      c.arc(R, R, R, a0, a1 + 0.01);
      c.closePath();
      c.fillStyle = `rgba(90,255,170,${0.32 * (1 - i / steps) ** 1.6})`;
      c.fill();
    }
    c.strokeStyle = 'rgba(170,255,210,0.9)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(R, R);
    c.lineTo(R * 2, R);
    c.stroke();
  });
}

/**
 * Radar scope centred at (cx, cy) CSS px.
 * @param {*} world
 * @param {{x:number,y:number,angle:number}} focus the player at the centre
 */
export function drawRadar(H, ctx, world, renderer, focus, cx, cy) {
  const R = RADAR_R;
  const rr = R - 7;
  H.at(ctx, cx, cy);
  LayerCache.draw(ctx, radarFace(H), -R, -R);
  const sweepA = H.t * 2.3;
  const scale = rr / RADAR_RANGE;
  const fx = focus.x;
  const fy = focus.y;
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, rr, 0, TAU);
  ctx.clip();
  // camera view frame
  const vr = renderer.viewRect(0, H._vr);
  ctx.strokeStyle = 'rgba(150,255,200,0.22)';
  ctx.lineWidth = 0.8;
  ctx.strokeRect((vr.x0 - fx) * scale, (vr.y0 - fy) * scale, vr.w * scale, vr.h * scale);
  // sweep
  ctx.save();
  ctx.rotate(sweepA);
  ctx.globalCompositeOperation = 'lighter';
  LayerCache.draw(ctx, radarSweep(H), -rr, -rr);
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';

  // enemies
  const enemies = world.enemies;
  const lim2 = (RADAR_RANGE * 1.02) ** 2;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e.alive || e.parent || e.isBoss) continue;
    const dx = e.x - fx;
    const dy = e.y - fy;
    if (dx * dx + dy * dy > lim2) continue;
    let da = sweepA - Math.atan2(dy, dx);
    da -= Math.floor(da / TAU) * TAU;
    const glow = 1 - da / TAU;
    ctx.globalAlpha = 0.3 + 0.7 * glow * glow;
    const bx = dx * scale;
    const by = dy * scale;
    if (e.elite) {
      ctx.fillStyle = '#ffcf4a';
      ctx.fillRect(bx - 2.2, by - 2.2, 4.4, 4.4);
    } else {
      ctx.fillStyle = e.phased ? '#a05050' : '#ff4d2e';
      const sz = e.r > 30 ? 3.6 : 2.6;
      ctx.fillRect(bx - sz / 2, by - sz / 2, sz, sz);
    }
  }
  ctx.globalAlpha = 1;
  // crates
  const pk = world.pickups;
  ctx.fillStyle = '#f2d48a';
  for (let i = 0; i < pk.length; i++) {
    const p = pk[i];
    if (!p.alive || p.type !== 'crate') continue;
    const dx = (p.x - fx) * scale;
    const dy = (p.y - fy) * scale;
    if (dx * dx + dy * dy > rr * rr) continue;
    ctx.beginPath();
    ctx.moveTo(dx, dy - 3.2);
    ctx.lineTo(dx + 3.2, dy);
    ctx.lineTo(dx, dy + 3.2);
    ctx.lineTo(dx - 3.2, dy);
    ctx.closePath();
    ctx.fill();
  }
  // bosses (clamped to the rim when out of range)
  for (const b of world.bosses) {
    if (!b.alive) continue;
    let dx = (b.x - fx) * scale;
    let dy = (b.y - fy) * scale;
    const d = Math.hypot(dx, dy);
    const out = d > rr - 5;
    if (out) {
      dx *= (rr - 5) / d;
      dy *= (rr - 5) / d;
    }
    const pr = out ? 4 : clamp((b.r || 80) * scale, 5, 12);
    ctx.beginPath();
    ctx.arc(dx, dy, pr, 0, TAU);
    ctx.fillStyle = '#ff2a1a';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(dx, dy, pr + 2 + ((H.t * 10) % 6), 0, TAU);
    ctx.strokeStyle = `rgba(255,80,50,${0.8 - ((H.t * 10) % 6) / 8})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // players
  const players = world.players;
  for (let i = players.length - 1; i >= 0; i--) {
    const p = players[i];
    const dx = (p.x - fx) * scale;
    const dy = (p.y - fy) * scale;
    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate(p.angle || 0);
    ctx.beginPath();
    ctx.moveTo(5, 0);
    ctx.lineTo(-3.5, -3.5);
    ctx.lineTo(-1.5, 0);
    ctx.lineTo(-3.5, 3.5);
    ctx.closePath();
    ctx.fillStyle = p.alive ? (p.color || '#ffcf4a') : '#6b5a3a';
    ctx.fill();
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = '#000';
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  LayerCache.draw(ctx, radarGlass(H), -R, -R);
}
