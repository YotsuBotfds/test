const CACHE_VERSION = 'v21';
const CORE_CACHE = `core-${CACHE_VERSION}`;
const GUIDES_CACHE = `guides-${CACHE_VERSION}`;
const DATA_CACHE = `data-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `dynamic-${CACHE_VERSION}`;

// Core shell files to cache on install
const CORE_CACHE_URLS = [
  './index.html',
  './css/main.css',
  './manifest.json',
  './data/guides.json',
  './assets/icon-192.png',
  './assets/icon-512.png',
  // All ES module JS files (each import is a separate HTTP request)
  './js/app.js',
  './js/analytics.js',
  './js/cards.js',
  './js/config.js',
  './js/error-tracking.js',
  './js/error-viewer.js',
  './js/import-export.js',
  './js/keyboard.js',
  './js/notifications.js',
  './js/offline-indicator.js',
  './js/offline-manager.js',
  './js/offline-manager-ui.js',
  './js/progress-viz.js',
  './js/pwa.js',
  './js/random-guide.js',
  './js/recently-viewed.js',
  './js/search.js',
  './js/storage.js',
  './js/text-sizing.js',
  './js/tools-nav.js',
  './js/ui.js',
];

// Maximum entries in on-demand cache
const MAX_CACHE_ENTRIES = 300;

// Cache expiration time in milliseconds (30 days)
const CACHE_EXPIRY_TIME = 30 * 24 * 60 * 60 * 1000;

/**
 * Log cache activity for debugging
 */
function logCacheEvent(type, url, hitOrMiss) {
  if (self.clients) {
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'CACHE_EVENT',
          cacheType: type,
          url: url,
          hitOrMiss: hitOrMiss,
          timestamp: new Date().toISOString()
        });
      });
    }).catch(() => {
      // Silently ignore client messaging errors
    });
  }
}

/**
 * Check if URL should be skipped from caching
 */
function shouldSkipCache(url) {
  // Skip extension URLs, chrome URLs, etc.
  if (url.startsWith('chrome-extension://') ||
      url.startsWith('chrome://') ||
      url.startsWith('about:')) {
    return true;
  }
  return false;
}

/**
 * Get the cache type for a given URL
 */
function getCacheTypeForUrl(url) {
  if (url.includes('/guides/') && url.endsWith('.html')) {
    return GUIDES_CACHE;
  }
  if (url.includes('/data/') || url.includes('guides.json') || url.includes('skills_merged.json')) {
    return DATA_CACHE;
  }
  return DYNAMIC_CACHE;
}

/**
 * Trim cache to max entries
 */
async function trimCache(cacheName, maxEntries) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();

    if (keys.length > maxEntries) {
      const keysToDelete = keys.slice(0, keys.length - maxEntries);
      for (const key of keysToDelete) {
        await cache.delete(key);
      }
    }
  } catch (error) {
    console.error(`Error trimming cache ${cacheName}:`, error);
  }
}

/**
 * Clean expired caches
 */
async function cleanExpiredCaches() {
  try {
    const cacheNames = await caches.keys();
    const now = Date.now();

    for (const cacheName of cacheNames) {
      // Check if cache has metadata about creation time
      const cache = await caches.open(cacheName);
      const keys = await cache.keys();

      for (const request of keys) {
        const response = await cache.match(request);
        if (response && response.headers) {
          const dateHeader = response.headers.get('date');
          if (dateHeader) {
            const cacheTime = new Date(dateHeader).getTime();
            if (now - cacheTime > CACHE_EXPIRY_TIME) {
              await cache.delete(request);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error cleaning expired caches:', error);
  }
}

/**
 * Fetch with network-first strategy
 */
async function networkFirst(request, cacheName) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
      logCacheEvent(cacheName, request.url, 'NETWORK_HIT');
    }

    return networkResponse;
  } catch (error) {
    logCacheEvent(cacheName, request.url, 'NETWORK_FAIL');
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
      logCacheEvent(cacheName, request.url, 'CACHE_HIT');
      return cachedResponse;
    }

    // Return offline page only for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('./index.html');
    }

    throw error;
  }
}

/**
 * Fetch with cache-first strategy
 */
async function cacheFirst(request, cacheName) {
  try {
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
      logCacheEvent(cacheName, request.url, 'CACHE_HIT');
      return cachedResponse;
    }

    logCacheEvent(cacheName, request.url, 'CACHE_MISS');
    const networkResponse = await fetch(request);

    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
      await trimCache(cacheName, MAX_CACHE_ENTRIES);
    }

    return networkResponse;
  } catch (error) {
    console.error(`Fetch failed for ${request.url}:`, error);

    // Return offline page only for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('./index.html');
    }

    throw error;
  }
}

/**
 * Fetch with stale-while-revalidate strategy
 */
async function staleWhileRevalidate(request, cacheName) {
  try {
    const cachedResponse = await caches.match(request);

    const fetchPromise = fetch(request).then(networkResponse => {
      if (networkResponse && networkResponse.status === 200) {
        const cache = caches.open(cacheName);
        cache.then(c => c.put(request, networkResponse.clone()));
      }
      return networkResponse;
    }).catch(() => {
      logCacheEvent(cacheName, request.url, 'NETWORK_FAIL');
      if (cachedResponse) {
        return cachedResponse;
      }
      throw new Error('No network and no cache available');
    });

    if (cachedResponse) {
      logCacheEvent(cacheName, request.url, 'CACHE_HIT');
      return cachedResponse;
    }

    logCacheEvent(cacheName, request.url, 'CACHE_MISS');
    return fetchPromise;
  } catch (error) {
    console.error(`Fetch failed for ${request.url}:`, error);

    // Return offline page only for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('./index.html');
    }

    throw error;
  }
}

/**
 * Handle range requests for large files
 */
function handleRangeRequest(request, response) {
  const rangeHeader = request.headers.get('range');

  if (!rangeHeader || !response.ok) {
    return response;
  }

  try {
    // Only handle range requests if response has content-length
    const contentLength = response.headers.get('content-length');
    if (!contentLength) {
      return response;
    }

    const matches = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (!matches) {
      return response;
    }

    const start = parseInt(matches[1], 10);
    const end = matches[2] ? parseInt(matches[2], 10) : parseInt(contentLength, 10) - 1;

    if (start >= parseInt(contentLength, 10) || start > end) {
      return new Response(null, {
        status: 416,
        statusText: 'Range Not Satisfiable'
      });
    }

    // Range requests are supported - return as-is
    // The browser will handle the actual range slicing
    return response;
  } catch (error) {
    console.error('Error handling range request:', error);
    return response;
  }
}

/**
 * Install event: cache core shell
 */
self.addEventListener('install', (event) => {
  console.log(`[SW] Installing service worker ${CACHE_VERSION}`);

  event.waitUntil(
    (async () => {
      try {
        // Cache core files
        const cache = await caches.open(CORE_CACHE);
        await cache.addAll(CORE_CACHE_URLS);
        console.log('[SW] Core cache populated');

        // Skip waiting to activate immediately
        await self.skipWaiting();
      } catch (error) {
        console.error('[SW] Installation error:', error);
        throw error;
      }
    })()
  );
});

/**
 * Activate event: clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log(`[SW] Activating service worker ${CACHE_VERSION}`);

  event.waitUntil(
    (async () => {
      try {
        // Delete old caches
        const cacheNames = await caches.keys();
        const cachesToDelete = cacheNames.filter(name => {
          return !name.includes(CACHE_VERSION);
        });

        await Promise.all(
          cachesToDelete.map(cacheName => {
            console.log(`[SW] Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          })
        );

        // Clean expired entries
        await cleanExpiredCaches();

        // Claim clients
        await self.clients.claim();
        console.log('[SW] Activation complete');
      } catch (error) {
        console.error('[SW] Activation error:', error);
        throw error;
      }
    })()
  );
});

/**
 * Fetch event: intelligent caching strategy
 */
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip caching for certain URLs
  if (shouldSkipCache(event.request.url)) {
    return;
  }

  const url = new URL(event.request.url);

  // Determine caching strategy based on URL
  let strategy;
  let cacheName;

  try {
    // Network-first for main index.html (want latest version)
    if (url.pathname === '/' || url.pathname.endsWith('/index.html')) {
      strategy = networkFirst;
      cacheName = CORE_CACHE;
    }
    // Stale-while-revalidate for data files
    else if (url.pathname.includes('/data/') ||
             url.pathname.endsWith('guides.json') ||
             url.pathname.endsWith('skills_merged.json')) {
      strategy = staleWhileRevalidate;
      cacheName = DATA_CACHE;
    }
    // Cache-first for guide HTML files
    else if (url.pathname.includes('/guides/') && url.pathname.endsWith('.html')) {
      strategy = cacheFirst;
      cacheName = GUIDES_CACHE;
    }
    // Cache-first for static assets (CSS, JS, images)
    else if (url.pathname.endsWith('.css') ||
             url.pathname.endsWith('.js') ||
             url.pathname.endsWith('.png') ||
             url.pathname.endsWith('.jpg') ||
             url.pathname.endsWith('.jpeg') ||
             url.pathname.endsWith('.gif') ||
             url.pathname.endsWith('.svg') ||
             url.pathname.endsWith('.webp') ||
             url.pathname.endsWith('.ico') ||
             url.pathname.endsWith('.woff') ||
             url.pathname.endsWith('.woff2') ||
             url.pathname.endsWith('.ttf')) {
      strategy = cacheFirst;
      cacheName = DYNAMIC_CACHE;
    }
    // Default to stale-while-revalidate for other resources
    else {
      strategy = staleWhileRevalidate;
      cacheName = DYNAMIC_CACHE;
    }

    event.respondWith(
      strategy(event.request, cacheName).then(response => {
        // Handle range requests
        return handleRangeRequest(event.request, response);
      }).catch(error => {
        console.error(`[SW] Fetch error for ${event.request.url}:`, error);

        // Return offline page only for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html').catch(() => {
            return new Response(
              '<!DOCTYPE html><html><body><h1>Offline</h1><p>App is currently offline</p></body></html>',
              { headers: { 'Content-Type': 'text/html' } }
            );
          });
        }

        // For non-HTML requests, return error response (don't fallback to HTML)
        return new Response('Resource not available', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      })
    );
  } catch (error) {
    console.error(`[SW] Unexpected error handling fetch:`, error);

    // Return offline page only for navigation requests
    if (event.request.mode === 'navigate') {
      event.respondWith(
        caches.match('./index.html').catch(() => {
          return new Response(
            '<!DOCTYPE html><html><body><h1>Offline</h1><p>App is currently offline</p></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        })
      );
    }
  }
});

/**
 * Message event: handle cache operations from clients
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(DYNAMIC_CACHE).then(() => {
      event.ports[0].postMessage({ success: true });
    }).catch(error => {
      event.ports[0].postMessage({ success: false, error: error.message });
    });
  }
});
