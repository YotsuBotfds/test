// Steampunk drawing kit (WP4) — the shared Canvas 2D vocabulary for every procedural sprite.
// Import everything from this file; the implementation lives in ./drawkit/*.js.
//
// Conventions (DESIGN §5):
//  - Coordinates are sprite/world units; sprites face +x; +y is down.
//  - Light comes from the TOP-LEFT: highlights on upper-left edges, shade lower-right.
//    Never bake drop shadows — the engine draws them.
//  - Outline shapes with `ink()` (dark ~1–1.5 u stroke) so they read on any sky.
//  - Deterministic: use `seeded()` instead of Math.random so cached sprites never change.
//  - These run once per sprite render (Sprites caches), so clarity beats micro-optimisation,
//    but keep path counts sane.
//  - Helpers follow "build path → fill → shade → ink" and restore any context state they
//    change (alpha, composite, clip, dash). Path-builders (roundRect, polygon, smoothPath, star,
//    gearPath, envelopeStripePath, geo.path) leave the new path current for you to fill/stroke.
//  - `kind` arguments name a material ramp in METALS: brass gold copper bronze iron steel gunmetal
//    blackiron wood darkwood syndicate oxblood crimson navy bone cream aether glass.
//  - Colours are hex (#rgb/#rrggbb/#rrggbbaa) or rgb()/rgba(); named colours are not parsed by
//    mix/alpha/lighten/darken.
//
// Index
//  core      toRgb mix lighten darken alpha seeded METALS ramp metal metalRadial cylinderGrad
//            roundRect polygon smoothPath star ink shadeOverlay rimLight finish withClip glow
//            glowEllipse scratchCanvas TAU INK
//  parts     rivet rivetLine rivetRing bolt gearPath gear propeller porthole cylinder pipe plate
//            smokestack grime cannon ventGrille hazardStripes rivetedBand coil gauge spike lamp
//            dome deck railing nacelle ringMount panelLines
//  fabric    envelopeGeo envelopeStripePath envelope balloon stitching stitchLine canvasPatch
//            ropeLine rigging chain flag fin
//  ornament  nameplate crest crystal bone skull hotOrb
//
// Quick recipe — a small enemy gunboat:
//    const geo = envelope(ctx, 40, 20, 64, 26, { fill: '#4b4f58', stripes: [...] });
//    plate(ctx, 30, 14, 18, 12, 2, 'syndicate', { rivets: 3 });
//    smokestack(ctx, 26, 20, 3.5, 'gunmetal', { ember: true });
//    porthole(ctx, ...geo.at(0.5, -0.5), 1.4, { glow: true, color: '#ff7a2f' });

import { PAL } from '../config.js';

export { PAL };
export * from './drawkit/core.js';
export * from './drawkit/parts.js';
export * from './drawkit/fabric.js';
export * from './drawkit/ornament.js';
