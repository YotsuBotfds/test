// Iron Matriarch — live drawing (WP14): overlays on the hull sprite and the split-hull wreck.
// Split out of ironMatriarch.js to keep files readable.

import { Sprites } from '../../gfx/sprites.js';
import { TAU, clamp, easeOutCubic } from '../../core/math.js';
import { hullHalfWidth, PORT_XS, STACKS, HATCH, CORE, FIRE_SPOTS } from './ironMatriarch-art.js';

/** Live overlays on the hull: damage decal, boiler, wrecks, hatch, additive lights. */
export function drawOverlays(ctx, b, w) {
  const d = b.data;
  const frac = b.hp / b.maxHp;
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.angle);
  ctx.scale(b.scale, b.scale);
  ctx.globalAlpha = b.alpha;
  // battle damage decal
  const dmg = clamp((0.92 - frac) * 1.4, 0, 1);
  if (dmg > 0) {
    const s = Sprites.get('boss_ironMatriarch_scorch');
    ctx.globalAlpha = dmg * b.alpha;
    ctx.drawImage(s.img, -s.cx, -s.cy, s.w, s.h);
    ctx.globalAlpha = b.alpha;
  }
  // exposed boiler
  if (d.coreOpen > 0) {
    const s = Sprites.get('boss_ironMatriarch_core');
    const k = easeOutCubic(d.coreOpen);
    ctx.globalAlpha = b.alpha * k;
    ctx.drawImage(s.img, CORE.x - s.cx * k, CORE.y - s.cy * k, s.w * k, s.h * k);
    ctx.globalAlpha = b.alpha;
    // smokestacks sit on top of the boiler
    for (const st of STACKS) drawStackCap(ctx, st);
  }
  // turret wrecks on empty barbettes
  for (const t of d.turrets) {
    if (t.alive) continue;
    const s = Sprites.get('boss_ironMatriarch_turretWreck');
    ctx.drawImage(s.img, t.data.lx - s.cx, t.data.ly - s.cy, s.w, s.h);
  }
  // hatch doors slide apart
  const door = Sprites.get('boss_ironMatriarch_hatchDoor');
  const o = d.hatchOpen * 13;
  ctx.drawImage(door.img, HATCH.x - 15 - o, HATCH.y - 13, 16, 26);
  ctx.drawImage(door.img, HATCH.x - 1 + o, HATCH.y - 13, 16, 26);

  // additive light: port charge, stack glow, core pulse, nacelles, fires
  const glowS = Sprites.get('boss_ironMatriarch_glow');
  ctx.globalCompositeOperation = 'lighter';
  const flick = 0.85 + 0.15 * Math.sin(d.t * 31);
  for (let k = 0; k < d.portCharge.length; k++) {
    const v = Math.max(d.portCharge[k], d.portFlash[k] * 1.3);
    if (v <= 0.01) continue;
    const s = k >= PORT_XS.length ? 1 : -1;
    const lx = PORT_XS[k % PORT_XS.length];
    const ly = s * (hullHalfWidth(lx) + 8);
    const r = 10 + 22 * v;
    ctx.globalAlpha = Math.min(1, v) * flick * b.alpha;
    ctx.drawImage(glowS.img, lx - r, ly - r, r * 2, r * 2);
  }
  if (d.ventGlow > 0) {
    for (const st of STACKS) {
      const r = 18 + 22 * d.ventGlow * flick;
      ctx.globalAlpha = d.ventGlow * 0.9 * b.alpha;
      ctx.drawImage(glowS.img, st.x - r, st.y - r, r * 2, r * 2);
    }
  }
  if (d.coreOpen > 0) {
    const r = (40 + 10 * Math.sin(d.t * 6)) * d.coreOpen;
    ctx.globalAlpha = 0.55 * b.alpha;
    ctx.drawImage(glowS.img, CORE.x - r * 1.4, CORE.y - r * 0.8, r * 2.8, r * 1.6);
  }
  const speed = Math.hypot(b.vx, b.vy);
  const eng = clamp(0.35 + speed / 400, 0, 1.2) * (b.state === 'ramWarn' ? 1.6 : 1);
  for (const s of [-1, 1]) {
    const r = 12 + 10 * eng;
    ctx.globalAlpha = Math.min(1, 0.5 * eng) * flick * b.alpha;
    ctx.drawImage(glowS.img, -207 - r, s * 44 - r * 0.6, r * 2, r * 1.2);
  }
  if (b.phase >= 2 || frac < 0.5) {
    const n = b.phase >= 2 ? FIRE_SPOTS.length : Math.ceil(((0.5 - frac) / 0.25) * 3);
    for (let i = 0; i < Math.min(n, FIRE_SPOTS.length); i++) {
      const f = FIRE_SPOTS[i];
      const r = 16 + 5 * Math.sin(d.t * 13 + i * 2.1);
      ctx.globalAlpha = 0.55 * b.alpha;
      ctx.drawImage(glowS.img, f.x - r, f.y - r, r * 2, r * 2);
    }
  }
  ctx.restore();
}

function drawStackCap(ctx, st) {
  // simple re-draw of the stack throat over the boiler overlay
  ctx.beginPath();
  ctx.arc(st.x, st.y, st.r * 1.05, 0, TAU);
  ctx.fillStyle = '#3a3d44';
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(20,12,6,0.8)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(st.x, st.y, st.r * 0.85, 0, TAU);
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = '#c0392b';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(st.x, st.y, st.r * 0.6, 0, TAU);
  ctx.fillStyle = '#1a0c06';
  ctx.fill();
}

/** Death wreck: the hull snaps in two around the boiler room and the halves drift apart. */
export function drawWreck(ctx, b, w) {
  const d = b.data;
  const k = clamp((w.time - (d.deathAt ?? w.time)) / 2.4, 0, 1);
  const split = clamp((k - 0.45) / 0.55, 0, 1);
  const gap = easeOutCubic(split) * 46;
  const rot = easeOutCubic(split) * 0.2;
  const img = Sprites.get('boss_ironMatriarch');
  for (const half of [-1, 1]) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);
    ctx.scale(b.scale, b.scale);
    ctx.translate(half * gap * 0.5, half * gap * 0.12);
    ctx.rotate(half * rot);
    ctx.beginPath();
    // jagged break line near x = -10
    const edge = half > 0 ? 230 : -230;
    ctx.moveTo(edge, -120);
    for (let i = 0; i <= 10; i++) {
      const y = -100 + i * 20;
      const x = -10 + ((i * 37) % 11) - 5;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(edge, 120);
    ctx.closePath();
    ctx.clip();
    ctx.globalAlpha = b.alpha;
    ctx.drawImage(img.img, -img.cx, -img.cy, img.w, img.h);
    const sc = Sprites.get('boss_ironMatriarch_scorch');
    ctx.drawImage(sc.img, -sc.cx, -sc.cy, sc.w, sc.h);
    Sprites.drawTint(ctx, 'boss_ironMatriarch', 0, 0, 0, 1, '#1c120a', 0.25 + 0.5 * k);
    if (split > 0) {
      ctx.globalCompositeOperation = 'lighter';
      const g = Sprites.get('boss_ironMatriarch_glow');
      ctx.globalAlpha = (1 - k * 0.6) * b.alpha;
      for (let i = 0; i < 4; i++) ctx.drawImage(g.img, -40, -90 + i * 45, 60, 60);
    }
    ctx.restore();
  }
}
