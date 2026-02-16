# Zero to Hero Compendium — Multi-Agent Content Upgrade Plan

**Date:** February 16, 2026
**Objective:** Broaden the scope of every active guide topic and add significantly more SVG diagrams and step-by-step instructions across the entire compendium.
**Current State:** 268 active guides | 611 SVGs total | 28 archived stubs
**Target State:** Every guide has 8+ sections, 3+ SVG diagrams, broadened scope, and step-by-step procedural instructions.

---

## 1. Current State Assessment

### 1.1 Guide Size Distribution

| Tier | Line Count | Count | Description |
|------|-----------|-------|-------------|
| ZTH-MODULE | 3–5 lines | 21 | Module landing pages (zth-modules category), minimal content |
| SMALL | 4–10 lines | 59 | Single-page guides with basic content, few/no diagrams |
| MEDIUM | 11–50 lines | 25 | Partial guides with some sections but thin coverage |
| LARGE | 50+ lines | 163 | Full guides, variable diagram count |

### 1.2 SVG Diagram Coverage

| Status | Count | % of Total |
|--------|-------|-----------|
| 0 SVGs | 87 (excl. zth-modules) | 35% |
| 1 SVG | ~80 | 32% |
| 2–4 SVGs | ~70 | 28% |
| 5+ SVGs | ~11 | 4% |

### 1.3 Categories Needing Most Work

| Category | Guides | Avg Lines | Guides w/ 0 SVGs | Priority |
|----------|--------|-----------|-------------------|----------|
| medical | 39 | 107 | 14 | HIGH |
| salvage | 10 | 363 | 9 | HIGH |
| zth-modules | 21 | 4 | 16 | HIGH (rewrite) |
| metalworking | 6 | 35 | 3 | HIGH |
| power-generation | 7 | 35 | 2 | HIGH |
| resource-management | 3 | 37 | 2 | MEDIUM |
| crafts | 31 | 151 | 6 | MEDIUM |
| survival | 16 | 147 | 4 | MEDIUM |
| society | 19 | 241 | 5 | MEDIUM |
| agriculture | 33 | 242 | 6 | LOW |
| building | 18 | 259 | 3 | LOW |
| sciences | 14 | 138 | 1 | LOW |
| chemistry | 16 | 123 | 2 | LOW |
| communications | 13 | 158 | 3 | LOW |
| defense | 8 | 181 | 1 | LOW |
| transportation | 6 | 120 | 1 | LOW |

### 1.4 Archived Stub Audit Results

28 deprecated stubs were moved to `guides/archived/`. Cross-referencing with active guides:

- **2 DUPLICATE** — Topic fully covered by active guides (keep archived):
  - `com-01-community-governance.html` → covered by governance.html, justice-law.html, community-organizing.html
  - `industrial-fermentation.html` → covered by biogas-production.html, fermentation-baking.html, vinegar-ferments.html

- **21 PARTIAL** — Unique angles not fully covered elsewhere (review for merge):
  - Examples: animal-materials-processing (overview combining leather/bone/sinew), disaster-preparedness (comprehensive response planning), electric-motor-rewinding (hands-on rewinding manual), pedagogy-curriculum (Bloom's taxonomy framework)

- **5 UNIQUE** — No active guide covers these topics (candidates for new full guides):
  - `family-planning-population.html` — contraception, fertility tracking, carrying capacity
  - `food-distribution-community-feeding.html` — communal kitchens, bulk cooking logistics
  - `instrument-construction.html` — building musical instruments
  - `microscopy.html` — microscope construction and diagnostic use
  - `slide-rule-nomography.html` — analog computation devices
  - `railroads.html` — rail engineering and heavy transport
  - `weights-measures-standards.html` — creating standardized measurement systems

---

## 2. Upgrade Specifications

### 2.1 Content Broadening Requirements

For every guide, the agent must expand scope by adding:

1. **Historical/theoretical context** — brief origin, why this matters for survival rebuilding
2. **Materials & sourcing** — what you need, where to find it post-collapse, substitutions
3. **Step-by-step procedures** — numbered instructions with specific measurements, temperatures, timings
4. **Scaling guidance** — how to do this for 1 person vs. a community of 50–500
5. **Failure modes & troubleshooting** — what goes wrong, how to diagnose, how to fix
6. **Safety warnings** — specific hazards with `.warning` or `.danger` div blocks
7. **Cross-references** — link to related guides in `.related` nav block
8. **Seasonal/climate considerations** — how approach varies by environment

### 2.2 SVG Diagram Requirements

Every guide must have **minimum 3 SVG diagrams**. Target: 4–6 per guide. Types to include:

1. **Component/anatomy diagrams** — labeled parts of key equipment or structures
2. **Process flowcharts** — step-by-step visual workflows using arrows and boxes
3. **Comparison charts** — side-by-side visual comparisons (materials, methods, etc.)
4. **Cross-section/cutaway views** — internal structure of builds, tools, systems

SVG style rules (match existing compendium aesthetic):
```
- viewBox: typically 600×400 or 700×500
- Background: var(--surface) compatible — use #1a2e1a or #2d2416
- Text fill: #d4a574 (headings), #b8956a (labels), #f5f0e8 (body)
- Stroke: #b8956a for borders, 2px stroke-width
- Shapes: fill with gradient defs or solid earth tones
- aria-label attribute on every <svg> element
- Must be inline (no external SVG files)
```

### 2.3 HTML Structure Template

Every upgraded guide must follow this structure:
```html
<!DOCTYPE html>
<!-- Guide SEO: [Title] | Category: [cat] | Difficulty: [level] | Updated: 2026-02-16 -->
<html lang="en"><head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>[Title] - Zero to Hero Survival Compendium</title>
  <link rel="stylesheet" href="css/shared.css">
  <!-- optional inline <style> for guide-specific classes -->
  <meta name="description" content="[description]">
  <link rel="canonical" href="https://zerotoherohero.com/guides/[filename]">
  <meta property="og:title" content="[Title]">
  <meta property="og:description" content="[description]">
  <meta property="og:type" content="article">
  <!-- BreadcrumbList + Article JSON-LD -->
</head>
<body><main role="main"><div class="container">
  <nav class="breadcrumb">...</nav>
  <header><h1>[Title]</h1><p>[subtitle]</p></header>
  <nav class="toc"><h2>Contents</h2><ol><!-- 8–15 section links --></ol></nav>

  <section id="[id]"><h2>[Section]</h2>
    <!-- Rich content: paragraphs, h3 subsections, tables, SVG diagrams -->
    <!-- Step-by-step instructions with measurements -->
  </section>
  <!-- ... repeat for all sections ... -->

  <div class="warning"><strong>Safety Warning:</strong> ...</div>
  <div class="tip"><strong>Practical Tip:</strong> ...</div>

  <div class="related"><h3>Related Guides</h3>
    <a href="[guide].html">[Guide Name]</a>
    <!-- 2-4 related links -->
  </div>
  <footer><p>Zero to Hero Survival Compendium — Offline Reference</p></footer>
</div></main>
<script src="../shared/theme-sync.js"></script>
<script src="js/shared.js"></script>
</body></html>
```

---

## 3. Multi-Agent Execution Plan

### 3.0 Pre-Processing: ZTH-Modules Decision

The 21 `zth-modules` guides are 3–5 line landing pages. Before upgrading:

**Agent task:** Read each zth-module guide. Determine if it's a category index page (links to other guides) or a standalone topic. Category index pages should be left as-is. Standalone topics should be upgraded like any other guide.

### 3.1 Wave 1 — SMALL Guides (59 guides, 4–10 lines)

These have the header/metadata structure but minimal body content. They need full content generation.

**Batch strategy:** 6 parallel agents, ~10 guides each, grouped by category for consistency.

| Agent | Category Focus | Guides |
|-------|---------------|--------|
| 1A | survival + defense | sur-01 through sur-05, con-01 through con-04, desert-survival, high-altitude-living, fire-suppression, search-rescue, intelligence-scouting |
| 1B | crafts | cra-01 through cra-07, bone-tools, stone-tools, falconry-raptors, waterproofing-textiles, ink-pigment-chemistry, rubber-vulcanization, hoof-care-farriery |
| 1C | medical (part 1) | first-aid, infection-control, infectious-disease, medications, pharmacy-compounding, sterilization-methods, toxicology, dentistry-restorative, orthodontics-survival, elder-care |
| 1D | medical (part 2) + agriculture | veterinary-obstetrics, veterinary-parasitology, zoonotic-disease, disaster-psychology-children, fod-01 through fod-05, food-rationing, insect-farming, indoor-farming |
| 1E | power + metalworking + transport | electrical-generation, electrical-motors, electrical-wiring, power-distribution, batteries, hydroelectric, internal-combustion, vehicle-conversion, metallurgy-basics, steel-making, bloomery-furnace, pressure-vessels |
| 1F | chemistry + communications + specialized | chemical-safety, chlorine-bleach-production, alkali-production, solvents-distillation, gunpowder, biogas-production, telecommunications, sign-language-communication, pigeon-keeping-messenger, transistors, heat-management, desalination-systems, psychological-resilience, anatomy-oral, apprenticeship-systems, rural-scavenging-guide |

**Per-agent instructions:**
```
For each guide in your batch:
1. Read the current file completely
2. Preserve the existing <head> metadata (SEO comment, title, description, canonical URL, JSON-LD)
3. Generate comprehensive body content following Section 2.1 requirements
4. Create 3-5 inline SVG diagrams following Section 2.2 style rules
5. Build a proper table of contents linking to all sections
6. Add .warning, .tip, and .related blocks
7. Write the complete updated HTML file back to its original path
8. Ensure the file is valid HTML and the closing tags are correct
```

### 3.2 Wave 2 — MEDIUM Guides (25 guides, 11–50 lines)

These have partial content that needs significant expansion.

**Batch strategy:** 4 parallel agents, ~6 guides each.

**Per-agent instructions:**
```
For each guide in your batch:
1. Read the current file completely
2. Preserve ALL existing content — do not remove or rewrite working sections
3. Identify content gaps using Section 2.1 checklist
4. Add 3-6 new sections to broaden scope
5. Add 2-4 new SVG diagrams (keeping any existing ones)
6. Expand existing thin sections with measurements, timings, step-by-step detail
7. Update the table of contents to include new sections
8. Write the complete updated file
```

### 3.3 Wave 3 — LARGE Guides With 0 SVGs (71 guides)

These have good content but no visual diagrams.

**Batch strategy:** 6 parallel agents, ~12 guides each, grouped by category.

**Per-agent instructions:**
```
For each guide in your batch:
1. Read the current file completely
2. DO NOT modify existing text content
3. Identify the 3-5 best locations for SVG diagrams based on the content
4. Create and insert 3-5 inline SVG diagrams at those locations
5. Each SVG should illustrate a key concept, process, or component from the guide
6. Follow Section 2.2 style rules exactly
7. Write the complete updated file preserving all existing content
```

### 3.4 Wave 4 — LARGE Guides With 1–2 SVGs (80 guides)

These need additional diagrams and scope broadening.

**Batch strategy:** 6 parallel agents, ~13 guides each.

**Per-agent instructions:**
```
For each guide in your batch:
1. Read the current file completely
2. Preserve ALL existing content and SVGs
3. Add 2-3 additional SVG diagrams in locations lacking visual content
4. Add 1-3 new sections to broaden scope (per Section 2.1 checklist)
5. Expand any thin subsections with more procedural detail
6. Update table of contents if new sections were added
7. Write the complete updated file
```

### 3.5 Wave 5 — LARGE Guides With 3+ SVGs (12 guides)

These are the most complete guides. Light touch only.

**Batch strategy:** 1 agent handles all 12.

**Per-agent instructions:**
```
For each guide:
1. Read the current file
2. Identify any missing scope areas from Section 2.1 checklist
3. Add 1-2 new sections if gaps found
4. Add 1 new SVG if a key concept lacks visualization
5. Otherwise mark as complete — do not pad content unnecessarily
```

### 3.6 Wave 6 — ZTH-Module Pages (up to 21 guides)

Based on Wave 0 audit results.

**Batch strategy:** 2 parallel agents.

---

## 4. Quality Verification

After each wave completes, run a verification agent:

### 4.1 Structural Validation
```bash
# Check all guides have valid HTML structure
# Check all SVGs have aria-label attributes
# Check all guides have .toc, .related, .warning or .tip blocks
# Check no guide has unclosed tags
# Verify shared.css and shared.js references are intact
```

### 4.2 Content Completeness Check
```
For a random 10% sample of upgraded guides:
1. Verify minimum 8 sections exist
2. Verify minimum 3 SVGs exist
3. Verify step-by-step instructions include specific measurements
4. Verify .warning and .related blocks are present
5. Verify table of contents links match actual section IDs
```

### 4.3 Data File Updates

After all waves complete:
- Rebuild `data/search-index.json` from updated guide content
- Update `data/guides.json` metadata (word counts, reading times, section counts)
- Bump service worker cache version in `sw.js`

---

## 5. Execution Summary

| Wave | Scope | Guides | Parallel Agents | Key Action |
|------|-------|--------|----------------|------------|
| 0 | ZTH-modules audit | 21 | 1 | Classify as index vs. standalone |
| 1 | Small guides | 59 | 6 | Full content + 3-5 SVGs each |
| 2 | Medium guides | 25 | 4 | Expand + 2-4 new SVGs each |
| 3 | Large, 0 SVGs | 71 | 6 | Insert 3-5 SVGs, preserve text |
| 4 | Large, 1-2 SVGs | 80 | 6 | Add 2-3 SVGs + broaden scope |
| 5 | Large, 3+ SVGs | 12 | 1 | Light polish only |
| 6 | ZTH-modules | ≤21 | 2 | Rewrite standalone topics |
| V | Verification | all | 2 | Validate structure + content |
| **Total** | | **268+** | **28 agent runs** | |

---

## 6. Risk Mitigations

1. **File corruption** — Each agent reads the full file before writing. No partial writes.
2. **Style drift** — All agents receive identical SVG style rules and HTML template specs.
3. **Content hallucination** — Survival content must use real measurements, temperatures, and chemistry. Agents instructed to use conservative, well-established techniques only.
4. **Scope creep** — Agents must not rename files, change categories, or modify the data/ directory. Content changes only.
5. **Broken cross-references** — Agents may only link to guides confirmed to exist in the active guides/ directory.

---

## 7. Post-Upgrade Metrics

Success criteria after all waves complete:

| Metric | Current | Target |
|--------|---------|--------|
| Guides with 3+ SVGs | ~12 (4%) | 268 (100%) |
| Guides with 8+ sections | ~50 (19%) | 268 (100%) |
| Average SVGs per guide | 2.3 | 4.0+ |
| Guides with .warning block | ~160 (60%) | 268 (100%) |
| Guides with .related links | ~200 (75%) | 268 (100%) |
| Guides with step-by-step instructions | ~120 (45%) | 268 (100%) |
| Total SVG diagrams | 611 | 1,200+ |
