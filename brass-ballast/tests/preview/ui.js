// WP9 preview harness: opens any UI screen over a live backdrop with a mock game.
import '../../js/gfx/art/index.js';
import '../../js/content/enemies/index.js';
import '../../js/content/bosses/index.js';
import '../../js/content/weapons/index.js';
import { Save } from '../../js/core/storage.js';
import { events } from '../../js/core/events.js';
import { Renderer } from '../../js/gfx/renderer.js';
import { Background } from '../../js/gfx/background.js';
import { Sprites } from '../../js/gfx/sprites.js';
import { cardFor } from '../../js/content/upgrades.js';
import { ACHIEVEMENTS } from '../../js/content/achievements.js';
import { UI } from '../../js/ui/ui.js';

const q = new URLSearchParams(location.search);
const screen = q.get('screen') || 'title';
const log = (...a) => console.log('[test]', ...a);

// Never touch the real save unless asked.
if (!q.has('persist')) {
  Save.save = () => {};
  Save.saveNow = () => {};
}

function seed(state) {
  const d = Save.data;
  if (state === 'fresh') return;
  const rich = state === 'rich';
  d.meta.cogs = rich ? 99999 : 1340;
  d.meta.totalCogs = 5200;
  d.meta.unlockedHulls = rich ? ['dauntless', 'cormorant', 'bulwark', 'tinker', 'bane'] : ['dauntless', 'cormorant'];
  d.meta.unlockedWeapons = rich ? ['brassCannon', 'gatling', 'blunderbuss', 'mortar', 'aetherLance', 'harpoon'] : ['brassCannon', 'gatling'];
  d.meta.hull = 'cormorant';
  d.meta.weapon = 'gatling';
  d.meta.workshop = rich ? { hullPlating: 5, engines: 3, gunnery: 5, rerolls: 3, emergencyBalloon: 1 } : { hullPlating: 2, gunnery: 1, rerolls: 3 };
  d.codex.enemies = { gyroScout: 211, kiteBomber: 40, balloonMine: 18, gunboat: 25, clockWasp: 3 };
  d.codex.bosses = { ironMatriarch: 2 };
  d.codex.weapons = { brassCannon: 1, gatling: 1, teslaCoil: 1, rocketPods: 1 };
  d.codex.upgrades = { plating: 1, rifling: 1, quickLoader: 1 };
  d.stats = { ...d.stats, runs: 7, wins: rich ? 1 : 0, kills: 1450, bestScore: 48210, maxStage: rich ? 5 : 2, bestEndlessWave: 13 };
  d.highscores.campaign = [{ score: 48210 }];
  d.highscores.endless = [{ score: 30155 }];
  const now = Date.now();
  ACHIEVEMENTS.slice(0, rich ? ACHIEVEMENTS.length : 2).forEach((a, i) => { d.achievements[a.id] = now - i * 86400000; });
  d.tutorialSeen = q.get('tutorial') !== '0';
}
seed(q.get('state') || 'mid');

// ---------------------------------------------------------------- mock game
const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const background = new Background(renderer);
const input = {
  menu: {},
  lastDevice: q.get('device') || 'kbm',
  _queue: [],
  update() {
    this.menu = {};
    const e = this._queue.shift();
    if (e) {
      this.menu[e] = true;
      this.lastDevice = 'pad';
    }
  },
};
const fakePlayer = {
  index: 0,
  hp: 74,
  stats: { maxHp: 120 },
  primary: { id: 'gatling', level: 4 },
  aux: [{ id: 'teslaCoil', level: 3 }, { id: 'hellfire', level: 1 }, { id: 'clockDrones', level: 5 }],
  passives: { plating: 2, rifling: 3, quickLoader: 1, luckyRivet: 5, magnet: 1 },
  passiveLevel(id) { return this.passives[id] || 0; },
  auxLevel(id) { return this.aux.find((a) => a.id === id)?.level || 0; },
};
const game = {
  state: q.get('gstate') || (screen === 'pause' ? 'paused' : screen === 'levelup' ? 'levelup' : 'title'),
  input,
  renderer,
  run: {
    mode: q.get('mode') || 'daily', modifiers: ['glassCannon', 'swarm'], stageIndex: 1, stage: null, wave: 3, waveCount: 5,
    time: 512.4, score: 18230, kills: 342, level: 14, cogs: 287,
  },
  world: { players: [fakePlayer] },
  startRun(o) { log('startRun', JSON.stringify(o)); game.state = 'playing'; },
  pause() { game.state = 'paused'; ui.show('pause'); },
  resume() { log('resume'); game.state = 'playing'; ui.hide(); },
  restart() { log('restart'); },
  quitToTitle() { log('quitToTitle'); game.state = 'title'; ui.show('title'); },
  applySettings() { log('applySettings', JSON.stringify(Save.settings)); },
};
const ui = new UI(game);
game.ui = ui;

// ---------------------------------------------------------------- sample payloads
function sampleCards(n) {
  const p0 = { passiveLevel: () => 0, auxLevel: () => 0 };
  const pL = { passiveLevel: (id) => (id === 'rifling' ? 2 : 0), auxLevel: (id) => (id === 'rocketPods' ? 2 : 0) };
  const cards = [
    cardFor('hellfire', p0),
    cardFor('rocketPods', pL),
    cardFor('aetherShield', p0) || cardFor('plating', p0),
    cardFor('teslaCoil', p0),
  ].filter(Boolean);
  cards.splice(2, 0, cardFor('rifling', pL));
  const prim = { key: 'primary:gatling', kind: 'primaryLevel', id: 'gatling', name: 'Calibrate Gatling', desc: '+12% damage and +6% rate of fire. Spins up faster.', icon: 'icon_gatling', rarity: 'epic', level: 6, maxLevel: 8 };
  const order = [cards[0], cards[1], cards[2], prim, cards[3], cards[4]].filter(Boolean);
  return order.slice(0, n);
}
const summary = (win) => ({
  victory: win, mode: win ? 'campaign' : 'endless', score: win ? 184230 : 48210, time: win ? 2290 : 777, kills: win ? 2304 : 612,
  bossKills: win ? 5 : 1, stageReached: win ? 5 : 2, wave: 13, level: win ? 41 : 19, cogsEarned: win ? 2140 : 486,
  bestCombo: 4.3, damageDealt: 912345, damageTaken: 1240, newHighScore: true,
  achievements: ACHIEVEMENTS.slice(0, 2).map((a) => a.id), unlocks: win ? ["New airship: The Leviathan's Bane", 'New mode: Gauntlet of Iron'] : [],
});

let rerollsLeft = 2;
function open() {
  const tab = Number(q.get('tab') || 0);
  switch (screen) {
    case 'levelup':
      ui.showLevelUp({
        title: q.get('title') || 'Level Up!',
        subtitle: q.get('sub') || undefined,
        cards: sampleCards(Number(q.get('cards') || 3)),
        rerolls: rerollsLeft,
        player: fakePlayer,
        onPick: (c) => log('pick', c.key),
        onReroll: () => { rerollsLeft--; log('reroll'); return sampleCards(Number(q.get('cards') || 3)).reverse(); },
      });
      break;
    case 'results':
      ui.showResults(summary(q.get('win') === '1'), { onRetry: () => log('retry'), onMenu: () => log('menu') });
      break;
    case 'confirm':
      ui.show('title');
      ui.confirm({ title: 'Scuttle all progress?', text: 'Cogs, unlocks and medals will be lost to the sky.', yes: 'Scuttle it', no: 'Keep my ship', danger: true }).then((v) => log('confirm', v));
      break;
    case 'title':
      ui.show('title');
      break;
    case 'hangar':
    case 'codex':
      ui.showPath([['title'], [screen, { tab, mode: q.get('mode') || 'campaign' }]]);
      break;
    case 'pause':
      ui.show('pause');
      break;
    default:
      ui.showPath([['title'], [screen, { tab }]]);
  }
  if (q.has('toasts')) {
    ui.toast('Welcome aboard, Captain.');
    ui.toast(`Achievement unlocked: ${ACHIEVEMENTS[0]?.name || 'First Blood'}`, { kind: 'achievement', icon: ACHIEVEMENTS[0]?.icon, time: 60 });
    ui.toast('Low on cogs', { kind: 'warning', title: 'Purse too light', time: 60 });
    events.emit('pwa:update', {});
  }
  if (q.has('installable')) events.emit('pwa:installable', {});
}

await Sprites.prewarm();
open();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  input.update(dt);
  ui.update(dt);
  renderer.camera.x += 40 * dt;
  background.update(dt);
  renderer.clear();
  background.drawBack(renderer.ctx, renderer);
  renderer.applyScreen();
  background.drawFront(renderer.ctx, renderer, null);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.UIT = { ui, game, Save, pad: (...edges) => input._queue.push(...edges), log };
