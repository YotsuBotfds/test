// Settings: every Save.settings key (DESIGN §4.12, §8), applied live.

import { Save } from '../../core/storage.js';
import { audio } from '../../audio/audio.js';
import { h, frame, backBtn, btn, glyph, sfx } from '../dom.js';

const GROUPS = [
  {
    title: 'Sound',
    rows: [
      { key: 'master', type: 'range', label: 'Master volume', min: 0, max: 1, step: 0.05, pct: true },
      { key: 'music', type: 'range', label: 'Music', desc: 'Brass band & accordion', min: 0, max: 1, step: 0.05, pct: true },
      { key: 'sfx', type: 'range', label: 'Effects', desc: 'Cannons, bells & boilers', min: 0, max: 1, step: 0.05, pct: true },
    ],
  },
  {
    title: 'Spectacle',
    rows: [
      { key: 'shake', type: 'range', label: 'Screen shake', min: 0, max: 1.5, step: 0.1, pct: true },
      { key: 'flashes', type: 'toggle', label: 'Flashing effects', desc: 'Off reduces lightning & bright flashes' },
      { key: 'damageNumbers', type: 'toggle', label: 'Damage numbers' },
      { key: 'quality', type: 'choice', label: 'Graphics quality', options: [['high', 'High'], ['low', 'Low']], desc: 'Low: fewer particles, lighter rendering' },
      { key: 'showFps', type: 'toggle', label: 'Frame counter' },
    ],
  },
  {
    title: 'Helm & Controls',
    rows: [
      { key: 'autoFire', type: 'toggle', label: 'Auto-fire', desc: 'Cannons fire whenever you aim' },
      { key: 'aimAssist', type: 'toggle', label: 'Aim assist', desc: 'Gentle snap toward nearby foes' },
      { key: 'haptics', type: 'toggle', label: 'Rumble & haptics' },
      { key: 'leftHanded', type: 'toggle', label: 'Left-handed touch layout' },
      { key: 'touchOpacity', type: 'range', label: 'Touch controls opacity', min: 0.15, max: 1, step: 0.05, pct: true },
    ],
  },
];

export default function build(ui, params) {
  const game = ui.game;
  const content = h('div', { class: 'settings-grid' });
  let lastPing = 0;

  const apply = (key, value) => {
    Save.setSetting(key, value);
    try {
      game?.applySettings?.();
    } catch (err) {
      console.error('[ui] applySettings failed', err);
    }
    if (key === 'master' || key === 'music' || key === 'sfx') {
      const s = Save.settings;
      try {
        audio.setVolumes?.({ master: s.master, music: s.music, sfx: s.sfx });
      } catch {
        /* optional */
      }
    }
  };

  function rangeRow(r) {
    const val = h('output', { class: 'set-val' });
    const input = h('input', {
      type: 'range', min: r.min, max: r.max, step: r.step, id: `set-${r.key}`, 'aria-label': r.label,
    });
    const sync = () => {
      const v = Number(Save.settings[r.key] ?? r.min);
      input.value = String(v);
      paint(v);
    };
    const paint = (v) => {
      input.style.setProperty('--p', ((v - r.min) / (r.max - r.min)).toFixed(3));
      val.textContent = r.pct ? `${Math.round(v * 100)}%` : String(v);
    };
    input.addEventListener('input', () => {
      const v = Math.round(Number(input.value) / r.step) * r.step;
      const n = Number(v.toFixed(3));
      paint(n);
      apply(r.key, n);
      const now = performance.now();
      if (r.key !== 'music' && now - lastPing > 110) {
        lastPing = now;
        sfx('ui_toggle', { vol: 0.8 });
      }
    });
    sync();
    return h(
      'div',
      { class: 'set-row set-range' },
      h('label', { class: 'set-label', for: input.id }, r.label, r.desc ? h('small', null, r.desc) : null),
      h('div', { class: 'set-ctl' }, input, val),
    );
  }

  function toggleRow(r) {
    const b = h(
      'button',
      { type: 'button', class: 'switch', role: 'switch', 'aria-label': r.label },
      h('span', { class: 'sw-track' }, h('span', { class: 'sw-on' }, 'On'), h('span', { class: 'sw-off' }, 'Off'), h('span', { class: 'sw-knob' })),
    );
    const sync = () => b.setAttribute('aria-checked', String(!!Save.settings[r.key]));
    b.addEventListener('click', () => {
      apply(r.key, !Save.settings[r.key]);
      sync();
      sfx('ui_toggle');
    });
    sync();
    const row = h(
      'div',
      { class: 'set-row set-toggle' },
      h('div', { class: 'set-label' }, r.label, r.desc ? h('small', null, r.desc) : null),
      h('div', { class: 'set-ctl' }, b),
    );
    return row;
  }

  function choiceRow(r) {
    const buttons = r.options.map(([v, label]) =>
      h('button', {
        type: 'button', class: 'seg', dataset: { v },
        onclick: () => {
          apply(r.key, v);
          sync();
          sfx('ui_toggle');
        },
      }, label),
    );
    const sync = () => buttons.forEach((b) => b.setAttribute('aria-pressed', String(Save.settings[r.key] === b.dataset.v)));
    sync();
    return h(
      'div',
      { class: 'set-row set-choice' },
      h('div', { class: 'set-label' }, r.label, r.desc ? h('small', null, r.desc) : null),
      h('div', { class: 'set-ctl segs', role: 'group', 'aria-label': r.label }, buttons),
    );
  }

  function render() {
    const groups = GROUPS.map((g) =>
      h(
        'section',
        { class: 'set-group' },
        h('h2', { class: 'engraved set-h' }, h('span', null, g.title)),
        g.rows.map((r) => (r.type === 'range' ? rangeRow(r) : r.type === 'toggle' ? toggleRow(r) : choiceRow(r))),
      ),
    );
    const canFs = !!document.documentElement.requestFullscreen;
    const fsBtn = canFs
      ? btn(document.fullscreenElement ? 'Leave fullscreen' : 'Go fullscreen', async () => {
          sfx('ui_select');
          try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
          } catch {
            /* refused */
          }
          setTimeout(render, 120);
        }, { kind: 'small' })
      : null;
    const howBtn = btn('How to play', () => {
      sfx('ui_select');
      ui.push('howto');
    }, { kind: 'small' });
    const resetBtn = btn('Reset progress', async () => {
      sfx('ui_select');
      const ok = await ui.confirm({
        title: 'Scuttle all progress?',
        text: 'Cogs, unlocks, workshop upgrades, codex, medals and records will be lost to the sky. Settings return to defaults. This cannot be undone.',
        yes: 'Scuttle it',
        no: 'Keep my ship',
        danger: true,
      });
      if (!ok) return;
      Save.reset();
      try {
        game?.applySettings?.();
      } catch {
        /* ignore */
      }
      sfx('ui_back');
      ui.toast('All progress has been scuttled. Fair winds, new captain.', { kind: 'warning', title: 'Progress reset' });
      render();
      ui.refreshAll();
      ui.nav.focus(content.querySelector('button, input'));
    }, { kind: 'danger' });
    const data = h(
      'section',
      { class: 'set-group set-data' },
      h('h2', { class: 'engraved set-h' }, h('span', null, 'Ship’s Ledger')),
      h('div', { class: 'set-actions' }, fsBtn, howBtn, resetBtn),
      h('p', { class: 'set-note' }, 'Progress is saved on this device automatically.'),
    );
    content.replaceChildren(...groups, data);
  }
  render();

  const f = frame({
    title: 'Settings',
    sub: params.fromPause ? 'Voyage paused' : 'Trim the sails to your liking',
    body: content,
    bodyCls: 'settings-body',
    footer: [
      backBtn(() => {
        sfx('ui_back');
        Save.saveNow?.();
        ui.pop();
      }),
      h('div', { class: 'foot-hint' }, glyph('confirm'), ' Toggle   ◂ ▸ Adjust'),
    ],
  });
  const el = h('div', { class: ['settings-screen', params.fromPause && 'over-run'] }, f.el);
  return {
    el,
    focus: content.querySelector('input, button'),
    refresh: render,
  };
}
