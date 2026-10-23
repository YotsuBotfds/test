// The Sun Furnace (WP16) — attack patterns and bespoke hazards.
//
// Every attack is `{ start(b, a, w), update(b, a, dt, w) -> done, rest }` where `a` is a fresh
// state object. Patterns only ever use base numbers: world.fire / addHazard with `owner: b` apply
// the stage damage multiplier and the bullet-speed modifier. Bullet speeds stay in 160–320 u/s and
// every big hit is telegraphed for ≥ 0.8 s (DESIGN §2.11).

import { Sprites } from '../../gfx/sprites.js';
import { drawWarning } from '../../game/hazards.js';
import { GEO, GLOW } from './sunFurnace-art.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => a - Math.round(a / TAU) * TAU;

// ---- shared helpers ------------------------------------------------------------------------

/** World angle of the slit between plate i and plate i+1. */
export function gapAngle(d, i) {
  return d.shellAngle + (i + 0.5) * GEO.STEP;
}

/** Index of the slit facing angle `a` most closely. */
export function nearestGap(d, a) {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < GEO.PLATES; i++) {
    const dd = Math.abs(wrap(a - gapAngle(d, i)));
    if (dd < bd) {
      bd = dd;
      best = i;
    }
  }
  return best;
}

function bearing(b, p) {
  return Math.atan2(p.y - b.y, p.x - b.x);
}

function target(w, b) {
  return w.nearestPlayer(b.x, b.y) || w.players[0] || null;
}

/** Throttled positional sfx. */
export function sfx(b, w, name, gap = 0.08, opts) {
  const T = (b.data.sfxT ||= {});
  if ((T[name] ?? -1) > w.time) return;
  T[name] = w.time + gap;
  w.sfx(name, b.x, b.y, opts);
}

/** Enemy slag shot from (x, y). */
function slag(w, b, x, y, angle, speed, o = {}) {
  return w.fire({
    team: 'enemy',
    owner: b,
    source: 'enemy',
    sprite: o.sprite || 'boss_sunFurnace_shot',
    frame: o.kind === 'orb' ? 1 : 0,
    glow: o.glow ?? (o.kind === 'orb' ? '#ff3d8b' : '#ff6a1f'),
    x,
    y,
    angle,
    speed,
    r: o.r ?? 7,
    damage: o.damage ?? 9,
    life: o.life ?? 5,
    scale: o.scale ?? 1,
    spin: o.spin ?? 5,
    trail: o.trail,
    homing: o.homing,
    homingDelay: o.homingDelay,
    homingRange: o.homingRange,
    accel: o.accel,
    maxSpeed: o.maxSpeed,
    element: 'fire',
  });
}

function rimShot(w, b, angle, speed, o, rimR = GEO.R + 4) {
  const x = b.x + Math.cos(angle) * rimR * b.scale;
  const y = b.y + Math.sin(angle) * rimR * b.scale;
  return slag(w, b, x, y, angle, speed, o);
}

function muzzle(w, x, y, angle, size = 0.8) {
  w.fx.muzzle?.(x, y, angle, size, '#ffb04a');
}

/** Track a hazard so phase changes / death can retire it. */
export function track(b, h) {
  if (h) b.data.hz.push(h);
  return h;
}

/** Kill every tracked hazard (phase transitions, supernova, death). */
export function clearHazards(b) {
  for (const h of b.data.hz) h.alive = false;
  b.data.hz.length = 0;
}

function chimneyPos(b, i) {
  const a = GEO.CHIMNEYS[i];
  return { x: b.x + Math.cos(a) * GEO.CHIMNEY_R * b.scale, y: b.y + Math.sin(a) * GEO.CHIMNEY_R * b.scale };
}

/** Crucible centre of arm i (follows the arm's swing). */
export function cruciblePos(b, i) {
  const a0 = GEO.ARMS[i];
  const arm = b.data.arms[i];
  const ax = b.x + Math.cos(a0) * GEO.ARM_R * b.scale;
  const ay = b.y + Math.sin(a0) * GEO.ARM_R * b.scale;
  const a = a0 + arm.swing;
  return { x: ax + Math.cos(a) * GEO.ARM_REACH * b.scale, y: ay + Math.sin(a) * GEO.ARM_REACH * b.scale };
}

function rate(b, s) {
  return s / Math.max(0.2, b.fireRateMult || 1);
}

// ---- hazards -------------------------------------------------------------------------------

/**
 * A rotating flame jet anchored to the furnace. `angleFn()` gives its current world angle.
 * Telegraphed with the stock line warning for `delay` s, then roars for `life` s.
 */
export function flameJet(b, w, angleFn, o = {}) {
  const len = o.len ?? 560;
  const h = w.addHazard({
    shape: 'line',
    x: b.x,
    y: b.y,
    x2: b.x + len,
    y2: b.y,
    width: o.width ?? 36,
    delay: o.delay ?? 1,
    life: o.life ?? 2.4,
    damage: o.damage ?? 12,
    tick: 0.3,
    owner: b,
    color: '#ff6a2a',
    element: 'fire',
    source: 'flameJet',
    data: { len, r0: o.r0 ?? GEO.R - 4, seed: Math.random() * 10, fxT: 0 },
    update: jetUpdate,
    draw: jetDraw,
  });
  h.data.boss = b;
  h.data.angleFn = angleFn;
  jetUpdate(h, 0, w);
  return track(b, h);
}

function jetUpdate(h, dt, w) {
  const D = h.data;
  const b = D.boss;
  if (!b.alive || b.data.dying) {
    h.alive = false;
    return;
  }
  const a = D.angleFn();
  const active = h.t >= h.delay;
  const end = h.delay + h.life;
  let len = D.len;
  if (active) {
    len *= clamp((h.t - h.delay) / 0.22, 0, 1) * clamp((end - h.t) / 0.3, 0, 1);
    len = Math.max(len, 8);
  }
  const c = Math.cos(a);
  const s = Math.sin(a);
  const r0 = D.r0 * b.scale;
  h.x = b.x + c * r0;
  h.y = b.y + s * r0;
  h.x2 = b.x + c * (r0 + len);
  h.y2 = b.y + s * (r0 + len);
  D.a = a;
  D.curLen = len;
  if (active && dt > 0) {
    D.fxT -= dt;
    if (D.fxT <= 0) {
      D.fxT = 0.03;
      const P = w.particles;
      for (let i = 0; i < 2; i++) {
        const k = Math.random();
        const sp = 260 + Math.random() * 260;
        const sz = 14 + 26 * k;
        P.spawn({
          x: h.x + c * len * k * 0.9,
          y: h.y + s * len * k * 0.9,
          vx: c * sp + (Math.random() - 0.5) * 60,
          vy: s * sp + (Math.random() - 0.5) * 60,
          life: 0.25 + Math.random() * 0.2,
          size: sz,
          size1: sz * 1.8,
          color: '#ffd27a',
          color1: '#b82a0c',
          alpha: 0.85,
          blend: 'add',
          tex: 'smoke',
        });
      }
      if (Math.random() < 0.25) w.fx.smoke?.(h.x2, h.y2, 1.1, { dark: true, count: 1 });
    }
  }
}

function jetDraw(ctx, h, w) {
  if (h.t < h.delay) {
    drawWarning(ctx, h, w);
    return;
  }
  const D = h.data;
  const len = D.curLen;
  const fl = 0.85 + 0.15 * Math.sin(w.time * 47 + D.seed) * Math.sin(w.time * 29 + D.seed * 2);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  const g = ctx.createLinearGradient(h.x, h.y, h.x2, h.y2);
  g.addColorStop(0, 'rgba(255,248,220,1)');
  g.addColorStop(0.18, 'rgba(255,206,110,0.95)');
  g.addColorStop(0.6, 'rgba(255,106,36,0.8)');
  g.addColorStop(1, 'rgba(200,40,12,0)');
  ctx.strokeStyle = g;
  ctx.beginPath();
  ctx.moveTo(h.x, h.y);
  ctx.lineTo(h.x2, h.y2);
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = h.width * 2.1 * fl;
  ctx.stroke();
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = h.width * 1.1 * fl;
  ctx.stroke();
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = h.width * 0.4;
  ctx.stroke();
  // Licks of flame along the jet.
  const n = Math.max(3, Math.floor(len / 60));
  const c = Math.cos(D.a);
  const s = Math.sin(D.a);
  for (let i = 0; i < n; i++) {
    const k = (i + ((w.time * 3 + D.seed) % 1)) / n;
    const wob = Math.sin(w.time * 20 + i * 2.3 + D.seed) * h.width * 0.35;
    const px = h.x + c * len * k - s * wob;
    const py = h.y + s * len * k + c * wob;
    Sprites.draw(ctx, 'boss_sunFurnace_glow', px, py, 0, (h.width * (2.2 - k)) / 64 * 2, 0.55 * (1 - k * 0.7), k < 0.4 ? GLOW.hot : GLOW.orange);
  }
  ctx.globalAlpha = 1;
}

/** Molten geyser: warning circle (≥ 1 s) → erupting pool that burns + spits a slag ring. */
export function geyser(b, w, x, y, o = {}) {
  const r = o.r ?? 70;
  const tele = w.telegraphCircle(x, y, r, o.delay ?? 1.1, {
    color: '#ff8a2a',
    onDone: (wd) => {
      if (!b.alive || b.data.dying) return;
      track(b, wd.addHazard({
        x,
        y,
        r,
        shape: 'circle',
        life: o.life ?? 1.6,
        damage: o.damage ?? 11,
        tick: 0.35,
        owner: b,
        color: '#ff6a2a',
        element: 'fire',
        source: 'geyser',
        data: { seed: Math.random() * 10 },
        draw: geyserDraw,
      }));
      const n = o.ring ?? 8;
      const off = Math.random() * TAU;
      for (let i = 0; i < n; i++) slag(wd, b, x, y, off + (i / n) * TAU, 165, { damage: 8, life: 3.6 });
      wd.fx.explosion?.(x, y, 1.1, { debris: false, cogs: 0 });
      wd.fx.embers?.(x, y, 14, { speed: 260 });
      wd.sfx('explode_medium', x, y, { vol: 0.8 });
      wd.shake(0.12);
    },
  });
  return track(b, tele);
}

function geyserDraw(ctx, h, w) {
  const k = clamp(h.t / 0.25, 0, 1) * clamp((h.life - h.t) / 0.35, 0, 1);
  const fl = 0.8 + 0.2 * Math.sin(w.time * 31 + h.data.seed);
  // Molten pool.
  ctx.globalAlpha = 0.9 * k;
  const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.r);
  g.addColorStop(0, '#fff4c0');
  g.addColorStop(0.35, '#ffb040');
  g.addColorStop(0.75, '#d8400f');
  g.addColorStop(1, 'rgba(90,16,6,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.r, 0, TAU);
  ctx.fill();
  // Spout column glow + bubbling blobs.
  ctx.globalCompositeOperation = 'lighter';
  Sprites.draw(ctx, 'boss_sunFurnace_glow', h.x, h.y, 0, (h.r * 3.2 * fl) / 64, 0.8 * k, GLOW.hot);
  for (let i = 0; i < 5; i++) {
    const a = h.data.seed + i * 1.26 + w.time * (1.5 + i * 0.3);
    const rr = h.r * (0.25 + 0.45 * ((Math.sin(w.time * 3 + i) + 1) / 2));
    Sprites.draw(ctx, 'boss_sunFurnace_glow', h.x + Math.cos(a) * rr, h.y + Math.sin(a) * rr, 0, 0.55, 0.7 * k, GLOW.orange);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// ---- attack patterns -------------------------------------------------------------------------

export const ATTACKS = {
  /** P1: radial slag from the rotating slits — the shell's spin twists it into a spiral. */
  spiral: {
    rest: 1.1,
    start(b, a) {
      a.dur = 3.6;
      a.tick = 0.3;
      a.n = 0;
      b.data.alarm = 0.3;
    },
    update(b, a, dt, w) {
      a.tick -= dt;
      if (a.tick <= 0) {
        a.tick += rate(b, 0.17);
        const d = b.data;
        for (let i = 0; i < GEO.PLATES; i++) {
          if ((i + a.n) % 2) continue;
          const ga = gapAngle(d, i);
          const p = rimShot(w, b, ga, 182, { damage: 9 });
          if (i === a.n % GEO.PLATES) muzzle(w, p.x, p.y, ga, 0.7);
        }
        a.n++;
        sfx(b, w, 'enemy_cannon', 0.22, { vol: 0.55, pitch: 0.8 });
      }
      return a.t >= a.dur;
    },
  },

  /** P1: the plates part — every slit pours slag, and the core takes bonus damage. */
  vent: {
    rest: 1.2,
    start(b, a, w) {
      const d = b.data;
      a.dur = 4.4;
      a.tick = 0.7;
      d.ventTarget = 1;
      d.alarm = 0.6;
      w.floatText(b.x, b.y - GEO.R - 50, 'VENTING — CORE EXPOSED!', { color: '#ffe08a', size: 20, life: 1.8, callout: true });
      w.sfx('steam_vent', b.x, b.y, { vol: 1, pitch: 0.6 });
      for (let i = 0; i < GEO.PLATES; i++) {
        const ga = gapAngle(d, i);
        w.fx.steam?.(b.x + Math.cos(ga) * GEO.R, b.y + Math.sin(ga) * GEO.R, ga, 1.8, { count: 4 });
      }
    },
    update(b, a, dt, w) {
      const d = b.data;
      if (a.t > a.dur - 0.7) d.ventTarget = 0;
      a.tick -= dt;
      if (a.tick <= 0 && a.t < a.dur - 0.8) {
        a.tick += rate(b, 0.22);
        const wob = Math.sin(a.t * 3) * 0.12;
        for (let i = 0; i < GEO.PLATES; i++) rimShot(w, b, gapAngle(d, i) + wob, 168, { damage: 9 });
        sfx(b, w, 'enemy_shot', 0.18, { vol: 0.5 });
        if (Math.random() < 0.5) {
          const ga = gapAngle(d, (Math.random() * GEO.PLATES) | 0);
          w.fx.steam?.(b.x + Math.cos(ga) * GEO.R, b.y + Math.sin(ga) * GEO.R, ga, 1.2, { count: 2 });
        }
      }
      return a.t >= a.dur;
    },
    end(b) {
      b.data.ventTarget = 0;
    },
  },

  /** P1: two flame jets roar out of opposite slits and sweep with the shell. */
  jets: {
    rest: 1.0,
    start(b, a, w) {
      const d = b.data;
      const p = target(w, b);
      const g0 = (nearestGap(d, p ? bearing(b, p) : 0) + 2) % GEO.PLATES;
      const g1 = (g0 + 3 + (Math.random() < 0.5 ? 1 : 0)) % GEO.PLATES;
      for (const gi of [g0, g1]) flameJet(b, w, () => gapAngle(d, gi), { delay: 1.0, life: 2.6, len: 560 });
      a.dur = 3.9;
      a.tick = 1.2;
      a.skip = [g0, g1];
      d.alarm = 1;
      w.sfx('steam_vent', b.x, b.y, { vol: 0.9, pitch: 0.5 });
      sfx(b, w, 'burn', 0.5, { vol: 1 });
    },
    update(b, a, dt, w) {
      a.tick -= dt;
      if (a.tick <= 0 && a.t < a.dur - 0.5) {
        a.tick += rate(b, 0.5);
        const d = b.data;
        for (let i = 0; i < GEO.PLATES; i++) if (!a.skip.includes(i)) rimShot(w, b, gapAngle(d, i), 170, { damage: 8 });
      }
      if (a.t > 1 && a.t < 3.6) sfx(b, w, 'burn', 0.45, { vol: 0.7 });
      return a.t >= a.dur;
    },
  },

  /** P1: aimed slag fans out of the slit facing the player (with a 0.5 s glow wind-up). */
  fan: {
    rest: 1.0,
    start(b, a, w) {
      a.dur = 2.0;
      a.vol = 0;
      a.next = 0.55;
      const p = target(w, b);
      a.gap = nearestGap(b.data, p ? bearing(b, p) : 0);
      sfx(b, w, 'steam_vent', 0.3, { vol: 0.5, pitch: 1.4 });
    },
    update(b, a, dt, w) {
      const d = b.data;
      const ga = gapAngle(d, a.gap);
      const mx = b.x + Math.cos(ga) * (GEO.R + 6);
      const my = b.y + Math.sin(ga) * (GEO.R + 6);
      if (a.t < a.next && a.vol === 0) w.fx.sparks?.(mx, my, ga, 1, '#ffd27a', 0.6);
      if (a.t >= a.next && a.vol < 3) {
        a.vol++;
        a.next += rate(b, 0.38);
        const p = target(w, b);
        const aim = p ? Math.atan2(p.y - my, p.x - mx) : ga;
        const n = 7;
        for (let i = 0; i < n; i++) slag(w, b, mx, my, aim - 0.36 + (0.72 * i) / (n - 1), 228, { damage: 9, kind: i % 2 ? 'slag' : 'orb', r: 6 });
        muzzle(w, mx, my, aim, 1.1);
        sfx(b, w, 'enemy_cannon', 0.1, { vol: 0.8 });
      }
      return a.t >= a.dur;
    },
  },

  /** P2: counter-rotating double helix straight out of the exposed core. */
  helix: {
    rest: 1.0,
    start(b, a) {
      a.dur = 3.8;
      a.tick = 0.25;
      a.aA = Math.random() * TAU;
      a.aB = a.aA + 0.4;
    },
    update(b, a, dt, w) {
      a.aA += 0.95 * dt;
      a.aB -= 0.72 * dt;
      a.tick -= dt;
      if (a.tick <= 0) {
        a.tick += rate(b, 0.17);
        for (let i = 0; i < 4; i++) {
          rimShot(w, b, a.aA + (i / 4) * TAU, 178, { damage: 9 }, GEO.R - 6);
          rimShot(w, b, a.aB + (i / 4) * TAU + 0.39, 204, { damage: 8, kind: 'orb', r: 6 }, GEO.R - 6);
        }
        sfx(b, w, 'enemy_shot', 0.2, { vol: 0.5, pitch: 0.85 });
      }
      return a.t >= a.dur;
    },
  },

  /** P2/P3: the chimneys lob burning slag in high arcs; landing markers telegraph each. */
  embers: {
    rest: 0.6,
    start(b, a, w) {
      a.dur = 1.6;
      a.shots = [];
      const p = target(w, b);
      for (let c = 0; c < GEO.CHIMNEYS.length; c++) {
        for (let k = 0; k < 4; k++) a.shots.push({ c, at: k * 0.28 + c * 0.09, first: k === 0 });
      }
      a.px = p ? p.x : b.x;
      a.py = p ? p.y : b.y + 300;
      w.floatText(b.x, b.y - GEO.R - 60, 'EMBER RAIN!', { color: '#ffb04a', size: 18, life: 1.3, callout: true });
    },
    update(b, a, dt, w) {
      const d = b.data;
      for (const s of a.shots) {
        if (s.done || a.t < s.at) continue;
        s.done = true;
        const p = target(w, b);
        let tx;
        let ty;
        if (p && s.first) {
          tx = p.x + p.vx * 0.9;
          ty = p.y + p.vy * 0.9;
        } else {
          const cx = p ? p.x : a.px;
          const cy = p ? p.y : a.py;
          const ang = Math.random() * TAU;
          const r = 90 + Math.random() * 260;
          tx = cx + Math.cos(ang) * r;
          ty = cy + Math.sin(ang) * r;
        }
        const c = chimneyPos(b, s.c);
        w.fire({
          team: 'enemy',
          owner: b,
          source: 'enemy',
          kind: 'slag',
          x: c.x,
          y: c.y,
          r: 10,
          scale: 1.7,
          spin: 6,
          damage: 14,
          trail: 'fire',
          lob: { tx, ty, time: 1.35, height: 280 },
          explode: { radius: 58, damage: 14, visual: 'medium', burn: null },
        });
        d.chimneyKick[s.c] = 1;
        w.fx.smoke?.(c.x, c.y, 1.4, { dark: true, count: 3 });
        w.fx.embers?.(c.x, c.y, 6, { speed: 180 });
        sfx(b, w, 'mortar_whistle', 0.12, { vol: 0.6 });
      }
      return a.t >= a.dur;
    },
  },

  /** P2/P3: molten geysers erupt under and around the player. */
  geysers: {
    rest: 0.9,
    start(b, a) {
      a.dur = 1.9;
      a.k = 0;
      a.next = 0;
    },
    update(b, a, dt, w) {
      if (a.k < 4 && a.t >= a.next) {
        const p = target(w, b);
        let x;
        let y;
        if (p && a.k === 0) {
          x = p.x + p.vx * 0.5;
          y = p.y + p.vy * 0.5;
        } else {
          const cx = p ? p.x : b.x;
          const cy = p ? p.y : b.y + 300;
          const ang = Math.random() * TAU;
          const r = 150 + Math.random() * 200;
          x = cx + Math.cos(ang) * r;
          y = cy + Math.sin(ang) * r;
        }
        // Never erupt inside the furnace itself.
        const dx = x - b.x;
        const dy = y - b.y;
        const dd = Math.hypot(dx, dy) || 1;
        if (dd < GEO.RING_OUT + 70) {
          x = b.x + (dx / dd) * (GEO.RING_OUT + 70);
          y = b.y + (dy / dd) * (GEO.RING_OUT + 70);
        }
        geyser(b, w, x, y, { delay: 1.1 });
        a.k++;
        a.next += 0.3;
        sfx(b, w, 'burn', 0.2, { vol: 0.6, pitch: 0.7 });
      }
      return a.t >= a.dur;
    },
  },

  /** P2: four flame jets in a cross, turning with the cage, plus slow slag rings. */
  jets4: {
    rest: 1.0,
    start(b, a, w) {
      const d = b.data;
      d.cageSpinTarget = (Math.random() < 0.5 ? -1 : 1) * 0.42;
      for (let k = 0; k < 4; k++) {
        flameJet(b, w, () => d.cageAngle + (k * Math.PI) / 2 + Math.PI / 4, { delay: 1.1, life: 3.3, len: 600, width: 38 });
      }
      a.dur = 4.7;
      a.tick = 1.4;
      d.alarm = 1;
      w.sfx('steam_vent', b.x, b.y, { vol: 1, pitch: 0.45 });
    },
    update(b, a, dt, w) {
      a.tick -= dt;
      if (a.tick <= 0 && a.t < a.dur - 0.6) {
        a.tick += rate(b, 1.15);
        const off = Math.random() * TAU;
        for (let i = 0; i < 12; i++) rimShot(w, b, off + (i / 12) * TAU, 160, { damage: 8, kind: 'orb', r: 6 }, GEO.R - 6);
        sfx(b, w, 'enemy_cannon', 0.2, { vol: 0.6 });
      }
      if (a.t > 1.1 && a.t < 4.4) sfx(b, w, 'burn', 0.45, { vol: 0.7 });
      return a.t >= a.dur;
    },
    end(b) {
      b.data.cageSpinTarget = 0.12;
    },
  },

  /** P2/P3: the crucible arms rear back, glow white and hurl homing slag globs. */
  globs: {
    rest: 0.8,
    start(b, a, w) {
      a.dur = 2.2;
      a.thrown = 0;
      for (const arm of b.data.arms) arm.chargeTarget = 1;
      sfx(b, w, 'steam_vent', 0.3, { vol: 0.6, pitch: 0.9 });
    },
    update(b, a, dt, w) {
      const d = b.data;
      const p = target(w, b);
      for (let i = 0; i < d.arms.length; i++) {
        const arm = d.arms[i];
        if (arm.gone) continue;
        // Rear back while charging, snap forward on release.
        arm.swingTarget = a.t < 0.95 ? -0.35 * (i % 2 ? 1 : -1) : 0.25 * (i % 2 ? 1 : -1);
      }
      const throws = [0.95, 1.3];
      while (a.thrown < throws.length && a.t >= throws[a.thrown]) {
        a.thrown++;
        for (let i = 0; i < d.arms.length; i++) {
          if (d.arms[i].gone) continue;
          const c = cruciblePos(b, i);
          const aim = p ? Math.atan2(p.y - c.y, p.x - c.x) : GEO.ARMS[i];
          slag(w, b, c.x, c.y, aim + (Math.random() - 0.5) * 0.5, 172, {
            sprite: 'eb_slag',
            r: 11,
            scale: 1.9,
            damage: 13,
            life: 6,
            homing: 1.05,
            homingDelay: 0.3,
            homingRange: 900,
            trail: 'fire',
            spin: 3,
          });
          w.fx.flare?.(c.x, c.y, 70, '#ffd27a', 0.18);
          w.fx.embers?.(c.x, c.y, 5, { speed: 160 });
        }
        sfx(b, w, 'enemy_flak', 0.1, { vol: 0.8, pitch: 0.7 });
      }
      if (a.t > 1.4) for (const arm of d.arms) arm.chargeTarget = 0;
      return a.t >= a.dur;
    },
    end(b) {
      for (const arm of b.data.arms) {
        arm.chargeTarget = 0;
        arm.swingTarget = 0;
      }
    },
  },

  /** P3: bullet hell — ring after ring of slag with three marked safe lanes that rotate. */
  corona: {
    rest: 1.0,
    start(b, a, w) {
      const d = b.data;
      const p = target(w, b);
      a.dur = 6.2;
      a.pre = 1.1;
      a.tick = 0;
      a.n = 0;
      // One lane starts on the player so the pattern is always enterable.
      d.lanes = { a: p ? bearing(b, p) : 0, count: 3, half: 0.23, show: 0, dir: Math.random() < 0.5 ? -1 : 1 };
      w.floatText(b.x, b.y - GEO.R - 60, 'FOLLOW THE COOL LANES!', { color: '#9ff3ff', size: 18, life: 1.6, callout: true });
      sfx(b, w, 'boss_phase', 0.5, { vol: 0.5, pitch: 1.4 });
    },
    update(b, a, dt, w) {
      const L = b.data.lanes;
      L.show = Math.min(1, L.show + dt * 3) * clamp((a.dur - a.t) / 0.4, 0, 1);
      if (a.t < a.pre) return false;
      L.a += 0.27 * L.dir * dt;
      a.tick -= dt;
      if (a.tick <= 0 && a.t < a.dur - 0.5) {
        a.tick += rate(b, 0.21);
        const n = 30;
        const off = (a.n % 2) * (TAU / n / 2);
        for (let i = 0; i < n; i++) {
          const ang = off + (i / n) * TAU;
          let safe = false;
          for (let k = 0; k < L.count; k++) if (Math.abs(wrap(ang - (L.a + (k / L.count) * TAU))) < L.half) safe = true;
          if (safe) continue;
          rimShot(w, b, ang, 172, { damage: 8, kind: i % 2 ? 'slag' : 'orb', r: 6, life: 4.4 }, GEO.R - 6);
        }
        a.n++;
        sfx(b, w, 'enemy_shot', 0.2, { vol: 0.5, pitch: 0.7 });
      }
      return a.t >= a.dur;
    },
    end(b) {
      b.data.lanes = null;
    },
  },

  /** P3: heat dome — everything outside a shrinking, orbiting safe circle burns. */
  dome: {
    rest: 0.8,
    start(b, a, w) {
      const d = b.data;
      const p = target(w, b);
      a.ang = p ? bearing(b, p) : Math.PI / 2;
      a.spin = (Math.random() < 0.5 ? -1 : 1) * 0.2;
      a.tele = 1.9;
      a.active = 9.5;
      a.dur = a.tele + a.active + 0.4;
      a.fan = 2.2;
      d.anchored = true;
      a.h = track(b, w.addHazard({
        x: b.x,
        y: b.y,
        r: 600,
        width: 30,
        shape: 'ring',
        life: a.dur,
        damage: 0,
        owner: b,
        color: '#ff6a2a',
        data: { boss: b, a, hits: new Map() },
        update: domeUpdate,
        draw: domeDraw,
      }));
      domeUpdate(a.h, 0, w);
      w.announce?.('HEAT DOME', 'Stay inside the safe circle!', { kind: 'warning', time: 1.8 });
      w.sfx('boss_warning', b.x, b.y, { vol: 0.6 });
      d.alarm = 1;
    },
    update(b, a, dt, w) {
      if (!a.h.alive) return true;
      a.ang += a.spin * dt * (a.t > a.tele ? 1 : 0);
      a.fan -= dt;
      if (a.t > a.tele && a.fan <= 0 && a.t < a.dur - 1) {
        a.fan = rate(b, 1.5);
        const p = target(w, b);
        if (p) {
          const aim = bearing(b, p);
          for (let i = 0; i < 5; i++) rimShot(w, b, aim - 0.3 + 0.15 * i, 205, { damage: 8 });
          sfx(b, w, 'enemy_cannon', 0.2, { vol: 0.6 });
        }
      }
      return a.t >= a.dur;
    },
    end(b, a) {
      if (a.h) a.h.alive = false;
      b.data.anchored = false;
    },
  },

  /** P3: SUPERNOVA — long charge, then a blast wave. Shelter in the coolant plume or boost. */
  supernova: {
    rest: 0.6,
    start(b, a, w) {
      const d = b.data;
      const p = target(w, b);
      a.charge = 3.6;
      a.dur = a.charge + 1.9 + 3.2;
      d.anchored = true;
      d.novaCount = (d.novaCount || 0) + 1;
      clearHazards(b);
      // Bullets are sucked back into the core: the field is clear to reach shelter.
      w.clearEnemyBullets(b.x, b.y, Infinity, false);
      w.fx.ring?.(b.x, b.y, GEO.R, '#fff3c4', 0.6, { r0: 700, width: 6 });
      // Shelter: off to one side of the player's bearing (a short dash away) and on screen.
      const side = Math.random() < 0.5 ? -1 : 1;
      const base = p ? bearing(b, p) : Math.PI / 2;
      a.pocket = { x: b.x, y: b.y, r: 105 };
      for (const spread of [0.5 + Math.random() * 0.25, 0.35, -0.4, 0]) {
        const th = base + side * spread;
        a.pocket.x = b.x + Math.cos(th) * 380;
        a.pocket.y = b.y + Math.sin(th) * 380;
        if (w.isVisible(a.pocket.x, a.pocket.y, -a.pocket.r * 0.8)) break;
      }
      a.ph = track(b, w.addHazard({
        x: a.pocket.x,
        y: a.pocket.y,
        r: a.pocket.r,
        shape: 'circle',
        team: 'player', // harmless marker; the autopilot ignores player-team hazards
        damage: 0,
        life: a.charge + 2.2,
        data: { boss: b, a },
        draw: pocketDraw,
      }));
      w.announce?.('SUPERNOVA', 'Shelter in the coolant plume — or boost through the blast!', { kind: 'warning', time: 3.2 });
      w.sfx('boss_warning', b.x, b.y);
      w.floatText(a.pocket.x, a.pocket.y - a.pocket.r - 26, 'SHELTER', { color: '#9ff3ff', size: 22, life: a.charge, callout: true });
      d.alarm = 1;
      a.pull = 0;
      b.invuln = true; // the collapsing core swallows shots while it charges
    },
    update(b, a, dt, w) {
      const d = b.data;
      if (a.t < a.charge) {
        const k = a.t / a.charge;
        d.novaCharge = k;
        w.shake(0.05 + 0.25 * k * k);
        // Light & embers converge on the core.
        a.pull -= dt;
        if (a.pull <= 0) {
          a.pull = 0.025;
          const P = w.particles;
          for (let i = 0; i < 3; i++) {
            const ang = Math.random() * TAU;
            const r = 380 + Math.random() * 360;
            const sp = 520 + k * 300;
            P.spawn({
              x: b.x + Math.cos(ang) * r,
              y: b.y + Math.sin(ang) * r,
              vx: -Math.cos(ang) * sp,
              vy: -Math.sin(ang) * sp,
              life: (r - GEO.R * 0.5) / sp,
              size: 5,
              size1: 2,
              color: '#fff3c4',
              color1: '#ff8a2a',
              alpha: 0.9,
              blend: 'add',
              tex: 'streak',
              stretch: 0.05,
              align: true,
            });
          }
        }
        if (Math.floor(a.t * 2) !== Math.floor((a.t - dt) * 2)) sfx(b, w, 'tesla_hum', 0.3, { vol: 0.6, pitch: 0.6 + k });
        return false;
      }
      if (!a.blown) {
        a.blown = true;
        d.novaCharge = 0;
        b.invuln = false;
        detonate(b, a, w);
      }
      if (a.t > a.charge + 1.9 && !a.cooled) {
        a.cooled = true;
        d.vented = 3.2;
        w.floatText(b.x, b.y - GEO.R - 40, 'CORE VENTED — FIRE AT WILL!', { color: '#ffe08a', size: 20, life: 2.2, callout: true });
        d.anchored = false;
      }
      return a.t >= a.dur;
    },
    end(b) {
      b.data.novaCharge = 0;
      b.data.anchored = false;
      if (!b.data.dying && !b.data.transition) b.invuln = false;
    },
  },
};

// ---- supernova ------------------------------------------------------------------------------

function detonate(b, a, w) {
  const x = b.x;
  const y = b.y;
  w.flash('#fff3d6', 0.55);
  w.fx.flare?.(x, y, 900, '#fff3c4', 0.5);
  w.fx.shockwave?.(x, y, 1400, '#ffe0a0', 1.5);
  w.fx.shockwave?.(x, y, 700, '#ffffff', 0.7);
  w.fx.bigExplosion?.(x, y, 2.2);
  w.fx.embers?.(x, y, 40, { speed: 700 });
  w.sfx('explode_huge', x, y);
  w.sfx('boss_roar', x, y, { pitch: 0.8 });
  w.shake(1);
  w.zoomPunch(0.12);
  w.hitstop(0.08);
  const pocket = a.pocket;
  track(b, w.addHazard({
    x,
    y,
    r: GEO.R,
    width: 90,
    shape: 'ring',
    life: 1.8,
    damage: 0,
    owner: b,
    color: '#fff0c0',
    data: { boss: b, pocket, hit: new Set(), speed: 820 },
    update: novaUpdate,
    draw: novaDraw,
  }));
}

function novaUpdate(h, dt, w) {
  const D = h.data;
  const b = D.boss;
  h.r = GEO.R + D.speed * h.t;
  const dmg = 30 * (b.dmgMult || 1);
  for (const p of w.players) {
    if (!p.alive || D.hit.has(p)) continue;
    const d = Math.hypot(p.x - h.x, p.y - h.y);
    if (Math.abs(d - h.r) > h.width / 2 + p.hitR) continue;
    D.hit.add(p);
    const pk = D.pocket;
    if (pk && Math.hypot(p.x - pk.x, p.y - pk.y) <= pk.r) {
      w.floatText(p.x, p.y - 40, 'SHELTERED!', { color: '#9ff3ff', size: 18, life: 1.2, callout: true });
      continue;
    }
    if (p.iframes > 0 || p.god) {
      w.floatText(p.x, p.y - 40, 'DODGED!', { color: '#ffe08a', size: 18, life: 1.2, callout: true });
      continue;
    }
    w.damagePlayer(p, dmg, { source: 'supernova', owner: b, element: 'fire', angle: Math.atan2(p.y - h.y, p.x - h.x) });
    const a = Math.atan2(p.y - h.y, p.x - h.x);
    p.vx += Math.cos(a) * 420;
    p.vy += Math.sin(a) * 420;
  }
}

function novaDraw(ctx, h) {
  const k = clamp(h.t / h.life, 0, 1);
  const fade = 1 - k * k;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.35 * fade;
  ctx.strokeStyle = '#ff7a2f';
  ctx.lineWidth = h.width * 1.8;
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.r, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 0.85 * fade;
  ctx.strokeStyle = '#ffe2a0';
  ctx.lineWidth = h.width * 0.8;
  ctx.stroke();
  ctx.globalAlpha = fade;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = h.width * 0.25;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function pocketDraw(ctx, h, w) {
  const a = h.data.a;
  const charging = a.t < a.charge;
  const k = charging ? a.t / a.charge : 1;
  const fade = charging ? Math.min(1, a.t / 0.3) : clamp(1 - (a.t - a.charge) / 2, 0, 1);
  const pulse = 0.5 + 0.5 * Math.sin(w.time * (6 + k * 10));
  ctx.globalAlpha = fade;
  // Cool steam column.
  ctx.fillStyle = 'rgba(160,240,255,0.14)';
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.r, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  Sprites.draw(ctx, 'boss_sunFurnace_glow', h.x, h.y, 0, (h.r * 2.6) / 64, 0.45 * fade, GLOW.cyan);
  for (let i = 0; i < 6; i++) {
    const ang = w.time * (0.8 + i * 0.13) + i;
    const rr = h.r * (0.2 + 0.5 * ((i * 0.37) % 1));
    Sprites.draw(ctx, 'boss_sunFurnace_glow', h.x + Math.cos(ang) * rr, h.y + Math.sin(ang) * rr, 0, 1.1, 0.35 * fade, GLOW.white);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = `rgba(160,250,255,${(0.55 + 0.4 * pulse) * fade})`;
  ctx.lineWidth = 3.5;
  ctx.setLineDash([14, 9]);
  ctx.lineDashOffset = -w.time * 40;
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.r, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  // Inward chevrons around the rim: "get in here".
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * TAU + w.time * 0.5;
    const r0 = h.r + 26 + 10 * pulse;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    ctx.moveTo(h.x + c * (r0 + 12) - s * 9, h.y + s * (r0 + 12) + c * 9);
    ctx.lineTo(h.x + c * r0, h.y + s * r0);
    ctx.lineTo(h.x + c * (r0 + 12) + s * 9, h.y + s * (r0 + 12) - c * 9);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// ---- heat dome ------------------------------------------------------------------------------

function domeUpdate(h, dt, w) {
  const D = h.data;
  const b = D.boss;
  const a = D.a;
  if (!b.alive || b.data.dying) {
    h.alive = false;
    return;
  }
  const t = a.t;
  const k = clamp((t - a.tele) / a.active, 0, 1);
  const ease = k * k * (3 - 2 * k);
  h.r = t < a.tele ? 640 - 40 * (t / a.tele) : 600 - 410 * ease;
  h.x = b.x + Math.cos(a.ang) * 360;
  h.y = b.y + Math.sin(a.ang) * 360;
  D.armed = t >= a.tele && t < a.tele + a.active;
  if (!D.armed || dt <= 0) return;
  const dmg = 7 * (b.dmgMult || 1);
  for (const p of w.players) {
    if (!p.alive) continue;
    const d = Math.hypot(p.x - h.x, p.y - h.y);
    if (d <= h.r - p.hitR * 0.5) continue;
    const next = D.hits.get(p) ?? 0;
    if (w.time < next) continue;
    D.hits.set(p, w.time + 0.5);
    w.damagePlayer(p, dmg, { source: 'heatDome', owner: b, element: 'fire', angle: Math.atan2(h.y - p.y, h.x - p.x) });
    w.fx.burn?.(p.x, p.y, 1);
  }
  // Flames dancing on the wall.
  D.fxT = (D.fxT ?? 0) - dt;
  if (D.fxT <= 0) {
    D.fxT = 0.05;
    const ang = Math.random() * TAU;
    w.particles.spawn({
      x: h.x + Math.cos(ang) * h.r,
      y: h.y + Math.sin(ang) * h.r,
      vx: Math.cos(ang) * 40,
      vy: Math.sin(ang) * 40 - 30,
      life: 0.6,
      size: 26,
      size1: 46,
      color: '#ffc860',
      color1: '#a0200a',
      alpha: 0.7,
      blend: 'add',
      tex: 'smoke',
    });
  }
}

function domeDraw(ctx, h, w) {
  const D = h.data;
  const a = D.a;
  const tele = a.t < a.tele;
  const end = a.tele + a.active;
  const fade = a.t > end ? clamp(1 - (a.t - end) / 0.4, 0, 1) : 1;
  const pulse = 0.5 + 0.5 * Math.sin(w.time * 9);
  // Scorching outside: darken (reads on bright lava) + a pulsing crimson heat wash.
  const outer = h.r + 1500;
  const k = tele ? a.t / a.tele : 1;
  ctx.globalAlpha = fade * k;
  ctx.fillStyle = 'rgba(40,4,0,0.34)';
  ctx.beginPath();
  ctx.arc(h.x, h.y, outer, 0, TAU);
  ctx.arc(h.x, h.y, h.r, 0, TAU, true);
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(255,40,10,${tele ? 0.05 : 0.08 + 0.06 * pulse})`;
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  if (tele) {
    ctx.globalAlpha = 0.6 + 0.4 * pulse;
    ctx.strokeStyle = '#ffb04a';
    ctx.lineWidth = 4;
    ctx.setLineDash([18, 12]);
    ctx.lineDashOffset = w.time * 50;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    return;
  }
  // The wall of fire.
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = '#ff6a1f';
  ctx.globalAlpha = 0.45 * fade;
  ctx.lineWidth = 34;
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.r + 12, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = '#ffd890';
  ctx.globalAlpha = 0.9 * fade;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.r, 0, TAU);
  ctx.stroke();
  const n = 40;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * TAU + w.time * 0.3;
    const fl = 0.6 + 0.4 * Math.sin(w.time * 13 + i * 2.7);
    const rr = h.r + 16 + 10 * fl;
    Sprites.draw(ctx, 'boss_sunFurnace_glow', h.x + Math.cos(ang) * rr, h.y + Math.sin(ang) * rr, 0, 0.9 + 0.5 * fl, 0.55 * fade, i % 3 ? GLOW.orange : GLOW.hot);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/** Attack plans per phase (cycled). Supernova recurs in phase 3. */
export const PLANS = [
  ['spiral', 'jets', 'fan', 'spiral', 'vent', 'jets', 'fan', 'spiral', 'jets', 'vent'],
  ['helix', 'embers', 'globs', 'jets4', 'geysers', 'helix', 'globs', 'embers', 'jets4', 'geysers'],
  ['corona', 'embers', 'dome', 'supernova', 'geysers', 'corona', 'globs', 'dome', 'embers', 'corona', 'supernova', 'geysers'],
];
