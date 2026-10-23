// Title-screen attract mode: the sky drifts, a few airships cruise by at different altitudes,
// and the player's blimp bobs proudly in the foreground. Pure presentation — no World needed.

import { Sprites } from '../gfx/sprites.js';
import { Save } from '../core/storage.js';
import { SHADOW_OFFSET } from '../config.js';
import { HULLS } from '../content/hulls.js';
import { PRIMARIES } from '../content/weapons/index.js';
import { ENEMIES } from '../content/enemies/index.js';

const CRUISER_PREFS = ['carrier', 'frigate', 'gunboat', 'ornithopter', 'kiteBomber', 'mortarBarge', 'gyroScout'];

export class Attract {
  /** @param {any} game */
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.ships = [];
    this.puffT = 0;
  }

  start() {
    const r = this.game.renderer;
    r.camera.x = 0;
    r.camera.y = 0;
    r.camera.zoomMul = 1;
    r.camera.shakeX = 0;
    r.camera.shakeY = 0;
    r.updateZoom();
    this.t = 0;
    this.ships.length = 0;
    for (let i = 0; i < 5; i++) this._spawn(true);
  }

  _sprites() {
    const out = [];
    for (const id of CRUISER_PREFS) {
      const d = ENEMIES[id];
      if (d?.sprite && Sprites.has(d.sprite)) out.push({ sprite: d.sprite, r: d.r || 20, enemy: true });
    }
    for (const id of Object.keys(HULLS)) {
      const h = HULLS[id];
      if (h.sprite && Sprites.has(h.sprite)) out.push({ sprite: h.sprite, r: 30, enemy: false });
    }
    return out;
  }

  _spawn(initial = false) {
    const r = this.game.renderer;
    const v = r.viewRect(0);
    const pool = this._sprites();
    if (!pool.length) return;
    const pick = pool[(Math.random() * pool.length) | 0];
    const dir = Math.random() < 0.65 ? 1 : -1;
    const alt = 0.5 + Math.random() * 1.6;
    const scale = 0.6 + alt * 0.3;
    const speed = (30 + Math.random() * 50) * (pick.enemy ? 1 : 0.8);
    const y = v.y0 + v.h * (0.12 + Math.random() * 0.76);
    const x = initial ? v.x0 + Math.random() * v.w : dir > 0 ? v.x0 - 160 : v.x1 + 160;
    this.ships.push({ ...pick, x, y, dir, alt, scale, speed, t: Math.random() * 10, smoke: 0 });
  }

  update(dt) {
    this.t += dt;
    const g = this.game;
    const r = g.renderer;
    const cam = r.camera;
    cam.x += 42 * dt;
    cam.y = Math.sin(this.t * 0.11) * 60;
    cam.zoomMul += (1 - cam.zoomMul) * Math.min(1, dt * 2);
    cam.shakeX = 0;
    cam.shakeY = 0;
    r.updateZoom();
    const v = r.viewRect(0);
    for (let i = this.ships.length - 1; i >= 0; i--) {
      const s = this.ships[i];
      s.t += dt;
      s.x += s.dir * s.speed * dt + 42 * dt * (1 - 0.6 * (s.alt / 2));
      s.smoke -= dt;
      if (s.smoke <= 0 && s.enemy) {
        s.smoke = 0.25;
        g.fx.smokeTrail?.(s.x - s.dir * s.r * s.scale, s.y, 0.5 * s.scale);
      }
      if ((s.dir > 0 && s.x > v.x1 + 260) || (s.dir < 0 && s.x < v.x0 - 260)) {
        this.ships.splice(i, 1);
        this._spawn(false);
      }
    }
    // Hero blimp steam puffs.
    this.puffT -= dt;
    if (this.puffT <= 0) {
      this.puffT = 0.09;
      const h = this._hero();
      g.fx.steam?.(h.x - Math.cos(h.a) * 46, h.y - Math.sin(h.a) * 46, h.a + Math.PI, 0.6);
    }
    g.particles.update(dt);
    g.fx.update(dt);
  }

  _hero() {
    const r = this.game.renderer;
    const v = r.viewRect(0);
    const cx = (v.x0 + v.x1) / 2;
    const cy = (v.y0 + v.y1) / 2;
    const bob = Math.sin(this.t * 1.7) * 8;
    return {
      x: cx - v.w * 0.16 + Math.sin(this.t * 0.4) * 30,
      y: cy + v.h * 0.12 + bob,
      a: -0.12 + Math.sin(this.t * 0.6) * 0.06,
    };
  }

  /** @param {CanvasRenderingContext2D} ctx */
  draw(ctx, renderer) {
    renderer.applyWorld(ctx);
    const ships = this.ships;
    // Shadows first (ground plane).
    for (const s of ships) {
      Sprites.drawTint(ctx, s.sprite, s.x + SHADOW_OFFSET.x * s.alt, s.y + SHADOW_OFFSET.y * s.alt, s.dir > 0 ? 0 : Math.PI, s.scale, '#000000', 0.22);
    }
    const hero = this._hero();
    const hull = HULLS[Save.meta.hull] || HULLS.dauntless;
    const sprite = hull?.sprite || 'hull_dauntless';
    Sprites.drawTint(ctx, sprite, hero.x + SHADOW_OFFSET.x * 1.6, hero.y + SHADOW_OFFSET.y * 1.6, hero.a, 1.7, '#000000', 0.25);
    // Low ships under the hero, high ships over it.
    for (const s of ships) if (s.alt < 1.4) this._ship(ctx, s);
    renderer.applyWorld(ctx);
    this.game.particles.draw(ctx, renderer, 'normal');
    renderer.applyWorld(ctx);
    ctx.globalCompositeOperation = 'lighter';
    this.game.particles.draw(ctx, renderer, 'add');
    ctx.globalCompositeOperation = 'source-over';
    renderer.applyWorld(ctx);
    ctx.globalAlpha = 1;
    // Hero.
    ctx.save();
    ctx.translate(hero.x, hero.y);
    ctx.rotate(hero.a);
    ctx.scale(1.7, 1.7);
    Sprites.draw(ctx, sprite, 0, 0, 0, 1);
    const s = Sprites.get(sprite);
    const props = [
      [-s.w * 0.47, 0, 1.1],
      [-s.w * 0.1, -s.h * 0.47, 0.8],
      [-s.w * 0.1, s.h * 0.47, 0.8],
    ];
    const frames = Sprites.frames('prop');
    for (let i = 0; i < props.length; i++) {
      const [px, py, sc] = props[i];
      Sprites.draw(ctx, 'prop', px, py, this.t * 16 * (i % 2 ? -1 : 1), sc, 1, ((this.t * 40) | 0) % frames);
    }
    const wid = PRIMARIES[Save.meta.weapon] ? Save.meta.weapon : 'brassCannon';
    Sprites.draw(ctx, PRIMARIES[wid]?.turret || `turret_${wid}`, s.w * 0.1, 0, Math.sin(this.t * 0.8) * 0.5, 1);
    ctx.restore();
    for (const s2 of ships) if (s2.alt >= 1.4) this._ship(ctx, s2);
  }

  _ship(ctx, s) {
    const bob = Math.sin(s.t * 1.3) * 3;
    Sprites.draw(ctx, s.sprite, s.x, s.y + bob, s.dir > 0 ? 0 : Math.PI, s.scale, 1);
  }
}
