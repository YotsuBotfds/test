// One descent: world, borer, creatures, bosses, the cave-in, lighting and rendering.
import {
  TILE,
  WORLD_W,
  CHUNK_H,
  T,
  STRATA,
  STRATUM_LEN,
  SEAL_H,
  ARENA_H,
  stratumDef,
  stratumLoop,
  stratumIndexOfRow,
  WEAPON_IDS,
  POWER_IDS,
  ENEMIES,
} from './data.js';
import { World, arenaInfo, isSolidType } from './world.js';
import { Player } from './player.js';
import { Enemy } from './enemies.js';
import { makeBoss } from './bosses.js';
import { Particles } from './particles.js';
import { Pickup, Shot } from './combat.js';
import { getLightStamp, getConeStamp, tileColor, drawGlow, makeVignette } from './gfx.js';
import {
  clamp,
  lerp,
  damp,
  rand,
  randi,
  chance,
  pick,
  weighted,
  smoothstep,
  makeCanvas,
  dist2,
  wrapAngle,
  valueNoise,
  hash2,
  rgb,
  TAU,
} from './util.js';
import { audio } from './audio.js';
import { drawText } from './font.js';

const BLOOD = {
  grub: [200, 170, 90],
  beetle: [120, 220, 90],
  bat: [180, 40, 60],
  spitter: [160, 255, 90],
  crawler: [120, 200, 80],
  golem: [180, 170, 160],
  slime: [255, 120, 30],
  slimelet: [255, 120, 30],
  salamander: [255, 140, 40],
  skeleton: [230, 225, 200],
  wraith: [120, 255, 200],
  imp: [255, 60, 40],
  hound: [200, 30, 30],
  eye: [220, 30, 50],
  demon: [180, 20, 30],
};

export class Game {
  constructor(app, opts = {}) {
    this.app = app;
    this.settings = app.settings;
    this.attract = !!opts.attract;
    this.rig = opts.rig;
    this.seed = opts.seed ?? (Math.random() * 1e9) | 0;
    this.W = app.W;
    this.H = app.H;
    this.time = 0;
    this.trauma = 0;
    this.hitstopT = 0;
    this.slowT = 0;
    this.stratum = 0;
    this.collapseY = -300;
    this.collapseHold = this.attract ? 1e9 : 7;
    this.boss = null;
    this.bossState = {};
    this.spawnT = 4;
    this.flowT = 0;
    this.banner = null;
    this.flash = null;
    this.pulse = 0;
    this.queue = [];
    this.vacuum = false;
    this.forgeT = 0;
    this.deathT = 0;
    this.over = false;
    this.victoryShown = false;
    this.stats = { kills: 0, scoreKills: 0, damageTaken: 0, bosses: 0, time: 0, maxDepth: 0, ore: 0 };
    this.enemies = [];
    this.shots = [];
    this.eshots = [];
    this.pickups = [];
    this.hazards = [];
    this.particles = new Particles();
    this.world = new World(this, this.seed);
    this.player = new Player(this, this.rig);
    this.camX = this.player.x - this.W / 2;
    this.camY = this.player.y - this.H / 2;
    this.ai = { t: 0 };
    this.daily = !!opts.daily;
    this.tutorial = !this.attract && !!opts.tutorial;
    this.resize(this.W, this.H);
    if (!this.attract) {
      audio.music('stratum', this.sdef.music);
      this.showBanner('THE CRUST', this.daily ? 'DAILY DIG / SAME MAP FOR EVERYONE TODAY' : 'DIG SITE 666 / DEPTH 0M', [255, 200, 120], 3.5);
    }
  }

  get loop() {
    return stratumLoop(this.stratum);
  }

  get sdef() {
    return stratumDef(this.stratum);
  }

  get depth() {
    return Math.max(0, Math.floor(this.player.y / TILE));
  }

  resize(W, H) {
    this.W = W;
    this.H = H;
    [this.lightCanvas, this.lightCtx] = makeCanvas(W, H);
    this.vignette = makeVignette(W, H);
  }

  // ------------------------------------------------------------------ helpers used by entities

  enemyHpMult() {
    return (1 + this.loop * 0.6) * (this.player?.pacts.has('greed') ? 1.3 : 1) * (1 + Math.min(this.stratum, 5) * 0.08);
  }

  panOf(x) {
    return clamp((x - (this.camX + this.W / 2)) / (this.W / 2), -1, 1) * 0.7;
  }

  shake(n) {
    if (this.attract) return;
    this.trauma = Math.min(1, this.trauma + n);
    if (n >= 0.25) this.app.input.rumble?.(Math.min(1, n), 60 + n * 200);
  }

  hitstop(t) {
    if (this.attract) return;
    this.hitstopT = Math.max(this.hitstopT, t);
  }

  flashScreen(color, a) {
    this.flash = { color, a };
  }

  showBanner(title, sub, color = [255, 255, 255], dur = 3, boss = false) {
    this.banner = { title, sub, color, t: 0, dur, boss };
  }

  addShot(s) {
    this.shots.push(s);
  }

  addEShot(s) {
    if (this.player.pacts.has('cinder')) {
      s.vx *= 1.15;
      s.vy *= 1.15;
    }
    this.eshots.push(s);
  }

  addHazard(h) {
    this.hazards.push(h);
  }

  clearEShots(x, y, r) {
    const r2 = r * r;
    this.eshots = this.eshots.filter((s) => {
      if (dist2(s.x, s.y, x, y) < r2) {
        this.particles.spawn({ kind: 'ember', x: s.x, y: s.y, life: 0.3, size: 2, color: s.color, drag: 0 });
        return false;
      }
      return true;
    });
  }

  tileColorAt(x, y) {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    const type = this.world.get(tx, ty);
    const pal = this.world.palAt(tx, ty);
    return type === T.AIR ? STRATA[pal].colors.floor : tileColor(pal, type);
  }

  targets() {
    const out = [];
    for (const e of this.enemies) if (!e.dead && !e.ghosted && e.active) out.push(e);
    if (this.boss && this.boss.alive && this.boss.intro <= 0) {
      for (const p of this.boss.parts) if (!p.shield && p.mult > 0) out.push(p);
    }
    return out;
  }

  nearestTarget(x, y, range) {
    let best = null;
    let bd = range * range;
    for (const t of this.targets()) {
      const d = dist2(x, y, t.x, t.y);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  aimAssist(x, y, a) {
    let best = null;
    let bestA = 0.28;
    for (const t of this.targets()) {
      const d2 = dist2(x, y, t.x, t.y);
      if (d2 > 240 * 240) continue;
      const da = Math.abs(wrapAngle(Math.atan2(t.y - y, t.x - x) - a));
      if (da < bestA) {
        bestA = da;
        best = t;
      }
    }
    if (!best) return a;
    const ta = Math.atan2(best.y - y, best.x - x);
    return a + wrapAngle(ta - a) * 0.6;
  }

  findArcTarget(x, y, angle, range, cone, exclude) {
    let best = null;
    let bestScore = Infinity;
    for (const t of this.targets()) {
      if (exclude.has(t.ref || t)) continue;
      const d2 = dist2(x, y, t.x, t.y);
      if (d2 > range * range) continue;
      if (angle !== null) {
        const da = Math.abs(wrapAngle(Math.atan2(t.y - y, t.x - x) - angle));
        if (da > cone) continue;
      }
      if (!this.world.los(x, y, t.x, t.y)) continue;
      const score = Math.sqrt(d2);
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }

  enemyNear(x, y, r) {
    for (const e of this.enemies) {
      if (!e.dead && e.active && dist2(x, y, e.x, e.y) < (r + e.r) ** 2) return true;
    }
    if (this.boss && this.boss.hitTest(x, y, r)) return true;
    return false;
  }

  hitTarget(t, dmg, kx, ky, src) {
    if (t.ref) this.damageBoss(t, dmg, src);
    else this.damageEnemy(t, dmg, kx, ky, src);
  }

  ramAt(x, y, r, dmg) {
    for (const e of this.enemies) {
      if (e.dead || !e.active || e.ghosted) continue;
      if (dist2(x, y, e.x, e.y) < (r + e.r) ** 2) {
        this.damageEnemy(e, dmg, e.x - this.player.x, e.y - this.player.y, null);
        if (Math.random() < 0.3) this.particles.sparks(x, y, [255, 220, 150], 2, 120);
      }
    }
    if (this.boss && this.boss.alive) {
      const part = this.boss.hitTest(x, y, r);
      if (part) this.damageBoss(part, dmg * 0.6, null);
    }
  }

  // ------------------------------------------------------------------ combat resolution

  damageEnemy(e, dmg, kx, ky, src) {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = 0.07;
    if (src && src.burn) e.burn = 2.5;
    if (e.def.move !== 'wall' && (kx || ky)) {
      const l = Math.hypot(kx, ky) || 1;
      const kb = e.type === 'golem' || e.type === 'demon' ? 15 : 55;
      e.vx += (kx / l) * kb;
      e.vy += (ky / l) * kb;
    }
    this.particles.sparks(e.x, e.y, BLOOD[e.type], 2, 90);
    audio.play('hit', { pan: this.panOf(e.x), pitch: rand(0.85, 1.2), vol: 0.7 });
    if (e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    const p = this.player;
    this.stats.kills++;
    this.stats.scoreKills += e.def.score * (1 + this.loop);
    const col = BLOOD[e.type];
    this.particles.debris(e.x, e.y, col, 8 + e.r, 100);
    this.particles.flash(e.x, e.y, e.r * 3, col, 0.15);
    this.particles.ring(e.x, e.y, 2, e.r * 2.2, col, 0.25, 2);
    audio.play(e.r > 9 ? 'explode' : 'kill', { pan: this.panOf(e.x), pitch: rand(0.85, 1.15), vol: e.r > 9 ? 0.6 : 1 });
    if (e.r > 9) {
      this.shake(0.25);
      this.hitstop(0.04);
    }
    const ex = e.x;
    const ey = e.y;
    const er = e.r;
    this.world.decal(ex, ey, (c) => {
      c.fillStyle = rgb(col, 0.35);
      for (let i = 0; i < 6; i++) {
        const a = rand(TAU);
        const d = rand(er * 1.2);
        const s = rand(1, 3);
        c.fillRect(Math.round(ex + Math.cos(a) * d), Math.round(ey + Math.sin(a) * d), s, s);
      }
    });
    // Drops.
    const sd = this.sdef;
    const n = Math.max(1, Math.round(e.def.ore * rand(0.6, 1.2)));
    for (let i = 0; i < n; i++) {
      this.pickups.push(new Pickup('ore', e.x, e.y, { value: sd.ore1.value, color: sd.colors.ore1 }));
    }
    if (!p.pacts.has('blood') && chance(0.055)) this.pickups.push(new Pickup('health', e.x, e.y));
    else if (chance(0.025)) this.pickups.push(new Pickup('bomb', e.x, e.y));
    else if (chance(0.012)) this.pickups.push(new Pickup('power', e.x, e.y, { power: pick(POWER_IDS) }));
    if (p.stats.killHeal && !p.dead) p.heal(p.stats.killHeal);
    if (e.type === 'slime') {
      for (let i = 0; i < 2; i++) {
        const s = new Enemy(this, 'slimelet', e.x + rand(-4, 4), e.y + rand(-4, 4));
        s.vx = rand(-80, 80);
        s.vy = rand(-80, 80);
        this.enemies.push(s);
      }
    }
    if (e.type === 'demon') this.explode(e.x, e.y, 30, 0, { terrain: 40, color: [255, 100, 40] });
  }

  damageBoss(part, dmg, src) {
    const b = this.boss;
    if (!b || !b.alive) return;
    const done = b.takeDamage(dmg, part);
    if (done > 0) {
      this.particles.sparks(part.x + rand(-4, 4), part.y + rand(-4, 4), [255, 240, 200], 1, 100);
      audio.play('hit', { pan: this.panOf(part.x), pitch: rand(0.6, 0.9), vol: 0.6 });
      this.stats.scoreKills += done * 0.2;
    } else if (b.alive) {
      audio.play('clang', { pan: this.panOf(part.x), pitch: rand(0.8, 1.1), vol: 0.5 });
    }
    void src;
  }

  explode(x, y, r, dmg, o = {}) {
    const col = o.color || [255, 170, 80];
    this.particles.flash(x, y, r * 1.8, [255, 220, 150], 0.18);
    this.particles.ring(x, y, r * 0.2, r * 1.1, col, 0.3, 3);
    this.particles.embers(x, y, col, Math.round(r / 3), r * 2);
    this.particles.smoke(x, y, Math.round(r / 6) + 2, [40, 34, 30], r * 0.3);
    this.particles.sparks(x, y, [255, 230, 160], Math.round(r / 3), r * 6);
    audio.play(o.big ? 'bigexplode' : 'explode', { pan: this.panOf(x), pitch: rand(0.85, 1.15), vol: o.small ? 0.5 : 1 });
    this.shake(o.small ? 0.12 : Math.min(0.8, r / 60));
    if (o.big) this.hitstop(0.06);
    if (o.terrain) this.world.blast(x, y, r * 0.8, o.terrain);
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d2 = dist2(x, y, e.x, e.y);
      if (d2 < (r + e.r) ** 2) this.damageEnemy(e, dmg * (1 - (Math.sqrt(d2) / (r + e.r)) * 0.5), e.x - x, e.y - y, o);
    }
    if (this.boss && this.boss.alive && !o.noBoss && dmg > 0) {
      const part = this.boss.hitTest(x, y, r * 0.8);
      if (part) this.damageBoss(part, dmg * 0.7, o);
    }
    if (o.hurtPlayer && !this.player.dead && dist2(x, y, this.player.x, this.player.y) < (r + this.player.r) ** 2) {
      this.player.hurt(o.hurtPlayer);
    }
    if (o.clearBullets) this.clearEShots(x, y, o.clearBullets);
    this.world.decal(x, y, (c) => {
      const g = c.createRadialGradient(x, y, 0, x, y, r * 0.9);
      g.addColorStop(0, 'rgba(0,0,0,0.45)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    });
  }

  queueExplosion(x, y, delay, r, dmg, o) {
    this.queue.push({ t: delay, x, y, r, dmg, o });
  }

  impactFx(x, y, tx, ty, type, scale = 1) {
    const pal = this.world.palAt(tx, ty);
    const col = tileColor(pal, type);
    if (Math.random() < 0.6 * scale) this.particles.debris(x, y, col, 1, 60);
    if (Math.random() < 0.5 * scale) this.particles.sparks(x, y, [255, 220, 160], 1, 80);
  }

  throwCharge(p) {
    const a = p.aim;
    this.addShot(new Shot({ kind: 'bomb', x: p.x + Math.cos(a) * 8, y: p.y + Math.sin(a) * 8, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, r: 3, life: 0.75, drag: 2.6, dmg: 0 }));
    audio.play('throw', { pan: this.panOf(p.x) });
  }

  // ------------------------------------------------------------------ world callbacks

  onTileBroken(tx, ty, type, pal) {
    const x = (tx + 0.5) * TILE;
    const y = (ty + 0.5) * TILE;
    const col = tileColor(pal, type);
    const sd = STRATA[pal];
    this.particles.debris(x, y, col, 4, 70);
    if (Math.random() < 0.4) this.particles.smoke(x, y, 1, [50, 44, 40], 3);
    audio.play('break', { pan: this.panOf(x), pitch: type === T.HARD ? 0.6 : type === T.MED ? 0.8 : 1.1, vol: 0.6 });
    switch (type) {
      case T.ORE1:
        for (let i = 0; i < randi(2, 3); i++) this.pickups.push(new Pickup('ore', x, y, { value: sd.ore1.value, color: sd.colors.ore1 }));
        this.particles.sparks(x, y, sd.colors.ore1, 4, 80);
        break;
      case T.ORE2:
        for (let i = 0; i < 2; i++) this.pickups.push(new Pickup('ore', x, y, { value: sd.ore2.value, color: sd.colors.ore2 }));
        this.particles.sparks(x, y, sd.colors.ore2, 6, 100);
        break;
      case T.CRYSTAL:
        this.pickups.push(new Pickup('ore', x, y, { value: sd.ore2.value, color: sd.colors.crystal }));
        this.particles.embers(x, y, sd.colors.crystal, 8, 60);
        audio.play('ore', { pitch: 1.5 });
        break;
      case T.CRATE:
        this.crateLoot(x, y);
        break;
      case T.GAS:
        this.queueExplosion(x, y, 0.1, 34, 30, { terrain: 30, hurtPlayer: 18, color: [200, 220, 80] });
        this.particles.flash(x, y, 20, [220, 255, 100], 0.15);
        break;
      default:
        break;
    }
  }

  crateLoot(x, y) {
    const p = this.player;
    audio.play('crate', { pan: this.panOf(x) });
    this.particles.debris(x, y, [140, 96, 50], 10, 90);
    const r = Math.random();
    if (r < 0.42) {
      const others = WEAPON_IDS.filter((w) => w !== p.weapon);
      const w = chance(0.3) ? p.weapon : pick(others);
      this.pickups.push(new Pickup('weapon', x, y, { weapon: w, vx: 0, vy: 0 }));
    } else if (r < 0.67) {
      this.pickups.push(new Pickup('power', x, y, { power: pick(POWER_IDS), vx: 0, vy: 0 }));
    } else if (r < 0.85 && !p.pacts.has('blood')) {
      this.pickups.push(new Pickup('health', x, y));
      this.pickups.push(new Pickup('health', x, y));
    } else {
      this.pickups.push(new Pickup('bomb', x, y));
      this.pickups.push(new Pickup('bomb', x, y));
    }
    for (let i = 0; i < 4; i++) this.pickups.push(new Pickup('ore', x, y, { value: this.sdef.ore1.value, color: this.sdef.colors.ore1 }));
  }

  onChunkGenerated(cy) {
    const row0 = cy * CHUNK_H;
    if (row0 < 24) return;
    const si = stratumIndexOfRow(row0);
    const local = row0 - si * STRATUM_LEN;
    if (local < 14 || local > STRATUM_LEN - SEAL_H - ARENA_H - CHUNK_H) return;
    const def = stratumDef(si);
    const count = randi(1, 2) + (si > 1 ? 1 : 0) + (this.attract ? 1 : 0);
    for (let k = 0; k < count; k++) {
      for (let tries = 0; tries < 8; tries++) {
        const tx = randi(3, WORLD_W - 4);
        const ty = row0 + randi(0, CHUNK_H - 1);
        if (this.world.get(tx, ty) !== T.AIR) continue;
        const pool = def.enemies.filter(([t]) => t !== 'spitter');
        const type = weighted(pool);
        const n = type === 'golem' || type === 'demon' || type === 'eye' ? 1 : randi(1, 3);
        for (let i = 0; i < n; i++) {
          this.enemies.push(new Enemy(this, type, (tx + 0.5) * TILE + rand(-4, 4), (ty + 0.5) * TILE + rand(-4, 4), { dormant: true }));
        }
        break;
      }
    }
    if (def.enemies.some(([t]) => t === 'spitter') && chance(0.55)) {
      for (let tries = 0; tries < 20; tries++) {
        const tx = randi(3, WORLD_W - 4);
        const ty = row0 + randi(0, CHUNK_H - 1);
        if (!isSolidType(this.world.get(tx, ty))) continue;
        const dirs = [
          [0, 1],
          [1, 0],
          [-1, 0],
          [0, -1],
        ];
        const open = dirs.find(([dx, dy]) => this.world.get(tx + dx, ty + dy) === T.AIR);
        if (!open) continue;
        this.enemies.push(
          new Enemy(this, 'spitter', (tx + 0.5) * TILE + open[0] * 5, (ty + 0.5) * TILE + open[1] * 5, { dormant: true, wallAngle: Math.atan2(open[1], open[0]) })
        );
        break;
      }
    }
  }

  // ------------------------------------------------------------------ spawning

  director(dt) {
    const p = this.player;
    if (this.boss || p.dead || p.y < 20 * TILE || this.forgeT > 0) return;
    const def = this.sdef;
    const A = arenaInfo(this.stratum);
    if (p.y > (A.top - 6) * TILE) return;
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    const ramp = smoothstep(20 * TILE, 70 * TILE, p.y);
    this.spawnT = (def.spawnEvery * rand(0.7, 1.3)) / (1 + this.loop * 0.35) / (0.5 + ramp * 0.5);
    let active = 0;
    for (const e of this.enemies) if (!e.dormant && !e.dead) active++;
    if (active >= def.maxEnemies + this.loop * 4) return;
    const type = weighted(def.enemies);
    const n = type === 'golem' || type === 'demon' || type === 'eye' || type === 'spitter' ? 1 : randi(1, 3);
    for (let attempt = 0; attempt < 10; attempt++) {
      const below = chance(0.7);
      const a = below ? rand(0.15 * Math.PI, 0.85 * Math.PI) : rand(TAU);
      const d = rand(170, 240);
      const x = clamp(p.x + Math.cos(a) * d, 3 * TILE, (WORLD_W - 3) * TILE);
      const y = p.y + Math.sin(a) * d;
      if (y < this.collapseY + 90 || y > (A.top - 3) * TILE || y < 12 * TILE) continue;
      if (type === 'spitter') {
        const tx = Math.floor(x / TILE);
        const ty = Math.floor(y / TILE);
        if (!isSolidType(this.world.get(tx, ty))) continue;
        this.world.carve(x, y + TILE, 10);
        this.enemies.push(new Enemy(this, 'spitter', (tx + 0.5) * TILE, (ty + 0.5) * TILE + 5, { emerge: true, wallAngle: Math.PI / 2 }));
        return;
      }
      const move = ENEMIES[type].move;
      for (let i = 0; i < n; i++) {
        const ex = x + rand(-10, 10);
        const ey = y + rand(-10, 10);
        if (move === 'walk' && this.world.solidAt(ex, ey)) {
          this.world.carve(ex, ey, 12);
          audio.play('emerge', { pan: this.panOf(ex), vol: 0.6 });
        }
        this.enemies.push(new Enemy(this, type, ex, ey, { emerge: move === 'walk' || move === 'burrow' }));
      }
      return;
    }
  }

  // ------------------------------------------------------------------ boss flow

  startBoss(si) {
    this.bossState[si] = 'active';
    const A = arenaInfo(si);
    for (let ty = A.top - 5; ty < A.top - 1; ty++) {
      for (let tx = 0; tx < WORLD_W; tx++) if (this.world.get(tx, ty) !== T.WALL) this.world.set(tx, ty, T.SEAL);
    }
    this.enemies = this.enemies.filter((e) => e.y > A.top * TILE && !e.dormant);
    this.boss = makeBoss(this, si);
    const def = stratumDef(si);
    const name = this.loop ? `${def.bossName} +${this.loop}` : def.bossName;
    this.showBanner(name, def.bossTitle, [255, 90, 60], 3.4, true);
    audio.music('boss', def.music);
    audio.play('roar');
    this.shake(0.8);
  }

  bossDefeated(b) {
    const si = b.si;
    this.bossState[si] = 'dead';
    this.stats.bosses++;
    this.slowT = 1.6;
    this.flashScreen([255, 255, 255], 0.8);
    this.shake(1);
    audio.play('bigexplode');
    audio.music('none');
    this.eshots.length = 0;
    this.hazards.length = 0;
    for (const e of this.enemies) if (!e.dead) this.killEnemy(e);
    for (let i = 0; i < 10; i++) {
      const part = pick(b.parts.length ? b.parts : [{ x: b.x, y: b.y }]);
      this.queueExplosion(part.x + rand(-14, 14), part.y + rand(-14, 14), 0.1 + i * 0.13, 26, 0, { color: [255, 200, 120] });
    }
    // Spoils.
    const sd = this.sdef;
    const total = 70 + si * 35;
    let given = 0;
    while (given < total) {
      const v = sd.ore2.value;
      this.pickups.push(new Pickup('ore', b.x + rand(-20, 20), b.y + rand(-20, 20), { value: v, color: sd.colors.ore2, vx: rand(-140, 140), vy: rand(-140, 140) }));
      given += v;
    }
    const p = this.player;
    const others = WEAPON_IDS.filter((w) => w !== p.weapon);
    this.pickups.push(new Pickup('weapon', b.x, b.y + 10, { weapon: pick(others), vx: 0, vy: 0, life: 60 }));
    this.pickups.push(new Pickup('health', b.x - 16, b.y + 10, { vx: 0, vy: 0 }));
    this.pickups.push(new Pickup('health', b.x + 16, b.y + 10, { vx: 0, vy: 0 }));
    const name = this.loop ? `${b.name} +${this.loop}` : b.name;
    this.showBanner('WARDEN SLAIN', name, [255, 220, 120], 3.5);
    this.app.onBossDefeated?.(si % STRATA.length, this);
    this.forgeT = 4.2;
  }

  openSeal() {
    const A = arenaInfo(this.stratum);
    for (let ty = A.seal; ty < A.bottom; ty++) {
      for (let tx = 0; tx < WORLD_W; tx++) {
        if (this.world.get(tx, ty) === T.SEAL) {
          this.world.set(tx, ty, T.AIR);
          if (chance(0.3)) this.particles.debris((tx + 0.5) * TILE, (ty + 0.5) * TILE, this.sdef.colors.seal, 3, 90);
          if (chance(0.15)) this.particles.embers((tx + 0.5) * TILE, (ty + 0.5) * TILE, this.sdef.colors.seal, 2, 40);
        }
      }
    }
    audio.play('sealbreak');
    this.shake(0.9);
    this.flashScreen(this.sdef.colors.seal, 0.5);
    this.vacuum = false;
    this.boss = null;
    this.collapseHold = 3;
  }

  enterStratum(si) {
    this.stratum = si;
    const def = this.sdef;
    const name = this.loop ? `${def.name} +${this.loop}` : def.name;
    const n = si + 1;
    this.showBanner(name, `STRATUM ${n} / ${def.sub}`, def.colors.seal, 4);
    audio.music('stratum', def.music);
    audio.play('stratum');
    this.collapseHold = 4;
    this.spawnT = 3;
    this.app.onStratum?.(si, this);
  }

  playerDied() {
    const p = this.player;
    if (p.dead) return;
    p.dead = true;
    p.hp = 0;
    this.deathT = 2.4;
    this.slowT = 1.2;
    this.explode(p.x, p.y, 40, 0, { color: [255, 160, 60], big: true });
    this.particles.debris(p.x, p.y, this.rig.color, 20, 140);
    this.particles.debris(p.x, p.y, [70, 70, 80], 16, 120);
    this.shake(1);
    audio.setDrill(0);
    audio.setRumble(0);
    audio.music('none');
    audio.play('gameover');
  }

  summary() {
    const p = this.player;
    const depth = this.stats.maxDepth;
    const score = Math.floor(this.stats.scoreKills + depth * 10 + p.oreTotal * 2 + this.stats.bosses * 2500);
    return {
      depth,
      score,
      kills: this.stats.kills,
      ore: p.oreTotal,
      time: this.stats.time,
      bosses: this.stats.bosses,
      stratum: this.stratum,
      stratumName: this.sdef.name,
      rig: this.rig.id,
    };
  }

  // ------------------------------------------------------------------ update

  aiInput(dt) {
    const p = this.player;
    const ai = this.ai;
    ai.t += dt;
    const tgt = this.nearestTarget(p.x, p.y, 150);
    const cx = (WORLD_W * TILE) / 2;
    let mx = Math.sin(ai.t * 0.6) * 0.7 + (cx - p.x) / 260;
    let my = 0.8;
    if (tgt && dist2(tgt.x, tgt.y, p.x, p.y) < 50 * 50) {
      mx = (p.x - tgt.x) / 50;
      my = 0.2;
    }
    const l = Math.hypot(mx, my) || 1;
    const aim = tgt ? { x: tgt.x - p.x, y: tgt.y - p.y } : { x: Math.cos(ai.t * 0.9) * 0.5, y: 1 };
    const al = Math.hypot(aim.x, aim.y) || 1;
    return {
      move: { x: mx / l, y: my / l },
      aim: { x: aim.x / al, y: aim.y / al },
      aimMode: 'keys',
      fire: !!tgt || Math.sin(ai.t * 1.3) > 0.7,
      dash: false,
      bomb: false,
    };
  }

  update(dt, input) {
    if (this.over) return;
    this.pulse = Math.max(0, this.pulse - dt * 3);
    if (this.flash) {
      this.flash.a -= dt * 2.5;
      if (this.flash.a <= 0) this.flash = null;
    }
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > this.banner.dur) this.banner = null;
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    if (this.hitstopT > 0) {
      this.hitstopT -= dt;
      return;
    }
    if (this.slowT > 0) {
      this.slowT -= dt;
      dt *= 0.35;
    }
    this.time += dt;
    const p = this.player;
    if (!p.dead && !this.attract) this.stats.time += dt;

    // Player.
    let pin;
    if (this.attract || this.autopilot) pin = this.aiInput(dt);
    else {
      const o = input.out;
      pin = {
        move: o.move,
        aim: o.aim,
        aimMode: o.aimMode,
        fire: o.fire,
        dash: o.dash,
        bomb: o.bomb,
        pointerWorldX: input.mouse.x + this.camX,
        pointerWorldY: input.mouse.y + this.camY,
        pointerSeen: input.mouse.seen,
      };
    }
    if (!p.dead) p.update(dt, pin);
    this.stats.maxDepth = Math.max(this.stats.maxDepth, this.depth);

    // Flow field for walkers.
    this.flowT -= dt;
    if (this.flowT <= 0) {
      this.flowT = 0.25;
      this.world.updateFlow(p.x, p.y);
    }

    // Stratum / boss progression.
    if (!this.attract) {
      const row = Math.floor(p.y / TILE);
      const si = stratumIndexOfRow(row);
      if (si > this.stratum && !p.dead) this.enterStratum(si);
      const A = arenaInfo(this.stratum);
      if (!this.bossState[this.stratum] && row >= A.top + 6 && !p.dead) this.startBoss(this.stratum);
    } else if (p.y > (STRATUM_LEN - ARENA_H - 20) * TILE) {
      this.over = true;
    }

    this.director(dt);

    // Enemies.
    const range2 = 420 * 420;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (dist2(e.x, e.y, p.x, p.y) > range2 && e.dormant) continue;
      e.update(dt);
    }
    this.separate();
    for (const e of this.enemies) {
      if (e.dead || !e.active) continue;
      if (!p.dead && dist2(e.x, e.y, p.x, p.y) < (e.r + p.r * 0.8) ** 2) {
        if (p.hurt(e.def.dmg)) {
          const a = Math.atan2(p.y - e.y, p.x - e.x);
          p.vx += Math.cos(a) * 120;
          p.vy += Math.sin(a) * 120;
        }
      }
      if (e.y < this.collapseY - 4) {
        e.dead = true;
        this.particles.debris(e.x, e.y, BLOOD[e.type], 6, 60);
      }
    }
    this.enemies = this.enemies.filter((e) => !e.dead && !(e.y < this.collapseY - 200));

    if (this.boss) {
      if (this.boss.alive) this.boss.update(dt);
    }

    // Projectiles.
    this.shots = this.shots.filter((s) => s.update(this, dt));
    this.eshots = this.eshots.filter((s) => s.update(this, dt));
    this.hazards = this.hazards.filter((h) => h.update(this, dt));

    // Queued explosions (gas chains, boss death).
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      q.t -= dt;
      if (q.t <= 0) {
        this.queue.splice(i, 1);
        this.explode(q.x, q.y, q.r, q.dmg, q.o);
      }
    }

    this.updatePickups(dt);
    this.particles.update(dt);
    this.updateCollapse(dt);
    this.updateCamera(dt);

    // Post-boss: vacuum up spoils then open the forge.
    if (this.forgeT > 0) {
      this.forgeT -= dt;
      if (this.forgeT < 2.6) this.vacuum = true;
      if (this.forgeT <= 0) {
        if (this.stratum % STRATA.length === STRATA.length - 1 && !this.victoryShown) {
          this.victoryShown = true;
          this.app.showVictory(this);
        } else this.app.openForge(this);
      }
    }

    if (this.deathT > 0) {
      this.deathT -= dt;
      if (this.deathT <= 0) {
        this.over = true;
        this.app.gameOver(this);
      }
    }

    // Music intensity.
    if (!this.attract) {
      let near = 0;
      for (const e of this.enemies) if (e.active && dist2(e.x, e.y, p.x, p.y) < 200 * 200) near++;
      audio.setIntensity(this.boss ? 1 : clamp(0.15 + near / 6, 0, 1));
    }

    if (Math.random() < dt * 0.5) this.world.prune(this.collapseY);
  }

  separate() {
    const L = this.enemies;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (a.dead || !a.active || a.def.move === 'wall') continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (b.dead || !b.active || b.def.move === 'wall') continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const rr = a.r + b.r;
        if (dx > rr || dx < -rr || dy > rr || dy < -rr) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 1e-4) continue;
        const d = Math.sqrt(d2);
        const push = (rr - d) * 0.5;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
  }

  updatePickups(dt) {
    const p = this.player;
    const S = p.stats;
    const magnetAll = p.powers.magnet > 0 || this.vacuum;
    for (const k of this.pickups) {
      k.t += dt;
      k.life -= dt;
      const f = Math.exp(-4 * dt);
      k.vx *= f;
      k.vy *= f;
      if (!p.dead) {
        const dx = p.x - k.x;
        const dy = p.y - k.y;
        const d = Math.hypot(dx, dy) || 1;
        const pull = k.magnetic && (d < S.magnet || (magnetAll && k.kind === 'ore') || this.vacuum);
        if (pull) {
          const acc = magnetAll && d > S.magnet ? 900 : 700;
          k.vx += (dx / d) * acc * dt;
          k.vy += (dy / d) * acc * dt;
          k.life = Math.max(k.life, 5);
        }
        if (d < p.r + (k.magnetic ? 5 : 9)) {
          this.collect(k);
          k.life = -1;
          continue;
        }
      }
      k.x += k.vx * dt;
      k.y += k.vy * dt;
      if (!(magnetAll && k.magnetic)) this.world.collide(k);
    }
    this.pickups = this.pickups.filter((k) => k.life > 0);
  }

  collect(k) {
    const p = this.player;
    const pan = this.panOf(k.x);
    switch (k.kind) {
      case 'ore': {
        const v = Math.max(1, Math.round(k.value * p.stats.ore));
        p.ore += v;
        p.oreTotal += v;
        audio.play('ore', { pan, pitch: 0.9 + Math.min(k.value, 15) * 0.05 });
        if (k.value >= 4) this.particles.text(k.x, k.y - 6, `+${v}`, k.color);
        break;
      }
      case 'health':
        p.heal(20);
        audio.play('heal', { pan });
        this.particles.text(k.x, k.y - 6, '+20 HULL', [120, 255, 140]);
        break;
      case 'bomb':
        if (p.bombs < p.maxBombs) p.bombs++;
        audio.play('ore', { pan, pitch: 0.6 });
        this.particles.text(k.x, k.y - 6, '+CHARGE', [255, 140, 90]);
        break;
      case 'weapon': {
        const same = k.weapon === p.weapon;
        const lvl = p.giveWeapon(k.weapon);
        audio.play('weapon', { pan });
        this.showBanner(same ? `${p.weaponName()} LV ${lvl}` : p.weaponName(), same ? 'WEAPON UPGRADED' : 'NEW WEAPON', [255, 230, 140], 1.8);
        this.particles.ring(p.x, p.y, 6, 30, [255, 230, 140], 0.35, 2);
        break;
      }
      case 'power':
        p.givePower(k.power);
        audio.play('power', { pan });
        this.particles.ring(p.x, p.y, 6, 34, [255, 255, 255], 0.4, 2);
        this.particles.text(p.x, p.y - 14, k.power.toUpperCase(), [255, 255, 255]);
        break;
      default:
        break;
    }
  }

  updateCollapse(dt) {
    if (this.attract) return;
    const p = this.player;
    let speed = (6 + this.stratum * 1.5 + this.loop * 3) * (p.pacts.has('haste') ? 1.3 : 1);
    if (this.collapseHold > 0) {
      this.collapseHold -= dt;
      speed = 0;
      if (this.collapseHold <= 0 && !this.warnedCollapse) {
        this.warnedCollapse = true;
        this.showBanner('CAVE-IN!', 'THE TUNNEL IS COLLAPSING BEHIND YOU. KEEP DIGGING.', [255, 120, 80], 3);
        audio.play('warn');
        this.shake(0.4);
      }
    }
    const gap = p.y - this.collapseY;
    if (gap > 330 && this.collapseHold <= 0) speed += (gap - 330) * 1.2;
    this.collapseY += speed * dt;
    // Never crush a boss arena that is still in play.
    if (this.bossState[this.stratum] !== 'dead' || this.boss) {
      this.collapseY = Math.min(this.collapseY, (arenaInfo(this.stratum).top - 5) * TILE);
    }
    const g2 = p.y - this.collapseY;
    if (!p.dead && g2 < p.r + 4) {
      p.hurt(40 * dt, { dot: true });
      p.y = Math.max(p.y, this.collapseY + p.r + 2);
      this.shake(0.05);
      if (Math.random() < dt * 10) this.particles.debris(p.x, p.y - 6, [90, 80, 70], 2, 60);
    }
    // Falling rubble along the edge.
    if (Math.random() < dt * 14 && this.collapseY > this.camY - 20) {
      const x = this.camX + rand(this.W);
      this.particles.spawn({ kind: 'chunk', x, y: this.collapseY - 2, vx: rand(-10, 10), vy: rand(40, 120), life: rand(0.3, 0.7), size: rand(2, 4), color: [70, 60, 52], drag: 1 });
      if (chance(0.3)) this.particles.smoke(x, this.collapseY, 1, [60, 52, 46], 6);
    }
    audio.setRumble(p.dead ? 0 : clamp(1 - (g2 - 40) / 260, 0, 1) * (this.collapseHold > 0 ? 0.2 : 1));
  }

  updateCamera(dt) {
    const p = this.player;
    let ax = 0;
    let ay = 0;
    if (!this.attract && !p.dead) {
      ax = Math.cos(p.aim) * 22;
      ay = Math.sin(p.aim) * 16;
    }
    const tx = p.x + ax - this.W / 2;
    const ty = p.y + ay + (this.boss ? 0 : 30) - this.H / 2;
    const k = damp(this.attract ? 3 : 6, dt);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    const ww = WORLD_W * TILE;
    if (this.W >= ww) this.camX = (ww - this.W) / 2;
    else this.camX = clamp(this.camX, 0, ww - this.W);
    this.camY = Math.max(this.camY, -this.H * 0.8);
  }

  // ------------------------------------------------------------------ rendering

  render(ctx) {
    const W = this.W;
    const H = this.H;
    const s = this.settings.shake ? this.trauma * this.trauma * 7 : 0;
    const cx = Math.round(this.camX + rand(-s, s));
    const cy = Math.round(this.camY + rand(-s, s));
    this.rcx = cx;
    this.rcy = cy;
    ctx.fillStyle = '#050304';
    ctx.fillRect(0, 0, W, H);
    if (cy < 0) this.drawSky(ctx, cx, cy);
    this.world.draw(ctx, cx, cy, W, H);

    ctx.save();
    ctx.translate(-cx, -cy);
    if (cy < 60) this.drawSurface(ctx);
    const vis = (x, y, m = 40) => x > cx - m && x < cx + W + m && y > cy - m && y < cy + H + m;
    for (const k of this.pickups) if (vis(k.x, k.y)) k.draw(ctx, this);
    for (const e of this.enemies) if (vis(e.x, e.y) && !e.dormant) e.draw(ctx);
    for (const e of this.enemies) if (vis(e.x, e.y) && e.dormant) e.draw(ctx);
    if (this.boss && (this.boss.alive || this.boss.intro > 0)) this.boss.draw(ctx);
    this.player.draw(ctx);
    this.particles.draw(ctx);
    ctx.restore();

    this.drawLighting(ctx, cx, cy);

    ctx.save();
    ctx.translate(-cx, -cy);
    ctx.globalCompositeOperation = 'lighter';
    this.drawTileGlow(ctx, cx, cy);
    for (const h of this.hazards) h.drawGlow?.(ctx, this);
    for (const k of this.pickups) if (vis(k.x, k.y)) k.drawGlow(ctx);
    for (const e of this.enemies) if (vis(e.x, e.y) && !e.dormant) e.drawGlow(ctx);
    if (this.boss && this.boss.alive) this.boss.drawGlow(ctx);
    this.player.drawGlow(ctx, drawGlow);
    for (const sh of this.shots) if (vis(sh.x, sh.y)) sh.drawGlow(ctx);
    for (const sh of this.eshots) if (vis(sh.x, sh.y)) sh.drawGlow(ctx);
    this.particles.drawGlow(ctx);
    ctx.globalCompositeOperation = 'source-over';
    for (const sh of this.shots) if (vis(sh.x, sh.y)) sh.draw(ctx, this);
    for (const sh of this.eshots) if (vis(sh.x, sh.y)) sh.draw(ctx);
    ctx.restore();

    this.drawCollapse(ctx, cx, cy);
    ctx.drawImage(this.vignette, 0, 0);
    if (this.pulse > 0) {
      ctx.fillStyle = `rgba(120,0,20,${this.pulse * 0.15})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.flash) {
      ctx.fillStyle = rgb(this.flash.color, Math.min(0.8, this.flash.a));
      ctx.fillRect(0, 0, W, H);
    }
    const p = this.player;
    if (!this.attract && !p.dead && p.hp / p.maxHp < 0.3) {
      const a = (0.3 - p.hp / p.maxHp) * (0.6 + 0.4 * Math.sin(this.time * 6));
      ctx.fillStyle = `rgba(160,0,0,${a * 0.6})`;
      ctx.fillRect(0, 0, W, 3);
      ctx.fillRect(0, H - 3, W, 3);
      ctx.fillRect(0, 0, 3, H);
      ctx.fillRect(W - 3, 0, 3, H);
    }
  }

  drawSky(ctx, cx, cy) {
    const H = this.H;
    const W = this.W;
    const horizon = -cy;
    const g = ctx.createLinearGradient(0, horizon - H, 0, horizon);
    g.addColorStop(0, '#120814');
    g.addColorStop(0.55, '#3a1020');
    g.addColorStop(0.85, '#8a2a1c');
    g.addColorStop(1, '#d0582a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, Math.min(H, horizon));
    // A swollen red sun.
    const sx = (WORLD_W * TILE) * 0.72 - cx * 0.3;
    ctx.fillStyle = 'rgba(255,120,60,0.85)';
    ctx.beginPath();
    ctx.arc(sx, horizon - 26, 22, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,200,120,0.5)';
    ctx.beginPath();
    ctx.arc(sx, horizon - 26, 16, 0, TAU);
    ctx.fill();
    // Hills.
    for (const [par, h, col] of [
      [0.25, 34, '#2a0e14'],
      [0.5, 20, '#1a080c'],
    ]) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, horizon);
      for (let x = 0; x <= W; x += 8) {
        const wx = x + cx * par;
        ctx.lineTo(x, horizon - h * valueNoise(wx * 0.012, par * 10, 3) - 4);
      }
      ctx.lineTo(W, horizon);
      ctx.fill();
    }
    // Stars.
    ctx.fillStyle = 'rgba(255,220,220,0.6)';
    for (let i = 0; i < 40; i++) {
      const x = (hash2(i, 1, 9) * W * 2 - cx * 0.1) % W;
      const y = horizon - H + hash2(i, 2, 9) * H * 0.6;
      if (y < horizon - 40) ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }

  drawSurface(ctx) {
    const cxw = (WORLD_W * TILE) / 2;
    // Derrick over the bore hole.
    ctx.strokeStyle = '#140808';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cxw - 26, 0);
    ctx.lineTo(cxw - 6, -78);
    ctx.lineTo(cxw + 6, -78);
    ctx.lineTo(cxw + 26, 0);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const y0 = -i * 13;
      const y1 = -(i + 1) * 13;
      const w0 = 26 - i * 3.3;
      const w1 = 26 - (i + 1) * 3.3;
      ctx.moveTo(cxw - w0, y0);
      ctx.lineTo(cxw + w1, y1);
      ctx.moveTo(cxw + w0, y0);
      ctx.lineTo(cxw - w1, y1);
    }
    ctx.stroke();
    ctx.fillStyle = '#140808';
    ctx.fillRect(cxw - 10, -84, 20, 6);
    // Sign.
    const sx = cxw - 120;
    ctx.fillRect(sx + 8, -22, 2, 22);
    ctx.fillRect(sx + 66, -22, 2, 22);
    ctx.fillStyle = '#2a1410';
    ctx.fillRect(sx, -42, 76, 22);
    drawText(ctx, 'HELLBORE CO.', sx + 38, -39, { color: '#d8a050', align: 'center', shadow: false });
    drawText(ctx, 'DIG SITE 666', sx + 38, -30, { color: '#e04a30', align: 'center', shadow: false });
    // Shacks.
    ctx.fillStyle = '#1a0a0a';
    ctx.fillRect(cxw + 70, -18, 30, 18);
    ctx.beginPath();
    ctx.moveTo(cxw + 66, -18);
    ctx.lineTo(cxw + 85, -30);
    ctx.lineTo(cxw + 104, -18);
    ctx.fill();
    ctx.fillStyle = '#ffb060';
    ctx.fillRect(cxw + 78, -12, 5, 4);
  }

  drawLighting(ctx, cx, cy) {
    const L = this.lightCtx;
    const W = this.W;
    const H = this.H;
    const mid = cy + H / 2;
    const def = this.sdef;
    const dark = lerp(0.04, def.dark, smoothstep(-20, 26 * TILE, mid));
    const amb = def.ambient;
    L.globalCompositeOperation = 'source-over';
    L.globalAlpha = 1;
    L.clearRect(0, 0, W, H);
    L.fillStyle = `rgba(${amb[0]},${amb[1]},${amb[2]},${dark})`;
    L.fillRect(0, 0, W, H);
    L.globalCompositeOperation = 'destination-out';
    const stamp = getLightStamp();
    const lamp = (x, y, r, a) => {
      const sx = x - cx;
      const sy = y - cy;
      if (sx < -r || sy < -r || sx > W + r || sy > H + r) return;
      L.globalAlpha = Math.min(1, a);
      L.drawImage(stamp, sx - r, sy - r, r * 2, r * 2);
    };
    const p = this.player;
    if (!p.dead) {
      lamp(p.x, p.y, 78, 1);
      L.save();
      L.translate(p.x - cx, p.y - cy);
      L.rotate(this.attract ? p.heading : p.aim);
      L.globalAlpha = 0.85;
      L.drawImage(getConeStamp(), 0, -105, 210, 210);
      L.restore();
    }
    for (const s of this.shots) lamp(s.x, s.y, s.kind === 'flame' ? 26 : 16, 0.45);
    for (const s of this.eshots) lamp(s.x, s.y, 16, 0.45);
    for (const q of this.particles.list) {
      if (q.kind === 'flash') lamp(q.x, q.y, q.size * 1.6, q.life / q.max);
    }
    for (const e of this.enemies) if (!e.dormant) lamp(e.x, e.y, 22, 0.22);
    for (const k of this.pickups) lamp(k.x, k.y, 12, 0.3);
    for (const h of this.hazards) {
      if (h.r && h.dps) lamp(h.x, h.y, h.r * 2, 0.5);
    }
    if (this.boss && this.boss.alive) lamp(this.boss.x, this.boss.y, 90, 0.6);
    // Glowing tiles in view.
    const tx0 = Math.max(0, Math.floor(cx / TILE));
    const tx1 = Math.min(WORLD_W - 1, Math.floor((cx + W) / TILE));
    const ty0 = Math.max(0, Math.floor(cy / TILE));
    const ty1 = Math.floor((cy + H) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = this.world.get(tx, ty);
        if (t === T.CRYSTAL) lamp((tx + 0.5) * TILE, (ty + 0.5) * TILE, 30, 0.55);
        else if (t === T.LIQUID) {
          const gl = STRATA[this.world.palAt(tx, ty)].liquid.glow;
          if (gl > 0) lamp((tx + 0.5) * TILE, (ty + 0.5) * TILE, 22, gl);
        } else if (t === T.SEAL) lamp((tx + 0.5) * TILE, (ty + 0.5) * TILE, 18, 0.25);
      }
    }
    L.globalAlpha = 1;
    L.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.lightCanvas, 0, 0);
  }

  drawTileGlow(ctx, cx, cy) {
    const tx0 = Math.max(0, Math.floor(cx / TILE));
    const tx1 = Math.min(WORLD_W - 1, Math.floor((cx + this.W) / TILE));
    const ty0 = Math.max(0, Math.floor(cy / TILE));
    const ty1 = Math.floor((cy + this.H) / TILE);
    const t = this.time;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const type = this.world.get(tx, ty);
        if (type === T.LIQUID) {
          const sd = STRATA[this.world.palAt(tx, ty)];
          if (sd.liquid.glow > 0) {
            const a = sd.liquid.glow * (0.35 + 0.25 * Math.sin(t * 2.5 + tx * 0.9 + ty * 1.3));
            drawGlow(ctx, (tx + 0.5) * TILE, (ty + 0.5) * TILE, 14, sd.colors.liquid, a);
          }
        } else if (type === T.CRYSTAL) {
          const sd = STRATA[this.world.palAt(tx, ty)];
          drawGlow(ctx, (tx + 0.5) * TILE, (ty + 0.5) * TILE, 16, sd.colors.crystal, 0.35 + 0.15 * Math.sin(t * 3 + tx));
        } else if (type === T.ORE2 && Math.sin(t * 2 + tx * 7 + ty * 3) > 0.92) {
          const sd = STRATA[this.world.palAt(tx, ty)];
          drawGlow(ctx, (tx + 0.5) * TILE, (ty + 0.5) * TILE, 8, sd.colors.ore2, 0.6);
        } else if (type === T.SEAL) {
          const sd = STRATA[this.world.palAt(tx, ty)];
          drawGlow(ctx, (tx + 0.5) * TILE, (ty + 0.5) * TILE, 12, sd.colors.seal, 0.2 + 0.1 * Math.sin(t * 4 + tx * 0.5));
        }
      }
    }
  }

  drawCollapse(ctx, cx, cy) {
    if (this.attract) return;
    const y = this.collapseY - cy;
    if (y < -30) return;
    const W = this.W;
    ctx.fillStyle = '#0a0606';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let x = 0; x <= W + 6; x += 6) {
      const wx = x + cx;
      const j = valueNoise(wx * 0.07, this.time * 0.6, 4) * 14 + Math.sin(wx * 0.4 + this.time * 4) * 1.5;
      ctx.lineTo(x, y - j);
    }
    ctx.lineTo(W, 0);
    ctx.closePath();
    ctx.fill();
    // Boulders in the rubble face.
    for (let x = -(cx % 18); x < W; x += 18) {
      const wx = Math.round(x + cx);
      const h = hash2(wx, 5, 31);
      const j = valueNoise(wx * 0.07, this.time * 0.6, 4) * 14;
      ctx.fillStyle = h > 0.5 ? '#2a221e' : '#1e1816';
      ctx.fillRect(x + h * 6, y - j - 8 - h * 10, 6 + h * 6, 5 + h * 4);
    }
    const g = ctx.createLinearGradient(0, y - 10, 0, y + 40);
    g.addColorStop(0, 'rgba(70,58,48,0.55)');
    g.addColorStop(1, 'rgba(70,58,48,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 10, W, 50);
  }
}

