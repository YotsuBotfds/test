// WP12 preview: every skirmisher drawn through its real def.draw/drawShadow with animated parts,
// large (zoom) on a dark panel and at 1× on two sky colours. Uses a tiny fake world.
import '../../js/gfx/art/index.js';
import { SKIRMISHERS } from '../../js/content/enemies/skirmishers.js';
import { drawEnemySprite } from '../../js/game/enemies.js';
import { RNG } from '../../js/core/rng.js';

const q = new URLSearchParams(location.search);
const zoom = Number(q.get('zoom') || 3);
const elite = q.get('elite');
const freeze = q.get('freeze') === '1';
const only = q.get('only');
const ids = Object.keys(SKIRMISHERS).filter((id) => !only || only.split(',').includes(id));
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const W = 1500;
const H = 980;
canvas.width = W;
canvas.height = H;

const noop = () => null;
const player = { x: 0, y: 0, vx: 0, vy: 0, r: 22, hitR: 12, alive: true };
const world = {
  rng: new RNG(7),
  time: 0,
  run: null,
  fx: {},
  particles: null,
  wind: { x: 0, y: 0 },
  nearestPlayer: () => player,
  queryEnemies: (x, y, r, out = []) => out,
  isVisible: () => false,
  sfx: noop,
  telegraphCircle: noop,
  telegraphLine: noop,
  addHazard: noop,
  explode: noop,
  fire: noop,
  after: noop,
  shake: noop,
  removeEnemy: noop,
  drawEnemySprite(c, e, sprite, frame, angle, x, y, scale) {
    drawEnemySprite(this, c, e, sprite ?? e.sprite, frame ?? e.frame, angle ?? e.angle, x ?? e.x, y ?? e.y, scale ?? e.scale);
  },
};

let nextId = 1;
function make(id) {
  const def = SKIRMISHERS[id];
  const e = {
    id: nextId++, type: id, def, x: 0, y: 0, vx: 0, vy: 0, r: def.r, angle: 0, scale: 1, alpha: 1,
    t: 0, alive: true, dead: false, hp: def.hp, maxHp: def.hp, sprite: def.sprite, frame: 0,
    elite: elite ? 'armored' : null, flash: 0, burn: null, slow: null, data: {}, state: '', timer: 0,
    speedMult: 1, fireRateMult: 1, dmgMult: 1, phased: false, kbx: 0, kby: 0,
  };
  def.init?.(e, world);
  return e;
}

const big = ids.map(make);
const small = ids.map(make);
const smallB = ids.map(make);

function step(e, dt, px, py, keepAngle) {
  e.t += dt;
  player.x = px + 400;
  player.y = py + 60;
  e.x = px;
  e.y = py;
  try {
    e.def.update?.(e, dt, world);
  } catch (err) {
    console.error(err);
  }
  e.x = px;
  e.y = py;
  e.vx = e.vy = 0;
  if (!keepAngle) e.angle = -0.35;
}

function drawOne(e, x, y, z) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(z, z);
  ctx.translate(-e.x, -e.y);
  ctx.save();
  if (e.def.drawShadow) e.def.drawShadow(ctx, e, world, 26 * e.def.alt * 0.5, 34 * e.def.alt * 0.5);
  ctx.restore();
  ctx.save();
  if (e.def.draw) e.def.draw(ctx, e, world);
  else world.drawEnemySprite(ctx, e);
  ctx.restore();
  ctx.restore();
}

let last = performance.now();
function frame(now) {
  const dt = freeze ? 0 : Math.min(0.05, (now - last) / 1000);
  last = now;
  world.time += dt;
  ctx.fillStyle = '#3b2a18';
  ctx.fillRect(0, 0, W, H);
  // big row(s)
  const cols = only ? big.length : 3;
  const cw = W / cols;
  const ch = only ? 600 : 300;
  big.forEach((e, i) => {
    const cx = (i % cols) * cw + cw / 2;
    const cy = Math.floor(i / cols) * ch + ch / 2 + 10;
    step(e, dt, 0, 0, false);
    drawOne(e, cx, cy, only ? zoom : Math.min(zoom, 230 / (e.def.r * 2.6)));
    ctx.fillStyle = '#f1e3c0';
    ctx.font = '14px Georgia, serif';
    ctx.fillText(`${e.def.name} (${e.type}) r${e.def.r}`, cx - 120, cy + ch / 2 - 14);
  });
  // 1x strips on sky colours
  const strips = [
    [small, q.get('bg') || '#e9b07a'],
    [smallB, '#86a9c9'],
  ];
  strips.forEach(([list, bg], k) => {
    const y0 = 2 * ch + 20 + k * 180;
    ctx.fillStyle = bg;
    ctx.fillRect(0, y0, W, 170);
    list.forEach((e, i) => {
      step(e, dt, 0, 0, false);
      drawOne(e, 120 + i * 230, y0 + 85, 1);
    });
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
