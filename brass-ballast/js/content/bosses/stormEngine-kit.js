// WP15 shared boss kit — used by stormEngine.js and behemoth.js (named after the first boss only
// because WP15 owns `stormEngine-*.js` / `behemoth-*.js`). Every titan's taunts go through its
// comms talker (sayTaunt + spawnTalker), so boss dialogue looks the same in every fight.
//
//  - part helpers: proportional part hp, local → world transforms, hazard bookkeeping
//  - the "talker": an overlay part that draws a docked comms panel with speaker portraits (boss
//    taunts from TAUNTS[id]) plus any boss overlay (screen crackle…) above every other enemy
//  - phase-shift juice (banner, invuln window, hit-stop, slow-mo, bullet clear, shockwave)
//  - small drawing helpers for runtime jagged electric arcs and stretched sprites

import { FONT_BODY } from '../../config.js';
import { Sprites } from '../../gfx/sprites.js';
import { TAUNTS } from '../codex.js';
import { events } from '../../core/events.js';
import { TAU, clamp } from '../../core/math.js';
import { PAL, metal, metalRadial, glow, ink, gear, rivetRing } from '../../gfx/drawkit.js';

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

// ---- Multi-part damage ledger -------------------------------------------------------------

/**
 * When several parts forward the SAME hit to the boss (an explosion overlapping hitboxes, a
 * piercing or bouncing shot passing through several parts, a chain zap hopping between them),
 * the boss takes it once — the largest share — instead of once per part. Projectile hits are
 * keyed by projectile + pool generation; everything else by owner + source within one sim
 * step. Call from the boss def's `modifyDamage`; returns the amount to actually apply.
 */
export function ledger(b, amt, info, w) {
  const D = b.data;
  const L = D._ledger || (D._ledger = { t: -1, step: new Map(), proj: new Map() });
  if (L.t !== w.time) {
    L.t = w.time;
    L.step.clear();
  }
  const p = info?.projectile;
  if (p) {
    if (L.proj.size > 600) L.proj.clear();
    const rec = L.proj.get(p);
    if (rec && rec.gen === p.gen) {
      if (amt <= rec.amt) return 0;
      const extra = amt - rec.amt;
      rec.amt = amt;
      return extra;
    }
    if (rec) {
      rec.gen = p.gen;
      rec.amt = amt;
    } else L.proj.set(p, { gen: p.gen, amt });
    return amt;
  }
  const o = info?.owner;
  const key = `${o ? (o.index ?? o.id ?? '?') : '-'}|${info?.source ?? ''}`;
  const prev = L.step.get(key);
  if (prev === undefined) {
    L.step.set(key, amt);
    return amt;
  }
  if (amt <= prev) return 0;
  L.step.set(key, amt);
  return amt - prev;
}

// ---- Comms portraits ----------------------------------------------------------------------

export const PORTRAIT = { vex: 'boss_wp15_vex', crew: 'boss_wp15_crew' };

function portraitFrame(ctx, c, field) {
  ctx.beginPath();
  ctx.arc(c, c, 23, 0, TAU);
  ctx.fillStyle = metal(ctx, c - 23, c - 23, c + 23, c + 23, 'brass', { polish: true });
  ctx.fill();
  ink(ctx, 1.2);
  ctx.beginPath();
  ctx.arc(c, c, 19, 0, TAU);
  const g = ctx.createRadialGradient(c - 5, c - 6, 2, c, c, 19);
  g.addColorStop(0, field[0]);
  g.addColorStop(1, field[1]);
  ctx.fillStyle = g;
  ctx.fill();
  ink(ctx, 0.9);
}

Sprites.register(PORTRAIT.vex, {
  w: 48,
  h: 48,
  scale: 3,
  draw(ctx) {
    const c = 24;
    portraitFrame(ctx, c, ['#b8433a', '#3a0c0a']);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, 19, 0, TAU);
    ctx.clip();
    // greatcoat + epaulettes
    ctx.fillStyle = '#1c1f26';
    ctx.beginPath();
    ctx.ellipse(c, c + 21, 17, 11, 0, 0, TAU);
    ctx.fill();
    for (const s of [-1, 1]) {
      ctx.fillStyle = metal(ctx, c + s * 13 - 4, c + 10, c + s * 13 + 4, c + 16, 'gold');
      ctx.beginPath();
      ctx.ellipse(c + s * 12, c + 13, 5, 2.6, s * 0.3, 0, TAU);
      ctx.fill();
    }
    // face
    ctx.fillStyle = '#e9c6a0';
    ctx.beginPath();
    ctx.ellipse(c, c + 2, 7.5, 9, 0, 0, TAU);
    ctx.fill();
    ink(ctx, 0.6);
    // moustache
    ctx.strokeStyle = '#2a1a10';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(c - 6.5, c + 4);
    ctx.quadraticCurveTo(c - 3, c + 6.5, c, c + 4.6);
    ctx.quadraticCurveTo(c + 3, c + 6.5, c + 6.5, c + 4);
    ctx.stroke();
    // monocle + glint
    ctx.beginPath();
    ctx.arc(c + 3.2, c, 2.6, 0, TAU);
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = '#ffcf4a';
    ctx.stroke();
    glow(ctx, c + 2.2, c - 1, 2.2, '#ffffff', 0.9);
    ctx.fillStyle = '#1a120a';
    ctx.fillRect(c - 4.6, c - 0.6, 2.2, 1.2);
    // bicorne hat with a crimson cockade
    ctx.fillStyle = '#121318';
    ctx.beginPath();
    ctx.moveTo(c - 15, c - 4);
    ctx.quadraticCurveTo(c, c - 19, c + 15, c - 4);
    ctx.quadraticCurveTo(c, c - 9, c - 15, c - 4);
    ctx.fill();
    ctx.strokeStyle = '#c9973f';
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c + 5, c - 8.5, 2.2, 0, TAU);
    ctx.fillStyle = PAL.syndicate[2];
    ctx.fill();
    ctx.restore();
    rivetRing(ctx, c, c, 21, 10, 0.7, 'brass');
  },
});

Sprites.register(PORTRAIT.crew, {
  w: 48,
  h: 48,
  scale: 3,
  draw(ctx) {
    const c = 24;
    portraitFrame(ctx, c, ['#4d74a0', '#13202f']);
    // brass speaking-tube horn over a cog
    gear(ctx, c, c + 2, 12, 10, { kind: 'brass', hole: 3.5, spokes: 4 });
    ctx.beginPath();
    ctx.moveTo(c - 3, c - 13);
    ctx.lineTo(c + 3, c - 13);
    ctx.lineTo(c + 7, c - 4);
    ctx.lineTo(c - 7, c - 4);
    ctx.closePath();
    ctx.fillStyle = metal(ctx, c - 7, c - 13, c + 7, c - 4, 'copper', { polish: true });
    ctx.fill();
    ink(ctx, 0.7);
    ctx.beginPath();
    ctx.arc(c, c + 2, 3, 0, TAU);
    ctx.fillStyle = metalRadial(ctx, c, c + 2, 3, 'iron');
    ctx.fill();
    rivetRing(ctx, c, c, 21, 10, 0.7, 'brass');
  },
});

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

/**
 * Show a line on the boss's comms panel (floating text fallback when there's no talker).
 * `soft` lines never interrupt one that is still being shown.
 */
export function say(b, w, text, time = 4.2, soft = false) {
  if (!text) return;
  const t = b.data.talk || (b.data.talk = { text: '', start: -99, time: 0, lines: null, who: '' });
  if (soft && t.text && w.time - t.start < t.time - 0.5) return;
  const i = text.indexOf(':');
  t.who = i > 0 && i < 18 ? text.slice(0, i).trim() : '';
  t.text = i > 0 && i < 18 ? text.slice(i + 1).trim() : text;
  t.start = w.time;
  t.time = time;
  t.lines = null; // re-wrapped on next draw
  if (!b.data.talker?.alive) w.floatText(b.x, b.y - b.r - 30, text, { color: '#ffe8b0', size: 15, life: 3 });
}

/** say() a taunt from TAUNTS[id][kind]. Returns the line (or null when there is none). */
export function sayTaunt(b, w, kind, index, time, soft = false) {
  const line = tauntLine(w, b.type, kind, index);
  say(b, w, line, time, soft);
  return line;
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

/** Spawn the overlay/talker part (comms panel + the boss's `drawOverlay`). */
export function spawnTalker(w, b) {
  const e = w.spawnEnemy(TALKER_DEF, b.x, b.y, { parent: b, untargetable: true, rawHp: 1 });
  b.data.talker = e;
  return e;
}

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

/**
 * Comms panel: a parchment plaque docked at the left edge under the HUD, sliding in with the
 * speaker's portrait and name tab. Drawn in world space but sized in CSS px (scaled by the
 * current zoom) so it reads the same at every zoom and never covers the fight.
 */
function drawPlaque(ctx, b, w, alphaMul = 1) {
  const t = b.data.talk;
  if (!t || !t.text) return;
  const el = w.time - t.start;
  if (el >= t.time || el < 0) return;
  const fadeIn = clamp(el / 0.3, 0, 1);
  const fadeOut = clamp((t.time - el) / 0.45, 0, 1);
  const a = Math.min(1, fadeOut * 1.5) * alphaMul;
  if (a <= 0.01) return;
  const size = 14;
  const textX = 64;
  ctx.font = `italic ${size}px ${FONT_BODY}`;
  if (!t.lines) {
    t.lines = wrap(ctx, `“${t.text}”`, 236);
    let mw = 0;
    for (const l of t.lines) mw = Math.max(mw, ctx.measureText(l).width);
    t.w = Math.max(170, mw + textX + 14);
    t.h = Math.max(58, t.lines.length * (size + 4) + 26);
  }
  const bw = t.w;
  const bh = t.h;
  const v = w.renderer.viewRect(0, w._vrP || (w._vrP = {}));
  const k = v.h / Math.max(1, w.renderer.cssH || 720);
  const ease = 1 - (1 - fadeIn) ** 3;
  const slide = (1 - ease) * (bw + 30);
  ctx.save();
  ctx.translate(v.x0 + (14 - slide) * k, v.y0 + 104 * k);
  ctx.scale(k, k);
  ctx.globalAlpha = a;
  // shadow + body
  ctx.fillStyle = 'rgba(15,8,3,0.4)';
  rr(ctx, 4, 5, bw, bh, 8);
  ctx.fill();
  const g = ctx.createLinearGradient(0, 0, 0, bh);
  g.addColorStop(0, '#f6ebcb');
  g.addColorStop(1, '#d8c290');
  ctx.fillStyle = g;
  rr(ctx, 0, 0, bw, bh, 8);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#a8782c';
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(58,36,16,0.8)';
  rr(ctx, 4, 4, bw - 8, bh - 8, 5);
  ctx.stroke();
  ctx.fillStyle = '#c9973f';
  for (const [cx, cy] of [[6, 6], [bw - 6, 6], [6, bh - 6], [bw - 6, bh - 6]]) {
    ctx.beginPath();
    ctx.arc(cx, cy, 2.2, 0, TAU);
    ctx.fill();
  }
  // portrait + a little "transmitting" pulse
  const vex = /vex/i.test(t.who);
  const pr = Sprites.get(vex ? PORTRAIT.vex : PORTRAIT.crew);
  const py = Math.min(bh / 2, 34);
  ctx.drawImage(pr.img, 32 - 24, py - 24, 48, 48);
  const talking = el < t.time - 0.6 && (el * 6) % 1 < 0.6;
  ctx.fillStyle = talking ? '#ff6a3a' : '#5a1b18';
  ctx.beginPath();
  ctx.arc(50, py + 18, 3.2, 0, TAU);
  ctx.fill();
  // speaker tab
  const who = (t.who || 'COMMS').toUpperCase();
  ctx.font = `bold ${size - 3}px ${FONT_BODY}`;
  const ww = ctx.measureText(who).width + 14;
  ctx.fillStyle = vex ? '#8c2f2b' : '#2e4a6b';
  rr(ctx, textX - 2, -8, ww, 16, 4);
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = '#2a1208';
  ctx.stroke();
  ctx.fillStyle = '#ffe8c0';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(who, textX + 5, 0);
  // the line, typed out
  ctx.font = `italic ${size}px ${FONT_BODY}`;
  ctx.fillStyle = '#2d1b0c';
  ctx.textBaseline = 'top';
  let chars = Math.floor(el * 55);
  for (let i = 0; i < t.lines.length && chars > 0; i++) {
    const line = t.lines[i];
    ctx.fillText(chars >= line.length ? line : line.slice(0, chars), textX, 14 + i * (size + 4));
    chars -= line.length;
  }
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
  touched = { wt, was: b.data.weatherWas };
}

export function restoreWeather(b, w) {
  if (b.data.weatherWas === undefined) return;
  w.weather?.setIntensity?.(b.data.weatherWas);
  b.data.weatherWas = undefined;
  touched = null;
}

// A run can end (or restart) mid-fight without the boss dying: put the sky back regardless.
let touched = null;
function resetWeather() {
  if (!touched) return;
  try {
    touched.wt.setIntensity(touched.was);
  } catch {
    /* weather is optional */
  }
  touched = null;
}
events.on('run:end', resetWeather);
events.on('run:start', resetWeather);
events.on('stage:start', resetWeather);
