// HUD preview (WP22): drives the real HUD with a mock game so every gauge, banner and boss bar
// can be inspected (and screenshotted) deterministically. See hud.html for URL flags.

import '../../js/gfx/art/index.js';
import '../../js/content/weapons/index.js';
import { Renderer } from '../../js/gfx/renderer.js';
import { Sprites } from '../../js/gfx/sprites.js';
import { Save } from '../../js/core/storage.js';
import { events } from '../../js/core/events.js';
import { HUD } from '../../js/ui/hud.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? +q.get(k) : d);
if (q.get('clean') === '1') document.body.classList.add('clean');

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
renderer.camera.x = 0;
renderer.camera.y = 0;

const COLORS = ['#ffcf4a', '#7ff3ff', '#ff8ac0', '#a6ff7a'];

function makePlayer(i) {
  return {
    index: i,
    x: i * 120,
    y: i * 60,
    angle: -0.6,
    aim: -0.6,
    aimDist: 220,
    alive: true,
    hp: 100,
    steam: 100,
    bombs: 2,
    shieldReady: false,
    shieldT: 6,
    revivesLeft: 1,
    color: COLORS[i],
    firing: false,
    controls: { aimMode: 'none', aimMag: 0 },
    stats: { maxHp: 120, steamMax: 100, boostCost: 30, bombsMax: 3, shieldInterval: 16 },
    primary: { id: 'brassCannon', level: 4, kick: 0 },
    aux: [
      { id: 'teslaCoil', level: 3, cd: 0, kick: 0, period: 1.6 },
      { id: 'rocketPods', level: 5, cd: 0, kick: 0, period: 2.5 },
      { id: 'thunderhead', level: 1, cd: 0, kick: 0, period: 0.9 },
    ].slice(0, i === 0 ? 3 : 2),
  };
}

const run = {
  mode: 'campaign',
  stage: { name: 'The Smog Wastes', boss: 'kraken' },
  stageIndex: 1,
  stageOrder: [0, 1, 2, 3, 4],
  wave: 3,
  waveCount: 5,
  director: 'wave',
  score: 48250,
  combo: 1,
  chain: 0,
  comboTimer: 0,
  xp: 30,
  level: 7,
  xpNext: 62,
  cogs: 1234,
};

const world = {
  players: [makePlayer(0)],
  enemies: [],
  bosses: [],
  pickups: [],
};
for (let i = 0; i < 40; i++) {
  const a = i * 2.4;
  const d = 300 + ((i * 97) % 1300);
  world.enemies.push({ alive: true, x: Math.cos(a) * d, y: Math.sin(a) * d, r: i % 7 === 0 ? 40 : 16, elite: i % 11 === 0 ? 'armored' : null });
}
world.pickups.push({ alive: true, type: 'crate', x: -900, y: 500 });
world.pickups.push({ alive: true, type: 'crate', x: 300, y: -200 });

function makeBoss(id, name, title, x, y) {
  const b = { id, alive: true, dead: false, isBoss: true, x, y, r: 90, hp: 2600, maxHp: 2600, phase: 0, type: 'kraken', def: { name, title }, parts: [] };
  for (let i = 0; i < 6; i++) b.parts.push({ alive: i !== 2, dead: i === 2, hp: 180 - i * 25, maxHp: 220, def: { shareDamage: 0.5 }, parent: b });
  return b;
}

const director = {
  state: 'wave',
  progress: { frac: 0.42 },
};
const game = {
  state: 'playing',
  run,
  world,
  director,
  renderer,
  input: { lastDevice: q.get('touch') === '1' ? 'touch' : 'kbm' },
  fps: 60,
  ui: null,
};
world.renderer = renderer;
world.director = director;

if (q.get('fps') === '1') Save.settings.showFps = true;
const hud = new HUD(game);
game.hud = hud;
events.emit('run:start', { run });

for (let i = 1; i < num('players', 1); i++) world.players.push(makePlayer(i));
if (q.has('hp')) world.players[0].hp = num('hp', 100);
const nb = num('boss', 0);
if (nb >= 1) {
  world.bosses.push(makeBoss(1, 'The Clockwork Kraken', 'Terror of the Smog', 1400, -500));
  director.state = 'boss';
}
if (nb >= 2) world.bosses.push(makeBoss(2, 'Kraken Spawn', 'Lesser Terror', -1200, 300));

// ---- simulation ---------------------------------------------------------------------------
let t = 0;
let chainT = 0;
const comboTarget = num('combo', 12);
function sim(dt) {
  t += dt;
  const p = world.players[0];
  for (const pl of world.players) {
    for (const s of pl.aux) {
      s.cd -= dt;
      if (s.cd <= 0) {
        s.cd = s.period;
        s.kick = 1;
      }
      s.kick = Math.max(0, s.kick - dt * 4);
    }
    pl.steam = Math.min(pl.stats.steamMax, pl.steam + 14 * dt);
  }
  p.controls.mouseWorld = { x: Math.cos(t) * 200, y: Math.sin(t) * 150 - 100 };
  p.controls.aimMode = 'mouse';
  director.progress.frac = (t * 0.05) % 1;
  // combo chain grows to the target, then lapses
  chainT -= dt;
  if (run.chain < comboTarget && chainT <= 0) {
    chainT = 0.35;
    run.chain++;
    run.combo = Math.min(5, 1 + 0.1 * run.chain);
    run.comboTimer = 2.5;
    run.score += Math.round(25 * run.combo);
    run.cogs += 1;
    if (run.chain % 5 === 0) events.emit('combo', { value: run.combo, chain: run.chain });
  }
  run.comboTimer = Math.max(0.2, run.comboTimer - dt);
  for (const b of world.bosses) b.hp = Math.max(b.maxHp * 0.12, b.hp - dt * 40);
  for (const e of world.enemies) {
    e.x += Math.sin(t + e.y) * 20 * dt;
  }
}

function drawBack(ctx) {
  renderer.clear('#4d7385');
  renderer.applyScreen(ctx);
  const W = renderer.cssW;
  const H = renderer.cssH;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#9fc6d4');
  g.addColorStop(1, '#5c8a6a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    ctx.ellipse(((i * 233) % W), ((i * 151) % H), 120, 40, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  renderer.applyWorld(ctx);
  for (const e of world.enemies) {
    ctx.fillStyle = e.elite ? '#ffcf4a' : '#4b4f58';
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const p of world.players) {
    if (Sprites.has('hull_dauntless')) Sprites.draw(ctx, 'hull_dauntless', p.x, p.y, p.angle, 1);
  }
}

// ---- controls -----------------------------------------------------------------------------
const actions = {
  wave: () => hud.announce('Wave 3', 'Carrier wave', { kind: 'wave', time: 1.8 }),
  clear: () => hud.announce('Wave Cleared', '+600', { kind: 'clear', time: 1.6 }),
  stage: () => hud.announce('The Smog Wastes', 'Stage 2 — Soot and sorrow', { kind: 'stage', time: 3 }),
  victory: () => hud.announce('Victory!', 'The Iron Syndicate is broken', { kind: 'stage', time: 4 }),
  warning: () => hud.announce('WARNING', 'The Clockwork Kraken approaches', { kind: 'warning', time: 3 }),
  alert: () => hud.announce('Tentacles severed!', 'The kraken thrashes wildly', { kind: 'warning', time: 1.8 }),
  boss: () => hud.announce('The Clockwork Kraken', 'Terror of the Smog', { kind: 'boss', time: 3.2 }),
  refit: () => hud.announce('Stage Clear', 'Refit at the floating dock', { kind: 'clear', time: 2.4 }),
  hit: () => {
    const p = world.players[0];
    p.hp = Math.max(1, p.hp - 25);
    events.emit('player:hit', { player: p, amount: 25 });
  },
  heal: () => {
    world.players[0].hp = world.players[0].stats.maxHp;
  },
  bomb: () => {
    const p = world.players[0];
    p.bombs = p.bombs > 0 ? p.bombs - 1 : p.stats.bombsMax;
  },
  boost: () => {
    world.players[0].steam = Math.max(0, world.players[0].steam - 30);
  },
  levelup: () => {
    run.level++;
    run.xp = 2;
  },
  bossToggle: () => {
    if (world.bosses.length) {
      world.bosses[0].alive = false;
      world.bosses.length = 0;
    } else world.bosses.push(makeBoss(Math.random(), 'The Clockwork Kraken', 'Terror of the Smog', 1400, -500));
  },
  phase: () => {
    const b = world.bosses[0];
    if (b) events.emit('boss:phase', { boss: b, phase: ++b.phase });
  },
  player: () => {
    if (world.players.length < 4) world.players.push(makePlayer(world.players.length));
  },
  down: () => {
    const p = world.players[world.players.length - 1];
    p.alive = !p.alive;
  },
  touch: () => {
    game.input.lastDevice = game.input.lastDevice === 'touch' ? 'kbm' : 'touch';
  },
  breakCombo: () => {
    run.chain = 0;
    run.combo = 1;
  },
};
const bar = document.getElementById('bar');
for (const k of Object.keys(actions)) {
  const b = document.createElement('button');
  b.textContent = k;
  b.onclick = actions[k];
  bar.append(b);
}
window.HUDP = { hud, game, world, run, actions, sim };

// ---- loop ---------------------------------------------------------------------------------
const freeze = q.has('freeze') ? num('freeze', 3) : null;
const banner = q.get('banner');
const bt = num('bt', 1);
const warm = freeze ?? 0;
for (let i = 0; i < warm * 60; i++) {
  sim(1 / 60);
  hud.update(1 / 60);
}
if (banner && actions[banner]) {
  actions[banner]();
  for (let i = 0; i < Math.round(bt * 60); i++) hud.update(1 / 60);
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (freeze === null && !banner) {
    sim(dt);
    hud.update(dt);
  }
  const ctx = renderer.ctx;
  drawBack(ctx);
  hud.draw(ctx, renderer);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
