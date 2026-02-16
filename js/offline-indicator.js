/**
 * Offline/Online Indicator Module
 * Displays a banner when the app goes offline and hides it when reconnected
 */

let banner = null;
let hideTimeout = null;

/**
 * Create the offline banner element
 */
function createBanner() {
  const container = document.createElement('div');
  container.id = 'offline-banner-container';

  const banner = document.createElement('div');
  banner.id = 'offline-banner';
  banner.className = 'offline-banner';
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'assertive');
  banner.setAttribute('aria-label', 'Connection status');

  const content = document.createElement('span');
  content.textContent = '📡 Offline Mode - All cached guides available';

  banner.appendChild(content);
  container.appendChild(banner);

  return { container, banner };
}

/**
 * Show the offline banner
 */
function showOfflineBanner() {
  if (banner) return; // Already showing

  const { container, banner: bannerElement } = createBanner();
  banner = bannerElement;

  document.body.insertBefore(container, document.body.firstChild);

  // Trigger reflow for CSS transitions
  void banner.offsetWidth;
  banner.classList.add('visible');
}

/**
 * Hide the offline banner with "Back online" message
 */
function hideOfflineBanner() {
  if (!banner) return; // Already hidden

  // Clear any pending hide timeout
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }

  // Show brief "Back online" message
  banner.textContent = 'Back online';
  banner.classList.remove('offline-banner');
  banner.classList.add('online-banner', 'online');
  banner.setAttribute('aria-label', 'Back online');

  // Auto-hide after 3 seconds
  hideTimeout = setTimeout(() => {
    const container = banner.closest('#offline-banner-container');
    if (container) {
      container.remove();
    }
    banner = null;
    hideTimeout = null;
  }, 3000);
}

/**
 * Handle online event
 */
function handleOnline() {
  hideOfflineBanner();
}

/**
 * Handle offline event
 */
function handleOffline() {
  showOfflineBanner();
}

/**
 * Initialize the offline indicator module
 */
export function init() {
  // Listen for online/offline events
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Check initial connection state
  if (!navigator.onLine) {
    showOfflineBanner();
  }
}

/**
 * Cleanup function (optional, for unloading)
 */
export function destroy() {
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);

  if (hideTimeout) {
    clearTimeout(hideTimeout);
  }

  const container = document.getElementById('offline-banner-container');
  if (container) {
    container.remove();
  }

  banner = null;
}
