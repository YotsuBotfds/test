// Menu navigation for the DOM interface (DESIGN §2.3, §8): spatial focus by bounding rects for
// keyboard and gamepad, confirm/back/tab handling, mouse-hover focus, device-aware glyphs.
//
// Keyboard is read from DOM keydown events (immediate, works with native key-repeat, and
// works even before the game loop calls ui.update). Gamepad comes from game.input.menu edges
// polled in update(); edges that coincide with a recent key press are ignored so a keyboard
// press reported by both paths never acts twice.

import { sfx } from './dom.js';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [data-nav]';
const KEY_DIRS = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};

export class Nav {
  /** @param {import('./ui.js').UI} ui */
  constructor(ui) {
    this.ui = ui;
    this.lastKeyAt = -1e9;
    this.device = 'kbm';
    this._onKey = (e) => this.onKey(e);
    this._onPointer = (e) => this.onPointer(e);
    this._onMove = (e) => this.onMove(e);
    /** Last mouse position (screen px) and when it last really moved (ms). */
    this._mx = NaN;
    this._my = NaN;
    this._movedAt = -1e9;
    window.addEventListener('keydown', this._onKey);
    window.addEventListener('pointerdown', this._onPointer, true);
    window.addEventListener('pointermove', this._onMove, { passive: true });

    let coarse = false;
    try {
      coarse = matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
    } catch {
      /* ignore */
    }
    this.setDevice(coarse ? 'touch' : 'kbm');
  }

  destroy() {
    window.removeEventListener('keydown', this._onKey);
    window.removeEventListener('pointerdown', this._onPointer, true);
    window.removeEventListener('pointermove', this._onMove);
  }

  setDevice(d) {
    if (d !== 'kbm' && d !== 'pad' && d !== 'touch') d = 'kbm';
    if (d === this.device && this.ui.root.dataset.device) return;
    this.device = d;
    this.ui.root.dataset.device = d;
  }

  /** Elements that can take focus inside the active layer, in DOM order. */
  focusables(scope = this.ui.scope) {
    if (!scope) return [];
    return [...scope.querySelectorAll(FOCUSABLE)].filter(
      (el) => el.getClientRects().length > 0 && !el.closest('[inert], .leaving, [data-nav-skip]'),
    );
  }

  get active() {
    const a = document.activeElement;
    const scope = this.ui.scope;
    return a && scope && scope.contains(a) && a !== scope ? a : null;
  }

  /** Focus an element without scrolling the page, then reveal it inside scroll boxes. */
  focus(el, sound = false) {
    if (!el) return;
    const changed = document.activeElement !== el;
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
    reveal(el);
    if (changed && sound) sfx('ui_move', { vol: 0.7 });
  }

  /** Focus the screen's preferred element (or the first focusable). */
  focusInitial(prefer) {
    const list = this.focusables();
    const el = (prefer && prefer.isConnected && list.includes(prefer) && prefer) || list[0];
    if (el) this.focus(el);
  }

  // ---------------------------------------------------------------- input sources

  onPointer(e) {
    this.setDevice(e.pointerType === 'touch' || e.pointerType === 'pen' ? 'touch' : 'kbm');
  }

  /**
   * Real mouse motion. Browsers also fire pointerover (and sometimes pointermove) when the DOM
   * changes under a still cursor — e.g. the next screen appearing after a click — so hover may
   * only move focus when the pointer's screen position actually changed. Otherwise whatever
   * lands under the cursor would steal the screen's intended initial focus. (pointermove, not
   * pointerover, drives hover focus: every real move reports the element under the cursor.)
   */
  onMove(e) {
    if (e.pointerType !== 'mouse') return;
    if (e.screenX === this._mx && e.screenY === this._my) return;
    const first = Number.isNaN(this._mx);
    this._mx = e.screenX;
    this._my = e.screenY;
    if (first) return; // no reference yet: can't tell motion from a synthetic event
    this._movedAt = performance.now();
    this.hover(e.target);
  }

  hover(target) {
    if (!this.ui.isOpen) return;
    const el = target?.closest?.(FOCUSABLE);
    if (!el || !this.ui.scope?.contains(el) || el === document.activeElement) return;
    if (el.matches('input[type=range]')) return;
    try {
      el.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
    sfx('ui_move', { vol: 0.35 });
  }

  onKey(e) {
    // Note: input/keyboard.js preventDefault()s arrows/Space/Tab (so the page never scrolls),
    // which is why defaultPrevented can't be used to detect "already handled" here.
    if (!this.ui.isOpen || isTextField(e.target)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    this.lastKeyAt = performance.now();
    this.setDevice('kbm');
    const inst = this.ui.top?.inst;
    if (inst?.onKey?.(e)) {
      e.preventDefault();
      return;
    }
    const code = e.code;
    const dir = KEY_DIRS[code];
    if (dir) {
      e.preventDefault();
      this.dir(dir);
      return;
    }
    if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') {
      e.preventDefault();
      if (!e.repeat) this.confirm();
      return;
    }
    if (code === 'Escape' || code === 'Backspace') {
      e.preventDefault();
      if (!e.repeat) this.back(code === 'Escape' ? 'pause-key' : 'back');
      return;
    }
    if (code === 'KeyP') {
      if (!e.repeat && this.ui.current === 'pause') this.back('pause-key');
      return;
    }
    if (code === 'KeyQ' || code === 'PageUp' || code === 'BracketLeft') {
      e.preventDefault();
      this.tab(-1);
    } else if (code === 'KeyE' || code === 'PageDown' || code === 'BracketRight') {
      e.preventDefault();
      this.tab(1);
    } else if (code === 'Tab') {
      // Keep Tab cycling inside the active layer.
      const list = this.focusables();
      if (!list.length) return;
      e.preventDefault();
      const i = list.indexOf(this.active);
      this.focus(list[(i + (e.shiftKey ? -1 : 1) + list.length) % list.length], true);
    }
  }

  /** Called every frame by ui.update(dt) while a screen is open. */
  update() {
    const input = this.ui.game?.input;
    if (!input) return;
    const ld = input.lastDevice;
    if (ld === 'pad' || ld === 'touch') this.setDevice(ld);
    const m = input.menu;
    if (!m) return;
    // Keyboard is handled from DOM events; only gamepad edges are taken from input.menu.
    if (ld === 'kbm' || performance.now() - this.lastKeyAt < 160) return;
    const any = m.up || m.down || m.left || m.right || m.confirm || m.back || m.tabL || m.tabR || m.start;
    if (!any) return;
    if (ld !== 'touch') this.setDevice(ld === 'kbm' ? 'kbm' : 'pad');
    const inst = this.ui.top?.inst;
    if (inst?.onMenu?.(m)) return;
    if (m.up) this.dir('up');
    else if (m.down) this.dir('down');
    else if (m.left) this.dir('left');
    else if (m.right) this.dir('right');
    if (m.confirm) this.confirm();
    else if (m.back) this.back('back');
    else if (m.start && this.ui.current === 'pause') this.back('pause-key');
    if (m.tabL) this.tab(-1);
    else if (m.tabR) this.tab(1);
  }

  // ---------------------------------------------------------------- actions

  confirm() {
    const inst = this.ui.top?.inst;
    if (inst?.onConfirm?.()) return;
    const a = this.active;
    if (!a) {
      this.focusInitial(inst?.focus);
      return;
    }
    if (a.matches('input[type=range]')) return;
    a.click();
  }

  back(source) {
    this.ui.back(source);
  }

  tab(dir) {
    const inst = this.ui.top?.inst;
    if (inst?.tabs) inst.tabs.step(dir);
  }

  dir(d) {
    const a = this.active;
    if (!a) {
      this.focusInitial(this.ui.top?.inst?.focus);
      sfx('ui_move', { vol: 0.7 });
      return;
    }
    // Sliders consume left/right.
    if ((d === 'left' || d === 'right') && a.matches('input[type=range]')) {
      const step = Number(a.step) || 0.05;
      const min = Number(a.min) || 0;
      const max = Number(a.max) || 1;
      const v = Math.min(max, Math.max(min, Number(a.value) + (d === 'right' ? step : -step)));
      if (v !== Number(a.value)) {
        a.value = String(v);
        a.dispatchEvent(new Event('input', { bubbles: true }));
        a.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return;
    }
    const target = this.find(a, d);
    if (target) {
      this.focus(target, true);
      return;
    }
    // Nothing that way: scroll the nearest scroll box, else bump.
    const box = scrollParent(a, this.ui.scope);
    if (box && (d === 'up' || d === 'down')) {
      const before = box.scrollTop;
      box.scrollBy({ top: d === 'down' ? 140 : -140, behavior: 'smooth' });
      if (box.scrollTop !== before || canScroll(box, d)) return;
    }
    sfx('ui_error', { vol: 0.35 });
  }

  /** Spatial search: nearest focusable in direction `d` from element `from`. */
  find(from, d) {
    const list = this.focusables().filter((el) => el !== from);
    if (!list.length) return null;
    const r0 = from.getBoundingClientRect();
    const horiz = d === 'left' || d === 'right';
    const sign = d === 'right' || d === 'down' ? 1 : -1;
    let best = null;
    let bestScore = Infinity;
    // Left/right prefer targets on the source's own row: scored on distance alone, a button low
    // in one column jumped *up* to whatever sat nearest in the next (settings: Fullscreen ->
    // Effects slider). Off-row targets are used only when nothing on the row qualifies.
    let bestInRow = null;
    let bestInRowScore = Infinity;
    for (const el of list) {
      const r = el.getBoundingClientRect();
      // primary distance along the travel axis (edge to edge)
      let primary;
      if (horiz) primary = sign > 0 ? r.left - r0.right : r0.left - r.right;
      else primary = sign > 0 ? r.top - r0.bottom : r0.top - r.bottom;
      const tol = Math.min(10, (horiz ? r0.width : r0.height) * 0.4);
      if (primary < -tol) {
        // Allow overlapping boxes only when the center is clearly further along.
        const dc = horiz
          ? (r.left + r.width / 2 - (r0.left + r0.width / 2)) * sign
          : (r.top + r.height / 2 - (r0.top + r0.height / 2)) * sign;
        if (dc < Math.max(12, (horiz ? r0.width : r0.height) * 0.5)) continue;
        primary = 0;
      }
      // gap on the perpendicular axis (0 when the intervals overlap)
      const gap = horiz
        ? Math.max(0, r.top - r0.bottom, r0.top - r.bottom)
        : Math.max(0, r.left - r0.right, r0.left - r.right);
      const centerOff = horiz
        ? Math.abs(r.top + r.height / 2 - (r0.top + r0.height / 2))
        : Math.abs(r.left + r.width / 2 - (r0.left + r0.width / 2));
      const score = Math.max(0, primary) + gap * 3 + centerOff * 0.2;
      // Near-ties go to the earlier element in reading order (list is in DOM order).
      if (score < bestScore - 0.5) {
        bestScore = score;
        best = el;
      }
      const rowOverlap = Math.min(r.bottom, r0.bottom) - Math.max(r.top, r0.top);
      if (horiz && rowOverlap > 4 && score < bestInRowScore - 0.5) {
        bestInRowScore = score;
        bestInRow = el;
      }
    }
    if (bestInRow) return bestInRow;
    if (best) return best;
    // Wrap vertically within lists (top <-> bottom) when the layer has no scroll box to move.
    // Targets in the source's column (overlapping horizontally) score by position alone: a
    // centre-offset penalty made the full-width Resume lose to the nearer Settings button.
    if (!horiz && !scrollParent(from, this.ui.scope)) {
      let pick = null;
      let ps = Infinity;
      for (const el of list) {
        const r = el.getBoundingClientRect();
        const along = sign > 0 ? r.top : -r.bottom;
        const gap = Math.max(0, r.left - r0.right, r0.left - r.right);
        const off = Math.abs(r.left + r.width / 2 - (r0.left + r0.width / 2));
        const s = along + gap + off * 0.05;
        if (s < ps) {
          ps = s;
          pick = el;
        }
      }
      return pick;
    }
    return null;
  }
}

function scrollParent(el, stop) {
  let n = el?.parentElement;
  while (n && n !== stop?.parentElement) {
    const cs = getComputedStyle(n);
    if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 2) return n;
    if (n === stop) break;
    n = n.parentElement;
  }
  return null;
}

function canScroll(box, d) {
  return d === 'down' ? box.scrollTop + box.clientHeight < box.scrollHeight - 1 : box.scrollTop > 0;
}

/** Scroll an element into view inside its scroll containers only (never the page). */
function reveal(el) {
  // A sticky element (e.g. the results action row on phones) is always in view: scrolling for it
  // would only push the content above it (the results headline) out of sight.
  for (let a = el; a && a !== document.body; a = a.parentElement) {
    if (getComputedStyle(a).position === 'sticky') return;
  }
  let n = el.parentElement;
  const r = el.getBoundingClientRect();
  while (n && n !== document.body) {
    const cs = getComputedStyle(n);
    const sy = /(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 2;
    const sx = /(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 2;
    if (sy || sx) {
      const b = n.getBoundingClientRect();
      const pad = 14;
      let dy = 0;
      let dx = 0;
      // An element too big to fit is only brought back when wholly out of view: chasing its far
      // edge scrolled its near edge (and a focused voyage card's lift) out of the box.
      if (sy) {
        if (r.height > b.height - 2 * pad) {
          if (r.bottom < b.top || r.top > b.bottom) dy = r.top - b.top - pad;
        } else if (r.top < b.top + pad) dy = r.top - b.top - pad;
        else if (r.bottom > b.bottom - pad) dy = r.bottom - b.bottom + pad;
      }
      if (sx) {
        if (r.width > b.width - 2 * pad) {
          if (r.right < b.left || r.left > b.right) dx = r.left - b.left - pad;
        } else if (r.left < b.left + pad) dx = r.left - b.left - pad;
        else if (r.right > b.right - pad) dx = r.right - b.right + pad;
      }
      if (dx || dy) n.scrollBy({ left: dx, top: dy, behavior: 'smooth' });
    }
    n = n.parentElement;
  }
}

/** Typing into a text field must not drive menu navigation. */
function isTextField(t) {
  if (!t || typeof t !== 'object') return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return tag === 'INPUT' && !/^(range|checkbox|radio|button|submit)$/i.test(t.type || '');
}
