// Codex: catalogue of foes, bosses, arsenal and lore. Undiscovered entries are silhouettes.

import { Save } from '../../core/storage.js';
import { Sprites } from '../../gfx/sprites.js';
import { ENEMIES, ENEMY_ORDER } from '../../content/enemies/index.js';
import { BOSSES, BOSS_ORDER } from '../../content/bosses/index.js';
import { PRIMARIES, PRIMARY_ORDER, AUX, AUX_ORDER, EVOLUTIONS } from '../../content/weapons/index.js';
import { PASSIVES } from '../../content/upgrades.js';
import { HULLS, HULL_ORDER } from '../../content/hulls.js';
import { STAGES } from '../../content/stages.js';
import * as Lore from '../../content/codex.js';
import { h, icon, frame, backBtn, glyph, tabBar, sfx, kick, fmtInt, txt, safe } from '../dom.js';

const CODEX = Lore.CODEX || {};

function portrait(name, px, known) {
  const el = icon(Sprites.has(name) ? name : null, px, { cls: 'cx-img', glyph: known ? undefined : '?' });
  if (!known) el.classList.add('silhouette');
  return el;
}

function seen(section, id) {
  return !!Save.data.codex?.[section]?.[id];
}

/** Build the entry lists for every tab. */
function entries() {
  const st = Save.data.stats || {};
  const enemies = (ENEMY_ORDER || Object.keys(ENEMIES)).map((id) => {
    const d = ENEMIES[id] || {};
    const c = CODEX.enemies?.[id] || {};
    const known = seen('enemies', id);
    return {
      id, known, name: d.name || id, sub: c.title || '', sprite: d.sprite || `enemy_${id}`,
      lore: c.lore, tip: c.tip,
      facts: [['Hull', d.hp], ['Speed', d.speed], ['Aether', d.xp], ['Downed', Save.data.codex?.enemies?.[id] || 0]],
      hint: 'Down one of these craft to catalogue it.',
    };
  });
  const bosses = (BOSS_ORDER || Object.keys(BOSSES)).map((id) => {
    const d = BOSSES[id] || {};
    const c = CODEX.bosses?.[id] || {};
    const known = seen('bosses', id);
    return {
      id, known, name: d.name || id, sub: c.title || d.title || '', sprite: d.sprite || `boss_${id}`,
      lore: c.lore, tip: c.tip, boss: true,
      facts: [['Hull', d.hp], ['Stage', d.stage], ['Sunk', Save.data.codex?.bosses?.[id] || 0]],
      hint: 'Sink this leviathan to learn its secrets.',
    };
  });
  const weaponKnown = (id) =>
    seen('weapons', id) || seen('upgrades', id) || (PRIMARIES[id] && Save.meta.unlockedWeapons?.includes(id));
  const arsenal = [];
  const pushArm = (group, list, defs, kind) => {
    for (const id of list) {
      const d = defs[id];
      if (!d) continue;
      arsenal.push({
        id, group, kind, known: weaponKnown(id), name: d.name || id, sub: group,
        sprite: d.icon || `icon_${id}`, desc: txt(d.desc, 1), lore: CODEX.weapons?.[id]?.lore,
        facts: d.maxLevel ? [['Max level', d.maxLevel]] : [],
        evo: kind === 'aux' && d.evolution && EVOLUTIONS[d.evolution]
          ? `Evolves with ${PASSIVES[d.evolvesWith]?.name || d.evolvesWith} into ${EVOLUTIONS[d.evolution].name}.`
          : kind === 'evo' && d.from
            ? `Born of ${AUX[d.from]?.name || d.from} at level 5 with ${PASSIVES[d.requires]?.name || d.requires}.`
            : '',
        hint: kind === 'evo' ? 'Evolve an auxiliary system to reveal this marvel.' : 'Fit this to your airship to catalogue it.',
      });
    }
  };
  pushArm('Primary Cannon', PRIMARY_ORDER, PRIMARIES, 'primary');
  pushArm('Auxiliary System', AUX_ORDER || Object.keys(AUX), AUX, 'aux');
  pushArm('Evolution', Object.keys(EVOLUTIONS || {}), EVOLUTIONS, 'evo');
  pushArm('Passive', Object.keys(PASSIVES || {}), PASSIVES, 'passive');

  const lore = [];
  lore.push({ id: 'intro', known: true, name: "Captain's Log", sub: 'The voyage begins', sprite: 'icon_clock', text: txt(Lore.INTRO) });
  (STAGES || []).forEach((s, i) => {
    lore.push({
      id: `stage-${s.id}`, known: i === 0 || (st.maxStage || 0) >= i + 1,
      name: s.name || s.id, sub: s.subtitle || `Stage ${i + 1}`, sprite: 'icon_wave',
      text: txt(CODEX.stages?.[s.id]?.lore) || txt(s.subtitle), hint: `Reach stage ${i + 1} to chart these skies.`,
    });
  });
  for (const id of HULL_ORDER || []) {
    const d = HULLS[id];
    if (!d) continue;
    lore.push({
      id: `hull-${id}`, known: Save.meta.unlockedHulls?.includes(id), name: d.name, sub: d.title || 'Airship',
      sprite: d.sprite || `hull_${id}`, text: txt(CODEX.hulls?.[id]?.lore) || txt(d.desc), hint: 'Commission this airship in the Hangar.',
    });
  }
  const tips = Array.isArray(Lore.TIPS) ? Lore.TIPS : [];
  if (tips.length) {
    lore.push({ id: 'tips', known: true, name: "Sky-Sailor's Almanac", sub: `${tips.length} hard-won lessons`, sprite: 'icon_star', tips });
  }
  return { enemies, bosses, arsenal, lore };
}

export default function build(ui, params) {
  const data = entries();
  const lists = [data.enemies, data.bosses, data.arsenal, data.lore];
  const content = h('div', { class: 'codex-content' });
  let current = null;
  let inst = null;

  const total = data.enemies.length + data.bosses.length + data.arsenal.length;
  const known = [data.enemies, data.bosses, data.arsenal].reduce((a, l) => a + l.filter((e) => e.known).length, 0);

  function view(i) {
    const list = lists[i];
    const detail = h('div', { class: 'detail cx-detail' });
    const tiles = [];
    let lastGroup = null;
    const grid = h('div', { class: ['cx-grid', i === 3 && 'cx-grid-lore'] });
    for (const e of list) {
      if (e.group && e.group !== lastGroup) {
        lastGroup = e.group;
        grid.append(h('div', { class: 'cx-group' }, `${e.group}s`));
      }
      const t = h(
        'button',
        {
          type: 'button',
          class: ['cx-tile', !e.known && 'unknown', e.boss && 'boss'],
          dataset: { id: e.id },
          'aria-label': e.known ? e.name : 'Undiscovered entry',
        },
        h('span', { class: 'cx-port' }, portrait(e.sprite, e.boss ? 160 : 96, e.known)),
        h('span', { class: 'cx-name' }, e.known ? e.name : '???'),
      );
      t.addEventListener('focus', () => show(e));
      t.addEventListener('click', () => {
        show(e);
        sfx(e.known ? 'ui_select' : 'ui_error', { vol: 0.6 });
        if (matchMedia('(max-width: 720px)').matches) detail.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      });
      tiles.push(t);
      grid.append(t);
    }
    let shown = null;
    function show(e) {
      if (shown === e) return;
      shown = e;
      const facts = (e.facts || []).filter(([, v]) => v !== undefined && v !== null);
      const body = [];
      if (e.known) {
        if (e.desc) body.push(h('p', { class: 'detail-desc' }, e.desc));
        if (e.evo) body.push(h('div', { class: 'perk' }, h('b', null, 'Evolution '), e.evo));
        if (e.lore) body.push(h('p', { class: 'cx-lore' }, txt(e.lore)));
        if (e.text) body.push(...String(e.text).split(/\n\s*\n/).map((p) => h('p', { class: 'cx-lore' }, p)));
        if (e.tips) body.push(h('ol', { class: 'cx-tips' }, e.tips.map((tip) => h('li', null, txt(tip)))));
        if (e.tip) body.push(h('div', { class: 'cx-tip' }, h('b', null, "Captain's advice"), h('span', null, txt(e.tip))));
        if (!e.lore && !e.text && !e.tips && !e.desc) body.push(h('p', { class: 'cx-lore muted' }, 'The archivists are still inking this page.'));
        if (facts.length) {
          body.push(h('dl', { class: 'cx-facts' }, facts.map(([k, v]) => [h('dt', null, k), h('dd', null, typeof v === 'number' ? fmtInt(v) : String(v))])));
        }
      } else {
        body.push(h('p', { class: 'cx-lore muted' }, e.hint || 'Undiscovered.'));
      }
      detail.replaceChildren(
        h('div', { class: ['cx-hero', e.boss && 'boss'] }, portrait(e.sprite, e.boss ? 256 : 160, e.known)),
        h(
          'div',
          { class: 'detail-text' },
          h('div', { class: 'detail-head' },
            h('h3', { class: 'detail-name' }, e.known ? e.name : 'Unknown'),
            e.known && e.sub ? h('div', { class: 'detail-title' }, e.sub) : null),
          body,
        ),
      );
      detail.classList.toggle('is-locked', !e.known);
      kick(detail, 'swap');
    }
    show(list.find((e) => e.known) || list[0]);
    const el = h('div', { class: 'split split-codex' }, h('div', { class: 'roster cx-roster' }, grid), detail);
    const first = tiles[list.indexOf(shown)] || tiles[0];
    return { el, focus: first };
  }

  const tabs = tabBar(['Foes', 'Bosses', 'Arsenal', 'Lore'], (i) => {
    current = view(i);
    content.replaceChildren(current.el);
    if (inst) {
      ui.nav.focus(current.focus);
      kick(content, 'swap');
    }
  }, Math.max(0, Math.min(3, params.tab | 0)));

  const f = frame({
    title: 'The Codex',
    sub: `Catalogued ${known} of ${total}`,
    tabs,
    body: content,
    bodyCls: 'codex-body',
    footer: [
      backBtn(() => {
        sfx('ui_back');
        ui.pop();
      }),
      h('div', { class: 'foot-hint' }, glyph('tabL'), glyph('tabR'), ' Switch section'),
      h('div', { class: 'foot-meter' }, h('span', null, `${Math.round((100 * known) / Math.max(1, total))}%`), h('i', { style: { '--v': (known / Math.max(1, total)).toFixed(3) } })),
    ],
  });
  inst = { el: h('div', { class: 'codex-screen' }, f.el), focus: current?.focus, tabs };
  void safe;
  return inst;
}
