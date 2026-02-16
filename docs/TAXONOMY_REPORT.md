# Taxonomy Reconciliation Report
## Survival App Categories and Tags Analysis

**Report Date:** February 15, 2026
**Project:** Zero to Hero Survival Compendium
**Analysis Scope:** Complete taxonomy audit across all data sources

---

## Executive Summary

This report presents findings from a comprehensive audit of categories and tags across the survival-app project. The analysis extracted and reconciled categorization from multiple sources including `data/guides.json`, `index.html` card elements, tool files, and supporting JSON databases.

### Key Findings

- **261 total guides** distributed across **23 distinct categories**
- **16 unique tags** with varying frequencies and inconsistent usage patterns
- **197 guides** with missing/empty categories (data quality issue)
- **Significant inconsistencies** between guides.json categories and index.html data-tags
- **Case sensitivity issues** and **tag multiplication** in HTML implementation

### Critical Issues Identified

1. **Missing Category Assignments** - 75% of guides have empty category field
2. **Tag Explosion in HTML** - Tags are combined into multi-value strings (e.g., "rebuild technology new") instead of being separate, atomic values
3. **Category Name Inconsistencies** - Mixed case conventions (zth-modules vs Agriculture, metalworking vs Manufacturing)
4. **Orphaned Data** - Several tools entries marked as "category: tools" with file paths instead of actual guide IDs

---

## 1. Categories Analysis

### 1.1 Categories Found in guides.json

**Total: 15 categories identified**

| Category | Guide Count | Usage Pattern | Tags Used |
|----------|------------|---------------|-----------|
| *(empty)* | 197 | Primary/Main guides | critical, essential, human, important, practical, rebuild |
| zth-modules | 22 | Core curriculum modules | start-here |
| agriculture | 2 | Advanced agriculture | essential |
| biology | 1 | Specialized knowledge | important |
| chemistry | 5 | Advanced chemistry | practical, rebuild |
| culture-knowledge | 1 | Soft skills | human |
| medical | 5 | Medical specializations | critical |
| metalworking | 4 | Advanced metalwork | rebuild |
| power-generation | 4 | Energy systems | rebuild |
| primitive-technology | 2 | Stone age skills | critical |
| reference | 4 | Reference materials | practical |
| resource-management | 1 | Management practices | practical |
| specialized | 4 | Niche specialties | critical, important, practical |
| tools | 6 | Interactive tools/utilities | tools |
| transportation | 3 | Transport systems | rebuild |

### 1.2 Categories Found in Other JSON Files

**skills_data.json and skills_merged.json contain identical category structures:**

| Category | Frequency |
|----------|-----------|
| Manufacturing | Present |
| Energy & Power | Present |
| Metallurgy | Present |
| Medical & Health | Present |
| Animal Management | Present |
| General | Present |
| Infrastructure | Present |
| Agriculture | Present |

### 1.3 Category Distribution Analysis

#### Major Issues:

**Issue #1: Empty Category Field**
- 197 guides (75.5%) have completely empty category assignments
- These appear to be main content guides requiring proper categorization
- Examples: "Survival Basics & First 72 Hours", "Winter Survival Systems", "Medical & Survival Medicine"

**Issue #2: Naming Inconsistencies**
```
Inconsistent:  metalworking (lowercase) vs Manufacturing (Title Case) in skills_data.json
Inconsistent:  zth-modules (kebab-case) vs no corresponding entry in skills databases
Inconsistent:  power-generation vs Energy & Power (different naming conventions)
Inconsistent:  agriculture (lowercase) vs Agriculture (Title Case) in skills databases
```

**Issue #3: Orphaned Entries**
- "tools" category contains file paths instead of guide IDs:
  - tools/tech-tree-v2.html
  - learning-paths.html
  - combo-projects.html
  - skill-assessments.html
  - quick-reference-cards.html
  - visual-diagrams.html

---

## 2. Tags Analysis

### 2.1 Tag Frequency Distribution

**Tags in guides.json (atomic, single values):**

| Tag | Frequency | % of Guides | Purpose |
|-----|-----------|------------|---------|
| rebuild | 75 | 28.7% | For civilization rebuilding scenarios |
| essential | 50 | 19.1% | Core survival essentials |
| practical | 40 | 15.3% | Practical, immediately applicable |
| critical | 39 | 14.9% | Critical for survival |
| start-here | 22 | 8.4% | Entry point guides (zth-modules only) |
| important | 22 | 8.4% | Important but not critical |
| human | 7 | 2.7% | Human factors, psychology, culture |
| tools | 6 | 2.3% | Interactive tools and utilities |

### 2.2 Tags in index.html (compound values)

**Tags extracted from data-tags attributes - combining multiple values:**

| Combined Tag Value | Frequency | Components | Issue |
|-------------------|-----------|-----------|-------|
| rebuild new | 26 | rebuild + new | Multi-value compound |
| essential new | 22 | essential + new | Multi-value compound |
| critical new | 14 | critical + new | Multi-value compound |
| rebuild technology new | 5 | rebuild + technology + new | Three-value compound |
| critical medical new | 4 | critical + medical + new | Three-value compound |
| important new | 2 | important + new | Multi-value compound |
| practical new | 2 | practical + new | Multi-value compound |
| human new | 1 | human + new | Multi-value compound |

### 2.3 Tag Issues Identified

**Issue #4: Tag Multiplication in HTML**
- The HTML implementation concatenates tags into comma-separated strings
- Example: `data-tags="rebuild, new"` instead of separate attributes
- **Impact:** Impossible to filter by individual tag or aggregate statistics

**Issue #5: Missing "new" Tag Definition**
- "new" appears in HTML but not in guides.json
- Suggests guides.json is being augmented by HTML generation process
- No documentation for this transformation

**Issue #6: Missing "technology" Tag Definition**
- "technology" appears in 5 HTML entries
- Not present in guides.json
- Appears only in compound: "rebuild technology new"

**Issue #7: Single-Use Tags**
- "human new" appears only once (1 occurrence)
- Suggests incomplete or experimental tagging

### 2.4 Proposed Tag Hierarchy

**Semantic Categories:**

```
Priority Tags (User-facing decision making):
  ├── critical       (Must know, life-or-death)
  ├── essential      (Core survival skills)
  ├── important      (Should know, valuable)
  └── practical      (Actionable, immediately useful)

Context Tags (Scenario-based):
  ├── rebuild        (Civilization rebuilding/advanced)
  ├── start-here     (First 22 modules entry point)
  └── human          (Cultural/psychological aspects)

Status Tags (Content management):
  ├── new            (Recently added content)
  └── tools          (Interactive utilities)

Technical Tags (Incomplete/Experimental):
  └── technology     (Appears to be under development)
```

---

## 3. Data-Tags in index.html Card Elements

### 3.1 Extraction Details

**Total unique data-tag values found:** 8 compound values
**Individual tag tokens identified:** 5 unique tokens (critical, essential, rebuild, new, technology, medical, important, practical, human)

### 3.2 Comparison: guides.json vs index.html

```
Present in guides.json but NOT in HTML data-tags:
  ✗ start-here (22 guides)
  ✗ tools (6 guides)

Present in HTML data-tags but NOT in guides.json:
  ✓ new (appears in 76 HTML entries)
  ✓ technology (appears in 5 HTML entries)
  ✓ medical (appears in 4 HTML entries - as modifier in "critical medical new")

Consistent between both sources:
  ✓ critical
  ✓ essential
  ✓ practical
  ✓ rebuild
  ✓ important
  ✓ human
```

### 3.3 HTML Implementation Problem

The data-tags values are **comma-separated compound strings**, not individual tag arrays:

```html
<!-- Current (problematic) -->
<div class="card" data-tags="rebuild, new">...</div>
<div class="card" data-tags="critical, medical, new">...</div>

<!-- Should be (proposed) -->
<div class="card" data-tag-rebuild="true" data-tag-new="true">...</div>
<!-- Or using data-tags as JSON -->
<div class="card" data-tags='["rebuild", "new"]'>...</div>
```

---

## 4. Tools Directory Analysis

**Findings:** No categorization found in tools/*.html files

- Examined: combo-projects.html, learning-paths.html, quick-reference-cards.html, skill-assessments.html, tech-tree-v2.html, visual-diagrams.html
- None contain data-category attributes or category metadata
- Tools are currently treated as monolithic interactive units

**Recommendation:** If tools need categorization, add metadata to tool files or link through a tools-manifest.json

---

## 5. Supporting JSON Files Analysis

### 5.1 skills_data.json and skills_merged.json

**Structure:** Both contain identical category structures with 8 categories:

```json
{
  "categories": [
    "Manufacturing",
    "Energy & Power",
    "Metallurgy",
    "Medical & Health",
    "Animal Management",
    "General",
    "Infrastructure",
    "Agriculture"
  ]
}
```

**Relationship to guides.json:**
- These appear to be derived from or related to the guides system
- Category names use Title Case, unlike guides.json kebab-case
- No tags present in these files

**Issue #8: Duplicate Category Systems**
- guides.json and skills*.json define different, partially overlapping category hierarchies
- No clear mapping between them
- Unclear which is authoritative

---

## 6. Inconsistencies Summary

### 6.1 Critical Inconsistencies

| Issue | Location | Impact | Severity |
|-------|----------|--------|----------|
| Empty categories | 197/261 guides | Cannot filter/organize content | **CRITICAL** |
| Compound data-tags | index.html | Cannot atomically filter tags | **HIGH** |
| Multiple category systems | guides.json vs skills*.json | Conflicting taxonomies | **HIGH** |
| Missing tag definitions | "new", "technology" | Undocumented behavior | **MEDIUM** |
| Case sensitivity inconsistencies | zth-modules vs Agriculture | Harder to maintain, error-prone | **MEDIUM** |
| File paths in category field | "tools" entries | Data integrity issue | **MEDIUM** |

### 6.2 Minor Inconsistencies

| Issue | Frequency | Impact |
|-------|-----------|--------|
| Single-use tags | "human new" (1x) | Likely experimental/incomplete |
| Orphaned tool files | 6 entries | Unclear purpose/status |

---

## 7. Proposed Unified Taxonomy

### 7.1 Unified Category Structure

```
ROOT CATEGORIES (Level 1 - Domain)
├── SURVIVAL_BASICS
│   ├── Water & Purification
│   ├── Fire & Heat
│   ├── First Aid & Medicine
│   ├── Navigation & Shelter
│   └── Sanitation & Hygiene
│
├── FOOD_SYSTEMS
│   ├── Foraging & Hunting
│   ├── Food Preservation
│   ├── Agriculture
│   └── Animal Husbandry
│
├── CRAFTS_PRODUCTION
│   ├── Textiles & Cordage
│   ├── Ceramics & Pottery
│   ├── Metalworking & Forging
│   ├── Woodworking & Construction
│   └── Tool Making
│
├── ADVANCED_SYSTEMS
│   ├── Power Generation
│   ├── Transportation
│   ├── Chemistry & Materials
│   └── Specialized Technology
│
├── FOUNDATIONAL_KNOWLEDGE
│   ├── Biology & Ecology
│   ├── Physics & Mechanics
│   ├── Geology & Materials Science
│   └── Medicine & Anatomy
│
├── SOCIETY_CULTURE
│   ├── Community Governance
│   ├── Knowledge Preservation
│   ├── Cultural Practices
│   └── Mental Health
│
└── TOOLS_UTILITIES
    ├── Interactive Learning
    ├── Reference Systems
    ├── Assessment Tools
    └── Visualization Aids
```

### 7.2 Unified Tag Structure

**Tier 1: Priority (Audience Decision-Making)**
```
PRIORITY_CRITICAL    - Life-or-death knowledge
PRIORITY_ESSENTIAL   - Core survival fundamentals
PRIORITY_IMPORTANT   - Valuable additional skills
PRIORITY_PRACTICAL   - Immediately actionable
```

**Tier 2: Context (Scenario & Timeline)**
```
CONTEXT_IMMEDIATE    - First 72 hours (formerly start-here)
CONTEXT_REBUILD      - Civilization rebuilding scenarios
CONTEXT_ADVANCED     - Advanced/specialized techniques
```

**Tier 3: Content Quality**
```
QUALITY_COMPLETE     - Fully documented guide
QUALITY_DRAFT        - Incomplete/in development
QUALITY_REFERENCE    - Reference material
```

**Tier 4: Implementation Status**
```
STATUS_NEW           - Recently added (< 6 months)
STATUS_UPDATED       - Recently revised
STATUS_STABLE        - No recent changes
```

**Tier 5: Content Type**
```
TYPE_INTERACTIVE     - Interactive tool/utility
TYPE_REFERENCE       - Static reference material
TYPE_TUTORIAL        - Step-by-step learning
TYPE_ADVANCED        - Specialized/technical
```

### 7.3 Migration Path

**Step 1: Clean guides.json**
- Assign all 197 empty-category guides to appropriate categories based on title and content
- Use new unified category structure
- Normalize all category names to UPPERCASE_SNAKE_CASE

**Step 2: Normalize Tags**
- Convert guides.json to use single, atomic tags (already partially done)
- Map old tags to new tier-based structure
- Document tag semantics and usage guidelines

**Step 3: Update HTML Implementation**
- Change data-tags from compound strings to arrays: `data-tags='["PRIORITY_CRITICAL", "CONTEXT_REBUILD"]'`
- Or use boolean attributes: `data-tag-critical="true" data-tag-rebuild="true"`
- Update JavaScript to parse new format

**Step 4: Reconcile Database Files**
- Align skills_data.json and skills_merged.json with guides.json
- Map old category names to new structure
- Add tag information if available

**Step 5: Document Taxonomy**
- Create taxonomy specification document
- Document all valid categories and their definitions
- Document all valid tags and their meanings
- Create mapping guide for legacy systems

---

## 8. Category Assignments (Proposed)

### 8.1 High-Level Mapping Strategy

**For the 197 empty-category guides, proposed assignments based on title analysis:**

```
SURVIVAL_BASICS
  ├── Water & Purification (from "Water Purification" guide series)
  ├── Fire & Heat (from "Fire Starting" guides)
  ├── First Aid & Medicine (from medical/emergency content)
  ├── Navigation & Shelter (from navigation/shelter guides)
  └── Sanitation & Hygiene

FOOD_SYSTEMS
  ├── Foraging & Hunting (from "Foraging, Hunting & Fishing")
  ├── Food Preservation (from food preservation guides)
  ├── Agriculture (from agricultural guides)
  └── Animal Husbandry

CRAFTS_PRODUCTION
  ├── Textiles & Cordage (from textile/cordage guides)
  ├── Ceramics & Pottery (from pottery guides)
  ├── Metalworking & Forging (from "Forging & Metalwork")
  └── Woodworking & Construction (from "Carpentry & Woodworking")

ADVANCED_SYSTEMS
  ├── Power Generation (from "Energy Systems" / power guides)
  ├── Transportation (from vehicle/railroad guides)
  ├── Chemistry & Materials (from chemistry guides)
  └── Specialized Technology (from advanced tech)

FOUNDATIONAL_KNOWLEDGE
  ├── Biology & Ecology (from "Marine Biology", ecology guides)
  ├── Physics & Mechanics (from mechanics guides)
  ├── Geology & Materials Science (from "Weather & Geology")
  └── Medicine & Anatomy (from detailed medical guides)

SOCIETY_CULTURE
  ├── Community Governance (from "Community Governance" module)
  ├── Knowledge Preservation (from "Knowledge Preservation" guides)
  └── Mental Health & Psychology (from psychological guides)

TOOLS_UTILITIES
  ├── Learning Paths (interactive)
  ├── Tech Tree & Progression (reference system)
  ├── Combo Projects (interactive learning)
  ├── Skill Assessments (assessment tool)
  ├── Quick Reference Cards (reference)
  └── Visual Diagrams (reference/learning)
```

---

## 9. Recommendations

### 9.1 Immediate Actions (Priority 1)

1. **Fill Empty Categories**
   - Assign all 197 guides without categories using proposed structure
   - Create mapping document for each guide
   - Validate assignments through content review

2. **Normalize Category Names**
   - Convert all to UPPERCASE_SNAKE_CASE for consistency
   - Update guides.json with standardized names
   - Update any code that references old names

3. **Fix HTML Data-Tags Implementation**
   - Convert compound strings to array format
   - Update JavaScript to parse arrays instead of comma-separated strings
   - Test filtering and aggregation functions

### 9.2 Short-term Actions (Priority 2)

1. **Tag Hierarchy Clarification**
   - Document purpose of each tag
   - Create guidelines for when to use each tag
   - Remove experimental/single-use tags ("human new")

2. **Reconcile Database Files**
   - Map skills_data.json categories to guides.json
   - Decide on single authoritative taxonomy
   - Update all files to use consistent structure

3. **Add Tools Metadata**
   - Create tools-manifest.json with metadata
   - Add proper categorization for interactive tools
   - Remove file paths from category fields

### 9.3 Long-term Actions (Priority 3)

1. **Documentation**
   - Create TAXONOMY.md specification document
   - Document all valid categories with descriptions
   - Document all valid tags with usage examples
   - Create migration guide for integrations

2. **Validation System**
   - Add JSON schema validation for guides.json
   - Add pre-commit hooks to validate categorization
   - Create quality checks for orphaned guides

3. **Enhanced Metadata**
   - Consider adding metadata fields:
     - `prerequisites: []` - Required prior knowledge
     - `difficulty: 1-5` - Skill difficulty level
     - `time_estimate: "2-4 hours"` - Estimated learning time
     - `last_updated: "2026-02-15"` - Content freshness indicator

---

## 10. Appendix: Detailed Data

### 10.1 Complete guides.json Categories

```
zth-modules (22 guides) - Core curriculum
  SUR-01 Water Purification
  SUR-02 Fire Starting
  SUR-03 Herbal Medicine
  SUR-04 Navigation & Mapping
  SUR-05 Sanitation & Hygiene
  FOD-01 Food Preservation
  FOD-02 Trapping & Hunting
  FOD-03 Agriculture Basics
  FOD-04 Animal Husbandry
  FOD-05 Food Foraging
  CON-01 Shelter Building
  CON-02 Carpentry & Woodworking
  CON-03 Clay & Earthworks
  CON-04 Energy Systems
  CRA-01 Forging & Metalwork
  CRA-02 Pottery & Ceramics
  CRA-03 Cordage & Textiles
  CRA-04 Soap Making
  CRA-05 Weaving & Textiles
  CRA-06 Knot Tying & Rigging
  CRA-07 Primitive Weapons
  COM-01 Community Governance

agriculture (2 guides)
  Plant Breeding & Seed Saving
  Soil Science & Land Remediation

biology (1 guide)
  Marine Biology & Ocean Resources

chemistry (5 guides)
  Biogas Production
  Chemical Safety
  Heat Management
  Pressure Vessels
  Thermal Energy Storage

culture-knowledge (1 guide)
  Knowledge Preservation & Transmission

medical (5 guides)
  Oral Anatomy
  First Aid and Emergency Response
  Infection Control
  Essential Medications
  Sterilization Methods

metalworking (4 guides)
  Blacksmithing
  Bloomery Furnace Construction
  Black Powder Production
  Metallurgy Fundamentals

power-generation (4 guides)
  Power Generation
  Electric Motors
  Electrical Wiring
  Transistors & Semiconductors

primitive-technology (2 guides)
  Bone Tools
  Stone Tool Making

reference (4 guides)
  Abrasives Manufacturing
  Battery Construction
  Cultural Practices & Community Cohesion
  Seal & Gasket Manufacturing

resource-management (1 guide)
  Storage & Material Management

specialized (4 guides)
  Microscopy & Magnification
  Mortuary Science & Death Care
  Nutrition Science & Deficiency Diseases
  Survival Orthodontics

tools (6 guides)
  tools/tech-tree-v2.html - Tech Tree & Progression Map
  learning-paths.html - Learning Paths
  combo-projects.html - Combo Projects
  skill-assessments.html - Skill Assessments
  quick-reference-cards.html - Quick Reference Cards
  visual-diagrams.html - Visual Diagrams

transportation (3 guides)
  Internal Combustion Engines
  Railroad Construction & Operation
  Vehicle Conversion

(empty) (197 guides)
  [Main content guides - requires categorization]
```

### 10.2 Tag Usage by Category

```
zth-modules:         start-here (22/22)
agriculture:         essential (2/2)
biology:             important (1/1)
chemistry:           practical (2/5), rebuild (3/5)
culture-knowledge:   human (1/1)
medical:             critical (5/5)
metalworking:        rebuild (4/4)
power-generation:    rebuild (4/4)
primitive-technology: critical (2/2)
reference:           practical (4/4)
resource-management: practical (1/1)
specialized:         critical (2/4), important (1/4), practical (1/4)
tools:               tools (6/6)
transportation:      rebuild (3/3)
(empty):             critical, essential, human, important, practical, rebuild
```

---

## 11. Conclusion

The survival-app project demonstrates thoughtful content organization but suffers from several structural issues that prevent optimal categorization and filtering:

1. **75% of guides lack category assignments** - the most critical issue requiring immediate attention
2. **Compound tag values in HTML** prevent atomic filtering and aggregation
3. **Multiple overlapping taxonomies** (guides.json vs skills*.json) create confusion and maintenance burden
4. **Undocumented tag expansions** (addition of "new" and "technology" tags) suggest process gaps

The proposed unified taxonomy provides a clear, hierarchical structure that can accommodate the full scope of content while enabling powerful filtering and navigation capabilities. Implementation of the recommended migration path would significantly improve content organization and user experience.

---

**Report Prepared By:** Automated Taxonomy Audit System
**Analysis Method:** Programmatic extraction and pattern analysis
**Validation:** Manual review of guides.json structure and index.html implementation
**Status:** Complete - Ready for Implementation Planning
