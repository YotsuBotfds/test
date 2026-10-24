// Weather systems (WP6), all in screen space (CSS px). One system per biome weather kind:
//   gulls  — Brassbay: gull flocks, breeze streaks, dawn light shafts
//   soot   — Smog: soot specks & ash flakes, yellow haze, drifting smog banks
//   storm  — Tempest: slanted rain, wind gusts with visible streaks (drives Weather.wind),
//            ambient lightning (sheet flashes & distant bolts)
//   snow   — Aurora: layered snowfall, aurora ribbons, twinkling stars
//   embers — Furnace: rising embers, falling ash, pulsing heat vignette
// Each system has `update(dt, env)` and `draw(ctx, env, weight)`; `weight` (0..1) is the
// crossfade amount. Particles are plain arrays allocated once (no per-frame allocation) and
// are shifted by the camera's screen motion × a depth factor so they feel in-world.

import { RNG } from '../core/rng.js';
import { softDot, cachedSprite, rgba, makeCanvas } from './bg-util.js';

const TAU = Math.PI * 2;
const r = new RNG(0x5eed);

const wrap = (v, max, pad) =>
  v < -pad ? v + max + pad * 2 : v > max + pad ? v - max - pad * 2 : v;

/** @typedef {{W:number, H:number, t:number, dx:number, dy:number, intensity:number, q:number,
 *   zoom:number, mild:boolean, host:any}} Env */

// =============================================================================================
// Brassbay — gulls, breeze, light shafts

const GULL_FRAMES = 8;
function gullSprite(frame) {
  return cachedSprite(`gull|${frame}`, 40, 24, (ctx) => {
    const ph = (frame / GULL_FRAMES) * TAU;
    const span = 0.55 + 0.45 * Math.cos(ph); // wings fold on the downstroke
    const sweep = Math.sin(ph) * 3;
    ctx.translate(20, 12);
    ctx.lineJoin = 'round';
    const wing = (s) => {
      ctx.beginPath();
      ctx.moveTo(2, 0);
      ctx.quadraticCurveTo(0 + sweep, s * 9 * span, -4 + sweep * 1.4, s * 17 * span);
      ctx.quadraticCurveTo(-5 + sweep, s * 8 * span, -5, s * 1.5);
      ctx.closePath();
    };
    for (const s of [-1, 1]) {
      wing(s);
      ctx.fillStyle = '#e8eaee';
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,40,48,0.55)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      // Dark wingtips.
      ctx.fillStyle = '#2e2f36';
      ctx.beginPath();
      ctx.arc(-4 + sweep * 1.4, s * 16 * span, 1.6, 0, TAU);
      ctx.fill();
    }
    // Body, head & beak.
    ctx.fillStyle = '#fbfbf8';
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 2.4, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,40,48,0.5)';
    ctx.stroke();
    ctx.fillStyle = '#f0b43a';
    ctx.fillRect(6.6, -0.5, 2.4, 1);
    ctx.fillStyle = '#b8bcc6';
    ctx.beginPath();
    ctx.moveTo(-6, -1.6);
    ctx.lineTo(-10, 0);
    ctx.lineTo(-6, 1.6);
    ctx.fill();
  });
}

class Gulls {
  constructor() {
    this.flocks = [];
    this.timer = 1.5;
    this.streaks = Array.from({ length: 10 }, () => ({
      x: 0,
      y: 0,
      life: 0,
      max: 1,
      len: 0,
      a: 0,
    }));
  }
  update(dt, env, w) {
    this.timer -= dt;
    if (this.timer <= 0 && w > 0.3 && this.flocks.length < 3) {
      this.timer = r.range(5, 11) / Math.max(0.4, env.intensity);
      this.spawn(env);
    }
    for (let i = this.flocks.length - 1; i >= 0; i--) {
      const f = this.flocks[i];
      f.t += dt;
      f.x += (Math.cos(f.ang) * f.speed + Math.sin(f.t * 0.7) * 6) * dt - env.dx * 0.85;
      f.y += (Math.sin(f.ang) * f.speed + Math.cos(f.t * 0.5) * 5) * dt - env.dy * 0.85;
      f.ang += Math.sin(f.t * 0.3 + f.seed) * 0.06 * dt;
      const m = 400;
      if (f.x < -m || f.y < -m || f.x > env.W + m || f.y > env.H + m) this.flocks.splice(i, 1);
    }
    for (const s of this.streaks) {
      s.life -= dt;
      if (s.life <= 0 && r.next() < dt * 0.8 * env.intensity) {
        s.max = s.life = r.range(1.6, 3);
        s.x = r.range(-100, env.W);
        s.y = r.range(0, env.H);
        s.len = r.range(60, 160);
      }
      s.x += 70 * dt - env.dx;
      s.y += -18 * dt - env.dy;
    }
  }
  spawn(env) {
    // Enter from a random edge, heading roughly across the screen.
    const edge = r.int(0, 3);
    const W = env.W;
    const H = env.H;
    const x = edge === 0 ? -80 : edge === 1 ? W + 80 : r.range(0, W);
    const y = edge === 2 ? -80 : edge === 3 ? H + 80 : r.range(0, H);
    const ang = Math.atan2(
      H / 2 - y + r.range(-H * 0.3, H * 0.3),
      W / 2 - x + r.range(-W * 0.3, W * 0.3)
    );
    const n = r.int(3, 9);
    const birds = [];
    const v = r.next() < 0.6;
    for (let i = 0; i < n; i++) {
      const rank = Math.ceil(i / 2);
      const side = i % 2 ? 1 : -1;
      birds.push(
        v
          ? {
              bx: -rank * 16 + r.range(-3, 3),
              by: side * rank * 13 + r.range(-3, 3),
              ph: r.next() * GULL_FRAMES,
              rate: r.range(7, 10),
              s: r.range(0.75, 1),
            }
          : {
              bx: r.range(-50, 50),
              by: r.range(-40, 40),
              ph: r.next() * GULL_FRAMES,
              rate: r.range(6, 11),
              s: r.range(0.7, 1),
            }
      );
    }
    this.flocks.push({ x, y, ang, speed: r.range(55, 85), birds, t: 0, seed: r.next() * 10 });
  }
  draw(ctx, env, w) {
    // Dawn light shafts from the top-left.
    const ray = cachedSprite('ray', 64, 512, (c) => {
      const g = c.createLinearGradient(0, 0, 64, 0);
      g.addColorStop(0, 'rgba(255,230,180,0)');
      g.addColorStop(0.5, 'rgba(255,230,180,1)');
      g.addColorStop(1, 'rgba(255,230,180,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 512);
      c.globalCompositeOperation = 'destination-in';
      const v = c.createLinearGradient(0, 0, 0, 512);
      v.addColorStop(0, 'rgba(0,0,0,1)');
      v.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = v;
      c.fillRect(0, 0, 64, 512);
    });
    ctx.globalCompositeOperation = 'lighter';
    const L = Math.hypot(env.W, env.H) * 1.1;
    // Faint (≈4% alpha) but they cover more than a screen of rotated additive fill, which
    // software rasterizers pay ~5 ms for: high tier only.
    const rays = env.q >= 1 ? 4 : 0;
    for (let i = 0; i < rays; i++) {
      const a = 0.045 * w * (0.6 + 0.4 * Math.sin(env.t * 0.21 + i * 1.9));
      if (a <= 0.003) continue;
      ctx.globalAlpha = a;
      ctx.save();
      ctx.translate(-40 + i * env.W * 0.16, -60);
      ctx.rotate(-0.62 + i * 0.05);
      ctx.drawImage(ray, -30 - i * 20, 0, 70 + i * 50, L);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
    // Breeze streaks.
    ctx.strokeStyle = '#fff6e6';
    ctx.lineWidth = 1.2;
    for (const s of this.streaks) {
      if (s.life <= 0) continue;
      const u = 1 - s.life / s.max;
      ctx.globalAlpha = Math.sin(u * Math.PI) * 0.16 * w;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.quadraticCurveTo(
        s.x + s.len * 0.5,
        s.y - 6,
        s.x + s.len,
        s.y + Math.sin(env.t + s.x) * 3
      );
      ctx.stroke();
    }
    // Gulls with soft shadows far below.
    for (const f of this.flocks) {
      const c = Math.cos(f.ang);
      const s = Math.sin(f.ang);
      for (const b of f.birds) {
        const x = f.x + b.bx * c - b.by * s;
        const y = f.y + b.bx * s + b.by * c;
        const fr = Math.floor(b.ph + f.t * b.rate) % GULL_FRAMES;
        const img = gullSprite(fr);
        const k = b.s * Math.min(1.3, Math.max(0.8, env.zoom));
        ctx.globalAlpha = 0.16 * w;
        ctx.setTransform(
          c * k * env.dpr,
          s * k * env.dpr,
          -s * k * env.dpr,
          c * k * env.dpr,
          (x + 18) * env.dpr,
          (y + 24) * env.dpr
        );
        ctx.drawImage(softDot(32, '#2b1d10'), -10, -6, 20, 12);
        ctx.globalAlpha = 0.92 * w;
        ctx.setTransform(
          c * k * env.dpr,
          s * k * env.dpr,
          -s * k * env.dpr,
          c * k * env.dpr,
          x * env.dpr,
          y * env.dpr
        );
        ctx.drawImage(img, -20, -12);
      }
    }
    ctx.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
    ctx.globalAlpha = 1;
  }
}

// =============================================================================================
// Smog — soot motes, ash flakes, yellow haze, smog banks

class Soot {
  constructor() {
    this.p = Array.from({ length: 170 }, () => ({
      x: r.range(0, 1600),
      y: r.range(0, 1000),
      z: r.range(0.4, 1.6),
      rot: r.angle(),
      vr: r.range(-2, 2),
      size: r.range(1, 3),
      flake: r.next() < 0.3,
      ph: r.angle(),
    }));
    this.banks = Array.from({ length: 4 }, (_, i) => ({
      x: r.range(0, 1400),
      y: r.range(0, 900),
      s: r.range(0.8, 1.4),
      i,
    }));
  }
  update(dt, env) {
    const W = env.W;
    const H = env.H;
    for (const p of this.p) {
      p.x += (22 + Math.sin(env.t * 0.7 + p.ph) * 14) * p.z * dt - env.dx * p.z;
      p.y += (9 + Math.cos(env.t * 0.9 + p.ph * 2) * 10) * p.z * dt - env.dy * p.z;
      p.rot += p.vr * dt;
      p.x = wrap(p.x, W, 20);
      p.y = wrap(p.y, H, 20);
    }
    for (const b of this.banks) {
      b.x += 12 * dt - env.dx * 1.15;
      b.y += 4 * dt - env.dy * 1.15;
      b.x = wrap(b.x, W, 500);
      b.y = wrap(b.y, H, 400);
    }
  }
  draw(ctx, env, w) {
    const W = env.W;
    const H = env.H;
    // Yellow haze.
    const pulse = 0.85 + 0.15 * Math.sin(env.t * 0.25);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgba('#c8ae5a', 0.14 * pulse));
    g.addColorStop(1, rgba('#7c6a2c', 0.2 * pulse));
    ctx.globalAlpha = w * env.intensity;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Drifting smog banks.
    const bank = softDot(256, '#9a8650', [
      [0, 0.8],
      [0.5, 0.4],
      [1, 0],
    ]);
    for (const b of this.banks) {
      const s = 520 * b.s;
      ctx.globalAlpha = 0.16 * w * env.intensity;
      ctx.drawImage(bank, b.x - s / 2, b.y - s * 0.3, s, s * 0.6);
    }
    // Soot specks & tumbling ash flakes.
    const speck = softDot(16, '#1c160c', [
      [0, 1],
      [0.5, 0.7],
      [1, 0],
    ]);
    const n = Math.floor(this.p.length * env.q * Math.min(1.5, env.intensity));
    ctx.fillStyle = '#2a2216';
    for (let i = 0; i < n && i < this.p.length; i++) {
      const p = this.p[i];
      const a = (0.35 + p.z * 0.35) * w;
      if (p.flake) {
        const c = Math.cos(p.rot) * p.z;
        const s = Math.sin(p.rot) * p.z;
        ctx.globalAlpha = a;
        ctx.setTransform(
          c * env.dpr,
          s * env.dpr,
          -s * 0.5 * env.dpr,
          c * 0.5 * env.dpr,
          p.x * env.dpr,
          p.y * env.dpr
        );
        ctx.fillRect(-p.size * 1.4, -p.size, p.size * 2.8, p.size * 2);
      } else {
        const sz = p.size * p.z * 1.8;
        ctx.globalAlpha = a * 0.8;
        ctx.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
        ctx.drawImage(speck, p.x - sz, p.y - sz, sz * 2, sz * 2);
      }
    }
    ctx.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
    ctx.globalAlpha = 1;
  }
}

// =============================================================================================
// Tempest — rain, gusts (wind), ambient lightning

class Storm {
  constructor() {
    this.drops = Array.from({ length: 420 }, () => ({
      x: r.range(0, 1600),
      y: r.range(0, 1000),
      z: r.range(0.5, 1.5),
      len: r.range(0.7, 1.3),
    }));
    this.streaks = Array.from({ length: 26 }, () => ({
      x: 0,
      y: 0,
      life: 0,
      max: 1,
      len: 0,
      wob: 0,
    }));
    this.gustT = r.range(4, 8); // until next gust
    this.gust = null; // {t, dur, ang, str}
    this.windX = 0;
    this.windY = 0;
    this.env = 0; // gust envelope 0..1
    this.ambientT = r.range(2.5, 6);
    this.sheet = []; // sheet-lightning glows
  }
  update(dt, env, w, host) {
    // Gust state machine.
    if (this.gust) {
      const gst = this.gust;
      gst.t += dt;
      const u = gst.t / gst.dur;
      this.env = u >= 1 ? 0 : Math.sin(Math.PI * u) ** 0.7;
      this.windX = Math.cos(gst.ang) * gst.str * this.env;
      this.windY = Math.sin(gst.ang) * gst.str * this.env;
      if (u >= 1) {
        this.gust = null;
        this.gustT = r.range(6, 13);
      }
    } else {
      this.env = 0;
      this.windX = 0;
      this.windY = 0;
      this.gustT -= dt;
      if (this.gustT <= 0 && w > 0.5) {
        this.gust = {
          t: 0,
          dur: r.range(2.8, 4.6),
          ang: -0.42 + Math.PI + r.range(-0.9, 0.9),
          str: 120,
        };
        if (r.next() < 0.5) this.gust.ang -= Math.PI;
      }
    }
    // Rain falls along a slant that leans into the gust.
    const sx = 0.32 + this.windX / 260;
    const sy = 1 + this.windY / 400;
    for (const d of this.drops) {
      const sp = 1050 * d.z;
      d.x += sx * sp * dt - env.dx * d.z * 1.1;
      d.y += sy * sp * dt - env.dy * d.z * 1.1;
      if (d.y > env.H + 40) {
        d.y -= env.H + 80;
        d.x = r.range(-200, env.W + 100);
      } else if (d.y < -40) d.y += env.H + 80;
      if (d.x > env.W + 220) d.x -= env.W + 440;
      else if (d.x < -220) d.x += env.W + 440;
    }
    // Gust streaks.
    for (const s of this.streaks) {
      s.life -= dt;
      if (s.life <= 0 && this.gust && r.next() < dt * 14 * this.env) {
        s.max = s.life = r.range(0.35, 0.7);
        const back = Math.cos(this.gust.ang) > 0 ? -150 : env.W + 150;
        s.x = r.next() < 0.5 ? back : r.range(0, env.W);
        s.y = r.range(-50, env.H + 50);
        s.len = r.range(90, 240);
        s.wob = r.range(-10, 10);
      }
      if (s.life > 0 && this.gust) {
        s.x += Math.cos(this.gust.ang) * 900 * dt - env.dx;
        s.y += Math.sin(this.gust.ang) * 900 * dt - env.dy;
      }
    }
    // Ambient lightning: sheet glows inside the clouds, or a distant bolt.
    this.ambientT -= dt;
    if (this.ambientT <= 0 && w > 0.5) {
      this.ambientT = r.range(4, 11) / Math.max(0.5, env.intensity);
      if (r.next() < 0.55) {
        this.sheet.push({
          x: r.range(0.1, 0.9) * env.W,
          y: r.range(0.05, 0.7) * env.H,
          t: 0,
          s: r.range(0.8, 1.6),
        });
        host.flash = Math.max(host.flash, env.mild ? 0.08 : 0.28);
        host._thunder(r.range(0.6, 2.2), 0.35);
      } else {
        const x = r.range(0.05, 0.95) * env.W;
        const y = r.range(0.35, 0.95) * env.H;
        host._screenBolt(x, y, { flash: 0.4, width: 0.6, vol: 0.55, delay: r.range(0.3, 1.4) });
      }
    }
    for (let i = this.sheet.length - 1; i >= 0; i--) {
      this.sheet[i].t += dt;
      if (this.sheet[i].t > 0.6) this.sheet.splice(i, 1);
    }
  }
  draw(ctx, env, w) {
    const W = env.W;
    const H = env.H;
    // Storm mist.
    ctx.globalAlpha = 0.07 * w;
    ctx.fillStyle = '#9fb4cc';
    ctx.fillRect(0, 0, W, H);
    // Sheet lightning: soft glows that flicker inside the cloud deck.
    if (this.sheet.length) {
      const glow = softDot(256, '#bcd4ff', [
        [0, 0.9],
        [0.4, 0.35],
        [1, 0],
      ]);
      ctx.globalCompositeOperation = 'lighter';
      for (const s of this.sheet) {
        const u = s.t / 0.6;
        const fl = env.mild ? 1 - u : (1 - u) * (u < 0.15 || (u > 0.3 && u < 0.4) ? 1 : 0.45);
        ctx.globalAlpha = fl * 0.55 * w;
        const R = 260 * s.s;
        ctx.drawImage(glow, s.x - R, s.y - R * 0.7, R * 2, R * 1.4);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // Rain: two depth batches in single paths.
    const sx = 0.32 + this.windX / 260;
    const sy = 1 + this.windY / 400;
    const sl = Math.hypot(sx, sy);
    const ux = sx / sl;
    const uy = sy / sl;
    const n = Math.floor(this.drops.length * env.q * Math.min(1.6, env.intensity));
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (let i = 0; i < n && i < this.drops.length; i++) {
        const d = this.drops[i];
        if (d.z > 1 !== (pass === 1)) continue;
        const L = (16 + 20 * d.z) * d.len * (1 + this.env * 0.6);
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - ux * L, d.y - uy * L);
      }
      ctx.globalAlpha = (pass ? 0.34 : 0.2) * w;
      ctx.strokeStyle = pass ? '#d6e4f4' : '#aac0d8';
      ctx.lineWidth = pass ? 1.3 : 0.9;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    // Gust streaks.
    if (this.gust) {
      const c = Math.cos(this.gust.ang);
      const s = Math.sin(this.gust.ang);
      ctx.strokeStyle = '#eef4fb';
      ctx.lineWidth = 1.4;
      for (const st of this.streaks) {
        if (st.life <= 0) continue;
        const u = 1 - st.life / st.max;
        ctx.globalAlpha = Math.sin(u * Math.PI) * 0.38 * w * this.env;
        ctx.beginPath();
        ctx.moveTo(st.x, st.y);
        ctx.quadraticCurveTo(
          st.x - c * st.len * 0.5 - s * st.wob,
          st.y - s * st.len * 0.5 + c * st.wob,
          st.x - c * st.len,
          st.y - s * st.len
        );
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
}

// =============================================================================================
// Aurora — snow, aurora ribbons, stars

function ribbonStrip(hue) {
  // Small: it is drawn into the quarter-resolution ribbon buffer (~50 px per slice).
  const SW = 16;
  const SH = 64;
  return cachedSprite(`ribbon|${hue}|${SW}`, SW, SH, (c) => {
    const g = c.createLinearGradient(0, 0, 0, SH);
    const [top, mid, low] =
      hue === 0 ? ['#b06cff', '#4dffb0', '#c8ffe8'] : ['#ff6cc8', '#6c9cff', '#d8e8ff'];
    g.addColorStop(0, rgba(top, 0));
    g.addColorStop(0.45, rgba(top, 0.3));
    g.addColorStop(0.8, rgba(mid, 0.85));
    g.addColorStop(0.94, rgba(low, 1));
    g.addColorStop(1, rgba(low, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, SW, SH);
    // Feather the sides so neighbouring slices melt into one curtain.
    c.globalCompositeOperation = 'destination-in';
    const h = c.createLinearGradient(0, 0, SW, 0);
    h.addColorStop(0, 'rgba(0,0,0,0)');
    h.addColorStop(0.5, 'rgba(0,0,0,1)');
    h.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = h;
    c.fillRect(0, 0, SW, SH);
  });
}

class Snow {
  constructor() {
    this.flakes = Array.from({ length: 260 }, () => ({
      x: r.range(0, 1600),
      y: r.range(0, 1000),
      z: r.range(0.35, 1.7),
      ph: r.angle(),
      s: r.range(0.7, 1.2),
    }));
    this.stars = Array.from({ length: 110 }, () => ({
      x: r.range(0, 2048),
      y: r.range(0, 2048),
      ph: r.angle(),
      rate: r.range(0.8, 2.6),
      s: r.range(0.5, 1.2),
    }));
    this.camX = 0;
    this.camY = 0;
    this.ribbons = [
      { y: 0.2, amp: 46, f: 0.11, sp: 0.35, ph: 0, hue: 0, h: 180 },
      { y: 0.36, amp: 60, f: 0.08, sp: -0.22, ph: 2, hue: 1, h: 140 },
    ];
  }
  update(dt, env) {
    this.camX += env.dx;
    this.camY += env.dy;
    for (const f of this.flakes) {
      f.x += (14 + Math.sin(env.t * 0.8 + f.ph) * 16) * f.z * dt - env.dx * f.z;
      f.y += 30 * f.z * dt - env.dy * f.z;
      f.x = wrap(f.x, env.W, 10);
      f.y = wrap(f.y, env.H, 10);
    }
  }
  draw(ctx, env, w) {
    const W = env.W;
    const H = env.H;
    // Stars / ice sparkles (very slow parallax: they're "far").
    const star = cachedSprite('star', 16, 16, (c) => {
      const g = c.createRadialGradient(8, 8, 0, 8, 8, 8);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.3, 'rgba(210,225,255,0.4)');
      g.addColorStop(1, 'rgba(200,220,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 16, 16);
      c.fillStyle = 'rgba(255,255,255,0.8)';
      c.fillRect(7.5, 1, 1, 14);
      c.fillRect(1, 7.5, 14, 1);
    });
    ctx.globalCompositeOperation = 'lighter';
    const ox = -this.camX * 0.12;
    const oy = -this.camY * 0.12;
    for (const s of this.stars) {
      const x = ((((s.x + ox) % 2048) + 2048) % 2048) * (W / 2048) * 1.0;
      const y = ((((s.y + oy) % 2048) + 2048) % 2048) * (H / 2048) * 1.0;
      const tw = Math.sin(env.t * s.rate + s.ph);
      const a = (0.15 + 0.55 * Math.max(0, tw) ** 3) * w;
      const sz = 5 * s.s * (0.7 + 0.5 * Math.max(0, tw));
      ctx.globalAlpha = a;
      ctx.drawImage(star, x - sz, y - sz, sz * 2, sz * 2);
    }
    // Aurora ribbons: curtains of vertical light slices along a slow wave. The slices are soft
    // and overlap heavily (~2.5 screens of additive fill at full res), so they are accumulated
    // into a quarter-resolution buffer covering just the ribbon band and blitted once.
    const slices = env.q < 1 ? 28 : 48;
    const span = W + 240;
    const dxs = span / slices;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const rb of this.ribbons) {
      const by = rb.y * H - this.camY * 0.05;
      y0 = Math.min(y0, by - rb.amp * 1.3 - rb.h * 1.1);
      y1 = Math.max(y1, by + rb.amp * 1.3);
    }
    y0 = Math.max(0, Math.floor(y0));
    y1 = Math.min(H, Math.ceil(y1));
    if (y1 > y0 && w > 0.005) {
      const RS = 0.25;
      const bw = Math.max(1, Math.ceil(W * RS));
      const bh = Math.max(1, Math.ceil((y1 - y0) * RS));
      if (!this.buf) this.buf = makeCanvas(bw, bh);
      const buf = this.buf;
      if (buf.width < bw || buf.height < bh) {
        buf.width = Math.max(buf.width, bw);
        buf.height = Math.max(buf.height, bh);
      }
      const bc = buf.getContext('2d');
      bc.setTransform(1, 0, 0, 1, 0, 0);
      bc.globalAlpha = 1;
      bc.globalCompositeOperation = 'source-over';
      bc.clearRect(0, 0, bw + 1, bh + 1);
      bc.setTransform(RS, 0, 0, RS, 0, -y0 * RS);
      bc.globalCompositeOperation = 'lighter';
      for (const rb of this.ribbons) {
        const img = ribbonStrip(rb.hue);
        const by = rb.y * H - this.camY * 0.05;
        for (let k = 0; k <= slices; k++) {
          const u = k * rb.f * (36 / slices);
          const x = -120 + k * dxs - ((this.camX * 0.05) % dxs);
          const y =
            by +
            Math.sin(u + env.t * rb.sp + rb.ph) * rb.amp +
            Math.sin(u * 2.3 - env.t * 0.5) * rb.amp * 0.3;
          const shimmer = 0.55 + 0.45 * Math.sin(env.t * 2.2 + k * 0.9 * (36 / slices) + rb.ph);
          const h = rb.h * (0.75 + 0.35 * Math.sin(u * 1.7 + env.t * 0.4));
          bc.globalAlpha = 0.11 * shimmer * (36 / slices);
          bc.drawImage(img, x - dxs * 1.5, y - h, dxs * 4, h);
        }
      }
      ctx.globalAlpha = Math.min(1, w);
      // Additive is ~2x the cost of a plain blit on software rasterizers; the reduced tiers
      // composite the (already luminous) buffer normally.
      ctx.globalCompositeOperation = env.q < 1 ? 'source-over' : 'lighter';
      ctx.drawImage(buf, 0, 0, bw, bh, 0, y0, bw / RS, bh / RS);
    }
    ctx.globalCompositeOperation = 'source-over';
    // Snowflakes.
    const flake = softDot(16, '#f4f8ff', [
      [0, 1],
      [0.45, 0.75],
      [1, 0],
    ]);
    const n = Math.floor(this.flakes.length * env.q * Math.min(1.5, env.intensity));
    for (let i = 0; i < n && i < this.flakes.length; i++) {
      const f = this.flakes[i];
      const sz = (1.1 + f.z * 1.6) * f.s;
      ctx.globalAlpha = (0.35 + f.z * 0.35) * w;
      ctx.drawImage(flake, f.x - sz, f.y - sz, sz * 2, sz * 2);
    }
    ctx.globalAlpha = 1;
  }
}

// =============================================================================================
// Furnace — embers, ash, heat

class Embers {
  constructor() {
    this.p = Array.from({ length: 180 }, () => this.reset({}, 1600, 1000, true));
    this.ash = Array.from({ length: 50 }, () => ({
      x: r.range(0, 1600),
      y: r.range(0, 1000),
      z: r.range(0.5, 1.4),
      rot: r.angle(),
      ph: r.angle(),
    }));
  }
  reset(p, W, H, any) {
    p.x = r.range(-40, W + 40);
    p.y = any ? r.range(0, H) : H + r.range(10, 80);
    p.z = r.range(0.4, 1.7);
    p.vy = -r.range(30, 85);
    p.ph = r.angle();
    p.life = p.max = r.range(2.5, 6);
    p.hot = r.next();
    return p;
  }
  update(dt, env) {
    for (const p of this.p) {
      p.life -= dt;
      p.x += (Math.sin(env.t * 1.3 + p.ph) * 24 + 10) * p.z * dt - env.dx * p.z;
      p.y += p.vy * p.z * dt - env.dy * p.z;
      if (p.life <= 0 || p.y < -30) this.reset(p, env.W, env.H, p.life <= 0);
      p.x = wrap(p.x, env.W, 40);
    }
    for (const a of this.ash) {
      a.x += (8 + Math.sin(env.t + a.ph) * 10) * a.z * dt - env.dx * a.z;
      a.y += 18 * a.z * dt - env.dy * a.z;
      a.rot += dt * 1.5;
      a.x = wrap(a.x, env.W, 20);
      a.y = wrap(a.y, env.H, 20);
    }
  }
  draw(ctx, env, w) {
    const W = env.W;
    const H = env.H;
    // Heat vignette: pulsing red-orange edges.
    const pulse = 0.8 + 0.2 * Math.sin(env.t * 1.6) + 0.06 * Math.sin(env.t * 5.3);
    const vig = cachedSprite('heatvig', 256, 256, (c) => {
      const g = c.createRadialGradient(128, 128, 70, 128, 128, 182);
      g.addColorStop(0, 'rgba(255,70,20,0)');
      g.addColorStop(0.6, 'rgba(255,70,20,0.25)');
      g.addColorStop(1, 'rgba(255,90,30,1)');
      c.fillStyle = g;
      c.fillRect(0, 0, 256, 256);
    });
    // A full-screen stretched additive blit is the single most expensive thing a software
    // rasterizer does (~9 ms at 720p): the low tier relies on the biome's own red vignette in
    // the backdrop overlay, medium composites it normally (about half the cost), and high
    // copies a canvas-resolution bake 1:1 (only the alpha pulses), ~5x cheaper than stretching.
    if (env.q >= 0.6) {
      ctx.globalCompositeOperation = env.q < 1 ? 'source-over' : 'lighter';
      ctx.globalAlpha = (env.q < 1 ? 0.14 : 0.2) * pulse * w * Math.min(1.4, env.intensity);
      if (env.q >= 1) {
        const dw = Math.round(W * env.dpr);
        const dh = Math.round(H * env.dpr);
        let cv = this._vig;
        if (!cv || cv.width !== dw || cv.height !== dh) {
          cv = this._vig = makeCanvas(dw, dh);
          cv.getContext('2d').drawImage(vig, 0, 0, dw, dh);
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(cv, 0, 0);
        ctx.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
      } else {
        this._vig = null;
        ctx.drawImage(vig, 0, 0, W, H);
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    // Embers.
    const hot = softDot(32, '#ffcf6a', [
      [0, 1],
      [0.2, 0.9],
      [0.5, 0.25],
      [1, 0],
    ]);
    const warm = softDot(32, '#ff6a20', [
      [0, 1],
      [0.25, 0.7],
      [1, 0],
    ]);
    const n = Math.floor(this.p.length * env.q * Math.min(1.6, env.intensity));
    for (let i = 0; i < n && i < this.p.length; i++) {
      const p = this.p[i];
      const u = p.life / p.max;
      const fade = Math.min(1, u * 4) * Math.min(1, (1 - u) * 6);
      const flick = 0.7 + 0.3 * Math.sin(env.t * 11 + p.ph * 7);
      const sz = (1.2 + p.z * 2.2) * (p.z > 1.45 ? 2.2 : 1);
      ctx.globalAlpha = fade * flick * w * (p.z > 1.45 ? 0.35 : 0.85);
      ctx.drawImage(p.hot > 0.5 ? hot : warm, p.x - sz * 2, p.y - sz * 2, sz * 4, sz * 4);
    }
    ctx.globalCompositeOperation = 'source-over';
    // Falling ash: tumbling flakes (5×4 rects squashed to 40% on their minor axis), all in
    // one path and one fill instead of a transform + fillRect each.
    ctx.fillStyle = '#2a201c';
    ctx.globalAlpha = 0.5 * w;
    ctx.beginPath();
    for (const a of this.ash) {
      const c = Math.cos(a.rot) * a.z;
      const s = Math.sin(a.rot) * a.z;
      // Corners (±2.5, ±2) through [c, s, -0.4s, 0.4c]: half-extent vectors u (x) and v (y).
      const ux = c * 2.5;
      const uy = s * 2.5;
      const vx = -s * 0.8;
      const vy = c * 0.8;
      ctx.moveTo(a.x - ux - vx, a.y - uy - vy);
      ctx.lineTo(a.x + ux - vx, a.y + uy - vy);
      ctx.lineTo(a.x + ux + vx, a.y + uy + vy);
      ctx.lineTo(a.x - ux + vx, a.y - uy + vy);
      ctx.closePath();
    }
    ctx.fill();
    ctx.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
    ctx.globalAlpha = 1;
  }
}

/** Factory: weather kind → system instance. */
export function makeSystem(kind) {
  switch (kind) {
    case 'gulls':
      return new Gulls();
    case 'soot':
      return new Soot();
    case 'storm':
      return new Storm();
    case 'snow':
      return new Snow();
    case 'embers':
      return new Embers();
    default:
      return null;
  }
}
