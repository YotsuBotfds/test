// WP8 music preview. Interactive: track buttons, intensity lever (+ "battle" auto-sweep),
// volume, layer meters, live piano roll of scheduled notes and a scope.
//   ?check=1            renders ~8 s of every track offline (intensity 1 and 0) plus transition
//                       scenarios via OfflineAudioContext + renderAhead, logging
//                       '[test] {track, peak, rms, nan, notes}' lines and a summary.
//   ?check=mix&track=x  per-channel solo RMS for one track (mix balancing aid).
//   ?track=x&i=0.7      autoplay a track at an intensity (needs autoplay permission).
import { Music } from '../../js/audio/music.js';
import { TRACKS } from '../../js/audio/music-tracks.js';
import { lintTrack } from '../../js/audio/music-composer.js';

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
const NAMES = Music.tracks;
const KEYNAME = (d) => `${d.key} ${d.mode}`;
const METER = (d) => (d.sub === 3 ? `${d.beats * 3}/8` : `${d.beats}/4`);

const INST_COLOR = {
  musicbox: '#f7e7b4', glock: '#bfe8ff', accordion: '#e6a85c', brass: '#f2c94c', tuba: '#b5793a',
  pizz: '#d9a7e0', strings: '#e88b7a', organ: '#9fd36b', flute: '#a8e6cf', whistle: '#ffffff',
  bell: '#ffd36e', kick: '#7a5a3a', snare: '#a08060', hat: '#806a50', tick: '#c8b890', hiss: '#8aa0a8',
  anvil: '#d0d8e0', timpani: '#c76b3a', tom: '#a5523a', crash: '#e0d8c0',
};

const SR = 44100;

if (q.get('check') === '1') runCheck();
else if (q.get('check') === 'mix') runMix(q.get('track') || 'brassbay');
else if (q.get('check') === 'wav') runWav(q.get('track') || 'title', Number(q.get('i') ?? 1), Number(q.get('secs') || 20));
else buildHall();

// ---- Offline helpers --------------------------------------------------------------------------

function analyse(buf) {
  let peak = 0;
  let sum = 0;
  let nan = false;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
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
  const rms = Math.sqrt(sum / (buf.length * buf.numberOfChannels));
  return { peak: +peak.toFixed(4), rms: +rms.toFixed(4), nan };
}

/** Render `secs` of a track at intensity `inten`; `script` may add mid-render actions. */
async function renderTrack(track, secs, inten, script) {
  const ctx = new OfflineAudioContext(2, Math.floor(SR * secs), SR);
  const m = new Music({ ctx, out: ctx.destination });
  m.setIntensity(inten);
  m.play(track, { fade: 0, seed: 7 });
  if (script) await script(ctx, m);
  // Schedule incrementally like the live 25 ms timer would (x.25 / x.75 s avoid script suspends).
  m.renderAhead(0.6);
  for (let t = 0.25; t < secs - 0.1; t += 0.5) {
    ctx.suspend(t).then(() => {
      m.renderAhead(0.6);
      ctx.resume();
    });
  }
  const buf = await ctx.startRendering();
  return { buf, m };
}

function drawWave(canvas, buf, bad) {
  const w = (canvas.width = 460);
  const h = (canvas.height = 80);
  const g = canvas.getContext('2d');
  g.fillStyle = '#120c06';
  g.fillRect(0, 0, w, h);
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

// ---- ?check=1 ---------------------------------------------------------------------------------

async function runCheck() {
  const summaryEl = el('div', { id: 'summary' }, 'Rendering…');
  const grid = el('div', { id: 'check' });
  app.append(summaryEl, grid);
  const results = [];
  const t0 = performance.now();
  const lint = [];
  for (const n of NAMES) for (const l of lintTrack(TRACKS[n])) lint.push(`${n}: ${l}`);

  const report = (r, buf) => {
    r.ok = !r.nan && r.peak <= 0.9 && r.peak > 0.01 && r.rms > 0.004 && r.notes > 0 && !r.error;
    results.push(r);
    console.log('[test] ' + JSON.stringify(r));
    const cv = el('canvas');
    grid.append(el('div', { class: r.ok ? 'cell' : 'cell bad' },
      el('div', { class: 'n' }, `${r.track}${r.scenario ? ' · ' + r.scenario : ` @${r.intensity}`}`),
      el('div', { class: 'm' }, `peak ${r.peak.toFixed(3)}  rms ${r.rms.toFixed(3)}  notes ${r.notes}${r.nan ? '  NaN!' : ''}${r.error ? '  ' + r.error : ''}`),
      cv));
    if (buf) drawWave(cv, buf, !r.ok);
  };

  for (const inten of [1, 0]) {
    for (const track of NAMES) {
      try {
        const { buf, m } = await renderTrack(track, 8, inten);
        report({ track, intensity: inten, ...analyse(buf), notes: m.noteCount }, buf);
      } catch (err) {
        report({ track, intensity: inten, peak: 0, rms: 0, nan: true, notes: 0, error: String(err?.message || err) });
      }
    }
  }

  // Transitions: crossfade mid-render, intensity jumps, same-track replay, stop.
  const scenarios = {
    'crossfade brassbay→boss': async (ctx, m) => {
      ctx.suspend(3).then(() => {
        m.play('boss', { fade: 1.2 });
        ctx.resume();
      });
    },
    'intensity 0→1→0 (furnace)': async (ctx, m) => {
      m.play('furnace', { fade: 0, seed: 3 });
      ctx.suspend(2).then(() => {
        m.setIntensity(1);
        ctx.resume();
      });
      ctx.suspend(5).then(() => {
        m.setIntensity(0);
        ctx.resume();
      });
    },
    'same-track replay + stop': async (ctx, m) => {
      ctx.suspend(2).then(() => {
        m.play('brassbay', { fade: 1 });
        ctx.resume();
      });
      ctx.suspend(6).then(() => {
        m.stop(1.5);
        ctx.resume();
      });
    },
    'victory stinger over tempest': async (ctx, m) => {
      ctx.suspend(2.5).then(() => {
        m.play('victory', { fade: 0.8 });
        ctx.resume();
      });
    },
  };
  for (const [name, script] of Object.entries(scenarios)) {
    try {
      const base = name.includes('tempest') ? 'tempest' : 'brassbay';
      const { buf, m } = await renderTrack(base, 9, 0.6, script);
      const r = { track: m.track ?? 'stopped', scenario: name, intensity: 0.6, ...analyse(buf), notes: m.noteCount };
      if (name.includes('stop')) {
        // After stop (6 s + 1.5 s fade) the tail must be (nearly) silent.
        const d = buf.getChannelData(0);
        let tail = 0;
        for (let i = Math.floor(SR * 8.3); i < d.length; i++) tail = Math.max(tail, Math.abs(d[i]));
        r.tail = +tail.toFixed(4);
        r.notes = Math.max(r.notes, 1);
        if (tail > 0.05) r.error = 'tail not silent';
      }
      report(r, buf);
    } catch (err) {
      report({ track: '?', scenario: name, peak: 0, rms: 0, nan: true, notes: 0, error: String(err?.message || err) });
    }
  }

  // Robustness: API misuse must not throw.
  let misuse = null;
  try {
    const m0 = new Music({});
    m0.play('title');
    m0.setIntensity(NaN);
    m0.stop();
    const ctx = new OfflineAudioContext(2, SR, SR);
    const m1 = new Music({ ctx, out: ctx.destination });
    m1.play('nope');
    m1.setIntensity('x');
    m1.play(null);
    m1.stop(-5);
    m1.renderAhead(-1);
    m1.info();
  } catch (err) {
    misuse = String(err?.message || err);
  }

  const bad = results.filter((r) => !r.ok);
  const summary = {
    summary: true,
    count: results.length,
    failures: bad.map((r) => `${r.track}${r.scenario ? ':' + r.scenario : '@' + r.intensity}`),
    lint,
    misuse,
    maxPeak: Math.max(...results.map((r) => r.peak)),
    minRms: Math.min(...results.map((r) => r.rms)),
    ms: Math.round(performance.now() - t0),
  };
  console.log('[test] ' + JSON.stringify(summary));
  const ok = !bad.length && !lint.length && !misuse;
  summaryEl.className = ok ? 'ok' : 'fail';
  summaryEl.textContent = `${ok ? 'PASS' : 'FAIL'} — ${results.length} renders in ${summary.ms} ms, max peak ` +
    `${summary.maxPeak.toFixed(3)}${bad.length ? ', failed: ' + summary.failures.join(', ') : ''}` +
    `${lint.length ? ', lint: ' + lint.join('; ') : ''}${misuse ? ', threw: ' + misuse : ''}`;
  document.title = ok ? 'PASS' : 'FAIL';
}

// ---- ?check=mix -------------------------------------------------------------------------------

async function runMix(track) {
  if (track === 'all') {
    for (const n of NAMES) await runMix(n);
    return;
  }
  const def = TRACKS[track];
  if (!def) return app.append(`unknown track ${track}`);
  const out = el('div', { id: 'check' });
  app.append(el('h2', {}, `Channel balance — ${track} (solo RMS / peak, intensity 1, 8 s)`), out);
  const vols = Object.fromEntries(Object.entries(def.ch).map(([k, c]) => [k, c.vol]));
  const rows = [];
  for (const solo of Object.keys(def.ch)) {
    for (const k of Object.keys(def.ch)) def.ch[k].vol = k === solo ? vols[k] : 0;
    const { buf, m } = await renderTrack(track, 8, 1);
    const a = analyse(buf);
    const r = { track, channel: solo, inst: def.ch[solo].inst, layer: def.ch[solo].layer, ...a, notes: m.noteCount };
    rows.push(r);
    console.log('[test] ' + JSON.stringify(r));
    const cv = el('canvas');
    out.append(el('div', { class: 'cell' }, el('div', { class: 'n' }, `${solo} (${r.inst}, ${r.layer})`),
      el('div', { class: 'm' }, `rms ${a.rms.toFixed(4)}  peak ${a.peak.toFixed(3)}`), cv));
    drawWave(cv, buf, false);
  }
  for (const k of Object.keys(def.ch)) def.ch[k].vol = vols[k];
  document.title = 'DONE';
}

// ---- ?check=wav — render to a base64 16-bit stereo WAV on window.__wav (analysis tooling) -------

async function runWav(track, inten, secs) {
  const t0 = performance.now();
  const { buf, m } = await renderTrack(track, secs, inten);
  const ms = Math.round(performance.now() - t0);
  const n = buf.length;
  const bytes = new Uint8Array(44 + n * 4);
  const dv = new DataView(bytes.buffer);
  const str = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  dv.setUint32(4, 36 + n * 4, true);
  str(8, 'WAVEfmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 2, true);
  dv.setUint32(24, SR, true);
  dv.setUint32(28, SR * 4, true);
  dv.setUint16(32, 4, true);
  dv.setUint16(34, 16, true);
  str(36, 'data');
  dv.setUint32(40, n * 4, true);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  for (let i = 0; i < n; i++) {
    dv.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
    dv.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  window.__wav = btoa(bin);
  console.log('[test] ' + JSON.stringify({ wav: track, secs, ms, realtimeX: +((secs * 1000) / ms).toFixed(1), notes: m.noteCount, ...analyse(buf) }));
  document.title = 'DONE';
}

// ---- Interactive hall ---------------------------------------------------------------------------

function buildHall() {
  let ctx = null;
  let music = null;
  let analyser = null;
  let vol = null;
  const notes = [];
  const ensure = () => {
    if (ctx) return;
    ctx = new AudioContext({ latencyHint: 'interactive' });
    vol = ctx.createGain();
    vol.gain.value = Number(volIn.value);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    vol.connect(analyser).connect(ctx.destination);
    music = new Music({ ctx, out: vol });
    music.setIntensity(Number(intIn.value));
    music.onNote = (track, ch, inst, midi, t, d, v) => {
      notes.push({ track, ch, inst, midi, t, d, v });
      if (notes.length > 1500) notes.splice(0, 500);
    };
    window.music = music;
  };

  const trackRow = el('div', { id: 'tracks' });
  const buttons = {};
  for (const n of NAMES) {
    const d = TRACKS[n];
    const b = el('button', { class: 'trk' }, n, el('small', {}, `${KEYNAME(d)} · ${METER(d)} · ${d.tempo} bpm`));
    b.addEventListener('click', () => {
      ensure();
      ctx.resume();
      music.play(n, { fade: Number(fadeIn.value) });
      for (const [k, x] of Object.entries(buttons)) x.classList.toggle('on', k === n);
    });
    buttons[n] = b;
    trackRow.append(b);
  }

  const intIn = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: q.get('i') ?? 0.5 });
  const intVal = el('span', {}, '');
  intIn.addEventListener('input', () => {
    music?.setIntensity(Number(intIn.value));
  });
  const volIn = el('input', { type: 'range', min: 0, max: 1.5, step: 0.01, value: 0.9 });
  volIn.addEventListener('input', () => {
    if (vol) vol.gain.value = Number(volIn.value);
  });
  const fadeIn = el('input', { type: 'range', min: 0, max: 4, step: 0.1, value: 1.5 });
  const fadeVal = el('span', {}, '1.5 s');
  fadeIn.addEventListener('input', () => (fadeVal.textContent = `${fadeIn.value} s`));
  let sweep = false;
  const sweepBtn = el('button', { class: 'small' }, 'Battle sweep');
  sweepBtn.addEventListener('click', () => {
    sweep = !sweep;
    sweepBtn.classList.toggle('on', sweep);
  });
  const stopBtn = el('button', { class: 'small' }, '■ Stop');
  stopBtn.addEventListener('click', () => {
    music?.stop(Number(fadeIn.value));
    for (const x of Object.values(buttons)) x.classList.remove('on');
  });

  const meters = el('div', { id: 'meters' });
  const meterFill = {};
  for (const l of ['core', 'drums', 'counter', 'full', 'calm']) {
    const f = el('div', { class: 'fill' });
    meterFill[l] = f;
    meters.append(el('div', { class: 'meter' }, el('div', { class: 'lbl' }, l), el('div', { class: 'bar' }, f)));
  }
  const status = el('div', { id: 'status' }, 'Click a track to begin.');
  const roll = el('canvas', { id: 'roll' });
  const scope = el('canvas', { id: 'scope' });
  const legend = el('div', { id: 'legend' });
  for (const [k, c] of Object.entries(INST_COLOR)) legend.append(el('span', {}, el('i', { style: `background:${c}` }), k));

  app.append(
    el('h2', {}, 'Tracks'), trackRow,
    el('div', { class: 'row' },
      el('label', {}, 'Intensity', intIn, intVal), sweepBtn,
      el('label', {}, 'Crossfade', fadeIn, fadeVal),
      el('label', {}, 'Volume', volIn), stopBtn),
    meters, status,
    el('h2', {}, 'Piano roll (playhead at ⅓ — notes to the right are already scheduled)'), roll, legend, scope,
  );

  const rg = roll.getContext('2d');
  const sg = scope.getContext('2d');
  let data = null;
  let lastSweep = 0;
  const frame = (ms) => {
    requestAnimationFrame(frame);
    if (sweep && music && ms - lastSweep > 500) {
      lastSweep = ms;
      // A pretend battle: waves of pressure with jitter, like game.js sends every 0.5 s.
      const v = Math.max(0, Math.min(1, 0.5 + 0.45 * Math.sin(ms / 9000) + (Math.random() - 0.5) * 0.15));
      intIn.value = v.toFixed(2);
      music.setIntensity(v);
    }
    intVal.textContent = Number(intIn.value).toFixed(2);
    const W = (roll.width = roll.clientWidth * devicePixelRatio);
    const H = (roll.height = roll.clientHeight * devicePixelRatio);
    rg.fillStyle = '#120c06';
    rg.fillRect(0, 0, W, H);
    // Octave lines.
    const lo = 24;
    const hi = 104;
    const yOf = (m) => H - ((m - lo) / (hi - lo)) * H;
    rg.strokeStyle = 'rgba(242,212,138,.08)';
    for (let m = 24; m <= hi; m += 12) {
      rg.beginPath();
      rg.moveTo(0, yOf(m));
      rg.lineTo(W, yOf(m));
      rg.stroke();
    }
    if (ctx && music) {
      const now = ctx.currentTime;
      const span = 8;
      const x0 = W / 3;
      const xOf = (t) => x0 + ((t - now) / span) * W;
      const nh = Math.max(2, H / (hi - lo));
      for (const n of notes) {
        const x = xOf(n.t);
        if (x > W || x + 40 < 0) continue;
        const perc = !n.midi || ['kick', 'snare', 'hat', 'tick', 'hiss', 'anvil', 'tom', 'crash'].includes(n.inst);
        const y = perc ? H - nh * 1.5 - (['kick', 'tom', 'snare', 'hat', 'tick', 'hiss', 'anvil', 'crash'].indexOf(n.inst) * nh * 1.2) : yOf(n.midi);
        rg.globalAlpha = 0.35 + 0.65 * Math.min(1, n.v);
        rg.fillStyle = INST_COLOR[n.inst] || '#fff';
        const w = Math.max(2, (Math.min(n.d, 3) / span) * W);
        rg.fillRect(x, y - nh / 2, w, nh);
      }
      rg.globalAlpha = 1;
      rg.strokeStyle = '#f2d48a';
      rg.beginPath();
      rg.moveTo(x0, 0);
      rg.lineTo(x0, H);
      rg.stroke();
      const info = music.info();
      for (const [k, f] of Object.entries(meterFill)) f.style.width = `${Math.round((info.layers?.[k] ?? 0) * 100)}%`;
      status.textContent = info.track
        ? `track ${info.track}  section ${info.section}  bar ${info.bar + 1}  tempo ${info.tempo}  ` +
          `effective ${info.effective}  notes ${info.notes}  fading ${info.dying}  ctx ${ctx.state}`
        : `stopped (fading ${info.dying})`;
      // Scope
      const SW = (scope.width = scope.clientWidth * devicePixelRatio);
      const SH = (scope.height = scope.clientHeight * devicePixelRatio);
      sg.fillStyle = '#120c06';
      sg.fillRect(0, 0, SW, SH);
      if (!data) data = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(data);
      sg.strokeStyle = '#f2d48a';
      sg.beginPath();
      for (let i = 0; i < data.length; i++) {
        const x = (i / data.length) * SW;
        const y = SH / 2 - data[i] * SH * 0.45;
        if (i) sg.lineTo(x, y);
        else sg.moveTo(x, y);
      }
      sg.stroke();
    }
  };
  requestAnimationFrame(frame);

  const auto = q.get('track');
  if (auto && TRACKS[auto]) setTimeout(() => buttons[auto].click(), 50);
}
