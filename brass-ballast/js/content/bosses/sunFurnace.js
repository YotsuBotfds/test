// THE SUN FURNACE — Heart of the Syndicate (WP16, stage-5 final boss). DESIGN §2.11, §4.4.
//
// A colossal molten sphere in an equatorial gantry, armoured by 7 rotating "orange-peel" plates.
//   Phase 1 (100–65%): the shell turns; plates BLOCK player shots (shoot through the slits).
//                      Slag spirals from the slits, sweeping flame jets, aimed fans, vent cycles
//                      (plates part → bonus damage window).
//   Phase 2 (65–30%):  the shell is blown off in a staged sequence; the caged core is exposed but
//                      patterns speed up: double helix, ember rain, geysers, cross jets, homing
//                      globs from the crucible arms, elite escorts.
//   Phase 3 (<30%):    desperation — white-hot core, corona bullet hell with safe lanes, a heat
//                      dome that shrinks and orbits (forces movement), and the telegraphed
//                      SUPERNOVA (shelter in the coolant plume or boost through the wave).
//   Death:             ~1.7 s meltdown → engine boss death; our onDeath layers an implosion, a
//                      white-out, slow-mo and a cog storm on top. The engine/director then ends the
//                      campaign (stage 5 boss down → victory).
//
// Shot blocking: before projectiles move each frame we sweep every player shot's next step
// against the plate arcs (precise, works for piercing lances, ignores lobbed mortars). Blocked
// shots die on the plate with sparks and a 'hit_armor' ping. Non-projectile damage (explosions,
// tesla, burn) is halved while the shell is closed.
//
// Files: sunFurnace-art.js (sprites + geometry), sunFurnace-render.js (draw),
//        sunFurnace-attacks.js (patterns + hazards), this file (state machine).

import { bossHp } from './tuning.js';
import { Save } from '../../core/storage.js';
import { ENEMIES } from '../enemies/index.js';
import { GEO } from './sunFurnace-art.js';
import { drawFurnace, drawFurnaceShadow } from './sunFurnace-render.js';
import { sayTaunt, spawnTalker } from './stormEngine-kit.js';
import { ATTACKS, PLANS, clearHazards, sfx } from './sunFurnace-attacks.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => a - Math.round(a / TAU) * TAU;
const approach = (v, t, step) => (v < t ? Math.min(t, v + step) : Math.max(t, v - step));

const P2_AT = 0.65;
const P3_AT = 0.3;
const SHELL_SPLASH = 0.4; // non-projectile damage multiplier while the shell is closed
const NOVA_AT = 0.15; // the climactic supernova is forced once when phase 3 crosses this
const VENT_BONUS = 1.25;
const VENTED_BONUS = 1.4;
const ESCORTS = ['ornithopter', 'steamWraith', 'frigate', 'clockWasp', 'gunboat'];
const MAX_ESCORTS_ALIVE = 2;
const MAX_ESCORTS_TOTAL = 8;
const INTRO_TIME = 3.2;
const DYING_TIME = 1.7;
const ELLIPSE_X = 500; // preferred station around the player (world units)
const ELLIPSE_Y = 330;
const FIGHT_ZOOM = 0.8; // def.zoom: camera base zoom while the colossus is up (default 0.88)

// ---- taunts --------------------------------------------------------------------------------

/** Taunts go to the shared comms panel (spawnTalker in init). Returns the line said. */
function taunt(b, w, kind, i, time) {
  return sayTaunt(b, w, kind, i, time);
}

// ---- lifecycle -----------------------------------------------------------------------------

function init(b) {
  const d = b.data;
  d.hz = [];
  d.plates = [];
  for (let i = 0; i < GEO.PLATES; i++) d.plates.push({ off: i * GEO.STEP, alive: true, flash: 0 });
  d.shellUp = true;
  d.shellAngle = 0;
  d.shellSpin = 0;
  d.spinTarget = 0.42;
  d.plateScale = 1;
  d.vent = 0;
  d.ventTarget = 0;
  d.plateHeat = 0;
  d.cageAngle = 0;
  d.cageSpin = 0.12;
  d.cageSpinTarget = 0.12;
  d.coreRot = 0;
  d.heat = 0;
  d.heatTarget = 0;
  d.alarm = 0;
  d.vented = 0;
  d.novaCharge = 0;
  d.arms = GEO.ARMS.map(() => ({ swing: 0, swingTarget: 0, charge: 0, chargeTarget: 0, gone: false }));
  d.chimneyKick = [0, 0, 0];
  d.debris = [];
  d.atk = null;
  d.rest = 1.2;
  d.plan = [0, 0, 0];
  d.intro = INTRO_TIME;
  d.transition = null;
  d.dying = null;
  d.escorts = [];
  d.escortsSpawned = 0;
  d.escortT = 0;
  d.pingT = 0;
  d.hintT = 0;
  d.fxT = 0;
  d.midTaunt = false;
  d.lastHit = null;
  b.invuln = true;
}

function intro(b, w) {
  const d = b.data;
  d.intro = INTRO_TIME;
  b.invuln = true;
  w.after(2.4, () => {
    if (b.alive) taunt(b, w, 'intro');
  });
}

// ---- movement ------------------------------------------------------------------------------

function move(b, dt, w) {
  const d = b.data;
  const p = w.nearestPlayer(b.x, b.y);
  let tx = b.x;
  let ty = b.y;
  let maxSp = 0;
  if (p && !d.anchored && !d.dying) {
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (d.intro > 0) {
      // Sweep down into its station beside the player (clear of the HUD's top plaques).
      d.introSide ??= b.x >= p.x ? 1 : -1;
      tx = p.x + d.introSide * ELLIPSE_X * 0.95;
      ty = p.y - 110;
      maxSp = 300;
    } else {
      // Hold station on a screen-shaped ellipse around the player (wide, short), so the
      // colossus stays framed however the player kites; the bearing drifts with the player.
      let th = Math.atan2(dy / ELLIPSE_Y, dx / ELLIPSE_X);
      // Ease round toward the wide sides of the screen, where the whole colossus fits in view.
      const sn = Math.sin(th);
      if (Math.abs(sn) > 0.45) th += (Math.cos(th) >= 0 ? -1 : 1) * Math.sign(sn) * 0.5;
      const k = 1 - 0.06 * b.phase;
      tx = p.x + Math.cos(th) * ELLIPSE_X * k;
      ty = p.y + Math.sin(th) * ELLIPSE_Y * k;
      const off = Math.hypot(tx - b.x, ty - b.y);
      // Only chase when the player pulls away; never shove into a player who closes in.
      const outside = Math.hypot(dx / (ELLIPSE_X * k), dy / (ELLIPSE_Y * k)) > 1.02;
      maxSp = dist > 1100 ? 300 : outside && off > 260 ? 120 : 52;
    }
  }
  const ddx = tx - b.x;
  const ddy = ty - b.y;
  const dd = Math.hypot(ddx, ddy);
  let wantVx = 0;
  let wantVy = 0;
  if (dd > 4 && maxSp > 0) {
    const sp = Math.min(maxSp, dd * 1.2) * (b.speedMult || 1);
    wantVx = (ddx / dd) * sp;
    wantVy = (ddy / dd) * sp;
  }
  const k = 1 - Math.exp(-2.2 * dt);
  b.vx += (wantVx - b.vx) * k;
  b.vy += (wantVy - b.vy) * k;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
}

// ---- shell: spin, vents and shot blocking --------------------------------------------------

function plateAt(d, a, pad) {
  const half = GEO.PLATE_HALF * d.plateScale + pad;
  for (let i = 0; i < d.plates.length; i++) {
    const pl = d.plates[i];
    if (!pl.alive) continue;
    if (Math.abs(wrap(a - d.shellAngle - pl.off)) <= half) return pl;
  }
  return null;
}

/**
 * Sweep each player shot's coming step against the plate arcs. The first point where a shot
 * would touch the sphere decides: plate → destroyed with a clank, slit → let through to the core.
 */
function blockShots(b, dt, w) {
  const d = b.data;
  const list = w.pBullets;
  const R = GEO.R * b.scale;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!p.alive || p.dead || p.lob || p.hitEnemies === false) continue;
    const pr = (p.r || 4) * (p.scale || 1);
    const reach = R + pr + 2;
    const dx = p.x - b.x;
    const dy = p.y - b.y;
    const sx = (p.vx || 0) * dt;
    const sy = (p.vy || 0) * dt;
    const step = Math.hypot(sx, sy);
    if (dx * dx + dy * dy > (reach + step + 4) ** 2) continue;
    const n = Math.max(1, Math.ceil(step / 8));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const px = dx + sx * t;
      const py = dy + sy * t;
      const rr = Math.hypot(px, py);
      if (rr > reach) continue;
      const a = Math.atan2(py, px);
      const pl = plateAt(d, a, (pr * 0.6) / Math.max(20, rr));
      if (pl) deflect(b, w, p, pl, b.x + px, b.y + py, a);
      break;
    }
  }
}

function deflect(b, w, p, pl, x, y, a) {
  const d = b.data;
  p.kill(!!p.explode);
  pl.flash = 1;
  d.blocked = (d.blocked || 0) + 1;
  w.fx.sparks?.(x, y, a, 3, '#ffe2b0', 1.3);
  if (d.pingT <= 0) {
    d.pingT = 0.07;
    w.sfx('hit_armor', x, y, { vol: 0.45, pitch: 0.85 + Math.random() * 0.3 });
    w.fx.hitSpark?.(x, y, a, false);
  }
  if (d.hintT <= 0) {
    d.hintT = 7;
    w.floatText(x, y - 24, 'ARMORED — AIM FOR THE GAPS!', { color: '#cfd6de', size: 15, life: 1.4, callout: true });
  }
}

// ---- phase transitions ---------------------------------------------------------------------

function cancelAttack(b, w) {
  const d = b.data;
  if (d.atk) {
    ATTACKS[d.atk.name]?.end?.(b, d.atk, w);
    d.atk = null;
  }
  clearHazards(b);
  d.lanes = null;
  d.novaCharge = 0;
  d.anchored = false;
  d.ventTarget = 0;
  for (const arm of d.arms) {
    arm.chargeTarget = 0;
    arm.swingTarget = 0;
  }
}

function startShatter(b, w) {
  const d = b.data;
  cancelAttack(b, w);
  d.transition = { kind: 'shatter', t: 0, next: 0, popped: 0, order: shuffled(w, GEO.PLATES) };
  b.invuln = true;
  w.clearEnemyBullets(b.x, b.y, Infinity, true);
  const line = taunt(b, w, 'phase', 0);
  w.bossPhase(b, 1, { text: 'The Shell Breaks!', sub: line || 'Her heart is exposed' });
  d.spinTarget = 2.6 * Math.sign(d.spinTarget || 1);
  d.alarm = 1;
}

function shuffled(w, n) {
  const a = [];
  for (let i = 0; i < n; i++) a.push(i);
  for (let i = n - 1; i > 0; i--) {
    const j = (w.rng.next() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function updateShatter(b, tr, dt, w) {
  const d = b.data;
  d.plateHeat = clamp(tr.t / 1.4, 0, 1);
  w.shake(0.05 + 0.12 * d.plateHeat);
  // Grinding sparks along the rim as the shell over-spins.
  if (Math.random() < 0.6) {
    const a = Math.random() * TAU;
    const R = GEO.R * b.scale;
    w.fx.sparks?.(b.x + Math.cos(a) * R, b.y + Math.sin(a) * R, a + Math.PI / 2 * Math.sign(d.shellSpin), 2, '#ffd27a', 0.5);
  }
  if (tr.t > 0.4) sfx(b, w, 'hit_armor', 0.11, { vol: 0.5, pitch: 0.6 + Math.random() * 0.3 });
  if (tr.t >= 1.5 && tr.popped < GEO.PLATES && tr.t >= tr.next) {
    popPlate(b, w, d.plates[tr.order[tr.popped]]);
    tr.popped++;
    tr.next = tr.t + 0.19;
  }
  if (tr.popped >= GEO.PLATES && tr.t >= tr.next + 0.45 && !tr.done) {
    tr.done = true;
    d.shellUp = false;
    d.plateHeat = 0;
    d.spinTarget = 0;
    d.shellSpin = 0;
    b.r = GEO.R - 12;
    b.invuln = false;
    const R = GEO.R * b.scale;
    w.fx.shockwave?.(b.x, b.y, 640, '#ffd9a0', 0.8);
    w.fx.flare?.(b.x, b.y, 520, '#fff3c4', 0.35);
    w.flash('#ffd9a0', 0.35);
    w.sfx('boss_roar', b.x, b.y);
    w.sfx('explode_large', b.x, b.y);
    w.shake(0.7);
    w.zoomPunch(0.08);
    shove(w, b, R + 360, 520);
    d.transition = null;
    d.rest = 1.4;
    d.escortT = 16;
    w.after(1.2, () => {
      if (b.alive && !b.data.dying) summonEscorts(b, w, 2);
    });
  }
}

function popPlate(b, w, pl) {
  const d = b.data;
  if (!pl || !pl.alive) return;
  pl.alive = false;
  const a = d.shellAngle + pl.off;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const R = GEO.R * b.scale;
  const cx = b.x + c * R * 0.62;
  const cy = b.y + s * R * 0.62;
  const sp = 300 + w.rng.next() * 160;
  const tang = d.shellSpin * R * 0.6;
  d.debris.push({
    sprite: 'boss_sunFurnace_plate',
    frame: 1,
    x: cx,
    y: cy,
    vx: c * sp - s * tang,
    vy: s * sp + c * tang,
    angle: a,
    spin: (w.rng.next() - 0.5) * 7,
    t: 0,
    life: 2.1,
    scale: b.scale,
    pivot: GEO.R * 0.62,
    smokeT: 0,
  });
  const rx = b.x + c * R;
  const ry = b.y + s * R;
  w.fx.explosion?.(rx, ry, 1.5, { debris: 'metal' });
  w.fx.debris?.(rx, ry, 8, 'metal', { angle: a, spread: 1.2, speed: 380 });
  w.fx.sparks?.(rx, ry, a, 14, '#ffd27a', 1.4, { speed: 520 });
  w.sfx('explode_large', rx, ry, { vol: 0.85, pitch: 0.9 + w.rng.next() * 0.2 });
  w.shake(0.32);
  w.hitstop(0.03);
  w.flash('#ffb060', 0.12);
}

/** Push players outward (no damage) — transitions shouldn't leave anyone inside the furnace. */
function shove(w, b, radius, force) {
  for (const p of w.players) {
    if (!p.alive) continue;
    const dx = p.x - b.x;
    const dy = p.y - b.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > radius) continue;
    const k = force * (1 - d / radius) + 120;
    p.vx += (dx / d) * k;
    p.vy += (dy / d) * k;
  }
}

function startOverheat(b, w) {
  const d = b.data;
  cancelAttack(b, w);
  d.transition = { kind: 'overheat', t: 0 };
  b.invuln = true;
  w.clearEnemyBullets(b.x, b.y, Infinity, true);
  const line = taunt(b, w, 'phase', 2);
  w.bossPhase(b, 2, { text: 'Desperation Pattern!', sub: line || 'The core is going critical' });
  w.sfx('boss_warning', b.x, b.y);
  d.heatTarget = 1;
  d.alarm = 1;
}

function updateOverheat(b, tr, dt, w) {
  const d = b.data;
  w.shake(0.04 + 0.18 * clamp(tr.t / 1.8, 0, 1));
  if (Math.random() < 0.5) w.fx.embers?.(b.x + (Math.random() - 0.5) * 200, b.y + (Math.random() - 0.5) * 200, 2, { speed: 220 });
  if (tr.t >= 1.9 && !tr.done) {
    tr.done = true;
    w.fx.shockwave?.(b.x, b.y, 820, '#fff3c4', 0.9);
    w.fx.flare?.(b.x, b.y, 640, '#ffffff', 0.4);
    w.flash('#fff0d0', 0.45);
    w.sfx('explode_huge', b.x, b.y);
    w.sfx('boss_roar', b.x, b.y, { pitch: 0.85 });
    w.shake(0.8);
    w.zoomPunch(0.1);
    shove(w, b, GEO.R + 420, 600);
    b.invuln = false;
    d.transition = null;
    d.rest = 1.0;
  }
}

// ---- escorts -------------------------------------------------------------------------------

function escortPool() {
  return ESCORTS.filter((id) => ENEMIES[id]);
}

function summonEscorts(b, w, n) {
  const d = b.data;
  const pool = escortPool();
  if (!pool.length) return;
  for (let i = 0; i < n && d.escortsSpawned < MAX_ESCORTS_TOTAL; i++) {
    const id = pool[(w.rng.next() * pool.length) | 0];
    const a = GEO.CHIMNEYS[(d.escortsSpawned + i) % GEO.CHIMNEYS.length];
    const x = b.x + Math.cos(a) * (GEO.CHIMNEY_R + 40) * b.scale;
    const y = b.y + Math.sin(a) * (GEO.CHIMNEY_R + 40) * b.scale;
    const e = w.spawnEnemy(id, x, y, { elite: true, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160 });
    if (!e) continue;
    d.escorts.push(e);
    d.escortsSpawned++;
    w.fx.flare?.(x, y, 120, '#ffe08a', 0.25);
    w.fx.smoke?.(x, y, 1.6, { dark: true, count: 4 });
  }
  w.floatText(b.x, b.y - GEO.R - 70, 'ELITE ESCORTS LAUNCHED!', { color: '#ffcf4a', size: 18, life: 1.6, callout: true });
  w.sfx('carrier_launch', b.x, b.y);
}

function updateEscorts(b, dt, w) {
  const d = b.data;
  d.escorts = d.escorts.filter((e) => e.alive);
  if (b.phase < 1) return;
  d.escortT -= dt;
  if (d.escortT <= 0) {
    d.escortT = 17;
    if (d.escorts.length < MAX_ESCORTS_ALIVE && d.escortsSpawned < MAX_ESCORTS_TOTAL) summonEscorts(b, w, 1);
  }
}

// ---- attack scheduler ----------------------------------------------------------------------

function updateAttacks(b, dt, w) {
  const d = b.data;
  if (d.atk) {
    const a = d.atk;
    a.t += dt;
    const A = ATTACKS[a.name];
    if (A.update(b, a, dt, w)) {
      A.end?.(b, a, w);
      d.atk = null;
      d.rest = (A.rest ?? 1) * (b.phase === 2 ? 0.85 : 1);
      // The shell occasionally reverses its spin between patterns (grinding clank).
      if (d.shellUp && w.rng.next() < 0.35) {
        d.spinTarget = -d.spinTarget;
        sfx(b, w, 'hit_armor', 0.2, { vol: 0.7, pitch: 0.5 });
      }
    }
    return;
  }
  d.rest -= dt;
  if (d.rest > 0) return;
  const phase = clamp(b.phase | 0, 0, 2);
  const plan = PLANS[phase];
  let name = plan[d.plan[phase] % plan.length];
  d.plan[phase]++;
  // Phase 3 opens with the corona and guarantees an early supernova.
  if (!ATTACKS[name]) name = plan[0];
  const a = { name, t: 0 };
  d.atk = a;
  ATTACKS[name].start(b, a, w);
}

// ---- ambience ------------------------------------------------------------------------------

function ambience(b, dt, w) {
  const d = b.data;
  d.fxT -= dt;
  if (d.fxT > 0) return;
  d.fxT = 0.09;
  const i = (w.rng.next() * GEO.CHIMNEYS.length) | 0;
  const a = GEO.CHIMNEYS[i];
  const cx = b.x + Math.cos(a) * GEO.CHIMNEY_R * b.scale;
  const cy = b.y + Math.sin(a) * GEO.CHIMNEY_R * b.scale;
  w.fx.smoke?.(cx, cy, 1.3 + d.heat * 0.6, { dark: true, count: 1, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30 - 10 });
  if (w.rng.next() < 0.35) w.fx.embers?.(cx, cy, 1, { speed: 60 });
  if (!d.shellUp && w.rng.next() < 0.5 + d.heat * 0.5) {
    const ea = w.rng.angle();
    const r = GEO.R * (0.3 + 0.7 * w.rng.next());
    w.fx.embers?.(b.x + Math.cos(ea) * r, b.y + Math.sin(ea) * r, 1 + (d.heat > 0.5 ? 1 : 0), { speed: 90 });
  }
  if (d.vented > 0) w.fx.steam?.(b.x + (w.rng.next() - 0.5) * 160, b.y + (w.rng.next() - 0.5) * 160, w.rng.angle(), 1.4, { count: 1 });
}

function updateDebris(b, dt, w) {
  const L = b.data.debris;
  for (let i = L.length - 1; i >= 0; i--) {
    const p = L[i];
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const k = Math.exp(-1.1 * dt);
    p.vx *= k;
    p.vy *= k;
    p.angle += p.spin * dt;
    p.smokeT -= dt;
    if (p.smokeT <= 0) {
      p.smokeT = 0.06;
      w.fx.smokeTrail?.(p.x, p.y, 1.4, { fire: true });
    }
    if (p.t >= p.life) {
      w.fx.explosion?.(p.x, p.y, 0.7, { debris: 'metal', cogs: 0 });
      L[i] = L[L.length - 1];
      L.pop();
    }
  }
}

function animate(b, dt) {
  const d = b.data;
  d.shellSpin = approach(d.shellSpin, d.spinTarget, dt * (d.transition ? 1.6 : 0.6));
  d.shellAngle += d.shellSpin * dt;
  d.cageSpin = approach(d.cageSpin, d.cageSpinTarget, dt * 0.5);
  d.cageAngle += d.cageSpin * dt;
  d.coreRot += dt * 0.05;
  d.vent = approach(d.vent, d.ventTarget, dt * 2.2);
  d.plateScale = 1 - 0.38 * d.vent;
  d.heat = approach(d.heat, d.heatTarget, dt * 0.55);
  d.alarm = Math.max(0, d.alarm - dt * 0.45);
  if (d.vented > 0) d.vented -= dt;
  for (const pl of d.plates) if (pl.flash > 0) pl.flash -= dt * 7;
  for (let i = 0; i < d.chimneyKick.length; i++) d.chimneyKick[i] = Math.max(0, d.chimneyKick[i] - dt * 2.5);
  for (const arm of d.arms) {
    arm.swing = approach(arm.swing, arm.swingTarget, dt * 2.2);
    arm.charge = approach(arm.charge, arm.chargeTarget, dt * 1.6);
  }
  d.pingT -= dt;
  d.hintT -= dt;
}

// ---- death ---------------------------------------------------------------------------------

function startDying(b, w) {
  const d = b.data;
  d.dying.started = true;
  cancelAttack(b, w);
  b.invuln = true;
  w.clearEnemyBullets(b.x, b.y, Infinity, true);
  for (const e of d.escorts) if (e.alive) e.fleeing = true;
  w.announce?.('CORE MELTDOWN', 'The Heart of the Syndicate is failing!', { kind: 'warning', time: 1.8 });
  w.sfx('boss_phase', b.x, b.y, { pitch: 0.7 });
  w.sfx('boss_warning', b.x, b.y, { vol: 0.7 });
  w.slowmo(0.65, 1.2);
  d.heatTarget = 1;
  d.alarm = 1;
}

function updateDying(b, dt, w) {
  const d = b.data;
  const D = d.dying;
  if (!D.started) startDying(b, w);
  D.t += dt;
  D.boomT = (D.boomT ?? 0) - dt;
  const k = clamp(D.t / D.dur, 0, 1);
  w.shake(0.1 + 0.35 * k);
  if (D.boomT <= 0) {
    D.boomT = 0.16 - 0.08 * k;
    const a = w.rng.angle();
    const r = GEO.R * (0.6 + w.rng.next() * 0.7) * b.scale;
    const x = b.x + Math.cos(a) * r;
    const y = b.y + Math.sin(a) * r;
    w.fx.explosion?.(x, y, 0.8 + w.rng.next() * 0.7, { debris: 'metal' });
    w.sfx('explode_medium', x, y, { vol: 0.7 });
    // Fire spurts out of the failing core.
    const sa = w.rng.angle();
    w.fx.sparks?.(b.x + Math.cos(sa) * GEO.R * 0.8, b.y + Math.sin(sa) * GEO.R * 0.8, sa, 10, '#ffe2a0', 0.4, { speed: 640 });
  }
  // Arms tear loose one by one.
  for (let i = 0; i < d.arms.length; i++) {
    const arm = d.arms[i];
    if (arm.gone || D.t < 0.35 + i * 0.4) continue;
    arm.gone = true;
    const a = GEO.ARMS[i] + arm.swing;
    const x = b.x + Math.cos(GEO.ARMS[i]) * GEO.ARM_R * b.scale;
    const y = b.y + Math.sin(GEO.ARMS[i]) * GEO.ARM_R * b.scale;
    d.debris.push({ sprite: 'boss_sunFurnace_arm', frame: 0, x, y, vx: Math.cos(a) * 340, vy: Math.sin(a) * 340, angle: a, spin: (w.rng.next() - 0.5) * 6, t: 0, life: 1.9, scale: b.scale, smokeT: 0 });
    w.fx.explosion?.(x, y, 1.2, { debris: 'metal' });
    w.sfx('explode_large', x, y, { vol: 0.8 });
  }
  for (let i = 0; i < d.chimneyKick.length; i++) d.chimneyKick[i] = Math.max(d.chimneyKick[i], 0.5 + 0.5 * Math.sin(D.t * 20 + i));
  if (D.t >= D.dur && b.alive) {
    b.invuln = false;
    w.killEnemy(b, { source: 'meltdown', owner: d.lastHit || null });
  }
}

function onDeath(b, w) {
  const d = b.data;
  d.deathAt = w.time;
  d.novaCharge = 0;
  d.lanes = null;
  clearHazards(b);
  taunt(b, w, 'death', undefined, 5);
  // The dead boss gets no more updates; a harmless hazard keeps its flying debris moving.
  if (d.debris.length) {
    w.addHazard({ x: b.x, y: b.y, r: 1, team: 'player', damage: 0, life: 2.4, update: (h, dt, wd) => updateDebris(b, dt, wd), draw: () => {} });
  }
  const x = b.x;
  const y = b.y;
  const reduced = Save.settings?.flashes === false;
  // Implosion (0 → 2.2 s): rings and light collapse into the core.
  for (let i = 0; i < 4; i++) {
    w.after(0.1 + i * 0.45, () => {
      w.fx.ring?.(x, y, 30, '#fff3c4', 0.7, { r0: 760 - i * 90, width: 8 - i });
      w.sfx('thunder', x, y, { vol: 0.5, pitch: 0.5 + i * 0.12 });
    });
  }
  const pulls = 26;
  for (let i = 0; i < pulls; i++) {
    w.after(0.05 + (i / pulls) * 2, () => {
      const P = w.particles;
      for (let k = 0; k < 4; k++) {
        const a = Math.random() * TAU;
        const r = 420 + Math.random() * 380;
        const sp = 700;
        P.spawn({
          x: x + Math.cos(a) * r,
          y: y + Math.sin(a) * r,
          vx: -Math.cos(a) * sp,
          vy: -Math.sin(a) * sp,
          life: r / sp,
          size: 6,
          size1: 2,
          color: '#ffffff',
          color1: '#ffb04a',
          alpha: 1,
          blend: 'add',
          tex: 'streak',
          stretch: 0.06,
          align: true,
        });
      }
    });
  }
  // Detonation, layered on the engine's big blast (2.25 s).
  w.after(2.28, () => {
    w.flash('#ffffff', reduced ? 0.15 : 0.6);
    w.fx.flare?.(x, y, reduced ? 700 : 2600, '#ffffff', reduced ? 0.4 : 0.9);
    w.fx.flare?.(x, y, 900, '#ffe08a', 0.6);
    w.fx.shockwave?.(x, y, 1500, '#fff3c4', 1.6);
    w.fx.shockwave?.(x, y, 900, '#ffb04a', 1.1);
    w.fx.bigExplosion?.(x, y, 2.4);
    w.fx.embers?.(x, y, 60, { speed: 900 });
    w.fx.debris?.(x, y, 30, 'metal', { speed: 700, scale: 1.5 });
    w.fx.cogs?.(x, y, 50, { speed: 820, scale: 1.4 });
    w.sfx('explode_huge', x, y);
    w.sfx('boss_roar', x, y, { pitch: 0.6, vol: 0.8 });
    w.slowmo(0.25, 1.4);
    w.shake(1);
    w.hitstop(0.15);
    w.zoomPunch(-0.14);
  });
  for (let i = 1; i <= 3; i++) {
    w.after(2.28 + i * 0.22, () => {
      w.fx.cogs?.(x, y, 30, { speed: 520 + i * 120, scale: 1.2 });
      w.fx.ring?.(x, y, 700 + i * 220, '#ffe08a', 0.8, { r0: 80, width: 5 });
    });
  }
}

// ---- def -----------------------------------------------------------------------------------

/** @type {any} */
const SUN_FURNACE = {
  id: 'sunFurnace',
  name: 'The Sun Furnace',
  title: 'Heart of the Syndicate',
  boss: true,
  stage: 5,
  music: 'finalBoss',
  zoom: FIGHT_ZOOM, // camera base zoom for the fight (engine onBossSpawn reads def.zoom)
  frameR: 190, // camera boss-framing radius: sphere + gantry ring
  hp: bossHp('sunFurnace', 7500), // DESIGN 7500 × campaign toughness (tuning.js)
  r: GEO.R,
  speed: 46,
  contactDamage: 24,
  mass: 100,
  xp: 180,
  cogs: 150,
  score: 30000,
  sprite: 'boss_sunFurnace',
  alt: 1.6,
  manualMove: true,
  noSeparation: true,
  noKnockback: true,
  noRecycle: true,
  noElite: true,
  immune: { slow: true },
  /** HUD boss-bar markers: shell breaks, desperation, forced supernova. */
  hudPhases: [P2_AT, P3_AT, NOVA_AT],

  init(b, w) {
    init(b);
    spawnTalker(w, b);
  },

  intro(b, w) {
    intro(b, w);
  },

  update(b, dt, w) {
    const d = b.data;
    if (d.dying) {
      animate(b, dt);
      updateDebris(b, dt, w);
      updateDying(b, dt, w);
      return;
    }
    animate(b, dt);
    move(b, dt, w);
    updateDebris(b, dt, w);
    ambience(b, dt, w);
    if (d.shellUp) blockShots(b, dt, w);
    if (d.intro > 0) {
      d.intro -= dt;
      if (d.intro <= 0) {
        b.invuln = false;
        w.sfx('steam_vent', b.x, b.y, { pitch: 0.5 });
        w.fx.steamBurst?.(b.x, b.y, 3, 24);
      }
      return;
    }
    // Phase gates (sequential, so forcing hp low via the console still plays every transition).
    if (!d.transition) {
      if (b.phase === 0 && b.hp <= b.maxHp * P2_AT) startShatter(b, w);
      else if (b.phase === 1 && b.hp <= b.maxHp * P3_AT) startOverheat(b, w);
    }
    if (d.transition) {
      const tr = d.transition;
      tr.t += dt;
      if (tr.kind === 'shatter') updateShatter(b, tr, dt, w);
      else updateOverheat(b, tr, dt, w);
      return;
    }
    if (!d.midTaunt && b.phase === 1 && b.hp < b.maxHp * 0.48) {
      d.midTaunt = true;
      taunt(b, w, 'phase', 1);
    }
    if (b.phase === 2 && !d.novaCount && b.hp <= b.maxHp * NOVA_AT + 1 && d.atk?.name !== 'supernova') {
      cancelAttack(b, w);
      const a = { name: 'supernova', t: 0 };
      d.atk = a;
      ATTACKS.supernova.start(b, a, w);
    }
    updateEscorts(b, dt, w);
    updateAttacks(b, dt, w);
  },

  /** Phase floors (no skipping transitions), shell splash reduction, vent bonuses, meltdown. */
  modifyDamage(b, amt, info) {
    const d = b.data;
    if (d.dying || d.transition || d.intro > 0 || d.novaCharge > 0) return 0;
    let a = amt;
    if (d.shellUp && !info.projectile) a *= SHELL_SPLASH;
    if (d.vent > 0.5) a *= VENT_BONUS;
    if (d.vented > 0) a *= VENTED_BONUS;
    if (b.phase === 0) a = Math.min(a, Math.max(0, b.hp - b.maxHp * P2_AT));
    else if (b.phase === 1) a = Math.min(a, Math.max(0, b.hp - b.maxHp * P3_AT));
    else if (!d.novaCount) a = Math.min(a, Math.max(0, b.hp - b.maxHp * NOVA_AT));
    else if (b.hp - a <= 0) {
      a = Math.max(0, b.hp - 1);
      d.dying = { t: 0, dur: DYING_TIME, started: false };
    }
    if (info.owner?.isPlayer) d.lastHit = info.owner;
    return a;
  },

  onDeath(b, w) {
    onDeath(b, w);
  },

  draw(ctx, b, w) {
    drawFurnace(ctx, b, w);
  },

  drawShadow(ctx, b, w, ox, oy) {
    drawFurnaceShadow(ctx, b, w, ox, oy);
  },
};

export default SUN_FURNACE;
