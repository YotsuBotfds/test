// Mode select: four voyage cards with lock states, best scores and today's Daily Squall modifiers.

import { Save } from '../../core/storage.js';
import { dateSeed } from '../../core/rng.js';
import { MODES, MODE_ORDER, MODIFIERS, dailyKey } from '../../content/modes.js';
import { h, frag, icon, frame, backBtn, glyph, sfx, kick, fmtInt, safe, txt } from '../dom.js';
import { gearSVG } from '../art.js';

const DETAILS = {
  campaign: ['5 stages', '5 bosses', 'Refits between'],
  endless: ['Endless waves', 'Boss every 5th wave'],
  daily: ['Seeded voyage', 'One best per day'],
  bossRush: ['5 bosses', 'Back to back'],
};

const GLYPH = { campaign: '⚓', endless: '∞', daily: '☼', bossRush: '☠' };

const LOCKS = {
  bossRush: 'Complete The Grand Voyage to unlock',
};

/** Today's Daily Squall best. game.js stores it under run.day = dailyKey() (UTC 'YYYY-MM-DD'). */
export function dailyBest() {
  const table = Save.data.highscores?.daily || {};
  return table[dailyKey(new Date())] || null;
}

export function bestFor(id) {
  const hs = Save.data.highscores || {};
  if (id === 'daily') return dailyBest()?.score || 0;
  const list = hs[id];
  return Array.isArray(list) && list.length ? list[0].score || 0 : 0;
}

export function todaySeed() {
  return safe(() => MODES.daily.seed(new Date()), null) ?? dateSeed(new Date());
}

export function todayModifiers() {
  const ids = safe(() => MODES.daily.modifiers(todaySeed()), []) || [];
  return ids.map((id) => MODIFIERS[id] || { id, name: id, desc: '' });
}

export default function build(ui) {
  const cards = [];
  const order = (MODE_ORDER || Object.keys(MODES)).filter((id) => MODES[id]);
  for (const id of order) {
    const m = MODES[id];
    const unlocked = safe(() => m.unlocked?.(Save.data) ?? true, true);
    const best = bestFor(id);
    const extra = [];
    if (id === 'daily') {
      const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
      extra.push(h('div', { class: 'mode-date' }, date));
      extra.push(
        h(
          'div',
          { class: 'mode-mods' },
          todayModifiers().map((mod) =>
            h('div', { class: 'modchip', title: txt(mod.desc) },
              h('b', null, mod.name), h('span', null, txt(mod.desc))),
          ),
        ),
      );
    }
    if (id === 'endless') {
      const w = Save.data.stats?.bestEndlessWave || 0;
      if (w) extra.push(h('div', { class: 'mode-date' }, `Furthest wave: ${w}`));
    }
    const card = h(
      'button',
      {
        type: 'button',
        class: ['mode-card', `mode-${id}`, !unlocked && 'locked'],
        'aria-disabled': unlocked ? null : 'true',
        dataset: { id },
        onclick: () => pick(id, unlocked, card),
      },
      h('div', { class: 'mode-medal' }, frag(gearSVG(16, 'mode-gear', 0.62)), icon(m.icon || `icon_mode_${id}`, 96, { cls: 'mode-icon', glyph: GLYPH[id] || '✦' })),
      h('div', { class: 'mode-name' }, m.name || id),
      h('div', { class: 'mode-desc' }, txt(m.desc)),
      h('div', { class: 'mode-tags' }, (DETAILS[id] || []).map((t) => h('span', null, t))),
      ...extra,
      h(
        'div',
        { class: 'mode-best' },
        best ? [h('span', null, 'Best'), h('b', null, fmtInt(best))] : h('span', null, 'No voyage logged'),
      ),
      !unlocked
        ? h('div', { class: 'mode-lock' }, icon('icon_lock', 48, { glyph: '🔒', cls: 'lock-icon' }), h('span', null, txt(m.lockText) || LOCKS[id] || 'Locked'))
        : null,
    );
    cards.push(card);
  }

  function pick(id, unlocked, card) {
    if (!unlocked) {
      sfx('ui_error');
      kick(card, 'shake');
      return;
    }
    sfx('ui_select');
    ui.lastMode = id;
    ui.push('hangar', { mode: id });
  }

  const grid = h('div', { class: 'mode-grid' }, cards);
  const back = backBtn(() => {
    sfx('ui_back');
    ui.pop();
  });
  const f = frame({
    title: 'Choose Your Voyage',
    sub: 'Plot a course, Captain',
    body: grid,
    bodyCls: 'modes-body',
    footer: [back, h('div', { class: 'foot-hint' }, glyph('confirm'), ' Select voyage')],
  });
  const last = cards.find((c) => c.dataset.id === ui.lastMode) || cards[0];
  return { el: h('div', { class: 'modes-screen' }, f.el), focus: last };
}
