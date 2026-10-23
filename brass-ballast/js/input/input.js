// STUB (WP2 replaces) — minimal keyboard + mouse input. API: DESIGN §4.18.

const MOVE = { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] };
const AIM = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

export class Input {
  constructor(canvas, renderer) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0, down: false, right: false, seen: false };
    this.lastDevice = 'kbm';
    this.padCount = 0;
    this.pads = [];
    this.menu = {};
    this._first = [];
    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      this._interact();
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('pointermove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.seen = true;
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 2) {
        this.mouse.right = true;
        this.pressed.add('Mouse2');
      } else this.mouse.down = true;
      this._interact();
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button === 2) this.mouse.right = false;
      else this.mouse.down = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  _interact() {
    const fns = this._first;
    this._first = [];
    for (const fn of fns) fn();
  }
  onFirstInteraction(fn) {
    this._first.push(fn);
  }
  update() {
    const p = this.pressed;
    const any = (...c) => c.some((k) => p.has(k));
    this.menu = {
      up: any('ArrowUp', 'KeyW'), down: any('ArrowDown', 'KeyS'), left: any('ArrowLeft', 'KeyA'),
      right: any('ArrowRight', 'KeyD'), confirm: any('Enter', 'Space'), back: any('Escape', 'Backspace'),
      tabL: false, tabR: false, start: any('Escape', 'KeyP'),
    };
    this._edges = { boost: any('Space', 'ShiftLeft', 'ShiftRight'), bomb: any('KeyE', 'KeyQ', 'Mouse2'), pause: any('Escape', 'KeyP') };
    p.clear();
  }
  controls(i = 0) {
    const c = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, aimMag: 0, aimMode: 'none', mouseWorld: null, fire: false, boost: false, bomb: false, pause: false, device: 'kbm' };
    if (i !== 0) return c;
    for (const [k, [x, y]] of Object.entries(MOVE)) if (this.keys.has(k)) { c.moveX += x; c.moveY += y; }
    const l = Math.hypot(c.moveX, c.moveY);
    if (l > 1) { c.moveX /= l; c.moveY /= l; }
    let ax = 0;
    let ay = 0;
    for (const [k, [x, y]] of Object.entries(AIM)) if (this.keys.has(k)) { ax += x; ay += y; }
    if (ax || ay) {
      const al = Math.hypot(ax, ay);
      c.aimX = ax / al; c.aimY = ay / al; c.aimMag = 1; c.aimMode = 'keys'; c.fire = true;
    } else if (this.mouse.seen) {
      c.aimMode = 'mouse';
      c.mouseWorld = this.renderer.screenToWorld(this.mouse.x, this.mouse.y);
      c.fire = this.mouse.down;
    }
    Object.assign(c, this._edges || {});
    return c;
  }
  joinRequested() { return null; }
  bindPlayer() {}
  setTouchLayout() {}
  setGameplayActive() {}
  vibrate() {}
  drawOverlay() {}
}
