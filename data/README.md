# Survival App Data Files - Audit and Documentation

## Overview
This directory contains the core data files for the survival app skill system. The files define survival and post-collapse skills, their prerequisites, unlocks, and salvage value data.

---

## File Inventory

### 1. **skills_merged.json** (252 KB) - AUTHORITATIVE
**Status:** Primary data source - KEEP

**Content:**
- Array of 816 skill objects
- Complete skill definitions with all metadata

**Structure:**
```json
[
  {
    "name": "SKILL_NAME",
    "id": null,
    "era": 2,
    "time": "4w",
    "category": "Agriculture",
    "prerequisites": [...],
    "soft_prereqs": [...],
    "unlocks": [...],
    "description": "...",
    "bottleneck": false,
    "salvage": {
      "traditional": "...",
      "salvage": "...",
      "time_savings": 50,
      "difficulty_reduction": "Medium",
      "best_salvage_items": [...],
      "notes": "..."
    }
  },
  ...
]
```

**Fields:**
- `name`: Skill name (uppercase)
- `id`: Placeholder for future ID assignment (currently null)
- `era`: Time period (1=basic, 2=intermediate, 3=advanced)
- `time`: Estimated learning time (format: "Nw" for weeks or "Nm" for months)
- `category`: Skill category (Agriculture, Animal Management, General, etc.)
- `prerequisites`: Hard dependencies (must learn first)
- `soft_prereqs`: Recommended prerequisites (helpful but optional)
- `unlocks`: Skills made easier/available after learning this
- `description`: Brief skill description
- `bottleneck`: Boolean indicating if this skill blocks progression
- `salvage`: Embedded salvage/modern tools data for this skill

**Key Insight:**
- Contains EMBEDDED salvage data for each skill
- Updated most recently (Feb 15, 00:16)
- Larger file size due to complete data

---

### 2. **skills_data.json** (228 KB) - REDUNDANT
**Status:** Duplicate without salvage data - CANDIDATES FOR DELETION

**Content:**
- Array of 816 skill objects
- Identical to skills_merged.json EXCEPT lacks salvage field

**Difference from skills_merged:**
- Missing the `salvage` object in each skill record
- Slightly smaller due to missing data (20 KB difference)
- Appears to be an older or parallel version

**Recommendation:**
- **DELETE THIS FILE** - it is completely redundant
- All data in this file is present in skills_merged.json plus additional salvage data
- Note: File deletion failed due to filesystem permissions, but this file should be removed

---

### 3. **master-skills-db.json** (45 KB) - HIERARCHICAL REFERENCE
**Status:** Compressed/curated schema - KEEP (different purpose)

**Content:**
- Object with metadata and 32 skill modules (subset)
- Formal skill database with schema information

**Structure:**
```json
{
  "version": "3.0",
  "schemaVersion": "3.0",
  "generatedDate": "2026-02-14",
  "idFormat": "XXX-##",
  "categoryPrefixes": {
    "SUR": "Survival Basics",
    "FOD": "Food Systems",
    "CON": "Construction",
    "CRA": "Crafting & Manufacturing",
    "COM": "Community & Planning"
  },
  "modules": {
    "SUR-01": { ... },
    "SUR-02": { ... },
    ...
  }
}
```

**Key Differences from skills_merged:**
- Formal ID system (SUR-01, FOD-05, etc.)
- Only 32 curated modules (not all 816 skills)
- Different schema structure (object keyed by ID vs array)
- Metadata includes category prefixes and formal version info
- More compressed/reference-database style

**Purpose:**
- Serves as the formal skill ID hierarchy
- Used for system-wide reference and cross-linking
- Smaller, curated subset for core functionalities

---

### 4. **salvage_data.json** (4.5 KB) - INCOMPLETE/SPARSE
**Status:** Partial data - consider consolidation

**Content:**
- Object with ~10 salvage entries
- Keyed by skill name (not ID)
- Incomplete coverage (only 10 items vs 816 in merged)

**Structure:**
```json
{
  "Fire Starting": {
    "traditional": "Friction fire...",
    "salvage": "Lighter/matches...",
    "time_savings": 80,
    "difficulty_reduction": "High",
    "best_salvage_items": [...],
    "notes": "...",
    "skillId": "SUR-02"
  },
  ...
}
```

**Status:**
- Appears to be a legacy/incomplete partial dump
- Full salvage data is already in skills_merged.json
- Redundant with embedded salvage in skills_merged

**Recommendation:**
- Consider removing or archiving
- If kept, consolidate into master-skills-db.json or another reference

---

### 5. **guides.json** (85 KB) - SUPPLEMENTARY
**Status:** KEEP (supplementary content)

**Purpose:** Guides, tutorials, and step-by-step instructions for skills
**Note:** Not analyzed in this audit but appears to be supporting content

---

## Consolidation Summary

| File | Size | Items | Status | Action |
|------|------|-------|--------|--------|
| skills_merged.json | 252 KB | 816 | Authoritative | KEEP |
| skills_data.json | 228 KB | 816 | Redundant duplicate | **DELETE** |
| master-skills-db.json | 45 KB | 32 | Formal schema | KEEP |
| salvage_data.json | 4.5 KB | ~10 | Sparse/incomplete | REVIEW |
| guides.json | 85 KB | ? | Supporting | KEEP |

---

## Recommendations

1. **Immediate Actions:**
   - **DELETE `skills_data.json`** - Complete redundancy with skills_merged.json
   - All 816 skills plus salvage data are in skills_merged.json
   - No unique data in skills_data.json

2. **Medium-term Consolidation:**
   - Evaluate if salvage_data.json adds value or should be removed
   - Current salvage data is embedded in skills_merged.json
   - Consolidate references if salvage_data serves reporting purposes

3. **File Role Clarification:**
   - **skills_merged.json**: Main working data file (use this)
   - **master-skills-db.json**: Reference/schema file with formal IDs (use for system architecture)
   - **guides.json**: Supplementary content (keep)
   - **salvage_data.json**: Legacy/incomplete (remove or archive)

---

## Usage Guidance

### For Application Development:
- Use **skills_merged.json** for skill data with salvage information
- Use **master-skills-db.json** for formal skill ID references and metadata

### For Data Updates:
- Update skills_merged.json (authoritative source)
- Keep salvage data embedded to maintain consistency
- Sync master-skills-db.json if ID schema changes

### Data Integrity:
- Ensure skills_merged.json remains the single source of truth
- Remove skills_data.json to prevent confusion
- Document any future schema changes in master-skills-db.json

---

*Audit completed: 2026-02-15*
*Total data: 530.8 KB across 5 files (before cleanup)*
