# Zero to Hero Compendium — Content Gap Implementation Plan

**Date:** February 2026
**Source:** ZTH Content Gap Analysis 2026
**Scope:** All 3 tiers (37 new guides) + 12 guide expansions + scavenging gaps
**Current State:** 290 guides | 19 categories | Cache v16 | Highest guide ID: GD-267
**Scavenging Status:** All 12 scavenging guides (GD-256–GD-267) already implemented — see notes at sections 2.11, 2.12, and 3.2

---

## How to Use This Plan

Each gap from the analysis is mapped to concrete file-level changes following the **new-topic skill**. Gaps fall into three implementation types:

- **New Guide (existing category)** — add guide HTML + `guides.json` entry + rebuild search index + bump SW cache
- **Expansion (existing guide)** — edit existing HTML file + update `guides.json` metadata (word count, reading time) + rebuild search index + bump SW cache
- **New Category** — full skill procedure (cards.js, progress-viz.js, index.html TOC, new-guide.js, achievements.js, guides.json, guide HTMLs, search index, validation, SW cache)

The plan is ordered by implementation phase to minimize rework and maximize the value of each deploy.

---

## Phase 0: Pre-Work — Fix Known Issues

Before adding anything, fix the existing categoryOrder drift documented in the new-topic skill.

### 0.1 Sync categoryOrder Arrays

**cards.js** order (current canonical):
```
zth-modules, survival, medical, agriculture, building, crafts, metalworking,
communications, defense, sciences, chemistry, power-generation, transportation,
society, resource-management, salvage, tools, reference, specialized
```

**progress-viz.js** order (currently different — has `society` before `metalworking`, `metalworking` after `chemistry`):
```
zth-modules, survival, medical, agriculture, building, crafts, communications,
defense, sciences, chemistry, society, metalworking, power-generation,
transportation, resource-management, tools, salvage, reference, specialized
```

**Action:** Update `progress-viz.js` lines 249–269 to match `cards.js` order exactly. This is the foundation for all subsequent category additions.

### 0.2 Update new-guide.js categoryIcons

The `scripts/new-guide.js` `categoryIcons` map only has 14 generic entries and is missing most actual app categories. Before adding new guides at scale, update it to include all 19 current categories plus any new ones.

**Files changed:** `scripts/new-guide.js`

---

## Phase 1: Tier 1 — Critical Gaps (Guides 1–5)

These prevent deaths or community failure. All fit within existing categories — **no new categories needed**.

### 1.1 Public Health Systems & Epidemiology

| Field | Value |
|-------|-------|
| **Guide ID** | GD-268 |
| **Category** | `medical` (existing — 38 guides) |
| **File** | `guides/public-health-epidemiology.html` |
| **Difficulty** | Advanced |
| **Tags** | `critical`, `new`, `human` |

**Content sections:** Disease surveillance & outbreak detection, quarantine systems & isolation protocols, community water testing programs, vaccination campaign logistics, sanitation inspector role & protocols, vital statistics & mortality tracking, vector control at community scale.

**Implementation type:** New Guide (existing category)

**Files to change:**
1. `guides/public-health-epidemiology.html` — create new guide HTML
2. `data/guides.json` — add entry with `"category": "medical"`
3. `scripts/build-search-index.js` — run rebuild
4. `sw.js` — bump `CACHE_VERSION` (defer to end of phase)

---

### 1.2 Infant & Child Care (Birth to Age 5)

| Field | Value |
|-------|-------|
| **Guide ID** | GD-269 |
| **Category** | `medical` |
| **File** | `guides/infant-child-care.html` |
| **Difficulty** | Intermediate |
| **Tags** | `critical`, `new`, `essential`, `human` |

**Content sections:** Breastfeeding support & lactation failure (including wet-nursing systems), oral rehydration therapy (ORT) for infants, infant feeding & weaning nutrition, childhood illness recognition & response, neonatal danger signs, child-safe shelter & injury prevention, improvised infant formula & milk substitutes.

**Implementation type:** New Guide (existing category)

**Files to change:** Same pattern as 1.1 — guide HTML + guides.json + search index.

---

### 1.3 Community Water Distribution Systems

| Field | Value |
|-------|-------|
| **Guide ID** | GD-270 |
| **Category** | `building` (existing — 16 guides) |
| **File** | `guides/water-distribution-systems.html` |
| **Difficulty** | Advanced |
| **Tags** | `critical`, `new`, `rebuild` |

**Content sections:** Gravity-fed water distribution design, water tower construction & sizing, pipe material selection & joining, distribution network layout, community water point design, water system maintenance & repair, greywater separation & reuse systems.

**Implementation type:** New Guide (existing category)

**Files to change:** Guide HTML + guides.json + search index.

---

### 1.4 Conflict Resolution & Inter-Community Diplomacy

| Field | Value |
|-------|-------|
| **Guide ID** | GD-271 |
| **Category** | `society` (existing — 18 guides) |
| **File** | `guides/conflict-resolution-diplomacy.html` |
| **Difficulty** | Advanced |
| **Tags** | `critical`, `new`, `human` |

**Content sections:** Inter-community negotiation & treaty-making, resource-sharing agreements (water, land, game), trade route establishment & protection, conflict mediation & arbitration, alliance & mutual defense pacts, hostage/prisoner protocols, refugee & migration management.

**Implementation type:** New Guide (existing category)

**Files to change:** Guide HTML + guides.json + search index.

---

### 1.5 Family Planning & Population Genetics

| Field | Value |
|-------|-------|
| **Guide ID** | GD-272 |
| **Category** | `medical` |
| **File** | `guides/family-planning-population.html` |
| **Difficulty** | Intermediate |
| **Tags** | `critical`, `new`, `essential`, `human` |

**Content sections:** Natural & barrier contraception methods, minimum viable population genetics, fertility tracking & natural family planning, herbal contraceptives & abortifacients (safety-focused), population-to-resource carrying capacity.

**Implementation type:** New Guide (existing category)

**Files to change:** Guide HTML + guides.json + search index.

---

### Phase 1 Deploy Checklist

After creating all 5 Tier 1 guides:

- [ ] Run `node scripts/build-search-index.js`
- [ ] Run `node scripts/validate.js` — fix any errors
- [ ] Bump `sw.js` `CACHE_VERSION` from `'v16'` to `'v17'`
- [ ] Run `npm run build`
- [ ] Verify: new guides appear under correct category sections, search finds them, mark-as-read works

---

## Phase 2: Tier 2 — Progression Bottlenecks (Guides 6–17)

### 2.1 Fiber to Fabric Pipeline

| Field | Value |
|-------|-------|
| **Guide ID** | GD-273 |
| **Category** | `crafts` (existing — 30 guides) |
| **File** | `guides/fiber-to-fabric-pipeline.html` |
| **Difficulty** | Advanced |
| **Tags** | `new`, `rebuild`, `essential` |

**Content:** Unified pipeline from growing fiber crops through retting, spinning, weaving, cutting, and sewing into garments. Yield calculations (acres of flax needed per person per year). Connects agriculture → fiber processing → spinning → weaving → garment construction.

**Cross-references:** Should link to `textiles.html`, `agriculture.html`, `basketry-cordage.html`, `dyeing-pigments.html`

---

### 2.2 Labor Organization & Large-Scale Projects

| Field | Value |
|-------|-------|
| **Guide ID** | GD-274 |
| **Category** | `society` |
| **File** | `guides/labor-organization.html` |
| **Difficulty** | Intermediate |
| **Tags** | `new`, `rebuild` |

**Content:** Work crew organization, task scheduling without clocks, fair labor rotation systems, project estimation (person-hours for common tasks), incentive structures, managing volunteer vs corvée labor.

---

### 2.3 Mechanical Advantage in Construction

| Field | Value |
|-------|-------|
| **Guide ID** | GD-275 |
| **Category** | `building` |
| **File** | `guides/mechanical-advantage-construction.html` |
| **Difficulty** | Intermediate |
| **Tags** | `new`, `rebuild` |

**Content:** Practical crane/derrick construction, block-and-tackle rigging, A-frame lifting, log rolling and skidding, earthen ramp construction, scaffold design and safety.

**Cross-references:** Links to `physics-machines.html`, `construction.html`, `knots-rigging.html`

---

### 2.4 Regional Climate Agriculture

| Field | Value |
|-------|-------|
| **Guide ID** | GD-276 |
| **Category** | `agriculture` (existing — 34 guides) |
| **File** | `guides/regional-climate-agriculture.html` |
| **Difficulty** | Intermediate |
| **Tags** | `new`, `essential` |

**Content:** Climate-zone framework covering temperate continental, subtropical, arid/semi-arid, maritime, tropical, and cold/boreal zones. Crop calendars, variety recommendations, season-extension techniques per zone.

---

### 2.5 Waste Management & Recycling Systems

| Field | Value |
|-------|-------|
| **Guide ID** | GD-277 |
| **Category** | `resource-management` (existing — 4 guides) |
| **File** | `guides/waste-management-recycling.html` |
| **Difficulty** | Intermediate |
| **Tags** | `new`, `rebuild` |

**Content:** Community composting operations, ash utilization (lye, fertilizer, ceramics flux), textile rag recycling, metal scrap collection, construction debris sorting, animal waste management, community-scale refuse organization.

---

### 2.6 Food Distribution & Community Feeding

| Field | Value |
|-------|-------|
| **Guide ID** | GD-278 |
| **Category** | `agriculture` |
| **File** | `guides/food-distribution-community-feeding.html` |
| **Difficulty** | Intermediate |
| **Tags** | `new`, `essential`, `human` |

**Content:** Communal kitchen setup and management, bulk cooking for 50–500 people, fair distribution systems (ration cards, needs-based allocation), seasonal menu planning from stored foods, special dietary needs management.

**Cross-references:** Links to `food-rationing.html`, `food-preservation.html`

---

### 2.7 Animal-Powered Machinery

| Field | Value |
|-------|-------|
| **Guide ID** | GD-279 |
| **Category** | `crafts` |
| **File** | `guides/animal-powered-machinery.html` |
| **Difficulty** | Advanced |
| **Tags** | `new`, `rebuild`, `technology` |

**Content:** Horse mill (whim) construction, animal-powered pump designs, ox-drawn equipment, logging with draft animals, power transmission (gearing, sweeps, treadmills), harness design.

**Cross-references:** Links to `draft-animals.html`, `water-mills-windmills.html`, `physics-machines.html`

---

### 2.8 Tropical & Coastal Survival

| Field | Value |
|-------|-------|
| **Guide ID** | GD-280 |
| **Category** | `survival` (existing — 16 guides) |
| **File** | `guides/tropical-coastal-survival.html` |
| **Difficulty** | Intermediate |
| **Tags** | `new`, `critical`, `essential` |

**Content:** Tropical disease prevention, jungle shelter and movement, tropical food sources, coral reef harvesting, coastal foraging, salt water challenges, hurricane/typhoon preparation, tropical agriculture, venomous creature management.

**Cross-references:** Links to `desert-survival.html`, `high-altitude-living.html`, `marine-biology-ocean.html`

---

### 2.9 Non-Ferrous Metalworking

| Field | Value |
|-------|-------|
| **Guide ID** | GD-281 |
| **Category** | `metalworking` (existing — 5 guides) |
| **File** | `guides/non-ferrous-metalworking.html` |
| **Difficulty** | Advanced |
| **Tags** | `new`, `technology`, `rebuild` |

**Content:** Copper smelting and working, bronze and brass alloying, lead casting, tin extraction, aluminum recovery from salvage, soldering and brazing techniques, non-ferrous heat treatment.

---

### 2.10 Surveying & Land Management

| Field | Value |
|-------|-------|
| **Guide ID** | GD-282 |
| **Category** | `sciences` (existing — 16 guides) |
| **File** | `guides/surveying-land-management.html` |
| **Difficulty** | Intermediate |
| **Tags** | `new`, `rebuild` |

**Content:** Chain/tape surveying, transit/level improvisation, elevation measurement, contour mapping, property boundary establishment, road and building layout, cut-and-fill calculation, land area measurement.

**Cross-references:** Links to `cartography-mapmaking.html`, `mathematics.html`

---

### 2.11 Scavenging Guides — Priority 1 ✅ COMPLETED

> **These guides were implemented ahead of schedule using the Scavenging Content Upgrade Plan.** They were assigned GD-256–258 instead of the originally planned GD-283–285. No further action needed.

| Plan ID | Actual ID | Title | Actual File |
|---------|-----------|-------|-------------|
| ~~GD-283~~ | **GD-256** | Urban Scavenging: Location-by-Location | `guides/urban-scavenging-guide.html` |
| ~~GD-284~~ | **GD-257** | Rural Scavenging: Location-by-Location | `guides/rural-scavenging-guide.html` |
| ~~GD-285~~ | **GD-258** | Salvage-to-Skill Progression Shortcuts | `guides/salvage-progression-shortcuts.html` |

---

### 2.12 Scavenging Guides — Priority 2 ✅ COMPLETED

> **These guides were implemented ahead of schedule using the Scavenging Content Upgrade Plan.** They were assigned GD-259–262 instead of the originally planned GD-286–289. No further action needed.

| Plan ID | Actual ID | Title | Actual File |
|---------|-----------|-------|-------------|
| ~~GD-286~~ | **GD-259** | Building Materials Salvage & Recovery | `guides/building-materials-salvage.html` |
| ~~GD-287~~ | **GD-260** | Food Salvage & Shelf Life Assessment | `guides/food-salvage-shelf-life.html` |
| ~~GD-288~~ | **GD-261** | Time-Decay Priority Framework | `guides/salvage-time-decay-priorities.html` |
| ~~GD-289~~ | **GD-262** | Chemical & Fuel Salvage Safety | `guides/chemical-fuel-salvage.html` |

---

### Phase 2 Deploy Checklist

After creating remaining Tier 2 guides (GD-273 through GD-282):

- [ ] Run `node scripts/build-search-index.js`
- [ ] Run `node scripts/validate.js`
- [ ] Bump `sw.js` `CACHE_VERSION` to `'v17'`
- [ ] Run `npm run build`
- [ ] Verify all new guides appear in correct category sections

---

## Phase 3: Tier 3 — Quality of Life (Guides 18–37)

### 3.1 New Standalone Guides

| Guide ID | Title | Category | File | Difficulty |
|----------|-------|----------|------|------------|
| GD-283 | Personal Hygiene Product Manufacturing | `crafts` | `guides/hygiene-product-manufacturing.html` | Beginner |
| GD-284 | Furniture & Household Goods | `crafts` | `guides/furniture-household-goods.html` | Intermediate |
| GD-285 | Timekeeping Systems | `society` | `guides/timekeeping-systems.html` | Intermediate |
| GD-286 | Musical Instrument Construction | `crafts` | `guides/instrument-construction.html` | Intermediate |
| GD-287 | Disaster Preparedness & Emergency Response | `survival` | `guides/disaster-preparedness.html` | Intermediate |
| GD-288 | Preserving & Teaching History | `society` | `guides/history-preservation.html` | Intermediate |
| GD-289 | Animal-Based Materials Processing | `crafts` | `guides/animal-materials-processing.html` | Intermediate |
| GD-290 | Industrial Fermentation | `chemistry` (existing — 16 guides) | `guides/industrial-fermentation.html` | Advanced |
| GD-291 | Rope & Cordage at Scale | `crafts` | `guides/rope-cordage-scale.html` | Intermediate |
| GD-292 | Community Lighting Systems | `building` | `guides/community-lighting-systems.html` | Intermediate |

**Tags for all:** `new`

### 3.2 Scavenging Guides — Priority 3 ✅ COMPLETED

> **These guides were implemented ahead of schedule using the Scavenging Content Upgrade Plan.** They were assigned GD-263–266 instead of the originally planned GD-300–303. Additionally, **GD-267 (Structural Safety for Building Entry)** was created as a bonus guide not in the original plan. No further action needed.

| Plan ID | Actual ID | Title | Actual File |
|---------|-----------|-------|-------------|
| ~~GD-300~~ | **GD-263** | Textile & Fabric Salvage | `guides/textile-fabric-salvage.html` |
| ~~GD-301~~ | **GD-264** | Tool Restoration from Salvage | `guides/tool-restoration-salvage.html` |
| ~~GD-302~~ | **GD-265** | Plastics, Rubber & Glass Identification | `guides/plastics-rubber-glass-salvage.html` |
| ~~GD-303~~ | **GD-266** | Scavenging Logistics & Team Operations | `guides/scavenging-logistics-team-ops.html` |
| *(not planned)* | **GD-267** | Structural Safety for Building Entry | `guides/structural-safety-building-entry.html` |

### Phase 3 Deploy Checklist

- [ ] Run `node scripts/build-search-index.js`
- [ ] Run `node scripts/validate.js`
- [ ] Bump `sw.js` `CACHE_VERSION` to `'v18'`
- [ ] Run `npm run build`

---

## Phase 4: Expansions to Existing Guides

These are section additions to existing guide HTML files, **not** new standalone guides. Each requires editing the target HTML file and updating word count / reading time in `guides.json`.

| # | Target Guide File | New Section to Add | Priority |
|---|-------------------|--------------------|----------|
| 1 | `guides/governance.html` | Inter-settlement federation models; shared resource governance | High |
| 2 | `guides/economics-trade.html` | Barter-to-currency transition mechanics; counterfeiting prevention | Medium |
| 3 | `guides/construction.html` | Earthquake-resistant techniques; fire-resistant construction; accessibility | High |
| 4 | `guides/electricity.html` | Energy storage beyond batteries (flywheels, compressed air, pumped hydro) | Medium |
| 5 | `guides/transportation.html` | Trail/path construction for foot traffic; bridge load rating for animal/cart | Medium |
| 6 | `guides/sanitation.html` | Community-scale greywater systems; rainwater harvesting for non-potable use | High |
| 7 | `guides/education-teaching.html` | Literacy campaigns for adults; multi-language community communication | Medium |
| 8 | `guides/navigation.html` | Operational community timekeeping (bell schedules, shift management) | Low |
| 9 | `guides/veterinary.html` | Disease transmission from animals to humans (expanded zoonotic focus) | Medium |
| 10 | `guides/mental-health-counseling.html` | Long-term PTSD management for collapse survivors; community trauma processing | High |
| 11 | `guides/food-preservation.html` | Root cellar design by climate zone; community-scale food storage facilities | Medium |
| 12 | `guides/telecommunications.html` | Community PA/announcement systems; warning sirens from salvaged materials | Medium |

### Expansion Implementation Pattern

For each expansion:

1. Read the existing guide HTML file
2. Add new `<section>` block(s) after the relevant existing content — following the existing guide's heading hierarchy and CSS conventions (`info-box`, `step-by-step`, etc.)
3. Add any new TOC entries within the guide's internal table of contents
4. Update `data/guides.json`: revise `wordCount`, `readingTime`, `lastUpdated`, and `version`
5. Add `updated` tag if not already present

### Phase 4 Deploy Checklist

- [ ] Run `node scripts/build-search-index.js`
- [ ] Run `node scripts/validate.js`
- [ ] Bump `sw.js` `CACHE_VERSION` to `'v19'`
- [ ] Run `npm run build`

---

## Files Changed Summary

### Every New Guide Touches These Files

| File | Change |
|------|--------|
| `guides/<slug>.html` | New file — full guide HTML |
| `data/guides.json` | New entry object |

### Per-Phase Infrastructure Changes

| File | Phase 0 | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|------|---------|---------|---------|---------|---------|
| `js/progress-viz.js` categoryOrder | Fix sync | — | — | — | — |
| `scripts/new-guide.js` categoryIcons | Update all | — | — | — | — |
| `sw.js` CACHE_VERSION | — | v17 | v18 | v19 | v20 |
| Search index rebuild | — | Yes | Yes | Yes | Yes |
| Validation run | — | Yes | Yes | Yes | Yes |
| `npm run build` | — | Yes | Yes | Yes | Yes |

### No New Categories Required

All 37 new guides and 12 expansions fit within the existing 19 categories. The gap analysis confirmed this — no new category needs to be created. The distribution of new content across categories:

| Category | Current Guides | New Guides Added | Expansions |
|----------|---------------|-----------------|------------|
| `medical` | 38 | +3 (public health, infant care, family planning) | +1 (mental health PTSD) |
| `building` | 16 | +2 (water distribution, mechanical advantage) | +1 (earthquake/fire-resistant) |
| `society` | 18 | +3 (conflict resolution, labor org, timekeeping, history) | +1 (governance federation) |
| `crafts` | 30 | +5 (fiber pipeline, animal machinery, hygiene, furniture, instruments, animal materials, rope) | — |
| `agriculture` | 34 | +2 (regional climate, food distribution) | +1 (food preservation) |
| `survival` | 16 | +2 (tropical/coastal, disaster preparedness) | — |
| `salvage` | 15 → 27 | ~~+8~~ **+12 (already done: GD-256–267)** | — |
| `metalworking` | 5 | +1 (non-ferrous) | — |
| `sciences` | 16 | +1 (surveying) | — |
| `chemistry` | 16 | +1 (industrial fermentation) | — |
| `resource-management` | 4 | +1 (waste management) | — |
| `power-generation` | 7 | — | +1 (energy storage) |
| `transportation` | 7 | — | +1 (trail/bridge) |
| `communications` | 13 | — | +1 (PA systems) |

**Post-implementation totals:** 290 (current, with scavenging done) → 315 guides (+25 remaining new guides from Phases 1–3)

---

## Guide ID Assignment Reference (Updated)

| Range | Phase | Content | Status |
|-------|-------|---------|--------|
| GD-256 – GD-267 | *(pre-phase)* | 12 scavenging guides | ✅ Complete |
| GD-268 – GD-272 | Phase 1 (Tier 1) | 5 critical gap guides | Pending |
| GD-273 – GD-282 | Phase 2 (Tier 2) | 10 bottleneck guides | Pending |
| GD-283 – GD-292 | Phase 3 (Tier 3) | 10 quality-of-life guides | Pending |

> **Note:** Phase 3 guide IDs have been renumbered from the original GD-290–303 range to GD-283–292, since the scavenging guides that were originally planned for GD-283–289 and GD-300–303 were implemented early as GD-256–267.

---

## Recommended Implementation Order Within Each Phase

**Phase 1 priority order** (by "deaths prevented" impact):
1. GD-269 — Infant & Child Care (historical #1 killer)
2. GD-268 — Public Health & Epidemiology (epidemic prevention)
3. GD-270 — Water Distribution (waterborne disease)
4. GD-272 — Family Planning (resource collapse prevention)
5. GD-271 — Conflict Resolution (warfare prevention)

**Phase 2 priority order** (by phase alignment — earliest-needed first):
1. GD-280 — Tropical/Coastal Survival (Phase 1)
2. GD-276 — Regional Climate Agriculture (Phase 2)
3. GD-277 — Waste Management (Phase 2)
4. GD-273 — Fiber to Fabric (Phase 2–3)
5. GD-274 — Labor Organization (Phase 2–3)
6. GD-275 — Mechanical Advantage (Phase 2–3)
7. GD-282 — Surveying (Phase 2–3)
8. GD-278 — Food Distribution (Phase 1–2)
9. GD-279 — Animal-Powered Machinery (Phase 3–4)
10. GD-281 — Non-Ferrous Metalworking (Phase 3–4)

---

## Validation & Testing Protocol

After each phase deploy, verify:

1. Every new guide appears under its correct category section on the main page
2. TOC links scroll to the correct section (no new TOC entries needed since no new categories)
3. Search returns results for new guide titles and key terms
4. Guide pages load correctly with proper styling (back link, theme toggle, mark-as-read)
5. Progress visualization shows updated guide counts per category
6. Achievements still calculate correctly (existing category achievements auto-count new guides)
7. `node scripts/validate.js` passes with zero errors
