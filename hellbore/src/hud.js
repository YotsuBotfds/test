// In-run heads-up display and touch controls.
import { TILE, WEAPONS, POWERS, MAX_WEAPON_LEVEL, STRATUM_LEN } from './data.js';
import { drawText, textWidth } from './font.js';
import { arenaInfo } from './world.js';
import { rgb, clamp, mix, TAU } from './util.js';

function bar(ctx, x, y, w, h, frac, col, back = 'rgba(0,0,0,0.6)') {
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = back;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col;
  ctx.fillRect(x, y, Math.round(w * clamp(frac, 0, 1)), h);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x, y, Math.round(w * clamp(frac, 0, 1)), 1);
}

export function drawHUD(ctx, g, input, W, H) {
  const p = g.player;
  const touch = input.mode === 'touch';

  // ---- hull
  const hw = Math.min(96, Math.floor(W * 0.3));
  const frac = p.hp / p.maxHp;
  const hcol = frac > 0.5 ? mix([120, 230, 110], [240, 220, 80], (1 - frac) * 2) : mix([240, 220, 80], [240, 60, 50], 1 - frac * 2);
  drawText(ctx, 'HULL', 8, 7, { color: '#c8b8a8' });
  bar(ctx, 30, 7, hw, 7, frac, rgb(hcol));
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  for (let v = 25; v < p.maxHp; v += 25) ctx.fillRect(30 + Math.round((v / p.maxHp) * hw), 7, 1, 7);
  drawText(ctx, `${Math.ceil(Math.max(0, p.hp))}`, 30 + hw + 4, 7, { color: rgb(hcol) });

  // ---- charges + dash
  let x = 8;
  for (let i = 0; i < p.maxBombs; i++) {
    drawText(ctx, '&', x, 18, { color: i < p.bombs ? '#ff7a50' : '#4a3430' });
    x += 8;
  }
  const dashF = 1 - p.dashCd / p.stats.dashCd;
  const dw = drawText(ctx, 'DASH', x + 4, 18, { color: dashF >= 1 ? '#ffd890' : '#6a5a4a' });
  bar(ctx, x + 8 + dw, 20, 22, 3, dashF, dashF >= 1 ? '#ffd890' : '#8a6a40');

  // ---- depth / stratum / ore
  const depth = g.depth;
  drawText(ctx, `${depth}M`, W - 12, 6, { scale: 2, color: '#ffe0b0', align: 'right' });
  const sname = g.loop ? `${g.sdef.name} +${g.loop}` : g.sdef.name;
  drawText(ctx, sname, W - 12, 23, { color: rgb(g.sdef.colors.seal), align: 'right' });
  drawText(ctx, `@ ${p.ore}`, W - 12, 33, { color: rgb(g.sdef.colors.ore1), align: 'right' });

  // ---- depth gauge (right edge)
  const gy0 = 46;
  const gy1 = H - (touch ? 170 : 46);
  if (gy1 - gy0 > 40) {
    const base = g.stratum * STRATUM_LEN;
    const A = arenaInfo(g.stratum);
    const f = clamp((p.y / TILE - base) / STRATUM_LEN, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(W - 6, gy0, 3, gy1 - gy0);
    ctx.fillStyle = rgb(g.sdef.colors.seal, 0.6);
    ctx.fillRect(W - 6, gy0, 3, Math.round((gy1 - gy0) * f));
    const ay = gy0 + ((A.top - base) / STRATUM_LEN) * (gy1 - gy0);
    ctx.fillStyle = '#ff5040';
    ctx.fillRect(W - 8, Math.round(ay), 7, 1);
    drawText(ctx, '*', W - 15, Math.round(ay) - 3, { color: '#ff5040' });
    ctx.fillStyle = '#fff';
    ctx.fillRect(W - 8, Math.round(gy0 + (gy1 - gy0) * f), 7, 2);
    const cf = clamp((g.collapseY / TILE - base) / STRATUM_LEN, 0, 1);
    if (g.collapseY / TILE > base) {
      ctx.fillStyle = 'rgba(120,100,90,0.8)';
      ctx.fillRect(W - 6, gy0, 3, Math.round((gy1 - gy0) * cf));
    }
  }

  // ---- weapon + powers (bottom left)
  const wy = H - 14;
  const w = WEAPONS[p.weapon];
  const wx = 8;
  const lvl = p.wlevel;
  const wyy = touch ? 50 : wy;
  drawText(ctx, w.name, wx, wyy, { color: rgb(w.color) });
  const px = wx + textWidth(w.name) + 5;
  for (let i = 0; i < MAX_WEAPON_LEVEL; i++) {
    ctx.fillStyle = i < lvl ? rgb(w.color) : 'rgba(255,255,255,0.15)';
    ctx.fillRect(px + i * 5, wyy + 2, 4, 3);
  }
  let py = touch ? wyy + 11 : wyy - 11;
  for (const id of Object.keys(p.powers)) {
    const t = p.powers[id];
    if (t <= 0) continue;
    const pw = POWERS[id];
    const label = id === 'aegis' ? `${pw.name} X${p.aegisHits}` : pw.name;
    drawText(ctx, label, wx, py, { color: rgb(pw.color) });
    bar(ctx, wx + textWidth(label) + 4, py + 2, 30, 3, t / pw.dur, rgb(pw.color));
    py += touch ? 10 : -10;
  }

  // ---- cave-in warning
  const gap = (p.y - g.collapseY) / TILE;
  if (!p.dead && gap < 14 && g.collapseHold <= 0) {
    const blink = Math.floor(g.time * 6) % 2 === 0;
    const col = gap < 5 ? (blink ? '#ff3020' : '#ffb080') : '#ff8a50';
    drawText(ctx, `^ CAVE-IN ${Math.max(0, Math.ceil(gap))}M ^`, W / 2, touch ? 26 : 8, { color: col, align: 'center' });
  }

  // ---- boss bar
  const b = g.boss;
  if (b && b.alive && b.intro < 1.8) {
    const bw = Math.min(260, W * 0.6);
    const bx = Math.round(W / 2 - bw / 2);
    const byy = touch ? 40 : H - 24;
    const name = g.loop ? `${b.name} +${g.loop}` : b.name;
    drawText(ctx, name, W / 2, byy - 10, { color: '#ff8a70', align: 'center' });
    bar(ctx, bx, byy, bw, 5, b.frac, b.intro > 0 || b.stagger > 0 ? '#ffffff' : '#e03030', 'rgba(60,0,0,0.7)');
    for (const t of [0.33, 0.66]) {
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillRect(bx + Math.round(bw * t), byy, 1, 5);
    }
  }

  drawBanner(ctx, g, W, H);
  if (g.tutorial && g.stats.time < 14) drawTutorial(ctx, g, input.mode, W, H);

  if (touch) drawTouch(ctx, g, input, W, H);
  else if (input.out.aimMode === 'mouse' && input.mouse.seen) drawCrosshair(ctx, input.mouse.x, input.mouse.y, WEAPONS[p.weapon].color, g.time);
}

export function drawBanner(ctx, g, W, H) {
  const bn = g.banner;
  if (!bn) return;
  const t = bn.t;
  const a = Math.min(1, t * 3, (bn.dur - t) * 2);
  if (a <= 0) return;
  const scale = W < 360 ? 2 : 3;
  const y = Math.round(H * 0.3);
  if (bn.boss) {
    ctx.fillStyle = `rgba(0,0,0,${0.55 * a})`;
    ctx.fillRect(0, y - 14, W, 7 * scale + 40);
    ctx.fillStyle = `rgba(200,30,20,${a})`;
    const sweep = Math.min(1, t * 2) * W;
    ctx.fillRect(W / 2 - sweep / 2, y - 14, sweep, 2);
    ctx.fillRect(W / 2 - sweep / 2, y + 7 * scale + 24, sweep, 2);
  }
  const off = (1 - Math.min(1, t * 3)) * 20;
  drawText(ctx, bn.title, W / 2 + off, y, { scale, color: rgb(bn.color), align: 'center', alpha: a });
  if (bn.sub) drawText(ctx, bn.sub, W / 2 - off, y + 7 * scale + 8, { color: '#d8c8b8', align: 'center', alpha: a });
}

const TUTORIAL = {
  kbm: ['WASD MOVE  /  MOUSE AIMS  /  HOLD CLICK TO FIRE', 'SPACE DASH  /  E THROWS A CHARGE  /  DRIVE INTO ROCK TO DIG'],
  pad: ['LEFT STICK MOVES  /  RIGHT STICK AIMS AND FIRES', 'A DASH  /  B THROWS A CHARGE  /  DRIVE INTO ROCK TO DIG'],
  touch: ['LEFT THUMB MOVES  /  RIGHT THUMB AIMS AND FIRES', 'DRIVE INTO ROCK TO DIG. HEAD DOWN.'],
};

function drawTutorial(ctx, g, mode, W, H) {
  const t = g.stats.time;
  const a = Math.min(1, t * 2, (14 - t) / 2);
  const lines = TUTORIAL[mode] || TUTORIAL.kbm;
  const y = Math.round(mode === 'touch' ? H * 0.34 : H * 0.74);
  ctx.fillStyle = `rgba(0,0,0,${0.45 * a})`;
  ctx.fillRect(0, y - 6, W, lines.length * 11 + 10);
  lines.forEach((l, i) => drawText(ctx, l, W / 2, y + i * 11, { color: '#ffe0b0', align: 'center', alpha: a }));
}

function drawCrosshair(ctx, x, y, col, t) {
  const c = rgb(col);
  const s = 4 + Math.sin(t * 6) * 0.5;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(Math.round(x - s - 3), Math.round(y), 4, 2);
  ctx.fillRect(Math.round(x + s), Math.round(y), 4, 2);
  ctx.fillRect(Math.round(x), Math.round(y - s - 3), 2, 4);
  ctx.fillRect(Math.round(x), Math.round(y + s), 2, 4);
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x - s - 3), Math.round(y - 1), 3, 1);
  ctx.fillRect(Math.round(x + s), Math.round(y - 1), 3, 1);
  ctx.fillRect(Math.round(x - 1), Math.round(y - s - 3), 1, 3);
  ctx.fillRect(Math.round(x - 1), Math.round(y + s), 1, 3);
  ctx.fillRect(Math.round(x - 1), Math.round(y - 1), 1, 1);
}

export function touchButtons(W, H) {
  return [
    { id: 'dash', x: W - 34, y: Math.round(H * 0.56), r: 17, label: 'DASH' },
    { id: 'bomb', x: W - 34, y: Math.round(H * 0.56) - 44, r: 15, label: 'BOMB' },
    { id: 'pause', x: W - 96, y: 13, r: 10, label: 'II' },
  ];
}

function drawTouch(ctx, g, input, W, H) {
  const { move, aim, r } = input.stickInfo();
  const stick = (s, col) => {
    ctx.strokeStyle = rgb(col, 0.35);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.ox, s.oy, r, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = rgb(col, 0.35);
    ctx.beginPath();
    ctx.arc(s.x, s.y, 10, 0, TAU);
    ctx.fill();
  };
  if (move) stick(move, [255, 220, 160]);
  else drawText(ctx, 'MOVE', W * 0.2, H - 24, { color: 'rgba(255,255,255,0.25)', align: 'center', shadow: false });
  if (aim) stick(aim, [255, 120, 90]);
  else drawText(ctx, 'AIM + FIRE', W * 0.72, H - 24, { color: 'rgba(255,255,255,0.25)', align: 'center', shadow: false });
  const p = g.player;
  for (const b of touchButtons(W, H)) {
    const held = input.btnHeld.has(b.id);
    let ready = true;
    if (b.id === 'dash') ready = p.dashCd <= 0;
    if (b.id === 'bomb') ready = p.bombs > 0;
    ctx.fillStyle = held ? 'rgba(255,200,140,0.35)' : 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = ready ? 'rgba(255,210,150,0.6)' : 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (b.id === 'dash' && !ready) {
      ctx.strokeStyle = 'rgba(255,210,150,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r - 2, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - p.dashCd / p.stats.dashCd));
      ctx.stroke();
    }
    const label = b.id === 'bomb' ? `${b.label} ${p.bombs}` : b.label;
    drawText(ctx, label, b.x, b.y - 3, { color: ready ? '#ffe0c0' : '#7a6a5a', align: 'center' });
  }
}
