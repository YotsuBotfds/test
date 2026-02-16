# Parallel Agent Implementation Plan — Webapp Infrastructure Upgrade

**Source:** `ZTH_Project_Scope_Audit_2026.docx`
**Date:** February 16, 2026
**Strategy:** 6 independent agents running in parallel, each owning a domain of infrastructure fixes. Designed to run AFTER the audit remediation (Agents 1–6), UX upgrade (Agents 1–5), and content upgrade plans complete.
**Prerequisite:** The three existing plans should be complete first:
- `ZTH_Audit_Implementation_Plan.md` — SEO, performance, a11y, security, loading states, code quality
- `ZTH_UX_Upgrade_MultiAgent_Plan.md` — guide navigation, search UX, card grid, mobile, PWA polish
- `ZTH_Content_Upgrade_MultiAgent_Plan.md` — guide expansions, new guides, SVG diagrams

This plan addresses the **structural, pipeline, data integrity, testing, and tooling** gaps identified in the Project Scope Audit that are NOT covered by any of those three plans.

---

## Scope — What's New vs. Already Covered

| Audit Finding | Covered Elsewhere? | This Plan? |
|---|---|---|
| BUILD-1: 6 missing npm scripts in package.json | **No** | **Agent 1** |
| BUILD-2: CI/CD workflows fail (depend on missing scripts) | **No** | **Agent 1** |
| BUILD-3: No source maps from minification | **No** | **Agent 1** |
| DATA-1: 27 manifest entries → archived files | **No** | **Agent 2** |
| DATA-2: 19 legacy-prefixed guides not in manifest | **No** | **Agent 2** |
| DATA-3: skills_data.json redundant | **No** | **Agent 2** |
| DATA-4: salvage_data.json superseded | **No** | **Agent 2** |
| DATA-5: learning-paths.json empty | **No** | **Agent 2** |
| SW-1: No old-version cache cleanup | **No** | **Agent 3** |
| SW-2: Service worker has no tests | **No** | **Agent 3** |
| TEST-1: No tests for progression.js (14 KB) | **No** | **Agent 4** |
| TEST-2: No tests for notifications.js | **No** | **Agent 4** |
| TEST-3: No tests for keyboard.js | **No** | **Agent 4** |
| TEST-4: No tests for analytics.js | **No** | **Agent 4** |
| TEST-5: No tests for theme switching | **No** | **Agent 4** |
| TEST-6: No tests for PWA features | **No** | **Agent 3** |
| TOOLS-1: 11 interactive tools untested | **No** | **Agent 5** |
| TOOLS-2: Tools have no shared build process | **No** | **Agent 5** |
| DOC-1: No project-level README | Partial (Audit plan) | **Agent 6** |
| DOC-2: No contributor guide | **No** | **Agent 6** |
| DOC-3: Incomplete JSDoc coverage | **No** | **Agent 6** |
| DEPLOY-1: No backup deployment config | **No** | **Agent 6** |
| NODE-1: Node 18 EOL planning | **No** | **Agent 6** |

---

## Agent Overview

| Agent | Domain | Files Touched | Est. Scope | Dependencies |
|---|---|---|---|---|
| **Agent 1** | Build Pipeline & CI/CD | `package.json`, `Makefile`, `.github/workflows/`, `scripts/minify-*.js` | ~8 files | None |
| **Agent 2** | Data Integrity & Cleanup | `data/*.json`, `guides.json`, `guides/archived/`, `js/` modules that import cleaned files | ~15 files | None |
| **Agent 3** | Service Worker & Offline | `sw.js`, new `tests/sw.test.js`, `tests/pwa.test.js` | ~4 files | None |
| **Agent 4** | Test Coverage Expansion | `tests/` (5 new test files), reference to `js/` source modules | ~8 files | None |
| **Agent 5** | Interactive Tools QA & Build | `tools/*.html`, `tools/tools-common.js`, new `scripts/validate-tools.js` | ~14 files | None |
| **Agent 6** | Documentation & DevOps | `README.md`, new `CONTRIBUTING.md`, `js/*.js` (JSDoc), new `netlify.toml` | ~30+ files | None |

---

## Agent 1: Build Pipeline & CI/CD

**Priority:** Critical — blocking all automated builds and deployments
**Addresses:** BUILD-1, BUILD-2, BUILD-3

This agent fixes the single highest-priority issue in the project: the complete disconnect between the Makefile, CI/CD workflows, and package.json. Until this is fixed, `make build`, `make all`, and both GitHub Actions workflows will fail.

### Tasks

1. **Wire the 6 missing npm scripts into package.json**
   - Open `package.json` and add scripts that map to existing build tooling in `scripts/`:
     ```json
     {
       "scripts": {
         "start": "node server.js",
         "dev": "npm install && npm start",
         "audit": "npm audit --production",
         "test": "node tests/test-runner.js",
         "build": "node scripts/build.js",
         "build:css": "node scripts/minify-css.js",
         "build:validate": "node scripts/validate.js",
         "check-sizes": "node scripts/check-sizes.js",
         "build:cache": "node scripts/build-search-index.js",
         "lint": "npx eslint js/ scripts/ tests/ --fix"
       }
     }
     ```
   - Before adding each script, READ the corresponding script file to confirm it accepts zero arguments and can be invoked directly with `node`. Check for any expected environment variables or CLI flags.
   - File: `package.json`

2. **Verify the Makefile-to-npm alignment**
   - After updating package.json, run each Makefile target in sequence to confirm the chain works:
     ```
     make install
     make build
     make build-css
     make validate
     make test
     make check
     make lint
     ```
   - Fix any failing targets. Common issues: scripts expecting arguments, missing dependencies, hardcoded paths.
   - If `scripts/build.js` calls sub-scripts internally, ensure those sub-scripts are also findable (relative paths from project root).
   - File: `Makefile` (if adjustments needed)

3. **Fix CI/CD workflows to match the corrected scripts**
   - Read `.github/workflows/ci.yml` and `.github/workflows/deploy.yml`
   - Verify every `npm run` command matches a key in the updated package.json
   - If the workflows use any flags or arguments not supported by the scripts, update the workflow YAML
   - Ensure `build:cache` is marked `continue-on-error: true` in ci.yml (it's a soft dependency — the audit says "CI step 9 fails (soft)")
   - Pin `actions/checkout` and `actions/upload-artifact` to v4 if still on v3 (v4 has been stable since mid-2025)
   - File: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`

4. **Add source map generation to minify scripts**
   - Read `scripts/minify-css.js` and `scripts/minify-js.js` to understand the current minification approach
   - If they use a custom minifier (no npm dependency), add source map output by:
     - Writing a `.map` file alongside each minified output
     - Adding a `//# sourceMappingURL=filename.min.js.map` comment to the end of minified files
   - If they use an npm package (esbuild, terser, cssnano), enable the source map flag
   - Update `.gitignore` to include `*.map` files (source maps should NOT be committed — they're build artifacts)
   - Files: `scripts/minify-css.js`, `scripts/minify-js.js`, `.gitignore`

5. **Add a `build:all` convenience script**
   - Add to package.json:
     ```json
     "build:all": "npm run build && npm run build:css && npm run build:validate && npm test && npm run check-sizes"
     ```
   - This gives developers a single command that mirrors `make all` without needing Make installed
   - File: `package.json`

### Verification
- Run `make all` end-to-end — it should complete with exit code 0
- Run `npm run build:all` — same result
- Simulate the CI pipeline locally: `npm ci && npm run build && npm run build:css && npm test && npm run build:validate && npm run check-sizes`
- Verify `.map` files are generated alongside minified CSS/JS
- Confirm `.gitignore` excludes `*.map`

---

## Agent 2: Data Integrity & Cleanup

**Priority:** Critical — stale manifest data causes broken links and wasted cache space
**Addresses:** DATA-1, DATA-2, DATA-3, DATA-4, DATA-5

This agent brings the data layer into a consistent, non-redundant state. Every JSON file should be authoritative, non-duplicative, and referenced by at least one module.

### Tasks

1. **Clean the guides.json manifest**
   - Read `data/guides.json` and identify all 27 entries whose `file` field points to a path inside `guides/archived/` or to a file that doesn't exist on disk
   - Write a Node.js cleanup script `scripts/clean-manifest.js` that:
     - Loads `data/guides.json`
     - For each entry, checks if the referenced HTML file exists at the specified path
     - Moves entries with missing files to a separate `data/archived-manifest-entries.json` (for reference, not loaded by the app)
     - Writes the cleaned `data/guides.json` with only valid entries
     - Reports: entries removed, entries retained, any entries with files on disk but not in manifest
   - Run the script and commit the cleaned manifest
   - Files: new `scripts/clean-manifest.js`, `data/guides.json`, new `data/archived-manifest-entries.json`

2. **Audit and resolve the 19 legacy-prefixed guides**
   - These are files like `con-01-*.html`, `cra-01-*.html`, `fod-01-*.html`, `sur-01-*.html` that exist on disk but aren't in the manifest
   - Write a script `scripts/audit-legacy-guides.js` that:
     - Lists all HTML files in `guides/` that are NOT referenced in `data/guides.json`
     - For each orphan, extracts the `<title>` and `<h1>` text
     - Cross-references against existing manifest entries by title similarity (fuzzy match) to detect duplicates
     - Outputs a report: `data/legacy-guide-audit.json` with fields: `file`, `title`, `matchedManifestEntry` (if duplicate found), `recommendation` ("archive" or "add to manifest")
   - Review the report, then:
     - Move confirmed duplicates to `guides/archived/`
     - For unique guides worth keeping, generate manifest entries and add to `data/guides.json`
   - Files: new `scripts/audit-legacy-guides.js`, `data/guides.json`, `guides/*.html` → `guides/archived/`

3. **Delete redundant data files**
   - **skills_data.json**: Confirmed duplicate of `skills_merged.json` (per `data/README.md`). Before deleting:
     - Grep the entire `js/` directory for imports or references to `skills_data.json`
     - If any module loads it, update that module to use `skills_merged.json` instead
     - Delete `data/skills_data.json`
   - **salvage_data.json**: Contains only 10 entries, fully superseded by `skills_merged.json`. Same process:
     - Grep for references in `js/`, `tools/`, and `sw.js`
     - Update references to use `skills_merged.json`
     - Delete `data/salvage_data.json`
   - Update `sw.js` precache list if either file was included
   - Files: `data/skills_data.json` (delete), `data/salvage_data.json` (delete), any `js/` modules that referenced them, `sw.js`

4. **Populate or remove learning-paths.json**
   - The file currently contains `[]`. The `progression.js` module references it.
   - Read `js/progression.js` to understand how `learning-paths.json` is consumed
   - **Option A (populate):** If progression.js has meaningful logic that uses learning paths, generate initial content by:
     - Reading `data/reading-order.json` and `data/prerequisite-map.json`
     - Creating 5–8 curated learning paths (e.g., "Immediate Survival Basics", "Homestead Agriculture", "Community Building", "Medical Fundamentals", "Crafts & Metalworking", "Power & Communications", "Advanced Sciences", "Defense & Security")
     - Each path: `{ "id": "path-survival-basics", "name": "...", "description": "...", "guides": ["SUR-01", "SUR-02", ...], "estimatedHours": N }`
   - **Option B (remove):** If progression.js only does a soft check and gracefully handles empty data, add a code comment explaining the empty state and leave the file as a placeholder
   - Decision should be based on reading the actual progression.js code
   - Files: `data/learning-paths.json`, possibly `js/progression.js`

5. **Remove test.txt from data/**
   - Check contents of `data/test.txt` — if it's test data or empty, delete it
   - Files: `data/test.txt` (delete)

6. **Rebuild the search index after all cleanup**
   - After all manifest and data file changes, run `node scripts/build-search-index.js` to regenerate `data/search-index.json`
   - Verify the new index size is smaller (removed archived entries) and the entry count matches the cleaned manifest
   - File: `data/search-index.json` (regenerated)

### Verification
- Run `node -e "const g = require('./data/guides.json'); g.forEach(e => { if (!require('fs').existsSync(e.file)) throw new Error('Missing: ' + e.file) })"` — should pass with 0 errors
- Confirm no JS module references `skills_data.json` or `salvage_data.json`
- Confirm `data/search-index.json` entry count matches `data/guides.json` entry count
- Run `npm test` to ensure no test depends on deleted files

---

## Agent 3: Service Worker & Offline Reliability

**Priority:** High — stale caches waste user storage; no tests means regressions go undetected
**Addresses:** SW-1, SW-2, TEST-6

This agent hardens the service worker — the most critical module for an offline-first survival app — and adds the test coverage it currently lacks.

### Tasks

1. **Add old-version cache cleanup to sw.js**
   - Read `sw.js` and locate the `activate` event listener
   - Add cache cleanup logic that deletes any cache whose name doesn't match the current version pattern:
     ```javascript
     self.addEventListener('activate', event => {
       const currentCaches = [
         `core-v${CACHE_VERSION}`,
         `guides-v${CACHE_VERSION}`,
         `data-v${CACHE_VERSION}`,
         `dynamic-v${CACHE_VERSION}`
       ];
       event.waitUntil(
         caches.keys().then(cacheNames =>
           Promise.all(
             cacheNames
               .filter(name => !currentCaches.includes(name))
               .map(name => {
                 console.log('[SW] Deleting old cache:', name);
                 return caches.delete(name);
               })
           )
         ).then(() => self.clients.claim())
       );
     });
     ```
   - Ensure `self.clients.claim()` is called after cleanup so the new SW takes control immediately
   - If there's existing activate logic, merge — don't replace
   - File: `sw.js`

2. **Add a cache version bump mechanism**
   - Currently the version is a hardcoded integer (`const CACHE_VERSION = 21`). This is fine, but add a comment documenting when to bump:
     ```javascript
     // CACHE_VERSION: Bump on ANY change to precached assets (core JS, CSS, index.html)
     // Guide content changes DON'T require a bump — guides use network-first strategy
     // Data file changes DO require a bump — data uses cache-first
     ```
   - File: `sw.js`

3. **Write service worker tests — `tests/sw.test.js`**
   - Create a new test file following the project's existing test patterns (custom describe/it/expect runner)
   - Test the following:
     - **Cache naming**: Verify cache names follow the `{tier}-v{version}` pattern
     - **Precache list**: Verify the precache URL list contains expected core assets (index.html, main.css, app.js, config.js, storage.js, cards.js)
     - **Activate cleanup logic**: Mock `caches.keys()` to return old versions, verify they get deleted
     - **Fetch routing**: Test that core URLs use network-first, guide URLs use cache-first, and dynamic URLs use stale-while-revalidate
     - **Cache limits**: Verify the 300-entry limit and 30-day expiration constants are defined
     - **Edge cases**: Extension URLs (chrome://, moz-extension://) should be skipped
   - To test sw.js in Node (which lacks ServiceWorker APIs), create lightweight mocks:
     ```javascript
     // Minimal SW API mocks for Node testing
     global.self = { addEventListener: (event, handler) => { /* store handlers */ } };
     global.caches = { keys: async () => [], open: async () => mockCache, delete: async () => true };
     global.fetch = async (url) => new Response('mock');
     ```
   - File: new `tests/sw.test.js`

4. **Write PWA feature tests — `tests/pwa.test.js`**
   - Test `js/pwa.js` behavior:
     - Install prompt: `beforeinstallprompt` event is captured and stored
     - Update detection: SW `updatefound` / `statechange` triggers UI notification
     - Install banner: Banner shows when install prompt is available, hides after install
     - Graceful fallback: No errors when SW is unavailable (insecure context)
   - File: new `tests/pwa.test.js`

5. **Register new test files in the test runner**
   - Read `tests/test-runner.js` to understand how test files are discovered (glob, manual list, or directory scan)
   - Add the new test files to the discovery mechanism
   - File: `tests/test-runner.js`

### Verification
- Run `npm test` — all existing tests still pass, new SW and PWA tests pass
- Manually verify: in a browser, install the app, then deploy an update — old caches should be cleaned up on activate
- Check that `caches.keys()` in DevTools shows only `*-v{current}` entries after an update cycle

---

## Agent 4: Test Coverage Expansion

**Priority:** High — 5 modules totaling ~1,500 LOC have zero test coverage
**Addresses:** TEST-1, TEST-2, TEST-3, TEST-4, TEST-5

This agent adds dedicated test files for the 5 largest untested modules. All tests use the project's existing custom test runner — no new dependencies.

### Tasks

1. **Write `tests/progression.test.js`** (highest priority — 478 LOC, most complex untested module)
   - Read `js/progression.js` thoroughly to understand:
     - How it loads prerequisite-map.json and reading-order.json
     - The prerequisite checking logic
     - Learning path recommendation algorithm
     - Progress migration from legacy storage format
   - Test cases:
     - **Prerequisites**: Guide with no prerequisites → always unlocked. Guide with prerequisites → locked until all prereqs complete. Circular prerequisite detection (if any guards exist).
     - **Reading order**: Correct next-guide recommendation for each category. Edge case: last guide in reading order.
     - **Progress migration**: Old-format localStorage data is correctly migrated to new format.
     - **Learning paths**: Recommendations change based on completed guides. Empty completion state → beginner paths suggested.
   - File: new `tests/progression.test.js`

2. **Write `tests/notifications.test.js`**
   - Read `js/notifications.js` (324 LOC)
   - Test cases:
     - **Toast system**: `showToast()` creates a DOM element with correct text. Toast auto-dismisses after timeout. Multiple toasts stack correctly.
     - **What's New panel**: Panel opens/closes. Badge count reflects unseen updates. Marking as read clears the badge.
     - **Guide update notifications**: New guide triggers notification. Already-seen guide does not.
   - File: new `tests/notifications.test.js`

3. **Write `tests/keyboard.test.js`**
   - Read `js/keyboard.js` (175 LOC)
   - Test cases:
     - **Shortcut registration**: `?` opens help modal. `/` focuses search input. `r` navigates to random guide. `Escape` closes modals.
     - **Input suppression**: Shortcuts don't fire when focus is in a text input or textarea.
     - **Help overlay**: Lists all available shortcuts with descriptions.
   - File: new `tests/keyboard.test.js`

4. **Write `tests/analytics.test.js`**
   - Read `js/analytics.js` (426 LOC)
   - Test cases:
     - **Guide view tracking**: `trackGuideView('SUR-01')` increments view count in storage. Duplicate views within session are counted correctly.
     - **Search term logging**: Search queries are recorded with timestamps. Most-searched terms are retrievable.
     - **Session tracking**: Session start/end times are recorded. Daily active user flag is set.
     - **Privacy**: No external network calls are made (verify no fetch/XMLHttpRequest usage). All data stays in localStorage.
   - File: new `tests/analytics.test.js`

5. **Write `tests/theme.test.js`**
   - The theme toggle lives in `js/ui.js` — read it to understand the implementation
   - Test cases:
     - **Toggle**: Calling toggleTheme() switches `data-theme` attribute on `<html>`. Dark → light → dark cycle works.
     - **Persistence**: Theme preference is saved to localStorage. On page load, saved theme is applied before first paint.
     - **System preference**: If no saved theme, `prefers-color-scheme` media query is respected.
     - **CSS variables**: Dark theme sets `--bg`, `--text`, `--accent` to expected values (or at least different from light theme).
   - File: new `tests/theme.test.js`

6. **Register all new test files in the test runner**
   - Update `tests/test-runner.js` to include the 5 new files
   - File: `tests/test-runner.js`

### Verification
- Run `npm test` — all 13 test files pass (8 existing + 5 new)
- Total test LOC should increase from ~3,000 to ~4,500+
- Manually verify each test file can run independently: `node tests/progression.test.js`

---

## Agent 5: Interactive Tools QA & Build Integration

**Priority:** Medium — 460 KB of untested, unbuildable code
**Addresses:** TOOLS-1, TOOLS-2

The 11 interactive tools in `tools/` are self-contained HTML pages with no shared build process and no tests. This agent adds basic validation, a shared build step, and integration tests.

### Tasks

1. **Audit tools for shared patterns and extract common validation**
   - Read `tools/tools-common.js` (5.3 KB) to understand the shared utility layer
   - Read 3–4 representative tools (smallest and largest) to identify:
     - Common initialization patterns
     - Data file dependencies (which JSON files each tool loads)
     - DOM structure patterns (shared CSS classes, container IDs)
   - Document findings as comments in a new `tools/README.md`
   - Files: new `tools/README.md`

2. **Write a tools validation script**
   - Create `scripts/validate-tools.js` that:
     - Reads each HTML file in `tools/`
     - Checks for: valid HTML structure (has `<html>`, `<head>`, `<body>`), no broken internal links, `tools-common.js` is referenced, all data file references (fetch/import paths) point to files that exist
     - Checks that each tool includes the theme sync script and service worker registration
     - Reports errors and warnings per tool
   - Wire into package.json: `"validate:tools": "node scripts/validate-tools.js"`
   - Add to the CI pipeline after the main validation step
   - Files: new `scripts/validate-tools.js`, `package.json`, `.github/workflows/ci.yml`

3. **Write integration smoke tests for tools**
   - Create `tests/tools.test.js` that:
     - For each tool HTML file, reads the file content as a string
     - Verifies it contains required elements (title, tools-common.js reference, theme meta tag)
     - Verifies all `fetch()` calls reference valid data file paths
     - Verifies no inline `onclick` or `onerror` handlers (CSP compliance)
     - Checks that the tool loads without throwing errors when data files are mocked
   - This is a static analysis test — no browser needed
   - File: new `tests/tools.test.js`

4. **Add tools to the minification pipeline (optional)**
   - If the existing `scripts/minify-js.js` and `scripts/minify-css.js` only process `js/` and `css/`, extend them to also minify inline JS/CSS within `tools/*.html`
   - Alternatively, create `scripts/minify-tools.js` that:
     - Reads each tool HTML file
     - Extracts `<script>` and `<style>` blocks
     - Minifies them (simple whitespace/comment removal)
     - Writes minified versions to `tools/` (overwrite in-place for production builds, or to a `tools/dist/` directory)
   - Add to package.json: `"build:tools": "node scripts/minify-tools.js"`
   - This is lower priority — only do if the other tasks complete quickly
   - Files: new `scripts/minify-tools.js`, `package.json`

5. **Add tools to the sitemap**
   - Read `scripts/generate-sitemap.js` and verify that `tools/*.html` pages are included
   - If not, update the script to glob `tools/*.html` and add them with appropriate `<priority>` (0.6) and `<changefreq>` (monthly)
   - Regenerate `sitemap.xml`
   - Files: `scripts/generate-sitemap.js`, `sitemap.xml`

### Verification
- Run `node scripts/validate-tools.js` — all 11 tools pass validation
- Run `npm test` — tools.test.js passes
- Inspect `sitemap.xml` — all 11 tool URLs are present
- Manually open 2–3 tools in a browser and verify they load without console errors

---

## Agent 6: Documentation & Developer Experience

**Priority:** Medium — no contributor guide, incomplete JSDoc, no backup deploy config
**Addresses:** DOC-1, DOC-2, DOC-3, DEPLOY-1, NODE-1

This agent makes the project approachable for new contributors and resilient against hosting changes.

### Tasks

1. **Rewrite the project README.md**
   - The current README is 67 lines with basic info. Replace with a comprehensive README covering:
     - **Project overview**: What it is (offline survival PWA), key stats (275+ guides, 18 categories, 11 tools, 0 client dependencies)
     - **Quick start**: `npm ci && npm start` → open localhost:3000
     - **Architecture overview**: ES6 modules, two-phase loading, service worker 4-tier cache, zero-dependency philosophy
     - **Project structure**: Key directories and their purposes (one-liner per directory)
     - **Build system**: `make all` or `npm run build:all`, what each step does
     - **Testing**: `npm test`, how to add new tests, what the custom runner supports
     - **Deployment**: GitHub Pages via `deploy.yml`, how to trigger a deploy
     - **Content**: How guides are structured, how to add a new guide (reference `scripts/new-guide.js`)
     - **License**: MIT (per package.json)
   - Keep it concise — aim for 150–200 lines. Use the data/README.md style as a formatting reference (it's well-written).
   - File: `README.md`

2. **Create CONTRIBUTING.md**
   - Standard contributor guide covering:
     - **Setup**: Prerequisites (Node 18+), install steps, verify with `make test`
     - **Branch strategy**: Feature branches off `main`, PR required for merge
     - **Code style**: ESLint + Prettier (configs in root), run `make lint` before committing
     - **Adding a guide**: Use `node scripts/new-guide.js` scaffold, follow category conventions, update guides.json, rebuild search index
     - **Adding a tool**: Create HTML in `tools/`, reference `tools-common.js`, follow CSP (no inline handlers)
     - **Testing**: Add tests for any new JS module, follow existing describe/it pattern, run full suite before PR
     - **Commit messages**: Conventional commits format (feat:, fix:, docs:, test:, build:)
     - **PR checklist**: Tests pass, lint clean, no new console errors, search index rebuilt if guides changed
   - File: new `CONTRIBUTING.md`

3. **Add JSDoc to the 6 largest undocumented modules**
   - Read each module, then add JSDoc comments to all exported functions:
     - `js/progression.js` (478 LOC) — document the prerequisite API, learning path logic
     - `js/analytics.js` (426 LOC) — document tracking methods, data structures, privacy model
     - `js/offline-manager.js` (360 LOC) — document caching API, quota methods
     - `js/offline-manager-ui.js` (444 LOC) — document UI components, download state machine
     - `js/notifications.js` (324 LOC) — document toast API, What's New data format
     - `js/pwa.js` (314 LOC) — document install flow, update detection
   - JSDoc format to follow:
     ```javascript
     /**
      * Check if a guide's prerequisites are met.
      * @param {string} guideId - The guide ID (e.g., "SUR-04")
      * @param {Set<string>} completedGuides - Set of completed guide IDs
      * @returns {boolean} True if all prerequisites are satisfied
      */
     ```
   - Files: `js/progression.js`, `js/analytics.js`, `js/offline-manager.js`, `js/offline-manager-ui.js`, `js/notifications.js`, `js/pwa.js`

4. **Add a Netlify deployment config as backup**
   - Create `netlify.toml` with:
     ```toml
     [build]
       publish = "."
       command = "npm run build && npm run build:css"

     [[headers]]
       for = "/*"
       [headers.values]
         X-Frame-Options = "DENY"
         X-Content-Type-Options = "nosniff"
         Referrer-Policy = "strict-origin-when-cross-origin"

     [[headers]]
       for = "/sw.js"
       [headers.values]
         Cache-Control = "no-cache"

     [[redirects]]
       from = "/*"
       to = "/index.html"
       status = 200
       conditions = {Role = ["admin"]}
     ```
   - This is a zero-cost backup — Netlify free tier supports static sites, and the config is inert unless someone actually connects the repo to Netlify
   - File: new `netlify.toml`

5. **Document Node.js version strategy**
   - Node 18 enters maintenance LTS end April 2025 and reaches EOL April 2025 (already past). Node 20 is the current LTS (EOL April 2026). Node 22 is the next LTS.
   - Update `.github/workflows/ci.yml` and `deploy.yml` to use Node 20.x instead of 18.x
   - Add an `.nvmrc` file with `20` so developers using nvm get the right version
   - Add `"engines": { "node": ">=20.0.0" }` to package.json
   - Files: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, new `.nvmrc`, `package.json`

### Verification
- README renders correctly on GitHub (preview with a Markdown viewer)
- CONTRIBUTING.md covers the complete new-developer workflow
- Run `npx jsdoc js/progression.js js/analytics.js --explain` (or similar) to verify JSDoc parses without errors
- `netlify.toml` passes `npx netlify-lint` or manual review
- `.nvmrc` contains `20`, `package.json` has engines field
- CI workflows reference `node-version: '20.x'`

---

## Execution Order & Dependencies

All 6 agents can run fully in parallel — there are no cross-dependencies.

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Agent 1    │  │   Agent 2    │  │   Agent 3    │
│ Build/CI-CD  │  │ Data Cleanup │  │  SW/Offline  │
│  ~45 min     │  │  ~60 min     │  │  ~45 min     │
└─────────────┘  └─────────────┘  └─────────────┘

┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Agent 4    │  │   Agent 5    │  │   Agent 6    │
│ Test Expand  │  │ Tools QA     │  │ Docs/DevOps  │
│  ~60 min     │  │  ~45 min     │  │  ~45 min     │
└─────────────┘  └─────────────┘  └─────────────┘
```

### Post-Agent Integration Steps

After all 6 agents complete, a final integration pass should:

1. Run `make all` to confirm the full build chain works with all changes merged
2. Run `npm test` to confirm all ~13 test files pass together
3. Bump `CACHE_VERSION` in `sw.js` to v22 (reflects data cleanup + new assets)
4. Rebuild the search index: `node scripts/build-search-index.js`
5. Regenerate the sitemap: `node scripts/generate-sitemap.js`
6. Push to a feature branch, open a PR, and verify both CI workflows pass

### Estimated Total Scope
- **Files created:** ~15 new files
- **Files modified:** ~40 files
- **Files deleted:** 2–3 redundant data files + legacy guides moved to archived
- **New test LOC:** ~2,000+
- **Net LOC change:** +3,000 (tests, docs, scripts) / -500 (deleted redundant data)

---

## Summary Table

| Agent | Critical Fixes | New Files | Modified Files | New Test LOC |
|---|---|---|---|---|
| 1 — Build/CI-CD | 6 missing npm scripts, 2 broken workflows | 0 | 5 | 0 |
| 2 — Data Cleanup | 27 stale manifest entries, 2 redundant files | 3 scripts + 1 archive | 5+ | 0 |
| 3 — SW/Offline | Cache leak (v1–v20 persist), 0 SW tests | 2 test files | 2 | ~400 |
| 4 — Test Coverage | 5 modules with 0 tests | 5 test files | 1 | ~1,500 |
| 5 — Tools QA | 11 untested tools, no build step | 3 (script, test, readme) | 3 | ~200 |
| 6 — Docs/DevOps | No README, Node 18 EOL, no backup deploy | 3 (contributing, netlify, nvmrc) | 8 | 0 |
| **Total** | | **~16** | **~24** | **~2,100** |
