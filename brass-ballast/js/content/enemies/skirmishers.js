// STUB (WP12 replaces) — skirmisher enemies. Shows the enemy-def contract (DESIGN §4.4).
import { Sprites } from '../../gfx/sprites.js';

Sprites.register('enemy_gyroScout', {
  w: 32, h: 32,
  draw(ctx) {
    ctx.fillStyle = '#4b4f58';
    ctx.beginPath();
    ctx.arc(16, 16, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(18, 13, 12, 6);
  },
});
Sprites.register('enemy_gunboat', {
  w: 60, h: 40,
  draw(ctx) {
    ctx.fillStyle = '#2a2c31';
    ctx.beginPath();
    ctx.ellipse(30, 20, 28, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff7a2f';
    ctx.fillRect(34, 17, 22, 6);
  },
});

export const SKIRMISHERS = {
  gyroScout: {
    id: 'gyroScout', name: 'Gyro Scout', hp: 10, r: 14, speed: 150, contactDamage: 10, mass: 0.6,
    xp: 1, cogs: 0.3, score: 10, sprite: 'enemy_gyroScout',
    init(e) {
      e.data.phase = Math.random() * 6.28;
    },
    update(e, dt, world) {
      const p = world.nearestPlayer(e.x, e.y);
      if (!p) return;
      const a = Math.atan2(p.y - e.y, p.x - e.x) + Math.sin(e.t * 3 + e.data.phase) * 0.5;
      const sp = this.speed * e.speedMult;
      e.vx = Math.cos(a) * sp;
      e.vy = Math.sin(a) * sp;
      e.angle = a;
    },
  },
  gunboat: {
    id: 'gunboat', name: 'Pirate Gunboat', hp: 40, r: 26, speed: 110, contactDamage: 15, mass: 2,
    xp: 4, cogs: 1, score: 40, sprite: 'enemy_gunboat',
    init(e) {
      e.data.cd = 1.5;
    },
    update(e, dt, world) {
      const p = world.nearestPlayer(e.x, e.y);
      if (!p) return;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const want = d > 380 ? 1 : d < 300 ? -1 : 0;
      const sp = this.speed * e.speedMult;
      e.vx = (dx / d) * sp * want + (-dy / d) * sp * 0.5;
      e.vy = (dy / d) * sp * want + (dx / d) * sp * 0.5;
      e.angle = Math.atan2(dy, dx);
      e.data.cd -= dt * e.fireRateMult;
      if (e.data.cd <= 0) {
        e.data.cd = 2;
        for (let i = -1; i <= 1; i++) {
          world.fire({ team: 'enemy', kind: 'orb', x: e.x, y: e.y, angle: e.angle + i * 0.2, speed: 220, r: 7, damage: 10, life: 4, owner: e });
        }
        world.sfx('enemy_shot', e.x, e.y);
      }
    },
  },
};
