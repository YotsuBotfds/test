---
name: new-topic
description: >
  Add a new topic (category) to the Zero to Hero Survival Compendium app.
  Use this skill whenever someone wants to add a new category/topic to the survival app,
  create a new section of guides, or expand the app's subject coverage. This covers
  everything — from updating the data layer and UI to rebuilding the search index and
  caches. Even if the user just says "add a section for X" or "I want guides about Y",
  this skill applies.
---

# New Topic Skill

This skill walks you through adding a brand-new topic (category) to the Zero to Hero
Survival Compendium. A "topic" in this app is a **category** — a grouping that appears
in the Table of Contents, the card renderer, the progress visualization, and the search index.

Adding a topic touches many files across the app. The reason each file matters is
explained below so you can adapt if the codebase has changed since this skill was written.

## Overview of What Needs to Change

When you add a new topic, these files all need updating:

| File | What to change | Why |
|------|---------------|-----|
| `js/cards.js` | Add to `getCategoryDisplay()` map + `categoryOrder[]` array | Cards renderer uses the map for display names/icons and the array for section ordering |
| `js/progress-viz.js` | Add to `categoryColors`, `getCategoryName()`, `getCategoryIcon()`, and `categoryOrder[]` | Progress visualization has its own category maps — they must stay in sync with cards.js |
| `index.html` | Add a `<a>` entry inside `.toc-grid` | The Table of Contents is static HTML — it doesn't auto-generate from data |
| `data/guides.json` | Add guide entries with the new category value | This is the master data file that drives everything |
| `guides/*.html` | Create the actual guide HTML files | Each guide is a standalone HTML page |
| `scripts/new-guide.js` | Add to `categoryIcons` map | The scaffolding script uses this to auto-assign icons (has fallback, but better to be explicit) |
| `sw.js` | Bump `CACHE_VERSION` | Forces the service worker to re-cache with new content |
| Search index | Rebuild via `node scripts/build-search-index.js` | Search index is pre-built from guide HTML files |
| Validation | Run `node scripts/validate.js` | Catches broken links, missing entries, structural issues |

Optional (won't break without it, but recommended for full consistency):

| File | What to change | Why |
|------|---------------|-----|
| `js/achievements.js` | Add a category-specific achievement entry + counting logic | Existing categories like medical, building, agriculture each have a "complete all X guides" achievement. Without this, the new topic works fine but won't have its own completion achievement. |

Files that auto-discover categories (no manual update needed):

- `js/toc.js` — reads `#sec-*` links from the DOM
- `js/ui.js` — filters by data attributes on cards
- `js/search.js` — groups by category from guides.json
- `js/achievements.js` — the "Explorer" achievement (read from 5 categories) is fully dynamic

Files with their own independent category taxonomies (NOT the app-level categories, no update needed):

- `tools/tech-tree-v2.html` — uses simplified categories ("Survival", "Food", "Construction") for tech tree visualization
- `data/skills_merged.json` — uses its own skill hierarchy ("Agriculture", "Animal Management", "General")
- `tools/learning-paths.html` — has CSS classes for learning path categories, separate from app categories

## Step-by-Step Process

### Step 1: Gather Information

Before touching any code, collect these details from the user:

1. **Category ID** — A kebab-case slug (e.g., `marine-skills`, `energy-storage`). This becomes the internal identifier used everywhere.
2. **Display Name** — Human-readable name (e.g., "Marine Skills", "Energy Storage")
3. **Icon** — An emoji that represents the topic (e.g., 🚢, 🔋)
4. **Color** — A hex color for the progress bar (e.g., `#4a9eff`). Pick something distinct from existing category colors in `progress-viz.js`.
5. **Position** — Where in the category order it should appear. Look at the existing `categoryOrder` array in `js/cards.js` to pick a logical spot (related topics should be near each other).
6. **Initial guides** — At minimum one guide to seed the category. Get titles, descriptions, difficulty levels, and any prerequisites.

### Step 2: Update `js/cards.js`

Two changes in this file:

**A. Add to `getCategoryDisplay()` categoryMap:**

Find the `categoryMap` object inside `getCategoryDisplay()` and add a new entry:

```javascript
'your-category-id': { name: 'Display Name', icon: '🎯' },
```

**B. Add to `categoryOrder[]` array in `renderGuides()`:**

Find the `categoryOrder` array and insert the new category ID at the appropriate position. The order of this array controls the order sections appear on the page. Place it near related topics.

### Step 3: Update `js/progress-viz.js`

This file has its own duplicated category maps that must stay in sync. Four changes:

**A. Add to `categoryColors` object** (top of file):
```javascript
'your-category-id': '#hexcolor',
```

**B. Add to `getCategoryName()` function's categoryMap:**
```javascript
'your-category-id': 'Display Name',
```

**C. Add to `getCategoryIcon()` function's iconMap:**
```javascript
'your-category-id': '🎯',
```

**D. Add to `categoryOrder[]` array in `renderProgressVisualization()`:**

Insert at the same relative position as in cards.js. The two `categoryOrder` arrays
(in cards.js and progress-viz.js) should list categories in the same order so the
main page and progress visualization are consistent.

### Step 4: Update `index.html`

Find the `.toc-grid` div inside the `<nav id="toc">` element. Add a new TOC link:

```html
<a href="#sec-your-category-id" class="toc-item"><span class="toc-icon">🎯</span><span>Display Name</span></a>
```

Place it at a position that matches where you put it in `categoryOrder`.

### Step 5: Update `scripts/new-guide.js`

Find the `categoryIcons` object and add:

```javascript
'your-category-id': '🎯',
```

This lets future `npm run new-guide` calls auto-assign the right icon for this category.

### Step 6: Add Guide Entries to `data/guides.json`

Each guide entry follows this structure:

```json
{
  "id": "GD-XXX",
  "title": "Guide Title",
  "category": "your-category-id",
  "tags": [],
  "description": "A clear description of what this guide covers.",
  "icon": "🎯",
  "file": "guides/guide-slug.html",
  "url": "guides/guide-slug.html",
  "difficulty": "beginner|intermediate|advanced",
  "readingTime": 10,
  "wordCount": 2000,
  "lastUpdated": "YYYY-MM-DD",
  "version": "1.0"
}
```

**ID assignment:** The app uses multiple ID prefix conventions. The most common is `GD-XXX` (used by most categories). Some early categories use specific prefixes like `SUR-XX`, `FOD-XX`, `CON-XX`, `CRA-XX`, `COM-XX`. For new topics, use `GD-XXX` format. Find the highest existing `GD-XXX` number in guides.json and increment from there. IDs must be unique across the entire file.

**Tags:** Common tags include `critical`, `essential`, `rebuild`, `new`, `technology`, `human`, `medical`, `winter`. Use `new` for freshly added guides so they appear in the "What's New" section.

### Step 7: Create Guide HTML Files

Each guide lives in `/guides/` as a standalone HTML file. You can run the scaffolding script:

```bash
node scripts/new-guide.js "Guide Title" --category=your-category-id --difficulty=intermediate --icon=🎯
```

This creates the HTML file and appends to guides.json automatically. But note: `new-guide.js` only handles these two things — you still need to do all the other steps in this skill.

If creating manually instead, key structural requirements for the HTML:

- `<!DOCTYPE html>` declaration
- Links to `../css/main.css` for styling
- Back link: `<a class=back-link href=../index.html>← Back to Index</a>`
- Theme toggle button with ID `theme-toggle`
- Mark as Read button with ID `mark-read-btn`
- Guide metadata (difficulty, read time)
- Table of contents for the guide's sections
- Content sections with proper heading hierarchy (h1 > h2 > h3)
- Footer with guide ID
- Theme + progress tracking inline script (copy from any existing guide)

### Step 8: Write the Guide Content

Fill in the guide HTML with actual content. Follow the conventions of existing guides:

- Use `<div class="info-box">` for key points and callouts
- Use `<div class="step-by-step">` with numbered `.step` divs for procedures
- Use semantic HTML (sections, headings, lists)
- Include practical, actionable information
- Estimate reading time (~200 words per minute) and word count, then update the guides.json entry

### Step 9 (Optional): Add Category Achievement in `js/achievements.js`

If you want a "complete all guides in this category" achievement (recommended for consistency),
you need three changes in this file:

**A. Add achievement definition** to the `achievementDefs` object (in the "Category-Specific Achievements" section):

```javascript
'your-achievement-id': { name: 'Achievement Name', icon: '🎯', desc: 'Complete all your-topic guides', category: 'category' },
```

Pick a thematic name and icon. Examples: 'medic' for medical, 'engineer' for building, 'farmer' for agriculture.

**B. Add counting variables and category check** inside `checkAchievements()`:

Add counter variables (e.g., `let yourTopicCount = 0; let yourTopicTotal = 0;`) alongside the existing ones around line 186-199.

Then add a category check in the `cards.forEach` loop (around line 228-256):

```javascript
if (category === 'your-category-id') {
  yourTopicTotal++;
  if (isCompleted) yourTopicCount++;
}
```

**C. Add unlock check** after the existing category achievement checks (around line 278-286):

```javascript
if (yourTopicCount === yourTopicTotal && yourTopicTotal > 0) unlock('your-achievement-id');
```

### Step 10: Bump Service Worker Cache Version

In `sw.js`, find the `CACHE_VERSION` constant at the very top and increment it:

```javascript
const CACHE_VERSION = 'vXX'; // increment the number
```

This forces browsers to re-cache everything on next visit, picking up the new guides.

### Step 11: Rebuild and Validate

Run these commands from the project root:

```bash
# Rebuild the search index to include new guides
node scripts/build-search-index.js

# Validate everything is consistent
node scripts/validate.js

# Full build (generates SW cache manifest)
npm run build
```

Fix any errors the validator reports before considering the topic complete.

### Step 12: Verify

Do a quick sanity check:

1. The new category appears in the TOC on index.html
2. Cards render under the correct section heading with the right icon
3. Clicking the TOC link scrolls to the section
4. Search finds the new guides
5. The guide pages load and display correctly
6. Theme toggle works on guide pages
7. Mark as Read works
8. Progress visualization shows the new category with correct color

## Quick Reference: File Locations

All paths relative to project root:

```
js/cards.js              → getCategoryDisplay() + categoryOrder[]
js/progress-viz.js       → categoryColors + getCategoryName() + getCategoryIcon() + categoryOrder[]
index.html               → .toc-grid nav section
data/guides.json         → Master guide metadata
guides/*.html            → Individual guide pages
scripts/new-guide.js     → categoryIcons map
js/achievements.js       → achievementDefs + checkAchievements() (optional)
sw.js                    → CACHE_VERSION constant
scripts/build-search-index.js  → Search index rebuilder
scripts/validate.js      → Validation script
```

## Known Issue: categoryOrder Mismatch

As of the current codebase, the `categoryOrder` arrays in `cards.js` and `progress-viz.js` are
already slightly out of sync. Specifically, `cards.js` places `metalworking` right after `crafts`
and `society` after `transportation`, while `progress-viz.js` puts `society` before `metalworking`
and `metalworking` after `chemistry`. When adding a new topic, pick one canonical order and update
both files to match — this is a good opportunity to fix the existing drift.

## Common Mistakes to Avoid

- **Forgetting `categoryOrder`**: There are TWO `categoryOrder` arrays — one in `cards.js` and one in `progress-viz.js`. If you only update one, the main page and progress view will show categories in different orders.
- **Forgetting `progress-viz.js`**: This file has its own `getCategoryName()`, `getCategoryIcon()`, and `categoryColors` that are separate from `cards.js`. Missing any of these means the progress bars will show a raw category slug instead of the display name, a generic icon, or a default color.
- **Mismatched category IDs**: The category string must be identical across guides.json, cards.js, progress-viz.js, index.html TOC link, and new-guide.js. Even a typo breaks the grouping.
- **Duplicate guide IDs**: Every guide ID must be globally unique. Always check the highest existing GD-XXX number.
- **Not bumping the service worker**: Users with the app cached won't see new content until the SW version changes.
- **Skipping search index rebuild**: New guides won't appear in search results until the index is regenerated.
- **Skipping achievements.js**: Not a breaking issue, but for consistency every major category should have its own completion achievement. If you skip this, the new category will still work — it just won't reward users for completing all its guides.
