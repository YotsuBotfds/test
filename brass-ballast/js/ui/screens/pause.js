// Pause: voyage log, current build, and resume / settings / help / abandon.

import { STAGES } from '../../content/stages.js';
import { MODES, MODIFIERS } from '../../content/modes.js';
import { PRIMARIES, AUX, EVOLUTIONS } from '../../content/weapons/index.js';
import { PASSIVES } from '../../content/upgrades.js';
import { h, frag, icon, plaque, btn, sfx, fmtInt, fmtTime, safe } from '../dom.js';
import { gearSVG } from '../art.js';

function buildSlot(def, level, max, kind) {
  const name = def?.name || '?';
  return h(
    'div',
    { class: ['bslot', kind], title: `${name}${level ? ` — level ${level}` : ''}` },
    icon(def?.icon, 64, { cls: 'bslot-icon', glyph: name[0] }),
    level ? h('span', { class: 'bslot-lv' }, kind === 'evo' ? '★' : level >= (max || 99) ? 'MAX' : `L${level}`) : null,
  );
}

export default function build(ui) {
  const game = ui.game;
  const run = game?.run || {};
  const p = game?.world?.players?.[0] || null;
  const stage = run.stage || STAGES?.[run.stageIndex ?? 0];
  const mode = MODES?.[run.mode];

  const rows = [
    ['Voyage', mode?.name || 'The Grand Voyage'],
    ['Skies', stage ? `${stage.name || stage.id}` : '—'],
    ['Wave', run.endlessWave ? fmtInt(run.endlessWave) : run.wave ? `${run.wave} / ${run.waveCount || '?'}` : '—'],
    ['Time aloft', fmtTime(run.time || 0)],
    ['Score', fmtInt(run.score || 0)],
    ['Foes downed', fmtInt(run.kills || 0)],
    ['Level', fmtInt(run.level || 1)],
    ['Cogs aboard', fmtInt(run.cogs || 0)],
  ];
  const ledger = h('dl', { class: 'ledger' }, rows.map(([k, v]) => h('div', { class: 'lrow' }, h('dt', null, k), h('dd', null, v))));

  const hull = p ? h(
    'div',
    { class: 'hull-meter' },
    h('span', null, 'Hull'),
    h('i', { style: { '--v': Math.max(0, Math.min(1, (p.hp || 0) / (p.stats?.maxHp || 100))).toFixed(3) } }),
    h('b', null, `${Math.ceil(p.hp || 0)} / ${Math.round(p.stats?.maxHp || 100)}`),
  ) : null;

  const slots = [];
  if (p?.primary) {
    const d = PRIMARIES[p.primary.id];
    slots.push(buildSlot(d, p.primary.level, d?.maxLevel || 8, 'primary'));
  }
  const auxSlots = [];
  for (const a of p?.aux || []) {
    const evo = EVOLUTIONS?.[a.id];
    const d = evo || AUX[a.id];
    auxSlots.push(buildSlot(d, a.level, d?.maxLevel || 5, evo ? 'evo' : 'aux'));
  }
  while (auxSlots.length < 4) auxSlots.push(h('div', { class: 'bslot empty', title: 'Empty auxiliary mount' }));
  const passives = Object.entries(p?.passives || {})
    .filter(([id, l]) => PASSIVES[id] && l > 0)
    .map(([id, l]) => buildSlot(PASSIVES[id], l, PASSIVES[id].maxLevel, 'passive'));

  const mods = (run.modifiers || []).map((id) => MODIFIERS?.[id]).filter(Boolean);

  const buildBox = h(
    'div',
    { class: 'build' },
    h('div', { class: 'build-row' }, h('span', { class: 'build-h' }, 'Cannon & mounts'), h('div', { class: 'bslots' }, slots, auxSlots)),
    h('div', { class: 'build-row' }, h('span', { class: 'build-h' }, 'Upgrades'),
      passives.length ? h('div', { class: 'bslots small' }, passives) : h('div', { class: 'muted' }, 'None yet — level up to earn upgrades.')),
    mods.length ? h('div', { class: 'build-row' }, h('span', { class: 'build-h' }, 'Modifiers'), h('div', { class: 'mode-mods' }, mods.map((m) => h('div', { class: 'modchip' }, h('b', null, m.name), h('span', null, m.desc || ''))))) : null,
  );

  const resume = () => {
    sfx('ui_back');
    safe(() => game?.resume?.());
    if (ui.current === 'pause') ui.hide();
  };
  const abandon = async () => {
    sfx('ui_select');
    const ok = await ui.confirm({
      title: 'Abandon the voyage?',
      text: 'Your airship will limp home. Cogs collected so far are still banked.',
      yes: 'Abandon',
      no: 'Stay aloft',
      danger: true,
    });
    if (!ok) return;
    try {
      game?.quitToTitle?.();
    } catch (err) {
      console.error('[ui] quitToTitle failed', err);
    }
    if (ui.current === 'pause' || !ui.isOpen) ui.show('title');
  };

  const bResume = btn('Resume', resume, { kind: 'primary', glyph: 'back' });
  const buttons = h(
    'div',
    { class: 'pause-buttons' },
    bResume,
    btn('Settings', () => {
      sfx('ui_select');
      ui.push('settings', { fromPause: true });
    }),
    btn('How to Play', () => {
      sfx('ui_select');
      ui.push('howto');
    }),
    btn('Abandon Voyage', abandon, { kind: 'danger' }),
  );

  const el = h(
    'div',
    { class: 'pause-screen' },
    h(
      'div',
      { class: 'pause-board' },
      frag(gearSVG(16, 'pause-gear g1', 0.4)),
      frag(gearSVG(10, 'pause-gear g2', 0.35)),
      plaque('Voyage Paused', 'All engines idle'),
      h('div', { class: 'pause-grid' },
        h('div', { class: 'pause-log parchment' }, hull, ledger),
        h('div', { class: 'pause-side' }, buildBox, buttons)),
    ),
  );
  return { el, focus: bResume, back: resume };
}
