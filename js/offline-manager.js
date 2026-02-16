/**
 * Offline Manager Module
 * Manages selective caching of guide categories for offline use
 * Uses Cache API to store guides by category
 */

const OFFLINE_CACHE_PREFIX = 'offline-category-';
const OFFLINE_CACHE_VERSION = 'v1';
const CATEGORY_METADATA_KEY = 'offline-manager-categories';

// Category definitions with estimated sizes
let categoryData = {};
let categoryCacheStatus = {};
let guidesData = [];

/**
 * Initialize the offline manager
 */
export async function init() {
  try {
    // Load guides data
    const response = await fetch('./data/guides.json');
    guidesData = await response.json();

    // Build category metadata
    buildCategoryMetadata();

    // Load cache status
    await loadCacheStatus();

    // Set up message listener for service worker
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    }
  } catch (error) {
    console.error('Failed to initialize offline manager:', error);
  }
}

/**
 * Build category metadata from guides
 */
function buildCategoryMetadata() {
  const categories = {};

  guidesData.forEach(guide => {
    if (!categories[guide.category]) {
      categories[guide.category] = {
        name: formatCategoryName(guide.category),
        guides: [],
        totalSize: 0
      };
    }
    categories[guide.category].guides.push(guide);
    // Estimate size: ~5KB per guide
    categories[guide.category].totalSize += 5000;
  });

  categoryData = categories;
}

/**
 * Format category name for display
 */
function formatCategoryName(category) {
  return category
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Load cache status from IndexedDB or localStorage
 */
async function loadCacheStatus() {
  try {
    const cacheNames = await caches.keys();
    const offlineCaches = cacheNames.filter(name =>
      name.startsWith(OFFLINE_CACHE_PREFIX)
    );

    for (const cacheName of offlineCaches) {
      const categoryName = cacheName.replace(
        OFFLINE_CACHE_PREFIX + OFFLINE_CACHE_VERSION + '-',
        ''
      );
      categoryCacheStatus[categoryName] = {
        cached: true,
        itemCount: 0,
        cacheSize: 0
      };

      // Count items in cache
      const cache = await caches.open(cacheName);
      const keys = await cache.keys();
      categoryCacheStatus[categoryName].itemCount = keys.length;

      // Estimate cache size
      for (const request of keys) {
        const response = await cache.match(request);
        if (response) {
          const blob = await response.blob();
          categoryCacheStatus[categoryName].cacheSize += blob.size;
        }
      }
    }
  } catch (error) {
    console.error('Failed to load cache status:', error);
  }
}

/**
 * Cache a category of guides
 */
export async function cacheCategory(category) {
  try {
    if (!categoryData[category]) {
      console.warn(`Category not found: ${category}`);
      return false;
    }

    const guides = categoryData[category].guides;
    const cacheName = `${OFFLINE_CACHE_PREFIX}${OFFLINE_CACHE_VERSION}-${category}`;
    const cache = await caches.open(cacheName);

    let successCount = 0;
    const totalGuides = guides.length;

    // Dispatch progress update
    dispatchProgressUpdate(category, 0, totalGuides);

    for (let i = 0; i < guides.length; i++) {
      try {
        const url = `./${guides[i].file}`;
        const response = await fetch(url);

        if (response.ok) {
          await cache.put(url, response.clone());
          successCount++;
        }
      } catch (error) {
        console.error(`Failed to cache guide ${guides[i].id}:`, error);
      }

      // Dispatch progress update every guide
      dispatchProgressUpdate(category, i + 1, totalGuides);
    }

    // Update status
    categoryCacheStatus[category] = {
      cached: true,
      itemCount: successCount,
      cacheSize: categoryData[category].totalSize
    };

    // Show toast notification after successful caching
    if (successCount > 0) {
      showCacheToast(category, successCount);
    }

    return true;
  } catch (error) {
    console.error(`Failed to cache category ${category}:`, error);
    return false;
  }
}

/**
 * Show toast notification for offline cache update
 * @param {string} category - Category name
 * @param {number} count - Number of guides cached
 */
function showCacheToast(category, count) {
  try {
    // Try to import and show toast
    import('./notifications.js').then(notifications => {
      if (notifications.showToast) {
        const categoryDisplay = category.charAt(0).toUpperCase() + category.slice(1);
        notifications.showToast(
          `📥 ${categoryDisplay} cached for offline use (${count} guides)`,
          3000
        );
      }
    }).catch(err => {
      console.warn('Failed to show cache toast:', err);
    });
  } catch (error) {
    console.warn('Failed to import notifications for cache toast:', error);
  }
}

/**
 * Remove a category from cache
 */
export async function uncacheCategory(category) {
  try {
    const cacheName = `${OFFLINE_CACHE_PREFIX}${OFFLINE_CACHE_VERSION}-${category}`;
    const success = await caches.delete(cacheName);

    if (success) {
      categoryCacheStatus[category] = {
        cached: false,
        itemCount: 0,
        cacheSize: 0
      };
    }

    return success;
  } catch (error) {
    console.error(`Failed to uncache category ${category}:`, error);
    return false;
  }
}

/**
 * Get all cached guides
 */
export async function getCachedGuides() {
  const cached = {};

  try {
    // Build a reverse map from file URL to guide ID using guidesData
    const urlToId = {};
    for (const guide of guidesData) {
      if (guide.file) {
        // Normalize: strip leading ./ if present
        const normalizedFile = guide.file.replace(/^\.\//, '');
        urlToId[normalizedFile] = guide.id;
      }
    }

    const cacheNames = await caches.keys();
    const offlineCaches = cacheNames.filter(name =>
      name.startsWith(OFFLINE_CACHE_PREFIX)
    );

    for (const cacheName of offlineCaches) {
      const cache = await caches.open(cacheName);
      const requests = await cache.keys();

      for (const request of requests) {
        const url = request.url;
        // Try to match against known guide files
        for (const [filePath, guideId] of Object.entries(urlToId)) {
          if (url.endsWith(filePath)) {
            cached[guideId] = true;
            break;
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to get cached guides:', error);
  }

  return cached;
}

/**
 * Cache all categories
 */
export async function cacheAll() {
  const categories = Object.keys(categoryData);

  for (const category of categories) {
    await cacheCategory(category);
  }
}

/**
 * Clear all offline caches
 */
export async function clearAll() {
  try {
    const cacheNames = await caches.keys();
    const offlineCaches = cacheNames.filter(name =>
      name.startsWith(OFFLINE_CACHE_PREFIX)
    );

    for (const cacheName of offlineCaches) {
      await caches.delete(cacheName);
    }

    // Reset status
    Object.keys(categoryCacheStatus).forEach(category => {
      categoryCacheStatus[category] = {
        cached: false,
        itemCount: 0,
        cacheSize: 0
      };
    });

    return true;
  } catch (error) {
    console.error('Failed to clear all caches:', error);
    return false;
  }
}

/**
 * Get total storage used
 */
export function getTotalStorageUsed() {
  return Object.values(categoryCacheStatus).reduce((total, status) => {
    return total + status.cacheSize;
  }, 0);
}

/**
 * Get category list with metadata
 */
export function getCategoryList() {
  return Object.keys(categoryData).map(category => ({
    id: category,
    name: categoryData[category].name,
    guideCount: categoryData[category].guides.length,
    estimatedSize: categoryData[category].totalSize,
    isCached: categoryCacheStatus[category]?.cached || false,
    cachedSize: categoryCacheStatus[category]?.cacheSize || 0,
    cachedCount: categoryCacheStatus[category]?.itemCount || 0
  }));
}

/**
 * Dispatch progress update event
 */
function dispatchProgressUpdate(category, current, total) {
  const event = new CustomEvent('offline-manager:progress', {
    detail: {
      category,
      current,
      total,
      percentage: Math.round((current / total) * 100)
    }
  });
  document.dispatchEvent(event);
}

/**
 * Handle service worker messages
 */
function handleServiceWorkerMessage(event) {
  if (event.data && event.data.type === 'CACHE_EVENT') {
    // Update UI if needed based on cache events
    // Cache event logged only for debugging if needed
  }
}

/**
 * Format bytes to human readable size
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
