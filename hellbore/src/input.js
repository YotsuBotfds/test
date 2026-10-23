// Unified input: keyboard + mouse, gamepads, and dual floating touch sticks.
import { clamp } from './util.js';

const STICK_R = 34;
const DEAD = 0.18;

const MENU_KEYS = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  confirm: ['Enter', 'Space', 'NumpadEnter'],
  back: ['Escape', 'Backspace'],
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.W = 320;
    this.H = 240;
    this.keys = new Set();
    this.keyEdges = new Set();
    this.mouse = { x: -100, y: -100, left: false, right: false, rightEdge: false, seen: false };
    this.clicks = [];
    this.pointers = new Map();
    this.mode = window.matchMedia?.('(pointer: coarse)').matches ? 'touch' : 'kbm';
    this.gameplay = false;
    this.buttons = []; // touch buttons: {id, x, y, r}
    this.btnEdges = new Set();
    this.btnHeld = new Set();
    this.sticks = { move: null, aim: null };
    this.pad = { axes: [0, 0, 0, 0], held: new Array(18).fill(false), edges: new Set(), connected: false };
    this.lastAim = { x: 0, y: 1 };
    this.onActivity = null;
    this.out = {
      move: { x: 0, y: 0 },
      aim: { x: 0, y: 1 },
      aimMode: 'mouse',
      fire: false,
      dash: false,
      bomb: false,
      pause: false,
      menu: { up: false, down: false, left: false, right: false, confirm: false, back: false },
    };
    this.bind();
  }

  bind() {
    const c = this.canvas;
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.keyEdges.add(e.code);
      this.keys.add(e.code);
      this.setMode('kbm');
      this.activity();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.left = this.mouse.right = false;
      this.pointers.clear();
      this.sticks.move = this.sticks.aim = null;
      this.btnHeld.clear();
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => this.pointerDown(e));
    c.addEventListener('pointermove', (e) => this.pointerMove(e));
    c.addEventListener('pointerup', (e) => this.pointerUp(e));
    c.addEventListener('pointercancel', (e) => this.pointerUp(e, true));
    window.addEventListener('gamepadconnected', () => {
      this.pad.connected = true;
    });
  }

  activity() {
    if (this.onActivity) this.onActivity();
  }

  setMode(m) {
    this.mode = m;
  }

  toInternal(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * this.W,
      y: ((e.clientY - r.top) / r.height) * this.H,
    };
  }

  pointerDown(e) {
    const p = this.toInternal(e);
    this.activity();
    if (e.pointerType === 'mouse') {
      this.setMode('kbm');
      this.mouse.x = p.x;
      this.mouse.y = p.y;
      this.mouse.seen = true;
      if (e.button === 0) {
        this.mouse.left = true;
        this.clicks.push({ x: p.x, y: p.y });
      }
      if (e.button === 2) {
        this.mouse.right = true;
        this.mouse.rightEdge = true;
      }
      return;
    }
    e.preventDefault();
    this.setMode('touch');
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a nicety; some browsers refuse it for synthetic pointers.
    }
    const ptr = { x: p.x, y: p.y, sx: p.x, sy: p.y, role: 'tap', btn: null };
    if (this.gameplay) {
      const b = this.buttons.find((b) => (p.x - b.x) ** 2 + (p.y - b.y) ** 2 <= (b.r + 6) ** 2);
      if (b) {
        ptr.role = 'button';
        ptr.btn = b.id;
        this.btnEdges.add(b.id);
        this.btnHeld.add(b.id);
      } else if (p.x < this.W / 2 && !this.sticks.move) {
        ptr.role = 'move';
        this.sticks.move = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
      } else if (p.x >= this.W / 2 && !this.sticks.aim) {
        ptr.role = 'aim';
        this.sticks.aim = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
      }
    }
    this.pointers.set(e.pointerId, ptr);
  }

  pointerMove(e) {
    const p = this.toInternal(e);
    if (e.pointerType === 'mouse') {
      if (Math.abs(p.x - this.mouse.x) + Math.abs(p.y - this.mouse.y) > 0.5) {
        this.mouse.seen = true;
        if (this.mode !== 'kbm' && (Math.abs(e.movementX) + Math.abs(e.movementY) > 2)) this.setMode('kbm');
      }
      this.mouse.x = p.x;
      this.mouse.y = p.y;
      return;
    }
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;
    ptr.x = p.x;
    ptr.y = p.y;
    for (const k of ['move', 'aim']) {
      const s = this.sticks[k];
      if (s && s.id === e.pointerId) {
        s.x = p.x;
        s.y = p.y;
        const dx = s.x - s.ox;
        const dy = s.y - s.oy;
        const d = Math.hypot(dx, dy);
        if (d > STICK_R) {
          s.ox = s.x - (dx / d) * STICK_R;
          s.oy = s.y - (dy / d) * STICK_R;
        }
      }
    }
  }

  pointerUp(e, cancelled = false) {
    if (e.pointerType === 'mouse') {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
      return;
    }
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;
    this.pointers.delete(e.pointerId);
    if (ptr.role === 'button') this.btnHeld.delete(ptr.btn);
    for (const k of ['move', 'aim']) {
      if (this.sticks[k] && this.sticks[k].id === e.pointerId) this.sticks[k] = null;
    }
    if (!cancelled && ptr.role === 'tap' && Math.hypot(ptr.x - ptr.sx, ptr.y - ptr.sy) < 14) {
      this.clicks.push({ x: ptr.x, y: ptr.y });
    }
  }

  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads) {
      if (p && p.connected) {
        pad = p;
        break;
      }
    }
    const P = this.pad;
    P.edges.clear();
    if (!pad) {
      P.axes = [0, 0, 0, 0];
      P.held.fill(false);
      return;
    }
    let active = false;
    for (let i = 0; i < Math.min(18, pad.buttons.length); i++) {
      const b = pad.buttons[i];
      const down = b ? b.pressed || b.value > 0.5 : false;
      if (down && !P.held[i]) {
        P.edges.add(i);
        active = true;
      }
      P.held[i] = down;
    }
    P.axes = [0, 1, 2, 3].map((i) => pad.axes[i] || 0);
    if (P.axes.some((a) => Math.abs(a) > 0.4)) active = true;
    if (active) {
      this.setMode('pad');
      this.activity();
    }
  }

  stick(x, y) {
    const m = Math.hypot(x, y);
    if (m < DEAD) return { x: 0, y: 0, m: 0 };
    const s = Math.min(1, (m - DEAD) / (1 - DEAD));
    return { x: (x / m) * s, y: (y / m) * s, m: s };
  }

  /** Recompute this frame's actions. Call once per frame before the game update. */
  poll() {
    this.pollPad();
    const o = this.out;
    const K = this.keys;
    const E = this.keyEdges;
    const P = this.pad;

    // Movement.
    let mx = (K.has('KeyD') ? 1 : 0) - (K.has('KeyA') ? 1 : 0);
    let my = (K.has('KeyS') ? 1 : 0) - (K.has('KeyW') ? 1 : 0);
    const kl = Math.hypot(mx, my);
    if (kl > 0) {
      mx /= kl;
      my /= kl;
    }
    const ls = this.stick(P.axes[0], P.axes[1]);
    if (ls.m > 0) {
      mx = ls.x;
      my = ls.y;
    }
    if (P.held[12] || P.held[13] || P.held[14] || P.held[15]) {
      mx = (P.held[15] ? 1 : 0) - (P.held[14] ? 1 : 0);
      my = (P.held[13] ? 1 : 0) - (P.held[12] ? 1 : 0);
    }
    const ms = this.sticks.move;
    if (ms) {
      const dx = (ms.x - ms.ox) / STICK_R;
      const dy = (ms.y - ms.oy) / STICK_R;
      const s = this.stick(dx, dy);
      mx = s.x;
      my = s.y;
    }
    o.move.x = clamp(mx, -1, 1);
    o.move.y = clamp(my, -1, 1);

    // Aim + fire.
    o.fire = false;
    const ax = (K.has('ArrowRight') ? 1 : 0) - (K.has('ArrowLeft') ? 1 : 0);
    const ay = (K.has('ArrowDown') ? 1 : 0) - (K.has('ArrowUp') ? 1 : 0);
    const rs = this.stick(P.axes[2], P.axes[3]);
    const as = this.sticks.aim;
    if (ax || ay) {
      const l = Math.hypot(ax, ay);
      this.setAim(ax / l, ay / l, 'keys');
      o.fire = true;
    } else if (rs.m > 0.25) {
      this.setAim(rs.x, rs.y, 'stick');
      o.fire = true;
    } else if (as) {
      const dx = as.x - as.ox;
      const dy = as.y - as.oy;
      const d = Math.hypot(dx, dy);
      if (d > 4) {
        this.setAim(dx / d, dy / d, 'touch');
        o.fire = true;
      } else o.aimMode = 'touch';
    } else if (this.mode === 'kbm') {
      o.aimMode = 'mouse';
      o.fire = this.mouse.left;
    } else {
      o.aimMode = this.mode === 'touch' ? 'touch-idle' : 'stick';
    }
    if (P.held[7] || P.held[6]) o.fire = true;

    // Actions.
    o.dash =
      E.has('Space') || E.has('ShiftLeft') || E.has('ShiftRight') || P.edges.has(0) || P.edges.has(5) || this.btnEdges.has('dash');
    o.bomb = E.has('KeyE') || E.has('KeyQ') || this.mouse.rightEdge || P.edges.has(1) || P.edges.has(2) || P.edges.has(4) || this.btnEdges.has('bomb');
    o.pause = E.has('Escape') || E.has('KeyP') || P.edges.has(9) || P.edges.has(8) || this.btnEdges.has('pause');

    const m = o.menu;
    for (const k of Object.keys(MENU_KEYS)) m[k] = MENU_KEYS[k].some((code) => E.has(code));
    m.up ||= P.edges.has(12);
    m.down ||= P.edges.has(13);
    m.left ||= P.edges.has(14);
    m.right ||= P.edges.has(15);
    m.confirm ||= P.edges.has(0) || P.edges.has(9);
    m.back ||= P.edges.has(1) || P.edges.has(8);
    // Left stick flicks navigate menus too.
    const prev = this.navStick || 0;
    let ns = 0;
    if (P.axes[1] < -0.6) ns = 1;
    else if (P.axes[1] > 0.6) ns = 2;
    else if (P.axes[0] < -0.6) ns = 3;
    else if (P.axes[0] > 0.6) ns = 4;
    if (ns && ns !== prev) {
      if (ns === 1) m.up = true;
      if (ns === 2) m.down = true;
      if (ns === 3) m.left = true;
      if (ns === 4) m.right = true;
    }
    this.navStick = ns;
    return o;
  }

  rumble(strength, ms) {
    if (this.mode !== 'pad') return;
    try {
      const pad = [...(navigator.getGamepads?.() || [])].find((p) => p && p.connected);
      pad?.vibrationActuator?.playEffect?.('dual-rumble', {
        duration: ms,
        strongMagnitude: strength,
        weakMagnitude: strength * 0.6,
      });
    } catch {
      // Rumble is best-effort.
    }
  }

  setAim(x, y, mode) {
    this.out.aim.x = x;
    this.out.aim.y = y;
    this.out.aimMode = mode;
    this.lastAim.x = x;
    this.lastAim.y = y;
  }

  endFrame() {
    this.keyEdges.clear();
    this.btnEdges.clear();
    this.clicks.length = 0;
    this.mouse.rightEdge = false;
  }

  takeClick() {
    return this.clicks.shift();
  }

  stickInfo() {
    return { move: this.sticks.move, aim: this.sticks.aim, r: STICK_R };
  }
}
