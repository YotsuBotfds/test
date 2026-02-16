# Parallel Agent Implementation Plan — UX Upgrade

**Source:** `ZTH_UX_Deep_Dive_2026.md`
**Strategy:** 5 independent agents running in parallel, each owning a domain of UX fixes. Designed to run AFTER content revisions and the existing audit remediation plan complete.
**Prerequisite:** The audit remediation plan (`ZTH_Audit_Implementation_Plan.md`) should be complete first — that plan already handles SEO, performance critical-path, basic a11y (heading hierarchy, form labels, keyboard modal), security, skeleton loading states, and code quality. This plan picks up where that one leaves off and focuses on UX-specific improvements that go beyond bug fixes into genuine experience upgrades.

---

## Scope — What's New vs. Already Covered

| Finding | Covered by Audit Plan? | This Plan? |
|---|---|---|
| ERR-1: Error recovery UI | Yes (Agent 5) | No |
| A11Y-1: Heading hierarchy | Yes (Agent 3) | No |
| CARD-1: Skeleton loaders | Yes (Agent 5) | No |
| NAV-1: Prev/next guide navigation | **No** | **Agent 1** |
| NAV-2: Sticky header on guides | **No** | **Agent 1** |
| SEARCH-1: Content-aware search | **No** | **Agent 2** |
| SEARCH-2: "View all results" link | **No** | **Agent 2** |
| SEARCH-3: Blur race condition | **No** | **Agent 2** |
| CARD-2: Card progressive disclosure | **No** | **Agent 3** |
| CARD-4: Category visual separation | **No** | **Agent 3** |
| INT-1: Page transition feedback | **No** | **Agent 1** |
| INT-2: Filter animations | **No** | **Agent 3** |
| INT-3: What's New default expanded | **No** | **Agent 3** |
| MOBILE-1: Top bar responsive collapse | **No** | **Agent 4** |
| MOBILE-2: Touch targets | **No** | **Agent 4** |
| MOBILE-3: Font-size on mobile | **No** | **Agent 4** |
| VIS-1: Typography scale | **No** | **Agent 4** |
| A11Y-2: Card aria-label | **No** | **Agent 3** |
| A11Y-3: Emoji text alternatives | Partial (Agent 3) | **Agent 5** |
| A11Y-4: aria-expanded sync | **No** | **Agent 2** |
| A11Y-5: Color-only difficulty | **No** | **Agent 5** |
| PWA-1: Install prompt | **No** | **Agent 5** |
| PWA-2: Offline indicator | **No** | **Agent 5** |
| ERR-2: Empty filter states | **No** | **Agent 3** |
| ERR-3: Search blur race | **No** | **Agent 2** |
| DATA-2: Backup reminders | **No** | **Agent 5** |

---

## Agent Overview

| Agent | Domain | Files Touched | Est. Scope | Dependencies |
|---|---|---|---|---|
| **Agent 1** | Guide Page Navigation & Transitions | `guides/*.html`, `js/guide-helper.js`, `shared/`, `css/` | ~275 guide files + 4 JS/CSS + index cleanup | None |
| **Agent 2** | Search UX Upgrade | `js/search.js`, `data/search-index.json`, `index.html`, `css/main.css` | ~5 files + 1 new build script | None |
| **Agent 3** | Card Grid & Filter UX | `js/cards.js`, `js/ui.js`, `js/notifications.js`, `css/main.css` | ~5 files | None |
| **Agent 4** | Mobile & Typography | `css/main.css`, `index.html` | ~2 files | None |
| **Agent 5** | PWA, Accessibility Polish & Data UX | `js/pwa.js`, `js/offline-indicator.js`, `js/import-export.js`, `css/main.css`, `index.html` | ~6 files | None |

---

## Agent 1: Guide Page Navigation & Transitions

**Priority:** Critical + High
**Addresses:** NAV-1, NAV-2, INT-1

This agent transforms the guide reading experience from isolated pages into a connected flow.

### Tasks

1. **Build a prev/next navigation system for guide pages**
   - Create `js/guide-nav.js` module that:
     - On guide page load, fetches `data/reading-order.json` and `data/guides.json` (with caching — these are likely already in the service worker cache)
     - Determines the current guide's position within its category and within the reading order
     - Renders a prev/next bar at both the TOP (below breadcrumb) and BOTTOM (above related guides) of the guide
   - Navigation bar HTML structure:
     ```html
     <nav class="guide-nav" aria-label="Guide navigation">
       <a href="prev-guide.html" class="guide-nav-prev">
         <span class="guide-nav-label">← Previous</span>
         <span class="guide-nav-title">Fire Starting</span>
       </a>
       <a href="index.html#sec-category" class="guide-nav-index">
         <span class="guide-nav-label">Category</span>
         <span class="guide-nav-title">Immediate Survival</span>
       </a>
       <a href="next-guide.html" class="guide-nav-next">
         <span class="guide-nav-label">Next →</span>
         <span class="guide-nav-title">Water Purification</span>
       </a>
     </nav>
     ```
   - Support two navigation modes toggled by a small control:
     - **Category order** (default): prev/next within the same category
     - **Reading order**: follows the recommended reading sequence from reading-order.json
   - Handle edge cases: first guide in category (no prev), last guide (no next), guides not in reading order
   - Files: new `js/guide-nav.js`, new CSS in guide stylesheet

2. **Add a sticky mini-header to guide pages**
   - Create a sticky bar that appears after scrolling past the H1:
     ```html
     <div class="guide-sticky-header" aria-hidden="true">
       <a href="index.html" class="guide-sticky-back">← Back</a>
       <span class="guide-sticky-title">Guide Title</span>
       <span class="guide-sticky-progress">32%</span>
     </div>
     ```
   - Uses `IntersectionObserver` on the H1 to show/hide (no scroll event listener for performance)
   - Shows a reading progress percentage based on scroll position
   - Thin bar (40px height), minimal visual weight, background matches theme
   - File: `js/guide-nav.js` (same module), guide CSS

3. **Add page transition feedback**
   - In `js/guide-nav.js` and in `js/cards.js` (for index→guide transitions):
     - On link click, add a CSS class to `<body>` that triggers a quick fade-out (150ms opacity transition)
     - On guide page load, body starts with `opacity: 0` and fades in (150ms)
   - Respect `prefers-reduced-motion`: skip animation entirely
   - Implementation: Add `page-transitioning` class to body on click, CSS handles the rest
   - Files: `js/guide-nav.js`, `js/cards.js` (add click interceptor), `css/main.css` (transition styles)

4. **Remove `/guides/index.html` and update all references to point to root `index.html`**
   - Delete `guides/index.html` if it exists
   - Write a script `scripts/fix-index-references.js` that:
     - Scans all `guides/*.html` files for links to `index.html` (which, from inside `/guides/`, resolves to `/guides/index.html`)
     - Replaces `href="index.html"` with `href="../index.html"` in guide pages (breadcrumbs, nav links, related guides sections)
     - Also scans `shared/`, `js/`, and `tools/` for any JS references that construct URLs pointing to `guides/index.html`
     - Scans root `index.html` to ensure it doesn't reference `guides/index.html`
   - Verify: grep the entire project for `guides/index.html` — should return 0 results after the fix
   - Files: delete `guides/index.html`, new `scripts/fix-index-references.js`, `guides/*.html`

5. **Inject the guide-nav script into all guide pages**
   - Write a Node.js script `scripts/add-guide-nav.js` that:
     - Reads each guide HTML file
     - Checks if `guide-nav.js` script tag already exists
     - If not, adds `<script type="module" src="../js/guide-nav.js"></script>` before `</body>`
     - Also adds a `<div id="guide-nav-top"></div>` after the breadcrumb and `<div id="guide-nav-bottom"></div>` before the related guides section (the JS will populate these)
   - Run against all ~275 guide files
   - Files: new `scripts/add-guide-nav.js`, `guides/*.html`

### CSS additions (guide pages)
```css
/* Sticky guide header */
.guide-sticky-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.4rem 1.5rem;
  font-size: 0.85rem;
  opacity: 0;
  transform: translateY(-100%);
  transition: opacity 0.2s, transform 0.2s;
}
.guide-sticky-header.visible {
  opacity: 1;
  transform: translateY(0);
}

/* Prev/Next nav */
.guide-nav {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 1rem;
  padding: 1rem 0;
  border-top: 1px solid var(--border);
  margin: 1.5rem 0;
}
.guide-nav-prev { text-align: left; }
.guide-nav-next { text-align: right; }
.guide-nav-index { text-align: center; }
.guide-nav a {
  text-decoration: none;
  color: var(--text);
  transition: color 0.2s;
}
.guide-nav a:hover { color: var(--accent); }
.guide-nav-label {
  display: block;
  font-size: 0.75rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.guide-nav-title {
  display: block;
  font-weight: 600;
  font-size: 0.9rem;
  margin-top: 0.25rem;
}

/* Page transitions */
body.page-transitioning {
  opacity: 0;
  transition: opacity 150ms ease-out;
}
body.page-entering {
  animation: fadeIn 150ms ease-in forwards;
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

@media (prefers-reduced-motion: reduce) {
  body.page-transitioning,
  body.page-entering,
  .guide-sticky-header { transition: none; animation: none; }
}

/* Mobile: stack prev/next vertically */
@media (max-width: 600px) {
  .guide-nav {
    grid-template-columns: 1fr;
    gap: 0.5rem;
  }
  .guide-nav-prev, .guide-nav-next, .guide-nav-index {
    text-align: center;
  }
}
```

### Verification
- Grep for `guides/index.html` across the entire project — confirm 0 results
- Confirm `guides/index.html` no longer exists
- Click breadcrumb "Home" links on 5 random guides — confirm they navigate to root `/index.html`
- Navigate through 5+ guides using prev/next — confirm correct ordering within categories
- Switch to reading order mode — confirm it follows reading-order.json
- Scroll past H1 on a long guide — confirm sticky header appears
- Check mobile layout — confirm prev/next stacks vertically
- Test with `prefers-reduced-motion` — confirm no animations
- Verify first/last guides in a category handle edge cases gracefully

---

## Agent 2: Search UX Upgrade

**Priority:** High + Medium
**Addresses:** SEARCH-1, SEARCH-2, SEARCH-3, A11Y-4, ERR-3

This agent transforms search from metadata-only autocomplete into a meaningful content discovery tool.

### Tasks

1. **Build a search index that includes guide content keywords**
   - Create `scripts/build-search-index.js` that:
     - Reads each guide HTML, strips tags, extracts text
     - For each guide, creates an entry with: `id`, `title`, `description`, `tags`, `category`, `keywords` (top 30 TF-IDF terms from body text, excluding stopwords)
     - Writes `data/search-index.json` (~50-80KB estimated)
   - The index should be compact — only keywords, not full text (full-text search stays on the dedicated search page)
   - Add a `make search-index` target to the Makefile
   - Files: new `scripts/build-search-index.js`, new `data/search-index.json`, `Makefile`

2. **Update search.js to use the enriched index**
   - Modify `buildGuideData()` to accept the enriched index format with `keywords` field
   - Update `performSearch()` to search `keywords` in addition to title/description/tags
   - Scoring: title match (weight 3x) > tag match (2x) > description match (1.5x) > keyword match (1x)
   - Sort results by score descending instead of first-match order
   - File: `js/search.js`

3. **Add "View all X results" link when results are truncated**
   - In `renderResults()`, after rendering the 8 max results:
     - Calculate total match count (before `.slice(0, maxResults)`)
     - If total > maxResults, append a footer link:
       ```html
       <a href="guides/search.html?q=QUERY" class="search-view-all">
         View all X results →
       </a>
       ```
   - Style the link with accent color, centered, border-top separator
   - File: `js/search.js`, `css/main.css`

4. **Fix the blur race condition**
   - Replace the 200ms `setTimeout` blur handler with a `pointerdown`-based approach:
     ```js
     // Instead of:
     searchInput.addEventListener('blur', () => {
       setTimeout(() => searchResults.classList.remove('active'), 200);
     });

     // Use:
     let isInteractingWithResults = false;
     searchResults.addEventListener('pointerdown', () => {
       isInteractingWithResults = true;
     });
     searchInput.addEventListener('blur', () => {
       if (!isInteractingWithResults) {
         searchResults.classList.remove('active');
         searchInput.setAttribute('aria-expanded', 'false');
       }
       isInteractingWithResults = false;
     });
     ```
   - This eliminates timing-dependent click failures entirely
   - File: `js/search.js`

5. **Synchronize `aria-expanded` with dropdown state**
   - In `renderResults()` and `showRecentSearches()`, add:
     ```js
     searchInput.setAttribute('aria-expanded', 'true');
     ```
   - In all close paths (blur, Escape, result click), add:
     ```js
     searchInput.setAttribute('aria-expanded', 'false');
     ```
   - Ensure the search results container has `role="listbox"` and each result has `role="option"` for proper screen reader announcements
   - File: `js/search.js`

### CSS additions
```css
.search-view-all {
  display: block;
  padding: 10px 16px;
  text-align: center;
  color: var(--accent);
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
  border-top: 1px solid var(--border);
  transition: background 0.1s;
}
.search-view-all:hover {
  background: var(--card);
}
```

### Verification
- Search for a term that only appears in guide body text (e.g., "potassium permanganate") — confirm it appears in results
- Search for "water" — confirm results are ranked by relevance, not insertion order
- Search for a broad term — confirm "View all X results" link appears and navigates correctly
- Click a search result rapidly — confirm no race condition / dropped clicks
- Tab through search with screen reader — confirm `aria-expanded` toggles and results announce as listbox options

---

## Agent 3: Card Grid & Filter UX

**Priority:** High + Medium
**Addresses:** CARD-2, CARD-4, CARD-5, A11Y-2, INT-2, INT-3, ERR-2

This agent improves the main index browsing experience.

### Tasks

1. **Implement progressive disclosure on cards**
   - In `createCardElement()` in `js/cards.js`:
     - Wrap prerequisites and unlocks sections in a `<div class="card-details">` container
     - This container is hidden by default and revealed on card hover/focus
   - CSS approach (no JS needed for the toggle):
     ```css
     .card-details {
       max-height: 0;
       overflow: hidden;
       opacity: 0;
       transition: max-height 0.25s ease, opacity 0.2s ease;
     }
     .card:hover .card-details,
     .card:focus-within .card-details {
       max-height: 200px;
       opacity: 1;
     }
     ```
   - On mobile (touch), details are always visible (since hover doesn't work reliably):
     ```css
     @media (hover: none) {
       .card-details { max-height: none; opacity: 1; }
     }
     ```
   - File: `js/cards.js`, `css/main.css`

2. **Add `aria-label` to cards for screen readers**
   - In `createCardElement()`, set a concise aria-label on the `<a>` card element:
     ```js
     const diffLabel = guide.difficulty ? `, ${guide.difficulty} difficulty` : '';
     const readLabel = isCompleted ? ', completed' : '';
     card.setAttribute('aria-label',
       `${guide.title}${diffLabel}${readLabel}. ${guide.description || ''}`
     );
     ```
   - Add `aria-hidden="true"` to the `.read-check`, `.difficulty-badge`, `.tag`, `.prerequisites`, and `.unlocks-section` elements inside the card (since the label already conveys key info)
   - File: `js/cards.js`

3. **Add stronger visual separation between categories**
   - In `css/main.css`, update `.section-heading`:
     ```css
     .section-heading {
       margin: 3rem 0 1.25rem;
       padding-top: 1.5rem;
       border-top: 2px solid var(--border);
     }
     .section-heading:first-of-type {
       border-top: none;
       margin-top: 1.5rem;
     }
     ```
   - Optionally add a subtle background shift to alternating category sections (using `:nth-of-type(even)` on `.card-section` wrapper)
   - File: `css/main.css`

4. **Add completed card visual distinction**
   - In `css/main.css`:
     ```css
     .card.completed {
       border-left: 3px solid var(--color-success);
       opacity: 0.85;
     }
     .card.completed:hover {
       opacity: 1;
     }
     ```
   - In `js/cards.js`, add `card.classList.add('completed')` when the guide is in the user's completed set
   - File: `js/cards.js`, `css/main.css`

5. **Add animated filter transitions**
   - Replace `card.style.display = 'none'` / `''` in `js/ui.js` with a class-based approach:
     ```js
     // Instead of:
     card.style.display = show ? '' : 'none';

     // Use:
     if (show) {
       card.classList.remove('card-hidden');
       card.classList.add('card-visible');
     } else {
       card.classList.remove('card-visible');
       card.classList.add('card-hidden');
     }
     ```
   - CSS:
     ```css
     .card-visible {
       opacity: 1;
       transform: scale(1);
       transition: opacity 0.2s ease, transform 0.2s ease;
     }
     .card-hidden {
       opacity: 0;
       transform: scale(0.95);
       position: absolute;
       pointer-events: none;
       visibility: hidden;
       transition: opacity 0.15s ease, transform 0.15s ease;
     }
     ```
   - After transition completes, the `.card-hidden` items are effectively removed from layout flow
   - Respect reduced-motion: skip animation
   - File: `js/ui.js`, `css/main.css`

6. **Default "What's New" to expanded**
   - In `js/notifications.js`, change `createWhatsNewSection()`:
     - Start with `content.classList.add('expanded')` and `toggleBtn.setAttribute('aria-expanded', 'true')`
     - After first interaction (collapse), set a localStorage flag `whats-new-collapsed`
     - On subsequent visits, check the flag to determine initial state
   - File: `js/notifications.js`

7. **Add empty states for filtered results**
   - In `js/ui.js`, after filtering, if no cards are visible, inject an empty state message into `#guides-container`:
     ```js
     const emptyMessages = {
       'completed': '📖 No completed guides yet — start with the Reading Order!',
       'unread': '🎉 You\'ve read everything! Amazing!',
       'new': '✨ No new guides since your last visit.',
       'critical': '✅ No critical guides match the current view.',
       'beginner': '🌱 No beginner guides in this view.',
       'intermediate': '⚡ No intermediate guides in this view.',
       'advanced': '🎯 No advanced guides in this view.',
       default: 'No guides match this filter.'
     };
     ```
   - Render as a centered, muted-text block with appropriate icon
   - File: `js/ui.js`, `css/main.css`

### Verification
- Hover over a card — confirm prerequisites/unlocks animate in smoothly
- Tab to a card with keyboard — confirm details appear on focus
- Use screen reader — confirm card announces concise label, not full content
- Toggle between filters — confirm smooth fade transitions
- Filter to "Completed" with no progress — confirm empty state message appears
- Check "What's New" on first visit with new guides — confirm section starts expanded
- Scroll through categories — confirm stronger visual separators between sections

---

## Agent 4: Mobile & Typography

**Priority:** High + Medium
**Addresses:** MOBILE-1, MOBILE-2, MOBILE-3, VIS-1, VIS-2, NAV-4

This agent makes the app comfortable on phones and improves readability across all devices.

### Tasks

1. **Fix the mobile top bar overflow**
   - Restructure the top bar for mobile with a hamburger-like pattern:
     ```css
     @media (max-width: 600px) {
       .top-bar {
         flex-wrap: wrap;
         padding: 0.5rem 1rem;
       }
       .top-bar-right {
         gap: 0.5rem;
       }
       /* Hide "Start Here" and "Emergency" text, show in utils menu instead */
       .top-bar-right > a[href*="reading-order"],
       .top-bar-right > a[href*="quick-reference"] {
         font-size: 0;
         padding: 6px 8px;
       }
       .top-bar-right > a[href*="reading-order"]::before { content: '📖'; font-size: 1.1rem; }
       .top-bar-right > a[href*="quick-reference"]::before { content: '🚨'; font-size: 1.1rem; }
     }
     ```
   - Alternative: at mobile widths, move "Start Here" and "Emergency" links into the utils dropdown and show only the essential controls (progress, theme, utils) in the top bar
   - The key constraint: keep the top bar to a single line on mobile
   - File: `css/main.css`, possibly `index.html` if structural changes needed

2. **Increase touch targets on mobile**
   - Update mobile media queries:
     ```css
     @media (max-width: 600px) {
       .filter-btn {
         min-height: 44px;
         min-width: 44px;
         padding: 0.5rem 0.75rem;
         font-size: 0.8rem;
       }
       .category-bar-btn {
         min-height: 44px;
         padding: 0.5rem 0.6rem;
       }
       .top-bar a, #theme-toggle, .utils-toggle {
         min-height: 44px;
         min-width: 44px;
         display: inline-flex;
         align-items: center;
         justify-content: center;
       }
     }
     ```
   - File: `css/main.css`

3. **Fix the mobile font-size issue**
   - Remove or revise the `@media (max-width: 480px) { html { font-size: 14px; } }` rule
   - Keep root at 16px on all screen sizes
   - Instead, reduce specific element sizes (hero heading, section labels) directly:
     ```css
     @media (max-width: 480px) {
       /* DO NOT reduce root font-size */
       .hero h1 { font-size: 1.3rem; }
       .section-heading { font-size: 0.85rem; }
       .container { padding: 1rem; }
     }
     ```
   - File: `css/main.css`

4. **Bump the base typography scale**
   - Increase `--font-size-base` from `0.8rem` to `0.9rem`
   - Proportionally adjust the scale:
     ```css
     --font-size-xs: 0.75rem;   /* was 0.7rem */
     --font-size-sm: 0.8rem;    /* was 0.75rem */
     --font-size-base: 0.9rem;  /* was 0.8rem */
     --font-size-md: 0.95rem;   /* was 0.85rem */
     --font-size-lg: 1rem;      /* was 0.9rem */
     --font-size-xl: 1.1rem;    /* was 1rem */
     --font-size-2xl: 1.2rem;   /* was 1.1rem */
     --font-size-3xl: 1.3rem;   /* was 1.15rem */
     ```
   - Audit all direct `font-size` declarations in the CSS to ensure they use variables (not hardcoded values that would be missed)
   - File: `css/main.css`

5. **Introduce a secondary interactive color to reduce accent overuse**
   - Add `--interactive` and `--interactive-hover` variables:
     ```css
     :root {
       --interactive: #b8956a;     /* slightly muted gold */
       --interactive-hover: #d4a574; /* existing accent */
     }
     [data-theme="light"] {
       --interactive: #6b8f4a;     /* muted olive green */
       --interactive-hover: #4a6d4a;
     }
     ```
   - Use `--interactive` for: filter button active state, category bar active, back-to-top button
   - Keep `--accent` for: headings, hero CTA, focus rings, card hover borders (the "important" uses)
   - This creates a visual hierarchy between "interactive" and "emphasis"
   - File: `css/main.css`

6. **Adjust back-to-top threshold**
   - Change from `scrollY > 400` to `scrollY > window.innerHeight` (one viewport height)
   - File: `js/ui.js`

### Verification
- Test on 375px width (iPhone SE): confirm top bar is single-line, all tap targets ≥ 44px
- Test on 414px width (iPhone 12): confirm comfortable font sizes, no text smaller than ~14px
- Read a long guide on mobile: confirm body text is readable without zooming
- Compare desktop before/after: confirm accent vs. interactive color differentiation is visible
- Test back-to-top: confirm it doesn't appear until you've scrolled past one full screen

---

## Agent 5: PWA, Accessibility Polish & Data UX

**Priority:** Medium
**Addresses:** PWA-1, PWA-2, A11Y-3, A11Y-5, DATA-2, INT-4

This agent handles the "polish" layer — things that make the app feel professional and trustworthy.

### Tasks

1. **Add PWA install prompt banner**
   - In `js/pwa.js`, capture the `beforeinstallprompt` event:
     ```js
     let deferredPrompt = null;

     window.addEventListener('beforeinstallprompt', (e) => {
       e.preventDefault();
       deferredPrompt = e;

       // Don't show if user already dismissed
       if (localStorage.getItem('pwa-install-dismissed')) return;

       showInstallBanner();
     });
     ```
   - Create a dismissible banner at the top of the page:
     ```html
     <div class="install-banner" role="alert">
       <span>📥 Install this app for full offline access</span>
       <button class="install-banner-btn">Install</button>
       <button class="install-banner-dismiss" aria-label="Dismiss">×</button>
     </div>
     ```
   - "Install" triggers `deferredPrompt.prompt()`, "Dismiss" sets localStorage flag and hides for 30 days
   - File: `js/pwa.js`, `css/main.css`

2. **Improve offline indicator visibility**
   - In `js/offline-indicator.js`, when offline, show a persistent thin bar below the top-bar:
     ```html
     <div class="offline-bar" role="status">
       ✈️ You're offline — all cached guides are available
     </div>
     ```
   - Style with a subtle but noticeable background (e.g., `rgba(212, 165, 116, 0.15)` with accent left border)
   - When back online, show a brief "You're back online" toast and hide the bar
   - File: `js/offline-indicator.js`, `css/main.css`

3. **Add text alternatives for meaningful emoji**
   - Create a utility function in `js/utils.js`:
     ```js
     export function accessibleEmoji(emoji, label) {
       return `<span role="img" aria-label="${escapeHtml(label)}">${emoji}</span>`;
     }
     export function decorativeEmoji(emoji) {
       return `<span aria-hidden="true">${emoji}</span>`;
     }
     ```
   - Update emoji usage in:
     - `js/cards.js`: card icons → `accessibleEmoji(guide.icon, guide.title)`
     - `js/notifications.js`: badges → `decorativeEmoji('✨')`
     - `js/ui.js`: theme toggle → `decorativeEmoji('☀️')` / `decorativeEmoji('🌙')`
   - For `index.html` static emoji (📈, 📖, 🚨, ⚙️), wrap with appropriate `aria-label` or `aria-hidden`
   - Files: `js/utils.js`, `js/cards.js`, `js/notifications.js`, `js/ui.js`, `index.html`

4. **Add icons to difficulty badges for color-blind users**
   - In `createCardElement()` in `js/cards.js`, prepend a shape icon to the difficulty label:
     ```js
     const difficultyIcons = {
       beginner: '●',      // filled circle
       intermediate: '◆',  // diamond
       advanced: '★'       // star
     };
     const icon = difficultyIcons[guide.difficulty] || '';
     innerHTML += `<span class="difficulty-badge difficulty-${guide.difficulty}">${icon} ${difficultyLabel}</span>`;
     ```
   - File: `js/cards.js`

5. **Add periodic backup reminder**
   - In `js/import-export.js`, after loading progress:
     - Check total completed count and last export date (stored in localStorage `last-export-date`)
     - If completed > 20 AND (no export ever OR last export > 30 days ago):
       - Show a non-blocking toast: "You've completed X guides! Consider exporting your progress as a backup. [Export Now]"
     - The "Export Now" button in the toast triggers the export function and updates the timestamp
   - File: `js/import-export.js`, `js/notifications.js` (for toast rendering)

6. **Expand toast notification usage**
   - Add toast feedback for key actions:
     - Guide marked as complete: "✅ Guide completed! X/Y total"
     - Progress exported: "📤 Progress exported successfully"
     - Progress imported: "📥 Progress imported — X guides restored"
     - Offline cache updated: "📥 Category cached for offline use"
   - Create a `showToast(message, duration = 3000)` function in `js/notifications.js` if one doesn't exist
   - Wire it into: `guide-helper.js` (completion), `import-export.js` (export/import), `offline-manager.js` (cache events)
   - File: `js/notifications.js`, `js/guide-helper.js`, `js/import-export.js`, `js/offline-manager.js`

### CSS additions
```css
/* Install banner */
.install-banner {
  align-items: center;
  background: rgba(212, 165, 116, 0.1);
  border-bottom: 1px solid var(--accent);
  display: flex;
  gap: 1rem;
  justify-content: center;
  padding: 0.6rem 1.5rem;
  font-size: 0.9rem;
}
.install-banner-btn {
  background: var(--accent);
  border: none;
  border-radius: var(--border-radius-sm);
  color: #fff;
  cursor: pointer;
  font-weight: 700;
  padding: 0.4rem 1rem;
}
.install-banner-dismiss {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 1.2rem;
  padding: 0.25rem;
}

/* Offline bar */
.offline-bar {
  background: rgba(212, 165, 116, 0.1);
  border-left: 3px solid var(--accent);
  color: var(--text);
  font-size: 0.85rem;
  padding: 0.4rem 1.5rem;
  text-align: center;
}

/* Toast notification */
.toast {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--border-radius-md);
  bottom: 2rem;
  box-shadow: var(--shadow-md);
  color: var(--text);
  font-size: 0.9rem;
  left: 50%;
  max-width: 400px;
  padding: 0.75rem 1.25rem;
  position: fixed;
  transform: translateX(-50%) translateY(100px);
  transition: transform 0.3s ease;
  z-index: 1000;
}
.toast.visible {
  transform: translateX(-50%) translateY(0);
}
@media (prefers-reduced-motion: reduce) {
  .toast { transition: none; }
}
```

### Verification
- On a supporting browser, confirm install banner appears on first visit and can be dismissed
- Disconnect network — confirm offline bar appears below nav
- Reconnect — confirm "back online" toast appears
- Use screen reader on index page — confirm emoji are announced correctly or hidden
- Check difficulty badges — confirm shape icons appear alongside color
- Complete 25+ guides without exporting — confirm backup reminder toast appears
- Mark a guide complete — confirm toast notification fires

---

## Execution Order

⚠️ **Agent 1 modifies `guides/*.html` and MUST NOT run while content revision agents are editing those same files.** Agents 2–5 are safe to run in parallel with content revisions since they only touch JS, CSS, and index.html.

```
  ┌─ PHASE 1: Run in parallel with content revisions ──────────────┐
  │                                                                 │
  │  ┌────────────────┐  ┌─────────────────┐                       │
  │  │   Agent 2      │  │    Agent 3       │                       │
  │  │  Search UX     │  │  Card Grid &     │                       │
  │  │  Upgrade       │  │  Filter UX       │                       │
  │  │  ~5 files      │  │  ~5 files        │                       │
  │  └───────┬────────┘  └────────┬─────────┘                       │
  │          │                    │                                  │
  │  ┌───────┴────────┐  ┌───────┴─────────┐                       │
  │  │   Agent 4      │  │    Agent 5      │                       │
  │  │  Mobile &      │  │  PWA, A11y     │                       │
  │  │  Typography    │  │  & Data UX     │                       │
  │  │  ~2 files      │  │  ~6 files      │                       │
  │  └────────────────┘  └────────────────┘                       │
  └─────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┴─────────────────┐
            │  WAIT: Content revisions must      │
            │  finish before proceeding          │
            └─────────────────┬─────────────────┘
                              │
  ┌─ PHASE 2: After content revisions complete ─────────────────────┐
  │                                                                 │
  │  ┌─────────────────┐                                            │
  │  │    Agent 1       │                                            │
  │  │  Guide Nav &     │                                            │
  │  │  Transitions     │                                            │
  │  │  ~275 files      │                                            │
  │  └────────┬─────────┘                                            │
  └───────────┼─────────────────────────────────────────────────────┘
              │
    ┌─────────┴──────────┐
    │  Final: Rebuild,   │
    │  Minify & Verify   │
    └────────────────────┘
```

### Why Agent 1 must wait
Agent 1 injects `<script>` tags, `<div>` placeholders, and rewrites `href="index.html"` references across every `guides/*.html` file. The content revision agents are simultaneously rewriting the body content of those same files. Whichever agent writes last would overwrite the other's changes. Running Agent 1 after content revisions ensures it operates on the final guide HTML.

### Phase 1 File Conflict Note (Agents 2–5)
Since Agent 4 modifies `:root` CSS variables that affect how Agent 3 and 5's new CSS rules render, **run Agent 4 first** or have it commit before the others append their CSS blocks. In practice, since each agent appends to different sections of `main.css`, the order is flexible — just ensure Agent 4's variable changes land before the final build.

### Post-Parallel: Final Rebuild Step (Sequential)
After all 5 agents complete (Agent 1 last):
1. Run `make build` to regenerate all minified assets (CSS + JS dist/)
2. Run `npm test` to confirm existing tests still pass
3. Run `scripts/build-search-index.js` to generate the enriched search index
4. Run `scripts/add-guide-nav.js` if Agent 1 didn't do the full injection
5. Spot-check 5 guides: verify prev/next nav, sticky header, page transitions
6. Test on mobile (375px, 414px viewports): verify top bar, touch targets, typography
7. Test search: metadata term, keyword-only term, broad term with "view all"
8. Test offline: disconnect, confirm indicator, navigate cached guides
9. Test screen reader: navigate index cards, confirm aria-labels and emoji handling

---

## File Conflict Avoidance

| File | Agents | Resolution |
|---|---|---|
| `css/main.css` | 1, 2, 3, 4, 5 | Each agent appends to different sections. Agent 4 modifies `:root` variables and `@media` queries. Agents 1, 2, 3, 5 add new rule blocks. **Run Agent 4 first** (variable changes affect everything), then others in any order. |
| `js/cards.js` | 1, 3, 5 | Agent 1: adds click interceptor for transitions. Agent 3: modifies `createCardElement()` (progressive disclosure, aria-label, completed class). Agent 5: modifies `createCardElement()` (emoji utility, difficulty icons). **Run Agent 3 first** (structural changes to card HTML), then 5 (additive changes), then 1 (event listener only). |
| `index.html` | 4, 5 | Agent 4: mobile CSS tweaks (may need structural changes). Agent 5: install banner insertion, emoji aria attributes. No conflict — different DOM regions. |
| `js/ui.js` | 3, 4 | Agent 3: filter animation logic + empty states. Agent 4: back-to-top threshold. Different functions, no conflict. |
| `js/notifications.js` | 3, 5 | Agent 3: What's New default expanded. Agent 5: toast system. Different functions, no conflict. |
| `js/utils.js` | 5 | Only Agent 5 adds emoji utilities. No conflict. |

**Recommended approach for `css/main.css`:** Agent 4 runs first and commits. Then other agents append their CSS blocks to the end of the file, separated by section comment headers (e.g., `/* ===== GUIDE NAVIGATION ===== */`).

---

## Estimated Impact

| Metric | Before | After |
|---|---|---|
| UX Score (from audit) | 7.5 / 10 | ~9.0 / 10 |
| Guide reading flow | Pogo-stick (index↔guide) | Sequential with prev/next + sticky context |
| Search relevance | Title/tag matches only | Content-keyword-aware with relevance scoring |
| Mobile usability | Crowded nav, small targets, tiny text | Single-line nav, 44px targets, readable type |
| Accessibility | Good foundations, verbose cards | Concise card labels, emoji alt text, difficulty icons |
| Engagement signals | No install prompt, subtle offline | Clear install CTA, visible offline mode, action toasts |
| Filter UX | Instant show/hide, no empty states | Animated transitions, contextual empty messages |

---

*Generated February 16, 2026*
