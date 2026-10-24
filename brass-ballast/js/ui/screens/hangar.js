// Hangar: choose an airship and primary cannon, unlock them with cogs, buy Workshop upgrades,
// then launch the voyage. Tabs: Airships | Cannons | Workshop.

import { Save } from '../../core/storage.js';
import { events } from '../../core/events.js';
import { Sprites } from '../../gfx/sprites.js';
import { HULLS, HULL_ORDER } from '../../content/hulls.js';
import { PRIMARIES, PRIMARY_ORDER, AUX } from '../../content/weapons/index.js';
import { PASSIVES } from '../../content/upgrades.js';
import { WORKSHOP, workshopCost } from '../../content/workshop.js';
import { MODES } from '../../content/modes.js';
import { CODEX } from '../../content/codex.js';
import {
  h, frag, icon, frame, backBtn, btn, glyph, cogChip, cog, pips, tabBar, sfx, kick, fmtInt, safe, txt,
} from '../dom.js';
import { gearSVG } from '../art.js';

const HULL_DEFAULTS = { maxHp: 100, speed: 240, armor: 0, boostCost: 30, damage: 1 };

/** True when a non-cog unlock condition is satisfied. */
function condMet(u) {
  if (!u) return true;
  const st = Save.data.stats || {};
  if (u.cogs) return false;
  if (u.stage) return (st.maxStage || 0) >= u.stage;
  if (u.win) return (st.wins || 0) > 0;
  if (u.kills) return (st.kills || 0) >= u.kills;
  if (u.achievement) return !!Save.data.achievements?.[u.achievement];
  return false;
}

function lockText(u) {
  if (!u) return '';
  if (u.text) return u.text;
  if (u.stage) return `Reach stage ${u.stage} to unlock`;
  if (u.win) return 'Win The Grand Voyage to unlock';
  if (u.kills) return `Down ${fmtInt(u.kills)} foes to unlock`;
  if (u.achievement) return 'Earn a special medal to unlock';
  return 'Locked';
}

function isUnlocked(kind, id, def) {
  const list = kind === 'hull' ? Save.meta.unlockedHulls : Save.meta.unlockedWeapons;
  if (!def?.unlock || list?.includes(id)) return true;
  return false;
}

/** Grant hulls/cannons whose milestone conditions are already met. */
function autoUnlock() {
  for (const id of HULL_ORDER) {
    const d = HULLS[id];
    if (d?.unlock && !d.unlock.cogs && condMet(d.unlock)) Save.unlock('hull', id);
  }
  for (const id of PRIMARY_ORDER) {
    const d = PRIMARIES[id];
    if (d?.unlock && !d.unlock.cogs && condMet(d.unlock)) Save.unlock('weapon', id);
  }
  if (!Save.meta.unlockedHulls.includes(Save.meta.hull)) Save.meta.hull = HULL_ORDER[0] || 'dauntless';
  if (!Save.meta.unlockedWeapons.includes(Save.meta.weapon)) Save.meta.weapon = PRIMARY_ORDER[0] || 'brassCannon';
}

function statRow(name, value, max, shown, ref = null, invert = false) {
  const v = Math.max(0, Math.min(1, invert ? 1 - value / max : value / max));
  const r = ref == null ? null : Math.max(0, Math.min(1, invert ? 1 - ref / max : ref / max));
  return h(
    'div',
    { class: 'stat' },
    h('span', { class: 'stat-name' }, name),
    h(
      'div',
      { class: 'stat-bar' },
      h('i', { style: { '--v': v.toFixed(3) } }),
      r != null && Math.abs(r - v) > 0.004 ? h('b', { class: 'stat-ref', style: { '--r': r.toFixed(3) }, title: 'Current choice' }) : null,
    ),
    h('span', { class: 'stat-val' }, shown),
  );
}

function primaryNumbers(def) {
  const b = safe(() => def.base(1), {}) || {};
  const count = b.count || b.pellets || 1;
  const damage = b.damage || 0;
  const rate = b.rate || 0;
  return { damage, rate, speed: b.speed || 0, count, dps: damage * rate * count, aoe: b.radius || b.aoe || 0 };
}

export default function build(ui, params) {
  autoUnlock();
  Save.save();
  const mode = MODES[params.mode] ? params.mode : ui.lastMode || 'campaign';
  const modeDef = MODES[mode] || { name: 'The Grand Voyage' };
  const chip = cogChip(Save.meta.cogs || 0);
  const content = h('div', { class: 'hangar-content' });
  let current = null;
  let inst = null;

  const spend = (cost) => {
    if ((Save.meta.cogs || 0) < cost) {
      sfx('ui_error');
      chip.deny();
      ui.toast(`You need ${fmtInt(cost - (Save.meta.cogs || 0))} more cogs.`, {
        kind: 'warning',
        title: 'Purse too light',
        time: 2.4,
      });
      return false;
    }
    Save.meta.cogs -= cost;
    Save.save();
    chip.set(Save.meta.cogs);
    return true;
  };

  // ------------------------------------------------------------ master/detail roster
  function roster(kind) {
    const isHull = kind === 'hull';
    const order = (isHull ? HULL_ORDER : PRIMARY_ORDER).filter((id) => (isHull ? HULLS : PRIMARIES)[id]);
    const defs = isHull ? HULLS : PRIMARIES;
    const selKey = isHull ? 'hull' : 'weapon';
    const detail = h('div', { class: 'detail' });
    const tiles = [];
    let shown = null;

    const state = (id) => {
      const d = defs[id];
      const unlocked = isUnlocked(kind, id, d);
      const selected = Save.meta[selKey] === id;
      const cost = d.unlock?.cogs || 0;
      return { d, unlocked, selected, cost, buyable: !unlocked && cost > 0 };
    };

    const tileFor = (id) => {
      const s = state(id);
      const art = isHull ? icon(s.d.sprite || `hull_${id}`, 128, { cls: 'tile-art' }) : icon(s.d.icon || `icon_${id}`, 96, { cls: 'tile-art' });
      const status = h('span', { class: 'tile-status' });
      const t = h(
        'button',
        { type: 'button', class: 'tile', dataset: { id } },
        h('span', { class: 'tile-frame' }, art),
        h('span', { class: 'tile-name' }, s.d.name || id),
        status,
      );
      t.addEventListener('focus', () => showDetail(id));
      t.addEventListener('click', () => act(id));
      t.update = () => {
        const st = state(id);
        t.classList.toggle('locked', !st.unlocked);
        t.classList.toggle('selected', st.selected);
        status.replaceChildren(
          st.selected
            ? h('span', { class: 'tag tag-sel' }, 'Selected')
            : st.unlocked
              ? h('span', { class: 'tag' }, 'Ready')
              : st.buyable
                ? h('span', { class: 'tag tag-cost' }, cog(), fmtInt(st.cost))
                : h('span', { class: 'tag tag-lock' }, 'Locked'),
        );
      };
      t.update();
      return t;
    };

    for (const id of order) tiles.push(tileFor(id));

    function act(id) {
      const s = state(id);
      if (s.unlocked) {
        if (!s.selected) {
          Save.meta[selKey] = id;
          Save.save();
          sfx('ui_select');
          const t = tiles.find((x) => x.dataset.id === id);
          kick(t, 'chosen');
        } else sfx('ui_move');
        refreshAll();
        return;
      }
      if (!s.buyable) {
        sfx('ui_error');
        kick(tiles.find((x) => x.dataset.id === id), 'shake');
        return;
      }
      if ((Save.meta.cogs || 0) < s.cost) {
        spend(s.cost);
        return;
      }
      sfx('ui_select');
      ui.confirm({
        title: isHull ? `Commission ${s.d.name}?` : `Forge the ${s.d.name}?`,
        text: `Spend ${fmtInt(s.cost)} cogs of your ${fmtInt(Save.meta.cogs)}.`,
        yes: 'Unlock',
        no: 'Not yet',
      }).then((ok) => {
        if (!ok || !spend(s.cost)) return;
        Save.unlock(kind, id);
        Save.meta[selKey] = id;
        Save.saveNow?.();
        events.emit('hangar:unlock', { kind, id });
        sfx('ui_unlock');
        sfx('ui_buy');
        ui.toast(`${s.d.name} is ready for launch.`, { title: isHull ? 'Airship commissioned' : 'Cannon forged', icon: isHull ? null : s.d.icon });
        refreshAll();
        const t = tiles.find((x) => x.dataset.id === id);
        kick(t, 'unlocked-now');
      });
    }

    function refreshAll() {
      for (const t of tiles) t.update();
      if (shown) showDetail(shown, true);
    }

    function showDetail(id, force = false) {
      if (shown === id && !force) return;
      shown = id;
      const s = state(id);
      const d = s.d;
      const sel = defs[Save.meta[selKey]];
      let stats;
      let preview;
      let extra = null;
      if (isHull) {
        const b = { ...HULL_DEFAULTS, ...(d.base || {}) };
        const r = { ...HULL_DEFAULTS, ...(sel?.base || {}) };
        stats = [
          statRow('Hull', b.maxHp, 180, fmtInt(b.maxHp), r.maxHp),
          statRow('Speed', b.speed, 320, fmtInt(b.speed), r.speed),
          statRow('Armor', b.armor, 4, String(b.armor), r.armor),
          statRow('Boost cost', b.boostCost, 45, `${b.boostCost} steam`, r.boostCost, true),
          statRow('Firepower', b.damage, 1.3, `×${Number(b.damage).toFixed(2)}`, r.damage),
        ];
        const art = d.sprite || `hull_${id}`;
        preview = h(
          'div',
          { class: 'preview preview-hull' },
          frag(gearSVG(14, 'pv-gear', 0.55)),
          h('div', { class: 'pv-ship' }, icon(art, 256, { cls: 'pv-img' })),
          h('div', { class: 'pv-shadow' }),
        );
        const kit = [];
        for (const a of d.startAux || []) if (AUX[a]) kit.push(h('span', { class: 'kit' }, icon(AUX[a].icon, 32), AUX[a].name));
        for (const [p, l] of Object.entries(d.startPassives || {})) {
          if (PASSIVES[p]) kit.push(h('span', { class: 'kit' }, icon(PASSIVES[p].icon, 32), `${PASSIVES[p].name} ${l > 1 ? `L${l}` : ''}`));
        }
        if (kit.length) extra = h('div', { class: 'kitlist' }, h('span', { class: 'kit-h' }, 'Starts with'), kit);
      } else {
        const n = primaryNumbers(d);
        const all = PRIMARY_ORDER.filter((x) => PRIMARIES[x]).map((x) => primaryNumbers(PRIMARIES[x]));
        const mx = (k) => Math.max(1, ...all.map((o) => o[k] || 0));
        const r = sel ? primaryNumbers(sel) : null;
        stats = [
          statRow('Damage', n.damage * n.count, Math.max(1, ...all.map((o) => o.damage * o.count)) * 1.05, n.count > 1 ? `${fmtInt(n.damage)} × ${n.count}` : fmtInt(n.damage), r ? r.damage * r.count : null),
          statRow('Fire rate', n.rate, mx('rate'), `${(+n.rate).toFixed(1)}/s`, r?.rate),
          statRow('Velocity', n.speed, mx('speed'), n.speed ? fmtInt(n.speed) : 'Lobbed', r?.speed),
          statRow('Output', n.dps, mx('dps'), `${fmtInt(n.dps)} dps`, r?.dps),
        ];
        preview = h(
          'div',
          { class: 'preview preview-gun' },
          frag(gearSVG(14, 'pv-gear', 0.55)),
          h('div', { class: 'pv-medal' }, icon(d.icon || `icon_${id}`, 128, { cls: 'pv-icon' })),
          Sprites.has(d.turret || `turret_${id}`) ? h('div', { class: 'pv-turret' }, icon(d.turret || `turret_${id}`, 160)) : null,
        );
        const ld = txt(d.levelDesc, 2);
        extra = h('div', { class: 'kitlist' }, h('span', { class: 'kit-h' }, `Calibrates to L${d.maxLevel || 8}`), ld ? h('span', { class: 'kit' }, ld) : null);
      }
      const lore = txt((isHull ? CODEX?.hulls : CODEX?.weapons)?.[id]?.lore);
      let action;
      if (s.selected) action = btn('Selected', null, { kind: 'ghost', class: 'act-sel' });
      else if (s.unlocked) action = btn(isHull ? 'Take the helm' : 'Mount this cannon', () => act(id), { kind: 'primary' });
      else if (s.buyable) {
        action = btn(`Unlock`, () => act(id), {
          kind: (Save.meta.cogs || 0) >= s.cost ? 'primary' : 'disabled',
          icon: h('span', { class: 'btn-cost' }, cog(), fmtInt(s.cost)),
        });
      } else action = h('div', { class: 'act-lock' }, icon('icon_lock', 32, { glyph: '!' }), lockText(d.unlock));
      action.classList?.add('detail-action');
      if (action.tagName === 'BUTTON') action.setAttribute('data-nav-skip', '');
      detail.replaceChildren(
        preview,
        h(
          'div',
          { class: 'detail-text' },
          h('div', { class: 'detail-head' },
            h('h3', { class: 'detail-name' }, d.name || id),
            d.title ? h('div', { class: 'detail-title' }, d.title) : null),
          h('p', { class: 'detail-desc' }, txt(d.desc)),
          d.perk ? h('div', { class: 'perk' }, h('b', null, 'Perk '), txt(d.perk)) : null,
          h('div', { class: 'stats' }, stats),
          extra,
          h('div', { class: 'detail-actions' }, action),
          lore ? h('p', { class: 'detail-lore' }, lore) : null,
        ),
      );
      detail.classList.toggle('is-locked', !s.unlocked);
      kick(detail, 'swap');
    }

    const list = h('div', { class: 'roster', role: 'listbox' }, tiles);
    const el = h('div', { class: 'split' }, list, detail);
    const selTile = tiles.find((t) => t.dataset.id === Save.meta[selKey]) || tiles[0];
    showDetail(selTile?.dataset.id);
    return { el, focus: selTile, refresh: refreshAll };
  }

  // ------------------------------------------------------------ workshop
  function workshop() {
    const cards = [];
    const level = (id) => Save.meta.workshop?.[id] || 0;
    for (const item of WORKSHOP || []) {
      const lvlPips = h('div', { class: 'ws-pips' });
      const price = h('div', { class: 'ws-price' });
      const desc = h('div', { class: 'ws-desc' });
      const c = h(
        'button',
        { type: 'button', class: 'ws-card', dataset: { id: item.id } },
        h('div', { class: 'ws-icon' }, icon(item.icon || `icon_ws_${item.id}`, 64)),
        h('div', { class: 'ws-text' }, h('div', { class: 'ws-name' }, item.name), desc, h('div', { class: 'ws-foot' }, lvlPips, price)),
      );
      c.update = () => {
        const l = level(item.id);
        const max = item.maxLevel || 1;
        const maxed = l >= max;
        const cost = maxed ? 0 : safe(() => workshopCost(item, l), 0);
        // The pips show what is owned; the text previews the next purchase, so say so.
        const next = txt(item.desc, Math.min(max, l + 1)) || '';
        if (maxed) desc.textContent = next;
        else desc.replaceChildren(h('b', { class: 'ws-next' }, 'Next: '), next);
        lvlPips.replaceChildren(pips(l, max));
        c.classList.toggle('maxed', maxed);
        c.classList.toggle('poor', !maxed && (Save.meta.cogs || 0) < cost);
        price.replaceChildren(
          maxed ? h('span', { class: 'ws-max' }, 'Mastered') : h('span', { class: 'ws-cost' }, cog(), fmtInt(cost)),
        );
        c.setAttribute('aria-label', `${item.name}, level ${l} of ${max}${maxed ? ', mastered' : `, costs ${cost} cogs`}`);
      };
      c.addEventListener('click', () => {
        const l = level(item.id);
        if (l >= (item.maxLevel || 1)) {
          sfx('ui_error', { vol: 0.5 });
          kick(c, 'shake');
          return;
        }
        const cost = safe(() => workshopCost(item, l), 0);
        if (!spend(cost)) {
          kick(c, 'shake');
          return;
        }
        Save.meta.workshop ||= {};
        Save.meta.workshop[item.id] = l + 1;
        Save.save();
        events.emit('workshop:buy', { id: item.id, level: l + 1 });
        sfx('ui_buy');
        for (const x of cards) x.update();
        kick(c, 'bought');
        const p = c.querySelectorAll('.pip')[l];
        if (p) kick(p, 'pop');
      });
      c.update();
      cards.push(c);
    }
    const spent = () =>
      (WORKSHOP || []).reduce((a, it) => {
        let s = 0;
        for (let i = 0; i < level(it.id); i++) s += safe(() => workshopCost(it, i), 0);
        return a + s;
      }, 0);
    const note = h('div', { class: 'ws-note' });
    const upd = () => {
      note.textContent = `Invested so far: ${fmtInt(spent())} cogs. Upgrades apply to every voyage.`;
    };
    upd();
    const el = h('div', { class: 'workshop' }, h('div', { class: 'ws-grid' }, cards), note);
    return {
      el,
      focus: cards[0],
      refresh() {
        for (const c of cards) c.update();
        upd();
      },
    };
  }

  // ------------------------------------------------------------ assembly
  const views = [() => roster('hull'), () => roster('weapon'), () => workshop()];
  const tabs = tabBar(['Airships', 'Cannons', 'Workshop'], (i) => {
    current = views[i]();
    content.replaceChildren(current.el);
    content.dataset.tab = String(i);
    if (inst) {
      ui.nav.focus(current.focus);
      kick(content, 'swap');
    }
  }, Math.max(0, Math.min(2, params.tab | 0)));

  const launch = () => {
    sfx('ui_select');
    const run = () => {
      ui.hide();
      try {
        ui.game?.startRun?.({ mode, hull: Save.meta.hull, weapon: Save.meta.weapon });
      } catch (err) {
        console.error('[ui] startRun failed', err);
      }
    };
    if (!Save.data.tutorialSeen) {
      ui.push('howto', {
        first: true,
        onDone: () => {
          Save.data.tutorialSeen = true;
          Save.saveNow?.();
          run();
        },
      });
    } else run();
  };

  const launchBtn = btn('Set Sail', launch, { kind: 'launch', class: 'launch-btn', glyph: 'start' });
  launchBtn.prepend(frag(gearSVG(12, 'launch-cog', 0.3)));
  const back = backBtn(() => {
    sfx('ui_back');
    if (ui.stack.length > 1) ui.pop();
    else ui.showPath([['title'], ['modes']]);
  });

  const f = frame({
    title: 'The Hangar',
    sub: h('span', { class: 'voyage-chip' }, 'Voyage: ', h('b', null, modeDef.name || mode)),
    right: chip.el,
    tabs,
    body: content,
    bodyCls: 'hangar-body',
    footer: [back, h('div', { class: 'foot-hint' }, glyph('confirm'), ' Select   ', glyph('tabL'), glyph('tabR'), ' Tabs'), launchBtn],
  });

  inst = {
    el: h('div', { class: 'hangar-screen' }, f.el),
    // Live: the tab's preferred element (a stale one would send a lost-focus arrow key to
    // the tab bar, and Enter would then switch tabs).
    get focus() {
      return current?.focus;
    },
    tabs,
    refresh() {
      chip.set(Save.meta.cogs || 0, false);
      current?.refresh?.();
    },
    onReveal() {
      chip.set(Save.meta.cogs || 0, false);
    },
    onKey(e) {
      // Shortcut: L or Shift+Enter launches from anywhere in the hangar.
      if (e.code === 'KeyL' || (e.code === 'Enter' && e.shiftKey)) {
        launch();
        return true;
      }
      return false;
    },
    onMenu(m) {
      if (m.start) {
        launch();
        return true;
      }
      return false;
    },
  };
  return inst;
}
