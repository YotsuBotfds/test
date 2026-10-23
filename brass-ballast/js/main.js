// Boot & wiring (DESIGN §3, WP1). Registers all art, prewarms sprites behind the #boot
// loader, builds every subsystem, hands them to the Game and shows the title (or autostarts).

import './gfx/art/index.js';
import './content/enemies/index.js';
import './content/bosses/index.js';
import './content/weapons/index.js';
import { flag } from './config.js';
import { Sprites } from './gfx/sprites.js';
import { Renderer } from './gfx/renderer.js';
import { Background } from './gfx/background.js';
import { Weather } from './gfx/weather.js';
import { Particles, FX } from './gfx/particles.js';
import { Input } from './input/input.js';
import { audio } from './audio/audio.js';
import { HUD } from './ui/hud.js';
import { UI } from './ui/ui.js';
import { AchievementTracker } from './content/achievements.js';
import { initPWA } from './pwa.js';
import { Game } from './game/game.js';
import { initDebug, autostartRun } from './debug.js';

function setBoot(frac, label) {
  const bar = document.getElementById('boot-bar');
  if (bar) bar.style.width = `${Math.round(frac * 100)}%`;
  const txt = document.getElementById('boot-label');
  if (txt && label) txt.textContent = label;
}

function safe(label, fn, fallback) {
  try {
    return fn();
  } catch (err) {
    console.error(`[boot] ${label} failed`, err);
    return fallback;
  }
}

async function boot() {
  setBoot(0.02, 'Riveting the hull…');
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));
  const renderer = new Renderer(canvas);

  try {
    await Sprites.prewarm((done, total) => setBoot(0.05 + 0.85 * (done / Math.max(1, total)), 'Painting the skies…'));
  } catch (err) {
    console.error('[boot] sprite prewarm failed', err);
  }
  setBoot(0.92, 'Stoking the boilers…');

  safe('audio.init', () => audio.init?.());
  const input = safe('Input', () => new Input(canvas, renderer), null);
  input?.onFirstInteraction?.(() => {
    safe('audio.unlock', () => audio.unlock?.());
  });
  const background = safe('Background', () => new Background(renderer), null) || stubBackground();
  const weather = safe('Weather', () => new Weather(renderer), null) || stubWeather();
  const particles = safe('Particles', () => new Particles(5000), null);
  const fx = safe('FX', () => new FX(particles), null);

  const game = new Game({ renderer, input, audio, background, weather, particles, fx });
  game.hud = safe('HUD', () => new HUD(game), null);
  game.ui = safe('UI', () => new UI(game), null);
  safe('AchievementTracker', () => new AchievementTracker(game));
  safe('initPWA', () => initPWA(game));
  const debug = initDebug(game, { audio });
  void debug;

  setBoot(1, 'Cast off!');
  document.getElementById('boot')?.classList.add('done');
  game.boot();
  if (flag('autostart')) autostartRun(game);
}

function stubBackground() {
  return {
    setBiome() {},
    update() {},
    drawBack(ctx, r) {
      r.applyScreen(ctx);
      ctx.fillStyle = '#e9a066';
      ctx.fillRect(0, 0, r.cssW, r.cssH);
    },
    drawFront() {},
  };
}

function stubWeather() {
  return { wind: { x: 0, y: 0 }, flash: 0, setBiome() {}, update() {}, draw() {}, strike() {}, setIntensity() {} };
}

boot().catch((err) => {
  console.error('[boot] fatal', err);
  document.getElementById('boot')?.classList.add('done');
});
