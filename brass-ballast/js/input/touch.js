// Touch controls: floating twin sticks + BOOST / BOMB / PAUSE buttons, multi-touch via pointer
// events, and their brass overlay (DESIGN §2.3, §4.18). Layout is in CSS pixels; textures are
// baked once per size so the per-frame overlay is just a handful of drawImage calls.

import { PAL, FONT_DISPLAY } from '../config.js';

const TAU = Math.PI * 2;
const STICK_DZ = 0.08; // small radial dead zone so a resting thumb reads as zero
const AIM_FIRE = 0.25; // aim deflection that fires
const DRAG_FACTOR = 1.3; // base follows the thumb once pulled past R × this
const AIM_HOLD = 0.28; // seconds the aim direction lingers after release
const FADE_IN = 14; // 1/s
const FADE_OUT = 6;
const BAKE_SCALE = 2.5; // texture px per CSS px (crisp on dpr ≤ 2.5)

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ------------------------------------------------------------------------------------------ */
/* Texture baking                                                                             */
/* ------------------------------------------------------------------------------------------ */

const bakeCache = new Map();

/** Bake `draw(ctx)` (origin at texture center, CSS px units) into a cached canvas. */
function bake(key, w, h, draw) {
  let c = bakeCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = Math.ceil(w * BAKE_SCALE);
  c.height = Math.ceil(h * BAKE_SCALE);
  const ctx = c.getContext('2d');
  ctx.setTransform(BAKE_SCALE, 0, 0, BAKE_SCALE, (w * BAKE_SCALE) / 2, (h * BAKE_SCALE) / 2);
  draw(ctx);
  c._w = w;
  c._h = h;
  bakeCache.set(key, c);
  return c;
}

function brassGrad(ctx, r, light = PAL.brass[0], mid = PAL.brass[1], dark = PAL.brass[3]) {
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, light);
  g.addColorStop(0.45, mid);
  g.addColorStop(0.7, PAL.brass[2]);
  g.addColorStop(1, dark);
  return g;
}

function rivet(ctx, x, y, r) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, '#fff2c8');
  g.addColorStop(0.5, PAL.brass[1]);
  g.addColorStop(1, PAL.brass[3]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** Brass gauge ring with smoked-glass well, ticks, rivets and cardinal pointers. */
function drawStickBase(ctx, R, accent) {
  const rim = Math.max(7, R * 0.13);
  // Soft drop shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.arc(2, 4, R + 2, 0, TAU);
  ctx.fill();
  // Smoked glass well.
  const glass = ctx.createRadialGradient(-R * 0.25, -R * 0.3, R * 0.1, 0, 0, R);
  glass.addColorStop(0, 'rgba(70,52,30,0.55)');
  glass.addColorStop(0.7, 'rgba(26,18,10,0.62)');
  glass.addColorStop(1, 'rgba(10,6,3,0.78)');
  ctx.fillStyle = glass;
  ctx.beginPath();
  ctx.arc(0, 0, R - rim + 1, 0, TAU);
  ctx.fill();
  // Etched concentric guide.
  ctx.strokeStyle = 'rgba(242,212,138,0.18)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.arc(0, 0, (R - rim) * 0.55, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  // Gauge ticks.
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * TAU;
    const major = i % 8 === 0;
    const r0 = R - rim - (major ? 10 : 5);
    const r1 = R - rim - 1.5;
    ctx.strokeStyle = major ? 'rgba(242,212,138,0.85)' : 'rgba(242,212,138,0.35)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.stroke();
  }
  // Cardinal pointers.
  ctx.fillStyle = accent;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const tip = R - rim - 13;
    const back = tip - 7;
    ctx.beginPath();
    ctx.moveTo(c * tip, s * tip);
    ctx.lineTo(c * back - s * 4, s * back + c * 4);
    ctx.lineTo(c * back + s * 4, s * back - c * 4);
    ctx.closePath();
    ctx.fill();
  }
  // Brass bezel.
  ctx.fillStyle = brassGrad(ctx, R);
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.arc(0, 0, R - rim, 0, TAU, true);
  ctx.fill('evenodd');
  // Bezel bevels: bright top-left lip, dark inner edge.
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,244,210,0.55)';
  ctx.beginPath();
  ctx.arc(0, 0, R - 1, Math.PI * 0.95, Math.PI * 1.75);
  ctx.stroke();
  ctx.strokeStyle = PAL.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, R - rim, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, R + 0.5, 0, TAU);
  ctx.stroke();
  // Rivets.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + TAU / 16;
    rivet(ctx, Math.cos(a) * (R - rim / 2), Math.sin(a) * (R - rim / 2), Math.max(1.6, rim * 0.22));
  }
  // Glass glint.
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, R - rim - 5, Math.PI * 1.1, Math.PI * 1.45);
  ctx.stroke();
}

/** Domed knurled knob. kind 'move' = brass compass rose, 'aim' = copper with crosshair. */
function drawKnob(ctx, r, kind) {
  const aim = kind === 'aim';
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.arc(2, 4, r + 1, 0, TAU);
  ctx.fill();
  // Knurled skirt.
  ctx.fillStyle = aim ? PAL.copper[2] : PAL.brass[3];
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = aim ? PAL.copper[0] : PAL.brass[1];
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (r - 3.5), Math.sin(a) * (r - 3.5));
    ctx.lineTo(Math.cos(a) * (r - 0.5), Math.sin(a) * (r - 0.5));
    ctx.stroke();
  }
  // Dome.
  const d = r * 0.8;
  const g = ctx.createRadialGradient(-d * 0.35, -d * 0.45, d * 0.08, 0, 0, d);
  if (aim) {
    g.addColorStop(0, '#ffe2c4');
    g.addColorStop(0.35, PAL.copper[0]);
    g.addColorStop(0.75, PAL.copper[1]);
    g.addColorStop(1, PAL.copper[2]);
  } else {
    g.addColorStop(0, '#fff6d6');
    g.addColorStop(0.35, PAL.brass[0]);
    g.addColorStop(0.75, PAL.brass[1]);
    g.addColorStop(1, PAL.brass[2]);
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, d, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = PAL.ink;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // Engraving.
  ctx.strokeStyle = 'rgba(40,24,8,0.7)';
  ctx.fillStyle = 'rgba(40,24,8,0.7)';
  ctx.lineWidth = 1.4;
  if (aim) {
    ctx.beginPath();
    ctx.arc(0, 0, d * 0.42, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * d * 0.2, Math.sin(a) * d * 0.2);
      ctx.lineTo(Math.cos(a) * d * 0.68, Math.sin(a) * d * 0.68);
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU - Math.PI / 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(c * d * 0.62, s * d * 0.62);
      ctx.lineTo(-s * d * 0.14, c * d * 0.14);
      ctx.lineTo(s * d * 0.14, -c * d * 0.14);
      ctx.closePath();
      ctx.fill();
    }
  }
  // Specular highlight.
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(-d * 0.3, -d * 0.42, d * 0.32, d * 0.16, -0.5, 0, TAU);
  ctx.fill();
}

function glyphSteam(ctx, s) {
  // Speed lines.
  ctx.strokeStyle = 'rgba(244,241,234,0.75)';
  ctx.lineCap = 'round';
  ctx.lineWidth = 2 * s;
  for (const [y, l] of [[-6, 9], [0, 13], [6, 8]]) {
    ctx.beginPath();
    ctx.moveTo(-15 * s, y * s);
    ctx.lineTo((-15 + l) * s - 10 * s, y * s);
    ctx.stroke();
  }
  // Puff.
  const puffs = [[-2, 2, 7], [5, -4, 8], [11, 3, 7], [4, 6, 6.5], [-6, -3, 5]];
  ctx.fillStyle = PAL.ink;
  for (const [x, y, r] of puffs) {
    ctx.beginPath();
    ctx.arc(x * s, y * s, (r + 1.3) * s, 0, TAU);
    ctx.fill();
  }
  for (const [x, y, r] of puffs) {
    const g = ctx.createRadialGradient((x - r * 0.3) * s, (y - r * 0.4) * s, 0, x * s, y * s, r * s);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#c7d6dc');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x * s, y * s, r * s, 0, TAU);
    ctx.fill();
  }
}

function glyphBomb(ctx, s) {
  ctx.lineCap = 'round';
  // Fuse.
  ctx.strokeStyle = PAL.canvas[2];
  ctx.lineWidth = 2.2 * s;
  ctx.beginPath();
  ctx.moveTo(5 * s, -7 * s);
  ctx.quadraticCurveTo(9 * s, -15 * s, 14 * s, -12 * s);
  ctx.stroke();
  // Sphere.
  ctx.fillStyle = PAL.ink;
  ctx.beginPath();
  ctx.arc(-1 * s, 3 * s, 11.5 * s, 0, TAU);
  ctx.fill();
  const g = ctx.createRadialGradient(-5 * s, -2 * s, 1 * s, -1 * s, 3 * s, 10.5 * s);
  g.addColorStop(0, PAL.iron[0]);
  g.addColorStop(0.5, PAL.iron[2]);
  g.addColorStop(1, PAL.iron[3]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(-1 * s, 3 * s, 10.3 * s, 0, TAU);
  ctx.fill();
  // Brass band & cap.
  ctx.strokeStyle = PAL.brass[1];
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.ellipse(-1 * s, 3 * s, 10.3 * s, 3.2 * s, 0, 0, Math.PI);
  ctx.stroke();
  ctx.fillStyle = PAL.brass[1];
  ctx.fillRect(1.5 * s, -9.5 * s, 6 * s, 4.5 * s);
  // Spark.
  ctx.fillStyle = PAL.gold;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    const r = (i % 2 ? 2 : 5.5) * s;
    ctx.lineTo(14 * s + Math.cos(a) * r, -12 * s + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff6c8';
  ctx.beginPath();
  ctx.arc(14 * s, -12 * s, 1.6 * s, 0, TAU);
  ctx.fill();
}

function glyphPause(ctx, s) {
  ctx.fillStyle = PAL.parchment[0];
  ctx.strokeStyle = PAL.ink;
  ctx.lineWidth = 1.2;
  for (const x of [-5.5, 2]) {
    ctx.beginPath();
    ctx.rect(x * s, -7.5 * s, 3.5 * s, 15 * s);
    ctx.fill();
    ctx.stroke();
  }
}

/** Round enamel button with brass bezel, glass highlight, glyph and an engraved label. */
function drawButton(ctx, r, kind, pressed) {
  const enamel = {
    boost: ['#4f7ea8', PAL.navy, '#132233'],
    bomb: ['#c4473f', PAL.oxblood, '#3d110e'],
    pause: ['#5a4630', '#33261a', '#140d07'],
  }[kind];
  const rim = Math.max(4, r * 0.17);
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.arc(pressed ? 1 : 2, pressed ? 2 : 4, r + 1, 0, TAU);
  ctx.fill();
  ctx.fillStyle = brassGrad(ctx, r);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  const ir = r - rim;
  const g = ctx.createRadialGradient(-ir * 0.3, -ir * 0.4, ir * 0.1, 0, 0, ir);
  g.addColorStop(0, pressed ? enamel[1] : enamel[0]);
  g.addColorStop(0.6, pressed ? enamel[2] : enamel[1]);
  g.addColorStop(1, enamel[2]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, ir, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = PAL.ink;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.stroke();
  // Bezel lip highlight.
  ctx.strokeStyle = 'rgba(255,244,210,0.6)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, r - 1.2, Math.PI * 0.95, Math.PI * 1.75);
  ctx.stroke();
  if (kind !== 'pause') {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6;
      rivet(ctx, Math.cos(a) * (r - rim / 2), Math.sin(a) * (r - rim / 2), Math.max(1.2, rim * 0.2));
    }
  }
  ctx.save();
  if (pressed) ctx.translate(0.6, 1.2);
  const s = (ir / 24) * (pressed ? 0.94 : 1);
  if (kind === 'boost') glyphSteam(ctx, s);
  else if (kind === 'bomb') glyphBomb(ctx, s);
  else glyphPause(ctx, s * 1.25);
  ctx.restore();
  // Domed glass highlight (dimmer when pressed).
  ctx.fillStyle = pressed ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.2)';
  ctx.beginPath();
  ctx.ellipse(-ir * 0.2, -ir * 0.5, ir * 0.62, ir * 0.3, -0.25, 0, TAU);
  ctx.fill();
}

function drawLabel(ctx, text, y) {
  ctx.font = `bold 10px ${FONT_DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.strokeStyle = 'rgba(20,12,6,0.85)';
  ctx.strokeText(text, 0, y);
  ctx.fillStyle = PAL.parchment[0];
  ctx.fillText(text, 0, y);
}

/* ------------------------------------------------------------------------------------------ */
/* State                                                                                      */
/* ------------------------------------------------------------------------------------------ */

function makeStick(kind) {
  return {
    kind,
    id: -1, // pointerId or -1
    bx: 0, // base center
    by: 0,
    kx: 0, // knob (rendered, includes spring-back)
    ky: 0,
    x: 0, // normalized output (dead-zoned)
    y: 0,
    mag: 0,
    raw: 0, // raw deflection 0..1
    dirX: 1, // last non-zero direction
    dirY: 0,
    hold: 0, // aim linger timer
    shown: 0, // fade 0..1
    downTime: 0,
    pulse: 0,
  };
}

function makeButton(kind, label) {
  return {
    kind,
    label,
    x: 0,
    y: 0,
    r: 32,
    id: -1,
    held: false,
    pending: false, // edge since last latch
    edge: false, // edge this frame
    press: 0, // press animation 0..1
    ripples: [
      { t: 1, x: 0, y: 0 },
      { t: 1, x: 0, y: 0 },
      { t: 1, x: 0, y: 0 },
    ],
  };
}

export class TouchControls {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{cssW:number, cssH:number}} renderer
   * @param {(kind: string) => void} onActivity
   */
  constructor(canvas, renderer, onActivity) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.onActivity = onActivity;
    this.enabled = false; // gameplay active
    this.visible = false; // last device is touch
    this.leftHanded = false;
    this.opacity = 0.55;
    this.R = 60;
    this.move = makeStick('move');
    this.aim = makeStick('aim');
    this.boost = makeButton('boost', 'BOOST');
    this.bomb = makeButton('bomb', 'BOMB');
    this.pause = makeButton('pause', '');
    this.buttons = [this.pause, this.boost, this.bomb];
    this.status = { boost: -1, bombs: -1, bombsMax: 0 };
    this.safe = { l: 0, r: 0, t: 0, b: 0 };
    this._safeAge = 99;
    this.time = 0;
    this.activeTouches = 0;
    this._probe = null;
    try {
      canvas.style.touchAction = 'none';
      canvas.style.webkitUserSelect = 'none';
      canvas.style.userSelect = 'none';
      canvas.style.webkitTouchCallout = 'none';
    } catch {
      /* ignore */
    }
    this._bind();
    this.layout();
  }

  _bind() {
    this._h = {
      down: (e) => this._down(e),
      move: (e) => this._move(e),
      up: (e) => this._up(e),
    };
    this.canvas.addEventListener('pointerdown', this._h.down);
    // Moves/ups on window so a thumb sliding over a DOM HUD element still tracks.
    window.addEventListener('pointermove', this._h.move, { passive: true });
    window.addEventListener('pointerup', this._h.up);
    window.addEventListener('pointercancel', this._h.up);
    // Long-press / double-tap zoom guards for iOS where touch-action is not enough.
    this._noGesture = (e) => {
      if (this.enabled && e.target === this.canvas) e.preventDefault();
    };
    this.canvas.addEventListener('touchstart', this._noGesture, { passive: false });
    this.canvas.addEventListener('touchmove', this._noGesture, { passive: false });
  }

  destroy() {
    this.canvas.removeEventListener('pointerdown', this._h.down);
    window.removeEventListener('pointermove', this._h.move);
    window.removeEventListener('pointerup', this._h.up);
    window.removeEventListener('pointercancel', this._h.up);
    this.canvas.removeEventListener('touchstart', this._noGesture);
    this.canvas.removeEventListener('touchmove', this._noGesture);
    this._probe?.remove();
  }

  /* ---------------------------------------- layout ---------------------------------------- */

  _readSafeArea() {
    try {
      if (!this._probe) {
        const d = document.createElement('div');
        d.setAttribute('aria-hidden', 'true');
        d.style.cssText =
          'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
          'padding:env(safe-area-inset-top) env(safe-area-inset-right) ' +
          'env(safe-area-inset-bottom) env(safe-area-inset-left);';
        document.body.appendChild(d);
        this._probe = d;
      }
      const cs = getComputedStyle(this._probe);
      this.safe.t = parseFloat(cs.paddingTop) || 0;
      this.safe.r = parseFloat(cs.paddingRight) || 0;
      this.safe.b = parseFloat(cs.paddingBottom) || 0;
      this.safe.l = parseFloat(cs.paddingLeft) || 0;
    } catch {
      /* no DOM */
    }
  }

  /** Recompute stick radius and button positions for the current canvas size. */
  layout() {
    const W = this.renderer.cssW || 1;
    const H = this.renderer.cssH || 1;
    const s = this.safe;
    this.W = W;
    this.H = H;
    this.R = Math.round(clamp(Math.min(W, H) * 0.14, 50, 74));
    const br = Math.round(clamp(Math.min(W, H) * 0.085, 28, 38));
    const lh = this.leftHanded;
    // Buttons sit in an arc above where the aim thumb rests.
    const edgeX = (lh ? s.l : s.r) + br + 26;
    const bx1 = lh ? edgeX : W - edgeX;
    const bx2 = lh ? edgeX + br * 2.55 : W - edgeX - br * 2.55;
    const baseY = H - s.b - this.R * 2 - 70;
    this.boost.r = br;
    this.bomb.r = br;
    this.boost.x = bx1;
    this.boost.y = Math.max(s.t + br + 70, baseY);
    this.bomb.x = bx2;
    this.bomb.y = Math.max(s.t + br + 40, baseY - br * 1.25);
    this.pause.r = 22;
    this.pause.x = s.l + 16 + 22;
    this.pause.y = s.t + 16 + 22;
    // Resting (hint) positions of the two sticks.
    const restY = H - s.b - this.R - 34;
    const inset = clamp(W * 0.15, this.R + 30, 220);
    const leftX = s.l + inset;
    const rightX = W - s.r - inset;
    this.restMove = { x: lh ? rightX : leftX, y: restY };
    this.restAim = { x: lh ? leftX : rightX, y: restY };
  }

  setLayout({ leftHanded, opacity } = {}) {
    if (leftHanded !== undefined && !!leftHanded !== this.leftHanded) {
      this.leftHanded = !!leftHanded;
      this.releaseAll();
    }
    if (opacity !== undefined && Number.isFinite(+opacity)) this.opacity = clamp(+opacity, 0.05, 1);
    this.layout();
  }

  setEnabled(on) {
    on = !!on;
    if (on === this.enabled) return;
    this.enabled = on;
    if (!on) this.releaseAll();
  }

  releaseAll() {
    for (const st of [this.move, this.aim]) {
      st.id = -1;
      st.x = st.y = st.mag = st.raw = 0;
      st.hold = 0;
    }
    for (const b of this.buttons) {
      b.id = -1;
      b.held = false;
    }
    this.activeTouches = 0;
  }

  /* ---------------------------------------- pointers --------------------------------------- */

  _pos(e) {
    const r = this._rect || (this._rect = this.canvas.getBoundingClientRect());
    return [e.clientX - r.left, e.clientY - r.top];
  }

  _down(e) {
    if (e.pointerType !== 'touch') return;
    this.onActivity('touch');
    if (!this.enabled) return;
    this._rect = this.canvas.getBoundingClientRect();
    const [x, y] = this._pos(e);
    e.preventDefault();
    // Buttons first, with a forgiving hit radius.
    for (const b of this.buttons) {
      if (b.id !== -1) continue;
      const hitR = b.r * (b === this.pause ? 1.45 : 1.25);
      if ((x - b.x) ** 2 + (y - b.y) ** 2 <= hitR * hitR) {
        b.id = e.pointerId;
        b.held = true;
        b.pending = true;
        b.press = 1;
        const rp = b.ripples.reduce((m, r) => (r.t > m.t ? r : m), b.ripples[0]);
        rp.t = 0;
        rp.x = b.x;
        rp.y = b.y;
        this._capture(e);
        this.activeTouches++;
        return;
      }
    }
    const moveSide = this.leftHanded ? x >= this.W / 2 : x < this.W / 2;
    const st = moveSide ? this.move : this.aim;
    if (st.id !== -1) return; // that thumb is already busy; ignore extra fingers
    st.id = e.pointerId;
    const R = this.R;
    st.bx = clamp(x, R + 6, this.W - R - 6);
    st.by = clamp(y, R + 6, this.H - R - 6);
    st.kx = x;
    st.ky = y;
    st.downTime = this.time;
    st.pulse = 1;
    st.hold = 0;
    this._capture(e);
    this.activeTouches++;
    this._apply(st, x, y);
  }

  _capture(e) {
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointers can't always be captured */
    }
  }

  _move(e) {
    if (e.pointerType !== 'touch' || !this.enabled) return;
    const id = e.pointerId;
    if (this.move.id === id) this._apply(this.move, ...this._pos(e));
    else if (this.aim.id === id) this._apply(this.aim, ...this._pos(e));
    else {
      // A button finger sliding far off its button lets go (no accidental "sticky" hold).
      for (const b of this.buttons) {
        if (b.id !== id) continue;
        const [x, y] = this._pos(e);
        const out = b.r * 2.2;
        if ((x - b.x) ** 2 + (y - b.y) ** 2 > out * out) {
          b.id = -1;
          b.held = false;
          this.activeTouches = Math.max(0, this.activeTouches - 1);
        }
      }
    }
  }

  _up(e) {
    if (e.pointerType !== 'touch') return;
    const id = e.pointerId;
    for (const st of [this.move, this.aim]) {
      if (st.id !== id) continue;
      st.id = -1;
      st.x = st.y = st.mag = st.raw = 0;
      st.hold = st.kind === 'aim' ? AIM_HOLD : 0;
      this.activeTouches = Math.max(0, this.activeTouches - 1);
    }
    for (const b of this.buttons) {
      if (b.id !== id) continue;
      b.id = -1;
      b.held = false;
      this.activeTouches = Math.max(0, this.activeTouches - 1);
    }
  }

  /** Thumb at (x, y): drag the base if pulled far, clamp the knob, compute output. */
  _apply(st, x, y) {
    const R = this.R;
    let dx = x - st.bx;
    let dy = y - st.by;
    let d = Math.hypot(dx, dy);
    const far = R * DRAG_FACTOR;
    if (d > far) {
      st.bx = x - (dx / d) * far;
      st.by = y - (dy / d) * far;
      dx = x - st.bx;
      dy = y - st.by;
      d = far;
    }
    const k = d > R ? R / d : 1;
    st.kx = st.bx + dx * k;
    st.ky = st.by + dy * k;
    const raw = Math.min(1, d / R);
    st.raw = raw;
    if (raw <= STICK_DZ || d < 1e-3) {
      st.x = st.y = st.mag = 0;
      return;
    }
    const m = (raw - STICK_DZ) / (1 - STICK_DZ);
    st.x = (dx / d) * m;
    st.y = (dy / d) * m;
    st.mag = m;
    st.dirX = dx / d;
    st.dirY = dy / d;
  }

  /* ---------------------------------------- frame ----------------------------------------- */

  /** Latch button edges for this frame and advance animations. */
  update(dt, visible) {
    this.time += dt;
    this.visible = visible;
    this._rect = null;
    this._safeAge += dt;
    if (this._safeAge > 1) {
      this._safeAge = 0;
      this._readSafeArea();
    }
    if (this.renderer.cssW !== this.W || this.renderer.cssH !== this.H || this._safeAge === 0) this.layout();
    for (const b of this.buttons) {
      b.edge = b.pending;
      b.pending = false;
      b.press = Math.max(0, b.press - dt * 5);
      for (const r of b.ripples) r.t = Math.min(1, r.t + dt * 2.2);
    }
    for (const st of [this.move, this.aim]) {
      const target = st.id !== -1 ? 1 : 0;
      st.shown += (target - st.shown) * (1 - Math.exp(-(target ? FADE_IN : FADE_OUT) * dt));
      st.pulse = Math.max(0, st.pulse - dt * 3);
      if (st.id === -1) {
        // Knob springs home while the ring fades.
        const f = 1 - Math.exp(-18 * dt);
        st.kx += (st.bx - st.kx) * f;
        st.ky += (st.by - st.ky) * f;
        if (st.hold > 0) st.hold = Math.max(0, st.hold - dt);
      }
    }
  }

  /** Aim is firing (deflection past threshold while held). */
  get firing() {
    return this.aim.id !== -1 && this.aim.raw > AIM_FIRE;
  }

  get anyActive() {
    return this.move.id !== -1 || this.aim.id !== -1 || this.boost.held || this.bomb.held;
  }

  /* ---------------------------------------- drawing --------------------------------------- */

  _tex(kind, size, extra = '') {
    const key = `${kind}:${size}:${extra}`;
    switch (kind) {
      case 'base': {
        const accent = extra === 'aim' ? PAL.copper[0] : PAL.aether[1];
        return bake(key, size * 2 + 12, size * 2 + 12, (c) => drawStickBase(c, size, accent));
      }
      case 'knob':
        return bake(key, size * 2 + 10, size * 2 + 10, (c) => drawKnob(c, size, extra));
      case 'btn': {
        const [k, pressed] = extra.split('/');
        const label = k === 'boost' ? 'BOOST' : k === 'bomb' ? 'BOMB' : '';
        const h = size * 2 + 10 + (label ? 26 : 0);
        return bake(key, size * 2 + 10, h, (c) => {
          if (label) c.translate(0, -13);
          drawButton(c, size, k, pressed === '1');
          if (label) drawLabel(c, label, size + 12);
        });
      }
      default:
        return null;
    }
  }

  _blit(ctx, tex, x, y, scale = 1, labelOffset = 0) {
    const w = tex._w * scale;
    const h = tex._h * scale;
    ctx.drawImage(tex, x - w / 2, y - h / 2 + labelOffset * scale, w, h);
  }

  /**
   * Draw the overlay in screen space.
   * @param {CanvasRenderingContext2D} ctx
   * @param {{applyScreen(ctx): void}} renderer
   */
  draw(ctx, renderer) {
    if (!this.enabled || !this.visible) return;
    renderer.applyScreen?.(ctx);
    const prevAlpha = ctx.globalAlpha;
    const prevComp = ctx.globalCompositeOperation;
    const op = this.opacity;
    const t = this.time;
    this._drawStick(ctx, this.move, this.restMove, op, t, 'STEER');
    this._drawStick(ctx, this.aim, this.restAim, op, t, 'AIM · FIRE');
    for (const b of this.buttons) this._drawButton(ctx, b, op, t);
    ctx.globalAlpha = prevAlpha;
    ctx.globalCompositeOperation = prevComp;
  }

  _drawStick(ctx, st, rest, op, t, hint) {
    const R = this.R;
    const kr = Math.round(R * 0.42);
    const base = this._tex('base', R, st.kind);
    const knob = this._tex('knob', kr, st.kind);
    const shown = st.shown;
    // Idle hint at the resting spot, cross-faded against the live stick.
    const idle = (1 - shown) * op * 0.42 * (0.85 + 0.15 * Math.sin(t * 2.4 + (st.kind === 'aim' ? 1.4 : 0)));
    if (idle > 0.01 && st.hold <= 0) {
      ctx.globalAlpha = idle;
      this._blit(ctx, base, rest.x, rest.y, 0.9);
      this._blit(ctx, knob, rest.x, rest.y, 0.9);
      // Breathing chevrons point outward: "drag me".
      ctx.globalAlpha = idle * 1.2;
      ctx.strokeStyle = PAL.brass[0];
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const push = R * 0.98 + 6 + Math.sin(t * 3) * 4;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const px = rest.x + c * push;
        const py = rest.y + s * push;
        ctx.beginPath();
        ctx.moveTo(px - c * 5 - s * 6, py - s * 5 + c * 6);
        ctx.lineTo(px, py);
        ctx.lineTo(px - c * 5 + s * 6, py - s * 5 - c * 6);
        ctx.stroke();
      }
      ctx.font = `bold 11px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = PAL.parchment[0];
      ctx.fillText(hint, rest.x, rest.y + R + 22);
    }
    if (shown < 0.02) return;
    const a = Math.min(1, op + 0.3) * shown;
    // Pop-in scale on touch.
    const sc = 1 + st.pulse * st.pulse * 0.12;
    ctx.globalAlpha = a;
    this._blit(ctx, base, st.bx, st.by, sc);
    const dx = st.kx - st.bx;
    const dy = st.ky - st.by;
    const d = Math.hypot(dx, dy);
    const firing = st.kind === 'aim' && st.id !== -1 && st.raw > AIM_FIRE;
    // Deflection glow arc on the bezel (additive).
    if (d > 2) {
      const ang = Math.atan2(dy, dx);
      const m = Math.min(1, d / R);
      ctx.globalCompositeOperation = 'lighter';
      const col = firing ? PAL.syndicate[3] : st.kind === 'aim' ? PAL.copper[0] : PAL.aether[0];
      ctx.strokeStyle = col;
      ctx.lineCap = 'round';
      const span = 0.35 + m * 0.65;
      for (let k = 0; k < 2; k++) {
        ctx.globalAlpha = a * m * (k ? 0.9 : 0.35);
        ctx.lineWidth = k ? 3 : 9;
        ctx.beginPath();
        ctx.arc(st.bx, st.by, R - 4, ang - span, ang + span);
        ctx.stroke();
      }
      if (firing) {
        // Ember sparks orbiting the ring while the guns are hot.
        const flick = 0.6 + 0.4 * Math.sin(t * 31);
        ctx.fillStyle = PAL.playerFire[0];
        for (let k = 0; k < 3; k++) {
          const sa = t * 6 + (k / 3) * TAU;
          ctx.globalAlpha = a * flick * 0.8;
          ctx.beginPath();
          ctx.arc(st.bx + Math.cos(sa) * (R + 3), st.by + Math.sin(sa) * (R + 3), 2.4, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = a * 0.22 * flick;
        ctx.strokeStyle = PAL.syndicate[3];
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(st.bx, st.by, R + 3, 0, TAU);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      // Piston rod from the hub to the knob.
      ctx.globalAlpha = a;
      ctx.lineCap = 'round';
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(st.bx, st.by);
      ctx.lineTo(st.kx, st.ky);
      ctx.stroke();
      ctx.strokeStyle = st.kind === 'aim' ? PAL.copper[1] : PAL.brass[1];
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,240,200,0.55)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = PAL.brass[2];
      ctx.beginPath();
      ctx.arc(st.bx, st.by, 5, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = a;
    this._blit(ctx, knob, st.kx, st.ky, 1 + (st.id !== -1 ? 0.04 : 0));
  }

  _drawButton(ctx, b, op, t) {
    const pressed = b.held;
    const tex = this._tex('btn', b.r, `${b.kind}/${pressed ? 1 : 0}`);
    const hasLabel = b.kind !== 'pause';
    const sc = (pressed ? 0.93 : 1) * (1 + b.press * b.press * 0.06);
    ctx.globalAlpha = Math.min(1, op + (pressed ? 0.35 : 0.1));
    this._blit(ctx, tex, b.x, b.y, sc, hasLabel ? 13 : 0);
    // Status gauges (fed by the game via setTouchStatus).
    if (b.kind === 'boost' && this.status.boost >= 0) {
      const v = clamp(this.status.boost, 0, 1);
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(20,12,6,0.7)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + 5, -Math.PI / 2, -Math.PI / 2 + TAU * 0.999);
      ctx.stroke();
      ctx.strokeStyle = v >= 1 ? PAL.steamGauge : PAL.brass[1];
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + 5, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.001, v));
      ctx.stroke();
      if (v >= 1) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha *= 0.35 + 0.25 * Math.sin(t * 5);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    if (b.kind === 'bomb' && this.status.bombs >= 0) {
      const n = this.status.bombs | 0;
      const max = Math.max(n, this.status.bombsMax | 0, 1);
      const spread = 0.32;
      for (let i = 0; i < max; i++) {
        const ang = -Math.PI / 2 + (i - (max - 1) / 2) * spread;
        const px = b.x + Math.cos(ang) * (b.r + 8);
        const py = b.y + Math.sin(ang) * (b.r + 8);
        ctx.fillStyle = PAL.ink;
        ctx.beginPath();
        ctx.arc(px, py, 4.2, 0, TAU);
        ctx.fill();
        ctx.fillStyle = i < n ? PAL.gold : PAL.iron[2];
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, TAU);
        ctx.fill();
      }
      if (n === 0) {
        ctx.globalAlpha *= 0.5;
        ctx.fillStyle = PAL.ink;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r - 2, 0, TAU);
        ctx.fill();
      }
    }
    // Press ripples (additive brass rings).
    ctx.globalCompositeOperation = 'lighter';
    for (const r of b.ripples) {
      if (r.t >= 1) continue;
      const e = 1 - (1 - r.t) ** 3;
      ctx.globalAlpha = (1 - r.t) * 0.7;
      ctx.strokeStyle = b.kind === 'bomb' ? PAL.syndicate[3] : b.kind === 'boost' ? PAL.steamGauge : PAL.brass[0];
      ctx.lineWidth = 3 * (1 - r.t) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, b.r * (1 + e * 0.9), 0, TAU);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}
