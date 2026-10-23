// The Storm Engine — Thunder Made Iron (WP15, stage 3 boss). DESIGN §2.11, docs/ENGINE.md §7.
//
// A floating tesla tower: octagonal platform, four rotating truss arms ending in coils, a
// coil-wound dome with a glass aether core and four orbiting conductor spheres (destructible;
// while any lives the core takes 50% damage — visible as cyan shield arcs).
//
// Colour language: magenta electricity hurts (strikes, beams, fences, sparks); cyan is cosmetic
// (shield arcs, coil glow, ambient crackle).
//
// Phases (b.phase): 0 strikes + zig-zag orb volleys · 1 (<60%) sweeping beam arms with gaps +
// chain-arc fences between spheres · 2 (<25%) OVERCHARGE: magnetic pull + rings, everything
// faster, storm intensifies, the screen crackles.

import { Sprites } from '../../gfx/sprites.js';
import { TAU, clamp } from '../../core/math.js';
import { SE, ARM_TIP } from './stormEngine-art.js';
import * as K from './stormEngine-kit.js';

const BASE_HP = 3800;
const N_ARMS = 4;
const N_SPH = 4;
const SPHERE_HP = 240;
const ORBIT_R = 178;
const HOT = '#ff4fd8';
const HOT_CORE = '#ffd6f4';
const COOL = '#7ff3ff';
const VIOLET = '#c9a8ff';
const P2 = 0.6;
const P3 = 0.25;
const BUSY = new Set(['enter', 'phase', 'beamCharge', 'beam', 'magnetCharge', 'magnet']);

const _a = { x: 0, y: 0 };
const _b = { x: 0, y: 0 };
const _v = {};
const _t = {};
/** Keep the core this far inside the HUD-safe view box (arms may overhang a little). */
const MARGIN = { x: 230, y: 125 };
const MARGIN_OUT = { x: 150, y: 90 };

// ---- Geometry ---------------------------------------------------------------------------------

function armAngle(D, k) {
  return D.armAng + (k * TAU) / N_ARMS;
}

/** World position of arm k's electrode tip. */
function coilTip(b, k, out, ext = b.data.armExt) {
  const a = armAngle(b.data, k);
  const r = ARM_TIP * ext * b.scale;
  out.x = b.x + Math.cos(a) * r;
  out.y = b.y + Math.sin(a) * r;
  return out;
}

function placeSpheres(b) {
  const D = b.data;
  for (let i = 0; i < D.spheres.length; i++) {
    const s = D.spheres[i];
    if (!s.alive) continue;
    const a = D.orbAng + (s.data.i * TAU) / N_SPH;
    const r = D.orbR + Math.sin(D.t * 2.1 + s.data.i) * 6;
    s.x = b.x + Math.cos(a) * r;
    s.y = b.y + Math.sin(a) * r;
  }
}

function livingSpheres(b) {
  return b.data.spheres.filter((s) => s.alive);
}

// ---- Attacks: lightning strikes ------------------------------------------------------------

function teleK(b) {
  return b.phase >= 2 ? 0.82 : 1;
}

/** Telegraphed strike: pulsing magenta circle → bolt from the sky + area damage. */
function strikeAt(b, w, x, y, r, tele, loud = true) {
  K.track(
    b,
    w.telegraphCircle(x, y, r, Math.max(0.62, tele), {
      color: HOT,
      onDone: (ww) => {
        if (b.alive) doStrike(b, ww, x, y, r, loud);
      },
    })
  );
}

function doStrike(b, w, x, y, r, loud) {
  const wt = w.weather;
  if (wt?.strike) wt.strike(x, y, { color: '#f3c2ff', width: 1.25, flash: loud ? 0.32 : 0.12, vol: loud ? 0.6 : 0.3, sound: loud });
  else w.fx.lightning?.(x + 70, y - 720, x, y, { color: HOT, width: 4, life: 0.25, branches: 3 });
  w.explode(x, y, r, 20, { team: 'enemy', owner: b, visual: false, sound: false, knockback: 140, element: 'shock' });
  const fx = w.fx;
  fx.flare?.(x, y, r * 1.8, HOT_CORE, 0.18);
  fx.shockwave?.(x, y, r * 1.35, HOT, 0.35);
  fx.sparks?.(x, y, 0, 12, '#ffb0e8', TAU, { speed: 420 });
  for (let i = 0; i < 3; i++) {
    const a = w.rng.angle();
    const d = r * (0.9 + w.rng.next() * 0.8);
    fx.lightning?.(x, y, x + Math.cos(a) * d, y + Math.sin(a) * d, { color: HOT, width: 2, life: 0.18, branches: 1, sparks: false });
  }
  fx.smoke?.(x, y, 0.9, { dark: true, layer: 'low', count: 3 });
  w.sfx('enemy_zap', x, y, { vol: 0.8, pitch: 0.8 + w.rng.next() * 0.3 });
  w.shake(0.1);
}

function predicted(p, lead) {
  _a.x = p.x + (p.vx || 0) * lead;
  _a.y = p.y + (p.vy || 0) * lead;
  return _a;
}

function atkHunt(b, w) {
  const D = b.data;
  const n = b.phase === 0 ? 4 : 5;
  const gap = b.phase >= 2 ? 0.42 : 0.52;
  for (let i = 0; i < n; i++) {
    w.after(i * gap, () => {
      if (!b.alive || D.state !== 'strikes') return;
      const p = K.targetPlayer(w, b);
      if (!p) return;
      const q = predicted(p, 0.3);
      strikeAt(b, w, q.x, q.y, 64, 0.9 * teleK(b), i % 2 === 0);
      chargeFlash(b, w, i % N_ARMS);
    });
  }
  D.dur = n * gap + 1.1;
}

function atkRing(b, w, p) {
  const D = b.data;
  const cx = p.x;
  const cy = p.y;
  const rings = b.phase >= 2 ? [[150, 8, 0], [290, 12, 0.55]] : [[150, 8, 0]];
  for (const [rad, n, delay] of rings) {
    const skip = (w.rng.next() * n) | 0;
    const rot = w.rng.angle();
    w.after(delay, () => {
      if (!b.alive || D.state !== 'strikes') return;
      for (let i = 0; i < n; i++) {
        if (i === skip || i === (skip + 1) % n) continue; // the way out
        const a = rot + (i * TAU) / n;
        strikeAt(b, w, cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, 58, 1.0 * teleK(b), i === (skip + 3) % n);
      }
    });
  }
  w.after(0.45, () => {
    if (b.alive && D.state === 'strikes') strikeAt(b, w, cx, cy, 80, 0.9 * teleK(b));
  });
  for (let k = 0; k < N_ARMS; k++) chargeFlash(b, w, k);
  D.dur = 2.1;
}

function atkWalk(b, w, p) {
  const D = b.data;
  const base = Math.atan2(p.y - b.y, p.x - b.x);
  const fans = b.phase >= 1 ? [-0.32, 0.32] : [0];
  if (b.phase >= 2) fans.push(0);
  for (let f = 0; f < fans.length; f++) {
    const a = base + fans[f];
    const delay = f * 0.18;
    for (let i = 0; i < 8; i++) {
      w.after(delay + i * 0.11, () => {
        if (!b.alive || D.state !== 'strikes') return;
        const d = 140 + i * 84;
        strikeAt(b, w, b.x + Math.cos(a) * d, b.y + Math.sin(a) * d, 54, 0.85 * teleK(b), i % 3 === 0);
      });
    }
  }
  D.dur = 2.2;
}

function atkScatter(b, w, p) {
  const D = b.data;
  const n = 12;
  for (let i = 0; i < n; i++) {
    w.after(i * 0.07, () => {
      if (!b.alive || D.state !== 'strikes') return;
      const q = K.targetPlayer(w, b) || p;
      let x = q.x;
      let y = q.y;
      if (i > 0) {
        const a = w.rng.angle();
        const d = 90 + w.rng.next() * 300;
        x += Math.cos(a) * d;
        y += Math.sin(a) * d;
      }
      strikeAt(b, w, x, y, 54, 0.82, i % 4 === 0);
    });
  }
  D.dur = 2;
}

/** A coil spits a short cosmetic arc so attacks visibly originate from the machine. */
function chargeFlash(b, w, k) {
  coilTip(b, k, _b);
  w.fx.lightning?.(b.x, b.y, _b.x, _b.y, { color: COOL, width: 2, life: 0.16, branches: 1, sparks: false });
  w.fx.flare?.(_b.x, _b.y, 46, COOL, 0.16);
}

// ---- Attacks: sweeping beam arms -----------------------------------------------------------

/** Radial extent [r0, r1] of beam segment `seg` (0 inner, 1 outer) around a breathing gap. */
function beamSpan(b, seg) {
  const D = b.data;
  const gc = 345 + Math.sin(D.t * 1.25) * 55;
  const gh = b.phase >= 2 ? 40 : 46;
  return seg === 0 ? [ARM_TIP * D.armExt + 10, gc - gh] : [gc + gh, 900];
}

function beamUpdate(b, k, seg, token) {
  return (h) => {
    if (!b.alive || b.data.beamToken !== token) {
      h.alive = false;
      return;
    }
    const a = armAngle(b.data, k);
    const [r0, r1] = beamSpan(b, seg);
    const c = Math.cos(a);
    const s = Math.sin(a);
    h.x = b.x + c * r0;
    h.y = b.y + s * r0;
    h.x2 = b.x + c * r1;
    h.y2 = b.y + s * r1;
  };
}

function drawBeam(ctx, h, w) {
  const fade = Math.min(1, (h.life - h.t) / 0.25, h.t / 0.12) * h.alpha;
  if (fade <= 0) return;
  ctx.globalCompositeOperation = 'lighter';
  const mild = w.reducedFlash ? 0.7 : 1;
  K.zap(ctx, h.x, h.y, h.x2, h.y2, HOT, h.width * 0.55, 10, fade * mild);
  if (Math.random() < 0.5) K.zap(ctx, h.x, h.y, h.x2, h.y2, '#ff9ae8', 2, 16, 0.6 * fade * mild);
  ctx.globalAlpha = 0.5 * fade;
  ctx.fillStyle = HOT_CORE;
  ctx.beginPath();
  ctx.arc(h.x2, h.y2, 5 + Math.random() * 4, 0, TAU);
  ctx.arc(h.x, h.y, 5 + Math.random() * 4, 0, TAU);
  ctx.fill();
}

function atkBeam(b, w) {
  const D = b.data;
  D.state = 'beamCharge';
  D.st = 0;
  D.dur = 1.05 * teleK(b);
  D.spinDir = w.rng.sign();
  D.armSpdT = 0.14 * D.spinDir;
  D.beamToken = (D.beamToken || 0) + 1;
  const token = D.beamToken;
  for (let k = 0; k < N_ARMS; k++) {
    for (let seg = 0; seg < 2; seg++) {
      K.track(
        b,
        w.addHazard({ shape: 'line', telegraph: true, life: D.dur, width: 22, color: HOT, owner: b, update: beamUpdate(b, k, seg, token) })
      );
    }
  }
  w.sfx('tesla_hum', b.x, b.y, { vol: 1, pitch: 0.8 });
}

function fireBeams(b, w) {
  const D = b.data;
  D.state = 'beam';
  D.st = 0;
  D.dur = b.phase >= 2 ? 5.6 : 4.6;
  D.flipped = false;
  D.armSpdT = D.spinDir * (b.phase >= 2 ? 0.6 : 0.46);
  const token = D.beamToken;
  for (let k = 0; k < N_ARMS; k++) {
    for (let seg = 0; seg < 2; seg++) {
      K.track(
        b,
        w.addHazard({
          shape: 'line',
          life: D.dur,
          width: 16,
          damage: 18,
          tick: 0.45,
          color: HOT,
          owner: b,
          element: 'shock',
          source: 'stormEngine:beam',
          update: beamUpdate(b, k, seg, token),
          draw: drawBeam,
        })
      );
    }
    chargeFlash(b, w, k);
  }
  w.sfx('enemy_zap', b.x, b.y, { vol: 1, pitch: 0.6 });
  w.sfx('tesla_zap', b.x, b.y, { vol: 0.8, pitch: 0.7 });
  w.shake(0.25);
}

// ---- Attacks: chain-arc fences --------------------------------------------------------------

/** Fence nodes: living spheres, or the coil tips when fewer than two spheres remain. */
function fencePairs(b, w) {
  const live = livingSpheres(b);
  const D = b.data;
  let nodes;
  if (live.length >= 2) {
    D.fenceMode = 'spheres';
    nodes = live.sort((p, q) => p.data.i - q.data.i);
  } else {
    D.fenceMode = 'arms';
    nodes = [0, 1, 2, 3];
  }
  const pairs = [];
  const n = nodes.length;
  if (n === 2) pairs.push([nodes[0], nodes[1]]);
  else for (let i = 0; i < n; i++) pairs.push([nodes[i], nodes[(i + 1) % n]]);
  if (n > 2) pairs.splice((w.rng.next() * pairs.length) | 0, 1); // always one opening
  return pairs;
}

function nodePos(b, node, out) {
  if (typeof node === 'number') return coilTip(b, node, out);
  out.x = node.x;
  out.y = node.y;
  return out;
}

function fenceUpdate(b, pair, token) {
  return (h, dt, w) => {
    const [n0, n1] = pair;
    if (!b.alive || b.data.fenceToken !== token || (typeof n0 !== 'number' && !n0.alive) || (typeof n1 !== 'number' && !n1.alive)) {
      if (h.alive && b.alive && !h.telegraph) w.fx.sparks?.(h.x, h.y, 0, 6, HOT, TAU, { speed: 300 });
      h.alive = false;
      return;
    }
    nodePos(b, n0, _a);
    h.x = _a.x;
    h.y = _a.y;
    nodePos(b, n1, _a);
    h.x2 = _a.x;
    h.y2 = _a.y;
  };
}

function drawFence(ctx, h, w) {
  const fade = Math.min(1, (h.life - h.t) / 0.25, h.t / 0.1) * h.alpha;
  if (fade <= 0) return;
  ctx.globalCompositeOperation = 'lighter';
  const mild = w.reducedFlash ? 0.7 : 1;
  K.zap(ctx, h.x, h.y, h.x2, h.y2, HOT, 5, 14, fade * mild);
  K.zap(ctx, h.x, h.y, h.x2, h.y2, '#ffa6ec', 1.6, 22, 0.7 * fade * mild);
}

function atkFence(b, w) {
  const D = b.data;
  D.state = 'fenceCharge';
  D.st = 0;
  D.dur = 0.95 * teleK(b);
  D.fenceToken = (D.fenceToken || 0) + 1;
  D.fencePairs = fencePairs(b, w);
  if (D.fenceMode === 'spheres') {
    D.orbRT = 285;
    D.orbSpd = 0.22;
  } else {
    D.armExtT = 1.45;
    D.armSpdT = 0.2 * (D.spinDir || 1);
  }
  const token = D.fenceToken;
  for (const pair of D.fencePairs) {
    K.track(b, w.addHazard({ shape: 'line', telegraph: true, life: D.dur, width: 18, color: HOT, update: fenceUpdate(b, pair, token) }));
  }
  w.sfx('tesla_hum', b.x, b.y, { vol: 1, pitch: 1.2 });
}

function fireFence(b, w) {
  const D = b.data;
  D.state = 'fence';
  D.st = 0;
  D.dur = b.phase >= 2 ? 4.8 : 4.2;
  D.orbDir = w.rng.sign();
  const token = D.fenceToken;
  for (const pair of D.fencePairs) {
    K.track(
      b,
      w.addHazard({
        shape: 'line',
        life: D.dur,
        width: 14,
        damage: 16,
        tick: 0.45,
        color: HOT,
        owner: b,
        element: 'shock',
        source: 'stormEngine:fence',
        update: fenceUpdate(b, pair, token),
        draw: drawFence,
      })
    );
  }
  if (D.fenceMode === 'arms') D.armSpdT = (D.spinDir || 1) * (b.phase >= 2 ? 0.75 : 0.6);
  w.sfx('tesla_zap', b.x, b.y, { vol: 0.9 });
  w.shake(0.15);
}

// ---- Attacks: magnetic pull ---------------------------------------------------------------

function atkMagnet(b, w) {
  const D = b.data;
  D.state = 'magnetCharge';
  D.st = 0;
  D.dur = 0.95;
  D.ringRot = w.rng.angle();
  D.ringCd = 0.35;
  for (const p of w.players) {
    if (p.alive) w.floatText(p.x, p.y - 56, 'MAGNETIC PULL — BOOST!', { color: VIOLET, size: 18, life: 1.6, crit: true });
  }
  if (!D.pulledOnce) {
    D.pulledOnce = true;
    K.sayTaunt(b, w, 'phase', 0);
  }
  w.sfx('tesla_hum', b.x, b.y, { vol: 1, pitch: 0.55 });
  w.fx.ring?.(b.x, b.y, 90, VIOLET, 0.9, { r0: 620, width: 5 });
}

function magnetTick(b, w, dt) {
  const D = b.data;
  for (const p of w.players) {
    if (!p.alive) continue;
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 30) continue;
    let s = 560 * clamp(1.15 - d / 1100, 0.35, 1);
    if (p.boosting) s *= 0.3;
    p.vx += (dx / d) * s * dt;
    p.vy += (dy / d) * s * dt;
  }
  // Ring volleys with a rotating gap.
  D.ringCd -= dt * b.fireRateMult;
  if (D.ringCd <= 0) {
    D.ringCd = 0.8;
    const n = 20;
    D.ringRot += 0.55;
    for (let i = 0; i < n; i++) {
      if (i < 3) continue;
      const a = D.ringRot + (i * TAU) / n;
      w.fire({ team: 'enemy', kind: 'spark', x: b.x + Math.cos(a) * 60, y: b.y + Math.sin(a) * 60, angle: a, speed: 170, r: 7, damage: 11, life: 5, owner: b, glow: HOT });
    }
    w.sfx('enemy_zap', b.x, b.y, { vol: 0.7 });
    w.fx.ring?.(b.x, b.y, 110, HOT, 0.25, { width: 4, r0: 40 });
  }
  // Inward streaks sell the field.
  D.streakT = (D.streakT || 0) - dt;
  if (D.streakT <= 0) {
    D.streakT = 0.05;
    const a = w.rng.angle();
    const r = 380 + w.rng.next() * 200;
    w.fx.sparks?.(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, a + Math.PI, 1, VIOLET, 0.05, { speed: 640, life: 0.55, size: 2.2 });
  }
}

// ---- Concurrent fire ---------------------------------------------------------------------

function sparkShot(b, w, x, y, a, speed, wave) {
  w.fire({ team: 'enemy', kind: 'spark', x, y, angle: a, speed, r: 7, damage: 11, life: 5.5, owner: b, glow: HOT, wave });
}

function fireOrbs(b, w, p) {
  const D = b.data;
  D.volley = (D.volley || 0) + 1;
  const spiral = b.phase >= 1 && D.volley % 2 === 0;
  if (!spiral) {
    const n = b.phase >= 2 ? 7 : 5;
    const base = Math.atan2(p.y - b.y, p.x - b.x);
    const spread = b.phase >= 2 ? 1.2 : 0.9;
    for (let i = 0; i < n; i++) {
      const a = base + (i / (n - 1) - 0.5) * spread;
      sparkShot(b, w, b.x + Math.cos(a) * 70, b.y + Math.sin(a) * 70, a, 200, { amp: 22, freq: 2.3, phase: i * 0.9 });
    }
    w.sfx('enemy_zap', b.x, b.y, { vol: 0.6, pitch: 1.2 });
    return;
  }
  const shots = b.phase >= 2 ? 6 : 5;
  for (let j = 0; j < shots; j++) {
    w.after(j * 0.14, () => {
      if (!b.alive || BUSY.has(b.data.state)) return;
      for (let k = 0; k < N_ARMS; k++) {
        coilTip(b, k, _b);
        sparkShot(b, w, _b.x, _b.y, armAngle(b.data, k), 185, { amp: 16, freq: 3, phase: j });
      }
      w.sfx('enemy_shot', b.x, b.y, { vol: 0.5, pitch: 1.4 });
    });
  }
}

// ---- Phase control --------------------------------------------------------------------------

function enterPhase(b, w, n) {
  const D = b.data;
  K.phaseShift(b, w, n, {
    text: n === 1 ? 'ARC STORM' : 'OVERCHARGE',
    sub: n === 1 ? 'Sweep arms energised — slip through the gaps!' : 'Magnetic pull — boost to break free!',
    color: n === 2 ? '#ff9ae8' : '#bff8ff',
    invuln: 1.7,
  });
  D.state = 'phase';
  D.st = 0;
  D.armSpdT = 3.2 * (D.spinDir || 1);
  D.armExtT = 1;
  D.orbRT = ORBIT_R;
  D.orbSpd = 0.55;
  D.charge = 1;
  w.weather?.strike?.(b.x, b.y, { flash: 0.5, color: '#e9f8ff', width: 1.6 });
  for (let k = 0; k < N_ARMS; k++) chargeFlash(b, w, k);
  K.sayTaunt(b, w, 'phase', n === 1 ? 1 : 2);
  if (n === 2) K.stormWeather(b, w, 1.7);
}

function pickAttack(b, w) {
  const D = b.data;
  let m;
  if (b.phase === 0) m = { hunt: 3, ring: 2, walk: 2 };
  else if (b.phase === 1) m = { beam: 3, fence: 3, hunt: 1.2, walk: 1, ring: 1 };
  else m = { beam: 2.5, fence: 2, magnet: D.sinceMagnet >= 2 ? 7 : 1.2, scatter: 1.5, hunt: 1, ring: 1, walk: 0.8 };
  if (m[D.last]) m[D.last] *= 0.12;
  return w.rng.weightedKey(m);
}

function startAttack(b, w, kind, p) {
  const D = b.data;
  D.last = kind;
  D.sinceMagnet = kind === 'magnet' ? 0 : (D.sinceMagnet || 0) + 1;
  D.st = 0;
  switch (kind) {
    case 'beam':
      return atkBeam(b, w);
    case 'fence':
      return atkFence(b, w);
    case 'magnet':
      return atkMagnet(b, w);
    default:
      D.state = 'strikes';
      w.sfx('tesla_hum', b.x, b.y, { vol: 0.7, pitch: 1.3 });
      if (kind === 'ring') atkRing(b, w, p);
      else if (kind === 'walk') atkWalk(b, w, p);
      else if (kind === 'scatter') atkScatter(b, w, p);
      else atkHunt(b, w);
  }
}

function idle(b, cool) {
  const D = b.data;
  D.state = 'idle';
  D.st = 0;
  D.cool = cool;
  D.armSpdT = (D.spinDir || 1) * [0.35, 0.45, 0.6][b.phase];
  D.armExtT = 1;
  D.orbRT = ORBIT_R;
  D.orbSpd = [0.55, 0.65, 0.8][b.phase];
}

function runState(b, w, dt, p) {
  const D = b.data;
  const cools = [1.5, 1.1, 0.75];
  switch (D.state) {
    case 'enter': {
      D.armSpdT = Math.max(0.35, 3 - D.st);
      if (D.st > 1.2 && !D.introSaid) {
        D.introSaid = true;
        K.sayTaunt(b, w, 'intro');
      }
      if (D.st >= 2.8) {
        D.entering = false;
        b.invuln = false;
        w.weather?.strike?.(b.x, b.y, { flash: 0.45, width: 1.6 });
        w.fx.shockwave?.(b.x, b.y, 420, '#bff8ff', 0.7);
        for (let k = 0; k < N_ARMS; k++) chargeFlash(b, w, k);
        w.shake(0.35);
        idle(b, 0.9);
      }
      break;
    }
    case 'phase':
      if (D.st >= 1.7) idle(b, 0.5);
      break;
    case 'idle':
      D.cool -= dt * b.fireRateMult;
      if (D.cool <= 0 && p) startAttack(b, w, pickAttack(b, w), p);
      break;
    case 'strikes':
      if (D.st >= D.dur) idle(b, cools[b.phase]);
      break;
    case 'beamCharge':
      D.charge = Math.min(1, D.st / D.dur);
      if (w.rng.next() < dt * 10) chargeFlash(b, w, (w.rng.next() * N_ARMS) | 0);
      if (D.st >= D.dur) fireBeams(b, w);
      break;
    case 'beam':
      D.charge = 1;
      if (b.phase >= 2 && !D.flipped && D.st > D.dur * 0.5) {
        D.flipped = true;
        D.spinDir = -D.spinDir;
        D.armSpdT = D.spinDir * 0.6;
      }
      if (D.st >= D.dur) {
        D.charge = 0.3;
        idle(b, cools[b.phase] + 0.3);
      }
      break;
    case 'fenceCharge':
      D.charge = 0.5 * Math.min(1, D.st / D.dur);
      if (D.st >= D.dur) fireFence(b, w);
      break;
    case 'fence':
      if (D.fenceMode === 'spheres') {
        D.orbRT = 250 + Math.sin(D.st * 1.5) * 80;
        D.orbSpd = D.orbDir * (b.phase >= 2 ? 0.95 : 0.72);
      } else {
        D.armExtT = 1.45 + Math.sin(D.st * 1.5) * 0.25;
      }
      if (D.st >= D.dur) idle(b, cools[b.phase]);
      break;
    case 'magnetCharge':
      D.magnet = Math.min(1, D.st / D.dur);
      D.charge = D.magnet;
      if (D.st >= D.dur) {
        D.state = 'magnet';
        D.st = 0;
        D.dur = 4.3;
        w.sfx('tesla_zap', b.x, b.y, { vol: 1, pitch: 0.5 });
      }
      break;
    case 'magnet':
      D.magnet = 1;
      magnetTick(b, w, dt);
      if (D.st >= D.dur) {
        D.magnet = 0;
        idle(b, cools[b.phase]);
      }
      break;
    default:
      idle(b, 1);
  }
  if (D.state !== 'magnet' && D.state !== 'magnetCharge') D.magnet = Math.max(0, D.magnet - dt * 2);
  if (D.state === 'idle' || D.state === 'strikes') D.charge = Math.max(0, D.charge - dt * 1.5);
}

// ---- Movement, damage states, ambience ----------------------------------------------------

function move(b, w, dt, p) {
  const D = b.data;
  if (!p) return;
  // Ride an ellipse around the player (wide, short — the view is landscape) so the whole
  // machine stays framed; drift slowly around it, reversing now and then.
  const RX = 330;
  const RY = 210;
  let th = Math.atan2((b.y - p.y) / RY, (b.x - p.x) / RX);
  if (D.state === 'enter') th = -Math.PI / 2;
  D.driftT -= dt;
  if (D.driftT <= 0) {
    D.driftT = 7 + w.rng.next() * 6;
    D.drift = w.rng.sign() * (0.1 + w.rng.next() * 0.1);
  }
  th += D.drift * 0.6;
  const tgt = K.clampToView(w, p.x + Math.cos(th) * RX, p.y + Math.sin(th) * RY, MARGIN, _t);
  const ax = tgt.x;
  const ay = tgt.y;
  let max = 95;
  if (D.state === 'enter') max = 260;
  else if (D.state === 'beam' || D.state === 'beamCharge' || D.state === 'magnet' || D.state === 'fence') max = 32;
  const d = Math.hypot(p.x - b.x, p.y - b.y);
  if (d > 640) max = Math.max(max, 340);
  else if (D.state !== 'enter' && K.outsideView(w, b.x, b.y, MARGIN_OUT)) max = Math.max(max, 290);
  max *= b.speedMult;
  let dvx = (ax - b.x) * 0.9;
  let dvy = (ay - b.y) * 0.9;
  const m = Math.hypot(dvx, dvy);
  if (m > max) {
    dvx *= max / m;
    dvy *= max / m;
  }
  const k = Math.min(1, dt * 2.2);
  b.vx += (dvx - b.vx) * k;
  b.vy += (dvy - b.vy) * k;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
}

const VENTS = [
  [0.79, 104],
  [2.36, 104],
  [3.93, 104],
  [5.5, 104],
  [1.2, 60],
  [4.4, 60],
];

function damageFx(b, w, dt) {
  const D = b.data;
  const f = b.hp / b.maxHp;
  D.fxT -= dt;
  if (D.fxT > 0 || f >= 0.5) return;
  D.fxT = f < P3 ? 0.06 : 0.1;
  const v = VENTS[(w.rng.next() * VENTS.length) | 0];
  const x = b.x + Math.cos(v[0]) * v[1];
  const y = b.y + Math.sin(v[0]) * v[1];
  w.fx.smokeTrail?.(x, y, 1.5, { fire: f < P3 });
  if (w.rng.next() < 0.25) w.fx.sparks?.(x, y, w.rng.angle(), 5, '#ffe08a', 1.2, { speed: 260 });
  if (f < P3 && w.rng.next() < 0.2) {
    const a = w.rng.angle();
    w.fx.lightning?.(b.x, b.y, b.x + Math.cos(a) * 120, b.y + Math.sin(a) * 120, { color: COOL, width: 1.6, life: 0.14, branches: 1, sparks: false });
  }
}

function overchargeFx(b, w, dt) {
  const D = b.data;
  if (b.phase < 2) return;
  D.crackT -= dt;
  if (D.crackT <= 0) {
    D.crackT = 0.18 + w.rng.next() * 0.35;
    const a = w.rng.angle();
    const r = 260 + w.rng.next() * 220;
    w.fx.lightning?.(b.x, b.y, b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, { color: VIOLET, width: 2, life: 0.15, branches: 2, sparks: false });
  }
  D.ambT -= dt;
  if (D.ambT <= 0) {
    D.ambT = 2.4 + w.rng.next() * 2;
    // A cosmetic sky strike far from every player (no telegraph needed — it can't hit).
    const v = w.renderer.viewRect(-60, _v);
    for (let tries = 0; tries < 6; tries++) {
      const x = v.x0 + w.rng.next() * (v.x1 - v.x0);
      const y = v.y0 + w.rng.next() * (v.y1 - v.y0);
      const near = w.nearestPlayer(x, y, 460);
      if (!near) {
        w.weather?.strike?.(x, y, { flash: 0.15, vol: 0.35, width: 0.9 });
        w.fx.sparks?.(x, y, 0, 8, VIOLET, TAU, { speed: 260 });
        break;
      }
    }
  }
}

function sphereFire(b, w, dt, p) {
  const D = b.data;
  if (!p || D.state === 'enter' || D.state === 'phase' || D.state === 'beam') return;
  for (const s of D.spheres) {
    if (!s.alive) continue;
    s.data.cd -= dt * b.fireRateMult;
    if (s.data.cd > 0) continue;
    s.data.cd = (b.phase >= 2 ? 3.2 : 4.4) + w.rng.next() * 1.4;
    const a = Math.atan2(p.y - s.y, p.x - s.x);
    w.fire({ team: 'enemy', kind: 'spark', x: s.x, y: s.y, angle: a, speed: 165, r: 7, damage: 10, life: 5.5, owner: b, glow: HOT });
    w.fx.flare?.(s.x, s.y, 40, HOT_CORE, 0.12);
  }
}

// ---- Conductor sphere part ----------------------------------------------------------------

const SPHERE_DEF = {
  id: 'stormEngineSphere',
  name: 'Conductor Sphere',
  hp: SPHERE_HP,
  r: 25,
  manualMove: true,
  noSeparation: true,
  noKnockback: true,
  shareDamage: 0.35,
  contactDamage: 14,
  layer: 1,
  alt: 1.9,
  xp: 5,
  cogs: 3,
  score: 400,
  update(e, dt, w) {
    e.angle += dt * 1.4;
    if (e.hp < e.maxHp * 0.5) {
      e.data.fx = (e.data.fx || 0) - dt;
      if (e.data.fx <= 0) {
        e.data.fx = 0.12;
        w.fx.smokeTrail?.(e.x, e.y, 0.8, { fire: e.hp < e.maxHp * 0.25 });
        if (w.rng.next() < 0.3) w.fx.sparks?.(e.x, e.y, w.rng.angle(), 3, COOL, 1, { speed: 200 });
      }
    }
  },
  draw(ctx, e, w) {
    const b = e.parent;
    const hot = b?.alive && (b.data.state === 'fenceCharge' || b.data.state === 'fence');
    w.drawEnemySprite(ctx, e, SE.sphere, 0, e.angle, e.x, e.y, e.scale);
    if (!e.alive) {
      Sprites.drawTint(ctx, SE.sphere, e.x, e.y, e.angle, e.scale, '#120a06', 0.6 * e.alpha);
      return;
    }
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.32 + 0.08 * Math.sin(e.t * 7 + e.data.i);
    Sprites.draw(ctx, hot ? SE.glowHot : SE.glow, e.x, e.y, 0, (hot ? 0.75 : pulse) * e.scale, 0.8 * e.alpha);
    if (Math.random() < 0.35) {
      const a = Math.random() * TAU;
      K.zap(ctx, e.x, e.y, e.x + Math.cos(a) * 34, e.y + Math.sin(a) * 34, hot ? HOT : COOL, 1.4, 5, 0.7);
    }
    ctx.globalCompositeOperation = 'source-over';
  },
  onDeath(e, w, info) {
    const b = e.parent;
    const a = b ? Math.atan2(e.y - b.y, e.x - b.x) : w.rng.angle();
    e.vx = Math.cos(a) * 320;
    e.vy = Math.sin(a) * 320;
    if (info?.source === 'parent') return;
    w.fx.explosion?.(e.x, e.y, 1.5, { palette: 'aether' });
    w.fx.shockwave?.(e.x, e.y, 200, COOL, 0.45);
    w.fx.flare?.(e.x, e.y, 140, '#e8ffff', 0.2);
    w.sfx('explode_medium', e.x, e.y);
    w.sfx('tesla_zap', e.x, e.y, { pitch: 0.7 });
    w.shake(0.3);
    w.hitstop(0.06);
    if (b?.alive) {
      w.fx.lightning?.(e.x, e.y, b.x, b.y, { color: COOL, width: 4, life: 0.35, branches: 3 });
      const left = livingSpheres(b).length;
      b.data.spheresAlive = left;
      if (left === 0) {
        w.announce('SHIELD DOWN', 'The core is exposed — pour it on!', { kind: 'warning', time: 1.8 });
        w.fx.shockwave?.(b.x, b.y, 320, COOL, 0.6);
        w.flash(COOL, 0.15);
        w.sfx('shield_block', b.x, b.y, { pitch: 0.6 });
        b.flash = 1;
      } else {
        w.floatText(e.x, e.y - 30, `CONDUCTOR DOWN · ${left} LEFT`, { color: COOL, size: 16, life: 1.3, crit: true });
      }
    }
  },
};

// ---- Boss def ---------------------------------------------------------------------------------

export default {
  id: 'stormEngine',
  name: 'The Storm Engine',
  title: 'Thunder Made Iron',
  boss: true,
  stage: 3,
  music: 'boss',
  hp: BASE_HP,
  r: 92,
  speed: 95,
  contactDamage: 26,
  mass: 60,
  xp: 70,
  cogs: 60,
  score: 6000,
  sprite: SE.base,
  scale: 1,
  alt: 1.5,
  layer: -1,
  manualMove: true,
  noSeparation: true,
  noKnockback: true,

  init(b, w) {
    const D = b.data;
    Object.assign(D, {
      t: 0,
      st: 0,
      state: 'enter',
      entering: true,
      armAng: 0,
      armSpd: 3,
      armSpdT: 3,
      armExt: 0.25,
      armExtT: 1,
      orbAng: 0,
      orbSpd: 0.55,
      orbR: 20,
      orbRT: ORBIT_R,
      cool: 1,
      dur: 0,
      charge: 0,
      magnet: 0,
      shieldHit: 0,
      shieldTxt: 0,
      fxT: 0,
      crackT: 1,
      ambT: 3,
      pruneT: 1,
      spinDir: 1,
      drift: 0.12,
      driftT: 8,
      sinceMagnet: 0,
      hz: [],
      spheres: [],
    });
    const hp = K.partHp(b, BASE_HP, SPHERE_HP);
    for (let i = 0; i < N_SPH; i++) {
      D.spheres.push(w.spawnEnemy(SPHERE_DEF, b.x, b.y, { parent: b, rawHp: hp, data: { i, cd: 2.5 + i * 1.1 } }));
    }
    D.spheresAlive = N_SPH;
    K.spawnTalker(
      w,
      b,
      (bb, out) => {
        out.x = bb.x;
        out.y = bb.y;
      },
      150
    );
    placeSpheres(b);
  },

  intro(b) {
    const D = b.data;
    D.state = 'enter';
    D.entering = true;
    D.st = 0;
    b.invuln = true;
  },

  update(b, dt, w) {
    const D = b.data;
    D.t += dt;
    D.st += dt;
    const p = K.targetPlayer(w, b);
    K.tickInvuln(b, dt);
    if (!D.entering) {
      const f = b.hp / b.maxHp;
      if (b.phase < 2 && f <= P3) enterPhase(b, w, 2);
      else if (b.phase < 1 && f <= P2) enterPhase(b, w, 1);
    }
    move(b, w, dt, p);
    D.armSpd += (D.armSpdT - D.armSpd) * Math.min(1, dt * 1.6);
    D.armAng += D.armSpd * dt;
    D.armExt += (D.armExtT - D.armExt) * Math.min(1, dt * 2.5);
    D.orbAng += D.orbSpd * dt;
    D.orbR += (D.orbRT - D.orbR) * Math.min(1, dt * 2.4);
    placeSpheres(b);
    D.spheresAlive = 0;
    for (const s of D.spheres) if (s.alive) D.spheresAlive++;
    runState(b, w, dt, p);
    if (!BUSY.has(D.state) && p) {
      D.orbCd = (D.orbCd ?? 2.4) - dt * b.fireRateMult;
      if (D.orbCd <= 0) {
        D.orbCd = [2.8, 2.3, 1.8][b.phase];
        fireOrbs(b, w, p);
      }
    }
    sphereFire(b, w, dt, p);
    damageFx(b, w, dt);
    overchargeFx(b, w, dt);
    D.shieldHit = Math.max(0, D.shieldHit - dt * 3);
    D.shieldTxt -= dt;
    D.pruneT -= dt;
    if (D.pruneT <= 0) {
      D.pruneT = 1;
      K.pruneHazards(b);
    }
  },

  /** Debug/test hook: force an attack ('hunt'|'ring'|'walk'|'scatter'|'beam'|'fence'|'magnet'). */
  debugAttack(b, w, kind) {
    const p = K.targetPlayer(w, b);
    if (!p || !b.alive) return false;
    K.cancelHazards(b);
    b.data.magnet = 0;
    startAttack(b, w, kind, p);
    return b.data.state;
  },

  modifyDamage(b, amt, info, w) {
    const D = b.data;
    if (D.spheresAlive > 0) {
      D.shieldHit = 1;
      if (D.shieldTxt <= 0) {
        D.shieldTxt = 1.8;
        w.floatText(b.x, b.y - 70, 'SHIELDED — DOWN THE SPHERES', { color: COOL, size: 13, life: 0.9 });
      }
      return amt * 0.5;
    }
    return amt;
  },

  draw(ctx, b, w) {
    const D = b.data;
    const x = b.x;
    const y = b.y;
    const s = b.scale;
    const a = b.alpha;
    const dead = !b.alive;
    const frame = dead || b.hp < b.maxHp * 0.5 ? 1 : 0;
    let arm = D.armAng;
    if (dead) {
      const td = w.time - (D.deadT ?? w.time);
      arm += (D.armSpd * (1 - Math.exp(-td * 1.4))) / 1.4;
    }
    const tilt = b.angle; // 0 in flight; the falling wreck tumbles
    arm += tilt;
    w.drawEnemySprite(ctx, b, SE.base, frame, tilt, x, y, s);
    Sprites.draw(ctx, SE.ring, x, y, -arm * 0.6, s, a);
    for (let k = 0; k < N_ARMS; k++) K.drawStretched(ctx, SE.arm, x, y, arm + (k * TAU) / N_ARMS, D.armExt * s, s, a);
    if (b.flash > 0) {
      for (let k = 0; k < N_ARMS; k++) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, b.flash) * 0.35 * a;
        ctx.globalCompositeOperation = 'lighter';
        K.drawStretched(ctx, SE.arm, x, y, arm + (k * TAU) / N_ARMS, D.armExt * s, s, 1);
        ctx.restore();
      }
    }
    const hot = D.charge > 0.25 || b.phase >= 2;
    if (!dead) {
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < N_ARMS; k++) {
        const aa = arm + (k * TAU) / N_ARMS;
        const r = ARM_TIP * D.armExt * s;
        const tx = x + Math.cos(aa) * r;
        const ty = y + Math.sin(aa) * r;
        const sz = 0.32 + 0.45 * D.charge + 0.06 * Math.sin(D.t * 11 + k);
        Sprites.draw(ctx, hot ? SE.glowHot : SE.glow, tx, ty, 0, sz * s, 0.75 * a);
        if (D.charge > 0.5 && Math.random() < 0.5) Sprites.draw(ctx, SE.flare, tx, ty, Math.random() * TAU, 0.5 + D.charge * 0.4, 0.8 * a);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    w.drawEnemySprite(ctx, b, SE.dome, frame, arm, x, y, s);
    if (dead) {
      Sprites.drawTint(ctx, SE.base, x, y, tilt, s, '#140c08', 0.5 * a, frame);
      Sprites.drawTint(ctx, SE.dome, x, y, arm, s, '#140c08', 0.5 * a, frame);
      if (Math.random() < 0.5) {
        const r = Math.random() * TAU;
        ctx.globalCompositeOperation = 'lighter';
        K.zap(ctx, x, y, x + Math.cos(r) * 120 * s, y + Math.sin(r) * 120 * s, COOL, 2, 10, a);
      }
      return;
    }
    // Core glow.
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.55 + 0.12 * Math.sin(D.t * 6) + D.charge * 0.35 + D.magnet * 0.3;
    Sprites.draw(ctx, SE.glow, x, y, 0, pulse * s, 0.85 * a);
    if (hot || D.magnet > 0) Sprites.draw(ctx, SE.glowHot, x, y, 0, (0.4 + D.magnet * 0.5) * s, 0.6 * a);
    // Shield: arcs from each living sphere + a ring around the core.
    if (D.spheresAlive > 0) {
      for (const sp of D.spheres) {
        if (!sp.alive || Math.random() < 0.2) continue;
        const ang = Math.atan2(sp.y - y, sp.x - x);
        K.zap(ctx, sp.x - Math.cos(ang) * 22, sp.y - Math.sin(ang) * 22, x + Math.cos(ang) * 34, y + Math.sin(ang) * 34, COOL, 2, 9, 0.45 + 0.4 * D.shieldHit);
      }
      ctx.globalAlpha = (0.14 + 0.45 * D.shieldHit) * a;
      ctx.strokeStyle = COOL;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(x, y, 104 * s, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = (0.3 + 0.4 * D.shieldHit) * a;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([16, 10]);
      ctx.lineDashOffset = -D.t * 40;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Magnetic field: contracting rings.
    if (D.magnet > 0) {
      ctx.strokeStyle = VIOLET;
      ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        const r = 520 - ((D.t * 240 + i * 130) % 420);
        ctx.globalAlpha = D.magnet * 0.35 * Math.min(1, (r - 100) / 120) * a;
        if (r <= 100) continue;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  },

  drawShadow(ctx, b, w, ox, oy) {
    const D = b.data;
    const k = b.alive ? 1 : 0.6;
    Sprites.drawShadow(ctx, SE.base, b.x + ox, b.y + oy, 0, b.scale * k, 0.28 * b.alpha, 0, 5);
    ctx.globalAlpha = 0.22 * b.alpha;
    ctx.fillStyle = '#000';
    for (let i = 0; i < N_ARMS; i++) {
      const aa = D.armAng + (i * TAU) / N_ARMS;
      ctx.save();
      ctx.translate(b.x + ox * 1.05, b.y + oy * 1.05);
      ctx.rotate(aa);
      ctx.fillRect(40, -10, (ARM_TIP - 34) * D.armExt * b.scale, 20);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },

  /** Drawn by the talker part above every enemy: magnet tethers + overcharge screen crackle. */
  drawOverlay(ctx, b, w) {
    const D = b.data;
    ctx.globalCompositeOperation = 'lighter';
    if (D.magnet > 0) {
      for (const p of w.players) {
        if (p.alive) K.zap(ctx, p.x, p.y, b.x, b.y, VIOLET, 1.6, 14, 0.35 * D.magnet);
      }
    }
    if (b.phase >= 2) {
      const v = w.renderer.viewRect(-8, _v);
      const amt = w.reducedFlash ? 0.22 : 0.55;
      for (let i = 0; i < 2; i++) {
        if (Math.random() > 0.3) continue;
        const side = (Math.random() * 4) | 0;
        const len = 160 + Math.random() * 260;
        const tt = Math.random();
        let x1;
        let y1;
        let x2;
        let y2;
        if (side < 2) {
          const yy = side === 0 ? v.y0 : v.y1;
          x1 = v.x0 + tt * (v.x1 - v.x0 - len);
          x2 = x1 + len;
          y1 = y2 = yy;
        } else {
          const xx = side === 2 ? v.x0 : v.x1;
          y1 = v.y0 + tt * (v.y1 - v.y0 - len);
          y2 = y1 + len;
          x1 = x2 = xx;
        }
        K.zap(ctx, x1, y1, x2, y2, VIOLET, 2, 12, amt);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  },

  onDeath(b, w) {
    const D = b.data;
    D.deadT = w.time;
    K.cancelHazards(b);
    K.restoreWeather(b, w);
    K.sayTaunt(b, w, 'death', undefined, 5);
    b.vx *= 0.15;
    b.vy *= 0.15;
    w.slowmo(0.3, 2.1);
    w.flash('#dff8ff', 0.35);
    w.fx.shockwave?.(b.x, b.y, 640, COOL, 0.8);
    for (let i = 0; i < 10; i++) {
      const a = (i * TAU) / 10 + w.rng.next() * 0.3;
      const r = 260 + w.rng.next() * 260;
      w.fx.lightning?.(b.x, b.y, b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, { color: i % 2 ? COOL : VIOLET, width: 3, life: 0.4, branches: 3 });
    }
    // Layered overload: each coil detonates in turn under its own lightning strike.
    for (let i = 0; i < 8; i++) {
      w.after(0.12 + i * 0.22, () => {
        const k = i % N_ARMS;
        const td = w.time - D.deadT;
        const ang = D.armAng + (D.armSpd * (1 - Math.exp(-td * 1.4))) / 1.4 + (k * TAU) / N_ARMS;
        const r = ARM_TIP * D.armExt * (i < 4 ? 1 : 0.55);
        const x = b.x + Math.cos(ang) * r;
        const y = b.y + Math.sin(ang) * r;
        w.weather?.strike?.(x, y, { flash: 0.25, vol: 0.5, sound: i % 2 === 0, width: 1.4 });
        w.fx.bigExplosion?.(x, y, 0.9, { palette: i % 2 ? 'aether' : undefined });
        w.fx.lightning?.(b.x, b.y, x, y, { color: COOL, width: 3.5, life: 0.3, branches: 2 });
        w.fx.cogs?.(x, y, 6, { speed: 380 });
        w.sfx('explode_large', x, y, { vol: 0.8 });
        w.shake(0.32);
      });
    }
    w.after(1.95, () => {
      w.fx.ring?.(b.x, b.y, 24, '#e8ffff', 0.3, { r0: 420, width: 8 });
      w.fx.cogs?.(b.x, b.y, 26, { speed: 520 });
      w.fx.sparks?.(b.x, b.y, 0, 30, COOL, TAU, { speed: 760 });
    });
  },
};
