// Achievements: a cabinet of medals. Secret medals stay hidden until earned.

import { Save } from '../../core/storage.js';
import { Sprites } from '../../gfx/sprites.js';
import { ACHIEVEMENTS } from '../../content/achievements.js';
import { h, frag, frame, backBtn, sfx, icon, txt, kick } from '../dom.js';
import { medalSVG, gaugeSVG } from '../art.js';

function when(v) {
  const t = typeof v === 'number' ? v : typeof v === 'object' && v ? v.time || v.at || v.date : null;
  if (!t || t < 1e11) return '';
  try {
    return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

export default function build(ui) {
  const list = Array.isArray(ACHIEVEMENTS) ? ACHIEVEMENTS : [];
  const got = Save.data.achievements || {};
  const earned = list.filter((a) => got[a.id]).length;
  const tiers = ['bronze', 'silver', 'gold'];
  const medals = list.map((a, i) => {
    const has = !!got[a.id];
    const hidden = a.secret && !has;
    const tier = a.tier || (/gold/.test(a.icon || '') ? 'gold' : /silver/.test(a.icon || '') ? 'silver' : /bronze/.test(a.icon || '') ? 'bronze' : tiers[i % 3]);
    let art;
    if (!hidden && a.icon && Sprites.has(a.icon)) art = icon(a.icon, 96, { cls: 'medal-art' });
    else {
      art = frag(medalSVG(tier));
      art.classList.add('medal-art');
    }
    const b = h(
      'button',
      {
        type: 'button',
        class: ['medal', has ? 'earned' : 'unearned', hidden && 'secret', `tier-${tier}`],
        'aria-label': hidden ? 'Secret achievement' : `${a.name}: ${txt(a.desc)}${has ? ' (earned)' : ''}`,
      },
      h('span', { class: 'medal-disc' }, art, has ? null : h('span', { class: 'medal-lock' }, hidden ? '?' : '')),
      h('span', { class: 'medal-name' }, hidden ? 'Secret Medal' : a.name),
      h('span', { class: 'medal-desc' }, hidden ? 'A deed yet to be uncovered…' : txt(a.desc)),
      has && when(got[a.id]) ? h('span', { class: 'medal-date' }, when(got[a.id])) : null,
    );
    b.addEventListener('click', () => {
      sfx(has ? 'ui_select' : 'ui_error', { vol: 0.5 });
      kick(b, has ? 'shine' : 'shake');
    });
    return b;
  });

  const pct = list.length ? earned / list.length : 0;
  const summary = h(
    'div',
    { class: 'ach-summary' },
    h('div', { class: 'ach-gauge', html: gaugeSVG(pct, 'HONOUR') }),
    h('div', { class: 'ach-count' }, h('b', null, `${earned}`), h('span', null, ` of ${list.length} medals`)),
  );

  const f = frame({
    title: 'Hall of Honours',
    sub: `${Math.round(pct * 100)}% of all medals earned`,
    right: summary,
    body: h('div', { class: 'medal-grid' }, medals),
    bodyCls: 'ach-body',
    footer: [
      backBtn(() => {
        sfx('ui_back');
        ui.pop();
      }),
    ],
  });
  const firstEarned = medals.find((m) => m.classList.contains('earned'));
  return { el: h('div', { class: 'ach-screen' }, f.el), focus: firstEarned || medals[0] };
}
