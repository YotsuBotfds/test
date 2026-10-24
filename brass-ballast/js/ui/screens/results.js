// Results: victory/defeat banner, animated stat tally, cogs banked, records, medals, unlocks.

import { Save } from '../../core/storage.js';
import { Sprites } from '../../gfx/sprites.js';
import { MODES } from '../../content/modes.js';
import { ACHIEVEMENTS } from '../../content/achievements.js';
import * as Lore from '../../content/codex.js';
import { h, frag, icon, btn, cog, sfx, fmtInt, fmtTime, reducedMotion, txt } from '../dom.js';
import { laurelSVG, gearSVG, medalSVG } from '../art.js';

export default function build(ui, params) {
  const s = params.summary || {};
  const game = ui.game;
  const win = !!s.victory;
  const mode = MODES?.[s.mode];
  const quips = Array.isArray(Lore.DEATH_QUIPS) && Lore.DEATH_QUIPS.length ? Lore.DEATH_QUIPS : ['The sky is a harsh mistress.'];
  const quip = win
    ? 'The Iron Syndicate’s armada lies in smoking ruin.'
    : txt(quips[Math.floor(Math.random() * quips.length)]);

  // [label, value, format, emphasis]
  const rows = [
    ['Score', s.score || 0, fmtInt, true],
    ['Time aloft', s.time || 0, fmtTime],
    ['Furthest skies', s.stageReached || 0, (v) => (s.mode === 'endless' ? `Wave ${fmtInt(s.wave || v)}` : s.mode === 'bossRush' ? `Titan ${fmtInt(v)} of 5` : `Stage ${fmtInt(v)}`)],
    ['Level reached', s.level || 1, fmtInt],
    ['Foes downed', s.kills || 0, fmtInt],
    ['Bosses sunk', s.bossKills || 0, fmtInt],
    // run.bestCombo is the longest kill chain; the score multiplier it reached is 1 + 0.1/kill (max ×5).
    ['Best chain', s.bestCombo || 0, (v) => {
      const n = Math.round(Number(v) || 0);
      return n ? `${n} (×${Math.min(5, 1 + 0.1 * n).toFixed(1).replace(/\.0$/, '')})` : '—';
    }],
    ['Damage dealt', s.damageDealt || 0, fmtInt],
    ['Damage taken', s.damageTaken || 0, fmtInt],
  ];
  const rowEls = rows.map(([label, value, fmt, em]) => {
    const v = h('dd', null, fmt(0));
    const r = h('div', { class: ['lrow', 'tally', em && 'em'] }, h('dt', null, label), h('dd', { class: 'dots' }), v);
    return { r, v, value: Number(value) || 0, fmt };
  });
  const ledger = h('dl', { class: 'ledger results-ledger' }, rowEls.map((x) => x.r));

  const cogNum = h('b', { class: 'bank-num' }, '+0');
  const bank = h(
    'div',
    { class: 'bank' },
    h('div', { class: 'bank-cog' }, frag(gearSVG(14, 'bank-gear', 0.36)), cog('bank-glyph')),
    h('div', { class: 'bank-text' }, h('span', null, 'Cogs banked'), cogNum, h('small', null, `Purse: ${fmtInt(Save.meta.cogs || 0)}`)),
  );

  const record = s.newHighScore
    ? h('div', { class: 'record-stamp' }, h('span', null, 'New'), h('b', null, 'Record!'))
    : null;

  // Stamped on the Score row's dotted leader: it marks the score without covering any row.
  if (record) {
    const dots = rowEls[0].r.querySelector('.dots');
    dots.classList.add('has-stamp');
    dots.append(record);
  }

  const achList = (s.achievements || [])
    .map((id) => (typeof id === 'object' ? id : ACHIEVEMENTS.find((a) => a.id === id)))
    .filter(Boolean);
  const achBox = achList.length
    ? h(
        'div',
        { class: 'res-block' },
        h('h3', null, 'Medals earned'),
        h('div', { class: 'res-medals' }, achList.map((a) => {
          const art = a.icon && Sprites.has(a.icon) ? icon(a.icon, 48, { cls: 'res-medal-icon' }) : frag(medalSVG('gold'));
          return h('div', { class: 'res-medal', title: txt(a.desc) }, art, h('span', null, a.name));
        })),
      )
    : null;
  const unlocks = (s.unlocks || []).filter(Boolean);
  const unlockBox = unlocks.length
    ? h('div', { class: 'res-block' }, h('h3', null, 'Unlocked'), h('ul', { class: 'res-unlocks' }, unlocks.map((u) => h('li', null, txt(u)))))
    : null;

  const leave = (then) => {
    try {
      params.onMenu?.();
    } catch (err) {
      console.error('[ui] onMenu failed', err);
    }
    then();
  };
  const bRetry = btn('Sail Again', () => {
    sfx('ui_select');
    ui.hide();
    try {
      if (params.onRetry) params.onRetry();
      else game?.restart?.();
    } catch (err) {
      console.error('[ui] retry failed', err);
    }
  }, { kind: 'launch' });
  const bHangar = btn('Hangar', () => {
    sfx('ui_select');
    leave(() => ui.showPath([['title', { focus: 'sail' }], ['modes'], ['hangar', { mode: s.mode || ui.lastMode }]]));
  });
  const bTitle = btn('Title', () => {
    sfx('ui_back');
    leave(() => {
      if (ui.current !== 'title') ui.show('title');
    });
  }, { kind: 'ghost' });

  const banner = h(
    'div',
    { class: ['res-banner', win ? 'win' : 'loss'] },
    win ? frag(laurelSVG('left')) : null,
    h('div', { class: 'res-banner-text' },
      h('h1', { class: 'res-title', 'data-text': win ? 'Victory' : 'Shot Down' }, win ? 'Victory' : 'Shot Down'),
      h('div', { class: 'res-sub' }, mode?.name ? h('b', null, mode.name) : null, mode?.name ? ' · ' : null, quip)),
    win ? frag(laurelSVG('right')) : null,
  );

  const el = h(
    'div',
    { class: ['results-screen', win ? 'is-win' : 'is-loss'] },
    banner,
    h(
      'div',
      { class: 'res-board' },
      h('div', { class: 'res-ledger parchment' }, h('h2', { class: 'engraved' }, h('span', null, 'Ship’s Log')), ledger),
      h('div', { class: 'res-side' }, bank, achBox, unlockBox),
    ),
    h('div', { class: 'res-foot' }, bTitle, bHangar, bRetry),
  );

  // -------------------------------------------------------------- tally animation
  let raf = 0;
  let done = false;
  let t0 = 0;
  const STEP = 0.16;
  const DUR = 0.55;
  const cogTarget = Number(s.cogsEarned) || 0;
  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    for (const x of rowEls) {
      x.r.classList.add('shown');
      x.v.textContent = x.fmt(x.value);
    }
    cogNum.textContent = `+${fmtInt(cogTarget)}`;
    bank.classList.add('shown');
    if (record) {
      record.classList.add('stamped');
      sfx('ui_unlock');
    }
  };
  let lastRow = -1;
  const tick = (now) => {
    if (!t0) t0 = now;
    const t = (now - t0) / 1000;
    rowEls.forEach((x, i) => {
      const k = Math.max(0, Math.min(1, (t - i * STEP) / DUR));
      if (k > 0) {
        x.r.classList.add('shown');
        if (i > lastRow) {
          lastRow = i;
          sfx('ui_move', { vol: 0.35, pitch: 0.9 + i * 0.06 });
        }
      }
      x.v.textContent = x.fmt(x.value * (1 - (1 - k) ** 3));
    });
    const kc = Math.max(0, Math.min(1, (t - rowEls.length * STEP) / 0.8));
    if (kc > 0) bank.classList.add('shown');
    cogNum.textContent = `+${fmtInt(cogTarget * (1 - (1 - kc) ** 2))}`;
    if (kc >= 1) {
      finish();
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  if (reducedMotion()) finish();
  else raf = requestAnimationFrame(tick);
  ledger.addEventListener('click', finish);

  return {
    el,
    focus: bRetry,
    onConfirm() {
      if (!done) {
        finish();
        return true;
      }
      return false;
    },
    back() {
      ui.nav.focus(bTitle, true);
    },
    destroy() {
      cancelAnimationFrame(raf);
    },
  };
}
