// STUB (WP7 replaces) — audio engine facade. API: DESIGN §4.17. Silently no-ops for now.
import { SFX } from './sfx.js';
import { Music } from './music.js';

export const audio = {
  ctx: null,
  master: null,
  sfxBus: null,
  musicBus: null,
  musicPlayer: null,
  listener: { x: 0, y: 0 },
  init() {},
  unlock() {},
  setVolumes() {},
  play(name) {
    void SFX[name];
  },
  setListener(x, y) {
    this.listener.x = x;
    this.listener.y = y;
  },
  loop() {
    return { set() {}, stop() {} };
  },
  music(track) {
    this.currentTrack = track;
    void Music;
  },
  setIntensity() {},
  duck() {},
  suspend() {},
  resume() {},
};
