// How to Play: controls for keyboard+mouse, gamepad and touch with inline diagrams, plus the
// rules of the sky. Shown automatically before the first voyage.

import { h, frag, icon, frame, backBtn, btn, glyph, tabBar, sfx, kick } from '../dom.js';
import { Sprites } from '../../gfx/sprites.js';

const key = (k, wide = '') => h('kbd', { class: ['key', wide] }, k);

function keyboardDiagram() {
  const row = (...k) => h('div', { class: 'krow' }, k);
  return h(
    'div',
    { class: 'diagram diag-kbm' },
    h(
      'div',
      { class: 'kgroup' },
      h('div', { class: 'kcluster' }, row(key('W')), row(key('A'), key('S'), key('D'))),
      h('div', { class: 'klabel' }, h('b', null, 'Move'), 'Steer your airship'),
    ),
    h(
      'div',
      { class: 'kgroup' },
      h('div', { class: 'kcluster' }, row(key('↑')), row(key('←'), key('↓'), key('→'))),
      h('div', { class: 'klabel' }, h('b', null, 'Aim & fire'), 'Or aim with the mouse'),
    ),
    h(
      'div',
      { class: 'kgroup kmouse' },
      frag(`<svg class="mouse" viewBox="0 0 60 90" aria-hidden="true">
        <rect x="4" y="4" width="52" height="82" rx="26" fill="#f3e8c9" stroke="#3a2610" stroke-width="3"/>
        <path d="M30 4 V40 M4 40 H56" stroke="#3a2610" stroke-width="2.5"/>
        <path d="M7 38 V30 A23 23 0 0 1 29 6 V38 Z" fill="#ffcf4a"/>
        <path d="M53 38 V30 A23 23 0 0 0 31 6 V38 Z" fill="#e39a62"/>
        <rect x="27" y="14" width="6" height="14" rx="3" fill="#7a5420"/></svg>`),
      h('div', { class: 'klabel' }, h('b', null, 'Left: fire'), h('b', { class: 'alt' }, 'Right: bomb')),
    ),
    h(
      'div',
      { class: 'kgroup' },
      h('div', { class: 'kcluster' }, row(key('Space', 'w3')), row(key('Shift', 'w2'))),
      h('div', { class: 'klabel' }, h('b', null, 'Boost'), 'Steam dash, brief invulnerability'),
    ),
    h(
      'div',
      { class: 'kgroup' },
      h('div', { class: 'kcluster' }, row(key('E'), key('Q'))),
      h('div', { class: 'klabel' }, h('b', null, 'Ballast bomb'), 'Clears nearby shot'),
    ),
    h(
      'div',
      { class: 'kgroup' },
      h('div', { class: 'kcluster' }, row(key('Esc', 'w2'), key('P'))),
      h('div', { class: 'klabel' }, h('b', null, 'Pause'), 'Catch your breath'),
    ),
  );
}

function gamepadDiagram() {
  return h(
    'div',
    { class: 'diagram diag-pad' },
    frag(`<svg viewBox="0 0 400 230" role="img" aria-label="Gamepad controls">
      <defs><linearGradient id="padg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b626b"/>
      <stop offset="1" stop-color="#22262c"/></linearGradient></defs>
      <path d="M120 60 Q200 48 280 60 Q330 64 345 120 Q362 190 330 200 Q305 208 285 170 L270 150 H130 L115 170
        Q95 208 70 200 Q38 190 55 120 Q70 64 120 60Z" fill="url(#padg)" stroke="#1a120a" stroke-width="3"/>
      <rect x="112" y="44" width="40" height="14" rx="6" fill="#c9973f" stroke="#1a120a" stroke-width="2"/>
      <rect x="248" y="44" width="40" height="14" rx="6" fill="#c9973f" stroke="#1a120a" stroke-width="2"/>
      <circle cx="128" cy="98" r="22" fill="#1f2328" stroke="#c9973f" stroke-width="3"/>
      <circle cx="128" cy="98" r="12" fill="#ffcf4a" stroke="#4a3112" stroke-width="2"/>
      <circle cx="238" cy="142" r="22" fill="#1f2328" stroke="#c9973f" stroke-width="3"/>
      <circle cx="238" cy="142" r="12" fill="#7ff3ff" stroke="#1d5f5c" stroke-width="2"/>
      <path d="M154 132h10v-10h10v10h10v10h-10v10h-10v-10h-10z" fill="#c9973f" stroke="#1a120a" stroke-width="1.5"/>
      <circle cx="286" cy="80" r="9" fill="#9aa3ad" stroke="#1a120a" stroke-width="2"/>
      <circle cx="306" cy="98" r="9" fill="#d8452f" stroke="#1a120a" stroke-width="2"/>
      <circle cx="286" cy="116" r="9" fill="#4fe3d0" stroke="#1a120a" stroke-width="2"/>
      <circle cx="266" cy="98" r="9" fill="#9aa3ad" stroke="#1a120a" stroke-width="2"/>
      <text x="286" y="120" font-size="10" text-anchor="middle" fill="#1a120a" font-weight="bold">A</text>
      <text x="306" y="102" font-size="10" text-anchor="middle" fill="#fff" font-weight="bold">B</text>
      <rect x="216" y="92" width="16" height="9" rx="4" fill="#f2d48a" stroke="#1a120a"/>
      <g font-family="Georgia, serif" font-size="13" fill="#f3e8c9" stroke="none">
        <text x="20" y="30">LB / LT · Boost</text><text x="380" y="30" text-anchor="end">RB · Bomb  |  RT · Fire</text>
        <text x="8" y="100">Move</text><text x="14" y="140" font-size="11">(or D-pad)</text>
        <text x="235" y="215" text-anchor="middle">Aim &amp; fire</text>
        <text x="394" y="168" text-anchor="end">A · Boost</text><text x="394" y="184" text-anchor="end">B · Bomb</text>
        <text x="224" y="78" text-anchor="middle" font-size="11">Start · Pause</text>
      </g>
      <g stroke="#f2d48a" stroke-width="1.2" fill="none" opacity=".75">
        <path d="M46 96 H104"/><path d="M238 164 V202"/><path d="M314 106 L352 152"/><path d="M224 82 V90"/>
        <path d="M132 34 V44"/><path d="M268 34 V44"/>
      </g></svg>`),
    h('p', { class: 'diag-note' }, 'Second gamepad: press Start mid-voyage to bring a wingmate aboard.'),
  );
}

/** Data URL of a sprite icon for use inside an inline SVG ('' when the sprite is missing). */
function iconHref(name) {
  try {
    return Sprites.has(name) ? Sprites.iconURL(name, 64) : '';
  } catch {
    return '';
  }
}

/** Compass-rose stick base like the touch HUD's: brass ring, four pointers and a knob. */
function stickSVG(cx, cy, kx, ky, ring, knob) {
  const tri = (a) => {
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const p = (r, o) => `${(cx + c * r - sn * o).toFixed(1)},${(cy + sn * r + c * o).toFixed(1)}`;
    return `<path d="M${p(27, 0)} L${p(20, -4)} L${p(20, 4)}Z" fill="${ring}" opacity=".85"/>`;
  };
  return `<circle cx="${cx}" cy="${cy}" r="31" fill="rgba(20,14,8,.35)" stroke="${ring}" stroke-width="2.5"/>
      <circle cx="${cx}" cy="${cy}" r="24" fill="none" stroke="${ring}" stroke-width="1" opacity=".5"/>
      ${[0, 1, 2, 3].map((i) => tri((i * Math.PI) / 2 - Math.PI / 2)).join('')}
      <circle cx="${kx}" cy="${ky}" r="13" fill="url(#td-knob)" stroke="#2b1a08" stroke-width="2"/>
      <circle cx="${kx}" cy="${ky}" r="5" fill="none" stroke="${knob}" stroke-width="2"/>`;
}

/** Brass-rimmed porthole button with the touch HUD's icon (bomb on oxblood, steam on navy). */
function portholeSVG(cx, cy, fill, ring, ic) {
  const href = iconHref(ic);
  return `<circle cx="${cx}" cy="${cy}" r="21" fill="none" stroke="${ring}" stroke-width="1.5" opacity=".8"/>
      <circle cx="${cx}" cy="${cy}" r="17" fill="${fill}" stroke="url(#td-brass)" stroke-width="3.5"/>
      ${href ? `<image href="${href}" x="${cx - 12}" y="${cy - 12}" width="24" height="24"/>` : ''}`;
}

function touchDiagram() {
  return h(
    'div',
    { class: 'diagram diag-touch' },
    frag(`<svg viewBox="0 0 400 220" role="img" aria-label="Touch controls">
      <defs>
        <linearGradient id="td-brass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2d48a"/>
          <stop offset=".5" stop-color="#c9973f"/><stop offset="1" stop-color="#7a5420"/></linearGradient>
        <radialGradient id="td-sky" cx=".5" cy=".35" r=".8"><stop offset="0" stop-color="#2f4a63"/>
          <stop offset="1" stop-color="#16222e"/></radialGradient>
        <radialGradient id="td-knob" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fbe7b0"/>
          <stop offset=".6" stop-color="#c9973f"/><stop offset="1" stop-color="#6a4a20"/></radialGradient>
      </defs>
      <rect x="10" y="18" width="380" height="190" rx="28" fill="#2b1a08" stroke="url(#td-brass)" stroke-width="5"/>
      <rect x="18" y="26" width="364" height="174" rx="22" fill="none" stroke="#1a120a" stroke-width="2"/>
      ${[[24, 113], [376, 113]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="url(#td-brass)" stroke="#1a120a"/>`).join('')}
      <rect x="32" y="34" width="336" height="158" rx="12" fill="url(#td-sky)" stroke="#1a120a" stroke-width="2"/>
      <path d="M200 40 V186" stroke="#f3e8c9" stroke-dasharray="5 6" opacity=".3"/>
      <circle cx="54" cy="56" r="13" fill="#2b2620" stroke="url(#td-brass)" stroke-width="3"/>
      <path d="M50 50v12M58 50v12" stroke="#f2d48a" stroke-width="3"/>
      ${stickSVG(102, 132, 112, 124, '#c9973f', '#7a5420')}
      ${stickSVG(268, 140, 254, 130, '#c9973f', '#1d5f5c')}
      ${portholeSVG(310, 70, '#8c2f2b', '#c9973f', 'icon_bomb')}
      ${portholeSVG(346, 112, '#2d4a6e', '#7ff3ff', 'icon_steam')}
      <g font-family="Georgia, serif" font-size="12" font-weight="bold" fill="#f3e8c9" text-anchor="middle"
        stroke="#16222e" stroke-width="3" paint-order="stroke" letter-spacing=".06em">
        <text x="102" y="182">MOVE</text><text x="268" y="186">AIM · FIRE</text>
        <text x="310" y="104" font-size="10.5">BOMB</text>
        <text x="346" y="146" font-size="10.5">BOOST</text>
        <text x="74" y="60" text-anchor="start" font-size="10.5">PAUSE</text>
      </g></svg>`),
    h('p', { class: 'diag-note' }, 'Touch anywhere on the left to sprout a stick; the right half aims and fires.'),
  );
}

const RULES = [
  ['icon_xp', 'Aether shards', 'Downed craft drop teal shards. Fill the Aether gauge to level up and pick an upgrade card.'],
  ['icon_steam', 'Boost', 'Spend steam to dash. You are untouchable for a heartbeat — boost straight through enemy shot.'],
  ['icon_bomb', 'Ballast bombs', 'Drop a bomb to wipe out nearby bullets and blast everything around you.'],
  ['icon_cog', 'Cogs', 'Collect brass cogs. They are banked after every voyage for the Hangar and Workshop.'],
  ['icon_star', 'Combos', 'Chain kills quickly to raise your score multiplier. Taking a hit breaks the chain.'],
  ['icon_boss', 'Leviathans', 'Each stage ends with a colossal boss. Watch the glowing telegraphs and keep moving.'],
];

export default function build(ui, params) {
  const first = !!params.first;
  const diag = h('div', { class: 'howto-diagram' });
  const views = [keyboardDiagram, gamepadDiagram, touchDiagram];
  let inst = null;
  const dev = ui.nav?.device || 'kbm';
  const start = dev === 'pad' ? 1 : dev === 'touch' ? 2 : 0;
  // " & Mouse" drops on narrow phones so all three tabs fit the board.
  const kbmLabel = ['Keyboard', h('span', { class: 'tab-more' }, ' & Mouse')];
  const tabs = tabBar([kbmLabel, 'Gamepad', 'Touch'], (i) => {
    diag.replaceChildren(views[i]());
    if (inst) kick(diag, 'swap');
  }, start);

  const rules = h(
    'div',
    { class: 'rules' },
    RULES.map(([ic, t, d]) =>
      h('div', { class: 'rule' }, icon(ic, 48, { cls: 'rule-icon', glyph: t[0] }), h('div', null, h('b', null, t), h('p', null, d))),
    ),
  );

  const done = () => {
    sfx('ui_select');
    if (first && typeof params.onDone === 'function') {
      ui.pop();
      params.onDone();
    } else ui.pop();
  };
  const go = btn(first ? 'Cast off!' : 'Understood', done, { kind: first ? 'launch' : 'primary', glyph: 'confirm' });
  const back = backBtn(() => {
    sfx('ui_back');
    ui.pop();
  });

  const f = frame({
    title: 'How to Fly',
    sub: first ? 'A word before your maiden voyage, Captain' : 'The captain’s handbook',
    tabs,
    body: h('div', { class: 'howto-grid' }, h('div', { class: 'howto-left' }, diag), h('div', { class: 'howto-right' }, h('h2', { class: 'engraved' }, h('span', null, 'Rules of the Sky')), rules)),
    bodyCls: 'howto-body',
    footer: [back, h('div', { class: 'foot-hint' }, glyph('tabL'), glyph('tabR'), ' Controls'), go],
  });
  inst = {
    el: h('div', { class: ['howto-screen', ui.game?.state === 'paused' && 'over-run'] }, f.el),
    focus: go,
    tabs,
  };
  return inst;
}
