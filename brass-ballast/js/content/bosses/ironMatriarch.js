// The Iron Matriarch — Flagship of the Syndicate (stage 1 boss, WP14). DESIGN §2.11.
//
// A 380×170 iron dreadnought that cruises broadside around the player.
//   Phase 1 (100–60%): deck turrets fire aimed 3-round bursts in rotation; port-glow-telegraphed
//                      broadsides (alternating lanes of shells perpendicular to the hull).
//   Phase 2 (60–25%):  the deck armour blows off exposing the boiler (weak point ×1.5), the stacks
//                      vent cannonball spirals, a bow hatch launches gyroScout squads, and she
//                      telegraphs ram charges along a line.
//   Phase 3 (<25%):    burning & enraged — faster, counter-rotating double spirals, both
//                      broadsides at once, more rams.
// Bullets hit a chain of invisible hull hitbox parts that forward (deduplicated) damage to the
// body; the hull itself is iron-plated (×0.8), turrets are destructible (take damage and forward
// half), the exposed boiler takes ×1.5. Art lives in ironMatriarch-art.js.

import { bossHp } from './tuning.js';
import { Sprites } from '../../gfx/sprites.js';
import { TAU, clamp, angleDiff, rotateToward } from '../../core/math.js';
import { TAUNTS } from '../codex.js';
import {
  registerMatriarchArt, hullHalfWidth, TURRET_MOUNTS, PORT_XS, STACKS, HATCH, CORE, HITBOXES,
  FIRE_SPOTS, BRIDGE,
} from './ironMatriarch-art.js';
import { drawOverlays, drawWreck } from './ironMatriarch-draw.js';
import { sayTaunt, spawnTalker } from './stormEngine-kit.js';

registerMatriarchArt();

// DESIGN §2.11 lists 1500; measured fights at that value lasted ~30 s even for a level-3 ship.
// ×1.5 (plus armour plate & weak points below) lands a ~1.5–2 min first boss while keeping the
// campaign's boss-hp progression monotonic (2250 < kraken 3640 < stormEngine 3800 < …).
const DESIGN_HP = 1500;
const HP_SCALE = 1.5;
const BASE_HP = DESIGN_HP * HP_SCALE;
const PHASE2 = 0.6;
const PHASE3 = 0.25;
const HULL_ARMOR = 0.45; // damage multiplier for shots on plain iron plate
const BRIDGE_MULT = 0.95; // the bridge tower is a soft spot all fight long
const CORE_MULT = 1.3; // exposed boiler (phase 2+)
const TURRET_HP = 200;
const ORBIT_R = 320; // nominal radius for the orbit's angular speed
const ZOOM = 0.82;
const CRUISE = 46; // u/s along the orbit
const BOW_TIP = 192;
const STERN_END = -184;

// Per-phase tuning: [phase0, phase1, phase2]
const TURRET_CD = [1.0, 1.25, 0.75];
const CRUISE_TIME = [[2.4, 3.2], [1.8, 2.4], [1.1, 1.5]];
const MOVES = [
  ['broadside'],
  ['vent', 'broadside', 'launch', 'ram'],
  ['doubleVent', 'doubleBroadside', 'ram', 'launch', 'doubleVent', 'ram'],
];

const tmp = { x: 0, y: 0 };

/** Hull-local → world. */
function toWorld(b, lx, ly, out = tmp) {
  const c = Math.cos(b.angle);
  const s = Math.sin(b.angle);
  out.x = b.x + (c * lx - s * ly) * b.scale;
  out.y = b.y + (s * lx + c * ly) * b.scale;
  return out;
}

/** World → hull-local y (which flank a point is on). */
function localY(b, x, y) {
  const c = Math.cos(b.angle);
  const s = Math.sin(b.angle);
  return -s * (x - b.x) + c * (y - b.y);
}

/** Taunts go to the shared comms panel (spawnTalker in init). */
function taunt(b, w, kind, index) {
  sayTaunt(b, w, kind, index);
}

// ---- Parts --------------------------------------------------------------------------------------

const BRIDGE_REF = { id: -1, r: 30 };

/**
 * Bullets meet the big hull circles before they reach anything sitting on the deck, so trace the
 * shot onward over the deck: the first weak point on its line (turret, exposed boiler, bridge)
 * within reach takes the hit instead of the armour plate. Returns the target or null.
 */
function weakPointOnLine(b, proj) {
  const d = b.data;
  const sp = Math.hypot(proj.vx, proj.vy);
  if (sp < 1) return null;
  const dx = proj.vx / sp;
  const dy = proj.vy / sp;
  const pr = proj.r * (proj.scale || 1);
  let best = null;
  let bt = 100 * b.scale; // only what the shell would reach just past the plate it struck
  const test = (x, y, r, ref) => {
    const rx = x - proj.x;
    const ry = y - proj.y;
    const t = rx * dx + ry * dy;
    if (t < -r || t > bt) return;
    if (Math.abs(rx * dy - ry * dx) > r + pr) return;
    bt = t;
    best = ref;
  };
  for (const tu of d.turrets) if (tu.alive) test(tu.x, tu.y, tu.r + 2, tu);
  if (d.core && !d.core.untargetable) test(d.core.x, d.core.y, 36 * b.scale, d.core);
  const q = toWorld(b, BRIDGE.x, BRIDGE.y);
  test(q.x, q.y, BRIDGE_REF.r * b.scale, BRIDGE_REF);
  return best;
}

/** Forward a hit on a hull part to the boss — once per projectile / per AoE source per frame. */
function forwardToBoss(part, amount, info, w) {
  const b = part.parent;
  if (!b || !b.alive) return;
  const d = b.data;
  const proj = info.projectile;
  let mult = part.data.mult;
  if (proj) {
    const hs = proj.hitSet;
    for (let i = 0; i < hs.length; i++) if (d.groupIds.has(hs[i])) return;
    const wp = weakPointOnLine(b, proj);
    if (wp && wp !== BRIDGE_REF && wp !== d.core) {
      // a deck gun: it takes the shell itself (and forwards its share to the boss)
      hs.push(wp.id);
      w.fx.hitSpark?.(wp.x, wp.y, (info.angle ?? 0) + Math.PI, !!info.crit);
      w.damageEnemy(wp, amount, info);
      return;
    }
    if (wp === d.core) mult = CORE_MULT;
    else if (wp === BRIDGE_REF) mult = BRIDGE_MULT;
  } else {
    if (d.dupT === w.time && d.dupSrc === info.source && d.dupOwner === info.owner) return;
    d.dupT = w.time;
    d.dupSrc = info.source;
    d.dupOwner = info.owner;
  }
  part.flash = 1;
  if (mult < 0.6 && !info.silent) {
    // armour plate: clink, grey sparks, and a hint once the player keeps plinking at it
    d.hullHits = (d.hullHits || 0) + 1;
    if (w.rng.next() < 0.25) {
      w.sfx('hit_armor', info.x ?? part.x, info.y ?? part.y, { vol: 0.35 });
      w.fx.sparks?.(info.x ?? part.x, info.y ?? part.y, (info.angle ?? 0) + Math.PI, 3, '#cfd6de', 1);
    }
    if (d.hullHits === 45 || d.hullHits === 400) {
      const msg = b.phase >= 1 ? 'IRON PLATE! HIT THE BOILER!' : 'IRON PLATE! HIT HER GUNS & BRIDGE!';
      w.floatText(b.x, b.y - 40, msg, { color: '#cfd6de', size: 17, life: 2.2, callout: true });
    }
  }
  w.damageEnemy(b, amount * mult, info);
}

const HULL_DEF = {
  id: 'imHull', name: 'The Iron Matriarch', hp: 1, r: 60, contactDamage: 16, mass: 50,
  xp: 0, cogs: 0, score: 0, manualMove: true, noSeparation: true, noKnockback: true, noElite: true,
  noScore: true, shadow: false, immune: { burn: true, slow: true },
  draw() {},
  modifyDamage(e, amount, info, w) {
    forwardToBoss(e, amount, info, w);
    return 0;
  },
};

const CORE_DEF = { ...HULL_DEF, id: 'imCore', name: 'Matriarch Boiler', r: 32, contactDamage: 0, noContact: true };

const TURRET_DEF = {
  id: 'imTurret', name: 'Matriarch Deck Gun', hp: TURRET_HP, r: 21, contactDamage: 0, mass: 20,
  xp: 6, cogs: 3, score: 250, manualMove: true, noSeparation: true, noKnockback: true,
  noElite: true, noContact: true, shareDamage: 0.5, layer: 1, shadow: false,
  draw(ctx, e, w) {
    const k = e.data.kick || 0;
    const x = e.x - Math.cos(e.angle) * k * 4;
    const y = e.y - Math.sin(e.angle) * k * 4;
    w.drawEnemySprite(ctx, e, 'boss_ironMatriarch_turret', 0, e.angle, x, y, e.scale);
    if (e.alive && e.hp < e.maxHp) {
      // small brass damage gauge arc around the gunhouse
      const f = clamp(e.hp / e.maxHp, 0, 1);
      ctx.globalAlpha = 0.85 * e.alpha;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(20,12,6,0.7)';
      ctx.beginPath();
      ctx.arc(e.x, e.y, 25, -Math.PI / 2, Math.PI * 1.5);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = f > 0.5 ? '#ffcf4a' : f > 0.25 ? '#ff8a2a' : '#ff3d2e';
      ctx.beginPath();
      ctx.arc(e.x, e.y, 25, -Math.PI / 2, -Math.PI / 2 + TAU * f);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  },
  onDeath(e, w, info) {
    if (info?.source === 'parent') return;
    const b = e.parent;
    w.fx.explosion?.(e.x, e.y, 1.5, { palette: 'enemy', debris: 'syndicate', cogs: 3 });
    w.fx.shockwave?.(e.x, e.y, 90, '#ffb070', 0.4);
    w.fx.debris?.(e.x, e.y, 8, 'syndicate', { speed: 300 });
    w.sfx('explode_medium', e.x, e.y);
    w.shake(0.3);
    w.hitstop(0.05);
    w.floatText(e.x, e.y - 30, 'DECK GUN DOWN!', { color: '#ffcf4a', size: 18, life: 1.4, callout: true });
    if (b?.alive) {
      b.data.turretsLost++;
      b.data.smokeSpots.push({ x: e.data.lx, y: e.data.ly });
    }
  },
};

// ---- Boss ---------------------------------------------------------------------------------------

export default {
  id: 'ironMatriarch',
  name: 'The Iron Matriarch',
  title: 'Flagship of the Syndicate',
  boss: true,
  stage: 1,
  music: 'boss',
  zoom: ZOOM, // camera base zoom for the fight (engine onBossSpawn reads def.zoom)
  frameR: 170, // camera boss-framing radius: the 376-unit hull, not just its hit circle
  hp: bossHp('ironMatriarch', BASE_HP), // × campaign toughness (tuning.js)
  r: 84,
  speed: 60,
  contactDamage: 24,
  mass: 50,
  xp: 80,
  cogs: 60,
  score: 5000,
  alt: 1.5,
  sprite: 'boss_ironMatriarch',
  hudPhases: [PHASE2, PHASE3], // boss-bar phase ticks (HUD)
  manualMove: true,
  noSeparation: true,
  noKnockback: true,

  init(b, w) {
    b.untargetable = true; // hits land on the hull/turret/core parts
    const d = b.data;
    d.t = 0;
    d.k = b.maxHp / BASE_HP;
    d.rage = 1;
    d.orbitA = -Math.PI / 2;
    d.orbitDir = w.rng.chance(0.5) ? 1 : -1;
    d.flipT = 8;
    d.turretCd = 1.4;
    d.turretIdx = 0;
    d.turretsLost = 0;
    d.portCharge = new Float32Array(PORT_XS.length * 2);
    d.portFlash = new Float32Array(PORT_XS.length * 2);
    d.ventGlow = 0;
    d.hatchOpen = 0;
    d.hatchWant = 0;
    d.coreOpen = 0;
    d.smokeT = 0;
    d.fireT = 0;
    d.smokeSpots = [];
    d.scouts = [];
    d.bag = [];
    d.moveT = 0;
    d.spiralA = 0;
    d.groupIds = new Set();
    d.dupT = -1;
    d.hull = HITBOXES.map((hb) => {
      const e = w.spawnEnemy(HULL_DEF, b.x, b.y, {
        parent: b, rawHp: 1e6, r: hb.r, data: { lx: hb.x, ly: 0, mult: HULL_ARMOR },
      });
      d.groupIds.add(e.id);
      return e;
    });
    d.core = w.spawnEnemy(CORE_DEF, b.x, b.y, {
      parent: b, rawHp: 1e6, untargetable: true, data: { lx: CORE.x, ly: CORE.y, mult: CORE_MULT },
    });
    d.groupIds.add(d.core.id);
    d.turrets = TURRET_MOUNTS.map((m, i) => w.spawnEnemy(TURRET_DEF, b.x, b.y, {
      parent: b, rawHp: Math.max(1, Math.round(TURRET_HP * d.k)), data: { lx: m.x, ly: m.y, idx: i, kick: 0 },
    }));
    placeParts(b);
  },

  intro(b, w) {
    const p = w.nearestPlayer(b.x, b.y) || w.players[0];
    const d = b.data;
    const side = w.rng.chance(0.5) ? 1 : -1;
    if (p) {
      const v = w.viewRect(0);
      b.x = p.x - side * (v.w / 2 + 260);
      b.y = (v.y0 + v.y1) / 2 - Math.max(130, v.h / 2 - 150);
    }
    b.angle = side > 0 ? 0 : Math.PI;
    b.vx = side * 240;
    b.vy = 0;
    d.orbitA = -Math.PI / 2;
    setInvuln(b, true);
    b.state = 'enter';
    b.timer = 0;
    placeParts(b);
    spawnTalker(w, b);
    w.sfx('steam_vent', b.x, b.y, { vol: 0.8, pitch: 0.6 });
    w.after(1.4, () => {
      if (b.alive) taunt(b, w, 'intro');
    });
  },

  update(b, dt, w) {
    const d = b.data;
    const p = w.nearestPlayer(b.x, b.y) || w.players[0];
    if (!p) return;
    d.t += dt;
    if (b.state === '') {
      // Spawned without spawnBoss (e.g. debug): run the intro now.
      this.intro(b, w);
    }

    // Phase thresholds (hp is authoritative on the body; parts forward into it).
    const frac = b.hp / b.maxHp;
    if (b.state !== 'transition' && b.state !== 'enter') {
      if (b.phase === 0 && frac <= PHASE2) startTransition(b, w, 1);
      else if (b.phase === 1 && frac <= PHASE3) startTransition(b, w, 2);
    }

    let allowTurrets = false;
    switch (b.state) {
      case 'enter':
        updateEnter(b, dt, w, p);
        break;
      case 'cruise':
        cruise(b, dt, w, p, 1);
        allowTurrets = true;
        b.timer -= dt;
        if (b.timer <= 0) nextMove(b, w);
        break;
      case 'broadside':
        updateBroadside(b, dt, w, p);
        break;
      case 'vent':
        cruise(b, dt, w, p, 0.5);
        updateVent(b, dt, w);
        break;
      case 'launch':
        cruise(b, dt, w, p, 0.8);
        allowTurrets = true;
        updateLaunch(b, dt, w);
        break;
      case 'ramTurn':
      case 'ramWarn':
      case 'ram':
      case 'ramRecover':
        updateRam(b, dt, w, p);
        break;
      case 'transition':
        hold(b, dt, 1.5);
        keepInView(b, w, dt);
        b.timer -= dt;
        if (b.timer <= 0) endTransition(b, w);
        break;
      default:
        b.state = 'cruise';
        b.timer = 1;
    }

    integrate(b, dt);
    placeParts(b);
    updateTurrets(b, dt, w, p, allowTurrets);
    updateAmbient(b, dt, w);
  },

  draw(ctx, b, w) {
    if (!b.alive) {
      drawWreck(ctx, b, w);
      return;
    }
    // soft hit flash: sustained fire on a hull this size would otherwise bleach it white
    const f = b.flash;
    b.flash = f * 0.3;
    w.drawEnemySprite(ctx, b);
    b.flash = f;
    drawOverlays(ctx, b, w);
  },

  drawShadow(ctx, b, w, ox, oy) {
    if (!b.alive) return;
    Sprites.drawShadow(ctx, 'boss_ironMatriarch', b.x + ox, b.y + oy, b.angle, b.scale, 0.3 * b.alpha, 0, 4);
  },

  onDeath(b, w) {
    const d = b.data;
    d.deathAt = w.time;
    b.state = 'dead';
    for (let i = 0; i < d.portCharge.length; i++) d.portCharge[i] = 0;
    const c = Math.cos(b.angle);
    const s = Math.sin(b.angle);
    b.vx = c * 40;
    b.vy = s * 40;
    taunt(b, w, 'death');
    clearHazards(b, w, true);
    // Flavour on top of the engine's generic boss death: a ripple of magazine detonations
    // marching stern → bow, the stacks blowing out, then the hull snapping in two.
    const pts = [];
    for (let i = 0; i < 9; i++) {
      const lx = STERN_END + 30 + (i / 8) * (BOW_TIP - STERN_END - 60);
      const ly = (i % 2 ? 1 : -1) * (hullHalfWidth(lx) - 22) * (0.4 + 0.6 * w.rng.next());
      const q = toWorld(b, lx, ly);
      pts.push([q.x, q.y]);
    }
    pts.forEach(([x, y], i) => {
      w.after(0.08 + i * 0.2, () => {
        w.fx.bigExplosion?.(x, y, 0.75 + (i % 3) * 0.15, { palette: i % 2 ? 'fire' : 'enemy' });
        w.fx.debris?.(x, y, 6, 'syndicate', { speed: 320 });
        w.sfx(i % 2 ? 'explode_large' : 'explode_medium', x, y, { vol: 0.85 });
        w.shake(0.28);
      });
    });
    const stackPts = STACKS.map((st) => {
      const q = toWorld(b, st.x, st.y);
      return [q.x, q.y];
    });
    w.after(0.7, () => {
      for (const [x, y] of stackPts) {
        w.fx.explosion?.(x, y, 1.6, { palette: 'fire', cogs: 2 });
        w.fx.smoke?.(x, y, 3, { dark: true, count: 6, spread: 60, life: 2.2 });
      }
      w.sfx('steam_vent', stackPts[1][0], stackPts[1][1], { pitch: 0.5 });
      w.hitstop(0.06);
    });
    const mid = toWorld(b, -10, 0);
    const mx = mid.x;
    const my = mid.y;
    w.after(1.25, () => {
      // keel snaps
      w.fx.shockwave?.(mx, my, 320, '#ffd9a0', 0.6);
      w.fx.sparks?.(mx, my, b.angle + Math.PI / 2, 24, '#ffd28a', 1.2, { speed: 520 });
      w.fx.sparks?.(mx, my, b.angle - Math.PI / 2, 24, '#ffd28a', 1.2, { speed: 520 });
      w.sfx('explode_huge', mx, my, { vol: 0.8 });
      w.shake(0.6);
      w.zoomPunch(0.08);
    });
    w.after(2.0, () => {
      w.fx.cogs?.(mx, my, 26, { speed: 420 });
      w.fx.embers?.(mx, my, 40, { speed: 380 });
      w.slowmo(0.35, 0.5);
    });
  },
};

// ---- Movement -----------------------------------------------------------------------------------

function setInvuln(b, on) {
  b.invuln = on;
  for (const t of b.data.turrets || []) if (t.alive) t.invuln = on;
}

/** Steer the body velocity toward a point (arrive), with catch-up speed when far behind. */
function steerTo(b, tx, ty, maxSp, accel, dt) {
  const dx = tx - b.x;
  const dy = ty - b.y;
  const dist = Math.hypot(dx, dy);
  const want = Math.min(maxSp, dist * 1.4);
  const wvx = dist > 0.5 ? (dx / dist) * want : 0;
  const wvy = dist > 0.5 ? (dy / dist) * want : 0;
  let ax = wvx - b.vx;
  let ay = wvy - b.vy;
  const al = Math.hypot(ax, ay);
  const maxA = accel * dt;
  if (al > maxA) {
    ax *= maxA / al;
    ay *= maxA / al;
  }
  b.vx += ax;
  b.vy += ay;
  return dist;
}

/**
 * Follow a moving anchor (the view ellipse slides with the camera): feed-forward the anchor's
 * own velocity plus a proportional pull, so the boss keeps pace with a fleeing player.
 */
function followTo(b, w, tx, ty, dt, gain, maxSp, accel) {
  const d = b.data;
  let tvx = 0;
  let tvy = 0;
  if (d.fT !== undefined && w.time - d.fT < 0.1 && dt > 0) {
    tvx = (tx - d.ftx) / dt;
    tvy = (ty - d.fty) / dt;
    const tl = Math.hypot(tvx, tvy);
    if (tl > 450) {
      tvx *= 450 / tl;
      tvy *= 450 / tl;
    }
  }
  d.ftx = tx;
  d.fty = ty;
  d.fT = w.time;
  let wvx = tvx + (tx - b.x) * gain;
  let wvy = tvy + (ty - b.y) * gain;
  const wl = Math.hypot(wvx, wvy);
  if (wl > maxSp) {
    wvx *= maxSp / wl;
    wvy *= maxSp / wl;
  }
  let ax = wvx - b.vx;
  let ay = wvy - b.vy;
  const al = Math.hypot(ax, ay);
  const maxA = accel * dt;
  if (al > maxA) {
    ax *= maxA / al;
    ay *= maxA / al;
  }
  b.vx += ax;
  b.vy += ay;
}

/** Remove this boss's pending telegraphs (all = also its damaging hazards & clouds). */
function clearHazards(b, w, all) {
  for (const h of w.hazards) {
    if (!h.alive) continue;
    if (h.data?.boss === b && h.data.tele) h.alive = false;
    else if (all && (h.owner === b || h.follow === b)) h.alive = false;
  }
}

function hold(b, dt, k = 2.5) {
  const f = Math.exp(-k * dt);
  b.vx *= f;
  b.vy *= f;
}

function integrate(b, dt) {
  const s = b.slow ? 1 - b.slow.amt : 1;
  b.x += b.vx * s * dt;
  b.y += b.vy * s * dt;
}

/**
 * Where the orbit wants the hull: an ellipse inscribed in the current view (so the whole ship
 * stays on screen however the player kites), centred on the camera.
 */
function orbitTarget(b, w, out) {
  const d = b.data;
  const v = w.renderer.viewRect(0, d.vr || (d.vr = {}));
  const rx = Math.max(170, v.w / 2 - 250);
  // The HUD boss bar covers the top of the screen: sit lower there, closer to the edge below.
  const up = Math.max(120, v.h / 2 - 260);
  const down = Math.max(120, v.h / 2 - 150);
  const sn = Math.sin(d.orbitA);
  out.x = (v.x0 + v.x1) / 2 + Math.cos(d.orbitA) * rx;
  out.y = (v.y0 + v.y1) / 2 + sn * (sn < 0 ? up : down);
  return out;
}

/** While holding position (broadsides, transitions) still drift back if the view runs away. */
function keepInView(b, w, dt) {
  const d = b.data;
  const v = w.renderer.viewRect(0, d.vr || (d.vr = {}));
  const mx = Math.min(v.w / 2, 230);
  const tx = clamp(b.x, v.x0 + mx, v.x1 - mx);
  const ty = clamp(b.y, v.y0 + Math.min(v.h / 2, 240), v.y1 - Math.min(v.h / 2, 150));
  if (tx !== b.x || ty !== b.y) steerTo(b, tx, ty, 160 * b.speedMult, 200, dt);
}

const tgt = { x: 0, y: 0 };

/** Orbit the player broadside-on; `pace` scales the orbit speed. */
function cruise(b, dt, w, p, pace) {
  const d = b.data;
  const sm = b.speedMult * d.rage;
  d.flipT -= dt;
  if (d.flipT <= 0) {
    d.flipT = 7 + w.rng.next() * 5;
    d.orbitDir = -d.orbitDir;
  }
  d.orbitA += (d.orbitDir * CRUISE * pace * sm * dt) / ORBIT_R;
  orbitTarget(b, w, tgt);
  followTo(b, w, tgt.x, tgt.y, dt, 0.8, 320 * sm, 520 * sm);
  // Keep the broadside toward the player: hull axis ⟂ radius, whichever way is closer.
  const radial = Math.atan2(b.y - p.y, b.x - p.x);
  const h1 = radial + Math.PI / 2;
  const h2 = radial - Math.PI / 2;
  const want = Math.abs(angleDiff(b.angle, h1)) < Math.abs(angleDiff(b.angle, h2)) ? h1 : h2;
  b.angle = rotateToward(b.angle, want, 0.55 * sm * dt);
}

function updateEnter(b, dt, w, p) {
  b.timer += dt;
  orbitTarget(b, w, tgt);
  followTo(b, w, tgt.x, tgt.y, dt, 0.7, 280, 260);
  const dist = Math.hypot(tgt.x - b.x, tgt.y - b.y);
  // engines at full ahead while she sails in
  if (Math.random() < 0.5) emitExhaust(b, w, 1.2);
  if ((dist < 50 && b.timer > 1.5) || b.timer > 5) {
    setInvuln(b, false);
    b.state = 'cruise';
    b.timer = 1.2;
    w.sfx('boss_roar', b.x, b.y, { vol: 0.6, pitch: 0.8 });
  }
}

function nextMove(b, w) {
  const d = b.data;
  if (!d.bag.length) {
    d.bag = MOVES[b.phase].slice();
    w.rng.shuffle(d.bag);
    if (d.bag[0] === d.lastMove && d.bag.length > 1) d.bag.push(d.bag.shift());
  }
  const move = d.bag.shift();
  d.lastMove = move;
  switch (move) {
    case 'broadside':
    case 'doubleBroadside':
      startBroadside(b, w, move === 'doubleBroadside');
      break;
    case 'vent':
    case 'doubleVent':
      startVent(b, w, move === 'doubleVent');
      break;
    case 'launch':
      startLaunch(b, w);
      break;
    case 'ram':
      startRam(b, w);
      break;
    default:
      toCruise(b, w);
  }
}

function toCruise(b, w) {
  const [a, z] = CRUISE_TIME[b.phase] || CRUISE_TIME[0];
  b.state = 'cruise';
  b.timer = a + w.rng.next() * (z - a);
}

// ---- Broadsides -----------------------------------------------------------------------------------

const LANE_LEN = 640;

function startBroadside(b, w, both) {
  const d = b.data;
  const p = w.nearestPlayer(b.x, b.y);
  const side = p ? (localY(b, p.x, p.y) >= 0 ? 1 : -1) : 1;
  d.bs = { sides: both ? [-1, 1] : [side], step: 0, t: 0 };
  b.state = 'broadside';
  telegraphPorts(b, w, 0, 1.0);
  w.sfx('mortar_whistle', b.x, b.y, { vol: 0.5, pitch: 0.7 });
}

/** Ports in group g (0 = even, 1 = odd) glow and draw lane telegraphs. */
function telegraphPorts(b, w, g, time) {
  const d = b.data;
  d.bs.group = g;
  d.bs.charge = time;
  for (const s of d.bs.sides) {
    for (let i = g; i < PORT_XS.length; i += 2) {
      const lx = PORT_XS[i];
      const hy = hullHalfWidth(lx) + 8;
      const a = toWorld(b, lx, s * hy);
      const ax = a.x;
      const ay = a.y;
      const q = toWorld(b, lx, s * (hy + LANE_LEN));
      // follows the hull (translation only: she doesn't turn while a broadside is laid)
      w.addHazard({
        shape: 'line', telegraph: true, life: time, x: ax, y: ay, x2: q.x, y2: q.y, width: 30,
        color: '#ff7a2f', alpha: 0.75, follow: b, ox: ax - b.x, oy: ay - b.y, data: { boss: b, tele: true },
      });
    }
  }
}

function updateBroadside(b, dt, w) {
  const d = b.data;
  const bs = d.bs;
  hold(b, dt, 2.2);
  keepInView(b, w, dt);
  bs.t += dt;
  // charge glow on the active group's ports
  for (const s of bs.sides) {
    for (let i = bs.group; i < PORT_XS.length; i += 2) {
      const k = (s > 0 ? PORT_XS.length : 0) + i;
      d.portCharge[k] = clamp(bs.t / bs.charge, 0, 1);
    }
  }
  if (bs.t >= bs.charge) {
    fireGroup(b, w, bs.group, bs.sides);
    bs.step++;
    bs.t = 0;
    if (bs.step === 1) telegraphPorts(b, w, 1, 0.8);
    else {
      toCruise(b, w);
      b.timer += 0.4;
    }
  }
}

function fireGroup(b, w, g, sides) {
  const d = b.data;
  const speeds = [165, 205, 245, 285];
  for (const s of sides) {
    for (let i = g; i < PORT_XS.length; i += 2) {
      const k = (s > 0 ? PORT_XS.length : 0) + i;
      d.portCharge[k] = 0;
      d.portFlash[k] = 1;
      const lx = PORT_XS[i];
      const m = toWorld(b, lx, s * (hullHalfWidth(lx) + 12));
      const mx = m.x;
      const my = m.y;
      const ang = b.angle + s * Math.PI / 2;
      for (const sp of speeds) {
        w.fire({ team: 'enemy', kind: 'shell', x: mx, y: my, angle: ang, speed: sp, r: 7, damage: 10, owner: b, source: 'enemy' });
      }
      w.fx.muzzle?.(mx, my, ang, 1.3, '#ff7a2f');
    }
  }
  const c = toWorld(b, 0, 0);
  w.sfx('enemy_cannon', c.x, c.y, { vol: 1, pitch: 0.75 });
  w.sfx('broadside_fire', c.x, c.y, { vol: 0.8, pitch: 0.7 });
  w.shake(0.22);
}

// ---- Stack vents (cannonball spirals) --------------------------------------------------------------

function startVent(b, w, double) {
  const d = b.data;
  b.state = 'vent';
  d.vent = { t: 0, warm: 0.85, dur: 3.2, double, shotT: 0 };
  d.spiralA = w.rng.angle();
  w.sfx('steam_vent', b.x, b.y, { vol: 1, pitch: 0.7 });
  for (const st of STACKS) {
    const q = toWorld(b, st.x, st.y);
    w.addHazard({
      shape: 'circle', telegraph: true, life: 0.85, x: q.x, y: q.y, r: 34, color: '#ff7a2f',
      follow: b, ox: q.x - b.x, oy: q.y - b.y, data: { boss: b, tele: true },
    });
  }
}

function updateVent(b, dt, w) {
  const d = b.data;
  const v = d.vent;
  v.t += dt;
  if (v.t < v.warm) {
    d.ventGlow = v.t / v.warm;
    if (Math.random() < 0.6) {
      const st = STACKS[(Math.random() * STACKS.length) | 0];
      const q = toWorld(b, st.x, st.y);
      w.fx.steam?.(q.x, q.y, w.rng.angle(), 1.1, { count: 2 });
    }
    return;
  }
  d.ventGlow = 1;
  const rate = 0.13 / (b.fireRateMult * d.rage);
  v.shotT -= dt;
  while (v.shotT <= 0) {
    v.shotT += rate;
    d.spiralA += 0.3;
    STACKS.forEach((st, i) => {
      const q = toWorld(b, st.x, st.y);
      const off = (i / STACKS.length) * TAU;
      const dir = v.double && i % 2 ? -1 : 1;
      const a = dir * d.spiralA + off;
      w.fire({ team: 'enemy', kind: 'slag', x: q.x, y: q.y, angle: a, speed: v.double ? 165 : 180, r: 7, damage: 9, owner: b, source: 'enemy' });
    });
    w.sfx('enemy_shot', b.x, b.y, { vol: 0.35, pitch: 0.8 });
  }
  if (Math.random() < 0.5) {
    const st = STACKS[(Math.random() * STACKS.length) | 0];
    const q = toWorld(b, st.x, st.y);
    w.fx.embers?.(q.x, q.y, 1, { speed: 120 });
  }
  if (v.t >= v.warm + v.dur) {
    d.ventGlow = 0;
    toCruise(b, w);
  }
}

// ---- Scout launch -------------------------------------------------------------------------------

function startLaunch(b, w) {
  const d = b.data;
  d.scouts = d.scouts.filter((s) => s.alive);
  if (d.scouts.length >= 7) {
    nextMove(b, w);
    return;
  }
  b.state = 'launch';
  d.launch = { t: 0, n: b.phase >= 2 ? 5 : 4, shotT: 0.65 };
  d.hatchWant = 1;
  w.sfx('steam_vent', b.x, b.y, { vol: 0.6, pitch: 1.3 });
  if (!d.saidScouts) {
    d.saidScouts = true;
    taunt(b, w, 'phase', 1);
  }
}

function updateLaunch(b, dt, w) {
  const d = b.data;
  const L = d.launch;
  L.t += dt;
  L.shotT -= dt;
  if (L.shotT <= 0 && L.n > 0) {
    L.shotT = 0.32;
    L.n--;
    const q = toWorld(b, HATCH.x, HATCH.y);
    const p = w.nearestPlayer(q.x, q.y);
    const a = p ? Math.atan2(p.y - q.y, p.x - q.x) + (w.rng.next() - 0.5) * 1.6 : w.rng.angle();
    const e = w.spawnEnemy('gyroScout', q.x, q.y, { vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, angle: a });
    if (e) d.scouts.push(e);
    w.fx.steam?.(q.x, q.y, a, 1.2, { count: 4 });
    w.fx.flare?.(q.x, q.y, 40, '#ff9a4a');
    w.sfx('carrier_launch', q.x, q.y);
  }
  if (L.n <= 0 && L.shotT <= 0) {
    d.hatchWant = 0;
    toCruise(b, w);
  }
}

// ---- Ram charge ----------------------------------------------------------------------------------

function startRam(b, w) {
  b.state = 'ramTurn';
  b.timer = 1.3;
  w.sfx('wasp_charge', b.x, b.y, { vol: 0.9, pitch: 0.5 });
  w.floatText(b.x, b.y - 110, 'ALL AHEAD FLANK!', { color: '#ff8a5a', size: 18, life: 1.4, callout: true });
}

function updateRam(b, dt, w, p) {
  const d = b.data;
  const sm = b.speedMult * d.rage;
  switch (b.state) {
    case 'ramTurn': {
      hold(b, dt, 2);
      const want = Math.atan2(p.y - b.y, p.x - b.x);
      b.angle = rotateToward(b.angle, want, 1.5 * dt);
      b.timer -= dt;
      emitExhaust(b, w, 0.6);
      if (b.timer <= 0 || Math.abs(angleDiff(b.angle, want)) < 0.06) {
        const bow = toWorld(b, BOW_TIP, 0);
        const bx = bow.x;
        const by = bow.y;
        const dist = clamp(Math.hypot(p.x - bx, p.y - by) + 300, 480, 950);
        d.ram = { dist, speed: 560 * sm, left: dist };
        const c = Math.cos(b.angle);
        const s = Math.sin(b.angle);
        w.telegraphLine(bx - c * 40, by - s * 40, bx + c * dist, by + s * dist, 176, 1.0, { color: '#ff4d2e', data: { boss: b, tele: true } });
        b.state = 'ramWarn';
        b.timer = 1.0;
        w.sfx('boss_roar', b.x, b.y, { vol: 0.7, pitch: 1.1 });
      }
      break;
    }
    case 'ramWarn':
      hold(b, dt, 6);
      b.timer -= dt;
      emitExhaust(b, w, 1.5);
      w.shake(0.04);
      if (b.timer <= 0) {
        b.state = 'ram';
        const self = b;
        w.addHazard({
          shape: 'line', x: b.x, y: b.y, x2: b.x, y2: b.y, width: 150, life: 4, damage: 26, tick: 0.6,
          owner: b, source: 'enemy', knockback: 400,
          update(h) {
            if (!self.alive || self.state !== 'ram') {
              h.alive = false;
              return;
            }
            const a = toWorld(self, STERN_END + 20, 0);
            h.x = a.x;
            h.y = a.y;
            const z = toWorld(self, BOW_TIP + 8, 0);
            h.x2 = z.x;
            h.y2 = z.y;
          },
          draw() {},
        });
        w.sfx('explode_medium', b.x, b.y, { vol: 0.6, pitch: 0.6 });
      }
      break;
    case 'ram': {
      const c = Math.cos(b.angle);
      const s = Math.sin(b.angle);
      const R = d.ram;
      b.vx = c * R.speed;
      b.vy = s * R.speed;
      R.left -= R.speed * dt;
      emitExhaust(b, w, 2);
      if (Math.random() < 0.6) {
        const bow = toWorld(b, BOW_TIP - 10, (Math.random() - 0.5) * 30);
        w.fx.sparks?.(bow.x, bow.y, b.angle + Math.PI + (Math.random() - 0.5), 2, '#ffd28a', 0.8);
      }
      if (R.left <= 0) {
        b.state = 'ramRecover';
        b.timer = 0.9;
      }
      break;
    }
    case 'ramRecover':
      hold(b, dt, 3);
      b.timer -= dt;
      if (b.timer <= 0) {
        d.orbitA = Math.atan2(b.y - p.y, b.x - p.x);
        toCruise(b, w);
      }
      break;
    default:
      break;
  }
}

// ---- Phase transitions ----------------------------------------------------------------------------

function startTransition(b, w, phase) {
  const d = b.data;
  const sub = TAUNTS?.ironMatriarch?.phase?.[phase === 1 ? 0 : 2] || '';
  w.bossPhase(b, phase, { text: phase === 1 ? 'BOILERS BREACHED' : 'THE MATRIARCH BURNS', sub });
  setInvuln(b, true);
  d.hatchWant = 0;
  d.ventGlow = 0;
  d.portCharge.fill(0);
  d.bag = [];
  b.state = 'transition';
  b.timer = 2.0;
  w.hitstop(0.12);
  w.flash('#ffcf9a', 0.25);
  w.clearEnemyBullets(b.x, b.y, Infinity);
  clearHazards(b, w, false);
  // ripple of hull explosions
  for (let i = 0; i < 6; i++) {
    w.after(0.1 + i * 0.14, () => {
      if (!b.alive) return;
      const lx = STERN_END + 40 + w.rng.next() * (BOW_TIP - STERN_END - 80);
      const ly = (w.rng.next() * 2 - 1) * (hullHalfWidth(lx) - 20);
      const q = toWorld(b, lx, ly);
      w.fx.explosion?.(q.x, q.y, 1.1, { palette: 'enemy' });
      w.sfx('explode_medium', q.x, q.y, { vol: 0.6 });
    });
  }
  if (phase === 1) {
    w.after(0.9, () => {
      if (!b.alive) return;
      const q = toWorld(b, CORE.x, CORE.y);
      w.fx.bigExplosion?.(q.x, q.y, 1.2, { palette: 'fire', debris: 'syndicate' });
      w.fx.debris?.(q.x, q.y, 14, 'syndicate', { speed: 420 });
      w.sfx('explode_large', q.x, q.y);
      w.shake(0.5);
      d.coreBlown = true;
      w.floatText(q.x, q.y - 40, 'BOILER EXPOSED!', { color: '#ffcf4a', size: 20, life: 1.8, callout: true });
    });
  } else {
    d.rage = 1.3;
    w.after(0.6, () => {
      if (b.alive) w.sfx('boss_roar', b.x, b.y, { pitch: 0.8 });
    });
  }
}

function endTransition(b, w) {
  const d = b.data;
  setInvuln(b, false);
  if (b.phase >= 1 && d.core?.alive) d.core.untargetable = false;
  toCruise(b, w);
  b.timer = 0.8;
}

// ---- Parts & turrets ---------------------------------------------------------------------------

function placeParts(b) {
  const d = b.data;
  for (const e of d.hull) {
    const q = toWorld(b, e.data.lx, 0);
    e.x = q.x;
    e.y = q.y;
    e.angle = b.angle;
  }
  if (d.core) {
    const q = toWorld(b, d.core.data.lx, d.core.data.ly);
    d.core.x = q.x;
    d.core.y = q.y;
  }
  for (const t of d.turrets) {
    if (!t.alive) continue;
    const q = toWorld(b, t.data.lx, t.data.ly);
    t.x = q.x;
    t.y = q.y;
    if (t.data.init !== true) {
      t.data.init = true;
      t.angle = b.angle;
    }
  }
}

function updateTurrets(b, dt, w, p, allowFire) {
  const d = b.data;
  for (const t of d.turrets) {
    if (!t.alive) continue;
    const want = Math.atan2(p.y - t.y, p.x - t.x);
    t.angle = rotateToward(t.angle, want, 2.4 * dt);
    t.data.kick = Math.max(0, (t.data.kick || 0) - dt * 5);
    if (t.data.burst > 0) {
      t.data.burstT -= dt;
      if (t.data.burstT <= 0) {
        t.data.burst--;
        t.data.burstT = 0.13;
        fireTurret(b, t, w, p);
      }
    }
  }
  if (!allowFire) return;
  d.turretCd -= dt * b.fireRateMult * d.rage;
  if (d.turretCd > 0) return;
  d.turretCd = TURRET_CD[b.phase] ?? 1;
  for (let i = 0; i < d.turrets.length; i++) {
    d.turretIdx = (d.turretIdx + 1) % d.turrets.length;
    const t = d.turrets[d.turretIdx];
    if (t.alive && Math.abs(angleDiff(t.angle, Math.atan2(p.y - t.y, p.x - t.x))) < 0.5) {
      t.data.burst = 3;
      t.data.burstT = 0;
      break;
    }
  }
}

function fireTurret(b, t, w, p) {
  const side = t.data.burst % 2 ? 1 : -1;
  const c = Math.cos(t.angle);
  const s = Math.sin(t.angle);
  const mx = t.x + c * 34 - s * 6.5 * side;
  const my = t.y + s * 34 + c * 6.5 * side;
  // light lead: aim where the player will be when the shell arrives (halved for fairness)
  const dist = Math.hypot(p.x - mx, p.y - my);
  const tt = (dist / 250) * 0.5;
  const a = Math.atan2(p.y + p.vy * tt - my, p.x + p.vx * tt - mx) + (w.rng.next() - 0.5) * 0.08;
  w.fire({ team: 'enemy', kind: 'shell', x: mx, y: my, angle: a, speed: 250, r: 6, damage: 8, owner: b, source: 'enemy' });
  w.fx.muzzle?.(mx, my, a, 0.8, '#ff7a2f');
  w.sfx('enemy_cannon', mx, my, { vol: 0.45 });
  t.data.kick = 1;
}

// ---- Ambience: smoke, fire, exhaust ---------------------------------------------------------------

function emitExhaust(b, w, k) {
  for (const s of [-1, 1]) {
    const q = toWorld(b, -210, s * 44);
    w.fx.steam?.(q.x, q.y, b.angle + Math.PI, 0.6 + k * 0.3, { count: 1, alpha: 0.5 });
  }
}

function updateAmbient(b, dt, w) {
  const d = b.data;
  const frac = b.hp / b.maxHp;
  // hatch & core animation
  d.hatchOpen += clamp(d.hatchWant - d.hatchOpen, -dt * 2.5, dt * 2.5);
  if (d.coreBlown) d.coreOpen = Math.min(1, d.coreOpen + dt * 2);
  for (let i = 0; i < d.portFlash.length; i++) d.portFlash[i] = Math.max(0, d.portFlash[i] - dt * 3);
  if (b.state !== 'vent') d.ventGlow = Math.max(0, d.ventGlow - dt * 2);

  // stack smoke: cream steam when healthy, choking black below half
  d.smokeT -= dt;
  if (d.smokeT <= 0) {
    d.smokeT = frac < 0.5 ? 0.07 : 0.11;
    const drift = -40;
    const c = Math.cos(b.angle);
    const s = Math.sin(b.angle);
    for (const st of STACKS) {
      const q = toWorld(b, st.x, st.y);
      w.fx.smoke?.(q.x, q.y, frac < 0.5 ? 1.5 : 1.1, {
        count: 1,
        color: frac < 0.5 ? '#2a2420' : '#b8aea0',
        color1: frac < 0.5 ? '#0e0a08' : '#5a524a',
        alpha: frac < 0.5 ? 0.6 : 0.42,
        vx: c * drift + b.vx * 0.3,
        vy: s * drift + b.vy * 0.3,
        life: 1.5,
      });
    }
  }
  // fires & smoke from wounds
  d.fireT -= dt;
  if (d.fireT <= 0) {
    d.fireT = 0.05;
    const fires = b.phase >= 2 ? FIRE_SPOTS.length : frac < 0.5 ? Math.ceil(((0.5 - frac) / 0.25) * 3) : 0;
    for (let i = 0; i < Math.min(fires, FIRE_SPOTS.length); i++) {
      const f = FIRE_SPOTS[i];
      const q = toWorld(b, f.x, f.y);
      w.fx.burn?.(q.x, q.y, 1.3);
    }
    for (const sp of d.smokeSpots) {
      if (Math.random() < 0.35) {
        const q = toWorld(b, sp.x, sp.y);
        w.fx.smokeTrail?.(q.x, q.y, 1.4, { fire: true });
      }
    }
  }
}
