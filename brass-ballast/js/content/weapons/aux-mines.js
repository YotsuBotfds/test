// Mine Layer & Devil's Minefield (WP18, DESIGN §2.7). A stern chute drops brass proximity mines
// into the ship's wake; they arm after a moment (blinking amber → red), and detonate when a foe
// strays close. The Devil's Minefield hurls spiked mines all around, which creep toward prey
// and set each other off in chain detonations.

import { Sprites } from '../../gfx/sprites.js';
import {
  TAU, dmgScale, cdScale, areaScale, durScale, extraProj, lv, ready, mount, glowAt, blast,
  onScreen,
} from './aux-common.js';

const SRC = 'aux:mineLayer';
const SRC_EVO = 'aux:devilsMinefield';

const INTERVAL = [1.5, 1.5, 1.2, 1.2, 1.2];
const DMG = [25, 32, 32, 32, 40];
const RADIUS = [60, 60, 60, 75, 75];
const MAX = [8, 8, 10, 10, 12];
const PER_DROP = [1, 1, 1, 1, 2];

const LEVELS = [
  'Drops a proximity mine behind you every 1.5 s (25 damage, blast radius 60). Up to 8 live mines.',
  'Damage 25 → 32.',
  'Drops every 1.2 s; up to 10 mines.',
  'Blast radius 60 → 75.',
  'Mines drop in pairs; damage 32 → 40; up to 12 mines.',
];

const ARM = 0.6;
const LIFE = 16;
const Q = [];
const TMP = { x: 0, y: 0 };

function freshMine(list) {
  for (let i = 0; i < list.length; i++) if (!list[i].alive) return list[i];
  const m = {
    alive: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, arm: ARM, life: LIFE, fuse: -1, rot: 0, vr: 0,
    born: 0, devil: false, throwT: 0, throwDur: 0, sx: 0, sy: 0, tx: 0, ty: 0, z: 0,
  };
  list.push(m);
  return m;
}

function liveCount(list) {
  let n = 0;
  for (let i = 0; i < list.length; i++) if (list[i].alive) n++;
  return n;
}

/** When at capacity, the oldest mine detonates to make room (still useful, never wasted). */
function makeRoom(list, max) {
  let n = liveCount(list);
  while (n >= max) {
    let old = null;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (m.alive && m.fuse < 0 && (!old || m.born < old.born)) old = m;
    }
    if (!old) break;
    old.fuse = 0.05;
    old.t = Math.max(old.t, old.arm);
    n--;
  }
}

function detonate(p, slot, w, m, evo) {
  const d = slot.data;
  m.alive = false;
  const area = areaScale(p);
  const r = d.radius * area;
  blast(w, p, m.x, m.y, r, d.dmg, evo ? SRC_EVO : SRC, {
    visual: evo ? (r >= 90 ? 'large' : 'medium') : r >= 70 ? 'medium' : 'small',
    sound: evo ? 'explode_medium' : 'explode_small',
    shake: evo ? 0.1 : 0.06,
    knockback: evo ? 320 : 240,
    falloff: 0.3,
    burn: evo ? d.burn : undefined,
  });
  if (evo) {
    w.fx.shockwave?.(m.x, m.y, r * 1.1, '#ff6a3a', 0.35);
    // Chain detonations: nearby mines go off in a rippling cascade.
    const cr = 170 * area;
    const list = d.mines;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (!o.alive || o.fuse >= 0 || o.throwT < o.throwDur) continue;
      const dx = o.x - m.x;
      const dy = o.y - m.y;
      if (dx * dx + dy * dy < cr * cr) o.fuse = 0.09 + Math.random() * 0.1;
    }
  }
}

function updateMines(p, slot, dt, w, evo) {
  const d = slot.data;
  const list = d.mines;
  const area = areaScale(p);
  const trig = (evo ? 62 : 46) * Math.sqrt(area);
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (!m.alive) continue;
    m.rot += m.vr * dt;
    if (m.throwT < m.throwDur) {
      m.throwT += dt;
      const k = Math.min(1, m.throwT / m.throwDur);
      m.x = m.sx + (m.tx - m.sx) * k;
      m.y = m.sy + (m.ty - m.sy) * k;
      m.z = 46 * 4 * k * (1 - k);
      if (k >= 1) {
        m.z = 0;
        m.t = 0;
        m.vr *= 0.25;
        w.fx.smoke?.(m.x, m.y, 0.35, LAND_PUFF);
      }
      continue;
    }
    m.t += dt;
    // Drift & settle.
    const k = Math.exp(-2.4 * dt);
    m.vx *= k;
    m.vy *= k;
    m.vr *= Math.exp(-1.2 * dt);
    if (evo && m.t > m.arm && m.fuse < 0) {
      // Devil's mines creep toward prey.
      const e = w.nearestEnemy(m.x, m.y, 210 * area);
      if (e) {
        const dx = e.x - m.x;
        const dy = e.y - m.y;
        const dist = Math.hypot(dx, dy) || 1;
        m.vx += (dx / dist) * 160 * dt;
        m.vy += (dy / dist) * 160 * dt;
      }
    }
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    if (m.fuse >= 0) {
      m.fuse -= dt;
      if (m.fuse <= 0) detonate(p, slot, w, m, evo);
      continue;
    }
    if (m.t >= m.life) {
      m.fuse = 0.01;
      continue;
    }
    if (m.t < m.arm) continue;
    Q.length = 0;
    w.queryEnemies(m.x, m.y, trig, Q);
    if (Q.length) {
      m.fuse = evo ? 0.06 : 0.12;
      if (!evo) w.sfx('ui_toggle', m.x, m.y, { vol: 0.25, pitch: 1.8 });
    }
  }
  Q.length = 0;
}
const LAND_PUFF = { count: 1, alpha: 0.35, life: 0.6 };

function drawMines(ctx, p, slot, w, evo) {
  const list = slot.data.mines;
  if (!list) return;
  const area = Math.sqrt(areaScale(p));
  const sprite = evo ? 'aux_devil_mine' : 'pb_mine';
  const base = (evo ? 1.05 : 0.95) * area;
  const t = w.time;
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (!m.alive || !onScreen(w, m.x, m.y, 40)) continue;
    const flying = m.throwT < m.throwDur;
    const sc = base * (1 + m.z / 70);
    // Shadow (a mine in flight casts it further away).
    Sprites.drawTint(ctx, sprite, m.x + 5 + m.z * 0.35, m.y + 7 + m.z * 0.45, m.rot, base * 0.9, '#000000', 0.25);
    const armed = !flying && m.t >= m.arm;
    Sprites.draw(ctx, sprite, m.x, m.y - m.z, m.rot, sc, armed ? 1 : 0.85);
    if (flying) continue;
    if (!armed) {
      // Arming: dim amber pulse that quickens.
      const k = m.t / m.arm;
      glowAt(ctx, 'aux_glow_gold', m.x, m.y, 5 + 3 * k, 0.25 + 0.3 * k * (0.5 + 0.5 * Math.sin(t * 30)));
      continue;
    }
    const per = m.fuse >= 0 ? 0.06 : evo ? 0.5 : 0.85;
    const on = ((t + m.born * 0.37) % per) < per * 0.45;
    if (on) glowAt(ctx, 'aux_glow_red', m.x, m.y, m.fuse >= 0 ? 16 : evo ? 11 : 9, 0.95);
    // Arm "tick": a ring the instant it becomes live.
    const since = m.t - m.arm;
    if (since < 0.3) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - since / 0.3) * 0.6;
      ctx.strokeStyle = evo ? '#ff6a4a' : '#ffcf4a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 10 + since * 90, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }
}

function fizzleAll(slot, w) {
  const list = slot.data.mines || [];
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (!m.alive) continue;
    m.alive = false;
    w.fx.smoke?.(m.x, m.y, 0.4, LAND_PUFF);
    w.fx.sparks?.(m.x, m.y, 0, 3, '#ffcf4a', TAU);
  }
}

export const MineLayer = {
  maxLevel: 5,
  levelDesc: (level) => lv(LEVELS, level),

  init(p, slot) {
    slot.data.mines = [];
    slot.data.chute = 0;
    slot.cd = 0.5;
  },

  update(p, slot, dt, w) {
    const d = slot.data;
    if (!d.mines) MineLayer.init(p, slot);
    const i = slot.level;
    d.dmg = lv(DMG, i) * dmgScale(p, w);
    d.radius = lv(RADIUS, i);
    d.chute = Math.max(0, d.chute - dt * 4);
    updateMines(p, slot, dt, w, false);
    if (!ready(slot, dt, lv(INTERVAL, i) * cdScale(p))) return;
    const n = lv(PER_DROP, i) + extraProj(p);
    const max = lv(MAX, i) + extraProj(p) * 2;
    makeRoom(d.mines, max - n + 1);
    const st = mount(p, -0.5, 0, TMP);
    const back = p.angle + Math.PI;
    for (let k = 0; k < n; k++) {
      const m = freshMine(d.mines);
      const off = n > 1 ? (k / (n - 1) - 0.5) * 2 : 0;
      const side = back + Math.PI / 2;
      m.alive = true;
      m.devil = false;
      m.x = st.x + Math.cos(side) * off * 10;
      m.y = st.y + Math.sin(side) * off * 10;
      const sp = 130 + Math.random() * 40;
      m.vx = Math.cos(back + off * 0.5) * sp + p.vx * 0.25;
      m.vy = Math.sin(back + off * 0.5) * sp + p.vy * 0.25;
      m.t = 0;
      m.arm = ARM;
      m.life = LIFE * durScale(p);
      m.fuse = -1;
      m.rot = Math.random() * TAU;
      m.vr = (Math.random() - 0.5) * 8;
      m.born = w.time + k * 0.001;
      m.throwT = 0;
      m.throwDur = 0;
      m.z = 0;
    }
    d.chute = 1;
    slot.kick = 1;
    w.fx.smoke?.(st.x, st.y, 0.3, LAND_PUFF);
    w.sfx('mine_drop', st.x, st.y, { vol: 0.7 });
  },

  drawUnder(ctx, p, slot, w) {
    drawMines(ctx, p, slot, w, false);
  },

  draw(ctx, p, slot) {
    const m = mount(p, -0.44, 0, TMP, true);
    Sprites.draw(ctx, 'aux_chute', m.x, m.y, p.angle, 1);
    const k = slot.data.chute;
    if (k > 0.05) glowAt(ctx, 'aux_glow_gold', m.x, m.y, 8 * k, 0.6 * k);
  },

  remove(p, slot, w) {
    fizzleAll(slot, w);
  },
};

// ---- Devil's Minefield --------------------------------------------------------------------------

const EVO_INTERVAL = 0.38;
const EVO_DMG = 50;
const EVO_R = 100;
const EVO_MAX = 36;
const RING_EVERY = 5;
const RING_COUNT = 8;

function throwMine(p, slot, w, tx, ty) {
  const d = slot.data;
  const m = freshMine(d.mines);
  m.alive = true;
  m.devil = true;
  m.sx = p.x;
  m.sy = p.y;
  m.x = p.x;
  m.y = p.y;
  m.tx = tx;
  m.ty = ty;
  m.throwT = 0;
  m.throwDur = 0.35 + Math.hypot(tx - p.x, ty - p.y) / 900;
  m.vx = 0;
  m.vy = 0;
  m.t = 0;
  m.arm = 0.35;
  m.life = 20 * durScale(p);
  m.fuse = -1;
  m.rot = Math.random() * TAU;
  m.vr = (Math.random() - 0.5) * 16;
  m.born = w.time + Math.random() * 0.001;
  m.z = 0;
}

export const DevilsMinefield = {
  maxLevel: 1,

  init(p, slot) {
    slot.data.mines = [];
    slot.data.ring = 0.8; // open with a ring of mines for a dramatic entrance
    slot.data.burn = { dps: 8, time: 2 };
    slot.cd = 0.3;
  },

  update(p, slot, dt, w) {
    const d = slot.data;
    if (!d.mines || !d.burn) DevilsMinefield.init(p, slot);
    const sc = dmgScale(p, w);
    d.dmg = EVO_DMG * sc;
    d.radius = EVO_R;
    d.burn.dps = 8 * sc;
    d.burn.time = 2 * durScale(p);
    updateMines(p, slot, dt, w, true);
    const max = EVO_MAX + extraProj(p) * 4;
    d.ring -= dt;
    if (d.ring <= 0) {
      d.ring = RING_EVERY * cdScale(p);
      makeRoom(d.mines, max - RING_COUNT + 1);
      const a0 = w.rng.next() * TAU;
      const r = 190 * Math.sqrt(areaScale(p));
      for (let k = 0; k < RING_COUNT; k++) {
        const a = a0 + (k / RING_COUNT) * TAU;
        throwMine(p, slot, w, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
      }
      w.fx.ring?.(p.x, p.y, r, '#ff6a4a', 0.5, { width: 3 });
      w.sfx('mine_drop', p.x, p.y, { vol: 0.9, pitch: 0.8 });
    }
    if (!ready(slot, dt, EVO_INTERVAL * cdScale(p))) return;
    const n = 1 + extraProj(p);
    makeRoom(d.mines, max - n + 1);
    for (let k = 0; k < n; k++) {
      const a = w.rng.next() * TAU;
      const r = (80 + w.rng.next() * 200) * Math.sqrt(areaScale(p));
      throwMine(p, slot, w, p.x + p.vx * 0.3 + Math.cos(a) * r, p.y + p.vy * 0.3 + Math.sin(a) * r);
    }
    w.sfx('mine_drop', p.x, p.y, { vol: 0.4, pitch: 1.25 + w.rng.next() * 0.2 });
  },

  drawUnder(ctx, p, slot, w) {
    drawMines(ctx, p, slot, w, true);
  },

  draw(ctx, p, slot) {
    const m = mount(p, -0.44, 0, TMP, true);
    Sprites.draw(ctx, 'aux_chute', m.x, m.y, p.angle, 1.15);
    glowAt(ctx, 'aux_glow_red', m.x, m.y, 9, 0.35 + 0.25 * Math.sin(p.t * 6));
  },

  remove(p, slot, w) {
    fizzleAll(slot, w);
  },
};
