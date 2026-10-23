// WP2 input preview: live readout of controls(0/1), menu edges, devices and pads, plus a toy
// skyship driven by the controls and the real touch overlay. Query: ?left=1&opacity=0.8&idle=1&noreadout=1
import { Renderer } from '../../js/gfx/renderer.js';
import { Input } from '../../js/input/input.js';
import { PAL } from '../../js/config.js';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const input = new Input(canvas, renderer);
input.setGameplayActive(q.get('idle') !== '1');
if (q.has('left') || q.has('opacity')) {
  input.setTouchLayout({ leftHanded: q.get('left') === '1', opacity: Number(q.get('opacity') || 0.55) });
}

let Sprites = null;
try {
  await import('../../js/gfx/art/index.js');
  ({ Sprites } = await import('../../js/gfx/sprites.js'));
} catch (e) {
  console.warn('[test] sprites unavailable, using fallback ship', e?.message);
}

const readout = document.getElementById('readout');
if (q.get('noreadout') === '1') document.body.classList.add('noreadout');
const ships = [0, 1].map((i) => ({ x: i * 120, y: 0, vx: 0, vy: 0, turret: 0, boostT: 0, bombT: 0, joined: i === 0 }));
const shots = [];
const counts = { p0: { boost: 0, bomb: 0, pause: 0 }, p1: { boost: 0, bomb: 0, pause: 0 }, menu: {}, joins: 0, fireFrames: 0 };
let paused = false;
let firstInteraction = false;
input.onFirstInteraction(() => (firstInteraction = true));

const fmt = (v) => (typeof v === 'number' ? (v >= 0 ? ' ' : '') + v.toFixed(2) : String(v));
function dump(c) {
  return [
    `move ${fmt(c.moveX)},${fmt(c.moveY)}  aim ${fmt(c.aimX)},${fmt(c.aimY)} mag ${fmt(c.aimMag)}`,
    `mode ${c.aimMode.padEnd(5)} fire ${c.fire ? 'YES' : 'no '} dev ${c.device} pad ${c.pad} assist ${c.aimAssist}`,
    `mouseWorld ${c.mouseWorld ? `${c.mouseWorld.x.toFixed(0)},${c.mouseWorld.y.toFixed(0)}` : 'null'}`,
    `edges boost ${c.boost ? 1 : 0} bomb ${c.bomb ? 1 : 0} pause ${c.pause ? 1 : 0}  held boost ${c.boostHeld ? 1 : 0} bomb ${c.bombHeld ? 1 : 0}`,
  ].join('\n  ');
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyG') input.setGameplayActive(!input.gameplayActive);
  if (e.code === 'KeyH') input.setTouchLayout({ leftHanded: !input.touch.leftHanded });
});

let menuLog = [];
function step(dt) {
  input.update(dt);
  const join = input.joinRequested();
  if (join !== null) {
    input.bindPlayer(1, join);
    ships[1].joined = true;
    ships[1].x = ships[0].x + 80;
    ships[1].y = ships[0].y;
    counts.joins++;
  }
  for (const k of Object.keys(input.menu)) {
    if (k !== 'any' && input.menu[k]) {
      counts.menu[k] = (counts.menu[k] || 0) + 1;
      menuLog.unshift(k);
      menuLog = menuLog.slice(0, 8);
    }
  }
  for (let i = 0; i < 2; i++) {
    const s = ships[i];
    const c = input.controls(i);
    const c2 = input.controls(i); // read twice on purpose: edges must survive
    const tag = `p${i}`;
    if (c2.boost) counts[tag].boost++;
    if (c2.bomb) counts[tag].bomb++;
    if (c2.pause) {
      counts[tag].pause++;
      paused = !paused;
    }
    if (!s.joined) continue;
    if (paused) continue;
    const accel = c.boostHeld && s.boostT > 0 ? 2600 : 1500;
    if (c.boost) {
      s.boostT = 0.35;
      s.vx += c.moveX * 520 || Math.cos(s.turret) * 520;
      s.vy += c.moveY * 520 || Math.sin(s.turret) * 520;
      input.vibrate(0.4, 120, i);
    }
    if (c.bomb) {
      s.bombT = 0.6;
      input.vibrate(0.9, 260, i);
    }
    s.boostT = Math.max(0, s.boostT - dt);
    s.bombT = Math.max(0, s.bombT - dt);
    s.vx += c.moveX * accel * dt;
    s.vy += c.moveY * accel * dt;
    const drag = Math.exp(-4 * dt);
    s.vx *= drag;
    s.vy *= drag;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    let target = s.turret;
    if (c.aimMode === 'mouse' && c.mouseWorld) target = Math.atan2(c.mouseWorld.y - s.y, c.mouseWorld.x - s.x);
    else if (c.aimMode !== 'none') target = Math.atan2(c.aimY, c.aimX);
    let d = target - s.turret;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    s.turret += d * Math.min(1, dt * 18);
    s.fireCd = (s.fireCd || 0) - dt;
    if (c.fire) {
      if (i === 0) counts.fireFrames++;
      if (s.fireCd <= 0) {
        s.fireCd = 0.09;
        shots.push({ x: s.x + Math.cos(s.turret) * 30, y: s.y + Math.sin(s.turret) * 30, vx: Math.cos(s.turret) * 900, vy: Math.sin(s.turret) * 900, t: 0.9 });
      }
    }
  }
  for (let k = shots.length - 1; k >= 0; k--) {
    const b = shots[k];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.t -= dt;
    if (b.t <= 0) shots.splice(k, 1);
  }
  // Camera follows P0 loosely.
  const cam = renderer.camera;
  cam.x += (ships[0].x - cam.x) * Math.min(1, dt * 3);
  cam.y += (ships[0].y - cam.y) * Math.min(1, dt * 3);
}

function drawShip(ctx, s, i) {
  if (Sprites?.has?.('hull_dauntless')) {
    Sprites.draw(ctx, 'hull_dauntless', s.x, s.y, Math.atan2(s.vy, s.vx + 0.001) * 0.25, 1);
  } else {
    ctx.fillStyle = i ? PAL.navy : PAL.canvas[1];
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, 34, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.turret);
  ctx.fillStyle = i ? PAL.aether[1] : PAL.brass[1];
  ctx.strokeStyle = PAL.ink;
  ctx.fillRect(0, -4, 34, 8);
  ctx.strokeRect(0, -4, 34, 8);
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  if (s.boostT > 0) {
    ctx.globalAlpha = s.boostT / 0.35;
    ctx.fillStyle = PAL.steam;
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.arc(s.x - s.vx * 0.04 * k, s.y - s.vy * 0.04 * k, 10 + k * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  if (s.bombT > 0) {
    const t = 1 - s.bombT / 0.6;
    ctx.strokeStyle = PAL.syndicate[3];
    ctx.lineWidth = 6 * (1 - t);
    ctx.beginPath();
    ctx.arc(s.x, s.y, 40 + t * 260, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = PAL.parchment[0];
  ctx.font = 'bold 12px Georgia';
  ctx.textAlign = 'center';
  ctx.fillText(`P${i + 1}`, s.x, s.y - 34);
}

function render() {
  const ctx = renderer.ctx;
  renderer.clear('#4a6a86');
  renderer.applyWorld();
  // Sky grid so motion is readable.
  const v = renderer.viewRect(60);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = Math.floor(v.x0 / 100) * 100; x < v.x1; x += 100) {
    ctx.moveTo(x, v.y0);
    ctx.lineTo(x, v.y1);
  }
  for (let y = Math.floor(v.y0 / 100) * 100; y < v.y1; y += 100) {
    ctx.moveTo(v.x0, y);
    ctx.lineTo(v.x1, y);
  }
  ctx.stroke();
  ctx.fillStyle = PAL.playerFire[0];
  for (const b of shots) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ships.forEach((s, i) => s.joined && drawShip(ctx, s, i));
  const c0 = input.controls(0);
  if (c0.mouseWorld) {
    ctx.strokeStyle = PAL.gold;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c0.mouseWorld.x, c0.mouseWorld.y, 12, 0, Math.PI * 2);
    ctx.moveTo(c0.mouseWorld.x - 18, c0.mouseWorld.y);
    ctx.lineTo(c0.mouseWorld.x + 18, c0.mouseWorld.y);
    ctx.moveTo(c0.mouseWorld.x, c0.mouseWorld.y - 18);
    ctx.lineTo(c0.mouseWorld.x, c0.mouseWorld.y + 18);
    ctx.stroke();
  }
  renderer.applyScreen();
  if (paused) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, renderer.cssW, renderer.cssH);
    ctx.fillStyle = PAL.parchment[0];
    ctx.font = 'bold 28px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', renderer.cssW / 2, renderer.cssH / 2);
  }
  input.drawOverlay(ctx, renderer);
}

let frames = 0;
function updateReadout() {
  const pads = input.pads.map((p) => `#${p.index} P${p.player + 1 || '-'} ${p.id.slice(0, 26)} L${p.left.mag.toFixed(2)} R${p.right.mag.toFixed(2)} LT${p.lt.toFixed(1)} RT${p.rt.toFixed(1)}`);
  readout.textContent = [
    `lastDevice ${input.lastDevice}   padCount ${input.padCount}   gameplay ${input.gameplayActive}   first ${firstInteraction}`,
    `touches ${input.touch.activeTouches}  leftHanded ${input.touch.leftHanded}  opacity ${input.touch.opacity}`,
    `P1  ${dump(input.controls(0))}`,
    `P2  ${dump(input.controls(1))}`,
    `menu now  ${Object.entries(input.menu).filter(([k, v]) => v && k !== 'any').map(([k]) => k).join(' ') || '-'}`,
    `menu log  ${menuLog.join(' ')}`,
    `counts    ${JSON.stringify({ p0: counts.p0, p1: counts.p1 })}`,
    `menuCount ${JSON.stringify(counts.menu)} joins ${counts.joins}`,
    `pads      ${pads.join('\n          ') || 'none'}`,
  ].join('\n');
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(1 / 30, (now - last) / 1000);
  last = now;
  step(dt);
  render();
  if (frames++ % 4 === 0) updateReadout();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__inp = { input, counts, ships, get paused() { return paused; }, get first() { return firstInteraction; } };
