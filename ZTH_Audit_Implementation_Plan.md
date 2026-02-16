# Parallel Agent Implementation Plan — Audit Remediation

**Source:** `ZTH_Full_Webapp_Audit.md`
**Strategy:** 6 independent agents running in parallel, each owning a domain of fixes. No cross-dependencies between agents except where noted.

---

## Agent Overview

| Agent | Domain | Files Touched | Est. Scope | Dependencies |
|---|---|---|---|---|
| **Agent 1** | SEO Infrastructure | `index.html`, `guides/*.html`, root files | ~310 files | None |
| **Agent 2** | Performance & Critical Path | `index.html`, `js/app.js`, `css/` | ~5 files | None |
| **Agent 3** | Accessibility Fixes | `guides/*.html`, `js/keyboard.js`, `index.html` | ~305 files | None |
| **Agent 4** | Security Hardening | `server.js`, `index.html`, `js/import-export.js` | ~3 files | None |
| **Agent 5** | UX & Loading States | `css/main.css`, `js/cards.js`, `js/app.js` | ~3 files | None |
| **Agent 6** | Code Quality & Testing | `tests/`, `js/utils.js`, `js/search.js`, build scripts | ~10 files | None |

---

## Agent 1: SEO Infrastructure

**Priority:** Critical
**Addresses:** SEO1, SEO2, SEO3, SEO4, SEO5, SEO6, SEO7, SEO8

### Tasks

1. **Generate `robots.txt`**
   - Create `/robots.txt` with `User-agent: *`, `Allow: /`, and `Sitemap:` directive
   - File: new `robots.txt`

2. **Generate `sitemap.xml`**
   - Write a Node.js script (`scripts/generate-sitemap.js`) that reads `data/guides.json` and outputs an XML sitemap with all guide URLs
   - Include `index.html`, all `tools/*.html`, and all `guides/*.html`
   - File: new `sitemap.xml`, new `scripts/generate-sitemap.js`

3. **Add meta descriptions to `index.html`**
   - Add `<meta name="description" content="...">` with app summary
   - Add `<meta name="theme-color" content="#e07c3a">`
   - Add Open Graph tags: `og:title`, `og:description`, `og:image`, `og:url`, `og:type`
   - Add Twitter Card tags: `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`
   - File: `index.html`

4. **Add meta tags to all guide pages via build script**
   - Create or extend `scripts/add-metadata-to-html.js` to:
     - Read each guide's title and description from `data/guides.json`
     - Inject `<meta name="description">` into `<head>`
     - Inject `<link rel="canonical">` with the guide's URL
     - Inject Open Graph tags
   - Run against all 303 files in `guides/`
   - Files: `scripts/add-metadata-to-html.js`, `guides/*.html`

5. **Add JSON-LD structured data to guide pages**
   - Extend the metadata script to inject `<script type="application/ld+json">` with Article schema (name, description, dateModified, author)
   - Add BreadcrumbList schema to guide pages
   - Files: `scripts/add-metadata-to-html.js`, `guides/*.html`

### Verification
- Validate `sitemap.xml` structure
- Spot-check 5 random guides for meta tags, canonical, and JSON-LD
- Validate JSON-LD with schema.org validator format

---

## Agent 2: Performance & Critical Path

**Priority:** High
**Addresses:** P1, P2, P3, P4, P5, P7

### Tasks

1. **Add resource hints to `index.html`**
   - Add `<link rel="preload" href="css/main.min.css" as="style">`
   - Add `<link rel="preload" href="data/guides.json" as="fetch" crossorigin>`
   - Add `<link rel="preload" href="js/app.js" as="script" crossorigin>`
   - Add `<link rel="modulepreload" href="js/dist/cards.js">` for critical module
   - File: `index.html`

2. **Inline critical CSS**
   - Extract above-the-fold styles (~2KB): CSS variables, body, header, search bar, hero section, grid skeleton
   - Inline them in a `<style>` block in `<head>`
   - Change main.min.css link to use `media="print" onload="this.media='all'"` pattern for async loading
   - File: `index.html`

3. **Convert static imports to dynamic in `app.js`**
   - Keep only `error-tracking`, `config`, `storage` as static imports (truly critical)
   - Convert `ui`, `keyboard`, `cards`, `offline-indicator`, `pwa`, `toc` to dynamic imports in the `initApp()` function
   - File: `js/app.js`

4. **Make guides.json fetch non-blocking**
   - In `js/cards.js`, show skeleton/placeholder cards immediately, then populate when data arrives
   - Add `requestIdleCallback` or `setTimeout(0)` wrapper for non-critical card enhancements
   - File: `js/cards.js`

5. **Add `loading="lazy"` to guide images**
   - Write a quick script to add `loading="lazy"` to any `<img>` tags in `guides/*.html`
   - File: new `scripts/add-lazy-loading.js`, `guides/*.html`

6. **Strip console.log from dist builds**
   - Update `scripts/minify-js.js` to configure Terser with `compress: { drop_console: true }`
   - Rebuild dist files
   - File: `scripts/minify-js.js`

### Verification
- Measure initial load: count render-blocking resources before/after
- Verify lazy loading attribute present on guide images
- Confirm dist/ files have no console.log statements

---

## Agent 3: Accessibility Fixes

**Priority:** High
**Addresses:** A1, A2, A3, A4, A5

### Tasks

1. **Fix heading hierarchy violations in guides**
   - Write a Node.js script (`scripts/fix-heading-hierarchy.js`) that:
     - Parses each guide HTML
     - Detects heading-level skips (e.g., H1→H3)
     - Adjusts headings to maintain proper nesting (H1 → H2 → H3 → ...)
   - Run against all 303 guides
   - Files: new `scripts/fix-heading-hierarchy.js`, `guides/*.html`

2. **Add aria-labels to emoji decorations**
   - In the heading-fix script, also detect standalone emoji characters and wrap them with `<span role="img" aria-label="...">` or add `aria-hidden="true"` for decorative ones
   - Files: `scripts/fix-heading-hierarchy.js`, `guides/*.html`

3. **Add proper form labels to `index.html`**
   - Add `<label for="search" class="visually-hidden">Search guides</label>` before the search input
   - Add `<label for="import-file" class="visually-hidden">Import progress file</label>` for the file input
   - Ensure all interactive inputs have associated labels
   - File: `index.html`

4. **Replace `alert()` with accessible modal in `keyboard.js`**
   - Create a keyboard help modal with `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
   - Trap focus within modal while open
   - Close on Escape key
   - Add modal HTML to `index.html`
   - File: `js/keyboard.js`, `index.html`, `css/main.css` (modal styles)

5. **Add descriptive label to file import button**
   - Update the import button area to include visible helper text or an `aria-describedby` reference
   - File: `index.html`

### Verification
- Run heading hierarchy check script and confirm 0 violations
- Keyboard-tab through index.html and confirm all inputs announce labels
- Test modal open/close/focus-trap with keyboard only

---

## Agent 4: Security Hardening

**Priority:** Medium
**Addresses:** S1, S2, S3, S4

### Tasks

1. **Add HTTPS redirect and security headers to `server.js`**
   - Add middleware for HTTPS redirect when behind proxy (`x-forwarded-proto`)
   - Add response headers:
     - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
     - `X-Content-Type-Options: nosniff`
     - `X-Frame-Options: DENY`
     - `Referrer-Policy: strict-origin-when-cross-origin`
     - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
   - Serve CSP as HTTP header (mirroring the existing meta tag content but adding `object-src 'none'; base-uri 'self'; frame-ancestors 'none'`)
   - File: `server.js`

2. **Enhance CSP meta tag**
   - Add `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'` to existing CSP meta tag in `index.html` (belt-and-suspenders with header)
   - File: `index.html`

3. **Replace inline onclick handlers with addEventListener**
   - In `js/import-export.js`, remove `onclick="exportAsJSON()"` from innerHTML
   - Instead, after inserting the modal HTML, attach event listeners via `document.getElementById(...).addEventListener('click', ...)`
   - File: `js/import-export.js`

4. **Add npm audit to build process**
   - Add `"audit": "npm audit --production"` to `package.json` scripts
   - Add audit step to `Makefile` (`make audit`)
   - Files: `package.json`, `Makefile`

### Verification
- Confirm server responds with all security headers (curl -I)
- Verify CSP meta tag includes new directives
- Grep for `onclick=` in JS files — should return 0 results
- Run `npm audit` and confirm clean output

---

## Agent 5: UX & Loading States

**Priority:** Medium
**Addresses:** UX1, UX2, UX3, UX4

### Tasks

1. **Add loading state CSS to `css/main.css`**
   - Style `.loading-state` with centered spinner animation, muted text, and padding
   - Style `.error-state` with warning color, icon, and retry button styling
   - Add skeleton card placeholder styles (`.skeleton-card` with shimmer animation)
   - File: `css/main.css`

2. **Implement skeleton cards in `js/cards.js`**
   - On `initializeCards()`, immediately render 6–8 skeleton placeholder cards
   - Replace skeletons with real cards once `guides.json` loads
   - On error, replace skeletons with styled error state including a "Retry" button
   - File: `js/cards.js`

3. **Add retry button to error states**
   - When guide data fails to load, show a "Try Again" button that re-calls the fetch
   - Include offline detection: if offline, show "You're offline — cached guides shown below" message
   - File: `js/cards.js`

4. **Add user-facing error toast for failures**
   - Hook `js/error-tracking.js` into `js/notifications.js` to show a non-intrusive toast when errors occur (e.g., "Something went wrong loading guides")
   - Only show for user-impacting errors, not background analytics failures
   - File: `js/error-tracking.js`, `js/notifications.js`

### Verification
- Throttle network in browser and observe skeleton → loaded transition
- Disconnect network and confirm offline message appears
- Trigger a fetch error and confirm toast notification appears

---

## Agent 6: Code Quality & Testing

**Priority:** Medium
**Addresses:** CQ1, CQ2, CQ4, CQ5

### Tasks

1. **Consolidate sanitization into `js/utils.js`**
   - Move the `sanitize()` function from `js/storage.js` to `js/utils.js` (export it)
   - Update `js/storage.js` to import from `js/utils.js`
   - Remove any duplicate sanitization logic in `js/search.js`
   - Files: `js/utils.js`, `js/storage.js`, `js/search.js`

2. **Add tests for `cards.js`**
   - Create `tests/cards.test.js` covering:
     - `createCardElement()` returns valid HTML with escaped content
     - Card renders with correct title, description, category
     - Filter functions return correct subsets
     - Error state renders when guides.json fails
   - File: new `tests/cards.test.js`

3. **Add tests for `ui.js`**
   - Create `tests/ui.test.js` covering:
     - Theme toggle switches `data-theme` attribute
     - Filter button activation/deactivation
     - Back-to-top button visibility logic
   - File: new `tests/ui.test.js`

4. **Add tests for `learning-paths.js`**
   - Create `tests/learning-paths.test.js` covering:
     - Path loading from JSON
     - Progress calculation
     - Prerequisite validation
   - File: new `tests/learning-paths.test.js`

5. **Add test coverage reporting to test runner**
   - Enhance `tests/test-runner.js` to track which functions are called during tests
   - Output a basic coverage summary (functions tested / total exported functions)
   - File: `tests/test-runner.js`

6. **Clean up console.log statements in source files**
   - Remove or guard all `console.log` calls with `if (config.isDebug())` check
   - Leave `console.error` and `console.warn` for genuine error paths
   - Files: all `js/*.js` source files

### Verification
- Run `npm test` and confirm all new tests pass
- Confirm zero `console.log` in non-debug code paths (grep check)
- Verify sanitize is imported from utils.js everywhere (grep check)

---

## Execution Order

All 6 agents can run **fully in parallel** — no agent depends on another's output.

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Agent 1     │  │  Agent 2     │  │  Agent 3     │
│  SEO Infra   │  │  Performance │  │  A11y Fixes  │
│  ~310 files  │  │  ~5 files    │  │  ~305 files  │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
┌──────┴───────┐  ┌──────┴───────┐  ┌──────┴───────┐
│  Agent 4     │  │  Agent 5     │  │  Agent 6     │
│  Security    │  │  UX/Loading  │  │  Code Quality│
│  ~3 files    │  │  ~3 files    │  │  ~10 files   │
└──────────────┘  └──────────────┘  └──────────────┘
                        │
                  ┌─────┴──────┐
                  │  Final:    │
                  │  Rebuild & │
                  │  Verify    │
                  └────────────┘
```

### Post-Parallel: Final Rebuild Step (Sequential)
After all 6 agents complete:
1. Run `make build` to regenerate minified assets
2. Run `npm test` to confirm all tests pass
3. Run the sitemap/metadata scripts if not auto-run
4. Spot-check 5 random guides for all changes
5. Run `npm audit` to confirm clean dependencies

---

## File Conflict Avoidance

Agents that modify the same file:

| File | Agents | Resolution |
|---|---|---|
| `index.html` | 1, 2, 3, 4 | Each agent modifies different `<head>` sections. Agent 1: meta/OG tags. Agent 2: preload links + inline CSS. Agent 3: form labels + modal HTML in body. Agent 4: CSP meta tag. Run sequentially for this file only, or assign sections. |
| `css/main.css` | 3, 5 | Agent 3: modal styles. Agent 5: loading/skeleton styles. Append to different sections — no conflict. |
| `guides/*.html` | 1, 2, 3 | Agent 1: `<head>` meta tags. Agent 2: `loading="lazy"` on images. Agent 3: heading hierarchy + emoji ARIA. All modify different parts of each file. Run Agent 3 first (structural changes), then 1 (head injection), then 2 (attribute addition). |

**Recommended approach for `index.html`:** Have agents write their changes to separate patch files, then apply them in sequence. Or, assign Agent 2 as the owner of `index.html` and have other agents provide their snippets as instructions.
