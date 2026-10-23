// WP15 shared boss kit — used by both stormEngine.js and behemoth.js (named after the first
// boss only because WP15 owns `stormEngine-*.js` / `behemoth-*.js`).
//
//  - part helpers: proportional part hp, local → world transforms, hazard bookkeeping
//  - the "talker": an overlay part that draws a parchment speech plaque (boss taunts from
//    TAUNTS[id]) plus any boss overlay (screen crackle…) above every other enemy
//  - phase-shift juice (banner, invuln window, hit-stop, slow-mo, bullet clear, shockwave)
//  - small drawing helpers for runtime jagged electric arcs and stretched sprites

import { FONT_BODY } from '../../config.js';
import { Sprites } from '../../gfx/sprites.js';
import { TAUNTS } from '../codex.js';
import { TAU, clamp } from '../../core/math.js';

/**
 * Part hp proportional to the boss's scaled max hp (bossHpMult, co-op, mods all honoured):
 * `base × boss.maxHp / def.hp`. Pass as `rawHp` so the engine doesn't scale it twice.
 * @param {any} b boss @param {number} defHp the boss def's base hp @param {number} base
 */
export function partHp(b, defHp, base) {
  return Math.max(1, Math.round((base * b.maxHp) / Math.max(1, defHp)));
}

/** Hull-local (lx forward, ly starboard) → world, honouring the boss angle. */
export function toWorld(b, lx, ly, out) {
  const c = Math.cos(b.angle);
  const s = Math.sin(b.angle);
  out.x = b.x + c * lx - s * ly;
  out.y = b.y + s * lx + c * ly;
  return out;
}

/** Nearest living player (or any player so bosses keep a reference while everyone is down). */
export function targetPlayer(w, b) {
  return w.nearestPlayer(b.x, b.y) || w.players.find((p) => p.alive) || w.players[0] || null;
}

/** Track a hazard so phase changes / death can cancel it. */
export function track(b, h) {
  if (h) (b.data.hz ||= []).push(h);
  return h;
}

/** Kill every tracked hazard (telegraphs vanish without firing their onDone). */
export function cancelHazards(b) {
  const L = b.data.hz;
  if (!L) return;
  for (const h of L) h.alive = false;
  L.length = 0;
}

/** Drop dead hazards from the tracking list (cheap; call once a second or so). */
export function pruneHazards(b) {
  const L = b.data.hz;
  if (!L) return;
  let j = 0;
  for (let i = 0; i < L.length; i++) if (L[i].alive) L[j++] = L[i];
  L.length = j;
}

/**
 * Clamp a desired boss position into the visible area minus the HUD bands and a margin, so a
 * kiting player can't push the boss under the HUD or off-screen. Returns `out` and sets
 * `out.outside` when (x, y) itself was outside the safe box (callers speed up to catch up).
 * @param {{x:number, y:number}} m margins in world units {x, y} (half-size of the boss)
 */
export function clampToView(w, x, y, m, out) {
  const v = w.renderer.viewRect(0, out._v || (out._v = {}));
  const k = v.h / Math.max(1, w.renderer.cssH || 720);
  const x0 = v.x0 + m.x;
  const x1 = v.x1 - m.x;
  const y0 = v.y0 + 120 * k + m.y;
  const y1 = v.y1 - 50 * k - m.y;
  out.x = x0 < x1 ? clamp(x, x0, x1) : (v.x0 + v.x1) / 2;
  out.y = y0 < y1 ? clamp(y, y0, y1) : (v.y0 + v.y1) / 2;
  return out;
}

/** True when (x, y) lies outside the HUD-safe box (same box as clampToView). */
export function outsideView(w, x, y, m) {
  const v = w.renderer.viewRect(0, w._vrO || (w._vrO = {}));
  const k = v.h / Math.max(1, w.renderer.cssH || 720);
  return x < v.x0 + m.x || x > v.x1 - m.x || y < v.y0 + 120 * k + m.y || y > v.y1 - 50 * k - m.y;
}

// ---- Taunts ------------------------------------------------------------------------------------

/**
 * Pick a taunt line from TAUNTS[id][kind]. `index` picks a specific line (clamped), else random.
 * @returns {string|null}
 */
export function tauntLine(w, id, kind, index) {
  const list = TAUNTS?.[id]?.[kind];
  if (!list || !list.length) return null;
  if (index !== undefined) return list[clamp(index | 0, 0, list.length - 1)];
  return list[(w.rng.next() * list.length) | 0];
}

/** Show a line on the boss's speech plaque (and as an announce fallback when no talker). */
export function say(b, w, text, time = 4.2) {
  if (!text) return;
  const t = b.data.talk || (b.data.talk = { text: '', start: 0, time: 0, lines: null, who: '' });
  const i = text.indexOf(':');
  t.who = i > 0 && i < 18 ? text.slice(0, i).trim() : '';
  t.text = i > 0 && i < 18 ? text.slice(i + 1).trim() : text;
  t.start = w.time;
  t.time = time;
  t.lines = null; // re-wrapped on next draw
  if (!b.data.talker?.alive) w.floatText(b.x, b.y - b.r - 30, text, { color: '#ffe8b0', size: 15, life: 3 });
}

/** say() a taunt from TAUNTS[id][kind]. */
export function sayTaunt(b, w, kind, index, time) {
  say(b, w, tauntLine(w, b.type, kind, index), time);
}

const TALKER_DEF = {
  id: 'wp15Talker',
  name: 'Comms',
  hp: 1,
  r: 4,
  manualMove: true,
  noContact: true,
  noSeparation: true,
  noScore: true,
  noKnockback: true,
  shareDamage: true,
  shadow: false,
  alt: 0,
  layer: 1,
  update(e, dt, w) {
    const b = e.parent;
    if (!b?.alive) return;
    // Sit inside the view so the culler never skips us (plaque position is computed in draw).
    const v = w._vrK || (w._vrK = {});
    const r = w.renderer.viewRect(0, v);
    e.x = (r.x0 + r.x1) / 2;
    e.y = (r.y0 + r.y1) / 2;
  },
  draw(ctx, e, w) {
    const b = e.parent;
    if (!b) return;
    if (b.alive) {
      try {
        b.def.drawOverlay?.(ctx, b, w);
      } catch (err) {
        w.contentError(`boss:${b.type}:overlay`, err);
      }
    }
    drawPlaque(ctx, b, w, e.alpha);
  },
};

/**
 * Spawn the overlay/talker part. `anchor(b, out)` returns the speaker's centre; the plaque sits
 * `clear` units above or below it (whichever faces the middle of the screen).
 */
export function spawnTalker(w, b, anchor, clear = 60) {
  const e = w.spawnEnemy(TALKER_DEF, b.x, b.y, { parent: b, untargetable: true, rawHp: 1 });
  e.data.anchor = anchor;
  e.data.clear = clear;
  b.data.talker = e;
  return e;
}

const _pt = { x: 0, y: 0 };

function wrap(ctx, text, maxW) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const wd of words) {
    const test = cur ? `${cur} ${wd}` : wd;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = wd;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
}

/** Parchment speech plaque with a brass frame, speaker tab and a pointer toward the speaker. */
function drawPlaque(ctx, b, w, alphaMul = 1) {
  const t = b.data.talk;
  if (!t || !t.text) return;
  const el = w.time - t.start;
  if (el >= t.time || el < 0) return;
  const tal = b.data.talker;
  const clear = tal?.data?.clear ?? 60;
  const anchor = tal?.data?.anchor;
  if (anchor) anchor(b, _pt);
  else {
    _pt.x = b.x;
    _pt.y = b.y - b.r;
  }
  const fadeIn = clamp(el / 0.25, 0, 1);
  const fadeOut = clamp((t.time - el) / 0.45, 0, 1);
  const a = Math.min(fadeIn, fadeOut) * alphaMul;
  if (a <= 0.01) return;
  const size = 13;
  ctx.font = `italic ${size}px ${FONT_BODY}`;
  if (!t.lines) {
    t.lines = wrap(ctx, `“${t.text}”`, 270);
    let mw = 0;
    for (const l of t.lines) mw = Math.max(mw, ctx.measureText(l).width);
    t.w = mw + 26;
    t.h = t.lines.length * (size + 4) + 16 + (t.who ? 6 : 0);
  }
  const bw = t.w;
  const bh = t.h;
  const v = w.renderer.viewRect(0, w._vrP || (w._vrP = {}));
  // Keep clear of the HUD (top plaques/boss bar, bottom aether bar): insets in CSS px → world.
  const k = v.h / Math.max(1, w.renderer.cssH || 720);
  const top = v.y0 + 132 * k;
  const bot = v.y1 - 70 * k;
  // Put the plaque on the side of the speaker that faces the middle of the screen.
  let px = _pt.x - bw / 2;
  let py = _pt.y < (top + bot) / 2 ? _pt.y + clear : _pt.y - bh - clear;
  px = clamp(px, v.x0 + 14 * k, Math.max(v.x0, v.x1 - bw - 14 * k));
  py = clamp(py, top, Math.max(top, bot - bh));
  const pop = 1 + 0.12 * (1 - fadeIn);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(px + bw / 2, py + bh / 2);
  ctx.scale(pop, pop);
  ctx.translate(-bw / 2, -bh / 2);
  // pointer
  const tx = clamp(_pt.x - px, 18, bw - 18);
  const below = py > _pt.y;
  ctx.beginPath();
  if (below) {
    ctx.moveTo(tx - 9, 1);
    ctx.lineTo(_pt.x - px, Math.max(-30, _pt.y - py + 10));
    ctx.lineTo(tx + 9, 1);
  } else {
    ctx.moveTo(tx - 9, bh - 1);
    ctx.lineTo(_pt.x - px, Math.min(bh + 30, _pt.y - py - 10));
    ctx.lineTo(tx + 9, bh - 1);
  }
  ctx.closePath();
  ctx.fillStyle = '#e9d9ae';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#7a5420';
  ctx.stroke();
  // shadow + body
  ctx.fillStyle = 'rgba(15,8,3,0.35)';
  rr(ctx, 4, 5, bw, bh, 7);
  ctx.fill();
  const g = ctx.createLinearGradient(0, 0, 0, bh);
  g.addColorStop(0, '#f6ebcb');
  g.addColorStop(1, '#dcc796');
  ctx.fillStyle = g;
  rr(ctx, 0, 0, bw, bh, 7);
  ctx.fill();
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = '#a8782c';
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(58,36,16,0.8)';
  rr(ctx, 3.5, 3.5, bw - 7, bh - 7, 5);
  ctx.stroke();
  // corner rivets
  ctx.fillStyle = '#c9973f';
  for (const [cx, cy] of [[5, 5], [bw - 5, 5], [5, bh - 5], [bw - 5, bh - 5]]) {
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, TAU);
    ctx.fill();
  }
  // speaker tab
  let y0 = 10;
  if (t.who) {
    ctx.font = `bold ${size - 2}px ${FONT_BODY}`;
    const ww = ctx.measureText(t.who.toUpperCase()).width + 14;
    ctx.fillStyle = '#8c2f2b';
    rr(ctx, 10, -9, ww, 16, 4);
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#3a1210';
    ctx.stroke();
    ctx.fillStyle = '#ffe8c0';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(t.who.toUpperCase(), 17, -1);
    y0 = 14;
  }
  ctx.font = `italic ${size}px ${FONT_BODY}`;
  ctx.fillStyle = '#2d1b0c';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (let i = 0; i < t.lines.length; i++) ctx.fillText(t.lines[i], 13, y0 + i * (size + 4));
  ctx.restore();
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

// ---- Phase shift ------------------------------------------------------------------------------

/**
 * Shared phase-change juice: banner + event + sfx (engine bossPhase), brief invulnerability,
 * hit-stop, slow-mo, nearby enemy bullets popped, shockwave/flare at the boss.
 * @param {{text?:string, sub?:string, invuln?:number, color?:string, clear?:number}} [o]
 */
export function phaseShift(b, w, phase, o = {}) {
  cancelHazards(b);
  w.bossPhase(b, phase, { text: o.text, sub: o.sub });
  b.invuln = true;
  b.data.invulnT = o.invuln ?? 1.4;
  w.hitstop(0.12);
  w.slowmo(0.55, 0.6);
  w.clearEnemyBullets(b.x, b.y, o.clear ?? 1400, false);
  const color = o.color || '#ffe0a0';
  w.fx.shockwave?.(b.x, b.y, 460, color, 0.8);
  w.fx.ring?.(b.x, b.y, 300, color, 0.5, { width: 6, r0: 40 });
  w.fx.flare?.(b.x, b.y, 220, color, 0.25);
  w.flash(color, 0.18);
}

/** Tick the post-phase invulnerability window (call every update). */
export function tickInvuln(b, dt) {
  const D = b.data;
  if (D.invulnT > 0) {
    D.invulnT -= dt;
    if (D.invulnT <= 0 && !D.entering) b.invuln = false;
  }
}

// ---- Drawing helpers ------------------------------------------------------------------------

/** Draw a cached sprite with non-uniform scale (e.g. extending arms). */
export function drawStretched(ctx, name, x, y, angle, sx, sy, alpha = 1, frame = 0) {
  const s = Sprites.get(name, frame);
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(sx, sy);
  ctx.drawImage(s.img, -s.cx, -s.cy, s.w, s.h);
  ctx.restore();
}

/**
 * Jagged electric arc from (x1,y1) to (x2,y2): additive halo + coloured body + white core.
 * Random each call (it's meant to flicker). Caller sets composite if batching.
 */
export function zap(ctx, x1, y1, x2, y2, color, width = 3, jitter = 9, a = 1) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const n = Math.max(3, Math.min(28, (len / 26) | 0));
  const nx = -dy / len;
  const ny = dx / len;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  for (let i = 1; i < n; i++) {
    const k = i / n;
    const off = (Math.random() - 0.5) * 2 * jitter * Math.sin(Math.PI * k + 0.3);
    ctx.lineTo(x1 + dx * k + nx * off, y1 + dy * k + ny * off);
  }
  ctx.lineTo(x2, y2);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.22 * a;
  ctx.lineWidth = width * 3.2;
  ctx.stroke();
  ctx.globalAlpha = 0.85 * a;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.globalAlpha = 0.9 * a;
  ctx.lineWidth = Math.max(1, width * 0.35);
  ctx.stroke();
}

/** Set the weather's intensity, remembering the original for restoreWeather(). */
export function stormWeather(b, w, v) {
  const wt = w.weather;
  if (!wt?.setIntensity) return;
  if (b.data.weatherWas === undefined) b.data.weatherWas = wt.intensity ?? 1;
  wt.setIntensity(v);
}

export function restoreWeather(b, w) {
  if (b.data.weatherWas === undefined) return;
  w.weather?.setIntensity?.(b.data.weatherWas);
  b.data.weatherWas = undefined;
}
