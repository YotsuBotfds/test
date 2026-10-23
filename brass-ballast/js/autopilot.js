// Autopilot: a competent bot for soak tests and simulated co-op (DESIGN §10, WP1).
// Kites enemies, dodges threatening bullets (closest-approach prediction), steps out of
// telegraphs and hazards, collects pickups, fires at priority targets with lead, boosts when a
// hit is imminent, bombs when swarmed, picks cards by priority, and (with autostart) presses
// through results screens by restarting the run.

import { events } from './core/events.js';
import { angleDiff, clamp, distToSegment2 } from './core/math.js';
import { AUX } from './content/weapons/auxiliaries.js';

const PASSIVE_PRIORITY = {
  twinBarrels: 48, quickLoader: 46, rifling: 45, plating: 44, repairCrew: 42, piercing: 40,
  aetherShield: 40, luckyRivet: 36, ironHide: 36, magnet: 34, fins: 33, boiler: 32,
  explosiveTips: 34, bigBore: 31, incendiary: 30, ricochet: 30, vengeance: 30, clockwork: 30,
  extraBallast: 26, scavenger: 22,
};
const RARITY_BONUS = { legendary: 40, epic: 15, rare: 5, common: 0 };

/**
 * Score cards and return the best one.
 * @param {any[]} cards
 * @param {{player:any}} [choice]
 */
export function autoPickCard(cards, choice) {
  const p = choice?.player;
  let best = cards[0];
  let bs = -Infinity;
  for (const c of cards) {
    if (!c) continue;
    let s = RARITY_BONUS[c.rarity] || 0;
    switch (c.kind) {
      case 'evolution':
        s += 100;
        break;
      case 'primaryLevel':
        s += 58 - (c.level || 1) * 3;
        break;
      case 'auxNew':
        s += p && p.aux.length >= 4 ? -50 : 54;
        break;
      case 'auxLevel':
        s += 50 + (c.level >= 5 ? 6 : 0);
        break;
      case 'passive':
        s += PASSIVE_PRIORITY[c.id] ?? 28;
        // The evolution partner of an aux we own: a first level unlocks a legendary card.
        if (p?.aux?.some((a) => AUX[a.id]?.evolvesWith === c.id)) s += p.passiveLevel?.(c.id) ? 6 : 26;
        if (c.id === 'plating' && p && p.hp < p.stats.maxHp * 0.5) s += 15;
        break;
      case 'repair':
        s += p && p.hp < p.stats.maxHp * 0.5 ? 70 : 8;
        break;
      case 'cogs':
        s += 5;
        break;
      default:
        s += 20;
    }
    s += Math.random() * 6;
    if (s > bs) {
      bs = s;
      best = c;
    }
  }
  return best;
}

/**
 * Create a brain function for one player: (player, dt, world) => controls.
 * `skill` (0..1, default 1 = near-perfect) makes the bot notice only that share of incoming
 * shots and react later — a rough stand-in for a human when judging difficulty
 * (URL flag `botskill=0.5`).
 * @param {{aggression?:number, skill?:number}} [opts]
 */
export function createBrain(opts = {}) {
  const c = {
    moveX: 0, moveY: 0, aimX: 1, aimY: 0, aimMag: 1, aimMode: 'stick', mouseWorld: null,
    fire: false, boost: false, bomb: false, pause: false, device: 'bot', aimAssist: false,
  };
  const st = {
    bombCd: 3,
    boostCd: 0,
    retarget: 0,
    target: null,
    orbitDir: Math.random() < 0.5 ? 1 : -1,
    orbitT: 4,
    wander: Math.random() * 6.28,
    pickup: null,
  };
  const aggression = opts.aggression ?? 1;
  const skill = clamp(opts.skill ?? 1, 0.05, 1);
  const horizon = 0.35 + 0.75 * skill; // seconds of look-ahead for incoming shots

  return function brain(p, dt, w) {
    c.boost = false;
    c.bomb = false;
    c.fire = false;
    if (!p.alive) {
      c.moveX = c.moveY = 0;
      return c;
    }
    st.bombCd -= dt;
    st.boostCd -= dt;
    st.retarget -= dt;
    st.orbitT -= dt;
    if (st.orbitT <= 0) {
      st.orbitT = 3 + Math.random() * 5;
      if (Math.random() < 0.4) st.orbitDir = -st.orbitDir;
    }
    let mx = 0;
    let my = 0;
    let danger = 0;
    let imminent = false;
    let bulletsNear = 0;

    // --- 1. Bullets: closest-approach prediction.
    const B = w.eBullets;
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      if (!b.alive || b.dead) continue;
      if (b.lob) {
        const L = b.lob;
        const rr = (b.explode?.radius ?? 30) + p.r + 18;
        const dx = p.x - L.tx;
        const dy = p.y - L.ty;
        const d = Math.hypot(dx, dy);
        if (d < rr) {
          const k = (1 - d / rr) * 2.5;
          mx += (dx / (d || 1)) * k;
          my += (dy / (d || 1)) * k;
          danger += k * 0.5;
        }
        continue;
      }
      // Lower skill: some shots simply go unnoticed (stable per bullet).
      if (skill < 1 && ((b.id * 2654435761) >>> 0) % 1000 >= skill * 1000) continue;
      const rx = b.x - p.x;
      const ry = b.y - p.y;
      const d2 = rx * rx + ry * ry;
      if (d2 > 380 * 380) continue;
      if (d2 < 160 * 160) bulletsNear++;
      const vx = b.vx - p.vx * 0.5;
      const vy = b.vy - p.vy * 0.5;
      const v2 = vx * vx + vy * vy || 1;
      let t = -(rx * vx + ry * vy) / v2;
      const safe = b.r * b.scale + p.hitR + 18;
      if (t < 0) {
        if (d2 > safe * safe) continue;
        t = 0;
      }
      if (t > horizon) continue;
      const cx = rx + vx * t;
      const cy = ry + vy * t;
      const miss = Math.hypot(cx, cy);
      if (miss >= safe) continue;
      const urgency = (1 - t / horizon) * (1.2 - miss / safe);
      let ax = -cx;
      let ay = -cy;
      if (miss < 3) {
        ax = -vy;
        ay = vx;
      }
      const al = Math.hypot(ax, ay) || 1;
      mx += (ax / al) * urgency * 3.2;
      my += (ay / al) * urgency * 3.2;
      danger += urgency;
      if (t < 0.2 && miss < safe * 0.8) imminent = true;
    }

    // --- 2. Hazards & telegraphs.
    const H = w.hazards;
    for (let i = 0; i < H.length; i++) {
      const h = H[i];
      if (!h.alive || h.team === 'player') continue;
      const pad = p.r + 26;
      if (h.shape === 'line') {
        const hw = h.width / 2 + pad;
        if (distToSegment2(p.x, p.y, h.x, h.y, h.x2, h.y2) > hw * hw) continue;
        const ldx = h.x2 - h.x;
        const ldy = h.y2 - h.y;
        const ll = Math.hypot(ldx, ldy) || 1;
        let nx = -ldy / ll;
        let ny = ldx / ll;
        if ((p.x - h.x) * nx + (p.y - h.y) * ny < 0) {
          nx = -nx;
          ny = -ny;
        }
        mx += nx * 3;
        my += ny * 3;
        danger += 1;
      } else if (h.shape === 'ring') {
        const d = Math.hypot(p.x - h.x, p.y - h.y) || 1;
        if (Math.abs(d - h.r) > h.width / 2 + pad) continue;
        const sgn = d < h.r ? -1 : 1;
        mx += ((p.x - h.x) / d) * 2.5 * sgn;
        my += ((p.y - h.y) / d) * 2.5 * sgn;
        danger += 0.8;
      } else {
        const d = Math.hypot(p.x - h.x, p.y - h.y) || 1;
        const rr = h.r + pad;
        if (d > rr) continue;
        const k = 1.5 + 2 * (1 - d / rr);
        mx += ((p.x - h.x) / d) * k;
        my += ((p.y - h.y) / d) * k;
        danger += 0.8;
      }
    }

    // --- 3. Enemies: keep-out, kiting, orbit.
    const E = w.enemies;
    let near = 0;
    let cxSum = 0;
    let cySum = 0;
    let cn = 0;
    let nearest = null;
    let nd = Infinity;
    let boss = null;
    for (let i = 0; i < E.length; i++) {
      const e = E[i];
      if (!e.alive) continue;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      if (e.isBoss && !e.parent) boss = e;
      const keep = e.r + p.r + (e.isBoss || e.parent ? 200 : 110 / aggression);
      if (d < keep * 1.6 && !e.def.noContact) {
        const k = (1 - d / (keep * 1.6)) * (e.isBoss || e.parent ? 3 : 2.2);
        mx += (dx / d) * k;
        my += (dy / d) * k;
      }
      if (d < 220) near++;
      if (d < 800) {
        cxSum += e.x;
        cySum += e.y;
        cn++;
      }
      if (!e.untargetable && !e.phased && d < nd) {
        nd = d;
        nearest = e;
      }
    }
    if (cn) {
      const ccx = cxSum / cn;
      const ccy = cySum / cn;
      const dx = ccx - p.x;
      const dy = ccy - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const want = boss ? 380 + boss.r : 300;
      const radial = d > want + 120 ? 0.7 : d < want - 80 ? -0.9 : 0;
      mx += (dx / d) * radial + (-dy / d) * 0.75 * st.orbitDir;
      my += (dy / d) * radial + (dx / d) * 0.75 * st.orbitDir;
    } else {
      st.wander += (Math.random() - 0.5) * dt;
      mx += Math.cos(st.wander) * 0.5;
      my += Math.sin(st.wander) * 0.5;
    }

    // --- Co-op cohesion: don't wander away from teammates.
    if (w.players.length > 1) {
      let mate = null;
      let md = Infinity;
      for (const q of w.players) {
        if (q === p || !q.alive) continue;
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < md) {
          md = d;
          mate = q;
        }
      }
      if (mate && md > 340) {
        const k = Math.min(1.6, (md - 340) / 300);
        mx += ((mate.x - p.x) / md) * k;
        my += ((mate.y - p.y) / md) * k;
      }
    }

    // --- 4. Pickups.
    if (danger < 1.2) {
      let best = null;
      let bscore = Infinity;
      const P = w.pickups;
      const lowHp = p.hp < p.stats.maxHp * 0.6;
      for (let i = 0; i < P.length; i++) {
        const k = P[i];
        if (!k.alive) continue;
        const d = Math.hypot(k.x - p.x, k.y - p.y);
        if (d > 520) continue;
        let score = d;
        if (k.type === 'crate') score -= 260;
        else if (k.type === 'repair') score -= lowHp ? 320 : 20;
        else if (k.type === 'bomb') score -= p.bombs < p.stats.bombsMax ? 120 : -200;
        else if (k.type === 'steam') score -= 40;
        if (score < bscore) {
          bscore = score;
          best = k;
        }
      }
      if (best) {
        const dx = best.x - p.x;
        const dy = best.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const k = danger < 0.3 ? 1.1 : 0.5;
        mx += (dx / d) * k;
        my += (dy / d) * k;
      }
    }

    const ml = Math.hypot(mx, my);
    if (ml > 0.05) {
      c.moveX = mx / Math.max(1, ml);
      c.moveY = my / Math.max(1, ml);
      if (ml > 0.5) {
        c.moveX = mx / ml;
        c.moveY = my / ml;
      }
    } else {
      c.moveX = c.moveY = 0;
    }

    // --- 5. Aim & fire.
    if (st.retarget <= 0 || !st.target?.alive) {
      st.retarget = 0.25;
      let best = null;
      let bscore = Infinity;
      for (let i = 0; i < E.length; i++) {
        const e = E[i];
        if (!e.alive || e.untargetable || e.phased || e.invuln) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d > 780) continue;
        let score = d;
        if (e.isBoss) score -= 120;
        if (e.elite) score -= 140;
        if (e.def.contactDamage > 0 && d < 260) score -= 160;
        if (score < bscore) {
          bscore = score;
          best = e;
        }
      }
      st.target = best || nearest;
    }
    const tg = st.target;
    if (tg && tg.alive) {
      const d = Math.hypot(tg.x - p.x, tg.y - p.y);
      const lead = Math.min(0.6, d / 750);
      const ax = tg.x + (tg.vx || 0) * lead - p.x;
      const ay = tg.y + (tg.vy || 0) * lead - p.y;
      const al = Math.hypot(ax, ay) || 1;
      c.aimX = ax / al;
      c.aimY = ay / al;
      c.fire = d < 820;
    } else if (boss) {
      const ax = boss.x - p.x;
      const ay = boss.y - p.y;
      const al = Math.hypot(ax, ay) || 1;
      c.aimX = ax / al;
      c.aimY = ay / al;
      c.fire = true;
    }
    c.aimMag = 1;

    // --- 6. Boost & bomb.
    if (imminent && st.boostCd <= 0 && p.steam >= p.stats.boostCost) {
      c.boost = true;
      st.boostCd = 0.5;
      if (Math.hypot(c.moveX, c.moveY) < 0.2) {
        c.moveX = -c.aimY;
        c.moveY = c.aimX;
      }
    } else if (near >= 6 && st.boostCd <= 0 && p.steam >= p.stats.boostCost * 2) {
      c.boost = true;
      st.boostCd = 1.2;
    }
    const lowHull = p.hp < p.stats.maxHp * 0.3;
    if (
      st.bombCd <= 0 &&
      p.bombs > 0 &&
      (near >= 12 || bulletsNear >= 22 || (lowHull && danger > 1.5) || (boss && danger > 3 && lowHull))
    ) {
      c.bomb = true;
      st.bombCd = 5;
    }
    // Unused but handy for debugging.
    st.lastDanger = danger;
    st.lastAngleErr = Math.abs(angleDiff(p.aim, Math.atan2(c.aimY, c.aimX)));
    c.moveX = clamp(c.moveX, -1, 1);
    c.moveY = clamp(c.moveY, -1, 1);
    return c;
  };
}

/**
 * Hand player 1 to the bot. With `restart`, results screens auto-restart after a pause.
 * @param {any} game
 * @param {{restart?:boolean, delay?:number}} [opts]
 */
export function enableAutopilot(game, opts = {}) {
  game.autopilot = true;
  const attach = () => {
    const p = game.world?.players?.[0];
    if (p) {
      p.brain = createBrain({ skill: opts.skill });
      p.autoPick = autoPickCard;
    }
  };
  events.on('run:start', attach);
  attach();
  if (opts.restart) {
    events.on('run:end', ({ summary } = {}) => {
      if (summary?.abandoned) return;
      setTimeout(() => {
        if (game.state === 'gameover' || game.state === 'victory') {
          game.ui?.hide?.();
          game.restart();
        }
      }, (opts.delay ?? 4) * 1000);
    });
  }
}
