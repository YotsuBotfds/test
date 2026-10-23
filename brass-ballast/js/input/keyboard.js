// Keyboard + mouse state with per-frame edge latching (DESIGN §2.3, §4.18).
// DOM events fill "pending" sets; latch() (called once per Input.update) moves them into the
// frame sets, so every edge is visible for exactly one frame no matter how often it is read.

/** Keys whose browser default we suppress during play (scrolling, focus hopping). */
const SUPPRESS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'Backspace',
  'PageUp', 'PageDown',
]);

const isTextTarget = (t) =>
  !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

export class KeyboardMouse {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {(kind: 'key'|'mouse', strong: boolean) => void} onActivity
   */
  constructor(canvas, onActivity) {
    this.canvas = canvas;
    this.onActivity = onActivity;
    this.held = new Set();
    this._pending = new Set(); // fresh presses since last latch (no auto-repeat)
    this._pendingMenu = new Set(); // presses incl. OS auto-repeat (menu navigation)
    this.pressed = new Set();
    this.menuPressed = new Set();
    // Mouse in canvas CSS pixels.
    this.mouse = { x: 0, y: 0, seen: false, left: false, right: false, middle: false, inside: true };
    this._moveAcc = 0;
    this._lastMX = NaN;
    this._lastMY = NaN;
    this._rect = null;
    this._rectAge = 99;
    this._bind();
  }

  _canvasPos(e) {
    // Bounding rect is cheap but layout-forcing; refresh it a few times a second.
    if (!this._rect || this._rectAge > 0.25) {
      this._rect = this.canvas.getBoundingClientRect();
      this._rectAge = 0;
    }
    return [e.clientX - this._rect.left, e.clientY - this._rect.top];
  }

  _bind() {
    const w = window;
    this._h = {
      keydown: (e) => {
        if (isTextTarget(e.target)) return;
        const code = e.code || e.key;
        if (!e.repeat) {
          if (!this.held.has(code)) this._pending.add(code);
          this.held.add(code);
        }
        this._pendingMenu.add(code === 'Tab' && e.shiftKey ? 'ShiftTab' : code);
        if (SUPPRESS.has(code) && !e.ctrlKey && !e.metaKey && !e.altKey) e.preventDefault();
        this.onActivity('key', true);
      },
      keyup: (e) => {
        this.held.delete(e.code || e.key);
      },
      blur: () => this.releaseAll(),
      visibility: () => {
        if (document.hidden) this.releaseAll();
      },
      pointermove: (e) => {
        if (e.pointerType === 'touch') return;
        const [x, y] = this._canvasPos(e);
        if (!Number.isNaN(this._lastMX)) this._moveAcc += Math.abs(x - this._lastMX) + Math.abs(y - this._lastMY);
        this._lastMX = x;
        this._lastMY = y;
        this.mouse.x = x;
        this.mouse.y = y;
        this.mouse.inside = true;
        // Ignore sub-pixel jitter and the synthetic move some browsers emit on focus.
        if (this._moveAcc > 6) {
          this._moveAcc = 0;
          this.mouse.seen = true;
          this.onActivity('mouse', true);
        }
      },
      pointerdown: (e) => {
        if (e.pointerType === 'touch') return;
        const [x, y] = this._canvasPos(e);
        this.mouse.x = x;
        this.mouse.y = y;
        this.mouse.seen = true;
        if (e.button === 0) this.mouse.left = true;
        else if (e.button === 2) {
          this.mouse.right = true;
          this._pending.add('Mouse2');
        } else if (e.button === 1) {
          this.mouse.middle = true;
          this._pending.add('Mouse1');
          e.preventDefault();
        }
        this.onActivity('mouse', true);
      },
      pointerup: (e) => {
        if (e.pointerType === 'touch') return;
        if (e.button === 0) this.mouse.left = false;
        else if (e.button === 2) this.mouse.right = false;
        else if (e.button === 1) this.mouse.middle = false;
      },
      leave: () => {
        this.mouse.inside = false;
      },
      contextmenu: (e) => e.preventDefault(),
    };
    w.addEventListener('keydown', this._h.keydown);
    w.addEventListener('keyup', this._h.keyup);
    w.addEventListener('blur', this._h.blur);
    document.addEventListener('visibilitychange', this._h.visibility);
    w.addEventListener('pointermove', this._h.pointermove, { passive: true });
    // Buttons only count on the canvas (DOM menus sit above it) but releases count anywhere.
    this.canvas.addEventListener('pointerdown', this._h.pointerdown);
    w.addEventListener('pointerup', this._h.pointerup);
    w.addEventListener('pointercancel', this._h.pointerup);
    this.canvas.addEventListener('pointerleave', this._h.leave);
    this.canvas.addEventListener('contextmenu', this._h.contextmenu);
  }

  /** Move pending edges into this frame's sets. */
  latch(dt) {
    this._rectAge += dt;
    const p = this.pressed;
    this.pressed = this._pending;
    this._pending = p;
    this._pending.clear();
    const m = this.menuPressed;
    this.menuPressed = this._pendingMenu;
    this._pendingMenu = m;
    this._pendingMenu.clear();
  }

  isDown(code) {
    return this.held.has(code);
  }

  hit(code) {
    return this.pressed.has(code);
  }

  /** Any of the codes pressed this frame. */
  anyHit(codes) {
    for (let i = 0; i < codes.length; i++) if (this.pressed.has(codes[i])) return true;
    return false;
  }

  anyDown(codes) {
    for (let i = 0; i < codes.length; i++) if (this.held.has(codes[i])) return true;
    return false;
  }

  anyMenu(codes) {
    for (let i = 0; i < codes.length; i++) if (this.menuPressed.has(codes[i])) return true;
    return false;
  }

  releaseAll() {
    this.held.clear();
    this.mouse.left = this.mouse.right = this.mouse.middle = false;
  }

  invalidateRect() {
    this._rect = null;
  }

  destroy() {
    const w = window;
    w.removeEventListener('keydown', this._h.keydown);
    w.removeEventListener('keyup', this._h.keyup);
    w.removeEventListener('blur', this._h.blur);
    document.removeEventListener('visibilitychange', this._h.visibility);
    w.removeEventListener('pointermove', this._h.pointermove);
    this.canvas.removeEventListener('pointerdown', this._h.pointerdown);
    w.removeEventListener('pointerup', this._h.pointerup);
    w.removeEventListener('pointercancel', this._h.pointerup);
    this.canvas.removeEventListener('pointerleave', this._h.leave);
    this.canvas.removeEventListener('contextmenu', this._h.contextmenu);
  }
}
