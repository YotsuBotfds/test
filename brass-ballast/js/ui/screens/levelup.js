// Level-up / refit / crate card pick. Rarity-framed brass cards with icons, badges, level pips,
// number-key shortcuts, rerolls and a short input lockout so mashing can't mis-pick.

import { RARITY } from '../../config.js';
import { h, frag, icon, pips, glyph, sfx, kick, txt } from '../dom.js';
import { gearSVG } from '../art.js';

const LOCKOUT_MS = 350;

const KIND_LABEL = {
  passive: 'Upgrade',
  auxNew: 'Auxiliary system',
  auxLevel: 'Auxiliary system',
  primaryLevel: 'Calibration',
  evolution: 'Evolution',
  repair: 'Supplies',
  cogs: 'Supplies',
};

function badgeFor(card) {
  const lv = card.level || 1;
  if (card.kind === 'evolution') return ['EVOLUTION', 'evo'];
  if (card.kind === 'repair' || card.kind === 'cogs') return ['SUPPLIES', 'sup'];
  if (card.kind === 'auxNew' || (card.kind === 'passive' && lv <= 1)) return ['NEW', 'new'];
  if (card.kind === 'primaryLevel') return [`CALIBRATE ${lv - 1} → ${lv}`, 'lvl'];
  return [`LEVEL ${lv - 1} → ${lv}`, 'lvl'];
}

export default function build(ui, params) {
  let raw = params.cards;
  let cards = Array.isArray(raw) ? raw.filter(Boolean) : [];
  let rerolls = Math.max(0, params.rerolls | 0);
  let lockUntil = performance.now() + LOCKOUT_MS;
  let picked = false;
  let elements = [];

  const row = h('div', { class: 'lv-row' });
  const rerollLabel = h('span', { class: 'btn-label' });
  const rerollBtn = h(
    'button',
    { type: 'button', class: 'btn btn-small lv-reroll', onclick: () => reroll() },
    icon('icon_reroll', 32, { cls: 'btn-icon', glyph: '↻' }),
    rerollLabel,
    glyph('reroll'),
  );

  const who = params.player && params.player.index > 0 ? h('span', { class: 'lv-who' }, `Captain ${params.player.index + 1}`) : null;

  function cardEl(card, i) {
    const r = RARITY[card.rarity] || RARITY.common;
    const [badge, bcls] = badgeFor(card);
    const max = card.maxLevel || 1;
    const lv = card.level || 1;
    const el = h(
      'button',
      {
        type: 'button',
        class: ['lv-card', `r-${card.rarity || 'common'}`, `k-${card.kind || 'passive'}`],
        style: { '--rc': r.color, '--rg': r.glow, '--i': String(i) },
        'aria-label': `${card.name}. ${badge}. ${txt(card.desc)}`,
        dataset: { key: card.key || card.id || String(i) },
      },
      h('span', { class: 'lv-rarity' }, r.name || card.rarity),
      h('span', { class: 'lv-num', 'aria-hidden': 'true' }, String(i + 1)),
      h(
        'span',
        { class: 'lv-medal' },
        h('span', { class: 'lv-rays' }),
        frag(gearSVG(18, 'lv-gear', 0.6)),
        icon(card.icon, 96, { cls: 'lv-icon', glyph: (card.name || '?')[0] }),
      ),
      h('span', { class: `lv-badge b-${bcls}` }, badge),
      h('span', { class: 'lv-name' }, card.name || card.id),
      h('span', { class: 'lv-kind' }, KIND_LABEL[card.kind] || ''),
      h('span', { class: 'lv-desc' }, txt(card.desc)),
      max > 1 ? h('span', { class: 'lv-pips' }, pips(Math.max(0, lv - 1), max, lv)) : h('span', { class: 'lv-pips' }),
    );
    el.addEventListener('click', () => pick(i));
    return el;
  }

  function render(initial) {
    elements = cards.map(cardEl);
    row.replaceChildren(...elements);
    row.dataset.count = String(cards.length);
    row.classList.add('locked');
    lockUntil = performance.now() + LOCKOUT_MS;
    setTimeout(() => row.classList.remove('locked'), LOCKOUT_MS);
    rerollLabel.textContent = `Reroll (${rerolls})`;
    rerollBtn.hidden = !(rerolls > 0 && typeof params.onReroll === 'function');
    if (!initial) {
      ui.nav.focus(elements[0]);
      sfx('ui_card');
    }
  }

  function pick(i) {
    if (picked) return;
    const card = cards[i];
    if (!card) return;
    if (performance.now() < lockUntil) {
      kick(elements[i], 'nudge');
      return;
    }
    picked = true;
    sfx('ui_card', { pitch: 1.15 });
    elements.forEach((el, j) => el.classList.add(j === i ? 'picked' : 'dismissed'));
    const done = () => {
      if (ui.top?.inst === inst) ui.hide();
      try {
        params.onPick?.(card);
      } catch (err) {
        console.error('[ui] onPick failed', err);
      }
    };
    setTimeout(done, 280);
  }

  async function reroll() {
    if (picked || rerolls <= 0 || typeof params.onReroll !== 'function') {
      sfx('ui_error');
      return;
    }
    if (performance.now() < lockUntil) return;
    let next;
    try {
      next = await params.onReroll();
    } catch (err) {
      console.error('[ui] onReroll failed', err);
    }
    if (!Array.isArray(next) || !next.length || next === raw) {
      sfx('ui_error');
      return;
    }
    rerolls--;
    raw = next;
    cards = next.filter(Boolean);
    row.classList.add('rerolling');
    setTimeout(() => {
      row.classList.remove('rerolling');
      render(false);
    }, 160);
  }

  const el = h(
    'div',
    { class: 'levelup-screen' },
    h('div', { class: 'lv-burst' }),
    h(
      'div',
      { class: 'lv-head' },
      h('h1', { class: 'lv-title', 'data-text': params.title || 'Level Up!' }, params.title || 'Level Up!'),
      h('div', { class: 'lv-sub' }, who, h('span', null, params.subtitle || 'Choose an upgrade for your airship')),
    ),
    row,
    h('div', { class: 'lv-foot' }, rerollBtn, h('div', { class: 'foot-hint lv-hint' }, h('span', { class: 'g-kbm-only' }, 'Keys 1–', String(Math.max(1, cards.length)), ' to choose'))),
  );

  render(true);

  const inst = {
    el,
    focus: elements[0],
    back() {
      /* a choice must be made */
    },
    onKey(e) {
      const m = e.code.match(/^(?:Digit|Numpad)([1-9])$/);
      if (m) {
        const i = Number(m[1]) - 1;
        if (i < cards.length) {
          if (!e.repeat) pick(i);
          return true;
        }
      }
      if (e.code === 'KeyR') {
        if (!e.repeat) reroll();
        return true;
      }
      return false;
    },
    onConfirm() {
      // Swallow confirms during the lockout so mashing doesn't pick the focused card.
      if (performance.now() < lockUntil || picked) return true;
      return false;
    },
  };
  return inst;
}
