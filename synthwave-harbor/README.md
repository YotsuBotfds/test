# Neon Harbor Run

A real-time synthwave scene: a sailboat with glowing sails races through a neon harbor at night, toward a striped sun setting between wireframe mountains. It runs in the browser with Three.js and comes with a synthesized soundtrack. The same page renders the frame-exact video in `neon-harbor.mp4`.

## Watch it

- **Video:** `neon-harbor.mp4` (48 s, 1920×1080, 60 fps, with soundtrack).
- **Live scene:** serve the repo and open `synthwave-harbor/index.html`. The repo's dev server works:

  ```bash
  node scripts/dev-server.js
  # then open http://localhost:8000/synthwave-harbor/index.html
  ```

  The page loads Three.js 0.170.0 and its fonts from public CDNs, so it needs a network connection. It also needs WebGL 2.

### Controls

| Key | Button | Action |
| --- | --- | --- |
| `M` | Sound | Start or stop the soundtrack (browsers only allow audio after a click or key press) |
| `C` | Camera | Cycle Auto (cinematic) → Chase → Skim → Broadside → Aerial → Bridge Run → Head-on → Free |
| `Space` | Pause | Pause or resume; audio pauses with it |
| `F` | Fullscreen | Toggle fullscreen |
| `H` | Hide HUD | Hide or show the overlay; tap the scene to bring it back |

In Free camera mode, drag to orbit around the boat and scroll to zoom. With `prefers-reduced-motion` set, the scene starts paused and drops the camera shake, cut flashes and beat pulses.

## What's in the run

One loop is 48 seconds, which is 24 bars at 120 bpm. The camera cuts land on bar lines:

| Time | Shot | Music |
| --- | --- | --- |
| 0–8 s | Chase: low behind the boat, rising, sun ahead | Intro: pad and arpeggio, bass enters |
| 8–14 s | Skim: wide lens at the waterline off the bow | Drums and crash come in |
| 14–22 s | Broadside: tracking alongside, city streaming past | Groove |
| 22–28 s | Aerial: drone flyover of the wake and the neon grid | Build starts, riser sweeps up |
| 28–34 s | Bridge Run: low chase under the suspension bridge | Snare roll, then the drop at 32 s as the boat passes under |
| 34–40 s | Head-on: looking back at the boat with the bridge behind it | Lead melody |
| 40–48 s | Orbit: circles round to the opening chase framing | Lead melody, loops back to the intro |

## Render the video yourself

The page has a render mode (`index.html?render&w=1920&h=1080`) that exposes `window.__frame(t)` and `window.__soundtrack(seconds)`. `render.mjs` drives it with headless Chromium, renders the soundtrack offline, and muxes everything with ffmpeg.

```bash
cd synthwave-harbor
npm install --no-save three@0.170.0 playwright
npx playwright install chromium
node render.mjs --out neon-harbor.mp4                       # full run, 1080p60
node render.mjs --stills 2,10,17,25,31,37 --out stills      # PNG stills at those times
```

Options: `--width`, `--height`, `--fps`, `--seconds`, `--crf`, `--workers` (parallel pages), `--subframes` (motion blur, averaged across a 180° shutter) and `--start` (resume from a time). Frames already on disk are skipped, so an interrupted render picks up where it left off. If `three` is installed locally, the script serves it instead of the CDN.

On a machine without a GPU, Chromium falls back to SwiftShader, at about 1.4 s per 1080p frame.

## How it works

- **Treadmill world.** The boat stays near the origin. The harbor is 12 chunks (2,208 units in all) that slide past and wrap, so the run never ends. Every chunk is merged into a few draw calls per material.
- **Deterministic time.** Every shader animates from loop time: water, wake, spray, buoys, blinking lights, the lighthouse and car lights on the bridge. Boat speed, sway and the camera are closed-form functions of time too. Any frame can be rendered on its own and in any order, which is what makes the parallel video render exact, and the 48 s loop is seamless.
- **Water.** A `Reflector` mirror sampled through a procedurally generated, tileable slope map. Reflections are smeared vertically into the long light streaks you see on real harbor chop. The wake, Kelvin arms, bow wave, foam and the boat's neon underglow are computed analytically in the water shader from the boat's past positions.
- **Look.** HDR rendering, `UnrealBloomPass`, then a final pass for chromatic aberration, ACES tone mapping, a violet split-tone, vignette and grain. Neon materials pulse with the kick drum.
- **Sound.** A Web Audio synth score in A minor (Am–F–C–G): sidechain-pumped bass and pads, a dotted-eighth arpeggio, gated-reverb snare, a riser into the drop, and a lead melody. The video's audio comes from the same code, rendered in an `OfflineAudioContext`.
