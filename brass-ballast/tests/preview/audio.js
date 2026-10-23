// WP7 audio bench. Interactive: buttons for every SFX / loop / music track, positional pad,
// stress barrage, live scope. ?check=1 renders every SFX & loop offline and logs
// '[test] {name, peak, rms, nan, silent}' lines plus a summary (read by tests/smoke.cjs).
import { audio } from '../../js/audio/audio.js';
import { SFX, LOOPS, SFX_GROUPS } from '../../js/audio/sfx.js';

const TRACKS = ['title', 'hangar', 'brassbay', 'smog', 'tempest', 'aurora', 'furnace', 'boss',
  'finalBoss', 'victory', 'gameover'];
// §4.17 contract — the check fails if any of these is missing.
const REQUIRED = ('ui_move ui_select ui_back ui_error ui_card ui_buy ui_unlock ui_toggle fire_cannon ' +
  'fire_gatling fire_blunderbuss fire_mortar fire_lance fire_harpoon tesla_zap rocket_launch flak_fire ' +
  'drone_fire mine_drop steam_vent broadside_fire saw_hit boost bomb_drop player_hit player_low ' +
  'shield_block revive level_up upgrade_pick evolve hit hit_crit hit_armor explode_small explode_medium ' +
  'explode_large explode_huge mortar_land burn enemy_shot enemy_cannon enemy_flak enemy_zap wasp_charge ' +
  'wraith_phase mortar_whistle carrier_launch tesla_hum pickup_xp pickup_cog pickup_repair pickup_steam ' +
  'pickup_bomb pickup_crate wave_start wave_clear boss_warning boss_roar boss_phase boss_death ' +
  'stage_clear game_over victory achievement thunder').split(' ');
const REQUIRED_LOOPS = ['engine_hum', 'wind_loop', 'rain_loop', 'lance_charge', 'saw_whirr'];

const q = new URLSearchParams(location.search);
const app = document.getElementById('app');
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'class') n.className = v;
    else n.setAttribute(k, v);
  }
  for (const k of kids) n.append(k);
  return n;
};

if (q.get('check') === '1') runCheck();
else buildBench();

// ---- Offline check ---------------------------------------------------------------------------

async function renderOne(name, isLoop) {
  const sr = 44100;
  const secs = isLoop ? 3 : name === 'boss_warning' || name === 'boss_death' || name === 'wave_start' ||
    name === 'thunder' || name === 'evolve' || name === 'victory' || name === 'game_over' ? 3.6 : 2.5;
  const ctx = new OfflineAudioContext(2, Math.floor(sr * secs), sr);
  if (isLoop) {
    const h = LOOPS[name](ctx, ctx.destination, { t: 0.02, pitch: 1 });
    h.pitch?.(1.3, 1.2);
    h.stop?.(2.9);
  } else {
    SFX[name](ctx, ctx.destination, { t: 0.02, pitch: 1 });
  }
  const buf = await ctx.startRendering();
  let peak = 0;
  let sum = 0;
  let nan = false;
  const n = buf.length;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) {
      const v = d[i];
      if (v !== v) {
        nan = true;
        continue;
      }
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
      sum += v * v;
    }
  }
  const rms = Math.sqrt(sum / (n * buf.numberOfChannels));
  return { buf, res: { name: isLoop ? `loop:${name}` : name, peak: +peak.toFixed(4), rms: +rms.toFixed(4), nan, silent: peak < 0.002 } };
}

function drawWave(canvas, buf, bad) {
  const w = (canvas.width = 420);
  const h = (canvas.height = 88);
  const g = canvas.getContext('2d');
  g.fillStyle = '#120c06';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(242,212,138,.25)';
  g.beginPath();
  g.moveTo(0, h / 2);
  g.lineTo(w, h / 2);
  g.stroke();
  const d0 = buf.getChannelData(0);
  const d1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : d0;
  const step = Math.ceil(d0.length / w);
  g.fillStyle = bad ? '#e0573a' : '#f2d48a';
  for (let x = 0; x < w; x++) {
    let mn = 0;
    let mx = 0;
    for (let i = x * step; i < Math.min(d0.length, (x + 1) * step); i++) {
      const v = (d0[i] + d1[i]) * 0.5;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    g.fillRect(x, h / 2 - mx * (h / 2), 1, Math.max(1, (mx - mn) * (h / 2)));
  }
}

async function runCheck() {
  const summaryEl = el('div', { id: 'summary' }, 'Rendering…');
  const grid = el('div', { id: 'check' });
  app.append(summaryEl, grid);
  const results = [];
  const missing = REQUIRED.filter((n) => typeof SFX[n] !== 'function')
    .concat(REQUIRED_LOOPS.filter((n) => typeof LOOPS[n] !== 'function').map((n) => `loop:${n}`));
  const names = Object.keys(SFX).map((n) => [n, false]).concat(Object.keys(LOOPS).map((n) => [n, true]));
  const t0 = performance.now();
  for (const [name, isLoop] of names) {
    let out;
    try {
      out = await renderOne(name, isLoop);
    } catch (err) {
      out = { buf: null, res: { name, peak: 0, rms: 0, nan: true, silent: true, error: String(err?.message || err) } };
    }
    const r = out.res;
    r.ok = !r.nan && !r.silent && r.peak <= 0.95 && !r.error;
    results.push(r);
    console.log('[test] ' + JSON.stringify(r));
    const cv = el('canvas');
    const cell = el('div', { class: r.ok ? 'cell' : 'cell bad' },
      el('div', { class: 'n' }, r.name),
      el('div', { class: 'm' }, `peak ${r.peak.toFixed(3)}  rms ${r.rms.toFixed(3)}${r.nan ? '  NaN!' : ''}${r.silent ? '  SILENT' : ''}${r.error ? '  ' + r.error : ''}`),
      cv);
    grid.append(cell);
    if (out.buf) drawWave(cv, out.buf, !r.ok);
  }
  const bad = results.filter((r) => !r.ok);
  const summary = {
    summary: true,
    count: results.length,
    failures: bad.map((r) => r.name),
    missing,
    maxPeak: Math.max(...results.map((r) => r.peak)),
    minPeak: Math.min(...results.map((r) => r.peak)),
    ms: Math.round(performance.now() - t0),
  };
  console.log('[test] ' + JSON.stringify(summary));
  const ok = !bad.length && !missing.length;
  summaryEl.className = ok ? 'ok' : 'fail';
  summaryEl.textContent = `${ok ? 'PASS' : 'FAIL'} — ${results.length} sounds rendered in ${summary.ms} ms, ` +
    `peaks ${summary.minPeak.toFixed(3)}..${summary.maxPeak.toFixed(3)}` +
    (bad.length ? `, failing: ${bad.map((r) => r.name).join(', ')}` : '') +
    (missing.length ? `, missing: ${missing.join(', ')}` : '');
  window.__audioCheck = summary;
}

// ---- Interactive bench -----------------------------------------------------------------------

function buildBench() {
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.BB = { audio };

  // Volumes
  const vols = el('div', { class: 'row' });
  for (const k of ['master', 'music', 'sfx']) {
    const r = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: audio.volumes[k] });
    r.addEventListener('input', () => audio.setVolumes({ [k]: Number(r.value) }));
    vols.append(el('label', {}, k, r));
  }
  const inten = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: 0 });
  inten.addEventListener('input', () => audio.setIntensity(Number(inten.value)));
  vols.append(el('label', {}, 'intensity', inten));
  const duckBtn = el('button', { onclick: () => audio.duck(0.7, 1.2) }, 'Duck music');
  vols.append(duckBtn);

  const left = el('div', {}, el('h2', {}, 'Mixer'), vols);
  const scope = el('canvas', { id: 'scope' });
  left.append(el('h2', {}, 'Scope'), scope);

  // Positional pad
  const pad = el('canvas', { id: 'pad', width: 340, height: 200 });
  let padSound = 'fire_cannon';
  const padSel = el('select');
  for (const n of Object.keys(SFX)) padSel.append(el('option', { value: n }, n));
  padSel.value = padSound;
  padSel.addEventListener('change', () => (padSound = padSel.value));
  const marks = [];
  pad.addEventListener('pointerdown', (e) => {
    const r = pad.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * 340;
    const py = ((e.clientY - r.top) / r.height) * 200;
    // Pad spans ±2400 world units horizontally.
    const x = ((px - 170) / 170) * 2400;
    const y = ((py - 100) / 100) * 1400;
    setTimeout(() => audio.play(padSound, { x, y }), 0);
    marks.push({ px, py, t: performance.now() });
  });
  const stats = el('div', { id: 'stats' });
  const right = el('div', {}, el('h2', {}, 'Positional pad (listener at centre)'),
    el('div', { class: 'row' }, padSel), pad,
    el('div', { class: 'row', style: 'margin-top:6px' },
      el('button', { onclick: barrage }, 'Stress barrage'),
      el('button', { onclick: () => audio.stopLoops(0.5) }, 'Stop loops')),
    stats);
  app.append(el('div', { id: 'top' }, left, right));

  // SFX groups
  for (const [group, names] of Object.entries(SFX_GROUPS)) {
    if (group === 'Loops') continue;
    const row = el('div', { class: 'row' });
    for (const n of names) {
      const b = el('button', {}, n);
      b.addEventListener('click', (e) => {
        setTimeout(() => {
          const opts = e.shiftKey ? { x: (Math.random() * 2 - 1) * 1800, y: (Math.random() * 2 - 1) * 900 } : {};
          audio.play(n, opts);
        }, 0);
        b.classList.add('flash');
        setTimeout(() => b.classList.remove('flash'), 120);
      });
      row.append(b);
    }
    app.append(el('h2', {}, group), row);
  }
  // XP streak demo — pitch rises with the chain like the game does.
  app.append(el('div', { class: 'row', style: 'margin-top:6px' },
    el('button', { onclick: () => xpStreak() }, 'pickup_xp streak'),
    el('button', { onclick: () => gatlingBurst() }, 'gatling burst'),
    el('button', { onclick: () => broadsideDuel() }, 'cannon duel L↔R')));

  // Loops
  app.append(el('h2', {}, 'Loops'));
  for (const n of Object.keys(LOOPS)) {
    let h = null;
    const vol = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: 0.6 });
    const pitch = el('input', { type: 'range', min: 0.5, max: 2, step: 0.01, value: 1 });
    const b = el('button', {}, n);
    b.addEventListener('click', () => {
      setTimeout(() => {
        if (h) {
          h.stop(0.4);
          h = null;
          b.classList.remove('on');
        } else {
          h = audio.loop(n, { vol: Number(vol.value), pitch: Number(pitch.value) });
          b.classList.add('on');
        }
      }, 0);
    });
    const upd = () => h?.set({ vol: Number(vol.value), pitch: Number(pitch.value) });
    vol.addEventListener('input', upd);
    pitch.addEventListener('input', upd);
    app.append(el('div', { class: 'loop' }, b, el('label', {}, 'vol', vol), el('label', {}, 'pitch', pitch)));
  }

  // Ambience beds (normally driven by stage:start)
  const arow = el('div', { class: 'row' });
  for (const b of ['brassbay', 'smog', 'tempest', 'aurora', 'furnace']) {
    arow.append(el('button', { onclick: () => setTimeout(() => audio.ambience(b), 0) }, b));
  }
  arow.append(el('button', { onclick: () => setTimeout(() => audio.ambience(null), 0) }, '■ none'));
  app.append(el('h2', {}, 'Ambience'), arow);

  // Music
  const mrow = el('div', { class: 'row' });
  for (const tr of TRACKS) {
    const b = el('button', {}, tr);
    b.addEventListener('click', () => setTimeout(() => {
      audio.music(tr, { fade: 1 });
      for (const x of mrow.children) x.classList.toggle('on', x === b);
    }, 0));
    mrow.append(b);
  }
  mrow.append(el('button', { onclick: () => setTimeout(() => {
    audio.music(null, { fade: 1 });
    for (const x of mrow.children) x.classList.remove('on');
  }, 0) }, '■ stop'));
  app.append(el('h2', {}, 'Music (WP8)'), mrow);

  if (q.get('play')) {
    audio.unlock();
    setTimeout(() => audio.play(q.get('play')), 100);
  }

  // Render loop: scope + pad + stats.
  const sg = scope.getContext('2d');
  const pg = pad.getContext('2d');
  let data = null;
  const frame = () => {
    const W = (scope.width = scope.clientWidth);
    const H = (scope.height = 120);
    sg.fillStyle = '#120c06';
    sg.fillRect(0, 0, W, H);
    const an = audio.getAnalyser();
    if (an) {
      if (!data || data.length !== an.fftSize) data = new Float32Array(an.fftSize);
      an.getFloatTimeDomainData(data);
      sg.strokeStyle = '#f2d48a';
      sg.beginPath();
      for (let i = 0; i < data.length; i++) {
        const x = (i / data.length) * W;
        const y = H / 2 - data[i] * (H / 2) * 0.95;
        if (i) sg.lineTo(x, y);
        else sg.moveTo(x, y);
      }
      sg.stroke();
    } else {
      sg.fillStyle = '#f2d48a';
      sg.fillText('click to unlock audio', 10, 20);
    }
    // Pad
    pg.fillStyle = '#120c06';
    pg.fillRect(0, 0, 340, 200);
    pg.strokeStyle = 'rgba(242,212,138,.25)';
    pg.beginPath();
    pg.arc(170, 100, (900 / 2400) * 170, 0, Math.PI * 2);
    pg.stroke();
    pg.beginPath();
    pg.arc(170, 100, (2000 / 2400) * 170, 0, Math.PI * 2);
    pg.stroke();
    pg.fillStyle = '#f2d48a';
    pg.fillRect(166, 96, 8, 8);
    const now = performance.now();
    for (let i = marks.length - 1; i >= 0; i--) {
      const m = marks[i];
      const a = 1 - (now - m.t) / 1000;
      if (a <= 0) {
        marks.splice(i, 1);
        continue;
      }
      pg.fillStyle = `rgba(224,87,58,${a})`;
      pg.beginPath();
      pg.arc(m.px, m.py, 6 + (1 - a) * 18, 0, Math.PI * 2);
      pg.fill();
    }
    stats.textContent = Object.entries(audio.stats())
      .map(([k, v]) => `${k.padEnd(10)} ${typeof v === 'number' ? +v.toFixed(2) : v}`)
      .join('\n');
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function barrage() {
  const names = ['hit', 'hit_crit', 'hit_armor', 'explode_small', 'explode_medium', 'fire_gatling', 'pickup_xp', 'enemy_shot'];
  for (let i = 0; i < 240; i++) {
    const n = names[i % names.length];
    audio.play(n, { delay: Math.random() * 2, x: (Math.random() * 2 - 1) * 1500, y: (Math.random() * 2 - 1) * 800 });
  }
}

function xpStreak() {
  for (let i = 0; i < 16; i++) audio.play('pickup_xp', { delay: i * 0.06, pitch: 1 + i * 0.045, exact: true });
}

function gatlingBurst() {
  for (let i = 0; i < 20; i++) audio.play('fire_gatling', { delay: i * 0.055 });
}

function broadsideDuel() {
  for (let i = 0; i < 6; i++) {
    audio.play(i % 2 ? 'enemy_cannon' : 'fire_cannon', { delay: i * 0.35, x: i % 2 ? 700 : -700, y: 0 });
  }
}
