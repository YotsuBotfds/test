// The Clockwork Kraken — Terror of the Smog (stage 2 boss, WP14). DESIGN §2.11.
//
// An armoured dome with a great clockwork eye and six segmented tentacles (kraken-tentacles.js).
//   Phase 1 (100–60%): tentacle slams along telegraphed lines, ring bursts with escape gaps,
//                      grab attempts (boost to break free).
//   Phase 2 (60–25%):  ink-smog clouds (obscure & slow), two-arm eye spiral, faster arms, slams
//                      can follow up with telegraphed sweeps.
//   Phase 3 (<25%):    frenzy — every arm slams in sequence, and the body itself charges.
// Severing arms (empty their pool via any segment; root joint & claw are weak points) jolts the
// body and removes that arm's attacks. Art: kraken-art.js.

import { bossHp } from './tuning.js';
import { Sprites } from '../../gfx/sprites.js';
import { TAU, clamp, easeOutCubic } from '../../core/math.js';
import { TAUNTS } from '../codex.js';
import { registerKrakenArt, BODY_R, PORTHOLES, VENTS } from './kraken-art.js';
import { sayTaunt, spawnTalker } from './stormEngine-kit.js';
import {
  createTentacles, updateTentacles, pickTentacle, startSlam, startGrab, releaseGrab, reachOf,
  regrowTentacles, N_SEG,
} from './kraken-tentacles.js';

registerKrakenArt();

// DESIGN §2.11 lists 2600; raised ×1.4 for the same reason as the Iron Matriarch (measured
// fights were ~25–30 s) while staying below the stage-3 Storm Engine's 3800.
const DESIGN_HP = 2600;
const HP_SCALE = 1.4;
const BASE_HP = DESIGN_HP * HP_SCALE;
const PHASE2 = 0.6;
const PHASE3 = 0.25;
const ZOOM = 0.84;
const DOME_ARMOR = 0.75;
const DOME_OPEN = 1.15;
const SLAM_CD = [2.5, 1.8, 1.5];
const REST = [[1.4, 2.0], [1.0, 1.5], [0.7, 1.1]];
const MOVES = [
  ['ring', 'grab', 'ring', 'ring'],
  ['ink', 'spiral', 'ring', 'grab', 'ink', 'spiral'],
  ['frenzy', 'charge', 'ink', 'spiral', 'frenzy', 'charge', 'ring'],
];

/** Taunts go to the shared comms panel (spawnTalker in init). */
function taunt(b, w, kind, index) {
  sayTaunt(b, w, kind, index);
}

export default {
  id: 'kraken',
  name: 'The Clockwork Kraken',
  title: 'Terror of the Smog',
  boss: true,
  stage: 2,
  music: 'boss',
  zoom: ZOOM, // camera base zoom for the fight (engine onBossSpawn reads def.zoom)
  frameR: 170, // camera boss-framing radius: dome plus the inner reach of the arms
  hp: bossHp('kraken', BASE_HP), // × campaign toughness (tuning.js)
  r: BODY_R,
  speed: 70,
  contactDamage: 26,
  mass: 60,
  xp: 120,
  cogs: 90,
  score: 8000,
  alt: 1.3,
  sprite: 'boss_kraken',
  hudPhases: [PHASE2, PHASE3], // boss-bar phase ticks (HUD)
  manualMove: true,
  noSeparation: true,
  noKnockback: true,

  init(b, w) {
    const d = b.data;
    d.t = 0;
    d.k = b.maxHp / BASE_HP;
    d.rage = 1;
    d.swayMul = 1;
    d.extend = 1;
    d.emerge = 1;
    d.spin = 0.1;
    d.orbitA = -Math.PI / 2;
    d.orbitDir = w.rng.chance(0.5) ? 1 : -1;
    d.flipT = 9;
    d.slamCd = 2.2;
    d.grabCd = 5;
    d.bag = [];
    d.inks = [];
    d.tauntQueue = [];
    d.eyeX = 0;
    d.eyeY = 0;
    d.blink = 0;
    d.blinkT = 2.5;
    d.eyeFlare = 0;
    d.smokeT = 0;
    d.frenzy = false;
    d.vr = {};
    d.tentacles = createTentacles(b, w);
    updateTentacles(b, 0, w, w.players[0] || b);
  },

  intro(b, w) {
    const d = b.data;
    const v = w.viewRect(0);
    b.x = (v.x0 + v.x1) / 2;
    b.y = v.y1 + 300;
    b.vx = 0;
    b.vy = -200;
    d.orbitA = Math.PI / 2; // rises out of the smog into the lower band, then circles
    d.extend = 0.3;
    d.emerge = 0;
    b.invuln = true;
    b.state = 'enter';
    b.timer = 0;
    spawnTalker(w, b);
    w.sfx('steam_vent', b.x, b.y, { vol: 0.9, pitch: 0.45 });
    w.after(1.6, () => {
      if (b.alive) taunt(b, w, 'intro');
    });
  },

  update(b, dt, w) {
    const d = b.data;
    const p = w.nearestPlayer(b.x, b.y) || w.players[0];
    if (!p) return;
    d.t += dt;
    if (b.state === '') this.intro(b, w);

    const frac = b.hp / b.maxHp;
    if (b.state !== 'transition' && b.state !== 'enter' && !b.state.startsWith('charge')) {
      if (b.phase === 0 && frac <= PHASE2) startTransition(b, w, 1);
      else if (b.phase === 1 && frac <= PHASE3) startTransition(b, w, 2);
    }

    let pace = 1;
    switch (b.state) {
      case 'enter':
        updateEnter(b, dt, w);
        break;
      case 'rest':
        b.timer -= dt;
        if (b.timer <= 0) nextMove(b, w, p);
        break;
      case 'ring':
        pace = 0.4;
        updateRing(b, dt, w, p);
        break;
      case 'ink':
        pace = 0.6;
        updateInk(b, dt, w, p);
        break;
      case 'spiral':
        pace = 0.3;
        updateSpiral(b, dt, w);
        break;
      case 'frenzy':
        pace = 0.5;
        b.timer -= dt;
        if (b.timer <= 0) {
          d.frenzy = false;
          toRest(b, w);
        }
        break;
      case 'chargeWarn':
      case 'charge':
      case 'chargeRecover':
        pace = 0;
        updateCharge(b, dt, w, p);
        break;
      case 'transition':
        pace = 0.2;
        b.timer -= dt;
        if (b.timer <= 0) endTransition(b, w);
        break;
      default:
        toRest(b, w);
    }
    if (b.state !== 'enter' && pace > 0) hover(b, dt, w, pace);
    else if (b.state !== 'enter' && b.state !== 'charge') damp(b, dt, 3);
    const s = b.slow ? 1 - b.slow.amt : 1;
    b.x += b.vx * s * dt;
    b.y += b.vy * s * dt;
    b.angle += d.spin * d.rage * dt * (0.6 + 0.4 * Math.sin(d.t * 0.23));

    // autonomous slams & grabs (not during set pieces)
    const busy = b.state === 'enter' || b.state === 'transition' || b.state === 'frenzy' || b.state.startsWith('charge');
    if (!busy) {
      d.slamCd -= dt * b.fireRateMult * d.rage;
      if (d.slamCd <= 0) {
        const T = pickTentacle(b, p.x, p.y, reachOf(null, 1.95) + 40);
        if (T) startSlam(T, b, w, p.x + p.vx * 0.2, p.y + p.vy * 0.2, 0.8);
        d.slamCd = (SLAM_CD[b.phase] ?? 2) * (T ? 1 : 0.3);
      }
    }
    d.grabCd -= dt;
    updateTentacles(b, dt, w, p);
    updateEye(b, dt, w, p);
    updateAmbient(b, dt, w);
    if (d.tauntQueue.length) {
      const [kind, idx] = d.tauntQueue.shift();
      taunt(b, w, kind, idx);
    }
  },

  // Riveted dome: hits glance off (×0.55) unless the great eye is open and blazing mid-attack.
  modifyDamage(b, amount, info, w) {
    if (info.fwd) return amount;
    const d = b.data;
    const open = d.eyeFlare > 0.45 && d.blink < 0.3;
    if (!open && !info.silent && w.rng.next() < 0.25) {
      w.sfx('hit_armor', info.x ?? b.x, info.y ?? b.y, { vol: 0.35 });
      w.fx.sparks?.(info.x ?? b.x, info.y ?? b.y, (info.angle ?? 0) + Math.PI, 3, '#cfd6de', 1);
    }
    if (!open) {
      d.domeHits = (d.domeHits || 0) + 1;
      if (d.domeHits === 50) {
        w.floatText(b.x, b.y - 60, 'ARMOURED DOME! CUT THE ARMS, OR STRIKE WHEN THE EYE BLAZES!', {
          color: '#cfd6de', size: 15, life: 2.6, callout: true,
        });
      }
    }
    return amount * (open ? DOME_OPEN : DOME_ARMOR);
  },

  draw(ctx, b, w) {
    drawBody(ctx, b, w);
  },

  drawShadow(ctx, b, w, ox, oy) {
    if (!b.alive) return;
    Sprites.drawShadow(ctx, 'boss_kraken', b.x + ox, b.y + oy, b.angle, b.scale, 0.3 * b.alpha, 0, 5);
  },

  onDeath(b, w) {
    const d = b.data;
    d.deathAt = w.time;
    b.state = 'dead';
    releaseGrab(b, w, 'drop');
    clearHazards(b, w, true);
    taunt(b, w, 'death');
    b.vx = 0;
    b.vy = 0;
    // every arm convulses and blows apart root → tip; the eye overloads; an ink geyser
    d.tentacles.forEach((T, j) => {
      if (!T.alive) return;
      T.segs.forEach((s, i) => {
        const a = Math.atan2(s.y - b.y, s.x - b.x);
        s.vx = Math.cos(a) * (60 + i * 25);
        s.vy = Math.sin(a) * (60 + i * 25);
        const x = s.x;
        const y = s.y;
        if (i % 2 === 0 || i === N_SEG - 1) {
          w.after(0.15 + i * 0.13 + j * 0.06, () => {
            w.fx.explosion?.(x, y, 0.55 + (s.r / 20) * 0.5, { palette: i % 4 ? 'fire' : 'enemy', cogs: i === N_SEG - 1 ? 2 : 0 });
            if (i % 4 === 0) w.sfx('explode_small', x, y, { vol: 0.6 });
          });
        }
      });
    });
    const x = b.x;
    const y = b.y;
    w.fx.flare?.(x, y, 220, '#ff9a4a', 0.4);
    w.fx.smoke?.(x, y, 3.2, { color: '#1c1426', color1: '#06040a', count: 12, spread: 130, life: 2.6, alpha: 0.75 });
    w.after(0.9, () => {
      w.fx.shockwave?.(x, y, 360, '#e8b0ff', 0.6);
      w.fx.bigExplosion?.(x, y, 1.4, { palette: 'plasma' });
      w.sfx('explode_large', x, y);
      w.shake(0.5);
    });
    w.after(1.7, () => {
      w.fx.cogs?.(x, y, 24, { speed: 400 });
      w.fx.embers?.(x, y, 30, { speed: 360, color: '#ff8a2a' });
      w.slowmo(0.35, 0.5);
    });
  },
};

// ---- Movement ---------------------------------------------------------------------------------------

function damp(b, dt, k) {
  const f = Math.exp(-k * dt);
  b.vx *= f;
  b.vy *= f;
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

/** A point on an ellipse inscribed in the view (the arms stay on screen), plus a slow bob. */
function hoverTarget(b, w, out) {
  const d = b.data;
  const v = w.renderer.viewRect(0, d.vr);
  const rx = Math.max(150, v.w / 2 - 300);
  const up = Math.max(110, v.h / 2 - 250);
  const down = Math.max(110, v.h / 2 - 150);
  const sn = Math.sin(d.orbitA);
  out.x = (v.x0 + v.x1) / 2 + Math.cos(d.orbitA) * rx + Math.sin(d.t * 0.7) * 18;
  out.y = (v.y0 + v.y1) / 2 + sn * (sn < 0 ? up : down) + Math.sin(d.t * 1.1) * 14;
  return out;
}

const tgt = { x: 0, y: 0 };

function hover(b, dt, w, pace) {
  const d = b.data;
  const sm = b.speedMult * d.rage;
  d.flipT -= dt;
  if (d.flipT <= 0) {
    d.flipT = 8 + w.rng.next() * 6;
    d.orbitDir = -d.orbitDir;
  }
  d.orbitA += d.orbitDir * 0.13 * pace * sm * dt;
  hoverTarget(b, w, tgt);
  followTo(b, w, tgt.x, tgt.y, dt, 1.0, 330 * sm, 900 * sm);
}

function updateEnter(b, dt, w) {
  const d = b.data;
  b.timer += dt;
  hoverTarget(b, w, tgt);
  followTo(b, w, tgt.x, tgt.y, dt, 0.8, 260, 400);
  const dist = Math.hypot(tgt.x - b.x, tgt.y - b.y);
  d.emerge = Math.min(1, d.emerge + dt * 0.5);
  d.extend = 0.3 + 0.7 * easeOutCubic(clamp((b.timer - 0.8) / 2, 0, 1));
  b.scale = 0.72 + 0.28 * easeOutCubic(d.emerge);
  b.alpha = 0.35 + 0.65 * d.emerge;
  if (Math.random() < 0.7) {
    w.fx.smoke?.(b.x + (Math.random() - 0.5) * 160, b.y + (Math.random() - 0.5) * 160, 2, {
      count: 1, color: '#2a2230', color1: '#0c0a10', alpha: 0.5 * (1 - d.emerge * 0.6), life: 1.6,
    });
  }
  if ((dist < 40 && b.timer > 2.6) || b.timer > 5) {
    b.scale = 1;
    b.alpha = 1;
    d.extend = 1;
    b.invuln = false;
    d.eyeFlare = 1;
    w.fx.shockwave?.(b.x, b.y, 300, '#e8b0ff', 0.5);
    w.fx.smoke?.(b.x, b.y, 3, { color: '#1c1426', color1: '#06040a', count: 10, spread: 120, life: 2, alpha: 0.6 });
    w.sfx('boss_roar', b.x, b.y, { pitch: 0.7 });
    w.shake(0.4);
    toRest(b, w);
  }
}

function toRest(b, w) {
  const [a, z] = REST[b.phase] || REST[0];
  b.state = 'rest';
  b.timer = a + w.rng.next() * (z - a);
}

function nextMove(b, w, p) {
  const d = b.data;
  if (!d.bag.length) {
    d.bag = MOVES[b.phase].slice();
    w.rng.shuffle(d.bag);
    if (d.bag[0] === d.lastMove && d.bag.length > 1) d.bag.push(d.bag.shift());
  }
  const move = d.bag.shift();
  d.lastMove = move;
  switch (move) {
    case 'ring':
      b.state = 'ring';
      d.mv = { n: b.phase >= 2 ? 3 : 2, t: 0.35, off: w.rng.angle() };
      d.eyeFlare = 0.6;
      break;
    case 'ink':
      b.state = 'ink';
      d.mv = { n: b.phase >= 2 ? 4 : 3, t: 0.2 };
      break;
    case 'spiral':
      b.state = 'spiral';
      d.mv = { t: 0, warm: 0.7, dur: 2.8, shotT: 0, a: w.rng.angle(), arms: b.phase >= 2 ? 3 : 2, dir: w.rng.sign() };
      d.eyeFlare = 1;
      w.telegraphCircle(b.x, b.y, 60, 0.7, { color: '#ff3d8b', follow: b, data: { boss: b, tele: true } });
      w.sfx('tesla_hum', b.x, b.y, { vol: 0.7, pitch: 0.7 });
      break;
    case 'grab': {
      const T = d.grabCd <= 0 && !d.grab ? pickTentacle(b, p.x, p.y, reachOf(null, 2.1)) : null;
      if (T) startGrab(T, b, w, p);
      toRest(b, w);
      b.timer *= 0.6;
      break;
    }
    case 'frenzy':
      startFrenzy(b, w, p);
      break;
    case 'charge':
      startCharge(b, w, p);
      break;
    default:
      toRest(b, w);
  }
}

// ---- Attacks ----------------------------------------------------------------------------------------

function updateRing(b, dt, w, p) {
  const d = b.data;
  const m = d.mv;
  m.t -= dt;
  if (m.t > 0) return;
  m.n--;
  m.t = 0.5 / (b.fireRateMult * d.rage);
  const count = b.phase >= 2 ? 26 : 22;
  // an escape gap of 4 shots, never centred exactly on the player
  const toP = Math.atan2(p.y - b.y, p.x - b.x);
  const gapAt = toP + (w.rng.chance(0.5) ? 1 : -1) * (0.5 + w.rng.next() * 1.2);
  const step = TAU / count;
  m.off += step / 2;
  for (let i = 0; i < count; i++) {
    const a = m.off + i * step;
    let dd = (a - gapAt) % TAU;
    if (dd < 0) dd += TAU;
    if (dd < step * 4) continue;
    w.fire({ team: 'enemy', kind: 'orb', x: b.x + Math.cos(a) * 40, y: b.y + Math.sin(a) * 40, angle: a, speed: 185, r: 7, damage: 9, owner: b, source: 'enemy' });
  }
  d.eyeFlare = 1;
  w.fx.ring?.(b.x, b.y, 70, '#ff7a2f', 0.3, { width: 4, r0: 30 });
  w.sfx('enemy_cannon', b.x, b.y, { vol: 0.8, pitch: 0.8 });
  if (m.n <= 0) toRest(b, w);
}

function updateSpiral(b, dt, w) {
  const d = b.data;
  const m = d.mv;
  m.t += dt;
  if (m.t < m.warm) return;
  const rate = 0.1 / (b.fireRateMult * d.rage);
  m.shotT -= dt;
  while (m.shotT <= 0) {
    m.shotT += rate;
    m.a += 0.26 * m.dir;
    for (let k = 0; k < m.arms; k++) {
      const a = m.a + (k / m.arms) * TAU;
      w.fire({ team: 'enemy', kind: 'orb', x: b.x + Math.cos(a) * 34, y: b.y + Math.sin(a) * 34, angle: a, speed: 195, r: 7, damage: 9, owner: b, source: 'enemy' });
    }
    w.sfx('enemy_shot', b.x, b.y, { vol: 0.3 });
  }
  d.eyeFlare = Math.max(d.eyeFlare, 0.7);
  if (m.t >= m.warm + m.dur) toRest(b, w);
}

function updateInk(b, dt, w, p) {
  const d = b.data;
  const m = d.mv;
  m.t -= dt;
  if (m.t > 0) return;
  m.t = 0.28;
  m.n--;
  const a = w.rng.angle();
  const r = m.n === 0 ? 0 : 60 + w.rng.next() * 110;
  const tx = p.x + p.vx * 0.7 + Math.cos(a) * r;
  const ty = p.y + p.vy * 0.7 + Math.sin(a) * r;
  const self = b;
  const vent = VENTS[m.n % VENTS.length];
  const va = b.angle + vent.a + 0.32;
  const sx = b.x + Math.cos(va) * 66;
  const sy = b.y + Math.sin(va) * 66;
  w.fire({
    team: 'enemy', kind: 'ink', sprite: 'boss_kraken_ink', x: sx, y: sy, speed: 260, r: 10, damage: 6,
    lob: { tx, ty, time: 1.05, height: 140 }, owner: b, source: 'enemy', glow: '#ff3d8b', spin: 4,
    onLand(pr, ww) {
      spawnInk(self, ww, pr.x, pr.y);
    },
  });
  w.fx.smoke?.(sx, sy, 1.2, { count: 3, color: '#2a1c34', color1: '#0a060e', alpha: 0.6 });
  w.sfx('mortar_whistle', sx, sy, { vol: 0.5, pitch: 1.2 });
  if (m.n <= 0) toRest(b, w);
}

/** A drifting ink-smog cloud: obscures (dark puffs above the ships) and slows players inside. */
function spawnInk(b, w, x, y) {
  const d = b.data;
  d.inks = d.inks.filter((h) => h.alive);
  if (d.inks.length >= 5) d.inks.shift().alive = false;
  const R = 112;
  w.fx.smoke?.(x, y, 2.6, { color: '#1c1426', color1: '#06040a', count: 6, spread: 70, life: 1.6, alpha: 0.7 });
  w.sfx('explode_small', x, y, { vol: 0.5, pitch: 0.6 });
  if (!d.saidInk) {
    d.saidInk = true;
    d.tauntQueue.push(['phase', 1]);
  }
  const h = w.addHazard({
    x, y, r: 20, shape: 'circle', life: 7.5, team: 'enemy', damage: 0, owner: b, source: 'ink',
    data: { R, rot: w.rng.angle(), spin: (w.rng.next() - 0.5) * 0.6, puff: 0, vx: (w.rng.next() - 0.5) * 16, vy: (w.rng.next() - 0.5) * 16 },
    update(hz, dt, ww) {
      const q = hz.data;
      const grow = clamp(hz.t / 0.45, 0, 1);
      hz.r = 20 + (q.R - 20) * easeOutCubic(grow);
      hz.x += q.vx * dt;
      hz.y += q.vy * dt;
      q.rot += q.spin * dt;
      const fade = clamp((hz.life - hz.t) / 1.2, 0, 1);
      for (const pl of ww.players) {
        if (!pl.alive) continue;
        if ((pl.x - hz.x) ** 2 + (pl.y - hz.y) ** 2 < (hz.r * 0.9) ** 2) pl.slowT = Math.max(pl.slowT || 0, 0.25);
      }
      q.puff -= dt;
      if (q.puff <= 0 && fade > 0.3) {
        q.puff = 0.11;
        const a = Math.random() * TAU;
        const rr = Math.random() * hz.r * 0.75;
        ww.fx.smoke?.(hz.x + Math.cos(a) * rr, hz.y + Math.sin(a) * rr, 2.1, {
          count: 1, color: '#1e1528', color1: '#07050a', alpha: 0.42 * fade, life: 1.5, spread: 18,
        });
      }
    },
    draw(ctx, hz) {
      const q = hz.data;
      const fade = clamp((hz.life - hz.t) / 1.2, 0, 1) * clamp(hz.t / 0.3, 0, 1);
      const s = Sprites.get('boss_kraken_cloud');
      const size = hz.r * 2.5;
      ctx.globalAlpha = 0.9 * fade;
      ctx.translate(hz.x, hz.y);
      ctx.rotate(q.rot);
      ctx.drawImage(s.img, -size / 2, -size / 2, size, size);
      ctx.rotate(-q.rot * 2.3);
      ctx.globalAlpha = 0.6 * fade;
      ctx.drawImage(s.img, -size * 0.4, -size * 0.4, size * 0.8, size * 0.8);
      // rim so the slowing area stays readable
      ctx.rotate(q.rot * 1.3);
      ctx.globalAlpha = 0.35 * fade;
      ctx.strokeStyle = '#b070d0';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 10]);
      ctx.beginPath();
      ctx.arc(0, 0, hz.r * 0.92, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    },
  });
  d.inks.push(h);
}

function startFrenzy(b, w, p) {
  const d = b.data;
  const order = d.tentacles
    .filter((T) => T.alive && (T.state === 'idle' || T.state === 'retract'))
    .sort((A, B) => Math.hypot(p.x - A.rootX, p.y - A.rootY) - Math.hypot(p.x - B.rootX, p.y - B.rootY));
  if (!order.length) {
    startCharge(b, w, p);
    return;
  }
  d.frenzy = true;
  b.state = 'frenzy';
  b.timer = order.length * 0.34 + 2.2;
  d.eyeFlare = 1;
  w.floatText(b.x, b.y - 130, 'FRENZY!', { color: '#ff6ab0', size: 22, life: 1.2, callout: true });
  w.sfx('boss_roar', b.x, b.y, { vol: 0.7, pitch: 1.2 });
  order.forEach((T, j) => {
    w.after(j * 0.34, () => {
      if (!b.alive || !T.alive || (T.state !== 'idle' && T.state !== 'retract')) return;
      const q = w.nearestPlayer(T.rootX, T.rootY);
      if (q) startSlam(T, b, w, q.x + q.vx * 0.35, q.y + q.vy * 0.35, 0.8);
    });
  });
}

function startCharge(b, w, p) {
  const d = b.data;
  const a = Math.atan2(p.y - b.y, p.x - b.x);
  const dist = clamp(Math.hypot(p.x - b.x, p.y - b.y) + 260, 420, 760);
  d.charge = { a, dist, left: dist };
  b.state = 'chargeWarn';
  b.timer = 0.9;
  d.eyeFlare = 1;
  w.telegraphLine(b.x, b.y, b.x + Math.cos(a) * dist, b.y + Math.sin(a) * dist, BODY_R * 2 + 16, 0.9, { color: '#ff3d8b', data: { boss: b, tele: true } });
  w.sfx('wasp_charge', b.x, b.y, { vol: 1, pitch: 0.45 });
  // arms sweep back like a squid about to jet
  for (const T of d.tentacles) {
    if (!T.alive || T.state !== 'idle') continue;
    T.aim = a + Math.PI + (T.k - 2.5) * 0.18;
    T.wT = 0.55;
    T.state = 'retract';
    T.st = 0;
    T.dur = 2.2;
  }
}

function updateCharge(b, dt, w, p) {
  const d = b.data;
  const C = d.charge;
  switch (b.state) {
    case 'chargeWarn':
      damp(b, dt, 6);
      b.timer -= dt;
      if (Math.random() < 0.6) w.fx.smoke?.(b.x - Math.cos(C.a) * 90, b.y - Math.sin(C.a) * 90, 1.5, { count: 1, color: '#2a2230', alpha: 0.5 });
      if (b.timer <= 0) {
        b.state = 'charge';
        C.hz = w.addHazard({
          shape: 'circle', x: b.x, y: b.y, r: BODY_R + 6, life: 3, damage: 28, tick: 0.6, owner: b,
          source: 'enemy', follow: b, draw() {},
        });
        w.fx.smoke?.(b.x - Math.cos(C.a) * 80, b.y - Math.sin(C.a) * 80, 3, { count: 8, color: '#1c1426', color1: '#06040a', spread: 80, alpha: 0.7 });
        w.sfx('explode_medium', b.x, b.y, { vol: 0.6, pitch: 0.5 });
        w.shake(0.3);
      }
      break;
    case 'charge': {
      const sp = 540 * b.speedMult * d.rage;
      b.vx = Math.cos(C.a) * sp;
      b.vy = Math.sin(C.a) * sp;
      C.left -= sp * dt;
      if (Math.random() < 0.8) w.fx.smoke?.(b.x - Math.cos(C.a) * 70, b.y - Math.sin(C.a) * 70, 1.6, { count: 1, color: '#2a2230', color1: '#0a080e', alpha: 0.55, life: 1 });
      if (C.left <= 0) {
        b.state = 'chargeRecover';
        b.timer = 0.8;
        if (C.hz) C.hz.alive = false;
      }
      break;
    }
    case 'chargeRecover':
      damp(b, dt, 3.5);
      b.timer -= dt;
      if (b.timer <= 0) {
        const v = w.renderer.viewRect(0, d.vr);
        d.orbitA = Math.atan2(b.y - (v.y0 + v.y1) / 2, b.x - (v.x0 + v.x1) / 2);
        toRest(b, w);
      }
      break;
    default:
      break;
  }
}

// ---- Phases -----------------------------------------------------------------------------------------

function startTransition(b, w, phase) {
  const d = b.data;
  const sub = TAUNTS?.kraken?.phase?.[phase === 1 ? 0 : 1] || '';
  w.bossPhase(b, phase, { text: phase === 1 ? 'THE KRAKEN SULKS' : 'FRENZY OF THE DEEP', sub });
  b.invuln = true;
  b.state = 'transition';
  b.timer = 1.9;
  d.bag = [];
  d.frenzy = false;
  releaseGrab(b, w, 'drop');
  w.hitstop(0.12);
  w.flash('#d8b0ff', 0.22);
  w.clearEnemyBullets(b.x, b.y, Infinity);
  clearHazards(b, w, false);
  d.eyeFlare = 1;
  d.blink = 0;
  w.fx.shockwave?.(b.x, b.y, 340, '#e8b0ff', 0.6);
  w.fx.smoke?.(b.x, b.y, 3, { color: '#1c1426', color1: '#06040a', count: 12, spread: 140, life: 2.2, alpha: 0.65 });
  for (let i = 0; i < 5; i++) {
    w.after(0.12 + i * 0.16, () => {
      if (!b.alive) return;
      const a = w.rng.angle();
      const r = 30 + w.rng.next() * 50;
      w.fx.explosion?.(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, 0.9, { palette: i % 2 ? 'enemy' : 'fire' });
      w.sfx('explode_medium', b.x, b.y, { vol: 0.5 });
    });
  }
  // arms thrash and recoil
  for (const T of d.tentacles) {
    if (!T.alive) continue;
    if (T.hz) T.hz.alive = false;
    T.state = 'retract';
    T.st = 0;
    T.dur = 1.6;
    T.wT = 0;
    T.stretchT = 1;
    T.curlT = 0;
    T.vuln = 1;
    T.ph += 2;
  }
  // the clockwork heals itself: fresh arms unfurl from empty sockets (fewer, weaker ones later)
  w.after(0.9, () => {
    if (!b.alive) return;
    const n = regrowTentacles(b, w, phase === 1 ? 3 : 4, phase === 1 ? 0.6 : 0.45);
    if (n > 0) {
      // opposite side of the hull from where taunts appear, so the two never overlap
      const below = b.y < (w.renderer?.camera?.y ?? b.y);
      w.floatText(b.x, below ? b.y - 130 : b.y + 130, n > 1 ? 'THE ARMS GROW BACK!' : 'AN ARM GROWS BACK!', {
        color: '#ff9ad0', size: 18, life: 1.6, callout: true,
      });
      w.sfx('steam_vent', b.x, b.y, { vol: 0.9, pitch: 0.6 });
    }
  });
  if (phase === 1) {
    d.swayMul = 1.4;
    d.rage = 1.12;
  } else {
    d.swayMul = 1.85;
    d.rage = 1.28;
    w.after(0.7, () => {
      if (b.alive) w.sfx('boss_roar', b.x, b.y, { pitch: 1.1 });
    });
  }
}

function endTransition(b, w) {
  b.invuln = false;
  toRest(b, w);
  b.timer = 0.6;
}

// ---- Eye & ambience ---------------------------------------------------------------------------------

function updateEye(b, dt, w, p) {
  const d = b.data;
  const dx = p.x - b.x;
  const dy = p.y - b.y;
  const dl = Math.hypot(dx, dy) || 1;
  const k = Math.min(1, dt * 6);
  d.eyeX += ((dx / dl) * 9 - d.eyeX) * k;
  d.eyeY += ((dy / dl) * 9 - d.eyeY) * k;
  d.eyeFlare = Math.max(0, d.eyeFlare - dt * 1.4);
  d.blinkT -= dt;
  if (d.blinkT <= 0) {
    d.blinkT = 2.5 + w.rng.next() * 4;
    d.blinkS = 0;
  }
  if (d.blinkS !== undefined) {
    d.blinkS += dt;
    d.blink = Math.sin(clamp(d.blinkS / 0.28, 0, 1) * Math.PI);
    if (d.blinkS >= 0.28) {
      d.blinkS = undefined;
      d.blink = 0;
    }
  }
}

function updateAmbient(b, dt, w) {
  const d = b.data;
  const frac = b.hp / b.maxHp;
  d.smokeT -= dt;
  if (d.smokeT > 0) return;
  d.smokeT = frac < 0.5 ? 0.08 : 0.18;
  for (const v of VENTS) {
    const a = b.angle + v.a + 0.32;
    const x = b.x + Math.cos(a) * 66 * b.scale;
    const y = b.y + Math.sin(a) * 66 * b.scale;
    w.fx.smoke?.(x, y, frac < 0.5 ? 1.3 : 0.9, {
      count: 1, color: frac < 0.5 ? '#2a2420' : '#8f8a7a', color1: '#141010', alpha: frac < 0.5 ? 0.6 : 0.35, life: 1.4,
    });
  }
  if (frac < 0.5) {
    const n = frac < PHASE3 ? 4 : 2;
    for (let i = 0; i < n; i++) {
      const a = b.angle + (i / n) * TAU + 0.6;
      const r = 44 + (i % 2) * 24;
      w.fx.burn?.(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, 1.1);
    }
    if (frac < PHASE3 && Math.random() < 0.3) {
      const a = w.rng.angle();
      w.fx.sparks?.(b.x + Math.cos(a) * 60, b.y + Math.sin(a) * 60, a, 3, '#ffd28a', 0.8, { speed: 240 });
    }
  }
}

// ---- Drawing ----------------------------------------------------------------------------------------

function drawBody(ctx, b, w) {
  const d = b.data;
  const alive = b.alive;
  const frac = clamp(b.hp / b.maxHp, 0, 1);
  // tremble while winding up a charge
  let ox = 0;
  let oy = 0;
  if (b.state === 'chargeWarn') {
    ox = Math.sin(d.t * 70) * 3;
    oy = Math.cos(d.t * 63) * 3;
  }
  const x = b.x + ox;
  const y = b.y + oy;
  const f = b.flash;
  b.flash = f * 0.35; // soft flash so sustained fire doesn't bleach the dome
  w.drawEnemySprite(ctx, b, 'boss_kraken', 0, b.angle, x, y, b.scale);
  b.flash = f;
  const dead = !alive;
  const sc = b.scale;
  if (dead) Sprites.drawTint(ctx, 'boss_kraken', x, y, b.angle, sc, '#1c120a', 0.55 * b.alpha);
  // damage decal
  const dmg = dead ? 1 : clamp((0.9 - frac) * 1.4, 0, 1);
  if (dmg > 0) Sprites.draw(ctx, 'boss_kraken_cracks', x, y, b.angle, sc, dmg * b.alpha);
  // stumps over severed sockets
  for (const T of d.tentacles) {
    if (T.alive) continue;
    const a = b.angle + T.base;
    Sprites.draw(ctx, 'boss_kraken_stump', x + Math.cos(a) * 92 * sc, y + Math.sin(a) * 92 * sc, a, sc, b.alpha);
  }
  // the eye: iris, slit pupil tracking the player, clockwork shutter blink
  const ex = x + d.eyeX * 0.5 * sc;
  const ey = y + d.eyeY * 0.5 * sc;
  const eyeS = Sprites.get('boss_kraken_eye');
  ctx.save();
  ctx.globalAlpha = b.alpha;
  ctx.beginPath();
  ctx.arc(x, y, 30 * sc, 0, TAU);
  ctx.clip();
  ctx.translate(ex, ey);
  ctx.rotate(d.t * 0.25);
  ctx.drawImage(eyeS.img, -40 * sc, -40 * sc, 80 * sc, 80 * sc);
  ctx.rotate(-d.t * 0.25);
  if (dead) {
    ctx.fillStyle = 'rgba(10,6,6,0.75)';
    ctx.fillRect(-40, -40, 80, 80);
  } else {
    const pa = Math.atan2(d.eyeY, d.eyeX);
    const dil = 1 - d.eyeFlare * 0.45;
    ctx.translate(d.eyeX * 0.6 * sc, d.eyeY * 0.6 * sc);
    ctx.rotate(pa);
    ctx.fillStyle = '#0a0404';
    ctx.beginPath();
    ctx.ellipse(0, 0, 4.2 * sc * dil + 1, 13 * sc, 0, 0, TAU);
    ctx.fill();
    ctx.rotate(-pa);
    // shutter blades closing toward the centre
    if (d.blink > 0) {
      const r0 = 31 * sc;
      const r1 = r0 * (1 - d.blink);
      ctx.fillStyle = '#3a2a1c';
      ctx.beginPath();
      ctx.arc(-d.eyeX * 0.6 * sc, -d.eyeY * 0.6 * sc, r0 + 4, 0, TAU);
      ctx.arc(-d.eyeX * 0.6 * sc, -d.eyeY * 0.6 * sc, Math.max(0.1, r1), 0, TAU, true);
      ctx.fill('evenodd');
      ctx.strokeStyle = 'rgba(242,212,138,0.6)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + d.blink;
        ctx.beginPath();
        ctx.moveTo(-d.eyeX * 0.6 * sc + Math.cos(a) * r1, -d.eyeY * 0.6 * sc + Math.sin(a) * r1);
        ctx.lineTo(-d.eyeX * 0.6 * sc + Math.cos(a + 0.6) * r0, -d.eyeY * 0.6 * sc + Math.sin(a + 0.6) * r0);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
  if (dead) return;
  // additive light: eye glow (magenta when enraged), portholes pulse, grab ring on held player
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glowS = Sprites.get(b.phase >= 2 ? 'boss_kraken_glowP' : 'boss_kraken_glow');
  const eg = (0.45 + 0.55 * d.eyeFlare) * (1 - d.blink * 0.8) * b.alpha;
  const er = (44 + 26 * d.eyeFlare) * sc;
  ctx.globalAlpha = eg;
  ctx.drawImage(glowS.img, ex - er, ey - er, er * 2, er * 2);
  const pg = Sprites.get('boss_kraken_glow');
  const pulse = 0.35 + 0.25 * Math.sin(d.t * 3);
  for (let k = 0; k < PORTHOLES; k++) {
    const a = b.angle + (k / PORTHOLES) * TAU + 0.15;
    const px = x + Math.cos(a) * 52 * sc;
    const py = y + Math.sin(a) * 52 * sc;
    const flick = frac < 0.5 && (k * 7 + ((d.t * 9) | 0)) % 11 === 0 ? 0.1 : 1;
    ctx.globalAlpha = pulse * flick * b.alpha;
    ctx.drawImage(pg.img, px - 12 * sc, py - 12 * sc, 24 * sc, 24 * sc);
  }
  if (d.grab?.p?.alive) {
    const p = d.grab.p;
    const pp = Sprites.get('boss_kraken_glowP');
    const r = 34 + 6 * Math.sin(d.t * 18);
    ctx.globalAlpha = 0.7;
    ctx.drawImage(pp.img, p.x - r, p.y - r, r * 2, r * 2);
  }
  ctx.restore();
  if (d.grab?.p?.alive) {
    // "boost!" prompt ring
    const p = d.grab.p;
    const k = 1 - clamp(d.grab.t / 1.9, 0, 1);
    ctx.save();
    ctx.strokeStyle = '#ff9ad0';
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 30, -Math.PI / 2, -Math.PI / 2 + TAU * k);
    ctx.stroke();
    ctx.restore();
  }
}

