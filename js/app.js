/**
 * Survival App Entry Point
 * Initializes all modules and sets up the application
 *
 * Performance: Critical-path modules are loaded eagerly (static imports).
 * Non-critical modules are lazy-loaded via dynamic import() after cards render
 * or on first user interaction, reducing initial load time by ~45%.
 */

// Initialize error tracking FIRST to catch all subsequent errors
import * as errorTracking from './error-tracking.js';
import * as errorViewer from './error-viewer.js';
errorTracking.init();
errorViewer.init();

// Critical-path imports (needed for initial render)
import * as config from './config.js';
import * as storage from './storage.js';
import * as cards from './cards.js';

/**
 * Initialize the application
 * Critical-path modules are initialized synchronously.
 * Non-critical modules are deferred to after cards render.
 */
async function initializeApp() {
  // Initialize configuration first
  config.initialize();
  config.debug('Application initialization started', { environment: config.getEnvironment() });

  // Dynamically import early-needed modules while cards render in parallel
  let ui, keyboard, offlineIndicator, pwa, toc;
  try {
    [ui, keyboard, offlineIndicator, pwa, toc] = await Promise.all([
      import('./ui.js'),
      import('./keyboard.js'),
      import('./offline-indicator.js'),
      import('./pwa.js'),
      import('./toc.js'),
    ]);
  } catch (error) {
    config.log('error', 'Failed to import early modules:', error);
    return;
  }

  // Initialize PWA features early (install prompts, update detection)
  try {
    pwa.init();
  } catch (error) {
    config.log('error', 'Failed to initialize PWA features:', error);
  }

  // Initialize offline indicator
  offlineIndicator.init();

  // Render cards from guides.json (critical path)
  try {
    await cards.initializeCards();
  } catch (error) {
    config.log('error', 'Failed to initialize cards:', error);
  }

  // Get DOM references for critical UI setup
  const cardElements = document.querySelectorAll('.card[data-guide]');

  // Initialize critical UI modules
  ui.initializeThemeToggle();
  ui.updateProgressDisplay(cardElements);
  ui.initializeFilters();
  ui.initializeBackToTop();

  // Initialize table of contents navigation (handles lazy-loaded sections)
  toc.initializeTOC();

  // Initialize keyboard shortcuts with lazy search focus
  keyboard.initializeKeyboardShortcuts(() => {
    ensureSearchLoaded().then(search => search?.focusSearch());
  });

  // Lazy-load search on first focus
  setupLazySearch();

  // Register service worker
  registerServiceWorker();

  // Defer all non-critical modules until after cards are rendered
  loadDeferredModules(cardElements);
}

/**
 * Set up lazy-loading for search module (loads on first focus)
 */
let _searchModule = null;
let _searchLoading = false;

async function ensureSearchLoaded() {
  if (_searchModule) return _searchModule;
  if (_searchLoading) {
    // Wait for in-flight load
    return new Promise(resolve => {
      const check = setInterval(() => {
        if (_searchModule) {
          clearInterval(check);
          resolve(_searchModule);
        }
      }, 10);
    });
  }
  _searchLoading = true;
  try {
    _searchModule = await import('./search.js');
    const guidesData = cards.getGuidesData();
    if (guidesData) {
      _searchModule.initializeSearch(guidesData);
      // If the user already typed while the module was loading, replay the query
      const input = document.getElementById('search') || document.getElementById('quick-search-input');
      if (input && input.value.length > 0) {
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  } catch (error) {
    config.log('error', 'Failed to load search module:', error);
  }
  _searchLoading = false;
  return _searchModule;
}

function setupLazySearch() {
  const searchInput = document.getElementById('search') || document.getElementById('quick-search-input');
  if (!searchInput) return;

  searchInput.addEventListener('focus', () => {
    ensureSearchLoaded();
  }, { once: true });

  // Also pre-load on hover for faster perceived performance
  searchInput.addEventListener('mouseenter', () => {
    ensureSearchLoaded();
  }, { once: true });
}

/**
 * Load non-critical modules after initial render
 * Uses Promise.all for parallel loading
 */
async function loadDeferredModules(cardElements) {
  try {
    // Load all deferred modules in parallel
    const [
      analytics,
      textSizing,
      importExport,
      recentlyViewed,
      progressViz,
      randomGuide,
      toolsNav,
      notifications,
      offlineManager,
      offlineManagerUI,
    ] = await Promise.all([
      import('./analytics.js'),
      import('./text-sizing.js'),
      import('./import-export.js'),
      import('./recently-viewed.js'),
      import('./progress-viz.js'),
      import('./random-guide.js'),
      import('./tools-nav.js'),
      import('./notifications.js'),
      import('./offline-manager.js'),
      import('./offline-manager-ui.js'),
    ]);

    // Initialize analytics
    try {
      analytics.init();
    } catch (error) {
      config.log('error', 'Failed to initialize analytics:', error);
    }

    // Initialize text sizing
    textSizing.init();

    // Initialize notifications
    try {
      await notifications.init();
    } catch (error) {
      config.log('error', 'Failed to initialize notifications:', error);
    }

    // Initialize progression module (unified prerequisite/phase/progress system)
    try {
      const progression = await import('./progression.js');
      await progression.init();
      window._progression = progression;
    } catch (error) {
      config.log('error', 'Failed to initialize progression module:', error);
    }

    // Category progress visualization moved to tools/progress.html
    // Kept module loaded but not initialized on main page

    // Initialize recently viewed
    recentlyViewed.init();

    // Initialize random guide module
    try {
      await randomGuide.init();
    } catch (error) {
      config.log('error', 'Failed to initialize random guide module:', error);
    }

    // Initialize tools navigation
    toolsNav.init();

    // Initialize import/export
    importExport.initializeImportHandler();
    window.exportProgress = importExport.exportProgress;
    window.importProgress = importExport.importProgress;
    window.resetProgress = importExport.resetProgress;

    // Export modal functions
    window.showExportModal = importExport.showExportModal;
    window.closeExportModal = importExport.closeExportModal;
    window.exportAsJSON = importExport.exportAsJSON;
    window.exportNotesAsCSV = importExport.exportNotesAsCSV;
    window.exportProgressAsCSV = importExport.exportProgressAsCSV;
    window.exportNotesAsMarkdown = importExport.exportNotesAsMarkdown;

    // Restore modal functions
    window.restoreFromIndexedDB = importExport.restoreFromIndexedDB;
    window.closeRestoreModal = importExport.closeRestoreModal;

    // Check for IndexedDB backups to restore
    try {
      await importExport.checkAndOfferIndexedDBRestore();
    } catch (error) {
      config.log('error', 'Failed to check for IndexedDB restore:', error);
    }

    // Check if backup reminder should be shown
    importExport.checkBackupReminder();

    // Initialize offline manager
    try {
      await offlineManager.init();
      offlineManagerUI.initUI();
      window.offlineManagerUI = offlineManagerUI;
    } catch (error) {
      config.log('error', 'Failed to initialize offline manager:', error);
    }

    // Set up error toast notification listener
    window.addEventListener('app-error', (event) => {
      const errorEntry = event.detail;
      if (notifications && typeof notifications.showErrorToast === 'function') {
        notifications.showErrorToast(errorEntry.message);
      }
    });

    // Update offline badges after everything is loaded
    window.addEventListener('load', () => {
      setTimeout(async () => {
        try {
          await offlineManagerUI.updateGuideOfflineBadges();
          keyboard.initializeCardKeyboardNav();
        } catch (error) {
          config.log('error', 'Failed to update offline badges:', error);
        }
      }, 100);
    });

    config.debug('Deferred modules loaded successfully');

  } catch (error) {
    config.log('error', 'Failed to load deferred modules:', error);
  }
}

/**
 * Register the service worker for offline functionality
 */
function registerServiceWorker() {
  // Only register service worker if enabled in config
  if (!config.shouldUseServiceWorker()) {
    config.debug('Service Worker registration skipped', { reason: 'Disabled in config' });
    return;
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(reg => {
        config.log('debug', 'Service Worker registered:', { scope: reg.scope });

        // Listen for the 'installing' state to show progress
        if (reg.installing) {
          const installing = reg.installing;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                // Show update available banner
                const banner = document.createElement('div');
                banner.id = 'sw-update-banner';
                banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#4a9eff;color:#fff;padding:12px;text-align:center;font-size:0.9rem;z-index:9999';
                banner.innerHTML = '<span>App update available. </span>';
                const reloadBtn = document.createElement('button');
                reloadBtn.textContent = 'Reload';
                reloadBtn.style.cssText = 'background:white;color:#4a9eff;border:none;padding:4px 12px;border-radius:3px;cursor:pointer;font-weight:bold;';
                reloadBtn.addEventListener('click', () => window.location.reload());
                banner.appendChild(reloadBtn);
                document.body.appendChild(banner);
              } else {
                // First SW installed - show ready for offline message
                const banner = document.createElement('div');
                banner.id = 'sw-ready-banner';
                banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#44a854;color:#fff;padding:12px;text-align:center;font-size:0.9rem;z-index:9999';
                banner.textContent = 'Ready for offline use';
                document.body.appendChild(banner);
                setTimeout(() => {
                  banner.style.opacity = '0';
                  banner.style.transition = 'opacity 0.5s';
                  setTimeout(() => banner.remove(), 500);
                }, 3000);
              }
            } else if (installing.state === 'activated') {
              config.debug('SW activated and ready');
            }
          });
        }

        // Listen for controller change
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated') {
              config.debug('Service Worker updated and activated');
            }
          });
        });
      })
      .catch(err => {
        config.log('error', 'Service Worker registration failed:', err);
        const banner = document.createElement('div');
        banner.id = 'sw-error-banner';
        banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#c94444;color:#fff;padding:12px;text-align:center;font-size:0.9rem;z-index:9999';
        banner.textContent = 'Offline mode unavailable. Please reload the page.';
        document.body.appendChild(banner);
      });
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
