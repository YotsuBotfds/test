// WP3 FX preview: fires every effect in a labelled loop using the real Renderer + Particles + FX.
//
// Query flags:
//   ?effect=<name>   loop a single effect          ?grid=1   all effects at once in a labelled grid
//   ?stress=1        hold ~4000 particles (FPS)     ?at=<s>   simulate to t=s with fixed steps,
//   ?own=1           force WP3's own textures                  then freeze (deterministic screenshots)
//   ?low=1           quality 'low'                  ?noflash=1  reduced flashing
//   ?zoom=<n>        camera zoom multiplier         ?bg=dark|sky   ?ui=0 hide buttons
//   ?count=<n>       stress target particle count
import { Renderer } from '../../js/gfx/renderer.js';
import { Particles, FX } from '../../js/gfx/particles.js';
import { setPreferOwnTextures, texStats } from '../../js/gfx/fx-textures.js';
import { Sprites } from '../../js/gfx/sprites.js';
import { Save } from '../../js/core/storage.js';

// Art is optional: other work packages may be mid-edit, and the FX must work without fx_* sprites.
try {
  await import('../../js/gfx/art/index.js');
} catch (err) {
  console.warn('[test] art modules failed to load; using WP3 fallback textures', err?.message);
}

const q = new URLSearchParams(location.search);
const flag = (k) => q.has(k) && q.get(k) !== '0';

if (flag('own')) setPreferOwnTextures(true);
Save.settings.quality = flag('low') ? 'low' : 'high';
Save.settings.flashes = !flag('noflash');

const canvas = document.getElementById('c');
const renderer = new Renderer(canvas);
renderer.camera.zoomMul = Number(q.get('zoom') || 1);
renderer.updateZoom();
const particles = new Particles(5000);
const fx = new FX(particles);
const tPre = performance.now();
fx.prewarm();
console.log(`[test] fx.prewarm ${(performance.now() - tPre).toFixed(1)} ms`);

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);

// --- demo catalogue ---------------------------------------------------------------------------
// fire(x, y) fires once; tick(x, y, t, dt) runs every frame while the item is active.
const DEMOS = [
  { name: 'explosion', fire: (x, y) => fx.explosion(x, y, 1) },
  { name: 'explosion size 2.5', fire: (x, y) => fx.explosion(x, y, 2.5, { cogs: 3 }) },
  { name: 'enemy explosion', fire: (x, y) => fx.explosion(x, y, 1.6, { palette: 'enemy', debris: 'syndicate' }) },
  { name: 'aetherBurst', fire: (x, y) => fx.aetherBurst(x, y, 1.4) },
  { name: 'plasma explosion', fire: (x, y) => fx.explosion(x, y, 1.2, { palette: 'plasma' }) },
  { name: 'bigExplosion', fire: (x, y) => fx.bigExplosion(x, y, 1.6), period: 3 },
  { name: 'blast r170 (bomb)', fire: (x, y) => fx.blast(x, y, 170), period: 2.6 },
  { name: 'impact', fire: (x, y) => fx.impact(x, y, 1) },
  {
    name: 'muzzle',
    fire: () => {},
    tick: (x, y, t, dt, st) => {
      st.cd = (st.cd ?? 0) - dt;
      if (st.cd <= 0) {
        st.cd = 0.22;
        st.a = (st.a ?? 0) + 0.6;
        fx.muzzle(x + Math.cos(st.a) * 20, y + Math.sin(st.a) * 20, st.a, 1);
      }
    },
  },
  { name: 'sparks', fire: (x, y) => fx.sparks(x, y, -Math.PI / 2, 18, '#ffd36b', 1.2) },
  {
    name: 'hitSpark (+crit)',
    fire: () => {},
    tick: (x, y, t, dt, st) => {
      st.cd = (st.cd ?? 0) - dt;
      if (st.cd <= 0) {
        st.cd = 0.18;
        st.n = (st.n ?? 0) + 1;
        const crit = st.n % 4 === 0;
        fx.hitSpark(x + rnd(-20, 20), y + rnd(-20, 20), rnd(0, TAU), crit);
        fx.text(x + rnd(-20, 20), y - 20, crit ? 38 : 14, { crit, size: crit ? 22 : 14 });
      }
    },
  },
  { name: 'smoke', fire: (x, y) => fx.smoke(x, y, 1.5, { count: 8 }) },
  {
    name: 'smokeTrail (damaged ship)',
    fire: () => {},
    tick: (x, y, t, dt, st) => {
      const a = t * 1.6;
      const px = x + Math.cos(a) * 90;
      const py = y + Math.sin(a) * 50;
      st.p = { x: px, y: py, a: a + Math.PI / 2 };
      fx.smokeTrail(px, py, 1, { fire: true });
    },
    draw: (ctx, st) => st.p && drawShip(ctx, st.p.x, st.p.y, st.p.a),
  },
  { name: 'steam', fire: (x, y) => { for (let i = 0; i < 4; i++) fx.steam(x, y, (i / 4) * TAU, 1.2); } },
  { name: 'steamBurst (boost)', fire: (x, y) => fx.steamBurst(x, y, 1.3) },
  { name: 'burn', fire: () => {}, tick: (x, y) => fx.burn(x, y, 1.6) },
  { name: 'debris mixed', fire: (x, y) => fx.debris(x, y, 14, 'mixed') },
  { name: 'debris wood / metal', fire: (x, y) => { fx.debris(x - 40, y, 8, 'wood'); fx.debris(x + 40, y, 8, 'metal'); } },
  { name: 'cogs', fire: (x, y) => fx.cogs(x, y, 9) },
  { name: 'embers', fire: (x, y) => fx.embers(x, y, 24) },
  { name: 'shockwave', fire: (x, y) => fx.shockwave(x, y, 160) },
  { name: 'ring', fire: (x, y) => { fx.ring(x, y, 80, '#ffcf4a', 0.5); fx.ring(x, y, 50, '#7ff3ff', 0.4); } },
  {
    name: 'lightning (tesla chain)',
    fire: (x, y) => {
      const pts = [[x - 170, y + 40], [x - 60, y - 50], [x + 50, y + 30], [x + 160, y - 40]];
      for (let i = 0; i < pts.length - 1; i++) {
        fx.lightning(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], { life: 0.35, branches: 2 });
      }
    },
    period: 0.7,
  },
  { name: 'beam (aether lance)', fire: (x, y) => fx.beam(x - 180, y + 30, x + 180, y - 30, 7, '#7ff3ff', 0.3), period: 0.6 },
  { name: 'chain (harpoon)', fire: (x, y) => fx.chain(x - 150, y + 20, x + 150, y - 20, { life: 0.8 }), period: 1 },
  { name: 'flare', fire: (x, y) => fx.flare(x, y, 120, '#fff3c4'), period: 0.6 },
  { name: 'sparkle / pickup', fire: (x, y) => { fx.sparkle(x - 50, y, '#4fe3d0', 8, 20); fx.pickup(x + 50, y, '#ffcf4a'); } },
  { name: 'heal', fire: (x, y) => fx.heal(x, y, 1.2) },
  { name: 'levelUp', fire: (x, y) => fx.levelUp(x, y), period: 1.8 },
  {
    name: 'text (numbers, crits, merge, callout)',
    fire: (x, y) => {
      fx.text(x - 100, y, 12);
      fx.text(x - 40, y, 27);
      fx.text(x + 30, y, 64, { crit: true });
      fx.text(x + 110, y, 'LEVEL UP', { color: '#4fe3d0', size: 18 });
      fx.text(x, y + 60, '+25 cogs', { color: '#ffcf4a' });
    },
    tick: (x, y, t, dt, st) => {
      st.cd = (st.cd ?? 0) - dt;
      if (st.cd <= 0) {
        st.cd = 0.06;
        fx.text(x, y - 60, 3, { key: 'gatling', color: '#fff3dc' });
      }
    },
  },
];

// --- scene -------------------------------------------------------------------------------------
const bg = q.get('bg') || 'sky';
function drawBackground(ctx) {
  renderer.applyScreen(ctx);
  const w = renderer.cssW;
  const h = renderer.cssH;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  if (bg === 'dark') {
    g.addColorStop(0, '#16110c');
    g.addColorStop(1, '#2a2018');
  } else if (bg === 'field') {
    g.addColorStop(0, '#7f9a52');
    g.addColorStop(1, '#a89a5c');
  } else {
    g.addColorStop(0, '#6f8fa8');
    g.addColorStop(0.6, '#a9bcc4');
    g.addColorStop(1, '#c9b48e');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  if (bg === 'field') {
    // patchwork farmland like the harbor biome, to judge effects over busy ground
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = ['#c9b46a', '#6f8f44', '#9aa856', '#d8c27c', '#5e7d3e'][i % 5];
      ctx.globalAlpha = 0.8;
      ctx.fillRect((i * 173) % w, (i * 97) % h, 90 + (i % 4) * 30, 60 + (i % 3) * 25);
    }
    ctx.globalAlpha = 1;
  } else if (bg !== 'dark') {
    // a few soft clouds so additive & alpha effects can be judged on mid-tones
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 9; i++) {
      const cx = ((i * 337) % w) + 40;
      const cy = ((i * 211) % h) * 0.9 + 30;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 120, 36, 0, 0, TAU);
      ctx.fill();
    }
  }
}

function drawShip(ctx, x, y, a) {
  if (Sprites.has('hull_dauntless')) Sprites.draw(ctx, 'hull_dauntless', x, y, a, 1);
  else {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = '#d8c69c';
    ctx.strokeStyle = '#1a120a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 40, 16, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

// --- modes -------------------------------------------------------------------------------------
const mode = flag('stress') ? 'stress' : flag('grid') ? 'grid' : 'loop';
const only = q.get('effect');
const list = only ? DEMOS.filter((d) => d.name.startsWith(only)) : DEMOS;
if (only && !list.length) console.error(`[test] unknown effect "${only}"`);
let cur = 0;
let curT = 0;
let state = {};
const STEP = 1.6;

const cells = []; // grid mode: {demo, x, y, state}
function layoutGrid() {
  cells.length = 0;
  const v = renderer.viewRect(0);
  const cols = 6;
  const rows = Math.ceil(list.length / cols);
  const cw = v.w / cols;
  const ch = (v.h - 40) / rows;
  list.forEach((demo, i) => {
    const c = i % cols;
    const r = (i / cols) | 0;
    cells.push({ demo, x: v.x0 + cw * (c + 0.5), y: v.y0 + ch * (r + 0.55), w: cw, h: ch, state: {}, t: 0 });
  });
}

function fireCell(c) {
  c.state = {};
  c.t = 0;
  c.demo.fire(c.x, c.y);
}

if (mode === 'grid') {
  layoutGrid();
  cells.forEach(fireCell);
} else if (mode === 'loop' && list.length) {
  list[0].fire(0, 0);
}

const stressTarget = Number(q.get('count') || 4000);
function stressTick(dt, t) {
  // pan the camera to exercise culling, keep the pool near the target with mixed effects
  renderer.camera.x = Math.sin(t * 0.3) * 80;
  renderer.camera.y = Math.cos(t * 0.23) * 50;
  const v = renderer.viewRect(-60);
  let guard = 0;
  while (particles.count < stressTarget && guard++ < 6) {
    const x = rnd(v.x0, v.x1);
    const y = rnd(v.y0, v.y1);
    const r = Math.random();
    if (r < 0.35) fx.explosion(x, y, rnd(0.6, 1.8));
    else if (r < 0.55) fx.smoke(x, y, 1.4, { count: 10 });
    else if (r < 0.75) fx.sparks(x, y, rnd(0, TAU), 30, '#ffd36b', TAU);
    else if (r < 0.9) fx.embers(x, y, 30);
    else fx.debris(x, y, 12);
  }
  if (Math.random() < dt * 4) {
    const x = rnd(v.x0, v.x1);
    fx.lightning(x, v.y0, x + rnd(-80, 80), v.y1, { life: 0.25 });
  }
  if (Math.random() < dt * 10) fx.text(rnd(v.x0, v.x1), rnd(v.y0, v.y1), (rnd(5, 99) | 0), { crit: Math.random() < 0.2 });
}

// --- UI ----------------------------------------------------------------------------------------
const ui = document.getElementById('ui');
if (q.get('ui') === '0' || q.has('at')) ui.classList.add('hidden');
for (const d of DEMOS) {
  const b = document.createElement('button');
  b.textContent = d.name;
  b.onclick = () => {
    const i = list.indexOf(d);
    if (mode === 'loop' && i >= 0) {
      cur = i;
      curT = 0;
      state = {};
    }
    d.fire(0, 0);
  };
  ui.append(b);
}
const clearBtn = document.createElement('button');
clearBtn.textContent = 'clear';
clearBtn.onclick = () => fx.clear();
ui.append(clearBtn);

const hud = document.getElementById('hud');

// --- loop --------------------------------------------------------------------------------------
let time = 0;
let fps = 60;
let frameMs = 0;
let frozen = false;

function step(dt) {
  time += dt;
  if (mode === 'loop' && list.length) {
    const d = list[cur];
    curT += dt;
    d.tick?.(0, 0, curT, dt, state);
    const per = d.period ?? STEP;
    if (curT >= per * (only ? 1 : 2)) {
      curT = 0;
      state = {};
      if (!only) cur = (cur + 1) % list.length;
      list[cur].fire(0, 0);
    } else if (only && d.period && curT >= d.period) {
      curT = 0;
      d.fire(0, 0);
    }
  } else if (mode === 'grid') {
    for (const c of cells) {
      c.t += dt;
      c.demo.tick?.(c.x, c.y, c.t, dt, c.state);
      if (c.t >= (c.demo.period ?? STEP) * 1.5) fireCell(c);
    }
  } else if (mode === 'stress') {
    stressTick(dt, time);
  }
  particles.update(dt);
  fx.update(dt);
}

function render() {
  const t0 = performance.now();
  const ctx = renderer.ctx;
  renderer.clear('#1b130b');
  drawBackground(ctx);
  renderer.applyWorld(ctx);
  if (mode === 'loop') {
    drawShip(ctx, -260, 140, -0.3);
    list[cur]?.draw?.(ctx, state);
  } else if (mode === 'grid') {
    for (const c of cells) c.demo.draw?.(ctx, c.state);
  }
  particles.draw(ctx, renderer, 'low');
  particles.draw(ctx, renderer, 'normal');
  particles.draw(ctx, renderer, 'add');
  fx.drawEffects(ctx, renderer);
  fx.drawTexts(ctx, renderer);
  // labels
  renderer.applyScreen(ctx);
  ctx.font = 'bold 16px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff3c4';
  ctx.strokeStyle = 'rgba(26,18,10,.85)';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  if (mode === 'loop' && list[cur]) {
    ctx.strokeText(list[cur].name, renderer.cssW / 2, 34);
    ctx.fillText(list[cur].name, renderer.cssW / 2, 34);
  } else if (mode === 'grid') {
    ctx.font = 'bold 12px Georgia, serif';
    const s = { x: 0, y: 0 };
    for (const c of cells) {
      renderer.worldToScreen(c.x, c.y - c.h * 0.46, s);
      ctx.strokeText(c.demo.name, s.x, s.y + 8);
      ctx.fillText(c.demo.name, s.x, s.y + 8);
    }
  }
  frameMs = performance.now() - t0;
}

function updateHud() {
  hud.textContent =
    `${mode}${only ? `:${only}` : ''}  fps ${fps.toFixed(0)}  render ${frameMs.toFixed(1)} ms\n` +
    `particles ${particles.count}/${particles.cap}  effects ${fx.effects.count}  texts ${fx.floats.count}` +
    `${Save.settings.quality === 'low' ? '  [low]' : ''}${Save.settings.flashes ? '' : '  [noflash]'}`;
}

const freezeAt = q.has('at') ? Number(q.get('at')) : null;
if (freezeAt !== null) {
  const h = 1 / 60;
  for (let t = 0; t < freezeAt; t += h) step(h);
  frozen = true;
}

let last = performance.now();
let acc = 0;
let frames = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!frozen) step(dt);
  render();
  frames++;
  acc += dt;
  if (acc >= 0.5) {
    fps = frames / acc;
    frames = 0;
    acc = 0;
  }
  updateHud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener('resize', () => mode === 'grid' && layoutGrid());

window.FXP = {
  fx,
  particles,
  renderer,
  get fps() {
    return fps;
  },
  get frameMs() {
    return frameMs;
  },
  fire: (name, x = 0, y = 0) => DEMOS.find((d) => d.name.startsWith(name))?.fire(x, y),
  freeze: (v = true) => (frozen = v),
  profile() {
    const ctx = renderer.ctx;
    renderer.applyWorld(ctx);
    const out = {};
    for (const l of ['low', 'normal', 'add']) {
      const t0 = performance.now();
      particles.draw(ctx, renderer, l);
      out[l] = +(performance.now() - t0).toFixed(2);
    }
    const t1 = performance.now();
    fx.drawEffects(ctx, renderer);
    fx.drawTexts(ctx, renderer);
    out.effectsTexts = +(performance.now() - t1).toFixed(2);
    out.counts = particles.pools.map((p) => p.n);
    return out;
  },
  stats: () => ({ tex: { ...texStats }, frameMs, particles: particles.count, cap: particles.cap, effects: fx.effects.count, texts: fx.floats.count }),
};
console.log(`[test] fx preview ready (${mode}, ${list.length} effects)`);
