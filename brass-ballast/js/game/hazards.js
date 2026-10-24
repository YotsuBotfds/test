// Hazards & telegraphs (DESIGN §4.7). A hazard is a timed area (circle | line | ring) that
// damages a team per `tick`. While `t < delay` — or for its whole life when `telegraph` — it
// renders as a pulsing warning that fills toward completion and deals no damage.

import { TAU, distToSegment2 } from '../core/math.js';

const DEFAULT_ENEMY = '#ff4d2e';
const DEFAULT_PLAYER = '#ffcf4a';

export class Hazard {}

export class HazardSystem {
  /** @param {import('./world.js').World} world */
  constructor(world) {
    this.world = world;
    this._q = [];
  }

  /**
   * Add a hazard. See docs/ENGINE.md for fields.
   * @returns {Hazard}
   */
  add(o) {
    const w = this.world;
    const h = new Hazard();
    h.x = o.x ?? 0;
    h.y = o.y ?? 0;
    h.r = o.r ?? 40;
    h.shape = o.shape || 'circle';
    h.x2 = o.x2 ?? h.x;
    h.y2 = o.y2 ?? h.y;
    h.width = o.width ?? 20;
    h.life = o.life ?? 1;
    h.delay = o.delay ?? 0;
    h.team = o.team || 'enemy';
    h.owner = o.owner || null;
    let dmg = o.damage ?? 0;
    if (h.team !== 'player' && dmg) dmg *= o.dmgMult ?? (h.owner?.dmgMult ?? 1);
    h.damage = dmg;
    h.tick = o.tick ?? 0.25;
    h.color = o.color || (h.team === 'player' ? DEFAULT_PLAYER : DEFAULT_ENEMY);
    h.telegraph = !!o.telegraph;
    h.source = o.source || 'hazard';
    h.element = o.element || 'kinetic';
    h.follow = o.follow || null;
    h.ox = o.ox ?? 0; // offset from `follow`
    h.oy = o.oy ?? 0;
    h.knockback = o.knockback ?? 0;
    h.slow = o.slow || null;
    h.burn = o.burn || null;
    h.update = o.update || null;
    h.draw = o.draw || null;
    h.onDone = o.onDone || null;
    h.onHit = o.onHit || null;
    h.sound = o.sound || null;
    h.data = o.data || {};
    h.fill = o.fill ?? true;
    h.alpha = o.alpha ?? 1;
    h.t = 0;
    h.alive = true;
    h.hits = null; // Map target -> time of next allowed hit
    w.hazards.push(h);
    return h;
  }

  update(dt) {
    const w = this.world;
    const list = w.hazards;
    for (let i = list.length - 1; i >= 0; i--) {
      const h = list[i];
      if (h.alive) this._step(h, dt, w);
      if (!h.alive) {
        list[i] = list[list.length - 1];
        list.pop();
      }
    }
  }

  _step(h, dt, w) {
    h.t += dt;
    if (h.follow) {
      if (h.follow.alive !== false) {
        const dx = h.x2 - h.x;
        const dy = h.y2 - h.y;
        h.x = h.follow.x + h.ox;
        h.y = h.follow.y + h.oy;
        if (h.shape === 'line' && h.data.keepLine !== false) {
          h.x2 = h.x + dx;
          h.y2 = h.y + dy;
        }
      }
    }
    if (h.update) {
      try {
        h.update(h, dt, w);
      } catch (err) {
        w.contentError('hazard:update', err);
        h.update = null;
      }
      if (!h.alive) return;
    }
    const total = h.delay + (h.telegraph ? 0 : h.life);
    const active = !h.telegraph && h.t >= h.delay;
    if (active && !h._armed) {
      h._armed = true;
      if (h.sound) w.sfx(h.sound, h.x, h.y);
    }
    if (active && h.damage > 0) this._damage(h, w);
    if (h.t >= (h.telegraph ? h.life : total)) {
      h.alive = false;
      if (h.onDone) {
        try {
          h.onDone(h, w);
        } catch (err) {
          w.contentError('hazard:onDone', err);
        }
      }
    }
  }

  _overlaps(h, x, y, r) {
    switch (h.shape) {
      case 'line': {
        const rr = h.width / 2 + r;
        return distToSegment2(x, y, h.x, h.y, h.x2, h.y2) <= rr * rr;
      }
      case 'ring': {
        const d = Math.hypot(x - h.x, y - h.y);
        return Math.abs(d - h.r) <= h.width / 2 + r;
      }
      default: {
        const rr = h.r + r;
        const dx = x - h.x;
        const dy = y - h.y;
        return dx * dx + dy * dy <= rr * rr;
      }
    }
  }

  _canHit(h, target, w) {
    if (!h.hits) h.hits = new Map();
    const next = h.hits.get(target);
    if (next !== undefined && w.time < next) return false;
    h.hits.set(target, w.time + h.tick);
    return true;
  }

  _damage(h, w) {
    if (h.team === 'enemy' || h.team === 'all') {
      for (const p of w.players) {
        if (!p.alive || !this._overlaps(h, p.x, p.y, p.hitR)) continue;
        if (p.iframes > 0) continue;
        if (!this._canHit(h, p, w)) continue;
        const landed = w.damagePlayer(p, h.damage, { source: h.source, owner: h.owner, element: h.element, angle: Math.atan2(p.y - h.y, p.x - h.x), scaled: true });
        if (landed) {
          if (h.slow) p.slowT = Math.max(p.slowT, h.slow.time ?? 1);
          if (h.onHit) this._onHit(h, p, w);
        }
      }
    }
    if (h.team === 'player' || h.team === 'all') {
      const q = this._q;
      q.length = 0;
      let cx = h.x;
      let cy = h.y;
      let rad = h.r;
      if (h.shape === 'line') {
        cx = (h.x + h.x2) / 2;
        cy = (h.y + h.y2) / 2;
        rad = Math.hypot(h.x2 - h.x, h.y2 - h.y) / 2 + h.width / 2;
      } else if (h.shape === 'ring') {
        rad = h.r + h.width / 2;
      }
      w.spatial.query(cx, cy, rad, q);
      for (let i = 0; i < q.length; i++) {
        const e = q[i];
        if (!e.alive || e.untargetable || e.phased) continue;
        if (!this._overlaps(h, e.x, e.y, e.r)) continue;
        if (!this._canHit(h, e, w)) continue;
        w.damageEnemy(e, h.damage, {
          source: h.source,
          owner: h.owner,
          element: h.element,
          knockback: h.knockback,
          angle: Math.atan2(e.y - h.y, e.x - h.x),
        });
        if (h.burn) w.applyBurn(e, h.burn.dps, h.burn.time ?? 3, h.owner);
        if (h.slow) w.applySlow(e, h.slow.amt ?? 0.3, h.slow.time ?? 1);
        if (h.onHit) this._onHit(h, e, w);
      }
    }
  }

  _onHit(h, target, w) {
    try {
      h.onHit(h, target, w);
    } catch (err) {
      w.contentError('hazard:onHit', err);
      h.onHit = null;
    }
  }

  /** Ground-layer draw of all hazards (world transform applied). */
  draw(ctx) {
    const w = this.world;
    const list = w.hazards;
    const v = w._drawView;
    for (let i = 0; i < list.length; i++) {
      const h = list[i];
      if (!h.alive) continue;
      const big = h.shape === 'line' ? 0 : h.r + h.width;
      if (h.shape !== 'line' && (h.x + big < v.x0 || h.x - big > v.x1 || h.y + big < v.y0 || h.y - big > v.y1)) continue;
      ctx.save();
      try {
        if (h.draw) h.draw(ctx, h, w);
        else if (h.telegraph || h.t < h.delay) drawWarning(ctx, h, w);
        else drawActive(ctx, h, w);
      } catch (err) {
        w.contentError('hazard:draw', err);
        h.draw = null;
      }
      ctx.restore();
    }
  }
}

/** Pulsing outline + fill that grows toward completion. */
export function drawWarning(ctx, h, w) {
  const dur = h.telegraph ? h.life : h.delay;
  const k = Math.min(1, h.t / Math.max(0.001, dur));
  const pulse = 0.55 + 0.45 * Math.sin(h.t * (14 + k * 16));
  const flashCap = w.reducedFlash ? 0.6 : 1;
  ctx.globalAlpha = h.alpha;
  ctx.strokeStyle = h.color;
  ctx.fillStyle = h.color;
  if (h.shape === 'line') {
    const dx = h.x2 - h.x;
    const dy = h.y2 - h.y;
    const len = Math.hypot(dx, dy) || 1;
    ctx.translate(h.x, h.y);
    ctx.rotate(Math.atan2(dy, dx));
    const hw = h.width / 2;
    ctx.globalAlpha = 0.12 * h.alpha;
    ctx.fillRect(0, -hw, len, h.width);
    ctx.globalAlpha = (0.25 + 0.2 * k) * h.alpha;
    ctx.fillRect(0, -hw * k, len, h.width * k);
    ctx.globalAlpha = (0.5 + 0.4 * pulse) * h.alpha * flashCap;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -hw);
    ctx.lineTo(len, -hw);
    ctx.moveTo(0, hw);
    ctx.lineTo(len, hw);
    ctx.stroke();
    // Chevrons along the line point the direction of travel.
    ctx.globalAlpha = (0.3 + 0.4 * pulse) * h.alpha;
    ctx.lineWidth = 2.5;
    const step = 46;
    const off = (h.t * 120) % step;
    ctx.beginPath();
    for (let s = off; s < len - 8; s += step) {
      ctx.moveTo(s - 7, -hw * 0.45);
      ctx.lineTo(s + 4, 0);
      ctx.lineTo(s - 7, hw * 0.45);
    }
    ctx.stroke();
    return;
  }
  if (h.shape === 'ring') {
    ctx.globalAlpha = (0.15 + 0.25 * k) * h.alpha;
    ctx.lineWidth = h.width;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = (0.5 + 0.4 * pulse) * h.alpha * flashCap;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r - h.width / 2, 0, TAU);
    ctx.arc(h.x, h.y, h.r + h.width / 2, 0, TAU);
    ctx.stroke();
    return;
  }
  // circle
  ctx.globalAlpha = 0.1 * h.alpha;
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.r, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = (0.22 + 0.18 * k) * h.alpha;
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.r * k, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = (0.55 + 0.4 * pulse) * h.alpha * flashCap;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([10, 7]);
  ctx.lineDashOffset = -h.t * 30;
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.r, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  // Crosshair tick marks.
  ctx.globalAlpha = (0.4 + 0.3 * pulse) * h.alpha;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + h.t * 0.8;
    ctx.moveTo(h.x + Math.cos(a) * h.r * 0.82, h.y + Math.sin(a) * h.r * 0.82);
    ctx.lineTo(h.x + Math.cos(a) * h.r * 1.08, h.y + Math.sin(a) * h.r * 1.08);
  }
  ctx.stroke();
}

/** Default look for a damaging hazard. */
export function drawActive(ctx, h, w) {
  const fade = Math.min(1, (h.delay + h.life - h.t) / 0.2) * h.alpha;
  ctx.globalAlpha = fade;
  if (h.shape === 'line') {
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = h.color;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.35 * fade;
    ctx.lineWidth = h.width * 1.4;
    ctx.beginPath();
    ctx.moveTo(h.x, h.y);
    ctx.lineTo(h.x2, h.y2);
    ctx.stroke();
    ctx.globalAlpha = 0.9 * fade;
    ctx.lineWidth = h.width * 0.55;
    ctx.stroke();
    ctx.strokeStyle = '#fff3e0';
    ctx.lineWidth = Math.max(2, h.width * 0.2);
    ctx.stroke();
    return;
  }
  if (h.shape === 'ring') {
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = h.color;
    ctx.lineWidth = h.width;
    ctx.globalAlpha = 0.6 * fade;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r, 0, TAU);
    ctx.stroke();
    return;
  }
  if (h.fill) {
    ctx.fillStyle = h.color;
    ctx.globalAlpha = (0.22 + 0.06 * Math.sin(h.t * 10)) * fade;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = h.color;
  ctx.globalAlpha = 0.7 * fade;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.r, 0, TAU);
  ctx.stroke();
}
