// STUB (WP3 replaces) — particles, FX helpers and float text. API: DESIGN §4.15.

export class Particles {
  constructor(max = 5000) {
    this.max = max;
    this.list = [];
  }
  get count() {
    return this.list.length;
  }
  spawn(p) {
    if (this.list.length >= this.max) return;
    this.list.push({ vx: 0, vy: 0, size: 4, color: '#fff', alpha: 1, drag: 0, layer: 'normal', ...p, t: 0 });
  }
  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.t += dt;
      if (p.t >= p.life) {
        L[i] = L[L.length - 1];
        L.pop();
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }
  draw(ctx, renderer, layer = 'normal') {
    ctx.save();
    if (layer === 'add') ctx.globalCompositeOperation = 'lighter';
    for (const p of this.list) {
      if ((p.layer || 'normal') !== layer) continue;
      ctx.globalAlpha = (p.alpha ?? 1) * (1 - p.t / p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.restore();
  }
  clear() {
    this.list.length = 0;
  }
}

export class FX {
  constructor(particles) {
    this.particles = particles;
    this.texts = [];
  }
  update(dt) {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.t += dt;
      t.y -= 30 * dt;
      if (t.t > t.life) this.texts.splice(i, 1);
    }
  }
  _burst(x, y, n, color, speed, life, layer = 'add') {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random());
      this.particles.spawn({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, size: 4, color, layer });
    }
  }
  explosion(x, y, size = 1) { this._burst(x, y, 14 * size, '#ff9b2f', 160 * size, 0.5); }
  bigExplosion(x, y, size = 1) { this._burst(x, y, 40 * size, '#ffcf4a', 260 * size, 0.9); }
  muzzle(x, y) { this._burst(x, y, 3, '#fff3c4', 60, 0.08); }
  sparks(x, y, angle, count = 5, color = '#ffd36b') { this._burst(x, y, count, color, 120, 0.25); }
  hitSpark(x, y) { this._burst(x, y, 3, '#fff3c4', 90, 0.15); }
  smoke(x, y) { this._burst(x, y, 2, 'rgba(120,110,100,0.6)', 20, 0.8, 'normal'); }
  smokeTrail(x, y) { this._burst(x, y, 1, 'rgba(120,110,100,0.5)', 10, 0.6, 'normal'); }
  steam(x, y) { this._burst(x, y, 2, 'rgba(244,241,234,0.6)', 40, 0.5, 'normal'); }
  debris(x, y, count = 6) { this._burst(x, y, count, '#6e4723', 140, 0.7, 'normal'); }
  cogs(x, y, count = 4) { this._burst(x, y, count, '#c9973f', 140, 0.7, 'normal'); }
  embers(x, y, count = 4) { this._burst(x, y, count, '#ff7a2f', 60, 0.8); }
  shockwave() {}
  ring() {}
  lightning() {}
  beam() {}
  flare() {}
  text(x, y, str, opts = {}) {
    this.texts.push({ x, y, str: String(str), color: opts.color || '#fff', size: opts.size || 14, life: opts.life || 0.7, t: 0 });
  }
  drawEffects() {}
  drawTexts(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      ctx.globalAlpha = 1 - t.t / t.life;
      ctx.fillStyle = t.color;
      ctx.font = `bold ${t.size}px Georgia, serif`;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.restore();
  }
  clear() {
    this.texts.length = 0;
    this.particles.clear();
  }
}
