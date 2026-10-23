// Unified input: keyboard + mouse, gamepads (hot-plug, co-op binding, rumble) and touch twin
// sticks, folded into per-player control snapshots and menu edges (DESIGN §2.3, §4.18).
//
// Edges (boost/bomb/pause, menu.*) are latched once in update() and stay stable for the whole
// frame, so controls() / menu may be read any number of times per frame.

import { Save } from '../core/storage.js';
import { events } from '../core/events.js';
import { KeyboardMouse } from './keyboard.js';
import { Gamepads, BTN } from './gamepad.js';
import { TouchControls } from './touch.js';

const MAX_PLAYERS = 4;
const PAD_FIRE_STICK = 0.35; // raw right-stick magnitude that fires
const PAD_FIRE_TRIGGER = 0.3;
const AIM_LINGER = 0.3; // seconds the turret keeps the last stick direction after release

const K_MOVE_UP = ['KeyW'];
const K_MOVE_DOWN = ['KeyS'];
const K_MOVE_LEFT = ['KeyA'];
const K_MOVE_RIGHT = ['KeyD'];
const K_BOOST = ['Space', 'ShiftLeft', 'ShiftRight'];
const K_BOMB = ['KeyE', 'KeyQ', 'Mouse2'];
const K_PAUSE = ['Escape', 'KeyP'];

const M_UP = ['ArrowUp', 'KeyW'];
const M_DOWN = ['ArrowDown', 'KeyS'];
const M_LEFT = ['ArrowLeft', 'KeyA'];
const M_RIGHT = ['ArrowRight', 'KeyD'];
const M_CONFIRM = ['Enter', 'NumpadEnter', 'Space'];
const M_BACK = ['Escape', 'Backspace'];
const M_TABL = ['KeyQ', 'PageUp', 'ShiftTab'];
const M_TABR = ['KeyE', 'PageDown', 'Tab'];
const M_START = ['KeyP', 'Escape'];

function makeControls() {
  return {
    moveX: 0,
    moveY: 0,
    aimX: 1,
    aimY: 0,
    aimMag: 0,
    /** @type {'mouse'|'stick'|'keys'|'none'} */
    aimMode: 'none',
    /** @type {{x:number,y:number}|null} */
    mouseWorld: null,
    fire: false,
    boost: false, // edge
    bomb: false, // edge
    pause: false, // edge
    boostHeld: false,
    bombHeld: false,
    /** @type {'kbm'|'pad'|'touch'} */
    device: 'kbm',
    aimAssist: false,
    pad: -1, // bound pad index (-1 none)
  };
}

function makeMenu() {
  return {
    up: false, down: false, left: false, right: false,
    confirm: false, back: false, tabL: false, tabR: false, start: false,
    any: false,
  };
}

const settings = () => Save?.settings || {};

export class Input {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('../gfx/renderer.js').Renderer} renderer
   */
  constructor(canvas, renderer) {
    this.canvas = canvas;
    this.renderer = renderer;
    /** @type {'kbm'|'pad'|'touch'} */
    this.lastDevice = this._guessDevice();
    this.menu = makeMenu();
    this.gameplayActive = false;
    this.time = 0;
    this.bindings = new Array(MAX_PLAYERS).fill(-1);
    this._autoBindP0 = true;
    this._ctl = [];
    this._aim = [];
    for (let i = 0; i < MAX_PLAYERS; i++) {
      this._ctl.push(makeControls());
      this._aim.push({ x: 1, y: 0, linger: 0, mag: 0 });
    }
    this._mouseWorld = { x: 0, y: 0 };
    this._padList = [];
    this._first = [];
    this._interacted = false;
    this._vibeAt = 0;

    this.kbm = new KeyboardMouse(canvas, () => this._activity('kbm'));
    this.gamepads = new Gamepads((index, connected, id) => this._onPad(index, connected, id));
    this.touch = new TouchControls(canvas, renderer, () => this._activity('touch'));

    const s = settings();
    this.touch.setLayout({ leftHanded: !!s.leftHanded, opacity: s.touchOpacity ?? 0.55 });
    this._offSettings = events.on('settings:change', ({ settings: st } = {}) => {
      if (st) this.touch.setLayout({ leftHanded: !!st.leftHanded, opacity: st.touchOpacity });
    });

    // First-interaction hook (audio unlock needs a real user gesture: listen in capture phase on
    // window so clicks on DOM menus count too).
    this._firstHandler = () => this._fireFirst();
    for (const ev of ['keydown', 'pointerdown', 'touchstart', 'mousedown']) {
      window.addEventListener(ev, this._firstHandler, { capture: true, passive: true });
    }
  }

  _guessDevice() {
    try {
      if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) return 'touch';
    } catch {
      /* ignore */
    }
    return 'kbm';
  }

  _activity(device) {
    if (device !== this.lastDevice) {
      this.lastDevice = device;
      events.emit('input:device', { device });
    }
  }

  _onPad(index, connected, id) {
    if (!connected) {
      // P0 falls back to auto-binding the next pad; co-op players keep their slot so the same
      // pad reconnecting (battery swap) resumes control.
      if (this.bindings[0] === index && this._autoBindP0) this.bindings[0] = -1;
      if (this.lastDevice === 'pad' && this.gamepads.count <= 1) this._activity(this._guessDevice());
    }
    events.emit('input:pad', { index, connected, id });
  }

  _fireFirst() {
    if (this._interacted) return;
    this._interacted = true;
    for (const ev of ['keydown', 'pointerdown', 'touchstart', 'mousedown']) {
      window.removeEventListener(ev, this._firstHandler, { capture: true });
    }
    const fns = this._first;
    this._first = [];
    for (const fn of fns) {
      try {
        fn();
      } catch (err) {
        console.error('[input] first-interaction handler threw', err);
      }
    }
  }

  /**
   * Run `fn` once on the first keydown / pointerdown / touchstart / gamepad button. If that has
   * already happened, `fn` runs on the next microtask.
   * @param {() => void} fn
   */
  onFirstInteraction(fn) {
    if (this._interacted) queueMicrotask(fn);
    else this._first.push(fn);
  }

  /* ------------------------------------------------------------------------------------------ */

  /** Number of connected gamepads. */
  get padCount() {
    return this.gamepads.count;
  }

  /** Connected pad states: {index, id, mapping, connected, player, left, right, …}. */
  get pads() {
    return this.gamepads.connected(this._padList);
  }

  /**
   * Bind a gamepad to a player (removing it from anyone else). padIndex null/-1 unbinds.
   * @param {number} i player index
   * @param {number|null} padIndex
   */
  bindPlayer(i, padIndex) {
    if (i < 0 || i >= MAX_PLAYERS) return;
    const p = padIndex == null ? -1 : padIndex | 0;
    if (p >= 0) for (let k = 0; k < MAX_PLAYERS; k++) if (this.bindings[k] === p) this.bindings[k] = -1;
    this.bindings[i] = p;
    if (i === 0) this._autoBindP0 = p >= 0;
    this._syncPadPlayers();
  }

  /** Player index a pad is bound to, or -1. */
  playerOfPad(padIndex) {
    return this.bindings.indexOf(padIndex);
  }

  _syncPadPlayers() {
    for (const s of this.gamepads.slots) s.player = this.bindings.indexOf(s.index);
  }

  /**
   * Index of a connected pad bound to no player that pressed Start this frame, else null.
   * @returns {number|null}
   */
  joinRequested() {
    for (const s of this.gamepads.slots) {
      if (s.connected && s.player === -1 && s.hit(BTN.START)) return s.index;
    }
    return null;
  }

  /** Show / hide the touch sticks (true only while a run is being played). */
  setGameplayActive(on) {
    this.gameplayActive = !!on;
    this.touch.setEnabled(this.gameplayActive);
  }

  /** @param {{leftHanded?: boolean, opacity?: number}} opts */
  setTouchLayout(opts) {
    this.touch.setLayout(opts || {});
  }

  /**
   * Optional HUD hints drawn on the touch buttons: boost charge 0..1 (or -1 to hide) and bomb
   * count / capacity.
   * @param {{boost?: number, bombs?: number, bombsMax?: number}} st
   */
  setTouchStatus(st) {
    if (!st) return;
    const t = this.touch.status;
    if (st.boost !== undefined) t.boost = st.boost;
    if (st.bombs !== undefined) t.bombs = st.bombs;
    if (st.bombsMax !== undefined) t.bombsMax = st.bombsMax;
  }

  /**
   * Haptic feedback for player i: gamepad rumble or, on touch, navigator.vibrate.
   * Respects Save.settings.haptics.
   * @param {number} strength 0..1
   * @param {number} ms
   * @param {number} [i=0]
   */
  vibrate(strength, ms, i = 0) {
    if (settings().haptics === false || !(strength > 0) || !(ms > 0)) return;
    const pad = this.bindings[i] ?? -1;
    if (pad >= 0 && (i !== 0 || this.lastDevice === 'pad')) {
      this.gamepads.rumble(pad, strength, ms);
      return;
    }
    if (i === 0 && this.lastDevice === 'touch' && strength >= 0.15) {
      // Phone motors are coarse and every call cancels the previous one: rate-limit.
      const now = performance.now();
      if (now - this._vibeAt < 70) return;
      this._vibeAt = now;
      try {
        navigator.vibrate?.(Math.round(Math.min(400, ms * (0.5 + strength * 0.5))));
      } catch {
        /* blocked */
      }
    }
  }

  /* ------------------------------------------------------------------------------------------ */

  /** Poll devices, latch edges and rebuild all control snapshots. Call once per frame first. */
  update(dt = 1 / 60) {
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    this.time += dt;
    const kb = this.kbm;
    kb.latch(dt);
    this.gamepads.poll(dt);

    // Auto-bind P0's pad: the first connected pad nobody owns.
    if (this._autoBindP0 && this.bindings[0] === -1) {
      for (const s of this.gamepads.slots) {
        if (s.connected && this.bindings.indexOf(s.index) === -1) {
          this.bindings[0] = s.index;
          break;
        }
      }
    }
    this._syncPadPlayers();

    // Device switching: P0's pad or an unbound pad counts (a co-op partner's pad must not steal
    // P0's mouse aim).
    let padButton = false;
    for (const s of this.gamepads.slots) {
      if (!s.connected) continue;
      if (s.pressed.includes(1)) padButton = true;
      if (s.active && (s.player === 0 || s.player === -1)) this._activity('pad');
    }
    if (padButton && !this._interacted) this._fireFirst();

    this.touch.update(dt, this.lastDevice === 'touch');
    this._updateMenu();
    for (let i = 0; i < MAX_PLAYERS; i++) this._updatePlayer(i, dt);
  }

  _updateMenu() {
    const kb = this.kbm;
    const m = this.menu;
    m.up = kb.anyMenu(M_UP);
    m.down = kb.anyMenu(M_DOWN);
    m.left = kb.anyMenu(M_LEFT);
    m.right = kb.anyMenu(M_RIGHT);
    m.confirm = kb.anyMenu(M_CONFIRM);
    m.back = kb.anyMenu(M_BACK);
    m.tabL = kb.anyMenu(M_TABL);
    m.tabR = kb.anyMenu(M_TABR);
    m.start = kb.anyHit(M_START);
    for (const s of this.gamepads.slots) {
      if (!s.connected) continue;
      m.up ||= s.menu.up;
      m.down ||= s.menu.down;
      m.left ||= s.menu.left;
      m.right ||= s.menu.right;
      m.confirm ||= s.hit(BTN.A);
      m.back ||= s.hit(BTN.B) || s.hit(BTN.BACK);
      m.tabL ||= s.hit(BTN.LB);
      m.tabR ||= s.hit(BTN.RB);
      m.start ||= s.hit(BTN.START);
    }
    m.any = m.up || m.down || m.left || m.right || m.confirm || m.back || m.tabL || m.tabR || m.start;
  }

  _updatePlayer(i, dt) {
    const c = this._ctl[i];
    const mem = this._aim[i];
    const padIdx = this.bindings[i];
    const pad = padIdx >= 0 ? this.gamepads.slots[padIdx] : null;
    const padOk = !!(pad && pad.connected);
    const p0 = i === 0;
    const kb = this.kbm;
    const touch = this.touch;

    c.pad = padIdx;
    c.device = p0 ? this.lastDevice : 'pad';

    // --- movement: sum every source, clamp to the unit circle.
    let mx = 0;
    let my = 0;
    if (p0) {
      mx += (kb.anyDown(K_MOVE_RIGHT) ? 1 : 0) - (kb.anyDown(K_MOVE_LEFT) ? 1 : 0);
      my += (kb.anyDown(K_MOVE_DOWN) ? 1 : 0) - (kb.anyDown(K_MOVE_UP) ? 1 : 0);
      if (touch.enabled) {
        mx += touch.move.x;
        my += touch.move.y;
      }
    }
    if (padOk) {
      mx += pad.left.x + (pad.held(BTN.RIGHT) ? 1 : 0) - (pad.held(BTN.LEFT) ? 1 : 0);
      my += pad.left.y + (pad.held(BTN.DOWN) ? 1 : 0) - (pad.held(BTN.UP) ? 1 : 0);
    }
    const ml = Math.hypot(mx, my);
    if (ml > 1) {
      mx /= ml;
      my /= ml;
    }
    c.moveX = mx;
    c.moveY = my;

    // --- aim & fire, highest-priority source wins.
    c.fire = false;
    c.mouseWorld = null;
    let mode = 'none';
    let ax = 0;
    let ay = 0;
    if (p0) {
      ax = (kb.isDown('ArrowRight') ? 1 : 0) - (kb.isDown('ArrowLeft') ? 1 : 0);
      ay = (kb.isDown('ArrowDown') ? 1 : 0) - (kb.isDown('ArrowUp') ? 1 : 0);
    }
    if (ax || ay) {
      const l = Math.hypot(ax, ay);
      mem.x = ax / l;
      mem.y = ay / l;
      mem.mag = 1;
      mem.linger = 0;
      mode = 'keys';
      c.fire = true;
    } else if (padOk && (pad.right.mag > 0 || pad.rt > PAD_FIRE_TRIGGER)) {
      if (pad.right.mag > 0) {
        mem.x = pad.right.x / pad.right.mag;
        mem.y = pad.right.y / pad.right.mag;
        mem.mag = pad.right.mag;
      } else if (mem.linger <= 0 && (mx || my)) {
        // Trigger without a stick: fire along the heading.
        const l = Math.hypot(mx, my);
        mem.x = mx / l;
        mem.y = my / l;
        mem.mag = 1;
      } else mem.mag = 1;
      mem.linger = AIM_LINGER;
      mode = 'stick';
      c.fire = pad.right.raw > PAD_FIRE_STICK || pad.rt > PAD_FIRE_TRIGGER;
    } else if (p0 && touch.enabled && touch.aim.id !== -1 && touch.aim.mag > 0) {
      mem.x = touch.aim.dirX;
      mem.y = touch.aim.dirY;
      mem.mag = touch.aim.mag;
      mem.linger = AIM_LINGER;
      mode = 'stick';
      c.fire = touch.firing;
    } else if (mem.linger > 0) {
      // Keep the turret where it was for a moment so releasing a stick doesn't snap it.
      mem.linger -= dt;
      mem.mag *= Math.exp(-10 * dt);
      mode = 'stick';
    } else if (p0 && this.lastDevice === 'kbm' && kb.mouse.seen) {
      mode = 'mouse';
      const m = kb.mouse;
      const r = this.renderer;
      // Direction from screen center — consumers should prefer mouseWorld.
      const dx = m.x - (r?.cssW || 0) / 2;
      const dy = m.y - (r?.cssH || 0) / 2;
      const l = Math.hypot(dx, dy);
      if (l > 1) {
        mem.x = dx / l;
        mem.y = dy / l;
      }
      mem.mag = 1;
      c.fire = m.left || !!settings().autoFire;
    } else {
      mem.mag = 0;
    }
    c.aimMode = mode;
    c.aimX = mem.x;
    c.aimY = mem.y;
    c.aimMag = mode === 'none' ? 0 : mem.mag;
    if (mode === 'mouse') c.mouseWorld = this._refreshMouseWorld();

    // --- edges & holds
    let boost = false;
    let bomb = false;
    let pause = false;
    let boostHeld = false;
    let bombHeld = false;
    if (p0) {
      boost = kb.anyHit(K_BOOST);
      bomb = kb.anyHit(K_BOMB);
      pause = kb.anyHit(K_PAUSE);
      boostHeld = kb.anyDown(K_BOOST);
      bombHeld = kb.anyDown(K_BOMB) || kb.mouse.right;
      if (touch.enabled) {
        boost ||= touch.boost.edge;
        bomb ||= touch.bomb.edge;
        pause ||= touch.pause.edge;
        boostHeld ||= touch.boost.held;
        bombHeld ||= touch.bomb.held;
      }
    }
    if (padOk) {
      boost ||= pad.hit(BTN.A) || pad.hit(BTN.LB) || pad.hit(BTN.LT);
      bomb ||= pad.hit(BTN.B) || pad.hit(BTN.RB);
      pause ||= pad.hit(BTN.START);
      boostHeld ||= pad.held(BTN.A) || pad.held(BTN.LB) || pad.held(BTN.LT);
      bombHeld ||= pad.held(BTN.B) || pad.held(BTN.RB);
    }
    c.boost = boost;
    c.bomb = bomb;
    c.pause = pause;
    c.boostHeld = boostHeld;
    c.bombHeld = bombHeld;
    c.aimAssist = !!settings().aimAssist && c.device === 'touch';
  }

  _refreshMouseWorld() {
    const r = this.renderer;
    const m = this.kbm.mouse;
    if (r?.screenToWorld) r.screenToWorld(m.x, m.y, this._mouseWorld);
    return this._mouseWorld;
  }

  /**
   * Control snapshot for player i. The returned object is reused (do not keep references across
   * frames if you need history). Edges stay true for the whole frame.
   * @param {number} [i=0]
   */
  controls(i = 0) {
    const c = this._ctl[i] || this._ctl[MAX_PLAYERS - 1];
    // The camera may have moved since update(): re-project the cursor.
    if (c.aimMode === 'mouse') c.mouseWorld = this._refreshMouseWorld();
    return c;
  }

  /**
   * Soft aim assist (DESIGN §8): bend the player's aim toward the best target within `maxAngle`.
   * No-op unless `c.aimAssist`. Targets: iterable of {x, y, dead?, alive?}.
   * @param {ReturnType<Input['controls']>} c
   * @param {number} px player x
   * @param {number} py player y
   * @param {Iterable<{x:number,y:number,dead?:boolean,alive?:boolean}>} targets
   * @param {{maxAngle?: number, range?: number, strength?: number}} [opts]
   */
  assistAim(c, px, py, targets, opts) {
    if (!c?.aimAssist || !(c.aimMag > 0) || !targets) return c;
    const maxAngle = opts?.maxAngle ?? (20 * Math.PI) / 180;
    const range = opts?.range ?? 720;
    const strength = opts?.strength ?? 0.75;
    const aim = Math.atan2(c.aimY, c.aimX);
    let best = null;
    let bestScore = Infinity;
    let bestDiff = 0;
    for (const t of targets) {
      if (!t || t.dead || t.alive === false) continue;
      const dx = t.x - px;
      const dy = t.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 > range * range || d2 < 1) continue;
      let diff = Math.atan2(dy, dx) - aim;
      diff = ((diff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      const ad = Math.abs(diff);
      if (ad > maxAngle) continue;
      const score = ad / maxAngle + Math.sqrt(d2) / range * 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = t;
        bestDiff = diff;
      }
    }
    if (!best) return c;
    const k = strength * (1 - Math.abs(bestDiff) / maxAngle) ** 0.5;
    const a = aim + bestDiff * k;
    c.aimX = Math.cos(a);
    c.aimY = Math.sin(a);
    return c;
  }

  /**
   * Draw touch sticks & buttons (screen space). Visible only while gameplay is active and the
   * last device is touch.
   */
  drawOverlay(ctx, renderer) {
    this.touch.draw(ctx, renderer || this.renderer);
  }

  destroy() {
    this.kbm.destroy();
    this.gamepads.destroy();
    this.touch.destroy();
    this._offSettings?.();
    for (const ev of ['keydown', 'pointerdown', 'touchstart', 'mousedown']) {
      window.removeEventListener(ev, this._firstHandler, { capture: true });
    }
  }
}
