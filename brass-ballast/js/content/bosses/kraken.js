// STUB (WP14 replaces) — placeholder boss: drifts near the player and fires rings.
import { Sprites } from '../../gfx/sprites.js';

Sprites.register('boss_kraken', {
  w: 200, h: 200,
  draw(ctx) {
    ctx.fillStyle = '#2a2c31';
    ctx.beginPath();
    ctx.arc(100, 100, 92, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.arc(100, 100, 30, 0, Math.PI * 2);
    ctx.fill();
  },
});

export default {
  id: 'kraken', name: "The Clockwork Kraken", title: "Terror of the Smog", boss: true, stage: 2, music: 'boss',
  hp: 2600, r: 90, speed: 60, contactDamage: 25, mass: 50, xp: 60, cogs: 40, score: 5000,
  sprite: 'boss_kraken', noSeparation: true,
  init(e) {
    e.data.cd = 2;
  },
  update(e, dt, world) {
    const p = world.nearestPlayer(e.x, e.y);
    if (!p) return;
    const tx = p.x;
    const ty = p.y - 260;
    e.vx = (tx - e.x) * 0.6;
    e.vy = (ty - e.y) * 0.6;
    e.angle += dt * 0.3;
    e.data.cd -= dt;
    if (e.data.cd <= 0) {
      e.data.cd = e.hp < e.maxHp / 2 ? 1.1 : 1.8;
      const n = 14;
      for (let i = 0; i < n; i++) {
        world.fire({ team: 'enemy', kind: 'orb', x: e.x, y: e.y, angle: e.angle + (i / n) * Math.PI * 2, speed: 180, r: 8, damage: 12, life: 6, owner: e });
      }
      world.sfx('enemy_cannon', e.x, e.y);
    }
  },
};
