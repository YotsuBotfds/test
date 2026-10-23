// Credits: a slowly rolling scroll of parchment. Pauses while the reader interacts.

import * as Lore from '../../content/codex.js';
import { h, frag, frame, backBtn, sfx, reducedMotion } from '../dom.js';
import { emblemSVG, gearSVG } from '../art.js';

const OUR_CREDITS = `THE MACHINERY
Every airship, cannonball and cloud — drawn by code on a Canvas
Every bell, boom and brass note — synthesised live with Web Audio
Every menu — brass, parchment and rivets cut from pure CSS

NO IMAGES · NO SAMPLES · NO FONTS
Only vanilla JavaScript, steam and stubbornness

SPECIAL THANKS
To the gulls of Brassbay, for their patience
To the stokers, riveters and sail-menders of the Free Skies
And to you, Captain, for flying with us`;

function lines(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim());
}

function render(text) {
  const out = [];
  for (const l of lines(text)) {
    if (!l) {
      out.push(h('div', { class: 'cr-gap' }));
      continue;
    }
    if (l.toUpperCase() === 'BRASS & BALLAST') continue;
    const isHead = /:$/.test(l) || (/^[^a-z]{3,}$/.test(l) && /[A-Z]/.test(l));
    if (isHead) {
      out.push(h('h3', { class: 'cr-head' }, l.replace(/:$/, '')));
      continue;
    }
    const m = l.match(/^(.+?)\s*(?:\.{3,}|\s[—–-]\s|:\s)\s*(.+)$/);
    if (m && m[1].length < 40) out.push(h('div', { class: 'cr-pair' }, h('span', null, m[1]), h('b', null, m[2])));
    else out.push(h('p', { class: 'cr-line' }, l));
  }
  return out;
}

export default function build(ui) {
  const text = Lore.CREDITS;
  const roll = h(
    'div',
    { class: 'cr-roll' },
    h('div', { class: 'cr-spacer' }),
    h('div', { class: 'cr-emblem' }, frag(emblemSVG())),
    h('h2', { class: 'cr-title' }, 'Brass & Ballast'),
    h('div', { class: 'cr-sub' }, 'A Skyship Shooter of the Clockwork Age'),
    h('div', { class: 'cr-rule' }, frag(gearSVG(10, 'cr-cog', 0.3))),
    render(Array.isArray(text) ? text.join('\n') : text),
    h('div', { class: 'cr-rule' }, frag(gearSVG(10, 'cr-cog', 0.3))),
    render(OUR_CREDITS),
    h('div', { class: 'cr-end' }, 'Fair winds & full boilers'),
    h('div', { class: 'cr-spacer' }),
  );
  const box = h('div', { class: 'cr-box', tabindex: '-1' }, roll);
  let raf = 0;
  let last = 0;
  let hold = 0;
  let pos = 0;
  const speed = reducedMotion() ? 0 : 26;
  const pauseFor = (s) => {
    hold = Math.max(hold, s);
    pos = box.scrollTop;
  };
  box.addEventListener('pointerdown', () => pauseFor(4));
  box.addEventListener('wheel', () => pauseFor(4), { passive: true });
  box.addEventListener('touchmove', () => pauseFor(4), { passive: true });
  const tick = (now) => {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (hold > 0) {
      hold -= dt;
      pos = box.scrollTop;
    } else if (speed) {
      pos += speed * dt;
      if (pos >= box.scrollHeight - box.clientHeight - 1) pos = 0;
      box.scrollTop = pos;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  const back = backBtn(() => {
    sfx('ui_back');
    ui.pop();
  });
  const f = frame({ title: 'Credits', sub: 'The crew behind the brass', body: box, bodyCls: 'credits-body', footer: [back] });
  return {
    el: h('div', { class: 'credits-screen' }, f.el),
    focus: back,
    onMenu(m) {
      if (m.up || m.down) {
        pauseFor(3);
        box.scrollBy({ top: m.down ? 120 : -120, behavior: 'smooth' });
        return true;
      }
      return false;
    },
    onKey(e) {
      if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'KeyW' || e.code === 'KeyS') {
        pauseFor(3);
        const down = e.code === 'ArrowDown' || e.code === 'KeyS';
        box.scrollBy({ top: down ? 120 : -120, behavior: 'smooth' });
        return true;
      }
      return false;
    },
    destroy() {
      cancelAnimationFrame(raf);
    },
  };
}
