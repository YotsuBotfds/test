// Steering & firing helpers for enemy/boss behaviors (DESIGN §4.6).
//
// Conventions:
//  • `speed` arguments are BASE speeds (u/s): helpers multiply by `e.speedMult` themselves.
//  • `cooldown()` honors `e.fireRateMult`; the `fire*` helpers use `owner: e` so the engine
//    auto-scales damage by `e.dmgMult` and speed by `run.mods.enemyBulletSpeed`.
//  • Helpers write e.vx / e.vy (the engine integrates position unless `def.manualMove`).

import { TAU, angleDiff, wrapAngle, clamp } from '../core/math.js';

/**
 * Turn toward a point at `turn` rad/s and move forward at `speed`.
 * @returns {number} distance to target
 */
export function steerToward(e, tx, ty, speed, turn, dt) {
  const want = Math.atan2(ty - e.y, tx - e.x);
  const d = angleDiff(e.angle, want);
  const step = turn * dt;
  e.angle = wrapAngle(e.angle + (Math.abs(d) <= step ? d : Math.sign(d) * step));
  const sp = speed * (e.speedMult ?? 1);
  e.vx = Math.cos(e.angle) * sp;
  e.vy = Math.sin(e.angle) * sp;
  return Math.hypot(tx - e.x, ty - e.y);
}

/**
 * Accelerate toward a point (inertial seek). Velocity converges to `speed` toward target.
 * @returns {number} distance to target
 */
export function seek(e, tx, ty, speed, accel, dt) {
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const sp = speed * (e.speedMult ?? 1);
  // Arrive: slow down inside 60 u so seekers don't jitter around the point.
  const k = d < 60 ? d / 60 : 1;
  accelTo(e, (dx / d) * sp * k, (dy / d) * sp * k, accel * (e.speedMult ?? 1), dt);
  return d;
}

/** Move e.vx/vy toward (vx, vy) by at most `accel·dt`. */
export function accelTo(e, vx, vy, accel, dt) {
  const ax = vx - e.vx;
  const ay = vy - e.vy;
  const l = Math.hypot(ax, ay);
  const step = accel * dt;
  if (l <= step || l < 1e-6) {
    e.vx = vx;
    e.vy = vy;
  } else {
    e.vx += (ax / l) * step;
    e.vy += (ay / l) * step;
  }
}

/**
 * Hold a distance band around `target` ({x,y}); drifts sideways while inside the band.
 * @param {number} [dir] strafe direction (+1 clockwise, -1 ccw); default from e.data.strafeDir
 * @returns {number} current distance
 */
export function keepRange(e, target, min, max, speed, dt, dir) {
  if (!target) return Infinity;
  const dx = target.x - e.x;
  const dy = target.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const nx = dx / d;
  const ny = dy / d;
  if (dir === undefined) {
    if (!e.data.strafeDir) e.data.strafeDir = Math.random() < 0.5 ? -1 : 1;
    dir = e.data.strafeDir;
  }
  const radial = d > max ? 1 : d < min ? -1 : 0;
  const sp = speed * (e.speedMult ?? 1);
  const tang = radial === 0 ? 0.6 : 0.35;
  const vx = (nx * radial + -ny * dir * tang) * sp;
  const vy = (ny * radial + nx * dir * tang) * sp;
  accelTo(e, vx, vy, sp * 3, dt);
  return d;
}

/**
 * Circle a point. dir: +1 clockwise (screen), -1 counter-clockwise.
 * @returns {number} angle of e around the center
 */
export function orbit(e, cx, cy, radius, speed, dir, dt) {
  const dx = e.x - cx;
  const dy = e.y - cy;
  const d = Math.hypot(dx, dy) || 1;
  const nx = dx / d;
  const ny = dy / d;
  const sp = speed * (e.speedMult ?? 1);
  const radial = clamp((radius - d) / 80, -1, 1);
  const vx = (-ny * dir + nx * radial) * sp;
  const vy = (nx * dir + ny * radial) * sp;
  accelTo(e, vx, vy, sp * 4, dt);
  return Math.atan2(dy, dx);
}

/** Rotate e.angle toward `angle` at `rate` rad/s. Returns remaining |difference|. */
export function faceToward(e, angle, rate, dt) {
  const d = angleDiff(e.angle, angle);
  const step = rate * dt;
  e.angle = wrapAngle(e.angle + (Math.abs(d) <= step ? d : Math.sign(d) * step));
  return Math.abs(d) <= step ? 0 : Math.abs(d) - step;
}

/** Face the direction of travel (when moving faster than `minSpeed`). */
export function faceVelocity(e, rate, dt, minSpeed = 10) {
  if (e.vx * e.vx + e.vy * e.vy < minSpeed * minSpeed) return;
  faceToward(e, Math.atan2(e.vy, e.vx), rate, dt);
}

/**
 * Angle from e to target, optionally leading a moving target for a shot of `leadSpeed`.
 * @param {{x:number,y:number}} e
 * @param {{x:number,y:number,vx?:number,vy?:number}} target
 * @param {number} [leadSpeed]
 */
export function aimAngle(e, target, leadSpeed) {
  if (!target) return e.angle || 0;
  let tx = target.x;
  let ty = target.y;
  if (leadSpeed > 0 && (target.vx || target.vy)) {
    // One refinement step of intercept prediction is plenty for readable leading.
    const d = Math.hypot(tx - e.x, ty - e.y);
    const t = Math.min(1.2, d / leadSpeed);
    tx += (target.vx || 0) * t;
    ty += (target.vy || 0) * t;
  }
  return Math.atan2(ty - e.y, tx - e.x);
}

/**
 * Fire `count` shots fanned over a total arc `spread` (radians) centered on `angle`.
 * opts are world.fire() options (speed, damage, kind, r, life…); x/y default to e.x/e.y.
 * @returns {any[]} projectiles
 */
export function fireSpread(world, e, angle, count, spread, opts = {}) {
  const out = [];
  const n = Math.max(1, count | 0);
  for (let i = 0; i < n; i++) {
    const a = n === 1 ? angle : angle - spread / 2 + (spread * i) / (n - 1);
    out.push(
      world.fire({
        team: 'enemy',
        owner: e,
        source: 'enemy',
        ...opts,
        x: opts.x ?? e.x,
        y: opts.y ?? e.y,
        angle: a,
      })
    );
  }
  return out;
}

/**
 * Ring of `count` shots around (x, y), first shot at `offset` radians.
 * Pass `opts.owner` (an enemy) so damage scales with its dmgMult.
 */
export function fireRing(world, x, y, count, offset = 0, opts = {}) {
  const out = [];
  const n = Math.max(1, count | 0);
  for (let i = 0; i < n; i++) {
    out.push(
      world.fire({ team: 'enemy', source: 'enemy', ...opts, x, y, angle: offset + (i / n) * TAU })
    );
  }
  return out;
}

/**
 * One shot at `target`; `opts.lead: true` leads the target using opts.speed.
 * @returns {any} projectile
 */
export function fireAimed(world, e, target, opts = {}) {
  const sp = (opts.speed ?? 220) * (world.run?.mods?.enemyBulletSpeed ?? 1);
  const a = aimAngle(e, target, opts.lead ? sp : 0) + (opts.jitter ? (Math.random() - 0.5) * opts.jitter : 0);
  return world.fire({
    team: 'enemy',
    owner: e,
    source: 'enemy',
    ...opts,
    x: opts.x ?? e.x,
    y: opts.y ?? e.y,
    angle: a,
  });
}

/**
 * Tick a named cooldown stored in e.data[key]; true (and reset) when it elapses.
 * First call starts at a random 30–100% of `seconds` so groups don't fire in lockstep.
 * Honors e.fireRateMult.
 */
export function cooldown(e, key, seconds, dt) {
  let t = e.data[key];
  if (t === undefined) t = seconds * (0.3 + Math.random() * 0.7);
  t -= dt * (e.fireRateMult ?? 1);
  if (t <= 0) {
    e.data[key] = t + seconds > 0 ? t + seconds : seconds;
    return true;
  }
  e.data[key] = t;
  return false;
}

/** Simple state timer: returns true once when e.timer runs out. */
export function timerDone(e, dt) {
  e.timer -= dt;
  return e.timer <= 0;
}

/** Switch e.state and reset e.timer. */
export function setState(e, state, time = 0) {
  e.state = state;
  e.timer = time;
}

/** Distance from e to the nearest living player (Infinity if none). */
export function distToPlayer(world, e) {
  const p = world.nearestPlayer(e.x, e.y);
  return p ? Math.hypot(p.x - e.x, p.y - e.y) : Infinity;
}

/** Push velocity away from a point (used for flee / panic). */
export function flee(e, fx, fy, speed, dt) {
  const dx = e.x - fx;
  const dy = e.y - fy;
  const d = Math.hypot(dx, dy) || 1;
  const sp = speed * (e.speedMult ?? 1);
  accelTo(e, (dx / d) * sp, (dy / d) * sp, sp * 3, dt);
}

/** Sinusoidal weave added perpendicular to the current heading (gyro-scout style). */
export function weave(e, amp, freq, phase = 0) {
  return Math.sin(e.t * freq * TAU + phase) * amp;
}
