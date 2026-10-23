// Small DOM toolkit shared by every UI screen: element builder, icons, formatting, guarded sfx.

import { Sprites } from '../gfx/sprites.js';
import { audio } from '../audio/audio.js';
import { cogSVG, medallionSVG } from './art.js';

/**
 * Hyperscript-style element builder.
 * props: class, style (string|object), dataset, text, html, attrs-as-keys, onX handlers.
 * @param {string} tag
 * @param {Record<string, any>|null} [props]
 * @param {...any} kids strings, nodes, arrays, null/false (skipped)
 * @returns {HTMLElement}
 */
export function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') e.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
      else if (k === 'style') {
        if (typeof v === 'string') e.style.cssText = v;
        else for (const [sk, sv] of Object.entries(v)) {
          if (sk.startsWith('--')) e.style.setProperty(sk, sv);
          else e.style[sk] = sv;
        }
      } else if (k === 'dataset') Object.assign(e.dataset, v);
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') {
        e.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, String(v));
    }
  }
  append(e, kids);
  return e;
}

function append(e, kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false || k === '') continue;
    if (Array.isArray(k)) append(e, k);
    else e.append(k instanceof Node ? k : String(k));
  }
}

/** Parse an SVG/HTML string into a single element. */
export function frag(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild;
}

/** A brass-plaque button. */
export function btn(label, onClick, opts = {}) {
  const b = h(
    'button',
    {
      type: 'button',
      class: ['btn', opts.kind && `btn-${opts.kind}`, opts.class],
      'aria-label': opts.aria,
      dataset: opts.dataset,
      title: opts.title,
    },
    opts.icon || null,
    h('span', { class: 'btn-label' }, label),
    opts.glyph ? glyph(opts.glyph) : null,
  );
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

const GLYPHS = {
  confirm: { kbm: 'Enter', pad: 'A' },
  back: { kbm: 'Esc', pad: 'B' },
  tabL: { kbm: 'Q', pad: 'LB' },
  tabR: { kbm: 'E', pad: 'RB' },
  reroll: { kbm: 'R', pad: 'Y' },
  start: { kbm: 'L', pad: 'Start' },
};

/** Device-aware input hint (shows the keyboard or gamepad label; hidden on touch). */
export function glyph(kind) {
  const g = GLYPHS[kind] || { kbm: kind, pad: kind };
  return h(
    'span',
    { class: `glyph glyph-${kind}`, 'aria-hidden': 'true' },
    h('span', { class: 'g-kbm' }, g.kbm),
    h('span', { class: 'g-pad' }, g.pad),
  );
}

/**
 * Sprite icon as <img>, falling back to an inline SVG medallion when the sprite is not
 * registered (keeps the console free of placeholder warnings while art lands).
 * @param {string} name sprite name
 * @param {number} [px] rendered pixel size of the data URL
 * @param {{cls?:string, alt?:string, glyph?:string}} [opts]
 */
export function icon(name, px = 64, opts = {}) {
  if (name && Sprites.has(name)) {
    let src = '';
    try {
      src = Sprites.iconURL(name, px);
    } catch {
      src = '';
    }
    if (src) {
      return h('img', {
        class: ['icon', opts.cls],
        src,
        alt: opts.alt || '',
        draggable: 'false',
        width: px,
        height: px,
      });
    }
  }
  const el = frag(medallionSVG(opts.glyph || glyphFor(name)));
  el.classList.add('icon', 'icon-fallback');
  if (opts.cls) for (const c of opts.cls.split(' ')) c && el.classList.add(c);
  return el;
}

function glyphFor(name) {
  const n = String(name || '').replace(/^(icon_|enemy_|boss_|hull_|turret_)/, '');
  return (n[0] || '?').toUpperCase();
}

/** Inline brass cog glyph. */
export function cog(cls = '') {
  const el = frag(cogSVG());
  el.classList.add('cog-glyph');
  if (cls) el.classList.add(cls);
  return el;
}

/** Cog balance chip. Returns {el, set(value, animate)}. */
export function cogChip(value = 0) {
  const num = h('span', { class: 'cogchip-num' }, fmtInt(value));
  const el = h('div', { class: 'cogchip', title: 'Cogs' }, cog(), num);
  let shown = value;
  let raf = 0;
  return {
    el,
    set(v, animate = true) {
      cancelAnimationFrame(raf);
      if (!animate || reducedMotion()) {
        shown = v;
        num.textContent = fmtInt(v);
        return;
      }
      const from = shown;
      const t0 = performance.now();
      el.classList.remove('pulse');
      void el.offsetWidth;
      el.classList.add('pulse');
      const step = (now) => {
        const k = Math.min(1, (now - t0) / 500);
        shown = Math.round(from + (v - from) * (1 - (1 - k) ** 3));
        num.textContent = fmtInt(shown);
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    },
    deny() {
      el.classList.remove('deny');
      void el.offsetWidth;
      el.classList.add('deny');
    },
  };
}

/** Level pips: filled up to `level`, optional highlighted `next`. */
export function pips(level, max, next = 0) {
  const el = h('div', { class: 'pips', 'aria-label': `Level ${level} of ${max}` });
  for (let i = 1; i <= max; i++) {
    el.append(h('i', { class: ['pip', i <= level && 'on', next && i === next && 'next'] }));
  }
  return el;
}

/** Engraved section heading with flourishes. */
export function heading(text, tag = 'h2', cls = '') {
  return h(tag, { class: ['engraved', cls] }, h('span', null, text));
}

/** Screen title plaque (brass nameplate). */
export function plaque(text, sub) {
  return h(
    'div',
    { class: 'plaque' },
    h('h1', { class: 'plaque-title' }, text),
    sub ? h('div', { class: 'plaque-sub' }, sub) : null,
  );
}

export function fmtInt(n) {
  const v = Math.round(Number(n) || 0);
  return v.toLocaleString('en-US');
}

export function fmtTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}

/** Text or function → string (content defs use both). */
export function txt(v, ...args) {
  try {
    return typeof v === 'function' ? String(v(...args) ?? '') : v == null ? '' : String(v);
  } catch {
    return '';
  }
}

export function reducedMotion() {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Guarded UI sound. */
export function sfx(name, opts) {
  try {
    audio.play?.(name, opts);
  } catch {
    /* audio is optional */
  }
}

/** Retrigger a one-shot CSS animation class. */
export function kick(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

/** Simple tab bar. Returns {el, select(i), index, step(dir)}. */
export function tabBar(labels, onSelect, start = 0) {
  const buttons = labels.map((l, i) =>
    h(
      'button',
      {
        type: 'button',
        class: 'tab',
        role: 'tab',
        dataset: { tab: String(i) },
        onclick: () => api.select(i, true),
      },
      h('span', null, l),
    ),
  );
  const el = h(
    'div',
    { class: 'tabbar', role: 'tablist' },
    glyph('tabL'),
    h('div', { class: 'tabs' }, buttons),
    glyph('tabR'),
  );
  const api = {
    el,
    buttons,
    index: -1,
    select(i, user = false) {
      i = (i + labels.length) % labels.length;
      if (i === api.index) return;
      api.index = i;
      buttons.forEach((b, j) => {
        b.classList.toggle('active', j === i);
        b.setAttribute('aria-selected', String(j === i));
      });
      if (user) sfx('ui_move', { pitch: 1.1 });
      try {
        onSelect(i);
      } catch (err) {
        console.error('[ui] tab failed to render', err);
      }
    },
    step(dir) {
      api.select(api.index + dir, true);
    },
  };
  api.select(start);
  return api;
}

/** Shallow guard for content lookups that may be stubs. */
export function safe(fn, fallback) {
  try {
    const v = fn();
    return v === undefined ? fallback : v;
  } catch {
    return fallback;
  }
}

/**
 * Standard full-screen cabinet: brass nameplate header, optional tabs, framed parchment body
 * and a footer row of actions.
 * @param {{title:string, sub?:any, right?:any, left?:any, tabs?:{el:HTMLElement}, body:any,
 *          footer?:any, cls?:string, bodyCls?:string}} o
 */
export function frame(o) {
  const body = h('div', { class: ['board-body', o.bodyCls] }, o.body);
  const el = h(
    'div',
    { class: ['cabinet', o.cls] },
    h(
      'header',
      { class: 'cab-head' },
      h('div', { class: 'cab-head-l' }, o.left || null),
      plaque(o.title, o.sub),
      h('div', { class: 'cab-head-r' }, o.right || null),
    ),
    h('div', { class: 'board' }, o.tabs ? o.tabs.el : null, h('div', { class: 'board-inner' }, body)),
    o.footer ? h('footer', { class: 'cab-foot' }, o.footer) : null,
  );
  return { el, body };
}

/** Footer back button with device glyph. */
export function backBtn(onClick, label = 'Back') {
  return btn(label, onClick, { kind: 'ghost', class: 'btn-back', glyph: 'back' });
}
