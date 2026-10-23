// WP13 preview: draws every warship through its real def.draw with a mock world, cycling the
// animated states (carrier hatch, frigate gunport glow, mortar heat/aim, tesla arc, wraith phase).
import { WARSHIPS } from '../../js/content/enemies/warships.js';
import { Sprites } from '../../js/gfx/sprites.js';

const q = new URLSearchParams(location.search);
const scale = Number(q.get('scale') || 2);
if (q.get('bg')) document.body.style.background = q.get('bg');
const cvs = document.getElementById('c');
const ctx = cvs.getContext('2d');
const COLS = 3;
const CW = 200;
const CH = 150;
cvs.width = COLS * CW * scale;
cvs.height = 2 * CH * scale;

const world = {
  drawEnemySprite(c, e, sprite = e.sprite, frame = e.frame) {
    Sprites.draw(c, sprite, e.x, e.y, e.angle, e.scale, e.alpha * (e.phased ? 0.35 : 1), frame);
    if (e.flash > 0) Sprites.drawFlash(c, sprite, e.x, e.y, e.angle, e.scale, e.flash, frame);
  },
  isVisible: () => true,
};

const mk = (id, i, extra = {}) => ({
  id: i, type: id, def: WARSHIPS[id], sprite: WARSHIPS[id].sprite, x: (i % COLS) * CW + CW / 2,
  y: Math.floor(i / COLS) * CH + CH / 2, angle: -0.25, scale: 1, alpha: 1, frame: 0, t: 0,
  alive: true, dead: false, flash: 0, hp: 1, maxHp: 1, phased: false, elite: null,
  data: { hatch: 0, glow: 0, side: 1, aim: 0, heat: 0, recoil: 0, vis: 1, charge: 0 }, ...extra,
});
const ids = ['carrier', 'frigate', 'mortarBarge', 'teslaBuoy', 'ornithopter', 'steamWraith'];
const ships = ids.map((id, i) => mk(id, i));
const buoyB = mk('teslaBuoy', 3);
buoyB.x += 60;
buoyB.y += 30;
ships[3].x -= 50;
ships[3].y -= 20;
ships[3].partner = buoyB;
buoyB.partner = ships[3];

let last = performance.now();
let T = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  T += dt;
  for (const s of [...ships, buoyB]) s.t += dt;
  const k = (T % 4) / 4;
  ships[0].data.hatch = k < 0.5 ? Math.min(1, k * 6) : Math.max(0, 1 - (k - 0.5) * 6);
  ships[1].data.glow = Math.max(0, Math.sin(T * 1.5));
  ships[1].data.side = Math.sin(T * 0.3) > 0 ? 1 : -1;
  ships[2].data.aim = ships[2].angle + Math.sin(T * 0.8) * 1.2;
  ships[2].data.heat = (T % 3) / 3;
  ships[2].data.recoil = T % 3 < 0.2 ? 0.2 : 0;
  ships[4].frame = ((T * 13) | 0) & 3;
  ships[4].angle = T * 0.5;
  const ph = (T % 5) / 5;
  ships[5].data.vis = ph < 0.4 ? 0 : ph < 0.5 ? (ph - 0.4) * 10 : ph < 0.9 ? 1 : 1 - (ph - 0.9) * 10;
  ships[5].phased = ships[5].data.vis < 1;
  for (const s of [ships[3], buoyB]) s.angle += dt * 0.7;

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, cvs.width, cvs.height);
  // tesla arc stand-in (the real one is an fx.lightning + hazard)
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(255,77,166,0.6)';
  ctx.lineWidth = 3 + Math.sin(T * 30);
  ctx.beginPath();
  ctx.moveTo(ships[3].x, ships[3].y);
  for (let i = 1; i < 8; i++) {
    const u = i / 8;
    ctx.lineTo(ships[3].x + (buoyB.x - ships[3].x) * u + (Math.random() - 0.5) * 8,
      ships[3].y + (buoyB.y - ships[3].y) * u + (Math.random() - 0.5) * 8);
  }
  ctx.lineTo(buoyB.x, buoyB.y);
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  for (const s of [...ships, buoyB]) {
    ctx.save();
    if (s.def.draw) s.def.draw(ctx, s, world);
    else world.drawEnemySprite(ctx, s);
    ctx.restore();
  }
  ctx.fillStyle = '#f1e3c0';
  ctx.font = '11px Georgia';
  ids.forEach((id, i) => ctx.fillText(WARSHIPS[id].name, (i % COLS) * CW + 6, Math.floor(i / COLS) * CH + 14));
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
console.log('[test] warships preview running');
