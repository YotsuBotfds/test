// Gamepad polling, radial dead zones, per-frame button edges and menu key-repeat (DESIGN §4.18).
// Pads are polled once per Input.update(); every edge therefore lives for exactly one frame.

/** Standard-mapping button indices. */
export const BTN = {
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9,
  LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15, HOME: 16,
};
const NBTN = 17;

export const DEAD_ZONE = 0.18;
const BTN_THRESHOLD = 0.5; // analog triggers count as "down" past this
const MENU_ON = 0.55; // stick → menu direction, with hysteresis
const MENU_OFF = 0.35;
const REPEAT_DELAY = 0.35;
const REPEAT_RATE = 0.09;
const MENU_DIRS = ['up', 'down', 'left', 'right'];

/**
 * Radial dead zone with rescale: output magnitude ramps 0→1 from the dead zone edge to full
 * deflection, keeping the true direction (no axial "snapping" to cardinals).
 * Writes into `out` = {x, y, mag, raw} (raw = unscaled magnitude, clamped to 1).
 */
export function radialDeadZone(x, y, dz, out) {
  const m = Math.hypot(x, y);
  out.raw = m > 1 ? 1 : m;
  if (m <= dz) {
    out.x = 0;
    out.y = 0;
    out.mag = 0;
    return out;
  }
  const scaled = Math.min(1, (m - dz) / (1 - dz));
  out.x = (x / m) * scaled;
  out.y = (y / m) * scaled;
  out.mag = scaled;
  return out;
}

/** Live state for one physical pad slot. All fields are reused frame to frame. */
export class PadState {
  constructor(index) {
    this.index = index;
    this.id = '';
    this.connected = false;
    this.mapping = '';
    this.left = { x: 0, y: 0, mag: 0, raw: 0 };
    this.right = { x: 0, y: 0, mag: 0, raw: 0 };
    this.lt = 0;
    this.rt = 0;
    this.value = new Float32Array(NBTN);
    this.down = new Uint8Array(NBTN);
    this.prev = new Uint8Array(NBTN);
    this.pressed = new Uint8Array(NBTN); // edge this frame
    this.menu = { up: false, down: false, left: false, right: false };
    this._menuHeld = { up: false, down: false, left: false, right: false };
    this._menuTimer = { up: 0, down: 0, left: 0, right: 0 };
    this._menuNow = { up: false, down: false, left: false, right: false };
    this.active = false; // meaningful input this frame
    this.lastActive = -1;
    this.player = -1; // bound player index or -1
    this.ref = null; // last Gamepad object (needed for rumble)
  }

  /** True if the button went down this frame. */
  hit(b) {
    return this.pressed[b] === 1;
  }

  /** True while held. */
  held(b) {
    return this.down[b] === 1;
  }

  reset() {
    this.left.x = this.left.y = this.left.mag = this.left.raw = 0;
    this.right.x = this.right.y = this.right.mag = this.right.raw = 0;
    this.lt = this.rt = 0;
    this.value.fill(0);
    this.down.fill(0);
    this.prev.fill(0);
    this.pressed.fill(0);
    for (const d of MENU_DIRS) {
      this.menu[d] = false;
      this._menuHeld[d] = false;
      this._menuTimer[d] = 0;
    }
    this.active = false;
  }
}

/** Owns up to four pad slots; hot-plug via events plus polling each frame. */
export class Gamepads {
  constructor(onChange) {
    this.slots = [];
    this.count = 0;
    this.time = 0;
    this._onChange = onChange;
    this._dirty = true;
    this._onConnect = (e) => {
      this._dirty = true;
      this._onChange?.(e.gamepad?.index ?? -1, true, e.gamepad?.id || '');
    };
    this._onDisconnect = (e) => {
      this._dirty = true;
      const s = this.slots[e.gamepad?.index];
      if (s) {
        s.connected = false;
        s.reset();
      }
      this._onChange?.(e.gamepad?.index ?? -1, false, e.gamepad?.id || '');
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('gamepadconnected', this._onConnect);
      window.addEventListener('gamepaddisconnected', this._onDisconnect);
    }
  }

  slot(i) {
    while (this.slots.length <= i) this.slots.push(new PadState(this.slots.length));
    return this.slots[i];
  }

  _list() {
    try {
      return navigator.getGamepads ? navigator.getGamepads() : null;
    } catch {
      return null; // blocked by permissions policy
    }
  }

  /**
   * Poll every pad. Returns true if any pad produced meaningful input this frame.
   * @param {number} dt
   */
  poll(dt) {
    this.time += dt;
    const list = this._list();
    let any = false;
    let count = 0;
    const seen = this._seen || (this._seen = new Uint8Array(16));
    seen.fill(0);
    if (list) {
      for (let i = 0; i < list.length; i++) {
        const gp = list[i];
        if (!gp || gp.connected === false) continue;
        const idx = typeof gp.index === 'number' ? gp.index : i;
        if (idx >= 16) continue;
        seen[idx] = 1;
        count++;
        const s = this.slot(idx);
        if (!s.connected) {
          s.reset();
          s.connected = true;
          s.id = gp.id || `Gamepad ${idx + 1}`;
          s.mapping = gp.mapping || '';
          this._dirty = true;
          // Polling-only discovery (Safari / events missed): announce it too.
          this._onChange?.(idx, true, s.id);
        }
        s.ref = gp;
        if (this._read(s, gp, dt)) any = true;
      }
    }
    for (const s of this.slots) {
      if (s.connected && !seen[s.index]) {
        s.connected = false;
        s.reset();
        this._dirty = true;
        this._onChange?.(s.index, false, s.id);
      }
    }
    this.count = count;
    return any;
  }

  _read(s, gp, dt) {
    const ax = gp.axes || [];
    radialDeadZone(ax[0] || 0, ax[1] || 0, DEAD_ZONE, s.left);
    radialDeadZone(ax[2] || 0, ax[3] || 0, DEAD_ZONE, s.right);
    const bs = gp.buttons || [];
    let active = s.left.mag > 0 || s.right.mag > 0;
    for (let b = 0; b < NBTN; b++) {
      const btn = bs[b];
      const v = btn == null ? 0 : typeof btn === 'number' ? btn : btn.value || (btn.pressed ? 1 : 0);
      s.value[b] = v;
      s.prev[b] = s.down[b];
      const d = (btn && btn.pressed) || v > BTN_THRESHOLD ? 1 : 0;
      s.down[b] = d;
      s.pressed[b] = d && !s.prev[b] ? 1 : 0;
      if (d) active = true;
    }
    s.lt = s.value[BTN.LT];
    s.rt = s.value[BTN.RT];
    if (s.lt > 0.15 || s.rt > 0.15) active = true;
    s.active = active;
    if (active) s.lastActive = this.time;

    // Menu directions: d-pad or left stick (raw, with hysteresis), with key-repeat.
    const lx = ax[0] || 0;
    const ly = ax[1] || 0;
    const dirHeld = (dir, dpad, axis, sign) => {
      if (s.down[dpad]) return true;
      const v = axis * sign;
      return s._menuHeld[dir] ? v > MENU_OFF : v > MENU_ON;
    };
    const held = s._menuNow;
    held.up = dirHeld('up', BTN.UP, ly, -1);
    held.down = dirHeld('down', BTN.DOWN, ly, 1);
    held.left = dirHeld('left', BTN.LEFT, lx, -1);
    held.right = dirHeld('right', BTN.RIGHT, lx, 1);
    for (const d of MENU_DIRS) {
      s.menu[d] = false;
      if (held[d]) {
        if (!s._menuHeld[d]) {
          s.menu[d] = true;
          s._menuTimer[d] = REPEAT_DELAY;
        } else {
          s._menuTimer[d] -= dt;
          if (s._menuTimer[d] <= 0) {
            s.menu[d] = true;
            s._menuTimer[d] += REPEAT_RATE;
            if (s._menuTimer[d] < 0) s._menuTimer[d] = REPEAT_RATE;
          }
        }
      }
      s._menuHeld[d] = held[d];
    }
    return active;
  }

  /** Connected pad states (array reused). */
  connected(out = []) {
    out.length = 0;
    for (const s of this.slots) if (s.connected) out.push(s);
    return out;
  }

  /**
   * Rumble a pad. Silently ignored when unsupported.
   * @param {number} index pad index
   * @param {number} strength 0..1
   * @param {number} ms duration
   */
  rumble(index, strength, ms) {
    const s = this.slots[index];
    const gp = s?.ref;
    if (!gp) return;
    const k = Math.max(0, Math.min(1, strength));
    try {
      const act = gp.vibrationActuator;
      if (act?.playEffect) {
        const p = act.playEffect(act.type === 'vibration' ? 'vibration' : 'dual-rumble', {
          startDelay: 0,
          duration: Math.max(10, Math.min(2000, ms | 0)),
          weakMagnitude: Math.min(1, k * 1.15),
          strongMagnitude: k,
        });
        p?.catch?.(() => {});
      } else if (gp.hapticActuators?.[0]?.pulse) {
        gp.hapticActuators[0].pulse(k, ms)?.catch?.(() => {});
      }
    } catch {
      /* unsupported */
    }
  }

  destroy() {
    if (typeof window === 'undefined') return;
    window.removeEventListener('gamepadconnected', this._onConnect);
    window.removeEventListener('gamepaddisconnected', this._onDisconnect);
  }
}
