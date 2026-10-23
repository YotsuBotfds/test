// DOM interface manager (DESIGN §4.11, WP9): a stack of screens over the canvas, modal
// dialogs, toasts, PWA install/update hooks and menu navigation.
//
// Screen modules live in ./screens/*.js and export `build(ui, params)` returning an instance:
//   { el, focus?, modal?, tabs?:{step(dir)}, back?(source), update?(dt), onKey?(e)->bool,
//     onMenu?(menu)->bool, onConfirm?()->bool, onReveal?(), refresh?(), destroy?() }

import { events } from '../core/events.js';
import { audio } from '../audio/audio.js';
import { pwa } from '../pwa.js';
import { Nav } from './nav.js';
import { h, icon, sfx, kick, frag } from './dom.js';
import { medalSVG } from './art.js';

import title from './screens/title.js';
import modes from './screens/modes.js';
import hangar from './screens/hangar.js';
import codex from './screens/codex.js';
import achievements from './screens/achievements.js';
import settings from './screens/settings.js';
import credits from './screens/credits.js';
import howto from './screens/howto.js';
import pause from './screens/pause.js';
import levelup from './screens/levelup.js';
import results from './screens/results.js';
import confirm from './screens/confirm.js';

const SCREENS = {
  title, modes, hangar, codex, achievements, settings, credits, howto, pause, levelup, results, confirm,
};

export class UI {
  /** @param {any} game */
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui');
    if (!this.root) {
      this.root = h('div', { id: 'ui' });
      document.body.append(this.root);
    }
    this.root.classList.add('ui-root');
    this.root.replaceChildren();
    this.layer = h('div', { class: 'ui-layer' });
    this.toastBox = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    this.root.append(this.layer, this.toastBox);
    /** @type {{name:string, params:any, inst:any, el:HTMLElement, lastFocus?:Element}[]} */
    this.stack = [];
    this.lastMode = 'campaign';
    this.installable = !!pwa?.canInstall;
    this._musicReq = null;
    this.nav = new Nav(this);
    this._offs = [
      events.on('pwa:installable', () => {
        this.installable = true;
        this.refreshAll();
      }),
      events.on('pwa:update', () => this.updateToast()),
    ];
    const unlock = () => {
      try {
        audio.unlock?.();
      } catch {
        /* optional */
      }
    };
    this.root.addEventListener('pointerdown', unlock);
  }

  // ------------------------------------------------------------------ state

  get isOpen() {
    return this.stack.length > 0;
  }

  get top() {
    return this.stack[this.stack.length - 1] || null;
  }

  /** Name of the top screen (or null). */
  get current() {
    return this.top?.name || null;
  }

  /** Element that keyboard/gamepad focus is confined to. */
  get scope() {
    return this.top?.el || null;
  }

  // ------------------------------------------------------------------ navigation API

  /**
   * Replace everything with a screen.
   * @param {string} name
   * @param {object} [params]
   */
  show(name, params = {}) {
    this._clear();
    this._open(name, params);
  }

  /** Open a stack of screens at once, e.g. [['title'], ['modes'], ['hangar', {mode}]]. */
  showPath(list) {
    this._clear();
    list.forEach(([name, params], i) => this._open(name, params || {}, i < list.length - 1));
  }

  /** Open a screen on top of the current one; back returns here. */
  push(name, params = {}) {
    this._open(name, params);
  }

  /** Close the top screen and reveal the one beneath. */
  pop() {
    const top = this.stack.pop();
    if (!top) return;
    this._retire(top);
    const next = this.top;
    if (!next) {
      this._sync();
      return;
    }
    next.el.classList.remove('covered', 'under-modal');
    next.el.removeAttribute('inert');
    next.el.classList.add('revealed');
    try {
      next.inst.onReveal?.();
    } catch (err) {
      console.error('[ui] onReveal failed', err);
    }
    this._sync();
    this.nav.focusInitial(next.lastFocus || next.inst.focus);
    this._musicFor(next.name);
    events.emit('ui:screen', { name: next.name });
  }

  /** Back action from keyboard/gamepad/UI. */
  back(source = 'back') {
    const top = this.top;
    if (!top) return;
    if (top.name === 'pause' && source === 'pause-key') {
      // The game also sees Esc/P/Start as its pause edge this frame; resume a few frames later
      // so the same press can't immediately re-pause the run.
      const inst = top.inst;
      setTimeout(() => {
        if (this.top?.inst === inst && (this.game?.state ?? 'paused') === 'paused') inst.back?.();
      }, 90);
      return;
    }
    if (top.inst.back) top.inst.back(source);
    else if (this.stack.length > 1) {
      sfx('ui_back');
      this.pop();
    }
  }

  /** Close every screen (gameplay resumes control of the canvas). */
  hide() {
    if (!this.stack.length) return;
    const a = document.activeElement;
    if (a && this.root.contains(a)) a.blur?.();
    this._clear();
  }

  update(dt) {
    if (!this.stack.length) return;
    this.nav.update(dt);
    try {
      this.top?.inst.update?.(dt);
    } catch (err) {
      console.error('[ui] screen update failed', err);
    }
  }

  /** Re-render screens that show live data (e.g. after a purchase or PWA event). */
  refreshAll() {
    for (const s of this.stack) {
      try {
        s.inst.refresh?.();
      } catch (err) {
        console.error('[ui] refresh failed', err);
      }
    }
  }

  // ------------------------------------------------------------------ game hooks (§4.11)

  /**
   * Level-up / refit / crate card pick.
   * @param {{title?:string, subtitle?:string, cards:any[], rerolls?:number, player?:any,
   *          onPick:(card:any)=>void, onReroll?:()=>any[]}} opts
   */
  showLevelUp(opts) {
    this.show('levelup', opts || {});
  }

  /** Run results. */
  showResults(summary, opts = {}) {
    this.show('results', { summary: summary || {}, ...opts });
  }

  /**
   * Modal yes/no dialog over the current screen.
   * @param {{title:string, text?:string, yes?:string, no?:string, danger?:boolean}} opts
   * @returns {Promise<boolean>}
   */
  confirm(opts) {
    return new Promise((resolve) => this.push('confirm', { ...opts, resolve }));
  }

  /**
   * Toast notification (top-right stack, auto-dismiss).
   * @param {string} text
   * @param {{icon?:string, kind?:'info'|'achievement'|'warning'|'update', time?:number,
   *          title?:string, desc?:string, action?:{label:string, fn:()=>void}}} [opts]
   */
  toast(text, opts = {}) {
    const kind = opts.kind || 'info';
    const time = opts.time ?? (kind === 'achievement' ? 4.5 : kind === 'update' ? 0 : 3.2);
    let body = String(text ?? '');
    let label = opts.title;
    if (kind === 'achievement') {
      body = body.replace(/^\s*achievement(\s+unlocked)?\s*[:!\-–—]*\s*/i, '');
      label = label || 'Achievement Unlocked';
    }
    let ic = null;
    if (opts.icon) ic = icon(opts.icon, 64, { cls: 'toast-icon' });
    else if (kind === 'achievement') {
      ic = frag(medalSVG('gold'));
      ic.classList.add('toast-icon');
    }
    const close = () => {
      if (!el.isConnected || el.classList.contains('out')) return;
      el.classList.add('out');
      setTimeout(() => el.remove(), 380);
    };
    const el = h(
      'div',
      {
        class: ['toast', `toast-${kind}`, opts.action && 'has-action'],
        style: time > 0 ? { '--t': `${time}s` } : null,
        onclick: opts.action ? null : close,
      },
      ic,
      h(
        'div',
        { class: 'toast-body' },
        label ? h('div', { class: 'toast-label' }, label) : null,
        h('div', { class: 'toast-text' }, body),
        opts.desc ? h('div', { class: 'toast-desc' }, opts.desc) : null,
      ),
      opts.action
        ? h(
            'button',
            {
              type: 'button',
              class: 'btn btn-small btn-primary',
              onclick: (e) => {
                e.stopPropagation();
                try {
                  opts.action.fn();
                } finally {
                  close();
                }
              },
            },
            opts.action.label,
          )
        : null,
      time > 0 ? h('i', { class: 'toast-timer' }) : null,
    );
    this.toastBox.append(el);
    const all = this.toastBox.querySelectorAll('.toast:not(.out)');
    if (all.length > 4) all[0].classList.add('out');
    for (const t of this.toastBox.querySelectorAll('.toast.out')) setTimeout(() => t.remove(), 380);
    if (time > 0) setTimeout(close, time * 1000);
    if (kind === 'warning') sfx('ui_error', { vol: 0.6 });
    return { el, close };
  }

  /** "New rigging available" (service worker update) toast. */
  updateToast() {
    if (this._updateToast?.el.isConnected) return;
    this._updateToast = this.toast('A fresh set of rigging has arrived from the shipyard.', {
      kind: 'update',
      title: 'New rigging available',
      time: 0,
      action: {
        label: 'Reload',
        fn: () => {
          try {
            if (pwa?.applyUpdate) pwa.applyUpdate();
            else location.reload();
          } catch {
            location.reload();
          }
        },
      },
    });
  }

  // ------------------------------------------------------------------ internals

  _open(name, params, covered = false) {
    const build = SCREENS[name];
    let inst;
    try {
      if (!build) throw new Error(`unknown screen "${name}"`);
      inst = build(this, params || {});
    } catch (err) {
      console.error(`[ui] failed to build screen "${name}"`, err);
      inst = fallbackScreen(this, name);
    }
    const el = inst.el;
    el.classList.add('screen', `screen-${name}`);
    el.dataset.screen = name;
    const prev = this.top;
    if (prev) {
      prev.lastFocus = document.activeElement;
      prev.el.setAttribute('inert', '');
      prev.el.classList.add(inst.modal ? 'under-modal' : 'covered');
    }
    const entry = { name, params, inst, el };
    this.stack.push(entry);
    this.layer.append(el);
    if (covered) {
      el.setAttribute('inert', '');
      el.classList.add('covered');
    } else {
      kick(el, 'entering');
      this._sync();
      this.nav.focusInitial(inst.focus);
      this._musicFor(name);
      events.emit('ui:screen', { name });
    }
    if (name !== 'levelup' && name !== 'pause' && name !== 'results') this.lastScreen = name;
  }

  _retire(entry) {
    try {
      entry.inst.destroy?.();
    } catch (err) {
      console.error('[ui] destroy failed', err);
    }
    const el = entry.el;
    el.setAttribute('inert', '');
    el.classList.remove('entering', 'covered', 'under-modal');
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 260);
  }

  _clear() {
    while (this.stack.length) this._retire(this.stack.pop());
    this._sync();
  }

  _sync() {
    this.root.classList.toggle('open', this.stack.length > 0);
    this.root.dataset.screen = this.current || '';
  }

  /** Menu music between title and hangar (only while no run is active). */
  _musicFor(name) {
    const st = this.game?.state;
    if (st && st !== 'title' && st !== 'boot') return;
    let track = null;
    if (name === 'modes' || name === 'hangar') track = 'hangar';
    else if (name === 'title' && this._musicReq === 'hangar') track = 'title';
    if (!track || track === this._musicReq) return;
    this._musicReq = track;
    try {
      audio.music?.(track, { fade: 1.2 });
    } catch {
      /* optional */
    }
  }
}

function fallbackScreen(ui, name) {
  const b = h('button', { type: 'button', class: 'btn', onclick: () => (ui.stack.length > 1 ? ui.pop() : ui.show('title')) }, 'Back');
  const el = h(
    'div',
    { class: 'fallback' },
    h('div', { class: 'panel parchment', style: 'padding:24px;text-align:center' },
      h('h2', { class: 'engraved' }, h('span', null, 'Out of Order')),
      h('p', null, `The ${name} cabin is still under construction.`), b),
  );
  return { el, focus: b };
}
