// Lightweight particle system. "Glow" kinds are drawn additively after the darkness pass.
import { rgb, rand, TAU } from './util.js';
import { drawText } from './font.js';
import { drawGlow } from './gfx.js';

const MAX = 1600;
const GLOW_KINDS = new Set(['spark', 'ember', 'ring', 'flash', 'bolt', 'wisp']);

export class Particles {
  constructor() {
    this.list = [];
  }

  clear() {
    this.list.length = 0;
  }

  spawn(o) {
    if (this.list.length >= MAX) {
      if (o.kind !== 'text' && o.kind !== 'flash' && o.kind !== 'ring') return null;
      this.list.shift();
    }
    const p = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0.5,
      size: 2,
      color: [255, 255, 255],
      drag: 3,
      grav: 0,
      kind: 'chunk',
      rot: 0,
      vr: 0,
      grow: 0,
      alpha: 1,
      ...o,
    };
    p.max = p.life;
    this.list.push(p);
    return p;
  }

  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) {
        L[i] = L[L.length - 1];
        L.pop();
        continue;
      }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.size = Math.max(0, p.size + p.grow * dt);
    }
  }

  draw(ctx) {
    for (const p of this.list) {
      if (GLOW_KINDS.has(p.kind)) continue;
      const f = p.life / p.max;
      switch (p.kind) {
        case 'chunk': {
          ctx.fillStyle = rgb(p.color);
          const s = Math.max(1, Math.round(p.size * Math.min(1, f * 2)));
          ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
          break;
        }
        case 'smoke': {
          ctx.fillStyle = rgb(p.color, p.alpha * f);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, TAU);
          ctx.fill();
          break;
        }
        case 'shell': {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = rgb(p.color);
          ctx.fillRect(-1.5, -0.5, 3, 1.5);
          ctx.restore();
          break;
        }
        case 'text': {
          const a = Math.min(1, f * 3);
          drawText(ctx, p.text, p.x, p.y, { color: rgb(p.color), align: 'center', alpha: a, scale: p.scale || 1 });
          break;
        }
        case 'ghost': {
          ctx.save();
          ctx.globalAlpha = 0.35 * f;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = rgb(p.color);
          ctx.fillRect(-p.size, -p.size * 0.8, p.size * 2, p.size * 1.6);
          ctx.restore();
          break;
        }
        default:
          break;
      }
    }
  }

  drawGlow(ctx) {
    for (const p of this.list) {
      if (!GLOW_KINDS.has(p.kind)) continue;
      const f = p.life / p.max;
      switch (p.kind) {
        case 'spark': {
          ctx.strokeStyle = rgb(p.color, Math.min(1, f * 1.5));
          ctx.lineWidth = p.size;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
          ctx.stroke();
          break;
        }
        case 'ember':
        case 'wisp': {
          ctx.fillStyle = rgb(p.color, f);
          const s = Math.max(1, p.size);
          ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
          if (p.size > 1.5) drawGlow(ctx, p.x, p.y, p.size * 3, p.color, f * 0.5);
          break;
        }
        case 'ring': {
          const t = 1 - f;
          ctx.strokeStyle = rgb(p.color, f);
          ctx.lineWidth = Math.max(1, p.width ?? 3 * f);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size + (p.to - p.size) * (1 - (1 - t) ** 3), 0, TAU);
          ctx.stroke();
          break;
        }
        case 'flash': {
          drawGlow(ctx, p.x, p.y, p.size * (0.6 + 0.4 * f), p.color, f);
          break;
        }
        case 'bolt': {
          ctx.strokeStyle = rgb(p.color, f);
          ctx.lineWidth = p.size;
          ctx.beginPath();
          const pts = p.pts;
          ctx.moveTo(pts[0], pts[1]);
          for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
          ctx.stroke();
          ctx.strokeStyle = rgb([255, 255, 255], f);
          ctx.lineWidth = Math.max(1, p.size / 2);
          ctx.stroke();
          break;
        }
        default:
          break;
      }
    }
  }

  // ---- convenience emitters

  debris(x, y, color, n = 5, speed = 70) {
    for (let i = 0; i < n; i++) {
      const a = rand(TAU);
      const s = rand(speed * 0.3, speed);
      const c = [color[0] * rand(0.7, 1.2), color[1] * rand(0.7, 1.2), color[2] * rand(0.7, 1.2)];
      this.spawn({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.7), size: rand(1.5, 3.2), color: c, drag: 5 });
    }
  }

  sparks(x, y, color, n = 5, speed = 120, angle = null, spread = Math.PI) {
    for (let i = 0; i < n; i++) {
      const a = angle === null ? rand(TAU) : angle + rand(-spread, spread);
      const s = rand(speed * 0.4, speed);
      this.spawn({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.12, 0.3), size: 1, color, drag: 6 });
    }
  }

  smoke(x, y, n = 3, color = [30, 26, 24], size = 4) {
    for (let i = 0; i < n; i++) {
      this.spawn({
        kind: 'smoke',
        x: x + rand(-3, 3),
        y: y + rand(-3, 3),
        vx: rand(-15, 15),
        vy: rand(-25, -5),
        life: rand(0.5, 1.1),
        size: rand(size * 0.6, size),
        grow: 6,
        color,
        alpha: 0.5,
        drag: 2,
      });
    }
  }

  embers(x, y, color, n = 4, speed = 40) {
    for (let i = 0; i < n; i++) {
      this.spawn({
        kind: 'ember',
        x,
        y,
        vx: rand(-speed, speed),
        vy: rand(-speed, speed * 0.3),
        life: rand(0.4, 1.0),
        size: rand(1, 2),
        color,
        drag: 2,
      });
    }
  }

  ring(x, y, from, to, color, life = 0.35, width) {
    this.spawn({ kind: 'ring', x, y, size: from, to, color, life, width, drag: 0 });
  }

  flash(x, y, size, color, life = 0.15) {
    this.spawn({ kind: 'flash', x, y, size, color, life, drag: 0 });
  }

  text(x, y, text, color = [255, 255, 255], scale = 1, life = 0.9) {
    this.spawn({ kind: 'text', x, y, vx: 0, vy: -26, text, color, scale, life, drag: 2 });
  }

  bolt(x0, y0, x1, y1, color, size = 1.5, life = 0.1, jag = 6) {
    const pts = [x0, y0];
    const segs = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 10));
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      pts.push(x0 + (x1 - x0) * t + rand(-jag, jag), y0 + (y1 - y0) * t + rand(-jag, jag));
    }
    pts.push(x1, y1);
    this.spawn({ kind: 'bolt', x: x0, y: y0, pts, color, size, life, drag: 0 });
  }
}
