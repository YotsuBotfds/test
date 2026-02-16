# Quick Reference Guide

## Files at a Glance

### 1. `/index.html` - Main HTML (8.7 KB)
**Key Change:**
```html
<!-- OLD: 188 hardcoded <a class=card> elements -->
<!-- NEW: Single container div -->
<div id="guides-container" class="guides-grid"></div>
```

**Structure:**
- `<head>` - Styles, meta tags (preserved)
- `<body>` - Content sections (preserved)
- `<main id="main-content">` - Main content area
- `<div id="guides-container">` - Cards rendered here
- `<footer>` - Attribution (preserved)

### 2. `/js/cards.js` - Dynamic Rendering Module (337 lines)

**Main Export:**
```javascript
export async function initializeCards()
```

**Usage:**
```javascript
// In app.js
import * as cards from './cards.js';

async function initializeApp() {
  await cards.initializeCards();
  // Cards are now in DOM
}
```

**Helper Exports:**
```javascript
export function getCards()  // Returns .card[data-guide] elements
export async function rerenderCards(guides)  // Re-render cards
```

### 3. `/js/app.js` - Entry Point (Modified)

**Key Changes:**
```javascript
// Add import
import * as cards from './cards.js';

// Make async
async function initializeApp() {
  // First render cards
  try {
    await cards.initializeCards();
  } catch (error) {
    console.error('Failed to initialize cards:', error);
  }
  
  // Then init other modules
  const cardElements = document.querySelectorAll('.card[data-guide]');
  // ... rest of initialization
}
```

### 4. `/data/guides.json` - Guide Data (256 guides)

**Structure:**
```json
[
  {
    "id": "SUR-01",
    "title": "Water Purification",
    "description": "Essential method...",
    "url": "guides/sur-01-water-purification.html",
    "icon": "💧",
    "category": "zth-modules",
    "tags": ["start-here"]
  },
  // ... 255 more
]
```

**Required Fields:**
- `id` - Unique identifier
- `title` - Display name
- `description` - Short description
- `url` - Link to guide
- `icon` - Emoji icon
- `category` - Category name
- `tags` - Array of tag strings

## How It Works

### 1. Page Loads
```
index.html loads → DOMContentLoaded → initializeApp()
```

### 2. Cards Initialize
```javascript
await cards.initializeCards()
  ├─ fetch('data/guides.json')
  ├─ groupByCategory(guides)
  ├─ For each category:
  │  ├─ createSectionHeading()
  │  └─ For each guide: createCardElement()
  └─ Append all to #guides-container
```

### 3. Card Structure Generated
```html
<a class="card" href="guides/..." data-guide="guide-id" data-tags="tag1 tag2">
  <span class="read-check" aria-hidden="true">✓</span>
  <span class="icon">💧</span>
  <h3>Guide Title</h3>
  <p>Guide description text...</p>
  <span class="tag start-here">Start Here</span>
  <span class="tag critical">Critical</span>
</a>
```

### 4. Other Modules Initialize
```javascript
ui.initializeThemeToggle()
ui.updateProgressDisplay(cardElements)
ui.initializeFilters(cardElements)
search.initializeSearch(cardElements)
achievements.checkAchievements(cardElements)
```

## Critical Code Snippets

### Fetching Data
```javascript
async function fetchGuidesData() {
  const response = await fetch('data/guides.json');
  if (!response.ok) {
    throw new Error(`Failed to fetch guides: ${response.status}`);
  }
  return await response.json();
}
```

### Creating a Card
```javascript
function createCardElement(guide) {
  const card = document.createElement('a');
  card.className = 'card';
  card.href = guide.url || `guides/${guide.id}.html`;
  card.setAttribute('data-guide', guide.id);
  card.setAttribute('data-tags', (guide.tags || []).join(' '));
  
  let html = '<span class="read-check" aria-hidden="true">✓</span>';
  if (guide.icon) html += `<span class="icon">${guide.icon}</span>`;
  if (guide.title) html += `<h3>${escapeHtml(guide.title)}</h3>`;
  if (guide.description) html += `<p>${escapeHtml(guide.description)}</p>`;
  
  for (const tag of (guide.tags || [])) {
    html += `<span class="tag ${tag}">${formatTagText(tag)}</span>`;
  }
  
  card.innerHTML = html;
  return card;
}
```

### HTML Escaping
```javascript
function escapeHtml(text) {
  const map = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'};
  return text.replace(/[&<>"']/g, m => map[m]);
}
```

### Grouping by Category
```javascript
function groupByCategory(guides) {
  const grouped = {};
  for (const guide of guides) {
    const category = guide.category || 'uncategorized';
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(guide);
  }
  return grouped;
}
```

### Category Display
```javascript
function getCategoryDisplay(category) {
  const categoryMap = {
    'zth-modules': { name: 'Core Modules', icon: '🎓' },
    'survival': { name: 'Immediate Survival', icon: '🔥' },
    'medical': { name: 'Medical & Health', icon: '🏥' },
    // ... 11 more
  };
  return categoryMap[category] || { name: category, icon: '📄' };
}
```

## API Reference

### initializeCards()
**Type:** `async function` (export)

**Description:** Fetches guides.json and renders all cards

**Returns:** `Promise<void>`

**Throws:** Error if fetch fails or JSON is invalid

**Side Effects:**
- Populates `#guides-container` with cards
- Dispatches `cardsRendered` event
- Shows error message on failure

**Example:**
```javascript
await cards.initializeCards();
```

### getCards()
**Type:** `function` (export)

**Description:** Returns all rendered card elements

**Returns:** `NodeList` of `.card[data-guide]` elements

**Example:**
```javascript
const cards = cards.getCards();
console.log(`Found ${cards.length} guides`);
```

### rerenderCards(guides)
**Type:** `async function` (export)

**Description:** Re-renders cards with optional guide data

**Parameters:**
- `guides` (Array, optional) - Guide data array. If not provided, fetches from JSON.

**Returns:** `Promise<void>`

**Example:**
```javascript
// Re-render with filtered guides
const filtered = allGuides.filter(g => g.tags.includes('critical'));
await cards.rerenderCards(filtered);
```

## CSS Classes Used

```css
.card              /* Main card element */
.read-check        /* Checkmark span */
.icon              /* Icon span */
.tag               /* Tag span */
.section-heading   /* Category h2 header */
.guides-grid       /* Container grid */
```

## Event System

### Custom Event: cardsRendered

**Description:** Dispatched after cards are fully rendered

**Usage:**
```javascript
window.addEventListener('cardsRendered', () => {
  console.log('Cards are now in the DOM');
  const cardCount = document.querySelectorAll('.card').length;
  console.log(`Rendered ${cardCount} guides`);
});
```

## Data Attributes

Cards are created with these data attributes:

```html
data-guide="guide-id"        <!-- Guide identifier -->
data-tags="tag1 tag2 tag3"   <!-- Space-separated tags -->
```

These are used for filtering and search:

```javascript
// Get all critical guides
const critical = document.querySelectorAll('.card[data-tags~="critical"]');

// Get a specific guide
const guide = document.querySelector('.card[data-guide="SUR-01"]');
```

## Error Handling

### Loading State
```javascript
function showLoadingState() {
  const container = document.getElementById('guides-container');
  if (container) {
    container.innerHTML = '<div class="loading-state">Loading guides...</div>';
  }
}
```

### Error State
```javascript
function showErrorState(message) {
  const container = document.getElementById('guides-container');
  if (container) {
    container.innerHTML = `<div class="error-state">
      <p>Error loading guides: ${escapeHtml(message)}</p>
      <p>Please refresh the page to try again.</p>
    </div>`;
  }
}
```

## Common Issues & Solutions

### Cards Not Appearing
**Check:**
1. Browser console for errors
2. Network tab - guides.json loading?
3. #guides-container exists in DOM
4. JavaScript enabled

### Cards Styled Wrong
**Check:**
1. main.css is loading (Network tab)
2. .card class has proper styles
3. No CSS conflicts

### Search/Filter Not Working
**Check:**
1. Cards have data-guide attribute
2. Cards have data-tags attribute
3. Other modules imported successfully

### Offline Mode Issues
**Check:**
1. Service worker registered
2. guides.json is cached
3. Offline indicator enabled

## Performance Tips

1. guides.json is small (~85 KB), fast to load
2. DOM creation takes ~100-300ms, acceptable
3. CSS selectors for cards are efficient
4. No jQuery required, pure vanilla JS
5. Service worker caches guides.json

## Browser Compatibility

Required Features:
- ES6 Modules (`import/export`)
- Fetch API (`fetch`)
- Promise (`async/await`)
- Template literals (`` `string` ``)

**Compatible Browsers:**
- Chrome 61+
- Firefox 67+
- Safari 11.1+
- Edge 79+

## Testing Checklist

- [ ] Cards load from guides.json
- [ ] All 256 guides render
- [ ] Categories display correctly
- [ ] Icons/tags display properly
- [ ] Click on guide navigates correctly
- [ ] Progress tracking works
- [ ] Search/filter works
- [ ] Works offline (service worker)
- [ ] No console errors
- [ ] Mobile responsive

