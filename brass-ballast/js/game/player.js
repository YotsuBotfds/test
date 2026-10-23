// The player airship (DESIGN §2.4, §4.4 "Player"). Movement, boost, bombs, i-frames, turret,
// primary/aux driving, regen, aether shield, vengeance, low-hull smoke & alarm, revive, draw.

import { Sprites } from '../gfx/sprites.js';
import { Save } from '../core/storage.js';
import { TAU, angleDiff, wrapAngle, clamp } from '../core/math.js';
import { HULLS } from '../content/hulls.js';
import { PRIMARIES, AUX, EVOLUTIONS } from '../content/weapons/index.js';
import { PASSIVES } from '../content/upgrades.js';
import * as ShipArt from '../gfx/art/ships.js';
import { computeStats } from './stats.js';

/** Max equipped auxiliary systems. */
export const MAX_AUX = 4;
/** Player identification colors (co-op). */
export const PLAYER_COLORS = ['#ffcf4a', '#7ff3ff', '#ff8ac0', '#a6ff7a'];

const BOOST_SPEED = 650;
const BOOST_TIME = 0.18;
const BOOST_IFRAMES = 0.35;
const BOOST_CD = 0.25;
const TURN_RATE = 4;

const NO_CONTROLS = Object.freeze({
  moveX: 0, moveY: 0, aimX: 0, aimY: 0, aimMag: 0, aimMode: 'none', mouseWorld: null,
  fire: false, boost: false, bomb: false, pause: false, device: 'none',
});

/** Look up an aux or evolution def. */
export function auxDef(id) {
  return AUX[id] || EVOLUTIONS[id] || null;
}

function warnOnce(set, key, msg, err) {
  if (set.has(key)) return;
  set.add(key);
  console.error(msg, err);
}
const warned = new Set();

export class Player {
  /**
   * @param {import('./world.js').World} world
   * @param {number} index
   * @param {{hull?:string, weapon?:string, x?:number, y?:number}} [opts]
   */
  constructor(world, index, opts = {}) {
    this.world = world;
    this.isPlayer = true;
    this.team = 'player';
    this.index = index;
    this.id = -1 - index;
    this.color = PLAYER_COLORS[index % PLAYER_COLORS.length];
    this.x = opts.x ?? 0;
    this.y = opts.y ?? 0;
    this.vx = 0;
    this.vy = 0;
    this.r = 22;
    /** Collision radius vs enemy bullets (smaller than the art, for fairness). */
    this.hitR = 12;
    this.angle = -Math.PI / 2;
    this.aim = -Math.PI / 2;
    this.aimDist = 200;
    this.roll = 0;
    this.alive = true;
    this.t = 0;
    this.alt = 1;
    this.hull = HULLS[opts.hull] || HULLS.dauntless || Object.values(HULLS)[0];
    const wid = PRIMARIES[opts.weapon] ? opts.weapon : Object.keys(PRIMARIES)[0];
    this.primary = { id: wid, level: 1, cd: 0, kick: 0, data: {} };
    /** @type {{id:string, level:number, cd:number, data:object, kick?:number}[]} */
    this.aux = [];
    /** @type {Record<string, number>} */
    this.passives = {};
    this.bonusAdd = null;
    this.bonusMul = null;
    this.stats = computeStats(this);
    this.hp = this.stats.maxHp;
    this.steam = this.stats.steamMax;
    const startBombs = world.run?.mods?.startBombs;
    this.bombs = startBombs ?? this.stats.bombsMax;
    this.iframes = 1.0;
    this.boostT = 0;
    this.boostCd = 0;
    this.boostDir = 0;
    this.flash = 0;
    this.slowT = 0;
    this.firing = false;
    this.controls = NO_CONTROLS;
    this.revivesLeft = this.stats.revives;
    this.rerolls = this.stats.rerolls;
    this.shieldT = 0;
    this.shieldReady = false;
    this.alarmT = 0;
    this.smokeT = 0;
    this.trailT = 0;
    this.propRot = 0;
    this.deadT = 0;
    this.god = false;
    /** Optional AI brain: (player, dt, world) => controls (autopilot / simulated co-op). */
    this.brain = null;
    this.padIndex = index;
    this.kills = 0;
    this.lastHitT = -10;
    this._mounts = null;
  }

  /** Recompute stats; keeps hp/steam/bombs consistent with new maxima. */
  recomputeStats() {
    const old = this.stats;
    this.stats = computeStats(this);
    const s = this.stats;
    if (old) {
      if (s.maxHp > old.maxHp && this.alive) this.hp += s.maxHp - old.maxHp;
      if (s.bombsMax > old.bombsMax) this.bombs += s.bombsMax - old.bombsMax;
      if (s.revives > old.revives) this.revivesLeft += s.revives - old.revives;
      if (s.rerolls > old.rerolls) this.rerolls += s.rerolls - old.rerolls;
    }
    this.hp = Math.min(this.hp, s.maxHp);
    this.steam = Math.min(this.steam, s.steamMax);
    this.bombs = Math.min(this.bombs, s.bombsMax);
    return s;
  }

  // ---- Loadout -------------------------------------------------------------------------------

  hasAux(id) {
    return this.aux.some((a) => a.id === id);
  }

  auxLevel(id) {
    return this.aux.find((a) => a.id === id)?.level || 0;
  }

  getAux(id) {
    return this.aux.find((a) => a.id === id) || null;
  }

  passiveLevel(id) {
    return this.passives[id] || 0;
  }

  /** Equip a new aux (or level it if already equipped). Returns the slot or null if full. */
  addAux(id) {
    const def = auxDef(id);
    if (!def) return null;
    const have = this.getAux(id);
    if (have) return this.levelAux(id);
    if (this.aux.length >= MAX_AUX) return null;
    const slot = { id, level: 1, cd: 0, kick: 0, data: {} };
    this.aux.push(slot);
    this._safe(def, 'init', slot);
    this.recomputeStats();
    Save.discover('weapons', id);
    return slot;
  }

  levelAux(id) {
    const slot = this.getAux(id);
    if (!slot) return this.addAux(id);
    const def = auxDef(id);
    slot.level = Math.min(def?.maxLevel ?? 5, slot.level + 1);
    this._safe(def, 'onLevel', slot);
    this.recomputeStats();
    return slot;
  }

  /** Replace the evolution's source aux with the evolution in the same slot. */
  evolveAux(evoId) {
    const evo = EVOLUTIONS[evoId];
    if (!evo) return null;
    if (this.hasAux(evoId)) return this.getAux(evoId);
    let i = this.aux.findIndex((a) => a.id === evo.from);
    if (i < 0) {
      if (this.aux.length >= MAX_AUX) return null;
      i = this.aux.length;
    } else {
      this._safe(auxDef(evo.from), 'remove', this.aux[i]);
    }
    const slot = { id: evoId, level: 1, cd: 0, kick: 0, data: {} };
    this.aux[i] = slot;
    this._safe(evo, 'init', slot);
    this.recomputeStats();
    Save.discover('weapons', evoId);
    const w = this.world;
    w.fx.shockwave?.(this.x, this.y, 160, '#ffcf4a', 0.6);
    w.fx.flare?.(this.x, this.y, 140, '#ffe08a');
    w.sfx('evolve', this.x, this.y);
    return slot;
  }

  removeAux(id) {
    const i = this.aux.findIndex((a) => a.id === id);
    if (i < 0) return false;
    this._safe(auxDef(id), 'remove', this.aux[i]);
    this.aux.splice(i, 1);
    this.recomputeStats();
    return true;
  }

  addPassive(id) {
    const def = PASSIVES[id];
    const max = def?.maxLevel ?? 5;
    this.passives[id] = Math.min(max, (this.passives[id] || 0) + 1);
    this.recomputeStats();
    Save.discover('upgrades', id);
    return this.passives[id];
  }

  levelPrimary() {
    const def = PRIMARIES[this.primary.id];
    this.primary.level = Math.min(def?.maxLevel ?? 8, this.primary.level + 1);
    this.recomputeStats();
    return this.primary.level;
  }

  heal(n) {
    return this.world.healPlayer(this, n);
  }

  addSteam(n) {
    this.steam = clamp(this.steam + n, 0, this.stats.steamMax);
  }

  // ---- Geometry ------------------------------------------------------------------------------

  /** Mount points (hull-local, sprite pivot at origin, facing +x). */
  mounts() {
    if (this._mounts && this._mounts.hull === this.hull.id) return this._mounts;
    const custom = ShipArt.HULL_MOUNTS?.[this.hull.id];
    const s = Sprites.get(this.hull.sprite);
    const w = s.w;
    const h = s.h;
    const m = {
      hull: this.hull.id,
      props: custom?.props || [
        [-w * 0.47, 0],
        [-w * 0.1, -h * 0.47],
        [-w * 0.1, h * 0.47],
      ],
      propScale: custom?.propScale || [1.1, 0.8, 0.8],
      turret: custom?.turret || [w * 0.1, 0],
      stern: custom?.stern || [-w * 0.45, 0],
      exhausts: custom?.exhausts || null,
    };
    this._mounts = m;
    return m;
  }

  /** World position of the turret mount. */
  mountPos(out = { x: 0, y: 0 }) {
    const [mx, my] = this.mounts().turret;
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    out.x = this.x + mx * c - my * s;
    out.y = this.y + mx * s + my * c;
    return out;
  }

  /**
   * World position of the gun muzzle `dist` units along the aim from the turret mount.
   * @param {number} [dist]
   * @returns {{x:number, y:number}}
   */
  muzzle(dist = 28) {
    const m = this.mountPos();
    m.x += Math.cos(this.aim) * dist;
    m.y += Math.sin(this.aim) * dist;
    return m;
  }

  /** Hull-local → world. */
  local(lx, ly, out = { x: 0, y: 0 }) {
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    out.x = this.x + lx * c - ly * s;
    out.y = this.y + lx * s + ly * c;
    return out;
  }

  get boosting() {
    return this.boostT > 0;
  }

  // ---- Update --------------------------------------------------------------------------------

  /**
   * @param {number} dt
   * @param {any} input Input instance (ignored when a brain drives this player)
   */
  update(dt, input) {
    const w = this.world;
    let c = NO_CONTROLS;
    try {
      c = this.brain ? this.brain(this, dt, w) || NO_CONTROLS : input?.controls?.(this.index) || NO_CONTROLS;
    } catch (err) {
      warnOnce(warned, 'brain', '[player] controls failed', err);
    }
    this.controls = c;
    this.t += dt;
    if (!this.alive) {
      this.deadT += dt;
      // Wreck drifts and smoulders.
      this.vx *= Math.exp(-1.5 * dt);
      this.vy *= Math.exp(-1.5 * dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.smokeT -= dt;
      if (this.smokeT <= 0 && this.deadT < 6) {
        this.smokeT = 0.12;
        w.fx.smoke?.(this.x, this.y, 1.2);
      }
      return;
    }
    const s = this.stats;
    this.iframes = Math.max(0, this.iframes - dt);
    this.boostCd -= dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.slowT = Math.max(0, this.slowT - dt);

    if (this.boostT <= 0) this.steam = Math.min(s.steamMax, this.steam + s.steamRegen * dt);
    if (s.hpRegen > 0 && this.hp < s.maxHp) this.hp = Math.min(s.maxHp, this.hp + s.hpRegen * dt);
    if (s.shieldInterval > 0 && !this.shieldReady) {
      this.shieldT += dt;
      if (this.shieldT >= s.shieldInterval) {
        this.shieldReady = true;
        this.shieldT = 0;
        w.fx.ring?.(this.x, this.y, this.r * 1.6, '#7ff3ff', 0.4);
      }
    }

    // --- Movement: accel with exponential drag; terminal velocity = stats.speed.
    let mx = c.moveX || 0;
    let my = c.moveY || 0;
    const ml = Math.hypot(mx, my);
    if (ml > 1) {
      mx /= ml;
      my /= ml;
    }
    const wind = w.wind;
    if (this.boostT > 0) {
      this.boostT -= dt;
      // Light steering while dashing.
      if (ml > 0.2) {
        const want = Math.atan2(my, mx);
        this.boostDir += clamp(angleDiff(this.boostDir, want), -3 * dt, 3 * dt);
      }
      const k = this.boostT > 0 ? 1 : 0.55;
      this.vx = Math.cos(this.boostDir) * BOOST_SPEED * k;
      this.vy = Math.sin(this.boostDir) * BOOST_SPEED * k;
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = 0.02;
        const st = this.local(this.mounts().stern[0], 0);
        w.fx.steam?.(st.x, st.y, this.boostDir + Math.PI, 1.1);
      }
    } else {
      const slow = this.slowT > 0 ? 0.6 : 1;
      const drag = s.accel / s.speed;
      this.vx += (mx * s.accel * slow + wind.x) * dt;
      this.vy += (my * s.accel * slow + wind.y) * dt;
      const k = Math.exp(-drag * dt);
      this.vx *= k;
      this.vy *= k;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // --- Boost
    if (c.boost) {
      if (this.boostCd <= 0 && this.steam >= s.boostCost) this.doBoost(mx, my);
      else if (this.steam < s.boostCost && this.boostCd <= 0) {
        this.boostCd = 0.3;
        w.sfx('ui_error', this.x, this.y, { vol: 0.35 });
        w.floatText(this.x, this.y - 36, 'No steam!', { color: '#9fe6ff', size: 12, life: 0.6 });
      }
    }

    // --- Hull heading & roll
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > 25) {
      const want = Math.atan2(this.vy, this.vx);
      const d = angleDiff(this.angle, want);
      const rate = (this.boostT > 0 ? 10 : TURN_RATE) * dt;
      this.angle = wrapAngle(this.angle + clamp(d, -rate, rate));
      this.roll += (clamp(d, -0.8, 0.8) - this.roll) * Math.min(1, dt * 6);
    } else {
      this.roll *= Math.exp(-4 * dt);
    }
    this.propRot += dt * (14 + sp * 0.06);

    // --- Aim
    this._updateAim(c, dt);

    // --- Fire
    const autoFire = Save.settings.autoFire && !!w.nearestEnemy(this.x, this.y, 720);
    this.firing = !!c.fire || autoFire;
    const pdef = PRIMARIES[this.primary.id];
    if (pdef?.update) {
      const inp = this._wpnInput || (this._wpnInput = { firing: false, angle: 0 });
      inp.firing = this.firing;
      inp.angle = this.aim;
      try {
        pdef.update(this, this.primary, dt, w, inp);
      } catch (err) {
        warnOnce(warned, `prim:${this.primary.id}`, `[player] primary ${this.primary.id} update failed`, err);
      }
    }
    for (let i = 0; i < this.aux.length; i++) {
      const slot = this.aux[i];
      const def = auxDef(slot.id);
      if (!def?.update) continue;
      try {
        def.update(this, slot, dt, w);
      } catch (err) {
        warnOnce(warned, `aux:${slot.id}`, `[player] aux ${slot.id} update failed`, err);
      }
    }

    // --- Bomb
    if (c.bomb) {
      if (this.bombs > 0) this.dropBomb();
      else if (!this._noBombT || this.t > this._noBombT) {
        this._noBombT = this.t + 0.5;
        w.sfx('ui_error', this.x, this.y, { vol: 0.35 });
      }
    }

    // --- Engine exhaust puffs scale with speed.
    const m = this.mounts();
    if (m.exhausts && sp > 90) {
      this.exhaustT = (this.exhaustT || 0) - dt * (sp / 240);
      if (this.exhaustT <= 0) {
        this.exhaustT = 0.16;
        const ex = m.exhausts[(this.t * 7) & 1 ? 1 % m.exhausts.length : 0];
        const q = this.local(ex[0], ex[1], this._tmp3 || (this._tmp3 = { x: 0, y: 0 }));
        w.fx.smokeTrail?.(q.x, q.y, 0.35, { alpha: 0.22, life: 0.6 });
      }
    }

    // --- Damage feedback
    const low = this.hp < s.maxHp * 0.25;
    if (low) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.07;
        const st = this.local(-6, 0);
        w.fx.smoke?.(st.x, st.y, 0.7, { dark: true });
        if (Math.random() < 0.25) w.fx.embers?.(st.x, st.y, 1);
      }
      this.alarmT -= dt;
      if (this.alarmT <= 0) {
        this.alarmT = 2;
        w.sfx('player_low', this.x, this.y, { vol: 0.6 });
      }
    } else {
      this.alarmT = 0;
    }
  }

  _updateAim(c, dt) {
    const w = this.world;
    let aim = this.aim;
    let hasAim = false;
    if (c.aimMode === 'mouse' && c.mouseWorld) {
      const m = this.mountPos(this._tmp || (this._tmp = { x: 0, y: 0 }));
      const dx = c.mouseWorld.x - m.x;
      const dy = c.mouseWorld.y - m.y;
      if (dx * dx + dy * dy > 4) {
        aim = Math.atan2(dy, dx);
        this.aimDist = Math.hypot(dx, dy);
      }
      hasAim = true;
    } else if ((c.aimMag || 0) > 0.15 || ((c.aimX || c.aimY) && c.aimMode !== 'none')) {
      aim = Math.atan2(c.aimY, c.aimX);
      this.aimDist = 140 + 260 * clamp(c.aimMag || 1, 0, 1);
      hasAim = true;
    }
    const assist = c.aimAssist && Save.settings.aimAssist !== false;
    if (!hasAim && (Save.settings.autoFire || assist)) {
      // No aim input: track the nearest enemy so auto-fire is useful on touch/pad.
      const e = w.nearestEnemy(this.x, this.y, 650);
      if (e) {
        const want = Math.atan2(e.y - this.y, e.x - this.x);
        aim = this.aim + clamp(angleDiff(this.aim, want), -10 * dt, 10 * dt);
        this.aimDist = Math.hypot(e.x - this.x, e.y - this.y);
      }
    } else if (hasAim && assist && c.aimMode !== 'mouse') {
      // Soft snap: nearest enemy within 20° of the stick direction.
      const e = w.enemyNearAngle(this.x, this.y, aim, 0.35, 760);
      if (e) {
        const want = Math.atan2(e.y - this.y, e.x - this.x);
        aim += angleDiff(aim, want) * 0.85;
      }
    }
    this.aim = wrapAngle(aim);
  }

  doBoost(mx, my) {
    const w = this.world;
    const s = this.stats;
    this.steam -= s.boostCost;
    this.boostCd = BOOST_CD;
    this.boostT = BOOST_TIME;
    this.iframes = Math.max(this.iframes, BOOST_IFRAMES);
    this.boostDir =
      Math.hypot(mx, my) > 0.2
        ? Math.atan2(my, mx)
        : Math.hypot(this.vx, this.vy) > 30
          ? Math.atan2(this.vy, this.vx)
          : this.angle;
    if (w.run) w.run.boosts++;
    w.sfx('boost', this.x, this.y);
    w.input?.vibrate?.(0.25, 60, this.index);
    if (w.fx.steamBurst) w.fx.steamBurst(this.x, this.y, 0.8, 8);
    else {
      for (let i = 0; i < 6; i++) w.fx.steam?.(this.x, this.y, this.boostDir + Math.PI + (Math.random() - 0.5) * 1.2, 1.2);
    }
    w.events.emit('player:boost', { player: this });
  }

  dropBomb() {
    const w = this.world;
    const s = this.stats;
    this.bombs--;
    if (w.run) w.run.bombsUsed++;
    const dmg = 60 * s.damage * (w.run?.mods?.playerDmg ?? 1);
    const radius = 170 * s.area;
    const x = this.x;
    const y = this.y;
    w.telegraphCircle(x, y, radius, 0.6, { color: '#ffcf4a', team: 'player' });
    w.fire({
      team: 'player',
      kind: 'bomb',
      x,
      y,
      speed: 0,
      angle: this.angle,
      life: 0.6,
      r: 10,
      spin: 5,
      scale: 1.5,
      owner: this,
      source: 'bomb',
      hitEnemies: false,
      glow: '#ffb347',
      crit: false,
      update: bombFall,
      explode: {
        radius,
        damage: dmg,
        falloff: 0.25,
        visual: 'huge',
        sound: 'explode_large',
        shake: 0.75,
        clearBullets: true,
        knockback: 420,
      },
    });
    w.sfx('bomb_drop', x, y);
    w.events.emit('player:bomb', { player: this });
  }

  /** Called by world.damagePlayer after damage lands. */
  onHurt(amount, info) {
    const w = this.world;
    const s = this.stats;
    if (s.vengeance > 0) {
      const n = 8 * s.vengeance;
      const dmg = 15 * s.damage * (w.run?.mods?.playerDmg ?? 1);
      for (let i = 0; i < n; i++) {
        w.fire({
          team: 'player',
          kind: 'ball',
          x: this.x,
          y: this.y,
          angle: (i / n) * TAU + this.t,
          speed: 520,
          r: 6,
          damage: dmg,
          life: 0.9,
          owner: this,
          source: 'vengeance',
          trail: 'spark',
          glow: '#ff9b2f',
        });
      }
      w.fx.shockwave?.(this.x, this.y, 120, '#ff9b2f', 0.35);
    }
  }

  // ---- Draw ----------------------------------------------------------------------------------

  /** Shadow silhouette (world transform applied). */
  drawShadow(ctx, sx, sy) {
    if (!this.alive && this.deadT > 1.5) return;
    Sprites.drawTint(ctx, this.hull.sprite, this.x + sx, this.y + sy, this.angle, 1, '#000000', 0.28);
  }

  /** @param {CanvasRenderingContext2D} ctx */
  draw(ctx, w) {
    const sprite = this.hull.sprite;
    if (!this.alive) {
      if (this.deadT > 2.5) return;
      const a = Math.max(0, 1 - this.deadT / 2.5);
      Sprites.drawTint(ctx, sprite, this.x, this.y, this.angle + this.deadT * 0.6, 1 - this.deadT * 0.15, '#2a1a10', 1 * a);
      return;
    }
    const blink = this.iframes > 0 && this.boostT <= 0 && ((this.t * 18) | 0) % 2 === 0;
    const alpha = blink ? 0.45 : 1;
    const bob = Math.sin(this.t * 2.3 + this.index) * 2.2;
    const x = this.x;
    const y = this.y + bob;
    const coop = w.players.length > 1;

    for (let i = 0; i < this.aux.length; i++) this._auxDraw(ctx, 'drawUnder', this.aux[i], w);

    if (coop) Sprites.drawOutline(ctx, sprite, x, y, this.angle, 1, this.color, 0.55);
    if (this.boostT > 0) Sprites.drawOutline(ctx, sprite, x, y, this.angle, 1, '#f4f1ea', 0.6);

    // Hull with a slight roll squash when turning.
    const m = this.mounts();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.angle);
    ctx.scale(1, 1 - Math.abs(this.roll) * 0.12);
    Sprites.draw(ctx, sprite, 0, 0, 0, 1, alpha);
    if (this.flash > 0) Sprites.drawFlash(ctx, sprite, 0, 0, 0, 1, this.flash * alpha);
    // Propellers.
    const frames = Sprites.frames('prop');
    const pf = (this.propRot * 3) | 0;
    for (let i = 0; i < m.props.length; i++) {
      const [px, py] = m.props[i];
      Sprites.draw(ctx, 'prop', px, py, this.propRot * (i % 2 ? -1 : 1), m.propScale[i] ?? 0.9, alpha, (pf + i) % frames);
    }
    ctx.restore();

    // Turret (instant aim) with recoil kick.
    const mp = this.mountPos(this._tmp2 || (this._tmp2 = { x: 0, y: 0 }));
    const kick = clamp(this.primary.kick || 0, 0, 1);
    const tx = mp.x - Math.cos(this.aim) * kick * 6;
    const ty = mp.y + bob - Math.sin(this.aim) * kick * 6;
    const tdef = PRIMARIES[this.primary.id];
    const tsprite = tdef?.turret || `turret_${this.primary.id}`;
    Sprites.draw(ctx, tsprite, tx, ty, this.aim, 1, alpha);
    if (this.flash > 0) Sprites.drawFlash(ctx, tsprite, tx, ty, this.aim, 1, this.flash * alpha);

    // Aether shield bubble.
    if (this.shieldReady) {
      const pulse = 0.5 + 0.2 * Math.sin(this.t * 5);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 * pulse;
      ctx.strokeStyle = '#7ff3ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, this.r * 1.75, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = '#7ff3ff';
      ctx.fill();
      ctx.restore();
    }

    for (let i = 0; i < this.aux.length; i++) this._auxDraw(ctx, 'draw', this.aux[i], w);

    // Co-op tag.
    if (coop) {
      ctx.save();
      ctx.font = 'bold 12px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = this.color;
      ctx.globalAlpha = 0.85;
      ctx.fillText(`P${this.index + 1}`, x, y - this.r - 18);
      ctx.restore();
    }
  }

  _auxDraw(ctx, hook, slot, w) {
    const def = auxDef(slot.id);
    const fn = def?.[hook];
    if (!fn) return;
    ctx.save();
    try {
      fn.call(def, ctx, this, slot, w);
    } catch (err) {
      warnOnce(warned, `${hook}:${slot.id}`, `[player] aux ${slot.id}.${hook} failed`, err);
    }
    ctx.restore();
  }

  _safe(def, fnName, slot) {
    const fn = def?.[fnName];
    if (!fn) return;
    try {
      fn.call(def, this, slot, this.world);
    } catch (err) {
      warnOnce(warned, `${fnName}:${slot.id}`, `[player] aux ${slot.id}.${fnName} failed`, err);
    }
  }
}

/** Ballast bomb: falls (shrinks), spins and blinks faster until the fuse ends. */
function bombFall(p, dt, w) {
  const k = Math.min(1, p.t / p.life);
  p.scale = 1.5 - 0.7 * k;
  p.alpha = 1;
  p.glowSize = 3 + 2 * Math.abs(Math.sin(p.t * (8 + k * 30)));
}
