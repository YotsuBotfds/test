# Offline Manager Implementation

## Overview

A selective offline download manager has been added to the Survival App, enabling users to choose which guide categories to cache for offline use. The system uses the Cache API to manage guides and provides a user-friendly modal interface for managing downloads.

## Files Created

### 1. `/js/offline-manager.js` (7.7 KB)
**Core module for managing offline cache operations**

#### Key Functions:
- `init()` - Initialize the manager, load guides data, and populate category metadata
- `cacheCategory(category)` - Cache all guides in a specific category
- `uncacheCategory(category)` - Remove a category from cache
- `getCachedGuides()` - Get all cached guide IDs
- `cacheAll()` - Cache all categories at once
- `clearAll()` - Remove all offline caches
- `getTotalStorageUsed()` - Calculate total storage used for caching
- `getCategoryList()` - Get array of all categories with metadata
- `formatBytes(bytes)` - Format byte sizes to human-readable format (KB, MB, GB)

#### Technical Details:
- Uses Cache API to store guide files with category-specific cache names
- Prefix: `offline-category-v1-{categoryName}`
- Estimates guide sizes (~5KB per guide)
- Dispatches custom events (`offline-manager:progress`) for progress tracking
- Loads guides data from `/data/guides.json`
- Auto-detects existing cached categories on initialization

### 2. `/js/offline-manager-ui.js` (13 KB)
**UI module for the offline manager modal interface**

#### Key Functions:
- `initUI()` - Create modal HTML and attach event listeners
- `openModal()` - Open the offline manager modal
- `closeModal()` - Close the modal
- `cacheAll()` - Trigger caching of all categories with confirmation
- `clearAll()` - Clear all caches with confirmation dialog
- `updateTotalStorage()` - Update storage display
- `updateGuideOfflineBadges()` - Add/remove offline badges on guide cards

#### Modal Features:
- **Two tabs:**
  - Categories: List all categories with toggle switches and progress bars
  - Help: Instructions on how to use offline mode

- **Category Display:**
  - Category name and guide count
  - Estimated size for uncached, cached size for cached categories
  - Toggle switch to cache/uncache
  - Progress bar during caching
  - Visual confirmation when cached

- **Header Information:**
  - Total storage used
  - Number of categories cached

- **Quick Actions:**
  - "Cache All" button to download all categories
  - "Clear All" button with confirmation

#### Event Handling:
- Listens to `offline-manager:progress` events from offline-manager.js
- Keyboard support: Escape key closes modal
- Responsive design for mobile devices

### 3. CSS Additions to `/css/main.css`
**700+ lines of responsive styling for the offline manager**

#### Sections:
1. **Modal Structure:**
   - `#offline-manager-modal` - Base modal with overlay
   - `.offline-manager-content` - Modal content container
   - `.offline-manager-header` - Title and close button
   - `.offline-manager-body` - Main content area

2. **Information Display:**
   - `.offline-info-bar` - Storage and category count display
   - `.offline-info-item` - Individual stat display
   - `.offline-info-label` and `.offline-info-value` - Stat styling

3. **Tab System:**
   - `.offline-manager-tabs` - Tab button container
   - `.offline-tab-btn` - Individual tab buttons with active state
   - `.offline-tab-content` - Tab content panels

4. **Category List:**
   - `.offline-category-item` - Individual category card
   - `.offline-category-header` - Category name and toggle
   - `.offline-category-info` - Name and metadata
   - `.offline-category-meta` - Guide count and size

5. **Toggle Switch:**
   - `.offline-toggle-switch` - Styled checkbox toggle
   - `.offline-toggle-slider` - Visual slider element
   - Smooth transitions for on/off state

6. **Progress Indicators:**
   - `.offline-progress-bar` - Progress bar container
   - `.offline-progress-fill` - Animated fill
   - `.offline-progress-text` - Percentage display

7. **Guide Card Badge:**
   - `.offline-badge` - Badge displayed on cached guides
   - Positioned in top-right corner of cards

8. **Help Content:**
   - `.offline-help-content` - Help tab styling
   - Lists, headings, and paragraphs with consistent theming

9. **Mobile Responsive:**
   - Tablet adjustments
   - Mobile optimizations (max 95% width, adjusted padding)
   - Flexible layouts that stack on small screens

#### Color Variables Used:
- `--surface` - Modal background
- `--accent` and `--accent2` - Highlights and accents
- `--text` and `--muted` - Text colors
- `--border` - Border colors
- `--card` - Card backgrounds

## Integration

### HTML Changes (`/index.html`)
Added "Manage Offline" button to the tools bar:
```html
<button onclick="offlineManagerUI.openModal()" title="Manage offline downloads" id=offline-manager-btn>
  📥 Manage Offline
</button>
```

### JavaScript Changes (`/js/app.js`)

**New Imports:**
```javascript
import * as offlineManager from './offline-manager.js';
import * as offlineManagerUI from './offline-manager-ui.js';
```

**Initialization in `initializeApp()`:**
```javascript
// Initialize offline manager
try {
  await offlineManager.init();
  offlineManagerUI.initUI();
  window.offlineManagerUI = offlineManagerUI; // Expose for HTML handlers
} catch (error) {
  console.error('Failed to initialize offline manager:', error);
}

// Update offline badges after cards are rendered
window.addEventListener('load', () => {
  setTimeout(async () => {
    await offlineManagerUI.updateGuideOfflineBadges();
    keyboard.initializeCardKeyboardNav();
  }, 100);
});
```

## Features

### 1. Category-Based Caching
- View all available guide categories
- See guide count and estimated storage per category
- Toggle individual categories on/off for caching

### 2. Real-Time Progress
- Progress bar shows caching status for each category
- Percentage display updates as guides are downloaded
- Visual feedback throughout the process

### 3. Storage Management
- Total storage used display in header
- Category count display
- Per-category cached size information
- "Cache All" and "Clear All" quick actions

### 4. Offline Badges
- Cached guides display a "📡" badge
- Positioned in top-right corner of guide cards
- Visual indicator of available offline content

### 5. Help System
- "Help" tab with usage instructions
- Explains how to use offline mode
- Notes about cache storage and browser data

### 6. User Experience
- Modal dialog with professional styling
- Responsive design (mobile-friendly)
- Confirmation dialogs for destructive actions
- Escape key to close modal
- Smooth animations (respects prefers-reduced-motion)

### 7. Service Worker Integration
- Uses Cache API (not IndexedDB)
- Leverages existing service worker infrastructure
- Category caches named: `offline-category-v1-{categoryName}`
- Compatible with existing caching strategies

## How It Works

### Caching Process
1. User clicks "Manage Offline" button
2. Modal displays all available categories
3. User toggles a category to cache
4. System fetches all guides in that category
5. Guides are stored in category-specific Cache API cache
6. Progress bar updates in real-time
7. Cached indicator appears when complete

### Offline Access
1. When a guide is cached, the offline badge appears on its card
2. Service worker recognizes cached guide URLs
3. Cached guides are served from Cache API even offline
4. Original service worker strategies still apply

### Storage Tracking
1. On init, system checks all existing offline caches
2. Calculates total storage from all cached guides
3. Updates display in real-time as user caches/uncaches
4. Shows per-category breakdown in the list

## Code Quality

### Architecture
- **Modular Design:** Separate concerns between caching logic (offline-manager.js) and UI (offline-manager-ui.js)
- **Event-Driven:** Uses custom events for progress updates
- **Async/Await:** Modern promise handling
- **Error Handling:** Try-catch blocks with logging

### Accessibility
- Semantic HTML with ARIA labels
- Role attributes for modal and controls
- Keyboard navigation support
- Color contrast compliant
- Respects `prefers-reduced-motion` preference

### Performance
- Lazy initialization
- Event delegation for dynamic elements
- Efficient cache operations
- Minimal DOM manipulation
- Responsive image loading (estimated sizes)

## Browser Requirements

- Service Worker support
- Cache API support
- ES6 modules
- Modern browser (Chrome, Firefox, Edge, Safari)

## Testing Checklist

- [ ] Click "Manage Offline" button opens modal
- [ ] Modal displays all categories with guide counts
- [ ] Toggle a category's switch to cache it
- [ ] Progress bar shows caching progress
- [ ] "Cached" indicator appears when complete
- [ ] Offline badges appear on cached guide cards
- [ ] Storage usage updates in header
- [ ] Switch back to uncache a category
- [ ] "Cache All" button caches all categories
- [ ] "Clear All" button with confirmation removes all caches
- [ ] Help tab displays usage instructions
- [ ] Escape key closes modal
- [ ] Modal is responsive on mobile
- [ ] Works offline after caching (test with devtools offline mode)

## Future Enhancements

Possible improvements for future versions:
- Selective download size limits
- Scheduled background caching
- Cloud sync for offline progress
- Category grouping by topic
- Search within cached guides
- Download speed preferences
- Automatic cache expiration policies
- Multi-device sync via Service Worker Background Sync API

## Configuration

Constants in `/js/offline-manager.js`:
```javascript
const OFFLINE_CACHE_PREFIX = 'offline-category-';
const OFFLINE_CACHE_VERSION = 'v1';
```

These can be adjusted if cache naming strategy needs to change.

## Compatibility

The offline manager works alongside existing offline functionality:
- Core cache (`core-v10`) - Essential app files
- Guides cache (`guides-v10`) - Guide pages
- Data cache (`data-v10`) - JSON data files
- Dynamic cache (`dynamic-v10`) - User-generated content
- Offline category caches - New selective category caching

All systems work together to provide comprehensive offline support.
