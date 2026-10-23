// Title screen: animated emblem + engraved logo, main menu, cogs, PWA install.

import { Save } from '../../core/storage.js';
import { VERSION } from '../../config.js';
import { pwa } from '../../pwa.js';
import { ACHIEVEMENTS } from '../../content/achievements.js';
import { ENEMY_ORDER } from '../../content/enemies/index.js';
import { BOSS_ORDER } from '../../content/bosses/index.js';
import * as Lore from '../../content/codex.js';
import { h, frag, cogChip, sfx, safe, txt } from '../dom.js';
import { emblemSVG, gearSVG } from '../art.js';

const TAGLINES = [
  'A Skyship Shooter of the Clockwork Age',
  'Steam in the boilers. Iron in the sky.',
  'Hold fast, Captain — the Syndicate approaches.',
];

export default function build(ui, params) {
  const counts = () => {
    const d = Save.data;
    const ach = safe(() => ACHIEVEMENTS.filter((a) => d.achievements?.[a.id]).length, 0);
    const codexDone =
      Object.keys(d.codex?.enemies || {}).length + Object.keys(d.codex?.bosses || {}).length;
    const codexTotal = safe(() => ENEMY_ORDER.length + BOSS_ORDER.length, 17);
    return { ach, achTotal: safe(() => ACHIEVEMENTS.length, 0), codexDone, codexTotal };
  };

  const item = (id, label, sub, onClick, cls = '') => {
    const subEl = h('span', { class: 'tm-sub' }, sub || '');
    const b = h(
      'button',
      { type: 'button', class: `tm-btn ${cls}`, dataset: { id }, onclick: onClick },
      frag(gearSVG(10, 'tm-cog', 0.3)),
      h('span', { class: 'tm-label' }, label),
      subEl,
    );
    b._sub = subEl;
    return b;
  };

  const go = (name, p) => () => {
    sfx('ui_select');
    ui.push(name, p);
  };

  const sail = item('sail', 'Set Sail', 'Choose your voyage', go('modes'), 'tm-primary');
  const hangar = item('hangar', 'Hangar', 'Airships · Cannons · Workshop', () => {
    sfx('ui_select');
    ui.push('hangar', { mode: ui.lastMode || 'campaign' });
  });
  const codex = item('codex', 'Codex', '', go('codex'));
  const ach = item('achievements', 'Achievements', '', go('achievements'));
  const settings = item('settings', 'Settings', 'Sound · Display · Controls', go('settings'));
  const credits = item('credits', 'Credits', 'The crew behind the brass', go('credits'));
  const howto = h(
    'button',
    { type: 'button', class: 'btn btn-small btn-ghost title-howto', onclick: go('howto') },
    'How to Play',
  );

  const install = h(
    'button',
    {
      type: 'button',
      class: 'btn btn-small btn-primary title-install',
      onclick: async () => {
        sfx('ui_select');
        try {
          const ok = await pwa?.promptInstall?.();
          if (ok) {
            ui.installable = false;
            refresh();
            ui.toast('Brass & Ballast is now moored on your device.', { title: 'Installed' });
          }
        } catch {
          /* user dismissed */
        }
      },
    },
    h('span', { class: 'btn-label' }, 'Install Game'),
  );

  const chip = cogChip(Save.meta.cogs || 0);
  const best = h('div', { class: 'title-best' });

  const menu = h('nav', { class: 'title-menu', 'aria-label': 'Main menu' }, sail, hangar, codex, ach, settings, credits);
  const tag = TAGLINES[(Save.data.stats?.runs || 0) % TAGLINES.length];

  const tips = Array.isArray(Lore.TIPS) ? Lore.TIPS.filter(Boolean) : [];
  let tipIdx = Math.floor(Math.random() * Math.max(1, tips.length));
  const tipText = h('span', { class: 'title-tip-text' }, tips.length ? txt(tips[tipIdx]) : '');
  const tip = tips.length
    ? h('div', { class: 'title-tip' }, frag(gearSVG(8, '', 0.3)), h('div', null, h('b', null, 'Sky-sailor’s tip'), tipText))
    : null;
  const tipTimer = tips.length > 1
    ? setInterval(() => {
        tipText.classList.add('fade');
        setTimeout(() => {
          tipIdx = (tipIdx + 1) % tips.length;
          tipText.textContent = txt(tips[tipIdx]);
          tipText.classList.remove('fade');
        }, 420);
      }, 9000)
    : 0;

  const el = h(
    'div',
    { class: 'title-screen' },
    h('div', { class: 'title-glow' }),
    h(
      'div',
      { class: 'title-hero' },
      h('div', { class: 'emblem-wrap' }, frag(emblemSVG())),
      h(
        'h1',
        { class: 'logo', 'aria-label': 'Brass and Ballast' },
        h('span', { class: 'logo-word', 'data-text': 'BRASS' }, 'BRASS'),
        h('span', { class: 'logo-amp', 'data-text': '&' }, '&'),
        h('span', { class: 'logo-word', 'data-text': 'BALLAST' }, 'BALLAST'),
      ),
      h('div', { class: 'tagline' }, h('i', { class: 'flourish' }), h('span', null, tag), h('i', { class: 'flourish r' })),
    ),
    h('div', { class: 'title-side' }, menu, h('div', { class: 'title-aux' }, howto, install)),
    h('div', { class: 'title-top' }, best, chip.el),
    tip,
    h('div', { class: 'title-ver' }, `v${VERSION}`),
  );

  function refresh() {
    const c = counts();
    codex._sub.textContent = `${c.codexDone} / ${c.codexTotal} foes catalogued`;
    ach._sub.textContent = c.achTotal ? `${c.ach} / ${c.achTotal} medals earned` : 'Medals & honours';
    chip.set(Save.meta.cogs || 0, false);
    const bs = Save.data.stats?.bestScore || 0;
    best.textContent = bs ? `Best score  ${bs.toLocaleString('en-US')}` : '';
    best.hidden = !bs;
    install.hidden = !(ui.installable || pwa?.canInstall);
  }
  refresh();

  const focusId = params.focus;
  const focus = (focusId && menu.querySelector(`[data-id="${focusId}"]`)) || sail;

  return {
    el,
    focus,
    refresh,
    onReveal: refresh,
    back() {
      /* the title is the root; nothing to go back to */
    },
    destroy() {
      clearInterval(tipTimer);
    },
  };
}
