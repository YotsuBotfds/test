// Modal yes/no dialog (ui.confirm). Resolves params.resolve(true|false).

import { h, frag, btn, sfx } from '../dom.js';
import { gearSVG } from '../art.js';

export default function build(ui, params) {
  let settled = false;
  const settle = (v) => {
    if (settled) return;
    settled = true;
    sfx(v ? 'ui_select' : 'ui_back');
    ui.pop();
    try {
      params.resolve?.(v);
    } catch (err) {
      console.error('[ui] confirm handler failed', err);
    }
  };
  const yes = btn(params.yes || 'Yes', () => settle(true), { kind: params.danger ? 'danger' : 'primary' });
  const no = btn(params.no || 'Cancel', () => settle(false), { kind: 'ghost' });
  const el = h(
    'div',
    { class: 'confirm-screen', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': params.title || 'Confirm' },
    h(
      'div',
      { class: ['dialog', 'parchment', params.danger && 'danger'] },
      frag(gearSVG(12, 'dlg-gear', 0.4)),
      h('h2', { class: 'dialog-title' }, params.title || 'Are you sure?'),
      params.text ? h('p', { class: 'dialog-text' }, params.text) : null,
      h('div', { class: 'dialog-buttons' }, no, yes),
    ),
  );
  el.addEventListener('pointerdown', (e) => {
    if (e.target === el) settle(false);
  });
  return {
    el,
    modal: true,
    // Dangerous choices default to the safe answer.
    focus: params.danger ? no : yes,
    back: () => settle(false),
    destroy() {
      if (!settled) {
        settled = true;
        params.resolve?.(false);
      }
    },
  };
}
