// Clockwork Drones & Clockwork Armada (WP18, DESIGN §2.7). Wind-up brass drones orbit the ship
// on springy tethers, swivel toward the nearest foe and pepper it with aether rounds. The
// Armada flies six in a rotating hex formation, fires faster and sends kamikaze divers.

import { Sprites } from '../../gfx/sprites.js';
import { rotateToward, angleDiff } from '../../core/math.js';
import {
  TAU, dmgScale, cdScale, areaScale, extraProj, lv, nearestN, glowAt, blast, onScreen,
} from './aux-common.js';

const SRC = 'aux:clockDrones';
const SRC_EVO = 'aux:droneArmada';

const COUNT = [1, 2, 2, 3, 3];
const RATE = [2, 2, 2.5, 2.5, 3];
const DMG = [6, 6, 9, 9, 12];
const PIERCE = [0, 0, 0, 0, 1];

const LEVELS = [
  'A clockwork drone orbits your ship and fires 2 shots/s (6 damage) at the nearest foe.',
  '+1 drone (2).',
  'Damage 6 → 9; fire rate 2 → 2.5/s.',
  '+1 drone (3).',
  'Fire rate 3/s; damage 12; rounds pierce 1 foe.',
];

const RANGE = 420;
const BULLET_SPEED = 820;
const TGT = [];
const MAX_DRONES = 10;

const BULLET = {
  team: 'player', kind: 'bullet', x: 0, y: 0, angle: 0, speed: BULLET_SPEED, r: 4, damage: 6,
  life: 0.65, pierce: 0, owner: null, source: SRC, glow: '#7ff3ff', glowSize: 2.6, scale: 1,
  knockback: 25, trail: null,
};

function newDrone(p, i) {
  return {
    x: p.x, y: p.y, aim: p.angle, cd: 0.2 + i * 0.13, kick: 0, phase: i * 1.7,
    state: 'fly', t: 0, tx: 0, ty: 0, target: null, vx: 0, vy: 0, spawnT: 0.6,
  };
}

function ensureDrones(p, slot, n) {
  const list = slot.data.drones || (slot.data.drones = []);
  while (list.length < n) {
    const dr = newDrone(p, list.length);
    list.push(dr);
    p.world?.fx?.sparkle?.(p.x, p.y, '#ffcf4a', 6, 20);
  }
  if (list.length > n) list.length = n;
  return list;
}

/** Fire one round from drone `dr` at enemy `e`. */
function shoot(p, w, dr, e, dmg, pierce, src, scale) {
  const a = dr.aim;
  const o = BULLET;
  o.x = dr.x + Math.cos(a) * 11;
  o.y = dr.y + Math.sin(a) * 11;
  o.angle = a + (Math.random() - 0.5) * 0.04;
  o.speed = BULLET_SPEED * (p.stats.projSpeed ?? 1);
  o.damage = dmg;
  o.pierce = pierce;
  o.owner = p;
  o.source = src;
  o.scale = scale;
  o.glow = src === SRC_EVO ? '#ffe08a' : '#7ff3ff';
  w.fire(o);
  o.owner = null;
  dr.kick = 1;
  w.fx.muzzle?.(o.x, o.y, a, 0.32, src === SRC_EVO ? '#ffe08a' : '#7ff3ff');
  w.sfx('drone_fire', dr.x, dr.y, { vol: 0.35, pitch: 0.95 + Math.random() * 0.2 });
}

/** Common drone steering + gunnery. `slots(i)` gives each drone's formation point. */
function driveDrones(p, slot, dt, w, list, formation, rate, dmg, pierce, src, scale) {
  const d = slot.data;
  const follow = 1 - Math.exp(-7 * dt);
  const interval = cdScale(p) / rate;
  slot.cdMax = interval;
  for (let i = 0; i < list.length; i++) {
    const dr = list[i];
    dr.kick = Math.max(0, dr.kick - dt * 6);
    dr.t += dt;
    if (dr.state !== 'fly') continue;
    if (dr.spawnT > 0) dr.spawnT -= dt;
    formation(p, d, i, list.length, dr);
    const bobx = Math.cos(p.t * 2.1 + dr.phase) * 3;
    const boby = Math.sin(p.t * 2.7 + dr.phase) * 3;
    dr.x += (dr.tx + bobx - dr.x) * follow;
    dr.y += (dr.ty + boby - dr.y) * follow;
    nearestN(w, dr.x, dr.y, RANGE, 1, TGT);
    const e = TGT[0];
    if (e) {
      const want = Math.atan2(e.y - dr.y, e.x - dr.x);
      dr.aim = rotateToward(dr.aim, want, 12 * dt);
      dr.cd -= dt;
      if (dr.cd <= 0 && Math.abs(angleDiff(dr.aim, want)) < 0.35) {
        dr.cd = interval * (0.92 + Math.random() * 0.16);
        shoot(p, w, dr, e, dmg, pierce, src, scale);
      }
    } else {
      dr.aim = rotateToward(dr.aim, p.angle, 3 * dt);
      dr.cd = Math.max(dr.cd - dt, 0);
    }
  }
  TGT.length = 0;
  slot.cd = list.length ? Math.max(0, list[0].cd) : 0;
}

function orbitFormation(p, d, i, n, dr) {
  const r = (58 + n * 6) * Math.sqrt(areaScale(p));
  const a = d.orbit + (i / n) * TAU;
  dr.tx = p.x + Math.cos(a) * r;
  dr.ty = p.y + Math.sin(a) * r;
}

function drawDroneShadows(ctx, list, scale) {
  for (let i = 0; i < list.length; i++) {
    const dr = list[i];
    if (dr.state === 'rebuild') continue;
    Sprites.drawTint(ctx, 'pb_drone', dr.x + 9, dr.y + 12, dr.aim, scale * 0.9, '#000000', 0.22);
  }
}

function drawDrones(ctx, p, list, scale, gold, w) {
  const frame = (p.t * 24) & 1;
  for (let i = 0; i < list.length; i++) {
    const dr = list[i];
    if (dr.state === 'rebuild' || !onScreen(w, dr.x, dr.y)) continue;
    const k = dr.kick * 2;
    const x = dr.x - Math.cos(dr.aim) * k;
    const y = dr.y - Math.sin(dr.aim) * k;
    const sc = scale * (dr.spawnT > 0 ? 1 - dr.spawnT * 1.2 : 1);
    if (sc <= 0.05) continue;
    if (gold) Sprites.drawOutline(ctx, 'pb_drone', x, y, dr.aim, sc, '#ffcf4a', 0.7, frame);
    Sprites.draw(ctx, 'pb_drone', x, y, dr.aim, sc, 1, frame);
    glowAt(ctx, gold ? 'aux_glow_gold' : 'aux_glow_aether', x + Math.cos(dr.aim) * 4 * sc, y + Math.sin(dr.aim) * 4 * sc, 5 + 4 * dr.kick, 0.45 + 0.4 * dr.kick);
  }
}

export const ClockDrones = {
  maxLevel: 5,
  levelDesc: (level) => lv(LEVELS, level),

  init(p, slot) {
    slot.data.orbit = 0;
    slot.data.drones = [];
  },

  update(p, slot, dt, w) {
    const i = slot.level;
    const d = slot.data;
    const n = Math.min(MAX_DRONES, lv(COUNT, i) + Math.min(2, extraProj(p)));
    const list = ensureDrones(p, slot, n);
    d.orbit = (d.orbit || 0) + dt * 1.5;
    const scale = Math.sqrt(areaScale(p)) * 1.05;
    driveDrones(p, slot, dt, w, list, orbitFormation, lv(RATE, i), lv(DMG, i) * dmgScale(p, w), lv(PIERCE, i), SRC, scale);
  },

  drawUnder(ctx, p, slot) {
    if (slot.data.drones) drawDroneShadows(ctx, slot.data.drones, 1.05);
  },

  draw(ctx, p, slot, w) {
    if (slot.data.drones) drawDrones(ctx, p, slot.data.drones, Math.sqrt(areaScale(p)) * 1.05, false, w);
  },

  remove(p, slot, w) {
    for (const dr of slot.data.drones || []) w.fx.sparkle?.(dr.x, dr.y, '#ffcf4a', 4, 10);
  },
};

// ---- Clockwork Armada ---------------------------------------------------------------------------

const EVO_COUNT = 6;
const EVO_RATE = 4;
const EVO_DMG = 12;
const DIVE_EVERY = 2.4;
const DIVE_DMG = 55;
const DIVE_R = 80;
const REBUILD = 1.8;

function hexFormation(p, d, i, n, dr) {
  // Rotating ring that leans toward the ship's heading (a wedge escort).
  const r = 96 * Math.sqrt(areaScale(p));
  const a = d.orbit + (i / n) * TAU;
  const lean = 18;
  dr.tx = p.x + Math.cos(a) * r + Math.cos(p.angle) * lean;
  dr.ty = p.y + Math.sin(a) * r * 0.9 + Math.sin(p.angle) * lean;
}

function pickDiveTarget(w, p) {
  // Prefer the toughest foe nearby (elites/warships), else the nearest.
  nearestN(w, p.x, p.y, 560, 8, TGT);
  let best = null;
  let bs = -1;
  for (let i = 0; i < TGT.length; i++) {
    const e = TGT[i];
    const s = (e.hp || 0) * (e.elite ? 2 : 1) * (e.isBoss || e.parent ? 1.5 : 1);
    if (s > bs) {
      bs = s;
      best = e;
    }
  }
  TGT.length = 0;
  return best;
}

function detonate(p, w, dr) {
  const area = areaScale(p);
  blast(w, p, dr.x, dr.y, DIVE_R * area, DIVE_DMG * dmgScale(p, w), SRC_EVO, {
    visual: 'medium', sound: 'explode_medium', shake: 0.12, knockback: 260, falloff: 0.3,
  });
  w.fx.cogs?.(dr.x, dr.y, 5);
  w.fx.debris?.(dr.x, dr.y, 4, 'brass');
  dr.state = 'rebuild';
  dr.t = 0;
  dr.target = null;
}

export const DroneArmada = {
  maxLevel: 1,

  init(p, slot) {
    slot.data.orbit = 0;
    slot.data.drones = [];
    slot.data.dive = DIVE_EVERY;
    slot.data.next = 0;
  },

  update(p, slot, dt, w) {
    const d = slot.data;
    const n = Math.min(MAX_DRONES, EVO_COUNT + extraProj(p));
    const list = ensureDrones(p, slot, n);
    d.orbit = (d.orbit || 0) + dt * 0.7;
    const scale = Math.sqrt(areaScale(p)) * 1.2;

    // Kamikaze scheduling.
    d.dive -= dt;
    if (d.dive <= 0) {
      d.dive = DIVE_EVERY * cdScale(p);
      const target = pickDiveTarget(w, p);
      if (target) {
        for (let k = 0; k < list.length; k++) {
          const dr = list[(d.next + k) % list.length];
          if (dr.state !== 'fly' || dr.spawnT > 0) continue;
          d.next = (d.next + k + 1) % list.length;
          dr.state = 'dive';
          dr.t = 0;
          dr.target = target;
          const a = Math.atan2(target.y - dr.y, target.x - dr.x);
          dr.vx = Math.cos(a) * 160;
          dr.vy = Math.sin(a) * 160;
          w.sfx('wasp_charge', dr.x, dr.y, { vol: 0.35, pitch: 1.6 });
          w.fx.ring?.(dr.x, dr.y, 26, '#ffcf4a', 0.25);
          break;
        }
      }
    }

    for (let i = 0; i < list.length; i++) {
      const dr = list[i];
      if (dr.state === 'dive') {
        const e = dr.target;
        if (e && e.alive) {
          dr.tx = e.x;
          dr.ty = e.y;
        }
        const dx = dr.tx - dr.x;
        const dy = dr.ty - dr.y;
        const dist = Math.hypot(dx, dy) || 1;
        const acc = 2600;
        dr.vx += (dx / dist) * acc * dt;
        dr.vy += (dy / dist) * acc * dt;
        const sp = Math.hypot(dr.vx, dr.vy);
        const max = 820;
        if (sp > max) {
          dr.vx *= max / sp;
          dr.vy *= max / sp;
        }
        dr.x += dr.vx * dt;
        dr.y += dr.vy * dt;
        dr.aim = Math.atan2(dr.vy, dr.vx);
        if ((Math.random() < 0.7)) w.fx.trail?.(dr.x, dr.y, '#ffb347', 8, 0.18);
        if (Math.random() < 0.3) w.fx.smokeTrail?.(dr.x, dr.y, 0.3);
        if (dist < (e?.r || 10) + 8 || dr.t > 1.6) detonate(p, w, dr);
      } else if (dr.state === 'rebuild') {
        if (dr.t >= REBUILD * cdScale(p)) {
          dr.state = 'fly';
          dr.x = p.x;
          dr.y = p.y;
          dr.spawnT = 0.5;
          w.fx.sparkle?.(p.x, p.y, '#ffcf4a', 6, 18);
        }
      }
    }
    driveDrones(p, slot, dt, w, list, hexFormation, EVO_RATE * (p.stats.fireRate ?? 1), EVO_DMG * dmgScale(p, w), 1, SRC_EVO, scale);
    slot.cdMax = DIVE_EVERY * cdScale(p);
    slot.cd = Math.max(0, d.dive);
  },

  drawUnder(ctx, p, slot) {
    const list = slot.data.drones;
    if (!list) return;
    drawDroneShadows(ctx, list, 1.2);
    // Formation links: faint aether lines between neighbours in formation.
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = '#ffe08a';
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.16 + 0.06 * Math.sin(p.t * 4);
    ctx.beginPath();
    const n = list.length;
    for (let i = 0; i < n && n > 2; i++) {
      const a = list[i];
      const b = list[(i + 1) % n];
      if (a.state !== 'fly' || b.state !== 'fly') continue;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  },

  draw(ctx, p, slot, w) {
    const list = slot.data.drones;
    if (!list) return;
    drawDrones(ctx, p, list, Math.sqrt(areaScale(p)) * 1.2, true, w);
    for (let i = 0; i < list.length; i++) {
      const dr = list[i];
      if (dr.state !== 'dive') continue;
      glowAt(ctx, 'aux_glow_fire', dr.x - Math.cos(dr.aim) * 8, dr.y - Math.sin(dr.aim) * 8, 14, 0.8);
      glowAt(ctx, 'aux_glow_red', dr.x, dr.y, 10, 0.5 + 0.5 * Math.sin(dr.t * 40));
    }
  },

  remove(p, slot, w) {
    for (const dr of slot.data.drones || []) w.fx.sparkle?.(dr.x, dr.y, '#ffcf4a', 4, 10);
  },
};
