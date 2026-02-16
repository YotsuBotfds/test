# Offline Manager - Developer Guide

## Quick API Reference

### Core Module: `js/offline-manager.js`

```javascript
import * as offlineManager from './offline-manager.js';

// Initialize (called automatically in app.js)
await offlineManager.init();

// Cache/Uncache operations
await offlineManager.cacheCategory('zth-modules');  // Cache a category
await offlineManager.uncacheCategory('zth-modules'); // Remove from cache
await offlineManager.cacheAll();                     // Cache all categories
await offlineManager.clearAll();                     // Clear all caches

// Query operations
const cachedGuides = await offlineManager.getCachedGuides();  // Returns: { "SUR-01": true, ... }
const categories = offlineManager.getCategoryList();         // Returns array of category objects
const totalBytes = offlineManager.getTotalStorageUsed();    // Returns: number
const readable = offlineManager.formatBytes(totalBytes);    // Returns: "2.5 MB"
```

### UI Module: `js/offline-manager-ui.js`

```javascript
import * as offlineManagerUI from './offline-manager-ui.js';

// UI Control (exposed to window in app.js)
window.offlineManagerUI.initUI();                   // Initialize modal (called automatically)
window.offlineManagerUI.openModal();               // Open the modal
window.offlineManagerUI.closeModal();              // Close the modal
await window.offlineManagerUI.cacheAll();         // Cache all (with dialog)
await window.offlineManagerUI.clearAll();         // Clear all (with dialog)
await window.offlineManagerUI.updateTotalStorage(); // Refresh storage display
await window.offlineManagerUI.updateGuideOfflineBadges(); // Update guide badges
```

### HTML Integration

```html
<!-- Button in tools bar (already added) -->
<button onclick="offlineManagerUI.openModal()" title="Manage offline downloads">
  📥 Manage Offline
</button>

<!-- Modal is created dynamically by initUI() -->
```

## Data Structures

### Category Object
```javascript
{
  id: 'zth-modules',
  name: 'Zth Modules',
  guideCount: 22,
  estimatedSize: 110000,          // bytes
  isCached: true,
  cachedSize: 115200,             // bytes (actual)
  cachedCount: 22                 // actual cached items
}
```

### Cached Guides Object
```javascript
{
  'SUR-01': true,
  'SUR-02': true,
  'SUR-03': true,
  // ... more guides
}
```

## Event System

### Custom Event: `offline-manager:progress`
Dispatched during category caching with progress details.

```javascript
document.addEventListener('offline-manager:progress', (event) => {
  const { category, current, total, percentage } = event.detail;
  console.log(`${category}: ${percentage}%`);
});
```

## Cache Naming Convention

Category caches are named with the pattern:
```
offline-category-v1-{categoryName}

Examples:
- offline-category-v1-zth-modules
- offline-category-v1-medical
- offline-category-v1-agriculture
```

## Service Worker Compatibility

The offline manager uses the Cache API which is managed by the service worker at `sw.js`.

### Cache Lifecycle
1. **User toggles category** → `cacheCategory()` is called
2. **Guides are fetched** from `./guides/{guide-file}.html`
3. **Service worker caches** them in category-specific cache
4. **Service worker fetch handler** serves cached guides
5. **User toggles off** → `uncacheCategory()` deletes the cache

### Service Worker Message Protocol
```javascript
// SW receives messages about cache operations
navigator.serviceWorker.controller.postMessage({
  type: 'CACHE_OPERATION',
  operation: 'cache',
  category: 'zth-modules'
});
```

## Styling System

### CSS Classes and Structure
```
#offline-manager-modal (modal container)
├── .offline-manager-overlay (click-to-close area)
└── .offline-manager-content (modal panel)
    ├── .offline-manager-header
    │   ├── h2 (title)
    │   └── .offline-manager-close (button)
    ├── .offline-manager-body
    │   ├── .offline-info-bar
    │   │   ├── .offline-info-item (storage)
    │   │   └── .offline-info-item (count)
    │   ├── .offline-manager-tabs
    │   │   ├── .offline-tab-btn (categories)
    │   │   └── .offline-tab-btn (help)
    │   └── .offline-tab-content (active panel)
    │       ├── .offline-actions (buttons)
    │       └── .offline-categories-list
    │           └── .offline-category-item (repeating)
    │               ├── .offline-category-header
    │               ├── .offline-category-progress (hidden initially)
    │               └── .offline-category-cached (hidden initially)
```

### CSS Variables Used
- `--surface` - Background colors
- `--accent` and `--accent2` - Highlight colors
- `--text` and `--muted` - Text colors
- `--border` - Border colors
- `--card` - Secondary background
- `--transition-normal` - Animation timing (0.2s)
- `--border-radius-*` - Border radius values

## Common Tasks

### Add a Custom Button to the Modal

```javascript
// In offline-manager-ui.js, add to createModalHTML()
const button = document.createElement('button');
button.className = 'offline-action-btn';
button.textContent = 'Custom Action';
button.onclick = () => yourFunction();
document.querySelector('.offline-actions').appendChild(button);
```

### Display Custom Progress Message

```javascript
document.addEventListener('offline-manager:progress', (event) => {
  const { category, percentage } = event.detail;
  updateCustomUI(`Loading ${category}: ${percentage}%`);
});
```

### Track Specific Category Cache Status

```javascript
const categories = offlineManager.getCategoryList();
const medicalCategory = categories.find(c => c.id === 'medical');

if (medicalCategory.isCached) {
  console.log(`Medical guides cached: ${medicalCategory.cachedSize} bytes`);
}
```

### Check if Guide is Cached

```javascript
const cached = await offlineManager.getCachedGuides();
if (cached['SUR-01']) {
  console.log('Water Purification guide is cached');
}
```

## Debugging

### Enable Verbose Logging
Add to the start of `offline-manager.js`:
```javascript
const DEBUG = true;

function log(...args) {
  if (DEBUG) console.log('[OfflineManager]', ...args);
}
```

### Browser DevTools

**To inspect cached items:**
1. Open DevTools
2. Go to Application → Cache Storage
3. Look for caches named `offline-category-v1-*`
4. Click to see cached guide files

**To test offline:**
1. Application → Service Workers
2. Check "Offline" checkbox
3. Refresh page to test

**To clear caches:**
```javascript
// In DevTools console
caches.keys().then(names => {
  names.forEach(name => {
    if (name.startsWith('offline-category-')) {
      caches.delete(name);
    }
  });
});
```

### Performance Monitoring

```javascript
// Measure caching time
const start = performance.now();
await offlineManager.cacheCategory('medical');
const duration = performance.now() - start;
console.log(`Caching took ${duration}ms`);
```

## Troubleshooting

### Modal doesn't appear
- Check: `window.offlineManagerUI.openModal()` is called
- Verify: `#offline-manager-modal` exists in DOM
- Ensure: CSS is loaded and `display: flex` on `.active` class

### Progress bar doesn't update
- Check: Event listener is attached in UI module
- Verify: `cacheCategory()` dispatches `offline-manager:progress` event
- Ensure: Progress div is visible (not display: none)

### Cached guides not appearing offline
- Check: Service worker is active (DevTools → Service Workers)
- Verify: Guide files exist at correct paths
- Test: Network tab shows cached responses with `(cached)` label

### Storage showing incorrect size
- Clear all caches and recalculate: `offlineManagerUI.clearAll()`
- Check: Each cached guide is ~5KB (estimate in code)
- Manual calculation: Verify via DevTools Cache Storage

## Integration Checklist

When adding to a new project:

- [ ] Copy `js/offline-manager.js` to project
- [ ] Copy `js/offline-manager-ui.js` to project
- [ ] Add CSS section to `css/main.css`
- [ ] Add button to tools bar in HTML
- [ ] Import modules in `app.js`
- [ ] Call `offlineManager.init()` in initialization
- [ ] Call `offlineManagerUI.initUI()` after DOM ready
- [ ] Expose `offlineManagerUI` to `window`
- [ ] Update guide badges after rendering
- [ ] Test caching in browsers (Chrome, Firefox, Safari, Edge)
- [ ] Test offline mode (DevTools offline checkbox)
- [ ] Test mobile responsive design

## Performance Considerations

### Caching Speed
- Each guide fetch is sequential to avoid overwhelming network
- Average: ~5KB per guide × category size = X seconds
- Example: 22-guide category = ~110KB ≈ 1-2 seconds on 4G

### Storage Limits
- Modern browsers: 50MB+ persistent storage
- Can typically cache 100+ guides per category
- Recommend max 10-15 categories cached simultaneously

### Memory Usage
- UI keeps DOM minimal
- Modal created once on init
- Event listeners cleaned up
- No memory leaks from repeated opens/closes

## Future Enhancement Ideas

```javascript
// Selective guide caching (sub-category level)
export async function cacheGuide(guideId) {
  // Cache individual guides
}

// Background sync
export async function scheduleSyncCategory(category) {
  // Use Background Sync API to cache when idle
}

// Download size estimation
export function estimateDownloadSize(categories) {
  // Preview size before caching
}

// Bandwidth throttling
export async function setCachingBandwidth(mbps) {
  // Limit download speed
}

// Cache versioning
export async function upgradeCache(oldVersion, newVersion) {
  // Migrate cached data on updates
}
```

## Related Files

- **Service Worker:** `/sw.js` - Handles actual caching
- **Styles:** `/css/main.css` - Contains offline manager CSS
- **HTML:** `/index.html` - Contains "Manage Offline" button
- **Main App:** `/js/app.js` - Imports and initializes modules
- **Guides Data:** `/data/guides.json` - Source of category info

## License and Attribution

This offline manager module is part of the Survival App and follows the same license terms as the main application.
