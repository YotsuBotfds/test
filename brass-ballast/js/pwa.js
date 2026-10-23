// Service worker registration, install prompt and update flow (DESIGN §9).
//
// Everything here is best-effort: a browser without service workers, a private window or a
// file:// load must never break the game, so every path is guarded and nothing throws.

import { events } from './core/events.js';

const UPDATE_CHECK_MS = 30 * 60 * 1000;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** The `beforeinstallprompt` event, kept until the player is asked. */
let deferredInstall = null;
/** @type {ServiceWorkerRegistration | null} */
let registration = null;
let started = false;
let applyingUpdate = false;

/**
 * Live PWA state. UI code reads `canInstall` / `updateReady` and calls the two methods;
 * changes are announced on the shared bus as `pwa:installable` and `pwa:update`.
 */
export const pwa = {
  /** True when the browser has offered an install prompt that has not been used yet. */
  canInstall: false,
  /** True when a new service worker is installed and waiting to take over. */
  updateReady: false,
  /** Show the native install prompt. Resolves true when the player accepted. */
  promptInstall,
  /** Let the waiting service worker take over and reload the page once. */
  applyUpdate,
};

/**
 * Wire up install and update handling. Safe to call more than once.
 * Registration is skipped on localhost (dev server, avoids stale caches) unless `?sw=1`,
 * and always skipped with `?nosw=1`.
 */
export function initPWA() {
  if (started) return;
  started = true;
  try {
    hookInstallPrompt();
    if (!('serviceWorker' in navigator)) return;

    const params = new URLSearchParams(location.search);
    if (params.get('nosw') === '1') return;
    if (LOCAL_HOSTS.has(location.hostname) && params.get('sw') !== '1') return;

    // Only one reload per applied update; clients.claim() on first install also fires
    // controllerchange and must not reload a page that has never been controlled.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!applyingUpdate) return;
      applyingUpdate = false;
      location.reload();
    });

    navigator.serviceWorker
      .register('sw.js', { scope: './' })
      .then((reg) => {
        registration = reg;
        watchForUpdates(reg);
        setInterval(() => {
          if (document.visibilityState !== 'visible') return;
          reg.update().catch(() => {});
        }, UPDATE_CHECK_MS);
      })
      .catch((err) => console.warn('[pwa] service worker registration failed', err));
  } catch (err) {
    console.warn('[pwa] init failed', err);
  }
}

function hookInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Hold the prompt so the game can offer install from its own menu at a good moment.
    e.preventDefault();
    deferredInstall = e;
    pwa.canInstall = true;
    events.emit('pwa:installable', {});
  });
  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    pwa.canInstall = false;
  });
}

/** @param {ServiceWorkerRegistration} reg */
function watchForUpdates(reg) {
  // A worker already waiting from a previous visit.
  if (reg.waiting && navigator.serviceWorker.controller) markUpdateReady();

  reg.addEventListener('updatefound', () => {
    const next = reg.installing;
    if (!next) return;
    next.addEventListener('statechange', () => {
      // 'installed' with an existing controller means an update, not the first install.
      if (next.state === 'installed' && navigator.serviceWorker.controller) {
        markUpdateReady();
      }
    });
  });
}

function markUpdateReady() {
  if (pwa.updateReady) return;
  pwa.updateReady = true;
  events.emit('pwa:update', {});
}

/** @returns {Promise<boolean>} true when the player accepted the install. */
async function promptInstall() {
  const ev = deferredInstall;
  if (!ev) return false;
  // A beforeinstallprompt event can only be used once.
  deferredInstall = null;
  pwa.canInstall = false;
  try {
    await ev.prompt();
    const choice = await ev.userChoice;
    return choice?.outcome === 'accepted';
  } catch (err) {
    console.warn('[pwa] install prompt failed', err);
    return false;
  }
}

/**
 * Activate the waiting service worker. The page reloads once it takes control.
 * @returns {boolean} false when there was nothing to apply.
 */
function applyUpdate() {
  try {
    const waiting = registration?.waiting;
    if (!waiting) return false;
    applyingUpdate = true;
    waiting.postMessage({ type: 'SKIP_WAITING' });
    return true;
  } catch (err) {
    console.warn('[pwa] applyUpdate failed', err);
    return false;
  }
}
