/**
 * PWA Enhanced Features Module
 * Handles install prompts, update notifications, and app lifecycle
 */

const DISMISS_BANNER_KEY = 'pwa-install-banner-dismissed';
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
const SW_UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

let deferredPrompt = null;
let updateAvailable = false;

/**
 * Initialize PWA features
 */
export function init() {
  handleBeforeInstallPrompt();
  handleServiceWorkerUpdates();
  handleAppInstalled();
}

/**
 * Handle beforeinstallprompt event for custom install banner
 */
function handleBeforeInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent default install prompt
    e.preventDefault();

    // Store the event for later use
    deferredPrompt = e;

    // Show custom install banner if not dismissed
    showInstallBanner();
  });
}

/**
 * Show custom install banner
 */
function showInstallBanner() {
  // Check if banner was recently dismissed
  const dismissedAt = localStorage.getItem(DISMISS_BANNER_KEY);
  if (dismissedAt) {
    const timeSinceDismiss = Date.now() - parseInt(dismissedAt, 10);
    if (timeSinceDismiss < DISMISS_DURATION) {
      return; // Still within dismiss period
    }
  }

  // Create banner element
  const banner = document.createElement('div');
  banner.className = 'pwa-install-banner';
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', 'Install app banner');

  banner.innerHTML = `
    <div class="pwa-banner-content">
      <div class="pwa-banner-icon">
        <img src="assets/icon-192.png" alt="App icon" width="48" height="48" />
      </div>
      <div class="pwa-banner-info">
        <h3 class="pwa-banner-title">Install Survival Compendium</h3>
        <p class="pwa-banner-description">Quick access to 220+ offline survival guides without opening your browser</p>
      </div>
      <div class="pwa-banner-actions">
        <button class="pwa-install-btn" aria-label="Install app">Install</button>
        <button class="pwa-dismiss-btn" aria-label="Dismiss install prompt">Dismiss</button>
      </div>
    </div>
  `;

  // Insert before the top-bar so it doesn't overlap sticky header content
  const topBar = document.querySelector('.top-bar');
  if (topBar) {
    topBar.parentNode.insertBefore(banner, topBar);
  } else {
    document.body.prepend(banner);
  }

  // Trigger animation
  requestAnimationFrame(() => {
    banner.classList.add('visible');
  });

  // Handle install button
  banner.querySelector('.pwa-install-btn').addEventListener('click', async () => {
    if (!deferredPrompt) return;

    // Show the native install prompt
    deferredPrompt.prompt();

    // Wait for user response
    const { outcome } = await deferredPrompt.userChoice;

    // Clear the deferred prompt
    deferredPrompt = null;

    // Hide banner
    banner.classList.remove('visible');
    setTimeout(() => banner.remove(), 300);
  });

  // Handle dismiss button
  banner.querySelector('.pwa-dismiss-btn').addEventListener('click', () => {
    // Store dismissal timestamp
    localStorage.setItem(DISMISS_BANNER_KEY, Date.now().toString());

    // Hide banner
    banner.classList.remove('visible');
    setTimeout(() => banner.remove(), 300);
  });
}

/**
 * Handle service worker updates
 */
function handleServiceWorkerUpdates() {
  if (!('serviceWorker' in navigator)) return;

  // Listen for controller change (indicates SW updated)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateAvailable) {
      showUpdateBanner();
    }
  });

  // Periodically check for updates
  setInterval(() => {
    checkForServiceWorkerUpdate();
  }, SW_UPDATE_CHECK_INTERVAL);

  // Check on initial load
  checkForServiceWorkerUpdate();
}

/**
 * Check if service worker has updates
 */
async function checkForServiceWorkerUpdate() {
  if (!navigator.serviceWorker.controller) return;

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return;

    // Check for updates
    await registration.update();

    // Check if new SW is waiting
    if (registration.waiting) {
      updateAvailable = true;
      showUpdateBanner();
    }
  } catch (error) {
    console.error('Error checking for SW updates:', error);
  }
}

/**
 * Show update available banner
 */
function showUpdateBanner() {
  // Check if update banner already exists
  if (document.querySelector('.pwa-update-banner')) return;

  const banner = document.createElement('div');
  banner.className = 'pwa-update-banner';
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', 'App update available');

  banner.innerHTML = `
    <div class="pwa-banner-content">
      <div class="pwa-banner-icon update-icon">⬆️</div>
      <div class="pwa-banner-info">
        <h3 class="pwa-banner-title">Update Available</h3>
        <p class="pwa-banner-description">New guides and features are ready. Refresh to get the latest version.</p>
      </div>
      <div class="pwa-banner-actions">
        <button class="pwa-update-btn" aria-label="Update app">Update Now</button>
        <button class="pwa-dismiss-btn" aria-label="Dismiss update prompt">Later</button>
      </div>
    </div>
  `;

  document.body.appendChild(banner);

  // Trigger animation
  requestAnimationFrame(() => {
    banner.classList.add('visible');
  });

  // Handle update button
  banner.querySelector('.pwa-update-btn').addEventListener('click', async () => {
    // Find waiting service worker and tell it to activate
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration && registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    } catch (error) {
      console.error('Error activating waiting SW:', error);
    }

    // Reload page after short delay to ensure new SW is activated
    setTimeout(() => {
      window.location.reload();
    }, 500);
  });

  // Handle dismiss button
  banner.querySelector('.pwa-dismiss-btn').addEventListener('click', () => {
    banner.classList.remove('visible');
    setTimeout(() => banner.remove(), 300);
  });

  // Auto-hide after 8 seconds if not interacted
  const autoHideTimer = setTimeout(() => {
    if (document.body.contains(banner)) {
      banner.classList.remove('visible');
      setTimeout(() => banner.remove(), 300);
    }
  }, 8000);

  // Clear timer on interaction
  banner.addEventListener('click', () => {
    clearTimeout(autoHideTimer);
  });
}

/**
 * Handle app installed event
 */
function handleAppInstalled() {
  window.addEventListener('appinstalled', () => {
    // Clear the deferred prompt
    deferredPrompt = null;

    // Hide install banner if visible
    const banner = document.querySelector('.pwa-install-banner');
    if (banner) {
      banner.classList.remove('visible');
      setTimeout(() => banner.remove(), 300);
    }

    // Clear dismiss state so banner can be shown again if user uninstalls
    localStorage.removeItem(DISMISS_BANNER_KEY);

    // Optional: Show success message
    showInstallSuccessToast();
  });
}

/**
 * Show installation success notification
 */
function showInstallSuccessToast() {
  const toast = document.createElement('div');
  toast.className = 'pwa-install-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = 'Survival Compendium installed! Quick access from your home screen.';

  document.body.appendChild(toast);

  // Auto-remove after 4 seconds
  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/**
 * Trigger manual service worker update check
 */
export async function checkForUpdates() {
  if (!navigator.serviceWorker.controller) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return false;

    await registration.update();
    return registration.waiting !== null;
  } catch (error) {
    console.error('Error checking for updates:', error);
    return false;
  }
}

/**
 * Get install promotion eligibility
 * Returns true if app can be installed
 */
export async function canPromptForInstall() {
  return deferredPrompt !== null;
}

/**
 * Manually trigger install prompt
 */
export async function promptInstall() {
  if (!deferredPrompt) {
    return false;
  }

  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;

  return outcome === 'accepted';
}
