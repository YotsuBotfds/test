// Enemy entities & per-frame pipeline (DESIGN §4.4). World owns the list; this module creates
// enemies from defs, runs the update pipeline, draws them, and manages falling wrecks.
//
// Pipeline per enemy: t += dt → (fleeing override | def.update) → integrate unless
// def.manualMove → decay knockback/flash → burn ticks → slow decay → soft separation →
// contact damage → recycle when > 2600 from every player.

import { Sprites } from '../gfx/sprites.js';
import { SHADOW_OFFSET } from '../config.js';
import { TAU, clamp } from '../core/math.js';

let nextId = 1;

/** Fallback def used when content asks for an unknown enemy id. */
const GENERIC = {
  id: 'generic',
  name: 'Unknown Craft',
  hp: 20,
  r: 16,
  speed: 120,
  contactDamage: 10,
  xp: 1,
  cogs: 0.3,
  score: 10,
  sprite: 'enemy_gyroScout',
  update(e, dt, world) {
    const p = world.nearestPlayer(e.x, e.y);
    if (!p) return;
    const a = Math.atan2(p.y - e.y, p.x - e.x);
    e.angle = a;
    e.vx = Math.cos(a) * this.speed * e.speedMult;
    e.vy = Math.sin(a) * this.speed * e.speedMult;
  },
};

const ELITE_AFFIXES = ['armored', 'overclocked', 'volatile'];
export const ELITE_COLORS = { armored: '#ffcf4a', overclocked: '#ffb02e', volatile: '#ff7a3d' };

/** Enemy instance. Plain fields; see DESIGN §4.4 / docs/ENGINE.md. */
export class Enemy {}

/**
 * Build an enemy from a def. Called by world.spawnEnemy.
 * @param {import('./world.js').World} w
 */
export function createEnemy(w, def, x, y, opts = {}) {
  if (!def) def = GENERIC;
  const run = w.run;
  const mods = run?.mods || {};
  const stage = run?.stage || {};
  const e = new Enemy();
  e.id = nextId++;
  e.type = def.id;
  e.def = def;
  e.name = def.name || def.id;
  e.team = 'enemy';
  e.x = x;
  e.y = y;
  e.vx = opts.vx ?? 0;
  e.vy = opts.vy ?? 0;
  e.r = opts.r ?? def.r ?? 16;
  e.angle = opts.angle ?? 0;
  e.scale = opts.scale ?? def.scale ?? 1;
  e.alpha = 1;
  e.alt = opts.alt ?? def.alt ?? 1;
  e.layer = opts.layer ?? def.layer ?? 0;
  e.sprite = opts.sprite ?? def.sprite ?? null;
  e.frame = 0;
  e.t = 0;
  e.alive = true;
  e.dead = false;
  e.parent = opts.parent || null;
  e.parts = null;
  const isBoss = !!(opts.boss ?? (def.boss && !e.parent));
  e.isBoss = isBoss;
  e.wave = opts.wave ?? false;
  e.phase = 0;
  // Elite & affix.
  let elite = opts.elite ?? null;
  if (elite === true) elite = ELITE_AFFIXES[(w.rng.next() * ELITE_AFFIXES.length) | 0];
  if (isBoss || def.noElite) elite = null;
  e.elite = elite || null;
  // Scaling (DESIGN §2.10): bosses & their parts use bossHpMult, not stage hpMult.
  const bossy = isBoss || !!e.parent?.isBoss || def.boss;
  const alive = w.alivePlayerCount();
  const coop = 1 + 0.5 * Math.max(0, alive - 1);
  let hpMult = (mods.enemyHp ?? 1) * coop * (opts.hpMult ?? 1);
  hpMult *= bossy ? (run?.bossHpMult ?? 1) : (stage.hpMult ?? 1);
  if (e.elite) hpMult *= 2.5;
  const baseHp = opts.hp ?? def.hp ?? 10;
  e.maxHp = opts.rawHp ?? Math.max(1, Math.round(baseHp * hpMult));
  e.hp = e.maxHp;
  e.dmgMult = (stage.dmgMult ?? 1) * (mods.enemyDmg ?? 1) * (opts.dmgMult ?? 1);
  e.speedMult = (mods.enemySpeed ?? 1) * (opts.speedMult ?? 1);
  // Stage fire-rate pressure applies to the rank and file; boss patterns keep their tuning.
  e.fireRateMult = (opts.fireRateMult ?? 1) * (bossy ? 1 : run?.enemyFireRate ?? 1);
  if (e.elite === 'overclocked') {
    e.speedMult *= 1.4;
    e.fireRateMult *= 1.4;
  }
  e.dmgTakenMult = 1;
  /** Damage-taken multiplier owned by player debuffs (Scalding Nimbus shred): assign, don't scale. */
  e.vulnMult = 1;
  e.contactDamage = (opts.contactDamage ?? def.contactDamage ?? 10) * e.dmgMult;
  e.mass = opts.mass ?? def.mass ?? 1;
  e.kbx = 0;
  e.kby = 0;
  e.flash = 0;
  e.burn = null;
  e.slow = null;
  e.invuln = !!opts.invuln;
  e.untargetable = !!opts.untargetable;
  e.phased = false;
  e.noDrops = !!opts.noDrops;
  e.fleeing = false;
  e.state = '';
  e.timer = 0;
  e.data = opts.data ? { ...opts.data } : {};
  e.xp = (opts.xp ?? def.xp ?? 1) * (e.elite ? 3 : 1);
  e.cogs = (opts.cogs ?? def.cogs ?? 0) * (e.elite ? 2.5 : 1);
  e.score = (def.score ?? 10) * (e.elite ? 3 : 1);
  e.hpBar = def.hpBar ?? (!isBoss && !e.parent && (def.hp ?? 0) >= 40);
  e._recycleT = 0;
  e._burnFx = 0;
  if (e.parent) (e.parent.parts ||= []).push(e);
  return e;
}

export function resolveDef(w, typeOrDef, registry, bosses) {
  if (typeOrDef && typeof typeOrDef === 'object') return typeOrDef;
  const def = registry[typeOrDef] || bosses?.[typeOrDef];
  if (def) return def;
  if (!w._warnedTypes.has(typeOrDef)) {
    w._warnedTypes.add(typeOrDef);
    console.warn(`[world] unknown enemy type "${typeOrDef}" — using a generic craft`);
  }
  return { ...GENERIC, id: String(typeOrDef) };
}

// ---- Update ------------------------------------------------------------------------------------

const sepOut = [];

/** @param {import('./world.js').World} w */
export function updateEnemies(w, dt) {
  const list = w.enemies;
  const players = w.players;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e.alive) continue;
    stepEnemy(w, e, dt, players);
  }
  // Swap-remove the dead.
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (e.alive) continue;
    list[i] = list[list.length - 1];
    list.pop();
  }
}

function stepEnemy(w, e, dt, players) {
  const def = e.def;
  e.t += dt;
  if (e.fleeing) {
    const p = w.nearestPlayer(e.x, e.y);
    const sp = Math.max(def.speed || 0, 160) * 1.4;
    if (p) {
      const a = Math.atan2(e.y - p.y, e.x - p.x);
      e.vx += (Math.cos(a) * sp - e.vx) * Math.min(1, dt * 2);
      e.vy += (Math.sin(a) * sp - e.vy) * Math.min(1, dt * 2);
      e.angle = Math.atan2(e.vy, e.vx);
    }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    if (!w.isVisible(e.x, e.y, 260 + e.r)) w.removeEnemy(e);
    return;
  }
  if (def.update) {
    try {
      def.update(e, dt, w);
    } catch (err) {
      w.contentError(`enemy:${e.type}:update`, err);
    }
    if (!e.alive) return;
  }
  if (!def.manualMove) {
    const s = e.slow ? 1 - e.slow.amt : 1;
    e.x += (e.vx * s + e.kbx) * dt;
    e.y += (e.vy * s + e.kby) * dt;
  }
  if (e.kbx || e.kby) {
    const k = Math.exp(-7 * dt);
    e.kbx *= k;
    e.kby *= k;
    if (Math.abs(e.kbx) < 0.5) e.kbx = 0;
    if (Math.abs(e.kby) < 0.5) e.kby = 0;
  }
  if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 8);

  if (e.burn) {
    const b = e.burn;
    b.t -= dt;
    b.tick -= dt;
    e._burnFx -= dt;
    if (e._burnFx <= 0) {
      e._burnFx = w.fx.burn ? 0.05 : 0.12;
      const bx = e.x + (Math.random() - 0.5) * e.r;
      const by = e.y + (Math.random() - 0.5) * e.r;
      if (w.fx.burn) w.fx.burn(bx, by, 0.5 + e.r / 40);
      else w.fx.embers?.(bx, by, 1);
    }
    if (b.tick <= 0) {
      b.tick += 0.3;
      const info = w._burnInfo;
      info.owner = b.owner;
      w.damageEnemy(e, b.dps * 0.3, info);
      info.owner = null;
      if (!e.alive) return;
    }
    if (b.t <= 0) e.burn = null;
  }
  if (e.slow) {
    e.slow.t -= dt;
    if (e.slow.t <= 0) e.slow = null;
  }

  // Soft separation (bosses/parts never get pushed).
  if (!def.noSeparation && !e.isBoss && !e.parent) {
    sepOut.length = 0;
    w.spatial.query(e.x, e.y, e.r, sepOut);
    for (let j = 0; j < sepOut.length; j++) {
      const o = sepOut[j];
      if (o === e || !o.alive || o.phased) continue;
      let dx = e.x - o.x;
      let dy = e.y - o.y;
      let d = Math.hypot(dx, dy);
      if (d < 0.01) {
        dx = Math.random() - 0.5;
        dy = Math.random() - 0.5;
        d = Math.hypot(dx, dy) || 1;
      }
      const overlap = e.r + o.r - d;
      if (overlap <= 0) continue;
      const heavy = o.isBoss || o.parent || o.def.noSeparation;
      const share = heavy ? 1 : o.mass / (e.mass + o.mass);
      const push = overlap * share * Math.min(1, dt * 12);
      e.x += (dx / d) * push;
      e.y += (dy / d) * push;
    }
  }

  // Contact damage.
  if (!def.noContact && e.contactDamage > 0 && !e.phased) {
    for (let j = 0; j < players.length; j++) {
      const p = players[j];
      if (!p.alive) continue;
      const rr = e.r * 0.85 + p.r * 0.65;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      if (dx * dx + dy * dy > rr * rr) continue;
      const info = w._contactInfo;
      info.owner = e;
      info.angle = Math.atan2(dy, dx);
      const landed = w.damagePlayer(p, e.contactDamage, info);
      info.owner = null;
      if (landed) {
        const d = Math.hypot(dx, dy) || 1;
        p.vx += (dx / d) * 380;
        p.vy += (dy / d) * 380;
        if (!e.isBoss && !e.parent) {
          e.kbx -= (dx / d) * 200 / e.mass;
          e.kby -= (dy / d) * 200 / e.mass;
        }
        if (def.onContact) {
          try {
            def.onContact(e, p, w);
          } catch (err) {
            w.contentError(`enemy:${e.type}:onContact`, err);
          }
        }
      }
    }
  }

  // Recycle stragglers far from every player (infinite sky: keep the fight near the camera).
  if (!e.isBoss && !e.parent && !def.noRecycle) {
    e._recycleT -= dt;
    if (e._recycleT <= 0) {
      e._recycleT = 0.5;
      let far = true;
      for (let j = 0; j < players.length; j++) {
        const p = players[j];
        if (!p.alive && w.alivePlayerCount() > 0) continue;
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        if (dx * dx + dy * dy < 2600 * 2600) {
          far = false;
          break;
        }
      }
      if (far && players.length) {
        const p = w.nearestPlayer(e.x, e.y) || players[0];
        const heading = Math.hypot(p.vx, p.vy) > 40 ? Math.atan2(p.vy, p.vx) : w.rng.angle();
        const pt = w.offscreenPoint(80 + e.r, heading + (w.rng.next() - 0.5) * 1.6);
        e.x = pt.x;
        e.y = pt.y;
        e.vx = 0;
        e.vy = 0;
        def.onRecycle?.(e, w);
      }
    }
  }
}

// ---- Wrecks (falling hulks after death) ------------------------------------------------------

export function addWreck(w, e, time) {
  w.wrecks.push({ e, t: 0, time, spin: (w.rng.next() - 0.5) * 1.6, smokeT: 0 });
}

export function updateWrecks(w, dt) {
  const L = w.wrecks;
  for (let i = L.length - 1; i >= 0; i--) {
    const wr = L[i];
    wr.t += dt;
    const e = wr.e;
    e.x += e.vx * 0.3 * dt;
    e.y += e.vy * 0.3 * dt;
    e.angle += wr.spin * dt;
    wr.smokeT -= dt;
    if (wr.smokeT <= 0) {
      wr.smokeT = 0.08;
      w.fx.smoke?.(e.x + (Math.random() - 0.5) * e.r, e.y + (Math.random() - 0.5) * e.r, 0.5 + e.r / 50, { dark: true });
    }
    if (wr.t >= wr.time) {
      L[i] = L[L.length - 1];
      L.pop();
    }
  }
}

// ---- Draw --------------------------------------------------------------------------------------

/** Ship-shaped shadows for enemies & wrecks. World transform applied. */
export function drawEnemyShadows(w, ctx, renderer) {
  const v = w._drawView;
  const list = w.enemies;
  const shadow = Sprites.get('fx_shadow');
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e.alive || e.alt <= 0 || e.def.shadow === false) continue;
    const ox = SHADOW_OFFSET.x * e.alt;
    const oy = SHADOW_OFFSET.y * e.alt;
    const sx = e.x + ox;
    const sy = e.y + oy;
    if (sx < v.x0 - e.r || sx > v.x1 + e.r || sy < v.y0 - e.r || sy > v.y1 + e.r) continue;
    if (e.def.drawShadow) {
      safeDraw(w, e, 'drawShadow', ctx, ox, oy);
    } else if (e.sprite && !e.def.draw) {
      Sprites.drawTint(ctx, e.sprite, sx, sy, e.angle, e.scale, '#000000', 0.28 * e.alpha, e.frame);
    } else {
      renderer.blit(ctx, shadow, sx, sy, 0, (e.r * 2.6 * e.scale) / 32, 0.3 * e.alpha);
      renderer.applyWorld(ctx);
      ctx.globalAlpha = 1;
    }
  }
  for (let i = 0; i < w.wrecks.length; i++) {
    const wr = w.wrecks[i];
    const e = wr.e;
    const k = wr.t / wr.time;
    const alt = e.alt * (1 - k);
    if (!e.sprite || e.def.draw) continue;
    Sprites.drawTint(ctx, e.sprite, e.x + SHADOW_OFFSET.x * alt, e.y + SHADOW_OFFSET.y * alt, e.angle, e.scale * (1 - k * 0.4), '#000000', 0.28 * (1 - k));
  }
}

/** Draw all living enemies in layer order (e.layer < 0, 0, > 0). */
export function drawEnemies(w, ctx) {
  const list = w.enemies;
  const v = w._drawView;
  for (let pass = -1; pass <= 1; pass++) {
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.alive) continue;
      const lay = e.layer < 0 ? -1 : e.layer > 0 ? 1 : 0;
      if (lay !== pass) continue;
      const m = e.r * e.scale * 1.6 + 40;
      if (e.x < v.x0 - m || e.x > v.x1 + m || e.y < v.y0 - m || e.y > v.y1 + m) continue;
      if (e.def.draw) safeDraw(w, e, 'draw', ctx);
      else drawEnemySprite(w, ctx, e);
      if (e.hpBar && e.hp < e.maxHp) drawHpBar(ctx, e);
    }
  }
}

/** Wrecks: darkening, shrinking, spinning hulks. */
export function drawWrecks(w, ctx) {
  for (let i = 0; i < w.wrecks.length; i++) {
    const wr = w.wrecks[i];
    const e = wr.e;
    const k = wr.t / wr.time;
    const sc = e.scale * (1 - k * 0.45);
    const a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    if (e.def.draw) {
      const oldS = e.scale;
      const oldA = e.alpha;
      e.scale = sc;
      e.alpha = a;
      e.flash = 0;
      safeDraw(w, e, 'draw', ctx);
      e.scale = oldS;
      e.alpha = oldA;
    } else if (e.sprite) {
      Sprites.draw(ctx, e.sprite, e.x, e.y, e.angle, sc, a, e.frame);
      Sprites.drawTint(ctx, e.sprite, e.x, e.y, e.angle, sc, '#1c120a', Math.min(0.85, 0.3 + k) * a, e.frame);
    }
  }
}

/**
 * Default enemy rendering: elite rim → sprite → burn/slow tint → hit flash.
 * Content `def.draw` can call `world.drawEnemySprite(ctx, e, sprite?, frame?)`.
 */
export function drawEnemySprite(w, ctx, e, sprite = e.sprite, frame = e.frame, angle = e.angle, x = e.x, y = e.y, scale = e.scale) {
  if (!sprite) {
    ctx.fillStyle = '#4b4f58';
    ctx.beginPath();
    ctx.arc(x, y, e.r, 0, TAU);
    ctx.fill();
    return;
  }
  const a = e.alpha * (e.phased ? 0.35 : 1);
  if (e.elite) {
    const pulse = 0.65 + 0.35 * Math.sin(e.t * 5 + e.id);
    Sprites.drawOutline(ctx, sprite, x, y, angle, scale, ELITE_COLORS[e.elite] || '#ffcf4a', pulse * a, frame);
  }
  Sprites.draw(ctx, sprite, x, y, angle, scale, a, frame);
  if (e.burn) Sprites.drawTint(ctx, sprite, x, y, angle, scale, '#ff7a2f', (0.22 + 0.12 * Math.sin(e.t * 14)) * a, frame);
  if (e.slow) Sprites.drawTint(ctx, sprite, x, y, angle, scale, '#9fe6ff', 0.3 * a, frame);
  if (e.flash > 0) Sprites.drawFlash(ctx, sprite, x, y, angle, scale, Math.min(1, e.flash) * 0.9 * a, frame);
}

function drawHpBar(ctx, e) {
  const w = clamp(e.r * 1.6, 26, 70);
  const x = e.x - w / 2;
  const y = e.y - e.r * e.scale - 12;
  const k = clamp(e.hp / e.maxHp, 0, 1);
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = 'rgba(20,12,6,0.75)';
  ctx.fillRect(x - 1, y - 1, w + 2, 5);
  ctx.fillStyle = e.elite ? '#ffcf4a' : '#e2553a';
  ctx.fillRect(x, y, w * k, 3);
  ctx.globalAlpha = 1;
}

function safeDraw(w, e, fn, ctx, a, b) {
  ctx.save();
  try {
    e.def[fn](ctx, e, w, a, b);
  } catch (err) {
    w.contentError(`enemy:${e.type}:${fn}`, err);
  }
  ctx.restore();
}
