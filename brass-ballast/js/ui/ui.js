// STUB (WP9 replaces) — minimal DOM UI so the flow is testable. API: DESIGN §4.11.
import { Save } from '../core/storage.js';

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'onclick') e.addEventListener('click', v);
    else e.setAttribute(k, v);
  }
  for (const k of kids) e.append(k);
  return e;
}

export class UI {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui');
    this.active = null;
  }
  get isOpen() {
    return !!this.active;
  }
  update() {}
  hide() {
    this.root.replaceChildren();
    this.active = null;
  }
  _panel(name, ...kids) {
    this.root.replaceChildren(el('div', { class: 'stub-panel', 'data-screen': name }, ...kids));
    this.active = name;
  }
  show(name) {
    const g = this.game;
    if (name === 'title') {
      this._panel('title', el('h1', {}, 'Brass & Ballast'),
        el('button', { id: 'btn-play', onclick: () => { this.hide(); g.startRun({ mode: 'campaign', hull: Save.meta.hull, weapon: Save.meta.weapon }); } }, 'Set Sail'));
    } else if (name === 'pause') {
      this._panel('pause', el('h2', {}, 'Paused'),
        el('button', { onclick: () => g.resume() }, 'Resume'),
        el('button', { onclick: () => g.quitToTitle() }, 'Abandon Voyage'));
    } else {
      this._panel(name, el('h2', {}, name), el('button', { onclick: () => this.show('title') }, 'Back'));
    }
  }
  toast(text) {
    console.log('[toast]', text);
  }
  showLevelUp({ title = 'Level Up', cards = [], onPick }) {
    this._panel('levelup', el('h2', {}, title), ...cards.map((c) =>
      el('button', { class: 'card', onclick: () => { this.hide(); onPick(c); } }, `${c.name} — ${c.desc || ''}`)));
  }
  showResults(summary, { onRetry, onMenu } = {}) {
    this._panel('results', el('h2', {}, summary.victory ? 'Victory!' : 'Shot Down'),
      el('p', {}, `Score ${summary.score ?? 0}`),
      el('button', { onclick: () => { this.hide(); onRetry?.(); } }, 'Sail Again'),
      el('button', { onclick: () => { this.hide(); onMenu?.(); } }, 'Title'));
  }
}
