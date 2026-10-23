// WP8 — the score. Every track is data: tempo/meter/key, mixer channels (instrument, intensity
// layer, level, pan, reverb/echo sends, tremolo/vibrato LFOs), sections (roman-numeral
// progressions + written themes in scale degrees), a form (intro once, then a looping order) and
// parts (generators that turn the data into notes each bar — see music-composer.js).
//
// Melody notation: `deg[',]:len` (deg 1..7 of the section's key/mode, ' = octave up, , = down,
// #/b accidentals, len in steps), `-:len` rest. Patterns: one char per step (see composer).
// Layers fade with intensity: core (always) · drums · counter · full · calm (fades out).

const C = (inst, layer, vol, o = {}) => ({ inst, layer, vol, pan: 0, rev: 0.2, echo: 0, opt: {}, ...o });

// The title waltz theme — reprised as the music-box lament on the game-over screen.
const TITLE_A = `3':3 2':1 1':2 | 3':2 6:2 1':2 | 2':3 1':1 7:2 | 2':2 5:2 7:2 | 1':3 7:1 6:2 | 1':2 4:2 6:2 |
  #7:3 6:1 5:2 | 1':4 -:2`;

export const TRACKS = {
  // ---- Title: a stately steampunk waltz — music box & accordion, D minor ⇄ F major -----------
  title: {
    tempo: 92, beats: 3, sub: 2, key: 'D', mode: 'minor', floor: 0.68, gain: 1, warmth: 7000,
    echo: { beats: 0.75, fb: 0.3, tone: 2800 },
    ch: {
      box: C('musicbox', 'core', 0.6, { pan: 0.18, rev: 0.35, echo: 0.22 }),
      boxArp: C('musicbox', 'core', 0.3, { pan: -0.25, rev: 0.35, echo: 0.15 }),
      accLead: C('accordion', 'core', 0.42, { pan: -0.08, rev: 0.25, trem: [5.2, 0.16] }),
      acc: C('accordion', 'core', 0.34, { pan: -0.22, rev: 0.22, trem: [5.2, 0.18] }),
      bass: C('tuba', 'core', 0.35, { rev: 0.08, opt: { soft: true } }),
      kick: C('kick', 'drums', 0.3, { opt: { decay: 0.3 } }),
      tick: C('tick', 'drums', 0.2, { pan: 0.35, rev: 0.15 }),
      brush: C('snare', 'drums', 0.45, { pan: -0.15, opt: { brush: true } }),
      glock: C('glock', 'counter', 0.22, { pan: 0.3, rev: 0.35, echo: 0.2 }),
      str: C('strings', 'counter', 0.42, { pan: -0.3, rev: 0.45, vib: [5, 8], opt: { atk: 0.2 } }),
      organ: C('organ', 'full', 0.2, { rev: 0.5, opt: { soft: true, atk: 0.12 } }),
      bell: C('bell', 'full', 0.25, { pan: 0.2, rev: 0.5 }),
      spark: C('musicbox', 'calm', 0.18, { pan: 0.45, rev: 0.5, echo: 0.45 }),
    },
    sections: {
      I: { prog: 'i i' },
      A: { prog: 'i iv VII III VI ii° V i', mel: TITLE_A },
      B: {
        key: 'F', mode: 'major', prog: 'I vi ii V I IV ii III',
        mel: `1:2 3:2 5:2 | 6:4 5:1 4:1 | 4:3 5:1 6:2 | 5:3 4:1 3:1 2:1 | 3:2 5:2 1':2 | 2':3 1':1 6:2 |
          6:2 4:2 2:2 | 7:3 #5:1 3:2`,
      },
      G: { prog: 'i VI iv V i VI ii° V', improv: { from: ['A'] } },
    },
    form: { intro: ['I'], loop: ['A', 'A', 'B', 'A', 'G', 'B'] },
    parts: [
      { ch: 'box', gen: 'melody', reg: 62, tr: 12, only: ['A', 'G'], vel: 0.95 },
      { ch: 'accLead', gen: 'melody', reg: 62, only: ['B'], legato: 0.96 },
      { ch: 'boxArp', gen: 'arp', n: 3, range: [69, 86], pats: { lo: '0-1-2-', mid: '0-121-', hi: '012121' }, only: ['I', 'B'] },
      { ch: 'bass', gen: 'bass', reg: 41, pats: { lo: '1-----', mid: ['1-----', '1---5-'], hi: '1---5-' }, turn: '1-5-a-' },
      { ch: 'acc', gen: 'chords', n: 3, range: [57, 70], pats: '--o-o-', strum: 0.05, legato: 0.75, not: ['I'] },
      { ch: 'kick', gen: 'drum', pats: 'x-----', not: ['I'] },
      { ch: 'tick', gen: 'drum', pats: { lo: 'h---l-', mid: 'h-l-l-', hi: 'h-lhl-' } },
      { ch: 'brush', gen: 'drum', pats: { lo: '--o-o-', hi: '--o-x.' }, fill: '--o-R_', not: ['I'] },
      { ch: 'glock', gen: 'counter', style: 'fill', lo: 74, hi: 93, rate: 1, only: ['A', 'G'], vel: 0.55 },
      { ch: 'glock', gen: 'melody', reg: 62, tr: 12, only: ['B'], vel: 0.6 },
      { ch: 'str', gen: 'counter', style: 'line', lo: 57, hi: 69, not: ['I'] },
      { ch: 'organ', gen: 'chords', n: 4, range: [50, 66], pats: 'x_____' },
      { ch: 'bell', gen: 'hit', when: 'start', reg: 74, only: ['A', 'B'], p: 0.7, len: 6, vel: 0.6 },
      { ch: 'spark', gen: 'sparkle', range: [86, 98], p: 0.06 },
    ],
  },

  // ---- Hangar: cosy clockwork workshop — pizzicato, ticking escapements, G major -----------
  hangar: {
    tempo: 100, beats: 4, sub: 4, key: 'G', mode: 'major', swing: 0.18, floor: 0.45, gain: 1.35,
    warmth: 6500, echo: { beats: 0.75, fb: 0.25, tone: 3000 },
    ch: {
      pz: C('pizz', 'core', 0.9, { pan: 0.15, rev: 0.3 }),
      pzBass: C('pizz', 'core', 0.5, { rev: 0.15 }),
      pzComp: C('pizz', 'core', 0.28, { pan: -0.25, rev: 0.25 }),
      box: C('musicbox', 'core', 0.55, { pan: 0.2, rev: 0.35, echo: 0.25 }),
      tick: C('tick', 'core', 0.2, { pan: 0.4, rev: 0.2 }),
      kick: C('kick', 'drums', 0.28, { opt: { decay: 0.25 } }),
      brush: C('snare', 'drums', 0.3, { pan: -0.1, opt: { brush: true } }),
      shaker: C('hat', 'drums', 0.32, { pan: 0.3, opt: { shaker: true } }),
      flute: C('flute', 'counter', 0.28, { pan: -0.2, rev: 0.35, vib: [5, 10] }),
      glock: C('glock', 'full', 0.2, { pan: 0.3, rev: 0.35 }),
      anvil: C('anvil', 'full', 0.16, { pan: -0.35, rev: 0.3, opt: { freq: 900, decay: 0.4 } }),
      hiss: C('hiss', 'calm', 0.12, { pan: -0.4, rev: 0.3 }),
      spark: C('musicbox', 'calm', 0.14, { pan: 0.5, rev: 0.5, echo: 0.4 }),
    },
    sections: {
      I: { prog: 'I V' },
      A: {
        prog: 'I vi ii V I IV ii,V I',
        mel: `5:2 3:2 5:2 1':2 7:2 1':2 5:4 | 6:2 5:2 6:2 1':2 3':4 -:4 | 4:2 3:2 4:2 6:2 2':4 1':2 6:2 |
          7:4 2':2 1':2 7:2 6:2 5:4 | 5:2 3:2 5:2 1':2 7:2 1':2 5:4 | 1':2 6:2 4:2 6:2 1':4 -:4 |
          2':2 1':2 6:2 4:2 5:2 7:2 2':2 1':2 | 7:2 1':2 5:2 3:2 1:4 -:4`,
      },
      B: {
        prog: 'IV iii ii V IV I II V',
        mel: `6:6 5:2 4:8 | 5:6 4:2 3:8 | 4:6 3:2 2:8 | 7,:4 2:4 5:4 7:4 | 1':6 7:2 6:8 | 7:6 6:2 5:8 |
          2':6 1':2 6:8 | 7:4 6:4 5:8`,
      },
      G: { prog: 'I IV ii V iii vi ii,V I', improv: { from: ['A'] } },
    },
    form: { intro: ['I'], loop: ['A', 'B', 'A', 'G'] },
    parts: [
      { ch: 'pz', gen: 'melody', reg: 67, only: ['A', 'G'], legato: 0.5 },
      { ch: 'box', gen: 'melody', reg: 67, tr: 12, only: ['B'] },
      { ch: 'pzBass', gen: 'bass', reg: 43, pats: { lo: '1-------5-------', mid: '1---5---1---5---', hi: ['1---3---5---a---', '1---5---8---a---'] }, turn: '1---5---3---a---' },
      { ch: 'pzComp', gen: 'chords', n: 3, range: [59, 72], pats: { lo: '----x-------x---', mid: '----x-------x-o-', hi: '--x-x---o-x-x---' }, legato: 0.6 },
      { ch: 'tick', gen: 'drum', pats: { lo: 'h---l---h---l---', hi: 'h-.-l-.-h-.-l-.-' } },
      { ch: 'kick', gen: 'drum', pats: { lo: 'x-------x-------', hi: 'x-------x--x----' }, not: ['I'] },
      { ch: 'brush', gen: 'drum', pats: { lo: '----o-------o---', hi: '----o--.----o-..' }, fill: '----o-------R___', not: ['I'] },
      { ch: 'shaker', gen: 'drum', pats: { lo: '--o---o---o---o-', hi: '.-o-.-o-.-o-.-o.' }, not: ['I'] },
      { ch: 'flute', gen: 'counter', style: 'line', lo: 62, hi: 76, only: ['A', 'G'] },
      { ch: 'flute', gen: 'counter', style: 'harmony', reg: 67, only: ['B'], vel: 0.6 },
      { ch: 'glock', gen: 'counter', style: 'fill', lo: 79, hi: 91, only: ['A'], vel: 0.5 },
      { ch: 'anvil', gen: 'hit', when: 'every', every: 2, step: 14, v: 'h', p: 0.5, midi: 0, vel: 0.6 },
      { ch: 'hiss', gen: 'hit', when: 'every', every: 4, step: 8, v: 'open', p: 0.6, midi: 0 },
      { ch: 'spark', gen: 'sparkle', range: [84, 96], p: 0.03 },
    ],
  },

  // ---- Brassbay Skies: jaunty 6/8 sea shanty — accordion lead, oompah tuba, D major ---------
  brassbay: {
    tempo: 112, beats: 2, sub: 3, key: 'D', mode: 'major', floor: 0, gain: 1, warmth: 8000,
    ch: {
      lead: C('accordion', 'core', 0.6, { pan: 0.1, rev: 0.22, trem: [6, 0.12], opt: { bright: 1.1 } }),
      acc: C('accordion', 'core', 0.26, { pan: -0.2, trem: [6, 0.15] }),
      tuba: C('tuba', 'core', 0.45, { rev: 0.06 }),
      whistle: C('whistle', 'core', 0.5, { pan: 0.25, rev: 0.35, vib: [5.5, 12] }),
      bell: C('bell', 'core', 0.35, { pan: 0.3, rev: 0.45 }),
      kick: C('kick', 'drums', 0.4),
      snare: C('snare', 'drums', 0.45, { pan: -0.1 }),
      tamb: C('hat', 'drums', 0.4, { pan: 0.3, opt: { shaker: true } }),
      horn: C('brass', 'counter', 0.38, { pan: -0.3, rev: 0.3, opt: { bright: 0.6 } }),
      glock: C('glock', 'counter', 0.24, { pan: 0.35, rev: 0.3 }),
      brass: C('brass', 'full', 0.5, { pan: -0.15, rev: 0.25, vib: [5, 8], opt: { scoop: true } }),
    },
    sections: {
      I: { prog: 'I V' },
      A: {
        prog: 'I I V V I IV V I',
        mel: `1:1 3:1 5:1 1':2 7:1 | 6:2 5:1 3:2 1:1 | 7:2 6:1 5:2 2:1 | 5:2 4:1 3:2 2:1 |
          1:1 3:1 5:1 1':2 2':1 | 1':2 6:1 4:2 6:1 | 5:1 6:1 7:1 2':2 7:1 | 1':3 -:3`,
      },
      B: {
        lift: 2,
        prog: 'IV I IV V IV I V I',
        mel: `1':3 6:2 4:1 | 5:3 3:2 1:1 | 4:2 6:1 1':2 6:1 | 2':3 7:2 5:1 | 1':3 2':2 1':1 |
          7:1 6:1 5:1 3:3 | 2:1 3:1 4:1 5:2 7,:1 | 1:2 5:1 1':3`,
      },
      G: { prog: 'I IV vi V I IV V I', improv: { from: ['A', 'B'] } },
    },
    form: { intro: ['I'], loop: ['A', 'A', 'B', 'G', 'A', 'B'] },
    parts: [
      { ch: 'lead', gen: 'melody', reg: 62, tr: 12, only: ['A', 'B'] },
      { ch: 'whistle', gen: 'melody', reg: 62, tr: 12, only: ['G'], legato: 0.85, vel: 0.8 },
      { ch: 'lead', gen: 'counter', style: 'fill', lo: 64, hi: 81, only: ['G'], vel: 0.45 },
      { ch: 'tuba', gen: 'bass', reg: 40, pats: { lo: '1--5--', mid: ['1--5--', '1--8--'], hi: ['1--5-5', '1--5--'] }, turn: '1--5-a' },
      { ch: 'acc', gen: 'chords', n: 3, range: [57, 71], pats: '-oo-oo', strum: 0.04, legato: 0.7 },
      { ch: 'kick', gen: 'drum', pats: { lo: 'x--x--', hi: 'x--x-o' } },
      { ch: 'snare', gen: 'drum', pats: { lo: '---o--', mid: '---x--', hi: ['---x--', '---x-.'] }, fill: 'x.xR__', fill4: '---xox' },
      { ch: 'tamb', gen: 'drum', pats: { lo: '-o--o-', mid: 'xooxoo', hi: 'xoxxox' } },
      { ch: 'brass', gen: 'melody', reg: 62, only: ['B'], vel: 0.75 },
      { ch: 'brass', gen: 'chords', n: 3, range: [55, 67], pats: 'x-----', only: ['A', 'G'], vel: 0.55, legato: 0.5 },
      { ch: 'horn', gen: 'counter', style: 'line', lo: 55, hi: 67 },
      { ch: 'glock', gen: 'counter', style: 'fill', lo: 74, hi: 91, only: ['A', 'B'], vel: 0.5 },
      { ch: 'bell', gen: 'hit', when: 'start', reg: 74, p: 0.85, len: 6, vel: 0.7 },
      { ch: 'whistle', gen: 'hit', when: 'end', deg: 4, reg: 74, step: 3, len: 3, p: 0.5, only: ['B'], vel: 0.6 },
    ],
  },

  // ---- The Smog Wastes: industrial C minor — anvils, pistons, a grinding low-brass ostinato --
  smog: {
    tempo: 100, beats: 4, sub: 4, key: 'C', mode: 'minor', floor: 0, gain: 1, warmth: 6500,
    ch: {
      ost: C('brass', 'core', 0.42, { pan: -0.1, rev: 0.12, opt: { bright: 0.55, q: 3, atk: 0.012 } }),
      tuba: C('tuba', 'core', 0.32, { rev: 0.05 }),
      horn: C('brass', 'core', 0.65, { pan: 0.1, rev: 0.35, vib: [4.5, 10], opt: { bright: 0.95 } }),
      kick: C('kick', 'drums', 0.55, { opt: { tune: 0.85, decay: 0.3 } }),
      anvil: C('anvil', 'drums', 0.38, { pan: 0.25, rev: 0.3 }),
      hiss: C('hiss', 'drums', 0.34, { pan: -0.3 }),
      organ: C('organ', 'counter', 0.28, { rev: 0.45, opt: { soft: true, atk: 0.3, rel: 0.4 } }),
      str: C('strings', 'counter', 0.38, { pan: 0.3, rev: 0.4 }),
      hat: C('hat', 'full', 0.22, { pan: 0.2 }),
      tom: C('tom', 'full', 0.3, { rev: 0.2 }),
      clank: C('anvil', 'full', 0.2, { pan: -0.4, rev: 0.4, opt: { freq: 330, decay: 1.2 } }),
      whistle: C('whistle', 'calm', 0.35, { pan: -0.4, rev: 0.6, vib: [4, 15] }),
    },
    sections: {
      I: { prog: 'i i' },
      A: {
        prog: 'i i iv iv VI VII i V',
        mel: `5:8 4:4 3:4 | 2:4 3:4 1:8 | 1:6 3:2 4:8 | 6:8 5:4 4:4 | 3:8 1:4 3:4 | 4:6 2:2 7,:8 |
          5:4 6:4 5:4 3:4 | 2:6 4:2 #7,:8`,
      },
      B: {
        prog: 'VI VII i i VI VII iv V',
        mel: `1':8 7:4 6:4 | 2':8 1':4 7:4 | 3':12 2':2 1':2 | 5:16 | 1':6 3':2 1':8 | 2':6 4':2 2':8 |
          1':4 6:4 4:4 1:4 | #7,:8 2:4 5:4`,
      },
      G: { prog: 'i VI iv V i VI iv,V i', improv: { from: ['A', 'B'] } },
    },
    form: { intro: ['I'], loop: ['A', 'B', 'A', 'G'] },
    parts: [
      { ch: 'ost', gen: 'bass', reg: 48, pats: { lo: '1-18-15-1-b-8-5-', hi: ['1-18-15-1-b-8-5-', '1-18-15-1-b-858-'] }, legato: 0.6 },
      { ch: 'tuba', gen: 'bass', reg: 36, pats: { lo: '1_______1_______', mid: '1-------1---5---', hi: '1-----1-1---5-a-' } },
      { ch: 'horn', gen: 'melody', reg: 60, not: ['I'] },
      { ch: 'kick', gen: 'drum', pats: { lo: 'x-------x-------', mid: 'x---x---x---x---', hi: 'x---x---x-x-x---' } },
      { ch: 'anvil', gen: 'drum', pats: { lo: '----x-------x---', hi: ['----x-------x---', '----x-----h-x---'] }, fill: '----x-----x-x-hh' },
      { ch: 'hiss', gen: 'drum', pats: { lo: '--o---o---o---o-', hi: '--o-.-o---o-.-O-' } },
      { ch: 'hat', gen: 'drum', pats: '.-o-.-o-.-o-.-o-' },
      { ch: 'tom', gen: 'drum', pats: '--------------l-', fill: '----m-m-l-l-LLLL', fill4: '------------m-l-' },
      { ch: 'organ', gen: 'chords', n: 3, range: [48, 63], pats: 'X_______________', vel: 0.6 },
      { ch: 'str', gen: 'counter', style: 'line', lo: 63, hi: 75 },
      { ch: 'whistle', gen: 'hit', when: 'start', deg: 4, reg: 67, len: 12, p: 0.6, vel: 0.55, only: ['A', 'G'] },
      { ch: 'clank', gen: 'hit', when: 'every', every: 2, step: 6, v: 'l', p: 0.5, midi: 0, vel: 0.6 },
    ],
  },

  // ---- Tempest Reach: driving E minor storm — tremolo strings, timpani rolls, organ stabs ---
  tempest: {
    tempo: 138, beats: 4, sub: 4, key: 'E', mode: 'minor', floor: 0.1, gain: 1, warmth: 8500,
    ch: {
      brass: C('brass', 'core', 0.68, { pan: 0.05, rev: 0.3, vib: [5.5, 10], opt: { bright: 1.1 } }),
      trem: C('strings', 'core', 0.38, { pan: -0.25, rev: 0.35, trem: [11.5, 0.75], opt: { atk: 0.08 } }),
      bass: C('tuba', 'core', 0.38, { rev: 0.05 }),
      timp: C('timpani', 'core', 0.42, { rev: 0.3 }),
      kick: C('kick', 'drums', 0.45),
      snare: C('snare', 'drums', 0.36, { rev: 0.22 }),
      hat: C('hat', 'drums', 0.26, { pan: 0.25 }),
      organ: C('organ', 'counter', 0.34, { pan: 0.15, rev: 0.45 }),
      hi: C('strings', 'full', 0.3, { pan: 0.3, rev: 0.4, vib: [5.5, 10] }),
      crash: C('crash', 'full', 0.4, { pan: -0.2, rev: 0.3 }),
    },
    sections: {
      I: { prog: 'i i' },
      A: {
        prog: 'i VI III VII i VI iv V',
        mel: `1:6 2:2 3:4 5:4 | 6:12 5:2 3:2 | 5:6 3:2 7,:4 3:4 | 4:8 2:4 7,:4 | 1':6 7:2 6:4 5:4 |
          6:6 5:2 3:4 1:4 | 4:4 6:4 1':4 6:4 | 5:8 #7,:4 2:4`,
      },
      B: {
        prog: 'iv i VI V iv i VI V',
        mel: `4:4 1':8 7:4 | 5:4 1':8 2':4 | 3':8 2':4 1':4 | #7:8 2':8 | 1':4 3':4 4':8 | 3':4 2':4 1':8 |
          6:4 1':4 3':4 1':4 | 2':8 #7:4 5:4`,
      },
      G: { prog: 'i VI VII i iv VI V V', improv: { from: ['A', 'B'] }, energy: 0.1 },
      D: { prog: 'VI VII i i', energy: -0.45 },
    },
    form: { intro: ['I'], loop: ['A', 'B', 'A', 'G', 'D', 'B'] },
    parts: [
      { ch: 'brass', gen: 'melody', reg: 64, not: ['I', 'D'] },
      { ch: 'hi', gen: 'melody', reg: 64, tr: 12, not: ['I', 'D'], vel: 0.7 },
      { ch: 'trem', gen: 'chords', n: 3, range: [52, 67], pats: 'X_______________' },
      { ch: 'bass', gen: 'bass', reg: 40, pats: { lo: '1-------1-------', mid: '1-1-1-1-1-1-1-1-', hi: ['1-1-8-1-1-1-8-5-', '1-118-1-1-118-a-'] }, legato: 0.6, not: ['I'] },
      { ch: 'timp', gen: 'drum', tuned: true, reg: 40, pats: { lo: 'x---------------', hi: 'x-------v-------' }, fill: 'x-------R_______', fillMin: 0 },
      { ch: 'kick', gen: 'drum', pats: { lo: 'x-------x-------', mid: 'x-----x-x-------', hi: 'x--x--x-x--x--x-' }, not: ['I', 'D'] },
      { ch: 'snare', gen: 'drum', pats: { lo: '----x-------x---', hi: ['----x-------x---', '----x-------x--o'] }, fill: 'x-x-x-x-xxxxR___', fill4: '------------x-xx', not: ['I', 'D'] },
      { ch: 'hat', gen: 'drum', pats: { lo: 'x-o-x-o-x-o-x-o-', hi: 'x.o.x.o.x.o.x.oo' }, not: ['I', 'D'] },
      { ch: 'organ', gen: 'chords', n: 4, range: [55, 72], pats: ['x--x--x---x--x--', 'x--x--x---x-x-x-'], vel: 0.75, legato: 0.5, not: ['I', 'D'] },
      { ch: 'crash', gen: 'hit', when: 'start', midi: 0, len: 4, p: 0.9, not: ['I', 'D'] },
    ],
  },

  // ---- The Aurora Drift: dreamy A minor 3/4 — glockenspiel & music-box arpeggios, pads -----
  aurora: {
    tempo: 84, beats: 3, sub: 4, key: 'A', mode: 'minor', floor: 0.05, gain: 1.25, warmth: 7500,
    echo: { beats: 0.75, fb: 0.42, tone: 3500 },
    ch: {
      flute: C('flute', 'core', 0.55, { pan: 0.05, rev: 0.5, echo: 0.25, vib: [4.8, 14] }),
      arp: C('musicbox', 'core', 0.32, { pan: -0.3, rev: 0.45, echo: 0.3 }),
      pad: C('strings', 'core', 0.3, { pan: 0.2, rev: 0.6, opt: { atk: 0.9, rel: 1.2, bright: 0.6 } }),
      bass: C('organ', 'core', 0.3, { rev: 0.3, opt: { soft: true, atk: 0.2, rel: 0.6 } }),
      kick: C('kick', 'drums', 0.3, { opt: { decay: 0.5 } }),
      shaker: C('hat', 'drums', 0.26, { pan: 0.35, opt: { shaker: true } }),
      timp: C('timpani', 'drums', 0.24, { rev: 0.4 }),
      glock: C('glock', 'counter', 0.25, { pan: 0.3, rev: 0.45, echo: 0.3 }),
      str: C('strings', 'counter', 0.34, { pan: -0.35, rev: 0.5, vib: [5, 8], opt: { atk: 0.25 } }),
      arp2: C('musicbox', 'full', 0.22, { pan: 0.4, rev: 0.45, echo: 0.3 }),
      spark: C('glock', 'calm', 0.15, { pan: 0.5, rev: 0.6, echo: 0.5 }),
    },
    sections: {
      I: { prog: 'i VI' },
      A: {
        prog: 'i VI III VII iv i VImaj7 V',
        mel: `5:8 3:4 | 6:6 5:2 3:4 | 5:4 7:4 1':4 | 2':8 7:4 | 1':6 6:2 4:4 | 5:6 3:2 1:4 | 3:4 5:4 1':4 |
          2:6 #7,:6`,
      },
      B: {
        prog: 'VI VII i i VI VII V V',
        mel: `1':4 3':4 1':4 | 2':4 4':4 2':4 | 3':8 2':2 1':2 | 5:12 | 6:4 1':4 3':4 | 7:4 2':4 4':4 |
          #7:4 2':4 5':4 | 5':6 4':2 2':4`,
      },
      G: { prog: 'iv i VI III iv i ii° V', improv: { from: ['A'] }, energy: -0.1 },
    },
    form: { intro: ['I'], loop: ['A', 'B', 'A', 'G'] },
    parts: [
      { ch: 'flute', gen: 'melody', reg: 69, not: ['I'], legato: 0.97 },
      { ch: 'arp', gen: 'arp', n: 3, range: [69, 84], pats: { lo: '0-1-2-1-2-1-', mid: '012102101210', hi: '012321012321' } },
      { ch: 'pad', gen: 'chords', n: 4, range: [52, 67], pats: 'x___________' },
      { ch: 'bass', gen: 'bass', reg: 45, pats: { lo: '1___________', hi: '1_______5___' } },
      { ch: 'kick', gen: 'drum', pats: { lo: 'x-----------', hi: 'x-------x---' }, not: ['I'] },
      { ch: 'shaker', gen: 'drum', pats: { lo: '--o---o---o-', hi: '.-o-.-o-.-o.' }, not: ['I'] },
      { ch: 'timp', gen: 'drum', tuned: true, reg: 45, pats: { lo: '------------', hi: 'x-----------' }, fill: '------R_____' },
      { ch: 'glock', gen: 'melody', reg: 69, tr: 12, only: ['B'] },
      { ch: 'glock', gen: 'counter', style: 'fill', lo: 81, hi: 96, rate: 2, only: ['A', 'G'], vel: 0.5 },
      { ch: 'str', gen: 'counter', style: 'line', lo: 57, hi: 69 },
      { ch: 'arp2', gen: 'arp', n: 3, range: [81, 96], pats: '--2-1-0-1-2-' },
      { ch: 'spark', gen: 'sparkle', range: [88, 100], p: 0.05, res: 2 },
    ],
  },

  // ---- The Furnace Crown: heavy F minor — organ & brass, war drums, Neapolitan menace -------
  furnace: {
    tempo: 126, beats: 4, sub: 4, key: 'F', mode: 'minor', floor: 0.15, gain: 1, warmth: 6500,
    ch: {
      brass: C('brass', 'core', 0.62, { rev: 0.28, vib: [5, 9], opt: { bright: 1.15 } }),
      organ: C('organ', 'core', 0.3, { pan: -0.15, rev: 0.45 }),
      tuba: C('tuba', 'core', 0.38),
      pedal: C('organ', 'core', 0.3, { rev: 0.3, opt: { soft: true } }),
      war: C('tom', 'drums', 0.4, { rev: 0.25 }),
      kick: C('kick', 'drums', 0.5),
      snare: C('snare', 'drums', 0.32, { rev: 0.2 }),
      harm: C('brass', 'counter', 0.32, { pan: 0.25, rev: 0.3 }),
      anvil: C('anvil', 'counter', 0.32, { pan: 0.3, rev: 0.35 }),
      stab: C('organ', 'counter', 0.32, { pan: 0.2, rev: 0.35 }),
      timp: C('timpani', 'counter', 0.35, { rev: 0.3 }),
      hi: C('brass', 'full', 0.3, { pan: -0.25, rev: 0.3 }),
      crash: C('crash', 'full', 0.35),
      hiss: C('hiss', 'full', 0.2, { pan: 0.4, opt: { freq: 1400 } }),
    },
    sections: {
      I: { prog: 'i i' },
      A: {
        prog: 'i i VI VII i i bII V',
        mel: `1:12 2:2 3:2 | 5:12 4:2 3:2 | 3:8 1:4 6,:4 | 4:8 2:4 7,:4 | 1:4 3:4 5:8 | 1':8 7:4 6:4 |
          b2':8 6:4 4:4 | 5:8 #7,:8`,
      },
      B: {
        prog: 'iv iv i i VI VII V V',
        mel: `4:4 6:4 1':8 | 6:8 4:4 1:4 | 5:4 1':4 3':8 | 2':4 1':4 5:8 | 3':8 1':4 6:4 | 4':8 2':4 7:4 |
          #7:4 2':4 5':8 | 5':6 4':2 #7:8`,
      },
      G: { prog: 'i VI bII V i VI VII V', improv: { from: ['A', 'B'] } },
    },
    form: { intro: ['I'], loop: ['A', 'B', 'G', 'A', 'B'] },
    parts: [
      { ch: 'brass', gen: 'melody', reg: 65, not: ['I'] },
      { ch: 'hi', gen: 'melody', reg: 65, tr: 12, not: ['I'], vel: 0.6 },
      { ch: 'harm', gen: 'counter', style: 'harmony', reg: 65, not: ['I'] },
      { ch: 'organ', gen: 'chords', n: 4, range: [53, 70], pats: { lo: 'X_______________', hi: 'X_______x_______' } },
      { ch: 'tuba', gen: 'bass', reg: 41, pats: { lo: '1-------1-------', mid: '1-1-1-1-1-1-8-5-', hi: '1-11-11-1-11-8-5' }, legato: 0.7 },
      { ch: 'pedal', gen: 'bass', reg: 29, pats: '1_______________' },
      { ch: 'war', gen: 'drum', pats: { lo: 'L-------L-------', mid: 'L--m--L-L-m-h-m-', hi: ['L--m--L-L-m-h-m-', 'L-mmL-m-L-h-hHmm'] }, fill: 'L-m-h-L-m-h-HHHH' },
      { ch: 'kick', gen: 'drum', pats: { lo: 'x-------x-------', hi: 'x-x-----x-x-----' }, not: ['I'] },
      { ch: 'snare', gen: 'drum', pats: { lo: '----x-------x---', hi: '----x-------x-.x' }, fill: '----x-x-xxxxR___', not: ['I'] },
      { ch: 'anvil', gen: 'drum', pats: { lo: '--------------x-', hi: '------x-------x-' }, not: ['I'] },
      { ch: 'stab', gen: 'chords', n: 4, range: [60, 76], pats: 'x--x--x-----x---', legato: 0.4, not: ['I'] },
      { ch: 'timp', gen: 'drum', tuned: true, reg: 41, pats: 'x-------x-------', fill: '--------R_______', fillMin: 0 },
      { ch: 'crash', gen: 'hit', when: 'start', midi: 0, len: 4, not: ['I'] },
      { ch: 'hiss', gen: 'drum', pats: '--------O-------' },
    ],
  },

  // ---- Boss: 150 bpm G minor — galloping bass, brass stabs, snare rolls ---------------------
  boss: {
    tempo: 150, beats: 4, sub: 4, key: 'G', mode: 'minor', floor: 0.5, gain: 1, warmth: 9000,
    ch: {
      brass: C('brass', 'core', 0.55, { rev: 0.22, vib: [6, 8], opt: { bright: 1.25, scoop: true } }),
      bass: C('tuba', 'core', 0.4, { rev: 0.04 }),
      timp: C('timpani', 'core', 0.4, { rev: 0.3 }),
      kick: C('kick', 'drums', 0.45),
      snare: C('snare', 'drums', 0.38, { rev: 0.2 }),
      hat: C('hat', 'drums', 0.26, { pan: 0.25 }),
      lowb: C('brass', 'counter', 0.3, { pan: -0.15, rev: 0.1, opt: { bright: 0.5, q: 3, atk: 0.01 } }),
      stab: C('brass', 'counter', 0.42, { pan: 0.25, rev: 0.25, opt: { bright: 1.2 } }),
      str: C('strings', 'counter', 0.36, { pan: -0.3, rev: 0.3, trem: [12, 0.7] }),
      crash: C('crash', 'full', 0.4, { pan: 0.2 }),
      anvil: C('anvil', 'full', 0.3, { pan: -0.3, rev: 0.3 }),
      tom: C('tom', 'full', 0.45, { rev: 0.2 }),
    },
    sections: {
      I: { prog: 'V' },
      A: {
        prog: 'i i VI V i i bII V',
        mel: `1:3 1:3 1:2 3:4 2:4 | 1:3 5,:3 1:2 -:8 | 6:3 6:3 6:2 1':4 7:4 | 5:6 4:2 2:4 #7,:4 |
          1:3 1:3 1:2 3:4 4:4 | 5:3 4:3 3:2 2:4 1:4 | b2':6 1':2 6:8 | 5:4 #7,:4 2:4 5:4`,
      },
      B: {
        prog: 'iv iv i i VI VI V V',
        mel: `4:4 6:4 1':4 6:4 | 4':6 3':2 1':8 | 5:4 1':4 3':4 2':4 | 1':12 -:4 | 6:4 1':4 3':4 1':4 |
          3':6 2':2 1':8 | #7:4 2':4 5':8 | 5':4 4':4 #7:4 2':4`,
      },
      G: { prog: 'i bII i V i VI bII V', improv: { from: ['A', 'B'] }, energy: 0.1 },
    },
    form: { intro: ['I'], loop: ['A', 'B', 'A', 'G'] },
    parts: [
      { ch: 'brass', gen: 'melody', reg: 67, not: ['I'] },
      { ch: 'bass', gen: 'bass', reg: 43, pats: { lo: '1-1-1-1-1-1-1-1-', mid: '1-11-11-1-11-11-', hi: ['1-11-11-1-11-8-a', '1-118-1-1-118-1a'] }, legato: 0.7 },
      { ch: 'lowb', gen: 'bass', reg: 55, pats: { lo: '1-------1-------', hi: '1--1--1-1--1--1-' }, legato: 0.5, not: ['I'] },
      { ch: 'timp', gen: 'drum', tuned: true, reg: 43, pats: { lo: 'x-------x-------', hi: 'x-----v-x-------' }, fill: 'x-------R_______', fillMin: 0 },
      { ch: 'kick', gen: 'drum', pats: { lo: 'x---x---x---x---', mid: 'x-x-x---x-x-x---', hi: 'x-xxx-x-x-xxx-x-' } },
      { ch: 'snare', gen: 'drum', pats: { lo: '----x-------x---', hi: ['----x-------x---', '----x--.----x-.x'] }, fill: 'x-x-x-x-R_______', fill4: '------------R___', fillMin: 0 },
      { ch: 'hat', gen: 'drum', pats: { lo: 'x-x-x-x-x-x-x-x-', hi: 'xoxoxoxoxoxoxoxo' } },
      { ch: 'stab', gen: 'chords', n: 3, range: [58, 72], pats: ['--x--x----x--x--', 'x--x--x---x--x-x'], legato: 0.35, vel: 0.8, not: ['I'] },
      { ch: 'str', gen: 'chords', n: 3, range: [62, 77], pats: 'X_______________' },
      { ch: 'crash', gen: 'hit', when: 'phrase', midi: 0, len: 4, not: ['I'] },
      { ch: 'anvil', gen: 'drum', pats: '----------x-----', not: ['I'] },
      { ch: 'tom', gen: 'drum', pats: '----------------', fill4: '--------h-h-m-l-', fill: 'h-h-m-m-l-l-LLLL' },
    ],
  },

  // ---- Final boss: 160 bpm D minor — toccata organ, full band, bells & timpani -------------
  finalBoss: {
    tempo: 160, beats: 4, sub: 4, key: 'D', mode: 'minor', floor: 0.6, gain: 1, warmth: 9000,
    ch: {
      organ: C('organ', 'core', 0.6, { pan: -0.1, rev: 0.45 }),
      brass: C('brass', 'core', 0.65, { pan: 0.1, rev: 0.3, vib: [5.5, 9], opt: { bright: 1.2 } }),
      pedal: C('organ', 'core', 0.36, { rev: 0.35 }),
      tuba: C('tuba', 'core', 0.32),
      timp: C('timpani', 'core', 0.4, { rev: 0.35 }),
      kick: C('kick', 'drums', 0.45),
      snare: C('snare', 'drums', 0.38, { rev: 0.2 }),
      hat: C('hat', 'drums', 0.24, { pan: 0.25 }),
      choir: C('organ', 'counter', 0.3, { rev: 0.6, opt: { soft: true, atk: 0.15 } }),
      stab: C('brass', 'counter', 0.4, { pan: -0.25, rev: 0.25 }),
      bell: C('bell', 'full', 0.4, { pan: 0.25, rev: 0.5 }),
      crash: C('crash', 'full', 0.4),
      anvil: C('anvil', 'full', 0.3, { pan: 0.35 }),
      str: C('strings', 'full', 0.32, { pan: 0.3, rev: 0.35, trem: [12, 0.7] }),
    },
    sections: {
      I: { prog: 'i V' },
      A: {
        prog: 'i VI iv V i VII VI V',
        mel: `1:4 5:4 1':8 | 3':4 2':4 1':8 | 6:4 1':4 4':8 | 2':8 #7:4 5:4 | 1':4 3':4 5':8 | 4':8 2':4 7:4 |
          3':4 2':4 1':4 6:4 | 5:4 #7:4 2':8`,
      },
      B: {
        lift: 2,
        prog: 'iv V i VI iv V bII V',
        mel: `4':8 3':4 1':4 | #7:8 5:8 | 1':4 3':4 5':4 3':4 | 3':8 1':4 6:4 | 6:4 1':4 4':8 | #7:4 2':4 5':8 |
          b2':8 6:8 | #7:8 5:4 #7:4`,
      },
      G: { prog: 'i VI bII V i iv V V', improv: { from: ['A', 'B'] }, energy: 0.1 },
    },
    form: { intro: ['I'], loop: ['A', 'B', 'A', 'G', 'B'] },
    parts: [
      { ch: 'organ', gen: 'arp', n: 4, range: [57, 74], pats: { lo: '0123432101234321', hi: ['0123432101234321', '0212031204130212'] } },
      { ch: 'brass', gen: 'melody', reg: 62, not: ['I'] },
      { ch: 'pedal', gen: 'bass', reg: 38, pats: { lo: '1_______1_______', hi: '1___8___1___5___' } },
      { ch: 'tuba', gen: 'bass', reg: 38, pats: { lo: '1-1-1-1-1-1-1-1-', hi: '1-11-11-1-11-8-a' }, legato: 0.6, not: ['I'] },
      { ch: 'timp', gen: 'drum', tuned: true, reg: 38, pats: 'x-------v-------', fill: 'x-------R_______', fillMin: 0 },
      { ch: 'kick', gen: 'drum', pats: { lo: 'x---x---x---x---', hi: 'x-xxx-x-x-xxx-xx' }, not: ['I'] },
      { ch: 'snare', gen: 'drum', pats: { lo: '----x-------x---', hi: '----x--.----x-xx' }, fill: 'x-x-x-x-R_______', fill4: '------------R___', not: ['I'] },
      { ch: 'hat', gen: 'drum', pats: 'x-o-x-o-x-o-x-o-', not: ['I'] },
      { ch: 'choir', gen: 'chords', n: 4, range: [62, 79], pats: 'X_______________', not: ['I'] },
      { ch: 'stab', gen: 'chords', n: 3, range: [55, 67], pats: 'x--x--x---x-x---', legato: 0.35, not: ['I'] },
      { ch: 'bell', gen: 'hit', when: 'phrase', reg: 74, len: 8 },
      { ch: 'crash', gen: 'hit', when: 'phrase', midi: 0, len: 4, not: ['I'] },
      { ch: 'str', gen: 'melody', reg: 62, tr: 12, not: ['I'], vel: 0.6 },
      { ch: 'anvil', gen: 'drum', pats: '--------------x-', not: ['I'] },
    ],
  },

  // ---- Victory: fanfare stinger → triumphant Bb-major march ---------------------------------
  victory: {
    tempo: 116, beats: 4, sub: 4, key: 'Bb', mode: 'major', floor: 0.7, gain: 1, warmth: 9000,
    stinger: true,
    ch: {
      brass: C('brass', 'core', 0.55, { rev: 0.3, vib: [5.5, 9], opt: { bright: 1.2, scoop: true } }),
      brass2: C('brass', 'core', 0.38, { pan: -0.25, rev: 0.3 }),
      tuba: C('tuba', 'core', 0.38),
      acc: C('accordion', 'core', 0.22, { pan: 0.25, trem: [6, 0.15] }),
      timp: C('timpani', 'core', 0.5, { rev: 0.35 }),
      crash: C('crash', 'core', 0.4, { pan: 0.15 }),
      bell: C('bell', 'core', 0.35, { pan: 0.3, rev: 0.5 }),
      whistle: C('whistle', 'core', 0.4, { pan: -0.3, rev: 0.4, vib: [5.5, 12] }),
      kick: C('kick', 'drums', 0.45),
      snare: C('snare', 'drums', 0.34),
      glock: C('glock', 'counter', 0.28, { pan: 0.35, rev: 0.35 }),
      str: C('strings', 'counter', 0.32, { pan: -0.3, rev: 0.4 }),
    },
    sections: {
      S: { prog: 'I IV,V I', mel: `5:2 5:1 5:1 5:3 3:1 5:8 | 6:4 1':4 7:4 2':4 | 1':16`, energy: 0.3 },
      A: {
        prog: 'I IV I V I IV V I',
        mel: `1:4 3:4 5:6 3:2 | 4:4 6:4 1':8 | 5:4 1':4 3':6 2':2 | 2':8 7:4 5:4 | 1:4 3:4 5:6 3:2 |
          4:4 6:4 4':8 | 2':4 7:4 5:4 7:4 | 1':12 -:4`,
      },
      B: {
        lift: 1,
        prog: 'vi iii IV I vi ii V V',
        mel: `3':8 1':4 6:4 | 7:8 5:4 3:4 | 1':4 6:4 4:8 | 5:8 3:4 1:4 | 6:4 1':4 3':8 | 6:4 4:4 2:8 |
          5:4 7:4 2':8 | 2':4 1':4 7:4 2':4`,
      },
      G: { prog: 'I vi IV V I IV V I', improv: { from: ['A', 'B'] } },
    },
    form: { intro: ['S'], loop: ['A', 'B', 'A', 'G'] },
    parts: [
      { ch: 'brass', gen: 'melody', reg: 70 },
      { ch: 'brass2', gen: 'counter', style: 'harmony', reg: 70 },
      { ch: 'tuba', gen: 'bass', reg: 46, pats: '1_______1_______', only: ['S'] },
      { ch: 'tuba', gen: 'bass', reg: 46, pats: '1---5---1---5---', turn: '1---5---1-3-5-a-', not: ['S'] },
      { ch: 'acc', gen: 'chords', n: 3, range: [58, 72], pats: '--x---x---x---x-', legato: 0.5, not: ['S'] },
      { ch: 'timp', gen: 'drum', tuned: true, reg: 46, pats: 'x---------------|R_______________|X---------------', only: ['S'] },
      { ch: 'timp', gen: 'drum', tuned: true, reg: 46, pats: 'x-------v-------', not: ['S'] },
      { ch: 'crash', gen: 'hit', when: 'start', midi: 0, len: 8 },
      { ch: 'crash', gen: 'hit', when: 'end', midi: 0, len: 8, only: ['S'] },
      { ch: 'bell', gen: 'hit', when: 'end', reg: 70, only: ['S'], vel: 0.8 },
      { ch: 'kick', gen: 'drum', pats: 'x-------x-------', not: ['S'] },
      { ch: 'snare', gen: 'drum', pats: { lo: '----x-------x---', hi: 'x--.x-.-x--.x-..' }, fill: 'x-x-x-x-xxxxR___', not: ['S'] },
      { ch: 'glock', gen: 'melody', reg: 70, tr: 12, only: ['A'] },
      { ch: 'glock', gen: 'counter', style: 'fill', lo: 82, hi: 96, only: ['B', 'G'], vel: 0.5 },
      { ch: 'str', gen: 'counter', style: 'line', lo: 62, hi: 74, not: ['S'] },
      { ch: 'whistle', gen: 'hit', when: 'start', deg: 2, reg: 77, len: 6, only: ['B'], p: 0.7, vel: 0.6 },
    ],
  },

  // ---- Game over: a falling brass sigh → the title waltz, slowed to a lone music box -------
  gameover: {
    tempo: 58, beats: 3, sub: 2, key: 'D', mode: 'minor', floor: 0, gain: 1, warmth: 5000,
    stinger: true, echo: { beats: 1, fb: 0.35, tone: 2500 },
    ch: {
      brass: C('brass', 'core', 0.42, { rev: 0.4, vib: [4.5, 10], opt: { bright: 0.6, atk: 0.08 } }),
      timp: C('timpani', 'core', 0.45, { rev: 0.4 }),
      organ: C('organ', 'core', 0.26, { rev: 0.5, opt: { soft: true, atk: 0.3, rel: 1 } }),
      box: C('musicbox', 'core', 0.55, { pan: 0.1, rev: 0.5, echo: 0.35, opt: { decay: 1.3 } }),
      bass: C('organ', 'core', 0.3, { opt: { soft: true, atk: 0.2, rel: 0.8 } }),
      str: C('strings', 'counter', 0.3, { pan: -0.25, rev: 0.5, opt: { atk: 0.5, rel: 1 } }),
      spark: C('musicbox', 'calm', 0.12, { pan: -0.4, rev: 0.6, echo: 0.5 }),
    },
    sections: {
      S: { tempo: 66, prog: 'VI iv,V i', mel: `3':3 2':3 | 1':3 #7:3 | 1':6`, vary: 0 },
      A: { prog: 'i iv VII III VI ii° V i', mel: TITLE_A, vary: 0.3 },
      G: { prog: 'i VI iv V i VI iv V', improv: { from: ['A'] } },
    },
    form: { intro: ['S'], loop: ['A', 'G'] },
    parts: [
      { ch: 'brass', gen: 'melody', reg: 50, only: ['S'], legato: 1 },
      { ch: 'brass', gen: 'counter', style: 'harmony', reg: 50, only: ['S'], vel: 0.6 },
      { ch: 'timp', gen: 'drum', tuned: true, reg: 38, pats: 'x-----|R_____|X-----', only: ['S'] },
      { ch: 'organ', gen: 'chords', n: 4, range: [50, 65], pats: 'x_____' },
      { ch: 'box', gen: 'melody', reg: 62, tr: 12, not: ['S'] },
      { ch: 'bass', gen: 'bass', reg: 38, pats: '1_____', not: ['S'] },
      { ch: 'str', gen: 'counter', style: 'line', lo: 57, hi: 69, not: ['S'] },
      { ch: 'spark', gen: 'sparkle', range: [86, 98], p: 0.04, not: ['S'] },
    ],
  },
};

/** Track names in a stable order (the §4.17 list). */
export const TRACK_NAMES = Object.keys(TRACKS);
