# Zero to Hero Survival Compendium — Rebuild From Scratch Plan

This document contains everything needed to rebuild the "Zero to Hero Survival Compendium" web application from scratch, using only the information contained here — no access to the original source code is required.

---

## 1. What This App Is

A fully offline-capable Progressive Web App (PWA) that serves as a comprehensive post-apocalyptic survival knowledge library. It contains 220+ long-form HTML guides organized into ~18 categories covering topics from water purification and fire starting to blacksmithing, radio communication, and community governance. The app tracks user reading progress, supports full-text search, dark/light theming, import/export of progress data, and works entirely without an internet connection once installed.

The domain is `zerotoherohero.com`. The app has zero runtime dependencies — no React, no framework, no build toolchain required for production. It uses vanilla JavaScript ES modules, plain CSS with custom properties, and static HTML files.

---

## 2. Technology Stack

- **Frontend**: Vanilla HTML5, CSS3 (custom properties for theming), ES Modules (no bundler)
- **Backend**: Static file hosting only. A simple Express.js dev server (`server.js`) exists for local testing but is not required for production.
- **PWA**: Service worker (`sw.js`) with multi-cache strategy (core, guides, data, dynamic caches)
- **Data storage**: `localStorage` for user progress/settings/notes; `IndexedDB` for backup/restore safety net
- **Data format**: JSON files in `data/` directory for guide metadata, prerequisite maps, glossary, search index, skill databases, and spreadsheet reference data
- **Build tooling** (optional): Node.js scripts in `scripts/` for minification, search index generation, sitemap generation, metadata enrichment. Not required to run.
- **Testing**: Custom lightweight test runner (`tests/test-runner.js`) — not a framework like Jest

---

## 3. Application Architecture

### 3.1 File Structure to Create

```
/
├── index.html                    # Main SPA entry point
├── manifest.json                 # PWA manifest
├── sw.js                         # Service worker
├── favicon.ico
├── robots.txt
├── server.js                     # Dev server (Express, optional)
├── package.json                  # Dev dependencies only
├── css/
│   └── main.css                  # ~4200 lines, all app styles
├── js/
│   ├── app.js                    # Entry point, orchestrates initialization
│   ├── init.js                   # Immediate DOM handlers (non-module script)
│   ├── config.js                 # Environment detection (dev/staging/prod)
│   ├── storage.js                # localStorage abstraction layer
│   ├── cards.js                  # Dynamic card rendering from guides.json
│   ├── ui.js                     # Theme toggle, filters, back-to-top
│   ├── search.js                 # Quick search with weighted scoring
│   ├── keyboard.js               # Keyboard shortcuts (/, ?, Escape, arrows)
│   ├── notifications.js          # "What's New" badges and sections
│   ├── analytics.js              # Privacy-respecting local analytics
│   ├── import-export.js          # JSON/CSV/Markdown export, IndexedDB backup
│   ├── offline-manager.js        # Selective category caching via Cache API
│   ├── offline-manager-ui.js     # UI modal for offline category management
│   ├── offline-indicator.js      # Online/offline status indicator
│   ├── pwa.js                    # Install prompt, update detection
│   ├── progression.js            # Prerequisite/reading-order/learning-path system
│   ├── progress-viz.js           # Progress visualization (charts)
│   ├── recently-viewed.js        # Recently viewed guides tracking
│   ├── random-guide.js           # Random guide picker
│   ├── text-sizing.js            # Accessible text size adjustment
│   ├── toc.js                    # Table of contents navigation on main page
│   ├── tools-nav.js              # Tools section navigation
│   ├── error-tracking.js         # Client-side error capture
│   ├── error-viewer.js           # Error log viewer UI
│   └── utils.js                  # escapeHtml, sanitize, accessibleEmoji helpers
├── data/
│   ├── guides.json               # Master guide metadata (~220 entries)
│   ├── prerequisite-map.json     # Guide dependency graph
│   ├── reading-order.json        # Recommended reading sequence
│   ├── learning-paths.json       # Curated learning paths (can be empty initially)
│   ├── glossary.json             # 250-term survival glossary
│   ├── search-index.json         # Enriched search index with keywords
│   ├── skills_data.json          # Skills database
│   ├── salvage_data.json         # Salvage/scavenging data
│   └── spreadsheets/             # Reference table data (10 JSON files)
│       ├── climate-terrain-guide.json
│       ├── materials-checklists.json
│       ├── resource-database.json
│       ├── scenario-plans.json
│       ├── seasonal-calendar.json
│       ├── threat-risk-matrix.json
│       ├── trade-barter-guide.json
│       └── ... (others)
├── guides/
│   ├── css/shared.css            # Shared guide page styles
│   ├── js/shared.js              # Shared guide page JS (collapsible TOC, etc.)
│   ├── index.html                # Guide listing page
│   ├── search.html               # Full-text search page
│   ├── reading-order.html        # Recommended reading order page
│   ├── quick-reference.html      # Emergency quick reference
│   └── [guide-name].html         # ~275 individual guide HTML files
├── tools/
│   ├── tools-common.js           # Shared tools JS
│   ├── progress.html             # Progress dashboard
│   ├── stats.html                # Analytics/statistics page
│   ├── tech-tree-v2.html         # D3.js technology tree visualization
│   ├── glossary.html             # Glossary browser
│   ├── combo-projects.html       # Multi-skill project planner
│   ├── scenario-planner.html     # Survival scenario planner
│   ├── skill-assessments.html    # Skill self-assessment tool
│   ├── reference-tables.html     # Interactive reference tables
│   ├── quick-reference-cards.html# Printable quick reference cards
│   ├── visual-diagrams.html      # SVG survival diagrams
│   └── what-can-i-build.html     # "What can I build?" tool
├── assets/
│   ├── icon-*.png                # PWA icons (16, 32, 48, 64, 128, 192, 512)
│   ├── icon-*.webp               # WebP variants
│   └── apple-touch-icon.png
├── shared/
│   ├── calculator.js             # Shared calculator utility
│   └── theme-sync.js             # Cross-page theme synchronization
├── config/
│   ├── dev.json                  # Dev environment config
│   └── prod.json                 # Production config
├── scripts/                      # Build/utility scripts (Node.js)
│   ├── build.js
│   ├── build-search-index.js
│   ├── generate-sitemap.js
│   ├── minify-css.js
│   ├── minify-js.js
│   ├── new-guide.js              # Scaffold a new guide
│   ├── validate.js
│   └── ... (others)
├── tests/
│   ├── test-runner.js
│   ├── storage.test.js
│   ├── search.test.js
│   ├── cards.test.js
│   ├── ui.test.js
│   └── ... (others)
└── docs/                         # Developer documentation
```

### 3.2 Module Loading Strategy

The app uses a two-tier loading approach for performance:

**Critical path (loaded immediately via `app.js`):**
1. `error-tracking.js` + `error-viewer.js` — initialize first to catch errors
2. `config.js` — environment detection
3. `storage.js` — localStorage abstraction
4. `cards.js` — render guide cards from `guides.json`
5. `ui.js`, `keyboard.js`, `offline-indicator.js`, `pwa.js`, `toc.js` — loaded in parallel via dynamic `import()`

**Deferred (loaded after cards render):**
- `analytics.js`, `text-sizing.js`, `import-export.js`, `recently-viewed.js`, `progress-viz.js`, `random-guide.js`, `tools-nav.js`, `notifications.js`, `offline-manager.js`, `offline-manager-ui.js`, `progression.js`

**Lazy-loaded on demand:**
- `search.js` — loaded on first search input focus or mouseenter

Additionally, `init.js` is loaded as a non-module `<script>` (not `type="module"`) for immediate DOM event wiring (dropdown toggles, button handlers) before modules load.

---

## 4. Data Model

### 4.1 Guide Metadata (`data/guides.json`)

Each guide entry:
```json
{
  "id": "GD-023",
  "title": "Survival Basics & First 72 Hours",
  "category": "survival",
  "tags": ["critical"],
  "description": "Shelter building, fire starting, water finding...",
  "icon": "🔥",
  "file": "guides/survival-basics.html",
  "url": "guides/survival-basics.html",
  "difficulty": "beginner",
  "readingTime": 5,
  "wordCount": 1650,
  "lastUpdated": "2026-02-15",
  "version": "1.0",
  "prerequisites": ["GD-232"],
  "relatedSpreadsheet": "scenario-plans.json"
}
```

**Fields**: `id` (unique string), `title`, `category` (one of ~18 categories), `tags` (array: "critical", "essential", "important", "practical", "new", "rebuild", etc.), `description`, `icon` (emoji), `file`/`url` (path to guide HTML), `difficulty` ("beginner"/"intermediate"/"advanced"), `readingTime` (minutes), `wordCount`, `lastUpdated` (ISO date), `version`, `prerequisites` (array of guide IDs), `relatedSpreadsheet` (optional link to data file).

### 4.2 Categories

The 18 guide categories (in display order):
1. `survival` — Immediate Survival 🔥
2. `medical` — Medical & Health 🏥
3. `agriculture` — Food & Agriculture 🌾
4. `building` — Building & Engineering 🔨
5. `crafts` — Crafts & Trade Skills ⚒️
6. `metalworking` — Metalworking ⚒️
7. `communications` — Communications 📡
8. `defense` — Security & Defense 🛡️
9. `sciences` — Foundational Sciences 🔬
10. `chemistry` — Industrial Chemistry 🏭
11. `power-generation` — Power Generation ⚡
12. `transportation` — Transportation 🚗
13. `society` — Society & Culture 🏛️
14. `resource-management` — Resource Management 📦
15. `salvage` — Scavenging & Salvage ♻️
16. `tools` — Tools & Interactive 🛠️
17. `reference` — Master Reference 📚
18. `specialized` — Specialized 🔧

### 4.3 Prerequisite Map (`data/prerequisite-map.json`)

```json
{
  "dependencies": {
    "GD-030": { "requires": ["GD-232"], "title": "Search & Rescue", "icon": "🔍" }
  },
  "unlocks": {
    "GD-232": [{ "id": "GD-030", "title": "Search & Rescue" }]
  }
}
```

Two-way map: `dependencies` tells you what a guide requires; `unlocks` tells you what completing a guide enables.

### 4.4 User Data (localStorage)

| Key | Type | Description |
|-----|------|-------------|
| `compendium-progress` | Object | `{ "GD-023": { completed: true, lastUpdated: "..." } }` |
| `compendium-theme` | String | `"dark"` or `"light"` |
| `compendium-notes-{guideId}` | String | User notes per guide |
| `compendium-achievements` | Object | Achievement tracking |
| `compendium-recent-searches` | Array | Last 5 search queries |
| `app_last_visit_date` | String | YYYY-MM-DD of last visit |
| `guide_last_read_dates` | Object | Map of guide ID → last read date |

---

## 5. Feature Specifications

### 5.1 Main Page (`index.html`)

**Layout (top to bottom):**
1. **Top bar**: Progress counter (X/N read), "Start Here" link, "Emergency" link, theme toggle (☀️/🌙), utilities dropdown (export, import, offline manager, reset, progress link, analytics link)
2. **Hero section**: Title "Zero to Hero Survival Compendium", search bar, "Start Here — Reading Order" button
3. **Filter bar**: Buttons for All, Critical, Essential, Unread, New, + expandable: Rebuild Civ, Completed, Tools, Beginner, Intermediate, Advanced
4. **Table of contents**: Grid of clickable category links (scrolls to section)
5. **Guides grid**: Cards grouped by category under section headings

**Guide cards** are `<a>` elements linking to the guide HTML. Each shows:
- Completion checkmark (✓, green when done)
- Difficulty badge (● Beginner, ◆ Intermediate, ★ Advanced) with color coding
- Emoji icon
- Title (`<h3>`)
- Description (`<p>`)
- Reading time
- Tags (colored chips)
- On hover/focus: prerequisites (with met/unmet status) and "unlocks" section

### 5.2 Theme System

Two themes controlled by `data-theme` attribute on `<html>`:

**Dark theme** (default):
- Background: `#1a2e1a` (dark green)
- Surface: `#2d2416` (dark brown)
- Accent: `#d4a574` (warm gold)
- Text: `#f5f0e8` (warm white)

**Light theme**:
- Background: `#f5f0e8`
- Surface: `#fff`
- Accent: `#8b6f47`
- Text: `#1a2e1a`

Both themes use CSS custom properties (`:root` and `[data-theme="light"]` selectors). Theme persists in localStorage. The `shared/theme-sync.js` module synchronizes theme across guide pages.

### 5.3 Search

**Quick search** (main page hero bar):
- Activated on focus/mouseenter (lazy-loads search module)
- Weighted scoring: title (3x) > tags (2x) > description (1.5x) > keywords (1x)
- Dropdown shows results grouped by category with highlighted match text
- Stores last 5 recent searches; shows them when input is empty on focus
- Keyboard navigation: Arrow keys, Enter to select, Escape to close
- "View all X results →" link to full search page

**Full-text search** (`guides/search.html`):
- Dedicated page for comprehensive search
- Uses `data/search-index.json` for enriched keyword data

### 5.4 Filtering

Filter buttons toggle card visibility using CSS classes (`card-visible`/`card-hidden`). Filters:
- `all` — show everything
- `critical` / `essential` / `new` / `rebuild` — match by tag
- `unread` / `completed` — match by progress status
- `beginner` / `intermediate` / `advanced` — match by difficulty
- `tools` — match by category

Section headings hide when all their cards are hidden. Empty state messages shown when no cards match.

### 5.5 Progress Tracking

- Each guide page marks itself as "completed" when visited (stored in `compendium-progress`)
- Main page top bar shows "X/N read" counter
- Cards show green checkmark when completed
- Progress dashboard (`tools/progress.html`) shows detailed stats
- Analytics page (`tools/stats.html`) shows reading patterns

### 5.6 Import/Export

**Export formats:**
- JSON — full progress + notes + achievements
- CSV — progress data in tabular format
- CSV (notes) — notes export
- Markdown — notes as markdown

**Import:** JSON file upload restores progress

**Auto-backup:** IndexedDB stores periodic backups as safety net. On load, if localStorage is empty but IndexedDB has data, offers to restore.

**Backup reminder:** Periodic reminders to export progress.

### 5.7 Offline / PWA

**Service worker** (`sw.js`) uses 4 named caches:
- `core-v{N}` — app shell (HTML, CSS, JS, icons)
- `guides-v{N}` — guide HTML files
- `data-v{N}` — JSON data files
- `dynamic-v{N}` — on-demand cache for other requests

**Cache strategy:**
- Core files cached on install
- Guides cached on first visit (network-first, fallback to cache)
- Max 300 entries in dynamic cache, 30-day expiry

**Offline manager** lets users selectively cache entire categories for offline reading.

**PWA manifest** enables install-to-homescreen with standalone display, custom icons, and app shortcuts (Search, Random Guide, Tools).

### 5.8 Guide Pages

Each guide is a standalone HTML file in `guides/`. Structure:
- SEO comment with category/difficulty/date
- Loads `guides/css/shared.css` and `guides/js/shared.js`
- Custom inline `<style>` for guide-specific layouts
- Full metadata: Open Graph, canonical URL, description
- Header with title, breadcrumb back to home
- Table of contents (collapsible on mobile via `shared.js`)
- Content: Sections with headings, paragraphs, lists, SVG diagrams inline, tables, code blocks, warning boxes
- "Mark as Read" button
- Related guides links
- Previous/Next navigation

The shared guide CSS uses the same CSS custom property theming system as the main page.

### 5.9 Interactive Tools

Located in `tools/`:

1. **Tech Tree** (`tech-tree-v2.html`) — D3.js force-directed graph showing guide relationships and prerequisites. Users can explore the technology progression tree visually.

2. **Progress Dashboard** (`progress.html`) — Category-by-category progress bars, overall completion percentage, reading streaks.

3. **Statistics** (`stats.html`) — Reading analytics, time-based patterns.

4. **Glossary** (`glossary.html`) — Searchable 250-term survival glossary from `data/glossary.json`.

5. **Scenario Planner** (`scenario-planner.html`) — Select a survival scenario, get recommended guides and checklists.

6. **Skill Assessments** (`skill-assessments.html`) — Self-assessment quizzes for different survival skill areas.

7. **Reference Tables** (`reference-tables.html`) — Interactive tables from `data/spreadsheets/` JSON files.

8. **Quick Reference Cards** (`quick-reference-cards.html`) — Printable summary cards.

9. **Visual Diagrams** (`visual-diagrams.html`) — SVG-based survival diagrams.

10. **What Can I Build?** (`what-can-i-build.html`) — Based on completed guides, shows what projects/items you can now create.

11. **Combo Projects** (`combo-projects.html`) — Multi-skill project suggestions.

### 5.10 Keyboard Shortcuts

- `/` — Focus search bar
- `?` — Open keyboard help modal
- `r` — Random guide
- `Escape` — Close search results/modals
- Arrow keys — Navigate between guide cards
- Enter/Space — Open selected card
- Tab — Standard focus navigation

### 5.11 Accessibility

- Skip-to-content link
- ARIA labels on all interactive elements
- `aria-live` regions for dynamic content (search results, filter counts)
- `aria-expanded` on dropdowns/modals
- Color-blind-safe difficulty icons (●/◆/★) alongside color
- Keyboard-navigable card grid
- Screen reader announcements on filter changes
- Text sizing controls

### 5.12 Notifications / What's New

On return visits, guides updated since last visit get badges. A "What's New" section appears at the top of the guides grid showing recently added or modified guides.

### 5.13 Progression System

Connects multiple systems:
- Reading order (recommended sequence)
- Prerequisites (dependency graph between guides)
- "What's next" recommendations based on completed guides
- Migrates legacy progress data formats

---

## 6. Build Order (Implementation Phases)

### Phase 1: Foundation
1. Create project directory structure
2. Create `index.html` with full semantic HTML structure (skip link, top bar, hero, filter bar, TOC, guides grid, footer, keyboard help modal)
3. Create `css/main.css` with CSS custom properties theming (dark/light), responsive grid layout, card styles, filter bar, hero section, all component styles
4. Create `guides/css/shared.css` with guide page theming and typography
5. Create `data/guides.json` with all ~220 guide entries and full metadata
6. Create `manifest.json` for PWA
7. Generate PWA icon set (16px through 512px)

### Phase 2: Core JavaScript Modules
8. `js/utils.js` — `escapeHtml()`, `sanitize()`, `accessibleEmoji()`, `decorativeEmoji()`
9. `js/config.js` — environment detection, log levels, service worker toggle
10. `js/storage.js` — localStorage CRUD, progress getters/setters, notes, achievements, theme
11. `js/cards.js` — fetch `guides.json`, group by category, render cards with lazy section loading (IntersectionObserver), completion status, difficulty badges, prerequisite/unlock display
12. `js/ui.js` — theme toggle, filter buttons with class-based show/hide, section heading visibility, back-to-top, progress counter
13. `js/search.js` — weighted search scoring, recent searches, keyboard navigation, result grouping and highlighting
14. `js/keyboard.js` — global keyboard shortcuts, card grid arrow-key navigation
15. `js/init.js` — non-module immediate DOM handlers (dropdown toggles, button wiring)
16. `js/app.js` — orchestrator: critical imports → parallel dynamic imports → deferred module loading → service worker registration

### Phase 3: PWA & Offline
17. `sw.js` — service worker with install/activate/fetch handlers, 4-cache strategy, cache versioning, max-entries pruning, stale-while-revalidate for guides
18. `js/pwa.js` — `beforeinstallprompt` handling, update detection
19. `js/offline-indicator.js` — online/offline banner
20. `js/offline-manager.js` — selective category caching via Cache API
21. `js/offline-manager-ui.js` — modal UI for downloading/removing category caches

### Phase 4: Secondary Features
22. `js/notifications.js` — "What's New" badges, last-visit tracking, guide read dates
23. `js/import-export.js` — multi-format export (JSON, CSV, Markdown), file import, IndexedDB auto-backup, restore offers, backup reminders
24. `js/recently-viewed.js` — track and display recently viewed guides
25. `js/analytics.js` — privacy-respecting local analytics (reading time, patterns)
26. `js/text-sizing.js` — accessible text size controls
27. `js/toc.js` — main page table of contents with smooth scroll and force-render for lazy sections
28. `js/tools-nav.js` — tools section navigation
29. `js/progress-viz.js` — progress visualization charts
30. `js/random-guide.js` — random guide picker
31. `js/error-tracking.js` + `js/error-viewer.js` — client error capture and viewer

### Phase 5: Data Files
32. `data/prerequisite-map.json` — bidirectional dependency graph
33. `data/reading-order.json` — recommended sequence
34. `data/glossary.json` — 250-term glossary
35. `data/search-index.json` — enriched search data with keywords
36. `data/skills_data.json`, `data/salvage_data.json`
37. `data/spreadsheets/*.json` — 10 reference data files
38. `js/progression.js` — unified progression system connecting all data

### Phase 6: Guide Pages
39. `guides/js/shared.js` — collapsible TOC on mobile, bookmark panel fixes, "mark as read" button handler, theme sync
40. Create guide HTML template with: header, breadcrumb, TOC, content area, mark-as-read button, related guides, prev/next nav
41. Generate all ~275 guide HTML files following the template, each with unique content, inline SVG diagrams, and metadata

### Phase 7: Interactive Tools
42. `tools/tools-common.js` — shared tool utilities
43. `tools/progress.html` — progress dashboard with category bars
44. `tools/stats.html` — analytics dashboard
45. `tools/tech-tree-v2.html` — D3.js force-directed tech tree (load D3 from CDN)
46. `tools/glossary.html` — searchable glossary browser
47. `tools/scenario-planner.html` — scenario selection + guide recommendations
48. `tools/skill-assessments.html` — self-assessment quizzes
49. `tools/reference-tables.html` — interactive data tables from spreadsheets JSON
50. `tools/quick-reference-cards.html` — printable cards
51. `tools/visual-diagrams.html` — SVG diagram gallery
52. `tools/what-can-i-build.html` — project suggestions based on progress
53. `tools/combo-projects.html` — multi-skill projects

### Phase 8: Build Scripts & Testing
54. `scripts/build-search-index.js` — extract keywords from guide HTML for search
55. `scripts/generate-sitemap.js` — generate `sitemap.xml`
56. `scripts/minify-css.js` / `scripts/minify-js.js` — production minification
57. `scripts/validate.js` — validate guide metadata and HTML
58. `scripts/new-guide.js` — scaffold new guide from template
59. `tests/test-runner.js` — lightweight test framework
60. Write unit tests for storage, search, cards, UI, import/export modules

### Phase 9: Polish & SEO
61. Add Content Security Policy meta tag
62. Add Open Graph and Twitter Card meta tags
63. Generate `sitemap.xml`
64. Add `robots.txt`
65. Optimize all images (PNG + WebP variants)
66. Performance audit: ensure lazy loading, code splitting, and caching work correctly
67. Accessibility audit: screen reader testing, keyboard navigation testing

---

## 7. Critical Implementation Details

### 7.1 Lazy Section Rendering

Cards are NOT all rendered at once. Only the first 3 category sections render eagerly. Remaining sections use `IntersectionObserver` with `rootMargin: '300px 0px'` to render 300px before becoming visible. Placeholder heights are calculated as `Math.ceil(guideCount / 3) * 220px`. The TOC module must call `forceRenderSection(category)` before smooth-scrolling to a section.

### 7.2 Service Worker Cache Versioning

The service worker uses a version string (e.g., `v21`) appended to cache names. On activate, it deletes all caches that don't match the current version. The core cache contains all app shell files. Guides are cached network-first with cache fallback.

### 7.3 Card Rendering

Cards are `<a>` elements (not divs with click handlers) for native link behavior and accessibility. Each card carries data attributes: `data-guide`, `data-tags`, `data-category`, `data-difficulty`, `data-prerequisites`. The card's `aria-label` includes title, difficulty, completion status, and description.

### 7.4 XSS Prevention

All user-generated content (notes, search queries) is sanitized via `utils.js` `sanitize()` and `escapeHtml()` before insertion into the DOM. The Content Security Policy header restricts script sources to 'self' only.

### 7.5 Filter System

Filters use CSS class toggling (`card-visible`/`card-hidden`) rather than `display:none` to enable CSS transitions. Section headings are hidden when all their child cards are hidden. An empty state message appears when no cards match.

### 7.6 Module Communication

Modules communicate via:
- Direct imports (module dependencies)
- Custom events on `window` (`cardsRendered`, `cardsRerendered`, `app-error`)
- `window` global functions for cross-module calls from `init.js` (e.g., `window.exportProgress`, `window.offlineManagerUI`)

---

## 8. Visual Design Specification

### 8.1 Typography
- Primary font: `Georgia, 'Times New Roman', serif` (no web fonts to load)
- Body line-height: 1.7
- Guide content optimized for long-form reading

### 8.2 Color Palette
- **Dark theme**: Military/survival aesthetic — dark greens (#1a2e1a), earthy browns (#2d2416), warm gold accents (#d4a574, #b8956a)
- **Light theme**: Warm paper tones — cream (#f5f0e8), white, muted gold (#8b6f47), forest green accents (#4a6d4a)
- **Accent colors**: Red for warnings (#c94444), green for success/completion (#4a6d4a)

### 8.3 Layout
- Max-width container: 1200px centered
- Card grid: `auto-fill, minmax(300px, 1fr)` with ~1rem gap
- Mobile-first responsive design
- Top bar is fixed/sticky navigation

### 8.4 Card Design
- Rounded corners (8px)
- Surface background color with subtle border
- Hover: slight lift/shadow effect
- Completed cards: muted/overlay with green checkmark
- Difficulty badges: color-coded (green/yellow/red) with shape icons for colorblind users

---

## 9. Content Scope

The app contains approximately:
- 275 guide HTML files (220+ active, ~30 archived)
- 53,000+ total lines of guide HTML content
- 700+ inline SVG diagrams within guides
- 10 reference data spreadsheet JSON files
- 250-term glossary
- 18 content categories
- 3 difficulty levels
- Content tags: critical, essential, important, practical, new, rebuild, technology, human, medical, winter

Guide topics span: water purification, fire starting, shelter building, first aid, agriculture, animal husbandry, blacksmithing, metalworking, electricity, radio communications, navigation, governance, economics, medicine, surgery, dentistry, chemistry, engineering, and dozens more.

---

## 10. Dev Server

For local development, a minimal Express server:
```javascript
const express = require('express');
const app = express();
app.use(express.static('.'));
app.use(express.json());
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));
app.listen(3000);
```

No build step required for development — just serve static files.

---

## 11. Deployment

The app is purely static. Deploy by uploading all files to any static hosting (Netlify, Vercel, GitHub Pages, S3+CloudFront, etc.). The only server-side requirement is correct MIME types for `.js` files (`application/javascript`) to support ES modules.

Ensure the service worker scope covers the entire site root. HTTPS is required for service worker registration in production.
