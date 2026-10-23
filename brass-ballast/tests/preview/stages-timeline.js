// WP20 preview: renders every stage's wave schedules, the Endless generator and the Daily calendar.
import { STAGES, ENEMY_IDS, validateStages, validateWave, groupEnd } from '../../js/content/stages.js';
import { MODES, MODIFIERS, endlessBudget } from '../../js/content/modes.js';
import { RNG } from '../../js/core/rng.js';

const COLORS = {
  gyroScout: '#c9b27a', kiteBomber: '#e08a4a', balloonMine: '#d24a4a', gunboat: '#8a9aa8',
  clockWasp: '#ffd040', flakIsland: '#9a7a5a', carrier: '#b0b8c0', teslaBuoy: '#c070ff',
  frigate: '#6a7a9a', ornithopter: '#40c0d0', steamWraith: '#e0f0ff', mortarBarge: '#a06040',
};
const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

$('legend').innerHTML = ENEMY_IDS.map((t) => `<span><i style="background:${COLORS[t]}"></i>${t}</span>`).join('');

const problems = validateStages();
$('status').innerHTML = Object.keys(problems).length
  ? `<div class="err">Problems: ${JSON.stringify(problems)}</div>`
  : '<div class="ok">All 25 campaign waves validate (types, batches ≤ maxAlive, schedules inside duration).</div>';

function waveCard(w, label) {
  const card = el('div', `wave${w.setPiece ? ' set' : ''}`);
  const total = w.groups.reduce((a, g) => a + g.count, 0);
  const elites = w.groups.filter((g) => g.elite).reduce((a, g) => a + g.count, 0);
  const trickle = w.trickle ? Object.entries(w.trickle.pool).map(([k, v]) => `${k}×${v}`).join(', ') + ` / ${w.trickle.every}s` : 'none';
  card.appendChild(el('div', 'head',
    `<b>${label} — ${w.name || '?'}</b>${w.setPiece ? '<span class="tag">SET-PIECE</span>' : ''}` +
    `<span class="meta">${w.duration}s · maxAlive ${w.maxAlive} · ${total} scheduled${elites ? ` (${elites} elite)` : ''} · trickle ${trickle}${w.budget ? ` · budget ${w.budget}` : ''}</span>`));
  if (w.desc) card.appendChild(el('div', 'desc', w.desc));
  const probs = validateWave(w);
  if (probs.length) card.appendChild(el('div', 'err', probs.join('; ')));
  const lanes = el('div', 'lanes');
  const pct = (t) => `${(t / w.duration) * 100}%`;
  for (const g of w.groups) {
    const lane = el('div', 'lane');
    const lbl = el('span', 'lbl', `${g.type} ×${g.count} ${g.formation}${g.elite ? ` ★${g.elite === true ? '' : g.elite}` : ''}`);
    lbl.style.left = '-124px';
    lane.appendChild(lbl);
    const bar = el('div', 'bar');
    bar.style.left = pct(g.start);
    bar.style.width = `max(2px, ${pct(groupEnd(g) - g.start)})`;
    bar.style.background = COLORS[g.type] || '#888';
    bar.style.opacity = '.35';
    lane.appendChild(bar);
    let left = g.count;
    for (let t = g.start; left > 0; t += g.every) {
      const n = Math.min(g.batch, left);
      left -= n;
      const d = el('div', `dot${g.elite ? ' elite' : ''}`, String(n));
      d.style.left = pct(t);
      d.style.width = `${Math.max(6, 4 + String(n).length * 6)}px`;
      d.style.background = COLORS[g.type] || '#888';
      lane.appendChild(d);
    }
    lanes.appendChild(lane);
  }
  card.appendChild(lanes);
  return card;
}

const host = $('stages');
STAGES.forEach((s, i) => {
  host.appendChild(el('h2', '', `Stage ${i + 1}: ${s.name} <span class="meta">(${s.id} · boss ${s.boss} · hp×${s.hpMult} dmg×${s.dmgMult} xp×${s.xpMult} elite ${(s.eliteChance * 100).toFixed(0)}% · new: ${(s.newEnemies || []).join(', ') || 'everything'})</span>`));
  if (s.blurb) host.appendChild(el('div', 'desc', s.blurb));
  s.waves.forEach((w, k) => host.appendChild(waveCard(w, `Wave ${k + 1}`)));
});

// ---- Endless -------------------------------------------------------------------------------
const E = MODES.endless;
const rng = new RNG(20261023);
const run = {};
const rows = [];
const eh = $('endless');
for (let i = 1; i <= 30; i++) {
  const boss = E.bossFor(i);
  const st = E.stageFor?.(i);
  if (boss) {
    eh.appendChild(el('div', 'wave set', `<b>Wave ${i} — BOSS: ${boss}</b> <span class="meta">biome ${E.biomeFor(i)} · boss hp×${E.bossHpMult(i).toFixed(2)}</span>`));
    rows.push({ i, n: 0, b: endlessBudget(i), hp: st?.hpMult || 1 });
    continue;
  }
  const w = E.makeWave(i, rng, run);
  rows.push({ i, n: w.groups.reduce((a, g) => a + g.count, 0), b: endlessBudget(i), hp: st?.hpMult || 1 });
  eh.appendChild(waveCard(w, `Wave ${i} <span class="meta">[${E.biomeFor(i)} · hp×${(st?.hpMult || 1).toFixed(2)} · elite ${((st?.eliteChance || 0) * 100).toFixed(0)}%]</span>`));
}

// Budget / count / hp curves.
const cv = $('budget');
const c = cv.getContext('2d');
c.fillStyle = '#2a1f17';
c.fillRect(0, 0, cv.width, cv.height);
const maxB = 340;
const X = (i) => 30 + ((i - 1) / 59) * (cv.width - 40);
const Y = (v, m) => cv.height - 20 - (v / m) * (cv.height - 40);
const curve = (fn, m, col) => {
  c.strokeStyle = col;
  c.lineWidth = 2;
  c.beginPath();
  for (let i = 1; i <= 60; i++) c[i === 1 ? 'moveTo' : 'lineTo'](X(i), Y(fn(i), m));
  c.stroke();
};
curve(endlessBudget, maxB, '#e0b04a');
curve((i) => E.stageFor(i).hpMult, 18, '#ff6a4a');
curve((i) => E.stageFor(i).eliteChance * 100, 40, '#ffd860');
c.fillStyle = '#c070ff';
for (const r of rows) if (r.n) c.fillRect(X(r.i) - 2, Y(r.n, 200) - 2, 4, 4);
c.fillStyle = '#f3e3c3';
c.font = '12px Georgia';
c.fillText('gold: budget (0–340) · red: hp mult (0–18) · yellow: elite % (0–40) · violet: enemies scheduled (0–200) · x: waves 1–60', 34, 16);

// ---- Daily -----------------------------------------------------------------------------------
const tbl = el('table');
tbl.innerHTML = '<tr><th>date</th><th>seed</th><th>modifiers</th><th>stage order</th></tr>';
for (let d = 0; d < 7; d++) {
  const date = new Date(Date.now() + d * 86400000);
  const info = MODES.daily.describe(date);
  const mods = info.modifiers.map((id) => `<b>${MODIFIERS[id]?.name}</b> <span class="meta">${MODIFIERS[id]?.desc}</span>`).join('<br>');
  const order = info.stages.map((ix) => STAGES[ix].name).join(' → ');
  const tr = el('tr', '', `<td>${info.key}</td><td>${info.seed}</td><td>${mods}</td><td>${order}</td>`);
  tbl.appendChild(tr);
}
$('daily').appendChild(tbl);
window.__ready = true;
