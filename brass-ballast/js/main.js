// STUB (WP1 replaces entirely) — boots the title screen over the backdrop so other WPs can
// see their work before the core engine lands.
import './gfx/art/index.js';
import './content/enemies/index.js';
import './content/bosses/index.js';
import { Sprites } from './gfx/sprites.js';
import { Renderer } from './gfx/renderer.js';
import { Background } from './gfx/background.js';
import { Weather } from './gfx/weather.js';
import { UI } from './ui/ui.js';

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const background = new Background(renderer);
const weather = new Weather(renderer);
const game = {
  state: 'title', renderer,
  startRun: (opts) => console.warn('[stub] core engine not built yet', opts),
  resume() {}, pause() {}, quitToTitle() {}, applySettings() {},
};
const ui = new UI(game);
game.ui = ui;

await Sprites.prewarm((d, t) => {
  const bar = document.getElementById('boot-bar');
  if (bar) bar.style.width = `${(100 * d) / t}%`;
});
document.getElementById('boot')?.classList.add('done');
ui.show('title');

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  renderer.camera.x += 40 * dt;
  background.update(dt);
  weather.update(dt, renderer);
  renderer.clear();
  background.drawBack(renderer.ctx, renderer);
  renderer.applyWorld();
  Sprites.draw(renderer.ctx, 'hull_dauntless', renderer.camera.x, renderer.camera.y + Math.sin(now / 600) * 6, 0, 1.5);
  renderer.applyScreen();
  background.drawFront(renderer.ctx, renderer, null);
  weather.draw(renderer.ctx, renderer);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.BB = { game, renderer, Sprites };
