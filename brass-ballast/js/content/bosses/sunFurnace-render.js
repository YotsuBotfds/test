// The Sun Furnace (WP16) — per-frame rendering. All heavy art is baked (sunFurnace-art.js); this
// layers the baked sprites with rotation, cross-fades and additive light. Draw order:
//   heat bloom → gantry frame → crucible arms → molten core (+ white-hot layer, flash) →
//   shell plates | inner cage → pole hub → key-light shade → slit light rays → lamps & chimney
//   glows → corona lanes / nova charge overlays → flying shell debris.

import { Sprites } from '../../gfx/sprites.js';
import { GEO, GLOW } from './sunFurnace-art.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Draw a sprite with an extra tangential squash (narrowed plates while venting). */
function drawSquashed(ctx, name, frame, x, y, angle, scale, squash, alpha) {
  const s = Sprites.get(name, frame);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale * squash);
  ctx.globalAlpha = alpha;
  ctx.drawImage(s.img, -s.cx, -s.cy, s.w, s.h);
  ctx.restore();
}

function glow(ctx, x, y, size, color, alpha) {
  if (alpha <= 0.003) return;
  // Glow sprite is 64 units wide; size = diameter in world units.
  Sprites.draw(ctx, 'boss_sunFurnace_glow', x, y, 0, size / 64, Math.min(1, alpha), color);
}

/**
 * Main boss draw (also used while the boss is a wreck: the implosion is rendered here).
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawFurnace(ctx, b, w) {
  const d = b.data;
  const time = w.time;
  const s = b.scale;
  const x = b.x;
  const y = b.y;
  const dead = !b.alive;
  const deathT = dead ? time - (d.deathAt ?? time) : 0;
  const implode = dead ? clamp(deathT / 2.2, 0, 1) : 0;
  const dying = d.dying ? clamp(d.dying.t / d.dying.dur, 0, 1) : 0;
  const heat = clamp(d.heat + dying * 0.8, 0, 1);
  const nova = d.novaCharge || 0;
  const vented = d.vented > 0 ? clamp(d.vented / 0.6, 0, 1) : 0;
  const pulse = 0.5 + 0.5 * Math.sin(time * (3 + heat * 9));
  const flick = 0.85 + 0.15 * Math.sin(time * 37.1) * Math.sin(time * 23.7);
  const alpha = b.alpha;
  const calm = !!w.reducedFlash; // reduced-flashing setting: no strobing lights

  // 1. Heat bloom beneath everything.
  ctx.globalCompositeOperation = 'lighter';
  const bloom = (0.32 + 0.12 * pulse + heat * 0.25 + nova * 0.3 - vented * 0.2) * (1 - implode * 0.5);
  glow(ctx, x, y, 640 * s * (1 + 0.04 * pulse), GLOW.orange, bloom * alpha);
  if (heat > 0) glow(ctx, x, y, 520 * s, GLOW.hot, heat * 0.35 * alpha);
  ctx.globalCompositeOperation = 'source-over';

  // 2. Gantry frame (+ heat-blackening when dead).
  Sprites.draw(ctx, 'boss_sunFurnace_frame', x, y, 0, s, alpha);
  if (implode > 0) Sprites.drawTint(ctx, 'boss_sunFurnace_frame', x, y, 0, s, '#140c08', implode * 0.75 * alpha);
  if (b.flash > 0 && !dead) Sprites.drawFlash(ctx, 'boss_sunFurnace_frame', x, y, 0, s, b.flash * 0.18);

  // 3. Crucible arms.
  for (let i = 0; i < GEO.ARMS.length; i++) {
    const arm = d.arms?.[i];
    if (arm && arm.gone) continue;
    const a = GEO.ARMS[i] + (arm ? arm.swing : 0);
    const ax = x + Math.cos(GEO.ARMS[i]) * GEO.ARM_R * s;
    const ay = y + Math.sin(GEO.ARMS[i]) * GEO.ARM_R * s;
    Sprites.draw(ctx, 'boss_sunFurnace_arm', ax, ay, a, s, alpha);
    if (implode > 0) Sprites.drawTint(ctx, 'boss_sunFurnace_arm', ax, ay, a, s, '#140c08', implode * 0.75 * alpha);
    const ch = arm ? arm.charge : 0;
    const cx = ax + Math.cos(a) * GEO.ARM_REACH * s;
    const cy = ay + Math.sin(a) * GEO.ARM_REACH * s;
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, cx, cy, (46 + ch * 70 + pulse * 6) * s, ch > 0.5 ? GLOW.hot : GLOW.orange, (0.35 + ch * 0.6) * alpha * (1 - implode));
    ctx.globalCompositeOperation = 'source-over';
  }

  // 4. Molten core.
  const coreScale = s * (1 - implode * 0.94) * (1 - nova * 0.1 + nova * 0.03 * Math.sin(time * 40)) * (1 + 0.006 * pulse);
  const f = (time * 0.35) % 3;
  const f0 = Math.floor(f);
  const fk = f - f0;
  const crot = d.coreRot || 0;
  Sprites.draw(ctx, 'boss_sunFurnace_core', x, y, crot, coreScale, alpha, f0);
  if (fk > 0.02) Sprites.draw(ctx, 'boss_sunFurnace_core', x, y, crot, coreScale, fk * alpha, (f0 + 1) % 3);
  const hot = clamp(heat * (0.55 + 0.45 * pulse) + nova * 0.8 + implode, 0, 1);
  if (hot > 0.01) {
    const hf = (time * 0.6) % 2;
    Sprites.draw(ctx, 'boss_sunFurnace_coreHot', x, y, crot, coreScale, hot * alpha, hf < 1 ? 0 : 1);
  }
  if (vented > 0) Sprites.drawTint(ctx, 'boss_sunFurnace_core', x, y, crot, coreScale, '#3a2a24', vented * 0.55 * alpha, f0);
  if (b.flash > 0 && !dead) Sprites.drawFlash(ctx, 'boss_sunFurnace_core', x, y, crot, coreScale, b.flash * 0.3, f0);

  // Inner light.
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, x, y, (200 + 60 * pulse + nova * 200) * coreScale, GLOW.hot, (0.25 + 0.15 * pulse + heat * 0.35 + nova * 0.5) * alpha);
  ctx.globalCompositeOperation = 'source-over';

  // 5. Shell plates or the inner cage.
  const shellA = d.shellAngle || 0;
  if (d.plates && d.shellUp) {
    const squash = d.plateScale ?? 1;
    const ph = d.plateHeat || 0;
    for (let i = 0; i < d.plates.length; i++) {
      const pl = d.plates[i];
      if (!pl.alive) continue;
      const a = shellA + pl.off;
      drawSquashed(ctx, 'boss_sunFurnace_plate', 0, x, y, a, s, squash, alpha);
      if (ph > 0) drawSquashed(ctx, 'boss_sunFurnace_plate', 1, x, y, a, s, squash, ph * alpha);
      if (pl.flash > 0) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a);
        ctx.scale(1, squash);
        Sprites.drawFlash(ctx, 'boss_sunFurnace_plate', 0, 0, 0, s, Math.min(1, pl.flash) * 0.55);
        ctx.restore();
      }
    }
  } else if (d.plates) {
    const ca = d.cageAngle || 0;
    Sprites.draw(ctx, 'boss_sunFurnace_cage', x, y, ca, s * (1 - implode * 0.4), alpha * (1 - implode * 0.6));
    if (heat > 0.05) Sprites.drawTint(ctx, 'boss_sunFurnace_cage', x, y, ca, s, '#ff6a2a', heat * (0.45 + 0.3 * pulse) * alpha);
  }
  const hubA = d.shellUp ? shellA : d.cageAngle || 0;
  if (implode < 0.6) {
    Sprites.draw(ctx, 'boss_sunFurnace_hub', x, y, hubA, s, alpha * (1 - implode));
    if (heat > 0.05) Sprites.drawTint(ctx, 'boss_sunFurnace_hub', x, y, hubA, s, '#ff7a2f', heat * 0.5 * alpha);
  }

  // 6. Key-light shade (non-rotating): makes the turning shell read as one lit globe.
  Sprites.draw(ctx, 'boss_sunFurnace_shade', x, y, 0, s, (d.shellUp ? 1 : 0.45) * alpha * (1 - implode));

  // 7. Light escaping the slits (or a rotating corona once the shell is gone).
  ctx.globalCompositeOperation = 'lighter';
  if (d.shellUp && d.plates) {
    const vent = d.vent || 0;
    const ra = (0.3 + 0.25 * flick + vent * 0.45 + (d.plateHeat || 0) * 0.4) * alpha;
    for (let i = 0; i < d.plates.length; i++) {
      const ga = shellA + (i + 0.5) * GEO.STEP;
      Sprites.draw(ctx, 'boss_sunFurnace_ray', x, y, ga, s * (1 + vent * 0.25), ra * (0.8 + 0.2 * Math.sin(time * 5 + i * 1.7)));
    }
  } else if (!dead) {
    const n = 9;
    const ra = (0.16 + heat * 0.3 + nova * 0.4) * alpha * (1 - vented * 0.8);
    for (let i = 0; i < n; i++) {
      const ga = (d.cageAngle || 0) * -0.6 + (i / n) * TAU + Math.sin(time * 0.7 + i) * 0.1;
      Sprites.draw(ctx, 'boss_sunFurnace_ray', x, y, ga, s * (1.05 + 0.15 * Math.sin(time * 2 + i * 2.1) + nova * 0.6), ra);
    }
  }

  // 8. Warning lamps & chimney throats.
  if (!dead) {
    const alarm = d.alarm || 0;
    const rate = calm ? 1.2 : 2 + heat * 4 + alarm * 6;
    for (let i = 0; i < GEO.LAMPS.length; i++) {
      const a = GEO.LAMPS[i];
      const lx = x + Math.cos(a) * GEO.LAMP_R * s;
      const ly = y + Math.sin(a) * GEO.LAMP_R * s;
      const on = Math.sin(time * rate * Math.PI + (i % 2) * Math.PI) > 0 ? 1 : 0.15;
      glow(ctx, lx, ly, 26 * s * (1 + alarm * 0.6), i % 2 ? GLOW.red : GLOW.orange, on * (0.75 + alarm * 0.25) * alpha);
      glow(ctx, lx, ly, 8 * s, GLOW.white, on * 0.8 * alpha);
    }
    for (let i = 0; i < GEO.CHIMNEYS.length; i++) {
      const a = GEO.CHIMNEYS[i];
      const cx = x + Math.cos(a) * GEO.CHIMNEY_R * s;
      const cy = y + Math.sin(a) * GEO.CHIMNEY_R * s;
      const kick = d.chimneyKick ? d.chimneyKick[i] : 0;
      glow(ctx, cx, cy, (40 + kick * 90) * s, kick > 0.3 ? GLOW.hot : GLOW.orange, (0.5 + 0.2 * flick + kick * 0.5) * alpha);
    }
  } else if (implode < 1) {
    // Implosion: the core collapses toward a point of light.
    const k = implode;
    glow(ctx, x, y, (420 * (1 - k) + 60) * s, GLOW.hot, (0.4 + k * 0.6) * alpha);
    glow(ctx, x, y, 40 + k * 60, GLOW.white, k * alpha);
  }
  ctx.globalCompositeOperation = 'source-over';

  // 9. Overlays: safe lanes of the corona pattern, supernova charge ring, dying cracks.
  if (d.lanes && d.lanes.show > 0) drawLanes(ctx, b, d.lanes, time);
  if (nova > 0) drawNovaCharge(ctx, b, nova, time, calm);
  if (dying > 0) {
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y, 380 * s, GLOW.white, dying * (calm ? 0.3 : 0.25 + 0.25 * Math.sin(time * 60)));
    ctx.globalCompositeOperation = 'source-over';
  }

  // 10. Shell debris (plates & arms blown off).
  if (d.debris && d.debris.length) drawDebris(ctx, d.debris);
  ctx.globalAlpha = 1;
}

function drawLanes(ctx, b, L, time) {
  const n = L.count;
  const half = L.half;
  const r0 = GEO.R + 16;
  const r1 = 720;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const a = L.a + (i / n) * TAU;
    const g = ctx.createRadialGradient(b.x, b.y, r0, b.x, b.y, r1);
    const al = L.show * (0.16 + 0.06 * Math.sin(time * 6));
    g.addColorStop(0, `rgba(127,243,255,${al})`);
    g.addColorStop(0.6, `rgba(127,243,255,${al * 0.5})`);
    g.addColorStop(1, 'rgba(127,243,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(b.x + Math.cos(a - half) * r0, b.y + Math.sin(a - half) * r0);
    ctx.arc(b.x, b.y, r1, a - half, a + half);
    ctx.arc(b.x, b.y, r0, a + half, a - half, true);
    ctx.closePath();
    ctx.fill();
    // Edge lines with marching chevrons pointing outward.
    ctx.strokeStyle = `rgba(160,250,255,${L.show * 0.45})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const e of [-half, half]) {
      ctx.moveTo(b.x + Math.cos(a + e) * r0, b.y + Math.sin(a + e) * r0);
      ctx.lineTo(b.x + Math.cos(a + e) * 620, b.y + Math.sin(a + e) * 620);
    }
    ctx.stroke();
    ctx.strokeStyle = `rgba(200,255,255,${L.show * 0.5})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    const off = (time * 140) % 70;
    for (let r = r0 + 30 + off; r < 640; r += 70) {
      const w2 = half * 0.45;
      ctx.moveTo(b.x + Math.cos(a - w2) * (r - 12), b.y + Math.sin(a - w2) * (r - 12));
      ctx.lineTo(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r);
      ctx.lineTo(b.x + Math.cos(a + w2) * (r - 12), b.y + Math.sin(a + w2) * (r - 12));
    }
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawNovaCharge(ctx, b, k, time, calm) {
  const x = b.x;
  const y = b.y;
  ctx.globalCompositeOperation = 'lighter';
  // Converging rings.
  for (let i = 0; i < 3; i++) {
    const ph = (time * 0.9 + i / 3) % 1;
    const r = 620 * (1 - ph) + GEO.R;
    ctx.strokeStyle = `rgba(255,236,190,${0.35 * k * ph})`;
    ctx.lineWidth = 3 + 10 * ph;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
  }
  glow(ctx, x, y, 300 + 500 * k, GLOW.white, k * (calm ? 0.35 : 0.3 + 0.2 * Math.sin(time * 30)));
  ctx.globalCompositeOperation = 'source-over';
}

function drawDebris(ctx, list) {
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const k = p.t / p.life;
    const sc = p.scale * (1 - k * 0.5);
    const al = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
    if (p.sprite === 'boss_sunFurnace_plate') {
      // Plates fly about their own centroid (their sprite pivot is the sphere centre).
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.translate(-p.pivot * sc, 0);
      Sprites.draw(ctx, p.sprite, 0, 0, 0, sc, al, p.frame);
      Sprites.drawTint(ctx, p.sprite, 0, 0, 0, sc, '#1c120a', Math.min(0.8, k * 1.1) * al, p.frame);
      ctx.restore();
    } else {
      Sprites.draw(ctx, p.sprite, p.x, p.y, p.angle, sc, al, p.frame);
      Sprites.drawTint(ctx, p.sprite, p.x, p.y, p.angle, sc, '#1c120a', Math.min(0.8, k * 1.1) * al, p.frame);
    }
  }
}

/** Soft circular shadow (the furnace is too big for the hull-silhouette shadow). */
export function drawFurnaceShadow(ctx, b, w, ox, oy) {
  const s = b.scale;
  Sprites.draw(ctx, 'boss_sunFurnace_shadow', b.x + ox, b.y + oy, 0, (GEO.RING_OUT * 2.3 * s) / 64, 0.32 * b.alpha);
}

/**
 * Preview helper (tests/preview/wp16-finalboss.html?mode=states): render a fake boss in a named
 * visual state without a running game.
 */
export function previewState(ctx, state, x, y) {
  const plates = [];
  for (let i = 0; i < GEO.PLATES; i++) plates.push({ off: i * GEO.STEP, alive: true, flash: 0 });
  const d = {
    plates,
    shellUp: true,
    shellAngle: 0.3,
    cageAngle: 0.2,
    coreRot: 0,
    plateScale: 1,
    vent: 0,
    heat: 0,
    arms: GEO.ARMS.map(() => ({ swing: 0, charge: 0, gone: false })),
    chimneyKick: [0, 0, 0],
    alarm: 0,
    debris: [],
  };
  const b = { x, y, scale: 0.95, alpha: 1, alive: true, flash: 0, data: d };
  const w = { time: 1.3 };
  if (state === 'vent') {
    d.vent = 1;
    d.plateScale = 0.62;
  } else if (state === 'shatter') {
    d.plateHeat = 1;
    d.alarm = 1;
  } else if (state === 'exposed') {
    d.shellUp = false;
    d.arms[0].charge = 1;
  } else if (state === 'hot') {
    d.shellUp = false;
    d.heat = 1;
    d.lanes = { a: 0.4, count: 3, half: 0.22, show: 1 };
  } else if (state === 'nova') {
    d.shellUp = false;
    d.heat = 1;
    d.novaCharge = 0.8;
  } else if (state === 'dying') {
    d.shellUp = false;
    d.heat = 1;
    d.dying = { t: 1, dur: 1.6 };
  }
  drawFurnace(ctx, b, w);
}
