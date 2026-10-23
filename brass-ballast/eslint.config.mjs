// Lint config for the game (ESLint 9+/flat). Catches undefined identifiers & import slips
// across work packages. Run: npx eslint brass-ballast/js  (from repo root) or `eslint js`.
const browser = Object.fromEntries(
  [
    'window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'console',
    'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout',
    'setInterval', 'clearInterval', 'queueMicrotask', 'structuredClone', 'fetch', 'URL',
    'URLSearchParams', 'Image', 'ImageData', 'Path2D', 'DOMMatrix', 'OffscreenCanvas',
    'HTMLCanvasElement', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent', 'KeyboardEvent',
    'PointerEvent', 'MouseEvent', 'TouchEvent', 'AudioContext', 'OfflineAudioContext',
    'webkitAudioContext', 'AudioBuffer', 'AudioNode', 'GainNode', 'OscillatorNode',
    'BiquadFilterNode', 'DynamicsCompressorNode', 'StereoPannerNode', 'ConvolverNode',
    'WaveShaperNode', 'AudioBufferSourceNode', 'PeriodicWave', 'Blob', 'FileReader',
    'matchMedia', 'getComputedStyle', 'ResizeObserver', 'MutationObserver', 'IntersectionObserver',
    'caches', 'self', 'clients', 'importScripts', 'registration', 'globalThis', 'screen',
    'devicePixelRatio', 'innerWidth', 'innerHeight', 'alert', 'confirm', 'prompt', 'btoa', 'atob',
    'TextEncoder', 'TextDecoder', 'crypto', 'AbortController', 'Response', 'Request', 'Headers',
    'visualViewport', 'Gamepad', 'GamepadHapticActuator', 'DOMParser', 'XMLSerializer',
    'createImageBitmap', 'ImageBitmap', 'CanvasRenderingContext2D', 'CanvasGradient', 'Option',
  ].map((g) => [g, 'readonly'])
);

export default [
  {
    files: ['js/**/*.js', 'sw.js', 'precache-manifest.js', 'tests/preview/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: browser },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-const-assign': 'error',
      'no-redeclare': 'error',
      'no-self-assign': 'error',
      'no-import-assign': 'error',
      'getter-return': 'error',
      'no-func-assign': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      'no-var': 'error',
      'prefer-const': 'warn',
      eqeqeq: ['warn', 'always', { null: 'ignore' }],
    },
  },
  {
    files: ['sw.js', 'precache-manifest.js'],
    languageOptions: { sourceType: 'script' },
  },
];
